ALTER TABLE stones ADD COLUMN initialized INTEGER NOT NULL DEFAULT 1 CHECK(initialized IN (0,1));
ALTER TABLE stones ADD COLUMN creation_key TEXT;
CREATE UNIQUE INDEX stone_creation_key ON stones(creation_key);
CREATE TABLE stone_image_pool (
 id TEXT PRIMARY KEY, image TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
 theme TEXT NOT NULL, color TEXT NOT NULL,
 stone_id TEXT UNIQUE REFERENCES stones(id) ON DELETE SET NULL,
 claimed_at TEXT
);
CREATE TABLE stone_initializations (
 id TEXT PRIMARY KEY, stone_id TEXT NOT NULL UNIQUE REFERENCES stones(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL, created_at TEXT NOT NULL
);
-- claimed_at remains set after a deletion: an adopted portrait is never reused.
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-01','birth-stones/birth-01.svg','Honey Sun','sun','#ffcf64');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-02','birth-stones/birth-02.svg','Honey Moon','moon','#ffcf64');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-03','birth-stones/birth-03.svg','Honey Leaf','leaf','#ffcf64');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-04','birth-stones/birth-04.svg','Honey Heart','heart','#ffcf64');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-05','birth-stones/birth-05.svg','Honey Wave','wave','#ffcf64');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-06','birth-stones/birth-06.svg','Lavender Sun','sun','#b49aff');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-07','birth-stones/birth-07.svg','Lavender Moon','moon','#b49aff');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-08','birth-stones/birth-08.svg','Lavender Leaf','leaf','#b49aff');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-09','birth-stones/birth-09.svg','Lavender Heart','heart','#b49aff');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-10','birth-stones/birth-10.svg','Lavender Wave','wave','#b49aff');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-11','birth-stones/birth-11.svg','Mint Sun','sun','#62d7cb');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-12','birth-stones/birth-12.svg','Mint Moon','moon','#62d7cb');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-13','birth-stones/birth-13.svg','Mint Leaf','leaf','#62d7cb');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-14','birth-stones/birth-14.svg','Mint Heart','heart','#62d7cb');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-15','birth-stones/birth-15.svg','Mint Wave','wave','#62d7cb');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-16','birth-stones/birth-16.svg','Rose Sun','sun','#ff8c92');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-17','birth-stones/birth-17.svg','Rose Moon','moon','#ff8c92');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-18','birth-stones/birth-18.svg','Rose Leaf','leaf','#ff8c92');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-19','birth-stones/birth-19.svg','Rose Heart','heart','#ff8c92');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-20','birth-stones/birth-20.svg','Rose Wave','wave','#ff8c92');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-21','birth-stones/birth-21.svg','Ocean Sun','sun','#76c9ee');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-22','birth-stones/birth-22.svg','Ocean Moon','moon','#76c9ee');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-23','birth-stones/birth-23.svg','Ocean Leaf','leaf','#76c9ee');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-24','birth-stones/birth-24.svg','Ocean Heart','heart','#76c9ee');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-25','birth-stones/birth-25.svg','Ocean Wave','wave','#76c9ee');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-26','birth-stones/birth-26.svg','Peach Sun','sun','#ffb879');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-27','birth-stones/birth-27.svg','Peach Moon','moon','#ffb879');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-28','birth-stones/birth-28.svg','Peach Leaf','leaf','#ffb879');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-29','birth-stones/birth-29.svg','Peach Heart','heart','#ffb879');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-30','birth-stones/birth-30.svg','Peach Wave','wave','#ffb879');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-31','birth-stones/birth-31.svg','Silver Sun','sun','#b0bac5');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-32','birth-stones/birth-32.svg','Silver Moon','moon','#b0bac5');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-33','birth-stones/birth-33.svg','Silver Leaf','leaf','#b0bac5');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-34','birth-stones/birth-34.svg','Silver Heart','heart','#b0bac5');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-35','birth-stones/birth-35.svg','Silver Wave','wave','#b0bac5');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-36','birth-stones/birth-36.svg','Lilac Sun','sun','#d29cdf');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-37','birth-stones/birth-37.svg','Lilac Moon','moon','#d29cdf');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-38','birth-stones/birth-38.svg','Lilac Leaf','leaf','#d29cdf');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-39','birth-stones/birth-39.svg','Lilac Heart','heart','#d29cdf');
INSERT INTO stone_image_pool(id,image,label,theme,color) VALUES ('birth-40','birth-stones/birth-40.svg','Lilac Wave','wave','#d29cdf');
