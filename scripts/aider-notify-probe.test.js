'use strict';

var assert = require('assert');
var path = require('path');
var os = require('os');
var probe = require('./aider-notify-probe.js');

probe
  .run({
    source: 'aider',
    stdinText: JSON.stringify({ text: 'secret prompt must not leak' }),
    jsonlPath: path.join(os.tmpdir(), 'aider-probe-test.jsonl'),
    skipPost: true
  })
  .then(function (r) {
    assert.strictEqual(r.body.source, 'aider_hook');
    assert.strictEqual(r.body.event, 'Stop');
    assert.strictEqual(r.fields.hook_event_name, 'Stop');
    console.log('aider-notify-probe tests passed');
  });
