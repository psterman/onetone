// P6e 单测：声学三宿主 paint-target 守卫 + 挂载入口
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

const acousticSrc = readFileSync(join(root, 'src/js/features/voice/voice-wake-acoustic.js'), 'utf8');
check('resolveAcousticPaintHost 守卫', acousticSrc.includes('__otVoiceAcousticMounted') && acousticSrc.includes('data-voice-acoustic-paint'));
check('导出 resolveAcousticPaintHost', acousticSrc.includes('resolveAcousticPaintHost:resolveAcousticPaintHost'));

const domainSrc = readFileSync(join(root, 'src-islands/domain/voiceAcousticHosts.ts'), 'utf8');
check('domain 含三宿主 id', domainSrc.includes('voiceWakeAcousticHost') && domainSrc.includes('voiceCancelAcousticHost') && domainSrc.includes('voiceEndAcousticHost'));
check('domain 含 refreshVoiceAcousticPaint', domainSrc.includes('refreshVoiceAcousticPaint'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/voice-acoustic-host-island.tsx'), 'utf8');
check('岛含 paint 子节点', islandTsx.includes('data-voice-acoustic-paint'));
check('岛 bump mount', islandTsx.includes('bumpVoiceAcousticMount'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 挂载入口', mainSrc.includes('__otMountVoiceAcousticIslands'));
check('挂载三宿主', mainSrc.includes("'voiceWakeAcousticHost'") && mainSrc.includes("'voiceCancelAcousticHost'") && mainSrc.includes("'voiceEndAcousticHost'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线', drawerSrc.includes('__otMountVoiceAcousticIslands'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含三声学宿主', html.includes('id="voiceWakeAcousticHost"') && html.includes('id="voiceCancelAcousticHost"') && html.includes('id="voiceEndAcousticHost"'));

console.log(`[voice-acoustic-host] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
