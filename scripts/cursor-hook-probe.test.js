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

var temp = path.join(os.tmpdir(), 'onetone-cursor-hook-' + process.pid + '.jsonl');
probe.run({ stdinText: JSON.stringify({ hook_event_name: 'stop' }), jsonlPath: temp, skipPost: true })
  .then(function () {
    var row = JSON.parse(fs.readFileSync(temp, 'utf8').trim());
    assert.strictEqual(row.event, 'stop');
    fs.unlinkSync(temp);
    console.log('cursor-hook-probe tests passed');
  });
