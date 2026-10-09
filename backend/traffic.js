import { fail, text, limit } from './common.js';
export async function recordTraffic(request, env, body, stoneId = null) {
  const viewId = text(body.viewId,80,true);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(viewId)) fail(400,'Invalid view event.');
  if(body.source !== undefined && !['web','qr'].includes(body.source)) fail(400,'Invalid view source.');
  const stone = stoneId ? await env.DB.prepare('SELECT id,name FROM stones WHERE id=?').bind(stoneId).first() : null;
  if(stoneId && !stone) fail(404,'This stone could not be found.');
  await limit(request,env,'views',120);
  const now=new Date().toISOString(),day=now.slice(0,10),target=stoneId?'stone:'+stoneId:'home';
  const events=stoneId?'stone_views':'homepage_views';
  const qr = stone && body.source === 'qr' ? 1 : 0;
  const statements=[env.DB.prepare("INSERT INTO traffic_targets(target,name,kind) VALUES (?,?,?) ON CONFLICT(target) DO UPDATE SET name=excluded.name,deleted=0").bind(target,stone?stone.name:'Homepage',stone?'stone':'home')];
  if(stone) statements.push(env.DB.prepare('UPDATE stones SET views=views+1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM stone_views WHERE id=?)').bind(stoneId,viewId));
  statements.push(env.DB.prepare(`INSERT INTO traffic_daily(day,target,views,qr_views) SELECT ?,?,1,? WHERE NOT EXISTS(SELECT 1 FROM ${events} WHERE id=?) ON CONFLICT(day,target) DO UPDATE SET views=views+1,qr_views=qr_views+excluded.qr_views`).bind(day,target,qr,viewId));
  statements.push(stone ? env.DB.prepare('INSERT INTO stone_views(id,stone_id,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING').bind(viewId,stoneId,now) : env.DB.prepare('INSERT INTO homepage_views(id,created_at) VALUES (?,?) ON CONFLICT(id) DO NOTHING').bind(viewId,now));
  statements.push(env.DB.prepare(`DELETE FROM ${events} WHERE created_at < ?`).bind(new Date(Date.now()-30*86400000).toISOString()));
  await env.DB.batch(statements);
  return stone ? {views:(await env.DB.prepare('SELECT views FROM stones WHERE id=?').bind(stoneId).first()).views} : {ok:true};
}
export async function trafficStatistics(request, env) {
  const period=new URL(request.url).searchParams.get('period') || '30';
  if(!['7','30','90','all'].includes(period)) fail(400,'Choose 7, 30, 90 days or all time.');
  const today=new Date().toISOString().slice(0,10);
  const from=period==='all'?'0000-01-01':new Date(Date.parse(today+'T00:00:00Z')-(Number(period)-1)*86400000).toISOString().slice(0,10);
  const [targets,days,totals,before,meta,earliest]=await env.DB.batch([
    env.DB.prepare('SELECT * FROM traffic_targets ORDER BY kind,name,target'),
    env.DB.prepare('SELECT day,target,views,qr_views AS qrViews FROM traffic_daily WHERE day>=? AND day<=? ORDER BY day,target').bind(from,today),
    env.DB.prepare('SELECT target,SUM(views) AS views,SUM(qr_views) AS qrViews FROM traffic_daily GROUP BY target'),
    env.DB.prepare('SELECT target,SUM(views) AS views FROM traffic_daily WHERE day<? GROUP BY target').bind(from),
    env.DB.prepare("SELECT key,value FROM traffic_meta WHERE key IN ('started_at','qr_started_at')"),
    env.DB.prepare('SELECT MIN(day) AS day FROM traffic_daily'),
  ]);
  const since=meta.results.find(row=>row.key==='started_at').value;
  const first=earliest.results[0].day;
  return {timezone:'UTC',period,since,qrSince:meta.results.find(row=>row.key==='qr_started_at')?.value,range:{from:period==='all'?(first&&first<since?first:since):from,to:today},targets:targets.results.map(t=>({key:t.target,name:t.name,kind:t.kind,deleted:Boolean(t.deleted),baselineViews:t.baseline_views,totalViews:t.baseline_views+(totals.results.find(r=>r.target===t.target)?.views||0),totalQrViews:totals.results.find(r=>r.target===t.target)?.qrViews||0,beforeRange:t.baseline_views+(before.results.find(r=>r.target===t.target)?.views||0)})),days:days.results};
}
