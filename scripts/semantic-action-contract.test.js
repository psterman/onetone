/**
 * Semantic catalog / alias contract smoke (no Tauri).
 * Run: node scripts/semantic-action-contract.test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var contract = fs.readFileSync(
  path.join(root, 'docs/SEMANTIC_ACTION_CONTRACT.md'),
  'utf8'
);
assert.ok(contract.indexOf('ActionBindingView') >= 0);
assert.ok(contract.indexOf('bindingRef') >= 0);
assert.ok(contract.indexOf('pendingConfirmation') >= 0);
assert.ok(contract.indexOf('stopOrSendDictation') >= 0);
assert.ok(contract.indexOf('FEATURE_DYNAMIC_CONTEXT_ACTIONS') >= 0);
assert.ok(contract.indexOf('needsInputKind') >= 0);
assert.ok(contract.indexOf('CommitPolicy') >= 0 || contract.indexOf('input.commit') >= 0);
assert.ok(contract.indexOf('implemented') >= 0);
assert.ok(contract.indexOf('waitingChoice') >= 0);
assert.ok(
  contract.indexOf('首版无生产者') >= 0 ||
    contract.indexOf('reserved') >= 0 ||
    contract.indexOf('无生产者') >= 0
);
assert.ok(contract.indexOf('providerScope') >= 0 || contract.indexOf('currentTarget') >= 0);
assert.ok(contract.indexOf('app.open') >= 0);
assert.ok(contract.indexOf('app.shortcut') >= 0);
assert.ok(contract.indexOf('actionInstanceId') >= 0 || contract.indexOf('action_instance_id') >= 0);
assert.ok(contract.indexOf('open_or_focus_target') >= 0 || contract.indexOf('open/focus') >= 0 || contract.indexOf('打开/聚焦') >= 0);
assert.ok(contract.indexOf('requiresSecondChannelFrom') >= 0);
assert.ok(contract.indexOf('RouteDisposition') >= 0);
assert.ok(contract.indexOf('bindable') >= 0);
assert.ok(contract.indexOf('executableNow') >= 0);
assert.ok(contract.indexOf('routeDisposition') >= 0 || contract.indexOf('route_disposition') >= 0);
assert.ok(
  contract.indexOf('bindable') >= 0 &&
    (contract.indexOf('不等价') >= 0 || contract.indexOf('≠') >= 0 || contract.indexOf('三不等价') >= 0)
);

var js = fs.readFileSync(
  path.join(root, 'src/js/features/agent/agent-actions.js'),
  'utf8'
);
assert.ok(js.indexOf('resolveCanonicalActionId') >= 0);
assert.ok(js.indexOf('cmd_semantic_action_catalog') >= 0);
assert.ok(js.indexOf('routeSemanticAction') >= 0);
assert.ok(js.indexOf('featureDynamicContextActions') >= 0);
assert.ok(js.indexOf('FEATURE_DYNAMIC_CONTEXT_ACTIONS') < 0); // gate lives in Rust; FE reads catalog flag

function resolveCanonicalActionId(raw, sendMode) {
  var id = String(raw || '').trim();
  if (id === 'stopOrSendDictation') {
    return String(sendMode || '').toLowerCase() === 'auto' ? 'input.send' : 'input.commit';
  }
  var map = {
    startDictation: 'input.start',
    cancel: 'input.cancel',
    openAgent: 'agent.focus',
    focusComposer: 'agent.focus'
  };
  return map[id] || id;
}

assert.strictEqual(resolveCanonicalActionId('startDictation'), 'input.start');
assert.strictEqual(resolveCanonicalActionId('cancel'), 'input.cancel');
assert.strictEqual(resolveCanonicalActionId('openAgent'), 'agent.focus');
assert.strictEqual(resolveCanonicalActionId('stopOrSendDictation', 'confirm'), 'input.commit');
assert.strictEqual(resolveCanonicalActionId('stopOrSendDictation', 'auto'), 'input.send');

var cam = fs.readFileSync(
  path.join(root, 'src/js/features/camera/camera-presence-actions.js'),
  'utf8'
);
assert.ok(cam.indexOf("sourceChannel:'camera'") >= 0 || cam.indexOf('sourceChannel:"camera"') >= 0);
assert.ok(cam.indexOf('pendingConfirmation') >= 0);

console.log('semantic-action-contract.test.js: ok');
