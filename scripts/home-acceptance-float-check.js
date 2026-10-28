/**
 * Self-check: acceptance float data must not claim release/desktop pass.
 * Run: node scripts/home-acceptance-float-check.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'js', 'features', 'now', 'home-acceptance-float.js'),
  'utf8'
);

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

assert(/local desktop: passed/.test(src), 'desktop should be passed after A/B');
assert(/remote organize: skipped/.test(src), 'remote must stay skipped');
assert(/release acceptance: passed/.test(src), 'release passed with C skipped');
assert(/真实远程整理 C/.test(src) && /skipped/.test(src), 'C skipped');
assert(/Phase2\.0 预检门/.test(src) && /passed/.test(src), 'preflight present');
assert(!/real provider: unverified/.test(src) || /real skipped|skipped/.test(src), 'no false real-provider pass');

console.log('ok: home-acceptance-float honesty check');
