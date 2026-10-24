/**
 * Phase-3 seal: bridge L5 → Habits; Soft Pad voice phrases + L2 captureHero via Habit APIs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => readFileSync(join(root, rel), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

const linkSrc = src('src/js/features/mapping/habit-command-link.js');
check('HabitCommandLink exports setCaptureHero', /setCaptureHero:\s*setCaptureHero/.test(linkSrc));
check('HabitCommandLink exports syncSlotVoicePhrase', /syncSlotVoicePhrase:\s*syncSlotVoicePhrase/.test(linkSrc));
check('setCaptureHero delegates MappingCore', /setCaptureHeroRef/.test(linkSrc));

const pad = src('src/js/features/agent/codex-micro-pad-ui.js');
check(
  'stampSoftPadSceneHero → setCaptureHero',
  /function stampSoftPadSceneHero[\s\S]*Link\.setCaptureHero/.test(pad)
);
check(
  'upsertCustomShortcutBindings → syncSlotVoicePhrase',
  /function upsertCustomShortcutBindings[\s\S]*syncSlotVoicePhrase/.test(pad)
);
check(
  'applyLayoutKeyBindings → syncSlotVoicePhrase',
  /function applyLayoutKeyBindings[\s\S]*syncSlotVoicePhrase/.test(pad)
);

const keysBridge = src('src/js/features/voice/voice-bridge-keys.js');
check('keys bridge openHabitPhraseEditor', keysBridge.includes('openHabitPhraseEditor'));
check(
  'keys addPhrase → Habits (catalog)',
  /function addPhrase[\s\S]*openHabitPhraseEditor/.test(keysBridge)
);
check(
  'keys customKey still opens Keys',
  /listMode===['"]customKey['"][\s\S]*openKeysPanel/.test(keysBridge)
);

const spBridge = src('src/js/features/voice/voice-bridge-softpad.js');
check(
  'softpad addPhrase → Habits',
  /function addPhrase[\s\S]*openHabitsMatch/.test(spBridge)
);

const scene = src('src/js/features/mapping/keys-scene-actions-panel.js');
check(
  'claimVoiceChannelMatch → setCaptureHero',
  /function claimVoiceChannelMatch[\s\S]*setCaptureHero/.test(scene)
);

// Runtime: syncSlotVoicePhrase + setCaptureHero
const mapping = {
  id: 'habit-p3',
  agentBindings: [],
  captureHeroRef: null
};
let heroWrites = 0;
const context = {
  console,
  Promise,
  OneToneState: {
    state: { config: { mappings: [mapping] }, selectedMappingId: 'habit-p3' },
    ui: {}
  },
  OneToneMappingCore: {
    byId(id) {
      return id === 'habit-p3' ? mapping : null;
    },
    setCaptureHeroRef(m, ref) {
      heroWrites++;
      m.captureHeroRef = ref;
    }
  },
  OneToneConfigPersist: {
    ensureConfig() {},
    save() {},
    saveAsync() {
      return Promise.resolve(true);
    }
  },
  OneToneOralCommandUi: {
    tokenizeOralSay(v) {
      return String(v || '')
        .split(/[、,，;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    },
    persistOralScheme() {}
  },
  OneToneDom: { esc(s) { return String(s == null ? '' : s); } },
  OneToneSettingsDrawer: {},
  document: { getElementById() { return null; }, createElement() { return { style: {}, appendChild() {}, classList: { add() {} } }; } }
};
vm.runInNewContext(linkSrc, context);
const Link = context.OneToneHabitCommandLink;
assert.ok(Link);

Link.syncSlotVoicePhrase(mapping, 'slot-a', '你好、继续', {
  actionId: 'continueReply',
  activationScope: 'foregroundApp'
});
check(
  'syncSlotVoicePhrase creates voice bind',
  mapping.agentBindings.length === 1 &&
    mapping.agentBindings[0].triggerType === 'voice' &&
    mapping.agentBindings[0].triggerBinding === '你好、继续'
);

Link.syncSlotVoicePhrase(mapping, 'slot-a', '', {});
check(
  'syncSlotVoicePhrase clears phrase',
  mapping.agentBindings[0].enabled === false && !mapping.agentBindings[0].triggerBinding
);

Link.setCaptureHero(mapping, {
  channel: 'softPad',
  bindingRef: 'AG02',
  actionId: 'continueReply',
  kind: 'action'
});
check('setCaptureHero uses MappingCore', heroWrites === 1 && mapping.captureHeroRef.channel === 'softPad');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
