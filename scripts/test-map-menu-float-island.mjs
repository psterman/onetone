// P12b-4 单测：buildMapMenuFloatModel + open/close 守卫 + 挂载入口
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

const state = {
  selectedMappingId: 'm1',
  config: {
    mappings: [
      { id: 'm1', triggerKey: 'F1', targetKey: 'Enter', enabled: true },
      { id: 'm2', triggerKey: 'F2', targetKey: 'Esc', enabled: true },
    ],
  },
};

globalThis.OneToneState = { state };
globalThis.OneToneI18n = {
  t: (k) => String(k),
  dict: () => ({}),
  getLang: () => 'zh',
};
globalThis.OneToneHabitHub = {};
globalThis.OneToneAppToast = { show: () => {} };

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    domNodes[id] = {
      id,
      textContent: '',
      dataset: {},
      style: {},
      disabled: false,
      classList: {
        _set: new Set(),
        add(name) { this._set.add(name); },
        remove(name) { this._set.delete(name); },
        contains(name) { return this._set.has(name); },
        toggle(name, on) {
          if (on) this._set.add(name);
          else this._set.delete(name);
        },
      },
      getBoundingClientRect() {
        return { right: 200, bottom: 100, top: 80, left: 52, width: 24, height: 24 };
      },
      closest() { return null; },
      removeAttribute(name) {
        if (name === 'data-id') delete this.dataset.id;
      },
    };
  }
  return domNodes[id];
}
globalThis.OneToneDom = { $: (id) => fakeEl(id) };
globalThis.document = {
  querySelectorAll() { return []; },
};
globalThis.innerHeight = 800;
globalThis.window = globalThis;

globalThis.__vp_mapping_trash_menu_hooks__ = {
  t: (k) => String(k),
  ensureConfig: () => {},
  sortedMappings: () => state.config.mappings.slice(),
  isDraftMapping: (m) => !!(m && m.__draft),
  editorTargetForMapping: (m) => (m && m.targetKey) || '',
  removeDraftMapping: () => {},
  newMappingId: () => 'm-new',
  syncEditorFromSelection: () => {},
  save: () => {},
  saveAsync: async () => {},
  render: () => {},
  toast: () => {},
  friendlyPair: () => '',
};

const src = readFileSync(join(root, 'src/js/features/mapping/mapping-trash-menu.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const MENU = globalThis.OneToneMappingTrashMenu;

console.log('[map-menu-float] 模型:');
check('buildMapMenuFloatModel 已导出', typeof MENU.buildMapMenuFloatModel === 'function');
check('runMenuAct 已导出', typeof MENU.runMenuAct === 'function');

let model = MENU.buildMapMenuFloatModel();
check('关闭态 open=false', model.open === false && model.sig === 'closed');
check('关闭态 labels 有文案', model.labels.test === 'testShort' && model.labels.del === 'delete');

const btn = fakeEl('anchorBtn');
MENU.open('m1', btn);
model = MENU.buildMapMenuFloatModel();
check('打开态 open=true', model.open === true && model.id === 'm1');
check('打开态有定位', typeof model.left === 'number' && typeof model.top === 'number');
check('首项 up disabled', model.disabled.up === true);
check('首项 down 可用', model.disabled.down === false);
check('有 target 时 test 可用', model.disabled.test === false);

MENU.open('m2', btn);
model = MENU.buildMapMenuFloatModel();
check('末项 down disabled', model.disabled.down === true);
check('末项 up 可用', model.disabled.up === false);

MENU.close();
model = MENU.buildMapMenuFloatModel();
check('close 后 open=false', model.open === false);

console.log('[map-menu-float] open/close 守卫:');
globalThis.__otMapMenuFloatMounted = false;
let syncCalls = 0;
globalThis.__otMapMenuFloatSync = () => { syncCalls++; };

MENU.open('m1', btn);
const pop = fakeEl('mapMenuFloat');
check('未挂载时写 host open class', pop.classList.contains('open'));
check('未挂载时未调 sync', syncCalls === 0);

MENU.close();
globalThis.__otMapMenuFloatMounted = true;
syncCalls = 0;
MENU.open('m1', btn);
check('挂载后 open 调 sync', syncCalls === 1);
check('挂载后 openMenuId 仍维护', MENU.openMenuId() === 'm1');

const prevDisabled = fakeEl('menuActUp').disabled;
fakeEl('menuActUp').disabled = !prevDisabled;
MENU.open('m2', btn);
check('挂载后不直接改按钮 disabled', fakeEl('menuActUp').disabled === !prevDisabled);

syncCalls = 0;
MENU.close();
check('挂载后 close 调 sync', syncCalls === 1);
check('挂载后 close 清空 openMenuId', MENU.openMenuId() === null);

console.log('[map-menu-float] 挂载入口:');
const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main.tsx boot 挂载 mapMenuFloat', mainTsx.includes('mountMapMenuFloatIsland') && mainTsx.includes("getElementById('mapMenuFloat')"));
check('main.tsx 含 registerMapMenuFloatBridge', mainTsx.includes('registerMapMenuFloatBridge'));
const islandTsx = readFileSync(join(root, 'src-islands/islands/map-menu-float-island.tsx'), 'utf8');
check('岛含 __otMapMenuFloatSync', islandTsx.includes('__otMapMenuFloatSync'));
check('岛含 runMapMenuAct', islandTsx.includes('runMapMenuAct'));
const listUi = readFileSync(join(root, 'src/js/features/mapping/mapping-list-ui.js'), 'utf8');
check('list-ui 跳过 menuAct bindClick 守卫', listUi.includes('__otMapMenuFloatMounted'));
check('list-ui 容器 click 岛上 early return', listUi.includes('if(global.__otMapMenuFloatMounted) return;'));

console.log(`[map-menu-float] ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
