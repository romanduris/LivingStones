"use strict";
// Public API address only. Cloudflare credentials never belong in the browser.
const LIVINGSTONES_API = ["localhost", "127.0.0.1"].includes(location.hostname)
  ? "http://127.0.0.1:8787"
  : "https://livingstones-api.livingstones-romanduris.workers.dev";
