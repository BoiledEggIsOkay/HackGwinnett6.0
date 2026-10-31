const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { parseEnv, loadEnvFile } = require('../env-loader.js');

test('reads dotenv configuration as literal data without evaluating commands', () => {
  const values = parseEnv([
    '# A comment',
    'export OPENAI_API_KEY="test-only-key" # configuration',
    "SINGLE='a # quoted value'",
    'MODEL = example-model # model note',
    'EMPTY= # intentionally unset',
    'LITERAL=$(echo should-not-run)',
    'REFERENCE=${OPENAI_API_KEY}',
    'MULTILINE="first\\nsecond"',
    'INVALID KEY=ignored',
    'UNFINISHED="skip this'
  ].join('\n'));
  assert.deepEqual({ ...values }, {
    OPENAI_API_KEY: 'test-only-key',
    SINGLE: 'a # quoted value',
    MODEL: 'example-model',
    EMPTY: '',
    LITERAL: '$(echo should-not-run)',
    REFERENCE: '${OPENAI_API_KEY}',
    MULTILINE: 'first\nsecond'
  });
});

test('hosting environment values take precedence and missing .env is harmless', t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'care-compass-env-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  const filename = path.join(folder, '.env');
  assert.equal(loadEnvFile(filename, {}), false);
  fs.writeFileSync(filename, 'OPENAI_API_KEY=file-test-key\nOPENAI_MODEL=file-model\nPORT=3000\n');
  const environment = { OPENAI_API_KEY: '', PORT: '4000' };
  assert.equal(loadEnvFile(filename, environment), true);
  assert.deepEqual(environment, { OPENAI_API_KEY: '', PORT: '4000', OPENAI_MODEL: 'file-model' });
});

test('server automatically discovers an ignored project .env without any exports', async t => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'care-compass-env-server-'));
  t.after(() => fs.rmSync(folder, { recursive: true, force: true }));
  for (const file of ['server.js', 'env-loader.js', 'site-config.js']) {
    fs.copyFileSync(path.join(__dirname, '..', file), path.join(folder, file));
  }
  fs.writeFileSync(path.join(folder, '.env'), 'OPENAI_API_KEY=test-only-dotenv-key\nPORT=0\n');
  const environment = { ...process.env };
  for (const key of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'PORT']) delete environment[key];
  const child = spawn(process.execPath, [path.join(folder, 'server.js')], {
    cwd: folder, env: environment, stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(async () => {
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited;
    }
  });
  let output = '';
  const baseURL = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Temporary server did not start.')), 5000);
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/localhost:(\d+)/);
      if (match) { clearTimeout(timer); resolve(`http://127.0.0.1:${match[1]}`); }
    });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('Temporary server exited.')); });
  });
  const response = await fetch(`${baseURL}/api/ai/status`);
  assert.deepEqual(await response.json(), { available: true });
  assert.equal((await fetch(`${baseURL}/.env`)).status, 404);
  assert.equal((await fetch(`${baseURL}/env-loader.js`)).status, 404);
});
