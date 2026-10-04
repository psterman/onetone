/**
 * Unique Board DTO + projector for Agent home data board.
 * One fact source: usage-shaped fields → board agent. No parallel stats.*.
 */
(function (global) {
  'use strict';

  function kindKey(kind) {
    return String(kind || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '');
  }

  function canonicalId(kind) {
    var k = kindKey(kind);
    return k === 'traecode' ? 'traeCode' : k;
  }

  function usageVal(usage, camel, snake) {
    if (!usage) return null;
    if (usage[camel] != null && usage[camel] !== '') return usage[camel];
    if (usage[snake] != null && usage[snake] !== '') return usage[snake];
    return null;
  }

  function isCursorLocalReady(usage) {
    usage = usage || {};
    var status = String(usage.status || '');
    var conf = String(usage.confidence || '');
    var src = String(usage.source || '');
    return (
      status === 'ready' &&
      (src === 'cursor_local_activity' || conf === 'local_only')
    );
  }

  /**
   * Cost honesty (same as agent-data-bridge):
   * official booked; estimate display-only; never invent.
   */
  function projectCost(usage) {
    usage = usage || {};
    var official = usageVal(usage, 'totalCostUsd', 'total_cost_usd');
    if (official == null) official = usageVal(usage, 'sessionCostUsd', 'session_cost_usd');
    var est = usageVal(usage, 'estimatedCostUsd', 'estimated_cost_usd');
    var isEst =
      usage.costIsEstimate === true ||
      usage.cost_is_estimate === true ||
      String(usage.costBasis || usage.cost_basis || '').toLowerCase() === 'estimate';

    if (official != null && isFinite(Number(official))) {
      var o = Number(official);
      return { costBasis: 'official', usd: o, usdBooked: o };
    }
    if (est != null && isFinite(Number(est))) {
      var e = Number(est);
      if (isEst) return { costBasis: 'estimate', usd: e, usdBooked: null };
      return { costBasis: 'official', usd: e, usdBooked: e };
    }
    return { costBasis: 'unpriced', usd: null, usdBooked: null };
  }

  function remainingPct(usage) {
    var rem = usageVal(usage, 'remainingPercent', 'remaining_percent');
    if (rem == null || !isFinite(Number(rem))) return null;
    return Math.round(Number(rem));
  }

  function projectSignalGroup(row) {
    var hasActivity =
      row.turns != null ||
      row.sessions != null ||
      row.activeMin != null ||
      row.tok != null ||
      row.usd != null;
    var signal = !!(hasActivity || row.status === 'ready' || row.tight);
    var group = 'offline';
    if (hasActivity) group = 'active';
    else if (row.remainingPercent != null) group = 'quota';
    return { signal: signal, group: group };
  }

  function effOf(a) {
    if (!a || a.turns == null || a.activeMin == null || !a.activeMin) return null;
    return Math.round((a.turns / (a.activeMin / 60)) * 10) / 10;
  }

  function filterAgents(agents, filter) {
    agents = Array.isArray(agents) ? agents : [];
    var f = String(filter || 'all');
    if (f === 'all') return agents.slice();
    return agents.filter(function (a) {
      if (!a) return false;
      if (f === 'quota') return a.remainingPercent != null;
      if (f === 'activity') return a.group === 'active';
      if (f === 'unwired') return a.group === 'offline';
      if (f === 'domestic') return !!a.domestic;
      return true;
    });
  }

  /** Sum only official booked USD; estimates excluded. */
  function ledgerBookedSum(agents) {
    var sum = null;
    (agents || []).forEach(function (a) {
      var v = null;
      if (a && a.usdBooked != null && isFinite(Number(a.usdBooked))) v = Number(a.usdBooked);
      else if (a && a.costBasis === 'official' && a.usd != null && isFinite(Number(a.usd))) v = Number(a.usd);
      if (v != null) sum = (sum || 0) + v;
    });
    return sum;
  }

  function ledgerMissCount(agents) {
    var miss = 0;
    (agents || []).forEach(function (a) {
      if (!a) return;
      if (a.costBasis === 'unpriced' || (a.usd == null && a.costBasis !== 'estimate')) miss++;
      else if (a.usd == null) miss++;
    });
    return miss;
  }

  function projectBoardAgent(detectRow) {
    if (!detectRow) return null;
    var id = canonicalId(detectRow.kind || detectRow.id);
    var usage = detectRow.usage || {};
    var cost = projectCost(usage);
    var rem = remainingPct(usage);
    var tight = rem != null && rem <= 40;

    var turns = null;
    var sessions = null;
    var activeMin = null;
    if (kindKey(id) === 'cursor' && isCursorLocalReady(usage)) {
      var t = usageVal(usage, 'localTodayRequests', 'local_today_requests');
      var s = usageVal(usage, 'localTodaySessions', 'local_today_sessions');
      var ms = usageVal(usage, 'localTodayActiveMs', 'local_today_active_ms');
      if (t != null && isFinite(Number(t))) turns = Math.round(Number(t));
      if (s != null && isFinite(Number(s))) sessions = Math.round(Number(s));
      if (ms != null && isFinite(Number(ms)) && Number(ms) > 0) {
        activeMin = Math.round(Number(ms) / 60000);
      }
    }

    var tok = usageVal(usage, 'localTodayTokens', 'local_today_tokens');
    if (tok == null) tok = usageVal(usage, 'sessionTokens', 'session_tokens');
    if (tok != null && isFinite(Number(tok))) tok = Math.round(Number(tok));
    else tok = null;

    var row = {
      id: id,
      name: detectRow.name || id,
      connect: detectRow.connect || '',
      presence: detectRow.presence || 'none',
      running: !!detectRow.running,
      padReady: !!detectRow.padReady,
      hook: detectRow.hook || 'missing',
      light: detectRow.light || 'unknown',
      turns: turns,
      sessions: sessions,
      activeMin: activeMin,
      tok: tok,
      usd: cost.usd,
      usdBooked: cost.usdBooked,
      costBasis: cost.costBasis,
      remainingPercent: rem,
      tight: tight,
      domestic: !!usage.domestic,
      cacheHit: usage.cacheHit != null ? usage.cacheHit : null,
      peakLabel: null,
      peakEff: null,
      model: String(usage.model || '').trim() || '—',
      modelConf: String(usage.modelConfidence || usage.model_confidence || 'med'),
      note: String(usage.message || usage.sourceLabel || usage.source || '').trim(),
      status: String(usage.status || ''),
      message: String(usage.message || '').trim(),
      source: String(usage.source || ''),
      confidence: String(usage.confidence || ''),
      eff: null
    };
    row.eff = effOf(row);
    var sg = projectSignalGroup(row);
    row.signal = sg.signal;
    row.group = sg.group;
    return row;
  }

  function projectBoardDto(snapshot, opts) {
    opts = opts || {};
    var agents = (snapshot.agents || []).map(projectBoardAgent).filter(Boolean);
    var focusId = canonicalId(opts.focusId || '');
    if (!focusId || !agents.some(function (a) { return a.id === focusId; })) {
      var cursor = agents.find(function (a) { return a.id === 'cursor'; });
      var live = agents.find(function (a) { return a.signal; });
      focusId = (cursor && cursor.id) || (live && live.id) || (agents[0] && agents[0].id) || '';
    }
    var cursor = agents.find(function (a) { return a.id === 'cursor'; });
    var cursorReady = !!(cursor && isCursorLocalReady({
      status: cursor.status,
      source: cursor.source,
      confidence: cursor.confidence
    }));
    return {
      asOf: snapshot.scannedAt || '今日',
      range: 'day',
      sceneId: snapshot.sceneId,
      onetoneToday: snapshot.onetoneToday || {},
      agents: agents,
      focusId: focusId,
      cursorReady: cursorReady,
      cursorNeedsConsent: !!(
        cursor &&
        !cursorReady &&
        /未启用|活动统计/.test(String(cursor.message || cursor.note || ''))
      )
    };
  }

  var api = {
    kindKey: kindKey,
    canonicalId: canonicalId,
    projectCost: projectCost,
    projectBoardAgent: projectBoardAgent,
    projectBoardDto: projectBoardDto,
    effOf: effOf,
    filterAgents: filterAgents,
    ledgerBookedSum: ledgerBookedSum,
    ledgerMissCount: ledgerMissCount,
    isCursorLocalReady: isCursorLocalReady
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.AgentBoardDto = api;
})(typeof window !== 'undefined' ? window : globalThis);
