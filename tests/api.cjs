const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const state = fs.mkdtempSync(path.join(os.tmpdir(), "livingstones-d1-"));
const config = "wrangler.local.jsonc",
  port = 8791;
function cli(args) {
  return execFileSync(
    "node",
    ["node_modules/wrangler/bin/wrangler.js", ...args, "--config", config],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
}
const origin = "http://127.0.0.1:8137";
async function call(endpoint, body, key = randomUUID(), custom = {}) {
  const r = await fetch(`http://127.0.0.1:${port}/api` + endpoint, {
    method: body ? "POST" : "GET",
    headers: {
      Origin: origin,
      ...(body
        ? { "Content-Type": "application/json", "Idempotency-Key": key }
        : {}),
      ...custom,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: r.status, headers: r.headers, body: await r.json() };
}
(async () => {
  let server;
  try {
    cli([
      "d1",
      "migrations",
      "apply",
      "livingstones-local-db",
      "--local",
      "--persist-to",
      state,
    ]);
    cli([
      "d1",
      "execute",
      "livingstones-local-db",
      "--local",
      "--persist-to",
      state,
      "--file",
      "backend/seed.sql",
    ]);
    server = spawn(
      "node",
      [
        "node_modules/wrangler/bin/wrangler.js",
        "dev",
        "--config",
        config,
        "--port",
        String(port),
        "--persist-to",
        state,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      },
    );
    let logs = "";
    server.stdout.on("data", (d) => (logs += d));
    server.stderr.on("data", (d) => (logs += d));
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try {
        ready = (await call("/health")).status === 200;
      } catch {}
      if (ready) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    assert.ok(ready, logs);
    let result = await call("/stones");
    assert.equal(result.status, 200);
    assert.equal(result.body.stones.length, 5);
    assert.equal(
      result.body.stones.reduce((n, s) => n + s.finds.length, 0),
      25,
    );
    assert.equal(
      result.body.stones.reduce((n, s) => n + s.comments.length, 0),
      25,
    );
    assert.ok(!JSON.stringify(result.body).includes("code_hash"));
    assert.equal((await call("/stones/unknown")).status, 404);
    assert.equal(
      (await call("/stones/A1/verify", { code: "WRONG" })).status,
      403,
    );
    assert.equal(
      (await call("/stones/A1/verify", { code: "SUN24" })).status,
      200,
    );
    assert.equal(
      (
        await call("/stones/A1/verify", { code: "SUN24" }, undefined, {
          Origin: "https://evil.invalid",
        })
      ).status,
      403,
    );
    const initial = (await call("/stones/A1")).body.stone;
    assert.equal(initial.creator, "Nina");
    const note = {
      code: "SUN24",
      nickname: "<b>Friend</b>",
      message: "A note from another browser.",
    };
    const noteKey = randomUUID();
    const saved = await call("/stones/A1/comments", note, noteKey);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.stone.finds.length, 5);
    assert.equal(saved.body.stone.comments.length, 6);
    assert.deepEqual(
      saved.body.stone.finds,
      initial.finds,
      "Comments do not move or revive a stone",
    );
    assert.equal(
      (await call("/stones/A1/comments", note, noteKey)).body.replayed,
      true,
    );
    assert.equal(
      (
        await call(
          "/stones/A1/comments",
          { ...note, message: "Changed" },
          noteKey,
        )
      ).status,
      409,
    );
    assert.equal(
      (await call("/stones/A1/comments", { ...note, message: "" })).status,
      400,
    );
    assert.equal(
      (await call("/stones/A1/comments", { ...note, message: "x".repeat(401) }))
        .status,
      400,
    );
    const find = {
      code: "SUN24",
      nickname: "Tester",
      message: "Our saved adventure.",
      place: {
        lat: 48.156,
        lon: 17.155,
        accuracy: 25,
        city: "Bratislava",
        country: "Slovakia",
        address: "Ľanová 8, Ružinov",
        source: "gps",
      },
    };
    assert.equal(
      (
        await call("/stones/A1/finds", {
          ...find,
          place: { ...find.place, lat: 200 },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await call("/stones/A1/finds", {
          ...find,
          place: { ...find.place, accuracy: -1 },
        })
      ).status,
      400,
    );
    const key = randomUUID();
    const concurrent = await Promise.all([
      call("/stones/A1/finds", find, key),
      call("/stones/A1/finds", find, key),
    ]);
    assert.deepEqual(
      concurrent.map((r) => r.status),
      [200, 200],
    );
    let current = (await call("/stones/A1")).body.stone;
    assert.equal(
      current.finds.length,
      6,
      "Concurrent duplicate requests commit only one find",
    );
    assert.equal(
      current.comments.length,
      7,
      "Find and optional note commit together",
    );
    assert.equal(current.finds.at(-1).address, "Ľanová 8, Ružinov");
    assert.equal(current.finds.at(-1).message, "Our saved adventure.");
    assert.ok(
      Date.parse(current.finds.at(-1).date) >
        Date.parse(initial.finds.at(-1).date),
    );
    assert.equal(
      (await call("/stones/A1/finds", find, key)).body.replayed,
      true,
    );
    // Re-seeding cannot overwrite or erase new records, even after deployment.
    cli([
      "d1",
      "execute",
      "livingstones-local-db",
      "--local",
      "--persist-to",
      state,
      "--file",
      "backend/seed.sql",
    ]);
    current = (await call("/stones/A1")).body.stone;
    assert.equal(current.finds.length, 6);
    assert.equal(current.comments.length, 7);
    // A real stone's code is not public and fictional locations are refused.
    cli([
      "d1",
      "execute",
      "livingstones-local-db",
      "--local",
      "--persist-to",
      state,
      "--command",
      "UPDATE stones SET is_demo=0,demo_code=NULL WHERE id='C3'",
    ]);
    const real = (await call("/stones/C3")).body.stone;
    assert.equal(real.demo, false);
    assert.ok(!("code" in real));
    assert.equal(
      (
        await call("/stones/C3/finds", {
          ...find,
          code: "GROW3",
          place: { ...find.place, source: "demo" },
        })
      ).status,
      400,
    );
    const preflight = await fetch(
      `http://127.0.0.1:${port}/api/stones/A1/finds`,
      { method: "OPTIONS", headers: { Origin: origin } },
    );
    assert.equal(preflight.status, 204);
    assert.match(
      preflight.headers.get("Access-Control-Allow-Headers"),
      /Idempotency-Key/,
    );
    let limited;
    for (let i = 0; i < 45; i++) {
      limited = await call("/stones/A1/verify", { code: "bad" });
      if (limited.status === 429) break;
    }
    assert.equal(limited.status, 429);
    console.log(
      "Passed: real local D1 migrations, seed preservation, persistent finds/notes, atomic writes, concurrent idempotency, validation, private real codes, CORS and rate limits.",
    );
  } finally {
    server?.kill("SIGTERM");
    fs.rmSync(state, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
