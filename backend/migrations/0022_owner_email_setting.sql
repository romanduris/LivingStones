CREATE TABLE owner_email_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
INSERT INTO owner_email_settings(id,enabled) VALUES (1,1);
