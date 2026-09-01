// P0 tray menu guards — scheme A: scene block + subtabs, no hero/habit.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) { pass++; console.log('  ✓', label); }
  else { fail++; console.error('  ✗', label); }
}
function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

const trayHtml = read('src/tray-menu.html');
check('tray scene block', trayHtml.includes('traySceneBlock') && trayHtml.includes('block:scene'));
check('tray no hero', !trayHtml.includes('tray-status-hero'));
check('tray no habit row', !trayHtml.includes('tray-habit-row'));
check('tray scene preset js', trayHtml.includes('tray-scene-preset.js'));
check('tray channel blocks kept', trayHtml.includes('tray-channel-block'));

const indexHtml = read('src/index.html');
check('editor subtabs', indexHtml.includes('softPadTrayChSubtabs'));
check('editor persona seg', indexHtml.includes('softPadTrayPersonaSeg') && indexHtml.includes('data-persona="compact"') && indexHtml.includes('精简'));
check('editor no layout dual list', !indexHtml.includes('softPadTrayEditorBlocks'));

const trayUi = read('src/js/features/agent/soft-pad-tray-ui.js');
check('soft-pad-tray setTab', trayUi.includes('function setTab'));
check('soft-pad-tray renderSwitchCards', trayUi.includes('renderSwitchCards'));
check('habit panel null-safe', trayUi.includes('function channels()') && !trayUi.includes('(trayState.channels || [])'));
check('habit panel todayByChannel', trayUi.includes('todayByChannel') && trayUi.includes('channelUsage'));
check('preview channel click', trayUi.includes('wirePreviewChannelClicks'));
check('onPanelEnter defers setTab', trayUi.includes("setTab(opts.trayEditorFocus || 'habit')") && !trayUi.match(/wireOnce[\s\S]*setTab\('habit'\)/));
check('preview footer host', indexHtml.includes('softPadTrayPreviewFooter'));
check('preview seps', indexHtml.includes('block:sep-ch') && indexHtml.includes('block:sep-mic'));
check('tray os channels css', indexHtml.includes('tray-os-channels.css'));
check('preview mic row structure', indexHtml.includes('softPadTrayMicRow') && indexHtml.includes('mic-row'));
check('no tray-layout-editor script', !indexHtml.includes('tray-layout-editor.js'));

const tcc = read('src/js/features/settings/tray-channel-controls.js');
check('compact L2 only no trayShow', tcc.includes("c.tier === 'l2'") && !tcc.includes("id === 'trayShow'"));
check('preview focus channel', tcc.includes('setPreviewFocusChannel'));
check('compact tray link', tcc.includes('cc-row-link'));

const v2 = read('src/js/features/settings/tray-layout-v2.js');
check('block scene catalog', v2.includes('block:scene'));
check('persona preset', v2.includes('applyPersonaPreset'));
check('padRequireFg control', v2.includes('padRequireFg'));

const rust = read('src-tauri/src/tray_customization.rs');
check('rust block scene', rust.includes('block:scene'));
check('rust camNoFaceMute', rust.includes('camNoFaceMute'));

const runtime = read('src-tauri/src/tray_runtime.rs');
check('tray runtime module', runtime.includes('TrayScenePreset'));

const trayEditorCss = read('src/css/tray-editor.css');
const softPadHubCss = read('src/css/soft-pad-hub.css');
check('subtab flex override', trayEditorCss.includes('.soft-pad-tray-editor .tray-ch-subtabs') && trayEditorCss.includes('flex: 0 0 auto'));
check('responsive stack breakpoint', softPadHubCss.includes('max-width: 859px'));
check('tray page full width', softPadHubCss.includes('max-width: none') && softPadHubCss.includes('#settingsPanelTray .tray-app-page'));
check('preview transparent bg', softPadHubCss.includes('.soft-pad-face-tray__preview') && softPadHubCss.includes('background: transparent'));
check('preview fixed editor fluid', softPadHubCss.includes('minmax(320px, 380px) minmax(0, 1fr)'));
check('preview switch width lock', read('src/css/tray-os-channels.css').includes('max-width: var(--ot-sw-w) !important'));

const trayStateRs = read('src-tauri/src/tray_state.rs');
check('rust todayByChannel', trayStateRs.includes('today_by_channel') && trayStateRs.includes('TodayByChannel'));

check('editor habits link deduped', !indexHtml.includes('softPadTrayOpenHabits') && trayUi.includes('softPadTrayOpenHabitsLink') && trayUi.includes('跳转「我的习惯」查看详情'));
check('ch fold actions markup', tcc.includes('ch-fold-btn') && tcc.includes('ch-actions') && tcc.includes('ch-drawer'));
check('tray menu no inline ch flex', !trayHtml.includes('.ch-title-row{display:flex'));
const trayRs = read('src-tauri/src/tray.rs');
const trayIpc = read('src-tauri/src/ipc/commands/shell/tray.rs');
check('resize tray width chrome', trayRs.includes('TRAY_CHROME') && trayRs.includes('TRAY_SHELL_W') && trayRs.includes('width: Option<f64>'));
check('ipc tray set size width', trayIpc.includes('width: Option<f64>'));
check('tray footer nav layout', read('src/js/features/settings/tray-footer.js').includes('tray-ft--nav') && read('src/js/features/settings/tray-footer.js').includes('tray-ft__row--main'));
check('tray anchor reposition', trayRs.includes('TRAY_MENU_ANCHOR_X') && trayRs.includes('tray_anchor_from_event'));
check('tray menu no shell scroll', trayHtml.includes('overflow-x:hidden') && !trayHtml.includes('overflow-y:auto'));
const scenePreset = read('src/js/features/settings/tray-scene-preset.js');
const trayRuntimeRs = read('src-tauri/src/tray_runtime.rs');
check('expand triggers onResize', tcc.includes('toggleFold') && tcc.includes('opts.onResize'));
check('no scene preset tip', !scenePreset.includes('点预设批量改开关'));
check('no preview switch-only label', !indexHtml.includes('开关 only'));
check('tray save json arg', tcc.includes("invoke('cmd_save', { json: JSON.stringify(body) })"));
check('scene preset mic ipc', scenePreset.includes('cmd_mic_set_mute') && !scenePreset.includes("action: 'mic_toggle'"));
check('tray menu onSwitchChange', trayHtml.includes('onSwitchChange') && trayHtml.includes('onResize'));
check('fg scene sync capture', trayRs.includes('TRAY_OPEN_FG') && trayRs.includes('capture_tray_foreground_identity'));
check('tray fg noise filter', read('src-tauri/src/app_identity.rs').includes('is_tray_open_fg_noise') && read('src-tauri/src/app_identity.rs').includes('explorer.exe'));
check('fg track skips shell noise', read('src-tauri/src/keyboard.rs').includes('is_tray_open_fg_noise'));
check('global patch keeps open fg', trayStateRs.includes('tray_open_foreground') && trayStateRs.includes('assemble_global_with_fg'));
check('tray scene sync async', trayRs.includes('tray-scene-sync') && trayRs.includes('sync_active_scene_from_foreground'));
check('fold visual only', !tcc.includes('ch-fold-btn__lbl') && !tcc.includes('更多开关'));
check('no scene status text', !scenePreset.includes('tray-scene-status__text') && !scenePreset.includes('当前：按你的设置'));
check('activeSceneQuick', scenePreset.includes('activeSceneQuick') && scenePreset.includes('sceneMatches'));
check('tray os context ipc', trayIpc.includes('cmd_tray_os_context') && tcc.includes('cmd_tray_os_context'));
check('tray os readConfig fallback', tcc.includes('return osCtx.config || null'));
check('tray os ingest', tcc.includes('ingestOsContext'));
check('scene block app label', scenePreset.includes('sceneLabelFromGlobal') && scenePreset.includes('foregroundLabel'));
check('tray mic cache no wasapi', trayStateRs.includes('TRAY_MIC_CACHE') && !trayStateRs.match(/assemble_mic[\s\S]*get_default_capture_mute/));
check('tray menu no bundled os context', !trayStateRs.includes('os_context') && trayHtml.includes('hydrateOsContext'));
check('tray voice unpark', tcc.includes('unparkVoiceForTray') && tcc.includes('cmd_set_settings_drawer_open'));
check('tray scene applying guard', scenePreset.includes('if (applying) return') && scenePreset.includes('applying'));
check('tray scene persist apply', scenePreset.includes('applyPersistedSceneOnOpen'));
check('tray runtime normalize preset', scenePreset.includes('normalizeTrayScenePreset'));
check('tray load before render', trayHtml.includes('deferRender:true') && trayHtml.includes('loadRuntime'));
check('mic skip scene preset', !trayHtml.includes('onManualSwitchChange()') || trayHtml.includes('onTrayChannelSwitchChange'));
check('tray runtime save flat args', read('src-tauri/src/ipc/commands/shell/tray_runtime_cmd.rs').includes('tray_scene_preset: Option'));
check('tray scene deferred click', scenePreset.includes('setTimeout') && scenePreset.includes('patchOsSnapshotLocal'));
check('tray hydrate before render', trayHtml.includes('hydrateOsContext') && !trayHtml.match(/applyPersistedSceneOnOpen\(\)/));
check('tray refresh segments ipc', trayIpc.includes('cmd_tray_refresh_segments'));
check('tray os context permitted', read('src-tauri/permissions/app-ipc.toml').includes('allow-cmd-tray-os-context'));
check('tray voice no sync wake begin', tcc.includes('trayActivateVoiceListening') && !tcc.includes('cmd_voice_wake_phrase_test_begin'));
check('tray dismiss watch', trayRs.includes('tray-dismiss') && trayRs.includes('TRAY_MENU_DISMISS_GEN'));
check('tray eval deferred', trayRs.includes('run_on_main_thread') && trayRs.includes('__tray_ready__'));
check('tray mic self ref', trayHtml.includes('var self=this') && trayHtml.includes('TrayMicToggle'));
check('tray save indicator', indexHtml.includes('tray-save-indicator') && trayUi.includes('flashSaveIndicator'));
check('preview sync pulse', trayUi.includes('is-sync-pulse') && trayEditorCss.includes('.soft-pad-tray-menu-shell.is-sync-pulse'));
check('tray schemes retained', trayUi.includes('schemes: data.schemes'));
check('tray footer module', read('src/js/features/settings/tray-footer.js').includes('OneToneTrayFooter'));
check('compact persona alias', v2.includes('normalizePersona') && v2.includes('inferPersonaFromLayout'));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
