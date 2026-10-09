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
    for (const stone of stones) stone.creator = stone.finds[0].nickname;
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
    await context.route("https://photon.komoot.io/api/**", async (route) => {
      const q = new URL(route.request().url()).searchParams.get("q");
      if (q === "failure") return route.fulfill({status:503,body:"Unavailable"});
      const cities = [
        {name:"Banská Bystrica", country:"Slovakia", state:"Banskobystrický kraj", coordinates:[19.1457338,48.735429]},
        {name:"Bratislava", country:"Slovakia", coordinates:[17.107,48.148]},
      ].filter(c => c.name.toLowerCase().startsWith(q.toLowerCase()));
      await route.fulfill({contentType:"application/json",body:JSON.stringify({features:cities.map(c=>({properties:{name:c.name,country:c.country,state:c.state},geometry:{type:"Point",coordinates:c.coordinates}}))})});
    });
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
        if (parts[2] === "page-views") {
          context.homepageViews = (context.homepageViews || 0) + 1; result = {ok:true};
        } else if (kind === "views") {
          stone.views = (stone.views || 0) + 1;
          result = {views: stone.views};
        } else if (body.code !== stone?.code) {
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
      if (req.method() === "GET" && parts[2] === "stones" && id) {
        if (stone) result = { stone };
        else { status = 404; result = { error: "This stone could not be found." }; }
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
              stoneRepository.list().length === 14 &&
              document.querySelector("#data-status").hidden,
          );
          if (!(await page.locator("dialog[open]").count())) {
            if (!(await page.locator("#world-map-body").isVisible())) await page.locator("#map-toggle").click();
            if (!(await page.locator("#stone-filter-body").isVisible())) await page.locator("#filters-toggle").click();
            await page.locator('[data-stone-view="list"]').click();
          }
          return result;
        };
      }
    };
    const rows = ".story-feed .find-entry";
    async function chooseCity(page, city = "Bratislava") {
      await page.locator("#choose-city").click();
      await page.locator("#manual-city").fill(city.slice(0,3));
      await page.locator(".city-result").filter({hasText:city}).click();
    }
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
    await page.waitForTimeout(100);
    assert.equal(desktop.homepageViews,1,"The initial overview counts one homepage opening");
    assert.equal(await page.locator(".stone-row").count(), 14);
    assert.deepEqual(await page.locator(".stone-row").evaluateAll(rows=>rows.map(row=>row.dataset.stone)), ["J10","F6","G7","K11","H8","L12","I9","M13","C3","N14","E5","A1","D4","B2"]);
    assert.equal(await page.locator('th[aria-sort="descending"]').count(), 1);
    assert.match(await page.locator('th[aria-sort="descending"]').innerText(), /Last Found[\s\S]*↓/i);
    assert.equal(await page.locator('#main-language-menu .language-flag').count(), 4);
    assert.deepEqual(await page.locator('#main-language-menu .language-code').allTextContents(), ["EN","SK","HU","DE"]);
    for (const code of ["en", "sk", "hu", "de"]) {
      await page.locator('.site-header .language-switch').click();
      await page.locator('#main-language-menu:popover-open').waitFor();
      assert.deepEqual(await page.locator('#main-language-menu [data-language]').evaluateAll(els=>els.map(el=>el.dataset.language)), ["en", "sk", "hu", "de"]);
      await page.locator(`#main-language-menu [data-language="${code}"]`).click();
      assert.equal(await page.locator('#main-language-menu:popover-open').count(), 0);
      assert.equal(await page.locator('.site-header .language-label').textContent(), code.toUpperCase());
      assert.equal(await page.locator('html').getAttribute('lang'), code);
    }
    await page.locator('.site-header .language-switch').click();await page.locator('#main-language-menu [data-language=en]').click();
    await page.locator('.site-header .language-switch').focus();
    await page.keyboard.press('Enter');
    await page.locator('#main-language-menu:popover-open').waitFor();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#main-language-menu:popover-open').count(), 0);
    assert.equal(await page.locator(".stone-thumbnail img").count(), 14);
    assert.equal(await page.locator("#map-legend").count(), 0);
    assert.match(
      await page.locator(".intro-copy").innerText(),
      /Scan the QR code on the stone/,
    );
    assert.match(
      await page.locator('.stone-row[data-stone="A1"]').innerText(),
      /Bernolákov sad/,
    );
    assert.equal(
      await page.locator("#world-map .leaflet-marker-icon").count(),
      14,
    );
    assert.equal(await page.locator("#total-finds").innerText(), "70");
    assert.equal(await page.locator(".intro-copy p").count(), 1);
    assert.equal(await page.locator("#explore-title, #hello-count, #hello-label").count(), 0);
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
      .focus();
    await page.keyboard.press('Enter');
    await page.locator(".stone-overview-popup").waitFor();
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await page.evaluate(() => stoneRepository.list().reduce((n,s)=>n+(s.views||0),0)),0,"Opening the map popup does not count a story view");
    assert.equal(new URL(page.url()).searchParams.has("stone"), false);
    assert.match(await page.locator(".stone-popup-facts").innerText(), /Born.*12 Apr 2025.*Alive.*days.*Last found.*26 Sept 2026.*Trnava/s);
    assert.equal(await page.locator(".stone-popup-city .country-flag").count(), 1);
    await page.locator(".stone-popup-action").click();
    await page.waitForURL("**/?stone=A1");
    assert.match(await page.locator("#detail-title").innerText(), /Sunny Side/);
    assert.equal(await page.locator("#start-find").count(), 0);
    assert.equal(await page.locator(rows).count(), 5);
    assert.equal(await page.evaluate(() => window.gpsCalls), 0);
    assert.equal(
      await page
        .locator(".detail-body")
        .evaluate((el) => el.firstElementChild.className),
      "detail-intro",
    );
    assert.match(
      await page.locator(".detail-intro").innerText(),
      /I’m a little painted stone called Sunny Side/,
    );
    assert.equal(await page.locator(".origin-note, .life-summary").count(), 0);
    assert.match((await page.locator(".detail-story").innerText()).replace(/\s+/g, " "), /Nina painted me on 12 Apr 2025\. I was born in Petržalka, Slovakia/);
    assert.match(await page.locator(".detail-story").innerText(), /Since I was born, I’ve been found 4 times and travelled [\d,]+ km\./);
    assert.equal(await page.locator(".detail-stats .stat-finds").innerText(), "4 Finds");
    assert.equal(await page.locator(".detail-header-actions #share-stone").count(), 0);
    assert.equal(await page.locator(".detail-actions #share-stone").count(), 1);
    assert.equal(await page.locator("#other-stones").innerText(), "Explore more stones ↗");
    assert.equal(await page.locator(".journey-explanation").count(), 0);
    assert.equal(await page.locator("#history-title").innerText(), "My activity (Every find and message is part of my story.)");
    // Birth alone is not a find; the first later encounter uses singular wording.
    await page.evaluate(() => {
      const stone = stoneRepository.get(selectedId);
      window.savedDetailFinds = stone.finds;
      stone.finds = stone.finds.slice(0, 1);
      renderDetail();
    });
    assert.doesNotMatch(await page.locator(".detail-story").innerText(), /Since I was born/);
    assert.equal(await page.locator(".detail-stats .stat-finds").innerText(), "0 Finds");
    await page.evaluate(() => {
      stoneRepository.get(selectedId).finds = window.savedDetailFinds.slice(0, 2);
      renderDetail();
    });
    assert.match(await page.locator(".detail-story").innerText(), /I’ve been found 1 time and travelled [\d,]+ km\./);
    assert.equal(await page.locator(".detail-stats .stat-finds").innerText(), "1 Find");
    await page.evaluate(() => {
      stoneRepository.get(selectedId).finds = window.savedDetailFinds;
      delete window.savedDetailFinds;
      renderDetail();
    });
    assert.match(await page.locator(".detail-stats").innerText(), /Days alive.*Finds.*Countries/s);
    await page.waitForFunction(() => Number(document.querySelector(".stone-views strong").textContent) > 0);
    assert.match(await page.locator(".stone-views").innerText(), /^Views: \d+$/);
    assert.equal(await page.locator(".find-number").count(), 0);
    assert.equal(await page.locator(".find-entry .country-flag").count(), 5);
    assert.ok(
      await page.evaluate(() => {
        const top = (selector) =>
          document.querySelector(selector).getBoundingClientRect().top;
        return (
          top(".detail-intro") < top("#journey-map") &&
          top("#journey-map") < top(".detail-actions") &&
          top(".detail-actions") < top(".detail-stats") &&
          top(".detail-stats") < top(".story-feed")
        );
      }),
    );
    const dates = await page
      .locator(".find-entry time")
      .evaluateAll((elements) => elements.map((el) => Date.parse(el.dateTime)));
    assert.ok(dates.every((date, i) => !i || dates[i - 1] >= date));
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
    await page.goto(base + "/docs/?stone=C3&source=qr");
    assert.equal(await page.locator("#start-find").count(), 0);
    assert.match(await page.locator("#detail-title").innerText(), /Slow Bloom/);
    await page.locator("#other-stones").click();
    await page.waitForURL(base + "/docs/");
    assert.equal(await page.locator("dialog[open]").count(), 0);
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
    assert.equal(await phone.locator("#start-find, .find-help").count(), 0, "Ordinary mobile story links do not offer a find");
    await phone.goto(base + "/?stone=A1&source=other");
    assert.equal(await phone.locator("#start-find").count(), 0, "Only the QR parameter enables the find action");
    await phone.goto(base + "/?stone=A1&source=qr");
    await phone.evaluate(() => {
      window.sharedStory = null;
      Object.defineProperty(navigator, "share", {configurable:true,value:async data => {window.sharedStory = data;}});
    });
    await phone.locator("#share-stone").click();
    const sharedStory = await phone.evaluate(() => window.sharedStory.url);
    assert.equal(new URL(sharedStory).searchParams.get("source"), null, "Native sharing strips QR access");
    await phone.evaluate(() => {
      Object.defineProperty(navigator, "share", {configurable:true,value:undefined});
      Object.defineProperty(navigator, "clipboard", {configurable:true,value:{writeText:async url => {window.copiedLink=url;}}});
    });
    await phone.locator("#share-stone").click();
    assert.equal(await phone.evaluate(() => new URL(window.copiedLink).searchParams.get("source")), null);
    await phone.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {configurable:true,value:{writeText:async () => {throw Error("Unavailable");}}});
    });
    await phone.locator("#share-stone").click();
    assert.equal(new URL(await phone.locator("#share-fallback input").inputValue()).searchParams.get("source"), null);
    await phone.goto(sharedStory);
    assert.equal(await phone.locator("#start-find").count(), 0, "Opening the shared story hides the find action");
    await phone.goto(base + "/?stone=A1&source=qr");
    assert.equal(mobile.homepageViews || 0,0,"A direct story link does not count a homepage visit");
    for (const width of [320, 375, 390]) {
      await phone.setViewportSize({ width, height: 844 });
      const actions = await phone
        .locator(".detail-actions button")
        .evaluateAll((elements) =>
          elements.map((el) => el.getBoundingClientRect().top),
        );
      assert.equal(actions.length, 3);
      assert.ok(
        Math.max(...actions) - Math.min(...actions) <= 1,
        "Explore, watchdog and share fill one mobile row below the map",
      );
      assert.ok(await phone.evaluate(() => {
        const bounds = selector => document.querySelector(selector).getBoundingClientRect();
        const find = bounds('#start-find'), intro = bounds('.detail-intro');
        const row = bounds('.detail-actions'), map = bounds('.detail-journey .map-frame');
        const explore = bounds('#other-stones'), watch = bounds('#watch-stone'), share = bounds('#share-stone');
        return Math.abs(find.width - intro.width) < 1 && find.bottom <= map.top &&
          row.top >= map.bottom && Math.abs(row.width - map.width) < 1 &&
          Math.abs(explore.left - row.left) < 1 && Math.abs(share.right - row.right) < 1 &&
          watch.width === watch.height && share.width === share.height;
      }), 'Full-width find button and compact action row with square icons');
      assert.ok(
        await phone
          .locator("#stone-dialog")
          .evaluate((el) => el.scrollWidth <= el.clientWidth),
      );
    }
    assert.equal(await phone.evaluate(() => window.gpsCalls), 0);
    assert.equal(lookups, 0);
    await phone.waitForFunction(() => Number(document.querySelector(".stone-views strong").textContent)>0);
    assert.equal(mobile.homepageViews || 0,0,"Resizing a story does not count homepage visits");
    const viewsBeforeForm=await phone.locator(".stone-views").innerText();
    await phone.locator("#start-find").click();
    assert.equal(await phone.locator(".stone-views").innerText(),viewsBeforeForm,"Opening a find form does not add another story view");
    assert.equal(await phone.evaluate(() => document.activeElement.id), "find-title");
    await phone.waitForFunction(() => {
      const header = document.querySelector(".detail-topbar").getBoundingClientRect();
      const title = document.querySelector("#find-title").getBoundingClientRect();
      const intro = document.querySelector(".find-panel > p").getBoundingClientRect();
      const dialog = document.querySelector("#stone-dialog").getBoundingClientRect();
      return title.top >= header.bottom && title.top < header.bottom + 65 && intro.bottom < dialog.bottom;
    });
    assert.equal(await phone.locator(".detail-topbar .language-switch").isEnabled(), true);
    await phone.locator('.detail-topbar .language-switch').click();
    await phone.locator('#detail-language-menu [data-language="de"]').click();
    assert.equal(await phone.locator('.detail-topbar .language-label').textContent(), "DE");
    assert.equal(await phone.locator('dialog[open]').count(), 1);
    await phone.locator('.detail-topbar .language-switch').click();
    await phone.keyboard.press('Escape');
    assert.equal(await phone.locator('#detail-language-menu:popover-open').count(), 0);
    assert.equal(await phone.locator('dialog[open]').count(), 1);
    assert.equal(await phone.locator(".site-header .language-switch").isEnabled(), true);
    await phone.locator('.detail-topbar .language-switch').click();await phone.locator('#detail-language-menu [data-language=en]').click();
    assert.equal(await phone.locator("#detail-title small").count(), 0);
    assert.equal(await phone.locator("#find-code").getAttribute("inputmode"), "numeric");
    await phone.locator("#find-code").click();
    assert.equal(await phone.evaluate(() => document.activeElement.id), "find-code");
    assert.match(
      await phone.locator("#find-container .find-panel").innerText(),
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
    await phone.locator("#find-code").fill("8451");
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
    assert.equal(await phone.locator("#demo-city, #start-comment").count(), 0);
    assert.equal(await phone.locator("#manual-city").isVisible(), false);
    await phone.locator("#choose-city").click();
    await phone.locator("#manual-city").fill("failure");
    await phone.waitForFunction(() => document.querySelector("#city-search-status").textContent.includes("unavailable"));
    assert.equal(await phone.locator("#location-next").isEnabled(), false);
    await phone.locator("#manual-city").fill("zzzz");
    await phone.waitForFunction(() => document.querySelector("#city-search-status").textContent.includes("No matching"));
    await chooseCity(phone, "Banská Bystrica");
    assert.deepEqual(await phone.evaluate(() => {
      const p = mapInstances.get("location-preview").markers[0].getLatLng();
      return [p.lat,p.lng];
    }), [48.735429,19.1457338]);
    assert.equal(
      await phone.locator("#location-preview .leaflet-marker-icon").count(),
      1,
    );
    assert.match(
      await phone.locator("#location-status").innerText(),
      /Banská Bystrica/,
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
    assert.equal(await phone.locator("#success-title").innerText(), "<b>Tester</b> 👏, you’ve made my day.");
    assert.equal(await phone.locator("#success-title b").count(), 0);
    assert.ok(await phone.locator('.success-heading').evaluate(el=>{
      const icon=el.querySelector('.success-icon').getBoundingClientRect();
      const title=el.querySelector('h3').getBoundingClientRect();
      return icon.right < title.left && Math.abs(icon.top-title.top) < 8;
    }));
    assert.deepEqual(await phone.locator(".success-panel > p").allTextContents(), ["Take me along, then leave me somewhere new for my next friend.", "Your moment is saved in my story."]);
    assert.equal(await phone.locator(rows).count(), 6);
    assert.match(
      await phone.locator(rows).first().innerText(),
      /Banská Bystrica/,
    );
    assert.match(
      await phone.locator(rows).first().innerText(),
      /<b>Tester<\/b>/,
    );
    assert.equal(await phone.locator(".story-feed script").count(), 0);
    assert.equal(await phone.locator("#journey-map .is-new").count(), 1);
    assert.equal(await phone.locator("#total-finds").innerText(), "71");
    assert.equal(await phone.locator(".stone-row").first().getAttribute("data-stone"), "A1");
    assert.equal(await phone.locator(rows).first().locator(".entry-address .manual-badge").innerText(), "Manual");
    assert.match(
      await phone
        .locator('.stone-row[data-stone="A1"] .overview-latest')
        .textContent(),
      /Tester/,
    );
    await phone.locator("#finish-find").click();
    await phone.locator("#other-stones").click();
    assert.equal(new URL(phone.url()).searchParams.get("source"), null, "Returning to the list clears QR access");
    if (!(await phone.locator("#stone-filter-body").isVisible())) await phone.locator("#filters-toggle").click();
    await phone.locator('[data-stone-view="list"]').click();
    await phone.locator('.stone-link[data-stone="A1"]').click();
    assert.equal(await phone.locator("#start-find, .find-help").count(), 0, "List navigation does not inherit QR access");
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
    await phone.goto(base + "/?stone=A1&source=qr");
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
    await phone.locator("#find-code").fill("8451");
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
    assert.match(await phone.locator(rows).first().innerText(), /Ľanová 8/);
    const gpsEntry = phone.locator(rows).first();
    assert.equal(await gpsEntry.locator(".entry-address .gps-badge").count(), 1);
    assert.equal(await gpsEntry.locator(".entry-author .local-badge").count(), 0);
    assert.equal(await gpsEntry.locator(".entry-address").innerText(), "GPS Ľanová 8, Ružinov");
    assert.match(
      await phone.locator(rows).first().innerText(),
      /GPS/,
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
    await phone.goto(base + "/?stone=B2&source=qr");
    await phone.evaluate(() => (window.gpsMode = "zero"));
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("8452");
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
      await phone.locator(rows).first().innerText(),
      /Address unavailable — 0.00000, 0.00000/,
    );
    // Canceling a pending GPS request must not create or alter a find.
    await phone.goto(base + "/?stone=D4&source=qr");
    await phone.evaluate(() => (window.gpsMode = "late"));
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("8454");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#use-gps").waitFor();
    await phone.locator("#cancel-find").click();
    await phone.evaluate(() => window.releaseGPS());
    assert.equal(await phone.locator(rows).count(), 5);
    assert.equal(await phone.locator("#find-container").innerText(), "");
    // A manual city selection wins over a late GPS response.
    await phone.unroute("https://photon.komoot.io/**");
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("8454");
    await phone.locator("#find-form button[type=submit]").click();
    await chooseCity(phone);
    await phone.evaluate(() => window.releaseGPS());
    assert.match(await phone.locator("#location-status").innerText(), /Manual city location:.*Bratislava/);
    assert.equal(await phone.locator("#location-next").isEnabled(), true);
    await phone.locator("#manual-city").fill("Ba");
    assert.equal(await phone.locator("#location-next").isEnabled(), false);
    await phone.locator("#cancel-find").click();
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
    await mp.goto(base + "/?stone=C3&source=qr");
    await mp.locator("#start-find").click();
    await mp.locator("#find-code").fill("8453");
    await mp.locator("#find-form button[type=submit]").click();
    await mp.locator("#location-status").waitFor();
    assert.match(
      await mp.locator("#location-status").innerText(),
      /unavailable/,
    );
    await chooseCity(mp);
    await mp.locator("#location-next").click();
    await mp.locator("#find-form button[type=submit]").click();
    await mp.locator("#success-title").waitFor();
    assert.equal(await mp.locator("#success-title").innerText(), "You’ve made my day. 👏");
    assert.equal(await mp.locator(rows).count(), 6);
    assert.match(await mp.locator(".success-panel").innerText(), /is saved/);
    await phone.unroute("https://photon.komoot.io/**");
    // A lost receipt leaves the form intact; retry uses the original key and saves once.
    await phone.goto(base + "/?stone=A1&source=qr");
    await phone.locator("#start-find").click();
    await phone.locator("#find-code").fill("8451");
    await phone.locator("#find-form button[type=submit]").click();
    await phone.locator("#choose-city").waitFor();
    await chooseCity(phone);
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
    await phone.goto(base + "/?stone=E5&source=qr");
    const beforeNotes = await phone.locator("#total-finds").innerText();
    assert.equal(await phone.locator("#start-comment").count(), 0);
    await phone.evaluate(async () => {
      await fetch("http://127.0.0.1:8787/api/stones/E5/comments", {method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":crypto.randomUUID()},body:JSON.stringify({code:"8455",nickname:"Kind friend",message:"A little hello that stays. <b>Safe text</b>"})});
    });
    await phone.reload();
    await phone.locator("#stone-notes .note-entry").waitFor();
    assert.equal(await phone.locator("#total-finds").innerText(), beforeNotes);
    await phone.reload();
    assert.match(
      await phone.locator("#stone-notes").innerText(),
      /A little hello that stays/,
    );
    assert.equal(await phone.locator("#stone-notes .note-entry b").count(), 0);
    assert.equal(await phone.locator(rows).count(), 5);
    assert.equal(
      await phone
        .locator(".story-entry")
        .first()
        .evaluate((el) => el.classList.contains("note-entry")),
      true,
    );
    assert.equal(await phone.locator(".note-entry .entry-location").count(), 0);
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
        14,
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
      assert.ok(await page.locator(".stone-row").first().evaluate(row =>
        [...row.cells].filter(el => el.offsetWidth).every(el => getComputedStyle(el).verticalAlign === "middle")
      ), "Cells align vertically in the middle");

      assert.equal(
        await page
          .locator(".stone-row")
          .first()
          .evaluate((row) => getComputedStyle(row).display),
        "table-row",
      );
      assert.equal(await page.locator(".stone-table thead").isVisible(), true);
      const numericWidths=await page.locator('.stone-row').first().evaluate(row=>[...row.querySelectorAll('.overview-age,.overview-finds,.overview-countries')].map(el=>el.getBoundingClientRect().width));
      assert.ok(Math.max(...numericWidths)-Math.min(...numericWidths)<1,'Numeric columns have equal widths');
      if(width>1100)assert.equal(await page.locator('.overview-latest strong').first().evaluate(el=>getComputedStyle(el).color),await page.locator('.overview-latest strong').first().evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--yellow)';el.append(probe);const color=getComputedStyle(probe).color;probe.remove();return color;}));
      assert.equal(await page.locator(".stone-tagline").count(), 0);
      assert.ok(await page.locator(".stone-row").first().evaluate(row=>{
        const primary=[...row.querySelectorAll(".stone-identity > strong, .overview-start > time, .overview-age > strong, .overview-finds > strong, .overview-countries > strong, .overview-location > time, .overview-latest > strong")].filter(el=>el.offsetWidth);
        const styles=primary.map(el=>getComputedStyle(el));
        return styles.every(s=>s.fontSize===styles[0].fontSize && s.fontWeight==="700");
      }));
      assert.doesNotMatch(await page.locator(".overview-location time").first().innerText(), /\d{1,2}:\d{2}/);
      assert.match(await page.locator(".overview-location time").first().innerText(), /^(Today|\d+d ago)$/);
      assert.match(await page.locator(".overview-age").first().innerText(), /^\d+ d$/);
      assert.match(await page.locator(".stone-table th").first().innerText(), /Name \/ Born/);
      assert.match(await page.locator('th[aria-sort="descending"]').innerText(), /Days \/ Place/);
      assert.ok(await page.locator('.stone-table').evaluate(table=>[...table.querySelectorAll('th small')].filter(el=>el.offsetWidth).every(el=>parseFloat(getComputedStyle(el).fontSize)<parseFloat(getComputedStyle(el.closest('th')).fontSize))), 'Header subtitles are smaller than column names');
      const countryHeading = page.locator(".stone-table th").nth(4);
      assert.match(await countryHeading.innerText(), /Countries\s+Visited/);
      assert.ok(await countryHeading.evaluate(el => el.scrollWidth <= el.clientWidth), `Countries fits at ${width}`);
      assert.ok(await page.locator(".stone-table").evaluate(table => {
        const samples = [...table.querySelectorAll("th, td strong, td time, td small")].filter(el => el.offsetWidth);
        return new Set(samples.map(el => getComputedStyle(el).fontSize)).size === 2;
      }), "Primary headings and table values keep their two font sizes");
      if (width === 320 || width === 1440) await page.locator(".stone-table-frame").screenshot({path: `/tmp/livingstones-table-refined-${width}.png`});
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
      assert.equal(await page.locator(".demo-badge").count(), 14);
      assert.equal(await page.locator(".stone-table .country-flag").count(), 14);
      assert.equal(await page.locator('.country-key').count(),0);
      assert.equal(await page.locator('.last-date').count(),0);
      assert.ok(await page.locator('.heading-copy').evaluate(el=>{const text=[...el.childNodes].find(n=>n.nodeType===Node.TEXT_NODE)||el.querySelector('[data-site-key]').firstChild;const range=document.createRange();range.selectNodeContents(text);return range.getClientRects().length===1&&el.closest('th').scrollWidth<=el.closest('th').clientWidth;}), `Last Found fits on one line at ${width}`);
      for (const [selector, alignment] of [
        [".overview-stone", "left"],
        [".overview-location", width > 1100 ? "center" : "right"],
        [".overview-age", "center"],
        [".overview-finds", "center"],
        [".overview-countries", "center"],
      ])
        assert.equal(
          await page
            .locator(selector)
            .first()
            .evaluate((el) => getComputedStyle(el).textAlign),
          alignment,
        );

      assert.equal(
        await page.locator(".overview-countries").first().isVisible(),
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
    const secureContext=await browser.newContext();
    await secureContext.route("**://livingstones.rodulab.com/**", async route => {
      const url=new URL(route.request().url());
      const response=await route.fetch({url:"http://127.0.0.1:8137"+url.pathname+url.search});
      await route.fulfill({response});
    });
    await secureContext.route("https://livingstones-api.livingstones-romanduris.workers.dev/api/page-views",r=>r.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'https://livingstones.rodulab.com'},body:'{"ok":true}'}));
    const apiOrigins=[];
    await secureContext.route("https://livingstones-api.livingstones-romanduris.workers.dev/api/stones",route=>{
      apiOrigins.push(route.request().headers().origin);
      return route.fulfill({contentType:"application/json",headers:{"Access-Control-Allow-Origin":"https://livingstones.rodulab.com"},body:JSON.stringify({stones:fixture.stones})});
    });
    const securePage=await secureContext.newPage();
    await securePage.goto("http://livingstones.rodulab.com/");
    await securePage.waitForURL("https://livingstones.rodulab.com/");
    await securePage.locator(".journey-card").first().waitFor();
    assert.deepEqual(apiOrigins,["https://livingstones.rodulab.com"],"HTTP visits redirect before requesting data");
    await securePage.waitForLoadState("networkidle");
    await secureContext.unrouteAll({ behavior: "wait" });
    await secureContext.close();
    console.log(
      "Passed: intro-first stone details, newest-first story feed, other-stone navigation, map-first overview, Leaflet controls/pins, mobile-only finds, automatic GPS, addresses, safe notes, canceled GPS, persistent API-backed data and standalone comments, URLs/history/sharing and responsive layouts.",
    );
  } finally {
    await browser.close();
    server?.kill();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
