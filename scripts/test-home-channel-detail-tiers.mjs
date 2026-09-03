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

const sandbox = { console, globalThis: null, window: null };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

const t = (k, fb) => fb || k;
loadIife('src/js/features/home/home-hero-mode-model.js', sandbox);
const model = sandbox.OneToneHomeHeroModeModel;

function cardFor(proj, mode) {
  return (proj.howtoCards || []).find((c) => c.mode === mode);
}

function build(mode, token, extras) {
  extras = extras || {};
  return model.build({
    mode,
    workbench: Object.assign({ statusToken: token, targetLabel: 'Cursor', statusLine: token }, extras.workbench || {}),
    vm: extras.vm || { micLabel: 'Mic A', wakePrimary: 'Hey', triggerKey: 'Vol-', engineLine: 'Whisper · local' },
    howto: extras.howto || {
      micEmpty: false,
      micLabel: 'Mic A',
      wakeMain: 'Hey',
      triggerKey: 'Vol-',
      keysEmpty: false,
      keysLine: 'Vol- → Alt',
      keysEnabled: true,
      endPhraseMain: '发送',
      finishBehavior: '单击开始，再单击后 5.0 秒发送',
      finish: '单击开始，再单击后 5.0 秒发送',
    },
    camera: extras.camera || { enabled: false },
    softPad: extras.softPad || {
      controlLbl: 'Codex',
      configLbl: 'Soft Pad',
      configConfigured: true,
      boundName: 'Cursor',
      schemeCount: 2,
      heroCaps: { bind: 'Cursor', scheme: 'Soft Pad', status: 'Codex' },
    },
    t,
  });
}

check('enrichHowtoCardDetail exported', typeof model.enrichHowtoCardDetail === 'function');
check('shouldAutoExpandChannelDetail exported', typeof model.shouldAutoExpandChannelDetail === 'function');

const voice = build('voice', 'ready');
const voiceCard = cardFor(voice, 'voice');
check('voice detail.core exists', voiceCard && voiceCard.detail && voiceCard.detail.core.length >= 1);
check('voice detail.core max 2', voiceCard.detail.core.length <= 2);
check('voice detail.headline', voiceCard.detail.headline === '现在怎么用');
check('voice detail no duplicate wake in core', (() => {
  var vals = voiceCard.detail.core.map((r) => r.val);
  return vals.filter((v) => v === 'Hey').length <= 1;
})());
check('voice detail end phrase keyword', voiceCard.detail.core.some((r) => r.val === '发送'));
check('voice finish not in core', !voiceCard.detail.core.some((r) => String(r.val).includes('单击')));
check('voice summary action how', voiceCard.detail.summary.includes('Hey'));
check('voice detail.advanced configured', voiceCard.detail.advanced.length >= 1);
check('voice advanced engine and finish', (() => {
  var adv = voiceCard.detail.advanced;
  var lbls = adv.map((r) => r.lbl).join(' ');
  var vals = adv.map((r) => r.val).join(' ');
  return (
    adv.some((r) => r.lbl === '引擎') &&
    adv.some((r) => String(r.val).includes('单击')) &&
    !adv.some((r) => r.lbl === '麦克风') &&
    !lbls.includes('logic') &&
    !lbls.includes('homeWbHowToEngine') &&
    !lbls.includes('homeWbFlowNext') &&
    !vals.includes('Hey')
  );
})());
const voicePause = build('voice', 'ready', {
  howto: {
    micEmpty: false,
    micLabel: 'Mic A',
    wakeMain: 'Hey',
    endPhraseMain: '—',
  },
});
check(
  'voice pause-send fallback',
  cardFor(voicePause, 'voice').detail.core.some((r) => r.val === '停顿后发送')
);

const keys = build('keys', 'ready');
const keysCard = cardFor(keys, 'keys');
check('keys detail.core target', keysCard.detail.core.some((r) => r.lbl === '打到' && r.val === 'Cursor'));
check('keys detail.core no trigger chip', !keysCard.detail.core.some((r) => r.lbl === '触发键'));
check('keys detail.core no end phrase', !keysCard.detail.core.some((r) => r.val === '发送'));
check('keys hold in summary', keysCard.detail.summary.includes('Vol-'));
check('keys detail.advanced keysLine', keysCard.detail.advanced.some((r) => r.lbl === '规则简介'));

const pad = build('softPad', 'ready');
const padCard = cardFor(pad, 'softPad');
check('softPad detail.core habit', padCard.detail.core.length >= 1);
check('softPad detail.advanced bind', padCard.detail.advanced.some((r) => r.lbl === '绑定'));
check('softPad advanced no cap keys', !padCard.detail.advanced.some((r) => r.lbl === 'bind' || r.lbl === 'scheme'));

const cam = build('camera', 'ready', {
  camera: {
    enabled: true,
    running: true,
    status: 'running',
    presence: 'present',
    bound: 1,
    actionsLine: '摇头 → 取消',
    prefs: { triggers: { okHand: true }, okHand: 'pressEsc' },
  },
});
const camCard = cardFor(cam, 'camera');
check('camera detail.core gesture', camCard.detail.core.some((r) => r.lbl === '手势'));
check('camera detail.sections gesture groups', camCard.detail.sections.length >= 1);
check('camera advanced no liveHint', !camCard.detail.advanced.some((r) => r.lbl === '提示' || r.lbl === 'homeWbLiveHint'));

const setup = build('voice', 'needsSetup', {
  howto: { micEmpty: true, keysEmpty: true, wakeMain: '—' },
  vm: { micLabel: '', triggerKey: '—' },
});
check('auto expand needsSetup', model.shouldAutoExpandChannelDetail('needsSetup', false) === true);
check('no auto expand dictating', model.shouldAutoExpandChannelDetail('needsSetup', true) === false);
const setupCard = cardFor(setup, 'voice');
check('empty voice core fallback', setupCard.detail.core.length >= 1);

const src = readFileSync(join(root, 'src/js/features/home/home-hero-mode-model.js'), 'utf8');
check('build enriches all cards', src.includes('enrichHowtoCardDetail(cards[ci]'));
check('no showcase dump in advanced', !src.includes('rowsFromShowcaseNodes') && !src.includes('advanced.concat(rowsFromShowcaseNodes'));
const css = readFileSync(join(root, 'src/css/home-workbench.css'), 'utf8');
check('advanced hidden beats display grid', css.includes('.wb-channel-detail-advanced[hidden]'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
