const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync("docs/app.js", "utf8");
const functions = source.slice(
  source.indexOf("function identifyDevice"),
  source.indexOf("// This repository"),
);
const context = vm.createContext({ navigator: { userAgent: "" } });
vm.runInContext(functions, context);
const data = vm.createContext({});
vm.runInContext(
  fs.readFileSync("fixtures/demo-data.js", "utf8") +
    ";globalThis.stones=DEMO_STONES;",
  data,
);
test("five distinct demo stones have realistic chronological journeys and valid locations", () => {
  assert.equal(data.stones.length, 5);
  assert.equal(new Set(data.stones.map((s) => s.id)).size, 5);
  assert.equal(new Set(data.stones.map((s) => s.image)).size, 5);
  assert.equal(
    data.stones.reduce((n, s) => n + s.finds.length, 0),
    25,
  );
  for (const stone of data.stones) {
    assert.equal(stone.started, stone.finds[0].date);
    assert.ok(fs.existsSync("docs/assets/" + stone.image));
    assert.ok(stone.code);
    for (let i = 0; i < stone.finds.length; i++) {
      const find = stone.finds[i];
      assert.ok(context.validCoordinates(find.lat, find.lon));
      assert.ok(
        find.city &&
          find.country &&
          find.address &&
          find.nickname &&
          find.message,
      );
      const rad = (n) => (n * Math.PI) / 180;
      const a =
        Math.sin(rad(find.lat - 48.1486) / 2) ** 2 +
        Math.cos(rad(48.1486)) *
          Math.cos(rad(find.lat)) *
          Math.sin(rad(find.lon - 17.1077) / 2) ** 2;
      assert.ok(
        6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) < 100,
        `${stone.id}: ${find.city} within 100 km of Bratislava`,
      );
      assert.ok(Date.parse(find.date) <= Date.now());
      if (i)
        assert.ok(Date.parse(find.date) > Date.parse(stone.finds[i - 1].date));
    }
  }
});
test("mobile/tablet detection preserves iPad and Android tablet cases without admitting touch laptops", () => {
  for (const [userAgent, maxTouchPoints, type] of [
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 10, "Desktop"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 0, "Desktop"],
    ["unknown", 0, "Desktop"],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile",
      5,
      "Mobile",
    ],
    ["Mozilla/5.0 (Linux; Android 14) Mobile", 5, "Mobile"],
    ["Mozilla/5.0 (Linux; Android 14)", 5, "Tablet"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)", 5, "Tablet"],
  ])
    assert.equal(
      context.identifyDevice({ userAgent, maxTouchPoints }).type,
      type,
    );
  assert.equal(
    context.identifyDevice({
      userAgent: "unknown",
      userAgentData: { mobile: true },
    }).type,
    "Mobile",
  );
});
test("coordinates reject malformed values and retain zero coordinates", () => {
  assert.ok(context.validCoordinates(0, 0));
  assert.ok(context.validCoordinates(-90, 180));
  for (const values of [
    [91, 0],
    [0, 181],
    [null, 0],
    ["48", 17],
    [NaN, 0],
    [Infinity, 0],
  ])
    assert.equal(context.validCoordinates(...values), false);
});
test("reverse lookup excludes a street when GPS accuracy is poor and removes duplicate area names", () => {
  assert.equal(
    context.formatPlace(
      {
        street: "Street",
        district: "Bratislava",
        city: "Bratislava",
        country: "Slovakia",
      },
      25,
    ),
    "Street, Bratislava, Slovakia",
  );
  assert.equal(
    context.formatPlace({ street: "Street", city: "Bratislava" }, 500),
    "Bratislava",
  );
  assert.equal(context.formatPlace(null, 25), "");
});
test("root and docs entry points match except their asset paths", () => {
  const docs = fs.readFileSync("docs/index.html", "utf8");
  const root = fs.readFileSync("index.html", "utf8");
  assert.equal(root.replaceAll('"docs/', '"'), docs);
  assert.ok(docs.includes('<html lang="en">'));
});

test("a house number is included only with a sufficiently accurate street", () => {
  assert.equal(
    context.formatPlace(
      {
        street: "Ľanová",
        housenumber: "8",
        district: "Ružinov",
        city: "Bratislava",
        country: "Slovakia",
      },
      25,
    ),
    "Ľanová 8, Ružinov, Bratislava, Slovakia",
  );
  assert.equal(
    context.formatPlace(
      { street: "Ľanová", housenumber: "8", city: "Bratislava" },
      500,
    ),
    "Bratislava",
  );
});

test("alive stones use an inclusive 90-day window and statistics follow added stones and finds", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");
  const day = 86400000;
  const stoneAt = (timestamp, country) => ({
    finds: [{ date: new Date(timestamp).toISOString(), country }],
  });
  const stones = [
    stoneAt(now, "Slovakia"),
    stoneAt(now - 90 * day, "Austria"),
    stoneAt(now - 90 * day - 1, "Hungary"),
    stoneAt(now + 1, "Slovakia"),
    { finds: [] },
  ];
  const stats = context.journeyStatistics(stones, now);
  assert.equal(stats.created, 5);
  assert.equal(stats.alive, 2);
  assert.equal(stats.finds, 4);
  assert.equal(stats.countries, 3);
  stones[2].finds.push({
    date: new Date(now).toISOString(),
    country: "Czechia",
  });
  stones.push(stoneAt(now, "Austria"));
  const updated = context.journeyStatistics(stones, now);
  assert.equal(updated.created, 6);
  assert.equal(updated.alive, 4);
  assert.equal(updated.finds, 6);
  assert.equal(updated.countries, 4);
  assert.equal(context.journeyStatistics([], now).alive, 0);
});

test("find recency follows displayed calendar dates across midnight and uses readable singular labels", () => {
  const now = Date.parse("2026-10-05T00:10:00Z");
  assert.equal(
    context.findRecency("2026-10-05T00:01:00Z", now).label,
    "(today)",
  );
  assert.equal(
    context.findRecency("2026-10-04T23:55:00Z", now).label,
    "(1 day ago)",
  );
  assert.equal(context.findRecency("2026-09-29", now).label, "(6 days ago)");
  assert.equal(context.findRecency("2026-09-29", now).compact, "(6d ago)");
  assert.equal(context.findRecency("2026-10-06", now).label, "(today)");
});

test("story feed merges standalone notes once, orders newest first and never reorders route points", () => {
  const stone = {
    id: "A1",
    finds: [
      { id: "birth", date: "2025-04-12", message: "Born" },
      { id: "find", date: "2026-10-04T12:00:00Z", message: "We met" },
    ],
    comments: [
      {
        id: "attached",
        findId: "find",
        date: "2026-10-04T12:00:00Z",
        message: "We met",
      },
      {
        id: "note",
        findId: null,
        date: "2026-10-05T12:00:00Z",
        message: "Hello",
      },
    ],
  };
  const original = JSON.stringify(stone);
  const entries = context.storyEntries(stone);
  assert.deepEqual(
    Array.from(entries, (e) => e.id),
    ["note", "find", "birth"],
  );
  assert.equal(entries[0].type, "note");
  assert.equal(entries[1].type, "find");
  assert.equal(JSON.stringify(stone), original);
});
