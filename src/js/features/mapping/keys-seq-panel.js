/**
 * Keys sequence desk — parallel to legacy #settingsPanelKeys.
 * Two-col: left trigger + saved actions; middle sequence + ＋ add menu.
 */
(function (global) {
  'use strict';

  var savedExpanded = false;
  var triggerRecordArming = false;

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

  /** Peers under the same app / keysSeq family (action-chain rows for the left list). */
  function listSavedActions(anchor) {
    if (!anchor) return [];
    var appId = resolveCurrentAppId(anchor) || String(anchor.appTargetId || '').trim();
    var fam = keysSeqFamilyId(anchor);
    var maps = configMaps();
    var out = [];
    var i;
    for (i = 0; i < maps.length; i++) {
      var m = maps[i];
      if (!m || !m.id) continue;
      if (isPromptInject(m)) continue;
      if (appId) {
        if (String(m.appTargetId || '').trim() !== appId) continue;
      } else if (fam) {
        if (keysSeqFamilyId(m) !== fam) continue;
      } else if (String(m.id) !== String(anchor.id)) {
        continue;
      }
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

  function paintTrigger(m) {
    var view = document.getElementById('keysSeqTriggerView');
    var disp = document.getElementById('keysSeqTriggerDisplay');
    var sub = document.getElementById('keysSeqTriggerSub');
    var pill = document.getElementById('keysSeqHabitPill');
    var trig = m ? String(m.triggerKey || '').trim() : '';
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
        ? (appName ? appName + ' · ' : '') + actionDisplayName(m)
        : t('keysSeqNeedHabit', '请先选择习惯');
    }
    if (sub) {
      sub.textContent = trig
        ? t('keysSeqTriggerHint', '按下后按顺序执行下方动作')
        : t('keysSeqTriggerUnset', '先录制触发键，再配置动作链');
    }
    var row = document.getElementById('keysSeqTriggerRow');
    if (row) {
      var rec = global.OneToneMappingRecording;
      var mode = rec && typeof rec.mode === 'function' ? rec.mode() : 'none';
      row.classList.toggle('is-recording-active', mode === 'trigger');
    }
  }

  function paintActions(m) {
    var host = document.getElementById('keysSeqActions');
    if (!host) return;
    if (!m) {
      host.innerHTML =
        '<div class="home-key-map-action-empty is-keys"><b>' +
        esc(t('keysSeqNeedHabit', '请先选择习惯')) +
        '</b></div>';
      return;
    }
    var HT = global.OneToneHomeTargetActions;
    if (HT && typeof HT.render === 'function') {
      // Middle ＋ opens the step menu (titles = capability tooltips).
      HT.render(host, m, { mode: 'picker', variant: 'keys', hideAdd: false });
    }
  }

  var flowOpenId = '';

  function stepFlowHtml(m) {
    var acts = Array.isArray(m && m.targetActions) ? m.targetActions : [];
    if (!acts.length) {
      return (
        '<div class="keys-seq-saved-flow is-empty">' +
        esc(t('keysCustomKeyMatchNoActions', '尚无动作')) +
        '</div>'
      );
    }
    var parts = acts.map(function (a, i) {
      var typ = a && a.type ? String(a.type) : '';
      var lab =
        typ === 'key'
          ? friendlyKey(a.value || '') || t('keysCaptureSeqAddKey', '按键')
          : typ === 'text'
            ? String(a.value || '').slice(0, 24) || t('keysCaptureSeqAddText', '文本')
            : typ === 'delay'
              ? (Number(a.ms) || 0) + 'ms'
              : typ === 'open'
                ? String(a.value || a.kind || '').slice(0, 28) || t('keysCaptureSeqAddOpenFile', '文件')
                : typ === 'ime'
                  ? t('keysCaptureSeqAddIme', '语音输入法') +
                    (a.value ? ' · ' + friendlyKey(a.value) : '')
                  : typ || '?';
      return (
        '<span class="keys-seq-saved-flow-step"><b>' +
        (i + 1) +
        '</b> ' +
        esc(lab) +
        '</span>'
      );
    });
    return '<div class="keys-seq-saved-flow">' + parts.join('<span class="keys-seq-saved-flow-arr" aria-hidden="true">→</span>') + '</div>';
  }

  function paintSavedList(m) {
    var list = document.getElementById('keysSeqSavedList');
    var countEl = document.getElementById('keysSeqSavedCount');
    var toggle = document.getElementById('keysSeqSavedToggle');
    if (!list) return;
    var rows = listSavedActions(m);
    var curId = m && m.id ? String(m.id) : '';
    if (countEl) countEl.textContent = String(rows.length);
    if (toggle) {
      toggle.setAttribute('aria-expanded', savedExpanded ? 'true' : 'false');
      toggle.classList.toggle('is-open', !!savedExpanded);
    }
    if (!savedExpanded) {
      list.hidden = true;
      list.innerHTML = '';
      return;
    }
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
        var on = String(row.id) === curId;
        var flowOn = String(row.id) === String(flowOpenId);
        return (
          '<div class="keys-seq-saved-card' +
          (on ? ' is-active' : '') +
          (flowOn ? ' is-flow-open' : '') +
          '" data-seq-card="' +
          esc(row.id) +
          '" role="listitem">' +
          '<div class="keys-seq-saved-card-main">' +
          '<button type="button" class="keys-seq-saved-item" data-seq-select="' +
          esc(row.id) +
          '">' +
          '<span class="keys-seq-saved-key">' +
          esc(trigLab) +
          '</span>' +
          '<span class="keys-seq-saved-name">' +
          esc(name) +
          '</span>' +
          '<span class="keys-seq-saved-steps">' +
          esc(steps ? steps + t('keysCustomKeyMatchSteps', '步') : t('keysCustomKeyMatchNoActions', '尚无动作')) +
          '</span></button>' +
          '<button type="button" class="keys-seq-saved-flow-tog" data-seq-flow="' +
          esc(row.id) +
          '" aria-expanded="' +
          (flowOn ? 'true' : 'false') +
          '" title="' +
          esc(t('keysSeqSavedShowFlow', '查看动作序列')) +
          '">' +
          (flowOn ? '▾' : '▸') +
          '</button>' +
          '<button type="button" class="keys-seq-saved-del" data-seq-del="' +
          esc(row.id) +
          '" title="' +
          esc(t('homeKeyMapActionDelete', '删除')) +
          '" aria-label="' +
          esc(t('homeKeyMapActionDelete', '删除')) +
          '">×</button></div>' +
          (flowOn ? stepFlowHtml(row) : '') +
          '</div>'
        );
      })
      .join('');
  }

  function selectSaved(id) {
    var mid = String(id || '').trim();
    if (!mid) return;
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
    savedExpanded = true;
    syncDeskClass();
    bindOnce();
    paintTrigger(m);
    paintActions(m);
    paintSavedList(m);
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
    if (flowOpenId === mid) flowOpenId = '';
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
    var m = selectedHabit();
    if (!m || !m.id) {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(t('keysSeqNeedHabit', '请先选择习惯'));
        }
      } catch (_) {}
      return;
    }
    // Flush editor → mapping, then keep this row in 已存 before opening a blank peer.
    try {
      var coreFlush = global.OneToneMappingCore;
      if (coreFlush && typeof coreFlush.flushAllEditor === 'function') coreFlush.flushAllEditor();
      else if (coreFlush && typeof coreFlush.flushEditor === 'function') coreFlush.flushEditor(m);
    } catch (_) {}
    if (!mappingHasChainContent(m)) {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(
            t('keysSeqNewNeedContent', '请先录制触发键或添加步骤，再新建')
          );
        }
      } catch (_) {}
      return;
    }
    var fam = ensureKeysSeqFamily(m);
    labelSavedChain(m);
    var appId = resolveCurrentAppId(m);
    if (appId && !String(m.appTargetId || '').trim()) m.appTargetId = appId;
    // Keep the saved peer live so its trigger still fires after we switch to the blank.
    if (!m.enabled) {
      try {
        if (global.OneToneMappingEditActions && global.OneToneMappingEditActions.setMappingEnabled) {
          global.OneToneMappingEditActions.setMappingEnabled(m.id, true);
        } else {
          m.enabled = true;
        }
      } catch (_) {
        m.enabled = true;
      }
    }
    persistMaps('keys-seq-save-before-new');
    var picker = global.OneToneKeysChannelCommandPicker;
    var created = null;
    if (picker && typeof picker.createBlankSceneActionMapping === 'function') {
      try {
        created = picker.createBlankSceneActionMapping();
      } catch (_) {
        created = null;
      }
    }
    if (created && created.id) {
      created.keysSeqFamilyId = fam;
      if (appId) created.appTargetId = appId;
      ensureKeysSeqFamily(created);
      persistMaps('keys-seq-new-blank');
    } else {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
        }
      } catch (_) {}
      return;
    }
    savedExpanded = true;
    render();
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
    // Whole trigger card is clickable (cap + 录制 link + empty display).
    var row = document.getElementById('keysSeqTriggerRow');
    var cap = document.getElementById('keysSeqTriggerCap');
    if (row) {
      row.addEventListener('click', onTriggerClick);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          var host = e.target && e.target.closest && e.target.closest('#keysSeqTriggerCap, #keysSeqRecordTrigger');
          if (!host && e.target !== row) return;
          onTriggerClick(e);
        }
      });
    } else if (cap) {
      cap.addEventListener('click', onTriggerClick);
      cap.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') onTriggerClick(e);
      });
    }
    var rail = document.getElementById('keysSeqRailTools');
    if (rail) {
      rail.addEventListener('click', function (e) {
        var el = e.target;
        if (el && el.closest && el.closest('#keysSeqNewAction')) {
          e.preventDefault();
          startNewAction();
          return;
        }
        if (el && el.closest && el.closest('#keysSeqSavedToggle')) {
          e.preventDefault();
          savedExpanded = !savedExpanded;
          paintSavedList(selectedHabit());
          return;
        }
        var del = el && el.closest ? el.closest('[data-seq-del]') : null;
        if (del && rail.contains(del)) {
          e.preventDefault();
          e.stopPropagation();
          deleteSaved(del.getAttribute('data-seq-del'));
          return;
        }
        var flow = el && el.closest ? el.closest('[data-seq-flow]') : null;
        if (flow && rail.contains(flow)) {
          e.preventDefault();
          e.stopPropagation();
          var fid = String(flow.getAttribute('data-seq-flow') || '');
          flowOpenId = flowOpenId === fid ? '' : fid;
          paintSavedList(selectedHabit());
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
      ensureImeStepOnHabit(m);
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
  }

  global.OneToneKeysSeqPanel = {
    render: render,
    ensureImeStepOnHabit: ensureImeStepOnHabit,
    startTriggerRecord: startTriggerRecord,
    startNewAction: startNewAction,
    selectSaved: selectSaved,
    syncTrigger: function () {
      paintTrigger(selectedHabit());
    },
    refreshSaved: function () {
      paintSavedList(selectedHabit());
    },
    refreshAfterEdit: refreshAfterEdit
  };
})(typeof window !== 'undefined' ? window : globalThis);
