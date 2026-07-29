// P1 冒烟测试：验证 islands bundle 已产出，且 legacy 脚本顺序未被破坏。
// 运行：node scripts/smoke-islands.mjs
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = resolve(root, 'src/assets/islands/main.js');
const htmlPath = resolve(root, 'src/index.html');

let failed = false;
function check(name, cond) {
  if (cond) {
    console.log('  PASS', name);
  } else {
    console.error('  FAIL', name);
    failed = true;
  }
}

console.log('[smoke] React Islands 基础校验');
check('islands bundle 存在', existsSync(bundle));
if (existsSync(bundle)) {
  const size = readFileSync(bundle, 'utf8').length;
  check('islands bundle 非空', size > 100);
  const code = readFileSync(bundle, 'utf8');
  check('P5 基础设置岛已打进 bundle（含 ot-basic-content 标记）', code.includes('ot-basic-content'));
  check('P5 基础设置岛含总开关标记', code.includes('basic-global-listen-block'));
  check('P6 语音配置岛已打进 bundle（含 ot-voice-config 标记）', code.includes('ot-voice-config'));
  check('P6 语音配置岛含策略/短语 Tab 标记', code.includes('ot-vc-seg') && code.includes('ot-phrase-tags'));
  check('P7 映射列表岛已打进 bundle（含 __otMappingListSync 同步入口）', code.includes('__otMappingListSync'));
}
const mappingListJs = readFileSync(resolve(root, 'src/js/features/mapping/mapping-list.js'), 'utf8');
check('P7 legacy rowView 单一来源已导出', mappingListJs.includes('rowView:rowView'));
check('P7 legacy renderMappingList 岛守卫已就位', mappingListJs.includes("isMounted('mappingList')") && mappingListJs.includes('__otMappingListSync'));
const configPersistJs = readFileSync(resolve(root, 'src/js/core/config-persist.js'), 'utf8');
check('P8 applyMvpInit → OneToneIslandsRefresh 接线已就位', configPersistJs.includes('OneToneIslandsRefresh'));
const html = readFileSync(htmlPath, 'utf8');
check('legacy state.js 脚本仍在', html.includes('js/core/state.js'));
check('P6 语音配置岛容器已注入 index.html', html.includes('id="voiceConfigIsland"'));
const legacyIdx = html.indexOf('js/main-legacy.js');
const moduleIdx = html.indexOf('assets/islands/main.js');
check('module 入口已注入', moduleIdx >= 0);
check('legacy 脚本顺序未被重排（legacy 在前、module 在后）', legacyIdx >= 0 && moduleIdx > legacyIdx);

if (failed) {
  console.error('[smoke] 失败');
  process.exit(1);
}
console.log('[smoke] 通过：旧页面加载链路未被破坏，islands bundle 已就绪。');
