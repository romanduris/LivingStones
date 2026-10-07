CREATE TABLE stone_watchers (
  stone_id TEXT NOT NULL REFERENCES stones(id) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE CHECK(length(email) BETWEEN 3 AND 254),
  created_at TEXT NOT NULL,
  PRIMARY KEY (stone_id, email)
);
