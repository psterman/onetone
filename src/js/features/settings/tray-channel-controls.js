/**
 * Shared L1/L2 tray channel controls — compact, tray inspector preview, OS tray menu.
 */
(function (global) {
  'use strict';

  var CHANNEL_ORDER = ['voice', 'keys', 'softPad', 'camera', 'habits'];
  var SETTINGS_PANEL = {
    voice: 'voiceWake',
    keys: 'keys',
    softPad: 'softPad',
    camera: 'camera'
  };
  var LAYOUT_CHANNELS = ['voice', 'keys', 'softPad', 'camera'];
  var DEBUG_EVENT_PATTERNS = [/vosk\s*state:/i, /voice_bootstrap/i, /fingerprintChanged/i, /kws\s*state:/i];

  var LABEL_FB = {
    trayChVoiceMaster: '语音输入',
    trayChVoiceMasterHint: '对着麦说话，自动变文字',
    trayChVoiceEnd: '说完就停',
    trayChVoiceEndHint: '可说结束词结束输入',
    trayChKeysUseScenario: '快捷键',
    trayChKeysUseScenarioHint: '按快捷键能触发功能',
    trayChKeysCancel: '再按可取消',
    trayChKeysCancelHint: '听写中途再按一次可退出',
    trayChKeysAutoSend: '自动发送',
    trayChKeysAutoSendHint: '输完自动按回车',
    trayChPadEnabled: '启用小键盘',
    trayChPadEnabledHint: '打开后可使用屏幕小键盘',
    trayChPadShowKeyboard: '显示小键盘',
    trayChPadShowKeyboardHint: '为助手弹出控制键',
    trayChPadRequireFg: '跟着前台助手',
    trayChPadRequireFgHint: '只在当前助手软件在前台时显示',
    trayChCamPresence: '镜头动作识别',
    trayChCamPresenceHint: '离席、手势等用摄像头触发',
    trayChCamTriggerAway: '检测离席',
    trayChCamTriggerAwayHint: '人离开画面时触发',
    trayChCamAutoMute: '走远自动静音',
    trayChCamAutoMuteHint: '离开镜头自动关麦',
    trayChCamNoFaceMute: '没人也静音',
    trayChCamNoFaceMuteHint: '画面里没人时关麦',
    channelConfigBasic: '基础配置',
    channelConfigAppPrefs: '应用偏好',
    trayChGoSettings: '完整设置 ▸'
  };

  var trayLayout = {
    showEvent: true,
    showInTray: { voice: true, keys: true, softPad: true, camera: false }
  };
  var trayLayoutV2 = null;

  function layoutV2() {
    var V2 = global.OneToneTrayLayoutV2;
    if (!trayLayoutV2 && V2) trayLayoutV2 = V2.defaultLayout();
    return trayLayoutV2;
  }

  function syncLegacyFromV2() {
    var V2 = global.OneToneTrayLayoutV2;
    var lay = layoutV2();
    if (!V2 || !lay) return;
    trayLayout.showEvent = V2.blockVisible(lay, 'block:event');
    trayLayout.showInTray = V2.legacyShowInTray(lay);
  }
  var osCtx = { config: null, voiceEnd: null, global: null, mapping: null };
  var osHydratePromise = null;
  var openOsChannel = null;
  var sceneSnapOverride = null;

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    return ipc && ipc.invoke ? ipc.invoke(cmd, args) : Promise.resolve();
  }
  function t(key, fb) {
    var v = global.OneToneI18n && global.OneToneI18n.t ? global.OneToneI18n.t(key, fb) : (fb || key);
    if (!v || v === key) return LABEL_FB[key] || fb || key;
    return v;
  }
  function assertKey(key) {
    if (global.OneToneChannelConfigStateKeys && global.OneToneChannelConfigStateKeys.assertKeyAllowed) {
      global.OneToneChannelConfigStateKeys.assertKeyAllowed(key);
    }
  }
  function notifyChanged(detail) {
    try {
      global.dispatchEvent(new CustomEvent('channel-config:changed', { detail: detail || {} }));
    } catch (_) {}
  }

  function formatTrayEventText(ev, channelId) {
    var text = ev && ev.text ? String(ev.text).trim() : '';
    var i;
    for (i = 0; i < DEBUG_EVENT_PATTERNS.length; i++) {
      if (DEBUG_EVENT_PATTERNS[i].test(text)) return t('trayChEventFriendly', '刚刚有活动');
    }
    if (!text) return t('trayChEventEmpty', '暂无动静');
    return text;
  }

  function formatWeekTrendSummary(weekTrend) {
    if (!weekTrend || !weekTrend.length) return '';
    var sum = 0;
    var i;
    for (i = 0; i < weekTrend.length; i++) sum += Number(weekTrend[i]) || 0;
    if (sum <= 0) return '';
    return t('trayHabitWeekActive', '本周有使用');
  }

  function activeMapping(cfg) {
    cfg = cfg || readConfig();
    if (!cfg || !cfg.mappings) return null;
    var st = global.OneToneState && global.OneToneState.state;
    var id = st && st.selectedMappingId;
    if (id) {
      var hit = cfg.mappings.find(function (m) { return m && m.id === id; });
      if (hit) return hit;
    }
    return cfg.mappings.find(function (m) { return m && m.enabled; }) || cfg.mappings[0] || null;
  }

  function readConfig() {
    var st = global.OneToneState && global.OneToneState.state;
    if (st && st.config) return st.config;
    return osCtx.config || null;
  }

  function resolveHubEntry() {
    var Hub = global.OneToneSoftPadHub;
    return Hub && Hub.resolveSoftPadEntry ? Hub.resolveSoftPadEntry() : null;
  }

  function padMapping(cfg) {
    cfg = cfg || readConfig() || osCtx.config;
    if (!cfg || !cfg.mappings) return null;
    var entry = resolveHubEntry();
    if (entry && entry.mapping) return entry.mapping;
    var m = activeMapping(cfg);
    if (m && m.codexMicroPad) return m;
    return cfg.mappings.find(function (x) { return x && x.codexMicroPad; }) || m;
  }

  function loadTrayLayout() {
    var V2 = global.OneToneTrayLayoutV2;
    var Store = global.OneToneTrayDataStore;
    if (trayLayoutV2) return Promise.resolve({ layout: trayLayoutV2 });
    if (Store && Store.layout) {
      trayLayoutV2 = Store.layout;
      syncLegacyFromV2();
      return Promise.resolve({ layout: trayLayoutV2 });
    }
    return invoke('cmd_tray_customization_get').then(function (cfg) {
      if (!cfg) return;
      if (V2) {
        var merged = V2.mergeLayoutWithCatalog(cfg.version === V2.VERSION ? cfg : V2.migrateV1(cfg));
        trayLayoutV2 = merged.layout;
        syncLegacyFromV2();
        return merged;
      }
      trayLayout.showEvent = cfg.showEvent !== false;
      var s = cfg.showInTray || cfg.show_in_tray || {};
      trayLayout.showInTray.voice = s.voice !== false;
      trayLayout.showInTray.keys = s.keys !== false;
      trayLayout.showInTray.softPad = s.softPad !== false || s.soft_pad !== false;
      trayLayout.showInTray.camera = !!s.camera;
    }).catch(function () {});
  }

  function saveCustomization(layout) {
    var V2 = global.OneToneTrayLayoutV2;
    if (layout && V2) trayLayoutV2 = V2.normalizeLayout(layout);
    syncLegacyFromV2();
    var payload = trayLayoutV2 || (V2 ? V2.defaultLayout() : {
      showEvent: trayLayout.showEvent,
      showInTray: trayLayout.showInTray
    });
    return invoke('cmd_tray_customization_save', payload).then(function () {
      notifyChanged({ source: 'customization', _fromNotify: true });
    });
  }

  function saveMappingConfig(source) {
    var persist = global.OneToneConfigPersist;
    if (persist && persist.save) {
      return Promise.resolve(persist.save({ source: source || 'tray-channel-controls' })).then(function () {
        notifyChanged({ source: 'config', _fromNotify: true });
      });
    }
    notifyChanged({ source: 'config', _fromNotify: true });
    return Promise.resolve();
  }

  function saveMappingPatch(mappingId, patch, source) {
    if (!mappingId) return Promise.resolve();
    var body = { mappings: [{ id: mappingId }] };
    Object.keys(patch || {}).forEach(function (k) { body.mappings[0][k] = patch[k]; });
    return invoke('cmd_save', { json: JSON.stringify(body) }).then(function () {
      notifyChanged({ source: source || 'tray-os', _fromNotify: true });
    });
  }

  function voiceAssistOn(cfg) {
    cfg = cfg || readConfig() || osCtx.config || {};
    if (cfg.voiceAssistEnabled === false) return false;
    if (cfg.voiceAssistEnabled === true) return true;
    var strat = String(cfg.voiceListeningStrategy || '').trim();
    return strat !== '' && strat !== 'off';
  }

  function allControls(channel) {
    var V2 = global.OneToneTrayLayoutV2;
    if (V2 && V2.controlsForChannel) return V2.controlsForChannel(channel);
    return [];
  }

  function findControlById(ctrlId) {
    var i;
    for (i = 0; i < CHANNEL_ORDER.length; i++) {
      var list = allControls(CHANNEL_ORDER[i]);
      var hit = list.find(function (c) { return c.id === ctrlId; });
      if (hit) return hit;
    }
    return null;
  }

  function controlsForSurface(channel, surface) {
    var controls = getChannelControls(channel, surface);
    var V2 = global.OneToneTrayLayoutV2;
    if (V2 && layoutV2()) {
      var visible = V2.visibleControlsForChannel(layoutV2(), channel);
      if (visible.length) {
        var allowed = {};
        visible.forEach(function (c) {
          var parts = c.id.split(':');
          if (parts[2]) allowed[parts[2]] = true;
        });
        controls = controls.filter(function (c) { return !!allowed[c.id]; });
      }
    }
    return controls;
  }

  function getChannelControls(channel, surface) {
    var list = allControls(channel);
    if (!surface || surface === 'inspector') return [];
    if (surface === 'compact') surface = 'unified';
    if (surface === 'unified' || surface === 'editor' || surface === 'os') return list;
    return list;
  }

  function readControlValue(ctrl, ctx) {
    ctx = ctx || {};
    if (!ctx.ignoreSceneOverride && sceneSnapOverride && ctrl && sceneSnapOverride[ctrl.id] !== undefined) {
      return !!sceneSnapOverride[ctrl.id];
    }
    var cfg = ctx.config || readConfig() || osCtx.config;
    var m = ctx.mapping || activeMapping(cfg);
    var pad = m && m.codexMicroPad;
    var pm;

    if (ctrl.id === 'voiceMaster') return voiceAssistOn(cfg);
    if (ctrl.id === 'voiceEnd') {
      if (ctx.voiceEnd) return ctx.voiceEnd.enabled !== false;
      var ve = (cfg && (cfg.voiceEnd || cfg.voice_end)) || {};
      return ve.enabled !== false;
    }
    if (ctrl.id === 'keysEnabled') return !!(m && m.enabled !== false);
    if (ctrl.id === 'keysCancel') return !!(m && m.cancelEnabled !== false);
    if (ctrl.id === 'keysAutoSend') return !!(m && m.autoEnterEnabled);
    if (ctrl.id === 'padEnabled') {
      pm = padMapping(cfg);
      pad = pm && pm.codexMicroPad;
      return !!(pad && pad.enabled !== false);
    }
    if (ctrl.id === 'padOverlay') {
      pm = padMapping(cfg);
      pad = pm && pm.codexMicroPad;
      return !!(pad && pad.overlayEnabled !== false);
    }
    if (ctrl.id === 'padRequireFg') {
      pm = padMapping(cfg);
      pad = pm && pm.codexMicroPad;
      return !!(pad && pad.requireForeground !== false);
    }
    if (ctrl.id === 'camPresence') {
      var cam = (cfg && cfg.cameraPrefs) || {};
      var pa = cam.presenceActions || cam.presence_actions || {};
      return !!pa.enabled;
    }
    if (ctrl.id === 'camAutoMute') {
      cam = (cfg && cfg.cameraPrefs) || {};
      var am = cam.autoMute || cam.auto_mute || {};
      return !!(am && am.enabled);
    }
    if (ctrl.id === 'camTriggerAway') {
      cam = (cfg && cfg.cameraPrefs) || {};
      var pa2 = cam.presenceActions || cam.presence_actions || {};
      var tr = pa2.triggers || {};
      return !!tr.away;
    }
    if (ctrl.id === 'camNoFaceMute') {
      cam = (cfg && cfg.cameraPrefs) || {};
      am = cam.autoMute || cam.auto_mute || {};
      return !!(am && am.noFaceMute);
    }
    return false;
  }

  function unparkVoiceForTray() {
    return invoke('cmd_set_settings_drawer_open', {
      open: false,
      parkVoice: false,
      park_voice: false
    }).catch(function () {});
  }

  function patchOsVoiceListening(on) {
    var cfg = osCtx.config;
    if (!cfg) return;
    cfg.voiceAssistEnabled = on;
    cfg.voiceListeningStrategy = on ? 'auto' : 'off';
    cfg.desiredEngine = on ? 'kws' : 'none';
    if (cfg.voiceKws) cfg.voiceKws.enabled = !!on;
    if (cfg.voiceVosk) cfg.voiceVosk.enabled = false;
    if (cfg.voiceSapi) cfg.voiceSapi.enabled = false;
  }

  function trayActivateVoiceListening(on, ctx) {
    ctx = ctx || {};
    var batch = !!ctx.batchApply;
    if (!on) {
      return invoke('cmd_voice_set_listening_strategy', { strategy: 'off' }).then(function () {
        patchOsVoiceListening(false);
        if (batch) return;
        return refreshOsContext(ctx.global);
      }).then(function () {
        if (batch) return;
        return invoke('cmd_tray_refresh_segments', { segments: ['channels'] }).catch(function () {});
      });
    }
    return unparkVoiceForTray().then(function () {
      return invoke('cmd_voice_set_listening_strategy', { strategy: 'auto' });
    }).then(function () {
      patchOsVoiceListening(true);
      return invoke('cmd_voice_kws_retry_start', {}).catch(function () {});
    }).then(function () {
      if (batch) return;
      return refreshOsContext(ctx.global);
    }).then(function () {
      if (batch) return;
      return invoke('cmd_tray_refresh_segments', { segments: ['channels', 'global'] }).catch(function () {});
    });
  }

  function patchOsSnapshotLocal(snap) {
    if (!snap) return;
    var cfg = osCtx.config;
    if (!cfg) return;
    if (snap.voiceMaster !== undefined) patchOsVoiceListening(!!snap.voiceMaster);
    if (snap.voiceEnd !== undefined) {
      if (!cfg.voiceEnd) cfg.voiceEnd = {};
      cfg.voiceEnd.enabled = !!snap.voiceEnd;
      if (osCtx.voiceEnd) osCtx.voiceEnd.enabled = !!snap.voiceEnd;
    }
    var m = osCtx.mapping || activeMapping(cfg);
    if (m) {
      if (snap.keysEnabled !== undefined) m.enabled = !!snap.keysEnabled;
      if (snap.keysCancel !== undefined) m.cancelEnabled = !!snap.keysCancel;
      if (snap.keysAutoSend !== undefined) m.autoEnterEnabled = !!snap.keysAutoSend;
      var pad = m.codexMicroPad;
      if (pad) {
        if (snap.padEnabled !== undefined) pad.enabled = !!snap.padEnabled;
        if (snap.padOverlay !== undefined) pad.overlayEnabled = !!snap.padOverlay;
        if (snap.padRequireFg !== undefined) pad.requireForeground = !!snap.padRequireFg;
      }
    }
    var pm = padMapping(cfg);
    if (pm && pm.codexMicroPad && pm !== m) {
      var pad2 = pm.codexMicroPad;
      if (snap.padEnabled !== undefined) pad2.enabled = !!snap.padEnabled;
      if (snap.padOverlay !== undefined) pad2.overlayEnabled = !!snap.padOverlay;
      if (snap.padRequireFg !== undefined) pad2.requireForeground = !!snap.padRequireFg;
    }
    if (snap.camPresence !== undefined) {
      if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
      if (!cfg.cameraPrefs.presenceActions) cfg.cameraPrefs.presenceActions = {};
      cfg.cameraPrefs.presenceActions.enabled = !!snap.camPresence;
    }
    if (snap.camTriggerAway !== undefined) {
      if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
      if (!cfg.cameraPrefs.presenceActions) cfg.cameraPrefs.presenceActions = { triggers: {} };
      if (!cfg.cameraPrefs.presenceActions.triggers) cfg.cameraPrefs.presenceActions.triggers = {};
      cfg.cameraPrefs.presenceActions.triggers.away = !!snap.camTriggerAway;
    }
    if (snap.camAutoMute !== undefined) {
      if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
      if (!cfg.cameraPrefs.autoMute) cfg.cameraPrefs.autoMute = {};
      cfg.cameraPrefs.autoMute.enabled = !!snap.camAutoMute;
    }
    if (snap.camNoFaceMute !== undefined) {
      if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
      if (!cfg.cameraPrefs.autoMute) cfg.cameraPrefs.autoMute = {};
      cfg.cameraPrefs.autoMute.noFaceMute = !!snap.camNoFaceMute;
    }
  }

  function setSceneSnapOverride(snap) {
    sceneSnapOverride = snap || null;
  }

  function clearSceneSnapOverride() {
    sceneSnapOverride = null;
  }

  function syncOsTrayToggleDom(snap) {
    if (typeof document === 'undefined') return;
    if (snap) {
      document.querySelectorAll('tray-channel-block [data-ctrl]').forEach(function (row) {
        var id = row.getAttribute('data-ctrl');
        if (!id || snap[id] === undefined) return;
        var on = !!snap[id];
        var btn = row.querySelector('.sw-toggle');
        if (!btn) return;
        btn.classList.toggle('off', !on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      return;
    }
    var Os = global.OneToneTrayRenderOs;
    var Io = global.OneToneTraySwitchIo;
    if (!Os || !Io) return;
    var api = Io.api();
    if (!api) return;
    document.querySelectorAll('tray-channel-block').forEach(function (shell) {
      var ch = shell.getAttribute('data-id');
      if (!ch || shell.hidden) return;
      var ctx = Object.assign({ surface: 'os', channel: ch }, getOsCtx());
      var controls = getChannelControls(ch, 'os');
      Os.patchOsToggles(shell, controls, ctx, api);
    });
  }

  function finishOsBatchApply(ctx) {
    return refreshOsContext(ctx && ctx.global).then(function () {
      return invoke('cmd_tray_refresh_segments', { segments: ['channels', 'global'] }).catch(function () {});
    });
  }

  function writeControlValue(ctrl, value, ctx) {
    ctx = ctx || {};
    var on = !!value;
    var cfg = readConfig() || osCtx.config;
    var m = ctx.mapping || activeMapping(cfg);
    var pad = m && m.codexMicroPad;
    var mappingId = (m && m.id) || (ctx.global && ctx.global.activeHabitId) || '';
    var persist;
    var pm;

    if (ctrl.id === 'voiceMaster') {
      if (global.OneToneVoiceWake && global.OneToneVoiceWake.switchListeningStrategy) {
        return Promise.resolve(
          global.OneToneVoiceWake.switchListeningStrategy(on ? 'auto' : 'off', { force: true })
        ).then(function () {
          patchOsVoiceListening(on);
          if (cfg) cfg.voiceAssistEnabled = on;
          return saveMappingConfig('tray-voice-master');
        });
      }
      return trayActivateVoiceListening(on, ctx).then(function () {
        if (!ctx.batchApply) {
          notifyChanged({ source: 'tray-os-voice', channel: 'voice', _fromNotify: true });
        }
      });
    }
    if (ctrl.id === 'voiceEnd') {
      return invoke('cmd_voice_end_set_enabled', { enabled: on }).then(function () {
        notifyChanged({ source: 'config', channel: 'voice', _fromNotify: true });
      });
    }
    if (ctrl.id === 'keysEnabled') {
      if (!mappingId) return Promise.resolve();
      return invoke('cmd_mapping_toggle', { id: mappingId, enabled: on }).then(function () {
        if (m) m.enabled = on;
        var patch = ctx.surface === 'os'
          ? saveMappingPatch(mappingId, { enabled: on }, 'tray-os-keys')
          : saveMappingConfig('tray-keys-enabled');
        return patch.then(function () {
          if (ctx.batchApply || ctx.surface !== 'os') return osCtx;
          return refreshOsContext(ctx.global);
        });
      });
    }
    if (ctrl.id === 'keysCancel') {
      if (!mappingId) return Promise.resolve();
      if (m) m.cancelEnabled = on;
      return ctx.surface === 'os'
        ? saveMappingPatch(mappingId, { cancelEnabled: on }, 'tray-os-keys-cancel')
        : saveMappingConfig('tray-keys-cancel');
    }
    if (ctrl.id === 'keysAutoSend') {
      if (!mappingId) return Promise.resolve();
      if (m) m.autoEnterEnabled = on;
      return ctx.surface === 'os'
        ? saveMappingPatch(mappingId, { autoEnterEnabled: on }, 'tray-os-keys-autosend')
        : saveMappingConfig('tray-keys-autosend');
    }
    if (ctrl.id === 'padEnabled' || ctrl.id === 'padOverlay' || ctrl.id === 'padRequireFg') {
      pm = padMapping(cfg) || m;
      pad = pm && pm.codexMicroPad;
      if (!pad || !pm) return Promise.resolve();
      if (ctrl.id === 'padEnabled') pad.enabled = on;
      else if (ctrl.id === 'padOverlay') pad.overlayEnabled = on;
      else pad.requireForeground = on;
      return invoke('cmd_codex_micro_pad_set_flags', {
        mappingId: String(pm.id),
        enabled: pad.enabled !== false,
        overlayEnabled: pad.overlayEnabled !== false,
        requireNumLockOff: !!pad.requireNumLockOff,
        requireForeground: pad.requireForeground !== false,
        navKeysEnabled: pad.showNavigationPad !== false && pad.navKeysEnabled !== false
      }).then(function () {
        return saveMappingConfig('tray-pad-flags');
      }).then(function () {
        if (ctx.batchApply || ctx.surface !== 'os') return osCtx;
        return refreshOsContext(ctx.global);
      });
    }
    if (ctrl.id === 'camPresence') {
      if (cfg) {
        if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
        if (!cfg.cameraPrefs.presenceActions) cfg.cameraPrefs.presenceActions = {};
        cfg.cameraPrefs.presenceActions.enabled = on;
      }
      persist = global.OneToneConfigPersist;
      if (persist && persist.saveCameraPrefsQuiet) persist.saveCameraPrefsQuiet();
      notifyChanged({ source: 'config', channel: 'camera', _fromNotify: true });
      return Promise.resolve();
    }
    if (ctrl.id === 'camAutoMute') {
      if (cfg) {
        if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
        if (!cfg.cameraPrefs.autoMute || typeof cfg.cameraPrefs.autoMute !== 'object') {
          cfg.cameraPrefs.autoMute = { enabled: false };
        }
        cfg.cameraPrefs.autoMute.enabled = on;
      }
      persist = global.OneToneConfigPersist;
      if (persist && persist.saveCameraPrefsQuiet) persist.saveCameraPrefsQuiet();
      notifyChanged({ source: 'config', channel: 'camera', _fromNotify: true });
      return Promise.resolve();
    }
    if (ctrl.id === 'camTriggerAway') {
      if (cfg) {
        if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
        if (!cfg.cameraPrefs.presenceActions) cfg.cameraPrefs.presenceActions = { triggers: {} };
        if (!cfg.cameraPrefs.presenceActions.triggers) cfg.cameraPrefs.presenceActions.triggers = {};
        cfg.cameraPrefs.presenceActions.triggers.away = on;
      }
      persist = global.OneToneConfigPersist;
      if (persist && persist.saveCameraPrefsQuiet) persist.saveCameraPrefsQuiet();
      notifyChanged({ source: 'config', channel: 'camera', _fromNotify: true });
      return Promise.resolve();
    }
    if (ctrl.id === 'camNoFaceMute') {
      if (cfg) {
        if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
        if (!cfg.cameraPrefs.autoMute || typeof cfg.cameraPrefs.autoMute !== 'object') {
          cfg.cameraPrefs.autoMute = { enabled: false };
        }
        cfg.cameraPrefs.autoMute.noFaceMute = on;
      }
      persist = global.OneToneConfigPersist;
      if (persist && persist.saveCameraPrefsQuiet) persist.saveCameraPrefsQuiet();
      notifyChanged({ source: 'config', channel: 'camera', _fromNotify: true });
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  function setToggle(btn, on) {
    if (!btn) return;
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function openSettingsPanel(panel) {
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.open) drawer.open({ panel: panel });
    else if (drawer && drawer.openSettings) drawer.openSettings({ panel: panel });
  }

  function openTrayEditor(channel) {
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.open) drawer.open({ panel: 'tray', trayEditorFocus: channel || 'habit' });
    else if (drawer && drawer.openSettings) drawer.openSettings({ panel: 'tray', trayEditorFocus: channel || 'habit' });
  }

  function renderSwitchCards(host, channel, ctx, opts) {
    var Ed = global.OneToneTrayRenderEditor;
    var Io = global.OneToneTraySwitchIo;
    if (Ed && Io && Io.api()) return Ed.renderSwitchCards(Io.api(), host, channel, ctx, opts);
    opts = opts || {};
    if (!host || channel === 'habits') return Promise.resolve();
    ctx = ctx || { surface: 'editor' };
    return loadTrayLayout().then(function () {
      host.innerHTML = '';
      var controls = controlsForSurface(channel, 'editor');
      controls.forEach(function (ctrl) {
        var on = readControlValue(ctrl, Object.assign({ channel: channel }, ctx));
        var dep = ctrl.needs ? findControlById(ctrl.needs) : null;
        var depOn = dep ? readControlValue(dep, Object.assign({ channel: channel }, ctx)) : true;
        var card = document.createElement('div');
        card.className = 'ch-switch-card is-' + ctrl.tier + (on ? '' : ' is-off');
        card.setAttribute('data-sw-id', ctrl.id);
        var label = t(ctrl.labelKey, LABEL_FB[ctrl.labelKey] || ctrl.labelKey);
        var hint = ctrl.hintKey ? t(ctrl.hintKey, '') : '';
        var warnHtml = '';
        if (dep && !depOn) {
          warnHtml = '<div class="ch-switch-card__warn"><span class="ch-switch-card__warn__ic">⚠</span><span>此开关依赖 <b>' +
            t(dep.labelKey, LABEL_FB[dep.labelKey] || dep.labelKey) + '</b> 未开启</span></div>';
        } else if (dep && depOn) {
          warnHtml = '<div class="ch-switch-card__rel" data-go-rel="' + dep.id + '"><span class="ch-switch-card__rel__ic">↪</span><span class="ch-switch-card__rel__name">' +
            t(dep.labelKey, LABEL_FB[dep.labelKey] || dep.labelKey) + '</span> 已开启</div>';
        }
        card.innerHTML = '<div class="ch-switch-card__head"><div class="ch-switch-card__main">' +
          '<div class="ch-switch-card__title"><span class="ch-switch-card__name">' + label + '</span>' +
          '<span class="ch-switch-card__lvl ' + ctrl.tier + '">' + ctrl.tier.toUpperCase() + '</span></div>' +
          (hint ? '<div class="ch-switch-card__hint">' + hint + '</div>' : '') +
          '</div><button type="button" class="ch-switch-card__toggle toggle-switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></button></div>' + warnHtml;
        var btn = card.querySelector('.ch-switch-card__toggle');
        btn.addEventListener('click', function () {
          var next = btn.getAttribute('aria-checked') !== 'true';
          setToggle(btn, next);
          writeControlValue(ctrl, next, Object.assign({ channel: channel, surface: 'editor' }, ctx)).then(function () {
            if (opts.onChange) opts.onChange(ctrl.id);
            syncAllSurfaces(channel);
            renderSwitchCards(host, channel, ctx, opts);
          }).catch(function () { setToggle(btn, !next); });
        });
        host.appendChild(card);
      });
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'go-link';
      go.textContent = t('trayChGoSettings', '完整设置 ▸');
      go.addEventListener('click', function () { openSettingsPanel(SETTINGS_PANEL[channel]); });
      host.appendChild(go);
    });
  }

  function renderInspectorPreview(host, channel, opts) {
    opts = opts || {};
    if (!host) return Promise.resolve();
    if (channel === 'habits') {
      renderHabitsInspector(host, opts);
      return Promise.resolve();
    }
    return loadTrayLayout().then(function () {
      host.innerHTML = '';
      var wrap = document.createElement('div');
      wrap.className = 'soft-pad-tray-inspector-preview';
      var ch = opts.channelState || null;
      if (ch && ch.meta) {
        var summary = document.createElement('div');
        summary.className = 'soft-pad-tray-inspector-summary';
        summary.textContent = ch.meta;
        wrap.appendChild(summary);
      }
      var links = document.createElement('div');
      links.className = 'soft-pad-tray-inspector-links';
      var settingsLink = document.createElement('button');
      settingsLink.type = 'button';
      settingsLink.className = 'soft-pad-tray-go-settings';
      settingsLink.textContent = t('trayChGoSettings', '完整设置 ▸');
      settingsLink.addEventListener('click', function () {
        openSettingsPanel(SETTINGS_PANEL[channel]);
      });
      links.appendChild(settingsLink);
      var debugLink = document.createElement('button');
      debugLink.type = 'button';
      debugLink.className = 'soft-pad-tray-go-debug';
      debugLink.textContent = t('trayChGoDebug', '查看运行详情 ▸');
      debugLink.addEventListener('click', function () {
        openSettingsPanel('debug');
      });
      links.appendChild(debugLink);
      wrap.appendChild(links);
      host.appendChild(wrap);
    });
  }

  function renderInspectorCard(host, channel, opts) {
    return renderInspectorPreview(host, channel, opts);
  }

  function renderHabitsInspector(host, opts) {
    opts = opts || {};
    var g = (opts.trayState && opts.trayState.global) || {};
    host.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'soft-pad-tray-habits-readonly';
    var hasHabit = !!(g.activeHabitId && g.activeHabitLabel && g.activeHabitLabel !== '—');
    var title = document.createElement('div');
    title.className = 'soft-pad-tray-habits-name';
    title.textContent = hasHabit ? g.activeHabitLabel : t('trayHeroNoHabit', '未配置习惯');
    wrap.appendChild(title);
    if (hasHabit) {
      var stats = document.createElement('div');
      stats.className = 'soft-pad-tray-habits-stats';
      var total = g.todayTotalCount || 0;
      if (!total) stats.textContent = t('trayTodayEmpty', '今日暂无');
      else {
        var line = t('trayTodayTotal', '今日 {n} 次').replace('{n}', String(total));
        var hc = g.todayHabitCount || 0;
        if (hc > 0) line += ' · ' + g.activeHabitLabel + ' ' + hc + t('trayTodayHabitSuffix', ' 次');
        stats.textContent = line;
      }
      wrap.appendChild(stats);
      var trendText = formatWeekTrendSummary(g.weekTrend);
      if (trendText) {
        var trend = document.createElement('div');
        trend.className = 'soft-pad-tray-habits-trend';
        trend.textContent = trendText;
        wrap.appendChild(trend);
      }
    }
    var actions = document.createElement('div');
    actions.className = 'soft-pad-tray-habits-actions';
    var cycleBtn = document.createElement('button');
    cycleBtn.type = 'button';
    cycleBtn.className = 'soft-pad-tray-habits-btn';
    cycleBtn.textContent = t('trayHabitCycle', '切换下一习惯');
    cycleBtn.addEventListener('click', function () {
      invoke('cmd_tray_action', { action: 'cycle_scheme', payload: null });
    });
    var pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'soft-pad-tray-habits-btn';
    pauseBtn.textContent = g.mode === 'paused' || g.mode === 'silenced'
      ? t('trayChHeroResume', '继续听')
      : t('trayChHeroPause', '先停一下');
    pauseBtn.addEventListener('click', function () {
      invoke('cmd_tray_action', { action: 'listen_toggle', payload: null });
    });
    actions.appendChild(cycleBtn);
    actions.appendChild(pauseBtn);
    wrap.appendChild(actions);
    var link = document.createElement('button');
    link.type = 'button';
    link.className = 'soft-pad-tray-go-settings';
    link.textContent = t('trayChGoHabits', '去习惯页 ▸');
    link.addEventListener('click', function () {
      openSettingsPanel('habits');
    });
    wrap.appendChild(link);
    host.appendChild(wrap);
  }

  function layoutChkId(channel) {
    return 'softPadTrayChkShow' + channel.charAt(0).toUpperCase() + channel.slice(1);
  }

  function layoutLabelKey(channel) {
    if (channel === 'voice') return 'trayLayoutShowVoice';
    if (channel === 'keys') return 'trayLayoutShowKeys';
    if (channel === 'softPad') return 'trayLayoutShowSoftPad';
    return 'trayLayoutShowCamera';
  }

  function renderTrayLayoutToggles(host, opts) {
    opts = opts || {};
    if (!host) return;
    host.innerHTML = '';
    LAYOUT_CHANNELS.forEach(function (ch) {
      var lbl = document.createElement('label');
      lbl.className = 'soft-pad-tray-layout-chk';
      var inp = document.createElement('input');
      inp.type = 'checkbox';
      inp.id = layoutChkId(ch);
      inp.checked = !!trayLayout.showInTray[ch];
      inp.addEventListener('change', function () {
        trayLayout.showInTray[ch] = inp.checked;
        if (opts.onChange) opts.onChange();
        saveCustomization();
      });
      lbl.appendChild(inp);
      lbl.appendChild(document.createTextNode(' ' + t(layoutLabelKey(ch), LABEL_FB[layoutLabelKey(ch)] || ch)));
      host.appendChild(lbl);
    });
  }

  function syncTrayLayoutTogglesFromState() {
    LAYOUT_CHANNELS.forEach(function (ch) {
      var el = document.getElementById(layoutChkId(ch));
      if (el) el.checked = !!trayLayout.showInTray[ch];
    });
  }

  function ingestOsContext(payload, globalState) {
    if (!payload || !payload.config) return;
    osCtx.config = payload.config;
    osCtx.voiceEnd = payload.voiceEnd || payload.voice_end || null;
    osCtx.global = globalState || osCtx.global;
    syncOsMappingFromGlobal();
  }

  function applyCustomizationPayload(customization) {
    if (!customization) return;
    var V2 = global.OneToneTrayLayoutV2;
    if (V2) {
      var merged = V2.mergeLayoutWithCatalog(
        customization.version === V2.VERSION ? customization : V2.migrateV1(customization)
      );
      trayLayoutV2 = merged.layout;
      syncLegacyFromV2();
    } else {
      trayLayout.showEvent = customization.showEvent !== false;
      var s = customization.showInTray || customization.show_in_tray || {};
      trayLayout.showInTray.voice = s.voice !== false;
      trayLayout.showInTray.keys = s.keys !== false;
      trayLayout.showInTray.softPad = s.softPad !== false || s.soft_pad !== false;
      trayLayout.showInTray.camera = !!s.camera;
    }
  }

  function applyOsContextPayload(payload) {
    if (!payload || !payload.config) return;
    osCtx.config = payload.config;
    osCtx.voiceEnd = payload.voiceEnd || payload.voice_end || null;
    var id = osCtx.global && osCtx.global.activeHabitId;
    if (id) {
      osCtx.mapping = (osCtx.config.mappings || []).find(function (m) { return m && m.id === id; }) || null;
    }
    if (!osCtx.mapping) osCtx.mapping = activeMapping(osCtx.config);
  }

  function hydrateOsContext(globalState, opts) {
    opts = opts || {};
    osCtx.global = globalState || osCtx.global;
    if (opts.customization) applyCustomizationPayload(opts.customization);
    if (osCtx.config) {
      syncOsMappingFromGlobal();
      return Promise.resolve(osCtx);
    }
    if (opts.osContext) {
      applyOsContextPayload(opts.osContext);
      return Promise.resolve(osCtx);
    }
    if (osHydratePromise) return osHydratePromise;
    var customizationPromise = opts.customization !== undefined
      ? Promise.resolve(opts.customization)
      : invoke('cmd_tray_customization_get').catch(function () { return null; });
    osHydratePromise = Promise.all([
      customizationPromise,
      invoke('cmd_tray_os_context').catch(function () { return null; })
    ]).then(function (res) {
      if (res[0]) applyCustomizationPayload(res[0]);
      if (res[1]) applyOsContextPayload(res[1]);
      return osCtx;
    }).finally(function () {
      osHydratePromise = null;
    });
    return osHydratePromise;
  }

  function prefetchOsContext() {
    if (osCtx.config) return Promise.resolve(null);
    return invoke('cmd_tray_os_context').catch(function () { return null; });
  }

  function hasOsContext() {
    return !!osCtx.config;
  }

  function syncOsMappingFromGlobal() {
    if (!osCtx.config || !osCtx.global) return;
    var id = String(osCtx.global.activeHabitId || '').trim();
    if (!id) return;
    osCtx.mapping = (osCtx.config.mappings || []).find(function (m) { return m && m.id === id; }) || osCtx.mapping;
  }

  function refreshOsContext(globalState) {
    osCtx.global = globalState || osCtx.global;
    return invoke('cmd_tray_os_context').then(function (res) {
      if (res && res.config) {
        osCtx.config = res.config;
        osCtx.voiceEnd = res.voiceEnd || res.voice_end || null;
        syncOsMappingFromGlobal();
      }
      return osCtx;
    }).catch(function () { return osCtx; });
  }

  function getOsCtx() {
    return {
      surface: 'os',
      channel: null,
      config: osCtx.config,
      mapping: osCtx.mapping,
      voiceEnd: osCtx.voiceEnd,
      global: osCtx.global
    };
  }

  function traySceneLine(channel, state, ch) {
    var g = state && state.global;
    var fg = g && String(g.foregroundLabel || g.foregroundOsDebug || '').trim();
    var meta = String((ch && ch.meta) || '');
    if (channel === 'keys') {
      if (fg && fg !== '—') {
        return meta && meta !== '未启用' ? fg + ' · ' + meta : fg;
      }
      var ul = String(g.userLabel || '').trim();
      var hl = String(g.activeHabitLabel || '').trim();
      if (ul && ul !== '—') return hl && hl !== '—' && hl !== ul ? ul + ' · ' + hl : ul;
      if (hl && hl !== '—') return hl;
    }
    return meta;
  }

  function osToggleHtml(on) {
    return '<button type="button" class="sw-toggle' + (on ? '' : ' off') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></button>';
  }

  function renderOsTrayBlock(shell, channel, state, opts) {
    var Os = global.OneToneTrayRenderOs;
    var Io = global.OneToneTraySwitchIo;
    if (Os && Io && Io.api()) return Os.renderBlock(Io.api(), shell, channel, state, opts);
    opts = opts || {};
    if (!shell || channel === 'habits') return Promise.resolve();
    var ch = (state && state.channels || []).find(function (c) { return c.id === channel; }) || {};
    var isOpen = openOsChannel === channel;
    var iconCls = channel === 'softPad' ? 'softpad' : channel;
    var ICONS = (global.OneToneIcons && global.OneToneIcons.tray) || {};
    var ctx = {
      surface: 'os',
      channel: channel,
      global: state && state.global,
      voiceEnd: osCtx.voiceEnd,
      config: osCtx.config,
      mapping: osCtx.mapping
    };

    return (osCtx.config ? Promise.resolve(osCtx) : hydrateOsContext(state && state.global)).then(function () {
      ctx.config = osCtx.config;
      ctx.mapping = osCtx.mapping;
      ctx.voiceEnd = osCtx.voiceEnd;
      var controls = controlsForSurface(channel, 'os');
      var titleCtrl = controls.filter(function (c) { return c.tier === 'l1'; })[0];
      var l2 = controls.filter(function (c) {
        return c.tier === 'l2' || (c.tier === 'l1' && c !== titleCtrl);
      });
      var l1 = titleCtrl;
      var l1Toggle = l1
        ? '<span class="ch-l1-sw" data-ctrl="' + l1.id + '">' + osToggleHtml(readControlValue(l1, ctx)) + '</span>'
        : '';
      var l2Html = '';
      if (l2.length) {
        l2Html = '<div class="ch-l2 ch-drawer' + (isOpen ? ' is-open' : '') + '">' + l2.map(function (ctrl) {
          return '<div class="sw-inline" data-ctrl="' + ctrl.id + '"><span>' + t(ctrl.labelKey, LABEL_FB[ctrl.labelKey] || ctrl.labelKey) + '</span>' + osToggleHtml(readControlValue(ctrl, ctx)) + '</div>';
        }).join('') + '<button type="button" class="more" data-ch-more="' + channel + '">' + t('trayChGoSettings', '完整设置 ▸') + '</button></div>';
      }
      var foldBtn = l2.length
        ? '<button type="button" class="ch-fold-btn' + (isOpen ? ' is-open' : '') + '" data-ch-chev="' + channel + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '" aria-label="' + (isOpen ? '收起' : '展开') + '"><span class="ch-fold-btn__ic" aria-hidden="true">⌄</span></button>'
        : '';
      var actions = '<div class="ch-actions">' + l1Toggle + foldBtn + '</div>';
      var mainToggle = l2.length ? ' data-ch-toggle="' + channel + '"' : '';
      shell.innerHTML = '<div class="ch-block' + (isOpen ? ' is-open' : '') + '"><div class="ch-main"' + mainToggle + '>'
        + '<span class="icowrap ' + iconCls + '"><span class="ico">' + (ICONS[channel] || ICONS.voice || '') + '</span></span>'
        + '<div class="ch-body"><div class="ch-title-row"><span class="name">' + (ch.name || channel) + '</span></div>'
        + '<div class="ch-scene">' + traySceneLine(channel, state, ch).replace(/</g, '&lt;') + '</div></div>'
        + actions + '</div>' + l2Html + '</div>';

      shell.querySelectorAll('.sw-toggle').forEach(function (btn) {
        var row = btn.closest('[data-ctrl]');
        if (!row) return;
        var ctrlId = row.getAttribute('data-ctrl');
        var ctrl = controls.find(function (c) { return c.id === ctrlId; });
        if (!ctrl) return;
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var next = btn.getAttribute('aria-checked') !== 'true';
          btn.classList.toggle('off', !next);
          btn.setAttribute('aria-checked', next ? 'true' : 'false');
          writeControlValue(ctrl, next, ctx).then(function () {
            if (opts.onSwitchChange) opts.onSwitchChange();
            else if (opts.onRefresh) opts.onRefresh();
          }).catch(function () {
            btn.classList.toggle('off', next);
            btn.setAttribute('aria-checked', next ? 'false' : 'true');
          });
        });
      });
      var chevBtn = shell.querySelector('[data-ch-chev]');
      function toggleFold(e) {
        if (e) e.stopPropagation();
        openOsChannel = openOsChannel === channel ? null : channel;
        renderOsTrayBlock(shell, channel, state, opts).then(function () {
          if (opts.onResize) opts.onResize();
          else if (opts.onRefresh) opts.onRefresh();
        });
      }
      if (chevBtn) chevBtn.addEventListener('click', toggleFold);
      var mainRow = shell.querySelector('[data-ch-toggle]');
      if (mainRow) {
        mainRow.addEventListener('click', function (e) {
          if (e.target.closest('.ch-actions, .sw-toggle, [data-ctrl]')) return;
          toggleFold(e);
        });
      }
      var moreBtn = shell.querySelector('[data-ch-more]');
      if (moreBtn) {
        moreBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          invoke('cmd_tray_action', { action: 'deep_link', payload: { href: 'main:' + (channel === 'softPad' ? 'softPad' : channel) } });
        });
      }
    });
  }

  function syncAllSurfaces(channel) {
    notifyChanged({ source: 'tray-controls', channel: channel, _fromNotify: true });
    if (global.OneToneSoftPadTrayUi && global.OneToneSoftPadTrayUi.refreshControls) {
      global.OneToneSoftPadTrayUi.refreshControls(channel);
    }
    if (global.OneToneChannelConfigCompact && global.OneToneChannelConfigCompact.refresh) {
      global.OneToneChannelConfigCompact.refresh(channel);
    }
  }

  function chStateFromTray(trayState, channel) {
    if (!trayState || !trayState.channels) return null;
    for (var i = 0; i < trayState.channels.length; i++) {
      if (trayState.channels[i].id === channel) return trayState.channels[i];
    }
    return null;
  }

  function mountInspectorControls(channel, trayState) {
    var hostId = 'softPadTrayControls' + channel.charAt(0).toUpperCase() + channel.slice(1);
    if (channel === 'voice') hostId = 'softPadTrayControlsVoice';
    if (channel === 'softPad') hostId = 'softPadTrayControlsSoftPad';
    if (channel === 'habits') hostId = 'softPadTrayControlsHabits';
    var host = document.getElementById(hostId);
    if (!host) return Promise.resolve();
    return renderInspectorPreview(host, channel, {
      trayState: trayState,
      channelState: chStateFromTray(trayState, channel)
    });
  }

  var CH_STATUS_NAMES = { voice: '语音', keys: '按键', softPad: '小键盘', camera: '摄像头' };

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function channelStateMeta(ch) {
    if (!ch) return '—';
    if (!ch.enabled) return '未启用';
    if (ch.state === 'listening') return '工作中';
    if (ch.state === 'standby') return '待命';
    if (ch.state === 'error') return '异常';
    return ch.meta || '—';
  }

  function openChannelSettings(channel, opts) {
    opts = opts || {};
    var panel = SETTINGS_PANEL[channel];
    if (!panel) return;
    if (opts.fromTray && global.OneToneIpc && global.OneToneIpc.invoke) {
      global.OneToneIpc.invoke('cmd_tray_action', {
        action: 'deep_link',
        payload: { href: 'main:settings?panel=' + panel }
      }).catch(function () {});
      return;
    }
    openSettingsPanel(panel);
  }

  function renderChannelStatusBar(host, state, opts) {
    opts = opts || {};
    if (!host) return;
    var channels = (state && state.channels) || [];
    var ids = ['voice', 'keys', 'softPad', 'camera'];
    var rows = ids.map(function (id) {
      var c = channels.find(function (x) { return x && (x.id === id || (id === 'softPad' && x.id === 'soft_pad')); });
      var meta = channelStateMeta(c);
      var stCls = !c || !c.enabled ? 'off' : (c.state === 'error' ? 'warn' : '');
      return '<button type="button" class="tray-ch-status-row' + (stCls ? ' tray-ch-status-row--' + stCls : '') + '" data-ch-status="' + id + '">' +
        '<span class="tray-ch-status-row__name">' + escHtml(CH_STATUS_NAMES[id]) + '</span>' +
        '<span class="tray-ch-status-row__meta">' + escHtml(meta) + '</span></button>';
    }).join('');
    host.innerHTML = '<div class="tray-ch-status" role="list">' + rows + '</div>';
    host.querySelectorAll('[data-ch-status]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ch = btn.getAttribute('data-ch-status');
        if (opts.onChannelClick) opts.onChannelClick(ch);
        else openChannelSettings(ch, opts);
      });
    });
  }

  function mountAllInspectorControls(trayState) {
    return loadTrayLayout().then(function () {
      return Promise.all(CHANNEL_ORDER.map(function (ch) {
        return mountInspectorControls(ch, trayState);
      }));
    });
  }

  global.OneToneTrayChannelControls = {
    CHANNEL_ORDER: CHANNEL_ORDER,
    SETTINGS_PANEL: SETTINGS_PANEL,
    LAYOUT_CHANNELS: LAYOUT_CHANNELS,
    getChannelControls: getChannelControls,
    readControlValue: readControlValue,
    writeControlValue: writeControlValue,
    formatTrayEventText: formatTrayEventText,
    formatWeekTrendSummary: formatWeekTrendSummary,
    renderChannelStatusBar: renderChannelStatusBar,
    openChannelSettings: openChannelSettings,
    renderSwitchCards: renderSwitchCards,
    findControlById: findControlById,
    allControls: allControls,
    openTrayEditor: openTrayEditor,
    renderInspectorPreview: renderInspectorPreview,
    renderInspectorCard: renderInspectorCard,
    renderOsTrayBlock: renderOsTrayBlock,
    renderTrayLayoutToggles: renderTrayLayoutToggles,
    syncTrayLayoutTogglesFromState: syncTrayLayoutTogglesFromState,
    renderHabitsInspector: renderHabitsInspector,
    syncAllSurfaces: syncAllSurfaces,
    mountInspectorControls: mountInspectorControls,
    mountAllInspectorControls: mountAllInspectorControls,
    loadTrayLayout: loadTrayLayout,
    getTrayLayout: function () { return trayLayout; },
    getTrayLayoutV2: layoutV2,
    setTrayLayoutV2: function (lay) {
      var V2 = global.OneToneTrayLayoutV2;
      trayLayoutV2 = V2 ? V2.normalizeLayout(lay) : lay;
      syncLegacyFromV2();
    },
    setTrayLayoutShowInTray: function (channel, on) {
      var V2 = global.OneToneTrayLayoutV2;
      if (V2 && layoutV2()) {
        V2.setBlockVisible(layoutV2(), V2.channelBlockId(channel), on);
        syncLegacyFromV2();
        return;
      }
      if (trayLayout.showInTray[channel] !== undefined) trayLayout.showInTray[channel] = !!on;
    },
    saveCustomization: saveCustomization,
    hydrateOsContext: hydrateOsContext,
    prefetchOsContext: prefetchOsContext,
    hasOsContext: hasOsContext,
    ingestOsContext: ingestOsContext,
    getOsCtx: getOsCtx,
    syncOsMappingFromGlobal: syncOsMappingFromGlobal,
    patchOsSnapshotLocal: patchOsSnapshotLocal,
    setSceneSnapOverride: setSceneSnapOverride,
    clearSceneSnapOverride: clearSceneSnapOverride,
    syncOsTrayToggleDom: syncOsTrayToggleDom,
    finishOsBatchApply: finishOsBatchApply,
    setOpenOsChannel: function (ch) { openOsChannel = ch; },
    getOpenOsChannel: function () { return openOsChannel; },
    setPreviewFocusChannel: function (ch) { openOsChannel = ch || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
