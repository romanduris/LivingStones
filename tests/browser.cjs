const { chromium, devices } = require("playwright");
const assert = require("node:assert/strict");
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
      server.once("exit", (code) =>
        reject(Error("Test server exited: " + code)),
      );
    });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  const attach = (page) => {
    page.on("pageerror", (error) => errors.push(error.message));
  };
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1050 },
  });
  const page = await desktop.newPage();
  attach(page);
  await page.goto(base);
  await page.locator(".stone-card").last().waitFor();
  assert.equal(await page.locator(".stone-card").count(), 5);
  assert.equal(await page.locator("#total-finds").innerText(), "25");
  await page.screenshot({
    path: "/tmp/livingstones-desktop.png",
    fullPage: true,
  });
  await page.locator('[data-stone="A1"]').first().click();
  await page.waitForURL("**/?stone=A1");
  assert.equal(await page.locator("#detail-title").innerText(), "Sunny Side");
  assert.equal(await page.locator("#start-find").count(), 0);
  assert.equal(await page.locator(".timeline li").count(), 5);
  assert.equal(
    await page.evaluate(() =>
      localStorage.getItem("livingstones.demo.finds.v1"),
    ),
    null,
  );
  await page.keyboard.press("Escape");
  await page.waitForURL(base + "/");
  await page.goForward();
  await page.locator("#stone-dialog[open]").waitFor();
  await page.locator("#close-detail").click();
  await page.waitForURL(base + "/");
  await page.goto(base + "/?stone=E5");
  assert.equal(await page.locator("#detail-title").innerText(), "Ocean Echo");
  await page.locator("#close-detail").click();
  assert.equal(await page.locator("dialog[open]").count(), 0);
  await page.goto(base + "/docs/?stone=C3");
  assert.equal(await page.locator("#detail-title").innerText(), "Slow Bloom");
  await page.goto(base + "/?stone=unknown");
  assert.equal(await page.locator("dialog[open]").count(), 0);
  // Simulate all GPS outcomes without relying on operating-system permission dialogs.
  const mobile = await browser.newContext({ ...devices["iPhone 13"] });
  const phone = await mobile.newPage();
  attach(phone);
  let locationRequests = 0;
  phone.on("request", (request) => {
    if (request.url().includes("photon.komoot.io")) locationRequests++;
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
          else
            success({
              coords: { latitude: 0, longitude: 0, accuracy: 25 },
              timestamp: Date.now(),
            });
        },
      },
    });
  });
  await phone.goto(base + "/?stone=A1");
  assert.equal(await phone.evaluate(() => window.gpsCalls), 0);
  assert.equal(locationRequests, 0);
  assert.equal(await phone.locator("#start-find").count(), 1);
  await phone.locator("#start-find").click();
  await phone.locator("#find-code").fill("WRONG");
  await phone.locator("#find-form button[type=submit]").click();
  assert.match(await phone.locator("#find-error").innerText(), /doesn’t match/);
  await phone.locator("#find-code").fill("sun24");
  await phone.locator("#find-form button[type=submit]").click();
  await phone.locator("#use-gps").click();
  assert.match(await phone.locator("#location-status").innerText(), /denied/);
  assert.equal(await phone.locator("#use-gps").isEnabled(), true);
  assert.equal(await phone.locator("#location-next").isEnabled(), false);
  for (const mode of ["timeout", "unavailable"]) {
    await phone.evaluate((mode) => (window.gpsMode = mode), mode);
    await phone.locator("#use-gps").click();
    assert.equal(await phone.locator("#use-gps").isEnabled(), true);
  }
  await phone.locator("#demo-city").selectOption("3");
  await phone.locator("#location-next").click();
  await phone.locator("#nickname").fill("<b>Tester</b>");
  await phone
    .locator("#find-message")
    .fill("A sunny surprise! <script>alert(1)</script>");
  await phone.locator("#find-form button[type=submit]").click();
  assert.equal(
    await phone.locator("#success-title").innerText(),
    "You’re part of the story.",
  );
  assert.equal(await phone.locator(".timeline li").count(), 6);
  assert.match(
    await phone.locator(".timeline li").last().innerText(),
    /London, United Kingdom/,
  );
  assert.match(
    await phone.locator(".timeline li").last().innerText(),
    /<b>Tester<\/b>/,
  );
  assert.equal(await phone.locator(".timeline script").count(), 0);
  assert.equal(await phone.locator("#total-finds").innerText(), "26");
  await phone.screenshot({
    path: "/tmp/livingstones-find.png",
    fullPage: true,
  });
  await phone.reload();
  assert.equal(await phone.locator(".timeline li").count(), 6);
  await phone.locator("#close-detail").click();
  await phone.screenshot({
    path: "/tmp/livingstones-mobile.png",
    fullPage: true,
  });
  // GPS success with failed reverse geocoding preserves coordinates including 0,0.
  await phone.route("https://photon.komoot.io/**", (route) => route.abort());
  await phone.goto(base + "/?stone=B2");
  await phone.evaluate(() => (window.gpsMode = "success"));
  await phone.locator("#start-find").click();
  await phone.locator("#find-code").fill("MOON7");
  await phone.locator("#find-form button[type=submit]").click();
  await phone.locator("#use-gps").click();
  await phone.locator("#location-status.ready").waitFor();
  assert.match(
    await phone.locator("#location-status").innerText(),
    /0.0000, 0.0000/,
  );
  await phone.locator("#location-next").click();
  await phone.locator("#find-form button[type=submit]").click();
  assert.match(
    await phone.locator(".timeline li").last().innerText(),
    /GPS accuracy: approximately 25 m/,
  );
  assert.ok(locationRequests > 0);
  await phone.reload();
  assert.equal(await phone.locator(".timeline li").count(), 6);
  // No storage still permits a complete in-memory demo.
  const memory = await browser.newContext({ ...devices["iPhone 13"] });
  const memoryPage = await memory.newPage();
  attach(memoryPage);
  await memoryPage.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw Error("blocked");
      },
    });
  });
  await memoryPage.goto(base + "/?stone=C3");
  await memoryPage.locator("#start-find").click();
  await memoryPage.locator("#find-code").fill("GROW3");
  await memoryPage.locator("#find-form button[type=submit]").click();
  await memoryPage.locator("#demo-city").selectOption("0");
  await memoryPage.locator("#location-next").click();
  await memoryPage.locator("#find-form button[type=submit]").click();
  assert.match(
    await memoryPage.locator(".success-panel").innerText(),
    /this visit only/,
  );
  assert.equal(await memoryPage.locator(".timeline li").count(), 6);
  // Failed fonts/external services leave maps/images/navigation intact.
  await page.route("https://**/*", (route) => route.abort());
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(base);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      `No horizontal overflow at ${width}`,
    );
    assert.equal(await page.locator("#world-map svg a").count(), 5);
    assert.equal(await page.locator("#start-find").count(), 0);
    const broken = await page
      .locator("img")
      .evaluateAll((images) =>
        images
          .filter((image) => !image.complete || !image.naturalWidth)
          .map((image) => image.src),
      );
    assert.deepEqual(broken, []);
  }
  assert.deepEqual(errors, []);
  await browser.close();
  server?.kill();
  console.log(
    "Browser checks passed: desktop/mobile, URLs/history, finding, GPS failures/success, persistence, safe text, offline assets and responsive layouts.",
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
