/** Team mode — Focus home: peer mode + right panel + Loopback SSE projection. */
(function (global) {
  'use strict';

  var armed = false;
  var panelOpen = false;
  var currentTeam = null;
  var sendHooked = false;
  var turns = [];
  var userMessages = [];
  var bridgeInfo = null;
  var lastEventId = null;
  var sseAbort = null;
  var sseReconnectTimer = 0;
  var sseFailCount = 0;
  var snapshotPollTimer = 0;
  var showDetails = false;
  var viewingNodeId = null;
  var startInFlight = null;
  var hydrateInFlight = null;
  var LAST_TEAM_KEY = 'onetone.team.lastId';

  function rememberTeamId(teamId) {
    try {
      if (teamId && global.sessionStorage) {
        global.sessionStorage.setItem(LAST_TEAM_KEY, String(teamId));
      }
    } catch (_) {}
  }

  function readRememberedTeamId() {
    try {
      return (global.sessionStorage && global.sessionStorage.getItem(LAST_TEAM_KEY)) || '';
    } catch (_) {
      return '';
    }
  }

  function api() {
    return global.OneToneHomeAgentTask;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function workspaceRoot() {
    try {
      var HF = global.OneToneHomeFocusStore;
      var dto = HF && HF.getSnapshot && HF.getSnapshot();
      var root =
        (dto && dto.project && (dto.project.root || dto.project.path)) ||
        (dto && dto.workspaceRoot) ||
        '';
      if (root) return String(root);
    } catch (_) {}
    try {
      var S = global.OneToneHomeAgentV2Store;
      var snap = S && S.getSnapshot && S.getSnapshot();
      var path =
        (snap && snap.projectPath) ||
        (snap && snap.session && snap.session.projectPath) ||
        '';
      if (path) return String(path);
    } catch (_) {}
    return '';
  }

  function readHomeDraft() {
    var ta =
      document.querySelector('.ha2-compose [data-ha2-draft]') ||
      document.querySelector('[data-ha2-draft]') ||
      document.querySelector('#hnQuietDraft');
    return ta ? String(ta.value || '').trim() : '';
  }

  function readAutonomousWrite() {
    var el = document.querySelector('[data-ot-team-autonomous]');
    return !!(el && el.checked);
  }

  function clearHomeDraft() {
    var ta =
      document.querySelector('.ha2-compose [data-ha2-draft]') ||
      document.querySelector('[data-ha2-draft]');
    if (ta) {
      ta.value = '';
      try {
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } catch (_) {}
    }
  }

  function roleLabel(role) {
    var map = {
      lead: 'Lead',
      triage: 'Triage',
      explorer: 'Explorer',
      test_analyst: 'Test Analyst',
      implementer: 'Implementer',
      reviewer: 'Reviewer',
      verifier: 'Verifier'
    };
    return map[String(role || '').toLowerCase()] || role || 'Agent';
  }

  function statusUserLabel(status) {
    var s = String(status || '').toLowerCase();
    if (s === 'ready' || s === 'queued') return '等待';
    if (s === 'running') return '运行中';
    if (s === 'waiting') return '等待确认';
    if (s === 'done' || s === 'completed') return '已完成';
    if (s === 'failed' || s === 'cancelled') return '失败';
    if (s === 'blocked') return '阻塞';
    return status || '';
  }

  function phaseLabel(phase) {
    return ({ planning: '准备计划', awaiting_plan: '等待批准', awaiting_implementer: '等待实施',
      analysis: '分析问题', implementing: '执行修改', reviewing: '审查修改', verifying: '运行验证',
      repairing: '自动修复', needs_user: '需要介入', complete: '已完成', done: '已完成',
      cancelled: '已取消' })[String(phase || '')] || '团队运行中';
  }

  function phaseTone(phase) {
    var p = String(phase || '');
    if (p === 'complete' || p === 'done') return 'success';
    if (p === 'needs_user' || p === 'failed') return 'danger';
    if (p === 'repairing') return 'warning';
    if (p === 'cancelled') return 'muted';
    return 'active';
  }

  function phaseLabelClean(phase) {
    return ({ planning: '\u51c6\u5907\u8ba1\u5212', awaiting_plan: '\u7b49\u5f85\u6279\u51c6', awaiting_implementer: '\u7b49\u5f85\u5b9e\u65bd',
      analysis: '\u5206\u6790\u95ee\u9898', implementing: '\u6267\u884c\u4fee\u6539', reviewing: '\u5ba1\u67e5\u4fee\u6539', verifying: '\u8fd0\u884c\u9a8c\u8bc1',
      repairing: '\u81ea\u52a8\u4fee\u590d', needs_user: '\u9700\u8981\u4ecb\u5165', complete: '\u5df2\u5b8c\u6210', done: '\u5df2\u5b8c\u6210', cancelled: '\u5df2\u53d6\u6d88' })[String(phase || '')] || '\u56e2\u961f\u8fd0\u884c\u4e2d';
  }

  function statusLabelClean(status) {
    return ({ ready: '\u7b49\u5f85\u8c03\u5ea6', queued: '\u7b49\u5f85\u8c03\u5ea6', running: '\u6267\u884c\u4e2d', waiting: '\u7b49\u5f85\u786e\u8ba4', done: '\u5df2\u5b8c\u6210', completed: '\u5df2\u5b8c\u6210', failed: '\u5931\u8d25', cancelled: '\u5df2\u53d6\u6d88', blocked: '\u5df2\u963b\u585e' })[String(status || '').toLowerCase()] || '\u672a\u77e5\u72b6\u6001';
  }

  function stageIndex(team) {
    var p = String((team && (team.currentPhase || team.status)) || 'planning');
    if (p === 'complete' || p === 'done') return 4;
    if (p === 'verifying') return 3;
    if (p === 'reviewing') return 2;
    if (p === 'implementing' || p === 'repairing') return 1;
    return 0;
  }

  function threeStepIndex(team) {
    var phase = String((team && (team.currentPhase || team.status)) || 'planning');
    var nodes = (team && team.nodes) || [];
    var workers = nodes.filter(function (n) {
      return n.role !== 'lead';
    });
    if (phase === 'complete' || phase === 'completed' || phase === 'done') return 2;
    if (phase === 'needs_user' || phase === 'awaiting_plan' || phase === 'awaiting_implementer')
      return 2;
    if (workers.some(function (n) {
      return n.status === 'running' || n.status === 'done' || n.taskId || n.sessionId;
    }))
      return 1;
    if (workers.length) return 0;
    return 0;
  }

  function latestFinding(team) {
    var arts = (team && team.artifacts) || [];
    if (!arts.length) return '团队正在分析问题，有发现后会出现在这里。';
    var last = arts[arts.length - 1];
    var body = last && last.body;
    var text = '';
    if (body && typeof body === 'object') {
      text = body.summary || body.text || body.error || JSON.stringify(body).slice(0, 180);
    } else {
      text = String(body || '').slice(0, 180);
    }
    return roleLabel(nodeRole(team, last && last.nodeId)) + ' · ' + (text || last.kind || '发现');
  }

  function nodeRole(team, nodeId) {
    var n = ((team && team.nodes) || []).find(function (x) {
      return x.nodeId === nodeId;
    });
    return n ? n.role : '';
  }

  function nextStepCopy(team) {
    var phase = String((team && (team.currentPhase || team.status)) || '');
    if (phase === 'awaiting_plan') return '等待你确认修复方案后再修改代码。';
    if (phase === 'awaiting_implementer') return '方案已确认，正在等待实施任务开始。';
    if (phase === 'needs_user') return '验证未通过，可重新分析或手动介入。';
    if (phase === 'complete' || phase === 'done' || phase === 'completed')
      return '团队已汇总结果。';
    if (userMessages.length) return userMessages[userMessages.length - 1];
    return 'Lead 正在分配任务并汇总结果。';
  }

  function eventToUserMessage(ev) {
    var kind = String((ev && ev.kind) || '');
    var role = roleLabel((ev && ev.payload && ev.payload.role) || nodeRole(currentTeam, ev && ev.nodeId));
    if (kind === 'team_started') return '团队正在分析';
    if (kind === 'task_created' || kind === 'node_created') return role + ' 已加入任务';
    if (kind === 'task_claimed') return role + ' 已认领任务';
    if (kind === 'teammate_spawned') return role + ' 已开始工作';
    if (kind === 'task_status_changed') {
      var st = ev.payload && ev.payload.status;
      if (st === 'done') return role + ' 已完成';
      if (st === 'running') return role + ' 正在工作';
      if (st === 'failed') return role + ' 失败';
      return role + ' 状态更新';
    }
    if (kind === 'artifact_added' || kind === 'artifact_created')
      return role + ' 提交了发现';
    if (kind === 'plan_ready' || kind === 'plan_confirmed') return 'Lead 正在整理修复方案';
    if (kind === 'approval_required') return '等待你的确认';
    if (kind === 'teammate_interrupted') return role + ' 已中断';
    if (kind === 'team_completed') return '团队已完成汇总';
    if (kind === 'team_failed') return '团队失败，需要你介入';
    if (kind === 'message_added') return 'Lead 发送了协作消息';
    return '';
  }

  function applyTeamEvent(ev) {
    if (!ev || !ev.eventId) return;
    lastEventId = ev.eventId;
    var msg = eventToUserMessage(ev);
    if (msg) {
      // A reconnect may replay historical approval events. Keep the feed as a
      // state summary, not an append-only event dump.
      if (kind !== 'approval_required' || userMessages.indexOf(msg) < 0) {
        if (userMessages[userMessages.length - 1] !== msg) userMessages.push(msg);
      }
      if (userMessages.length > 12) userMessages = userMessages.slice(-12);
    }
    var task = api();
    if (task && currentTeam && task.teamSnapshot) {
      var sync = task.teamTick ? task.teamTick(currentTeam.teamId) : Promise.resolve(null);
      sync.catch(function () { return null; }).then(function () {
        return task.teamSnapshot(currentTeam.teamId);
      }).then(function (team) {
        if (!team) return;
        currentTeam = team;
        render(ensurePanel(), team);
        if (String(team.status || '') === 'done' || String(team.currentPhase || '') === 'complete') {
          stopSse();
        }
      });
    } else {
      render(ensurePanel(), currentTeam);
    }
  }

  function stopSse() {
    if (sseReconnectTimer) {
      try {
        clearTimeout(sseReconnectTimer);
      } catch (_) {}
      sseReconnectTimer = 0;
    }
    if (sseAbort) {
      try {
        sseAbort.abort();
      } catch (_) {}
      sseAbort = null;
    }
  }

  function isTerminalTeam(team) {
    var status = String((team && team.status) || '').toLowerCase();
    var phase = String((team && team.currentPhase) || '').toLowerCase();
    return status === 'done' || status === 'failed' || status === 'cancelled' ||
      status === 'needs_user' || phase === 'complete' || phase === 'needs_user';
  }

  function parseSseChunk(buf, onEvent) {
    var parts = String(buf || '').split('\n\n');
    var rest = parts.pop() || '';
    for (var i = 0; i < parts.length; i++) {
      var block = parts[i];
      if (!block || block.charAt(0) === ':') continue;
      var id = null;
      var data = '';
      var lines = block.split('\n');
      for (var j = 0; j < lines.length; j++) {
        var line = lines[j];
        if (line.indexOf('id:') === 0) id = line.slice(3).trim();
        else if (line.indexOf('data:') === 0) data += line.slice(5).trim();
      }
      if (!data) continue;
      try {
        var ev = JSON.parse(data);
        if (id && !ev.eventId) ev.eventId = id;
        onEvent(ev);
      } catch (_) {}
    }
    return rest;
  }

  function startSse() {
    stopSse();
    if (!panelOpen || !currentTeam || isTerminalTeam(currentTeam) || !bridgeInfo || !bridgeInfo.url || !bridgeInfo.token) return;
    var teamId = currentTeam.teamId;
    var url =
      String(bridgeInfo.url).replace(/\/$/, '') +
      '/v1/team/events/stream?teamId=' +
      encodeURIComponent(teamId) +
      (lastEventId ? '&after=' + encodeURIComponent(lastEventId) : '');
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    sseAbort = ctrl;
    fetch(url, {
      headers: { 'X-OneTone-Team-Token': bridgeInfo.token },
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (res) {
        if (res.status === 401) {
          sseFailCount += 1;
          setLive('鉴权失败：正在刷新 Team Token…');
          bridgeInfo = null;
          var task401 = api();
          if (task401 && task401.teamBridgeStart) {
            task401
              .teamBridgeStart({ force: true })
              .then(function (bridge) {
                bridgeInfo = bridge || bridgeInfo;
                if (bridgeInfo && bridgeInfo.token) startSse();
              })
              .catch(function () {
                scheduleSseReconnect();
              });
          }
          return null;
        }
        if (!res.ok || !res.body || !res.body.getReader) {
          sseFailCount += 1;
          if (sseFailCount >= 2) setLive('SSE 连接失败：' + res.status);
          scheduleSseReconnect();
          return null;
        }
        sseFailCount = 0;
        var reader = res.body.getReader();
        var decoder = new TextDecoder();
        var buf = '';
        function pump() {
          return reader.read().then(function (chunk) {
            if (chunk.done) {
              // Normal ~60s close — quiet reconnect, not an error banner.
              scheduleSseReconnect(true);
              return;
            }
            buf += decoder.decode(chunk.value || new Uint8Array(), { stream: true });
            buf = parseSseChunk(buf, applyTeamEvent);
            return pump();
          });
        }
        return pump();
      })
      .catch(function (err) {
        if (err && err.name === 'AbortError') return;
        sseFailCount += 1;
        if (sseFailCount >= 2) setLive('SSE 断开，正在重连…');
        scheduleSseReconnect();
      });
  }

  function scheduleSseReconnect(quiet) {
    if (!panelOpen || !currentTeam) return;
    if (sseReconnectTimer) return;
    var delay = quiet ? 400 : Math.min(4000, 800 * Math.max(1, sseFailCount));
    sseReconnectTimer = setTimeout(function () {
      sseReconnectTimer = 0;
      startSse();
    }, delay);
  }

  function stopSnapshotPoll() {
    if (snapshotPollTimer) {
      try {
        clearInterval(snapshotPollTimer);
      } catch (_) {}
      snapshotPollTimer = 0;
    }
  }

  function startSnapshotPoll() {
    stopSnapshotPoll();
    if (!panelOpen || !currentTeam) return;
    snapshotPollTimer = setInterval(function () {
      var task = api();
      if (!panelOpen || !currentTeam || !task || !task.teamSnapshot) return;
      var sync = task.teamTick ? task.teamTick(currentTeam.teamId) : Promise.resolve(null);
      sync.catch(function () { return null; }).then(function () {
        return task.teamSnapshot(currentTeam.teamId);
      }).then(function (team) {
        if (!team || !panelOpen) return;
        currentTeam = team;
        render(ensurePanel(), team);
      });
    }, 3000);
  }

  function ensureBridgeThenSse() {
    var task = api();
    if (isTerminalTeam(currentTeam)) {
      stopSse();
      stopSnapshotPoll();
      return Promise.resolve(currentTeam);
    }
    if (!task || !task.teamBridgeStart) return Promise.resolve();
    if (bridgeInfo && bridgeInfo.url && bridgeInfo.token) {
      startSse();
      startSnapshotPoll();
      return Promise.resolve(bridgeInfo);
    }
    return task
      .teamBridgeStart()
      .then(function (bridge) {
        bridgeInfo = bridge || bridgeInfo;
        if (bridgeInfo && bridgeInfo.token) {
          startSse();
          startSnapshotPoll();
        }
      })
      .catch(function (err) {
        setLive('Bridge：' + String((err && err.message) || err));
        startSnapshotPoll();
      });
  }

  function render(host, team) {
    if (!host) return;
    currentTeam = team || currentTeam;
    team = currentTeam;
    if (!team) {
      host.innerHTML =
        '<div class="ot-team-panel__empty">' +
        '<label class="ot-team-panel__policy"><input type="checkbox" data-ot-team-autonomous> 自动执行修改</label>' +
        '<b>团队</b>' +
        '<p>描述问题后发送：Lead 会动态分工，修改前仍需你批准。</p>' +
        '<button type="button" class="ot-team-panel__cta" data-ot-team-start>开始团队</button>' +
        '<div data-ot-team-live class="ot-team-panel__live"></div></div>';
      var empty = host.querySelector('.ot-team-panel__empty');
      if (empty) {
        var emptyTitle = empty.querySelector('b');
        var emptyCopy = empty.querySelector('p');
        var emptyStart = empty.querySelector('[data-ot-team-start]');
        var policy = empty.querySelector('.ot-team-panel__policy');
        if (emptyTitle) emptyTitle.textContent = 'Team';
        if (emptyCopy) emptyCopy.textContent = '\u63cf\u8ff0\u95ee\u9898\u540e\u53d1\u9001\uff0cLead \u4f1a\u52a8\u6001\u5206\u5de5\uff1b\u4fee\u6539\u524d\u9700\u8981\u4f60\u6279\u51c6\u3002';
        if (emptyStart) emptyStart.textContent = '\u5f00\u59cb Team';
        if (policy) policy.lastChild.textContent = ' \u81ea\u52a8\u6267\u884c\u4fee\u6539';
      }
      return;
    }
    var nodes = Array.isArray(team.nodes) ? team.nodes : [];
    var step = threeStepIndex(team);
    var stepLabels = ['分配任务', '并行执行', '汇总结果'];
    var membersHtml = nodes
      .map(function (n) {
        var isLead = n.role === 'lead';
        var sid = n.sessionId || n.taskId || (isLead ? team.parentTaskId : '');
        var activeStore = global.OneToneHomeAgentV2Store;
        var activeId =
          activeStore && activeStore.getSnapshot
            ? activeStore.getSnapshot().activeAgentTaskId
            : null;
        var isCurrent =
          (isLead && String(activeId || '') === String(team.parentTaskId || '')) ||
          (!isLead && sid && String(activeId || '') === String(sid));
        var err =
          n.status === 'failed' || n.status === 'cancelled'
            ? '<small class="ot-team-member__err">' + esc(n.error || '已失败') + '</small>'
            : '';
        return (
          '<button type="button" class="ot-team-member' +
          (isCurrent ? ' is-current' : '') +
          '" data-ot-team-member="' +
          esc(n.nodeId) +
          '" data-session-id="' +
          esc(sid || '') +
          '"' +
          (isCurrent && isLead ? ' disabled' : '') +
          '>' +
          '<span><b>' +
          esc(roleLabel(n.role)) +
          '</b><small>' +
          esc(
            (function () {
              var sub = String(n.subject || '').trim();
              var role = roleLabel(n.role);
              if (!sub || sub.toLowerCase() === String(n.role || '').toLowerCase() || sub === role) {
                return statusUserLabel(n.status);
              }
              return sub;
            })()
          ) +
          '</small>' +
          err +
          '</span><span class="ot-team-member__st">' +
          (isCurrent && isLead ? '当前会话' : esc(statusUserLabel(n.status))) +
          '</span></button>'
        );
      })
      .join('');
    var feed = (userMessages.length ? userMessages : ['团队正在分析'])
      .slice(-5)
      .map(function (m) {
        return '<div class="ot-team-feed__row">' + esc(m) + '</div>';
      })
      .join('');
    var phase = team.currentPhase || team.status || '';
    var actions = '';
    if (phase === 'awaiting_plan') {
      actions +=
        '<button type="button" class="ot-team-panel__cta" data-ot-team-confirm>批准修改</button>';
      actions +=
        '<button type="button" class="ot-team-panel__ghost" data-ot-team-parent>查看方案</button>';
    } else if (phase === 'awaiting_implementer') {
      // Approval is already complete; never offer the same approval again.
      actions +=
        '<button type="button" class="ot-team-panel__ghost" data-ot-team-parent>查看方案</button>';
    } else if (phase === 'needs_user') {
      actions +=
        '<button type="button" class="ot-team-panel__cta" data-ot-team-resume>继续修复</button>';
      actions +=
        '<button type="button" class="ot-team-panel__ghost" data-ot-team-cancel>取消团队</button>';
    } else if (phase === 'complete' || phase === 'done' || team.status === 'done') {
      actions +=
        '<button type="button" class="ot-team-panel__cta" data-ot-team-parent>查看汇总</button>';
    }
    var details = showDetails
      ? '<pre class="ot-team-details">' +
        esc(
          JSON.stringify(
            {
              teamId: team.teamId,
              phase: phase,
              repairRound: team.repairRound,
              nodes: nodes.map(function (n) {
                return {
                  role: n.role,
                  status: n.status,
                  revision: n.revision,
                  taskId: n.taskId
                };
              })
            },
            null,
            2
          )
        ) +
        '</pre>'
      : '';
    host.innerHTML =
      '<div class="ot-team-panel__head"><div><b>团队</b><small class="ot-team-panel__sub">当前会话</small></div>' +
      '<button type="button" data-ot-team-close aria-label="关闭">×</button></div>' +
      '<div class="ot-team-steps" aria-label="团队流程">' +
      stepLabels
        .map(function (label, i) {
          return (
            '<span class="' +
            (i < step ? 'is-done' : i === step ? 'is-on' : '') +
            '">' +
            esc(label) +
            '</span>'
          );
        })
        .join('') +
      '</div>' +
      '<div class="ot-team-panel__status" data-ot-team-live>' +
      esc(userMessages[userMessages.length - 1] || '团队正在分析') +
      '</div>' +
      '<div class="ot-team-section"><b>成员</b>' +
      membersHtml +
      '</div>' +
      '<div class="ot-team-section"><b>最新发现</b><p>' +
      esc(latestFinding(team)) +
      '</p><b>下一步</b><p>' +
      esc(nextStepCopy(team)) +
      '</p></div>' +
      '<div class="ot-team-feed">' +
      feed +
      '</div>' +
      actions +
      '<button type="button" class="ot-team-panel__ghost" data-ot-team-details>' +
      (showDetails ? '隐藏详情' : '查看详情') +
      '</button>' +
      details;
    normalizeTeamPanel(host, team, phase, nodes);
  }

  function normalizeTeamPanel(host, team, phase, nodes) {
    var head = host.querySelector('.ot-team-panel__head');
    if (head) {
      var title = head.querySelector('b');
      var sub = head.querySelector('.ot-team-panel__sub');
      if (title) title.textContent = 'Team';
      if (sub) sub.textContent = '\u5bbf\u4e3b\u8c03\u5ea6';
      var close = head.querySelector('[data-ot-team-close]');
      if (close) close.setAttribute('aria-label', '\u5173\u95ed');
      if (!host.querySelector('.ot-team-statusline')) {
        var line = document.createElement('div');
        line.className = 'ot-team-statusline';
        line.innerHTML = '<span class="ot-team-badge is-' + phaseTone(phase) + '"></span><span class="ot-team-provider"></span>';
        head.after(line);
      }
      var badge = host.querySelector('.ot-team-badge');
      var provider = host.querySelector('.ot-team-provider');
      if (badge) badge.textContent = phaseLabelClean(phase);
      if (provider) provider.textContent = String(team.executionProvider || team.leadProvider || 'deepseek') + ' · ' + (team.schedulerOwner ? '\u540e\u53f0\u8fd0\u884c\u4e2d' : '\u7b49\u5f85\u8c03\u5ea6');
    }
    var steps = host.querySelectorAll('.ot-team-steps span');
    var labels = ['\u8ba1\u5212', '\u4fee\u6539', '\u5ba1\u67e5', '\u9a8c\u8bc1'];
    for (var i = 0; i < steps.length; i++) steps[i].textContent = labels[i] || labels[0];
    var sectionTitles = host.querySelectorAll('.ot-team-section > b');
    if (sectionTitles[0]) sectionTitles[0].textContent = '\u56e2\u961f\u6210\u5458';
    if (sectionTitles[1]) sectionTitles[1].textContent = '\u6700\u8fd1\u8bc1\u636e';
    var buttons = host.querySelectorAll('[data-ot-team-confirm], [data-ot-team-resume], [data-ot-team-cancel], [data-ot-team-details]');
    buttons.forEach(function (button) {
      if (button.hasAttribute('data-ot-team-confirm')) button.textContent = '\u6279\u51c6\u4fee\u6539';
      if (button.hasAttribute('data-ot-team-resume')) button.textContent = '\u7ee7\u7eed\u4fee\u590d';
      if (button.hasAttribute('data-ot-team-cancel')) button.textContent = '\u53d6\u6d88\u56e2\u961f';
      if (button.hasAttribute('data-ot-team-details')) button.textContent = showDetails ? '\u6536\u8d77\u6280\u672f\u8be6\u60c5' : '\u67e5\u770b\u6280\u672f\u8be6\u60c5';
    });
    host.querySelectorAll('[data-ot-team-member]').forEach(function (button) {
      var node = nodes.find(function (n) { return String(n.nodeId) === String(button.getAttribute('data-ot-team-member')); });
      var role = button.querySelector('b');
      var state = button.querySelector('.ot-team-member__st');
      if (role && node) role.textContent = roleLabel(node.role);
      if (state && node) state.textContent = statusLabelClean(node.status);
    });
  }

  function ensurePanel() {
    var panel = document.querySelector('[data-ot-team-panel]');
    if (panel) return panel;
    var home =
      document.getElementById('nowHomeRoot') ||
      document.querySelector('.now-home') ||
      document.body;
    panel = document.createElement('aside');
    panel.className = 'ot-team-panel';
    panel.setAttribute('data-ot-team-panel', '');
    panel.setAttribute('aria-label', '团队对话与流程');
    home.appendChild(panel);
    panel.addEventListener('click', onPanelClick);
    return panel;
  }

  function setLive(msg) {
    var live = document.querySelector('[data-ot-team-live]');
    if (live) live.textContent = msg || '';
  }

  function pushTurn(role, text) {
    turns.push({ role: role, text: text, at: Date.now() });
    if (turns.length > 40) turns = turns.slice(-40);
  }

  function driveLead(team) {
    var task = api();
    if (!team || !team.parentTaskId) return Promise.resolve(team);
    var store = global.OneToneHomeAgentV2Store;
    // Product drive must go through WorkController — raw drive() rejects
    // with work_controller_required and left the Lead stuck at turn 0.
    var bind =
      store && typeof store.setActiveAgentTask === 'function'
        ? store.setActiveAgentTask(team.parentTaskId)
        : Promise.resolve();
    return Promise.resolve(bind)
      .then(function () {
        if (store && typeof store.driveActiveIfRunning === 'function') {
          return store.driveActiveIfRunning({ force: true });
        }
        if (task && typeof task.drive === 'function') {
          return task.drive(team.parentTaskId, null, {
            allowRawDrive: true,
            planConfirmed: true,
            goal: (team && team.goal) || ''
          });
        }
        return null;
      })
      .then(function (driven) {
        // A disabled/stale ATR projection can legitimately return null without
        // throwing.  Do not leave the Team run in `planning` in that case: use
        // the direct task drive as a compatibility fallback so the Lead gets
        // its first turn and can publish the plan/approval event.
        if (driven == null && task && typeof task.drive === 'function') {
          return task.drive(team.parentTaskId, null, {
          allowRawDrive: true,
          planConfirmed: true,
          goal: (team && team.goal) || ''
          });
        }
        if (driven && (driven.status === 'failed' || driven.status === 'interrupted')) {
          throw new Error(driven.lastError || driven.last_error || 'lead_task_failed');
        }
        return driven;
      })
      .then(function () {
        if (!task || typeof task.teamSnapshot !== 'function') return team;
        return task.teamSnapshot(team.teamId);
      })
      .then(function (updated) {
        currentTeam = updated || team;
        render(ensurePanel(), currentTeam);
        setLive(userMessages[userMessages.length - 1] || 'Lead 正在协调…');
        return currentTeam;
      })
      .catch(function (err) {
        var raw = String((err && (err.message || err.code)) || err || '');
        setLive(
          /controller_required|work_controller/i.test(raw)
            ? 'Lead 驱动失败：工作控制器未就绪'
            : 'Lead 驱动：' + raw
        );
        // The Lead ATR can fail independently of the SSE bridge (for example
        // WorkBuddy budget_time). Reconcile immediately so the Team drawer
        // leaves `planning` and exposes the recovery action.
        if (task && typeof task.teamReconcile === 'function') {
          return task.teamReconcile(team.teamId).then(function (updated) {
            currentTeam = updated || team;
            if (updated && (updated.status === 'needs_user' || updated.status === 'failed')) {
              stopSse();
              stopSnapshotPoll();
              setLive('Lead 已失败：' + (raw || '请继续修复或取消团队'));
            }
            render(ensurePanel(), currentTeam);
            return currentTeam;
          }).catch(function () {
            return team;
          });
        }
        return team;
      });
  }

  function startFromGoal(goal) {
    goal = String(goal || '').trim();
    if (!goal) {
      if (panelOpen) setLive('先在左侧输入框写一句问题描述');
      return Promise.resolve(null);
    }
    if (startInFlight) {
      setLive('团队正在启动，请稍候…');
      return startInFlight;
    }
    var task = api();
    if (!task || typeof task.teamStart !== 'function') {
      expandTeamPanel();
      setLive('启动失败：团队模块未加载');
      return Promise.reject(new Error('team_api_missing'));
    }
    armed = true;
    expandTeamPanel();
    pushTurn('user', goal);
    userMessages = ['正在创建团队…'];
    clearHomeDraft();
    setLive('正在创建团队…');
    render(ensurePanel(), currentTeam);
    startInFlight = task
      .teamStart({
        goal: goal,
        workspaceRoot: workspaceRoot(),
        autoPlan: false,
        autonomousWrite: readAutonomousWrite()
      })
      .then(function (team) {
        currentTeam = team;
        rememberTeamId(team && team.teamId);
        lastEventId = null;
        userMessages = ['团队正在分析'];
        pushTurn('assistant', 'Lead 已创建，正在动态分工…');
        render(ensurePanel(), team);
        setLive('Lead 已创建，正在驱动…');
        // SSE must not gate Lead drive — bridge hang left both sides stuck.
        ensureBridgeThenSse();
        return driveLead(team);
      })
      .catch(function (err) {
        var msg = String((err && err.message) || err || 'unknown');
        setLive('启动失败：' + msg);
        render(ensurePanel(), currentTeam);
        throw err;
      })
      .then(
        function (v) {
          startInFlight = null;
          return v;
        },
        function (err) {
          startInFlight = null;
          throw err;
        }
      );
    return startInFlight;
  }

  function openMemberSession(nodeId) {
    var team = currentTeam;
    if (!team) return;
    var node = (team.nodes || []).find(function (n) {
      return n.nodeId === nodeId;
    });
    if (!node) {
      setLive('成员不存在');
      return;
    }
    var sessionId =
      node.sessionId || node.taskId || (node.role === 'lead' ? team.parentTaskId : '');
    if (!sessionId) {
      setLive(roleLabel(node.role) + ' 尚未启动会话');
      return;
    }
    if (node.role === 'lead') {
      var store0 = global.OneToneHomeAgentV2Store;
      var active =
        store0 && store0.getSnapshot ? store0.getSnapshot().activeAgentTaskId : null;
      if (String(active || '') === String(team.parentTaskId || '')) {
        setLive('已在 Lead 当前会话');
        return;
      }
    }
    // Validate mapping.
    if (String(node.teamId || team.teamId) !== String(team.teamId)) {
      setLive('会话校验失败');
      return;
    }
    viewingNodeId = node.nodeId;
    var store = global.OneToneHomeAgentV2Store;
    if (store && typeof store.setActiveAgentTask === 'function') {
      store.setActiveAgentTask(sessionId);
      setLive('已打开 ' + roleLabel(node.role) + ' 会话');
      render(ensurePanel(), team);
    }
  }

  function onPanelClick(ev) {
    var t = ev.target;
    if (!t || !t.closest) return;
    var task = api();
    if (t.closest('[data-ot-team-close]')) {
      exitTeamMode();
      return;
    }
    if (t.closest('[data-ot-team-details]')) {
      showDetails = !showDetails;
      render(ensurePanel(), currentTeam);
      return;
    }
    var member = t.closest('[data-ot-team-member]');
    if (member) {
      openMemberSession(member.getAttribute('data-ot-team-member'));
      return;
    }
    if (t.closest('[data-ot-team-start]')) {
      startFromGoal(readHomeDraft());
      return;
    }
    if (t.closest('[data-ot-team-confirm]')) {
      if (!currentTeam || !task) return;
      var confirmPhase = String(currentTeam.currentPhase || currentTeam.status || '');
      if (confirmPhase !== 'awaiting_plan' && confirmPhase !== 'planning') return;
      task
        .teamConfirmPlan(currentTeam.teamId, { source: 'home_team_panel' })
        .then(function (updated) {
          currentTeam = updated;
          userMessages.push('等待你的确认');
          render(ensurePanel(), updated);
        });
      return;
    }
    if (t.closest('[data-ot-team-parent]')) {
      var parentId = currentTeam && currentTeam.parentTaskId;
      var store = global.OneToneHomeAgentV2Store;
      if (parentId && store && typeof store.setActiveAgentTask === 'function') {
        viewingNodeId = null;
        store.setActiveAgentTask(parentId);
      }
      return;
    }
    if (t.closest('[data-ot-team-advance]')) {
      if (!currentTeam || !task) return;
      task
        .teamAdvance(currentTeam.teamId)
        .then(function (updated) {
          currentTeam = updated;
          render(ensurePanel(), updated);
        })
        .catch(function (err) {
          setLive('继续失败：' + String((err && err.message) || err));
        });
    }
    if (t.closest('[data-ot-team-resume]')) {
      if (!currentTeam || !task || typeof task.teamResume !== 'function') return;
      task.teamResume(currentTeam.teamId).then(function (updated) {
        currentTeam = updated;
        render(ensurePanel(), updated);
      }).catch(function (err) {
        setLive('继续修复失败：' + String((err && err.message) || err));
      });
      return;
    }
    if (t.closest('[data-ot-team-cancel]')) {
      if (!currentTeam || !task || typeof task.teamCancel !== 'function') return;
      task.teamCancel(currentTeam.teamId).then(function () {
        return task.teamReconcile ? task.teamReconcile(currentTeam.teamId) : currentTeam;
      }).then(function (updated) {
        currentTeam = updated;
        render(ensurePanel(), updated);
      }).catch(function (err) {
        setLive('取消团队失败：' + String((err && err.message) || err));
      });
      return;
    }
  }

  function onSendCapture(ev) {
    if (!armed) return;
    var t = ev.target;
    if (!t || !t.closest) return;
    if (!t.closest('[data-ha2-send]')) return;
    var goal = readHomeDraft();
    if (!goal) return;
    ev.preventDefault();
    ev.stopPropagation();
    startFromGoal(goal);
  }

  function hookSend() {
    if (sendHooked) return;
    sendHooked = true;
    document.addEventListener('click', onSendCapture, true);
  }

  function syncTeamChrome() {
    var home =
      document.getElementById('nowHomeRoot') || document.querySelector('.now-home');
    if (home) {
      home.classList.toggle('is-team-armed', !!armed);
      home.classList.toggle('is-team-mode', !!panelOpen);
    }
    var store = global.OneToneHomeAgentV2Store;
    var wm =
      store && store.getSnapshot ? String(store.getSnapshot().workMode || '') : '';
    var on = !!armed || wm === 'team';
    var btns = document.querySelectorAll(
      '.hn-intent-btn--team, [data-ha2-team-focus], [data-hf-act="open_team"], [data-ha2-work-mode="team"]'
    );
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      btns[i].classList.toggle('is-on', on);
    }
  }

  function expandTeamPanel() {
    panelOpen = true;
    var panel = ensurePanel();
    panel.removeAttribute('hidden');
    syncTeamChrome();
    if (currentTeam) ensureBridgeThenSse();
  }

  /** Focus paint replaces #nowHomeRoot innerHTML — reattach drawer + chrome. */
  function restoreAfterPaint() {
    if (!armed && !panelOpen) return;
    syncTeamChrome();
    if (!panelOpen) return;
    var panel = ensurePanel();
    panel.removeAttribute('hidden');
    if (!currentTeam) {
      // Panel survived paint but in-memory team was lost — recover like 查看 Agent.
      showPanel({ taskId: resolveParentTaskId('') });
      return;
    }
    render(panel, currentTeam);
    if (!sseAbort) {
      if (bridgeInfo && bridgeInfo.token) startSse();
      else ensureBridgeThenSse();
    }
  }

  function armTeamMode() {
    var store = global.OneToneHomeAgentV2Store;
    if (armed && !panelOpen) {
      armed = false;
      if (store && store.setWorkMode) {
        try {
          store.setWorkMode('think', { silent: true });
        } catch (_) {}
      }
      syncTeamChrome();
      return;
    }
    armed = true;
    hookSend();
    if (store && store.setWorkMode) {
      try {
        store.setWorkMode('team');
      } catch (_) {}
    }
    syncTeamChrome();
    var ta =
      document.querySelector('.ha2-compose [data-ha2-draft]') ||
      document.querySelector('[data-ha2-draft]');
    if (ta && ta.focus) {
      try {
        ta.focus({ preventScroll: true });
      } catch (_) {
        try {
          ta.focus();
        } catch (_2) {}
      }
    }
  }

  function enterTeamMode() {
    armTeamMode();
  }

  function exitTeamMode() {
    stopSse();
    stopSnapshotPoll();
    armed = false;
    panelOpen = false;
    viewingNodeId = null;
    var home =
      document.getElementById('nowHomeRoot') || document.querySelector('.now-home');
    if (home) {
      home.classList.remove('is-team-mode');
      home.classList.remove('is-team-armed');
    }
    var panel = document.querySelector('[data-ot-team-panel]');
    if (panel) panel.setAttribute('hidden', '');
    var store = global.OneToneHomeAgentV2Store;
    if (store && store.setWorkMode && store.getSnapshot) {
      if (store.getSnapshot().workMode === 'team') {
        try {
          store.setWorkMode('think', { silent: true });
        } catch (_) {}
      }
    }
    syncTeamChrome();
  }

  function isTeamLeadGoal(goal) {
    return /You are the Team Lead/i.test(String(goal || ''));
  }

  /** Prefer explicit id, then active ATR / stack row that looks like Lead. */
  function resolveParentTaskId(explicit) {
    var id = String(explicit || '').trim();
    if (id) return id;
    try {
      var store = global.OneToneHomeAgentV2Store;
      var snap = store && store.getSnapshot && store.getSnapshot();
      if (!snap) return '';
      if (snap.agentTask && isTeamLeadGoal(snap.agentTask.goal)) {
        return String(snap.agentTask.taskId || '');
      }
      if (snap.activeAgentTaskId) return String(snap.activeAgentTaskId);
      var stack = snap.agentTaskStack || [];
      for (var i = stack.length - 1; i >= 0; i--) {
        var t = stack[i] && stack[i].task;
        if (t && isTeamLeadGoal(t.goal) && t.taskId) return String(t.taskId);
      }
    } catch (_) {}
    return '';
  }

  /** Always show the right drawer (no arm-toggle). Used by 查看 Agent / 团队. */
  function showPanel(opts) {
    opts = opts || {};
    armed = true;
    hookSend();
    var store = global.OneToneHomeAgentV2Store;
    if (store && typeof store.setWorkMode === 'function') {
      try {
        store.setWorkMode('team');
      } catch (_) {}
    }
    var taskId = resolveParentTaskId(opts.taskId);
    if (taskId && store && typeof store.setActiveAgentTask === 'function') {
      try {
        store.setActiveAgentTask(taskId);
      } catch (_) {}
    }
    expandTeamPanel();
    function paintTeam(team) {
      if (team) {
        var reconcile = api();
        var sync = reconcile && reconcile.teamReconcile
          ? reconcile.teamReconcile(team.teamId).catch(function () { return team; })
          : Promise.resolve(team);
        sync.then(function (fresh) {
          currentTeam = fresh || team;
          rememberTeamId(currentTeam.teamId);
          render(ensurePanel(), currentTeam);
          ensureBridgeThenSse();
        });
      } else {
        render(ensurePanel(), null);
        setLive(
          taskId ? '未找到对应团队，可重新发送目标' : '描述问题后发送，或等待团队创建'
        );
      }
      syncTeamChrome();
    }
    if (currentTeam) {
      paintTeam(currentTeam);
      return;
    }
    var task = api();
    function hydrateFromParent(pid) {
      if (!task || !pid || typeof task.teamByParent !== 'function') {
        return Promise.reject(new Error('no_parent'));
      }
      return task.teamByParent(pid);
    }
    function hydrateFromRemembered() {
      var remembered = readRememberedTeamId();
      if (!task || !remembered || typeof task.teamSnapshot !== 'function') {
        return Promise.reject(new Error('no_remembered'));
      }
      return task.teamSnapshot(remembered);
    }
    if (hydrateInFlight) return;
    setLive('正在恢复团队状态…');
    hydrateInFlight = hydrateFromParent(taskId)
      .catch(function () {
        return hydrateFromRemembered();
      })
      .then(function (team) {
        paintTeam(team || null);
      })
      .catch(function () {
        paintTeam(null);
      })
      .then(
        function () {
          hydrateInFlight = null;
        },
        function () {
          hydrateInFlight = null;
        }
      );
  }

  function openDrawer() {
    showPanel();
  }

  function mount() {}

  global.OneToneAgentTeam = {
    mount: mount,
    render: render,
    openDrawer: openDrawer,
    showPanel: showPanel,
    isTeamLeadGoal: isTeamLeadGoal,
    armTeamMode: armTeamMode,
    expandTeamPanel: expandTeamPanel,
    restoreAfterPaint: restoreAfterPaint,
    enterTeamMode: enterTeamMode,
    exitTeamMode: exitTeamMode,
    isActive: function () {
      return !!armed;
    },
    isPanelOpen: function () {
      return !!panelOpen;
    },
    startFromGoal: startFromGoal,
    getTeam: function () {
      return currentTeam;
    }
  };
  if (global.addEventListener) global.addEventListener('onetone:home-agent-mounted', mount);
  if (global.setTimeout) global.setTimeout(mount, 0);
})(typeof window !== 'undefined' ? window : globalThis);
