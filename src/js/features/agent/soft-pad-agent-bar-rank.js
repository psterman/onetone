/**
 * Soft Pad agent bar rank: stable order + foreground pin only.
 * Pure — no DOM.
 *
 * Pad + Mini: show VISIBLE_PAD chips; fold remainder with +N when rest nonempty.
 * Other chips keep sticky relative order — do not reshuffle on running/done/recency.
 */
(function (root) {
  'use strict';

  var CATALOG = [
    'codex',
    'claude',
    'cursor',
    'copilotCli',
    'gemini',
    'minimax',
    'workbuddy',
    'trae',
    'traeCode',
    'windsurf',
    'qoder',
    'cline',
    'opencode',
    'aider'
  ];

  /** Grey placeholders until lights land (B/C). */
  var PLACEHOLDER_KINDS = ['workbuddy', 'traeCode', 'qoder'];

  /** Mini visible chip cap; fold with +N when rest nonempty. */
  var VISIBLE_PAD = 6;

  /** Sticky relative order of eligible kinds (FG is pinned only in the display list). */
  var stickyOrder = [];

  function catalogIndex(kind) {
    var i = CATALOG.indexOf(String(kind || ''));
    return i < 0 ? 999 : i;
  }

  function normalizeState(row, kind, snap) {
    var state = String((row && row.state) || 'idle')
      .trim()
      .toLowerCase() || 'idle';
    if (state === 'error') state = 'failed';
    // Mirror overlay Claude fallback so ranking matches visible lamp.
    if (kind === 'claude' && state === 'idle' && snap) {
      var appAgent = String(snap.appAgent || snap.app_agent || '')
        .trim()
        .toLowerCase();
      var appStatus = String(snap.appStatus || snap.app_status || '')
        .trim()
        .toLowerCase();
      var appSrc = String(snap.appLastSource || snap.app_last_source || '')
        .trim()
        .toLowerCase();
      var waitingHint = String(
        snap.claudeWaitingHint || snap.claude_waiting_hint || ''
      ).trim();
      var claudeLiveSrc = appSrc === 'claude_hook' || appSrc === 'claude_app';
      if (
        (appAgent === 'claude' || claudeLiveSrc) &&
        (appStatus === 'running' ||
          appStatus === 'needs_input' ||
          appStatus === 'done' ||
          appStatus === 'failed')
      ) {
        state = appStatus;
      } else if (waitingHint) {
        state = 'needs_input';
      }
    }
    return state;
  }

  function isLiveActive(state) {
    return state === 'needs_input' || state === 'running';
  }

  function isEligible(row) {
    if (!row) return false;
    return !!(row.lightsEnabled || row.lights_enabled);
  }

  function isPlaceholderKind(kind) {
    return PLACEHOLDER_KINDS.indexOf(String(kind || '')) >= 0;
  }

  function resetStickyOrder() {
    stickyOrder = [];
  }

  function syncSticky(eligible) {
    var elig = {};
    (eligible || []).forEach(function (k) {
      elig[k] = 1;
    });
    stickyOrder = stickyOrder.filter(function (k) {
      return !!elig[k];
    });
    var seen = {};
    stickyOrder.forEach(function (k) {
      seen[k] = 1;
    });
    var newcomers = (eligible || []).filter(function (k) {
      return !seen[k];
    });
    newcomers.sort(function (a, b) {
      return catalogIndex(a) - catalogIndex(b);
    });
    stickyOrder = stickyOrder.concat(newcomers);
    return stickyOrder.slice();
  }

  function resolveForeground(snap) {
    return String(
      (snap &&
        (snap.foregroundAgent ||
          snap.foreground_agent ||
          snap.appliedAgent ||
          snap.applied_agent ||
          snap.appAgent ||
          snap.app_agent)) ||
        ''
    )
      .trim()
      .toLowerCase();
  }

  /**
   * @param {object} snap overlay snapshot
   * @param {object} byKind kind → agent row
   * @param {string} _focus unused (kept for call-site compat; FG only)
   * @param {object} _recencyMap unused (kept for call-site compat)
   * @param {{ visibleMax?: number, sticky?: string[] }} [opts]
   * @returns {{ top: string[], rest: string[] }}
   */
  function rankPadAgentBarKinds(snap, byKind, _focus, _recencyMap, opts) {
    byKind = byKind || {};
    opts = opts || {};
    var visibleMax =
      opts.visibleMax != null && isFinite(Number(opts.visibleMax))
        ? Math.max(0, Math.floor(Number(opts.visibleMax)))
        : VISIBLE_PAD;

    var eligible = [];
    CATALOG.forEach(function (kind) {
      var row = byKind[kind];
      if (!isEligible(row)) return;
      eligible.push(kind);
    });

    // Tests / callers may pass an explicit sticky seed once.
    if (Array.isArray(opts.sticky) && opts.sticky.length && stickyOrder.length === 0) {
      stickyOrder = opts.sticky.slice();
    }

    var base = syncSticky(eligible);
    var fg = resolveForeground(snap);
    var order = base.slice();
    if (fg && eligHas(eligible, fg)) {
      order = [fg].concat(
        order.filter(function (k) {
          return k !== fg;
        })
      );
    }

    return {
      top: order.slice(0, visibleMax),
      rest: order.slice(visibleMax)
    };
  }

  function eligHas(eligible, kind) {
    for (var i = 0; i < eligible.length; i++) {
      if (eligible[i] === kind) return true;
    }
    return false;
  }

  /**
   * Merge grey placeholders (missing from byKind / not lit) into top/rest.
   * Fill remaining top slots first; overflow to rest (+N).
   */
  function mergePlaceholderKinds(ranked, byKind, visibleMax) {
    ranked = ranked || { top: [], rest: [] };
    byKind = byKind || {};
    visibleMax =
      visibleMax != null && isFinite(Number(visibleMax))
        ? Math.max(0, Math.floor(Number(visibleMax)))
        : VISIBLE_PAD;
    var top = (ranked.top || []).slice();
    var rest = (ranked.rest || []).slice();
    var seen = {};
    top.forEach(function (k) {
      seen[k] = 1;
    });
    rest.forEach(function (k) {
      seen[k] = 1;
    });
    PLACEHOLDER_KINDS.forEach(function (kind) {
      if (seen[kind]) return;
      var row = byKind[kind];
      if (isEligible(row)) return;
      if (top.length < visibleMax) top.push(kind);
      else rest.push(kind);
      seen[kind] = 1;
    });
    return { top: top, rest: rest };
  }

  /** Perimeter aura: first non-idle among ranked chips, else ''. */
  function padLightFromRanked(snap, byKind, focus, recencyMap) {
    var ranked = rankPadAgentBarKinds(snap, byKind, focus, recencyMap, {
      visibleMax: VISIBLE_PAD
    });
    var top = ranked.top || [];
    for (var i = 0; i < top.length; i++) {
      var st = normalizeState(byKind[top[i]] || {}, top[i], snap);
      if (st === 'error') st = 'failed';
      if (
        st === 'needs_input' ||
        st === 'running' ||
        st === 'done' ||
        st === 'failed' ||
        st === 'listening'
      ) {
        return st;
      }
    }
    return '';
  }

  var api = {
    CATALOG: CATALOG,
    PLACEHOLDER_KINDS: PLACEHOLDER_KINDS,
    VISIBLE_PAD: VISIBLE_PAD,
    rankPadAgentBarKinds: rankPadAgentBarKinds,
    mergePlaceholderKinds: mergePlaceholderKinds,
    padLightFromRanked: padLightFromRanked,
    normalizeState: normalizeState,
    isLiveActive: isLiveActive,
    isEligible: isEligible,
    isPlaceholderKind: isPlaceholderKind,
    resetStickyOrder: resetStickyOrder,
    getStickyOrder: function () {
      return stickyOrder.slice();
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.OneToneSoftPadAgentBarRank = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
