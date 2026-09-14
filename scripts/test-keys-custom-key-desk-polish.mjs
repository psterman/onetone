// Guard: custom-key create skips native prompt; desk fills pane.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(
  join(root, 'src/js/features/mapping/keys-channel-command-picker.js'),
  'utf8'
);
const css = readFileSync(join(root, 'src/css/keys-workflow.css'), 'utf8');

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

console.log('[keys-custom-key-desk-polish]');
check(
  'create uses default label not prompt',
  /var named = nextCustomKeyMatchLabel\(\)/.test(src)
);
check(
  'create does not call prompt for name',
  !/copy\.label = promptCustomKeyMatchName/.test(src) &&
    !/named = promptCustomKeyMatchName\(''\)/.test(src)
);
check(
  'launch inherits 01 trigger (no record button)',
  /keysCustomKeyMatchLaunchFrom01/.test(src) &&
    /syncCustomKeyLaunchFromHabit/.test(src) &&
    !/data-match-launch-record/.test(src)
);
check('empty hint copy', /keysCaptureSeqHintEmpty/.test(src));
check(
  'create copies habit triggerKey',
  /copy\.triggerKey = String\(source\.triggerKey/.test(src)
);
check(
  'desk fills pane-right',
  /keys-channel-pane-right:has\(#keysCaptureTargetActionsHost:not\(\[hidden\]\) \.keys-custom-key-split\)/.test(
    css
  )
);
check(
  'split borderless in channel frame',
  /#settingsPanelKeys \.keys-custom-key-split,\s*\n\.keys-capture-popover \.keys-custom-key-split \{[\s\S]*?border:\s*none/.test(
    css
  )
);

if (fail) {
  console.error(fail + ' failed');
  process.exit(1);
}
console.log(pass + ' passed');
