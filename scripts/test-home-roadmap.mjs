// Phase1–3：home model 单一来源 + lexicon + shell IA + record IPC + 协议接线
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

function loadIife(rel, sandbox) {
  const code = readFileSync(join(root, rel), 'utf8');
  vm.runInNewContext(code, sandbox, { filename: rel });
}

const sandbox = {
  console,
  globalThis: null,
  window: null,
  CustomEvent: class CustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  },
  dispatchEvent() {},
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.OneToneI18n = { t: (k) => k };

loadIife('src/js/shared/runtime-status-lexicon.js', sandbox);
loadIife('src/js/shared/shell-ia-convergence.js', sandbox);
loadIife('src/js/features/mapping/record-ipc-lifecycle.js', sandbox);

sandbox.OneToneHomeLive = {
  computeState: () => ({
    statusMode: 'listening',
    statusLine: 'listening',
    ctaMode: 'listening',
    ctaMain: 'ok',
    ctaPanel: 'voiceWake',
    triggerLabel: 'F8',
    keyReady: true,
  }),
};
sandbox.OneToneVoiceHomeSummary = {
  compute: () => ({
    loading: false,
    dictating: false,
    engine: 'vosk',
    micLabel: 'mic',
    statusMode: 'listening',
  }),
};
sandbox.OneToneHomeV9 = {
  buildViewModel: () => ({
    loading: false,
    vpState: 'LISTENING',
    summary: sandbox.OneToneVoiceHomeSummary.compute(),
    hs: sandbox.OneToneHomeLive.computeState(),
    m: { triggerMode: 'tap', id: 'm1' },
    cfg: {},
    targetLabel: 'Notepad',
    habitName: 'habit',
    triggerKey: 'F8',
    finishText: 'send',
    engineLine: 'vosk',
    micLabel: 'mic',
    live: { finalized: '', pending: '', placeholder: true },
  }),
};
sandbox.OneToneHomeWorkbench = {
  enrichViewModel: (vm) => {
    vm.runtime = { paused: false };
    vm.compatSnapshot = { status: 'unknown' };
    return vm;
  },
};
sandbox.OneToneState = { runtime: { paused: false }, state: { config: {} } };

loadIife('src/js/features/home/home-workbench-model.js', sandbox);

const lex = sandbox.OneToneRuntimeStatusLexicon;
check('lexicon listening', lex.fromHomeBits({ statusMode: 'listening' }) === 'listening');
check('lexicon paused', lex.fromHomeBits({ paused: true }) === 'paused');
check('lexicon needsSetup', lex.fromHomeBits({ needsSetup: true }) === 'needsSetup');
check('lexicon triggered', lex.fromHomeBits({ triggered: true }) === 'triggered');
check('lexicon trigger alias', lex.normalize('trigger') === 'triggered');
check('lexicon protocol has ts', typeof lex.protocolSnapshot({ statusToken: 'dictating' }).ts === 'number');
const protoShape = lex.protocolSnapshot({
  statusToken: 'listening',
  statusLine: 'Listening',
  triggerLabel: 'Key A',
  targetLabel: 'App',
  repair: null,
});
const requiredKeys = [
  'statusToken',
  'statusText',
  'triggerText',
  'targetText',
  'repairText',
  'canPause',
  'canResume',
  'lastEventText',
  'ts',
];
check(
  'lexicon protocol 8 content keys',
  requiredKeys.every((k) => Object.prototype.hasOwnProperty.call(protoShape, k))
);
check('lexicon protocol statusText', protoShape.statusText === 'Listening');
check('lexicon protocol triggerText', protoShape.triggerText === 'Key A');
check('lexicon protocol targetText', protoShape.targetText === 'App');
check('lexicon protocol canPause listening', protoShape.canPause === true && protoShape.canResume === false);
check('lexicon protocol label compat', protoShape.label === protoShape.statusText);
check('lexicon protocol detail compat', protoShape.detail === protoShape.triggerText);
const pausedProto = lex.protocolSnapshot({ statusToken: 'paused', statusLine: 'Paused' });
check('lexicon protocol canResume paused', pausedProto.canResume === true && pausedProto.canPause === false);
const built = lex.buildFromWorkbenchInputs({
  statusToken: 'error',
  statusText: 'Broken',
  triggerText: 'Key',
  targetText: 'T',
  repairText: 'Fix',
});
check('lexicon buildFromWorkbenchInputs', built.statusToken === 'error' && built.repairText === 'Fix');

const ia = sandbox.OneToneShellIaConvergence;
check('shell IA camera is pro', ia.resolve('camera').pro === true);
check('shell IA forbids camera home CTA', ia.isForbiddenHomeCta('camera') === true);
check('shell IA home returns home', ia.resolve('home').home === true);

const life = sandbox.OneToneRecordIpcLifecycle;
check('record ipc idle→starting', life.canTransition('idle', 'starting'));
check('record ipc idle↛ready', !life.canTransition('idle', 'ready'));
check('record ipc from legacy trigger', life.fromLegacyRecordingMode('trigger') === 'recording');
check('record ipc applyLegacyMode advances', life.applyLegacyMode('trigger') === 'recording');
check('record ipc applyLegacyMode stop', life.applyLegacyMode('none') === 'idle');
check('record ipc isBusy recording', life.isBusy('recording') === true);
check('record ipc isBusy idle', life.isBusy('idle') === false);
check('record ipc isRecordingUi by phase', life.isRecordingUi('none', 'starting') === true);
check('record ipc isRecordingUi by mode', life.isRecordingUi('trigger', 'idle') === true);
check('record ipc isRecordingUi idle', life.isRecordingUi('none', 'idle') === false);

const model = sandbox.OneToneHomeWorkbenchModel.build();
check('model ready', model.ready === true);
check('model card hard cap', model.cards.length <= model.cardHardCap && model.cardHardCap >= 4);
check('model has statusToken', !!model.statusToken);
check('model has cta', !!(model.cta && model.cta.panel));
check('model has nextActionLabel', !!model.nextActionLabel);
check('model camera not CTA', model.cta.panel !== 'camera');
check('model has sig', typeof model.sig === 'string' && model.sig.length > 0);
check('model five-question fields', !!(model.statusLine && model.triggerLabel && model.targetLabel));
check('model has protocol', !!(model.protocol && model.protocol.statusToken));
check('model protocol feeds statusLine', model.statusLine === model.protocol.statusText);
check('model protocol feeds triggerLabel', model.triggerLabel === model.protocol.triggerText);
check('model protocol feeds targetLabel', model.targetLabel === model.protocol.targetText);
check('model protocol feeds canPause', model.canPause === model.protocol.canPause);
check(
  'model protocol feeds repairText',
  (model.repair ? model.repair.label : '') === (model.protocol.repairText || '')
);

// needsSetup path
sandbox.OneToneHomeV9.buildViewModel = () => ({
  loading: false,
  vpState: 'IDLE',
  summary: { loading: false, dictating: false, engine: 'off', statusMode: 'idle' },
  hs: { statusMode: 'idle', statusLine: 'setup', ctaMode: 'config', ctaMain: 'setup', ctaPanel: 'keys', keyReady: false },
  m: { triggerMode: 'tap', id: 'm2' },
  cfg: {},
  targetLabel: '',
  habitName: '',
  triggerKey: '',
  finishText: '',
  engineLine: '',
  micLabel: '',
  live: { finalized: '', pending: '', placeholder: true },
});
const setupModel = sandbox.OneToneHomeWorkbenchModel.build();
check('model needsSetup token', setupModel.statusToken === 'needsSetup');
check('model needsSetup cta mode', setupModel.cta.mode === 'setup');

const roadmap = readFileSync(join(root, 'docs/roadmap-total-benefit.md'), 'utf8');
check('Gate0-lite 文档存在', roadmap.includes('Gate0-lite'));
check('跳过 #14–#28 理由', roadmap.includes('跳过') && roadmap.includes('#14'));
check('Phase1 验收清单', roadmap.includes('Phase1 验收') || roadmap.includes('5 秒'));

const loop = readFileSync(join(root, 'src/js/core/render-loop.js'), 'utf8');
check('render-loop home 轻守卫', loop.includes('shouldSkipHomeRender'));

const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
check('workbench 导出 shouldSkipHomeRender', wb.includes('shouldSkipHomeRender:shouldSkipHomeRender'));
check('workbench 读 model', wb.includes('peekHomeModel'));
check('hero 走 projection', wb.includes('data-wb-from-projection') && wb.includes('paintHeroSurfaces') && wb.includes('buildHeroProjection'));
check('publish runtime protocol', wb.includes('publishRuntimeStatusProtocol') && wb.includes('cmd_runtime_status_protocol'));
check('publish 优先 model.protocol', wb.includes('var snap=model.protocol') || wb.includes('model.protocol||null') || wb.includes('__otRuntimeStatusOverride'));
check('publish 尊重 simulate override', wb.includes('__otRuntimeStatusOverride'));
check('bindNav 无死 fallback', !wb.includes("if(action==='schemes')") && wb.includes('只认 shell-ia'));
check('hero softPad mode', wb.includes("return 'softPad'") && wb.includes('paintHeroModeChrome'));
check('refreshHeroModeSurfaces 统一事务', wb.includes('function refreshHeroModeSurfaces') && wb.includes('buildHeroProjection') && wb.includes('paintHeroSurfaces(projection)'));
check('setHeroMode 走 refreshHeroModeSurfaces', /function setHeroMode[\s\S]*refreshHeroModeSurfaces\(\)/.test(wb) && !wb.includes('标签切换只刷 mode chrome'));
check('setHeroMode 普通路径不整页 render', /function setHeroMode[\s\S]*if\(opts\.force\)\{[\s\S]*render\(\);[\s\S]*return;[\s\S]*\}[\s\S]*refreshHeroModeSurfaces\(\)/.test(wb));
check('caps 一次采集', wb.includes('function collectHeroModeCaps') && wb.includes('softPadHeroSnapshot'));
check('pills/flow 不内采 Camera snap', !/function renderHeroPills[\s\S]*cameraPresenceSnapshot\(\)/.test(wb) && !/function renderHeroFlowSummary[\s\S]*cameraPresenceSnapshot\(\)/.test(wb));
check('flow 单行状态·目标', wb.includes('wb-hero-flow-line') && wb.includes('is-oneline') && !/cell\(t\('homeWbFlowTrigger'\)/.test(wb));
check('pills 麦克风只进 title', /if\(pill\.id==='mic'\) return/.test(wb) && wb.includes('device name lives on engine pill title'));
check('hero mode hint 已移除可见 tip', /Preview tip moved to howto/.test(wb) && !/hint\.textContent=t\('homeWbHeroModeHint'\)/.test(wb));

const heroModelSrc = readFileSync(join(root, 'src/js/features/home/home-hero-mode-model.js'), 'utf8');
check('home-hero-mode-model 存在', heroModelSrc.includes('function buildHomeHeroModeModel') && heroModelSrc.includes('OneToneHomeHeroModeModel'));
check('projection 四模式 CTA', heroModelSrc.includes('homeWbFlowCtaVoice') && heroModelSrc.includes('homeWbFlowCtaKeys') && heroModelSrc.includes('homeWbFlowCtaSoftPad') && heroModelSrc.includes('homeWbFlowCtaCamera'));

const htmlHome = readFileSync(join(root, 'src/index.html'), 'utf8');
check('hero softPad 由 howto 切换', htmlHome.includes('id="wbHowTo"') && !htmlHome.includes('wb-hero-modes') && !htmlHome.includes('id="wbHeroModeSoftPad"'));
check('hero 无重复模式条', !htmlHome.includes('data-wb-hero-mode=') && wb.includes('syncHowToActive') && !wb.includes('function syncHeroModeTabs'));
check('index 挂载 hero-mode-model', htmlHome.includes('home-hero-mode-model.js'));

const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
check('howto 只吃 projection', panels.includes('projection.howtoCards') && panels.includes('禁止在此再采集'));
check('inactive howto 无 meta', panels.includes('card.active?1:0'));
check('panels 导出 softPadHowToSnapshot', panels.includes('softPadHowToSnapshot:softPadHowToSnapshot'));
check('panels 导出 collectHowToSurfaceBits', panels.includes('collectHowToSurfaceBits:collectHowToSurfaceBits'));
check('softPad snapshot 走 resolvePrimaryLane', (() => {
  const snap = panels.match(/function softPadHowToSnapshot\(\)\{[\s\S]*?\n  function /);
  return !!(snap
    && snap[0].includes('resolvePrimaryLane')
    && snap[0].includes('laneContextFromRuntime')
    && !/\(on\.length\s*\?\s*on\s*:\s*entries\)\s*\[\s*0\s*\]/.test(snap[0]));
})());
check('softPad hub 导出选道 API', (() => {
  const hub = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
  return /resolvePrimaryLane:\s*resolvePrimaryLane/.test(hub)
    && /pickHubDefaultScopeId:\s*pickHubDefaultScopeId/.test(hub)
    && /noteLaneForeground:\s*noteLaneForeground/.test(hub);
})());
check('renderHowTo 不再调 snapshot', (() => {
  const m = panels.match(/function renderHowTo\(projection\)\{[\s\S]*?\n  function /);
  return !!(m && !m[0].includes('cameraHowToSnapshot()') && !m[0].includes('softPadHowToSnapshot()'));
})());
check('howto 摘要点卡切 Hero', panels.includes('howToSummaryCardHtml') && panels.includes('点此切换上方预览；再点打开设置') && !/data-wb-howto-channel=/.test(panels));
check('howto 点卡切 Hero / 再点开设置', (() => {
  const m = wb.match(/#wbHowTo \[data-wb-howto\][\s\S]*?return;\s*\}/);
  return !!(m && m[0].includes('setHeroMode(kind)') && m[0].includes('openHabitChannelChip(kind)') && m[0].includes('heroMode'));
})());
check('openGlobalVoice 会打开抽屉', (() => {
  const banner = readFileSync(join(root, 'src/js/features/mapping/habit-scenario-context-banner.js'), 'utf8');
  return banner.includes('function ensureDrawerPanel')
    && /function openGlobalVoice[\s\S]*ensureDrawerPanel\('voiceWake'\)/.test(banner)
    && /function openGlobalCamera[\s\S]*ensureDrawerPanel\('camera'\)/.test(banner)
    && /function openGlobalVoice[\s\S]*requestAnimationFrame[\s\S]*mountVoice/.test(banner)
    && /function openScenarioVoiceEdit[\s\S]*persist:false/.test(banner);
})());
check('boot settled heavy 错峰', (() => {
  const boot = readFileSync(join(root, 'src/js/core/app-boot.js'), 'utf8');
  const persist = readFileSync(join(root, 'src/js/core/config-persist.js'), 'utf8');
  const session = readFileSync(join(root, 'src/js/core/app-session.js'), 'utf8');
  return persist.includes('__otBootCameraCold')
    && persist.includes('bootCameraReconcile')
    && /camDelay\s*=\s*2500/.test(persist)
    && session.includes('Yield between settle jobs')
    && /setTimeout\(next,\s*0\)/.test(session)
    && /setTimeout\(function\(\)\{[\s\S]*flushDeferredMvpInitSideEffects[\s\S]*\},120\)/.test(boot);
})());
check('camera/softPad liveHint 不指上方下方', (() => {
  const model = readFileSync(join(root, 'src/js/features/home/home-hero-mode-model.js'), 'utf8');
  const zh = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
  const wbFlow = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
  return model.includes('liveHintFor(mode, camera, softPad, t)')
    && model.includes('homeWbLiveCameraOffHint')
    && zh.includes('homeWbLiveCameraOffHint:')
    && !zh.includes('点上方或下方')
    && /mode==='camera'\|\|mode==='softPad'/.test(wbFlow)
    && wbFlow.includes('projection.liveStatus')
    && wbFlow.includes('is-settings-cta')
    && wbFlow.includes('openHeroSettings');
})());
check('camera actionsLine 含手势', (() => {
  const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
  const fn = wb.match(/function cameraActionsLine\(prefs\)\{[\s\S]*?\n  function /);
  return !!(fn && fn[0].includes('openPalm') && fn[0].includes('homeWbCameraPalmShort'));
})());
check('flow 状态条不叠习惯·前台', (() => {
  const model = readFileSync(join(root, 'src/js/features/home/home-workbench-model.js'), 'utf8');
  const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
  const zh = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
  return model.includes('One name only')
    && !model.includes("habitName + ' · ' + draftTarget")
    && wb.includes('Happy-path listening')
    && /homeStatusListening:'就绪'/.test(zh);
})());
check('flow 场景图标芯片', (() => {
  const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
  const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
  const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
  return wb.includes('wb-hero-flow-scene')
    && wb.includes('sceneIconHtml')
    && panels.includes('sceneIconHtml:sceneIconHtml')
    && css.includes('.wb-hero-flow-scene-ico');
})());
check('activate 乐观刷新首页', (() => {
  const act = readFileSync(join(root, 'src/js/features/scene/scene-activate.js'), 'utf8');
  return act.includes('cfg.activeSceneId=id') && act.includes('forceHomeRender');
})());
check('scheme-switch forceHomeRender', (() => {
  const fb = readFileSync(join(root, 'src/js/features/home/scheme-switch-feedback.js'), 'utf8');
  return fb.includes('forceHomeRender') && fb.includes('HomeWorkbench.render');
})());
check('workbench sig 含 activeSceneId', (() => {
  const model = readFileSync(join(root, 'src/js/features/home/home-workbench-model.js'), 'utf8');
  return model.includes('activeSceneId');
})());
check('hub 通用设置无四通道栅格', (() => {
  const hub = readFileSync(join(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');
  const fn = hub.match(/function renderGlobalDefaultCard\(\)\{[\s\S]*?\n  function /);
  return !!(fn && !fn[0].includes('habit-hub-channels') && fn[0].includes('data-habit-global-home') && fn[0].includes('habit-hub-hero--thin'));
})());
check('scenario 点卡激活、编辑独立、无 use 按钮', (() => {
  const card = panels.match(/function sceneCardHtml\([\s\S]*?\n  function /);
  if (!card) return false;
  const html = card[0];
  return !html.includes('data-wb-scenario-use')
    && html.includes('wb-scene-card-badge')
    && html.includes('data-wb-scenario-edit')
    && wb.includes('data-wb-scenario-edit')
    && /data-wb-scenario-edit[\s\S]*openWorkbenchScenario/.test(wb)
    && !wb.includes('data-wb-scenario-use')
    && /data-wb-scenario-id[\s\S]*selectWorkbenchMapping/.test(wb);
})());
{
  const orderSrc = heroModelSrc;
  const voiceIdx = orderSrc.indexOf("mode: 'voice'");
  const keysIdx = orderSrc.indexOf("mode: 'keys'");
  const softIdx = orderSrc.indexOf("mode: 'softPad'");
  const camIdx = orderSrc.indexOf("mode: 'camera'");
  // howtoCards 数组内第一次出现顺序
  const howtoFn = orderSrc.indexOf('function howtoCards');
  check('howto 卡片顺序对齐 tabs', howtoFn >= 0 && voiceIdx > howtoFn && keysIdx > voiceIdx && softIdx > keysIdx && camIdx > softIdx);
}

const i18nHome = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
check('hero 小白入口文案', i18nHome.includes("homeWbHeroModeVoice:'说话触发'") && i18nHome.includes("homeWbHeroModeKeys:'按键触发'") && i18nHome.includes("homeWbHeroModeSoftPad:'屏幕按钮'") && i18nHome.includes("homeWbHeroModeCamera:'摄像头确认'"));
check('hero flow 空态/CTA 文案键', i18nHome.includes("homeWbFlowEmptySoftPad:'还没有屏幕按钮方案'") && i18nHome.includes("homeWbFlowCtaSoftPad:'设置屏幕按钮'") && i18nHome.includes("homeWbFlowEmptyMic:'还没选麦克风，先选一个输入设备'") && i18nHome.includes("homeWbFlowCtaVoice:'设置说话触发'") && i18nHome.includes("homeWbFlowCtaCamera:'打开 Camera Pro 设置'"));

// —— 小型行为：四模式 projection 字段 ——
loadIife('src/js/features/home/home-hero-mode-model.js', sandbox);
{
  const build = sandbox.OneToneHomeHeroModeModel && sandbox.OneToneHomeHeroModeModel.build;
  check('HeroModeModel.build 可用', typeof build === 'function');
  const tFn = (k, fb) => {
    const map = {
      homeLiveUnset: '还没设置',
      homeLiveMicUnset: '未选麦克风',
      homeLiveMicUnknown: '未知麦克风',
      homeWbChannelUnset: '未设置',
      homeWbHowToSoftPadOff: '未启用',
      homeWbHowToSoftPadOn: '已启用',
      homeWbCameraOff: '未开启',
      homeWbCameraOn: '已开启',
      homeWbCameraPresenceIdle: '待命',
      homeWbCameraBoundCount: '已绑定 {n} 项',
      homeWbHeroModeVoice: '说话触发',
      homeWbHeroModeKeys: '按键触发',
      homeWbHeroModeSoftPad: '屏幕按钮',
      homeWbHeroModeCamera: '摄像头确认',
      homeWbHeroHintVoice: 'hint-v',
      homeWbHeroHintKeys: 'hint-k',
      homeWbHeroHintSoftPad: 'hint-s',
      homeWbHeroHintCamera: 'hint-c',
      homeWbFlowCtaVoice: '设置说话触发',
      homeWbFlowCtaKeys: '设置按键触发',
      homeWbFlowCtaSoftPad: '设置屏幕按钮',
      homeWbFlowCtaCamera: '打开 Camera Pro 设置',
      homeWbFlowEmptyMic: '还没选麦克风，先选一个输入设备',
      homeWbFlowEmptyKeys: '还没有按键触发方式',
      homeWbFlowEmptySoftPad: '还没有屏幕按钮方案',
      homeWbFlowEmptyCamera: '摄像头确认未启用，需要时再打开',
      homeWbHowToMic: '麦克风',
      homeWbHowToVoiceTitle: '语音',
      homeWbHowToKeysTitle: '按键',
      homeWbHowToSoftPadTitle: '屏幕',
      homeWbHowToCameraTitle: '摄像头',
      homeWbHowToVoiceTip: 'tip',
      homeWbHowToKeysTip: 'tip',
      homeWbHowToSoftPadTip: 'tip',
      homeWbHowToCameraTip: 'tip',
      homeWbHowToFinish: '结束',
      homeWbHowToSilence: '静默',
      homeWbHowToSoftPadStatus: '状态',
      homeWbHowToSoftPadBound: '绑定',
      homeWbHowToCameraPresence: '在席',
      homeWbHowToCameraBound: '绑定',
      homeWbHabitActive: '启用',
      homeWbHeroModeVoice: '说话触发',
      homeWbHeroModeKeys: '按键触发',
      homeWbHeroModeSoftPad: '屏幕按钮',
      homeWbHeroModeCamera: '摄像头确认',
      homeWbHeroHintVoice: 'hint-v',
      homeWbHeroHintKeys: 'hint-k',
      homeWbHeroHintSoftPad: 'hint-s',
      homeWbHeroHintCamera: 'hint-c',
      homeWbFlowCtaVoice: '设置说话触发',
      homeWbFlowCtaKeys: '设置按键触发',
      homeWbFlowCtaSoftPad: '设置屏幕按钮',
      homeWbFlowCtaCamera: '打开 Camera Pro 设置',
      homeWbFlowEmptyMic: '还没选麦克风，先选一个输入设备',
      homeWbFlowEmptyKeys: '还没有按键触发方式',
      homeWbFlowEmptySoftPad: '还没有屏幕按钮方案',
      homeWbFlowEmptyCamera: '摄像头确认未启用，需要时再打开',
      homeWbLiveCameraHint: 'cam-hint',
      homeWbLiveCameraOffHint: 'cam-off',
      homeWbLiveCameraEmptyHint: 'cam-empty',
      homeWbLiveSoftPadHint: 'pad-hint',
      homeWbLiveSoftPadOffHint: 'pad-off',
      homeWbLivePreviewStandby: '待命',
      homeWbVoiceOff: '语音关',
      homeWbCameraOff: '未开启',
      homeWbCameraReady: '已就绪',
      homeWbCameraBoundCount: '已绑定 {n} 项',
    };
    return map[k] || fb || k;
  };
  const baseWb = {
    statusToken: 'listening',
    statusLine: 'listening',
    triggerLabel: 'F1',
    targetLabel: 'App',
    repair: null,
    cta: { mode: 'config', label: 'ok', panel: 'keys' },
  };
  const baseVm = {
    micLabel: 'Mic A',
    wakePrimary: '你好',
    triggerKey: 'F1',
    summary: { engine: 'vosk', statusMode: 'listening' },
    runtime: { paused: false },
  };
  const modes = ['voice', 'keys', 'softPad', 'camera'];
  let allOk = true;
  for (const mode of modes) {
    const p = build({
      mode,
      workbench: baseWb,
      vm: baseVm,
      camera: { enabled: mode === 'camera', running: false, presence: 'idle', bound: 1 },
      softPad: {
        value: 'Pad',
        statusLbl: '已启用',
        boundName: '场景',
        schemeCount: mode === 'softPad' ? 0 : 1,
        empty: mode === 'softPad',
      },
      howto: {
        wakeMain: '你好',
        keysLine: 'F1',
        triggerKey: 'F1',
        finish: '回车',
        micEmpty: false,
        keysEmpty: false,
        micLabel: 'Mic A',
      },
      t: tFn,
    });
    const fields =
      p &&
      p.mode === mode &&
      p.tab &&
      p.status &&
      p.flow &&
      Array.isArray(p.pills) &&
      p.preview &&
      Array.isArray(p.howtoCards) &&
      p.howtoCards.length === 4 &&
      p.localAction &&
      p.localAction.kind === 'settings';
    if (!fields) allOk = false;
    // 摘要卡：无 phrases；每卡 lines ≤ 2
    for (const c of p.howtoCards || []) {
      if (c.phrases) allOk = false;
      if ((c.lines || []).length > 2) allOk = false;
    }
    if (mode === 'camera') {
      const send = p.pills.some((x) => /send/i.test(x.id || '') || /send/i.test(x.action || ''));
      if (send || p.guards.cameraSendClass) allOk = false;
      if (p.localAction.panel !== 'camera') allOk = false;
      if (p.guards.globalCtaIsCamera) allOk = false;
      if (p.liveHint !== 'cam-empty') allOk = false;
      if (p.liveStatus !== '已就绪') allOk = false;
    }
    if (mode === 'softPad') {
      const bad = p.pills.some((x) => x.id === 'mic' || x.action === 'listen-toggle');
      if (bad || p.guards.softPadHasMicPill) allOk = false;
      if (p.flow.trigger !== '还没有屏幕按钮方案') allOk = false;
      if (p.liveHint !== 'pad-off') allOk = false;
    }
    if (p.howtoCards.map((c) => c.mode).join(',') !== 'voice,keys,softPad,camera') allOk = false;
  }
  check('四模式 projection 字段完整', allOk);
  const camBound = build({
    mode: 'camera',
    workbench: baseWb,
    vm: baseVm,
    camera: {
      enabled: true,
      running: true,
      presence: 'present',
      bound: 5,
      actionsLine: '摇头→取消 · 闭眼→听写 · 离席→遮罩',
    },
    softPad: { schemeCount: 1, empty: false },
    howto: {},
    t: tFn,
  });
  check(
    'camera liveHint 用动作摘要',
    !!(camBound && camBound.liveHint === '摇头→取消 · 闭眼→听写 · 离席→遮罩' && camBound.liveStatus === '已就绪')
  );
}
const shell = readFileSync(join(root, 'src/js/features/home/home-shell.js'), 'utf8');
check('shell workbench 不写平行状态', shell.includes('有 workbench 时状态/CTA 只走'));

const rec = readFileSync(join(root, 'src/js/features/mapping/mapping-recording.js'), 'utf8');
check('setRecording 写 ipcPhase', rec.includes('OneToneRecordIpcLifecycle') && rec.includes('rec.ipcPhase'));
check('setRecording 用 applyLegacyMode', rec.includes('applyLegacyMode'));
check('setRecording 函数完整', /function setRecording\(mode,opts\)\{[\s\S]*hooks\(\)\.renderAddButton\(\);\s*\}/.test(rec));
check('record cancel bar 读 ipcPhase', rec.includes('buildRecordCancelBarModel') && rec.includes('isRecordingUi'));
check('ot:record-ipc 同步 cancel/feedback/flow', rec.includes("ot:record-ipc") && rec.includes('renderRecordCancelBar'));

const keysPanel = readFileSync(join(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
check('keys feedback 经 isRecordingUi', keysPanel.includes('recordingUiSnapshot') && keysPanel.includes('ipcPhase'));

const keysNav = readFileSync(join(root, 'src/js/features/mapping/keys-step-nav.js'), 'utf8');
check('keys flow chrome 含 ipcPhase', keysNav.includes('ipcPhase') && keysNav.includes('isRecordingUi'));

const bridge = readFileSync(join(root, 'src/js/core/app-bridge.js'), 'utf8');
check('app-bridge isRecording 经 isRecordingUi', bridge.includes('isRecordingUi'));

const trayRs = readFileSync(join(root, 'src-tauri/src/tray.rs'), 'utf8');
check('tray 含 statusToken', trayRs.includes('statusToken') || trayRs.includes('status_token'));
check('tray 读 runtime_status_protocol', trayRs.includes('runtime_status_protocol'));
check('tray 读 statusText', trayRs.includes('statusText'));
check('tray 读 canPause/canResume', trayRs.includes('canPause') && trayRs.includes('canResume'));

const hudRs = readFileSync(join(root, 'src-tauri/src/coach_hud.rs'), 'utf8');
check('HUD 含 status_token', hudRs.includes('status_token'));
check('HUD 含 status_text 协议字段', hudRs.includes('status_text') && hudRs.includes('trigger_text'));

const trayCmd = readFileSync(join(root, 'src-tauri/src/ipc/commands/shell/tray.rs'), 'utf8');
check('cmd_runtime_status_protocol 存在', trayCmd.includes('cmd_runtime_status_protocol'));

const debugPanel = readFileSync(join(root, 'src/js/features/debug/debug-panel.js'), 'utf8');
check('快控探针 8 字段', debugPanel.includes('debugQuickCtrlProbe') && debugPanel.includes('canResume'));
check('快控不重建 model', !/\bbuildHomeWorkbenchModel\s*\(/.test(debugPanel));
check('快控含触发一次', debugPanel.includes("data-qc-act=\"trigger\"") || debugPanel.includes("act==='trigger'"));
check('快控含模拟异常', debugPanel.includes('simulateError') && debugPanel.includes('__otRuntimeStatusOverride'));
check('快控对照 Hero token', debugPanel.includes('data-wb-status-token') && debugPanel.includes('buildCompareProbe'));
check('lexicon needsSetup normalize', sandbox.OneToneRuntimeStatusLexicon.normalize('needsSetup') === 'needsSetup');
check('tray 无协议才 derive', trayRs.includes('Local derive only when no published protocol'));
check('model 读 simulate override', readFileSync(join(root, 'src/js/features/home/home-workbench-model.js'), 'utf8').includes('__otRuntimeStatusOverride'));

const roadmapManual = roadmap.includes('人工三端一致性检查') && roadmap.includes('canResume=true');
check('roadmap 三端一致性清单', roadmapManual);

console.log(`[home-roadmap] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
