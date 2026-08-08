// Soft Pad stale deferred render abort + overlay gate (static guardrails)
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
const drawer = readFileSync(join(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');

console.log('[soft-pad-stale-abort] openGen:');
check('onPanelLeave ++softPadOpenGen', /function onPanelLeave\([\s\S]*?\+\+softPadOpenGen/.test(hub));
check('render captures openGen early', /function render\([\s\S]*?var openGen = \+\+softPadOpenGen[\s\S]*?paintSoftPadLanding/.test(hub));
check('paintSoftPadLanding checks openGen', /function paintSoftPadLanding\([\s\S]*?openGen !== softPadOpenGen/.test(hub));
check('stale abort log', hub.includes("fe softPad.render aborted stale"));

console.log('[soft-pad-stale-abort] drawer defer:');
check('softPad 延后捕获 softOpenGen', /panel==='softPad'[\s\S]*?softOpenGen/.test(drawer));
check('延后路径 stale abort', /softOpenGen!==global\.OneToneSoftPadHub\.getOpenGen\(\)[\s\S]*?aborted stale/.test(drawer) ||
  /getOpenGen\(\)[\s\S]*?fe softPad\.render aborted stale/.test(drawer));
check('延后路径 panel 校验 abort', /normalizePanel\(ui\.settingsPanel\)!=='softPad'[\s\S]*?aborted stale/.test(drawer));

console.log('[soft-pad-stale-abort] overlay gate:');
check('floatingOverlayBlocked 含 drawerOpen', /function floatingOverlayBlocked[\s\S]*?drawerOpen/.test(hub));
check('floatingOverlayBlocked 含 isSoftPadPageVisible', /function floatingOverlayBlocked[\s\S]*?isSoftPadPageVisible\(\)/.test(hub));
check('softPad 进页 ensureFloatingOverlayHidden', /panel==='softPad'[\s\S]*?ensureFloatingOverlayHidden/.test(drawer));
check('心跳 softPadRender', hub.includes("setTag('softPadRender')") && hub.includes('clearTag'));
check('landing 结束才 clearTag', /function paintSoftPadLanding\([\s\S]*?finally\s*\{[\s\S]*?clearSoftPadRenderTag/.test(hub));
check('openDrawer 先 pause camera', /ui\.drawerOpen=true;[\s\S]*?setDrawerUiPaused\(true\)[\s\S]*?setSettingsPanel/.test(drawer));

const appRs = readFileSync(join(root, 'src-tauri/src/ipc/commands/runtime/app.rs'), 'utf8');
check('settings open dismiss_overlay', /cmd_set_settings_drawer_open[\s\S]*?if open[\s\S]*?dismiss_overlay/.test(appRs));

console.log(`[soft-pad-stale-abort] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
