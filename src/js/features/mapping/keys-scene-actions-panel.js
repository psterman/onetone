/**
 * Keys page B —「本场景动作」dir dock.
 * Lists recognition + sibling custom-key actions for the app scenario.
 * 「新建动作」creates a new match mapping (does not overwrite habit trigger).
 */
(function (global) {
  'use strict';

  var state = {
    mappingId: '',
    bound: false
  };

  // Keys + Voice share the same dock; only the visible settings page paints.
  var HOSTS = [
    {
      panel: 'keysSceneActionsPanel',
      page: 'settingsPanelKeys',
      bodySel: '.keys-page-body',
      app: 'keysSceneActionsApp',
      appIcon: 'keysSceneActionsAppIcon',
      appName: 'keysSceneActionsAppName',
      meta: 'keysSceneActionsMeta',
      back: 'keysSceneActionsBack',
      dir: 'keysSceneActionsDir',
      detail: 'keysSceneActionsDetail',
      add: 'keysSceneActionsAdd'
    },
    {
      panel: 'voiceSceneActionsPanel',
      page: 'settingsPanelVoiceWake',
      bodySel: '.voice-page-body',
      app: 'voiceSceneActionsApp',
      appIcon: 'voiceSceneActionsAppIcon',
      appName: 'voiceSceneActionsAppName',
      meta: 'voiceSceneActionsMeta',
      back: 'voiceSceneActionsBack',
      dir: 'voiceSceneActionsDir',
      detail: 'voiceSceneActionsDetail',
      add: 'voiceSceneActionsAdd'
    }
  ];

  function t(key, fallback) {
    try {
      if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback || key;
  }

  function esc(s) {
    if (global.OneToneDom && global.OneToneDom.esc) return global.OneToneDom.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(id) {
    return global.document && global.document.getElementById
      ? global.document.getElementById(id)
      : null;
  }

  function mappingCore() {
    return global.OneToneMappingCore || null;
  }

  function mappingById(id) {
    var mid = String(id || '').trim();
    if (!mid) return null;
    var core = mappingCore();
    if (core && typeof core.byId === 'function') return core.byId(mid);
    try {
      var maps =
        (global.OneToneState &&
          global.OneToneState.state &&
          global.OneToneState.state.config &&
          global.OneToneState.state.config.mappings) ||
        [];
      for (var i = 0; i < maps.length; i++) {
        if (maps[i] && maps[i].id === mid) return maps[i];
      }
    } catch (_) {}
    return null;
  }

  function selectedMapping() {
    if (onVoicePage()) {
      try {
        var hdr = global.OneToneVoicePageHeaderRender;
        if (hdr && typeof hdr.resolveScopeMapping === 'function') {
          var scoped = hdr.resolveScopeMapping(null);
          if (scoped) return scoped;
        }
      } catch (_) {}
    }
    var core = mappingCore();
    if (core && typeof core.selected === 'function') return core.selected();
    try {
      var sid =
        global.OneToneState &&
        global.OneToneState.state &&
        global.OneToneState.state.selectedMappingId;
      return mappingById(sid);
    } catch (_) {}
    return null;
  }

  function isAppScenario(m) {
    var diff = global.OneToneHabitOverrideDiff;
    if (diff && typeof diff.isAppScenarioMapping === 'function') {
      return !!diff.isAppScenarioMapping(m);
    }
    return !!(m && String(m.appTargetId || '').trim());
  }

  function pageIsOpen(pageId) {
    var page = $(pageId);
    return !!(page && !page.hidden);
  }

  function activeHost() {
    var i;
    for (i = 0; i < HOSTS.length; i++) {
      if (pageIsOpen(HOSTS[i].page)) return HOSTS[i];
    }
    return HOSTS[0];
  }

  function hostBody(host) {
    if (!host) return null;
    try {
      var root = $(host.page);
      if (root && root.querySelector) {
        var body = root.querySelector(host.bodySel);
        if (body) return body;
      }
    } catch (_) {}
    var panel = $(host.panel);
    return (panel && panel.parentElement) || null;
  }

  function setVisible(show) {
    var active = activeHost();
    var i;
    for (i = 0; i < HOSTS.length; i++) {
      var host = HOSTS[i];
      var panel = $(host.panel);
      var body = hostBody(host);
      var showThis = !!(show && active && host.panel === active.panel && pageIsOpen(host.page));
      if (panel) panel.hidden = !showThis;
      if (body && body.classList) {
        if (showThis) body.classList.add('has-scene-panel');
        else body.classList.remove('has-scene-panel');
      }
    }
  }

  function openKeysPanelIfNeeded() {
    var ui = global.OneToneState && global.OneToneState.ui;
    if (!ui || ui.settingsPanel === 'keys') return;
    try {
      if (global.OneToneSettingsDrawer && typeof global.OneToneSettingsDrawer.open === 'function') {
        global.OneToneSettingsDrawer.open({ panel: 'keys' });
        return;
      }
    } catch (_) {}
    try {
      var hooks = global.__vp_bootstrap_hooks__ || {};
      if (typeof hooks.setSettingsPanel === 'function') hooks.setSettingsPanel('keys');
    } catch (_) {}
  }

  function onVoicePage() {
    var ui = global.OneToneState && global.OneToneState.ui;
    return !!(ui && ui.settingsPanel === 'voiceWake');
  }

  function appInfo(m) {
    var id = String((m && m.appTargetId) || '').trim();
    var presets = global.OneToneAppTargetPresets;
    var preset = presets && typeof presets.presetById === 'function' ? presets.presetById(id) : null;
    var name = id;
    if (preset) {
      name = t(preset.nameKey || '', preset.name || id);
      if (!name || name === preset.nameKey) name = preset.name || id;
    }
    return {
      id: id,
      name: name || t('keysSceneActionsAppFallback', '应用'),
      icon: preset && preset.icon ? String(preset.icon) : ''
    };
  }

  function labelForRow(m, slotId, actionId) {
    var A = global.OneToneAgentActions;
    var sid = String(slotId || '').trim();
    var aid = String(actionId || '').trim();
    if (A && sid) {
      if (typeof A.labelForSlotForMapping === 'function') {
        var mapped = String(A.labelForSlotForMapping(m, sid) || '').trim();
        if (mapped) return mapped;
      }
      if (typeof A.slotById === 'function' && typeof A.labelForSlot === 'function') {
        var slot = A.slotById(sid);
        var L = String(A.labelForSlot(slot) || '').trim();
        if (L) return L;
      }
    }
    return aid || sid || '?';
  }

  function describeBinding(channel, b) {
    if (!b) return '';
    var adapters = global.OneToneActionBindingAdapters;
    if (adapters && adapters[channel] && typeof adapters[channel].describeTrigger === 'function') {
      return String(adapters[channel].describeTrigger(b) || '').trim();
    }
    return String(b.triggerBinding || b.trigger || '').trim();
  }

  function recognitionTargetChord(m) {
    if (!m) return '';
    // Only concrete saved recognition — never inherited editorTarget defaults
    // (those painted empty stubs as "Right Alt" in 本场景动作).
    var tk = String(m.targetKey || '').trim();
    if (tk) return tk;
    var acts = Array.isArray(m.targetActions) ? m.targetActions : [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a && a.type === 'key' && String(a.value || '').trim()) {
        return String(a.value).trim();
      }
    }
    return '';
  }

  function friendlyTrigger(trig) {
    var raw = String(trig || '').trim();
    if (!raw) return t('badgeNotRecorded', '未设置');
    try {
      var kl = global.OneToneKeyLabels;
      if (kl && typeof kl.friendlyKeyName === 'function') return kl.friendlyKeyName(raw) || raw;
    } catch (_) {}
    return raw;
  }

  function targetActionsSummary(m) {
    var acts = Array.isArray(m && m.targetActions) ? m.targetActions : [];
    if (!acts.length) return t('keysCustomKeyMatchNoActions', '尚无动作');
    return String(acts.length) + t('keysCustomKeyMatchSteps', '步');
  }

  function imeInfo(m) {
    var id = String((m && m.imePresetId) || '').trim();
    var Ime = global.OneToneImePresets;
    var preset = Ime && typeof Ime.presetById === 'function' ? Ime.presetById(id) : null;
    if (preset) {
      return {
        id: preset.id,
        name: t(preset.nameKey || preset.shortKey || '', preset.id),
        icon: String(preset.icon || '').trim()
      };
    }
    return {
      id: '',
      name: t('imePresetCustom', '自定义'),
      icon: ''
    };
  }

  function hasConcreteConfig(m) {
    if (!m) return false;
    if (String(m.triggerKey || '').trim()) return true;
    if (String(m.imePresetId || '').trim()) return true;
    if (String(m.targetKey || '').trim()) return true;
    if (Array.isArray(m.targetActions) && m.targetActions.length) return true;
    return false;
  }

  function isCustomKeyMatchMapping(m) {
    if (!m) return false;
    try {
      var picker = global.OneToneKeysChannelCommandPicker;
      if (picker && typeof picker.isCustomKeyMatchMapping === 'function') {
        return !!picker.isCustomKeyMatchMapping(m);
      }
    } catch (_) {}
    var acts = Array.isArray(m.targetActions) && m.targetActions.length > 0;
    var ref = m.captureHeroRef;
    var kindCustom =
      ref &&
      typeof ref === 'object' &&
      String(ref.kind || '')
        .trim()
        .toLowerCase() === 'customkey';
    return !!(acts || kindCustom);
  }

  function listAppMappings(anchor) {
    var appId = String((anchor && anchor.appTargetId) || '').trim();
    if (!appId) return [];
    // Full app peers (voice + custom) — do not reuse filtered 我录的键 list.
    var maps =
      (global.OneToneState &&
        global.OneToneState.state &&
        global.OneToneState.state.config &&
        global.OneToneState.state.config.mappings) ||
      [];
    var keepId = '';
    try {
      keepId = String(state.mappingId || '').trim();
      if (!keepId) {
        var sel = selectedMapping();
        if (sel) keepId = String(sel.id || '').trim();
      }
    } catch (_) {}
    var out = [];
    for (var j = 0; j < maps.length; j++) {
      var m = maps[j];
      if (!m || String(m.appTargetId || '').trim() !== appId) continue;
      // Hide empty 新建动作 voice stubs — but always keep「我录的键」rows (1/2…).
      if (
        !hasConcreteConfig(m) &&
        !isCustomKeyMatchMapping(m) &&
        String(m.id || '') !== keepId
      ) {
        continue;
      }
      out.push(m);
    }
    return out;
  }

  function recognitionDisplay(m) {
    var live = recognitionTargetChord(m);
    if (live) return live;
    var acts = Array.isArray(m && m.targetActions) ? m.targetActions : [];
    if (acts.length) return targetActionsSummary(m);
    return '';
  }

  function isVoiceInputMapping(m) {
    if (!m) return false;
    // 「我录的键」peers keep custom names in 本场景动作 — never fold into 语音输入.
    if (isCustomKeyMatchMapping(m)) return false;
    if (String(m.imePresetId || '').trim()) return true;
    var acts = Array.isArray(m.targetActions) ? m.targetActions : [];
    if (acts.length) return false;
    if (String(m.targetKey || '').trim()) return true;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || String(b.triggerType || '') !== 'key') continue;
      var sid = String(b.slotId || '').trim();
      var aid = String(b.actionId || '').trim();
      if (sid === 'pushToTalk' || aid === 'startDictation' || aid === 'input.start') return true;
    }
    return false;
  }

  /** Peer rows for every mapping under this app — each is its own 01/02. */
  function buildRows(m) {
    if (!m) return [];
    var maps = listAppMappings(m);
    var lang =
      global.OneToneI18n && global.OneToneI18n.getLang ? global.OneToneI18n.getLang() : 'zh';
    var rows = [];
    for (var i = 0; i < maps.length; i++) {
      var sm = maps[i];
      if (!sm || !sm.id) continue;
      var trig = String(sm.triggerKey || '').trim();
      var recog = recognitionDisplay(sm);
      // Prototype parity: list shows trigger × gesture, not 01→02 chord.
      var trigLine = '';
      if (global.OneToneKeyLabels && global.OneToneKeyLabels.triggerDisplayLabel) {
        trigLine = global.OneToneKeyLabels.triggerDisplayLabel(sm, lang) || '';
      }
      if (!trigLine && trig) trigLine = friendlyTrigger(trig);
      if (!trigLine) trigLine = t('badgeNotRecorded', '未设置');
      if (isVoiceInputMapping(sm)) {
        rows.push({
          key: 'voice:' + String(sm.id),
          mappingId: String(sm.id),
          slotId: 'pushToTalk',
          actionId: 'startDictation',
          kind: 'recognition',
          label: t('keysSceneActionsVoiceLabel', '语音输入'),
          binds: { key: trigLine },
          ime: imeInfo(sm),
          summary: '',
          unset: !trig
        });
      } else {
        var matchName = '';
        try {
          var pickerName = global.OneToneKeysChannelCommandPicker;
          if (pickerName && typeof pickerName.customKeyMatchDisplayName === 'function') {
            matchName = String(pickerName.customKeyMatchDisplayName(sm) || '').trim();
          }
        } catch (_) {}
        if (!matchName) matchName = String(sm.label || '').trim();
        if (!matchName || /→|->/.test(matchName) || /^AutoTrigger\b/i.test(matchName)) {
          matchName = t('keysCustomKeyMatchTitle', '按键匹配');
        }
        rows.push({
          key: 'match:' + String(sm.id),
          mappingId: String(sm.id),
          slotId: '',
          actionId: '',
          kind: 'customKey',
          label: matchName,
          binds: { key: trigLine },
          ime: null,
          summary: '',
          unset: !trig
        });
      }
    }
    return rows;
  }

  function findRow(rows, key) {
    var k = String(key || '').trim();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === k) return rows[i];
    }
    return null;
  }

  function imeBadgeHtml(ime) {
    if (!ime) return '';
    var icon = ime.icon
      ? '<img class="keys-scene-actions__ime-ico" src="' +
        esc(ime.icon) +
        '" alt="" width="16" height="16" />'
      : '';
    return (
      '<span class="keys-scene-actions__ime">' +
      icon +
      '<span class="keys-scene-actions__ime-name">' +
      esc(ime.name || '') +
      '</span></span>'
    );
  }

  function jumpToEdit(row) {
    var page = global.OneToneKeysPageState;
    var picker = global.OneToneKeysChannelCommandPicker;
    var core = mappingCore();
    var mid = row && row.mappingId ? String(row.mappingId) : '';
    // Focus the row's mapping so 01/02 are that pair — peers don't steal each other.
    if (mid && core && typeof core.focus === 'function') {
      try {
        core.focus(mid);
      } catch (_) {}
    } else if (mid && global.OneToneState && global.OneToneState.state) {
      global.OneToneState.state.selectedMappingId = mid;
    }
    if (mid) state.mappingId = mid;
    // Voice page: voice-input rows stay here; custom-key peers jump to Keys.
    if (onVoicePage()) {
      if (row && row.kind === 'customKey') {
        openKeysPanelIfNeeded();
      } else {
        paint();
        try {
          if (global.OneToneVoiceSettingsFlow && global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender) {
            global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
          }
        } catch (_) {}
        return;
      }
    }
    if (row && row.kind === 'customKey') {
      if (page && typeof page.setStep === 'function') {
        try {
          page.setStep('target', { skipSheet: true });
        } catch (_) {}
      }
      if (picker && typeof picker.setActiveTab === 'function') {
        try {
          picker.setActiveTab('key', { skipHeroClear: true });
        } catch (_) {}
      }
      if (picker && typeof picker.applyHero === 'function') {
        try {
          picker.applyHero();
        } catch (_) {}
      }
    } else {
      if (page && typeof page.setStep === 'function') {
        try {
          page.setStep('target', { skipSheet: true });
        } catch (_) {}
      }
      if (picker) {
        try {
          if (typeof picker.clearSelection === 'function') {
            picker.clearSelection({ skipRender: true, skipHero: true, skipPersist: true });
          }
          if (typeof picker.setActiveTab === 'function') {
            picker.setActiveTab('ime', { skipHeroClear: true });
          }
          if (typeof picker.applyHero === 'function') picker.applyHero();
          if (typeof picker.syncRecognitionEditorPreview === 'function') {
            picker.syncRecognitionEditorPreview();
          }
          if (typeof picker.refresh === 'function') picker.refresh();
        } catch (_) {}
      }
    }
    var target =
      row && row.kind === 'customKey'
        ? $('habitKeyMapRowTarget') || $('keysDeskPanel')
        : $('habitKeyMapRowTarget') || $('keysDeskPanel');
    if (target && target.scrollIntoView) {
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
    }
  }

  function startNewAction() {
    openKeysPanelIfNeeded();
    var picker = global.OneToneKeysChannelCommandPicker;
    var created = null;
    var createFn =
      picker && typeof picker.createVoiceInputMapping === 'function'
        ? picker.createVoiceInputMapping
        : picker && typeof picker.createCustomKeyMatchMapping === 'function'
          ? picker.createCustomKeyMatchMapping
          : null;
    if (createFn) {
      try {
        created = createFn.call(picker);
      } catch (_) {
        created = null;
      }
    }
    if (!created || !created.id) {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
        }
      } catch (_) {}
      return;
    }
    var newId = String(created.id);
    state.mappingId = newId;
    var page = global.OneToneKeysPageState;
    if (page && typeof page.setStep === 'function') {
      try {
        page.setStep('trigger', { skipSheet: true });
      } catch (_) {}
    }
    if (picker && typeof picker.setActiveTab === 'function') {
      try {
        picker.setActiveTab('ime', { skipHeroClear: true });
      } catch (_) {}
    }
    setTimeout(function () {
      var Rec = global.OneToneMappingRecording;
      if (Rec && typeof Rec.startTrigger === 'function') {
        try {
          Rec.startTrigger(newId);
        } catch (_) {}
      } else {
        var boot = global.__vp_bootstrap_hooks__ || {};
        if (typeof boot.startTriggerRecord === 'function') {
          try {
            boot.startTriggerRecord();
          } catch (_) {}
        }
      }
      var table = global.OneToneHabitKeyMappingTable;
      if (table && typeof table.highlightRow === 'function') {
        try {
          table.highlightRow('trigger');
        } catch (_) {}
      }
      paint();
    }, 0);
    try {
      if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
        global.OneToneApp.toast(
          t(
            'keysSceneActionsAddTriggerHint',
            '已新建动作 · 请录 01 触发；02 请选择输入法或识别键'
          )
        );
      }
    } catch (_) {}
    var target = $('habitKeyMapCellTrigger') || $('habitKeyMapRowTrigger') || $('keysDeskPanel');
    if (target && target.scrollIntoView) {
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
    }
  }

  function paintApp(m, host) {
    host = host || activeHost();
    var wrap = $(host.app);
    var ico = $(host.appIcon);
    var nameEl = $(host.appName);
    if (!wrap) return;
    var info = appInfo(m);
    if (!info.id) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    if (nameEl) nameEl.textContent = info.name;
    if (ico) {
      if (info.icon) {
        ico.src = info.icon;
        ico.hidden = false;
      } else {
        ico.removeAttribute('src');
        ico.hidden = true;
      }
    }
  }

  function paintMeta(m, host) {
    host = host || activeHost();
    var meta = $(host.meta);
    if (!meta) return;
    var n = buildRows(m).length;
    meta.textContent = t('keysSceneActionsMetaCount', '{n} 个动作').replace('{n}', String(n));
  }

  function paintChrome(m, host) {
    host = host || activeHost();
    var panel = $(host.panel);
    if (!panel) return;
    panel.setAttribute('data-panel', 'dir');
    var back = $(host.back);
    var dir = $(host.dir);
    var detail = $(host.detail);
    if (back) back.hidden = true;
    if (dir) dir.hidden = false;
    if (detail) detail.hidden = true;
    paintApp(m, host);
    paintMeta(m, host);
  }

  function paintDir(rows, host) {
    host = host || activeHost();
    var dirHost = $(host.dir);
    if (!dirHost) return;
    var list =
      !rows.length
        ? '<p class="keys-scene-actions__empty">' +
          esc(t('keysSceneActionsEmptyKeys', '还没有动作 · 点下方新建')) +
          '</p>'
        : '<div class="keys-scene-actions__grp" data-group="input">' +
          '<div class="keys-scene-actions__grp-h">' +
          esc(t('keysSceneActionsGroupInput', '输入')) +
          '</div>' +
          rows
            .map(function (a) {
              var v = (a.binds && a.binds.key) || '';
              var trail = a.ime ? imeBadgeHtml(a.ime) : '';
              var on = String(a.mappingId || '') === String(state.mappingId || '');
              return (
                '<button type="button" class="keys-scene-actions__dir-item' +
                (a.unset ? ' is-unset' : '') +
                (on ? ' is-active' : '') +
                '" role="listitem" data-jump="' +
                esc(a.key) +
                '">' +
                '<span class="keys-scene-actions__body">' +
                '<span class="keys-scene-actions__n">' +
                esc(a.label) +
                '</span>' +
                '<span class="keys-scene-actions__s' +
                (a.unset ? '' : ' is-ok') +
                '">' +
                esc(v) +
                '</span>' +
                '</span>' +
                '<span class="keys-scene-actions__dot' +
                (a.unset ? ' is-off' : '') +
                '" aria-hidden="true"></span>' +
                (trail
                  ? '<span class="keys-scene-actions__trail">' + trail + '</span>'
                  : '') +
                '</button>'
              );
            })
            .join('') +
          '</div>';
    dirHost.innerHTML = list;
    var addBtn = $(host.add);
    if (addBtn) {
      addBtn.textContent = '＋ ' + t('keysSceneActionsAdd', '新建动作');
    }
  }

  function paint() {
    var m = mappingById(state.mappingId);
    if (!m || !isAppScenario(m)) {
      setVisible(false);
      return;
    }
    setVisible(true);
    var host = activeHost();
    var rows = buildRows(m);
    paintChrome(m, host);
    paintDir(rows, host);
  }

  function onPanelClick(e) {
    var tEl = e.target;
    if (!tEl) return;
    if (tEl.closest && tEl.closest('[data-add]')) {
      e.preventDefault();
      startNewAction();
      return;
    }
    var jumpBtn = tEl.closest && tEl.closest('[data-jump]');
    if (jumpBtn) {
      e.preventDefault();
      var m = mappingById(state.mappingId);
      var rows = m ? buildRows(m) : [];
      var row = findRow(rows, jumpBtn.getAttribute('data-jump'));
      jumpToEdit(row || { kind: 'recognition', key: 'pushToTalk' });
    }
  }

  function bindOnce() {
    if (state.bound) return;
    state.bound = true;
    var i;
    for (i = 0; i < HOSTS.length; i++) {
      var panel = $(HOSTS[i].panel);
      if (panel && panel.addEventListener) panel.addEventListener('click', onPanelClick);
    }
  }

  function render(mapping) {
    bindOnce();
    var m = mapping || selectedMapping();
    if (!m || !isAppScenario(m)) {
      state.mappingId = '';
      setVisible(false);
      return;
    }
    state.mappingId = String(m.id || '').trim();
    paint();
  }

  function refresh() {
    if (!state.mappingId) {
      render(selectedMapping());
      return;
    }
    paint();
  }

  global.OneToneKeysSceneActionsPanel = {
    render: render,
    refresh: refresh,
    jumpToEdit: jumpToEdit,
    startNewAction: startNewAction,
    buildRows: buildRows,
    isVisibleFor: isAppScenario
  };
})(typeof window !== 'undefined' ? window : globalThis);
