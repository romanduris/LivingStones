import { fail, text, sha256, limit } from './common.js';

export function contactEmail(value) {
  const email=text(value,254,true).toLowerCase(),local=email.split('@')[0];
  if(!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)||local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..'))fail(400,'Enter a valid email address.');
  return email;
}
const base64=value=>btoa(String.fromCharCode(...new TextEncoder().encode(value)));
function encodedHeader(value){
  const parts=[];let part='';
  for(const character of value.replace(/[\r\n]/g,' ')){
    if(new TextEncoder().encode(part+character).length>36){parts.push(part);part='';}
    part+=character;
  }
  if(part)parts.push(part);
  return parts.map(part=>'=?UTF-8?B?'+base64(part)+'?=').join('\r\n ');
}
const labels={
 en:{subject:'Question or suggestion',stone:'Stone',sender:'From',email:'Reply email',message:'Message',story:'Stone story'},
 sk:{subject:'Otázka alebo pripomienka',stone:'Kamienok',sender:'Odosielateľ',email:'Email pre odpoveď',message:'Správa',story:'Príbeh kamienka'},
 hu:{subject:'Kérdés vagy javaslat',stone:'Kavics',sender:'Feladó',email:'Válasz email',message:'Üzenet',story:'A kavics története'},
 de:{subject:'Frage oder Vorschlag',stone:'Stein',sender:'Absender',email:'Antwortadresse',message:'Nachricht',story:'Geschichte des Steins'}
};
export function contactMessage(stone,body,env,key) {
  const c=labels[body.language]||labels.en,from=contactEmail(env.CONTACT_FROM),to=contactEmail(env.CONTACT_TO);
  const story=new URL('/?'+new URLSearchParams({stone:stone.id}),env.CONTACT_SITE_URL).href;
  const content=[c.stone+': '+stone.name+' ('+stone.id+')',c.story+': '+story,c.sender+': '+(body.nickname||body.email),c.email+': '+body.email,'',c.message+':',body.message].join('\n');
  const raw=[
    'From: Living Stones <'+from+'>','To: <'+to+'>','Reply-To: <'+body.email+'>',
    'Subject: '+encodedHeader('[Living Stones] '+c.subject+' · '+stone.name),
    'Date: '+new Date().toUTCString(),'Message-ID: <'+key+'@'+from.split('@')[1]+'>',
    'MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','Content-Transfer-Encoding: base64','',
    base64(content).match(/.{1,76}/g).join('\r\n'),'',''
  ].join('\r\n');
  return {from,to,raw};
}
export async function sendContact(request,env,id,body,createMessage) {
  await limit(request,env,'stone-contact',5);
  const stone=await env.DB.prepare('SELECT id,name,initialized FROM stones WHERE id=?').bind(id).first();
  if(!stone)fail(404,'This stone could not be found.');
  if(!stone.initialized)fail(409,'This stone is waiting to be born. Finish its setup first.');
  const key=request.headers.get('Idempotency-Key');
  if(!key||!/^[a-zA-Z0-9-]{16,80}$/.test(key))fail(400,'Please retry from the form.');
  const data={nickname:text(body.nickname,80),email:contactEmail(body.email),message:text(body.message,2000,true),language:['en','sk','hu','de'].includes(body.language)?body.language:'en'};
  const fingerprint=await sha256(JSON.stringify({id,...data})),date=new Date().toISOString(),now=Math.floor(Date.now()/1000);
  if(!env.EMAIL||!env.CONTACT_FROM||!env.CONTACT_TO)fail(503,'We couldn’t send your message. Please try again — your message is still here.');
  await env.DB.prepare('INSERT INTO stone_contact_submissions(id,stone_id,fingerprint,created_at) VALUES (?,?,?,?) ON CONFLICT(id) DO NOTHING').bind(key,id,fingerprint,date).run();
  const saved=await env.DB.prepare('SELECT fingerprint,sent_at FROM stone_contact_submissions WHERE id=?').bind(key).first();
  if(saved.fingerprint!==fingerprint)fail(409,'That request was already used. Close the form and try again.');
  if(saved.sent_at)return {ok:true,replayed:true};
  const claim=await env.DB.prepare('UPDATE stone_contact_submissions SET lease_until=? WHERE id=? AND sent_at IS NULL AND lease_until<=? RETURNING id').bind(now+120,key,now).first();
  if(!claim)fail(409,'Your message is being sent. Please wait a moment and try again.');
  try{
    await env.EMAIL.send(createMessage(contactMessage(stone,data,env,key)));
    await env.DB.prepare('UPDATE stone_contact_submissions SET sent_at=?,lease_until=0 WHERE id=?').bind(new Date().toISOString(),key).run();
  }catch(error){
    await env.DB.prepare('UPDATE stone_contact_submissions SET lease_until=0 WHERE id=?').bind(key).run();
    console.error('Stone contact send failed:',error.code||'email_send_failed');
    fail(503,'We couldn’t send your message. Please try again — your message is still here.');
  }
  return {ok:true,replayed:false};
}
