import { fail, sha256, text, limit } from './common.js';

// Used by both the picker and management; never offer an image still in use.
const available = "claimed_at IS NULL AND NOT EXISTS(SELECT 1 FROM stones WHERE initialized=1 AND stones.image=stone_image_pool.image)";
export async function availableImageCount(db) {
  return (await db.prepare('SELECT COUNT(*) AS available FROM stone_image_pool WHERE '+available).first()).available;
}
export async function returnedImageStatements(db, stone) {
  const statements = [db.prepare('UPDATE stone_image_pool SET stone_id=NULL,claimed_at=NULL WHERE (stone_id=? OR image=?) AND NOT EXISTS(SELECT 1 FROM stones WHERE id!=? AND initialized=1 AND stones.image=stone_image_pool.image)').bind(stone.id,stone.image,stone.id)];
  // Demo SVGs live outside the initial stock. Register them when their stone is removed.
  if(stone.initialized && /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.svg$/.test(stone.image) && stone.image!=='brand-stone.svg') {
    const imageId='returned-'+(await sha256(stone.image)).slice(0,20);
    statements.push(db.prepare('INSERT INTO stone_image_pool(id,image,label,theme,color) SELECT ?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM stones WHERE id!=? AND initialized=1 AND image=?) ON CONFLICT(image) DO NOTHING').bind(imageId,stone.image,stone.name,stone.theme,stone.color,stone.id,stone.image));
  }
  return statements;
}
export async function availableImages(env, id) {
  const stone = await env.DB.prepare('SELECT initialized FROM stones WHERE id=?').bind(id).first();
  if (!stone) fail(404, 'This stone could not be found.');
  if (stone.initialized) fail(409, 'This stone has already been born. Open its story.');
  const [images, count] = await env.DB.batch([
    env.DB.prepare('SELECT id,image,label,theme,color FROM stone_image_pool WHERE '+available+' ORDER BY random() LIMIT 12'),
    env.DB.prepare('SELECT COUNT(*) AS available FROM stone_image_pool WHERE '+available),
  ]);
  return { images: images.results, available: count.results[0].available };
}

export async function initializeStone(request, env, id, body, listStones) {
  await limit(request, env, 'stone-initialize', 20);
  const stone = await env.DB.prepare('SELECT initialized,code_hash FROM stones WHERE id=?').bind(id).first();
  if (!stone) fail(404, 'This stone could not be found.');
  if (await sha256(text(body.code,32,true).toUpperCase()) !== stone.code_hash)
    fail(403, 'That Find Code does not match. Check the code on the stone.');
  const key=request.headers.get('Idempotency-Key');
  if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key)) fail(400, 'Please retry from the birth form.');
  const name=text(body.name,80,true),creator=text(body.creator,80,true),imageId=text(body.imageId,32,true),theme=text(body.theme,20,true),message=text(body.message,400);
  if (!['sun','moon','leaf','heart','wave'].includes(theme)) fail(400,'Choose a theme.');
  const p=body.place;
  if (!p || !Number.isFinite(p.lat)||!Number.isFinite(p.lon)||Math.abs(p.lat)>90||Math.abs(p.lon)>180||!['gps','manual'].includes(p.source)||(p.source==='gps'&&(!Number.isFinite(p.accuracy)||p.accuracy<0)))
    fail(400,'Use your phone’s GPS or choose a city for this stone’s birthplace.');
  const place={lat:p.lat,lon:p.lon,accuracy:p.source==='gps'?p.accuracy:null,source:p.source,city:text(p.city,120,true),country:text(p.country,80,true),address:text(p.address,300)};
  const fingerprint=await sha256(JSON.stringify({id,name,creator,imageId,theme,place,...(message?{message}:{})}));
  const replay=async()=>{
    const saved=await env.DB.prepare('SELECT stone_id,fingerprint FROM stone_initializations WHERE id=?').bind(key).first();
    if (!saved) return null;
    if (saved.stone_id!==id || saved.fingerprint!==fingerprint) fail(409,'This request was already used. Please reload the setup page.');
    return {stone:(await listStones(env.DB,id))[0],replayed:true};
  };
  const previous=await replay();if(previous)return previous;
  if(stone.initialized)fail(409,'This stone has already been born. Open its story.');
  const image=await env.DB.prepare('SELECT * FROM stone_image_pool WHERE id=?').bind(imageId).first();
  if(!image || image.claimed_at || await env.DB.prepare('SELECT id FROM stones WHERE initialized=1 AND image=? LIMIT 1').bind(image.image).first())fail(409,'Someone just chose that portrait. Please choose another one.');
  const date=new Date().toISOString();
  // The conditional claim and all three writes run in one D1 transaction.
  // Only one birth per stone and one owner per portrait can succeed.
  const statements=[
    env.DB.prepare('INSERT INTO stone_initializations(id,stone_id,fingerprint,created_at) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM stones WHERE id=? AND initialized=0) AND EXISTS(SELECT 1 FROM stone_image_pool WHERE id=? AND '+available+')').bind(key,id,fingerprint,date,id,imageId),
    env.DB.prepare('UPDATE stone_image_pool SET stone_id=?,claimed_at=? WHERE id=? AND claimed_at IS NULL AND EXISTS(SELECT 1 FROM stone_initializations WHERE id=? AND stone_id=?)').bind(id,date,imageId,key,id),
    env.DB.prepare('UPDATE stones SET initialized=1,name=?,creator=?,born=?,image=?,theme=?,color=? WHERE id=? AND initialized=0 AND EXISTS(SELECT 1 FROM stone_initializations WHERE id=? AND stone_id=?)').bind(name,creator,date.slice(0,10),image.image,theme,image.color,id,key,id),
    env.DB.prepare("INSERT INTO finds(id,stone_id,occurred_at,lat,lon,accuracy,city,country,address,nickname,source) SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stone_initializations WHERE id=? AND stone_id=?) AND NOT EXISTS(SELECT 1 FROM finds WHERE id=?)").bind('birth-'+id,id,date,place.lat,place.lon,place.accuracy,place.city,place.country,place.address,creator.slice(0,40),place.source,key,id,'birth-'+id),
  ];
  if(message)statements.push(env.DB.prepare("INSERT INTO comments(id,stone_id,find_id,created_at,nickname,message) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM stone_initializations WHERE id=? AND stone_id=?) AND NOT EXISTS(SELECT 1 FROM comments WHERE id=?)").bind('birth-wish-'+id,id,'birth-'+id,date,creator.slice(0,40),message,key,id,'birth-wish-'+id));
  let results;
  try {results=await env.DB.batch(statements);} catch(error) {
    const saved=await replay();if(saved)return saved;
    throw error;
  }
  if(!results[0].meta.changes){
    const saved=await replay();if(saved)return saved;
    fail(409,'The stone or portrait was just adopted. Please reload the available portraits.');
  }
  return {stone:(await listStones(env.DB,id))[0],replayed:false};
}
