const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function client({ available = true, saved, blockedStorage = false } = {}) {
  const calls = [];
  const checkbox = {};
  const status = {};
  const values = new Map(saved === undefined ? [] : [['care-ai-enabled', String(saved)]]);
  const window = {
    document: { querySelector: selector => selector === '#ai-enabled' ? checkbox : status },
    localStorage: {
      getItem(key) { if (blockedStorage) throw new Error('Storage unavailable'); return values.get(key); },
      setItem(key, value) { if (blockedStorage) throw new Error('Storage unavailable'); values.set(key, value); }
    },
    fetch: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        json: async () => url.endsWith('/status') ? { available } : { text: 'Bring your questions.' }
      };
    },
    setTimeout, clearTimeout,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    dispatchEvent() {}
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../ai-client.js'), 'utf8'), { window, AbortController });
  return { ai: window.CareAI, window, calls, checkbox, status, values };
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

test('unconfigured AI stays disabled even with a previously saved preference', async () => {
  const c = client({ available: false, saved: true });
  await c.ai.ready;
  assert.equal(c.ai.enabled, false);
  assert.equal(c.checkbox.disabled, true);
  assert.equal(c.checkbox.checked, false);
  assert.match(c.status.textContent, /local tools/);
  assert.equal(c.ai.setEnabled(true), false);
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
