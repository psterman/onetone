// P14d 单测：buildSoftPadEmptyIdleModel + 守卫源码护栏 + 挂载入口
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
  selectedMappingId: null,
  config: { mappings: [] },
};

globalThis.OneToneState = { state, ui: {} };
globalThis.OneToneI18n = {
  t: (k) => String(k),
  dict: () => ({}),
  getLang: () => 'zh',
};
globalThis.window = globalThis;

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    const attrs = {};
    domNodes[id] = {
      id,
      hidden: false,
      _inner: '',
      _innerWrites: 0,
      set innerHTML(v) { this._inner = v; this._innerWrites++; },
      get innerHTML() { return this._inner; },
      textContent: '',
      classList: {
        toggle() {},
        add() {},
        remove() {},
        contains() { return false; },
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] == null ? null : attrs[k]; },
      removeAttribute(k) { delete attrs[k]; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      replaceChildren() {},
      addEventListener() {},
    };
  }
  return domNodes[id];
}

globalThis.document = {
  getElementById: (id) => fakeEl(id),
  querySelector() { return null; },
};
globalThis.OneToneDom = { $: (id) => fakeEl(id) };
globalThis.OneToneCodexMicroPadUi = {};
globalThis.OneToneAgentActions = {};
globalThis.OneToneHabitProfile = {};
globalThis.OneToneAppTargetPresets = { presets: [] };

const src = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneSoftPadHub;

console.log('[soft-pad-empty-idle] 模型:');
check('buildSoftPadEmptyIdleModel 已导出', typeof API.buildSoftPadEmptyIdleModel === 'function');
check('prepareAppFromUi 已导出', typeof API.prepareAppFromUi === 'function');
check('prepareSoftPadCreateKind 已导出', typeof API.prepareSoftPadCreateKind === 'function');

let model = API.buildSoftPadEmptyIdleModel();
check('初始 mode=none 且 emptyHidden', model.mode === 'none' && model.emptyHidden === true);
check('初始含 idle 文案键', typeof model.idleTitle === 'string' && model.idleTitle.length > 0);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);

// 通过 hide/render 路径在真实环境验证；此处用源码护栏 + 直接改内部不便，
// 验证 emptyCreate 文案键存在于模型字段定义路径
check('模型含 create/prepare 字段',
  'createCodexLabel' in model && 'prepareBtnLabel' in model && 'idleHidden' in model);

console.log('[soft-pad-empty-idle] 源码护栏:');
const softPadJs = src;
check('idle 含 landingHint 接线', softPadJs.includes('softPadLandingHint'));
check('导出 buildSoftPadEmptyIdleModel', softPadJs.includes('buildSoftPadEmptyIdleModel: buildSoftPadEmptyIdleModel'));
check('applySoftPadEmptyIdleHost 岛守卫', softPadJs.includes('function applySoftPadEmptyIdleHost') && softPadJs.includes('__otSoftPadEmptyIdleSync'));
check('renderEmptyMain 走 apply', /function renderEmptyMain\([\s\S]*?applySoftPadEmptyIdleHost/.test(softPadJs));
check('hideEmpty 不 innerHTML 清空（岛路径）', /function hideEmpty\([\s\S]*?applySoftPadEmptyIdleHost/.test(softPadJs) && !/function hideEmpty\([\s\S]*?e\.empty\.innerHTML\s*=\s*''/.test(softPadJs));
check('showPrepareMain 走 apply', /function showPrepareMain\([\s\S]*?emptySurfaceMode\s*=\s*'prepare'[\s\S]*?applySoftPadEmptyIdleHost/.test(softPadJs));
check('syncFaceChrome idle 岛守卫', /function syncFaceChrome\([\s\S]*?__otSoftPadEmptyIdleMounted/.test(softPadJs));
check('bindEmptyCreateCtas 岛跳过', /function bindEmptyCreateCtas\([\s\S]*?__otSoftPadEmptyIdleMounted/.test(softPadJs));
check('render 空路径不摧毁岛 root', /emptySurfaceMode = 'empty'[\s\S]*?applySoftPadEmptyIdleHost/.test(softPadJs) || /__otSoftPadEmptyIdleMounted[\s\S]*?emptyCreateCtaHtml/.test(softPadJs));
check('render 接线挂载', softPadJs.includes('__otMountSoftPadEmptyIdleIsland'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/soft-pad-empty-idle-island.tsx'), 'utf8');
check('岛含双宿主组件', islandTsx.includes('SoftPadEmptyIsland') && islandTsx.includes('SoftPadDetailIdleIsland'));
check('岛 React onClick → prepare', islandTsx.includes('prepareSoftPadCreateKind') && islandTsx.includes('prepareSoftPadApp'));

const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 暴露挂载入口', mainTsx.includes('__otMountSoftPadEmptyIdleIsland'));

console.log('[soft-pad-empty-idle] ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
