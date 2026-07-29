// P14 单测：keys workflow + soft pad workflow 岛守卫
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

const keysPanelJs = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
const softPadJs = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
const settingsDrawerJs = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');

console.log('[workflow-islands] P14a Keys:');
check('buildKeysWorkflowTabsModel 已导出', keysPanelJs.includes('buildKeysWorkflowTabsModel:buildKeysWorkflowTabsModel'));
check('workflowTabView 已导出', keysPanelJs.includes('workflowTabView:workflowTabView'));
check('renderWorkflowTabs 岛守卫', keysPanelJs.includes('__otKeysWorkflowMounted') && keysPanelJs.includes('__otKeysWorkflowSync'));
check('main.tsx Keys workflow mount', mainTsx.includes('__otMountKeysWorkflowIsland'));
check('settings-drawer 延迟挂载 Keys workflow', settingsDrawerJs.includes('__otMountKeysWorkflowIsland'));

console.log('[workflow-islands] P14b SoftPad:');
check('buildSoftPadWorkflowModel 已导出', softPadJs.includes('buildSoftPadWorkflowModel: buildSoftPadWorkflowModel'));
check('renderAppSwitcher 岛守卫', softPadJs.includes('__otSoftPadWorkflowMounted') && softPadJs.includes('__otSoftPadWorkflowSync'));
check('renderSchemeList 岛守卫', softPadJs.includes('__otSoftPadWorkflowSync'));
check('main.tsx SoftPad workflow mount', mainTsx.includes('__otMountSoftPadWorkflowIsland'));
check('soft-pad-hub render 挂载 workflow', softPadJs.includes('__otMountSoftPadWorkflowIsland'));

console.log(`[workflow-islands] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
