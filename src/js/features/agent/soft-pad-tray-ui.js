/**
 * Soft Pad Face 3 — tray status panel: preview left + channel subtabs right.
 */
(function (global) {
  'use strict';

  var invoke = global.OneToneIpc && global.OneToneIpc.invoke;

  function t(key, fallback) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  var layout = { showEvent: true, showInTray: { voice: true, keys: true, softPad: true, camera: false } };
  var trayState = null;
  var mounted = false;
  var activeChTab = 'voice';
  var padFlagsTimer = 0;
  var layoutSaveTimer = 0;

  var STAT_IDS = {
    voice: ['softPadTrayStatVoiceEngine', 'softPadTrayStatVoiceWake', 'softPadTrayStatVoiceEvent', 'softPadTrayStatVoiceErr'],
    keys: ['softPadTrayStatKeysKey', 'softPadTrayStatKeysMode', 'softPadTrayStatKeysHabit', 'softPadTrayStatKeysLast'],
    softPad: ['softPadTrayStatPadKeys', 'softPadTrayStatPadAgent', 'softPadTrayStatPadOverlay', 'softPadTrayStatPadFg'],
    camera: ['softPadTrayStatCamDev', 'softPadTrayStatCamPresence', 'softPadTrayStatCamAutoMute', 'softPadTrayStatCamPerm']
  };

  function $(id) { return document.getElementById(id); }

  function readConfig() {
    var st = global.OneToneState && global.OneToneState.state;
    return st && st.config;
  }

  function resolveHubEntry() {
    var Hub = global.OneToneSoftPadHub;
    return Hub && Hub.resolveSoftPadEntry ? Hub.resolveSoftPadEntry() : null;
  }

  function chById(state, id) {
    if (!state || !state.channels) return null;
    for (var i = 0; i < state.channels.length; i++) {
      if (state.channels[i].id === id) return state.channels[i];
    }
    return null;
  }

  function setMiniToggle(el, on) {
    if (!el) return;
    el.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function setPill(id, text, cls) {
    var el = $(id);
    if (!el) return;
    el.textContent = text;
    el.className = 'soft-pad-tray-st-pill ' + cls;
  }

  function pillForChannel(ch) {
    if (!ch) return { text: '—', cls: 'off' };
    if (!ch.enabled) return { text: '未启用', cls: 'off' };
    if (ch.state === 'error') return { text: '异常', cls: 'err' };
    if (ch.state === 'listening') return { text: '监听中', cls: 'run' };
    if (ch.state === 'standby') return { text: '待命', cls: 'off' };
    if (ch.state === 'off') return { text: '已关闭', cls: 'off' };
    return { text: '就绪', cls: 'on' };
  }

  function dotClassForChannel(ch) {
    if (!ch || !ch.enabled) return 'off';
    if (ch.state === 'error') return 'err';
    if (ch.state === 'listening') return 'run';
    if (ch.state === 'on' || ch.state === 'ready') return 'on';
    return 'off';
  }

  function heroLabel(mode) {
    if (mode === 'paused') return '已暂停';
    if (mode === 'error') return '异常';
    if (mode === 'listening') return '监听中';
    return '待命';
  }

  function micLabel(mic) {
    if (!mic || !mic.device) return '—';
    var st = mic.muted ? '关' : '开';
    return st + ' · ' + mic.device;
  }

  function friendlyKey(key) {
    var k = String(key || '').trim();
    var map = {
      RAlt: '右 Alt', 'Right Alt': '右 Alt',
      LAlt: '左 Alt', 'Left Alt': '左 Alt',
      AutoTrigger: '自动'
    };
    return map[k] || k.replace(/_/g, ' ') || '—';
  }

  function modeLabel(mode) {
    var m = String(mode || '').toLowerCase();
    if (m === 'double') return '双击';
    if (m === 'longpress') return '长按';
    if (m === 'perpress') return '每按即发';
    return '智能连按';
  }

  function applyStats(ids, stats) {
    if (!ids || !stats) return;
    for (var i = 0; i < ids.length; i++) {
      var el = $(ids[i]);
      if (!el) continue;
      el.textContent = (stats[i] && stats[i].value) ? stats[i].value : '—';
    }
  }

  function cloneStats(ch) {
    if (!ch || !ch.stats) return [];
    return ch.stats.map(function (s) {
      return { label: s.label, value: s.value };
    });
  }

  function buildKeysStatsOverride(entry, ch) {
    var stats = cloneStats(ch);
    while (stats.length < 4) stats.push({ label: '', value: '—' });
    var m = entry && entry.mapping;
    if (!m) return stats;
    stats[0] = { label: '触发键', value: m.triggerKey ? friendlyKey(m.triggerKey) : '—' };
    stats[1] = { label: '触发方式', value: modeLabel(m.triggerMode) };
    stats[2] = { label: '当前习惯', value: entry.title || m.label || m.displayLabel || '—' };
    return stats;
  }

  function buildPadStatsOverride(entry, ch) {
    var stats = cloneStats(ch);
    while (stats.length < 4) stats.push({ label: '', value: '—' });
    var m = entry && entry.mapping;
    var pad = m && m.codexMicroPad;
    if (!pad) return stats;
    var keyCount = (pad.keys && pad.keys.length) || 0;
    stats[0] = { label: '键位', value: keyCount > 0 ? (String(keyCount) + ' 个') : '—' };
    stats[1] = { label: '绑定 Agent', value: entry.title || '—' };
    var Hub = global.OneToneSoftPadHub;
    var visible = Hub && Hub.isOverlayVisible && Hub.isOverlayVisible();
    stats[2] = {
      label: '浮层',
      value: visible ? '可见' : (pad.overlayEnabled !== false ? '已启用' : '隐藏')
    };
    return stats;
  }

  function statsForChannel(id, ch) {
    if (id === 'keys') return buildKeysStatsOverride(resolveHubEntry(), ch);
    if (id === 'softPad') return buildPadStatsOverride(resolveHubEntry(), ch);
    return cloneStats(ch);
  }

  function setChTab(id) {
    activeChTab = id || 'voice';
    document.querySelectorAll('.soft-pad-tray-ch-subtab').forEach(function (tab) {
      var on = tab.getAttribute('data-ch-tab') === activeChTab;
      tab.classList.toggle('is-active', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.querySelectorAll('[data-soft-pad-tray-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-soft-pad-tray-panel') !== activeChTab;
    });
  }

  function readLayoutFromUI() {
    var ev = $('softPadTrayChkEvent');
    layout.showEvent = ev ? ev.checked : true;
    layout.showInTray.voice = $('softPadTrayShowVoice') ? $('softPadTrayShowVoice').checked : true;
    layout.showInTray.keys = $('softPadTrayShowKeys') ? $('softPadTrayShowKeys').checked : true;
    layout.showInTray.softPad = $('softPadTrayShowSoftPad') ? $('softPadTrayShowSoftPad').checked : true;
    layout.showInTray.camera = $('softPadTrayShowCamera') ? $('softPadTrayShowCamera').checked : false;
  }

  function applyLayoutToUI() {
    if ($('softPadTrayChkEvent')) $('softPadTrayChkEvent').checked = layout.showEvent;
    if ($('softPadTrayShowVoice')) $('softPadTrayShowVoice').checked = layout.showInTray.voice;
    if ($('softPadTrayShowKeys')) $('softPadTrayShowKeys').checked = layout.showInTray.keys;
    if ($('softPadTrayShowSoftPad')) $('softPadTrayShowSoftPad').checked = layout.showInTray.softPad;
    if ($('softPadTrayShowCamera')) $('softPadTrayShowCamera').checked = layout.showInTray.camera;
  }

  function layoutPayload() {
    readLayoutFromUI();
    return {
      version: 1,
      showEvent: layout.showEvent,
      showInTray: {
        voice: layout.showInTray.voice,
        keys: layout.showInTray.keys,
        softPad: layout.showInTray.softPad,
        camera: layout.showInTray.camera
      }
    };
  }

  function syncTabUi(id, ch) {
    var dotId = id === 'softPad' ? 'softPadTrayDotSoftPad'
      : 'softPadTrayDot' + id.charAt(0).toUpperCase() + id.slice(1);
    var tabId = id === 'softPad' ? 'softPadTrayTabSoftPad'
      : 'softPadTrayTab' + id.charAt(0).toUpperCase() + id.slice(1);
    var dot = $(dotId);
    if (dot) dot.className = 'soft-pad-tray-ch-subtab__dot ' + dotClassForChannel(ch);
    var tab = $(tabId);
    if (tab) tab.classList.toggle('is-off', !!(ch && !ch.enabled));
  }

  function syncChannelUi(id, ch) {
    var metaId = id === 'softPad' ? 'softPadTrayMetaPad'
      : 'softPadTrayMeta' + id.charAt(0).toUpperCase() + id.slice(1);
    var pillId = id === 'softPad' ? 'softPadTrayPillPad'
      : 'softPadTrayPill' + id.charAt(0).toUpperCase() + id.slice(1);
    var cardId = id === 'softPad' ? 'softPadTrayCardPad'
      : 'softPadTrayCard' + id.charAt(0).toUpperCase() + id.slice(1);

    var meta = (ch && ch.meta) ? ch.meta : '—';
    if ($(metaId)) $(metaId).textContent = meta;

    applyStats(STAT_IDS[id], statsForChannel(id, ch));

    var p = pillForChannel(ch);
    setPill(pillId, p.text, p.cls);

    var card = $(cardId);
    if (card) card.classList.toggle('is-off', !!(ch && !ch.enabled));

    syncTabUi(id, ch);
  }

  function voiceEngineOn(cfg) {
    if (!cfg) return false;
    var eng = String(cfg.desiredEngine || cfg.desired_engine || '').toLowerCase();
    if (eng && eng !== 'none') return true;
    return !!(
      (cfg.voiceVosk && cfg.voiceVosk.enabled) ||
      (cfg.voiceSapi && cfg.voiceSapi.enabled) ||
      (cfg.voiceKws && cfg.voiceKws.enabled)
    );
  }

  function syncSwitchesFromConfig() {
    var cfg = readConfig();
    if (!cfg) return;
    setMiniToggle($('softPadTraySwVoiceEngine'), voiceEngineOn(cfg));
    var ve = cfg.voiceEnd || cfg.voice_end || {};
    setMiniToggle($('softPadTraySwVoiceEnd'), ve.enabled !== false);

    var entry = resolveHubEntry();
    var pad = entry && entry.mapping && entry.mapping.codexMicroPad;
    if (pad) {
      setMiniToggle($('softPadTraySwPadEnabled'), !!pad.enabled);
      setMiniToggle($('softPadTraySwPadOverlay'), pad.overlayEnabled !== false);
    }

    var cam = cfg.cameraPrefs || cfg.camera_prefs || {};
    setMiniToggle($('softPadTraySwCamEnabled'), !!cam.enabled);
    var pa = cam.presenceActions || cam.presence_actions || {};
    setMiniToggle($('softPadTraySwCamPresence'), !!pa.enabled);
  }

  var HERO_CHIP_LABEL = { voice: '语音', keys: '按键', softPad: 'Pad', camera: '摄像头' };

  function syncHeroPreview(g) {
    g = g || {};
    if ($('softPadTrayHeroText')) $('softPadTrayHeroText').textContent = heroLabel(g.mode);
    if ($('softPadTrayHeroPulse')) {
      $('softPadTrayHeroPulse').style.display = g.mode === 'listening' ? '' : 'none';
    }
    var chipsEl = $('softPadTrayHeroChips');
    if (!chipsEl) return;
    var ids = g.activeChannelIds || [];
    if (!ids.length) {
      chipsEl.innerHTML = '';
      chipsEl.setAttribute('aria-hidden', 'true');
      return;
    }
    chipsEl.setAttribute('aria-hidden', 'false');
    chipsEl.innerHTML = ids.map(function (id) {
      var lbl = HERO_CHIP_LABEL[id] || id;
      return '<span class="soft-pad-tray-hero-chip" data-ch="' + id + '">' + lbl + '</span>';
    }).join('');
  }

  function syncPreview() {
    var shell = $('softPadTrayPreviewShell');
    if (!shell) return;
    shell.dataset.hideEvent = layout.showEvent ? 'false' : 'true';
    var any = layout.showInTray.voice || layout.showInTray.keys ||
      layout.showInTray.softPad || layout.showInTray.camera;
    shell.dataset.hideChannels = any ? 'false' : 'true';
    shell.querySelectorAll('[data-tray-ch]').forEach(function (row) {
      var id = row.getAttribute('data-tray-ch');
      row.style.display = layout.showInTray[id] ? 'flex' : 'none';
    });

    var g = trayState && trayState.global;
    syncHeroPreview(g || { mode: 'listening', activeChannelIds: [] });

    if (!trayState) return;
    var mic = trayState.mic || {};

    ['voice', 'keys', 'softPad', 'camera'].forEach(function (id) {
      syncChannelUi(id, chById(trayState, id));
    });
    syncSwitchesFromConfig();

    if ($('softPadTrayMicLabel')) {
      $('softPadTrayMicLabel').textContent = '麦克风 · ' + micLabel(mic);
    }
    if ($('softPadTrayInsMicStatus')) {
      $('softPadTrayInsMicStatus').textContent = micLabel(mic);
    }
    setMiniToggle($('softPadTrayMicToggle'), mic.available && !mic.muted);
    setMiniToggle($('softPadTrayInsMicToggle'), mic.available && !mic.muted);

    var ev = trayState.event;
    var evCard = $('softPadTrayEventCard');
    if (evCard) evCard.hidden = !layout.showEvent;
    if (ev && $('softPadTrayEventBody')) {
      $('softPadTrayEventBody').textContent = ev.text || '—';
    }
  }

  function onLayoutChange() {
    readLayoutFromUI();
    syncPreview();
    clearTimeout(layoutSaveTimer);
    layoutSaveTimer = setTimeout(function () {
      saveCustomization();
    }, 150);
  }

  function refreshTrayState() {
    if (!invoke) return Promise.resolve();
    return invoke('cmd_tray_menu_ready').then(function (raw) {
      trayState = typeof raw === 'string' ? JSON.parse(raw) : raw;
      syncPreview();
    }).catch(function () {});
  }

  function loadCustomization() {
    if (!invoke) return Promise.resolve();
    return invoke('cmd_tray_customization_get').then(function (cfg) {
      if (!cfg) return;
      layout.showEvent = cfg.showEvent !== false;
      var s = cfg.showInTray || {};
      layout.showInTray.voice = s.voice !== false;
      layout.showInTray.keys = s.keys !== false;
      layout.showInTray.softPad = s.softPad !== false;
      layout.showInTray.camera = !!s.camera;
      applyLayoutToUI();
      syncPreview();
    }).catch(function () {});
  }

  function saveCustomization() {
    if (!invoke) return Promise.resolve();
    return invoke('cmd_tray_customization_save', layoutPayload()).catch(function () {});
  }

  function trayAction(action) {
    if (!invoke) return;
    invoke('cmd_tray_action', { action: action, payload: null }).then(function () {
      return refreshTrayState();
    }).catch(function () {});
  }

  function persistVoiceEngine(on) {
    if (!invoke) return;
    var cfg = readConfig();
    var eng = 'none';
    if (on) {
      var cur = cfg && String(cfg.desiredEngine || cfg.desired_engine || '').toLowerCase();
      eng = (cur && cur !== 'none') ? cur : 'vosk';
    }
    invoke('cmd_voice_set_desired_engine', { engine: eng }).then(function () {
      return refreshTrayState();
    }).catch(function () {});
  }

  function persistVoiceEnd(on) {
    if (!invoke) return;
    invoke('cmd_voice_end_set_enabled', { enabled: !!on }).then(function () {
      return refreshTrayState();
    }).catch(function () {});
  }

  function persistPadFlags(opts) {
    opts = opts || {};
    var entry = resolveHubEntry();
    var m = entry && entry.mapping;
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !pad) return;
    if (opts.enabled != null) pad.enabled = !!opts.enabled;
    if (opts.overlayEnabled != null) pad.overlayEnabled = !!opts.overlayEnabled;
    clearTimeout(padFlagsTimer);
    padFlagsTimer = setTimeout(function () {
      invoke('cmd_codex_micro_pad_set_flags', {
        mappingId: String(m.id),
        enabled: !!pad.enabled,
        requireNumLockOff: !!pad.requireNumLockOff,
        overlayEnabled: pad.overlayEnabled !== false,
        requireForeground: pad.requireForeground !== false,
        navKeysEnabled: pad.showNavigationPad !== false && pad.navKeysEnabled !== false
      }).then(function () {
        return refreshTrayState();
      }).catch(function () {});
    }, 120);
  }

  function persistCameraQuiet(patch) {
    var cfg = readConfig();
    if (!cfg) return;
    if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
    if (patch.enabled != null) cfg.cameraPrefs.enabled = !!patch.enabled;
    if (patch.presenceEnabled != null) {
      if (!cfg.cameraPrefs.presenceActions) cfg.cameraPrefs.presenceActions = {};
      cfg.cameraPrefs.presenceActions.enabled = !!patch.presenceEnabled;
    }
    var persist = global.OneToneConfigPersist;
    if (persist && persist.saveCameraPrefsQuiet) {
      persist.saveCameraPrefsQuiet();
      setTimeout(refreshTrayState, 300);
    }
  }

  function wireMiniToggle(id, handler) {
    var el = $(id);
    if (!el || el.__otTraySwBound) return;
    el.__otTraySwBound = true;
    el.addEventListener('click', function () {
      var on = el.getAttribute('aria-checked') !== 'true';
      setMiniToggle(el, on);
      handler(on);
    });
  }

  function wireOnce() {
    if (mounted) return;
    mounted = true;

    ['softPadTrayChkEvent', 'softPadTrayShowVoice', 'softPadTrayShowKeys',
      'softPadTrayShowSoftPad', 'softPadTrayShowCamera'].forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', onLayoutChange);
    });

    document.querySelectorAll('.soft-pad-tray-ch-subtab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setChTab(tab.getAttribute('data-ch-tab'));
      });
    });
    setChTab(activeChTab);

    wireMiniToggle('softPadTraySwVoiceEngine', persistVoiceEngine);
    wireMiniToggle('softPadTraySwVoiceEnd', persistVoiceEnd);
    wireMiniToggle('softPadTraySwPadEnabled', function (on) { persistPadFlags({ enabled: on }); });
    wireMiniToggle('softPadTraySwPadOverlay', function (on) { persistPadFlags({ overlayEnabled: on }); });
    wireMiniToggle('softPadTraySwCamEnabled', function (on) { persistCameraQuiet({ enabled: on }); });
    wireMiniToggle('softPadTraySwCamPresence', function (on) { persistCameraQuiet({ presenceEnabled: on }); });

    [$('softPadTrayMicToggle'), $('softPadTrayInsMicToggle')].forEach(function (el) {
      if (!el) return;
      el.addEventListener('click', function () { trayAction('mic_toggle'); });
    });

    var pauseBtn = $('softPadTrayHeroPause');
    if (pauseBtn) pauseBtn.addEventListener('click', function () { trayAction('listen_toggle'); });
  }

  function onFaceEnter() {
    wireOnce();
    setChTab(activeChTab);
    loadCustomization().then(function () { return refreshTrayState(); });
  }

  function onFaceLeave() {
    if (layoutSaveTimer) {
      clearTimeout(layoutSaveTimer);
      layoutSaveTimer = 0;
      saveCustomization();
    }
  }

  global.OneToneSoftPadTrayUi = {
    onFaceEnter: onFaceEnter,
    onFaceLeave: onFaceLeave,
    refresh: refreshTrayState,
    getLayout: function () { return layout; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
