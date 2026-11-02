/**
 * OneToneHomeResearch — research mode state, ResearchResult, MD/HTML export,
 * and orchestration. Paths: fast (cited short answer) | faceted (2–3 real facets).
 * Not ATR. Not DSH subagents.
 */
(function (global) {
  'use strict';

  var STATUSES = {
    idle: 'idle',
    configuring: 'configuring',
    awaiting_approval: 'awaiting_approval',
    searching: 'searching',
    fetching: 'fetching',
    briefing: 'briefing',
    reviewing: 'reviewing',
    synthesizing: 'synthesizing',
    completed_with_sources: 'completed_with_sources',
    completed_without_sources: 'completed_without_sources',
    failed: 'failed'
  };

  var DEPTH = {
    quick: { id: 'quick', maxSources: 5, label: '快速' },
    standard: { id: 'standard', maxSources: 10, label: '标准' },
    deep: { id: 'deep', maxSources: 14, label: '深度' }
  };

  /**
   * Search/fetch/repair caps only. modelCalls:null = no local model hard stop —
   * provider/user owns LLM limits; never fail a run with budget_exhausted on model.
   */
  var BUDGETS = {
    // fast: plan + synth + one missing-side/authority dig when corpus is one-sided
    fast: { search: 5, fetch: 6, modelCalls: null, parallelFacets: 1, repairRounds: 1 },
    // standard/deep: repairRounds includes coverage gate + one authority dig
    standard: { search: 10, fetch: 12, modelCalls: null, parallelFacets: 2, repairRounds: 2 },
    deep: { search: 12, fetch: 14, modelCalls: null, parallelFacets: 2, repairRounds: 2 }
  };

  /** Only applies when a finite modelCalls cap is injected (tests / overrides). */
  var SYNTH_RESERVE = 1;

  function modelCapFinite(ledger) {
    var c = ledger && ledger.caps && ledger.caps.modelCalls;
    return typeof c === 'number' && isFinite(c) && c >= 0;
  }

  var PLACE_HINTS = [
    '北京',
    '上海',
    '广州',
    '深圳',
    '杭州',
    '成都',
    '重庆',
    '西安',
    '南京',
    '武汉',
    '苏州',
    '天津',
    '青岛',
    '厦门',
    '长沙',
    '郑州',
    '香港',
    '台北',
    '东京',
    '纽约',
    '伦敦',
    '巴黎',
    '新加坡'
  ];

  var listeners = [];
  var cancelFlag = false;
  var runId = 0;
  var emitTimer = 0;
  var emitPending = false;

  var state = {
    status: STATUSES.idle,
    config: {
      topic: '',
      depth: 'standard',
      format: 'markdown',
      path: 'auto',
      userConditions: null
    },
    progress: {
      phase: '',
      sourcesFound: 0,
      sourcesFetched: 0,
      sourcesUsed: 0,
      message: '',
      currentUrl: '',
      currentTitle: '',
      liveSources: [],
      tasks: [],
      facets: []
    },
    plan: null,
    researchIntent: null,
    tasks: [],
    ledger: null,
    metrics: null,
    runTrace: null,
    controller: null,
    actions: [],
    fetchCache: {},
    error: null,
    result: null,
    lastExportPath: null,
    runStartedAt: 0,
    /** Recent completed topics for WorkBuddy-style clarify context. */
    recentTopics: []
  };

  function rememberRecentTopic(topic) {
    var t = normalizeResearchTopic(topic || '');
    if (!t || t.length < 2) return;
    state.recentTopics = [t]
      .concat(
        (state.recentTopics || []).filter(function (x) {
          return x && x !== t;
        })
      )
      .slice(0, 6);
  }

  function recentTopicsForClarify() {
    return (state.recentTopics || []).slice(0, 4);
  }

  /**
   * Model-only clarify passthrough (ATR-style: model asks, local never invents).
   * Sanitizes options; does not force needsClarify from topic heuristics.
   */
  function normalizeModelClarify(intent) {
    if (!intent) return intent;
    var options = Array.isArray(intent.clarifyOptions)
      ? intent.clarifyOptions
          .map(function (o, i) {
            if (!o) return null;
            var label = String(o.label || o.title || '').trim().slice(0, 48);
            var refined = String(o.refinedTopic || o.topic || '').trim().slice(0, 120);
            // Models often omit refinedTopic — never leave chips that resolve to optN ids.
            if (!refined && label) refined = label.slice(0, 120);
            if (!label || !refined) return null;
            if (/^opt\d+$/i.test(refined)) refined = label.slice(0, 120);
            return {
              id: String(o.id || 'opt' + (i + 1)).slice(0, 32),
              label: label,
              refinedTopic: refined
            };
          })
          .filter(Boolean)
          .slice(0, 4)
      : [];
    intent.clarifyOptions = options;
    intent.needsClarify = !!(intent.needsClarify || options.length);
    if (!intent.needsClarify) {
      intent.clarifyQuestion = '';
      intent.clarifyOptions = [];
      return intent;
    }
    intent.clarifyQuestion = String(intent.clarifyQuestion || '')
      .trim()
      .slice(0, 160);
    if (!intent.clarifyQuestion) {
      intent.clarifyQuestion = '主题需要先确认方向后再下探';
    }
    intent.ambiguities = (intent.ambiguities || []).concat([
      '模型请求澄清后再下探'
    ]);
    if (!intent.facets || !intent.facets.length) {
      intent.facets = [
        {
          id: 'f1',
          label: '待澄清后规划',
          questions: [String(intent.originalQuestion || '')],
          queries: [
            normalizeResearchQuery(intent.originalQuestion || intent.cleanQuestion || '')
          ],
          keyPoints: ['先澄清方向']
        }
      ];
    }
    return intent;
  }

  function blankLedger(depthId, path) {
    var key = path === 'fast' ? 'fast' : depthId === 'deep' ? 'deep' : 'standard';
    if (path === 'fast') key = 'fast';
    var cap = BUDGETS[key] || BUDGETS.standard;
    return {
      path: path || 'fast',
      depth: depthId || 'standard',
      caps: Object.assign({}, cap),
      search: 0,
      fetch: 0,
      modelCalls: 0,
      repairRounds: 0,
      hitCap: null
    };
  }

  function blankMetrics() {
    return {
      durationMs: 0,
      searchCount: 0,
      fetchOk: 0,
      fetchFail: 0,
      fetchAttempt: 0,
      modelCalls: 0,
      repairRounds: 0,
      path: '',
      model: '',
      searchProvider: 'auto',
      facetSourceCoverage: { num: 0, den: 0, rate: 0 },
      keyClaimCiteRate: { num: 0, den: 0, rate: 0 },
      limitationsFromBudget: [],
      funnel: {
        rawHits: 0,
        relevantHits: 0,
        pickedHits: 0,
        fetchAttempt: 0
      },
      degradeReason: null,
      planSource: null,
      intentConfidence: null,
      coverageBlocked: false
    };
  }

  function blankRunTrace(id) {
    return {
      runId: id || 'r' + Date.now(),
      startedAt: new Date().toISOString(),
      events: []
    };
  }

  function traceEvent(type, detail) {
    if (!state.runTrace) return;
    var ev = Object.assign(
      { at: new Date().toISOString(), type: String(type || 'event') },
      detail && typeof detail === 'object' ? detail : { detail: detail }
    );
    state.runTrace.events.push(ev);
    try {
      if (typeof console !== 'undefined' && console.info) {
        console.info('[research:trace]', ev.type, ev);
      }
    } catch (_) {}
  }

  function controllerPhase(phase) {
    if (!state.controller || typeof state.controller.transition !== 'function') return;
    try {
      state.controller.transition(phase);
      traceEvent('controller_phase', { phase: phase });
    } catch (_) {}
  }

  function bumpFunnel(field, n) {
    if (!state.metrics || !state.metrics.funnel) return;
    var k = field;
    var add = n == null ? 1 : n;
    if (state.metrics.funnel[k] == null) state.metrics.funnel[k] = 0;
    state.metrics.funnel[k] += add;
  }

  function blankProgress(phase, message) {
    return {
      phase: phase || '',
      sourcesFound: 0,
      sourcesFetched: 0,
      sourcesUsed: 0,
      message: message || '',
      currentUrl: '',
      currentTitle: '',
      liveSources: [],
      queries: [],
      tasks: [],
      facets: []
    };
  }

  function emitNow() {
    emitPending = false;
    emitTimer = 0;
    var snap = getSnapshot();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snap);
      } catch (_) {}
    }
  }

  /** Progress updates throttle; terminal / failed / configuring flush immediately. */
  function emit(force) {
    if (
      force ||
      !isRunningStatus(state.status) ||
      state.status === STATUSES.configuring ||
      state.status === STATUSES.awaiting_approval
    ) {
      if (emitTimer) {
        try {
          clearTimeout(emitTimer);
        } catch (_) {}
        emitTimer = 0;
      }
      emitNow();
      return;
    }
    emitPending = true;
    if (emitTimer) return;
    emitTimer = setTimeout(function () {
      if (emitPending) emitNow();
    }, 420);
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      listeners = listeners.filter(function (x) {
        return x !== fn;
      });
    };
  }

  function getSnapshot() {
    var prog = state.progress || {};
    return {
      status: state.status,
      config: Object.assign({}, state.config),
      progress: Object.assign({}, prog, {
        liveSources: Array.isArray(prog.liveSources)
          ? prog.liveSources.map(function (s) {
              return Object.assign({}, s);
            })
          : [],
        queries: Array.isArray(prog.queries) ? prog.queries.slice() : [],
        tasks: Array.isArray(state.tasks)
          ? state.tasks.map(function (t) {
              return Object.assign({}, t);
            })
          : [],
        facets: Array.isArray(prog.facets)
          ? prog.facets.map(function (f) {
              return Object.assign({}, f);
            })
          : []
      }),
      plan: state.plan ? JSON.parse(JSON.stringify(state.plan)) : null,
      researchIntent: state.researchIntent
        ? JSON.parse(JSON.stringify(state.researchIntent))
        : null,
      runTrace: state.runTrace ? JSON.parse(JSON.stringify(state.runTrace)) : null,
      controller: state.controller && state.controller.snapshot
        ? state.controller.snapshot()
        : null,
      actions: Array.isArray(state.actions) ? JSON.parse(JSON.stringify(state.actions)) : [],
      ledger: state.ledger ? Object.assign({}, state.ledger, {
        caps: Object.assign({}, (state.ledger && state.ledger.caps) || {})
      }) : null,
      metrics: state.metrics ? JSON.parse(JSON.stringify(state.metrics)) : null,
      error: state.error ? Object.assign({}, state.error) : null,
      result: state.result ? cloneResult(state.result) : null,
      lastExportPath: state.lastExportPath,
      isRunning: isRunningStatus(state.status),
      isTerminal: isTerminalStatus(state.status),
      awaitingApproval: state.status === STATUSES.awaiting_approval
    };
  }

  function isRunningStatus(s) {
    return (
      s === STATUSES.searching ||
      s === STATUSES.fetching ||
      s === STATUSES.briefing ||
      s === STATUSES.reviewing ||
      s === STATUSES.synthesizing
    );
  }

  function isTerminalStatus(s) {
    return (
      s === STATUSES.completed_with_sources ||
      s === STATUSES.completed_without_sources ||
      s === STATUSES.failed
    );
  }

  function cloneResult(r) {
    return JSON.parse(JSON.stringify(r));
  }

  function invoke(cmd, payload) {
    var ipc = global.OneToneIpc;
    if (ipc && typeof ipc.invoke === 'function') {
      return ipc.invoke(cmd, payload || {});
    }
    return Promise.reject(new Error('ipc_unavailable'));
  }

  /** Tauri cmds with a single `args` param need `{ args: {...} }`. */
  function invokeArgs(cmd, args) {
    return invoke(cmd, { args: args || {} });
  }

  function isLocalNetworkRequest(topic) {
    return /本机|本地|电脑|当前设备/.test(String(topic || '')) &&
      /(网络|网卡|IP|dns|DNS|网关|代理|联网|连接)/.test(String(topic || ''));
  }

  function startLocalNetworkDiagnostics(topic) {
    var original = String(topic || '').trim();
    state.config.topic = original;
    state.status = STATUSES.searching;
    state.progress = blankProgress('diagnostics', '正在检查本机网络…');
    state.progress.tasks = [{ id: 'network-diagnostics', kind: 'network_diagnostics', subject: original, status: 'running' }];
    state.metrics = blankMetrics();
    state.metrics.path = 'local_diagnostics';
    emit(true);
    return invoke('cmd_network_diagnostics', {}).then(function (data) {
      var d = data || {};
      var raw = typeof d.interfaces === 'string' ? d.interfaces : JSON.stringify(d.interfaces || {}, null, 2);
      var readable = ['# 本机网络诊断', '', '> 检查时间：' + (d.checkedAt || new Date().toISOString()), '', '## 诊断结果', '', '- 网络接口信息：已读取', '- 网络连通性：' + (d.internetReachable ? '可用' : '未确认'), '- 网关：' + (d.gateway || '未解析'), '- DNS：' + (Array.isArray(d.dnsServers) && d.dnsServers.length ? d.dnsServers.join('、') : '未解析'), '', '## 原始诊断信息', '', '```text', String(raw || '').slice(0, 12000), '```', '', '> 这是本机只读诊断结果，不是网络资料调研。'].join('\n');
      state.progress.tasks[0].status = 'completed';
      state.progress.message = '本机网络诊断完成';
      state.result = emptyResult({ title: '本机网络诊断', summary: d.internetReachable ? '当前设备已检测到网络连接。' : '当前设备网络连通性未确认。', rawMarkdown: readable, status: STATUSES.completed_without_sources, metrics: state.metrics });
      state.status = STATUSES.completed_without_sources;
      emit(true);
      return getSnapshot();
    }).catch(function (err) {
      state.progress.message = '本机网络诊断失败';
      state.error = { code: 'network_diagnostics_failed', message: String((err && err.message) || err || 'unknown_error') };
      state.status = STATUSES.failed;
      emit(true);
      return getSnapshot();
    });
  }

  function resolveWbLlm() {
    var modelFromDom = '';
    try {
      var el =
        (typeof document !== 'undefined' &&
          document.querySelector &&
          document.querySelector('[data-ha2-wb-model]')) ||
        null;
      if (el && el.value) modelFromDom = String(el.value).trim();
    } catch (_) {}
    return invoke('cmd_workbuddy_local_accounts_list', {})
      .then(function (raw) {
        var Bridge = global.OneToneAgentPageSettingsBridge;
        var wb =
          Bridge && typeof Bridge.projectWorkbuddyLocal === 'function'
            ? Bridge.projectWorkbuddyLocal(raw)
            : raw || {};
        var accounts = Array.isArray(wb.accounts)
          ? wb.accounts
          : Array.isArray(raw)
            ? raw
            : Array.isArray(raw && raw.accounts)
              ? raw.accounts
              : [];
        var defId = String(wb.defaultAccountId || '');
        var def = null;
        var i;
        for (i = 0; i < accounts.length; i++) {
          if (accounts[i] && String(accounts[i].id || '') === defId) {
            def = accounts[i];
            break;
          }
        }
        if (!def) {
          for (i = 0; i < accounts.length; i++) {
            if (accounts[i] && accounts[i].enabled && accounts[i].isDefault) {
              def = accounts[i];
              break;
            }
          }
        }
        if (!def) {
          for (i = 0; i < accounts.length; i++) {
            if (accounts[i] && accounts[i].enabled) {
              def = accounts[i];
              break;
            }
          }
        }
        if (!def || !def.enabled) {
          var err = new Error('no_account');
          err.code = 'no_llm';
          throw err;
        }
        var model =
          modelFromDom ||
          String(def.selectedModel || def.model || '').trim();
        if (!model) {
          var errM = new Error('no_model');
          errM.code = 'no_llm';
          throw errM;
        }
        return { accountId: String(def.id), model: model };
      });
  }

  function setStatus(status, patch) {
    state.status = status;
    if (patch && patch.message != null) state.progress.message = String(patch.message);
    if (patch && patch.phase != null) state.progress.phase = String(patch.phase);
    if (patch && patch.error) state.error = patch.error;
    else if (status !== STATUSES.failed) state.error = null;
    emit(isTerminalStatus(status) || status === STATUSES.configuring);
  }

  function openConfig(opts) {
    opts = opts || {};
    if (isRunningStatus(state.status)) return getSnapshot();
    cancelFlag = false;
    state.config.topic = String(opts.topic != null ? opts.topic : state.config.topic || '').trim();
    if (opts.depth === 'quick' || opts.depth === 'standard' || opts.depth === 'deep')
      state.config.depth = opts.depth;
    if (opts.format === 'html' || opts.format === 'markdown') state.config.format = opts.format;
    state.status = STATUSES.configuring;
    state.progress = blankProgress('configuring', '');
    state.error = null;
    emit();
    return getSnapshot();
  }

  function updateConfig(patch, opts) {
    patch = patch || {};
    opts = opts || {};
    if (patch.topic != null) state.config.topic = String(patch.topic);
    if (patch.depth === 'quick' || patch.depth === 'standard' || patch.depth === 'deep')
      state.config.depth = patch.depth;
    if (patch.format === 'html' || patch.format === 'markdown') state.config.format = patch.format;
    if (patch.path === 'auto' || patch.path === 'fast' || patch.path === 'faceted')
      state.config.path = patch.path;
    if (patch.userConditions != null) state.config.userConditions = patch.userConditions;
    if (!opts.silent) emit();
    return getSnapshot();
  }

  function ledgerCan(kind, n) {
    n = n == null ? 1 : n;
    var L = state.ledger;
    if (!L) return false;
    // hitCap is per-kind: search/fetch exhaustion must not starve reserved synth.
    if (L.hitCap && L.hitCap === kind) return false;
    if (kind === 'search') return L.search + n <= L.caps.search;
    if (kind === 'fetch') return L.fetch + n <= L.caps.fetch;
    if (kind === 'model') {
      if (!modelCapFinite(L)) return true;
      return L.modelCalls + n <= L.caps.modelCalls;
    }
    if (kind === 'repair') return L.repairRounds + n <= L.caps.repairRounds;
    return false;
  }

  /**
   * Optional model spend (brief/review/repair/relevance).
   * When modelCalls is uncapped (default), always allow. Finite caps (tests) still
   * leave SYNTH_RESERVE for final synthesis.
   */
  function ledgerCanOptionalModel(n, opts) {
    n = n == null ? 1 : n;
    opts = opts || {};
    var L = state.ledger;
    if (!L) return false;
    if (L.hitCap === 'model') return false;
    if (!modelCapFinite(L)) return true;
    var reserve = opts.reserveSynth === false ? 0 : SYNTH_RESERVE;
    return L.modelCalls + n + reserve <= L.caps.modelCalls;
  }

  function ledgerSpend(kind, n) {
    n = n == null ? 1 : n;
    var L = state.ledger;
    if (!L) return false;
    if (!ledgerCan(kind, n)) {
      L.hitCap = kind;
      return false;
    }
    if (kind === 'search') L.search += n;
    else if (kind === 'fetch') L.fetch += n;
    else if (kind === 'model') L.modelCalls += n;
    else if (kind === 'repair') L.repairRounds += n;
    return true;
  }

  function spendRepair(reason, detail) {
    if (!ledgerSpend('repair', 1)) return false;
    traceEvent('repair', Object.assign({ reason: reason || 'unknown' }, detail || {}));
    if (state.metrics) state.metrics.repairRounds = state.ledger.repairRounds;
    return true;
  }

  function syncProgressTasks() {
    state.progress.tasks = state.tasks.slice();
  }

  function makeTask(partial) {
    partial = partial || {};
    return {
      id: partial.id || 't' + (state.tasks.length + 1),
      kind: partial.kind || 'work',
      subject: partial.subject || '',
      facetId: partial.facetId || null,
      deps: Array.isArray(partial.deps) ? partial.deps.slice() : [],
      status: partial.status || 'pending',
      attemptId: partial.attemptId || 1,
      detail: partial.detail || '',
      error: null,
      outputs: partial.outputs || null
    };
  }

  function findTask(id) {
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) return state.tasks[i];
    }
    return null;
  }

  /** Domain projection of controller actions (read-only for UI). */
  function syncActionsFromController() {
    if (!state.controller || typeof state.controller.snapshot !== 'function') return;
    try {
      var snap = state.controller.snapshot();
      state.actions = Array.isArray(snap.actions) ? snap.actions.slice() : [];
      if (snap.budget && state.ledger) {
        state.ledger.search = Math.max(0, (state.ledger.caps.search || 0) - (snap.budget.search || 0));
        state.ledger.fetch = Math.max(0, (state.ledger.caps.fetch || 0) - (snap.budget.fetch || 0));
        if (modelCapFinite(state.ledger) && snap.budget.model != null) {
          state.ledger.modelCalls = Math.max(
            0,
            state.ledger.caps.modelCalls - Number(snap.budget.model || 0)
          );
        } else {
          // Uncapped: count completed model_chat actions for metrics only.
          var used = 0;
          (snap.actions || []).forEach(function (a) {
            if (
              a &&
              (a.toolId === 'model_chat' || a.budgetKind === 'model') &&
              (a.status === 'ok' || a.status === 'completed' || a.status === 'failed')
            ) {
              used += 1;
            }
          });
          if (used > state.ledger.modelCalls) state.ledger.modelCalls = used;
        }
      }
    } catch (_) {}
  }

  function ensureControllerInvoke() {
    if (!state.controller || typeof state.controller.setInvoke !== 'function') return;
    state.controller.setInvoke(function (cmd, args) {
      return invokeArgs(cmd, args || {});
    });
  }

  function runControllerAction(toolId, input, taskId) {
    if (!state.controller || typeof state.controller.executeAction !== 'function') {
      var err = new Error('controller_required');
      err.code = 'controller_required';
      return Promise.reject(err);
    }
    ensureControllerInvoke();
    return state.controller
      .executeAction({
        toolId: toolId,
        input: input || {},
        taskId: taskId || state.activeTaskId || null
      })
      .then(function (res) {
        syncActionsFromController();
        if (!res || !res.ok) {
          var e = new Error((res && res.code) || 'tool_error');
          e.code = (res && res.code) || 'tool_error';
          e.actionId = res && res.actionId;
          if (res && res.error) {
            e.code = res.error.code || e.code;
            e.message = res.error.message || e.message;
            e.diagnostics = res.error.diagnostics;
          }
          throw e;
        }
        var result = res.result;
        if (result && typeof result === 'object' && !Array.isArray(result)) {
          try {
            result = Object.assign({}, result, { actionId: res.actionId });
          } catch (_) {
            result.actionId = res.actionId;
          }
        }
        return result;
      });
  }

  function depsSatisfied(task) {
    var deps = task.deps || [];
    for (var i = 0; i < deps.length; i++) {
      var d = findTask(deps[i]);
      if (!d || d.status !== 'completed') return false;
    }
    return true;
  }

  /** Attempt-guarded transition via Controller when present. Stale attempts ignored. */
  function setTaskStatus(id, nextStatus, opts) {
    opts = opts || {};
    var t = findTask(id);
    if (!t) return false;
    if (opts.attemptId != null && Number(opts.attemptId) !== Number(t.attemptId)) {
      return false;
    }
    if (nextStatus === 'running' && !depsSatisfied(t)) {
      if (state.controller && state.controller.updateTask) {
        state.controller.updateTask(id, {
          status: t.status,
          error: { code: 'deps_unmet', message: 'dependencies not completed' }
        });
        syncTasksFromController();
      } else {
        t.error = { code: 'deps_unmet', message: 'dependencies not completed' };
      }
      return false;
    }
    if (nextStatus === 'running' && t.status === 'running') return true;
    if (nextStatus === 'running') state.activeTaskId = id;
    else if (state.activeTaskId === id && (nextStatus === 'completed' || nextStatus === 'failed')) {
      state.activeTaskId = null;
    }
    if (state.controller && typeof state.controller.updateTask === 'function') {
      state.controller.updateTask(id, {
        status: nextStatus,
        detail: opts.detail,
        error: opts.error || null,
        outputs: opts.outputs,
        bumpAttempt: !!opts.bumpAttempt,
        kind: t.kind
      });
      syncTasksFromController();
      return true;
    }
    t.status = nextStatus;
    if (opts.detail != null) t.detail = String(opts.detail);
    if (opts.error) t.error = opts.error;
    else if (nextStatus === 'completed' || nextStatus === 'running') t.error = null;
    if (opts.outputs != null) t.outputs = opts.outputs;
    if (opts.bumpAttempt) t.attemptId = Number(t.attemptId || 1) + 1;
    syncProgressTasks();
    return true;
  }

  function syncTasksFromController() {
    if (!state.controller || typeof state.controller.snapshot !== 'function') return;
    try {
      var snap = state.controller.snapshot();
      if (!Array.isArray(snap.tasks)) return;
      // Keep research subject labels; merge status from controller by taskId.
      snap.tasks.forEach(function (ct) {
        var local = findTask(ct.taskId);
        if (!local) {
          state.tasks.push({
            id: ct.taskId,
            kind: ct.kind,
            subject: ct.detail || ct.kind,
            status: ct.status,
            deps: ct.deps || [],
            attemptId: ct.attemptId || 1,
            detail: ct.detail || '',
            outputs: ct.outputs,
            error: ct.error
          });
          return;
        }
        local.status = ct.status;
        if (ct.detail != null) local.detail = ct.detail;
        if (ct.error !== undefined) local.error = ct.error;
        if (ct.outputs !== undefined) local.outputs = ct.outputs;
        local.attemptId = ct.attemptId || local.attemptId;
      });
      syncProgressTasks();
    } catch (_) {}
  }

  /**
   * Classify path: quick→fast; deep→faceted; standard→heuristic.
   * Returns { path, reason, suggestedFacets }.
   */
  function classifyPath(topic, depth, userPath) {
    var d = depth || state.config.depth || 'standard';
    if (userPath === 'fast' || userPath === 'faceted') {
      return {
        path: userPath,
        reason: userPath === 'fast' ? '用户选择快速核实' : '用户选择分工调研',
        forced: true
      };
    }
    if (d === 'quick') {
      return { path: 'fast', reason: '深度=快速：有来源短答核实', forced: true };
    }
    if (d === 'deep') {
      return { path: 'faceted', reason: '深度=深度：强制分工调研', forced: true };
    }
    var t = String(topic || '');
    var multi =
      /(和|与|还是|或|vs\.?|VS|对比|比较|哪个|怎么选|适不适合|怎么办|流程|材料|步骤|风险|现状|能做什么)/.test(
        t
      );
    var places = PLACE_HINTS.filter(function (p) {
      return t.indexOf(p) >= 0;
    });
    if (multi || places.length >= 2) {
      return {
        path: 'faceted',
        reason: '问题需要比较或多方面证据',
        forced: false
      };
    }
    return {
      path: 'fast',
      reason: '倾向事实核实；可手动切换为分工调研',
      forced: false
    };
  }

  function buildFacetPlanHeuristic(topic) {
    var t = normalizeResearchTopic(topic)
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var facets = [];
    // Plain「A和B」under one subject is aspect list, not product compare.
    var trueCompare = /(?:对比|比较|哪个|怎么选)/.test(t) || /还是|vs\.?/i.test(t);
    var cmp = trueCompare
      ? t.match(
      /([\u4e00-\u9fffA-Za-z0-9+\-·]{2,24})\s*(?:和|与|还是|或|vs\.?|VS)\s*([\u4e00-\u9fffA-Za-z0-9+\-·]{2,24})/
        )
      : null;
    if (cmp) {
      var a = cmp[1];
      var b = cmp[2].replace(/(哪个|谁|哪座|哪里|才是|对比|比较|深度研究|怎么选).*$/, '');
      if (a && b && a !== b) {
        facets.push({
          id: 'f1',
          label: a + '侧证据',
          query: a + ' 评测 参数',
          keyPoints: ['能力与参数', '口碑或评测']
        });
        facets.push({
          id: 'f2',
          label: b + '侧证据',
          query: b + ' 评测 参数',
          keyPoints: ['能力与参数', '口碑或评测']
        });
        facets.push({
          id: 'f3',
          label: '对比与决策',
          query: a + ' ' + b + ' 对比',
          keyPoints: ['差异', '适用场景']
        });
      }
    }
    if (!facets.length && /怎么办|材料|步骤|办理|流程/.test(t)) {
      facets = [
        {
          id: 'f1',
          label: '材料与条件',
          query: t + ' 材料',
          keyPoints: ['所需材料', '资格条件']
        },
        {
          id: 'f2',
          label: '办理步骤',
          query: t + ' 流程 步骤',
          keyPoints: ['步骤', '渠道']
        },
        {
          id: 'f3',
          label: '时效与风险',
          query: t + ' 注意事项',
          keyPoints: ['时效', '常见卡点']
        }
      ];
    }
    if (!facets.length && /适合|风险|隐私/.test(t)) {
      facets = [
        {
          id: 'f1',
          label: '能力匹配',
          query: t.replace(/适不适合我/, '') + ' 功能',
          keyPoints: ['核心能力']
        },
        {
          id: 'f2',
          label: '限制与风险',
          query: t + ' 限制 隐私',
          keyPoints: ['限制', '风险']
        },
        {
          id: 'f3',
          label: '适配结论',
          query: t,
          keyPoints: ['适合条件', '不适合条件']
        }
      ];
    }
    if (!facets.length) {
      var info = extractTopicAnchors(t);
      if (info.primary && info.requirePrimary && !isJunkPrimaryToken(info.primary)) {
        facets = [
          {
            id: 'f1',
            label: info.primary,
            query:
              info.primary +
              (/直播|停更/.test(t) ? ' 停更 不直播 原因' : ' 原因 近况'),
            keyPoints: ['直接原因', '时间线']
          },
          {
            id: 'f2',
            label: info.primary + '背景',
            query: info.primary + ' 人物 近况',
            keyPoints: ['身份确认', '近期动态']
          },
          {
            id: 'f3',
            label: '多方说法',
            query: t,
            keyPoints: ['不同说法', '未确认点']
          }
        ];
      } else {
        facets = facetsFromQueries(t, planSearchQueriesHeuristic(t));
      }
    }
    return facets.slice(0, 3);
  }

  function normalizeResearchTopic(topic) {
    var t = String(topic || '').replace(/\s+/g, ' ').trim();
    // Strip list markers only when a separator follows the digit — never eat「1是…」.
    t = t.replace(/^\d+[\.．、\)\]]\s+/, '');
    // Voice/input slips commonly prepend「下」to a product query. Only
    // repair it when the next token clearly starts a known product/topic;
    // keep legitimate phrases such as 下载、下单 and 下一步 intact.
    t = t.replace(/^下(?=(豆包|手机|荣耀|华为|苹果|小米|AI|人工智能|汽车))/, '');
    t = t.replace(/\s*（?基于[^）)]*(?:单源|来源|字典)[）)]?\s*$/g, '').trim();
    return t;
  }

  /** Strip book/quote marks and glue「offer 3」→「offer3」so compare parsing sees real titles. */
  function normalizeCompareSurface(topic) {
    return String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .replace(/[《》〈〉「」『』【】\[\]]/g, '')
      .replace(/[“”„‟]/g, '')
      .replace(/[‘’]/g, '')
      .replace(/([A-Za-z])\s+(\d+)/g, '$1$2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse A/B sides from a compare topic. Never invent a missing partner.
   * 「比较firefox和edge」→ [firefox, edge]; 「《offer3》和《offer8》对比」→ titles without marks.
   */
  function extractCompareSides(topic) {
    var t = normalizeCompareSurface(topic);
    if (!t) return [];
    var hasCompareCue =
      /(?:对比|比较|vs\.?|哪个|怎么选)/i.test(t) || /还是/i.test(t);
    var aspectOnly =
      /^(履历|代表作|作品|简介|近况|原因|参数|价格|评测|主页|账号)$/;
    // Sides may include CJK + latin + digits; spaces already normalized away for season glue.
    var cmp = t.match(
      /([\u4e00-\u9fffA-Za-z0-9+\-·]{2,32})\s*(?:和|与|还是|或|、|vs\.?|VS)\s*([\u4e00-\u9fffA-Za-z0-9+\-·]{2,32})/
    );
    if (cmp) {
      var a = stripCompareVerbPrefix(cmp[1]);
      var b = stripCompareVerbPrefix(
        cmp[2].replace(
          /(哪个|谁|哪座|哪里|才是|对比|比较|深度研究|怎么选|为什么|为何).*$/,
          ''
        )
      );
      if (a && b && a !== b && !aspectOnly.test(a) && !aspectOnly.test(b)) {
        // Bare「履历和代表作」stays out; 「offer3和offer8」/「firefox和edge」count.
        var productish = /[A-Za-z0-9]/.test(a) || /[A-Za-z0-9]/.test(b);
        if (hasCompareCue || productish) return [a, b];
      }
    }
    if (!hasCompareCue) return [];
    var single =
      t.match(/^(?:对比|比较)\s*([一-鿿A-Za-z0-9+\-·]{2,32})$/i) ||
      t.match(/([一-鿿A-Za-z0-9+\-·]{2,32})\s*(?:对比|比较)$/i);
    if (single) {
      var side = stripCompareVerbPrefix(single[1]);
      if (side && side.length >= 2 && !aspectOnly.test(side)) return [side];
    }
    return [];
  }

  /**
   * Bare「对比 X」hits text-diff SEO. Rewrite from extracted sides only —
   * never invent a partner brand or specialty domain words.
   */
  function disambiguateCompareQuery(query, topic) {
    var q = String(query || '').trim();
    var t = String(topic || q);
    if (!q) return q;
    if (/文本对比|文本比对|代码对比|文件对比|diff\s*tool/i.test(t)) return q;
    var sides = extractCompareSides(t);
    if (!sides.length) sides = extractCompareSides(q);
    if (!sides.length) return q;
    if (sides.length >= 2) return sides.join(' vs ') + ' 对比 评测';
    return sides[0] + ' 对比 评测';
  }

  function normalizeResearchQuery(query) {
    var q = normalizeCompareSurface(
      normalizeResearchTopic(query).replace(
        /^查(?=(豆包|手机|荣耀|华为|苹果|小米|AI|人工智能|汽车))/,
        ''
      )
    );
    // Only strip real interrogative shells — keep crafted heads like「影视飓风 团队 简介」.
    if (looksLikeInterrogativeQuery(q)) {
      var stripped = stripInterrogativeShell(q);
      if (stripped && stripped.length >= 2) return stripped;
    }
    // Drop mid-query leftover「什么是」(aspect bug: head +「什么是」→「爱奇艺 什么是」).
    q = q
      .replace(/(^|\s)(?:什么是|啥是|谁是)(\s|$)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    q = disambiguateCompareQuery(q, q);
    return q;
  }

  /** Platforms/products must not get UP主 / bilibili 空间 query templates. */
  function looksLikeOrgOrProductName(name) {
    var n = String(name || '');
    return /爱奇艺|优酷|腾讯视频|芒果|哔哩哔哩|b站|抖音|快手|西瓜|网易云|spotify|netflix|youtube|微博|淘宝|京东|美团|拼多多|百度|阿里|腾讯|华为|小米|苹果|微软|谷歌|firefox|chrome|chromium|edge|safari|opera|brave|火狐|公司|集团|平台|官网/i.test(
      n
    );
  }

  /** Strip compare/verbs glued onto product names: 比较firefox → firefox */
  function stripCompareVerbPrefix(name) {
    return String(name || '')
      .replace(/^(?:比较|对比|比较一下|对比一下|看看|了解)\s*/i, '')
      .trim();
  }

  /**
   * Abstract / common concepts — definition salvage must use encyclopedia drills,
   * never creator UP主 / bilibili templates (e.g. 「时间是什么」).
   */
  function looksLikeConceptWord(name) {
    var n = String(name || '').trim();
    if (!n || n.length < 2) return false;
    if (looksLikeOrgOrProductName(n)) return false;
    if (/工作室|传媒|科技|影视飓风|李子柒|老高|小野|小小虫/.test(n)) return false;
    return /^(时间|空间|爱情|自由|生命|死亡|意识|引力|重力|光速|相对论|量子|熵|能量|物质|宇宙|进化|民主|正义|幸福|哲学|物理|数学|信息|熵增|人工智能|区块链|意识流)$/i.test(
      n
    );
  }

  /** Creator-style proper names only — not orgs, not abstract concepts. */
  function looksLikeCreatorSubject(name, topic) {
    var n = String(name || '').trim();
    if (!n || looksLikeConceptWord(n) || looksLikeOrgOrProductName(n)) return false;
    var t = String(topic || '');
    if (/UP主|up主|主播|博主|创作者/.test(t)) return true;
    // Multi-char proper-name-ish (工作室/频道 brands, creator handles) — not 2-char concepts.
    if (n.length >= 3 && /[一-鿿]{2,}/.test(n) && !looksLikeConceptWord(n)) return true;
    return false;
  }

  function isInterrogativeAspectToken(token) {
    var p = String(token || '').trim();
    return (
      !p ||
      /^(什么是|啥是|谁是|是什么|是谁|是啥|怎么样|如何|怎么|什么|啥|谁|哪些|有哪些|有什么|都有哪些|都有什么|是哪些)$/.test(
        p
      ) ||
      /^(介绍一下|了解一下|调研|研究|查询|了解)$/.test(p)
    );
  }

  function sourceGateReason(source) {
    var blob = String((source && source.url) || '') + ' ' + String((source && source.title) || '');
    // Host/title traps only — not topic interpretation.
    if (/安全验证|wappass|captcha|验证码/i.test(blob)) return 'captcha';
    if (
      /zidian|zdic\.|zuci|cidian|hanyudacidian|词典|组词|字典|汉语词典|成语词典|汉典/i.test(
        blob
      )
    ) {
      return 'zdic';
    }
    return null;
  }

  function isLowQualityResearchSource(source) {
    return !!sourceGateReason(source);
  }

  /**
   * Drop dictionary/captcha SERP rows and emit source_gate traces.
   * Returns { candidates, gated }.
   */
  function gateSerpHitsForModelPick(hits, opts) {
    opts = opts || {};
    var gated = 0;
    var candidates = [];
    (hits || []).forEach(function (h) {
      if (!h || !h.url) return;
      var reason = sourceGateReason(h);
      if (reason) {
        gated += 1;
        if (!opts.silent) {
          traceEvent('source_gate', {
            reason: reason,
            url: String(h.url || '').slice(0, 200),
            title: String(h.title || '').slice(0, 80)
          });
        }
        return;
      }
      candidates.push(h);
    });
    if (gated && state.metrics) {
      state.metrics.local_quality_filtered =
        (state.metrics.local_quality_filtered || 0) + gated;
    }
    return { candidates: candidates, gated: gated };
  }

  /** Parse model-picked URL list (longer than query tokens). */
  function parseUrlPickJson(text) {
    var raw = String(text || '').trim();
    var m = raw.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      var arr = JSON.parse(m[0]);
      if (!Array.isArray(arr)) return null;
      return arr
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(function (x) {
          return x.length >= 8 && x.length <= 400;
        })
        .slice(0, 6);
    } catch (_) {
      return null;
    }
  }

  /**
   * Model picks which SERP hits to fetch after source_gate.
   * Returns { status:'ok'|'empty'|'failed', hits, urls, gated }.
   */
  function modelPickSearchHits(hits, topic, intent, facet, opts) {
    opts = opts || {};
    var gated = gateSerpHitsForModelPick(hits || [], opts);
    var list = gated.candidates.slice(0, 8);
    if (!list.length) {
      return Promise.resolve({
        status: 'empty',
        hits: [],
        urls: [],
        gated: gated.gated
      });
    }
    var ents = ((intent && intent.entities) || [])
      .map(function (e) {
        return e && e.name;
      })
      .filter(Boolean)
      .slice(0, 6);
    var lines = list
      .map(function (h, i) {
        return (
          i +
          1 +
          '. ' +
          String(h.title || '').slice(0, 80) +
          ' | ' +
          String(h.url || '').slice(0, 160) +
          ' | ' +
          String(h.snippet || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120)
        );
      })
      .join('\n');
    var pickMessages = [
      {
        role: 'system',
        content: [
          '你是检索挑拣员。根据调研主题与调查面，从候选结果中选出最值得抓取的 2～3 个完整 URL。',
          '优先：与主题专名整词相关的人物/组合/百科/新闻介绍页。',
          '拒绝：单字词典、无关公司官网、验证码/安全验证页、明显跑题。',
          '只输出 JSON 字符串数组（完整 https URL）。'
        ].join('\n')
      },
      {
        role: 'user',
        content:
          '主题：' +
          String(topic || '') +
          '\n调查面：' +
          String((facet && (facet.label || facet.id)) || '') +
          '\n实体：' +
          (ents.length ? ents.join('、') : '（无）') +
          '\n候选：\n' +
          lines
      }
    ];
    function resolvePick(chat) {
      var urls = parseUrlPickJson(chat && chat.text) || [];
      var picked = [];
      var seen = {};
      urls.forEach(function (u) {
        list.forEach(function (h) {
          if (!h || !h.url || seen[h.url]) return;
          if (h.url === u || h.url.indexOf(u) >= 0 || u.indexOf(h.url) >= 0) {
            seen[h.url] = true;
            picked.push(h);
          }
        });
      });
      if (!picked.length) {
        urls.forEach(function (u) {
          var n = parseInt(u, 10);
          if (n >= 1 && n <= list.length && list[n - 1] && !seen[list[n - 1].url]) {
            seen[list[n - 1].url] = true;
            picked.push(list[n - 1]);
          }
        });
      }
      var outUrls = picked.map(function (h) {
        return h.url;
      });
      if (picked.length) {
        return {
          status: 'ok',
          hits: picked.slice(0, 3),
          urls: outUrls.slice(0, 3),
          gated: gated.gated
        };
      }
      return { status: 'empty', hits: [], urls: [], gated: gated.gated };
    }
    var chatFn =
      typeof opts.chatFn === 'function'
        ? opts.chatFn
        : opts.withRetry
          ? chatOnceWithRetry
          : chatOnce;
    return chatFn(pickMessages, {
      maxTokens: 400,
      purpose: 'planning',
      skipLedger: !!opts.skipLedger,
      skipController: !!opts.skipController
    })
      .then(resolvePick)
      .catch(function () {
        return { status: 'failed', hits: [], urls: [], gated: gated.gated };
      });
  }

  /** Secondary processing when brief model fails — excerpts for synth, not topic interpretation. */
  function passthroughBriefFromSources(local) {
    var facts = [];
    (local || []).forEach(function (s) {
      if (!s) return;
      // Keep enough body for synth (≥~800) when passthrough replaces brief.
      var excerpt = String(s.text || s.snippet || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 800);
      if (!excerpt) return;
      facts.push({ text: excerpt, sourceId: s.id });
    });
    return {
      facts: facts.slice(0, 6),
      openQuestions: facts.length
        ? ['简报模型失败，已用原文摘录交给成稿模型']
        : ['本面无可用正文'],
      sourceIds: (local || [])
        .map(function (s) {
          return s && s.id;
        })
        .filter(Boolean),
      passthrough: true,
      mode: 'fallback_source_excerpt'
    };
  }

  /**
   * Watch/play landing pages — fine as last resort, thin for compare/analysis.
   * Analytical cues in the title keep the hit (对比/评测/盘点/百科…).
   */
  function isShallowPlayPageHit(source) {
    var url = String((source && source.url) || '');
    var title = String((source && source.title) || '');
    var analytical = /对比|比较|评测|横评|盘点|差异|区别|深度|分析|百科|介绍|详解|导视|名单/i.test(
      title
    );
    if (analytical) return false;
    if (
      /bilibili\.com\/video\/|b23\.tv\/|v\.qq\.com\/x\/(cover|page|page\/)|iqiyi\.com\/v_|youku\.com\/v_show|mgtv\.com\/b\//i.test(
        url
      )
    ) {
      return true;
    }
    if (/^(https?:\/\/)?(www\.)?(v\.qq\.com|www\.bilibili\.com|www\.iqiyi\.com)\/?$/i.test(url)) {
      return true;
    }
    return false;
  }

  function corpusMostlyShallowPlay(sources) {
    var list = (sources || []).filter(function (s) {
      return s && s.url;
    });
    if (!list.length) return false;
    var shallow = list.filter(isShallowPlayPageHit).length;
    return shallow >= Math.ceil(list.length * 0.6);
  }

  function topicPlaceTokens(topic) {
    var m = String(topic || '').match(
      /英格兰|英国|爱尔兰|欧洲|美洲|亚洲|中国|日本|美国|法国|德国|北京|上海|杭州|广州|深圳|苏格兰|威尔士/g
    );
    if (!m || !m.length) return [];
    var out = [];
    m.forEach(function (p) {
      uniquePush(out, p, 8);
    });
    return out;
  }

  /** Text-diff SEO pages when user meant product/entity compare (对比 ≠ Diffchecker). */
  function isTextDiffToolNoise(source, intent) {
    var goal = [
      (intent && intent.originalQuestion) || '',
      (intent && intent.phenomenon) || '',
      ((intent && intent.searchConcepts) || []).join(' ')
    ].join(' ');
    if (/文本对比|文本比对|代码对比|文件对比|diff\s*tool|在线对比工具/i.test(goal)) {
      return false;
    }
    var blob =
      String((source && source.url) || '') +
      ' ' +
      String((source && source.title) || '') +
      ' ' +
      String((source && source.snippet) || '') +
      ' ' +
      String((source && source.text) || '').slice(0, 400);
    if (
      !/diffchecker|text-?compare|textcompare|diffnow|jyshare\.com|文本对比|文本比对|在线对比\s*工具|代码对比工具|文件对比工具|diff\s*check/i.test(
        blob
      )
    ) {
      return false;
    }
    // Any entity/product compare (not text/code/file) — Diffchecker is off-topic.
    if (
      /(?:对比|比较|vs\.?|哪个更好|怎么选)/i.test(goal) &&
      !/文本|代码|文件|diff\s*tool/i.test(goal)
    ) {
      return true;
    }
    return false;
  }

  /** Deal portals, brand homonyms, and place-mismatched commodity pages. */
  function isOffTopicNoiseSource(source, intent) {
    if (isLowQualityResearchSource(source)) return true;
    if (isTextDiffToolNoise(source, intent)) return true;
    var blob =
      String((source && source.url) || '') +
      ' ' +
      String((source && source.title) || '') +
      ' ' +
      String((source && source.snippet) || '');
    var titleOnly = String((source && source.title) || '').trim();
    var goal = [
      (intent && intent.originalQuestion) || '',
      (intent && intent.phenomenon) || '',
      ((intent && intent.searchConcepts) || []).join(' ')
    ].join(' ');
    // Definition / named-subject questions: dictionary pages for 什么/啥 are never evidence.
    var primaryName =
      (pickPrimarySearchEntity((intent && intent.entities) || []) || {}).name ||
      extractDefinitionSubject(goal) ||
      '';
    if (primaryName) {
      if (/^(什么|啥|怎么|如何|谁|哪|什么意思)$/.test(titleOnly)) return true;
      if (
        /baike\.baidu\.com|zdic\.net|dict\.|zidian|词典|组词/i.test(blob) &&
        !blobHasToken(blob, blob.toLowerCase(), primaryName)
      ) {
        return true;
      }
      if (/smzdm|什么值得买|zhidemai|优惠券|海淘|coupon|比价|促销/i.test(blob)) return true;
    }
    if (/热门|排行|最火|最受欢迎|播放量|下饭|吃播|近况|停更|不露面|什么是|是什么/.test(goal)) {
      if (/smzdm|什么值得买|zhidemai|优惠券|海淘|coupon|比价|促销/i.test(blob)) return true;
    }
    // 土豆(vegetable) ≠ 土豆网 / tudou.com video portal
    if (/土豆|马铃薯/.test(goal) && !/土豆网|优酷土豆|视频网站/.test(goal)) {
      if (/tudou\.com|土豆网|召唤全球优秀短视频|优酷土豆/i.test(blob)) return true;
    }
    // Place-anchored questions: drop nutrition/portal pages with no place or history cue.
    var places = topicPlaceTokens(goal);
    if (places.length) {
      var hasPlace = places.some(function (p) {
        return blob.indexOf(p) >= 0;
      });
      var hasAxis = /历史|农业|饥荒|殖民|引入|意义|社会|经济|文化/.test(blob);
      if (
        !hasPlace &&
        !hasAxis &&
        /营养价值|功效与作用|百度健康|热量|卡路里|短视频|召唤全球/i.test(blob)
      ) {
        return true;
      }
    }
    // Named creator topics: generic bilibili landing/download/popular pages are not evidence.
    var subjects = ((intent && intent.entities) || []).filter(function (e) {
      return e && !isPlatformEntity(e) && e.kind !== 'place';
    });
    if (subjects.length) {
      var hitSubject = subjects.some(function (e) {
        if (!e || isPlatformEntity(e)) return false;
        // Name must be the specific subject — ignore platform aliases glued onto junk entities.
        if (e.name && !isPlatformEntity({ name: e.name, kind: e.kind }) && blob.indexOf(e.name) >= 0) {
          return true;
        }
        return (e.aliases || []).some(function (a) {
          return (
            a &&
            !/^(b站|B站|哔哩哔哩|bilibili)$/i.test(a) &&
            blob.indexOf(a) >= 0
          );
        });
      });
      if (
        !hitSubject &&
        /(app\.bilibili\.com|live\.bilibili\.com\/?$|bilibili\.com\/v\/popular|www\.bilibili\.com\/?$|下载中心|客户端下载|热门推荐)/i.test(
          blob
        )
      ) {
        return true;
      }
      // 「影视飓风」≠ 麻花影视 / 爱奇艺首页：缺整词主实体的影视门户一律丢掉。
      if (
        !hitSubject &&
        /(免费影视|在线观看|影视网|电影网|短剧|追剧|麻花影视|爱迪影视|iqiyi\.com\/?$|youku\.com\/?$|mgtv\.com\/?$|v\.qq\.com\/?$)/i.test(
          blob
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Post-fetch gate before synthesis.
   * Formal (wb) path: demote noise, do not delete — only empty bodies and true
   * dictionary LQ are hard-dropped so the model still sees paid-for network materials.
   */
  function keepSourcesForSynthesis(sources, intent, opts) {
    opts = opts || {};
    var formal = !!opts.formal || isFormalModelIntent(intent);
    var out = [];
    normalizeSources(sources || []).forEach(function (s) {
      if (!s || !s.url) return;
      var body = String(s.text || s.snippet || '').trim();
      if (!body) return;
      if (isLowQualityResearchSource(s)) return;
      var noise = isOffTopicNoiseSource(s, intent);
      if (!formal && noise) return;
      var copy = Object.assign({}, s);
      if (!String(copy.text || '').trim()) copy.text = body;
      if (formal && noise) copy.noiseSuspect = true;
      out.push(copy);
    });
    return out;
  }

  function formatSerpEvidenceForModel(hits, max) {
    var lines = [];
    (hits || []).slice(0, max || 6).forEach(function (h, i) {
      if (!h) return;
      lines.push(
        i +
          1 +
          '. ' +
          String(h.title || '').slice(0, 80) +
          ' | ' +
          String(h.url || '').slice(0, 120) +
          ' | ' +
          String(h.snippet || h.text || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 160)
      );
    });
    return lines;
  }

  function programmaticCiteCheck(markdown, sources) {
    var md = String(markdown || '');
    var ids = {};
    (sources || []).forEach(function (s) {
      if (s && s.id) ids[String(s.id)] = s;
    });
    var refs = md.match(/\[S\d+\]/g) || [];
    var missing = [];
    var seen = {};
    refs.forEach(function (r) {
      var id = r.replace(/[\[\]]/g, '');
      if (seen[id]) return;
      seen[id] = true;
      if (!ids[id]) missing.push(id);
    });
    var mislabeled = [];
    (sources || []).forEach(function (s) {
      if (!s) return;
      var hasBody = String(s.text || '').trim().length > 0 && s.fetchedAt;
      if (s.readState === 'fetched' && !hasBody) {
        mislabeled.push(s.id);
      }
      if (!s.fetchedAt && s.readState === 'fetched') mislabeled.push(s.id);
    });
    return {
      ok: missing.length === 0 && mislabeled.length === 0,
      missingCiteIds: missing,
      mislabeledSourceIds: mislabeled
    };
  }

  function computeCoverage(facets, sourcesByFacet, markdown, keyClaims) {
    var facetsList = facets || [];
    var denF = Math.max(facetsList.length, facetsList.length === 0 ? 1 : facetsList.length);
    var numF = 0;
    if (!facetsList.length) {
      numF = (sourcesByFacet && sourcesByFacet._all && sourcesByFacet._all.length) ? 1 : 0;
      denF = 1;
    } else {
      facetsList.forEach(function (f) {
        var list = (sourcesByFacet && sourcesByFacet[f.id]) || [];
        var ok = list.some(function (s) {
          return s && s.url && String(s.text || s.snippet || '').trim();
        });
        if (ok) numF += 1;
      });
    }
    var claims = Array.isArray(keyClaims) ? keyClaims : extractKeyClaims(markdown);
    var denC = claims.length || 0;
    var numC = 0;
    claims.forEach(function (c) {
      if (/\[S\d+\]/.test(String(c))) numC += 1;
    });
    return {
      facetSourceCoverage: {
        num: numF,
        den: denF,
        rate: denF ? numF / denF : 0
      },
      keyClaimCiteRate: {
        num: numC,
        den: denC,
        rate: denC ? numC / denC : 0
      },
      keyClaims: claims
    };
  }

  function extractKeyClaims(markdown) {
    var md = String(markdown || '');
    var lines = md.split(/\n/);
    var out = [];
    var inDirect = false;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (/^##\s*(直接回答|结论|结论与建议|核心结论)/.test(line)) {
        inDirect = true;
        continue;
      }
      if (/^##\s+/.test(line)) inDirect = false;
      if (inDirect) {
        var t = line.replace(/^[-*>\s]+/, '').trim();
        if (t.length >= 8) out.push(t);
      }
    }
    if (!out.length) {
      var sum = extractSummary(md);
      if (sum) out.push(sum);
    }
    return out.slice(0, 8);
  }

  function annotateSourceReadState(sources) {
    return (sources || []).map(function (s) {
      var copy = Object.assign({}, s);
      if (copy.fetchedAt && String(copy.text || '').trim().length > 20) {
        copy.readState = 'fetched';
      } else if (String(copy.snippet || '').trim() || String(copy.text || '').trim()) {
        copy.readState = 'snippet';
        if (copy.fetchedAt && String(copy.text || '').trim().length <= 20) {
          copy.fetchedAt = null;
        }
        if (!String(copy.snippet || '').trim() && String(copy.text || '').trim()) {
          copy.snippet = String(copy.text).trim().slice(0, 400);
        }
      } else {
        copy.readState = 'unavailable';
      }
      return copy;
    });
  }

  function buildSnippetLeadSources(hits, max, startSeq) {
    var out = [];
    var seen = {};
    var seq = startSeq || 0;
    (hits || []).forEach(function (hit) {
      if (out.length >= (max || 8) || !hit || !hit.url || seen[hit.url]) return;
      var snippet = String(hit.snippet || '').trim();
      var title = String(hit.title || '').trim();
      // Title-only leads still count as snippet-grade clues when providers omit snippets.
      if (!snippet && !title) return;
      if (!snippet) snippet = title;
      seen[hit.url] = true;
      seq += 1;
      out.push({
        id: 'S' + seq,
        title: title || hit.url,
        url: hit.url,
        snippet: snippet,
        text: snippet,
        fetchedAt: null,
        readState: 'snippet',
        facetId: hit.facetId || null,
        usedInSections: []
      });
    });
    return out;
  }

  function cancel() {
    cancelFlag = true;
    if (state.controller && typeof state.controller.cancel === 'function') {
      try { state.controller.cancel('user_cancel'); } catch (_) {}
      syncActionsFromController();
    }
    if (
      isRunningStatus(state.status) ||
      state.status === STATUSES.configuring ||
      state.status === STATUSES.awaiting_approval
    ) {
      state.status = STATUSES.idle;
      state.progress.message = '已取消调研';
      state.error = { code: 'cancelled', message: '用户取消了调研' };
      traceEvent('run_end', { status: 'cancelled' });
      // Keep runTrace on state for diagnosis even after cancel.
      emit(true);
    }
    return getSnapshot();
  }

  function resetIdle() {
    cancelFlag = false;
    state.controller = null;
    state.status = STATUSES.idle;
    state.progress = blankProgress('', '');
    state.error = null;
    emit();
    return getSnapshot();
  }

  function emptyResult(partial) {
    partial = partial || {};
    return {
      title: partial.title || '',
      summary: partial.summary || '',
      sections: Array.isArray(partial.sections) ? partial.sections : [],
      sources: Array.isArray(partial.sources) ? partial.sources : [],
      generatedAt: partial.generatedAt || new Date().toISOString(),
      model: partial.model || '',
      queries: Array.isArray(partial.queries) ? partial.queries : [],
      limitations: Array.isArray(partial.limitations) ? partial.limitations : [],
      uncertainties: Array.isArray(partial.uncertainties) ? partial.uncertainties : [],
      status: partial.status || STATUSES.completed_without_sources,
      rawMarkdown: partial.rawMarkdown != null ? String(partial.rawMarkdown) : '',
      document: partial.document || null,
      metrics: partial.metrics || null
    };
  }

  function normalizeSources(list) {
    var out = [];
    var seen = {};
    (list || []).forEach(function (s) {
      if (!s) return;
      var url = String(s.url || '').trim();
      if (!url || seen[url]) return;
      seen[url] = true;
      var row = {
        id: s.id || 'S' + (out.length + 1),
        title: String(s.title || url).trim() || url,
        url: url,
        snippet: String(s.snippet || '').trim(),
        fetchedAt: s.fetchedAt || null,
        text: s.text ? String(s.text) : '',
        usedInSections: Array.isArray(s.usedInSections) ? s.usedInSections.slice() : []
      };
      if (s.noiseSuspect) row.noiseSuspect = true;
      if (s.readState) row.readState = s.readState;
      if (s.facetId) row.facetId = s.facetId;
      out.push(row);
    });
    return out;
  }

  function yieldUi() {
    return new Promise(function (resolve) {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () {
          setTimeout(resolve, 0);
        });
      } else {
        setTimeout(resolve, 16);
      }
    });
  }

  function uniquePush(list, item, max) {
    if (!item || list.indexOf(item) >= 0) return;
    if (max && list.length >= max) return;
    list.push(item);
  }

  function looksLikePredicateClause(token) {
    var s = String(token || '');
    // Keep room for long show/product titles (含书名去标后); only treat very long spans as clauses.
    if (s.length > 32) return true;
    return /喜欢|这么|多人|没有|消息|露面|下饭|吃播|陪伴|现在|最近|目前|对于|意义/.test(s);
  }

  /** Digit/list junk must never become requirePrimary (e.g. 「1是」from「1是怎么回事」). */
  function isJunkPrimaryToken(token) {
    var s = String(token || '').trim();
    if (!s || s.length < 2) return true;
    if (/^\d+$/.test(s)) return true;
    if (/^\d+是$/.test(s)) return true;
    if (/^[a-zA-Z]$/.test(s)) return true;
    return false;
  }

  /** Model facets that only carry bare verbs / 1–2 char shells — not searchable. */
  function queriesLookTooThin(queries, topic) {
    var qs = (queries || [])
      .map(function (q) {
        return String(q || '').trim();
      })
      .filter(Boolean);
    if (!qs.length) return true;
    var bareShell = /^(怎么操作|如何操作|怎么用|怎么做|怎么办|如何使用|怎么使用|操作一下|帮我操作)$/;
    var t = String(topic || '')
      .replace(/[？?！!。．.\s]+$/g, '')
      .trim();
    if (bareShell.test(t) && qs.every(function (q) {
      return q.length <= 4 || bareShell.test(q) || /^(操作|使用|教程|步骤|办法)$/.test(q);
    })) {
      return true;
    }
    return qs.every(function (q) {
      if (q.length <= 2) return true;
      if (/^(操作|使用|怎么办|怎么做|如何|教程|步骤|办法|什么|哪些)$/.test(q)) return true;
      return false;
    });
  }

  function looksLikeRankingClause(token) {
    return /最受欢迎|最火|热门|排行|播放量|百大/.test(String(token || ''));
  }

  /**
   * 「什么是影视飓风」「影视飓风是谁」→ subject. Not ranking clauses like「什么是b站最受欢迎视频」.
   * Searching the raw interrogative sentence makes engines latch onto 什么/啥/什么值得买.
   */
  /**
   * 「中药柜有哪些」「爱奇艺有哪些会员」「北京有哪些景点」→ head before 有哪些.
   * Must run before the「…哪」anchor regex, which otherwise captures「中药柜有」.
   */
  function extractEnumListSubject(topic) {
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var m = t.match(
      /^([\u4e00-\u9fffA-Za-z0-9+\-·]{2,20}?)(?:有哪些|有什么|都有哪些|都有什么|是哪些)(.*)$/
    );
    if (!m || !m[1]) return '';
    var head = String(m[1])
      .replace(/的$/g, '')
      .trim();
    if (
      !head ||
      head.length < 2 ||
      head.length > 20 ||
      looksLikePredicateClause(head) ||
      looksLikeRankingClause(head) ||
      isJunkPrimaryToken(head) ||
      /^(什么|啥|谁|怎么|如何|哪些|有哪些|有什么)$/.test(head)
    ) {
      return '';
    }
    return head;
  }

  function extractDefinitionSubject(topic) {
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var m = t.match(/^(?:什么是|啥是|谁是|介绍一下|了解一下)(.+)$/);
    if (m && m[1]) {
      var name = String(m[1])
        .replace(/[呢吗啊呀么？?！!。．.\s]+$/g, '')
        .replace(/(的)?(意思|含义|简介|由来|来历)$/, '')
        .trim();
      if (
        name.length >= 2 &&
        name.length <= 20 &&
        !looksLikePredicateClause(name) &&
        !looksLikeRankingClause(name)
      ) {
        return name;
      }
    }
    m = t.match(
      /^([一-鿿A-Za-z0-9_·\-·]{2,20}?)(?:是什么|是谁|是啥|怎么样|是干嘛的|是做什么的)/
    );
    if (
      m &&
      m[1] &&
      !looksLikePredicateClause(m[1]) &&
      !looksLikeRankingClause(m[1]) &&
      !/^(什么|啥|谁|怎么|如何)$/.test(m[1])
    ) {
      return m[1];
    }
    // 「中药柜有哪些」is definitional inventory — same head as「什么是中药柜」.
    var enumHead = extractEnumListSubject(t);
    if (enumHead) return enumHead;
    return '';
  }

  function looksLikeInterrogativeQuery(query) {
    var q = String(query || '').trim();
    return (
      /^(?:什么是|啥是|谁是|介绍一下|了解一下)/.test(q) ||
      /(?:是什么|是谁|是啥|怎么样|是干嘛的|是做什么的)\s*$/.test(q)
    );
  }

  /**
   * 「影视飓风」「影视飓风调研」「调研影视飓风」→ bare proper-name subject.
   * Without this, engines return 麻花影视/爱奇艺 (stem「影视」SEO) and ranking keeps all hits.
   */
  function extractBareSubject(topic) {
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[:：]?\s*调研\s*$/g, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    if (!t || extractDefinitionSubject(String(topic || ''))) return '';
    // Whole-topic proper names only — never swallow「李子柒为什么不直播了」.
    if (/为什么|为何|怎么|如何|是否|是不是|什么是|啥是|谁是|介绍一下|了解一下/.test(t)) {
      return '';
    }
    if (/[和与或]|还是|vs\.?|对比|哪个|哪些|\s|吗|呢|了$/i.test(t)) return '';
    if (looksLikeRankingClause(t) || looksLikePredicateClause(t)) return '';
    if (/^(履历|代表作|作品|简介|主页|账号|近况|原因|参数|价格|评测)$/.test(t)) return '';
    if (/不|没|未|无|会|能|在|还|已|曾|最近|目前/.test(t)) return '';
    if (/^[一-鿿A-Za-z0-9_·\-·]{2,16}$/.test(t)) return t;
    return '';
  }

  /** Drop interrogative shell so search engines see the subject, not 什么/啥. */
  function stripInterrogativeShell(query) {
    var q = String(query || '').trim();
    if (!looksLikeInterrogativeQuery(q)) return q;
    var def = extractDefinitionSubject(q);
    if (def) return def;
    return (
      q
        .replace(/^(?:什么是|啥是|谁是|介绍一下|了解一下)\s*/, '')
        .replace(/(?:是什么|是谁|是啥|怎么样|是干嘛的|是做什么的)\s*$/, '')
        .replace(/[？?！!。．.]+$/g, '')
        .trim() || q
    );
  }

  /** Extract UP主 / 主播 / quoted proper names that platforms must not overshadow. */
  function extractNamedSubjects(topic) {
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var out = [];
    function pushName(raw) {
      var n = String(raw || '')
        .replace(/^(的|了)/, '')
        .replace(/^(b站|B站|哔哩哔哩|bilibili)\s*/i, '')
        .replace(/^(UP主|up主|主播|博主)\s*/i, '')
        .replace(/(的)?(履历|代表作|作品|简介|主页|账号|视频|近况|是谁|怎么样).*$/, '')
        .trim();
      if (!n || n.length < 2 || n.length > 20) return;
      if (/b站|哔哩哔哩|bilibili|UP主/i.test(n)) return;
      if (/^(履历|代表作|作品|简介|主页|账号|什么|啥|谁)$/.test(n)) return;
      if (/最受欢迎|最火|热门|排行|播放量|视频$/.test(n)) return;
      if (looksLikePredicateClause(n)) return;
      uniquePush(out, n, 6);
    }
    var def = extractDefinitionSubject(t);
    if (def) pushName(def);
    var bare = extractBareSubject(topic);
    if (bare) pushName(bare);
    var up = t.match(/(?:UP主|up主|主播|博主|创作者)\s*([一-鿿A-Za-z0-9_·\-·]{2,20})/);
    if (up) pushName(up[1]);
    // Only treat text after platform as a creator when role marker is present.
    var afterPlat = t.match(
      /(?:b站|B站|哔哩哔哩|bilibili)\s*(?:的?\s*)?(?:UP主|up主|主播|博主)\s*([一-鿿A-Za-z0-9_·\-·]{2,20})/i
    );
    if (afterPlat) pushName(afterPlat[1]);
    var quoted = t.match(/[「『""]([^」』""]{2,20})[」』""]/);
    if (quoted) pushName(quoted[1]);
    // 「…小小虫的履历/代表作」— name must not swallow the platform prefix.
    var trail = t.match(
      /(?:UP主|up主|主播|博主)?([一-鿿A-Za-z0-9_·]{2,16}?)(?:的)?(?:履历|代表作|作品集|个人简介|主页)/
    );
    if (trail) pushName(trail[1]);
    return out;
  }

  function isPlatformEntity(e) {
    if (!e) return false;
    if (e.kind === 'platform' || e.kind === 'org') return true;
    return /^(哔哩哔哩|b站|B站|bilibili|youtube|抖音|微博|爱奇艺|优酷|腾讯视频)$/i.test(
      String(e.name || '')
    );
  }

  /** Prefer person/creator over platform/place when choosing search head. */
  function pickPrimarySearchEntity(entities) {
    var list = entities || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && (list[i].kind === 'person' || list[i].kind === 'creator')) return list[i];
    }
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 'product') return list[i];
    }
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === 'org') return list[i];
    }
    for (i = 0; i < list.length; i++) {
      if (list[i] && !isPlatformEntity(list[i]) && list[i].kind !== 'place') return list[i];
    }
    return list[0] || null;
  }

  function orderEntitiesForSearch(entities) {
    var list = (entities || []).slice();
    list.sort(function (a, b) {
      function rank(e) {
        if (!e) return 9;
        if (e.kind === 'person' || e.kind === 'creator') return 0;
        if (isPlatformEntity(e)) return 3;
        if (e.kind === 'place') return 2;
        return 1;
      }
      return rank(a) - rank(b);
    });
    return list;
  }

  /**
   * Heuristic anchors only — never override a ready ResearchIntent.
   * Prefer longest proper-name spans so 「李子柒」is never reduced to 「李子」.
   * @returns {{ primary: string, anchors: string[], requirePrimary: boolean, aliases: string[] }}
   */
  function extractTopicAnchors(topic) {
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var anchors = [];
    var primary = '';
    var requirePrimary = false;
    var aliases = [];

    if (/b站|哔哩哔哩|bilibili/i.test(t)) {
      uniquePush(anchors, 'b站', 8);
      uniquePush(anchors, '哔哩哔哩', 8);
      uniquePush(aliases, 'b站', 8);
      uniquePush(aliases, '哔哩哔哩', 8);
      uniquePush(aliases, 'bilibili', 8);
    }

    // 「什么是影视飓风」/ bare「影视飓风调研」before comparison/why parsers.
    // Also「中药柜有哪些」— must beat the「…哪」regex that would capture「中药柜有」.
    var defSub =
      extractDefinitionSubject(t) ||
      extractEnumListSubject(t) ||
      extractBareSubject(topic);
    if (defSub && !isJunkPrimaryToken(defSub)) {
      primary = defSub;
      requirePrimary = true;
      uniquePush(anchors, primary, 8);
      uniquePush(aliases, primary, 8);
    }

    // Only treat as A-vs-B when compare cues present — plain「早期视频和生平」is aspects.
    var trueCompareAnchors =
      /(?:对比|比较|哪个|怎么选)/.test(t) || /还是|vs\.?/i.test(t);
    var cmpSurface = trueCompareAnchors ? normalizeCompareSurface(t) : '';
    var cmp = cmpSurface
      ? cmpSurface.match(
          /([\u4e00-\u9fffA-Za-z0-9+\-·]{2,32})\s*(?:和|与|还是|或|、|vs\.?|VS)\s*([\u4e00-\u9fffA-Za-z0-9+\-·]{2,32})/
        )
      : null;
    if (!primary && cmp) {
      var ca = stripCompareVerbPrefix(cmp[1]);
      var cb = stripCompareVerbPrefix(
        cmp[2].replace(
        /(哪个|谁|哪座|哪里|才是|对比|比较|深度研究|怎么选|为什么|为何).*$/,
        ''
        )
      );
      var aspectOnly =
        /^(履历|代表作|作品|简介|近况|原因|参数|价格|评测|主页|账号)$/;
      // 「履历与代表作」is one subject's aspects, not A vs B.
      if (!(aspectOnly.test(ca) || aspectOnly.test(cb))) {
      if (ca) uniquePush(anchors, ca, 8);
      if (cb) uniquePush(anchors, cb, 8);
      primary = ca || cb || '';
      }
    }

    if (!primary) {
      // 「为什么老高小茉不露面了」→ person; 「为什么b站这么多人喜欢…」→ clause, not proper name.
      var leadingWhy = t.match(/^(为什么|为何|怎么|如何|是否|是不是|能否|可否)(.+)$/);
      if (leadingWhy && leadingWhy[2]) {
        var remainder = leadingWhy[2].trim();
        var officeYe = remainder.match(/办公室小野|小野/);
        if (officeYe) {
          primary = officeYe[0] === '小野' && /办公室小野/.test(remainder) ? '办公室小野' : officeYe[0];
          if (/办公室小野/.test(remainder)) primary = '办公室小野';
          uniquePush(anchors, primary, 8);
          uniquePush(aliases, '办公室小野', 8);
          uniquePush(aliases, '小野', 8);
          requirePrimary = true;
        } else {
        var subject = remainder.match(
          /^([一-鿿A-Za-z0-9+-·]{2,16}?)(?=不|没|未|无|会|能|在|还|已|曾|最近|目前|怎么|如何|是否|吗|呢|$)/
        );
        if (subject && subject[1]) {
            primary = String(subject[1]).replace(/是$/, '');
            if (isJunkPrimaryToken(primary) || looksLikePredicateClause(primary)) {
              // Soft-only: keep short platform/aspect tokens, never hard-match the clause.
              primary = '';
            } else {
          uniquePush(anchors, primary, 8);
          requirePrimary = true;
              uniquePush(aliases, primary, 8);
            }
          }
        }
      }
    }

    if (!primary && !requirePrimary) {
      // 「李子柒为什么不直播了」→ primary=李子柒
      // 「影视飓风是怎么回事」→ primary=影视飓风（吞掉系词「是」，避免「影视飓风是」）
      // Do NOT use bare「哪」here —「中药柜有哪些」would capture「中药柜有」(handled above).
      var m = t.match(
        /^([\u4e00-\u9fffA-Za-z0-9+\-·]{2,16}?)(?:是)?(?=为什么|为何|怎么|如何|是不是|是否|还不|不[再在会]|吗|呢|什么时候|哪个|哪些)/
      );
      if (
        m &&
        m[1] &&
        !/有$/.test(m[1]) &&
        !looksLikePredicateClause(m[1]) &&
        !isJunkPrimaryToken(m[1])
      ) {
        primary = m[1];
        uniquePush(anchors, primary, 8);
        uniquePush(aliases, primary, 8);
        requirePrimary = true;
      }
    }

    var aspectRe =
      /直播|停更|复出|塌房|官宣|评测|价格|参数|对比|办理|材料|流程|美食|房价|下饭|吃播/g;
    var am;
    while ((am = aspectRe.exec(t))) {
      uniquePush(anchors, am[0], 8);
    }

    PLACE_HINTS.forEach(function (p) {
      if (t.indexOf(p) >= 0) uniquePush(anchors, p, 8);
    });

    return {
      primary: primary,
      anchors: anchors,
      requirePrimary: requirePrimary,
      aliases: aliases
    };
  }

  function intentRelevanceTokens(intent, facet) {
    var tokens = [];
    var strict = [];
    function addTok(list, v, max) {
      var s = String(v || '').trim();
      if (!s || s.length < 2) return;
      if (list.indexOf(s) >= 0) return;
      if (max && list.length >= max) return;
      list.push(s);
    }
    if (intent && Array.isArray(intent.entities)) {
      intent.entities.forEach(function (e) {
        if (!e) return;
        addTok(tokens, e.name, 24);
        (e.aliases || []).forEach(function (a) {
          addTok(tokens, a, 24);
          addTok(strict, a, 16);
        });
        if (e.name) addTok(strict, e.name, 16);
      });
    }
    if (intent && intent.phenomenon) addTok(tokens, intent.phenomenon, 24);
    (intent && intent.searchConcepts ? intent.searchConcepts : []).forEach(function (c) {
      addTok(tokens, c, 24);
    });
    if (facet) {
      (facet.questions || []).forEach(function (q) {
        String(q || '')
          .split(/[\s,，、]+/)
          .forEach(function (w) {
            if (w.length >= 2 && w.length <= 12) addTok(tokens, w, 24);
          });
      });
      (facet.queries || []).forEach(function (q) {
        addTok(tokens, q, 24);
      });
      if (facet.query) addTok(tokens, facet.query, 24);
      // Skip salvage placeholder labels — they are not topical tokens.
      if (facet.label && !/^原问题检索$|^调查面\d*$/.test(facet.label)) {
        addTok(tokens, facet.label, 24);
      }
    }
    (intent && intent.subjects ? intent.subjects : []).forEach(function (s) {
      addTok(tokens, s, 24);
    });
    return { soft: tokens, strict: strict };
  }

  function blobHasToken(blob, blobLower, token) {
    var t = String(token || '').trim();
    if (!t) return false;
    // ASCII product names: case-insensitive (Augment vs augment).
    if (/^[A-Za-z0-9][A-Za-z0-9+._\-]{1,47}$/.test(t)) {
      return blobLower.indexOf(t.toLowerCase()) >= 0;
    }
    return blob.indexOf(t) >= 0;
  }

  function hitMentionsAnyEntity(hit, entities) {
    var list = (entities || []).filter(function (e) {
      return e && e.name && e.kind !== 'place' && !isPlatformEntity(e);
    });
    if (!list.length) return true;
    var blob =
      String((hit && hit.title) || '') +
      ' ' +
      String((hit && hit.snippet) || '') +
      ' ' +
      String((hit && hit.url) || '');
    var blobLower = blob.toLowerCase();
    return list.some(function (e) {
      if (blobHasToken(blob, blobLower, e.name)) return true;
      return (e.aliases || []).some(function (a) {
        return a && blobHasToken(blob, blobLower, a);
      });
    });
  }

  function scoreHitRelevance(hit, tokens, intent) {
    var soft = (tokens && tokens.soft) || [];
    var strict = (tokens && tokens.strict) || [];
    var blob =
      String((hit && hit.title) || '') +
      ' ' +
      String((hit && hit.snippet) || '') +
      ' ' +
      String((hit && hit.url) || '');
    var blobLower = blob.toLowerCase();
    if (isOffTopicNoiseSource(hit, intent)) {
      return { score: 0, reject: true, reason: 'off_topic_noise' };
    }
    var productEntities = ((intent && intent.entities) || []).filter(function (e) {
      return (
        e &&
        (e.kind === 'product' ||
          e.kind === 'org' ||
          looksLikeOrgOrProductName(e.name))
      );
    });
    // Multi-entity / product topics: drop hits that name none of the sides.
    if (productEntities.length && !hitMentionsAnyEntity(hit, productEntities)) {
      return { score: 0, reject: true, reason: 'missing_primary' };
    }
    var score = 0;
    var matchedStrict = false;
    strict.forEach(function (a) {
      if (a && blobHasToken(blob, blobLower, a)) {
        score += 5;
        matchedStrict = true;
      }
    });
    soft.forEach(function (a) {
      // Ignore long full-query soft tokens — they almost never match and pollute scoring.
      if (!a || String(a).length > 24) return;
      if (blobHasToken(blob, blobLower, a)) score += 1;
    });
    // Prefer pages that look like ranking / play-count evidence for popularity questions.
    if (/热门排行|播放量|热门视频/.test((soft || []).join(' '))) {
      if (/排行榜|播放量|热门视频|最热|周榜|月榜|百大/.test(blob)) score += 4;
      if (/什么值得买|热搜词|热搜榜/.test(blob) && !/视频|播放/.test(blob)) score -= 3;
    }
    // Place-anchored topics: boost hits that mention the place.
    var places = topicPlaceTokens((intent && intent.originalQuestion) || '');
    if (places.length) {
      if (
        places.some(function (p) {
          return blob.indexOf(p) >= 0;
        })
      ) {
        score += 3;
      } else if (score > 0) {
        score = Math.max(1, score - 2);
      }
    }
    // Dictionary trap: shorter stem of a strict alias without the full alias.
    if (strict.length && !matchedStrict) {
      var fruitTrap = strict.some(function (full) {
        if (!full || full.length < 3) return false;
        var stem = full.slice(0, 2);
        return blob.indexOf(stem) >= 0 && !blobHasToken(blob, blobLower, full);
      });
      if (fruitTrap) return { score: 0, reject: true, reason: 'alias_stem_trap' };
    }
    var goalQ = (intent && intent.originalQuestion) || '';
    if (looksLikeCompareTopic(goalQ) || /对比|比较|vs\.?/i.test((soft || []).join(' '))) {
      if (isShallowPlayPageHit(hit)) score -= 5;
      if (/对比|比较|区别|差异|横评|评测|百科|介绍/i.test(blob)) score += 3;
    }
    return { score: score, reject: false, reason: score > 0 ? 'matched' : 'no_token' };
  }

  /**
   * Soft rank by intent tokens. Strict alias mode drops stem-traps and zero-score
   * hits when aliases exist; otherwise keep soft matches / pass through.
   * Fail-open is narrow: only hits that still mention the primary entity
   * (fixes Augment casing) — never reopen MOOC/Chiphell junk with score 0.
   */
  function rankHitsForIntent(hits, intent, facet, opts) {
    opts = opts || {};
    var list = hits || [];
    var tokens = intentRelevanceTokens(intent, facet);
    // Only explicit strictAliases — entity names boost score via tokens.strict
    // but must NOT alone force strictMode (that made formal-path funnels 5→0).
    var strictMode = !!opts.strictAliases && !!(tokens.strict && tokens.strict.length);
    var formalModel = !!opts.formalModel || isFormalModelIntent(intent);
    var scored = list.map(function (h) {
      var r = scoreHitRelevance(h, tokens, intent);
      return { hit: h, score: r.score, reject: r.reject, reason: r.reason };
    });
    var kept = scored.filter(function (x) {
      if (x.reject) return false;
      if (strictMode) return x.score > 0;
      return x.score > 0;
    });
    var failOpen = false;
    if (!kept.length && list.length > 0) {
      var primary = pickPrimarySearchEntity((intent && intent.entities) || []);
      var primaryName = primary ? stripCompareVerbPrefix(primary.name) : '';
      // Repair bad local seeds like「中药柜有」→ try「中药柜」.
      var primaryAlts = [];
      if (primaryName) {
        primaryAlts.push(primaryName);
        if (/[有是的]$/.test(primaryName) && primaryName.length > 2) {
          primaryAlts.push(primaryName.replace(/[有是的]$/, ''));
        }
      }
      var topicHead = extractEnumListSubject(
        (intent && intent.originalQuestion) || ''
      );
      if (topicHead) primaryAlts.push(topicHead);
      String((intent && intent.originalQuestion) || '')
        .replace(/[？?！!。．.]+$/g, '')
        .split(/的|有哪些|哪些|是谁|怎么|如何|什么|吗|呢/)
        .forEach(function (part) {
          var p = String(part || '').trim();
          if (p.length >= 2 && p.length <= 16 && !isJunkPrimaryToken(p)) {
            primaryAlts.push(p);
          }
        });
      var primaryHits = scored.filter(function (x) {
        if (x.reject && x.reason === 'off_topic_noise') return false;
        if (x.reject && x.reason === 'missing_primary') return false;
        var blob =
          String((x.hit && x.hit.title) || '') +
          ' ' +
          String((x.hit && x.hit.snippet) || '') +
          ' ' +
          String((x.hit && x.hit.url) || '');
        var blobLower = blob.toLowerCase();
        return primaryAlts.some(function (name) {
          return name && blobHasToken(blob, blobLower, name);
        });
      });
      if (primaryHits.length) {
        failOpen = true;
        kept = primaryHits.slice();
      } else if (formalModel) {
        // Model chose the queries — don't let local scoring veto the whole SERP.
        kept = scored.filter(function (x) {
          return !(x.reject && x.reason === 'off_topic_noise');
        });
        // If noise heuristics wiped everything but raw SERP exists, keep non-dictionary
        // rows so rewrite/fetch still have something to work with (funnel 5→0 bug).
        if (!kept.length) {
          kept = scored.filter(function (x) {
            return !isLowQualityResearchSource(x.hit);
          });
        }
        if (!kept.length) kept = scored.slice();
        failOpen = kept.length > 0;
      }
      if (kept.length) {
        kept.sort(function (a, b) {
          return b.score - a.score;
        });
      }
    } else {
      kept.sort(function (a, b) {
        return b.score - a.score;
      });
    }
    var dropReasons = {};
    scored.forEach(function (x) {
      if (kept.indexOf(x) >= 0) return;
      var k = x.reason || 'dropped';
      dropReasons[k] = (dropReasons[k] || 0) + 1;
    });
    if (failOpen) {
      dropReasons.fail_open_relevance = kept.length;
      try {
        traceEvent('fail_open_relevance', {
          rawHits: list.length,
          kept: kept.length,
          dropReasons: dropReasons
        });
      } catch (_) {}
    }
    return {
      hits: kept.map(function (x) {
        return x.hit;
      }),
      rawHits: list.length,
      relevantHits: kept.length,
      dropReasons: dropReasons,
      tokens: tokens,
      failOpen: failOpen
    };
  }

  /** Drop hits that miss the topic's proper-name anchor (e.g. 李子≠李子柒). */
  function filterHitsByAnchors(hits, anchorInfo) {
    var list = hits || [];
    if (!anchorInfo || !anchorInfo.anchors || !anchorInfo.anchors.length) return list;
    var primary = anchorInfo.primary;
    // Predicate clauses must never hard-empty the queue.
    if (primary && looksLikePredicateClause(primary)) {
      return list;
    }
    var aliases = (anchorInfo.aliases && anchorInfo.aliases.length
      ? anchorInfo.aliases
      : primary
        ? [primary]
        : []
    ).filter(Boolean);
    var matched = list.filter(function (h) {
      if (primary && anchorInfo.requirePrimary) {
        return aliases.some(function (a) {
          return hitMentions(h, a);
        });
      }
      return anchorInfo.anchors.some(function (a) {
        return a && !looksLikePredicateClause(a) && hitMentions(h, a);
      });
    });
    if (matched.length) return matched;
    if (anchorInfo.requirePrimary && primary && !looksLikePredicateClause(primary)) return [];
    return list;
  }

  function facetsFromQueries(topic, queries) {
    var info = extractTopicAnchors(topic);
    return (queries || [])
      .filter(Boolean)
      .slice(0, 3)
      .map(function (q, i) {
        return {
          id: 'f' + (i + 1),
          label: (i === 0 && info.primary ? info.primary : '调查面' + (i + 1)).slice(0, 40),
          query: String(q).trim().slice(0, 80),
          keyPoints: ['关键事实']
        };
      })
      .filter(function (f) {
        return f.query.length >= 2;
      });
  }

  /** Heuristic query plan — covers comparison entities + aspect keywords. */
  function planSearchQueriesHeuristic(topic) {
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var out = [];
    var info = extractTopicAnchors(t);
    // Lead with subject, never the raw「什么是…」shell.
    if (info.primary && info.requirePrimary) {
      uniquePush(out, info.primary, 8);
    } else {
      uniquePush(out, stripInterrogativeShell(t) || t, 8);
    }
    if (info.primary && info.requirePrimary) {
      // Minimal disambiguation only — model owns specialty drills.
      uniquePush(out, info.primary, 8);
      if (/直播|停更|复出/.test(t)) {
        uniquePush(out, info.primary + ' 停更 直播 原因', 8);
        uniquePush(out, info.primary + ' 不直播 近况', 8);
      }
    }

    var places = PLACE_HINTS.filter(function (p) {
      return t.indexOf(p) >= 0;
    });
    var aspect = '';
    var aspectMatch = t.match(
      /(美食|餐饮|小吃|旅游|房价|教育|交通|气候|互联网|AI|人工智能|工资|收入|人口|文化|夜生活|荒漠)/
    );
    if (aspectMatch) aspect = aspectMatch[1];
    if (aspect === '荒漠' || /美食荒漠|餐饮荒漠/.test(t)) aspect = '美食';

    if (places.length >= 2) {
      places.forEach(function (p) {
        uniquePush(out, aspect ? p + aspect : p, 8);
        if (aspect) uniquePush(out, p + ' ' + aspect + ' 评价', 8);
      });
      if (aspect) {
        uniquePush(out, places[0] + ' vs ' + places[1] + ' ' + aspect, 8);
      }
    } else if (places.length === 1 && aspect) {
      uniquePush(out, places[0] + aspect, 8);
      uniquePush(out, places[0] + ' ' + aspect + ' 推荐', 8);
    } else if (aspect) {
      uniquePush(out, aspect + ' ' + t.slice(0, 24), 8);
    }

    // "A和B哪个…" / "A与B对比" → both sides (cities or products).
    var cmp = t.match(
      /([\u4e00-\u9fffA-Za-z0-9+\-·]{2,24})\s*(?:和|与|还是|或|vs\.?|VS)\s*([\u4e00-\u9fffA-Za-z0-9+\-·]{2,24})/
    );
    if (cmp) {
      var a = cmp[1];
      var b = cmp[2].replace(/(哪个|谁|哪座|哪里|才是|对比|比较|深度研究).*$/, '');
      if (a && b && a !== b) {
        uniquePush(out, a, 8);
        uniquePush(out, b, 8);
        uniquePush(out, a + ' ' + b + ' 对比', 8);
        if (aspect) {
          uniquePush(out, a + aspect, 8);
          uniquePush(out, b + aspect, 8);
        }
        // Product research: pull parameters / reviews / launch.
        if (/手机|Magic|Navi|Ultra|Pro|平板|笔记本|汽车|模型/.test(t + a + b)) {
          uniquePush(out, a + ' 参数 价格', 8);
          uniquePush(out, b + ' 参数 价格', 8);
          uniquePush(out, a + ' 评测', 8);
          uniquePush(out, b + ' 评测', 8);
        }
        uniquePush(out, disambiguateCompareQuery(a + ' ' + b + ' 对比', t), 8);
      }
    }
    var sides = extractCompareSides(t);
    if (sides.length) {
      uniquePush(out, disambiguateCompareQuery(t, t), 8);
    }
    return out.slice(0, 6);
  }

  function parseQueryPlanJson(text) {
    var raw = String(text || '').trim();
    var m = raw.match(/\[[\s\S]*\]/);
    if (!m) return null;
    try {
      var arr = JSON.parse(m[0]);
      if (!Array.isArray(arr)) return null;
      return arr
        .map(function (x) {
          return String(x || '').trim();
        })
        .filter(function (x) {
          return x.length >= 2 && x.length <= 80;
        })
        .slice(0, 6);
    } catch (_) {
      return null;
    }
  }

  function extractResearchIntentJson(text) {
    var parsed = extractJsonObject(text, { preferIntent: true });
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return null;
    // Reject synthesis-shaped docs accidentally returned as "intent".
    if (looksLikeResearchDocument(parsed) && scoreResearchIntent(parsed) < 0) {
      return null;
    }
    return parsed;
  }

  function normalizeEntityList(rawEntities, subjects) {
    var out = [];
    var seen = {};
    function pushEnt(name, aliases, kind) {
      var n = String(name || '').trim();
      if (!n || n.length < 2 || looksLikePredicateClause(n)) return;
      var key = n.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      var als = (aliases || [])
        .map(function (a) {
          return String(a || '').trim();
        })
        .filter(function (a) {
          return a.length >= 2 && a !== n;
        })
        .slice(0, 6);
      out.push({
        name: n.slice(0, 48),
        aliases: als,
        kind: String(kind || 'other').trim() || 'other'
      });
    }
    (Array.isArray(rawEntities) ? rawEntities : []).forEach(function (e) {
      if (!e) return;
      if (typeof e === 'string') {
        pushEnt(e, [], 'other');
        return;
      }
      pushEnt(e.name || e.subject, e.aliases, e.kind);
    });
    (Array.isArray(subjects) ? subjects : []).forEach(function (s) {
      pushEnt(s, [], 'other');
    });
    return pruneStemEntities(out).slice(0, 8);
  }

  /**
   * Drop short stems that are proper prefixes of a longer sibling entity
   * (「令人」must not survive next to「令人心动的offer3」).
   */
  function pruneStemEntities(entities) {
    var list = entities || [];
    return list.filter(function (e) {
      if (!e || !e.name) return false;
      var name = String(e.name);
      if (name.length >= 6) return true;
      return !list.some(function (o) {
        if (!o || !o.name || o === e) return false;
        var other = String(o.name);
        if (other.length <= name.length) return false;
        return (
          other.indexOf(name) === 0 ||
          other.toLowerCase().indexOf(name.toLowerCase()) === 0
        );
      });
    });
  }

  function seedEntitiesFromTopic(topic) {
    var t = String(topic || '');
    var seeded = [];
    function pushSeed(name, aliases, kind) {
      if (!name) return;
      var exists = seeded.some(function (e) {
        return e.name === name;
      });
      if (exists) return;
      seeded.push({
        name: name,
        aliases: aliases || [],
        kind: kind || 'other'
      });
    }
    // Named creators / definition subjects first — never let platform seed become entities[0].
    var bareSeed = extractBareSubject(topic);
    var defSeed = extractDefinitionSubject(t);
    extractNamedSubjects(t).forEach(function (n) {
      var kind;
      if (looksLikeOrgOrProductName(n)) kind = 'org';
      else if (looksLikeConceptWord(n) || (defSeed && n === defSeed && !looksLikeCreatorSubject(n, t)))
        kind = 'concept';
      else if (bareSeed && n === bareSeed) kind = 'creator';
      else if (defSeed && n === defSeed) kind = 'other';
      else kind = 'person';
      pushSeed(n, [], kind);
    });
    if (/办公室小野/.test(t)) {
      pushSeed('办公室小野', ['小野'], 'person');
    }
    if (/老高小茉|老高与小茉/.test(t)) {
      pushSeed('老高小茉', ['老高', '小茉', '老高与小茉'], 'person');
    }
    if (/李子柒/.test(t)) {
      pushSeed('李子柒', ['李子柒'], 'person');
    }
    // Compare sides from the question itself — no brand specialty list.
    extractCompareSides(t).forEach(function (side) {
      pushSeed(side, [side], 'product');
    });
    if (/土豆|马铃薯/.test(t) && !/土豆网|优酷土豆/.test(t)) {
      pushSeed('马铃薯', ['土豆', 'potato'], 'other');
    }
    topicPlaceTokens(t).forEach(function (p) {
      pushSeed(p, [], 'place');
    });
    var anchor = extractTopicAnchors(t);
    if (
      anchor.primary &&
      !looksLikePredicateClause(anchor.primary) &&
      !isJunkPrimaryToken(anchor.primary)
    ) {
      var anchorKind = 'other';
      if (looksLikeConceptWord(anchor.primary)) anchorKind = 'concept';
      else if (looksLikeOrgOrProductName(anchor.primary)) anchorKind = 'org';
      else if (
        anchor.requirePrimary &&
        looksLikeCreatorSubject(anchor.primary, t)
      )
        anchorKind = 'person';
      else if (anchor.requirePrimary && defSeed && defSeed === anchor.primary)
        anchorKind = looksLikeCreatorSubject(anchor.primary, t) ? 'person' : 'concept';
      else if (anchor.requirePrimary) anchorKind = 'person';
      pushSeed(
        anchor.primary,
        (anchor.aliases || []).filter(function (a) {
          return a !== anchor.primary;
        }),
        anchorKind
      );
    }
    if (/b站|哔哩哔哩|bilibili/i.test(t)) {
      pushSeed('哔哩哔哩', ['b站', 'B站', 'bilibili', 'Bilibili'], 'platform');
    }
    return orderEntitiesForSearch(pruneStemEntities(seeded));
  }

  function seedConceptsFromTopic(topic) {
    var t = String(topic || '');
    var out = [];
    if (/最火|最受欢迎|热门|排行|播放量/.test(t)) {
      ['热门排行', '播放量', '热门视频'].forEach(function (c) {
        uniquePush(out, c, 8);
      });
    }
    if (/下饭|吃播|美食/.test(t)) {
      ['下饭视频', '吃播', '美食区'].forEach(function (c) {
        uniquePush(out, c, 8);
      });
    }
    if (/不露面|停更|不直播|近况|没有.*消息/.test(t)) {
      ['近况', '停更', '公开说明'].forEach(function (c) {
        uniquePush(out, c, 8);
      });
    }
    if (topicPlaceTokens(t).length && /意义|历史|农业|引入|传播/.test(t)) {
      ['历史', '农业', '传播'].forEach(function (c) {
        uniquePush(out, c, 8);
      });
    }
    if (/履历|代表作|作品|UP主|主播/.test(t)) {
      ['履历', '代表作', '主页'].forEach(function (c) {
        uniquePush(out, c, 8);
      });
    }
    return out;
  }

  function queryAlignedWithIntent(q, entities, concepts, original) {
    var query = String(q || '');
    if (query.length < 4 || query.length > 80) return false;
    if (/^为$|^调查面\d*$/.test(query.trim())) return false;
    var ents = entities || [];
    var conceptsList = concepts || [];
    var orig = String(original || '');
    // Keep queries that clearly continue the user question.
    if (orig && query.indexOf(orig.slice(0, Math.min(10, orig.length))) >= 0) return true;
    if (!ents.length && !conceptsList.length) return true;
    if (
      conceptsList.some(function (c) {
        return c && query.indexOf(c) >= 0;
      })
    ) {
      return true;
    }
    var qLower = query.toLowerCase();
    return ents.some(function (e) {
      if (!e) return false;
      if (e.name && (query.indexOf(e.name) >= 0 || qLower.indexOf(String(e.name).toLowerCase()) >= 0))
        return true;
      return (e.aliases || []).some(function (a) {
        return a && (query.indexOf(a) >= 0 || qLower.indexOf(String(a).toLowerCase()) >= 0);
      });
    });
  }

  function facetQueriesFromRaw(f) {
    f = f || {};
    if (Array.isArray(f.queries) && f.queries.length) return f.queries;
    if (f.query) return [f.query];
    if (Array.isArray(f.searchQueries) && f.searchQueries.length) return f.searchQueries;
    return [];
  }

  /** Aspect drills for a named creator — f2 must NOT reuse f1 query list. */
  function creatorIdentityQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head), 6);
    uniquePush(out, normalizeResearchQuery(head + ' UP主'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' bilibili 空间'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 百度百科'), 6);
    return out;
  }

  function creatorDepthQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head + ' 团队 成员'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 代表作'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 成立 简介'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 知乎'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 官网'), 6);
    return out;
  }

  /** 「什么是爱奇艺」→ encyclopedia / company facts, never UP主 templates. */
  function orgDefinitionQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 百度百科'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 公司 简介'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 官网'), 6);
    return out;
  }

  function orgDepthQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head + ' 成立 时间'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 业务 视频'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 维基百科'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 知乎'), 6);
    return out;
  }

  /** 「时间是什么」→ concept encyclopedia / physics / philosophy — never UP主. */
  function conceptDefinitionQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head + ' 定义'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 百度百科'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 维基百科'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 物理学'), 6);
    return out;
  }

  function conceptDepthQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head + ' 哲学 含义'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 相对论'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 科学 解释'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 知乎'), 6);
    return out;
  }

  /** 「什么是 Cursor」等产品/工具 — 简介/官网/功能，禁止物理哲学模板. */
  function thingDefinitionQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 是什么'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 官网'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 简介'), 6);
    return out;
  }

  function thingDepthQueries(head) {
    var out = [];
    uniquePush(out, normalizeResearchQuery(head + ' 功能'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 评测'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 官网'), 6);
    uniquePush(out, normalizeResearchQuery(head + ' 知乎'), 6);
    return out;
  }

  /**
   * 「调研李子柒的早期视频和生平经历」→ primary=李子柒, aspects=[早期视频, 生平经历].
   * Plain 和/与 under one subject is aspect list, not A-vs-B compare.
   */
  function extractUserAspects(topic) {
    var original = normalizeResearchTopic(topic || '');
    var t = original
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[:：]?\s*调研\s*$/g, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var entities = seedEntitiesFromTopic(original);
    var primaryEnt = pickPrimarySearchEntity(entities);
    var primary =
      primaryEnt && !isPlatformEntity(primaryEnt)
        ? primaryEnt.name
        : extractDefinitionSubject(t) || extractBareSubject(t) || '';
    if (!primary) return { primary: '', aspects: [] };
    if (/(?:对比|比较|哪个|怎么选)/.test(t) || /还是|vs\.?/i.test(t)) {
      return { primary: primary, aspects: [] };
    }
    var rest = t;
    var pi = rest.indexOf(primary);
    if (pi >= 0) {
      rest = (rest.slice(0, pi) + rest.slice(pi + primary.length))
        .replace(/^的/, '')
        .trim();
    }
    rest = rest
      .replace(/^(的|了|关于)/, '')
      .replace(/[:：]?\s*调研\s*$/g, '')
      .trim();
    if (!rest || rest.length < 2) return { primary: primary, aspects: [] };
    var parts = rest
      .split(/\s*(?:和|与|、|以及|及)\s*/)
      .map(function (p) {
        return String(p || '')
          .replace(/[？?！!。．.]+$/g, '')
          .replace(/^(的|了)/, '')
          .trim();
      })
      .filter(function (p) {
        return (
          p.length >= 2 &&
          p.length <= 16 &&
          p !== primary &&
          !isInterrogativeAspectToken(p) &&
          !looksLikePredicateClause(p) &&
          !looksLikeRankingClause(p)
        );
      });
    var aspects = [];
    parts.forEach(function (p) {
      uniquePush(aspects, p, 4);
    });
    return { primary: primary, aspects: aspects };
  }

  function aspectFacetQueries(head, aspect, isFirst) {
    var qs = [];
    if (isInterrogativeAspectToken(aspect)) {
      return orgDefinitionQueries(head).slice(0, 4);
    }
    uniquePush(qs, normalizeResearchQuery(head + ' ' + aspect), 6);
    if (/视频|作品|早期|代表作/.test(aspect)) {
      uniquePush(qs, normalizeResearchQuery(head + ' 早期 视频'), 6);
      uniquePush(qs, normalizeResearchQuery(head + ' 早期 作品'), 6);
      uniquePush(qs, normalizeResearchQuery(head + ' 代表作'), 6);
    } else if (/生平|经历|履历|传记|成长/.test(aspect)) {
      uniquePush(qs, normalizeResearchQuery(head + ' 生平 经历'), 6);
      uniquePush(qs, normalizeResearchQuery(head + ' 百度百科'), 6);
      uniquePush(qs, normalizeResearchQuery(head + ' 成长 经历'), 6);
    } else if (/近况|停更|不露面/.test(aspect)) {
      uniquePush(qs, normalizeResearchQuery(head + ' 近况 停更'), 6);
      uniquePush(qs, normalizeResearchQuery(head + ' 公开说明'), 6);
    } else {
      uniquePush(qs, normalizeResearchQuery(head + ' ' + aspect + ' 资料'), 6);
      uniquePush(qs, normalizeResearchQuery(head + ' ' + aspect + ' 时间线'), 6);
    }
    // No bilibili/UP auto-append — model owns depth queries.
    return qs.slice(0, 4);
  }

  /** Product / org entities involved in a multi-side compare topic. */
  function compareProductEntities(entities, topic) {
    var t = String(topic || '');
    if (!/(?:对比|比较|vs\.?|哪个|怎么选)/i.test(t) && !/还是/i.test(t)) return [];
    var seen = {};
    var out = [];
    function pushEnt(e) {
      if (!e || !e.name) return;
      var key = String(e.name).toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(e);
    }
    (entities || []).forEach(function (e) {
      if (!e || !e.name) return;
      if (!(e.kind === 'product' || e.kind === 'org' || looksLikeOrgOrProductName(e.name))) {
        return;
      }
      pushEnt(e);
    });
    // Ensure both parsed sides are present even if model/local kinds drifted.
    extractCompareSides(t).forEach(function (side) {
      var hit = (entities || []).filter(function (e) {
        return (
          e &&
          e.name &&
          (String(e.name).toLowerCase() === String(side).toLowerCase() ||
            (e.aliases || []).some(function (a) {
              return a && String(a).toLowerCase() === String(side).toLowerCase();
            }))
        );
      })[0];
      pushEnt(hit || { name: side, aliases: [side], kind: 'product' });
    });
    return out.slice(0, 3);
  }

  /**
   * Thin structural scaffold for local fallback only (model owns real dig queries).
   * One facet per side + contrast — entity names only, no encyclopedia/specialty templates.
   */
  function compareProductFacets(original, entities) {
    var products = compareProductEntities(entities, original);
    if (products.length < 2) return null;
    var facets = products.map(function (p, i) {
      return {
        id: 'f' + (i + 1),
        label: p.name,
        questions: [p.name + ' 一侧关键事实？'],
        queries: [normalizeResearchQuery(p.name)],
        keyPoints: ['待模型规划'],
        compareSide: p.name
      };
    });
    if (facets.length < 3) {
      var names = products.map(function (p) {
        return p.name;
      });
      facets.push({
        id: 'f' + (facets.length + 1),
        label: names.join(' vs '),
        questions: [original],
        queries: [
          disambiguateCompareQuery(original, original) || names.join(' vs '),
          normalizeResearchQuery(names.join(' ') + ' 对比')
        ]
          .filter(Boolean)
          .slice(0, 2),
        keyPoints: ['对照', '待模型规划']
      });
    }
    return facets.slice(0, 3);
  }

  /** Product sides present in topic but absent from gathered sources. */
  function missingComparePartners(sources, intent) {
    var products = compareProductEntities(
      (intent && intent.entities) || [],
      (intent && intent.originalQuestion) || ''
    );
    if (products.length < 2) return [];
    var blob = (sources || [])
      .map(function (s) {
        return (
          String((s && s.title) || '') +
          ' ' +
          String((s && s.snippet) || '') +
          ' ' +
          String((s && s.url) || '') +
          ' ' +
          String((s && s.text) || '').slice(0, 600)
        );
      })
      .join(' ');
    var blobLower = blob.toLowerCase();
    return products.filter(function (p) {
      if (blobHasToken(blob, blobLower, p.name)) return false;
      return !(p.aliases || []).some(function (a) {
        return a && blobHasToken(blob, blobLower, a);
      });
    });
  }

  /**
   * Local fallback only: subject + shell-free topic. No concept/org/creator/product
   * interpretation — WorkBuddy owns facet planning.
   */
  function minimalSalvageFacets(original, entities) {
    var cmpFacets = compareProductFacets(original, entities);
    if (cmpFacets && cmpFacets.length) return cmpFacets;
    var ordered = orderEntitiesForSearch(entities || []);
    var headEnt = pickPrimarySearchEntity(ordered);
    var head = headEnt ? headEnt.name : '';
    var shellFree = stripInterrogativeShell(original);
    var queries = [];
    if (extractCompareSides(original).length) {
      uniquePush(queries, disambiguateCompareQuery(original, original), 6);
    }
    if (head) uniquePush(queries, normalizeResearchQuery(head), 6);
    if (shellFree && shellFree !== original && shellFree !== head) {
      uniquePush(queries, normalizeResearchQuery(shellFree), 6);
    }
    if (!queries.length) uniquePush(queries, normalizeResearchQuery(original), 6);
    return [
      {
        id: 'f1',
        label: head || '原问题检索',
        questions: [original],
        queries: queries.slice(0, 4),
        keyPoints: ['保留主题，待模型规划']
      }
    ].filter(function (f) {
      return f.queries.length > 0;
    });
  }

  function salvageFacets(original, entities, concepts, phenomenon) {
    var cmpFacets = compareProductFacets(original, entities);
    if (cmpFacets && cmpFacets.length) return cmpFacets;
    var ordered = orderEntitiesForSearch(entities || []);
    var headEnt = pickPrimarySearchEntity(ordered);
    var head = headEnt ? headEnt.name : '';
    var aspectInfo = extractUserAspects(original);
    // User-stated aspects only — still no specialty templates beyond head+aspect.
    if (head && aspectInfo.aspects && aspectInfo.aspects.length) {
      return aspectInfo.aspects
        .map(function (asp, i) {
          return {
            id: 'f' + (i + 1),
            label: head + asp,
            questions: [head + '的' + asp + '？'],
            queries: [
              normalizeResearchQuery(head + ' ' + asp),
              normalizeResearchQuery(head)
            ].filter(Boolean).slice(0, 4),
            keyPoints: ['围绕「' + asp + '」取证'],
            aspect: asp
          };
        })
        .slice(0, 3);
    }
    // Ignore concepts/phenomenon specialty routing — model interprets.
    void concepts;
    void phenomenon;
    return minimalSalvageFacets(original, entities);
  }

  /** Parse/validate failure — block formal path; do not invent local search facets. */
  function degradedIntent(original, reason) {
    return modelPlanBlockedIntent(original, reason || 'parse_failed');
  }

  /** Local captain plan — full original question, no remote sentence split. */
  /**
   * Test/diagnostic heuristic only — MUST NOT drive the formal research path.
   * Formal path requires model ResearchIntent JSON (planSource=wb).
   */
  function buildLocalResearchIntent(topic) {
    var original = normalizeResearchTopic(topic || '');
    var entities = seedEntitiesFromTopic(original);
    var concepts = seedConceptsFromTopic(original);
    var aspectInfo = extractUserAspects(original);
    var phenomenon = '';
    if (/下饭|吃播/.test(original)) phenomenon = '美食下饭观看';
    else if (/不露面|停更|不直播|没有.*消息/.test(original)) phenomenon = '公开露面减少';
    var facets = salvageFacets(original, entities, concepts, phenomenon);
    var questionType = 'general';
    if (/为什么|为何/.test(original)) questionType = 'cause';
    else if (/对比|哪个|还是|vs\.?/i.test(original)) questionType = 'comparison';
    else if (/怎么|如何|流程|办理/.test(original)) questionType = 'procedure';
    else if (/什么是|履历|代表作|现状/.test(original)) questionType = 'fact';
    else if (aspectInfo.aspects && aspectInfo.aspects.length) questionType = 'fact';
    var local = {
      status: 'ready',
      degradeReason: null,
      planSource: 'local',
      source: 'local',
      validated: false,
      runnable: false,
      originalQuestion: original,
      researchGoal: original,
      questionType: questionType,
      cleanQuestion: original,
      intent: 'local_plan',
      subjects: entities.map(function (e) {
        return e.name;
      }),
      entities: entities,
      aspects: aspectInfo.aspects || [],
      phenomenon: phenomenon,
      searchConcepts: concepts,
      actions: [],
      timeRange: '',
      dimensions: aspectInfo.aspects || [],
      constraints: [],
      ambiguities: ['本地启发式（非正式路径；不可确认开跑）'],
      needsClarify: false,
      clarifyQuestion: '',
      clarifyOptions: [],
      facets: facets.length
        ? facets
        : [
            {
              id: 'f1',
              label: '原问题检索',
              questions: [original],
              queries: [normalizeResearchQuery(original)],
              keyPoints: ['保留原问题']
            }
          ]
    };
    return local;
  }

  /** Placeholder while waiting for model — empty entities/facets, not a search plan. */
  function planningIntentStub(topic) {
    var original = normalizeResearchTopic(topic || '');
    return {
      status: 'planning',
      degradeReason: null,
      planSource: null,
      source: 'local',
      validated: false,
      runnable: false,
      originalQuestion: original,
      researchGoal: original,
      questionType: 'general',
      cleanQuestion: original,
      intent: 'awaiting_model',
      subjects: [],
      entities: [],
      aspects: [],
      phenomenon: '',
      searchConcepts: [],
      actions: [],
      timeRange: '',
      dimensions: [],
      constraints: [],
      ambiguities: [],
      needsClarify: false,
      clarifyQuestion: '',
      clarifyOptions: [],
      facets: []
    };
  }

  /**
   * Model failed / invalid JSON — block formal run. No local entity/facet invention.
   */
  function modelPlanBlockedIntent(topic, reason) {
    var original = normalizeResearchTopic(topic || '');
    var why = String(reason || 'model_plan_required');
    var note =
      why === 'invalid_json'
        ? '规划模型已回复但不是合法 JSON，正式路径未建立——请换模型或重新规划'
        : /network_error|timeout|auth_failed|model_error|no_llm/.test(why)
          ? '规划模型调用失败（' + why + '），正式路径未建立——请检查模型后重新规划'
          : '规划模型未接通（' + why + '），正式路径未建立——请重新规划';
    return {
      status: 'degraded',
      degradeReason: why,
      planSource: 'local',
      source: 'local',
      validated: false,
      runnable: false,
      originalQuestion: original,
      researchGoal: original,
      questionType: 'general',
      cleanQuestion: original,
      intent: 'model_plan_required',
      subjects: [],
      entities: [],
      aspects: [],
      phenomenon: '',
      searchConcepts: [],
      actions: [],
      timeRange: '',
      dimensions: [],
      constraints: [],
      ambiguities: [note],
      needsClarify: false,
      clarifyQuestion: '',
      clarifyOptions: [],
      facets: []
    };
  }

  /** Formal path: explicit model captain fields only — not planSource string inference. */
  function isFormalModelIntent(intent) {
    if (!intent || intent.needsClarify) return false;
    if (intent.runnable === false) return false;
    if (intent.status === 'degraded' || intent.status === 'planning') return false;
    if (intent.degradeReason) return false;
    if (String(intent.source || '') !== 'model') return false;
    if (intent.validated !== true) return false;
    return Array.isArray(intent.facets) && intent.facets.length > 0;
  }

  function localIntentConfidence(intent) {
    if (!intent || !intent.facets || !intent.facets.length) return 'low';
    var primary = pickPrimarySearchEntity(intent.entities || []);
    if (primary && !isPlatformEntity(primary)) {
      var qHit = intent.facets.some(function (f) {
        return (f.queries || []).some(function (q) {
          return q && q.indexOf(primary.name) >= 0;
        });
      });
      if (qHit) return 'high';
    }
    if ((intent.searchConcepts || []).length >= 2 && intent.facets[0].queries.length >= 2) {
      return 'medium';
    }
    return 'low';
  }

  /** Coverage matrix for captain-style repair (missing / thin / shallow evidence). */
  function buildCoverageMatrix(intent, sources) {
    var primary = pickPrimarySearchEntity((intent && intent.entities) || []);
    var facets = (intent && intent.facets) || [];
    var srcList = sources || [];
    return facets.map(function (f) {
      var facetSources = srcList.filter(function (s) {
        if (!s) return false;
        if (!f || !f.id) return true;
        return !s.facetId || s.facetId === f.id;
      });
      if (!facetSources.length) facetSources = srcList;
      var blob = facetSources
        .map(function (s) {
          return (
            String((s && s.title) || '') +
            ' ' +
            String((s && s.snippet) || '') +
            ' ' +
            String((s && s.text) || '').slice(0, 800) +
            ' ' +
            String((s && s.url) || '')
          );
        })
        .join(' ');
      var hitPrimary =
        primary &&
        !isPlatformEntity(primary) &&
        blob.indexOf(primary.name) >= 0;
      var hasSrc = facetSources.some(function (s) {
        return String((s && (s.text || s.snippet)) || '').trim();
      });
      // Name echo without substance (团队/百科/代表作…) counts as shallow — triggers drill repair.
      var depthCue =
        /成立|创办|团队|成员|代表作|简介|百科|履历|导演|制片|百大|粉丝|播放|知乎|维基/.test(
          blob
        );
      var gapType = null;
      if (primary && !isPlatformEntity(primary) && !hitPrimary) gapType = 'missing_subject';
      else if (!hasSrc) gapType = 'thin_evidence';
      else if (hitPrimary && !depthCue) gapType = 'shallow_evidence';
      return {
        facetId: f.id,
        label: f.label,
        query: (f.queries && f.queries[0]) || f.query || '',
        sourceIds: facetSources
          .map(function (s) {
            return s && s.id;
          })
          .filter(Boolean),
        ok: !gapType,
        gapType: gapType,
        gapNote:
          gapType === 'missing_subject'
            ? '未命中主实体 ' + primary.name
            : gapType === 'thin_evidence'
              ? '证据不足'
              : gapType === 'shallow_evidence'
                ? '仅浅层命中，缺团队/作品/百科等下探'
                : ''
      };
    });
  }

  function buildRepairQueriesFromCoverage(coverage, intent, usedQueries) {
    var primary = pickPrimarySearchEntity((intent && intent.entities) || []);
    var products = compareProductEntities(
      (intent && intent.entities) || [],
      (intent && intent.originalQuestion) || ''
    );
    var needs = !(coverage || []).length
      ? true
      : (coverage || []).some(function (c) {
          return (
            c &&
            (!c.ok ||
              c.gapType === 'missing_subject' ||
              c.gapType === 'thin_evidence' ||
              c.gapType === 'shallow_evidence')
          );
        });
    var out = [];
    if (!needs && products.length < 2) return out;
    var used = {};
    (usedQueries || []).forEach(function (q) {
      if (q) used[String(q)] = true;
    });
    function pushFresh(q) {
      var nq = normalizeResearchQuery(q);
      if (!nq || used[nq]) return;
      if (/热门视频 排行榜|播放量 排行|UP主|bilibili 空间/.test(nq) && products.length >= 2) {
        return;
      }
      used[nq] = true;
      uniquePush(out, nq, 8);
    }
    // Compare fallback only: entity names + one contrast — model owns dig specialty.
    if (products.length >= 2) {
      products.forEach(function (p) {
        pushFresh(p.name);
      });
      var pnames = products.map(function (p) {
        return p.name;
      });
      pushFresh(pnames.join(' ') + ' 对比');
      return out.slice(0, 4);
    }
    if (!primary) {
      uniquePush(out, normalizeResearchQuery((intent && intent.originalQuestion) || ''), 4);
      return out;
    }
    function pushFreshPrimary(q) {
      var nq = normalizeResearchQuery(q);
      if (!nq || used[nq] || nq.indexOf(primary.name) < 0) return;
      if (/热门视频 排行榜|播放量 排行/.test(nq)) return;
      used[nq] = true;
      uniquePush(out, nq, 6);
    }
    var shallow = (coverage || []).some(function (c) {
      return c && (c.gapType === 'shallow_evidence' || c.gapType === 'thin_evidence');
    });
    var missing = (coverage || []).some(function (c) {
      return c && c.gapType === 'missing_subject';
    });
    if (missing) {
      pushFreshPrimary(primary.name);
      pushFreshPrimary(primary.name + ' UP主');
      pushFreshPrimary(primary.name + ' bilibili 空间');
    }
    ((intent && intent.aspects) || []).forEach(function (asp) {
      if (!asp) return;
      pushFreshPrimary(primary.name + ' ' + asp);
      pushFreshPrimary(primary.name + ' ' + asp + ' 资料');
    });
    if (shallow || !out.length) {
      creatorDepthQueries(primary.name).forEach(pushFreshPrimary);
      pushFreshPrimary(primary.name + ' 百度百科');
      pushFreshPrimary(primary.name + ' 维基百科');
      pushFreshPrimary(primary.name + ' 履历 代表作');
    }
    return out.slice(0, 4);
  }

  function normalizeResearchIntent(raw, originalQuestion) {
    var original = normalizeResearchTopic(originalQuestion || '');
    var doc = raw && typeof raw === 'object' ? raw : null;
    if (!doc) return degradedIntent(original, 'invalid_json');

    var subjects = Array.isArray(doc.subjects)
      ? doc.subjects
          .map(function (x) {
            return String(x || '').trim();
          })
          .filter(function (x) {
            return x.length >= 2 && !looksLikePredicateClause(x);
          })
          .slice(0, 6)
      : [];
    var entities = normalizeEntityList(doc.entities, subjects);
    // Seed known platforms/people from the original question when the model omits them.
    seedEntitiesFromTopic(original).forEach(function (e) {
      var exists = entities.some(function (x) {
        return x.name === e.name;
      });
      if (!exists) entities.push(e);
      else if (e.kind === 'person' || e.kind === 'creator') {
        // Upgrade kind if seed recognized a creator the model marked as other.
        for (var ei = 0; ei < entities.length; ei++) {
          if (entities[ei].name === e.name) {
            entities[ei].kind = e.kind;
            break;
          }
        }
      }
    });
    // Promote named subjects; never force abstract definition subjects to person
    // (that made「时间是什么」fall into UP主 salvage).
    extractNamedSubjects(original).forEach(function (n) {
      var hit = entities.some(function (x) {
        return x.name === n;
      });
      var kind = 'person';
      if (looksLikeOrgOrProductName(n)) kind = 'org';
      else if (looksLikeConceptWord(n)) kind = 'concept';
      else if (
        extractDefinitionSubject(original) === n &&
        !looksLikeCreatorSubject(n, original)
      )
        kind = 'concept';
      else if (!looksLikeCreatorSubject(n, original) && !/UP主|主播|博主/.test(original))
        kind = 'other';
      if (!hit) entities.unshift({ name: n, aliases: [], kind: kind });
      else {
        entities.forEach(function (x) {
          if (x.name !== n) return;
          // Do not upgrade concept/other → person.
          if (x.kind === 'concept' || x.kind === 'other' || x.kind === 'org') return;
          if (kind === 'person') x.kind = 'person';
        });
      }
    });
    entities = orderEntitiesForSearch(pruneStemEntities(entities));
    if (!subjects.length) {
      subjects = entities.map(function (e) {
        return e.name;
      });
    }
    var searchConcepts = Array.isArray(doc.searchConcepts)
      ? doc.searchConcepts
          .map(function (x) {
            return String(x || '').trim();
          })
          .filter(function (x) {
            return x.length >= 2 && x.length <= 24;
          })
          .slice(0, 8)
      : [];
    seedConceptsFromTopic(original).forEach(function (c) {
      uniquePush(searchConcepts, c, 8);
    });
    var phenomenon = String(doc.phenomenon || '').trim().slice(0, 120);
    var dimensions = Array.isArray(doc.dimensions)
      ? doc.dimensions
          .map(function (x) {
            return String(x || '').trim();
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];
    var constraints = Array.isArray(doc.constraints)
      ? doc.constraints
          .map(function (x) {
            return String(x || '').trim();
          })
          .filter(Boolean)
          .slice(0, 8)
      : [];
    var seenQ = {};
    var facets = Array.isArray(doc.facets)
      ? doc.facets
          .map(function (f, i) {
          f = f || {};
            var queries = facetQueriesFromRaw(f)
              .map(function (q) {
                return normalizeResearchQuery(q);
              })
                .filter(function (q) {
                if (!queryAlignedWithIntent(q, entities, searchConcepts, original))
                  return false;
                if (seenQ[q]) return false;
                seenQ[q] = true;
                return true;
              })
              .slice(0, 4);
            var label = String(f.label || '').trim().slice(0, 48);
            if (!label || /^调查面\d*$/.test(label)) {
              label = (queries[0] || '调查面' + (i + 1)).slice(0, 48);
            }
          return {
            id: f.id || 'f' + (i + 1),
              label: label,
            questions: Array.isArray(f.questions)
                ? f.questions
                    .map(function (q) {
                      return String(q || '').trim();
                    })
                    .filter(Boolean)
                    .slice(0, 4)
              : [],
            queries: queries,
            keyPoints: Array.isArray(f.keyPoints)
                ? f.keyPoints
                    .map(function (x) {
                      return String(x || '').trim();
                    })
                    .filter(Boolean)
                    .slice(0, 5)
              : []
          };
          })
          .filter(function (f) {
            return f.queries.length > 0;
          })
          .slice(0, 3)
      : [];

    var questionType = String(doc.questionType || doc.intent || 'general')
      .trim()
      .toLowerCase();
    if (!/^(cause|comparison|procedure|fact|general)/.test(questionType)) {
      questionType = 'general';
    }

    var salvaged = false;
    var primaryEnt = pickPrimarySearchEntity(entities);
    var facetsMissPrimary =
      !!primaryEnt &&
      !isPlatformEntity(primaryEnt) &&
      !facets.some(function (f) {
        return (f.queries || []).some(function (q) {
          return q && q.indexOf(primaryEnt.name) >= 0;
        });
      });
    var compareSides = compareProductEntities(entities, original);
    if (!facets.length) {
      // Empty model facets → thin subject seed only; never invent dig specialty.
      facets = minimalSalvageFacets(original, entities);
      salvaged = facets.length > 0;
    } else if (compareSides.length >= 2) {
      // Append missing-side facets only — never replace the model's query plan.
      compareSides.forEach(function (p) {
        if (facets.length >= 3) return;
        var covered = facets.some(function (f) {
          var blob = ((f.queries || []).join(' ') + ' ' + (f.label || '')).toLowerCase();
          return (
            blob.indexOf(String(p.name).toLowerCase()) >= 0 ||
            (p.aliases || []).some(function (a) {
              return a && blob.indexOf(String(a).toLowerCase()) >= 0;
            })
          );
        });
        if (covered) return;
        facets.push({
          id: 'f' + (facets.length + 1),
          label: p.name,
          questions: [p.name + ' 一侧关键事实？'],
          queries: [normalizeResearchQuery(p.name)],
          keyPoints: ['缺侧补面，待模型下探'],
          compareSide: p.name
        });
        salvaged = true;
      });
    }
    if (facetsMissPrimary && primaryEnt && facets[0]) {
      // Guard only: prepend primary name; keep model dig queries.
      var merged = [normalizeResearchQuery(primaryEnt.name)];
      (facets[0].queries || []).forEach(function (cq) {
        uniquePush(merged, cq, 6);
      });
      facets[0].queries = merged.slice(0, 4);
      salvaged = true;
    }

    var clarifyOptions = Array.isArray(doc.clarifyOptions)
      ? doc.clarifyOptions
          .map(function (o, i) {
            if (!o) return null;
            var label = String(o.label || o.title || '').trim().slice(0, 48);
            var refined = String(o.refinedTopic || o.topic || '').trim().slice(0, 120);
            if (!refined && label) refined = label.slice(0, 120);
            if (!label || !refined) return null;
            if (/^opt\d+$/i.test(refined)) refined = label.slice(0, 120);
            return {
              id: String(o.id || 'opt' + (i + 1)).slice(0, 32),
              label: label,
              refinedTopic: refined
            };
          })
          .filter(Boolean)
          .slice(0, 4)
      : [];
    var wantsClarify = !!doc.needsClarify || clarifyOptions.length > 0;

    // Clarify-first: don't degrade away the chips when the model skipped dig facets.
    if (wantsClarify && !facets.length) {
      facets = [
        {
          id: 'f1',
          label: '待澄清后规划',
          questions: [original],
          queries: [normalizeResearchQuery(original)],
          keyPoints: ['先澄清方向']
        }
      ];
      salvaged = true;
    }

    if (!entities.length && !searchConcepts.length && !phenomenon && !facets.length) {
      return degradedIntent(original, 'missing_entities_or_facets');
    }
    if (!facets.length) {
      return degradedIntent(original, 'missing_entities_or_facets');
    }

    var ambiguities = Array.isArray(doc.ambiguities)
      ? doc.ambiguities
          .map(function (x) {
            return String(x || '').trim();
          })
          .filter(Boolean)
          .slice(0, 6)
      : [];
    if (salvaged) ambiguities.push('模型调查面不完整，已用主题种子查询补全');

    var preferredPath = String(doc.preferredPath || '').trim().toLowerCase();
    if (preferredPath !== 'fast' && preferredPath !== 'faceted') preferredPath = '';

    return normalizeModelClarify({
      status: 'ready',
      degradeReason: null,
      originalQuestion: original,
      researchGoal: String(doc.researchGoal || doc.cleanQuestion || original).trim().slice(0, 800),
      questionType: questionType,
      preferredPath: preferredPath,
      cleanQuestion: original,
      intent: String(doc.intent || questionType || 'general_research').trim(),
      subjects: subjects,
      entities: entities,
      phenomenon: phenomenon,
      searchConcepts: searchConcepts,
      actions: Array.isArray(doc.actions)
        ? doc.actions
            .map(function (x) {
              return String(x || '').trim();
            })
            .filter(Boolean)
            .slice(0, 6)
        : [],
      timeRange: String(doc.timeRange || '').trim().slice(0, 80),
      dimensions: dimensions,
      constraints: constraints,
      ambiguities: ambiguities,
      needsClarify: wantsClarify,
      clarifyQuestion: String(doc.clarifyQuestion || '').trim().slice(0, 160),
      clarifyOptions: clarifyOptions,
      facets: facets
    });
  }

  function buildResearchIntentPrompt(topic) {
    return [
      '只输出一个 ResearchIntent JSON 对象。不要 markdown 代码块，不要解释，不要前言，不要思考过程。',
      '用户问题：' + String(topic || ''),
      '你是调研意图解析器，不是搜索引擎。把完整问题解析成 JSON；originalQuestion 必须保留原文。',
      '区分 entities / phenomenon / researchGoal；不要把整句谓词标成专名。',
      '「什么是X」：entities 含 X；facets.queries 含百科/定义/官网类下探；禁止 bilibili/UP主模板。',
      '对比题：entities 含双方；facets 至少两面分侧 + 一面对照。',
      '过宽题（如「帮我看看网络如何」「怎么操作」「如何使用」「怎么办」且无具体对象）：needsClarify=true + clarifyOptions 2～4 个（可结合 priorTopics）；勿硬猜开搜，禁止只搜「操作/使用」等光杆词。',
      '人物事实题（如「X的前妻/配偶/经历」）：entities 含人名整词；facets.queries 用人名+关系/百科/新闻下探，勿丢人名。',
      'preferredPath：对比/横评/拍照评测/多面深挖用 faceted；单点事实核实用 fast。对比题 facets.queries 须覆盖各方 + 至少一条双方对照，禁止只搜单侧官网。',
      'facets 2-3 个互补调查面；专名整词+aliases；禁止单字或“调查面1”；queries 须可检索（含主实体，禁止空壳动词）。',
      '字段：originalQuestion, researchGoal, questionType(cause|comparison|procedure|fact|general), preferredPath(fast|faceted), entities[{name,aliases,kind}], phenomenon, searchConcepts, timeRange, constraints, ambiguities, needsClarify, clarifyQuestion, clarifyOptions[{id,label,refinedTopic}], facets[{id,label,questions,queries,keyPoints}]。',
      'priorTopics：' +
        (recentTopicsForClarify().length
          ? recentTopicsForClarify().join(' | ')
          : '（无）')
    ].join('\n');
  }

  function buildQueryRewritePrompt(topic, intent, triedQueries, dropHints) {
    var primary = pickPrimarySearchEntity((intent && intent.entities) || []) || null;
    var primaryName = primary ? primary.name : '';
    var tried = (triedQueries || [])
      .map(function (q) {
        return String(q || '').trim();
      })
      .filter(Boolean)
      .slice(0, 12);
    var drops =
      dropHints && typeof dropHints === 'object'
        ? Object.keys(dropHints)
            .map(function (k) {
              return k + '=' + dropHints[k];
            })
            .join(', ')
        : String(dropHints || '');
    var products = compareProductEntities(
      (intent && intent.entities) || [],
      topic
    );
    return [
      '你是检索改写助手。由你判断该挖什么；首轮检索过稀或偏题，请输出 3～5 个互补搜索词（JSON 字符串数组）。',
      '必须保留主实体/对比各方整词；禁止把「什么是/啥是」当查询核心；禁止无关平台/UP主模板喧宾夺主；禁止只堆播放页。',
      products.length >= 2
        ? '对比题：为缺证一侧与双方对照各给检索；类型按题意自选，勿依赖本地固定模板。'
        : '',
      '主题：' + String(topic || ''),
      '主实体：' + (primaryName || '（无）'),
      '对比各方：' +
        (products.length
          ? products
              .map(function (p) {
                return p.name;
              })
              .join('、')
          : '（无）'),
      '已试查询：' + (tried.length ? tried.join(' | ') : '（无）'),
      '丢弃原因：' + (drops || '（无）'),
      '只输出 JSON 字符串数组。'
    ]
      .filter(Boolean)
      .join('\n');
  }

  function sourceHostKey(url) {
    try {
      var h = String(new URL(String(url || '')).hostname || '')
        .toLowerCase()
        .replace(/^www\./, '');
      return h;
    } catch (_) {
      var m = String(url || '').match(/https?:\/\/([^/]+)/i);
      return m ? String(m[1]).toLowerCase().replace(/^www\./, '') : '';
    }
  }

  function isThirdPartyAuthorityHost(host) {
    return /wikipedia\.|wiki|baike\.baidu|zhihu\.|douban\.|sspai\.|infoq\.|36kr\.|theverge\.|wired\.|arstechnica\.|stackoverflow\.|smashingmagazine\.|dev\.to|juejin\.|csdn\.|cnblogs\.|nytimes\.|bbc\.|reuters\.|techcrunch\.|zdnet\.|cnet\.|pcmag\.|tomshardware\.|medium\.com|github\.io|learn\.microsoft|developer\.mozilla|docs\.|readthedocs/i.test(
      String(host || '')
    );
  }

  function isDictionaryTrapHit(hit, topic) {
    if (/什么是|啥是|什么意思|定义/.test(String(topic || ''))) return false;
    var blob =
      String((hit && hit.title) || '') +
      ' ' +
      String((hit && hit.url) || '') +
      ' ' +
      String((hit && hit.snippet) || '');
    return /dict\.|zdic\.|zidian|词典|组词|什么意思|vocabulary|英汉|汉英/i.test(blob);
  }

  function heuristicAuthorityDigQueries(topic, primaryName, intent, sources) {
    var fb = [];
    var t = String(topic || '');
    var missing = missingComparePartners(sources || [], intent || { originalQuestion: t, entities: [] });
    var products = compareProductEntities(
      (intent && intent.entities) || [],
      t
    );
    // Thin fallback only — model owns specialty dig axes.
    missing.forEach(function (p) {
      uniquePush(fb, normalizeResearchQuery(p.name), 6);
    });
    if (products.length >= 2) {
      var names = products.map(function (p) {
        return p.name;
      });
      uniquePush(fb, normalizeResearchQuery(names.join(' ') + ' 对比'), 6);
      return fb.slice(0, 4);
    }
    if (!primaryName) return fb.slice(0, 3);
    var geo = /国内|国外|海外|中国|全球|国内外/.test(t);
    if (geo) {
      uniquePush(fb, normalizeResearchQuery(primaryName + ' 国内'), 4);
      uniquePush(fb, normalizeResearchQuery(primaryName + ' China'), 4);
    }
    uniquePush(fb, normalizeResearchQuery(primaryName), 4);
    return fb.slice(0, 3);
  }

  /** True when corpus is official/marketing-heavy or still blocked — needs authority dig. */
  function corpusNeedsAuthorityDig(sources, opts) {
    opts = opts || {};
    if (opts.coverageBlocked || opts.zeroFactFacets) return true;
    if (opts.pickedMiss && opts.rawHits > 0) return true;
    if (opts.missingPartners && opts.missingPartners.length) return true;
    if (opts.shallowPlay || corpusMostlyShallowPlay(sources)) return true;
    var list = (sources || []).filter(function (s) {
      return s && s.url;
    });
    if (!list.length) return true;
    if (list.length < 3) return true;
    var hosts = {};
    var third = 0;
    list.forEach(function (s) {
      var h = sourceHostKey(s.url);
      if (!h) return;
      hosts[h] = (hosts[h] || 0) + 1;
      if (isThirdPartyAuthorityHost(h)) third += 1;
    });
    var maxShare = 0;
    Object.keys(hosts).forEach(function (k) {
      maxShare = Math.max(maxShare, hosts[k] / list.length);
    });
    if (maxShare >= 0.5 && third === 0) return true;
    if (third === 0 && list.length <= 4) return true;
    return false;
  }

  function buildAuthorityDigPrompt(topic, intent, sourceHosts, triedQueries, sources) {
    var primary = pickPrimarySearchEntity((intent && intent.entities) || []);
    var primaryName = primary ? primary.name : '';
    var products = compareProductEntities(
      (intent && intent.entities) || [],
      topic
    );
    var geo = /国内|国外|海外|中国|全球|国内外/.test(String(topic || ''));
    var missing = missingComparePartners(sources || [], intent || {
      originalQuestion: topic,
      entities: (intent && intent.entities) || []
    });
    var shallow = corpusMostlyShallowPlay(sources || []);
    return [
      '你是权威源补搜助手。由你判断该挖什么；本地不会替你填固定模板。',
      '当前材料偏浅、偏单侧、偏播放页或偏官网，请输出 2～5 个互补检索词（JSON 字符串数组）。',
      '目标：开放挖掘可对照的权威/分析材料；禁止只重复已有单侧；禁止词典/组词页；禁止再堆视频播放页。',
      products.length >= 2
        ? '对比题：每一方至少一条独立检索 + 至少一条双方对照；检索类型按题意自选（百科/评测/设定/阵容/口碑/横评等），不得只搜主实体一侧；不要虚构未出现的对比方。'
        : '',
      missing.length
        ? '缺侧优先：' +
          missing
            .map(function (p) {
              return p.name;
            })
            .join('、') +
          ' — 为缺侧自选最能补齐对照事实的检索。'
        : '',
      shallow ? '已有来源多为播放页：改搜可引用的分析/百科/对照页，勿再搜同站播放链。' : '',
      geo
        ? '本题含国内外对照轴：至少一条查国内/China/中国落地，一条查海外产品本体或评测。'
        : '',
      '禁止 UP主/bilibili 喧宾夺主（除非主题本身是 UP主）。',
      '主题：' + String(topic || ''),
      '主实体：' + (primaryName || '（无）'),
      '对比各方：' +
        (products.length
          ? products
              .map(function (p) {
                return p.name;
              })
              .join('、')
          : '（无）'),
      '已有来源域名：' + ((sourceHosts || []).slice(0, 8).join('、') || '（无）'),
      '已试查询：' + ((triedQueries || []).slice(0, 10).join(' | ') || '（无）'),
      '只输出 JSON 字符串数组。'
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Plan 2–4 authority dig queries. Returns [] when no budget / model fail.
   */
  function planAuthorityDigQueries(topic, intent, sources, triedQueries, opts) {
    opts = opts || {};
    var skipLedger = !!opts.skipLedger;
    var primary = pickPrimarySearchEntity((intent && intent.entities) || []);
    var primaryName = primary ? primary.name : '';
    var products = compareProductEntities(
      (intent && intent.entities) || [],
      topic
    );
    var hosts = [];
    (sources || []).forEach(function (s) {
      var h = sourceHostKey(s && s.url);
      if (h) uniquePush(hosts, h, 12);
    });
    if (!skipLedger && !ledgerCanOptionalModel(1, { reserveSynth: true })) {
      return Promise.resolve(
        heuristicAuthorityDigQueries(topic, primaryName, intent, sources)
      );
    }
    return chatOnce(
      [
        {
          role: 'system',
          content: buildAuthorityDigPrompt(topic, intent, hosts, triedQueries, sources)
        },
        { role: 'user', content: String(topic || '') }
      ],
      {
        maxTokens: 256,
        purpose: 'repair',
        skipLedger: skipLedger,
        skipController: skipLedger
      }
    )
      .then(function (chat) {
        var planned = parseQueryPlanJson(chat && chat.text) || [];
        // Compare: keep queries that name ANY product side (missing partner dig OK).
        if (products.length >= 2) {
          planned = planned.filter(function (q) {
            return products.some(function (p) {
              return blobHasToken(String(q), String(q).toLowerCase(), p.name);
            });
          });
        } else if (primaryName) {
          planned = planned.filter(function (q) {
            return blobHasToken(String(q), String(q).toLowerCase(), primaryName);
          });
        }
        var out = [];
        planned.forEach(function (q) {
          uniquePush(out, normalizeResearchQuery(q), 6);
        });
        // Model-first: only fill gaps (empty plan or unnamed missing side).
        if (!out.length) {
          heuristicAuthorityDigQueries(topic, primaryName, intent, sources).forEach(
            function (q) {
              uniquePush(out, q, 6);
            }
          );
        } else {
          missingComparePartners(sources || [], intent || { originalQuestion: topic, entities: (intent && intent.entities) || [] }).forEach(
            function (p) {
              var named = out.some(function (q) {
                return blobHasToken(String(q), String(q).toLowerCase(), p.name);
              });
              if (!named) uniquePush(out, normalizeResearchQuery(p.name), 6);
            }
          );
        }
        return out.slice(0, 6);
      })
      .catch(function () {
        return heuristicAuthorityDigQueries(topic, primaryName, intent, sources);
      });
  }

  function isBoilerplateLimitation(t) {
    return /结论仅基于所列来源|未覆盖来源外信息|^调研深度：/.test(String(t || ''));
  }

  function isProgrammaticCiteNoise(t) {
    return /部分引用无效|引用了搜索摘要线索|缺少有效来源引用|成稿未解析为结构化/.test(
      String(t || '')
    );
  }

  function buildIntentRepairPrompt(topic, brokenText) {
    return [
      '上一次 ResearchIntent JSON 无效。请只输出合法 JSON，字段同合同。',
      '保留 originalQuestion 为用户原句。不要输出解释。',
      '用户问题：' + String(topic || ''),
      '上次输出：' + String(brokenText || '').slice(0, 1200)
    ].join('\n');
  }

  /**
   * Model-first captain plan. Formal path requires planSource=wb JSON.
   * Local heuristics are diagnostics only — never become the runnable plan.
   */
  function resolveSemanticIntent(topic, path, opts) {
    opts = opts || {};
    var skipLedger = !!opts.skipLedger;
    var original = normalizeResearchTopic(topic);
    var conf = 'low';
    state.progress.message = '正在用模型规划…';
    emit(true);

    function acceptLocal(reason) {
      var why = String(reason || 'local_fallback');
      // Formal path stays blocked — do not hand search/filter to local heuristics.
      var blocked = modelPlanBlockedIntent(original, why);
      state.researchIntent = blocked;
      if (state.metrics) {
        state.metrics.planSource = 'local';
        state.metrics.intentConfidence = conf;
        state.metrics.degradeReason = why;
      }
      traceEvent('intent', {
        ok: false,
        status: 'degraded',
        planSource: 'local',
        source: 'local',
        validated: false,
        confidence: conf,
        reason: why,
        entities: [],
        concepts: [],
        facetCount: 0
      });
      return Promise.resolve(blocked);
    }

    // Model-first: try WorkBuddy whenever budget allows (prepare uses skipLedger).
    var allowModel = skipLedger;
    if (!allowModel) {
      if (!state.ledger) {
        allowModel = true;
      } else {
        allowModel =
          ledgerCan('model', 1) &&
          ledgerCanOptionalModel(1, { reserveSynth: true });
      }
    }
    if (!allowModel) {
      return acceptLocal('no_model_budget');
    }

    function enrichFromChat(chat) {
      return normalizeResearchIntent(
        extractResearchIntentJson(chat && chat.text),
        original
      );
    }

    function runIntentChat(providerId) {
      return chatOnce(
        [
          { role: 'system', content: buildResearchIntentPrompt(original) },
          {
            role: 'user',
            content:
              '主题：' +
              original +
              '\n请只输出合法 ResearchIntent JSON（以 { 开头）。'
          }
        ],
        {
          maxTokens: 1800,
          skipLedger: skipLedger,
          skipController: skipLedger,
          purpose: 'intent',
          providerId: providerId
        }
      );
    }

    /** hy3/WorkBuddy often wraps prose around JSON — one strict repair pass. */
    function runIntentRepairChat(badText, providerId) {
      return chatOnce(
        [
          {
            role: 'system',
            content: [
              '只输出一个 JSON 对象，以 { 开头、以 } 结尾。',
              '不要 markdown，不要解释，不要思考过程。',
              '必须含 originalQuestion、entities、facets（2个调查面，每面含 queries）。',
              '主题：' + original
            ].join('\n')
          },
          {
            role: 'user',
            content:
              '把下面内容改写成合法 ResearchIntent JSON：\n' +
              String(badText || '').slice(0, 800)
          }
        ],
        {
          maxTokens: 1800,
          skipLedger: true,
          skipController: true,
          purpose: 'intent',
          providerId: providerId
        }
      );
    }

    function afterInvalidJson(chat, enriched) {
      var repairProvider =
        chat &&
        (chat.providerId === 'softpad_our_freemodel' ||
          chat.routeProviderId === 'softpad_our_freemodel')
          ? 'workbuddy'
          : (chat && chat.providerId) || undefined;
      return runIntentRepairChat(chat && chat.text, repairProvider)
        .then(function (chat2) {
          var again = enrichFromChat(chat2);
          if (again.status === 'ready') {
            again.planSource = again.planSource || 'wb';
            return again;
          }
          return acceptLocal(
            again.degradeReason || enriched.degradeReason || 'invalid_json'
          );
        })
        .catch(function () {
          return acceptLocal(enriched.degradeReason || 'invalid_json');
        });
    }

    return runIntentChat()
      .then(function (chat) {
        var enriched = enrichFromChat(chat);
        // Soft Pad may return 200 with prose; retry WorkBuddy once before repair.
        // routeProviderId stays softpad even when Soft Pad backend is deepseek/kimi/….
        var softRoute =
          chat &&
          (chat.routeProviderId === 'softpad_our_freemodel' ||
            chat.providerId === 'softpad_our_freemodel');
        if (enriched.status !== 'ready' && softRoute && !chat.fallbackFrom) {
          return runIntentChat('workbuddy').then(function (chat2) {
            var again = enrichFromChat(chat2);
            if (again.status === 'ready') {
              again.planSource = again.planSource || 'wb';
              return again;
            }
            return afterInvalidJson(chat2 || chat, again.status !== 'ready' ? again : enriched);
          });
        }
        if (enriched.status !== 'ready') {
          if (chat && chat.text) return afterInvalidJson(chat, enriched);
          return acceptLocal(enriched.degradeReason || 'enrich_failed');
        }
        return enriched;
      })
      .catch(function (err) {
        // Must not leave preparePlan hung on「规划中…」.
        var c = classifyModelFailure(err);
        return acceptLocal(c.code || 'model_error');
      })
      .then(function (enriched) {
        if (!enriched || enriched.planSource === 'local' || enriched.status === 'degraded') {
          return enriched;
        }
        // Model owns entities/facets — no local primary injection on the formal path.
        enriched.planSource = 'wb';
        enriched.source = 'model';
        enriched.validated = true;
        enriched.runnable = true;
        enriched.degradeReason = null;
        state.researchIntent = enriched;
        if (state.metrics) {
          state.metrics.planSource = 'wb';
          state.metrics.intentConfidence = conf;
          state.metrics.degradeReason = null;
        }
        traceEvent('intent', {
          ok: true,
          status: 'ready',
          planSource: 'wb',
          source: 'model',
          validated: true,
          confidence: conf,
          entities: (enriched.entities || []).map(function (e) {
            return e.name;
          }),
          facetCount: (enriched.facets || []).length
        });
        return enriched;
      })
      .catch(function (err) {
        return acceptLocal(String((err && err.code) || err || 'enrich_error'));
      });
  }

  function facetsFromIntent(intent) {
    return (intent.facets || []).map(function (f) {
      return {
        id: f.id,
        label: f.label,
        query: (f.queries && f.queries[0]) || intent.originalQuestion,
        queries: (f.queries || []).slice(),
        questions: (f.questions || []).slice(),
        keyPoints: f.keyPoints && f.keyPoints.length ? f.keyPoints : ['关键事实'],
        aspect: f.aspect || null
      };
    });
  }

  /** Round-robin queries across facets: q0 for each facet, then q1, … */
  function buildRoundRobinSearches(facets, maxSearches) {
    var jobs = [];
    var maxQ = 0;
    (facets || []).forEach(function (f) {
      var qs = f.queries && f.queries.length ? f.queries : f.query ? [f.query] : [];
      if (qs.length > maxQ) maxQ = qs.length;
    });
    var qi;
    var fi;
    for (qi = 0; qi < maxQ; qi++) {
      for (fi = 0; fi < (facets || []).length; fi++) {
        if (maxSearches && jobs.length >= maxSearches) return jobs;
        var f = facets[fi];
        var qs2 = f.queries && f.queries.length ? f.queries : f.query ? [f.query] : [];
        if (!qs2[qi]) continue;
        jobs.push({ facetId: f.id, label: f.label, query: qs2[qi], queryIndex: qi });
      }
    }
    return jobs;
  }

  /**
   * Model query rewrite for thin funnel / repair. Filters by primary entity.
   * Returns [] when budget missing or model fails (caller keeps prior queries).
   */
  function rewriteSearchQueries(topic, intent, triedQueries, dropHints, opts) {
    opts = opts || {};
    var original = normalizeResearchTopic(topic || (intent && intent.originalQuestion) || '');
    var primary = pickPrimarySearchEntity((intent && intent.entities) || []);
    var primaryName = primary ? primary.name : '';
    if (!primaryName) {
      var anchors = extractTopicAnchors(original);
      if (anchors.requirePrimary && anchors.primary) primaryName = anchors.primary;
    }
    if (!opts.skipLedger) {
      if (!ledgerCanOptionalModel(1, { reserveSynth: true })) {
        return Promise.resolve([]);
      }
    }
    return chatOnce(
      [
        {
          role: 'system',
          content: buildQueryRewritePrompt(original, intent, triedQueries, dropHints)
        },
        { role: 'user', content: original }
      ],
      { maxTokens: 256, skipLedger: !!opts.skipLedger, skipController: !!opts.skipLedger, purpose: 'planning' }
    )
      .then(function (chat) {
        var planned = parseQueryPlanJson(chat && chat.text) || [];
        var products = compareProductEntities(
          (intent && intent.entities) || [],
          original
        );
        if (products.length >= 2) {
          var sideKept = planned.filter(function (q) {
            return products.some(function (p) {
              return blobHasToken(String(q), String(q).toLowerCase(), p.name);
            });
          });
          // Don't veto model rewrite to empty — keep original planned if filter kills all.
          if (sideKept.length) planned = sideKept;
        } else if (primaryName && !opts.loosePrimary) {
          var primaryKept = planned.filter(function (q) {
            return blobHasToken(String(q), String(q).toLowerCase(), primaryName);
          });
          if (primaryKept.length) planned = primaryKept;
        }
        var out = [];
        planned.forEach(function (q) {
          uniquePush(out, normalizeResearchQuery(q), 6);
        });
        return out.slice(0, 5);
      })
      .catch(function () {
        return [];
      });
  }

  function planSearchQueries(topic) {
    var fallback = planSearchQueriesHeuristic(topic);
    var anchorInfo = extractTopicAnchors(topic);
    state.progress.message = '正在拆解检索词…';
    emit(true);
    var seedIntent = {
      originalQuestion: topic,
      entities: seedEntitiesFromTopic(topic)
    };
    return rewriteSearchQueries(topic, seedIntent, fallback, null, { skipLedger: false })
      .then(function (planned) {
        if (planned && anchorInfo.requirePrimary && anchorInfo.primary) {
          planned = planned.filter(function (q) {
            return String(q).indexOf(anchorInfo.primary) >= 0;
          });
        }
        if (planned && planned.length) {
          var merged = [];
          planned.forEach(function (q) {
            uniquePush(merged, q, 8);
          });
          fallback.forEach(function (q) {
            uniquePush(merged, q, 8);
          });
          return merged.slice(0, 6);
        }
        return fallback;
      })
      .catch(function () {
        return fallback;
      });
  }

  function hitMentions(hit, token) {
    var blob =
      String((hit && hit.title) || '') +
      ' ' +
      String((hit && hit.snippet) || '') +
      ' ' +
      String((hit && hit.url) || '');
    return blob.indexOf(token) >= 0;
  }

  function mergeHitsByUrl(into, hits) {
    var seen = {};
    into.forEach(function (h) {
      if (h && h.url) seen[h.url] = true;
    });
    (hits || []).forEach(function (h) {
      if (!h || !h.url || seen[h.url]) return;
      seen[h.url] = true;
      into.push(h);
    });
    return into;
  }

  /** Prefer coverage across named entities when trimming. */
  function selectBalancedHits(hits, max, tokens) {
    var list = (hits || []).slice();
    if (list.length <= max) return list;
    var picked = [];
    var used = {};
    function take(pred) {
      for (var i = 0; i < list.length && picked.length < max; i++) {
        var h = list[i];
        if (!h || !h.url || used[h.url]) continue;
        if (pred && !pred(h)) continue;
        used[h.url] = true;
        picked.push(h);
      }
    }
    (tokens || []).forEach(function (tok) {
      if (!tok) return;
      take(function (h) {
        return hitMentions(h, tok);
      });
    });
    take(null);
    return picked;
  }

  function stripPromptEcho(md) {
    var text = String(md || '').trim();
    // Reasoning-capable providers may wrap hidden thoughts around the final
    // JSON/Markdown. Never render that control text as report content.
    text = text
      .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
      .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, '')
      .replace(/<\|(?:thinking|analysis)\|>[\s\S]*?<\|end(?:_of)?(?:thinking|analysis)\|>/gi, '')
      .trim();
    if (/^规则\s*[：:]/m.test(text) || /^\d+\.\s*紧扣主题/.test(text)) {
      var cut = text.search(/^#\s+\S/m);
      if (cut > 0) text = text.slice(cut);
    }
    text = text.replace(/^规则[\s\S]*?(?=^#\s+)/m, '');
    return text.trim();
  }

  var BLOCK_TYPES = {
    paragraph: true,
    bullets: true,
    comparison: true,
    steps: true,
    timeline: true,
    risk: true,
    evidence: true,
    quote: true,
    faq: true,
    decision: true,
    limitations: true
  };

  function stripCodeFences(text) {
    var s = String(text || '').trim();
    var m = s.match(/^```(?:json|JSON)?\s*([\s\S]*?)```\s*$/);
    if (m) return String(m[1] || '').trim();
    // Model often adds a short preface before a closed fence.
    var mid = s.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
    if (mid) return String(mid[1] || '').trim();
    return s.replace(/^```(?:json|JSON)?\s*/i, '').replace(/\s*```$/i, '').trim();
  }

  function stripReasoningEnvelope(text) {
    var s = String(text || '')
      .replace(/<think(?:ing)?\b[^>]*>[\s\S]*?<\/think(?:ing)?>/gi, '')
      .replace(/<analysis\b[^>]*>[\s\S]*?<\/analysis>/gi, '')
      .replace(/<\|(?:thinking|analysis)\|>[\s\S]*?<\|end(?:_of)?(?:thinking|analysis)\|>/gi, '');
    // Unclosed think/analysis dumps (hy3 truncate) — drop prefix until first JSON brace.
    s = s.replace(/^[\s\S]*?(<(?:think(?:ing)?|analysis)\b[^>]*>)/i, '');
    s = s.replace(/<(?:think(?:ing)?|analysis)\b[^>]*>[\s\S]*$/i, function (m) {
      var brace = m.search(/[{[]/);
      return brace >= 0 ? m.slice(brace) : '';
    });
    return s.trim();
  }

  /** hy3 often emits trailing commas / smart quotes that break JSON.parse. */
  function repairLooseJsonText(text) {
    var s = String(text || '')
      .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
      .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
      .replace(/,\s*([}\]])/g, '$1');
    // Truncated object/array: close open braces/brackets outside strings.
    var stack = [];
    var inString = false;
    var escape = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') stack.push('}');
      else if (ch === '[') stack.push(']');
      else if (ch === '}' || ch === ']') {
        if (stack.length && stack[stack.length - 1] === ch) stack.pop();
      }
    }
    if (inString) s += '"';
    while (stack.length) s += stack.pop();
    return s;
  }

  function looksLikeResearchDocument(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (obj.executiveAnswer != null || (Array.isArray(obj.blocks) && obj.blocks.length))
      return true;
    if (obj.title && (obj.summary != null || obj.claims != null)) return true;
    return false;
  }

  function scoreResearchDocument(obj) {
    if (!looksLikeResearchDocument(obj)) return -1;
    var score = 0;
    if (obj.title) score += 2;
    if (obj.executiveAnswer) score += 4;
    if (Array.isArray(obj.blocks)) score += Math.min(8, obj.blocks.length * 2);
    if (Array.isArray(obj.claims)) score += Math.min(4, obj.claims.length);
    return score;
  }

  function scoreResearchIntent(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return -1;
    var score = 0;
    if (obj.originalQuestion || obj.researchGoal || obj.cleanQuestion) score += 2;
    if (Array.isArray(obj.entities) && obj.entities.length) score += 3;
    if (Array.isArray(obj.facets) && obj.facets.length) score += 4;
    if (Array.isArray(obj.clarifyOptions) && obj.clarifyOptions.length) score += 3;
    if (obj.needsClarify) score += 1;
    if (Array.isArray(obj.searchConcepts) && obj.searchConcepts.length) score += 1;
    return score > 0 ? score : -1;
  }

  /** Parse one outermost JSON object from a string slice. */
  function parseJsonObjectFrom(s, scoreFn) {
    scoreFn = scoreFn || scoreResearchDocument;
    var start = -1;
    var depth = 0;
    var inString = false;
    var escape = false;
    var best = null;
    var bestScore = -1;
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (inString) {
        if (escape) {
          escape = false;
          continue;
        }
        if (ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === '{') {
        if (depth === 0) start = i;
        depth += 1;
        continue;
      }
      if (ch === '}') {
        if (depth <= 0) continue;
        depth -= 1;
        if (depth === 0 && start >= 0) {
          var slice = s.slice(start, i + 1);
          var tryTexts = [slice, repairLooseJsonText(slice)];
          for (var t = 0; t < tryTexts.length; t++) {
            try {
              var parsed = JSON.parse(tryTexts[t]);
              var sc = scoreFn(parsed);
              // Prefer higher-scoring shape; otherwise keep first object.
              if (best == null || sc > bestScore) {
                best = parsed;
                bestScore = sc;
              }
              if (sc >= 4) return parsed;
              break;
            } catch (_) {
              /* try next repair */
            }
          }
          start = -1;
        }
      }
    }
    return best;
  }

  /** Scan for outermost JSON object; ignore braces inside strings/escapes. */
  function extractJsonObject(text, opts) {
    opts = opts || {};
    var scoreFn = opts.preferIntent ? scoreResearchIntent : scoreResearchDocument;
    var raw = stripReasoningEnvelope(String(text || ''));
    var candidates = [];
    // 1) All fenced json/code blocks (greedy per fence).
    var fenceRe = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
    var fm;
    while ((fm = fenceRe.exec(raw))) {
      candidates.push(String(fm[1] || '').trim());
    }
    // 2) Whole text / fence-stripped text / loose-repaired.
    candidates.push(stripCodeFences(raw));
    candidates.push(raw.trim());
    candidates.push(repairLooseJsonText(stripCodeFences(raw)));
    var best = null;
    var bestScore = -1;
    for (var c = 0; c < candidates.length; c++) {
      if (!candidates[c]) continue;
      var parsed = parseJsonObjectFrom(candidates[c], scoreFn);
      if (!parsed) continue;
      var sc = scoreFn(parsed);
      // Also accept generic objects when looking for intent and intent score is flat.
      if (sc < 0 && opts.preferIntent) sc = 0;
      if (best == null || sc > bestScore) {
        best = parsed;
        bestScore = sc;
      }
      if (bestScore >= 4) break;
    }
    return best;
  }

  function sourceIdSet(sources) {
    var set = {};
    (sources || []).forEach(function (s) {
      if (s && s.id) set[String(s.id)] = s;
    });
    return set;
  }

  function filterSourceIds(ids, idSet) {
    var out = [];
    var seen = {};
    (Array.isArray(ids) ? ids : []).forEach(function (id) {
      var k = String(id || '').trim();
      if (!k || seen[k] || !idSet[k]) return;
      seen[k] = true;
      out.push(k);
    });
    return out;
  }

  /** citeValid: id exists, URL ok, and some material (body, snippet, or unavailable record). */
  function isCiteValid(src) {
    if (!src || !src.id) return false;
    if (!src.url || !/^https?:\/\//i.test(String(src.url))) return false;
    var rs = src.readState || '';
    if (rs === 'unavailable') {
      return !!(String(src.snippet || '').trim() || String(src.title || '').trim());
    }
    return !!(
      String(src.text || '').trim() ||
      String(src.snippet || '').trim() ||
      String(src.title || '').trim()
    );
  }

  /**
   * "Has usable evidence material" — not "fact verified".
   * Snippet-grade sources qualify; unavailable does not confirm claims.
   */
  function isEvidenceEligible(src) {
    if (!isCiteValid(src)) return false;
    if (src.readState === 'unavailable') return false;
    if (src.readState === 'snippet') return true;
    if (src.readState === 'fetched' && src.fetchedAt) return true;
    if (src.fetchedAt && String(src.text || '').trim().length > 20) return true;
    return String(src.snippet || src.text || '').trim().length > 0;
  }

  function exportableSources(sources) {
    return (sources || []).map(function (s) {
      return {
        id: s.id,
        title: s.title || '',
        url: s.url || '',
        readState: s.readState || (s.fetchedAt ? 'fetched' : 'snippet'),
        fetchedAt: s.fetchedAt || null,
        provider: s.provider || null,
        facetId: s.facetId || null
      };
    });
  }

  function normalizeClaim(raw, idSet) {
    var text = '';
    var idsIn = [];
    var confidence = 'medium';
    if (typeof raw === 'string') {
      text = raw.trim();
    } else if (raw && typeof raw === 'object') {
      text = String(raw.text || raw.body || '').trim();
      idsIn = raw.sourceIds || raw.sources || [];
      var c = String(raw.confidence || 'medium').toLowerCase();
      if (c === 'high' || c === 'low' || c === 'medium') confidence = c;
    }
    if (!text) return null;
    // Keep cite-valid ids (including snippet). confirmed = has usable evidence, not "fact verified".
    var sourceIds = filterSourceIds(idsIn, idSet).filter(function (id) {
      return isCiteValid(idSet[id]);
    });
    var confirmed = sourceIds.some(function (id) {
      return isEvidenceEligible(idSet[id]);
    });
    if (!confirmed && confidence === 'high') confidence = 'low';
    return {
      text: text,
      sourceIds: sourceIds,
      confirmed: confirmed,
      confidence: confidence,
      // Demote only when there is no cite-valid material at all (not when snippet-only).
      demoted: sourceIds.length === 0
    };
  }

  /**
   * @returns {{ block: object, demotedFacts: string[] }}
   */
  function normalizeBlock(raw, idSet) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var type = String(raw.type || 'paragraph').toLowerCase();
    if (!BLOCK_TYPES[type]) type = 'paragraph';
    var title = String(raw.title || '').trim();
    var demotedFacts = [];
    var block = {
      type: type,
      title: title || undefined,
      body: raw.body != null ? String(raw.body) : undefined,
      items: [],
      columns: Array.isArray(raw.columns)
        ? raw.columns.map(function (c) {
            return String(c == null ? '' : c);
          })
        : undefined,
      rows: Array.isArray(raw.rows)
        ? raw.rows.map(function (row) {
            if (!Array.isArray(row)) return [String(row == null ? '' : row)];
            return row.map(function (c) {
              return String(c == null ? '' : c);
            });
          })
        : undefined,
      sourceIds: filterSourceIds(raw.sourceIds, idSet)
    };

    var itemsIn = Array.isArray(raw.items) ? raw.items : [];
    if (!itemsIn.length && raw.body && (type === 'bullets' || type === 'steps' || type === 'timeline')) {
      itemsIn = String(raw.body)
        .split(/\n+/)
        .map(function (l) {
          return l.replace(/^\s*[-*\d.)]+\s*/, '').trim();
        })
        .filter(Boolean);
    }
    itemsIn.forEach(function (it) {
      if (typeof it === 'string') {
        var claim = normalizeClaim(it, idSet);
        if (!claim) return;
        if (claim.demoted) {
          demotedFacts.push(
            (title ? title + '：' : '') + claim.text + '（缺少有效来源引用）'
          );
          block.items.push({ text: claim.text, sourceIds: [], confirmed: false });
        } else {
          block.items.push({
            text: claim.text,
            sourceIds: claim.sourceIds,
            confirmed: true
          });
        }
        return;
      }
      if (it && typeof it === 'object') {
        if (type === 'faq') {
          block.items.push({
            q: String(it.q || it.question || '').trim(),
            a: String(it.a || it.answer || it.text || '').trim(),
            sourceIds: filterSourceIds(it.sourceIds, idSet)
          });
          return;
        }
        var c2 = normalizeClaim(it, idSet);
        if (!c2) return;
        if (c2.demoted) {
          demotedFacts.push(
            (title ? title + '：' : '') + c2.text + '（缺少有效来源引用）'
          );
        }
        block.items.push({
          text: c2.text,
          sourceIds: c2.sourceIds,
          confirmed: c2.confirmed
        });
      }
    });

    if (type === 'evidence' || type === 'risk' || type === 'bullets' || type === 'steps') {
      if (!block.items.length && block.body) {
        var c3 = normalizeClaim({ text: block.body, sourceIds: block.sourceIds }, idSet);
        if (c3) {
          if (c3.demoted) {
            demotedFacts.push((title ? title + '：' : '') + c3.text + '（缺少有效来源引用）');
          }
          block.items.push({
            text: c3.text,
            sourceIds: c3.sourceIds,
            confirmed: c3.confirmed
          });
          block.body = undefined;
        }
      }
    }

    if (!blockHasContent(block)) {
      // Drop empty template shells (说明/时间线/风险…) — they are noise, not structure.
      return { block: null, demotedFacts: demotedFacts };
    }
    if (!block.title) {
      var defaults = {
        paragraph: '说明',
        bullets: '要点',
        comparison: '对比',
        steps: '步骤',
        timeline: '时间线',
        risk: '风险',
        evidence: '证据',
        quote: '引用',
        faq: '常见问题',
        decision: '决策',
        limitations: '限制'
      };
      block.title = defaults[type] || '内容';
    }
    return { block: block, demotedFacts: demotedFacts };
  }

  function blockHasContent(block) {
    if (!block) return false;
    if (String(block.body || '').trim()) return true;
    if (block.items && block.items.length) {
      return block.items.some(function (it) {
        if (!it) return false;
        if (typeof it === 'string') return !!String(it).trim();
        return !!(String(it.text || '').trim() || String(it.q || '').trim() || String(it.a || '').trim());
      });
    }
    if (block.rows && block.rows.length) return true;
    return false;
  }

  function validateResearchDocument(raw, sources, opts) {
    opts = opts || {};
    var idSet = sourceIdSet(sources);
    var exportSources = exportableSources(sources);
    var hasSources = exportSources.length > 0;
    var uncertainties = [];
    var limitations = [];
    var claims = [];
    var blocks = [];

    if (Array.isArray(raw && raw.uncertainties)) {
      raw.uncertainties.forEach(function (u) {
        var t = typeof u === 'string' ? u : u && u.text;
        if (t) uncertainties.push(String(t));
      });
    }
    if (Array.isArray(raw && raw.limitations)) {
      raw.limitations.forEach(function (u) {
        var t = typeof u === 'string' ? u : u && u.text;
        if (t) limitations.push(String(t));
      });
    }

    var exec = raw && raw.executiveAnswer;
    var execText = '';
    var execIds = [];
    if (typeof exec === 'string') {
      execText = exec.trim();
    } else if (exec && typeof exec === 'object') {
      execText = String(exec.text || '').trim();
      execIds = filterSourceIds(exec.sourceIds, idSet).filter(function (id) {
        return isCiteValid(idSet[id]);
      });
    }
    if (!execText) execText = String((raw && raw.summary) || opts.topic || '').trim() || '（无明确回答）';
    if (exec && exec.sourceIds && filterSourceIds(exec.sourceIds, idSet).length > execIds.length) {
      uncertainties.push('直接回答中部分引用无效（编号或 URL 无法对应材料）。');
    }
    if (
      execIds.some(function (id) {
        return idSet[id] && idSet[id].readState === 'snippet';
      })
    ) {
      uncertainties.push('直接回答引用了搜索摘要线索，尚未核实正文。');
    }

    (Array.isArray(raw && raw.blocks) ? raw.blocks : []).forEach(function (b) {
      var norm = normalizeBlock(b, idSet);
      demotedPush(uncertainties, norm.demotedFacts);
      if (!norm.block || !blockHasContent(norm.block)) return;
      blocks.push(norm.block);
      (norm.block.items || []).forEach(function (it) {
        if (!it || !it.text) return;
        claims.push({
          text: it.text,
          sourceIds: it.sourceIds || [],
          confirmed: !!it.confirmed,
          confidence: it.confirmed ? 'medium' : 'low'
        });
      });
    });

    (Array.isArray(raw && raw.claims) ? raw.claims : []).forEach(function (c) {
      var nc = normalizeClaim(c, idSet);
      if (!nc) return;
      if (nc.demoted) {
        uncertainties.push(nc.text + '（缺少有效来源引用）');
      }
      claims.push({
        text: nc.text,
        sourceIds: nc.sourceIds,
        confirmed: nc.confirmed,
        confidence: nc.confidence
      });
    });

    var confirmedCount = claims.filter(function (c) {
      return c.confirmed;
    }).length;
    if (execIds.length) confirmedCount += 1;

    var status = hasSources
      ? STATUSES.completed_with_sources
      : STATUSES.completed_without_sources;
    var insufficientEvidence = hasSources && confirmedCount === 0;
    var sourceBoundNote = null;
    if (!hasSources) {
      limitations.push('本次无有效网络来源，仅为基于已有材料整理，不是网络调研完成。');
    } else {
      // Bound note stays in metrics — not user-facing boilerplate in limitations.
      sourceBoundNote = '结论仅基于所列来源；未覆盖来源外信息。';
      if (insufficientEvidence) {
        limitations.push(
          '有检索来源但缺乏有效引用证据（insufficient_evidence）：关键结论未关联已阅读正文。'
        );
      }
    }
    limitations = limitations.filter(function (t) {
      return t && !isBoilerplateLimitation(t);
    });

    var title = String((raw && raw.title) || opts.topic || '调研报告').trim() || '调研报告';
    if (/^(标题|报告|调研)$/.test(title)) title = opts.topic || '调研报告';

    return {
      title: title,
      executiveAnswer: { text: execText, sourceIds: execIds },
      blocks: blocks,
      claims: claims,
      sources: exportSources,
      uncertainties: uniqueStrings(uncertainties),
      limitations: uniqueStrings(limitations),
      generatedAt: new Date().toISOString(),
      model: opts.model || '',
      metrics: Object.assign({}, opts.metrics || {}, {
        insufficientEvidence: !!insufficientEvidence,
        documentMode: opts.documentMode || 'structured',
        parseFailureReason: opts.parseFailureReason || null,
        sourceBoundNote: sourceBoundNote
      }),
      status: status,
      queries: opts.queries || []
    };
  }

  function demotedPush(list, facts) {
    (facts || []).forEach(function (f) {
      if (f) list.push(f);
    });
  }

  function uniqueStrings(arr) {
    var out = [];
    var seen = {};
    (arr || []).forEach(function (x) {
      var s = String(x || '').trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    return out;
  }

  function markdownToLegacyDocument(md, sources, opts) {
    opts = opts || {};
    var text = stripPromptEcho(String(md || ''));
    // If a section/body is actually a ResearchDocument JSON, promote it.
    var rescued = extractJsonObject(text);
    if (looksLikeResearchDocument(rescued)) {
      return validateResearchDocument(rescued, sources, {
        topic: opts.topic,
        model: opts.model,
        queries: opts.queries,
        metrics: opts.metrics,
        documentMode: 'structured',
        parseFailureReason: null
      });
    }
    var titled = extractTitle(text, opts.topic || '调研报告');
    var summary = extractSummary(text);
    var sections = parseSectionsFromMarkdown(text);
    var blocks = [];
    // Prefer JSON buried inside a section body (model wrapped doc in ## 正文).
    for (var si = 0; si < sections.length; si++) {
      var bodyJson = extractJsonObject(sections[si].body || '');
      if (looksLikeResearchDocument(bodyJson)) {
        return validateResearchDocument(bodyJson, sources, {
          topic: opts.topic,
          model: opts.model,
          queries: opts.queries,
          metrics: opts.metrics,
          documentMode: 'structured',
          parseFailureReason: null
        });
      }
    }
    if (summary && !/^\s*```/.test(summary) && summary.charAt(0) !== '{') {
      blocks.push({
        type: 'paragraph',
        title: '摘要',
        body: summary,
        items: [],
        sourceIds: []
      });
    }
    sections.forEach(function (sec) {
      var h = String(sec.heading || '');
      var body = String(sec.body || '').trim();
      if (/^(摘要|生成时间|来源|来源列表|调研限制|直接回答)$/.test(h)) return;
      if (isSkeletonHeading(h) && !body) return;
      // Skip fence-only / raw-json stubs — they are not readable prose.
      if (/^```/.test(body) && body.length < 80) return;
      if (body.charAt(0) === '{' && /"executiveAnswer"|"blocks"\s*:/.test(body)) return;
      blocks.push({
        type: 'paragraph',
        title: h || '正文',
        body: body,
        items: [],
        sourceIds: []
      });
    });
    if (!blocks.length) {
      var plain = text
        .replace(/```(?:json|JSON)?[\s\S]*?```/g, '')
        .trim()
        .slice(0, 4000);
      blocks.push({
        type: 'paragraph',
        title: '正文',
        body: plain || '（成稿解析失败，请重试汇总）',
        items: [],
        sourceIds: []
      });
    }
    var execText = summary || titled;
    if (/^\s*```/.test(execText) || execText.charAt(0) === '{') {
      execText = titled || opts.topic || '（见正文）';
    }
    return validateResearchDocument(
      {
        title: titled,
        executiveAnswer: { text: execText, sourceIds: [] },
        blocks: blocks,
        claims: [],
        uncertainties: ['成稿未解析为结构化 ResearchDocument，已降级展示。'],
        limitations: []
      },
      sources,
      {
        topic: opts.topic,
        model: opts.model,
        queries: opts.queries,
        metrics: opts.metrics,
        documentMode: 'legacy_fallback',
        parseFailureReason: opts.parseFailureReason || 'no_json'
      }
    );
  }

  function documentToMarkdown(doc) {
    doc = doc || {};
    var lines = [];
    lines.push('# ' + (doc.title || '调研报告'));
    lines.push('');
    if (doc.executiveAnswer && doc.executiveAnswer.text) {
      lines.push('## 直接回答');
      lines.push(doc.executiveAnswer.text);
      if (doc.executiveAnswer.sourceIds && doc.executiveAnswer.sourceIds.length) {
        lines.push(
          doc.executiveAnswer.sourceIds
            .map(function (id) {
              return '[' + id + ']';
            })
            .join(' ')
        );
      }
      lines.push('');
    }
    (doc.blocks || []).forEach(function (b) {
      if (!b || !blockHasContent(b)) return;
      lines.push('## ' + (b.title || b.type || '内容'));
      if (b.type === 'comparison' && b.columns && b.rows) {
        lines.push('| ' + b.columns.join(' | ') + ' |');
        lines.push(
          '| ' +
            b.columns
              .map(function () {
                return '---';
              })
              .join(' | ') +
            ' |'
        );
        b.rows.forEach(function (row) {
          lines.push('| ' + row.join(' | ') + ' |');
        });
      } else if (b.type === 'quote' && b.body) {
        lines.push('> ' + String(b.body).replace(/\n/g, '\n> '));
      } else if (b.items && b.items.length) {
        b.items.forEach(function (it, idx) {
          if (b.type === 'faq') {
            lines.push('### ' + (it.q || '问'));
            lines.push(it.a || '');
          } else if (b.type === 'steps' || b.type === 'timeline') {
            lines.push(String(idx + 1) + '. ' + (it.text || it));
          } else {
            var cite =
              it.sourceIds && it.sourceIds.length
                ? ' ' +
                  it.sourceIds
                    .map(function (id) {
                      return '[' + id + ']';
                    })
                    .join('')
                : '';
            lines.push('- ' + (it.text || it) + cite);
          }
        });
      } else if (b.body) {
        lines.push(b.body);
      }
      if (b.sourceIds && b.sourceIds.length) {
        lines.push(
          b.sourceIds
            .map(function (id) {
              return '[' + id + ']';
            })
            .join(' ')
        );
      }
      lines.push('');
    });
    var unc = (doc.uncertainties || []).filter(function (u) {
      return u && !isProgrammaticCiteNoise(u);
    });
    if (unc.length) {
      lines.push('## 仍待核实');
      unc.forEach(function (u) {
        lines.push('- ' + u);
      });
      lines.push('');
    }
    var lim = (doc.limitations || []).filter(function (x) {
      return x && !isBoilerplateLimitation(x) && !isProgrammaticCiteNoise(x);
    });
    if (lim.length) {
    lines.push('## 调研限制');
      lim.forEach(function (x) {
      lines.push('- ' + x);
    });
    lines.push('');
    }
    lines.push('## 附录');
    lines.push('');
    lines.push('### 来源列表');
    if (!doc.sources || !doc.sources.length) {
      lines.push('- （无来源）');
    } else {
      doc.sources.forEach(function (s) {
        lines.push(
          '- [' +
            s.id +
            '] ' +
            s.title +
            ' — ' +
            s.url +
            (s.readState ? '（' + s.readState + '）' : '')
        );
      });
    }
    lines.push('');
    var depthNote = (doc.metrics && doc.metrics.depth) || '';
    lines.push(
      '> 生成时间：' +
        (doc.generatedAt || new Date().toISOString()) +
        (depthNote ? ' · 调研深度：' + depthNote : '')
    );
    if (doc.status === STATUSES.completed_without_sources) {
      lines.push('> 状态：基于已有材料整理（无网络来源）');
    } else if (doc.status === STATUSES.completed_with_sources) {
      lines.push(
        doc.metrics && doc.metrics.insufficientEvidence
          ? '> 状态：有来源但证据不足'
          : '> 状态：网络调研完成（含来源）'
      );
    }
    return lines.join('\n');
  }

  function documentToHtml(doc) {
    doc = doc || {};
    var parts = [];
    parts.push('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1"/>');
    parts.push('<title>' + escapeHtml(doc.title || '调研报告') + '</title>');
    parts.push(
      '<style>' +
        ':root{--bg:#f7f8fa;--card:#fff;--ink:#1f2329;--sub:#5a6573;--line:#e6e9ef;--accent:#0b57d0;--warn:#d4380d;--good:#237804}' +
        '*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);line-height:1.7;font-size:15px}' +
        '.wrap{max-width:980px;margin:0 auto;padding:28px 18px 72px}header{border-left:6px solid var(--accent);padding:6px 16px;margin-bottom:10px}' +
        'header h1{margin:0;font-size:24px}.meta{color:var(--sub);font-size:13px;margin-top:6px}' +
        'h2{font-size:18px;margin:28px 0 10px;padding-bottom:6px;border-bottom:2px solid var(--line)}' +
        '.rd-toc{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px;font-size:12px}.rd-toc a{color:var(--accent);text-decoration:none;border:1px solid var(--line);border-radius:999px;padding:4px 10px;background:#fff}' +
        '.rd-card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:10px 0}' +
        '.rd-evidence{border-left:4px solid var(--good)}.rd-risk{border-left:4px solid var(--warn);background:#fff8f3}' +
        '.rd-steps ol{margin:0;padding-left:1.3em}.rd-steps li{margin:6px 0}' +
        '.rd-faq details{border:1px solid var(--line);border-radius:10px;padding:8px 12px;margin:8px 0;background:#fff}' +
        '.rd-faq summary{cursor:pointer;font-weight:700}' +
        'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px;overflow-x:auto;display:block}' +
        'th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{background:#f0f3f7}' +
        '.callout{border-radius:10px;padding:12px 14px;margin:12px 0;background:#eef6ff;border:1px solid #c9ddff}' +
        '.c-warn{background:#fff2e8;border-color:#ffd8bf}.cite{font-weight:700;color:var(--sub);font-size:12px}' +
        'a{color:var(--accent)}.src{font-size:13px;word-break:break-all}footer{color:var(--sub);font-size:12px;margin-top:28px;border-top:1px solid var(--line);padding-top:12px}' +
        '@media(max-width:640px){header h1{font-size:20px}.rd-toc{gap:6px}}' +
        '</style></head><body><div class="wrap">'
    );
    parts.push('<header><h1>' + escapeHtml(doc.title || '调研报告') + '</h1>');
    parts.push(
      '<div class="meta">生成时间：' +
        escapeHtml(doc.generatedAt || '') +
        (doc.model ? ' ｜ 模型：' + escapeHtml(doc.model) : '') +
        ' ｜ 场景：调研</div></header>'
    );

    if (doc.executiveAnswer && doc.executiveAnswer.text) {
      parts.push(
        '<div class="callout" id="rd-answer"><b>直接回答：</b>' +
          mdFragmentToHtml(doc.executiveAnswer.text) +
          citeHtml(doc.executiveAnswer.sourceIds) +
          '</div>'
      );
    }

    var blocks = (doc.blocks || []).filter(blockHasContent);
    if (blocks.length >= 4) {
      parts.push('<nav class="rd-toc" aria-label="目录">');
      blocks.forEach(function (b, i) {
        parts.push(
          '<a href="#rd-b' + i + '">' + escapeHtml(b.title || b.type || '块') + '</a>'
        );
      });
      parts.push('</nav>');
    }

    blocks.forEach(function (b, i) {
      parts.push(renderBlockHtml(b, i));
    });

    var uncHtml = (doc.uncertainties || []).filter(function (u) {
      return u && !isProgrammaticCiteNoise(u);
    });
    if (uncHtml.length) {
      parts.push('<h2 id="rd-unc">仍待核实</h2><div class="rd-card c-warn"><ul>');
      uncHtml.forEach(function (u) {
        parts.push('<li>' + escapeHtml(u) + '</li>');
      });
      parts.push('</ul></div>');
    }

    var limHtml = (doc.limitations || []).filter(function (x) {
      return x && !isBoilerplateLimitation(x) && !isProgrammaticCiteNoise(x);
    });
    if (limHtml.length) {
    parts.push('<h2 id="rd-lim">调研限制</h2><div class="rd-card"><ul>');
      limHtml.forEach(function (x) {
      parts.push('<li>' + escapeHtml(x) + '</li>');
    });
    parts.push('</ul></div>');
    }

    parts.push('<h2 id="rd-src">附录 · 来源</h2><div class="rd-card"><ul class="src">');
    if (!doc.sources || !doc.sources.length) {
      parts.push('<li>（无来源）</li>');
    } else {
      doc.sources.forEach(function (s) {
        parts.push(
          '<li>[' +
            escapeHtml(s.id) +
            '] <a href="' +
            escapeHtml(s.url) +
            '" rel="noreferrer">' +
            escapeHtml(s.title || s.url) +
            '</a>' +
            (s.readState ? ' <span class="cite">(' + escapeHtml(s.readState) + ')</span>' : '') +
            '</li>'
        );
      });
    }
    parts.push('</ul></div>');

    var statusLine =
      doc.status === STATUSES.completed_without_sources
        ? '状态：基于已有材料整理（无网络来源）'
        : doc.status === STATUSES.completed_with_sources
          ? doc.metrics && doc.metrics.insufficientEvidence
            ? '状态：有来源但证据不足'
            : '状态：网络调研完成（含来源）'
          : '';
    var depthMeta = (doc.metrics && doc.metrics.depth) || '';
    parts.push(
      '<footer>' +
        (statusLine ? escapeHtml(statusLine) + ' · ' : '') +
        '生成时间：' +
        escapeHtml(doc.generatedAt || '') +
        (depthMeta ? ' · 调研深度：' + escapeHtml(String(depthMeta)) : '') +
        (doc.metrics && doc.metrics.documentMode
          ? ' · mode=' + escapeHtml(doc.metrics.documentMode)
          : '') +
        '</footer></div></body></html>'
    );
    return parts.join('');
  }

  function citeHtml(ids) {
    if (!ids || !ids.length) return '';
    return (
      ' ' +
      ids
        .map(function (id) {
          return '<span class="cite">[' + escapeHtml(id) + ']</span>';
        })
        .join('')
    );
  }

  function renderBlockHtml(b, index) {
    if (!b) return '';
    var id = 'rd-b' + index;
    var title = escapeHtml(b.title || b.type || '内容');
    var cls = 'rd-card rd-' + escapeHtml(b.type || 'paragraph');
    var head = '<h2 id="' + id + '">' + title + '</h2><div class="' + cls + '">';
    var tail = '</div>';
    if (b.type === 'comparison' && b.columns && b.rows) {
      var html = head + '<table><thead><tr>';
      b.columns.forEach(function (c) {
        html += '<th>' + escapeHtml(c) + '</th>';
      });
      html += '</tr></thead><tbody>';
      b.rows.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (c) {
          html += '<td>' + mdFragmentToHtml(c) + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table>' + citeHtml(b.sourceIds) + tail;
      return html;
    }
    if (b.type === 'faq' && b.items && b.items.length) {
      var faq = head + '<div class="rd-faq">';
      b.items.forEach(function (it) {
        faq +=
          '<details><summary>' +
          escapeHtml(it.q || '问题') +
          '</summary><div>' +
          mdFragmentToHtml(it.a || '') +
          citeHtml(it.sourceIds) +
          '</div></details>';
      });
      return faq + tail;
    }
    if (b.type === 'steps' || b.type === 'timeline') {
      var ol = head + '<div class="rd-steps"><ol>';
      (b.items || []).forEach(function (it) {
        ol +=
          '<li>' +
          mdFragmentToHtml(it.text || it) +
          citeHtml(it.sourceIds) +
          '</li>';
      });
      return ol + '</ol></div>' + citeHtml(b.sourceIds) + tail;
    }
    if (b.type === 'quote') {
      return (
        head +
        '<blockquote>' +
        mdFragmentToHtml(b.body || '') +
        '</blockquote>' +
        citeHtml(b.sourceIds) +
        tail
      );
    }
    if (b.type === 'decision' && b.columns && b.rows) {
      return renderBlockHtml(
        Object.assign({}, b, { type: 'comparison' }),
        index
      );
    }
    if (b.items && b.items.length) {
      var ul = head + '<ul>';
      b.items.forEach(function (it) {
        ul +=
          '<li>' +
          mdFragmentToHtml(it.text || it) +
          citeHtml(it.sourceIds) +
          '</li>';
      });
      return ul + '</ul>' + citeHtml(b.sourceIds) + tail;
    }
    return head + mdFragmentToHtml(b.body || '') + citeHtml(b.sourceIds) + tail;
  }

  function looksLikeCompareTopic(topic) {
    return /(?:和|与|还是|或|vs\.?|VS|对比|比较|哪个|深度研究)/i.test(String(topic || ''));
  }

  function looksLikeHowtoTopic(topic) {
    return /(?:怎么办|材料|步骤|流程|办理|如何)/.test(String(topic || ''));
  }

  function looksLikeRiskTopic(topic) {
    return /(?:风险|适合|隐私|适不适合)/.test(String(topic || ''));
  }

  function sourceHasUsableBody(s) {
    return !!(s && String(s.text || '').trim().length > 80 && s.fetchedAt);
  }

  function buildSynthesisSystemPrompt(sources, topic, queries) {
    var lines = [
      '你是调研分析主笔。诚实且大胆：大胆组织已抓材料写清理解框架；诚实——无来源支撑的事实不得编造。',
      '主题：' + String(topic || ''),
      '检索词：' + ((queries && queries.join('、')) || topic || ''),
      '只输出一个 JSON 对象（可包在 ```json 代码块中），不要输出完整 HTML 页面，不要输出脚本。',
      'JSON 字段：title, executiveAnswer:{text,sourceIds}, blocks:[], claims:[], uncertainties:[], limitations:[]。',
      'blocks[].type 只能是：paragraph|bullets|comparison|steps|timeline|risk|evidence|quote|faq|decision|limitations。',
      '优先组织：问题拆解/核心机制 → 证据与分歧（evidence/comparison，含国内外对照若主题需要）→ 行动或理解框架（decision/steps）→ 可选「下一步补抓」（短 bullets，不是免责声明）。',
      'executiveAnswer（直接回答）硬性要求：必须是干货先行——用 3～6 句压入来源里已有的具体事实（是什么、谁做的、关键能力/机制、国内外差异若材料有）；每句尽量带 sourceIds。禁止把直接回答写成材料边界说明、禁止「目前来源均为搜索摘要」「因此无法确认…」占一半篇幅；材料边界最多一句括号附注，或留给 limitations。',
      '主题忠实：不得把报告改写成来源碰巧命中的旁支产品（例如用户问产品对比，却写成 Diffchecker/文本比对工具说明书）。若来源与用户主实体无关，直接回答只说明检索未命中目标主题，并指出应补抓什么；禁止展开旁支产品细节当正文。',
      '对比题：若材料已覆盖至少一方，直接回答仍须尽量用已有事实回答「怎么比/差异在哪」的框架（按材料里已有的维度），把缺侧写成下一步补抓；禁止整篇停在「无法对比」缺口说明。',
      '对比题硬性：必须输出非空 comparison 块（表格）。一方有材料时用已有维度填列（题材/设定/阵容/口碑等材料里出现的轴），缺侧单元格写「材料未覆盖」；另用 bullets「下一步补抓」列出可执行检索（如缺侧百科、双方区别/横评），禁止空表或只有标题。',
      '其他硬性要求：关键事实 sourceIds 只能使用给定编号；不得编造/捏造 URL/数字/国内落地/合规断言；不要输出 sources 列表（由程序附加）。',
      '禁止成稿三板斧套话：不得把报告写成「无法直接回答 + 仍待核实清单 + 调研限制」；有材料就先写材料能支撑的理解。',
      'uncertainties / limitations 只写与具体来源缺口绑定的实质问题；禁止「结论仅基于所列来源」「未覆盖来源外信息」「仅供参考」「初步线索整理」等空泛限制。',
      '只输出有实质内容的 blocks；禁止空的 说明/引用/时间线/风险/限制 等骨架标题；没有内容就不要该块。',
      'title 用具体报告标题，禁止写成「标题」；claims 可用 confidence: high|medium|low；不要假装 confirmed（程序会校验）。'
    ];
    if (looksLikeCompareTopic(topic)) {
      lines.push('本题倾向至少包含一个 comparison 块（表格）。');
    }
    if (looksLikeHowtoTopic(topic)) {
      lines.push('本题倾向至少包含一个 steps 块。');
    }
    if (looksLikeRiskTopic(topic)) {
      lines.push('本题倾向至少包含一个 risk 块。');
    }
    if (!sources || !sources.length) {
      lines.push(
        '注意：当前没有可用网络来源。请用「已有材料整理」口吻，明确未做网络检索，不得声称已完成网络调研。'
      );
    } else {
      lines.push('来源材料（仅可引用下列编号）：');
      if (sources.some(function (s) {
        return s && s.noiseSuspect;
      })) {
        lines.push(
          '部分来源可能偏促销/门户噪声（noiseSuspect）；优先用与主题主实体相关的材料，可忽略明显跑题页。'
        );
      }
      sources.forEach(function (s) {
        lines.push(
          '[' +
            s.id +
            '] ' +
            s.title +
            '\nURL: ' +
            s.url +
            '\nreadState: ' +
            (s.readState || (s.fetchedAt ? 'fetched' : 'snippet')) +
            (s.noiseSuspect ? '\nnoiseSuspect: true' : '') +
            '\n摘录: ' +
            String(s.text || s.snippet || '').slice(0, 5000)
        );
      });
    }
    return lines.join('\n');
  }

  function searchMany(queries, maxSources, intent) {
    var all = [];
    var qlist = (queries || []).filter(Boolean);
    if (!qlist.length) return Promise.resolve({ hits: [], funnel: { rawHits: 0, relevantHits: 0, pickedHits: 0 } });
    var per = Math.max(3, Math.ceil(maxSources / Math.min(qlist.length, 4)) + 1);
    var chain = Promise.resolve();
    var lastErr = null;
    qlist.forEach(function (q, i) {
      chain = chain.then(function () {
        if (cancelFlag) return;
        state.progress.message =
          '搜索 ' + (i + 1) + '/' + qlist.length + '：' + String(q).slice(0, 40);
        emit();
        return searchWeb(q, per)
          .then(function (hits) {
            mergeHitsByUrl(all, hits || []);
            state.progress.sourcesFound = Math.min(all.length, maxSources);
            traceEvent('search', {
              query: String(q).slice(0, 80),
              hits: (hits || []).length,
              provider: (state.metrics && state.metrics.searchProvider) || 'auto'
            });
            emit();
            return yieldUi();
          })
          .catch(function (e) {
            lastErr = e;
            state.progress.message =
              '搜索失败（' +
              String(q).slice(0, 24) +
              '）：' +
              String((e && e.message) || e);
            emit();
            return yieldUi();
          });
      });
    });
    return chain.then(function () {
      if (!all.length && lastErr) throw lastErr;
      var ranked;
      var formalModel = isFormalModelIntent(intent);
      if (
        intent &&
        (intent.status === 'ready' ||
          formalModel ||
          (intent.entities && intent.entities.length) ||
          (intent.searchConcepts && intent.searchConcepts.length))
      ) {
        ranked = rankHitsForIntent(all, intent, null, {
          // Aliases alone no longer force wipe — only when caller asks AND
          // formal model path is off (local diagnostic strictness).
          strictAliases:
            !formalModel &&
            (intent.entities || []).some(function (e) {
              return e && e.aliases && e.aliases.length;
            }),
          formalModel: !!formalModel
        });
      } else if (formalModel) {
        // Formal path: never hard-gate SERP via topic anchors.
        ranked = {
          hits: all.slice(),
          rawHits: all.length,
          relevantHits: all.length,
          dropReasons: {},
          tokens: { soft: [], strict: [] }
        };
      } else {
        var topicBlob = qlist.join(' ');
        var anchorInfo = extractTopicAnchors(topicBlob);
        var filtered = filterHitsByAnchors(all, anchorInfo);
        ranked = {
          hits: filtered,
          rawHits: all.length,
          relevantHits: filtered.length,
          dropReasons: {},
          tokens: { soft: anchorInfo.anchors || [], strict: anchorInfo.aliases || [] }
        };
      }
      bumpFunnel('rawHits', ranked.rawHits);
      bumpFunnel('relevantHits', ranked.relevantHits);
      var tokList = (ranked.tokens && ranked.tokens.soft) || [];
      // Formal model pick owns URL set later — soft balance only for local / fast paths.
      var picked = formalModel
        ? ranked.hits.slice(0, maxSources)
        : selectBalancedHits(ranked.hits, maxSources, tokList);
      bumpFunnel('pickedHits', picked.length);
      traceEvent('filter', {
        rawHits: ranked.rawHits,
        relevantHits: ranked.relevantHits,
        pickedHits: picked.length,
        dropReasons: ranked.dropReasons || {},
        failOpen: !!ranked.failOpen,
        formalModel: !!formalModel
      });
      return picked;
    });
  }

  function parseSectionsFromMarkdown(md) {
    var text = String(md || '');
    var sections = [];
    var re = /^##\s+(.+)\n([\s\S]*?)(?=^##\s+|$)/gm;
    var m;
    while ((m = re.exec(text))) {
      sections.push({ heading: String(m[1] || '').trim(), body: String(m[2] || '').trim() });
    }
    if (!sections.length && text.trim()) {
      sections.push({ heading: '正文', body: text.trim() });
    }
    return sections;
  }

  function extractSummary(md) {
    var m = String(md || '').match(/^##\s*摘要\s*\n+([\s\S]*?)(?=\n##\s|$)/m);
    if (m) return String(m[1] || '').trim();
    var first = String(md || '')
      .split(/\n/)
      .map(function (l) {
        return l.trim();
      })
      .filter(Boolean)
      .find(function (l) {
        return !/^#/.test(l);
      });
    return first ? first.slice(0, 280) : '';
  }

  function extractTitle(md, fallback) {
    var m = String(md || '').match(/^#\s+(.+)$/m);
    return (m && m[1] ? String(m[1]).trim() : '') || fallback || '调研报告';
  }

  function markUsedSources(sources, md) {
    var body = String(md || '');
    return (sources || []).map(function (s) {
      var id = s.id;
      var used = body.indexOf('[' + id + ']') >= 0 || body.indexOf(s.url) >= 0;
      return Object.assign({}, s, {
        usedInSections: used ? ['body'] : []
      });
    });
  }

  function isSkeletonHeading(h) {
    return /^(标题|摘要|正文|小节\d*|结论|来源|来源列表|调研限制|生成时间|说明|引用|时间线|风险|限制|要点|证据|对比|步骤|决策|常见问题|内容)$/.test(
      String(h || '').trim()
    );
  }

  function looksLikeSkeletonReport(result) {
    var secs = (result && result.sections) || [];
    if (!secs.length) return !String((result && result.summary) || '').trim();
    var withBody = 0;
    var skeletonHeads = 0;
    secs.forEach(function (s) {
      if (isSkeletonHeading(s.heading)) skeletonHeads += 1;
      if (String(s.body || '').trim().length > 40) withBody += 1;
    });
    return withBody === 0 || skeletonHeads >= Math.max(2, secs.length - 1);
  }

  function renderMarkdown(result) {
    result = result || emptyResult();
    if (result.document) {
      return documentToMarkdown(result.document);
    }
    var raw = String(result.rawMarkdown || '').trim();
    if (raw && !looksLikeSkeletonReport(result)) {
      return raw;
    }
    if (raw && looksLikeSkeletonReport(result) && raw.length > 120) {
      // Prefer model text over reconstructed skeleton headings.
      return raw;
    }
    var lines = [];
    lines.push('# ' + (result.title || '调研报告'));
    lines.push('');
    lines.push('## 摘要');
    lines.push(result.summary || '（无）');
    lines.push('');
    if (result.sections && result.sections.length) {
      result.sections.forEach(function (sec) {
        if (/^(摘要|结论|来源|来源列表|调研限制|生成时间)$/.test(String(sec.heading || '')))
          return;
        if (isSkeletonHeading(sec.heading) && !String(sec.body || '').trim()) return;
        lines.push('## ' + (sec.heading || '正文'));
        lines.push(sec.body || '');
        lines.push('');
      });
    }
    var conclusion = (result.sections || []).find(function (s) {
      return /^结论/.test(String(s.heading || ''));
    });
    lines.push('## 结论');
    lines.push((conclusion && conclusion.body) || result.summary || '（无）');
    lines.push('');
    lines.push('## 生成时间');
    lines.push(result.generatedAt || new Date().toISOString());
    lines.push('');
    lines.push('## 调研限制');
    var lim =
      result.limitations && result.limitations.length
        ? result.limitations
        : result.status === STATUSES.completed_without_sources
          ? ['本次无有效网络来源，仅为基于已有材料整理，不是网络调研完成。']
          : ['结论仅基于所列来源；未覆盖来源外信息。'];
    lim.forEach(function (x) {
      lines.push('- ' + x);
    });
    lines.push('');
    lines.push('## 来源列表');
    if (!result.sources || !result.sources.length) {
      lines.push('- （无来源）');
    } else {
      result.sources.forEach(function (s) {
        lines.push('- [' + s.id + '] ' + s.title + ' — ' + s.url);
      });
    }
    lines.push('');
    if (result.status === STATUSES.completed_without_sources) {
      lines.push('> 状态：基于已有材料整理（无网络来源）');
    } else if (result.status === STATUSES.completed_with_sources) {
      lines.push('> 状态：网络调研完成（含来源）');
    }
    return lines.join('\n');
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Strip raw HTML so model tags never become real elements. */
  function neutralizeRawHtml(s) {
    return String(s == null ? '' : s)
      .replace(/<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
      .replace(/<\s*style[\s\S]*?>[\s\S]*?<\s*\/\s*style\s*>/gi, '')
      .replace(/<\s*iframe[\s\S]*?>[\s\S]*?<\s*\/\s*iframe\s*>/gi, '')
      .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  }

  /** Markdown fragment → HTML; only program-emitted tags (safe subset). */
  function mdFragmentToHtml(src) {
    var text = neutralizeRawHtml(String(src || '').trim());
    if (!text) return '';
    var lines = text.split(/\r?\n/);
    var out = [];
    var i = 0;
    var inList = false;
    function closeList() {
      if (inList) {
        out.push('</ul>');
        inList = false;
      }
    }
    function flushTable(start) {
      var rows = [];
      var j = start;
      while (j < lines.length && /^\s*\|/.test(lines[j])) {
        var row = lines[j];
        j += 1;
        if (/^\s*\|?\s*:?-{3,}/.test(row)) continue;
        rows.push(
          row
            .replace(/^\s*\|/, '')
            .replace(/\|\s*$/, '')
            .split('|')
            .map(function (c) {
              return String(c || '').trim();
            })
        );
      }
      if (!rows.length) return start;
      out.push('<table>');
      rows.forEach(function (cells, ri) {
        out.push('<tr>');
        cells.forEach(function (c, ci) {
          var tag = ri === 0 ? 'th' : 'td';
          var cls = ri > 0 && ci === 0 ? ' class="k"' : '';
          out.push('<' + tag + cls + '>' + inlineMd(c) + '</' + tag + '>');
        });
        out.push('</tr>');
      });
      out.push('</table>');
      return j;
    }
    function inlineMd(s) {
      // Escape first — never rehydrate raw HTML from model text.
      return escapeHtml(neutralizeRawHtml(s))
        .replace(
          /\[([^\]]+)\]\((https?:[^)\s]+)\)/g,
          '<a href="$2" rel="noreferrer">$1</a>'
        )
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\[(S\d+)\]/g, '<span class="cite">[$1]</span>');
    }
    while (i < lines.length) {
      var raw = lines[i];
      if (/^\s*\|/.test(raw)) {
        closeList();
        i = flushTable(i);
        continue;
      }
      var quote = raw.match(/^\s*>\s?(.*)$/);
      if (quote) {
        closeList();
        var qbuf = [quote[1]];
        i += 1;
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          qbuf.push(lines[i].replace(/^\s*>\s?/, ''));
          i += 1;
        }
        out.push('<div class="callout c-info">' + inlineMd(qbuf.join(' ')) + '</div>');
        continue;
      }
      var bullet = raw.match(/^\s*[-*•]\s+(.*)$/);
      if (bullet) {
        if (!inList) {
          out.push('<ul>');
          inList = true;
        }
        out.push('<li>' + inlineMd(bullet[1]) + '</li>');
        i += 1;
        continue;
      }
      closeList();
      if (!String(raw || '').trim()) {
        i += 1;
        continue;
      }
      var h3 = raw.match(/^\s*###\s+(.*)$/);
      if (h3) {
        out.push('<h3>' + inlineMd(h3[1]) + '</h3>');
        i += 1;
        continue;
      }
      out.push('<p>' + inlineMd(raw) + '</p>');
      i += 1;
    }
    closeList();
    return out.join('');
  }

  function renderHtml(result) {
    var r = result || emptyResult();
    if (r.document) {
      return documentToHtml(r.document);
    }
    // Legacy path: section-based HTML (kept for pre-document results).
    var md = renderMarkdown(r);
    var parts = [];
    parts.push('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1"/>');
    parts.push('<title>' + escapeHtml(r.title || '调研报告') + '</title>');
    parts.push(
      '<style>' +
        'body{margin:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#f7f8fa;color:#1f2329;line-height:1.7;font-size:15px}' +
        '.wrap{max-width:980px;margin:0 auto;padding:28px 18px 72px}.card{background:#fff;border:1px solid #e6e9ef;border-radius:12px;padding:16px;margin:12px 0}' +
        'table{width:100%;border-collapse:collapse}th,td{border:1px solid #e6e9ef;padding:8px}.callout{background:#eef6ff;padding:12px;border-radius:10px;margin:12px 0}' +
        '.cite{font-weight:700;color:#5a6573;font-size:12px}a{color:#0b57d0}footer{color:#5a6573;font-size:12px;margin-top:28px;border-top:1px solid #e6e9ef;padding-top:12px}' +
        '</style></head><body><div class="wrap">'
    );
    parts.push('<header><h1>' + escapeHtml(r.title || '调研报告') + '</h1></header>');
    if (r.summary) {
      parts.push(
        '<div class="callout"><b>核心结论：</b>' + mdFragmentToHtml(r.summary) + '</div>'
      );
    }
    (r.sections || []).forEach(function (sec) {
      var h = String(sec.heading || '');
      if (/^(摘要|生成时间|来源|来源列表)$/.test(h)) return;
      if (isSkeletonHeading(h) && !String(sec.body || '').trim()) return;
      parts.push(
        '<h2>' +
          escapeHtml(h || '正文') +
          '</h2><div class="card">' +
          mdFragmentToHtml(sec.body || '') +
          '</div>'
      );
    });
    parts.push('<h2>调研限制</h2><div class="card"><ul>');
    (r.limitations && r.limitations.length
      ? r.limitations
      : ['结论仅基于所列来源。']
    ).forEach(function (x) {
      parts.push('<li>' + escapeHtml(x) + '</li>');
    });
    parts.push('</ul></div><h2>来源列表</h2><div class="card"><ul>');
    (r.sources || []).forEach(function (s) {
      parts.push(
        '<li>[' +
          escapeHtml(s.id) +
          '] <a href="' +
          escapeHtml(s.url) +
          '" rel="noreferrer">' +
          escapeHtml(s.title) +
          '</a></li>'
      );
    });
    parts.push(
      '</ul></div><footer>md-length:' +
        String(md.length) +
        '</footer></div></body></html>'
    );
    return parts.join('');
  }

  function statusLabel(status) {
    switch (status) {
      case STATUSES.configuring:
        return '配置调研';
      case STATUSES.awaiting_approval:
        return '确认调查计划';
      case STATUSES.searching:
        return '正在搜索';
      case STATUSES.fetching:
        return '正在抓取网页';
      case STATUSES.briefing:
        return '正在写调查面简报';
      case STATUSES.reviewing:
        return '正在审查简报';
      case STATUSES.synthesizing:
        return '正在综合整理';
      case STATUSES.completed_with_sources:
        return '网络调研完成';
      case STATUSES.completed_without_sources:
        return '基于已有材料整理';
      case STATUSES.failed:
        return '调研失败';
      default:
        return '空闲';
    }
  }

  /** Map gateway/chat failures — do not crush auth/network into "请先登录". */
  function classifyModelFailure(err) {
    var code = String((err && err.code) || '').toLowerCase();
    var msg = String((err && err.message) || err || '').toLowerCase();
    if (code === 'budget_capped' || /budget/.test(msg)) {
      return {
        code: 'budget_capped',
        message:
          '本轮模型调用次数已用尽（' + String((err && err.message) || 'budget_model') + '）'
      };
    }
    if (
      code === 'no_llm' ||
      code === 'no_account' ||
      code === 'no_model' ||
      /no_account|no_model|no_llm/.test(msg)
    ) {
      return {
        code: 'no_llm',
        message: '没有可用大模型：请先登录 WorkBuddy 或配置 Soft Pad 密钥'
      };
    }
    if (code === 'auth_failed' || /auth|401|403|unauthor|token/.test(msg)) {
      return {
        code: 'auth_failed',
        message: '模型鉴权失败：' + String((err && err.message) || err || 'auth_failed')
      };
    }
    if (code === 'rate_limited' || /429|rate/.test(msg)) {
      return {
        code: 'rate_limited',
        message: '模型限流：' + String((err && err.message) || err || 'rate_limited')
      };
    }
    if (code === 'timeout' || /timeout|timed/.test(msg)) {
      return {
        code: 'timeout',
        message: '模型超时：' + String((err && err.message) || err || 'timeout')
      };
    }
    if (code === 'network_error' || /network|offline|fetch failed|econn/.test(msg)) {
      return {
        code: 'network_error',
        message: '模型网络失败：' + String((err && err.message) || err || 'network_error')
      };
    }
    return {
      code: code || 'model_error',
      message: '模型调用失败：' + String((err && err.message) || err || 'model_error')
    };
  }

  function nextStepHint(error) {
    if (!error) return '';
    var code = String(error.code || '');
    var pid = String(
      (error && error.providerId) ||
        (state.metrics && state.metrics.providerId) ||
        ''
    ).toLowerCase();
    var gw = global.OneToneModelGateway;
    if (!pid && gw && gw.resolveProvider) {
      try {
        pid = String((gw.resolveProvider('synthesis') || {}).id || '').toLowerCase();
      } catch (_) {}
    }
    var viaWb = pid === 'workbuddy' || pid.indexOf('workbuddy') >= 0;
    if (code === 'no_llm') return '请先登录 WorkBuddy 或配置 Soft Pad 密钥后再试。';
    if (code === 'auth_failed')
      return viaWb
        ? 'WorkBuddy 鉴权失败——可点「测通」或重新登录后再试。'
        : '账号已登录但鉴权失败——可点「测通」或重新登录 WorkBuddy，或换 Soft Pad 密钥。';
    if (code === 'network_error') return '模型网络不通。请检查网络后点「重新调研」。';
    if (code === 'model_error')
      return viaWb
        ? 'WorkBuddy 已选但调用失败。可换模型、点「测通」，或检查 WorkBuddy 登录后再试。'
        : '模型已选但调用失败。可换模型、点「测通」，或检查 Soft Pad 密钥后再试。';
    if (code === 'search_unavailable' || code === 'rate_limited')
      return '搜索暂不可用。可稍后重试，或仅做「已有材料整理」。';
    if (code === 'fetch_all_failed') return '网页均抓取失败。可换主题或稍后重试。';
    if (code === 'timeout') return '请求超时。请检查网络后重新调研。';
    if (code === 'cancelled') return '已取消。可再次打开调研配置。';
    if (code === 'export_failed') return '报告已生成，但导出失败。可复制 Markdown 手动保存。';
    if (code === 'empty_topic') return '先在下方输入框写调研主题，再点开始。';
    if (code === 'no_sources') {
      var msg = String(error.message || '');
      if (/摘要/.test(msg)) return '仅获得搜索摘要或正文读取失败。可换主题或稍后重试。';
      if (/未找到相关|无相关/.test(msg)) return '未找到相关结果。可换更具体的主题后重试。';
      return '未取得网络来源。请检查网络后点「重新调研」，或换更具体的主题。';
    }
    if (code === 'budget_capped')
      return '已达调用预算上限。可降低深度或缩小主题后重试。';
    return error.message || '请检查网络与模型配置后重试。';
  }

  function chatOnce(messages, opts) {
    opts = opts || {};
    var gateway = global.OneToneModelGateway;
    if (gateway && typeof gateway.configure === 'function') {
      gateway.configure({
        invoke: invokeArgs,
        resolveWorkbuddy: resolveWbLlm
      });
    }
    // Planning/clarify before run may skip controller; prefer controller model_chat when live.
    var controllerLive =
      state.controller &&
      typeof state.controller.executeAction === 'function' &&
      !opts.skipController &&
      state.controller.snapshot &&
      state.controller.snapshot().status === 'running';
    if (controllerLive) {
      return runControllerAction(
        'model_chat',
        {
          messages: messages,
          purpose: opts.purpose || 'synthesis',
          providerId: opts.providerId,
          model: opts.model,
          maxTokens: opts.maxTokens || 4096,
          responseFormat: opts.responseFormat || 'text'
        },
        opts.taskId || state.activeTaskId
      ).then(function (res) {
        syncActionsFromController();
        if (state.metrics) {
          state.metrics.modelCalls = (state.ledger && state.ledger.modelCalls) || 0;
          state.metrics.model = (res && res.model) || state.metrics.model || '';
          state.metrics.providerId = (res && res.providerId) || '';
          state.metrics.lastModelPurpose = opts.purpose || 'synthesis';
        }
        traceEvent('model_call', {
          purpose: opts.purpose || 'synthesis',
          providerId: (res && res.providerId) || '',
          model: (res && res.model) || '',
          fallbackFrom: (res && res.fallbackFrom) || null,
          durationMs: (res && res.durationMs) || 0,
          status: 'ok'
        });
        return {
          text: String((res && res.text) || '').trim(),
          model: (res && res.model) || '',
          providerId: (res && res.providerId) || '',
          routeProviderId: (res && res.routeProviderId) || null,
          backendProviderId: (res && res.backendProviderId) || null,
          fallbackFrom: (res && res.fallbackFrom) || null,
          durationMs: (res && res.durationMs) || 0,
          usage: res && res.usage,
          finishReason: res && res.finishReason,
          actionId: (res && res.actionId) || null
        };
      }).catch(function (err) {
        traceEvent('model_call', {
          purpose: opts.purpose || 'synthesis',
          providerId: (err && err.providerId) || opts.providerId || '',
          model: opts.model || '',
          durationMs: (err && err.durationMs) || 0,
          status: 'error',
          errorCode: (err && err.code) || 'model_error',
          actionId: (err && err.actionId) || null
        });
        throw err;
      });
    }
    if (state.ledger && !opts.skipLedger) {
      if (!ledgerSpend('model', 1)) {
        var errB = new Error('budget_model');
        errB.code = 'budget_capped';
        return Promise.reject(errB);
      }
    }
    if (!gateway || typeof gateway.chat !== 'function') {
      var missing = new Error('model_gateway_unavailable');
      missing.code = 'model_gateway_unavailable';
      return Promise.reject(missing);
    }
    return gateway
      .chat({
        providerId: opts.providerId,
        purpose: opts.purpose || 'synthesis',
        model: opts.model,
        messages: messages,
        maxTokens: opts.maxTokens || 4096,
        responseFormat: opts.responseFormat || 'text',
        signal: opts.signal
      })
      .then(function (res) {
        traceEvent('model_call', {
          purpose: opts.purpose || 'synthesis',
          providerId: res.providerId || '',
          model: res.model || '',
          fallbackFrom: res.fallbackFrom || null,
          durationMs: res.durationMs || 0,
          status: 'ok'
        });
        if (state.metrics) {
          state.metrics.modelCalls = (state.ledger && state.ledger.modelCalls) || 0;
          state.metrics.model = res.model || state.metrics.model || '';
          state.metrics.providerId = res.providerId || '';
          state.metrics.lastModelPurpose = opts.purpose || 'synthesis';
        }
        return {
          text: String((res && res.text) || '').trim(),
          model: (res && res.model) || '',
          providerId: (res && res.providerId) || '',
          routeProviderId: (res && res.routeProviderId) || null,
          backendProviderId: (res && res.backendProviderId) || null,
          fallbackFrom: (res && res.fallbackFrom) || null,
          durationMs: (res && res.durationMs) || 0,
          usage: res && res.usage,
          finishReason: res && res.finishReason
        };
      })
      .catch(function (err) {
        traceEvent('model_call', {
          purpose: opts.purpose || 'synthesis',
          providerId: (err && err.providerId) || opts.providerId || '',
          model: opts.model || '',
          durationMs: (err && err.durationMs) || 0,
          status: 'error',
          errorCode: (err && err.code) || 'model_error'
        });
        throw err;
      });
  }

  /**
   * Controller-tracked model retry: prefer retryAction(actionId); else one gateway fallback.
   * Formal brief/synth use this instead of skipController retries.
   */
  function chatOnceWithRetry(messages, opts) {
    opts = opts || {};
    return chatOnce(messages, opts).catch(function (err) {
      var actionId = err && err.actionId;
      if (
        actionId &&
        state.controller &&
        typeof state.controller.retryAction === 'function' &&
        !opts.skipRetry
      ) {
        ensureControllerInvoke();
        return Promise.resolve(state.controller.retryAction(actionId))
          .then(function (res) {
            if (res && typeof res.then === 'function') return res;
            return res;
          })
          .then(function (out) {
            syncActionsFromController();
            if (!out || !out.ok) {
              var e2 = new Error((out && out.code) || (err && err.message) || 'retry_failed');
              e2.code = (out && out.code) || (err && err.code) || 'retry_failed';
              e2.actionId = (out && out.actionId) || actionId;
              throw e2;
            }
            var r = out.result || {};
            if (state.metrics) {
              state.metrics.modelCalls = (state.ledger && state.ledger.modelCalls) || 0;
              state.metrics.model = (r && r.model) || state.metrics.model || '';
              state.metrics.providerId = (r && r.providerId) || '';
              state.metrics.lastModelPurpose = opts.purpose || 'synthesis';
            }
            traceEvent('model_call', {
              purpose: opts.purpose || 'synthesis',
              providerId: (r && r.providerId) || '',
              model: (r && r.model) || '',
              status: 'ok',
              retry: true,
              actionId: out.actionId || actionId
            });
            return {
              text: String((r && r.text) != null ? r.text : typeof r === 'string' ? r : '').trim(),
              model: (r && r.model) || '',
              providerId: (r && r.providerId) || '',
              routeProviderId: (r && r.routeProviderId) || null,
              backendProviderId: (r && r.backendProviderId) || null,
              fallbackFrom: (r && r.fallbackFrom) || null,
              durationMs: (r && r.durationMs) || 0,
              usage: r && r.usage,
              finishReason: r && r.finishReason,
              actionId: out.actionId || actionId,
              retried: true
            };
          });
      }
      // No controller action to retry — one gateway attempt only.
      if (!opts._retriedGateway && !opts.skipController) {
        return chatOnce(
          messages,
          Object.assign({}, opts, {
            skipController: true,
            skipLedger: !!opts.skipLedger,
            _retriedGateway: true
          })
        );
      }
      throw err;
    });
  }

  function formatSearchDiagnostics(diag) {
    if (!Array.isArray(diag) || !diag.length) return '';
    return diag
      .map(function (d) {
        var name = (d && d.provider) || '?';
        if (d && d.ok && d.hits > 0) return name + ':' + d.hits;
        var e = (d && d.error) || 'empty';
        return name + '(' + e + ')';
      })
      .join(' · ');
  }

  function searchWeb(query, limit) {
    return runControllerAction(
      'web_search',
      {
        query: normalizeResearchQuery(query),
        limit: limit || 6,
        provider: 'auto'
      },
      state.activeTaskId || 'search'
    ).then(function (res) {
      var diag = formatSearchDiagnostics(res && res.diagnostics);
      if (diag) {
        try {
          console.info('[research] search diagnostics:', diag, res && res.diagnostics);
        } catch (_) {}
      }
      if (state.metrics) {
        state.metrics.searchCount = (state.ledger && state.ledger.search) || 0;
        if (res && res.provider) state.metrics.searchProvider = res.provider;
      }
      if (!res || res.ok === false) {
        var base = (res && res.message) || 'search_unavailable';
        var err = new Error(diag ? base + ' — ' + diag : base);
        err.code = (res && res.code) || 'search_unavailable';
        err.diagnostics = (res && res.diagnostics) || null;
        throw err;
      }
      return Array.isArray(res.results) ? res.results : [];
    });
  }

  function fetchUrl(url) {
    var cached = state.fetchCache && state.fetchCache[url];
    if (cached) return Promise.resolve(cached);
    return runControllerAction(
      'fetch_url',
      { url: url, provider: 'direct', maxChars: 12000 },
      state.activeTaskId || 'fetch'
    )
      .then(function (page) {
        if (state.fetchCache) state.fetchCache[url] = page;
        if (state.metrics) state.metrics.fetchOk += 1;
        return page;
      })
      .catch(function (e) {
        if (state.metrics) state.metrics.fetchFail += 1;
        throw e;
      });
  }

  function emptyNoSourceResult(topic, queries, depthId, reason) {
    var generatedAt = new Date().toISOString();
    var md =
      '# ' +
      topic +
      '\n\n## 摘要\n' +
      '本次未能取得可用网络来源（' +
      reason +
      '），因此不做事实断言。\n\n## 结论\n未确认。请检查网络后点「重新调研」，或换更具体的主题。\n\n## 生成时间\n' +
      generatedAt +
      '\n';
    return emptyResult({
      title: topic || '调研报告',
      summary:
        '未能取得可用网络来源（' + reason + '），未做事实断言。请检查网络后重新调研。',
      sections: parseSectionsFromMarkdown(md),
      sources: [],
      generatedAt: generatedAt,
      model: '',
      queries: queries || [],
      limitations: [
        '本次无有效网络来源，仅为基于已有材料整理，不是网络调研完成。',
        '原因：' + reason,
        '调研深度：' + (depthId || 'standard')
      ],
      status: STATUSES.completed_without_sources,
      rawMarkdown: md
    });
  }

  /**
   * Synthesis model failed but search/fetch already produced sources —
   * keep the evidence as a readable report instead of wiping the run as failed.
   */
  function buildSourcesKeptResult(opts) {
    opts = opts || {};
    var topic = normalizeResearchTopic(opts.topic || '调研报告');
    var why = String(opts.reason || 'model_error');
    var sources = annotateSourceReadState(normalizeSources(opts.sources || []));
    var lines = [
      '# ' + topic,
      '',
      '## 直接回答',
      '模型整理失败（' +
        why +
        '）。已保留下方检索材料，可先人工查阅；也可换模型后「重新调研」。',
      '',
      '## 来源摘录'
    ];
    sources.slice(0, 8).forEach(function (s) {
      var body = String(s.text || s.snippet || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 420);
      lines.push('');
      lines.push('### [' + (s.id || '') + '] ' + (s.title || s.url || ''));
      if (s.url) lines.push(s.url);
      if (body) lines.push(body);
    });
    lines.push('');
    lines.push('## 调研限制');
    lines.push(
      '- 综合模型调用失败（' + why + '）；未生成模型成稿，仅保留已抓取来源。'
    );
    lines.push('- 调研深度：' + (opts.depth || 'standard'));
    lines.push('');
    lines.push('## 生成时间');
    lines.push(new Date().toISOString());
    lines.push('');
    var md = lines.join('\n');
    var result = buildResultFromSynthesis({
      markdown: md,
      sources: sources,
      topic: topic,
      model: '',
      queries: opts.queries || [],
      depth: opts.depth,
      fetchFailures: opts.fetchFailures || 0
    });
    result.limitations = (result.limitations || []).concat([
      '综合模型失败（' + why + '），已保留来源摘录'
    ]);
    if (result.metrics) {
      result.metrics.synthDegraded = true;
      result.metrics.synthFailReason = why;
    }
    return result;
  }

  function exportReport(format) {
    var result = state.result;
    if (!result) {
      return Promise.reject(Object.assign(new Error('no_result'), { code: 'no_result' }));
    }
    var md = renderMarkdown(result);
    var html = renderHtml(result);
    var stem =
      'research-' +
      String(result.title || 'report')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .slice(0, 40);
    var fmt = format || state.config.format || 'markdown';
    return invokeArgs('cmd_research_export', {
      format: fmt === 'html' ? 'html' : 'markdown',
      filenameStem: stem,
      markdown: md,
      html: html
    })
      .then(function (res) {
        if (!res || res.ok === false) {
          return invoke('cmd_handoff_write_md', {
            text: md,
            label: stem
          }).then(function (h) {
            state.lastExportPath = (h && h.path) || null;
            emit();
            return { ok: true, path: state.lastExportPath, via: 'handoff' };
          });
        }
        state.lastExportPath = res.path || null;
        emit();
        return res;
      })
      .catch(function (e) {
        var err = {
          code: 'export_failed',
          message: String((e && e.message) || e || 'export_failed')
        };
        state.error = err;
        emit();
        return Promise.reject(Object.assign(new Error(err.message), err));
      });
  }

  function buildResultFromSynthesis(opts) {
    opts = opts || {};
    var sources = annotateSourceReadState(normalizeSources(opts.sources));
    var rawText = String(opts.markdown || '').replace(
      /\{\{GENERATED_AT\}\}/g,
      new Date().toISOString()
    );
    var parsed = extractJsonObject(rawText);
    var doc = null;
    var documentMode = 'structured';
    var parseFailureReason = null;
    if (parsed && typeof parsed === 'object') {
      try {
        // Non-document JSON (tiny stubs) → fall through to legacy/rescue.
        if (!looksLikeResearchDocument(parsed) && !parsed.title) {
          parseFailureReason = 'not_research_document';
          parsed = null;
        } else {
        doc = validateResearchDocument(parsed, sources, {
          topic: opts.topic,
          model: opts.model,
          queries: opts.queries,
          metrics: opts.metrics,
          documentMode: 'structured'
        });
        }
      } catch (e) {
        parsed = null;
        parseFailureReason = 'validate_error';
      }
    } else {
      parseFailureReason = 'no_json';
    }
    if (!doc) {
      documentMode = 'legacy_fallback';
      doc = markdownToLegacyDocument(stripPromptEcho(rawText), sources, {
        topic: opts.topic,
        model: opts.model,
        queries: opts.queries,
        metrics: opts.metrics,
        parseFailureReason: parseFailureReason || 'json_parse'
      });
      // markdownToLegacyDocument may have rescued structured JSON.
      if (doc && doc.metrics && doc.metrics.documentMode === 'structured') {
        documentMode = 'structured';
        parseFailureReason = null;
      }
    }
    if (opts.fetchFailures > 0) {
      doc.limitations = (doc.limitations || []).concat([
        '部分网页抓取失败（' + opts.fetchFailures + '），已跳过。'
      ]);
    }
    doc.metrics = doc.metrics || {};
    if (opts.depth) {
      doc.metrics.depth = opts.depth;
    }
    doc.metrics.documentMode = documentMode;
    if (documentMode === 'legacy_fallback') {
      doc.metrics.parseFailureReason = parseFailureReason || 'json_parse';
    }
    var mdOut = documentToMarkdown(doc);
    var marked = markUsedSources(sources, mdOut);
    // Prefer exportable metadata on result.sources; keep usedInSections from marked.
    var sourcesOut = (doc.sources || []).map(function (s) {
      var m = marked.filter(function (x) {
        return x.id === s.id;
      })[0];
      return Object.assign({}, s, {
        usedInSections: (m && m.usedInSections) || []
      });
    });
    if (!sourcesOut.length) sourcesOut = marked;
    return emptyResult({
      title: doc.title,
      summary: (doc.executiveAnswer && doc.executiveAnswer.text) || '',
      sections: parseSectionsFromMarkdown(mdOut),
      sources: sourcesOut,
      generatedAt: doc.generatedAt,
      model: doc.model || opts.model || '',
      queries: opts.queries || doc.queries || [],
      limitations: doc.limitations || [],
      status: doc.status,
      rawMarkdown: mdOut,
      document: doc,
      uncertainties: doc.uncertainties || [],
      metrics: doc.metrics
    });
  }

  function finalizeMetrics(result) {
    state.metrics = state.metrics || blankMetrics();
    state.metrics.durationMs = state.runStartedAt
      ? Date.now() - state.runStartedAt
      : 0;
    if (state.ledger) {
      state.metrics.searchCount = state.ledger.search;
      state.metrics.modelCalls = state.ledger.modelCalls;
      state.metrics.repairRounds = state.ledger.repairRounds;
      state.metrics.path = state.ledger.path;
      if (state.ledger.hitCap) {
        state.metrics.limitationsFromBudget.push(
          '达到预算上限（' + state.ledger.hitCap + '），已停止补查'
        );
      }
    }
    var facets = (state.plan && state.plan.facets) || [];
    var byFacet = { _all: (result && result.sources) || [] };
    facets.forEach(function (f) {
      byFacet[f.id] = ((result && result.sources) || []).filter(function (s) {
        return s.facetId === f.id;
      });
    });
    var cov = computeCoverage(
      facets,
      byFacet,
      (result && (result.rawMarkdown || result.summary)) || '',
      null
    );
    state.metrics.facetSourceCoverage = cov.facetSourceCoverage;
    state.metrics.keyClaimCiteRate = cov.keyClaimCiteRate;
    if (result) {
      var keep = result.metrics || {};
      result.metrics = Object.assign(JSON.parse(JSON.stringify(state.metrics)), {
        documentMode: keep.documentMode || null,
        parseFailureReason: keep.parseFailureReason || null,
        insufficientEvidence: !!keep.insufficientEvidence,
        runTrace: keep.runTrace || (state.runTrace
          ? JSON.parse(JSON.stringify(state.runTrace))
          : null),
        fetchAttempt:
          keep.fetchAttempt != null
            ? keep.fetchAttempt
            : state.metrics.fetchAttempt ||
              (state.metrics.funnel && state.metrics.funnel.fetchAttempt) ||
              0,
        degradeReason:
          keep.degradeReason || state.metrics.degradeReason || null,
        planSource: keep.planSource || state.metrics.planSource || null,
        intentConfidence:
          keep.intentConfidence || state.metrics.intentConfidence || null,
        coverageBlocked: !!(
          keep.coverageBlocked || state.metrics.coverageBlocked
        )
      });
      if (result.document) result.document.metrics = result.metrics;
      result.citeCheck = programmaticCiteCheck(
        result.rawMarkdown || '',
        result.sources || []
      );
      if (state.metrics.limitationsFromBudget.length) {
        result.limitations = (result.limitations || []).concat(
          state.metrics.limitationsFromBudget
        );
      }
    }
    // Context for next broad ask (WorkBuddy-style clarify).
    rememberRecentTopic(
      (state.plan && state.plan.topic) || state.config.topic || ''
    );
  }

  var preparePlanGen = 0;
  var preparePlanPromise = null;

  function preparePlan(opts) {
    opts = opts || {};
    if (isRunningStatus(state.status)) return Promise.resolve(getSnapshot());
    var topic = normalizeResearchTopic(opts.topic != null ? opts.topic : state.config.topic || '');
    if (!topic || topic.length < 2) {
      state.status = STATUSES.failed;
      state.error = { code: 'empty_topic', message: '请填写调研主题' };
      emit(true);
      return Promise.resolve(getSnapshot());
    }
    if (opts.depth === 'quick' || opts.depth === 'standard' || opts.depth === 'deep')
      state.config.depth = opts.depth;
    if (opts.format === 'html' || opts.format === 'markdown') state.config.format = opts.format;
    if (opts.path === 'auto' || opts.path === 'fast' || opts.path === 'faceted')
      state.config.path = opts.path;
    if (opts.userConditions != null) state.config.userConditions = opts.userConditions;
    state.config.topic = topic;

    var classified = classifyPath(topic, state.config.depth, state.config.path === 'auto' ? null : state.config.path);
    var path = classified.path;
    // No local facet/entity seed on the formal path — wait for model JSON.
    var waiting = planningIntentStub(topic);
    var myPrep = ++preparePlanGen;
    state.plan = {
      topic: topic,
      path: path,
      suggestedPath: classified.path,
      pathReason: classified.reason,
      pathForced: !!classified.forced,
      depth: state.config.depth,
      facets: [],
      researchIntent: waiting,
      userConditions: state.config.userConditions || null,
      planning: true
    };
    state.tasks = [
      makeTask({
        id: 'plan',
        kind: 'plan',
        subject: '模型规划中',
        status: 'running',
        detail: classified.reason
      })
    ];
    state.progress = blankProgress('awaiting_approval', '正在用模型规划…');
    state.progress.facets = [];
    state.progress.queries = [];
    syncProgressTasks();
    state.result = null;
    state.researchIntent = waiting;
    state.error = null;
    state.status = STATUSES.awaiting_approval;
    emit(true);

    // Always ask the model (ATR-style). Local heuristics never become the captain plan.
    preparePlanPromise = resolveSemanticIntent(topic, path, { skipLedger: true })
      .then(function (intent) {
        if (myPrep !== preparePlanGen) return getSnapshot();
        if (state.status !== STATUSES.awaiting_approval || !state.plan) {
          return getSnapshot();
        }
        intent = intent || modelPlanBlockedIntent(topic, 'enrich_failed');
        // Model may suggest path when user/depth did not force one.
        if (
          !classified.forced &&
          intent &&
          (intent.preferredPath === 'fast' || intent.preferredPath === 'faceted')
        ) {
          state.plan.path = intent.preferredPath;
          state.plan.suggestedPath = intent.preferredPath;
          state.plan.pathReason =
            '模型建议' +
            (intent.preferredPath === 'faceted' ? '分工调研' : '快速核实');
        }
        state.plan.planning = false;
        state.plan.researchIntent = intent;
        state.researchIntent = intent;
        if (isFormalModelIntent(intent) && state.plan.path === 'faceted') {
          var facets = facetsFromIntent(intent);
          state.plan.facets = facets;
          state.progress.facets = facets.slice();
          state.progress.queries = facets.map(function (f) {
            return f.query || ((f.queries && f.queries[0]) || '');
          });
        } else if (!isFormalModelIntent(intent)) {
          state.plan.facets = [];
          state.progress.facets = [];
          state.progress.queries = [];
        }
        var src = (intent && intent.planSource) || 'local';
        var degrade = (intent && intent.degradeReason) || '';
        var pathNote = state.plan.pathReason || classified.reason || '';
        state.tasks = [
          makeTask({
            id: 'plan',
            kind: 'plan',
            subject:
              src === 'wb'
                ? '模型规划'
                : degrade === 'invalid_json'
                  ? '规划未通过（JSON 不合规）'
                  : degrade
                    ? '规划未通过（' + degrade + '）'
                    : '规划未通过',
            status: 'completed',
            detail:
              src +
              (degrade ? ' · ' + degrade : '') +
              ' · ' +
              pathNote
          })
        ];
        syncProgressTasks();
        if (intent && intent.needsClarify) {
          state.progress.message =
            intent.clarifyQuestion ||
            '主题偏宽，请先选择调研方向';
        } else if (!isFormalModelIntent(intent)) {
          state.progress.message =
            (intent.ambiguities && intent.ambiguities[0]) ||
            '正式路径需要模型规划 JSON。请换模型或点「重新规划」。';
        } else {
          state.progress.message =
            (state.plan.path === 'fast' ? '快速核实' : '分工调研') +
            ' · ' +
            pathNote;
        }
        emit(true);
        return getSnapshot();
      })
      .catch(function (err) {
        if (myPrep !== preparePlanGen) return getSnapshot();
        if (state.plan) state.plan.planning = false;
        var c = classifyModelFailure(err);
        var blocked = modelPlanBlockedIntent(topic, c.code || 'model_error');
        state.plan.researchIntent = blocked;
        state.researchIntent = blocked;
        state.plan.facets = [];
        state.progress.message =
          '规划失败（' +
          (c.code || 'model_error') +
          '）。正式路径未建立——请点「重新规划」。';
        state.tasks = [
          makeTask({
            id: 'plan',
            kind: 'plan',
            subject: '规划未通过（' + (c.code || 'model_error') + '）',
            status: 'completed',
            detail: String(c.message || c.code || err || '')
          })
        ];
        syncProgressTasks();
        emit(true);
        return getSnapshot();
      });
    return preparePlanPromise;
  }

  /**
   * User answered model clarify (chip id, option object, or free-text refined topic).
   * @param {string|{id?:string,label?:string,refinedTopic?:string}} optionOrId
   */
  function applyClarifyOption(optionOrId) {
    var intent =
      state.researchIntent || (state.plan && state.plan.researchIntent) || null;
    var options = (intent && intent.clarifyOptions) || [];
    var refined = '';
    var matched = null;
    if (optionOrId && typeof optionOrId === 'object') {
      refined = String(
        optionOrId.refinedTopic || optionOrId.topic || optionOrId.label || ''
      ).trim();
      if (optionOrId.id) {
        for (var j = 0; j < options.length; j++) {
          if (options[j] && options[j].id === String(optionOrId.id)) {
            matched = options[j];
            break;
          }
        }
        if (matched && !refined) {
          refined = String(matched.refinedTopic || matched.label || '').trim();
        }
      }
    } else {
      var id = String(optionOrId || '').trim();
      for (var i = 0; i < options.length; i++) {
        if (options[i] && options[i].id === id) {
          matched = options[i];
          refined = String(
            options[i].refinedTopic || options[i].label || ''
          ).trim();
          break;
        }
      }
      // Free-text only — never treat synthetic chip ids (opt1/opt2/opt3) as topics.
      if (!refined && id.length >= 2 && !/^opt\d+$/i.test(id)) refined = id;
    }
    if (/^opt\d+$/i.test(refined)) {
      refined = matched
        ? String(matched.label || '').trim()
        : '';
    }
    if (!refined || refined.length < 2) {
      return Promise.resolve(getSnapshot());
    }
    return preparePlan({
      topic: refined,
      depth: state.config.depth,
      format: state.config.format,
      path: state.config.path || 'auto'
    });
  }

  function updatePlan(patch) {
    patch = patch || {};
    if (state.status !== STATUSES.awaiting_approval || !state.plan) {
      return getSnapshot();
    }
    if (patch.path === 'fast' || patch.path === 'faceted') {
      state.plan.path = patch.path;
      state.config.path = patch.path;
      if (patch.path === 'faceted') {
        // Only model captain facets — never invent local facets on path switch.
        if (
          isFormalModelIntent(state.plan.researchIntent) &&
          state.plan.researchIntent.facets &&
          state.plan.researchIntent.facets.length
        ) {
          state.plan.facets = facetsFromIntent(state.plan.researchIntent);
          state.researchIntent = state.plan.researchIntent;
        } else if (!(state.plan.facets && state.plan.facets.length)) {
          state.plan.facets = [];
        }
      }
      if (patch.path === 'fast') {
        state.plan.facets = [];
      }
    }
    if (Array.isArray(patch.facets)) {
      state.plan.facets = patch.facets
        .map(function (f, i) {
          return {
            id: f.id || 'f' + (i + 1),
            label: String(f.label || '调查面' + (i + 1)).slice(0, 40),
            query: String(f.query || '').trim().slice(0, 80),
            keyPoints: Array.isArray(f.keyPoints) ? f.keyPoints.slice(0, 4) : ['关键事实']
          };
        })
        .filter(function (f) {
          return f.query.length >= 2;
        })
        .slice(0, 3);
    }
    state.progress.facets = (state.plan.facets || []).slice();
    state.progress.queries = (state.plan.facets || []).map(function (f) {
      return f.query;
    });
    state.progress.message =
      (state.plan.path === 'fast' ? '快速核实' : '分工调研') +
      ' · ' +
      (state.plan.pathReason || '');
    emit(true);
    return getSnapshot();
  }

  /**
   * @param {{ topic?: string, depth?: string, format?: string, path?: string, autoConfirm?: boolean, allowWithoutSearch?: boolean }} opts
   */
  function start(opts) {
    opts = opts || {};
    if (isRunningStatus(state.status)) {
      return Promise.resolve(getSnapshot());
    }
    if (isLocalNetworkRequest(opts.topic)) {
      return startLocalNetworkDiagnostics(opts.topic);
    }
    return preparePlan(opts).then(function (snap) {
      if (snap.status === 'failed') return snap;
      if (opts.autoConfirm || opts.skipApproval) {
        return confirmAndRun(opts);
      }
      return snap;
    });
  }

  function confirmAndRun(opts) {
    opts = opts || {};
    if (state.status !== STATUSES.awaiting_approval && !opts.force) {
      if (state.plan && state.plan.topic) {
        /* allow re-entry after prepare */
      } else {
        return preparePlan(opts).then(function () {
          return confirmAndRun(Object.assign({}, opts, { force: true }));
        });
      }
    }
    if (!state.plan || !state.plan.topic) {
      return Promise.resolve(getSnapshot());
    }
    // Wait out in-flight model planning so confirm reuses the same intent.
    if (state.plan.planning && preparePlanPromise && !opts._waitedPlan) {
      return preparePlanPromise.then(function () {
        return confirmAndRun(Object.assign({}, opts, { force: true, _waitedPlan: true }));
      });
    }
    var gateIntent =
      state.researchIntent || (state.plan && state.plan.researchIntent) || null;
    if (gateIntent && gateIntent.needsClarify && !opts.skipClarify) {
      state.status = STATUSES.awaiting_approval;
      state.progress.message =
        gateIntent.clarifyQuestion || '主题偏宽，请先选择调研方向';
      emit(true);
      return Promise.resolve(getSnapshot());
    }
    // Formal path: model JSON only. Local heuristics cannot open a run.
    if (!opts.skipModelGate && !isFormalModelIntent(gateIntent)) {
      state.status = STATUSES.awaiting_approval;
      state.progress.message =
        (gateIntent && gateIntent.ambiguities && gateIntent.ambiguities[0]) ||
        '正式路径需要模型规划 JSON。请换模型或点「重新规划」。';
      emit(true);
      return Promise.resolve(getSnapshot());
    }
    cancelFlag = false;
    var myRun = ++runId;
    var topic = normalizeResearchTopic(state.plan.topic);
    var path = state.plan.path || 'fast';
    state.plan.topic = topic;
    if (Array.isArray(state.plan.facets)) {
      state.plan.facets = state.plan.facets.map(function (f) {
        var next = Object.assign({}, f);
        next.query = normalizeResearchQuery(next.query || next.label || topic);
        return next;
      });
      state.progress.facets = state.plan.facets.slice();
      state.progress.queries = state.plan.facets.map(function (f) { return f.query; });
    }
    var depth = DEPTH[state.config.depth] || DEPTH.standard;
    state.runStartedAt = Date.now();
    state.fetchCache = {};
    state.ledger = blankLedger(depth.id, path);
    state.metrics = blankMetrics();
    state.metrics.path = path;
    state.runTrace = blankRunTrace('r' + myRun + '-' + Date.now());
    // DEPTH only has maxSources — controller budget must come from BUDGETS
    // (passing depth.search/modelCalls left undefined → Object.assign wiped defaults to 0).
    var budgetCaps =
      (state.ledger && state.ledger.caps) ||
      BUDGETS[path === 'fast' ? 'fast' : depth.id === 'deep' ? 'deep' : 'standard'] ||
      BUDGETS.standard;
    state.controller =
      global.OneToneWorkController && global.OneToneWorkController.create
        ? global.OneToneWorkController.create({
            runId: state.runTrace.runId,
            mode: 'research',
            originalRequest: topic,
            goal: topic,
            plan: state.plan,
            budget: (function () {
              var b = {
                search: Number(budgetCaps.search) || 0,
                fetch: Number(budgetCaps.fetch) || 0
              };
              // Omit model when uncapped — controller treats missing kind as unlimited.
              if (modelCapFinite({ caps: budgetCaps })) {
                b.model = Number(budgetCaps.modelCalls);
              }
              return b;
            })(),
            invoke: function (cmd, args) {
              return invokeArgs(cmd, args || {});
            },
            skipArchiveLoad: true
          })
        : null;
    if (state.controller) {
      ensureControllerInvoke();
      if (typeof state.controller.upsertTasks === 'function') {
        state.controller.upsertTasks(
          (state.tasks || []).map(function (t) {
            return {
              taskId: t.id,
              kind: t.kind,
              status: t.status || 'pending',
              deps: t.deps || [],
              detail: t.subject || t.detail || '',
              attemptId: t.attemptId || 1
            };
          })
        );
      }
    }
    // Reuse captain plan from prepare — do not wipe and rebuild a different facet set.
    state.researchIntent =
      (state.plan && state.plan.researchIntent) || null;
    if (state.metrics && state.researchIntent) {
      state.metrics.planSource = state.researchIntent.planSource || 'local';
      state.metrics.intentConfidence = localIntentConfidence(state.researchIntent);
    }
    state.result = null;
    state.lastExportPath = null;
    state.error = null;
    traceEvent('run_start', { topic: topic, path: path, depth: depth.id });
    controllerPhase('understand');
    controllerPhase('plan');

    if (path === 'faceted') {
      return runFacetedPipeline(opts, myRun, topic, depth);
    }
    return runFastPipeline(opts, myRun, topic, depth);
  }

  function runFastPipeline(opts, myRun, topic, depth) {
    opts = opts || {};
    controllerPhase('choose_action');
    var queries = [topic];
    var allowWithoutSearch = opts.allowWithoutSearch === true;
    var intentRef = null;
    state.tasks = [
      makeTask({ id: 'plan', kind: 'plan', subject: '模型规划', status: 'ready' }),
      makeTask({ id: 'search', kind: 'search', subject: '搜索', deps: ['plan'], status: 'pending' }),
      makeTask({ id: 'fetch', kind: 'fetch', subject: '抓取阅读', deps: ['search'], status: 'pending' }),
      makeTask({
        id: 'synthesize',
        kind: 'synthesize',
        subject: '有来源短答',
        deps: ['fetch'],
        status: 'pending'
      })
    ];
    syncProgressTasks();
    if (state.controller && typeof state.controller.upsertTasks === 'function') {
      state.controller.upsertTasks(
        state.tasks.map(function (t) {
          return {
            taskId: t.id,
            kind: t.kind,
            status: t.status || 'pending',
            deps: t.deps || [],
            detail: t.subject || '',
            attemptId: t.attemptId || 1
          };
        })
      );
    }
    setStatus(STATUSES.searching, { phase: 'searching', message: '沿用确认的规划…' });
    setTaskStatus('plan', 'running', { attemptId: 1 });

    var searchHits = [];
    var leadHits = [];
    var fetchFailures = 0;
    var fetchAttempt = 0;
    var fetched = [];
    var searchError = null;

    function aborted() {
      return cancelFlag || myRun !== runId;
    }

    function attachTrace(result) {
      if (!result) return result;
      result.metrics = result.metrics || {};
      result.metrics.runTrace = state.runTrace
        ? JSON.parse(JSON.stringify(state.runTrace))
        : null;
      result.metrics.funnel = state.metrics && state.metrics.funnel
        ? Object.assign({}, state.metrics.funnel)
        : null;
      result.metrics.degradeReason =
        (state.metrics && state.metrics.degradeReason) || null;
      result.metrics.planSource =
        (state.metrics && state.metrics.planSource) || null;
      result.metrics.intentConfidence =
        (state.metrics && state.metrics.intentConfidence) || null;
      return result;
    }

    function finishEmptyTemplate(reason) {
      var result = attachTrace(emptyNoSourceResult(topic, queries, depth.id, reason));
      finalizeMetrics(result);
      state.result = result;
      state.status = STATUSES.completed_without_sources;
      state.error = {
        code: 'no_sources',
        message: '未取得网络来源：' + reason
      };
      state.progress.message =
        statusLabel(result.status) + ' · ' + nextStepHint(state.error);
      traceEvent('run_end', { status: state.status, reason: reason });
      emit(true);
      return getSnapshot();
    }

    /** No web hits → still ask the model (ATR-style), don't silently template-quit. */
    function finishWithoutSources(reason, evidenceHits) {
      var why = String(reason || '未找到相关结果');
      var evidenceLines = formatSerpEvidenceForModel(evidenceHits, 6);
      setTaskStatus('synthesize', 'running', {
        attemptId: 1,
        detail: 'no_sources_ask_model'
      });
      setStatus(STATUSES.synthesizing, {
        phase: 'synthesizing',
        message: '无可用来源，正在问模型下一步…'
      });
      emit(true);
      return chatOnce(
        [
          {
            role: 'system',
            content: [
              '网页检索无可用来源。禁止编造事实或 URL。',
              '若下方有检索线索，可据此建议改写查询或澄清方向；不得把线索标题捏造成已证实结论。',
              '若主题过宽/应澄清（含「本地网络/本机电脑」类本机诊断）：输出 JSON：needsClarify=true, clarifyQuestion, clarifyOptions[{id,label,refinedTopic}]（2～4 个，按题意自拟方向）。',
              '若只需诚实说明「搜不到、建议怎么改主题」：输出短 Markdown（摘要+下一步），不要假装已完成调研。',
              '只输出 JSON 或 Markdown。'
            ].join('\n')
          },
          {
            role: 'user',
            content:
              '主题：' +
              topic +
              '\n检索词：' +
              (queries || []).join('、') +
              '\n失败原因：' +
              why +
              '\n已见检索线索：\n' +
              (evidenceLines.length ? evidenceLines.join('\n') : '（无）')
          }
        ],
        { maxTokens: 800 }
      )
        .then(function (chat) {
          if (aborted()) return getSnapshot();
          var parsed = extractResearchIntentJson(chat && chat.text);
          if (
            parsed &&
            (parsed.needsClarify ||
              (Array.isArray(parsed.clarifyOptions) && parsed.clarifyOptions.length))
          ) {
            var clarified = normalizeModelClarify(
              normalizeResearchIntent(parsed, topic)
            );
            clarified.needsClarify = true;
            clarified.planSource = 'wb';
            clarified.degradeReason = null;
            if (state.plan) {
              state.plan.planning = false;
              state.plan.topic = topic;
              state.plan.researchIntent = clarified;
            }
            state.researchIntent = clarified;
            state.result = null;
            state.error = null;
            state.status = STATUSES.awaiting_approval;
            state.progress.message =
              clarified.clarifyQuestion || '检索无来源，请先确认方向';
            setTaskStatus('synthesize', 'completed', {
              attemptId: 1,
              detail: 'model_clarify'
            });
            syncProgressTasks();
            traceEvent('run_end', {
              status: 'awaiting_approval',
              reason: 'model_clarify_after_no_sources'
            });
            emit(true);
            return getSnapshot();
          }
          var md = String((chat && chat.text) || '').trim();
          if (md.length >= 40 && !/^[\s{[]/.test(md)) {
            var advised = attachTrace(
              buildResultFromSynthesis({
                markdown: md,
                sources: [],
                topic: topic,
                model: (chat && chat.model) || '',
                queries: queries,
                depth: depth.id,
                fetchFailures: fetchFailures
              })
            );
            finalizeMetrics(advised);
            state.result = advised;
            state.status = STATUSES.completed_without_sources;
            state.error = {
              code: 'no_sources',
              message: '未取得网络来源：' + why + '（已请模型给下一步）'
            };
            state.progress.message = statusLabel(state.status) + ' · 模型建议';
            setTaskStatus('synthesize', 'completed', {
              attemptId: 1,
              detail: 'model_advice'
            });
            traceEvent('run_end', {
              status: state.status,
              reason: 'model_advice_no_sources'
            });
            emit(true);
            return getSnapshot();
          }
          return finishEmptyTemplate(why);
        })
        .catch(function () {
          if (aborted()) return getSnapshot();
          return finishEmptyTemplate(why);
        });
    }

    var preparedFast =
      state.plan && isFormalModelIntent(state.plan.researchIntent)
        ? state.plan.researchIntent
        : null;
    var planReadyFast = preparedFast
      ? Promise.resolve(preparedFast)
      : resolveSemanticIntent(topic, 'fast');
    var fastThinRewriteTried = false;
    var fastZeroRewriteTried = false;
    var fastAuthorityDigTried = false;

    return planReadyFast
      .then(function (intent) {
        if (aborted()) return null;
        intentRef = intent;
        var planned = [];
        if (intent && intent.facets) {
          intent.facets.forEach(function (f) {
            (f.queries || []).forEach(function (q) {
              uniquePush(planned, q, 6);
            });
          });
        }
        if (!planned.length) planned = [topic];
        queries = planned;
        if (state.plan) state.plan.researchIntent = intent;
        if (state.metrics && intent) {
          state.metrics.planSource = intent.planSource || 'local';
          state.metrics.intentConfidence = localIntentConfidence(intent);
        }
        setTaskStatus('plan', 'completed', {
          attemptId: 1,
          detail:
            (intent.planSource || 'local') +
            (intent.status === 'ready' ? ' ready' : ' degraded:' + (intent.degradeReason || ''))
        });
        // Formal path: bare/thin model queries (e.g.「操作」) → rewrite once before first search.
        var thinFormal =
          isFormalModelIntent(intent) && queriesLookTooThin(queries, topic);
        var readySearch = Promise.resolve(queries);
        if (thinFormal && !fastThinRewriteTried) {
          fastThinRewriteTried = true;
          state.progress.message = '查询过窄，正在让模型改写检索词…';
          emit(true);
          readySearch = rewriteSearchQueries(
            topic,
            intent,
            queries,
            ['thin_queries'],
            { skipLedger: true, loosePrimary: true }
          ).then(function (rewritten) {
            if (rewritten && rewritten.length) queries = rewritten.slice(0, 6);
            return queries;
          });
        }
        return readySearch.then(function (qs) {
          if (aborted()) return null;
          queries = (qs && qs.length ? qs : queries).slice(0, 6);
          state.progress.queries = queries.slice();
          state.progress.message = '正在搜索 ' + queries.length + ' 组关键词…';
          setTaskStatus('search', 'running', { attemptId: 1 });
          emit(true);
          return searchMany(queries, Math.min(depth.maxSources, 4), intent);
        });
      })
      .catch(function (e) {
        searchError = e;
        if (!allowWithoutSearch) {
          state.progress.message =
            '搜索失败：' + String((e && e.message) || e);
          emit();
          return [];
        }
        state.progress.message =
          '搜索不可用，改为基于已有材料整理：' + String((e && e.message) || e);
        emit();
        return [];
      })
      .then(function (hits) {
        if (aborted()) return null;
        if (hits == null) return null;
        // Formal path: zero picked → ask model to rewrite queries once, then re-search.
        if (
          !(hits || []).length &&
          !fastZeroRewriteTried &&
          isFormalModelIntent(intentRef)
        ) {
          fastZeroRewriteTried = true;
          state.progress.message = '检索无命中，正在让模型改写查询…';
          emit(true);
          return rewriteSearchQueries(
            topic,
            intentRef,
            queries,
            ['zero_picked'],
            { skipLedger: true, loosePrimary: true }
          ).then(function (rewritten) {
            if (aborted()) return null;
            if (!rewritten || !rewritten.length) return [];
            queries = rewritten.slice(0, 6);
            state.progress.queries = queries.slice();
            state.progress.message = '改写后重搜 ' + queries.length + ' 组…';
            emit(true);
            return searchMany(queries, Math.min(depth.maxSources, 4), intentRef);
          });
        }
        return hits;
      })
      .then(function (hits) {
        if (aborted()) return null;
        if (hits == null) return null;
        searchHits = (hits || []).slice(0, Math.min(depth.maxSources, 4));
        leadHits = searchHits.slice();
        state.progress.sourcesFound = searchHits.length;
        setTaskStatus('search', 'completed', {
          attemptId: 1,
          detail:
            searchHits.length +
            ' picked (raw funnel in metrics)'
        });
        if (!searchHits.length) {
          return finishWithoutSources(
            (searchError && (searchError.message || searchError.code)) ||
              '未找到相关结果'
          );
        }
        state.progress.liveSources = searchHits.map(function (hit, idx) {
          return {
            id: 'S' + (idx + 1),
            title: hit.title || hit.url,
            url: hit.url,
            snippet: hit.snippet || '',
            state: 'pending'
          };
        });
        setTaskStatus('fetch', 'running', { attemptId: 1 });
        setStatus(STATUSES.fetching, {
          phase: 'fetching',
          message: '正在抓取 1/' + searchHits.length + '…'
        });
        emit(true);
        var chain = Promise.resolve();
        searchHits.forEach(function (hit, idx) {
          chain = chain.then(function () {
            if (aborted()) return;
            if (!hit || !hit.url) {
              traceEvent('fetch_skip', { reason: 'missing_url', title: hit && hit.title });
              return;
            }
            if (!ledgerCan('fetch', 1)) {
              traceEvent('fetch_skip', { reason: 'budget', url: hit.url });
              return;
            }
            var live = state.progress.liveSources[idx];
            if (live) live.state = 'fetching';
            state.progress.currentUrl = hit.url || '';
            state.progress.currentTitle = hit.title || hit.url || '';
            state.progress.message =
              '正在抓取 ' +
              (idx + 1) +
              '/' +
              searchHits.length +
              '：' +
              String(hit.title || hit.url || '').slice(0, 48);
            emit();
            fetchAttempt += 1;
            bumpFunnel('fetchAttempt', 1);
            if (state.metrics) state.metrics.fetchAttempt = fetchAttempt;
            return fetchUrl(hit.url)
              .then(function (page) {
                var row = {
                  id: 'S' + (fetched.length + 1),
                  title: page.title || hit.title || hit.url,
                  url: page.url || hit.url,
                  snippet: hit.snippet || '',
                  fetchedAt: page.fetchedAt || new Date().toISOString(),
                  text: page.text || hit.snippet || '',
                  usedInSections: []
                };
                fetched.push(row);
                if (live) {
                  live.state = 'ok';
                  live.title = row.title;
                  live.chars = String(row.text || '').length;
                }
                state.progress.sourcesFetched = fetched.length;
                state.progress.message =
                  '已抓取 ' + fetched.length + '/' + searchHits.length;
                traceEvent('fetch', { ok: true, url: row.url });
                emit();
                return yieldUi();
              })
              .catch(function (err) {
                fetchFailures += 1;
                if (live) {
                  live.state = 'fail';
                  live.error = '正文读取失败，保留为摘要线索';
                }
                traceEvent('fetch', {
                  ok: false,
                  url: hit.url,
                  error: String((err && err.message) || err || 'fetch_failed')
                });
                emit();
                return yieldUi();
              });
          });
        });
        return chain.then(function () {
          state.progress.currentUrl = '';
          state.progress.currentTitle = '';
          return fetched;
        });
      })
      .then(function (sources) {
        if (aborted() || sources == null) return null;
        if (!Array.isArray(sources)) return sources;
        fetched = sources;
        var digIntent = intentRef || { originalQuestion: topic };
        // Formal fast path: one model-led dig when corpus is one-sided (e.g. only OPPO官网).
        if (
          !fastAuthorityDigTried &&
          isFormalModelIntent(digIntent) &&
          ledgerCan('search', 1) &&
          ledgerCan('fetch', 1)
        ) {
          var missingPartners = missingComparePartners(fetched, digIntent);
          var needsAuthDig = corpusNeedsAuthorityDig(fetched, {
            missingPartners: missingPartners,
            shallowPlay: corpusMostlyShallowPlay(fetched)
          });
          if (needsAuthDig) {
            fastAuthorityDigTried = true;
            spendRepair('authority_dig', { sources: fetched.length });
            state.progress.message = '缺侧/权威源补搜…';
            emit(true);
            return planAuthorityDigQueries(
              topic,
              digIntent,
              fetched,
              queries,
              { skipLedger: true }
            ).then(function (digQs) {
              if (aborted() || !digQs || !digQs.length) return fetched;
              digQs.forEach(function (q) {
                uniquePush(queries, q, 12);
                uniquePush(state.progress.queries, q, 24);
              });
              var digHits = [];
              var digChain = Promise.resolve();
              digQs.slice(0, 3).forEach(function (q) {
                digChain = digChain.then(function () {
                  if (aborted() || !ledgerCan('search', 1)) return;
                  return searchWeb(q, 5)
                    .catch(function () {
                      return [];
                    })
                    .then(function (hits) {
                      (hits || []).forEach(function (h) {
                        if (h && h.url) digHits.push(h);
                      });
                      traceEvent('repair_search', {
                        reason: 'authority_dig',
                        path: 'fast',
                        query: q,
                        hits: (hits && hits.length) || 0
                      });
                    });
                });
              });
              return digChain.then(function () {
                var digProducts = compareProductEntities(
                  (digIntent && digIntent.entities) || [],
                  topic
                );
                var ranked = digHits.filter(function (h) {
                  if (!h || !h.url) return false;
                  if (
                    fetched.some(function (s) {
                      return s && s.url === h.url;
                    })
                  ) {
                    return false;
                  }
                  if (isDictionaryTrapHit(h, topic)) return false;
                  if (digProducts.length >= 2) {
                    return hitMentionsAnyEntity(h, digProducts);
                  }
                  return true;
                });
                ranked.sort(function (a, b) {
                  var sa = isShallowPlayPageHit(a)
                    ? 2
                    : isThirdPartyAuthorityHost(sourceHostKey(a.url))
                      ? 0
                      : 1;
                  var sb = isShallowPlayPageHit(b)
                    ? 2
                    : isThirdPartyAuthorityHost(sourceHostKey(b.url))
                      ? 0
                      : 1;
                  return sa - sb;
                });
                var pick = ranked.slice(0, 3);
                var fetchChain = Promise.resolve();
                pick.forEach(function (hit) {
                  fetchChain = fetchChain.then(function () {
                    if (aborted() || !ledgerCan('fetch', 1)) return;
                    fetchAttempt += 1;
                    bumpFunnel('fetchAttempt', 1);
                    if (state.metrics) state.metrics.fetchAttempt = fetchAttempt;
                    return fetchUrl(hit.url)
                      .then(function (page) {
                        var row = {
                          id: 'S' + (fetched.length + 1),
                          title: page.title || hit.title || hit.url,
                          url: page.url || hit.url,
                          snippet: hit.snippet || '',
                          fetchedAt: page.fetchedAt || new Date().toISOString(),
                          text: page.text || hit.snippet || '',
                          usedInSections: []
                        };
                        fetched.push(row);
                        leadHits.push(hit);
                        state.progress.sourcesFetched = fetched.length;
                        traceEvent('fetch', {
                          ok: true,
                          url: row.url,
                          reason: 'authority_dig'
                        });
                        emit();
                      })
                      .catch(function (e) {
                        fetchFailures += 1;
                        traceEvent('fetch', {
                          ok: false,
                          url: hit.url,
                          reason: 'authority_dig',
                          error: String(
                            (e && (e.code || e.message)) || 'unknown'
                          ).slice(0, 80)
                        });
                      });
                  });
                });
                return fetchChain.then(function () {
                  if (state.metrics) state.metrics.authorityDig = true;
                  setTaskStatus('fetch', 'running', {
                    attemptId: 1,
                    detail: fetched.length + ' sources after dig'
                  });
                  emit(true);
                  return fetched;
                });
              });
            });
          }
        }
        return fetched;
      })
      .then(function (sources) {
        if (aborted() || sources == null) return null;
        if (!Array.isArray(sources)) return sources;
        var noiseIntent = intentRef || { originalQuestion: topic };
        var formalKeep = isFormalModelIntent(noiseIntent);
        var valid = annotateSourceReadState(
          keepSourcesForSynthesis(sources, noiseIntent, { formal: formalKeep })
        );
        var leadOnly = false;
        if (!valid.length) {
          valid = annotateSourceReadState(
            keepSourcesForSynthesis(
              buildSnippetLeadSources(leadHits, 8, 0),
              noiseIntent,
              { formal: formalKeep }
            )
          );
          leadOnly = valid.length > 0;
        }
        setTaskStatus('fetch', 'completed', {
          attemptId: 1,
          detail:
            valid.length +
            (leadOnly ? ' snippet leads' : ' sources') +
            '; fetchAttempt=' +
            fetchAttempt
        });
        if (!valid.length) {
          return finishWithoutSources(
            fetchAttempt
              ? '正文读取失败且无可用摘要'
              : '未找到相关结果',
            (fetched && fetched.length ? fetched : leadHits) || []
          );
        }
        state.progress.currentUrl = '';
        state.progress.currentTitle = '';
        setTaskStatus('synthesize', 'running', { attemptId: 1 });
        setStatus(STATUSES.synthesizing, {
          phase: 'synthesizing',
          message: leadOnly ? '仅有摘要线索，正在整理…' : '正在用当前模型写有来源短答…'
        });
        emit(true);
        traceEvent('synthesis_input', {
          sources: (valid || []).map(function (s) {
            var excerpt = String((s && (s.text || s.snippet)) || '').trim();
            return {
              id: s && s.id,
              url: s && s.url,
              readState: s && s.fetchedAt ? 'fetched' : excerpt ? 'snippet' : 'empty',
              excerptChars: excerpt.length
            };
          }),
          briefModes: { fast: 'passthrough' }
        });
        var system = buildSynthesisSystemPrompt(valid, topic, uniqueStrings(queries));
        if (leadOnly) {
          system +=
            '\n重要：当前多为搜索摘要。直接回答仍须干货先行：压入摘要中的具体事实；材料边界一句带过；禁止把直接回答写成「无法确认」说明；不得编造。';
        }
        var user =
          '调研主题：' +
          topic +
          '\n用户条件：' +
          JSON.stringify(state.config.userConditions || {}) +
          '\n检索词：' +
          queries.join('、') +
          '\n深度：' +
          depth.id +
          (intentRef
            ? '\nresearchGoal：' + (intentRef.researchGoal || '') +
              '\nphenomenon：' + (intentRef.phenomenon || '')
            : '') +
          '\n请只输出 ResearchDocument JSON（可用 json 代码块包裹）：含 title、executiveAnswer、blocks、claims、uncertainties、limitations。executiveAnswer 干货先行；不得输出完整 HTML；不得编造 URL。';
        var synthMessages = [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ];
        return chatOnceWithRetry(synthMessages, {
          maxTokens: 4096,
          purpose: 'synthesis'
        }).catch(function (e) {
            // Keep already-fetched sources — do not wipe a partial win as failed.
            if (aborted()) return { __aborted: true };
            var err = classifyModelFailure(e);
            if (valid && valid.length) {
              var kept = attachTrace(
                buildSourcesKeptResult({
                  topic: topic,
                  sources: valid,
                  queries: queries,
                  depth: depth.id,
                  fetchFailures: fetchFailures,
                  reason: err.code || err.message || 'model_error'
                })
              );
              finalizeMetrics(kept);
              setTaskStatus('synthesize', 'completed', {
                attemptId: 1,
                detail: 'synth_failed_sources_kept'
              });
              state.result = kept;
              state.progress.sourcesUsed = (kept.sources || []).length;
              state.status = kept.status || STATUSES.completed_with_sources;
              state.error = {
                code: err.code || 'model_error',
                message:
                  '模型整理失败，已保留 ' +
                  valid.length +
                  ' 条来源：' +
                  (err.message || err.code || 'model_error')
              };
              state.progress.message =
                statusLabel(state.status) + ' · 模型失败，已保留来源';
              traceEvent('run_end', {
                status: state.status,
                reason: 'synth_failed_sources_kept',
                errorCode: err.code
              });
              emit(true);
              return { __kept: true };
            }
            state.status = STATUSES.failed;
            state.error = err;
            state.progress.message = nextStepHint(err);
            traceEvent('run_end', { status: 'failed', reason: err.code });
            emit(true);
            return null;
          })
          .then(function (chat) {
            if (!chat || chat.__kept || chat.__aborted) return getSnapshot();
            if (aborted()) return getSnapshot();
            var result = attachTrace(
              buildResultFromSynthesis({
              markdown: chat.text,
              sources: valid,
              topic: topic,
              model: chat.model,
              queries: queries,
              depth: depth.id,
              fetchFailures: fetchFailures
              })
            );
            finalizeMetrics(result);
            setTaskStatus('synthesize', 'completed', { attemptId: 1 });
            state.result = result;
            state.progress.sourcesUsed = (result.sources || []).filter(function (s) {
              return s.usedInSections && s.usedInSections.length;
            }).length;
            state.status = result.status;
            state.progress.message = leadOnly
              ? statusLabel(result.status) + ' · 仅获得摘要'
              : statusLabel(result.status);
            state.error = null;
            traceEvent('run_end', { status: state.status, leadOnly: leadOnly });
            emit(true);
            return getSnapshot();
          });
      })
      .then(function () {
        return getSnapshot();
      })
      .catch(function (e) {
        if (aborted()) {
          state.status = STATUSES.idle;
          state.error = { code: 'cancelled', message: '已取消' };
          traceEvent('run_end', { status: 'cancelled' });
          emit(true);
          return getSnapshot();
        }
        // Late failure after sources exist — still prefer keeping evidence.
        var fetchedNow =
          (state.progress && state.progress.liveSources) ||
          (state.result && state.result.sources) ||
          [];
        if (fetchedNow.length && !state.result) {
          var lateErr = classifyModelFailure(e);
          var keptLate = attachTrace(
            buildSourcesKeptResult({
              topic: topic,
              sources: fetchedNow,
              queries: queries,
              depth: depth.id,
              fetchFailures: fetchFailures,
              reason: lateErr.code || 'failed'
            })
          );
          finalizeMetrics(keptLate);
          state.result = keptLate;
          state.status = keptLate.status || STATUSES.completed_with_sources;
          state.error = {
            code: lateErr.code || 'failed',
            message:
              '流程中断但已保留来源：' + (lateErr.message || lateErr.code || 'failed')
          };
          state.progress.message =
            statusLabel(state.status) + ' · 已保留来源';
          traceEvent('run_end', {
            status: state.status,
            reason: 'late_fail_sources_kept'
          });
          emit(true);
          return getSnapshot();
        }
        var code = (e && e.code) || 'failed';
        var err = {
          code: code,
          message: String((e && e.message) || e || 'failed')
        };
        state.status = STATUSES.failed;
        state.error = err;
        state.progress.message = nextStepHint(err);
        traceEvent('run_end', { status: 'failed', reason: code });
        emit(true);
        return getSnapshot();
      });
  }

  function runFacetedPipeline(opts, myRun, topic, depth) {
    opts = opts || {};
    controllerPhase('choose_action');
    var facets = (state.plan && state.plan.facets) || buildFacetPlanHeuristic(topic);
    var parallel = Math.min(2, (state.ledger && state.ledger.caps.parallelFacets) || 2);
    var sourceSeq = 0;
    var allSources = [];
    var leadHits = [];
    var briefs = {};
    var facetSources = {};
    var fetchFailures = 0;
    var fetchAttempt = 0;
    var intentRef = null;
    var relevanceMissRepaired = false;

    function aborted() {
      return cancelFlag || myRun !== runId;
    }

    function attachTrace(result) {
      if (!result) return result;
      result.metrics = result.metrics || {};
      result.metrics.runTrace = state.runTrace
        ? JSON.parse(JSON.stringify(state.runTrace))
        : null;
      result.metrics.funnel = state.metrics && state.metrics.funnel
        ? Object.assign({}, state.metrics.funnel)
        : null;
      result.metrics.degradeReason =
        (state.metrics && state.metrics.degradeReason) || null;
      result.metrics.planSource =
        (state.metrics && state.metrics.planSource) || null;
      result.metrics.intentConfidence =
        (state.metrics && state.metrics.intentConfidence) || null;
      result.metrics.coverageBlocked = !!(
        state.metrics && state.metrics.coverageBlocked
      );
      result.metrics.fetchAttempt = fetchAttempt;
      return result;
    }

    // Reuse prepare captain intent when present; otherwise resolve once and write back.
    function applyIntent(intent) {
      if (aborted()) return;
      intentRef = intent;
      state.researchIntent = intent;
      // Formal path only — never invent a topic-only facet from local/blocked intent.
      if (isFormalModelIntent(intent) && intent.facets && intent.facets.length) {
        facets = facetsFromIntent(intent);
      } else if (!isFormalModelIntent(intent)) {
        facets = [];
      } else {
        facets = facets.map(function (f) {
          return Object.assign({}, f, {
            queries: f.queries && f.queries.length ? f.queries : [f.query || topic]
          });
        });
      }
      if (state.plan) {
        state.plan.facets = facets;
        state.plan.researchIntent = intent;
      }
      if (state.metrics && intent) {
        state.metrics.planSource = intent.planSource || 'local';
        state.metrics.intentConfidence = localIntentConfidence(intent);
      }
    }

    var preparedIntent =
      state.plan && isFormalModelIntent(state.plan.researchIntent)
        ? state.plan.researchIntent
        : null;
    var planReady = preparedIntent
      ? Promise.resolve(preparedIntent).then(function (intent) {
          state.progress.message = '沿用确认的队长规划…';
          emit(true);
          applyIntent(intent);
        })
      : resolveSemanticIntent(topic, 'faceted').then(applyIntent);

    return planReady.then(function () {
    if (aborted()) return getSnapshot();
    if (!facets.length) {
      state.plan.path = 'fast';
      return runFastPipeline(opts, myRun, topic, depth);
    }
    state.tasks = [
      makeTask({
        id: 'plan',
        kind: 'plan',
        subject:
          ((intentRef && intentRef.planSource) || 'local') === 'local'
            ? '本地队长规划'
            : '模型规划',
        status: 'completed',
        detail:
          ((intentRef && intentRef.planSource) || 'local') +
          (intentRef && intentRef.status === 'degraded'
            ? ' degraded'
            : ' ready')
      })
    ];
    facets.forEach(function (f) {
      state.tasks.push(
        makeTask({
          id: f.id + '_search',
          kind: 'search',
          facetId: f.id,
          subject: '搜索：' + f.label,
          deps: ['plan'],
          status: 'pending'
        })
      );
      state.tasks.push(
        makeTask({
          id: f.id + '_fetch',
          kind: 'fetch',
          facetId: f.id,
          subject: '阅读：' + f.label,
          deps: [f.id + '_search'],
          status: 'pending'
        })
      );
      state.tasks.push(
        makeTask({
          id: f.id + '_brief',
          kind: 'brief',
          facetId: f.id,
          subject: '简报：' + f.label,
          deps: [f.id + '_fetch'],
          status: 'pending'
        })
      );
    });
    state.tasks.push(
      makeTask({
        id: 'review',
        kind: 'review',
        subject: '简报审查',
        deps: facets.map(function (f) {
          return f.id + '_brief';
        }),
        status: 'pending'
      })
    );
    state.tasks.push(
      makeTask({
        id: 'synthesize',
        kind: 'synthesize',
        subject: '汇总成稿',
        deps: ['review'],
        status: 'pending'
      })
    );
    syncProgressTasks();
    state.progress.facets = facets.slice();
    var allQueries = [];
    facets.forEach(function (f) {
      (f.queries || [f.query]).forEach(function (q) {
        uniquePush(allQueries, q, 24);
      });
    });
    state.progress.queries = allQueries;

    function fetchPickedHits(f, picked, fid) {
          var chain = Promise.resolve();
          var local = [];
          picked.forEach(function (hit) {
            chain = chain.then(function () {
          if (aborted()) return;
          if (!hit || !hit.url) {
            traceEvent('fetch_skip', { facetId: f.id, reason: 'missing_url' });
            return;
          }
          if (!ledgerCan('fetch', 1)) {
            traceEvent('fetch_skip', { facetId: f.id, reason: 'budget', url: hit.url });
            return;
          }
          fetchAttempt += 1;
          bumpFunnel('fetchAttempt', 1);
          if (state.metrics) state.metrics.fetchAttempt = fetchAttempt;
              return fetchUrl(hit.url)
                .then(function (page) {
              var urlKey = String((page && page.url) || hit.url || '').trim();
              var prior = allSources.filter(function (s) {
                return s && s.url && s.url === urlKey;
              })[0];
              if (prior) {
                local.push(prior);
                traceEvent('fetch', {
                  ok: true,
                  facetId: f.id,
                  url: prior.url,
                  deduped: true
                });
                return;
              }
                  sourceSeq += 1;
                  var row = {
                    id: 'S' + sourceSeq,
                    title: page.title || hit.title || hit.url,
                url: urlKey || hit.url,
                    snippet: hit.snippet || '',
                    fetchedAt: page.fetchedAt || new Date().toISOString(),
                    text: page.text || '',
                    facetId: f.id,
                    usedInSections: []
                  };
                  local.push(row);
                  allSources.push(row);
                  state.progress.liveSources = allSources.map(function (s) {
                    return {
                      id: s.id,
                      title: s.title,
                      url: s.url,
                      state: s.fetchedAt ? 'ok' : 'snippet',
                      snippet: s.snippet
                    };
                  });
              state.progress.sourcesFound = Math.max(
                state.progress.sourcesFound || 0,
                leadHits.length
              );
                  state.progress.sourcesFetched = allSources.length;
              traceEvent('fetch', { ok: true, facetId: f.id, url: row.url });
                  emit();
                })
                .catch(function (e) {
                  fetchFailures += 1;
              traceEvent('fetch', {
                ok: false,
                facetId: f.id,
                url: hit.url,
                error: String((e && (e.code || e.message)) || 'unknown').slice(0, 80)
              });
                  setTaskStatus(fid, 'running', {
                    attemptId: 1,
                detail:
                  local.length +
                  ' sources; fetch failed: ' +
                      String((e && (e.code || e.message)) || 'unknown').slice(0, 80)
                  });
                });
            });
          });
          return chain.then(function () {
        return local;
            });
    }

    function briefFacet(f, local, bid) {
      if (!local.length) {
        briefs[f.id] = {
          facts: [],
          openQuestions: ['本面无有效来源'],
          sourceIds: []
        };
        setTaskStatus(bid, 'completed', { attemptId: 1, detail: 'no sources' });
        return Promise.resolve();
      }
      setTaskStatus(bid, 'running', { attemptId: 1 });
      setStatus(STATUSES.briefing, { phase: 'briefing', message: '简报：' + f.label });
      var srcBlock = local
        .map(function (s) {
          return (
            '[' +
            s.id +
            '] ' +
            s.title +
            '\n' +
            String(s.text || s.snippet || '').slice(0, 1800)
          );
        })
        .join('\n\n');
      var briefMessages = [
        {
          role: 'system',
          content:
            '你是调查面简报员。只根据给定来源输出 JSON：' +
            '{"facts":[{"text":"...","sourceId":"S1"}],"openQuestions":["..."],"sourceIds":["S1"]}。' +
            'facts 必须带真实 sourceId；不得编造 URL；未知原因保持未知。'
        },
        {
          role: 'user',
          content:
            '调查面：' +
            f.label +
            '\n要点：' +
            (f.keyPoints || []).join('、') +
            '\n主题：' +
            topic +
            '\n\n来源：\n' +
            srcBlock
        }
      ];
      function runBrief(opts) {
        return chatOnceWithRetry(
          briefMessages,
          Object.assign({ maxTokens: 800, purpose: 'brief' }, opts || {})
        );
      }
      // Prefer ledger; if reserved for synth, still ask model (Controller-tracked retry).
      var first = ledgerCanOptionalModel(1, { reserveSynth: true })
        ? runBrief({})
        : runBrief({ skipLedger: true });
      return first
        .then(function (chat) {
          var brief = { facts: [], openQuestions: [], sourceIds: [] };
          try {
            var m = String((chat && chat.text) || '').match(/\{[\s\S]*\}/);
            if (m) brief = JSON.parse(m[0]);
          } catch (_) {}
          if (!brief.facts || !brief.facts.length) {
            brief = passthroughBriefFromSources(local);
          }
          briefs[f.id] = brief;
          setTaskStatus(bid, 'completed', {
            attemptId: 1,
            outputs: brief,
            detail:
              ((brief.facts && brief.facts.length) || 0) +
              (brief.passthrough ? ' passthrough' : ' facts')
          });
        })
        .catch(function () {
          // Model unavailable — secondary processing: hand excerpts to synth.
          briefs[f.id] = passthroughBriefFromSources(local);
          setTaskStatus(bid, 'completed', {
            attemptId: 1,
            detail: 'brief passthrough'
          });
        });
    }

    function runOneFacet(f) {
      if (aborted()) return Promise.resolve();
      var sid = f.id + '_search';
      var fid = f.id + '_fetch';
      var bid = f.id + '_brief';
      var facetQueries =
        f.queries && f.queries.length ? f.queries.slice() : [f.query || topic];
      setTaskStatus(sid, 'running', { attemptId: 1 });
      setStatus(STATUSES.searching, {
        phase: 'searching',
        message: '搜索调查面：' + f.label
      });
      emit(true);

      // First query now; additional queries filled by global round-robin pass.
      var q0 = facetQueries[0];
      return searchWeb(q0, 5)
        .catch(function () {
          return [];
        })
        .then(function (hits) {
          if (aborted()) return;
          var raw = hits || [];
          raw.forEach(function (hit) {
            if (hit && hit.url) leadHits.push(Object.assign({}, hit, { facetId: f.id }));
          });
          bumpFunnel('rawHits', raw.length);
          var formalFacet = isFormalModelIntent(intentRef);
          var ranked = rankHitsForIntent(raw, intentRef, f, {
            strictAliases:
              !formalFacet &&
              !!(
                intentRef &&
                intentRef.entities &&
                intentRef.entities.some(function (e) {
                  return e && e.aliases && e.aliases.length;
                })
              ),
            formalModel: !!formalFacet
          });
          bumpFunnel('relevantHits', ranked.relevantHits);
          var tokList = (ranked.tokens && ranked.tokens.soft) || facetQueries;
          var allowLocalRankFallback =
            depth.id === 'quick' || (state.plan && state.plan.path === 'fast');
          // Formal path: model URL set is final — no silent local_rank_fallback.
          var pickPromise = formalFacet
            ? modelPickSearchHits(raw, topic, intentRef, f, {
                skipLedger: true,
                withRetry: true
              })
            : Promise.resolve(null);
          return pickPromise.then(function (pickResult) {
          var modelPicked =
            pickResult && pickResult.status === 'ok' ? pickResult.hits || [] : [];
          var picked;
          var localRankFallback = false;
          if (modelPicked.length) {
            // Fetch model URLs only — dedupe + https + budget truncate; no selectBalancedHits.
            var seenPick = {};
            picked = modelPicked
              .filter(function (h) {
                if (!h || !h.url) return false;
                if (!/^https?:\/\//i.test(h.url)) return false;
                if (seenPick[h.url]) return false;
                seenPick[h.url] = true;
                return true;
              })
              .slice(0, 3);
            traceEvent('model_pick_ok', {
              facetId: f.id,
              modelPickedUrls: picked.map(function (h) {
                return h.url;
              }),
              finalFetchUrls: picked.map(function (h) {
                return h.url;
              }),
              localDroppedAfterModelPick: []
            });
          } else if (formalFacet && !allowLocalRankFallback) {
            picked = [];
            var failKind =
              pickResult && pickResult.status === 'failed'
                ? 'model_pick_failed'
                : 'model_pick_empty';
            traceEvent(failKind, {
              facetId: f.id,
              gated: (pickResult && pickResult.gated) || 0,
              local_rank_fallback: false
            });
            if (state.metrics) {
              state.metrics.modelPickFailed = true;
              state.metrics.search_leads_only = true;
            }
          } else {
            picked = selectBalancedHits(ranked.hits, 3, tokList);
            localRankFallback = formalFacet && allowLocalRankFallback;
            if (localRankFallback) {
              if (state.metrics) {
                state.metrics.local_rank_fallback = true;
                state.metrics.localRankFallbackAnnotated = true;
              }
              traceEvent('local_rank_fallback', {
                facetId: f.id,
                reason: 'quick_or_fast',
                annotated: true
              });
            }
          }
          bumpFunnel('pickedHits', picked.length);
          traceEvent('filter', {
            facetId: f.id,
            query: q0,
            rawHits: ranked.rawHits,
            relevantHits: ranked.relevantHits,
            pickedHits: picked.length,
            dropReasons: ranked.dropReasons || {},
            modelPick: !!modelPicked.length,
            local_rank_fallback: !!localRankFallback
          });
          setTaskStatus(sid, 'completed', {
            attemptId: 1,
            detail:
              'raw=' +
              ranked.rawHits +
              ' relevant=' +
              ranked.relevantHits +
              ' picked=' +
              picked.length +
              (modelPicked.length
                ? ' modelPick'
                : localRankFallback
                  ? ' local_rank_fallback'
                  : formalFacet
                    ? ' search_leads_only'
                    : '')
          });
          state.progress.sourcesFound = leadHits.length;

          // Prefer post-review coverage gate when captain has user aspects —
          // do not burn the single repairRounds slot on early relevance_miss.
          var afterRank = Promise.resolve(picked);
          var saveRepairForGate =
            intentRef && intentRef.aspects && intentRef.aspects.length > 0;
          var thinFunnel =
            (!picked.length || ranked.relevantHits === 0) &&
            (raw.length > 0 || !picked.length);
          if (
            thinFunnel &&
            !relevanceMissRepaired &&
            !saveRepairForGate &&
            ledgerCan('repair', 1) &&
            ledgerCan('search', 1)
          ) {
            if (spendRepair('relevance_miss', { facetId: f.id, query: q0 })) {
              relevanceMissRepaired = true;
              var usedMiss = (state.progress.queries || []).concat([q0]);
              facets.forEach(function (fx) {
                (fx.queries || []).forEach(function (qq) {
                  usedMiss.push(qq);
                });
              });
              var covMiss = buildCoverageMatrix(intentRef, []);
              var heuristicQs = buildRepairQueriesFromCoverage(
                covMiss,
                intentRef,
                usedMiss
              );
              state.progress.message = '检索过稀，模型改写补搜…';
              emit();
              afterRank = rewriteSearchQueries(
                topic,
                intentRef,
                usedMiss,
                ranked.dropReasons || {}
              )
                .then(function (rewritten) {
                  var rewrite =
                    (rewritten && rewritten[0]) ||
                    heuristicQs[0] ||
                    normalizeResearchQuery(String(topic).slice(0, 40));
                  var reason =
                    rewritten && rewritten[0] ? 'model_rewrite' : 'relevance_miss';
                  state.progress.message =
                    '覆盖缺口补搜：' + String(rewrite).slice(0, 40);
                  emit();
                  return searchWeb(rewrite, 5)
                    .catch(function () {
                      return [];
                    })
                    .then(function (hits2) {
                      (hits2 || []).forEach(function (hit) {
                        if (hit && hit.url)
                          leadHits.push(
                            Object.assign({}, hit, { facetId: f.id })
                          );
                      });
                      bumpFunnel('rawHits', (hits2 || []).length);
                      var ranked2 = rankHitsForIntent(hits2 || [], intentRef, f, {
                        strictAliases: false
                      });
                      bumpFunnel('relevantHits', ranked2.relevantHits);
                      var picked2 = selectBalancedHits(
                        ranked2.hits,
                        3,
                        ranked2.tokens.soft
                      );
                      bumpFunnel('pickedHits', picked2.length);
                      traceEvent('repair_search', {
                        reason: reason,
                        coverage: 'missing_subject',
                        query: rewrite,
                        pickedHits: picked2.length
                      });
                      return picked2.length ? picked2 : picked;
                    });
                });
            }
          }

          return afterRank.then(function (finalPicked) {
            setTaskStatus(fid, 'running', { attemptId: 1 });
            setStatus(STATUSES.fetching, {
              phase: 'fetching',
              message: '阅读调查面：' + f.label
            });
            return fetchPickedHits(f, finalPicked, fid).then(function (local) {
              facetSources[f.id] = annotateSourceReadState(local);
              setTaskStatus(fid, 'completed', {
                attemptId: 1,
                detail:
                  local.length +
                  ' sources; fetchAttempt facet done'
              });
              return briefFacet(f, local, bid);
            });
          });
          });
        });
    }

    function runFacetQueue(list, concurrency) {
      var i = 0;
      var active = 0;
      return new Promise(function (resolve) {
        function pump() {
          if (aborted()) {
            resolve();
            return;
          }
          while (active < concurrency && i < list.length) {
            (function (facet) {
              active += 1;
              runOneFacet(facet).then(function () {
                active -= 1;
                if (i >= list.length && active === 0) resolve();
                else pump();
              });
            })(list[i++]);
          }
          if (i >= list.length && active === 0) resolve();
        }
        pump();
      });
    }

    function runExtraRoundRobinQueries() {
      // After each facet's queries[0], allocate queries[1..] fairly while search budget remains.
      var jobs = buildRoundRobinSearches(facets, (state.ledger && state.ledger.caps.search) || 8).filter(
        function (j) {
          return j.queryIndex > 0;
        }
      );
      var chain = Promise.resolve();
      jobs.forEach(function (job) {
        chain = chain.then(function () {
          if (aborted() || !ledgerCan('search', 1)) return;
          var f = facets.filter(function (x) {
            return x.id === job.facetId;
          })[0];
          if (!f) return;
          state.progress.message =
            '补搜 ' + f.label + '：' + String(job.query).slice(0, 40);
          emit();
          return searchWeb(job.query, 4)
            .catch(function () {
              return [];
            })
            .then(function (hits) {
              var raw = hits || [];
              raw.forEach(function (hit) {
                if (hit && hit.url)
                  leadHits.push(Object.assign({}, hit, { facetId: f.id }));
              });
              bumpFunnel('rawHits', raw.length);
              var ranked = rankHitsForIntent(raw, intentRef, f, { strictAliases: false });
              bumpFunnel('relevantHits', ranked.relevantHits);
              var picked = selectBalancedHits(ranked.hits, 2, ranked.tokens.soft);
              bumpFunnel('pickedHits', picked.length);
              traceEvent('search_extra', {
                facetId: f.id,
                query: job.query,
                queryIndex: job.queryIndex,
                pickedHits: picked.length
              });
              if (!picked.length || !ledgerCan('fetch', 1)) return;
              return fetchPickedHits(f, picked, f.id + '_fetch').then(function (local) {
                if (local.length) {
                  facetSources[f.id] = (facetSources[f.id] || []).concat(
                    annotateSourceReadState(local)
                  );
                }
              });
            });
        });
      });
      return chain;
    }

    return runFacetQueue(facets, parallel)
      .then(function () {
        if (aborted()) return null;
        return runExtraRoundRobinQueries();
      })
      .then(function () {
        if (aborted()) return null;
        setTaskStatus('review', 'running', { attemptId: 1 });
        setStatus(STATUSES.reviewing, {
          phase: 'reviewing',
          message: '审查各调查面简报…'
        });
        emit(true);
        var gaps = [];
        facets.forEach(function (f) {
          var b = briefs[f.id] || {};
          var facts = b.facts || [];
          if (!facts.length) {
            gaps.push({ facetId: f.id, critical: true, note: f.label + '缺少可用证据' });
          }
          (b.openQuestions || []).forEach(function (q) {
            if (/结论|是否|适合|必须|关键/.test(String(q))) {
              gaps.push({ facetId: f.id, critical: true, note: String(q) });
            } else {
              gaps.push({ facetId: f.id, critical: false, note: String(q) });
            }
          });
        });
        var reviewPromise = Promise.resolve({ gaps: gaps, suggestedQueries: [] });
        if (ledgerCanOptionalModel(1, { reserveSynth: true })) {
          var reviewMaterial = facets.map(function (f) {
            return '调查面：' + f.label + '\n简报：' + JSON.stringify(briefs[f.id] || {});
          }).join('\n\n');
          reviewPromise = chatOnce([
            {
              role: 'system',
              content:
                '你是调研审查员。只审查给定简报，不补写事实。输出 JSON：' +
                '{"gaps":[{"facetId":"...","critical":true,"note":"..."}],"suggestedQueries":["..."]}。' +
                'critical 只用于会改变最终答案的缺口；无公开依据的原因应标为未知，不要编造。'
            },
            { role: 'user', content: '主题：' + topic + '\n' + reviewMaterial }
          ], { maxTokens: 900 }).then(function (chat) {
            var parsed = { gaps: [], suggestedQueries: [] };
            try {
              var m = String(chat.text || '').match(/\{[\s\S]*\}/);
              if (m) parsed = JSON.parse(m[0]);
            } catch (_) {}
            if (!Array.isArray(parsed.gaps)) parsed.gaps = [];
            if (!Array.isArray(parsed.suggestedQueries)) parsed.suggestedQueries = [];
            return parsed;
          }).catch(function () {
            return { gaps: gaps, suggestedQueries: [] };
          });
        }
        var repairPromise = Promise.resolve();
        return reviewPromise.then(function (review) {
          var reviewGaps = Array.isArray(review.gaps) && review.gaps.length ? review.gaps : gaps;
          var reviewCritical = reviewGaps.filter(function (g) { return g && g.critical; });
          var zeroFactFacets = facets.filter(function (f) {
            var b = briefs[f.id] || {};
            return !(b.facts && b.facts.length);
          });
          zeroFactFacets.forEach(function (f) {
            reviewGaps.push({
              facetId: f.id,
              critical: true,
              note: (f.aspect || f.label) + '缺少可用事实'
            });
          });
          reviewCritical = reviewGaps.filter(function (g) {
            return g && g.critical;
          });
          var covEv = buildCoverageMatrix(
            intentRef,
            allSources.concat(
              Object.keys(facetSources).reduce(function (acc, k) {
                return acc.concat(facetSources[k] || []);
              }, [])
            )
          );
          var covNeedsRepair = covEv.some(function (c) {
            return c && !c.ok;
          });
          var facetFail =
            zeroFactFacets.length > 0 ||
            facets.some(function (f) {
              return !(facetSources[f.id] && facetSources[f.id].length);
            });
          if (
            (reviewCritical.length || covNeedsRepair || facetFail) &&
            ledgerCan('repair', 1) &&
            ledgerCan('search', 1) &&
            ledgerCan('fetch', 1) &&
            spendRepair('evidence_gap', {
              note:
                (reviewCritical[0] && reviewCritical[0].note) ||
                (covEv.filter(function (c) {
                  return c && !c.ok;
                })[0] ||
                  {}
                ).gapNote ||
                'coverage_gate'
            })
          ) {
            var g0 = reviewCritical[0] || { facetId: (covEv[0] && covEv[0].facetId) || '' };
            var facet = facets.filter(function (f) { return f.id === g0.facetId; })[0] || facets[0];
            var usedEv = (state.progress.queries || []).slice();
            facets.forEach(function (fx) {
              (fx.queries || []).forEach(function (qq) {
                usedEv.push(qq);
              });
            });
            var covQs = buildRepairQueriesFromCoverage(covEv, intentRef, usedEv);
            var primaryEnt2 = pickPrimarySearchEntity(
              (intentRef && intentRef.entities) || []
            );
            var compareSides2 = compareProductEntities(
              (intentRef && intentRef.entities) || [],
              topic
            );
            function queryNamesEntity(q) {
              var s = String(q || '');
              if (compareSides2.length >= 2) {
                return compareSides2.some(function (p) {
                  return blobHasToken(s, s.toLowerCase(), p.name);
                });
              }
              return primaryEnt2 && blobHasToken(s, s.toLowerCase(), primaryEnt2.name);
            }
            // Model-first repair: rewrite → review suggestion → thin local name fallback.
            repairPromise = rewriteSearchQueries(
              topic,
              intentRef,
              usedEv,
              { evidence_gap: 1 }
            ).then(function (rewritten) {
            var suggested =
              (rewritten && rewritten[0]) ||
              covQs[0] ||
              '';
            var modelSug =
              review.suggestedQueries && review.suggestedQueries[0]
                ? String(review.suggestedQueries[0]).trim()
                : '';
            if (
              modelSug &&
              modelSug.length <= 60 &&
              !/缺少|未找到|无法|不确定|没有公开|待核实|gap/i.test(modelSug) &&
              queryNamesEntity(modelSug) &&
              usedEv.indexOf(normalizeResearchQuery(modelSug)) < 0
            ) {
              suggested = modelSug;
            }
            if (!suggested) {
              suggested =
                (primaryEnt2 && primaryEnt2.name) ||
                facet.query ||
                topic;
            }
            var q = normalizeResearchQuery(suggested);
            state.progress.message = '覆盖缺口补查：' + String(q).slice(0, 40);
            emit();
            traceEvent('repair_search', {
              reason: rewritten && rewritten[0] ? 'model_rewrite' : 'evidence_gap',
              coverage: (covEv[0] && covEv[0].gapType) || 'thin_evidence',
              query: q
            });
            return searchWeb(q, 3)
              .then(function (hits) {
                var ranked = rankHitsForIntent(hits || [], intentRef, facet, {
                  strictAliases: false
                });
                var hit = ranked.hits.filter(function (h) {
                  return h && h.url;
                })[0];
              if (!hit) return;
                fetchAttempt += 1;
                bumpFunnel('fetchAttempt', 1);
              return fetchUrl(hit.url).then(function (page) {
                if (!page || !page.text) return;
                sourceSeq += 1;
                  allSources.push({
                    id: 'S' + sourceSeq,
                    title: page.title || hit.title,
                    url: page.url || hit.url,
                    snippet: hit.snippet || '',
                    fetchedAt: page.fetchedAt || new Date().toISOString(),
                    text: page.text,
                    facetId: facet.id,
                    usedInSections: []
                  });
                });
              })
              .catch(function () {});
            });
          }
          return repairPromise.then(function () {
          gaps = reviewGaps;
          var covAfter = buildCoverageMatrix(
            intentRef,
            allSources.concat(
              Object.keys(facetSources).reduce(function (acc, k) {
                return acc.concat(facetSources[k] || []);
              }, [])
            )
          );
          var stillBlocked =
            covAfter.some(function (c) {
              return c && !c.ok;
            }) ||
            facets.some(function (f) {
              var b = briefs[f.id] || {};
              return !(b.facts && b.facts.length) && !(facetSources[f.id] && facetSources[f.id].length);
            });
          if (stillBlocked && state.metrics) {
            state.metrics.coverageBlocked = true;
          }
          setTaskStatus('review', 'completed', {
            attemptId: 1,
            detail:
              gaps.length +
              ' gaps' +
              (stillBlocked ? ' · coverageBlocked' : '')
          });
          var softGaps = gaps
            .filter(function (g) {
              return !g.critical;
            })
            .map(function (g) {
              return g.note;
            });
          if (stillBlocked) {
            softGaps = ['覆盖门闩：部分调查面仍缺实质证据'].concat(softGaps);
          }

          var zeroFactFacets = facets.some(function (f) {
            var b = briefs[f.id] || {};
            return !(b.facts && b.facts.length);
          });
          var funnel = (state.metrics && state.metrics.funnel) || {};
          var rawHitsN = Number(funnel.rawHits) || 0;
          var pickedHitsN = Number(funnel.pickedHits) || 0;
          var authorityDigNote = '';
          var authorityDigPromise = Promise.resolve();
          var missingPartners = missingComparePartners(allSources, intentRef);
          var needsAuthDig = corpusNeedsAuthorityDig(allSources, {
            coverageBlocked: stillBlocked,
            zeroFactFacets: zeroFactFacets,
            pickedMiss: pickedHitsN === 0,
            rawHits: rawHitsN,
            missingPartners: missingPartners,
            shallowPlay: corpusMostlyShallowPlay(allSources)
          });
          if (
            needsAuthDig &&
            ledgerCan('search', 1) &&
            ledgerCan('fetch', 1) &&
            spendRepair('authority_dig', { sources: allSources.length })
          ) {
            state.progress.message = '权威源下探…';
            emit();
            authorityDigPromise = planAuthorityDigQueries(
              topic,
              intentRef,
              allSources,
              state.progress.queries
            ).then(function (digQs) {
              if (aborted() || !digQs || !digQs.length) return;
              digQs.forEach(function (q) {
                uniquePush(state.progress.queries, q, 24);
              });
              var digHits = [];
              var digChain = Promise.resolve();
              digQs.slice(0, 3).forEach(function (q) {
                digChain = digChain.then(function () {
                  if (aborted() || !ledgerCan('search', 1)) return;
                  return searchWeb(q, 5)
                    .catch(function () {
                      return [];
                    })
                    .then(function (hits) {
                      (hits || []).forEach(function (h) {
                        if (h && h.url) digHits.push(h);
                      });
                      traceEvent('repair_search', {
                        reason: 'authority_dig',
                        query: q,
                        hits: (hits && hits.length) || 0
                      });
                    });
                });
              });
              return digChain.then(function () {
                var digProducts = compareProductEntities(
                  (intentRef && intentRef.entities) || [],
                  topic
                );
                var primary = pickPrimarySearchEntity(
                  (intentRef && intentRef.entities) || []
                );
                var primaryName = primary ? primary.name : '';
                var ranked = digHits.filter(function (h) {
                  if (!h || !h.url) return false;
                  if (
                    allSources.some(function (s) {
                      return s && s.url === h.url;
                    })
                  ) {
                    return false;
                  }
                  if (isDictionaryTrapHit(h, topic)) return false;
                  if (isOffTopicNoiseSource(h, intentRef || { originalQuestion: topic })) {
                    return false;
                  }
                  // Compare dig: accept hits that mention ANY product side.
                  if (digProducts.length >= 2) {
                    return hitMentionsAnyEntity(h, digProducts);
                  }
                  if (primaryName) {
                    var blob =
                      String(h.title || '') +
                      ' ' +
                      String(h.snippet || '') +
                      ' ' +
                      String(h.url || '');
                    if (!blobHasToken(blob, blob.toLowerCase(), primaryName)) {
                      return false;
                    }
                  }
                  return true;
                });
                // Prefer third-party / docs; demote play pages then dictionary leftovers.
                ranked.sort(function (a, b) {
                  var sa = isShallowPlayPageHit(a) ? 2 : isThirdPartyAuthorityHost(sourceHostKey(a.url)) ? 0 : 1;
                  var sb = isShallowPlayPageHit(b) ? 2 : isThirdPartyAuthorityHost(sourceHostKey(b.url)) ? 0 : 1;
                  return sa - sb;
                });
                var pick = ranked.slice(0, 5);
                var fetchChain = Promise.resolve();
                pick.forEach(function (hit) {
                  fetchChain = fetchChain.then(function () {
                    if (aborted() || !ledgerCan('fetch', 1)) return;
                    fetchAttempt += 1;
                    bumpFunnel('fetchAttempt', 1);
                    return fetchUrl(hit.url)
                      .then(function (page) {
                        sourceSeq += 1;
                        var row = {
                          id: 'S' + sourceSeq,
                          title: page.title || hit.title || hit.url,
                          url: page.url || hit.url,
                          snippet: hit.snippet || '',
                          fetchedAt: page.fetchedAt || new Date().toISOString(),
                          text: page.text || '',
                          facetId: 'authority_dig',
                          usedInSections: []
                        };
                        allSources.push(row);
                        leadHits.push(
                          Object.assign({}, hit, { facetId: 'authority_dig' })
                        );
                        traceEvent('fetch', {
                          ok: true,
                          facetId: 'authority_dig',
                          url: row.url,
                          reason: 'authority_dig'
                        });
                      })
                      .catch(function (e) {
                        fetchFailures += 1;
                        traceEvent('fetch', {
                          ok: false,
                          facetId: 'authority_dig',
                          url: hit.url,
                          reason: 'authority_dig',
                          error: String(
                            (e && (e.code || e.message)) || 'unknown'
                          ).slice(0, 80)
                        });
                      });
                  });
                });
                return fetchChain.then(function () {
                  authorityDigNote =
                    '已完成一轮权威源下探；请大胆组织已抓材料写清机制与对照框架，禁止套话与编造。';
                  if (state.metrics) state.metrics.authorityDig = true;
                  state.progress.sourcesFetched = allSources.length;
                  emit();
                });
              });
            });
          } else if (needsAuthDig) {
            traceEvent('repair_skip', {
              reason: 'authority_dig',
              detail: 'budget_or_ledger'
            });
          }

          return authorityDigPromise.then(function () {
          if (softGaps.length && state.metrics) {
            state.metrics.coverageGaps = softGaps.slice(0, 8);
          }

          // Last-chance body fetch: don't synthesize on snippets if ledger still allows.
          var bodyCount = allSources.filter(sourceHasUsableBody).length;
          var salvagePromise = Promise.resolve();
          if (bodyCount < 2 && leadHits.length && ledgerCan('fetch', 1)) {
            var haveUrl = {};
            allSources.forEach(function (s) {
              if (sourceHasUsableBody(s)) haveUrl[s.url] = true;
            });
            var salvageHits = [];
            var salvageIntent = intentRef || { originalQuestion: topic };
            leadHits.forEach(function (h) {
              if (!h || !h.url || haveUrl[h.url] || salvageHits.length >= 4) return;
              if (isDictionaryTrapHit(h, topic)) return;
              if (isOffTopicNoiseSource(h, salvageIntent)) return;
              salvageHits.push(h);
              haveUrl[h.url] = true;
            });
            if (salvageHits.length) {
              state.progress.message = '成稿前补抓正文…';
              emit();
              var salvageChain = Promise.resolve();
              salvageHits.forEach(function (hit) {
                salvageChain = salvageChain.then(function () {
                  if (aborted() || !ledgerCan('fetch', 1)) return;
                  fetchAttempt += 1;
                  bumpFunnel('fetchAttempt', 1);
                  return fetchUrl(hit.url)
                    .then(function (page) {
                      if (!page || String(page.text || '').trim().length < 40) return;
                      sourceSeq += 1;
                      allSources.push({
                        id: 'S' + sourceSeq,
                        title: page.title || hit.title || hit.url,
                        url: page.url || hit.url,
                        snippet: hit.snippet || '',
                        fetchedAt: page.fetchedAt || new Date().toISOString(),
                        text: page.text || '',
                        facetId: hit.facetId || 'salvage_fetch',
                        usedInSections: []
                      });
                      traceEvent('fetch', {
                        ok: true,
                        url: page.url || hit.url,
                        reason: 'salvage_before_synth'
                      });
                    })
                    .catch(function (e) {
                      fetchFailures += 1;
                      traceEvent('fetch', {
                        ok: false,
                        url: hit.url,
                        reason: 'salvage_before_synth',
                        error: String((e && (e.code || e.message)) || 'unknown').slice(0, 80)
                      });
                    });
                });
              });
              salvagePromise = salvageChain.then(function () {
                state.progress.sourcesFetched = allSources.length;
                if (state.metrics) state.metrics.salvageFetch = true;
                emit();
              });
            }
          }

          return salvagePromise.then(function () {
          setTaskStatus('synthesize', 'running', { attemptId: 1 });
          setStatus(STATUSES.synthesizing, {
            phase: 'synthesizing',
            message: '汇总成稿…'
          });
          var noiseIntent2 = intentRef || { originalQuestion: topic };
          var formalKeep2 = isFormalModelIntent(noiseIntent2);
          var annotated = annotateSourceReadState(
            keepSourcesForSynthesis(allSources, noiseIntent2, { formal: formalKeep2 })
          );
          var leadOnly = false;
          if (!annotated.length) {
            annotated = annotateSourceReadState(
              keepSourcesForSynthesis(
                buildSnippetLeadSources(leadHits, 8, sourceSeq),
                noiseIntent2,
                { formal: formalKeep2 }
              )
            );
            leadOnly = annotated.length > 0;
          } else if (
            annotated.every(function (s) {
              return s.readState === 'snippet';
            })
          ) {
            leadOnly = true;
          }
          if (!annotated.length) {
            var empty = attachTrace(
              emptyNoSourceResult(
                topic,
                state.progress.queries,
                depth.id,
                fetchAttempt
                  ? '正文读取失败且无可用摘要'
                  : '未找到相关结果'
              )
            );
            empty.metrics = empty.metrics || {};
            empty.metrics.coverageGaps = softGaps.slice(0, 8);
            empty.metrics.fetchFail = fetchFailures;
            empty.metrics.fetchAttempt = fetchAttempt;
            empty.limitations = (empty.limitations || []).concat([
              '抓取尝试：' + fetchAttempt + '；失败：' + fetchFailures + '。'
            ]);
            finalizeMetrics(empty);
            setTaskStatus('synthesize', 'completed', { attemptId: 1, detail: 'completed_without_sources' });
            state.result = empty;
            state.status = empty.status;
            state.progress.message = statusLabel(empty.status);
            state.error = null;
            traceEvent('run_end', { status: empty.status });
            emit(true);
            return getSnapshot();
          }
          var briefText = facets
            .map(function (f) {
              return (
                '### ' +
                f.label +
                '\n' +
                JSON.stringify(briefs[f.id] || {})
              );
            })
            .join('\n\n');
          var briefModes = {};
          facets.forEach(function (fx) {
            var b = briefs[fx.id];
            briefModes[fx.id] = b && b.passthrough
              ? b.mode || 'fallback_source_excerpt'
              : 'model_brief';
          });
          traceEvent('synthesis_input', {
            sources: (annotated || []).map(function (s) {
              var excerpt = String((s && (s.text || s.snippet)) || '').trim();
              return {
                id: s && s.id,
                url: s && s.url,
                readState: s && s.fetchedAt ? 'fetched' : excerpt ? 'snippet' : 'empty',
                excerptChars: excerpt.length
              };
            }),
            briefModes: briefModes
          });
          var system = buildSynthesisSystemPrompt(annotated, topic, state.progress.queries);
          var user =
            '调研主题：' +
            topic +
            '\nresearchGoal：' +
            ((intentRef && intentRef.researchGoal) || '') +
            '\nphenomenon：' +
            ((intentRef && intentRef.phenomenon) || '') +
            '\n用户条件：' +
            JSON.stringify(state.config.userConditions || state.plan.userConditions || {}) +
            '\n各面简报：\n' +
            briefText +
            (authorityDigNote ? '\n' + authorityDigNote : '') +
            (leadOnly
              ? '\n重要：当前多为搜索摘要。直接回答仍须干货先行：把摘要里每一个具体事实（产品定位、能力点、国内外命名/下载差异等）写进 executiveAnswer；材料边界一句带过；禁止把直接回答写成「无法确认」说明；不得编造。'
              : '\n直接回答干货先行；取得正文不等于事实已核实；无来源的国内/数字/合规断言不得写成事实。') +
            '\n请只输出 ResearchDocument JSON：含 title、executiveAnswer、blocks、claims、uncertainties、limitations。executiveAnswer 必须具体；禁止「无法直接回答+仍待核实+调研限制」三板斧；不得输出完整 HTML；不得编造 URL。';
          var facetedSynthMessages = [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ];
          return chatOnceWithRetry(facetedSynthMessages, {
            maxTokens: 8192,
            purpose: 'synthesis'
          }).catch(function (e) {
              if (aborted()) return getSnapshot();
              var err = classifyModelFailure(e);
              if (annotated && annotated.length) {
                var kept = attachTrace(
                  buildSourcesKeptResult({
                    topic: topic,
                    sources: annotated,
                    queries: state.progress.queries,
                    depth: depth.id,
                    fetchFailures: fetchFailures,
                    reason: err.code || err.message || 'model_error'
                  })
                );
                kept.metrics = kept.metrics || {};
                if (softGaps.length) {
                  kept.metrics.coverageGaps = softGaps.slice(0, 8);
                }
                finalizeMetrics(kept);
                setTaskStatus('synthesize', 'completed', {
                  attemptId: 1,
                  detail: 'synth_failed_sources_kept'
                });
                state.result = kept;
                state.status = kept.status || STATUSES.completed_with_sources;
                state.error = {
                  code: err.code || 'model_error',
                  message:
                    '模型整理失败，已保留 ' +
                    annotated.length +
                    ' 条来源：' +
                    (err.message || err.code || 'model_error')
                };
                state.progress.message =
                  statusLabel(state.status) + ' · 模型失败，已保留来源';
                traceEvent('run_end', {
                  status: state.status,
                  reason: 'synth_failed_sources_kept',
                  errorCode: err.code
                });
                emit(true);
                return { __kept: true };
              }
              throw e;
            })
            .then(function (chat) {
            if (aborted()) return getSnapshot();
            if (!chat || chat.__kept) return getSnapshot();
            // catch path already emitted a kept snapshot (or aborted).
            if (!chat || typeof chat.text !== 'string') return getSnapshot();
            var result = attachTrace(
              buildResultFromSynthesis({
              markdown: chat.text,
              sources: annotated,
              topic: topic,
              model: chat.model,
              queries: state.progress.queries,
              depth: depth.id,
              fetchFailures: fetchFailures
                })
              );
            result.metrics = result.metrics || {};
            if (softGaps.length) {
              result.metrics.coverageGaps = softGaps.slice(0, 8);
            }
            finalizeMetrics(result);
            setTaskStatus('synthesize', 'completed', { attemptId: 1 });
            state.result = result;
            state.status = result.status;
            state.progress.message = leadOnly
              ? statusLabel(result.status) + ' · 仅获得摘要'
              : statusLabel(result.status);
            state.error = null;
            traceEvent('run_end', { status: state.status, leadOnly: leadOnly });
            emit(true);
            return getSnapshot();
          });
          });
          });
          });
        });
      })
      .catch(function (e) {
        if (aborted()) {
          state.status = STATUSES.idle;
          state.error = { code: 'cancelled', message: '已取消' };
          traceEvent('run_end', { status: 'cancelled' });
          emit(true);
          return getSnapshot();
        }
        state.status = STATUSES.failed;
        state.error = {
          code: (e && e.code) || 'failed',
          message: String((e && e.message) || e || 'failed')
        };
        state.progress.message = nextStepHint(state.error);
        traceEvent('run_end', { status: 'failed', reason: state.error.code });
        emit(true);
        return getSnapshot();
      });
    });
  }

  function restart() {
    return start({
      topic: state.config.topic,
      depth: state.config.depth,
      format: state.config.format,
      path: state.config.path || 'auto',
      autoConfirm: false
    });
  }

  function retryTaskAction(taskId) {
    var task = findTask(taskId);
    syncActionsFromController();
    var action = (state.actions || []).slice().reverse().filter(function (a) {
      return a.status === 'failed' && (a.taskId === taskId || !a.taskId);
    })[0];
    if (!task || !action) return Promise.resolve({ ok: false, code: 'action_not_found', taskId: taskId });
    if (
      state.status === STATUSES.idle ||
      state.status === STATUSES.completed_with_sources ||
      state.status === STATUSES.completed_without_sources
    ) {
      return Promise.resolve({ ok: false, code: 'run_not_retryable', taskId: taskId });
    }
    if (!state.controller || typeof state.controller.retryAction !== 'function') {
      return Promise.resolve({ ok: false, code: 'controller_required', taskId: taskId });
    }
    ensureControllerInvoke();
    return Promise.resolve(state.controller.retryAction(action.actionId)).then(function (res) {
      syncActionsFromController();
      if (res && res.then) {
        return res.then(function (out) {
          syncActionsFromController();
          if (out && out.ok) {
            setTaskStatus(taskId, 'completed', {
              outputs: out.result || null
            });
          }
          emit(true);
          return {
            ok: !!(out && out.ok),
            taskId: taskId,
            actionId: (out && out.actionId) || action.actionId,
            status: out && out.ok ? 'completed' : 'failed',
            error: out && out.code
          };
        });
      }
      emit(true);
      return {
        ok: !!(res && res.ok),
        taskId: taskId,
        actionId: action.actionId,
        status: res && res.ok ? 'completed' : 'failed',
        error: res && res.code
      };
    });
  }

  global.OneToneHomeResearch = {
    STATUSES: STATUSES,
    DEPTH: DEPTH,
    BUDGETS: BUDGETS,
    getSnapshot: getSnapshot,
    subscribe: subscribe,
    openConfig: openConfig,
    updateConfig: updateConfig,
    cancel: cancel,
    resetIdle: resetIdle,
    start: start,
    preparePlan: preparePlan,
    updatePlan: updatePlan,
    confirmAndRun: confirmAndRun,
    applyClarifyOption: applyClarifyOption,
    rememberRecentTopic: rememberRecentTopic,
    restart: restart,
    retryTaskAction: retryTaskAction,
    classifyPath: classifyPath,
    buildFacetPlanHeuristic: buildFacetPlanHeuristic,
    extractTopicAnchors: extractTopicAnchors,
    filterHitsByAnchors: filterHitsByAnchors,
    rankHitsForIntent: rankHitsForIntent,
    scoreHitRelevance: scoreHitRelevance,
    intentRelevanceTokens: intentRelevanceTokens,
    looksLikePredicateClause: looksLikePredicateClause,
    buildRoundRobinSearches: buildRoundRobinSearches,
    facetsFromIntent: facetsFromIntent,
    resolveSemanticIntent: resolveSemanticIntent,
    degradedIntent: degradedIntent,
    modelPlanBlockedIntent: modelPlanBlockedIntent,
    isFormalModelIntent: isFormalModelIntent,
    buildSourcesKeptResult: buildSourcesKeptResult,
    isCiteValid: isCiteValid,
    isEvidenceEligible: isEvidenceEligible,
    programmaticCiteCheck: programmaticCiteCheck,
    computeCoverage: computeCoverage,
    exportReport: exportReport,
    renderMarkdown: renderMarkdown,
    renderHtml: renderHtml,
    statusLabel: statusLabel,
    nextStepHint: nextStepHint,
    classifyModelFailure: classifyModelFailure,
    buildSynthesisSystemPrompt: buildSynthesisSystemPrompt,
    buildResultFromSynthesis: buildResultFromSynthesis,
    emptyResult: emptyResult,
    normalizeSources: normalizeSources,
    buildSnippetLeadSources: buildSnippetLeadSources,
    normalizeResearchTopic: normalizeResearchTopic,
    normalizeResearchQuery: normalizeResearchQuery,
    isLowQualityResearchSource: isLowQualityResearchSource,
    sourceGateReason: sourceGateReason,
    gateSerpHitsForModelPick: gateSerpHitsForModelPick,
    parseUrlPickJson: parseUrlPickJson,
    modelPickSearchHits: modelPickSearchHits,
    chatOnceWithRetry: chatOnceWithRetry,
    passthroughBriefFromSources: passthroughBriefFromSources,
    isShallowPlayPageHit: isShallowPlayPageHit,
    corpusMostlyShallowPlay: corpusMostlyShallowPlay,
    isOffTopicNoiseSource: isOffTopicNoiseSource,
    keepSourcesForSynthesis: keepSourcesForSynthesis,
    formatSerpEvidenceForModel: formatSerpEvidenceForModel,
    isTextDiffToolNoise: isTextDiffToolNoise,
    disambiguateCompareQuery: disambiguateCompareQuery,
    extractCompareSides: extractCompareSides,
    normalizeCompareSurface: normalizeCompareSurface,
    pruneStemEntities: pruneStemEntities,
    compareProductFacets: compareProductFacets,
    compareProductEntities: compareProductEntities,
    missingComparePartners: missingComparePartners,
    planSearchQueriesHeuristic: planSearchQueriesHeuristic,
    extractResearchIntentJson: extractResearchIntentJson,
    normalizeResearchIntent: normalizeResearchIntent,
    salvageFacets: salvageFacets,
    extractDefinitionSubject: extractDefinitionSubject,
    extractBareSubject: extractBareSubject,
    looksLikeConceptWord: looksLikeConceptWord,
    looksLikeCreatorSubject: looksLikeCreatorSubject,
    extractUserAspects: extractUserAspects,
    stripInterrogativeShell: stripInterrogativeShell,
    buildLocalResearchIntent: buildLocalResearchIntent,
    localIntentConfidence: localIntentConfidence,
    buildCoverageMatrix: buildCoverageMatrix,
    buildRepairQueriesFromCoverage: buildRepairQueriesFromCoverage,
    seedEntitiesFromTopic: seedEntitiesFromTopic,
    seedConceptsFromTopic: seedConceptsFromTopic,
    extractNamedSubjects: extractNamedSubjects,
    pickPrimarySearchEntity: pickPrimarySearchEntity,
    orderEntitiesForSearch: orderEntitiesForSearch,
    buildResearchIntentPrompt: buildResearchIntentPrompt,
    buildQueryRewritePrompt: buildQueryRewritePrompt,
    buildAuthorityDigPrompt: buildAuthorityDigPrompt,
    corpusNeedsAuthorityDig: corpusNeedsAuthorityDig,
    planAuthorityDigQueries: planAuthorityDigQueries,
    heuristicAuthorityDigQueries: heuristicAuthorityDigQueries,
    sourceHostKey: sourceHostKey,
    isThirdPartyAuthorityHost: isThirdPartyAuthorityHost,
    isBoilerplateLimitation: isBoilerplateLimitation,
    rewriteSearchQueries: rewriteSearchQueries,
    queriesLookTooThin: queriesLookTooThin,
    selectBalancedHits: selectBalancedHits,
    stripPromptEcho: stripPromptEcho,
    extractJsonObject: extractJsonObject,
    validateResearchDocument: validateResearchDocument,
    documentToMarkdown: documentToMarkdown,
    documentToHtml: documentToHtml,
    normalizeBlock: normalizeBlock,
    __testOnly: {
      parseSectionsFromMarkdown: parseSectionsFromMarkdown,
      extractTitle: extractTitle,
      extractSummary: extractSummary,
      markUsedSources: markUsedSources,
      blankLedger: blankLedger,
      ledgerCan: ledgerCan,
      ledgerCanOptionalModel: ledgerCanOptionalModel,
      ledgerSpend: ledgerSpend,
      spendRepair: spendRepair,
      blankRunTrace: blankRunTrace,
      traceEvent: traceEvent,
      SYNTH_RESERVE: SYNTH_RESERVE,
      makeTask: makeTask,
      setTaskStatus: setTaskStatus,
      depsSatisfied: depsSatisfied,
      findTask: findTask,
      annotateSourceReadState: annotateSourceReadState,
      extractKeyClaims: extractKeyClaims,
      markdownToLegacyDocument: markdownToLegacyDocument,
      neutralizeRawHtml: neutralizeRawHtml,
      mdFragmentToHtml: mdFragmentToHtml,
      getState: function () {
        return state;
      },
      setStateForTest: function (patch) {
        Object.assign(state, patch || {});
        if (patch && patch.tasks) state.tasks = patch.tasks;
        if (patch && patch.ledger) state.ledger = patch.ledger;
        emit();
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
