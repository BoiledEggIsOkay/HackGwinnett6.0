// CARE_COMPASS_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser:pages-ai
// HTTPS deployment addresses are intercepted; only a local fake provider is called.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.CARE_COMPASS_PLAYWRIGHT || 'playwright');
const { startServer } = require('./server-helper.cjs');
const config = require('../site-config.js');

const root = path.join(__dirname, '..');
const pagesURL = `${config.pagesOrigin}${config.pagesPath}/`;
const assetTypes = new Map([
  ['.html', 'text/html'], ['.js', 'text/javascript'], ['.css', 'text/css']
]);

async function idle(page) {
  await page.waitForFunction(() => window.CareAI && !window.CareAI.checking);
}

async function send(page, text) {
  await page.locator('[data-page="assistant"]').click();
  const users = await page.locator('#chat-messages .user').count();
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-form button').click();
  await page.waitForFunction(count => document.querySelectorAll('#chat-messages .user').length === count + 1, users);
  await page.waitForFunction(() => {
    const reply = [...document.querySelectorAll('#chat-messages .bot')].at(-1);
    return reply?.querySelector('.tool-source');
  });
  return page.locator('#chat-messages .bot').last().textContent();
}

async function realCors(browser, upstreamURL, contexts, errors) {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'care-compass-cors-'));
  let child;
  let frontendOrigin;
  let backendOrigin;
  let liveConfig;
  let stripCors = false;
  const calls = [];
  const frontend = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, frontendOrigin).pathname;
    const file = pathname.slice(`${config.pagesPath}/`.length) || 'index.html';
    if (!pathname.startsWith(`${config.pagesPath}/`) || !/^[a-z0-9-]+\.(?:html|js|css)$/.test(file)) {
      response.writeHead(404);
      return response.end();
    }
    try {
      const body = file === 'site-config.js' ?
        Buffer.from(`window.CareSite = ${JSON.stringify(liveConfig)};`) :
        await fs.readFile(path.join(root, file));
      response.writeHead(200, { 'Content-Type': assetTypes.get(path.extname(file)) });
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  });
  const gateway = http.createServer(async (request, response) => {
    const forwarded = {};
    for (const name of ['origin', 'content-type', 'sec-fetch-site', 'access-control-request-method', 'access-control-request-headers']) {
      if (request.headers[name]) forwarded[name] = request.headers[name];
    }
    calls.push({ method: request.method, path: request.url, headers: request.headers });
    let body = '';
    for await (const chunk of request) body += chunk;
    try {
      const upstream = await fetch(`${backendOrigin}${request.url}`, {
        method: request.method, headers: forwarded,
        body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method) ? undefined : body
      });
      const headers = Object.fromEntries(upstream.headers);
      if (stripCors) delete headers['access-control-allow-origin'];
      response.writeHead(upstream.status, headers);
      response.end(Buffer.from(await upstream.arrayBuffer()));
    } catch { response.writeHead(502); response.end(); }
  });
  try {
    frontend.listen(0, '127.0.0.1');
    await once(frontend, 'listening');
    frontendOrigin = `http://127.0.0.1:${frontend.address().port}`;
    gateway.listen(0, '127.0.0.1');
    await once(gateway, 'listening');
    const apiOrigin = `http://127.0.0.1:${gateway.address().port}`;
    const probe = http.createServer();
    probe.listen(0, '127.0.0.1');
    await once(probe, 'listening');
    const port = probe.address().port;
    await new Promise(resolve => probe.close(resolve));
    backendOrigin = `http://127.0.0.1:${port}`;
    liveConfig = { ...config, pagesOrigin: frontendOrigin, aiOrigin: apiOrigin };
    for (const file of ['server.js', 'env-loader.js', 'index.html']) {
      await fs.copyFile(path.join(root, file), path.join(fixture, file));
    }
    await fs.writeFile(path.join(fixture, 'site-config.js'), `module.exports = ${JSON.stringify(liveConfig)};`);
    child = spawn(process.execPath, ['server.js'], {
      cwd: fixture,
      env: {
        ...process.env, PORT: String(port), OPENAI_API_KEY: 'test-only-cors-key',
        OPENAI_BASE_URL: upstreamURL
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { output += data; });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`CORS fixture failed to start: ${output}`);
      try { ready = (await fetch(`${backendOrigin}/api/ai/status`)).ok; } catch { /* Wait for listening socket. */ }
      if (ready) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true, `CORS fixture must start: ${output}`);
    const context = await browser.newContext();
    contexts.push(context);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    // No Playwright request interception: native fetch must enforce CORS.
    await page.goto(`${frontendOrigin}${config.pagesPath}/`);
    await idle(page);
    assert.equal(await page.evaluate(() => window.CareAI.enabled), true);
    assert.match(await send(page, 'Prepare my visit questions across origins'), /Mock Render guidance/);
    const preflight = calls.find(call => call.method === 'OPTIONS');
    assert.ok(preflight, 'A JSON POST across real origins must send a browser preflight');
    assert.equal(preflight.headers.origin, frontendOrigin);
    assert.equal(preflight.headers['access-control-request-method'], 'POST');
    assert.match(preflight.headers['access-control-request-headers'], /content-type/);
    const post = calls.find(call => call.method === 'POST');
    assert.equal(post.headers.origin, frontendOrigin);
    assert.equal(post.headers.cookie, undefined);
    stripCors = true;
    const fallback = await send(page, 'My head hurts again');
    assert.match(fallback, /headache/i);
    assert.doesNotMatch(fallback, /Mock Render guidance/,
      'Native browser fetch must reject a reply without cross-origin permission');
    assert.match(fallback, /local guidance|AI could not/i);
    await page.evaluate(() => window.CareAI.refresh());
    assert.equal(await page.evaluate(() => window.CareAI.available), false,
      'Native browser fetch must reject a status response without cross-origin permission');
    stripCors = false;
    await page.evaluate(() => window.CareAI.refresh());
    assert.equal(await page.evaluate(() => window.CareAI.enabled), true, 'Restoring CORS must allow a retry to recover');
  } finally {
    if (child && child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
    for (const server of [gateway, frontend]) {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
    await fs.rm(fixture, { recursive: true, force: true });
  }
}

async function run() {
  const providerInputs = [];
  const upstream = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    const payload = JSON.parse(body);
    const input = JSON.parse(payload.input[0].content[0].text);
    providerInputs.push(input);
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({
      status: 'completed',
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: JSON.stringify({ text: `Mock Render guidance: ${input.text}` }) }]
      }]
    }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  let app;
  let browser;
  const contexts = [];
  const errors = [];
  try {
    app = await startServer({
      OPENAI_API_KEY: 'test-only-pages-key',
      OPENAI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`
    });
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });

    async function visit(url, { savedOff = false, seedChecklist = false } = {}) {
      const context = await browser.newContext();
      contexts.push(context);
      await context.addInitScript(({ savedOff, seedChecklist }) => {
        if (savedOff) localStorage.setItem('care-ai-enabled', 'false');
        if (seedChecklist) localStorage.setItem('tasks', JSON.stringify([{ text: 'My saved Pages question', done: false }]));
      }, { savedOff, seedChecklist });
      // Cross-origin API calls must not need cookies.
      await context.addCookies([{ name: 'test-cookie', value: 'do-not-send', url: config.aiOrigin }]);
      const target = new URL(url);
      const prefix = target.pathname.endsWith('/') ? target.pathname : target.pathname.replace(/\/[^/]*$/, '/');
      const calls = [];
      await context.route('**/*', async route => {
        const request = route.request();
        const requested = new URL(request.url());
        if (requested.protocol === 'file:') return route.continue();
        const headers = await request.allHeaders();
        if (requested.pathname.startsWith('/api/ai')) {
          calls.push({ url: request.url(), method: request.method(), headers, body: request.postData() });
          if (requested.origin !== config.aiOrigin && requested.origin !== app.baseURL) {
            return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Static hosting has no AI endpoint.' });
          }
          const forwarded = {};
          for (const name of ['origin', 'content-type', 'sec-fetch-site', 'access-control-request-method', 'access-control-request-headers']) {
            if (headers[name]) forwarded[name] = headers[name];
          }
          const response = await fetch(`${app.baseURL}${requested.pathname}`, {
            method: request.method(),
            headers: forwarded,
            body: ['GET', 'HEAD', 'OPTIONS'].includes(request.method()) ? undefined : request.postData()
          });
          const responseHeaders = Object.fromEntries(response.headers);
          return route.fulfill({
            status: response.status,
            headers: responseHeaders,
            body: Buffer.from(await response.arrayBuffer())
          });
        }
        if (requested.origin !== target.origin) return route.abort('blockedbyclient');
        let file = requested.pathname.startsWith(prefix) ? requested.pathname.slice(prefix.length) : '';
        if (!file || file === 'index.html') file = 'index.html';
        if (!/^[a-z0-9-]+\.(?:html|js|css)$/.test(file)) {
          return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
        }
        try {
          return await route.fulfill({
            status: 200,
            contentType: assetTypes.get(path.extname(file)),
            body: await fs.readFile(path.join(root, file))
          });
        } catch {
          return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
        }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await idle(page);
      return { page, calls };
    }

    const pages = await visit(pagesURL, { seedChecklist: true });
    assert.equal(pages.page.url(), pagesURL, 'The site must stay at its GitHub Pages address');
    assert.equal(await pages.page.evaluate(() => window.CareAI.enabled), true);
    const startup = pages.calls.find(call => call.url.endsWith('/api/ai/status'));
    assert.equal(startup?.url, `${config.aiOrigin}/api/ai/status`);
    assert.equal(startup.headers.origin, config.pagesOrigin, 'The browser must send the real cross-origin source');
    assert.equal(startup.headers.cookie, undefined, 'Render cookies must not be sent with Pages API requests');
    assert.equal(await pages.page.evaluate(() => localStorage.getItem('tasks')),
      JSON.stringify([{ text: 'My saved Pages question', done: false }]));
    assert.match(await pages.page.locator('#checklist').textContent(), /My saved Pages question/);

    assert.match(await send(pages.page, 'Help me prepare for my appointment'), /Mock Render guidance/);
    const assistant = pages.calls.find(call => call.method === 'POST');
    assert.equal(assistant?.url, `${config.aiOrigin}/api/ai`);
    assert.equal(assistant.headers.origin, config.pagesOrigin);
    assert.equal(assistant.headers.cookie, undefined);
    assert.equal(JSON.parse(assistant.body).tool, 'assistant');
    assert.ok(providerInputs.some(input => input.text === 'Help me prepare for my appointment'));

    await pages.page.locator('[data-page="decoder"]').click();
    await pages.page.locator('#medical-text').fill('Explain hemoglobin and tachycardia.');
    await pages.page.locator('#decode').click();
    await pages.page.waitForFunction(() => document.querySelector('#decode-result').textContent.includes('Mock Render guidance'));
    assert.ok(pages.calls.some(call => call.method === 'POST' && JSON.parse(call.body).tool === 'decoder'),
      'Other AI tools must use the same cross-origin connection');
    assert.equal(pages.page.url(), pagesURL);
    assert.ok(pages.calls.every(call => new URL(call.url).origin === config.aiOrigin),
      'GitHub Pages must never receive the AI endpoint requests');

    const beforeOff = providerInputs.length;
    await pages.page.locator('#ai-enabled').uncheck();
    assert.match(await send(pages.page, 'My head hurts'), /headache/i);
    assert.equal(providerInputs.length, beforeOff, 'Opting out must keep questions local');

    const optedOut = await visit(pagesURL, { savedOff: true });
    assert.equal(await optedOut.page.evaluate(() => window.CareAI.available), true);
    assert.equal(await optedOut.page.evaluate(() => window.CareAI.enabled), false);
    const optedOutCount = providerInputs.length;
    assert.match(await send(optedOut.page, 'My head hurts'), /headache/i);
    assert.equal(providerInputs.length, optedOutCount);

    for (const url of [`${config.aiOrigin}/`, `${app.baseURL}/`]) {
      const ownSite = await visit(url);
      assert.equal(await ownSite.page.evaluate(() => window.CareAI.enabled), true);
      assert.equal(ownSite.calls[0].url, `${new URL(url).origin}/api/ai/status`,
        'Render and localhost must continue using their own API endpoints');
    }
    for (const url of [
      `${config.pagesOrigin}/OtherProject/`,
      'https://boiledeggisokay.github.io.evil.example/HackGwinnett6.0/'
    ]) {
      const unrelated = await visit(url);
      assert.equal(await unrelated.page.evaluate(() => window.CareAI.available), false);
      assert.ok(unrelated.calls.every(call => new URL(call.url).origin === new URL(url).origin),
        'Other repositories and lookalike hosts must not use the configured Render service');
    }
    const file = await visit(pathToFileURL(path.join(root, 'index.html')).href);
    assert.equal(await file.page.evaluate(() => window.CareAI.available), false);
    assert.equal(file.calls.length, 0, 'Local-file mode must not contact Render');
    await realCors(browser, `http://127.0.0.1:${upstream.address().port}/v1`, contexts, errors);
    assert.deepEqual(errors, []);
    console.log('GitHub Pages AI browser checks passed: cross-origin Render status/assistant/decoder, CORS enforcement and fallback, unchanged Pages address/checklist, saved opt-out, cookie-free requests, and local/Render/path/host/file isolation.');
  } finally {
    for (const context of contexts) await context.close();
    await browser?.close();
    await app?.close();
    await new Promise(resolve => upstream.close(resolve));
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
