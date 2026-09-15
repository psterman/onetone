/**
 * Prompt inject save → voice scene list. Run: node scripts/test-voice-prompt-save.mjs
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
const i18n = read('src/js/core/i18n.js');

check('save button in prompt pane', html.includes('id="btnVoicePromptSaveScene"'));
check('save row before land copy', html.indexOf('id="btnVoicePromptSaveScene"') < html.indexOf('id="voicePromptLand"'));
check('save css', css.includes('.voice-prompt-save-row'));
check('rail savePromptToScene', rail.includes('function savePromptToScene'));
check('rail applyPromptMapping', rail.includes('function applyPromptMapping'));
check('rail exports apply/save', rail.includes('applyPromptMapping:applyPromptMapping') && rail.includes('savePromptToScene:savePromptToScene'));
check('picker savePromptInjectMapping', picker.includes('function savePromptInjectMapping'));
check('picker prompt kind', picker.includes("kind: 'prompt'"));
check('picker excludes prompt from customKey', /function isCustomKeyMatchMapping[\s\S]*?if \(isPromptInjectMapping\(m\)\) return false/.test(picker));
check('panel promptRow', panel.includes('function promptRow'));
check('panel voice filter prompt', panel.includes("r.kind === 'prompt'"));
check('panel selectMapping', panel.includes('function selectMapping'));
check('autosave schedule', rail.includes('scheduleAutosavePromptScene'));
check('savePromptText triggers autosave', /function savePromptText[\s\S]*scheduleAutosavePromptScene/.test(rail));
check('activeHost prefers voiceWake', /settingsPanel === 'voiceWake'/.test(panel));
check('custom preset button', html.includes('btnVoicePromptCustom') || html.includes('data-prompt-preset="custom"'));
check('save button primary copy', html.includes('保存到本场景列表'));
check('startNewCustomPrompt', rail.includes('startNewCustomPrompt'));
check('forceCreate support', picker.includes('forceCreate') && rail.includes('promptForceNew'));
check('新建动作 routes prompt', panel.includes("intent === 'prompt'") && panel.includes('startNewCustomPrompt'));
check('need app scene toast', picker.includes('voicePromptNeedAppScene'));

if (fail) {
  console.error('\n' + fail + ' failed, ' + pass + ' passed');
  process.exit(1);
}
console.log('\n' + pass + ' passed');
