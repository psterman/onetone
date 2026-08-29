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

console.log('[keys-deep-p12c] P12c-4 hub removed:');
check('no keysHubSchemeList DOM', !html.includes('id="keysHubSchemeList"'));
check('no keysPanelAside DOM', !html.includes('id="keysPanelAside"'));
check('no hub island mount', !mainSrc.includes('__otMountKeysHubSchemeListIsland'));
check('no hub drawer mount', !drawerSrc.includes('__otMountKeysHubSchemeListIsland'));
check('no buildKeysHubSchemeListModel export', !panelSrc.includes('buildKeysHubSchemeListModel:'));

console.log('[keys-deep-p12c] P12c-5 strip removed:');
check('no keysAppBindingStrip DOM', !html.includes('id="keysAppBindingStrip"'));
check('no keysWorkflowTabs DOM', !html.includes('id="keysWorkflowTabs"'));
check('no strip island mount', !mainSrc.includes('__otMountKeysAppContextStripIsland'));
check('no workflow island mount', !mainSrc.includes('__otMountKeysWorkflowIsland'));
check('no buildKeysAppContextStripModel export', !panelSrc.includes('buildKeysAppContextStripModel:'));
check('no shouldShowHabitStrip export', !panelSrc.includes('shouldShowHabitStrip:'));
check('edit banner module', readFileSync(join(root, 'src/js/features/mapping/habit-channel-edit-banner.js'), 'utf8').includes('OneToneHabitChannelEditBanner'));
check('context banner delegates to edit banner', readFileSync(join(root, 'src/js/features/mapping/habit-scenario-context-banner.js'), 'utf8').includes('OneToneHabitChannelEditBanner.renderAll'));
check('drawer syncPanelContext', drawerSrc.includes('OneToneHabitChannelEditBanner.syncPanelContext'));
check('index edit banner script', html.includes('habit-channel-edit-banner.js'));

console.log('[keys-deep-p12c] header slim:');
check('index no btnKeysTestTop', !html.includes('id="btnKeysTestTop"'));
check('index no btnKeysSave', !html.includes('id="btnKeysSave"'));
check('index no btnKeysSchemeAdd', !html.includes('id="btnKeysSchemeAdd"'));
check('index toggle kept', html.includes('id="btnKeysMappingEnable"'));
check('index no btnKeysHabitStripAdd', !html.includes('id="btnKeysHabitStripAdd"'));
check('index meta hidden', html.includes('id="keysSummaryMeta"') && html.includes('keysSummaryMeta" hidden'));
check('index no keysUnifiedActivate', !html.includes('id="keysUnifiedActivate"'));
check('persistEditorIfDirty export', panelSrc.includes('persistEditorIfDirty:persistEditorIfDirty'));
check('drawer close autosave', drawerSrc.includes('persistEditorIfDirty'));
check('switch autosave', panelSrc.includes('if(isEditorDirty()) persistEditorIfDirty()'));
check('status island toggle only', islandStatusSrc.includes('btnKeysMappingEnable') && !islandStatusSrc.includes('btnKeysSave'));
check('keys strip noop', stripSrc.includes('if(spec.unified){\n      return;\n    }'));
check('keys page single column', readFileSync(join(root, 'src/css/app.css'), 'utf8').includes('grid-template-columns:minmax(0,1fr)'));

console.log('[keys-deep-p12c] P12c-6 display:');
check('export buildKeysDisplayChromeModel', listSrc.includes('buildKeysDisplayChromeModel:buildKeysDisplayChromeModel'));
check('display 岛守卫', listSrc.includes('__otKeysDisplayChromeMounted'));
check('main mount display', mainSrc.includes('__otMountKeysDisplayChromeIsland'));
check('drawer display', drawerSrc.includes('__otMountKeysDisplayChromeIsland'));
check('index triggerDisplay', html.includes('id="triggerDisplay"'));
check('index targetDisplay', html.includes('id="targetDisplay"'));

console.log(`[keys-deep-p12c] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
