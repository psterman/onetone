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

  var softPadView = 'hub'; // hub | layout | presentation | runtime | agent
  /** Last opened Soft Pad detail tile — restored on later opens; first prepare forces runtime. */
  var lastSoftPadView = 'runtime';
  var VALID_SOFT_PAD_VIEWS = { layout: 1, presentation: 1, runtime: 1, agent: 1, timeline: 1 };
  /** SoftPad #3c：四面板唯一顺序源（func tiles / model / 测试共用）。 */
  var SOFT_PAD_PANEL_ORDER = ['runtime', 'layout', 'presentation', 'agent'];
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
  function dismissSoftPadOverlay(reason) {
    try {
      var now = Date.now();
      // render + timeline open used to fire two sync dismisses in the same tick.
      if (now - overlayDismissAt < 400) return;
      overlayDismissAt = now;
      var ipc = global.OneToneIpc;
      if (!ipc || typeof ipc.invoke !== 'function') return;
      ipc.invoke('cmd_codex_micro_overlay_dismiss', {}).then(function () {
        feLog('fe softPad.overlayDismiss ' + String(reason || ''));
      }).catch(function () {});
    } catch (_) {}
  }

  /** Agent Soft Pad app targets (extensible for future apps). */
  var AGENT_SOFT_PAD_APP_IDS = {
    'codex-chat': 'codex',
    'claude-code': 'claude',
    'cursor-chat': 'cursor',
    'minimax-chat': 'minimax'
  };

  /** Always-visible Soft Pad apps (Codex + Claude only for now). */
  var BUILTIN_SOFT_PAD_APPS = [
    { kind: 'codex', appId: 'codex-chat' },
    { kind: 'claude', appId: 'claude-code' },
    { kind: 'cursor', appId: 'cursor-chat' }
  ];

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

  function appIdForKind(kind) {
    kind = String(kind || '');
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
    return iconForAppId(appIdForKind(kind));
  }

  function iconHtml(kind, cls) {
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
    var pad = m.codexMicroPad;
    if (pad && pad.enabled === true) return true;
    return !!kindForAppId(m.appTargetId);
  }

  /** Builtin Soft Pad kinds shown in hub UI (Codex + Claude + Cursor). */
  function isHubSoftPadKind(kind) {
    return kind === 'codex' || kind === 'claude' || kind === 'cursor';
  }

  function appTitleFor(kind) {
    if (kind === 'claude') return t('softPadHubKindClaude', 'Claude');
    if (kind === 'codex') return t('softPadHubKindCodex', 'Codex');
    if (kind === 'cursor') return t('softPadHubKindCursor', 'Cursor');
    if (kind === 'minimax') return t('softPadHubKindMinimax', 'MiniMax');
    return t('softPadHubKindSoft', 'Soft Pad');
  }

  /** Default Hub tab when opening Soft Pad (may be Codex placeholder — UI only). */
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
    return pickGlobalEntry(entries) || entries[0] || null;
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
   * Priority when auto: waiting → foreground → fallback.
   * When effective userPin set: userPin wins (scheme A).
   * Pure — does not write globals or clear pin memory.
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

    var enabledKinds = {};
    var i;
    for (i = 0; i < pool.length; i++) enabledKinds[pool[i].kind] = true;
    var rawPin = ctx.userLaneId == null ? '' : String(ctx.userLaneId).trim();
    var effectivePin = rawPin && enabledKinds[rawPin] ? rawPin : null;
    if (effectivePin) {
      var pinHit = findKind(effectivePin);
      if (pinHit) return { entry: pinHit, reason: LANE_REASONS.userPin };
    }

    var waiting = Array.isArray(ctx.waitingKinds) ? ctx.waitingKinds : [];
    var w;
    for (w = 0; w < waiting.length; w++) {
      var hitW = findKind(waiting[w]);
      if (hitW) return { entry: hitW, reason: LANE_REASONS.waiting };
    }

    var fgKind = kindForAppId(ctx.foregroundAppId);
    if (fgKind && isHubSoftPadKind(fgKind)) {
      var hitFg = findKind(fgKind);
      if (hitFg) return { entry: hitFg, reason: LANE_REASONS.foreground };
    }

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
    if (snap.userLaneId) userLaneId = String(snap.userLaneId);
    else userLaneId = null;
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

  function setUserLaneId(kind) {
    kind = kind == null ? '' : String(kind).trim();
    if (!kind) {
      userLaneId = null;
    } else if (isHubSoftPadKind(kind)) {
      userLaneId = kind;
    } else {
      return;
    }
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (invoke) {
      try {
        Promise.resolve(invoke('cmd_soft_pad_set_follow', { lane: userLaneId }))
          .then(function (snap) {
            ingestSoftPadRuntimeSnapshot(snap);
            try {
              if (global.__otSoftPadWorkflowSync) global.__otSoftPadWorkflowSync();
            } catch (_) {}
            updateScopeHint();
            if (!patchAppSwitcher()) renderAppSwitcher();
          })
          .catch(function () {
            try {
              if (global.__otSoftPadWorkflowSync) global.__otSoftPadWorkflowSync();
            } catch (_) {}
            updateScopeHint();
            if (!patchAppSwitcher()) renderAppSwitcher();
          });
        return;
      } catch (_) {}
    }
    try {
      if (global.__otSoftPadWorkflowSync) global.__otSoftPadWorkflowSync();
    } catch (_) {}
    updateScopeHint();
    if (!patchAppSwitcher()) renderAppSwitcher();
  }

  function clearUserLanePin() {
    setUserLaneId(null);
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
      userLaneId: getUserLaneId(),
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
      return t('homeWbSoftPadReasonUserPin', '首页已暂时设为 {name}').replace('{name}', agentName);
    }
    if (reason === LANE_REASONS.fallback) {
      return t('homeWbSoftPadReasonFallback', '已使用准备好的 {name}').replace('{name}', agentName);
    }
    return t('homeWbSoftPadReasonNone', '还没有可用的 Agent，先准备 Codex 或 Claude');
  }

  function followChipView() {
    var pin = getUserLaneId();
    if (pin) {
      var name = appTitleFor(pin);
      return (
        '<button type="button" class="soft-pad-app-chip soft-pad-follow-chip is-pin" data-lane-follow="clear"' +
        ' title="' + esc(t('softPadFollowRestoreTitle', '恢复自动跟随')) + '">' +
        '<span>' + esc(t('softPadFollowPinned', '暂时设为：{name} · 恢复自动').replace('{name}', name)) +
        '</span></button>'
      );
    }
    return (
      '<button type="button" class="soft-pad-app-chip soft-pad-follow-chip is-auto is-active" data-lane-follow="menu"' +
      ' aria-expanded="false" title="' + esc(t('softPadFollowAutoTitle', '自动跟随；点此可暂时设为某个 Agent')) + '">' +
      '<span>' + esc(t('softPadFollowAuto', '自动跟随')) + '</span></button>' +
      '<button type="button" class="soft-pad-app-chip soft-pad-follow-chip is-pin-opt" data-lane-pin="codex" hidden>' +
      '<span>' + esc(t('softPadFollowPinCodex', '暂时设为 Codex')) + '</span></button>' +
      '<button type="button" class="soft-pad-app-chip soft-pad-follow-chip is-pin-opt" data-lane-pin="claude" hidden>' +
      '<span>' + esc(t('softPadFollowPinClaude', '暂时设为 Claude')) + '</span></button>'
    );
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

  function schemeRank(entry) {
    var pad = entry.mapping && entry.mapping.codexMicroPad;
    var score = 0;
    if (pad && pad.enabled) score += 100;
    if (pad && pad.overlayEnabled) score += 10;
    if (entry.mapping && entry.mapping.enabled) score += 1;
    score -= Number(entry.mapping && entry.mapping.order) || 0;
    return score;
  }

  /**
   * One Soft Pad scheme per agent app (Codex / Claude / …).
   */
  function listSoftPadSchemes() {
    var byKind = {};
    mappings().forEach(function (m) {
      if (!isSoftPadSchemeEligible(m)) return;
      var kind = kindForAppId(m.appTargetId) || 'soft';
      if (!isHubSoftPadKind(kind)) return;
      var pad = m.codexMicroPad;
      var enabled = !!(pad && pad.enabled);
      var entry = {
        mapping: m,
        kind: kind,
        appId: String(m.appTargetId || ''),
        padEnabled: enabled,
        canEnable: !enabled,
        canPrepare: false,
        title: appTitleFor(kind),
        presentation: (pad && pad.presentation === 'mini') ? 'mini' : 'full'
      };
      var prev = byKind[kind];
      if (!prev || schemeRank(entry) > schemeRank(prev)) {
        byKind[kind] = entry;
      }
    });
    var out = Object.keys(byKind).map(function (k) { return byKind[k]; });
    out.sort(function (a, b) {
      var rank = { codex: 0, claude: 1, soft: 9 };
      var ra = rank[a.kind] != null ? rank[a.kind] : 8;
      var rb = rank[b.kind] != null ? rank[b.kind] : 8;
      if (ra !== rb) return ra - rb;
      return String(a.title).localeCompare(String(b.title));
    });
    return out;
  }

  function listHubEntries() {
    return listSoftPadSchemes();
  }

  /** Default Soft Pad layer for「全局」— prefer enabled, else first. */
  function pickGlobalEntry(entries) {
    entries = entries || listSoftPadSchemes();
    var i;
    for (i = 0; i < entries.length; i++) {
      if (entries[i].padEnabled) return entries[i];
    }
    return entries[0] || null;
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
          navKeysEnabled: m.codexMicroPad.navKeysEnabled !== false
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
   * Scopes for top switcher: builtin apps only (Codex / Claude; no「全局」).
   */
  function listAppScopes() {
    var entries = listSoftPadSchemes();
    var byKind = {};
    entries.forEach(function (e) { byKind[e.kind] = e; });
    return BUILTIN_SOFT_PAD_APPS.map(function (b) {
      var entry = byKind[b.kind] || placeholderEntry(b.kind, b.appId);
      return {
        id: b.kind,
        kind: b.kind,
        appId: b.appId,
        title: entry.title,
        mapping: entry.mapping,
        entry: entry,
        padEnabled: !!entry.padEnabled,
        canPrepare: !!entry.canPrepare
      };
    });
  }

  /** Aside list: builtin apps (existing or「可准备」). */
  function listAsideEntries() {
    var entries = listSoftPadSchemes();
    var byKind = {};
    entries.forEach(function (e) { byKind[e.kind] = e; });
    return BUILTIN_SOFT_PAD_APPS.map(function (b) {
      return byKind[b.kind] || placeholderEntry(b.kind, b.appId);
    });
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
      aside: document.getElementById('softPadSchemeAside'),
      softPadPanel: document.getElementById('settingsPanelSoftPad')
    };
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

  function usagePropsFromAgent(kind, usage) {
    usage = usage || {};
    var status = String(usage.status || 'unavailable');
    var windows = Array.isArray(usage.windows) ? usage.windows : [];
    var bits = [];
    if (kind === 'codex' || kind === 'claude') {
      windows.slice(0, 2).forEach(function (w) {
        var lab = windowQuotaLabel(w);
        if (lab) bits.push(lab);
      });
      if (!bits.length) {
        if (kind === 'claude') {
          var sess = usageVal(usage, 'sessionTokens', 'session_tokens');
          var aux = usageVal(usage, 'auxiliaryTokens', 'auxiliary_tokens');
          var cost = usageVal(usage, 'estimatedCostUsd', 'estimated_cost_usd');
          if (sess != null) bits.push('本会话 ' + Math.round(Number(sess)));
          if (aux != null) bits.push('子任务 ' + Math.round(Number(aux)));
          if (cost != null) {
            var c = Number(cost);
            bits.push('估算 $' + (isFinite(c) ? (Math.round(c * 1e4) / 1e4) : cost));
          }
          if (!bits.length) bits.push('用量 --');
        } else {
          var remaining = usageVal(usage, 'remainingPercent', 'remaining_percent');
          if (remaining != null) bits.push('窗口余 ' + Math.round(Number(remaining)) + '%');
        }
      }
    } else if (kind === 'cursor') {
      bits.push('用量 --');
    }
    return {
      account: String(usageVal(usage, 'accountLabel', 'account_label') || '').trim(),
      plan: String(usageVal(usage, 'planType', 'plan_type') || '').trim(),
      usageSummary: bits.length ? bits.join(' / ') : (status === 'ready' ? '--' : '—'),
      resetCountdown: formatResetCountdown(primaryResetAt(usage)) || '—',
      usageState: status
    };
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
    if (kind !== 'codex' && kind !== 'claude' && kind !== 'cursor') return;
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
    setSelectedMappingId(String(entry.mapping.id));
    if (entry.kind) selectedScopeId = entry.kind;
    return entry;
  }

  function hostsNeedPaint(entry) {
    var e = els();
    if (!e.preview || e.preview.childElementCount === 0) return true;
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

  function countPadKeys(entry) {
    try {
      var keys = entry && entry.mapping && entry.mapping.codexMicroPad && entry.mapping.codexMicroPad.keys;
      return Array.isArray(keys) ? keys.length : 0;
    } catch (_) {
      return 0;
    }
  }

  function buildHeroMeta(entry) {
    var scope = selectedScopeId || (entry && entry.kind) || 'codex';
    var agentName = appTitleFor(scope);
    var pin = getUserLaneId();
    var agent = pin
      ? t('softPadCockpitAgentPinned', '{name} · 暂时').replace('{name}', agentName)
      : agentName;
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

  function buildStatusProps(entry) {
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
        hasMapping: false
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
      hasMapping: hasMapping(entry)
    }, entry.kind || selectedScopeId);
  }

  function updateStatusBar(entry) {
    // P10: React island owns this DOM when mounted — push state and skip legacy DOM writes.
    if (global.__otSoftPadStatusMounted) {
      if (global.__otSoftPadStatusSync) global.__otSoftPadStatusSync(buildStatusProps(entry));
      updateSoftPadFlowHints(entry);
      syncSoftPadFlowNodes(entry);
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
    if (e.enable) {
      e.enable.disabled = !props.hasMapping;
      e.enable.classList.toggle('is-on', !!props.padEnabled);
      e.enable.setAttribute('aria-checked', props.padEnabled ? 'true' : 'false');
    }
    var testBtn = document.getElementById('btnSoftPadTestFg');
    var editBtn = document.getElementById('btnSoftPadEditKeys');
    if (testBtn) testBtn.disabled = !props.hasMapping;
    if (editBtn) editBtn.disabled = !props.hasMapping;
    updateSoftPadFlowHints(entry);
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
      openSubpage('layout', { fromUser: true });
      return;
    }
    if (action === 'preview-pad') {
      if (entry) schedulePreviewPaint(entry);
      var preview = document.getElementById('softPadPreviewHost');
      if (preview && preview.scrollIntoView) {
        try { preview.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) {}
      }
      return;
    }
    if (action === 'open-timeline') {
      openSubpage('timeline');
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
    var app = appTitleFor(selectedScopeId || 'codex');
    var scenario = '';
    var entry = findEntry(getSelectedMappingId()) || pickGlobalEntry();
    if (entry && entry.mapping) scenario = displayTitle(entry);
    var text;
    if (scenario && scenario !== '—' && scenario !== app) {
      text = t('softPadHintAppBound', '{app} · 绑定「{scenario}」：该应用前台时的键位和状态灯')
        .replace('{app}', app)
        .replace('{scenario}', scenario);
    } else {
      text = t('softPadHintApp', '{app}：该应用前台时的键位和状态灯')
        .replace('{app}', app);
    }
    var support = t(
      'softPadHubSupportRange',
      '支持 Codex、Claude、Cursor（Cursor：桌面 chord + 官方 Hook 生命周期；默认不开等待抢主控）'
    );
    var pin = getUserLaneId();
    var followLine = pin
      ? t('softPadFollowPinned', '暂时设为：{name} · 恢复自动').replace('{name}', appTitleFor(pin))
      : t('softPadFollowAuto', '自动跟随');
    return {
      text: followLine + ' · ' + text,
      supportRange: support,
      followMode: pin ? 'pin' : 'auto',
      userLaneId: pin,
      sig: String(followLine || '') + '|' + String(text || '') + '|' + String(pin || '')
    };
  }

  function updateScopeHint() {
    var e = els();
    if (!e.hint) return;
    if (global.__otSoftPadScopeHintMounted && typeof global.__otSoftPadScopeHintSync === 'function') {
      global.__otSoftPadScopeHintSync();
      updateStatusBar(findEntry(getSelectedMappingId()));
      return;
    }
    var model = buildSoftPadScopeHintModel();
    e.hint.textContent = model.text || '';
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
    e.tiles.querySelectorAll('[data-tile]').forEach(function (btn) {
      var on = softPadView !== 'hub' && btn.getAttribute('data-tile') === softPadView;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      if (on) btn.setAttribute('aria-current', 'true');
      else btn.removeAttribute('aria-current');
    });
  }

  function clearMain() {
    var e = els();
    if (e.preview) {
      if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
        paintedMappingId = null;
        previewForceOnce = true;
      } else {
        e.preview.replaceChildren();
      }
    }
    if (e.tiles) {
      if (!(global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function')) {
        e.tiles.innerHTML = '';
      }
    }
    softPadView = 'hub';
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
    ++selectToken;
    ++agentLoadToken;
    stopOverlayUsagePolling();
    clearMain();
  }

  function emptyCreateCtaHtml() {
    return '<p class="soft-pad-empty__title">' + esc(t('softPadEmptyTitle', '还没有可配置的应用场景')) + '</p>' +
      '<p class="soft-pad-empty__desc">' +
      esc(t('softPadBoundaryHint', '虚拟键盘只绑定到应用场景。先创建 Codex 或 Claude 应用场景，再配置它的虚拟键盘。')) +
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
    if (global.__otSoftPadEmptyIdleMounted) return;
    host.querySelectorAll('[data-soft-pad-create-kind]').forEach(function (btn) {
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
    if (!host || global.__otSoftPadEmptyIdleMounted) return;
    var btn = host.querySelector('[data-soft-pad-prepare-cta]');
    if (!btn) return;
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
      emptyDesc = t('softPadBoundaryHint', '虚拟键盘只绑定到应用场景。先创建 Codex 或 Claude 应用场景，再配置它的虚拟键盘。');
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
    softPadView = 'hub';
    setSelectedMappingId(null);
    pendingPaintEntry = null;
    pendingPaintOpts = null;
    var e = els();
    if (e.preview) {
      if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
        paintedMappingId = null;
        previewForceOnce = true;
      } else {
        e.preview.replaceChildren();
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
    syncHubChrome(placeholder);
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
    view = normalizeFourPanelView(view);
    if (view === 'layout') return t('softPadTileLayout', '改按键');
    if (view === 'presentation') return t('softPadTilePres', '外观');
    if (view === 'runtime') return t('softPadTileRuntime', '何时显示');
    if (view === 'agent') return t('softPadTileMore', '更多');
    return '';
  }

  function flowNodeForView(view) {
    view = String(view || softPadView || 'hub');
    if (view === 'agent') return 'agent';
    if (view === 'timeline') return 'timeline';
    return 'pad';
  }

  function syncSoftPadFlowNodes(entry) {
    var root = document.getElementById('softPadFlowNodes');
    if (!root) return;
    var active = flowNodeForView(softPadView);
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
    // Status lights = glanceable busy/idle — not scheme/management copy.
    if (agentHint) {
      agentHint.textContent = t('softPadFlowAgentHint', '看 AI 忙不忙');
    }
    if (padHint) {
      padHint.textContent = entry
        ? (statusLabel(entry) + ' · ' + hero.keys)
        : t('softPadFlowPadHint', '改键位 · 何时显示');
    }
    if (tmHint) {
      tmHint.textContent = hero.restorePoint || t('softPadFlowTimelineHint', '只保护已接入项目');
    }
  }

  function goSoftPadFlowNode(nodeId) {
    nodeId = String(nodeId || '');
    if (nodeId === 'agent') {
      openSubpage('agent');
      return;
    }
    if (nodeId === 'timeline') {
      openSubpage('timeline');
      return;
    }
    if (nodeId === 'pad') {
      // Leave TM stage first so Soft Pad chrome is visible before detail paint.
      if (softPadView === 'timeline') {
        var tm = global.OneToneSoftPadTimeMachine;
        if (tm && tm.closeDesk) tm.closeDesk();
      }
      // Soft Pad node lands on「何时显示」— 改按键/外观/状态灯 via top tabs.
      openSubpage('runtime');
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
    // Desk lives in #softPadTmDesk; mark subBody so paintSubpage skip-remount works (else 假死 reload loop).
    var e = els();
    var body = host || (e && e.subBody);
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
    if (!hasMapping(entry)) return 'noMapping';
    view = String(view || softPadView || 'hub');
    if (view === 'timeline') return 'unavailable';
    var light = view === 'runtime' || view === 'presentation' || view === 'agent';
    var canPaint = view === 'hub' || view === 'layout' || light;
    if (!canPaint) return 'unavailable';
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
    var prepareAppId = (emptyPrepareCtx && emptyPrepareCtx.appId) ||
      (selectedScopeId === 'claude' ? 'claude-code' : 'codex-chat');
    var prepareKind = (emptyPrepareCtx && emptyPrepareCtx.kind) ||
      (selectedScopeId === 'claude' ? 'claude' : 'codex');
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
    // 状态灯页本身就是选项；不必再垫一层「查看进阶」主 CTA。
    if (panelId === 'agent' && empty.mode === 'ready') return '';
    if (empty.mode === 'needsAction') {
      return '<div class="soft-pad-panel-empty" data-soft-pad-panel-empty="' + esc(panelId) + '">' +
        '<p class="soft-pad-panel-empty__title">' + esc(empty.title || '') + '</p>' +
        '<p class="soft-pad-panel-empty__desc">' + esc(empty.desc || '') + '</p>' +
        '<button type="button" class="codex-micro-pad__btn is-primary" data-act="' +
        esc(cta.act) + '"' + (cta.disabled ? ' disabled' : '') + '>' +
        esc(cta.label) + '</button></div>';
    }
    return '<div class="soft-pad-panel-primary">' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="' +
      esc(cta.act) + '"' + (cta.disabled ? ' disabled' : '') + '>' +
      esc(cta.label) + '</button></div>';
  }

  function buildSoftPadFourPanelModel(entry) {
    if (arguments.length === 0) entry = resolveSoftPadEntry();
    var rawView = softPadView || 'hub';
    var isTm = rawView === 'timeline';
    // Timeline is a stage mode (flow node), not a Soft Pad detail tile.
    var activeView = rawView === 'hub' || isTm ? 'hub' : normalizeFourPanelView(rawView);
    var mappingId = hasMapping(entry) ? String(entry.mapping.id) : '';
    var has = hasMapping(entry);
    var detailOpen = !isTm && activeView !== 'hub' && has;
    var landingView = defaultDetailView();
    var landingHint = t('softPadLandingHint', '建议从「{panel}」开始')
      .replace('{panel}', subpageTitle(landingView));
    var surfaceEmpty = resolveSurfaceEmpty(has);
    var previewEmpty = resolvePreviewEmpty(entry, rawView);
    var panels = SOFT_PAD_PANEL_ORDER.map(function (id, index) {
      var empty = panelEmptyState(entry, id);
      var cta = panelPrimaryCta(entry, id);
      return {
        id: id,
        index: String(index + 1),
        title: subpageTitle(id),
        summary: fourPanelSub(entry, id),
        status: tileStatus(entry, id),
        disabled: !has,
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
    // Soft Pad page always lands on「何时显示」— never leave hub idle asking the user to click.
    if (opts.forceView && VALID_SOFT_PAD_VIEWS[opts.forceView] && opts.forceView !== 'timeline' &&
        opts.forceView !== 'layout') {
      return opts.forceView;
    }
    return 'runtime';
  }

  function rememberSoftPadView(view) {
    if (VALID_SOFT_PAD_VIEWS[view] && view !== 'timeline') lastSoftPadView = view;
  }

  function buildSoftPadFuncTilesModel(entry) {
    if (arguments.length === 0) {
      entry = resolveSoftPadEntry();
    }
    var inPadViews = softPadView === 'hub' || softPadView === 'layout' ||
      softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent';
    var ariaLabel = t('softPadFuncTilesAria', '你想改什么？');
    if (!entry || !inPadViews || softPadView === 'timeline') {
      return {
        tilesHtml: '',
        hidden: true,
        ariaLabel: ariaLabel,
        mappingId: '',
        view: softPadView || 'hub',
        ready: false,
        sig: 'hidden|' + (softPadView || 'hub')
      };
    }
    var panelModel = buildSoftPadFourPanelModel(entry);
    var ready = panelModel.hasMapping;
    var tiles = panelModel.panels.map(function (panel) {
      return {
        id: panel.id,
        index: panel.index,
        title: panel.title,
        sub: panel.summary,
        status: panel.status,
        active: panel.active,
        disabled: panel.disabled,
        recommended: !!panel.recommended
      };
    });
    var tilesHtml =
      '<div class="soft-pad-func-tiles__tabs pref-segmented is-wide" role="presentation">' +
      tiles.map(function (tile) {
        var tip = [tile.sub, tile.status].filter(Boolean).join(' · ');
        return (
          '<button type="button" role="tab" class="pref-segmented-btn soft-pad-func-tile' +
          (tile.disabled ? ' is-disabled' : '') +
          (tile.active ? ' is-active' : '') +
          (tile.recommended ? ' is-recommended' : '') +
          '" data-tile="' + esc(tile.id) + '"' +
          (tile.recommended ? ' data-recommended="1"' : '') +
          (tile.disabled ? ' disabled aria-disabled="true"' : '') +
          (tile.active ? ' aria-selected="true" aria-current="true"' : ' aria-selected="false"') +
          (tip ? ' title="' + esc(tip) + '"' : '') + '>' +
          '<span class="soft-pad-func-tile__title">' + esc(tile.title) + '</span>' +
          '</button>'
        );
      }).join('') +
      '</div>';
    var mappingId = entry.mapping && entry.mapping.id ? String(entry.mapping.id) : '';
    var sig = [
      panelModel.sig,
      tilesHtml
    ].join('\0');
    return {
      tilesHtml: tilesHtml,
      hidden: false,
      ariaLabel: ariaLabel,
      mappingId: mappingId,
      view: softPadView || 'hub',
      ready: !!ready,
      landingView: panelModel.landingView,
      sig: sig
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
      if (typeof global.__otSoftPadFuncTilesForce === 'function') {
        global.__otSoftPadFuncTilesForce();
      } else {
        renderFuncTiles(entry);
      }
      if (!e.tiles.querySelector('[data-tile]')) {
        var tileModel = buildSoftPadFuncTilesModel(entry);
        e.tiles.hidden = !!tileModel.hidden;
        if (!tileModel.hidden && tileModel.tilesHtml && !global.__otSoftPadFuncTilesMounted) {
          e.tiles.innerHTML = tileModel.tilesHtml;
        }
      } else {
        e.tiles.hidden = false;
      }
    }
    paintPreview(entry, { force: true });
    if (e.preview && !e.preview.querySelector('.codex-micro-pad.soft-pad-preview')) {
      var Pad = global.OneToneCodexMicroPadUi;
      if (Pad && Pad.renderSoftPadPreview) {
        var paint = e.preview.querySelector('[data-soft-pad-preview-paint]');
        if (!paint) {
          paint = document.createElement('div');
          paint.setAttribute('data-soft-pad-preview-paint', '');
          paint.className = 'soft-pad-preview-paint';
          e.preview.appendChild(paint);
        }
        try {
          Pad.renderSoftPadPreview(paint, entry.mapping, { forceFull: true });
          e.preview.hidden = false;
          if (e.preview.querySelector('.codex-micro-pad.soft-pad-preview')) {
            paintedMappingId = String(entry.mapping.id);
          }
        } catch (_) {}
      }
    } else if (e.preview) {
      e.preview.hidden = false;
    }
  }

  function syncHubChrome(entry) {
    var e = els();
    var onHub = softPadView === 'hub';
    var onTm = softPadView === 'timeline';
    var tm = global.OneToneSoftPadTimeMachine;
    if (onTm) {
      // Visibility only — openDesk/loadAll is owned by writeSoftPadTimelinePanel (not every chrome sync).
      if (tm && typeof tm.ensureDeskVisible === 'function') tm.ensureDeskVisible();
      else if (tm && tm.bindDesk) tm.bindDesk();
    } else if (tm) {
      tm.closeDesk();
    }
    // Timeline uses stage.is-tm-desk; Soft Pad detail shell stays closed.
    var detailOpen = !onHub && !onTm && hasMapping(entry);
    if (e.tiles && !(global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function')) {
      e.tiles.hidden = !entry || onTm;
    }
    setDetailOpen(detailOpen);
    if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
      // chrome attrs (hidden / collapsed) via preview model sync
      global.__otSoftPadPreviewSync();
    } else if (e.preview) {
      var previewModel = buildSoftPadPreviewModel();
      e.preview.hidden = !!previewModel.hidden;
      if (!previewModel.hidden) e.preview.classList.remove('is-collapsed');
    }
    if (e.stage) {
      e.stage.classList.remove('is-preview-collapsed');
      e.stage.classList.toggle('is-detail-open', detailOpen);
    }
    // 何时显示是默认落地页：不显示「返回」，避免回到空白提示态。
    if (global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function') {
      global.__otSoftPadDetailChromeSync();
    } else {
      if (e.subBack) {
        e.subBack.hidden = softPadView === 'runtime';
        e.subBack.textContent = t('softPadSubBack', '← 返回');
      }
      if (e.subTitle && detailOpen) e.subTitle.textContent = subpageTitle(softPadView);
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
    if (entry) {
      if (global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function') {
        renderFuncTiles(entry);
      } else if (!e.tiles.querySelector('[data-tile]')) {
        renderFuncTiles(entry);
      } else {
        e.tiles.querySelectorAll('[data-tile]').forEach(function (btn) {
          var id = btn.getAttribute('data-tile');
          var tip = [fourPanelSub(entry, id), tileStatus(entry, id)].filter(Boolean).join(' · ');
          if (tip) btn.setAttribute('title', tip);
          else btn.removeAttribute('title');
        });
        patchActiveTiles();
      }
    } else if (global.__otSoftPadFuncTilesMounted && typeof global.__otSoftPadFuncTilesSync === 'function') {
      renderFuncTiles(null);
    }
  }

  /** P14g：SoftPad detail 顶栏（返回 / 标题）模型。 */
  function buildSoftPadDetailChromeModel() {
    var panelModel = buildSoftPadFourPanelModel(resolveSoftPadEntry());
    var view = panelModel.activeView || 'hub';
    var detailOpen = !!panelModel.detailOpen;
    var backHidden = !detailOpen || view === 'runtime';
    var title = detailOpen ? subpageTitle(view) : '';
    var backLabel = t('softPadSubBack', '← 返回');
    var landingView = panelModel.landingView || 'runtime';
    var sig = [
      view,
      detailOpen ? '1' : '0',
      backHidden ? '1' : '0',
      title,
      backLabel,
      landingView
    ].join('\0');
    return {
      view: view,
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
      entry.padEnabled = !!m.codexMicroPad.enabled;
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
    var e = els();
    if (!e.subBody || !hasMapping(entry) || !view) return false;
    var mapId = String(entry.mapping.id || '');
    if (e.subBody.getAttribute('data-soft-pad-panel') !== view) return false;
    if (e.subBody.getAttribute('data-soft-pad-mapping') !== mapId) return false;
    var host = softPadSubpagePaintEl(e.subBody) || e.subBody;
    if (view === 'runtime') {
      return !!host.querySelector('[data-act="showMode"]');
    }
    if (view === 'presentation') {
      return !!host.querySelector('[data-pad-skin-opt]');
    }
    if (view === 'layout') {
      return !!host.querySelector('[data-soft-pad-layout-editor]');
    }
    if (view === 'timeline') {
      var desk = document.getElementById('softPadTmDesk');
      return !!(desk && desk.dataset.tmBound === '1' && !desk.hidden);
    }
    if (view === 'agent') {
      var lazy = host.querySelector('[data-lazy-agent-body]');
      return !!(lazy && lazy.getAttribute('data-filled') === '1' && lazy.childNodes.length > 0);
    }
    return false;
  }

  function syncRuntimeCheckboxes(entry) {
    if (softPadView !== 'runtime' || !hasMapping(entry)) return;
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
    var showModeEl = body.querySelector('[data-act="showMode"]');
    if (showModeEl) showModeEl.value = mode;
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
      navKeysEl.checked = pad.navKeysEnabled !== false;
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
      navCap.textContent = pad.navKeysEnabled === false
        ? t('softPadFeatureNavCapOff', '方向键保持系统原样，Soft Pad 不显示左侧方向列。')
        : t('softPadFeatureNavCapOn', '主键盘方向键临时靠在虚拟键盘左侧；与小键盘 2/4/6/8 无关。');
    }
    var navHost = body.querySelector('[data-nav-demo-host]');
    if (navHost && Pad && typeof Pad.renderNavArrowDemoHtml === 'function') {
      navHost.innerHTML = Pad.renderNavArrowDemoHtml(pad);
    } else {
      var arrowStory = body.querySelector('[data-nav-on]');
      if (arrowStory) {
        arrowStory.setAttribute('data-nav-on', pad.navKeysEnabled === false ? '0' : '1');
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
    panel = panel || softPadView;
    changeOpts = changeOpts || {};
    // P14l：皮肤切换 ultra-hot — 不 remount presentation、不 force preview。
    if (panel === 'presentation') {
      updateStatusBar(entry);
      patchSchemeRowPresentation(entry);
      if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
          softPadView === 'runtime' || softPadView === 'agent') {
        renderFuncTiles(entry);
      }
      return;
    }
    markActiveRow(getSelectedMappingId());
    if (!patchAppSwitcher()) renderAppSwitcher();
    updateScopeHint();

    if (panel === 'layout') {
      updateStatusBar(entry);
      patchSchemeRowPresentation(entry);
      // Profile/import may change routes — queue preview (hub/layout only).
      if (softPadView === 'layout' || softPadView === 'hub') {
        schedulePreviewPaint(entry);
      }
      if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
          softPadView === 'runtime' || softPadView === 'agent') {
        renderFuncTiles(entry);
      }
      // P14m：仅 import/clear 等显式 remount；profile 切换 remountLayout:false。
      if (softPadView === 'layout' && changeOpts.remountLayout !== false) {
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
          if (softPadView !== 'runtime') return;
          if (String(getSelectedMappingId() || '') !== mapId) return;
          var cur = findEntry(mapId);
          if (!hasMapping(cur)) return;
          // P14k：in-place preview shell patch（勿 forceFull 整板炸 preview）。
          var PadUi = global.OneToneCodexMicroPadUi;
          var prevHost = document.getElementById('softPadPreviewHost');
          if (PadUi && typeof PadUi.renderSoftPadPreview === 'function' && prevHost) {
            try { PadUi.renderSoftPadPreview(prevHost, cur.mapping); } catch (_) {}
          }
        });
      }
      if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
          softPadView === 'runtime' || softPadView === 'agent') {
        renderFuncTiles(entry);
      }
      return;
    }
    if (panel === 'agent') {
      return;
    }
    updateStatusBar(entry);
    if (softPadView === 'hub' || softPadView === 'layout') {
      schedulePreviewPaint(entry);
    }
    if (softPadView === 'hub' || softPadView === 'layout' || softPadView === 'presentation' ||
        softPadView === 'runtime' || softPadView === 'agent') {
      renderFuncTiles(entry);
    }
  }

  function softPadSubpagePaintEl(preferred) {
    var e = els();
    var body = preferred || (e && e.subBody);
    if (!body) return null;
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && typeof Pad.resolveSoftPadSubpagePaintHost === 'function') {
      return Pad.resolveSoftPadSubpagePaintHost(body);
    }
    return body;
  }

  function applySoftPadSubpageOuterAttrs(model) {
    var e = els();
    if (!e.subBody) return;
    if (!model || model.clear || !model.panel) {
      e.subBody.classList.remove('is-editing-key');
      e.subBody.removeAttribute('data-soft-pad-mapping');
      e.subBody.removeAttribute('data-soft-pad-panel');
      e.subBody.removeAttribute('data-agent-load-token');
      return;
    }
    if (model.mappingId) e.subBody.setAttribute('data-soft-pad-mapping', String(model.mappingId));
    else e.subBody.removeAttribute('data-soft-pad-mapping');
    e.subBody.setAttribute('data-soft-pad-panel', String(model.panel));
    if (model.panel === 'agent' && model.agentLoadToken != null && model.agentLoadToken !== '') {
      e.subBody.setAttribute('data-agent-load-token', String(model.agentLoadToken));
    } else {
      e.subBody.removeAttribute('data-agent-load-token');
    }
    if (model.panel !== 'layout') e.subBody.classList.remove('is-editing-key');
  }

  /** P14f：SoftPad 子页 body 模型（单一来源）。 */
  function buildSoftPadSubpageModel() {
    var panelModel = buildSoftPadFourPanelModel(resolveSoftPadEntry());
    var view = panelModel.activeView || 'hub';
    var has = !!panelModel.hasMapping;
    var mappingId = panelModel.mappingId || '';
    var panel = '';
    var mode = 'clear';
    var clear = true;
    var agentLoadTokenStr = '';
    if (has && (view === 'layout' || view === 'presentation' || view === 'runtime' || view === 'agent')) {
      clear = false;
      panel = normalizeFourPanelView(view);
      if (view === 'agent' && !isHubSoftPadKind(selectedScopeId)) {
        mode = 'agent-pick';
      } else {
        mode = 'panel';
      }
      if (view === 'agent') agentLoadTokenStr = String(agentLoadToken);
    }
    var sig = [
      mappingId,
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
    return hasMapping(entry) ? entry.mapping : null;
  }

  function getSoftPadSubpagePaintOpts() {
    var targetView = softPadView;
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

  function paintSubpage(entry, paintOpts) {
    paintOpts = paintOpts || {};
    var e = els();
    var targetView = softPadView;
    var t0 = Date.now();
    if (!entry || !hasMapping(entry) || !e.subBody || targetView === 'hub') {
      if (global.__otSoftPadSubpageMounted && typeof global.__otSoftPadSubpageSync === 'function') {
        applySoftPadSubpageHost(buildSoftPadSubpageModel());
      }
      return;
    }
    // Habit「通用设置」等非 Soft Pad id 时仍画当前 Soft Pad 方案。
    if (String(entry.mapping.id) !== String(getSelectedMappingId() || '')) {
      adoptSoftPadSelection(entry);
    }
    if (String(entry.mapping.id) !== String(getSelectedMappingId() || '')) return;
    var Pad = global.OneToneCodexMicroPadUi;
    if (!Pad) {
      feLog('fe softPad.paintSubpage no Pad ui');
      return;
    }

    // P14k/l/m：同 mapping 已挂载 → 禁止 bump token / 整板 remount（checkbox / 皮肤 / 键编辑热路径）。
    if (!paintOpts.forceRemount && softPadSubpageAlreadyPainted(entry, targetView)) {
      if (targetView === 'runtime') syncRuntimeCheckboxes(entry);
      feLog('fe softPad.paintSubpage skip-remount ' + targetView);
      return;
    }

    function stillValid() {
      return softPadView === targetView &&
        hasMapping(entry) &&
        String(entry.mapping.id) === String(getSelectedMappingId() || '');
    }

    var onChanged = function (mapping, panel, changeOpts) {
      onSoftPadPanelChanged(mapping, panel || targetView, changeOpts);
    };
    if (e.subTitle) {
      if (!(global.__otSoftPadDetailChromeMounted && typeof global.__otSoftPadDetailChromeSync === 'function')) {
        e.subTitle.textContent = subpageTitle(targetView);
      }
    }
    if (!stillValid()) return;

    if (targetView === 'timeline') {
      try {
        if (Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
        e.subBody.classList.remove('is-editing-key');
        writeSoftPadTimelinePanel(null);
      } catch (err) {
        feLog('fe softPad.paintSubpage error ' + (err && err.message ? err.message : 'unknown'));
        throw err;
      } finally {
        feLog('fe softPad.paintSubpage timeline ' + (Date.now() - t0) + 'ms');
      }
      return;
    }

    if (global.__otSoftPadSubpageMounted && typeof global.__otSoftPadSubpageSync === 'function') {
      try {
        if (Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
        ++subpageToken;
        applySoftPadSubpageOuterAttrs(buildSoftPadSubpageModel());
        applySoftPadSubpageHost(buildSoftPadSubpageModel());
      } catch (err) {
        feLog('fe softPad.paintSubpage error ' + (err && err.message ? err.message : 'unknown'));
        throw err;
      } finally {
        feLog('fe softPad.paintSubpage ' + targetView + ' ' + (Date.now() - t0) + 'ms');
      }
      return;
    }

    var paintHost = softPadSubpagePaintEl(e.subBody) || e.subBody;

    try {
      if (Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
      // Layout sets is-editing-key (locks overflow). Drop it before any non-layout paint.
      if (targetView !== 'layout') {
        e.subBody.classList.remove('is-editing-key');
        paintHost.classList.remove('is-editing-key');
      }
      if (targetView === 'agent' && !isHubSoftPadKind(selectedScopeId)) {
        writeSoftPadSubpageAgentPick(paintHost);
        e.subBody.setAttribute('data-soft-pad-panel', 'agent');
        e.subBody.setAttribute('data-soft-pad-mapping', String(entry.mapping.id || ''));
        e.subBody.removeAttribute('data-agent-load-token');
        return;
      }

      if (targetView === 'timeline') {
        writeSoftPadTimelinePanel(null);
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
        e.subBody.setAttribute('data-agent-load-token', String(token));
        Pad.renderSoftPadAgentPanel(paintHost, m, {
          onChanged: onChanged,
          agentLoadToken: token
        });
      } else {
        writeSoftPadSubpageHint(paintHost, t('softPadSubUnavailable', '该面板暂不可用'));
      }
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

  function openSubpage(view, openOpts) {
    openOpts = openOpts || {};
    if (view !== 'layout' && view !== 'presentation' && view !== 'runtime' && view !== 'agent' && view !== 'timeline') return;
    // Landing lock: block non-user「改按键」steals (ghost-click / preview).
    // Real tile clicks must stay responsive immediately after entering Soft Pad.
    if (!openOpts.fromUser && view === 'layout' && Date.now() < softPadLandUntil) {
      feLog('fe softPad.openSubpage suppress-layout' + (openOpts.fromUser ? ' user' : ''));
      return;
    }
    var entry = resolveSoftPadEntry();
    // Project capsules are workspace-scoped; allow open without Soft Pad mapping.
    if (view !== 'timeline' && !hasMapping(entry)) {
      feLog('fe softPad.openSubpage skip-no-map ' + view);
      return;
    }
    if (hasMapping(entry)) adoptSoftPadSelection(entry);
    var e0 = els();
    var bodyPanel = e0.subBody && e0.subBody.getAttribute('data-soft-pad-panel');
    var panelMismatch = !!view && view !== 'timeline' && bodyPanel !== view;
    // Re-clicking the active tile must not remount — that wiped the inline key editor.
    // But if body was wiped / shows another panel (view desync), force repaint.
    if (view === softPadView) {
      feLog('fe softPad.openSubpage reclick ' + view +
        (panelMismatch ? ' mismatch=' + String(bodyPanel || '') : ''));
      if (view === 'timeline') dismissSoftPadOverlay('timeline-reclick');
      syncHubChrome(entry);
      if (view !== 'timeline' && (panelMismatch || !softPadSubpageAlreadyPainted(entry, view))) {
        // Close stale layout editor so it cannot cover tabs / steal clicks.
        try {
          var PadSame = global.OneToneCodexMicroPadUi;
          if (PadSame && PadSame.closeEditKeycap) PadSame.closeEditKeycap({ reopenInline: false });
        } catch (_) {}
        paintSubpage(entry, { forceRemount: true });
      }
      return;
    }
    feLog('fe softPad.openSubpage ' + view);
    // Close keycap editor so it cannot trap clicks / feel like 假死.
    try {
      var Pad = global.OneToneCodexMicroPadUi;
      if (Pad && Pad.closeEditKeycap) Pad.closeEditKeycap({ reopenInline: false });
    } catch (_) {}
    // Do NOT bump selectToken — cancels deferred preview paint.
    if (view === 'agent' || softPadView === 'agent') ++agentLoadToken;
    softPadView = view;
    rememberSoftPadView(view);
    // Sync chrome + light panel immediately (no blank frame between hide tiles and fill body).
    syncHubChrome(entry);
    if (view === 'timeline') {
      dismissSoftPadOverlay('timeline');
      writeSoftPadTimelinePanel(null);
      return;
    }
    paintSubpage(entry, { forceRemount: true });
    ensureSoftPadPreview(entry);
  }

  function closeSubpage() {
    var from = softPadView;
    feLog('fe softPad.closeSubpage from=' + from);
    var entry = resolveSoftPadEntry();
    if (hasMapping(entry)) adoptSoftPadSelection(entry);
    if (from === 'timeline') {
      var tmClose = global.OneToneSoftPadTimeMachine;
      if (tmClose) tmClose.closeDesk();
    }
    // 默认落地「何时显示」：其它子页返回到 runtime，不再回到空白提示态。
    if (hasMapping(entry) && from !== 'runtime') {
      openSubpage('runtime');
      return;
    }
    if (from === 'runtime') return;
    ++selectToken;
    if (from === 'agent') ++agentLoadToken;
    softPadView = 'hub';
    clearSubpage();
    var e = els();
    if (e.stage) {
      e.stage.classList.remove('is-detail-open');
      e.stage.classList.remove('is-preview-collapsed');
    }
    if (e.preview && hasMapping(entry)) {
      e.preview.hidden = false;
      e.preview.classList.remove('is-collapsed');
    } else if (e.preview) {
      e.preview.hidden = true;
    }
    updateStatusBar(entry);
    updateScopeHint();
    if (entry) {
      if (!e.tiles || !e.tiles.querySelector('[data-tile]')) renderFuncTiles(entry);
      else patchActiveTiles();
    }
    if (!hasMapping(entry)) return;
    schedulePreviewPaint(entry);
    feLog('fe softPad.closeSubpage previewQueued');
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
    var entry = resolveSoftPadEntry();
    var chips = [{ id: 'follow', html: followChipView() }];
    var purposeHtml = purposeChipView(entry);
    if (purposeHtml) chips.push({ id: 'purpose', html: purposeHtml });
    scopes.forEach(function (scope) {
      chips.push({ id: scope.id, html: appSwitcherChipView(scope) });
    });
    return {
      switcherHidden: !scopes.length,
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
        '支持 Codex、Claude、Cursor（Cursor：桌面 chord + 官方 Hook 生命周期；默认不开等待抢主控）'
      ),
    };
  }

  function renderAppSwitcher() {
    var e = els();
    if (!e.switcher) return;
    if (global.__otSoftPadWorkflowMounted && typeof global.__otSoftPadWorkflowSync === 'function') {
      global.__otSoftPadWorkflowSync();
      return;
    }
    var scopes = listAppScopes();
    if (!scopes.length) {
      e.switcher.innerHTML = '';
      e.switcher.hidden = true;
      return;
    }
    e.switcher.hidden = false;
    e.switcher.setAttribute('aria-label', t('softPadAppSwitcherAria', '应用虚拟键盘'));
    var entry = resolveSoftPadEntry();
    e.switcher.innerHTML =
      followChipView() +
      purposeChipView(entry) +
      scopes.map(appSwitcherChipView).join('');
  }

  function handleFollowChipClick(el) {
    if (!el) return true;
    var pinKind = el.getAttribute('data-lane-pin');
    if (pinKind) {
      setUserLaneId(pinKind);
      return true;
    }
    var follow = el.getAttribute('data-lane-follow');
    if (follow === 'clear') {
      clearUserLanePin();
      return true;
    }
    if (follow === 'menu') {
      var root = el.parentNode;
      if (!root) return true;
      var opts = root.querySelectorAll('[data-lane-pin]');
      var open = el.getAttribute('aria-expanded') === 'true';
      var next = !open;
      el.setAttribute('aria-expanded', next ? 'true' : 'false');
      var i;
      for (i = 0; i < opts.length; i++) {
        if (next) opts[i].removeAttribute('hidden');
        else opts[i].setAttribute('hidden', '');
      }
      return true;
    }
    return false;
  }

  /** P14e：SoftPad 预览宿主模型（单一来源）。 */
  function buildSoftPadPreviewModel() {
    var entry = resolveSoftPadEntry();
    var panelModel = buildSoftPadFourPanelModel(entry);
    var has = !!panelModel.hasMapping;
    var mappingId = panelModel.mappingId || '';
    var view = softPadView || 'hub';
    var light = view === 'runtime' || view === 'presentation' || view === 'agent';
    var canPaint = view === 'hub' || view === 'layout' || light;
    var force = !!previewForceOnce;
    var previewEmpty = panelModel.previewEmpty || resolvePreviewEmpty(entry, view);
    var emptyReason = previewEmpty === 'ready' || previewEmpty === 'none' ? '' : previewEmpty;
    var emptyHtml = emptyReason ? buildPreviewEmptyHtml(emptyReason) : '';
    var hidden = view === 'timeline' || (!has && !emptyHtml);
    var clear = !has;
    var collapsed = false;
    var skipPaint = false;
    if (has && !force) {
      if (!canPaint) skipPaint = true;
      else if (light && paintedMappingId === mappingId) {
        var e = els();
        if (e.preview && e.preview.querySelector('.codex-micro-pad.soft-pad-preview')) {
          skipPaint = true;
        }
      }
    }
    var sig = [
      mappingId,
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
      previewEmpty: previewEmpty,
      emptyReason: emptyReason,
      emptyHtml: emptyHtml,
      epoch: previewEpoch || 0,
      sig: sig
    };
  }

  function applySoftPadPreviewHost(model) {
    var e = els();
    if (!e.preview) return;
    if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
      global.__otSoftPadPreviewSync();
      return;
    }
    if (!model) model = buildSoftPadPreviewModel();
    e.preview.hidden = !!model.hidden;
    e.preview.classList.toggle('is-collapsed', !!model.collapsed);
    if (model.clear) {
      if (model.emptyHtml) {
        e.preview.innerHTML = model.emptyHtml;
        return;
      }
      e.preview.replaceChildren();
      return;
    }
    if (model.skipPaint && model.emptyHtml && model.emptyReason === 'unavailable') {
      var paint = e.preview.querySelector('[data-soft-pad-preview-paint]') || e.preview;
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
      if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
        previewForceOnce = true;
        applySoftPadPreviewHost(buildSoftPadPreviewModel());
      }
      return;
    }
    if (paintReentry > 0) return;
    var light = softPadView === 'runtime' || softPadView === 'presentation' || softPadView === 'agent' || softPadView === 'timeline';
    if (softPadView !== 'hub' && softPadView !== 'layout' && !light && !opts.force) return;
    var e = els();
    if (!e.preview) return;
    // Light pages: paint once when empty/stale — avoid remount loops (假死).
    if (light && !opts.force) {
      var hasPrev = !!e.preview.querySelector('.codex-micro-pad.soft-pad-preview');
      if (hasPrev && paintedMappingId === String(entry.mapping.id)) return;
    }

    if (global.__otSoftPadPreviewMounted && typeof global.__otSoftPadPreviewSync === 'function') {
      previewForceOnce = !!opts.force;
      paintReentry++;
      try {
        if (typeof global.__otSoftPadPreviewForce === 'function' && opts.force) {
          global.__otSoftPadPreviewForce();
        } else {
          applySoftPadPreviewHost(buildSoftPadPreviewModel());
        }
        // Only mark painted when keyboard actually landed (island paint-target may lag one frame).
        if (e.preview.querySelector('.codex-micro-pad.soft-pad-preview')) {
          paintedMappingId = String(entry.mapping.id);
        } else if (opts.force) {
          // Island sync no-oped (no paint node yet) — paint directly into host/target.
          var PadFallback = global.OneToneCodexMicroPadUi;
          if (PadFallback && PadFallback.renderSoftPadPreview) {
            var paintEl = e.preview.querySelector('[data-soft-pad-preview-paint]') || e.preview;
            PadFallback.renderSoftPadPreview(paintEl, entry.mapping, { forceFull: true });
            e.preview.hidden = false;
            if (e.preview.querySelector('.codex-micro-pad.soft-pad-preview')) {
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
        Pad.renderSoftPadPreview(e.preview, entry.mapping, opts.force ? { forceFull: true } : undefined);
        if (e.preview.querySelector('.codex-micro-pad.soft-pad-preview')) {
          paintedMappingId = String(entry.mapping.id);
        }
      } finally {
        paintReentry--;
      }
    }
  }

  /** Ensure left Soft Pad preview exists on light pages (何时显示 / 外观 / 更多). */
  function ensureSoftPadPreview(entry) {
    if (!hasMapping(entry)) return;
    paintPreview(entry);
  }

  /** Single cancelable preview queue (hub/layout refresh). Uses previewEpoch, not selectToken. */
  function schedulePreviewPaint(entry) {
    if (!hasMapping(entry)) return;
    if (softPadView !== 'hub' && softPadView !== 'layout') return;
    var token = ++previewEpoch;
    var mapId = String(entry.mapping.id);
    if (previewTimer) clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      previewTimer = 0;
      if (token !== previewEpoch) return;
      if (softPadView !== 'hub' && softPadView !== 'layout') return;
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
    syncHubChrome(entry);
  }

  function paintMain(entry, opts) {
    opts = opts || {};
    if (!hasMapping(entry)) {
      renderEmptyMain();
      return;
    }
    hideEmpty();
    setSelectedMappingId(String(entry.mapping.id));
    // Hub / 键位布局需要预览；其它轻量子页禁止重绘大键盘（假死根因）。
    if (softPadView === 'hub' || softPadView === 'layout') {
      paintPreview(entry);
      if (softPadView === 'hub') {
        var detailPanel = els().detailPanel;
        if (detailPanel && !detailPanel.hidden) clearSubpage();
        renderFuncTiles(entry);
        syncHubChrome(entry);
      } else {
        syncHubChrome(entry);
        // Avoid remounting layout tools while deferred paint runs — preserves inline editor.
        var body = els().subBody;
        var layoutReady = body &&
          body.getAttribute('data-soft-pad-panel') === 'layout' &&
          body.getAttribute('data-soft-pad-mapping') === String(entry.mapping.id);
        if (!layoutReady) paintSubpage(entry);
      }
    } else {
      syncHubChrome(entry);
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
    syncScopeChrome(entry, { rebuildSwitcher: false });
    if (softPadView === 'hub') renderFuncTiles(entry);

    if (opts.previewOnly) return;
    // Time Machine owns the stage; don't flush Soft Pad preview/layout remount under it.
    if (softPadView === 'timeline') {
      writeSoftPadTimelinePanel(null);
      return;
    }
    // 轻量子页立即刷右栏；改按键也立刻填说明区，避免先闪空白提示。
    // 键位预览仍走下面的 deferred paint（假死根因）。
    if (softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent' ||
        softPadView === 'layout') {
      paintSubpage(entry);
      if (softPadView !== 'layout') {
        ensureSoftPadPreview(entry);
        return;
      }
    }

    if (selectTimer) clearTimeout(selectTimer);
    // Never sync-paint on open: even immediateMgr waits one frame so drawer can paint.
    var delay = opts.immediateMgr ? 0 : 16;
    selectTimer = setTimeout(function () {
      selectTimer = 0;
      if (token !== selectToken) return;
      if (String(getSelectedMappingId()) !== String(entry.mapping.id)) return;
      if (softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent') return;
      requestAnimationFrame(function () {
        if (token !== selectToken) return;
        if (softPadView === 'presentation' || softPadView === 'runtime' || softPadView === 'agent') return;
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
      softPadView = 'hub';
      renderSchemeList();
      renderEmptyMain();
      return;
    }

    if (opts.scopeId) {
      selectedScopeId = String(opts.scopeId);
    } else if (opts.fromList || !selectedScopeId || selectedScopeId === 'global') {
      selectedScopeId = entry.kind;
    }

    if (opts.resetView !== false) {
      // Stay on Time Machine unless caller forces another Soft Pad tile.
      if (softPadView === 'timeline' && !(opts.forceView && opts.forceView !== 'timeline')) {
        /* keep timeline */
      } else {
        // Default landing: 何时显示；later opens restore last tile.
        softPadView = defaultDetailView(opts);
        rememberSoftPadView(softPadView);
      }
    }

    var sameMap = id === String(getSelectedMappingId() || '');
    var hostsOk = !hostsNeedPaint(entry);

    // Same mapping (e.g. 全局 ↔ Codex 共用) or already painted: chrome + skip pad remount.
    if (sameMap && hostsOk && !opts.forceRemount) {
      syncScopeChrome(entry, { rebuildSwitcher: !!opts.rebuildList });
      if (opts.rebuildList) renderSchemeList();
      renderFuncTiles(entry);
      if (softPadView !== 'hub') {
        paintSubpage(entry);
        if (softPadView !== 'layout') ensureSoftPadPreview(entry);
      }
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
    ++selectToken;
    ++agentLoadToken;

    var scope = findScope(scopeId);
    if (!scope) {
      softPadView = 'hub';
      clearSubpage();
      renderEmptyMain();
      return;
    }

    // Same chip re-click: keep / restore default 何时显示 detail (no idle tip).
    if (!opts.force && String(scope.id) === String(selectedScopeId || '') &&
        scope.mapping && String(scope.mapping.id) === String(getSelectedMappingId() || '') &&
        !hostsNeedPaint(scope.entry)) {
      softPadView = defaultDetailView(opts);
      rememberSoftPadView(softPadView);
      syncScopeChrome(scope.entry, { rebuildSwitcher: false });
      renderFuncTiles(scope.entry);
      paintSubpage(scope.entry);
      return;
    }

    selectedScopeId = String(scope.id);

    // Missing mapping → view + CTA only. Never auto-create on tab switch.
    if (!scope.entry || !scope.mapping) {
      softPadView = 'hub';
      clearSubpage();
      showPrepareMain(scope);
      requestOverlayUsageForScope(selectedScopeId);
      return;
    }

    // Existing app: cheap switch — preview + default layout detail.
    selectScheme(scope.mapping.id, {
      scopeId: selectedScopeId,
      rebuildList: !!opts.rebuildList,
      previewOnly: false,
      forceRemount: false,
      resetView: true
    });
    requestOverlayUsageForScope(selectedScopeId);
  }

  function renderSchemeRow(entry) {
    var hasMap = !!(entry.mapping && entry.mapping.id);
    var active = false;
    if (hasMap) {
      active = selectedScopeId === entry.kind;
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

  function renderSchemeList() {
    var e = els();
    if (!e.list) return;
    if (global.__otSoftPadWorkflowMounted && typeof global.__otSoftPadWorkflowSync === 'function') {
      // P14b owns title/count/aside via SoftPadSchemeListIsland — do not dual-write.
      global.__otSoftPadWorkflowSync();
      return;
    }
    if (e.titleLbl) e.titleLbl.textContent = t('softPadSchemeTitle', '选应用');
    if (e.aside) e.aside.setAttribute('aria-label', t('keysHubTitle', '方案'));
    var entries = listAsideEntries();
    if (e.count) e.count.textContent = String(entries.length);
    if (!entries.length) {
      e.list.innerHTML = '<p class="keys-hub-empty">' + esc(t('softPadHubEmptyTitle', '还没有可管理的虚拟键盘')) + '</p>';
      return;
    }
    e.list.innerHTML = '<div class="keys-hub-scheme-group">' +
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
    if (!m) return;
    selectedScopeId = kind || 'codex';
    lastSoftPadView = 'runtime';
    renderSchemeList();
    selectScheme(m.id, {
      force: true,
      forceRemount: true,
      scopeId: selectedScopeId,
      rebuildList: true,
      firstPrepare: true
    });
  }

  function applyEnabledUi(entry) {
    if (!entry) return;
    entry.padEnabled = !!(entry.mapping && entry.mapping.codexMicroPad &&
      entry.mapping.codexMicroPad.enabled);
    pruneInvalidUserLanePin(listSoftPadSchemes());
    updateStatusBar(entry);
    patchSchemeRowEnable(entry);
    if (!patchAppSwitcher()) renderAppSwitcher();
    updateScopeHint();
    if (softPadView === 'hub') renderFuncTiles(entry);
    else if (softPadView === 'runtime') syncRuntimeCheckboxes(entry);
    if (softPadView === 'hub' || softPadView === 'layout') {
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
      navKeysEnabled: m.codexMicroPad.navKeysEnabled !== false
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
    if (softPadView !== 'agent') return false;
    if (token != null && Number(token) !== Number(agentLoadToken)) return false;
    if (mappingId != null && String(mappingId) !== String(getSelectedMappingId() || '')) return false;
    var ui = global.OneToneState && global.OneToneState.ui;
    if (ui) {
      if (ui.drawerOpen === false) return false;
      if (ui.settingsPanel && ui.settingsPanel !== 'softPad') return false;
    }
    return true;
  }

  function bindChrome() {
    if (chromeBound) return;
    chromeBound = true;
    var e = els();
    if (e.switcher) {
      e.switcher.addEventListener('click', function (ev) {
        var followEl = ev.target.closest && ev.target.closest('[data-lane-follow], [data-lane-pin]');
        if (followEl && handleFollowChipClick(followEl)) return;
        var purposeEl = ev.target.closest && ev.target.closest('[data-pad-purpose]');
        if (purposeEl && handlePurposeChipClick(purposeEl)) return;
        var chip = ev.target.closest && ev.target.closest('[data-scope]');
        if (!chip) return;
        // Tab = browse only — does not write userLaneId.
        selectScope(chip.getAttribute('data-scope'));
      });
    }
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
    if (e.subBack && !(global.__otSoftPadDetailChromeMounted)) {
      e.subBack.addEventListener('click', function () { closeSubpage(); });
    }
    if (e.list) {
      e.list.addEventListener('click', function (ev) {
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
          forceRemount: false,
          resetView: true
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
        var btn = ev.target.closest && ev.target.closest('[data-cockpit-action]');
        if (!btn || btn.disabled) return;
        ev.preventDefault();
        handleStatusAction(btn.getAttribute('data-cockpit-action'));
      });
    }
    var flowNodes = document.getElementById('softPadFlowNodes');
    if (flowNodes) {
      flowNodes.addEventListener('click', function (ev) {
        var btn = ev.target.closest && ev.target.closest('.flow-node-btn');
        if (!btn) return;
        var node = btn.closest('[data-soft-pad-node]');
        if (!node) return;
        goSoftPadFlowNode(node.getAttribute('data-soft-pad-node'));
      });
    }
    if (e.subHost) {
      e.subHost.addEventListener('click', function (ev) {
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
      // Timeline owns the stage — don't remount Soft Pad preview/chrome under it.
      if (softPadView === 'timeline') return;
      // Never remount pad while on light subpages (显示形态/返回假死).
      if (softPadView === 'hub' || softPadView === 'layout') {
        schedulePreviewPaint(entry);
      }
      if (softPadView === 'hub') renderFuncTiles(entry);
      else {
        syncHubChrome(entry);
        if (softPadView === 'runtime') syncRuntimeCheckboxes(entry);
      }
    }
  }

  function render(opts) {
    opts = opts || {};
    var t0 = Date.now();
    feLog('fe softPad.render begin');
    // Guardrail: when Soft Pad opens right after a Home guide/veil mis-sync,
    // the veil can stay pointer-blocking even if it's not obvious visually.
    // Close it here so Soft Pad doesn't make the rest of the nav unclickable.
    try {
      if (global.OneToneHomeGuide && typeof global.OneToneHomeGuide.close === 'function') {
        global.OneToneHomeGuide.close(true);
      }
    } catch (_) {}
    dismissSoftPadOverlay('render');
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
    bindChrome();
    // Drop stale timeline landing from a previous TM visit (otherwise Soft Pad opens into TM).
    if (lastSoftPadView === 'timeline') lastSoftPadView = 'runtime';
    try {
      var tmReset = global.OneToneSoftPadTimeMachine;
      if (tmReset && tmReset.closeDesk) tmReset.closeDesk();
    } catch (_) {}
    var e = els();
    applySoftPadEnsureCtaHost(buildSoftPadEnsureCtaModel());
    var entries = listSoftPadSchemes();
    renderSchemeList();
    renderAppSwitcher();
    updateScopeHint();

    if (opts.scopeId) selectedScopeId = String(opts.scopeId);
    if (selectedScopeId === 'global') selectedScopeId = 'codex';
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
      softPadView = 'hub';
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
      softPadView = 'hub';
      clearSubpage();
      showPrepareMain(findScope(selectedScopeId || 'codex'));
      ensureSoftPadBoundaryHint();
      if (global.OneToneHabitChannelStatusStrip && global.OneToneHabitChannelStatusStrip.render) {
        try { global.OneToneHabitChannelStatusStrip.render(); } catch (_) {}
      }
      feLog('fe softPad.render prepare ' + (Date.now() - t0) + 'ms scope=' + String(selectedScopeId || ''));
      return;
    }

    // Clear under hub so clearSubpage force-hide matches view.
    softPadView = 'hub';
    clearSubpage();
    var openScopeId = selectedScopeId;
    var openEntry = resolveSoftPadEntry();
    // Always「何时显示」— never restore 改按键 (layout editor wedges tabs).
    var landView = 'runtime';
    // 2.5s covers drawer open ghost-click + deferred island remount.
    softPadLandUntil = Date.now() + 2500;
    feLog('fe softPad.land ' + landView);
    if (hasMapping(openEntry)) {
      hideEmpty();
      adoptSoftPadSelection(openEntry);
      try { openSubpage(landView); } catch (err) {
        feLog('fe softPad.land error ' + (err && err.message ? err.message : 'unknown'));
      }
      ensureSoftPadPreview(openEntry);
      updateStatusBar(openEntry);
      ensureSoftPadLeftChrome(openEntry);
    }
    var openGen = ++softPadOpenGen;
    function paintSoftPadLanding() {
      if (openGen !== softPadOpenGen) return;
      var ui = global.OneToneState && global.OneToneState.ui;
      if (ui && ui.settingsPanel && ui.settingsPanel !== 'softPad') return;
      var landed = resolveSoftPadEntry();
      if (!hasMapping(landed)) return;
      adoptSoftPadSelection(landed);
      softPadLandUntil = Date.now() + 2500;
      // The first pass already selected and painted runtime. Re-selecting with a forced remount
      // cleared the fresh island body and synchronously repainted the keyboard, freezing entry.
      softPadView = landView;
      rememberSoftPadView(landView);
      syncHubChrome(landed);
      if (!softPadSubpageAlreadyPainted(landed, landView)) {
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
    }
    // Second pass after island paint-targets commit (createRoot is async).
    requestAnimationFrame(function () {
      setTimeout(paintSoftPadLanding, 0);
    });
  }

  function ensureSoftPadBoundaryHint() {
    var panel = document.getElementById('settingsPanelSoftPad');
    if (!panel) return;
    var hint = document.getElementById('softPadBoundaryHint');
    if (!hint) {
      hint = document.createElement('p');
      hint.id = 'softPadBoundaryHint';
      hint.className = 'soft-pad-boundary-hint';
      hint.setAttribute('role', 'note');
      var status = document.getElementById('softPadStatusBar');
      var strip = document.getElementById('habitChannelStatusStripSoftPad');
      var anchor = status || panel.firstChild;
      if (strip && strip.nextSibling) panel.insertBefore(hint, strip.nextSibling);
      else if (status) panel.insertBefore(hint, status);
      else panel.insertBefore(hint, anchor);
    }
    hint.textContent = t(
      'softPadHubSupportRange',
      '支持 Codex、Claude、Cursor（Cursor：桌面 chord + 官方 Hook 生命周期；默认不开等待抢主控）'
    );
    var entries = listSoftPadSchemes();
    // Always show support range when no real Soft Pad app scenarios exist.
    hint.hidden = entries.length > 0;
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
    refreshSelected: refreshSelected,
    schedulePreviewPaint: schedulePreviewPaint,
    onPanelLeave: onPanelLeave,
    ensureAppSoftPad: ensureAppSoftPad,
    isAgentPanelCurrent: isAgentPanelCurrent,
    isPaintBusy: function () { return paintBusy || paintReentry > 0 || !!previewTimer; },
    getView: function () { return softPadView; },
    listSoftPadSchemes: listSoftPadSchemes,
    listAppScopes: listAppScopes,
    listHubEntries: listHubEntries,
    resolveSoftPadEntry: resolveSoftPadEntry,
    adoptSoftPadSelection: adoptSoftPadSelection,
    isSoftPadSchemeEligible: isSoftPadSchemeEligible,
    resolvePrimaryLane: resolvePrimaryLane,
    resolvePrimaryLaneResult: resolvePrimaryLaneResult,
    laneContextFromRuntime: laneContextFromRuntime,
    noteLaneForeground: noteLaneForeground,
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
