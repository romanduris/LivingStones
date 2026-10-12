DROP TABLE watchdog_outbox;
DROP TABLE stone_watchers;
CREATE TABLE stone_contact_submissions (
  id TEXT PRIMARY KEY,
  stone_id TEXT NOT NULL REFERENCES stones(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  sent_at TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
