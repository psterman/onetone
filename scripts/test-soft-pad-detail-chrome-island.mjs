// P14g 单测：buildSoftPadDetailChromeModel + 守卫源码护栏 + 挂载入口
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
    mappings: [{
      id: 'm1',
      triggerKey: 'F1',
      targetKey: 'Enter',
      enabled: true,
      appTargetId: 'codex-chat',
      agentTemplateId: 'codex',
      softPadKind: 'codex',
      codexMicroPad: {
        enabled: true,
        skin: 'graphite',
        overlayEnabled: true,
        presentation: 'full',
        keys: { a: {}, b: {} },
      },
    }],
  },
};

globalThis.OneToneState = { state, ui: {} };
globalThis.OneToneI18n = {
  t: (k, fallback) => (fallback != null ? String(fallback) : String(k)),
  dict: () => ({}),
  getLang: () => 'zh',
};
globalThis.window = globalThis;

const domNodes = {};
function fakeEl(id) {
  if (!domNodes[id]) {
    const attrs = {};
    const children = [];
    domNodes[id] = {
      id,
      hidden: false,
      textContent: '',
      classList: {
        toggle() {},
        add() {},
        remove() {},
        contains() { return false; },
      },
      setAttribute(k, v) { attrs[k] = String(v); },
      getAttribute(k) { return attrs[k] == null ? null : attrs[k]; },
      hasAttribute(k) { return attrs[k] != null; },
      removeAttribute(k) { delete attrs[k]; },
      querySelectorAll() { return []; },
      querySelector() { return null; },
      replaceChildren() { children.length = 0; },
      addEventListener() {},
      contains() { return false; },
    };
  }
  return domNodes[id];
}

globalThis.document = {
  getElementById: (id) => fakeEl(id),
  querySelector() { return null; },
};
globalThis.OneToneDom = { $: (id) => fakeEl(id) };
globalThis.OneToneCodexMicroPadUi = {
  closeEditKeycap() {},
  resolveSoftPadSubpagePaintHost(h) { return h || fakeEl('softPadSubpageBody'); },
};
globalThis.OneToneAgentActions = {};
globalThis.OneToneHabitProfile = {};
globalThis.OneToneAppTargetPresets = { presets: [] };

const src = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8').replace(/^\uFEFF/, '');
(0, eval)(src);
const API = globalThis.OneToneSoftPadHub;

console.log('[soft-pad-detail-chrome] 模型:');
check('buildSoftPadFourPanelModel 已导出', typeof API.buildSoftPadFourPanelModel === 'function');
check('buildSoftPadDetailChromeModel 已导出', typeof API.buildSoftPadDetailChromeModel === 'function');
check('closeSubpage 已导出', typeof API.closeSubpage === 'function');

let model = API.buildSoftPadDetailChromeModel();
check('hub 时 detailOpen=false', model.detailOpen === false);
check('hub 时 backHidden=true', model.backHidden === true);
check('hub 时 title 空', !model.title);
check('sig 非空', typeof model.sig === 'string' && model.sig.length > 0);
check('backLabel 非空', typeof model.backLabel === 'string' && model.backLabel.length > 0);

console.log('[soft-pad-detail-chrome] 源码护栏:');
const softPadJs = src;
check('导出 buildSoftPadFourPanelModel', softPadJs.includes('buildSoftPadFourPanelModel: buildSoftPadFourPanelModel'));
check('导出 buildSoftPadDetailChromeModel', softPadJs.includes('buildSoftPadDetailChromeModel: buildSoftPadDetailChromeModel'));
check('detail chrome 读 fourPanel model', /function buildSoftPadDetailChromeModel\([\s\S]*?buildSoftPadFourPanelModel/.test(softPadJs));
check('导出 closeSubpage', softPadJs.includes('closeSubpage: closeSubpage'));
check('syncHubChrome 岛守卫', /function syncHubChrome\([\s\S]*?__otSoftPadDetailChromeMounted/.test(softPadJs));
check('clearSubpage 岛守卫', /function clearSubpage\([\s\S]*?__otSoftPadDetailChromeMounted/.test(softPadJs));
check('paintSubpage 标题岛守卫', /function paintSubpage\([\s\S]*?__otSoftPadDetailChromeMounted/.test(softPadJs));
check('bindChrome 跳过 subBack', /function bindChrome\([\s\S]*?__otSoftPadDetailChromeMounted/.test(softPadJs));
check('setDetailOpen 先写 panel/idle attrs', /function setDetailOpen\([\s\S]*?detailPanel\.hidden = !open[\s\S]*?__otSoftPadDetailChromeSync/.test(softPadJs));
check('setDetailOpen 岛守卫 P14i', /function setDetailOpen\([\s\S]*?__otSoftPadDetailChromeMounted/.test(softPadJs));
check('render 接线挂载', softPadJs.includes('__otMountSoftPadDetailChromeIsland'));
check('render 延迟落地 paint', /function render\([\s\S]*?paintSoftPadLanding[\s\S]*?requestAnimationFrame/.test(softPadJs));
check('render 先画左侧再落地', /ensureSoftPadLeftChrome[\s\S]*?paintSoftPadLanding/.test(softPadJs) || /paintPreview\(openEntry[\s\S]*?paintSoftPadLanding/.test(softPadJs));
check('openSubpage 空壳再点会重绘', /view === softPadView[\s\S]*?softPadSubpageAlreadyPainted[\s\S]*?forceRemount:\s*true/.test(softPadJs));
check('AlreadyPainted 含 agent lazy body', /view === 'agent'[\s\S]*?data-lazy-agent-body/.test(softPadJs));
check('openGen 不跟 selectToken 绑死', softPadJs.includes('softPadOpenGen'));
check('落地硬编码 runtime', /var landView = 'runtime'/.test(softPadJs) && /fe softPad\.land/.test(softPadJs));
check('落地锁定 suppress layout', /softPadLandUntil[\s\S]*?suppress-layout/.test(softPadJs));
check('顶栏 tile 带 fromUser', /openSubpage\(tile\.getAttribute\('data-tile'\),\s*\{\s*fromUser:\s*true/.test(softPadJs));
check('Soft Pad 流程节点落地 runtime', /nodeId === 'pad'[\s\S]*?openSubpage\('runtime'\)/.test(softPadJs));
check('openSubpage 面板不一致会重绘', /panelMismatch[\s\S]*?forceRemount:\s*true/.test(softPadJs));
check('render 同步先 openSubpage 落地', /var landView = 'runtime';[\s\S]*?openSubpage\(landView\)/.test(softPadJs));
const landingStart = softPadJs.indexOf('function paintSoftPadLanding()');
const landingEnd = softPadJs.indexOf('// Second pass after island paint-targets commit', landingStart);
const landingRetry = landingStart >= 0 && landingEnd > landingStart
  ? softPadJs.slice(landingStart, landingEnd)
  : '';
check('延迟落地不重复 selectScheme', !landingRetry.includes('selectScheme('));
check('延迟落地只在缺页时补画', /!softPadSubpageAlreadyPainted[\s\S]*?paintSubpage/.test(landingRetry));
check('defaultDetailView 默认 runtime', /function defaultDetailView\([\s\S]*?return 'runtime'/.test(softPadJs));
check('openSubpage resolve Soft Pad', /function openSubpage\([\s\S]*?resolveSoftPadEntry\(/.test(softPadJs));

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 softPadSubpageBar', html.includes('id="softPadSubpageBar"'));

const islandTsx = readFileSync(join(root, 'src-islands/islands/soft-pad-detail-chrome-island.tsx'), 'utf8');
check('岛含返回按钮', islandTsx.includes('btnSoftPadSubBack') || islandTsx.includes('soft-pad-subpage-back'));
check('岛含标题', islandTsx.includes('softPadSubpageTitle') || islandTsx.includes('soft-pad-subpage-title'));
check('岛 onClick → closeSoftPadSubpage', islandTsx.includes('closeSoftPadSubpage'));
check('P14i 写 detail shell attrs', islandTsx.includes('applySoftPadDetailShellAttrs'));

const domainTs = readFileSync(join(root, 'src-islands/domain/softPadDetailChrome.ts'), 'utf8');
check('domain 含 applySoftPadDetailShellAttrs', domainTs.includes('applySoftPadDetailShellAttrs'));

const mainTsx = readFileSync(join(root, 'src-islands/main.tsx'), 'utf8');
check('main 暴露挂载入口', mainTsx.includes('__otMountSoftPadDetailChromeIsland'));
check('main 挂载 softPadSubpageBar', mainTsx.includes("mountIsland('softPadSubpageBar'"));

console.log('[soft-pad-detail-chrome] ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
