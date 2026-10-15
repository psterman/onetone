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
  prompt: 'must not leave the probe'
});
assert.strictEqual(fields.event, 'beforeSubmitPrompt');
assert.strictEqual(fields.sessionId, 'conversation-1');
assert.strictEqual(fields.turnId, 'generation-1');
assert.strictEqual(fields.model, 'default');
assert.ok(!Object.prototype.hasOwnProperty.call(fields, 'prompt'));
var body = probe.buildPostBody(fields);
assert.strictEqual(body.source, 'cursor_hook');
assert.strictEqual(body.model, 'default');
assert.strictEqual(body.event, 'beforeSubmitPrompt');
assert.strictEqual(body.sessionId, 'conversation-1');

assert.deepStrictEqual(probe.buildStdoutResponse('beforeSubmitPrompt'), { continue: true });
assert.deepStrictEqual(probe.buildStdoutResponse('subagentStart'), { permission: 'allow' });
assert.deepStrictEqual(probe.buildStdoutResponse('stop'), {});
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
    stdinText: JSON.stringify({ hook_event_name: 'stop' }),
    jsonlPath: temp,
    skipPost: true,
    skipStdout: true
  })
  .then(function () {
    var row = JSON.parse(fs.readFileSync(temp, 'utf8').trim());
    assert.strictEqual(row.event, 'stop');
    fs.unlinkSync(temp);
    console.log('cursor-hook-probe tests passed');
  });
