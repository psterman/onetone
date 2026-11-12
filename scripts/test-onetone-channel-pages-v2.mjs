/**
 * Smoke: Keys / Voice / Soft Pad capability + after-habit prototypes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proto = (...parts) =>
  fs.readFileSync(path.join(root, 'prototypes', ...parts), 'utf8');

function check(name, cond) {
  if (!cond) {
    console.error('FAIL:', name);
    process.exitCode = 1;
    return;
  }
  console.log('ok:', name);
}

const index = proto('onetone-channel-pages-index.html');
const keys = proto('onetone-keys-capability-v2.html');
const voice = proto('onetone-voice-capability-v2.html');
const pad = proto('onetone-softpad-capability-v2.html');

check('index links three + habit', ['keys-capability', 'voice-capability', 'softpad-capability', 'ia-left-nav'].every((s) => index.includes(s)));
check('keys keeps 听写键/说完后', keys.includes('听写键') && keys.includes('说完后'));
check('keys habit handoff oral', keys.includes('口头命令的匹配已放到习惯页'));
check('voice keeps 唤醒', voice.includes('唤醒词') && voice.includes('免按键语音'));
check('voice oral → habit', voice.includes('口头命令匹配已放到习惯页'));
check('pad keeps 布局/车道', pad.includes('布局预览') && pad.includes('用途与车道'));
check('pad bind → habit', pad.includes('键位 ↔ 命令 在习惯页匹配'));
check('cross-nav present', [keys, voice, pad].every((h) => h.includes('onetone-ia-left-nav-v2.html')));

const afterIndex = proto('onetone-channel-after-index.html');
const keysAfter = proto('onetone-keys-after-habit.html');
const voiceAfter = proto('onetone-voice-after-habit.html');
const padAfter = proto('onetone-softpad-after-habit.html');

check('after-index links three', ['keys-after-habit', 'voice-after-habit', 'softpad-after-habit'].every((s) => afterIndex.includes(s)));
check('keys-after: 听写方式 first', keysAfter.includes('本通道 · 听写') && keysAfter.includes('听写方式'));
check('keys-after: 动作序列 list', keysAfter.includes('本通道 · 动作序列') && keysAfter.includes('粘贴并回车'));
check('keys-after: 新建/模板', keysAfter.includes('+ 新建') && keysAfter.includes('模板'));
check('keys-after: Soft Pad not in rail', keysAfter.includes('口令 / Soft Pad 不在此') && !keysAfter.includes('data-panel="softPad"'));
check('keys-after: theme switch', keysAfter.includes('data-theme-pick') && keysAfter.includes('data-style-pick="graphite"') && keysAfter.includes('onetone-channel-after-theme.css'));
check('voice-after: Mac 进门口令', voiceAfter.includes('data-pane="gate"') && voiceAfter.includes('命令键'));
check('voice-after: 会话听写+口头', voiceAfter.includes('输入听写') && voiceAfter.includes('oral-cont'));
check('voice-after: 现页输入法面', voiceAfter.includes('voice-ime-desk') && voiceAfter.includes('voice-finish-card') && voiceAfter.includes('ime-preset-item') && voiceAfter.includes('icons/ime/xunfei.png') && voiceAfter.includes('voice-match-chain') && voiceAfter.includes('说完后'));
check('voice-after: LIVE 抽屉', voiceAfter.includes('liveDrawer') && voiceAfter.includes('试麦'));
check('voice-after: 习惯挂载 CTA', voiceAfter.includes('在习惯管理通道'));
check('voice-after: 砍整库', voiceAfter.includes('自定义快捷键') || voiceAfter.includes('手势整库'));
check('voice-after: theme switch', voiceAfter.includes('data-theme-pick') && voiceAfter.includes('onetone-channel-after-theme.css'));
check('pad-after: 去习惯补绑', padAfter.includes('去习惯补绑') && padAfter.includes('六通道挑源'));
check('pad-after: Auto 车道', padAfter.includes('Auto'));
check('pad-after: theme switch', padAfter.includes('data-style-pick="graphite"'));
check('after cross-nav', [keysAfter, voiceAfter, padAfter].every((h) => h.includes('onetone-ia-left-nav-v2.html')));

const themeCss = proto('onetone-channel-after-theme.css');
const themeJs = proto('onetone-channel-after-theme.js');
check('theme css has dark+graphite', themeCss.includes('data-theme="dark"') && themeCss.includes('data-style="graphite"'));
check('theme js persists', themeJs.includes('ot_channel_after_theme') && themeJs.includes('graphite'));

if (process.exitCode) process.exit(process.exitCode);
console.log('onetone-channel-pages-v2 smoke passed');
