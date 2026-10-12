ALTER TABLE stone_watchers ADD COLUMN token TEXT;
ALTER TABLE stone_watchers ADD COLUMN confirmed_at TEXT;
ALTER TABLE stone_watchers ADD COLUMN language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE stone_watchers ADD COLUMN last_find_id TEXT;
ALTER TABLE stone_watchers ADD COLUMN last_status TEXT;
CREATE UNIQUE INDEX stone_watchers_token ON stone_watchers(token);
CREATE TABLE watchdog_outbox (
  id TEXT PRIMARY KEY,
  token TEXT NOT NULL REFERENCES stone_watchers(token) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('confirm','find','status')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX watchdog_pending ON watchdog_outbox(sent_at,available_at,lease_until);
