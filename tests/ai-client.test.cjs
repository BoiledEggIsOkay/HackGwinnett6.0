const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client({ available = true, saved, blockedStorage = false, protocol = 'http:', statusResponse } = {}) {
  const calls = [];
  const events = [];
  const checkbox = {};
  const status = {};
  const retry = {};
  const help = {};
  const guidance = {};
  const elements = new Map([
    ['#ai-enabled', checkbox], ['#ai-status', status], ['#ai-retry', retry],
    ['#ai-connection-help', help], ['#ai-connection-guidance', guidance]
  ]);
  const values = new Map(saved === undefined ? [] : [['care-ai-enabled', String(saved)]]);
  const window = {
    document: { querySelector: selector => elements.get(selector) || null },
    location: { protocol },
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage unavailable'); return values.get(key); },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage unavailable'); values.set(key, value); }
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/status') && statusResponse) return statusResponse(url, options);
      return {
        ok: true,
        json: async () => url.endsWith('/status') ? { available } : { text: 'Bring your questions.' }
      };
    },
    setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent(event) { events.push(event); }
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ai-client.js'), 'utf8'), { window, AbortController });
  return { ai: window.CareAI, window, calls, checkbox, status, retry, help, guidance, values, events, elements };
}

test('a configured server enables AI automatically without a saved preference', async () => {
  const c = client();
  await c.ai.ready;
  assert.equal(c.ai.available, true);
  assert.equal(c.ai.enabled, true);
  assert.equal(c.checkbox.checked, true);
  assert.match(c.status.textContent, /automatically/);
  assert.equal(c.values.has('care-ai-enabled'), false);
  assert.match(c.status.textContent, /sent to OpenAI/);
  assert.equal(c.calls.length, 1, 'Automatic connection checks availability without submitting any input');
  const result = await c.ai.request('assistant', { text: 'Help me prepare.' });
  assert.equal(result.text, 'Bring your questions.');
  assert.equal(c.calls[1].url, '/api/ai');
  assert.deepEqual(JSON.parse(c.calls[1].options.body), { tool: 'assistant', text: 'Help me prepare.', context: {} });
  c.ai.setEnabled(false);
  await assert.rejects(c.ai.request('assistant', { text: 'More help.' }), /AI is off/);
  assert.equal(c.calls.length, 2);
});

test('a saved off choice prevents automatic requests until explicitly enabled', async () => {
  const c = client({ saved: false });
  await c.ai.ready;
  assert.equal(c.ai.available, true);
  assert.equal(c.ai.enabled, false);
  assert.equal(c.checkbox.checked, false);
  assert.match(c.status.textContent, /off by your choice/);
  await assert.rejects(c.ai.request('assistant', { text: 'Help me prepare.' }), /AI is off/);
  assert.equal(c.calls.length, 1);
  c.ai.setEnabled(true);
  assert.equal(c.values.get('care-ai-enabled'), 'true');
  assert.equal((await c.ai.request('assistant', { text: 'Help me prepare.' })).text, 'Bring your questions.');
});

test('unconfigured AI stays local and offers an interactive connection check', async () => {
  const c = client({ available: false, saved: true });
  await c.ai.ready;
  assert.equal(c.ai.enabled, false);
  assert.equal(c.checkbox.disabled, false);
  assert.equal(c.checkbox.checked, false);
  assert.match(c.status.textContent, /local tools/i);
  assert.match(c.status.textContent, /API key/i);
  assert.equal(c.retry.hidden, false);
  assert.equal(c.help.hidden, false);
  assert.equal(c.ai.setEnabled(true), false);
  assert.equal(c.values.get('care-ai-enabled'), 'true', 'Unavailable AI is not a new opt-out choice');
  await assert.rejects(c.ai.request('decoder', { text: 'Notes' }), /AI is off/);
  assert.equal(c.calls.length, 1);
});

test('blocked storage still allows automatic AI and a per-visit off choice', async () => {
  const c = client({ blockedStorage: true });
  await c.ai.ready;
  assert.equal(c.ai.enabled, true);
  c.ai.setEnabled(false);
  assert.equal(c.ai.enabled, false);
  await assert.rejects(c.ai.request('plan', { text: 'Prepare for my visit.' }), /AI is off/);
  c.ai.setEnabled(true);
  assert.equal(c.ai.enabled, true);
  assert.equal((await c.ai.request('plan', { text: 'Prepare for my visit.' })).text, 'Bring your questions.');
});

test('provider errors are surfaced for local fallback and malformed output is rejected', async () => {
  const c = client({ saved: true });
  await c.ai.ready;
  c.window.fetch = async () => ({ ok: false, json: async () => ({ error: 'AI could not respond.' }) });
  await assert.rejects(c.ai.request('assistant', { text: 'Questions' }), /AI could not respond/);
  c.window.fetch = async () => ({ ok: true, json: async () => ({ wrong: 'shape' }) });
  await assert.rejects(c.ai.request('voice', { text: 'Open my notes' }), /understand that command/);
  await assert.rejects(c.ai.request('decoder', { text: 'Notes' }), /incomplete answer/);
});

test('turning AI off aborts active requests and rejects a late response after re-enabling', async () => {
  const c = client({ saved: true });
  await c.ai.ready;
  let resolve;
  let signal;
  c.window.fetch = (_url, options) => {
    signal = options.signal;
    return new Promise(done => { resolve = done; });
  };
  const pending = c.ai.request('assistant', { text: 'Help me prepare.' });
  await new Promise(done => setImmediate(done));
  assert.equal(signal.aborted, false);
  c.ai.setEnabled(false);
  assert.equal(signal.aborted, true);
  c.ai.setEnabled(true);
  resolve({ ok: true, json: async () => ({ text: 'A late AI reply.' }) });
  await assert.rejects(pending, /turned off/);
});

test('rechecking recovers a transient startup failure and deduplicates overlapping checks', async () => {
  const c = client({ statusResponse: async () => { throw new Error('Server starting'); } });
  await c.ai.ready;
  assert.equal(c.ai.available, false);
  assert.equal(c.ai.checking, false);
  assert.equal(c.checkbox.disabled, false);
  assert.match(c.status.textContent, /could not be reached/i);
  let resolve;
  c.window.fetch = (url, options) => {
    c.calls.push({ url, options });
    return new Promise(done => { resolve = done; });
  };
  const first = c.ai.refresh();
  const second = c.ai.refresh();
  assert.equal(first, second, 'Overlapping checks share one request');
  assert.equal(c.ai.checking, true);
  assert.equal(c.checkbox.disabled, true);
  await new Promise(done => setImmediate(done));
  assert.equal(c.calls.length, 2);
  assert.equal(c.calls[1].options.cache, 'no-store');
  resolve({ ok: true, json: async () => ({ available: true }) });
  assert.equal(await first, true);
  assert.equal(c.ai.available, true);
  assert.equal(c.ai.enabled, true);
  assert.equal(c.ai.checking, false);
  assert.equal(c.checkbox.disabled, false);
  assert.equal(c.retry.hidden, true);
  assert.equal(c.help.hidden, true);
  assert.ok(c.events.some(event => event.type === 'care-ai-change' && event.detail.available && !event.detail.checking),
    'Other care tools receive the recovered connection state');
});

test('a plain recheck preserves saved opt-out while an explicit connection attempt enables AI', async () => {
  let available = false;
  const c = client({
    saved: false,
    statusResponse: async () => ({ ok: true, json: async () => ({ available }) })
  });
  await c.ai.ready;
  available = true;
  assert.equal(await c.ai.refresh(), true);
  assert.equal(c.ai.available, true);
  assert.equal(c.ai.enabled, false);
  assert.equal(c.values.get('care-ai-enabled'), 'false');
  assert.equal(await c.ai.connect(), true);
  assert.equal(c.ai.enabled, true);
  assert.equal(c.values.get('care-ai-enabled'), 'true');
  assert.equal(c.checkbox.checked, true);
});

test('failed connection attempts open help without overwriting a saved preference', async () => {
  for (const saved of [undefined, false, true]) {
    const c = client({ available: false, saved });
    await c.ai.ready;
    const before = [...c.values];
    assert.equal(await c.ai.connect(), false);
    assert.deepEqual([...c.values], before);
    assert.equal(c.ai.enabled, false);
    assert.equal(c.checkbox.checked, false);
    assert.equal(c.checkbox.disabled, false);
    assert.equal(c.help.hidden, false);
    assert.equal(c.help.open, true);
    assert.match(c.guidance.textContent, /site owner.*API key|site owner.*add one/i);
  }
});

test('clicking the unavailable checkbox actually checks again and explains failure', async () => {
  const c = client({ available: false });
  await c.ai.ready;
  c.checkbox.checked = true;
  c.checkbox.onchange();
  assert.equal(c.checkbox.checked, false);
  assert.equal(c.ai.checking, true);
  await c.ai.refresh();
  await new Promise(done => setImmediate(done));
  assert.equal(c.calls.length, 2);
  assert.equal(c.help.open, true);
  assert.equal(c.checkbox.disabled, false);
  assert.equal(c.values.has('care-ai-enabled'), false);
});

test('local-file mode avoids status requests and explains how to use the project server', async () => {
  const c = client({ protocol: 'file:' });
  await c.ai.ready;
  assert.equal(c.calls.length, 0);
  assert.equal(c.ai.available, false);
  assert.equal(c.checkbox.disabled, false);
  assert.match(c.status.textContent, /localhost.*file/i);
  assert.equal(await c.ai.connect(), false);
  assert.equal(c.calls.length, 0);
  assert.equal(c.help.open, true);
  assert.match(c.guidance.textContent, /index\.html.*project server/i);
});

test('static previews and malformed status routes get different guidance from network failures', async () => {
  for (const [statusResponse, expected] of [
    [async () => ({ ok: false, status: 404 }), /preview.*Care Compass server/i],
    [async () => ({ ok: false, status: 405 }), /preview.*Care Compass server/i],
    [async () => ({ ok: true, json: async () => { throw new Error('HTML instead of JSON'); } }), /preview.*Care Compass server/i],
    [async () => ({ ok: true, json: async () => ({ somethingElse: true }) }), /preview.*Care Compass server/i],
    [async () => ({ ok: false, status: 503 }), /could not be reached.*retry/i],
    [async () => { throw new Error('Offline'); }, /could not be reached.*retry/i]
  ]) {
    const c = client({ statusResponse });
    await c.ai.ready;
    assert.equal(c.ai.available, false);
    assert.equal(c.ai.enabled, false);
    assert.equal(c.checkbox.disabled, false);
    assert.match(c.status.textContent, expected);
  }
});

test('a newer off choice overrides a pending connection attempt, including an already saved off choice', async () => {
  for (const saved of [true, false]) {
    const c = client({ available: false, saved });
    await c.ai.ready;
    let resolve;
    c.window.fetch = () => new Promise(done => { resolve = done; });
    const pending = c.ai.connect();
    await new Promise(done => setImmediate(done));
    assert.equal(c.ai.checking, true);
    c.ai.setEnabled(false);
    resolve({ ok: true, json: async () => ({ available: true }) });
    assert.equal(await pending, false);
    assert.equal(c.ai.available, true);
    assert.equal(c.ai.enabled, false);
    assert.equal(c.checkbox.checked, false);
    assert.equal(c.values.get('care-ai-enabled'), 'false');
    await assert.rejects(c.ai.request('assistant', { text: 'Do not send this.' }), /AI is off/);
  }
});

test('rechecking updates settings while preserving a staged choice after connection', async () => {
  const c = client({ available: true });
  await c.ai.ready;
  const settings = { checked: false, dataset: { aiEdited: 'true' } };
  const settingsStatus = {};
  c.elements.set('#settings-ai', settings);
  c.elements.set('#settings-ai-status', settingsStatus);
  await c.ai.refresh();
  assert.equal(settings.disabled, false);
  assert.equal(settings.checked, false, 'An edited settings preference is preserved until saving');
  assert.match(settingsStatus.textContent, /sent to OpenAI/);
  settings.dataset.aiEdited = 'false';
  c.ai.render();
  assert.equal(settings.checked, true, 'An untouched settings control mirrors the connection');
});
