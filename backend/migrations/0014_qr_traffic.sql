ALTER TABLE traffic_daily ADD COLUMN qr_views INTEGER NOT NULL DEFAULT 0 CHECK(qr_views >= 0 AND qr_views <= views);
INSERT INTO traffic_meta(key,value) VALUES ('qr_started_at',date('now'));
