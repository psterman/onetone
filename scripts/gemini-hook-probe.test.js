'use strict';

var assert = require('assert');
var path = require('path');
var os = require('os');
var shared = require('./agent-shell-hook-probe.js');

assert.strictEqual(shared.normalizeEvent({ hook_event_name: 'BeforeTool' }), 'PreToolUse');
assert.strictEqual(shared.normalizeEvent({ hook_event_name: 'AfterTool' }), 'PostToolUse');
assert.strictEqual(shared.normalizeEvent({ hook_event_name: 'AfterAgent' }), 'Stop');

shared
  .run({
    source: 'gemini',
    stdinText: JSON.stringify({
      hook_event_name: 'BeforeTool',
      session_id: 'g-t1',
      tool_name: 'write_file'
    }),
    jsonlPath: path.join(os.tmpdir(), 'gemini-probe-test.jsonl'),
    skipPost: true
  })
  .then(function (r) {
    assert.strictEqual(r.body.source, 'gemini_hook');
    assert.strictEqual(r.body.event, 'PreToolUse');
    console.log('gemini-hook-probe tests passed');
  });
