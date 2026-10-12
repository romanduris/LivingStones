const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),{randomUUID}=require('node:crypto');
async function environment(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 for(const file of fs.readdirSync('backend/migrations').sort())sqlite.exec(fs.readFileSync('backend/migrations/'+file,'utf8'));
 sqlite.exec(fs.readFileSync('backend/seed.sql','utf8'));
 const DB={prepare(sql){let args=[];const statement=sqlite.prepare(sql);return {bind(...values){args=values;return this;},async first(){return statement.get(...args)||null;},async all(){return {results:statement.all(...args)};},async run(){const info=statement.run(...args);return {meta:{changes:info.changes}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const sent=[];return {sqlite,sent,DB,EMAIL:{async send(message){sent.push(message);}},CONTACT_FROM:'livingstones@notify.rodulab.com',CONTACT_TO:'roman.duris@gmail.com',CONTACT_SITE_URL:'https://livingstones.rodulab.com'};
}
let requestNumber=0;
function request(key,ip){return new Request('https://api.example.invalid/api/stones/C3/contact',{method:'POST',headers:{'Idempotency-Key':key,'CF-Connecting-IP':ip||'192.0.2.'+(++requestNumber)}});}
const body={nickname:'A visitor',email:'visitor@example.invalid',message:'Question <script>hello()</script>\nAnother line.',language:'sk',to:'attacker@example.invalid'};
const create=message=>message;
test('Contact sends only to the owner, preserves reply address and UTF-8, and retries without duplicate delivery',async()=>{
 const {sendContact}=await import('../backend/contact.js'),env=await environment(),key=randomUUID();
 try{
  assert.deepEqual(await sendContact(request(key),env,'C3',body,create),{ok:true,replayed:false});
  const mail=env.sent[0];assert.equal(mail.to,'roman.duris@gmail.com');assert.equal(mail.from,'livingstones@notify.rodulab.com');assert.match(mail.raw,/Reply-To: <visitor@example.invalid>/);assert.doesNotMatch(mail.raw,/attacker@example.invalid/);
  const content=Buffer.from(mail.raw.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString('utf8');assert.match(content,/Kamienok:/);assert.match(content,/stone=C3/);assert.match(content,/Question <script>hello\(\)<\/script>\nAnother line/);
  assert.deepEqual(await sendContact(request(key),env,'C3',body,create),{ok:true,replayed:true});assert.equal(env.sent.length,1);
  await assert.rejects(sendContact(request(key),env,'C3',{...body,message:'Changed'},create),e=>e.status===409);
  const retry=randomUUID(),original=env.EMAIL.send;
  env.EMAIL.send=async()=>{const e=new Error('temporary');e.code='E_DELIVERY_FAILED';throw e;};
  await assert.rejects(sendContact(request(retry),env,'C3',body,create),e=>e.status===503);assert.equal(env.sqlite.prepare('SELECT lease_until FROM stone_contact_submissions WHERE id=?').get(retry).lease_until,0);
  env.EMAIL.send=original;await sendContact(request(retry),env,'C3',body,create);assert.equal(env.sent.length,2);
  const concurrent=randomUUID();let release,started;
  const waiting=new Promise(resolve=>{started=resolve;});env.EMAIL.send=async message=>{started();await new Promise(resolve=>{release=resolve;});env.sent.push(message);};
  const pending=sendContact(request(concurrent),env,'C3',body,create);await waiting;
  await assert.rejects(sendContact(request(concurrent),env,'C3',body,create),e=>e.status===409);release();await pending;assert.equal(env.sent.length,3);
  const row=env.sqlite.prepare('SELECT * FROM stone_contact_submissions WHERE id=?').get(key);assert.ok(!JSON.stringify(row).includes(body.email));assert.ok(!JSON.stringify(row).includes(body.message));
  env.sqlite.prepare('DELETE FROM comments WHERE stone_id=?').run('C3');env.sqlite.prepare('DELETE FROM finds WHERE stone_id=?').run('C3');env.sqlite.prepare('DELETE FROM stones WHERE id=?').run('C3');assert.equal(env.sqlite.prepare('SELECT COUNT(*) AS n FROM stone_contact_submissions').get().n,0);
 }finally{env.sqlite.close();}
});
test('Contact validates inputs, enforces rate limits and refuses success without an email transport',async()=>{
 const {sendContact,contactMessage}=await import('../backend/contact.js'),env=await environment();
 try{
  for(const changes of [{email:'bad\r\nCc:other@example.invalid'},{email:'a@b'},{message:''},{message:'x'.repeat(2001)}])await assert.rejects(sendContact(request(randomUUID()),env,'C3',{...body,...changes},create),e=>e.status===400);
  for(let n=0;n<5;n++)await assert.rejects(sendContact(request(randomUUID(),'198.51.100.1'),env,'C3',{...body,email:'invalid'},create),e=>e.status===400);
  await assert.rejects(sendContact(request(randomUUID(),'198.51.100.1'),env,'C3',body,create),e=>e.status===429);
  env.EMAIL=null;await assert.rejects(sendContact(request(randomUUID()),env,'C3',body,create),e=>e.status===503);assert.equal(env.sent.length,0);
  const mail=contactMessage({id:'C3',name:'A stone\r\nBcc: attacker@example.invalid'},body,env,randomUUID());assert.ok(!mail.raw.split('\r\n\r\n')[0].includes('\r\nBcc:'));
 }finally{env.sqlite.close();}
});

test('Homepage and stone contacts accept no email, omit Reply-To and retain private idempotent metadata',async()=>{
 const {sendContact}=await import('../backend/contact.js'),env=await environment();
 try{
  for(const id of [null,'C3']){
   const key=randomUUID();const data={message:'Anonymous suggestion',language:'de'};
   await sendContact(request(key),env,id,data,create);
   const mail=env.sent.at(-1);assert.doesNotMatch(mail.raw,/Reply-To:/);
   const content=Buffer.from(mail.raw.split('\r\n\r\n')[1].replace(/\s/g,''),'base64').toString('utf8');
   assert.match(content,/Nachricht:/);assert.match(content,/Anonymous suggestion/);
   assert.equal(content.includes('stone=C3'),id==='C3');
   assert.deepEqual(await sendContact(request(key),env,id,data,create),{ok:true,replayed:true});
   assert.equal(env.sqlite.prepare('SELECT stone_id FROM stone_contact_submissions WHERE id=?').get(key).stone_id,id);
  }
  assert.equal(env.sent.length,2);
 }finally{env.sqlite.close();}
});
