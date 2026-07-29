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
  check('P9a 命令搜索岛已打进 bundle（含 __otCommandPalette 入口）', code.includes('__otCommandPalette'));
  check('P9a 命令搜索岛含 wb-cmdk 标记', code.includes('wb-cmdk-panel') && code.includes('wbCommandSearchInput'));
  check('P10 SoftPad 状态栏岛已打进 bundle（含 __otSoftPadStatusMounted 标记）', code.includes('__otSoftPadStatusMounted'));
  check('P10 SoftPad 状态栏岛含状态栏 DOM 标记（softPadSummaryName）', code.includes('softPadSummaryName'));
  check('P11 Keys 状态栏岛已打进 bundle（含 __otKeysStatusMounted 标记）', code.includes('__otKeysStatusMounted'));
  check('P11 Keys 状态栏岛含状态栏 DOM 标记（keysSummaryName）', code.includes('keysSummaryName'));
  check('P12 习惯列表岛已打进 bundle（含 __otHabitHubListSync 同步入口）', code.includes('__otHabitHubListSync'));
  check('P12 习惯列表岛含 __otHabitHubListMounted 标记', code.includes('__otHabitHubListMounted'));
  check('P13 习惯 Hub 壳层岛已打进 bundle（含 __otHabitHubChromeSync）', code.includes('__otHabitHubChromeSync'));
  check('P13 习惯 Hub 壳层岛含 __otHabitHubChromeMounted 标记', code.includes('__otHabitHubChromeMounted'));
  check('P14a Keys 工作流岛已打进 bundle（含 __otKeysWorkflowSync）', code.includes('__otKeysWorkflowSync'));
  check('P14b SoftPad 工作流岛已打进 bundle（含 __otSoftPadWorkflowSync）', code.includes('__otSoftPadWorkflowSync'));
}
const mappingListJs = readFileSync(resolve(root, 'src/js/features/mapping/mapping-list.js'), 'utf8');
check('P7 legacy rowView 单一来源已导出', mappingListJs.includes('rowView:rowView'));
check('P7 legacy renderMappingList 岛守卫已就位', mappingListJs.includes("isMounted('mappingList')") && mappingListJs.includes('__otMappingListSync'));
const cmdkJs = readFileSync(resolve(root, 'src/js/features/home/home-workbench-cmdk.js'), 'utf8');
check('P9a legacy cmdk 岛守卫已就位', cmdkJs.includes('__otCommandPaletteMounted') && cmdkJs.includes('__otCommandPalette'));
const softPadHubJs = readFileSync(resolve(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
check('P10 legacy soft-pad-hub updateStatusBar 岛守卫已就位', softPadHubJs.includes('__otSoftPadStatusMounted') && softPadHubJs.includes('__otSoftPadStatusSync'));
check('P10 legacy __otSoftPadStatusRead 读桥已就位', softPadHubJs.includes('__otSoftPadStatusRead'));
const keysPanelJs = readFileSync(resolve(root, 'src/js/features/settings/keys-panel-ui.js'), 'utf8');
check('P11 legacy keys-panel renderSchemeSummary 岛守卫已就位', keysPanelJs.includes('__otKeysStatusMounted') && keysPanelJs.includes('__otKeysStatusSync'));
check('P11 legacy __otKeysStatusRead 读桥已就位', keysPanelJs.includes('__otKeysStatusRead'));
check('P11 legacy toggleMappingEnable 委托已导出', keysPanelJs.includes('toggleMappingEnable'));
const habitHubJs = readFileSync(resolve(root, 'src/js/features/mapping/habit-hub.js'), 'utf8');
check('P12 legacy cardView 单一来源已导出', habitHubJs.includes('cardView:renderCard'));
check('P12 legacy buildHabitHubListModel 已导出', habitHubJs.includes('buildHabitHubListModel:buildHabitHubListModel'));
check('P12 legacy renderList 岛守卫已就位', habitHubJs.includes("isMounted('habitHubList')") && habitHubJs.includes('__otHabitHubListSync'));
check('P12 delete 走 scheduleHubPaint 轻量刷新', habitHubJs.includes('scheduleHubPaint'));
check('P13 legacy buildHabitHubChromeModel 已导出', habitHubJs.includes('buildHabitHubChromeModel:buildHabitHubChromeModel'));
check('P13 legacy renderFilters chrome 守卫', habitHubJs.includes('__otHabitHubChromeSync'));
const settingsDrawerJs = readFileSync(resolve(root, 'src/js/features/settings/settings-drawer.js'), 'utf8');
check('P12 settings-drawer 延迟挂载已接线', settingsDrawerJs.includes('__otMountHabitHubListIsland'));
check('P13 settings-drawer chrome 延迟挂载', settingsDrawerJs.includes('__otMountHabitHubChromeIsland'));
check('P14a keys workflow 岛守卫', keysPanelJs.includes('__otKeysWorkflowMounted'));
check('P14b soft-pad workflow 岛守卫', softPadHubJs.includes('__otSoftPadWorkflowMounted'));
const tauriConf = JSON.parse(readFileSync(resolve(root, 'src-tauri/tauri.conf.json'), 'utf8'));
check('§8.3 withGlobalTauri 已关闭', tauriConf.app.withGlobalTauri === false);
check('§8.3 CSP 已收紧（非 null）', !!(tauriConf.app.security && tauriConf.app.security.csp));
const ipcJs = readFileSync(resolve(root, 'src/js/core/ipc.js'), 'utf8');
check('§8.3 OneToneIpc.listen 集中事件桥', ipcJs.includes('listen:tauriListen') && ipcJs.includes('bridgeReady:bridgeReady'));
const configPersistJs = readFileSync(resolve(root, 'src/js/core/config-persist.js'), 'utf8');
check('P8 applyMvpInit → OneToneIslandsRefresh 接线已就位', configPersistJs.includes('OneToneIslandsRefresh'));
const html = readFileSync(htmlPath, 'utf8');
check('legacy state.js 脚本仍在', html.includes('js/core/state.js'));
check('P6 语音配置岛容器已注入 index.html', html.includes('id="voiceConfigIsland"'));
{
  const mainIdx = html.indexOf('class="voice-page-main"');
  const deskIdx = html.indexOf('id="voiceDeskPanel"');
  const islandIdx = html.indexOf('id="voiceConfigIsland"');
  check(
    'P6 voiceConfigIsland 位于 voiceDeskPanel 内（非 voice-page-body 网格子项）',
    mainIdx >= 0 && deskIdx > mainIdx && islandIdx > deskIdx,
  );
}
const legacyIdx = html.indexOf('js/main-legacy.js');
const moduleIdx = html.indexOf('assets/islands/main.js');
check('module 入口已注入', moduleIdx >= 0);
check('legacy 脚本顺序未被重排（legacy 在前、module 在后）', legacyIdx >= 0 && moduleIdx > legacyIdx);

if (failed) {
  console.error('[smoke] 失败');
  process.exit(1);
}
console.log('[smoke] 通过：旧页面加载链路未被破坏，islands bundle 已就绪。');
