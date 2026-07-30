// P6c 单测：buildVoiceEngineTabsModel + 守卫 + 挂载入口
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

const wakeSrc = readFileSync(join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
check('导出 buildVoiceEngineTabsModel', wakeSrc.includes('buildVoiceEngineTabsModel:buildVoiceEngineTabsModel'));
check('renderVoiceEngineTabs 岛守卫', wakeSrc.includes('__otVoiceEngineTabsMounted') && wakeSrc.includes('__otVoiceEngineTabsSync'));
check('syncVoiceEngineTabButtons 岛守卫', /function syncVoiceEngineTabButtons[\s\S]*?__otVoiceEngineTabsMounted/.test(wakeSrc));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 挂载入口', mainSrc.includes('__otMountVoiceEngineTabsIsland'));
check('挂载 voiceRecognizeSourceLbl', mainSrc.includes("mountIsland('voiceRecognizeSourceLbl'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线', drawerSrc.includes('__otMountVoiceEngineTabsIsland'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/voice-engine-tabs-island.tsx'), 'utf8');
check('岛含 sync bridge', islandTsx.includes('__otVoiceEngineTabsSync'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 voiceRecognizeSourceGrid', html.includes('id="voiceRecognizeSourceGrid"'));

console.log(`[voice-engine-tabs] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
