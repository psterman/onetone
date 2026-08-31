/**
 * Soft Pad Face 3 — tray editor: preview left + subtab switch cards right.
 */
(function (global) {
  'use strict';

  var invoke = global.OneToneIpc && global.OneToneIpc.invoke;
  var trayState = null;
  var mounted = false;
  var activeTab = 'habit';
  var persona = 'compact';
  var trayListenUnsubs = [];
  var traySegs = ['global', 'mic', 'channels', 'schemes'];
  var saveFlashTimer = null;
  var syncPulseTimer = null;

  var CHANNELS = ['habit', 'voice', 'keys', 'softPad', 'camera'];
  var CH_LABEL = { habit: '当前习惯', voice: '语音', keys: '按键', softPad: '小键盘', camera: '摄像头' };
  var CH_ICON = { habit: '📋', voice: '🎤', keys: '⌨', softPad: '▦', camera: '📷' };
  var PREVIEW_HOST = {
    voice: 'softPadTrayPreviewVoice',
    keys: 'softPadTrayPreviewKeys',
    softPad: 'softPadTrayPreviewSoftPad',
    camera: 'softPadTrayPreviewCamera'
  };
  var HABITS_LINK_LABEL = '跳转「我的习惯」查看详情';

  function t(key, fallback) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s || '').replace(/</g, '&lt;');
  }

  function flashSaveIndicator() {
    var el = $('softPadTraySaveIndicator');
    if (!el) return;
    el.classList.add('is-saved');
    clearTimeout(saveFlashTimer);
    saveFlashTimer = setTimeout(function () { el.classList.remove('is-saved'); }, 600);
  }

  function pulsePreviewSync() {
    var shell = $('softPadTrayPreviewShell');
    if (!shell) return;
    shell.classList.add('is-sync-pulse');
    clearTimeout(syncPulseTimer);
    syncPulseTimer = setTimeout(function () { shell.classList.remove('is-sync-pulse'); }, 500);
  }

  function channels() {
    return (trayState && trayState.channels) || [];
  }

  function channelById(ch) {
    return channels().find(function (x) { return x.id === ch; }) || {};
  }

  function mappingById(id) {
    id = String(id || '').trim();
    if (!id) return null;
    var core = global.OneToneMappingCore;
    if (core && core.byId) return core.byId(id);
    var st = global.OneToneState && global.OneToneState.state;
    var maps = (st && st.config && st.config.mappings) || [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && maps[i].id === id) return maps[i];
    }
    return null;
  }

  function habitName(m) {
    if (!m) return '';
    var scope = global.OneToneSettingsScopeSwitch;
    if (scope && scope.habitScopeDisplayName) return scope.habitScopeDisplayName(m);
    if (scope && scope.habitName) return scope.habitName(m);
    var hub = global.OneToneHabitHub;
    if (hub && hub.habitName) return hub.habitName(m);
    return String(m.group || m.label || m.id || '').trim() || '—';
  }

  function runtimeSceneId() {
    var rt = global.OneToneRuntimeHabitControl;
    if (rt && rt.resolveActiveSceneId) {
      var fg = rt.foregroundIdentity ? rt.foregroundIdentity() : null;
      return String(rt.resolveActiveSceneId(fg) || '').trim();
    }
    var st = global.OneToneState && global.OneToneState.state;
    return String((st && st.config && st.config.activeSceneId) || '').trim();
  }

  function resolveHabitDisplay() {
    var g = (trayState && trayState.global) || {};
    var activeId = String(g.activeHabitId || runtimeSceneId() || '').trim();
    var m = mappingById(activeId);
    var habitLabel = (g.activeHabitLabel && g.activeHabitLabel !== '—')
      ? g.activeHabitLabel
      : (m ? habitName(m) : t('trayHeroNoHabit', '未配置习惯'));
    var appName = '';
    if (m) appName = habitName(m);
    else if (g.userLabel && g.userLabel !== '—') appName = g.userLabel;
    if (!appName) appName = t('homeWbChipUniversal', '通用设置');
    return {
      hasHabit: !!(activeId || (habitLabel && habitLabel !== '—' && habitLabel !== t('trayHeroNoHabit', '未配置习惯'))),
      habitLabel: habitLabel,
      appName: appName
    };
  }

  function openHabitsPanel() {
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.open) drawer.open({ panel: 'habits' });
    else if (drawer && drawer.openSettings) drawer.openSettings({ panel: 'habits' });
  }

  function patchTraySeg(seg, payload) {
    if (!trayState) trayState = { global: {}, mic: {}, channels: [], schemes: [] };
    if (seg === 'global') trayState.global = payload;
    else if (seg === 'mic') trayState.mic = payload;
    else if (seg === 'channels') trayState.channels = payload;
    else if (seg === 'schemes') trayState.schemes = payload;
    syncPreview();
    if (seg === 'global' || seg === 'schemes') renderChannelPanel();
  }

  function syncPreviewBlockOrder(lay) {
    var shell = $('softPadTrayPreviewShell');
    if (!lay || !shell) return;
    var blocks = (lay.blocks || []).slice().sort(function (a, b) { return a.order - b.order; });
    var head = $('softPadTrayChannelsHead');
    var seps = shell.querySelectorAll('.soft-pad-tray-sep');
    var sepCh = seps[0];
    var sepMic = seps[1];
    var channelStarted = false;
    blocks.forEach(function (b) {
      var isCh = b.id.indexOf('block:channel:') === 0;
      if (isCh && !channelStarted) {
        channelStarted = true;
        if (sepCh) shell.appendChild(sepCh);
        if (head) shell.appendChild(head);
      }
      if (b.id === 'block:mic' && sepMic) shell.appendChild(sepMic);
      if (b.id === 'block:scene') {
        var scene = $('softPadTraySceneBlock');
        if (scene) shell.appendChild(scene);
      }
      if (isCh) {
        var ch = b.id.slice('block:channel:'.length);
        var host = $(PREVIEW_HOST[ch]);
        if (host) shell.appendChild(host);
      }
      if (b.id === 'block:mic') {
        var mic = $('softPadTrayMicRow');
        if (mic) shell.appendChild(mic);
      }
      if (b.id === 'block:footer') {
        var ft = $('softPadTrayPreviewFooter');
        if (ft) shell.appendChild(ft);
      }
    });
  }

  function applyTrayLayoutCfg(cfg) {
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    if (!V2 || !cfg) return;
    var merged = V2.mergeLayoutWithCatalog(cfg.version === V2.VERSION ? cfg : V2.migrateV1(cfg));
    if (TCC && TCC.setTrayLayoutV2) TCC.setTrayLayoutV2(merged.layout);
    syncBlockVisibility(merged.layout);
    syncPreviewBlockOrder(merged.layout);
    syncPreview();
    renderSubtabs();
    renderChannelPanel();
    syncPersonaSegUI();
    var dirty = merged.newBlocks > 0 || merged.newControls > 0 || merged.repaired;
    if (dirty && invoke) {
      invoke('cmd_tray_customization_save', merged.layout).then(function () {
        flashSaveIndicator();
      }).catch(function () {});
    }
  }

  function anyChannelVisible(lay) {
    var V2 = global.OneToneTrayLayoutV2;
    if (!V2 || !lay) return false;
    return ['voice', 'keys', 'softPad', 'camera'].some(function (ch) {
      return V2.blockVisible(lay, V2.channelBlockId(ch));
    });
  }

  function syncBlockVisibility(lay) {
    var V2 = global.OneToneTrayLayoutV2;
    if (!V2 || !lay) return;
    document.querySelectorAll('[data-block-id]').forEach(function (el) {
      var id = el.getAttribute('data-block-id');
      if (id === 'block:sep-ch') {
        el.style.display = anyChannelVisible(lay) ? '' : 'none';
        return;
      }
      if (id === 'block:sep-mic') {
        el.style.display = (anyChannelVisible(lay) || V2.blockVisible(lay, 'block:mic')) ? '' : 'none';
        return;
      }
      if (id.indexOf('block:') === 0) {
        el.style.display = V2.blockVisible(lay, id) ? '' : 'none';
      }
    });
    var head = $('softPadTrayChannelsHead');
    if (head) head.style.display = anyChannelVisible(lay) ? '' : 'none';
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
    trayListenUnsubs.forEach(function (fn) { if (typeof fn === 'function') fn(); });
    trayListenUnsubs = [];
  }

  function renderPreviewFooter() {
    var host = $('softPadTrayPreviewFooter');
    var TF = global.OneToneTrayFooter;
    if (!host || !TF) return;
    var links = (trayState && trayState.deepLinks) || TF.defaultLinks();
    host.innerHTML = TF.renderFooterHtml(links, { previewOnly: true });
    TF.bindFooter(host, { previewOnly: true });
  }

  function renderChannelSkeleton(host) {
    if (!host) return;
    host.innerHTML = '<div class="tray-preview-skeleton"><span class="tray-preview-skeleton__dot"></span>加载通道…</div>';
  }

  function todayByChannel() {
    var g = (trayState && trayState.global) || {};
    return g.todayByChannel || g.today_by_channel || {};
  }

  function channelUsage(ch) {
    var u = todayByChannel();
    if (ch === 'softPad') return u.softPad || u.soft_pad || 0;
    return u[ch] || 0;
  }

  function wirePreviewChannelClicks() {
    var shell = $('softPadTrayPreviewShell');
    if (!shell || shell.__otPreviewChBound) return;
    shell.__otPreviewChBound = true;
    shell.addEventListener('click', function (e) {
      var block = e.target.closest('.ch-block');
      if (!block) return;
      if (e.target.closest('.sw-toggle, .ch-fold-btn, .more, .toggle-switch, [data-ctrl], .tray-ft__act, .ch-actions')) return;
      var hostEl = block.parentElement;
      if (!hostEl || !hostEl.id) return;
      var ch = null;
      Object.keys(PREVIEW_HOST).forEach(function (id) {
        if (PREVIEW_HOST[id] === hostEl.id) ch = id;
      });
      if (ch) setTab(ch);
    });
  }

  function syncPreview() {
    var SP = global.OneToneTrayScenePreset;
    if (SP) SP.renderSceneBlock($('softPadTraySceneBlock'), { onRefresh: syncPreview });
    var TCC = global.OneToneTrayChannelControls;
    ['voice', 'keys', 'softPad', 'camera'].forEach(function (ch) {
      var host = $(PREVIEW_HOST[ch]);
      if (!host) return;
      if (!TCC || !trayState) {
        renderChannelSkeleton(host);
        return;
      }
      TCC.renderOsTrayBlock(host, ch, trayState, { onRefresh: syncPreview });
    });
    if (trayState) {
      var mic = trayState.mic || {};
      var micBtn = $('softPadTrayMicToggle');
      var micRow = $('softPadTrayMicRow');
      var micMeta = $('softPadTrayMicMeta');
      if (micRow) {
        micRow.classList.toggle('is-muted', !!mic.muted);
        micRow.classList.toggle('is-disabled', !mic.available);
      }
      if (micMeta) {
        micMeta.textContent = !mic.available ? '不可用' : (mic.muted ? '静音' : (mic.device || '默认'));
      }
      if (micBtn) {
        micBtn.classList.toggle('on', !mic.muted);
        micBtn.setAttribute('aria-checked', mic.muted ? 'false' : 'true');
      }
      renderPreviewFooter();
      wirePreviewChannelClicks();
    }
  }

  function trayStatusHtml(ch) {
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    var lay = TCC && TCC.getTrayLayoutV2 ? TCC.getTrayLayoutV2() : null;
    if (!V2 || !lay) return '';
    var on = V2.blockVisible(lay, V2.channelBlockId(ch));
    return '<span class="ch-tray-pill' + (on ? '' : ' ch-tray-pill--off') + '">' + (on ? '已在托盘' : '不在托盘') + '</span>';
  }

  function renderSubtabs() {
    var host = $('softPadTrayChSubtabs');
    if (!host) return;
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    var lay = TCC && TCC.getTrayLayoutV2 ? TCC.getTrayLayoutV2() : null;
    host.innerHTML = CHANNELS.map(function (ch) {
      var off = false;
      if (ch !== 'habit' && V2 && lay) off = !V2.blockVisible(lay, V2.channelBlockId(ch));
      return '<button type="button" class="tray-ch-subtab' + (ch === activeTab ? ' is-active' : '') + (off ? ' is-off' : '') +
        '" data-tab="' + ch + '" role="tab"><span class="tray-ch-subtab__ic">' + CH_ICON[ch] + '</span>' +
        '<span class="tray-ch-subtab__lbl">' + CH_LABEL[ch] + '</span></button>';
    }).join('');
    host.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTab(btn.getAttribute('data-tab')); });
    });
  }

  function renderStatsOverviewHtml() {
    return ['voice', 'keys', 'softPad', 'camera'].map(function (ch) {
      var c = channelById(ch);
      var stats = c.stats || [];
      var usage = channelUsage(ch);
      var meta = String(c.meta || '').trim();
      var rows = meta
        ? '<div class="stats-overview-card__row"><span class="k">状态</span><span class="v">' + esc(meta) + '</span></div>'
        : stats.slice(0, 2).map(function (s) {
          return '<div class="stats-overview-card__row"><span class="k">' + esc(s.label) + '</span><span class="v">' + esc(s.value) + '</span></div>';
        }).join('');
      if (!rows) {
        rows = '<div class="stats-overview-card__row"><span class="k">状态</span><span class="v muted">—</span></div>';
      }
      return '<button type="button" class="stats-overview-card" data-go-ch="' + ch + '">' +
        '<div class="stats-overview-card__head"><span class="stats-overview-card__ic">' + CH_ICON[ch] + '</span>' + CH_LABEL[ch] +
        (usage > 0 ? ' <span class="usage-chip">今日 ' + usage + '</span>' : '') + '</div>' +
        rows + '</button>';
    }).join('');
  }

  function renderHabitPanel(host) {
    var g = (trayState && trayState.global) || {};
    var hd = resolveHabitDisplay();
    var total = g.todayTotalCount || 0;
    var usageChips = ['voice', 'keys', 'softPad', 'camera'].map(function (ch) {
      var n = channelUsage(ch);
      if (!n) return '';
      return '<span class="usage-chip">' + CH_LABEL[ch] + ' ' + n + '</span>';
    }).filter(Boolean).join('');
    var chStatRows = ['voice', 'keys', 'softPad', 'camera'].map(function (ch) {
      var n = channelUsage(ch);
      return '<div class="stat"><span class="k">' + CH_LABEL[ch] + '</span><span class="v">' + n + '</span></div>';
    }).join('');
    host.innerHTML = '<div class="ch-card is-focus">' +
      '<div class="ch-card-head"><span class="ch-card-ic habit">' + CH_ICON.habit + '</span>' +
      '<div class="ch-card-title"><b>当前习惯</b>' + (hd.hasHabit ? '<span class="st-pill on">正在使用</span>' : '') + '</div></div>' +
      '<div class="habit-head"><div class="habit-head__title">' +
      (hd.hasHabit ? '正在使用 · ' + esc(hd.habitLabel) : esc(hd.habitLabel)) +
      '</div><div class="habit-head__sub">应用场景 · ' + esc(hd.appName) + ' · 今日合计 ' + total + ' 次</div>' +
      (usageChips ? '<div class="usage-chips" style="margin-top:5px">' + usageChips + '</div>' : '') +
      '</div>' +
      '<div class="sec-label">四通道一览 <span>只读 · 点卡片进通道调开关</span></div>' +
      '<div class="stats-overview">' + renderStatsOverviewHtml() + '</div>' +
      '<div class="sec-label">本日用量</div>' +
      '<div class="ch-stats">' +
        '<div class="stat"><span class="k">合计</span><span class="v">' + total + ' 次</span></div>' +
        chStatRows +
      '</div>' +
      '<button type="button" class="go-link" id="softPadTrayOpenHabitsLink">' + HABITS_LINK_LABEL + '</button>' +
      '</div>';
    host.querySelectorAll('[data-go-ch]').forEach(function (btn) {
      btn.addEventListener('click', function () { setTab(btn.getAttribute('data-go-ch')); });
    });
    var link = host.querySelector('#softPadTrayOpenHabitsLink');
    if (link) link.addEventListener('click', openHabitsPanel);
  }

  function renderChannelPanel() {
    var host = $('softPadTrayChannelPanel');
    if (!host) return;
    if (activeTab === 'habit') {
      renderHabitPanel(host);
      return;
    }
    var TCC = global.OneToneTrayChannelControls;
    if (!TCC) return;
    var ic = activeTab === 'softPad' ? 'softpad' : activeTab;
    host.innerHTML = '';
    var wrap = document.createElement('div');
    wrap.className = 'ch-card is-focus';
    wrap.innerHTML = '<div class="ch-card-head"><span class="ch-card-ic ' + ic + '">' +
      CH_ICON[activeTab] + '</span><div class="ch-card-title"><b>' + CH_LABEL[activeTab] + '</b>' +
      trayStatusHtml(activeTab) + '</div></div>' +
      '<div class="sec-label">开关</div>';
    host.appendChild(wrap);
    var cardsHost = document.createElement('div');
    wrap.appendChild(cardsHost);
    TCC.renderSwitchCards(cardsHost, activeTab, { surface: 'editor' }, {
      onChange: function () {
        var SP = global.OneToneTrayScenePreset;
        if (SP) SP.onManualSwitchChange();
        syncPreview();
        pulsePreviewSync();
        flashSaveIndicator();
        if (SP) SP.renderSceneBlock($('softPadTraySceneBlock'), { onRefresh: syncPreview });
      }
    });
  }

  function setTab(ch) {
    activeTab = ch || 'habit';
    var TCC = global.OneToneTrayChannelControls;
    if (TCC && TCC.setPreviewFocusChannel) {
      TCC.setPreviewFocusChannel(ch === 'habit' ? null : ch);
    }
    renderSubtabs();
    renderChannelPanel();
    syncPreview();
  }

  function syncPersonaSegUI() {
    var seg = $('softPadTrayPersonaSeg');
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    if (!seg || !V2 || !TCC) return;
    var lay = TCC.getTrayLayoutV2();
    if (!lay) return;
    persona = V2.inferPersonaFromLayout(lay);
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-persona') === persona);
    });
  }

  function applyPersona(p) {
    var V2 = global.OneToneTrayLayoutV2;
    persona = V2 ? V2.normalizePersona(p || persona) : (p || 'compact');
    var TCC = global.OneToneTrayChannelControls;
    if (!V2 || !TCC) return Promise.resolve();
    var lay = V2.applyPersonaPreset(TCC.getTrayLayoutV2() || V2.defaultLayout(), persona);
    return invoke('cmd_tray_customization_save', lay).then(function () {
      TCC.setTrayLayoutV2(lay);
      syncBlockVisibility(lay);
      syncPreviewBlockOrder(lay);
      renderSubtabs();
      syncPreview();
      pulsePreviewSync();
      flashSaveIndicator();
      syncPersonaSegUI();
      return invoke('cmd_tray_runtime_save', { trayScenePreset: 'custom', customSwitchSnapshot: {}, personaPreset: persona });
    }).catch(function () {});
  }

  function loadCustomization() {
    return invoke('cmd_tray_customization_get').then(function (cfg) {
      applyTrayLayoutCfg(cfg || {});
      var V2 = global.OneToneTrayLayoutV2;
      var TCC = global.OneToneTrayChannelControls;
      var lay = TCC && TCC.getTrayLayoutV2 ? TCC.getTrayLayoutV2() : null;
      if (V2 && lay && !anyChannelVisible(lay)) {
        return applyPersona('compact');
      }
      return global.OneToneTrayScenePreset ? global.OneToneTrayScenePreset.loadRuntime() : null;
    }).then(function () {
      syncPersonaSegUI();
    }).catch(function () {});
  }

  function ensureChannelsVisible() {
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    var lay = TCC && TCC.getTrayLayoutV2 ? TCC.getTrayLayoutV2() : null;
    if (V2 && lay && !anyChannelVisible(lay)) {
      return applyPersona('compact');
    }
    return Promise.resolve();
  }

  function refreshTrayState() {
    return invoke('cmd_tray_menu_ready').then(function (raw) {
      var data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      trayState = {
        global: data.global || {},
        mic: data.mic || {},
        channels: data.channels || [],
        deepLinks: data.deepLinks || [],
        schemes: data.schemes || []
      };
      syncPreview();
      renderChannelPanel();
    }).catch(function () {});
  }

  function wireOnce() {
    if (mounted) return;
    mounted = true;
    var seg = $('softPadTrayPersonaSeg');
    if (seg) {
      seg.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-persona]');
        if (!btn) return;
        seg.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b === btn); });
        applyPersona(btn.getAttribute('data-persona'));
      });
    }
    var micToggle = $('softPadTrayMicToggle');
    if (micToggle) {
      micToggle.addEventListener('click', function () {
        invoke('cmd_tray_action', { action: 'mic_toggle', payload: null }).then(refreshTrayState);
      });
    }
    if (!global.__otTrayChannelConfigBound) {
      global.__otTrayChannelConfigBound = true;
      global.addEventListener('channel-config:changed', function () {
        if (!mounted) return;
        syncPreview();
        pulsePreviewSync();
        renderChannelPanel();
      });
    }
    renderSubtabs();
  }

  function onPanelEnter(opts) {
    opts = opts || {};
    wireOnce();
    subscribeTrayLive().then(function () {
      return loadCustomization();
    }).then(function () {
      return refreshTrayState();
    }).then(function () {
      return ensureChannelsVisible();
    }).then(function () {
      setTab(opts.trayEditorFocus || 'habit');
    });
  }

  function onPanelLeave() {
    unsubscribeTrayLive();
  }

  global.OneToneSoftPadTrayUi = {
    onPanelEnter: onPanelEnter,
    onPanelLeave: onPanelLeave,
    onFaceEnter: onPanelEnter,
    onFaceLeave: onPanelLeave,
    refresh: refreshTrayState,
    refreshControls: function () { renderChannelPanel(); syncPreview(); },
    setChannelTab: setTab
  };
})(typeof window !== 'undefined' ? window : globalThis);
