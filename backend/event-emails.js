import { mailMessage } from './contact.js';

// Queue alongside the event in the same D1 transaction. One row per birth/find.
export function eventEmailStatement(db,id,stoneId,kind,payload,initializationKey=null) {
  return db.prepare(`INSERT INTO owner_event_emails(id,stone_id,kind,payload,created_at)
    SELECT ?,?,?,?,? WHERE ? IS NULL OR EXISTS(SELECT 1 FROM stone_initializations WHERE id=? AND stone_id=?)
    ON CONFLICT(id) DO NOTHING`).bind(id,stoneId,kind,JSON.stringify(payload),payload.date,initializationKey,initializationKey,stoneId);
}
export function eventEmailMessage(row,env) {
  const data=JSON.parse(row.payload),birth=row.kind==='birth';
  const story=new URL('/?'+new URLSearchParams({stone:row.stone_id}),env.CONTACT_SITE_URL).href;
  const moment=new Intl.DateTimeFormat('sk-SK',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Bratislava'}).format(new Date(data.date));
  const subject=(birth?'Nový kamienok ožil':'Kamienok sa našiel')+' · '+data.name;
  const content=[birth?'Nový kamienok bol oživený.':'Niekto zaznamenal nájdenie kamienka.',
    '', 'Kamienok: '+data.name+' ('+row.stone_id+')','Miesto: '+data.city+', '+data.country,
    'Čas: '+moment,(birth?'Autor: ':'Nálezca: ')+(data.nickname==='A kind stranger'?'Neznámy':data.nickname),
    ...(data.message?['','Správa:',data.message]:[]),'','Príbeh kamienka: '+story].join('\n');
  return mailMessage('[Living Stones] '+subject,content,env,row.id);
}
export async function deliverEventEmails(env,createMessage) {
  if(!env.EMAIL||!env.CONTACT_FROM||!env.CONTACT_TO)return;
  const now=Math.floor(Date.now()/1000);
  const {results}=await env.DB.prepare(`SELECT * FROM owner_event_emails WHERE sent_at IS NULL
    AND next_attempt_at<=? AND lease_until<=? ORDER BY created_at,id LIMIT 5`).bind(now,now).all();
  for(const row of results){
    const claim=await env.DB.prepare(`UPDATE owner_event_emails SET lease_until=?,attempts=attempts+1
      WHERE id=? AND sent_at IS NULL AND next_attempt_at<=? AND lease_until<=? RETURNING id`)
      .bind(now+600,row.id,now,now).first();
    if(!claim)continue;
    try{
      await env.EMAIL.send(createMessage(eventEmailMessage(row,env)));
      await env.DB.prepare('UPDATE owner_event_emails SET sent_at=?,lease_until=0 WHERE id=?').bind(new Date().toISOString(),row.id).run();
    }catch(error){
      // Keep failures for scheduled retries; recording the find/birth already succeeded.
      await env.DB.prepare('UPDATE owner_event_emails SET lease_until=0,next_attempt_at=? WHERE id=?')
        .bind(now+Math.min(21600,300*2**Math.min(row.attempts,7)),row.id).run();
      console.error('Owner event email failed:',error.code||'email_send_failed');
    }
  }
  await env.DB.prepare('DELETE FROM owner_event_emails WHERE sent_at<?').bind(new Date(Date.now()-90*86400000).toISOString()).run();
}
