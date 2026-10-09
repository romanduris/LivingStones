import { trafficStatistics } from './traffic.js';
import { fail, sha256, text, requireOrigin, jsonBody, limit } from './common.js';
import { availableImageCount, returnedImageStatements } from './initialization.js';
const hours = 4 * 3600;
function constantEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0; for (let i=0; i<a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function date(value) {
  const v = text(value, 40, true);
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*Z)?$/.test(v) || !Number.isFinite(Date.parse(v))) fail(400, 'Choose a valid date.');
  const result = new Date(v).toISOString();
  if (result.slice(0,10) !== v.slice(0,10) || Date.parse(result) > Date.now()) fail(400, 'Dates must be valid and cannot be in the future.');
  return result;
}
async function session(request, env) {
  const header = request.headers.get('Authorization') || '';
  if (!/^Bearer [a-f0-9]{64}$/.test(header)) fail(401, 'Please sign in to management.');
  const hash = await sha256(header.slice(7));
  const found = await env.DB.prepare('SELECT expires_at FROM admin_sessions WHERE token_hash=?').bind(hash).first();
  if (!found || found.expires_at <= Math.floor(Date.now()/1000)) fail(401, 'Your session expired. Please sign in again.');
  return hash;
}
export async function handleManagement(request, env, listStones) {
  const path = new URL(request.url).pathname.slice('/api/admin/'.length);
  if (path === 'login' && request.method === 'POST') {
    requireOrigin(request, env);
    const body = await jsonBody(request);
    await limit(request, env, 'admin-login', 10);
    if (!env.ADMIN_PASSWORD_HASH) fail(503, 'Management sign-in has not been configured.');
    const hash = await sha256(text(body.password, 128, true));
    if (!constantEqual(hash, env.ADMIN_PASSWORD_HASH)) fail(401, 'That password is not correct.');
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('');
    const expiresAt = Math.floor(Date.now()/1000) + hours;
    await env.DB.batch([
      env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(Math.floor(Date.now()/1000)),
      env.DB.prepare('INSERT INTO admin_sessions(token_hash,expires_at) VALUES (?,?)').bind(await sha256(token), expiresAt),
    ]);
    return { token, expiresAt };
  }
  const tokenHash = await session(request, env);
  if (request.method !== 'GET') requireOrigin(request, env);
  if (path === 'logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM admin_sessions WHERE token_hash=?').bind(tokenHash).run();
    return { ok: true };
  }
  if (path === 'stats' && request.method === 'GET') return trafficStatistics(request, env);
  if (path === 'session' && request.method === 'GET') return { ok: true };
  if (path === 'stones' && request.method === 'GET') return { stones: await listStones(env.DB, null, true), imagesAvailable: await availableImageCount(env.DB) };
  if (['stones','stone-drafts'].includes(path) && request.method === 'POST') {
    const body=await jsonBody(request),note=text(body.note,2000);
    await limit(request, env, 'admin-create-stone', 40);
    const key = request.headers.get('Idempotency-Key');
    if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) fail(400, 'Please retry from the create button.');
    // Stable retries keep the same stone, verification code and printable label.
    const id = 'S' + (await sha256('stone-id:' + key)).slice(0,16).toUpperCase();
    const digest = await sha256('stone-code:' + env.ADMIN_PASSWORD_HASH + ':' + key);
    const code = String(parseInt(digest.slice(0,8),16) % 10000).padStart(4,'0');
    if(path==='stone-drafts') {
      return { draft:true, code, stone:{id,name:'New stone',creator:'',started:'',image:'brand-stone.svg',theme:'sun',color:'#b49aff',demo:false,initialized:false,adminNote:note,views:0,finds:[],comments:[]} };
    }
    const existing=await env.DB.prepare('SELECT id FROM stones WHERE creation_key=?').bind(key).first();
    const sequence=await env.DB.prepare("SELECT seq FROM sqlite_sequence WHERE name='stone_numbers'").first();
    if(!existing && sequence?.seq>=9999)fail(409,'All 9999 stone numbers have been used.');
    await env.DB.batch([
      env.DB.prepare("INSERT INTO stones(id,name,creator,born,image,theme,color,is_demo,code_hash,demo_code,initialized,creation_key,admin_note,label_code) VALUES (?,'New stone','','','brand-stone.svg','sun','#b49aff',0,?,NULL,0,?,?,?) ON CONFLICT(creation_key) DO NOTHING").bind(id, await sha256(code), key, note, code),
      env.DB.prepare('INSERT INTO stone_numbers(stone_id) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM stone_numbers WHERE stone_id=?)').bind(id,id),
    ]);
    const saved = await env.DB.prepare('SELECT id,code_hash FROM stones WHERE creation_key=?').bind(key).first();
    const stone = (await listStones(env.DB,saved.id,true))[0];
    return { stone, ...(saved.code_hash === await sha256(code) ? { code } : {}) };
  }
  const noteMatch=path.match(/^stones\/([A-Za-z0-9_-]{1,32})\/note$/);
  if(noteMatch && request.method==='PATCH') {
    const body=await jsonBody(request),note=text(body.note,2000);
    const result=await env.DB.prepare('UPDATE stones SET admin_note=? WHERE id=?').bind(note,noteMatch[1]).run();
    if(!result.meta.changes)fail(404,'This stone could not be found.');
    return {stone:(await listStones(env.DB,noteMatch[1],true))[0]};
  }
  const labelMatch=path.match(/^stones\/([A-Za-z0-9_-]{1,32})\/label-code$/);
  if(labelMatch && request.method==='POST') {
    const stone=await env.DB.prepare('SELECT code_hash FROM stones WHERE id=?').bind(labelMatch[1]).first();
    if(!stone)fail(404,'This stone could not be found.');
    await limit(request,env,'admin-label-code',40);
    const body=await jsonBody(request),code=text(body.code,32,true).toUpperCase();
    if(!constantEqual(await sha256(code),stone.code_hash))fail(403,'That Find Code does not match this stone.');
    await env.DB.prepare('UPDATE stones SET label_code=? WHERE id=? AND code_hash=?').bind(code,labelMatch[1],stone.code_hash).run();
    return {code};
  }
  const match = path.match(/^stones\/([A-Za-z0-9_-]{1,32})(?:\/(finds|comments)\/([A-Za-z0-9_-]{1,80}))?$/);
  if (!match) fail(404, 'Management page not found.');
  const [, id, kind, recordId] = match;
  const stone = await env.DB.prepare('SELECT * FROM stones WHERE id=?').bind(id).first();
  if (!stone) fail(404, 'This stone could not be found.');
  if (!kind && request.method === 'GET') return { stone: (await listStones(env.DB,id,true))[0] };
  if (!['PATCH','DELETE'].includes(request.method)) fail(405, 'Method not allowed.');
  const statements = [];
  if (!kind) {
    if (request.method === 'DELETE') {
      statements.push(...await returnedImageStatements(env.DB,stone));
      // Explicit order respects foreign keys and removes orphaned replay/view events.
      for (const table of ['comments','submissions','stone_views','finds']) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE stone_id=?`).bind(id));
      statements.push(env.DB.prepare('UPDATE traffic_targets SET deleted=1 WHERE target=?').bind('stone:'+id));
      statements.push(env.DB.prepare('DELETE FROM stones WHERE id=?').bind(id));
    } else {
      if (!stone.initialized) fail(409, 'Open this stone’s setup page to give it a name and birth location.');
      const body = await jsonBody(request);
      const name = text(body.name,80,true), creator = text(body.creator,80,true);
      const born = date(body.started).slice(0,10);
      const image = text(body.image,300,true), theme = text(body.theme,20,true), color = text(body.color,7,true);
      if (!/^(?:(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:svg|png|jpe?g|webp)|https:\/\/[^\s<>"']+)$/i.test(image)) fail(400, 'Use a stone asset path or an HTTPS image URL.');
      if (!['sun','moon','leaf','heart','wave'].includes(theme) || !/^#[a-f0-9]{6}$/i.test(color) || typeof body.demo !== 'boolean') fail(400, 'Choose a valid appearance and stone type.');
      const code = text(body.code,32).toUpperCase();
      if (code && !/^\d{4}$/.test(code)) fail(400, 'Find Codes need exactly 4 digits.');
      if (!body.demo && stone.is_demo && (!code || await sha256(code) === stone.code_hash)) fail(400, 'Choose a new private Find Code when converting a Demo stone to Real.');
      if (body.demo && !code && !stone.demo_code) fail(400, 'Enter a Find Code before marking a real stone as Demo.');
      const first = await env.DB.prepare('SELECT * FROM finds WHERE stone_id=? ORDER BY occurred_at,id LIMIT 1').bind(id).first();
      const second = await env.DB.prepare('SELECT occurred_at FROM finds WHERE stone_id=? ORDER BY occurred_at,id LIMIT 1 OFFSET 1').bind(id).first();
      if (!first) fail(409, 'A stone must have its birth location.');
      const birthMoment = born !== stone.born ? born+'T00:00:00.000Z' : first.occurred_at;
      if (second && Date.parse(birthMoment) >= Date.parse(second.occurred_at)) fail(400, 'Birth must be before the next find.');
      statements.push(env.DB.prepare('UPDATE stones SET name=?,creator=?,born=?,image=?,theme=?,color=?,is_demo=?,code_hash=?,demo_code=?,label_code=? WHERE id=?').bind(name,creator,born,image,theme,color,body.demo?1:0,code?await sha256(code):stone.code_hash,body.demo?(code||stone.demo_code):null,code||stone.label_code,id));
      if(!body.demo)statements.push(env.DB.prepare('INSERT INTO stone_numbers(stone_id) SELECT ? WHERE NOT EXISTS(SELECT 1 FROM stone_numbers WHERE stone_id=?)').bind(id,id));
      statements.push(env.DB.prepare('UPDATE traffic_targets SET name=? WHERE target=?').bind(name,'stone:'+id));
      if (born !== stone.born) {
        statements.push(env.DB.prepare('UPDATE finds SET occurred_at=? WHERE id=?').bind(birthMoment,first.id));
        statements.push(env.DB.prepare('UPDATE comments SET created_at=? WHERE find_id=?').bind(birthMoment,first.id));
      }
    }
  } else {
    const record = await env.DB.prepare(`SELECT * FROM ${kind} WHERE id=? AND stone_id=?`).bind(recordId,id).first();
    if (!record) fail(404, 'This record could not be found.');
    if (kind === 'comments') {
      if (request.method === 'DELETE') {
        statements.push(env.DB.prepare("DELETE FROM submissions WHERE stone_id=? AND kind='comments' AND record_id=?").bind(id,recordId));
        statements.push(env.DB.prepare('DELETE FROM comments WHERE id=? AND stone_id=?').bind(recordId,id));
      } else {
        const body = await jsonBody(request), nickname = text(body.nickname,40,true), message = text(body.message,400,true);
        statements.push(env.DB.prepare('UPDATE comments SET nickname=?,message=? WHERE id=? AND stone_id=?').bind(nickname,message,recordId,id));
        if (record.find_id) statements.push(env.DB.prepare('UPDATE finds SET nickname=? WHERE id=? AND stone_id=?').bind(nickname,record.find_id,id));
      }
    } else {
      const first = await env.DB.prepare('SELECT id FROM finds WHERE stone_id=? ORDER BY occurred_at,id LIMIT 1').bind(id).first();
      if (request.method === 'DELETE') {
        if (recordId === first.id) fail(409, 'Keep the birth location. You can edit it, or delete the whole stone.');
        statements.push(env.DB.prepare('DELETE FROM comments WHERE find_id=? AND stone_id=?').bind(recordId,id));
        statements.push(env.DB.prepare("DELETE FROM submissions WHERE stone_id=? AND kind='finds' AND record_id=?").bind(id,recordId));
        statements.push(env.DB.prepare('DELETE FROM finds WHERE id=? AND stone_id=?').bind(recordId,id));
      } else {
        const body = await jsonBody(request), occurred = date(body.date), lat = body.lat, lon = body.lon;
        const city=text(body.city,120,true),country=text(body.country,80,true),address=text(body.address,300),nickname=text(body.nickname,40,true);
        const source=text(body.source,10,true),accuracy=source==='gps'?body.accuracy:null;
        if (!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>90||Math.abs(lon)>180 || !['seed','gps','demo','manual'].includes(source) || (source==='gps' && (!Number.isFinite(accuracy)||accuracy<0))) fail(400,'Choose valid coordinates, source and accuracy.');
        if (recordId === first.id) {
          const next=await env.DB.prepare('SELECT occurred_at FROM finds WHERE stone_id=? AND id!=? ORDER BY occurred_at,id LIMIT 1').bind(id,recordId).first();
          if (next && Date.parse(occurred)>=Date.parse(next.occurred_at)) fail(400,'Birth must be before the next find.');
          statements.push(env.DB.prepare('UPDATE stones SET born=? WHERE id=?').bind(occurred.slice(0,10),id));
        } else {
          const birth = await env.DB.prepare('SELECT occurred_at FROM finds WHERE id=?').bind(first.id).first();
          if (Date.parse(occurred) <= Date.parse(birth.occurred_at)) fail(400,'A find must be after the birth location.');
        }
        statements.push(env.DB.prepare('UPDATE finds SET occurred_at=?,lat=?,lon=?,accuracy=?,city=?,country=?,address=?,nickname=?,source=? WHERE id=? AND stone_id=?').bind(occurred,lat,lon,accuracy,city,country,address,nickname,source,recordId,id));
        statements.push(env.DB.prepare('UPDATE comments SET created_at=?,nickname=? WHERE find_id=? AND stone_id=?').bind(occurred,nickname,recordId,id));
      }
    }
  }
  await env.DB.batch(statements);
  return { ok: true, imagesAvailable:await availableImageCount(env.DB), ...(!(request.method==='DELETE'&&!kind) ? {stone:(await listStones(env.DB,id,true))[0]} : {}) };
}
