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
