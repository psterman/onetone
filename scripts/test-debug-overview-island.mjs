// Debug overview chrome 单测：model + 守卫 + 挂载入口
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

const panelSrc = readFileSync(join(root, 'src/js/features/debug/debug-panel.js'), 'utf8');
check('导出 buildDebugOverviewModel', panelSrc.includes('buildDebugOverviewModel:buildDebugOverviewModel'));
check('apply 岛守卫', panelSrc.includes('__otDebugOverviewMounted') && panelSrc.includes('__otDebugOverviewSync'));

const domainSrc = readFileSync(join(root, 'src-islands/domain/debugOverview.ts'), 'utf8');
check('domain 跳过 heroTitle 双写', domainSrc.includes('debugHeroTitle') && domainSrc.includes('React'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/debug-overview-island.tsx'), 'utf8');
check('岛含 sync bridge', islandTsx.includes('__otDebugOverviewSync'));
check('岛渲染 heroTitle', islandTsx.includes('model.heroTitle'));

const mainSrc = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 挂载入口', mainSrc.includes('__otMountDebugOverviewIsland'));
check('挂载 debugHeroTitle', mainSrc.includes("mountIsland('debugHeroTitle'"));

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('settings-drawer 接线', drawerSrc.includes('__otMountDebugOverviewIsland'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 debugHeroTitle', html.includes('id="debugHeroTitle"'));

console.log(`[debug-overview] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
