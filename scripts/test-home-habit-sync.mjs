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

const workbenchSrc = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const panelsSrc = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
const drawerSrc = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
const bannerSrc = readFileSync(join(root, 'src/js/features/mapping/habit-channel-edit-banner.js'), 'utf8');
const cssSrc = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');

console.log('[home-habit-sync] edit context bootstrap:');
check('ensureEditContextFromRuntime export', bannerSrc.includes('ensureEditContextFromRuntime:ensureEditContextFromRuntime'));
check('drawer calls ensureEditContextFromRuntime', drawerSrc.includes('ensureEditContextFromRuntime'));
check('openHeroSettings uses openHabitChannelChip', workbenchSrc.includes('openHabitChannelChip(channel)'));
check('bindNav channel uses openHabitChannelChip', workbenchSrc.includes("row.panel==='voiceWake'?'voice':row.panel"));

console.log('[home-habit-sync] flyout persist:');
check('renderScenarioPanel no inline flyout shell', !panelsSrc.includes("html+=sceneChipFlyoutShellHtml()"));
check('ensureSceneChipFlyoutShell export', panelsSrc.includes('ensureSceneChipFlyoutShell:ensureSceneChipFlyoutShell'));
check('reanchor after scenario render', panelsSrc.includes('reanchorChipFlyout'));
check('reanchorChipFlyout export', workbenchSrc.includes('reanchorChipFlyout:reanchorChipFlyout'));
check('flyout hover bridge css', cssSrc.includes('.wb-scene-chip-flyout::before'));
check('flyout hide delay 280ms', workbenchSrc.includes('setTimeout(hide,280)'));
check('flyout fixed positioning', workbenchSrc.includes("fly.style.position='fixed'"));
check('flyout mount on homeWorkbench', panelsSrc.includes("$('homeWorkbench')||document.body"));
check('flyout pin hint copy', panelsSrc.includes('homeWbChipFlyoutPinHint'));
check('softPad edit banner html', readFileSync(join(root, 'src/index.html'), 'utf8').includes('habitScenarioContextBannerSoftPad'));
check('softPad in edit banner panels', bannerSrc.includes("panel:'softPad'"));
check('keys page brand title', readFileSync(join(root, 'src/index.html'), 'utf8').includes('id="keysPageBrandTitle"'));
check('softPad page brand title', readFileSync(join(root, 'src/index.html'), 'utf8').includes('id="softPadPageBrandTitle"'));

console.log(`[home-habit-sync] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
