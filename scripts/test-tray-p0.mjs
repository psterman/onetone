// P0 tray menu guards: GlobalState fields, deep links, segment patch, perf hook.
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

const trayState = read('src-tauri/src/tray_state.rs');
check('GlobalState user_label', trayState.includes('user_label'));
check('GlobalState next_habit_label', trayState.includes('next_habit_label'));
check('GlobalState next_habit_id', trayState.includes('next_habit_id'));
check('GlobalState today_total_count + today_habit_count', trayState.includes('today_total_count') && trayState.includes('today_habit_count'));
check('GlobalState silence_remaining_ms', trayState.includes('silence_remaining_ms'));
check('GlobalState week_trend', trayState.includes('week_trend'));
check('assemble_deep_links 我的习惯', trayState.includes('"我的习惯"') && trayState.includes('main:habits'));
check('schemes segment', trayState.includes('"schemes"') && trayState.includes('assemble_schemes'));
check('on_runtime_event patches schemes on scheme switch', trayState.includes('kind::SCHEME_SWITCHED') && trayState.includes('"schemes"'));
check('tray_user_label unit tests', trayState.includes('tray_user_label_prefers_preset_app_display_name'));
check('foreground_os_debug debug-only', trayState.includes('#[cfg(debug_assertions)]') && trayState.includes('foreground_os_debug'));
check('user_label from preset not foreground', trayState.includes('tray_user_label') && trayState.includes('preset_app_display_name'));
check('tray_today_counts dual layer', trayState.includes('fn tray_today_counts'));
check('assemble_deep_links no diagnose footer', trayState.includes('assemble_deep_links_has_habits_entry') || (trayState.includes('fn assemble_deep_links') && !/assemble_deep_links[\s\S]*main:diagnose/.test(trayState)));

const config = read('src-tauri/src/config.rs');
check('peek_next_scheme_same_trigger', config.includes('peek_next_scheme_same_trigger'));

const trayRs = read('src-tauri/src/tray.rs');
check('silence_until action', trayRs.includes('"silence_until"'));
check('preload_tray_menu_window', trayRs.includes('preload_tray_menu_window'));
check('refresh_menu_data', trayRs.includes('refresh_menu_data'));
check('refresh_menu delegates to segment patch', /pub fn refresh_menu\([\s\S]*?refresh_menu_data\(app\)/.test(trayRs));
check('deep link href with query', trayRs.includes('strip_prefix("main:")'));

const listen = read('src-tauri/src/ipc/listen.rs');
check('silence_listen_for', listen.includes('silence_listen_for'));
check('pause uses refresh_menu_data', listen.includes('refresh_menu_data'));

const trayHtml = read('src/tray-menu.html');
check('tray habit row + cycle preview', trayHtml.includes('tray-habit-row') && trayHtml.includes('nextHabitLabel'));
check('tray dual stats', trayHtml.includes('todayTotalCount') && trayHtml.includes('todayHabitCount'));
check('tray perf log', trayHtml.includes('tray_menu_ready_ms='));
check('tray schemes segment subscribe', trayHtml.includes("'schemes'"));
check('tray quick actions wizard', trayHtml.includes('main:habits?wizard=1'));
check('tray hero three-state ctx', trayHtml.includes('未配置习惯') && trayHtml.includes('hasActiveHabit'));
check('habit preview arrow only when next', trayHtml.includes('nextHabitLabel') && trayHtml.includes("canCycle=!!g.nextHabitLabel"));
check('event card diagnose deep link', trayHtml.includes("main:diagnose"));
check('footer habits settings home', trayHtml.includes('我的习惯') && trayHtml.includes('main:habits') && trayHtml.includes('main:settings'));
check('perf mark perfT0 to paint', trayHtml.includes('perfT0') && trayHtml.includes('requestAnimationFrame'));
check('global patch re-renders quick-actions', trayHtml.includes("if(seg==='global')document.querySelector('tray-quick-actions').render()"));

const trayUi = read('src/js/features/agent/soft-pad-tray-ui.js');
check('handleTrayDeepLink habits', trayUi.includes("path === 'habits'") && trayUi.includes('habitWizard'));
check('preview sync userLabel/stats/trend', trayUi.includes('todayTotalCount') && trayUi.includes('weekTrend'));
check('preview hasActiveHabit three-state', trayUi.includes('function hasActiveHabit'));
check('preview live segment subscribe', trayUi.includes('subscribeTrayLive') && trayUi.includes('tray://patch'));
check('silenced hero label', trayUi.includes("mode === 'silenced'"));

const drawer = read('src/js/features/settings/settings-drawer.js');
check('settings-drawer tray-deep-link fallback', drawer.includes('__otTrayDeepLinkDrawerBound') && drawer.includes("panel:'habits'"));
check('settings-drawer wizard=1 query', drawer.includes("wizard=1"));

const habitHub = read('src/js/features/mapping/habit-hub.js');
check('habit hub value card', habitHub.includes('syncHabitValueCardFromTray') && habitHub.includes('habitHubValueCard'));

const i18n = read('src/js/core/i18n.js');
check('i18n tray hero keys', i18n.includes('trayHeroNoHabit') && i18n.includes('trayTodayTotal'));

const indexHtml = read('src/index.html');
check('preview hero ctx/stats/trend elements', indexHtml.includes('softPadTrayHeroCtx') && indexHtml.includes('habitHubValueCard'));
check('left nav tray entry', indexHtml.includes('data-wb-nav="tray"') && indexHtml.includes('id="settingsPanelTray"'));
check('soft pad flow has no tray node', !indexHtml.includes('data-soft-pad-node="tray"'));

const shellIa = read('src/js/shared/shell-ia-convergence.js');
check('shell-ia tray panel', shellIa.includes("tray: { panel: 'tray'"));

check('settings-drawer tray PANEL_IDS', drawer.includes("tray:'settingsPanelTray'"));
check('tray deep link opens tray panel', trayUi.includes("openSettings({ panel: 'tray' })") && !trayUi.includes("setSoftPadFace('tray')"));
check('tray panel lifecycle', drawer.includes("panel==='tray'") && drawer.includes('onPanelEnter') && drawer.includes('trayEditorFocus'));
check('tray-ui onPanelEnter export', trayUi.includes('onPanelEnter: onPanelEnter'));

const hubUi = read('src/js/features/agent/soft-pad-hub-ui.js');
check('hub openSubpage tray redirect', hubUi.includes("view === 'tray'") && hubUi.includes("panel: 'tray'"));
check('hub no tray face', !hubUi.includes("tray: 1") && !hubUi.includes("face === 'tray'"));

const tcc = read('src/js/features/settings/tray-channel-controls.js');
check('tray-channel-controls exports renderInspectorCard', tcc.includes('renderInspectorCard'));
check('tray-channel-controls exports renderOsTrayBlock', tcc.includes('renderOsTrayBlock'));
check('voice L1 voiceAssistEnabled', tcc.includes("stateKey: 'config.voiceAssistEnabled'"));
check('softPad L1 codexMicroPad.enabled', tcc.includes("stateKey: 'mappings[].codexMicroPad.enabled'"));
check('five channels in CHANNEL_ORDER', tcc.includes("CHANNEL_ORDER = ['voice', 'keys', 'softPad', 'camera', 'habits']"));

const compact = read('src/js/features/settings/channel-config-compact.js');
check('compact delegates to shared module', compact.includes('OneToneTrayChannelControls') && compact.includes('renderCompactGroup'));
check('compact no wireMiniToggle', !compact.includes('wireMiniToggle') && !compact.includes('makeToggleRow'));

check('tray-menu ch-block accordion', trayHtml.includes('ch-block') && trayHtml.includes('ch-l2'));
check('tray-menu loads tray-layout-v2', trayHtml.includes('tray-layout-v2.js'));
check('tray-menu applyLayout v2 blocks', trayHtml.includes('resolveLayoutV2') && trayHtml.includes('blockVisible'));
check('tray-channel-controls getTrayLayoutV2', tcc.includes('getTrayLayoutV2'));
check('tray-menu tray-channel-block', trayHtml.includes('tray-channel-block'));

check('index no legacy inspector control hosts', !indexHtml.includes('softPadTrayControlsVoice') && !indexHtml.includes('softPadTraySwVoiceEnd'));
check('index no habits subtab panel', !indexHtml.includes('data-ch-tab="habits"'));
check('index loads tray-channel-controls', indexHtml.includes('tray-channel-controls.js'));

check('tray-ui mounts layout editor', trayUi.includes('OneToneTrayLayoutEditor') && trayUi.includes('trayEditorFocus'));
check('tray-ui syncBlockVisibility', trayUi.includes('syncBlockVisibility') && trayUi.includes('data-block-id'));
check('tray-ui no wireMiniToggle', !trayUi.includes('wireMiniToggle'));

check('i18n trayChVoiceMaster + trayChGoSettings', i18n.includes('trayChVoiceMaster') && i18n.includes('trayChGoSettings'));
check('i18n channelConfigTrayShow', i18n.includes('channelConfigTrayShow'));
check('i18n trayEditorTitle + trayEditorMinBlocks', i18n.includes('trayEditorTitle') && i18n.includes('trayEditorMinBlocks'));
check('i18n trayLayoutHabit + trayShowOpenEditor', i18n.includes('trayLayoutHabit') && i18n.includes('trayShowOpenEditor'));

check('tray-channel-controls exports renderInspectorPreview', tcc.includes('renderInspectorPreview'));
check('tray-channel-controls formatTrayEventText filters vosk', tcc.includes('formatTrayEventText') && tcc.includes('vosk'));
check('getChannelControls surface compact no L1', tcc.includes("getChannelControls(channel, 'compact')") || tcc.includes('surface === \'compact\''));
check('getChannelControls surface os no trayShow', tcc.includes("surface === 'os'") && tcc.includes("c.id !== 'trayShow'"));
check('renderOsTrayBlock ch-l2 collapsed default', tcc.includes('is-collapsed') && tcc.includes('ch-title-row'));
check('renderTrayLayoutToggles exported', tcc.includes('renderTrayLayoutToggles'));
check('inspector mount uses renderInspectorPreview', tcc.includes('renderInspectorPreview(host, channel'));
check('inspector preview no tray-ctrl-toggle in mount', !/mountInspectorControls[\s\S]*?makeToggleRow/.test(tcc));

check('tray-ui no stats override HID', !trayUi.includes('buildKeysStatsOverride') && !trayUi.includes('buildPadStatsOverride'));
check('tray-ui formatEventText', trayUi.includes('formatEventText'));
check('index tray editor shell', indexHtml.includes('softPadTrayEditorBlocks') && indexHtml.includes('softPadTrayEditorSave'));
check('index loads tray-layout-v2', indexHtml.includes('tray-layout-v2.js') && indexHtml.includes('tray-layout-editor.js'));
check('index preview data-block-id', indexHtml.includes('data-block-id="block:hero"'));
check('tray-ui no inspector mic toggle', !indexHtml.includes('softPadTrayInsMicToggle'));

check('tray-menu loads tray-i18n-lite', trayHtml.includes('tray-i18n-lite.js'));
check('tray-menu qa-more collapse', trayHtml.includes('qa-more') && trayHtml.includes('qa-collapsed'));
check('tray-menu formatEventText', trayHtml.includes('formatEventText'));
check('tray-menu menu-shell max-height scroll', trayHtml.includes('max-height') && trayHtml.includes('overflow-y:auto'));

check('compact getChannelControls uses surface', compact.includes("getChannelControls(channel, 'compact')") || tcc.includes("getChannelControls(channel, 'compact')"));

const stateShape = read('scripts/channel-config-state-shape.mjs');
check('state shape voiceAssistEnabled', stateShape.includes('config.voiceAssistEnabled'));
check('state shape voiceEnd.enabled', stateShape.includes('config.voiceEnd.enabled'));

console.log(`[tray-p0] ${pass} passed / ${fail} failed`);
if (fail > 0) process.exit(1);
