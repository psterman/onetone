/**
 * Home: one actionable Agent status strip (no full Agent Center).
 * Priority: attention > failed > working > resumable. Idle / discovery-only → hidden.
 */
(function (global) {
  'use strict';

  var POLL_MS = 30000;
  var pollTimer = 0;
  var lastSnap = null;
  var hostEl = null;
  /** Hero mode that already owns the story — suppress duplicate strip CTA. */
  var heroMode = '';
  var heroPrimaryId = '';
  var heroProvider = '';
  var heroProjectId = '';
  var heroSessionId = '';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    return ipc.invoke(cmd, args || {});
  }

  function relativeWhen(ts) {
    var n = Number(ts);
    if (!isFinite(n) || n <= 0) return '';
    var diff = Math.max(0, Date.now() - n);
    var m = Math.floor(diff / 60000);
    if (m < 1) return '刚刚';
    if (m < 60) return m + ' 分钟前';
    var h = Math.floor(m / 60);
    if (h < 24) return h + ' 小时前';
    return Math.floor(h / 24) + ' 天前';
  }

  function projectName(agent) {
    var cw = agent && agent.currentWork;
    if (cw) {
      var p = String(cw.projectName || cw.project || cw.displayName || '').trim();
      if (p) return p;
    }
    if (agent && agent.cwd) {
      var parts = String(agent.cwd).replace(/[\\/]+$/, '').split(/[\\/]/);
      return parts[parts.length - 1] || '';
    }
    return '';
  }

  function sessionIdOf(agent) {
    if (!agent) return null;
    var sid =
      agent.sessionId ||
      agent.externalSessionId ||
      (agent.session && (agent.session.id || agent.session.sessionId));
    sid = sid != null ? String(sid).trim() : '';
    if (!sid || sid === 'unknown' || sid === 'ambiguous') return null;
    return sid;
  }

  function providerOf(agent) {
    return String((agent && (agent.displayName || agent.runtimeKind || agent.agentId)) || 'Agent');
  }

  /**
   * Pick at most one actionable row from snapshot.
   * @returns {{kind:string,title:string,sub:string,cta:string,target:object}|null}
   */
  function pickStatus(snap) {
    if (!snap || !Array.isArray(snap.agents)) return null;
    var agents = snap.agents.filter(function (a) {
      return a && a.agentId;
    });
    var needs = (snap.groups && snap.groups.needsAttention) || [];
    var AC = global.OneToneAgentCenter;
    var project =
      AC && typeof AC._projectAgentControl === 'function'
        ? function (a) {
            return AC._projectAgentControl(a, snap);
          }
        : function () {
            return { working: false };
          };

    function targetFor(agent, section) {
      return {
        view: 'overview',
        section: section || null,
        provider: agent.runtimeKind || agent.agentId || null,
        projectId: projectName(agent) || null,
        sessionId: sessionIdOf(agent)
      };
    }

    // 1) Waiting confirmation / needs input
    for (var i = 0; i < needs.length; i++) {
      var need = agents.find(function (a) {
        return a.agentId === needs[i];
      });
      if (!need) continue;
      var st = String(need.status || '');
      if (st === 'failed' || st === 'error') continue;
      var detail =
        (need.currentWork && (need.currentWork.summary || need.currentWork.detail)) ||
        projectName(need) ||
        '';
      return {
        kind: 'attention',
        title: providerOf(need) + ' 需要你确认后才能继续',
        sub: detail || '等待确认',
        cta: '去处理',
        target: targetFor(need, 'attention')
      };
    }

    // 2) Failed
    for (var f = 0; f < agents.length; f++) {
      var fa = agents[f];
      var fst = String(fa.status || '');
      if (fst !== 'failed' && fst !== 'error') continue;
      var exit =
        (fa.currentWork && (fa.currentWork.exitCode != null ? '命令退出码 ' + fa.currentWork.exitCode : '')) ||
        (fa.lastError && String(fa.lastError)) ||
        '执行失败';
      return {
        kind: 'failed',
        title: providerOf(fa) + ' 遇到问题',
        sub: exit,
        cta: '查看问题',
        target: targetFor(fa, 'attention')
      };
    }

    // 3) Working (fresh observed — use projectAgentControl.working when available)
    for (var w = 0; w < agents.length; w++) {
      var wa = agents[w];
      var proj = project(wa);
      var working = !!(proj && proj.working) || String(wa.status || '') === 'working';
      if (!working) continue;
      if (proj && proj.reason === 'stale') continue;
      var when = relativeWhen(wa.observedAt || (wa.currentWork && wa.currentWork.updatedAt) || snap.asOf);
      return {
        kind: 'working',
        title: providerOf(wa) + ' 正在处理 ' + (projectName(wa) || '当前项目'),
        sub: (when ? '已运行 · ' + when + ' · ' : '') + '当前无需操作',
        cta: '查看',
        target: targetFor(wa, 'working')
      };
    }

    // 4) Resumable
    for (var r = 0; r < agents.length; r++) {
      var ra = agents[r];
      var rp = project(ra);
      var resumable =
        !!(rp && (rp.canContinue || rp.resumable)) ||
        !!ra.resumable ||
        String(ra.status || '') === 'paused' ||
        String(ra.status || '') === 'resumable';
      if (!resumable) continue;
      var whenR = relativeWhen(ra.observedAt || (ra.currentWork && ra.currentWork.updatedAt) || snap.asOf);
      return {
        kind: 'resumable',
        title: '上次工作可以继续',
        sub:
          providerOf(ra) +
          (projectName(ra) ? ' · ' + projectName(ra) : '') +
          (whenR ? ' · ' + whenR : ''),
        cta: '继续',
        target: targetFor(ra, 'resumable')
      };
    }

    return null;
  }

  function renderStrip(row) {
    if (!row) return '';
    return (
      '<div class="home-agent-status" data-home-agent-status data-kind="' +
      esc(row.kind) +
      '" role="status">' +
      '<div class="home-agent-status__text"><b>' +
      esc(row.title) +
      '</b><span>' +
      esc(row.sub) +
      '</span></div>' +
      '<button type="button" class="home-agent-status__cta" data-home-agent-status-cta>' +
      esc(row.cta) +
      '</button></div>'
    );
  }

  function shouldSuppress(row) {
    if (!row) return true;
    var target = row.target || {};
    var sameProvider =
      heroProvider && target.provider &&
      String(heroProvider).toLowerCase() === String(target.provider).toLowerCase();
    var sameSession = heroSessionId && target.sessionId && String(heroSessionId) === String(target.sessionId);
    var sameProject =
      heroProjectId && target.projectId &&
      String(heroProjectId).toLowerCase() === String(target.projectId).toLowerCase();
    var sameHero = sameProvider && (sameSession || sameProject || (!heroSessionId && !heroProjectId));
    if (heroMode === 'running' && row.kind === 'working' && sameHero) return true;
    // Hero attention/return/degraded already show the primary action.
    if (heroMode === 'attention' && row.kind === 'attention') return true;
    if (
      heroMode === 'return' &&
      (row.kind === 'resumable' || row.kind === 'attention')
    ) {
      return true;
    }
    if (heroMode === 'degraded' && (row.kind === 'failed' || row.kind === 'error')) {
      return true;
    }
    if (heroPrimaryId === 'resume' && row.kind === 'resumable') return true;
    if (heroPrimaryId === 'view_progress' && row.kind === 'attention') return true;
    if (
      (heroPrimaryId === 'confirm_project' || heroPrimaryId === 'pick_project') &&
      row.kind === 'resumable'
    ) {
      return true;
    }
    return false;
  }

  function paint() {
    if (!hostEl || !hostEl.isConnected) {
      hostEl = document.getElementById('homeAgentStatusHost');
    }
    if (!hostEl) return;
    var row = pickStatus(lastSnap);
    if (shouldSuppress(row)) {
      hostEl.innerHTML = '';
      hostEl.hidden = true;
      return;
    }
    hostEl.innerHTML = renderStrip(row);
    hostEl.hidden = !row;
  }

  function onClick(ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest('[data-home-agent-status-cta]');
    if (!btn) return;
    var row = pickStatus(lastSnap);
    if (!row || !row.target) return;
    var Nav = global.OneToneAgentNavTarget;
    if (Nav && Nav.open) Nav.open(row.target);
  }

  function refresh() {
    return invoke('cmd_agent_center_snapshot', {})
      .then(function (snap) {
        lastSnap = snap || null;
        paint();
        return lastSnap;
      })
      .catch(function () {
        // Production: never paint fixture success on IPC failure — just hide strip.
        lastSnap = null;
        paint();
        return null;
      });
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  function start(host, opts) {
    opts = opts || {};
    if (opts.heroMode != null) heroMode = String(opts.heroMode || '');
    if (opts.primaryId != null) heroPrimaryId = String(opts.primaryId || '');
    if (opts.provider != null) heroProvider = String(opts.provider || '');
    if (opts.projectId != null) heroProjectId = String(opts.projectId || '');
    if (opts.sessionId != null) heroSessionId = String(opts.sessionId || '');
    hostEl = host || document.getElementById('homeAgentStatusHost');
    if (!hostEl) return;
    if (hostEl.getAttribute('data-status-bound') !== '1') {
      hostEl.setAttribute('data-status-bound', '1');
      hostEl.addEventListener('click', onClick);
    }
    stop();
    refresh();
    pollTimer = setInterval(function () {
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, POLL_MS);
  }

  function ensureMounted(opts) {
    opts = opts || {};
    if (opts.heroMode != null) heroMode = String(opts.heroMode || '');
    if (opts.primaryId != null) heroPrimaryId = String(opts.primaryId || '');
    if (opts.provider != null) heroProvider = String(opts.provider || '');
    if (opts.projectId != null) heroProjectId = String(opts.projectId || '');
    if (opts.sessionId != null) heroSessionId = String(opts.sessionId || '');
    var host = document.getElementById('homeAgentStatusHost');
    if (!host) return;
    start(host, opts);
  }

  global.OneToneHomeAgentStatusStrip = {
    pickStatus: pickStatus,
    renderStrip: renderStrip,
    refresh: refresh,
    start: start,
    stop: stop,
    ensureMounted: ensureMounted,
    _setSnap: function (s) {
      lastSnap = s;
      paint();
    },
    _setHero: function (opts) {
      opts = opts || {};
      heroMode = String(opts.heroMode || '');
      heroPrimaryId = String(opts.primaryId || '');
      heroProvider = String(opts.provider || '');
      heroProjectId = String(opts.projectId || '');
      heroSessionId = String(opts.sessionId || '');
    },
    _shouldSuppress: shouldSuppress
  };
})(typeof window !== 'undefined' ? window : globalThis);
