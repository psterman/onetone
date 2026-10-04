/**
 * home-agent-desk live bridge — three real IPCs only.
 * cmd_agent_attention_snapshot → Needs You + Living Now
 * cmd_agent_home_snapshot → Continue + Recent
 * cmd_home_focus_snapshot → top project + sit chip
 *
 * No Marvis. No invented narrative. Empty zones omitted.
 */
(function (global) {
  'use strict';

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (ipc && typeof ipc.invoke === 'function') {
      return Promise.resolve(ipc.invoke(cmd, args || {}));
    }
    var core = global.__TAURI__ && global.__TAURI__.core;
    if (core && typeof core.invoke === 'function') {
      return Promise.resolve(core.invoke(cmd, args || {}));
    }
    return Promise.reject(new Error('no_ipc'));
  }

  function hasIpc() {
    return !!(
      (global.OneToneIpc && typeof global.OneToneIpc.invoke === 'function') ||
      (global.__TAURI__ && global.__TAURI__.core && typeof global.__TAURI__.core.invoke === 'function')
    );
  }

  function rowState(r) {
    var st = r && (r.state || r.State);
    if (!st) return '';
    if (typeof st === 'string') return st;
    if (st.needsInput) return 'needsInput';
    if (st.working) return 'working';
    return String(st);
  }

  function rowCause(r) {
    var c = r && (r.cause || r.Cause);
    return c ? String(c) : '';
  }

  function rowAgent(r) {
    var a = String((r && (r.agent || r.Agent)) || '').toLowerCase();
    if (a.indexOf('claude') >= 0) return 'Claude';
    if (a.indexOf('codex') >= 0) return 'Codex';
    if (a.indexOf('workbuddy') >= 0) return 'WorkBuddy';
    if (a.indexOf('cursor') >= 0) return 'Cursor';
    return String((r && (r.agent || r.Agent)) || 'Agent').trim() || 'Agent';
  }

  function waitingEligible(r) {
    if (!r) return false;
    if (r.waitingEligible === false || r.waiting_eligible === false) return false;
    if (r.waitingEligible === true || r.waiting_eligible === true) return true;
    var src = String((r.source && (r.source.inferred ? 'inferred' : r.source)) || r.Source || '');
    if (/inferred/i.test(src)) return false;
    return rowState(r) === 'needsInput';
  }

  function relativeWhen(ms) {
    var n = Number(ms) || 0;
    if (!n) return '刚刚';
    var d = Math.max(0, Date.now() - n);
    if (d < 60_000) return '刚刚';
    if (d < 3600_000) return Math.floor(d / 60_000) + ' 分钟前';
    if (d < 86400_000) return Math.floor(d / 3600_000) + ' 小时前';
    return Math.floor(d / 86400_000) + ' 天前';
  }

  function providerLabel(p) {
    var s = String(p || '').toLowerCase();
    if (s.indexOf('claude') >= 0) return 'Claude';
    if (s.indexOf('codex') >= 0) return 'Codex';
    if (s.indexOf('workbuddy') >= 0) return 'WorkBuddy';
    if (s.indexOf('cursor') >= 0) return 'Cursor';
    return String(p || 'Agent');
  }

  /**
   * @param {{ attention?: object, home?: object, focus?: object }} pack
   * @returns {{ S: object, sit: object, source: string }}
   */
  function project(pack) {
    pack = pack || {};
    var attention = pack.attention || {};
    var home = pack.home || {};
    var focus = pack.focus || {};
    var S = Object.create(null);
    var needsIds = [];
    var livingIds = [];
    var recentIds = [];
    var continueId = null;

    var rows = Array.isArray(attention.rows) ? attention.rows : [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var agent = rowAgent(r);
      var st = rowState(r);
      var cause = rowCause(r);
      var sid = String(r.sessionId || r.session_id || r.requestId || r.request_id || r.sequence || i);
      var id = 'attn-' + agent.toLowerCase() + '-' + sid;
      var when = relativeWhen(r.observedAtMs != null ? r.observedAtMs : r.observed_at_ms);
      if (st === 'needsInput' && waitingEligible(r)) {
        var title = /permission/i.test(cause)
          ? '批准 ' + agent + ' 的操作？'
          : agent + ' 需要你确认';
        S[id] = {
          id: id,
          provider: agent,
          project: null,
          title: title,
          waiting: true,
          conf: 'auth',
          when: when,
          act: '查看',
          actKind: 'detail',
          sourceNote: 'hook',
          detail: {
            title: title,
            sub: agent + ' · Soft Pad attention',
            state: 'NeedsInput',
            conf: 'authoritative',
            stability: 'official_hook',
            caps: [
              { id: 'detail', ok: true, label: '查看详情' },
              { id: 'focus', ok: true, label: '聚焦窗口' },
              { id: 'approve', ok: false, reason: 'P0 不开放；请在原 Agent 内处理' },
            ],
            bullets: ['来自 cmd_agent_attention_snapshot', 'waitingEligible · 非 mtime'],
            evidence: {
              path: 'agent_attention',
              event: cause || 'needsInput',
              at: when,
              fingerprint: sid,
              summary: 'waitingEligible=true',
            },
          },
        };
        needsIds.push(id);
      } else if (st === 'working') {
        S[id] = {
          id: id,
          provider: agent,
          project: null,
          title: agent + ' 正在活动',
          waiting: false,
          conf: 'auth',
          when: when,
          act: '聚焦',
          actKind: 'focus',
          detail: {
            title: agent + ' 正在活动',
            sub: '可信活跃 · 非 waiting',
            state: 'Working',
            conf: 'authoritative',
            stability: 'official_hook',
            caps: [
              { id: 'detail', ok: true, label: '查看详情' },
              { id: 'focus', ok: true, label: '聚焦窗口' },
            ],
            bullets: ['来自 Soft Pad lifecycle / attention', '无 permission 不进 Needs You'],
            evidence: {
              path: 'agent_attention',
              event: 'working',
              at: when,
              fingerprint: sid,
              summary: 'working · not permission',
            },
          },
        };
        livingIds.push(id);
      }
    }

    // Waiting outranks Living on the desk.
    if (needsIds.length) livingIds = [];

    var ckpt = home.checkpoint || null;
    if (ckpt) {
      continueId = 'ckpt-' + String(ckpt.checkpointId || ckpt.checkpoint_id || 'x');
      var ckWhen = relativeWhen(ckpt.updatedAt || ckpt.updated_at || ckpt.createdAt || ckpt.created_at);
      var ckTitle = ckpt.currentTask || ckpt.current_task || ckpt.nextAction || ckpt.next_action || '继续上次工作';
      var ckProv = providerLabel((home.activeSession && (home.activeSession.provider || home.activeSession.Provider)) || 'Agent');
      var projName =
        (home.project && (home.project.displayName || home.project.display_name)) ||
        (focus.project && focus.project.name) ||
        null;
      S[continueId] = {
        id: continueId,
        provider: ckProv,
        project: projName,
        title: '继续上次工作',
        waiting: false,
        conf: 'auth',
        when: ckWhen,
        act: '继续',
        actKind: 'resume',
        sessionId: ckpt.sessionId || ckpt.session_id || null,
        detail: {
          title: '继续上次工作',
          sub: ckProv + ' checkpoint' + (projName ? ' · ' + projName : ''),
          state: 'paused / resumable',
          conf: 'authoritative',
          stability: 'official_api (OneTone store)',
          caps: [
            { id: 'detail', ok: true, label: '查看详情' },
            { id: 'resume', ok: true, label: '继续这个 checkpoint' },
            { id: 'focus', ok: true, label: '聚焦窗口' },
          ],
          bullets: [String(ckTitle), 'cmd_agent_checkpoint_resume'],
          evidence: {
            path: 'agent-memory.sqlite3 → checkpoints',
            event: 'checkpoint',
            at: ckWhen,
            fingerprint: String(ckpt.checkpointId || ckpt.checkpoint_id || ''),
            summary: String(ckTitle),
          },
        },
      };
    }

    var sessions = Array.isArray(home.recentSessions)
      ? home.recentSessions
      : Array.isArray(home.recent_sessions)
        ? home.recent_sessions
        : [];
    for (var j = 0; j < sessions.length && recentIds.length < 5; j++) {
      var sess = sessions[j];
      var sessId = String(sess.sessionId || sess.session_id || j);
      var rid = 'sess-' + sessId;
      if (continueId && S[continueId] && String(S[continueId].sessionId) === sessId) continue;
      var sp = providerLabel(sess.provider);
      var stitle = sess.title || sp + ' 会话';
      var swhen = relativeWhen(sess.updatedAt || sess.updated_at);
      S[rid] = {
        id: rid,
        provider: sp,
        project: (home.project && (home.project.displayName || home.project.display_name)) || null,
        title: stitle,
        waiting: false,
        conf: 'corr',
        when: swhen,
        act: '查看',
        actKind: 'detail',
        detail: {
          title: stitle,
          sub: sp + ' · recent session',
          state: String(sess.status || 'idle'),
          conf: 'corroborated',
          stability: 'onetone_sqlite',
          caps: [{ id: 'detail', ok: true, label: '查看详情' }],
          bullets: ['来自 cmd_agent_home_snapshot · recentSessions'],
          evidence: {
            path: 'agent-memory.sqlite3 → sessions',
            event: 'session',
            at: swhen,
            fingerprint: sessId,
            summary: String(sess.activitySource || sess.activity_source || ''),
          },
        },
      };
      recentIds.push(rid);
    }

    var project = focus.project || {};
    var work = focus.work || {};
    var confirmed = !!project.confirmed;
    var match = String(project.match || project.matchKind || '');
    var topProj =
      confirmed || match === 'exact'
        ? String(project.name || '当前项目')
        : project.name
          ? String(project.name)
          : '工作台';
    var needsProject = !confirmed && (match === 'unknown' || match === 'probable' || !match);

    var layout = {};
    if (needsIds.length) layout.needs = { ids: needsIds };
    if (livingIds.length) layout.living = { ids: livingIds.slice(0, 2), max: 2 };
    if (continueId) layout.continue = { kind: 'checkpoint', id: continueId };
    if (recentIds.length) layout.recent = { ids: recentIds, max: 5, collapsed: !needsIds.length && !livingIds.length };

    var sitName = 'quiet';
    var chip = '安静';
    var chipClass = '';
    var headline = '现在没有需要你处理的事';
    var subhead = 'Needs You / Living / Continue 有数据才展开；否则折叠。';
    var ctas = [];
    var foot = 'live：attention + home + focus · 空区折叠';

    if (needsProject && String(work.status || '') === 'idle') {
      sitName = 'quiet';
      chip = '项目未确认';
      chipClass = 'warn';
      headline = '我暂时无法确认你正在处理的项目。';
      subhead = '已读 cmd_home_focus_snapshot；确认项目后 Continue / Recent 才更稳。';
      ctas = [];
      foot = 'live · focus degraded gate（示意，动作走生产首页）';
    } else if (needsIds.length) {
      sitName = 'attention';
      chip = '需要你处理';
      chipClass = 'warn';
      var first = S[needsIds[0]];
      headline =
        needsIds.length === 1
          ? (first && first.provider ? first.provider + ' 正等你确认。' : '有会话需要你处理。')
          : needsIds.length + ' 个会话需要你处理。';
      subhead =
        livingIds.length
          ? 'Needs You 优先；Living 已压住。'
          : '现有能力：Soft Pad attention waitingEligible。';
      ctas = [{ l: '处理第一个', open: needsIds[0] }];
    } else if (continueId && !livingIds.length) {
      sitName = 'resume';
      chip = '可继续';
      headline = '接着上次那步做';
      subhead = '主 CTA 绑定 OneTone checkpoint。';
      ctas = [{ l: '继续这个 checkpoint', open: continueId, action: 'resume' }];
    } else if (livingIds.length) {
      sitName = 'quiet';
      chip = '有活动';
      headline = livingIds.length + ' 个会话正在活动';
      subhead = '无人在等你。Living Now 来自 attention working。';
      if (continueId) ctas = [{ l: '继续 checkpoint', open: continueId, action: 'resume' }];
    } else if (!continueId && !recentIds.length) {
      sitName = 'quiet';
      chip = '安静';
      headline = '现在没有需要你处理的事';
      subhead = '三 IPC 已读；当前无 waiting / checkpoint / recent。';
      layout = {};
    }

    if (!needsIds.length && !livingIds.length && (continueId || recentIds.length) && sitName === 'quiet') {
      layout.liveSummary = {
        text: continueId ? '无人等待 · 有 checkpoint 可继续' : '无人等待 · 有最近会话',
        hint: '展开看 Continue / 最近工作',
      };
    }

    return {
      S: S,
      sitName: sitName,
      sit: {
        chip: chip,
        chipClass: chipClass,
        topProj: topProj,
        headline: headline,
        subhead: subhead,
        ctas: ctas,
        foot: foot,
        layout: layout,
      },
      source: 'live',
    };
  }

  function fetchAll() {
    return Promise.all([
      invoke('cmd_agent_attention_snapshot', {}).catch(function () {
        return { rows: [], revision: 0, waitingKinds: [] };
      }),
      invoke('cmd_agent_home_snapshot', {}).catch(function () {
        return {};
      }),
      invoke('cmd_home_focus_snapshot', {}).catch(function () {
        return {};
      }),
    ]).then(function (parts) {
      return project({ attention: parts[0], home: parts[1], focus: parts[2] });
    });
  }

  function resumeCheckpoint(sessionId) {
    if (!sessionId) return Promise.reject(new Error('no_session'));
    return invoke('cmd_agent_checkpoint_resume', { sessionId: sessionId });
  }

  global.OneToneHomeAgentDeskLive = {
    hasIpc: hasIpc,
    invoke: invoke,
    project: project,
    fetchAll: fetchAll,
    resumeCheckpoint: resumeCheckpoint,
  };
})(typeof window !== 'undefined' ? window : globalThis);
