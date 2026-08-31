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
  var traySegs = ['global', 'mic', 'channels', 'event', 'schemes'];
  var trayListenUnsubs = [];

  function patchTraySeg(seg, payload) {
    if (!trayState) {
      trayState = { global: { mode: 'listening', activeChannelIds: [] }, mic: {}, channels: [], event: null };
    }
    if (seg === 'global') trayState.global = payload;
    else if (seg === 'mic') trayState.mic = payload;
    else if (seg === 'channels') trayState.channels = payload;
    else if (seg === 'event') trayState.event = payload;
    else if (seg === 'schemes') trayState.schemes = payload;
    syncPreview();
  }

  function applyTrayLayoutCfg(cfg) {
    if (!cfg) return;
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    if (V2 && cfg.version === V2.VERSION && cfg.blocks) {
      if (TCC && TCC.setTrayLayoutV2) TCC.setTrayLayoutV2(cfg);
      layout.showEvent = V2.blockVisible(cfg, 'block:event');
      layout.showInTray = V2.legacyShowInTray(cfg);
    } else if (V2) {
      var merged = V2.mergeLayoutWithCatalog(V2.migrateV1(cfg));
      if (TCC && TCC.setTrayLayoutV2) TCC.setTrayLayoutV2(merged.layout);
      layout.showEvent = V2.blockVisible(merged.layout, 'block:event');
      layout.showInTray = V2.legacyShowInTray(merged.layout);
    } else {
      layout.showEvent = cfg.showEvent !== false;
      var s = cfg.showInTray || cfg.show_in_tray || {};
      layout.showInTray.voice = s.voice !== false;
      layout.showInTray.keys = s.keys !== false;
      layout.showInTray.softPad = s.softPad !== false || s.soft_pad !== false;
      layout.showInTray.camera = !!(s.camera);
    }
    syncPreview();
  }

  function syncBlockVisibility() {
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    var lay = TCC && TCC.getTrayLayoutV2 ? TCC.getTrayLayoutV2() : null;
    if (!V2 || !lay) return;
    document.querySelectorAll('[data-block-id]').forEach(function (el) {
      var id = el.getAttribute('data-block-id');
      el.style.display = V2.blockVisible(lay, id) ? '' : 'none';
    });
    var head = $('softPadTrayChannelsHead');
    if (head) {
      var anyCh = V2.CHANNELS.some(function (ch) {
        return V2.blockVisible(lay, V2.channelBlockId(ch));
      });
      head.style.display = anyCh ? '' : 'none';
    }
  }

  function subscribeTrayLive() {
    var listen = global.OneToneIpc && global.OneToneIpc.listen;
    if (!invoke || !listen || trayListenUnsubs.length) return Promise.resolve();
    return Promise.all(traySegs.map(function (s) {
      return invoke('cmd_tray_subscribe_segment', { segment: s }).catch(function () {});
    })).then(function () {
      return listen('tray://patch', function (ev) {
        var p = ev.payload || {};
        if (p.segment) patchTraySeg(p.segment, p.payload);
      });
    }).then(function (unsub) {
      if (typeof unsub === 'function') trayListenUnsubs.push(unsub);
      return listen('tray://layout', function (ev) {
        applyTrayLayoutCfg(ev.payload || {});
      });
    }).then(function (unsub) {
      if (typeof unsub === 'function') trayListenUnsubs.push(unsub);
    }).catch(function () {});
  }

  function unsubscribeTrayLive() {
    trayListenUnsubs.forEach(function (fn) {
      if (typeof fn === 'function') fn();
    });
    trayListenUnsubs = [];
  }

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
    if (mode === 'silenced') return t('trayHeroSilenced', '静默中');
    if (mode === 'paused') return t('listenPaused', '已暂停监听');
    if (mode === 'error') return t('trayChPillUnavailable', '用不了');
    if (mode === 'listening') return t('trayChHeroListening', '正在听');
    return t('trayChHeroStandby', '等着');
  }

  function hasActiveHabit(g) {
    return !!(g && g.activeHabitId && g.activeHabitLabel && g.activeHabitLabel !== '—');
  }

  function setTrayText(id, key, fallback) {
    var el = $(id);
    if (el) el.textContent = t(key, fallback);
  }

  function syncTrayCopy() {
    setTrayText('softPadTrayChannelsHead', 'trayChSecHead', '各功能状态');
    setTrayText('softPadTrayTabSoftPadLbl', 'codexMicroPadTitle', '小键盘');
    setTrayText('softPadTrayCardPadTitle', 'codexMicroPadTitle', '小键盘');
    setTrayText('softPadTrayTabHabitsLbl', 'homeWbNavSchemes', '我的习惯');
    setTrayText('softPadTrayCardHabitsTitle', 'homeWbNavSchemes', '我的习惯');
    setTrayText('softPadTrayStatCamPresenceLbl', 'trayChStatCamPresence', '在不在');
    setTrayText('softPadTrayInspectorTitle', 'trayEditorTitle', '托盘编辑器');
  }

  function activeMapping() {
    var bridge = global.OneToneAppBridge;
    return bridge && bridge.getActiveMapping ? bridge.getActiveMapping() : null;
  }

  function camAutoMuteOn(cam) {
    var am = cam && cam.autoMute;
    return !!(am && (am.enabled || am === true));
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

  function statsForChannel(id, ch) {
    return cloneStats(ch);
  }

  function formatEventText(ev) {
    var TCC = global.OneToneTrayChannelControls;
    if (TCC && TCC.formatTrayEventText) return TCC.formatTrayEventText(ev);
    return (ev && ev.text) ? ev.text : t('trayChEventEmpty', '暂无动静');
  }

  function formatWeekTrend(weekTrend) {
    var TCC = global.OneToneTrayChannelControls;
    if (TCC && TCC.formatWeekTrendSummary) return TCC.formatWeekTrendSummary(weekTrend);
    return '';
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
    refreshControls(activeChTab);
  }

  var CHANNEL_DEEP_LINKS = {
    voice: 'voice',
    keys: 'keys',
    softpad: 'softPad',
    camera: 'camera'
  };

  function openSettings(opts) {
    var drawer = global.OneToneSettingsDrawer;
    if (!drawer) return;
    if (drawer.open) drawer.open(opts);
    else if (drawer.openSettings) drawer.openSettings(opts);
  }

  function handleTrayDeepLink(detail) {
    detail = detail || {};
    var href = String(detail.href || '').trim();
    var tab = String(detail.tab || '').trim();
    if (!href && tab) href = 'main:' + tab;
    if (!href) return;

    var path = href.indexOf('main:') === 0 ? href.slice(5) : href;
    if (path === 'home') {
      if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.close) {
        global.OneToneSettingsDrawer.close();
      }
      return;
    }
    if (path === 'habits' || path.indexOf('habits') === 0) {
      var wizard = href.indexOf('wizard=1') >= 0;
      openSettings({ panel: 'habits', habitWizard: wizard });
      return;
    }
    if (path === 'cmdk' || path.indexOf('cmdk') === 0) {
      if (global.__otCommandPalette && global.__otCommandPalette.openPalette) {
        global.__otCommandPalette.openPalette();
      }
      return;
    }
    if (path === 'settings') {
      openSettings({ panel: 'basic' });
      return;
    }
    if (path === 'diagnose') {
      openSettings({ panel: 'debug', debugMode: 'repair' });
      return;
    }

    var ch = CHANNEL_DEEP_LINKS[path.toLowerCase()] || CHANNEL_DEEP_LINKS[path];
    if (ch) {
      openSettings({ panel: 'tray' });
      setChTab(ch);
      if (mounted) refreshTrayState();
      return;
    }

    if (path === 'voice') openSettings({ panel: 'voiceWake' });
    else if (path === 'keys') openSettings({ panel: 'keys' });
    else if (path === 'camera') openSettings({ panel: 'camera' });
  }

  function readLayoutFromUI() {
    var ev = $('softPadTrayChkEvent');
    layout.showEvent = ev ? ev.checked : true;
    var TCC = global.OneToneTrayChannelControls;
    var channels = (TCC && TCC.LAYOUT_CHANNELS) || ['voice', 'keys', 'softPad', 'camera'];
    channels.forEach(function (ch) {
      var id = 'softPadTrayChkShow' + ch.charAt(0).toUpperCase() + ch.slice(1);
      var el = $(id);
      if (el) layout.showInTray[ch] = el.checked;
    });
    if (TCC && TCC.getTrayLayout) {
      var tl = TCC.getTrayLayout();
      tl.showEvent = layout.showEvent;
      channels.forEach(function (ch) { tl.showInTray[ch] = layout.showInTray[ch]; });
    }
  }

  function applyLayoutToUI() {
    if ($('softPadTrayChkEvent')) $('softPadTrayChkEvent').checked = layout.showEvent;
    var TCC = global.OneToneTrayChannelControls;
    if (TCC && TCC.syncTrayLayoutTogglesFromState) TCC.syncTrayLayoutTogglesFromState();
  }

  function mountLayoutToggles() {
    var host = $('softPadTrayLayoutChannels');
    var TCC = global.OneToneTrayChannelControls;
    if (!host || !TCC || !TCC.renderTrayLayoutToggles) return;
    TCC.renderTrayLayoutToggles(host, { onChange: onLayoutChange });
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

  function refreshControls(channel) {
    var TCC = global.OneToneTrayChannelControls;
    if (!TCC || !TCC.mountInspectorControls) return Promise.resolve();
    if (channel) return TCC.mountInspectorControls(channel, trayState);
    return TCC.mountAllInspectorControls(trayState);
  }

  var HERO_CHIP_LABEL = { voice: '语音', keys: '按键', softPad: '小键盘', camera: '摄像头' };

  function syncHeroPreview(g) {
    g = g || {};
    if ($('softPadTrayHeroText')) $('softPadTrayHeroText').textContent = heroLabel(g.mode);
    var ctxEl = $('softPadTrayHeroCtx');
    if (ctxEl) {
      if (!hasActiveHabit(g)) {
        ctxEl.textContent = t('trayHeroNoHabit', '未配置习惯');
      } else if (!g.userLabel || g.userLabel === '—') {
        ctxEl.textContent = t('trayHeroHabitOnly', '习惯「{name}」').replace('{name}', g.activeHabitLabel);
      } else {
        ctxEl.textContent = g.userLabel + ' · ' + t('trayHeroHabitOnly', '习惯「{name}」').replace('{name}', g.activeHabitLabel);
      }
    }
    var statsEl = $('softPadTrayHeroStats');
    if (statsEl) {
      if (!hasActiveHabit(g)) {
        statsEl.textContent = '';
        statsEl.hidden = true;
      } else {
        var total = g.todayTotalCount || 0;
        if (!total) {
          statsEl.textContent = t('trayTodayEmpty', '今日暂无');
        } else {
          var line = t('trayTodayTotal', '今日 {n} 次').replace('{n}', String(total));
          var hc = g.todayHabitCount || 0;
          if (hc > 0 && g.activeHabitLabel) {
            line += ' · ' + g.activeHabitLabel + ' ' + hc + t('trayTodayHabitSuffix', ' 次');
          }
          statsEl.textContent = line;
        }
        statsEl.hidden = false;
      }
    }
    var trendEl = $('softPadTrayHeroTrend');
    if (trendEl) {
      var trendLine = formatWeekTrend(g.weekTrend);
      trendEl.textContent = trendLine;
      trendEl.hidden = !trendLine;
    }
    var pauseBtn = $('softPadTrayHeroPause');
    if (pauseBtn) {
      pauseBtn.textContent = g.mode === 'paused' || g.mode === 'silenced'
        ? t('trayChHeroResume', '继续听')
        : t('trayChHeroPause', '先停一下');
    }
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
    syncBlockVisibility();
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
    syncTrayCopy();

    if ($('softPadTrayMicLabel')) {
      $('softPadTrayMicLabel').textContent = '麦克风 · ' + micLabel(mic);
    }
    setMiniToggle($('softPadTrayMicToggle'), mic.available && !mic.muted);

    var ev = trayState.event;
    var evCard = $('softPadTrayEventCard');
    if (evCard) evCard.hidden = !layout.showEvent;
    if ($('softPadTrayEventBody')) {
      $('softPadTrayEventBody').textContent = ev ? formatEventText(ev) : t('trayChEventEmpty', '暂无动静');
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
      applyTrayLayoutCfg(cfg);
    }).catch(function () {});
  }

  function saveCustomization() {
    if (!invoke) return Promise.resolve();
    var TCC = global.OneToneTrayChannelControls;
    if (TCC && TCC.saveCustomization) {
      return TCC.saveCustomization(TCC.getTrayLayoutV2 && TCC.getTrayLayoutV2());
    }
    return invoke('cmd_tray_customization_save', layoutPayload()).catch(function () {});
  }

  function trayAction(action) {
    if (!invoke) return;
    invoke('cmd_tray_action', { action: action, payload: null }).then(function () {
      return refreshTrayState();
    }).catch(function () {});
  }

  function injectChannelTabIcons() {
    var Icons = global.OneToneIcons;
    if (!Icons || !Icons.channelHtml) return;
    document.querySelectorAll('.soft-pad-tray-ch-subtab[data-ch-tab]').forEach(function (tab) {
      var ch = tab.getAttribute('data-ch-tab');
      var host = tab.querySelector('.soft-pad-tray-ch-subtab__ic');
      if (!host) {
        host = document.createElement('span');
        host.className = 'soft-pad-tray-ch-subtab__ic';
        host.setAttribute('aria-hidden', 'true');
        var lbl = tab.querySelector('.soft-pad-tray-ch-subtab__lbl');
        if (lbl) tab.insertBefore(host, lbl);
        else tab.insertBefore(host, tab.firstChild);
      }
      host.innerHTML = Icons.channelHtml(ch, { size: 13, className: 'ot-ic' });
    });
  }

  function wireOnce() {
    if (mounted) return;
    mounted = true;

    injectChannelTabIcons();

    var evChk = $('softPadTrayChkEvent');
    if (evChk) evChk.addEventListener('change', onLayoutChange);

    document.querySelectorAll('.soft-pad-tray-ch-subtab').forEach(function (tab) {
      tab.addEventListener('click', function () {
        setChTab(tab.getAttribute('data-ch-tab'));
      });
    });
    setChTab(activeChTab);

    var micToggle = $('softPadTrayMicToggle');
    if (micToggle) micToggle.addEventListener('click', function () { trayAction('mic_toggle'); });

    var pauseBtn = $('softPadTrayHeroPause');
    if (pauseBtn) pauseBtn.addEventListener('click', function () { trayAction('listen_toggle'); });

    document.querySelectorAll('.soft-pad-tray-ch-row[data-tray-ch]').forEach(function (row) {
      row.addEventListener('click', function () {
        setChTab(row.getAttribute('data-tray-ch'));
      });
    });

    var evCard = $('softPadTrayEventCard');
    if (evCard) {
      evCard.addEventListener('click', function () {
        handleTrayDeepLink({ href: 'main:diagnose' });
      });
    }

    if (!global.__otTrayChannelConfigBound) {
      global.__otTrayChannelConfigBound = true;
      global.addEventListener('channel-config:changed', function () {
        if (!mounted) return;
        refreshControls(activeChTab);
        refreshTrayState();
      });
    }
  }

  function onPanelEnter(opts) {
    opts = opts || {};
    wireOnce();
    syncTrayCopy();
    var editor = global.OneToneTrayLayoutEditor;
    var mountEditor = editor && editor.mount
      ? editor.mount({
          trayEditorFocus: opts.trayEditorFocus || null,
          onChange: syncPreview
        })
      : Promise.resolve();
    subscribeTrayLive().then(function () {
      return mountEditor;
    }).then(function () {
      return loadCustomization();
    }).then(function () {
      return refreshTrayState();
    });
  }

  function onPanelLeave() {
    unsubscribeTrayLive();
    var editor = global.OneToneTrayLayoutEditor;
    if (editor && editor.isDirty && editor.isDirty()) {
      editor.save();
    } else if (layoutSaveTimer) {
      clearTimeout(layoutSaveTimer);
      layoutSaveTimer = 0;
      saveCustomization();
    }
  }

  global.OneToneSoftPadTrayUi = {
    onPanelEnter: onPanelEnter,
    onPanelLeave: onPanelLeave,
    onFaceEnter: onPanelEnter,
    onFaceLeave: onPanelLeave,
    refresh: refreshTrayState,
    refreshControls: refreshControls,
    getLayout: function () { return layout; },
    handleDeepLink: handleTrayDeepLink,
    setChannelTab: setChTab
  };

  if (typeof window !== 'undefined' && !window.__otTrayDeepLinkBound) {
    window.__otTrayDeepLinkBound = true;
    window.addEventListener('tray-deep-link', function (ev) {
      handleTrayDeepLink(ev && ev.detail ? ev.detail : {});
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
