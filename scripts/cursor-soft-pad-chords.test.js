'use strict';

/**
 * Soft Pad chords: Cursor / Trae / Qoder / WorkBuddy follow their own clients,
 * not a generic VS Code dump and not Codex Micro.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.resolve(__dirname, '..');
var actionsSrc = fs.readFileSync(path.join(root, 'src/js/features/agent/agent-actions.js'), 'utf8');
var tplSrc = fs.readFileSync(path.join(root, 'src/js/features/agent/agent-scenario-template.js'), 'utf8');
var padSrc = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');

var sandbox = { window: {}, console: console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(actionsSrc, sandbox);
assert.ok(sandbox.OneToneAgentActions, 'agent actions loaded');
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'cursor-chat' }, 'commandPalette'),
  'Ctrl+Shift+P'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'codex-chat' }, 'commandPalette'),
  'Ctrl+K'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.labelForSlotForMapping({ appTargetId: 'cursor-chat' }, 'summonCodex'),
  '聚焦 Cursor'
);

vm.runInContext(tplSrc, sandbox);
assert.ok(sandbox.OneToneAgentScenarioTemplate, 'scenario template loaded');

var m = {
  appTargetId: 'cursor-chat',
  agentTemplateId: 'codex-micro-13',
  agentBindings: [
    { slotId: 'commandPalette', triggerType: 'key', triggerBinding: 'Ctrl+K', enabled: true },
    { slotId: 'cancel', triggerType: 'key', triggerBinding: 'Escape', enabled: true },
    { slotId: 'quickChat', triggerType: 'key', triggerBinding: 'Ctrl+Alt+N', enabled: true }
  ]
};
assert.ok(
  sandbox.OneToneAgentScenarioTemplate.realignCursorBindingsFromCodexDefaults(m),
  'realign should rewrite Codex chords'
);
assert.strictEqual(
  m.agentBindings.find(function (b) { return b.slotId === 'commandPalette'; }).triggerBinding,
  'Ctrl+Shift+P'
);
assert.strictEqual(
  m.agentBindings.find(function (b) { return b.slotId === 'cancel'; }).triggerBinding,
  'Ctrl+Shift+Backspace'
);
assert.strictEqual(
  m.agentBindings.find(function (b) { return b.slotId === 'quickChat'; }).triggerBinding,
  'Ctrl+I'
);

assert.ok(padSrc.includes('function capabilityCardCopy(slotId, m)'), 'capabilityCardCopy takes mapping');
assert.ok(padSrc.includes('isVscodeSoftPadMapping(m) && id'), 'VS Code lineage uses dynamic tip copy');
assert.ok(padSrc.includes('Cursor 快捷键') || padSrc.includes('Cursor shortcut'));
assert.ok(padSrc.includes('Trae 快捷键') || padSrc.includes('Trae shortcut'));
assert.ok(padSrc.includes('Qoder 快捷键') || padSrc.includes('Qoder shortcut'));
assert.ok(padSrc.includes('WorkBuddy 快捷键') || padSrc.includes('WorkBuddy shortcut'));
assert.ok(padSrc.includes('defaultKeyForMapping'));
assert.ok(padSrc.includes('id: \'cursor\'') || padSrc.includes('id: "cursor"') || padSrc.includes("id: 'cursor'"));

assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'workbuddy-chat' }, 'commandPalette'),
  ''
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'workbuddy-chat' }, 'newThread'),
  'Ctrl+N'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'trae-chat' }, 'quickChat'),
  'Ctrl+U'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'qoder-chat' }, 'cancel'),
  'Ctrl+Backspace'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'qoder-chat' }, 'quickChat'),
  'Ctrl+L'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.providerIdForApp('workbuddy-chat'),
  'workbuddy'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.labelForSlotForMapping({ appTargetId: 'qoder-chat' }, 'summonCodex'),
  '聚焦 Qoder'
);

var wb = {
  appTargetId: 'workbuddy-chat',
  agentTemplateId: 'codex-micro-13',
  agentBindings: [
    { slotId: 'commandPalette', triggerType: 'key', triggerBinding: 'Ctrl+K', enabled: true },
    { slotId: 'quickChat', triggerType: 'key', triggerBinding: 'Ctrl+Alt+N', enabled: true }
  ]
};
assert.ok(
  sandbox.OneToneAgentScenarioTemplate.ensurePackForMapping(wb, { persist: false }),
  'shell pack ensure'
);
assert.strictEqual(
  wb.agentBindings.find(function (b) { return b.slotId === 'commandPalette' && b.triggerType === 'key'; }).triggerBinding,
  ''
);
assert.strictEqual(wb.agentProviderId, 'workbuddy');

var trae = {
  appTargetId: 'trae-chat',
  agentTemplateId: 'codex-micro-13',
  agentBindings: [
    { slotId: 'quickChat', triggerType: 'key', triggerBinding: 'Ctrl+L', enabled: true }
  ]
};
assert.ok(sandbox.OneToneAgentScenarioTemplate.fillEmptyKeyDefaults(trae));
assert.strictEqual(
  trae.agentBindings.find(function (b) { return b.slotId === 'quickChat'; }).triggerBinding,
  'Ctrl+U'
);

console.log('cursor/shell soft-pad chord/ui audit passed');
