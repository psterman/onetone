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

const sandbox = { console, document: { getElementById: () => null } };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.OneToneHomeWorkbench = { getHeroMode: () => 'keys' };
vm.runInNewContext(
  readFileSync(join(root, 'src/js/features/home/home-action-history-card.js'), 'utf8'),
  sandbox,
  { filename: 'home-action-history-card.js' }
);
const api = sandbox.OneToneHomeActionHistoryCard;

check('exports beginnerLine', typeof api.beginnerLine === 'function');
check('keys channel', api.currentChannel() === 'key');
check(
  'softPad dump becomes human fail',
  api.beginnerLine({
    channel: 'softPad',
    kind: 'lane_nav',
    status: 'failed',
    summary: 'SoftPad · AutoTrigger → RAlt · newThread',
  }) === '没发出去'
);
check(
  'wake phrase from vosk dump',
  api.beginnerLine({
    channel: 'voice',
    kind: 'voice_phrase',
    status: 'executed',
    summary: '语音·唤醒 - vosk wake triggered: RAlt (phrase: 开始输入)',
  }) === '说「开始输入」，开始听写'
);
check(
  'key send ok',
  api.beginnerLine({ channel: 'key', kind: 'send_key', status: 'executed', summary: '按键 · 发送 RAlt' }) ===
    '按键已送达'
);
check(
  'no AutoTrigger in line',
  api.beginnerLine({
    channel: 'softPad',
    status: 'failed',
    summary: 'SoftPad · AutoTrigger → RAlt · switchAgent',
  }).indexOf('AutoTrigger') < 0
);

const src = readFileSync(join(root, 'src/js/features/home/home-action-history-card.js'), 'utf8');
check('lists with channel', src.includes('channel:currentChannel()'));
check('hides empty', src.includes('card.hidden=true'));
check('status words not glyphs', src.includes("t('homeWbHistOk'") && !src.includes("'✓'"));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exit(1);
