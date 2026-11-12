/**
 * Keys sequence desk — Mac Keys shell: left catalog / mid trigger+steps.
 * Catalog faces: ime (挂载按键页输入法方案) | seq (动作序列).
 */
(function (global) {
  'use strict';

  var triggerRecordArming = false;
  /** Catalog face: ime (听写方式 first) | seq (动作序列). */
  var catalogFace = 'ime';
  /** Home slot for #keysChannelPaneRight while hosted in keysSeq. */
  var imeHomeParent = null;
  var imeHomeNext = null;

  function t(key, fallback) {
    if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function appLang() {
    try {
      if (global.OneToneI18n && typeof global.OneToneI18n.getLang === 'function') {
        return global.OneToneI18n.getLang() === 'en' ? 'en' : 'zh';
      }
    } catch (_) {}
    return 'zh';
  }

  function friendlyKey(key) {
    key = String(key || '').trim();
    if (!key) return '';
    var lang = appLang();
    if (global.OneToneKeyLabels && global.OneToneKeyLabels.friendlyKeyName) {
      try {
        return global.OneToneKeyLabels.friendlyKeyName(key, lang) || key;
      } catch (_) {}
    }
    var hooks = global.__vp_mapping_core_hooks__ || {};
    if (hooks.friendlyKeyName) {
      try {
        return hooks.friendlyKeyName(key) || key;
      } catch (_) {}
    }
    return key;
  }

  function mappingById(id) {
    var mid = String(id || '').trim();
    if (!mid) return null;
    var core = global.OneToneMappingCore;
    if (core && typeof core.byId === 'function') {
      try {
        return core.byId(mid);
      } catch (_) {}
    }
    var maps = configMaps();
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && String(maps[i].id) === mid) return maps[i];
    }
    return null;
  }

  /** Current app for this desk: selected → active scene → FG preset → editor. */
  function resolveCurrentAppId(anchor) {
    var app = String((anchor && anchor.appTargetId) || '').trim();
    if (app) return app;
    try {
      var core = global.OneToneMappingCore;
      var scene = core && typeof core.activeScene === 'function' ? core.activeScene() : null;
      app = String((scene && scene.appTargetId) || '').trim();
      if (app) return app;
    } catch (_) {}
    try {
      var ed = global.OneToneMappingEditorState;
      if (ed && typeof ed.getKeysExpandedAppId === 'function') {
        app = String(ed.getKeysExpandedAppId() || '').trim();
        if (app) return app;
      }
      if (ed && typeof ed.getEditorAppTargetId === 'function') {
        app = String(ed.getEditorAppTargetId() || '').trim();
        if (app) return app;
      }
    } catch (_) {}
    try {
      var st = global.OneToneState && global.OneToneState.state;
      var pin = st && (st.foregroundPin || st.foregroundApp);
      app = String(
        (pin && (pin.matchedPresetAppId || pin.matched_preset_app_id || pin.appId)) || ''
      ).trim();
      if (app) return app;
    } catch (_) {}
    return '';
  }

  function selectedHabit() {
    var core = global.OneToneMappingCore;
    if (core && typeof core.selected === 'function') {
      try {
        return core.selected();
      } catch (_) {}
    }
    var st = global.OneToneState && global.OneToneState.state;
    var id = st && st.selectedMappingId;
    if (id && core && core.byId) return core.byId(id);
    return null;
  }

  /** Prefer a mapping that belongs to the current app so the desk matches FG. */
  function ensureAppScopedSelection() {
    var cur = selectedHabit();
    var appId = resolveCurrentAppId(cur);
    if (!appId) return cur;
    if (cur && String(cur.appTargetId || '').trim() === appId) return cur;
    // Don't yank focus off an in-progress blank「新动作」.
    if (cur && !mappingHasChainContent(cur)) return cur;
    var maps = configMaps();
    var hit = null;
    var i;
    for (i = 0; i < maps.length; i++) {
      var m = maps[i];
      if (!m || !m.id || isPromptInject(m)) continue;
      if (String(m.appTargetId || '').trim() !== appId) continue;
      if (mappingHasChainContent(m)) {
        hit = m;
        break;
      }
      if (!hit) hit = m;
    }
    if (!hit || (cur && String(hit.id) === String(cur.id))) return cur;
    var core = global.OneToneMappingCore;
    if (core && typeof core.focus === 'function') {
      try {
        core.focus(hit.id);
      } catch (_) {
        if (global.OneToneState && global.OneToneState.state) {
          global.OneToneState.state.selectedMappingId = hit.id;
        }
      }
    } else if (global.OneToneState && global.OneToneState.state) {
      global.OneToneState.state.selectedMappingId = hit.id;
    }
    return mappingById(hit.id) || hit;
  }

  function configMaps() {
    var st = global.OneToneState && global.OneToneState.state;
    var cfg = (st && st.config) || (global.OneToneState && global.OneToneState.cfg) || {};
    return Array.isArray(cfg.mappings) ? cfg.mappings : [];
  }

  function isPromptInject(m) {
    try {
      var P = global.OneToneKeysChannelCommandPicker;
      if (P && typeof P.isPromptInjectMapping === 'function') return !!P.isPromptInjectMapping(m);
    } catch (_) {}
    return false;
  }

  /** Stable group so 新建动作 peers still list together when appTargetId is empty. */
  function keysSeqFamilyId(m) {
    if (!m) return '';
    var fam = String(m.keysSeqFamilyId || '').trim();
    if (fam) return fam;
    var app = String(m.appTargetId || '').trim();
    if (app) return app;
    return String(m.id || '').trim();
  }

  function ensureKeysSeqFamily(m) {
    if (!m || !m.id) return '';
    if (!String(m.keysSeqFamilyId || '').trim()) {
      m.keysSeqFamilyId = keysSeqFamilyId(m);
    }
    return String(m.keysSeqFamilyId || '').trim();
  }

  function mappingHasChainContent(m) {
    if (!m) return false;
    if (String(m.triggerKey || '').trim()) return true;
    return Array.isArray(m.targetActions) && m.targetActions.length > 0;
  }

  function persistMaps(source) {
    try {
      var core = global.OneToneMappingCore;
      if (core && typeof core.flushAllEditor === 'function') core.flushAllEditor();
    } catch (_) {}
    try {
      if (global.OneToneConfigPersist && typeof global.OneToneConfigPersist.save === 'function') {
        global.OneToneConfigPersist.save({ source: source || 'keys-seq' });
      }
    } catch (_) {}
  }

  /** Custom-key sequences for this channel (Mac left rail · 动作序列). */
  function listSavedActions(anchor) {
    var picker = global.OneToneKeysChannelCommandPicker;
    if (picker && typeof picker.listCustomKeyMappingsForCurrentApp === 'function') {
      try {
        var live = picker.listCustomKeyMappingsForCurrentApp();
        if (Array.isArray(live)) return live;
      } catch (_) {}
    }
    if (!anchor) return [];
    var appId = resolveCurrentAppId(anchor) || String(anchor.appTargetId || '').trim();
    var maps = configMaps();
    var out = [];
    var i;
    for (i = 0; i < maps.length; i++) {
      var m = maps[i];
      if (!m || !m.id) continue;
      if (isPromptInject(m)) continue;
      if (picker && typeof picker.isCustomKeyMatchMapping === 'function') {
        try {
          if (!picker.isCustomKeyMatchMapping(m)) continue;
        } catch (_) {
          continue;
        }
      }
      if (appId && String(m.appTargetId || '').trim() !== appId) continue;
      out.push(m);
    }
    out.sort(function (a, b) {
      return Number(a.order || 0) - Number(b.order || 0);
    });
    return out;
  }

  function actionDisplayName(m) {
    try {
      var P = global.OneToneKeysChannelCommandPicker;
      if (P && typeof P.customKeyMatchDisplayName === 'function') {
        var n = String(P.customKeyMatchDisplayName(m) || '').trim();
        if (n) return n;
      }
    } catch (_) {}
    var lab = String((m && (m.name || m.label)) || '').trim();
    if (lab && !/→|->/.test(lab) && !/^AutoTrigger\b/i.test(lab)) return lab;
    return t('keysSceneActionsNewBlankLabel', '新动作');
  }

  function hasImeStep(acts) {
    var i;
    for (i = 0; i < (acts || []).length; i++) {
      if (acts[i] && String(acts[i].type || '') === 'ime') return true;
    }
    return false;
  }

  /**
   * One-shot legacy migrate: empty chain + habit-level imePresetId/targetKey →
   * first ime step. Never re-inject when the user already has steps (text/key/…)
   * or deleted the ime row — that used to resurrect「语音输入法」on every render.
   */
  function ensureImeStepOnHabit(m) {
    if (!m || !m.id) return false;
    var acts = Array.isArray(m.targetActions) ? m.targetActions.slice() : [];
    if (hasImeStep(acts)) return false;
    // Chain already configured without IME — respect it.
    if (acts.length > 0) return false;
    var presetId = String(m.imePresetId || '').trim();
    var chord = String(m.targetKey || '').trim();
    if (!presetId && !chord) return false;
    if (!chord && presetId && global.OneToneImePresets && global.OneToneImePresets.presetById) {
      try {
        var p = global.OneToneImePresets.presetById(presetId);
        if (p && p.targetKey) chord = String(p.targetKey).trim();
      } catch (_) {}
    }
    if (!chord && !presetId) return false;
    acts.unshift({
      type: 'ime',
      presetId: presetId,
      value: chord,
      aim: 'auto',
      finish: 'confirm',
      ms: 2000
    });
    m.targetActions = acts;
    var HT = global.OneToneHomeTargetActions;
    if (HT && typeof HT.commit === 'function') {
      try {
        HT.commit(m.id, acts);
      } catch (_) {}
    } else if (global.OneToneConfigPersist && global.OneToneConfigPersist.save) {
      try {
        global.OneToneConfigPersist.save({ source: 'keys-seq-migrate' });
      } catch (_) {}
    }
    return true;
  }

  function syncDeskClass() {
    var p = document.getElementById('settingsPanelKeysSeq');
    if (!p) return;
    p.classList.add('keys-page-desk');
    var body = document.getElementById('keysSeqPageBody');
    if (body) {
      body.classList.add('keys-page-body--two-col');
      body.classList.remove('keys-page-body--three-col', 'has-scene-panel');
    }
  }

  function habitFolderOf(m) {
    var folder = String((m && (m.keysSeqFolder || m.group)) || '').trim();
    if (folder && folder !== '通用设置') return folder;
    return '改内容';
  }

  function sceneFolderLabel(m) {
    var appId = resolveCurrentAppId(m);
    if (!appId) return '';
    try {
      if (global.OneToneAppTargetPresets && global.OneToneAppTargetPresets.presetById) {
        var pr = global.OneToneAppTargetPresets.presetById(appId);
        var base = pr && (pr.title || pr.name || pr.id) ? String(pr.title || pr.name || pr.id).trim() : '';
        if (base) {
          return /场景$/.test(base) ? base : base + t('keysSeqSceneSuffix', ' 场景');
        }
      }
    } catch (_) {}
    return '';
  }

  function syncHabitFolderOptions(folderSel, m) {
    if (!folderSel) return;
    var fixed = ['改内容', 'AI 助手', '听写', '工作区'];
    var scene = sceneFolderLabel(m);
    var cur = habitFolderOf(m);
    var wanted = fixed.slice();
    if (scene && wanted.indexOf(scene) < 0) wanted.push(scene);
    if (cur && wanted.indexOf(cur) < 0) wanted.push(cur);
    var html = wanted
      .map(function (v) {
        return '<option value="' + esc(v) + '">' + esc(v) + '</option>';
      })
      .join('');
    if (folderSel.innerHTML !== html) folderSel.innerHTML = html;
    folderSel.value = cur;
    if (folderSel.value !== cur && cur) {
      folderSel.insertAdjacentHTML(
        'beforeend',
        '<option value="' + esc(cur) + '">' + esc(cur) + '</option>'
      );
      folderSel.value = cur;
    }
  }

  function paintTrigger(m) {
    var view = document.getElementById('keysSeqTriggerView');
    var disp = document.getElementById('keysSeqTriggerDisplay');
    var pill = document.getElementById('keysSeqHabitPill');
    var summary = document.getElementById('keysSeqMidSummary');
    var nameIn = document.getElementById('keysSeqSeqName');
    var folderSel = document.getElementById('keysSeqHabitFolder');
    var recLab = document.getElementById('keysSeqRecordTriggerLab');
    var trig = m ? String(m.triggerKey || '').trim() : '';
    var steps = m && Array.isArray(m.targetActions) ? m.targetActions.length : 0;
    var name = actionDisplayName(m);
    var label = '';
    if (trig && global.OneToneKeyLabels && typeof global.OneToneKeyLabels.triggerBaseLabel === 'function') {
      try {
        label = String(global.OneToneKeyLabels.triggerBaseLabel(m, appLang()) || '').trim();
      } catch (_) {}
    }
    if (!label) label = trig ? friendlyKey(trig) : t('keysStatusUnset', '未设置');
    if (view) view.textContent = label || t('keysStatusUnset', '未设置');
    if (disp) {
      disp.classList.toggle('empty', !trig);
      if (global.OneToneKeyIcons && typeof global.OneToneKeyIcons.syncDisplayIcon === 'function') {
        try {
          global.OneToneKeyIcons.syncDisplayIcon(disp, trig || '');
        } catch (_) {}
      }
    }
    if (pill) {
      var appId = resolveCurrentAppId(m);
      var appName = '';
      if (appId && global.OneToneAppTargetPresets && global.OneToneAppTargetPresets.presetById) {
        try {
          var pr = global.OneToneAppTargetPresets.presetById(appId);
          appName = pr && (pr.title || pr.name || pr.id) ? String(pr.title || pr.name || pr.id) : '';
        } catch (_) {}
      }
      pill.textContent = m
        ? (appName ? appName + ' · ' : '') + name
        : t('keysSeqNeedHabit', '请先选择习惯');
    }
    if (nameIn && document.activeElement !== nameIn) {
      nameIn.value = m ? name : '';
      nameIn.disabled = !m;
    }
    if (folderSel && document.activeElement !== folderSel) {
      syncHabitFolderOptions(folderSel, m);
      folderSel.disabled = !m;
    }
    if (recLab) {
      recLab.textContent = trig
        ? t('keysSeqRetrigger', '重新录入')
        : t('keysSeqRecordTrigger', '录制触发键');
    }
    // Mac path: option + D → 粘贴并回车 · 4
    if (summary) {
      if (!m) {
        summary.textContent = '—';
      } else {
        var trigLab = trig ? label : t('badgeNotRecorded', '未设置');
        summary.innerHTML = '';
        summary.appendChild(document.createTextNode(trigLab + ' → '));
        var b = document.createElement('b');
        b.textContent = name;
        summary.appendChild(b);
        summary.appendChild(
          document.createTextNode(
            ' · ' +
              (steps
                ? String(steps)
                : t('keysCustomKeyMatchNoActions', '尚无动作'))
          )
        );
      }
    }
    var row = document.getElementById('keysSeqTriggerRow');
    if (row) {
      var rec = global.OneToneMappingRecording;
      var mode = rec && typeof rec.mode === 'function' ? rec.mode() : 'none';
      row.classList.toggle('is-recording-active', mode === 'trigger');
    }
  }

  function paintActions(m) {
    // Live Keys custom-key detail owns steps when face=seq; keep legacy host empty.
    var host = document.getElementById('keysSeqActions');
    if (host) {
      host.hidden = true;
      host.innerHTML = '';
    }
    if (catalogFace !== 'seq') return;
    void m;
    try {
      var picker = global.OneToneKeysChannelCommandPicker;
      if (picker && typeof picker.refreshKeysTargetActions === 'function') {
        picker.refreshKeysTargetActions();
      }
    } catch (_) {}
  }

  function findDictationPeer(anchor) {
    var appId = resolveCurrentAppId(anchor);
    var maps = configMaps();
    var i;
    var fallback = null;
    for (i = 0; i < maps.length; i++) {
      var m = maps[i];
      if (!m || !m.id || isPromptInject(m)) continue;
      if (appId && String(m.appTargetId || '').trim() !== appId) continue;
      if (String(m.imePresetId || '').trim() || String(m.targetKey || '').trim()) {
        if (!mappingHasChainContent(m) || String(m.imePresetId || '').trim()) return m;
        if (!fallback) fallback = m;
      }
    }
    return fallback;
  }

  function paintDictation(anchor) {
    var peer = findDictationPeer(anchor) || anchor;
    var trig = peer ? String(peer.triggerKey || '').trim() : '';
    var target = peer ? String(peer.targetKey || '').trim() : '';
    var preset = peer ? String(peer.imePresetId || '').trim() : '';
    var trigLab = trig ? friendlyKey(trig) : t('badgeNotRecorded', '未设置');
    var targetLab = target ? friendlyKey(target) : t('badgeNotRecorded', '未设置');
    var presetLab = preset;
    if (preset && global.OneToneImePresets && global.OneToneImePresets.presetById) {
      try {
        var p = global.OneToneImePresets.presetById(preset);
        if (p && (p.title || p.name)) presetLab = String(p.title || p.name);
      } catch (_) {}
    }
    var subEl = document.getElementById('keysSeqImeCardSub');
    if (subEl) {
      subEl.textContent =
        trigLab +
        ' → ' +
        (targetLab !== t('badgeNotRecorded', '未设置') ? targetLab : presetLab || targetLab);
    }
    var card = document.getElementById('keysSeqImeCard');
    if (card) {
      card.classList.toggle('is-active', catalogFace === 'ime');
      card.setAttribute('aria-pressed', catalogFace === 'ime' ? 'true' : 'false');
    }
  }

  function hostsImeScheme() {
    var ui = global.OneToneState && global.OneToneState.ui;
    return !!(ui && ui.settingsPanel === 'keysSeq' && catalogFace === 'ime');
  }

  function hostsCustomKey() {
    var ui = global.OneToneState && global.OneToneState.ui;
    return !!(ui && ui.settingsPanel === 'keysSeq' && catalogFace === 'seq');
  }

  /** True while 动作链 mid hosts live Keys chrome (IME or 自定义键). */
  function hostsLiveKeysChrome() {
    return hostsImeScheme() || hostsCustomKey();
  }

  function mountLivePane(hostId) {
    var host = document.getElementById(hostId);
    var pane = document.getElementById('keysChannelPaneRight');
    if (!host || !pane) return false;
    if (pane.parentElement !== host) {
      if (!imeHomeParent) {
        imeHomeParent = pane.parentElement;
        imeHomeNext = pane.nextSibling;
      }
      host.appendChild(pane);
    }
    return true;
  }

  function unmountImeScheme() {
    var pane = document.getElementById('keysChannelPaneRight');
    if (!pane || !imeHomeParent) return;
    if (imeHomeNext && imeHomeNext.parentNode === imeHomeParent) {
      imeHomeParent.insertBefore(pane, imeHomeNext);
    } else {
      imeHomeParent.appendChild(pane);
    }
    imeHomeParent = null;
    imeHomeNext = null;
  }

  function refreshImeSchemePaint() {
    try {
      if (global.OneToneKeysPageState && typeof global.OneToneKeysPageState.setStep === 'function') {
        global.OneToneKeysPageState.setStep('target', { smooth: false });
      }
    } catch (_) {}
    try {
      var picker = global.OneToneKeysChannelCommandPicker;
      if (picker && typeof picker.setActiveTab === 'function') {
        picker.setActiveTab('ime', { skipHeroClear: true });
      } else if (picker && typeof picker.refresh === 'function') {
        picker.refresh();
      }
    } catch (_) {}
    try {
      if (global.OneToneHabitKeyMappingTable && global.OneToneHabitKeyMappingTable.mount) {
        global.OneToneHabitKeyMappingTable.mount();
      }
    } catch (_) {}
    try {
      var finish = global.OneToneKeyFinishFlowRender;
      if (finish && typeof finish.renderKeyFinishFlowPanel === 'function') {
        finish.renderKeyFinishFlowPanel();
      }
    } catch (_) {}
    try {
      if (global.OneToneImePresets && typeof global.OneToneImePresets.refresh === 'function') {
        global.OneToneImePresets.refresh('mapping');
      }
    } catch (_) {}
    try {
      var kui = global.OneToneKeysPanelUi;
      if (kui && typeof kui.render === 'function') kui.render();
    } catch (_) {}
  }

  function refreshCustomKeyPaint() {
    try {
      if (global.OneToneKeysPageState && typeof global.OneToneKeysPageState.setStep === 'function') {
        global.OneToneKeysPageState.setStep('target', { smooth: false });
      }
    } catch (_) {}
    try {
      var picker = global.OneToneKeysChannelCommandPicker;
      if (!picker) return;
      if (typeof picker.setActiveTab === 'function') {
        picker.setActiveTab('key', { skipHeroClear: true });
      }
      var cur = selectedHabit();
      var editId =
        typeof picker.getCustomKeyMatchEditId === 'function'
          ? String(picker.getCustomKeyMatchEditId() || '').trim()
          : '';
      if (
        cur &&
        typeof picker.isCustomKeyMatchMapping === 'function' &&
        picker.isCustomKeyMatchMapping(cur)
      ) {
        if (typeof picker.setCustomKeyMatchEditId === 'function') {
          picker.setCustomKeyMatchEditId(cur.id, { skipRefresh: true });
        }
      } else if (
        (!editId || !mappingById(editId)) &&
        typeof picker.listCustomKeyMappingsForCurrentApp === 'function'
      ) {
        var rows = picker.listCustomKeyMappingsForCurrentApp() || [];
        if (rows[0] && rows[0].id && typeof picker.setCustomKeyMatchEditId === 'function') {
          picker.setCustomKeyMatchEditId(rows[0].id, { skipRefresh: true });
        }
      }
      if (typeof picker.refreshKeysTargetActions === 'function') {
        picker.refreshKeysTargetActions();
      } else if (typeof picker.refresh === 'function') {
        picker.refresh();
      }
    } catch (_) {}
    try {
      var kui = global.OneToneKeysPanelUi;
      if (kui && typeof kui.render === 'function') kui.render();
    } catch (_) {}
  }

  function paintCatalogFace() {
    var imeDesk = document.getElementById('keysSeqImeDesk');
    var seqDesk = document.getElementById('keysSeqSeqDesk');
    var root = document.getElementById('settingsPanelKeysSeq');
    var isIme = catalogFace === 'ime';
    if (root) {
      root.classList.toggle('is-ime-face', isIme);
      root.classList.toggle('is-seq-face', !isIme);
    }
    if (imeDesk) imeDesk.hidden = !isIme;
    if (seqDesk) seqDesk.hidden = isIme;
    var card = document.getElementById('keysSeqImeCard');
    if (card) {
      card.classList.toggle('is-active', isIme);
      card.setAttribute('aria-pressed', isIme ? 'true' : 'false');
    }
    var list = document.getElementById('keysSeqSavedList');
    if (list) {
      list.querySelectorAll('.keys-seq-saved-card').forEach(function (el) {
        if (isIme) el.classList.remove('is-active');
      });
    }
    if (isIme) {
      mountLivePane('keysSeqImeHost');
      refreshImeSchemePaint();
    } else {
      mountLivePane('keysSeqKeyHost');
      refreshCustomKeyPaint();
    }
  }

  function setCatalogFace(face) {
    catalogFace = face === 'seq' ? 'seq' : 'ime';
    paintCatalogFace();
  }

  function paintSavedList(m) {
    var list = document.getElementById('keysSeqSavedList');
    var countEl = document.getElementById('keysSeqSavedCount');
    if (!list) return;
    var rows = listSavedActions(m);
    var curId = m && m.id ? String(m.id) : '';
    if (countEl) countEl.textContent = String(rows.length);
    list.hidden = false;
    if (!rows.length) {
      list.innerHTML =
        '<div class="keys-seq-saved-empty">' +
        esc(t('keysSeqSavedEmpty', '还没有已存动作')) +
        '</div>';
      return;
    }
    list.innerHTML = rows
      .map(function (row) {
        var trig = String(row.triggerKey || '').trim();
        var trigLab = trig ? friendlyKey(trig) : t('badgeNotRecorded', '未设置');
        var name = actionDisplayName(row);
        var steps = Array.isArray(row.targetActions) ? row.targetActions.length : 0;
        var sub =
          trigLab +
          ' · ' +
          (steps
            ? steps + t('keysCustomKeyMatchSteps', '步')
            : t('keysCustomKeyMatchNoActions', '尚无动作'));
        var on = catalogFace === 'seq' && String(row.id) === curId;
        return (
          '<div class="keys-seq-saved-card' +
          (on ? ' is-active' : '') +
          '" data-seq-card="' +
          esc(row.id) +
          '" role="listitem">' +
          '<div class="keys-seq-saved-card-main">' +
          '<button type="button" class="keys-seq-saved-item" data-seq-select="' +
          esc(row.id) +
          '">' +
          '<span class="keys-seq-saved-name">' +
          esc(name) +
          '</span>' +
          '<span class="keys-seq-saved-steps">' +
          esc(sub) +
          '</span></button>' +
          '<button type="button" class="keys-seq-saved-del" data-seq-del="' +
          esc(row.id) +
          '" title="' +
          esc(t('homeKeyMapActionDelete', '删除')) +
          '" aria-label="' +
          esc(t('homeKeyMapActionDelete', '删除')) +
          '">×</button></div></div>'
        );
      })
      .join('');
  }

  function selectSaved(id) {
    var mid = String(id || '').trim();
    if (!mid) return;
    catalogFace = 'seq';
    var row = mappingById(mid);
    var core = global.OneToneMappingCore;
    if (core && typeof core.focus === 'function') {
      try {
        core.focus(mid);
      } catch (_) {
        if (global.OneToneState && global.OneToneState.state) {
          global.OneToneState.state.selectedMappingId = mid;
        }
      }
    } else if (global.OneToneState && global.OneToneState.state) {
      global.OneToneState.state.selectedMappingId = mid;
    }
    try {
      var picker = global.OneToneKeysChannelCommandPicker;
      if (picker && typeof picker.setCustomKeyMatchEditId === 'function') {
        picker.setCustomKeyMatchEditId(mid, { skipRefresh: true });
      }
    } catch (_) {}
    // Re-read after focus — paint from the loaded peer so keycap / steps never stay stale.
    var m = mappingById(mid) || row || selectedHabit();
    if (m && !m.enabled && mappingHasChainContent(m)) {
      try {
        if (global.OneToneMappingEditActions && global.OneToneMappingEditActions.setMappingEnabled) {
          global.OneToneMappingEditActions.setMappingEnabled(m.id, true);
        } else {
          m.enabled = true;
        }
        persistMaps('keys-seq-select-enable');
      } catch (_) {
        m.enabled = true;
      }
    }
    syncDeskClass();
    bindOnce();
    paintTrigger(m);
    paintSavedList(m);
    paintDictation(m);
    paintCatalogFace();
  }

  function deleteSaved(id) {
    var mid = String(id || '').trim();
    if (!mid) return;
    var rows = listSavedActions(selectedHabit());
    var cur = selectedHabit();
    var isCur = cur && String(cur.id) === mid;
    var picker = global.OneToneKeysChannelCommandPicker;
    var shared = global.OneToneHabitShared;
    var ok = false;
    if (picker && typeof picker.deleteCustomKeyMatch === 'function') {
      try {
        ok = !!picker.deleteCustomKeyMatch(mid);
      } catch (_) {}
    }
    if (!ok && shared && typeof shared.deleteMapping === 'function') {
      try {
        shared.deleteMapping(mid);
        ok = true;
      } catch (_) {}
    }
    if (!ok) {
      var maps = configMaps();
      var next = maps.filter(function (x) {
        return x && String(x.id) !== mid;
      });
      if (next.length === maps.length) return;
      var st = global.OneToneState && global.OneToneState.state;
      if (st && st.config) st.config.mappings = next;
      try {
        if (global.OneToneConfigPersist && global.OneToneConfigPersist.save) {
          global.OneToneConfigPersist.save({ source: 'keys-seq-del' });
        }
      } catch (_) {}
      ok = true;
    }
    if (!ok) return;
    if (isCur) {
      var other = rows.find(function (r) {
        return r && String(r.id) !== mid;
      });
      if (other) selectSaved(other.id);
      else render();
    } else {
      render();
    }
  }

  function labelSavedChain(m) {
    if (!m) return;
    var lab = String(m.label || m.name || '').trim();
    var isDefault =
      !lab ||
      lab === t('keysSceneActionsNewBlankLabel', '新动作') ||
      /^AutoTrigger\b/i.test(lab) ||
      /→|->/.test(lab);
    if (!isDefault) return;
    var trig = friendlyKey(m.triggerKey) || String(m.triggerKey || '').trim();
    var steps = Array.isArray(m.targetActions) ? m.targetActions.length : 0;
    if (trig && steps) {
      m.label = trig + ' · ' + steps + t('keysCustomKeyMatchSteps', '步');
    } else if (trig) {
      m.label = trig;
    } else if (steps) {
      m.label = steps + t('keysCustomKeyMatchSteps', '步');
    }
  }

  function startNewAction() {
    catalogFace = 'seq';
    var picker = global.OneToneKeysChannelCommandPicker;
    var anchor = ensureAppScopedSelection() || selectedHabit();
    if (!anchor || !anchor.id) {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(t('keysSeqNeedHabit', '请先选择习惯'));
        }
      } catch (_) {}
      return;
    }
    ensureKeysSeqFamily(anchor);
    var appId = resolveCurrentAppId(anchor);
    if (appId && !String(anchor.appTargetId || '').trim()) {
      anchor.appTargetId = appId;
      try {
        persistMaps('keys-seq-new-stamp-app');
      } catch (_) {}
    }
    var created = null;
    // Mac / Keys: mint a real custom-key sequence peer (not a blank scene orphan).
    if (picker && typeof picker.createCustomKeyMatchMapping === 'function') {
      try {
        created = picker.createCustomKeyMatchMapping({
          quiet: true,
          sourceId: anchor.id,
          appTargetId: appId || String(anchor.appTargetId || '').trim(),
          keysSeqFamilyId: keysSeqFamilyId(anchor)
        });
      } catch (err) {
        try {
          console.warn('[keys-seq] createCustomKeyMatchMapping failed', err);
        } catch (_) {}
        created = null;
      }
    }
    if (!created || !created.id) {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(t('keysSeqNeedHabit', '请先选择习惯'));
        }
      } catch (_) {}
      return;
    }
    selectSaved(created.id);
    try {
      if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
        global.OneToneApp.toast(
          t('keysCustomKeyMatchCreated', '已新建。请录制触发键，再加步骤。')
        );
      }
    } catch (_) {}
  }

  function applyTriggerChord(mappingId, chord) {
    chord = String(chord || '').trim();
    if (!chord || chord === 'Escape') return false;
    var map =
      (global.OneToneMappingCore && global.OneToneMappingCore.byId
        ? global.OneToneMappingCore.byId(mappingId)
        : null) || selectedHabit();
    if (!map || !map.id) return false;
    var hooks = global.__vp_mapping_core_hooks__ || {};
    var norm = chord;
    try {
      if (hooks.normalizeTriggerKey) norm = hooks.normalizeTriggerKey(chord) || chord;
    } catch (_) {}
    if (hooks.isAllowedTriggerKey) {
      try {
        if (!hooks.isAllowedTriggerKey(norm) && !hooks.isAllowedTriggerKey(chord)) {
          if (global.OneToneApp && global.OneToneApp.toast) {
            global.OneToneApp.toast(t('triggerRejected', '该按键不适合作为触发键'));
          }
          return false;
        }
      } catch (_) {}
    }
    map.triggerKey = norm;
    map.triggerSource = null;
    map.sourceKey = '';
    map.sourceTime = '';
    try {
      if (hooks.setEditorTriggerKey) hooks.setEditorTriggerKey(norm);
    } catch (_) {}
    // Popup record path skips hardware finishTrigger — enable here or the chord never binds.
    if (!map.enabled && mappingHasChainContent(map)) {
      try {
        var core = global.OneToneMappingCore;
        if (core && typeof core.maybeEnableAfterComplete === 'function') {
          core.maybeEnableAfterComplete(map);
        }
      } catch (_) {}
      if (!map.enabled) {
        try {
          if (global.OneToneMappingEditActions && global.OneToneMappingEditActions.setMappingEnabled) {
            global.OneToneMappingEditActions.setMappingEnabled(map.id, true);
          } else {
            map.enabled = true;
          }
        } catch (_) {
          map.enabled = true;
        }
      }
    }
    persistMaps('keys-seq-trigger');
    paintTrigger(map);
    paintSavedList(map);
    return true;
  }

  function startTriggerRecord() {
    var m = selectedHabit();
    if (!m || !m.id) {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(t('keysSeqNeedHabit', '请先选择习惯'));
        }
      } catch (_) {}
      return;
    }
    var mid = String(m.id);
    var rec = global.OneToneMappingRecording;
    // Already recording / arming — keep popup; ignore duplicate clicks (cap + row).
    if (triggerRecordArming) {
      paintTrigger(m);
      return;
    }
    if (rec && typeof rec.mode === 'function' && rec.mode() === 'trigger') {
      paintTrigger(m);
      return;
    }
    if (typeof global.OneToneHomeRecordChord !== 'function') {
      // Fallback: hardware-only when popup helper missing.
      if (rec && typeof rec.startTrigger === 'function') {
        try {
          rec.startTrigger(mid, { slot: 'habit' });
        } catch (_) {}
      }
      paintTrigger(m);
      return;
    }
    triggerRecordArming = true;
    var finished = false;
    var finishUi = function () {
      if (finished) return;
      finished = true;
      triggerRecordArming = false;
      paintTrigger(selectedHabit());
    };
    // Keyboard popup alone owns the chord. Do NOT also arm startTrigger —
    // that path snapshots empty trigger, disables the mapping, then cancel()
    // restores the snapshot and wiped Ctrl+' after tab switch / timeout.
    global.OneToneHomeRecordChord(
      function (chord) {
        if (chord) applyTriggerChord(mid, chord);
        finishUi();
      },
      {
        title: t('keysSeqRecordTrigger', '录制触发键'),
        hint: t('homeKeyMapActionRecordHint', '按下你想要的组合键 — Esc 取消')
      }
    );
    paintTrigger(m);
  }

  function bindOnce() {
    var root = document.getElementById('settingsPanelKeysSeq');
    if (!root || root.dataset.keysSeqBound === '1') return;
    root.dataset.keysSeqBound = '1';
    var legacy = document.getElementById('keysSeqOpenLegacy');
    if (legacy) {
      legacy.addEventListener('click', function (e) {
        e.preventDefault();
        if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
          global.OneToneSettingsDrawer.open({ panel: 'keys' });
        }
      });
    }
    function onTriggerClick(e) {
      e.preventDefault();
      e.stopPropagation();
      startTriggerRecord();
    }
    // Mac: only keycap + 重新录入 arm record (not the whole field).
    var cap = document.getElementById('keysSeqTriggerCap');
    var recBtn = document.getElementById('keysSeqRecordTrigger');
    if (cap) {
      cap.addEventListener('click', onTriggerClick);
      cap.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') onTriggerClick(e);
      });
    }
    if (recBtn) recBtn.addEventListener('click', onTriggerClick);

    var nameIn = document.getElementById('keysSeqSeqName');
    if (nameIn && !nameIn.__keysSeqNameBound) {
      nameIn.__keysSeqNameBound = true;
      var commitName = function () {
        var m = selectedHabit();
        if (!m || !m.id) return;
        var next = String(nameIn.value || '').trim();
        if (!next) {
          nameIn.value = actionDisplayName(m);
          return;
        }
        var picker = global.OneToneKeysChannelCommandPicker;
        if (picker && typeof picker.renameCustomKeyMatch === 'function') {
          try {
            picker.renameCustomKeyMatch(m.id, next);
          } catch (_) {
            m.label = next;
            persistMaps('keys-seq-rename');
          }
        } else {
          m.label = next;
          persistMaps('keys-seq-rename');
        }
        paintTrigger(selectedHabit() || m);
        paintSavedList(selectedHabit() || m);
      };
      nameIn.addEventListener('change', commitName);
      nameIn.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          nameIn.blur();
        }
      });
    }

    var folderSel = document.getElementById('keysSeqHabitFolder');
    if (folderSel && !folderSel.__keysSeqFolderBound) {
      folderSel.__keysSeqFolderBound = true;
      folderSel.addEventListener('change', function () {
        var m = selectedHabit();
        if (!m || !m.id) return;
        m.keysSeqFolder = String(folderSel.value || '').trim() || '改内容';
        persistMaps('keys-seq-folder');
      });
    }

    var delBtn = document.getElementById('keysSeqSeqDelete');
    if (delBtn && !delBtn.__keysSeqDelBound) {
      delBtn.__keysSeqDelBound = true;
      delBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var m = selectedHabit();
        if (!m || !m.id) return;
        deleteSaved(m.id);
      });
    }
    var rail = document.getElementById('keysSeqRailTools');
    if (rail) {
      rail.addEventListener('click', function (e) {
        var el = e.target;
        var imeCard = el && el.closest ? el.closest('#keysSeqImeCard') : null;
        if (imeCard && rail.contains(imeCard)) {
          e.preventDefault();
          setCatalogFace('ime');
          paintDictation(selectedHabit());
          return;
        }
        if (el && el.closest && el.closest('#keysSeqNewAction')) {
          e.preventDefault();
          e.stopPropagation();
          startNewAction();
          return;
        }
        if (el && el.closest && el.closest('#keysSeqTplAction')) {
          e.preventDefault();
          setCatalogFace('seq');
          startNewAction();
          try {
            if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
              global.OneToneApp.toast(
                t('keysSeqTplHint', '已打开新建；模板库稍后接入，可先手动加步骤')
              );
            }
          } catch (_) {}
          return;
        }
        var del = el && el.closest ? el.closest('[data-seq-del]') : null;
        if (del && rail.contains(del)) {
          e.preventDefault();
          e.stopPropagation();
          deleteSaved(del.getAttribute('data-seq-del'));
          return;
        }
        var item = el && el.closest ? el.closest('[data-seq-select]') : null;
        if (item && rail.contains(item)) {
          e.preventDefault();
          selectSaved(item.getAttribute('data-seq-select'));
        }
      });
    }
  }

  function render() {
    syncDeskClass();
    bindOnce();
    var m = ensureAppScopedSelection() || selectedHabit();
    if (m) {
      ensureKeysSeqFamily(m);
      // Stamp current app so 新建 / 已存 stay in the same scene.
      var appId = resolveCurrentAppId(m);
      var stamped = false;
      if (appId && !String(m.appTargetId || '').trim()) {
        m.appTargetId = appId;
        stamped = true;
      }
      // Never force-migrate IME onto custom-key sequence peers.
      try {
        var pickerHeal = global.OneToneKeysChannelCommandPicker;
        var isCustom =
          pickerHeal &&
          typeof pickerHeal.isCustomKeyMatchMapping === 'function' &&
          pickerHeal.isCustomKeyMatchMapping(m);
        if (!isCustom) ensureImeStepOnHabit(m);
      } catch (_) {
        ensureImeStepOnHabit(m);
      }
      // Bound chords only fire when enabled — heal after popup-record / import.
      if (!m.enabled && mappingHasChainContent(m) && String(m.triggerKey || '').trim()) {
        try {
          if (global.OneToneMappingEditActions && global.OneToneMappingEditActions.setMappingEnabled) {
            global.OneToneMappingEditActions.setMappingEnabled(m.id, true);
          } else {
            m.enabled = true;
          }
          stamped = true;
        } catch (_) {
          m.enabled = true;
          stamped = true;
        }
      }
      if (stamped) persistMaps('keys-seq-render-heal');
    }
    paintTrigger(m);
    paintActions(m);
    paintSavedList(m);
    paintDictation(m);
    paintCatalogFace();
    // Keep right dock suppressed (HOSTS still registered for API compat).
    var dock = document.getElementById('keysSeqSceneActionsPanel');
    if (dock) {
      dock.hidden = true;
      dock.setAttribute('aria-hidden', 'true');
    }
    var body = document.getElementById('keysSeqPageBody');
    if (body) body.classList.remove('has-scene-panel');
  }

  function refreshAfterEdit() {
    var m = selectedHabit();
    paintTrigger(m);
    paintSavedList(m);
    paintDictation(m);
    paintCatalogFace();
  }

  global.OneToneKeysSeqPanel = {
    render: render,
    ensureImeStepOnHabit: ensureImeStepOnHabit,
    startTriggerRecord: startTriggerRecord,
    startNewAction: startNewAction,
    selectSaved: selectSaved,
    setCatalogFace: setCatalogFace,
    catalogFace: function () {
      return catalogFace;
    },
    hostsImeScheme: hostsImeScheme,
    hostsCustomKey: hostsCustomKey,
    hostsLiveKeysChrome: hostsLiveKeysChrome,
    unmountImeScheme: unmountImeScheme,
    refreshImeSchemePaint: refreshImeSchemePaint,
    refreshCustomKeyPaint: refreshCustomKeyPaint,
    syncTrigger: function () {
      paintTrigger(selectedHabit());
    },
    refreshSaved: function () {
      paintSavedList(selectedHabit());
    },
    refreshAfterEdit: refreshAfterEdit
  };
})(typeof window !== 'undefined' ? window : globalThis);
