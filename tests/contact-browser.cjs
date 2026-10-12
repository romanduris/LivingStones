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
      let releasePending,loseReply=true;const requestKeys=[];
      await context.route('http://127.0.0.1:8787/**', async route => {
        const request = route.request();
        if (new URL(request.url()).pathname.endsWith('/contact')) {
          const body = request.postDataJSON();
          requestKeys.push(request.headers()['idempotency-key']);assert.ok(requestKeys.at(-1));
          submissions.push({ path: new URL(request.url()).pathname, body });
          if(body.email==='first+watch@example.invalid'&&loseReply){loseReply=false;return route.abort('failed');}
          if (body.email === 'fail@example.invalid') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Please retry. Your email is still here.' }) });
          if (body.email === 'pending@example.invalid') await new Promise(resolve => { releasePending = resolve; });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true }) });
        }
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify(request.method() === 'GET' ? { stones: fixture.stones } : { ok: true, views: 1 }) });
      });
      await context.route('https://tile.openstreetmap.org/**', route => route.abort());
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      await page.goto('http://127.0.0.1:8144/?stone=A1');
      await page.locator('dialog[open]').waitFor();
      assert.equal(await page.locator('#start-find').count(), 0);
      assert.equal(await page.locator('#watchdog-panel').count(),0);
      assert.equal(await page.locator('#contact-panel').isVisible(), false);
      assert.ok(await page.locator('.detail-topbar').evaluate(el => el.scrollWidth <= el.clientWidth));
      await page.locator('#contact-stone').click();
      assert.equal(await page.locator('#contact-stone').getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'contact-title');
      assert.match(await page.locator('#contact-panel').innerText(), /Send a message to the Living Stones creator.*Your message stays private/s);
      assert.ok(await page.evaluate(() => {
        const save = document.querySelector('#send-contact').getBoundingClientRect();
        const close = document.querySelector('#close-contact').getBoundingClientRect();
        return Math.abs(save.top - close.top) < 1 && close.left > save.right;
      }), `Save and Close are side by side at ${width}`);
      await page.locator('#contact-name').fill('Visitor');await page.locator('#contact-message').fill('A question <hello> about the stone');
      await page.locator('#contact-email').fill('invalid');
      await page.locator('#send-contact').click();
      assert.equal(submissions.length, 0, 'Invalid emails do not submit');
      const beforeFinds = await page.evaluate(() => stoneRepository.get('A1').finds.length);
      await page.evaluate(() => { window.savedJourneyMap = mapInstances.get('journey-map').map; });
      await page.locator('#contact-email').fill('first+watch@example.invalid');
      await page.locator('#send-contact').click();
      await page.locator('#contact-status').filter({hasText:'We couldn’t reach'}).waitFor();
      await page.locator('#send-contact').click();
      await page.locator('#contact-status').filter({ hasText: 'Your message has been sent' }).waitFor();
      assert.equal(requestKeys[0],requestKeys[1]);
      assert.deepEqual(submissions[0], { path: '/api/stones/A1/contact', body: { nickname:'Visitor',email: 'first+watch@example.invalid',message:'A question <hello> about the stone',language:'en' } });
      assert.equal(await page.locator('#contact-email').inputValue(), '');
      assert.equal(await page.evaluate(() => stoneRepository.get('A1').finds.length), beforeFinds);
      assert.equal(await page.evaluate(() => window.savedJourneyMap === mapInstances.get('journey-map').map), true);
      await page.locator('#contact-message').fill('Another question');
      await page.locator('#contact-email').fill('fail@example.invalid');
      await page.locator('#send-contact').click();
      await page.locator('#contact-status').filter({ hasText: 'Please retry' }).waitFor();
      assert.equal(await page.locator('#contact-email').inputValue(), 'fail@example.invalid');
      assert.equal(await page.locator('#send-contact').isEnabled(), true);
      await page.locator('#contact-email').fill('second@example.invalid');
      await page.locator('#send-contact').click();
      await page.locator('#contact-status').filter({ hasText: 'Your message has been sent' }).waitFor();
      await page.locator('#close-contact').click();
      assert.equal(await page.locator('#contact-panel').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'contact-stone');
      if (width < 500) {
        await page.goto('http://127.0.0.1:8144/?stone=A1&source=qr');
        await page.locator('#start-find').click();
        await page.locator('#find-code').fill('12');
        await page.locator('#contact-stone').click();
        assert.equal(await page.locator('#find-container').isVisible(), false);
        await page.locator('#close-contact').click();
        assert.equal(await page.locator('#find-code').inputValue(), '12', 'Opening Contact preserves the find draft');
        await page.locator('#contact-stone').click();
        await page.locator('#start-find').click();
        assert.equal(await page.locator('#contact-panel').isVisible(), false);
      }
      await page.locator('#contact-stone').click();
      await page.locator('#contact-message').fill('A pending question');
      await page.locator('#contact-email').fill('pending@example.invalid');
      await page.locator('#send-contact').click();
      await page.waitForFunction(() => document.querySelector('#contact-fields').disabled);
      assert.equal(await page.locator('#contact-email').isEnabled(), false);
      await page.evaluate(() => openStone('B2'));
      releasePending();
      await page.locator('#contact-stone').click();
      assert.equal(await page.locator('#contact-status').innerText(), '', 'A late response does not change another stone');
      assert.equal(submissions.at(-1).path, '/api/stones/A1/contact');
      assert.ok(await page.locator('#stone-dialog').evaluate(el => el.scrollWidth <= el.clientWidth));
      assert.deepEqual(errors, []);
      if (width === 320) await page.screenshot({ path: '/tmp/livingstones-contact-320.png' });
      await context.close();
    }
    console.log('Passed: Envelope opening, validation, private messages, stable retry keys, error recovery, preserved find drafts, late replies and responsive layouts.');
  } finally { await browser?.close(); server.kill(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
