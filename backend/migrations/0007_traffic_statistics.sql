CREATE TABLE traffic_targets (
 target TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('home','stone')),
 deleted INTEGER NOT NULL DEFAULT 0 CHECK(deleted IN (0,1)),
 baseline_views INTEGER NOT NULL DEFAULT 0 CHECK(baseline_views >= 0)
);
CREATE TABLE traffic_daily (
 day TEXT NOT NULL,
 target TEXT NOT NULL REFERENCES traffic_targets(target),
 views INTEGER NOT NULL CHECK(views >= 0),
 PRIMARY KEY(day,target)
);
CREATE INDEX traffic_daily_target ON traffic_daily(target,day);
CREATE TABLE homepage_views (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE INDEX homepage_views_retention ON homepage_views(created_at);
CREATE TABLE traffic_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT INTO traffic_targets(target,name,kind) VALUES ('home','Homepage','home');
INSERT INTO traffic_targets(target,name,kind,baseline_views)
 SELECT 'stone:' || s.id,s.name,'stone',MAX(s.views-(SELECT COUNT(*) FROM stone_views v WHERE v.stone_id=s.id),0) FROM stones s;
INSERT INTO traffic_daily(day,target,views)
 SELECT substr(created_at,1,10),'stone:' || stone_id,COUNT(*) FROM stone_views GROUP BY substr(created_at,1,10),stone_id;
INSERT INTO traffic_meta(key,value) VALUES ('started_at',date('now'));
