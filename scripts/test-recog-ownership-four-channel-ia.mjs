import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const file = path.join(
  root,
  'prototypes',
  'recog-ownership-after',
  'four-channel-ia.html'
);

assert.ok(fs.existsSync(file), 'four-channel-ia prototype must exist');
const html = fs.readFileSync(file, 'utf8');

assert.match(html, /命令中枢/, 'must name L0 hub');
assert.match(html, /data-stage="hub"/);
assert.match(html, /data-stage="pad"/);
assert.match(html, /data-stage="keys"/);
assert.match(html, /data-stage="voice"/);
assert.match(html, /data-stage="cam"/);
assert.match(html, /权威：盘面键位/);
assert.match(html, /权威：录键/);
assert.match(html, /权威：说法/);
assert.match(html, /权威：手势/);
assert.match(html, /不做混搭/);
assert.match(html, /L0/);
assert.match(html, /L1/);
assert.match(html, /L2/);
assert.match(html, /回命令中枢/);
assert.equal(
  (html.match(/data-stage="/g) || []).length,
  5,
  'hub + four channel stage buttons'
);

console.log('test-recog-ownership-four-channel-ia: ok');
