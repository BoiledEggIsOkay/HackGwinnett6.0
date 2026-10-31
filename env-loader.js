'use strict';

const fs = require('node:fs');

// Read configuration as data. This does not evaluate shell commands, expand
// variables, or replace environment values supplied by a hosting platform.
function parseEnv(text) {
  const values = Object.create(null);
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (/^["']/.test(raw)) {
      const quote = raw[0];
      const quoted = raw.match(quote === '"' ? /^"((?:\\.|[^"\\])*)"\s*(?:#.*)?$/ : /^'([^']*)'\s*(?:#.*)?$/);
      if (!quoted) continue;
      values[key] = quote === '"' ? quoted[1].replace(/\\(n|r|t|"|\\)/g, (_, escape) =>
        ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' })[escape]) : quoted[1];
    } else {
      values[key] = raw.replace(/(?:^|\s+)#.*$/, '').trim();
    }
  }
  return values;
}

function loadEnvFile(filename, environment = process.env) {
  let contents;
  try { contents = fs.readFileSync(filename, 'utf8'); }
  catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
  const values = parseEnv(contents);
  for (const [key, value] of Object.entries(values)) {
    if (!Object.prototype.hasOwnProperty.call(environment, key)) environment[key] = value;
  }
  return true;
}

module.exports = { parseEnv, loadEnvFile };
