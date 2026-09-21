/**
 * Soft Pad 口头指令：本应用主开启口令 + 一词注入 + 自定义；不灌全局同义词库。
 * Run: node scripts/soft-pad-voice-dictation-catalog.test.js
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);

const habit = {
  id: 'habit-1',
  label: 'Cursor',
  appTargetId: 'cursor-chat',
  enabled: true,
  voiceOverride: { wakePhrases: ['开始听写'] },
  agentBindings: [
    {
      triggerType: 'voice',
      slotId: 'userContinue',
      actionId: 'agent.continue',
      triggerBinding: '接着干',
      enabled: true
    },
    {
      triggerType: 'voice',
      slotId: 'pushToTalk',
      actionId: 'input.start',
      triggerBinding: '开始听写',
      enabled: true
    },
    {
      triggerType: 'key',
      slotId: 'pushToTalk',
      actionId: 'input.start',
      triggerBinding: 'RAlt',
      enabled: true
    }
  ],
  codexMicroPad: {
    enabled: true,
    keys: [{ microKeyId: 'AG00', slotId: 'pushToTalk' }],
    customShortcuts: [{ id: 'custom_1', name: '分屏', phrases: '分一下屏' }]
  }
};
const prompt = {
  id: 'prompt-1',
  label: '继续',
  appTargetId: 'cursor-chat',
  enabled: true,
  captureHeroRef: {
    channel: 'voice',
    bindingRef: 'prompt-1',
    actionId: '',
    kind: 'prompt'
  },
  targetActions: [
    { type: 'text', value: '继续上一步' },
    { type: 'key', value: 'Enter' }
  ]
};
const otherAppPrompt = {
  id: 'prompt-codex',
  label: '总结',
  appTargetId: 'codex-chat',
  enabled: true,
  captureHeroRef: {
    channel: 'voice',
    bindingRef: 'prompt-codex',
    kind: 'prompt'
  },
  targetActions: [{ type: 'text', value: '总结一下' }, { type: 'key', value: 'Enter' }]
};

const sandbox = {
  window: {},
  document: {
    getElementById: () => null,
    addEventListener: () => {},
    querySelector: () => null,
    querySelectorAll: () => []
  },
  console,
  setTimeout: () => 0,
  clearTimeout: () => {},
  requestAnimationFrame: (f) => f && f()
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.OneToneState = {
  state: {
    selectedMappingId: habit.id,
    config: {
      mappings: [habit, prompt, otherAppPrompt],
      voiceEnd: {
        phrasesZh: ['结束输入', '就这样'],
        phrasesEn: ['end dictation', "that's it"],
        sendPhrasesZh: ['发送', '发出去'],
        sendPhrasesEn: ['send it', 'send'],
        cancelPhrasesZh: ['取消']
      },
      voiceVosk: { phrases: ['一声', '开始听写', '打开听写', '语音输入', '开启输入'] }
    }
  },
  ui: { settingsPanel: 'softPad' }
};
sandbox.OneToneI18n = { t: (_k, fb) => fb || _k, getLang: () => 'zh' };
sandbox.OneToneDom = { esc: (s) => String(s) };
sandbox.OneToneDom['$'] = () => null;
sandbox.OneToneSoftPadHub = {
  getSelectedScopeId: () => 'cursor',
  appIdForKind: (k) => (k === 'cursor' ? 'cursor-chat' : '')
};
sandbox.OneToneMappingCore = {
  byId: (id) =>
    sandbox.OneToneState.state.config.mappings.find((m) => m.id === id) || null,
  selected: () => habit
};
sandbox.OneToneConfigPersist = { ensureConfig: () => {} };
sandbox.OneToneHabitOverrideDiff = {
  isAppScenarioMapping: (m) => !!(m && m.appTargetId)
};
sandbox.OneToneVoiceWake = {
  currentWakePhraseList: () => ['一声', '开始听写', '打开听写', '语音输入', '开启输入'],
  primaryWakePhraseDisplay: () => '一声'
};

vm.runInNewContext(src, sandbox, { filename: 'picker.js' });
const api = sandbox.OneToneKeysChannelCommandPicker;
const rows = api.catalogVoicePromptsForMapping(habit, '');
const says = rows.map((r) => r.say);
const picks = rows.map((r) => r.pickId);

assert.ok(picks.includes('prompt:prompt-1'), 'Cursor prompt inject present');
assert.ok(picks.includes('voice-custom:custom_1'), 'Soft Pad custom phrase present');
assert.ok(picks.includes('dictation-wake:primary'), 'primary wake present');
assert.equal(
  rows.filter((r) => String(r.pickId).indexOf('dictation-wake:') === 0).length,
  1,
  'only one wake row'
);
assert.equal(
  rows.find((r) => r.pickId === 'dictation-wake:primary').say,
  '开始听写',
  'prefers app voiceOverride over global bank'
);
assert.ok(!picks.includes('prompt:prompt-codex'), 'other-app prompt excluded');
assert.ok(!says.includes('一声'), 'global primary alias not dumped');
assert.ok(!says.includes('打开听写'), 'wake synonyms excluded');
assert.ok(!says.includes('end dictation'), 'global end bank excluded');
assert.ok(!says.includes('send it'), 'global send bank excluded');
assert.ok(!picks.some((p) => String(p).indexOf('dictation-end:') === 0), 'no end dump');
assert.ok(!picks.some((p) => String(p).indexOf('dictation-send:') === 0), 'no send dump');
// Soft Pad seeded pushToTalk voice + dual key skipped; agent.continue is Soft Pad layout seed → skipped
assert.ok(!says.includes('接着干'), 'soft-pad/layout seed voice excluded');

console.log('soft-pad-voice-dictation-catalog.test.js: ok');
