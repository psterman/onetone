// FE lone-modifier gesture (tap/double/hold) for trigger recording.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/js/features/mapping/mapping-recording-input.js'), 'utf8');
const handler = readFileSync(join(root, 'src-tauri/src/ipc/recording/hardware/handler.rs'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.error('  FAIL ' + name); }
}

console.log('[mod-gesture-fe]');
check('FE 手势状态机', src.includes('function onFeModKeyDown') && src.includes('function onFeModKeyUp'));
check('双击提交 double', src.includes("commitFeModGesture(key, 'double')"));
check('单击超时 tap', src.includes("commitFeModGesture(key, 'tap')"));
check('长按 longpress', src.includes("commitFeModGesture(key, 'longpress')"));
check('finishTrigger 带 triggerMode', src.includes('triggerMode:mode||\'tap\''));
check('Rust 不依赖 GetAsyncKeyState 必须按下', handler.includes('other_held') && handler.includes('Trust this keydown as lone-modifier'));

console.log(`[mod-gesture-fe] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
