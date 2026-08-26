'use strict';

var assert = require('assert');
var path = require('path');
var os = require('os');
var shared = require('./agent-shell-hook-probe.js');

assert.strictEqual(shared.normalizeEvent({ hook_event_name: 'TaskComplete' }), 'Stop');
assert.strictEqual(shared.normalizeEvent({ hook_event_name: 'TaskError' }), 'StopFailure');

shared
  .run({
    source: 'roo',
    stdinText: JSON.stringify({ hook_event_name: 'TaskComplete', session_id: 'roo-1' }),
    jsonlPath: path.join(os.tmpdir(), 'roo-probe-test.jsonl'),
    skipPost: true
  })
  .then(function (r) {
    assert.strictEqual(r.body.source, 'roo_hook');
    assert.strictEqual(r.body.event, 'Stop');
    console.log('roo-hook-probe tests passed');
  });
