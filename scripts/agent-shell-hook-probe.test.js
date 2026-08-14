'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var probe = require('./agent-shell-hook-probe.js');

assert.strictEqual(probe.normalizeEvent({ hook_event_name: 'UserPromptSubmit' }), 'UserPromptSubmit');
assert.strictEqual(
  probe.normalizeEvent({
    hook_event_name: 'Notification',
    notification_type: 'permission_prompt'
  }),
  'PermissionRequest'
);
assert.strictEqual(
  probe.normalizeEvent({
    hookEventName: 'Notification',
    notificationType: 'permission_prompt',
    message: 'needs permission'
  }),
  'PermissionRequest'
);
assert.strictEqual(probe.normalizeEvent({ hook_event_name: 'BeforeTool' }), 'PreToolUse');
assert.strictEqual(probe.normalizeEvent({ hook_event_name: 'BeforeAgent' }), 'UserPromptSubmit');
assert.strictEqual(probe.normalizeEvent({ hook_event_name: 'AfterTool' }), 'PostToolUse');
assert.strictEqual(probe.normalizeEvent({ hook_event_name: 'AfterAgent' }), 'Stop');
assert.strictEqual(probe.normalizeEvent({ hook_event_name: 'TaskComplete' }), 'Stop');
assert.strictEqual(
  probe.normalizeEvent({ hook_event_name: 'TaskCancel' }),
  'StopFailure'
);
assert.strictEqual(probe.normalizeEvent({ hook_event_name: 'TaskError' }), 'StopFailure');
assert.ok(probe.ALLOWED.copilot_cli && probe.ALLOWED.gemini, 'ALLOWED includes copilot_cli + gemini');
assert.ok(probe.ALLOWED.cline && probe.ALLOWED.aider, 'ALLOWED includes cline + aider');

var kinds = ['workbuddy', 'trae', 'qoder', 'copilot_cli', 'gemini', 'cline', 'aider'];
kinds.forEach(function (kind) {
  var fields = probe.extractSafeFields({
    hook_event_name: 'Stop',
    session_id: 's-' + kind,
    prompt: 'must not leave'
  });
  assert.strictEqual(fields.hook_event_name, 'Stop');
  assert.strictEqual(fields.session_id, 's-' + kind);
  assert.ok(!Object.prototype.hasOwnProperty.call(fields, 'prompt'));
  var body = probe.buildPostBody(kind, fields);
  assert.strictEqual(body.source, kind + '_hook');
  assert.strictEqual(body.event, 'Stop');
  assert.strictEqual(body.sessionId, 's-' + kind);
});

var temp = path.join(os.tmpdir(), 'onetone-shell-hook-' + process.pid + '.jsonl');
probe
  .run({
    source: 'workbuddy',
    stdinText: JSON.stringify({
      hook_event_name: 'Notification',
      notification_type: 'permission_prompt',
      session_id: 'wb-1'
    }),
    jsonlPath: temp,
    skipPost: true
  })
  .then(function (result) {
    assert.strictEqual(result.kind, 'workbuddy');
    assert.strictEqual(result.body.source, 'workbuddy_hook');
    assert.strictEqual(result.body.event, 'PermissionRequest');
    var row = JSON.parse(fs.readFileSync(temp, 'utf8').trim());
    assert.strictEqual(row.hook_event_name, 'PermissionRequest');
    fs.unlinkSync(temp);
    console.log('agent-shell-hook-probe tests passed');
  });
