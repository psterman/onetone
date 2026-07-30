// P6b 单测：buildVoiceStatusChromeModel + 守卫 + 挂载入口
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

const headerSrc = readFileSync(join(root, 'src/js/features/voice/voice-page-header-render.js'), 'utf8');
check('导出 buildVoiceStatusChromeModel', headerSrc.includes('buildVoiceStatusChromeModel:buildVoiceStatusChromeModel'));
check('apply 岛守卫', headerSrc.includes('__otVoiceStatusChromeMounted') && headerSrc.includes('__otVoiceStatusChromeSync'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 挂载入口', mainSrc.includes('__otMountVoiceStatusChromeIsland'));
check('挂载 voiceSummaryStatus', mainSrc.includes("mountIsland('voiceSummaryStatus'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线', drawerSrc.includes('__otMountVoiceStatusChromeIsland'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/voice-status-chrome-island.tsx'), 'utf8');
check('岛含 sync bridge', islandTsx.includes('__otVoiceStatusChromeSync'));
check('岛渲染 statusText', islandTsx.includes('model.statusText'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 voiceSummaryStatus', html.includes('id="voiceSummaryStatus"'));
check('index 含 voiceSummaryEngineSwitch', html.includes('id="voiceSummaryEngineSwitch"'));

console.log(`[voice-status-chrome] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
