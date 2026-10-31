/* Browser speech stays here so the application can share its normal actions
   with voice commands. Speech recognition still needs the browser's microphone
   permission; HTTPS or localhost is recommended. */
(function (window) {
  'use strict';

  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const synthesis = window.speechSynthesis;
  const Utterance = window.SpeechSynthesisUtterance;

  function normalize(text) {
    return String(text).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function isStopCommand(text) {
    return /^(?:please )?(?:(?:stop|pause|cancel|quiet|silence|mute)(?: (?:speaking|talking|reading|speech|voice|the voice assistant|voice assistant|assistant))?|(?:turn|switch) (?:off|the voice assistant off|voice assistant off|the assistant off|assistant off)(?: (?:the )?(?:voice assistant|assistant|voice|voice assistance))?|disable (?:the )?(?:voice assistant|assistant|voice|voice assistance))(?: please)?$/.test(text);
  }

  function create(options = {}) {
    const onTranscript = options.onTranscript || (() => {});
    const onState = options.onState || (() => {});
    const onError = options.onError || (() => {});
    const isExpectedInput = options.isExpectedInput || (() => false);
    let enabled = false;
    let recognition = null;
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

    function state(detail = '') {
      const value = !enabled ? 'off' : speaking ? 'speaking' :
        listening ? 'listening' : starting ? 'starting' :
        suspendedState || 'paused';
      onState(value, detail);
    }

    function clearRestart() {
      if (restartTimer !== null) {
        window.clearTimeout(restartTimer);
        restartTimer = null;
      }
    }

    function clearSpeechWatchdog() {
      if (speechWatchdog !== null) {
        window.clearTimeout(speechWatchdog);
        speechWatchdog = null;
      }
    }

    function cancelSpeech() {
      speechVersion += 1;
      clearSpeechWatchdog();
      queuedSpeech = '';
      if (speaking) echoUntil = Date.now() + 1500;
      speaking = false;
      currentUtterance = null;
      if (synthesis) synthesis.cancel();
    }

    function canPlayAudio() {
      const activation = window.navigator && window.navigator.userActivation;
      return !activation || activation.hasBeenActive || activation.isActive;
    }

    function chooseVoice(utterance) {
      const voices = typeof synthesis.getVoices === 'function' ? synthesis.getVoices() : [];
      const voice = voices.find(item => /^en-US$/i.test(item.lang) && item.localService) ||
        voices.find(item => /^en-US$/i.test(item.lang)) ||
        voices.find(item => /^en\b/i.test(item.lang));
      if (voice) utterance.voice = voice;
    }

    function speak(text) {
      if (!enabled || !text) return;
      cancelSpeech();
      if (!synthesis || !Utterance) {
        onError('Spoken responses are unavailable in this browser. You can still use the on-screen controls.', 'speech-unsupported');
        state();
        return;
      }
      if (!canPlayAudio()) {
        queuedSpeech = String(text);
        state('Interact with the page once to allow spoken guidance.');
        return;
      }

      const utterance = new Utterance(String(text));
      utterance.lang = 'en-US';
      utterance.rate = 1;
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
        speaking = true;
        state();
      };
      utterance.onend = () => {
        if (version !== speechVersion) return;
        clearSpeechWatchdog();
        currentUtterance = null;
        speaking = false;
        echoUntil = Date.now() + 1500;
        state();
        startListening();
      };
      utterance.onerror = event => {
        if (version !== speechVersion) return;
        clearSpeechWatchdog();
        currentUtterance = null;
        speaking = false;
        echoUntil = Date.now() + 1500;
        if (event.error === 'not-allowed') {
          queuedSpeech = String(text);
          onError('Tap the page to allow spoken guidance.', 'speech-blocked');
        } else if (!['canceled', 'interrupted'].includes(event.error)) {
          onError('Spoken guidance could not play. Written guidance is still available.', 'speech-error');
        }
        state();
      };

      // Some Chrome versions silently refuse speech until the first gesture.
      // A watchdog returns the status to listening instead of leaving it stuck.
      speechWatchdog = window.setTimeout(() => {
        if (version !== speechVersion || !speaking) return;
        cancelSpeech();
        queuedSpeech = String(text);
        state('Tap the page to allow spoken guidance.');
      }, 3000);
      try {
        synthesis.speak(utterance);
      } catch {
        cancelSpeech();
        onError('Spoken guidance could not play. Written guidance is still available.', 'speech-error');
        state();
      }
    }

    function isEcho(text, final) {
      const normalized = normalize(text);
      if (!normalized || !echoText || Date.now() > echoUntil || isStopCommand(normalized)) return false;
      // Keep brief answers such as "POTS" usable after a spoken input prompt.
      // Ignore partial matches while speaking and longer, verbatim speaker echo.
      const wordCount = normalized.split(' ').length;
      if (normalized === echoText) return true;
      // A prompted choice can also appear in the assistant's question. Let the
      // application whitelist complete, expected answers without weakening echo
      // suppression for its whole prompt or for open-ended note dictation.
      if (final && isExpectedInput(text)) return false;
      return (!final || wordCount >= 3) && (` ${echoText} `).includes(` ${normalized} `);
    }

    function scheduleRestart() {
      if (!enabled || suspendedState || recognition || restartTimer !== null) return;
      const delay = retryCount ? Math.min(8000, 500 * (2 ** (retryCount - 1))) :
        Math.min(5000, 250 * (2 ** Math.min(silentEnds, 4)));
      restartTimer = window.setTimeout(() => {
        restartTimer = null;
        startListening();
      }, delay);
    }

    function failRecognition(message, code, blockedState) {
      suspendedState = blockedState;
      clearRestart();
      onError(message, code);
      state(message);
    }

    function startListening() {
      if (!enabled || suspendedState || recognition || starting || listening) return;
      clearRestart();
      if (!Recognition) {
        failRecognition('Microphone voice control is unavailable in this browser. Spoken guidance and on-screen controls can still be used.', 'recognition-unsupported', 'unavailable');
        return;
      }
      if (window.isSecureContext === false && window.location &&
          !['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)) {
        failRecognition('Open this site using HTTPS or localhost to use microphone voice control.', 'insecure-origin', 'unavailable');
        return;
      }

      let session;
      try {
        session = new Recognition();
      } catch {
        failRecognition('Microphone voice control could not initialize in this browser.', 'recognition-unsupported', 'unavailable');
        return;
      }
      recognition = session;
      const finalIndexes = new Set();
      let receivedResult = false;
      let hadError = false;
      session.lang = 'en-US';
      session.continuous = true;
      session.interimResults = true;
      session.maxAlternatives = 1;
      starting = true;
      state();

      session.onstart = () => {
        if (session !== recognition || !enabled) return;
        starting = false;
        listening = true;
        state();
      };
      session.onresult = event => {
        if (session !== recognition || !enabled) return;
        for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0] && result[0].transcript ? result[0].transcript.trim() : '';
          if (!text || finalIndexes.has(index)) continue;
          if (result.isFinal) finalIndexes.add(index);
          if (isEcho(text, result.isFinal)) continue;
          receivedResult = true;
          retryCount = 0;
          silentEnds = 0;
          // Recognition remains active during speech. Cancel as soon as a
          // distinct interim result arrives, then dispatch the final command.
          if (speaking) {
            cancelSpeech();
            state();
          }
          if (result.isFinal) onTranscript(text);
          if (!enabled || session !== recognition) return;
        }
      };
      session.onerror = event => {
        if (session !== recognition || !enabled) return;
        hadError = true;
        listening = false;
        starting = false;
        const code = event.error || 'unknown';
        if (['not-allowed', 'service-not-allowed'].includes(code)) {
          failRecognition('Microphone access is blocked. Allow the microphone in your browser site settings, then turn voice assistance on again.', code, 'permission');
        } else if (code === 'audio-capture') {
          failRecognition('No microphone is available. Check your microphone connection and browser permissions, then try voice assistance again.', code, 'unavailable');
        } else if (['language-not-supported', 'bad-grammar'].includes(code)) {
          failRecognition('English voice recognition is unavailable in this browser. Use the on-screen controls or another browser.', code, 'unavailable');
        } else if (code === 'no-speech') {
          silentEnds += 1;
          state('Listening will resume shortly.');
        } else {
          retryCount += 1;
          if (retryCount >= 3) {
            failRecognition('Voice recognition could not reconnect. Check your internet connection, then turn voice assistance on again.', code, 'paused');
          } else {
            state('Reconnecting microphone voice control…');
          }
        }
      };
      session.onend = () => {
        if (session !== recognition) return;
        recognition = null;
        starting = false;
        listening = false;
        if (!receivedResult && !hadError) silentEnds += 1;
        state();
        scheduleRestart();
      };
      try {
        session.start();
      } catch (error) {
        recognition = null;
        starting = false;
        listening = false;
        if (error && ['NotAllowedError', 'SecurityError'].includes(error.name)) {
          failRecognition('Microphone access needs browser permission. Allow the microphone, then turn voice assistance on again.', 'not-allowed', 'permission');
        } else {
          retryCount += 1;
          if (retryCount >= 3) {
            failRecognition('Voice recognition could not start. Turn voice assistance on again to retry.', 'start-failed', 'paused');
          } else {
            state('Starting microphone voice control…');
            scheduleRestart();
          }
        }
      }
    }

    function enable({ welcome } = {}) {
      enabled = true;
      if (suspendedState) {
        // Retry only after an explicit enable, never repeatedly prompt for a
        // denied permission. Discard any old session before the new attempt.
        const oldSession = recognition;
        recognition = null;
        starting = false;
        listening = false;
        if (oldSession) {
          try { oldSession.abort(); } catch { /* Already ended. */ }
        }
      }
      suspendedState = '';
      retryCount = 0;
      clearRestart();
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
      const oldSession = recognition;
      recognition = null;
      listening = false;
      starting = false;
      echoText = '';
      echoUntil = 0;
      if (oldSession) {
        try { oldSession.abort(); } catch { /* Already ended. */ }
      }
      state();
    }

    function interrupt() {
      cancelSpeech();
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
      enable, disable, speak, interrupt,
      get enabled() { return enabled; },
      get supported() { return Boolean(Recognition); },
      get listening() { return listening; },
      get speaking() { return speaking; }
    };
  }

  window.CareVoice = { create };
})(window);
