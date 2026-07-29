// P6 语音短语工具单测：
// 用 esbuild 把 src-islands/domain/phrase-utils.ts 转译为 ESM，在 node 下验证
// normalize/add/remove/merge 逻辑（与 legacy voice-settings-view-model.js 清洗规则一致）。
// 运行：node scripts/test-voice-config.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = resolve(root, 'src-islands/domain/phrase-utils.ts');

const result = await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  write: false,
  platform: 'neutral',
  logLevel: 'silent',
});
const code = result.outputFiles[0].text;
const tmp = path.join(os.tmpdir(), `phrase-utils-${Date.now()}.mjs`);
writeFileSync(tmp, code);

const mod = await import('file://' + tmp);
const { normalizePhraseList, mergeZhEn, addPhrase, removePhrase } = mod;

let failed = false;
function check(name, cond) {
  if (cond) console.log('  PASS', name);
  else {
    console.error('  FAIL', name);
    failed = true;
  }
}

check('normalize 去除空串', normalizePhraseList(['', '  ', '你好']).length === 1);
check('normalize 去除纯标点噪声(?？.-_)', normalizePhraseList(['?', '.', '-', '_', '？']).length === 0);
check('normalize 保留全角句号(非 legacy 噪声集)', normalizePhraseList(['。', '开始输入']).length === 2);
check('normalize 去除 [unk]', normalizePhraseList(['[UNK]', '结束输入']).length === 1);
check('normalize 大小写去重', JSON.stringify(normalizePhraseList(['ABC', 'abc'])) === JSON.stringify(['ABC']));
check('normalize 非数组安全', normalizePhraseList(undefined).length === 0);

check('mergeZhEn 合并 zh+en', mergeZhEn(['取消'], ['cancel']).length === 2);
check('mergeZhEn 空安全', mergeZhEn(null, undefined).length === 0);

check('addPhrase 追加', JSON.stringify(addPhrase(['a'], 'b')) === JSON.stringify(['a', 'b']));
check('addPhrase 去重(大小写)', JSON.stringify(addPhrase(['Abc'], 'abc')) === JSON.stringify(['Abc']));
check('addPhrase 空值不变', JSON.stringify(addPhrase(['a'], '')) === JSON.stringify(['a']));

check('removePhrase 删除', JSON.stringify(removePhrase(['a', 'b'], 'a')) === JSON.stringify(['b']));
check('removePhrase 大小写不敏感', JSON.stringify(removePhrase(['Abc', 'x'], 'abc')) === JSON.stringify(['x']));

try {
  const fs = await import('node:fs');
  fs.unlinkSync(tmp);
} catch {
  /* ignore */
}

if (failed) {
  console.error('[voice-config] 单测失败');
  process.exit(1);
}
console.log('[voice-config] 单测通过：短语清洗/增删逻辑正确。');
