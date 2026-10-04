/**
 * Now home — AgentCapabilityProfile + homeViewModel.
 * Demo fixtures until Provider Adapter lands; live path maps attention → degraded task.
 */
(function (global) {
  'use strict';

  var STATUS_UI = {
    idle: { label: '待命' },
    planning: { label: '在想办法' },
    running: { label: '正在工作' },
    waiting_approval: { label: '需要你确认' },
    paused: { label: '已暂停更新' },
    failed: { label: '遇到问题' },
    completed: { label: '做完了' },
    cancelled: { label: '已停止' }
  };

  var PROFILES = {
    opencode: {
      provider: 'OpenCode',
      level: 3,
      voiceLine: '正在执行任务步骤',
      supports: {
        liveEvents: true,
        toolEvents: true,
        fileChanges: true,
        taskSteps: true,
        progress: true,
        pause: false,
        abort: true,
        resume: true,
        approval: false,
        subAgents: false,
        memoryInjection: true
      },
      controlQuality: { pause: 'monitor', abort: 'request', resume: 'local' },
      sourceQuality: { status: 'native', progress: 'runner' }
    },
    cursor: {
      provider: 'Cursor CLI',
      level: 2,
      voiceLine: '正在修改项目文件',
      supports: {
        liveEvents: true,
        toolEvents: true,
        fileChanges: true,
        taskSteps: false,
        progress: false,
        pause: false,
        abort: true,
        resume: true,
        approval: false,
        subAgents: false,
        memoryInjection: true
      },
      controlQuality: { pause: 'monitor', abort: 'request', resume: 'local' },
      sourceQuality: { status: 'native', progress: 'inferred' }
    },
    'claude-code': {
      provider: 'Claude Hook',
      level: 2,
      voiceLine: '正在协作处理任务',
      supports: {
        liveEvents: true,
        toolEvents: true,
        fileChanges: false,
        taskSteps: false,
        progress: false,
        pause: false,
        abort: true,
        resume: false,
        approval: true,
        subAgents: true,
        memoryInjection: true
      },
      controlQuality: { pause: 'none', abort: 'request', resume: 'none' },
      sourceQuality: { status: 'native', progress: 'none' }
    }
  };

  var EVENT_VISIBILITY = {
    tool_called: 'toolEvents',
    file_changed: 'fileChanges',
    subagent_started: 'subAgents',
    memory_recalled: 'memoryInjection',
    checkpoint_created: 'taskSteps',
    task_step: 'taskSteps'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function canShowEvent(event, profile) {
    var required = EVENT_VISIBILITY[event && event.type];
    return !required || !!(profile && profile.supports && profile.supports[required]);
  }

  function profileOf(task) {
    return (task && (task.profile || PROFILES[task.profileId])) || PROFILES.cursor;
  }

  function profileIdFromAgentName(name) {
    var n = String(name || '').toLowerCase();
    if (n.indexOf('claude') >= 0) return 'claude-code';
    if (n.indexOf('opencode') >= 0 || n.indexOf('open code') >= 0) return 'opencode';
    if (n.indexOf('cursor') >= 0) return 'cursor';
    return 'cursor';
  }

  function cloneJson(x) {
    return JSON.parse(JSON.stringify(x));
  }

  /** Demo fixtures: profileId + profile + snapshot (capability ≠ run state). */
  var FIXTURES = [
    {
      profileId: 'opencode',
      snapshot: {
        runId: 'run_oc_01',
        taskId: 'task_pad_bind',
        status: 'running',
        title: '修复 Soft Pad 绑定在 Cursor 丢失',
        currentStep: { id: 's3', title: '写入绑定诊断补丁', index: 3 },
        progress: { completed: 2, total: 6 },
        activeAgent: { id: 'opencode', name: 'OpenCode', short: 'OC' },
        latestEvent: { type: 'file_changed', summary: '修改诊断模块' },
        resumable: true,
        checkpointId: 'ckpt_19'
      },
      waitReason: '',
      steps: [
        { id: 's1', title: '读取项目 Todo', detail: '整理待办', status: 'done' },
        { id: 's2', title: '定位绑定丢失', detail: '前台切换对比', status: 'done' },
        { id: 's3', title: '写入绑定诊断补丁', detail: '补齐会话恢复', status: 'running' },
        { id: 's4', title: '跑绑定冒烟', detail: '灯态与会话', status: 'pending' },
        { id: 's5', title: '等待确认改动', detail: '是否保留日志', status: 'pending' },
        { id: 's6', title: '记下可继续位置', detail: 'checkpoint', status: 'pending' }
      ],
      events: [
        { id: 'e1', type: 'task_started', time: '11:02', summary: '开始处理', detail: '', tier: 'runner' },
        { id: 'e2', type: 'task_step', time: '11:02', summary: '读取项目 Todo', detail: '', tier: 'runner' },
        { id: 'e3', type: 'tool_called', time: '11:03', summary: '读取 diagnose.rs', detail: '', tier: 'provider' },
        { id: 'e4', type: 'file_changed', time: '11:04', summary: '修改诊断模块', detail: '', tier: 'provider' },
        { id: 'e5', type: 'checkpoint_created', time: '11:04', summary: '创建 ckpt_19', detail: '', tier: 'runner' }
      ],
      memories: [
        { id: 'm1', kind: 'observation', title: '切前台后绑定表被重置', body: '会话未挂载' },
        { id: 'm2', kind: 'reasoning', title: '优先修会话恢复', body: '不重写 UI' }
      ],
      context: [{ label: '代码 8 个文件' }, { label: '最近改动 12 行' }, { label: '记忆 3 条' }]
    },
    {
      profileId: 'cursor',
      snapshot: {
        runId: 'run_cr_01',
        taskId: 'task_cursor_edit',
        status: 'running',
        title: '修复 Soft Pad 绑定在 Cursor 丢失',
        currentStep: { id: 's0', title: '正在修改相关文件', index: 0 },
        progress: { completed: 0, total: 0 },
        activeAgent: { id: 'cursor', name: 'Cursor', short: 'CR' },
        latestEvent: { type: 'file_changed', summary: '修改诊断模块' },
        resumable: false,
        checkpointId: ''
      },
      waitReason: '',
      steps: [],
      events: [
        { id: 'e1', type: 'task_started', time: '11:10', summary: '开始处理', detail: '', tier: 'runner' },
        { id: 'e2', type: 'tool_called', time: '11:10', summary: '读取相关文件', detail: '', tier: 'provider' },
        { id: 'e3', type: 'file_changed', time: '11:11', summary: '修改了诊断模块', detail: '', tier: 'provider' },
        { id: 'e4', type: 'tool_called', time: '11:11', summary: '正在查看调用处', detail: '', tier: 'provider' }
      ],
      memories: [
        { id: 'm1', kind: 'observation', title: '相关文件已打开', body: 'diagnose.rs' },
        { id: 'm2', kind: 'git', title: '工作区有未提交改动', body: '+12' }
      ],
      context: [{ label: '代码文件若干' }, { label: '最近改动' }, { label: '记忆 2 条' }]
    },
    {
      profileId: 'claude-code',
      snapshot: {
        runId: 'run_cc_01',
        taskId: 'task_voice_end',
        status: 'waiting_approval',
        title: '优化语音结束判定误触发',
        currentStep: { id: 's4', title: '等待你批准下一步', index: 4 },
        progress: { completed: 0, total: 0 },
        activeAgent: { id: 'claude-code', name: 'Claude Code', short: 'CC' },
        latestEvent: { type: 'waiting_approval', summary: '确认阈值方案' },
        resumable: true,
        checkpointId: ''
      },
      waitReason: '是否将静音阈值从 820ms 调整为 640ms？',
      steps: [],
      events: [
        { id: 'e1', type: 'task_started', time: '10:41', summary: '开始协作', detail: '', tier: 'runner' },
        { id: 'e2', type: 'tool_called', time: '10:42', summary: '刚刚请求执行命令', detail: '', tier: 'provider' },
        { id: 'e3', type: 'subagent_started', time: '10:43', summary: '子 Agent 正在检查测试', detail: '', tier: 'provider' },
        { id: 'e4', type: 'waiting_approval', time: '10:44', summary: '等待你的确认', detail: '', tier: 'provider' }
      ],
      memories: [
        { id: 'm1', kind: 'observation', title: '短停顿会被误判为结束', body: '500–700ms' },
        { id: 'm2', kind: 'reasoning', title: '先改阈值再谈模型', body: '可回退' }
      ],
      context: [{ label: '代码 3 个文件' }, { label: '日志片段' }, { label: '记忆 2 条' }]
    },
    {
      profileId: 'opencode',
      snapshot: {
        runId: 'run_oc_done',
        taskId: 'task_coach_hud',
        status: 'completed',
        title: '更新 Coach HUD 进度文案',
        currentStep: { id: 's4', title: '任务完成', index: 4 },
        progress: { completed: 4, total: 4 },
        activeAgent: { id: 'opencode', name: 'OpenCode', short: 'OC' },
        latestEvent: { type: 'task_completed', summary: '做完了' },
        resumable: false,
        checkpointId: 'ckpt_22'
      },
      waitReason: '',
      steps: [
        { id: 's1', title: '定位文案', detail: '', status: 'done' },
        { id: 's2', title: '改写句式', detail: '', status: 'done' },
        { id: 's3', title: '冒烟检查', detail: '', status: 'done' },
        { id: 's4', title: '完成', detail: '', status: 'done' }
      ],
      events: [
        { id: 'e1', type: 'task_started', time: '08:55', summary: '开始', detail: '', tier: 'runner' },
        { id: 'e2', type: 'file_changed', time: '08:57', summary: '更新了文案文件', detail: '', tier: 'provider' },
        { id: 'e3', type: 'task_completed', time: '08:58', summary: '这件事做完了', detail: '', tier: 'provider' }
      ],
      memories: [{ id: 'm1', kind: 'observation', title: '文案过长会被截断', body: '' }],
      context: [{ label: '代码 1 个文件' }, { label: '记忆 1 条' }]
    },
    {
      profileId: 'cursor',
      snapshot: {
        runId: 'run_cr_idle',
        taskId: 'task_idle',
        status: 'idle',
        title: '',
        currentStep: null,
        progress: { completed: 0, total: 0 },
        activeAgent: { id: 'cursor', name: 'Cursor', short: 'CR' },
        latestEvent: null,
        resumable: false,
        checkpointId: ''
      },
      waitReason: '',
      steps: [],
      events: [],
      memories: [],
      context: []
    }
  ];

  function hydrateFixture(raw) {
    var t = cloneJson(raw);
    t.profile = PROFILES[t.profileId] || PROFILES.cursor;
    return t;
  }

  function cloneFixture(index) {
    var i = Math.max(0, Math.min(FIXTURES.length - 1, Number(index) || 0));
    return hydrateFixture(FIXTURES[i]);
  }

  function syncSnapshotFromEvents(task) {
    if (!task || !task.snapshot) return;
    var snap = task.snapshot;
    if (task.steps && task.steps.length) {
      var done = task.steps.filter(function (s) {
        return s.status === 'done';
      }).length;
      snap.progress = { completed: done, total: task.steps.length };
      var active =
        task.steps.find(function (s) {
          return (
            s.status === 'running' ||
            s.status === 'waiting_approval' ||
            s.status === 'failed'
          );
        }) || task.steps[task.steps.length - 1];
      if (active) {
        snap.currentStep = {
          id: active.id,
          title: active.title,
          index: task.steps.indexOf(active) + 1
        };
      }
    }
    var last = task.events && task.events[task.events.length - 1];
    if (last) snap.latestEvent = { type: last.type, summary: last.summary };
  }

  function friendlyEvent(ev) {
    var map = {
      task_started: '开始处理这件事',
      task_step: '推进了一步',
      tool_called: '查看了相关代码',
      file_changed: '改好了一些文件',
      memory_recalled: '想起以前类似的处理',
      checkpoint_created: '记好了可继续的位置',
      waiting_approval: '等待你的确认',
      subagent_started: '有个助手正在帮忙检查',
      task_paused: '已暂停状态更新',
      task_resumed: '继续处理',
      task_completed: '这件事做完了',
      task_failed: '碰到问题，先停一下',
      session_aborted: '已停止这次处理',
      user_turn_observed: '你刚发了一条消息',
      session_discovered: '发现了新的对话',
      session_updated: '对话有了新进展'
    };
    if (map[ev.type]) return map[ev.type];
    var raw = String(ev.summary || '').trim();
    if (!raw) return '有一点新动静';
    // Strip leftover tech tokens if summary leaks through.
    if (/session|checkpoint|probe|sync|provider/i.test(raw) && raw.length < 48) {
      return '最近有一点新动静';
    }
    return raw;
  }

  function eventMark(ev, isLatest) {
    if (ev.type === 'task_failed' || ev.type === 'session_aborted') {
      return { cls: 'is-fail', mark: '!' };
    }
    if (ev.type === 'waiting_approval' || ev.type === 'task_paused') {
      return { cls: 'is-wait', mark: '…' };
    }
    if (
      isLatest &&
      (ev.type === 'tool_called' ||
        ev.type === 'file_changed' ||
        ev.type === 'task_resumed' ||
        ev.type === 'subagent_started')
    ) {
      return { cls: 'is-now', mark: '●' };
    }
    return { cls: 'is-done', mark: '✓' };
  }

  function buildHomeView(task) {
    if (!task) {
      return buildHomeView(
        taskFromAttention(null, null, { demo: false })
      );
    }
    syncSnapshotFromEvents(task);
    var snap = task.snapshot;
    var profile = profileOf(task);
    var st = snap.status;
    var name = (snap.activeAgent && snap.activeAgent.name) || profile.provider;
    var idle = st === 'idle' || st === 'cancelled';
    var pq = profile.sourceQuality.progress;
    var cq = profile.controlQuality || {};
    var supports = profile.supports || {};

    var helpK =
      st === 'completed'
        ? '刚刚完成'
        : st === 'failed'
          ? '遇到问题'
          : st === 'waiting_approval'
            ? '需要你确认'
            : st === 'paused'
              ? '已暂停更新'
              : idle
                ? '现在'
                : '正在处理';

    var title;
    var blurb;
    if (idle) {
      title = '现在没有正在处理的事';
      blurb = '你可以让 Agent 帮你做一件事，或使用下方语音听写。';
    } else if (st === 'running' || st === 'planning') {
      title = snap.title ? '「' + snap.title + '」' : '正在处理中';
      blurb = '<b>' + esc(name) + '</b> 正在帮你处理这件事';
    } else if (st === 'completed') {
      title = snap.title ? '「' + snap.title + '」' : '任务已完成';
      blurb = '刚帮你做完，可以查看结果或继续做相关的事。';
    } else if (st === 'failed') {
      title = snap.title ? '「' + snap.title + '」' : '处理未完成';
      blurb = task.waitReason || '这次处理遇到了问题，可以查看原因后重试。';
    } else if (st === 'waiting_approval') {
      title = snap.title ? '「' + snap.title + '」' : '等待你的确认';
      blurb = task.waitReason || '<b>' + esc(name) + '</b> 在等你确认后再继续';
    } else if (st === 'paused') {
      title = snap.title ? '「' + snap.title + '」' : '已暂停更新';
      blurb = task.waitReason || '状态更新已暂停，随时可以继续。';
    } else {
      title = snap.title || '正在处理';
      blurb = '<b>' + esc(name) + '</b> · ' + esc(profile.voiceLine);
    }

    var stepText = null;
    if (!idle) {
      if (supports.taskSteps && snap.currentStep) stepText = snap.currentStep.title;
      else if (st === 'waiting_approval') stepText = '等待你确认下一步';
      else if (pq === 'inferred' || !supports.progress) stepText = '正在工作';
      else if (snap.currentStep) stepText = snap.currentStep.title;
    }

    var progress = null;
    if (
      !idle &&
      supports.progress &&
      (pq === 'native' || pq === 'runner') &&
      snap.progress &&
      snap.progress.total > 0
    ) {
      var doneN = snap.progress.completed;
      var total = snap.progress.total;
      progress = {
        text: '已完成 ' + doneN + ' / ' + total + ' 步',
        pct: Math.round((doneN / total) * 100)
      };
    }

    var actions = [];
    function addAct(id, label, kind) {
      actions.push({ id: id, label: label, kind: kind || 'default' });
    }

    if (idle) {
      addAct('hand', '让 Agent 帮我做一件事', 'primary');
    } else if (st === 'running' || st === 'planning') {
      addAct('detail', '查看进度', 'primary');
      if (supports.abort && cq.abort !== 'none') addAct('abort', '停止这次处理', 'default');
      if (supports.pause === true) addAct('pause-task', '暂停任务', 'default');
      else if (cq.pause === 'monitor') addAct('pause', '暂停状态更新', 'ghost');
    } else if (st === 'paused') {
      addAct('resume', '继续处理', 'primary');
      addAct('detail', '查看进度', 'default');
    } else if (st === 'waiting_approval') {
      if (supports.approval) {
        addAct('approve', '查看并继续', 'primary');
        addAct('detail', '查看会话', 'default');
      } else {
        addAct('detail', '查看并继续', 'primary');
      }
    } else if (st === 'failed') {
      if (
        cq.resume === 'local' ||
        cq.resume === 'provider' ||
        supports.resume ||
        snap.checkpointId
      ) {
        addAct('resume', '从上次进度继续', 'primary');
      }
      addAct('detail', '看看哪里出了问题', 'default');
    } else if (st === 'completed') {
      addAct(
        'continue-last',
        snap.checkpointId ? '从上次进度继续' : '再做一件相关的事',
        'primary'
      );
      addAct('detail', '回顾这次处理', 'default');
    } else if (st === 'cancelled') {
      addAct('hand', '让 Agent 帮我做', 'primary');
    }

    var visibleEvents = (task.events || [])
      .filter(function (ev) {
        return canShowEvent(ev, profile);
      })
      .slice()
      .reverse()
      .slice(0, 3);

    var activity = visibleEvents.map(function (ev, idx) {
      var mk = eventMark(ev, idx === 0);
      return { text: friendlyEvent(ev), time: ev.time, mark: mk };
    });

    var refs = {
      statsLine:
        (task.contextDetail && task.contextDetail.length
          ? task.contextDetail
          : task.context && task.context.length
            ? task.context
            : []
        )
          .map(function (c) {
            return c.label;
          })
          .join(' · ') || '暂无更多上下文',
      memLines: (function () {
        if (!supports.memoryInjection) return [];
        var lines = (task.memories || []).slice(0, 4).map(function (m) {
          return { id: m.id, kind: m.kind, title: m.title, body: m.body || '' };
        });
        if (!lines.length) {
          return [{ id: 'empty_mem', kind: 'context', title: '还没有项目相关记忆', body: '' }];
        }
        return lines;
      })()
    };

    var contextLine;
    if (idle) contextLine = '现在很安静。需要时，让 Agent 帮你做一件事。';
    else if (st === 'completed') contextLine = '刚帮你做完：「' + snap.title + '」';
    else if (st === 'failed') contextLine = '处理「' + snap.title + '」时遇到问题。';
    else if (st === 'waiting_approval') contextLine = '处理到关键一步了，需要你看一眼再继续。';
    else if (st === 'paused') contextLine = '状态更新已暂停。随时可以继续。';
    else contextLine = '正在帮你处理这件事。';

    return {
      helpK: helpK,
      title: title,
      blurb: blurb,
      voiceLine: profile.voiceLine,
      statusText: (STATUS_UI[st] || STATUS_UI.idle).label,
      stepText: stepText,
      progress: progress,
      actions: actions,
      activity: activity,
      activityEmpty: supports.liveEvents ? '还没有新动静' : '暂时看不到实时活动',
      needYou: !idle && task.waitReason ? task.waitReason : null,
      refs: refs,
      idle: idle,
      status: st,
      busy: st === 'running' || st === 'planning' || st === 'waiting_approval',
      contextLine: contextLine,
      agentName: name,
      controlNote:
        (st === 'running' || st === 'planning') && cq.pause === 'monitor'
          ? '「暂停状态更新」只影响 OneTone 显示刷新，不会假装已控制外部 Agent。'
          : st === 'paused'
            ? '页面不再追新事件。点「继续处理」恢复更新。'
            : '',
      demo: !!task.demo,
      profileId: task.profileId || 'cursor'
    };
  }

  /**
   * Live degraded task from attention + needsYou.
   * No fake progress; Claude-like agents get approval; others open Soft Pad on detail.
   * Maps: needsInput → waiting_approval · working → running · error → failed · else idle.
   */
  function taskFromAttention(attn, needsYou, opts) {
    opts = opts || {};
    var list = Array.isArray(needsYou) ? needsYou : [];
    var need = null;
    var progressNeed = null;
    for (var i = 0; i < list.length; i++) {
      if (!list[i]) continue;
      if (list[i].id === 'approve_rm' || list[i].id === 'view_reply') {
        if (!need) need = list[i];
      } else if (list[i].id === 'view_progress') {
        progressNeed = list[i];
      }
    }

    function rowState(r) {
      var st = r && (r.state || r.State);
      if (!st) return '';
      if (typeof st === 'string') return st;
      if (st.needsInput) return 'needsInput';
      if (st.working) return 'working';
      if (st.error) return 'error';
      if (st.complete) return 'complete';
      return String(st);
    }

    var kinds = (attn && (attn.waitingKinds || attn.waiting_kinds)) || [];
    var rows = (attn && attn.rows) || [];
    var agentName = '';
    if (need && need.title) {
      agentName = String(need.title).replace(/^批准\s*/, '').split(/\s/)[0] || '';
    }
    var pickRow = null;
    for (var r = 0; r < rows.length; r++) {
      var rs = rowState(rows[r]);
      if (rs === 'needsInput' || rs === 'working' || rs === 'error') {
        pickRow = rows[r];
        break;
      }
    }
    if (!pickRow && rows[0]) pickRow = rows[0];
    if (!agentName && pickRow && pickRow.agent) agentName = pickRow.agent;

    var profileId = profileIdFromAgentName(agentName);
    var profile = PROFILES[profileId] || PROFILES.cursor;
    var short =
      profileId === 'claude-code' ? 'CC' : profileId === 'opencode' ? 'OC' : 'CR';
    var displayName =
      profileId === 'claude-code'
        ? 'Claude Code'
        : profileId === 'opencode'
          ? 'OpenCode'
          : agentName
            ? String(agentName).charAt(0).toUpperCase() + String(agentName).slice(1)
            : 'Cursor';

    function baseTask(status, title, waitReason, events) {
      return {
        profileId: profileId,
        profile: profile,
        demo: !!opts.demo,
        snapshot: {
          runId: 'live_attn',
          taskId: 'live_' + status,
          status: status,
          title: title,
          currentStep: status === 'idle' ? null : { id: 'w', title: title, index: 0 },
          progress: { completed: 0, total: 0 },
          activeAgent: { id: profileId, name: displayName, short: short },
          latestEvent: events && events[0] ? { type: events[0].type, summary: events[0].summary } : null,
          resumable: status === 'waiting_approval' || status === 'failed' || status === 'paused',
          checkpointId: ''
        },
        waitReason: waitReason || '',
        steps: [],
        events: events || [],
        memories: [],
        context: []
      };
    }

    var waiting = !!(need || (kinds && kinds.length));
    if (waiting) {
      return baseTask(
        'waiting_approval',
        (need && need.title) || 'Agent 在等你确认',
        (need && need.detail) || '需要你在 Soft Pad 里看一眼再继续。',
        [
          {
            id: 'live1',
            type: 'waiting_approval',
            time: '',
            summary: '等待你的确认',
            detail: '',
            tier: 'provider'
          }
        ]
      );
    }

    var hasWorking =
      !!progressNeed ||
      rows.some(function (row) {
        return rowState(row) === 'working';
      });
    if (hasWorking) {
      return baseTask(
        'running',
        (progressNeed && progressNeed.title) || displayName + ' 正在处理',
        '',
        [
          {
            id: 'live1',
            type: 'tool_called',
            time: '',
            summary: '正在工作',
            detail: '',
            tier: 'provider'
          }
        ]
      );
    }

    var hasError = rows.some(function (row) {
      return rowState(row) === 'error';
    });
    if (hasError) {
      return baseTask('failed', displayName + ' 遇到问题', '处理时出错了，可在 Soft Pad 查看详情。', [
        {
          id: 'live1',
          type: 'task_failed',
          time: '',
          summary: '碰到问题，先停一下',
          detail: '',
          tier: 'provider'
        }
      ]);
    }

    return baseTask('idle', '', '', []);
  }

  /**
   * Full Soft Pad attention → desk rows (N agents). Keep taskFromAttention for primary CTA pick.
   */
  function rowsFromAttention(attn) {
    attn = attn || {};
    var rows = Array.isArray(attn.rows) ? attn.rows : [];
    function st(r) {
      var s = r && (r.state || r.State);
      if (!s) return '';
      if (typeof s === 'string') return s;
      if (s.needsInput) return 'needsInput';
      if (s.working) return 'working';
      if (s.error) return 'error';
      return String(s);
    }
    function eligible(r) {
      if (r.waitingEligible === false || r.waiting_eligible === false) return false;
      if (r.waitingEligible === true || r.waiting_eligible === true) return true;
      var src = String((r.source && (r.source.inferred ? 'inferred' : r.source)) || '');
      if (/inferred/i.test(src)) return false;
      return st(r) === 'needsInput';
    }
    function agentOf(r) {
      var a = String((r && r.agent) || '').toLowerCase();
      if (a.indexOf('claude') >= 0) return 'Claude';
      if (a.indexOf('codex') >= 0) return 'Codex';
      if (a.indexOf('workbuddy') >= 0) return 'WorkBuddy';
      if (a.indexOf('cursor') >= 0) return 'Cursor';
      return String((r && r.agent) || 'Agent');
    }
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var rs = st(r);
      var prov = agentOf(r);
      var title = String(r.title || r.cause || r.summary || '').trim();
      var when = '';
      var ts = Number(r.updatedAt || r.updated_at || r.lastSeenAt || r.last_seen_at || 0);
      if (ts) {
        var age = Math.max(0, Date.now() - ts);
        if (age < 60_000) when = '刚刚';
        else if (age < 3600_000) when = Math.floor(age / 60_000) + ' 分钟前';
        else if (age < 86400_000) when = Math.floor(age / 3600_000) + ' 小时前';
        else when = Math.floor(age / 86400_000) + ' 天前';
      }
      var base = {
        provider: prov,
        title: title || prov,
        cause: String(r.cause || ''),
        when: when,
        confidence: String(r.confidence || 'authoritative'),
        evidenceTier: String(r.evidenceTier || r.evidence_tier || r.confidence || ''),
        probeStatus: String(r.probeStatus || r.probe_status || ''),
        sessionId: String(r.sessionId || r.session_id || ''),
        row: r
      };
      if (rs === 'needsInput' && eligible(r)) {
        out.push(Object.assign({ kind: 'needsYou', waitingEligible: true }, base));
      } else if (rs === 'working') {
        out.push(Object.assign({ kind: 'living', waitingEligible: false }, base));
      } else if (rs === 'error') {
        out.push(Object.assign({ kind: 'error', waitingEligible: false }, base));
      }
    }
    return out;
  }

  /**
   * Plan C: map cmd_agent_home_snapshot → task.
   * Lifecycle status only when session.status is a real lifecycle state.
   * Observed-only stays idle. Checkpoint/memory/context project into UI.
   */
  function taskFromHomeSnapshot(dto, opts) {
    opts = opts || {};
    dto = dto || {};
    var profile = PROFILES.cursor;
    var active = dto.activeSession || null;
    var recent = Array.isArray(dto.recentSessions) ? dto.recentSessions : [];
    var pick = active || recent[0] || null;
    var ckpt = dto.checkpoint || null;
    var rawEvents = Array.isArray(dto.recentEvents) ? dto.recentEvents : [];
    var Pulse = global.OneToneAgentHomePulse;
    var projected = Pulse
      ? Pulse.projectHelpedYou(rawEvents, { foldWeak: true, limit: 12 })
      : rawEvents;
    var events = projected.map(function (e, i) {
      if (Pulse && e.category) {
        return {
          id: e.id || 'he' + i,
          type: e.eventType || 'tool_called',
          time: e.at || '',
          summary: e.summary || '',
          detail: e.eventClass || 'projected',
          tier: e.eventClass === 'onetone_lifecycle' ? 'runner' : 'provider',
          category: e.category
        };
      }
      var mapped =
        e.eventType === 'session_discovered'
          ? 'task_started'
          : e.eventType === 'session_updated'
            ? 'session_updated'
            : e.eventType === 'user_turn_observed'
              ? 'user_turn_observed'
              : e.eventType || 'tool_called';
      var human =
        mapped === 'task_started'
          ? '发现了新的对话'
          : mapped === 'session_updated'
            ? '对话有了新进展'
            : mapped === 'user_turn_observed'
              ? '你刚发了一条消息'
              : e.summary || e.eventType || '';
      return {
        id: e.eventId || 'he' + i,
        type: mapped,
        time: '',
        summary: human,
        detail: e.eventClass || 'provider_observed',
        tier: e.eventClass === 'onetone_lifecycle' ? 'runner' : 'provider'
      };
    });
    var pulse = Pulse
      ? Pulse.projectPulse(dto)
      : null;
    var contextDetail = [];
    if (dto.project && dto.project.displayName) {
      contextDetail.push({ label: '当前项目：' + dto.project.displayName });
    }
    if (ckpt && ckpt.nextAction) {
      contextDetail.push({ label: '下一步：' + String(ckpt.nextAction) });
    } else if (ckpt && ckpt.currentTask) {
      contextDetail.push({ label: '做到这里：' + String(ckpt.currentTask) });
    } else {
      contextDetail.push({ label: '没有可继续的任务' });
    }
    if (ckpt && Array.isArray(ckpt.changedFiles) && ckpt.changedFiles.length) {
      contextDetail.push({
        label: '相关文件：' + ckpt.changedFiles.slice(0, 3).join(', ')
      });
    }
    if (pick && pick.projectMatch === 'probable') {
      contextDetail.push({ label: '可能属于当前项目，点击确认' });
    } else if (pick && pick.projectMatch === 'unknown') {
      contextDetail.push({ label: '还不能确定属于哪个项目' });
    } else if (pick && pick.projectMatch && pick.projectMatch !== 'exact') {
      contextDetail.push({ label: '项目归属还不明确' });
    }
    if (dto.syncStatus === 'stale' || dto.probeStatus === 'read_locked') {
      contextDetail.push({ label: '正在使用缓存数据，稍后会自动更新' });
    } else if (dto.syncStatus === 'consent_off' || dto.probeStatus === 'consent_off') {
      contextDetail.push({ label: '未开启本地活动统计，只显示已缓存内容' });
    } else if (dto.syncStatus && dto.syncStatus !== 'ready' && dto.syncStatus !== 'fresh') {
      contextDetail.push({ label: '状态稍候会自动刷新' });
    }
    if (dto.staleAgeMs != null && dto.staleAgeMs > 60000) {
      var mins = Math.max(1, Math.round(Number(dto.staleAgeMs) / 60000));
      contextDetail.push({ label: mins + ' 分钟前更新' });
    }
    recent.slice(0, 3).forEach(function (s) {
      if (s && s.title) contextDetail.push({ label: '最近处理过：' + s.title });
    });
    if (!events.length && pick) {
      contextDetail.push({ label: '还没有可显示的活动' });
    } else if (events.length) {
      contextDetail.push({
        label: '最近发生：' + String(events[0].summary || '有一点新动静')
      });
    }

    var memories = (Array.isArray(dto.memories) ? dto.memories : []).map(function (m, i) {
      var body = m.content || m.body || '';
      var title = body;
      if (title.length > 48) title = title.slice(0, 48) + '…';
      return {
        id: m.memoryId || m.id || 'mem' + i,
        kind: m.memoryType || m.kind || 'observation',
        title: title,
        body: ''
      };
    });
    if (memories.length) {
      contextDetail.push({ label: '记住了 ' + memories.length + ' 条项目相关信息' });
    } else {
      contextDetail.push({ label: '还没有项目相关记忆' });
    }

    var title = pick ? pick.title || '当前对话' : '';
    if (!title && ckpt && ckpt.currentTask) title = String(ckpt.currentTask);
    var waitReason = '';
    if (dto.probeStatus === 'consent_off') {
      waitReason =
        'Cursor 本地活动统计未启用。仍可显示已缓存的对话，不会读取对话内容。';
    } else if (dto.probeStatus === 'read_locked' || dto.syncStatus === 'stale') {
      waitReason = '正在使用缓存数据，稍后会自动更新。';
    }

    // Lifecycle-written statuses only (observed never sets these).
    var status = 'idle';
    var st = pick && pick.status ? String(pick.status) : '';
    if (
      st === 'running' ||
      st === 'waiting_approval' ||
      st === 'paused' ||
      st === 'completed' ||
      st === 'failed' ||
      st === 'cancelled'
    ) {
      status = st;
    }
    if (status === 'waiting_approval' && !waitReason) {
      waitReason =
        ckpt && Array.isArray(ckpt.pendingQuestions) && ckpt.pendingQuestions.length
          ? String(ckpt.pendingQuestions[0])
          : 'Agent 在等你确认。';
    } else if (status === 'paused' && !waitReason) {
      waitReason =
        (ckpt && ckpt.nextAction) || '状态更新已暂停。随时可以继续。';
    }

    var latest =
      (dto.latestEvent && {
        type:
          dto.latestEvent.eventType === 'session_discovered'
            ? 'task_started'
            : dto.latestEvent.eventType === 'session_updated'
              ? 'session_updated'
              : dto.latestEvent.eventType === 'user_turn_observed'
                ? 'user_turn_observed'
                : dto.latestEvent.eventType,
        summary:
          dto.latestEvent.eventType === 'session_discovered'
            ? '发现了新的对话'
            : dto.latestEvent.eventType === 'session_updated'
              ? '对话有了新进展'
              : dto.latestEvent.eventType === 'user_turn_observed'
                ? '你刚发了一条消息'
                : dto.latestEvent.summary || '',
        eventClass: dto.latestEvent.eventClass || ''
      }) ||
      (events[0]
        ? { type: events[0].type, summary: events[0].summary, eventClass: events[0].detail }
        : null);

    var checkpointId = ckpt && ckpt.checkpointId ? String(ckpt.checkpointId) : '';

    return {
      profileId: 'cursor',
      profile: profile,
      demo: !!opts.demo,
      homeSnapshot: dto,
      snapshot: {
        runId: pick ? pick.sessionId : ckpt ? ckpt.sessionId : 'home_idle',
        taskId: pick ? pick.externalSessionId : 'home_idle',
        status: status,
        title: title,
        currentStep: pick
          ? {
              id: 's0',
              title:
                status === 'running'
                  ? '正在工作'
                  : status === 'waiting_approval'
                    ? '等你确认'
                    : status === 'paused'
                      ? '已暂停'
                      : active
                        ? '当前对话'
                        : '最近对话',
              index: 0
            }
          : null,
        progress: { completed: 0, total: 0 },
        activeAgent: { id: 'cursor', name: 'Cursor', short: 'CR' },
        latestEvent: latest,
        resumable:
          !!checkpointId ||
          status === 'waiting_approval' ||
          status === 'failed' ||
          status === 'paused' ||
          status === 'completed',
        checkpointId: checkpointId
      },
      waitReason: waitReason,
      pulse: pulse,
      steps: [],
      events: events,
      memories: memories,
      context: [],
      contextDetail: contextDetail,
      emptyHistory: !events.length
    };
  }

  function applyLocalStatus(task, next) {
    if (!task || !task.snapshot) return task;
    var prev = task.snapshot.status;
    task.snapshot.status = next;
    var time = '';
    try {
      var d = new Date();
      time =
        String(d.getHours()).padStart(2, '0') +
        ':' +
        String(d.getMinutes()).padStart(2, '0');
    } catch (_) {}
    function push(type, summary) {
      task.events = task.events || [];
      task.events.push({
        id: 'loc_' + Date.now().toString(36),
        type: type,
        time: time,
        summary: summary,
        detail: 'prev=' + prev,
        tier: 'runner'
      });
      task.snapshot.latestEvent = { type: type, summary: summary };
    }
    if (next === 'paused') {
      task.waitReason = '状态更新已暂停。外部 Agent 未必停住；点「继续处理」再追新进展。';
      push('task_paused', '已暂停状态更新');
    } else if (next === 'cancelled') {
      task.waitReason = '';
      push('session_aborted', '已停止这次处理');
    } else if (next === 'running') {
      task.waitReason = '';
      push(
        'task_resumed',
        prev === 'waiting_approval' ? '确认并继续' : prev === 'paused' ? '继续处理' : '任务已恢复'
      );
    }
    return task;
  }

  function fixtureLabels() {
    return FIXTURES.map(function (f, i) {
      var st = f.snapshot.status;
      var who = (PROFILES[f.profileId] && PROFILES[f.profileId].provider) || f.profileId;
      var label =
        st === 'running' || st === 'planning'
          ? '正在工作'
          : st === 'waiting_approval'
            ? '等你确认'
            : st === 'completed'
              ? '做完了'
              : st === 'idle'
                ? '待命'
                : st;
      var title = f.snapshot.title || '空闲';
      if (title.length > 10) title = title.slice(0, 10) + '…';
      return { index: i, label: who + ' · ' + title + ' · ' + label };
    });
  }

  global.OneToneNowAgentHome = {
    PROFILES: PROFILES,
    EVENT_VISIBILITY: EVENT_VISIBILITY,
    STATUS_UI: STATUS_UI,
    FIXTURE_COUNT: FIXTURES.length,
    canShowEvent: canShowEvent,
    profileOf: profileOf,
    cloneFixture: cloneFixture,
    fixtureLabels: fixtureLabels,
    buildHomeView: buildHomeView,
    taskFromAttention: taskFromAttention,
    rowsFromAttention: rowsFromAttention,
    taskFromHomeSnapshot: taskFromHomeSnapshot,
    applyLocalStatus: applyLocalStatus,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
