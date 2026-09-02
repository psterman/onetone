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
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

const t = (k, fb) => fb || k;
loadIife('src/js/features/home/home-hero-mode-model.js', sandbox);

const model = sandbox.OneToneHomeHeroModeModel;
check('hero-mode-model 导出 showcaseFor', typeof model.showcaseFor === 'function');

function build(mode, token, extras) {
  extras = extras || {};
  return model.build({
    mode,
    workbench: { statusToken: token, targetLabel: 'Cursor', statusLine: token },
    vm: extras.vm || { micLabel: 'Mic A', wakePrimary: 'Hey', triggerKey: 'Vol-' },
    howto: extras.howto || { micEmpty: false, wakeMain: 'Hey', triggerKey: 'Vol-', keysEmpty: false, keysLine: 'Vol- → Alt' },
    camera: extras.camera || { enabled: false },
    softPad: extras.softPad || {
      controlLbl: 'Codex',
      configLbl: 'Soft Pad',
      heroCaps: { bind: 'Cursor', scheme: 'Soft Pad', status: 'Codex', account: 'user', quota: '12%', token: '已配' },
    },
    t,
  });
}

const voice = build('voice', 'listening');
check('voice showcase schema=linear-prod', voice.showcase && voice.showcase.schema === 'linear-prod');
check('voice showcase 3 节点', voice.showcase.nodes.length === 3);
check('voice visual=orb', voice.showcase.visual === 'orb');

const keys = build('keys', 'triggered');
check('keys visual=mark', keys.showcase.visual === 'mark');

const pad = build('softPad', 'triggered');
check('softPad schema=outline', pad.showcase.schema === 'outline');
check('softPad capabilities 6', pad.showcase.capabilities.agent.length + pad.showcase.capabilities.data.length === 6);

const cam = build('camera', 'ready', {
  camera: {
    enabled: true,
    running: true,
    status: 'running',
    presence: 'present',
    prefs: { triggers: { okHand: true, blink: true }, okHand: 'pressEsc', deliberateBlink: 'pressEnter' },
  },
});
check('camera schema=multimodal', cam.showcase.schema === 'multimodal');
check('camera 4 维度', cam.showcase.groups && cam.showcase.groups.length === 4);
check('camera gaze 维含 blink', cam.showcase.groups.some((g) => g.id === 'gaze' && g.rules.some((r) => r.id === 'blink')));
const camIdle = build('camera', 'idle', { camera: { enabled: true, prefs: {} } });
check('camera 未配置仍有手势槽', camIdle.showcase.groups.find((g) => g.id === 'gesture').rules.length === 4);
check('camera 未配置规则 is catalog', camIdle.showcase.groups[1].rules[0].configured === false);
check('CAMERA_GROUP_DEFS 长度 4', model.CAMERA_GROUP_DEFS && model.CAMERA_GROUP_DEFS.length === 4);

const html = readFileSync(join(root, 'src/index.html'), 'utf8');
check('index 含 wbHeroLayout', html.includes('id="wbHeroLayout"'));
check('index 无 wbHeroShowcaseDetail', !html.includes('id="wbHeroShowcaseDetail"'));

const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
check('workbench 含 paintSoftPadPane', wb.includes('function paintSoftPadPane'));
check('workbench softPad 四 Tab', wb.includes('paintSoftPadPaneCap') && wb.includes('paintSoftPadPaneKbd') && wb.includes('paintSoftPadPaneHistory'));
check('workbench softPad Tab 联动', wb.includes('function heroPaneTabForSoftPadSel'));
check('workbench 右栏恢复 cap-card', wb.includes('wb-hero-cap-card'));
check('workbench 摄像头状态条', wb.includes('function cameraStatusGridHtml'));
check('workbench 点击支持 data-micro-key', wb.includes('[data-micro-key]'));
check('workbench 摄像头徽章在 vis-meta', wb.includes('function paintCameraVisMetaBadges'));
check('workbench 无 patchHowtoDrawer 调用', !wb.includes('patchHowtoDrawer'));
check('workbench 无 howtoExpandedKind', !wb.includes('howtoExpandedKind'));
check('workbench linear flow 用 flow-desk', wb.includes('wb-hero-flow-desk') && wb.includes('flow-node-btn'));
check('workbench softPad kbd-panel', wb.includes('wb-hero-kbd-panel') && wb.includes('wb-hero-kbd-strip-value'));
check('workbench pills 无 statusPill', !wb.includes('statusPill'));

const padUi = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
check('pad hero 预览含 voice-hint', padUi.includes('wb-hero-pad-voice-hint'));
check('pad hero 预览可传 mapping', padUi.includes('opts.mapping'));

const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
check('panels renderHowTo 无 drawer', !panels.includes('howtoDrawerHtml(expCard'));

const i18nCode = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
const i18nSandbox = { globalThis: null, window: null };
i18nSandbox.globalThis = i18nSandbox;
i18nSandbox.window = i18nSandbox;
loadIife('src/js/core/i18n.js', i18nSandbox);
const zh = i18nSandbox.OneToneI18n && i18nSandbox.OneToneI18n._testZh
  ? i18nSandbox.OneToneI18n._testZh
  : null;
if (zh) {
  check('i18n zh homeWbShowcaseNodeDictate', zh.homeWbShowcaseNodeDictate === '听写');
  check('i18n zh homeWbShowcaseFocusListening', zh.homeWbShowcaseFocusListening === '聆听中…');
  check('i18n zh facts 做什么', zh.homeWbShowcaseFn === '做什么');
  check('i18n zh homeWbHeroPaneCrumbKbd', zh.homeWbHeroPaneCrumbKbd === '键盘');
  check('i18n zh homeWbCamDimGaze', zh.homeWbCamDimGaze === '眼神');
  check('i18n zh homeWbCamStatusRun', zh.homeWbCamStatusRun === '运行状态');
} else {
  check('i18n 可解析', i18nCode.includes("homeWbShowcaseNodeDictate:'听写'"));
  check('i18n focus listening', i18nCode.includes("homeWbShowcaseFocusListening:'聆听中…'"));
  check('i18n facts plain', i18nCode.includes("homeWbShowcaseFn:'做什么'"));
}

const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
check('css 含 wb-hero-crumb', css.includes('.wb-hero-crumb'));
check('css 含 wb-hero-kbd-strip-value', css.includes('.wb-hero-kbd-strip-value'));
check('css 宽屏断点 1024', css.includes('min-width: 1024px') && css.includes('max-width: none'));
check('css hero flow-desk', css.includes('.wb-hero-flow-desk'));
check('css 含 wb-hero-status-grid', css.includes('.wb-hero-status-grid'));
check('css 含 wb-hero-pane-header', css.includes('.wb-hero-pane-header'));
check('css softPad 面板内边距', css.includes('[data-wb-hero-mode="softPad"]'));
check('css pad scale', css.includes('--wb-hero-pad-scale'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
