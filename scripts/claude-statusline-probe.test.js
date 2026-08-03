'use strict';

var assert = require('assert');
var path = require('path');
var probe = require(path.join(__dirname, 'claude-statusline-probe.js'));

var body = probe.extractStatusLineBody({
  session_id: 's1',
  cwd: 'C:/secret',
  cost: { total_cost_usd: 1.23 },
  context_window: { used_percentage: 40 },
  model: { id: 'claude-opus', display_name: 'Opus' },
  rate_limits: {
    five_hour: { used_percentage: 24, resets_at: 1700000000 },
    seven_day: { used_percentage: 41, resets_at: 1700600000 }
  }
});
assert.deepStrictEqual(Object.keys(body).sort(), ['model', 'rate_limits', 'session_id']);
assert.strictEqual(body.session_id, 's1');
assert.deepStrictEqual(body.model, { id: 'claude-opus' });
assert.strictEqual(body.rate_limits.five_hour.used_percentage, 24);
assert.ok(!('cost' in body));
assert.ok(!('context_window' in body));
assert.ok(!('cwd' in body));

assert.strictEqual(probe.pickRateWindow(null), null);
assert.strictEqual(probe.pickRateWindow({ usedPercentage: 10, resetsAt: 1 }).used_percentage, 10);

probe
  .run({ skipPost: true, stdinText: '{"session_id":"x"}' })
  .then(function (r) {
    assert.strictEqual(r.stdout, '');
    assert.strictEqual(r.body.session_id, 'x');
    console.log('claude-statusline-probe tests passed');
  })
  .catch(function (err) {
    console.error(err);
    process.exit(1);
  });
