ALTER TABLE stones ADD COLUMN views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0);
CREATE TABLE stone_views (
 id TEXT PRIMARY KEY,
 stone_id TEXT NOT NULL REFERENCES stones(id),
 created_at TEXT NOT NULL
);
CREATE INDEX stone_views_retention ON stone_views(created_at);
CREATE TABLE admin_sessions (
 token_hash TEXT PRIMARY KEY,
 expires_at INTEGER NOT NULL
);
CREATE INDEX admin_sessions_expiry ON admin_sessions(expires_at);
