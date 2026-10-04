/**
 * Agent Center UI — mounts into #workHost inside agent-page.html.
 * Snapshot authority: cmd_agent_center_snapshot (Rust).
 * Soft Pad registry is NOT used for install/version/health/capabilities.
 * Chinese timeline projection may call OneToneAgentHomePulse when present.
 *
 * Production IPC failure must NOT fall back to fixtureSnap — demo=1 / mountDemo only.
 */
(function (global) {
  'use strict';

  var LAST_GOOD_KEY = 'onetone.agentCenter.lastGood';

  var I18N = {
    zh: {
      groupNeeds: '需要处理',
      groupConnected: '已接入',
      groupLimited: '已发现但受限',
      groupNotFound: '支持但未发现',
      showAll: '显示全部支持的 Agent',
      hideAll: '隐藏未发现',
      initializing: '正在确认 Agent 状态',
      stale: '状态可能过期，请刷新',
      readyEmpty: '暂无待办',
      drawerTitle: '选择 Agent',
      drawerSearch: '搜索 Agent',
      pickAgent: '当前 Agent',
      refresh: '刷新',
      retry: '重试',
      noWork: '此 Agent 暂无项目内工作记录',
      actionUnavailable: '操作不可用',
      metricUnavailable: '指标不可用',
      path: '路径',
      version: '版本',
      form: '形态',
      sync: '最近同步',
      caps: '来源与能力',
      encrypted: '加密不可读',
      limited: '受限',
      notFound: '未发现',
      loadFailed: '暂时无法读取 Agent 状态',
      loadFailedHint: '检查应用是否在 Tauri 环境运行，或点击重试。',
      showingStale: '显示上次成功快照（可能过期）',
      sessions: '今日会话',
      cost: '成本',
      success: '成功率',
      avgDuration: '平均耗时',
      work: '工作记录',
      actionOk: '已执行',
      actionFail: '执行失败',
      openConfigFail: '无法打开 Agent 配置',
      openDataFail: '无法打开数据页',
      viewFail: '无法打开工作',
      pending: '处理中…',
      rosterTitle: 'Agent 名册',
      needsCount: '需要处理',
      waitingConfirm: '等待确认',
      running: '正在运行',
      idle: '空闲',
      completed: '已完成',
      limitedHist: '历史数据受限',
      noProjectWork: '暂无项目内工作',
      continueWork: '继续',
      previewBrief: '续作摘要',
      viewWork: '查看',
      interruptWork: '中断',
      configWork: '配置',
      dataWork: '查看数据',
      exportWork: '导出',
      syncLabel: '最近同步',
      resumable: '可恢复当前工作',
      notResumable: '当前工作不可恢复',
      controlPlaneUnavailable: '暂无后台控制面证据',
      probeTimeout: 'Claude 探测超时',
      probeCommandFailed: 'Claude 探测失败',
      probeParseError: 'Claude 状态无法解析',
      staleControlEvidence: '控制面证据已过期',
      backgroundSessionNotFound: '未找到可中断的后台会话',
      backgroundSessionNotActive: '后台会话未在运行',
      staleObservation: '工作状态已过期',
      stopCommandFailed: '中断命令失败',
      stopTimeout: '中断命令超时',
      stopNotVerified: '中断未得到确认',
      postStopProbeFailed: '中断后状态无法确认',
      capAvailable: '可用',
      capLimited: '受限',
      capUnavailable: '不可用',
      capUnknown: '未知'
    },
    en: {
      groupNeeds: 'Needs attention',
      groupConnected: 'Connected',
      groupLimited: 'Discovered / limited',
      groupNotFound: 'Supported but not found',
      showAll: 'Show all supported agents',
      hideAll: 'Hide not found',
      initializing: 'Confirming agent status…',
      stale: 'Status may be stale — refresh',
      readyEmpty: 'Nothing waiting',
      drawerTitle: 'Choose agent',
      drawerSearch: 'Search agents',
      pickAgent: 'Current agent',
      refresh: 'Refresh',
      retry: 'Retry',
      noWork: 'No in-project work for this agent',
      actionUnavailable: 'Action unavailable',
      metricUnavailable: 'Metric unavailable',
      path: 'Path',
      version: 'Version',
      form: 'Form',
      sync: 'Last sync',
      caps: 'Sources & capabilities',
      encrypted: 'Encrypted / unreadable',
      limited: 'Limited',
      notFound: 'Not found',
      loadFailed: 'Unable to read Agent status',
      loadFailedHint: 'Ensure the app is running under Tauri, then retry.',
      showingStale: 'Showing last successful snapshot (may be stale)',
      sessions: 'Sessions today',
      cost: 'Cost',
      success: 'Success rate',
      avgDuration: 'Avg duration',
      work: 'Work',
      actionOk: 'Done',
      actionFail: 'Failed',
      openConfigFail: 'Could not open Agent config',
      openDataFail: 'Could not open data page',
      viewFail: 'Could not open work',
      pending: 'Working…',
      rosterTitle: 'Agent roster',
      needsCount: 'Needs attention',
      waitingConfirm: 'Waiting for you',
      running: 'Running',
      idle: 'Idle',
      completed: 'Done',
      limitedHist: 'History limited',
      noProjectWork: 'No in-project work',
      continueWork: 'Continue',
      previewBrief: 'Continuation brief',
      viewWork: 'View',
      interruptWork: 'Stop',
      configWork: 'Configure',
      dataWork: 'View data',
      exportWork: 'Export',
      syncLabel: 'Last sync',
      resumable: 'Current work is resumable',
      notResumable: 'Current work is not resumable',
      controlPlaneUnavailable: 'No background control-plane evidence',
      probeTimeout: 'Claude probe timed out',
      probeCommandFailed: 'Claude probe failed',
      probeParseError: 'Claude status could not be parsed',
      staleControlEvidence: 'Control-plane evidence is stale',
      backgroundSessionNotFound: 'No interruptible background session found',
      backgroundSessionNotActive: 'Background session is not active',
      staleObservation: 'Work observation is stale',
      stopCommandFailed: 'Stop command failed',
      stopTimeout: 'Stop command timed out',
      stopNotVerified: 'Stop was not verified',
      postStopProbeFailed: 'Could not confirm status after stop',
      capAvailable: 'available',
      capLimited: 'limited',
      capUnavailable: 'unavailable',
      capUnknown: 'unknown'
    }
  };

  var state = {
    snap: null,
    selectedId: null,
    expandedId: null,
    mountMode: 'page',
    showNotFound: false,
    groupOpen: {
      needsAttention: true,
      connected: true,
      discoveredLimited: false,
      supportedNotFound: false
    },
    drawerOpen: false,
    search: '',
    error: null,
    showingStale: false,
    feedback: null,
    pendingAction: null,
    lastGoodAsOf: null
  };

  var homeHostEl = null;
  var pageHostEl = null;
  var homeRefreshTimer = 0;
  var homeLastRefreshAt = 0;
  var homeLastHint = '';
  var HOME_REFRESH_MIN_MS = 45000;

  function lang() {
    var L = (global.document && document.documentElement && document.documentElement.lang) || 'zh';
    return String(L).toLowerCase().indexOf('en') === 0 ? 'en' : 'zh';
  }

  function t(key) {
    var map = {
      groupNeeds: 'agentCenterGroupNeeds',
      groupConnected: 'agentCenterGroupConnected',
      groupLimited: 'agentCenterGroupLimited',
      groupNotFound: 'agentCenterGroupNotFound',
      showAll: 'agentCenterShowAll',
      initializing: 'agentCenterInitializing',
      stale: 'agentCenterStale',
      readyEmpty: 'agentCenterReadyEmpty',
      drawerTitle: 'agentCenterDrawerTitle',
      drawerSearch: 'agentCenterDrawerSearch',
      pickAgent: 'agentCenterPickAgent',
      metricUnavailable: 'agentCenterMetricUnavailable',
      actionUnavailable: 'agentCenterActionUnavailable',
      encrypted: 'agentCenterEncrypted',
      limited: 'agentCenterLimited',
      notFound: 'agentCenterNotFound',
      loadFailed: 'agentCenterLoadFailed',
      loadFailedHint: 'agentCenterLoadFailedHint',
      retry: 'agentCenterRetry',
      sessions: 'agentCenterSessions',
      cost: 'agentCenterCost',
      success: 'agentCenterSuccess'
    };
    var ik = map[key];
    if (ik && global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
      var v = global.OneToneI18n.t(ik);
      if (v && v !== ik) return v;
    }
    var pack = I18N[lang()] || I18N.zh;
    return pack[key] || key;
  }

  function isDemoMode() {
    try {
      return /(?:\?|&)demo=1(?:&|$)/.test(String(global.location && global.location.search || ''));
    } catch (_) {
      return false;
    }
  }

  function invoke(cmd, args) {
    var payload = args || {};
    try {
      if (global.OneToneIpc && typeof global.OneToneIpc.invoke === 'function') {
        return global.OneToneIpc.invoke(cmd, payload);
      }
    } catch (_) {}
    try {
      var internals = global.__TAURI_INTERNALS__;
      if (internals && typeof internals.invoke === 'function') {
        return internals.invoke(cmd, payload);
      }
    } catch (_) {}
    try {
      var core = global.__TAURI__ && global.__TAURI__.core;
      if (core && typeof core.invoke === 'function') {
        return core.invoke(cmd, payload);
      }
    } catch (_) {}
    try {
      if (global.parent && global.parent !== global) {
        if (global.parent.OneToneIpc && typeof global.parent.OneToneIpc.invoke === 'function') {
          return global.parent.OneToneIpc.invoke(cmd, payload);
        }
        var pcore = global.parent.__TAURI__ && global.parent.__TAURI__.core;
        if (pcore && typeof pcore.invoke === 'function') {
          return pcore.invoke(cmd, payload);
        }
      }
    } catch (_) {}
    return Promise.reject(new Error('no_tauri'));
  }

  function toast(msg) {
    state.feedback = String(msg || '');
    try {
      if (global.parent && global.parent.OneToneToast && global.parent.OneToneToast.show) {
        global.parent.OneToneToast.show(state.feedback);
        return;
      }
    } catch (_) {}
    paint();
  }

  function fixtureSnap() {
    return {
      attentionState: 'ready',
      asOf: Date.now(),
      recommendedAgentId: 'kind:codex',
      groups: {
        needsAttention: [],
        connected: ['kind:codex', 'kind:claude'],
        discoveredLimited: ['kind:cursor'],
        supportedNotFound: ['kind:aider']
      },
      agents: [
        {
          agentId: 'kind:codex',
          runtimeKind: 'codex',
          displayName: 'Codex',
          formFactor: 'cli',
          presenceState: 'connected',
          status: 'idle',
          version: null,
          dataPath: '~/.codex',
          lastSyncAt: null,
          resolvedCapabilities: {
            usage: { state: 'unknown' },
            sessionMetadata: { state: 'limited' },
            transcript: { state: 'unknown' },
            realtimeStatus: { state: 'limited' },
            hooks: { state: 'available' },
            resume: { state: 'available' },
            focus: { state: 'available' }
          },
          metrics: {
            todaySessions: { value: 0, basis: 'local' },
            todayCostUsd: {
              value: null,
              basis: 'unavailable',
              unavailableReason: 'no_official_cost_source'
            },
            successRate: {
              value: null,
              basis: 'unavailable',
              unavailableReason: 'no_stable_success_source'
            },
            averageDurationMs: {
              value: null,
              basis: 'unavailable',
              unavailableReason: 'no_stable_duration_source'
            }
          },
          recentWork: [],
          currentWork: null,
          actions: [
            {
              id: 'agent.focus',
              label: 'View',
              scope: 'externalAgent',
              support: 'workflow',
              supported: true,
              enabled: true,
              executor: 'focusApp:codex'
            },
            {
              id: 'session.resume',
              label: 'Resume',
              scope: 'externalAgent',
              support: 'native',
              supported: true,
              enabled: false,
              reason: 'no_external_session'
            },
            {
              id: 'checkpoint.preview',
              label: 'Continuation brief',
              scope: 'oneToneUi',
              support: 'unsupported',
              supported: true,
              enabled: false,
              reason: 'no_checkpoint'
            },
            {
              id: 'agent.interrupt',
              label: 'Interrupt',
              scope: 'externalAgent',
              support: 'hotkey',
              supported: true,
              enabled: false,
              reason: 'not_running'
            },
            {
              id: 'ui.open_config',
              label: 'Open config',
              scope: 'oneToneUi',
              support: 'unsupported',
              supported: true,
              enabled: true,
              executor: 'clientNavigation:softPad'
            },
            {
              id: 'export_history',
              label: 'Export',
              scope: 'externalAgent',
              support: 'unsupported',
              supported: false,
              enabled: false,
              reason: 'not_wired'
            }
          ],
          limitations: [],
          presence: {
            installation: 'installed',
            dataSource: 'degraded',
            runtime: 'unknown',
            integration: 'partial'
          },
          observedStatus: {
            value: 'idle',
            source: 'none',
            observedAt: Date.now(),
            freshUntil: Date.now(),
            confidence: 'low'
          }
        },
        {
          agentId: 'kind:claude',
          runtimeKind: 'claude',
          displayName: 'Claude Code',
          formFactor: 'cli',
          presenceState: 'connected',
          status: 'idle',
          dataPath: '~/.claude',
          resolvedCapabilities: {
            resume: { state: 'available' },
            focus: { state: 'available' },
            hooks: { state: 'available' },
            usage: { state: 'unknown' },
            sessionMetadata: { state: 'limited' },
            transcript: { state: 'unknown' },
            realtimeStatus: { state: 'limited' }
          },
          metrics: {
            todaySessions: { value: 0, basis: 'local' },
            todayCostUsd: { value: null, basis: 'unavailable', unavailableReason: 'x' },
            successRate: { value: null, basis: 'unavailable', unavailableReason: 'x' },
            averageDurationMs: { value: null, basis: 'unavailable', unavailableReason: 'x' }
          },
          recentWork: [],
          actions: [
            {
              id: 'agent.focus',
              label: 'View',
              scope: 'externalAgent',
              support: 'workflow',
              supported: true,
              enabled: true,
              executor: 'focusApp:claude'
            },
            {
              id: 'agent.interrupt',
              label: 'Interrupt',
              scope: 'externalAgent',
              support: 'unsupported',
              supported: false,
              enabled: false,
              reason: 'provider_unsupported'
            },
            {
              id: 'ui.open_config',
              label: 'Open config',
              scope: 'oneToneUi',
              support: 'unsupported',
              supported: true,
              enabled: true,
              executor: 'clientNavigation:softPad'
            }
          ],
          limitations: [],
          presence: {
            installation: 'installed',
            dataSource: 'degraded',
            runtime: 'unknown',
            integration: 'partial'
          },
          observedStatus: {
            value: 'idle',
            source: 'none',
            observedAt: Date.now(),
            freshUntil: Date.now(),
            confidence: 'low'
          }
        },
        {
          agentId: 'kind:cursor',
          runtimeKind: 'cursor',
          displayName: 'Cursor',
          formFactor: 'ide',
          presenceState: 'limited',
          status: 'unknown',
          limitations: [{ code: 'oversized_db' }],
          resolvedCapabilities: {
            resume: { state: 'unavailable', reason: 'no_resume' },
            focus: { state: 'available' },
            hooks: { state: 'limited' },
            usage: { state: 'unknown' },
            sessionMetadata: { state: 'limited' },
            transcript: { state: 'unknown' },
            realtimeStatus: { state: 'limited' }
          },
          metrics: {
            todaySessions: { value: 0, basis: 'local' },
            todayCostUsd: { value: null, basis: 'unavailable', unavailableReason: 'x' },
            successRate: { value: null, basis: 'unavailable', unavailableReason: 'x' },
            averageDurationMs: { value: null, basis: 'unavailable', unavailableReason: 'x' }
          },
          recentWork: [],
          actions: [
            {
              id: 'agent.focus',
              label: 'View',
              scope: 'externalAgent',
              support: 'workflow',
              supported: true,
              enabled: true,
              executor: 'focusApp:cursor'
            },
            {
              id: 'export_history',
              label: 'Export',
              scope: 'externalAgent',
              support: 'unsupported',
              supported: false,
              enabled: false,
              reason: 'not_wired'
            }
          ],
          presence: {
            installation: 'installed',
            dataSource: 'unreadable',
            runtime: 'unknown',
            integration: 'partial'
          },
          observedStatus: {
            value: 'unknown',
            source: 'none',
            observedAt: Date.now(),
            freshUntil: Date.now(),
            confidence: 'low'
          }
        },
        {
          agentId: 'kind:aider',
          runtimeKind: 'aider',
          displayName: 'Aider',
          formFactor: 'cli',
          presenceState: 'not_found',
          status: 'unknown',
          resolvedCapabilities: {
            resume: { state: 'unavailable' },
            focus: { state: 'unavailable' },
            hooks: { state: 'unavailable' },
            usage: { state: 'unavailable' },
            sessionMetadata: { state: 'unavailable' },
            transcript: { state: 'unavailable' },
            realtimeStatus: { state: 'unavailable' }
          },
          metrics: {
            todaySessions: { value: 0, basis: 'local' },
            todayCostUsd: { value: null, basis: 'unavailable', unavailableReason: 'x' },
            successRate: { value: null, basis: 'unavailable', unavailableReason: 'x' },
            averageDurationMs: { value: null, basis: 'unavailable', unavailableReason: 'x' }
          },
          recentWork: [],
          actions: [],
          presence: {
            installation: 'notFound',
            dataSource: 'absent',
            runtime: 'unknown',
            integration: 'unsupported'
          },
          observedStatus: {
            value: 'unknown',
            source: 'none',
            observedAt: Date.now(),
            freshUntil: Date.now(),
            confidence: 'low'
          }
        }
      ],
      homeSessionIds: [],
      referencedSessionIds: []
    };
  }

  function byId(id) {
    var agents = (state.snap && state.snap.agents) || [];
    for (var i = 0; i < agents.length; i++) {
      if (agents[i].agentId === id) return agents[i];
    }
    return null;
  }

  function pickSelected() {
    if (state.selectedId && byId(state.selectedId)) return state.selectedId;
    var g = (state.snap && state.snap.groups) || {};
    var order = [].concat(
      g.needsAttention || [],
      g.connected || [],
      g.discoveredLimited || []
    );
    if (order.length) return order[0];
    return (state.snap && state.snap.recommendedAgentId) || null;
  }

  function statusLabel(agent) {
    if (!agent) return '';
    if (agent.status === 'needs_input') return t('waitingConfirm');
    if (agent.status === 'working') return t('running');
    if (agent.status === 'completed') return t('completed');
    if (agent.presenceState === 'not_found') return t('notFound');
    if (agent.presenceState === 'limited' || agent.presenceState === 'detected') return t('limited');
    if (
      agent.limitations &&
      agent.limitations.some(function (l) {
        return String(l.code || '').indexOf('encrypt') >= 0;
      })
    ) {
      return t('encrypted');
    }
    if (agent.status === 'idle' || !agent.status) return t('idle');
    return agent.status || agent.presenceState || '';
  }

  function capLabel(stateStr) {
    if (stateStr === 'available') return t('capAvailable');
    if (stateStr === 'limited') return t('capLimited');
    if (stateStr === 'unavailable') return t('capUnavailable');
    return t('capUnknown');
  }

  function formatSync(ms) {
    if (ms == null || ms === '') return '—';
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) return '—';
    try {
      return new Date(n).toLocaleString();
    } catch (_) {
      return String(ms);
    }
  }

  function saveLastGood(snap) {
    try {
      global.sessionStorage.setItem(
        LAST_GOOD_KEY,
        JSON.stringify({ asOf: snap.asOf || Date.now(), snap: snap })
      );
    } catch (_) {}
  }

  function loadLastGood() {
    try {
      var raw = global.sessionStorage.getItem(LAST_GOOD_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.snap ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function formatMetric(m) {
    if (!m || m.value == null) {
      return (
        t('metricUnavailable') + (m && m.unavailableReason ? ' · ' + m.unavailableReason : '')
      );
    }
    return String(m.value) + (m.basis && m.basis !== 'unavailable' ? ' (' + m.basis + ')' : '');
  }

  function renderRoster(into) {
    var g = state.snap.groups;
    var blocks = [
      { key: 'needsAttention', ids: g.needsAttention || [], title: t('groupNeeds') },
      { key: 'connected', ids: g.connected || [], title: t('groupConnected') },
      { key: 'discoveredLimited', ids: g.discoveredLimited || [], title: t('groupLimited') },
      { key: 'supportedNotFound', ids: g.supportedNotFound || [], title: t('groupNotFound') }
    ];
    var html = '';
    blocks.forEach(function (b) {
      if (b.key === 'supportedNotFound' && !state.showNotFound) return;
      var open = state.groupOpen[b.key] !== false;
      var ids = (b.ids || []).filter(function (id) {
        if (!state.search) return true;
        var a = byId(id);
        var q = state.search.toLowerCase();
        return a && String(a.displayName || '').toLowerCase().indexOf(q) >= 0;
      });
      html += '<div class="ac-group" data-group="' + b.key + '">';
      html +=
        '<button type="button" class="ac-group-hd" aria-expanded="' +
        (open ? 'true' : 'false') +
        '" data-toggle-group="' +
        b.key +
        '"><span>' +
        b.title +
        ' · ' +
        ids.length +
        '</span><span>' +
        (open ? '▾' : '▸') +
        '</span></button>';
      if (open) {
        ids.forEach(function (id) {
          var a = byId(id);
          if (!a) return;
          var sel = id === state.selectedId;
          html +=
            '<button type="button" class="ac-agent-btn' +
            (sel ? ' is-selected' : '') +
            '" role="option" aria-selected="' +
            (sel ? 'true' : 'false') +
            '" data-agent-id="' +
            escapeAttr(id) +
            '">';
          html += '<span class="ac-agent-name">' + escapeHtml(a.displayName) + '</span>';
          html +=
            '<span class="ac-agent-meta">' + escapeHtml(statusLabel(a)) + '</span></button>';
        });
      }
      html += '</div>';
    });
    html +=
      '<button type="button" class="ac-show-all" data-toggle-notfound="1">' +
      (state.showNotFound ? t('hideAll') : t('showAll')) +
      '</button>';
    into.innerHTML = html;
  }

  function renderDetail(into) {
    var banners = '';
    if (state.error) {
      banners +=
        '<div class="ac-banner ac-banner-error" role="alert">' +
        escapeHtml(t('loadFailed')) +
        ' · ' +
        escapeHtml(state.error) +
        '<br/><span class="ac-agent-meta">' +
        escapeHtml(t('loadFailedHint')) +
        '</span> ' +
        '<button type="button" data-refresh="1">' +
        escapeHtml(t('retry')) +
        '</button></div>';
    }
    if (state.showingStale && state.snap) {
      banners +=
        '<div class="ac-banner" role="status">' + escapeHtml(t('showingStale')) + '</div>';
    }
    if (state.feedback) {
      banners +=
        '<div class="ac-banner is-ready" role="status">' +
        escapeHtml(state.feedback) +
        '</div>';
    }

    if (!state.snap) {
      into.innerHTML = banners || '<p class="ac-agent-meta">' + escapeHtml(t('loadFailed')) + '</p>';
      return;
    }

    var a = byId(state.selectedId);
    if (!a) {
      into.innerHTML =
        banners + '<p class="ac-agent-meta">' + escapeHtml(t('noWork')) + '</p>';
      return;
    }

    var attn = state.snap.attentionState;
    if (attn === 'initializing') {
      banners +=
        '<div class="ac-banner" role="status">' + escapeHtml(t('initializing')) + '</div>';
    } else if (attn === 'stale') {
      banners += '<div class="ac-banner" role="status">' + escapeHtml(t('stale')) + '</div>';
    } else if (attn === 'ready' && !(state.snap.groups.needsAttention || []).length) {
      banners +=
        '<div class="ac-banner is-ready" role="status">' +
        escapeHtml(t('readyEmpty')) +
        '</div>';
    }

    var html = banners;
    html += '<div class="ac-identity">';
    html += '<strong>' + escapeHtml(a.displayName) + '</strong>';
    html += '<span>' + escapeHtml(statusLabel(a)) + '</span>';
    html +=
      '<span>' + t('version') + ': ' + escapeHtml(a.version || '—') + '</span>';
    html +=
      '<span>' + t('form') + ': ' + escapeHtml(a.formFactor || '—') + '</span>';
    html +=
      '<span>' + t('path') + ': ' + escapeHtml(a.dataPath || '—') + '</span>';
    html +=
      '<span>' + t('sync') + ': ' + escapeHtml(formatSync(a.lastSyncAt)) + '</span>';
    html += '</div>';

    html += '<div class="ac-actions">';
    (a.actions || []).forEach(function (act) {
      var title = act.enabled ? '' : act.reason || t('actionUnavailable');
      var primary = act.id === 'agent.focus' || act.id === 'focus' ? ' ac-action-primary' : '';
      html +=
        '<button type="button" class="' +
        primary.trim() +
        '" data-action="' +
        escapeAttr(act.id) +
        '"' +
        (act.enabled ? '' : ' disabled') +
        ' title="' +
        escapeAttr(title) +
        '">' +
        escapeHtml(act.label) +
        '</button>';
    });
    html +=
      '<button type="button" data-refresh="1">' + escapeHtml(t('refresh')) + '</button>';
    html += '</div>';

    html +=
      '<p class="ac-agent-meta">' +
      escapeHtml(t('sessions')) +
      ': ' +
      escapeHtml(formatMetric(a.metrics && a.metrics.todaySessions)) +
      '</p>';
    html +=
      '<p class="ac-agent-meta">' +
      escapeHtml(t('cost')) +
      ': ' +
      escapeHtml(formatMetric(a.metrics && a.metrics.todayCostUsd)) +
      '</p>';
    html +=
      '<p class="ac-agent-meta">' +
      escapeHtml(t('success')) +
      ': ' +
      escapeHtml(formatMetric(a.metrics && a.metrics.successRate)) +
      '</p>';

    html += '<h3>' + escapeHtml(t('caps')) + '</h3>';
    var caps = a.resolvedCapabilities || {};
    var capKeys = [
      'usage',
      'sessionMetadata',
      'transcript',
      'realtimeStatus',
      'hooks',
      'resume',
      'focus'
    ];
    capKeys.forEach(function (k) {
      var c = caps[k] || {};
      html +=
        '<div class="ac-agent-meta">' +
        escapeHtml(k) +
        ': ' +
        escapeHtml(capLabel(c.state)) +
        (c.reason ? ' · ' + escapeHtml(c.reason) : '') +
        '</div>';
    });

    html += '<h3>' + escapeHtml(t('work')) + '</h3><ul class="ac-timeline">';
    var work = a.recentWork || [];
    if (!work.length) {
      html += '<li>' + escapeHtml(t('noWork')) + '</li>';
    } else {
      work.forEach(function (w) {
        var title = w.title || w.sessionId || '';
        var line = (w.status || '') + ' · ' + title;
        html += '<li>' + escapeHtml(line) + '</li>';
      });
    }
    html += '</ul>';
    into.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function humanReason(code) {
    var c = String(code || '');
    if (
      c === 'no_resumable_session' ||
      c === 'no_session' ||
      c === 'no_external_session' ||
      c === 'no_lane' ||
      c === 'no_checkpoint'
    )
      return t('notResumable');
    if (c === 'not_running') return t('idle');
    if (c === 'stale_observation') return t('staleObservation');
    if (c === 'control_plane_unavailable') return t('controlPlaneUnavailable');
    if (c === 'probe_timeout') return t('probeTimeout');
    if (c === 'probe_command_failed') return t('probeCommandFailed');
    if (c === 'probe_parse_error') return t('probeParseError');
    if (c === 'stale_control_evidence') return t('staleControlEvidence');
    if (c === 'background_session_not_found') return t('backgroundSessionNotFound');
    if (c === 'background_session_not_active') return t('backgroundSessionNotActive');
    if (c === 'stop_command_failed') return t('stopCommandFailed');
    if (c === 'stop_timeout') return t('stopTimeout');
    if (c === 'stop_not_verified') return t('stopNotVerified');
    if (c === 'post_stop_probe_failed') return t('postStopProbeFailed');
    if (
      c === 'not_wired' ||
      c === 'provider_unsupported' ||
      c === 'no_focus_executor' ||
      c === 'no_mapping_target' ||
      c === 'action_not_enabled' ||
      c === 'no_executor' ||
      c === 'unknown_action'
    )
      return t('actionUnavailable');
    if (c === 'no_focus' || c === 'no_resume') return t('actionUnavailable');
    if (c === 'no_official_cost_source' || c === 'no_stable_success_source' || c === 'no_stable_duration_source' || c === 'no_token_aggregate') {
      return t('metricUnavailable');
    }
    if (c.indexOf('encrypt') >= 0) return t('encrypted');
    if (c === 'discovered_only') return t('limitedHist');
    return c;
  }

  function formatMetricHome(m) {
    if (!m || m.value == null) return humanReason((m && m.unavailableReason) || '') || t('metricUnavailable');
    return String(m.value);
  }

  function statusTone(agent) {
    if (agent.status === 'needs_input' || agent.status === 'failed') return 'warn';
    if (agent.status === 'working') return 'run';
    if (agent.presenceState === 'not_found') return 'idle';
    if (agent.presenceState === 'limited') return 'warn';
    return 'ok';
  }

  function relativeWhen(ms) {
    if (ms == null) return '';
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) return '';
    var diff = Date.now() - n;
    if (diff < 60000) return lang() === 'en' ? 'just now' : '刚刚';
    if (diff < 3600000) {
      var m = Math.round(diff / 60000);
      return lang() === 'en' ? m + 'm ago' : m + ' 分钟前';
    }
    if (diff < 86400000) {
      var h = Math.round(diff / 3600000);
      return lang() === 'en' ? h + 'h ago' : h + ' 小时前';
    }
    if (diff < 172800000) return lang() === 'en' ? 'yesterday' : '昨天';
    return formatSync(ms);
  }

  function workLine(agent) {
    var w = agent.currentWork || (agent.recentWork && agent.recentWork[0]);
    if (!w) {
      if (agent.presenceState === 'limited' || (agent.limitations && agent.limitations.length)) {
        return t('limitedHist');
      }
      return t('noProjectWork');
    }
    return w.title || w.sessionId || t('noProjectWork');
  }

  function workWhen(agent) {
    var w = agent.currentWork || (agent.recentWork && agent.recentWork[0]);
    if (!w) return relativeWhen(agent.lastSyncAt) || '—';
    return relativeWhen(w.updatedAt || w.updated_at || agent.lastSyncAt) || '—';
  }

  function orderedHomeAgents() {
    if (!state.snap) return [];
    var g = state.snap.groups || {};
    var ids = []
      .concat(g.needsAttention || [])
      .concat(g.connected || [])
      .concat(g.discoveredLimited || [])
      .concat(state.showNotFound ? g.supportedNotFound || [] : []);
    var seen = {};
    var out = [];
    ids.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = 1;
      var a = byId(id);
      if (a) out.push(a);
    });
    return out;
  }

  function actionLabel(act) {
    if (!act) return '';
    if (act.id === 'session.resume') return t('continueWork');
    if (act.id === 'checkpoint.preview') return t('previewBrief');
    if (act.id === 'agent.focus' || act.id === 'view' || act.id === 'focus') return t('viewWork');
    if (act.id === 'agent.interrupt' || act.id === 'interrupt') return t('interruptWork');
    if (act.id === 'ui.open_config' || act.id === 'open_config') return t('configWork');
    if (act.id === 'ui.open_data' || act.id === 'open_data') return t('dataWork');
    if (act.id === 'export_history') return t('exportWork');
    return act.label || act.id;
  }

  function homeActionButtons(agent) {
    var acts = agent.actions || [];
    function find(id) {
      return acts.filter(function (x) {
        return x.id === id;
      })[0];
    }
    var order = [
      'session.resume',
      'checkpoint.preview',
      'agent.focus',
      'agent.interrupt',
      'ui.open_config',
      'ui.open_data',
      'export_history'
    ];
    var html = '';
    order.forEach(function (id) {
      var act = find(id);
      if (!act) return;
      if (id === 'agent.interrupt' && !act.supported) return;
      var pending = state.pendingAction === id + ':' + agent.agentId;
      var disabled = !act.enabled || pending;
      var title = act.enabled ? '' : humanReason(act.reason) || t('actionUnavailable');
      html +=
        '<button type="button" class="har-action' +
        (id === 'session.resume' && act.enabled ? ' is-primary' : '') +
        '" data-action="' +
        escapeAttr(id) +
        '" data-agent-id="' +
        escapeAttr(agent.agentId) +
        '"' +
        (disabled ? ' disabled' : '') +
        (title ? ' title="' + escapeAttr(title) + '"' : '') +
        '>' +
        escapeHtml(pending ? t('pending') : actionLabel(act)) +
        '</button>';
    });
    return html;
  }

  function renderHomeDetail(agent) {
    var m = agent.metrics || {};
    var resumeAct = (agent.actions || []).filter(function (x) {
      return x.id === 'session.resume' || x.id === 'resume';
    })[0];
    var canResume = !!(resumeAct && resumeAct.enabled);
    var html = '<div class="har-detail">';
    html += '<div class="har-metrics">';
    html +=
      '<div class="har-metric"><span>' +
      escapeHtml(t('sessions')) +
      '</span><strong>' +
      escapeHtml(formatMetricHome(m.todaySessions)) +
      '</strong></div>';
    html +=
      '<div class="har-metric"><span>' +
      escapeHtml(t('cost')) +
      '</span><strong>' +
      escapeHtml(formatMetricHome(m.todayCostUsd)) +
      '</strong></div>';
    html +=
      '<div class="har-metric"><span>' +
      escapeHtml(t('success')) +
      '</span><strong>' +
      escapeHtml(formatMetricHome(m.successRate)) +
      '</strong></div>';
    html +=
      '<div class="har-metric"><span>' +
      escapeHtml(t('avgDuration')) +
      '</span><strong>' +
      escapeHtml(formatMetricHome(m.averageDurationMs)) +
      '</strong></div>';
    html += '</div>';
    html +=
      '<p class="har-note">' +
      escapeHtml(t('syncLabel') + '：' + formatSync(agent.lastSyncAt)) +
      ' · ' +
      escapeHtml(canResume ? t('resumable') : t('notResumable')) +
      '</p>';
    if (agent.recentWork && agent.recentWork.length) {
      html += '<ul class="har-work-list">';
      agent.recentWork.slice(0, 5).forEach(function (w) {
        html +=
          '<li>' +
          escapeHtml((w.title || w.sessionId || '') + (w.status ? ' · ' + w.status : '')) +
          '</li>';
      });
      html += '</ul>';
    } else {
      html += '<p class="har-note">' + escapeHtml(t('noWork')) + '</p>';
    }
    html += '<div class="har-actions">' + homeActionButtons(agent) + '</div></div>';
    return html;
  }

  function paintHome() {
    var root = homeHostEl;
    if (!root || !root.isConnected) {
      root = document.getElementById('homeAgentRoster');
      homeHostEl = root;
    }
    if (!root) return;
    if (!root.querySelector('[data-har-list]')) {
      root.innerHTML =
        '<div class="har-root" data-har-root>' +
        '<div class="har-head"><h2 class="har-title">' +
        escapeHtml(t('rosterTitle')) +
        '</h2><button type="button" class="har-refresh" data-refresh="1">' +
        escapeHtml(t('refresh')) +
        '</button></div>' +
        '<div class="har-banners" data-har-banners></div>' +
        '<div class="har-list" data-har-list role="list"></div></div>';
    }
    var banners = root.querySelector('[data-har-banners]');
    var list = root.querySelector('[data-har-list]');
    if (!banners || !list) return;

    var bhtml = '';
    if (state.error) {
      bhtml +=
        '<div class="har-banner har-banner--error" role="alert">' +
        escapeHtml(state.error) +
        ' <button type="button" data-refresh="1">' +
        escapeHtml(t('retry')) +
        '</button></div>';
    }
    if (state.showingStale) {
      bhtml +=
        '<div class="har-banner" role="status">' + escapeHtml(t('showingStale')) + '</div>';
    }
    var needs = (state.snap && state.snap.groups && state.snap.groups.needsAttention) || [];
    if (needs.length) {
      var first = byId(needs[0]);
      bhtml +=
        '<button type="button" class="har-attention" data-expand-agent="' +
        escapeAttr(needs[0]) +
        '"><strong>' +
        escapeHtml(t('needsCount') + ' ' + needs.length) +
        '</strong><span>' +
        escapeHtml(first ? first.displayName + ' · ' + statusLabel(first) : '') +
        '</span></button>';
    }
    banners.innerHTML = bhtml;

    if (!state.snap) {
      list.innerHTML = state.error
        ? ''
        : '<p class="har-empty">' + escapeHtml(t('initializing')) + '</p>';
      return;
    }

    var agents = orderedHomeAgents();
    if (!agents.length) {
      list.innerHTML = '<p class="har-empty">' + escapeHtml(t('readyEmpty')) + '</p>';
      return;
    }
    var html = '';
    agents.forEach(function (a) {
      var open = state.expandedId === a.agentId;
      var needsMark = needs.indexOf(a.agentId) >= 0;
      html +=
        '<article class="har-row' +
        (open ? ' is-open' : '') +
        '" data-agent-row="' +
        escapeAttr(a.agentId) +
        '" role="listitem">' +
        '<button type="button" class="har-toggle" data-expand-agent="' +
        escapeAttr(a.agentId) +
        '" aria-expanded="' +
        (open ? 'true' : 'false') +
        '">' +
        '<span class="har-dot har-dot--' +
        statusTone(a) +
        '" aria-hidden="true"></span>' +
        '<span class="har-name">' +
        escapeHtml(a.displayName || a.agentId) +
        (needsMark ? '<i class="har-flag">!</i>' : '') +
        '<small>' +
        escapeHtml(statusLabel(a)) +
        '</small></span>' +
        '<span class="har-work"><strong>' +
        escapeHtml(workLine(a)) +
        '</strong></span>' +
        '<span class="har-time">' +
        escapeHtml(workWhen(a)) +
        '</span>' +
        '<span class="har-chevron" aria-hidden="true">⌄</span></button>';
      if (open) html += renderHomeDetail(a);
      html += '</article>';
    });
    if (!state.showNotFound) {
      var nf = (state.snap.groups.supportedNotFound || []).length;
      if (nf) {
        html +=
          '<button type="button" class="har-show-all" data-toggle-notfound="1">' +
          escapeHtml(t('showAll') + ' (' + nf + ')') +
          '</button>';
      }
    }
    list.innerHTML = html;
  }

  function paintPage() {
    var root = pageHostEl || document.getElementById('workHost');
    if (!root) return;
    if (state.snap) state.selectedId = pickSelected();
    var roster = root.querySelector('[data-ac-roster]');
    var detail = root.querySelector('[data-ac-detail]');
    var picker = root.querySelector('[data-ac-picker]');
    if (picker) {
      var cur = byId(state.selectedId);
      picker.textContent = t('pickAgent') + ': ' + (cur ? cur.displayName : '—');
    }
    if (roster && state.snap) renderRoster(roster);
    else if (roster && !state.snap) roster.innerHTML = '';
    if (detail) renderDetail(detail);
    var drawerRoster = root.querySelector('[data-ac-drawer-roster]');
    if (drawerRoster && state.snap) renderRoster(drawerRoster);
  }

  function paint() {
    if (state.mountMode === 'home') paintHome();
    else paintPage();
  }

  function navigateAgentSub(sub, agent) {
    var SD = global.OneToneSettingsDrawer;
    if (!SD || typeof SD.open !== 'function') return false;
    try {
      SD.open({
        panel: 'agent',
        agentSub: sub === 'data' ? 'data' : sub === 'softPad' ? null : null
      });
      setTimeout(function () {
        try {
          var frame = document.getElementById('agentProtoFrame');
          if (frame && frame.contentWindow) {
            frame.contentWindow.postMessage(
              {
                type: 'ot-agent-page-cmd',
                cmd: 'setSub',
                sub: sub === 'data' ? 'data' : 'softPad',
                agentId: agent && agent.agentId,
                runtimeKind: agent && agent.runtimeKind
              },
              '*'
            );
          }
        } catch (_) {}
      }, 350);
      return true;
    } catch (_) {
      return false;
    }
  }

  function finishAction(ok, msg) {
    state.pendingAction = null;
    toast(msg);
    if (ok) refresh(null, { force: true });
    else paint();
  }

  function applyClientEffect(effect, agent) {
    if (!effect || effect.type !== 'navigate') return false;
    var dest = effect.destination === 'data' ? 'data' : 'softPad';
    if (typeof global.setSub === 'function') {
      try {
        global.setSub(dest === 'data' ? 'data' : 'softPad');
        return true;
      } catch (_) {}
    }
    return navigateAgentSub(dest, agent);
  }

  function dispatchAction(actionId, agentId) {
    if (agentId) state.selectedId = agentId;
    var agent = byId(state.selectedId);
    if (!agent) {
      toast(t('actionUnavailable'));
      return;
    }
    var act = (agent.actions || []).filter(function (x) {
      return x.id === actionId;
    })[0];
    if (act && !act.enabled) {
      toast(humanReason(act.reason) || t('actionUnavailable'));
      return;
    }
    state.pendingAction = actionId + ':' + agent.agentId;
    paint();

    function fail(msg) {
      finishAction(false, msg);
    }
    function ok(msg) {
      finishAction(true, msg);
    }

    var hint = null;
    try {
      if (global.OneToneHomeFocus && typeof global.OneToneHomeFocus.projectHint === 'function') {
        hint = global.OneToneHomeFocus.projectHint();
      }
    } catch (_) {}

    invoke('cmd_agent_center_action', {
      args: {
        agentId: agent.agentId,
        actionId: actionId,
        projectHint: hint || null
      }
    })
      .then(function (res) {
        if (!res || res.ok === false) {
          fail(
            t('actionFail') +
              ' · ' +
              humanReason((res && (res.error || res.detail)) || act && act.reason) ||
              t('actionUnavailable')
          );
          return;
        }
        if (res.clientEffect) {
          if (applyClientEffect(res.clientEffect, agent)) {
            ok(t('actionOk') + ' · ' + actionLabel(act));
          } else {
            fail(
              actionId.indexOf('data') >= 0 ? t('openDataFail') : t('openConfigFail')
            );
          }
          return;
        }
        ok(t('actionOk') + ' · ' + actionLabel(act));
      })
      .catch(function (e) {
        fail(t('actionFail') + ' · ' + (e && e.message ? e.message : String(e)));
      });
  }

  function onHostClick(ev) {
    var actionBtn = ev.target.closest('[data-action]');
    if (actionBtn) {
      dispatchAction(
        actionBtn.getAttribute('data-action'),
        actionBtn.getAttribute('data-agent-id') || state.selectedId
      );
      return;
    }
    var exp = ev.target.closest('[data-expand-agent]');
    if (exp) {
      var eid = exp.getAttribute('data-expand-agent');
      state.expandedId = state.expandedId === eid ? null : eid;
      state.selectedId = eid;
      paint();
      return;
    }
    var tgel = ev.target.closest('[data-toggle-group]');
    if (tgel) {
      var gk = tgel.getAttribute('data-toggle-group');
      state.groupOpen[gk] = !(state.groupOpen[gk] !== false);
      paint();
      return;
    }
    var nf = ev.target.closest('[data-toggle-notfound]');
    if (nf) {
      state.showNotFound = !state.showNotFound;
      state.groupOpen.supportedNotFound = state.showNotFound;
      paint();
      return;
    }
    var ab = ev.target.closest('[data-agent-id]:not([data-action])');
    if (ab && ab.getAttribute('data-agent-id')) {
      state.selectedId = ab.getAttribute('data-agent-id');
      closeDrawer();
      paint();
      return;
    }
    if (ev.target.closest('[data-refresh]')) {
      refresh(homeLastHint || null, { force: true });
      return;
    }
    if (ev.target.closest('[data-ac-picker]')) {
      openDrawer();
      return;
    }
    if (ev.target.closest('[data-ac-drawer-close]')) {
      closeDrawer();
    }
  }

  function bind(root) {
    if (!root || root.getAttribute('data-ac-bound') === '1') return;
    root.setAttribute('data-ac-bound', '1');
    root.addEventListener('click', onHostClick);
    var search = root.querySelector('[data-ac-search]');
    if (search && search.getAttribute('data-ac-search-bound') !== '1') {
      search.setAttribute('data-ac-search-bound', '1');
      search.addEventListener('input', function () {
        state.search = search.value || '';
        paint();
      });
    }
  }

  function openDrawer() {
    state.drawerOpen = true;
    var d = document.getElementById('acDrawer');
    if (d) {
      d.classList.add('is-open');
      d.setAttribute('aria-hidden', 'false');
    }
  }
  function closeDrawer() {
    state.drawerOpen = false;
    var d = document.getElementById('acDrawer');
    if (d) {
      d.classList.remove('is-open');
      d.setAttribute('aria-hidden', 'true');
    }
  }

  function applySnap(snap, opts) {
    opts = opts || {};
    state.snap = snap;
    state.error = opts.error || null;
    state.showingStale = !!opts.stale;
    state.feedback = null;
    if (state.selectedId && !byId(state.selectedId)) state.selectedId = null;
    if (snap && !opts.stale) {
      saveLastGood(snap);
      state.lastGoodAsOf = snap.asOf || Date.now();
    }
    paint();
  }

  function applyLoadFailure(err) {
    var raw = err && err.message ? err.message : String(err || 'error');
    var msg = t('loadFailed');
    if (raw && raw !== 'error' && raw !== 'no_tauri') {
      msg = msg + ' · ' + raw;
    } else if (raw === 'no_tauri') {
      msg = msg + ' · ' + t('loadFailedHint');
    }
    var last = loadLastGood();
    if (last && last.snap) {
      state.lastGoodAsOf = last.asOf || null;
      applySnap(last.snap, { error: msg, stale: true });
      return;
    }
    state.snap = null;
    state.error = msg;
    state.showingStale = false;
    paint();
  }

  /**
   * Production refresh: never calls fixtureSnap on failure.
   * Demo: URL ?demo=1 uses fixture when Tauri missing.
   * @param {string} [projectHint]
   * @param {{ force?: boolean }} [opts]
   */
  function refresh(projectHint, opts) {
    opts = opts || {};
    state.feedback = null;
    var hintKey = projectHint ? String(projectHint) : '';
    var now = Date.now();
    if (
      state.mountMode === 'home' &&
      !opts.force &&
      !isDemoMode() &&
      state.snap &&
      hintKey === homeLastHint &&
      now - homeLastRefreshAt < HOME_REFRESH_MIN_MS
    ) {
      paint();
      return Promise.resolve(state.snap);
    }
    homeLastHint = hintKey;
    homeLastRefreshAt = now;

    var payload = {
      args: projectHint ? { projectHint: projectHint } : {}
    };
    // Soft refresh: snapshot only (still probes registry today). Prefer registry_refresh on force/first.
    var primary =
      opts.force || !state.snap
        ? 'cmd_agent_registry_refresh'
        : 'cmd_agent_center_snapshot';
    var fallback =
      primary === 'cmd_agent_registry_refresh'
        ? 'cmd_agent_center_snapshot'
        : 'cmd_agent_registry_refresh';

    if (isDemoMode()) {
      return invoke(primary, payload)
        .catch(function () {
          return invoke(fallback, payload);
        })
        .then(function (snap) {
          applySnap(snap);
        })
        .catch(function () {
          applySnap(fixtureSnap());
        });
    }
    return invoke(primary, payload)
      .catch(function () {
        return invoke(fallback, payload);
      })
      .then(function (snap) {
        applySnap(snap);
      })
      .catch(function (err) {
        applyLoadFailure(err);
      });
  }

  function scheduleHomeRefresh(projectHint) {
    if (homeRefreshTimer) {
      clearTimeout(homeRefreshTimer);
      homeRefreshTimer = 0;
    }
    homeRefreshTimer = setTimeout(function () {
      homeRefreshTimer = 0;
      refresh(projectHint, { force: false });
    }, 400);
  }

  function mount(host) {
    if (!host) return;
    state.mountMode = 'page';
    pageHostEl = host;
    host.innerHTML =
      '<div class="ac-root" id="agentCenterRoot">' +
      '<button type="button" class="ac-narrow-picker" data-ac-picker="1" aria-haspopup="dialog">' +
      escapeHtml(t('pickAgent')) +
      '</button>' +
      '<aside class="ac-roster" data-ac-roster aria-label="roster"></aside>' +
      '<section class="ac-detail" data-ac-detail aria-live="polite"></section>' +
      '<div class="ac-drawer" id="acDrawer" aria-hidden="true" role="dialog" aria-label="' +
      escapeAttr(t('drawerTitle')) +
      '">' +
      '<div class="ac-drawer-backdrop" data-ac-drawer-close="1"></div>' +
      '<div class="ac-drawer-panel">' +
      '<input class="ac-drawer-search" data-ac-search type="search" placeholder="' +
      escapeAttr(t('drawerSearch')) +
      '" />' +
      '<div data-ac-drawer-roster></div>' +
      '</div></div></div>';
    var drawer = host.querySelector('#acDrawer');
    if (drawer && drawer.parentNode !== document.body) {
      document.body.appendChild(drawer);
    }
    host.removeAttribute('data-ac-bound');
    bind(host);
    if (drawer) {
      drawer.removeAttribute('data-ac-bound');
      bind(drawer);
    }
    refresh(null, { force: true });
  }

  /**
   * Idempotent home roster mount. Safe across Home Focus innerHTML repaints.
   * Does NOT re-hit registry IPC on every paint — only on first mount / hint change / force.
   */
  function mountHome(host, projectHint, opts) {
    opts = opts || {};
    if (!host) return;
    state.mountMode = 'home';
    var sameHost = homeHostEl === host && host.getAttribute('data-ac-home-mounted') === '1';
    var hasShell = !!host.querySelector('[data-har-list]');

    if (sameHost && hasShell) {
      if (host.getAttribute('data-ac-bound') !== '1') bind(host);
      if (opts.force) {
        refresh(projectHint, { force: true });
      } else if (!state.snap) {
        scheduleHomeRefresh(projectHint);
      } else {
        paintHome();
        scheduleHomeRefresh(projectHint);
      }
      return;
    }

    homeHostEl = host;
    host.setAttribute('data-ac-home-mounted', '1');
    host.removeAttribute('data-ac-bound');
    if (!hasShell) {
      host.innerHTML =
        '<div class="har-root" data-har-root>' +
        '<div class="har-head"><h2 class="har-title">' +
        escapeHtml(t('rosterTitle')) +
        '</h2><button type="button" class="har-refresh" data-refresh="1">' +
        escapeHtml(t('refresh')) +
        '</button></div>' +
        '<div class="har-banners" data-har-banners></div>' +
        '<div class="har-list" data-har-list role="list"></div></div>';
    }
    bind(host);
    if (state.snap) paintHome();
    // Defer IPC so Home Focus HTML can paint before EnumWindows/CLI sniff freezes the thread.
    if (opts.force) {
      refresh(projectHint, { force: true });
    } else {
      scheduleHomeRefresh(projectHint);
    }
  }

  function ensureHomeMounted(projectHint, opts) {
    var host = document.getElementById('homeAgentRoster');
    if (!host) return;
    mountHome(host, projectHint, opts || {});
  }

  function mountDemo(host) {
    if (!host) return;
    mount(host);
    applySnap(fixtureSnap());
  }

  function ensureWorkHostVisible(show) {
    var wh = document.getElementById('workHost');
    var dh = document.getElementById('dataHost');
    if (wh) wh.hidden = !show;
    if (dh) dh.hidden = !!show;
  }

  global.OneToneAgentCenter = {
    mount: mount,
    mountHome: mountHome,
    ensureHomeMounted: ensureHomeMounted,
    mountDemo: mountDemo,
    refresh: refresh,
    dispatchAction: dispatchAction,
    ensureWorkHostVisible: ensureWorkHostVisible,
    _fixture: fixtureSnap,
    _humanReason: humanReason,
    _state: state,
    t: t
  };
})(typeof window !== 'undefined' ? window : globalThis);
