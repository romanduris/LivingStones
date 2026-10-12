const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
async function environment(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('backend/migrations').sort())sqlite.exec(fs.readFileSync('backend/migrations/'+file,'utf8'));
 sqlite.exec(fs.readFileSync('backend/seed.sql','utf8'));
 const db={prepare(sql){let args=[];const statement=sqlite.prepare(sql);return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){const info=statement.run(...args);return {meta:{changes:info.changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const sent=[];return {sqlite,sent,DB:db,EMAIL:{async send(message){sent.push(message);return {messageId:'test'};}},WATCHDOG_FROM:'watchdog@rodulab.com',WATCHDOG_API_URL:'https://api.example.invalid',WATCHDOG_SITE_URL:'https://livingstones.rodulab.com'};
}
const request=()=>new Request('https://api.example.invalid/api/stones/C3/watchdog',{method:'POST',headers:{'CF-Connecting-IP':'192.0.2.1'}});
test('Watchdog confirms private subscribers, delivers each find and timed status, retries delivery, and unsubscribes independently',async()=>{
 const w=await import('../backend/watchdog.js'),env=await environment(),id='C3';
 try{
  env.sqlite.prepare('UPDATE stones SET is_demo=0,demo_code=NULL WHERE id=?').run(id);
  for(const email of ['one@example.invalid','two@example.invalid'])assert.equal((await w.subscribeWatchdog(request(),env,id,{email,language:'sk'})).notificationsEnabled,true);
  await w.deliverWatchdog(env);assert.equal(env.sent.length,2);assert.ok(env.sent.every(m=>typeof m.to==='string'&&!m.cc&&!m.bcc));
  const watchers=env.sqlite.prepare('SELECT * FROM stone_watchers WHERE stone_id=? ORDER BY email').all(id);
  const token=watchers[0].token,token2=watchers[1].token,url='https://api.example.invalid/api/watchdog/'+token;
  const landing=await w.watchdogLink(new Request(url),env,token);assert.match(await landing.text(),/Zapnúť upozornenia/);assert.equal(env.sqlite.prepare('SELECT confirmed_at FROM stone_watchers WHERE token=?').get(token).confirmed_at,null,'GET and email scanners never activate subscriptions');
  for(const t of [token,token2])await w.watchdogLink(new Request(url+'/confirm',{method:'POST'}),env,t,'confirm');
  const date=new Date().toISOString(),findId='watchdog-test-find';
  await env.DB.batch([env.DB.prepare('INSERT INTO finds(id,stone_id,occurred_at,lat,lon,accuracy,city,country,address,nickname,source) VALUES (?,?,?,48,17,1,?,?,?, ?,?)').bind(findId,id,date,'Test <city>','Slovakia','Street','Finder','gps'),...w.foundWatchdogStatements(env.DB,id,findId,date,{city:'Test <city>',country:'Slovakia'})]);
  await Promise.all([w.deliverWatchdog(env),w.deliverWatchdog(env)]);assert.equal(env.sent.length,4,'delivery leases prevent competing workers from sending duplicate emails');assert.match(env.sent[2].text,/Tvoj kamienok sa našiel/);assert.match(env.sent[2].html,/Test &lt;city&gt;/);
  await env.DB.batch(w.foundWatchdogStatements(env.DB,id,findId,date,{city:'Test <city>',country:'Slovakia'}));await w.deliverWatchdog(env);assert.equal(env.sent.length,4,'same find does not enqueue twice');
  const now=Date.parse(date);
  for(const [days,status] of [[6,'journey'],[15,'quiet'],[30,'lost']]){
   await w.checkWatchdogStatuses(env,now+days*86400000);await w.checkWatchdogStatuses(env,now+days*86400000);await w.deliverWatchdog(env);
   assert.equal(env.sqlite.prepare('SELECT last_status FROM stone_watchers WHERE token=?').get(token).last_status,status);
  }
  assert.equal(env.sent.length,10,'one notification per subscriber per status change');
  await w.watchdogLink(new Request(url+'/unsubscribe',{method:'POST'}),env,token,'unsubscribe');assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM stone_watchers').get().n,1);
  await assert.rejects(w.watchdogLink(new Request(url),env,token),e=>e.status===404);
  const reborn='watchdog-test-refind';await env.DB.batch(w.foundWatchdogStatements(env.DB,id,reborn,date,{city:'Again',country:'Slovakia'}));
  const original=env.EMAIL.send;env.EMAIL.send=async()=>{const e=new Error('temporary');e.code='E_INTERNAL_SERVER_ERROR';throw e;};await w.deliverWatchdog(env);assert.equal(env.sent.length,10);
  env.EMAIL.send=original;env.sqlite.exec('UPDATE watchdog_outbox SET available_at=0');await w.deliverWatchdog(env);assert.equal(env.sent.length,11);assert.equal(env.sent.at(-1).to,'two@example.invalid');
  env.sqlite.prepare('DELETE FROM comments WHERE stone_id=?').run(id);env.sqlite.prepare('DELETE FROM finds WHERE stone_id=?').run(id);env.sqlite.prepare('DELETE FROM stones WHERE id=?').run(id);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM watchdog_outbox').get().n,0);
 }finally{env.sqlite.close();}
});
test('Watchdog status boundaries match the public collection and invalid email addresses are rejected',async()=>{
 const w=await import('../backend/watchdog.js'),now=Date.parse('2026-10-12T12:00:00Z');
 for(const [days,status] of [[0,'alive'],[5.9,'alive'],[6,'journey'],[14.9,'journey'],[15,'quiet'],[29.9,'quiet'],[30,'lost']])assert.equal(w.watchdogStatus({last_date:new Date(now-days*86400000).toISOString()},now),status);
 for(const email of ['bad','a@b','a\r\n@b.com','a..b@example.com'])assert.throws(()=>w.watchdogEmail(email));
});
