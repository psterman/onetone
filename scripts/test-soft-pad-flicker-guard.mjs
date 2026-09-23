// Guard: Soft Pad mid-column should not repaint on every island sync / focus tick.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
function check(name, cond) {
  if (cond) console.log('PASS ' + name);
  else {
    fail++;
    console.error('FAIL ' + name);
  }
}

const hub = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
const pad = readFileSync(join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const island = readFileSync(join(root, 'src-islands/islands/soft-pad-preview-island.tsx'), 'utf8');

check(
  'keys 模式已画预览时 skipPaint',
  /paintedMappingId === mappingId[\s\S]*?skipPaint = true/.test(hub) &&
    !/else if \(light && paintedMappingId === mappingId\)/.test(hub)
);
check('预览岛 sig 未变不重绘', /if \(sig === currentSig\) return;[\s\S]*?applyPaint\(next\)/.test(island));
check('shell remount 不连带刷功能目录', pad.includes('skipCatalog: true'));
check('markSoftPadPreviewFocus 支持 skipCatalog', /function markSoftPadPreviewFocus\(microKeyId, opts\)/.test(pad));
check('功能目录 stamp 元数据', pad.includes('function stampSoftPadFnCatalogMeta'));
check('统计区增量 patch', /patchAgentDataLive\(host, m, pad\)/.test(pad));
check('关编辑器不藏右侧功能栏', /setSoftPadFnSwapVisible\(true\)/.test(pad));

if (fail) process.exit(1);
console.log('ok soft-pad-flicker-guard');
