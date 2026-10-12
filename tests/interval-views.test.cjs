const {test}=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),fs=require('node:fs');
test('Overlapping counters migrate to separate intervals, with deterministic equal-time entries',()=>{
 const db=new DatabaseSync(':memory:');
 try{
  db.exec(`CREATE TABLE finds(id TEXT PRIMARY KEY,stone_id TEXT,occurred_at TEXT,views INTEGER,qr_views INTEGER CHECK(qr_views<=views));
   CREATE TABLE comments(id TEXT PRIMARY KEY,stone_id TEXT,find_id TEXT,created_at TEXT,views INTEGER,qr_views INTEGER CHECK(qr_views<=views));
   INSERT INTO finds VALUES ('a','stone','2026-01-01',22,4),('z','stone','2026-01-02',20,2),('other','second','2026-01-01',7,1);
   INSERT INTO comments VALUES ('b','stone',NULL,'2026-01-02',20,2),('linked','stone','a','2026-01-01',22,4);`);
  db.exec(fs.readFileSync('backend/migrations/0020_interval_views.sql','utf8'));
  assert.deepEqual(db.prepare('SELECT id,views,qr_views FROM finds ORDER BY id').all().map(r=>({...r})),[{id:'a',views:2,qr_views:2},{id:'other',views:7,qr_views:1},{id:'z',views:20,qr_views:2}]);
  assert.equal(db.prepare("SELECT views FROM comments WHERE id='b'").get().views,0);
  assert.equal(db.prepare("SELECT views FROM comments WHERE id='linked'").get().views,22);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='activity_intervals'").get().n,0);
 }finally{db.close();}
});
test('Views move from a find to a note and then the next find, without counting a linked message twice',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const file of fs.readdirSync('backend/migrations').sort())db.exec(fs.readFileSync('backend/migrations/'+file,'utf8'));
  db.exec(fs.readFileSync('backend/seed.sql','utf8'));
  const DB={prepare(sql){let args=[];const q=db.prepare(sql);return {bind(...v){args=v;return this;},async first(){return q.get(...args)||null;},async all(){return {results:q.all(...args)};},async run(){return q.run(...args);}};},async batch(items){db.exec('BEGIN');try{for(const q of items)await q.run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}};
  const {recordTraffic}=await import('../backend/traffic.js');
  const view=()=>recordTraffic(new Request('https://api.invalid'),{DB},{viewId:crypto.randomUUID(),source:'qr'},'A1');
  await view();
  const old=db.prepare("SELECT SUM(views) AS n FROM finds WHERE stone_id='A1'").get().n;assert.equal(old,1);
  db.prepare("INSERT INTO comments(id,stone_id,created_at,nickname,message) VALUES ('interval-note','A1','2026-10-01T00:00:00Z','Visitor','Note')").run();
  await view();assert.equal(db.prepare("SELECT views FROM comments WHERE id='interval-note'").get().views,1);
  db.prepare("INSERT INTO finds(id,stone_id,occurred_at,lat,lon,city,country,nickname,source) VALUES ('interval-find','A1','2026-10-02T00:00:00Z',48,17,'Bratislava','Slovakia','Visitor','gps')").run();
  db.prepare("INSERT INTO comments(id,stone_id,find_id,created_at,nickname,message) VALUES ('interval-linked','A1','interval-find','2026-10-02T00:00:00Z','Visitor','Found')").run();
  const result=await view();assert.deepEqual({...result.activityViews.find(e=>e.id==='interval-find')},{id:'interval-find',views:1,qrViews:1});
  assert.equal(db.prepare("SELECT views FROM comments WHERE id='interval-note'").get().views,1);
  assert.equal(db.prepare("SELECT views FROM comments WHERE id='interval-linked'").get().views,0);
  assert.equal(db.prepare("SELECT SUM(views) AS n FROM finds WHERE stone_id='A1' AND id!='interval-find'").get().n,old);
 }finally{db.close();}
});
