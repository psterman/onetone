/**
 * Tray scene preset — allOn / mute / custom + snapshot restore.
 */
(function (global) {
  'use strict';

  var TCC = function () { return global.OneToneTrayChannelControls; };
  var invoke = function (c, a) {
    var ipc = global.OneToneIpc;
    return ipc && ipc.invoke ? ipc.invoke(c, a) : Promise.resolve();
  };

  var SCENE_PRESETS = [
    { id: 'allOn', icon: '🔊', label: '正常使用', hint: '按你的设置开' },
    { id: 'mute', icon: '🌙', label: '勿扰', hint: '全部 off' }
  ];

  var SWITCH_IDS = [
    'voiceMaster', 'voiceEnd', 'keysEnabled', 'keysCancel', 'keysAutoSend',
    'padEnabled', 'padOverlay', 'padRequireFg',
    'camPresence', 'camTriggerAway', 'camAutoMute', 'camNoFaceMute'
  ];

  var runtime = { trayScenePreset: 'allOn', customSwitchSnapshot: {}, manualChangeLog: [], _fromPresetTweak: false };

  function t(key, fb) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fb || key;
  }

  function readSnapshot() {
    var snap = {};
    var T = TCC();
    if (!T) return snap;
    SWITCH_IDS.forEach(function (id) {
      var ctrl = T.findControlById(id);
      if (!ctrl) return;
      var ch = ctrl.stateKey.indexOf('camera') >= 0 ? 'camera' : (ctrl.stateKey.indexOf('codexMicroPad') >= 0 ? 'softPad' : (ctrl.stateKey.indexOf('mappings') >= 0 ? 'keys' : 'voice'));
      snap[id] = !!T.readControlValue(ctrl, { channel: ch });
    });
    return snap;
  }

  function sceneMatches(id, snap) {
    if (id === 'allOn') return SWITCH_IDS.every(function (sid) { return !!snap[sid]; });
    if (id === 'mute') return SWITCH_IDS.every(function (sid) { return !snap[sid]; });
    return false;
  }

  function activeSceneQuick(savedMode) {
    var snap = readSnapshot();
    if (savedMode === 'allOn' || savedMode === 'mute') {
      return sceneMatches(savedMode, snap) ? savedMode : 'custom';
    }
    if (sceneMatches('allOn', snap)) return 'allOn';
    if (sceneMatches('mute', snap)) return 'mute';
    return savedMode || 'custom';
  }

  function allOnSnapshot() {
    var s = readSnapshot();
    SWITCH_IDS.forEach(function (id) { s[id] = true; });
    return s;
  }

  function muteSnapshot() {
    var s = {};
    SWITCH_IDS.forEach(function (id) { s[id] = false; });
    return s;
  }

  function loadRuntime() {
    return invoke('cmd_tray_runtime_get').then(function (rt) {
      if (!rt) return runtime;
      runtime.trayScenePreset = rt.trayScenePreset === 'allOn' || rt.trayScenePreset === 'AllOn' ? 'allOn'
        : (rt.trayScenePreset === 'mute' || rt.trayScenePreset === 'Mute' ? 'mute' : 'custom');
      runtime.customSwitchSnapshot = rt.customSwitchSnapshot || {};
      return runtime;
    }).catch(function () { return runtime; });
  }

  function saveRuntime() {
    return invoke('cmd_tray_runtime_save', {
      trayScenePreset: runtime.trayScenePreset,
      customSwitchSnapshot: runtime.customSwitchSnapshot,
      personaPreset: runtime.personaPreset || 'compact'
    }).catch(function () {});
  }

  function applySnapshot(snap) {
    var T = TCC();
    if (!T) return Promise.resolve();
    var chain = Promise.resolve();
    SWITCH_IDS.forEach(function (id) {
      if (snap[id] === undefined) return;
      var ctrl = T.findControlById(id);
      if (!ctrl) return;
      var ch = ctrl.stateKey.indexOf('camera') >= 0 ? 'camera' : (ctrl.stateKey.indexOf('codexMicroPad') >= 0 ? 'softPad' : (ctrl.stateKey.indexOf('mappings') >= 0 ? 'keys' : 'voice'));
      chain = chain.then(function () {
        return T.writeControlValue(ctrl, !!snap[id], { channel: ch, surface: 'os' });
      });
    });
    return chain;
  }

  function setScenePreset(next, opts) {
    opts = opts || {};
    var prev = runtime.trayScenePreset;
    if (prev === 'custom' && next !== 'custom' && !runtime._fromPresetTweak) {
      runtime.customSwitchSnapshot = readSnapshot();
    }
    var snap = null;
    if (next === 'allOn') snap = allOnSnapshot();
    else if (next === 'mute') snap = muteSnapshot();
    else if (next === 'custom' && runtime.customSwitchSnapshot && Object.keys(runtime.customSwitchSnapshot).length) {
      snap = runtime.customSwitchSnapshot;
      runtime.manualChangeLog = [];
      runtime._fromPresetTweak = false;
    }
    if (next === 'allOn' || next === 'mute') runtime._fromPresetTweak = false;
    runtime.trayScenePreset = next;
    return saveRuntime().then(function () {
      if (!snap) return;
      return applySnapshot(snap).then(function () {
        if (opts.onApplied) opts.onApplied(next);
        if (next === 'mute') {
          return invoke('cmd_tray_action', { action: 'mic_toggle', payload: { muted: true } }).catch(function () {});
        }
        if (next === 'allOn') {
          return invoke('cmd_tray_action', { action: 'mic_toggle', payload: { muted: false } }).catch(function () {});
        }
      });
    });
  }

  function onManualSwitchChange(swId) {
    if (runtime.trayScenePreset === 'allOn' || runtime.trayScenePreset === 'mute') {
      runtime._fromPresetTweak = true;
    }
    if (runtime.trayScenePreset !== 'custom') {
      runtime.trayScenePreset = 'custom';
      saveRuntime();
    }
  }

  function restoreCustom() {
    return setScenePreset('custom');
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function renderSceneBlock(host, opts) {
    opts = opts || {};
    if (!host) return;
    var mode = activeSceneQuick(runtime.trayScenePreset || 'allOn');
    var blockCls = 'tray-scene-block';
    if (mode === 'custom') blockCls += ' tray-scene-block--custom';
    if (mode === 'mute') blockCls += ' tray-scene-block--mute';
    var presetsHtml = SCENE_PRESETS.map(function (p) {
      return '<button type="button" class="tray-scene-preset' + (mode === p.id ? ' is-on' : '') + '" data-scene-preset="' + p.id + '">' +
        '<span class="tray-scene-preset__ic">' + p.icon + '</span>' +
        '<span class="tray-scene-preset__lbl">' + esc(p.label) + '</span>' +
        '<span class="tray-scene-preset__hint">' + esc(p.hint) + '</span></button>';
    }).join('');
    host.innerHTML = '<div class="' + blockCls + '">' +
      '<div class="tray-scene-block__label">场景 <span class="tip">点预设批量改开关</span></div>' +
      '<div class="tray-scene-presets">' + presetsHtml + '</div>' +
      '</div>';
    host.querySelectorAll('[data-scene-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setScenePreset(btn.getAttribute('data-scene-preset'), { onApplied: opts.onRefresh });
      });
    });
  }

  function getScenePreset() {
    return runtime.trayScenePreset;
  }

  global.OneToneTrayScenePreset = {
    loadRuntime: loadRuntime,
    saveRuntime: saveRuntime,
    setScenePreset: setScenePreset,
    onManualSwitchChange: onManualSwitchChange,
    restoreCustom: restoreCustom,
    renderSceneBlock: renderSceneBlock,
    getScenePreset: getScenePreset,
    readSnapshot: readSnapshot,
    activeSceneQuick: activeSceneQuick
  };
})(typeof window !== 'undefined' ? window : globalThis);
