const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const fixture = vm.createContext({});
vm.runInContext(fs.readFileSync('fixtures/demo-data.js', 'utf8') + ';globalThis.stones=DEMO_STONES', fixture);
const server = spawn('python3', ['-u', '-m', 'http.server', '8144']);
process.on('exit', () => server.kill());
(async () => {
  let browser;
  try {
    await new Promise((resolve, reject) => { server.stdout.once('data', resolve); server.once('error', reject); });
    browser = await chromium.launch();
    for (const width of [320, 375, 1100]) {
      const context = await browser.newContext(width < 500 ? { ...devices['iPhone 13'], viewport: { width, height: 844 } } : { viewport: { width, height: 900 } });
      const submissions = [], errors = [];
      let releasePending;
      await context.route('http://127.0.0.1:8787/**', async route => {
        const request = route.request();
        if (new URL(request.url()).pathname.endsWith('/watchdog')) {
          const body = request.postDataJSON();
          submissions.push({ path: new URL(request.url()).pathname, body });
          if (body.email === 'fail@example.invalid') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Please retry. Your email is still here.' }) });
          if (body.email === 'pending@example.invalid') await new Promise(resolve => { releasePending = resolve; });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, notificationsEnabled: false }) });
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(request.method() === 'GET' ? { stones: fixture.stones } : { ok: true, views: 1 }) });
      });
      await context.route('https://tile.openstreetmap.org/**', route => route.abort());
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:8144/?stone=A1');
      await page.locator('dialog[open]').waitFor();
      assert.equal(await page.locator('#start-find').count(), 0);
      assert.equal(await page.locator('#watchdog-panel').isVisible(), false);
      assert.ok(await page.locator('.detail-topbar').evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.locator('#watch-stone').click();
      assert.equal(await page.locator('#watch-stone').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'watchdog-title');
      assert.match(await page.locator('#watchdog-panel').innerText(), /Notifications are not active yet.*Your email stays private/s);
      await page.locator('#watchdog-email').fill('invalid');
      await page.locator('#save-watchdog').click();
      assert.equal(submissions.length, 0, 'Invalid emails do not submit');
      const beforeFinds = await page.evaluate(() => stoneRepository.get('A1').finds.length);
      await page.evaluate(() => { window.savedJourneyMap = mapInstances.get('journey-map').map; });
      await page.locator('#watchdog-email').fill('first+watch@example.invalid');
      await page.locator('#save-watchdog').click();
      await page.locator('#watchdog-status').filter({ hasText: 'Your email is saved' }).waitFor();
      assert.deepEqual(submissions[0], { path: '/api/stones/A1/watchdog', body: { email: 'first+watch@example.invalid' } });
      assert.equal(await page.locator('#watchdog-email').inputValue(), '');
      assert.equal(await page.evaluate(() => stoneRepository.get('A1').finds.length), beforeFinds);
      assert.equal(await page.evaluate(() => window.savedJourneyMap === mapInstances.get('journey-map').map), true);
      await page.locator('#watchdog-email').fill('fail@example.invalid');
      await page.locator('#save-watchdog').click();
      await page.locator('#watchdog-status').filter({ hasText: 'Please retry' }).waitFor();
      assert.equal(await page.locator('#watchdog-email').inputValue(), 'fail@example.invalid');
      assert.equal(await page.locator('#save-watchdog').isEnabled(), true);
      await page.locator('#watchdog-email').fill('second@example.invalid');
      await page.locator('#save-watchdog').click();
      await page.locator('#watchdog-status').filter({ hasText: 'Your email is saved' }).waitFor();
      await page.locator('#close-watchdog').click();
      assert.equal(await page.locator('#watchdog-panel').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'watch-stone');
      if (width < 500) {
        await page.goto('http://127.0.0.1:8144/?stone=A1&source=qr');
        await page.locator('#start-find').click();
        await page.locator('#find-code').fill('12');
        await page.locator('#watch-stone').click();
        assert.equal(await page.locator('#find-container').isVisible(), false);
        await page.locator('#close-watchdog').click();
        assert.equal(await page.locator('#find-code').inputValue(), '12', 'Opening Watchdog preserves the find draft');
        await page.locator('#watch-stone').click();
        await page.locator('#start-find').click();
        assert.equal(await page.locator('#watchdog-panel').isVisible(), false);
      }
      await page.locator('#watch-stone').click();
      await page.locator('#watchdog-email').fill('pending@example.invalid');
      await page.locator('#save-watchdog').click();
      await page.waitForFunction(() => document.querySelector('#save-watchdog').disabled);
      assert.equal(await page.locator('#watchdog-email').isEnabled(), false);
      await page.evaluate(() => openStone('B2'));
      releasePending();
      await page.locator('#watch-stone').click();
      assert.equal(await page.locator('#watchdog-status').innerText(), '', 'A late response does not change another stone');
      assert.equal(submissions.at(-1).path, '/api/stones/A1/watchdog');
      assert.ok(await page.locator('#stone-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
      assert.deepEqual(errors, []);
      if (width === 320) await page.screenshot({ path: '/tmp/livingstones-watchdog-320.png' });
      await context.close();
    }
    console.log('Passed: Watchdog opening, validation, private email submission, error recovery, multiple emails, find drafts, late replies and responsive layouts.');
  } finally { await browser?.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
