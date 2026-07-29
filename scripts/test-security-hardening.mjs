// §8.3 安全收口静态校验：CSP / withGlobalTauri / __TAURI__ 直引收敛
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

const tauriConf = JSON.parse(readFileSync(join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
const ipcJs = readFileSync(join(root, 'src/js/core/ipc.js'), 'utf8');
const typedIpc = readFileSync(join(root, 'src-islands/ipc/typedIpc.ts'), 'utf8');

console.log('[security-83] tauri.conf.json:');
check('withGlobalTauri 已关闭', tauriConf.app.withGlobalTauri === false);
check('CSP 已配置（非 null）', tauriConf.app.security && tauriConf.app.security.csp);
check('CSP 含 script-src self', String(tauriConf.app.security.csp).includes("script-src 'self'"));
check('CSP 含 style unsafe-inline（islands 注入式 CSS）', String(tauriConf.app.security.csp).includes("'unsafe-inline'"));
check('CSP 含 connect-src ipc', String(tauriConf.app.security.csp).includes('ipc:'));

console.log('[security-83] ipc.js 集中桥:');
check('OneToneIpc.bridgeReady 已导出', ipcJs.includes('bridgeReady:bridgeReady'));
check('OneToneIpc.listen 已导出', ipcJs.includes('listen:tauriListen'));
check('优先 __TAURI_INTERNALS__ invoke', ipcJs.indexOf('__TAURI_INTERNALS__') < ipcJs.indexOf('__TAURI__'));

console.log('[security-83] legacy __TAURI__ 直引收敛:');
const legacyFiles = [
  'src/js/core/events.js',
  'src/js/core/app-mic.js',
  'src/js/core/dom.js',
  'src/js/main-legacy.js',
  'src/js/core/config-persist.js',
  'src/js/features/voice/voice-acoustic-ipc.js',
  'src/js/features/voice/voice-scheme-name-modal.js',
];
for (const rel of legacyFiles) {
  const code = readFileSync(join(root, rel), 'utf8');
  check(rel + ' 无 __TAURI__ 直引', !code.includes('__TAURI__'));
}
check('typedIpc.ts 无 __TAURI__ 直引', !typedIpc.includes('__TAURI__'));

console.log(`[security-83] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
