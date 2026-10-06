// Deterministic IDs and INSERT OR IGNORE make this safe to run again.
const fs = require("node:fs");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const sandbox = vm.createContext({});
vm.runInContext(
  fs.readFileSync("fixtures/demo-data.js", "utf8") +
    ";globalThis.stones=DEMO_STONES",
  sandbox,
);
const quote = (x) =>
  x == null
    ? "NULL"
    : typeof x === "number"
      ? String(x)
      : "'" + String(x).replaceAll("'", "''") + "'";
const insert = (table, values) =>
  `INSERT OR IGNORE INTO ${table} (${Object.keys(values).join(",")}) VALUES (${Object.values(values).map(quote).join(",")});`;
const lines = [
  "-- Only inserts the original demo records; never resets journeys.",
  "PRAGMA foreign_keys = ON;",
];
for (const s of sandbox.stones) {
  lines.push(
    insert("stones", {
      id: s.id,
      name: s.name,
      born: s.started,
      creator: s.finds[0].nickname,
      image: s.image,
      theme: s.theme,
      color: s.color,
      is_demo: 1,
      code_hash: createHash("sha256").update(s.code).digest("hex"),
      demo_code: s.code,
    }),
  );
  s.finds.forEach((f, i) => {
    const id = `seed-${s.id}-${i + 1}`,
      date = f.date + "T00:00:00.000Z";
    lines.push(
      insert("finds", {
        id,
        stone_id: s.id,
        occurred_at: date,
        lat: f.lat,
        lon: f.lon,
        accuracy: null,
        city: f.city,
        country: f.country,
        address: f.address,
        nickname: f.nickname,
        source: "seed",
      }),
    );
    if (f.message)
      lines.push(
        insert("comments", {
          id: `comment-${id}`,
          stone_id: s.id,
          find_id: id,
          created_at: date,
          nickname: f.nickname,
          message: f.message,
        }),
      );
  });
}
lines.push("INSERT OR IGNORE INTO traffic_targets(target,name,kind) SELECT 'stone:' || id,name,'stone' FROM stones;");
fs.writeFileSync("backend/seed.sql", lines.join("\n") + "\n");
