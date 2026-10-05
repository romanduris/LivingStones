const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const fixture = vm.createContext({});
vm.runInContext(
  fs.readFileSync("fixtures/demo-data.js", "utf8") +
    ";globalThis.stones=DEMO_STONES",
  fixture,
);
const { spawn } = require("node:child_process");
const base = process.env.LIVINGSTONES_TEST_URL || "http://127.0.0.1:8137";
const server = process.env.LIVINGSTONES_TEST_URL
  ? null
  : spawn("python3", ["-u", "-m", "http.server", "8137"]);
process.on("exit", () => server?.kill());
(async () => {
  if (server)
    await new Promise((resolve, reject) => {
      server.stdout.once("data", resolve);
      server.once("error", reject);
      server.once("exit", (code) => reject(Error("Server exited: " + code)));
    });
  const browser = await chromium.launch({ headless: true });
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    const stones = JSON.parse(JSON.stringify(fixture.stones));
    for (const stone of stones)
      stone.comments = stone.finds.map((f, i) => ({
        id: `seed-${stone.id}-${i}`,
        findId: "seed",
        date: f.date,
        nickname: f.nickname,
        message: f.message,
      }));
    const submissions = new Map();
    context.dropNextFindReply = false;
    await context.route("http://127.0.0.1:8787/**", async (route) => {
      const req = route.request(),
        parts = new URL(req.url()).pathname.split("/");
      const id = parts[3],
        kind = parts[4],
        stone = stones.find((s) => s.id === id);
      let result = { stones },
        status = 200;
      if (req.method() === "POST") {
        const body = req.postDataJSON();
        if (body.code !== stone?.code) {
          status = 403;
          result = { error: "That code doesn’t match this stone." };
        } else if (kind === "verify") result = { ok: true };
        else {
          const key = req.headers()["idempotency-key"];
          if (submissions.has(key)) result = submissions.get(key);
          else {
            const recordId = String(Date.now()) + Math.random(),
              date = new Date().toISOString();
            if (kind === "finds")
              stone.finds.push({
                ...body.place,
                id: recordId,
                date,
                nickname: body.nickname || "A kind stranger",
                message: body.message,
              });
            if (body.message)
              stone.comments.push({
                id: recordId,
                date,
                findId: kind === "finds" ? recordId : null,
                nickname: body.nickname || "A kind stranger",
                message: body.message,
              });
            result = { stone, recordId };
            submissions.set(key, structuredClone(result));
          }
        }
      }
      if (kind === "finds" && context.dropNextFindReply && status === 200) {
        context.dropNextFindReply = false;
        status = 503;
        result = { error: "The reply was interrupted. Please retry." };
      }
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(result),
      });
    });
    return context;
  };
  try {
    const errors = [];
    const attach = (page) => {
      page.on("pageerror", (error) => errors.push(error.message));
      for (const method of ["goto", "reload"]) {
        const original = page[method].bind(page);
        page[method] = async (...args) => {
          const result = await original(...args);
          await page.waitForFunction(
            () =>
              stoneRepository.list().length === 5 &&
              document.querySelector("#data-status").hidden,
          );
          return result;
        };
      }
    };
    const rows = ".find-history tbody tr";
    const desktop = await browser.newContext({
      viewport: { width: 1440, height: 1050 },
    });
    const page = await desktop.newPage();
    attach(page);
    await page.addInitScript(() => {
      window.gpsCalls = 0;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition() {
            window.gpsCalls++;
          },
        },
      });
      Object.defineProperty(navigator, "clipboard", {
        value: {
          async writeText(text) {
            window.copiedLink = text;
          },
        },
      });
    });
    await page.goto(base);
    assert.equal(await page.locator(".stone-row").count(), 5);
    assert.equal(await page.locator(".stone-thumbnail img").count(), 5);
    assert.equal(await page.locator("#map-legend").count(), 0);
    assert.match(
      await page.locator(".intro-copy").innerText(),
      /another country/,
    );
    assert.match(
      await page.locator(".stone-row").first().innerText(),
      /Bernolákov sad/,
    );
    assert.equal(
      await page.locator("#world-map .leaflet-marker-icon").count(),
      5,
    );
    assert.equal(await page.locator("#total-finds").innerText(), "25");
    assert.equal(await page.locator(".intro-copy p").count(), 1);
    assert.equal(await page.locator("#hello-count").innerText(), "25");
    assert.match(
      await page.locator("#explore-title").innerText(),
      /5 stones. 5 little adventures/,
    );
    assert.equal(await page.locator("#total-countries").innerText(), "3");
    assert.equal(
      await page.evaluate(() => document.querySelector("main>section").id),
      "world",
    );
    assert.ok(
      await page.evaluate(
        () =>
          parseFloat(getComputedStyle(document.querySelector("h1")).fontSize) <=
          26,
      ),
    );
    assert.equal(await page.locator(".hero").count(), 0);
    assert.match(
      await page.locator("#how-it-works").innerText(),
      /another town or country/,
    );
    const zoom = await page.evaluate(() =>
      mapInstances.get("world-map").map.getZoom(),
    );
    await page.locator("#world-map .leaflet-control-zoom-in").click();
    await page.waitForFunction(
      (z) => mapInstances.get("world-map").map.getZoom() > z,
      zoom,
    );
    await page.locator('[data-reset-map="world-map"]').click();
    await page
      .locator('#world-map .leaflet-marker-icon[title^="Sunny Side"]')
      .click();
    await page.waitForURL("**/?stone=A1");
    assert.match(await page.locator("#detail-title").innerText(), /Sunny Side/);
    assert.equal(await page.locator("#start-find").count(), 0);
    assert.equal(await page.locator(rows).count(), 5);
    assert.equal(await page.evaluate(() => window.gpsCalls), 0);
    assert.equal(
      await page.evaluate(
        () =>
          document
            .querySelector(".detail-body")
            .firstElementChild.querySelector(".map-panel").id,
      ),
      "journey-map",
    );
    assert.ok(
      await page.evaluate(
        () => mapInstances.get("journey-map").map.getSize().x > 400,
      ),
    );
    await page.locator("#share-stone").click();
    assert.match(await page.evaluate(() => window.copiedLink), /stone=A1/);
    assert.equal(await page.locator(rows).count(), 5);
    await page.keyboard.press("Escape");
    await page.waitForURL(base + "/");
    await page.goForward();
    await page.locator("dialog[open]").waitFor();
    await page.locator("#close-detail").click();
    await page.waitForURL(base + "/");
    await page.goto(base + "/?stone=E5");
    assert.match(await page.locator("#detail-title").innerText(), /Ocean Echo/);
    await page.locator("#close-detail").click();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    await page.goto(base + "/docs/?stone=C3");
    assert.match(await page.locator("#detail-title").innerText(), /Slow Bloom/);
    await page.goto(base + "/?stone=unknown");
    assert.equal(await page.locator("dialog[open]").count(), 0);
    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    const phone = await mobile.newPage();
    attach(phone);
    let lookups = 0;
    phone.on("request", (request) => {
      if (request.url().includes("photon.komoot.io")) lookups++;
    });
    await phone.addInitScript(() => {
      window.gpsMode = "denied";
      window.gpsCalls = 0;
      Object.defineProperty(navigator, "geolocation", {
        value: {
          getCurrentPosition(success, error) {
            window.gpsCalls++;
            if (window.gpsMode === "denied") error({ code: 1 });
            else if (window.gpsMode === "timeout") error({ code: 3 });
            else if (window.gpsMode === "unavailable") error({ code: 2 });
            else if (window.gpsMode === "invalid")
              success({
                coords: { latitude: 200, longitude: 17, accuracy: 25 },
              });
            else if (window.gpsMode === "zero")
              success({ coords: { latitude: 0, longitude: 0, accuracy: 25 } });
            else if (window.gpsMode === "late")
              window.releaseGPS = () =>
                success({
                  coords: { latitude: 48.156, longitude: 17.155, accuracy: 25 },
                });
            else
              success({
                coords: { latitude: 48.156, longitude: 17.155, accuracy: 25 },
                timestamp: Date.now(),
              });
          },
        },
      });
    });
    await phone.goto(base + "/?stone=A1");
    assert.equal(await phone.evaluate(() => window.gpsCalls), 0);
    assert.equal(lookups, 0);
    await phone.locator("#start-find").click();
    assert.match(
      await phone.locator(".find-panel").innerText(),
      /enjoy my company/,
    );
    await phone.locator("#find-code").fill("WRONG");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.waitForFunction(() =>
      document
        .querySelector("#find-error")
        .textContent.includes("doesn’t match"),
    );
    assert.match(
      await phone.locator("#find-error").innerText(),
      /doesn’t match/,
    );
    assert.equal(await phone.evaluate(() => window.gpsCalls), 0);
    await phone.locator("#find-code").fill("sun24");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#location-status").waitFor();
    assert.equal(
      await phone.evaluate(() => window.gpsCalls),
      1,
      "GPS is requested directly after the correct code",
    );
    assert.match(await phone.locator("#location-status").innerText(), /denied/);
    assert.equal(await phone.locator("#location-next").isEnabled(), false);
    for (const mode of ["timeout", "unavailable", "invalid"]) {
      await phone.evaluate((mode) => (window.gpsMode = mode), mode);
      await phone.locator("#use-gps").click();
      assert.equal(await phone.locator("#use-gps").isEnabled(), true);
    }
    await phone.locator("#demo-city").selectOption("3");
    assert.equal(
      await phone.locator("#location-preview .leaflet-marker-icon").count(),
      1,
    );
    assert.match(
      await phone.locator("#location-status").innerText(),
      /Bernolákov sad/,
    );
    assert.equal(
      await phone.locator(rows).count(),
      5,
      "A location preview does not record a find",
    );
    await phone.locator("#location-next").click();
    await phone.locator("#nickname").fill("<b>Tester</b>");
    await phone
      .locator("#find-message")
      .fill("Hello! <script>alert(1)</script>");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#success-title").waitFor();
    assert.equal(await phone.locator(rows).count(), 6);
    assert.match(
      await phone.locator(rows).last().innerText(),
      /Bernolákov sad/,
    );
    assert.match(
      await phone.locator(rows).last().innerText(),
      /<b>Tester<\/b>/,
    );
    assert.equal(await phone.locator(".find-history script").count(), 0);
    assert.equal(await phone.locator("#journey-map .is-new").count(), 1);
    assert.equal(await phone.locator("#total-finds").innerText(), "26");
    assert.equal(await phone.locator("#hello-count").innerText(), "26");
    assert.match(
      await phone
        .locator('.stone-row[data-stone="A1"] .overview-latest')
        .textContent(),
      /Tester/,
    );
    await phone.locator("#finish-find").click();
    await phone.locator("#close-detail").click();
    await phone.locator('.stone-link[data-stone="A1"]').click();
    assert.equal(
      await phone.locator(rows).count(),
      6,
      "Preview remains while exploring this visit",
    );
    await phone.reload();
    assert.equal(
      await phone.locator(rows).count(),
      6,
      "Refresh retains saved finds",
    );
    // Actual GPS coordinates, successful reverse lookup, map and address table.
    await phone.route("https://photon.komoot.io/**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          features: [
            {
              properties: {
                street: "Ľanová",
                housenumber: "8",
                district: "Ružinov",
                city: "Bratislava",
                country: "Slovakia",
              },
            },
          ],
        }),
      }),
    );
    await phone.evaluate(() => (window.gpsMode = "success"));
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("SUN24");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#location-status.ready").waitFor();
    assert.match(
      await phone.locator("#location-status").innerText(),
      /Ľanová 8, Ružinov, Bratislava, Slovakia/,
    );
    const preview = await phone.evaluate(() => {
      const p = mapInstances.get("location-preview").markers[0].getLatLng();
      return [p.lat, p.lng];
    });
    assert.deepEqual(preview, [48.156, 17.155]);
    assert.equal(await phone.locator(rows).count(), 6);
    await phone.locator("#location-next").click();
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#success-title").waitFor();
    assert.match(await phone.locator(rows).last().innerText(), /Ľanová 8/);
    assert.match(
      await phone.locator(rows).last().innerText(),
      /GPS accuracy ~25 m/,
    );
    const pin = await phone.evaluate(() => {
      const p = mapInstances.get("journey-map").markers.at(-1).getLatLng();
      return [p.lat, p.lng];
    });
    assert.deepEqual(pin, [48.156, 17.155]);
    assert.deepEqual(
      await phone.evaluate(() => {
        const p = mapInstances.get("world-map").markers[0].getLatLng();
        return [p.lat, p.lng];
      }),
      [48.156, 17.155],
    );
    await phone.screenshot({ path: "/tmp/livingstones-v2-gps.png" });
    assert.ok(lookups > 0);
    await phone.reload();
    assert.equal(await phone.locator(rows).count(), 7);
    // A failed lookup still displays the exact point, including zero coordinates.
    await phone.unroute("https://photon.komoot.io/**");
    await phone.route("https://photon.komoot.io/**", (route) => route.abort());
    await phone.goto(base + "/?stone=B2");
    await phone.evaluate(() => (window.gpsMode = "zero"));
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("MOON7");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#location-status.ready").waitFor();
    assert.match(
      await phone.locator("#location-status").innerText(),
      /0.0000, 0.0000/,
    );
    await phone.locator("#location-next").click();
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#success-title").waitFor();
    assert.match(
      await phone.locator(rows).last().innerText(),
      /Address unavailable — 0.00000, 0.00000/,
    );
    // Canceling a pending GPS request must not create or alter a find.
    await phone.goto(base + "/?stone=D4");
    await phone.evaluate(() => (window.gpsMode = "late"));
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("LOVE4");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#use-gps").waitFor();
    await phone.locator("#cancel-find").click();
    await phone.evaluate(() => window.releaseGPS());
    assert.equal(await phone.locator(rows).count(), 5);
    assert.equal(await phone.locator("#find-container").innerText(), "");
    // No browser storage is needed or accessed.
    const memory = await browser.newContext({ ...devices["iPhone 13"] });
    const mp = await memory.newPage();
    attach(mp);
    await mp.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw Error("Storage accessed");
        },
      });
      Object.defineProperty(navigator, "geolocation", { value: undefined });
    });
    await mp.goto(base + "/?stone=C3");
    await mp.locator("#start-find").click();
    await mp.locator("#find-code").fill("GROW3");
    await mp.locator("#find-form button[type=submit]").click();
    await mp.locator("#location-status").waitFor();
    assert.match(
      await mp.locator("#location-status").innerText(),
      /unavailable/,
    );
    await mp.locator("#demo-city").selectOption("0");
    await mp.locator("#location-next").click();
    await mp.locator("#find-form button[type=submit]").click();
    await mp.locator("#success-title").waitFor();
    assert.equal(await mp.locator(rows).count(), 6);
    assert.match(await mp.locator(".success-panel").innerText(), /is saved/);
    // A lost receipt leaves the form intact; retry uses the original key and saves once.
    await phone.goto(base + "/?stone=A1");
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("SUN24");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#demo-city").waitFor();
    await phone.locator("#demo-city").selectOption("0");
    await phone.locator("#location-next").click();
    await phone.locator("#find-message").fill("A moment worth one save.");
    mobile.dropNextFindReply = true;
    await phone.locator("#find-form button[type=submit]").click();
    await phone.waitForFunction(() =>
      document.querySelector("#find-error").textContent.includes("interrupted"),
    );
    assert.equal(await phone.locator("#success-title").count(), 0);
    assert.equal(await phone.locator(rows).count(), 7);
    assert.equal(
      await phone.locator("#find-message").inputValue(),
      "A moment worth one save.",
    );
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#success-title").waitFor();
    assert.equal(await phone.locator(rows).count(), 8);
    await phone.reload();
    assert.equal(await phone.locator(rows).count(), 8);
    // Standalone comments persist across refresh and never change the map/find count.
    await phone.goto(base + "/?stone=E5");
    const beforeNotes = await phone.locator("#total-finds").innerText();
    await phone.locator("#start-comment").click();
    await phone.locator("#comment-code").fill("WAVE5");
    await phone.locator("#comment-nickname").fill("Kind friend");
    await phone
      .locator("#comment-message")
      .fill("A little hello that stays. <b>Safe text</b>");
    await phone.locator("#comment-form button[type=submit]").click();
    await phone.locator("#stone-notes article").waitFor();
    assert.equal(await phone.locator("#total-finds").innerText(), beforeNotes);
    await phone.reload();
    assert.match(
      await phone.locator("#stone-notes").innerText(),
      /A little hello that stays/,
    );
    assert.equal(await phone.locator("#stone-notes b").count(), 0);
    assert.equal(await phone.locator(rows).count(), 5);
    // Offline map tiles retain working controls and pins, with an honest status.
    await page.route("https://**/*", (route) => route.abort());
    for (const width of [320, 375, 600, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(base);
      assert.equal(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
        true,
        `No page overflow at ${width}`,
      );
      assert.equal(
        await page.locator("#world-map .leaflet-marker-icon").count(),
        5,
      );
      assert.equal(await page.locator("#start-find").count(), 0);
      const mapLayout = await page.evaluate(() => {
        const map = document
          .querySelector("#world-map")
          .getBoundingClientRect();
        const stats = document
          .querySelector(".map-overview")
          .getBoundingClientRect();
        const table = document
          .querySelector(".stone-table-frame")
          .getBoundingClientRect();
        return {
          height: map.height,
          mapTop: map.top,
          statsTop: stats.top,
          statsBottom: stats.bottom,
          tableTop: table.top,
        };
      });
      assert.ok(
        mapLayout.statsBottom < mapLayout.mapTop &&
          mapLayout.mapTop < mapLayout.tableTop,
        "Statistics sit above the map",
      );
      assert.equal(
        mapLayout.height,
        width <= 360 ? 284 : width <= 700 ? 304 : width <= 1000 ? 420 : 460,
      );
      const contentTops = await page
        .locator(".stone-row")
        .first()
        .evaluate((row) =>
          [
            ...row.querySelectorAll(
              ".stone-identity > strong, .overview-age > strong, .overview-finds > strong, .overview-location > time",
            ),
          ].map((el) => el.getBoundingClientRect().top),
        );
      assert.ok(
        Math.max(...contentTops) - Math.min(...contentTops) <= 1,
        "First text lines align across columns",
      );

      assert.equal(
        await page
          .locator(".stone-row")
          .first()
          .evaluate((row) => getComputedStyle(row).display),
        "table-row",
      );
      assert.equal(await page.locator(".stone-table thead").isVisible(), true);
      assert.equal(
        await page
          .locator(".stone-table-frame")
          .evaluate((frame) => frame.scrollWidth <= frame.clientWidth),
        true,
        `Table fits without horizontal scrolling at ${width}`,
      );
      assert.equal(
        await page.locator(".overview-latest").first().isVisible(),
        width > 1100,
      );
      assert.equal(
        await page.locator(".overview-start").first().isVisible(),
        width > 800,
      );
      assert.equal(
        await page.locator(".stone-born").first().isVisible(),
        width <= 800,
      );
      for (const cell of [
        ".overview-age",
        ".overview-finds",
        ".overview-location",
      ])
        assert.equal(await page.locator(cell).first().isVisible(), true);
      assert.equal(await page.locator(".demo-badge").count(), 5);
      assert.equal(await page.locator(".country-flag").count(), 5);
      assert.match(
        await page.locator(".country-key").innerText(),
        /Countries visited by this stone/,
      );
      for (const [selector, alignment] of [
        [".overview-stone", "left"],
        [".overview-location", "right"],
        [".overview-age", "center"],
        [".overview-finds", "center"],
      ])
        assert.equal(
          await page
            .locator(selector)
            .first()
            .evaluate((el) => getComputedStyle(el).textAlign),
          alignment,
        );

      assert.equal(
        await page.locator(".find-countries").first().isVisible(),
        true,
      );
      assert.ok(
        await page
          .locator(".stone-row")
          .first()
          .evaluate((row) => row.getBoundingClientRect().height <= 86),
        "Compact stone row",
      );
      assert.ok(
        await page
          .locator(".stone-visual")
          .first()
          .evaluate(
            (el) =>
              el.querySelector(".demo-badge").getBoundingClientRect().top >=
              el.querySelector("img").getBoundingClientRect().bottom,
          ),
        "Demo badge is below photo",
      );
      await page.locator(".stone-row").last().scrollIntoViewIfNeeded();
      await page.waitForFunction(() =>
        [...document.querySelectorAll(".stone-thumbnail img")].every(
          (image) => image.complete && image.naturalWidth > 0,
        ),
      );
      const broken = await page
        .locator("img:not(.leaflet-tile)")
        .evaluateAll((images) =>
          images
            .filter((image) => !image.complete || !image.naturalWidth)
            .map((image) => image.src),
        );
      assert.deepEqual(broken, []);
      await page
        .locator('.stone-row[data-stone="A1"] .overview-location')
        .click();
      assert.equal(
        await page.evaluate(() => {
          const d = document.querySelector("dialog");
          return d.scrollWidth <= d.clientWidth;
        }),
        true,
        `No dialog overflow at ${width}`,
      );
      assert.equal(
        await page.locator("#journey-map .leaflet-marker-icon").count(),
        5,
      );
    }
    assert.deepEqual(errors, []);
    console.log(
      "Passed: map-first layouts, Leaflet controls/pins, mobile-only finds, automatic GPS, addresses, safe notes, canceled GPS, persistent API-backed data and standalone comments, URLs/history/sharing and responsive layouts.",
    );
  } finally {
    await browser.close();
    server?.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
