// P12c-2..6 源码护栏单测（批量）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.error('  FAIL ' + name); }
}

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
const panelSrc = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
const tableSrc = readFileSync(join(root, 'src/js/features/mapping/habit-key-mapping-table.js'), 'utf8');
const listSrc = readFileSync(join(root, 'src/js/features/mapping/mapping-list.js'), 'utf8');
const html = readFileSync(join(root, 'src/index.html'), 'utf8');
const islandStatusSrc = readFileSync(join(root, 'src-islands/islands/keys-status-island.tsx'), 'utf8');
const stripSrc = readFileSync(join(root, 'src/js/features/mapping/habit-channel-status-strip.js'), 'utf8');

console.log('[keys-deep-p12c] P12c-2 pills:');
check('export buildKeysStatusPillsModel', tableSrc.includes('buildKeysStatusPillsModel:buildKeysStatusPillsModel'));
check('pills 岛守卫', tableSrc.includes('__otKeysStatusPillsMounted'));
check('main mount pills', mainSrc.includes('__otMountKeysStatusPillsIsland'));
check('drawer pills', drawerSrc.includes('__otMountKeysStatusPillsIsland'));
check('index habitKeyMapStTrigger', html.includes('id="habitKeyMapStTrigger"'));

console.log('[keys-deep-p12c] P12c-3 recording:');
check('export buildKeysRecordingFeedbackModel', panelSrc.includes('buildKeysRecordingFeedbackModel:buildKeysRecordingFeedbackModel'));
check('recording 岛守卫', panelSrc.includes('__otKeysRecordingFeedbackMounted'));
check('main mount recording', mainSrc.includes('__otMountKeysRecordingFeedbackIsland'));
check('drawer recording', drawerSrc.includes('__otMountKeysRecordingFeedbackIsland'));
check('index keysRecordingFeedback', html.includes('id="keysRecordingFeedback"'));

console.log('[keys-deep-p12c] P12c-4 hub:');
check('export buildKeysHubSchemeListModel', panelSrc.includes('buildKeysHubSchemeListModel:buildKeysHubSchemeListModel'));
check('hub 岛守卫', panelSrc.includes('__otKeysHubSchemeListMounted'));
check('main mount hub', mainSrc.includes('__otMountKeysHubSchemeListIsland'));
check('drawer hub', drawerSrc.includes('__otMountKeysHubSchemeListIsland'));
check('index keysHubSchemeList', html.includes('id="keysHubSchemeList"'));

console.log('[keys-deep-p12c] P12c-5 strip:');
check('export buildKeysAppContextStripModel', panelSrc.includes('buildKeysAppContextStripModel:buildKeysAppContextStripModel'));
check('strip 岛守卫', panelSrc.includes('__otKeysAppContextStripMounted')||panelSrc.includes('applyKeysHabitStripHost'));
check('main mount strip', mainSrc.includes('__otMountKeysAppContextStripIsland'));
check('drawer strip', drawerSrc.includes('__otMountKeysAppContextStripIsland'));
check('index keysHabitStripWrap', html.includes('id="keysHabitStripWrap"'));
check('shouldShowHabitStrip export', panelSrc.includes('shouldShowHabitStrip:shouldShowHabitStrip'));
check('habit strip not hidden by scenario css', !readFileSync(join(root, 'src/css/app.css'), 'utf8').includes('#settingsPanelKeys.is-scenario-config #keysAppBindingStrip'));

console.log('[keys-deep-p12c] header slim:');
check('index no btnKeysTestTop', !html.includes('id="btnKeysTestTop"'));
check('index no btnKeysSave', !html.includes('id="btnKeysSave"'));
check('index no btnKeysSchemeAdd', !html.includes('id="btnKeysSchemeAdd"'));
check('index toggle kept', html.includes('id="btnKeysMappingEnable"'));
check('index habit strip add kept', html.includes('id="btnKeysHabitStripAdd"'));
check('index meta hidden', html.includes('id="keysSummaryMeta"') && html.includes('keysSummaryMeta" hidden'));
check('index no keysUnifiedActivate', !html.includes('id="keysUnifiedActivate"'));
check('persistEditorIfDirty export', panelSrc.includes('persistEditorIfDirty:persistEditorIfDirty'));
check('drawer close autosave', drawerSrc.includes('persistEditorIfDirty'));
check('switch autosave', panelSrc.includes('if(isEditorDirty()) persistEditorIfDirty()'));
check('status island toggle only', islandStatusSrc.includes('btnKeysMappingEnable') && !islandStatusSrc.includes('btnKeysSave'));
check('keys strip noop', stripSrc.includes('if(spec.unified){\n      return;\n    }'));

console.log('[keys-deep-p12c] P12c-6 display:');
check('export buildKeysDisplayChromeModel', listSrc.includes('buildKeysDisplayChromeModel:buildKeysDisplayChromeModel'));
check('display 岛守卫', listSrc.includes('__otKeysDisplayChromeMounted'));
check('main mount display', mainSrc.includes('__otMountKeysDisplayChromeIsland'));
check('drawer display', drawerSrc.includes('__otMountKeysDisplayChromeIsland'));
check('index triggerDisplay', html.includes('id="triggerDisplay"'));
check('index targetDisplay', html.includes('id="targetDisplay"'));

console.log(`[keys-deep-p12c] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
