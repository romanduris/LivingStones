-- Codes for reprinting labels are read only by authenticated management.
-- Public verification continues to use code_hash.
ALTER TABLE stones ADD COLUMN label_code TEXT CHECK(label_code IS NULL OR length(label_code) BETWEEN 4 AND 32);
UPDATE stones SET label_code=demo_code WHERE is_demo=1;
