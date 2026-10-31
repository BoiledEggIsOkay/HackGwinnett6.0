// CARE_COMPASS_PLAYWRIGHT=/path/to/node_modules/playwright node tests/browser-assistant.cjs
// AI requests are intercepted locally; this check never calls a paid provider.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.CARE_COMPASS_PLAYWRIGHT || 'playwright');
const { startServer } = require('./server-helper.cjs');

const oldFallback = 'I can help explain medical terms and conditions, find specialist resources, prepare visit questions, organize a medication review, or track symptoms.';

function mockSpeech() {
  class Recognition {
    start() { setTimeout(() => this.onstart?.(), 0); }
    abort() { setTimeout(() => this.onend?.(), 0); }
  }
  class Utterance { constructor(text) { this.text = text; } }
  Object.defineProperty(navigator, 'permissions', {
    value: { query: async () => ({ state: 'granted', addEventListener() {} }) }, configurable: true
  });
  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      cancel() {}, getVoices: () => [],
      speak(utterance) { setTimeout(() => { utterance.onstart?.(); utterance.onend?.(); }, 0); }
    }, configurable: true
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  window.SpeechRecognition = Recognition;
}

async function send(page, text, { wait = true } = {}) {
  const users = await page.locator('#chat-messages .user').count();
  await page.locator('#chat-input').fill(text);
  await page.locator('#chat-form button').click();
  if (!wait) return;
  await page.waitForFunction(count => document.querySelectorAll('#chat-messages .user').length === count + 1, users);
  await page.waitForFunction(() => {
    const reply = [...document.querySelectorAll('#chat-messages .bot')].at(-1);
    return reply && !/Preparing your guidance|Preparing your response/i.test(reply.textContent) && reply.querySelector('.tool-source');
  });
  return page.locator('#chat-messages .bot').last().textContent();
}

async function assertReply(page, text, expected) {
  const reply = await send(page, text);
  assert.match(reply, expected, `Typed prompt should receive guidance for: ${text}`);
  assert.ok(!reply.includes(oldFallback), `Typed prompt must not repeat the old capability paragraph: ${text}`);
  return reply;
}

async function run() {
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const localContext = await browser.newContext();
    await localContext.addInitScript(mockSpeech);
    const localPage = await localContext.newPage();
    const localErrors = [];
    localPage.on('pageerror', error => localErrors.push(error.message));
    await localPage.goto(server.baseURL);
    await localPage.locator('[data-page="assistant"]').click();
    await localPage.waitForFunction(() => /local/i.test(document.querySelector('#assistant-status')?.textContent || ''));

    await assertReply(localPage, 'I feel tired all the time', /fatigue|tired|energy|exhaust/i);
    await assertReply(localPage, 'My head hurts', /headache|head pain|head hurts/i);
    await assertReply(localPage, 'I get dizzy when I stand up', /dizz|standing|stand up|faint/i);
    await assertReply(localPage, 'I need help understanding my medicines', /medicine|medication|pharmacist|dose/i);
    await assertReply(localPage, 'Get ready for my checkup', /appointment|visit|checkup/i);
    await assertReply(localPage, 'Help paying for medical care', /financial|insurance|cost|payment|pay/i);
    await assertReply(localPage, 'What is POTS?', /POTS|heart rate|autonomic/i);
    await assertReply(localPage, 'Which specialist handles that?', /POTS|cardiology|neurology|autonomic/i);
    await assertReply(localPage, 'What should I ask my doctor?', /POTS|heart rate|autonomic/i);
    await assertReply(localPage, 'What is migraine?', /migraine/i);
    const migraineFollowup = await assertReply(localPage, 'Which specialist handles that?', /migraine|neurology|neurologist|headache/i);
    assert.doesNotMatch(migraineFollowup, /POTS|dysautonomia/i, 'A new condition must replace the prior follow-up topic');
    const unrelatedFollowup = await send(localPage, 'Tell me more about Minecraft');
    assert.match(unrelatedFollowup, /health|care navigation/i);
    assert.doesNotMatch(unrelatedFollowup, /migraine|POTS|dysautonomia/i, 'Unrelated discussion must not inherit a medical topic');
    const unknown = await send(localPage, 'My chart says frobnication');
    assert.ok(!unknown.includes(oldFallback));
    assert.match(unknown, /\?/, 'Unsupported wording should invite a useful clarification');
    assert.match(unknown, /word|term|condition|notes|rephrase|detail|recogniz|local|share/i);
    await assertReply(localPage, "I can't breathe and my chest hurts", /emergency|911|urgent/i);
    assert.deepEqual(localErrors, []);
    await localContext.close();

    const aiContext = await browser.newContext();
    await aiContext.addInitScript(mockSpeech);
    const calls = [];
    let releaseStatus;
    const statusGate = new Promise(resolve => { releaseStatus = resolve; });
    let failNext = false;
    let heldText = '';
    let releaseHeld;
    const injection = '<img src=x onerror="window.__assistantInjected=true">';
    await aiContext.route('**/api/ai/status', async route => {
      await statusGate;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) });
    });
    await aiContext.route('**/api/ai', async route => {
      const request = route.request().postDataJSON();
      calls.push(request);
      if (request.text === heldText) {
        heldText = '';
        await new Promise(resolve => { releaseHeld = resolve; });
      }
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Mock provider unavailable' }) });
      }
      try {
        await route.fulfill({
          status: 200, contentType: 'application/json',
          body: JSON.stringify({ text: `Connected answer to: ${request.text}. ${injection}` })
        });
      } catch { /* AI opt-out or clearing a conversation can abort a local mock request. */ }
    });
    const aiPage = await aiContext.newPage();
    const aiErrors = [];
    aiPage.on('pageerror', error => aiErrors.push(error.message));
    await aiPage.goto(server.baseURL);
    await aiPage.locator('[data-page="assistant"]').click();
    await send(aiPage, 'I feel tired all the time', { wait: false });
    await aiPage.waitForFunction(() => document.querySelectorAll('#chat-messages .user').length === 1);
    assert.equal(calls.length, 0, 'The first typed prompt must wait for connection status');
    await aiPage.locator('#chat-input').fill('What is POTS?');
    await aiPage.locator('#chat-form').evaluate(form => form.requestSubmit());
    assert.equal(await aiPage.locator('#chat-messages .user').count(), 1, 'A busy assistant must not submit another turn out of order');
    releaseStatus();
    await aiPage.waitForFunction(() => document.querySelector('#chat-messages').textContent.includes('Connected answer to: I feel tired'));
    assert.equal(calls.length, 1, 'Configured AI must handle the first prompt even if submitted before readiness');
    assert.equal(calls[0].tool, 'assistant');
    assert.equal(calls[0].text, 'I feel tired all the time');
    assert.equal(await aiPage.locator('#chat-input').inputValue(), 'What is POTS?', 'A reply must preserve text being drafted for the next turn');
    assert.equal(await aiPage.locator('#chat-messages img').count(), 0);
    assert.equal(await aiPage.evaluate(() => window.__assistantInjected), undefined);
    assert.match(await aiPage.locator('#assistant-status').textContent(), /AI/i);

    await assertReply(aiPage, 'What should I ask at my appointment?', /Connected answer/i);
    const prior = calls[1].context.messages;
    assert.ok(prior.some(message => message.role === 'user' && message.content === 'I feel tired all the time'));
    assert.ok(prior.some(message => message.role === 'assistant' && /Connected answer/.test(message.content)));

    const beforeEmergency = calls.length;
    await assertReply(aiPage, "I can’t breathe and my chest hurts", /emergency|911|urgent/i);
    assert.equal(calls.length, beforeEmergency, 'Urgent wording must not wait for an AI request');
    failNext = true;
    const failure = await assertReply(aiPage, 'My head hurts', /headache|head pain|head hurts/i);
    assert.match(failure, /local|could not|unavailable/i, 'Failed AI must label its useful local fallback');

    // Typed prompts still require verification when voice guidance is enabled.
    await aiPage.locator('#voice').click();
    const beforeCancel = calls.length;
    const beforeCancelUsers = await aiPage.locator('#chat-messages .user').count();
    await send(aiPage, 'Explain my medicines', { wait: false });
    await aiPage.locator('#review-dialog').waitFor({ state: 'visible' });
    await aiPage.locator('#review-cancel').click();
    assert.equal(calls.length, beforeCancel);
    assert.equal(await aiPage.locator('#chat-messages .user').count(), beforeCancelUsers);
    assert.equal(await aiPage.locator('#chat-input').inputValue(), 'Explain my medicines');
    await aiPage.locator('#voice').click();

    heldText = 'Help me pay for my care';
    releaseHeld = undefined;
    await send(aiPage, heldText, { wait: false });
    await aiPage.waitForFunction(() => document.querySelector('#chat-messages').textContent.includes('Preparing your guidance'));
    await aiPage.waitForFunction(() => window.CareAI?.enabled);
    for (let attempt = 0; !releaseHeld && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(releaseHeld, 'The held AI request must reach the local mock');
    await aiPage.locator('#ai-enabled').uncheck();
    releaseHeld();
    await aiPage.waitForFunction(() => !document.querySelector('#chat-messages').textContent.includes('Preparing your guidance'));
    const optedOutReply = await aiPage.locator('#chat-messages .bot').last().textContent();
    assert.doesNotMatch(optedOutReply, /Connected answer/);
    assert.match(optedOutReply, /financial|insurance|cost|payment|pay/i);
    const beforeDisabled = calls.length;
    await assertReply(aiPage, 'I get dizzy when standing', /dizz|standing|faint/i);
    assert.equal(calls.length, beforeDisabled, 'Opted-out prompts must stay local');

    await aiPage.locator('#ai-enabled').check();
    heldText = 'Help me get ready for a checkup';
    releaseHeld = undefined;
    await send(aiPage, heldText, { wait: false });
    for (let attempt = 0; !releaseHeld && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(releaseHeld);
    await aiPage.locator('#chat-clear').click();
    releaseHeld();
    await aiPage.waitForTimeout(100);
    assert.equal(await aiPage.locator('#chat-messages .user').count(), 0);
    assert.doesNotMatch(await aiPage.locator('#chat-messages').textContent(), /Connected answer|Preparing your guidance/);
    await assertReply(aiPage, 'Explain POTS', /Connected answer/i);
    assert.deepEqual(calls.at(-1).context.messages, [], 'Clear conversation must remove the earlier context');
    assert.deepEqual(aiErrors, []);
    await aiContext.close();
    console.log('Care assistant browser checks passed: typed natural prompts, follow-ups/topic changes, clear local mode, delayed AI startup, conversation context, emergency bypass, failed-provider fallback, safe rendering, review cancellation, opt-out, and stale response clearing.');
  } finally {
    await browser?.close();
    await server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
