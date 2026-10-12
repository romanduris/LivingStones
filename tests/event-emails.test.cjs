const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
function environment(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('backend/migrations').sort())sqlite.exec(fs.readFileSync('backend/migrations/'+file,'utf8'));
 sqlite.exec(fs.readFileSync('backend/seed.sql','utf8'));
 const DB={prepare(sql){let args=[];const q=sqlite.prepare(sql);return {bind(...v){args=v;return this;},async first(){return q.get(...args)||null;},async all(){return {results:q.all(...args)};},async run(){return {meta:{changes:q.run(...args).changes}};}};},async batch(items){sqlite.exec('BEGIN');try{for(const q of items)await q.run();sqlite.exec('COMMIT');}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const sent=[];return {sqlite,DB,sent,EMAIL:{async send(message){sent.push(message);}},CONTACT_FROM:'livingstones@notify.rodulab.com',CONTACT_TO:'roman.duris@gmail.com',CONTACT_SITE_URL:'https://livingstones.rodulab.com'};
}
const payload={name:'Čarovný kamienok\r\nBcc: attacker@example.invalid',city:'Bratislava',country:'Slovakia',nickname:'Roman',message:'Nápad <b>ahoj</b>',date:'2026-10-12T10:00:00Z'};
const create=mail=>mail;
test('Birth/find notifications go only to owner, use Slovak UTF-8 and stable keys, and concurrent delivery sends once',async()=>{
 const {eventEmailStatement,deliverEventEmails}=await import('../backend/event-emails.js'),env=environment();
 try{
  await eventEmailStatement(env.DB,'birth-A1','A1','birth',payload,'missing-initialization').run();assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM owner_event_emails').get().n,0);
  env.sqlite.prepare("INSERT INTO stone_initializations(id,stone_id,fingerprint,created_at) VALUES ('birth-key','A1','hash','2026-10-12')").run();
  await eventEmailStatement(env.DB,'birth-A1','A1','birth',payload,'birth-key').run();
  await eventEmailStatement(env.DB,'birth-A1','A1','birth',payload,'birth-key').run();
  await eventEmailStatement(env.DB,'find-event','A1','find',payload).run();
  await Promise.all([deliverEventEmails(env,create),deliverEventEmails(env,create)]);
  assert.equal(env.sent.length,2);assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM owner_event_emails WHERE sent_at IS NOT NULL').get().n,2);
  for(const mail of env.sent){assert.equal(mail.to,'roman.duris@gmail.com');assert.doesNotMatch(mail.raw,/\r\nBcc:|Reply-To:/);
   const content=Buffer.from(mail.raw.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString('utf8');assert.match(content,/Kamienok: Čarovný/);assert.match(content,/Bratislava, Slovakia/);assert.match(content,/12:00/);assert.match(content,/stone=A1/);assert.match(content,/Nápad <b>ahoj<\/b>/);
  }
  await deliverEventEmails(env,create);assert.equal(env.sent.length,2);
 }finally{env.sqlite.close();}
});
test('Queue is atomic with events and retries temporary failures without changing saved activity',async()=>{
 const {eventEmailStatement,deliverEventEmails}=await import('../backend/event-emails.js'),env=environment();
 try{
  await assert.rejects(env.DB.batch([eventEmailStatement(env.DB,'rolled-back','A1','find',payload),env.DB.prepare("INSERT INTO stones(id,name) VALUES ('A1','conflict')")]));
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM owner_event_emails').get().n,0);
  await eventEmailStatement(env.DB,'retry-event','A1','find',payload).run();
  const original=env.EMAIL.send;env.EMAIL.send=async()=>{throw Object.assign(new Error('temporary'),{code:'E_TEMPORARY'});};
  await deliverEventEmails(env,create);
  const pending=env.sqlite.prepare('SELECT * FROM owner_event_emails').get();assert.equal(pending.sent_at,null);assert.equal(pending.lease_until,0);assert.equal(pending.attempts,1);assert.ok(pending.next_attempt_at>Math.floor(Date.now()/1000));
  env.EMAIL.send=original;await deliverEventEmails(env,create);assert.equal(env.sent.length,0);
  env.sqlite.prepare('UPDATE owner_event_emails SET next_attempt_at=0').run();await deliverEventEmails(env,create);assert.equal(env.sent.length,1);
  env.EMAIL=null;await eventEmailStatement(env.DB,'no-transport','A1','find',payload).run();await deliverEventEmails(env,create);assert.equal(env.sqlite.prepare("SELECT attempts FROM owner_event_emails WHERE id='no-transport'").get().attempts,0);
 }finally{env.sqlite.close();}
});
test('Authenticated persistent switch drops pending alerts and skips events while disabled',async()=>{
 const {eventEmailStatement,deliverEventEmails}=await import('../backend/event-emails.js'),{handleManagement}=await import('../backend/management.js'),{sha256}=await import('../backend/common.js'),env=environment();
 try{
  const token='a'.repeat(64);env.ALLOWED_ORIGINS='https://livingstones.rodulab.com';
  env.sqlite.prepare('INSERT INTO admin_sessions(token_hash,expires_at) VALUES (?,?)').run(await sha256(token),Math.floor(Date.now()/1000)+3600);
  const request=(method,body,origin=env.ALLOWED_ORIGINS,authenticated=true)=>new Request('https://api.invalid/api/admin/email-settings',{method,headers:{Origin:origin,...(authenticated?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const handle=req=>handleManagement(req,env,async()=>[]);
  assert.deepEqual(await handle(request('GET')),{enabled:true});
  await assert.rejects(handle(request('PATCH',{enabled:false},env.ALLOWED_ORIGINS,false)),e=>e.status===401);
  await assert.rejects(handle(request('PATCH',{enabled:false},'https://bad.invalid')),e=>e.status===403);
  await assert.rejects(handle(request('PATCH',{enabled:'false'})),e=>e.status===400);
  await eventEmailStatement(env.DB,'before-off','A1','find',payload).run();
  assert.deepEqual(await handle(request('PATCH',{enabled:false})),{enabled:false});
  assert.deepEqual(await handle(request('GET')),{enabled:false});
  assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM owner_event_emails').get().n,0);
  await eventEmailStatement(env.DB,'while-off','A1','find',payload).run();await deliverEventEmails(env,create);assert.equal(env.sent.length,0);
  assert.deepEqual(await handle(request('PATCH',{enabled:true})),{enabled:true});
  await deliverEventEmails(env,create);assert.equal(env.sent.length,0,'No old alerts are sent after re-enabling');
  await eventEmailStatement(env.DB,'after-on','A1','find',payload).run();await deliverEventEmails(env,create);assert.equal(env.sent.length,1);
 }finally{env.sqlite.close();}
});
