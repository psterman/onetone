/**
 * OneToneHomeAgentV2Store — single fact source for the new home workbench.
 * Consumes Agent Center / inventory / attention; never invents a second model.
 */
(function (global) {
  'use strict';

  var LAST_GOOD_KEY = 'onetone.agentCenter.lastGood';
  var COALESCE_MS = 120;
  var POLL_MS = 15000;

  var CATALOG = [
    { id: 'codex', name: 'Codex', appId: 'codex-chat', icon: 'icons/app-target/codex.png' },
    { id: 'claude', name: 'Claude', appId: 'claude-code', icon: 'icons/app-target/claude.png' },
    { id: 'cursor', name: 'Cursor', appId: 'cursor-chat', icon: 'icons/app-target/cursor.png' },
    { id: 'minimax', name: 'MiniMax', appId: 'minimax-chat', icon: 'icons/app-target/minimaxcode.png' },
    { id: 'kimi', name: 'Kimi', appId: 'kimi-chat', icon: '' },
    { id: 'pi', name: 'Pi', appId: 'pi-chat', icon: '' },
    { id: 'opencode', name: 'OpenCode', appId: 'opencode-chat', icon: 'icons/app-target/opencode.png' },
    { id: 'openclaw', name: 'OpenClaw', appId: 'openclaw-chat', icon: '' },
    { id: 'hermes', name: 'Hermes', appId: 'hermes-chat', icon: '' },
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
    attention: null,
    agents: [],
    selectedKind: null,
    userLocked: false,
    receipt: null,
    draft: '',
    materials: [],
    aimByAppId: {},
    capabilities: {
      softPad: { state: 'off', error: null },
      voice: { state: 'off', error: null },
      camera: { state: 'off', error: null }
    },
    pickerOpen: false,
    view: 'home',
    visible: false,
    mounted: false
  };

  var listeners = [];
  var unsubs = [];
  var coalesceTimer = 0;
  var pollTimer = 0;
  var refreshInFlight = null;
  var lastRefreshAt = 0;

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

  /**
   * Strict kind resolve. Unknown → null (never default Codex).
   * Aligns with HomeActionPolicy.canonicalKind + catalog id space.
   */
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

  function projectNameOf(agent) {
    var cw = agent && agent.currentWork;
    if (cw) {
      var project = String(cw.projectName || cw.project || cw.displayName || '').trim();
      if (project) return project;
    }
    if (agent && agent.cwd) {
      var parts = String(agent.cwd)
        .replace(/[\\/]+$/, '')
        .split(/[\\/]/);
      var leaf = parts[parts.length - 1];
      if (leaf) return leaf;
    }
    return '';
  }

  function workLine(agent) {
    if (!agent) return '';
    if (agent.recentPrompt) return String(agent.recentPrompt);
    if (agent.title) return String(agent.title);
    var w = agent.currentWork || (agent.recentWork && agent.recentWork[0]);
    if (!w) {
      if (agent.presenceState === 'limited' || (agent.limitations && agent.limitations.length)) {
        return '能力受限';
      }
      return '';
    }
    return String(w.title || w.sessionId || '');
  }

  function workWhen(agent) {
    var w = agent && (agent.currentWork || (agent.recentWork && agent.recentWork[0]));
    var ms = Number(
      (w && (w.updatedAt || w.updated_at)) || (agent && agent.lastSyncAt) || 0
    );
    return ms || 0;
  }

  function statusOf(agent) {
    var obs = agent && agent.observedStatus;
    if (obs && obs.value != null) return String(obs.value).toLowerCase();
    return String((agent && (agent.status || agent.attentionState)) || '').toLowerCase();
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
    var project = projectNameOf(raw) || '最近工作';
    var title = workLine(raw) || '查看最近工作';
    var score = /needs|waiting|approval|needsinput/.test(status)
      ? 0
      : /working|running|active/.test(status)
        ? 1
        : /fail|error/.test(status)
          ? 0
          : 2;
    return {
      raw: raw,
      kind: kind,
      cat: cat,
      agentId: (raw && (raw.agentId || raw.id)) || '',
      project: project,
      title: title,
      status: status,
      updated: workWhen(raw),
      presenceState: (raw && raw.presenceState) || '',
      resolvedCapabilities: (raw && raw.resolvedCapabilities) || null,
      actions: Array.isArray(raw && raw.actions) ? raw.actions : [],
      sessions: (raw && (raw.sessions || raw.recentSessions)) || [],
      recentWork: (raw && raw.recentWork) || [],
      currentWork: (raw && raw.currentWork) || null,
      recentPrompt: (raw && raw.recentPrompt) || '',
      observedStatus: (raw && raw.observedStatus) || null,
      score: score
    };
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

  function workRows(limit) {
    var n = typeof limit === 'number' ? limit : 3;
    return state.agents.slice(0, n);
  }

  function inventoryRows() {
    return (state.inventory && Array.isArray(state.inventory.agents) && state.inventory.agents) || [];
  }

  function windowsLabel(kindId) {
    var row = inventoryRows().filter(function (x) {
      return resolveKind(x.kind || x.agentId) === kindId;
    })[0];
    if (!row) return 'Windows 能力检测中';
    var installed = !!(row.installed || row.isInstalled);
    var running = !!(row.running || row.isRunning);
    var channel = String(row.channel || row.surface || '').toLowerCase();
    if (running && channel.indexOf('cli') >= 0) return 'CLI 已运行 · 发送前校验终端身份';
    if (running) return '桌面 App 已运行 · 可激活发送';
    if (installed) return '桌面 App 已安装 · 支持冷启动';
    return '未检测到桌面 App';
  }

  function emit() {
    var snap = getSnapshot();
    for (var i = 0; i < listeners.length; i++) {
      try {
        listeners[i](snap);
      } catch (_) {}
    }
  }

  function getSnapshot() {
    return {
      loadPhase: state.loadPhase,
      error: state.error,
      agents: state.agents.slice(),
      inventory: state.inventory,
      attention: state.attention,
      selectedKind: state.selectedKind,
      userLocked: state.userLocked,
      receipt: state.receipt,
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
      catalog: catalogList()
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
      return parsed && parsed.snap ? parsed : null;
    } catch (_) {
      return null;
    }
  }

  function applyAgentSnap(snap, opts) {
    opts = opts || {};
    state.snapshot = snap || null;
    state.agents = projectAgents(snap);
    if (!state.userLocked) {
      if (!state.selectedKind) {
        var first = state.agents[0];
        state.selectedKind = first ? first.kind : 'codex';
      }
    }
    if (opts.stale) {
      state.loadPhase = 'stale';
      state.error = null;
    } else if (opts.error) {
      state.loadPhase = state.agents.length ? 'stale' : 'error';
      state.error = opts.error;
    } else {
      state.loadPhase = 'ready';
      state.error = null;
    }
  }

  function refresh(reason) {
    if (refreshInFlight) return refreshInFlight;
    lastRefreshAt = Date.now();
    var run = Promise.all([
      invoke('cmd_agent_center_snapshot', { args: {} }).catch(function (e) {
        return { __err: e };
      }),
      invoke('cmd_agent_install_inventory', {}).catch(function () {
        return null;
      }),
      invoke('cmd_agent_attention_snapshot', {}).catch(function () {
        return null;
      })
    ]).then(function (v) {
      var snap = v[0];
      if (snap && snap.__err) {
        if (!state.snapshot && !state.agents.length) {
          applyAgentSnap(null, { error: String((snap.__err && snap.__err.message) || snap.__err) });
        } else {
          state.loadPhase = 'stale';
          state.error = String((snap.__err && snap.__err.message) || snap.__err);
        }
      } else {
        applyAgentSnap(snap, {});
      }
      if (v[1]) state.inventory = v[1];
      if (v[2]) state.attention = v[2];
      syncMaterialsFromPrep();
      emit();
      return getSnapshot();
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

  function syncMaterialsFromPrep() {
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep) return;
    var summary =
      typeof Prep.getMaterialSummary === 'function' ? Prep.getMaterialSummary() : null;
    var refs = (summary && summary.refs) || [];
    state.materials = refs.filter(Boolean);
    if (typeof Prep.__testOnly === 'object' && Prep.__testOnly.getModel) {
      try {
        var m = Prep.__testOnly.getModel();
        if (m && typeof m.draftBody === 'string' && !state.userLocked) {
          /* draft owned by dock input when user editing */
        }
      } catch (_) {}
    }
  }

  function setSelected(kind, opts) {
    opts = opts || {};
    var k = resolveKind(kind) || kind;
    if (!k) return;
    state.selectedKind = k;
    if (opts.lock !== false) state.userLocked = true;
    if (opts.closePicker) state.pickerOpen = false;
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

  function setReceipt(receipt) {
    state.receipt = receipt || null;
    emit();
  }

  function setDraft(text, opts) {
    opts = opts || {};
    state.draft = String(text == null ? '' : text);
    if (opts.lock) state.userLocked = true;
    if (!opts.silent) emit();
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
    if (prev.state === next.state && prev.error === next.error) {
      state.capabilities[key] = next;
      return;
    }
    state.capabilities[key] = next;
    if (!opts.silent) emit();
  }

  function setVisible(v) {
    state.visible = !!v;
  }

  function bindSubscriptions() {
    unbindSubscriptions();
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
    unbindSubscriptions();
    refreshInFlight = null;
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
    resolveKind: resolveKind,
    kindOfAgent: kindOfAgent,
    projectAgent: projectAgent,
    workRows: workRows,
    windowsLabel: windowsLabel,
    setSelected: setSelected,
    setView: setView,
    setPickerOpen: setPickerOpen,
    setReceipt: setReceipt,
    setDraft: setDraft,
    setAim: setAim,
    setCapability: setCapability,
    setVisible: setVisible,
    syncMaterialsFromPrep: syncMaterialsFromPrep,
    __testOnly: {
      projectAgent: projectAgent,
      resolveKind: resolveKind,
      projectNameOf: projectNameOf,
      workLine: workLine,
      statusOf: statusOf,
      COALESCE_MS: COALESCE_MS,
      LAST_GOOD_KEY: LAST_GOOD_KEY,
      getState: function () {
        return state;
      }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
