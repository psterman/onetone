/**
 * Smoke: 软键盘下方「键盘」页（Soft Pad surface + Mac VK hub）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

function check(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    process.exitCode = 1;
    return;
  }
  console.log('ok:', name);
}

const html = read('src/index.html');
const drawer = read('src/js/features/settings/settings-drawer.js');
const shell = read('src/js/shared/shell-ia-convergence.js');
const home = read('src/js/features/home/home-workbench.js');
const i18n = read('src/js/core/i18n.js');
const css = read('src/css/soft-pad-hub.css');
const hub = read('src/js/features/agent/soft-pad-hub-ui.js');
const proto = read('prototypes/onetone-keyboard-mac-hub.html');

check('wb nav keyboard', html.includes('data-wb-nav="keyboard"') && html.includes('homeWbNavKeyboard'));
check('settings nav keyboard under softPad group', /settingsNavSoftPadGroup[\s\S]*settingsNavKeyboard/.test(html));
check('keyboard toolbar inside softPad panel', /settingsPanelSoftPad[\s\S]*keyboardPageToolbar[\s\S]*softPadStatusBar/.test(html));
check('no separate settingsPanelKeyboard', !html.includes('id="settingsPanelKeyboard"'));
check('softPadPageMount wraps body', html.includes('id="softPadPageMount"') && html.includes('id="softPadPageBody"'));
check('resolve keyboard → softPad surface', drawer.includes("panel==='keyboard'") && drawer.includes("softPadSurface:'keyboard'"));
check('mountSoftPadPageBody toggles is-vk-hub', drawer.includes('mountSoftPadPageBody') && drawer.includes('is-vk-hub'));
check('navHighlight keyboard surface', drawer.includes("softPadSurface==='keyboard'") && drawer.includes("return 'keyboard'"));
check('shell IA keyboard', shell.includes('keyboard:') && shell.includes('vk-hub'));
check('home NAV_PANEL_MAP + surface', home.includes("keyboard:'keyboard'") && home.includes("softPadSurface==='keyboard'"));
check('i18n zh+en', i18n.includes("settingsNavKeyboard:'键盘'") && i18n.includes("settingsNavKeyboard:'Keyboard'"));
check('css keyboard-page + is-vk-hub', css.includes('.keyboard-page-toolbar') && css.includes('.is-vk-hub') && !css.includes(',\\n#'));
check('vk-hub hides scene drawer, shows keycap cmds + pad tabs',
  css.includes('.soft-pad-page-body.is-vk-hub > .soft-pad-right-col') &&
  css.includes('display: none !important') &&
  css.includes('#keyboardKeycapCmdHost') &&
  css.includes('键盘页保留') &&
  !/is-vk-hub \.soft-pad-pad-tabs[\s\S]{0,80}display:\s*none/.test(css)
);
check('vk-hub 2-col beats three-col whitespace',
  css.includes('soft-pad-page-body--three-col.is-vk-hub') &&
  css.includes('中预览加宽') &&
  /is-vk-hub[\s\S]{0,200}grid-template-columns:\s*minmax\(200px,\s*240px\)\s+minmax\(0,\s*1fr\)\s*!important/.test(css)
);
check('html keycap cmd host', html.includes('id="keyboardKeycapCmdHost"') && html.includes('data-soft-pad-flat-bind="1"'));
check('hub keyboard keycap sync', hub.includes('syncKeyboardKeycapCmds') && hub.includes('isKeyboardSurface'));
check('scene dock off on keyboard', read('src/js/features/mapping/keys-scene-actions-panel.js').includes("softPadSurface === 'keyboard'"));
const padUi = read('src/js/features/agent/codex-micro-pad-ui.js');
check('keyboard binds locally (no habit jump)', padUi.includes('isKeyboardSurfaceUi') && padUi.includes('applySoftPadCapabilityLocal'));
check('flat bind omits nav keys', /isNavMicroKey\(id\)/.test(padUi) && padUi.includes('不列固定方向键'));
check('preview focus scrolls left cmd row', padUi.includes('scrollIntoView') && padUi.includes('data-soft-pad-flat-bind-key'));
check('hub toolbar binds', hub.includes('btnKeyboardAgentLook') && hub.includes('btnKeyboardLiveScene'));
check('prototype Mac hub', proto.includes('左 · 命令与模板') && proto.includes('命令面板') && proto.includes('Soft Pad 内建'));

if (process.exitCode) process.exit(process.exitCode);
console.log('keyboard-page-nav smoke passed');
