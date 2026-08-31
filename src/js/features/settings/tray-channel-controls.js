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
    trayChVoiceEnd: '说完就停',
    trayChKeysUseScenario: '快捷键',
    trayChKeysCancel: '再按可取消',
    trayChKeysAutoSend: '自动发送',
    trayChPadEnabled: '启用小键盘',
    trayChPadShowKeyboard: '显示小键盘',
    trayChPadRequireFg: '跟着前台助手',
    trayChCamPresence: '镜头动作识别',
    trayChCamTriggerAway: '检测离席',
    trayChCamAutoMute: '走远自动静音',
    trayChCamNoFaceMute: '没人也静音',
    channelConfigBasic: '基础配置',
    trayGoTrayMainSwitch: '去托盘调主开关',
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
    return st && st.config ? st.config : null;
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
    return invoke('cmd_save', JSON.stringify(body)).then(function () {
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
    if (channel === 'habits') return [];
    if (channel === 'voice') {
      return [
        { id: 'voiceMaster', tier: 'l1', stateKey: 'config.voiceAssistEnabled', ipc: 'config', labelKey: 'trayChVoiceMaster', hintKey: 'trayChVoiceMasterHint', needs: null },
        { id: 'voiceEnd', tier: 'l2', stateKey: 'config.voiceEnd.enabled', ipc: 'config', labelKey: 'trayChVoiceEnd', hintKey: 'trayChVoiceEndHint', needs: 'voiceMaster' }
      ];
    }
    if (channel === 'keys') {
      return [
        { id: 'keysEnabled', tier: 'l1', stateKey: 'mappings[].enabled', ipc: 'config', labelKey: 'trayChKeysUseScenario', hintKey: 'trayChKeysUseScenarioHint', needs: null },
        { id: 'keysCancel', tier: 'l2', stateKey: 'mappings[].cancelEnabled', ipc: 'config', labelKey: 'trayChKeysCancel', hintKey: 'trayChKeysCancelHint', needs: 'keysEnabled' },
        { id: 'keysAutoSend', tier: 'l2', stateKey: 'mappings[].autoEnterEnabled', ipc: 'config', labelKey: 'trayChKeysAutoSend', hintKey: 'trayChKeysAutoSendHint', needs: 'keysEnabled' }
      ];
    }
    if (channel === 'softPad') {
      return [
        { id: 'padEnabled', tier: 'l1', stateKey: 'mappings[].codexMicroPad.enabled', ipc: 'config', labelKey: 'trayChPadEnabled', hintKey: 'trayChPadEnabledHint', needs: null },
        { id: 'padOverlay', tier: 'l2', stateKey: 'mappings[].codexMicroPad.overlayEnabled', ipc: 'config', labelKey: 'trayChPadShowKeyboard', hintKey: 'trayChPadShowKeyboardHint', needs: 'padEnabled' },
        { id: 'padRequireFg', tier: 'l2', stateKey: 'mappings[].codexMicroPad.requireForeground', ipc: 'config', labelKey: 'trayChPadRequireFg', hintKey: 'trayChPadRequireFgHint', needs: 'padOverlay' }
      ];
    }
    if (channel === 'camera') {
      return [
        { id: 'camPresence', tier: 'l1', stateKey: 'config.cameraPrefs.presenceActions.enabled', ipc: 'config', labelKey: 'trayChCamPresence', hintKey: 'trayChCamPresenceHint', needs: null },
        { id: 'camTriggerAway', tier: 'l2', stateKey: 'config.cameraPrefs.presenceActions.triggers.away', ipc: 'config', labelKey: 'trayChCamTriggerAway', hintKey: 'trayChCamTriggerAwayHint', needs: 'camPresence' },
        { id: 'camAutoMute', tier: 'l1', stateKey: 'config.cameraPrefs.autoMute.enabled', ipc: 'config', labelKey: 'trayChCamAutoMute', hintKey: 'trayChCamAutoMuteHint', needs: null },
        { id: 'camNoFaceMute', tier: 'l2', stateKey: 'config.cameraPrefs.autoMute.noFaceMute', ipc: 'config', labelKey: 'trayChCamNoFaceMute', hintKey: 'trayChCamNoFaceMuteHint', needs: 'camAutoMute' }
      ];
    }
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
    if (surface === 'compact') {
      return list.filter(function (c) { return c.tier === 'l2'; });
    }
    if (surface === 'editor') return list;
    if (surface === 'os') return list;
    return list;
  }

  function readControlValue(ctrl, ctx) {
    ctx = ctx || {};
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
          if (cfg) cfg.voiceAssistEnabled = on;
          return saveMappingConfig('tray-voice-master');
        });
      }
      return invoke('cmd_voice_set_listening_strategy', { strategy: on ? 'auto' : 'off' }).then(function () {
        notifyChanged({ source: 'config', channel: 'voice', _fromNotify: true });
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
        return ctx.surface === 'os'
          ? saveMappingPatch(mappingId, { enabled: on }, 'tray-os-keys')
          : saveMappingConfig('tray-keys-enabled');
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
      }).then(function () { return saveMappingConfig('tray-pad-flags'); });
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

  function makeToggleRow(ctrl, channel, ctx, rowClass) {
    assertKey(ctrl.stateKey);
    var row = document.createElement('div');
    row.className = rowClass + ' tray-ctrl-' + ctrl.tier + ' ipc-' + (ctrl.ipc === 'customization' ? 'customization' : 'config');
    row.setAttribute('data-tray-tier', ctrl.tier);
    row.setAttribute('data-state-key', ctrl.stateKey);
    var label = t(ctrl.labelKey, LABEL_FB[ctrl.labelKey] || ctrl.labelKey);
    var hint = ctrl.hintKey ? t(ctrl.hintKey, '') : '';
    row.innerHTML = '<div class="tray-ctrl-lbl">' + label + (hint ? '<span class="tray-ctrl-hint">' + hint + '</span>' : '') + '</div>';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toggle-switch page-status-toggle tray-ctrl-toggle';
    btn.setAttribute('role', 'switch');
    var val = readControlValue(ctrl, Object.assign({ channel: channel }, ctx));
    setToggle(btn, val);
    btn.addEventListener('click', function () {
      var next = btn.getAttribute('aria-checked') !== 'true';
      setToggle(btn, next);
      writeControlValue(ctrl, next, Object.assign({ channel: channel }, ctx)).then(function () {
        syncAllSurfaces(channel);
      }).catch(function () {
        setToggle(btn, !next);
      });
    });
    row.appendChild(btn);
    return row;
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

  function renderCompactGroup(host, channel, opts) {
    opts = opts || {};
    if (!host || channel === 'habits') return Promise.resolve();
    var CH_NAMES = { voice: '语音', keys: '按键', softPad: '小键盘', camera: '摄像头' };
    return loadTrayLayout().then(function () {
      host.innerHTML = '';
      var group = document.createElement('div');
      group.className = 'cc-group';
      group.innerHTML = '<div class="cc-gh">' + t('channelConfigBasic', '基础配置') + '</div>';
      var ctx = { surface: 'compact' };
      getChannelControls(channel, 'compact').forEach(function (ctrl) {
        group.appendChild(makeToggleRow(ctrl, channel, ctx, 'cc-row'));
      });
      var link = document.createElement('button');
      link.type = 'button';
      link.className = 'cc-row cc-row-link';
      link.textContent = t('trayGoTrayMainSwitch', '去托盘调主开关') + ' ▸ ' + (CH_NAMES[channel] || channel);
      link.addEventListener('click', function () { openTrayEditor(channel); });
      group.appendChild(link);
      host.appendChild(group);
      if (channel === 'keys' && global.OneToneAppBehaviorRules && global.OneToneAppBehaviorRules.renderCompactAppPrefs) {
        var prefs = document.createElement('div');
        prefs.className = 'cc-prefs';
        prefs.id = 'channelConfigKeysPrefs';
        host.appendChild(prefs);
        global.OneToneAppBehaviorRules.renderCompactAppPrefs(prefs, activeMapping());
      }
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

  function hydrateOsContext(globalState) {
    osCtx.global = globalState || osCtx.global;
    if (osHydratePromise) return osHydratePromise;
    osHydratePromise = Promise.all([
      invoke('cmd_tray_customization_get').catch(function () { return null; }),
      invoke('cmd_voice_end_status', {}).catch(function () { return null; }),
      invoke('cmd_ready', { backdropMode: 'unchanged' }).catch(function () { return null; })
    ]).then(function (res) {
      if (res[0]) {
        var V2 = global.OneToneTrayLayoutV2;
        if (V2) {
          var merged = V2.mergeLayoutWithCatalog(res[0].version === V2.VERSION ? res[0] : V2.migrateV1(res[0]));
          trayLayoutV2 = merged.layout;
          syncLegacyFromV2();
        } else {
          trayLayout.showEvent = res[0].showEvent !== false;
          var s = res[0].showInTray || res[0].show_in_tray || {};
          trayLayout.showInTray.voice = s.voice !== false;
          trayLayout.showInTray.keys = s.keys !== false;
          trayLayout.showInTray.softPad = s.softPad !== false || s.soft_pad !== false;
          trayLayout.showInTray.camera = !!s.camera;
        }
      }
      osCtx.voiceEnd = res[1] || null;
      if (res[2] && res[2].config) {
        osCtx.config = res[2].config;
        var id = osCtx.global && osCtx.global.activeHabitId;
        if (id) {
          osCtx.mapping = (osCtx.config.mappings || []).find(function (m) { return m && m.id === id; }) || null;
        }
        if (!osCtx.mapping) osCtx.mapping = activeMapping(osCtx.config);
      }
      return osCtx;
    }).finally(function () {
      osHydratePromise = null;
    });
    return osHydratePromise;
  }

  function osToggleHtml(on) {
    return '<button type="button" class="sw-toggle' + (on ? '' : ' off') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></button>';
  }

  function renderOsTrayBlock(shell, channel, state, opts) {
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

    return hydrateOsContext(state && state.global).then(function () {
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
        + '<div class="ch-scene">' + String(ch.meta || '').replace(/</g, '&lt;') + '</div></div>'
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
            return hydrateOsContext(state && state.global);
          }).then(function () {
            if (opts.onRefresh) opts.onRefresh();
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
          if (opts.onRefresh) opts.onRefresh();
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
    renderCompactGroup: renderCompactGroup,
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
    setOpenOsChannel: function (ch) { openOsChannel = ch; },
    getOpenOsChannel: function () { return openOsChannel; },
    setPreviewFocusChannel: function (ch) { openOsChannel = ch || null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
