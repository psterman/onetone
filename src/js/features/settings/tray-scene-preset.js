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
  var applyGen = 0;
  var activeSceneSnap = null;

  function osCtx() {
    var T = TCC();
    return T && T.getOsCtx ? T.getOsCtx() : {};
  }

  function sceneLabelFromGlobal(g) {
    if (!g) return '';
    var fg = String(g.foregroundLabel || g.foregroundOsDebug || '').trim();
    if (fg && fg !== '—') return fg;
    var ul = String(g.userLabel || '').trim();
    var hl = String(g.activeHabitLabel || '').trim();
    if (ul && ul !== '—') return hl && hl !== '—' && hl !== ul ? ul + ' · ' + hl : ul;
    if (hl && hl !== '—') return hl;
    return '';
  }

  function readSnapshot() {
    var snap = {};
    var T = TCC();
    var ctx = Object.assign({ ignoreSceneOverride: true }, osCtx());
    if (!T) return snap;
    SWITCH_IDS.forEach(function (id) {
      var ctrl = T.findControlById(id);
      if (!ctrl) return;
      var ch = ctrl.stateKey.indexOf('camera') >= 0 ? 'camera' : (ctrl.stateKey.indexOf('codexMicroPad') >= 0 ? 'softPad' : (ctrl.stateKey.indexOf('mappings') >= 0 ? 'keys' : 'voice'));
      snap[id] = !!T.readControlValue(ctrl, Object.assign({ channel: ch }, ctx));
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

  function normalizeTrayScenePreset(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      if ('allOn' in raw) return 'allOn';
      if ('mute' in raw) return 'mute';
      if ('custom' in raw) return 'custom';
      raw = raw.value || raw.id || '';
    }
    var v = String(raw || '').trim();
    if (v === 'allOn' || v === 'AllOn' || v === 'all_on') return 'allOn';
    if (v === 'mute' || v === 'Mute') return 'mute';
    if (v === 'custom' || v === 'Custom') return 'custom';
    return 'allOn';
  }

  function ingestRuntime(rt) {
    if (!rt) return runtime;
    var presetRaw = rt.trayScenePreset != null ? rt.trayScenePreset : rt.tray_scene_preset;
    runtime.trayScenePreset = normalizeTrayScenePreset(presetRaw);
    runtime.customSwitchSnapshot = rt.customSwitchSnapshot || rt.custom_switch_snapshot || {};
    if (rt.personaPreset || rt.persona_preset) {
      runtime.personaPreset = rt.personaPreset || rt.persona_preset;
    }
    return runtime;
  }

  function loadRuntime(prefetched) {
    if (prefetched) return Promise.resolve(ingestRuntime(prefetched));
    return invoke('cmd_tray_runtime_get').then(function (rt) {
      return ingestRuntime(rt);
    }).catch(function () { return runtime; });
  }

  function saveRuntime() {
    return invoke('cmd_tray_runtime_save', {
      trayScenePreset: runtime.trayScenePreset,
      customSwitchSnapshot: runtime.customSwitchSnapshot,
      personaPreset: runtime.personaPreset || 'compact'
    }).catch(function () {});
  }

  function ctrlChannel(ctrl) {
    if (ctrl.stateKey.indexOf('camera') >= 0) return 'camera';
    if (ctrl.stateKey.indexOf('codexMicroPad') >= 0) return 'softPad';
    if (ctrl.stateKey.indexOf('mappings') >= 0) return 'keys';
    return 'voice';
  }

  function applySnapshot(snap) {
    var T = TCC();
    if (!T) return Promise.resolve({ wrote: 0 });
    var ctx = Object.assign({ surface: 'os', batchApply: true, ignoreSceneOverride: true }, osCtx());
    var ids = SWITCH_IDS.filter(function (id) { return snap[id] !== undefined; });
    ids.sort(function (a, b) {
      var score = function (id) {
        if (id === 'voiceMaster' || id === 'voiceEnd') return 1;
        return 0;
      };
      return score(a) - score(b);
    });
    var wrote = 0;
    var chain = Promise.resolve();
    ids.forEach(function (id) {
      var ctrl = T.findControlById(id);
      if (!ctrl) return;
      var ch = ctrlChannel(ctrl);
      var want = !!snap[id];
      chain = chain.then(function () {
        var cur = !!T.readControlValue(ctrl, Object.assign({ channel: ch }, ctx));
        if (cur === want) return;
        wrote += 1;
        return T.writeControlValue(ctrl, want, Object.assign({ channel: ch, surface: 'os', batchApply: true }, ctx));
      });
    });
    return chain.then(function () {
      if (wrote > 0 && T.finishOsBatchApply) {
        return T.finishOsBatchApply(ctx).then(function () { return { wrote: wrote }; });
      }
      return { wrote: wrote };
    });
  }

  function finishScenePresetApply(next) {
    if (next === 'mute') return invoke('cmd_mic_set_mute', { muted: true }).catch(function () {});
    if (next === 'allOn') return invoke('cmd_mic_set_mute', { muted: false }).catch(function () {});
    return Promise.resolve();
  }

  function commitSceneUi(snap) {
    var T = TCC();
    if (!snap || !T) return;
    if (T.syncOsMappingFromGlobal) T.syncOsMappingFromGlobal();
    if (T.patchOsSnapshotLocal) T.patchOsSnapshotLocal(snap);
    if (T.setSceneSnapOverride) T.setSceneSnapOverride(snap);
    if (T.syncOsTrayToggleDom) T.syncOsTrayToggleDom(snap);
  }

  function paintSceneUi(next, snap, opts) {
    opts = opts || {};
    activeSceneSnap = snap;
    commitSceneUi(snap);
    if (opts.onRefresh) opts.onRefresh({ sceneMic: next, skipChannelRender: true });
  }

  function setScenePreset(next, opts) {
    opts = opts || {};
    var gen = ++applyGen;
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
    paintSceneUi(next, snap, opts);
    saveRuntime().catch(function () {});
    if (!snap) {
      activeSceneSnap = null;
      return Promise.resolve();
    }
    applySnapshot(snap).then(function () {
      if (gen !== applyGen) return;
      return finishScenePresetApply(next);
    }).then(function (micSt) {
      if (gen !== applyGen) return;
      commitSceneUi(snap);
      if (micSt && typeof document !== 'undefined') {
        try {
          document.dispatchEvent(new CustomEvent('tray-scene-mic', { detail: micSt }));
        } catch (e) { /* ponytail: legacy */ }
      }
      if (opts.onApplied) opts.onApplied(next);
    }).catch(function () {
      if (gen !== applyGen) return;
      commitSceneUi(snap);
    }).finally(function () {
      if (gen !== applyGen) return;
      activeSceneSnap = null;
      var T = TCC();
      if (T && T.clearSceneSnapOverride) T.clearSceneSnapOverride();
    });
    return Promise.resolve();
  }

  function onManualSwitchChange() {
    if (activeSceneSnap) return;
    if (runtime.trayScenePreset === 'allOn' || runtime.trayScenePreset === 'mute') {
      runtime._fromPresetTweak = true;
    }
    if (runtime.trayScenePreset !== 'custom') {
      runtime.trayScenePreset = 'custom';
      saveRuntime();
    }
  }

  function onTrayChannelSwitchChange() {
    onManualSwitchChange();
  }

  function restoreCustom() {
    return setScenePreset('custom');
  }

  function applyPersistedSceneOnOpen(opts) {
    opts = opts || {};
    if (activeSceneSnap) return Promise.resolve();
    var mode = runtime.trayScenePreset || 'allOn';
    if (mode === 'allOn' && sceneMatches('allOn', readSnapshot())) return Promise.resolve();
    if (mode === 'mute' && sceneMatches('mute', readSnapshot())) return Promise.resolve();
    var snap = null;
    if (mode === 'allOn') snap = allOnSnapshot();
    else if (mode === 'mute') snap = muteSnapshot();
    else if (mode === 'custom' && runtime.customSwitchSnapshot && Object.keys(runtime.customSwitchSnapshot).length) {
      snap = runtime.customSwitchSnapshot;
    }
    if (!snap) return Promise.resolve();
    if (opts.skipVoice) {
      snap = Object.assign({}, snap);
      delete snap.voiceMaster;
      delete snap.voiceEnd;
    }
    activeSceneSnap = snap;
    commitSceneUi(snap);
    return applySnapshot(snap).then(function () {
      if (mode === 'mute') return invoke('cmd_mic_set_mute', { muted: true }).catch(function () {});
      if (mode === 'allOn') return invoke('cmd_mic_set_mute', { muted: false }).catch(function () {});
    }).then(function () {
      commitSceneUi(snap);
    }).finally(function () {
      activeSceneSnap = null;
      var T = TCC();
      if (T && T.clearSceneSnapOverride) T.clearSceneSnapOverride();
    });
  }

  function applyPersistedSceneDeferred(opts) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        applyPersistedSceneOnOpen(opts).then(resolve).catch(function () { resolve(); });
      }, 120);
    });
  }

  function displaySceneMode() {
    return runtime.trayScenePreset || 'allOn';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function renderSceneBlock(host, opts) {
    opts = opts || {};
    if (!host) return;
    var mode = displaySceneMode();
    var blockCls = 'tray-scene-block';
    if (mode === 'custom') blockCls += ' tray-scene-block--custom';
    if (mode === 'mute') blockCls += ' tray-scene-block--mute';
    var appLabel = sceneLabelFromGlobal(opts.global);
    var presetsHtml = SCENE_PRESETS.map(function (p) {
      return '<button type="button" class="tray-scene-preset' + (mode === p.id ? ' is-on' : '') + '" data-scene-preset="' + p.id + '">' +
        '<span class="tray-scene-preset__ic">' + p.icon + '</span>' +
        '<span class="tray-scene-preset__lbl">' + esc(p.label) + '</span>' +
        '<span class="tray-scene-preset__hint">' + esc(p.hint) + '</span></button>';
    }).join('');
    host.innerHTML = '<div class="' + blockCls + '">' +
      '<div class="tray-scene-block__label">场景' +
      (appLabel ? '<span class="tray-scene-block__app">' + esc(appLabel) + '</span>' : '') +
      '</div>' +
      '<div class="tray-scene-presets">' + presetsHtml + '</div>' +
      '</div>';
    host.querySelectorAll('[data-scene-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setScenePreset(btn.getAttribute('data-scene-preset'), {
          onRefresh: function (subOpts) {
            if (opts.onRefresh) opts.onRefresh(subOpts);
          },
          onApplied: function () {
            if (opts.onRefresh) opts.onRefresh({ sceneMic: runtime.trayScenePreset, skipChannelRender: true });
          }
        });
      });
    });
  }

  function getScenePreset() {
    return runtime.trayScenePreset;
  }

  function getActiveSceneSnap() {
    return activeSceneSnap;
  }

  function isApplying() {
    return !!activeSceneSnap;
  }

  global.OneToneTrayScenePreset = {
    loadRuntime: loadRuntime,
    ingestRuntime: ingestRuntime,
    saveRuntime: saveRuntime,
    setScenePreset: setScenePreset,
    applyPersistedSceneOnOpen: applyPersistedSceneOnOpen,
    applyPersistedSceneDeferred: applyPersistedSceneDeferred,
    onManualSwitchChange: onManualSwitchChange,
    onTrayChannelSwitchChange: onTrayChannelSwitchChange,
    restoreCustom: restoreCustom,
    renderSceneBlock: renderSceneBlock,
    getScenePreset: getScenePreset,
    getActiveSceneSnap: getActiveSceneSnap,
    displaySceneMode: displaySceneMode,
    readSnapshot: readSnapshot,
    activeSceneQuick: activeSceneQuick,
    isApplying: isApplying
  };
})(typeof window !== 'undefined' ? window : globalThis);
