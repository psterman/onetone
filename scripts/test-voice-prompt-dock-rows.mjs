/**
 * Prove voice dock buildRows lists prompt inject peers.
 * Run: node scripts/test-voice-prompt-dock-rows.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const panelSrc = readFileSync(join(root, 'src/js/features/mapping/keys-scene-actions-panel.js'), 'utf8');

const habit = {
  id: 'habit-1',
  label: 'Cursor',
  appTargetId: 'cursor-chat',
  triggerKey: '',
  imePresetId: 'typeless',
  targetActions: [],
  agentBindings: [
    { triggerType: 'key', slotId: 'pushToTalk', actionId: 'startDictation', triggerBinding: 'RAlt', enabled: true }
  ],
  enabled: true,
  captureHeroRef: null
};
const prompt = {
  id: 'prompt-1',
  label: '继续',
  appTargetId: 'cursor-chat',
  triggerKey: '',
  imePresetId: '',
  enabled: false,
  captureHeroRef: {
    channel: 'voice',
    bindingRef: 'prompt-1',
    actionId: '',
    actionInstanceId: '',
    kind: 'prompt'
  },
  targetActions: [
    { type: 'text', value: '继续上一步，保持同样约束。' },
    { type: 'key', value: 'Enter' }
  ]
};

const sandbox = {
  window: {},
  document: {
    getElementById: () => null,
    addEventListener: () => {}
  },
  console
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.OneToneState = {
  state: {
    selectedMappingId: habit.id,
    config: { mappings: [habit, prompt] }
  },
  ui: { settingsPanel: 'voiceWake' }
};
sandbox.OneToneI18n = { t: (k) => k, getLang: () => 'zh' };
sandbox.OneToneDom = { $: () => null, esc: (s) => String(s) };
sandbox.OneToneKeysChannelCommandPicker = {
  isPromptInjectMapping: (m) =>
    !!(m && m.captureHeroRef && String(m.captureHeroRef.kind).toLowerCase() === 'prompt'),
  isCustomKeyMatchMapping: () => false,
  promptTextFromMapping: (m) => {
    const a = (m.targetActions || []).find((x) => x && x.type === 'text');
    return a ? String(a.value || '') : '';
  }
};
sandbox.OneToneMappingCore = {
  byId: (id) => (id === habit.id ? habit : id === prompt.id ? prompt : null),
  selected: () => habit,
  captureHeroRefForMapping: (m) => m.captureHeroRef || { kind: 'ime', channel: 'key', bindingRef: 'ime' },
  isDefaultCaptureHeroRef: (ref) => !ref || (ref.kind === 'ime' && !ref.actionId)
};
sandbox.OneToneHabitOverrideDiff = {
  isAppScenarioMapping: (m) => !!(m && String(m.appTargetId || '').trim())
};
sandbox.OneToneVoicePageHeaderRender = {
  resolveScopeMapping: () => habit
};

vm.runInNewContext(panelSrc, sandbox, { filename: 'keys-scene-actions-panel.js' });
const api = sandbox.OneToneKeysSceneActionsPanel;
assert.ok(api && typeof api.buildRows === 'function', 'panel exported');

// Simulate render selecting habit on voice page.
api.render(habit);
const rows = api.buildRows(habit);
const kinds = rows.map((r) => r.kind);
console.log('rows', rows.map((r) => ({ kind: r.kind, label: r.label, key: r.key })));
assert.ok(kinds.includes('prompt'), 'prompt row present: ' + JSON.stringify(kinds));
assert.ok(kinds.includes('recognition') || kinds.includes('prompt'), 'has rows');
const promptRows = rows.filter((r) => r.kind === 'prompt');
assert.equal(promptRows.length, 1);
assert.match(promptRows[0].label, /继续|口头指令/);

// Habit must NOT count as prompt just because captureHeroRef.kind was left as prompt.
const stale = {
  id: 'habit-stale',
  label: 'AutoTrigger → RAlt',
  appTargetId: 'cursor-chat',
  triggerKey: '',
  targetKey: '',
  imePresetId: '',
  enabled: true,
  captureHeroRef: {
    channel: 'voice',
    bindingRef: 'deleted-prompt-id',
    actionId: '',
    actionInstanceId: '',
    kind: 'prompt'
  },
  targetActions: [
    { type: 'text', value: '画一个原型图' },
    { type: 'key', value: 'Enter' }
  ],
  agentBindings: []
};
sandbox.OneToneState.state.config.mappings = [stale];
sandbox.OneToneState.state.selectedMappingId = stale.id;
sandbox.OneToneMappingCore.byId = (id) => (id === stale.id ? stale : null);
sandbox.OneToneMappingCore.selected = () => stale;
sandbox.OneToneVoicePageHeaderRender.resolveScopeMapping = () => stale;
sandbox.OneToneState.ui.settingsPanel = 'voiceWake';
api.render(stale);
const voiceStale = api.buildRows(stale);
assert.equal(
  voiceStale.filter((r) => r.kind === 'prompt').length,
  0,
  'stale prompt hero on habit must not list as prompt: ' + JSON.stringify(voiceStale)
);
assert.equal(stale.captureHeroRef, null, 'stale prompt hero scrubbed');

sandbox.OneToneState.ui.settingsPanel = 'keys';
const keysStale = api.buildRows(stale).filter(
  (r) =>
    r.kind === 'recognition' ||
    r.kind === 'customKey' ||
    r.kind === 'softPad' ||
    r.kind === 'cursor' ||
    r.kind === 'camera' ||
    r.kind === 'key'
);
assert.equal(keysStale.filter((r) => r.kind === 'prompt' || r.kind === 'voice').length, 0);

// Keys-page path used to fold prompt into kind:'voice' and drop it on voice filter.
sandbox.OneToneState.ui.settingsPanel = 'keys';
sandbox.OneToneState.state.config.mappings = [habit, prompt];
sandbox.OneToneState.state.selectedMappingId = habit.id;
sandbox.OneToneMappingCore.byId = (id) =>
  id === habit.id ? habit : id === prompt.id ? prompt : null;
sandbox.OneToneMappingCore.selected = () => habit;
sandbox.OneToneVoicePageHeaderRender.resolveScopeMapping = () => habit;
api.render(habit);
const keysRows = api.buildRows(habit);
assert.equal(keysRows.filter((r) => r.kind === 'prompt').length, 1, 'keys path still emits promptRow');
const filteredVoice = keysRows.filter(
  (r) => r.kind === 'recognition' || r.kind === 'voicePhrase' || r.kind === 'prompt'
);
assert.equal(filteredVoice.filter((r) => r.kind === 'prompt').length, 1);

// Clicking the prompt row used to set dock anchor = peer, so × hit clearHabitScheme (no-op).
sandbox.OneToneState.ui.settingsPanel = 'voiceWake';
const promptAlive = {
  id: 'prompt-del',
  label: '继续',
  appTargetId: 'cursor-chat',
  enabled: true,
  captureHeroRef: {
    channel: 'voice',
    bindingRef: 'prompt-del',
    actionId: '',
    actionInstanceId: '',
    kind: 'prompt'
  },
  targetActions: [
    { type: 'text', value: '继续上一步' },
    { type: 'key', value: 'Enter' }
  ]
};
sandbox.OneToneState.state.config.mappings = [habit, promptAlive];
sandbox.OneToneState.state.selectedMappingId = habit.id;
sandbox.OneToneMappingCore.byId = (id) =>
  id === habit.id ? habit : id === promptAlive.id ? promptAlive : null;
sandbox.OneToneMappingCore.selected = () => habit;
sandbox.OneToneKeysChannelCommandPicker.isPromptInjectMapping = (m) =>
  !!(
    m &&
    m.captureHeroRef &&
    String(m.captureHeroRef.kind).toLowerCase() === 'prompt' &&
    String(m.captureHeroRef.bindingRef) === String(m.id)
  );
let deleted = [];
sandbox.OneToneHabitShared = {
  deleteMapping: (id) => {
    deleted.push(String(id));
    sandbox.OneToneState.state.config.mappings = sandbox.OneToneState.state.config.mappings.filter(
      (m) => m && String(m.id) !== String(id)
    );
  }
};
sandbox.OneToneVoiceIntentRail = { onPromptPeerDeleted: () => {} };
api.render(habit);
api.jumpToEdit({ kind: 'prompt', mappingId: promptAlive.id, key: 'prompt:' + promptAlive.id });
api.deleteSceneRow({ kind: 'prompt', mappingId: promptAlive.id, key: 'prompt:' + promptAlive.id });
assert.deepEqual(deleted, ['prompt-del'], '× after jump must trash prompt peer');
assert.equal(
  sandbox.OneToneState.state.config.mappings.some((m) => m && m.id === 'prompt-del'),
  false,
  'prompt peer removed from mappings'
);

console.log('PASS voice dock lists prompt inject peers');
