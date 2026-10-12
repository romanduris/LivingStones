CREATE TABLE owner_event_emails (
 id TEXT PRIMARY KEY,
 stone_id TEXT NOT NULL REFERENCES stones(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('birth','find')),
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL,
 sent_at TEXT,
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX owner_event_emails_pending ON owner_event_emails(sent_at,next_attempt_at,lease_until);
