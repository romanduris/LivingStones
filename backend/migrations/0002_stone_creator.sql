ALTER TABLE stones ADD COLUMN creator TEXT;
-- Original demo birth entries explicitly identify the people who painted them.
-- A real stone's creator must be supplied independently of its finders.
UPDATE stones
SET creator = (SELECT nickname FROM finds WHERE id = 'seed-' || stones.id || '-1')
WHERE is_demo = 1 AND creator IS NULL;
