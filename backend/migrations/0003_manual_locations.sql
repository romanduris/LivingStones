PRAGMA defer_foreign_keys = ON;
CREATE TABLE finds_manual (
 id TEXT PRIMARY KEY, stone_id TEXT NOT NULL REFERENCES stones(id), occurred_at TEXT NOT NULL,
 lat REAL NOT NULL CHECK(lat BETWEEN -90 AND 90), lon REAL NOT NULL CHECK(lon BETWEEN -180 AND 180),
 accuracy REAL CHECK(accuracy >= 0), city TEXT NOT NULL, country TEXT NOT NULL, address TEXT NOT NULL DEFAULT '',
 nickname TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('seed','gps','demo','manual'))
);
INSERT INTO finds_manual SELECT * FROM finds;
DROP TABLE finds;
ALTER TABLE finds_manual RENAME TO finds;
CREATE INDEX finds_journey ON finds(stone_id, occurred_at, id);
PRAGMA defer_foreign_keys = OFF;
