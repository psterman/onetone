/**
 * Smoke: keys2 parallel preview panel exists; original keys untouched.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const drawer = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
const cardJs = readFileSync(join(root, 'src/js/features/settings/keys2-command-card.js'), 'utf8');
const cardCss = readFileSync(join(root, 'src/css/keys2-command-card.css'), 'utf8');

check('index has settingsPanelKeys (original)', html.includes('id="settingsPanelKeys"'));
check('index has settingsNavKeys (original)', html.includes('id="settingsNavKeys"') && html.includes('data-panel="keys"'));
check('index has settingsPanelKeys2', html.includes('id="settingsPanelKeys2"'));
check('index has settingsNavKeys2', html.includes('id="settingsNavKeys2"') && html.includes('data-panel="keys2"'));
check('index has wbNavKeys2 home sidebar', html.includes('id="wbNavKeys2"') && html.includes('data-wb-nav="keys2"'));
check('index has keys2CommandCardRoot', html.includes('id="keys2CommandCardRoot"'));
const shellIa = readFileSync(join(root, 'src/js/shared/shell-ia-convergence.js'), 'utf8');
check('shell IA maps keys2 → panel keys2', /keys2:\s*\{\s*panel:\s*['"]keys2['"]/.test(shellIa));
const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
check('workbench NAV_PANEL_MAP keys2', /keys2\s*:\s*['"]keys2['"]/.test(wb));
check('index links keys2-command-card.css', html.includes('css/keys2-command-card.css'));
check('index loads keys2-command-card.js', html.includes('js/features/settings/keys2-command-card.js'));

check('PANEL_IDS has keys2', /keys2\s*:\s*['"]settingsPanelKeys2['"]/.test(drawer));
check('PANEL_IDS still has keys', /keys\s*:\s*['"]settingsPanelKeys['"]/.test(drawer));
check('setSettingsPanel handles keys2', drawer.includes("panel==='keys2'"));
const keys2Branch = (drawer.match(/panel==='keys2'[\s\S]*?else if\(panel==='softPad'/) || [''])[0];
check(
  'keys2 does not call refreshKeysPanel',
  keys2Branch.includes("panel==='keys2'") && !/\brefreshKeysPanel\s*\(/.test(keys2Branch)
);
check('isKeysPanel stays keys-only', /function isKeysPanel[\s\S]*?return panel==='keys';/.test(drawer));

check('OneToneKeys2CommandCard exported', cardJs.includes('OneToneKeys2CommandCard'));
check('mount + refresh API', cardJs.includes('mount:') && cardJs.includes('refresh:'));
check('openSheet + keys2CommandSheet exist', cardJs.includes('openSheet:') && cardJs.includes('keys2CommandSheet'));
check('summary → habits copy', cardJs.includes('摘要 → 习惯') || cardJs.includes('只读摘要'));
check('keys2 READ_ONLY flag', /READ_ONLY:\s*true/.test(cardJs));
check('keys2 edits go to habits', cardJs.includes('openHabitsMatch') || cardJs.includes("panel: 'habits'"));
check('keys2 uses buildModel summary', cardJs.includes('buildModel'));
check(
  'keys2 currentMapping falls back to activeSceneId',
  /activeSceneId/.test(cardJs) && /resolveSoftPadEntry/.test(cardJs)
);
check('keys2 has no write controls', !/keys2BtnAddPhrase|keys2BtnRecordKey|data-k2-clear|data-k2-pad|data-k2-gesture/.test(cardJs));
check('demo never mentions captureHeroRef write', !/setCaptureHeroRef|cmd_.*record/.test(cardJs));
check('keys2 never calls ConfigPersist', !/OneToneConfigPersist|saveAsync/.test(cardJs));
check(
  'keys2 never mutates agentBindings/oral/pad',
  !/agentBindings\.push|oralCommandScheme\s*=|codexMicroPad\s*=/.test(cardJs)
);
check('css has keys2-root', cardCss.includes('.keys2-root'));
check('css has sheet + mind', cardCss.includes('.keys2-sheet') && cardCss.includes('.keys2-mind'));
const scene = readFileSync(join(root, 'src/js/features/mapping/keys-scene-actions-panel.js'), 'utf8');
check('scene actions opens channel map sheet', scene.includes('data-channel-map') && scene.includes('openChannelMapSheet'));
check('channel map goes to habits not keys2', scene.includes('openHabitsMatch') || /panel:\s*['"]habits['"]/.test(scene));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
