// Camera flow chrome 单测：model + 守卫 + 挂载入口（不碰 MediaPipe）
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

const wfSrc = readFileSync(join(root, 'src/js/features/camera/camera-workflow.js'), 'utf8');
check('导出 buildCameraFlowChromeModel', wfSrc.includes('buildCameraFlowChromeModel:buildCameraFlowChromeModel'));
check('apply 岛守卫', wfSrc.includes('__otCameraFlowChromeMounted') && wfSrc.includes('__otCameraFlowChromeSync'));

const domainSrc = readFileSync(join(root, 'src-islands/domain/cameraFlowChrome.ts'), 'utf8');
check('domain 跳过 triggerHint 双写', domainSrc.includes("tab === 'trigger'") && domainSrc.includes('cameraFlowNodeTriggerHint'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/camera-flow-chrome-island.tsx'), 'utf8');
check('岛含 sync bridge', islandTsx.includes('__otCameraFlowChromeSync'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 挂载入口', mainSrc.includes('__otMountCameraFlowChromeIsland'));
check('挂载 cameraFlowNodeTriggerHint', mainSrc.includes("mountIsland('cameraFlowNodeTriggerHint'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线', drawerSrc.includes('__otMountCameraFlowChromeIsland'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 cameraFlowNodeTriggerHint', html.includes('id="cameraFlowNodeTriggerHint"'));

console.log(`[camera-flow-chrome] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
