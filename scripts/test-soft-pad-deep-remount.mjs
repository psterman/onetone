// Wave3 P14k–n：SoftPad 深编辑器 remount 守卫源码护栏（guard-first，无新岛强制）
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

const hub = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
const pad = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');

console.log('[soft-pad-deep] P14k runtime:');
check('softPadSubpageAlreadyPainted 含 runtime', hub.includes("view === 'runtime'") && hub.includes('data-show-mode'));
check('AlreadyPainted 不盲信 RuntimeMounted 旗标', /view === 'runtime'[\s\S]*?data-show-mode/.test(hub) &&
  !/view === 'runtime'[\s\S]*?__otSoftPadRuntimeMounted[\s\S]*?querySelector/.test(hub));
check('runtime 热路径 syncRuntimeCheckboxes', hub.includes('syncRuntimeCheckboxes(entry)'));
check('paintSubpage skip-remount', hub.includes('skip-remount') && hub.includes('softPadSubpageAlreadyPainted'));
check('Pad 渲染后置 RuntimeMounted', pad.includes('__otSoftPadRuntimeMounted = true'));

console.log('[soft-pad-deep] P14l presentation:');
check('presentation 热路径不 remount', /panel === 'presentation'[\s\S]*?return;/.test(hub));
check('AlreadyPainted 含 presentation DOM', hub.includes('[data-pad-skin-opt]'));
check('Pad 渲染后置 PresentationMounted', pad.includes('__otSoftPadPresentationMounted = true'));

console.log('[soft-pad-deep] P14m layout shell:');
check('layout remountLayout 守卫', hub.includes('remountLayout !== false'));
check('AlreadyPainted 含 layout editor', hub.includes('data-soft-pad-layout-editor'));
check('Pad layout shell HTML', pad.includes('data-soft-pad-layout-editor="1"') && pad.includes('data-soft-pad-layout-tools'));
check('Pad 渲染后置 LayoutShellMounted', pad.includes('__otSoftPadLayoutShellMounted = true'));

console.log('[soft-pad-deep] P14n editKeycap:');
check('openEditKeycap 仍由 Pad 导出', pad.includes('openEditKeycap: openEditKeycap'));
check('layout 右侧为命令列表 + inline 详情表单', pad.includes('soft-pad-action-library') &&
  pad.includes("mode: 'inline'") && pad.includes('buildLayoutKeyFormHtml') &&
  pad.includes('soft-pad-layout-stack') && pad.includes('layoutKeyCurrentAction'));
check('clearSubpage 清深面板挂载标记', hub.includes('__otSoftPadRuntimeMounted = false') && hub.includes('__otSoftPadLayoutShellMounted = false'));

console.log('[soft-pad-deep] screen opacity float:');
check('openRingFloat look 先清空 float', /function openRingFloat[\s\S]*?e\.ringFloat\.innerHTML = ''[\s\S]*?kind === 'look'/.test(hub));
check('look 不经 renderSoftPadPresentationPanel 重挂', /kind === 'look'[\s\S]*?appendScreenOpacityControl[\s\S]*?return;/.test(hub) &&
  !/kind === 'look'[\s\S]*?renderSoftPadPresentationPanel[\s\S]*?appendScreenOpacityControl/.test(hub));
check('appendScreenOpacityControl 先移除旧控件', hub.includes("querySelectorAll('.soft-pad-ring-float__opacity')") &&
  hub.includes('softPadScreenOpacityLbl'));

console.log(`[soft-pad-deep] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
