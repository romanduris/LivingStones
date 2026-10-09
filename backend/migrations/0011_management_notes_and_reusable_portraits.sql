ALTER TABLE stones ADD COLUMN admin_note TEXT NOT NULL DEFAULT '' CHECK(length(admin_note) <= 2000);
-- Portraits from stones deleted before this change become available again.
UPDATE stone_image_pool SET claimed_at=NULL
WHERE stone_id IS NULL AND NOT EXISTS (
 SELECT 1 FROM stones WHERE initialized=1 AND stones.image=stone_image_pool.image
);
