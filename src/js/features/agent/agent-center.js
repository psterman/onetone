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
      loadFailed: '暂时无法读取状态',
      loadFailedHint: '检查应用是否在 Tauri 环境运行，或点击重试。',
      showingStale: '正在展示上次成功快照，可能已经过期',
      sessions: '今日会话',
      cost: '成本',
      success: '成功率',
      avgDuration: '平均耗时',
      work: '工作记录',
      actionOk: '已执行',
      actionFail: '操作失败',
      actionAttemptedUnverified: '已发送停止指令，请自行确认',
      actionVerifiedStop: '已确认 Agent 停止',
      actionStopFail: '停止失败',
      oneToneInitiated: '由 OneTone 发起',
      managedLabel: '托管',
      integratedLabel: '已接入',
      observedLabel: '已观察',
      detectedLabel: '已检测',
      probeNotImplemented: '本机检测尚未接入',
      centerPadDiverged: 'Agent Center 状态与 Soft Pad 灯可能不一致',
      evidenceStale: '控制证据已过期',
      titleSource: '标题来源',
      statusSource: '状态来源',
      cwdLabel: '工作目录',
      integrationSummary: '接入摘要',
      observedAt: '最近状态',
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
      recentPrompt: '最近提问',
      recommend: '推荐',
      continueWork: '继续',
      previewBrief: '续作摘要',
      viewWork: '聚焦',
      interruptWork: '停止',
      configWork: '配置',
      dataWork: '查看数据',
      exportWork: '导出',
      syncLabel: '最近同步',
      resumable: '可以继续',
      notResumable: '当前不可继续',
      controlPlaneUnavailable: '当前没有可用的控制证据',
      probeTimeout: 'Claude 探测超时',
      probeCommandFailed: 'Claude 探测失败',
      probeParseError: 'Claude 状态无法解析',
      staleControlEvidence: '控制证据已过期',
      backgroundSessionNotFound: '未找到可中断的后台会话',
      backgroundSessionNotActive: '后台会话未在运行',
      staleObservation: '工作状态已过期',
      stopCommandFailed: '停止命令失败',
      stopTimeout: '停止命令超时',
      stopNotVerified: '停止未得到确认',
      postStopProbeFailed: '停止后状态无法确认',
      noWindowTarget: '窗口不可定位',
      ambiguousSession: '存在多个可能的会话，无法安全操作',
      sessionNotFound: '找不到可操作的会话',
      noMappingTarget: '没有可定位的 Cursor 控制目标',
      noInterruptSession: '缺少可停止的会话目标',
      supportNative: '可确认已停止',
      supportHotkey: '尽力停止',
      supportBestEffort: '尽力停止',
      supportUnsupported: '不支持此操作',
      providerUnsupportedInterrupt: '不支持',
      notWired: '尚未接入',
      presenceAxes: '存在轴',
      actionEvidence: '动作证据',
      evidenceBlock: '状态详情',
      capAvailable: '可用',
      capLimited: '受限',
      capUnavailable: '不可用',
      capUnknown: '未知',
      overviewAria: 'Agent 总览',
      overviewDiscovered: '已发现',
      overviewWorking: '当前工作中',
      overviewVerifiable: '可确认控制',
      overviewBestEffort: '尽力控制',
      overviewUnsupported: '不支持',
      overviewUnknown: '尚未接入',
      overviewByInterrupt: '按控制能力统计',
      overviewConfirmable: '可确认控制',
      overviewBestOnly: '尽力控制',
      overviewSummaryLine: '另有 {notWired} 个尚未接入、{unsupported} 个不支持、{stale} 个状态已过期',
      filterLabel: '筛选',
      filterAll: '全部',
      filterWorking: '正在工作',
      filterVerifiable: '可确认控制',
      filterBestEffort: '尽力控制',
      filterUnsupported: '不支持',
      filterUnknown: '尚未接入',
      filterNotWired: '尚未接入',
      filterStale: '状态过期',
      legendInterrupt: '可确认控制具备后验通道；尽力控制需自行确认；尚未接入≠不支持',
      interruptVerifiable: '可确认停止',
      interruptConfirmablePending: '支持结果确认',
      interruptBestEffort: '尽力停止',
      interruptBestEffortHint: '发送后需要自行确认',
      interruptUnsupported: '不支持',
      interruptUnknown: '本机检测尚未接入',
      interruptUnavailablePrefix: '不可控制',
      interruptNotWiredDetail: '已发现安装，但无法判断工作状态',
      acceptancePendingNote: '当前版本尚未完成真实 Provider 验收',
      acceptanceRealNote: '本版本已完成真实 Provider 验收',
      acceptanceNANote: '尽力控制 — 不适用后验验收',
      detailWhy: '能力依据',
      detailControlMode: '控制方式',
      detailEvidenceSource: '证据来源',
      detailResultConfirm: '结果确认方式',
      detailUnavailableReason: '不可用原因',
      detailAcceptance: '版本验收状态',
      detailConfirmableChannel: '具备后验确认通道',
      detailBestEffortChannel: '热键或窗口命令；无可靠后验确认',
      detailNotWiredExplain: '这不代表 Provider 不支持，只是本机检测尚未接入',
      notWiredCaps: '尚未接入能力',
      evidenceStillValid: '仍然新鲜',
      evidenceExpired: '证据已过期',
      statusInfoExpired: '状态信息已过期',
      evidenceUnconfirmable: '暂时无法确认',
      evidenceRemaining: '还有效约 {n} 秒',
      evidenceSource: '证据来源',
      evidenceConfidence: '置信度',
      evidenceValid: '信息是否新鲜',
      capsBadges: '可以做什么',
      detailWhere: '当前所在项目',
      detailRecent: '最近状态',
      detailFresh: '信息是否新鲜',
      detailStopConfirm: '停止后的确认方式',
      stopConfirmVerified: '停止后会显示确认结果',
      stopConfirmBestEffort: '需要你自己确认',
      stopConfirmUnknown: '接入检测后才能判断',
      canFocus: '可以聚焦',
      cannotFocus: '不能聚焦',
      canContinue: '可以继续',
      cannotContinue: '不能继续',
      canStop: '可以停止',
      cannotStop: '不能停止',
      bestEffortStop: '尽力停止',
      expandAgent: '展开详情',
      collapseAgent: '收起详情',
      rosterIntroInfo: '这里显示电脑上发现的 Agent，以及它们当前能做什么。',
      rosterIntroWarn: '有些 Agent 只能尽力停止，完成后需要你自己确认。'
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
      loadFailed: 'Unable to read status right now',
      loadFailedHint: 'Ensure the app is running under Tauri, then retry.',
      showingStale: 'Showing last successful snapshot; it may be outdated',
      sessions: 'Sessions today',
      cost: 'Cost',
      success: 'Success rate',
      avgDuration: 'Avg duration',
      work: 'Work',
      actionOk: 'Done',
      actionFail: 'Action failed',
      actionAttemptedUnverified: 'Stop sent — please confirm yourself',
      actionVerifiedStop: 'Agent stop confirmed',
      actionStopFail: 'Stop failed',
      oneToneInitiated: 'OneTone initiated',
      managedLabel: 'Managed',
      integratedLabel: 'Integrated',
      observedLabel: 'Observed',
      detectedLabel: 'Detected',
      probeNotImplemented: 'Local detection not wired yet',
      centerPadDiverged: 'Agent Center and Soft Pad lights may disagree',
      evidenceStale: 'Control evidence expired',
      titleSource: 'Title source',
      statusSource: 'Status source',
      cwdLabel: 'Working directory',
      integrationSummary: 'Integration',
      observedAt: 'Recent status',
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
      recentPrompt: 'Recent prompt',
      recommend: 'Recommended',
      continueWork: 'Continue',
      previewBrief: 'Continuation brief',
      viewWork: 'Focus',
      interruptWork: 'Stop',
      configWork: 'Configure',
      dataWork: 'View data',
      exportWork: 'Export',
      syncLabel: 'Last sync',
      resumable: 'Can continue',
      notResumable: 'Cannot continue now',
      controlPlaneUnavailable: 'No usable control evidence',
      probeTimeout: 'Claude probe timed out',
      probeCommandFailed: 'Claude probe failed',
      probeParseError: 'Claude status could not be parsed',
      staleControlEvidence: 'Control evidence expired',
      backgroundSessionNotFound: 'No interruptible background session found',
      backgroundSessionNotActive: 'Background session is not active',
      staleObservation: 'Work observation is stale',
      stopCommandFailed: 'Stop command failed',
      stopTimeout: 'Stop command timed out',
      stopNotVerified: 'Stop was not verified',
      postStopProbeFailed: 'Could not confirm status after stop',
      noWindowTarget: 'Window not addressable',
      ambiguousSession: 'Multiple sessions match; cannot operate safely',
      sessionNotFound: 'No operable session found',
      noMappingTarget: 'No addressable Cursor control target',
      noInterruptSession: 'No interruptible session target',
      supportNative: 'Stop can be confirmed',
      supportHotkey: 'Best-effort stop',
      supportBestEffort: 'Best-effort stop',
      supportUnsupported: 'This action is unsupported',
      providerUnsupportedInterrupt: 'Unsupported',
      notWired: 'Not wired yet',
      presenceAxes: 'Presence',
      actionEvidence: 'Action evidence',
      evidenceBlock: 'Status details',
      capAvailable: 'available',
      capLimited: 'limited',
      capUnavailable: 'unavailable',
      capUnknown: 'unknown',
      overviewAria: 'Agent overview',
      overviewDiscovered: 'Discovered',
      overviewWorking: 'Working now',
      overviewVerifiable: 'Confirmable control',
      overviewBestEffort: 'Best-effort control',
      overviewUnsupported: 'Unsupported',
      overviewUnknown: 'Not wired',
      overviewByInterrupt: 'Counted by control capability',
      overviewConfirmable: 'Confirmable control',
      overviewBestOnly: 'Best-effort control',
      overviewSummaryLine:
        '{notWired} not wired, {unsupported} unsupported, {stale} stale',
      filterLabel: 'Filter',
      filterAll: 'All',
      filterWorking: 'Working now',
      filterVerifiable: 'Confirmable control',
      filterBestEffort: 'Best-effort control',
      filterUnsupported: 'Unsupported',
      filterUnknown: 'Not wired',
      filterNotWired: 'Not wired',
      filterStale: 'Stale',
      legendInterrupt:
        'Confirmable has post-check; best-effort needs your confirm; not wired ≠ unsupported',
      interruptVerifiable: 'Stop can be confirmed',
      interruptConfirmablePending: 'Supports result confirmation',
      interruptBestEffort: 'Best-effort stop',
      interruptBestEffortHint: 'Confirm yourself after sending',
      interruptUnsupported: 'Unsupported',
      interruptUnknown: 'Local detection not wired yet',
      interruptUnavailablePrefix: 'Not controllable',
      interruptNotWiredDetail: 'Installed, but work status cannot be judged',
      acceptancePendingNote: 'This release has not completed real Provider acceptance',
      acceptanceRealNote: 'Real Provider acceptance completed for this release',
      acceptanceNANote: 'Best-effort only — post-check N/A',
      detailWhy: 'Capability basis',
      detailControlMode: 'Control mode',
      detailEvidenceSource: 'Evidence source',
      detailResultConfirm: 'How results are confirmed',
      detailUnavailableReason: 'Unavailable reason',
      detailAcceptance: 'Release acceptance',
      detailConfirmableChannel: 'Post-check channel available',
      detailBestEffortChannel: 'Hotkey/window command; no reliable post-check',
      detailNotWiredExplain:
        'Does not mean the provider is unsupported — detection is not wired yet',
      notWiredCaps: 'Not-wired capabilities',
      evidenceStillValid: 'Still fresh',
      evidenceExpired: 'Evidence expired',
      statusInfoExpired: 'Status info expired',
      evidenceUnconfirmable: 'Cannot confirm yet',
      evidenceRemaining: 'About {n}s still valid',
      evidenceSource: 'Evidence source',
      evidenceConfidence: 'Confidence',
      evidenceValid: 'Is this info fresh',
      capsBadges: 'What you can do',
      detailWhere: 'Current project',
      detailRecent: 'Recent status',
      detailFresh: 'Is this info fresh',
      detailStopConfirm: 'How stop is confirmed',
      stopConfirmVerified: 'Result will be confirmed after stop',
      stopConfirmBestEffort: 'Please confirm yourself',
      stopConfirmUnknown: 'Available after local detection is wired',
      canFocus: 'Can focus',
      cannotFocus: 'Cannot focus',
      canContinue: 'Can continue',
      cannotContinue: 'Cannot continue',
      canStop: 'Can stop',
      cannotStop: 'Cannot stop',
      bestEffortStop: 'Best-effort stop',
      expandAgent: 'Expand details',
      collapseAgent: 'Collapse details',
      rosterIntroInfo: 'Agents discovered on this machine and what you can do with them.',
      rosterIntroWarn: 'Some agents can only best-effort stop — please confirm yourself afterward.'
    }
  };

  var state = {
    snap: null,
    selectedId: null,
    expandedId: null,
    mountMode: 'page',
    showNotFound: false,
    homeFilter: 'all',
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
    var want = String(id || '');
    if (!want) return null;
    var agents = (state.snap && state.snap.agents) || [];
    for (var i = 0; i < agents.length; i++) {
      if (String(agents[i].agentId || '') === want) return agents[i];
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
    if (c === 'evidence_stale' || c === 'stale_control_evidence') return t('evidenceStale');
    if (c === 'background_session_not_found') return t('backgroundSessionNotFound');
    if (c === 'background_session_not_active') return t('backgroundSessionNotActive');
    if (c === 'stop_command_failed') return t('stopCommandFailed');
    if (c === 'stop_timeout') return t('stopTimeout');
    if (c === 'stop_not_verified') return t('stopNotVerified');
    if (c === 'post_stop_probe_failed') return t('postStopProbeFailed');
    if (c === 'ProbeNotImplemented' || c === 'probe_not_implemented') return t('probeNotImplemented');
    if (c === 'center_pad_may_diverge') return t('centerPadDiverged');
    if (c === 'ambiguous_session') return t('ambiguousSession');
    if (c === 'session_not_found') return t('sessionNotFound');
    if (c === 'no_window_target') return t('noWindowTarget');
    if (c === 'no_mapping_target') return t('noMappingTarget');
    if (c === 'not_wired') return t('notWired');
    if (c === 'provider_unsupported') return t('providerUnsupportedInterrupt');
    if (
      c === 'no_focus_executor' ||
      c === 'action_not_enabled' ||
      c === 'no_executor' ||
      c === 'unknown_action' ||
      c === 'no_instance_evidence' ||
      c === 'no_focus_target'
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

  function humanActionReason(code, actionId) {
    var c = String(code || '');
    var id = String(actionId || '');
    if (c === 'no_external_session') {
      if (id === 'session.resume' || id === 'resume') return t('notResumable');
      if (id === 'agent.interrupt' || id === 'interrupt') return t('noInterruptSession');
    }
    if (c === 'no_window_target') return t('noWindowTarget');
    if (c === 'ambiguous_session') return t('ambiguousSession');
    if (c === 'session_not_found') return t('sessionNotFound');
    if (c === 'no_mapping_target') return t('noMappingTarget');
    if (c === 'control_plane_unavailable') return t('controlPlaneUnavailable');
    if (c === 'evidence_stale' || c === 'stale_control_evidence') return t('evidenceStale');
    if (c === 'not_running') return t('idle');
    if (c === 'stale_observation') return t('staleObservation');
    if (c === 'probe_timeout') return t('probeTimeout');
    if (c === 'probe_command_failed') return t('probeCommandFailed');
    if (c === 'probe_parse_error') return t('probeParseError');
    if (c === 'background_session_not_found') return t('backgroundSessionNotFound');
    if (c === 'background_session_not_active') return t('backgroundSessionNotActive');
    if (c === 'provider_unsupported') return t('providerUnsupportedInterrupt');
    if (c === 'ProbeNotImplemented' || c === 'probe_not_implemented') return t('probeNotImplemented');
    if (c === 'not_wired') return t('notWired');
    if (c === 'no_focus_executor' || c === 'no_focus_target' || c === 'no_focus') return t('actionUnavailable');
    if (c === 'no_lane' || c === 'no_resume') return t('notResumable');
    if (c === 'no_checkpoint') return t('actionUnavailable');
    var mapped = humanReason(c);
    // Never surface raw snake_case for action UI.
    if (mapped === c && /_/.test(c)) return t('actionUnavailable');
    return mapped;
  }

  function supportLabel(support, enabled, state) {
    var s = String(support || '').toLowerCase();
    if (s === 'native' && enabled && state === 'available') return t('supportNative');
    if (s === 'hotkey') return t('supportHotkey');
    if (s === 'workflow' || s === 'deeplink' || s === 'insertonly') return t('supportBestEffort');
    if (s === 'unsupported' || !support) return t('supportUnsupported');
    return t('supportBestEffort');
  }

  function formatEvidenceField(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && isFinite(v)) return String(v);
    if (typeof v === 'string' && v.trim()) return v.trim();
    return '';
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
    if (agent.recentPrompt) return agent.recentPrompt;
    if (agent.title) return agent.title;
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

  /** Interrupt capability bucket — NOT action outcome. Missing evidence → unknown. */
  function findInterruptAction(agent) {
    var acts = (agent && agent.actions) || [];
    for (var i = 0; i < acts.length; i++) {
      if (acts[i] && acts[i].id === 'agent.interrupt') return acts[i];
    }
    return null;
  }

  function classifyInterrupt(act) {
    if (!act || act.id !== 'agent.interrupt') return null;
    var reason = String(act.reason || '');
    if (reason === 'provider_unsupported') return 'unsupported';
    if (reason === 'ProbeNotImplemented' || reason === 'probe_not_implemented') return 'unknown';
    var support = String(act.support || '').toLowerCase();
    var st = String(act.state || '').toLowerCase();
    if (support === 'unsupported') return 'unsupported';
    if (support === 'native' && st === 'available') return 'verifiable';
    if (support === 'hotkey' && st === 'available') return 'bestEffort';
    return 'unknown';
  }

  function isWorkingObserved(agent, asOf) {
    var obs = agent && agent.observedStatus;
    if (!obs || obs.value !== 'working') return false;
    var base = Number(asOf);
    var freshUntil = Number(obs.freshUntil);
    if (!isFinite(base) || base <= 0) return false;
    if (!isFinite(freshUntil) || freshUntil <= 0) return false;
    return freshUntil >= base;
  }

  function getAcceptanceManifest() {
    return (
      state._acceptanceManifest ||
      global.OneToneAgentControlAcceptance || {
        schemaVersion: 1,
        release: 'fallback',
        providers: {
          claude: { status: 'pending' },
          codex: { status: 'pending' },
          cursor: { status: 'notApplicable', reason: 'bestEffortOnly' }
        }
      }
    );
  }

  function setAcceptanceManifest(m) {
    state._acceptanceManifest = m || null;
  }

  function providerKeyOf(agent) {
    var raw = String(
      (agent && (agent.runtimeKind || agent.agentId || agent.displayName)) || ''
    ).toLowerCase();
    if (raw.indexOf('claude') >= 0) return 'claude';
    if (raw.indexOf('codex') >= 0) return 'codex';
    if (raw.indexOf('cursor') >= 0) return 'cursor';
    return 'other';
  }

  function freshnessOf(agent, act, asOf) {
    var fu = Number(
      (act && act.freshUntil) ||
        (agent && agent.observedStatus && agent.observedStatus.freshUntil)
    );
    var base = Number(asOf);
    if (!isFinite(fu) || fu <= 0 || !isFinite(base) || base <= 0) return 'unknown';
    return fu >= base ? 'fresh' : 'stale';
  }

  function availabilityReasonOf(act, freshness) {
    if (!act) return 'notWired';
    var reason = String(act.reason || '');
    if (reason === 'provider_unsupported') return 'unsupported';
    if (reason === 'ProbeNotImplemented' || reason === 'probe_not_implemented') return 'notWired';
    if (reason === 'evidence_stale' || reason === 'stale_control_evidence') return 'stale';
    if (reason === 'no_window_target') return 'noTarget';
    if (reason === 'no_mapping_target') return 'noMapping';
    if (freshness === 'stale') return 'stale';
    var support = String(act.support || '').toLowerCase();
    if (support === 'unsupported') return 'unsupported';
    var bucket = classifyInterrupt(act);
    if (bucket === 'unknown' || bucket === null) return 'notWired';
    return null;
  }

  function acceptanceOf(providerKey, manifest) {
    var m = manifest || getAcceptanceManifest();
    var entry = (m.providers && m.providers[providerKey]) || null;
    if (!entry) return 'notApplicable';
    var st = String(entry.status || '');
    if (st === 'realVerified' || st === 'verified') return 'realVerified';
    if (st === 'pending' || st === 'pendingRealVerify') return 'pendingRealVerify';
    return 'notApplicable';
  }

  function reasonUserLabel(reason) {
    if (reason === 'notWired') return t('interruptUnknown');
    if (reason === 'unsupported') return t('providerUnsupportedInterrupt');
    if (reason === 'stale') return t('statusInfoExpired');
    if (reason === 'noTarget') return t('noWindowTarget');
    if (reason === 'noMapping') return t('noMappingTarget');
    return '';
  }

  /**
   * Single UI projection — overview / filter / row / detail must all use this.
   * Acceptance never changes controlMode; only primaryLabel / detail copy.
   */
  function projectAgentControl(agent, snap, acceptanceManifest) {
    var asOf = snap && snap.asOf;
    var act = findInterruptAction(agent);
    var pk = providerKeyOf(agent);
    var fres = freshnessOf(agent, act, asOf);
    var bucket = classifyInterrupt(act);
    var controlMode = 'unavailable';
    if (pk === 'cursor') {
      // Only a real usable Cursor interrupt is bestEffort — never inflate the card
      // for no action / unsupported / no mapping / stale / disabled.
      var cursorUsable =
        act &&
        act.supported !== false &&
        act.enabled &&
        bucket === 'bestEffort' &&
        fres !== 'stale' &&
        String(act.reason || '') !== 'evidence_stale' &&
        String(act.reason || '') !== 'stale_control_evidence';
      controlMode = cursorUsable ? 'bestEffort' : 'unavailable';
    } else if (bucket === 'verifiable') {
      controlMode = 'confirmable';
    } else if (bucket === 'bestEffort') {
      controlMode = 'bestEffort';
    } else {
      controlMode = 'unavailable';
    }
    var reason =
      controlMode === 'unavailable'
        ? availabilityReasonOf(act, fres)
        : fres === 'stale' && act && (act.reason === 'evidence_stale' || act.reason === 'stale_control_evidence')
          ? 'stale'
          : null;
    // Stale evidence on an otherwise confirmable/bestEffort action → still show mode but reason for disable paths
    if (
      controlMode !== 'unavailable' &&
      (String((act && act.reason) || '') === 'evidence_stale' ||
        String((act && act.reason) || '') === 'stale_control_evidence' ||
        fres === 'stale')
    ) {
      // Keep controlMode; expose stale as reason for filter 'stale'
      if (!reason) reason = 'stale';
    }
    if (controlMode === 'unavailable' && !reason) reason = 'notWired';

    var acceptance = acceptanceOf(pk, acceptanceManifest || getAcceptanceManifest());
    if (pk === 'cursor') acceptance = 'notApplicable';

    var primaryLabel = '';
    var supportingText = '';
    if (controlMode === 'confirmable') {
      if (acceptance === 'pendingRealVerify') {
        primaryLabel = t('interruptConfirmablePending');
        supportingText = t('detailConfirmableChannel');
      } else {
        primaryLabel = t('interruptVerifiable');
        supportingText = t('detailConfirmableChannel');
      }
    } else if (controlMode === 'bestEffort') {
      primaryLabel = t('interruptBestEffort');
      supportingText = t('interruptBestEffortHint');
    } else {
      primaryLabel = t('interruptUnavailablePrefix') + ' · ' + reasonUserLabel(reason);
      if (reason === 'notWired') supportingText = t('interruptNotWiredDetail');
      else if (reason === 'unsupported') supportingText = t('providerUnsupportedInterrupt');
      else supportingText = reasonUserLabel(reason);
    }

    return {
      controlMode: controlMode,
      reason: reason,
      working: isWorkingObserved(agent, asOf),
      freshness: fres,
      acceptance: acceptance,
      primaryLabel: primaryLabel,
      supportingText: supportingText,
      providerKey: pk
    };
  }

  function agentsFromSnap(snap, includeNotFound) {
    if (!snap) return [];
    var map = {};
    (snap.agents || []).forEach(function (a) {
      if (a && a.agentId) map[a.agentId] = a;
    });
    var g = snap.groups || {};
    var ids = []
      .concat(g.needsAttention || [])
      .concat(g.connected || [])
      .concat(g.discoveredLimited || [])
      .concat(includeNotFound ? g.supportedNotFound || [] : []);
    var seen = {};
    var out = [];
    ids.forEach(function (id) {
      if (seen[id]) return;
      seen[id] = 1;
      if (map[id]) out.push(map[id]);
    });
    return out;
  }

  /**
   * Overview — four cards; unsupported/notWired/stale only in summary line.
   * Never merge bestEffort with unknown.
   */
  function computeHomeOverview(snap, opts) {
    opts = opts || {};
    var agents = agentsFromSnap(snap, !!opts.includeNotFound);
    var overview = {
      discovered: agents.length,
      working: 0,
      confirmable: 0,
      bestEffort: 0,
      notWired: 0,
      unsupported: 0,
      stale: 0,
      // compat aliases for older tests
      verifiableInterrupt: 0,
      bestEffortInterrupt: 0,
      unsupportedInterrupt: 0,
      unknownInterrupt: 0
    };
    agents.forEach(function (a) {
      var p = projectAgentControl(a, snap);
      if (p.working) overview.working += 1;
      if (p.controlMode === 'confirmable') {
        overview.confirmable += 1;
        overview.verifiableInterrupt += 1;
      } else if (p.controlMode === 'bestEffort') {
        overview.bestEffort += 1;
        overview.bestEffortInterrupt += 1;
      } else if (p.reason === 'unsupported') {
        overview.unsupported += 1;
        overview.unsupportedInterrupt += 1;
      } else if (p.reason === 'stale') {
        overview.stale += 1;
        overview.unknownInterrupt += 1;
      } else {
        overview.notWired += 1;
        overview.unknownInterrupt += 1;
      }
      if (
        p.reason === 'stale' &&
        (p.controlMode === 'confirmable' || p.controlMode === 'bestEffort')
      ) {
        overview.stale += 1;
      }
    });
    return overview;
  }

  function matchesHomeFilter(agent, filter, snap) {
    var f = String(filter || 'all');
    if (f === 'all') return true;
    var p = projectAgentControl(agent, snap);
    if (f === 'working') return p.working;
    if (f === 'verifiable' || f === 'confirmable') return p.controlMode === 'confirmable';
    if (f === 'bestEffort') return p.controlMode === 'bestEffort';
    if (f === 'unsupported') return p.reason === 'unsupported';
    if (f === 'unknown' || f === 'notWired') {
      return p.controlMode === 'unavailable' && p.reason === 'notWired';
    }
    if (f === 'stale') return p.reason === 'stale';
    return true;
  }

  function formatEvidenceFreshness(opts) {
    opts = opts || {};
    var unconfirmable = t('evidenceUnconfirmable');
    var expired = t('evidenceExpired');
    var base = Number(opts.asOf);
    var obsN = Number(opts.observedAt);
    var fuN = Number(opts.freshUntil);
    var hasBase = isFinite(base) && base > 0;
    var hasObs = isFinite(obsN) && obsN > 0;
    var hasFu = isFinite(fuN) && fuN > 0;
    var result = {
      observedLabel: hasObs ? relativeWhen(obsN) : unconfirmable,
      validLabel: unconfirmable,
      remainingLabel: unconfirmable,
      sourceLabel: opts.source ? String(opts.source) : unconfirmable,
      confidenceLabel: opts.confidence ? String(opts.confidence) : unconfirmable,
      expired: false
    };
    if (!hasBase || !hasFu) return result;
    if (fuN <= base) {
      result.validLabel = expired;
      result.remainingLabel = expired;
      result.expired = true;
      return result;
    }
    var secs = Math.max(0, Math.floor((fuN - base) / 1000));
    result.validLabel = t('evidenceStillValid');
    result.remainingLabel = String(t('evidenceRemaining') || '').replace('{n}', String(secs));
    return result;
  }

  function interruptCapabilityLabel(bucket) {
    if (bucket === 'verifiable') return t('interruptVerifiable');
    if (bucket === 'bestEffort') return t('interruptBestEffort');
    if (bucket === 'unsupported') return t('interruptUnsupported');
    return t('interruptUnknown');
  }

  function projectNameOf(agent) {
    var cw = agent && agent.currentWork;
    if (cw) {
      var project = String(cw.projectName || cw.project || cw.displayName || '').trim();
      if (project) return project;
    }
    if (agent && agent.cwd) {
      var parts = String(agent.cwd).replace(/[\\/]+$/, '').split(/[\\/]/);
      var leaf = parts[parts.length - 1];
      if (leaf) return leaf;
    }
    return '';
  }

  function interruptSubline(agent) {
    var p = projectAgentControl(agent, state.snap);
    return p.primaryLabel;
  }

  function stopConfirmCopy(bucket) {
    if (bucket === 'verifiable') return t('stopConfirmVerified');
    if (bucket === 'bestEffort') return t('stopConfirmBestEffort');
    if (bucket === 'unsupported') return t('supportUnsupported');
    return t('stopConfirmUnknown');
  }

  function actionBadgeTone(act) {
    var reason = String((act && act.reason) || '');
    if (reason === 'evidence_stale' || reason === 'stale_control_evidence') return 'stale';
    if (act && act.id === 'agent.interrupt') {
      var b = classifyInterrupt(act);
      if (b === 'verifiable') return 'verifiable';
      if (b === 'bestEffort') return 'bestEffort';
      if (b === 'unsupported') return 'unsupported';
      return 'unknown';
    }
    var support = String((act && act.support) || '').toLowerCase();
    var st = String((act && act.state) || '').toLowerCase();
    if (support === 'native' && st === 'available') return 'verifiable';
    if (support === 'hotkey' && st === 'available') return 'bestEffort';
    if (reason === 'provider_unsupported' || support === 'unsupported') return 'unsupported';
    return 'unknown';
  }

  function actionBadgeText(act) {
    var reason = String((act && act.reason) || '');
    if (act && act.id === 'agent.interrupt') {
      var bucket = classifyInterrupt(act);
      if (reason === 'evidence_stale' || reason === 'stale_control_evidence') {
        return t('bestEffortStop') + ' · ' + t('evidenceStale');
      }
      if (bucket === 'verifiable') return t('supportNative');
      if (bucket === 'bestEffort') return t('bestEffortStop');
      if (bucket === 'unsupported') return t('supportUnsupported');
      if (reason === 'ProbeNotImplemented' || reason === 'probe_not_implemented') {
        return t('probeNotImplemented');
      }
      return t('interruptUnknown');
    }
    var label = actionLabel(act);
    if (reason === 'evidence_stale' || reason === 'stale_control_evidence') {
      return label + ' · ' + t('evidenceStale');
    }
    if (reason === 'no_window_target') return label + ' · ' + t('noWindowTarget');
    if (reason === 'no_mapping_target') return label + ' · ' + t('noMappingTarget');
    if (reason === 'provider_unsupported') return label + ' · ' + t('supportUnsupported');
    if (reason === 'ProbeNotImplemented' || reason === 'probe_not_implemented') {
      return label + ' · ' + t('probeNotImplemented');
    }
    if (act && act.enabled) {
      if (act.id === 'agent.focus' || act.id === 'view' || act.id === 'focus') return t('canFocus');
      if (act.id === 'session.resume' || act.id === 'resume') return t('canContinue');
      return label;
    }
    if (act && act.id === 'agent.focus') return t('cannotFocus');
    if (act && act.id === 'session.resume') return t('cannotContinue');
    return label + ' · ' + t('capUnknown');
  }

  function orderedHomeAgents() {
    if (!state.snap) return [];
    var fromGroups = agentsFromSnap(state.snap, !!state.showNotFound);
    if (fromGroups.length) return fromGroups;
    // Fallback: groups empty/mismatched but agents payload present.
    return ((state.snap.agents || []) || []).filter(function (a) {
      return !!(a && a.agentId);
    });
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

  function homeActionButtons(agent, opts) {
    opts = opts || {};
    var rowOnly = !!opts.rowOnly;
    var acts = Array.isArray(agent && agent.actions) ? agent.actions : [];
    function find(id) {
      for (var i = 0; i < acts.length; i++) {
        if (acts[i] && acts[i].id === id) return acts[i];
      }
      return null;
    }
    var order = rowOnly
      ? ['agent.focus', 'session.resume', 'agent.interrupt']
      : [
          'session.resume',
          'checkpoint.preview',
          'agent.focus',
          'agent.interrupt',
          'ui.open_config',
          'ui.open_data'
        ];
    var html = '';
    order.forEach(function (id) {
      var act = find(id);
      if (!act) {
        if (!rowOnly) return;
        html +=
          '<button type="button" class="har-action' +
          (id === 'agent.interrupt' ? ' har-action--stop' : '') +
          '" disabled title="' +
          escapeAttr(t('actionUnavailable')) +
          '">' +
          escapeHtml(
            id === 'agent.focus'
              ? t('viewWork')
              : id === 'session.resume'
                ? t('continueWork')
                : t('interruptWork')
          ) +
          '</button>';
        return;
      }
      if (id === 'agent.interrupt' && !act.supported && !rowOnly) return;
      var pending = state.pendingAction === id + ':' + agent.agentId;
      var disabled = !act.enabled || pending || (id === 'agent.interrupt' && !act.supported);
      var title = act.enabled
        ? ''
        : humanActionReason(act.reason, act.id) || t('actionUnavailable');
      var reasonLine = act.enabled
        ? ''
        : humanActionReason(act.reason, act.id) || '';
      html +=
        '<button type="button" class="har-action' +
        (id === 'session.resume' && act.enabled && !rowOnly ? ' is-primary' : '') +
        (id === 'agent.interrupt' ? ' har-action--stop' : '') +
        '" data-action="' +
        escapeAttr(id) +
        '" data-agent-id="' +
        escapeAttr(agent.agentId) +
        '"' +
        (disabled ? ' disabled' : '') +
        (title
          ? ' title="' +
            escapeAttr(title) +
            '" aria-label="' +
            escapeAttr(actionLabel(act) + '：' + title) +
            '"'
          : '') +
        '>' +
        escapeHtml(pending ? t('pending') : actionLabel(act)) +
        '</button>';
      if (reasonLine && !rowOnly) {
        html +=
          '<span class="har-action-reason" data-action-reason="' +
          escapeAttr(id) +
          '">' +
          escapeHtml(reasonLine) +
          '</span>';
      }
    });
    return html;
  }

  function renderHomeDetail(agent) {
    var interruptAct = findInterruptAction(agent);
    var bucket = classifyInterrupt(interruptAct);
    var proj = projectAgentControl(agent, state.snap);
    var focusAct = (agent.actions || []).filter(function (x) {
      return x && (x.id === 'agent.focus' || x.id === 'focus' || x.id === 'view');
    })[0];
    var resumeAct = (agent.actions || []).filter(function (x) {
      return x && (x.id === 'session.resume' || x.id === 'resume');
    })[0];
    var asOf = state.snap && state.snap.asOf;
    var fres = formatEvidenceFreshness({
      observedAt:
        (interruptAct && interruptAct.observedAt) ||
        (agent.observedStatus && agent.observedStatus.observedAt),
      freshUntil:
        (interruptAct && interruptAct.freshUntil) ||
        (agent.observedStatus && agent.observedStatus.freshUntil),
      asOf: asOf
    });
    var project = projectNameOf(agent) || t('noProjectWork');
    var html = '<div class="har-detail">';
    html += '<div class="har-metrics">';
    html +=
      '<div class="har-metric"><span>' +
      escapeHtml(t('detailWhere')) +
      '</span><strong>' +
      escapeHtml(project) +
      '</strong></div>';
    html +=
      '<div class="har-metric"><span>' +
      escapeHtml(t('detailRecent')) +
      '</span><strong>' +
      escapeHtml(statusLabel(agent) + (fres.observedLabel ? ' · ' + fres.observedLabel : '')) +
      '</strong></div>';
    html +=
      '<div class="har-metric"><span>' +
      escapeHtml(t('detailFresh')) +
      '</span><strong>' +
      escapeHtml(fres.remainingLabel) +
      '</strong></div>';
    html += '</div>';

    if (agent.recentPrompt) {
      html +=
        '<p class="har-note"><strong>' +
        escapeHtml(t('recentPrompt')) +
        '</strong>：' +
        escapeHtml(agent.recentPrompt) +
        '</p>';
    }

    var badgeActs = (agent.actions || []).filter(function (act) {
      return (
        act &&
        (act.id === 'agent.interrupt' || act.id === 'agent.focus' || act.id === 'session.resume')
      );
    });
    if (badgeActs.length) {
      html += '<h3 class="har-detail-h">' + escapeHtml(t('capsBadges')) + '</h3>';
      html += '<div class="har-badges">';
      badgeActs.forEach(function (act) {
        html +=
          '<span class="har-badge har-badge--' +
          escapeAttr(actionBadgeTone(act)) +
          '">' +
          escapeHtml(actionBadgeText(act)) +
          '</span>';
      });
      html += '</div>';
    }

    // Capability basis ("为什么") — user-facing; no raw enums
    var controlModeLabel =
      proj.controlMode === 'confirmable'
        ? t('overviewConfirmable')
        : proj.controlMode === 'bestEffort'
          ? t('overviewBestOnly')
          : t('interruptUnavailablePrefix');
    var resultConfirmLabel =
      proj.controlMode === 'confirmable'
        ? t('detailConfirmableChannel')
        : proj.controlMode === 'bestEffort'
          ? t('detailBestEffortChannel')
          : reasonUserLabel(proj.reason) || t('cannotStop');
    var acceptanceLabel =
      proj.acceptance === 'realVerified'
        ? t('acceptanceRealNote')
        : proj.acceptance === 'pendingRealVerify'
          ? t('acceptancePendingNote')
          : t('acceptanceNANote');
    var srcLabel =
      (interruptAct && interruptAct.source) ||
      (agent.observedStatus && agent.observedStatus.source) ||
      (agent.statusSource || '') ||
      '—';
    html += '<h3 class="har-detail-h">' + escapeHtml(t('detailWhy')) + '</h3>';
    html += '<table class="har-evidence har-why"><tbody>';
    html +=
      '<tr><td>' +
      escapeHtml(t('detailControlMode')) +
      '</td><td>' +
      escapeHtml(controlModeLabel) +
      '</td></tr>';
    html +=
      '<tr><td>' +
      escapeHtml(t('detailEvidenceSource')) +
      '</td><td>' +
      escapeHtml(String(srcLabel)) +
      '</td></tr>';
    html +=
      '<tr><td>' +
      escapeHtml(t('detailRecent')) +
      '</td><td>' +
      escapeHtml(fres.observedLabel || '—') +
      '</td></tr>';
    html +=
      '<tr><td>' +
      escapeHtml(t('detailFresh')) +
      '</td><td>' +
      escapeHtml(fres.remainingLabel) +
      '</td></tr>';
    html +=
      '<tr><td>' +
      escapeHtml(t('detailResultConfirm')) +
      '</td><td>' +
      escapeHtml(resultConfirmLabel) +
      '</td></tr>';
    if (proj.controlMode === 'unavailable' && proj.reason) {
      html +=
        '<tr><td>' +
        escapeHtml(t('detailUnavailableReason')) +
        '</td><td>' +
        escapeHtml(reasonUserLabel(proj.reason)) +
        '</td></tr>';
    }
    html +=
      '<tr><td>' +
      escapeHtml(t('detailAcceptance')) +
      '</td><td>' +
      escapeHtml(acceptanceLabel) +
      '</td></tr>';
    if (proj.reason === 'notWired') {
      html +=
        '<tr><td colspan="2">' +
        escapeHtml(t('detailNotWiredExplain')) +
        '</td></tr>';
    }
    html += '</tbody></table>';

    html += '<h3 class="har-detail-h">' + escapeHtml(t('evidenceBlock')) + '</h3>';
    html += '<table class="har-evidence"><tbody>';
    html +=
      '<tr><td>' +
      escapeHtml(t('canFocus')) +
      '</td><td>' +
      escapeHtml(
        focusAct && focusAct.enabled
          ? t('canFocus')
          : humanActionReason(focusAct && focusAct.reason, 'agent.focus') || t('cannotFocus')
      ) +
      '</td></tr>';
    html +=
      '<tr><td>' +
      escapeHtml(t('canContinue')) +
      '</td><td>' +
      escapeHtml(
        resumeAct && resumeAct.enabled
          ? t('canContinue')
          : humanActionReason(resumeAct && resumeAct.reason, 'session.resume') || t('cannotContinue')
      ) +
      '</td></tr>';
    html +=
      '<tr><td>' +
      escapeHtml(t('canStop')) +
      '</td><td>' +
      escapeHtml(proj.primaryLabel) +
      '</td></tr>';
    html += '</tbody></table>';

    // not_wired capabilities — read-only list, no clickable buttons
    var notWiredActs = (agent.actions || []).filter(function (act) {
      return (
        act &&
        (act.id === 'export_history' || act.id === 'disable_source') &&
        String(act.reason || '') === 'not_wired'
      );
    });
    if (notWiredActs.length) {
      html += '<h3 class="har-detail-h">' + escapeHtml(t('notWiredCaps')) + '</h3>';
      html += '<ul class="har-not-wired">';
      notWiredActs.forEach(function (act) {
        html +=
          '<li>' +
          escapeHtml(actionLabel(act) || act.id) +
          ' · ' +
          escapeHtml(t('notWired')) +
          '</li>';
      });
      html += '</ul>';
    }

    if (agent.limitations && agent.limitations.length) {
      var lim = agent.limitations
        .map(function (x) {
          return humanReason((x && (x.code || x.detail)) || '') || '';
        })
        .filter(Boolean)
        .slice(0, 3);
      if (lim.length) {
        html += '<p class="har-note">' + escapeHtml(lim.join(' · ')) + '</p>';
      }
    }

    html +=
      '<div class="har-detail-foot"><span>' +
      escapeHtml(proj.supportingText || stopConfirmCopy(bucket)) +
      '</span></div>';
    html += '</div>';
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
        '<div class="har-overview" data-har-overview aria-label="' +
        escapeAttr(t('overviewAria')) +
        '"></div>' +
        '<div class="har-toolbar" data-har-toolbar></div>' +
        '<div class="har-list" data-har-list role="list"></div></div>';
    }
    var banners = root.querySelector('[data-har-banners]');
    var overviewEl = root.querySelector('[data-har-overview]');
    var toolbarEl = root.querySelector('[data-har-toolbar]');
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
    if (!state.error && state.snap) {
      bhtml +=
        '<div class="har-banner har-banner--info" role="status">' +
        escapeHtml(t('rosterIntroInfo')) +
        '</div>' +
        '<div class="har-banner har-banner--warn" role="status">' +
        escapeHtml(t('rosterIntroWarn')) +
        '</div>';
    }
    banners.innerHTML = bhtml;

    if (!state.snap) {
      if (overviewEl) overviewEl.innerHTML = '';
      if (toolbarEl) toolbarEl.innerHTML = '';
      list.innerHTML = state.error
        ? ''
        : '<p class="har-empty">' + escapeHtml(t('initializing')) + '</p>';
      return;
    }

    var overview = computeHomeOverview(state.snap, { includeNotFound: state.showNotFound });
    if (overviewEl) {
      var summary = String(t('overviewSummaryLine') || '')
        .replace('{notWired}', String(overview.notWired || 0))
        .replace('{unsupported}', String(overview.unsupported || 0))
        .replace('{stale}', String(overview.stale || 0));
      overviewEl.innerHTML =
        '<div class="har-stat"><strong>' +
        escapeHtml(String(overview.discovered)) +
        '</strong><span>' +
        escapeHtml(t('overviewDiscovered')) +
        '</span></div>' +
        '<div class="har-stat har-stat--working"><strong>' +
        escapeHtml(String(overview.working)) +
        '</strong><span>' +
        escapeHtml(t('overviewWorking')) +
        '</span></div>' +
        '<div class="har-stat har-stat--confirmable"><strong>' +
        escapeHtml(String(overview.confirmable)) +
        '</strong><span>' +
        escapeHtml(t('overviewConfirmable')) +
        '<small>' +
        escapeHtml(t('overviewByInterrupt')) +
        '</small></span></div>' +
        '<div class="har-stat har-stat--best"><strong>' +
        escapeHtml(String(overview.bestEffort)) +
        '</strong><span>' +
        escapeHtml(t('overviewBestOnly')) +
        '<small>' +
        escapeHtml(t('interruptBestEffortHint')) +
        '</small></span></div>' +
        '<p class="har-overview-summary" data-har-summary>' +
        escapeHtml(summary) +
        '</p>';
    }

    if (toolbarEl) {
      var f = state.homeFilter || 'all';
      toolbarEl.innerHTML =
        '<div class="har-legend">' +
        escapeHtml(t('legendInterrupt')) +
        '</div>' +
        '<label class="har-filter"><span>' +
        escapeHtml(t('filterLabel')) +
        '</span><select data-har-filter>' +
        '<option value="all"' +
        (f === 'all' ? ' selected' : '') +
        '>' +
        escapeHtml(t('filterAll') + ' (' + overview.discovered + ')') +
        '</option>' +
        '<option value="working"' +
        (f === 'working' ? ' selected' : '') +
        '>' +
        escapeHtml(t('filterWorking') + ' (' + overview.working + ')') +
        '</option>' +
        '<option value="confirmable"' +
        (f === 'confirmable' || f === 'verifiable' ? ' selected' : '') +
        '>' +
        escapeHtml(t('filterVerifiable') + ' (' + overview.confirmable + ')') +
        '</option>' +
        '<option value="bestEffort"' +
        (f === 'bestEffort' ? ' selected' : '') +
        '>' +
        escapeHtml(t('filterBestEffort') + ' (' + overview.bestEffort + ')') +
        '</option>' +
        '<option value="notWired"' +
        (f === 'notWired' || f === 'unknown' ? ' selected' : '') +
        '>' +
        escapeHtml(t('filterNotWired') + ' (' + overview.notWired + ')') +
        '</option>' +
        '<option value="unsupported"' +
        (f === 'unsupported' ? ' selected' : '') +
        '>' +
        escapeHtml(t('filterUnsupported') + ' (' + overview.unsupported + ')') +
        '</option>' +
        '<option value="stale"' +
        (f === 'stale' ? ' selected' : '') +
        '>' +
        escapeHtml(t('filterStale') + ' (' + overview.stale + ')') +
        '</option>' +
        '</select></label>';
    }

    var agents = orderedHomeAgents().filter(function (a) {
      return matchesHomeFilter(a, state.homeFilter, state.snap);
    });
    if (!agents.length) {
      list.innerHTML = '<p class="har-empty">' + escapeHtml(t('readyEmpty')) + '</p>';
      return;
    }
    var html = '';
    agents.forEach(function (a) {
      try {
        var open = state.expandedId === a.agentId;
        var needsMark = needs.indexOf(a.agentId) >= 0;
        var project = projectNameOf(a) || workLine(a) || '—';
        var proj = projectAgentControl(a, state.snap);
        html +=
          '<article class="har-row' +
          (open ? ' is-open' : '') +
          '" data-agent-row="' +
          escapeAttr(a.agentId) +
          '" data-control-mode="' +
          escapeAttr(proj.controlMode) +
          '" role="listitem">' +
          '<div class="har-row-main">' +
          '<div class="har-identity">' +
          '<span class="har-dot har-dot--' +
          statusTone(a) +
          '" aria-hidden="true"></span>' +
          '<span class="har-name">' +
          escapeHtml(a.displayName || a.agentId) +
          (needsMark ? '<i class="har-flag">!</i>' : '') +
          '<small>' +
          escapeHtml(proj.primaryLabel) +
          (proj.supportingText
            ? '<span class="har-support">' + escapeHtml(proj.supportingText) + '</span>'
            : '') +
          '</small></span></div>' +
          '<div class="har-project">' +
          escapeHtml(project) +
          '</div>' +
          '<div class="har-time">' +
          escapeHtml(workWhen(a)) +
          '</div>' +
          '<div class="har-row-actions">' +
          homeActionButtons(a, { rowOnly: true }) +
          '</div>' +
          '<button type="button" class="har-toggle" data-expand-agent="' +
          escapeAttr(a.agentId) +
          '" aria-expanded="' +
          (open ? 'true' : 'false') +
          '" aria-label="' +
          escapeAttr(open ? t('collapseAgent') : t('expandAgent')) +
          '"><span class="har-chevron" aria-hidden="true">' +
          (open ? '⌃' : '⌄') +
          '</span></button></div>';
        if (open) html += renderHomeDetail(a);
        html += '</article>';
      } catch (rowErr) {
        try {
          console.warn('[AgentCenter] row render failed', a && a.agentId, rowErr);
        } catch (_) {}
        html +=
          '<article class="har-row" data-agent-row="' +
          escapeAttr((a && a.agentId) || '') +
          '" role="listitem"><div class="har-row-main"><div class="har-name">' +
          escapeHtml((a && (a.displayName || a.agentId)) || 'Agent') +
          '</div><div class="har-project">—</div><div class="har-time">—</div></div></article>';
      }
    });
    if (!state.showNotFound) {
      var nf = ((state.snap.groups && state.snap.groups.supportedNotFound) || []).length;
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

  function outcomeMessage(res, act, agent) {
    var outcome = resolveActionOutcome(res, act, agent);
    if (outcome === 'attemptedUnverified') return t('actionAttemptedUnverified');
    if (outcome === 'verified') {
      if (act && act.id === 'agent.interrupt') return t('actionVerifiedStop');
      return t('actionOk') + ' · ' + actionLabel(act);
    }
    var failPrefix =
      act && act.id === 'agent.interrupt' ? t('actionStopFail') : t('actionFail');
    return (
      failPrefix +
      ' · ' +
      (humanActionReason(
        (res && (res.error || res.detail)) || (act && act.reason),
        act && act.id
      ) ||
        t('actionUnavailable'))
    );
  }

  /**
   * Fail-closed outcome resolution.
   * Missing outcome must never invent Verified.
   * Cursor never Verified — force attemptedUnverified.
   */
  function resolveActionOutcome(res, act, agent) {
    if (!res || typeof res !== 'object') return 'failed';
    var outcome = res.outcome;
    var ok = res.ok;
    var verified = res.verified;
    if (ok === false && verified === true) return 'failed';
    var resolved = 'failed';
    if (outcome === 'verified') {
      if (ok === false || verified === false) resolved = 'failed';
      else resolved = 'verified';
    } else if (outcome === 'attemptedUnverified') {
      resolved = ok === false ? 'failed' : 'attemptedUnverified';
    } else if (outcome === 'failed') {
      resolved = 'failed';
    } else if (ok === false) {
      resolved = 'failed';
    } else {
      resolved = 'failed';
    }
    if (resolved === 'verified' && providerKeyOf(agent || {}) === 'cursor') {
      return 'attemptedUnverified';
    }
    if (
      resolved === 'verified' &&
      act &&
      act.id === 'agent.interrupt' &&
      providerKeyOf(agent || {}) === 'cursor'
    ) {
      return 'attemptedUnverified';
    }
    return resolved;
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
      toast(humanActionReason(act.reason, act.id) || t('actionUnavailable'));
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

    var attemptId =
      'attempt-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);

    invoke('cmd_agent_center_action', {
      args: {
        agentId: agent.agentId,
        actionId: actionId,
        projectHint: hint || null,
        attemptId: attemptId
      }
    })
      .then(function (res) {
        if (!res) {
          fail(t('actionFail'));
          return;
        }
        var outcome = resolveActionOutcome(res, act, agent);
        if (outcome === 'failed') {
          fail(outcomeMessage(Object.assign({}, res, { outcome: 'failed' }), act, agent));
          return;
        }
        if (res.clientEffect) {
          if (applyClientEffect(res.clientEffect, agent)) {
            ok(outcomeMessage(Object.assign({}, res, { outcome: 'verified' }), act, agent));
          } else {
            fail(
              actionId.indexOf('data') >= 0 ? t('openDataFail') : t('openConfigFail')
            );
          }
          return;
        }
        ok(outcomeMessage(Object.assign({}, res, { outcome: outcome }), act, agent));
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
    root.addEventListener('change', function (ev) {
      var sel = ev.target && ev.target.closest ? ev.target.closest('[data-har-filter]') : null;
      if (!sel) return;
      state.homeFilter = sel.value || 'all';
      paint();
    });
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
    if (typeof window !== 'undefined' && window.__ONETONE_E2E_HOME_FIXTURE__ && !opts.force) {
      paint();
      return Promise.resolve(state.snap);
    }
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
    if (typeof window !== 'undefined' && window.__ONETONE_E2E_HOME_FIXTURE__) return;
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
        '<div class="har-overview" data-har-overview aria-label="' +
        escapeAttr(t('overviewAria')) +
        '"></div>' +
        '<div class="har-toolbar" data-har-toolbar></div>' +
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
    _humanActionReason: humanActionReason,
    _classifyInterrupt: classifyInterrupt,
    _projectAgentControl: projectAgentControl,
    _setAcceptanceManifest: setAcceptanceManifest,
    _getAcceptanceManifest: getAcceptanceManifest,
    _computeHomeOverview: computeHomeOverview,
    _matchesHomeFilter: matchesHomeFilter,
    _formatEvidenceFreshness: formatEvidenceFreshness,
    _interruptSubline: interruptSubline,
    _findInterruptAction: findInterruptAction,
    _outcomeMessage: outcomeMessage,
    _resolveActionOutcome: resolveActionOutcome,
    _state: state,
    __test: {
      mountHome: mountHome,
      applySnap: applySnap,
      paint: paint,
      dispatchAction: dispatchAction,
      refresh: refresh,
      resolveActionOutcome: resolveActionOutcome,
      outcomeMessage: outcomeMessage,
      projectAgentControl: projectAgentControl,
      setAcceptanceManifest: setAcceptanceManifest,
      computeHomeOverview: computeHomeOverview,
      matchesHomeFilter: matchesHomeFilter
    },
    t: t
  };
})(typeof window !== 'undefined' ? window : globalThis);
