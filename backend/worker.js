import { fail, sha256, text, requireOrigin, jsonBody, limit } from "./common.js";
import { recordTraffic } from "./traffic.js";
import { handleManagement } from "./management.js";
import { initializeStone, availableImages } from "./initialization.js";
async function listStones(db, id, admin = false) {
  const where = id ? " WHERE id = ?" : admin ? "" : " WHERE initialized = 1";
  const statements = [
    db.prepare(
      "SELECT id,name,born,image,theme,color,is_demo,demo_code,creator,views,initialized" +
        (admin ? ",admin_note" : "") + " FROM stones" +
        where +
        (id ? "" : " ORDER BY id"),
    ),
    db.prepare(
      "SELECT * FROM finds" +
        (id ? " WHERE stone_id = ?" : "") +
        " ORDER BY occurred_at,id",
    ),
    db.prepare(
      "SELECT * FROM comments" +
        (id ? " WHERE stone_id = ?" : "") +
        " ORDER BY created_at,id",
    ),
  ].map((s) => (id ? s.bind(id) : s));
  const [stones, finds, comments] = await db.batch(statements);
  return stones.results.map((s) => ({
    id: s.id,
    initialized: Boolean(s.initialized),
    name: s.name,
    started: s.born,
    creator: s.creator,
    image: s.image,
    theme: s.theme,
    color: s.color,
    demo: Boolean(s.is_demo),
    views: s.views,
    ...(admin ? { adminNote: s.admin_note } : {}),
    ...(s.is_demo ? { code: s.demo_code } : {}),
    finds: finds.results
      .filter((f) => f.stone_id === s.id)
      .map((f) => ({
        id: f.id,
        date: !admin && f.source === "seed" ? f.occurred_at.slice(0, 10) : f.occurred_at,
        lat: f.lat,
        lon: f.lon,
        accuracy: f.accuracy,
        city: f.city,
        country: f.country,
        address: f.address,
        nickname: f.nickname,
        source: f.source,
        message:
          comments.results.find((c) => c.find_id === f.id)?.message || "",
      })),
    comments: comments.results
      .filter((c) => c.stone_id === s.id)
      .map((c) => ({
        id: c.id,
        findId: c.find_id,
        date: c.created_at,
        nickname: c.nickname,
        message: c.message,
      })),
  }));
}
async function handle(request, env) {
  const url = new URL(request.url),
    path = url.pathname;
  if (path.startsWith("/api/admin/")) return handleManagement(request, env, listStones);
  if (request.method === "GET" && path === "/api/health") {
    await env.DB.prepare("SELECT id FROM stones LIMIT 1").first();
    return { ok: true, service: "livingstones-api" };
  }
  if (request.method === "GET" && path === "/api/stones")
    return { stones: await listStones(env.DB) };
  if (path === "/api/page-views" && request.method === "POST") {
    requireOrigin(request, env);
    return recordTraffic(request, env, await jsonBody(request));
  }
  const match = path.match(
    /^\/api\/stones\/([A-Za-z0-9_-]{1,32})(?:\/(verify|finds|comments|views|watchdog|initialize|images))?$/,
  );
  if (!match) fail(404, "That page could not be found.");
  const [, id, kind] = match;
  if (request.method === "GET" && kind === "images") return availableImages(env, id);
  if (request.method === "GET" && !kind) {
    const stone = (await listStones(env.DB, id))[0];
    if (!stone) fail(404, "This stone could not be found.");
    return { stone };
  }
  if (request.method !== "POST" || !kind) fail(405, "Method not allowed.");
  requireOrigin(request, env);
  const body = await jsonBody(request);
  if (kind === "initialize") return initializeStone(request, env, id, body, listStones);
  if (kind !== "verify") {
    const state = await env.DB.prepare("SELECT initialized FROM stones WHERE id=?").bind(id).first();
    if (state && !state.initialized) fail(409, "This stone is waiting to be born. Finish its setup first.");
  }
  if (kind === "views") return recordTraffic(request, env, body, id);
  if (kind === "watchdog") {
    await limit(request, env, "watchdog", 10);
    const stone = await env.DB.prepare("SELECT id FROM stones WHERE id = ?").bind(id).first();
    if (!stone) fail(404, "This stone could not be found.");
    const email = text(body.email, 254, true).toLowerCase();
    const localPart = email.split("@")[0];
    if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email) || localPart.length > 64 || localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes(".."))
      fail(400, "Enter a valid email address.");
    // A retry or a second signup must not reveal existing subscribers.
    await env.DB.prepare(
      "INSERT INTO stone_watchers(stone_id,email,created_at) VALUES (?,?,?) ON CONFLICT(stone_id,email) DO NOTHING",
    ).bind(id, email, new Date().toISOString()).run();
    return { ok: true, notificationsEnabled: false };
  }
  await limit(request, env, "public", 40);
  const stone = await env.DB.prepare(
    "SELECT code_hash,is_demo FROM stones WHERE id = ?",
  )
    .bind(id)
    .first();
  if (!stone) fail(404, "This stone could not be found.");
  const code = text(body.code, 32, true).toUpperCase();
  if ((await sha256(code)) !== stone.code_hash)
    fail(
      403,
      "That code doesn’t match this stone. Check the back of the stone.",
    );
  if (kind === "verify") return { ok: true };
  const key = request.headers.get("Idempotency-Key");
  if (!key || !/^[a-zA-Z0-9-]{16,80}$/.test(key))
    fail(400, "Please retry from the form.");
  const nickname = text(body.nickname, 40) || "A kind stranger";
  const message = text(body.message, 400, kind === "comments");
  let place;
  if (kind === "finds") {
    place = body.place;
    if (
      !place ||
      typeof place.lat !== "number" ||
      typeof place.lon !== "number" ||
      !Number.isFinite(place.lat) ||
      !Number.isFinite(place.lon) ||
      Math.abs(place.lat) > 90 ||
      Math.abs(place.lon) > 180
    )
      fail(400, "Choose a valid location first.");
    if (
      !["gps", "manual", "demo"].includes(place.source) ||
      (place.source === "demo" && !stone.is_demo)
    )
      fail(400, "Choose your GPS location or select a city.");
    if (
      place.source === "gps" &&
      (typeof place.accuracy !== "number" ||
        !Number.isFinite(place.accuracy) ||
        place.accuracy < 0)
    )
      fail(400, "Please request your GPS location again.");
    place = {
      lat: place.lat,
      lon: place.lon,
      accuracy: place.source === "gps" ? place.accuracy : null,
      source: place.source,
      city: text(place.city, 120, true),
      country: text(place.country, 80, true),
      address: text(place.address, 300),
    };
  }
  const fingerprint = await sha256(
    JSON.stringify({ id, kind, nickname, message, place: place || null }),
  );
  const existing = await env.DB.prepare(
    "SELECT * FROM submissions WHERE id = ?",
  )
    .bind(key)
    .first();
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      fail(409, "That request was already used. Close the form and try again.");
    return {
      stone: (await listStones(env.DB, id))[0],
      recordId: existing.record_id,
      replayed: true,
    };
  }
  const recordId = crypto.randomUUID(),
    date = new Date().toISOString();
  const claim = env.DB.prepare(
    "INSERT INTO submissions(id,fingerprint,stone_id,record_id,kind,created_at) VALUES (?,?,?,?,?,?)",
  ).bind(key, fingerprint, id, recordId, kind, date);
  const statements = [claim];
  if (kind === "finds")
    statements.push(
      env.DB.prepare(
        "INSERT INTO finds(id,stone_id,occurred_at,lat,lon,accuracy,city,country,address,nickname,source) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      ).bind(
        recordId,
        id,
        date,
        place.lat,
        place.lon,
        place.accuracy,
        place.city,
        place.country,
        place.address,
        nickname,
        place.source,
      ),
    );
  if (message)
    statements.push(
      env.DB.prepare(
        "INSERT INTO comments(id,stone_id,find_id,created_at,nickname,message) VALUES (?,?,?,?,?,?)",
      ).bind(
        kind === "comments" ? recordId : crypto.randomUUID(),
        id,
        kind === "finds" ? recordId : null,
        date,
        nickname,
        message,
      ),
    );
  // D1 batch is transactional: a find and its message are committed together.
  try {
    await env.DB.batch(statements);
  } catch (error) {
    // Concurrent retries can race between reading the key and claiming it.
    const saved = await env.DB.prepare("SELECT * FROM submissions WHERE id = ?")
      .bind(key)
      .first();
    if (!saved) throw error;
    if (saved.fingerprint !== fingerprint)
      fail(409, "That request was already used. Close the form and try again.");
    return {
      stone: (await listStones(env.DB, id))[0],
      recordId: saved.record_id,
      replayed: true,
    };
  }
  return { stone: (await listStones(env.DB, id))[0], recordId };
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").includes(origin);
    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      Vary: "Origin",
      "X-Content-Type-Options": "nosniff",
      ...(allowed ? { "Access-Control-Allow-Origin": origin } : {}),
    };
    if (request.method === "OPTIONS")
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: {
          ...headers,
          "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key, Authorization",
          "Access-Control-Max-Age": "600",
        },
      });
    try {
      return new Response(JSON.stringify(await handle(request, env)), {
        headers,
      });
    } catch (error) {
      if (!error.status)
        console.error("Living Stones API request failed", error);
      return new Response(
        JSON.stringify({
          error: error.status
            ? error.message
            : "We couldn’t save or load this moment. Please try again.",
        }),
        { status: error.status || 500, headers },
      );
    }
  },
};
