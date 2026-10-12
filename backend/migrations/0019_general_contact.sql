-- Preserve delivery metadata while allowing homepage messages without a stone.
ALTER TABLE stone_contact_submissions RENAME TO contact_submissions_old;
CREATE TABLE stone_contact_submissions (
  id TEXT PRIMARY KEY,
  stone_id TEXT REFERENCES stones(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL,
  sent_at TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
INSERT INTO stone_contact_submissions SELECT * FROM contact_submissions_old;
DROP TABLE contact_submissions_old;
