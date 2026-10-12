import { fail, text, limit } from './common.js';

const DAY=86400000;
export function watchdogStatus(stone, now=Date.now()) {
  if(stone.is_demo)return 'demo';
  const recorded=Date.parse(stone.last_date||stone.born);
  if(!Number.isFinite(recorded)||recorded>now)return 'lost';
  const days=Math.floor((now-recorded)/DAY);
  return days<=5?'alive':days<15?'journey':days<30?'quiet':'lost';
}
export function watchdogEmail(value) {
  const email=text(value,254,true).toLowerCase(),local=email.split('@')[0];
  if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)||local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..'))fail(400,'Enter a valid email address.');
  return email;
}
const locale=value=>['en','sk','hu','de'].includes(value)?value:'en';
const randomToken=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
const copy={
 en:{confirm:'Confirm your Watchdog email',intro:'Confirm this email to receive a notification whenever your stone is found or its status changes.',enable:'Enable notifications',disable:'Turn off notifications',off:'Notifications are turned off.',on:'Notifications are enabled.',found:'Your stone was found',changed:'Your stone’s status changed',story:'Open the stone’s story',ignore:'If you did not request this, ignore this email. Notifications start only after confirmation.',manage:'You can turn notifications off at any time.',alive:'Alive',journey:'On a journey',quiet:'Quiet',lost:'Lost',demo:'Demo',invalid:'This Watchdog link is no longer valid.',title:'Watchdog · Living Stones'},
 sk:{confirm:'Potvrď email pre Watchdog',intro:'Potvrď tento email a dostaneš upozornenie vždy, keď sa kamienok nájde alebo sa zmení jeho stav.',enable:'Zapnúť upozornenia',disable:'Vypnúť upozornenia',off:'Upozornenia sú vypnuté.',on:'Upozornenia sú zapnuté.',found:'Tvoj kamienok sa našiel',changed:'Stav tvojho kamienka sa zmenil',story:'Otvoriť príbeh kamienka',ignore:'Ak si o sledovanie nepožiadal, tento email ignoruj. Upozornenia začnú až po potvrdení.',manage:'Upozornenia môžeš kedykoľvek vypnúť.',alive:'Živý',journey:'Na cestách',quiet:'Tichý',lost:'Stratený',demo:'Demo',invalid:'Tento odkaz Watchdog už nie je platný.',title:'Watchdog · Living Stones'},
 hu:{confirm:'Erősítsd meg a Watchdog emailedet',intro:'Erősítsd meg ezt az emailt, és értesítést kapsz, amikor megtalálják a kavicsot vagy megváltozik az állapota.',enable:'Értesítések bekapcsolása',disable:'Értesítések kikapcsolása',off:'Az értesítések ki vannak kapcsolva.',on:'Az értesítések be vannak kapcsolva.',found:'Megtalálták a kavicsodat',changed:'Megváltozott a kavicsod állapota',story:'A kavics történetének megnyitása',ignore:'Ha nem te kérted, hagyd figyelmen kívül ezt az emailt. Az értesítések csak megerősítés után indulnak.',manage:'Az értesítéseket bármikor kikapcsolhatod.',alive:'Élő',journey:'Úton',quiet:'Csendes',lost:'Elveszett',demo:'Demo',invalid:'Ez a Watchdog hivatkozás már nem érvényes.',title:'Watchdog · Living Stones'},
 de:{confirm:'Bestätige deine Watchdog-E-Mail',intro:'Bestätige diese E-Mail, um benachrichtigt zu werden, wenn dein Stein gefunden wird oder sich sein Status ändert.',enable:'Benachrichtigungen aktivieren',disable:'Benachrichtigungen ausschalten',off:'Benachrichtigungen sind ausgeschaltet.',on:'Benachrichtigungen sind aktiviert.',found:'Dein Stein wurde gefunden',changed:'Der Status deines Steins hat sich geändert',story:'Die Geschichte des Steins öffnen',ignore:'Falls du dies nicht angefordert hast, ignoriere diese E-Mail. Benachrichtigungen beginnen erst nach der Bestätigung.',manage:'Du kannst Benachrichtigungen jederzeit ausschalten.',alive:'Lebendig',journey:'Unterwegs',quiet:'Still',lost:'Vermisst',demo:'Demo',invalid:'Dieser Watchdog-Link ist nicht mehr gültig.',title:'Watchdog · Living Stones'}
};
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function subscribeWatchdog(request,env,id,body) {
  await limit(request,env,'watchdog',10);
  const stone=await env.DB.prepare('SELECT id,initialized FROM stones WHERE id=?').bind(id).first();
  if(!stone)fail(404,'This stone could not be found.');
  if(!stone.initialized)fail(409,'This stone is waiting to be born. Finish its setup first.');
  const email=watchdogEmail(body.email),language=locale(body.language),token=randomToken(),date=new Date().toISOString();
  await env.DB.prepare('INSERT INTO stone_watchers(stone_id,email,created_at,token,language) VALUES (?,?,?,?,?) ON CONFLICT(stone_id,email) DO UPDATE SET token=COALESCE(stone_watchers.token,excluded.token),language=CASE WHEN stone_watchers.confirmed_at IS NULL THEN excluded.language ELSE stone_watchers.language END').bind(id,email,date,token,language).run();
  const watcher=await env.DB.prepare('SELECT token FROM stone_watchers WHERE stone_id=? AND email=?').bind(id,email).first();
  // A confirmation/manage link never reveals whether an address already subscribes.
  await env.DB.prepare("INSERT INTO watchdog_outbox(id,token,kind,payload,created_at) VALUES (?,?,'confirm','{}',?) ON CONFLICT(id) DO NOTHING").bind('confirm:'+watcher.token+':'+Math.floor(Date.now()/3600000),watcher.token,date).run();
  return {ok:true,confirmationRequired:true,notificationsEnabled:Boolean(env.EMAIL&&env.WATCHDOG_FROM)};
}
export function birthWatchdogStatements(db,id,emails,language,date,key) {
  return emails.flatMap(email=>{
    const token=randomToken();
    return [
      db.prepare('INSERT INTO stone_watchers(stone_id,email,created_at,token,language) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stone_initializations WHERE id=? AND stone_id=?) ON CONFLICT(stone_id,email) DO NOTHING').bind(id,email,date,token,locale(language),key,id),
      db.prepare("INSERT INTO watchdog_outbox(id,token,kind,payload,created_at) SELECT 'confirm:'||token||':birth',token,'confirm','{}',? FROM stone_watchers WHERE stone_id=? AND email=? AND EXISTS(SELECT 1 FROM stone_initializations WHERE id=? AND stone_id=?) ON CONFLICT(id) DO NOTHING").bind(date,id,email,key,id)
    ];
  });
}
export function foundWatchdogStatements(db,id,findId,date,place) {
  return [
    db.prepare("INSERT INTO watchdog_outbox(id,token,kind,payload,created_at) SELECT 'find:'||token||':'||?,token,'find',?,? FROM stone_watchers WHERE stone_id=? AND confirmed_at IS NOT NULL ON CONFLICT(id) DO NOTHING").bind(findId,JSON.stringify({date,city:place.city,country:place.country,status:'alive'}),date,id),
    db.prepare("UPDATE stone_watchers SET last_find_id=?,last_status=CASE WHEN (SELECT is_demo FROM stones WHERE id=?)=1 THEN 'demo' ELSE 'alive' END WHERE stone_id=? AND confirmed_at IS NOT NULL").bind(findId,id,id)
  ];
}
const snapshotSQL="SELECT s.id,s.name,s.is_demo,s.born,(SELECT id FROM finds WHERE stone_id=s.id ORDER BY occurred_at DESC,id DESC LIMIT 1) AS last_find_id,(SELECT occurred_at FROM finds WHERE stone_id=s.id ORDER BY occurred_at DESC,id DESC LIMIT 1) AS last_date FROM stones s WHERE s.id=? AND s.initialized=1";
export async function checkWatchdogStatuses(env,now=Date.now()) {
  const {results}=await env.DB.prepare("SELECT w.token,w.last_status,w.last_find_id,s.born,s.is_demo,(SELECT id FROM finds WHERE stone_id=s.id ORDER BY occurred_at DESC,id DESC LIMIT 1) AS current_find_id,(SELECT occurred_at FROM finds WHERE stone_id=s.id ORDER BY occurred_at DESC,id DESC LIMIT 1) AS last_date FROM stone_watchers w JOIN stones s ON s.id=w.stone_id WHERE w.confirmed_at IS NOT NULL AND s.initialized=1").all();
  for(const watcher of results){
    const status=watchdogStatus(watcher,now);if(status===watcher.last_status)continue;
    const date=new Date(now).toISOString(),key='status:'+watcher.token+':'+(watcher.current_find_id||watcher.born)+':'+status;
    await env.DB.batch([
      env.DB.prepare("INSERT INTO watchdog_outbox(id,token,kind,payload,created_at) SELECT ?,?,'status',?,? WHERE EXISTS(SELECT 1 FROM stone_watchers WHERE token=? AND confirmed_at IS NOT NULL AND last_status IS ? AND last_find_id IS ?) ON CONFLICT(id) DO NOTHING").bind(key,watcher.token,JSON.stringify({status,date}),date,watcher.token,watcher.last_status,watcher.last_find_id),
      env.DB.prepare('UPDATE stone_watchers SET last_status=?,last_find_id=? WHERE token=? AND confirmed_at IS NOT NULL AND last_status IS ? AND last_find_id IS ?').bind(status,watcher.current_find_id,watcher.token,watcher.last_status,watcher.last_find_id)
    ]);
  }
}
export function watchdogMessage(job,env) {
  const c=copy[locale(job.language)],payload=JSON.parse(job.payload);
  const manage=new URL('/api/watchdog/'+job.token,env.WATCHDOG_API_URL).href;
  const story=new URL('/?'+new URLSearchParams({stone:job.stone_id}),env.WATCHDOG_SITE_URL).href;
  const heading=job.kind==='confirm'?c.confirm:job.kind==='find'?c.found:c.changed;
  const details=job.kind==='confirm'?c.intro:job.kind==='find'?[payload.city,payload.country].filter(Boolean).join(', '):c[payload.status];
  const lines=[heading,job.name,details,'',c.story+': '+story,'',job.kind==='confirm'?c.enable+': '+manage:c.manage,c.disable+': '+manage,...(job.kind==='confirm'?['',c.ignore]:[])];
  return {from:{email:env.WATCHDOG_FROM,name:'Living Stones'},to:job.email,subject:heading+' · '+job.name.replace(/[\r\n]/g,' '),text:lines.join('\n'),html:'<h1>'+escape(heading)+'</h1><h2>'+escape(job.name)+'</h2><p>'+escape(details)+'</p><p><a href="'+escape(story)+'">'+escape(c.story)+'</a></p><p><a href="'+escape(manage)+'">'+escape(job.kind==='confirm'?c.enable:c.disable)+'</a></p><p>'+escape(job.kind==='confirm'?c.ignore:c.manage)+'</p>'};
}
export async function deliverWatchdog(env) {
  if(!env.EMAIL||!env.WATCHDOG_FROM)return;
  const now=Math.floor(Date.now()/1000);
  const {results}=await env.DB.prepare("SELECT o.id FROM watchdog_outbox o JOIN stone_watchers w ON w.token=o.token WHERE o.sent_at IS NULL AND o.available_at<=? AND o.lease_until<=? AND (o.kind='confirm' OR w.confirmed_at IS NOT NULL) ORDER BY o.created_at,o.id LIMIT 20").bind(now,now).all();
  for(const row of results){
    const claim=await env.DB.prepare('UPDATE watchdog_outbox SET lease_until=?,attempts=attempts+1 WHERE id=? AND sent_at IS NULL AND lease_until<=? RETURNING *').bind(now+300,row.id,now).first();if(!claim)continue;
    const job=await env.DB.prepare('SELECT o.*,w.email,w.language,w.stone_id,w.confirmed_at,s.name FROM watchdog_outbox o JOIN stone_watchers w ON w.token=o.token JOIN stones s ON s.id=w.stone_id WHERE o.id=?').bind(row.id).first();
    if(!job||(job.kind!=='confirm'&&!job.confirmed_at))continue;
    try{
      await env.EMAIL.send(watchdogMessage(job,env));
      await env.DB.prepare('UPDATE watchdog_outbox SET sent_at=?,lease_until=0 WHERE id=?').bind(new Date().toISOString(),row.id).run();
    }catch(error){
      await env.DB.prepare('UPDATE watchdog_outbox SET lease_until=0,available_at=? WHERE id=?').bind(now+Math.min(86400,60*2**Math.min(claim.attempts,10)),row.id).run();
      console.error('Watchdog delivery deferred:',error.code||'email_send_failed');
    }
  }
}
export async function watchdogLink(request,env,token,action) {
  if(!/^[a-f0-9]{64}$/.test(token))fail(404,'This Watchdog link is no longer valid.');
  const watcher=await env.DB.prepare('SELECT w.*,s.name FROM stone_watchers w JOIN stones s ON s.id=w.stone_id WHERE token=?').bind(token).first();
  if(!watcher)fail(404,'This Watchdog link is no longer valid.');
  const c=copy[locale(watcher.language)];let result='';
  if(request.method==='POST'){
    if(action==='confirm'){
      const stone=await env.DB.prepare(snapshotSQL).bind(watcher.stone_id).first();if(!stone)fail(404,c.invalid);
      await env.DB.prepare('UPDATE stone_watchers SET confirmed_at=COALESCE(confirmed_at,?),last_find_id=?,last_status=? WHERE token=? AND confirmed_at IS NULL').bind(new Date().toISOString(),stone.last_find_id,watchdogStatus(stone),token).run();result=c.on;
    }else if(action==='unsubscribe'){
      await env.DB.batch([env.DB.prepare('DELETE FROM watchdog_outbox WHERE token=? AND sent_at IS NULL').bind(token),env.DB.prepare('DELETE FROM stone_watchers WHERE token=?').bind(token)]);result=c.off;
    }else fail(404,c.invalid);
  }else if(request.method!=='GET'||action)fail(405,'Method not allowed.');
  const root='/api/watchdog/'+token;
  const html='<!doctype html><html lang="'+locale(watcher.language)+'"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+escape(c.title)+'</title><style>body{font:16px system-ui;background:#202930;color:#eee;max-width:560px;margin:60px auto;padding:24px;line-height:1.7}button,a{color:#62d7cb}button{font:inherit;background:#303b45;border:1px solid #62d7cb;padding:12px 20px;border-radius:8px;cursor:pointer}form{margin:16px 0}</style><h1>'+escape(c.title)+'</h1><h2>'+escape(watcher.name)+'</h2><p role="status">'+escape(result||(watcher.confirmed_at?c.on:c.intro))+'</p>'+(result?'':'<form method="post" action="'+root+'/confirm"><button>'+escape(c.enable)+'</button></form><form method="post" action="'+root+'/unsubscribe"><button>'+escape(c.disable)+'</button></form>')+'<p><a href="'+escape(new URL('/?'+new URLSearchParams({stone:watcher.stone_id}),env.WATCHDOG_SITE_URL).href)+'">'+escape(c.story)+'</a></p></html>';
  return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}});
}
