// CARE_COMPASS_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser:ai-connection
// Connection checks are mocked locally. This suite never calls a paid provider.
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.CARE_COMPASS_PLAYWRIGHT || 'playwright');
const { startServer } = require('./server-helper.cjs');

async function idle(page) {
  await page.waitForFunction(() => window.CareAI && !window.CareAI.checking);
}

async function run() {
  const server = await startServer();
  let browser;
  const contexts = [];
  const errors = [];
  let providerCalls = 0;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    async function visit(status, { saved, file = false } = {}) {
      const context = await browser.newContext();
      contexts.push(context);
      await context.addInitScript(({ saved }) => {
        if (saved !== undefined) {
          try { localStorage.setItem('care-ai-enabled', String(saved)); } catch { /* Local-file storage varies. */ }
        }
        window.__connectionFetches = [];
        const fetch = window.fetch.bind(window);
        window.fetch = (url, options) => {
          if (String(url).includes('/api/ai')) window.__connectionFetches.push(String(url));
          return fetch(url, options);
        };
      }, { saved });
      let checks = 0;
      await context.route('**/api/ai/status', async route => {
        checks++;
        await status(route, checks);
      });
      await context.route('**/api/ai', async route => {
        providerCalls++;
        await route.fulfill({
          status: 503, contentType: 'application/json',
          body: JSON.stringify({ error: 'Connection checks must not submit a prompt.' })
        });
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(file ? pathToFileURL(path.join(__dirname, '..', 'index.html')).href : server.baseURL);
      return { page, checks: () => checks };
    }
    const status = available => route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ available })
    });

    const missing = await visit(status(false));
    await idle(missing.page);
    assert.equal(await missing.page.locator('#ai-enabled').isDisabled(), false, 'Missing configuration must leave the control usable');
    assert.equal(await missing.page.locator('#ai-enabled').isChecked(), false);
    assert.match(await missing.page.locator('#ai-status').textContent(), /API key/i);
    assert.equal(await missing.page.locator('#ai-retry').isVisible(), true);
    await missing.page.locator('#ai-enabled').click();
    await missing.page.waitForFunction(() => document.querySelector('#ai-connection-help').open);
    await idle(missing.page);
    assert.equal(missing.checks(), 2, 'Clicking an unavailable control must recheck the connection');
    assert.equal(await missing.page.locator('#ai-enabled').isChecked(), false);
    assert.match(await missing.page.locator('#ai-connection-help').textContent(), /OPENAI_API_KEY|API key/i);
    assert.equal(await missing.page.evaluate(() => localStorage.getItem('care-ai-enabled')), null, 'An unsuccessful connection attempt must not save an opt-out');
    await missing.page.locator('#accessibility').click();
    assert.equal(await missing.page.locator('#settings-ai').isDisabled(), false);
    await missing.page.locator('#settings-ai').click();
    await idle(missing.page);
    assert.equal(missing.checks(), 3, 'The Settings control must also recheck instead of ignoring a click');
    assert.equal(await missing.page.locator('#settings-ai').isChecked(), false);
    await missing.page.locator('.dialog-close').click();
    assert.equal(await missing.page.evaluate(() => localStorage.getItem('care-ai-enabled')), null);

    const recovered = await visit((route, count) => count === 1 ? route.abort('failed') : status(true)(route));
    await idle(recovered.page);
    assert.equal(await recovered.page.locator('#ai-enabled').isDisabled(), false);
    await recovered.page.locator('#ai-retry').click();
    await idle(recovered.page);
    assert.equal(recovered.checks(), 2);
    assert.equal(await recovered.page.locator('#ai-enabled').isChecked(), true);
    assert.equal(await recovered.page.locator('#ai-retry').isVisible(), false);
    assert.equal(await recovered.page.locator('#ai-connection-help').isVisible(), false);
    assert.equal(await recovered.page.evaluate(() => window.CareAI.enabled), true);
    assert.match(await recovered.page.locator('#assistant-status').textContent(), /AI is enabled/i, 'Other tools must receive the updated connection state');
    await recovered.page.locator('#ai-enabled').uncheck();
    assert.equal(await recovered.page.evaluate(() => window.CareAI.enabled), false);
    await recovered.page.locator('#ai-enabled').check();
    assert.equal(await recovered.page.evaluate(() => window.CareAI.enabled), true);

    const savedOff = await visit((route, count) => status(count > 1)(route), { saved: false });
    await idle(savedOff.page);
    await savedOff.page.locator('#ai-retry').click();
    await idle(savedOff.page);
    assert.equal(await savedOff.page.evaluate(() => window.CareAI.available), true);
    assert.equal(await savedOff.page.locator('#ai-enabled').isChecked(), false, 'Retrying connection must respect a saved off choice');
    assert.equal(await savedOff.page.evaluate(() => localStorage.getItem('care-ai-enabled')), 'false');
    await savedOff.page.locator('#ai-enabled').check();
    assert.equal(await savedOff.page.evaluate(() => window.CareAI.enabled), true);
    assert.equal(await savedOff.page.evaluate(() => localStorage.getItem('care-ai-enabled')), 'true');

    const explicit = await visit((route, count) => status(count > 1)(route), { saved: false });
    await idle(explicit.page);
    await explicit.page.locator('#ai-enabled').click();
    await idle(explicit.page);
    assert.equal(await explicit.page.evaluate(() => window.CareAI.enabled), true, 'An explicit enable click may connect and override the previous off choice');
    assert.equal(await explicit.page.locator('#ai-enabled').isChecked(), true);

    const staticPreview = await visit(route => route.fulfill({
      status: 404, contentType: 'text/html', body: '<h1>Not found</h1>'
    }));
    await idle(staticPreview.page);
    await staticPreview.page.locator('#ai-enabled').click();
    await idle(staticPreview.page);
    assert.equal(staticPreview.checks(), 2);
    assert.equal(await staticPreview.page.locator('#ai-enabled').isChecked(), false);
    assert.match(await staticPreview.page.locator('#ai-connection-guidance').textContent(), /server|npm start|localhost/i);
    assert.equal(await staticPreview.page.locator('#ai-connection-help').evaluate(details => details.open), true);

    const localFile = await visit(status(false), { file: true });
    await idle(localFile.page);
    assert.match(await localFile.page.locator('#ai-status').textContent(), /localhost|local file|npm start/i);
    assert.equal(await localFile.page.locator('#ai-enabled').isDisabled(), false);
    await localFile.page.locator('#ai-enabled').click();
    await idle(localFile.page);
    assert.equal(await localFile.page.locator('#ai-enabled').isChecked(), false);
    assert.match(await localFile.page.locator('#ai-connection-guidance').textContent(), /localhost|npm start/i);
    assert.deepEqual(await localFile.page.evaluate(() => window.__connectionFetches), [], 'Local files should explain setup without attempting unsupported API fetches');
    assert.equal(localFile.checks(), 0);

    let releaseStatus;
    const gate = new Promise(resolve => { releaseStatus = resolve; });
    const pending = await visit(async route => {
      await gate;
      await status(true)(route);
    });
    await pending.page.locator('#accessibility').click();
    assert.equal(await pending.page.locator('#settings-ai').isDisabled(), true);
    releaseStatus();
    await idle(pending.page);
    assert.equal(await pending.page.locator('#settings-ai').isDisabled(), false, 'An open Settings dialog must update after connection checking finishes');
    assert.equal(await pending.page.locator('#settings-ai').isChecked(), true);
    await pending.page.locator('#large').check();
    await pending.page.locator('#save-access').click();
    assert.equal(await pending.page.evaluate(() => localStorage.getItem('care-ai-enabled')), null, 'Saving unrelated preferences must not persist an untouched AI choice');
    await pending.page.locator('#accessibility').click();
    await pending.page.locator('#settings-ai').uncheck();
    await pending.page.evaluate(() => window.CareAI.refresh());
    await idle(pending.page);
    assert.equal(await pending.page.locator('#settings-ai').isChecked(), false, 'A refreshed connection must preserve a staged Settings preference');
    await pending.page.locator('#save-access').click();
    assert.equal(await pending.page.evaluate(() => window.CareAI.enabled), false);
    assert.equal(await pending.page.locator('#ai-enabled').isChecked(), false);
    assert.equal(await pending.page.evaluate(() => localStorage.getItem('care-ai-enabled')), 'false');

    assert.equal(providerCalls, 0, 'Checking or enabling the connection must not submit medical text');
    assert.deepEqual(errors, []);
    console.log('AI connection browser checks passed: clickable unavailable controls, setup help, retry recovery, saved opt-out, explicit enable, static previews, local files, and live Settings updates.');
  } finally {
    for (const context of contexts) await context.close();
    await browser?.close();
    await server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
