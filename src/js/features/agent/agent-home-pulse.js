/**
 * Agent home P0 projection — §12 pulse + 「帮过你」归类.
 * Consumes AgentHomeSnapshot-shaped DTOs; never invents quota/% progress.
 */
(function (root) {
  'use strict';

  /** @type {Record<string, { category: string, summary: string, result: string, resultLabel: string, actionId: string, actionLabel: string }>} */
  var EVENT_MAP = {
    task_started: {
      category: 'dynamic',
      summary: '帮手开始干活了',
      result: 'running',
      resultLabel: '正在帮',
      actionId: 'open',
      actionLabel: '看看'
    },
    task_resumed: {
      category: 'dynamic',
      summary: '帮手又接着干了',
      result: 'running',
      resultLabel: '正在帮',
      actionId: 'open',
      actionLabel: '看看'
    },
    waiting_approval: {
      category: 'need_you',
      summary: '帮手等你拍板',
      result: 'waiting',
      resultLabel: '等你',
      actionId: 'open',
      actionLabel: '去拍板'
    },
    task_paused: {
      category: 'paused',
      summary: '先停住了，可以接着',
      result: 'paused',
      resultLabel: '先停住',
      actionId: 'resume',
      actionLabel: '接着帮我'
    },
    task_completed: {
      category: 'done',
      summary: '这段帮完了',
      result: 'done',
      resultLabel: '帮完了',
      actionId: 'open',
      actionLabel: '看看'
    },
    task_failed: {
      category: 'problem',
      summary: '帮手卡住了',
      result: 'failed',
      resultLabel: '卡住了',
      actionId: 'open',
      actionLabel: '看看'
    },
    session_discovered: {
      category: 'weak',
      summary: '开了个新话题',
      result: 'recorded',
      resultLabel: '记一笔',
      actionId: 'open',
      actionLabel: '看看'
    },
    session_updated: {
      category: 'weak',
      summary: '话题有点新动静',
      result: 'recorded',
      resultLabel: '记一笔',
      actionId: 'open',
      actionLabel: '看看'
    },
    user_turn_observed: {
      category: 'weak',
      summary: '你刚跟它说了一句',
      result: 'recorded',
      resultLabel: '记一笔',
      actionId: 'open',
      actionLabel: '看看'
    }
  };

  var STATUS_DYNAMIC = {
    running: '正在帮你',
    resumed: '正在帮你',
    waiting_approval: '在等你拍板',
    paused: '先停住了',
    completed: '这段帮完了',
    failed: '帮手卡住了',
    cancelled: '已停手',
    discovered: '闲着待命',
    idle: '闲着待命',
    unknown: '还没认准'
  };

  function eventTypeOf(raw) {
    if (!raw) return '';
    return String(raw.eventType || raw.event_type || raw.type || '').trim();
  }

  function isEnglishTemplate(s) {
    return /^(User turn observed|Cursor session (updated|discovered)|Agent )\b/i.test(
      String(s || '').trim()
    );
  }

  function looksTechLeak(s) {
    var raw = String(s || '').trim();
    if (!raw) return true;
    if (/session|checkpoint|probe|sync|provider|event_id/i.test(raw) && raw.length < 48) {
      return true;
    }
    return false;
  }

  /**
   * Map one HomeEventDto (or loose event) → homepage row fields.
   * Never surfaces English observed templates as the primary summary.
   */
  function projectEvent(raw) {
    raw = raw || {};
    var type = eventTypeOf(raw);
    var mapped = EVENT_MAP[type] || {
      category: 'weak',
      summary: '最近有一点新动静',
      result: 'recorded',
      resultLabel: '记录',
      actionId: 'open',
      actionLabel: '查看'
    };
    var incoming = String(raw.summary || '').trim();
    var summary = mapped.summary;
    // Prefer non-template, non-tech Chinese/provider summaries when present.
    if (
      incoming &&
      !isEnglishTemplate(incoming) &&
      !looksTechLeak(incoming) &&
      incoming !== type
    ) {
      summary = incoming;
    }
    var ts = Number(raw.timestamp || raw.timestampMs || raw.timestamp_ms || 0) || 0;
    return {
      id: String(raw.eventId || raw.event_id || raw.id || type || 'ev'),
      eventType: type || 'unknown',
      eventClass: String(raw.eventClass || raw.event_class || ''),
      category: mapped.category,
      weak: mapped.category === 'weak',
      summary: summary,
      result: mapped.result,
      resultLabel: mapped.resultLabel,
      actions: [{ id: mapped.actionId, label: mapped.actionLabel }],
      timestamp: ts,
      sessionId: raw.sessionId || raw.session_id || '',
      agent: raw.agent || raw.provider || '',
      at: formatAt(ts)
    };
  }

  function formatAt(ts) {
    if (!ts) return '';
    try {
      var d = new Date(ts);
      if (isNaN(d.getTime())) return '';
      var now = new Date();
      var sameDay =
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
      var hm =
        String(d.getHours()).padStart(2, '0') +
        ':' +
        String(d.getMinutes()).padStart(2, '0');
      if (sameDay) return '今天 ' + hm;
      var yday = new Date(now);
      yday.setDate(now.getDate() - 1);
      var isYday =
        d.getFullYear() === yday.getFullYear() &&
        d.getMonth() === yday.getMonth() &&
        d.getDate() === yday.getDate();
      if (isYday) return '昨天 ' + hm;
      return d.getMonth() + 1 + '/' + d.getDate() + ' ' + hm;
    } catch (e) {
      return '';
    }
  }

  /**
   * Lifecycle rows first in sort stability; fold consecutive weak into one.
   * @param {object[]} events HomeEventDto[]
   * @param {{ limit?: number, foldWeak?: boolean }} [opts]
   */
  function projectHelpedYou(events, opts) {
    opts = opts || {};
    var limit = opts.limit == null ? 12 : opts.limit;
    var foldWeak = opts.foldWeak !== false;
    var list = (Array.isArray(events) ? events : []).map(projectEvent);

    // Prefer lifecycle over weak when timestamps tie — already DESC from store.
    if (foldWeak) {
      var folded = [];
      var i = 0;
      while (i < list.length) {
        if (!list[i].weak) {
          folded.push(list[i]);
          i += 1;
          continue;
        }
        var start = i;
        while (i < list.length && list[i].weak) i += 1;
        var n = i - start;
        if (n === 1) {
          folded.push(list[start]);
        } else {
          folded.push({
            id: 'weak-fold-' + list[start].id,
            eventType: 'activity_burst',
            eventClass: 'projected',
            category: 'weak',
            weak: true,
            summary: '这段时间有 ' + n + ' 点动静',
            result: 'recorded',
            resultLabel: '记一笔',
            actions: [{ id: 'view-all', label: '看全部' }],
            timestamp: list[start].timestamp,
            sessionId: list[start].sessionId,
            agent: list[start].agent,
            at: list[start].at,
            foldedCount: n
          });
        }
      }
      list = folded;
    }

    return list.slice(0, limit);
  }

  function normalizeStatus(sessionStatus, workStatus) {
    var w = String(workStatus || '').trim();
    if (w === 'running') return 'running';
    if (w === 'waiting') return 'waiting_approval';
    if (w === 'error') return 'failed';
    if (w === 'resumable') return 'paused';
    if (w === 'idle') return 'idle';
    var s = String(sessionStatus || '').trim();
    if (s === 'active') return 'running'; // prototype alias
    return s || 'idle';
  }

  function matchKindOf(dto) {
    var p = dto.project || {};
    if (p.matchKind) return String(p.matchKind);
    if (p.match_kind) return String(p.match_kind);
    var cp = dto.currentProject || {};
    if (cp.confirmed === false) return 'unknown';
    if (cp.confirmed === true) return 'exact';
    return 'unknown';
  }

  /**
   * Build pulse from stable snapshot fields. quota always null (P2).
   * progress only from checkpoint text — never invent n/m.
   */
  function projectPulse(dto) {
    dto = dto || {};
    var sess = dto.activeSession || {};
    var status = normalizeStatus(sess.status, dto.workStatus || (dto.work && dto.work.status));
    var sync = String(dto.syncStatus || dto.sync_status || 'ready');
    var probe = String(dto.probeStatus || dto.probe_status || 'ready');
    var match = matchKindOf(dto);
    var ckpt = dto.checkpoint || dto.resumeCheckpoint || null;

    var dynamic = STATUS_DYNAMIC[status] || STATUS_DYNAMIC.idle;
    if (sync === 'consent_off' || probe === 'consent_off') {
      dynamic = '只能看已记下的';
    }

    var help = '开口就能叫它帮';
    if (status === 'waiting_approval') help = '改好了，差你一句「行」';
    else if (status === 'running' || status === 'resumed') help = '你随时可以开口';
    else if (status === 'paused' && ckpt) help = '能从上次停下的地方接着';
    else if (status === 'paused') help = '停住了，想接着再说一声';
    else if (status === 'failed') help = '先看卡住哪里再继续';
    else if (match === 'unknown' || match === 'probable') help = '还没认准你在做哪个项目';

    var health = '顺利';
    if (status === 'failed' || probe === 'read_error' || probe === 'schema_unknown') {
      health = '暂时连不上';
    } else if (status === 'waiting_approval') {
      health = '要你点一下';
    } else if (match === 'unknown' || match === 'probable') {
      health = '还没认准项目';
    } else if (sync === 'stale' || probe === 'read_locked' || probe === 'stale') {
      health = '刚更新有点慢';
    } else if (sync === 'consent_off' || probe === 'consent_off') {
      health = '本地记录还没打开';
    }

    var progress = null;
    if (ckpt) {
      var next = ckpt.nextAction || ckpt.next_action || ckpt.next || null;
      var cur = ckpt.currentTask || ckpt.current_task || ckpt.done || null;
      if (next) progress = String(next);
      else if (cur) progress = String(cur);
    }

    return {
      dynamic: dynamic,
      help: help,
      health: health,
      quota: null,
      progress: progress,
      status: status,
      matchKind: match
    };
  }

  /** Render helpers: hide null quota/progress in UI. */
  function pulseLabels(pulse) {
    pulse = pulse || projectPulse({});
    return {
      dynamic: pulse.dynamic,
      help: pulse.help,
      health: pulse.health,
      quota: pulse.quota == null ? null : String(pulse.quota),
      progress: pulse.progress == null ? null : String(pulse.progress)
    };
  }

  function statusLabelOf(status) {
    return STATUS_DYNAMIC[status] || status || '未确认';
  }

  function deriveMode(status, sync, probe, match) {
    if (status === 'waiting_approval') return 'attention';
    if (status === 'paused') return 'return';
    if (
      status === 'failed' ||
      probe === 'read_error' ||
      probe === 'schema_unknown' ||
      match === 'unknown' ||
      match === 'probable'
    ) {
      return 'degraded';
    }
    if (sync === 'stale' && match !== 'exact') return 'degraded';
    return 'quiet';
  }

  /**
   * Map cmd_agent_home_snapshot DTO → work-history render snap
   * (already projected: recentEvents + pulse).
   */
  function fromHomeSnapshot(dto) {
    dto = dto || {};
    var sess = dto.activeSession || null;
    var project = dto.project || {};
    var ckpt = dto.checkpoint || null;
    var sync = String(dto.syncStatus || dto.sync_status || 'ready');
    var probe = String(dto.probeStatus || dto.probe_status || 'ready');
    var status = normalizeStatus(sess && sess.status, dto.workStatus);
    var match =
      project.matchKind ||
      project.match_kind ||
      (project.userConfirmed || project.user_confirmed ? 'exact' : 'unknown');
    var displayName = project.displayName || project.display_name || null;
    var confirmed = match === 'exact' || !!(project.userConfirmed || project.user_confirmed);
    var mode = deriveMode(status, sync, probe, match);
    var provider =
      (sess && (sess.provider || sess.agent)) ||
      project.provider ||
      'Cursor';
    var pick =
      String(provider)
        .replace(/^cursor$/i, 'Cursor')
        .replace(/^claude$/i, 'Claude')
        .replace(/^codex$/i, 'Codex') || 'Cursor';

    var attention = null;
    if (status === 'waiting_approval') {
      var q =
        ckpt &&
        Array.isArray(ckpt.pendingQuestions || ckpt.pending_questions) &&
        (ckpt.pendingQuestions || ckpt.pending_questions)[0];
      attention = {
        title: q ? String(q) : '帮手等你拍板',
        detail: '点一下它才能继续。',
        primaryLabel: '去拍板'
      };
    } else if (mode === 'degraded' && !confirmed) {
      attention = {
        title: '还没认准你在做哪个项目',
        detail: '认一下之后，帮手才能接着帮你。',
        primaryLabel: '认一下项目'
      };
    }

    var resume = null;
    if (ckpt) {
      resume = {
        project: displayName || '未确认',
        sessionLabel: sess && sess.title ? String(sess.title) : '',
        done: ckpt.currentTask || ckpt.current_task || '',
        next: ckpt.nextAction || ckpt.next_action || '',
        currentTask: ckpt.currentTask || ckpt.current_task || null,
        nextAction: ckpt.nextAction || ckpt.next_action || null
      };
    }

    var events = projectHelpedYou(dto.recentEvents || [], {
      foldWeak: true,
      limit: 12
    });
    events.forEach(function (e) {
      if (!e.agent) e.agent = pick;
    });

    var snap = {
      mode: mode,
      agentPick: pick,
      live: true,
      dataSource: 'ipc',
      syncStatus: sync,
      probeStatus: probe,
      staleAgeMs: dto.staleAgeMs || dto.stale_age_ms || 0,
      currentProject: { name: displayName, confirmed: confirmed },
      project: {
        displayName: displayName,
        matchKind: match,
        projectId: project.projectId || project.project_id || null
      },
      activeSession: {
        agent: pick,
        app: pick,
        startedAt: sess && sess.updatedAt ? formatAt(sess.updatedAt) : '',
        status: status,
        statusLabel: statusLabelOf(status),
        sessionId: sess && sess.sessionId,
        title: sess && sess.title
      },
      attention: attention,
      recentEvents: events,
      resumeCheckpoint: resume,
      checkpoint: ckpt,
      contextEvidence: [],
      evidenceEffect: '',
      inputState: {
        listening: false,
        transcript: '',
        target: pick,
        hotkey: null
      },
      freshness: sync === 'ready' ? 'live' : sync,
      pulse: projectPulse({
        activeSession: { status: status },
        syncStatus: sync,
        probeStatus: probe,
        project: { matchKind: match },
        checkpoint: ckpt
      })
    };
    return snap;
  }

  var api = {
    EVENT_MAP: EVENT_MAP,
    projectEvent: projectEvent,
    projectHelpedYou: projectHelpedYou,
    projectPulse: projectPulse,
    pulseLabels: pulseLabels,
    fromHomeSnapshot: fromHomeSnapshot,
    formatAt: formatAt
  };

  root.OneToneAgentHomePulse = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
