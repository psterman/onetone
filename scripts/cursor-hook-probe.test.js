'use strict';

var assert = require('assert');
var fs = require('fs');
var os = require('os');
var path = require('path');
var probe = require('./cursor-hook-probe.js');

var fields = probe.extractSafeFields({
  hook_event_name: 'beforeSubmitPrompt',
  conversation_id: 'conversation-1',
  generation_id: 'generation-1',
  model: 'default',
  prompt: 'must not leave the probe',
  workspace_roots: ['E:/voice-pilot'],
  composer_mode: 'agent'
});
assert.strictEqual(fields.event, 'beforeSubmitPrompt');
assert.strictEqual(fields.sessionId, 'conversation-1');
assert.strictEqual(fields.turnId, 'generation-1');
assert.strictEqual(fields.model, 'default');
assert.strictEqual(fields.workspace, 'E:/voice-pilot');
assert.strictEqual(fields.composerMode, 'agent');
assert.ok(!Object.prototype.hasOwnProperty.call(fields, 'prompt'));
var body = probe.buildPostBody(fields);
assert.strictEqual(body.source, 'cursor_hook');
assert.strictEqual(body.model, 'default');
assert.strictEqual(body.event, 'beforeSubmitPrompt');
assert.strictEqual(body.sessionId, 'conversation-1');
assert.strictEqual(body.workspace, 'E:/voice-pilot');
assert.ok(!Object.prototype.hasOwnProperty.call(body, 'prompt'));

var toolFields = probe.extractSafeFields({
  hook_event_name: 'preToolUse',
  conversation_id: 'c1',
  tool_name: 'Shell',
  agent_message: 'Installing dependencies...',
  tool_input: { command: 'npm install' },
  tool_output: 'secret output'
});
assert.strictEqual(toolFields.toolName, 'Shell');
assert.strictEqual(toolFields.agentMessage, 'Installing dependencies...');
assert.ok(!Object.prototype.hasOwnProperty.call(toolFields, 'tool_input'));
assert.ok(!Object.prototype.hasOwnProperty.call(toolFields, 'tool_output'));
var toolBody = probe.buildPostBody(toolFields);
assert.strictEqual(toolBody.toolName, 'Shell');
assert.ok(!JSON.stringify(toolBody).includes('npm install'));
assert.ok(!JSON.stringify(toolBody).includes('secret output'));

var longMsg = 'x'.repeat(probe.AGENT_MESSAGE_MAX + 40);
var trunc = probe.extractSafeFields({
  hook_event_name: 'preToolUse',
  agent_message: longMsg
});
assert.strictEqual(trunc.agentMessage.length, probe.AGENT_MESSAGE_MAX);

var editFields = probe.extractSafeFields({
  hook_event_name: 'afterFileEdit',
  file_path: 'E:/voice-pilot/src/app.js',
  edits: [{ old_string: 'a', new_string: 'b' }]
});
assert.strictEqual(editFields.filePath, 'app.js');
assert.ok(!Object.prototype.hasOwnProperty.call(editFields, 'edits'));

var stopCompleted = probe.extractSafeFields({
  hook_event_name: 'stop',
  status: 'completed'
});
assert.strictEqual(stopCompleted.stopStatus, 'completed');
var stopError = probe.extractSafeFields({
  hook_event_name: 'stop',
  status: 'error'
});
assert.strictEqual(stopError.stopStatus, 'error');
var sessionEnd = probe.extractSafeFields({
  hook_event_name: 'sessionEnd',
  reason: 'user_close'
});
assert.strictEqual(sessionEnd.stopStatus, 'user_close');

assert.deepStrictEqual(probe.buildStdoutResponse('beforeSubmitPrompt'), { continue: true });
assert.deepStrictEqual(probe.buildStdoutResponse('subagentStart'), { permission: 'allow' });
assert.deepStrictEqual(probe.buildStdoutResponse('preToolUse'), { permission: 'allow' });
assert.deepStrictEqual(probe.buildStdoutResponse('stop'), {});
assert.deepStrictEqual(probe.buildStdoutResponse('afterFileEdit'), {});
assert.deepStrictEqual(probe.buildStdoutResponse(''), {
  continue: true,
  permission: 'allow'
});

var trailing = probe.parseHookInput(
  '{"hook_event_name":"stop","conversation_id":"c1"}\n{"extra":true}'
);
assert.strictEqual(trailing.ok, true);
assert.strictEqual(trailing.value.hook_event_name, 'stop');

var salvage = probe.parseHookInput('{ "hook_event_name": "afterAgentResponse", "text": "broken');
assert.strictEqual(salvage.value.hook_event_name, 'afterAgentResponse');

var temp = path.join(os.tmpdir(), 'onetone-cursor-hook-' + process.pid + '.jsonl');
probe
  .run({
    stdinText: JSON.stringify({
      hook_event_name: 'stop',
      status: 'aborted',
      text: 'must not land',
      prompt: 'secret'
    }),
    jsonlPath: temp,
    skipPost: true,
    skipStdout: true
  })
  .then(function () {
    var row = JSON.parse(fs.readFileSync(temp, 'utf8').trim());
    assert.strictEqual(row.event, 'stop');
    assert.strictEqual(row.stopStatus, 'aborted');
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'text'));
    assert.ok(!Object.prototype.hasOwnProperty.call(row, 'prompt'));
    fs.unlinkSync(temp);
    console.log('cursor-hook-probe tests passed');
  });
