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
assert(/GUIDE_P25/.test(src) && /p25_a1/.test(src), 'Phase2.5 A′ guide present');
assert(/p25-check-no-grant/.test(src) && /checkNoGrant/.test(src), 'A′.2 no-grant self-check');
assert(/2\.5 桌面未 passed/.test(src), 'must not claim Phase2.5 desktop passed in floater chrome');
assert(/勿在未齐证据时改审计 passed/.test(src), 'P25 banner warns against premature audit pass');

console.log('ok: home-acceptance-float honesty check');
