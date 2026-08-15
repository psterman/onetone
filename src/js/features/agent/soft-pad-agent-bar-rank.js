/**
 * Soft Pad agent bar rank: active-first, then recent idle.
 * Pure — no DOM.
 *
 * Pad + Mini: show VISIBLE_PAD chips; fold remainder with +N when rest nonempty.
 * Pad expands in-place to two rows; Mini +N opens the full Soft Pad.
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
    'qoder',
    'cline',
    'opencode',
    'aider'
  ];

  /** Grey placeholders until lights land (B/C). */
  var PLACEHOLDER_KINDS = ['workbuddy', 'traeCode', 'qoder'];

  /** Mini visible chip cap; fold with +N when rest nonempty. */
  var VISIBLE_PAD = 6;

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

  function stateRank(state) {
    // Row1 prefers live-active; then terminal; idle last (recency breaks ties).
    if (state === 'needs_input') return 0;
    if (state === 'running') return 1;
    if (state === 'done' || state === 'failed') return 2;
    return 3;
  }

  function isEligible(row) {
    if (!row) return false;
    return !!(row.lightsEnabled || row.lights_enabled);
  }

  function isPlaceholderKind(kind) {
    return PLACEHOLDER_KINDS.indexOf(String(kind || '')) >= 0;
  }

  function updatedAt(row) {
    var n = Number(
      row && (row.updatedAt != null ? row.updatedAt : row.updated_at)
    );
    return isFinite(n) ? n : 0;
  }

  /**
   * @param {object} snap overlay snapshot
   * @param {object} byKind kind → agent row
   * @param {string} focus usage focus kind
   * @param {object} recencyMap kind → ms timestamp
   * @param {{ visibleMax?: number }} [opts]
   * @returns {{ top: string[], rest: string[] }}
   */
  function rankPadAgentBarKinds(snap, byKind, focus, recencyMap, opts) {
    byKind = byKind || {};
    recencyMap = recencyMap || {};
    opts = opts || {};
    var visibleMax =
      opts.visibleMax != null && isFinite(Number(opts.visibleMax))
        ? Math.max(0, Math.floor(Number(opts.visibleMax)))
        : VISIBLE_PAD;
    focus = String(focus || '').trim().toLowerCase();
    var fg = String(
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

    var eligible = [];
    CATALOG.forEach(function (kind) {
      var row = byKind[kind];
      if (!isEligible(row)) return;
      eligible.push(kind);
    });

    eligible.sort(function (a, b) {
      var ra = byKind[a] || {};
      var rb = byKind[b] || {};
      var sa = normalizeState(ra, a, snap);
      var sb = normalizeState(rb, b, snap);
      var d = stateRank(sa) - stateRank(sb);
      if (d) return d;
      if (a === focus && b !== focus) return -1;
      if (b === focus && a !== focus) return 1;
      if (a === fg && b !== fg) return -1;
      if (b === fg && a !== fg) return 1;
      var ta = Number(recencyMap[a]) || 0;
      var tb = Number(recencyMap[b]) || 0;
      if (tb !== ta) return tb - ta;
      var ua = updatedAt(ra);
      var ub = updatedAt(rb);
      if (ub !== ua) return ub - ua;
      return catalogIndex(a) - catalogIndex(b);
    });

    return {
      top: eligible.slice(0, visibleMax),
      rest: eligible.slice(visibleMax)
    };
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
    isPlaceholderKind: isPlaceholderKind
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.OneToneSoftPadAgentBarRank = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
