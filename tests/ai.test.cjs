const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { once } = require('node:events');
const { startServer } = require('./server-helper.cjs');
const { pagesOrigin } = require('../site-config.js');

let app;
let upstream;
let upstreamURL;
let providerResult = { text: 'Bring a written list of questions to your visit.' };
let providerStatus = 200;
let lastRequest;
let calls = 0;

before(async () => {
  upstream = http.createServer(async (request, response) => {
    calls++;
    let body = '';
    for await (const chunk of request) body += chunk;
    lastRequest = { path: request.url, authorization: request.headers.authorization, body: JSON.parse(body) };
    response.writeHead(providerStatus, { 'Content-Type': 'application/json' });
    if (providerStatus !== 200) return response.end(JSON.stringify({ error: { message: 'secret provider detail: test-only-key' } }));
    response.end(JSON.stringify({
      status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(providerResult) }] }]
    }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  upstreamURL = `http://127.0.0.1:${upstream.address().port}/v1`;
  app = await startServer({ OPENAI_API_KEY: 'test-only-key', OPENAI_BASE_URL: upstreamURL });
});
after(async () => {
  await app?.close();
  await new Promise(resolve => upstream.close(resolve));
});

async function post(body, headers = {}) {
  return fetch(`${app.baseURL}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

test('configured status reveals availability without a key or provider URL', async () => {
  const response = await fetch(`${app.baseURL}/api/ai/status`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { available: true });
  assert.equal((await fetch(`${app.baseURL}/.env.example`)).status, 404);
});

test('AI guidance uses Responses structured output without storing the response', async () => {
  providerResult = { text: 'Bring a written list of questions to your visit.' };
  const response = await post({ tool: 'plan', text: 'Help me get ready for an appointment.', context: { condition: 'POTS' } });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), providerResult);
  assert.equal(lastRequest.path, '/v1/responses');
  assert.equal(lastRequest.authorization, 'Bearer test-only-key');
  assert.equal(lastRequest.body.store, false);
  assert.equal(lastRequest.body.text.format.type, 'json_schema');
  assert.equal(lastRequest.body.text.format.strict, true);
  assert.deepEqual(lastRequest.body.text.format.schema.required, ['text']);
  assert.match(lastRequest.body.instructions, /Do not diagnose/);
  assert.deepEqual(JSON.parse(lastRequest.body.input[0].content[0].text), {
    text: 'Help me get ready for an appointment.', context: { condition: 'POTS' }
  });
});

test('GitHub Pages can read availability with an exact CORS origin and no secret exposure', async () => {
  const before = calls;
  for (const method of ['GET', 'HEAD']) {
    const response = await fetch(`${app.baseURL}/api/ai/status`, {
      method, headers: { Origin: pagesOrigin, 'Sec-Fetch-Site': 'cross-site' }
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.equal(response.headers.get('access-control-allow-credentials'), null);
    assert.doesNotMatch(JSON.stringify([...response.headers]), /test-only-key|Bearer|\/v1\/responses/);
    if (method === 'GET') assert.deepEqual(await response.json(), { available: true });
    else assert.equal(await response.text(), '');
  }
  assert.equal(calls, before, 'Checking availability does not call the provider');
  const asset = await fetch(`${app.baseURL}/site-config.js`, { headers: { Origin: pagesOrigin } });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('access-control-allow-origin'), null, 'CORS applies only to AI endpoints');
});

test('valid GitHub Pages preflights allow only each endpoint method and Content-Type', async () => {
  const before = calls;
  for (const [pathname, method] of [['/api/ai/status', 'GET'], ['/api/ai/status', 'HEAD'], ['/api/ai', 'POST']]) {
    const response = await fetch(`${app.baseURL}${pathname}`, {
      method: 'OPTIONS',
      headers: {
        Origin: pagesOrigin, 'Sec-Fetch-Site': 'cross-site',
        'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': 'content-type'
      }
    });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
    assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
    assert.equal(response.headers.get('vary'), 'Origin');
    const allowed = response.headers.get('access-control-allow-methods').split(', ');
    assert.ok(allowed.includes(method));
    assert.ok(allowed.includes('OPTIONS'));
    assert.ok(!allowed.includes(pathname.endsWith('/status') ? 'POST' : 'GET'));
    assert.equal(response.headers.get('access-control-allow-headers').toLowerCase(), 'content-type');
    assert.doesNotMatch(JSON.stringify([...response.headers]), /\*|test-only-key|Bearer/);
  }
  assert.equal(calls, before, 'Preflights do not submit prompts or use the provider');
});

test('GitHub Pages and same-origin callers can submit guidance requests', async () => {
  providerResult = { text: 'Bring a written list of questions to your visit.' };
  for (const headers of [
    { Origin: pagesOrigin, 'Sec-Fetch-Site': 'cross-site' },
    { Origin: app.baseURL, 'Sec-Fetch-Site': 'same-origin' }
  ]) {
    const before = calls;
    const response = await post({ tool: 'assistant', text: 'Help me prepare for my appointment.' }, headers);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), providerResult);
    assert.equal(response.headers.get('access-control-allow-origin'), headers.Origin);
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.equal(calls, before + 1);
  }
});

test('unknown or malformed origins and missing cross-site origins cannot read or call AI', async () => {
  const before = calls;
  for (const origin of [
    'https://unrelated.example',
    'https://boiledeggisokay.github.io.evil.example',
    `${pagesOrigin}/HackGwinnett6.0/`,
    `${pagesOrigin}/`,
    'http://boiledeggisokay.github.io',
    'null'
  ]) {
    for (const [pathname, method] of [['/api/ai/status', 'GET'], ['/api/ai', 'POST'], ['/api/ai', 'OPTIONS']]) {
      const response = await fetch(`${app.baseURL}${pathname}`, {
        method,
        headers: {
          Origin: origin, 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json',
          'Access-Control-Request-Method': 'POST'
        },
        ...(method === 'POST' ? { body: JSON.stringify({ tool: 'assistant', text: 'Help with my visit.' }) } : {})
      });
      assert.equal(response.status, 403, `${method} ${pathname} from ${origin}`);
      assert.equal(response.headers.get('access-control-allow-origin'), null);
      assert.equal(response.headers.get('vary'), 'Origin');
      assert.doesNotMatch(await response.text(), /test-only-key|secret provider/);
    }
  }
  for (const pathname of ['/api/ai/status', '/api/ai']) {
    const response = await fetch(`${app.baseURL}${pathname}`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
    assert.equal(response.status, 403, 'Cross-site requests must include an approved origin');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
  }
  assert.equal(calls, before);
});

test('unsupported preflight methods and headers never reach the provider', async () => {
  const before = calls;
  for (const [pathname, method, headers] of [
    ['/api/ai', 'DELETE', 'content-type'],
    ['/api/ai', 'GET', 'content-type'],
    ['/api/ai/status', 'POST', 'content-type'],
    ['/api/ai', 'POST', 'content-type, authorization'],
    ['/api/ai', 'POST', 'x-custom-header']
  ]) {
    const response = await fetch(`${app.baseURL}${pathname}`, {
      method: 'OPTIONS',
      headers: {
        Origin: pagesOrigin, 'Access-Control-Request-Method': method,
        'Access-Control-Request-Headers': headers
      }
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
    assert.equal(response.headers.get('access-control-allow-methods'), null);
    assert.equal(response.headers.get('access-control-allow-headers'), null);
  }
  const missingOrigin = await fetch(`${app.baseURL}/api/ai`, {
    method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST' }
  });
  assert.equal(missingOrigin.status, 403);
  assert.equal(missingOrigin.headers.get('access-control-allow-origin'), null);
  assert.equal(calls, before);
});

test('approved-origin validation and provider errors retain CORS with sanitized messages', async () => {
  for (const [request, expected] of [
    [post('{', { Origin: pagesOrigin }), 400],
    [post({ tool: 'assistant', text: 'Help.' }, { Origin: pagesOrigin, 'Content-Type': 'text/plain' }), 415],
    [fetch(`${app.baseURL}/api/ai`, { headers: { Origin: pagesOrigin } }), 405]
  ]) {
    const response = await request;
    assert.equal(response.status, expected);
    assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
    assert.equal(response.headers.get('vary'), 'Origin');
    assert.doesNotMatch(await response.text(), /test-only-key|secret provider/);
  }
  try {
    providerStatus = 401;
    const response = await post({ tool: 'assistant', text: 'Help me prepare.' }, { Origin: pagesOrigin });
    assert.equal(response.status, 502);
    assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
    assert.doesNotMatch(await response.text(), /test-only-key|secret provider/);
  } finally { providerStatus = 200; }
});

test('voice output is restricted to recognized website commands', async () => {
  providerResult = { command: 'medical decoder', confidence: 0.98, relevant: true };
  let response = await post({ tool: 'voice', text: 'Could you help me understand these clinical notes?' });
  assert.deepEqual(await response.json(), providerResult);
  assert.deepEqual(lastRequest.body.text.format.schema.required, ['command', 'confidence', 'relevant']);
  providerResult = { command: 'delete all data', confidence: 1, relevant: true };
  response = await post({ tool: 'voice', text: 'I was talking about Minecraft.' });
  assert.deepEqual(await response.json(), { command: '', confidence: 0, relevant: false });
  providerResult = { command: 'add a task Go shopping', confidence: 0.98, relevant: true };
  response = await post({ tool: 'voice', text: 'My appointment is next week.' });
  assert.deepEqual(await response.json(), { command: '', confidence: 0, relevant: false });
  providerResult = { command: 'prepare my checklist', confidence: 0.98, relevant: true };
  response = await post({ tool: 'voice', text: 'Make a checklist for my appointment.' });
  assert.deepEqual(await response.json(), providerResult);
  providerResult = { command: 'track my symptoms', confidence: 0.98, relevant: true };
  response = await post({ tool: 'voice', text: 'Open the symptom tracking form.' });
  assert.deepEqual(await response.json(), providerResult);
  providerResult = { command: 'download my care plan', confidence: 0.98, relevant: true };
  response = await post({ tool: 'voice', text: 'I want to see my care plan.' });
  assert.deepEqual(await response.json(), { command: '', confidence: 0, relevant: false });
  response = await post({ tool: 'voice', text: 'Export my care plan.' });
  assert.deepEqual(await response.json(), providerResult);
});

test('unapproved origins, invalid tools and large inputs never reach the provider', async () => {
  const before = calls;
  const cross = await post({ tool: 'assistant', text: 'Help with my visit.' }, { Origin: 'https://unrelated.example' });
  assert.equal(cross.status, 403);
  const invalid = await post({ tool: 'execute', text: 'Something' });
  assert.equal(invalid.status, 400);
  const tooLong = await post({ tool: 'decoder', text: 'a'.repeat(12001) });
  assert.equal(tooLong.status, 400);
  const oversized = await post({ tool: 'decoder', text: 'a'.repeat(50000) });
  assert.equal(oversized.status, 413);
  const malformed = await post('{');
  assert.equal(malformed.status, 400);
  const type = await post({ tool: 'assistant', text: 'Help me.' }, { 'Content-Type': 'text/plain' });
  assert.equal(type.status, 415);
  assert.equal(calls, before);
});

test('provider failures and invalid responses return a sanitized fallback message', async () => {
  providerStatus = 401;
  let response = await post({ tool: 'assistant', text: 'Help me prepare.' });
  assert.equal(response.status, 502);
  const error = await response.text();
  assert.doesNotMatch(error, /test-only-key|secret provider detail/);
  assert.match(error, /local tools/);
  providerStatus = 200;
  providerResult = { wrong: 'shape' };
  response = await post({ tool: 'decoder', text: 'An unfamiliar phrase.' });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /local tools/);
});

test('an unconfigured app keeps local tools available and never calls a provider', async () => {
  const local = await startServer();
  try {
    assert.deepEqual(await (await fetch(`${local.baseURL}/api/ai/status`)).json(), { available: false });
    const pagesStatus = await fetch(`${local.baseURL}/api/ai/status`, { headers: { Origin: pagesOrigin } });
    assert.deepEqual(await pagesStatus.json(), { available: false });
    assert.equal(pagesStatus.headers.get('access-control-allow-origin'), pagesOrigin);
    const response = await fetch(`${local.baseURL}/api/ai`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Origin: pagesOrigin },
      body: JSON.stringify({ tool: 'assistant', text: 'Help with my visit.' })
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get('access-control-allow-origin'), pagesOrigin);
    assert.match((await response.json()).error, /local care tools/);
  } finally { await local.close(); }
});

test('repeated requests are rate-limited before further provider calls', async () => {
  providerResult = { text: 'Bring your questions.' };
  const limited = await startServer({ OPENAI_API_KEY: 'test-only-key', OPENAI_BASE_URL: upstreamURL });
  try {
    const before = calls;
    for (let index = 0; index < 31; index++) {
      const response = await fetch(`${limited.baseURL}/api/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'assistant', text: 'Help me prepare.' })
      });
      assert.equal(response.status, index < 30 ? 200 : 429);
      if (index === 30) assert.equal(response.headers.get('retry-after'), '60');
      await response.text();
    }
    assert.equal(calls - before, 30);
  } finally { await limited.close(); }
});
