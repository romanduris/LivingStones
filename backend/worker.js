import { fail, sha256, text, requireOrigin, jsonBody, limit } from "./common.js";
import { handleManagement } from "./management.js";
async function listStones(db, id, admin = false) {
  const where = id ? " WHERE id = ?" : "";
  const statements = [
    db.prepare(
      "SELECT id,name,story,born,image,theme,color,is_demo,demo_code,creator,views FROM stones" +
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
    name: s.name,
    story: s.story,
    started: s.born,
    creator: s.creator,
    image: s.image,
    theme: s.theme,
    color: s.color,
    demo: Boolean(s.is_demo),
    views: s.views,
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
  const match = path.match(
    /^\/api\/stones\/([A-Za-z0-9_-]{1,32})(?:\/(verify|finds|comments|views))?$/,
  );
  if (!match) fail(404, "That page could not be found.");
  const [, id, kind] = match;
  if (request.method === "GET" && !kind) {
    const stone = (await listStones(env.DB, id))[0];
    if (!stone) fail(404, "This stone could not be found.");
    return { stone };
  }
  if (request.method !== "POST" || !kind) fail(405, "Method not allowed.");
  requireOrigin(request, env);
  const body = await jsonBody(request);
  if (kind === "views") {
    const viewId = text(body.viewId, 80, true);
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(viewId)) fail(400, "Invalid view event.");
    if (!await env.DB.prepare("SELECT id FROM stones WHERE id=?").bind(id).first()) fail(404, "This stone could not be found.");
    await limit(request, env, "views", 120);
    await env.DB.batch([
      env.DB.prepare("UPDATE stones SET views=views+1 WHERE id=? AND NOT EXISTS(SELECT 1 FROM stone_views WHERE id=?)").bind(id, viewId),
      env.DB.prepare("INSERT INTO stone_views(id,stone_id,created_at) VALUES (?,?,?) ON CONFLICT(id) DO NOTHING").bind(viewId, id, new Date().toISOString()),
      env.DB.prepare("DELETE FROM stone_views WHERE created_at < ?").bind(new Date(Date.now()-30*86400000).toISOString()),
    ]);
    return { views: (await env.DB.prepare("SELECT views FROM stones WHERE id=?").bind(id).first()).views };
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
