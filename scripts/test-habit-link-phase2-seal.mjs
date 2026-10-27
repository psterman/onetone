/**
 * Phase-2 seal: L-class match create/edit navigates to Habits; native K/V/P keepers remain.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

const cam = src('src/js/features/voice/voice-bridge-camera.js');
check('camera bridge has openHabitPhraseEditor', cam.includes('openHabitPhraseEditor'));
check('camera addPhrase goes to habits', /function addPhrase[\s\S]*openHabitPhraseEditor/.test(cam));
check('camera editCamPhrase goes to habits', /function editCamPhrase[\s\S]*openHabitPhraseEditor/.test(cam));
check('camera openHabitsMatch passes commandRef', /openHabitsMatch\([\s\S]*commandRef:\s*slot/.test(cam));
check(
  'camera ensureVoice no longer creates bindings',
  /function ensureVoice\(\)\{[\s\S]*return null/.test(cam) && !/list\.push\(ab\)/.test(cam)
);

const hub = src('src/js/features/agent/soft-pad-hub-ui.js');
check('soft pad openHabitCommandMatch', hub.includes('openHabitCommandMatch'));
check('soft pad CTA wired', hub.includes('btnSoftPadHabitMatch') && hub.includes('openHabitCommandMatch'));
check('soft pad exports openHabitCommandMatch', hub.includes('openHabitCommandMatch: openHabitCommandMatch'));

const html = src('src/index.html');
check('index has soft pad habit match CTA', html.includes('id="btnSoftPadHabitMatch"'));
check('soft pad CTA in HTML', html.includes('data-soft-pad-habit-match'));

const adapters = src('src/js/features/agent/action-binding-adapters.js');
check(
  'softPad openEditor → Habits',
  /openEditor:\s*function[\s\S]*openHabitsMatch/.test(adapters)
);

const picker = src('src/js/features/mapping/keys-channel-command-picker.js');
check('keys picker prependHabitMatchLink', picker.includes('prependHabitMatchLink'));
check('keys picker data-habit-command-match click', picker.includes('data-habit-command-match'));
check(
  'keys picker habit match opens Habits',
  /data-habit-command-match[\s\S]*openHabitsMatch/.test(picker)
);

const scene = src('src/js/features/mapping/keys-scene-actions-panel.js');
check('scene channel map → Habits', scene.includes('openHabitsMatch'));
check('scene channel map not keys2', !/openChannelMapSheet[\s\S]*panel:\s*['"]keys2['"]/.test(scene));

const keys2 = src('src/js/features/settings/keys2-command-card.js');
check('keys2 READ_ONLY', /READ_ONLY:\s*true/.test(keys2));
check('keys2 no write controls', !/keys2BtnAddPhrase|keys2BtnRecordKey|data-k2-clear/.test(keys2));

const hcl = src('src/js/features/mapping/habit-command-link.js');
check('habit has channels overview (lanes)', hcl.includes('function channelsOverviewHtml'));
check('habit detail pane toggle', hcl.includes('data-hcl-detail-pane'));
check('index removed keys2 nav', !html.includes('id="settingsNavKeys2"') && !html.includes('id="wbNavKeys2"'));
check(
  'keys2 panel redirects to habits',
  /if\(panel==='keys2'\)[\s\S]*return 'habits'/.test(src('src/js/features/settings/settings-drawer.js'))
);

// KEEP: Soft Pad still has native keycap commit (P-class look/layout)
const pad = src('src/js/features/agent/codex-micro-pad-ui.js');
check('KEEP Soft Pad commitEditKeycapDraft', pad.includes('function commitEditKeycapDraft'));
check('habit hub uses commandIdentity', src('src/js/features/mapping/habit-command-link.js').includes('function commandIdentity'));
check(
  'Soft Pad capability pick → Habits',
  /function applySoftPadCapabilityPick[\s\S]*openHabitsMatch/.test(pad)
);
check(
  'Soft Pad semantic pick → Habits',
  /function openSoftPadSemanticPick[\s\S]*openHabitsMatch/.test(pad)
);

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
