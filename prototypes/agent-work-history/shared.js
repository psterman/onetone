/**
 * Agent work-history prototypes — nested inside existing Agent page chrome.
 * Outer: OneTone settings shell (Agent selected).
 * Inner: Agent head + today snap + surface tabs (工作记录 | 三叶配置).
 * Variants only change work-history visual priority.
 */
(function (global) {
  'use strict';

  var R = (global.OneToneAgentWorkHistory = global.OneToneAgentWorkHistory || {});

  var VARIANTS = ['timeline', 'session', 'resume', 'attention'];
  var MODES = ['quiet', 'attention', 'return', 'degraded'];
  /** Four peer tabs: work history + original trifolium leaves (flat, one mental model). */
  var SURFACES = ['work', 'float', 'mini', 'softPad'];
  var SURFACE_META = {
    work: {
      t: '工作记录',
      s: '你现在可以 · 最近帮过',
      hint: '它在忙吗 · 要你点吗 · 最近帮过啥'
    },
    float: { t: '浮窗', s: '何时、皮肤', hint: '浮窗 · Soft Pad 完整窗口何时出现' },
    mini: { t: '迷你栏', s: '身上留什么', hint: '迷你栏 · 收成细条时留什么' },
    softPad: { t: 'Soft Pad', s: '顶栏·灯·接入', hint: 'Soft Pad · 顶栏 · 灯效 · 接入' }
  };

  var SIDEBAR = [
    { g: '主功能', items: [
      { id: 'home', label: '首页' },
      { id: 'habits', label: '我的习惯' },
      { id: 'keys', label: '按键设置' },
      { id: 'vkb', label: '虚拟键盘' },
      { id: 'agent', label: 'Agent', on: true },
      { id: 'data', label: '数据' },
      { id: 'voice', label: '语音设置' },
      { id: 'cam', label: '摄像头' },
      { id: 'camt', label: '摄像头-目标' },
      { id: 'tray', label: '托盘菜单' }
    ]},
    { g: '系统', items: [
      { id: 'general', label: '通用设置' },
      { id: 'sound', label: '声音与反馈' },
      { id: 'status', label: '状态与维护' }
    ]}
  ];

  /** Raw HomeEventDto fixtures — summaries are store templates; UI must project. */
  function baseRawEvents() {
    var day = Date.UTC(2026, 9, 3, 6, 32, 0); // 2026-10-03 fixed for stable tests
    return [
      {
        eventId: 'e1',
        eventType: 'task_paused',
        eventClass: 'onetone_lifecycle',
        summary: 'Agent 工作已暂停',
        timestamp: day,
        sessionId: 's-quiet'
      },
      {
        eventId: 'e2',
        eventType: 'waiting_approval',
        eventClass: 'onetone_lifecycle',
        summary: 'Agent 在等你确认',
        timestamp: day - 3600 * 1000,
        sessionId: 's-quiet'
      },
      {
        eventId: 'e4a',
        eventType: 'user_turn_observed',
        eventClass: 'provider_observed',
        summary: 'User turn observed',
        timestamp: day - 7200 * 1000,
        sessionId: 's-quiet'
      },
      {
        eventId: 'e4b',
        eventType: 'session_updated',
        eventClass: 'provider_observed',
        summary: 'Cursor session updated',
        timestamp: day - 7200 * 1000 - 1000,
        sessionId: 's-quiet'
      },
      {
        eventId: 'e3',
        eventType: 'task_completed',
        eventClass: 'onetone_lifecycle',
        summary: 'Agent 已完成',
        timestamp: day - 86400 * 1000,
        sessionId: 's-old'
      }
    ];
  }

  function enrichSnapshot(snap) {
    var Pulse = global.OneToneAgentHomePulse;
    if (!snap) return snap;
    if (!Pulse) {
      snap.recentEvents = snap.recentEvents || [];
      snap.pulse = snap.pulse || {
        dynamic: '待命',
        help: '开口就能开始帮',
        health: '正常',
        quota: null,
        progress: null
      };
      return snap;
    }
    var raw = snap.recentEvents || [];
    snap.recentEvents = Pulse.projectHelpedYou(raw, { foldWeak: true, limit: 12 });
    var pick = snap.agentPick || 'Cursor';
    snap.recentEvents.forEach(function (e) {
      if (!e.agent) e.agent = pick;
    });
    snap.pulse = Pulse.projectPulse({
      activeSession: snap.activeSession,
      syncStatus: snap.syncStatus,
      probeStatus: snap.probeStatus,
      currentProject: snap.currentProject,
      project: snap.project,
      checkpoint: snap.checkpoint || snap.resumeCheckpoint,
      workStatus: snap.workStatus
    });
    return snap;
  }

  function pulseFor(snap) {
    if (snap && snap.pulse) return snap.pulse;
    var Pulse = global.OneToneAgentHomePulse;
    if (Pulse) return Pulse.projectPulse(snap || {});
    return {
      dynamic: '待命',
      help: '开口就能开始帮',
      health: '正常',
      quota: null,
      progress: null
    };
  }

  function baseEvidence(statusMap) {
    statusMap = statusMap || {};
    return [
      { label: '前台应用', value: 'Cursor', status: statusMap.app || 'confirmed', updatedAt: '刚刚' },
      { label: '工作区', value: 'voice-pilot', status: statusMap.project || 'confirmed', updatedAt: '刚刚' },
      { label: '当前 Agent', value: 'Cursor', status: statusMap.agent || 'confirmed', updatedAt: '1 分钟前' },
      { label: '输入去向', value: '优先发送到 Cursor', status: statusMap.input || 'confirmed', updatedAt: '刚刚' }
    ];
  }

  var snapshots = {
    quiet: {
      mode: 'quiet',
      agentPick: 'Cursor',
      today: { efficiency: '58.6', active: '1h42', rounds: '86', cost: '—' },
      syncStatus: 'ready',
      probeStatus: 'ready',
      currentProject: { name: 'voice-pilot', confirmed: true },
      project: { displayName: 'voice-pilot', matchKind: 'exact' },
      activeSession: {
        agent: 'Cursor',
        app: 'Cursor',
        startedAt: '今天 14:32',
        status: 'running',
        statusLabel: '正在帮你'
      },
      attention: null,
      recentEvents: baseRawEvents(),
      resumeCheckpoint: {
        project: 'voice-pilot',
        sessionLabel: '今天 14:32',
        done: '首页该先看什么已对齐',
        next: '接着排工作记录怎么呈现',
        currentTask: '首页该先看什么已对齐',
        nextAction: '接着排工作记录怎么呈现'
      },
      checkpoint: {
        currentTask: '首页该先看什么已对齐',
        nextAction: '接着排工作记录怎么呈现'
      },
      contextEvidence: baseEvidence(),
      evidenceEffect: '决定本次输入发送到 Cursor',
      inputState: { listening: false, transcript: '', target: 'Cursor', hotkey: 'Ctrl+Shift+D' },
      freshness: 'live'
    },
    attention: {
      mode: 'attention',
      agentPick: 'Claude',
      today: { efficiency: '58.6', active: '1h42', rounds: '86', cost: '—' },
      syncStatus: 'ready',
      probeStatus: 'ready',
      workStatus: 'waiting',
      currentProject: { name: 'voice-pilot', confirmed: true },
      project: { displayName: 'voice-pilot', matchKind: 'exact' },
      activeSession: {
        agent: 'Claude',
        app: 'Cursor',
        startedAt: '今天 13:10',
        status: 'waiting_approval',
        statusLabel: '在等你拍板'
      },
      attention: {
        title: 'Claude 等你拍板：要不要写入',
        detail: '改好一版首页文案，不会自己落盘。',
        primaryLabel: '去拍板'
      },
      recentEvents: baseRawEvents(),
      resumeCheckpoint: null,
      checkpoint: {
        pendingQuestions: ['要不要写入这版文案？'],
        nextAction: null,
        currentTask: '文案改动'
      },
      contextEvidence: baseEvidence({ agent: 'confirmed' }),
      evidenceEffect: '决定把批准请求留给你，而不是自动写入',
      inputState: { listening: false, transcript: '', target: 'Claude', hotkey: 'Ctrl+Shift+D' },
      freshness: 'live'
    },
    return: {
      mode: 'return',
      agentPick: 'Cursor',
      today: { efficiency: '58.6', active: '1h42', rounds: '86', cost: '—' },
      syncStatus: 'ready',
      probeStatus: 'ready',
      workStatus: 'resumable',
      currentProject: { name: 'voice-pilot', confirmed: true },
      project: { displayName: 'voice-pilot', matchKind: 'exact' },
      activeSession: {
        agent: 'Cursor',
        app: 'Cursor',
        startedAt: '今天 14:32',
        status: 'paused',
        statusLabel: '先停住了'
      },
      attention: null,
      recentEvents: baseRawEvents(),
      resumeCheckpoint: {
        project: 'voice-pilot',
        sessionLabel: '今天 14:32',
        done: '首页该先看什么已对齐',
        next: '接着排工作记录怎么呈现',
        currentTask: '首页该先看什么已对齐',
        nextAction: '接着排工作记录怎么呈现'
      },
      checkpoint: {
        currentTask: '首页该先看什么已对齐',
        nextAction: '接着排工作记录怎么呈现'
      },
      contextEvidence: baseEvidence(),
      evidenceEffect: '决定可以从 checkpoint 继续上次会话',
      inputState: { listening: false, transcript: '', target: 'Cursor', hotkey: 'Ctrl+Shift+D' },
      freshness: 'cached'
    },
    degraded: {
      mode: 'degraded',
      agentPick: 'Cursor',
      today: { efficiency: '—', active: '—', rounds: '—', cost: '—' },
      syncStatus: 'stale',
      probeStatus: 'read_error',
      workStatus: 'error',
      currentProject: { name: null, confirmed: false },
      project: { displayName: null, matchKind: 'unknown' },
      activeSession: {
        agent: 'Cursor',
        app: 'Cursor',
        startedAt: null,
        status: 'unknown',
        statusLabel: '还没认准'
      },
      attention: {
        title: '还没认准你在做哪个项目',
        detail: '看到 Cursor 了，认一下项目后帮手才能接着帮你。',
        primaryLabel: '认一下项目'
      },
      recentEvents: [
        {
          eventId: 'e3',
          eventType: 'task_completed',
          eventClass: 'onetone_lifecycle',
          summary: 'Agent 已完成',
          timestamp: Date.UTC(2026, 9, 2, 10, 4, 0),
          sessionId: 's-old'
        }
      ],
      resumeCheckpoint: null,
      checkpoint: null,
      contextEvidence: baseEvidence({ project: 'unavailable', input: 'inferred' }),
      evidenceEffect: '当前不能把输入可靠路由到已确认项目',
      inputState: { listening: false, transcript: '', target: '未确认', hotkey: null },
      freshness: 'stale'
    },
    empty: {
      mode: 'quiet',
      agentPick: 'Cursor',
      today: { efficiency: '—', active: '—', rounds: '0', cost: '—' },
      syncStatus: 'ready',
      probeStatus: 'ready',
      workStatus: 'idle',
      currentProject: { name: null, confirmed: false },
      project: { displayName: null, matchKind: 'unknown' },
      activeSession: {
        agent: null,
        app: 'Cursor',
        startedAt: null,
        status: 'idle',
        statusLabel: '闲着待命'
      },
      attention: null,
      recentEvents: [],
      resumeCheckpoint: null,
      checkpoint: null,
      contextEvidence: baseEvidence({
        project: 'unavailable',
        agent: 'unavailable',
        input: 'inferred'
      }),
      evidenceEffect: '尚无可靠会话，输入暂留在前台应用',
      inputState: { listening: false, transcript: '', target: 'Cursor', hotkey: 'Ctrl+Shift+D' },
      freshness: 'live'
    }
  };

  R.variants = VARIANTS;
  R.modes = MODES;
  R.surfaces = SURFACES;

  R.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  R.snapshotFor = function (mode) {
    var key = MODES.indexOf(mode) >= 0 ? mode : 'quiet';
    return enrichSnapshot(JSON.parse(JSON.stringify(snapshots[key])));
  };

  R.emptySnapshot = function () {
    return enrichSnapshot(JSON.parse(JSON.stringify(snapshots.empty)));
  };

  function statusLabel(status) {
    if (status === 'confirmed') return '已确认';
    if (status === 'inferred') return '推断';
    if (status === 'unavailable') return '不可用';
    return status || '未知';
  }

  function sidebarHtml() {
    var esc = R.esc;
    return (
      '<aside class="ot-sidebar" aria-label="全局导航">' +
      '<div class="ot-brand"><span class="ot-mark" aria-hidden="true">◌</span> 一声 OneTone</div>' +
      SIDEBAR.map(function (group) {
        return (
          '<p class="ot-nav-g">' +
          esc(group.g) +
          '</p>' +
          group.items
            .map(function (item) {
              return (
                '<button type="button" class="ot-nav-i' +
                (item.on ? ' is-on' : '') +
                '" data-ot-nav="' +
                esc(item.id) +
                '"' +
                (item.on ? ' aria-current="page"' : '') +
                ' disabled title="原型：沿用现有全局导航">' +
                esc(item.label) +
                '</button>'
              );
            })
            .join('')
        );
      }).join('') +
      '</aside>'
    );
  }

  function agentHeadHtml(snap, surface) {
    var esc = R.esc;
    var pick = snap.agentPick || 'Cursor';
    var apps = ['Cursor', 'Claude', 'Codex'];
    var picks = apps
      .map(function (a) {
        return (
          '<button type="button" class="app-pick' +
          (a === pick ? ' is-on' : '') +
          '" data-act="pick-agent" data-app="' +
          esc(a) +
          '">' +
          esc(a) +
          '</button>'
        );
      })
      .join('');
    var sess = snap.activeSession || {};
    var project = snap.currentProject || {};
    var proj =
      project.confirmed && project.name ? project.name : '未确认';
    // Work tab: identity only — no prose pile.
    if (surface === 'work') {
      return (
        '<div class="agent-head agent-head--compact">' +
        '<div><h2>Agent</h2>' +
        '<p class="agent-sub"><strong>' +
        esc(pick) +
        '</strong> · ' +
        esc(proj) +
        ' · ' +
        esc(sess.statusLabel || '未确认') +
        '</p></div>' +
        '<div class="agent-picks">' +
        picks +
        '</div></div>'
      );
    }
    return (
      '<div class="agent-head">' +
      '<div>' +
      '<h2>Agent</h2>' +
      '<p class="agent-sub">当前 · <strong>' +
      esc(pick) +
      '</strong> · 项目 ' +
      esc(proj) +
      ' · 会话 ' +
      esc(sess.statusLabel || '未确认') +
      (sess.startedAt ? ' · ' + esc(sess.startedAt) + ' 开始' : '') +
      '</p>' +
      '<div class="agent-picks"><span class="faint">试切：</span>' +
      picks +
      '</div></div></div>'
    );
  }

  function snapHtml(snap, surface) {
    var esc = R.esc;
    var app = snap.agentPick || 'Cursor';
    // Work tab: five user signals — not efficiency/rounds chrome.
    if (surface === 'work') {
      var p = pulseFor(snap);
      var healthWarn = p.health !== '顺利';
      var pulseBits =
        '<span class="pulse"><i>它现在</i><em>' +
        esc(p.dynamic) +
        '</em></span>' +
        '<span class="pulse"><i>要你吗</i><em>' +
        esc(p.help) +
        '</em></span>' +
        '<span class="pulse' +
        (healthWarn ? ' warn' : '') +
        '"><i>顺不顺</i><em>' +
        esc(p.health) +
        '</em></span>';
      if (p.quota != null) {
        pulseBits +=
          '<span class="pulse"><i>用量</i><em>' + esc(p.quota) + '</em></span>';
      }
      if (p.progress != null) {
        pulseBits +=
          '<span class="pulse"><i>做到哪</i><em>' + esc(p.progress) + '</em></span>';
      }
      return (
        '<div class="app-snap app-snap--pulse" aria-label="帮手状态一览">' +
        '<button type="button" class="snap-body" data-act="view-data">' +
        '<span class="who">今天 · <b>' +
        esc(app) +
        '</b></span>' +
        '<span class="pulse-row">' +
        pulseBits +
        '</span></button>' +
        '<button type="button" class="go" data-act="view-data">详细用量 →</button></div>'
      );
    }
    var t = snap.today || {};
    function met(label, val, miss) {
      return (
        '<span class="met' +
        (miss ? ' miss' : '') +
        '">' +
        esc(label) +
        ' <em>' +
        esc(val == null || val === '' ? '—' : val) +
        '</em></span>'
      );
    }
    var missCost = !t.cost || t.cost === '—';
    return (
      '<div class="app-snap" aria-label="当前应用今日摘要">' +
      '<button type="button" class="snap-body" data-act="view-data">' +
      '<span class="who">今日 · <b>' +
      esc(app) +
      '</b></span>' +
      '<span class="mets">' +
      met('效率', t.efficiency, t.efficiency === '—') +
      met('活跃', t.active, t.active === '—') +
      met('回合', t.rounds, t.rounds === '—') +
      met('费用', t.cost, missCost) +
      '</span></button>' +
      '<button type="button" class="go" data-act="view-data">查看数据 →</button></div>'
    );
  }

  function surfaceTabsHtml(surface) {
    return (
      '<div class="surface-tabs surface-tabs--4" role="tablist" aria-label="Agent 四个标签页">' +
      SURFACES.map(function (id) {
        var meta = SURFACE_META[id];
        var on = id === surface;
        return (
          '<button type="button" role="tab" class="surface-tab' +
          (on ? ' is-on' : '') +
          '" data-surface="' +
          R.esc(id) +
          '" aria-selected="' +
          (on ? 'true' : 'false') +
          '"><span class="t">' +
          R.esc(meta.t) +
          '</span><span class="s">' +
          R.esc(meta.s) +
          '</span></button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function attentionHtml(snap, variant) {
    var esc = R.esc;
    if (!snap.attention) return '';
    // Chip on the left already states the need — right only keeps one CTA.
    return (
      '<section class="awh-attention awh-attention--cta" data-block="attention" data-priority="' +
      (variant === 'attention' ? 'primary' : 'normal') +
      '">' +
      '<button type="button" class="awh-cta" data-act="attention-primary">' +
      esc(snap.attention.primaryLabel) +
      '</button></section>'
    );
  }

  function timelineHtml(snap, variant, selectedId) {
    var esc = R.esc;
    var events = snap.recentEvents || [];
    var priority = variant === 'timeline' ? 'primary' : 'normal';
    selectedId = selectedId || (events[0] && events[0].id) || '';
    if (!events.length) {
      return (
        '<section class="awh-timeline" data-block="timeline" data-priority="' +
        priority +
        '">' +
        '<div class="awh-section-head"><h3>最近帮过</h3>' +
        '<button type="button" class="awh-text-link" data-act="view-all">全部</button></div>' +
        '<div class="awh-empty"><p>还没有帮过你的记录。</p>' +
        '<button type="button" class="awh-cta" data-act="start-work">开口叫它开始</button></div></section>'
      );
    }
    var rows = events
      .map(function (ev) {
        var on = ev.id === selectedId;
        var acts = (ev.actions || [])
          .map(function (a) {
            return (
              '<button type="button" class="awh-row-act" data-act="' +
              esc(a.id) +
              '">' +
              esc(a.label) +
              '</button>'
            );
          })
          .join('');
        return (
          '<article class="awh-event' +
          (on ? ' is-selected' : '') +
          '" data-event-id="' +
          esc(ev.id) +
          '" data-act="select-event" tabindex="0" role="button" aria-pressed="' +
          (on ? 'true' : 'false') +
          '">' +
          '<div class="awh-event-rail" aria-hidden="true"><i></i></div>' +
          '<div class="awh-event-body">' +
          '<div class="awh-event-meta"><time>' +
          esc(ev.at) +
          '</time><span class="awh-result awh-result--' +
          esc(ev.result) +
          '">' +
          esc(ev.resultLabel) +
          '</span></div>' +
          '<p class="awh-event-summary">' +
          esc(ev.summary) +
          '</p>' +
          '<div class="awh-event-foot"><span class="awh-event-src">' +
          esc(ev.agent || ev.app) +
          ' · ' +
          esc(ev.resultLabel) +
          '</span><div class="awh-event-acts">' +
          acts +
          '</div></div></div></article>'
        );
      })
      .join('');
    return (
      '<section class="awh-timeline" data-block="timeline" data-priority="' +
      priority +
      '">' +
      '<div class="awh-section-head"><h3>最近帮过</h3>' +
      '<span class="awh-muted-hint">点一条看看当时</span></div>' +
      '<div class="awh-timeline-list">' +
      rows +
      '</div></section>'
    );
  }

  function resumeHtml(snap, variant) {
    var esc = R.esc;
    var cp = snap.resumeCheckpoint;
    if (!cp) return '';
    var priority =
      variant === 'resume' || snap.mode === 'return' ? 'primary' : 'normal';
    return (
      '<section class="awh-resume" data-block="resume" data-priority="' +
      priority +
      '">' +
      '<p class="awh-kicker">上次停在</p>' +
      '<h3>' +
      esc(cp.project) +
      ' · ' +
      esc(cp.sessionLabel) +
      '</h3>' +
      '<p>已完成：' +
      esc(cp.done) +
      '</p>' +
      '<p>待继续：' +
      esc(cp.next) +
      '</p>' +
      '<button type="button" class="awh-cta" data-act="resume-work">接着帮我</button></section>'
    );
  }

  function evidenceHtml(snap) {
    var esc = R.esc;
    var nodes = (snap.contextEvidence || [])
      .map(function (node, i) {
        var arrow =
          i < (snap.contextEvidence || []).length - 1
            ? '<div class="awh-chain-arrow" aria-hidden="true">↓</div>'
            : '';
        return (
          '<div class="awh-chain-node"><div class="awh-chain-main"><b>' +
          esc(node.label) +
          '</b><span>' +
          esc(node.value) +
          '</span></div><div class="awh-chain-meta"><span class="awh-tag awh-tag--' +
          esc(node.status) +
          '">' +
          esc(statusLabel(node.status)) +
          '</span><time>' +
          esc(node.updatedAt || '') +
          '</time></div></div>' +
          arrow
        );
      })
      .join('');
    return (
      '<details class="awh-evidence" data-block="evidence">' +
      '<summary>查看判断依据</summary>' +
      '<div class="awh-chain">' +
      nodes +
      '<p class="awh-effect">这条依据影响了什么：' +
      esc(snap.evidenceEffect || '') +
      '</p></div></details>'
    );
  }

  function sessionStripHtml(snap, variant) {
    var esc = R.esc;
    var sess = snap.activeSession || {};
    var project = snap.currentProject || {};
    var proj = project.confirmed && project.name ? project.name : '未确认';
    var priority = variant === 'session' ? 'primary' : 'normal';
    return (
      '<section class="awh-session-strip" data-block="header" data-priority="' +
      priority +
      '">' +
      '<p class="awh-kicker">当前工作</p>' +
      '<h3 class="awh-identity">' +
      esc(sess.app || '未确认') +
      ' · ' +
      esc(proj) +
      '</h3>' +
      '<p class="awh-session">当前会话：' +
      esc(sess.startedAt || '未确认') +
      ' 开始 · ' +
      esc(sess.statusLabel || '未确认') +
      ' · Agent ' +
      esc(sess.agent || '未确认') +
      '</p></section>'
    );
  }

  function listenHtml(snap, listening) {
    var esc = R.esc;
    if (!listening) return '';
    var input = snap.inputState || {};
    var hotkey =
      input.hotkey && String(input.hotkey).trim()
        ? '快捷键：' + input.hotkey
        : '快捷键未设置';
    return (
      '<footer class="awh-listen" data-block="listen" role="status">' +
      '<div class="awh-listen-head"><b>正在倾听 · ' +
      esc(input.target || '未确认') +
      '</b><span>' +
      esc(hotkey) +
      '</span></div>' +
      '<p class="awh-transcript">“' +
      esc(input.transcript || '我想把首页的历史记录放到主区域……') +
      '”</p>' +
      '<p class="awh-listen-hint">实时识别中……</p>' +
      '<div class="awh-listen-acts">' +
      '<button type="button" data-act="listen-pause">暂停</button>' +
      '<button type="button" data-act="listen-end">结束并查看</button>' +
      '<button type="button" data-act="listen-cancel">取消</button></div></footer>'
    );
  }

  function orderedBlocks(variant, snap) {
    var hasAttention = !!snap.attention;
    var hasResume = !!snap.resumeCheckpoint;
    if (variant === 'resume' && hasResume) {
      return ['header', 'resume', 'attention', 'timeline', 'evidence'];
    }
    if (variant === 'attention' && hasAttention) {
      return ['header', 'attention', 'timeline', 'resume', 'evidence'];
    }
    if (variant === 'attention' && !hasAttention) {
      return ['header', 'timeline', 'attention', 'resume', 'evidence'];
    }
    return ['header', 'attention', 'timeline', 'resume', 'evidence'];
  }

  /** One next action — the practical center of the work tab. */
  function nextDoHtml(snap) {
    var esc = R.esc;
    var p = pulseFor(snap);
    var need = snap.attention;
    var cp = snap.resumeCheckpoint;
    var tone = 'ok';
    var title = p.dynamic + ' · ' + p.help;
    var detail = p.progress ? '做到这：' + p.progress : '现在不用你点什么';
    var act = 'open-softpad';
    var actLabel = '打开帮手键盘';
    var status = (snap.activeSession && snap.activeSession.status) || p.status || '';
    var healthOk = !p.health || p.health === '顺利';

    if (need) {
      tone = 'warn';
      title = need.title || '要你点一下';
      detail = need.detail || p.help;
      act = 'attention-primary';
      actLabel = need.primaryLabel || '去拍板';
    } else if (
      cp &&
      (snap.mode === 'return' || status === 'paused' || status === 'waiting_approval')
    ) {
      tone = 'go';
      title = '可以接着帮你';
      detail = cp.next || cp.nextAction || p.progress || '从上次停下的地方接着';
      act = 'resume-work';
      actLabel = '接着帮我';
    } else if (!healthOk) {
      tone = 'warn';
      title = p.health;
      detail = p.help;
      act = 'view-data';
      actLabel = '看看怎么回事';
    }

    return (
      '<section class="awh-next awh-next--' +
      tone +
      '" data-block="next">' +
      '<div class="awh-next-copy">' +
      '<p class="awh-next-kicker">你现在可以</p>' +
      '<h3>' +
      esc(title) +
      '</h3>' +
      '<p class="awh-next-detail">' +
      esc(detail) +
      '</p>' +
      '<p class="awh-next-meta">' +
      '<span>顺不顺 · ' +
      esc(p.health) +
      '</span>' +
      (p.progress
        ? '<span>做到哪 · ' + esc(p.progress) + '</span>'
        : '') +
      '<span>用量见「数据」</span></p></div>' +
      '<button type="button" class="awh-next-cta" data-act="' +
      esc(act) +
      '">' +
      esc(actLabel) +
      '</button></section>'
    );
  }

  /** Soft Pad stays available but folded — not a dead half-page. */
  function softPadFoldHtml(snap) {
    var esc = R.esc;
    var p = pulseFor(snap);
    return (
      '<details class="awh-pad-fold" data-softpad-glance>' +
      '<summary>' +
      '<span>帮手键盘</span>' +
      '<span class="sp-status" data-awh-pad-status data-kind="stub">桥</span>' +
      '<span class="awh-pad-fold-beat">' +
      esc(p.dynamic) +
      '</span></summary>' +
      '<div class="soft-pad-preview-host agent-preview-host awh-pad-host" id="awhPadHost" data-preview-label="Soft Pad">' +
      '<div id="awhPadPaint" data-awh-pad-paint data-soft-pad-preview-paint data-waiting="1">' +
      '<div class="agent-preview-empty">展开看键盘实况 · 也可 <code>?livePad=1</code></div></div></div>' +
      '<div class="sp-links sp-links--row">' +
      '<button type="button" class="awh-text-link" data-act="open-softpad">打开帮手键盘</button>' +
      '<button type="button" class="awh-text-link" data-act="view-data">用量明细</button></div></details>'
    );
  }

  function workPracticalHtml(snap, variant, selectedId, listening) {
    var esc = R.esc;
    var timeline = timelineHtml(snap, variant, selectedId);
    var evidence =
      snap.mode === 'degraded' ? evidenceHtml(snap) : '';
    return (
      '<div class="leaf-workspace leaf-workspace--practical" data-surface="work" data-practical="1">' +
      '<div class="leaf-main leaf-main--practical">' +
      '<p class="cap cap--practical">先看你现在可以做什么，再扫最近帮过</p>' +
      nextDoHtml(snap) +
      '<div class="work-panel work-panel--practical" data-variant="' +
      esc(variant) +
      '" data-selected="' +
      esc(selectedId || '') +
      '">' +
      timeline +
      evidence +
      '</div>' +
      softPadFoldHtml(snap) +
      '<p class="awh-proto-flag" title="' +
      (snap.live
        ? '来自 cmd_agent_home_snapshot'
        : '原型 fixture，非生产 IPC') +
      '">' +
      (snap.live ? '实况数据' : '示意数据 · 未接会话库') +
      '</p>' +
      listenHtml(snap, listening) +
      '</div></div>'
    );
  }

  /**
   * Left = live pulse + Soft Pad. Right = what Agent already helped with.
   * Kept for float/mini/softPad; work tab uses workPracticalHtml.
   */
  function workPreviewHtml(snap, selectedId) {
    var esc = R.esc;
    var events = snap.recentEvents || [];
    var selected =
      events.filter(function (e) {
        return e.id === selectedId;
      })[0] ||
      events[0] ||
      null;
    var cp = snap.resumeCheckpoint;
    var need = snap.attention;
    var p = pulseFor(snap);
    return (
      '<aside class="leaf-preview leaf-preview--work" data-preview="work">' +
      '<p class="cap">先看下一件</p>' +
      softPadFoldHtml(snap) +
      (need
        ? '<div class="preview-chip preview-chip--warn" data-act="attention-primary" role="button" tabindex="0">' +
          '<b>要你处理</b><span>' +
          esc(need.primaryLabel) +
          '</span></div>'
        : '') +
      (cp
        ? '<div class="preview-chip preview-chip--go" data-act="resume-work" role="button" tabindex="0">' +
          '<b>可继续帮你</b><span>' +
          esc(cp.next) +
          '</span></div>'
        : '') +
      '<p class="awh-proto-flag">' +
      (snap.live ? '实况' : '示意') +
      '</p></aside>'
    );
  }

  function workPanelHtml(snap, variant, selectedId) {
    var parts = {
      attention: attentionHtml(snap, variant),
      timeline: timelineHtml(snap, variant, selectedId),
      resume: '',
      evidence: ''
    };
    if (!snap.attention) parts.attention = '';
    if (variant === 'resume' || snap.mode === 'return') {
      parts.resume = resumeHtml(snap, variant);
    }
    if (snap.mode === 'degraded') {
      parts.evidence = evidenceHtml(snap);
    }
    if (variant === 'attention' && !snap.attention) {
      parts.timeline = parts.timeline.replace(
        'data-priority="normal"',
        'data-priority="primary"'
      );
    }
    var order = ['attention', 'timeline', 'resume', 'evidence'].filter(function (
      id
    ) {
      return !!parts[id];
    });
    return (
      '<div class="leaf-panel work-panel" data-variant="' +
      R.esc(variant) +
      '" data-selected="' +
      R.esc(selectedId || '') +
      '">' +
      order
        .map(function (id) {
          return parts[id] || '';
        })
        .join('') +
      '</div>'
    );
  }

  function leafPreviewHtml(surface) {
    if (surface === 'float') {
      return (
        '<aside class="leaf-preview" data-preview="float">' +
        '<p class="cap">预览 · 浮窗何时出现</p>' +
        '<div class="scene-stub">' +
        '<div class="float-chip"><span class="d"></span><span>跑着</span><span class="u">72%</span></div>' +
        '<p class="hint">目标应用在前台时才出现</p></div>' +
        '<p class="note">左边预览会跟着右侧选项变。先选「何时出现」，再调皮肤。</p></aside>'
      );
    }
    if (surface === 'mini') {
      return (
        '<aside class="leaf-preview" data-preview="mini">' +
        '<p class="cap">预览 · 迷你栏身上留什么</p>' +
        '<div class="mini-stub"><span class="pill">Cursor</span><span class="pill soft">正在听…</span><span class="pill">⌘</span></div>' +
        '<p class="note">收成细条时，只留你真正需要扫一眼的东西。</p></aside>'
      );
    }
    return (
      '<aside class="leaf-preview" data-preview="softPad">' +
      '<p class="cap">预览 · Soft Pad（真预览桥）</p>' +
      '<div class="soft-pad-preview-host agent-preview-host awh-pad-host" id="awhPadHost" data-preview-label="Soft Pad">' +
      '<div id="awhPadPaint" data-awh-pad-paint data-soft-pad-preview-paint data-waiting="1">' +
      '<div class="agent-preview-empty">正在接通 Soft Pad 预览桥…</div></div></div>' +
      '<p class="sp-status-line"><span data-awh-pad-status data-kind="stub">桥已就绪</span></p>' +
      '<p class="note">与 Agent 页共用 ot-agent-preview。右侧改接入/顶栏时，这里应跟着变。</p></aside>'
    );
  }

  function leafPanelHtml(surface) {
    if (surface === 'float') {
      return (
        '<section class="leaf-panel" data-leaf="float">' +
        '<div class="job" data-tone="float"><p class="lab">这一叶管什么</p>' +
        '<h4>浮窗 = Soft Pad 完整窗口的出场与外观</h4>' +
        '<p>决定何时出现完整窗口。选「出场为插条」后，再到迷你栏改条上留什么。</p></div>' +
        '<div class="sec"><div class="sec-h"><span class="n">何时出现</span><h4>完整窗口什么时候出来</h4></div>' +
        '<div class="sec-b"><div class="btn-row">' +
        '<button type="button" class="btn is-on" data-act="noop">应用在用</button>' +
        '<button type="button" class="btn" data-act="noop">始终显隐</button>' +
        '<button type="button" class="btn" data-act="noop">出场为插条</button>' +
        '<button type="button" class="btn" data-act="noop">不显示</button></div></div></div></section>'
      );
    }
    if (surface === 'mini') {
      return (
        '<section class="leaf-panel" data-leaf="mini">' +
        '<div class="job" data-tone="mini"><p class="lab">这一叶管什么</p>' +
        '<h4>迷你栏 = 收成细条时条上留什么</h4>' +
        '<p>先选留多少，再微调：谁在忙 · 你说的话 · 常用钮。</p></div>' +
        '<div class="sec"><div class="sec-h"><span class="n">身上留什么</span><h4>细条内容</h4></div>' +
        '<div class="sec-b"><div class="btn-row">' +
        '<button type="button" class="btn is-on" data-act="noop">状态 + 话</button>' +
        '<button type="button" class="btn" data-act="noop">只留状态</button>' +
        '<button type="button" class="btn" data-act="noop">极简</button></div></div></div></section>'
      );
    }
    return (
      '<section class="leaf-panel" data-leaf="softPad">' +
      '<div class="job" data-tone="softPad"><p class="lab">这一叶管什么</p>' +
      '<h4>Soft Pad = 顶栏 · 灯 · 接入 · 数字键</h4>' +
      '<p>不管浮窗何时出现；这里只管键盘本体怎么接 Agent。</p></div>' +
      '<div class="sec"><div class="sec-h"><span class="n">接入</span><h4>当前 Agent</h4></div>' +
      '<div class="sec-b"><div class="btn-row">' +
      '<button type="button" class="btn is-on" data-act="noop">Cursor</button>' +
      '<button type="button" class="btn" data-act="noop">Claude</button>' +
      '<button type="button" class="btn" data-act="noop">Codex</button></div></div></div></section>'
    );
  }

  function unifiedWorkspaceHtml(snap, variant, surface, listening, selectedId) {
    if (surface === 'work') {
      return workPracticalHtml(snap, variant, selectedId, listening);
    }
    return (
      '<div class="leaf-workspace" data-surface="' +
      R.esc(surface) +
      '">' +
      leafPreviewHtml(surface) +
      '<div class="leaf-main">' +
      leafPanelHtml(surface) +
      '</div></div>'
    );
  }

  R.renderPage = function (opts) {
    opts = opts || {};
    var variant =
      VARIANTS.indexOf(opts.variant) >= 0 ? opts.variant : 'timeline';
    var mode = MODES.indexOf(opts.mode) >= 0 ? opts.mode : 'quiet';
    var surface =
      SURFACES.indexOf(opts.surface) >= 0 ? opts.surface : 'work';
    var listening = !!opts.listening;
    var empty = !!opts.empty;
    var snap;
    if (opts.liveSnap) {
      snap = opts.liveSnap;
    } else {
      snap = empty ? R.emptySnapshot() : R.snapshotFor(mode);
    }
    var events = snap.recentEvents || [];
    var selectedId = opts.selectedEventId || '';
    if (
      !selectedId ||
      !events.some(function (e) {
        return e.id === selectedId;
      })
    ) {
      selectedId = events[0] ? events[0].id : '';
    }
    if (listening) {
      snap.inputState = snap.inputState || {};
      snap.inputState.listening = true;
      if (!snap.inputState.transcript) {
        snap.inputState.transcript = '我想把首页的历史记录放到主区域……';
      }
    }

    var meta = SURFACE_META[surface] || SURFACE_META.work;

    return (
      '<div class="ot-app" data-mode="' +
      R.esc(snap.mode) +
      '" data-variant="' +
      R.esc(variant) +
      '" data-surface="' +
      R.esc(surface) +
      '" data-live="' +
      (snap.live ? '1' : '0') +
      '" data-selected="' +
      R.esc(selectedId) +
      '">' +
      sidebarHtml() +
      '<div class="ot-main">' +
      '<p class="ot-crumb">设置 — Agent</p>' +
      '<div class="agent-shell">' +
      '<div class="shell-h"><span><b>设置 → Agent</b></span>' +
      '<span>' +
      R.esc(meta.hint) +
      '</span></div>' +
      agentHeadHtml(snap, surface) +
      snapHtml(snap, surface) +
      surfaceTabsHtml(surface) +
      '<div class="agent-body">' +
      unifiedWorkspaceHtml(snap, variant, surface, listening, selectedId) +
      '</div></div></div></div>'
    );
  };

  R.fromHomeSnapshot = function (dto) {
    var Pulse = global.OneToneAgentHomePulse;
    if (!Pulse || !Pulse.fromHomeSnapshot) {
      return null;
    }
    return Pulse.fromHomeSnapshot(dto);
  };

  R.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(R._toastTimer);
    R._toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
    }, 2200);
  };
})(typeof window !== 'undefined' ? window : globalThis);
