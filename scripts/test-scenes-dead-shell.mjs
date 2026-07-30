// Scenes 死壳：normalize / resolve 映射到 habits；无可达 SceneModeHub 分支
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

const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('resolveSettingsPanelRequest scenes→habits', /if\s*\(\s*panel\s*===\s*'scenes'\s*\)\s*panel\s*=\s*'habits'/.test(drawerSrc));
check('normalizePanel scenes→habits', drawerSrc.includes("if(panel==='scenes') return 'habits'"));
check('navHighlightPanel scenes→habits', drawerSrc.includes("if(panel==='scenes') return 'habits'"));
check('无可达 else if scenes 分支', !/else if\s*\(\s*panel\s*===\s*'scenes'\s*\)/.test(drawerSrc));
check('无 OneToneSceneModeHub.render 调用', !drawerSrc.includes('OneToneSceneModeHub.render'));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('死壳 HTML 仍保留（hidden）', html.includes('id="settingsPanelScenes"'));

console.log(`[scenes-dead-shell] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
