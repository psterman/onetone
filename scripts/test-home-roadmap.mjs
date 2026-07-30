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
check('hero 只读 model', wb.includes('data-wb-from-model') && wb.includes('renderHeroFlowSummary(model)'));
check('publish runtime protocol', wb.includes('publishRuntimeStatusProtocol') && wb.includes('cmd_runtime_status_protocol'));
check('publish 优先 model.protocol', wb.includes('var snap=model.protocol') || wb.includes('model.protocol||null') || wb.includes('__otRuntimeStatusOverride'));
check('publish 尊重 simulate override', wb.includes('__otRuntimeStatusOverride'));
check('bindNav 无死 fallback', !wb.includes("if(action==='schemes')") && wb.includes('只认 shell-ia'));
check('hero softPad mode', wb.includes("return 'softPad'") && wb.includes('paintHeroModeChrome'));
check('refreshHeroModeSurfaces', wb.includes('function refreshHeroModeSurfaces') && wb.includes('renderHeroFlowSummary(model)') && wb.includes('renderLiveText(vm)'));
check('setHeroMode 走 refreshHeroModeSurfaces', /function setHeroMode[\s\S]*refreshHeroModeSurfaces\(\)/.test(wb) && !wb.includes('标签切换只刷 mode chrome'));
check('softPad pills 早返回', wb.includes("heroMode==='softPad'") && wb.includes('wbBtnSoftPadOpen') && wb.includes('softPadHeroSnapshot'));
check('heroModeFlowBits 四模式', wb.includes('function heroModeFlowBits') && wb.includes('homeWbFlowCtaVoice') && wb.includes('homeWbFlowCtaKeys') && wb.includes('homeWbFlowCtaSoftPad') && wb.includes('homeWbFlowCtaCamera'));

const htmlHome = readFileSync(join(root, 'src/index.html'), 'utf8');
check('hero softPad tab', htmlHome.includes('data-wb-hero-mode="softPad"') && htmlHome.includes('id="wbHeroModeSoftPad"'));

const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
check('howto softPad active 跟 mode', panels.includes("active:mode==='softPad'"));
check('panels 导出 softPadHowToSnapshot', panels.includes('softPadHowToSnapshot:softPadHowToSnapshot'));
{
  const howtoIdx = panels.indexOf("wb-howto-grid--quad");
  const voiceIdx = panels.indexOf('data-wb-howto="voice"', howtoIdx);
  const keysIdx = panels.indexOf("kind:'keys'", howtoIdx);
  const softIdx = panels.indexOf("kind:'softPad'", howtoIdx);
  const camIdx = panels.indexOf("kind:'camera'", howtoIdx);
  check('howto 卡片顺序对齐 tabs', howtoIdx >= 0 && voiceIdx > howtoIdx && keysIdx > voiceIdx && softIdx > keysIdx && camIdx > softIdx);
}

const i18nHome = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
check('hero 小白入口文案', i18nHome.includes("homeWbHeroModeVoice:'说话触发'") && i18nHome.includes("homeWbHeroModeKeys:'按键触发'") && i18nHome.includes("homeWbHeroModeSoftPad:'屏幕按钮'") && i18nHome.includes("homeWbHeroModeCamera:'摄像头确认'"));
check('hero flow 空态/CTA 文案键', i18nHome.includes("homeWbFlowEmptySoftPad:'还没有屏幕按钮方案'") && i18nHome.includes("homeWbFlowCtaSoftPad:'设置屏幕按钮'") && i18nHome.includes("homeWbFlowEmptyMic:'还没选麦克风，先选一个输入设备'"));

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
