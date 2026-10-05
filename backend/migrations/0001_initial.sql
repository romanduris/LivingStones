PRAGMA foreign_keys = ON;
CREATE TABLE stones (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, tagline TEXT NOT NULL, story TEXT NOT NULL,
 born TEXT NOT NULL, image TEXT NOT NULL, theme TEXT NOT NULL, color TEXT NOT NULL,
 is_demo INTEGER NOT NULL DEFAULT 0 CHECK(is_demo IN (0,1)),
 code_hash TEXT NOT NULL, demo_code TEXT,
 CHECK(is_demo = 1 OR demo_code IS NULL)
);
CREATE TABLE finds (
 id TEXT PRIMARY KEY, stone_id TEXT NOT NULL REFERENCES stones(id), occurred_at TEXT NOT NULL,
 lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90), lon REAL NOT NULL CHECK(lon BETWEEN -180 AND 180),
 accuracy REAL CHECK(accuracy >= 0), city TEXT NOT NULL, country TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 nickname TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('seed','gps','demo'))
);
CREATE INDEX finds_journey ON finds(stone_id, occurred_at, id);
CREATE TABLE comments (
 id TEXT PRIMARY KEY, stone_id TEXT NOT NULL REFERENCES stones(id), find_id TEXT UNIQUE REFERENCES finds(id),
 created_at TEXT NOT NULL, nickname TEXT NOT NULL, message TEXT NOT NULL CHECK(length(message) BETWEEN 1 AND 400)
);
CREATE INDEX comments_story ON comments(stone_id, created_at, id);
CREATE TABLE submissions (
 id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, stone_id TEXT NOT NULL REFERENCES stones(id),
 record_id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('finds','comments')), created_at TEXT NOT NULL
);
CREATE TABLE rate_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);
