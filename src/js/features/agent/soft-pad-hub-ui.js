(function (global) {
  'use strict';

  var selectedScopeId = 'codex';
  /** Temporary display pin mirror; authoritative pin lives in Rust after IPC. */
  var userLaneId = null;
  var softPadRuntimeCache = {
    receivedFirstSnapshot: false,
    decisionRevision: 0,
    statusRevision: 0,
    snap: null
  };
  var laneDecisionRevision = 0;
  var LANE_FG_TTL_MS = 30000;
  var LANE_WAIT_TTL_MS = 60000;
  var LANE_REASONS = {
    waiting: 'waiting',
    foreground: 'foreground',
    userPin: 'userPin',
    fallback: 'fallback',
    none: 'none'
  };

  function getSelectedMappingId() {
    var st = global.OneToneState && global.OneToneState.state;
    if (!st || st.selectedMappingId == null || st.selectedMappingId === '') return null;
    return String(st.selectedMappingId);
  }

  function setSelectedMappingId(id) {
    var st = global.OneToneState && global.OneToneState.state;
    if (!st) return;
    st.selectedMappingId = (id == null || id === '') ? null : String(id);
  }

  // Soft Pad C IA: face = page route; padMode = pad-face local tabs only.
  // softPadView removed — use softPadPanelId() / getView() for legacy panel ids.
  var softPadFace = 'pad'; // pad | agent | tray | timeline
  var softPadPadMode = 'appear'; // appear | keys | look | purpose
  var lastSoftPadPadMode = 'appear';
  var VALID_SOFT_PAD_FACES = { pad: 1, agent: 1, tray: 1, timeline: 1 };
  var VALID_SOFT_PAD_PAD_MODES = { appear: 1, keys: 1, look: 1, purpose: 1 };
  var PAD_MODE_TO_PANEL = { appear: 'runtime', keys: 'layout', look: 'presentation', purpose: 'purpose' };
  var PANEL_TO_PAD_MODE = { runtime: 'appear', layout: 'keys', presentation: 'look', purpose: 'purpose' };
  /** SoftPad #3c：Soft Pad 舞台面板顺序（环芯片 / model / 测试共用；agent 走 Hero 节点）。 */
  var SOFT_PAD_PANEL_ORDER = ['runtime', 'layout', 'presentation'];
  var VALID_SOFT_PAD_VIEWS = { layout: 1, presentation: 1, runtime: 1, agent: 1, timeline: 1, purpose: 1 };
  var chromeBound = false;
  var tmHeroBooted = false;
  var selectToken = 0;
  var selectTimer = 0;
  var paintBusy = false;
  /** Soft Pad panel-open generation — not tied to selectToken (schedulePaint bumps that). */
  var softPadOpenGen = 0;
  /** Ignore non-user layout opens right after land — ghost-clicks / preview used to steal「何时显示」. */
  var softPadLandUntil = 0;
  var pendingPaintEntry = null;
  var pendingPaintOpts = null;
  var paintedMappingId = null;
  var agentLoadToken = 0;
  var subpageToken = 0;
  var paintReentry = 0;
  /** Preview-only epoch — do not merge into selectToken (scope/scheme) on first cut. */
  var previewEpoch = 0;
  var previewTimer = 0;
  // P14e：预览 force 一次性标记（schedulePreviewPaint / clear）
  var previewForceOnce = false;

  function feLog(line) {
    try {
      var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
      if (invoke) invoke('cmd_app_log', { line: String(line || '') }).catch(function () {});
    } catch (_) {}
  }

  /** Floating Soft Pad overlay can take FG and cover settings — feels like 假死. */
  var overlayDismissAt = 0;
  /** Drawer / Soft Pad settings open — never let floating overlay reclaim FG. */
  function floatingOverlayBlocked() {
    try {
      var ui = global.OneToneState && global.OneToneState.ui;
      if (ui && ui.drawerOpen) return true;
    } catch (_) {}
    return isSoftPadPageVisible();
  }
  function dismissSoftPadOverlay(reason) {
    try {
      var now = Date.now();
      var force = reason === 'settings' || reason === 'render' || reason === 'panel';
      // render + timeline open used to fire two sync dismisses in the same tick.
      if (!force && now - overlayDismissAt < 400) return;
      overlayDismissAt = now;
      var ipc = global.OneToneIpc;
      if (!ipc || typeof ipc.invoke !== 'function') return;
      ipc.invoke('cmd_codex_micro_overlay_dismiss', {}).then(function () {
        feLog('fe softPad.overlayDismiss ' + String(reason || ''));
      }).catch(function () {});
    } catch (_) {}
  }
  function ensureFloatingOverlayHidden(reason) {
    // Call sites may run before ui.drawerOpen flips — force=settings/panel always dismisses.
    if (reason !== 'settings' && reason !== 'panel' && reason !== 'render' && !floatingOverlayBlocked()) return;
    dismissSoftPadOverlay(reason || 'settings');
  }

  /** Universal baseline Soft Pad fallback — overlay on baseline mapping, not a separate row. */
  var SOFT_PAD_UNIVERSAL_KIND = 'universal';
  var LEGACY_SOFT_PAD_GLOBAL_ID = 'soft-pad-global';

  function findBaselineMapping() {
    var cfg = global.OneToneState && global.OneToneState.state && global.OneToneState.state.config;
    var diff = global.OneToneHabitOverrideDiff;
    if (diff && diff.findGlobalBaselineMapping) {
      return diff.findGlobalBaselineMapping(cfg || {}, global.OneToneMappingCore);
    }
    return null;
  }

  function isLegacyGlobalSoftPadMapping(m) {
    return !!(m && String(m.id || '') === LEGACY_SOFT_PAD_GLOBAL_ID);
  }

  function defaultBaselineSoftPadOverlay() {
    return {
      enabled: false,
      overlayEnabled: true,
      requireForeground: false,
      requireNumLockOff: false,
      showNavigationPad: false,
      navKeysEnabled: false,
      capturePhysicalArrows: false,
      presentation: 'mini',
      skin: 'default',
      layoutProfile: 'custom',
      purpose: 'shortcuts',
      softwareEnhanceEnabled: false,
      keys: [],
      codexStatusLightsEnabled: true,
      claudeStatusLightsEnabled: true,
      cursorStatusLightsEnabled: true,
      minimaxStatusLightsEnabled: true,
      workbuddyStatusLightsEnabled: true,
      traeStatusLightsEnabled: true,
      traeCodeStatusLightsEnabled: true,
      qoderStatusLightsEnabled: true,
      copilotStatusLightsEnabled: true,
      geminiStatusLightsEnabled: true,
      clineStatusLightsEnabled: true,
      opencodeStatusLightsEnabled: true,
      aiderStatusLightsEnabled: true,
      ambientEnabled: true,
      ambientMode: 'status',
      ambientOpacity: 100,
      keyLightPreset: 'default'
    };
  }

  /** Ensure universal baseline carries overlay-only Soft Pad config (keys stay native). */
  function ensureBaselineSoftPadOverlay(opts) {
    opts = opts || {};
    var m = findBaselineMapping();
    if (!m) return null;
    if (!m.codexMicroPad) m.codexMicroPad = defaultBaselineSoftPadOverlay();
    return m;
  }

  function universalSoftPadSchemeEntry() {
    var m = ensureBaselineSoftPadOverlay({ persist: false });
    if (!m) return null;
    var pad = m.codexMicroPad;
    var flags = softPadRuntimeFlags(m);
    return {
      mapping: m,
      kind: SOFT_PAD_UNIVERSAL_KIND,
      appId: '',
      mappingEnabled: flags.mappingEnabled,
      padConfigured: flags.padConfigured,
      padSwitchOn: flags.padSwitchOn,
      padEnabled: flags.padEnabled,
      canEnable: false,
      canPrepare: false,
      title: t('softPadScopeUniversal', '通用'),
      presentation: (pad && pad.presentation === 'full') ? 'full' : 'mini'
    };
  }

  /** Agent Soft Pad app targets (extensible for future apps). */
  var AGENT_SOFT_PAD_APP_IDS = {
    'codex-chat': 'codex',
    'claude-code': 'claude',
    'cursor-chat': 'cursor',
    'minimax-chat': 'minimax',
    'copilot-cli': 'copilotCli',
    'gemini-cli': 'gemini',
    'workbuddy-chat': 'workbuddy',
    'trae-work': 'trae',
    'trae-chat': 'trae', // legacy → Trae Work
    'trae-code': 'traeCode',
    'qoder-chat': 'qoder',
    'cline-chat': 'cline',
    'opencode-chat': 'opencode',
    'aider-chat': 'aider'
  };

  /** Soft Pad Hub apps — Shell Hook Shortcuts + MiniMax provider. */
  var BUILTIN_SOFT_PAD_APPS = [
    { kind: 'codex', appId: 'codex-chat' },
    { kind: 'claude', appId: 'claude-code' },
    { kind: 'cursor', appId: 'cursor-chat' },
    { kind: 'minimax', appId: 'minimax-chat' },
    { kind: 'workbuddy', appId: 'workbuddy-chat' },
    { kind: 'trae', appId: 'trae-work' },
    { kind: 'traeCode', appId: 'trae-code' },
    { kind: 'qoder', appId: 'qoder-chat' }
  ];

  var HUB_KIND_RANK = {
    codex: 0,
    claude: 1,
    cursor: 2,
    minimax: 3,
    workbuddy: 4,
    trae: 5,
    traeCode: 6,
    qoder: 7
  };

  /** Cached install inventory for Hub sort / scan UI. */
  var hubInventoryCache = null;
  var hubInventoryByKind = {};

  function isShellHookHubKind(kind) {
    var k = String(kind || '').toLowerCase();
    return k === 'workbuddy' || k === 'traecode' || k === 'qoder';
  }

  function t(key, fallback) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mappings() {
    var st = global.OneToneState && global.OneToneState.state;
    return (st && st.config && st.config.mappings) || [];
  }

  function codexAppId() {
    var A = global.OneToneAgentActions;
    return (A && A.APP_TARGET_ID) || 'codex-chat';
  }

  function kindForAppId(appId) {
    appId = String(appId || '');
    if (appId === codexAppId() || appId === 'codex-chat') return 'codex';
    if (AGENT_SOFT_PAD_APP_IDS[appId]) return AGENT_SOFT_PAD_APP_IDS[appId];
    return '';
  }

  function kindForMapping(m) {
    var baseline = findBaselineMapping();
    if (baseline && m && m.id === baseline.id) return SOFT_PAD_UNIVERSAL_KIND;
    if (isLegacyGlobalSoftPadMapping(m)) return '';
    return kindForAppId(m && m.appTargetId) || 'soft';
  }

  function appIdForKind(kind) {
    kind = String(kind || '');
    if (kind === SOFT_PAD_UNIVERSAL_KIND) return '';
    for (var i = 0; i < BUILTIN_SOFT_PAD_APPS.length; i++) {
      if (BUILTIN_SOFT_PAD_APPS[i].kind === kind) return BUILTIN_SOFT_PAD_APPS[i].appId;
    }
    return '';
  }

  function iconForAppId(appId) {
    appId = String(appId || '');
    if (!appId) return '';
    var P = global.OneToneAppTargetPresets;
    var preset = P && P.presetById ? P.presetById(appId) : null;
    return preset && preset.icon ? String(preset.icon) : '';
  }

  function iconForKind(kind) {
    if (kind === SOFT_PAD_UNIVERSAL_KIND) return '';
    return iconForAppId(appIdForKind(kind));
  }

  function iconHtml(kind, cls) {
    if (kind === SOFT_PAD_UNIVERSAL_KIND) {
      return '<span class="' + esc(cls || 'soft-pad-app-icon') + ' soft-pad-app-chip-icon--universal" aria-hidden="true">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/>' +
        '<path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>' +
        '</svg></span>';
    }
    var src = iconForKind(kind);
    if (!src) return '';
    return '<img class="' + esc(cls || 'soft-pad-app-icon') + '" src="' + esc(src) +
      '" alt="" decoding="async" width="18" height="18" />';
  }

  /**
   * Soft Pad scheme eligibility (shared).
   * - Soft Pad enabled, or
   * - Known agent app target (Codex / Claude / …)
   */
  function isSoftPadSchemeEligible(m) {
    if (!m || !m.id) return false;
    if (isLegacyGlobalSoftPadMapping(m)) return false;
    var baseline = findBaselineMapping();
    if (baseline && m.id === baseline.id) return true;
    var pad = m.codexMicroPad;
    if (pad && pad.enabled === true) return true;
    return !!kindForAppId(m.appTargetId);
  }

  /** Builtin Soft Pad kinds shown in hub UI. */
  function isHubSoftPadKind(kind) {
    if (kind === SOFT_PAD_UNIVERSAL_KIND) return true;
    return !!appIdForKind(kind);
  }

  function appTitleFor(kind) {
    if (kind === SOFT_PAD_UNIVERSAL_KIND) return t('softPadScopeUniversal', '通用');
    if (kind === 'claude') return t('softPadHubKindClaude', 'Claude');
    if (kind === 'codex') return t('softPadHubKindCodex', 'Codex');
    if (kind === 'cursor') return t('softPadHubKindCursor', 'Cursor');
    if (kind === 'workbuddy') return t('softPadHubKindWorkBuddy', 'WorkBuddy');
    if (kind === 'trae') return t('softPadHubKindTraeWork', 'Trae Work');
    if (kind === 'traeCode' || String(kind || '').toLowerCase() === 'traecode') {
      return t('softPadHubKindTraeCode', 'Trae Code');
    }
    if (kind === 'qoder') return t('softPadHubKindQoder', 'Qoder');
    if (kind === 'minimax') return t('softPadHubKindMinimax', 'MiniMax');
    return t('softPadHubKindSoft', 'Soft Pad');
  }

  /** Default Hub tab — agent apps first; universal fallback is secondary. */
  function pickHubDefaultScopeId(entries) {
    entries = entries || listSoftPadSchemes();
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].padEnabled && entries[i].kind === 'codex') return 'codex';
    }
    for (i = 0; i < entries.length; i++) {
      if (entries[i].padEnabled) return entries[i].kind;
    }
    if (entries[0] && entries[0].kind) return entries[0].kind;
    return 'codex';
  }

  /** Hub tab entry (may be disabled / prepare-only). Not for keycap / home primary lane. */
  function pickHubDefaultEntry(entries) {
    entries = entries || listSoftPadSchemes();
    var scopeId = pickHubDefaultScopeId(entries);
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].kind === scopeId) return entries[i];
    }
    return pickUniversalEntry(entries) || entries[0] || null;
  }

  // Deprecated alias — Hub UI only. Do not use for primary lane / homepage.
  function pickDefaultScopeId(entries) {
    return pickHubDefaultScopeId(entries);
  }

  function pickDefaultEntry(entries) {
    return pickHubDefaultEntry(entries);
  }

  /**
   * displayLane only (homepage / Hub summary). Not overlay dispatchLane.
   * Auto: waiting → foreground → fallback, except intentional Soft Pad FG
   * (open Cursor/Claude/…) beats another agent's waiting. User pin removed.
   * Pure — does not write globals.
   */
  function resolvePrimaryLaneResult(entries, ctx) {
    ctx = ctx || {};
    entries = Array.isArray(entries) ? entries : [];
    var pool = entries.filter(function (e) {
      return !!(e && e.padEnabled && e.kind && isHubSoftPadKind(e.kind));
    });
    if (!pool.length) return { entry: null, reason: LANE_REASONS.none };

    function findKind(kind) {
      kind = String(kind || '').trim();
      if (!kind) return null;
      for (var i = 0; i < pool.length; i++) {
        if (pool[i].kind === kind) return pool[i];
      }
      return null;
    }

    var fgKind = kindForAppId(ctx.foregroundAppId);
    var hitFg = (fgKind && isHubSoftPadKind(fgKind)) ? findKind(fgKind) : null;
    var waiting = Array.isArray(ctx.waitingKinds) ? ctx.waitingKinds : [];
    // Intentional Soft Pad FG (open Cursor) beats another agent's waiting — mirror Rust resolver.
    var waitingIncludesFg = !!(fgKind && waiting.indexOf(fgKind) >= 0);
    if (!(hitFg && !waitingIncludesFg)) {
      var w;
      for (w = 0; w < waiting.length; w++) {
        var hitW = findKind(waiting[w]);
        if (hitW) return { entry: hitW, reason: LANE_REASONS.waiting };
      }
    }

    if (hitFg) return { entry: hitFg, reason: LANE_REASONS.foreground };

    return { entry: pool[0] || null, reason: pool[0] ? LANE_REASONS.fallback : LANE_REASONS.none };
  }

  function resolvePrimaryLane(entries, ctx) {
    return resolvePrimaryLaneResult(entries, ctx).entry;
  }

  function laneCache() {
    if (!global.__otSoftPadLaneCache || typeof global.__otSoftPadLaneCache !== 'object') {
      global.__otSoftPadLaneCache = {
        foregroundAppId: '',
        waitingKinds: [],
        foregroundObservedAt: null,
        waitingObservedAt: null
      };
    }
    return global.__otSoftPadLaneCache;
  }

  function evidenceFresh(observedAt, ttlMs) {
    if (observedAt == null || !(Number(observedAt) > 0)) return false;
    return (Date.now() - Number(observedAt)) <= ttlMs;
  }

  /** Sync writers only — never await IPC from homepage snapshot. Records evidence time. */
  function noteLaneForeground(appId) {
    var cache = laneCache();
    cache.foregroundAppId = String(appId || '').trim();
    cache.foregroundObservedAt = cache.foregroundAppId ? Date.now() : null;
  }

  /**
   * Read-only fresh Soft Pad lane foreground appTargetId (TTL).
   * Does not follow live window or resolvePrimaryLaneResult fallbacks.
   */
  function getFreshForegroundAppId() {
    var cache = laneCache();
    if (!evidenceFresh(cache.foregroundObservedAt, LANE_FG_TTL_MS)) return '';
    var fg = String(cache.foregroundAppId || '').trim();
    if (!fg) return '';
    var low = fg.toLowerCase();
    if (low === 'onetone' || low.indexOf('onetone') >= 0) return '';
    return fg;
  }

  /** waitingKinds = needs_input only — do not push running/working here. */
  function noteLaneWaitingKinds(kinds) {
    var cache = laneCache();
    cache.waitingKinds = Array.isArray(kinds)
      ? kinds.map(function (k) { return String(k || '').trim(); }).filter(Boolean)
      : [];
    cache.waitingObservedAt = cache.waitingKinds.length ? Date.now() : null;
  }

  function getUserLaneId() {
    return userLaneId == null || userLaneId === '' ? null : String(userLaneId);
  }

  function ingestSoftPadRuntimeSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return false;
    var dr = Number(snap.decisionRevision) || 0;
    var sr = Number(snap.statusRevision) || 0;
    if (dr < softPadRuntimeCache.decisionRevision) return false;
    if (dr === softPadRuntimeCache.decisionRevision && sr < softPadRuntimeCache.statusRevision) {
      return false;
    }
    softPadRuntimeCache.decisionRevision = dr;
    softPadRuntimeCache.statusRevision = sr;
    softPadRuntimeCache.snap = snap;
    softPadRuntimeCache.receivedFirstSnapshot = true;
    // Pin product removed — never rehydrate userLaneId from snapshot.
    userLaneId = null;
    try {
      global.__otSoftPadRuntimeSnapshot = snap;
    } catch (_) {}
    return true;
  }

  function refreshSoftPadRuntimeAsync() {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return;
    try {
      Promise.resolve(invoke('cmd_soft_pad_runtime_snapshot'))
        .then(function (snap) {
          if (ingestSoftPadRuntimeSnapshot(snap)) {
            try {
              if (global.__otSoftPadWorkflowSync) global.__otSoftPadWorkflowSync();
            } catch (_) {}
            updateScopeHint();
          }
        })
        .catch(function () {});
    } catch (_) {}
  }

  function getCachedSoftPadRuntime() {
    return softPadRuntimeCache;
  }

  /** Pin removed: any call clears to Auto (IPC always lane:null). */
  var followPinClearedOnce = false;
  function setUserLaneId(_kind) {
    userLaneId = null;
    clearUserLanePin();
  }

  /** One-shot backend pin clear — avoid remounting switcher chips on every Soft Pad open. */
  function clearUserLanePin() {
    userLaneId = null;
    if (followPinClearedOnce) return;
    followPinClearedOnce = true;
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return;
    try {
      Promise.resolve(invoke('cmd_soft_pad_set_follow', { lane: null }))
        .then(function (snap) {
          ingestSoftPadRuntimeSnapshot(snap);
          // Pin is gone from chrome — skip workflow sync (was remounting chips mid-click).
          updateScopeHint();
        })
        .catch(function () {});
    } catch (_) {}
  }

  /** Clear memory pin when target leaves enabled pool (config / disable path). */
  function pruneInvalidUserLanePin(entries) {
    if (!userLaneId) return false;
    entries = Array.isArray(entries) ? entries : listSoftPadSchemes();
    var ok = false;
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i] && entries[i].padEnabled && entries[i].kind === userLaneId) {
        ok = true;
        break;
      }
    }
    if (!ok) {
      userLaneId = null;
      return true;
    }
    return false;
  }

  /**
   * Read-only lane context for resolvePrimaryLane*.
   * Filters expired evidence; prefers Soft Pad cache then habit-layer-nav fg.
   */
  function laneContextFromRuntime() {
    var cache = laneCache();
    var fgObserved = cache.foregroundObservedAt;
    var waitObserved = cache.waitingObservedAt;
    var fgFresh = evidenceFresh(fgObserved, LANE_FG_TTL_MS);
    var waitFresh = evidenceFresh(waitObserved, LANE_WAIT_TTL_MS);

    var fg = fgFresh ? String(cache.foregroundAppId || '').trim() : '';
    if (!fg) {
      // Live nav/ui fg is treated as fresh observation of current process fg.
      try {
        var nav = global.OneToneHabitLayerNav;
        if (nav && typeof nav.foregroundAppId === 'function') {
          fg = String(nav.foregroundAppId() || '').trim();
        }
      } catch (_) {}
      if (!fg) {
        try {
          var ui = global.OneToneState && global.OneToneState.ui;
          var id = ui && ui.habitHubFgIdentity;
          if (id) {
            fg = String(id.matchedPresetAppId || id.matched_preset_app_id || id.appId || '').trim();
          }
        } catch (_) {}
      }
      if (fg) {
        fgFresh = true;
        fgObserved = null; // live read — not a cached evidence timestamp
      }
    }

    return {
      foregroundAppId: fgFresh ? fg : '',
      waitingKinds: waitFresh && Array.isArray(cache.waitingKinds) ? cache.waitingKinds.slice() : [],
      userLaneId: null,
      foregroundFresh: !!fgFresh && !!fg,
      waitingFresh: !!waitFresh && Array.isArray(cache.waitingKinds) && cache.waitingKinds.length > 0,
      foregroundObservedAt: fgFresh ? fgObserved : null,
      waitingObservedAt: waitFresh ? waitObserved : null
    };
  }

  /** Debug publish only — call from formal home/runtime path, not from pure resolve. */
  function publishSoftPadLaneSnapshot(partial) {
    partial = partial || {};
    laneDecisionRevision += 1;
    var snap = {
      displayLaneKind: partial.displayLaneKind == null ? null : partial.displayLaneKind,
      reason: partial.reason || LANE_REASONS.none,
      userLaneId: partial.userLaneId == null ? null : partial.userLaneId,
      foregroundAppId: partial.foregroundAppId || '',
      waitingKinds: Array.isArray(partial.waitingKinds) ? partial.waitingKinds.slice() : [],
      foregroundFresh: !!partial.foregroundFresh,
      waitingFresh: !!partial.waitingFresh,
      foregroundObservedAt: partial.foregroundObservedAt == null ? null : partial.foregroundObservedAt,
      waitingObservedAt: partial.waitingObservedAt == null ? null : partial.waitingObservedAt,
      otherEnabledCount: Number(partial.otherEnabledCount) || 0,
      source: partial.source || 'home',
      decisionRevision: laneDecisionRevision,
      decidedAt: Date.now()
    };
    try { global.__otSoftPadLaneSnapshot = snap; } catch (_) {}
    return snap;
  }

  /** Display-lane copy only — no control/dispatch promises. */
  function formatDisplayLaneReason(reason, agentName) {
    agentName = String(agentName || '').trim() || t('softPadHubKindSoft', 'Soft Pad');
    if (reason === LANE_REASONS.waiting) {
      return t('homeWbSoftPadReasonWaiting', '{name} 正在等待你，首页已显示 {name}')
        .replace(/\{name\}/g, agentName);
    }
    if (reason === LANE_REASONS.foreground) {
      var appLabel = agentName === t('softPadHubKindClaude', 'Claude') || agentName === 'Claude'
        ? 'Claude Code'
        : (agentName === t('softPadHubKindCodex', 'Codex') || agentName === 'Codex' ? 'Codex' : agentName);
      return t('homeWbSoftPadReasonForeground', '根据你正在使用的 {app}，首页显示 {name}')
        .replace('{app}', appLabel)
        .replace('{name}', agentName);
    }
    if (reason === LANE_REASONS.userPin) {
      // Legacy reason — treat as auto fallback copy.
      return t('homeWbSoftPadReasonFallback', '已使用准备好的 {name}').replace('{name}', agentName);
    }
    if (reason === LANE_REASONS.fallback) {
      return t('homeWbSoftPadReasonFallback', '已使用准备好的 {name}').replace('{name}', agentName);
    }
    return t('homeWbSoftPadReasonNone', '还没有可用的 Agent，先准备 Codex 或 Claude');
  }

  /** Follow/pin chips removed — Soft Pad top bar is app scopes (+ purpose) only. */
  function followChipView() {
    return '';
  }

  function currentPadPurpose(entry) {
    var pad = entry && entry.mapping && entry.mapping.codexMicroPad;
    var p = pad && pad.purpose ? String(pad.purpose).toLowerCase() : 'shortcuts';
    return p === 'sessions' ? 'sessions' : 'shortcuts';
  }

  /** Top segmented: shortcuts vs sessions (per mapping). Does not change ACT/NAV/ENC. */
  function purposeChipView(entry) {
    if (!entry || !entry.mapping || !entry.mapping.codexMicroPad) return '';
    var cur = currentPadPurpose(entry);
    var mid = String(entry.mapping.id || '');
    var kind = String(entry.kind || kindForAppId(entry.mapping.appTargetId) || '').toLowerCase();
    var sessionsAllowed = kind === 'claude' || kind === 'codex';
    function btn(id, label, opts) {
      opts = opts || {};
      var on = cur === id;
      var disabled = !!opts.disabled;
      return (
        '<button type="button" class="soft-pad-app-chip soft-pad-purpose-chip' +
        (on ? ' is-active' : '') +
        (disabled ? ' is-disabled' : '') +
        '" data-pad-purpose="' + id + '" data-mapping-id="' + esc(mid) + '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        ' aria-pressed="' + (on ? 'true' : 'false') + '"' +
        ' title="' + esc(opts.title || label) + '"><span>' + esc(label) + '</span></button>'
      );
    }
    var sessionsLbl = kind === 'codex'
      ? t('softPadPurposeSessionsCodex', '线程槽（实验）')
      : t('softPadPurposeSessions', '会话槽');
    var sessionsTitle = kind === 'codex'
      ? t('softPadPurposeSessionsCodexHint', '查看状态、聚焦终端或恢复线程；不保证打开 App 内侧栏。')
      : kind === 'claude'
        ? t('softPadPurposeSessionsClaudeHint', 'AG=顶层会话；角点为子代理装饰。不保证打开 App 内侧栏。')
        : t('softPadPurposeSessionsCursorHint', 'Cursor 不支持会话槽，AG 保持动作键。');
    return (
      '<span class="soft-pad-purpose-seg" role="group" aria-label="' +
      esc(t('softPadPurposeAria', 'AG 键做什么')) + '">' +
      btn('shortcuts', t('softPadPurposeShortcuts', '动作键')) +
      (sessionsAllowed
        ? btn('sessions', sessionsLbl, { title: sessionsTitle })
        : '') +
      '</span>'
    );
  }

  function recommendedNavigationSlots(kind) {
    if (kind === 'claude') return ['AG00', 'AG01', 'AG02', 'AG03'];
    if (kind === 'codex') return ['AG00', 'AG01'];
    return [];
  }

  function navigationSlotConflicts(pad, slots) {
    var conflicts = [];
    (slots || []).forEach(function (slot) {
      var route = (pad && pad.keys || []).find(function (k) {
        return k.enabled !== false && String(k.microKeyId || '') === slot;
      });
      if (!route) return;
      var sid = String(route.slotId || '').trim();
      if (!sid || sid === 'status') return;
      conflicts.push(slot);
    });
    return conflicts;
  }

  function applyNavigationKeyRolesOnPad(pad, slots) {
    if (!pad) return;
    var set = {};
    (slots || []).forEach(function (s) { set[s] = true; });
    (pad.keys || []).forEach(function (k) {
      var mid = String(k.microKeyId || '');
      if (!/^AG\d+$/i.test(mid)) return;
      if (set[mid]) {
        k.keyRole = 'agentLane';
        k.autoAssignable = true;
      } else {
        k.keyRole = 'action';
        k.autoAssignable = false;
      }
    });
  }

  function navigationSlotsOnPad(pad) {
    return (pad && pad.keys || []).filter(function (k) {
      return k.enabled !== false &&
        String(k.keyRole || '').toLowerCase() === 'agentlane';
    }).map(function (k) { return String(k.microKeyId || ''); }).filter(Boolean);
  }

  function findMappingById(mappingId) {
    mappingId = String(mappingId || '').trim();
    if (!mappingId) return null;
    var list = mappings();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === mappingId) return list[i];
    }
    return null;
  }

  function persistPadPurposeAndSlots(mappingId, purpose, slots) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return Promise.resolve();
    mappingId = String(mappingId || '');
    purpose = purpose === 'sessions' ? 'sessions' : 'shortcuts';
    slots = slots || [];
    if (purpose === 'shortcuts') {
      return Promise.resolve(invoke('cmd_soft_pad_set_navigation_slots', {
        mappingId: mappingId,
        slots: []
      })).then(function () {
        return invoke('cmd_soft_pad_set_purpose', { mappingId: mappingId, purpose: 'shortcuts' });
      });
    }
    return Promise.resolve(invoke('cmd_soft_pad_set_purpose', {
      mappingId: mappingId,
      purpose: 'sessions'
    })).then(function () {
      // Backend seeds recommended slots when empty; skip empty follow-up (would clear them).
      if (!slots.length) return null;
      return invoke('cmd_soft_pad_set_navigation_slots', {
        mappingId: mappingId,
        slots: slots
      });
    });
  }

  function setPadPurpose(mappingId, purpose) {
    mappingId = String(mappingId || '').trim();
    purpose = String(purpose || '').toLowerCase() === 'sessions' ? 'sessions' : 'shortcuts';
    if (!mappingId) return;
    var mapping = findMappingById(mappingId);
    var pad = mapping && mapping.codexMicroPad;
    var kind = String(kindForAppId(mapping && mapping.appTargetId) || '').toLowerCase();
    if (purpose === 'sessions' && kind !== 'claude' && kind !== 'codex') return;
    if (String((pad && pad.purpose) || 'shortcuts') === purpose) {
      if (purpose !== 'sessions' || navigationSlotsOnPad(pad).length) return;
    }
    var recommended = recommendedNavigationSlots(kind);
    if (purpose === 'sessions') {
      var conflicts = navigationSlotConflicts(pad, recommended);
      var msg = t('softPadNavEnableConfirm',
        '启用导航后，将把 {slots} 设为物理会话槽（其余 AG 保持动作键）。')
        .replace('{slots}', recommended.join(', '));
      if (conflicts.length) {
        msg += ' ' + t('softPadNavConflictWarn',
          '以下键将不再执行原快捷动作：{keys}。')
          .replace('{keys}', conflicts.join(', '));
      }
      if (typeof global.confirm === 'function' && !global.confirm(msg)) return;
    }
    if (pad) {
      pad.purpose = purpose;
      applyNavigationKeyRolesOnPad(pad, purpose === 'sessions' ? recommended : []);
    }
    persistPadPurposeAndSlots(mappingId, purpose, purpose === 'sessions' ? recommended : [])
      .then(function () {
        try {
          if (global.__otSoftPadWorkflowSync) global.__otSoftPadWorkflowSync();
        } catch (_) {}
        if (!patchAppSwitcher()) renderAppSwitcher();
        syncSoftPadPadRing(resolveSoftPadEntry());
        schedulePreviewPaint(resolveSoftPadEntry());
      })
      .catch(function (err) {
        toast(t('softPadPurposePersistFail', '会话导航保存失败：{err}')
          .replace('{err}', String((err && err.message) || err || 'unknown')));
        if (!patchAppSwitcher()) renderAppSwitcher();
      });
  }

  function handlePurposeChipClick(el) {
    if (!el) return false;
    var purpose = el.getAttribute('data-pad-purpose');
    if (!purpose) return false;
    var mid = el.getAttribute('data-mapping-id') || '';
    setPadPurpose(mid, purpose);
    return true;
  }

  function softPadRuntimeFlags(m) {
    var pad = m && m.codexMicroPad;
    var mappingEnabled = !!(m && m.enabled !== false);
    var padConfigured = !!pad;
    var padSwitchOn = !!(pad && pad.enabled);
    return {
      mappingEnabled: mappingEnabled,
      padConfigured: padConfigured,
      padSwitchOn: padSwitchOn,
      padEnabled: mappingEnabled && padSwitchOn
    };
  }

  /**
   * Tiered scheme preference (no additive score — order cannot invert priority).
   * Returns true if `a` should replace `b` as the kind winner.
   */
  function schemeBetter(a, b) {
    if (!b) return true;
    if (!a) return false;
    var ma = a.mapping;
    var mb = b.mapping;
    var aEn = ma && ma.enabled !== false ? 1 : 0;
    var bEn = mb && mb.enabled !== false ? 1 : 0;
    if (aEn !== bEn) return aEn > bEn;
    var aPad = ma && ma.codexMicroPad && ma.codexMicroPad.enabled ? 1 : 0;
    var bPad = mb && mb.codexMicroPad && mb.codexMicroPad.enabled ? 1 : 0;
    if (aPad !== bPad) return aPad > bPad;
    var aOv = ma && ma.codexMicroPad && ma.codexMicroPad.overlayEnabled ? 1 : 0;
    var bOv = mb && mb.codexMicroPad && mb.codexMicroPad.overlayEnabled ? 1 : 0;
    if (aOv !== bOv) return aOv > bOv;
    var aOrd = Number(ma && ma.order) || 0;
    var bOrd = Number(mb && mb.order) || 0;
    if (aOrd !== bOrd) return aOrd < bOrd;
    return String((ma && ma.id) || '') < String((mb && mb.id) || '');
  }

  /** @deprecated use schemeBetter — kept for any external peek */
  function schemeRank(entry) {
    // Approximate ordinal for debug only; do not use for selection.
    var pad = entry.mapping && entry.mapping.codexMicroPad;
    var score = 0;
    if (entry.mapping && entry.mapping.enabled !== false) score += 10000;
    if (pad && pad.enabled) score += 100;
    if (pad && pad.overlayEnabled) score += 10;
    score -= Number(entry.mapping && entry.mapping.order) || 0;
    return score;
  }

  /**
   * One Soft Pad scheme per agent app (Codex / Claude / …),
   * plus Soft Pad–enabled custom habits (kind soft).
   */
  function listSoftPadSchemes() {
    var byKind = {};
    var softExtras = [];
    mappings().forEach(function (m) {
      if (isLegacyGlobalSoftPadMapping(m)) return;
      if (!isSoftPadSchemeEligible(m)) return;
      var kind = kindForMapping(m);
      var pad = m.codexMicroPad;
      var flags = softPadRuntimeFlags(m);
      if (!isHubSoftPadKind(kind)) {
        // Custom Soft Pad habits: only show when pad switch is on (configured).
        if (!flags.padSwitchOn) return;
        var softTitle = '';
        if (global.OneToneHabitProfile && global.OneToneHabitProfile.habitDisplayName) {
          softTitle = global.OneToneHabitProfile.habitDisplayName(m);
        }
        if (!softTitle || softTitle === '—') softTitle = String(m.name || m.appTargetId || t('softPadHubKindSoft', '我的应用'));
        softExtras.push({
          mapping: m,
          kind: 'soft',
          appId: String(m.appTargetId || ''),
          mappingEnabled: flags.mappingEnabled,
          padConfigured: flags.padConfigured,
          padSwitchOn: flags.padSwitchOn,
          padEnabled: flags.padEnabled,
          canEnable: flags.mappingEnabled && flags.padConfigured && !flags.padSwitchOn,
          canPrepare: !flags.padConfigured,
          title: softTitle,
          presentation: (pad && pad.presentation === 'mini') ? 'mini' : 'full'
        });
        return;
      }
      var entry = {
        mapping: m,
        kind: kind,
        appId: String(m.appTargetId || ''),
        mappingEnabled: flags.mappingEnabled,
        padConfigured: flags.padConfigured,
        padSwitchOn: flags.padSwitchOn,
        padEnabled: flags.padEnabled,
        canEnable: flags.mappingEnabled && flags.padConfigured && !flags.padSwitchOn,
        canPrepare: !flags.padConfigured,
        title: appTitleFor(kind),
        presentation: (pad && pad.presentation === 'mini') ? 'mini' : 'full'
      };
      var prev = byKind[kind];
      if (!prev || schemeBetter(entry, prev)) {
        byKind[kind] = entry;
      }
    });
    var out = Object.keys(byKind).map(function (k) { return byKind[k]; });
    out.sort(function (a, b) {
      var ra = HUB_KIND_RANK[a.kind] != null ? HUB_KIND_RANK[a.kind] : 8;
      var rb = HUB_KIND_RANK[b.kind] != null ? HUB_KIND_RANK[b.kind] : 8;
      if (ra !== rb) return ra - rb;
      return String(a.title).localeCompare(String(b.title));
    });
    softExtras.sort(function (a, b) {
      return String(a.title).localeCompare(String(b.title));
    });
    var universalEntry = universalSoftPadSchemeEntry();
    var merged = out.concat(softExtras);
    return universalEntry ? [universalEntry].concat(merged) : merged;
  }

  function listHubEntries() {
    return listSoftPadSchemes();
  }

  /** Universal baseline Soft Pad fallback entry. */
  function pickUniversalEntry(entries) {
    entries = entries || listSoftPadSchemes();
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].kind === SOFT_PAD_UNIVERSAL_KIND) return entries[i];
    }
    return null;
  }

  function placeholderEntry(kind, appId) {
    return {
      mapping: null,
      kind: kind,
      appId: appId,
      padEnabled: false,
      canEnable: false,
      canPrepare: true,
      title: appTitleFor(kind),
      presentation: 'full'
    };
  }

  /**
   * Create/reuse app scenario + Soft Pad for a builtin app (Claude / Cursor / …).
   * Only creates when missing — never re-enable / IPC on every tab click (假死).
   */
  function ensureAppSoftPad(appId, kind, opts) {
    opts = opts || {};
    appId = String(appId || appIdForKind(kind) || '').trim();
    kind = kind || kindForAppId(appId);
    if (!appId) return null;

    var H = global.OneToneHabitHub;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!H || !H.findAppScenarioByAppId) return null;

    var existing = H.findAppScenarioByAppId(appId);
    if (existing) {
      if (appId === 'cursor-chat' || appId === 'workbuddy-chat' ||
          appId === 'trae-work' || appId === 'trae-chat' || appId === 'trae-code' ||
          appId === 'qoder-chat') {
        var Tcur = global.OneToneAgentScenarioTemplate;
        if (Tcur && Tcur.ensurePackForMapping) {
          Tcur.ensurePackForMapping(existing, { persist: true });
        }
      }
      if (Pad && Pad.ensurePad) Pad.ensurePad(existing, { persist: false });
      return existing;
    }

    if (kind === 'codex' || appId === 'codex-chat') {
      if (Pad && Pad.applyNumpadControllerStandard) {
        var cx = Pad.applyNumpadControllerStandard({ mode: 'openExisting', openPanel: false });
        if (cx) return cx;
      }
    }

    if (!H.createAppScenario) return null;
    // deferPersist: avoid habits-hub toast/remount while Soft Pad page is open.
    var m = H.createAppScenario(appId, { deferPersist: true });
    if (!m) return null;
    var persistNew = global.OneToneConfigPersist;
    if (persistNew && persistNew.saveAsync) persistNew.saveAsync();
    else if (persistNew && persistNew.save) persistNew.save();

    if (Pad && Pad.ensurePad) Pad.ensurePad(m, { persist: false });
    if (!m.codexMicroPad) return m;
    if (opts.enable !== false) {
      m.codexMicroPad.enabled = true;
      m.codexMicroPad.overlayEnabled = true;
      var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
      if (invoke) {
        invoke('cmd_codex_micro_pad_set_flags', {
          mappingId: String(m.id),
          enabled: true,
          requireNumLockOff: !!m.codexMicroPad.requireNumLockOff,
          overlayEnabled: true,
          navKeysEnabled: m.codexMicroPad.showNavigationPad !== false && m.codexMicroPad.navKeysEnabled !== false
        }).catch(function () {
          var p = global.OneToneConfigPersist;
          if (p && p.saveAsync) p.saveAsync();
          else if (p && p.save) p.save();
        });
      } else if (persistNew && persistNew.saveAsync) {
        persistNew.saveAsync();
      }
    }
    return m;
  }

  /**
   * Scopes for top switcher: universal baseline fallback + builtin Agent apps.
   */
  function listAppScopes() {
    ensureBaselineSoftPadOverlay({ persist: false });
    var entries = listSoftPadSchemes();
    var byKind = {};
    entries.forEach(function (e) { byKind[e.kind] = e; });
    var universalEntry = byKind[SOFT_PAD_UNIVERSAL_KIND] || universalSoftPadSchemeEntry();
    var universalScope = universalEntry ? {
      id: SOFT_PAD_UNIVERSAL_KIND,
      kind: SOFT_PAD_UNIVERSAL_KIND,
      appId: '',
      title: universalEntry.title,
      mapping: universalEntry.mapping,
      entry: universalEntry,
      padEnabled: !!universalEntry.padEnabled,
      canPrepare: false,
      installed: true,
      connected: !!(universalEntry.mapping && universalEntry.mapping.codexMicroPad &&
        universalEntry.mapping.codexMicroPad.overlayEnabled),
      inv: null
    } : null;
    var scopes = BUILTIN_SOFT_PAD_APPS.map(function (b) {
      var entry = byKind[b.kind] || placeholderEntry(b.kind, b.appId);
      var inv = hubInventoryByKind[b.kind] || null;
      var installed = !!(inv && (inv.confidence === 'high' || inv.running));
      var connected = !!(inv && inv.lightEnabled && entry.padEnabled);
      return {
        id: b.kind,
        kind: b.kind,
        appId: b.appId,
        title: entry.title,
        mapping: entry.mapping,
        entry: entry,
        padEnabled: !!entry.padEnabled,
        canPrepare: !!entry.canPrepare,
        installed: installed,
        connected: connected,
        inv: inv
      };
    });
    scopes.sort(function (a, b) {
      var ra = a.connected ? 0 : (a.installed ? 1 : 2);
      var rb = b.connected ? 0 : (b.installed ? 1 : 2);
      if (ra !== rb) return ra - rb;
      return (HUB_KIND_RANK[a.kind] || 99) - (HUB_KIND_RANK[b.kind] || 99);
    });
    return universalScope ? [universalScope].concat(scopes) : scopes;
  }

  /** Aside list: builtin apps (existing or「可准备」) + Soft Pad custom habits. */
  function listAsideEntries() {
    var entries = listSoftPadSchemes();
    var byKind = {};
    var softRows = [];
    entries.forEach(function (e) {
      if (e.kind === 'soft') softRows.push(e);
      else byKind[e.kind] = e;
    });
    var builtins = BUILTIN_SOFT_PAD_APPS.map(function (b) {
      return byKind[b.kind] || placeholderEntry(b.kind, b.appId);
    });
    return builtins.concat(softRows);
  }

  function findScope(scopeId) {
    var id = String(scopeId || '');
    var scopes = listAppScopes();
    var i;
    for (i = 0; i < scopes.length; i++) {
      if (scopes[i].id === id) return scopes[i];
    }
    return scopes[0] || null;
  }

  function kindLabel(kind) {
    return appTitleFor(kind);
  }

  function statusLabel(entry) {
    if (entry.padEnabled) return t('softPadHubStatusOn', '已启用');
    if (entry.canPrepare) return t('softPadHubStatusCanPrepare', '可准备');
    if (entry.canEnable) return t('softPadHubStatusCanEnable', '可开启');
    return t('softPadHubStatusOff', '未启用');
  }

  function presentationLabel(presentation) {
    return presentation === 'mini'
      ? t('softPadPresMini', '迷你条')
      : t('softPadPresFull', '大键盘');
  }

  function profileLabel(profile) {
    if (profile === 'beginner') return t('codexMicroPadProfileBeginner', '入门');
    if (profile === 'advanced') return t('codexMicroPadProfileAdvanced', '高级');
    if (profile === 'custom') return t('codexMicroPadProfileCustom', '自定义');
    return t('codexMicroPadProfileStandard', '标准');
  }

  function statusTag(entry) {
    if (entry.padEnabled) return { cls: 'is-on', key: 'softPadHubStatusOn', text: t('softPadHubStatusOn', '已启用') };
    if (entry.canPrepare) return { cls: 'is-draft', key: 'softPadHubStatusCanPrepare', text: t('softPadHubStatusCanPrepare', '可准备') };
    if (entry.canEnable) return { cls: 'is-draft', key: 'softPadHubStatusCanEnable', text: t('softPadHubStatusCanEnable', '可开启') };
    return { cls: 'is-off', key: 'softPadHubStatusOff', text: t('softPadHubStatusOff', '未启用') };
  }

  function els() {
    return {
      list: document.getElementById('softPadSchemeList'),
      count: document.getElementById('softPadSchemeCount'),
      preview: document.getElementById('softPadPreviewHost'),
      agentPreview: document.getElementById('softPadAgentPreviewHost'),
      agentBody: document.getElementById('softPadAgentBody'),
      facePad: document.getElementById('softPadFacePad'),
      faceAgent: document.getElementById('softPadFaceAgent'),
      faceTray: document.getElementById('softPadFaceTray'),
      faceTimeline: document.getElementById('softPadFaceTimeline'),
      padTabs: document.getElementById('softPadPadTabs'),
      tmPreview: document.getElementById('softPadTmPreviewHost'),
      tmDetail: document.getElementById('softPadTmDetailHost'),
      tmDesk: document.getElementById('softPadTmDesk'),
      stage: document.getElementById('softPadHubStage'),
      tiles: document.getElementById('softPadFuncTiles'),
      subHost: document.getElementById('softPadSubpageHost'),
      detailIdle: document.getElementById('softPadDetailIdle'),
      detailPanel: document.getElementById('softPadDetailPanel'),
      subBar: document.getElementById('softPadSubpageBar'),
      subBody: document.getElementById('softPadSubpageBody'),
      subTitle: document.getElementById('softPadSubpageTitle'),
      subBack: document.getElementById('btnSoftPadSubBack'),
      hint: document.getElementById('softPadScopeHint'),
      empty: document.getElementById('softPadEmpty'),
      name: document.getElementById('softPadSummaryName'),
      status: document.getElementById('softPadSummaryStatus'),
      agent: document.getElementById('softPadSummaryAgent'),
      keysMeta: document.getElementById('softPadSummaryKeys'),
      accountMeta: document.getElementById('softPadSummaryAccount'),
      usageMeta: document.getElementById('softPadSummaryUsage'),
      tm: document.getElementById('softPadSummaryTm'),
      resetMeta: document.getElementById('softPadSummaryReset'),
      enable: document.getElementById('softPadSummaryEnable'),
      statusBar: document.getElementById('softPadStatusBar'),
      ensureBtn: document.getElementById('btnSoftPadEnsureCodex'),
      titleLbl: document.getElementById('softPadSchemeTitleLbl'),
      switcher: document.getElementById('softPadAppSwitcher'),
      bindApp: document.getElementById('softPadBindApp'),
      bindAppBtn: document.getElementById('softPadBindAppBtn'),
      bindAppLbl: document.getElementById('softPadBindAppLbl'),
      bindAppMenu: document.getElementById('softPadBindAppMenu'),
      padRing: document.getElementById('softPadPadRing'),
      ringFloat: document.getElementById('softPadRingFloat'),
      aside: document.getElementById('softPadSchemeAside'),
      pageBody: document.getElementById('softPadPageBody'),
      softPadPanel: document.getElementById('settingsPanelSoftPad')
    };
  }

  function softPadPanelId() {
    if (softPadFace === 'agent') return 'agent';
    if (softPadFace === 'tray') return 'tray';
    if (softPadFace === 'timeline') return 'timeline';
    return PAD_MODE_TO_PANEL[softPadPadMode] || 'runtime';
  }

  /** One-shot map for openSubpage / forceView compat. */
  function legacyViewToRoute(view) {
    view = String(view || '');
    if (view === 'advanced') view = 'agent';
    if (view === 'agent') return { face: 'agent', mode: null };
    if (view === 'tray') return { face: 'tray', mode: null };
    if (view === 'timeline') return { face: 'timeline', mode: null };
    if (view === 'purpose') return { face: 'pad', mode: 'purpose' };
    if (PANEL_TO_PAD_MODE[view]) return { face: 'pad', mode: PANEL_TO_PAD_MODE[view] };
    if (VALID_SOFT_PAD_PAD_MODES[view]) return { face: 'pad', mode: view };
    if (view === 'hub' || !view) return { face: 'pad', mode: 'appear' };
    return { face: 'pad', mode: 'appear' };
  }

  function previewHostForFace(face) {
    face = face || softPadFace;
    if (face === 'agent') return document.getElementById('softPadAgentPreviewHost');
    if (face === 'tray') return document.getElementById('softPadTrayPreviewHost');
    if (face === 'timeline') return document.getElementById('softPadTmPreviewHost');
    return document.getElementById('softPadPreviewHost');
  }

  function panelPaintBody(panel) {
    var e = els();
    panel = panel || softPadPanelId();
    if (panel === 'agent') return e.agentBody || e.subBody;
    if (panel === 'timeline') return e.tmDetail || e.subBody;
    return e.subBody;
  }

  function syncPadTabs() {
    var e = els();
    if (!e.padTabs) return;
    var isUniversal = String(selectedScopeId || '') === SOFT_PAD_UNIVERSAL_KIND;
    e.padTabs.querySelectorAll('[data-pad-mode]').forEach(function (btn) {
      var mode = btn.getAttribute('data-pad-mode') || '';
      if (isUniversal && mode === 'keys') {
        btn.hidden = true;
        btn.setAttribute('aria-hidden', 'true');
        return;
      }
      btn.hidden = false;
      btn.removeAttribute('aria-hidden');
      var on = softPadFace === 'pad' && mode === softPadPadMode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    e.padTabs.setAttribute('data-pad-mode', softPadPadMode);
    if (isUniversal && softPadPadMode === 'keys') {
      setSoftPadPadMode('appear');
    }
  }

  function resetSoftPadRouteToPadAppear() {
    softPadFace = 'pad';
    softPadPadMode = 'appear';
  }

  var overlayUsageCache = { snap: null, at: 0 };
  var overlayUsageTimer = 0;
  var overlayUsageInFlight = false;
  var overlayUsageDeferToken = 0;
  var OVERLAY_USAGE_POLL_MS = 30000;

  function hubInvoke(cmd, args) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (typeof invoke !== 'function') return Promise.reject(new Error('no invoke'));
    return Promise.resolve(invoke(cmd, args || {}));
  }

  function formatResetCountdown(resetsAt) {
    var fmt = global.OneToneUsageFormat;
    return fmt && fmt.formatResetCountdown ? fmt.formatResetCountdown(resetsAt) : '';
  }

  function primaryResetAt(usage) {
    var fmt = global.OneToneUsageFormat;
    return fmt && fmt.primaryResetAt ? fmt.primaryResetAt(usage) : null;
  }

  function usageVal(usage, camel, snake) {
    if (!usage) return null;
    return usage[camel] != null ? usage[camel] : usage[snake];
  }

  function windowQuotaLabel(w) {
    var fmt = global.OneToneUsageFormat;
    if (fmt && fmt.windowQuotaLabel) return fmt.windowQuotaLabel(w, false);
    if (!w) return '';
    var mins = Number(w.durationMins != null ? w.durationMins : w.duration_mins) || 0;
    var rem = w.remainingPercent != null ? w.remainingPercent : w.remaining_percent;
    if (rem == null) return '';
    var pct = Math.round(Number(rem));
    var dayMins = 24 * 60;
    if (mins > 0 && mins % dayMins === 0) {
      var days = mins / dayMins;
      return days === 7 ? '周余' + pct + '%' : days + '天窗余' + pct + '%';
    }
    if (mins > 0 && mins % 60 === 0) return mins / 60 + 'h余' + pct + '%';
    if (mins > 0) return mins + 'min余' + pct + '%';
    return '窗口余' + pct + '%';
  }

  function isShellUsageKind(kind) {
    var k = String(kind || '').toLowerCase();
    return k === 'workbuddy' || k === 'trae' || k === 'traecode' || k === 'qoder';
  }

  /** User-facing usage source — never leak cursor_local_activity id. */
  function usageSourceLabel(kind, usage) {
    if (
      kind === 'cursor' ||
      String((usage && usage.source) || '') === 'cursor_local_activity'
    ) {
      return '本地统计';
    }
    return String((usage && usage.source) || '').trim();
  }

  function usagePropsFromAgent(kind, usage) {
    usage = usage || {};
    var status = String(usage.status || 'unavailable');
    var windows = Array.isArray(usage.windows) ? usage.windows : [];
    var conf = String(usage.confidence || usageVal(usage, 'confidence', 'confidence') || '');
    var bits = [];
    if (kind === 'codex' || kind === 'claude' || kind === 'minimax') {
      var src = String(usage.source || '');
      // Balance/manual only — minimax_remains must fall through to 5h/weekly windows.
      var balanceOnly = (kind === 'claude' && (src === 'deepseek_balance' || src === 'kimi_balance' || conf === 'manual_or_local_estimate'))
        || (kind === 'minimax' && (src === 'minimax_balance' || src === 'minimax_manual' || conf === 'manual_or_local_estimate'));
      if (balanceOnly) {
        var balMsg = String(usage.message || '').trim();
        if (balMsg) bits.push(balMsg.split(' · ')[0]);
      }
      if (!bits.length) {
        windows.slice(0, 2).forEach(function (w) {
          var lab = windowQuotaLabel(w);
          if (lab) bits.push(lab);
        });
      }
      if (!bits.length) {
        if (kind === 'claude') {
          var sess = usageVal(usage, 'sessionTokens', 'session_tokens');
          var aux = usageVal(usage, 'auxiliaryTokens', 'auxiliary_tokens');
          var cost = usageVal(usage, 'estimatedCostUsd', 'estimated_cost_usd');
          if (sess != null) bits.push('本会话消耗 ' + Math.round(Number(sess)));
          if (aux != null) bits.push('子任务 ' + Math.round(Number(aux)));
          if (cost != null) {
            var c = Number(cost);
            bits.push('估算 $' + (isFinite(c) ? (Math.round(c * 1e4) / 1e4) : cost));
          }
          if (!bits.length) bits.push(conf === 'manual_or_local_estimate' ? '官方剩余请到控制台' : '用量 --');
        } else {
          // codex + minimax: remainingPercent; never invent Claude OTel session burn for MiniMax
          var remaining = usageVal(usage, 'remainingPercent', 'remaining_percent');
          if (remaining != null) bits.push('窗口余 ' + Math.round(Number(remaining)) + '%');
          if (kind === 'minimax' && !bits.length) {
            bits.push(t('softPadMinimaxOfficialUsage', '官方剩余请到控制台'));
          }
        }
      }
      var locT = usageVal(usage, 'localTodayTokens', 'local_today_tokens');
      var locM = usageVal(usage, 'localMonthTokens', 'local_month_tokens');
      if (locT != null && Number(locT) > 0) bits.push('本机今日 ' + Math.round(Number(locT)));
      else if (locM != null && Number(locM) > 0) bits.push('本机本月 ' + Math.round(Number(locM)));
    } else if (isShellUsageKind(kind)) {
      // Official windows / Credits caption / explicit manual — never invent %.
      var shellMsg = String(usage.message || '').trim();
      if (conf === 'manual_or_local_estimate') {
        if (shellMsg) bits.push(shellMsg.split(' · ')[0]);
        else bits.push('官方剩余请到控制台');
      } else {
        windows.slice(0, 2).forEach(function (w) {
          var lab = windowQuotaLabel(w);
          if (lab) bits.push(lab);
        });
        if (!bits.length && shellMsg) bits.push(shellMsg.split(' · ')[0]);
        if (!bits.length) {
          var remShell = usageVal(usage, 'remainingPercent', 'remaining_percent');
          if (remShell != null) bits.push('窗口余 ' + Math.round(Number(remShell)) + '%');
        }
      }
      var shellLocT = usageVal(usage, 'localTodayTokens', 'local_today_tokens');
      if (shellLocT != null && Number(shellLocT) > 0) {
        // Local burn only — never presented as remaining quota.
        bits.push('今日消耗 ' + Math.round(Number(shellLocT)) + ' tok');
      }
      if (!bits.length && status !== 'ready') bits.push('—');
    } else if (kind === 'cursor') {
      var turns = usageVal(usage, 'localTodayRequests', 'local_today_requests');
      var sess = usageVal(usage, 'localTodaySessions', 'local_today_sessions');
      var activeMs = usageVal(usage, 'localTodayActiveMs', 'local_today_active_ms');
      var yest = usageVal(usage, 'localYesterdayRequests', 'local_yesterday_requests');
      var src = String(usage.source || '');
      if (status === 'ready' && turns != null && (src === 'cursor_local_activity' || conf === 'local_only')) {
        // Hierarchy: turns → intensity → day delta (disclaimer lives in boundary hint).
        bits.push('今日 ' + Math.round(Number(turns)) + ' 次对话');
        var intensity = [];
        if (sess != null) intensity.push(Math.round(Number(sess)) + ' 个会话');
        if (activeMs != null && Number(activeMs) > 0) {
          intensity.push('活跃 ' + formatActiveDuration(Number(activeMs)));
        }
        if (intensity.length) bits.push(intensity.join(' · '));
        if (yest != null && Number(yest) > 0) {
          var delta = Math.round(((Number(turns) - Number(yest)) / Number(yest)) * 100);
          var arrow = delta > 0 ? '↑' : (delta < 0 ? '↓' : '');
          bits.push('较昨日对话 ' + arrow + Math.abs(delta) + '%');
        }
      } else {
        var cmsg = String(usage.message || '').trim();
        bits.push(cmsg || '未启用 Cursor 活动统计');
      }
    }
    return {
      account: String(usageVal(usage, 'accountLabel', 'account_label') || '').trim(),
      plan: String(usageVal(usage, 'planType', 'plan_type') || '').trim(),
      usageSummary: bits.length ? bits.join(kind === 'cursor' ? ' · ' : ' / ') : (status === 'ready' ? '--' : '—'),
      resetCountdown: formatResetCountdown(primaryResetAt(usage)) || '—',
      usageState: status,
      confidence: conf || '',
      sourceLabel: usageSourceLabel(kind, usage),
      consoleUrl: String(usageVal(usage, 'consoleUrl', 'console_url') || '').trim(),
      codingPlanWarning: !!(usage.codingPlanWarning || usage.coding_plan_warning)
    };
  }

  function formatActiveDuration(ms) {
    var totalMin = Math.max(0, Math.round(Number(ms) / 60000));
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h > 0) return h + '小时' + m + '分';
    return m + '分';
  }

  function pickUsageAgentRow(snap, preferredKind) {
    var rows = snap && Array.isArray(snap.agents) ? snap.agents : [];
    var want = String(preferredKind || selectedScopeId || 'codex').trim();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i] && rows[i].kind || '') === want) return rows[i];
    }
    return rows[0] || null;
  }

  function isSoftPadPageVisible() {
    try {
      var st = global.OneToneState && global.OneToneState.state;
      var ui = st && st.ui;
      if (ui) {
        if (!ui.drawerOpen) return false;
        var panel = String(ui.settingsPanel || '');
        if (panel !== 'softPad') return false;
      }
    } catch (_) {}
    var panelEl = document.getElementById('settingsPanelSoftPad');
    return !!(panelEl && !panelEl.hidden);
  }

  function refreshOverlayUsageAsync(opts) {
    opts = opts || {};
    if (!isSoftPadPageVisible()) return Promise.resolve(overlayUsageCache.snap);
    if (overlayUsageInFlight) return Promise.resolve(overlayUsageCache.snap);
    overlayUsageInFlight = true;
    return hubInvoke('cmd_codex_micro_overlay_get_state', {})
      .then(function (snap) {
        overlayUsageCache.snap = snap || null;
        overlayUsageCache.at = Date.now();
        if (!opts.silent && isSoftPadPageVisible()) {
          // Defer status sync so we never fight Soft Pad remount / paint on the same turn.
          setTimeout(function () {
            if (!isSoftPadPageVisible()) return;
            updateStatusBar(findEntry(getSelectedMappingId()));
          }, 0);
        }
        return snap;
      })
      .catch(function () {
        return null;
      })
      .then(function (snap) {
        overlayUsageInFlight = false;
        return snap;
      });
  }

  function stopOverlayUsagePolling() {
    if (overlayUsageTimer) {
      clearInterval(overlayUsageTimer);
      overlayUsageTimer = 0;
    }
    overlayUsageDeferToken += 1;
  }

  function ensureOverlayUsagePolling() {
    if (overlayUsageTimer) return;
    overlayUsageTimer = setInterval(function () {
      if (!isSoftPadPageVisible()) return;
      refreshOverlayUsageAsync({ silent: false });
    }, OVERLAY_USAGE_POLL_MS);
  }

  /** Never call get_state on the Soft Pad open/remount turn — defer like settings-drawer. */
  function requestOverlayUsageForScope(scopeId) {
    var kind = String(scopeId || selectedScopeId || '');
    if (kind !== 'codex' && kind !== 'claude' && kind !== 'cursor' && kind !== 'minimax') return;
    if (!isSoftPadPageVisible()) return;
    ensureOverlayUsagePolling();
    // Scope switch: reuse cache immediately, then one deferred refresh.
    updateStatusBar(findEntry(getSelectedMappingId()));
    var token = ++overlayUsageDeferToken;
    requestAnimationFrame(function () {
      setTimeout(function () {
        if (token !== overlayUsageDeferToken) return;
        if (!isSoftPadPageVisible()) return;
        refreshOverlayUsageAsync({ silent: false });
      }, 120);
    });
  }

  function findEntry(mappingId) {
    var entries = listSoftPadSchemes();
    var id = String(mappingId || '');
    for (var i = 0; i < entries.length; i++) {
      if (String(entries[i].mapping.id) === id) return entries[i];
    }
    return null;
  }

  /**
   * Soft Pad page must not trust habit-editor selectedMappingId (often「通用设置」).
   * Prefer current Soft Pad scheme → current app scope → default Soft Pad entry.
   */
  function resolveSoftPadEntry() {
    var byId = findEntry(getSelectedMappingId());
    if (hasMapping(byId)) return byId;
    var scope = findScope(selectedScopeId || 'codex');
    if (scope && hasMapping(scope.entry)) return scope.entry;
    // Current app chip still needs「准备」— don't steal another app's pad for preview.
    if (scope && scope.canPrepare) return scope.entry || null;
    var entries = listSoftPadSchemes();
    if (!entries.length) return null;
    return pickDefaultEntry(entries) || entries[0] || null;
  }

  function adoptSoftPadSelection(entry) {
    if (!hasMapping(entry)) return null;
    ensureSoftPadConfig(entry, { persist: false });
    setSelectedMappingId(String(entry.mapping.id));
    if (entry.kind) selectedScopeId = entry.kind;
    return entry;
  }

  function hostsNeedPaint(entry) {
    var host = previewHostForFace();
    if (!host || host.childElementCount === 0) return true;
    if (!paintedMappingId) return true;
    if (entry && entry.mapping && String(paintedMappingId) !== String(entry.mapping.id)) return true;
    return false;
  }

  function displayTitle(entry) {
    if (!entry) return '—';
    if (entry.mapping && global.OneToneHabitProfile && global.OneToneHabitProfile.habitDisplayName) {
      var hn = global.OneToneHabitProfile.habitDisplayName(entry.mapping);
      if (hn && hn !== '—') return hn;
    }
    return entry.title;
  }

  function displayKind(entry) {
    return entry ? kindLabel(entry.kind) : '—';
  }

  function hasMapping(entry) {
    return !!(entry && entry.mapping && entry.mapping.id);
  }

  function hasSoftPadConfig(entry) {
    return !!(hasMapping(entry) && entry.mapping.codexMicroPad);
  }

  function applyRuntimeFlagsToEntry(entry) {
    if (!entry) return entry;
    var flags = softPadRuntimeFlags(entry.mapping);
    entry.mappingEnabled = flags.mappingEnabled;
    entry.padConfigured = flags.padConfigured;
    entry.padSwitchOn = flags.padSwitchOn;
    entry.padEnabled = flags.padEnabled;
    entry.canEnable = flags.mappingEnabled && flags.padConfigured && !flags.padSwitchOn;
    entry.canPrepare = !flags.padConfigured;
    return entry;
  }

  function ensureSoftPadConfig(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) return false;
    if (entry.mapping.codexMicroPad) return true;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!Pad || typeof Pad.ensurePad !== 'function') return false;
    try {
      Pad.ensurePad(entry.mapping, { persist: opts.persist !== false });
      applyRuntimeFlagsToEntry(entry);
      entry.presentation = entry.mapping.codexMicroPad && entry.mapping.codexMicroPad.presentation === 'mini'
        ? 'mini'
        : 'full';
      return !!entry.mapping.codexMicroPad;
    } catch (_) {
      return false;
    }
  }

  function countPadKeys(entry) {
    try {
      var keys = entry && entry.mapping && entry.mapping.codexMicroPad && entry.mapping.codexMicroPad.keys;
      return Array.isArray(keys) ? keys.length : 0;
    } catch (_) {
      return 0;
    }
  }

  // Merge usage summary/reset info into status props for the hub tiles.
  function mergeUsageIntoStatusProps(props, preferredKind) {
    try {
      var kind = String(preferredKind || props && props.kind || selectedScopeId || '')
        .trim();
      if (!kind) return props;
      if (
        kind !== 'codex' &&
        kind !== 'claude' &&
        kind !== 'cursor' &&
        kind !== 'minimax' &&
        kind !== 'workbuddy' &&
        kind !== 'trae' &&
        kind !== 'traeCode' &&
        String(kind || '').toLowerCase() !== 'traecode' &&
        kind !== 'qoder'
      ) {
        return props;
      }

      var snap = overlayUsageCache && overlayUsageCache.snap ? overlayUsageCache.snap : null;
      var row = pickUsageAgentRow(snap, kind);
      if (!row) return props;

      var usage = row.usage || row.usageStats || row.usage_stats || {};
      var usageProps = usagePropsFromAgent(kind, usage);
      return Object.assign({}, props, {
        account: usageProps.account,
        plan: usageProps.plan,
        usageSummary: usageProps.usageSummary,
        resetCountdown: usageProps.resetCountdown,
        usageState: usageProps.usageState,
        confidence: usageProps.confidence,
        consoleUrl: usageProps.consoleUrl,
        codingPlanWarning: usageProps.codingPlanWarning
      });
    } catch (_) {
      return props;
    }
  }

  function buildHeroMeta(entry) {
    var scope = selectedScopeId || (entry && entry.kind) || 'codex';
    var agentName = appTitleFor(scope);
    var agent = agentName;
    var n = countPadKeys(entry);
    var keys = n > 0
      ? t('softPadCockpitPadKeys', '{n} 个').replace('{n}', String(n))
      : t('softPadCockpitPadKeysEmpty', '未准备');
    var tm = global.OneToneSoftPadTimeMachine;
    var restorePoint =
      (tm && typeof tm.heroLabel === 'function' && tm.heroLabel()) ||
      t('softPadCockpitTmSoon', '即将接入');
    return {
      agent: agent,
      keys: keys,
      restorePoint: restorePoint,
      presentation: entry ? presentationLabel(entry.presentation) : '—',
      kind: entry ? displayKind(entry) : '—'
    };
  }

  function buildBindAppProps() {
    var scopes = listAppScopes();
    var active = String(selectedScopeId || 'codex');
    return {
      activeScope: active,
      bindLabel: t('softPadBindAppLbl', '绑定 · {app}').replace('{app}', appTitleFor(active)),
      scopes: scopes.map(function (scope) {
        return {
          id: scope.id,
          title: scope.title,
          active: scope.id === active,
          padEnabled: !!scope.padEnabled,
          canPrepare: !!scope.canPrepare
        };
      })
    };
  }

  function buildStatusProps(entry) {
    var bind = buildBindAppProps();
    if (!entry) {
      return mergeUsageIntoStatusProps({
        name: '—',
        status: '—',
        statusCls: '',
        presentation: '—',
        kind: '—',
        agent: '—',
        keys: '—',
        restorePoint: '—',
        account: '',
        plan: '',
        usageSummary: '—',
        resetCountdown: '—',
        usageState: 'unavailable',
        padEnabled: false,
        hasMapping: false,
        activeScope: bind.activeScope,
        bindLabel: bind.bindLabel,
        scopes: bind.scopes
      }, selectedScopeId);
    }
    var hero = buildHeroMeta(entry);
    return mergeUsageIntoStatusProps({
      name: displayTitle(entry),
      status: statusLabel(entry),
      statusCls: statusTag(entry).cls,
      presentation: hero.presentation,
      kind: hero.kind,
      agent: hero.agent,
      keys: hero.keys,
      restorePoint: hero.restorePoint,
      account: '',
      plan: '',
      usageSummary: '—',
      resetCountdown: '—',
      usageState: 'unavailable',
      padEnabled: !!entry.padEnabled,
      hasMapping: hasMapping(entry),
      activeScope: bind.activeScope,
      bindLabel: bind.bindLabel,
      scopes: bind.scopes
    }, entry.kind || selectedScopeId);
  }

  function updateStatusBar(entry) {
    // P10: React island owns this DOM when mounted — push state and skip legacy DOM writes.
    if (global.__otSoftPadStatusMounted) {
      if (global.__otSoftPadStatusSync) global.__otSoftPadStatusSync(buildStatusProps(entry));
      updateSoftPadFlowHints(entry);
      syncSoftPadFlowNodes(entry);
      syncSoftPadPadRing(entry);
      return;
    }
    var e = els();
    var props = buildStatusProps(entry);
    if (e.name) e.name.textContent = props.name;
    if (e.status) {
      e.status.textContent = props.status;
      e.status.className = ['keys-scheme-summary-pill', props.statusCls].filter(Boolean).join(' ');
    }
    if (e.agent) e.agent.textContent = props.agent;
    if (e.accountMeta) {
      var acc = String(props.account || '').trim();
      var plan = String(props.plan || '').trim();
      e.accountMeta.textContent = acc && plan ? acc + ' · ' + plan : (acc || plan || '—');
    }
    if (e.usageMeta) e.usageMeta.textContent = props.usageSummary || '—';
    if (e.keysMeta) e.keysMeta.textContent = props.keys;
    if (e.tm) e.tm.textContent = props.restorePoint || '—';
    if (e.resetMeta) e.resetMeta.textContent = props.resetCountdown || '—';
    var mmScope = String(selectedScopeId || '') === 'minimax';
    if (e.usageMeta) {
      if (e.usageMeta.style) e.usageMeta.style.cursor = mmScope ? 'pointer' : '';
      e.usageMeta.title = mmScope
        ? t('softPadMinimaxUsageClick', '点击填写 Coding Plan Key，或查看套餐')
        : '';
    }
    if (e.resetMeta && e.resetMeta.style) {
      e.resetMeta.style.cursor = mmScope ? 'pointer' : '';
    }
    if (e.enable) {
      e.enable.disabled = !props.hasMapping;
      e.enable.classList.toggle('is-on', !!props.padEnabled);
      e.enable.setAttribute('aria-checked', props.padEnabled ? 'true' : 'false');
    }
    var testBtn = document.getElementById('btnSoftPadTestFg');
    var editBtn = document.getElementById('btnSoftPadEditKeys');
    if (testBtn) testBtn.disabled = !props.hasMapping;
    if (editBtn) editBtn.disabled = !props.hasMapping;
    syncBindAppControl(props);
    updateSoftPadFlowHints(entry);
    syncSoftPadPadRing(entry);
  }

  function syncBindAppControl(props) {
    var e = els();
    if (!e.bindAppLbl && !e.bindAppBtn) return;
    props = props || buildBindAppProps();
    if (e.bindAppLbl) e.bindAppLbl.textContent = props.bindLabel || t('softPadBindAppLbl', '绑定 · {app}').replace('{app}', '—');
    if (e.bindAppMenu && !e.bindAppMenu.hidden) {
      renderBindAppMenu(props);
    }
  }

  function renderBindAppMenu(props) {
    var e = els();
    if (!e.bindAppMenu) return;
    props = props || buildBindAppProps();
    var scopes = props.scopes || [];
    e.bindAppMenu.innerHTML = scopes.map(function (scope) {
      return (
        '<button type="button" class="soft-pad-bind-app__opt' +
        (scope.active ? ' is-active' : '') +
        '" role="option" data-scope="' + esc(scope.id) + '"' +
        ' aria-selected="' + (scope.active ? 'true' : 'false') + '">' +
        esc(scope.title) +
        '</button>'
      );
    }).join('');
  }

  function setBindAppMenuOpen(open) {
    var e = els();
    if (!e.bindAppMenu || !e.bindAppBtn) return;
    e.bindAppMenu.hidden = !open;
    e.bindAppBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) renderBindAppMenu();
  }

  function handleStatusAction(action) {
    var entry = findEntry(getSelectedMappingId());
    if (action === 'test-fg') {
      var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
      var done = function () {
        updateStatusBar(findEntry(getSelectedMappingId()) || entry);
        var lane = resolvePrimaryLaneResult(listSoftPadSchemes(), laneContextFromRuntime());
        var name = lane && lane.entry ? displayKind(lane.entry) : appTitleFor(selectedScopeId || 'codex');
        toastPad(formatDisplayLaneReason(lane && lane.reason, name));
      };
      if (!invoke) {
        refreshSoftPadRuntimeAsync();
        done();
        return;
      }
      Promise.resolve(invoke('cmd_soft_pad_runtime_snapshot'))
        .then(function (snap) {
          ingestSoftPadRuntimeSnapshot(snap);
          try {
            if (global.__otSoftPadWorkflowSync) global.__otSoftPadWorkflowSync();
          } catch (_) {}
          updateScopeHint();
          done();
        })
        .catch(function () {
          toastPad(t('softPadCockpitTestFgFail', '前台检测失败，请重试'));
        });
      return;
    }
    if (action === 'edit-keys') {
      setSoftPadFace('pad', { fromUser: true });
      setSoftPadPadMode('keys', { fromUser: true });
      return;
    }
    if (action === 'preview-pad') {
      if (entry) schedulePreviewPaint(entry);
      var preview = previewHostForFace('pad');
      if (preview && preview.scrollIntoView) {
        try { preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
      }
      return;
    }
    if (action === 'open-tray') {
      setSoftPadFace('tray');
      return;
    }
    if (action === 'open-timeline') {
      return;
    }
    if (action === 'take-snapshot') {
      var tmSnap = global.OneToneSoftPadTimeMachine;
      if (tmSnap && tmSnap.takeSnapshot) {
        Promise.resolve(tmSnap.takeSnapshot()).then(function () {
          updateStatusBar(entry);
        });
        return;
      }
      toastPad(t('softPadCockpitTimeMachineSoon', '项目时间胶囊即将接入，恢复前会先保存当前项目'));
    }
  }

  function buildSoftPadScopeHintModel() {
    var entry = findEntry(getSelectedMappingId()) || pickUniversalEntry() || resolveSoftPadEntry();
    var scopeKind = (entry && entry.kind) || selectedScopeId || 'codex';
    if (scopeKind === SOFT_PAD_UNIVERSAL_KIND) {
      var universalText = t(
        'softPadHintGlobal',
        '未匹配 Agent 时显示迷你条；实体键保持原样。匹配到应用后使用对应键位。'
      );
      return {
        text: universalText,
        supportRange: '',
        followMode: 'auto',
        userLaneId: null,
        sig: universalText + '|universal'
      };
    }
    var app = appTitleFor(scopeKind);
    var scenario = '';
    if (entry && entry.mapping) scenario = displayTitle(entry);
    var inv = hubInventoryByKind[String(scopeKind || '')] || null;
    var statusBit = '';
    if (inv && inv.lightEnabled) {
      statusBit = t('softPadHintStatusLightOn', '状态灯已开');
    } else if (entry && entry.padEnabled && String(scopeKind || '') === 'minimax') {
      statusBit = t('softPadHintMinimaxPadOn', 'Soft Pad 已开 · 顶栏应显示 MiniMax');
    } else if (inv && inv.confidence === 'high') {
      statusBit = t('softPadHintInstalled', '本机已安装 · 待接入状态');
    }
    var text;
    if (statusBit) {
      text = t('softPadHintCurrentTool', '当前工具：{app} · {status}')
        .replace('{app}', app)
        .replace('{status}', statusBit);
    } else if (scenario && scenario !== '—' && scenario !== app) {
      text = t('softPadHintAppBound', '当前编辑 · {app} · 绑定「{scenario}」：该应用前台时的键位和状态灯')
        .replace('{app}', app)
        .replace('{scenario}', scenario);
    } else {
      text = t('softPadHintApp', '当前编辑 · {app}：该应用前台时的键位和状态灯')
        .replace('{app}', app);
    }
    var support = t(
      'softPadHubSupportRange',
      '支持 Codex、Claude、Cursor、MiniMax，以及 WorkBuddy / Trae Work / Trae Code / Qoder（状态连接 · Shortcuts）'
    );
    return {
      text: text,
      supportRange: support,
      followMode: 'auto',
      userLaneId: null,
      sig: String(text || '') + '|auto'
    };
  }

  function applyInventoryCache(inv) {
    hubInventoryCache = inv || null;
    hubInventoryByKind = {};
    ((inv && inv.agents) || []).forEach(function (a) {
      if (a && a.kind) hubInventoryByKind[a.kind] = a;
    });
  }

  function scheduleAutoHubScan() {
    if (!isSoftPadPageVisible()) {
      refreshHubInventory._autoScanDone = false;
      return;
    }
    if (refreshHubInventory._autoScanDone || refreshHubInventory._autoScanPending) return;
    refreshHubInventory._autoScanPending = true;
    clearTimeout(refreshHubInventory._autoT);
    refreshHubInventory._autoT = setTimeout(function () {
      refreshHubInventory._autoScanPending = false;
      if (!isSoftPadPageVisible()) return;
      refreshHubInventory._autoScanDone = true;
      try {
        refreshHubInventory({ silent: true, render: false });
      } catch (_) {}
    }, 2500);
  }

  function refreshHubInventory(opts) {
    opts = opts || {};
    if (refreshHubInventory._inFlight) return refreshHubInventory._inFlight;
    var AI = global.OneToneAgentInstall;
    var statusEl = document.getElementById('softPadScanStatus');
    var silent = !!opts.silent;
    if (!AI || !AI.fetchInventory) {
      if (!silent && statusEl) statusEl.textContent = t('softPadScanUnavailable', '扫描不可用');
      return Promise.resolve(null);
    }
    if (!silent && statusEl) statusEl.textContent = t('softPadScanning', '扫描中…');
    refreshHubInventory._inFlight = AI.fetchInventory().then(function (inv) {
      applyInventoryCache(inv);
      if (!silent && statusEl) {
        var n = inv && inv.highConfidenceCount || 0;
        statusEl.textContent = n
          ? t('softPadScanFound', '检测到 {n} 个工具').replace('{n}', String(n))
          : t('softPadScanNone', '未高置信检测到工具');
      }
      // Idle seed after Soft Pad opens — never on app boot (inventory EnumWindows 假死).
      var seedP = Promise.resolve();
      if (AI.maybeAutoSeedAfterInventory && !refreshHubInventory._seededOnce) {
        refreshHubInventory._seededOnce = true;
        seedP = AI.maybeAutoSeedAfterInventory(inv).catch(function () { return null; });
      }
      return seedP.then(function () {
        if (opts.prepareHigh) {
          var kinds = AI.defaultSelectedKinds(inv);
          if (kinds.length) {
            return AI.prepareKinds(kinds, { enableNumpad: false }).then(function () {
              if (opts.render !== false) render({});
              return inv;
            });
          }
        }
        if (opts.render !== false) render({});
        return inv;
      });
    }).catch(function () {
      if (!silent && statusEl) statusEl.textContent = t('softPadScanFail', '扫描失败');
      return null;
    }).then(function (res) {
      refreshHubInventory._inFlight = null;
      return res;
    });
    return refreshHubInventory._inFlight;
  }

  function updateScopeHint() {
    var e = els();
    if (!e.hint) return;
    if (softPadFace === 'tray') {
      e.hint.textContent = '';
      e.hint.hidden = true;
      updateStatusBar(findEntry(getSelectedMappingId()));
      return;
    }
    if (global.__otSoftPadScopeHintMounted && typeof global.__otSoftPadScopeHintSync === 'function') {
      global.__otSoftPadScopeHintSync();
      var liveText = String(e.hint.textContent || '').trim();
      e.hint.hidden = !liveText;
      updateStatusBar(findEntry(getSelectedMappingId()));
      return;
    }
    var model = buildSoftPadScopeHintModel();
    var text = String(model.text || '').trim();
    e.hint.textContent = text;
    e.hint.hidden = !text;
    updateStatusBar(findEntry(getSelectedMappingId()));
  }

  function clearSubpage() {
    ++subpageToken;
    ++agentLoadToken;
    // P14k–n：清深面板挂载标记（岛 epoch 由 subpageToken 管）。
    try {
      global.__otSoftPadRuntimeMounted = false;
      global.__otSoftPadPresentationMounted = false;
      global.__otSoftPadLayoutShellMounted = false;
    } catch (_) {}
    try {
      var PadClose = global.OneToneCodexMicroPadUi;
      if (PadClose && PadClose.closeEditKeycap) PadClose.closeEditKeycap({ reopenInline: false });
    } catch (_) {}
    var e = els();
    if (e.subBody) {
      if (global.__otSoftPadSubpageMounted && typeof global.__otSoftPadSubpageSync === 'function') {
        e.subBody.classList.remove('is-editing-key');
        e.subBody.removeAttribute('data-soft-pad-mapping');
        e.subBody.removeAttribute('data-soft-pad-panel');
        e.subBody.removeAttribute('data-agent-load-token');
      } else {
        e.subBody.replaceChildren();
        e.subBody.classList.remove('is-editing-key');
        e.subBody.removeAttribute('data-soft-pad-mapping');
        e.subBody.removeAttribute('data-soft-pad-panel');
        e.subBody.removeAttribute('data-agent-load-token');
      }
    }
    if (e.detailPanel) e.detailPanel.hidden = true;
    detailIdleOpen = false;
    if (e.detailIdle) {
      if (!(global.__otSoftPadEmptyIdleMounted && typeof global.__otSoftPadEmptyIdleSync === 'function')) {
        e.detailIdle.hidden = false;
      }
    }
    if (e.subHost) {
      e.subHost.classList.remove('is-open');
      e.subHost.removeAttribute('hidden');
    }
    if (e.subTitle) {
      if (!(global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function')) {
        e.subTitle.textContent = '';
      }
    }
    if (global.__otSoftPadEmptyIdleMounted && typeof global.__otSoftPadEmptyIdleSync === 'function') {
      global.__otSoftPadEmptyIdleSync();
    }
    if (global.__otSoftPadSubpageMounted && typeof global.__otSoftPadSubpageSync === 'function') {
      global.__otSoftPadSubpageSync();
    }
    if (global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function') {
      global.__otSoftPadDetailChromeSync();
    }
    // clear 语义优先：即使 sync 时 view 尚未回到 hub，也强制收起详情壳。
    if (e.detailPanel) e.detailPanel.hidden = true;
    if (e.subHost) e.subHost.classList.remove('is-open');
    if (e.stage) e.stage.classList.remove('is-detail-open');
  }

  // P14d：空态 / 详情 idle 表面（岛挂载后由 buildSoftPadEmptyIdleModel 驱动）
  var emptySurfaceMode = 'none'; // none | empty | prepare
  var emptyPrepareCtx = null; // { appId, kind, title }
  var detailIdleOpen = false; // true → 详情开，idle 隐藏

  function setDetailOpen(open) {
    var e = els();
    open = !!open;
    detailIdleOpen = open;
    // Always write shell attrs. Island sync can lag (React paint-target not ready) or
    // re-apply a stale hub model and leave idle tip covering an empty detail.
    if (e.detailPanel) e.detailPanel.hidden = !open;
    if (e.detailIdle) e.detailIdle.hidden = open;
    if (e.subHost) {
      e.subHost.classList.toggle('is-open', open);
      e.subHost.removeAttribute('hidden');
    }
    if (e.stage) e.stage.classList.toggle('is-detail-open', open);
    if (global.__otSoftPadEmptyIdleMounted && typeof global.__otSoftPadEmptyIdleSync === 'function') {
      global.__otSoftPadEmptyIdleSync();
    }
    if (global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function') {
      global.__otSoftPadDetailChromeSync();
    }
  }

  function patchActiveTiles() {
    var e = els();
    if (!e.tiles) return;
    if (global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function') {
      global.__otSoftPadFuncTilesSync();
      return;
    }
    var panel = softPadPanelId();
    e.tiles.querySelectorAll('[data-tile]').forEach(function (btn) {
      var on = softPadFace === 'pad' && btn.getAttribute('data-tile') === panel;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function clearMain() {
    var e = els();
    var host = previewHostForFace();
    if (host) {
      if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
        paintedMappingId = null;
        previewForceOnce = true;
      } else {
        host.replaceChildren();
      }
    }
    if (e.tiles) {
      if (!(global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function')) {
        e.tiles.innerHTML = '';
      }
    }
    resetSoftPadRouteToPadAppear();
    clearSubpage();
    paintedMappingId = null;
    if (global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function') {
      global.__otSoftPadFuncTilesSync();
    }
    if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
      try {
        global.__otSoftPadPreviewSync();
      } finally {
        previewForceOnce = false;
      }
    }
  }

  function onPanelLeave() {
    ++softPadOpenGen;
    ++selectToken;
    ++agentLoadToken;
    stopOverlayUsagePolling();
    clearMain();
  }

  function emptyCreateCtaHtml() {
    return '<p class="soft-pad-empty__title">' + esc(t('softPadEmptyTitle', '还没有可配置的应用场景')) + '</p>' +
      '<p class="soft-pad-empty__desc">' +
      esc(t('softPadBoundaryHint', '虚拟键盘只绑定 Agent 应用场景（Codex / Claude / Cursor / MiniMax / WorkBuddy / Trae Work / Trae Code / Qoder）。先创建应用场景，再配置虚拟键盘。')) +
      '</p>' +
      '<div class="soft-pad-empty__actions">' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-soft-pad-create-kind="codex">' +
      esc(t('softPadEmptyCreateCodex', '创建 Codex 应用场景')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-soft-pad-create-kind="claude">' +
      esc(t('softPadEmptyCreateClaude', '创建 Claude 应用场景')) + '</button>' +
      '</div>';
  }

  function bindEmptyCreateCtas(host) {
    if (!host) return;
    host.querySelectorAll('[data-soft-pad-create-kind]').forEach(function (btn) {
      if (btn.dataset.softPadCreateBound === '1') return;
      btn.dataset.softPadCreateBound = '1';
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-soft-pad-create-kind') || 'codex';
        prepareAppFromUi(appIdForKind(kind) || (kind === 'claude' ? 'claude-code' : 'codex-chat'), kind);
      });
    });
  }

  function prepareEmptyHtml(ctx) {
    ctx = ctx || {};
    var prepareAppId = ctx.appId || 'codex-chat';
    var prepareKind = ctx.kind || 'codex';
    var title = ctx.title || t('softPadHubPrepareApp', '准备 {app} Soft Pad')
      .replace('{app}', appTitleFor(prepareKind));
    return '<p class="soft-pad-empty__title">' + esc(title) + '</p>' +
      '<p class="soft-pad-empty__desc">' +
      esc(t('softPadHubPrepareHint', '点击准备后才会创建该应用的虚拟键盘配置。')) +
      '</p>' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-soft-pad-prepare-cta="' +
      esc(prepareAppId) + '" data-scheme-kind="' + esc(prepareKind) + '">' +
      esc(t('softPadHubPrepareShort', '准备')) + '</button>';
  }

  function bindPrepareCta(host) {
    if (!host) return;
    var btn = host.querySelector('[data-soft-pad-prepare-cta]');
    if (!btn) return;
    if (btn.dataset.softPadPrepareBound === '1') return;
    btn.dataset.softPadPrepareBound = '1';
    btn.addEventListener('click', function () {
      prepareAppFromUi(
        btn.getAttribute('data-soft-pad-prepare-cta'),
        btn.getAttribute('data-scheme-kind')
      );
    });
  }

  /** P14d：空态 + 详情 idle 双宿主模型（单一来源）。 */
  function buildSoftPadEmptyIdleModel() {
    var idleTitle = t('softPadDetailIdleTitle', '点左侧一项开始调整');
    var idleSub = t('softPadDetailIdleSub', '右侧打开详情；左侧键盘与列表保持不动');
    var idleHidden = !!detailIdleOpen;
    var mode = emptySurfaceMode === 'empty' || emptySurfaceMode === 'prepare'
      ? emptySurfaceMode
      : 'none';
    var prepareAppId = '';
    var prepareKind = '';
    var prepareTitle = '';
    var emptyHtml = '';
    var emptyHidden = true;
    var emptyTitle = '';
    var emptyDesc = '';
    var createCodexLabel = t('softPadEmptyCreateCodex', '创建 Codex 应用场景');
    var createClaudeLabel = t('softPadEmptyCreateClaude', '创建 Claude 应用场景');
    var prepareHint = t('softPadHubPrepareHint', '点击准备后才会创建该应用的虚拟键盘配置。');
    var prepareBtnLabel = t('softPadHubPrepareShort', '准备');

    if (mode === 'empty') {
      emptyHidden = false;
      emptyTitle = t('softPadEmptyTitle', '还没有可配置的应用场景');
      emptyDesc = t('softPadBoundaryHint', '虚拟键盘只绑定 Agent 应用场景（Codex / Claude / Cursor / MiniMax / WorkBuddy / Trae Work / Trae Code / Qoder）。先创建应用场景，再配置虚拟键盘。');
      emptyHtml = emptyCreateCtaHtml();
    } else if (mode === 'prepare') {
      emptyHidden = false;
      prepareAppId = (emptyPrepareCtx && emptyPrepareCtx.appId) || 'codex-chat';
      prepareKind = (emptyPrepareCtx && emptyPrepareCtx.kind) || 'codex';
      prepareTitle = (emptyPrepareCtx && emptyPrepareCtx.title) ||
        t('softPadHubPrepareApp', '准备 {app} Soft Pad').replace('{app}', appTitleFor(prepareKind));
      emptyTitle = prepareTitle;
      emptyDesc = prepareHint;
      emptyHtml = prepareEmptyHtml({
        appId: prepareAppId,
        kind: prepareKind,
        title: prepareTitle
      });
    }

    // #3c：有 mapping 且详情未开时，idle 指向默认落点面板。
    if (mode === 'none' && !idleHidden) {
      var idleEntry = resolveSoftPadEntry();
      if (hasMapping(idleEntry)) {
        var landingId = defaultDetailView();
        idleTitle = t('softPadLandingHint', '建议从「{panel}」开始')
          .replace('{panel}', subpageTitle(landingId));
        idleSub = t('softPadDetailIdleSub', '右侧打开详情；左侧键盘与列表保持不动');
      }
    }

    return {
      mode: mode,
      emptyHtml: emptyHtml,
      emptyHidden: emptyHidden,
      emptyTitle: emptyTitle,
      emptyDesc: emptyDesc,
      createCodexLabel: createCodexLabel,
      createClaudeLabel: createClaudeLabel,
      prepareAppId: prepareAppId,
      prepareKind: prepareKind,
      prepareTitle: prepareTitle,
      prepareHint: prepareHint,
      prepareBtnLabel: prepareBtnLabel,
      idleTitle: idleTitle,
      idleSub: idleSub,
      idleHidden: idleHidden,
      sig: [
        mode,
        emptyHidden ? '1' : '0',
        idleHidden ? '1' : '0',
        emptyHtml,
        idleTitle,
        idleSub,
        prepareAppId,
        prepareKind
      ].join('\0')
    };
  }

  function applySoftPadEmptyIdleHost(model) {
    var e = els();
    if (global.__otSoftPadEmptyIdleMounted && typeof global.__otSoftPadEmptyIdleSync === 'function') {
      global.__otSoftPadEmptyIdleSync();
      return;
    }
    if (!model) model = buildSoftPadEmptyIdleModel();
    if (e.empty) {
      e.empty.hidden = !!model.emptyHidden;
      e.empty.innerHTML = model.emptyHtml || '';
      if (model.mode === 'empty') bindEmptyCreateCtas(e.empty);
      else if (model.mode === 'prepare') bindPrepareCta(e.empty);
    }
    if (e.detailIdle) {
      e.detailIdle.hidden = !!model.idleHidden;
      var idleTitleEl = e.detailIdle.querySelector('.soft-pad-detail-idle__title');
      var idleSubEl = e.detailIdle.querySelector('.soft-pad-detail-idle__sub');
      if (idleTitleEl) idleTitleEl.textContent = model.idleTitle || '';
      if (idleSubEl) idleSubEl.textContent = model.idleSub || '';
    }
  }

  function renderEmptyMain() {
    clearMain();
    updateStatusBar(null);
    updateScopeHint();
    renderAppSwitcher();
    emptySurfaceMode = 'empty';
    emptyPrepareCtx = null;
    applySoftPadEmptyIdleHost(buildSoftPadEmptyIdleModel());
  }

  function hideEmpty() {
    emptySurfaceMode = 'none';
    emptyPrepareCtx = null;
    applySoftPadEmptyIdleHost(buildSoftPadEmptyIdleModel());
  }

  /** Scope without mapping: CTA only — never auto-create. */
  function showPrepareMain(scope) {
    ++selectToken;
    ++agentLoadToken;
    resetSoftPadRouteToPadAppear();
    setSelectedMappingId(null);
    pendingPaintEntry = null;
    pendingPaintOpts = null;
    var e = els();
    var host = previewHostForFace();
    if (host) {
      if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
        paintedMappingId = null;
        previewForceOnce = true;
      } else {
        host.replaceChildren();
      }
    }
    paintedMappingId = null;
    clearSubpage();

    var placeholder = (scope && scope.entry) ||
      placeholderEntry(scope && scope.kind, scope && scope.appId);
    updateStatusBar(placeholder);
    updateScopeHint();
    if (!patchAppSwitcher()) renderAppSwitcher();
    markActiveRow(null);
    syncFaceChrome(placeholder);
    renderFuncTiles(placeholder);
    if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
      try {
        global.__otSoftPadPreviewSync();
      } finally {
        previewForceOnce = false;
      }
    }

    var prepareAppId = (scope && (scope.appId || appIdForKind(scope.kind))) || 'codex-chat';
    var prepareKind = (scope && scope.kind) || 'codex';
    var title = t('softPadHubPrepareApp', '准备 {app} Soft Pad')
      .replace('{app}', (scope && scope.title) || appTitleFor(prepareKind));

    emptySurfaceMode = 'prepare';
    emptyPrepareCtx = { appId: prepareAppId, kind: prepareKind, title: title };
    applySoftPadEmptyIdleHost(buildSoftPadEmptyIdleModel());
  }

  function tileStatus(entry, tile) {
    var pad = entry && entry.mapping && entry.mapping.codexMicroPad;
    if (!hasMapping(entry)) {
      return t('softPadTileNeedPrepare', '先点右侧准备');
    }
    if (tile === 'layout') {
      return t('softPadTileLayoutStatus', '已设 {n}/15')
        .replace('{n}', String(boundKeyCount(entry)));
    }
    if (tile === 'presentation') {
      var skin = pad && pad.skin ? String(pad.skin) : 'graphite';
      return t('softPadTilePresStatus', '皮肤 · {s}').replace('{s}', skin);
    }
    if (tile === 'runtime') {
      var Pad = global.OneToneCodexMicroPadUi;
      var mode = Pad && Pad.resolveSoftPadShowMode
        ? Pad.resolveSoftPadShowMode(pad)
        : (pad && pad.overlayEnabled ? 'follow' : 'hidden');
      if (Pad && Pad.softPadShowModeLabel) return Pad.softPadShowModeLabel(mode);
      return softPadShowModeLabelFallback(mode);
    }
    return t('softPadTileMoreStatus', '进阶');
  }

  function softPadShowModeLabelFallback(mode) {
    if (mode === 'front') return t('softPadShowModeFront', '保持在最前');
    if (mode === 'mini') return t('softPadShowModeMini', '显示为迷你条');
    if (mode === 'hidden') return t('softPadShowModeHidden', '不显示浮窗');
    return t('softPadShowModeFollow', '跟随应用显示');
  }

  function normalizeFourPanelView(view) {
    view = String(view || 'runtime');
    if (view === 'advanced') return 'agent';
    if (VALID_SOFT_PAD_VIEWS[view]) return view;
    return 'runtime';
  }

  function subpageTitle(view) {
    view = String(view || '');
    if (view === 'timeline') return t('softPadFlowTimelineTitle', '项目时间胶囊');
    if (view === 'purpose') return t('softPadPurposeAria', 'AG 键做什么');
    view = normalizeFourPanelView(view);
    if (view === 'layout') return t('softPadTileLayout', '改按键');
    if (view === 'presentation') return t('softPadTilePres', '外观');
    if (view === 'runtime') return t('softPadTileRuntime', '何时显示');
    if (view === 'agent') return t('softPadTileMore', '更多');
    return '';
  }

  function flowNodeForView(view) {
    view = String(view || softPadPanelId() || 'runtime');
    if (view === 'agent') return 'agent';
    if (view === 'timeline') return 'timeline';
    return 'pad';
  }

  function syncSoftPadFlowNodes(entry) {
    var root = document.getElementById('softPadFlowNodes');
    if (!root) return;
    var active = softPadFace;
    root.querySelectorAll('[data-soft-pad-node]').forEach(function (node) {
      var id = node.getAttribute('data-soft-pad-node');
      var on = id === active;
      var btn = node.querySelector('.flow-node-btn');
      if (btn) {
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      }
    });
    updateSoftPadFlowHints(entry);
  }

  function updateSoftPadFlowHints(entry) {
    var hero = buildHeroMeta(entry);
    var agentHint = document.getElementById('softPadFlowNodeAgentHint');
    var padHint = document.getElementById('softPadFlowNodePadHint');
    var tmHint = document.getElementById('softPadFlowNodeTimelineHint');
    var trayHint = document.getElementById('softPadFlowNodeTrayHint');
    // Status lights = glanceable busy/idle — not scheme/management copy.
    if (agentHint) {
      agentHint.textContent = t('softPadFlowAgentHint', '看 AI 忙不忙');
    }
    if (padHint) {
      padHint.textContent = entry
        ? (statusLabel(entry) + ' · ' + hero.keys)
        : t('softPadFlowPadHint', '改键位 · 何时显示');
    }
    if (trayHint) {
      trayHint.textContent = t('softPadFlowTrayHint', '预览 · 显示项');
    }
    if (tmHint) {
      tmHint.textContent = hero.restorePoint || t('softPadFlowTimelineHint', '只保护已接入项目');
    }
  }

  function goSoftPadFlowNode(nodeId) {
    nodeId = String(nodeId || '');
    if (nodeId === 'agent') {
      if (softPadFace === 'agent') return;
      closeRingFloat();
      setSoftPadFace('agent');
      return;
    }
    if (nodeId === 'tray') {
      if (softPadFace === 'tray') return;
      closeRingFloat();
      setSoftPadFace('tray');
      return;
    }
    if (nodeId === 'timeline') {
      return;
    }
    if (nodeId === 'pad') {
      if (softPadFace === 'pad') return;
      closeRingFloat();
      setSoftPadFace('pad', { padMode: lastSoftPadPadMode || 'appear' });
    }
  }

  function buildSoftPadPadRingModel(stage, entry) {
    stage = String(stage || softPadFace || 'pad');
    if (arguments.length < 2) entry = resolveSoftPadEntry();
    return {
      stage: stage,
      chips: [],
      chipsHtml: '',
      sig: 'retired|' + stage
    };
  }

  /** Pad ring retired — always clear/hide; do not swap models per face. */
  function syncSoftPadPadRing(entry) {
    var e = els();
    if (!e.padRing) return;
    e.padRing.innerHTML = '';
    e.padRing.hidden = true;
    e.padRing.setAttribute('aria-hidden', 'true');
    e.padRing.removeAttribute('data-ring-stage');
  }

  function closeRingFloat() {
    var e = els();
    if (!e.ringFloat) return;
    e.ringFloat.hidden = true;
    e.ringFloat.innerHTML = '';
    e.ringFloat.removeAttribute('data-ring-float');
  }

  function openRingFloat(kind, entry) {
    var e = els();
    if (!e.ringFloat) return;
    entry = entry || resolveSoftPadEntry();
    if (!hasMapping(entry)) return;
    var m = entry.mapping;
    ensureSoftPadConfig(entry, { persist: false });
    // Always reset float host — renderSoftPad*Panel redirects to #softPadSubpageBody
    // paint host, so appending opacity without clear stacked 屏幕透明度 on each 外观 click.
    e.ringFloat.innerHTML = '';
    e.ringFloat.setAttribute('data-ring-float', kind);
    if (kind === 'look') {
      appendScreenOpacityControl(e.ringFloat, m);
      e.ringFloat.hidden = false;
      return;
    }
    if (kind === 'show') {
      // Runtime panel already painted by openSubpage — float has nothing extra.
      e.ringFloat.hidden = true;
      return;
    }
    if (kind === 'agent-explain') {
      e.ringFloat.hidden = false;
      e.ringFloat.innerHTML =
        '<div class="soft-pad-ring-float__body">' +
        '<p class="codex-pad-mgr__label">' + esc(t('softPadAgentPanelTitle', '状态灯')) + '</p>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadAgentPanelLead',
          '对照顶栏三盏灯选择谁亮。灯只表示忙闲，不是按下动作。')) +
        '</p></div>';
      return;
    }
    e.ringFloat.hidden = true;
  }

  function appendScreenOpacityControl(host, m) {
    if (!host || !m || !m.codexMicroPad) return;
    host.querySelectorAll('.soft-pad-ring-float__opacity').forEach(function (el) {
      el.remove();
    });
    var pad = m.codexMicroPad;
    var cur = Number(pad.screenOpacity);
    if (!(cur > 0) || cur > 1) cur = 0.82;
    var wrap = document.createElement('div');
    wrap.className = 'soft-pad-ring-float__opacity';
    wrap.innerHTML =
      '<label class="codex-pad-mgr__setting">' +
      '<span>' + esc(t('softPadScreenOpacityLbl', '屏幕透明度')) + '</span>' +
      '<input type="range" min="40" max="100" step="1" data-act="screenOpacity" value="' +
      Math.round(cur * 100) + '">' +
      '<span data-screen-opacity-val>' + Math.round(cur * 100) + '%</span>' +
      '</label>';
    host.appendChild(wrap);
    applyScreenOpacityToPreview(cur);
    var range = wrap.querySelector('[data-act="screenOpacity"]');
    if (!range) return;
    range.addEventListener('input', function () {
      var v = Math.max(0.4, Math.min(1, Number(range.value) / 100));
      pad.screenOpacity = v;
      applyScreenOpacityToPreview(v);
      var lab = wrap.querySelector('[data-screen-opacity-val]');
      if (lab) lab.textContent = Math.round(v * 100) + '%';
      try {
        var p = global.OneTonePersistence;
        if (p && p.saveAsync) p.saveAsync();
      } catch (_) {}
    });
  }

  function applyScreenOpacityToPreview(value) {
    var host = previewHostForFace();
    if (!host || !host.style || typeof host.style.setProperty !== 'function') return;
    var v = Number(value);
    if (!(v > 0) || v > 1) v = 0.82;
    host.style.setProperty('--micro-hw-screen-opacity', String(v));
  }

  function isLandLocked() {
    return Date.now() < softPadLandUntil;
  }

  /** Ring path retired — map leftover acts to face/mode if still bound. */
  function handlePadRingAct(act) {
    act = String(act || '');
    if (isLandLocked()) {
      feLog('fe softPad.padRing suppress-land ' + act);
      return;
    }
    if (act === 'show') {
      setSoftPadFace('pad', { fromUser: true });
      setSoftPadPadMode('appear', { fromUser: true });
      return;
    }
    if (act === 'look') {
      setSoftPadFace('pad', { fromUser: true });
      setSoftPadPadMode('look', { fromUser: true });
      return;
    }
    if (act === 'enable') {
      toggleSelectedEnable();
      return;
    }
    if (act === 'purpose') {
      setSoftPadFace('pad', { fromUser: true });
      setSoftPadPadMode('purpose', { fromUser: true });
      return;
    }
    if (act === 'agent-lights' || act === 'agent-connect' || act === 'agent-explain') {
      closeRingFloat();
      setSoftPadFace('agent', { fromUser: true });
      return;
    }
    if (act === 'tm-open' || act === 'tm-bind') {
      return;
    }
  }

  function writeSoftPadTimelinePanel(host) {
    var tm = global.OneToneSoftPadTimeMachine;
    if (tm) {
      tm.bindDesk();
      var bound = tm.resolveBoundWorkspace ? tm.resolveBoundWorkspace() : '';
      // First paint may reuse session; force only when switching Soft Pad–bound folder.
      tm.openDesk(bound ? { workspace: bound } : {});
    }
    // Desk lives in #softPadTmDesk; mark tm detail so skip-remount works.
    var e = els();
    var body = host || (e && e.tmDetail) || (e && e.subBody);
    if (body) {
      if (host) host.innerHTML = '';
      body.setAttribute('data-soft-pad-panel', 'timeline');
      var mid = getSelectedMappingId();
      if (mid) body.setAttribute('data-soft-pad-mapping', String(mid));
      else body.removeAttribute('data-soft-pad-mapping');
    }
  }

  function fourPanelSub(entry, id) {
    if (id === 'runtime') return t('softPadTileRuntimeSub', '浮窗怎么出现；要不要占数字键');
    if (id === 'layout') return t('softPadTileLayoutSub', '点键盘上的键，改它做什么');
    if (id === 'presentation') return t('softPadTilePresSub', '换皮肤；大键盘/迷你条在「何时显示」');
    return t('softPadTileMoreSub', '状态灯等进阶选项');
  }

  function resolveSurfaceEmpty(has) {
    if (emptySurfaceMode === 'empty') return 'noScenarios';
    if (emptySurfaceMode === 'prepare') return 'prepare';
    if (has) return 'ready';
    return 'none';
  }

  function resolvePreviewEmpty(entry, view) {
    if (!hasSoftPadConfig(entry)) return 'noMapping';
    view = String(view || softPadPanelId() || 'runtime');
    // Timeline face shows Soft Pad preview (plan C3).
    var light = view === 'runtime' || view === 'presentation' || view === 'agent' ||
      view === 'timeline' || view === 'purpose' || view === 'layout';
    if (!light) return 'unavailable';
    return 'ready';
  }

  function panelEmptyState(entry, id) {
    if (!hasMapping(entry)) {
      return {
        mode: 'needsAction',
        title: t('softPadTileNeedPrepare', '先点右侧准备'),
        desc: t('softPadHubPrepareHint', '点击准备后才会创建该应用的虚拟键盘配置。')
      };
    }
    var pad = entry.mapping && entry.mapping.codexMicroPad;
    if (id === 'layout' && boundKeyCount(entry) === 0) {
      return {
        mode: 'needsAction',
        title: t('softPadPanelEmptyLayout', '还没有绑定按键'),
        desc: t('softPadPanelEmptyLayoutDesc', '点左侧预览或下方按钮，选一个键开始配置。')
      };
    }
    if (id === 'runtime') {
      var Pad = global.OneToneCodexMicroPadUi;
      var mode = Pad && Pad.resolveSoftPadShowMode
        ? Pad.resolveSoftPadShowMode(pad)
        : (pad && pad.overlayEnabled ? 'follow' : 'hidden');
      if (mode === 'hidden') {
        return {
          mode: 'needsAction',
          title: t('softPadPanelEmptyRuntime', '浮窗当前未显示'),
          desc: t('softPadPanelEmptyRuntimeDesc', '先选一种显示方式，目标应用前台时才会出现悬浮键盘。')
        };
      }
    }
    return { mode: 'ready', title: '', desc: '' };
  }

  function panelPrimaryCta(entry, id) {
    var ready = hasMapping(entry);
    var empty = panelEmptyState(entry, id);
    if (id === 'runtime') {
      return {
        act: 'showMode',
        label: empty.mode === 'needsAction'
          ? t('softPadPrimaryRuntime', '启用浮窗显示')
          : t('softPadPrimaryRuntimeReady', '调整显示方式'),
        disabled: !ready
      };
    }
    if (id === 'layout') {
      return {
        act: 'focusLayoutKey',
        label: t('softPadPrimaryLayout', '编辑按键'),
        disabled: !ready
      };
    }
    if (id === 'presentation') {
      return {
        act: 'focusSkin',
        label: t('softPadPrimaryPresentation', '换皮肤'),
        disabled: !ready
      };
    }
    return {
      act: 'focusAgent',
      label: t('softPadPrimaryAgent', '查看进阶选项'),
      disabled: !ready
    };
  }

  function buildPreviewEmptyHtml(reason) {
    if (reason === 'unavailable') {
      return '<div class="soft-pad-preview-empty">' +
        '<p class="soft-pad-preview-empty__title">' +
        esc(t('softPadPreviewEmptyUnavailable', '当前页暂不刷新预览')) +
        '</p></div>';
    }
    if (reason !== 'noMapping') return '';
    // When switching to workbuddy/trae/qoder, emptyPrepareCtx may be null.
    // In that case, default by selectedScopeId (not hardcoded codex/claude),
    // or the Prepare CTA will create the wrong app scenario.
    var prepareKind = (emptyPrepareCtx && emptyPrepareCtx.kind) || selectedScopeId || 'codex';
    var prepareAppId = (emptyPrepareCtx && emptyPrepareCtx.appId) ||
      (appIdForKind(prepareKind) || (prepareKind === 'claude' ? 'claude-code' : 'codex-chat'));
    return '<div class="soft-pad-preview-empty">' +
      '<p class="soft-pad-preview-empty__title">' +
      esc(t('softPadPreviewEmptyNoMapping', '还没有可预览的虚拟键盘')) +
      '</p>' +
      '<p class="soft-pad-preview-empty__desc">' +
      esc(t('softPadHubPrepareHint', '点击准备后才会创建该应用的虚拟键盘配置。')) +
      '</p>' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-soft-pad-prepare-cta="' +
      esc(prepareAppId) + '" data-scheme-kind="' + esc(prepareKind) + '">' +
      esc(t('softPadHubPrepareShort', '准备')) + '</button></div>';
  }

  /** SoftPad #3c：面板顶栏唯一主 CTA / 空态 HTML（供 Pad paint 复用）。 */
  function softPadPanelExperienceHtml(panelId, entry) {
    if (arguments.length < 2) entry = resolveSoftPadEntry();
    panelId = normalizeFourPanelView(panelId);
    var model = buildSoftPadFourPanelModel(entry);
    var panel = null;
    for (var i = 0; i < model.panels.length; i++) {
      if (model.panels[i].id === panelId) {
        panel = model.panels[i];
        break;
      }
    }
    if (!panel || !panel.primaryCta) return '';
    var cta = panel.primaryCta;
    var empty = panel.panelEmpty || { mode: 'ready' };
    // Panel content owns the actions when ready — no empty primary CTA shell.
    if (empty.mode === 'ready') return '';
    if (empty.mode === 'needsAction') {
      return '<div class="soft-pad-panel-empty" data-soft-pad-panel-empty="' + esc(panelId) + '">' +
        '<p class="soft-pad-panel-empty__title">' + esc(empty.title || '') + '</p>' +
        '<p class="soft-pad-panel-empty__desc">' + esc(empty.desc || '') + '</p>' +
        '<button type="button" class="codex-micro-pad__btn is-primary" data-act="' +
        esc(cta.act) + '"' + (cta.disabled ? ' disabled' : '') + '>' +
        esc(cta.label) + '</button></div>';
    }
    return '';
  }

  function buildSoftPadFourPanelModel(entry) {
    if (arguments.length === 0) entry = resolveSoftPadEntry();
    var activeView = softPadPanelId();
    var mappingId = hasMapping(entry) ? String(entry.mapping.id) : '';
    var has = hasMapping(entry) && ensureSoftPadConfig(entry, { persist: false });
    // Builtin app placeholders are intentionally clickable: the first panel click
    // prepares that app's mapping, then openSubpage continues into the requested view.
    // Rendering a native disabled button here made that existing prepare path unreachable.
    var canOpen = has || !!(entry && entry.canPrepare && isHubSoftPadKind(entry.kind));
    var detailOpen = softPadFace === 'pad' && has;
    var landingView = defaultDetailView();
    var landingHint = t('softPadLandingHint', '建议从「{panel}」开始')
      .replace('{panel}', subpageTitle(landingView));
    var surfaceEmpty = resolveSurfaceEmpty(has);
    var previewEmpty = resolvePreviewEmpty(entry, activeView);
    var panels = SOFT_PAD_PANEL_ORDER.map(function (id, index) {
      var empty = panelEmptyState(entry, id);
      var cta = panelPrimaryCta(entry, id);
      return {
        id: id,
        index: String(index + 1),
        title: subpageTitle(id),
        summary: fourPanelSub(entry, id),
        status: tileStatus(entry, id),
        disabled: !canOpen,
        iaGroup: id === 'layout' ? 'presentation' : (id === 'agent' ? 'advanced' : id),
        aliasId: id === 'agent' ? 'advanced' : id,
        active: activeView === id,
        recommended: landingView === id,
        primaryCta: cta,
        panelEmpty: empty
      };
    });
    var sig = [
      mappingId,
      softPadFace,
      softPadPadMode,
      activeView,
      has ? '1' : '0',
      detailOpen ? '1' : '0',
      landingView,
      surfaceEmpty,
      previewEmpty,
      panels.map(function (panel) {
        return [
          panel.id,
          panel.aliasId,
          panel.status,
          panel.disabled ? '1' : '0',
          panel.active ? '1' : '0',
          panel.recommended ? '1' : '0',
          panel.primaryCta && panel.primaryCta.act,
          panel.panelEmpty && panel.panelEmpty.mode
        ].join('|');
      }).join('\0')
    ].join('\0');
    return {
      mappingId: mappingId,
      activeView: activeView,
      face: softPadFace,
      padMode: softPadPadMode,
      hasMapping: has,
      detailOpen: detailOpen,
      panels: panels,
      panelOrder: SOFT_PAD_PANEL_ORDER.slice(),
      landingView: landingView,
      landingHint: landingHint,
      surfaceEmpty: surfaceEmpty,
      previewEmpty: previewEmpty,
      emptyState: has ? 'ready' : 'prepare',
      previewState: has ? 'preview' : 'empty',
      defaultView: landingView,
      sig: sig
    };
  }

  function defaultDetailView(opts) {
    opts = opts || {};
    // Soft Pad page always lands on「何时显示」— never leave idle asking the user to click.
    if (opts.forceView && VALID_SOFT_PAD_VIEWS[opts.forceView] && opts.forceView !== 'timeline' &&
        opts.forceView !== 'layout') {
      return opts.forceView;
    }
    return 'runtime';
  }

  function rememberSoftPadPadMode(mode) {
    if (VALID_SOFT_PAD_PAD_MODES[mode]) lastSoftPadPadMode = mode;
  }

  function buildSoftPadFuncTilesModel(entry) {
    if (arguments.length === 0) {
      entry = resolveSoftPadEntry();
    }
    // Pad-centric: func tiles replaced by face tabs / padMode.
    var ariaLabel = t('softPadFuncTilesAria', '你想改什么？');
    return {
      tilesHtml: '',
      hidden: true,
      ariaLabel: ariaLabel,
      mappingId: entry && entry.mapping && entry.mapping.id ? String(entry.mapping.id) : '',
      view: softPadPanelId(),
      face: softPadFace,
      padMode: softPadPadMode,
      ready: false,
      sig: 'hidden-face|' + softPadFace + '|' + softPadPadMode
    };
  }

  function applySoftPadFuncTilesHost(model) {
    var e = els();
    if (!e.tiles) return;
    if (global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function') {
      global.__otSoftPadFuncTilesSync();
      return;
    }
    e.tiles.hidden = !!model.hidden;
    if (model.ariaLabel) e.tiles.setAttribute('aria-label', model.ariaLabel);
    e.tiles.innerHTML = model.tilesHtml || '';
  }

  function renderFuncTiles(entry) {
    var e = els();
    if (!e.tiles) return;
    applySoftPadFuncTilesHost(buildSoftPadFuncTilesModel(entry));
  }

  /** After island sync: if left chrome still empty/hidden, force-resync or legacy fill. */
  function ensureSoftPadLeftChrome(entry) {
    if (!hasMapping(entry)) return;
    var e = els();
    if (e.tiles) {
      e.tiles.hidden = true;
      e.tiles.innerHTML = '';
    }
    syncSoftPadPadRing(entry);
    paintPreview(entry, { force: true });
    var host = previewHostForFace();
    if (host && !host.querySelector('.codex-micro-pad.soft-pad-preview')) {
      var Pad = global.OneToneCodexMicroPadUi;
      if (Pad && Pad.renderSoftPadPreview) {
        var paint = host.querySelector('[data-soft-pad-preview-paint]');
        if (!paint) {
          paint = document.createElement('div');
          paint.setAttribute('data-soft-pad-preview-paint', '');
          paint.className = 'soft-pad-preview-paint';
          host.appendChild(paint);
        }
        try {
          Pad.renderSoftPadPreview(paint, entry.mapping, { forceFull: true });
          host.hidden = false;
          if (host.querySelector('.codex-micro-pad.soft-pad-preview')) {
            paintedMappingId = String(entry.mapping.id);
          }
        } catch (_) {}
      }
    } else if (host) {
      host.hidden = false;
    }
    if (entry && entry.mapping && entry.mapping.codexMicroPad) {
      applyScreenOpacityToPreview(entry.mapping.codexMicroPad.screenOpacity);
    }
  }

  function syncSettingsPreviewBanner(face) {
    var banner = document.getElementById('softPadSettingsPreviewBanner');
    if (!banner) return;
    var titleEl = document.getElementById('softPadSettingsPreviewBannerTitle');
    var bodyEl = document.getElementById('softPadSettingsPreviewBannerBody');
    if (titleEl) {
      titleEl.textContent = t('softPadSettingsPreviewBannerTitle', '设置中预览');
    }
    if (bodyEl) {
      bodyEl.textContent = t(
        'softPadSettingsPreviewBannerBody',
        '悬浮 Soft Pad 在设置时会自动隐藏。「全局」在未匹配 Agent 时显示迷你条且不占用实体键；匹配后使用对应应用的键位。右侧改动同步到左侧预览。'
      );
    }
    banner.hidden = face === 'tray' || face === 'timeline';
    var previewLbl = t('softPadSettingsPreviewBannerTitle', '设置中预览');
    ['softPadPreviewHost', 'softPadAgentPreviewHost'].forEach(function (id) {
      var host = document.getElementById(id);
      if (host) host.setAttribute('data-preview-label', previewLbl);
    });
  }

  /** Face-mutex chrome: exactly one of pad / agent / timeline face roots. */
  function syncFaceChrome(entry) {
    var e = els();
    var face = softPadFace;
    syncSettingsPreviewBanner(face);
    if (e.stage) {
      e.stage.setAttribute('data-soft-pad-face', face);
      e.stage.removeAttribute('data-soft-pad-stage');
      e.stage.classList.remove('is-tm-desk');
      e.stage.classList.remove('is-preview-collapsed');
    }
    var panel = document.getElementById('settingsPanelSoftPad');
    if (panel) panel.setAttribute('data-soft-pad-face', face);
    function showFace(el, on) {
      if (!el) return;
      if (on) el.removeAttribute('hidden');
      else el.setAttribute('hidden', '');
    }
    showFace(e.facePad, face === 'pad');
    showFace(e.faceAgent, face === 'agent');
    showFace(e.faceTray, face === 'tray');
    showFace(e.faceTimeline, face === 'timeline');

    var tm = global.OneToneSoftPadTimeMachine;
    if (face !== 'timeline' && face !== 'tray' && tm && tm.closeDesk) {
      try { tm.closeDesk(); } catch (_) {}
    }

    if (e.tiles) {
      e.tiles.hidden = true;
      e.tiles.innerHTML = '';
    }
    syncSoftPadPadRing(entry);
    syncPadTabs();

    var detailOpen = face === 'pad' && hasMapping(entry);
    setDetailOpen(detailOpen);
    if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
      global.__otSoftPadPreviewSync();
    } else {
      var host = previewHostForFace(face);
      if (host) {
        var previewModel = buildSoftPadPreviewModel();
        host.hidden = !!previewModel.hidden;
        if (!previewModel.hidden) host.classList.remove('is-collapsed');
      }
    }
    if (e.stage) e.stage.classList.toggle('is-detail-open', detailOpen);

    if (global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function') {
      global.__otSoftPadDetailChromeSync();
    } else {
      var panel = softPadPanelId();
      if (e.subBack) {
        e.subBack.hidden = face === 'pad' && softPadPadMode === 'appear';
        e.subBack.textContent = t('softPadSubBack', '← 返回');
      }
      if (e.subTitle && detailOpen) e.subTitle.textContent = subpageTitle(panel);
    }
    if (global.__otSoftPadEmptyIdleMounted && typeof global.__otSoftPadEmptyIdleSync === 'function') {
      global.__otSoftPadEmptyIdleSync();
    } else if (e.detailIdle) {
      var idleTitle = e.detailIdle.querySelector('.soft-pad-detail-idle__title');
      var idleSub = e.detailIdle.querySelector('.soft-pad-detail-idle__sub');
      if (idleTitle) {
        idleTitle.textContent = t('softPadDetailIdleTitle', '点顶部一项开始调整');
      }
      if (idleSub) {
        idleSub.textContent = t('softPadDetailIdleSub', '右侧打开详情；左侧键盘保持不动');
      }
    }
    syncSoftPadFlowNodes(entry);
    if (e.pageBody) {
      e.pageBody.classList.toggle('is-face-agent', face === 'agent');
    }
    if (e.aside) {
      if (face === 'agent') {
        e.aside.removeAttribute('hidden');
        e.aside.setAttribute('aria-hidden', 'false');
        renderSchemeList();
      } else {
        e.aside.setAttribute('hidden', '');
        e.aside.setAttribute('aria-hidden', 'true');
      }
    }
    if (entry) {
      if (global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function') {
        renderFuncTiles(entry);
      } else if (e.tiles) {
        e.tiles.hidden = true;
        e.tiles.innerHTML = '';
      }
    } else if (global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function') {
      renderFuncTiles(null);
    }
    updateScopeHint();
    pruneSoftPadPanelChrome();
    var cursorCard = document.getElementById('softPadCursorActivityCard');
    if (cursorCard && String(selectedScopeId || '') === 'cursor') {
      refreshCursorActivityPrefDom(cursorCard);
    }
    var minimaxCard = document.getElementById('softPadMinimaxKeyCard');
    if (minimaxCard && String(selectedScopeId || '') === 'minimax') {
      refreshMinimaxCodingKeyDom(minimaxCard);
    }
  }

  // Compat alias — callers updated to syncFaceChrome; keep name for any external poke.
  function syncHubChrome(entry) {
    syncFaceChrome(entry);
  }

  /** P14g：SoftPad detail 顶栏（返回 / 标题）模型。 */
  function buildSoftPadDetailChromeModel() {
    var panelModel = buildSoftPadFourPanelModel(resolveSoftPadEntry());
    var view = panelModel.activeView || 'runtime';
    var detailOpen = !!panelModel.detailOpen;
    var backHidden = !detailOpen || softPadPadMode === 'appear';
    var title = detailOpen ? subpageTitle(view) : '';
    var backLabel = t('softPadSubBack', '← 返回');
    var landingView = panelModel.landingView || 'runtime';
    var sig = [
      softPadFace,
      softPadPadMode,
      view,
      detailOpen ? '1' : '0',
      backHidden ? '1' : '0',
      title,
      backLabel,
      landingView
    ].join('\0');
    return {
      view: view,
      face: softPadFace,
      padMode: softPadPadMode,
      detailOpen: detailOpen,
      backHidden: backHidden,
      backLabel: backLabel,
      title: title,
      landingView: landingView,
      sig: sig
    };
  }

  function applySoftPadDetailChromeHost(model) {
    if (global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function') {
      global.__otSoftPadDetailChromeSync();
      return;
    }
    if (!model) model = buildSoftPadDetailChromeModel();
    var e = els();
    if (e.detailPanel) e.detailPanel.hidden = !model.detailOpen;
    if (e.subHost) {
      e.subHost.classList.toggle('is-open', !!model.detailOpen);
      e.subHost.removeAttribute('hidden');
    }
    if (e.stage) e.stage.classList.toggle('is-detail-open', !!model.detailOpen);
    if (e.subBack) {
      e.subBack.hidden = !!model.backHidden;
      e.subBack.textContent = model.backLabel || t('softPadSubBack', '← 返回');
    }
    if (e.subTitle) e.subTitle.textContent = model.title || '';
  }

  function syncEntryFromMapping(m) {
    if (m && m.id) setSelectedMappingId(String(m.id));
    var entry = findEntry(getSelectedMappingId());
    if (entry && m && m.codexMicroPad) {
      entry.mapping = m;
      applyRuntimeFlagsToEntry(entry);
      entry.presentation = m.codexMicroPad.presentation === 'mini' ? 'mini' : 'full';
      entry.title = appTitleFor(entry.kind);
    }
    return entry;
  }

  function findSchemeRow(mappingId) {
    var e = els();
    if (!e.list) return null;
    return e.list.querySelector('.keys-hub-scheme-row[data-scheme-id="' + String(mappingId || '') + '"]');
  }

  function patchSchemeRowEnable(entry) {
    if (!hasMapping(entry)) return;
    var row = findSchemeRow(entry.mapping.id);
    if (!row) {
      renderSchemeList();
      return;
    }
    row.classList.toggle('is-disabled-scheme', !entry.padEnabled);
    var tag = statusTag(entry);
    var tagEl = row.querySelector('.keys-hub-scheme-tag');
    if (tagEl) {
      tagEl.className = 'keys-hub-scheme-tag ' + tag.cls;
      tagEl.textContent = tag.text;
    }
    var toggle = row.querySelector('[data-scheme-enable]');
    if (toggle) {
      toggle.classList.toggle('is-on', !!entry.padEnabled);
      toggle.setAttribute('aria-checked', entry.padEnabled ? 'true' : 'false');
      toggle.setAttribute('aria-label', statusLabel(entry));
    }
    var pair = row.querySelector('.keys-hub-scheme-pair');
    if (pair) {
      pair.textContent = t('softPadSchemeSoftPad', '虚拟键盘') + ' · ' +
        presentationLabel(entry.presentation);
    }
  }

  function patchSchemeRowPresentation(entry) {
    if (!hasMapping(entry)) return;
    var row = findSchemeRow(entry.mapping.id);
    if (!row) {
      renderSchemeList();
      return;
    }
    var pair = row.querySelector('.keys-hub-scheme-pair');
    if (pair) {
      pair.textContent = t('softPadSchemeSoftPad', '虚拟键盘') + ' · ' +
        presentationLabel(entry.presentation);
    }
    var steps = row.querySelector('.keys-hub-scheme-steps');
    if (steps) steps.textContent = boundKeyCount(entry) + '/15';
  }

  /** P14k：runtime / presentation / layout / timeline 已 paint 时跳过整板 remount。
   * 只认 paint-host 里的活 DOM —— 岛清空后 `__otSoftPad*Mounted` 仍可能为 true，
   * 再点默认落地的「何时显示」会被当成 AlreadyPainted 而假死。 */
  function softPadSubpageAlreadyPainted(entry, view) {
    view = view || softPadPanelId();
    var body = panelPaintBody(view);
    if (!body || !hasMapping(entry) || !view) return false;
    var mapId = String(entry.mapping.id || '');
    if (body.getAttribute('data-soft-pad-panel') !== view) return false;
    if (body.getAttribute('data-soft-pad-mapping') !== mapId) return false;
    var host = softPadSubpagePaintEl(body) || body;
    if (view === 'runtime') {
      return !!(host.querySelector('button[data-act="showMode"][data-show-mode]') ||
        host.querySelector('select[data-act="showMode"]'));
    }
    if (view === 'presentation') {
      return !!host.querySelector('[data-pad-skin-opt]');
    }
    if (view === 'layout') {
      return !!(host.querySelector('[data-soft-pad-layout-preview]') ||
        host.querySelector('[data-soft-pad-layout-editor]'));
    }
    if (view === 'purpose') {
      return !!(host.querySelector('[data-pad-purpose]') &&
        host.querySelector('.soft-pad-feature-cards'));
    }
    if (view === 'timeline') {
      var desk = document.getElementById('softPadTmDesk');
      return !!(desk && desk.dataset.tmBound === '1' && !desk.hidden);
    }
    if (view === 'agent') {
      // v12：灯板按当前 scope 配置；同 mapping + 同 scope 才跳过 remount。
      var scopeAttr = host.getAttribute('data-lights-scope') || '';
      return !!(host.querySelector('[data-lights-simple]') &&
        host.querySelector('[data-lights-tab-panel]') &&
        scopeAttr === String(selectedScopeId || ''));
    }
    return false;
  }

  function syncRuntimeCheckboxes(entry) {
    if (softPadFace !== 'pad' || !hasMapping(entry)) return;
    if (softPadPadMode !== 'appear' && softPadPadMode !== 'purpose') return;
    var e = els();
    if (!e.subBody) return;
    // P14k：query paint-target（岛挂载后控件在 paint 子节点内）。
    var body = softPadSubpagePaintEl(e.subBody) || e.subBody;
    var pad = entry.mapping.codexMicroPad;
    if (!pad) return;
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && typeof Pad.syncSoftPadRuntimePanel === 'function') {
      Pad.syncSoftPadRuntimePanel(body, entry.mapping);
      return;
    }
    var mode = Pad && Pad.resolveSoftPadShowMode
      ? Pad.resolveSoftPadShowMode(pad)
      : (pad.overlayEnabled ? 'follow' : 'hidden');
    var showModeSel = body.querySelector('select[data-act="showMode"]');
    if (showModeSel) showModeSel.value = mode;
    if (Pad && Pad.syncSoftPadShowModeChrome) {
      Pad.syncSoftPadShowModeChrome(body, mode, pad);
    } else {
      var hint = body.querySelector('[data-show-mode-hint]');
      if (hint) {
        hint.textContent = mode === 'front'
          ? t('softPadShowModeFrontHint', '浮窗保持可见；按键动作仍发给对应应用，不会接管其它窗口。')
          : mode === 'mini'
            ? t('softPadShowModeMiniHint', '精简为状态灯条，适合少占屏幕。')
            : mode === 'hidden'
              ? t('softPadShowModeHiddenHint', '不显示悬浮键盘；你改过的键位配置会保留。')
              : t('softPadShowModeFollowHint', '目标应用在前台时显示悬浮键盘。');
      }
      var scene = body.querySelector('[data-show-scene]');
      if (scene) scene.setAttribute('data-show-scene', mode);
      body.querySelectorAll('button[data-act="showMode"][data-show-mode]').forEach(function (btn) {
        var on = btn.getAttribute('data-show-mode') === mode;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    var numLockEl = body.querySelector('[data-act="numlock"]');
    if (numLockEl) {
      numLockEl.checked = !!pad.requireNumLockOff;
      numLockEl.disabled = !pad.enabled;
    }
    var enabledEl = body.querySelector('[data-act="enabled"]');
    if (enabledEl) enabledEl.checked = !!pad.enabled;
    var navKeysEl = body.querySelector('[data-act="navKeys"]');
    if (navKeysEl) {
      navKeysEl.checked = pad.showNavigationPad !== false && pad.navKeysEnabled !== false;
      navKeysEl.disabled = !pad.enabled;
    }
    var cards = body.querySelector('.soft-pad-feature-cards');
    if (cards) cards.setAttribute('data-mapping-on', pad.enabled ? '1' : '0');
    body.querySelectorAll('[data-feature="occupy"], [data-feature="nav"]').forEach(function (card) {
      card.classList.toggle('is-disabled', !pad.enabled);
      if (pad.enabled) card.removeAttribute('aria-disabled');
      else card.setAttribute('aria-disabled', 'true');
    });
    var numpadMap = body.querySelector('[data-numpad-on]');
    if (numpadMap) numpadMap.setAttribute('data-numpad-on', pad.requireNumLockOff ? '1' : '0');
    var demo = body.querySelector('[data-demo-mode]');
    if (demo && !demo.classList.contains('is-user-driven')) {
      demo.setAttribute('data-demo-mode', pad.requireNumLockOff ? 'soft' : 'numpad');
    }
    var navCap = body.querySelector('[data-nav-cap]');
    if (navCap) {
      navCap.textContent = (pad.showNavigationPad === false || pad.navKeysEnabled === false)
        ? t('softPadFeatureNavCapOff', 'Soft Pad 不显示左侧方向列；主键盘方向键始终系统原样。')
        : t('softPadFeatureNavCapOn', '屏幕方向钮可注入 ↑↓←→；主键盘倒 T 保持系统原样（不劫持）。');
    }
    var navHost = body.querySelector('[data-nav-demo-host]');
    if (navHost && Pad && typeof Pad.renderNavArrowDemoHtml === 'function') {
      navHost.innerHTML = Pad.renderNavArrowDemoHtml(pad);
    } else {
      var arrowStory = body.querySelector('[data-nav-on]');
      if (arrowStory) {
        arrowStory.setAttribute('data-nav-on', (pad.showNavigationPad === false || pad.navKeysEnabled === false) ? '0' : '1');
      }
    }
    var hintEl = body.querySelector('[data-numpad-hint]');
    if (hintEl) {
      var showHint = pad.requireNumLockOff && softLikelyNoNumpadHint();
      if (showHint) {
        hintEl.hidden = false;
        hintEl.textContent = t('softPadNumpadNoPadHint',
          '未检测到独立数字键区。你可以关闭占用，只用悬浮 Soft Pad。');
      } else {
        hintEl.hidden = true;
      }
    }
  }

  function softLikelyNoNumpadHint() {
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && typeof Pad.softLikelyNoNumpad === 'function') {
      return Pad.softLikelyNoNumpad() === true;
    }
    try {
      var touch = Number(navigator.maxTouchPoints || 0) > 0;
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      return !!(touch && coarse);
    } catch (_) {
      return false;
    }
  }

  /** Layered panel updates — never default to paintSubpage remount. */
  function onSoftPadPanelChanged(m, panel, changeOpts) {
    var entry = syncEntryFromMapping(m);
    if (!entry) return;
    panel = panel || softPadPanelId();
    changeOpts = changeOpts || {};
    var onPad = softPadFace === 'pad';
    // P14l：皮肤切换 ultra-hot — 不 remount presentation、不 force preview。
    if (panel === 'presentation') {
      updateStatusBar(entry);
      patchSchemeRowPresentation(entry);
      if (onPad || softPadFace === 'agent') renderFuncTiles(entry);
      return;
    }
    markActiveRow(getSelectedMappingId());
    if (!patchAppSwitcher()) renderAppSwitcher();
    updateScopeHint();

    if (panel === 'layout') {
      updateStatusBar(entry);
      patchSchemeRowPresentation(entry);
      if (onPad && softPadPadMode === 'keys') schedulePreviewPaint(entry);
      if (onPad || softPadFace === 'agent') renderFuncTiles(entry);
      if (onPad && softPadPadMode === 'keys' && changeOpts.remountLayout !== false) {
        paintSubpage(entry, { forceRemount: true });
      }
      return;
    }
    if (panel === 'runtime') {
      updateStatusBar(entry);
      patchSchemeRowEnable(entry);
      patchSchemeRowPresentation(entry);
      // P14k：Never remount runtime three-cards on toggle — SVG demos remount = 假死.
      syncRuntimeCheckboxes(entry);
      if (changeOpts.refreshPreview) {
        var mapId = String(entry.mapping.id);
        requestAnimationFrame(function () {
          if (softPadFace !== 'pad' || softPadPadMode !== 'appear') return;
          if (String(getSelectedMappingId() || '') !== mapId) return;
          var cur = findEntry(mapId);
          if (!hasMapping(cur)) return;
          var PadUi = global.OneToneCodexMicroPadUi;
          var prevHost = previewHostForFace();
          if (PadUi && typeof PadUi.renderSoftPadPreview === 'function' && prevHost) {
            try { PadUi.renderSoftPadPreview(prevHost, cur.mapping); } catch (_) {}
          }
        });
      }
      if (onPad || softPadFace === 'agent') renderFuncTiles(entry);
      return;
    }
    if (panel === 'agent') {
      return;
    }
    updateStatusBar(entry);
    if (onPad && softPadPadMode === 'keys') schedulePreviewPaint(entry);
    if (onPad || softPadFace === 'agent') renderFuncTiles(entry);
  }

  function softPadSubpagePaintEl(preferred) {
    var body = preferred || panelPaintBody();
    if (!body) return null;
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && typeof Pad.resolveSoftPadSubpagePaintHost === 'function') {
      return Pad.resolveSoftPadSubpagePaintHost(body);
    }
    return body;
  }

  function applySoftPadSubpageOuterAttrs(model, bodyEl) {
    var body = bodyEl || panelPaintBody(model && model.panel) || els().subBody;
    if (!body) return;
    if (!model || model.clear || !model.panel) {
      body.classList.remove('is-editing-key');
      body.removeAttribute('data-soft-pad-mapping');
      body.removeAttribute('data-soft-pad-panel');
      body.removeAttribute('data-agent-load-token');
      return;
    }
    if (model.mappingId) body.setAttribute('data-soft-pad-mapping', String(model.mappingId));
    else body.removeAttribute('data-soft-pad-mapping');
    body.setAttribute('data-soft-pad-panel', String(model.panel));
    if (model.panel === 'agent' && model.agentLoadToken != null && model.agentLoadToken !== '') {
      body.setAttribute('data-agent-load-token', String(model.agentLoadToken));
    } else {
      body.removeAttribute('data-agent-load-token');
    }
    if (model.panel !== 'layout') body.classList.remove('is-editing-key');
  }

  /** P14f：SoftPad 子页 body 模型（单一来源）。 */
  function buildSoftPadSubpageModel() {
    var panelModel = buildSoftPadFourPanelModel(resolveSoftPadEntry());
    var view = panelModel.activeView || 'runtime';
    var has = !!panelModel.hasMapping;
    var mappingId = panelModel.mappingId || '';
    var panel = '';
    var mode = 'clear';
    var clear = true;
    var agentLoadTokenStr = '';
    if (has && (view === 'layout' || view === 'presentation' || view === 'runtime' ||
        view === 'agent' || view === 'purpose')) {
      clear = false;
      panel = view === 'purpose' ? 'purpose' : normalizeFourPanelView(view);
      if (view === 'agent' && !isHubSoftPadKind(selectedScopeId)) {
        mode = 'agent-pick';
      } else {
        mode = 'panel';
      }
      if (view === 'agent') agentLoadTokenStr = String(agentLoadToken);
    }
    var sig = [
      mappingId,
      softPadFace,
      softPadPadMode,
      view,
      clear ? '1' : '0',
      panel,
      mode,
      agentLoadTokenStr,
      String(subpageToken || 0)
    ].join('\0');
    return {
      mappingId: mappingId,
      view: view,
      face: softPadFace,
      padMode: softPadPadMode,
      clear: clear,
      panel: panel,
      mode: mode,
      agentLoadToken: agentLoadTokenStr,
      editingKey: false,
      sig: sig
    };
  }

  function applySoftPadSubpageHost(model) {
    var e = els();
    if (!e.subBody) return;
    if (global.__otSoftPadSubpageMounted && typeof global.__otSoftPadSubpageSync === 'function') {
      global.__otSoftPadSubpageSync();
      return;
    }
    if (!model) model = buildSoftPadSubpageModel();
    applySoftPadSubpageOuterAttrs(model);
  }

  function getSelectedSoftPadMappingForSubpage() {
    var entry = resolveSoftPadEntry();
    if (!hasMapping(entry)) return null;
    ensureSoftPadConfig(entry, { persist: false });
    return entry.mapping.codexMicroPad ? entry.mapping : null;
  }

  function getSoftPadSubpagePaintOpts() {
    var targetView = softPadPanelId();
    return {
      onChanged: function (mapping, panel, changeOpts) {
        onSoftPadPanelChanged(mapping, panel || targetView, changeOpts);
      },
      agentLoadToken: agentLoadToken
    };
  }

  function bindSoftPadAgentPickCta(host) {
    if (!host) return;
    var pick = host.querySelector('[data-act="pick-app"]');
    if (!pick || pick.dataset.softPadPickBound === '1') return;
    pick.dataset.softPadPickBound = '1';
    pick.addEventListener('click', function () {
      selectScope('codex', { rebuildList: true });
    });
  }

  function writeSoftPadSubpageAgentPick(host) {
    if (!host) return;
    host.innerHTML =
      '<div class="soft-pad-agent-guide">' +
      '<p>' + esc(t('softPadAgentPickApp', '选择一个应用')) + '</p>' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-act="pick-app">' +
      esc(t('softPadAgentPickApp', '选择一个应用')) + '</button>' +
      '</div>';
    host.setAttribute('data-soft-pad-panel', 'agent');
    host.removeAttribute('data-agent-load-token');
    bindSoftPadAgentPickCta(host);
  }

  function writeSoftPadSubpageHint(host, msg) {
    if (!host) return;
    host.innerHTML = '<p class="codex-pad-mgr__hint">' + esc(msg) + '</p>';
  }

  function writeSoftPadPurposePanel(host, entry) {
    if (!host || !entry || !entry.mapping) return;
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && typeof Pad.renderSoftPadPurposePanel === 'function') {
      Pad.renderSoftPadPurposePanel(host, entry.mapping, {
        onChanged: function (mapping, panel, changeOpts) {
          onSoftPadPanelChanged(mapping, panel || 'purpose', changeOpts);
        }
      });
      return;
    }
    host.innerHTML =
      '<div class="soft-pad-purpose-panel">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadPurposeAria', 'AG 键做什么')) + '</p>' +
      (purposeChipView(entry) || '') +
      '</div>';
    host.setAttribute('data-soft-pad-panel', 'purpose');
    if (entry.mapping.id) {
      host.setAttribute('data-soft-pad-mapping', String(entry.mapping.id));
    }
  }

  function paintSubpage(entry, paintOpts) {
    paintOpts = paintOpts || {};
    var e = els();
    var targetView = softPadPanelId();
    var t0 = Date.now();
    var body = panelPaintBody(targetView);
    if (!entry || !hasMapping(entry) || !body) {
      if (softPadFace === 'pad' && global.__otSoftPadSubpageMounted &&
          typeof global.__otSoftPadSubpageSync === 'function') {
        applySoftPadSubpageHost(buildSoftPadSubpageModel());
      }
      return;
    }
    if (String(entry.mapping.id) !== String(getSelectedMappingId() || '')) {
      adoptSoftPadSelection(entry);
    }
    if (String(entry.mapping.id) !== String(getSelectedMappingId() || '')) return;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!Pad) {
      feLog('fe softPad.paintSubpage no Pad ui');
      return;
    }

    if (!paintOpts.forceRemount && softPadSubpageAlreadyPainted(entry, targetView)) {
      if (targetView === 'runtime' || targetView === 'purpose') syncRuntimeCheckboxes(entry);
      feLog('fe softPad.paintSubpage skip-remount ' + targetView);
      return;
    }

    function stillValid() {
      return softPadPanelId() === targetView &&
        hasMapping(entry) &&
        String(entry.mapping.id) === String(getSelectedMappingId() || '');
    }

    var onChanged = function (mapping, panel, changeOpts) {
      onSoftPadPanelChanged(mapping, panel || targetView, changeOpts);
    };
    if (e.subTitle && softPadFace === 'pad') {
      if (!(global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function')) {
        e.subTitle.textContent = subpageTitle(targetView);
      }
    }
    if (!stillValid()) return;

    if (targetView === 'timeline') {
      try {
        if (Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
        writeSoftPadTimelinePanel(null);
      } catch (err) {
        feLog('fe softPad.paintSubpage error ' + (err && err.message ? err.message : 'unknown'));
        throw err;
      } finally {
        feLog('fe softPad.paintSubpage timeline ' + (Date.now() - t0) + 'ms');
      }
      return;
    }

    // Pad face island path only — agent paints into #softPadAgentBody.
    if (softPadFace === 'pad' && global.__otSoftPadSubpageMounted &&
        typeof global.__otSoftPadSubpageSync === 'function' && targetView !== 'purpose') {
      try {
        if (Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
        ++subpageToken;
        applySoftPadSubpageOuterAttrs(buildSoftPadSubpageModel(), body);
        applySoftPadSubpageHost(buildSoftPadSubpageModel());
      } catch (err) {
        feLog('fe softPad.paintSubpage error ' + (err && err.message ? err.message : 'unknown'));
        throw err;
      } finally {
        feLog('fe softPad.paintSubpage ' + targetView + ' ' + (Date.now() - t0) + 'ms');
      }
      return;
    }

    var paintHost = softPadSubpagePaintEl(body) || body;

    try {
      if (Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
      if (targetView !== 'layout') {
        body.classList.remove('is-editing-key');
        paintHost.classList.remove('is-editing-key');
      }
      if (targetView === 'purpose') {
        writeSoftPadPurposePanel(paintHost, entry);
        return;
      }
      if (targetView === 'agent' && !isHubSoftPadKind(selectedScopeId)) {
        writeSoftPadSubpageAgentPick(paintHost);
        body.setAttribute('data-soft-pad-panel', 'agent');
        body.setAttribute('data-soft-pad-mapping', String(entry.mapping.id || ''));
        body.removeAttribute('data-agent-load-token');
        return;
      }

      var m = entry.mapping;
      if (targetView === 'layout' && Pad.renderSoftPadLayoutPanel) {
        Pad.renderSoftPadLayoutPanel(paintHost, m, { onChanged: onChanged });
      } else if (targetView === 'presentation' && Pad.renderSoftPadPresentationPanel) {
        Pad.renderSoftPadPresentationPanel(paintHost, m, { onChanged: onChanged });
      } else if (targetView === 'runtime' && Pad.renderSoftPadRuntimePanel) {
        Pad.renderSoftPadRuntimePanel(paintHost, m, { onChanged: onChanged });
      } else if (targetView === 'agent' && Pad.renderSoftPadAgentPanel) {
        var token = agentLoadToken;
        body.setAttribute('data-agent-load-token', String(token));
        Pad.renderSoftPadAgentPanel(paintHost, m, {
          onChanged: onChanged,
          agentLoadToken: token
        });
        paintHost.setAttribute('data-lights-scope', String(selectedScopeId || ''));
        body.setAttribute('data-lights-scope', String(selectedScopeId || ''));
        // Shell Hook diagnose lives under keys → advanced only — never mount into center column.
      } else {
        writeSoftPadSubpageHint(paintHost, t('softPadSubUnavailable', '该面板暂不可用'));
      }
      body.setAttribute('data-soft-pad-panel', targetView);
      body.setAttribute('data-soft-pad-mapping', String(entry.mapping.id || ''));
    } catch (err) {
      feLog('fe softPad.paintSubpage error ' + (err && err.message ? err.message : 'unknown'));
      try {
        writeSoftPadSubpageHint(paintHost, t('softPadSubError', '面板加载失败，请返回重试'));
      } catch (_) {}
      throw err;
    } finally {
      feLog('fe softPad.paintSubpage ' + targetView + ' ' + (Date.now() - t0) + 'ms');
    }
  }

  function setSoftPadFace(face, opts) {
    opts = opts || {};
    face = String(face || '');
    if (!VALID_SOFT_PAD_FACES[face]) return;
    var prevFace = softPadFace;
    var entry = resolveSoftPadEntry();
    if (prevFace === 'tray' && face !== 'tray') {
      var trayUiLeave = global.OneToneSoftPadTrayUi;
      if (trayUiLeave && trayUiLeave.onFaceLeave) try { trayUiLeave.onFaceLeave(); } catch (_) {}
    }

    if (face !== 'timeline' && face !== 'tray' && !hasMapping(entry) && opts.allowEmpty !== true) {
      var scopeKind = String(selectedScopeId || '').trim();
      if (isHubSoftPadKind(scopeKind)) {
        var prepared = prepareAppFromUi(appIdForKind(scopeKind), scopeKind);
        if (prepared) entry = resolveSoftPadEntry();
      }
      if (!hasMapping(entry) && face !== 'timeline' && face !== 'tray') {
        feLog('fe softPad.setSoftPadFace skip-no-map ' + face);
        syncFaceChrome(entry);
        return;
      }
    }
    if (face === 'agent' || prevFace === 'agent') ++agentLoadToken;
    softPadFace = face;
    if (face === 'pad') {
      var mode = opts.padMode || lastSoftPadPadMode || 'appear';
      if (!VALID_SOFT_PAD_PAD_MODES[mode]) mode = 'appear';
      softPadPadMode = mode;
      rememberSoftPadPadMode(mode);
    }
    if (hasMapping(entry)) {
      ensureSoftPadConfig(entry, { persist: !!opts.fromUser });
      adoptSoftPadSelection(entry);
    }
    try {
      var Pad = global.OneToneCodexMicroPadUi;
      if (Pad && Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
    } catch (_) {}
    closeRingFloat();
    syncFaceChrome(entry);
    if (face === 'tray') {
      dismissSoftPadOverlay('tray');
      var trayUi = global.OneToneSoftPadTrayUi;
      if (trayUi && trayUi.onFaceEnter) try { trayUi.onFaceEnter(); } catch (_) {}
      return;
    }
    if (face === 'timeline') {
      dismissSoftPadOverlay('timeline');
      writeSoftPadTimelinePanel(null);
      ensureSoftPadPreview(entry);
      return;
    }
    if (face === 'agent') {
      paintSubpage(entry, { forceRemount: true });
      ensureSoftPadPreview(entry);
      renderSchemeList();
      return;
    }
    // pad face
    paintSubpage(entry, { forceRemount: true });
    ensureSoftPadPreview(entry);
  }

  function setSoftPadPadMode(mode, opts) {
    opts = opts || {};
    mode = String(mode || '');
    if (!VALID_SOFT_PAD_PAD_MODES[mode]) return;
    if (softPadFace !== 'pad') {
      setSoftPadFace('pad', Object.assign({}, opts, { padMode: mode }));
      return;
    }
    if (!opts.fromUser && mode === 'keys' && Date.now() < softPadLandUntil) {
      feLog('fe softPad.setSoftPadPadMode suppress-keys');
      return;
    }
    var entry = resolveSoftPadEntry();
    if (!hasMapping(entry)) {
      var scopeKind = String(selectedScopeId || '').trim();
      if (isHubSoftPadKind(scopeKind)) {
        var prepared = prepareAppFromUi(appIdForKind(scopeKind), scopeKind);
        if (prepared) entry = resolveSoftPadEntry();
      }
      if (!hasMapping(entry)) {
        feLog('fe softPad.setSoftPadPadMode skip-no-map ' + mode);
        return;
      }
    }
    ensureSoftPadConfig(entry, { persist: !!opts.fromUser });
    adoptSoftPadSelection(entry);
    if (mode === softPadPadMode) {
      syncFaceChrome(entry);
      if (!softPadSubpageAlreadyPainted(entry, softPadPanelId())) {
        paintSubpage(entry, { forceRemount: true });
      }
      ensureSoftPadPreview(entry);
      return;
    }
    try {
      var Pad = global.OneToneCodexMicroPadUi;
      if (Pad && Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
    } catch (_) {}
    softPadPadMode = mode;
    rememberSoftPadPadMode(mode);
    syncFaceChrome(entry);
    paintSubpage(entry, { forceRemount: true });
    ensureSoftPadPreview(entry);
  }

  /** Thin adapter: legacy panel ids → face/mode. */
  function openSubpage(view, openOpts) {
    openOpts = openOpts || {};
    var route = legacyViewToRoute(view);
    if (!route || !route.face) return;
    if (route.face === 'pad') {
      var nextMode = route.mode || 'appear';
      if (softPadFace === 'pad' && softPadPadMode === nextMode) return;
      if (softPadFace !== 'pad') {
        setSoftPadFace('pad', Object.assign({}, openOpts, { padMode: nextMode }));
      } else {
        setSoftPadPadMode(nextMode, openOpts);
      }
      return;
    }
    if (softPadFace === route.face) return;
    setSoftPadFace(route.face, openOpts);
  }

  function closeSubpage() {
    var fromFace = softPadFace;
    var fromMode = softPadPadMode;
    feLog('fe softPad.closeSubpage from=' + fromFace + '/' + fromMode);
    var entry = resolveSoftPadEntry();
    if (hasMapping(entry)) adoptSoftPadSelection(entry);
    if (fromFace === 'pad' && fromMode !== 'appear') {
      setSoftPadPadMode('appear');
      return;
    }
    if (fromFace === 'agent' || fromFace === 'timeline') {
      if (fromFace === 'timeline') {
        var tmClose = global.OneToneSoftPadTimeMachine;
        if (tmClose) tmClose.closeDesk();
      }
      setSoftPadFace('pad', { padMode: 'appear' });
      return;
    }
  }

  function markActiveRow(mappingId) {
    var e = els();
    if (!e.list) return;
    e.list.querySelectorAll('.keys-hub-scheme-row').forEach(function (row) {
      var kind = row.getAttribute('data-app-kind') || '';
      var on = kind === String(selectedScopeId || '');
      row.classList.toggle('is-editing', on);
      var main = row.querySelector('[data-scheme-select], [data-scheme-prepare]');
      if (main) main.setAttribute('aria-current', on ? 'true' : 'false');
      var actions = row.querySelector('.keys-hub-scheme-actions');
      if (!actions) return;
      var editing = actions.querySelector('.keys-hub-scheme-editing');
      if (on && !editing) {
        var span = document.createElement('span');
        span.className = 'keys-hub-scheme-editing';
        span.textContent = t('keysWorkflowEditing', '编辑中');
        actions.insertBefore(span, actions.firstChild);
      } else if (!on && editing) {
        editing.remove();
      }
    });
  }

  function appSwitcherChipView(scope) {
    var active = scope.id === String(selectedScopeId || '');
    var icon = iconHtml(scope.kind, 'soft-pad-app-chip-icon');
    return (
      '<button type="button" class="soft-pad-app-chip' +
      (active ? ' is-active' : '') +
      (scope.padEnabled ? '' : ' is-off') +
      (scope.canPrepare ? ' is-prepare' : '') +
      '" role="tab" data-scope="' + esc(scope.id) + '"' +
      (scope.appId ? ' data-app-id="' + esc(scope.appId) + '"' : '') +
      ' aria-controls="softPadHubStage"' +
      ' aria-selected="' + (active ? 'true' : 'false') + '"' +
      ' title="' + esc(scope.title) + '">' +
      icon +
      '<span>' + esc(scope.title) + '</span>' +
      '</button>'
    );
  }

  function buildSoftPadWorkflowModel() {
    var scopes = listAppScopes();
    var entries = listAsideEntries();
    pruneInvalidUserLanePin(listSoftPadSchemes());
    // Apps live in status-bar bind control; purpose chips live on pad ring.
    var chips = scopes.map(function (scope) {
      return { id: scope.id, html: appSwitcherChipView(scope) };
    });
    return {
      switcherHidden: false,
      switcherLabel: t('softPadAppSwitcherAria', '应用虚拟键盘'),
      switcherChips: chips,
      schemeTitle: t('softPadSchemeTitle', '选应用'),
      schemeCount: String(entries.length),
      schemeRows: entries.map(function (entry) {
        var rowId = entry.mapping && entry.mapping.id ? String(entry.mapping.id) : String(entry.kind || '');
        return { id: rowId, html: renderSchemeRow(entry) };
      }),
      emptyHtml: entries.length
        ? ''
        : t('softPadHubEmptyTitle', '还没有可管理的虚拟键盘'),
      supportRange: t(
        'softPadHubSupportRange',
        '支持 Codex、Claude、Cursor，以及 WorkBuddy / Trae Work / Trae Code / Qoder（Shell Hook · Shortcuts）'
      ),
    };
  }

  function renderAppSwitcher() {
    var e = els();
    if (!e.switcher) return;
    var model = buildSoftPadWorkflowModel();
    if (global.__otSoftPadWorkflowMounted && typeof global.__otSoftPadWorkflowSync === 'function') {
      e.switcher.hidden = model.switcherHidden;
      global.__otSoftPadWorkflowSync();
      syncBindAppControl();
      return;
    }
    e.switcher.hidden = model.switcherHidden;
    if (model.switcherHidden) {
      e.switcher.innerHTML = '';
    } else {
      e.switcher.innerHTML = '<div class="soft-pad-app-switcher__chips" role="tablist">' +
        model.switcherChips.map(function (c) { return c.html; }).join('') +
        '</div>';
    }
    syncBindAppControl();
  }

  function handleFollowChipClick(_el) {
    return false;
  }

  /** P14e：SoftPad 预览宿主模型（单一来源）。 */
  function buildSoftPadPreviewModel() {
    var entry = resolveSoftPadEntry();
    var panelModel = buildSoftPadFourPanelModel(entry);
    var has = !!panelModel.hasMapping;
    var mappingId = panelModel.mappingId || '';
    var view = softPadPanelId();
    var canPaint = true; // all faces show Soft Pad preview (C3 timeline included)
    var force = !!previewForceOnce;
    var previewEmpty = panelModel.previewEmpty || resolvePreviewEmpty(entry, view);
    var emptyReason = previewEmpty === 'ready' || previewEmpty === 'none' ? '' : previewEmpty;
    var emptyHtml = emptyReason ? buildPreviewEmptyHtml(emptyReason) : '';
    var hidden = !has && !emptyHtml;
    var clear = !has;
    var collapsed = false;
    var skipPaint = false;
    var light = softPadFace !== 'pad' || softPadPadMode !== 'keys';
    if (has && !force) {
      if (!canPaint) skipPaint = true;
      else if (light && paintedMappingId === mappingId) {
        var host = previewHostForFace();
        if (host && host.querySelector('.codex-micro-pad.soft-pad-preview')) {
          skipPaint = true;
        }
      }
    }
    var sig = [
      mappingId,
      softPadFace,
      softPadPadMode,
      hidden ? '1' : '0',
      clear ? '1' : '0',
      force ? '1' : '0',
      skipPaint ? '1' : '0',
      view,
      previewEmpty,
      emptyHtml,
      String(previewEpoch || 0),
      String(paintedMappingId || '')
    ].join('\0');
    return {
      mappingId: mappingId,
      hidden: hidden,
      collapsed: collapsed,
      clear: clear,
      force: force,
      skipPaint: skipPaint,
      view: view,
      face: softPadFace,
      padMode: softPadPadMode,
      previewEmpty: previewEmpty,
      emptyReason: emptyReason,
      emptyHtml: emptyHtml,
      epoch: previewEpoch || 0,
      sig: sig
    };
  }

  function applySoftPadPreviewHost(model) {
    var host = previewHostForFace();
    if (!host) return;
    if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
      global.__otSoftPadPreviewSync();
      return;
    }
    if (!model) model = buildSoftPadPreviewModel();
    host.hidden = !!model.hidden;
    host.classList.toggle('is-collapsed', !!model.collapsed);
    if (model.clear) {
      if (model.emptyHtml) {
        host.innerHTML = model.emptyHtml;
        return;
      }
      host.replaceChildren();
      return;
    }
    if (model.skipPaint && model.emptyHtml && model.emptyReason === 'unavailable') {
      var paint = host.querySelector('[data-soft-pad-preview-paint]') || host;
      if (paint && !paint.querySelector('.codex-micro-pad.soft-pad-preview')) {
        paint.innerHTML = model.emptyHtml;
      }
    }
  }

  function getSelectedSoftPadMappingForPreview() {
    var entry = resolveSoftPadEntry();
    return hasMapping(entry) ? entry.mapping : null;
  }

  function paintPreview(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) {
      paintedMappingId = null;
      if (softPadFace === 'pad' && global.__otSoftPadPreviewMounted &&
          typeof global.__otSoftPadPreviewSync === 'function') {
        previewForceOnce = true;
        applySoftPadPreviewHost(buildSoftPadPreviewModel());
      }
      return;
    }
    if (paintReentry > 0) return;
    var light = softPadFace !== 'pad' || softPadPadMode !== 'keys';
    var host = previewHostForFace();
    if (!host) return;
    // Light pages: paint once when empty/stale — avoid remount loops (假死).
    if (light && !opts.force) {
      var hasPrev = !!host.querySelector('.codex-micro-pad.soft-pad-preview');
      if (hasPrev && paintedMappingId === String(entry.mapping.id)) return;
    }

    // Preview island only owns #softPadPreviewHost. Agent/timeline faces paint directly.
    var useIsland = softPadFace === 'pad' &&
      global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function';
    if (useIsland) {
      previewForceOnce = !!opts.force;
      paintReentry++;
      try {
        if (typeof global.__otSoftPadPreviewForce === 'function' && opts.force) {
          global.__otSoftPadPreviewForce();
        } else {
          applySoftPadPreviewHost(buildSoftPadPreviewModel());
        }
        if (host.querySelector('.codex-micro-pad.soft-pad-preview')) {
          paintedMappingId = String(entry.mapping.id);
        } else if (opts.force) {
          var PadFallback = global.OneToneCodexMicroPadUi;
          if (PadFallback && PadFallback.renderSoftPadPreview) {
            var paintEl = host.querySelector('[data-soft-pad-preview-paint]') || host;
            PadFallback.renderSoftPadPreview(paintEl, entry.mapping, { forceFull: true });
            host.hidden = false;
            if (host.querySelector('.codex-micro-pad.soft-pad-preview')) {
              paintedMappingId = String(entry.mapping.id);
            }
          }
        }
      } finally {
        paintReentry--;
        previewForceOnce = false;
      }
      return;
    }

    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && Pad.renderSoftPadPreview) {
      paintReentry++;
      try {
        host.hidden = false;
        host.removeAttribute('hidden');
        Pad.renderSoftPadPreview(host, entry.mapping, { forceFull: true });
        if (host.querySelector('.codex-micro-pad.soft-pad-preview')) {
          paintedMappingId = String(entry.mapping.id);
        }
        if (entry.mapping && entry.mapping.codexMicroPad) {
          applyScreenOpacityToPreview(entry.mapping.codexMicroPad.screenOpacity);
        }
        if (softPadFace === 'agent' && Pad.syncStatusLightsPreviewChrome) {
          var subtab = Pad.getSoftPadLightsSubtab ? Pad.getSoftPadLightsSubtab() : 'topbar';
          Pad.syncStatusLightsPreviewChrome(host, entry.mapping, entry.mapping.codexMicroPad, { subtab: subtab });
        }
      } finally {
        paintReentry--;
      }
    }
  }

  /** Ensure Soft Pad preview exists on active face host. */
  function ensureSoftPadPreview(entry) {
    if (!hasMapping(entry)) return;
    // Non-pad faces always force — island cannot fill agent/tm hosts.
    paintPreview(entry, softPadFace === 'pad' ? undefined : { force: true });
  }

  /** Single cancelable preview queue (keys-mode refresh). Uses previewEpoch, not selectToken. */
  function schedulePreviewPaint(entry) {
    if (!hasMapping(entry)) return;
    if (softPadFace !== 'pad' || softPadPadMode !== 'keys') return;
    var token = ++previewEpoch;
    var mapId = String(entry.mapping.id);
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      previewTimer = 0;
      if (token !== previewEpoch) return;
      if (softPadFace !== 'pad' || softPadPadMode !== 'keys') return;
      if (String(getSelectedMappingId() || '') !== mapId) return;
      var cur = findEntry(mapId);
      if (!hasMapping(cur)) return;
      paintPreview(cur, { force: true });
    }, 0);
  }

  function boundKeyCount(entry) {
    var pad = entry && entry.mapping && entry.mapping.codexMicroPad;
    if (!pad || !Array.isArray(pad.keys)) return 0;
    var n = 0;
    pad.keys.forEach(function (k) {
      if (k && k.enabled !== false && String(k.slotId || '').trim()) n++;
    });
    return n;
  }

  function patchAppSwitcher() {
    var e = els();
    if (!e.switcher) return false;
    var chips = e.switcher.querySelectorAll('[data-scope]');
    if (!chips.length) return false;
    chips.forEach(function (chip) {
      var on = chip.getAttribute('data-scope') === String(selectedScopeId || '');
      chip.classList.toggle('is-active', on);
      chip.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    return true;
  }

  function syncScopeChrome(entry, opts) {
    opts = opts || {};
    updateStatusBar(entry);
    updateScopeHint();
    if (opts.rebuildSwitcher || !patchAppSwitcher()) {
      renderAppSwitcher();
    }
    markActiveRow(entry && entry.mapping ? entry.mapping.id : getSelectedMappingId());
    syncFaceChrome(entry);
  }

  function paintMain(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) {
      renderEmptyMain();
      return;
    }
    hideEmpty();
    setSelectedMappingId(String(entry.mapping.id));
    if (softPadFace === 'pad' && softPadPadMode === 'keys') {
      paintPreview(entry);
      syncFaceChrome(entry);
      var body = els().subBody;
      var layoutReady = body &&
        body.getAttribute('data-soft-pad-panel') === 'layout' &&
        body.getAttribute('data-soft-pad-mapping') === String(entry.mapping.id);
      if (!layoutReady) paintSubpage(entry);
    } else if (softPadFace === 'timeline') {
      syncFaceChrome(entry);
      writeSoftPadTimelinePanel(null);
      ensureSoftPadPreview(entry);
    } else {
      syncFaceChrome(entry);
      ensureSoftPadPreview(entry);
      paintSubpage(entry);
    }
  }

  function flushPaint(entry, opts) {
    if (paintBusy) {
      pendingPaintEntry = entry;
      pendingPaintOpts = opts || {};
      return;
    }
    paintBusy = true;
    var t0 = Date.now();
    try {
      paintMain(entry, opts);
    } catch (err) {
      feLog('fe softPad.paintMain error ' + (err && err.message ? err.message : 'unknown'));
      throw err;
    } finally {
      paintBusy = false;
      feLog('fe softPad.paintMain ' + (Date.now() - t0) + 'ms map=' +
        (entry && entry.mapping ? entry.mapping.id : ''));
      if (pendingPaintEntry) {
        var pe = pendingPaintEntry;
        var po = pendingPaintOpts || {};
        pendingPaintEntry = null;
        pendingPaintOpts = null;
        requestAnimationFrame(function () {
          if (!hasMapping(pe)) return;
          if (String(getSelectedMappingId()) !== String(pe.mapping.id)) return;
          flushPaint(pe, po);
        });
      }
    }
  }

  function schedulePaint(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) return;
    var token = ++selectToken;
    hideEmpty();
    setSelectedMappingId(String(entry.mapping.id));
    // Chrome-first: status / chips / aside highlight — never block on pad remount.
    syncScopeChrome(entry, { rebuildSwitcher: true });

    if (opts.previewOnly) return;
    if (softPadFace === 'timeline') {
      writeSoftPadTimelinePanel(null);
      ensureSoftPadPreview(entry);
      return;
    }
    var panel = softPadPanelId();
    // Defer subpage paint one frame so app-chip active state can paint first.
    if (panel === 'presentation' || panel === 'runtime' || panel === 'agent' ||
        panel === 'layout' || panel === 'purpose') {
      requestAnimationFrame(function () {
        if (token !== selectToken) return;
        if (String(getSelectedMappingId()) !== String(entry.mapping.id)) return;
        paintSubpage(entry, {
          forceRemount: !!opts.forceRemount || panel === 'agent'
        });
        if (panel === 'layout') {
          if (selectTimer) clearTimeout(selectTimer);
          selectTimer = setTimeout(function () {
            selectTimer = 0;
            if (token !== selectToken) return;
            if (String(getSelectedMappingId()) !== String(entry.mapping.id)) return;
            requestAnimationFrame(function () {
              if (token !== selectToken) return;
              if (paintBusy) {
                pendingPaintEntry = entry;
                pendingPaintOpts = opts;
                return;
              }
              flushPaint(entry, { previewOnly: false });
            });
          }, opts.immediateMgr ? 0 : 16);
          return;
        }
        ensureSoftPadPreview(entry);
      });
      return;
    }

    if (selectTimer) clearTimeout(selectTimer);
    var delay = opts.immediateMgr ? 0 : 16;
    selectTimer = setTimeout(function () {
      selectTimer = 0;
      if (token !== selectToken) return;
      if (String(getSelectedMappingId()) !== String(entry.mapping.id)) return;
      requestAnimationFrame(function () {
        if (token !== selectToken) return;
        if (paintBusy) {
          pendingPaintEntry = entry;
          pendingPaintOpts = opts;
          return;
        }
        flushPaint(entry, { previewOnly: false });
      });
    }, delay);
  }

  function selectScheme(mappingId, opts) {
    opts = opts || {};
    var id = String(mappingId || '');
    if (!id) return;

    ++agentLoadToken;
    var entry = findEntry(id);
    if (!entry) {
      var entries = listSoftPadSchemes();
      entry = entries[0] || null;
    }
    if (!entry) {
      setSelectedMappingId(null);
      selectedScopeId = 'codex';
      resetSoftPadRouteToPadAppear();
      renderSchemeList();
      renderEmptyMain();
      return;
    }

    if (opts.scopeId) {
      selectedScopeId = String(opts.scopeId);
    } else if (opts.fromList || !selectedScopeId) {
      selectedScopeId = entry.kind;
    }

    if (opts.resetView !== false) {
      // Stay on Time Machine unless caller forces another Soft Pad tile.
      if (softPadFace === 'timeline' && !(opts.forceView && opts.forceView !== 'timeline')) {
        /* keep timeline */
      } else {
        var land = defaultDetailView(opts);
        var route = legacyViewToRoute(land);
        softPadFace = route.face;
        softPadPadMode = route.mode || 'appear';
        rememberSoftPadPadMode(softPadPadMode);
      }
    }

    var sameMap = id === String(getSelectedMappingId() || '');
    var hostsOk = !hostsNeedPaint(entry);

    // Same mapping (e.g. 全局 ↔ Codex 共用) or already painted: chrome + skip pad remount.
    if (sameMap && hostsOk && !opts.forceRemount) {
      syncScopeChrome(entry, { rebuildSwitcher: !!opts.rebuildList });
      if (opts.rebuildList) renderSchemeList();
      renderFuncTiles(entry);
      paintSubpage(entry, softPadFace === 'agent' ? { forceRemount: true } : undefined);
      if (!(softPadFace === 'pad' && softPadPadMode === 'keys')) ensureSoftPadPreview(entry);
      return;
    }

    setSelectedMappingId(String(entry.mapping.id));
    if (opts.rebuildList) renderSchemeList();
    else markActiveRow(getSelectedMappingId());

    schedulePaint(entry, {
      forceRemount: !!opts.forceRemount || !hostsOk,
      immediateMgr: !!opts.immediateMgr,
      previewOnly: !!opts.previewOnly
    });
    if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
      try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
    }
  }

  function selectScope(scopeId, opts) {
    opts = opts || {};
    var scope = findScope(scopeId);
    if (!scope) {
      resetSoftPadRouteToPadAppear();
      clearSubpage();
      renderEmptyMain();
      return;
    }

    selectedScopeId = String(scope.id);
    setBindAppMenuOpen(false);

    // Same path as the (removed) aside list — proven to switch Codex/Claude/Cursor.
    // Pad-centric: switching bind app keeps current Hero/panel (resetView defaults false).
    if (scope.mapping && scope.mapping.id) {
      selectScheme(String(scope.mapping.id), {
        fromList: true,
        scopeId: selectedScopeId,
        rebuildList: !!opts.rebuildList,
        forceRemount: !!opts.forceRemount || softPadFace === 'agent',
        resetView: opts.resetView === true,
        previewOnly: false
      });
      renderAppSwitcher();
      updateScopeHint();
      syncSoftPadPadRing();
      return;
    }

    ++selectToken;
    ++agentLoadToken;
    resetSoftPadRouteToPadAppear();
    clearSubpage();
    showPrepareMain(scope);
    renderAppSwitcher();
    updateScopeHint();
    syncSoftPadPadRing();
    requestOverlayUsageForScope(selectedScopeId);
  }

  function openShellHookConnect(kind) {
    kind = String(kind || '').trim();
    var low = kind.toLowerCase();
    if (low === 'traecode') kind = 'traeCode';
    else kind = low;
    // Trae Work (trae) is SOLO — Hook connect only for Trae Code / WorkBuddy / Qoder.
    if (kind !== 'workbuddy' && kind !== 'traeCode' && kind !== 'qoder') return;
    selectScope(kind, { fromUser: true, rebuildList: true, forceRemount: true });
    setSoftPadFace('agent', { fromUser: true });
  }

  function renderSchemeRow(entry) {
    var hasMap = !!(entry.mapping && entry.mapping.id);
    var active = false;
    if (hasMap) {
      active = String(getSelectedMappingId() || '') === String(entry.mapping.id);
    } else if (entry.canPrepare && selectedScopeId === entry.kind) {
      active = true;
    }
    var tag = statusTag(entry);
    var pair = entry.canPrepare
      ? t('softPadHubStatusCanPrepare', '可准备')
      : (t('softPadSchemeSoftPad', '虚拟键盘') + ' · ' + presentationLabel(entry.presentation));
    var steps = hasMap ? (boundKeyCount(entry) + '/15') : '—';
    var icon = iconHtml(entry.kind, 'soft-pad-scheme-leading-icon');
    var selectAttr = hasMap
      ? ' data-scheme-select="' + esc(entry.mapping.id) + '"'
      : ' data-scheme-prepare="' + esc(entry.appId || appIdForKind(entry.kind)) + '" data-scheme-kind="' + esc(entry.kind) + '"';
    return (
      '<div class="keys-hub-scheme-row soft-pad-scheme-row is-app-' + esc(entry.kind) +
      (active ? ' is-editing' : '') +
      (!entry.padEnabled ? ' is-disabled-scheme' : '') +
      (entry.canPrepare || tag.cls === 'is-draft' ? ' is-draft' : '') +
      '" role="listitem"' +
      (hasMap ? ' data-scheme-id="' + esc(entry.mapping.id) + '"' : '') +
      ' data-app-kind="' + esc(entry.kind) + '">' +
      '<button type="button" class="keys-hub-scheme-main"' + selectAttr +
      ' aria-current="' + (active ? 'true' : 'false') + '">' +
      icon +
      '<span class="keys-hub-scheme-copy">' +
      '<span class="keys-hub-scheme-name">' + esc(entry.title) + '</span>' +
      '<span class="keys-hub-scheme-pair">' + esc(pair) + '</span>' +
      '</span>' +
      '<span class="keys-hub-scheme-tag ' + esc(tag.cls) + '">' + esc(tag.text) + '</span>' +
      '<span class="keys-hub-scheme-steps">' + esc(steps) + '</span>' +
      '</button>' +
      '<div class="keys-hub-scheme-actions">' +
      (active ? '<span class="keys-hub-scheme-editing">' + esc(t('keysWorkflowEditing', '编辑中')) + '</span>' : '') +
      (hasMap
        ? ('<button type="button" class="toggle-switch keys-hub-scheme-toggle' +
          (entry.padEnabled ? ' is-on' : '') +
          '" data-scheme-enable="' + esc(entry.mapping.id) +
          '" role="switch" aria-checked="' + (entry.padEnabled ? 'true' : 'false') +
          '" aria-label="' + esc(statusLabel(entry)) + '"></button>')
        : ('<button type="button" class="keys-hub-scheme-add soft-pad-prepare-btn" data-scheme-prepare="' +
          esc(entry.appId || appIdForKind(entry.kind)) + '" data-scheme-kind="' + esc(entry.kind) + '">' +
          esc(t('softPadHubPrepareShort', '准备')) + '</button>')) +
      '</div></div>'
    );
  }

  function foregroundAppLabel(appId) {
    appId = String(appId || '').trim();
    if (!appId) return t('softPadFgUnknown', '未知');
    var kind = kindForAppId(appId);
    if (kind) return appTitleFor(kind);
    var P = global.OneToneAppTargetPresets;
    var preset = P && P.presetById ? P.presetById(appId) : null;
    if (preset && preset.title) return String(preset.title);
    var slash = appId.lastIndexOf('/');
    if (slash >= 0 && slash < appId.length - 1) return appId.slice(slash + 1);
    return appId;
  }

  function renderForegroundAppBarHtml() {
    var ctx = laneContextFromRuntime();
    var fg = String(ctx.foregroundAppId || '').trim();
    if (!fg) return '';
    var fgKind = kindForAppId(fg);
    var fgTitle = foregroundAppLabel(fg);
    var scope = String(selectedScopeId || '');
    var switchHtml = '';
    if (fgKind && fgKind !== scope && isHubSoftPadKind(fgKind)) {
      switchHtml =
        '<button type="button" class="soft-pad-scheme-fg__switch" data-act="fg-switch-scope" data-scope="' +
        esc(fgKind) + '">' +
        esc(t('softPadFgSwitch', '切换到 {name}').replace('{name}', appTitleFor(fgKind))) +
        '</button>';
    }
    return (
      '<div class="soft-pad-scheme-fg" data-soft-pad-scheme-fg="1">' +
      '<p class="soft-pad-scheme-fg__label">' + esc(t('softPadSchemeFgTitle', '识别应用')) + '</p>' +
      '<p class="soft-pad-scheme-fg__app">' +
      esc(t('softPadSchemeFgLine', '前台：{name}').replace('{name}', fgTitle)) +
      '</p>' +
      switchHtml +
      '</div>'
    );
  }

  function renderSchemeList() {
    var e = els();
    if (!e.list) return;
    if (global.__otSoftPadWorkflowMounted && typeof global.__otSoftPadWorkflowSync === 'function') {
      // P14b owns title/count/aside via SoftPadSchemeListIsland — do not dual-write.
      global.__otSoftPadWorkflowSync();
      return;
    }
    if (e.titleLbl) e.titleLbl.textContent = t('softPadSchemeTitle', '选应用');
    if (e.aside) e.aside.setAttribute('aria-label', t('softPadSchemeFgTitle', '识别应用'));
    var entries = listAsideEntries();
    if (e.count) e.count.textContent = String(entries.length);
    var fgBar = softPadFace === 'agent' ? renderForegroundAppBarHtml() : '';
    if (!entries.length) {
      e.list.innerHTML = fgBar + '<p class="keys-hub-empty">' +
        esc(t('softPadHubEmptyTitle', '还没有可管理的虚拟键盘')) + '</p>';
      return;
    }
    e.list.innerHTML = fgBar +
      '<div class="keys-hub-scheme-group">' +
      entries.map(renderSchemeRow).join('') +
      '</div>';
  }

  function buildSoftPadEnsureCtaModel() {
    var label = '+ ' + t('softPadHubEnsureCodex', '准备 Codex 虚拟键盘');
    return { label: label, sig: label };
  }

  function applySoftPadEnsureCtaHost(model) {
    if (global.__otSoftPadEnsureCtaMounted && typeof global.__otSoftPadEnsureCtaSync === 'function') {
      global.__otSoftPadEnsureCtaSync();
      return;
    }
    if (!model) model = buildSoftPadEnsureCtaModel();
    var e = els();
    if (e.ensureBtn) e.ensureBtn.textContent = model.label || '';
  }

  function ensureCodex() {
    prepareAppFromUi('codex-chat', 'codex');
  }

  function prepareAppFromUi(appId, kind) {
    kind = kind || kindForAppId(appId);
    var m = ensureAppSoftPad(appId, kind);
    if (!m) {
      toastPad(t('softPadPrepareFail', '准备失败：未能创建应用场景'));
      return null;
    }
    selectedScopeId = kind || 'codex';
    lastSoftPadPadMode = 'appear';
    renderSchemeList();
    selectScheme(m.id, {
      force: true,
      forceRemount: true,
      scopeId: selectedScopeId,
      rebuildList: true,
      firstPrepare: true
    });
    return m;
  }

  function applyEnabledUi(entry) {
    if (!entry) return;
    applyRuntimeFlagsToEntry(entry);
    pruneInvalidUserLanePin(listSoftPadSchemes());
    updateStatusBar(entry);
    patchSchemeRowEnable(entry);
    if (!patchAppSwitcher()) renderAppSwitcher();
    updateScopeHint();
    if (softPadFace === 'pad' &&
        (softPadPadMode === 'appear' || softPadPadMode === 'purpose')) {
      syncRuntimeCheckboxes(entry);
    }
    if (softPadFace === 'pad' && softPadPadMode === 'keys') {
      schedulePreviewPaint(entry);
    }
  }

  function toastPad(msg) {
    var toast = global.OneToneToast;
    if (toast && toast.show) {
      try { toast.show(msg); } catch (_) {}
    }
  }

  function setPadEnabled(m, enabled) {
    if (!m) return null;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!m.codexMicroPad && Pad && Pad.renderSoftPadPreview) {
      Pad.renderSoftPadPreview(document.createElement('div'), m);
    }
    if (!m.codexMicroPad) return null;
    var prevEnabled = !!m.codexMicroPad.enabled;
    var prevOverlay = !!m.codexMicroPad.overlayEnabled;
    m.codexMicroPad.enabled = !!enabled;
    if (m.codexMicroPad.enabled) m.codexMicroPad.overlayEnabled = true;
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return null;
    return invoke('cmd_codex_micro_pad_set_flags', {
      mappingId: String(m.id),
      enabled: !!m.codexMicroPad.enabled,
      requireNumLockOff: !!m.codexMicroPad.requireNumLockOff,
      overlayEnabled: !!m.codexMicroPad.overlayEnabled,
      requireForeground: m.codexMicroPad.requireForeground !== false,
      navKeysEnabled: m.codexMicroPad.showNavigationPad !== false && m.codexMicroPad.navKeysEnabled !== false
    }).catch(function () {
      m.codexMicroPad.enabled = prevEnabled;
      m.codexMicroPad.overlayEnabled = prevOverlay;
      var entry = findEntry(m.id);
      if (entry) {
        entry.mapping = m;
        applyEnabledUi(entry);
      }
      toastPad(t('softPadEnableFail', '启用状态同步失败，已回滚'));
      var p = global.OneToneConfigPersist;
      if (p && p.saveAsync) p.saveAsync();
      else if (p && p.save) p.save();
    });
  }

  function toggleSelectedEnable() {
    var entry = findEntry(getSelectedMappingId());
    if (!entry || !entry.mapping || !entry.mapping.codexMicroPad) return;
    var next = !entry.mapping.codexMicroPad.enabled;
    setPadEnabled(entry.mapping, next);
    entry.padEnabled = next;
    applyEnabledUi(entry);
  }

  function toggleRowEnable(mappingId) {
    var entry = findEntry(mappingId);
    if (!entry || !entry.mapping) return;
    var pad = entry.mapping.codexMicroPad;
    var next = !(pad && pad.enabled);
    setPadEnabled(entry.mapping, next);
    entry.padEnabled = next;
    pruneInvalidUserLanePin(listSoftPadSchemes());
    if (String(getSelectedMappingId()) === String(mappingId)) {
      applyEnabledUi(entry);
    } else {
      patchSchemeRowEnable(entry);
      if (!patchAppSwitcher()) renderAppSwitcher();
      updateScopeHint();
    }
  }

  function isAgentPanelCurrent(token, mappingId) {
    if (softPadFace !== 'agent') return false;
    if (token != null && Number(token) !== Number(agentLoadToken)) return false;
    if (mappingId != null && String(mappingId) !== String(getSelectedMappingId() || '')) return false;
    var ui = global.OneToneState && global.OneToneState.ui;
    if (ui) {
      if (ui.drawerOpen === false) return false;
      if (ui.settingsPanel && ui.settingsPanel !== 'softPad') return false;
    }
    return true;
  }

  var switcherClickBound = false;
  function ensureSwitcherClickBound() {
    if (switcherClickBound) return;
    var sw = els().switcher;
    if (!sw) return;
    switcherClickBound = true;
    function onSwitcherActivate(ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      // App chips first (same selection path as former aside list).
      var chip = t.closest('[data-scope]');
      if (chip) {
        if (ev.type === 'click') {
          ev.preventDefault();
          ev.stopPropagation();
        }
        selectScope(chip.getAttribute('data-scope'), { fromUser: true });
        return;
      }
      var purposeEl = t.closest('[data-pad-purpose]');
      if (purposeEl && handlePurposeChipClick(purposeEl) && ev.type === 'click') {
        ev.preventDefault();
        ev.stopPropagation();
      }
    }
    // Capture phase — beat any leftover island handlers; click is enough once legacy owns DOM.
    sw.addEventListener('click', onSwitcherActivate, true);
  }

  function bindChrome() {
    if (chromeBound) return;
    chromeBound = true;
    var e = els();
    var scanBtn = document.getElementById('softPadScanBtn');
    if (scanBtn && !scanBtn.__otScanBound) {
      scanBtn.__otScanBound = true;
      scanBtn.addEventListener('click', function () {
        refreshHubInventory({ prepareHigh: true });
      });
    }
    // Always bind on the host — island may remount HTML, but bubble still hits #softPadAppSwitcher.
    // (React onClick on dangerouslySetInnerHTML is unreliable in WebView2.)
    ensureSwitcherClickBound();
    if (e.tiles) {
      e.tiles.addEventListener('click', function (ev) {
        var tile = ev.target.closest && ev.target.closest('[data-tile]');
        if (!tile || tile.disabled || tile.getAttribute('aria-disabled') === 'true') return;
        openSubpage(tile.getAttribute('data-tile'), { fromUser: true });
      });
    }
    if (e.preview) {
      e.preview.addEventListener('click', function (ev) {
        var prep = ev.target.closest && ev.target.closest('[data-soft-pad-prepare-cta]');
        if (!prep) return;
        ev.preventDefault();
        prepareAppFromUi(
          prep.getAttribute('data-soft-pad-prepare-cta'),
          prep.getAttribute('data-scheme-kind')
        );
      });
    }
    // Agent / timeline preview hosts share the same prepare-CTA handler.
    [e.agentPreview, e.tmPreview].forEach(function (host) {
      if (!host) return;
      host.addEventListener('click', function (ev) {
        var prep = ev.target.closest && ev.target.closest('[data-soft-pad-prepare-cta]');
        if (!prep) return;
        ev.preventDefault();
        prepareAppFromUi(
          prep.getAttribute('data-soft-pad-prepare-cta'),
          prep.getAttribute('data-scheme-kind')
        );
      });
    });
    if (e.padTabs) {
      e.padTabs.addEventListener('click', function (ev) {
        var tab = ev.target.closest && ev.target.closest('[data-pad-mode]');
        if (!tab || tab.disabled) return;
        ev.preventDefault();
        setSoftPadPadMode(tab.getAttribute('data-pad-mode'), { fromUser: true });
      });
    }
    if (e.subBack && !(global.__otSoftPadDetailChromeMounted)) {
      e.subBack.addEventListener('click', function () { closeSubpage(); });
    }
    if (e.list) {
      e.list.addEventListener('click', function (ev) {
        var fgBtn = ev.target.closest && ev.target.closest('[data-act="fg-switch-scope"]');
        if (fgBtn) {
          ev.preventDefault();
          selectScope(fgBtn.getAttribute('data-scope'), { fromUser: true, rebuildList: true });
          return;
        }
        var prep = ev.target.closest && ev.target.closest('[data-scheme-prepare]');
        if (prep) {
          ev.preventDefault();
          ev.stopPropagation();
          prepareAppFromUi(
            prep.getAttribute('data-scheme-prepare'),
            prep.getAttribute('data-scheme-kind')
          );
          return;
        }
        var en = ev.target.closest && ev.target.closest('[data-scheme-enable]');
        if (en) {
          ev.preventDefault();
          ev.stopPropagation();
          toggleRowEnable(en.getAttribute('data-scheme-enable'));
          return;
        }
        var btn = ev.target.closest && ev.target.closest('[data-scheme-select]');
        if (!btn) return;
        var row = btn.closest('[data-app-kind]');
        var kind = row && row.getAttribute('data-app-kind');
        selectScheme(btn.getAttribute('data-scheme-select'), {
          fromList: true,
          scopeId: kind || undefined,
          // Agent face：换应用必须重绘中心配置 + 左栏顶栏聚焦。
          forceRemount: softPadFace === 'agent',
          resetView: softPadFace !== 'agent'
        });
      });
    }
    if (e.ensureBtn && !global.__otSoftPadEnsureCtaMounted) {
      e.ensureBtn.addEventListener('click', function () { ensureCodex(); });
    }
    // P10 owns #softPadSummaryEnable when status island mounted.
    if (e.enable && !global.__otSoftPadStatusMounted) {
      e.enable.addEventListener('click', function () { toggleSelectedEnable(); });
    }
    if (e.statusBar) {
      e.statusBar.addEventListener('click', function (ev) {
        if (!global.__otSoftPadStatusMounted) {
          var bindOpt = ev.target.closest && ev.target.closest('#softPadBindAppMenu [data-scope]');
          if (bindOpt) {
            ev.preventDefault();
            ev.stopPropagation();
            selectScope(bindOpt.getAttribute('data-scope'), { fromUser: true, resetView: false });
            return;
          }
          var bindBtn = ev.target.closest && ev.target.closest('#softPadBindAppBtn');
          if (bindBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            var menu = els().bindAppMenu;
            setBindAppMenuOpen(!(menu && !menu.hidden));
            return;
          }
        }
        var usageHit = ev.target.closest && ev.target.closest('#softPadSummaryUsage, #softPadSummaryReset');
        if (usageHit && String(selectedScopeId || '') === 'minimax') {
          ev.preventDefault();
          var keyInput = document.querySelector('#softPadMinimaxKeyInput');
          if (keyInput) {
            keyInput.focus();
            try { keyInput.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (_) {}
          } else {
            openMinimaxCodingConsole();
          }
          return;
        }
        var btn = ev.target.closest && ev.target.closest('[data-cockpit-action]');
        if (!btn || btn.disabled) return;
        ev.preventDefault();
        handleStatusAction(btn.getAttribute('data-cockpit-action'));
      });
    }
    var padRing = document.getElementById('softPadPadRing');
    if (padRing) {
      padRing.addEventListener('click', function (ev) {
        if (isLandLocked()) {
          ev.preventDefault();
          feLog('fe softPad.padRing click suppress-land');
          return;
        }
        var purposeEl = ev.target.closest && ev.target.closest('[data-pad-purpose]');
        if (purposeEl && handlePurposeChipClick(purposeEl)) {
          ev.preventDefault();
          syncSoftPadPadRing();
          return;
        }
        var chip = ev.target.closest && ev.target.closest('[data-ring-act]');
        if (!chip) return;
        ev.preventDefault();
        handlePadRingAct(chip.getAttribute('data-ring-act'));
      });
    }
    document.addEventListener('click', function (ev) {
      var e2 = els();
      if (!e2.bindApp || !e2.bindAppMenu || e2.bindAppMenu.hidden) return;
      if (e2.bindApp.contains(ev.target)) return;
      setBindAppMenuOpen(false);
    });
    var flowNodes = document.getElementById('softPadFlowNodes');
    if (flowNodes) {
      flowNodes.addEventListener('click', function (ev) {
        var btn = ev.target.closest && ev.target.closest('.flow-node-btn');
        if (!btn) return;
        var node = btn.closest('[data-soft-pad-node]');
        if (!node) return;
        ev.preventDefault();
        ev.stopPropagation();
        goSoftPadFlowNode(node.getAttribute('data-soft-pad-node'));
      });
    }
    if (e.subHost) {
      e.subHost.addEventListener('click', function (ev) {
        var purposeEl = ev.target.closest && ev.target.closest('[data-pad-purpose]');
        if (purposeEl && handlePurposeChipClick(purposeEl)) {
          ev.preventDefault();
          if (softPadPadMode === 'purpose') {
            paintSubpage(resolveSoftPadEntry(), { forceRemount: true });
          }
          return;
        }
        var btn = ev.target.closest && ev.target.closest('[data-cockpit-action]');
        if (!btn || !e.subHost.contains(btn)) return;
        ev.preventDefault();
        handleStatusAction(btn.getAttribute('data-cockpit-action'));
      });
    }
    var tmBoot = global.OneToneSoftPadTimeMachine;
    if (tmBoot && tmBoot.refreshHero && !tmHeroBooted) {
      tmHeroBooted = true;
      // Defer: never block Soft Pad first paint on git IPC.
      setTimeout(function () {
        Promise.resolve(tmBoot.refreshHero())
          .then(function () {
            updateStatusBar(findEntry(getSelectedMappingId()));
          })
          .catch(function () {});
      }, 0);
    }
  }

  function refreshSelected(m) {
    if (paintReentry > 0) return;
    var entry = syncEntryFromMapping(m);
    markActiveRow(getSelectedMappingId());
    if (!patchAppSwitcher()) renderAppSwitcher();
    updateScopeHint();
    if (entry) {
      updateStatusBar(entry);
      if (softPadFace === 'timeline') return;
      if (softPadFace === 'pad' && softPadPadMode === 'keys') {
        schedulePreviewPaint(entry);
      }
      syncFaceChrome(entry);
      if (softPadFace === 'pad' &&
          (softPadPadMode === 'appear' || softPadPadMode === 'purpose')) {
        syncRuntimeCheckboxes(entry);
      }
    }
  }

  function render(opts) {
    opts = opts || {};
    var t0 = Date.now();
    var uiGate = global.OneToneState && global.OneToneState.ui;
    if (uiGate && uiGate.settingsPanel && uiGate.settingsPanel !== 'softPad') {
      feLog('fe softPad.render aborted stale');
      return;
    }
    // Cancel prior deferred landing / remount before any island work.
    var openGen = ++softPadOpenGen;
    feLog('fe softPad.render begin');
    if (global.OneToneUiHeartbeat && global.OneToneUiHeartbeat.setTag) {
      try { global.OneToneUiHeartbeat.setTag('softPadRender'); } catch (_) {}
    }
    function clearSoftPadRenderTag() {
      if (global.OneToneUiHeartbeat && global.OneToneUiHeartbeat.clearTag) {
        try { global.OneToneUiHeartbeat.clearTag('softPadRender'); } catch (_) {}
      }
    }
    function softPadRenderStale() {
      if (openGen !== softPadOpenGen) return true;
      var ui = global.OneToneState && global.OneToneState.ui;
      return !!(ui && ui.settingsPanel && ui.settingsPanel !== 'softPad');
    }
    var keepSoftPadRenderTag = false;
    try {
    // Guardrail: when Soft Pad opens right after a Home guide/veil mis-sync,
    // the veil can stay pointer-blocking even if it's not obvious visually.
    // Close it here so Soft Pad doesn't make the rest of the nav unclickable.
    try {
      if (global.OneToneHomeGuide && typeof global.OneToneHomeGuide.close === 'function') {
        global.OneToneHomeGuide.close(true);
      }
    } catch (_) {}
    dismissSoftPadOverlay('render');
    ensureFloatingOverlayHidden('settings');
    try{
      var mountSoft=global.__otMountSoftPadStatusIsland;
      if(typeof mountSoft==='function') mountSoft();
      var mountWorkflow=global.__otMountSoftPadWorkflowIsland;
      if(typeof mountWorkflow==='function') mountWorkflow();
      var mountFuncTiles=global.__otMountSoftPadFuncTilesIsland;
      if(typeof mountFuncTiles==='function') mountFuncTiles();
      var mountEmptyIdle=global.__otMountSoftPadEmptyIdleIsland;
      if(typeof mountEmptyIdle==='function') mountEmptyIdle();
      var mountPreview=global.__otMountSoftPadPreviewIsland;
      if(typeof mountPreview==='function') mountPreview();
      var mountSubpage=global.__otMountSoftPadSubpageIsland;
      if(typeof mountSubpage==='function') mountSubpage();
      var mountDetailChrome=global.__otMountSoftPadDetailChromeIsland;
      if(typeof mountDetailChrome==='function') mountDetailChrome();
      var mountScopeHint=global.__otMountSoftPadScopeHintIsland;
      if(typeof mountScopeHint==='function') mountScopeHint();
      var mountEnsureCta=global.__otMountSoftPadEnsureCtaIsland;
      if(typeof mountEnsureCta==='function') mountEnsureCta();
    }catch(_){}
    if (softPadRenderStale()) {
      feLog('fe softPad.render aborted stale');
      return;
    }
    ensureSwitcherClickBound();
    bindChrome();
    scheduleAutoHubScan();
    // Drop any legacy Soft Pad pin so runtime stays Auto.
    clearUserLanePin();
    // Drop any leftover timeline desk from a previous TM visit.
    try {
      var tmReset = global.OneToneSoftPadTimeMachine;
      if (tmReset && tmReset.closeDesk) tmReset.closeDesk();
    } catch (_) {}
    ensureBaselineSoftPadOverlay({ persist: true });
    var e = els();
    applySoftPadEnsureCtaHost(buildSoftPadEnsureCtaModel());
    var entries = listSoftPadSchemes();
    renderSchemeList();
    renderAppSwitcher();
    updateScopeHint();

    if (opts.scopeId) selectedScopeId = String(opts.scopeId);
    if (opts.mappingId) {
      setSelectedMappingId(String(opts.mappingId));
      var mapped = findEntry(getSelectedMappingId());
      if (mapped && !opts.scopeId) selectedScopeId = mapped.kind;
    } else if (!getSelectedMappingId() && entries.length) {
      var defEntry = pickDefaultEntry(entries);
      setSelectedMappingId(defEntry ? String(defEntry.mapping.id) : String(entries[0].mapping.id));
      if (!opts.scopeId) selectedScopeId = pickDefaultScopeId(entries);
    }

    if (!entries.length) {
      resetSoftPadRouteToPadAppear();
      clearSubpage();
      // Don't wipe unrelated habit edit selection when Soft Pad has no app scenarios yet.
      var curId = getSelectedMappingId();
      if (curId) {
        var maps = mappings();
        var curMap = null;
        for (var ci = 0; ci < maps.length; ci++) {
          if (maps[ci] && String(maps[ci].id) === String(curId)) { curMap = maps[ci]; break; }
        }
        if (curMap && isSoftPadSchemeEligible(curMap)) setSelectedMappingId(null);
      }
      if (!opts.scopeId) selectedScopeId = 'codex';
      renderSchemeList();
      renderAppSwitcher();
      updateStatusBar(null);
      updateScopeHint();
      clearMain();
      var empty = e.empty;
      if (empty) {
        if (global.__otSoftPadEmptyIdleMounted && typeof global.__otSoftPadEmptyIdleSync === 'function') {
          emptySurfaceMode = 'empty';
          emptyPrepareCtx = null;
          applySoftPadEmptyIdleHost(buildSoftPadEmptyIdleModel());
        } else {
          empty.hidden = false;
          empty.innerHTML = emptyCreateCtaHtml();
          bindEmptyCreateCtas(empty);
        }
      }
      ensureSoftPadBoundaryHint();
      if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
        try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
      }
      feLog('fe softPad.render empty ' + (Date.now() - t0) + 'ms');
      return;
    }

    // Habit editor often leaves selectedMappingId on「通用设置」— adopt Soft Pad scheme for scope.
    var softEntry = resolveSoftPadEntry();
    if (hasMapping(softEntry)) {
      adoptSoftPadSelection(softEntry);
    } else {
      resetSoftPadRouteToPadAppear();
      clearSubpage();
      showPrepareMain(findScope(selectedScopeId || 'codex'));
      ensureSoftPadBoundaryHint();
      if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
        try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
      }
      feLog('fe softPad.render prepare ' + (Date.now() - t0) + 'ms scope=' + String(selectedScopeId || ''));
      return;
    }

    if (softPadRenderStale()) {
      feLog('fe softPad.render aborted stale');
      return;
    }

    // Clear under pad/appear so clearSubpage force-hide matches route.
    resetSoftPadRouteToPadAppear();
    clearSubpage();
    var openScopeId = selectedScopeId;
    var openEntry = resolveSoftPadEntry();
    // Always「何时显示」— never restore 改按键 (layout editor wedges tabs).
    var landMode = 'appear';
    // 2.5s covers drawer open ghost-click + deferred island remount.
    softPadLandUntil = Date.now() + 2500;
    feLog('fe softPad.land pad/' + landMode);
    if (hasMapping(openEntry)) {
      hideEmpty();
      adoptSoftPadSelection(openEntry);
      try { setSoftPadFace('pad', { padMode: landMode }); } catch (err) {
        feLog('fe softPad.land error ' + (err && err.message ? err.message : 'unknown'));
      }
      ensureSoftPadPreview(openEntry);
      updateStatusBar(openEntry);
      ensureSoftPadLeftChrome(openEntry);
    }
    function paintSoftPadLanding() {
      try {
        if (openGen !== softPadOpenGen) return;
        var ui = global.OneToneState && global.OneToneState.ui;
        if (ui && ui.settingsPanel && ui.settingsPanel !== 'softPad') return;
        var landed = resolveSoftPadEntry();
        if (!hasMapping(landed)) return;
        adoptSoftPadSelection(landed);
        softPadLandUntil = Date.now() + 2500;
        softPadFace = 'pad';
        softPadPadMode = landMode;
        rememberSoftPadPadMode(landMode);
        syncFaceChrome(landed);
        if (!softPadSubpageAlreadyPainted(landed, softPadPanelId())) {
          paintSubpage(landed, { forceRemount: true });
        }
        ensureSoftPadPreview(landed);
        ensureSoftPadLeftChrome(landed);
        ensureSoftPadBoundaryHint();
        if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
          try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
        }
        requestOverlayUsageForScope(selectedScopeId);
        feLog('fe softPad.render chrome ' + (Date.now() - t0) + 'ms map=' + String(getSelectedMappingId() || ''));
      } finally {
        // Keep tag briefly so post-land IPC/island work still shows in UI_HB_STALL.
        setTimeout(clearSoftPadRenderTag, 400);
      }
    }
    keepSoftPadRenderTag = true;
    // Second pass after island paint-targets commit (createRoot is async).
    requestAnimationFrame(function () {
      setTimeout(paintSoftPadLanding, 0);
    });
    } finally {
      if (!keepSoftPadRenderTag) clearSoftPadRenderTag();
    }
  }

  function pruneSoftPadPanelChrome() {
    ['softPadBoundaryHint', 'habitChannelStatusStripSoftPad'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function ensureSoftPadBoundaryHint() {
    var panel = document.getElementById('settingsPanelSoftPad');
    if (!panel) return;
    pruneSoftPadPanelChrome();
    ensureCursorActivityConsentCard(panel);
    ensureMinimaxCodingKeyCard(panel);
  }

  function ensureMinimaxCodingKeyCard(panel) {
    panel = panel || document.getElementById('settingsPanelSoftPad');
    if (!panel) return;
    var card = document.getElementById('softPadMinimaxKeyCard');
    var scope = String(selectedScopeId || '');
    if (scope !== 'minimax') {
      if (card) card.hidden = true;
      return;
    }
    if (!card) {
      card = document.createElement('div');
      card.id = 'softPadMinimaxKeyCard';
      card.className = 'codex-pad-mgr__claude-act soft-pad-minimax-key';
      card.innerHTML =
        '<p class="codex-pad-mgr__label">' +
        esc(t('softPadMinimaxKeyTitle', 'MiniMax Coding Plan Key')) +
        '</p>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadMinimaxKeyHint', '填写后 Soft Pad 长期显示 5h 余量与倒计时。套餐 key 勿用于 curl/批量探测。')) +
        '</p>' +
        '<label class="codex-pad-mgr__hint" for="softPadMinimaxKeyInput">' +
        esc(t('softPadMinimaxKeyLabel', 'API Key')) +
        '</label>' +
        '<input id="softPadMinimaxKeyInput" class="soft-pad-minimax-key__input" type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" />' +
        '<div class="codex-pad-mgr__claude-act-actions">' +
        '<button type="button" class="codex-micro-pad__btn is-primary" data-act="minimax-key-save">' +
        esc(t('softPadMinimaxKeySave', '保存并加载 5h')) +
        '</button>' +
        '<button type="button" class="codex-micro-pad__btn" data-act="minimax-key-clear">' +
        esc(t('softPadMinimaxKeyClear', '清除')) +
        '</button>' +
        '<button type="button" class="codex-micro-pad__btn" data-act="minimax-key-console">' +
        esc(t('softPadMinimaxKeyConsole', '套餐详情')) +
        '</button>' +
        '</div>' +
        '<p class="codex-pad-mgr__hint" data-minimax-key-status aria-live="polite"></p>';
      var hint = document.getElementById('softPadBoundaryHint');
      if (hint && hint.parentNode === panel) {
        panel.insertBefore(card, hint.nextSibling);
      } else {
        var status = document.getElementById('softPadStatusBar');
        if (status) panel.insertBefore(card, status.nextSibling);
        else panel.appendChild(card);
      }
      var saveBtn = card.querySelector('[data-act="minimax-key-save"]');
      var clearBtn = card.querySelector('[data-act="minimax-key-clear"]');
      var consoleBtn = card.querySelector('[data-act="minimax-key-console"]');
      var input = card.querySelector('#softPadMinimaxKeyInput');
      if (saveBtn) {
        saveBtn.addEventListener('click', function () {
          var v = input ? String(input.value || '').trim() : '';
          if (!v) {
            toastPad(t('softPadMinimaxKeyEmpty', '请先粘贴 Coding Plan API Key'));
            return;
          }
          setMinimaxCodingKey(v);
        });
      }
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          setMinimaxCodingKey('');
        });
      }
      if (consoleBtn) {
        consoleBtn.addEventListener('click', function () {
          openMinimaxCodingConsole();
        });
      }
      if (input) {
        input.addEventListener('keydown', function (ev) {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            if (saveBtn) saveBtn.click();
          }
        });
      }
    }
    refreshMinimaxCodingKeyDom(card);
  }

  function openMinimaxCodingConsole(url) {
    var u = String(url || 'https://platform.minimaxi.com/').trim();
    if (!u) u = 'https://platform.minimaxi.com/';
    return hubInvoke('cmd_open_url', { url: u }).catch(function () {
      toastPad(t('softPadMinimaxConsoleFail', '无法打开套餐控制台'));
    });
  }

  function refreshMinimaxCodingKeyDom(card) {
    card = card || document.getElementById('softPadMinimaxKeyCard');
    if (!card) return Promise.resolve();
    return hubInvoke('cmd_minimax_coding_key_get', {})
      .then(function (st) {
        var statusEl = card.querySelector('[data-minimax-key-status]');
        var clearBtn = card.querySelector('[data-act="minimax-key-clear"]');
        var on = !!(st && st.configured);
        if (clearBtn) clearBtn.hidden = !on;
        if (statusEl) {
          statusEl.textContent = on
            ? t('softPadMinimaxKeySaved', '已保存 {masked} · 正在加载 5h 余量').replace(
                '{masked}',
                String((st && st.masked) || '••••')
              )
            : t('softPadMinimaxKeyMissing', '未配置 · 保存 Key 后可显示 5h 余量与倒计时');
        }
        if (st && st.consoleUrl) card.__consoleUrl = String(st.consoleUrl);
        card.hidden = on || softPadFace === 'tray';
      })
      .catch(function () {});
  }

  function setMinimaxCodingKey(key) {
    return hubInvoke('cmd_minimax_coding_key_set', { key: String(key || '') })
      .then(function (st) {
        var card = document.getElementById('softPadMinimaxKeyCard');
        var input = card && card.querySelector('#softPadMinimaxKeyInput');
        if (input) input.value = '';
        toastPad(
          st && st.configured
            ? t('softPadMinimaxKeyOk', '已保存 · 正在同步 5h 余量')
            : t('softPadMinimaxKeyCleared', '已清除 MiniMax Coding Plan Key')
        );
        refreshMinimaxCodingKeyDom(card);
        return refreshOverlayUsageAsync({ silent: false });
      })
      .catch(function (err) {
        var msg = String((err && (err.message || err)) || err || '');
        toastPad(
          /invalid_minimax_coding_key/.test(msg)
            ? t('softPadMinimaxKeyInvalid', 'Key 无效（需 Coding Plan API Key，不是登录 JWT）')
            : t('softPadMinimaxKeyFail', '保存失败')
        );
      });
  }

  function ensureCursorActivityConsentCard(panel) {
    panel = panel || document.getElementById('settingsPanelSoftPad');
    if (!panel) return;
    var card = document.getElementById('softPadCursorActivityCard');
    var scope = String(selectedScopeId || '');
    if (scope !== 'cursor') {
      if (card) card.hidden = true;
      return;
    }
    if (!card) {
      card = document.createElement('div');
      card.id = 'softPadCursorActivityCard';
      card.className = 'codex-pad-mgr__claude-act soft-pad-cursor-activity';
      card.innerHTML =
        '<p class="codex-pad-mgr__label">' +
        esc(t('cursorActivityTitle', 'Cursor 本地活动统计')) +
        '</p>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('cursorActivityReads', '用于显示：')) +
        '</p>' +
        '<ul class="codex-pad-mgr__hint" data-cursor-activity-allow>' +
        '<li>✓ ' + esc(t('cursorActivityAllowTurns', '今日对话次数')) + '</li>' +
        '<li>✓ ' + esc(t('cursorActivityAllowSessions', 'Agent 会话数量')) + '</li>' +
        '<li>✓ ' + esc(t('cursorActivityAllowTime', '使用活跃时间')) + '</li>' +
        '</ul>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('cursorActivityDenies', '不会读取：')) +
        '</p>' +
        '<ul class="codex-pad-mgr__hint" data-cursor-activity-deny>' +
        '<li>× ' + esc(t('cursorActivityDenyLogin', '登录信息')) + '</li>' +
        '<li>× Token</li>' +
        '<li>× Cookie</li>' +
        '<li>× ' + esc(t('cursorActivityDenyText', '对话内容')) + '</li>' +
        '</ul>' +
        '<div class="codex-pad-mgr__claude-act-actions">' +
        '<button type="button" class="codex-micro-pad__btn is-primary" data-act="cursor-activity-enable">' +
        esc(t('cursorActivityEnable', '启用')) +
        '</button>' +
        '<button type="button" class="codex-micro-pad__btn is-primary" data-act="cursor-activity-disable" hidden>' +
        esc(t('cursorActivityDisable', '关闭')) +
        '</button>' +
        '</div>' +
        '<p class="codex-pad-mgr__hint" data-cursor-activity-status aria-live="polite"></p>';
      var hint = document.getElementById('softPadBoundaryHint');
      if (hint && hint.parentNode === panel) {
        panel.insertBefore(card, hint.nextSibling);
      } else {
        var status = document.getElementById('softPadStatusBar');
        if (status) panel.insertBefore(card, status.nextSibling);
        else panel.appendChild(card);
      }
      var enableBtn = card.querySelector('[data-act="cursor-activity-enable"]');
      var disableBtn = card.querySelector('[data-act="cursor-activity-disable"]');
      if (enableBtn) {
        enableBtn.addEventListener('click', function () {
          setCursorActivityPref(true);
        });
      }
      if (disableBtn) {
        disableBtn.addEventListener('click', function () {
          setCursorActivityPref(false);
        });
      }
    }
    refreshCursorActivityPrefDom(card);
  }

  function cursorActivityIntroSeen() {
    try { return localStorage.getItem('softPadCursorActivityIntroSeen') === '1'; } catch (_) { return false; }
  }

  function markCursorActivityIntroSeen() {
    try { localStorage.setItem('softPadCursorActivityIntroSeen', '1'); } catch (_) {}
  }

  function refreshCursorActivityPrefDom(card) {
    card = card || document.getElementById('softPadCursorActivityCard');
    if (!card) return Promise.resolve();
    return hubInvoke('cmd_cursor_activity_pref_get', {})
      .then(function (st) {
        var on = !!(st && (st.enabled || st.consent));
        var enableBtn = card.querySelector('[data-act="cursor-activity-enable"]');
        var disableBtn = card.querySelector('[data-act="cursor-activity-disable"]');
        var statusEl = card.querySelector('[data-cursor-activity-status]');
        if (enableBtn) enableBtn.hidden = !!on;
        if (disableBtn) disableBtn.hidden = !on;
        if (statusEl) {
          statusEl.textContent = on
            ? t('cursorActivityOn', '已启用 · 仅本地统计，不代表官方额度')
            : t('cursorActivityOff', '未启用 · 不会读取本机 Cursor 使用记录');
        }
        var show = !on && !cursorActivityIntroSeen() && softPadFace !== 'tray';
        card.hidden = !show;
      })
      .catch(function () {});
  }

  function setCursorActivityPref(enabled) {
    return hubInvoke('cmd_cursor_activity_pref_set', { enabled: !!enabled })
      .then(function () {
        markCursorActivityIntroSeen();
        toastPad(
          enabled
            ? t('cursorActivityEnableOk', '已启用 Cursor 活动统计')
            : t('cursorActivityDisableOk', '已关闭 Cursor 活动统计')
        );
        refreshCursorActivityPrefDom();
        return refreshOverlayUsageAsync({ silent: false });
      })
      .catch(function () {
        toastPad(t('cursorActivityPrefFail', '活动统计偏好切换失败'));
      });
  }

  function showList() { render({}); }
  function openDetail(mappingId, opts) {
    render(Object.assign({}, opts || {}, { mappingId: mappingId, force: true }));
  }

  global.OneToneSoftPadHub = {
    render: render,
    showList: showList,
    openDetail: openDetail,
    selectScheme: selectScheme,
    selectScope: selectScope,
    getSelectedScopeId: function () { return selectedScopeId; },
    isUniversalSoftPadScope: function () { return String(selectedScopeId || '') === SOFT_PAD_UNIVERSAL_KIND; },
    ensureBaselineSoftPadOverlay: ensureBaselineSoftPadOverlay,
    /** @deprecated merged into universal baseline */
    isGlobalSoftPadScope: function () { return String(selectedScopeId || '') === SOFT_PAD_UNIVERSAL_KIND; },
    /** @deprecated use ensureBaselineSoftPadOverlay */
    ensureGlobalSoftPad: ensureBaselineSoftPadOverlay,
    iconForKind: iconForKind,
    previewHostForFace: previewHostForFace,
    resolveSoftPadEntry: resolveSoftPadEntry,
    refreshSelected: refreshSelected,
    schedulePreviewPaint: schedulePreviewPaint,
    onPanelLeave: onPanelLeave,
    getOpenGen: function () { return softPadOpenGen; },
    floatingOverlayBlocked: floatingOverlayBlocked,
    ensureFloatingOverlayHidden: ensureFloatingOverlayHidden,
    ensureAppSoftPad: ensureAppSoftPad,
    isAgentPanelCurrent: isAgentPanelCurrent,
    isOverlayVisible: function () {
      try {
        return !!(global.OneToneSoundSurfaces && global.OneToneSoundSurfaces.softPadOverlayVisible
          && global.OneToneSoundSurfaces.softPadOverlayVisible());
      } catch (_) {
        return !!global.__otSoftPadOverlayVisible;
      }
    },
    isPaintBusy: function () { return paintBusy || paintReentry > 0 || !!previewTimer; },
    getView: function () { return softPadPanelId(); },
    getFace: function () { return softPadFace; },
    getPadMode: function () { return softPadPadMode; },
    setSoftPadFace: setSoftPadFace,
    setSoftPadPadMode: setSoftPadPadMode,
    listSoftPadSchemes: listSoftPadSchemes,
    schemeBetter: schemeBetter,
    softPadRuntimeFlags: softPadRuntimeFlags,
    listAppScopes: listAppScopes,
    listHubEntries: listHubEntries,
    refreshHubInventory: refreshHubInventory,
    resolveSoftPadEntry: resolveSoftPadEntry,
    adoptSoftPadSelection: adoptSoftPadSelection,
    isSoftPadSchemeEligible: isSoftPadSchemeEligible,
    resolvePrimaryLane: resolvePrimaryLane,
    resolvePrimaryLaneResult: resolvePrimaryLaneResult,
    laneContextFromRuntime: laneContextFromRuntime,
    noteLaneForeground: noteLaneForeground,
    getFreshForegroundAppId: getFreshForegroundAppId,
    noteLaneWaitingKinds: noteLaneWaitingKinds,
    publishSoftPadLaneSnapshot: publishSoftPadLaneSnapshot,
    formatDisplayLaneReason: formatDisplayLaneReason,
    getUserLaneId: getUserLaneId,
    setUserLaneId: setUserLaneId,
    clearUserLanePin: clearUserLanePin,
    currentPadPurpose: currentPadPurpose,
    purposeChipView: purposeChipView,
    recommendedNavigationSlots: recommendedNavigationSlots,
    persistPadPurposeAndSlots: persistPadPurposeAndSlots,
    setPadPurpose: setPadPurpose,
    kindForAppId: kindForAppId,
    pruneInvalidUserLanePin: pruneInvalidUserLanePin,
    ingestSoftPadRuntimeSnapshot: ingestSoftPadRuntimeSnapshot,
    refreshSoftPadRuntimeAsync: refreshSoftPadRuntimeAsync,
    getCachedSoftPadRuntime: getCachedSoftPadRuntime,
    LANE_FG_TTL_MS: LANE_FG_TTL_MS,
    LANE_WAIT_TTL_MS: LANE_WAIT_TTL_MS,
    openShellHookConnect: openShellHookConnect,
    pickHubDefaultScopeId: pickHubDefaultScopeId,
    pickHubDefaultEntry: pickHubDefaultEntry,
    // P10: exposed for React island toggle delegation
    toggleSelectedEnable: toggleSelectedEnable,
    toggleRowEnable: toggleRowEnable,
    buildSoftPadWorkflowModel: buildSoftPadWorkflowModel,
    buildSoftPadFourPanelModel: buildSoftPadFourPanelModel,
    softPadPanelExperienceHtml: softPadPanelExperienceHtml,
    // P14c：功能瓷砖宿主模型（单一来源）
    buildSoftPadFuncTilesModel: buildSoftPadFuncTilesModel,
    // P14d：空态 / 详情 idle 双宿主模型（单一来源）
    buildSoftPadEmptyIdleModel: buildSoftPadEmptyIdleModel,
    // P14e：预览宿主模型 + 读桥
    buildSoftPadPreviewModel: buildSoftPadPreviewModel,
    getSelectedSoftPadMappingForPreview: getSelectedSoftPadMappingForPreview,
    // P14f：子页 body 模型 + 读桥 / paint opts
    buildSoftPadSubpageModel: buildSoftPadSubpageModel,
    getSelectedSoftPadMappingForSubpage: getSelectedSoftPadMappingForSubpage,
    getSoftPadSubpagePaintOpts: getSoftPadSubpagePaintOpts,
    writeSoftPadSubpageAgentPick: writeSoftPadSubpageAgentPick,
    writeSoftPadSubpageHint: writeSoftPadSubpageHint,
    bindSoftPadAgentPickCta: bindSoftPadAgentPickCta,
    // P14g/P14i：detail 顶栏 + panel 显隐
    buildSoftPadDetailChromeModel: buildSoftPadDetailChromeModel,
    closeSubpage: closeSubpage,
    openSubpage: openSubpage,
    handleStatusAction: handleStatusAction,
    isLandLocked: isLandLocked,
    buildSoftPadPadRingModel: buildSoftPadPadRingModel,
    syncSoftPadPadRing: syncSoftPadPadRing,
    // P14h：scope 提示文案模型
    buildSoftPadScopeHintModel: buildSoftPadScopeHintModel,
    // P14j：准备 Codex CTA
    buildSoftPadEnsureCtaModel: buildSoftPadEnsureCtaModel,
    ensureCodex: ensureCodex,
    prepareAppFromUi: prepareAppFromUi,
    prepareSoftPadCreateKind: function (kind) {
      kind = String(kind || 'codex');
      prepareAppFromUi(appIdForKind(kind) || (kind === 'claude' ? 'claude-code' : 'codex-chat'), kind);
    },
    schemeRowView: renderSchemeRow,
    appSwitcherChipView: appSwitcherChipView,
  };
  // P10: read bridge — island calls this on mount / refresh to get initial state
  global.__otSoftPadStatusRead = function () {
    return buildStatusProps(findEntry(getSelectedMappingId()));
  };
  global.OneToneSoftPadSchemesUi = global.OneToneSoftPadHub;
})(window);
