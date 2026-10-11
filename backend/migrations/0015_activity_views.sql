-- Activity counters start at deployment; historical per-entry QR sources are unavailable.
ALTER TABLE finds ADD COLUMN views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0);
ALTER TABLE finds ADD COLUMN qr_views INTEGER NOT NULL DEFAULT 0 CHECK(qr_views >= 0 AND qr_views <= views);
ALTER TABLE comments ADD COLUMN views INTEGER NOT NULL DEFAULT 0 CHECK(views >= 0);
ALTER TABLE comments ADD COLUMN qr_views INTEGER NOT NULL DEFAULT 0 CHECK(qr_views >= 0 AND qr_views <= views);
