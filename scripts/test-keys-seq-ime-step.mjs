/**
 * Keys sequence desk + ime step: parallel panel keeps legacy Keys; ime migrates.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const html = readFileSync(path.join(root, 'src/index.html'), 'utf8');
assert.match(html, /id="settingsPanelKeys"/, 'legacy keys panel must remain');
assert.match(html, /id="settingsPanelKeysSeq"/, 'new keysSeq panel present');
assert.match(html, /id="keysSeqTriggerCap"/, 'keysSeq trigger keycap');
assert.match(html, /id="keysSeqNewAction"/, '新建动作 on left with trigger');
assert.match(html, /id="keysSeqSavedList"/, 'left collapsed saved actions');
assert.match(html, /keys-page-body--two-col/, 'keysSeq two-col body');
assert.match(html, /data-wb-nav="keysSeq"/, 'nav entry for keysSeq');
assert.match(html, /keys-seq-panel\.js/, 'keys-seq-panel.js loaded');
assert.match(html, /keys-seq-panel\.css/, 'keys-seq-panel.css loaded');
assert.match(
  html,
  /keys-workflow\.css[\s\S]*keys-seq-panel\.css/,
  'keys-seq-panel.css loads after keys-workflow so desk overrides win'
);
assert.match(html, /keysSeqSceneActionsPanel[\s\S]{0,120}display:none/, 'right dock forced hidden');

const scene = readFileSync(path.join(root, 'src/js/features/mapping/keys-scene-actions-panel.js'), 'utf8');
assert.match(scene, /keysSeqSceneActionsPanel/, 'scene HOSTS includes keysSeq');
assert.match(scene, /panel === 'keysSeq'/, 'activeHost keysSeq');
assert.match(scene, /settingsPanelKeysSeq[\s\S]{0,120}showThis = false/, 'keysSeq right dock never shown');
assert.match(scene, /onKeysSeqPage\(\)[\s\S]{0,200}OneToneKeysSeqPanel/, 'jump/new stay on keysSeq');

const drawer = readFileSync(path.join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
assert.match(drawer, /keysSeq:'settingsPanelKeysSeq'/, 'PANEL_IDS keysSeq');
assert.match(drawer, /panel==='keysSeq'/, 'drawer render hook');
assert.match(drawer, /settingsPanel\)==='keysSeq'/, 'refreshKeysPanel routes to keysSeq');

const homeLive = readFileSync(path.join(root, 'src/js/features/home/home-live.js'), 'utf8');
assert.match(homeLive, /id:'ime'/, 'add menu includes ime');
assert.match(homeLive, /type:'ime'/, 'ime step shape in editor');
assert.match(homeLive, /keysSeqAddHint/, 'step menu capability tooltips');
assert.match(homeLive, /emptyPlus/, 'empty middle shows hero ＋');
assert.match(homeLive, /data-inline-ime-preset-pick/, 'ime preset chips with icons');
assert.match(homeLive, /data-inline-ime-aim-demo/, 'ime aim demo toggle');
assert.match(homeLive, /data-inline-ime-finish-mode/, 'ime finish modes');
assert.match(homeLive, /setBeforeFinishTargetHook/, 'IME/key use hardware record hook');
assert.match(homeLive, /return 'handled'/, 'record hook skips wipe of targetActions');
assert.match(homeLive, /OneToneHomeRecordChord/, 'fallback record overlay for chords');

const rec = readFileSync(path.join(root, 'src/js/features/mapping/mapping-recording.js'), 'utf8');
assert.match(rec, /ok==='handled'/, 'finishTarget supports handled');

const seqCss = readFileSync(path.join(root, 'src/css/keys-seq-panel.css'), 'utf8');
assert.match(seqCss, /keys-seq-saved/, 'left saved list styles');
assert.match(seqCss, /keys-page-body--two-col/, 'two-col layout');
assert.match(seqCss, /is-empty-plus|is-hero/, 'empty plus hero');
assert.match(seqCss, /keys-aim-demo/, 'aim demo styles on keysSeq');
assert.match(seqCss, /overflow-x:\s*visible/, 'add menu no horizontal scroll');
assert.match(seqCss, /keys-seq-aim-demo-overlay/, 'aim demo modal overlay');
assert.match(seqCss, /home-record-card-cancel/, 'record cancel button style');
assert.match(seqCss, /grid-column:\s*1\/-1/, 'step body full-bleed under header');

const seqJs = readFileSync(path.join(root, 'src/js/features/mapping/keys-seq-panel.js'), 'utf8');
assert.match(seqJs, /hideAdd:\s*false/, 'middle shows ＋ add menu');
assert.match(seqJs, /keysSeqSavedToggle|paintSavedList/, 'saved list painted on left');
assert.match(seqJs, /keysSeqNewAction/, '新建动作 wired on left');
assert.match(seqJs, /OneToneHomeRecordChord/, 'trigger record shows popup');
assert.match(seqJs, /homeKeyMapActionRecordHint|Esc/, 'trigger popup mentions Esc cancel');
assert.match(
  seqJs,
  /Do NOT also arm startTrigger|Keyboard popup alone owns/,
  'keysSeq popup must not arm startTrigger (cancel-restore wiped triggerKey)'
);
assert.match(seqJs, /maybeEnableAfterComplete|setMappingEnabled/, 'popup trigger enables mapping so chord binds');
// Fallback may call startTrigger once; live popup path must not arm it.
assert.equal(
  (seqJs.match(/rec\.startTrigger\s*\(/g) || []).length,
  1,
  'startTrigger call only in popup-missing fallback'
);
assert.match(seqJs, /keysSeqFamilyId|ensureKeysSeqFamily/, '新建动作 peers share family for saved list');
assert.match(seqJs, /keysSeqNewNeedContent|mappingHasChainContent/, '新建 saves current chain first');
assert.match(seqJs, /resolveCurrentAppId|ensureAppScopedSelection/, 'desk scopes to current app');
assert.match(seqJs, /selectSaved/, 'loading saved action reloads keycap + steps');
assert.match(seqJs, /refreshAfterEdit/, 'edits refresh saved list live');
assert.match(seqJs, /data-seq-del/, 'saved list delete');

const persist = readFileSync(path.join(root, 'src/js/core/config-persist.js'), 'utf8');
assert.match(
  persist,
  /ownsChain[\s\S]{0,200}m\.triggerKey/,
  'buildSavePayload keeps action-chain triggerKey (no inherit wipe)'
);
const diffJs = readFileSync(path.join(root, 'src/js/core/habit-override-diff.js'), 'utf8');
assert.match(
  diffJs,
  /mappingOwnsActionChainKeys/,
  'normalizeKeyFieldsForSave skips action-chain peers'
);
assert.match(seqJs, /data-seq-flow|stepFlowHtml/, 'saved list workflow expand');

assert.match(html, /keysRailStartBadge|keysColTriggerLbl/, 'trigger badge uses translated i18n key');
assert.match(seqCss, /align-items:\s*center/, 'add ＋ row is centered');

assert.match(homeLive, /home-record-card-cancel|homeRecordCardCancel/, 'record popup has cancel');
assert.match(homeLive, /Esc/, 'record cancel mentions Esc');
assert.match(homeLive, /dismiss:\s*dismiss/, 'record overlay exposes dismiss without cancel race');
assert.match(homeLive, /openKeysAimDemoModal/, 'aim demo opens modal');
assert.match(homeLive, /keysSeqAimDemoSpeed|--keys-aim-dur/, 'aim demo speed is adjustable');
assert.match(seqCss, /--keys-aim-dur/, 'aim demo CSS uses speed variable');

const rustAction = readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8');
assert.match(rustAction, /Ime \{/, 'Action::Ime variant');
assert.match(rustAction, /rename = "presetId"/, 'presetId camelCase serde');

const kb = readFileSync(path.join(root, 'src-tauri/src/keyboard.rs'), 'utf8');
assert.match(kb, /Action::Ime/, 'run_action_sequence handles Ime');

const ver = readFileSync(path.join(root, 'src-tauri/src/voice_end_runtime.rs'), 'utf8');
assert.match(ver, /ime_needs_aim/, 'aim-before-ime in run_mapping_target_sequence');
assert.match(ver, /Action::Ime \{ value/, 'single Ime counts as wake key');

const shell = readFileSync(path.join(root, 'src/js/shared/shell-ia-convergence.js'), 'utf8');
assert.match(shell, /keysSeq:\s*\{\s*panel:\s*'keysSeq'/, 'shell-ia keysSeq');

let committed = null;
const mapping = {
  id: 'm1',
  label: 'Test',
  triggerKey: 'F13',
  targetKey: 'RAlt',
  imePresetId: 'typeless',
  targetActions: []
};

const context = {
  console,
  document: {
    getElementById: () => null
  },
  OneToneI18n: { t: (k, fb) => fb || k },
  OneToneImePresets: {
    presetById: (id) => (id === 'typeless' ? { id: 'typeless', targetKey: 'RAlt' } : null)
  },
  OneToneMappingCore: {
    selected: () => mapping,
    byId: (id) => (id === mapping.id ? mapping : null)
  },
  OneToneHomeTargetActions: {
    render() {},
    commit(id, acts) {
      committed = { id, acts };
    }
  },
  OneToneSettingsDrawer: { open() {} }
};
context.window = context;
context.globalThis = context;

const src = readFileSync(path.join(root, 'src/js/features/mapping/keys-seq-panel.js'), 'utf8');
vm.runInNewContext(src, context);

assert.ok(context.OneToneKeysSeqPanel, 'OneToneKeysSeqPanel exported');
const migrated = context.OneToneKeysSeqPanel.ensureImeStepOnHabit(mapping);
assert.equal(migrated, true, 'empty legacy chain → ime step');
assert.equal(mapping.targetActions[0].type, 'ime');
assert.equal(mapping.targetActions[0].presetId, 'typeless');
assert.equal(mapping.targetActions[0].value, 'RAlt');
assert.equal(mapping.targetActions[0].aim, 'auto');
assert.equal(mapping.targetActions.length, 1, 'ime only on empty migrate');
assert.ok(committed && committed.acts[0].type === 'ime', 'commit called with ime');

const again = context.OneToneKeysSeqPanel.ensureImeStepOnHabit(mapping);
assert.equal(again, false, 'idempotent when ime already present');

// User text-only chain + leftover habit imePresetId must NOT resurrect 语音输入法.
const textOnly = {
  id: 'm2',
  label: 'Text',
  triggerKey: "LCtrl+'",
  targetKey: 'RAlt',
  imePresetId: 'typeless',
  targetActions: [{ type: 'text', value: '1' }]
};
committed = null;
assert.equal(
  context.OneToneKeysSeqPanel.ensureImeStepOnHabit(textOnly),
  false,
  'text-only chain is not force-filled with ime'
);
assert.equal(textOnly.targetActions.length, 1);
assert.equal(textOnly.targetActions[0].type, 'text');
assert.equal(committed, null, 'no commit when skip migrate');

console.log('ok test-keys-seq-ime-step');
