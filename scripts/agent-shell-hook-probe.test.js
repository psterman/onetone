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

var kinds = ['workbuddy', 'trae', 'qoder'];
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
