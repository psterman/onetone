// §8.5 运行期日志自动核验（Agent 可跑；交互点选仍须人工）
// 运行：node scripts/verify-islands-runtime.mjs [logPath]
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = process.argv[2] || resolve(root, 'logs/runtime-live.log');

let failed = 0;
function check(name, cond) {
  if (cond) console.log('  PASS', name);
  else {
    console.error('  FAIL', name);
    failed++;
  }
}

if (!existsSync(logPath)) {
  console.error('[verify-runtime] 日志不存在:', logPath);
  process.exit(1);
}

const log = readFileSync(logPath, 'utf8');
const lines = log.split(/\r?\n/).filter(Boolean);
const tail = lines.slice(-500).join('\n');

console.log('[verify-runtime] §8.5 日志自动核验');
console.log('[verify-runtime] 文件:', logPath, `(${lines.length} 行)`);

// 项 6 — Boot / islands bundle
check('项6: 无 process is not defined', !/process is not defined/i.test(tail));
check('项6: 有 process run entered 或 boot settled', /process run entered|boot settled/i.test(tail));

// 项 7 — vosk stop_sync 配对（最近 500 行）
const beginN = (tail.match(/vosk stop_sync begin/g) || []).length;
const endN = (tail.match(/vosk stop_sync end/g) || []).length;
check('项7: vosk stop_sync begin/end 数量配对', beginN === 0 || beginN === endN);

// 项 10 — save storm / 假死回归
check('项10: 无 UI-BLOCK 告警', !/UI-BLOCK/i.test(tail));
const unknownSave = (tail.match(/cmd_save source=unknown/g) || []).length;
const suppressedUnknown = (tail.match(/cmd_save.*suppressed source=unknown/g) || []).length;
check(
  '项10: unknown save 已被抑制或无裸 unknown invoke',
  unknownSave === 0 || suppressedUnknown >= unknownSave,
);

// P11 相关 — drawer 切换不触发 render slow 风暴
const renderSlow = (tail.match(/render slow >250ms/g) || []).length;
check('P11: 最近 500 行 render slow 告警 ≤3', renderSlow <= 3);

// islands bundle 产物
const bundle = resolve(root, 'src/assets/islands/main.js');
check('bundle 存在', existsSync(bundle));
if (existsSync(bundle)) {
  const code = readFileSync(bundle, 'utf8');
  check('P11 __otKeysStatusMounted 在 bundle', code.includes('__otKeysStatusMounted'));
  check('P10 __otSoftPadStatusMounted 在 bundle', code.includes('__otSoftPadStatusMounted'));
}

console.log('');
if (failed) {
  console.error(`[verify-runtime] ${failed} 项未通过（交互项 1–5/8/9/11 仍需 WebView 点选）`);
  process.exit(1);
}
console.log('[verify-runtime] 日志自动项通过；项 1–5/8/9/11 请在 Tauri 中人工点选。');
