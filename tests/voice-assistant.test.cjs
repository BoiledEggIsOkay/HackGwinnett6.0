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
  const wakes = [];
  let clears = 0;
  const instances = [];
  const listeners = new Map();
  let permissionQueries = 0;
  let microphoneRequests = 0;
  let permissionChange;
  const permissionStatus = {
    state: options.permissionState,
    addEventListener(type, handler) { if (type === 'change') permissionChange = handler; }
  };
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
    getVoices: () => options.voices || [{ lang: 'en-US', name: 'Test voice', voiceURI: 'test-voice' }],
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
    location: { protocol: options.protocol || 'http:', hostname: options.hostname ?? 'localhost' },
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
  if (options.permissionState) {
    window.navigator.permissions = {
      query(descriptor) {
        assert.equal(descriptor.name, 'microphone');
        permissionQueries++;
        return options.permissionUnsupported ? Promise.reject(new TypeError('Unsupported permission')) : Promise.resolve(permissionStatus);
      }
    };
  }
  window.navigator.mediaDevices = {
    getUserMedia() {
      microphoneRequests++;
      return Promise.reject(new Error('Microphone permission must use recognition, not a second stream.'));
    }
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
    isExpectedInput: options.isExpectedInput,
    onWake: text => wakes.push(text),
    onClear: () => { clears++; }
  });
  const emit = (text, { final = true, index = 0, confidence = 0.95 } = {}) => {
    const result = [{ transcript: text, confidence }];
    result.isFinal = final;
    const results = Array(index).fill(null).concat([result]);
    instances.at(-1).onresult?.({ resultIndex: index, results });
  };
  return {
    engine, window, synthesis, states, transcripts, errors, instances, timers, wakes,
    get clears() { return clears; },
    get permissionQueries() { return permissionQueries; },
    get microphoneRequests() { return microphoneRequests; },
    get starts() { return instances.reduce((count, instance) => count + instance.starts, 0); },
    changePermission(value) { permissionStatus.state = value; permissionChange?.(); },
    async permissionsReady() {
      for (let i = 0; i < 6; i++) await Promise.resolve();
      advance();
    },
    finishSpeech() { synthesis.speaking = false; synthesis.utterances.at(-1)?.onend?.(); },
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

test('starts silent with no microphone access until explicitly enabled', () => {
  const b = browser();
  b.advance(60000);
  assert.equal(b.engine.enabled, false);
  assert.equal(b.engine.wakeListening, false);
  assert.equal(b.instances.length, 0);
  assert.equal(b.synthesis.utterances.length, 0);
  b.engine.enable();
  b.advance();
  assert.equal(b.engine.listening, true);
  assert.equal(b.synthesis.utterances.length, 0);
});

test('restarts a granted session after recognition ends without enabling interim results', async () => {
  const b = browser({ permissionState: 'granted' });
  b.engine.enable();
  await b.permissionsReady();
  assert.equal(b.instances.at(-1).continuous, true);
  assert.equal(b.instances.at(-1).interimResults, false);
  b.end();
  b.advance(5000);
  assert.equal(b.engine.listening, true);
  assert.equal(b.instances.length, 1);
  assert.equal(b.starts, 2);
});

test('disabling fully releases microphone and prevents recognition restarting', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('A long explanation of your care plan.');
  b.advance();
  b.engine.disable();
  const starts = b.starts;
  b.advance(60000);
  assert.equal(b.engine.enabled, false);
  assert.equal(b.engine.speaking, false);
  assert.equal(b.engine.listening, false);
  assert.equal(b.starts, starts);
  assert.ok(b.synthesis.cancels > 0);
});

test('keeps the approved microphone session open and consumes ignored speech and cooldown results', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  const oldSession = b.instances.at(-1);
  b.engine.speak('Your care plan includes a checklist for your next appointment.');
  b.advance();
  assert.equal(b.engine.speaking, true);
  assert.equal(b.engine.listening, false);
  assert.equal(oldSession.aborts, 0);
  assert.equal(oldSession.active, true, 'Read-aloud must not discard the approved native session');
  b.emit('open medical decoder');
  b.emit('Your care plan includes a checklist for your next appointment.', { index: 1 });
  assert.deepEqual(b.transcripts, []);
  b.finishSpeech();
  b.emit('open my care plan', { index: 2 });
  b.advance(599);
  assert.equal(b.engine.listening, false);
  b.advance(1);
  assert.equal(b.engine.listening, true);
  assert.equal(b.instances.at(-1), oldSession);
  assert.equal(oldSession.starts, 1, 'Finishing a reply must not request native capture again');
  b.emit('open medical decoder');
  b.emit('Your care plan includes a checklist for your next appointment.', { index: 1 });
  b.emit('open my care plan', { index: 2 });
  b.emit('Your care plan includes a checklist for your next appointment.', { index: 3 });
  assert.deepEqual(b.transcripts, []);
  b.emit('open medical decoder', { index: 4 });
  assert.deepEqual(b.transcripts, ['open medical decoder']);
});

test('explicit interruption cancels speech and accepts a new final once', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('Here are the steps to prepare for your appointment.');
  b.advance();
  const before = b.synthesis.cancels;
  b.engine.interrupt();
  b.advance();
  assert.ok(b.synthesis.cancels > before);
  assert.equal(b.engine.speaking, false);
  assert.equal(b.engine.listening, true);
  b.emit('open medical decoder', { final: false });
  assert.deepEqual(b.transcripts, []);
  b.emit('open medical decoder');
  b.emit('open medical decoder');
  assert.deepEqual(b.transcripts, ['open medical decoder']);
  b.advance(80);
  assert.equal(b.engine.listening, true);
});

test('wake standby ignores every normal command and unrelated conversation', () => {
  const b = browser();
  b.engine.setWakeListening(true);
  b.advance();
  assert.equal(b.engine.enabled, false);
  assert.equal(b.engine.listening, true);
  assert.ok(b.states.some(({ state }) => state === 'standby'));
  b.emit('open medical decoder');
  b.emit('we should play minecraft', { index: 1 });
  b.emit('I heard someone say voice assistant on yesterday', { index: 2 });
  assert.deepEqual(b.transcripts, []);
  assert.deepEqual(b.wakes, []);
  b.emit('voice assistant on', { index: 3 });
  assert.deepEqual(b.wakes, ['voice assistant on']);
  assert.deepEqual(b.transcripts, []);
  b.engine.enable();
  assert.equal(b.states.at(-1).state, 'listening', 'Wake activation must publish the new enabled mode');
  assert.equal(b.instances.length, 1);
  assert.equal(b.starts, 1, 'Wake activation should keep the existing capture session');
  b.emit('open medical decoder', { index: 4 });
  assert.deepEqual(b.transcripts, ['open medical decoder']);
});

test('wake mode remains available after turning voice off and can be fully disabled', () => {
  const b = browser();
  b.engine.setWakeListening(true);
  b.engine.enable();
  b.advance();
  b.engine.disable();
  b.advance();
  assert.equal(b.engine.enabled, false);
  assert.equal(b.engine.wakeListening, true);
  assert.equal(b.engine.listening, true);
  b.emit('turn on the voice assistant');
  assert.deepEqual(b.wakes, ['turn on the voice assistant']);
  b.engine.setWakeListening(false);
  const starts = b.starts;
  b.advance(60000);
  assert.equal(b.engine.listening, false);
  assert.equal(b.starts, starts);
});

test('low confidence and interim background speech never reaches the app', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.emit('find a specialist', { confidence: 0.25 });
  b.emit('find a specialist', { final: false, index: 1 });
  assert.deepEqual(b.transcripts, []);
  b.emit('find a specialist', { confidence: 0, index: 2 });
  assert.deepEqual(b.transcripts, ['find a specialist']);
});

test('clears transcript state after commands, speech, and voice shutdown', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  const before = b.clears;
  b.emit('open my care plan');
  assert.ok(b.clears > before);
  b.advance(80);
  const afterCommand = b.clears;
  b.engine.speak('Prepare your visit checklist.');
  assert.ok(b.clears > afterCommand);
  b.finishSpeech();
  const afterSpeech = b.clears;
  b.engine.disable();
  assert.ok(b.clears > afterSpeech);
});

test('microphone denial stops retries and reports actionable feedback', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.error('not-allowed');
  b.end();
  const starts = b.starts;
  b.advance(60000);
  assert.equal(b.starts, starts);
  assert.ok(b.errors.length > 0);
  assert.ok(b.states.some(({ state }) => state === 'permission'));
});

test('wake standby permission denial also stops retries', () => {
  const b = browser();
  b.engine.setWakeListening(true);
  b.advance();
  b.error('not-allowed');
  const starts = b.starts;
  b.advance(60000);
  assert.equal(b.starts, starts);
  assert.ok(b.states.some(({ state }) => state === 'permission'));
});

test('repeated network failures on a granted session eventually stop retrying', async () => {
  const b = browser({ permissionState: 'granted' });
  b.engine.enable();
  await b.permissionsReady();
  for (let i = 0; i < 12; i++) {
    b.error('network');
    b.end();
    b.advance(60000);
  }
  const starts = b.starts;
  b.advance(600000);
  assert.equal(b.starts, starts);
  assert.ok(starts < 12);
  assert.ok(b.errors.length > 0);
});

test('browser without recognition can still use explicit spoken guidance', () => {
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

test('blocked autoplay waits for a gesture before explicitly requested speech', () => {
  const b = browser({ activated: false });
  b.engine.enable({ welcome: 'Welcome, Guest User.' });
  b.advance();
  assert.equal(b.synthesis.utterances.length, 0);
  b.gesture();
  b.advance();
  assert.equal(b.synthesis.utterances.at(-1).text, 'Welcome, Guest User.');
});

test('old session permission and end callbacks cannot affect a newly enabled session', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  const oldSession = b.instances.at(-1);
  const oldError = oldSession.onerror;
  const oldEnd = oldSession.onend;
  b.engine.disable();
  b.engine.enable();
  b.advance();
  assert.equal(b.instances.at(-1), oldSession);
  oldError?.({ error: 'not-allowed' });
  oldEnd?.();
  b.advance(10000);
  assert.equal(b.engine.enabled, true);
  assert.equal(b.engine.listening, true);
  assert.equal(b.errors.length, 0);
});

test('prompted short answers work after read-aloud completes', () => {
  const b = browser({ isExpectedInput: text => /^ehlers[\s-]+danlos syndrome$/i.test(text) });
  b.engine.enable();
  b.advance();
  const prompt = 'Say Ehlers-Danlos syndrome, POTS, or other conditions.';
  b.engine.speak(prompt);
  b.advance();
  b.emit('POTS');
  assert.deepEqual(b.transcripts, []);
  b.finishSpeech();
  b.advance(600);
  b.emit(prompt);
  b.emit('POTS or other conditions', { index: 1 });
  assert.deepEqual(b.transcripts, []);
  b.emit('Ehlers Danlos syndrome', { index: 2 });
  assert.deepEqual(b.transcripts, ['Ehlers Danlos syndrome']);
});

test('missing speech synthesis still allows microphone commands', () => {
  const b = browser({ synthesis: false });
  b.engine.enable();
  b.advance();
  b.engine.speak('Welcome, Guest User.');
  b.emit('open my care plan');
  assert.equal(b.engine.speaking, false);
  assert.deepEqual(b.transcripts, ['open my care plan']);
  assert.ok(b.errors.some(({ code }) => code === 'speech-unsupported'));
  b.advance(80);
  assert.equal(b.engine.listening, true);
});

const intentContext = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../voice-intents.js'), 'utf8'), intentContext);
const intents = intentContext.window.CareIntents;

test('accepts varied wording for navigation, notes, specialists, and checklist actions', () => {
  for (const [text, command] of [
    ['Could you take me to my care plan please?', 'my care plan'],
    ['Go home', 'overview'],
    ['Help me understand my lab results', 'explain my notes'],
    ['I need a doctor for diabetes', 'find a specialist for diabetes'],
    ['I have asthma and need a specialist', 'find a specialist for asthma'],
    ['Remind me to bring my medication list', 'add a task bring my medication list'],
    ['Put bring my medication list on my checklist', 'add bring my medication list to my checklist'],
    ['Finish item two', 'complete item two'],
    ['Voice assistant off', 'turn off voice assistant'],
    ['Could you build my visit checklist?', 'prepare my checklist'],
    ['Export my care plan please', 'download my care plan'],
    ['Record a symptom', 'track my symptoms']
  ]) assert.equal(intents.parse(text)?.command, command, text);
});

test('keeps unrelated discussion out of pending dictation and AI routing', () => {
  for (const pending of [null, { kind: 'notes' }, { kind: 'task' }, { kind: 'chat' }]) {
    for (const text of ['Lets play Minecraft', 'Did you see that movie?', 'We need diamonds in Minecraft', 'What is the weather?']) {
      assert.equal(intents.isRelevant(text, { pending }), false, text);
      assert.equal(intents.parse(text, { pending }), null, text);
    }
  }
  assert.equal(intents.isRelevant('Hemoglobin 10.5 g/dL and orthostatic intolerance', { pending: { kind: 'notes' } }), true);
  assert.equal(intents.isRelevant('Bring a written symptom timeline', { pending: { kind: 'task' } }), true);
  assert.equal(intents.isRelevant('two', { pending: { kind: 'task-choice' } }), true);
});

test('wake phrases must be standalone instructions', () => {
  for (const phrase of ['voice assistant on', 'Please turn on the voice assistant', 'Could you enable voice assistance please?']) assert.equal(intents.isWake(phrase), true, phrase);
  for (const phrase of ['I heard someone say voice assistant on', 'voice assistant on and start minecraft', 'find a specialist']) assert.equal(intents.isWake(phrase), false, phrase);
});


test('uses the shared condition and glossary library for relevance as it expands', () => {
  intentContext.window.CareMedical = {
    matchConditions: text => /wilson(?:s)? disease/i.test(text) ? [{ name: 'Wilson disease' }] : [],
    glossaryMatches: text => /transaminases/i.test(text) ? [['transaminases', 'Liver enzymes']] : []
  };
  try {
    assert.equal(intents.isRelevant('Wilsons disease', { pending: { kind: 'specialty' } }), true);
    assert.equal(intents.parse('Find a Wilsons disease specialist')?.command, 'find a specialist for wilsons disease');
    assert.equal(intents.parse('What are transaminases?')?.command, 'What are transaminases?');
    assert.equal(intents.isRelevant('We are playing Minecraft with Wilson disease in the chat'), false);
  } finally { delete intentContext.window.CareMedical; }
});

test('late end and error events from replaced speech cannot end the current response', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  b.engine.speak('First spoken response.');
  b.advance();
  const previous = b.synthesis.utterances.at(-1);
  b.engine.speak('A newer spoken response.');
  b.advance();
  previous.onend?.();
  previous.onerror?.({ error: 'not-allowed' });
  assert.equal(b.engine.speaking, true);
  assert.equal(b.engine.listening, false);
  assert.deepEqual(b.errors, []);
  b.finishSpeech();
  b.advance(600);
  assert.equal(b.engine.listening, true);
  assert.equal(b.engine.speaking, false);
});

test('autoplay queue keeps only the newest response and shutdown discards queued speech', () => {
  const b = browser({ activated: false });
  b.engine.enable();
  b.advance();
  b.engine.speak('An earlier response.');
  b.engine.speak('The current response.');
  b.gesture();
  b.advance();
  assert.deepEqual(b.synthesis.utterances.map(item => item.text), ['The current response.']);
  b.engine.disable();
  b.advance();
  b.gesture();
  b.advance();
  assert.equal(b.engine.speaking, false);
  assert.equal(b.synthesis.utterances.length, 1);
});


test('accepts visit logistics and directed site requests without medical jargon', () => {
  for (const text of ['Bring my ID', 'Arrange transportation', 'Ask for an interpreter', 'Get a copy of my records', 'Bring the copay and forms', 'Bring a support person']) {
    assert.equal(intents.isRelevant(text, { pending: { kind: 'task' } }), true, text);
  }
  assert.equal(intents.parse('Get me back to the start screen')?.command, 'overview');
  assert.equal(intents.isRelevant('Could you open the page with my visit questions?'), true);
  assert.equal(intents.isRelevant('Could you open the tab with my saved stuff?'), true);
  assert.equal(intents.isRelevant('Could you open the Minecraft page?'), false);
});

test('reuses saved permission and one recognizer across commands and voice toggles', async () => {
  const b = browser({ permissionState: 'granted' });
  await b.permissionsReady();
  assert.equal(b.permissionQueries, 0);
  assert.equal(b.instances.length, 0);
  b.engine.enable();
  await b.permissionsReady();
  b.emit('open medical decoder');
  b.emit('find a specialist', { index: 1 });
  b.emit('open my care plan', { index: 2 });
  assert.deepEqual(b.transcripts, ['open medical decoder', 'find a specialist', 'open my care plan']);
  assert.equal(b.starts, 1, 'Final commands keep the granted recognition session open');
  for (let i = 0; i < 3; i++) {
    b.engine.disable();
    b.engine.enable();
    b.advance();
  }
  assert.equal(b.instances.length, 1, 'Toggles reuse the browser recognizer');
  assert.equal(b.permissionQueries, 1, 'Existing grant is queried once, never requested by a second audio stream');
  assert.equal(b.microphoneRequests, 0);
  assert.equal(b.engine.listening, true);
});

test('known denied permission never starts recognition and explicit retry uses a changed grant', async () => {
  const b = browser({ permissionState: 'denied' });
  b.engine.enable();
  await b.permissionsReady();
  assert.equal(b.instances.length, 0);
  assert.ok(b.states.some(({ state }) => state === 'permission'));
  b.advance(60000);
  assert.equal(b.permissionQueries, 1);
  b.changePermission('granted');
  b.engine.enable();
  b.advance();
  assert.equal(b.engine.listening, true);
  assert.equal(b.instances.length, 1);
  assert.equal(b.microphoneRequests, 0);
});

test('permission checks cannot turn the microphone on after voice is disabled', async () => {
  const b = browser({ permissionState: 'granted' });
  b.engine.enable();
  b.engine.disable();
  await b.permissionsReady();
  assert.equal(b.engine.enabled, false);
  assert.equal(b.engine.listening, false);
  assert.equal(b.instances.length, 0);
  b.engine.enable();
  b.advance();
  assert.equal(b.engine.listening, true);
  assert.equal(b.permissionQueries, 1);
});

test('unsupported microphone permission descriptors fall back to browser-managed recognition', async () => {
  const b = browser({ permissionState: 'prompt', permissionUnsupported: true });
  b.engine.enable();
  await b.permissionsReady();
  assert.equal(b.engine.listening, true);
  assert.equal(b.permissionQueries, 1);
  assert.equal(b.microphoneRequests, 0);
  b.engine.disable();
  b.advance();
  b.engine.enable();
  b.advance();
  assert.equal(b.instances.length, 1);
  assert.equal(b.permissionQueries, 1);
});

test('revoking saved permission stops capture without retrying in the background', async () => {
  const b = browser({ permissionState: 'granted' });
  b.engine.enable();
  await b.permissionsReady();
  b.changePermission('denied');
  b.advance(60000);
  assert.equal(b.engine.listening, false);
  assert.equal(b.starts, 1);
  assert.ok(b.states.some(({ state }) => state === 'permission'));
});

test('local files never request microphone access even when reported as a secure context', async () => {
  const b = browser({ protocol: 'file:', hostname: '', permissionState: 'granted' });
  b.engine.enable();
  b.engine.setWakeListening(true);
  await b.permissionsReady();
  b.engine.speak('Written controls remain available.');
  b.advance();
  b.finishSpeech();
  b.advance(60000);
  b.engine.interrupt();
  b.engine.disable();
  b.engine.enable();
  await b.permissionsReady();
  assert.equal(b.instances.length, 0);
  assert.equal(b.permissionQueries, 0);
  assert.equal(b.microphoneRequests, 0);
  assert.equal(b.engine.listening, false);
  assert.ok(b.errors.some(({ code, message }) => code === 'file-origin' && /localhost:3000/.test(message)));
});

test('temporary and unsupported grants never cause automatic native permission retries', async () => {
  for (const permissionUnsupported of [false, true]) {
    const b = browser({ permissionState: 'prompt', permissionUnsupported });
    b.engine.enable();
    await b.permissionsReady();
    for (const text of ['Check your prompt.', 'Please verify it.', 'Your question is ready.']) {
      b.engine.speak(text);
      b.advance();
      b.finishSpeech();
      b.advance(600);
    }
    assert.equal(b.starts, 1, 'Replies keep even a temporary native grant alive');
    assert.equal(b.engine.listening, true);
    b.end();
    b.advance(60000);
    assert.equal(b.starts, 1, 'A browser end must not start another permission dialog');
    assert.equal(b.engine.listening, false);
    assert.ok(b.states.some(({ state, detail }) => state === 'paused' && /Retry microphone/.test(detail)));
    b.engine.enable();
    b.advance();
    assert.equal(b.starts, 2, 'Explicit Retry may request one new native session');
    b.end();
    b.advance(60000);
    assert.equal(b.starts, 2);
    assert.equal(b.microphoneRequests, 0);
  }
});

test('restoring saved voice and wake preferences starts only an existing granted permission', async () => {
  for (const permissionState of ['granted', 'prompt']) {
    const b = browser({ permissionState });
    b.engine.setWakeListening(true, { requestPermission: false });
    b.engine.enable({ requestPermission: false });
    await b.permissionsReady();
    assert.equal(b.starts, permissionState === 'granted' ? 1 : 0);
    if (permissionState === 'prompt') {
      b.advance(60000);
      assert.equal(b.starts, 0);
      b.engine.enable();
      b.advance();
      assert.equal(b.starts, 1);
    }
  }
  const unknown = browser();
  unknown.engine.enable({ requestPermission: false });
  unknown.advance(60000);
  assert.equal(unknown.starts, 0, 'Missing Permissions API is not evidence of a saved grant');
  unknown.engine.interrupt();
  unknown.advance();
  assert.equal(unknown.starts, 1);
});

test('late finals from speech begun during read-aloud cannot become commands', () => {
  const b = browser();
  b.engine.enable();
  b.advance();
  const recognition = b.instances.at(-1);
  b.engine.speak('Please verify your care assistant prompt.');
  b.advance();
  recognition.onspeechstart();
  b.finishSpeech();
  b.advance(600);
  b.emit('open care assistant');
  assert.deepEqual(b.transcripts, []);
  recognition.onspeechstart();
  b.emit('open my care plan', { index: 1 });
  assert.deepEqual(b.transcripts, ['open my care plan']);
  assert.equal(b.starts, 1);
});

test('selected browser voice and speech rate apply to new utterances with a safe fallback', () => {
  const b = browser({ voices: [
    { lang: 'en-US', name: 'Local default', voiceURI: 'local-default', localService: true },
    { lang: 'en-GB', name: 'Preferred voice', voiceURI: 'preferred' }
  ] });
  b.engine.setSpeechOptions({ voiceURI: 'preferred', rate: 0.8, pitch: 1.2 });
  b.engine.enable();
  b.advance();
  b.engine.speak('Please review your question.');
  const preferred = b.synthesis.utterances.at(-1);
  assert.equal(preferred.voice.voiceURI, 'preferred');
  assert.equal(preferred.lang, 'en-GB');
  assert.equal(preferred.rate, 0.8);
  assert.equal(preferred.pitch, 1.2);
  b.engine.setSpeechOptions({ voiceURI: 'removed-browser-voice', rate: 9, pitch: 'invalid' });
  b.engine.speak('This uses an available browser voice.');
  const fallback = b.synthesis.utterances.at(-1);
  assert.equal(fallback.voice.voiceURI, 'local-default');
  assert.equal(fallback.rate, 1.5);
  assert.equal(fallback.pitch, 1.2);
  assert.equal(b.engine.getVoices().length, 2);
});

test('review actions are relevant only in a pending confirmation', () => {
  for (const [text, command] of [
    ['yes', 'confirm'], ['Confirm please', 'confirm'], ['Send it', 'confirm'],
    ['Yes save it', 'confirm'], ['Go ahead', 'confirm'], ['That is correct', 'confirm'],
    ['No', 'change'], ['Change it', 'change'], ['Edit', 'change'],
    ['Repeat', 'repeat'], ['Read it again', 'repeat'], ['Cancel', 'cancel']
  ]) {
    assert.equal(intents.parse(text, { pending: { kind: 'confirmation' } })?.command, command, text);
    assert.equal(intents.isRelevant(text, { pending: { kind: 'confirmation' } }), true, text);
  }
  assert.equal(intents.parse('yes'), null);
  assert.equal(intents.parse('send it'), null);
  assert.equal(intents.isRelevant('yes'), false);
  assert.equal(intents.isRelevant('Yes send Minecraft', { pending: { kind: 'confirmation' } }), false);
});

test('reading preference aliases produce commands the app can execute', () => {
  for (const [text, command] of [
    ['Dyslexia on', 'dyslexia mode on'],
    ['Disable dyslexia', 'disable dyslexia mode'],
    ['Turn dyslexia mode off', 'turn dyslexia mode off'],
    ['Reduce motion on', 'reduced motion on'],
    ['Switch reduce motion off', 'switch reduced motion off'],
    ['Reduced motion on', 'reduced motion on'],
    ['Dark mode on', 'dark mode on']
  ]) assert.equal(intents.parse(text)?.command, command, text);
});

test('plain symptom wording works in guided inputs while gaming discussion stays excluded', () => {
  for (const pending of [null, { kind: 'chat' }, { kind: 'plan-concern' }, { kind: 'symptom-name' }]) {
    for (const text of ['I am tired', 'I feel exhausted', 'I have exhaustion']) {
      assert.equal(intents.isRelevant(text, { pending }), true, text);
      if (pending) assert.equal(intents.parse(text, { pending })?.command, text);
    }
    for (const text of ['I am tired of Minecraft', 'I am exhausted from playing Minecraft', 'Lets play Minecraft']) {
      assert.equal(intents.isRelevant(text, { pending }), false, text);
      assert.equal(intents.parse(text, { pending }), null, text);
    }
  }
});
