/**
 * OneToneHomeAgentV2Store — ViewModel for new home workbench.
 * Consumes FocusStore + Agent Center + inventory + attention + habit + prep.
 * Never invents a second adjudicator. Evidence lives in sidecar only.
 */
(function (global) {
  'use strict';

  var LAST_GOOD_KEY = 'onetone.agentCenter.lastGood';
  var LAST_GOOD_MAX_AGE_MS = 5 * 60 * 1000;
  var COALESCE_MS = 120;
  var POLL_MS = 15000;
  var WB_MODE_KEY = 'onetone.ha2.wbSendMode';
  var WORK_MODE_KEY = 'onetone.ha2.workMode';

  var CATALOG = [
    { id: 'codex', name: 'Codex', appId: 'codex-chat', icon: 'icons/app-target/codex.png' },
    { id: 'claude', name: 'Claude', appId: 'claude-code', icon: 'icons/app-target/claude.png' },
    { id: 'cursor', name: 'Cursor', appId: 'cursor-chat', icon: 'icons/app-target/cursor.png' },
    { id: 'minimax', name: 'MiniMax', appId: 'minimax-chat', icon: 'icons/app-target/minimaxcode.png' },
    { id: 'kimi', name: 'Kimi', appId: 'kimi-chat', icon: 'icons/app-target/kimi.png' },
    { id: 'pi', name: 'Pi', appId: 'pi-chat', icon: 'icons/app-target/pi.png' },
    { id: 'opencode', name: 'OpenCode', appId: 'opencode-chat', icon: 'icons/app-target/opencode.png' },
    { id: 'openclaw', name: 'OpenClaw', appId: 'openclaw-chat', icon: 'icons/app-target/openclaw.png' },
    { id: 'hermes', name: 'Hermes', appId: 'hermes-chat', icon: 'icons/app-target/hermes.png' },
    { id: 'traecode', name: 'Trae Code', appId: 'trae-code', icon: 'icons/app-target/trae-code.png' },
    { id: 'traework', name: 'Trae Work', appId: 'trae-work', icon: 'icons/app-target/trae.png' },
    { id: 'workbuddy', name: 'WorkBuddy', appId: 'workbuddy-chat', icon: 'icons/app-target/workbuddy.png' },
    { id: 'qoder', name: 'Qoder', appId: 'qoder-chat', icon: 'icons/app-target/qoder.png' }
  ];

  var state = {
    loadPhase: 'loading',
    error: null,
    snapshot: null,
    inventory: null,
    inventoryLoaded: false,
    attention: null,
    homeSnap: null,
    /** cmd_tm_status — Soft Pad Time Capsule; not workspace rows. */
    timeMachine: null,
    focusDto: null,
    focusVm: null,
    agents: [],
    targets: [],
    selectedKind: null,
    userLocked: false,
    /** WorkBuddy send mode: local = in-app chat; desktop = paste to exe. */
    wbSendMode: 'local',
    /** User intent: think(对话) | edit(工作). Loaded from localStorage below. */
    workMode: 'edit',
    /** Honest handoff tracking — never a fake external sessionId. */
    handoffId: null,
    /** Absolute project path locked with Agent when userLocked. */
    lockedProjectPath: null,
    lockedProjectSource: null,
    /** Gate notice only — never writes evidence.delivery. */
    validationNotice: null,
    /** Delivery attempt outcome (not task completion). */
    deliveryReceipt: null,
    /** Center action outcome (resume/interrupt/…) — isolated from delivery. */
    actionReceipt: null,
    /** @deprecated alias — prefer deliveryReceipt */
    receipt: null,
    draft: '',
    materials: [],
    aimByAppId: {},
    capabilities: {
      softPad: { state: 'off', configOn: false, runtimeReady: false, error: null },
      voice: { state: 'off', configOn: false, runtimeReady: false, error: null },
      camera: { state: 'off', configOn: false, runtimeReady: false, error: null }
    },
    pickerOpen: false,
    view: 'home',
    visible: false,
    mounted: false,
    focusPollOwned: false,
    evidence: {
      mode: { source: null, observedAt: 0, freshness: 'unknown' },
      project: { source: null, observedAt: 0, verified: false },
      agents: { source: null, observedAt: 0, freshness: 'unknown' },
      inventory: { source: null, observedAt: 0, freshness: 'unknown' },
      delivery: { source: null, observedAt: 0, verified: false }
    },
    /** ATR (opt-in flag) — never invent status without IPC. */
    activeAgentTaskId: null,
    agentTaskGrant: false,
    agentTask: null,
    agentTaskEvents: [],
    /** Recent ATR tasks on the edit-dialogue page (active + prior). */
    agentTaskStack: [],
    /**
     * Send while a blocking ATR task is live — never auto-abandon.
     * { goal, materialsSummary, status, taskId } | null
     */
    atrSendConflict: null
  };

  var ATR_STACK_MAX = 12;

  var atrPollTimer = 0;
  var ATR_POLL_MS = 1200;
  /** Prevent double start from rapid Send. */
  var atrSendInFlight = null;
  /** taskId → in-flight drive Promise (approve/poll/continue must share). */
  var atrDriveInFlightByTask = Object.create(null);

  var listeners = [];
  var unsubs = [];
  var coalesceTimer = 0;
  var pollTimer = 0;
  var refreshInFlight = null;
  var refreshGen = 0;
  var lastRefreshAt = 0;
  var composing = false;

  function capsApi() {
    return global.OneToneHomeAgentCapabilities || null;
  }

  function loadWbSendMode() {
    try {
      var v = global.localStorage && global.localStorage.getItem(WB_MODE_KEY);
      if (v === 'desktop' || v === 'local') return v;
    } catch (_) {}
    return 'local';
  }

  function persistWbSendMode(mode) {
    try {
      if (global.localStorage) global.localStorage.setItem(WB_MODE_KEY, mode);
    } catch (_) {}
  }

  function loadWorkMode() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(WORK_MODE_KEY);
      var Caps = capsApi();
      var next =
        Caps && Caps.normalizeWorkMode ? Caps.normalizeWorkMode(raw) : String(raw || '');
      // Primary UI is chat|work — migrate legacy readonly → think.
      if (next === 'readonly') next = 'think';
      if (next === 'think' || next === 'edit') return next;
    } catch (_) {}
    return 'edit';
  }

  function persistWorkMode(mode) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(WORK_MODE_KEY, mode === 'edit' ? 'edit' : 'think');
      }
    } catch (_) {}
  }

  state.wbSendMode = loadWbSendMode();
  state.workMode = loadWorkMode();

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    return ipc && ipc.invoke
      ? ipc.invoke(cmd, args || {})
      : Promise.reject(new Error('ipc_unavailable'));
  }

  function catalog(id) {
    for (var i = 0; i < CATALOG.length; i++) {
      if (CATALOG[i].id === id) return CATALOG[i];
    }
    return null;
  }

  function catalogList() {
    return CATALOG.slice();
  }

  function resolveKind(raw) {
    var Policy = global.OneToneHomeActionPolicy;
    var s = String(raw || '')
      .toLowerCase()
      .replace(/^kind:/, '')
      .trim();
    if (!s) return null;
    if (Policy && typeof Policy.canonicalKind === 'function') {
      var pk = Policy.canonicalKind(s);
      if (pk === 'chatgpt') return 'codex';
      if (pk === 'trae') return 'traework';
      if (pk === 'traeCode') return 'traecode';
      if (catalog(pk)) return pk;
    }
    if (s.indexOf('cursor') >= 0) return 'cursor';
    if (s.indexOf('claude') >= 0) return 'claude';
    if (s.indexOf('minimax') >= 0) return 'minimax';
    if (s.indexOf('workbuddy') >= 0 || s.indexOf('codebuddy') >= 0) return 'workbuddy';
    if (s === 'traecode' || s.indexOf('trae-code') >= 0 || s.indexOf('trae_code') >= 0) {
      return 'traecode';
    }
    if (s.indexOf('trae') >= 0) return 'traework';
    if (s.indexOf('qoder') >= 0) return 'qoder';
    if (s.indexOf('opencode') >= 0) return 'opencode';
    if (s.indexOf('openclaw') >= 0) return 'openclaw';
    if (s.indexOf('hermes') >= 0) return 'hermes';
    if (s.indexOf('kimi') >= 0) return 'kimi';
    if (s === 'pi' || s.indexOf('pi-') === 0) return 'pi';
    if (
      s === 'codex' ||
      s === 'chatgpt' ||
      s.indexOf('openai') >= 0 ||
      s === 'codex-chat'
    ) {
      return 'codex';
    }
    if (catalog(s)) return s;
    return null;
  }

  function kindOfAgent(a) {
    if (!a) return null;
    return resolveKind(a.runtimeKind || a.kind || a.agentId || a.id);
  }

  /** Matches Rust prompt_journal::UNKNOWN_PROMPT_SUMMARY — not real narration. */
  var UNKNOWN_PROMPT_SUMMARY = '检测到交互，内容未知';

  function projectNameOf(agent) {
    var cw = agent && agent.currentWork;
    if (cw) {
      var project = String(cw.projectName || cw.project || cw.displayName || '').trim();
      if (project && !isBannedNarration(project)) return project;
    }
    if (agent && agent.cwd) {
      var parts = String(agent.cwd)
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/);
      var leaf = parts[parts.length - 1];
      if (leaf && !isBannedNarration(leaf)) return leaf;
    }
    return '';
  }

  /** Fake / probe copy that must never become a workspace work line. */
  function isBannedNarration(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return true;
    if (s === UNKNOWN_PROMPT_SUMMARY) return true;
    if (s === '最近工作' || s === '查看最近工作' || s === '能力受限') return true;
    if (/已探测/.test(s) && /可发送/.test(s)) return true;
    if (/未确认可发送|等待可发送动作|Windows 能力检测|未探测到桌面/.test(s)) return true;
    // Bare session ids are not human narration.
    if (/^[0-9a-f]{8,}(-[0-9a-f]+)*$/i.test(s) && s.length >= 16) return true;
    return false;
  }

  function pickUsableText() {
    for (var i = 0; i < arguments.length; i++) {
      var s = String(arguments[i] == null ? '' : arguments[i]).trim();
      if (s && !isBannedNarration(s)) return s;
    }
    return '';
  }

  /** Prefer active / first session title — real fields only, never invent. */
  function sessionNarration(agent) {
    var sessions =
      (agent && (agent.sessions || agent.recentSessions)) ||
      (agent && agent.raw && (agent.raw.sessions || agent.raw.recentSessions)) ||
      [];
    if (!sessions.length) return '';
    var matched = null;
    var i;
    for (i = 0; i < sessions.length; i++) {
      if (sessions[i] && (sessions[i].isActive || sessions[i].is_active || sessions[i].active)) {
        matched = sessions[i];
        break;
      }
    }
    if (!matched) matched = sessions[0];
    return pickUsableText(
      matched && matched.title,
      matched && matched.summary,
      matched && matched.name
    );
  }

  /** Real work sentence only — never placeholders or UNKNOWN_PROMPT_SUMMARY. */
  function workLine(agent) {
    if (!agent) return '';
    var w = agent.currentWork || (agent.recentWork && agent.recentWork[0]);
    var base = pickUsableText(
      agent.recentPrompt,
      agent.title,
      w && w.title,
      w && w.summary
    );
    if (base) return base;
    // Session titles only while live — idle session lists are Continue, not work rows.
    var st = statusOf(agent);
    if (isWorkingStatus(st) || isNeedsStatus(st)) return sessionNarration(agent);
    return '';
  }

  function statusShort(status, actions) {
    status = String(status || '').toLowerCase();
    if (/needs|waiting|approval|needsinput/.test(status)) return '等待确认';
    if (/working|running|active/.test(status)) return '执行中';
    if (/fail|error/.test(status)) return '遇到问题';
    if (/done|complet/.test(status)) return '已完成';
    if (/paused|resumable/.test(status) || actionEnabled(actions, 'session.resume')) {
      return '可恢复';
    }
    return '';
  }

  function statusTag(status, actions) {
    status = String(status || '').toLowerCase();
    if (/needs|waiting|approval|needsinput/.test(status)) {
      return { label: '等确认', tone: 'wait' };
    }
    if (/working|running|active/.test(status)) return { label: '执行中', tone: 'run' };
    if (/fail|error/.test(status)) return { label: '失败', tone: 'fail' };
    if (/done|complet/.test(status)) return { label: '完成', tone: 'done' };
    if (/paused|resumable/.test(status) || actionEnabled(actions, 'session.resume')) {
      return { label: '可恢复', tone: '' };
    }
    return { label: '空闲', tone: '' };
  }

  /**
   * A = native hook / app server; B = partial; C = inventory-only / inferred.
   * Workspace rows never list C.
   */
  function evidenceTierOf(agent, status) {
    var src = String(
      (agent && agent.observedStatus && (agent.observedStatus.source || agent.observedStatus.Source)) ||
        (agent && (agent.statusSource || agent.status_source)) ||
        ''
    ).toLowerCase();
    if (
      /officialhook|official_hook|appserver|app_server|native|onetoneask|onetone_ask|claudebackground|codexbackground/.test(
        src
      )
    ) {
      return 'A';
    }
    var st = String(status || '').toLowerCase();
    var active = !!statusShort(st, (agent && agent.actions) || []);
    var hasFocus = actionEnabled((agent && agent.actions) || [], 'agent.focus');
    var hasResume = actionEnabled((agent && agent.actions) || [], 'session.resume');
    if (active || hasResume || (hasFocus && workLine(agent))) return 'B';
    if (src && src !== 'none' && src !== 'inferred') return 'B';
    return 'C';
  }

  function primaryCtaOf(status, actions) {
    // ponytail: Agent Center never emits approval.approve/reject (not_wired). Waiting
    // →「前往处理」only; do not treat phantom approve actions as executable auth.
    if (/needs|waiting|approval|needsinput/.test(String(status || ''))) {
      return 'navigate';
    }
    if (actionEnabled(actions, 'session.resume')) return 'resume';
    if (actionEnabled(actions, 'agent.focus')) return 'send';
    return 'open';
  }

  function pathApi() {
    return global.OneToneProjectPath || null;
  }

  function normalizePath(raw) {
    var PP = pathApi();
    return PP && PP.normalizeAbsolutePath ? PP.normalizeAbsolutePath(raw) : null;
  }

  function pathsEqual(a, b) {
    var PP = pathApi();
    if (PP && PP.pathsEqual) return PP.pathsEqual(a, b);
    var na = normalizePath(a);
    var nb = normalizePath(b);
    return !!(na && nb && na.toLowerCase() === nb.toLowerCase());
  }

  /** Extract absolute path from work item / session / project-like object. */
  function pathFromWorkish(w) {
    if (!w) return null;
    if (typeof w === 'string') return normalizePath(w);
    var cands = [
      w.root,
      w.workspacePath,
      w.workspace_path,
      w.projectPath,
      w.project_path,
      w.path,
      w.cwd,
      w.workspace && (w.workspace.root || w.workspace.path || w.workspace.workspacePath)
    ];
    for (var i = 0; i < cands.length; i++) {
      var n = normalizePath(cands[i]);
      if (n) return n;
    }
    return null;
  }

  function focusProjectPath() {
    try {
      var p =
        (state.focusDto && state.focusDto.project) ||
        (global.OneToneHomeFocusStore &&
          global.OneToneHomeFocusStore.get &&
          global.OneToneHomeFocusStore.get() &&
          global.OneToneHomeFocusStore.get().project);
      return pathFromWorkish(p);
    } catch (_) {
      return null;
    }
  }

  function tmWorkspacePath() {
    var tm = state.timeMachine;
    if (!tm) return null;
    return normalizePath(tm.workspace || tm.workspacePath || tm.workspace_path);
  }

  /**
   * Atomic send target: Agent + project path.
   * Priority: selected work item → user-locked project → Focus → Time Machine.
   */
  function resolveTargetContext() {
    var kind = state.selectedKind || null;
    var agentId = '';
    var workPath = null;
    var i;
    if (kind) {
      for (i = 0; i < state.agents.length; i++) {
        if (state.agents[i].kind === kind) {
          agentId = state.agents[i].agentId || '';
          workPath =
            pathFromWorkish(state.agents[i].currentWork) ||
            pathFromWorkish(state.agents[i].recentWork && state.agents[i].recentWork[0]) ||
            normalizePath(state.agents[i].project);
          break;
        }
      }
      if (!agentId) {
        var rows = workRows(8);
        for (i = 0; i < rows.length; i++) {
          if (rows[i].kind === kind) {
            agentId = rows[i].agentId || '';
            workPath =
              pathFromWorkish(rows[i].currentWork) ||
              normalizePath(rows[i].project) ||
              workPath;
            break;
          }
        }
      }
    }
    var projectPath = null;
    var projectSource = null;
    if (workPath) {
      projectPath = workPath;
      projectSource = 'work_item';
    } else if (state.userLocked && state.lockedProjectPath) {
      projectPath = state.lockedProjectPath;
      projectSource = state.lockedProjectSource || 'user_locked';
    } else {
      var focusPath = focusProjectPath();
      if (focusPath) {
        projectPath = focusPath;
        projectSource = 'focus';
      } else {
        var tmPath = tmWorkspacePath();
        if (tmPath) {
          projectPath = tmPath;
          projectSource = 'time_machine';
        }
      }
    }
    var tm = tmWorkspacePath();
    return {
      agentId: agentId,
      kind: kind,
      projectPath: projectPath,
      projectSource: projectSource,
      tmWorkspaceMatched: !!(projectPath && tm && pathsEqual(projectPath, tm))
    };
  }

  /**
   * Normalize session cards from recentWork + homeSnap.recentSessions.
   * Never invents Agent-level recentPrompt as session content.
   */
  function buildSessionCards(agentOrKind) {
    var agent = null;
    var kind = null;
    if (typeof agentOrKind === 'string') {
      kind = resolveKind(agentOrKind) || agentOrKind;
      for (var ai = 0; ai < state.agents.length; ai++) {
        if (state.agents[ai].kind === kind) {
          agent = state.agents[ai];
          break;
        }
      }
    } else {
      agent = agentOrKind;
      kind = agent && agent.kind;
    }
    var provider = kind || (agent && agent.kind) || '';
    var out = [];
    var seen = {};

    function pushCard(raw, fallbackStatus) {
      if (!raw) return;
      var sid = String(
        raw.sessionId ||
          raw.session_id ||
          raw.externalSessionId ||
          raw.external_session_id ||
          raw.id ||
          ''
      );
      if (!sid || seen[sid]) return;
      seen[sid] = true;
      out.push({
        sessionId: sid,
        provider: String(raw.provider || provider || ''),
        title: raw.title || raw.summary || null,
        projectId: String(raw.projectId || raw.project_id || ''),
        projectMatch: String(raw.projectMatch || raw.project_match || ''),
        status: String(raw.status || fallbackStatus || ''),
        updatedAt: Number(raw.updatedAt || raw.updated_at || raw.updated || 0) || null,
        activitySource: String(raw.activitySource || raw.activity_source || ''),
        activeConfidence:
          raw.activeConfidence != null
            ? Number(raw.activeConfidence)
            : raw.active_confidence != null
              ? Number(raw.active_confidence)
              : null
      });
    }

    if (agent) {
      var rw = agent.recentWork;
      if (Array.isArray(rw)) {
        for (var ri = 0; ri < rw.length; ri++) pushCard(rw[ri], agent.status);
      }
      if (agent.currentWork) pushCard(agent.currentWork, agent.status);
    }

    var home = state.homeSnap;
    var recent = home && (home.recentSessions || home.recent_sessions);
    if (Array.isArray(recent) && provider) {
      for (var hi = 0; hi < recent.length; hi++) {
        var hs = recent[hi];
        if (!hs) continue;
        var hp = String(hs.provider || '').toLowerCase();
        if (hp && hp !== String(provider).toLowerCase()) continue;
        pushCard(hs, hs.status);
      }
    }

    out.sort(function (a, b) {
      return (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0);
    });
    return out;
  }

  function workWhen(agent) {
    var w = agent && (agent.currentWork || (agent.recentWork && agent.recentWork[0]));
    var ms = Number(
      (w && (w.updatedAt || w.updated_at)) ||
        (agent && agent.promptObservedAt) ||
        (agent && agent.observedStatus && agent.observedStatus.observedAt) ||
        (agent && agent.lastSyncAt) ||
        0
    );
    return ms || 0;
  }

  function statusOf(agent) {
    var obs = agent && agent.observedStatus;
    if (obs && obs.value != null) return String(obs.value).toLowerCase();
    return String((agent && (agent.status || agent.attentionState)) || '').toLowerCase();
  }

  function actionEnabled(actions, id) {
    if (!Array.isArray(actions)) return false;
    for (var i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].id === id && actions[i].enabled !== false) return true;
    }
    return false;
  }

  /** Status shells used when Center has no real prompt — not workspace narration alone. */
  function isStatusShellLine(line) {
    return (
      line === '可恢复' ||
      line === '空闲' ||
      line === '执行中' ||
      line === '等待确认' ||
      line === '已完成' ||
      line === '遇到问题'
    );
  }

  /** Soft Pad living placeholder — replace with session/project when Center has one. */
  function isActivityShellLine(line) {
    line = String(line || '').trim();
    if (!line) return true;
    if (line === '正在活动' || line === '执行中') return true;
    if (/^.+\s正在活动$/.test(line)) return true;
    return false;
  }

  /**
   * Prefer real Cursor/Agent session title over「X 正在活动」.
   * Digs Center projected row + raw sessions / currentWork.
   */
  function enrichLivingNarration(center, shellLine, preferSid) {
    var shell = String(shellLine || '').trim();
    if (!isActivityShellLine(shell) && pickUsableText(shell)) {
      return {
        line: shell,
        project: (center && center.project) || '',
        sessionId: preferSid || null
      };
    }
    var sid = preferSid ? String(preferSid).trim() : '';
    var sessions =
      (center && center.sessions) ||
      (center && center.raw && (center.raw.sessions || center.raw.recentSessions)) ||
      [];
    var matched = null;
    var i;
    if (sid) {
      for (i = 0; i < sessions.length; i++) {
        var s0 = sessions[i];
        if (!s0) continue;
        if (String(s0.sessionId || s0.session_id || s0.id || '') === sid) {
          matched = s0;
          break;
        }
      }
    }
    if (!matched) {
      for (i = 0; i < sessions.length; i++) {
        if (sessions[i] && (sessions[i].isActive || sessions[i].is_active || sessions[i].active)) {
          matched = sessions[i];
          break;
        }
      }
    }
    if (!matched && sessions[0]) matched = sessions[0];
    var cw = (center && center.currentWork) || (center && center.raw && center.raw.currentWork) || null;
    var usable = pickUsableText(
      matched && matched.title,
      matched && matched.summary,
      matched && matched.name,
      center && center.recentPrompt,
      center && center.raw && center.raw.recentPrompt,
      center && center.raw && center.raw.title,
      cw && cw.title,
      cw && cw.summary,
      center && center.project
    );
    if (isStatusShellLine(usable) || isActivityShellLine(usable)) usable = '';
    var outSid =
      sid ||
      (matched && String(matched.sessionId || matched.session_id || matched.id || '')) ||
      (cw && String(cw.sessionId || cw.session_id || '')) ||
      null;
    return {
      line: usable || shell || '执行中',
      project: (center && center.project) || (cw && (cw.projectName || cw.project)) || '',
      sessionId: outSid || null
    };
  }

  /** Workspace row gate — see docs/home-agent-v2-workspace-remediation.md §3.2 */
  function isEligible(row) {
    if (!row || !row.kind) return false;
    if (row.evidenceTier === 'C') return false;
    var line = String(row.line || '').trim();
    if (!line || isBannedNarration(line)) return false;
    // Idle + session.resume often yields sole line「可恢复」— that is not monitoring.
    if (isStatusShellLine(line) && !isNeedsStatus(row.status) && !isWorkingStatus(row.status)) {
      return false;
    }
    return true;
  }

  function inventoryRows() {
    return (state.inventory && Array.isArray(state.inventory.agents) && state.inventory.agents) || [];
  }

  /** Discovery from inventory DTO — no installed field. */
  function inventoryDiscovery(row) {
    if (!row) {
      return { discovered: false, running: false, channel: 'none', presence: 'none', confidence: '' };
    }
    var evidence = row.evidence || row.Evidence || [];
    var hasCli = false;
    var hasApp = false;
    for (var e = 0; e < evidence.length; e++) {
      var ek = String((evidence[e] && (evidence[e].kind || evidence[e].Kind)) || '');
      if (ek === 'cli' || ek === 'embedded') hasCli = true;
      if (ek === 'desktop' || ek === 'package') hasApp = true;
    }
    var presence = String(row.presence || row.Presence || 'none').toLowerCase();
    if (presence === 'cli') hasCli = true;
    if (presence === 'desktop' || presence === 'package' || presence === 'embedded') hasApp = true;
    var confidence = String(row.confidence || row.Confidence || '').toLowerCase();
    var running = !!(row.running || row.Running);
    var discovered =
      running ||
      confidence === 'high' ||
      hasCli ||
      hasApp ||
      (presence && presence !== 'none' && presence !== 'unknown');
    var channel = hasCli && !hasApp ? 'cli' : hasCli && hasApp ? 'both' : hasApp ? 'app' : 'none';
    return {
      discovered: discovered,
      running: running,
      channel: channel,
      presence: presence,
      confidence: confidence,
      prepared: !!(row.prepared || row.Prepared),
      lightEnabled: !!(row.lightEnabled || row.light_enabled || row.LightEnabled)
    };
  }

  function invRowForKind(kindId) {
    var rows = inventoryRows();
    for (var i = 0; i < rows.length; i++) {
      if (resolveKind(rows[i].kind || rows[i].Kind || rows[i].agentId) === kindId) {
        return rows[i];
      }
    }
    return null;
  }

  function projectAgent(raw) {
    var kind = kindOfAgent(raw);
    if (!kind) return null;
    var cat = catalog(kind) || {
      id: kind,
      name: (raw && (raw.displayName || raw.name)) || kind,
      appId: '',
      icon: ''
    };
    var status = statusOf(raw);
    var actions = Array.isArray(raw && raw.actions) ? raw.actions : [];
    var project = projectNameOf(raw);
    var usable = workLine(raw);
    var short = statusShort(status, actions);
    // Prefer real narration; A/B active may keep short for eligibility — UI must not repeat tag.
    var line = usable || short;
    var lineShell = !usable && !!short;
    var tier = evidenceTierOf(raw, status);
    var tag = statusTag(status, actions);
    var score = /needs|waiting|approval|needsinput/.test(status)
      ? 0
      : /working|running|active/.test(status)
        ? 1
        : /fail|error/.test(status)
          ? 0
          : 2;
    var inv = inventoryDiscovery(invRowForKind(kind));
    var boundary =
      tier === 'B' && !actionEnabled(actions, 'agent.interrupt')
        ? '可观察 · 无远程中断'
        : '';
    // Idle with no usable line and no active short → not eligible (P0). Boundary-only rows = P1.
    var row = {
      raw: raw,
      kind: kind,
      cat: cat,
      agentId: (raw && (raw.agentId || raw.id)) || '',
      project: project,
      title: line,
      line: line,
      lineShell: lineShell,
      status: status,
      tag: tag.label,
      tagTone: tag.tone,
      evidenceTier: tier,
      boundary: boundary,
      primaryCta: primaryCtaOf(status, actions),
      updated: workWhen(raw),
      presenceState: (raw && raw.presenceState) || '',
      resolvedCapabilities: (raw && raw.resolvedCapabilities) || null,
      actions: actions,
      canSend: actionEnabled(actions, 'agent.focus'),
      discovered: inv.discovered,
      invRunning: inv.running,
      sessions: (raw && (raw.sessions || raw.recentSessions)) || [],
      recentWork: (raw && raw.recentWork) || [],
      currentWork: (raw && raw.currentWork) || null,
      recentPrompt: (raw && raw.recentPrompt) || '',
      observedStatus: (raw && raw.observedStatus) || null,
      score: score
    };
    row.eligible = isEligible(row);
    return row;
  }

  function projectAgents(snap) {
    var list = (snap && Array.isArray(snap.agents) && snap.agents) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var row = projectAgent(list[i]);
      if (row) out.push(row);
    }
    out.sort(function (a, b) {
      return a.score - b.score;
    });
    return out;
  }

  /** Icon-grid targets: inventory discovery ∪ center agents. */
  function projectTargets() {
    var byKind = {};
    var order = [];
    var inv = inventoryRows();
    var i;
    for (i = 0; i < inv.length; i++) {
      var kind = resolveKind(inv[i].kind || inv[i].Kind);
      if (!kind) continue;
      var d = inventoryDiscovery(inv[i]);
      if (!d.discovered && !d.running) continue;
      var cat = catalog(kind) || { id: kind, name: kind, appId: '', icon: '' };
      byKind[kind] = {
        kind: kind,
        label: cat.name,
        icon: cat.icon,
        channel: d.channel,
        discovered: d.discovered,
        running: d.running,
        canSelect: d.discovered || d.running,
        canSend: false
      };
      order.push(kind);
    }
    for (i = 0; i < state.agents.length; i++) {
      var a = state.agents[i];
      if (!a || !a.kind) continue;
      var centerRunning = /working|running|active|needs|waiting/.test(String(a.status || ''));
      if (!byKind[a.kind]) {
        byKind[a.kind] = {
          kind: a.kind,
          label: (a.cat && a.cat.name) || a.kind,
          icon: (a.cat && a.cat.icon) || '',
          channel: 'app',
          discovered: true,
          running: centerRunning || !!a.invRunning,
          canSelect: true,
          canSend: !!a.canSend
        };
        order.push(a.kind);
      } else {
        byKind[a.kind].canSend = !!a.canSend;
        if (centerRunning) byKind[a.kind].running = true;
        byKind[a.kind].canSelect = true;
      }
    }
    return order.map(function (k) {
      return byKind[k];
    });
  }

  function isNeedsStatus(st) {
    return /needs|waiting|approval|needsinput/.test(String(st || ''));
  }

  function isWorkingStatus(st) {
    return /working|running|active/.test(String(st || ''));
  }

  function centerAgentByKind(kind) {
    for (var i = 0; i < state.agents.length; i++) {
      if (state.agents[i] && state.agents[i].kind === kind) return state.agents[i];
    }
    return null;
  }

  function cloneRow(row) {
    return Object.assign({}, row, {
      actions: Array.isArray(row.actions) ? row.actions.slice() : []
    });
  }

  /**
   * Soft Pad / Focus desk → workspace rows (P1).
   * Reads focusVm.desk after enrichFromAttention + enrichFromHomeSnapshot.
   */
  function deskSupplementRows() {
    var desk = state.focusVm && state.focusVm.desk;
    if (!desk) return [];
    var out = [];
    var seen = {};

    function pushSynth(opts) {
      var kind = opts.kind;
      if (!kind || seen[kind]) return;
      seen[kind] = true;
      var cat =
        catalog(kind) || {
          id: kind,
          name: opts.name || kind,
          appId: '',
          icon: ''
        };
      var center = centerAgentByKind(kind);
      var actions = (center && center.actions) || opts.actions || [];
      var usableLine = pickUsableText(opts.line);
      var line = usableLine || opts.fallbackLine || '';
      if (!line || isBannedNarration(line)) return;
      var status = opts.status;
      var tag = statusTag(status, actions);
      var lineShell =
        !usableLine ||
        isStatusShellLine(line) ||
        isActivityShellLine(line) ||
        line === tag.label;
      out.push({
        raw: center && center.raw,
        kind: kind,
        cat: cat,
        agentId: (center && center.agentId) || 'kind:' + kind,
        project: (center && center.project) || opts.project || '',
        title: line,
        line: line,
        lineShell: lineShell,
        status: status,
        tag: tag.label,
        tagTone: tag.tone,
        evidenceTier: opts.tier || 'B',
        boundary: opts.boundary || '',
        primaryCta: opts.primaryCta || primaryCtaOf(status, actions),
        updated: opts.updated || Date.now(),
        presenceState: (center && center.presenceState) || '',
        resolvedCapabilities: (center && center.resolvedCapabilities) || null,
        actions: actions,
        canSend: actionEnabled(actions, 'agent.focus') || !!(center && center.canSend),
        discovered: !!(center && center.discovered),
        invRunning: !!(center && center.invRunning),
        sessions: (center && center.sessions) || [],
        recentWork: (center && center.recentWork) || [],
        currentWork: (center && center.currentWork) || null,
        recentPrompt: (center && center.recentPrompt) || '',
        observedStatus: (center && center.observedStatus) || null,
        score: opts.score != null ? opts.score : 2,
        synthetic: true,
        deskSource: opts.deskSource || '',
        sessionId: opts.sessionId || null,
        eligible: true
      });
    }

    var needs = desk.needsYouRows && desk.needsYouRows.length
      ? desk.needsYouRows
      : desk.needsYou
        ? [desk.needsYou]
        : [];
    for (var ni = 0; ni < needs.length; ni++) {
      var n = needs[ni];
      if (!n || n.stale) continue;
      var nk = resolveKind(n.provider || n.badge || n.title);
      if (!nk) continue;
      pushSynth({
        kind: nk,
        name: n.provider || n.badge,
        line: n.title,
        fallbackLine: '等待确认',
        status: 'needs_input',
        tier: 'A',
        primaryCta: 'navigate',
        score: 0,
        deskSource: 'needsYou',
        updated: Date.now()
      });
    }

    var living = desk.livingRows && desk.livingRows.length
      ? desk.livingRows
      : desk.living
        ? [desk.living]
        : [];
    for (var li = 0; li < living.length; li++) {
      var L = living[li];
      if (!L) continue;
      var lk = resolveKind(L.provider || L.badge || L.title);
      if (!lk || seen[lk]) continue;
      var livingCenter = centerAgentByKind(lk);
      var livingNarr = enrichLivingNarration(
        livingCenter,
        L.title,
        L.sessionId || L.session_id || null
      );
      pushSynth({
        kind: lk,
        name: L.provider || L.badge,
        line: livingNarr.line,
        fallbackLine: '执行中',
        status: 'working',
        tier: 'A',
        primaryCta: 'send',
        score: 1,
        deskSource: 'living',
        project: livingNarr.project || '',
        sessionId: livingNarr.sessionId,
        updated: Date.now()
      });
    }

    var ck = desk.continueCard;
    if (ck) {
      var ckKind = resolveKind(ck.badge || ck.provider || '');
      // Living / needs for same agent wins — no Continue duplicate (adapter same-session rule).
      if (ckKind && !seen[ckKind]) {
        var step = pickUsableText(ck.title);
        // Weak titles like「Codex 上次进度」are not real narration.
        var weakContinue =
          !step ||
          /上次进度\s*$/.test(step) ||
          step === '可恢复' ||
          step === (String(ck.badge || '') + ' 上次进度');
        // Closed / not-running agents must not occupy the workspace as fake monitoring.
        var inv = inventoryDiscovery(invRowForKind(ckKind));
        var center = centerAgentByKind(ckKind);
        var present =
          !!inv.running ||
          (center && (isWorkingStatus(center.status) || isNeedsStatus(center.status)));
        if (step && !weakContinue && present) {
          pushSynth({
            kind: ckKind,
            name: ck.badge,
            line: step,
            fallbackLine: '可恢复',
            status: 'resumable',
            tier: 'B',
            primaryCta: 'resume',
            score: 2,
            deskSource: 'continue',
            sessionId: ck.sessionId || null,
            project: '',
            boundary: '已保存上次进度',
            updated: Date.now()
          });
        }
      }
    }

    return out;
  }

  /**
   * Merge Center eligible rows with Soft Pad / checkpoint desk rows.
   * One kind → one row; Needs > Working > Resume; prefer Center actions + best line.
   */
  function mergeWorkRowMaps(centerEligible, supplements) {
    var byKind = {};
    var i;
    for (i = 0; i < centerEligible.length; i++) {
      byKind[centerEligible[i].kind] = cloneRow(centerEligible[i]);
    }
    for (i = 0; i < supplements.length; i++) {
      var s = supplements[i];
      if (!s || !s.kind) continue;
      var cur = byKind[s.kind];
      if (!cur) {
        byKind[s.kind] = cloneRow(s);
        continue;
      }
      // Soft Pad wait + Center needs → single row (prefer Center actions, richer line).
      if (isNeedsStatus(s.status)) {
        if (!isNeedsStatus(cur.status)) {
          cur.status = 'needs_input';
          cur.tag = '等确认';
          cur.tagTone = 'wait';
          cur.score = 0;
          cur.primaryCta = primaryCtaOf(cur.status, cur.actions);
        }
        if (!pickUsableText(cur.line) && pickUsableText(s.line)) {
          cur.line = s.line;
          cur.title = s.line;
          cur.lineShell = isStatusShellLine(s.line) || isActivityShellLine(s.line);
        } else if (pickUsableText(s.line) && s.deskSource === 'needsYou') {
          // Prefer Soft Pad human title when Center only has short status.
          if (cur.line === '执行中' || cur.line === '等待确认' || cur.line === '可恢复' || cur.lineShell) {
            cur.line = s.line;
            cur.title = s.line;
            cur.lineShell = isStatusShellLine(s.line) || isActivityShellLine(s.line);
          }
        }
        if ((!cur.actions || !cur.actions.length) && s.actions && s.actions.length) {
          cur.actions = s.actions.slice();
        }
        cur.eligible = isEligible(cur);
        cur.deskSource = cur.deskSource || s.deskSource;
        continue;
      }
      if (isWorkingStatus(s.status)) {
        if (isNeedsStatus(cur.status)) continue; // needs wins
        if (!isWorkingStatus(cur.status)) {
          cur.status = 'working';
          cur.tag = '执行中';
          cur.tagTone = 'run';
          cur.score = 1;
        }
        var curShell = isStatusShellLine(cur.line) || isActivityShellLine(cur.line);
        var sShell = isStatusShellLine(s.line) || isActivityShellLine(s.line);
        if (pickUsableText(s.line) && (!pickUsableText(cur.line) || (curShell && !sShell))) {
          cur.line = s.line;
          cur.title = s.line;
          cur.lineShell = !!sShell;
        } else if (cur.lineShell == null) {
          cur.lineShell = !!curShell;
        }
        if (!cur.project && s.project) cur.project = s.project;
        if (!cur.sessionId && s.sessionId) cur.sessionId = s.sessionId;
        cur.eligible = isEligible(cur);
        continue;
      }
      // Continue / resume — skip if already needs or working (Living covers it).
      if (s.deskSource === 'continue' || s.status === 'resumable') {
        if (isNeedsStatus(cur.status) || isWorkingStatus(cur.status)) continue;
        if (!isEligible(cur) && pickUsableText(s.line)) {
          byKind[s.kind] = cloneRow(s);
          if (cur.actions && cur.actions.length) byKind[s.kind].actions = cur.actions.slice();
          if (cur.canSend) byKind[s.kind].canSend = true;
        } else if (isEligible(cur) && (!pickUsableText(cur.line) || cur.line === '可恢复' || cur.lineShell)) {
          if (pickUsableText(s.line)) {
            cur.line = s.line;
            cur.title = s.line;
            cur.lineShell = isStatusShellLine(s.line) || isActivityShellLine(s.line);
            cur.status = 'resumable';
            cur.tag = '可恢复';
            cur.primaryCta = 'resume';
            cur.boundary = s.boundary || cur.boundary;
            cur.eligible = isEligible(cur);
          }
        }
      }
    }
    var merged = [];
    for (var k in byKind) {
      if (Object.prototype.hasOwnProperty.call(byKind, k) && isEligible(byKind[k])) {
        merged.push(byKind[k]);
      }
    }
    return merged;
  }

  /**
   * Note under the agent name — never repeat the status tag.
   * Prefer real line / project; omit when we only have a shell.
   */
  function rowNoteText(row) {
    if (!row) return '';
    var line = String(row.line || row.title || '').trim();
    var tag = String(row.tag || '').trim();
    var project = String(row.project || '').trim();
    var shell =
      row.lineShell === true ||
      !line ||
      line === tag ||
      isStatusShellLine(line) ||
      isActivityShellLine(line);
    if (!shell && line) {
      if (project && line.indexOf(project) < 0) return line + ' · ' + project;
      return line;
    }
    if (project) return project;
    return '';
  }

  function workRows(limit) {
    var n = typeof limit === 'number' ? limit : 3;
    var center = [];
    for (var i = 0; i < state.agents.length; i++) {
      if (isEligible(state.agents[i])) center.push(state.agents[i]);
    }
    var merged = mergeWorkRowMaps(center, deskSupplementRows());
    merged.sort(function (a, b) {
      if (a.score !== b.score) return a.score - b.score;
      return (b.updated || 0) - (a.updated || 0);
    });
    return merged.slice(0, n);
  }

  /**
   * Quiet / empty workspace hints — real history or a short help line.
   * Never invents task narration; skips industrial boilerplate.
   */
  function quietHintLines(limit) {
    var n = typeof limit === 'number' ? limit : 3;
    var out = [];
    var seen = {};
    function push(text, kind) {
      text = String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!text || text.length < 2 || seen[text]) return;
      if (isBannedNarration(text)) return;
      if (isStatusShellLine(text) || isActivityShellLine(text)) return;
      if (/可叙述|直接投递|探测本机|已发现 ·|Windows 能力/.test(text)) return;
      seen[text] = true;
      out.push({ text: text, kind: kind || 'hist' });
    }

    var desk = state.focusVm && state.focusVm.desk;
    var ck = desk && desk.continueCard;
    if (ck) {
      var ckTitle = pickUsableText(ck.title);
      if (ckTitle) {
        var who = String(ck.badge || ck.provider || '').trim();
        var when = String(ck.when || '').trim();
        push(
          (who ? who + ' · ' : '') + '上次：' + ckTitle + (when ? ' · ' + when : ''),
          'continue'
        );
      }
    }

    var home = state.homeSnap;
    if (home) {
      var sessions = home.recentSessions || home.recent_sessions || [];
      var si;
      for (si = 0; si < sessions.length && out.length < n; si++) {
        var sess = sessions[si];
        if (!sess) continue;
        var st = pickUsableText(sess.title, sess.summary, sess.name);
        if (!st) continue;
        var sp = String(sess.provider || sess.agent || '').trim();
        push((sp ? sp + ' · ' : '') + '最近：' + st, 'session');
      }
      var events = home.recentEvents || home.recent_events || [];
      if (events[0]) {
        var ev = pickUsableText(events[0].summary, events[0].title, events[0].message);
        if (ev) push(ev, 'event');
      }
      var active = home.activeSession || home.active_session;
      if (active) {
        var at = pickUsableText(active.title, active.summary);
        if (at) push('会话：' + at, 'session');
      }
    }

    var agents = state.agents || [];
    var ai;
    for (ai = 0; ai < agents.length && out.length < n; ai++) {
      var a = agents[ai];
      if (!a) continue;
      var line = pickUsableText(a.recentPrompt, a.title, sessionNarration(a));
      if (!line) continue;
      var name = (a.cat && a.cat.name) || a.kind || '';
      push((name ? name + ' · ' : '') + line, 'prompt');
    }

    if (!out.length) {
      var sel = state.selectedKind ? catalog(state.selectedKind) : null;
      if (sel && sel.name) {
        push('在底栏写给 ' + sel.name + '，发送后会送到它的输入框', 'help');
      } else {
        push('在底栏选一个 Agent，写一句就能发过去', 'help');
      }
    }
    return out.slice(0, n);
  }

  function windowsLabel(kindId) {
    var d = inventoryDiscovery(invRowForKind(kindId));
    if (!state.inventoryLoaded) return 'Windows 能力检测中';
    if (!d.discovered && !d.running) return '未探测到桌面 App / CLI';
    var agent = null;
    for (var i = 0; i < state.agents.length; i++) {
      if (state.agents[i].kind === kindId) {
        agent = state.agents[i];
        break;
      }
    }
    var canSend = !!(agent && agent.canSend);
    if (d.running && d.channel.indexOf('cli') >= 0) {
      return canSend ? 'CLI 已运行 · 可发送' : 'CLI 已运行 · 等待可发送动作';
    }
    if (d.running) return canSend ? '桌面 App 已运行 · 可发送' : '桌面 App 已运行 · 等待可发送动作';
    if (d.discovered) return canSend ? '已探测 · 可发送' : '已探测 · 未确认可发送';
    return '未探测到桌面 App';
  }

  function applyFocusDto(dto) {
    state.focusDto = dto || null;
    var Adapter = global.OneToneHomeFocusAdapter;
    var vm = null;
    if (Adapter && typeof Adapter.toViewModel === 'function' && dto) {
      vm = Adapter.toViewModel(dto);
      if (Adapter.enrichFromAttention && state.attention) {
        vm = Adapter.enrichFromAttention(vm, state.attention) || vm;
      }
      if (Adapter.enrichFromHomeSnapshot && state.homeSnap) {
        vm = Adapter.enrichFromHomeSnapshot(vm, state.homeSnap) || vm;
      }
    } else if (Adapter && dto == null && state.attention && Adapter.enrichFromAttention) {
      // Attention-only path: still project desk zones for Soft Pad wait / living.
      vm = Adapter.toViewModel ? Adapter.toViewModel({}) : { mode: 'quiet', desk: {} };
      vm = Adapter.enrichFromAttention(vm, state.attention) || vm;
      if (Adapter.enrichFromHomeSnapshot && state.homeSnap) {
        vm = Adapter.enrichFromHomeSnapshot(vm, state.homeSnap) || vm;
      }
    }
    state.focusVm = vm;
    if (!state.userLocked) sanitizeSelectedKind();
    var now = Date.now();
    state.evidence.mode = {
      source: 'cmd_home_focus_snapshot',
      observedAt: now,
      freshness: (dto && dto.source && dto.source.freshness) || (dto ? 'live' : 'unknown')
    };
    var proj = (dto && dto.project) || {};
    state.evidence.project = {
      source: 'cmd_home_focus_snapshot',
      observedAt: now,
      verified: !!proj.confirmed
    };
  }

  function emit() {
    var snap = getSnapshot();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snap);
      } catch (_) {}
    }
  }

  function buildSessionProjection(targetContext) {
    var Caps = capsApi();
    var ctx = targetContext || resolveTargetContext();
    var input = {
      selectedKind: state.selectedKind,
      wbSendMode: state.wbSendMode,
      workMode: state.workMode,
      projectPath: ctx.projectPath || null,
      agentId: ctx.agentId || null,
      handoffId: state.handoffId
    };
    var Atr = global.OneToneHomeAgentTask;
    if (Atr && typeof Atr.capabilityInput === 'function') {
      input = Object.assign(input, Atr.capabilityInput({
        agentTaskGrant: !!(state.activeAgentTaskId && state.agentTaskGrant)
      }));
    }
    if (Caps && typeof Caps.projectSession === 'function') {
      return Caps.projectSession(input);
    }
    // Fail-closed when capabilities module missing — never open permissions.
    return {
      sessionId: null,
      externalSessionId: null,
      handoffId: state.handoffId,
      title: '',
      role:
        state.selectedKind === 'workbuddy' && state.wbSendMode === 'local'
          ? 'think'
          : 'code',
      mode: state.workMode === 'readonly' || state.workMode === 'edit' ? state.workMode : 'think',
      modeEffective: false,
      modeReason: '能力投影模块未加载',
      projectPath: ctx.projectPath || null,
      agentKind: state.selectedKind,
      agentId: ctx.agentId || null,
      capabilities: Caps && Caps.closedCapabilities ? Caps.closedCapabilities() : {},
      permissions: Caps && Caps.closedPermissions ? Caps.closedPermissions() : {},
      diffRef: null,
      execution: 'idle'
    };
  }

  function getSnapshot() {
    var vm = state.focusVm;
    var mode = (vm && vm.mode) || 'quiet';
    var project = (state.focusDto && state.focusDto.project) || null;
    var targetContext = resolveTargetContext();
    var session = buildSessionProjection(targetContext);
    return {
      loadPhase: state.loadPhase,
      error: state.error,
      mode: mode,
      project: project,
      focusVm: vm,
      agents: state.agents.slice(),
      targets: state.targets.slice(),
      inventory: state.inventory,
      inventoryLoaded: state.inventoryLoaded,
      attention: state.attention,
      homeSnap: state.homeSnap,
      timeMachine: state.timeMachine,
      selectedKind: state.selectedKind,
      wbSendMode: state.wbSendMode,
      workMode: state.workMode,
      handoffId: state.handoffId,
      userLocked: state.userLocked,
      lockedProjectPath: state.lockedProjectPath,
      targetContext: targetContext,
      session: session,
      validationNotice: state.validationNotice,
      deliveryReceipt: state.deliveryReceipt,
      actionReceipt: state.actionReceipt,
      /** @deprecated use deliveryReceipt */
      receipt: state.deliveryReceipt || state.receipt,
      draft: state.draft,
      materials: state.materials.slice(),
      aimByAppId: Object.assign({}, state.aimByAppId),
      capabilities: {
        softPad: Object.assign({}, state.capabilities.softPad),
        voice: Object.assign({}, state.capabilities.voice),
        camera: Object.assign({}, state.capabilities.camera)
      },
      pickerOpen: state.pickerOpen,
      view: state.view,
      visible: state.visible,
      catalog: catalogList(),
      evidence: {
        mode: Object.assign({}, state.evidence.mode),
        project: Object.assign({}, state.evidence.project),
        agents: Object.assign({}, state.evidence.agents),
        inventory: Object.assign({}, state.evidence.inventory),
        delivery: Object.assign({}, state.evidence.delivery)
      },
      composing: composing,
      activeAgentTaskId: state.activeAgentTaskId,
      agentTaskGrant: !!state.agentTaskGrant,
      agentTask: state.agentTask ? Object.assign({}, state.agentTask) : null,
      agentTaskEvents: state.agentTaskEvents.slice(),
      agentTaskStack: (state.agentTaskStack || []).map(function (row) {
        return {
          task: row.task ? Object.assign({}, row.task) : null,
          events: (row.events || []).slice()
        };
      }),
      atrSendConflict: state.atrSendConflict
        ? Object.assign({}, state.atrSendConflict)
        : null
    };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') return function () {};
    listeners.push(listener);
    try {
      listener(getSnapshot());
    } catch (_) {}
    return function () {
      var idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    };
  }

  function loadLastGood() {
    try {
      var raw = global.sessionStorage.getItem(LAST_GOOD_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.snap) return null;
      var at = Number(parsed.savedAt || 0);
      if (!at || Date.now() - at > LAST_GOOD_MAX_AGE_MS) return null;
      return parsed;
    } catch (_) {
      return null;
    }
  }

  function saveLastGood(snap) {
    if (!snap) return;
    try {
      global.sessionStorage.setItem(
        LAST_GOOD_KEY,
        JSON.stringify({ snap: snap, savedAt: Date.now() })
      );
    } catch (_) {}
  }

  /** Last non-OneTone catalog FG (Cursor/Codex/…). Survives opening the homepage. */
  var lastExternalSendKind = null;

  function isSelfFgIdentity(id) {
    if (!id) return true;
    var exe = String(id.exeName || id.exe_name || '').toLowerCase();
    if (exe.indexOf('onetone') >= 0) return true;
    var path = String(id.fullPath || id.full_path || '').toLowerCase();
    return path.indexOf('onetone') >= 0 || path.indexOf('voice-pilot') >= 0;
  }

  /** FG / Focus app → catalog kind (cursor-chat → cursor). Soft Pad host is not this. */
  function foregroundSendKind() {
    var dto = state.focusDto;
    var appId =
      (dto && dto.foreground && (dto.foreground.appId || dto.foreground.app_id)) || '';
    if (appId) {
      var fromFocus = resolveKind(appId);
      if (fromFocus && catalog(fromFocus)) {
        lastExternalSendKind = fromFocus;
        return fromFocus;
      }
    }
    try {
      var rt = global.OneToneRuntimeHabitControl;
      var id = rt && rt.foregroundIdentity ? rt.foregroundIdentity() : null;
      if (!id) {
        var nav = global.OneToneHabitLayerNav;
        id = nav && nav.getForegroundIdentity ? nav.getForegroundIdentity() : null;
      }
      // Homepage FG = OneTone: ignore self, keep last Cursor/Codex from when user operated there.
      if (id && !isSelfFgIdentity(id)) {
        var aid =
          id.matchedPresetAppId ||
          id.matched_preset_app_id ||
          id.appId ||
          id.app_id ||
          '';
        var fromRt = resolveKind(aid);
        if (fromRt && catalog(fromRt)) {
          lastExternalSendKind = fromRt;
          return fromRt;
        }
      }
    } catch (_) {}
    return lastExternalSendKind;
  }

  function targetByKind(kindId) {
    for (var i = 0; i < state.targets.length; i++) {
      if (state.targets[i] && state.targets[i].kind === kindId) return state.targets[i];
    }
    return null;
  }

  function pickDefaultSelected() {
    if (state.userLocked && state.selectedKind) return;
    var i;
    var t;
    var rows = workRows(5);
    var fgKind = foregroundSendKind();
    // 1) Live work: needs → working (Soft Pad / attention — not process presence).
    for (i = 0; i < rows.length; i++) {
      if (rows[i] && isNeedsStatus(rows[i].status)) {
        state.selectedKind = rows[i].kind;
        return;
      }
    }
    // Prefer FG when it is the one working (Cursor FG must not lose to stale Codex).
    if (fgKind) {
      for (i = 0; i < rows.length; i++) {
        if (rows[i] && rows[i].kind === fgKind && isWorkingStatus(rows[i].status)) {
          state.selectedKind = fgKind;
          return;
        }
      }
    }
    for (i = 0; i < rows.length; i++) {
      if (rows[i] && isWorkingStatus(rows[i].status)) {
        state.selectedKind = rows[i].kind;
        return;
      }
    }
    // 2) Operated agent = live FG or sticky last external FG (homepage self).
    // ChatGPT/Codex may be startup-running in background — that is NOT "user is in Codex".
    if (fgKind) {
      t = targetByKind(fgKind);
      if (t && (t.running || t.canSend || t.discovered)) {
        state.selectedKind = fgKind;
        return;
      }
    }
    // No FG / no live work → Dock "选 Agent". Never invent from inventory.running.
    state.selectedKind = null;
  }

  /** Drop selection stuck on a closed/idle agent when live work exists elsewhere. */
  function sanitizeSelectedKind() {
    if (state.userLocked) return;
    var kind = state.selectedKind;
    if (!kind) {
      pickDefaultSelected();
      return;
    }
    var rows = workRows(5);
    var row = null;
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i] && rows[i].kind === kind) {
        row = rows[i];
        break;
      }
    }
    var live = row && (isNeedsStatus(row.status) || isWorkingStatus(row.status));
    if (live) return;
    var fgKind = foregroundSendKind();
    // Keep only if this is still the operated FG (or sticky after opening homepage).
    if (fgKind && fgKind === kind) {
      var keepT = targetByKind(fgKind);
      var keepInv = inventoryDiscovery(invRowForKind(fgKind));
      if (
        (keepT && (keepT.running || keepT.canSend || keepT.discovered)) ||
        keepInv.running ||
        keepInv.discovered
      ) {
        return;
      }
    }
    // Wrong agent, or only background process presence — re-pick (may clear).
    state.selectedKind = null;
    pickDefaultSelected();
  }

  function applyAgentSnap(snap, opts) {
    opts = opts || {};
    state.snapshot = snap || null;
    state.agents = projectAgents(snap);
    state.targets = projectTargets();
    if (!state.userLocked) pickDefaultSelected();
    var now = Date.now();
    state.evidence.agents = {
      source: 'cmd_agent_center_snapshot',
      observedAt: now,
      freshness: opts.stale ? 'stale' : opts.error ? 'error' : 'live'
    };
    if (opts.stale) {
      state.loadPhase = 'stale';
      state.error = null;
    } else if (opts.error) {
      state.loadPhase = state.agents.length ? 'stale' : 'error';
      state.error = opts.error;
    } else {
      state.loadPhase = 'ready';
      state.error = null;
      if (snap) saveLastGood(snap);
    }
  }

  function applyCenterResult(snap) {
    if (snap && snap.__err) {
      if (!state.snapshot && !state.agents.length) {
        applyAgentSnap(null, { error: String((snap.__err && snap.__err.message) || snap.__err) });
      } else {
        state.loadPhase = 'stale';
        state.error = String((snap.__err && snap.__err.message) || snap.__err);
        state.targets = projectTargets();
      }
      return;
    }
    applyAgentSnap(snap, {});
  }

  function applyFocusBundle(focusDto) {
    var Focus = global.OneToneHomeFocusStore;
    if (focusDto) applyFocusDto(focusDto);
    else if (Focus && Focus.get) applyFocusDto(Focus.get());
    else applyFocusDto(null);
  }

  function applyInventoryResult(inv) {
    state.inventoryLoaded = true;
    if (inv) {
      state.inventory = inv;
      state.evidence.inventory = {
        source: 'cmd_agent_install_inventory',
        observedAt: Date.now(),
        freshness: 'live'
      };
      state.targets = projectTargets();
      if (!state.userLocked) pickDefaultSelected();
    } else if (!state.inventory) {
      state.evidence.inventory = {
        source: 'cmd_agent_install_inventory',
        observedAt: Date.now(),
        freshness: 'error'
      };
    }
  }

  /**
   * Fast path: Center + attention + Focus → paint ready.
   * Slow path: inventory (EnumWindows/CLI) + homeSnap — must not gate first paint.
   */
  function atrApi() {
    return global.OneToneHomeAgentTask || null;
  }

  function atrFeatureOn() {
    var A = atrApi();
    return !!(A && A.featureEnabled && A.featureEnabled());
  }

  function rememberAgentTask(dto, events) {
    if (!dto || !dto.taskId) return;
    var id = String(dto.taskId);
    var row = {
      task: Object.assign({}, dto),
      events: Array.isArray(events) ? events.slice() : []
    };
    var list = (state.agentTaskStack || []).slice();
    var i;
    var found = false;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].task && String(list[i].task.taskId) === id) {
        list[i] = row;
        found = true;
        break;
      }
    }
    if (!found) list.push(row);
    if (list.length > ATR_STACK_MAX) {
      list = list.slice(list.length - ATR_STACK_MAX);
    }
    state.agentTaskStack = list;
  }

  function setActiveAgentTask(taskId, opts) {
    opts = opts || {};
    state.activeAgentTaskId = taskId ? String(taskId) : null;
    state.agentTaskGrant = !!opts.grant || !!state.activeAgentTaskId;
    var A = atrApi();
    if (A && A.writeActiveId) A.writeActiveId(state.activeAgentTaskId);
    if (state.activeAgentTaskId) {
      ensureAtrPoll();
      return refreshAgentTask().then(function () {
        emit();
        return state.agentTask;
      });
    }
    stopAtrPoll();
    state.agentTask = null;
    state.agentTaskEvents = [];
    emit();
    return Promise.resolve(null);
  }

  function refreshAgentTask() {
    var A = atrApi();
    var id = state.activeAgentTaskId;
    if (!A || !id || !atrFeatureOn()) {
      return Promise.resolve(null);
    }
    return Promise.all([
      A.status(id).catch(function () {
        return null;
      }),
      A.events(id).catch(function () {
        return [];
      })
    ]).then(function (pair) {
      var dto = pair[0];
      var evs = pair[1] || [];
      if (dto) {
        state.agentTask = dto;
        state.agentTaskGrant = true;
        if (
          atrSendInFlight &&
          (dto.status === 'running' ||
            dto.status === 'verifying' ||
            dto.status === 'repair' ||
            dto.status === 'review')
        ) {
          var turn = dto.currentTurn != null ? dto.currentTurn : 0;
          var tools = dto.toolCallCount != null ? dto.toolCallCount : 0;
          atrNotice(
            'atr_driving',
            '执行中 · 第 ' + turn + ' 步' + (tools ? ' · ' + tools + ' 次工具' : '') + ' · ' + (dto.status || ''),
            { code: 'driving', taskId: dto.taskId, status: dto.status }
          );
        }
        if (
          dto.status === 'done' ||
          dto.status === 'failed' ||
          dto.status === 'cancelled'
        ) {
          /* keep id for timeline until user clears */
        }
        if (dto.status === 'done') {
          maybeMarkEditVerifiedFromEvents(dto, evs);
        }
      }
      state.agentTaskEvents = Array.isArray(evs) ? evs : [];
      if (state.agentTask) rememberAgentTask(state.agentTask, state.agentTaskEvents);
      return dto;
    });
  }

  /**
   * Backend evaluate_verify owns admission. Never write FE localStorage marks from UI selection.
   * Hook kept so refreshAgentTask can call evaluate after done (wired in fe-consume).
   */
  function maybeMarkEditVerifiedFromEvents(dto, evs) {
    var A = atrApi();
    if (!A || !dto || String(dto.status || '') !== 'done') return;
    if (!A.evaluateVerify || !dto.verifyIntent) return;
    var list = Array.isArray(evs) ? evs : state.agentTaskEvents || [];
    var wrote = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 'patch_applied') {
        wrote = true;
        break;
      }
    }
    if (!wrote) return;
    A.evaluateVerify(dto.taskId)
      .then(function (res) {
        if (res && res.ok) {
          atrNotice(
            'atr_verify_accepted',
            '隔离验证已通过后端验收（不宣称稳定）',
            { code: 'verify_accepted', provider: res.providerId }
          );
        }
        emit();
      })
      .catch(function () {});
  }

  function ensureAtrPoll() {
    if (atrPollTimer || !atrFeatureOn() || !state.activeAgentTaskId) return;
    atrPollTimer = global.setInterval(function () {
      if (!state.mounted || !state.activeAgentTaskId) return;
      refreshAgentTask().then(function () {
        if (state.mounted) emit();
      });
    }, ATR_POLL_MS);
  }

  function stopAtrPoll() {
    if (atrPollTimer) {
      clearInterval(atrPollTimer);
      atrPollTimer = 0;
    }
  }

  function atrBusyStatuses() {
    return {
      running: 1,
      verifying: 1,
      repair: 1,
      review: 1
    };
  }

  function isAgentTaskBusy(status) {
    return !!atrBusyStatuses()[String(status || '')];
  }

  function isAgentTaskBlockingNew(status) {
    var s = String(status || '');
    return (
      isAgentTaskBusy(s) || s === 'waiting' || s === 'interrupted'
    );
  }

  function confirmedProjectPath() {
    var ctx = resolveTargetContext();
    var path = ctx && ctx.projectPath ? String(ctx.projectPath).trim() : '';
    if (!path) return null;
    var proj = (state.focusDto && state.focusDto.project) || {};
    var confirmed =
      !!proj.confirmed ||
      !!(state.userLocked && state.lockedProjectPath) ||
      !!(state.evidence && state.evidence.project && state.evidence.project.verified);
    return confirmed ? path : null;
  }

  /** Path we can send ATR against — confirmed, or known workspace root awaiting confirm. */
  function atrCandidateProjectPath() {
    var confirmed = confirmedProjectPath();
    if (confirmed) return confirmed;
    var ctx = resolveTargetContext();
    var path = ctx && ctx.projectPath ? String(ctx.projectPath).trim() : '';
    return path || null;
  }

  /** Confirm Focus project if needed, then return workspace root for ATR. */
  function ensureAtrWorkspaceRoot() {
    var ready = confirmedProjectPath();
    if (ready) return Promise.resolve(ready);
    var path = atrCandidateProjectPath();
    if (!path) return Promise.resolve(null);
    var Focus = global.OneToneHomeFocusStore;
    if (!Focus || typeof Focus.confirmProject !== 'function') {
      // Fallback: treat user-locked path as enough for this session.
      if (state.userLocked && path) {
        state.lockedProjectPath = path;
        state.lockedProjectSource = state.lockedProjectSource || 'user_locked';
        return Promise.resolve(path);
      }
      return Promise.resolve(null);
    }
    var proj = (state.focusDto && state.focusDto.project) || {};
    return Focus.confirmProject({
      projectRoot: path,
      projectId: proj.id || null
    })
      .then(function () {
        state.lockedProjectPath = path;
        state.lockedProjectSource = 'atr_auto_confirm';
        state.userLocked = true;
        emit();
        return confirmedProjectPath() || path;
      })
      .catch(function () {
        // Still allow ATR if we have a concrete path the user is staring at.
        state.lockedProjectPath = path;
        state.lockedProjectSource = 'atr_path_fallback';
        state.userLocked = true;
        return path;
      });
  }

  function atrNotice(kind, message, extra) {
    setValidationNotice(
      Object.assign(
        {
          kind: kind,
          message: message || kind
        },
        extra || {}
      )
    );
  }

  function driveActiveIfRunning(opts) {
    opts = opts || {};
    var A = atrApi();
    var id = state.activeAgentTaskId;
    if (!A || !id) return Promise.resolve(state.agentTask);
    return refreshAgentTask().then(function (dto) {
      var t = dto || state.agentTask;
      if (!t) return null;
      var st = String(t.status || '');
      // After approve → verifying; after reject/input → running; resume may leave running.
      var shouldDrive =
        st === 'running' ||
        st === 'verifying' ||
        st === 'repair' ||
        st === 'review' ||
        opts.force;
      if (!shouldDrive) {
        emit();
        return t;
      }
      if (atrDriveInFlightByTask[id]) {
        return atrDriveInFlightByTask[id];
      }
      var driveFn =
        opts.useFake && A.driveFake
          ? function () {
              return A.driveFake(id, opts.fakeSteps || []);
            }
          : function () {
              var provider =
                opts.provider ||
                (A.readProvider && A.readProvider()) ||
                undefined;
              return A.drive ? A.drive(id, provider) : A.driveDeepseek(id);
            };
      var p = driveFn()
        .then(function (driven) {
          if (driven) state.agentTask = driven;
          return refreshAgentTask().then(function () {
            emit();
            return state.agentTask;
          });
        })
        .catch(function (err) {
          var raw = String((err && err.message) || err || 'drive_failed');
          var code = (err && err.code) || 'drive_failed';
          if (/max_turns|stuck_loop|budget_exhausted/i.test(raw)) code = 'budget_exhausted';
          var msg =
            code === 'budget_exhausted'
              ? /stuck_loop/i.test(raw)
                ? '编辑任务空转（反复同一操作）— 请写清目标后重试，或放弃当前任务'
                : '编辑任务步数用尽 — 请写清目标后重试，或放弃当前任务'
              : '编辑任务失败：' + raw;
          atrNotice('atr_' + code, msg, {
            code: code,
            actions: ['abandon']
          });
          return refreshAgentTask().then(function () {
            emit();
            return state.agentTask;
          });
        })
        .then(
          function (result) {
            delete atrDriveInFlightByTask[id];
            return result;
          },
          function (err) {
            delete atrDriveInFlightByTask[id];
            return Promise.reject(err);
          }
        );
      atrDriveInFlightByTask[id] = p;
      return p;
    });
  }

  function pendingApprovalTokenOf(task) {
    task = task || {};
    var tok = task.pendingApprovalToken || task.pending_approval_token || '';
    if (tok) return String(tok);
    var evs = state.agentTaskEvents || [];
    for (var i = evs.length - 1; i >= 0; i--) {
      var e = evs[i];
      if (!e || e.kind !== 'waiting_approval' || !e.payload) continue;
      var p = e.payload.approvalToken || e.payload.approval_token;
      if (p) return String(p);
    }
    return '';
  }

  function approveAgentPatch(opts) {
    opts = opts || {};
    var A = atrApi();
    var t = state.agentTask;
    var token = pendingApprovalTokenOf(t);
    if (!A || !t || !token) {
      return Promise.reject(new Error('no_pending'));
    }
    if (opts.persistAutonomous && A.writePermissionMode) {
      A.writePermissionMode('write_autonomous');
    }
    return A.approvePatch(t.taskId, token, {
      persistAutonomous: !!opts.persistAutonomous
    }).then(function (dto) {
      state.agentTask = dto;
      return driveActiveIfRunning();
    });
  }

  function rejectAgentPatch() {
    var A = atrApi();
    var t = state.agentTask;
    var token = pendingApprovalTokenOf(t);
    if (!A || !t || !token) {
      return Promise.reject(new Error('no_pending'));
    }
    return A.rejectPatch(t.taskId, token).then(function (dto) {
      state.agentTask = dto;
      return driveActiveIfRunning();
    });
  }

  function submitAgentInput(text) {
    var A = atrApi();
    var t = state.agentTask;
    if (!A || !t) return Promise.reject(new Error('no_task'));
    return A.submitUserInput(t.taskId, text).then(function (dto) {
      state.agentTask = dto;
      return driveActiveIfRunning();
    });
  }

  function resumeAgentTask() {
    var A = atrApi();
    var id = state.activeAgentTaskId;
    if (!A || !id) return Promise.reject(new Error('no_task'));
    return A.resume(id).then(function (dto) {
      state.agentTask = dto;
      return driveActiveIfRunning();
    });
  }

  function resumeAndDriveAgentTask() {
    return resumeAgentTask();
  }

  function abandonAgentTask() {
    var A = atrApi();
    var id = state.activeAgentTaskId;
    if (!A || !id || !A.abandon) return Promise.reject(new Error('no_task'));
    return A.abandon(id).then(function (dto) {
      rememberAgentTask(dto || state.agentTask, state.agentTaskEvents);
      state.agentTask = dto || null;
      state.activeAgentTaskId = null;
      state.agentTaskGrant = false;
      state.agentTaskEvents = [];
      stopAtrPoll();
      atrNotice('atr_abandoned', '已放弃当前编辑任务');
      emit();
      return dto;
    });
  }

  function clearAtrSendConflict(opts) {
    opts = opts || {};
    state.atrSendConflict = null;
    if (!opts.silent) emit();
  }

  /** Keep draft, dismiss send conflict — old task untouched. */
  function keepDraftDeferAtrSend() {
    clearAtrSendConflict({ silent: true });
    atrNotice('atr_keep_draft', '已保留草稿，当前编辑任务未改动', {
      code: 'keep_draft'
    });
    emit();
    return Promise.resolve(null);
  }

  /**
   * Check goal / project / engine before abandoning anything.
   * @returns {Promise<{ok:boolean, code?:string, message?:string, path?:string, provider?:string}>}
   */
  function preflightAtrStart(opts) {
    opts = opts || {};
    var goal = String(opts.goal || '').trim();
    if (!goal || goal.length < 2 || /^[\d\s.]+$/.test(goal)) {
      return Promise.resolve({
        ok: false,
        code: 'need_goal',
        message: '请写清要改什么（例如：给 README 加使用说明）'
      });
    }
    var A = atrApi();
    if (!A || !atrFeatureOn()) {
      return Promise.resolve({
        ok: false,
        code: 'not_ready',
        message: 'Agent Task Runtime 未开启'
      });
    }
    return ensureAtrWorkspaceRoot().then(function (path) {
      if (!path) {
        return {
          ok: false,
          code: 'need_project',
          message: '请先在工作区确认项目后再发送'
        };
      }
      var useFake =
        !!opts.useFakeDriver ||
        (Array.isArray(opts.driveFakeSteps) && opts.driveFakeSteps.length);
      if (useFake) {
        return { ok: true, path: path, provider: null };
      }
      if (!A.ready) {
        return { ok: true, path: path, provider: opts.provider || null };
      }
      return A.ready()
        .then(function (info) {
          var preferred =
            opts.provider || (A.readProvider && A.readProvider()) || '';
          var list =
            (info && Array.isArray(info.providers) && info.providers) || [];
          var want = String(preferred || '').trim().toLowerCase();
          var row = null;
          var i;
          if (want) {
            for (i = 0; i < list.length; i++) {
              if (String((list[i] && list[i].id) || '').toLowerCase() === want) {
                row = list[i];
                break;
              }
            }
            if (row && row.ready === false) {
              return {
                ok: false,
                code: want + '_unconfigured',
                message:
                  want.indexOf('workbuddy') >= 0
                    ? '请先登录 WorkBuddy（账号模型），再发编辑任务'
                    : '所选引擎未就绪 — 请登录 WorkBuddy 或配置 Soft Pad 密钥'
              };
            }
            if (row && row.editCapable === false) {
              return {
                ok: false,
                code: 'provider_not_edit_capable',
                message: '所选引擎尚未开放普通编辑 — 请先完成隔离验证或另选引擎'
              };
            }
            if (!row && list.length) {
              return {
                ok: false,
                code: (want || 'provider') + '_unconfigured',
                message: '所选引擎不可用 — 请另选或配置后再发送'
              };
            }
            return { ok: true, path: path, provider: preferred || want };
          }
          var anyReady = false;
          for (i = 0; i < list.length; i++) {
            if (list[i] && list[i].ready && list[i].editCapable !== false) {
              anyReady = true;
              break;
            }
          }
          if (
            !anyReady &&
            !(info && (info.workbuddyReady || info.deepseekReady))
          ) {
            return {
              ok: false,
              code: 'provider_unconfigured',
              message: '请登录 WorkBuddy，或配置 Soft Pad 密钥后选择已就绪引擎'
            };
          }
          return {
            ok: true,
            path: path,
            provider: (info && info.selectedDefault) || null
          };
        })
        .catch(function (err) {
          return {
            ok: false,
            code: 'not_ready',
            message: String((err && err.message) || err || 'ready_failed')
          };
        });
    });
  }

  /**
   * Abandon blocking ATR task, then start a new one with the current draft.
   * Preflight first — never abandon if project/engine cannot start.
   * @param {{ goal: string, materialsSummary?: string, provider?: string, useFakeDriver?: boolean, driveFakeSteps?: string[] }} opts
   */
  function abandonAndStartAgentTask(opts) {
    opts = opts || {};
    var goal = String(opts.goal || (state.atrSendConflict && state.atrSendConflict.goal) || '').trim();
    var mats =
      opts.materialsSummary != null
        ? opts.materialsSummary
        : (state.atrSendConflict && state.atrSendConflict.materialsSummary) || '';
    var startOpts = Object.assign({}, opts, {
      goal: goal,
      materialsSummary: mats,
      skipBlockingCheck: true
    });
    return preflightAtrStart(startOpts).then(function (pf) {
      if (!pf.ok) {
        atrNotice('atr_' + (pf.code || 'preflight'), pf.message || '无法启动新任务', {
          code: pf.code || 'preflight',
          abandoned: false
        });
        emit();
        return null;
      }
      if (pf.provider && !startOpts.provider) startOpts.provider = pf.provider;
      var abandoned = false;
      return abandonAgentTask()
        .catch(function (err) {
          if (String((err && err.message) || err) === 'no_task') return null;
          return Promise.reject(err);
        })
        .then(function () {
          abandoned = true;
          state.atrSendConflict = null;
          return startAndDriveAgentTask(startOpts);
        })
        .then(function (dto) {
          if (abandoned && !dto) {
            atrNotice(
              'atr_abandon_start_failed',
              '旧任务已放弃，新任务未创建 — 草稿仍在，请检查项目/引擎后重发',
              {
                code: 'abandon_start_failed',
                abandoned: true,
                actions: ['retry_send']
              }
            );
            emit();
          }
          return dto;
        })
        .catch(function (err) {
          var raw = String((err && err.message) || err || '');
          atrNotice(
            'atr_abandon_start_failed',
            abandoned
              ? '旧任务已放弃，新任务未创建：' + raw.slice(0, 120)
              : '放弃或启动失败：' + raw.slice(0, 120),
            {
              code: 'abandon_start_failed',
              abandoned: abandoned
            }
          );
          emit();
          return null;
        });
    });
  }

  /**
   * Home edit send → ATR. Surfaces all failures via validationNotice.
   * Blocking task + new goal → atrSendConflict (explicit triage), never silent abandon.
   * @param {{ goal: string, materialsSummary?: string, useFakeDriver?: boolean, driveFakeSteps?: string[], skipBlockingCheck?: boolean }} opts
   */
  function startAndDriveAgentTask(opts) {
    opts = opts || {};
    if (atrSendInFlight) return atrSendInFlight;

    var A = atrApi();
    if (!A || !atrFeatureOn()) {
      atrNotice('atr_not_ready', 'Agent Task Runtime 未开启', { code: 'not_ready' });
      return Promise.resolve(null);
    }

    var existing = state.agentTask;
    var est = existing && existing.status;
    var goal = String(opts.goal || '').trim();
    if (existing && isAgentTaskBlockingNew(est) && !opts.skipBlockingCheck) {
      var goalOk = goal && goal.length >= 2 && !/^[\d\s.]+$/.test(goal);
      if (goalOk) {
        state.atrSendConflict = {
          goal: goal,
          materialsSummary: String(opts.materialsSummary || ''),
          status: String(est || ''),
          taskId: existing.taskId || null
        };
        if (!String(state.draft || '').trim()) state.draft = goal;
      } else {
        state.atrSendConflict = null;
      }
      var conflictActions = goalOk
        ? ['continue', 'abandon_and_send', 'keep_draft']
        : ['continue', 'abandon'];
      if (isAgentTaskBusy(est)) {
        atrNotice(
          'atr_busy',
          goalOk
            ? '已有编辑任务进行中 — 查看进度、放弃并发送草稿，或保留草稿稍后处理'
            : '编辑任务进行中，请等待完成或放弃后再发',
          {
            code: 'busy',
            taskId: existing.taskId,
            status: est,
            actions: conflictActions,
            sendConflict: !!goalOk
          }
        );
      } else if (est === 'waiting') {
        atrNotice(
          'atr_waiting',
          goalOk
            ? '编辑任务等待确认 — 处理待确认、放弃并发送草稿，或保留草稿稍后处理'
            : '编辑任务等待确认 — 可处理待确认或放弃',
          {
            code: 'waiting',
            taskId: existing.taskId,
            status: est,
            actions: conflictActions,
            sendConflict: !!goalOk
          }
        );
      } else if (est === 'interrupted') {
        atrNotice(
          'atr_interrupted',
          goalOk
            ? '有可恢复的中断任务 — 恢复、放弃并发送草稿，或保留草稿稍后处理'
            : '有可恢复的中断任务 — 恢复或放弃',
          {
            code: 'interrupted',
            taskId: existing.taskId,
            status: est,
            actions: conflictActions,
            sendConflict: !!goalOk
          }
        );
      }
      emit();
      return Promise.resolve(null);
    }

    if (!goal || goal.length < 2 || /^[\d\s.]+$/.test(goal)) {
      atrNotice('atr_need_goal', '请写清要改什么（例如：给 README 加使用说明）');
      return Promise.resolve(null);
    }

    state.atrSendConflict = null;

    atrSendInFlight = (
      opts.verifySandboxRoot
        ? Promise.resolve(String(opts.verifySandboxRoot))
        : ensureAtrWorkspaceRoot()
    )
      .then(function (path) {
        if (!path) {
          atrNotice('atr_need_project', '请先在工作区确认项目后再发送', {
            code: 'need_project'
          });
          return null;
        }
        var provider =
          opts.provider || (A.readProvider && A.readProvider()) || undefined;
        var allowTry =
          !!opts.allowTryEdit ||
          !!(A.pathLooksLikeVerifySandbox && A.pathLooksLikeVerifySandbox(path));
        atrNotice(
          'atr_starting',
          '正在启动' +
            (provider ? '（' + provider + '）' : '') +
            (allowTry && !opts.useFakeDriver ? ' · 试用/验证' : '') +
            '…',
          { code: 'starting' }
        );
        return A.runGoal({
          goal: goal,
          workspaceRoot: path,
          materialsSummary: opts.materialsSummary || '',
          permissionMode:
            opts.permissionMode ||
            (A.readPermissionMode && A.readPermissionMode()) ||
            'write_with_approval',
          useFakeDriver: !!opts.useFakeDriver,
          driveFakeSteps: opts.driveFakeSteps,
          provider: provider,
          allowTryEdit: allowTry,
          sandboxId: opts.sandboxId || null,
          onStarted: function (dto) {
            if (!dto || !dto.taskId) return;
            state.activeAgentTaskId = dto.taskId;
            state.agentTaskGrant = true;
            state.agentTask = dto;
            state.agentTaskEvents = [];
            rememberAgentTask(dto, []);
            if (A.writeActiveId) A.writeActiveId(dto.taskId);
            ensureAtrPoll();
            atrNotice(
              'atr_driving',
              '模型执行中' + (provider ? '（' + provider + '）' : '') + ' · 可点放弃',
              {
                code: 'driving',
                taskId: dto.taskId,
                actions: ['abandon']
              }
            );
            emit();
          }
        });
      })
      .then(function (dto) {
        if (!dto) return null;
        if (dto.taskId) {
          state.activeAgentTaskId = dto.taskId;
          state.agentTaskGrant = true;
          state.agentTask = dto;
          if (A.writeActiveId) A.writeActiveId(dto.taskId);
          ensureAtrPoll();
        }
        return refreshAgentTask().then(function () {
          var st = (state.agentTask && state.agentTask.status) || (dto && dto.status) || '';
          if (st === 'waiting') {
            atrNotice('atr_waiting', '等待确认补丁 — 请批准或拒绝', {
              code: 'waiting',
              taskId: dto.taskId,
              status: st,
              actions: ['continue', 'abandon']
            });
          } else if (st === 'done') {
            state.validationNotice = null;
            // Quiet: don't blast a hero "编辑任务已完成" receipt — ATR gate / timeline carries detail.
            setDeliveryReceipt({
              phase: 'done',
              outcome: 'local_replied',
              kind: 'agent_task',
              title: '编辑回合结束',
              message: 'done',
              verified: false,
              taskId: dto.taskId
            });
          } else {
            state.validationNotice = null;
            setDeliveryReceipt({
              phase: 'done',
              outcome: 'local_replied',
              kind: 'agent_task',
              title: 'Agent 任务已更新',
              message: st || 'running',
              verified: false,
              taskId: dto.taskId
            });
          }
          emit();
          return state.agentTask;
        });
      })
      .catch(function (err) {
        var code = (err && err.code) || 'drive_failed';
        var rawMsg = String((err && err.message) || err || '');
        var budget =
          /max_turns|stuck_loop|budget_exhausted/i.test(rawMsg) ||
          /max_turns|stuck_loop|budget_exhausted/i.test(String(code));
        if (budget) code = 'budget_exhausted';
        var formatFail =
          /parse_|not_json|format_error|no_tool_calls|unsupported_shape/i.test(rawMsg) ||
          code === 'format_error';
        if (formatFail) code = 'format_error';
        if (
          /workbuddy_unconfigured/i.test(rawMsg) ||
          code === 'workbuddy_unconfigured' ||
          /workbuddy_edit_disabled/i.test(rawMsg) ||
          code === 'workbuddy_edit_disabled'
        ) {
          code = 'workbuddy_unconfigured';
        }
        if (
          /edit_not_admitted/i.test(rawMsg) ||
          code === 'edit_not_admitted'
        ) {
          code = 'edit_not_admitted';
        }
        if (
          /provider_not_edit_capable/i.test(rawMsg) ||
          code === 'provider_not_edit_capable'
        ) {
          code = 'provider_not_edit_capable';
        }
        var msg =
          code === 'edit_not_admitted' || code === 'provider_not_edit_capable'
            ? '需先隔离验证引擎，通过后再开放普通编辑'
            : code === 'workbuddy_unconfigured'
              ? '请先登录 WorkBuddy（账号模型），再发编辑任务'
              : code === 'provider_unconfigured' ||
                  /_unconfigured$/.test(String(code))
                ? code.indexOf('workbuddy') >= 0
                  ? '请先登录 WorkBuddy（账号模型），再发编辑任务'
                  : '请登录 WorkBuddy，或配置 Soft Pad 密钥后选择已就绪引擎'
                : code === 'not_ready'
                  ? 'Agent Task Runtime 未就绪'
                  : code === 'start_failed'
                    ? '启动任务失败：' + rawMsg
                    : code === 'budget_exhausted'
                      ? /stuck_loop/i.test(rawMsg)
                        ? '编辑任务空转（反复同一操作）— 请写清目标后重试，或放弃当前任务'
                        : '编辑任务步数用尽 — 请写清目标后重试，或放弃当前任务'
                      : code === 'format_error'
                        ? '模型没有按工具格式行动 — 换 WorkBuddy 模型或 Soft Pad 引擎后重试'
                        : '编辑任务失败：' + rawMsg.slice(0, 120);
        // start may have written activeId before drive failed — keep for timeline.
        if (A.readActiveId) {
          var sid = A.readActiveId();
          if (sid) {
            state.activeAgentTaskId = sid;
            state.agentTaskGrant = true;
            ensureAtrPoll();
          }
        }
        atrNotice('atr_' + code, msg, {
          code: code,
          actions:
            code === 'budget_exhausted' ||
            code === 'drive_failed' ||
            code === 'format_error'
              ? ['abandon']
              : undefined
        });
        return refreshAgentTask().then(function () {
          emit();
          return null;
        });
      })
      .then(
        function (result) {
          atrSendInFlight = null;
          return result;
        },
        function (err) {
          atrSendInFlight = null;
          return Promise.reject(err);
        }
      );

    return atrSendInFlight;
  }

  function refresh(reason) {
    if (refreshInFlight) return refreshInFlight;
    lastRefreshAt = Date.now();
    var gen = ++refreshGen;
    var Focus = global.OneToneHomeFocusStore;
    var focusP =
      Focus && typeof Focus.fetch === 'function'
        ? Focus.fetch().catch(function () {
            return Focus.get ? Focus.get() : null;
          })
        : Promise.resolve(null);

    var centerP = invoke('cmd_agent_center_snapshot', { args: {} }).catch(function (e) {
      return { __err: e };
    });
    var attnP = invoke('cmd_agent_attention_snapshot', {}).catch(function () {
      return null;
    });
    var invP = invoke('cmd_agent_install_inventory', {}).catch(function () {
      return null;
    });
    var homeP = invoke('cmd_agent_home_snapshot', {}).catch(function () {
      return null;
    });
    var tmP = invoke('cmd_tm_status', {}).catch(function () {
      return null;
    });

    var atrHydrate = Promise.resolve(null);
    if (atrFeatureOn()) {
      var A0 = atrApi();
      if (!state.activeAgentTaskId && A0 && A0.readActiveId) {
        state.activeAgentTaskId = A0.readActiveId();
        if (state.activeAgentTaskId) state.agentTaskGrant = true;
      }
      if (state.activeAgentTaskId) {
        ensureAtrPoll();
        atrHydrate = refreshAgentTask();
      }
    }

    var run = Promise.all([centerP, attnP, focusP, atrHydrate]).then(function (v) {
      applyCenterResult(v[0]);
      if (v[1]) state.attention = v[1];
      applyFocusBundle(v[2]);
      syncMaterialsFromPrep({ emit: false });
      emit();
      return getSnapshot();
    });

    // Background: inventory + homeSnap + Time Capsule status — emit when ready.
    Promise.all([invP, homeP, tmP]).then(function (v) {
      if (gen !== refreshGen) return;
      var inv = v[0];
      var home = v[1];
      var tm = v[2];
      applyInventoryResult(inv);
      if (home) state.homeSnap = home;
      if (tm) state.timeMachine = tm;
      // Re-enrich Focus desk now that homeSnap / inventory exist.
      applyFocusBundle(state.focusDto);
      if (state.mounted) emit();
    });

    refreshInFlight = run.then(
      function (s) {
        if (refreshInFlight === run) refreshInFlight = null;
        return s;
      },
      function (e) {
        if (refreshInFlight === run) refreshInFlight = null;
        state.loadPhase = state.agents.length ? 'stale' : 'error';
        state.error = String((e && e.message) || e || 'ipc_failed');
        emit();
        throw e;
      }
    );
    return refreshInFlight;
  }

  function scheduleRefresh(reason) {
    if (coalesceTimer) clearTimeout(coalesceTimer);
    coalesceTimer = setTimeout(function () {
      coalesceTimer = 0;
      if (!state.mounted) return;
      refresh(reason || 'coalesce');
    }, COALESCE_MS);
  }

  function syncMaterialsFromPrep(opts) {
    opts = opts || {};
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep) return;
    var summary =
      typeof Prep.getMaterialSummary === 'function' ? Prep.getMaterialSummary() : null;
    var refs = (summary && summary.refs) || [];
    state.materials = refs.filter(Boolean);
    // Dock paste/addFiles may land after Prep notify — emit so cards paint.
    if (opts.emit !== false) emit();
  }

  function setSelected(kind, opts) {
    opts = opts || {};
    var k = resolveKind(kind) || kind;
    if (!k) return;
    // Ban selecting inventing undiscovered catalog-only kinds for send path.
    var t = null;
    for (var i = 0; i < state.targets.length; i++) {
      if (state.targets[i].kind === k) {
        t = state.targets[i];
        break;
      }
    }
    if (!t || !t.canSelect) {
      // Allow lock only if agent center has the kind.
      var found = false;
      for (i = 0; i < state.agents.length; i++) {
        if (state.agents[i].kind === k) {
          found = true;
          break;
        }
      }
      if (!found && !opts.force) return;
    }
    state.selectedKind = k;
    if (opts.lock !== false) {
      state.userLocked = true;
      // Resolve path for this Agent without the previous lock shadowing Focus/TM.
      state.lockedProjectPath = null;
      state.lockedProjectSource = null;
      var ctx = resolveTargetContext();
      state.lockedProjectPath = ctx.projectPath || null;
      state.lockedProjectSource = ctx.projectPath ? 'user_locked' : null;
    }
    if (opts.closePicker) state.pickerOpen = false;
    state.validationNotice = null;
    emit();
  }

  /** 「跟随识别」— unlock send target so pickDefault can follow live work. */
  function clearSelected(opts) {
    opts = opts || {};
    state.selectedKind = null;
    state.userLocked = false;
    state.lockedProjectPath = null;
    state.lockedProjectSource = null;
    if (opts.closePicker) state.pickerOpen = false;
    if (!opts.skipPick) pickDefaultSelected();
    emit();
  }

  function setView(view) {
    state.view = view === 'agent' ? 'agent' : 'home';
    emit();
  }

  function setPickerOpen(open) {
    state.pickerOpen = !!open;
    emit();
  }

  /**
   * @deprecated Prefer setDeliveryReceipt / setActionReceipt / setValidationNotice.
   * Kept for callers that still pass delivery-shaped objects.
   */
  function setReceipt(receipt) {
    if (!receipt) {
      state.deliveryReceipt = null;
      state.receipt = null;
      emit();
      return;
    }
    setDeliveryReceipt(receipt);
  }

  /** Gate / missing-project notice — does NOT touch evidence.delivery. */
  function setValidationNotice(notice) {
    state.validationNotice = notice || null;
    emit();
  }

  /**
   * Delivery / local-chat attempt result only.
   * outcome: pasted_confirmed | activated_confirmed | local_replied | attempted | failed | delivery_attempt
   * kind: 'local_chat' marks in-app WorkBuddy LLM (not desktop paste).
   */
  function setDeliveryReceipt(receipt) {
    state.deliveryReceipt = receipt || null;
    state.receipt = state.deliveryReceipt;
    state.validationNotice = null;
    if (receipt && receipt.outcome !== undefined) {
      var verified =
        receipt.outcome === 'pasted_confirmed' ||
        receipt.outcome === 'activated_confirmed' ||
        receipt.outcome === 'local_replied' ||
        !!(receipt.verified || receipt.inputConfirmed);
      state.evidence.delivery = {
        source: 'cmd_agent_center_action',
        observedAt: Date.now(),
        verified: verified,
        outcome: receipt.outcome || null
      };
    }
    emit();
  }

  /** Center action (resume/interrupt/…) — never mutates evidence.delivery. */
  function setActionReceipt(receipt) {
    state.actionReceipt = receipt || null;
    emit();
  }

  function setDraft(text, opts) {
    opts = opts || {};
    state.draft = String(text == null ? '' : text);
    if (opts.lock) state.userLocked = true;
    if (!opts.silent) emit();
  }

  function setWbSendMode(mode, opts) {
    opts = opts || {};
    var Caps = capsApi();
    var next =
      Caps && Caps.normalizeWbSendMode
        ? Caps.normalizeWbSendMode(mode)
        : mode === 'desktop'
          ? 'desktop'
          : 'local';
    if (state.wbSendMode === next && !opts.force) return;
    state.wbSendMode = next;
    persistWbSendMode(next);
    if (!opts.silent) emit();
  }

  function setWorkMode(mode, opts) {
    opts = opts || {};
    var Caps = capsApi();
    var next =
      Caps && Caps.normalizeWorkMode ? Caps.normalizeWorkMode(mode) : String(mode || 'think');
    if (next === 'readonly') next = 'think';
    if (next !== 'think' && next !== 'edit') next = 'think';
    // Always persist (incl. alias normalize) so localStorage mirrors effective mode.
    persistWorkMode(next);
    if (state.workMode === next && !opts.force) return;
    state.workMode = next;
    if (!opts.silent) emit();
  }

  function setHandoffId(id, opts) {
    opts = opts || {};
    state.handoffId = id != null && String(id).trim() ? String(id).trim() : null;
    if (!opts.silent) emit();
  }

  function setComposing(on) {
    composing = !!on;
  }

  function isComposing() {
    return composing;
  }

  function setAim(appTargetId, status) {
    if (!appTargetId) return;
    state.aimByAppId[String(appTargetId)] = status || null;
    emit();
  }

  function setCapability(key, patch, opts) {
    opts = opts || {};
    if (!state.capabilities[key]) return;
    var next = Object.assign({}, state.capabilities[key], patch || {});
    var prev = state.capabilities[key];
    if (
      prev.state === next.state &&
      prev.error === next.error &&
      prev.configOn === next.configOn &&
      prev.runtimeReady === next.runtimeReady
    ) {
      state.capabilities[key] = next;
      return;
    }
    state.capabilities[key] = next;
    if (!opts.silent) emit();
  }

  function setVisible(v) {
    state.visible = !!v;
  }

  function bindFocusStore() {
    var Focus = global.OneToneHomeFocusStore;
    if (!Focus) return;
    unsubs.push(
      Focus.subscribe(function (dto) {
        applyFocusDto(dto);
        if (state.mounted) emit();
      })
    );
    Focus.fetch();
    if (typeof Focus.startPolling === 'function') {
      Focus.startPolling(5000);
      state.focusPollOwned = true;
    }
  }

  function unbindFocusStore() {
    var Focus = global.OneToneHomeFocusStore;
    if (Focus && state.focusPollOwned && typeof Focus.stopPolling === 'function') {
      Focus.stopPolling();
    }
    state.focusPollOwned = false;
  }

  function bindSubscriptions() {
    unbindSubscriptions();
    bindFocusStore();
    var hr = global.OneToneHabitRuntime;
    if (hr && typeof hr.subscribe === 'function') {
      unsubs.push(
        hr.subscribe('change', function () {
          scheduleRefresh('habit_runtime');
        })
      );
    }
    var Prep = global.OneToneHomePromptPrep;
    if (Prep && typeof Prep.subscribeMaterials === 'function') {
      unsubs.push(
        Prep.subscribeMaterials(function (summary) {
          state.materials = ((summary && summary.refs) || []).filter(Boolean);
          emit();
        })
      );
    }
    var RHC = global.OneToneRuntimeHabitControl;
    if (RHC && typeof RHC.subscribeForeground === 'function') {
      unsubs.push(
        RHC.subscribeForeground(function () {
          scheduleRefresh('foreground');
        })
      );
    } else if (RHC && typeof RHC.onForegroundChange === 'function') {
      try {
        unsubs.push(
          RHC.onForegroundChange(function () {
            scheduleRefresh('foreground');
          })
        );
      } catch (_) {}
    }
    pollTimer = global.setInterval(function () {
      if (!state.visible || !state.mounted) return;
      if (Date.now() - lastRefreshAt < POLL_MS - 500) return;
      refresh('poll');
    }, POLL_MS);
    unsubs.push(function () {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = 0;
      }
    });
  }

  function unbindSubscriptions() {
    unbindFocusStore();
    for (var i = 0; i < unsubs.length; i++) {
      try {
        unsubs[i]();
      } catch (_) {}
    }
    unsubs = [];
    if (coalesceTimer) {
      clearTimeout(coalesceTimer);
      coalesceTimer = 0;
    }
  }

  function mount() {
    if (state.mounted) return;
    state.mounted = true;
    state.loadPhase = 'loading';
    var last = loadLastGood();
    if (last && last.snap) {
      applyAgentSnap(last.snap, { stale: true });
      emit();
    } else {
      emit();
    }
    bindSubscriptions();
    refresh('mount');
  }

  function dispose() {
    state.mounted = false;
    state.visible = false;
    stopAtrPoll();
    unbindSubscriptions();
    refreshInFlight = null;
  }

  /** Stale lastGood must not authorize actions. */
  function mayAct() {
    return state.loadPhase === 'ready' || state.loadPhase === 'stale';
  }

  global.OneToneHomeAgentV2Store = {
    mount: mount,
    getSnapshot: getSnapshot,
    subscribe: subscribe,
    refresh: refresh,
    dispose: dispose,
    scheduleRefresh: scheduleRefresh,
    catalog: catalog,
    catalogList: catalogList,
    rowNoteText: rowNoteText,
    quietHintLines: quietHintLines,
    resolveKind: resolveKind,
    kindOfAgent: kindOfAgent,
    projectAgent: projectAgent,
    workRows: workRows,
    windowsLabel: windowsLabel,
    inventoryDiscovery: inventoryDiscovery,
    setSelected: setSelected,
    clearSelected: clearSelected,
    setView: setView,
    setPickerOpen: setPickerOpen,
    setReceipt: setReceipt,
    setDeliveryReceipt: setDeliveryReceipt,
    setActionReceipt: setActionReceipt,
    setValidationNotice: setValidationNotice,
    resolveTargetContext: resolveTargetContext,
    buildSessionCards: buildSessionCards,
    normalizePath: normalizePath,
    pathsEqual: pathsEqual,
    setDraft: setDraft,
    setWbSendMode: setWbSendMode,
    setWorkMode: setWorkMode,
    setHandoffId: setHandoffId,
    setComposing: setComposing,
    isComposing: isComposing,
    setAim: setAim,
    setCapability: setCapability,
    setVisible: setVisible,
    syncMaterialsFromPrep: syncMaterialsFromPrep,
    mayAct: mayAct,
    buildSessionProjection: buildSessionProjection,
    setActiveAgentTask: setActiveAgentTask,
    refreshAgentTask: refreshAgentTask,
    approveAgentPatch: approveAgentPatch,
    rejectAgentPatch: rejectAgentPatch,
    submitAgentInput: submitAgentInput,
    resumeAgentTask: resumeAgentTask,
    resumeAndDriveAgentTask: resumeAndDriveAgentTask,
    abandonAgentTask: abandonAgentTask,
    abandonAndStartAgentTask: abandonAndStartAgentTask,
    startAndDriveAgentTask: startAndDriveAgentTask,
    preflightAtrStart: preflightAtrStart,
    clearAtrSendConflict: clearAtrSendConflict,
    keepDraftDeferAtrSend: keepDraftDeferAtrSend,
    driveActiveIfRunning: driveActiveIfRunning,
    confirmedProjectPath: confirmedProjectPath,
    isAgentTaskBlockingNew: isAgentTaskBlockingNew,
    __testOnly: {
      projectAgent: projectAgent,
      resolveKind: resolveKind,
      projectNameOf: projectNameOf,
      workLine: workLine,
      statusOf: statusOf,
      isBannedNarration: isBannedNarration,
      isEligible: isEligible,
      evidenceTierOf: evidenceTierOf,
      statusShort: statusShort,
      workRows: workRows,
      deskSupplementRows: deskSupplementRows,
      mergeWorkRowMaps: mergeWorkRowMaps,
      isActivityShellLine: isActivityShellLine,
      isStatusShellLine: isStatusShellLine,
      sessionNarration: sessionNarration,
      rowNoteText: rowNoteText,
      quietHintLines: quietHintLines,
      enrichLivingNarration: enrichLivingNarration,
      pickDefaultSelected: pickDefaultSelected,
      sanitizeSelectedKind: sanitizeSelectedKind,
      foregroundSendKind: foregroundSendKind,
      setLastExternalSendKind: function (k) {
        lastExternalSendKind = k || null;
      },
      UNKNOWN_PROMPT_SUMMARY: UNKNOWN_PROMPT_SUMMARY,
      inventoryDiscovery: inventoryDiscovery,
      projectTargets: projectTargets,
      applyAgentSnap: applyAgentSnap,
      applyFocusDto: applyFocusDto,
      resolveTargetContext: resolveTargetContext,
      buildSessionCards: buildSessionCards,
      normalizePath: normalizePath,
      pathsEqual: pathsEqual,
      primaryCtaOf: primaryCtaOf,
      buildSessionProjection: buildSessionProjection,
      setWbSendMode: setWbSendMode,
      setWorkMode: setWorkMode,
      setHandoffId: setHandoffId,
      WB_MODE_KEY: WB_MODE_KEY,
      WORK_MODE_KEY: WORK_MODE_KEY,
      COALESCE_MS: COALESCE_MS,
      LAST_GOOD_KEY: LAST_GOOD_KEY,
      LAST_GOOD_MAX_AGE_MS: LAST_GOOD_MAX_AGE_MS,
      loadLastGood: loadLastGood,
      getState: function () {
        return state;
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
