// Optional Chromium checks: install Playwright separately, then set
// CARE_COMPASS_PLAYWRIGHT=/path/to/node_modules/playwright npm run test:browser
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { startServer } = require('./server-helper.cjs');
const { chromium } = require(process.env.CARE_COMPASS_PLAYWRIGHT || 'playwright');

function mockBrowserSpeech() {
  const instances = [];
  const spoken = [];
  let speech = null;
  let speechTimer = null;
  let cancels = 0;
  let starts = 0;
  let permissionQueries = 0;
  const utterances = [];
  const permission = { state: 'granted', addEventListener() {}, removeEventListener() {} };
  Object.defineProperty(navigator, 'permissions', {
    value: { query: async () => { permissionQueries++; return permission; } }, configurable: true
  });
  class Recognition {
    constructor() {
      this.results = [];
      this.index = 0;
      this.active = false;
      instances.push(this);
    }
    start() {
      if (this.active) throw new DOMException('Already listening', 'InvalidStateError');
      // Native results belong to a recognition session, even when the same
      // SpeechRecognition object is reused after a spoken reply or toggle.
      this.results = [];
      this.index = 0;
      this.active = true;
      starts++;
      setTimeout(() => { if (this.active) this.onstart?.(); }, 0);
    }
    abort() { this.active = false; setTimeout(() => this.onend?.(), 0); }
  }
  class Utterance { constructor(text) { this.text = text; } }
  const synthesis = {
    speaking: false,
    getVoices: () => [
      { name: 'Mock voice', voiceURI: 'mock-default', lang: 'en-US', localService: true },
      { name: 'Mock alternative', voiceURI: 'mock-alternative', lang: 'en-GB', localService: true }
    ],
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
      utterances.push({ text: utterance.text, voiceURI: utterance.voice?.voiceURI, rate: utterance.rate });
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
    instances, spoken, utterances, permission,
    get active() { return Boolean(instances.at(-1)?.active); },
    get cancels() { return cancels; },
    get starts() { return starts; },
    get permissionQueries() { return permissionQueries; },
    emit(text, { final = true, confidence = 1 } = {}) {
      const recognition = instances.at(-1);
      if (!recognition) return;
      const result = [{ transcript: text, confidence }];
      result.isFinal = final;
      recognition.results[recognition.index] = result;
      recognition.onresult?.({ resultIndex: recognition.index, results: recognition.results });
      if (final) recognition.index++;
    }
  };
}

async function waitListening(page) {
  await page.waitForFunction(() => window.__mockVoice.active && !window.speechSynthesis.speaking);
}
async function speak(page, text, options = {}) {
  await waitListening(page);
  await page.evaluate(({ text, options }) => window.__mockVoice.emit(text, options), { text, options });
}
async function decodeReady(page) {
  await page.waitForFunction(() => !document.querySelector('#decode').disabled && document.querySelector('#decode-result').textContent.trim());
}
async function selectedCondition(page) {
  return page.locator('#specialty').evaluate(select => select.selectedOptions[0]?.textContent || '');
}
async function activePage(page) { return page.locator('.page.active').getAttribute('id'); }
async function reviewReady(page, expected) {
  await page.locator('#review-dialog').waitFor({ state: 'visible' });
  if (expected) assert.match(await page.locator('#review-summary').textContent(), expected);
}
async function confirmReview(page, command = 'confirm') {
  await reviewReady(page);
  await speak(page, command);
  await page.locator('#review-dialog').waitFor({ state: 'hidden' });
}
async function storedTaskCount(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('tasks') || '[]').length);
}

async function run() {
  const server = await startServer();
  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(mockBrowserSpeech);
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    const pageErrors = [];
    const failedAssets = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (/\.(?:css|js)(?:\?|$)/.test(response.url()) && !response.ok()) failedAssets.push(`${response.status()} ${response.url()}`);
    });
    await page.goto(server.baseURL);
    await page.waitForFunction(() => document.querySelector('#ai-enabled').disabled);
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
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.__mockVoice.instances.length), 0, 'First visit must not access microphone');
    assert.equal(await page.evaluate(() => window.__mockVoice.spoken.length), 0, 'First visit must be quiet');
    assert.match(await page.locator('#ai-status').textContent(), /local tools|not connected/i);
    assert.equal(await page.locator('#ai-enabled').isDisabled(), true);

    for (const name of ['decoder', 'specialists', 'plan', 'assistant', 'dashboard']) {
      await page.locator(`[data-page="${name}"]`).click();
      assert.equal(await activePage(page), name);
    }
    assert.equal(await page.evaluate(() => window.__mockVoice.spoken.length), 0, 'Navigation without voice must remain quiet');

    // Decoder handles abbreviations and unfamiliar notes, and exposes a keyboard
    // file chooser without displaying the browser's raw input control.
    await page.locator('[data-page="decoder"]').click();
    await page.locator('#medical-text').fill('CBC showed low Hgb. Patient reports tachycardia and orthostatic intolerance.');
    await page.locator('#decode').click();
    await decodeReady(page);
    assert.match(await page.locator('#decode-result').textContent(), /hemoglobin|red blood cells/i);
    assert.match(await page.locator('#decode-result').textContent(), /heart rate/i);
    await page.locator('#medical-text').fill('Unfamiliar phrase zyxquux appears in a note.');
    await page.locator('#decode').click();
    await decodeReady(page);
    assert.match(await page.locator('#decode-result').textContent(), /received your notes|could not match|not recognized|not in/i);
    const fileChooser = page.waitForEvent('filechooser');
    await page.locator('#upload-zone').focus();
    await page.keyboard.press('Enter');
    const chooser = await fileChooser;
    await chooser.setFiles({ name: 'visit-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('A1c and glucose results. Follow up with cardiology.') });
    await page.waitForFunction(() => document.querySelector('#medical-text').value.includes('A1c'));
    assert.match(await page.locator('#file-name').textContent(), /visit-notes\.txt/);
    await page.locator('#decode').click();
    await decodeReady(page);
    assert.match(await page.locator('#decode-result').textContent(), /blood sugar|sugar|glucose/i);
    await page.locator('#document').setInputFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 fake content') });
    await page.waitForFunction(() => /text|txt|csv|md|PDF/i.test(document.querySelector('#toast').textContent));
    assert.match(await page.locator('#medical-text').inputValue(), /A1c/);
    assert.doesNotMatch(await page.locator('#medical-text').inputValue(), /PDF/);
    await page.locator('#decoder-save').click();
    await page.locator('[data-page="plan"]').click();
    assert.ok(await page.locator('.task').count() > 5, 'Decoder follow-up questions should be added');

    // Specialist searches recognize specialties, reordered names, aliases, and
    // small spelling mistakes. Unlisted conditions keep useful resources.
    await page.locator('[data-page="specialists"]').click();
    const conditionCount = await page.locator('#specialty option').count();
    assert.ok(conditionCount >= 40, 'Expanded condition library should be available');
    await page.locator('#specialist-search').fill('diabetes');
    assert.ok(await page.locator('#specialty option').count() < conditionCount);
    assert.match(await selectedCondition(page), /diabetes/i);
    assert.match(await page.locator('#specialist-results').textContent(), /endocrinolog/i);
    assert.equal(await page.locator('#specialist-location').count(), 0);
    await page.locator('#specialist-search').fill('cardiologist');
    assert.match(await page.locator('#specialist-results').textContent(), /cardiolog/i);
    assert.ok(await page.locator('#specialty option').count() < conditionCount);
    for (const [query, expected] of [
      ['migriane', /migraine/i],
      ['arthritis rheumatoid', /rheumatoid arthritis/i],
      ['POTS', /postural|POTS/i]
    ]) {
      await page.locator('#specialist-search').fill(query);
      assert.match(await selectedCondition(page), expected);
      assert.ok(await page.locator('#specialist-results a').count() > 0, `${query} should have resources`);
    }
    const beforeBooking = await page.evaluate(() => JSON.parse(localStorage.getItem('tasks')).length);
    await page.locator('#specialist-save').click();
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem('tasks')).length) > beforeBooking);
    await page.locator('#specialist-search').fill('no-such-condition-zyx');
    assert.match(await page.locator('#specialist-results').textContent(), /no|try|not found/i);
    assert.ok(await page.locator('#specialist-results a').count() >= 2, 'Unlisted searches need a useful fallback');
    await page.locator('#specialist-search').fill('');
    assert.equal(await page.locator('#specialty option').count(), conditionCount);

    // Reviewable checklist suggestions, progress, appointments, symptom records,
    // and a real downloadable preparation record.
    await page.locator('[data-page="plan"]').click();
    await page.locator('#plan-template').selectOption('medication');
    await page.locator('#plan-concern').fill('Review dizziness after my morning medicine');
    await page.locator('#plan-build').click();
    await page.locator('#plan-apply').waitFor({ state: 'visible' });
    assert.match(await page.locator('#plan-suggestions').textContent(), /miss a dose|interactions|medicines/i);
    const beforeTemplate = await page.locator('.task').count();
    await page.locator('#plan-apply').click();
    assert.ok(await page.locator('.task').count() > beforeTemplate);
    await page.locator('.task input[type="checkbox"]').first().check();
    assert.match(await page.locator('#plan-progress').textContent(), /^1 of/);
    await page.locator('#task-text').fill('Bring my ID');
    await page.locator('#add-task button').click();
    assert.match(await page.locator('#checklist').textContent(), /Bring my ID/);
    await page.locator('#visit-date').fill('2026-11-05');
    await page.locator('#visit-clinician').fill('My community clinic');
    await page.locator('#visit-form button').click();
    assert.match(await page.locator('#visit-saved').textContent(), /saved/i);
    await page.locator('#symptom-name').fill('Dizziness when standing');
    await page.locator('#symptom-date').fill('2026-10-31');
    await page.locator('#symptom-severity').fill('6');
    await page.locator('#symptom-notes').fill('After standing from a chair; needed a break');
    await page.locator('#symptom-form button').click();
    assert.match(await page.locator('#symptom-log').textContent(), /Dizziness when standing/);
    assert.match(await page.locator('#symptom-log').textContent(), /severity 6\/10/);
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#plan-export').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'my-care-plan.txt');
    const exported = await fs.readFile(await download.path(), 'utf8');
    assert.match(exported, /Bring my ID/);
    assert.match(exported, /Dizziness when standing/);
    assert.match(exported, /My community clinic/);

    // The local assistant supports more than condition definitions and can add
    // visit questions to the checklist; clearing removes the conversation.
    await page.locator('[data-page="assistant"]').click();
    await page.locator('.suggestions button').filter({ hasText: 'Help me prepare for a visit' }).click();
    await page.locator('.chat-action').last().waitFor({ state: 'visible' });
    assert.match(await page.locator('#chat-messages').textContent(), /Care navigation library/);
    const beforeChatTask = await page.evaluate(() => JSON.parse(localStorage.getItem('tasks')).length);
    await page.locator('.chat-action').last().click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('tasks')).length), beforeChatTask + 1);
    await page.locator('#chat-clear').click();
    assert.equal(await page.locator('.chat-message.user').count(), 0);
    assert.match(await page.locator('#chat-messages').textContent(), /Conversation cleared/);
    await page.locator('#chat-input').fill('What is rheumatoid arthritis?');
    await page.locator('#chat-form button').click();
    assert.match(await page.locator('#chat-messages').textContent(), /rheumatoid arthritis/i);
    await page.locator('#chat-input').fill('I have severe chest pain');
    await page.locator('#chat-form button').click();
    assert.match(await page.locator('.chat-message.bot').last().textContent(), /emergency services/i);
    assert.equal(await page.evaluate(() => window.__mockVoice.instances.length), 0, 'Ordinary tools must not enable the microphone');

    // Settings persist independently from microphone activation. Choosing a
    // voice while assistance is off must not produce sound or open capture.
    await page.locator('#accessibility').click();
    await page.locator('#theme-choice').selectOption('dark');
    await page.locator('#contrast').check();
    await page.locator('#dyslexia').check();
    await page.locator('#reduce-motion').check();
    await page.locator('#read-responses').uncheck();
    await page.locator('#voice-choice').selectOption('mock-alternative');
    await page.locator('#voice-rate').fill('1.2');
    assert.equal(await page.locator('#voice-preview').isDisabled(), true);
    await page.locator('#save-access').click();
    for (const className of ['dark-mode', 'high-contrast', 'dyslexia-friendly', 'reduce-motion']) {
      assert.equal(await page.locator('body').evaluate((body, name) => body.classList.contains(name), className), true);
    }
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#ai-enabled').disabled);
    assert.equal(await page.evaluate(() => window.__mockVoice.instances.length), 0, 'Reload must not reactivate microphone');
    assert.equal(await page.evaluate(() => window.__mockVoice.spoken.length), 0, 'Reload must stay quiet');
    await page.locator('#accessibility').click();
    assert.equal(await page.locator('#theme-choice').inputValue(), 'dark');
    assert.equal(await page.locator('#voice-choice').inputValue(), 'mock-alternative');
    assert.equal(await page.locator('#voice-rate').inputValue(), '1.2');
    assert.equal(await page.locator('#read-responses').isChecked(), false);
    assert.equal(await page.locator('#dyslexia').isChecked(), true);
    assert.equal(await page.locator('#reduce-motion').isChecked(), true);
    await page.locator('#theme-choice').selectOption('system');
    await page.locator('#contrast').uncheck();
    await page.locator('#dyslexia').uncheck();
    await page.locator('#reduce-motion').uncheck();
    await page.locator('#read-responses').check();
    await page.locator('#save-access').click();
    await page.locator('#accessibility').click();
    assert.equal(await page.locator('#theme-choice').inputValue(), 'system');
    await page.locator('#theme-choice').selectOption('light');
    await page.locator('#tts').check();
    await page.locator('#save-access').click();
    await waitListening(page);
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__mockVoice.spoken.length), 0, 'Explicit enabling must not greet automatically');
    await page.locator('#accessibility').click();
    await page.locator('#tts').uncheck();
    await page.locator('#save-access').click();
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.__mockVoice.active), false);
    await page.locator('#voice').click();
    await waitListening(page);
    assert.equal(await page.evaluate(() => window.__mockVoice.instances.length), 1, 'Toggles must reuse one native recognizer');
    assert.equal(await page.evaluate(() => window.__mockVoice.permissionQueries), 1, 'Saved microphone permission should be checked once');

    await page.locator('#accessibility').click();
    await page.locator('#voice-preview').click();
    await page.waitForFunction(() => window.__mockVoice.utterances.some(item => item.text.includes('care guidance will sound')));
    const preview = await page.evaluate(() => window.__mockVoice.utterances.at(-1));
    assert.equal(preview.voiceURI, 'mock-alternative');
    assert.equal(preview.rate, 1.2);
    await page.locator('#save-access').click();

    await speak(page, 'Get me back to the start screen');
    assert.equal(await activePage(page), 'dashboard');

    // Mouse navigation with assistance on establishes the same input prompt
    // as spoken navigation, including care-assistant question dictation.
    await page.locator('[data-page="assistant"]').click();
    await page.waitForFunction(() => /question|prompt|ask/i.test(window.__mockVoice.spoken.at(-1)));
    const beforeVoiceChat = await page.locator('.chat-message.user').count();
    await speak(page, 'How should I prepare for my appointment?');
    await reviewReady(page, /prepare for my appointment/i);
    assert.equal(await page.locator('.chat-message.user').count(), beforeVoiceChat, 'Dictated question must wait for confirmation');
    await speak(page, 'read it again');
    await reviewReady(page, /prepare for my appointment/i);
    await confirmReview(page, 'yes');
    await page.waitForFunction(count => document.querySelectorAll('.chat-message.user').length === count + 1, beforeVoiceChat);
    await page.locator('#chat-input').fill('What is rheumatoid arthritis?');
    await page.locator('#chat-form button').click();
    await reviewReady(page, /rheumatoid arthritis/i);
    assert.equal(await page.locator('.chat-message.user').count(), beforeVoiceChat + 1, 'Typed question must also wait while voice is on');
    await page.locator('#review-edit').click();
    assert.equal(await page.locator('#chat-input').inputValue(), 'What is rheumatoid arthritis?');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chat-input');
    await page.locator('#chat-input').fill('What is POTS?');
    await page.locator('#chat-form button').click();
    await reviewReady(page, /POTS/i);
    await speak(page, 'cancel');
    await page.locator('#review-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.chat-message.user').count(), beforeVoiceChat + 1, 'Cancelled question must not send');

    await page.locator('[data-page="decoder"]').click();
    assert.equal(await activePage(page), 'decoder');
    await page.waitForFunction(() => /medical notes|notes.*explain/i.test(window.__mockVoice.spoken.at(-1)));
    const notesBeforeNoise = await page.locator('#medical-text').inputValue();
    await speak(page, 'Lets play Minecraft and find diamonds');
    assert.equal(await page.locator('#medical-text').inputValue(), notesBeforeNoise);
    await speak(page, 'tachycardia and hemoglobin');
    await reviewReady(page, /tachycardia and hemoglobin/i);
    assert.equal((await page.locator('#decode-result').textContent()).trim(), '', 'Dictated notes must not decode before confirmation');
    await confirmReview(page, 'send it');
    await decodeReady(page);
    assert.match(await page.locator('#decode-result').textContent(), /red blood cells/i);
    await page.locator('#medical-text').fill('CBC with low Hgb');
    await page.locator('#decode').click();
    await reviewReady(page, /CBC with low Hgb/i);
    assert.equal((await page.locator('#decode-result').textContent()).trim(), '');
    await page.locator('#review-confirm').click();
    await decodeReady(page);
    assert.match(await page.locator('#decode-result').textContent(), /hemoglobin|red blood cells/i);
    await speak(page, 'I need a doctor for diabetes');
    assert.equal(await activePage(page), 'specialists');
    await reviewReady(page, /diabetes/i);
    await confirmReview(page);
    assert.match(await selectedCondition(page), /diabetes/i);
    await speak(page, 'find a specialist for POTS');
    await reviewReady(page, /POTS/i);
    await confirmReview(page);
    assert.match(await selectedCondition(page), /POTS/i);
    assert.match(await page.locator('#specialist-results').textContent(), /Dysautonomia/i);
    await speak(page, 'add a task');
    const beforeVoiceTask = await page.locator('.task').count();
    await speak(page, 'Did you see that movie?');
    assert.equal(await page.locator('.task').count(), beforeVoiceTask);
    await speak(page, 'Arrange transportation');
    await reviewReady(page, /Arrange transportation/i);
    assert.equal(await page.locator('.task').count(), beforeVoiceTask, 'Dictated task must not be saved before review');
    await confirmReview(page, 'save it');
    await page.waitForFunction(count => document.querySelectorAll('.task').length === count + 1, beforeVoiceTask);
    assert.match(await page.locator('#checklist').textContent(), /Arrange transportation/);
    await page.locator('#task-text').fill('Call my clinic about accessible parking');
    await page.locator('#add-task button').click();
    await reviewReady(page, /accessible parking/i);
    assert.equal(await page.locator('.task').count(), beforeVoiceTask + 1);
    await speak(page, 'change');
    await page.locator('#review-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'task-text');
    assert.equal(await page.locator('.task').count(), beforeVoiceTask + 1);
    await page.locator('#task-text').fill('Call my clinic about wheelchair access');
    await page.locator('#add-task button').click();
    await reviewReady(page, /wheelchair access/i);
    await page.locator('#review-cancel').click();
    assert.equal(await page.locator('.task').count(), beforeVoiceTask + 1);
    await page.locator('#add-task button').click();
    await confirmReview(page);
    await page.waitForFunction(count => document.querySelectorAll('.task').length === count + 2, beforeVoiceTask);
    await speak(page, 'complete item two');
    await confirmReview(page);
    assert.equal(await page.locator('.task input[type="checkbox"]').nth(1).isChecked(), true);
    await speak(page, 'read my checklist');
    assert.match(await page.evaluate(() => window.__mockVoice.spoken.at(-1)), /Item 1\./);
    await page.locator('#profile').click();
    await page.waitForFunction(() => /conditions.*selected|conditions.*change/i.test(window.__mockVoice.spoken.at(-1)));
    await speak(page, 'Long COVID');
    await speak(page, 'save profile');
    await reviewReady(page, /Long COVID/i);
    await speak(page, 'change');
    await page.locator('#review-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'profile-search');
    await speak(page, 'migraine');
    assert.equal(await page.locator('#settings-dialog').isVisible(), true, 'Profile edits must stay in the profile dialog');
    assert.doesNotMatch(await page.locator('#condition-chips').textContent(), /migraine/i, 'Profile edits must wait for save confirmation');
    await speak(page, 'save profile');
    await reviewReady(page, /migraine/i);
    await confirmReview(page);
    assert.match(await page.locator('#condition-chips').textContent(), /Long COVID/);
    assert.match(await page.locator('#condition-chips').textContent(), /migraine/i);
    await speak(page, 'accessibility settings');
    await speak(page, 'larger text on');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('large-text')), true);
    await speak(page, 'larger text off');
    await speak(page, 'dyslexia on');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('dyslexia-friendly')), true);
    await speak(page, 'dyslexia off');
    await speak(page, 'reduce motion on');
    assert.equal(await page.locator('body').evaluate(body => body.classList.contains('reduce-motion')), true);
    await speak(page, 'reduce motion off');
    await speak(page, 'save preferences');
    await speak(page, 'prepare my checklist');
    await reviewReady(page, /visit focus/i);
    await speak(page, 'change');
    await page.locator('#review-dialog').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'plan-concern');
    const beforeChangedConcern = await page.locator('#plan-suggestions').textContent();
    await speak(page, 'I am exhausted from playing Minecraft');
    assert.equal(await page.locator('#plan-suggestions').textContent(), beforeChangedConcern);
    await speak(page, 'I feel exhausted after my medication');
    await reviewReady(page, /exhausted after my medication/i);
    assert.equal(await page.locator('#plan-concern').inputValue(), 'I feel exhausted after my medication');
    assert.equal(await page.locator('#plan-suggestions').textContent(), beforeChangedConcern, 'Edited concern must not build a plan before confirmation');
    await confirmReview(page);
    await page.locator('#plan-apply').waitFor({ state: 'visible' });
    assert.match(await page.locator('#plan-suggestions').textContent(), /exhausted after my medication/i);
    await speak(page, 'track my symptoms');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'symptom-name');

    await page.locator('#accessibility').click();
    await page.locator('#read-responses').uncheck();
    await page.locator('#save-access').click();
    await page.locator('[data-page="assistant"]').click();
    await waitListening(page);
    await page.locator('#chat-input').fill('Help me prepare for a medication review');
    await page.locator('#chat-form button').click();
    await reviewReady(page, /medication review/i);
    await waitListening(page);
    const beforeMutedReply = await page.evaluate(() => window.__mockVoice.spoken.length);
    await page.locator('#review-confirm').click();
    await page.waitForFunction(() => !document.querySelector('#chat-form button').disabled);
    assert.equal(await page.evaluate(() => window.__mockVoice.spoken.length), beforeMutedReply, 'Disabling read responses should leave results silent');
    await page.locator('#accessibility').click();
    await page.locator('#read-responses').check();
    await page.locator('#save-access').click();

    // No result from the old recognition session can execute while read-aloud
    // is active. The explicit Interrupt control resumes capture immediately.
    await page.locator('#chat-input').fill('What is POTS?');
    await page.locator('#chat-form button').click();
    await reviewReady(page, /POTS/i);
    await waitListening(page);
    await page.evaluate(() => { window.__speechDuration = 100000; });
    await page.locator('#review-confirm').click();
    await page.locator('#review-dialog').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.speechSynthesis.speaking);
    assert.equal(await page.evaluate(() => window.__mockVoice.active), false);
    const duringSpeechPage = await activePage(page);
    await page.evaluate(() => window.__mockVoice.emit(window.__mockVoice.spoken.at(-1)));
    await page.evaluate(() => window.__mockVoice.emit('open medical decoder'));
    assert.equal(await activePage(page), duringSpeechPage);
    await page.locator('#voice-interrupt').click();
    await waitListening(page);
    await page.evaluate(() => { window.__speechDuration = 25; });
    await speak(page, 'open medical decoder');
    assert.equal(await activePage(page), 'decoder');
    await page.waitForFunction(() => document.querySelector('#voice-transcript').textContent === '');
    await speak(page, 'go to overview', { confidence: 0.1 });
    assert.equal(await activePage(page), 'decoder');
    await speak(page, 'go to overview', { final: false });
    assert.equal(await activePage(page), 'decoder');
    await speak(page, 'cancel');
    await speak(page, 'turn off voice assistant');
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.evaluate(() => window.__mockVoice.active), false);

    await page.locator('#voice-wake').check();
    await waitListening(page);
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');
    assert.match(await page.locator('#voice-status').textContent(), /wake phrase only/i);
    await speak(page, 'go to overview');
    assert.equal(await activePage(page), 'decoder');
    await speak(page, 'We talked about saying voice assistant on yesterday');
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');
    await speak(page, 'voice assistant on');
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'true');
    await speak(page, 'go to overview');
    assert.equal(await activePage(page), 'dashboard');
    await speak(page, 'turn off voice assistant');
    assert.equal(await page.locator('#voice').getAttribute('aria-pressed'), 'false');
    await speak(page, 'open medical decoder');
    assert.equal(await activePage(page), 'dashboard');
    await page.locator('#voice-wake').uncheck();
    assert.equal(await page.evaluate(() => window.__mockVoice.active), false);
    assert.equal(await page.evaluate(() => window.__mockVoice.instances.length), 1, 'Replies and wake listening must reuse the same native object');
    assert.equal(await page.evaluate(() => window.__mockVoice.permissionQueries), 1, 'Spoken replies must not re-request saved microphone permission');

    // Policies are reachable throughout the site and data clearing is always
    // reviewed before any stored personal records are removed.
    for (const [kind, title] of [
      ['terms', /terms of use/i], ['privacy', /privacy policy/i],
      ['accessibility', /accessibility/i], ['help', /help.*feedback/i]
    ]) {
      await page.locator(`[data-policy="${kind}"]`).click();
      assert.match(await page.locator('#dialog-title').textContent(), title);
      assert.ok((await page.locator('#dialog-content').textContent()).length > 200);
      await page.locator('.dialog-close').click();
    }
    const beforeReset = await storedTaskCount(page);
    assert.ok(beforeReset > 0);
    await page.locator('#accessibility').click();
    await page.locator('#reset-data').click();
    await reviewReady(page, /clear|delete|remove/i);
    assert.equal(await storedTaskCount(page), beforeReset);
    await page.locator('#review-cancel').click();
    assert.equal(await storedTaskCount(page), beforeReset, 'Cancelled reset must keep records');
    if (!await page.locator('#settings-dialog').isVisible()) await page.locator('#accessibility').click();
    await page.locator('#reset-data').click();
    await reviewReady(page, /clear|delete|remove/i);
    const resetNavigation = page.waitForEvent('framenavigated', frame => frame === page.mainFrame());
    await page.locator('#review-confirm').click();
    await resetNavigation;
    await page.waitForLoadState();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('care-symptoms') || '[]').length), 0);
    assert.equal(await page.evaluate(() => localStorage.getItem('care-visit')), null);
    if (await page.locator('#settings-dialog').isVisible()) await page.locator('.dialog-close').click();

    for (const width of [1440, 1024, 800, 650, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ['dashboard', 'decoder', 'specialists', 'plan', 'assistant']) {
        await page.locator(`[data-page="${name}"]`).click();
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert.ok(overflow <= 1, `${name} overflows by ${overflow}px at ${width}px`);
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
        setTimeout(() => { this.onerror?.({ error: 'not-allowed' }); this.onend?.(); }, 0);
      };
    });
    const deniedPage = await deniedContext.newPage();
    const deniedErrors = [];
    deniedPage.on('pageerror', error => deniedErrors.push(error.message));
    await deniedPage.goto(server.baseURL);
    assert.equal(await deniedPage.evaluate(() => window.__mockVoice.instances.length), 0);
    await deniedPage.locator('#voice').click();
    await deniedPage.waitForFunction(() => document.querySelector('#voice').dataset.state === 'permission');
    assert.match(await deniedPage.locator('.voice-panel').textContent(), /microphone|permission/i);
    assert.equal(await deniedPage.locator('#voice-retry').isVisible(), true);
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
    await storagePage.locator('#add-task button').click();
    assert.match(await storagePage.locator('#checklist').textContent(), /Still works without storage/);
    assert.deepEqual(storageErrors, []);
    await storageContext.close();
    console.log('Chromium smoke passed: quiet startup, automatic/local AI, decoder/files, broad specialist search, checklist/symptoms/export, settings persistence, policies/data reset, confirmed voice/typed input, recognizer reuse, voice/wake/noise/echo, permission handling, blocked storage, and responsive layouts.');
  } finally {
    await browser?.close();
    await server.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
