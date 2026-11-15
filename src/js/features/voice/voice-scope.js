/**
 * Single voice edit-scope resolver for voiceLab + voiceWake + Persist + bridges.
 * Priority: habitScenarioReturnId → habitMapping → selectedMappingId → voiceEditSchemeId → activeSceneId
 */
(function (global) {
  'use strict';

  var GLOBAL_SCHEME_ID = '__global__';

  function t(key, fallback) {
    try {
      if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback != null ? fallback : key;
  }

  function state() {
    return (global.OneToneState && global.OneToneState.state) || {};
  }

  function ui() {
    return (global.OneToneState && global.OneToneState.ui) || {};
  }

  function byId(id) {
    id = String(id || '').trim();
    if (!id) return null;
    var core = global.OneToneMappingCore;
    if (core && typeof core.byId === 'function') {
      var hit = core.byId(id);
      if (hit) return hit;
    }
    var maps = (state().config && state().config.mappings) || [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && String(maps[i].id) === id) return maps[i];
    }
    return null;
  }

  function isAppScenarioMapping(m) {
    if (!m) return false;
    var Diff = global.OneToneHabitOverrideDiff;
    if (Diff && typeof Diff.isAppScenarioMapping === 'function') {
      return !!Diff.isAppScenarioMapping(m);
    }
    return !!String(m.appTargetId || '').trim();
  }

  function habitDisplayName(m) {
    if (!m) return t('homeWbChipUniversal', '通用');
    try {
      if (global.OneToneHabitProfile && typeof global.OneToneHabitProfile.habitDisplayName === 'function') {
        var n = global.OneToneHabitProfile.habitDisplayName(m);
        if (n) return String(n);
      }
    } catch (_) {}
    return String(m.name || m.label || m.appTargetId || m.id || t('homeWbChipUniversal', '通用'));
  }

  /**
   * @param {object} [opts]
   * @param {object} [opts.habitMapping] — ViewModel habitMapping shortcut
   */
  function resolveEditMapping(opts) {
    opts = opts || {};
    var u = ui();
    var st = state();
    var cfg = st.config || {};

    var scenario = byId(u.habitScenarioReturnId);
    if (scenario) return scenario;

    if (opts.habitMapping && opts.habitMapping.id) {
      var fromVm = byId(opts.habitMapping.id) || opts.habitMapping;
      if (fromVm) return fromVm;
    }

    var selected = byId(st.selectedMappingId);
    if (selected) return selected;

    var edit = String(u.voiceEditSchemeId || '').trim();
    if (edit && edit !== GLOBAL_SCHEME_ID) {
      var edited = byId(edit);
      if (edited) return edited;
    }

    return byId(cfg.activeSceneId);
  }

  function describeScope(mapping) {
    var m = mapping || resolveEditMapping();
    var appId = m ? String(m.appTargetId || '').trim() : '';
    var isApp = isAppScenarioMapping(m);
    var isGlobal = !m || !isApp;
    var name = habitDisplayName(m);
    var saveImpact = isGlobal
      ? t('habitHubContextGlobalHint', '此处修改会影响所有未单独覆盖的应用场景')
      : t(
          'habitScenarioContextEditing',
          '正在编辑：{name} 场景。修改只作用于当前应用场景，不影响通用设置。'
        ).replace('{name}', name);
    var overrideLabel = isGlobal
      ? t('voiceSummaryScopeUniversal', '所有未单独覆盖的习惯')
      : t('voiceLabScopeAppOverride', '当前习惯覆盖');
    return {
      mapping: m || null,
      mappingId: m && m.id ? String(m.id) : '',
      habitName: name,
      appId: appId,
      isGlobal: isGlobal,
      isAppOverride: !!isApp,
      overrideLabel: overrideLabel,
      saveImpactLabel: saveImpact,
    };
  }

  global.OneToneVoiceScope = {
    GLOBAL_SCHEME_ID: GLOBAL_SCHEME_ID,
    resolveEditMapping: resolveEditMapping,
    describeScope: describeScope,
    isAppScenarioMapping: isAppScenarioMapping,
    habitDisplayName: habitDisplayName,
  };
})(typeof window !== 'undefined' ? window : globalThis);
