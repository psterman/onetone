// Guard: 口头指令 = mapping acoustic/voice recordings only (no invented lifecycle copy).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const picker = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);
const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');

const catalogFn = picker
  .split('function voicePickCatalog()')[1]
  .split('function voicePickHabitPill')[0];
const renderBody = picker
  .split('function renderVoicePickHtml')[1]
  .split('function selectionMatchesPick')[0];

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

console.log('[keys-voice-pick-list]');
check('reads acousticVoiceCommands', /acousticVoiceCommands/.test(catalogFn));
check('reads voice agentBindings', /triggerType/.test(catalogFn) && /agentBindings/.test(catalogFn));
check(
  'no lifecycle bridges in catalog',
  !/voiceLifecycleBridges/.test(catalogFn) && !/voicePickSayForKind/.test(catalogFn)
);
check('no invented copy helper in catalog', !/voicePickCopyForAction/.test(catalogFn));
check('shows activation say', /keys-voice-pick-row-say/.test(renderBody));
check('no IME bridge', !/data-bridge-ime/.test(renderBody));
check('empty copy about recorded commands', /keysPickOnlySetEmptyVoice:'[^']*录制/.test(i18n));
check('lead about app recordings', /keysVoicePickLead:'本应用已录制的口令/.test(i18n));

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
