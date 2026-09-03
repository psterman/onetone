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
  OneToneKeyLabels: {
    friendlyKeyName: (k) => (k === 'AutoTrigger' ? '音量键' : k),
  },
  OneToneState: {
    state: {
      config: {
        voiceAssistEnabled: true,
        voiceListeningStrategy: 'auto',
        activeSceneId: 'm1',
        mappings: [{ id: 'm1', triggerKey: 'AutoTrigger', enabled: true }],
      },
    },
    runtime: { paused: false },
  },
  OneToneI18n: {
    t: (k, params) => {
      const map = {
        voiceSurfaceKeyLine: '按 {key} 说话',
        voiceSurfaceKeyHint: 'hint',
        homeEndPhraseDefault: '发送',
      };
      let out = map[k] || k;
      if (params) {
        Object.keys(params).forEach((pk) => {
          out = out.replace(new RegExp('\\{' + pk + '\\}', 'g'), String(params[pk]));
        });
      }
      return out;
    },
  },
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;

loadIife('src/js/shared/voice-surface-copy.js', sandbox);
loadIife('src/js/features/home/home-hero-mode-model.js', sandbox);

const voiceCopy = sandbox.OneToneVoiceSurfaceCopy;
const model = sandbox.OneToneHomeHeroModeModel;
const t = (k, fb) => fb || k;

const resolved = voiceCopy.resolve({ dictating: false, paused: false });
check('voice surface no raw AutoTrigger', !String(resolved.line1).includes('AutoTrigger'));
check('voice surface friendly key', String(resolved.line1).includes('音量键'));

const voice = model.build({
  mode: 'voice',
  workbench: { statusToken: 'ready', targetLabel: 'Cursor' },
  vm: { micLabel: 'Mic A', wakePrimary: '开始输入', engineLine: 'Whisper' },
  howto: {
    micEmpty: false,
    wakeMain: '开始输入',
    endPhraseMain: '发送',
    finishBehavior: '单击开始，再单击后 5.0 秒发送',
    finish: '单击开始，再单击后 5.0 秒发送',
    triggerKey: 'Vol-',
    keysEmpty: false,
  },
  t,
});
const voiceCard = voice.howtoCards.find((c) => c.mode === 'voice');
check('detail headline neutral', voiceCard.detail.headline === '现在怎么用');
check('detail summary action how', voiceCard.detail.summary.includes('开始输入'));
check('detail end phrase keyword', voiceCard.detail.core.some((r) => r.val === '发送'));
check('detail finish not in core', !voiceCard.detail.core.some((r) => String(r.val).includes('单击')));
check('beginner CTA voice', model.beginnerCtaLabel('voice', { needsSetup: false, t }) === '开启语音');
check('beginner CTA no channel name', !model.beginnerCtaLabel('voice', { needsSetup: false, t }).includes('说话触发'));

const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
check('panels uses detail headline', panels.includes('detail.headline'));
check('panels endPhraseMain field', panels.includes('endPhraseMain'));
check('panels summary class', panels.includes('wb-channel-detail-summary'));

const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
check('workbench heroV3CtaLabel', wb.includes('function heroV3CtaLabel'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
