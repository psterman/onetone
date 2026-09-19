/**
 * Prompt inject: multi-peer library; scene wake only (no per-peer wake UI).
 * Run: node scripts/test-voice-prompt-save.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

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

const html = read('src/index.html');
const css = read('src/css/voice-page-shell.css');
const rail = read('src/js/features/voice/voice-intent-rail.js');
const picker = read('src/js/features/mapping/keys-channel-command-picker.js');
const panel = read('src/js/features/mapping/keys-scene-actions-panel.js');

check('no save button', !html.includes('id="btnVoicePromptSaveScene"'));
check('autosave hint', html.includes('id="voicePromptSaveHint"') && html.includes('输入后自动保存'));
check('no wake input', !html.includes('id="voicePromptWakePhrases"'));
check('library host', html.includes('id="voicePromptLib"'));
check('new button', html.includes('btnVoicePromptCustom') && html.includes('btnVoicePromptNewMain') && html.includes('data-voice-prompt-new'));
check('lib empty state', rail.includes('voicePromptLibEmpty') && css.includes('voice-prompt-lib__empty'));
check('new primary css', css.includes('.voice-prompt-new-primary'));
check('lib css', css.includes('.voice-prompt-lib__chip'));
check('listPromptPeersForApp', picker.includes('function listPromptPeersForApp'));
check('forceCreate honored', picker.includes('var forceCreate = !!opts.forceCreate'));
check('prune is noop', /function pruneToSinglePromptPeer\(\)\s*\{\s*return 0;/.test(picker));
check('rail paintPromptLibrary', rail.includes('function paintPromptLibrary'));
check('save clears peer wake', rail.includes('wakePhrases:[]'));
check('save forceCreate when new', rail.includes('forceCreate:!existing'));
check('flush before new', rail.includes('function flushPromptDraftQuiet'));
check('autosave creates', rail.includes("t('voicePromptSaving'") && !rail.includes('Only autosave when we already have the one peer'));
check('no text dedupe in dock', !panel.includes('seenPromptText'));
check('cache bust', html.includes('voice-intent-rail.js?v=prompt-title-1') && html.includes('voice-page-shell.css?v=prompt-title-1'));
check('armed banner host', html.includes('id="voicePromptArmed"') && css.includes('.voice-prompt-armed'));
check('from-tpl host', html.includes('id="voicePromptFromTpl"') && css.includes('.voice-prompt-from-tpl'));
check('template pills', rail.includes('function applyPromptTemplate') && rail.includes('data-prompt-tpl') && css.includes('.voice-prompt-tpl-pill'));
check('template dedupe', rail.includes("voicePromptTplAlready") && rail.includes('body===want'));
check('single lib not dual manage', !html.includes('常用模板') && rail.includes('voicePromptFromTpl'));
check('optional title field', html.includes('id="voicePromptTitle"') && css.includes('.voice-prompt-title') && rail.includes('resolvePromptLabel'));
check('aim default none', /id="voiceInputAimStrategyNone"[^>]*\bchecked\b/.test(html) && html.includes('data-aim="none"'));
check('HTML aim order', html.indexOf('data-aim-value="none"') < html.indexOf('data-aim-value="auto"') && html.indexOf('data-aim-value="auto"') < html.indexOf('data-aim-value="probe"'));
check('autosave hint resolve', rail.includes('promptDraftIsDirty') && rail.includes('data-save-state') && rail.includes('voicePromptEditing'));
check('prompt desk fills height', css.includes('#voiceIntentPicker:not([hidden])') && css.includes('min-height:min(70vh') && css.includes('.voice-prompt-col--what'));
check('aim demo survives park', /voice-wake-test-wave span/.test(read('src/css/voice-feedback-rail.css')) && !/html\.ot-voice-wake-park #settingsPanelVoiceWake \*/.test(read('src/css/voice-feedback-rail.css')));
check('aim demo no restart spam', rail.includes('prev!==aim') && rail.includes('restartAimDemoAnim'));
check('no wake UI helpers', !rail.includes('readWakePhrasesFromUi') && !rail.includes('setWakePhrasesUi'));
check('desk body markup', html.includes('voice-prompt-desk__body') && html.includes('voice-prompt-desk__main') && html.includes('voice-prompt-col--what') && html.includes('voice-prompt-col--send') && html.includes('voice-prompt-lib-pane'));
check('aim above prompt', html.indexOf('voice-prompt-col--send') < html.indexOf('voicePromptInjectBody') && html.indexOf('voice-prompt-lib-pane') < html.indexOf('voice-prompt-col--send'));
check('fused aim explain', html.includes('voiceAimExplain') && html.includes('voiceAimDemo') && html.includes('data-aim-explain'));
check('aim demo collapsed by default', html.includes('btnVoiceAimDemoToggle') && /id="voiceAimExplain"[^>]*\bhidden\b/.test(html));
check('cal outside demo', html.includes('id="voicePromptAimCalRow"') && html.indexOf('id="voiceAimExplain"') < html.indexOf('id="voicePromptAimCalRow"'));
check('desk body css', css.includes('.voice-prompt-desk__body') && css.includes('.voice-prompt-desk__main') && css.includes('.voice-aim-demo'));
check('aim data sync', rail.includes('function syncAimStrategyChrome') && rail.includes('setAimDemoOpen') && rail.includes('voiceAimDemoBadge'));
check('aim slot tabs', html.includes('voiceAimSlotTabs') && css.includes('.voice-aim-slot-tab'));
check('lib count host', html.includes('voicePromptLibCount'));

if (fail) {
  console.error('\n' + fail + ' failed, ' + pass + ' passed');
  process.exit(1);
}
console.log('\n' + pass + ' passed');
