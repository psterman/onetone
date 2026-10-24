/**
 * Smoke: Keys / Voice / Soft Pad capability prototypes + index.
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

if (process.exitCode) process.exit(process.exitCode);
console.log('onetone-channel-pages-v2 smoke passed');
