const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
for (const file of ['medical-tools.js', 'care-assistant.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
}
const assistant = context.window.CareAssistant;
const user = content => ({ role: 'user', content });
const generic = 'I can help explain medical terms and conditions, find specialist resources';

test('everyday symptom descriptions receive distinct guidance without inferring diagnoses', () => {
  const replies = new Set();
  for (const [prompt, topic, expected] of [
    ['I feel tired all the time', 'fatigue', /sleep|activity/i],
    ['My head hurts', 'headache', /headache/i],
    ['I keep getting dizzy when I stand up', 'dizziness', /standing up/i],
    ['My stomach has been hurting', 'stomach', /digestive/i],
    ['I cannot sleep well', 'sleep', /sleep/i],
    ['I have an itchy rash', 'skin', /skin/i],
    ['My knee has been sore', 'pain', /pain/i]
  ]) {
    const reply = assistant.respond(prompt, { conditions: ['POTS / dysautonomia'] });
    assert.equal(reply.topic, topic, prompt);
    assert.equal(reply.emergency, false);
    assert.match(reply.text, expected);
    assert.match(reply.text, /\?$/);
    assert.ok(!reply.text.includes(generic));
    assert.doesNotMatch(reply.text, /you (?:have|probably have|must have) (?:POTS|migraine|anemia)/i);
    assert.doesNotMatch(reply.text, /POTS|dysautonomia/i, 'A profile selection is not a symptom diagnosis');
    replies.add(reply.text);
  }
  assert.equal(replies.size, 7);
});

test('plural and informal medication wording works without choosing doses or changing treatment', () => {
  for (const prompt of ['Help me understand my medicines', 'I have questions about my meds', 'Can I stop taking these pills?', 'How many tablets should I take?']) {
    const reply = assistant.respond(prompt);
    assert.equal(reply.topic, 'medication', prompt);
    assert.match(reply.text, /pharmacist|clinician/i);
    assert.doesNotMatch(reply.text, /take \d|stop taking|increase (?:your|the) dose/i);
  }
  assert.match(assistant.respond('Can I increase my dose?').text, /cannot choose a dose/i);
});

test('flexible care logistics route to the requested topic', () => {
  for (const [prompt, topic, expected] of [
    ['How can I get ready for my checkup?', 'visit', /bring your symptom timeline/i],
    ['What questions should I ask my doctor?', 'visit', /what tests or referrals/i],
    ['I need help paying for medical care', 'costs', /financial assistance|payment plans/i],
    ['What if my insurance will not cover the visit?', 'costs', /in network/i],
    ['Could I get an interpreter for my appointment?', 'accessibility', /interpreter/i],
    ['How do I keep track of my symptoms?', 'tracking', /symptom record/i]
  ]) {
    const reply = assistant.respond(prompt);
    assert.equal(reply.topic, topic, prompt);
    assert.match(reply.text, expected);
    assert.ok(!reply.text.includes(generic));
  }
});

test('named condition questions reuse the actual medical library', () => {
  const reply = assistant.respond('What is POTS?');
  assert.equal(reply.topic, 'condition');
  assert.match(reply.text, /excessive rise in heart rate when standing/i);
  assert.match(reply.text, /does not establish a diagnosis/i);
  assert.match(reply.text, /Dysautonomia International/i);
  const natural = assistant.respond('I have questions about POTS');
  assert.equal(natural.topic, 'condition');
  assert.match(natural.text, /excessive rise in heart rate/i);
  const term = assistant.respond('I have questions about hemoglobin');
  assert.equal(term.topic, 'term');
  assert.match(term.text, /hemoglobin/i);
});

test('follow-up specialist and visit questions reference the discussed condition', () => {
  const messages = [user('What is POTS?'), { role: 'assistant', content: 'A condition explanation.' }];
  const specialist = assistant.respond('Which specialist handles that?', { messages });
  assert.equal(specialist.topic, 'specialist');
  assert.match(specialist.text, /POTS.*cardiology/i);
  const visit = assistant.respond('What should I ask my doctor?', { messages });
  assert.equal(visit.topic, 'visit');
  assert.match(visit.text, /visit about POTS/i);
  assert.match(visit.text, /What could explain this/i);
  assert.match(assistant.respond('Tell me more', { messages }).text, /POTS/);
});

test('a new topic takes precedence over earlier conditions and follow-up context', () => {
  const messages = [user('What is POTS?')];
  const next = assistant.respond('What is migraine?', { messages });
  assert.match(next.text, /Migraine/);
  assert.doesNotMatch(next.text, /POTS/);
  for (const [prompt, topic] of [['I need help with my medicines', 'medication'], ['My head hurts', 'headache'], ['Can I afford my visit?', 'costs']]) {
    const reply = assistant.respond(prompt, { messages });
    assert.equal(reply.topic, topic);
    assert.doesNotMatch(reply.text, /POTS/);
  }
  const switched = assistant.respond('Which doctor should I see?', { messages: [...messages, user('What is asthma?')] });
  assert.match(switched.text, /Asthma.*pulmonology/i);
  assert.doesNotMatch(switched.text, /POTS/);
});

test('ordinary unknown text and greetings never inherit a previous diagnosis', () => {
  const messages = [user('What is POTS?')];
  for (const prompt of ['Hello', 'Thank you', 'Can you help with chart frobnication?', 'Explain this frobnication', 'Tell me a Minecraft crafting recipe', 'Tell me more about Minecraft', 'Which specialist handles Minecraft?']) {
    const reply = assistant.respond(prompt, { messages });
    assert.doesNotMatch(reply.text, /POTS|dysautonomia/i);
    assert.match(reply.text, /\?$/);
    assert.ok(!reply.text.includes(generic));
  }
  assert.match(assistant.respond('Can you help with chart frobnication?').text, /chart frobnication/);
});

test('bounded history and changed subjects do not resurrect old condition context', () => {
  const bounded = assistant.respond('Which doctor should I see?', {
    messages: [user('What is POTS?'), user('Which specialist handles that?'), user('What should I ask?'), user('Tell me more')]
  });
  assert.doesNotMatch(bounded.text, /POTS/);
  const changed = assistant.respond('Which doctor should I see?', {
    messages: [user('What is POTS?'), user('Tell me a Minecraft recipe')]
  });
  assert.doesNotMatch(changed.text, /POTS/);
  assert.match(changed.text, /What condition or concern/i);
  for (const changedSubject of ['Explain this frobnication', 'Which specialist handles frobnication?', 'Tell me more about Minecraft']) {
    const reply = assistant.respond('Tell me more', { messages: [user('What is POTS?'), user(changedSubject)] });
    assert.doesNotMatch(reply.text, /POTS/);
  }
});

test('symptom follow-ups suggest care navigation without guessing a condition or specialist', () => {
  const reply = assistant.respond('Which doctor should I see?', { messages: [user('I get dizzy when I stand up')] });
  assert.equal(reply.topic, 'specialist');
  assert.match(reply.text, /primary care clinician/i);
  assert.match(reply.text, /dizziness/i);
  assert.doesNotMatch(reply.text, /POTS|cardiology|neurology/i);
  const named = assistant.respond('I have asthma and my head hurts');
  assert.equal(named.topic, 'headache');
  assert.match(named.text, /headache/);
  assert.doesNotMatch(named.text, /you have migraine/i);
});

test('a short timing answer is understood only after the corresponding symptom question', () => {
  const first = assistant.respond('My head hurts');
  const reply = assistant.respond('Yesterday', {
    messages: [user('My head hurts'), { role: 'assistant', content: first.text }]
  });
  assert.equal(reply.topic, 'headache');
  assert.match(reply.text, /Yesterday.*headache/i);
  assert.match(reply.text, /timing.*severity.*triggers/i);
  assert.doesNotMatch(reply.text, /migraine|POTS/);
  assert.equal(assistant.respond('Yesterday').topic, 'clarification');
  const unrelated = assistant.respond('Yesterday', {
    messages: [user('My head hurts'), { role: 'assistant', content: 'Which insurance plan do you use?' }]
  });
  assert.equal(unrelated.topic, 'clarification');
});

test('glossary and unknown report replies preserve the limits of lab-number interpretation', () => {
  const reply = assistant.respond('What does hemoglobin 10.5 mean?');
  assert.equal(reply.topic, 'term');
  assert.match(reply.text, /hemoglobin/i);
  assert.match(reply.text, /units.*reference range.*clinical context/i);
  assert.doesNotMatch(reply.text, /you have anemia|normal|abnormal/i);
  const unknown = assistant.respond('My report says low iron');
  assert.equal(unknown.topic, 'term');
  assert.match(unknown.text, /exact test name|reference range/i);
  assert.doesNotMatch(unknown.text, /you have anemia/i);
});

test('personal emergency wording always receives immediate help guidance', () => {
  for (const prompt of ['I have chest pain now', 'I can’t breathe and my chest hurts', 'I can not breathe', 'I am struggling to breathe', 'I am having trouble breathing', 'It is hard to breathe', 'I am suicidal', 'I want to hurt myself', 'I am thinking about harming myself', 'I took an overdose', 'I took too many pills']) {
    assert.equal(assistant.isEmergency(prompt), true, prompt);
    const reply = assistant.respond(prompt);
    assert.equal(reply.emergency, true);
    assert.equal(reply.topic, 'emergency');
    assert.match(reply.text, /emergency services right away/i);
  }
  assert.equal(assistant.isEmergency('How can I prepare for a visit?'), false);
});

test('profile conditions are used only when the user asks about their selected profile', () => {
  const reply = assistant.respond('Can you explain my selected conditions?', { conditions: ['POTS / dysautonomia', 'Migraine'] });
  assert.equal(reply.topic, 'profile');
  assert.match(reply.text, /POTS.*Migraine/i);
  assert.match(reply.text, /does not confirm a diagnosis/i);
});
