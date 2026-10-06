const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, execFileSync } = require("node:child_process");
const { randomUUID, createHash } = require("node:crypto");
const managementPassword = randomUUID()+randomUUID();
const managementHash = createHash("sha256").update(managementPassword).digest("hex");
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
        "--var",
        "ADMIN_PASSWORD_HASH:"+managementHash,
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
    assert.ok(result.body.stones.every(stone => !("tagline" in stone) && !("story" in stone)));
    assert.equal((await call("/stones/unknown")).status, 404);
    assert.equal(
      (await call("/stones/A1/verify", { code: "WRONG" })).status,
      403,
    );
    assert.equal(
      (await call("/stones/A1/verify", { code: "8451" })).status,
      200,
    );
    assert.equal(
      (
        await call("/stones/A1/verify", { code: "8451" }, undefined, {
          Origin: "https://evil.invalid",
        })
      ).status,
      403,
    );
    const initial = (await call("/stones/A1")).body.stone;
    assert.equal(initial.creator, "Nina");
    const note = {
      code: "8451",
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
      code: "8451",
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
    // Rebuilding the source constraint preserves existing finds, attached notes and replay IDs.
    const beforeMigration = structuredClone(current);
    cli(["d1", "execute", "livingstones-local-db", "--local", "--persist-to", state, "--file", "backend/migrations/0003_manual_locations.sql"]);
    assert.deepEqual((await call("/stones/A1")).body.stone, beforeMigration);
    assert.equal((await call("/stones/A1/finds", find, key)).body.replayed, true);
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
          code: "8453",
          place: { ...find.place, source: "demo" },
        })
      ).status,
      400,
    );
    const manual = { ...find, code:"8453", place:{lat:48.735429,lon:19.1457338,city:"Banská Bystrica",country:"Slovakia",address:"Approximate city location",source:"manual"} };
    const manualKey = randomUUID();
    const manualSaved = await call("/stones/C3/finds", manual, manualKey);
    assert.equal(manualSaved.status, 200);
    assert.equal(manualSaved.body.stone.finds.at(-1).source, "manual");
    assert.equal(manualSaved.body.stone.finds.at(-1).accuracy, null);
    assert.equal((await call("/stones/C3/finds", manual, manualKey)).body.replayed, true);
    assert.equal((await call("/stones/C3")).body.stone.finds.at(-1).lat, 48.735429);
    assert.equal((await call("/stones/C3/finds", {...manual,place:{...manual.place,source:"invalid"}})).status, 400);
    const preflight = await fetch(
      `http://127.0.0.1:${port}/api/stones/A1/finds`,
      { method: "OPTIONS", headers: { Origin: origin } },
    );
    assert.equal(preflight.status, 204);
    assert.match(
      preflight.headers.get("Access-Control-Allow-Headers"),
      /Idempotency-Key/,
    );
    // Real admin sessions, no unauthenticated management reads or writes.
    assert.equal((await call("/admin/stats")).status,401);
    assert.equal((await call("/admin/stones")).status,401);
    assert.equal((await call("/admin/stones",null,null,{Authorization:"Bearer "+"a".repeat(64)})).status,401);
    assert.equal((await call("/admin/login",{password:managementPassword},null,{Origin:"https://bad.invalid"})).status,403);
    assert.equal((await call("/admin/login",{password:"incorrect"})).status,401);
    const login = await call("/admin/login",{password:managementPassword});
    assert.equal(login.status,200);assert.match(login.body.token,/^[a-f0-9]{64}$/);
    const bearer={Authorization:"Bearer "+login.body.token};
    async function admin(path,method="GET",body,headers={}) {
      const response=await fetch(`http://127.0.0.1:${port}/api/admin/`+path,{method,headers:{Origin:origin,...bearer,...headers,...(body?{"Content-Type":"application/json"}:{})},...(body?{body:JSON.stringify(body)}:{})});
      return {status:response.status,body:await response.json()};
    }
    assert.equal((await admin("stones")).body.stones.length,5);
    const beforeViews=(await call("/stones/A1")).body.stone;
    const event=randomUUID();
    const counted=await Promise.all(Array.from({length:4},()=>call("/stones/A1/views",{viewId:event})));
    assert.ok(counted.every(r=>r.status===200));
    const afterViews=(await call("/stones/A1")).body.stone;
    assert.equal(afterViews.views,1);assert.deepEqual(afterViews.finds,beforeViews.finds);assert.deepEqual(afterViews.comments,beforeViews.comments);
    assert.equal((await call("/stones/A1/views",{viewId:"bad"})).status,400);
    assert.equal((await call("/stones/unknown/views",{viewId:randomUUID()})).status,404);
    assert.equal((await admin("stones/A1")).body.stone.views,1);
    const homeEvent=randomUUID();
    const homeCounts=await Promise.all(Array.from({length:4},()=>call('/page-views',{viewId:homeEvent})));
    assert.ok(homeCounts.every(r=>r.status===200));
    assert.equal((await call('/page-views',{viewId:'bad'})).status,400);
    assert.equal((await call('/page-views',{viewId:randomUUID()},null,{Origin:'https://bad.invalid'})).status,403);
    assert.equal((await admin('stats?period=invalid')).status,400);
    const traffic=(await admin('stats?period=7')).body;
    assert.equal(traffic.targets.find(t=>t.key==='home').totalViews,1);
    assert.equal(traffic.targets.find(t=>t.key==='stone:A1').totalViews,1);
    assert.equal(traffic.days.reduce((n,d)=>n+d.views,0),2);
    assert.equal((Date.parse(traffic.range.to)-Date.parse(traffic.range.from))/86400000,6);
    let managed=(await admin("stones/A1")).body.stone;
    const originalName=managed.name;
    assert.equal((await admin("stones/A1","PATCH",{...managed,name:"Managed Sunny Side",creator:"Admin creator"})).status,200);
    assert.equal((await call("/stones/A1")).body.stone.name,"Managed Sunny Side");
    assert.equal((await admin("stones/A1","PATCH",{...managed,demo:false})).status,400);
    assert.equal((await admin("stones/A1","PATCH",{...managed,demo:false,code:"8451"})).status,400);
    assert.equal((await admin("stones/A1","PATCH",{...managed,demo:false,code:"PRIVATE9876"})).status,200);
    const realAdmin=(await call("/stones/A1")).body.stone;assert.equal(realAdmin.demo,false);assert.ok(!('code' in realAdmin));
    assert.equal((await call("/stones/A1/verify",{code:"PRIVATE9876"})).status,200);
    assert.equal((await admin("stones/A1","PATCH",{...managed,name:originalName,demo:true,code:"8451"})).status,200);
    managed=(await admin("stones/A1")).body.stone;
    const linked=managed.comments.find(c=>c.findId);
    assert.equal((await admin(`stones/A1/comments/${linked.id}`,"PATCH",{nickname:"<img src=x>",message:"Edited note"})).status,200);
    const withEdit=(await call("/stones/A1")).body.stone;
    assert.equal(withEdit.comments.find(c=>c.id===linked.id).message,"Edited note");
    assert.equal(withEdit.finds.find(f=>f.id===linked.findId).nickname,"<img src=x>");
    assert.equal((await admin(`stones/E5/comments/${linked.id}`,"DELETE")).status,404);
    assert.equal((await admin(`stones/A1/comments/${linked.id}`,"DELETE")).status,200);
    assert.ok((await call("/stones/A1")).body.stone.finds.some(f=>f.id===linked.findId));
    const first=managed.finds[0],last=managed.finds.at(-1);
    assert.equal((await admin(`stones/A1/finds/${first.id}`,"DELETE")).status,409);
    assert.equal((await admin(`stones/A1/finds/${last.id}`,"PATCH",{...last,city:"Admin city",lat:49,lon:19,source:"manual",accuracy:null})).status,200);
    assert.equal((await call("/stones/A1")).body.stone.finds.at(-1).city,"Admin city");
    assert.equal((await admin(`stones/A1/finds/${last.id}`,"PATCH",{...last,date:"2025-01-01T00:00:00Z"})).status,400);
    assert.equal((await admin(`stones/A1/finds/${last.id}`,"DELETE")).status,200);
    assert.ok(!(await call("/stones/A1")).body.stone.finds.some(f=>f.id===last.id));
    // A complete deletion removes all dependent records and survives another read.
    assert.equal((await admin("stones/A1","DELETE",null,{Origin:"https://bad.invalid"})).status,403);
    assert.equal((await admin("stones/A1","DELETE")).status,200);
    assert.equal((await call("/stones/A1")).status,404);
    const retained=(await admin('stats?period=all')).body.targets.find(t=>t.key==='stone:A1');
    assert.equal(retained.deleted,true);assert.equal(retained.totalViews,1);
    const tables=JSON.parse(cli(["d1","execute","livingstones-local-db","--local","--persist-to",state,"--json","--command","SELECT (SELECT COUNT(*) FROM finds WHERE stone_id='A1') AS finds,(SELECT COUNT(*) FROM comments WHERE stone_id='A1') AS comments,(SELECT COUNT(*) FROM submissions WHERE stone_id='A1') AS submissions,(SELECT COUNT(*) FROM stone_views WHERE stone_id='A1') AS views"]));
    assert.deepEqual(tables[0].results[0],{finds:0,comments:0,submissions:0,views:0});
    assert.equal((await admin("logout","POST",{})).status,200);
    assert.equal((await admin("stones")).status,401);
    const secondLogin=await call("/admin/login",{password:managementPassword});
    const expiredHash=createHash("sha256").update(secondLogin.body.token).digest("hex");
    cli(["d1","execute","livingstones-local-db","--local","--persist-to",state,"--command",`UPDATE admin_sessions SET expires_at=0 WHERE token_hash='${expiredHash}'`]);
    assert.equal((await call("/admin/stones",null,null,{Authorization:"Bearer "+secondLogin.body.token})).status,401);
    let loginLimited;
    for(let i=0;i<12;i++){
      loginLimited=await call("/admin/login",{password:"incorrect"});
      if(loginLimited.status===429)break;
    }
    assert.equal(loginLimited.status,429);
    let limited;
    for (let i = 0; i < 45; i++) {
      limited = await call("/stones/B2/verify", { code: "bad" });
      if (limited.status === 429) break;
    }
    assert.equal(limited.status, 429);
    console.log(
      "Passed: real local D1 migrations, seed preservation, persistent finds/notes, atomic writes, concurrent idempotency, validation, private real codes, CORS, authenticated management CRUD/session revocation, atomic view counting and separate rate limits.",
    );
  } finally {
    server?.kill("SIGTERM");
    fs.rmSync(state, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
