const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../medical-tools.js'), 'utf8'), context);
const medical = context.window.CareMedical;
const names = text => Array.from(medical.glossaryMatches(text), match => match[0]);

test('recognizes report abbreviations, punctuation, and alternate spellings', () => {
  const found = names('CBC: Hgb 10.5. HbA1c 6.2. eGFR >60. EKG WNL. Anaemia and oedema.');
  for (const term of ['CBC', 'hemoglobin', 'A1C', 'eGFR', 'ECG / EKG', 'within normal limits', 'anemia', 'edema']) {
    assert.ok(found.includes(term), `Missing explanation for ${term}`);
  }
});

test('terms match complete words, avoiding unrelated substring false positives', () => {
  const found = names('The alternate meeting is at the post office with a bidirectional diagram.');
  assert.ok(!found.includes('ALT'), 'alternate is not ALT');
  assert.ok(!found.includes('POTS'), 'post is not POTS');
  assert.ok(!found.includes('BID'), 'bidirectional is not BID');
  assert.ok(!found.includes('PO'), 'post is not PO');
});

test('a lab value gets wording help and requires units and clinical context', () => {
  const explanation = medical.explainLocal('Creatinine 1.9; Hgb 10.5; TSH 4.8.');
  assert.match(explanation, /kidney function/i);
  assert.match(explanation, /thyroid/i);
  assert.match(explanation, /reference range/i);
  assert.match(explanation, /does not diagnose/i);
  assert.doesNotMatch(explanation, /you have (?:kidney|thyroid|anemia)/i);
});

test('negated and tentative findings are not presented as personal diagnoses', () => {
  const explanation = medical.explainLocal('No acute findings. Rule out anemia. Possible POTS.');
  assert.match(explanation, /no new|did not identify a new/i);
  assert.match(explanation, /do not|does not mean you have/i);
  assert.match(explanation, /rule out/i);
});

test('unrecognized input is acknowledged with a next step', () => {
  const explanation = medical.explainLocal('Unrecognized report wording 42');
  assert.match(explanation, /received your notes/i);
  assert.match(explanation, /could not match/i);
  assert.match(explanation, /full sentence/i);
  assert.match(explanation, /clinician/i);
  assert.match(explanation, /numbers/i);
});

test('specific diagnoses take priority over a general shared alias', () => {
  assert.equal(medical.matchConditions('I need care for rheumatoid arthritis')[0].id, 'ra');
  assert.equal(medical.matchConditions('Help me with Ehlers Danlos')[0].id, 'eds');
  assert.equal(medical.matchConditions('P O T S')[0].id, 'pots');
  assert.equal(medical.matchConditions('Crohn’s disease')[0].id, 'crohns');
  assert.equal(medical.matchConditions('multiple sclerosis')[0].id, 'ms');
  assert.equal(medical.matchConditions('IBD')[0].id, 'ibd');
  assert.equal(medical.matchConditions('HSD')[0].id, 'hsd');
  assert.equal(medical.matchConditions('osteopenia')[0].id, 'osteopenia');
  assert.deepEqual(Array.from(medical.matchConditions('rheumatoid arthritis'), entry => entry.id), ['ra']);
  assert.deepEqual(Array.from(medical.matchConditions('rheumatoid arthritis and osteoarthritis'), entry => entry.id), ['ra', 'arthritis']);
});

test('condition library covers broad specialties with public HTTPS resources', () => {
  for (const query of ['diabetes', 'asthma', 'migraine', 'cancer', 'depression', 'thyroid', 'kidney disease', 'PTSD', 'ME/CFS', 'long covid']) {
    const condition = medical.matchConditions(query)[0];
    assert.ok(condition, `Missing condition ${query}`);
    assert.ok(condition.specialties.length > 0);
    assert.ok(condition.resources.length > 0);
    for (const resource of condition.resources) {
      assert.equal(new URL(resource.url).protocol, 'https:');
      assert.ok(resource.name && resource.description);
    }
  }
  assert.equal(new Set(Array.from(medical.conditions, entry => entry.id)).size, medical.conditions.length);
});

test('specialist search understands doctor titles, multiword order, aliases and small spelling mistakes', () => {
  for (const [query, id] of [
    ['rheumatoid arthritis', 'ra'], ['arthritis rheumatoid', 'ra'], ['rheumatoid arthrits', 'ra'],
    ['migriane', 'migraine'], ['Céliac', 'celiac'], ['Crohn’s disease', 'crohns'],
    ['multiple-sclerosis', 'ms'], ['MS', 'ms'], ['RA', 'ra'], ['migraines', 'migraine'],
    ['asthma pulmonologist', 'asthma'], ['kidney doctor', 'kidney']
  ]) {
    assert.equal(medical.searchConditions(query)[0]?.id, id, query);
  }
  for (const query of ['cardiologist', 'cardioligist', 'heart doctor']) {
    const results = Array.from(medical.searchConditions(query));
    assert.ok(results.some(entry => entry.id === 'heart'), query);
    assert.ok(results.every(entry => entry.specialties.includes('cardiology')), query);
  }
  for (const query of ['dermatologist', 'skin doctor']) {
    assert.ok(Array.from(medical.searchConditions(query)).every(entry => entry.specialties.includes('dermatology')), query);
  }
});

test('search does not guess unsupported conditions or confuse similar specialty names', () => {
  assert.equal(medical.searchConditions('unlisted condition xyz').length, 0);
  assert.equal(medical.searchConditions('ENT').length, 0);
  assert.deepEqual(Array.from(medical.searchConditions('nephrology'), entry => entry.id), ['kidney']);
  assert.deepEqual(Array.from(medical.searchConditions('IBD'), entry => entry.id), ['ibd']);
  assert.equal(medical.searchConditions('').length, medical.conditions.length);
  // Search suggestions do not weaken exact medical text matching.
  assert.equal(medical.matchConditions('migriane').length, 0);
});

function decoderBrowser(config = {}) {
  class Element {
    constructor() { this.value = ''; this.disabled = false; this.hidden = false; this.children = []; this.attributes = {}; this.listeners = {}; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = [...nodes]; }
    setAttribute(name, value) { this.attributes[name] = value; }
    removeAttribute(name) { delete this.attributes[name]; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    focus() {}
  }
  const nodes = Object.fromEntries(['#medical-text', '#decode', '#decode-result', '#decoder-save'].map(selector => [selector, new Element()]));
  const window = { document: { querySelector: selector => nodes[selector] || null, createElement: () => new Element() } };
  const local = vm.createContext({ window });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../medical-tools.js'), 'utf8'), local);
  window.CareMedical.init(config);
  return { nodes, medical: window.CareMedical };
}

test('decoder asks for review before making an AI request or showing an explanation', async () => {
  let calls = 0;
  let approve;
  const b = decoderBrowser({
    review: details => {
      assert.equal(details.field, '#medical-text');
      assert.equal(details.summary, 'Hgb 10.5');
      return new Promise(resolve => { approve = resolve; });
    },
    ai: async () => { calls++; return { text: 'Reviewed explanation.' }; }
  });
  b.nodes['#medical-text'].value = 'Hgb 10.5';
  const pending = b.medical.decode();
  assert.equal(calls, 0);
  assert.equal(b.nodes['#decode-result'].children.length, 0);
  approve(false);
  assert.equal(await pending, false);
  assert.equal(calls, 0);
  assert.equal(b.nodes['#decode'].disabled, false);
});

test('changing notes during a review cancels the old submission', async () => {
  let calls = 0;
  let approve;
  const b = decoderBrowser({
    review: () => new Promise(resolve => { approve = resolve; }),
    ai: async () => { calls++; return { text: 'Old explanation.' }; }
  });
  b.nodes['#medical-text'].value = 'Hgb 10.5';
  const pending = b.medical.decode();
  b.nodes['#medical-text'].value = 'TSH 4.8';
  b.nodes['#medical-text'].listeners.input();
  approve(true);
  assert.equal(await pending, false);
  assert.equal(calls, 0);
  assert.equal(b.nodes['#decode'].disabled, false);
});

test('a follow-up question is not saved until its review is confirmed', async () => {
  let approved = true;
  const tasks = [];
  const b = decoderBrowser({ review: async () => approved, addTask: text => tasks.push(text) });
  b.nodes['#medical-text'].value = 'CBC and Hgb 10.5';
  assert.equal(await b.medical.decode(), true);
  approved = false;
  await b.nodes['#decoder-save'].onclick();
  assert.equal(tasks.length, 0);
  approved = true;
  await b.nodes['#decoder-save'].onclick();
  assert.equal(tasks.length, 1);
  assert.match(tasks[0], /hemoglobin|CBC/);
});
