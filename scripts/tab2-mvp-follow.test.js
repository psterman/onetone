'use strict';

/**
 * Tab2 MVP follow line + failure hints + dual CTA / agent workflow.
 * Run: node scripts/tab2-mvp-follow.test.js
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var root = path.join(__dirname, '..');

var tMap = {
  voiceTab2SlotDictation: '系统听写',
  voiceTab2UnknownApp: '当前窗口',
  voiceTab2SideKeyFallback: '侧键',
  voiceTab2FailNoRelease: '未检测到按键释放，请重新按住',
  voiceTab2FailNoFocus: '字未进 {app}，请先点一下输入框再按住',
  voiceTab2FailBadHoldKey: '{trigger} 不适合作为按住键，请换一个普通键',
  voiceTab2FailClipboard: '已记录到剪贴板，可手动粘贴',
  voiceTab2TryCtaTap: '用 {trigger} 试说',
  voiceTab2TryLocalTap: '用 {trigger} 本地试说',
  voiceTab2TryAgent: '在 {route} 试说',
  voiceTab2HoldUnsupported: '此键不支持按住说话，请换鼠标侧键或在按键页改触发键',
  voiceTab2VoiceGate: '请先点底部「启用」，再试 Agent 听写',
  voiceTab2FollowTrigger: '触发：{trigger}',
  voiceTab2FollowTarget: '目标：{route} · {landing}',
  voiceTab2AgentNeedsTrigger: '请先在高级配置 Agent 场景（如 Cursor）'
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function loadTab2(extra) {
  extra = extra || {};
  var baseline = extra.baseline || { id: 'm1', triggerKey: 'XButton1', triggerMode: 'hold', enabled: true };
  var sandbox = {
    console: console,
    OneToneDom: { $: function () { return null; } },
    OneToneI18n: {
      t: function (key) { return tMap[key] || key; },
      lang: function () { return 'zh'; }
    },
    OneToneState: {
      state: {
        config: {
          mappings: extra.mappings || [baseline],
          activeSceneId: ''
        }
      }
    },
    OneToneHabitOverrideDiff: {
      findGlobalBaselineMapping: function () { return baseline; }
    },
    OneToneMappingCore: { byId: function () { return null; } },
    OneToneHabitLayerNav: { getForegroundIdentity: function () { return null; } },
    OneToneKeyLabels: {
      triggerDisplayLabel: function (m) {
        if (m && m.triggerKey === 'Volume_Down') return '音量减';
        if (m && m.triggerKey === 'RAlt') return '右 Alt';
        return '侧键';
      },
      autoTriggerDisplay: function () { return '音量减'; }
    },
    OneToneAppBehaviorRules: null,
    OneToneAppTargetPresets: null,
    OneToneHabitTriggerSetup: null,
    OneToneHabitHub: extra.habitHub || {
      isAppScenario: function () { return false; },
      isSelfForegroundIdentity: function () { return true; },
      findAppScenarioByAppId: function () { return null; },
      findAppScenarioForIdentity: function () { return null; }
    },
    OneToneHomeWorkbenchCompat: extra.compat || null,
    OneToneVoiceSettingsViewModel: extra.viewModel || { build: function () { return { voiceOn: true }; } },
    OneToneMappingTestSend: null,
    OneToneIpc: null,
    sessionStorage: { _d: {}, getItem: function (k) { return this._d[k] || null; }, setItem: function (k, v) { this._d[k] = v; } }
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(read('src/js/features/voice/voice-tab2-mvp.js'), sandbox, {
    filename: 'voice-tab2-mvp.js'
  });
  return sandbox.OneToneVoiceTab2Mvp;
}

var tab2 = loadTab2();
assert.ok(tab2, 'OneToneVoiceTab2Mvp exported');

assert.strictEqual(
  tab2.formatHonestFollowLine('侧键', { preset: 'cursor-chat' }),
  '触发：侧键 · 目标：Cursor · Composer',
  'honest follow line'
);

var raltTab2 = loadTab2({
  baseline: { id: 'm1', triggerKey: 'RAlt', triggerMode: 'hold', enabled: true }
});
assert.strictEqual(raltTab2.triggerLabel(), '右 Alt', 'baseline RAlt label');

var pulseTab2 = loadTab2({
  baseline: { id: 'm-vol', triggerKey: 'Volume_Down', triggerMode: 'hold', enabled: true }
});
assert.strictEqual(pulseTab2.resolveTriggerHoldProfile().pulseOnly, true);
assert.ok(!pulseTab2.canAgentTry(), 'volume without Cursor scenario cannot agent-try');

var pulseAgentTab2 = loadTab2({
  baseline: { id: 'm-vol', triggerKey: 'Volume_Down', triggerMode: 'hold', enabled: true },
  habitHub: {
    isAppScenario: function (m) { return m && m.id === 'cursor-scene'; },
    isSelfForegroundIdentity: function () { return true; },
    findAppScenarioForIdentity: function () { return null; },
    findAppScenarioByAppId: function (appId) {
      if (appId === 'cursor-chat') return { id: 'cursor-scene', appTargetId: 'cursor-chat' };
      return null;
    }
  }
});
assert.ok(pulseAgentTab2.canAgentTry(), 'volume + Cursor scenario enables agent try');

var agentTab2 = loadTab2({
  baseline: { id: 'm1', triggerKey: 'RAlt', triggerMode: 'hold', enabled: true },
  habitHub: {
    isAppScenario: function (m) { return m && m.id === 'cursor-scene'; },
    isSelfForegroundIdentity: function () { return true; },
    findAppScenarioForIdentity: function () { return null; },
    findAppScenarioByAppId: function (appId) {
      if (appId === 'cursor-chat') return { id: 'cursor-scene', appTargetId: 'cursor-chat' };
      return null;
    }
  }
});
assert.ok(agentTab2.canAgentTry(), 'RAlt + cursor scenario enables agent try');

var tab2Src = read('src/js/features/voice/voice-tab2-mvp.js');
assert.ok(/habit-agent-workflow-test/.test(tab2Src), 'agent CTA uses workflow context');
assert.ok(/onTryLocalClick/.test(tab2Src), 'local CTA handler');
assert.ok(/voiceTab2TryLocal/.test(tab2Src), 'local button id');

assert.ok(/voiceTab2TryAgent/.test(tab2Src), 'agent button uses route template');
assert.ok(/replace\('\{route\}'/.test(tab2Src), 'agent CTA substitutes route name');

var sendSrc = read('src/js/features/mapping/mapping-test-send.js');
assert.ok(/agent_workflow/.test(sendSrc), 'mapping test send passes agent_workflow');

var sendRs = read('src-tauri/src/ipc/trigger_dispatch/send_key.rs');
assert.ok(/find_preferred_workflow_scenario_for_dispatch/.test(sendRs), 'global trigger fallback workflow');
assert.ok(/push_soft_pad_success/.test(sendRs), 'soft pad on workflow success');

var configRs = read('src-tauri/src/config.rs');
assert.ok(/find_preferred_workflow_scenario_for_dispatch/.test(configRs), 'preferred workflow scenario helper');
assert.ok(/find_app_scenario_for_dispatch/.test(configRs), 'dispatch ignores follow_foreground flag');
assert.ok(/volume_capture_overwrites_source_key_direction/.test(configRs), 'volume sourceKey keeps Up or Down');

var testSendRs = read('src-tauri/src/ipc/commands/runtime/test_send.rs');
assert.ok(/note_soft_pad_surface_for_mapping/.test(testSendRs), 'agent test send pushes soft pad');

var mouseRs = read('src-tauri/src/hotkey_win.rs');
assert.ok(/Side buttons are pulse-only/.test(mouseRs), 'side button keyup no double dispatch');
assert.ok(/WM_XBUTTONUP/.test(mouseRs), 'swallow XButton up during record');
assert.ok(/WebView2 does not treat them as Back\/Forward/.test(mouseRs), 'side button swallow while recording');

var recJs = read('src/js/features/mapping/mapping-recording.js');
assert.ok(/k==='XButton1' \|\| k==='XButton2'/.test(recJs), 'side buttons in hardware capture token');

var applyRs = read('src-tauri/src/ipc/recording/apply.rs');
assert.ok(/if is_volume_hotkey\(raw\)/.test(applyRs), 'volume still AutoTrigger');
assert.ok(/else if is_peripheral_trigger_key\(raw\)/.test(applyRs), 'peripherals keep physical name');
assert.ok(/AutoTrigger is volume-only/.test(applyRs), 'XButton not folded to AutoTrigger');

var kbJs = read('src/js/core/app-keyboard.js');
assert.ok(/auxclick/.test(kbJs), 'auxclick fallback for side buttons');
assert.ok(/pointerdown/.test(kbJs), 'pointerdown fallback for side buttons');
assert.ok(/mouseup/.test(kbJs), 'mouseup fallback for side buttons');

var handlerRs = read('src-tauri/src/ipc/recording/hardware/handler.rs');
assert.ok(/is_record_start_suppressed_mouse/.test(handlerRs), 'side buttons skip 900ms suppress');
assert.ok(/Pulse peripherals/.test(handlerRs), 'peripheral immediate keydown finish');
assert.ok(/is_ghost_media_keyboard_combo/.test(handlerRs), 'ghost media combo blocked');
assert.ok(/Dongle ghost Ctrl\+Shift\+Space/.test(handlerRs), 'ghost combo skipped before keyboard TAP');

assert.ok(/agent_workflow/.test(testSendRs), 'rust test_send agent_workflow branch');
assert.ok(/run_for_target_id/.test(testSendRs), 'rust uses app chat workflow');

var pressGestureRs = read('src-tauri/src/press_gesture.rs');
assert.ok(/XButton1.*XButton2/.test(pressGestureRs), 'longpress side buttons fire on keydown');

var gestureRs = read('src-tauri/src/ipc/recording/gesture.rs');
var recInput = read('src/js/features/mapping/mapping-recording-input.js');

assert.ok(/duplicate_ctrl_aliases_are_spurious_trigger/.test(gestureRs), 'duplicate ctrl combo blocked');

var appKeyUtils = read('src/js/core/app-key-utils.js');
assert.ok(/collapseTriggerAlias/.test(appKeyUtils), 'trigger alias collapse');
assert.ok(/collapseModifierAlias/.test(recInput), 'ctrl+control dedupe');
assert.ok(/isSpuriousGhostCombo/.test(recInput), 'frontend ghost combo filter');
assert.ok(/isModifierEvent/.test(recInput), 'control without ControlLeft is still a modifier');
assert.ok(/mods\.ctrl&&mods\.shift/.test(recInput), 'frontend skips ctrl+shift+space ghost');
assert.ok(/noteHardwarePressAwaitingAck/.test(recInput), 'watchdog arms on hardware press only');
assert.ok(/mvp_record_echo/.test(recInput), 'frontend handles recognition echo');
assert.ok(!/armReconcileWatchdog\(\)/.test(read('src/js/features/mapping/mapping-recording.js')), 'watchdog not armed on record start');
assert.ok(/mvp_record_echo/.test(read('src-tauri/src/ipc/recording/hardware/finish.rs')), 'backend emits echo without saving');

var keyUtilsCtx = { globalThis: null };
keyUtilsCtx.globalThis = keyUtilsCtx;
vm.createContext(keyUtilsCtx);
vm.runInContext(read('src/js/core/app-key-utils.js'), keyUtilsCtx);
var ntk = keyUtilsCtx.OneToneAppKeyUtils.normalizeTriggerKey;
assert.strictEqual(ntk('Ctrl+LCtrl'), 'LCtrl');
assert.strictEqual(ntk('Ctrl+Control'), 'LCtrl');
assert.strictEqual(ntk('Volume_Up'), 'AutoTrigger');
assert.strictEqual(ntk('Volume_Down'), 'AutoTrigger');

assert.ok(/recognition_key_echo/.test(gestureRs), 'recognition key echo guard');
assert.ok(/clear_record_guard/.test(read('src-tauri/src/ipc/commands/recording/session.rs')), 'clear guard on record start');

assert.ok(/peripheralFinishing/.test(recJs), 'peripheral finish guard');
assert.ok(/backendCommitted/.test(recJs), 'skip duplicate save when backend finished');
assert.ok(/finishDetectedHardwareTrigger\(hw/.test(recInput), 'mvp_record_seen frontend-finishs peripherals');
assert.ok(/retryPeripheralCaptureFromWatchdog/.test(recInput), 'watchdog retries frontend finish');
assert.ok(/cmd_frontend_keydown/.test(recInput), 'watchdog invoke backup for peripherals');
assert.ok(!/if\(isBackendOwnedHardwareTrigger\(physical\)\) return/.test(recJs), 'frontend finish not blocked for peripherals');

var finishRs = read('src-tauri/src/ipc/recording/hardware/finish.rs');
assert.ok(/if !\*state\.recording\.lock\(\)/.test(finishRs), 'backend atomic recording take');
assert.ok(/spurious_trigger_capture/.test(finishRs), 'spurious capture emits reject ack');

var triggerRs = read('src-tauri/src/ipc/commands/runtime/trigger.rs');
assert.ok(/state\.recording\.lock\(\)/.test(triggerRs), 'physical trigger checks recording');
assert.ok(/handle_hardware_record_key/.test(triggerRs), 'recording routes physical trigger to hardware capture');

var stepNav = read('src/js/features/mapping/keys-step-nav.js');
assert.ok(/keysHeroModeIme/.test(stepNav), 'step 02 labels IME key while recording trigger');

var libRs = read('src-tauri/src/lib.rs');
assert.ok(/drop trailing RAlt after peripheral/.test(libRs), 'RAlt dedup after side button');
assert.ok(/"XButton1"/.test(libRs), 'XButton1 in RAlt dedup list');

assert.ok(/finishDetectedHardwareTrigger\('Volume_Up'\)/.test(recInput), 'RAlt keyup records as volume during trigger');
assert.ok(/tryCommitPeripheralFromEvent/.test(recInput), 'volume commits on keydown and keyup');
assert.ok(/isRecordUiLeakKey/.test(recInput), 'Enter/Tab ignored during trigger record');
assert.ok(/sawVolumeToken\|\|isRecognitionKeyEcho/.test(recInput), 'RAlt does not overwrite real volume');
assert.ok(/blob\.indexOf\('browser'\)/.test(recJs), 'BrowserForward without underscore is delegated');
assert.ok(/k==='RAlt'/.test(recJs), 'RAlt trigger folds to AutoTrigger');

var probeJs = read('src/js/features/mapping/mapping-record-probe.js');
assert.ok(/mvp_record_probe/.test(read('src-tauri/src/ipc/recording/hardware/guard.rs')), 'rust emits record probe');
assert.ok(/type==='mvp_record_probe'/.test(recInput), 'frontend handles record probe');
assert.ok(/OneToneRecordProbe/.test(probeJs), 'record probe panel module');

var hotkeyRs = read('src-tauri/src/hotkey_win.rs');
assert.ok(/xbutton_name_from_mouse_data/.test(hotkeyRs), 'side button mouseData hi/lo word');
assert.ok(/raw_mouse_xbutton/.test(hotkeyRs), 'raw input mouse XButton2');
assert.ok(/RI_MOUSE_BUTTON_5_DOWN/.test(hotkeyRs), 'raw XButton2 down flag');
assert.ok(/scan_bitmap\(payload, 0x00E9\)/.test(hotkeyRs), 'BLE volume bitfield after report id');
assert.ok(!/"RAlt"/.test(hotkeyRs.split('const RECORD_KEYS')[1].split('];')[0]), 'RAlt not in RECORD_KEYS');
assert.ok(/send_guard::is_active\(\) && !session_active/.test(hotkeyRs), 'mouse hook records during send_guard');
assert.ok(/RECORDING_SESSION/.test(hotkeyRs), 'recording session flag for pending side-button buffer');
assert.ok(/mouseData was empty\/unrecognized/.test(hotkeyRs), 'swallow unnamed XButton so WebView cannot go Forward');

var html = read('src/index.html');
assert.ok(html.includes('id="voiceTab2TryLocal"'), 'local try button');
assert.ok(html.includes('id="voiceTab2TryAgent"'), 'agent try button');
assert.ok(!html.includes('id="voiceTab2TryCta"'), 'old single CTA removed');
assert.ok(html.includes('id="recordProbePanel"'), 'record probe panel in keys UI');
assert.ok(/mapping-record-probe\.js/.test(html), 'record probe script loaded');

var keyLabelsSrc = read('src/js/key-labels.js');
assert.ok(/pointing_button5/.test(keyLabelsSrc), 'XButton2 Karabiner alias');
assert.ok(/volume_decrement/.test(keyLabelsSrc), 'Volume_Down Karabiner alias');
assert.ok(/consumer_key_code\.back/.test(keyLabelsSrc), 'Browser_Back Karabiner alias');

var keyLabelsCtx = { globalThis: null };
keyLabelsCtx.globalThis = keyLabelsCtx;
vm.createContext(keyLabelsCtx);
vm.runInContext(keyLabelsSrc, keyLabelsCtx);
var KL = keyLabelsCtx.OneToneKeyLabels;
assert.strictEqual(KL.karabinerAlias('XButton2'), 'pointing_button5');
assert.strictEqual(KL.karabinerAlias('Volume_Down'), 'volume_decrement');
assert.ok(KL.triggerDisplayLabel({ triggerKey: 'AutoTrigger', sourceKey: 'Volume_Down' }, 'zh').indexOf('音量减') >= 0, 'AutoTrigger shows volume direction');
assert.ok(KL.triggerDisplayLabel({ triggerKey: 'AutoTrigger', sourceKey: 'Volume_Up' }, 'zh').indexOf('外设触发键') < 0, 'trigger chip has no 外设 prefix');
assert.ok(KL.friendlyKeyName('Volume_Up', 'zh').indexOf('volume_increment') < 0, 'friendly name has no Karabiner suffix');
assert.strictEqual(KL.friendlyKeyName('XButton2', 'zh'), '鼠标侧键 2');

var normalizeRs = read('src-tauri/src/ipc/recording/hardware/normalize.rs');
assert.ok(!/"Browser_Back" => "XButton1"/.test(normalizeRs), 'Browser_Back not folded to XButton1');
assert.ok(!/"Browser_Forward" => "XButton2"/.test(normalizeRs), 'Browser_Forward not folded to XButton2');
assert.ok(/browser_keys_are_not_folded_to_xbutton/.test(normalizeRs), 'normalize keeps Browser vs XButton');

assert.ok(/starts_with\("HID_"\)/.test(handlerRs), 'unknown HID skipped in record handler');
assert.ok(handlerRs.indexOf('starts_with("HID_")') < handlerRs.indexOf('Pulse peripherals'), 'HID unknown returns before pulse finish');
assert.ok(/"unknown"/.test(handlerRs), 'unknown HID probe stage');
assert.ok(/ingestUnknown/.test(recInput), 'frontend lists unknown HID instead of auto-commit');
assert.ok(/ingestUnknown/.test(probeJs), 'probe panel advanced HID picker');
assert.ok(html.includes('id="recordProbeAdvancedHid"'), 'advanced HID checkbox in keys UI');
assert.ok(/用这个/.test(probeJs), 'unknown HID requires explicit pick');
assert.ok(/if\(!advancedHid\) return/.test(probeJs), 'HID bind disabled when advanced off');

var sessionRs = read('src-tauri/src/ipc/commands/recording/session.rs');
assert.ok(/padBind/.test(sessionRs), 'rust recording mode padBind');
assert.ok(/hook_ok/.test(sessionRs), 'recording hello hook_ok');
assert.ok(/"hello"/.test(sessionRs), 'hello probe on start');

var finishRs = read('src-tauri/src/ipc/recording/hardware/finish.rs');
assert.ok(/mvp_pad_bind_captured/.test(finishRs), 'pad bind emits captured event');
assert.ok(/softpad_occupied/.test(finishRs), '01 rejects pad-occupied key');
assert.ok(/target\.mapping_id/.test(finishRs) && /physical_key_owned_by_pads/.test(finishRs), 'occupancy scoped to recording mapping');
assert.ok(/pad_unfriendly_key/.test(finishRs), 'pad bind rejects letters');
assert.ok(/trigger_occupied/.test(finishRs), 'pad bind rejects 01 trigger');

var configRs = read('src-tauri/src/config.rs');
assert.ok(/source_key/.test(configRs.split('pub struct CodexMicroPadKeyRoute')[1].split('impl Default')[0]), 'pad route named source_key');
assert.ok(/fn is_folk_pad_bind_key/.test(configRs), 'folk pad bind allow-list');
assert.ok(/fn physical_key_owned_by_pads/.test(configRs), 'pad occupancy helper');
assert.ok(/folk_pad_named_key_occupancy/.test(configRs), 'occupancy unit test');
assert.ok(/fn live_pack_mapping/.test(configRs), 'live pack resolver');
assert.ok(/fn overlay_trigger_is_live/.test(configRs), 'overlay trigger gated by FG');
assert.ok(/live_pack_overlay_does_not_steal_global_keys/.test(configRs), 'overlay isolation unit test');
assert.ok(/is_app_scenario_mapping\(entry\) \|\| is_app_scenario_mapping\(other\)/.test(configRs), 'enable skip app overlay conflicts');

var libRs = read('src-tauri/src/lib.rs');
assert.ok(/live_pack_id/.test(libRs), 'rebind when live pack changes');

var sceneRs = read('src-tauri/src/scene_config.rs');
assert.ok(/fn resolve_dispatch_effective_scene/.test(sceneRs), 'voice dispatch follows live pack');

var cameraJs = read('src/js/features/camera/camera-presence-actions.js');
assert.ok(/findAppScenarioForIdentity/.test(cameraJs), 'camera overlay follows FG identity');
assert.ok(!/activeSceneId/.test(cameraJs.split('function resolveCameraOverrideMapping')[1].split('function mergeCameraOverride')[0]), 'camera runtime merge ignores 使用中');

var numpadRs = read('src-tauri/src/codex_numpad_layer.rs');
assert.ok(/fn lookup_named_pad_route/.test(numpadRs), 'named pad runtime lookup');
assert.ok(/try_dispatch_named_pad/.test(hotkeyRs), 'hook dispatches named pad keys');
assert.ok(/source\.id\(\)/.test(hotkeyRs), 'recording sends numpad scan id');

assert.ok(/F13/.test(html), 'folk keymap hint in keys UI');
assert.ok(/重新编译并重启/.test(html) || /只刷新页面不够/.test(html), 'rebuild hint in probe copy');
assert.ok(/sawRs/.test(probeJs), 'probe tracks rust hello vs webview-only');
assert.ok(/请重新编译并重启/.test(probeJs), 'rebuild hint when only wv');

assert.ok(/invokeStart\(m && m.id, 'padBind'\)/.test(read('src/js/features/agent/codex-micro-pad-ui.js')), 'SoftPad bind uses hook recording');
assert.ok(/2\[0-4\]/.test(recJs), 'F13-F24 hardware capture token');
assert.ok(/mvp_pad_bind_captured/.test(recInput), 'frontend handles pad bind capture');
assert.ok(/mode\(\)===\'padBind\'/.test(recInput), 'webview backup during pad bind');
assert.ok(/rec\.mode==='padBind'/.test(recJs), 'cancel pad bind without restoring 01 snapshot');

var kuCtx = { globalThis: null };
kuCtx.globalThis = kuCtx;
vm.createContext(kuCtx);
vm.runInContext(read('src/js/core/app-key-utils.js'), kuCtx);
var KU = kuCtx.OneToneAppKeyUtils;
assert.ok(KU.isFolkPadBindKey('F13'));
assert.ok(KU.isFolkPadBindKey('Numpad0'));
assert.ok(!KU.isFolkPadBindKey('A'));
assert.ok(KU.triggerOccupiesPhysical({ triggerKey: 'F13', sourceKey: 'F13' }, 'F13'));
assert.ok(KU.padOccupiesPhysical({ keys: [{ enabled: true, microKeyId: 'AG00', sourceKey: 'F14' }] }, 'F14'));
assert.ok(!KU.padOccupiesPhysical({ keys: [{ enabled: true, microKeyId: 'AG00', sourceKey: 'F14' }] }, 'F13'));
var occCfg = {
  mappings: [
    { id: 'base', triggerKey: 'Volume_Down', sourceKey: 'Volume_Down' },
    { id: 'cursor', appTargetId: 'cursor-chat', triggerKey: '', sourceKey: '' }
  ]
};
assert.ok(KU.effectiveTriggerOccupiesPhysical(occCfg, occCfg.mappings[1], 'Volume_Down'), 'inherit 01 occupies pad bind');
assert.ok(!KU.effectiveTriggerOccupiesPhysical(occCfg, occCfg.mappings[1], 'F13'), 'empty overlay does not occupy F13');
assert.ok(KU.effectiveTriggerOccupiesPhysical(occCfg, { id: 'cur2', appTargetId: 'cursor-chat', triggerKey: 'F13', sourceKey: 'F13' }, 'F13'));

console.log('PASS tab2-mvp-follow');
