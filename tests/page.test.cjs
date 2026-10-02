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
  fs.readFileSync("docs/data.js", "utf8") + ";globalThis.stones=DEMO_STONES;",
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

test("finds are visit-only and never access browser persistence", () => {
  const sandbox = vm.createContext({
    localStorage: {
      getItem() {
        throw Error("Storage must not be accessed");
      },
      setItem() {
        throw Error("Storage must not be accessed");
      },
    },
  });
  vm.runInContext(
    fs.readFileSync("docs/data.js", "utf8") +
      "\n" +
      functions +
      "\n" +
      source.slice(
        source.indexOf("// This repository"),
        source.indexOf("let selectedId"),
      ) +
      ";globalThis.repo = stoneRepository;",
    sandbox,
  );
  const before = sandbox.repo.get("A1");
  sandbox.repo.addFind("A1", {
    date: new Date().toISOString(),
    city: "Bratislava",
    country: "Slovakia",
    address: "Demo address",
    lat: 48.1486,
    lon: 17.1077,
    nickname: "Test",
    message: "Hello",
    source: "demo",
  });
  assert.equal(before.finds.length, 5);
  assert.equal(sandbox.repo.get("A1").finds.length, 6);
  assert.equal(sandbox.repo.get("B2").finds.length, 5);
  assert.equal(sandbox.repo.get("A1").finds.at(-1).local, true);
  assert.throws(() => sandbox.repo.addFind("A1", { lat: 200, lon: 17 }));
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
