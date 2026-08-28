(function (global) {
  'use strict';

  var $ = function (id) {
    return global.OneToneDom && global.OneToneDom.$ ? global.OneToneDom.$(id) : document.getElementById(id);
  };
  function t(key, fallback) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
  }
  function state() { return global.OneToneState && global.OneToneState.state; }
  function ui() { return global.OneToneState && global.OneToneState.ui; }
  function core() { return global.OneToneMappingCore; }
  function diff() { return global.OneToneHabitOverrideDiff; }

  var GLOBAL_SCOPE_ID = '__global__';
  var bound = false;

  function esc(v) {
    if (global.OneToneDom && global.OneToneDom.esc) return global.OneToneDom.esc(v);
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  function habitName(m) {
    if (!m) return t('homeWbChipUniversal', '通用设置');
    var hub = global.OneToneHabitHub;
    if (hub && hub.habitName) return hub.habitName(m);
    return String(m.group || m.label || m.id || '').trim() || '—';
  }

  function isAppScenarioMapping(m) {
    return !!(m && diff() && diff().isAppScenarioMapping && diff().isAppScenarioMapping(m));
  }

  function globalBaseline() {
    var cfg = (state() && state().config) || {};
    if (!diff() || !diff().findGlobalBaselineMapping || !core()) return null;
    return diff().findGlobalBaselineMapping(cfg, core());
  }

  function scopeSubline(m) {
    if (!m || !isAppScenarioMapping(m)) {
      return t('settingsScopeSubGlobal', '所有应用默认');
    }
    var appId = String(m.appTargetId || '').trim();
    if (global.OneToneAppBehaviorRules && global.OneToneAppBehaviorRules.appDisplayName) {
      return t('settingsScopeSubApp', '仅 {app} 前台').replace('{app}', global.OneToneAppBehaviorRules.appDisplayName(appId) || appId);
    }
    return t('settingsScopeSubApp', '仅 {app} 前台').replace('{app}', appId || '—');
  }

  function keysOverridePill(m) {
    if (!m || !m.id) return { cls: '', text: t('settingsScopePillKeys', '按键') };
    var on = !!(m.triggerKey || (core() && core().editorTrigger && core().editorTrigger(m)));
    return { cls: on ? ' is-ok' : '', text: t('settingsScopePillKeys', '按键') };
  }

  function voiceOverridePill(m) {
    if (!m || !m.id) return { cls: ' is-ok', text: t('settingsScopePillVoice', '语音') };
    var ov = m.voiceOverride;
    var on = !!(ov && ov.engine && ov.engine !== 'off');
    return { cls: on ? ' is-ok' : '', text: t('settingsScopePillVoice', '语音') };
  }

  function habitMappingConfigured(m) {
    if (!m || !m.id) return false;
    var keysOn = !!(m.triggerKey || (core() && core().editorTrigger && core().editorTrigger(m)));
    var ov = m.voiceOverride;
    var voiceOn = !!(ov && ov.engine && ov.engine !== 'off');
    var padOn = !!(m.codexMicroPad && (m.codexMicroPad.enabled || m.codexMicroPad.overlayEnabled));
    return keysOn || voiceOn || padOn;
  }

  function habitScopeDisplayName(m) {
    if (!m) return t('homeWbChipUniversal', '通用设置');
    if (isAppScenarioMapping(m)) {
      var appId = String(m.appTargetId || '').trim();
      if (global.OneToneAppBehaviorRules && global.OneToneAppBehaviorRules.appDisplayName) {
        var appName = global.OneToneAppBehaviorRules.appDisplayName(appId);
        if (appName) return appName;
      }
    }
    return habitName(m);
  }

  function universalScopeIconHtml() {
    return '<span class="settings-scope-switch__icon-img settings-scope-switch__icon-img--universal" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/>' +
      '<path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>' +
      '</svg></span>';
  }

  function habitScopeIconHtml(m) {
    if (!m || !isAppScenarioMapping(m)) return universalScopeIconHtml();
    var hub = softPadHub();
    if (hub && hub.iconHtmlForKind && hub.kindForAppId) {
      var kind = hub.kindForAppId(m.appTargetId);
      if (kind) return hub.iconHtmlForKind(kind);
    }
    var appId = String(m.appTargetId || '').trim();
    var P = global.OneToneAppTargetPresets;
    var preset = P && P.presetById ? P.presetById(appId) : null;
    if (preset && preset.icon) {
      return '<img class="settings-scope-switch__icon-img" src="' + esc(preset.icon) +
        '" alt="" decoding="async" width="18" height="18" />';
    }
    return '';
  }

  function isVisibleHabitScope(m, activeId) {
    if (!m) return true;
    if (String(m.id) === String(activeId || '')) return true;
    var baseline = globalBaseline();
    if (baseline && String(m.id) === String(baseline.id)) return true;
    if (!isAppScenarioMapping(m)) return false;
    if (habitMappingConfigured(m)) return true;
    var hub = softPadHub();
    if (hub && hub.isAgentInstalledForAppId && hub.isAgentInstalledForAppId(m.appTargetId)) return true;
    return false;
  }

  function renderScopeMenuRow(opts) {
    opts = opts || {};
    return (
      '<button type="button" class="settings-scope-switch__item' + (opts.active ? ' is-active' : '') +
      '" role="option" aria-selected="' + (opts.active ? 'true' : 'false') +
      '" data-settings-scope-id="' + esc(opts.id) + '" data-settings-scope-panel="' + esc(opts.panel) + '">' +
      '<span class="settings-scope-switch__row">' +
      (opts.iconHtml ? '<span class="settings-scope-switch__icon">' + opts.iconHtml + '</span>' : '') +
      '<strong class="settings-scope-switch__item-name">' + esc(opts.name) + '</strong>' +
      (opts.badgesHtml ? '<span class="settings-scope-switch__badges">' + opts.badgesHtml + '</span>' : '') +
      '</span></button>'
    );
  }

  function listHabitScopes(panel) {
    panel = normalizePanel(panel);
    var activeId = currentScopeId(panel);
    if (panel === 'softPad') {
      var hub = global.OneToneSoftPadHub;
      if (!hub || !hub.buildBindAppProps) return [];
      return (hub.buildBindAppProps().scopes || []).map(function (s) {
        return { id: String(s.id), mapping: null, isGlobal: String(s.id) === 'universal' };
      });
    }
    var items = [];
    var baseline = globalBaseline();
    if (baseline && baseline.id) {
      items.push({ id: String(baseline.id), mapping: baseline, isGlobal: true });
    }
    if (core() && core().sorted) {
      core().sorted().forEach(function (m) {
        if (!m || !m.id) return;
        if (baseline && String(m.id) === String(baseline.id)) return;
        if (!isAppScenarioMapping(m)) return;
        if (!isVisibleHabitScope(m, activeId)) return;
        items.push({ id: String(m.id), mapping: m, isGlobal: false });
      });
    }
    if (panel === 'voice' || panel === 'voiceWake') {
      var hasGlobal = items.some(function (x) { return x.isGlobal; });
      if (!hasGlobal) {
        items.unshift({ id: GLOBAL_SCOPE_ID, mapping: null, isGlobal: true });
      }
    }
    return items;
  }

  function normalizePanel(panel) {
    panel = String(panel || '').trim();
    if (panel === 'voiceWake') return 'voice';
    return panel;
  }

  function softPadHub() {
    return global.OneToneSoftPadHub;
  }

  function currentScopeId(panel) {
    panel = normalizePanel(panel);
    if (panel === 'softPad') {
      var hub = softPadHub();
      return hub && hub.getSelectedScopeId ? String(hub.getSelectedScopeId() || 'codex') : 'codex';
    }
    if (panel === 'voice') {
      var vid = String(ui().voiceEditSchemeId || '').trim();
      if (!vid || vid === GLOBAL_SCOPE_ID) {
        var base = globalBaseline();
        return base && base.id ? String(base.id) : GLOBAL_SCOPE_ID;
      }
      return vid;
    }
    var Banner = global.OneToneHabitChannelEditBanner;
    if (Banner && Banner.resolveEditMapping) {
      var m = Banner.resolveEditMapping();
      if (m && m.id) return String(m.id);
    }
    var rid = String(ui().habitScenarioReturnId || '').trim();
    if (rid) return rid;
    var sel = state() && state().selectedMappingId;
    if (sel != null && String(sel).trim()) return String(sel).trim();
    var baseline = globalBaseline();
    return baseline && baseline.id ? String(baseline.id) : GLOBAL_SCOPE_ID;
  }

  function syncEditor(id) {
    if (id && id !== GLOBAL_SCOPE_ID) state().selectedMappingId = id;
    var h = global.__vp_bootstrap_hooks__ || global.__vp_mapping_list_ui_hooks__ || {};
    if (h.syncEditorFromSelection) h.syncEditorFromSelection();
  }

  function syncSoftPadScopeFromHabit(m, panel) {
    var hub = softPadHub();
    if (!hub || !hub.selectScope) return;
    var scopeOpts = { fromUser: false, resetView: false };
    if (!m || !isAppScenarioMapping(m)) {
      hub.selectScope('universal', scopeOpts);
      return;
    }
    if (hub.kindForAppId) {
      var kind = hub.kindForAppId(m.appTargetId);
      if (kind) hub.selectScope(kind, scopeOpts);
    }
  }

  function selectHabitScope(id, panel) {
    panel = normalizePanel(panel);
    id = String(id || '').trim();
    if (!id) return false;
    if (panel === 'softPad') {
      var hub = softPadHub();
      if (!hub || !hub.selectScope) return false;
      var face = hub.getSoftPadFace ? hub.getSoftPadFace() : '';
      hub.selectScope(id, { fromUser: true, resetView: false, forceRemount: face === 'agent' });
      var Banner = global.OneToneHabitChannelEditBanner;
      if (Banner && Banner.renderAll) Banner.renderAll();
      repaintPanel(panel);
      return true;
    }
    var m = id === GLOBAL_SCOPE_ID ? null : (core() && core().byId ? core().byId(id) : null);
    if (id !== GLOBAL_SCOPE_ID && !m) return false;

    if (!m || !isAppScenarioMapping(m)) {
      ui().habitScenarioReturnId = null;
      ui().habitScenarioReturnPanel = null;
      ui().habitHubEditReturn = false;
      ui().cameraEditMode = 'global';
      ui().voiceEditSchemeId = GLOBAL_SCOPE_ID;
      var base = globalBaseline();
      if (base && base.id) {
        state().selectedMappingId = base.id;
      } else if (id !== GLOBAL_SCOPE_ID && m) {
        state().selectedMappingId = m.id;
      }
    } else {
      ui().habitScenarioReturnId = m.id;
      ui().habitScenarioReturnPanel = panel === 'voice' ? 'voiceWake' : panel;
      ui().cameraEditMode = 'appScenario';
      state().selectedMappingId = m.id;
      if (panel === 'voice') ui().voiceEditSchemeId = m.id;
    }

    var Banner = global.OneToneHabitChannelEditBanner;
    if (Banner && Banner.syncPanelContext) {
      Banner.syncPanelContext(panel === 'voice' ? 'voiceWake' : panel);
    }
    syncSoftPadScopeFromHabit(m, panel);
    syncEditor(state().selectedMappingId);
    repaintPanel(panel);
    if (Banner && Banner.renderAll) Banner.renderAll();
    return true;
  }

  function repaintPanel(panel) {
    panel = normalizePanel(panel);
    var cur = String(ui().settingsPanel || '');
    if (panel === 'keys' && cur === 'keys' && global.OneToneKeysPanelUi && global.OneToneKeysPanelUi.render) {
      try { global.OneToneKeysPanelUi.render(); } catch (_) {}
    }
    if (panel === 'voice' && cur === 'voiceWake' && global.OneToneVoiceSchemesUi && global.OneToneVoiceSchemesUi.render) {
      try { global.OneToneVoiceSchemesUi.render(); } catch (_) {}
    }
    if (panel === 'camera' && cur === 'camera') {
      if (global.OneToneCameraWorkflow && global.OneToneCameraWorkflow.onPanelVisible) {
        try { global.OneToneCameraWorkflow.onPanelVisible(); } catch (_) {}
      }
    }
    if (panel === 'softPad' && cur === 'softPad' && global.OneToneSoftPadHub && global.OneToneSoftPadHub.render) {
      try { global.OneToneSoftPadHub.render(); } catch (_) {}
    }
  }

  function switchLabel(name, panel) {
    panel = normalizePanel(panel);
    if (panel === 'softPad') {
      var hub = softPadHub();
      if (hub && hub.softPadScopeSwitchLabel) return hub.softPadScopeSwitchLabel();
    }
    return t('settingsScopeSwitchLbl', '切换 · {name}').replace('{name}', name || '—');
  }

  function renderScopeMenuFooter(panel) {
    return (
      '<button type="button" class="settings-scope-switch__item settings-scope-switch__item--add" role="option" ' +
      'data-settings-scope-add-custom data-settings-scope-panel="' + esc(panel) + '">' +
      esc('+ ' + t('homeWbSceneNewHabit', '自定义')) +
      '</button>'
    );
  }

  function openCustomAppForPanel(panel) {
    panel = normalizePanel(panel);
    var hub = global.OneToneHabitHub;
    var rules = global.OneToneAppBehaviorRules;
    if (!hub || !hub.createAppScenario) return;
    var m = hub.createAppScenario('custom', { deferPersist: true });
    if (!m || !m.id) return;
    if (rules && rules.openAppPicker) {
      rules.openAppPicker({ mappingId: m.id });
    }
  }

  function renderHabitScopeMenu(panel, activeId) {
    panel = normalizePanel(panel);
    activeId = String(activeId || currentScopeId(panel));
    if (panel === 'softPad') {
      var hubSp = softPadHub();
      var body = hubSp && hubSp.renderSoftPadScopeMenuItems ? hubSp.renderSoftPadScopeMenuItems(activeId) : '';
      return body + renderScopeMenuFooter(panel);
    }
    return listHabitScopes(panel).map(function (item) {
      var m = item.mapping;
      var name = m ? habitScopeDisplayName(m) : t('homeWbChipUniversal', '通用设置');
      var active = String(item.id) === activeId;
      var badgesHtml = '';
      if (m && !item.isGlobal) {
        var keysPill = keysOverridePill(m);
        var voicePill = voiceOverridePill(m);
        badgesHtml =
          '<span class="settings-scope-switch__pill' + keysPill.cls + '">' + esc(keysPill.text) + '</span>' +
          '<span class="settings-scope-switch__pill' + voicePill.cls + '">' + esc(voicePill.text) + '</span>';
      }
      return renderScopeMenuRow({
        id: item.id,
        panel: panel,
        name: name,
        active: active,
        iconHtml: habitScopeIconHtml(m),
        badgesHtml: badgesHtml
      });
    }).join('') + renderScopeMenuFooter(panel);
  }

  function renderScopeSwitchMount(panel, activeId) {
    panel = normalizePanel(panel);
    activeId = String(activeId || currentScopeId(panel));
    var name;
    if (panel === 'softPad') {
      var hub = softPadHub();
      name = hub && hub.appTitleFor ? hub.appTitleFor(activeId) : '—';
    } else {
      var m = activeId === GLOBAL_SCOPE_ID ? null : (core() && core().byId ? core().byId(activeId) : null);
      name = m ? habitName(m) : t('homeWbChipUniversal', '通用设置');
    }
    return (
      '<div class="settings-scope-switch" data-settings-scope-switch data-settings-scope-panel="' + esc(panel) + '">' +
      '<button type="button" class="settings-scope-switch__btn page-status-btn" data-settings-scope-toggle aria-haspopup="listbox" aria-expanded="false">' +
      esc(switchLabel(name, panel)) + ' <span aria-hidden="true">▾</span></button>' +
      '<div class="settings-scope-switch__menu" role="listbox" hidden>' +
      renderHabitScopeMenu(panel, activeId) +
      '</div></div>'
    );
  }

  function closeAllMenus(except) {
    document.querySelectorAll('.settings-scope-switch__menu').forEach(function (menu) {
      if (except && menu === except) return;
      menu.hidden = true;
      var wrap = menu.closest('.settings-scope-switch');
      var btn = wrap && wrap.querySelector('[data-settings-scope-toggle]');
      if (btn) btn.setAttribute('aria-expanded', 'false');
      if (wrap) wrap.classList.remove('is-open');
    });
  }

  function bindHabitScopeMenu() {
    /* ponytail: legacy no-op — document delegation in bindOnce survives renderAll innerHTML */
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    document.addEventListener('click', function (e) {
      var target = e.target;
      var inSwitch = target && target.closest && target.closest('.settings-scope-switch');
      var item = target && target.closest && target.closest('[data-settings-scope-id]');
      if (item && inSwitch && inSwitch.contains(item)) {
        e.preventDefault();
        e.stopPropagation();
        selectHabitScope(
          item.getAttribute('data-settings-scope-id'),
          item.getAttribute('data-settings-scope-panel') || inSwitch.getAttribute('data-settings-scope-panel') || ''
        );
        closeAllMenus();
        return;
      }
      var addCustom = target && target.closest && target.closest('[data-settings-scope-add-custom]');
      if (addCustom && inSwitch && inSwitch.contains(addCustom)) {
        e.preventDefault();
        e.stopPropagation();
        openCustomAppForPanel(addCustom.getAttribute('data-settings-scope-panel') || inSwitch.getAttribute('data-settings-scope-panel') || '');
        closeAllMenus();
        return;
      }
      var toggle = target && target.closest && target.closest('[data-settings-scope-toggle]');
      if (toggle && inSwitch && inSwitch.contains(toggle)) {
        e.preventDefault();
        e.stopPropagation();
        var panel = inSwitch.getAttribute('data-settings-scope-panel') || '';
        var menu = inSwitch.querySelector('.settings-scope-switch__menu');
        var open = !!(menu && menu.hidden);
        closeAllMenus(menu);
        if (menu) {
          menu.hidden = !open;
          menu.innerHTML = renderHabitScopeMenu(panel, currentScopeId(panel));
        }
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        inSwitch.classList.toggle('is-open', open);
        return;
      }
      if (!inSwitch) closeAllMenus();
    });
  }

  global.OneToneSettingsScopeSwitch = {
    GLOBAL_SCOPE_ID: GLOBAL_SCOPE_ID,
    listHabitScopes: listHabitScopes,
    currentScopeId: currentScopeId,
    selectHabitScope: selectHabitScope,
    renderHabitScopeMenu: renderHabitScopeMenu,
    renderScopeSwitchMount: renderScopeSwitchMount,
    renderScopeMenuRow: renderScopeMenuRow,
    renderScopeMenuFooter: renderScopeMenuFooter,
    openCustomAppForPanel: openCustomAppForPanel,
    bindHabitScopeMenu: bindHabitScopeMenu,
    switchLabel: switchLabel,
    habitName: habitName,
    habitScopeDisplayName: habitScopeDisplayName,
    bindOnce: bindOnce,
    closeAllMenus: closeAllMenus
  };
})((typeof window !== 'undefined') ? window : globalThis);
