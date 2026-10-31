// Optional browser checks:
// CARE_COMPASS_PLAYWRIGHT=/path/to/node_modules/playwright node tests/browser-smoke.cjs
// Install Playwright and its Chromium browser separately; the app has no dependencies.
const assert = require('node:assert/strict');
const { startServer } = require('./server-helper.cjs');
const { chromium } = require(process.env.CARE_COMPASS_PLAYWRIGHT || 'playwright');

function mockBrowserSpeech() {
  const instances = [];
  const spoken = [];
  let speech = null;
  let speechTimer = null;
  let cancels = 0;
  class Recognition {
    constructor() {
      this.results = [];
      this.index = 0;
      instances.push(this);
    }
    start() { setTimeout(() => this.onstart?.(), 0); }
    abort() { setTimeout(() => this.onend?.(), 0); }
  }
  class Utterance {
    constructor(text) { this.text = text; }
  }
  const synthesis = {
    speaking: false,
    getVoices: () => [{ name: 'Mock voice', lang: 'en-US', localService: true }],
    addEventListener() {},
    cancel() {
      cancels++;
      clearTimeout(speechTimer);
      const previous = speech;
      speech = null;
      this.speaking = false;
      setTimeout(() => previous?.onend?.(), 0);
    },
    speak(utterance) {
      speech = utterance;
      spoken.push(utterance.text);
      this.speaking = true;
      setTimeout(() => utterance.onstart?.(), 0);
      speechTimer = setTimeout(() => {
        if (speech !== utterance) return;
        speech = null;
        this.speaking = false;
        utterance.onend?.();
      }, window.__speechDuration || 25);
    }
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synthesis, configurable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true });
  Object.defineProperty(navigator, 'userActivation', {
    value: { hasBeenActive: true, isActive: true }, configurable: true
  });
  window.SpeechRecognition = window.webkitSpeechRecognition = Recognition;
  window.__mockVoice = {
    instances, spoken,
    get cancels() { return cancels; },
    emit(text, final = true) {
      const recognition = instances.at(-1);
      const result = [{ transcript: text, confidence: 1 }];
      result.isFinal = final;
      recognition.results[recognition.index] = result;
      recognition.onresult?.({ resultIndex: recognition.index, results: recognition.results });
      if (final) recognition.index++;
    }
  };
}

async function speak(page, text, final = true) {
  await page.evaluate(({ text, final }) => window.__mockVoice.emit(text, final), { text, final });
}

async function run() {
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext();
    await context.addInitScript(mockBrowserSpeech);
    const page = await context.newPage();
    const pageErrors = [];
    const failedAssets = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (/\.(?:css|js)(?:\?|$)/.test(response.url()) && !response.ok()) {
        failedAssets.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(server.baseURL);
    await page.waitForFunction(() => window.__mockVoice.instances.length > 0);
    const presentation = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      sidebar: getComputedStyle(document.querySelector('.sidebar')).position,
      sheets: document.styleSheets.length,
      text: document.body.textContent
    }));
    assert.equal(presentation.background, 'rgb(250, 251, 248)');
    assert.equal(presentation.sidebar, 'fixed');
    assert.ok(presentation.sheets > 0);
    assert.match(presentation.text, /Guest User/);
    assert.doesNotMatch(presentation.text, /Jamie/);
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'true');

    for (const pageName of ['decoder', 'specialists', 'plan', 'assistant', 'dashboard']) {
      await page.locator(`[data-page="${pageName}"]`).click();
      assert.equal(await page.locator('.page.active').getAttribute('id'), pageName);
    }
    await page.locator('[data-page="decoder"]').click();
    await page.locator('#medical-text').fill('Tachycardia and orthostatic intolerance.');
    await page.locator('#decode').click();
    assert.match(await page.locator('#decode-result').textContent(), /faster-than-usual heart rate/i);
    await page.locator('[data-page="plan"]').click();
    await page.locator('#task-text').fill('Bring the symptom diary');
    await page.locator('#add-task').evaluate(form => form.requestSubmit());
    assert.match(await page.locator('#checklist').textContent(), /Bring the symptom diary/);

    await speak(page, 'medical decoder');
    assert.match(await page.locator('#voice-hint').textContent(), /what medical notes/i);
    await speak(page, 'tachycardia and hemoglobin');
    assert.match(await page.locator('#decode-result').textContent(), /red blood cells/i);
    await speak(page, 'find a specialist');
    await speak(page, 'POTS');
    assert.equal(await page.locator('#specialty').inputValue(), 'POTS / dysautonomia');
    assert.match(await page.locator('#specialist-results').textContent(), /Dysautonomia International/);
    await speak(page, 'find a specialist');
    await speak(page, 'Ehlers Danlos syndrome');
    assert.equal(await page.locator('#specialty').inputValue(), 'Ehlers-Danlos syndrome');
    await speak(page, 'add a task');
    await speak(page, 'Bring a written symptom timeline');
    assert.match(await page.locator('#checklist').textContent(), /Bring a written symptom timeline/);
    await speak(page, 'complete item one');
    assert.equal(await page.locator('.task input[type="checkbox"]').first().isChecked(), true);
    await speak(page, 'my care plan');
    await speak(page, 'read my checklist');
    assert.match(await page.evaluate(() => window.__mockVoice.spoken.at(-1)), /Item 1\./);
    await speak(page, 'complete item');
    await speak(page, 'read my checklist');
    assert.match(await page.evaluate(() => window.__mockVoice.spoken.at(-1)), /Item 1\./);
    await speak(page, 'two');
    assert.equal(await page.locator('.task input[type="checkbox"]').nth(1).isChecked(), true);
    await speak(page, 'edit profile');
    await speak(page, 'Long COVID');
    await speak(page, 'save profile');
    assert.match(await page.locator('#condition-chips').textContent(), /Long COVID/);
    await speak(page, 'edit profile');
    await speak(page, 'remove POTS');
    await speak(page, 'save profile');
    assert.doesNotMatch(await page.locator('#condition-chips').textContent(), /POTS/);
    await speak(page, 'accessibility settings');
    await speak(page, 'larger text on');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('large-text')), true);
    await speak(page, 'larger text off');
    await speak(page, 'save preferences');
    await speak(page, 'edit profile');
    await speak(page, 'medical decoder');
    await speak(page, 'orthostatic intolerance and edema');
    assert.match(await page.locator('#decode-result').textContent(), /Swelling caused by fluid/i);
    await speak(page, 'care assistant');
    await speak(page, 'What is POTS?');
    assert.match(await page.locator('#chat-messages').textContent(), /postural orthostatic tachycardia syndrome/i);

    await speak(page, 'open medical decoder');
    assert.equal(await page.locator('.page.active').getAttribute('id'), 'decoder');
    await speak(page, 'go to overview');
    assert.equal(await page.locator('.page.active').getAttribute('id'), 'dashboard');
    await speak(page, 'turn off voice assistant');
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');
    await page.locator('#voice').click();
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'true');
    await speak(page, 'help with voice commands');
    assert.equal(await page.locator('#settings-dialog').evaluate(dialog => dialog.open), true);
    await speak(page, 'close dialog');
    assert.equal(await page.locator('#settings-dialog').evaluate(dialog => dialog.open), false);
    await speak(page, 'go to overview');
    assert.equal(await page.locator('.page.active').getAttribute('id'), 'dashboard');
    await speak(page, 'my care plan');
    assert.equal(await page.locator('.page.active').getAttribute('id'), 'plan');

    // Keep one spoken response in flight to verify the on-screen interruption
    // fallback as well as recognition-based interruption.
    await page.evaluate(() => { window.__speechDuration = 100000; });
    await speak(page, 'what is POTS');
    await page.waitForFunction(() => window.speechSynthesis.speaking);
    const cancels = await page.evaluate(() => window.__mockVoice.cancels);
    await speak(page, 'open medical decoder', false);
    assert.ok(await page.evaluate(() => window.__mockVoice.cancels) > cancels);
    await speak(page, 'open medical decoder');
    assert.equal(await page.locator('.page.active').getAttribute('id'), 'decoder');
    await page.locator('#voice-interrupt').click();
    assert.equal(await page.evaluate(() => window.speechSynthesis.speaking), false);
    await page.evaluate(() => { window.__speechDuration = 25; });

    for (const width of [1440, 1024, 800, 650, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const pageName of ['dashboard', 'decoder', 'specialists', 'plan', 'assistant']) {
        await page.locator(`[data-page="${pageName}"]`).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${pageName} overflows by ${overflow}px at ${width}px`);
      }
      assert.equal(await page.locator('#accessibility').isVisible(), true);
      assert.equal(await page.locator('#profile').isVisible(), true);
    }
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedAssets, []);
    await context.close();

    const deniedContext = await browser.newContext();
    await deniedContext.addInitScript(mockBrowserSpeech);
    await deniedContext.addInitScript(() => {
      window.SpeechRecognition.prototype.start = function () {
        setTimeout(() => {
          this.onerror?.({ error: 'not-allowed' });
          this.onend?.();
        }, 0);
      };
    });
    const deniedPage = await deniedContext.newPage();
    const deniedErrors = [];
    deniedPage.on('pageerror', error => deniedErrors.push(error.message));
    await deniedPage.goto(server.baseURL);
    await deniedPage.waitForFunction(() => document.querySelector('#voice').dataset.state === 'permission');
    assert.match(await deniedPage.locator('.voice-panel').textContent(), /microphone|permission/i);
    assert.deepEqual(deniedErrors, []);
    await deniedContext.close();

    const storageContext = await browser.newContext();
    await storageContext.addInitScript(mockBrowserSpeech);
    await storageContext.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Storage blocked', 'SecurityError'); };
    });
    const storagePage = await storageContext.newPage();
    const storageErrors = [];
    storagePage.on('pageerror', error => storageErrors.push(error.message));
    await storagePage.goto(server.baseURL);
    await storagePage.locator('[data-page="plan"]').click();
    await storagePage.locator('#task-text').fill('Still works without storage');
    await storagePage.locator('#add-task').evaluate(form => form.requestSubmit());
    assert.match(await storagePage.locator('#checklist').textContent(), /Still works without storage/);
    assert.deepEqual(storageErrors, []);
    await storageContext.close();
    console.log('Chromium smoke passed: stylesheet, all pages, forms, default voice, off/on, interruption, and responsive layouts.');
  } finally {
    await browser?.close();
    await server.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
