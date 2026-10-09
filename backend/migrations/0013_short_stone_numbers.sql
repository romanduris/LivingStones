-- Human-readable labels do not replace IDs in existing QR links or foreign keys.
CREATE TABLE stone_numbers (
 number INTEGER PRIMARY KEY AUTOINCREMENT CHECK(number BETWEEN 1 AND 9999),
 stone_id TEXT NOT NULL UNIQUE REFERENCES stones(id) ON DELETE CASCADE
);
INSERT INTO stone_numbers(stone_id) SELECT id FROM stones WHERE is_demo=0 ORDER BY COALESCE((SELECT MIN(occurred_at) FROM finds WHERE stone_id=stones.id),'9999'),id;
