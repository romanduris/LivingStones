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
    assert.equal(result.body.stones.length, 14);
    assert.equal(
      result.body.stones.reduce((n, s) => n + s.finds.length, 0),
      70,
    );
    assert.equal(
      result.body.stones.reduce((n, s) => n + s.comments.length, 0),
      70,
    );
    assert.ok(!JSON.stringify(result.body).includes("code_hash"));
    assert.ok(result.body.stones.every(stone => !("tagline" in stone) && !("story" in stone)));
    const watched = await call("/stones/A1/watchdog", { email: "  Watcher+one@example.invalid  " });
    assert.equal(watched.status, 200);
    assert.deepEqual(watched.body, { ok: true, notificationsEnabled: false });
    assert.deepEqual((await call("/stones/A1/watchdog", { email: "WATCHER+ONE@EXAMPLE.INVALID" })).body, watched.body);
    assert.equal((await call("/stones/A1/watchdog", { email: "second@example.invalid" })).status, 200);
    assert.equal((await call("/stones/B2/watchdog", { email: "watcher+one@example.invalid" })).status, 200);
    const concurrentWatchers = await Promise.all([1, 2].map(() => call("/stones/A1/watchdog", { email: "parallel@example.invalid" }, undefined, { "CF-Connecting-IP": "192.0.2.10" })));
    assert.ok(concurrentWatchers.every(r => r.status === 200));
    const watchers = JSON.parse(cli(["d1", "execute", "livingstones-local-db", "--local", "--persist-to", state, "--json", "--command", "SELECT stone_id,email FROM stone_watchers ORDER BY stone_id,email"]));
    assert.deepEqual(watchers[0].results, [
      { stone_id: "A1", email: "parallel@example.invalid" },
      { stone_id: "A1", email: "second@example.invalid" },
      { stone_id: "A1", email: "watcher+one@example.invalid" },
      { stone_id: "B2", email: "watcher+one@example.invalid" },
    ]);
    for (const email of ["invalid", "a@b", "bad\naddress@example.invalid", 42])
      assert.equal((await call("/stones/A1/watchdog", { email })).status, 400);
    assert.equal((await call("/stones/unknown/watchdog", { email: "test@example.invalid" })).status, 404);
    assert.equal((await call("/stones/A1/watchdog", { email: "test@example.invalid" }, undefined, { Origin: "https://evil.invalid" })).status, 403);
    assert.equal((await call("/stones/A1/watchdog")).status, 405);
    assert.doesNotMatch(JSON.stringify((await call("/stones")).body), /example\.invalid|stone_watchers|watchdog|email/i);
    assert.doesNotMatch(JSON.stringify((await call("/stones/A1")).body), /example\.invalid|stone_watchers|watchdog|email/i);
    let watchLimited;
    for (let i = 0; i < 11; i++) watchLimited = await call("/stones/B2/watchdog", { email: "watcher+one@example.invalid" }, undefined, { "CF-Connecting-IP": "192.0.2.11" });
    assert.equal(watchLimited.status, 429);
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
    assert.equal((await admin("stones")).body.stones.length,14);
    // New labels are private; uninitialized stones stay off the public collection.
    assert.equal((await call('/admin/stones',{})).status,401);
    assert.equal((await admin('stones','POST',{}, {Origin:'https://bad.invalid','Idempotency-Key':randomUUID()})).status,403);
    assert.equal((await admin('stones','POST',{})).status,400);
    const creationKey=randomUUID();
    assert.equal((await call('/admin/stone-drafts',{})).status,401);
    assert.equal((await admin('stone-drafts','POST',{})).status,400);
    const preview=await admin('stone-drafts','POST',{}, {'Idempotency-Key':creationKey});
    assert.equal(preview.status,200);assert.equal(preview.body.draft,true);
    assert.equal((await call('/stones/'+preview.body.stone.id)).status,404);
    assert.equal((await admin('stones')).body.stones.length,14);
    const creations=await Promise.all([1,2].map(()=>admin('stones','POST',{note:'Saved with creation'}, {'Idempotency-Key':creationKey})));
    assert.ok(creations.every(r=>r.status===200));
    assert.deepEqual(creations[0].body,creations[1].body);
    const newborn=creations[0].body;
    assert.equal(newborn.stone.id,preview.body.stone.id);assert.equal(newborn.code,preview.body.code);
    assert.equal(newborn.stone.adminNote,'Saved with creation');
    assert.equal(newborn.stone.shortId,'S0001');
    assert.equal(newborn.stone.privateCode,newborn.code);
    assert.equal((await admin('stones/'+newborn.stone.id)).body.stone.privateCode,newborn.code);
    assert.equal((await admin('stones')).body.stones.find(s=>s.id===newborn.stone.id).privateCode,newborn.code);
    assert.ok(!('privateCode' in (await call('/stones/'+newborn.stone.id)).body.stone));
    assert.equal(newborn.stone.initialized,false);assert.match(newborn.code,/^[0-9]{4}$/);
    assert.equal(newborn.stone.finds.length,0);assert.equal(newborn.stone.started,'');
    assert.ok(!(await call('/stones')).body.stones.some(s=>s.id===newborn.stone.id));
    assert.equal((await call('/stones/'+newborn.stone.id)).body.stone.initialized,false);
    assert.ok(!('code' in (await call('/stones/'+newborn.stone.id)).body.stone));
    assert.equal((await admin('stones/'+newborn.stone.id,'PATCH',{})).status,409);
    assert.equal((await admin('stones')).body.imagesAvailable,40);
    const privateNote='Secret owner note <script>private()</script>\nSecond line';
    assert.equal((await call('/admin/stones/'+newborn.stone.id+'/note',{note:privateNote})).status,401);
    assert.equal((await admin('stones/'+newborn.stone.id+'/note','PATCH',{note:privateNote})).status,200);
    assert.equal((await admin('stones/'+newborn.stone.id)).body.stone.adminNote,privateNote);
    assert.equal((await admin('stones')).body.stones.find(s=>s.id===newborn.stone.id).adminNote,privateNote);
    assert.equal((await admin('stones/'+newborn.stone.id+'/note','PATCH',{note:'x'.repeat(2001)})).status,400);
    assert.equal((await admin('stones/'+newborn.stone.id+'/note','PATCH',{note:privateNote},{Origin:'https://bad.invalid'})).status,403);
    assert.equal((await admin('stones/unknown/note','PATCH',{note:privateNote})).status,404);
    assert.ok(!('adminNote' in (await call('/stones/'+newborn.stone.id)).body.stone));
    assert.ok(!JSON.stringify((await call('/stones')).body).includes('Secret owner note'));
    const candidates=await call('/stones/'+newborn.stone.id+'/images');
    assert.equal(candidates.body.available,40);assert.equal(candidates.body.images.length,12);
    assert.equal(new Set(candidates.body.images.map(i=>i.id)).size,12);
    assert.equal((await call('/stones/A1/images')).status,409);
    const birthBody={code:newborn.code,name:'First new stone',message:'May you bring joy <hello>!',creator:'Its painter',theme:'heart',imageId:candidates.body.images[0].id,place:{lat:48.148,lon:17.107,accuracy:8,source:'gps',city:'Bratislava',country:'Slovakia',address:'Birth street'}};
    const freshHeaders={'CF-Connecting-IP':'192.0.2.70'};
    const bornPath='/stones/'+newborn.stone.id;
    assert.equal((await call(bornPath+'/initialize',{...birthBody,code:'WRONG'},randomUUID(),freshHeaders)).status,403);
    assert.equal((await call(bornPath+'/initialize',{...birthBody,place:{...birthBody.place,source:'unknown'}},randomUUID(),freshHeaders)).status,400);
    assert.equal((await call(bornPath+'/initialize',{...birthBody,place:{...birthBody.place,lat:91}},randomUUID(),freshHeaders)).status,400);
    assert.equal((await call(bornPath+'/initialize',{...birthBody,message:'x'.repeat(401)},randomUUID(),freshHeaders)).status,400);
    assert.equal((await call(bornPath+'/initialize',{...birthBody,theme:'invalid'},randomUUID(),freshHeaders)).status,400);
    for(const kind of ['finds','comments','views','watchdog']) assert.equal((await call(bornPath+'/'+kind,{code:newborn.code,viewId:randomUUID(),email:'test@example.invalid'})).status,409);
    const other=(await admin('stones','POST',{}, {'Idempotency-Key':randomUUID()})).body;
    assert.equal(other.stone.shortId,'S0002');
    const birthKey=randomUUID(),otherKey=randomUUID(),beforeBirth=Date.now();
    const races=await Promise.all([
      call(bornPath+'/initialize',birthBody,birthKey,freshHeaders),
      call('/stones/'+other.stone.id+'/initialize',{...birthBody,code:other.code,name:'Other stone'},otherKey,freshHeaders),
    ]);
    assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
    const winnerIndex=races.findIndex(r=>r.status===200),winner=winnerIndex===0?newborn:other,loser=winnerIndex===0?other:newborn;
    const winningBody=winnerIndex===0?birthBody:{...birthBody,code:other.code,name:'Other stone'};
    const winningKey=winnerIndex===0?birthKey:otherKey;
    const born=races[winnerIndex].body.stone;
    assert.ok(!('privateCode' in born));
    assert.equal((await admin('stones/'+winner.stone.id)).body.stone.privateCode,winner.code);
    assert.equal(born.initialized,true);assert.equal(born.finds.length,1);assert.equal(born.theme,'heart');
    assert.equal(born.finds[0].message,birthBody.message);assert.equal(born.comments.length,1);assert.equal(born.comments[0].findId,born.finds[0].id);
    assert.equal(born.finds[0].source,'gps');assert.equal(born.finds[0].accuracy,8);
    assert.ok(Date.parse(born.finds[0].date)>=beforeBirth && Date.parse(born.finds[0].date)<=Date.now());
    assert.equal(born.started,born.finds[0].date.slice(0,10));
    assert.ok((await call('/stones')).body.stones.some(s=>s.id===winner.stone.id));
    const retryBirth=await call('/stones/'+winner.stone.id+'/initialize',winningBody,winningKey,freshHeaders);
    assert.equal(retryBirth.status,200);assert.equal(retryBirth.body.replayed,true);assert.equal(retryBirth.body.stone.comments.length,1);assert.equal(retryBirth.body.stone.finds.length,1);
    assert.equal((await call('/stones/'+winner.stone.id+'/initialize',{...winningBody,message:'Changed wish'},winningKey,freshHeaders)).status,409);
    assert.equal((await call('/stones/'+winner.stone.id+'/initialize',{...winningBody,name:'Overwrite'},winningKey,freshHeaders)).status,409);
    assert.equal((await call('/stones/'+winner.stone.id+'/initialize',winningBody,randomUUID(),freshHeaders)).status,409);
    const remaining=await call('/stones/'+loser.stone.id+'/images');assert.equal(remaining.body.available,39);
    assert.ok(remaining.body.images.every(i=>i.id!==birthBody.imageId));
    const sameStone=(await admin('stones','POST',{}, {'Idempotency-Key':randomUUID()})).body;
    const sameBody={...birthBody,code:sameStone.code,imageId:remaining.body.images[0].id};
    const sameKey=randomUUID();
    const concurrentRetries=await Promise.all([1,2].map(()=>call('/stones/'+sameStone.stone.id+'/initialize',sameBody,sameKey,freshHeaders)));
    assert.ok(concurrentRetries.every(r=>r.status===200));assert.ok(concurrentRetries.every(r=>r.body.stone.finds.length===1));
    assert.equal((await call('/stones/'+loser.stone.id+'/images')).body.available,38);
    for(const s of [winner,sameStone])assert.equal((await admin('stones/'+s.stone.id,'DELETE')).status,200);
    assert.equal((await call('/stones/'+loser.stone.id+'/images')).body.available,40,'deleted stones return their portraits');
    const unusedInventory=JSON.parse(cli(['d1','execute','livingstones-local-db','--local','--persist-to',state,'--json','--command',"SELECT COUNT(*) AS count FROM stone_image_pool WHERE claimed_at IS NULL"]));
    assert.equal(unusedInventory[0].results[0].count,40);
    assert.equal((await admin('stones/'+loser.stone.id,'DELETE')).status,200);
    const competingStone=(await admin('stones','POST',{}, {'Idempotency-Key':randomUUID()})).body;
    const competingBirths=await Promise.all([1,2].map(i=>call('/stones/'+competingStone.stone.id+'/initialize',{...birthBody,code:competingStone.code,imageId:remaining.body.images[i].id},randomUUID(),{'CF-Connecting-IP':'192.0.2.71'})));
    assert.deepEqual(competingBirths.map(r=>r.status).sort(),[200,409]);
    assert.equal((await call('/stones/'+competingStone.stone.id)).body.stone.finds.length,1);
    assert.equal((await call('/stones/'+competingStone.stone.id+'/verify',{code:competingStone.code},undefined,{'CF-Connecting-IP':'192.0.2.72'})).status,200);
    assert.equal((await admin('stones/'+competingStone.stone.id,'DELETE')).status,200);
    const exhaustedStone=(await admin('stones','POST',{}, {'Idempotency-Key':randomUUID()})).body;
    cli(['d1','execute','livingstones-local-db','--local','--persist-to',state,'--command',"UPDATE stone_image_pool SET claimed_at='2026-01-01T00:00:00Z' WHERE claimed_at IS NULL"]);
    const exhausted=await call('/stones/'+exhaustedStone.stone.id+'/images');
    assert.equal(exhausted.body.available,0);assert.deepEqual(exhausted.body.images,[]);
    assert.equal((await call('/stones/'+exhaustedStone.stone.id+'/initialize',{...birthBody,code:exhaustedStone.code},randomUUID(),{'CF-Connecting-IP':'192.0.2.73'})).status,409);
    const stillPending=(await call('/stones/'+exhaustedStone.stone.id)).body.stone;
    assert.equal(stillPending.initialized,false);assert.equal(stillPending.finds.length,0);
    assert.equal((await admin('stones/'+exhaustedStone.stone.id,'DELETE')).status,200);


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
    assert.equal((await admin('stones/A1/note','PATCH',{note:'Owner-only diary'})).status,200);
    assert.equal((await admin('stones/A1')).body.stone.adminNote,'Owner-only diary');
    assert.ok(!('adminNote' in (await call('/stones/A1')).body.stone));
    assert.equal((await admin('stones/A1','PATCH',{...managed,code:'12345'})).status,400);
    assert.equal((await admin('stones/A1','PATCH',{...managed,code:'ABCD'})).status,400);

    assert.equal((await admin("stones/A1","PATCH",{...managed,name:"Managed Sunny Side",creator:"Admin creator"})).status,200);
    assert.equal((await call("/stones/A1")).body.stone.name,"Managed Sunny Side");
    assert.equal((await admin("stones/A1","PATCH",{...managed,demo:false})).status,400);
    assert.equal((await admin("stones/A1","PATCH",{...managed,demo:false,code:"8451"})).status,400);
    assert.equal((await admin("stones/A1","PATCH",{...managed,demo:false,code:"9734"})).status,200);
    assert.equal((await admin('stones/A1/label-code','POST',{code:'WRONG'})).status,403);
    const label=await admin('stones/A1/label-code','POST',{code:'9734'});assert.equal(label.status,200);assert.equal(label.body.code,'9734');
    assert.equal((await call('/admin/stones/A1/label-code',{code:'9734'})).status,401);
    assert.equal((await admin('stones/A1')).body.stone.privateCode,'9734');
    assert.equal((await admin('stones/A1','PATCH',{...managed,demo:false,code:''})).body.stone.privateCode,'9734');
    const changed=await admin('stones/A1','PATCH',{...managed,demo:false,code:'0000'});
    assert.equal(changed.body.stone.privateCode,'0000');
    assert.equal((await call('/stones/A1/verify',{code:'9734'})).status,403);
    assert.equal((await call('/stones/A1/verify',{code:'0000'})).status,200);
    assert.equal((await admin('stones/A1','PATCH',{...managed,demo:false,code:'9734'})).status,200);
    const realAdmin=(await call("/stones/A1")).body.stone;assert.equal(realAdmin.demo,false);assert.ok(!('code' in realAdmin));assert.ok(!('privateCode' in realAdmin));
    assert.equal((await call("/stones/A1/verify",{code:"9734"})).status,200);
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
    assert.equal((await admin('stones')).body.imagesAvailable,1,'deleted demo SVG joins the stock');
    const recycled=(await admin('stones','POST',{}, {'Idempotency-Key':randomUUID()})).body;
    const recycledImages=(await call('/stones/'+recycled.stone.id+'/images')).body;
    assert.equal(recycledImages.available,1);assert.equal(recycledImages.images[0].image,'stone-1.svg');
    const manualBirth=await call('/stones/'+recycled.stone.id+'/initialize',{code:recycled.code,name:'Reused demo portrait',creator:'Manual creator',theme:'moon',imageId:recycledImages.images[0].id,place:{lat:48.735429,lon:19.1457338,source:'manual',accuracy:123,city:'Banská Bystrica',country:'Slovakia',address:'Approximate city location'}},randomUUID(),{'CF-Connecting-IP':'192.0.2.74'});
    assert.equal(manualBirth.status,200);assert.ok(!('adminNote' in manualBirth.body.stone));assert.equal(manualBirth.body.stone.finds[0].source,'manual');assert.equal(manualBirth.body.stone.finds[0].accuracy,null);
    assert.equal(manualBirth.body.stone.image,'stone-1.svg');assert.equal((await admin('stones')).body.imagesAvailable,0);
    assert.equal((await admin('stones/'+recycled.stone.id+'/note','PATCH',{note:'Private reused note'})).status,200);
    assert.equal((await admin('stones/'+recycled.stone.id+'/note','PATCH',{note:''})).body.stone.adminNote,'');
    cli(['d1','execute','livingstones-local-db','--local','--persist-to',state,'--command',"INSERT INTO stones(id,name,born,image,theme,color,is_demo,code_hash,creator) VALUES ('SHARED','Shared portrait','2026-01-01','stone-1.svg','sun','#b49aff',0,'dummy','Test creator');"]);
    assert.equal((await admin('stones/'+recycled.stone.id,'DELETE')).status,200);
    assert.equal((await admin('stones')).body.imagesAvailable,0,'a shared image stays unavailable until its last stone is removed');
    assert.equal((await admin('stones/SHARED','DELETE')).status,200);

    assert.equal((await admin('stones')).body.imagesAvailable,1);
    const duplicateAssets=JSON.parse(cli(['d1','execute','livingstones-local-db','--local','--persist-to',state,'--json','--command',"SELECT COUNT(*) AS count FROM stone_image_pool WHERE image='stone-1.svg'"]));
    assert.equal(duplicateAssets[0].results[0].count,1,'returning a portrait twice never duplicates it');

    const removedWatchers = JSON.parse(cli(["d1", "execute", "livingstones-local-db", "--local", "--persist-to", state, "--json", "--command", "SELECT COUNT(*) AS total FROM stone_watchers WHERE stone_id='A1'"]));
    assert.equal(removedWatchers[0].results[0].total, 0);
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
