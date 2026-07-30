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
  check('P14c SoftPad 功能瓷砖岛已打进 bundle（含 __otSoftPadFuncTilesSync）', code.includes('__otSoftPadFuncTilesSync'));
  check('P14c SoftPad 功能瓷砖岛含挂载入口', code.includes('__otMountSoftPadFuncTilesIsland'));
  check('P14d SoftPad 空态/idle 岛已打进 bundle（含 __otSoftPadEmptyIdleSync）', code.includes('__otSoftPadEmptyIdleSync'));
  check('P14d SoftPad 空态/idle 岛含挂载入口', code.includes('__otMountSoftPadEmptyIdleIsland'));
  check('P12b-1 映射编辑器展示岛已打进 bundle（含 __otMappingEditorDisplaySync）', code.includes('__otMappingEditorDisplaySync'));
  check('P12b-1 映射编辑器展示岛含挂载入口', code.includes('__otMountMappingEditorDisplayIsland'));
  check('P12b-2 收尾时序岛已打进 bundle（含 __otKeysFinishTimingSync）', code.includes('__otKeysFinishTimingSync'));
  check('P12b-2 收尾时序岛含挂载入口', code.includes('__otMountKeysFinishTimingIsland'));
  check('P12b-5 收尾模式岛已打进 bundle（含 __otKeysFinishModeSync）', code.includes('__otKeysFinishModeSync'));
  check('P12b-5 收尾模式岛含挂载入口', code.includes('__otMountKeysFinishModeIsland'));
  check('P12b-6 启动手势岛已打进 bundle（含 __otKeysTriggerModeSync）', code.includes('__otKeysTriggerModeSync'));
  check('P12b-6 启动手势岛含挂载入口', code.includes('__otMountKeysTriggerModeIsland'));
  check('P12b-3 录制取消条岛已打进 bundle（含 __otRecordCancelBarSync）', code.includes('__otRecordCancelBarSync'));
  check('P12b-3 录制取消条岛含挂载入口', code.includes('__otMountRecordCancelBarIsland'));
  check('P12b-4 映射浮动菜单岛已打进 bundle（含 __otMapMenuFloatSync）', code.includes('__otMapMenuFloatSync'));
  check('P12b-4 映射浮动菜单岛含 MapMenuFloat', code.includes('MapMenuFloat') || code.includes('mapMenuFloat'));
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
check('P14c buildSoftPadFuncTilesModel 已导出', softPadHubJs.includes('buildSoftPadFuncTilesModel: buildSoftPadFuncTilesModel'));
check('P14c soft-pad func tiles 岛守卫', softPadHubJs.includes('__otSoftPadFuncTilesMounted') && softPadHubJs.includes('__otSoftPadFuncTilesSync'));
check('P14c soft-pad render 接线挂载', softPadHubJs.includes('__otMountSoftPadFuncTilesIsland'));
check('P14d buildSoftPadEmptyIdleModel 已导出', softPadHubJs.includes('buildSoftPadEmptyIdleModel: buildSoftPadEmptyIdleModel'));
check('P14d soft-pad empty/idle 岛守卫', softPadHubJs.includes('__otSoftPadEmptyIdleMounted') && softPadHubJs.includes('__otSoftPadEmptyIdleSync'));
check('P14d soft-pad render 接线挂载', softPadHubJs.includes('__otMountSoftPadEmptyIdleIsland'));
check('P12b-1 settings-drawer 编辑器展示延迟挂载', settingsDrawerJs.includes('__otMountMappingEditorDisplayIsland'));
check('P12b-1 mapping-list buildEditorDisplayModel 已导出', mappingListJs.includes('buildEditorDisplayModel:buildEditorDisplayModel'));
check('P12b-1 renderEditor 岛守卫', mappingListJs.includes('__otMappingEditorDisplayMounted') && mappingListJs.includes('__otMappingEditorDisplaySync'));
const mappingRecJs = readFileSync(resolve(root, 'src/js/features/mapping/mapping-recording.js'), 'utf8');
check('P12b-1 录音预览岛守卫', mappingRecJs.includes('__otMappingEditorDisplayMounted') && mappingRecJs.includes('__otMappingEditorDisplaySync'));
check('P12b-2 settings-drawer 收尾时序延迟挂载', settingsDrawerJs.includes('__otMountKeysFinishTimingIsland'));
const keyFinishJs = readFileSync(resolve(root, 'src/js/features/mapping/key-finish-flow-render.js'), 'utf8');
check('P12b-2 buildKeysFinishTimingModel 已导出', keyFinishJs.includes('buildKeysFinishTimingModel:buildKeysFinishTimingModel'));
check('P12b-2 renderKeyFinishFlowPanel 岛守卫', keyFinishJs.includes('__otKeysFinishTimingMounted') && keyFinishJs.includes('__otKeysFinishTimingSync'));
check('P12b-5 settings-drawer 收尾模式延迟挂载', settingsDrawerJs.includes('__otMountKeysFinishModeIsland'));
check('P12b-5 buildKeysFinishModeModel 已导出', keyFinishJs.includes('buildKeysFinishModeModel:buildKeysFinishModeModel'));
check('P12b-5 renderKeyFinishFlowPanel mode 守卫', keyFinishJs.includes('__otKeysFinishModeMounted') && keyFinishJs.includes('__otKeysFinishModeSync'));
check('P12b-6 settings-drawer 启动手势延迟挂载', settingsDrawerJs.includes('__otMountKeysTriggerModeIsland'));
check('P12b-6 buildKeysTriggerModeModel 已导出', keysPanelJs.includes('buildKeysTriggerModeModel:buildKeysTriggerModeModel'));
check('P12b-6 renderTriggerModeSegments 岛守卫', keysPanelJs.includes('__otKeysTriggerModeMounted') && keysPanelJs.includes('__otKeysTriggerModeSync'));
check('P12b-3 settings-drawer 录制取消条延迟挂载', settingsDrawerJs.includes('__otMountRecordCancelBarIsland'));
check('P12b-3 buildRecordCancelBarModel 已导出', mappingRecJs.includes('buildRecordCancelBarModel:buildRecordCancelBarModel'));
check('P12b-3 renderRecordCancelBar 岛守卫', mappingRecJs.includes('__otRecordCancelBarMounted') && mappingRecJs.includes('__otRecordCancelBarSync'));
check('P12b-3 syncCancelButtonHost 岛上 no-op', keysPanelJs.includes('__otRecordCancelBarMounted'));
const trashMenuJs = readFileSync(resolve(root, 'src/js/features/mapping/mapping-trash-menu.js'), 'utf8');
check('P12b-4 buildMapMenuFloatModel 已导出', trashMenuJs.includes('buildMapMenuFloatModel:buildMapMenuFloatModel'));
check('P12b-4 open/close 岛守卫', trashMenuJs.includes('__otMapMenuFloatMounted') && trashMenuJs.includes('__otMapMenuFloatSync'));
const listUiJs = readFileSync(resolve(root, 'src/js/features/mapping/mapping-list-ui.js'), 'utf8');
check('P12b-4 list-ui 跳过 menuAct 双绑定', listUiJs.includes('__otMapMenuFloatMounted'));
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
