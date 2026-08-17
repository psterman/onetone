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
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'cursor-chat' }, 'quickChat'),
  'Ctrl+I'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'cursor-chat' }, 'plan'),
  'Ctrl+Alt+Shift+P'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'cursor-chat' }, 'switchAgent'),
  'Ctrl+Alt+.'
);
  assert.strictEqual(
    sandbox.OneToneAgentActions.labelForSlotForMapping({ appTargetId: 'cursor-chat' }, 'plan'),
    'Plan 模式'
  );
  assert.ok(
    padSrc.indexOf('function softPadKeyCaption') >= 0,
    'settings caption helper matches overlay Plan mode'
  );
  assert.ok(
    padSrc.indexOf('function syncCursorSoftPadDisplay') >= 0,
    'Cursor Soft Pad settings sync Plan/Agent with overlay'
  );
assert.ok(
  padSrc.includes('function isSoftPadLeftoverIcon') &&
    padSrc.includes('isSoftPadLeftoverIcon(cur, microKeyId, slotId)'),
  'Plan/Agent icons replace leftover palette/fork'
);
assert.ok(
  !/LEGACY_MISLEADING_ICONS\s*=\s*\{[\s\S]*?\bagent:\s*1/.test(padSrc),
  'agent icon is a real Cursor Soft Pad glyph, not legacy misleading'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.labelForSlotForMapping({ appTargetId: 'cursor-chat' }, 'switchAgent'),
  'Agent 模式'
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
assert.ok(
  /CURSOR_SOFT_PAD_SLOT_IDS\s*=\s*\{[\s\S]*?\bplan:\s*1[\s\S]*?\bswitchAgent:\s*1/.test(padSrc),
  'Cursor Soft Pad picker allowlists plan + switchAgent'
);
assert.ok(
  !/CURSOR_SOFT_PAD_SLOT_IDS\s*=\s*\{[\s\S]*?\bappsOrPlugins\s*:/.test(padSrc),
  'Cursor Soft Pad never allowlists appsOrPlugins'
);
assert.ok(
  padSrc.includes('!CURSOR_SOFT_PAD_SLOT_IDS[slot]') ||
    padSrc.includes('CURSOR_SOFT_PAD_SLOT_IDS[slot]'),
  'syncCursorSoftPadDisplay strips illegal Cursor slots'
);
assert.ok(
  padSrc.includes('persistLayoutNow') && padSrc.includes('{ immediate: true }'),
  'commitEditKeycap flushes layout immediately'
);
assert.ok(
  padSrc.includes('ensureAgentKeyBinding(m, slotId)') &&
    padSrc.indexOf('ensureAgentKeyBinding(m, slotId)') <
      padSrc.indexOf('upsertRoute(m, pad, editDraft.microKeyId'),
  'commitEditKeycap binds before route upsert'
);
assert.ok(
  padSrc.includes('applyEnsurePayloadToMapping(m, res)'),
  'persistLayout applies set_layout return payload'
);

var flagsSrc = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/codex_micro_pad_flags_cmd.rs'),
  'utf8'
);
assert.ok(
  flagsSrc.includes('CodexMicroPadSetLayoutResult') &&
    flagsSrc.includes('pad.keys.iter_mut().find') &&
    flagsSrc.includes('note_soft_pad_surface_for_mapping'),
  'set_layout returns pad+bindings, upserts keys, pins mappingId'
);
assert.ok(flagsSrc.includes('cmd_soft_pad_pin_mapping'), 'Hub can pin Soft Pad mapping');

var appIpc = fs.readFileSync(
  path.join(root, 'src-tauri/permissions/app-ipc.toml'),
  'utf8'
);
assert.ok(
  appIpc.includes('allow-cmd-codex-micro-pad-set-layout'),
  'set_layout must be in app-ipc or quiet persist is denied'
);
assert.ok(
  appIpc.includes('allow-cmd-soft-pad-pin-mapping'),
  'pin mapping must be in app-ipc'
);
var buildSrc = fs.readFileSync(path.join(root, 'src-tauri/build.rs'), 'utf8');
assert.ok(
  buildSrc.includes('"cmd_codex_micro_pad_set_layout"') &&
    buildSrc.includes('"cmd_soft_pad_pin_mapping"'),
  'build.rs ACL COMMANDS includes set_layout + pin_mapping'
);

var overlaySrc = fs.readFileSync(
  path.join(root, 'src-tauri/src/codex_micro_overlay.rs'),
  'utf8'
);
assert.ok(
  overlaySrc.includes('sticky_mapping_id_for_tid') &&
    overlaySrc.includes('note_soft_pad_surface_for_mapping'),
  'overlay prefers sticky mappingId under same tid'
);

var layerSrc = fs.readFileSync(
  path.join(root, 'src-tauri/src/codex_numpad_layer.rs'),
  'utf8'
);
assert.ok(
  layerSrc.includes('cursor_soft_pad_slot_allowed') &&
    layerSrc.includes('heal_cursor_illegal_soft_pad_slots') &&
    layerSrc.includes('heal_cursor_pad_for_save'),
  'Cursor save heal allowlists Soft Pad slots and strips illegal ones'
);

assert.ok(
  padSrc.includes('composerMode hotkeys') || padSrc.includes('Ctrl+Alt+Shift+P'),
  'Cursor plan/agent treated as one-press hotkeys in picker'
);
assert.ok(
  /var VSCODE_SOFT_PAD_SLOT_IDS\s*=\s*\{/.test(padSrc) &&
    !/var VSCODE_SOFT_PAD_SLOT_IDS\s*=\s*CURSOR_SOFT_PAD_SLOT_IDS/.test(padSrc),
  'VS Code lineage allowlist is separate from Cursor (no Plan/Agent on Trae/Qoder)'
);
assert.ok(padSrc.includes('Cursor 快捷键') || padSrc.includes('Cursor shortcut'));
assert.ok(
  padSrc.includes('Trae Work 快捷键') || padSrc.includes('Trae Work shortcut') ||
    padSrc.includes('Trae Code 快捷键') || padSrc.includes('Trae Code shortcut') ||
    padSrc.includes('Trae 快捷键') || padSrc.includes('Trae shortcut')
);
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
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'trae-work' }, 'quickChat'),
  'Ctrl+U'
);
assert.strictEqual(
  sandbox.OneToneAgentActions.defaultKeyForMapping({ appTargetId: 'trae-code' }, 'quickChat'),
  'Ctrl+U'
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
  appTargetId: 'trae-work',
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

var traeCode = {
  appTargetId: 'trae-code',
  agentTemplateId: 'codex-micro-13',
  agentBindings: [
    { slotId: 'quickChat', triggerType: 'key', triggerBinding: 'Ctrl+L', enabled: true }
  ]
};
assert.ok(sandbox.OneToneAgentScenarioTemplate.fillEmptyKeyDefaults(traeCode));
assert.strictEqual(
  traeCode.agentBindings.find(function (b) { return b.slotId === 'quickChat'; }).triggerBinding,
  'Ctrl+U'
);

console.log('cursor/shell soft-pad chord/ui audit passed');
