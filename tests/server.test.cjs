const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./server-helper.cjs');

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.close(); });

test('serves the stylesheet and scripts with browser-readable MIME types', async () => {
  for (const [asset, type, expected] of [
    ['style.css', 'text/css', '.sidebar'],
    ['app.js', 'text/javascript', 'navigate'],
    ['voice-assistant.js', 'text/javascript', 'CareVoice'],
    ['voice-intents.js', 'text/javascript', 'CareIntents'],
    ['medical-tools.js', 'text/javascript', 'CareMedical'],
    ['care-assistant.js', 'text/javascript', 'CareAssistant'],
    ['care-tools.js', 'text/javascript', 'CareTools'],
    ['site-config.js', 'text/javascript', 'CareSite'],
    ['ai-client.js', 'text/javascript', 'CareAI'],
    ['settings.js', 'text/javascript', 'CareSettings'],
    ['policies.js', 'text/javascript', 'CarePolicies'],
    ['input-review.js', 'text/javascript', 'CareReview']
  ]) {
    const response = await fetch(`${server.baseURL}/${asset}?v=browser-test`);
    assert.equal(response.status, 200, asset);
    assert.ok(response.headers.get('content-type').startsWith(type), asset);
    assert.equal(response.headers.get('cache-control'), 'no-cache', asset);
    assert.ok((await response.text()).includes(expected), asset);
  }
});

test('both entry URLs reference the local stylesheet and voice engine', async () => {
  for (const pathname of ['/', '/index.html']) {
    const response = await fetch(`${server.baseURL}${pathname}`);
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('content-type').startsWith('text/html'));
    const html = await response.text();
    assert.match(html, /href="(?:\.\/)?style\.css(?:\?[^"]*)?"/);
    for (const file of ['site-config', 'voice-assistant', 'voice-intents', 'medical-tools', 'care-assistant', 'care-tools', 'ai-client', 'settings', 'policies', 'input-review', 'app']) {
      assert.match(html, new RegExp(`src="(?:\\./)?${file}\\.js(?:\\?[^"]*)?"`));
    }
    assert.doesNotMatch(html, /Jamie/);
  }
});

test('missing assets return 404 instead of an HTML page disguised as CSS', async () => {
  const response = await fetch(`${server.baseURL}/missing.css`);
  assert.equal(response.status, 404);
  assert.ok(!(response.headers.get('content-type') || '').startsWith('text/css'));
});

test('HEAD returns asset headers without a response body', async () => {
  const response = await fetch(`${server.baseURL}/style.css`, { method: 'HEAD' });
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-type').startsWith('text/css'));
  assert.equal(await response.text(), '');
});

test('rejects writes and does not expose repository or server files', async () => {
  const response = await fetch(`${server.baseURL}/`, { method: 'POST', body: 'ignored' });
  assert.equal(response.status, 405);
  assert.match(response.headers.get('allow'), /GET/);
  assert.match(response.headers.get('allow'), /HEAD/);
  for (const pathname of ['/server.js', '/.git/config', '/package.json', '/%2e%2e%2fserver.js']) {
    assert.equal((await fetch(`${server.baseURL}${pathname}`)).status, 404, pathname);
  }
});
