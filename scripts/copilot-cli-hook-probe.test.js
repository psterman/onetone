'use strict';

var assert = require('assert');
var path = require('path');
var shared = require('./agent-shell-hook-probe.js');

var fields = shared.extractSafeFields({
  hook_event_name: 'UserPromptSubmit',
  session_id: 'cp-t1',
  prompt: 'secret'
});
assert.ok(!Object.prototype.hasOwnProperty.call(fields, 'prompt'));
var body = shared.buildPostBody('copilot_cli', fields);
assert.strictEqual(body.source, 'copilot_cli_hook');
assert.strictEqual(body.event, 'UserPromptSubmit');

shared
  .run({
    source: 'copilot_cli',
    stdinText: JSON.stringify({
      hook_event_name: 'PermissionRequest',
      session_id: 'cp-t2'
    }),
    jsonlPath: path.join(require('os').tmpdir(), 'copilot-cli-probe-test.jsonl'),
    skipPost: true
  })
  .then(function (r) {
    assert.strictEqual(r.body.source, 'copilot_cli_hook');
    assert.strictEqual(r.body.event, 'PermissionRequest');
    console.log('copilot-cli-hook-probe tests passed');
  });
