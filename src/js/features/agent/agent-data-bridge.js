/**
 * Parent → iframe bridge for workbench「数据」盘点墙.
 * Projects CodexMicroOverlaySnapshot.agents into the board DTO (no history invent).
 */
(function (root) {
  'use strict';

  var POLL_MS = 20000;
  var FRAME_ID = 'agentDataProtoFrame';
  var MSG_TYPE = 'ot-agent-data';

  var AGENT_NAMES = {
    cursor: 'Cursor',
    claude: 'Claude',
    codex: 'Codex',
    minimax: 'MiniMax',
    workbuddy: 'WorkBuddy',
    trae: 'Trae',
    traecode: 'Trae Code',
    qoder: 'Qoder',
    gemini: 'Gemini',
    copilotcli: 'Copilot CLI',
    cline: 'Cline',
    roo: 'Roo',
    opencode: 'OpenCode',
    aider: 'Aider'
  };

  var pollTimer = 0;
  var inFlight = false;
  var lastPayload = null;
  var frameBound = false;

  function usageVal(usage, camel, snake) {
    if (!usage) return null;
    if (usage[camel] != null && usage[camel] !== '') return usage[camel];
    if (usage[snake] != null && usage[snake] !== '') return usage[snake];
    return null;
  }

  /** Same gate as Soft Pad previewUsageDetailForScope (Cursor local activity). */
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

  function kindKey(kind) {
    return String(kind || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '');
  }

  function displayName(kind) {
    var k = kindKey(kind);
    if (AGENT_NAMES[k]) return AGENT_NAMES[k];
    var raw = String(kind || '').trim();
    return raw || 'Agent';
  }

  function noteFor(kind, usage) {
    usage = usage || {};
    var msg = String(usage.message || '').trim();
    if (msg) return msg;
    var k = kindKey(kind);
    if (k === 'cursor') {
      return isCursorLocalReady(usage)
        ? '本机活动 · 非官方额度'
        : '未启用或暂无 Cursor 本地活动读数';
    }
    if (k === 'claude') return 'OTel / statusLine · 可知 $ 才计入费用';
    if (k === 'codex') return 'Account 轮询 · 无单价则费用 —';
    return String(usage.source || usage.status || '用量快照');
  }

  /** Board lenses need these even when Soft Pad lights are off. */
  function isCoreKind(kind) {
    var k = kindKey(kind);
    return k === 'cursor' || k === 'claude' || k === 'codex';
  }

  function remainingPct(usage) {
    var rem = usageVal(usage, 'remainingPercent', 'remaining_percent');
    if (rem == null || !isFinite(Number(rem))) return null;
    return Math.round(Number(rem));
  }

  function projectAgentRow(agent) {
    if (!agent) return null;
    var kindRaw = String(agent.kind || '').trim();
    var kind = kindRaw.toLowerCase();
    if (!kind) return null;
    var usage = agent.usage || agent.usageStats || agent.usage_stats || {};
    var lights = !!(agent.lightsEnabled != null
      ? agent.lightsEnabled
      : agent.lights_enabled);
    var status = String(usage.status || '');
    var hook =
      agent.hookConfigured != null
        ? !!agent.hookConfigured
        : agent.hook_configured != null
          ? !!agent.hook_configured
          : false;
    // Keep Cursor/Claude/Codex always (效率/费用依赖)；其余要灯效、ready 或已装 Hook。
    if (!isCoreKind(kind) && !lights && status !== 'ready' && !hook) return null;

    var turns = null;
    var sessions = null;
    var activeMin = null;
    if (kindKey(kind) === 'cursor' && isCursorLocalReady(usage)) {
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
    if (tok == null) tok = usageVal(usage, 'latestDailyTokens', 'latest_daily_tokens');
    if (tok != null && isFinite(Number(tok))) tok = Math.round(Number(tok));
    else tok = null;

    var usd = usageVal(usage, 'estimatedCostUsd', 'estimated_cost_usd');
    if (usd != null && isFinite(Number(usd))) usd = Number(usd);
    else usd = null;

    var rem = remainingPct(usage);
    var model = String(agent.model || '').trim();
    var modelConf = String(
      agent.modelConfidence != null
        ? agent.modelConfidence
        : agent.model_confidence || ''
    ).trim();

    return {
      id: kindKey(kind) === 'traecode' ? 'traeCode' : kindKey(kind),
      name: displayName(kindRaw),
      turns: turns,
      sessions: sessions,
      activeMin: activeMin,
      tok: tok,
      usd: usd,
      remainingPercent: rem,
      cacheHit: null,
      peakLabel: null,
      peakEff: null,
      model: model || '—',
      modelConf: modelConf || 'med',
      note: noteFor(kindRaw, usage),
      status: status,
      message: String(usage.message || '').trim(),
      source: String(usage.source || ''),
      confidence: String(usage.confidence || '')
    };
  }

  /**
   * @param {object} snap CodexMicroOverlaySnapshot-like
   * @returns {{ asOf: string, range: 'day', agents: object[], history: false }}
   */
  function coreRank(id) {
    var k = kindKey(id);
    if (k === 'cursor') return 0;
    if (k === 'claude') return 1;
    if (k === 'codex') return 2;
    return 10;
  }

  function projectBoardFromOverlay(snap) {
    var rows = snap && Array.isArray(snap.agents) ? snap.agents : [];
    var agents = [];
    for (var i = 0; i < rows.length; i++) {
      var row = projectAgentRow(rows[i]);
      if (row) agents.push(row);
    }
    agents.sort(function (a, b) {
      var d = coreRank(a.id) - coreRank(b.id);
      if (d !== 0) return d;
      return String(a.name).localeCompare(String(b.name));
    });
    var now = new Date();
    var asOf =
      now.getFullYear() +
      '年' +
      (now.getMonth() + 1) +
      '月' +
      now.getDate() +
      '日';
    var cursor = agents.find(function (a) {
      return kindKey(a.id) === 'cursor';
    });
    var cursorReady = !!(cursor && isCursorLocalReady({
      status: cursor.status,
      source: cursor.source,
      confidence: cursor.confidence
    }));
    return {
      asOf: asOf,
      range: 'day',
      history: false,
      agents: agents,
      cursorReady: cursorReady,
      cursorNeedsConsent: !!(
        cursor &&
        !cursorReady &&
        /未启用|活动统计/.test(String(cursor.message || cursor.note || ''))
      )
    };
  }

  function frameEl() {
    if (typeof document === 'undefined') return null;
    return document.getElementById(FRAME_ID);
  }

  function postPayload(payload) {
    lastPayload = payload;
    var frame = frameEl();
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        { type: MSG_TYPE, payload: payload },
        '*'
      );
    } catch (_) {}
  }

  function invoke(cmd, args) {
    var ipc = root.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    return ipc.invoke(cmd, args || {});
  }

  function refresh(opts) {
    opts = opts || {};
    if (inFlight) return Promise.resolve(lastPayload);
    inFlight = true;
    // Cursor first (efficiency); then shell poll nudge so Trae/WorkBuddy tokens land.
    return invoke('cmd_codex_micro_overlay_refresh_usage', { kind: 'cursor' })
      .then(function (snap) {
        return invoke('cmd_codex_micro_overlay_refresh_usage', { kind: 'trae' })
          .catch(function () { return snap; })
          .then(function (snap2) { return snap2 || snap; });
      })
      .catch(function () {
        return invoke('cmd_codex_micro_overlay_get_state', {});
      })
      .then(function (snap) {
        var payload = projectBoardFromOverlay(snap || {});
        postPayload(payload);
        return payload;
      })
      .catch(function () {
        return lastPayload;
      })
      .then(function (payload) {
        inFlight = false;
        return payload;
      });
  }

  function bindFrameLoad() {
    if (frameBound) return;
    var frame = frameEl();
    if (!frame) return;
    frameBound = true;
    frame.addEventListener('load', function () {
      if (lastPayload) postPayload(lastPayload);
      else refresh({ kind: 'cursor' });
    });
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  function enableCursorActivity() {
    return invoke('cmd_cursor_activity_pref_set', { enabled: true })
      .then(function () {
        return refresh({ kind: 'cursor' });
      })
      .catch(function () {
        return null;
      });
  }

  function onFrameCommand(ev) {
    var data = ev && ev.data;
    if (!data || data.type !== 'ot-agent-data-cmd') return;
    var frame = frameEl();
    if (frame && ev.source && frame.contentWindow && ev.source !== frame.contentWindow) {
      return;
    }
    if (data.cmd === 'enableCursorActivity') {
      enableCursorActivity();
    }
  }

  function start() {
    bindFrameLoad();
    if (typeof window !== 'undefined' && !window.__otAgentDataCmdBound) {
      window.__otAgentDataCmdBound = true;
      window.addEventListener('message', onFrameCommand);
    }
    stop();
    refresh({ kind: 'cursor' });
    pollTimer = setInterval(function () {
      refresh({ kind: 'cursor' });
    }, POLL_MS);
  }

  var api = {
    MSG_TYPE: MSG_TYPE,
    projectBoardFromOverlay: projectBoardFromOverlay,
    projectAgentRow: projectAgentRow,
    isCursorLocalReady: isCursorLocalReady,
    enableCursorActivity: enableCursorActivity,
    refresh: refresh,
    start: start,
    stop: stop,
    postPayload: postPayload
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.OneToneAgentDataBridge = api;
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : this
);
