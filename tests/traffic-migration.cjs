const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'livingstones-traffic-migration-')),migrations=path.join(dir,'migrations');fs.mkdirSync(migrations);
const config=path.join(dir,'wrangler.json');fs.writeFileSync(config,JSON.stringify({name:'migration-check',main:path.resolve('backend/worker.js'),compatibility_date:'2026-10-05',d1_databases:[{binding:'DB',database_name:'migration-db',database_id:'11111111-1111-1111-1111-111111111111',migrations_dir:migrations}]}));
const cli=args=>execFileSync('node',['node_modules/wrangler/bin/wrangler.js','d1',...args,'--config',config,'--local','--persist-to',dir],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
try{
 for(const file of fs.readdirSync('backend/migrations').filter(f=>Number(f.slice(0,4))<=6))fs.copyFileSync('backend/migrations/'+file,path.join(migrations,file));
 cli(['migrations','apply','migration-db']);
 cli(['execute','migration-db','--command',"INSERT INTO stones(id,name,story,born,image,theme,color,is_demo,code_hash,demo_code,creator,views) VALUES ('A1','Sunny','Old story','2025-04-12','sun.svg','sun','#ffffff',1,'dummy','8451','Nina',9); INSERT INTO finds(id,stone_id,occurred_at,lat,lon,city,country,address,nickname,source) VALUES ('f1','A1','2025-04-12T00:00:00Z',48,17,'Bratislava','Slovakia','Park','Nina','seed'); INSERT INTO comments(id,stone_id,find_id,created_at,nickname,message) VALUES ('c1','A1','f1','2025-04-12T00:00:00Z','Nina','Keep this note'); INSERT INTO stone_views(id,stone_id,created_at) VALUES ('one','A1','2026-10-04T00:00:00Z'),('two','A1','2026-10-04T01:00:00Z'),('three','A1','2026-10-05T00:00:00Z');"]);
 for(const file of fs.readdirSync('backend/migrations').filter(f=>Number(f.slice(0,4))>6&&Number(f.slice(0,4))<=10))fs.copyFileSync('backend/migrations/'+file,path.join(migrations,file));
 cli(['migrations','apply','migration-db']);
 cli(['execute','migration-db','--command',"UPDATE stones SET image='birth-stones/birth-02.svg' WHERE id='A1'; UPDATE stone_image_pool SET claimed_at='2026-10-09T00:00:00Z' WHERE id IN ('birth-01','birth-02');"]);
 for(const file of fs.readdirSync('backend/migrations').filter(f=>Number(f.slice(0,4))>10&&Number(f.slice(0,4))<=12))fs.copyFileSync('backend/migrations/'+file,path.join(migrations,file));
 cli(['migrations','apply','migration-db']);
 const reclaimed=JSON.parse(cli(['execute','migration-db','--json','--command',"SELECT id,claimed_at FROM stone_image_pool WHERE id IN ('birth-01','birth-02') ORDER BY id; SELECT admin_note FROM stones;"]));
 assert.deepEqual(reclaimed[0].results,[{id:'birth-01',claimed_at:null},{id:'birth-02',claimed_at:'2026-10-09T00:00:00Z'}]);
 assert.equal(reclaimed[1].results[0].admin_note,'');
 const labels=JSON.parse(cli(['execute','migration-db','--json','--command','SELECT label_code,code_hash,demo_code FROM stones;']))[0].results;
 assert.equal(labels[0].label_code,'8451');assert.equal(labels[0].demo_code,'8451');assert.equal(labels[0].code_hash,'dummy');
 const hash=value=>require('node:crypto').createHash('sha256').update(value).digest('hex');
 const legacy=[{id:'leading-zero',code_hash:hash('0000')},{id:'last',code_hash:hash('9999')},{id:'unknown',code_hash:hash('OLDLONGCODE')}];
 const recovered=require('../scripts/recover-label-codes.cjs').recoverLabelCodes(legacy);
 assert.deepEqual(recovered.map(row=>[row.id,row.code]),[['leading-zero','0000'],['last','9999']]);
 assert.ok(legacy.every(row=>!('code' in row)));

 const result=JSON.parse(cli(['execute','migration-db','--json','--command',"SELECT views,creator FROM stones; SELECT baseline_views FROM traffic_targets WHERE target='stone:A1'; SELECT day,views FROM traffic_daily ORDER BY day; SELECT message FROM comments; PRAGMA table_info(stones); SELECT COUNT(*) AS finds FROM finds;"]));
 assert.equal(result[0].results[0].views,9);assert.equal(result[0].results[0].creator,'Nina');assert.equal(result[1].results[0].baseline_views,6);assert.deepEqual(result[2].results,[{day:'2026-10-04',views:2},{day:'2026-10-05',views:1}]);assert.equal(result[3].results[0].message,'Keep this note');assert.ok(!result[4].results.some(c=>c.name==='story'));assert.equal(result[5].results[0].finds,1);
 cli(['execute','migration-db','--command',"INSERT INTO stones(id,name,born,image,theme,color,is_demo,code_hash,creator) VALUES ('legacy-real','First real','2026-10-09','brand-stone.svg','sun','#ffffff',0,'unchanged','Roman'); INSERT INTO finds(id,stone_id,occurred_at,lat,lon,city,country,address,nickname,source) VALUES ('first-real-birth','legacy-real','2026-10-09T00:00:00Z',48,17,'Bratislava','Slovakia','','Roman','manual');"]);
 fs.copyFileSync('backend/migrations/0013_short_stone_numbers.sql',path.join(migrations,'0013_short_stone_numbers.sql'));cli(['migrations','apply','migration-db']);
 const numbered=JSON.parse(cli(['execute','migration-db','--json','--command',"SELECT number,stone_id FROM stone_numbers; SELECT id,code_hash FROM stones WHERE id='legacy-real';"]));
 assert.deepEqual(numbered[0].results,[{number:1,stone_id:'legacy-real'}]);assert.deepEqual(numbered[1].results,[{id:'legacy-real',code_hash:'unchanged'}]);
 console.log('Passed: traffic migration backfills dated events, retains undated totals and removes Story, adds private notes and reclaims only unused orphan portraits without losing finds or comments.');
}finally{fs.rmSync(dir,{recursive:true,force:true});}
