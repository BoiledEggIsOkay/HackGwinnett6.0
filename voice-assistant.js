/* Browser-managed recognition is best effort: SpeechRecognition does not expose
   microphone DSP controls. Command relevance, confidence, paused capture during
   read-aloud, and echo suppression keep accidental input out of the application. */
(function (window) {
  'use strict';

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;
  const normalize = text => String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  function isWake(text) {
    if (window.CareIntents?.isWake) return window.CareIntents.isWake(text);
    return /^(?:please )?(?:(?:turn|switch) on (?:the )?voice (?:assistant|assistance)|(?:turn|switch) (?:the )?voice (?:assistant|assistance) on|voice (?:assistant|assistance) on|(?:enable|activate|start) (?:the )?voice (?:assistant|assistance))(?: please)?$/.test(normalize(text));
  }

  function create(options = {}) {
    const onTranscript = options.onTranscript || (() => {});
    const onState = options.onState || (() => {});
    const onError = options.onError || (() => {});
    const onWake = options.onWake || (() => {});
    const onClear = options.onClear || (() => {});
    const isExpectedInput = options.isExpectedInput || (() => false);
    let enabled = false;
    let wakeListening = false;
    // Reusing one browser recognizer avoids repeatedly allocating a service
    // that may re-request microphone access on platforms with session grants.
    let recognizer = null;
    let recognition = null;
    let recognitionVersion = 0;
    let stopping = false;
    let permissionStatus = null;
    let permissionChecked = false;
    let permissionChecking = false;
    let speechOptions = { voiceURI: '', rate: 1, pitch: 1 };
    let listening = false;
    let starting = false;
    let speaking = false;
    let suspendedState = '';
    let restartTimer = null;
    let speechWatchdog = null;
    let retryCount = 0;
    let silentEnds = 0;
    let speechVersion = 0;
    let currentUtterance = null;
    let queuedSpeech = '';
    let echoText = '';
    let echoUntil = 0;
    let resumeAt = 0;
    const active = () => enabled || wakeListening;

    function state(detail = '') {
      const value = !active() ? 'off' : speaking ? 'speaking' : suspendedState ||
        (!enabled ? 'standby' : listening ? 'listening' : starting ? 'starting' : 'paused');
      onState(value, detail);
    }
    function clearRestart() {
      if (restartTimer !== null) window.clearTimeout(restartTimer);
      restartTimer = null;
    }
    function clearSpeechWatchdog() {
      if (speechWatchdog !== null) window.clearTimeout(speechWatchdog);
      speechWatchdog = null;
    }
    function stopRecognition() {
      const previous = recognition;
      recognition = null;
      listening = starting = false;
      if (previous) {
        // Do not restart the same native object until its end event has arrived.
        stopping = true;
        try { previous.abort(); }
        catch {
          stopping = false;
          recognitionVersion += 1;
        }
      }
    }
    function cancelSpeech() {
      speechVersion += 1;
      clearSpeechWatchdog();
      queuedSpeech = '';
      if (speaking) echoUntil = Date.now() + 2000;
      speaking = false;
      currentUtterance = null;
      if (synthesis) synthesis.cancel();
    }
    function canPlayAudio() {
      const activation = window.navigator?.userActivation;
      return !activation || activation.hasBeenActive || activation.isActive;
    }
    function getVoices() {
      return synthesis && typeof synthesis.getVoices === 'function' ? synthesis.getVoices() : [];
    }
    function setSpeechOptions(value = {}) {
      if (typeof value.voiceURI === 'string') speechOptions.voiceURI = value.voiceURI;
      if (Number.isFinite(Number(value.rate))) speechOptions.rate = Math.min(1.5, Math.max(0.5, Number(value.rate)));
      if (Number.isFinite(Number(value.pitch))) speechOptions.pitch = Math.min(2, Math.max(0.5, Number(value.pitch)));
      return { ...speechOptions };
    }
    function chooseVoice(utterance) {
      const voices = getVoices();
      const voice = voices.find(item => item.voiceURI === speechOptions.voiceURI && speechOptions.voiceURI) ||
        voices.find(item => /^en-US$/i.test(item.lang) && item.localService) ||
        voices.find(item => /^en-US$/i.test(item.lang)) || voices.find(item => /^en\b/i.test(item.lang));
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || 'en-US';
      }
    }
    function scheduleRestart(delay) {
      if (!active() || suspendedState || speaking || recognition || stopping || permissionChecking || restartTimer !== null) return;
      const backoff = retryCount ? Math.min(8000, 500 * (2 ** (retryCount - 1))) :
        Math.min(5000, 250 * (2 ** Math.min(silentEnds, 4)));
      const wait = Math.max(delay ?? backoff, resumeAt - Date.now(), 0);
      restartTimer = window.setTimeout(() => {
        restartTimer = null;
        startListening();
      }, wait);
    }
    function finishSpeech() {
      clearSpeechWatchdog();
      currentUtterance = null;
      speaking = false;
      echoUntil = Date.now() + 2000;
      resumeAt = Date.now() + 600;
      onClear();
      state('Microphone resumes after spoken guidance.');
      scheduleRestart(600);
    }
    function speak(text) {
      if (!enabled || !text) return;
      cancelSpeech();
      if (!synthesis || !Utterance) {
        onError('Spoken responses are unavailable in this browser. You can still use the on-screen controls.', 'speech-unsupported');
        state();
        startListening();
        return;
      }
      if (!canPlayAudio()) {
        queuedSpeech = String(text);
        state('Interact with the page once to allow spoken guidance.');
        return;
      }
      clearRestart();
      // Stop capture before sending any audio to the speakers. Stale callbacks
      // from the aborted recognizer cannot insert speaker audio as dictation.
      stopRecognition();
      onClear();
      const utterance = new Utterance(String(text));
      utterance.lang = 'en-US';
      utterance.rate = speechOptions.rate;
      utterance.pitch = speechOptions.pitch;
      chooseVoice(utterance);
      const version = speechVersion;
      currentUtterance = utterance;
      echoText = normalize(text);
      echoUntil = Infinity;
      speaking = true;
      state();
      utterance.onstart = () => {
        if (version !== speechVersion || !enabled) return;
        clearSpeechWatchdog();
        state();
      };
      utterance.onend = () => {
        if (version !== speechVersion) return;
        finishSpeech();
      };
      utterance.onerror = event => {
        if (version !== speechVersion) return;
        finishSpeech();
        if (event.error === 'not-allowed') {
          queuedSpeech = String(text);
          onError('Tap the page to allow spoken guidance.', 'speech-blocked');
        } else if (!['canceled', 'interrupted'].includes(event.error)) {
          onError('Spoken guidance could not play. Written guidance is still available.', 'speech-error');
        }
      };
      speechWatchdog = window.setTimeout(() => {
        if (version !== speechVersion || !speaking) return;
        cancelSpeech();
        queuedSpeech = String(text);
        resumeAt = Date.now() + 600;
        state('Tap the page to allow spoken guidance.');
        scheduleRestart(600);
      }, 3000);
      try { synthesis.speak(utterance); }
      catch {
        cancelSpeech();
        onError('Spoken guidance could not play. Written guidance is still available.', 'speech-error');
        state();
        scheduleRestart(600);
      }
    }
    function isEcho(text) {
      const value = normalize(text);
      if (!value || !echoText || Date.now() > echoUntil) return false;
      if (value === echoText) return true;
      if (isExpectedInput(text)) return false;
      const count = value.split(' ').length;
      return count >= 3 && (` ${echoText} `).includes(` ${value} `);
    }
    function failRecognition(message, code, blockedState) {
      suspendedState = blockedState;
      clearRestart();
      stopRecognition();
      onClear();
      onError(message, code);
      state(message);
    }
    function checkSavedPermission() {
      if (permissionChecked || !window.navigator?.permissions?.query) return false;
      permissionChecking = true;
      starting = true;
      state('Checking saved microphone permission…');
      // Querying permission does not prompt or open another microphone stream.
      // Some browsers do not implement the microphone permission descriptor.
      Promise.resolve().then(() => window.navigator.permissions.query({ name: 'microphone' }))
        .then(status => {
          permissionStatus = status;
          permissionChecked = true;
          status.addEventListener?.('change', () => {
            if (status.state === 'denied' && active()) {
              failRecognition('Microphone access was blocked. Allow it in browser site settings, then choose Retry microphone.', 'not-allowed', 'permission');
            }
          });
        }, () => { permissionChecked = true; })
        .then(() => {
          permissionChecking = false;
          starting = false;
          if (active() && !speaking && !suspendedState) startListening();
          else state();
        });
      return true;
    }
    function startListening() {
      if (!active() || suspendedState || speaking || recognition || stopping || permissionChecking || starting || listening) return;
      if (Date.now() < resumeAt) { scheduleRestart(resumeAt - Date.now()); return; }
      clearRestart();
      if (!Recognition) {
        failRecognition('Microphone voice control is unavailable in this browser. Use the on-screen controls.', 'recognition-unsupported', 'unavailable');
        return;
      }
      if (window.isSecureContext === false && window.location &&
          !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
        failRecognition('Open this site using HTTPS or localhost to use microphone voice control.', 'insecure-origin', 'unavailable');
        return;
      }
      if (checkSavedPermission()) return;
      if (permissionStatus?.state === 'denied') {
        failRecognition('Microphone access is blocked. Allow it in browser site settings, then choose Retry microphone.', 'not-allowed', 'permission');
        return;
      }
      let session;
      try {
        if (!recognizer) recognizer = new Recognition();
        session = recognizer;
      }
      catch {
        failRecognition('Microphone voice control could not initialize in this browser.', 'recognition-unsupported', 'unavailable');
        return;
      }
      recognition = session;
      const version = ++recognitionVersion;
      const current = () => version === recognitionVersion && session === recognition;
      const finalIndexes = new Set();
      let receivedResult = false;
      let hadError = false;
      session.lang = 'en-US';
      session.continuous = true;
      session.interimResults = false;
      session.maxAlternatives = 1;
      starting = true;
      state();
      session.onstart = () => {
        if (!current() || !active() || speaking) return;
        starting = false;
        listening = true;
        state();
      };
      session.onresult = event => {
        if (!current() || !active() || speaking) return;
        for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          if (!result?.isFinal || finalIndexes.has(index)) continue;
          finalIndexes.add(index);
          const text = result[0]?.transcript?.trim() || '';
          const confidence = Number(result[0]?.confidence);
          // Some browsers return zero when they do not supply confidence.
          const lowConfidence = confidence > 0 && confidence < (enabled ? 0.5 : 0.65);
          if (!text || lowConfidence || isEcho(text)) { onClear(); continue; }
          receivedResult = true;
          retryCount = silentEnds = 0;
          if (!enabled) {
            // Wake-only mode never forwards discussion or navigation commands.
            if (isWake(text)) {
              onClear();
              onWake(text);
              return;
            }
            onClear();
            continue;
          }
          // Continuous recognition can accept another final without requesting
          // a new microphone session. Result indexes deduplicate this session.
          try { onTranscript(text, { confidence: Number.isFinite(confidence) ? confidence : 0 }); }
          finally { onClear(); }
          if (!current() || !active() || speaking) return;
        }
      };
      session.onerror = event => {
        if (!current() || !active()) return;
        hadError = true;
        listening = starting = false;
        const code = event.error || 'unknown';
        if (['not-allowed', 'service-not-allowed'].includes(code)) {
          // Explicit Retry will query again, after the user changes site settings.
          permissionChecked = false;
          permissionStatus = null;
          failRecognition('Microphone access is blocked. Allow it in browser site settings, then choose Retry microphone.', code, 'permission');
        } else if (code === 'audio-capture') {
          failRecognition('No microphone is available. Check the microphone connection and browser permissions, then retry.', code, 'unavailable');
        } else if (['language-not-supported', 'bad-grammar'].includes(code)) {
          failRecognition('English voice recognition is unavailable in this browser. Use the on-screen controls or another browser.', code, 'unavailable');
        } else if (code === 'no-speech') {
          silentEnds += 1;
          state('Listening will resume shortly.');
        } else if (code === 'aborted') {
          state();
        } else {
          retryCount += 1;
          if (retryCount >= 3) {
            failRecognition('Voice recognition could not reconnect. Check your internet connection, then choose Retry microphone.', code, 'paused');
          } else state('Reconnecting microphone voice control…');
        }
      };
      session.onend = () => {
        if (version !== recognitionVersion) return;
        if (session !== recognition) {
          if (stopping) {
            stopping = false;
            state();
            scheduleRestart(0);
          }
          return;
        }
        recognition = null;
        listening = starting = false;
        if (!receivedResult && !hadError) silentEnds += 1;
        onClear();
        state();
        scheduleRestart();
      };
      try { session.start(); }
      catch (error) {
        recognition = null;
        listening = starting = false;
        if (error && ['NotAllowedError', 'SecurityError'].includes(error.name)) {
          permissionChecked = false;
          permissionStatus = null;
          failRecognition('Microphone access needs browser permission. Allow it, then choose Retry microphone.', 'not-allowed', 'permission');
        } else {
          retryCount += 1;
          if (retryCount >= 3) failRecognition('Voice recognition could not start. Choose Retry microphone to try again.', 'start-failed', 'paused');
          else { state('Starting microphone voice control…'); scheduleRestart(); }
        }
      }
    }
    function enable({ welcome } = {}) {
      enabled = true;
      if (suspendedState) stopRecognition();
      suspendedState = '';
      retryCount = silentEnds = 0;
      clearRestart();
      onClear();
      // Wake mode can already be capturing on the same native session. Publish
      // the mode change even when startListening correctly reuses that session.
      state();
      startListening();
      if (welcome) speak(welcome);
      else if (queuedSpeech && canPlayAudio()) speak(queuedSpeech);
      return enabled;
    }
    function disable() {
      enabled = false;
      suspendedState = '';
      clearRestart();
      cancelSpeech();
      stopRecognition();
      echoText = '';
      echoUntil = resumeAt = 0;
      onClear();
      state();
      if (wakeListening) startListening();
    }
    function setWakeListening(value) {
      const next = Boolean(value);
      if (next === wakeListening) {
        if (next && !enabled && suspendedState) {
          suspendedState = '';
          retryCount = silentEnds = 0;
          startListening();
        }
        return wakeListening;
      }
      wakeListening = next;
      if (!enabled) {
        clearRestart();
        stopRecognition();
        suspendedState = '';
        retryCount = silentEnds = 0;
        onClear();
        state();
        if (wakeListening) startListening();
      } else state();
      return wakeListening;
    }
    function interrupt() {
      cancelSpeech();
      clearRestart();
      resumeAt = 0;
      onClear();
      state('Ready for your next command.');
      startListening();
    }
    function flushQueuedSpeech() {
      if (enabled && queuedSpeech && canPlayAudio()) speak(queuedSpeech);
    }
    if (window.document && typeof window.document.addEventListener === 'function') {
      window.document.addEventListener('pointerdown', flushQueuedSpeech, { capture: true });
      window.document.addEventListener('keydown', flushQueuedSpeech, { capture: true });
    }
    if (synthesis && typeof synthesis.addEventListener === 'function') {
      synthesis.addEventListener('voiceschanged', () => {
        if (currentUtterance && !synthesis.speaking) chooseVoice(currentUtterance);
      });
    }
    return {
      enable, disable, speak, interrupt, setWakeListening, setSpeechOptions, getVoices,
      get speechOptions() { return { ...speechOptions }; },
      get enabled() { return enabled; },
      get wakeListening() { return wakeListening; },
      get supported() { return Boolean(Recognition); },
      get listening() { return listening; },
      get speaking() { return speaking; }
    };
  }
  window.CareVoice = { create };
})(window);
