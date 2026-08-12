/**
 * Recognition footer: browse other-channel configured actions → add a Key entry.
 * Read source channel BindingViews; write only via Key Adapter. No silent defaults.
 */
(function (global) {
  'use strict';

  var TABS = ['voice', 'softPad', 'camera', 'ime'];
  var CHANNEL_TABS = ['voice', 'softPad', 'camera'];
  /** Voice lifecycle intents shown on 识别 — not full BindingView expansion. */
  var VOICE_LIFECYCLE_IDS = {
    start: 'input.start',
    cancel: 'input.cancel',
    // end/send lives on step 03 — never bind here
    endCommit: 'input.commit',
    endSend: 'input.send'
  };
  var activeTab = 'ime';
  /** @type {{mappingId:string,sourceChannel:string,sourceBindingRef:string,actionId:string,keyBindingRef:string,actionInstanceId?:string,actionArgs?:*,iconHtml?:string}|null} */
  var selection = null;
  var viewsCache = [];
  /** SoftPad BindingViews for the scoped app mapping (may differ from selected/global). */
  var softPadViewsCache = [];
  var softPadViewsMappingId = '';
  var bindableByAction = {};
  var bindableMappingId = '';
  var bound = false;
  var renderToken = 0;
  /** When editing global baseline: appTargetId chosen for SoftPad proxy (e.g. codex-chat). */
  var softPadScopeAppId = '';
  /** Explicit mapping pick when multiple scenarios share appTargetId. */
  var softPadScopeMappingIdOverride = '';
  /** 'none' | 'manual' | 'record' — session lock for SoftPad app scope. */
  var scopeLock = 'none';
  var autoPreselectDone = false;
  var autoPreselectHint = false;
  var scopeSessionMappingId = '';
  /** Frozen selection for in-flight key recording / wizard. */
  var recordSnap = null;

  var SOFTPAD_SCOPE_PRIMARY = [
    { appTargetId: 'codex-chat', kind: 'codex', titleKey: 'softPadHubKindCodex', titleFb: 'Codex' },
    { appTargetId: 'claude-code', kind: 'claude', titleKey: 'softPadHubKindClaude', titleFb: 'Claude' },
    { appTargetId: 'cursor-chat', kind: 'cursor', titleKey: 'softPadHubKindCursor', titleFb: 'Cursor' }
  ];

  function t(k, fb) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(k);
      if (v && v !== k) return v;
    }
    return fb || k;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg) {
    try {
      if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
        global.OneToneUiFeedback.toast(msg);
      }
    } catch (_) {}
  }

  function state() {
    return (global.OneToneState && global.OneToneState.state) || {};
  }

  function config() {
    return state().config || state().cfg || {};
  }

  function selectedMappingId() {
    return String(state().selectedMappingId || '').trim();
  }

  function mappingById(id) {
    var mappings = Array.isArray(config().mappings) ? config().mappings : [];
    for (var i = 0; i < mappings.length; i++) {
      if (mappings[i].id === id) return mappings[i];
    }
    return null;
  }

  function activeMapping() {
    var id = selectedMappingId();
    return id ? mappingById(id) : null;
  }

  function isAppScenarioMapping(m) {
    if (!m) return false;
    var diff = global.OneToneHabitOverrideDiff;
    if (diff && typeof diff.isAppScenarioMapping === 'function') {
      return !!diff.isAppScenarioMapping(m);
    }
    return !!String(m.appTargetId || '').trim();
  }

  function isGlobalKeysEditContext() {
    var m = activeMapping();
    if (!m) return true;
    return !isAppScenarioMapping(m);
  }

  function softPadScopePrimaryDef(appId) {
    var id = String(appId || '').trim();
    for (var i = 0; i < SOFTPAD_SCOPE_PRIMARY.length; i++) {
      if (SOFTPAD_SCOPE_PRIMARY[i].appTargetId === id) return SOFTPAD_SCOPE_PRIMARY[i];
    }
    return null;
  }

  function softPadAppTitle(appId) {
    var id = String(appId || '').trim();
    var def = softPadScopePrimaryDef(id);
    if (def) return t(def.titleKey, def.titleFb);
    var hub = global.OneToneSoftPadHub;
    if (hub && typeof hub.kindForAppId === 'function' && typeof hub.listSoftPadSchemes === 'function') {
      var kind = hub.kindForAppId(id);
      if (kind === 'workbuddy') return t('softPadHubKindWorkBuddy', 'WorkBuddy');
      if (kind === 'trae') return t('softPadHubKindTrae', 'Trae');
      if (kind === 'qoder') return t('softPadHubKindQoder', 'Qoder');
      if (kind === 'minimax') return t('softPadHubKindMinimax', 'MiniMax');
    }
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.presetById) {
      var p = presets.presetById(id);
      if (p && p.nameKey) {
        var n = t(p.nameKey);
        if (n && n !== p.nameKey) return n;
      }
      if (p && p.name) return String(p.name);
    }
    return id || t('keysSoftPadScopeApp', '应用');
  }

  function softPadAppIconSrc(appId) {
    var id = String(appId || '').trim();
    if (!id) return '';
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.presetById) {
      var p = presets.presetById(id);
      if (p && p.icon) return String(p.icon);
    }
    return '';
  }

  function softPadAppIconHtml(appId) {
    var src = softPadAppIconSrc(appId);
    if (!src) return '';
    return (
      '<img class="soft-pad-app-chip-icon" src="' +
      esc(src) +
      '" alt="" decoding="async" width="18" height="18" />'
    );
  }

  function softPadScopeChipHtml(appTargetId, title, opts) {
    opts = opts || {};
    var on = !!opts.active;
    var recordLocked = !!opts.recordLocked;
    return (
      '<button type="button" class="soft-pad-app-chip' +
      (on ? ' is-active' : '') +
      '" role="tab" data-softpad-scope-app="' +
      esc(appTargetId) +
      '" aria-selected="' +
      (on ? 'true' : 'false') +
      '"' +
      (recordLocked ? ' disabled' : '') +
      ' title="' +
      esc(title) +
      '">' +
      softPadAppIconHtml(appTargetId) +
      '<span>' +
      esc(title) +
      '</span></button>'
    );
  }

  function listScenariosForAppTargetId(appId) {
    var id = String(appId || '').trim();
    if (!id) return [];
    var list = Array.isArray(config().mappings) ? config().mappings : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !isAppScenarioMapping(m)) continue;
      if (String(m.appTargetId || '') === id) out.push(m);
    }
    return out;
  }

  function scenarioIsEnabled(m) {
    return !!(m && m.enabled !== false);
  }

  function scenarioHasPad(m) {
    return !!(m && m.codexMicroPad);
  }

  function scenarioPadSwitchOn(m) {
    return !!(m && m.codexMicroPad && m.codexMicroPad.enabled);
  }

  /**
   * Build SoftPad scope from a concrete mapping.
   * Pad object present (even if pad.enabled=false) → ready to show/bind.
   * No pad → missingScenario (prepare only; no Options/upsert).
   */
  function scopeFromMapping(mapping, base) {
    base = base || {};
    var appId = String(
      (mapping && mapping.appTargetId) || base.appTargetId || softPadScopeAppId || ''
    ).trim();
    var def = softPadScopePrimaryDef(appId);
    var ready = scenarioHasPad(mapping);
    var mid = mapping && mapping.id ? String(mapping.id) : '';
    return {
      scopeKind: base.scopeKind || (def ? def.kind : appId || 'app'),
      sourceMappingId: mid,
      targetMappingId: ready ? mid : '',
      title:
        base.title ||
        softPadAppTitle(appId) ||
        String((mapping && mapping.name) || ''),
      globalProxy: !!base.globalProxy,
      appTargetId: appId,
      missingScenario: !ready,
      ambiguous: false,
      scenarios: Array.isArray(base.scenarios) ? base.scenarios : []
    };
  }

  function resetSoftPadScopeSession() {
    softPadScopeAppId = '';
    softPadScopeMappingIdOverride = '';
    scopeLock = 'none';
    autoPreselectDone = false;
    autoPreselectHint = false;
    recordSnap = null;
  }

  function ensureSoftPadScopeSession() {
    var mid = selectedMappingId();
    if (scopeSessionMappingId && mid && scopeSessionMappingId !== mid) {
      resetSoftPadScopeSession();
    }
    if (keysStep() !== 'target') {
      resetSoftPadScopeSession();
      scopeSessionMappingId = mid;
      return;
    }
    scopeSessionMappingId = mid;
  }

  /**
   * SoftPad read/write context. Global edit requires an explicit app scope;
   * scenario edit uses the selected mapping directly (no chip UI).
   * Hub never decides which mapping to write — only app auto-preselect.
   */
  function resolveSoftPadScope() {
    var selected = activeMapping();
    if (selected && isAppScenarioMapping(selected)) {
      var appIdSel = String(selected.appTargetId || '').trim();
      return scopeFromMapping(selected, {
        globalProxy: false,
        appTargetId: appIdSel,
        title: softPadAppTitle(appIdSel) || String(selected.name || ''),
        scenarios: []
      });
    }
    var scopeApp = String(softPadScopeAppId || '').trim();
    if (!scopeApp) return null;
    var def = softPadScopePrimaryDef(scopeApp);
    var title = softPadAppTitle(scopeApp);
    var scenarios = listScenariosForAppTargetId(scopeApp);
    var base = {
      globalProxy: true,
      appTargetId: scopeApp,
      scopeKind: def ? def.kind : scopeApp,
      title: title,
      scenarios: scenarios
    };
    var override = String(softPadScopeMappingIdOverride || '').trim();

    if (override) {
      var overrideMap = mappingById(override);
      if (overrideMap && String(overrideMap.appTargetId || '') === scopeApp) {
        return scopeFromMapping(overrideMap, base);
      }
    }

    if (!scenarios.length) {
      return {
        scopeKind: def ? def.kind : scopeApp,
        sourceMappingId: '',
        targetMappingId: '',
        title: title,
        globalProxy: true,
        appTargetId: scopeApp,
        missingScenario: true,
        ambiguous: false,
        scenarios: []
      };
    }

    if (scenarios.length === 1) {
      return scopeFromMapping(scenarios[0], base);
    }

    // ponytail: canonical pick — preset apps should have at most one enabled scenario after reconcile
    var hubCanon = global.OneToneHabitHub;
    var canonical =
      hubCanon && hubCanon.pickCanonicalAppScenario
        ? hubCanon.pickCanonicalAppScenario(scenarios)
        : null;
    if (canonical) {
      return scopeFromMapping(canonical, base);
    }

    var enabled = [];
    var i;
    for (i = 0; i < scenarios.length; i++) {
      if (scenarioIsEnabled(scenarios[i])) enabled.push(scenarios[i]);
    }
    if (enabled.length === 1) {
      return scopeFromMapping(enabled[0], base);
    }
    // Legacy fallback only — normal data should not reach ambiguous after reconcile.
    return {
      scopeKind: def ? def.kind : scopeApp,
      sourceMappingId: '',
      targetMappingId: '',
      title: title,
      globalProxy: true,
      appTargetId: scopeApp,
      missingScenario: false,
      ambiguous: true,
      scenarios: scenarios
    };
  }

  function softPadWorkMapping() {
    var ctx = resolveSoftPadScope();
    if (!ctx || !ctx.targetMappingId) return null;
    return mappingById(ctx.targetMappingId);
  }

  function softPadWorkMappingId() {
    var ctx = resolveSoftPadScope();
    return ctx && ctx.targetMappingId ? String(ctx.targetMappingId) : '';
  }

  function softPadAuthorityReady(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return false;
    return softPadViewsMappingId === mid && bindableMappingId === mid;
  }

  function softPadAuthorityPending(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return false;
    return !softPadAuthorityReady(mid);
  }

  function canRecordSoftPadSelection(ctx) {
    var mid = String((ctx && ctx.targetMappingId) || '');
    return !!(
      selection &&
      selection.sourceChannel === 'softPad' &&
      selection.mappingId === mid &&
      softPadAuthorityReady(mid) &&
      bindableMappingId === mid &&
      bindableByAction[selection.actionId] === true
    );
  }

  function setSoftPadScopeAppId(appId, opts) {
    opts = opts || {};
    if (scopeLock === 'record' && !opts.force) {
      toast(t('keysSoftPadScopeRecordLocked', '录制中不可切换应用作用域'));
      return;
    }
    softPadScopeAppId = String(appId || '').trim();
    softPadScopeMappingIdOverride = '';
    if (opts.fromAuto) {
      autoPreselectHint = true;
    } else {
      scopeLock = 'manual';
      autoPreselectHint = false;
      autoPreselectDone = true;
    }
    if (!(opts && opts.skipClear)) clearSelection({ skipRender: true, skipHero: true });
    if (!(opts && opts.skipRender)) {
      if (opts && opts.refresh) refresh();
      else renderPanelOnly();
    }
    if (!(opts && opts.skipHero)) applyHero();
  }

  function setSoftPadScopeMappingOverride(mappingId, opts) {
    opts = opts || {};
    if (scopeLock === 'record' && !opts.force) {
      toast(t('keysSoftPadScopeRecordLocked', '录制中不可切换应用作用域'));
      return;
    }
    softPadScopeMappingIdOverride = String(mappingId || '').trim();
    scopeLock = 'manual';
    autoPreselectHint = false;
    autoPreselectDone = true;
    if (!(opts && opts.skipClear)) clearSelection({ skipRender: true, skipHero: true });
    if (!(opts && opts.skipRender)) {
      if (opts.refresh) refresh();
      else renderPanelOnly();
    }
    if (!(opts && opts.skipHero)) applyHero();
  }

  function isKnownSoftPadAppTargetId(appId) {
    var id = String(appId || '').trim();
    if (!id || id === 'custom') return false;
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.isWorkflowAppTarget && presets.isWorkflowAppTarget(id)) return true;
    if (presets && presets.presetById && presets.presetById(id)) return true;
    return !!softPadScopePrimaryDef(id);
  }

  function maybeAutoPreselectSoftPadScope() {
    if (!isGlobalKeysEditContext()) return false;
    if (activeTab !== 'softPad') return false;
    if (String(softPadScopeAppId || '').trim()) return false;
    if (scopeLock !== 'none') return false;
    if (autoPreselectDone) return false;
    autoPreselectDone = true;
    var hub = global.OneToneSoftPadHub;
    var fg = '';
    if (hub && typeof hub.getFreshForegroundAppId === 'function') {
      fg = String(hub.getFreshForegroundAppId() || '').trim();
    }
    if (fg && isKnownSoftPadAppTargetId(fg)) {
      softPadScopeAppId = fg;
      softPadScopeMappingIdOverride = '';
      autoPreselectHint = true;
      return true;
    }
    // Fallback: first primary app with an enabled mapping that has a pad, else Codex.
    var i;
    for (i = 0; i < SOFTPAD_SCOPE_PRIMARY.length; i++) {
      var appId = SOFTPAD_SCOPE_PRIMARY[i].appTargetId;
      var sc = listScenariosForAppTargetId(appId);
      var hasReady = false;
      var j;
      for (j = 0; j < sc.length; j++) {
        if (scenarioIsEnabled(sc[j]) && scenarioHasPad(sc[j])) {
          hasReady = true;
          break;
        }
      }
      if (hasReady) {
        softPadScopeAppId = appId;
        softPadScopeMappingIdOverride = '';
        autoPreselectHint = false;
        return true;
      }
    }
    softPadScopeAppId = 'codex-chat';
    softPadScopeMappingIdOverride = '';
    autoPreselectHint = false;
    return true;
  }

  /** Ensure SoftPad tab always has an app scope so the pad stage can render. */
  function ensureSoftPadDefaultScope() {
    if (!isGlobalKeysEditContext()) return false;
    if (activeTab !== 'softPad') return false;
    if (String(softPadScopeAppId || '').trim()) return false;
    if (scopeLock === 'manual' || scopeLock === 'record') return false;
    if (!autoPreselectDone) return maybeAutoPreselectSoftPadScope();
    // auto already ran and left empty (should not happen) — force Codex
    softPadScopeAppId = 'codex-chat';
    softPadScopeMappingIdOverride = '';
    return true;
  }

  function keysStep() {
    try {
      if (global.OneToneKeysPageState && global.OneToneKeysPageState.getStep) {
        return String(global.OneToneKeysPageState.getStep() || 'trigger');
      }
    } catch (_) {}
    return 'trigger';
  }

  function finishSendMode() {
    var cfg = config();
    var end = cfg.voiceEnd || cfg.voice_end || {};
    return String(end.sendMode || end.send_mode || 'manual').toLowerCase();
  }

  function canonicalActionId(raw) {
    if (global.OneToneAgentActions && global.OneToneAgentActions.resolveCanonicalActionId) {
      return global.OneToneAgentActions.resolveCanonicalActionId(raw, finishSendMode());
    }
    return String(raw || '').trim();
  }

  function isSemanticKeyAction(actionId) {
    var id = String(actionId || '').trim();
    if (!id) return false;
    if (id.indexOf('.') >= 0) return true;
    return id === 'app.shortcut' || id === 'app.open';
  }

  function defaultChordForSlot(slotId) {
    var A = global.OneToneAgentActions;
    var id = String(slotId || '').trim();
    if (!id) return '';
    if (A && typeof A.defaultKeyForSlot === 'function') {
      return String(A.defaultKeyForSlot(id) || '').trim();
    }
    if (A && A.DEFAULT_KEY_BY_SLOT) {
      return String(A.DEFAULT_KEY_BY_SLOT[id] || '').trim();
    }
    return '';
  }

  function actionIdFromSlot(slotId) {
    var sid = String(slotId || '').trim();
    if (!sid) return '';
    if (sid === 'stopOrSend') return canonicalActionId('stopOrSendDictation');
    var A = global.OneToneAgentActions;
    var slot = A && A.slotById ? A.slotById(sid) : null;
    var raw = slot ? String(slot.actionId || sid) : sid;
    if (raw === 'stopOrSendDictation' || raw === 'stopOrSend') {
      return canonicalActionId('stopOrSendDictation');
    }
    return canonicalActionId(raw);
  }

  function keyBindingOnSlot(m, slotId) {
    if (!m || !slotId) return null;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b && b.slotId === slotId && b.triggerType === 'key') return b;
    }
    return null;
  }

  function friendlyChord(chord) {
    var raw = String(chord || '').trim();
    if (!raw) return '';
    try {
      var hooks = global.__vp_mapping_recording_hooks__;
      if (hooks && hooks.friendlyKeyName) return hooks.friendlyKeyName(raw);
    } catch (_) {}
    return raw;
  }

  function normalizeChord(chord) {
    return String(chord || '')
      .trim()
      .toLowerCase()
      .replace(/\s*\+\s*/g, '+')
      .replace(/\s+/g, '');
  }

  function actionLabel(actionId) {
    var store = global.OneToneSemanticActionStore;
    if (store && store.entryMeta) {
      var meta = store.entryMeta(actionId);
      if (meta) {
        var lang = (global.OneToneI18n && global.OneToneI18n.lang) || 'zh';
        if (lang === 'en' && meta.labelEn) return meta.labelEn;
        if (meta.labelZh) return meta.labelZh;
        if (meta.label_zh) return meta.label_zh;
        if (meta.labelEn) return meta.labelEn;
      }
    }
    var A = global.OneToneAgentActions;
    if (A && A.resolveCanonicalActionId && A.actionById) {
      var legacy = A.actionById(String(actionId || '').split('.').pop());
      if (legacy) {
        var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
        return en ? legacy.labelEn || legacy.labelZh : legacy.labelZh || legacy.labelEn;
      }
    }
    return String(actionId || '').trim() || '—';
  }

  function gestureLabel(ref) {
    var map = {
      onAway: 'keysChannelGestureOnAway',
      onReturn: 'keysChannelGestureOnReturn',
      shakeHead: 'keysChannelGestureShakeHead',
      deliberateBlink: 'keysChannelGestureDeliberateBlink',
      openPalm: 'keysChannelGestureOpenPalm',
      okHand: 'keysChannelGestureOkHand',
      fist: 'keysChannelGestureFist',
      wave: 'keysChannelGestureWave'
    };
    var key = map[ref];
    return key ? t(key, ref) : String(ref || '');
  }

  function channelOnlyLabel(channel) {
    var name =
      channel === 'voice'
        ? t('keysChannelTabVoice', '语音命令')
        : channel === 'softPad'
          ? t('keysChannelTabSoftPad', '虚拟键盘')
          : t('keysChannelTabCamera', '摄像头操作');
    return t('keysChannelKeyOnly', '仅{channel}可用').replace('{channel}', name);
  }

  function viewRef(v) {
    return String((v && (v.bindingRef || v.binding_ref)) || '').trim();
  }

  function viewChannel(v) {
    return String((v && v.channel) || '').trim();
  }

  function viewActionId(v) {
    return canonicalActionId((v && (v.actionId || v.action_id)) || '');
  }

  function viewTrigger(v) {
    return String((v && v.trigger) || '').trim();
  }

  function findKeyBinding(m, actionId, actionInstanceId) {
    if (!m) return null;
    var want = canonicalActionId(actionId);
    var wantInst = String(actionInstanceId || '').trim();
    var multi =
      global.OneToneActionBindingAdapters &&
      global.OneToneActionBindingAdapters.isMultiInstance &&
      global.OneToneActionBindingAdapters.isMultiInstance(want);
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.triggerType !== 'key') continue;
      if (canonicalActionId(b.actionId) !== want) continue;
      if (multi) {
        if (wantInst && String(b.actionInstanceId || '') === wantInst) return b;
        continue;
      }
      return b;
    }
    return null;
  }

  function softPadViewsForResolve(mappingId) {
    var mid = String(mappingId || softPadWorkMappingId() || '').trim();
    var rows = [];
    if (mid && softPadViewsMappingId === mid) rows = softPadViewsCache;
    else if (mid && selectedMappingId() === mid) rows = viewsCache;
    return (rows || []).filter(function (v) {
      return viewChannel(v) === 'softPad' && v.enabled !== false;
    });
  }

  function routeOnPad(pad, microKeyId) {
    if (!pad || !Array.isArray(pad.keys) || !microKeyId) return null;
    for (var i = 0; i < pad.keys.length; i++) {
      if (pad.keys[i] && pad.keys[i].microKeyId === microKeyId) return pad.keys[i];
    }
    return null;
  }

  function findAgentBindingPreferSoftPad(m, slotId) {
    if (!m || !slotId) return null;
    var list = m.agentBindings || [];
    var soft = null;
    var key = null;
    var any = null;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.slotId !== slotId) continue;
      if (b.triggerType === 'softPad' && !soft) soft = b;
      else if (b.triggerType === 'key' && !key) key = b;
      else if (!any) any = b;
    }
    return soft || key || any;
  }

  /**
   * Resolve a Soft Pad microKey to a key-channel-migratable action.
   * sourceBindingRef must stay microKeyId; keyBindingRef only from findKeyBinding.
   * opts.skipBindable: peek actionId before Options map is loaded.
   */
  function resolveMigratableAction(m, microKeyId, opts) {
    var mid = String(microKeyId || '').trim();
    if (!mid || mid === 'ENC' || mid === 'JOY' || /^NAV_/.test(mid)) return null;
    if (/^NPAD_/.test(mid) || /^NUM_/.test(mid)) return null;

    var workMid = String((m && m.id) || '').trim();
    if (!(opts && opts.skipBindable) && softPadAuthorityPending(workMid)) return null;
    var views = softPadViewsForResolve(workMid);
    var v = null;
    var i;
    for (i = 0; i < views.length; i++) {
      if (viewRef(views[i]) === mid) {
        v = views[i];
        break;
      }
    }
    if (!v) {
      for (i = 0; i < views.length; i++) {
        if (viewTrigger(views[i]) === mid) {
          v = views[i];
          break;
        }
      }
    }

    var pad = m && m.codexMicroPad;
    var route = routeOnPad(pad, mid);
    var slotId =
      route && route.enabled !== false ? String(route.slotId || '').trim() : '';

    if (!v && slotId) {
      for (i = 0; i < views.length; i++) {
        if (viewRef(views[i]) === slotId) {
          v = views[i];
          break;
        }
      }
    }

    var actionId = '';
    var sourceBinding = null;
    if (v) {
      actionId = viewActionId(v);
      var vRef = viewRef(v);
      sourceBinding = findAgentBindingPreferSoftPad(m, vRef);
      if (!sourceBinding && slotId && slotId !== vRef) {
        sourceBinding = findAgentBindingPreferSoftPad(m, slotId);
      }
      // Projection views use microKeyId as bindingRef; args live on key binding at route.slotId.
      if ((!sourceBinding || sourceBinding.triggerType === 'key') && slotId) {
        var bySlot = findAgentBindingPreferSoftPad(m, slotId);
        if (bySlot) sourceBinding = bySlot;
      }
    }

    if (!actionId && slotId) {
      sourceBinding = findAgentBindingPreferSoftPad(m, slotId);
      if (sourceBinding) actionId = canonicalActionId(sourceBinding.actionId);
    }

    if (!actionId && slotId) {
      actionId = actionIdFromSlot(slotId);
    }

    actionId = canonicalActionId(actionId);
    if (!actionId && !slotId) return null;

    var actionInstanceId = '';
    var actionArgs = null;

    if (sourceBinding) {
      var srcAid = canonicalActionId(sourceBinding.actionId);
      if (isSemanticKeyAction(srcAid)) {
        actionId = srcAid;
        actionInstanceId = String(sourceBinding.actionInstanceId || '').trim();
        actionArgs = sourceBinding.actionArgs != null ? sourceBinding.actionArgs : null;
      }
    }

    // Legacy Soft Pad hotkey slots → app.shortcut + default/output chord.
    if (!isSemanticKeyAction(actionId)) {
      if (!slotId) return null;
      var chord = '';
      var keyOnSlot = keyBindingOnSlot(m, slotId);
      if (keyOnSlot) {
        chord = String(keyOnSlot.triggerBinding || '').trim();
      }
      if (!chord) chord = defaultChordForSlot(slotId);
      if (!chord) {
        var slotted = actionIdFromSlot(slotId);
        if (isSemanticKeyAction(slotted)) {
          actionId = slotted;
        } else {
          return null;
        }
      } else {
        actionId = 'app.shortcut';
        actionInstanceId = 'softpad-mig:' + mid;
        actionArgs = { chord: chord };
      }
    }

    if (!(opts && opts.skipBindable) && bindableByAction[actionId] === false) {
      return null;
    }

    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    return {
      microKeyId: mid,
      actionId: actionId,
      actionInstanceId: actionInstanceId,
      actionArgs: actionArgs,
      keyBindingRef: keyB ? String(keyB.slotId || '') : '',
      uiIconId: route ? String(route.uiIconId || '').trim() : '',
      sourceTriggerType: sourceBinding ? String(sourceBinding.triggerType || '') : ''
    };
  }

  /** Non-mutating Soft Pad preview (never call ensurePad). */
  function previewPadClone(m) {
    var src = m && m.codexMicroPad;
    if (src && typeof src === 'object') {
      return Object.assign({}, src, {
        enabled: true,
        keys: Array.isArray(src.keys) ? src.keys.slice() : []
      });
    }
    return { enabled: true, keys: [], skin: '' };
  }

  function findMicroKeyForSlotLocal(m, slotId) {
    var pad = m && m.codexMicroPad;
    if (!pad || !Array.isArray(pad.keys) || !slotId) return '';
    for (var i = 0; i < pad.keys.length; i++) {
      var k = pad.keys[i];
      if (k && k.enabled !== false && k.slotId === slotId) return String(k.microKeyId || '');
    }
    return '';
  }

  function findChordConflict(m, chord, excludeSlotId) {
    var cap = global.OneToneAgentCapabilityUi;
    if (cap && cap.findChordConflict) {
      return cap.findChordConflict(m, chord, excludeSlotId || '');
    }
    var norm = normalizeChord(chord);
    if (!norm || !m) return null;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.triggerType !== 'key' || b.enabled === false) continue;
      if (excludeSlotId && b.slotId === excludeSlotId) continue;
      if (normalizeChord(b.triggerBinding) === norm) {
        return { kind: 'capability', slotId: b.slotId, label: b.slotId };
      }
    }
    if (normalizeChord(m.triggerKey) === norm) {
      return { kind: 'trigger', label: t('codexCapConflictTrigger', '触发键') };
    }
    if (normalizeChord(m.targetKey) === norm) {
      return { kind: 'ime', label: t('codexCapConflictIme', '语音识别键') };
    }
    return null;
  }

  function getSelection() {
    return selection;
  }

  function hasSelection() {
    return !!(selection && selection.mappingId && selection.actionId);
  }

  function clearSelection(opts) {
    var had = !!selection;
    selection = null;
    if (had && !(opts && opts.skipHero)) applyHero();
    if (had && !(opts && opts.skipRender)) renderPanelOnly();
    if (had && global.OneToneCodexMicroPadUi && global.OneToneCodexMicroPadUi.notifySelection) {
      try {
        global.OneToneCodexMicroPadUi.notifySelection('');
      } catch (_) {}
    }
  }

  function setSelection(next, opts) {
    selection = next
      ? {
          mappingId: String(next.mappingId || ''),
          sourceChannel: String(next.sourceChannel || ''),
          sourceBindingRef: String(next.sourceBindingRef || ''),
          actionId: String(next.actionId || ''),
          keyBindingRef: String(next.keyBindingRef || ''),
          actionInstanceId: String(next.actionInstanceId || ''),
          actionArgs: next.actionArgs != null ? next.actionArgs : null,
          iconHtml: next.iconHtml != null ? String(next.iconHtml) : ''
        }
      : null;
    if (!(opts && opts.skipHero)) applyHero();
    if (!(opts && opts.skipRender)) renderPanelOnly();
  }

  /** Codex chip bridge: sourceBindingRef is microKeyId only; keyBindingRef from key binding. */
  function selectFromSlotId(mappingId, slotId) {
    var mid = String(mappingId || selectedMappingId() || '').trim();
    var sid = String(slotId || '').trim();
    if (!mid || !sid) {
      clearSelection();
      return;
    }
    var m = mappingById(mid);
    var microId = findMicroKeyForSlotLocal(m, sid);
    if (microId) {
      var resolved = resolveMigratableAction(m, microId);
      if (resolved) {
        setSelection({
          mappingId: mid,
          sourceChannel: 'softPad',
          sourceBindingRef: microId,
          actionId: resolved.actionId,
          keyBindingRef: resolved.keyBindingRef || '',
          actionInstanceId: resolved.actionInstanceId || '',
          actionArgs: resolved.actionArgs
        });
        return;
      }
    }
    var keyB = null;
    var list = (m && m.agentBindings) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slotId === sid && list[i].triggerType === 'key') {
        keyB = list[i];
        break;
      }
    }
    var actionId = keyB
      ? canonicalActionId(keyB.actionId)
      : (function () {
          var A = global.OneToneAgentActions;
          var slot = A && A.slotById ? A.slotById(sid) : null;
          return slot ? canonicalActionId(slot.actionId) : '';
        })();
    if (!actionId || !keyB) {
      clearSelection();
      return;
    }
    setSelection({
      mappingId: mid,
      sourceChannel: 'softPad',
      sourceBindingRef: '',
      actionId: actionId,
      keyBindingRef: String(keyB.slotId || ''),
      actionInstanceId: String(keyB.actionInstanceId || ''),
      actionArgs: keyB.actionArgs != null ? keyB.actionArgs : null
    });
  }

  function selectedSlotId() {
    if (!selection) return '';
    return selection.keyBindingRef || '';
  }

  function syncSelectionToMapping(mid) {
    mid = String(mid || selectedMappingId() || '').trim();
    if (!selection) return;
    if (selection.mappingId === mid) return;
    var ctx = resolveSoftPadScope();
    if (ctx && ctx.targetMappingId && selection.mappingId === ctx.targetMappingId) {
      return;
    }
    clearSelection({ skipRender: true });
  }

  function onStepChange(step) {
    ensureSoftPadScopeSession();
    if (String(step || '') !== 'target') {
      clearSelection({ skipHero: false });
    } else {
      refresh();
    }
  }

  function heroModel() {
    if (!selection || !selection.mappingId || keysStep() !== 'target') {
      return {
        active: false,
        targetLabel: '',
        targetEmpty: true,
        iconHtml: '',
        actionId: '',
        chord: '',
        sourceChannel: '',
        scopeTitle: ''
      };
    }
    var ctx = resolveSoftPadScope();
    var allowed =
      selection.mappingId === selectedMappingId() ||
      !!(ctx && ctx.targetMappingId && selection.mappingId === ctx.targetMappingId);
    if (!allowed) {
      return {
        active: false,
        targetLabel: '',
        targetEmpty: true,
        iconHtml: '',
        actionId: '',
        chord: '',
        sourceChannel: '',
        scopeTitle: ''
      };
    }
    var m = mappingById(selection.mappingId);
    var keyB = findKeyBinding(m, selection.actionId, selection.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var label = actionLabel(selection.actionId);
    var scopeTitle =
      selection.sourceChannel === 'softPad' && ctx && ctx.title ? String(ctx.title) : '';
    var prefixed = scopeTitle ? scopeTitle + ' · ' + label : label;
    return {
      active: true,
      actionId: selection.actionId,
      chord: chord,
      targetLabel: chord
        ? prefixed + ' · ' + friendlyChord(chord)
        : prefixed + ' · ' + t('keysHeroActionNeedsKey', '待设置快捷键'),
      targetEmpty: !chord,
      iconHtml: selection.iconHtml || '',
      sourceChannel: selection.sourceChannel || '',
      scopeTitle: scopeTitle
    };
  }

  function syncActionIconHost(iconHtml) {
    var iconHost = document.getElementById('keysTargetActionIconHost');
    if (!iconHost) return;
    var html = String(iconHtml || '').trim();
    if (html) {
      iconHost.innerHTML = html;
      iconHost.hidden = false;
      iconHost.setAttribute('aria-hidden', 'false');
    } else {
      iconHost.innerHTML = '';
      iconHost.hidden = true;
      iconHost.setAttribute('aria-hidden', 'true');
    }
  }

  function applyHero() {
    var badge = document.getElementById('keysTargetModeBadge');
    var hint = document.getElementById('keysTargetKeycapHint');
    var targetEl = document.getElementById('targetView');
    var targetDisp = document.getElementById('targetDisplay');
    var host = document.getElementById('habitKeyMapCellTarget');
    var imeIcon = document.getElementById('targetImeIconMapping');
    var appBadge = document.getElementById('targetAppBadgeMapping');
    var hm = heroModel();
    var m = selection ? mappingById(selection.mappingId) : null;

    if (selection && hm.active) {
      var keyB = findKeyBinding(m, selection.actionId, selection.actionInstanceId);
      // keyBindingRef only from existing key binding — never softPad/route slotId.
      selection.keyBindingRef = keyB ? String(keyB.slotId || '') : '';
      if (keyB && keyB.actionInstanceId && !selection.actionInstanceId) {
        selection.actionInstanceId = String(keyB.actionInstanceId);
      }
      if (keyB && keyB.actionArgs != null && selection.actionArgs == null) {
        selection.actionArgs = keyB.actionArgs;
      }
      if (badge) {
        badge.textContent = hm.scopeTitle
          ? hm.scopeTitle + ' · ' + t('keysHeroModeAction', '动作快捷键')
          : t('keysHeroModeAction', '动作快捷键');
        badge.classList.add('is-action');
      }
      if (imeIcon) imeIcon.hidden = true;
      if (appBadge) {
        appBadge.hidden = true;
        appBadge.setAttribute('aria-hidden', 'true');
      }
      syncActionIconHost(hm.iconHtml);
      if (global.__otMappingEditorDisplayMounted && typeof global.__otMappingEditorDisplaySync === 'function') {
        global.__otMappingEditorDisplaySync();
      } else if (targetEl) {
        targetEl.textContent = hm.targetLabel;
      }
      if (targetDisp) {
        targetDisp.classList.toggle('empty', !!hm.targetEmpty);
        targetDisp.classList.add('is-codex-cap-edit');
      }
      if (host) host.classList.add('is-codex-cap-edit');
      if (hint) {
        hint.textContent = t('keysHeroActionHint', '点击录制动作快捷键 · 再点列表项退出');
      }
      return true;
    }

    if (badge) {
      badge.textContent = t('keysHeroModeIme', '输入法识别键');
      badge.classList.remove('is-action');
    }
    syncActionIconHost('');
    if (targetDisp) targetDisp.classList.remove('is-codex-cap-edit');
    if (host) host.classList.remove('is-codex-cap-edit');
    if (global.__otMappingEditorDisplayMounted && typeof global.__otMappingEditorDisplaySync === 'function') {
      global.__otMappingEditorDisplaySync();
    }
    // Leave IME badges/text to mapping-list / IME presets.
    return false;
  }

  function filteredViews(channel) {
    return (viewsCache || []).filter(function (v) {
      if (viewChannel(v) !== channel) return false;
      if (v.enabled === false) return false;
      var aid = viewActionId(v);
      var ref = viewRef(v);
      if (!aid || !ref) return false;
      // Lifecycle covered by FE bridges — avoid duplicate rows.
      if (
        channel === 'voice' &&
        (aid === VOICE_LIFECYCLE_IDS.start ||
          aid === VOICE_LIFECYCLE_IDS.cancel ||
          aid === VOICE_LIFECYCLE_IDS.endCommit ||
          aid === VOICE_LIFECYCLE_IDS.endSend)
      ) {
        return false;
      }
      return true;
    });
  }

  function primaryWakePhrase() {
    var cfg = config();
    var lists = [];
    var sapi = cfg.voiceSapi || cfg.voice_sapi || {};
    var vosk = cfg.voiceVosk || cfg.voice_vosk || {};
    if (Array.isArray(sapi.phrases)) lists = lists.concat(sapi.phrases);
    if (Array.isArray(vosk.phrases)) lists = lists.concat(vosk.phrases);
    for (var i = 0; i < lists.length; i++) {
      var p = String(lists[i] || '').trim();
      if (p) return p;
    }
    return t('keysVoiceBridgeStartPhraseFallback', '开始听写');
  }

  function finishSendModeLabel() {
    var cfg = config();
    var end = cfg.voiceEnd || cfg.voice_end || {};
    var mode = String(end.sendMode || end.send_mode || 'manual').toLowerCase();
    if (mode === 'auto') return t('keysVoiceBridgeEndSend', '结束并发送');
    return t('keysVoiceBridgeEndCommit', '结束听写');
  }

  /**
   * Translate voice-page lifecycle into reusable intents for recognition.
   * Does not expand BindingView; end/send only guides to step 03.
   */
  function appDisplayName(appId) {
    var id = String(appId || '').trim();
    if (!id) return '';
    var ab = global.OneToneAppBehaviorRules;
    if (ab && ab.appDisplayName) {
      try {
        return String(ab.appDisplayName(id, null) || id);
      } catch (_) {}
    }
    var atp = global.OneToneAppTargetPresets;
    if (atp && atp.presetById) {
      var p = atp.presetById(id);
      if (p && p.nameKey) {
        var n = t(p.nameKey);
        if (n && n !== p.nameKey) return n;
      }
      if (p && p.name) return String(p.name);
    }
    return id;
  }

  function openAppAcousticProjection() {
    var m = activeMapping();
    if (!m) return null;
    var appId = String(m.appTargetId || '').trim();
    if (!appId || appId === 'custom') return null;
    var cmds = Array.isArray(m.acousticVoiceCommands) ? m.acousticVoiceCommands : [];
    var cmd = null;
    for (var i = 0; i < cmds.length; i++) {
      if (cmds[i]) {
        cmd = cmds[i];
        break;
      }
    }
    var name = appDisplayName(appId);
    var note = '';
    if (cmd) {
      note = String(cmd.displayText || cmd.display_text || '').trim();
    }
    var sourceRef = cmd
      ? String(cmd.id || cmd.commandId || cmd.command_id || 'acmd-' + (m.id || '')).trim()
      : 'open-app:' + (m.id || appId);
    return {
      kind: 'bind',
      actionId: 'app.open',
      bindingRef: 'open-app-acoustic:' + sourceRef,
      actionInstanceId: 'app-open:' + String(m.id || ''),
      name: t('keysVoiceBridgeOpenApp', '打开应用') + ' · ' + name,
      sub:
        t('keysVoiceBridgeOpenAppSub', '口令') +
        (note ? ' · ' + note : '') +
        ' · ' +
        t('keysVoiceBridgeOpenAppMigratable', '可迁移为按键，不改语音配置'),
      offerIme: false,
      sourceKind: 'open-app-acoustic',
      transferable: true
    };
  }

  function voiceLifecycleBridges() {
    var rows = [
      {
        kind: 'bind',
        actionId: VOICE_LIFECYCLE_IDS.start,
        bindingRef: 'voice-lifecycle:start',
        name: t('keysVoiceBridgeStart', '开始听写'),
        sub:
          t('keysVoiceBridgeStartSub', '语音口令') +
          ' · ' +
          primaryWakePhrase() +
          ' · ' +
          t('keysVoiceBridgeStartOrIme', '可补按键，或改用输入法识别键'),
        offerIme: true
      },
      {
        kind: 'bind',
        actionId: VOICE_LIFECYCLE_IDS.cancel,
        bindingRef: 'voice-lifecycle:cancel',
        name: t('keysVoiceBridgeCancel', '取消'),
        sub: t('keysVoiceBridgeCancelSub', '对应语义 input.cancel · 可补动作快捷键'),
        offerIme: false
      },
      {
        kind: 'guide-finish',
        actionId: VOICE_LIFECYCLE_IDS.endCommit,
        bindingRef: 'voice-lifecycle:end',
        name: finishSendModeLabel(),
        sub: t('keysVoiceBridgeEndSub', '在 03 收尾配置，不在识别区重复建键'),
        offerIme: false
      }
    ];
    var openProj = openAppAcousticProjection();
    if (openProj) rows.unshift(openProj);
    return rows;
  }

  function existingAppShortcutRows(m) {
    if (!m || !Array.isArray(m.agentBindings)) return [];
    var out = [];
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (!b || b.triggerType !== 'key') continue;
      if (canonicalActionId(b.actionId) !== 'app.shortcut') continue;
      var chordOut =
        b.actionArgs && b.actionArgs.chord
          ? String(b.actionArgs.chord)
          : '';
      out.push({
        kind: 'bind',
        actionId: 'app.shortcut',
        bindingRef: String(b.slotId || ''),
        actionInstanceId: String(b.actionInstanceId || ''),
        actionArgs: b.actionArgs || null,
        name:
          t('keysAppShortcutRow', '应用快捷键') +
          (chordOut ? ' · ' + friendlyChord(chordOut) : ''),
        sub:
          t('keysAppShortcutTrigger', '触发') +
          ' · ' +
          (friendlyChord(b.triggerBinding) || t('keysHeroActionNeedsKey', '待设置快捷键')),
        offerIme: false
      });
    }
    return out;
  }

  function rowsForActiveTab() {
    if (activeTab === 'voice') {
      return { bridges: voiceLifecycleBridges(), views: filteredViews('voice'), footer: null };
    }
    if (activeTab === 'softPad') {
      return {
        kind: 'softPadKeyboard',
        bridges: existingAppShortcutRows(activeMapping()),
        views: [],
        footer: {
          kind: 'add-app-shortcut',
          label: t('keysAddAppShortcut', '＋ 添加应用快捷键')
        }
      };
    }
    return { bridges: [], views: filteredViews(activeTab), footer: null };
  }

  function sourceSubline(channel, v) {
    var trig = viewTrigger(v);
    if (channel === 'voice') {
      return t('keysChannelTriggerPhrase', '口令') + (trig ? ' · ' + trig : '');
    }
    if (channel === 'camera') {
      return t('keysChannelGesture', '手势') + ' · ' + gestureLabel(viewRef(v));
    }
    return t('keysChannelPadKey', '键位') + (trig ? ' · ' + trig : '');
  }

  function emptyCopy(channel) {
    if (channel === 'voice') {
      return t('keysChannelEmptyVoice', '当前习惯暂无可适配为快捷键的语音命令');
    }
    if (channel === 'softPad') {
      return t('keysChannelEmptySoftPad', '当前习惯暂无可适配为快捷键的虚拟键盘命令');
    }
    if (channel === 'camera') {
      return t('keysChannelEmptyCamera', '当前习惯暂无可适配为快捷键的摄像头动作');
    }
    return t('keysChannelEmpty', '当前习惯暂无可适配为快捷键的命令');
  }

  function guideToSoftPadSettings() {
    var ctx = resolveSoftPadScope();
    var workMid =
      (ctx && ctx.targetMappingId) ||
      (ctx && ctx.sourceMappingId) ||
      '';
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.setPanel) {
      try {
        if (workMid) drawer.setPanel('softPad', { mappingId: workMid });
        else drawer.setPanel('softPad');
        return;
      } catch (_) {}
    }
    toast(t('keysChannelGoSoftPad', '去虚拟键盘配置'));
  }

  function persistSoftPadMapping(m) {
    if (!m) return;
    try {
      if (global.OneToneCodexMicroPadUi && global.OneToneCodexMicroPadUi.persist) {
        global.OneToneCodexMicroPadUi.persist();
        return;
      }
    } catch (_) {}
    try {
      if (global.OneToneConfigApi && global.OneToneConfigApi.save) {
        global.OneToneConfigApi.save();
      }
    } catch (_) {}
  }

  function prepareSoftPadScopeScenario() {
    var appId = String(softPadScopeAppId || '').trim();
    if (!appId && isGlobalKeysEditContext()) return;
    var ctx = resolveSoftPadScope();
    var sourceId = ctx && ctx.sourceMappingId ? String(ctx.sourceMappingId) : '';
    var PadUi = global.OneToneCodexMicroPadUi;
    var hub = global.OneToneHabitHub;
    var target = null;

    if (sourceId) {
      target = mappingById(sourceId);
      if (!target) {
        toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
        return;
      }
      if (!target.codexMicroPad) {
        if (!PadUi || typeof PadUi.ensurePad !== 'function') {
          toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
          return;
        }
        PadUi.ensurePad(target, { persist: true });
        persistSoftPadMapping(target);
      }
      softPadScopeMappingIdOverride = String(target.id || '');
      softPadScopeAppId = String(target.appTargetId || appId || softPadScopeAppId);
      toast(
        t('keysSoftPadScopePrepared', '已准备 {app} 虚拟键盘').replace(
          '{app}',
          softPadAppTitle(softPadScopeAppId)
        )
      );
      refresh();
      return;
    }

    // No resolved scenario — create only when none exist for this app.
    var existing = listScenariosForAppTargetId(appId);
    if (existing.length) {
      toast(t('keysSoftPadScopeAmbiguous', '该应用有多个场景，请选择'));
      return;
    }

    if (
      appId === 'codex-chat' &&
      global.OneToneAgentScenarioTemplate &&
      global.OneToneAgentScenarioTemplate.findOrCreateCodexScenario
    ) {
      var res = global.OneToneAgentScenarioTemplate.findOrCreateCodexScenario();
      target = res && res.mapping ? res.mapping : null;
    } else if (hub && hub.createAppScenario) {
      target = hub.createAppScenario(appId);
    }
    if (!target) {
      toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
      return;
    }
    if (!target.codexMicroPad && PadUi && typeof PadUi.ensurePad === 'function') {
      PadUi.ensurePad(target, { persist: true });
      persistSoftPadMapping(target);
    }
    softPadScopeMappingIdOverride = String(target.id || '');
    softPadScopeAppId = String(target.appTargetId || appId);
    toast(
      t('keysSoftPadScopePrepared', '已准备 {app} 虚拟键盘').replace(
        '{app}',
        softPadAppTitle(softPadScopeAppId)
      )
    );
    refresh();
  }

  function moreSoftPadScopeApps() {
    var presets = global.OneToneAppTargetPresets;
    var list = (presets && presets.presets) || [];
    var primary = {};
    SOFTPAD_SCOPE_PRIMARY.forEach(function (d) {
      primary[d.appTargetId] = true;
    });
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var id = p && p.id;
      if (!id || primary[id] || id === 'custom') continue;
      out.push({ appTargetId: id, title: softPadAppTitle(id) });
    }
    return out;
  }

  function renderSoftPadScopeChipsHtml(ctx) {
    if (!isGlobalKeysEditContext()) return '';
    var recordLocked = scopeLock === 'record';
    var html =
      '<div class="keys-softpad-scope' +
      (recordLocked ? ' is-record-locked' : '') +
      '" data-softpad-scope="1">' +
      '<p class="keys-softpad-scope-label">' +
      esc(t('keysSoftPadScopeLabel', '虚拟键盘按应用分别配置')) +
      '</p>';
    if (autoPreselectHint && softPadScopeAppId) {
      html +=
        '<p class="keys-softpad-scope-autohint">' +
        esc(
          t(
            'keysSoftPadScopeAutoHint',
            '已根据刚才使用的应用选择 {app}'
          ).replace('{app}', softPadAppTitle(softPadScopeAppId))
        ) +
        ' · ' +
        '<button type="button" class="keys-channel-item-link" data-softpad-scope-change="1">' +
        esc(t('keysSoftPadScopeChange', '更改')) +
        '</button></p>';
    }
    html += '<div class="keys-softpad-scope-chips" role="tablist">';
    SOFTPAD_SCOPE_PRIMARY.forEach(function (d) {
      html += softPadScopeChipHtml(d.appTargetId, t(d.titleKey, d.titleFb), {
        active: softPadScopeAppId === d.appTargetId,
        recordLocked: recordLocked
      });
    });
    moreSoftPadScopeApps().forEach(function (d) {
      html += softPadScopeChipHtml(d.appTargetId, d.title, {
        active: softPadScopeAppId === d.appTargetId,
        recordLocked: recordLocked
      });
    });
    html += '</div></div>';
    return html;
  }

  function renderSoftPadCapHtml(ctx, opts) {
    opts = opts || {};
    var missing = !!(opts.missing || (ctx && ctx.missingScenario));
    var html = '<aside class="keys-softpad-cap" id="keysSoftPadCap">';
    if (missing) {
      html +=
        '<p class="keys-softpad-cap-title">' +
        esc(t('keysSoftPadCapNeedPrepareTitle', '尚未准备')) +
        '</p>' +
        '<p class="keys-softpad-cap-body">' +
        esc(
          t(
            'keysSoftPadCapNeedPrepareBody',
            '先准备 {app} 虚拟键盘，再点选键帽绑定识别键。'
          ).replace('{app}', (ctx && ctx.title) || '')
        ) +
        '</p>' +
        '<button type="button" class="keys-channel-go-softpad" data-softpad-prepare="1">' +
        esc(
          t('keysSoftPadScopePrepare', '准备 {app} 虚拟键盘').replace(
            '{app}',
            (ctx && ctx.title) || ''
          )
        ) +
        '</button>';
      if (ctx && ctx.sourceMappingId) {
        html +=
          '<button type="button" class="keys-channel-item-link" data-go-softpad="1">' +
          esc(
            t('keysSoftPadScopeManage', '管理 {app} 虚拟键盘').replace(
              '{app}',
              (ctx && ctx.title) || ''
            )
          ) +
          '</button>';
      }
      html += '</aside>';
      return html;
    }

    var selOk =
      selection &&
      selection.sourceChannel === 'softPad' &&
      selection.actionId &&
      ctx &&
      ctx.targetMappingId &&
      selection.mappingId === ctx.targetMappingId;

    if (!selOk) {
      html +=
        '<p class="keys-softpad-cap-title">' +
        esc(t('keysSoftPadCapEmptyTitle', '键帽能力')) +
        '</p>' +
        '<p class="keys-softpad-cap-body keys-softpad-cap-body--emphasis">' +
        esc(t('keysSoftPadCapEmpty', '点击左侧键帽查看能力')) +
        '</p>';
      html += '</aside>';
      return html;
    }

    var m = softPadWorkMapping();
    var keyB = findKeyBinding(m, selection.actionId, selection.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var chordText = chord
      ? friendlyChord(chord)
      : t('keysHeroActionNeedsKey', '待设置快捷键');
    var label = actionLabel(selection.actionId);
    html +=
      '<p class="keys-softpad-cap-kicker">' +
      esc((ctx && ctx.title) || softPadAppTitle(softPadScopeAppId)) +
      '</p>';
    if (selection.iconHtml) {
      html +=
        '<div class="keys-softpad-cap-icon" aria-hidden="true">' +
        selection.iconHtml +
        '</div>';
    }
    html +=
      '<p class="keys-softpad-cap-title">' +
      esc(label) +
      '</p>' +
      '<p class="keys-softpad-cap-chord' +
      (chord ? '' : ' is-pending') +
      '">' +
      esc(chordText) +
      '</p>' +
      '<p class="keys-softpad-cap-body">' +
      esc(
        t(
          'keysSoftPadCapBindHint',
          '将此能力绑定到实体识别键后即可触发'
        )
      ) +
      '</p>' +
      (canRecordSoftPadSelection(ctx)
        ? '<button type="button" class="keys-channel-go-softpad" data-softpad-record="1">' +
          esc(t('keysSoftPadCapRecord', '录制识别键')) +
          '</button>'
        : '');
    html += '</aside>';
    return html;
  }

  function softPadDefaultPreviewPad() {
    return {
      enabled: true,
      skin: 'default',
      keys: [],
      showNavigationPad: true,
      presentation: 'full'
    };
  }

  function softPadPreviewStubMapping(appId) {
    return {
      id: '',
      appTargetId: String(appId || ''),
      agentBindings: [],
      codexMicroPad: softPadDefaultPreviewPad()
    };
  }

  function renderSoftPadPreviewOnlyHtml(ctx) {
    var appId = (ctx && ctx.appTargetId) || softPadScopeAppId;
    var stub = softPadPreviewStubMapping(appId);
    var PadUi = global.OneToneCodexMicroPadUi;
    var html =
      '<div class="keys-softpad-stage">' +
      '<div id="keysSoftPadPickHost" class="keys-softpad-pick-host is-preview-only" aria-hidden="true">';
    if (PadUi && typeof PadUi.renderHardwarePad === 'function') {
      html += PadUi.renderHardwarePad(stub, softPadDefaultPreviewPad(), {
        mode: 'softPad',
        compact: false
      });
    }
    html += '</div>' + renderSoftPadCapHtml(ctx, { missing: true }) + '</div>';
    return html;
  }

  function disableAllSoftPadPickKeys(host) {
    if (!host || !host.querySelectorAll) return;
    host.querySelectorAll('[data-micro-key]').forEach(function (el) {
      el.classList.remove('is-bound', 'is-focused', 'is-pressed', 'is-active');
      el.classList.add('is-disabled');
      el.setAttribute('aria-disabled', 'true');
      el.tabIndex = -1;
      if (el.getAttribute('role') === 'switch') {
        el.removeAttribute('role');
        el.removeAttribute('aria-checked');
      }
    });
  }

  function countMigratableSoftPadKeys(m) {
    var pad = m && m.codexMicroPad;
    var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
    var n = 0;
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i] && keys[i].microKeyId;
      if (!id || seen[id]) continue;
      seen[id] = true;
      if (resolveMigratableAction(m, id)) n++;
    }
    softPadViewsForResolve().forEach(function (v) {
      var ref = viewRef(v);
      var trig = viewTrigger(v);
      [ref, trig].forEach(function (cand) {
        if (!cand || seen[cand]) return;
        if (resolveMigratableAction(m, cand)) {
          seen[cand] = true;
          n++;
        }
      });
    });
    return n;
  }

  function retargetSoftPadPickKeys(host, m) {
    if (!host || !host.querySelectorAll) return;
    var workMid = m && m.id ? String(m.id) : '';
    host.querySelectorAll('[data-micro-key]').forEach(function (el) {
      var id = el.getAttribute('data-micro-key') || '';
      var resolved = resolveMigratableAction(m, id);
      var keyName =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        id ||
        t('keysChannelPadKey', '键位');
      el.classList.remove('is-bound', 'is-focused', 'is-pressed', 'is-active');
      if (id === 'ENC') {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        el.setAttribute(
          'title',
          t('keysSoftPadKeyEncDisabled', '电源旋钮不可用于识别绑定')
        );
        el.setAttribute(
          'aria-label',
          keyName + ' · ' + t('keysSoftPadKeyEncDisabled', '电源旋钮不可用于识别绑定')
        );
        return;
      }
      if (id === 'JOY' || /^NAV_/.test(id)) {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        el.setAttribute(
          'title',
          t('keysSoftPadKeyNavDisabled', '导航键不可用于识别绑定')
        );
        el.setAttribute(
          'aria-label',
          keyName +
            ' · ' +
            t('keysSoftPadKeyNavDisabled', '导航键不可用于识别绑定')
        );
        return;
      }
      if (resolved) {
        el.classList.add('is-bound');
        el.classList.remove('is-disabled');
        el.removeAttribute('aria-disabled');
        el.removeAttribute('disabled');
        if (el.tagName === 'BUTTON') el.tabIndex = 0;
        el.removeAttribute('title');
        if (
          selection &&
          selection.mappingId === workMid &&
          selection.sourceChannel === 'softPad' &&
          selection.sourceBindingRef === id
        ) {
          el.classList.add('is-focused');
        }
      } else {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        var uncfg = t('keysSoftPadKeyUnconfigured', '未配置，不可选择');
        el.setAttribute('title', keyName + ' · ' + uncfg);
        el.setAttribute('aria-label', keyName + ' · ' + uncfg);
        if (el.getAttribute('role') === 'switch') {
          el.removeAttribute('role');
          el.removeAttribute('aria-checked');
        }
      }
    });
  }

  function scenarioStatusLabel(m) {
    var en = scenarioIsEnabled(m)
      ? t('keysSoftPadScenarioEnabled', '已启用')
      : t('keysSoftPadScenarioDisabled', '已停用');
    var pad = scenarioPadSwitchOn(m)
      ? t('keysSoftPadScenarioPadOn', '虚拟键盘开启')
      : scenarioHasPad(m)
        ? t('keysSoftPadScenarioPadOff', '虚拟键盘关闭')
        : t('keysSoftPadScenarioPadMissing', '虚拟键盘未准备');
    return en + ' · ' + pad;
  }

  function scenarioDisplayName(m) {
    if (!m) return '';
    if (global.OneToneHabitProfile && global.OneToneHabitProfile.habitDisplayName) {
      try {
        var title = String(global.OneToneHabitProfile.habitDisplayName(m) || '').trim();
        if (title && title !== '—') return title;
      } catch (_) {}
    }
    return String(m.group || m.label || m.name || m.id || '').trim();
  }

  function renderSoftPadSecondaryHtml(workMid, workM, bridges, footer, ctx) {
    var html = '<div class="keys-softpad-secondary">';
    if (softPadAuthorityPending(workMid)) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(t('keysSoftPadCapLoading', '正在加载此场景的可绑定键位…')) +
        '</p>';
    }
    var migratable = countMigratableSoftPadKeys(workM);
    if (!softPadAuthorityPending(workMid) && !migratable) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(emptyCopy('softPad')) +
        '</p>';
    } else if (!softPadAuthorityPending(workMid) && ctx && ctx.globalProxy && ctx.title) {
      html +=
        '<p class="keys-softpad-scope-hint">' +
        esc(
          t(
            'keysSoftPadScopePickHint',
            '选择键帽后，将为 {app} 配置实体快捷键'
          ).replace('{app}', ctx.title)
        ) +
        '</p>';
    }
    if (ctx && (ctx.targetMappingId || ctx.sourceMappingId)) {
      html +=
        '<button type="button" class="keys-channel-go-softpad" data-go-softpad="1">' +
        esc(
          t('keysSoftPadScopeManage', '管理 {app} 虚拟键盘').replace(
            '{app}',
            (ctx && ctx.title) || softPadAppTitle(workM && workM.appTargetId)
          )
        ) +
        '</button>';
    }
    var canAddShortcut = !!(workM && String(workM.appTargetId || '').trim());
    var bi;
    for (bi = 0; bi < bridges.length; bi++) {
      var br = bridges[bi];
      html += renderBindRowHtml({
        mid: workMid,
        m: workM,
        actionId: br.actionId,
        bindingRef: br.bindingRef,
        name: br.name,
        sub: br.sub,
        offerIme: br.offerIme,
        actionInstanceId: br.actionInstanceId || '',
        channel: 'softPad',
        actionArgsChord:
          br.actionArgs && br.actionArgs.chord ? String(br.actionArgs.chord) : ''
      });
    }
    if (canAddShortcut && footer && footer.kind === 'add-app-shortcut') {
      html +=
        '<button type="button" class="keys-channel-add-shortcut keys-channel-add-shortcut--compact" data-add-app-shortcut="1">' +
        esc(footer.label) +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderSoftPadKeyboardPanel(panel) {
    if (panel.classList) panel.classList.add('is-softpad-pick');
    ensureSoftPadDefaultScope();
    var ctx = resolveSoftPadScope();
    var html = '';
    if (isGlobalKeysEditContext()) {
      html += renderSoftPadScopeChipsHtml(ctx);
    }

    if (isGlobalKeysEditContext() && !softPadScopeAppId) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysSoftPadScopeNeedPick',
            '虚拟键盘按应用生效，请先选择要配置的应用。'
          )
        ) +
        '</p>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(false);
      return;
    }

    if (ctx && ctx.missingScenario) {
      html += renderSoftPadPreviewOnlyHtml(ctx);
      panel.innerHTML = html;
      disableAllSoftPadPickKeys(panel);
      syncSoftPadTargetChrome(true);
      return;
    }

    if (ctx && ctx.ambiguous) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysSoftPadScopeAmbiguous',
            '此应用有多个 SoftPad 场景，请选择要加载的场景'
          )
        ) +
        '</p>' +
        '<div class="keys-softpad-scope-scenarios">';
      (ctx.scenarios || []).forEach(function (sc) {
        if (!sc || !sc.id) return;
        html +=
          '<button type="button" class="keys-softpad-scenario-option" data-softpad-scope-mapping="' +
          esc(String(sc.id)) +
          '">' +
          '<span class="keys-softpad-scenario-option__name">' +
          esc(scenarioDisplayName(sc)) +
          '</span>' +
          '<span class="keys-softpad-scenario-option__status">' +
          esc(scenarioStatusLabel(sc)) +
          '</span>' +
          '</button>';
      });
      html += '</div>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(true);
      return;
    }

    var workM = softPadWorkMapping();
    var workMid = workM ? String(workM.id || '') : '';
    if (!workM || !workMid) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(emptyCopy('softPad')) +
        '</p>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(true);
      return;
    }

    var pack = {
      bridges: existingAppShortcutRows(workM),
      footer: {
        kind: 'add-app-shortcut',
        label: t('keysAddAppShortcut', '＋ 添加应用快捷键')
      }
    };
    var PadUi = global.OneToneCodexMicroPadUi;
    var previewPad = previewPadClone(workM);
    html += '<div class="keys-softpad-stage">';
    html += '<div id="keysSoftPadPickHost" class="keys-softpad-pick-host">';
    if (PadUi && typeof PadUi.renderHardwarePad === 'function') {
      html += PadUi.renderHardwarePad(workM, previewPad, {
        mode: 'softPad',
        compact: false
      });
    }
    html += '</div>';
    html += renderSoftPadCapHtml(ctx);
    html += '</div>';
    html += renderSoftPadSecondaryHtml(
      workMid,
      workM,
      pack.bridges || [],
      pack.footer,
      ctx
    );
    panel.innerHTML = html;
    retargetSoftPadPickKeys(panel, workM);
    syncSoftPadTargetChrome(true);
  }

  function syncSoftPadTargetChrome(active) {
    var row = document.getElementById('habitKeyMapRowTarget');
    if (row && row.classList) {
      row.classList.toggle('is-softpad-channel', !!active && activeTab === 'softPad');
    }
  }

  function syncImeTabChrome() {
    var panel = document.getElementById('keysChannelPanel');
    var imeStrip = document.getElementById('keysImeStripWrap');
    var imeTab = document.getElementById('keysChannelTabIme');
    var onIme = activeTab === 'ime';
    if (panel) {
      panel.hidden = onIme;
      if (!onIme) {
        var tabId =
          activeTab === 'softPad'
            ? 'keysChannelTabSoftPad'
            : activeTab === 'camera'
              ? 'keysChannelTabCamera'
              : 'keysChannelTabVoice';
        panel.setAttribute('aria-labelledby', tabId);
      }
    }
    if (imeStrip) {
      imeStrip.hidden = !onIme;
    }
    if (imeTab) {
      imeTab.classList.toggle('is-active', onIme);
      imeTab.setAttribute('aria-selected', onIme ? 'true' : 'false');
    }
  }

  function renderBindRowHtml(opts) {
    var mid = opts.mid;
    var m = opts.m;
    var actionId = opts.actionId;
    var ref = opts.bindingRef;
    var name = opts.name;
    var sub = opts.sub;
    var offerIme = !!opts.offerIme;
    var channel = opts.channel || 'voice';
    var actionInstanceId = String(opts.actionInstanceId || '');
    var bindable = bindableByAction[actionId];
    if (bindable === undefined) bindable = true;
    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var selected =
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === channel &&
      selection.sourceBindingRef === ref;
    var disabled = !bindable;
    var html =
      '<div class="keys-channel-item-wrap' +
      (selected ? ' is-selected' : '') +
      (disabled ? ' is-disabled' : '') +
      '">' +
      '<button type="button" class="keys-channel-item' +
      (selected ? ' is-selected' : '') +
      (disabled ? ' is-disabled' : '') +
      '" data-channel-item="1" data-channel="' +
      esc(channel) +
      '" data-binding-ref="' +
      esc(ref) +
      '" data-action-id="' +
      esc(actionId) +
      '"' +
      (actionInstanceId
        ? ' data-action-instance-id="' + esc(actionInstanceId) + '"'
        : '') +
      (opts.actionArgsChord
        ? ' data-action-args-chord="' + esc(opts.actionArgsChord) + '"'
        : '') +
      (disabled ? ' disabled aria-disabled="true"' : '') +
      '>' +
      '<span class="keys-channel-item-name">' +
      esc(name) +
      '</span>' +
      '<span class="keys-channel-item-key">' +
      esc(
        disabled
          ? channelOnlyLabel(channel)
          : chord
            ? friendlyChord(chord)
            : t('keysHeroActionNeedsKey', '待设置快捷键')
      ) +
      '</span>' +
      '<span class="keys-channel-item-sub">' +
      esc(sub) +
      '</span>' +
      '</button>';
    if (offerIme) {
      html +=
        '<button type="button" class="keys-channel-item-link" data-bridge-ime="1">' +
        esc(t('keysVoiceBridgeGoIme', '改用输入法识别键')) +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderGuideFinishHtml(bridge) {
    return (
      '<button type="button" class="keys-channel-item keys-channel-item--guide" data-guide-finish="1" data-binding-ref="' +
      esc(bridge.bindingRef) +
      '">' +
      '<span class="keys-channel-item-name">' +
      esc(bridge.name) +
      '</span>' +
      '<span class="keys-channel-item-key">' +
      esc(t('keysVoiceBridgeGoFinish', '去收尾')) +
      '</span>' +
      '<span class="keys-channel-item-sub">' +
      esc(bridge.sub) +
      '</span>' +
      '</button>'
    );
  }

  function renderPanelOnly() {
    var panel = document.getElementById('keysChannelPanel');
    var tabs = document.getElementById('keysChannelSubtabs');
    if (!panel || !tabs) return;
    tabs.querySelectorAll('[data-channel]').forEach(function (btn) {
      var on = btn.getAttribute('data-channel') === activeTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    syncImeTabChrome();
    if (activeTab === 'ime') {
      if (panel.classList) panel.classList.remove('is-softpad-pick');
      syncSoftPadTargetChrome(false);
      panel.innerHTML = '';
      if (global.OneToneImePresets && global.OneToneImePresets.refresh) {
        try {
          global.OneToneImePresets.refresh('mapping');
        } catch (_) {}
      }
      return;
    }

    var mid = selectedMappingId();
    var m = mappingById(mid);
    if (activeTab === 'softPad') {
      renderSoftPadKeyboardPanel(panel);
      return;
    }

    if (panel.classList) panel.classList.remove('is-softpad-pick');
    syncSoftPadTargetChrome(false);
    var pack = rowsForActiveTab();
    var bridges = pack.bridges || [];
    var rows = pack.views || [];
    var footer = pack.footer;
    if (!bridges.length && !rows.length && !footer) {
      panel.innerHTML =
        '<p class="keys-channel-empty">' + esc(emptyCopy(activeTab)) + '</p>';
      return;
    }

    var html = '';
    var bi;
    for (bi = 0; bi < bridges.length; bi++) {
      var br = bridges[bi];
      if (br.kind === 'guide-finish') {
        html += renderGuideFinishHtml(br);
      } else {
        html += renderBindRowHtml({
          mid: mid,
          m: m,
          actionId: br.actionId,
          bindingRef: br.bindingRef,
          name: br.name,
          sub: br.sub,
          offerIme: br.offerIme,
          actionInstanceId: br.actionInstanceId || '',
          channel: activeTab,
          actionArgsChord:
            br.actionArgs && br.actionArgs.chord ? String(br.actionArgs.chord) : ''
        });
      }
    }
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i];
      var actionId = viewActionId(v);
      var ref = viewRef(v);
      var bindable = bindableByAction[actionId];
      if (bindable === undefined) bindable = true;
      var keyB = findKeyBinding(m, actionId);
      var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
      var selected =
        selection &&
        selection.mappingId === mid &&
        selection.sourceChannel === activeTab &&
        selection.sourceBindingRef === ref;
      var disabled = !bindable;
      html +=
        '<button type="button" class="keys-channel-item' +
        (selected ? ' is-selected' : '') +
        (disabled ? ' is-disabled' : '') +
        '" data-channel-item="1" data-channel="' +
        esc(activeTab) +
        '" data-binding-ref="' +
        esc(ref) +
        '" data-action-id="' +
        esc(actionId) +
        '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        '>' +
        '<span class="keys-channel-item-name">' +
        esc(actionLabel(actionId)) +
        '</span>' +
        '<span class="keys-channel-item-key">' +
        esc(
          disabled
            ? channelOnlyLabel(activeTab)
            : chord
              ? friendlyChord(chord)
              : t('keysHeroActionNeedsKey', '待设置快捷键')
        ) +
        '</span>' +
        '<span class="keys-channel-item-sub">' +
        esc(sourceSubline(activeTab, v)) +
        '</span>' +
        '</button>';
    }
    if (footer && footer.kind === 'add-app-shortcut') {
      html +=
        '<button type="button" class="keys-channel-add-shortcut" data-add-app-shortcut="1">' +
        esc(footer.label) +
        '</button>';
    }
    if (!html) {
      html = '<p class="keys-channel-empty">' + esc(emptyCopy(activeTab)) + '</p>';
    }
    panel.innerHTML = html;
  }

  function guideToFinish() {
    if (global.OneToneKeysPageState && global.OneToneKeysPageState.setStep) {
      global.OneToneKeysPageState.setStep('finish');
    } else if (global.OneToneKeysPageNav && global.OneToneKeysPageNav.go) {
      global.OneToneKeysPageNav.go('finish');
    }
    toast(t('keysVoiceBridgeEndToast', '结束/发送在 03 收尾配置，不在识别区建快捷键'));
  }

  function guideToIme() {
    clearSelection({ skipRender: true });
    setActiveTab('ime');
    if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
      try {
        global.OneToneMappingList.renderEditor();
      } catch (_) {}
    }
    toast(t('keysVoiceBridgeImeToast', '已切换到输入方式 · 点选输入法设置识别键'));
  }

  function setActiveTab(ch, opts) {
    if (TABS.indexOf(ch) < 0) return;
    opts = opts || {};
    var prev = activeTab;
    activeTab = ch;
    if (ch === 'ime' && selection) {
      clearSelection({ skipRender: true, skipHero: !!(opts && opts.skipHeroClear) });
      if (!(opts && opts.skipHeroClear) && global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        try {
          global.OneToneMappingList.renderEditor();
        } catch (_) {}
      }
    }
    var scopeBefore = softPadScopeAppId;
    if (ch === 'softPad' && isGlobalKeysEditContext()) {
      ensureSoftPadScopeSession();
      maybeAutoPreselectSoftPadScope();
      ensureSoftPadDefaultScope();
    } else {
      syncSoftPadTargetChrome(false);
    }
    if (!(opts && opts.skipRender) || prev !== ch) {
      if (
        ch === 'softPad' &&
        isGlobalKeysEditContext() &&
        (prev !== 'softPad' || scopeBefore !== softPadScopeAppId)
      ) {
        return refresh();
      }
      renderPanelOnly();
    }
  }

  function onSoftPadKeyClick(keyEl, ev) {
    if (!keyEl) return;
    if (
      keyEl.classList &&
      keyEl.classList.contains('is-disabled')
    ) {
      return;
    }
    if (keyEl.getAttribute('aria-disabled') === 'true') return;
    var ctx = resolveSoftPadScope();
    if (!ctx || !ctx.targetMappingId) return;
    var mid = String(ctx.targetMappingId);
    var m = mappingById(mid);
    if (!m) return;
    var microId = String(keyEl.getAttribute('data-micro-key') || '').trim();
    var resolved = resolveMigratableAction(m, microId);
    if (!resolved) return;

    if (
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === 'softPad' &&
      selection.sourceBindingRef === microId
    ) {
      clearSelection();
      toast(t('codexCapDeselected', '已恢复语音识别键显示'));
      if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        global.OneToneMappingList.renderEditor();
      }
      return;
    }

    var iconEl = keyEl.querySelector && keyEl.querySelector('.micro-hw__icon');
    var iconHtml = iconEl ? String(iconEl.outerHTML || '') : '';
    var forceRecord = !!(ev && (ev.altKey || ev.shiftKey));
    setSelection({
      mappingId: mid,
      sourceChannel: 'softPad',
      sourceBindingRef: microId,
      actionId: resolved.actionId,
      keyBindingRef: resolved.keyBindingRef || '',
      actionInstanceId: resolved.actionInstanceId || '',
      actionArgs: resolved.actionArgs,
      iconHtml: iconHtml
    });

    var keyB = findKeyBinding(m, resolved.actionId, resolved.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var label = actionLabel(resolved.actionId);
    var scopeBit = ctx.title ? ctx.title + ' · ' : '';
    toast(
      t('codexCapLoadedToKeycap', '已加载到识别键') +
        ' · ' +
        scopeBit +
        label +
        (chord ? ' · ' + friendlyChord(chord) : ' · ' + t('keysHeroActionNeedsKey', '待设置快捷键'))
    );
    if (forceRecord || !chord) {
      if (forceRecord) recordSelected();
    }
  }

  function onItemClick(btn, ev) {
    if (!btn || btn.disabled) return;
    var channel = btn.getAttribute('data-channel') || activeTab;
    var mid = selectedMappingId();
    if (channel === 'softPad') {
      var ctx = resolveSoftPadScope();
      if (!ctx || !ctx.targetMappingId) return;
      mid = ctx.targetMappingId;
    }
    if (!mid) return;
    var ref = btn.getAttribute('data-binding-ref') || '';
    var actionId = canonicalActionId(btn.getAttribute('data-action-id') || '');
    var actionInstanceId = btn.getAttribute('data-action-instance-id') || '';
    var argsChord = btn.getAttribute('data-action-args-chord') || '';
    if (!actionId || !ref) return;
    if (bindableByAction[actionId] === false) return;

    if (
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === channel &&
      selection.sourceBindingRef === ref
    ) {
      clearSelection();
      toast(t('codexCapDeselected', '已恢复语音识别键显示'));
      if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        global.OneToneMappingList.renderEditor();
      }
      return;
    }

    var m = mappingById(mid);
    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    var forceRecord = !!(ev && (ev.altKey || ev.shiftKey));
    var sourceRef = ref;
    setSelection({
      mappingId: mid,
      sourceChannel: channel,
      sourceBindingRef: sourceRef,
      actionId: actionId,
      keyBindingRef: keyB ? String(keyB.slotId || '') : '',
      actionInstanceId: actionInstanceId || (keyB && keyB.actionInstanceId) || '',
      actionArgs:
        argsChord
          ? { chord: argsChord }
          : keyB && keyB.actionArgs
            ? keyB.actionArgs
            : null
    });

    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var displayName =
      ref.indexOf('voice-lifecycle:') === 0 || ref.indexOf('open-app-acoustic:') === 0
        ? btn.querySelector('.keys-channel-item-name')
          ? btn.querySelector('.keys-channel-item-name').textContent
          : actionLabel(actionId)
        : actionLabel(actionId);
    toast(
      t('codexCapLoadedToKeycap', '已加载到识别键') +
        ' · ' +
        displayName +
        (chord ? ' · ' + friendlyChord(chord) : ' · ' + t('keysHeroActionNeedsKey', '待设置快捷键'))
    );

    if (forceRecord || !chord) {
      if (forceRecord) recordSelected();
    }
  }

  function recordSelected() {
    if (!hasSelection()) return Promise.resolve(false);
    var snap = {
      mappingId: String(selection.mappingId || ''),
      actionId: String(selection.actionId || ''),
      actionInstanceId: selection.actionInstanceId
        ? String(selection.actionInstanceId)
        : '',
      actionArgs: selection.actionArgs || null,
      keyBindingRef: selection.keyBindingRef ? String(selection.keyBindingRef) : '',
      sourceBindingRef: selection.sourceBindingRef
        ? String(selection.sourceBindingRef)
        : '',
      sourceChannel: selection.sourceChannel
        ? String(selection.sourceChannel)
        : '',
      scopeTitle: ''
    };
    var mid = snap.mappingId;
    var m = mappingById(mid);
    if (!m || !snap.actionId) return Promise.resolve(false);
    if (snap.sourceChannel === 'softPad' && !canRecordSoftPadSelection({ targetMappingId: mid })) {
      return Promise.resolve(false);
    }
    if (bindableByAction[snap.actionId] === false) {
      toast(channelOnlyLabel(snap.sourceChannel));
      return Promise.resolve(false);
    }
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) return Promise.resolve(false);
    if (rec.mode && rec.mode() !== 'none') return Promise.resolve(false);

    var scopeAtStart = resolveSoftPadScope();
    if (scopeAtStart && scopeAtStart.globalProxy && scopeAtStart.title) {
      snap.scopeTitle = String(scopeAtStart.title);
    }

    recordSnap = snap;
    var prevLock = scopeLock;
    scopeLock = 'record';

    var host = document.getElementById('habitKeyMapCellTarget');
    if (host) host.classList.add('is-recording');
    var excludeRef = snap.keyBindingRef || '';
    var upsertOpts = {
      bindingRef: snap.keyBindingRef ? snap.keyBindingRef : null,
      actionInstanceId: snap.actionInstanceId || '',
      actionArgs: snap.actionArgs || null
    };

    function endRecordLock() {
      recordSnap = null;
      if (scopeLock === 'record') scopeLock = prevLock === 'record' ? 'manual' : prevLock;
    }

    return Promise.resolve(
      rec.startAgentBinding(mid, {
        onDone: function (chord) {
          if (host) host.classList.remove('is-recording');
          endRecordLock();
          var next = String(chord || '').trim();
          if (!next) return;
          var mapNow = mappingById(mid);
          var conflict = findChordConflict(mapNow, next, excludeRef);
          if (conflict) {
            if (global.OneToneAgentCapabilityUi && global.OneToneAgentCapabilityUi.conflictToast) {
              global.OneToneAgentCapabilityUi.conflictToast(conflict, next);
            } else {
              toast(
                t('codexCapConflictOther', '快捷键与现有按键冲突，请换一个') +
                  ' · ' +
                  (friendlyChord(next) || next) +
                  ' / ' +
                  (conflict.label || '')
              );
            }
            applyHero();
            return;
          }
          var adapters = global.OneToneActionBindingAdapters;
          if (!adapters || !adapters.key || !adapters.key.upsert) {
            toast('key adapter unavailable');
            return;
          }
          adapters.key
            .upsert(mid, snap.actionId, next, upsertOpts)
            .then(function () {
              var keyB = findKeyBinding(
                mappingById(mid),
                snap.actionId,
                snap.actionInstanceId
              );
              if (
                selection &&
                selection.mappingId === mid &&
                selection.actionId === snap.actionId &&
                String(selection.actionInstanceId || '') === String(snap.actionInstanceId || '')
              ) {
                selection.keyBindingRef = keyB ? String(keyB.slotId || '') : '';
                if (keyB && keyB.actionInstanceId) {
                  selection.actionInstanceId = String(keyB.actionInstanceId);
                }
              }
              applyHero();
              renderPanelOnly();
              var savedLabel = actionLabel(snap.actionId);
              var savedToast = snap.scopeTitle
                ? t('keysSoftPadScopeSaved', '已为 {app} 设置 {key} → {action}')
                    .replace('{app}', snap.scopeTitle)
                    .replace('{key}', friendlyChord(next))
                    .replace('{action}', savedLabel)
                : t('codexCapLoadedToKeycap', '已加载到识别键') +
                  ' · ' +
                  savedLabel +
                  ' · ' +
                  friendlyChord(next);
              toast(savedToast);
            })
            .catch(function (err) {
              toast(String((err && err.message) || err || 'bind failed'));
            });
        },
        onCancel: function () {
          if (host) host.classList.remove('is-recording');
          endRecordLock();
          applyHero();
        }
      })
    );
  }

  function startAddAppShortcutWizard() {
    var ctx = resolveSoftPadScope();
    var mid =
      ctx && ctx.targetMappingId ? String(ctx.targetMappingId) : selectedMappingId();
    var m = mappingById(mid);
    if (!mid || !m) {
      toast(t('keysAddAppShortcutNeedMapping', '请先选择习惯'));
      return;
    }
    if (!String(m.appTargetId || '').trim()) {
      toast(t('keysAddAppShortcutNeedApp', '请先为习惯指定目标应用'));
      return;
    }
    if (bindableByAction['app.shortcut'] === false) {
      toast(t('keysAddAppShortcutNotBindable', '当前习惯不可绑定应用快捷键'));
      return;
    }
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) {
      toast('recording unavailable');
      return;
    }
    if (rec.mode && rec.mode() !== 'none') return;
    toast(t('keysAddAppShortcutRecordOut', '先录制要发送到应用的快捷键（如 Ctrl+K）'));
    var host = document.getElementById('habitKeyMapCellTarget');
    if (host) host.classList.add('is-recording');
    var wizSnap = {
      mappingId: mid,
      appTargetId: String(m.appTargetId || '')
    };
    recordSnap = wizSnap;
    var prevLock = scopeLock;
    scopeLock = 'record';
    function endWizardLock() {
      recordSnap = null;
      if (scopeLock === 'record') scopeLock = prevLock === 'record' ? 'manual' : prevLock;
    }
    Promise.resolve(
      rec.startAgentBinding(mid, {
        onDone: function (outChord) {
          if (host) host.classList.remove('is-recording');
          var output = String(outChord || '').trim();
          if (!output) {
            endWizardLock();
            return;
          }
          toast(
            t('keysAddAppShortcutRecordTrigger', '再录制触发键（如 F9）') +
              ' · ' +
              friendlyChord(output)
          );
          if (host) host.classList.add('is-recording');
          Promise.resolve(
            rec.startAgentBinding(mid, {
              onDone: function (trigChord) {
                if (host) host.classList.remove('is-recording');
                endWizardLock();
                var trigger = String(trigChord || '').trim();
                if (!trigger) return;
                var mapNow = mappingById(mid);
                var conflict = findChordConflict(mapNow, trigger, '');
                if (conflict) {
                  toast(
                    t('codexCapConflictOther', '快捷键与现有按键冲突，请换一个') +
                      ' · ' +
                      friendlyChord(trigger)
                  );
                  return;
                }
                var adapters = global.OneToneActionBindingAdapters;
                if (!adapters || !adapters.key || !adapters.key.upsert) {
                  toast('key adapter unavailable');
                  return;
                }
                var instanceId = 'app-shortcut:' + Date.now().toString(36);
                adapters.key
                  .upsert(mid, 'app.shortcut', trigger, {
                    actionInstanceId: instanceId,
                    actionArgs: { chord: output }
                  })
                  .then(function () {
                    setSelection({
                      mappingId: mid,
                      sourceChannel: 'softPad',
                      sourceBindingRef: '',
                      actionId: 'app.shortcut',
                      keyBindingRef: '',
                      actionInstanceId: instanceId,
                      actionArgs: { chord: output }
                    });
                    var keyB = findKeyBinding(mappingById(mid), 'app.shortcut', instanceId);
                    if (selection && keyB) {
                      selection.keyBindingRef = String(keyB.slotId || '');
                      // List identity for secondary row — not a softPad microKey / upsert target.
                      selection.sourceBindingRef = String(keyB.slotId || '');
                    }
                    renderPanelOnly();
                    toast(
                      t('keysAddAppShortcutSaved', '已添加应用快捷键') +
                        ' · ' +
                        friendlyChord(trigger) +
                        ' → ' +
                        friendlyChord(output)
                    );
                  })
                  .catch(function (err) {
                    toast(String((err && err.message) || err || 'bind failed'));
                  });
              },
              onCancel: function () {
                if (host) host.classList.remove('is-recording');
                endWizardLock();
                toast(t('keysAddAppShortcutCancelled', '已取消添加应用快捷键'));
              }
            })
          );
        },
        onCancel: function () {
          if (host) host.classList.remove('is-recording');
          endWizardLock();
          toast(t('keysAddAppShortcutCancelled', '已取消添加应用快捷键'));
        }
      })
    );
  }

  /** ponytail: IPC/options failure — unblock pick UI; upsert may still fail closed later */
  function failOpenSoftPadAuthority(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return;
    softPadViewsMappingId = mid;
    bindableMappingId = mid;
  }

  function loadBindableMap(mappingId, actionIds) {
    var store = global.OneToneSemanticActionStore;
    if (!store || !store.fetchOptions) {
      bindableByAction = {};
      bindableMappingId = String(mappingId || '').trim();
      actionIds.forEach(function (id) {
        bindableByAction[id] = true;
      });
      return Promise.resolve(bindableByAction);
    }
    return store.ensureCatalog().then(function () {
      return store.fetchOptions(mappingId, 'key', false).then(function (entries) {
        var map = {};
        actionIds.forEach(function (id) {
          map[id] = false;
        });
        (entries || []).forEach(function (e) {
          if (!e || !e.actionId) return;
          if (actionIds.indexOf(e.actionId) >= 0) map[e.actionId] = !!e.bindable;
        });
        // Also accept catalog-only bindable check for ids missing from options rows.
        actionIds.forEach(function (id) {
          if (map[id]) return;
          if (store.isSemanticBindableOnChannel && store.isSemanticBindableOnChannel(id, 'key')) {
            // Options is authoritative when loaded — keep false if option row missing.
            var opt = store.optionFor ? store.optionFor(mappingId, 'key', id) : null;
            map[id] = !!(opt && opt.bindable);
          }
        });
        bindableByAction = map;
        bindableMappingId = String(mappingId || '').trim();
        return map;
      });
    });
  }

  function refresh() {
    var picker = document.getElementById('keysChannelPicker');
    if (!picker) return Promise.resolve();
    ensureSoftPadScopeSession();
    var mid = selectedMappingId();
    syncSelectionToMapping(mid);
    if (!mid || keysStep() !== 'target') {
      picker.hidden = keysStep() !== 'target';
      if (keysStep() !== 'target') clearSelection({ skipRender: true, skipHero: false });
      applyHero();
      renderPanelOnly();
      return Promise.resolve();
    }
    picker.hidden = false;
    if (activeTab === 'softPad' && isGlobalKeysEditContext()) {
      maybeAutoPreselectSoftPadScope();
      ensureSoftPadDefaultScope();
    }
    var store = global.OneToneSemanticActionStore;
    var token = ++renderToken;
    var softCtx = resolveSoftPadScope();
    var softMid = softCtx && softCtx.targetMappingId ? String(softCtx.targetMappingId) : '';
    var optionsMid = softMid || mid;
    if (activeTab === 'softPad') {
      softPadViewsCache = [];
      softPadViewsMappingId = '';
      bindableByAction = {};
      bindableMappingId = '';
      renderPanelOnly();
      applyHero();
    }
    if (!store || !store.bindingViews) {
      viewsCache = [];
      softPadViewsCache = [];
      softPadViewsMappingId = '';
      bindableByAction = {};
      bindableMappingId = '';
      renderPanelOnly();
      applyHero();
      return Promise.resolve();
    }

    function finishRefreshRender() {
      if (token !== renderToken) return;
      renderPanelOnly();
      applyHero();
    }

    function handleRefreshFailure(err) {
      if (token !== renderToken) return;
      try {
        console.warn('[keys-channel] refresh failed:', err);
      } catch (_) {}
      failOpenSoftPadAuthority(optionsMid);
      finishRefreshRender();
    }

    return store
      .bindingViews(mid)
      .then(function (rows) {
        if (token !== renderToken) return;
        viewsCache = Array.isArray(rows) ? rows : [];
        var softViewsP =
          softMid && softMid !== mid
            ? store.bindingViews(softMid)
            : Promise.resolve(softMid ? viewsCache : []);
        return softViewsP.then(function (softRows) {
          if (token !== renderToken) return;
          softPadViewsCache = Array.isArray(softRows) ? softRows : [];
          softPadViewsMappingId = softMid;
          var ids = [];
          CHANNEL_TABS.forEach(function (ch) {
            filteredViews(ch).forEach(function (v) {
              var id = viewActionId(v);
              if (id && ids.indexOf(id) < 0) ids.push(id);
            });
          });
          softPadViewsForResolve().forEach(function (v) {
            var id = viewActionId(v);
            if (id && ids.indexOf(id) < 0) ids.push(id);
          });
          var mapM = softPadWorkMapping() || mappingById(mid);
          if (mapM && mapM.codexMicroPad && Array.isArray(mapM.codexMicroPad.keys)) {
            mapM.codexMicroPad.keys.forEach(function (k) {
              if (!k || !k.microKeyId) return;
              var peeked = resolveMigratableAction(mapM, k.microKeyId, { skipBindable: true });
              if (peeked && peeked.actionId && ids.indexOf(peeked.actionId) < 0) {
                ids.push(peeked.actionId);
              }
            });
          }
          [VOICE_LIFECYCLE_IDS.start, VOICE_LIFECYCLE_IDS.cancel, 'app.open', 'app.shortcut'].forEach(
            function (id) {
              if (ids.indexOf(id) < 0) ids.push(id);
            }
          );
          return loadBindableMap(optionsMid, ids).then(finishRefreshRender);
        });
      })
      .catch(handleRefreshFailure);
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var tabs = document.getElementById('keysChannelSubtabs');
    var panel = document.getElementById('keysChannelPanel');
    if (tabs) {
      tabs.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-channel]') : null;
        if (!btn || !tabs.contains(btn)) return;
        if (btn.classList.contains('is-codex-hidden') || btn.disabled) return;
        var ch = btn.getAttribute('data-channel');
        if (TABS.indexOf(ch) < 0 || ch === activeTab) return;
        // Tab switch must not persist.
        setActiveTab(ch);
      });
    }
    if (panel) {
      panel.addEventListener('click', function (ev) {
        var imeBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-bridge-ime]') : null;
        if (imeBtn && panel.contains(imeBtn)) {
          ev.preventDefault();
          guideToIme();
          return;
        }
        var guideBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-guide-finish]') : null;
        if (guideBtn && panel.contains(guideBtn)) {
          ev.preventDefault();
          guideToFinish();
          return;
        }
        var goSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-go-softpad]') : null;
        if (goSoft && panel.contains(goSoft)) {
          ev.preventDefault();
          guideToSoftPadSettings();
          return;
        }
        var prepareSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-prepare]') : null;
        if (prepareSoft && panel.contains(prepareSoft)) {
          ev.preventDefault();
          prepareSoftPadScopeScenario();
          return;
        }
        var recordSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-record]') : null;
        if (recordSoft && panel.contains(recordSoft)) {
          ev.preventDefault();
          recordSelected();
          return;
        }
        var scopeChange =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-scope-change]') : null;
        if (scopeChange && panel.contains(scopeChange)) {
          ev.preventDefault();
          autoPreselectHint = false;
          scopeLock = 'manual';
          autoPreselectDone = true;
          renderPanelOnly();
          var chip = panel.querySelector('[data-softpad-scope-app]');
          if (chip && chip.focus) chip.focus();
          return;
        }
        var scopeMapping =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-softpad-scope-mapping]')
            : null;
        if (scopeMapping && panel.contains(scopeMapping)) {
          ev.preventDefault();
          var midPick = scopeMapping.getAttribute('data-softpad-scope-mapping') || '';
          setSoftPadScopeMappingOverride(midPick, { refresh: true });
          return;
        }
        var scopeChip =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-scope-app]') : null;
        if (scopeChip && panel.contains(scopeChip)) {
          ev.preventDefault();
          if (scopeLock === 'record' || scopeChip.disabled) return;
          var appId = scopeChip.getAttribute('data-softpad-scope-app') || '';
          setSoftPadScopeAppId(appId, { refresh: true });
          return;
        }
        var addShortcut =
          ev.target && ev.target.closest ? ev.target.closest('[data-add-app-shortcut]') : null;
        if (addShortcut && panel.contains(addShortcut)) {
          ev.preventDefault();
          startAddAppShortcutWizard();
          return;
        }
        var padKey =
          ev.target && ev.target.closest
            ? ev.target.closest('.micro-hw__key[data-micro-key]')
            : null;
        if (padKey && panel.contains(padKey)) {
          ev.preventDefault();
          onSoftPadKeyClick(padKey, ev);
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-channel-item]') : null;
        if (!btn || !panel.contains(btn)) return;
        onItemClick(btn, ev);
      });
    }
  }

  function init() {
    bindOnce();
    refresh();
  }

  function setCodexImeTabHidden(hidden) {
    var imeTab = document.getElementById('keysChannelTabIme');
    if (imeTab) imeTab.classList.toggle('is-codex-hidden', !!hidden);
    if (hidden && activeTab === 'ime') {
      setActiveTab('softPad', { skipHeroClear: true });
    } else {
      syncImeTabChrome();
    }
  }

  global.OneToneKeysChannelCommandPicker = {
    init: init,
    refresh: refresh,
    getSelection: getSelection,
    hasSelection: hasSelection,
    clearSelection: clearSelection,
    setSelection: setSelection,
    selectFromSlotId: selectFromSlotId,
    selectedSlotId: selectedSlotId,
    applyHero: applyHero,
    heroModel: heroModel,
    resolveMigratableAction: resolveMigratableAction,
    resolveSoftPadScope: resolveSoftPadScope,
    setSoftPadScopeAppId: setSoftPadScopeAppId,
    setSoftPadScopeMappingOverride: setSoftPadScopeMappingOverride,
    prepareSoftPadScopeScenario: prepareSoftPadScopeScenario,
    maybeAutoPreselectSoftPadScope: maybeAutoPreselectSoftPadScope,
    ensureSoftPadDefaultScope: ensureSoftPadDefaultScope,
    resetSoftPadScopeSession: resetSoftPadScopeSession,
    getSoftPadScopeLock: function () {
      return scopeLock;
    },
    getSoftPadScopeAppId: function () {
      return softPadScopeAppId;
    },
    previewPadClone: previewPadClone,
    recordSelected: recordSelected,
    onStepChange: onStepChange,
    setCodexImeTabHidden: setCodexImeTabHidden,
    getActiveTab: function () {
      return activeTab;
    },
    setActiveTab: setActiveTab
  };
})(typeof window !== 'undefined' ? window : globalThis);
