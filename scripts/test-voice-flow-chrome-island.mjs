// P6d 单测：buildVoiceFlowChromeModel + 守卫 + 挂载入口
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

const navSrc = readFileSync(join(root, 'src/js/features/voice/voice-step-nav.js'), 'utf8');
check('导出 buildVoiceFlowChromeModel', navSrc.includes('buildVoiceFlowChromeModel:buildVoiceFlowChromeModel'));
check('apply 岛守卫', navSrc.includes('__otVoiceFlowChromeMounted') && navSrc.includes('__otVoiceFlowChromeSync'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 挂载入口', mainSrc.includes('__otMountVoiceFlowChromeIsland'));
check('挂载 voiceFlowNodeWakeHint', mainSrc.includes("mountIsland('voiceFlowNodeWakeHint'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线', drawerSrc.includes('__otMountVoiceFlowChromeIsland'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/voice-flow-chrome-island.tsx'), 'utf8');
check('岛含 sync bridge', islandTsx.includes('__otVoiceFlowChromeSync'));
check('岛渲染 wakeHint', islandTsx.includes('model.wakeHint'));

const domainSrc = readFileSync(join(root, 'src-islands/domain/voiceFlowChrome.ts'), 'utf8');
check('domain 跳过 wakeHint 双写', domainSrc.includes("page === 'wake'") && domainSrc.includes('voiceFlowNodeWakeHint'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 voiceFlowNodes', html.includes('id="voiceFlowNodes"'));
check('index 含 voiceWorkflowPipeline', html.includes('id="voiceWorkflowPipeline"'));

console.log(`[voice-flow-chrome] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
