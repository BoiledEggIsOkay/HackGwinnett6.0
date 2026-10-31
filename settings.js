(function (window) {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const defaults = {
    large: false, contrast: false, theme: 'light', dyslexia: false,
    motion: false, readResponses: true, voiceURI: '', rate: 1
  };
  let options;
  let preferences = { ...defaults };
  function apply() {
    const dark = preferences.theme === 'dark' ||
      (preferences.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
    document.body.classList.toggle('dark-mode', dark);
    document.body.classList.toggle('large-text', preferences.large);
    document.body.classList.toggle('high-contrast', preferences.contrast);
    document.body.classList.toggle('dyslexia-friendly', preferences.dyslexia);
    document.body.classList.toggle('reduce-motion', preferences.motion);
    options.save('care-preferences', preferences);
    options.getVoice()?.setSpeechOptions({ voiceURI: preferences.voiceURI, rate: preferences.rate });
  }
  function populateVoices() {
    const select = $('#voice-choice');
    if (!select) return;
    const previous = select.value || preferences.voiceURI;
    select.replaceChildren();
    const automatic = document.createElement('option');
    automatic.value = '';
    automatic.textContent = 'Automatic English voice';
    select.append(automatic);
    (options.getVoice()?.getVoices() || []).forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voiceURI || voice.name;
      option.textContent = `${voice.name} (${voice.lang})`;
      select.append(option);
    });
    select.value = [...select.options].some(option => option.value === previous) ? previous : '';
  }
  function open() {
    const voice = options.getVoice();
    options.modal('Your settings, your comfort.', `
      <p class="panel-intro">Choose what feels easiest to read, hear, and use. Your preferences stay on this device.</p>
      <h3>Voice assistance</h3>
      <label class="setting-row">Voice control and guidance<input type="checkbox" id="tts" ${voice?.enabled ? 'checked' : ''}></label>
      <label class="setting-row">Wake phrase while voice is off<input type="checkbox" id="wake-setting" ${voice?.wakeListening ? 'checked' : ''}></label>
      <label class="setting-row">Read results and replies aloud<input type="checkbox" id="read-responses" ${preferences.readResponses ? 'checked' : ''}></label>
      <label class="settings-label" for="voice-choice">Speaking voice</label><select id="voice-choice"></select>
      <label class="settings-label" for="voice-rate">Speaking speed <output id="rate-value">${preferences.rate.toFixed(1)}×</output></label>
      <input id="voice-rate" type="range" min="0.7" max="1.4" step="0.1" value="${preferences.rate}">
      <button id="voice-preview" class="secondary" type="button" ${voice?.enabled ? '' : 'disabled'}>Preview selected voice</button>
      <p class="fine-print">Guided input prompts play when voice assistance is on. Turn it off for a quiet experience. Available voices depend on your device.</p>
      <h3>Reading and appearance</h3>
      <label class="settings-label" for="theme-choice">Color theme</label><select id="theme-choice"><option value="light">Light</option><option value="dark">Dark</option><option value="system">Match my device</option></select>
      <label class="setting-row">Larger text<input type="checkbox" id="large" ${preferences.large ? 'checked' : ''}></label>
      <label class="setting-row">Higher contrast<input type="checkbox" id="contrast" ${preferences.contrast ? 'checked' : ''}></label>
      <label class="setting-row">Dyslexia-friendly font and spacing<input type="checkbox" id="dyslexia" ${preferences.dyslexia ? 'checked' : ''}></label>
      <label class="setting-row">Reduce animation<input type="checkbox" id="reduce-motion" ${preferences.motion ? 'checked' : ''}></label>
      <p class="fine-print">Reading preferences vary. This option uses a familiar font, more space between letters, and a more open line height.</p>
      <h3>AI and privacy</h3>
      <label class="setting-row">Use AI when connected<input type="checkbox" id="settings-ai" aria-describedby="settings-ai-status" ${window.CareAI?.enabled ? 'checked' : ''}></label>
      <p id="settings-ai-status" class="fine-print" role="status"></p>
      <button id="settings-ai-retry" class="secondary" type="button">Check connection</button>
      <details id="settings-ai-connection-help" class="ai-connection-help" hidden><summary>AI connection help</summary><p id="settings-ai-connection-guidance"></p><p>For a local copy, run <code>npm start</code> from the project folder and open <a href="http://localhost:3000">http://localhost:3000</a>.</p><p>The site owner must copy <code>.env.example</code> to <code>.env</code>, fill in <code>OPENAI_API_KEY</code>, and restart the server. For hosted AI, set the key in the AI server’s hosting environment and redeploy. Then choose <strong>Check connection</strong>.</p></details>
      <p class="fine-print">Connected AI receives text you submit and relevant profile details. You can choose local tools instead. See the Privacy policy for details.</p>
      <button class="primary" id="save-access">Save preferences</button>
      <button class="secondary danger" id="reset-data" type="button">Clear my data from this device</button>`);
    $('#theme-choice').value = preferences.theme;
    populateVoices();
    $('#voice-rate').oninput = event => { $('#rate-value').textContent = `${Number(event.target.value).toFixed(1)}×`; };
    $('#voice-preview').onclick = () => {
      const engine = options.getVoice();
      if (!engine?.enabled) return;
      engine.setSpeechOptions({ voiceURI: $('#voice-choice').value, rate: Number($('#voice-rate').value) });
      engine.speak('This is how your care guidance will sound.');
      engine.setSpeechOptions({ voiceURI: preferences.voiceURI, rate: preferences.rate });
    };
    $('#settings-ai').onchange = event => {
      if (event.target.checked && !window.CareAI?.available) {
        event.target.checked = false;
        void window.CareAI?.connect();
      } else {
        // Keep a staged settings choice when connection status is refreshed.
        event.target.dataset.aiEdited = 'true';
      }
    };
    window.CareAI?.render();
    $('#save-access').onclick = () => {
      const wantsVoice = $('#tts').checked;
      const wantsWake = $('#wake-setting').checked;
      const wantsAI = $('#settings-ai').checked;
      const canChooseAI = !$('#settings-ai').disabled && $('#settings-ai').dataset.aiEdited === 'true';
      Object.assign(preferences, {
        large: $('#large').checked, contrast: $('#contrast').checked,
        dyslexia: $('#dyslexia').checked, motion: $('#reduce-motion').checked,
        readResponses: $('#read-responses').checked, theme: $('#theme-choice').value,
        voiceURI: $('#voice-choice').value, rate: Number($('#voice-rate').value)
      });
      apply();
      options.setWakeListening(wantsWake);
      options.setVoiceEnabled(wantsVoice);
      if (canChooseAI && window.CareAI?.available) window.CareAI.setEnabled(wantsAI);
      $('#settings-dialog').close();
      options.toast('Preferences saved.');
    };
    $('#reset-data').onclick = options.resetData;
  }
  function init(config) {
    options = config;
    const stored = options.load('care-preferences', {}, value => value && typeof value === 'object' && !Array.isArray(value));
    for (const key of ['large', 'contrast', 'dyslexia', 'motion', 'readResponses']) {
      if (typeof stored[key] === 'boolean') preferences[key] = stored[key];
    }
    if (['light', 'dark', 'system'].includes(stored.theme)) preferences.theme = stored.theme;
    if (typeof stored.voiceURI === 'string') preferences.voiceURI = stored.voiceURI;
    if (typeof stored.rate === 'number' && stored.rate >= 0.7 && stored.rate <= 1.4) preferences.rate = stored.rate;
    apply();
    window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
    window.speechSynthesis?.addEventListener?.('voiceschanged', populateVoices);
  }
  window.CareSettings = { init, open, apply, get preferences() { return preferences; } };
})(window);
