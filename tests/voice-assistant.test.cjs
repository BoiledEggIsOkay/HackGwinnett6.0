const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Browser APIs are mocked here so microphone permissions, interrupted speech,
// and recognizer restarts are deterministic and do not need an online service.
function browser(options = {}) {
  let now = 0;
  let nextTimer = 1;
  const timers = new Map();
  const states = [];
  const transcripts = [];
  const errors = [];
  const instances = [];
  const listeners = new Map();
  const schedule = (callback, delay = 0) => {
    const id = nextTimer++;
    timers.set(id, { callback, at: now + delay });
    return id;
  };
  const advance = (duration = 0) => {
    const target = now + duration;
    let count = 0;
    while (true) {
      const next = [...timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      assert.ok(++count < 1000, 'Timer loop must be bounded');
      timers.delete(next[0]);
      now = next[1].at;
      next[1].callback();
    }
    now = target;
  };
  class Recognition {
    constructor() {
      this.starts = 0;
      this.aborts = 0;
      this.active = false;
      instances.push(this);
    }
    start() {
      if (this.active) {
        const error = new Error('Already started');
        error.name = 'InvalidStateError';
        throw error;
      }
      this.starts++;
      this.active = true;
      schedule(() => this.onstart?.());
    }
    abort() {
      this.aborts++;
      this.active = false;
      schedule(() => this.onend?.());
    }
    stop() { this.abort(); }
  }
  class Utterance {
    constructor(text) { this.text = text; }
  }
  const synthesis = {
    speaking: false,
    pending: false,
    utterances: [],
    cancels: 0,
    getVoices: () => [{ lang: 'en-US', name: 'Test voice' }],
    addEventListener() {},
    cancel() {
      this.cancels++;
      this.speaking = false;
      const previous = this.utterances.at(-1);
      schedule(() => previous?.onend?.());
    },
    speak(utterance) {
      this.utterances.push(utterance);
      this.speaking = true;
      schedule(() => utterance.onstart?.());
    },
    resume() {}
  };
  class BrowserDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const window = {
    SpeechRecognition: options.recognition === false ? undefined : Recognition,
    speechSynthesis: options.synthesis === false ? undefined : synthesis,
    SpeechSynthesisUtterance: options.synthesis === false ? undefined : Utterance,
    isSecureContext: options.secure !== false,
    navigator: { language: 'en-US', userActivation: { hasBeenActive: options.activated !== false, isActive: options.activated !== false } },
    location: { protocol: 'http:', hostname: 'localhost' },
    setTimeout: schedule,
    clearTimeout: id => timers.delete(id),
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); }
  };
  const document = {
    hidden: false,
    visibilityState: 'visible',
    addEventListener(type, handler) { listeners.set(type, handler); },
    removeEventListener(type) { listeners.delete(type); }
  };
  window.document = document;
  const context = vm.createContext({
    window, document, navigator: window.navigator, location: window.location,
    speechSynthesis: window.speechSynthesis,
    SpeechSynthesisUtterance: window.SpeechSynthesisUtterance,
    Date: BrowserDate, setTimeout: schedule, clearTimeout: window.clearTimeout,
    console
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../voice-assistant.js'), 'utf8'), context);
  const engine = window.CareVoice.create({
    onState: (state, detail) => states.push({ state, detail }),
    onTranscript: text => transcripts.push(text),
    onError: (message, code) => errors.push({ message, code }),
    isExpectedInput: options.isExpectedInput
  });
  const emit = (text, { final = true, index = 0 } = {}) => {
    const result = [{ transcript: text, confidence: 0.95 }];
    result.isFinal = final;
    const results = Array(index).fill(null).concat([result]);
    instances.at(-1).onresult?.({ resultIndex: index, results });
  };
  return {
    engine, window, synthesis, states, transcripts, errors, instances, timers,
    advance, emit,
    end() {
      const recognition = instances.at(-1);
      recognition.active = false;
      recognition.onend?.();
    },
    error(code) { instances.at(-1).onerror?.({ error: code }); },
    gesture() {
      window.navigator.userActivation.hasBeenActive = true;
      window.navigator.userActivation.isActive = true;
      listeners.get('pointerdown')?.();
    }
  };
}

test('starts listening when enabled and restarts after the recognizer ends', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  assert.equal(b.engine.enabled, true);
  assert.equal(b.engine.listening, true);
  assert.equal(b.instances.at(-1).continuous, true);
  assert.equal(b.instances.at(-1).interimResults, true);
  b.end();
  b.advance(5000);
  assert.equal(b.engine.listening, true);
  assert.ok(b.instances.reduce((sum, recognition) => sum + recognition.starts, 0) >= 2);
});

test('disabling cancels speech and prevents recognition from restarting', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('A long explanation of your care plan.');
  b.advance();
  assert.equal(b.engine.speaking, true);
  b.engine.disable();
  const starts = b.instances.reduce((sum, recognition) => sum + recognition.starts, 0);
  b.advance(60000);
  assert.equal(b.engine.enabled, false);
  assert.equal(b.engine.speaking, false);
  assert.equal(b.engine.listening, false);
  assert.equal(b.instances.reduce((sum, recognition) => sum + recognition.starts, 0), starts);
  assert.ok(b.synthesis.cancels > 0);
});

test('new speech interrupts an explanation and the final transcript runs once', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('Here are the steps to prepare for an appointment with your doctor.');
  b.advance();
  const before = b.synthesis.cancels;
  b.emit('open medical decoder', { final: false });
  b.advance();
  assert.ok(b.synthesis.cancels > before);
  assert.equal(b.engine.speaking, false);
  b.emit('open medical decoder');
  b.emit('open medical decoder');
  assert.deepEqual(b.transcripts, ['open medical decoder']);
});

test('does not execute its own echoed guidance as a user command', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('Your care plan includes a checklist for your next appointment.');
  b.advance();
  b.emit('Your care plan includes a checklist for your next appointment.');
  assert.deepEqual(b.transcripts, []);
});

test('microphone denial stops retries and reports actionable feedback', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.error('not-allowed');
  b.end();
  const starts = b.instances.reduce((sum, recognition) => sum + recognition.starts, 0);
  b.advance(60000);
  assert.equal(b.instances.reduce((sum, recognition) => sum + recognition.starts, 0), starts);
  assert.ok(b.errors.length > 0);
  assert.ok(b.states.some(({ state }) => state === 'permission'));
});

test('repeated network failures eventually stop retrying', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  for (let i = 0; i < 12; i++) {
    b.error('network');
    b.end();
    b.advance(60000);
  }
  const starts = b.instances.reduce((sum, recognition) => sum + recognition.starts, 0);
  b.advance(600000);
  assert.equal(b.instances.reduce((sum, recognition) => sum + recognition.starts, 0), starts);
  assert.ok(starts < 12);
  assert.ok(b.errors.length > 0);
});

test('a browser without recognition reports the limitation without crashing', () => {
  const b = browser({ recognition: false });
  assert.equal(b.engine.supported, false);
  b.engine.enable();
  b.advance();
  assert.equal(b.instances.length, 0);
  assert.ok(b.states.some(({ state }) => state === 'unavailable'));
  b.engine.speak('You can still read this page.');
  b.advance();
  assert.equal(b.synthesis.utterances.at(-1).text, 'You can still read this page.');
});

test('blocked autoplay waits for the first gesture before speaking', () => {
  const b = browser({ activated: false });
  b.engine.enable({ welcome: 'Welcome, Guest User.' });
  b.advance();
  assert.equal(b.synthesis.utterances.length, 0);
  b.gesture();
  b.advance();
  assert.equal(b.synthesis.utterances.at(-1).text, 'Welcome, Guest User.');
});

test('spoken turn-off commands are never discarded as speech echoes', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('You can say turn off voice assistant at any time.');
  b.advance();
  b.emit('turn off voice assistant');
  assert.deepEqual(b.transcripts, ['turn off voice assistant']);
});

test('events from an old recognition session cannot affect a newly enabled session', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  const oldSession = b.instances.at(-1);
  b.engine.disable();
  b.engine.enable();
  b.advance();
  assert.notEqual(b.instances.at(-1), oldSession);
  oldSession.onerror?.({ error: 'not-allowed' });
  oldSession.onend?.();
  b.advance(10000);
  assert.equal(b.engine.enabled, true);
  assert.equal(b.engine.listening, true);
  assert.equal(b.errors.length, 0);
});

test('a one-word condition answer remains usable after a spoken prompt', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('Which condition? You can say Ehlers Danlos, POTS, or ME CFS.');
  b.advance();
  b.emit('POTS');
  assert.deepEqual(b.transcripts, ['POTS']);
});

test('missing speech synthesis still allows microphone commands', () => {
  const b = browser({ synthesis: false });
  b.engine.enable();
  b.advance();
  b.engine.speak('Welcome, Guest User.');
  b.emit('open my care plan');
  assert.equal(b.engine.listening, true);
  assert.equal(b.engine.speaking, false);
  assert.deepEqual(b.transcripts, ['open my care plan']);
  assert.ok(b.errors.some(({ code }) => code === 'speech-unsupported'));
  b.engine.disable();
});

test('a prompted multi-word condition is accepted while complete speaker echo is ignored', () => {
  const b = browser({
    isExpectedInput: text => /^ehlers[\s-]+danlos syndrome$/i.test(text)
  });
  b.engine.enable();
  b.advance();
  const prompt = 'Say Ehlers-Danlos syndrome, POTS, or other conditions.';
  b.engine.speak(prompt);
  b.advance();
  b.emit(prompt);
  assert.deepEqual(b.transcripts, []);
  b.emit('POTS or other conditions', { index: 1 });
  assert.deepEqual(b.transcripts, []);
  b.emit('Ehlers Danlos syndrome', { index: 2 });
  assert.deepEqual(b.transcripts, ['Ehlers Danlos syndrome']);
});
