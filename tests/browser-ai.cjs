// CARE_COMPASS_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser:ai
// Every AI response is intercepted locally; this test never calls a real provider.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.CARE_COMPASS_PLAYWRIGHT || 'playwright');
const { startServer } = require('./server-helper.cjs');

function mockSpeech() {
  class Recognition {
    start() { setTimeout(() => this.onstart?.(), 0); }
    abort() { setTimeout(() => this.onend?.(), 0); }
  }
  class Utterance { constructor(text) { this.text = text; } }
  Object.defineProperty(window, 'speechSynthesis', {
    value: { cancel() {}, getVoices: () => [], speak(utterance) {
      setTimeout(() => { utterance.onstart?.(); utterance.onend?.(); }, 0);
    } }, configurable: true
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  window.SpeechRecognition = Recognition;
}

async function run() {
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext();
    await context.addInitScript(mockSpeech);
    const calls = [];
    const injection = '<img src=x onerror="window.__aiInjected=true">';
    let failTool = '';
    let delayTool = '';
    let releaseResponse;
    let releaseStatus;
    const statusReady = new Promise(resolve => { releaseStatus = resolve; });
    await context.route('**/api/ai/status', async route => {
      await statusReady;
      return route.fulfill({
        status: 200, contentType: 'application/json', body: JSON.stringify({ available: true })
      });
    });
    await context.route('**/api/ai', async route => {
      const request = route.request().postDataJSON();
      calls.push(request);
      if (delayTool === request.tool) {
        delayTool = '';
        await new Promise(resolve => { releaseResponse = resolve; });
      }
      if (failTool === request.tool) {
        failTool = '';
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Mock AI is unavailable.' }) });
      }
      const result = request.tool === 'voice' ?
        { command: 'medical decoder', confidence: 0.98, relevant: true } :
        { text: request.tool === 'plan' ? `Ask about my follow-up appointment.\nReview this literal text: ${injection}` :
          `Mock ${request.tool} guidance. ${injection}` };
      try {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) });
      } catch { /* A toggle-off can abort the intercepted request. */ }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(server.baseURL);
    // Saving appearance while startup finishes must not create an AI opt-out.
    await page.locator('#accessibility').click();
    assert.equal(await page.locator('#settings-ai').isDisabled(), true);
    await page.locator('#large').check();
    releaseStatus();
    await page.waitForFunction(() => window.CareAI?.available);
    await page.locator('#save-access').click();
    assert.equal(await page.locator('#ai-enabled').isChecked(), true);
    assert.equal(await page.evaluate(() => localStorage.getItem('care-ai-enabled')), null);
    assert.equal(await page.evaluate(() => document.body.classList.contains('large-text')), true);
    assert.match(await page.locator('#ai-status').textContent(), /automatically/i);
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');

    // A configured server connects automatically; no extra AI switch is needed.
    await page.locator('[data-page="decoder"]').click();
    await page.locator('#medical-text').fill('Hemoglobin and tachycardia.');
    await page.locator('#decode').click();
    await page.waitForFunction(() => document.querySelector('#decode-result').textContent.includes('Mock decoder guidance'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tool, 'decoder');
    assert.match(await page.locator('#decode-result').textContent(), /<img src=x/);
    assert.equal(await page.locator('#decode-result img').count(), 0);

    // Explicitly turning AI off leaves all local tools usable.
    await page.locator('#ai-enabled').uncheck();
    await page.locator('#medical-text').fill('Hemoglobin and tachycardia. Local wording only.');
    await page.locator('#decode').click();
    await page.waitForFunction(() => document.querySelector('#decode-result').textContent.includes('hemoglobin') ||
      document.querySelector('#decode-result').textContent.includes('Hemoglobin'));
    assert.equal(calls.length, 1);
    await page.locator('#ai-enabled').check();

    await page.locator('[data-page="specialists"]').click();
    await page.locator('#specialist-ai').click();
    await page.waitForFunction(() => document.querySelector('#specialist-results').textContent.includes('Mock specialists guidance'));
    assert.equal(await page.locator('#specialist-results img').count(), 0);

    await page.locator('[data-page="plan"]').click();
    const countBefore = await page.locator('.task').count();
    await page.locator('#plan-build').click();
    await page.waitForFunction(() => document.querySelector('#plan-suggestions').textContent.includes('Ask about my follow-up'));
    assert.equal(await page.locator('.task').count(), countBefore, 'AI preview must not directly save tasks');
    assert.equal(await page.locator('#plan-suggestions img').count(), 0);
    await page.locator('#plan-apply').click();
    assert.equal(await page.locator('.task').count(), countBefore + 2);

    await page.locator('[data-page="assistant"]').click();
    await page.locator('#chat-input').fill('Help me prepare for a visit.');
    await page.locator('#chat-form').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#chat-messages').textContent.includes('Mock assistant guidance'));
    assert.equal(await page.locator('#chat-messages img').count(), 0);
    assert.equal(await page.evaluate(() => window.__aiInjected), undefined);

    // A phrase outside the local parser exercises the voice classifier.
    await page.locator('[data-page="dashboard"]').click();
    await page.locator('#voice').click();
    await page.evaluate(() => { void receiveVoiceTranscript('Open the section that explains medical notes.'); });
    await page.waitForFunction(() => document.querySelector('.page.active').id === 'decoder');
    assert.equal(await page.locator('.page.active').getAttribute('id'), 'decoder');
    const beforeNoise = calls.length;
    await page.evaluate(() => receiveVoiceTranscript('Let us build a Minecraft castle.'));
    assert.equal(calls.length, beforeNoise, 'Background discussion must not reach AI');
    await page.evaluate(() => { void receiveVoiceTranscript('cancel'); });
    const beforeVoiceQuestion = calls.length;
    await page.evaluate(() => { void receiveVoiceTranscript('What is POTS?'); });
    await page.waitForFunction(() => document.querySelector('#review-dialog').open);
    assert.equal(calls.length, beforeVoiceQuestion, 'A voice question must be verified before being sent to AI');
    await page.locator('#review-confirm').click();
    await page.waitForFunction(() => [...document.querySelectorAll('#chat-messages .bot')].at(-1)?.textContent.includes('Mock assistant guidance'));
    assert.equal(calls.at(-1).tool, 'assistant', 'A medical question must reach the care assistant');
    assert.deepEqual(new Set(calls.map(call => call.tool)), new Set(['decoder', 'specialists', 'plan', 'assistant', 'voice']));
    await page.locator('#voice').click();

    // A failed provider still yields usable local results.
    failTool = 'decoder';
    await page.locator('[data-page="decoder"]').click();
    await page.locator('#medical-text').fill('Hemoglobin and edema.');
    await page.locator('#decode').click();
    await page.waitForFunction(() => !document.querySelector('#decode').disabled);
    const fallback = await page.locator('#decode-result').textContent();
    assert.match(fallback, /hemoglobin/i);
    assert.doesNotMatch(fallback, /Mock decoder guidance/);

    // Turning AI off aborts a pending request and rejects its late output.
    delayTool = 'assistant';
    await page.locator('[data-page="assistant"]').click();
    await page.locator('#chat-clear').click();
    await page.locator('#chat-input').fill('Help me prepare for another visit.');
    await page.locator('#chat-form').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => document.querySelector('#chat-messages').textContent.includes('Preparing your guidance'));
    for (let attempt = 0; !releaseResponse && attempt < 100; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert.ok(releaseResponse, 'The pending assistant request must reach the local mock');
    await page.locator('#ai-enabled').uncheck();
    releaseResponse();
    await page.waitForFunction(() => !document.querySelector('#chat-messages').textContent.includes('Preparing your guidance'));
    assert.doesNotMatch(await page.locator('#chat-messages').textContent(), /Mock assistant guidance/);
    assert.match(await page.locator('#chat-messages').textContent(), /visit|symptom/i);
    const beforeDisabled = calls.length;
    await page.locator('#chat-input').fill('Explain hemoglobin.');
    await page.locator('#chat-form').evaluate(form => form.requestSubmit());
    await page.waitForFunction(() => !document.querySelector('#chat-messages').textContent.includes('Preparing your guidance'));
    assert.equal(calls.length, beforeDisabled);
    assert.deepEqual(errors, []);
    const beforeReload = calls.length;
    await page.reload();
    await page.waitForFunction(() => window.CareAI?.available);
    assert.equal(await page.locator('#ai-enabled').isChecked(), false, 'A saved off choice survives automatic connection on reload');
    assert.equal(calls.length, beforeReload);
    await context.close();
    console.log('AI browser checks passed: automatic connection, saved opt-out, all five tools, literal rendering, voice verification, preview review, background rejection, provider fallback, and toggle-off cancellation.');
  } finally {
    await browser?.close();
    await server.close();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
