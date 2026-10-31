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

  /** Global hard caps — all classify/plan/brief/review/repair/synth share one ledger. */
  var BUDGETS = {
    fast: { search: 3, fetch: 4, modelCalls: 2, parallelFacets: 1, repairRounds: 0 },
    standard: { search: 8, fetch: 10, modelCalls: 6, parallelFacets: 2, repairRounds: 1 },
    deep: { search: 12, fetch: 14, modelCalls: 9, parallelFacets: 2, repairRounds: 1 }
  };

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
    tasks: [],
    ledger: null,
    metrics: null,
    fetchCache: {},
    error: null,
    result: null,
    lastExportPath: null,
    runStartedAt: 0
  };

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
      modelCalls: 0,
      repairRounds: 0,
      path: '',
      model: '',
      searchProvider: 'auto',
      facetSourceCoverage: { num: 0, den: 0, rate: 0 },
      keyClaimCiteRate: { num: 0, den: 0, rate: 0 },
      limitationsFromBudget: []
    };
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
    if (L.hitCap) return false;
    if (kind === 'search') return L.search + n <= L.caps.search;
    if (kind === 'fetch') return L.fetch + n <= L.caps.fetch;
    if (kind === 'model') return L.modelCalls + n <= L.caps.modelCalls;
    if (kind === 'repair') return L.repairRounds + n <= L.caps.repairRounds;
    return false;
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

  function depsSatisfied(task) {
    var deps = task.deps || [];
    for (var i = 0; i < deps.length; i++) {
      var d = findTask(deps[i]);
      if (!d || d.status !== 'completed') return false;
    }
    return true;
  }

  /** Attempt-guarded transition. Stale attempt updates are ignored. */
  function setTaskStatus(id, nextStatus, opts) {
    opts = opts || {};
    var t = findTask(id);
    if (!t) return false;
    if (opts.attemptId != null && Number(opts.attemptId) !== Number(t.attemptId)) {
      return false;
    }
    if (nextStatus === 'running' && !depsSatisfied(t)) {
      t.error = { code: 'deps_unmet', message: 'dependencies not completed' };
      return false;
    }
    if (nextStatus === 'running' && t.status === 'running') return true;
    t.status = nextStatus;
    if (opts.detail != null) t.detail = String(opts.detail);
    if (opts.error) t.error = opts.error;
    else if (nextStatus === 'completed' || nextStatus === 'running') t.error = null;
    if (opts.outputs != null) t.outputs = opts.outputs;
    if (opts.bumpAttempt) t.attemptId = Number(t.attemptId || 1) + 1;
    syncProgressTasks();
    return true;
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
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var facets = [];
    var cmp = t.match(
      /([\u4e00-\u9fffA-Za-z0-9+\-·]{2,24})\s*(?:和|与|还是|或|vs\.?|VS)\s*([\u4e00-\u9fffA-Za-z0-9+\-·]{2,24})/
    );
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
      var qs = planSearchQueriesHeuristic(t).slice(0, 3);
      facets = qs.map(function (q, i) {
        return {
          id: 'f' + (i + 1),
          label: '调查面' + (i + 1),
          query: q,
          keyPoints: ['关键事实']
        };
      });
    }
    return facets.slice(0, 3);
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
      } else if (String(copy.snippet || '').trim()) {
        copy.readState = 'snippet';
        if (copy.fetchedAt && String(copy.text || '').trim().length <= 20) {
          copy.fetchedAt = null;
        }
      } else {
        copy.readState = 'unknown';
      }
      return copy;
    });
  }

  function cancel() {
    cancelFlag = true;
    if (
      isRunningStatus(state.status) ||
      state.status === STATUSES.configuring ||
      state.status === STATUSES.awaiting_approval
    ) {
      state.status = STATUSES.idle;
      state.progress.message = '已取消调研';
      state.error = { code: 'cancelled', message: '用户取消了调研' };
      emit();
    }
    return getSnapshot();
  }

  function resetIdle() {
    cancelFlag = false;
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
      status: partial.status || STATUSES.completed_without_sources,
      rawMarkdown: partial.rawMarkdown != null ? String(partial.rawMarkdown) : ''
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
      out.push({
        id: s.id || 'S' + (out.length + 1),
        title: String(s.title || url).trim() || url,
        url: url,
        snippet: String(s.snippet || '').trim(),
        fetchedAt: s.fetchedAt || null,
        text: s.text ? String(s.text) : '',
        usedInSections: Array.isArray(s.usedInSections) ? s.usedInSections.slice() : []
      });
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

  /** Heuristic query plan — covers comparison entities + aspect keywords. */
  function planSearchQueriesHeuristic(topic) {
    var t = String(topic || '')
      .replace(/^调研[:：]?\s*/, '')
      .replace(/[？?！!。．.]+$/g, '')
      .trim();
    var out = [];
    uniquePush(out, t, 8);

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
      }
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

  function planSearchQueries(topic) {
    var fallback = planSearchQueriesHeuristic(topic);
    state.progress.message = '正在拆解检索词…';
    emit(true);
    return chatOnce(
      [
        {
          role: 'system',
          content:
            '你是检索规划助手。根据用户调研主题，输出 4～6 个互补的搜索关键词（JSON 字符串数组）。' +
            '要求：覆盖主题中的每一方实体；拆开对比题；包含核心维度（如美食/房价）；短而可搜索；只输出 JSON 数组。'
        },
        { role: 'user', content: String(topic || '') }
      ],
      { maxTokens: 256 }
    )
      .then(function (chat) {
        var planned = parseQueryPlanJson(chat && chat.text);
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
    if (/^规则\s*[：:]/m.test(text) || /^\d+\.\s*紧扣主题/.test(text)) {
      var cut = text.search(/^#\s+\S/m);
      if (cut > 0) text = text.slice(cut);
    }
    text = text.replace(/^规则[\s\S]*?(?=^#\s+)/m, '');
    return text.trim();
  }

  function looksLikeCompareTopic(topic) {
    return /(?:和|与|还是|或|vs\.?|VS|对比|比较|哪个|深度研究)/i.test(String(topic || ''));
  }

  function buildSynthesisSystemPrompt(sources, topic, queries) {
    var lines = [
      '你是调研报告主笔。只使用下方「来源材料」中的事实，直接输出 Markdown 报告正文。',
      '主题：' + String(topic || ''),
      '检索词：' + ((queries && queries.join('、')) || topic || ''),
      '硬性要求：',
      '- 第 1 行：# 具体报告标题（禁止写成「标题」）。',
      '- 开头用一段 > 引用块写「核心结论一句话」。',
      '- 结构：## 摘要；各方单独 ## 小节（含发布/规格/价格/口碑等可核验点）；## 核心对比（必须用 Markdown 表格）；## 结论与建议；## 调研限制；## 来源列表。',
      '- 关键句后标 [S#]；不得捏造 URL/数据；不得用单方材料推断另一方；缺口须写明。',
      '- 写满可核验事实与差异，不要短骨架；不要复述本提示或「规则1/2/3」。',
      '- 来源列表复用给定编号与 URL；文末写 {{GENERATED_AT}}。'
    ];
    if (looksLikeCompareTopic(topic)) {
      lines.push(
        '本题是对比调研：两侧实体各自成节，对比表至少含 6 行维度；结论给出「适合谁选谁」而不是空泛中立。'
      );
    }
    if (!sources || !sources.length) {
      lines.push(
        '注意：当前没有可用网络来源。请基于用户主题做「已有材料整理」口吻，明确说明未做网络检索，不得声称已完成网络调研。'
      );
    } else {
      lines.push('来源材料：');
      sources.forEach(function (s) {
        lines.push(
          '[' +
            s.id +
            '] ' +
            s.title +
            '\nURL: ' +
            s.url +
            '\n摘录: ' +
            String(s.text || s.snippet || '').slice(0, 5000)
        );
      });
    }
    return lines.join('\n');
  }

  function searchMany(queries, maxSources) {
    var all = [];
    var qlist = (queries || []).filter(Boolean);
    if (!qlist.length) return Promise.resolve([]);
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
      var tokens = [];
      qlist.forEach(function (q) {
        PLACE_HINTS.forEach(function (p) {
          if (String(q).indexOf(p) >= 0) uniquePush(tokens, p, 12);
        });
      });
      return selectBalancedHits(all, maxSources, tokens);
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
    return /^(标题|摘要|正文|小节\d*|结论|来源|来源列表|调研限制|生成时间)$/.test(
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

  /** Markdown fragment → HTML (tables/lists/quotes/paragraphs). */
  function mdFragmentToHtml(src) {
    var text = String(src || '').trim();
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
      out.push('<div class="card"><table>');
      rows.forEach(function (cells, ri) {
        out.push('<tr>');
        cells.forEach(function (c, ci) {
          var tag = ri === 0 ? 'th' : 'td';
          var cls = ri > 0 && ci === 0 ? ' class="k"' : '';
          out.push('<' + tag + cls + '>' + inlineMd(c) + '</' + tag + '>');
        });
        out.push('</tr>');
      });
      out.push('</table></div>');
      return j;
    }
    function inlineMd(s) {
      return escapeHtml(s)
        .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
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
    var md = renderMarkdown(result);
    var r = result || emptyResult();
    var parts = [];
    parts.push('<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"/>');
    parts.push('<meta name="viewport" content="width=device-width, initial-scale=1"/>');
    parts.push('<title>' + escapeHtml(r.title || '调研报告') + '</title>');
    parts.push(
      '<style>' +
        ':root{--bg:#f7f8fa;--card:#fff;--ink:#1f2329;--sub:#5a6573;--line:#e6e9ef;--accent:#0b57d0;--warn:#d4380d;--good:#237804;--tag:#eef2f7}' +
        '*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:var(--bg);color:var(--ink);line-height:1.7;font-size:15px}' +
        '.wrap{max-width:980px;margin:0 auto;padding:28px 18px 72px}header{border-left:6px solid var(--accent);padding:6px 16px;margin-bottom:10px}' +
        'header h1{margin:0;font-size:24px;letter-spacing:.3px}.meta{color:var(--sub);font-size:13px;margin-top:6px}' +
        'h2{font-size:19px;margin:32px 0 12px;padding-bottom:8px;border-bottom:2px solid var(--line)}' +
        'h2 .n{color:#fff;background:var(--ink);border-radius:6px;padding:1px 9px;font-size:13px;margin-right:8px}' +
        'h3{font-size:16px;margin:18px 0 8px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 18px;margin:12px 0;box-shadow:0 1px 2px rgba(0,0,0,.03)}' +
        'table{width:100%;border-collapse:collapse;margin:8px 0;font-size:14px;background:#fff}th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}th{background:#f0f3f7}' +
        'td.k{background:#fafbfc;color:var(--sub);font-weight:600;width:7.5em}' +
        '.callout{border-radius:10px;padding:12px 14px;margin:12px 0;font-size:14px}.c-info{background:#eef6ff;border:1px solid #c9ddff;color:#0b3a75}' +
        '.c-warn{background:#fff2e8;border:1px solid #ffd8bf;color:#873800}ul{margin:6px 0;padding-left:1.2em}li{margin:4px 0}' +
        'a{color:var(--accent)}.cite{font-weight:700;color:var(--sub);font-size:12px}' +
        '.src{font-size:13px}.src a{word-break:break-all}footer{color:var(--sub);font-size:12px;margin-top:28px;border-top:1px solid var(--line);padding-top:12px}' +
        '</style></head><body><div class="wrap">'
    );
    parts.push('<header><h1>' + escapeHtml(r.title || '调研报告') + '</h1>');
    parts.push(
      '<div class="meta">生成时间：' +
        escapeHtml(r.generatedAt || '') +
        (r.model ? ' ｜ 模型：' + escapeHtml(r.model) : '') +
        ' ｜ 场景：调研</div></header>'
    );

    var summarySec = (r.sections || []).find(function (s) {
      return /^摘要/.test(String(s.heading || ''));
    });
    var lead = String((summarySec && summarySec.body) || r.summary || '').trim();
    if (lead) {
      parts.push(
        '<div class="callout c-info"><b>核心结论：</b>' +
          escapeHtml(lead).replace(/\n/g, '<br/>') +
          '</div>'
      );
    }

    var sectionNo = 0;
    (r.sections || []).forEach(function (sec) {
      var h = String(sec.heading || '');
      if (/^(摘要|生成时间)$/.test(h)) return;
      if (/^(来源|来源列表)$/.test(h)) return;
      if (isSkeletonHeading(h) && !String(sec.body || '').trim()) return;
      sectionNo += 1;
      var num = sectionNo < 10 ? '0' + sectionNo : String(sectionNo);
      parts.push(
        '<h2><span class="n">' +
          num +
          '</span>' +
          escapeHtml(h || '正文') +
          '</h2><div class="card">' +
          mdFragmentToHtml(sec.body || '') +
          '</div>'
      );
    });

    var lim =
      r.limitations && r.limitations.length
        ? r.limitations
        : r.status === STATUSES.completed_without_sources
          ? ['本次无有效网络来源，仅为基于已有材料整理，不是网络调研完成。']
          : ['结论仅基于所列来源。'];
    parts.push('<h2><span class="n">限</span>调研限制</h2><div class="card"><ul>');
    lim.forEach(function (x) {
      parts.push('<li>' + escapeHtml(x) + '</li>');
    });
    parts.push('</ul></div>');

    parts.push('<h2><span class="n">源</span>来源列表</h2><div class="card"><ul class="src">');
    if (!r.sources || !r.sources.length) {
      parts.push('<li>（无来源）</li>');
    } else {
      r.sources.forEach(function (s) {
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
    }
    parts.push('</ul></div>');

    var statusLine =
      r.status === STATUSES.completed_without_sources
        ? '状态：基于已有材料整理（无网络来源）'
        : r.status === STATUSES.completed_with_sources
          ? '状态：网络调研完成（含来源）'
          : '';
    parts.push(
      '<footer>' +
        (statusLine ? escapeHtml(statusLine) + ' · ' : '') +
        '本报告由 OneTone 调研模式生成；结论仅基于所列公开来源。' +
        '</footer></div><!-- md-length:' +
        String(md.length) +
        ' --></body></html>'
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

  function nextStepHint(error) {
    if (!error) return '';
    var code = String(error.code || '');
    if (code === 'no_llm') return '请先登录 WorkBuddy 或配置 Soft Pad 密钥后再试。';
    if (code === 'search_unavailable' || code === 'rate_limited')
      return '搜索暂不可用。可稍后重试，或仅做「已有材料整理」。';
    if (code === 'fetch_all_failed') return '网页均抓取失败。可换主题或稍后重试。';
    if (code === 'timeout') return '请求超时。请检查网络后重新调研。';
    if (code === 'cancelled') return '已取消。可再次打开调研配置。';
    if (code === 'export_failed') return '报告已生成，但导出失败。可复制 Markdown 手动保存。';
    if (code === 'empty_topic') return '先在下方输入框写调研主题，再点开始。';
    if (code === 'no_sources')
      return '未取得网络来源。请检查网络后点「重新调研」，或换更具体的主题。';
    if (code === 'budget_capped')
      return '已达调用预算上限。可降低深度或缩小主题后重试。';
    return error.message || '请检查网络与模型配置后重试。';
  }

  function chatOnce(messages, opts) {
    opts = opts || {};
    if (state.ledger && !opts.skipLedger) {
      if (!ledgerSpend('model', 1)) {
        var errB = new Error('budget_model');
        errB.code = 'budget_capped';
        return Promise.reject(errB);
      }
    }
    return resolveWbLlm().then(function (llm) {
      return invokeArgs('cmd_workbuddy_local_chat', {
        accountId: llm.accountId,
        model: llm.model,
        messages: messages,
        maxTokens: opts.maxTokens || 4096
      }).then(function (res) {
        var text =
          (res && (res.content || res.text || res.message)) ||
          (res &&
            res.choices &&
            res.choices[0] &&
            res.choices[0].message &&
            res.choices[0].message.content) ||
          '';
        if (typeof text !== 'string') text = JSON.stringify(text);
        if (state.metrics) {
          state.metrics.modelCalls = (state.ledger && state.ledger.modelCalls) || 0;
          state.metrics.model =
            (res && (res.model || res.modelId)) || llm.model || state.metrics.model || '';
        }
        return {
          text: String(text || '').trim(),
          model: (res && (res.model || res.modelId)) || llm.model || ''
        };
      });
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
    if (state.ledger && !ledgerSpend('search', 1)) {
      var errS = new Error('budget_search');
      errS.code = 'budget_capped';
      return Promise.reject(errS);
    }
    return invokeArgs('cmd_research_web_search', {
      query: query,
      limit: limit || 6,
      provider: 'auto'
    }).then(function (res) {
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
    if (state.ledger && !ledgerSpend('fetch', 1)) {
      var errF = new Error('budget_fetch');
      errF.code = 'budget_capped';
      return Promise.reject(errF);
    }
    return invokeArgs('cmd_research_fetch_url', {
      url: url,
      provider: 'direct',
      maxChars: 12000
    })
      .then(function (res) {
        if (res && res.ok !== false) return res;
        // Direct scrape often blocked; Jina Reader is a replaceable fallback, not core contract.
        return invokeArgs('cmd_research_fetch_url', {
          url: url,
          provider: 'jina',
          maxChars: 12000
        }).then(function (res2) {
          if (!res2 || res2.ok === false) {
            var err = new Error(
              (res2 && res2.message) || (res && res.message) || 'fetch_failed'
            );
            err.code =
              (res2 && res2.code) || (res && res.code) || 'fetch_failed';
            throw err;
          }
          return res2;
        });
      })
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
    var sources = normalizeSources(opts.sources);
    var md = stripPromptEcho(
      String(opts.markdown || '').replace(/\{\{GENERATED_AT\}\}/g, new Date().toISOString())
    );
    var hasSources = sources.length > 0;
    var status = hasSources
      ? STATUSES.completed_with_sources
      : STATUSES.completed_without_sources;
    var titled = extractTitle(md, opts.topic || '调研报告');
    var sections = parseSectionsFromMarkdown(md);
    var marked = markUsedSources(sources, md);
    var limitations = [];
    if (!hasSources) {
      limitations.push('本次无有效网络来源，仅为基于已有材料整理，不是网络调研完成。');
    } else {
      limitations.push('结论仅基于所列来源；未覆盖来源外信息。');
      if (opts.fetchFailures > 0) {
        limitations.push('部分网页抓取失败（' + opts.fetchFailures + '），已跳过。');
      }
    }
    if (opts.depth) limitations.push('调研深度：' + opts.depth);
    return emptyResult({
      title: titled,
      summary: extractSummary(md),
      sections: sections,
      sources: marked,
      generatedAt: new Date().toISOString(),
      model: opts.model || '',
      queries: opts.queries || [],
      limitations: limitations,
      status: status,
      rawMarkdown: md
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
      result.metrics = JSON.parse(JSON.stringify(state.metrics));
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
  }

  function preparePlan(opts) {
    opts = opts || {};
    if (isRunningStatus(state.status)) return Promise.resolve(getSnapshot());
    var topic = String(opts.topic != null ? opts.topic : state.config.topic || '').trim();
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
    var facets = path === 'faceted' ? buildFacetPlanHeuristic(topic) : [];
    state.plan = {
      topic: topic,
      path: path,
      suggestedPath: classified.path,
      pathReason: classified.reason,
      pathForced: !!classified.forced,
      depth: state.config.depth,
      facets: facets,
      userConditions: state.config.userConditions || null
    };
    state.tasks = [
      makeTask({
        id: 'plan',
        kind: 'plan',
        subject: '调查计划',
        status: 'completed',
        detail: classified.reason
      })
    ];
    state.progress = blankProgress('awaiting_approval', classified.reason);
    state.progress.facets = facets.slice();
    state.progress.queries = facets.map(function (f) {
      return f.query;
    });
    syncProgressTasks();
    state.result = null;
    state.error = null;
    state.status = STATUSES.awaiting_approval;
    emit(true);
    return Promise.resolve(getSnapshot());
  }

  function updatePlan(patch) {
    patch = patch || {};
    if (state.status !== STATUSES.awaiting_approval || !state.plan) {
      return getSnapshot();
    }
    if (patch.path === 'fast' || patch.path === 'faceted') {
      state.plan.path = patch.path;
      state.config.path = patch.path;
      if (patch.path === 'faceted' && !(state.plan.facets && state.plan.facets.length)) {
        state.plan.facets = buildFacetPlanHeuristic(state.plan.topic);
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
    cancelFlag = false;
    var myRun = ++runId;
    var topic = state.plan.topic;
    var path = state.plan.path || 'fast';
    var depth = DEPTH[state.config.depth] || DEPTH.standard;
    state.runStartedAt = Date.now();
    state.fetchCache = {};
    state.ledger = blankLedger(depth.id, path);
    state.metrics = blankMetrics();
    state.metrics.path = path;
    state.result = null;
    state.lastExportPath = null;
    state.error = null;

    if (path === 'faceted') {
      return runFacetedPipeline(opts, myRun, topic, depth);
    }
    return runFastPipeline(opts, myRun, topic, depth);
  }

  function runFastPipeline(opts, myRun, topic, depth) {
    opts = opts || {};
    var queries = [topic];
    var allowWithoutSearch = opts.allowWithoutSearch === true;
    state.tasks = [
      makeTask({ id: 'plan', kind: 'plan', subject: '检索规划', status: 'ready' }),
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
    setStatus(STATUSES.searching, { phase: 'searching', message: '正在拆解检索词…' });
    setTaskStatus('plan', 'running', { attemptId: 1 });

    var searchHits = [];
    var fetchFailures = 0;
    var fetched = [];
    var searchError = null;

    function aborted() {
      return cancelFlag || myRun !== runId;
    }

    function finishWithoutSources(reason) {
      var result = emptyNoSourceResult(topic, queries, depth.id, reason);
      finalizeMetrics(result);
      state.result = result;
      state.status = STATUSES.completed_without_sources;
      state.error = {
        code: 'no_sources',
        message: '未取得网络来源：' + reason
      };
      state.progress.message =
        statusLabel(result.status) + ' · ' + nextStepHint(state.error);
      emit(true);
      return getSnapshot();
    }

    return planSearchQueries(topic)
      .then(function (planned) {
        if (aborted()) return null;
        setTaskStatus('plan', 'completed', { attemptId: 1, detail: 'queries ready' });
        queries = planned && planned.length ? planned : [topic];
        state.progress.queries = queries.slice();
        state.progress.message =
          '正在搜索 ' + queries.length + ' 组关键词…';
        setTaskStatus('search', 'running', { attemptId: 1 });
        emit(true);
        return searchMany(queries, Math.min(depth.maxSources, 4));
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
        searchHits = (hits || []).slice(0, Math.min(depth.maxSources, 4));
        state.progress.sourcesFound = searchHits.length;
        setTaskStatus('search', 'completed', {
          attemptId: 1,
          detail: searchHits.length + ' hits'
        });
        if (!searchHits.length) {
          return finishWithoutSources(
            (searchError && (searchError.message || searchError.code)) ||
              '无搜索结果'
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
                emit();
                return yieldUi();
              })
              .catch(function () {
                fetchFailures += 1;
                if (live) live.state = 'fail';
                if (hit.url && (hit.snippet || hit.title)) {
                  fetched.push({
                    id: 'S' + (fetched.length + 1),
                    title: hit.title || hit.url,
                    url: hit.url,
                    snippet: hit.snippet || '',
                    fetchedAt: null,
                    text: hit.snippet || hit.title || '',
                    usedInSections: []
                  });
                  state.progress.sourcesFetched = fetched.length;
                  if (live) live.state = 'snippet';
                }
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
        var valid = annotateSourceReadState(
          normalizeSources(sources).filter(function (s) {
            return s.url && String(s.text || s.snippet || '').trim();
          })
        );
        setTaskStatus('fetch', 'completed', {
          attemptId: 1,
          detail: valid.length + ' sources'
        });
        if (!valid.length) {
          return finishWithoutSources(
            fetchFailures
              ? '搜索到结果但网页抓取失败'
              : '无可用正文'
          );
        }
        state.progress.currentUrl = '';
        state.progress.currentTitle = '';
        setTaskStatus('synthesize', 'running', { attemptId: 1 });
        setStatus(STATUSES.synthesizing, {
          phase: 'synthesizing',
          message: '正在用当前模型写有来源短答…'
        });
        emit(true);
        var system = buildSynthesisSystemPrompt(valid, topic, queries);
        var user =
          '调研主题：' +
          topic +
          '\n用户条件：' +
          JSON.stringify(state.config.userConditions || {}) +
          '\n检索词：' +
          queries.join('、') +
          '\n深度：' +
          depth.id +
          '\n请按 Markdown 输出：先 ## 直接回答（可核查短答，引用[S#]），再 ## 依据，再 ## 风险与未确认，再 ## 结论。禁止空壳标题；不得编造 URL。';
        return chatOnce(
          [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ],
          { maxTokens: 4096 }
        )
          .catch(function (e) {
            var err = {
              code: (e && e.code) === 'budget_capped' ? 'budget_capped' : 'no_llm',
              message: '没有可用大模型：' + String((e && e.message) || e)
            };
            state.status = STATUSES.failed;
            state.error = err;
            state.progress.message = nextStepHint(err);
            emit(true);
            return null;
          })
          .then(function (chat) {
            if (!chat) return null;
            if (aborted()) return null;
            var result = buildResultFromSynthesis({
              markdown: chat.text,
              sources: valid,
              topic: topic,
              model: chat.model,
              queries: queries,
              depth: depth.id,
              fetchFailures: fetchFailures
            });
            finalizeMetrics(result);
            setTaskStatus('synthesize', 'completed', { attemptId: 1 });
            state.result = result;
            state.progress.sourcesUsed = (result.sources || []).filter(function (s) {
              return s.usedInSections && s.usedInSections.length;
            }).length;
            state.status = result.status;
            state.progress.message = statusLabel(result.status);
            state.error = null;
            emit(true);
            return getSnapshot();
          });
      })
      .then(function () {
        return getSnapshot();
      })
      .catch(function (e) {
        if (aborted()) return getSnapshot();
        var code = (e && e.code) || 'failed';
        var err = {
          code: code,
          message: String((e && e.message) || e || 'failed')
        };
        state.status = STATUSES.failed;
        state.error = err;
        state.progress.message = nextStepHint(err);
        emit(true);
        return getSnapshot();
      });
  }

  function runFacetedPipeline(opts, myRun, topic, depth) {
    opts = opts || {};
    var facets = (state.plan && state.plan.facets) || buildFacetPlanHeuristic(topic);
    if (!facets.length) {
      state.plan.path = 'fast';
      return runFastPipeline(opts, myRun, topic, depth);
    }
    var parallel = Math.min(2, (state.ledger && state.ledger.caps.parallelFacets) || 2);
    var sourceSeq = 0;
    var allSources = [];
    var briefs = {};
    var facetSources = {};

    function aborted() {
      return cancelFlag || myRun !== runId;
    }

    state.tasks = [makeTask({ id: 'plan', kind: 'plan', subject: '调查面计划', status: 'completed' })];
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
    state.progress.queries = facets.map(function (f) {
      return f.query;
    });

    function runOneFacet(f) {
      if (aborted()) return Promise.resolve();
      var sid = f.id + '_search';
      var fid = f.id + '_fetch';
      var bid = f.id + '_brief';
      setTaskStatus(sid, 'running', { attemptId: 1 });
      setStatus(STATUSES.searching, {
        phase: 'searching',
        message: '搜索调查面：' + f.label
      });
      emit(true);
      return searchWeb(f.query, 5)
        .catch(function () {
          return [];
        })
        .then(function (hits) {
          if (aborted()) return;
          setTaskStatus(sid, 'completed', {
            attemptId: 1,
            detail: (hits || []).length + ' hits'
          });
          var picked = selectBalancedHits(hits || [], 3, [f.label]);
          setTaskStatus(fid, 'running', { attemptId: 1 });
          setStatus(STATUSES.fetching, {
            phase: 'fetching',
            message: '阅读调查面：' + f.label
          });
          var chain = Promise.resolve();
          var local = [];
          picked.forEach(function (hit) {
            chain = chain.then(function () {
              if (aborted() || !ledgerCan('fetch', 1)) return;
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
                  state.progress.sourcesFound = allSources.length;
                  state.progress.sourcesFetched = allSources.length;
                  emit();
                })
                .catch(function () {
                  if (hit.url && (hit.snippet || hit.title)) {
                    sourceSeq += 1;
                    var row = {
                      id: 'S' + sourceSeq,
                      title: hit.title || hit.url,
                      url: hit.url,
                      snippet: hit.snippet || '',
                      fetchedAt: null,
                      text: hit.snippet || hit.title || '',
                      facetId: f.id,
                      usedInSections: [],
                      readState: 'snippet'
                    };
                    local.push(row);
                    allSources.push(row);
                  }
                });
            });
          });
          return chain.then(function () {
            facetSources[f.id] = annotateSourceReadState(local);
            setTaskStatus(fid, 'completed', {
              attemptId: 1,
              detail: local.length + ' sources'
            });
            if (!local.length || !ledgerCan('model', 1)) {
              briefs[f.id] = {
                facts: [],
                openQuestions: ['本面无有效来源或预算不足'],
                sourceIds: []
              };
              setTaskStatus(bid, 'completed', {
                attemptId: 1,
                detail: 'skipped brief'
              });
              return;
            }
            setTaskStatus(bid, 'running', { attemptId: 1 });
            setStatus(STATUSES.briefing, {
              phase: 'briefing',
              message: '简报：' + f.label
            });
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
            return chatOnce(
              [
                {
                  role: 'system',
                  content:
                    '你是调查面简报员。只根据给定来源输出 JSON：' +
                    '{"facts":[{"text":"...","sourceId":"S1"}],"openQuestions":["..."],"sourceIds":["S1"]}。' +
                    'facts 必须带真实 sourceId；不得编造 URL。'
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
              ],
              { maxTokens: 800 }
            )
              .then(function (chat) {
                var brief = { facts: [], openQuestions: [], sourceIds: [] };
                try {
                  var m = String(chat.text || '').match(/\{[\s\S]*\}/);
                  if (m) brief = JSON.parse(m[0]);
                } catch (_) {}
                briefs[f.id] = brief;
                setTaskStatus(bid, 'completed', {
                  attemptId: 1,
                  outputs: brief,
                  detail: ((brief.facts && brief.facts.length) || 0) + ' facts'
                });
              })
              .catch(function () {
                briefs[f.id] = {
                  facts: [],
                  openQuestions: ['简报模型调用失败'],
                  sourceIds: local.map(function (s) {
                    return s.id;
                  })
                };
                setTaskStatus(bid, 'completed', { attemptId: 1, detail: 'brief failed' });
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

    return runFacetQueue(facets, parallel)
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
            gaps.push({ facetId: f.id, critical: true, note: f.label + '缺少已证实事实' });
          }
          (b.openQuestions || []).forEach(function (q) {
            if (/结论|是否|适合|必须|关键/.test(String(q))) {
              gaps.push({ facetId: f.id, critical: true, note: String(q) });
            } else {
              gaps.push({ facetId: f.id, critical: false, note: String(q) });
            }
          });
        });
        var critical = gaps.filter(function (g) {
          return g.critical;
        });
        var repairPromise = Promise.resolve();
        if (
          critical.length &&
          ledgerCan('repair', 1) &&
          ledgerCan('search', 1) &&
          ledgerCan('model', 1)
        ) {
          ledgerSpend('repair', 1);
          var g0 = critical[0];
          var facet = facets.filter(function (f) {
            return f.id === g0.facetId;
          })[0];
          if (facet) {
            repairPromise = searchWeb(facet.query + ' ' + String(g0.note || '').slice(0, 20), 3)
              .then(function (hits) {
                var hit = (hits || [])[0];
                if (!hit || !hit.url || !ledgerCan('fetch', 1)) return;
                return fetchUrl(hit.url).then(function (page) {
                  sourceSeq += 1;
                  allSources.push({
                    id: 'S' + sourceSeq,
                    title: page.title || hit.title,
                    url: page.url || hit.url,
                    snippet: hit.snippet || '',
                    fetchedAt: page.fetchedAt || new Date().toISOString(),
                    text: page.text || '',
                    facetId: facet.id,
                    usedInSections: []
                  });
                });
              })
              .catch(function () {});
          }
        }
        return repairPromise.then(function () {
          setTaskStatus('review', 'completed', {
            attemptId: 1,
            detail: gaps.length + ' gaps'
          });
          var softGaps = gaps
            .filter(function (g) {
              return !g.critical;
            })
            .map(function (g) {
              return g.note;
            });
          setTaskStatus('synthesize', 'running', { attemptId: 1 });
          setStatus(STATUSES.synthesizing, {
            phase: 'synthesizing',
            message: '汇总成稿…'
          });
          var annotated = annotateSourceReadState(allSources);
          if (!annotated.length) {
            var empty = emptyNoSourceResult(topic, state.progress.queries, depth.id, '各调查面无来源');
            empty.limitations = empty.limitations.concat(softGaps.slice(0, 5));
            finalizeMetrics(empty);
            state.result = empty;
            state.status = empty.status;
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
          var system = buildSynthesisSystemPrompt(annotated, topic, state.progress.queries);
          var user =
            '调研主题：' +
            topic +
            '\n用户条件：' +
            JSON.stringify(state.config.userConditions || state.plan.userConditions || {}) +
            '\n各面简报：\n' +
            briefText +
            '\n未纳入补查的缺口（写入限制即可）：' +
            softGaps.slice(0, 6).join('；') +
            '\n请输出 Markdown：## 直接回答 → ## 依据（或比较/步骤）→ ## 风险与未确认 → ## 结论。关键句引用[S#]；不得编造 URL。';
          return chatOnce(
            [
              { role: 'system', content: system },
              { role: 'user', content: user }
            ],
            { maxTokens: 8192 }
          ).then(function (chat) {
            if (aborted() || !chat) return getSnapshot();
            var result = buildResultFromSynthesis({
              markdown: chat.text,
              sources: annotated,
              topic: topic,
              model: chat.model,
              queries: state.progress.queries,
              depth: depth.id
            });
            if (softGaps.length) {
              result.limitations = (result.limitations || []).concat(
                softGaps.slice(0, 5).map(function (g) {
                  return '未确认：' + g;
                })
              );
            }
            finalizeMetrics(result);
            setTaskStatus('synthesize', 'completed', { attemptId: 1 });
            state.result = result;
            state.status = result.status;
            state.progress.message = statusLabel(result.status);
            state.error = null;
            emit(true);
            return getSnapshot();
          });
        });
      })
      .catch(function (e) {
        if (aborted()) return getSnapshot();
        state.status = STATUSES.failed;
        state.error = {
          code: (e && e.code) || 'failed',
          message: String((e && e.message) || e || 'failed')
        };
        state.progress.message = nextStepHint(state.error);
        emit(true);
        return getSnapshot();
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
    restart: restart,
    classifyPath: classifyPath,
    buildFacetPlanHeuristic: buildFacetPlanHeuristic,
    programmaticCiteCheck: programmaticCiteCheck,
    computeCoverage: computeCoverage,
    exportReport: exportReport,
    renderMarkdown: renderMarkdown,
    renderHtml: renderHtml,
    statusLabel: statusLabel,
    nextStepHint: nextStepHint,
    buildSynthesisSystemPrompt: buildSynthesisSystemPrompt,
    buildResultFromSynthesis: buildResultFromSynthesis,
    emptyResult: emptyResult,
    normalizeSources: normalizeSources,
    planSearchQueriesHeuristic: planSearchQueriesHeuristic,
    selectBalancedHits: selectBalancedHits,
    stripPromptEcho: stripPromptEcho,
    __testOnly: {
      parseSectionsFromMarkdown: parseSectionsFromMarkdown,
      extractTitle: extractTitle,
      extractSummary: extractSummary,
      markUsedSources: markUsedSources,
      blankLedger: blankLedger,
      ledgerCan: ledgerCan,
      ledgerSpend: ledgerSpend,
      makeTask: makeTask,
      setTaskStatus: setTaskStatus,
      depsSatisfied: depsSatisfied,
      findTask: findTask,
      annotateSourceReadState: annotateSourceReadState,
      extractKeyClaims: extractKeyClaims,
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
