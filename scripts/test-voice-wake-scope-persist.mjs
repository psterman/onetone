/**
 * Wake phrases for app scenarios must persist on voiceOverride and refresh on scope switch —
 * never clobber global engine tables.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const cfg = {
  voiceVosk: { phrases: ['开始听写'], enabled: true },
  voiceSapi: { phrases: ['开始听写'] },
  voiceKws: { phrases: [] },
  desiredEngine: 'vosk',
  mappings: [
    { id: 'base', group: '通用设置', appTargetId: '', enabled: true },
    {
      id: 'app-cursor',
      group: 'Cursor',
      appTargetId: 'cursor-chat',
      enabled: true,
      voiceOverride: { wakePhrases: ['打开 Cursor'] }
    },
    {
      id: 'app-codex',
      group: 'Codex',
      appTargetId: 'codex-chat',
      enabled: true,
      voiceOverride: { wakePhrases: ['打开 Codex'] }
    }
  ]
};

const saves = [];
const context = {
  console,
  performance: { now: () => Date.now() },
  setTimeout,
  clearTimeout,
  document: {
    getElementById() { return null; },
    querySelectorAll() { return []; }
  },
  OneToneDom: { $(id) { return context.__els[id] || null; } },
  OneToneI18n: { t: (k, fb) => fb || k },
  OneToneState: {
    state: { config: cfg, selectedMappingId: 'app-cursor' },
    ui: { voiceEditSchemeId: 'app-cursor', settingsPanel: 'voiceWake', drawerOpen: true }
  },
  OneToneMappingCore: {
    byId(id) { return cfg.mappings.find((m) => m.id === id) || null; }
  },
  OneToneHabitOverrideDiff: {
    isAppScenarioMapping(m) { return !!(m && String(m.appTargetId || '').trim()); },
    findGlobalBaselineMapping() { return cfg.mappings[0]; }
  },
  OneToneHabitProfile: {
    hasVoiceParts() { return true; },
    hasKeyParts(m) { return !!(m && m.appTargetId); }
  },
  OneToneSceneConfig: {
    desiredEngine: () => 'vosk',
    globalWakePhrases: (c) => (c.voiceVosk && c.voiceVosk.phrases) || [],
    baseWakePhrases(c, mapping) {
      const ov = mapping && mapping.voiceOverride;
      if (ov && Array.isArray(ov.wakePhrases) && ov.wakePhrases.length) return ov.wakePhrases.slice();
      return this.globalWakePhrases(c);
    },
    globalEndPhrases: () => ({ zh: [], en: [] }),
    globalVoiceTargetKey: () => 'RAlt'
  },
  OneToneConfigPersist: {
    saveAsync(opts) { saves.push(opts || {}); return Promise.resolve(); },
    save(opts) { saves.push(opts || {}); }
  },
  OneToneIpc: {
    invoke() { return Promise.reject(new Error('ipc should not run for app-scoped wake')); }
  },
  __vp_voice_wake_hooks__: {
    cloneStringList(arr) { return (arr || []).slice(); },
    voiceUiSnapshot: { wake: {} },
    toast() {},
    syncHomeFromVoiceSettings() {}
  },
  __els: {}
};
context.globalThis = context;
vm.createContext(context);

vm.runInContext(
  readFileSync(new URL('../src/js/features/voice/voice-scheme-context.js', import.meta.url), 'utf8'),
  context,
  { filename: 'voice-scheme-context.js' }
);
vm.runInContext(
  readFileSync(new URL('../src/js/features/voice/voice-wake.js', import.meta.url), 'utf8'),
  context,
  { filename: 'voice-wake.js' }
);

const Wake = context.OneToneVoiceWake;
assert.ok(Wake, 'OneToneVoiceWake exported');

// 1) Editing Cursor → list comes from override, not global「开始听写」
assert.deepEqual(Wake.currentWakePhraseList(), ['打开 Cursor']);
assert.equal(Wake.isAppScopedWakeEdit(), true);

// 2) Persist app-scoped phrase without touching global engines
await Wake.addCustomWakePhrase('嘿，电脑');
assert.deepEqual(
  cfg.mappings.find((m) => m.id === 'app-cursor').voiceOverride.wakePhrases,
  ['打开 Cursor', '嘿，电脑']
);
assert.deepEqual(cfg.voiceVosk.phrases, ['开始听写'], 'global vosk phrases untouched');
assert.ok(saves.length >= 1, 'config save scheduled');

// 3) Switch to Codex → list refreshes to that override
context.OneToneState.state.selectedMappingId = 'app-codex';
context.OneToneState.ui.voiceEditSchemeId = 'app-codex';
Wake.clearWakePhraseSavePending();
Wake.refreshWakeScopeUi();
assert.deepEqual(Wake.currentWakePhraseList(), ['打开 Codex']);

// 4) Switch to global → fall back to engine phrases
context.OneToneState.state.selectedMappingId = null;
context.OneToneState.ui.voiceEditSchemeId = '__global__';
Wake.clearWakePhraseSavePending();
assert.equal(Wake.isAppScopedWakeEdit(), false);
assert.deepEqual(Wake.currentWakePhraseList(), ['开始听写']);

console.log('[voice-wake-scope-persist] all checks passed');
