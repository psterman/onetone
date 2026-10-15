/**
 * Now home — current-scene cockpit (see / tweak / switch).
 * Non-demo: consumes OneToneHabitRuntime. Demo (?nowDemo=1): fixtures.
 */
(function (global) {
  'use strict';

  var ROOT_ID = 'nowHomeRoot';
  var STACK_SEL = '#wbDashboardStack, .wb-dashboard-stack';

  var root = null;
  var mounted = false;
  var visible = false;
  var view = 'now';
  var live = null;
  var tier = 's1';
  var needsExpanded = false;
  var adjustOpen = false;
  var focusHabitId = '';
  var isDemo = false;
  var pending = null;
  var unsubRuntime = null;
  var attentionCache = null;
  var attentionFetchTimer = 0;
  var lastPaintHtml = '';
  var lastAttentionKey = '';
  var todayEntries = [];
  var todayFetchGen = 0;
  var todayPaintKey = '';
  var todayRefreshTimer = 0;
  var historyBound = false;
  // User armed listen from Now dock; show strip until pause/stop even if status is still ready.
  var voiceArmed = false;
  var contextOpen = false;
  var contextRows = [];
  var contextFetchGen = 0;
  var fgIdentityCache = null;
  var fgContextCache = null;
  var needDismissKey = '';
  var agentTask = null;
  var agentRows = null;
  var agentFixtureIndex = 0;
  var agentDemo = false;
  var agentHomeCache = null;
  var agentHomeFetchTimer = 0;
  var lastAgentHomeKey = '';
  var inventoryCache = null;
  var inventoryFetchTimer = 0;
  var lastInventoryKey = '';
  var agentCenterCache = null;
  var agentCenterFetchTimer = 0;
  var lastAgentCenterKey = '';
  /** Home Focus surface: focus | history | memory | connections | settings */
  var hfView = 'focus';
  var homeFocusUnsub = null;
  var homeFocusCache = null;
  var hfOverlay = ''; // pick | progress | ''
  var hfPickHtml = '';
  var hfProgressHtml = '';
  var useLegacyNow = false;
  var quietComposerBound = false;
  var materialsUnsub = null;
  var skipMaterialsPaint = false;
  var lastMaterialsPaintKey = '';

  function quietDraftStorageKey(vm) {
    if (!vm || !vm.confirmed) return 'onetone.quickDraft:unconfirmed';
    var id = String(vm.projectId || vm.projectName || '').trim() || 'unknown';
    return 'onetone.quickDraft:' + id;
  }

  function readQuietDraft(vm) {
    try {
      var ss = global.sessionStorage;
      if (!ss || !ss.getItem) return '';
      var raw = ss.getItem(quietDraftStorageKey(vm));
      if (!raw) return '';
      var o = JSON.parse(raw);
      return o && o.text != null ? String(o.text) : '';
    } catch (_) {
      return '';
    }
  }

  function writeQuietDraft(vm, text) {
    try {
      var ss = global.sessionStorage;
      if (!ss || !ss.setItem) return;
      ss.setItem(
        quietDraftStorageKey(vm),
        JSON.stringify({
          text: String(text || ''),
          updatedAt: Date.now(),
          projectId: (vm && (vm.projectId || vm.projectName)) || null
        })
      );
    } catch (_) {}
    // Quiet composer is a write path into the tray model — bump contentRevision.
    try {
      var Prep = global.OneToneHomePromptPrep;
      if (Prep && typeof Prep.setDraftBody === 'function') {
        Prep.setDraftBody(text, { skipSync: true });
      }
    } catch (_) {}
  }

  function migrateQuietDraft(vm) {
    if (!vm || !vm.confirmed) return;
    try {
      var ss = global.sessionStorage;
      if (!ss || !ss.getItem) return;
      var raw = ss.getItem('onetone.quickDraft:unconfirmed');
      if (!raw) return;
      var dest = quietDraftStorageKey(vm);
      if (dest === 'onetone.quickDraft:unconfirmed') return;
      if (!ss.getItem(dest)) ss.setItem(dest, raw);
      ss.removeItem('onetone.quickDraft:unconfirmed');
    } catch (_) {}
  }

  function toastQuiet(msg, kind) {
    var tone = kind || 'scheme';
    try {
      if (global.OneToneAppToast && global.OneToneAppToast.show) {
        global.OneToneAppToast.show(msg, tone);
        return;
      }
    } catch (_) {}
    try {
      if (global.parent && global.parent.OneToneToast && global.parent.OneToneToast.show) {
        global.parent.OneToneToast.show(String(msg));
      }
    } catch (_) {}
  }

  function $(id) {
    return document.getElementById(id);
  }

  function todayApi() {
    return global.OneToneNowToday;
  }

  function model() {
    return global.OneToneNowModel;
  }

  function ui() {
    return global.OneToneNowHomeUi;
  }

  function fixtures() {
    return global.OneToneNowFixtures;
  }

  function runtime() {
    return global.OneToneHabitRuntime;
  }

  function detectDemo() {
    try {
      var q = new URLSearchParams(location.search);
      return q.get('nowDemo') === '1' || q.get('agentHome') === '1';
    } catch (_) {
      return false;
    }
  }

  function detectAgentDemo() {
    try {
      var q = new URLSearchParams(location.search);
      return q.get('nowDemo') === '1' || q.get('agentHome') === '1';
    } catch (_) {
      return false;
    }
  }

  function agentHomeApi() {
    return global.OneToneNowAgentHome;
  }

  function projectHintForHome() {
    // Prefer Home Focus confirmed/exact root — never pass display-name tokens as PathBuf.
    try {
      var p =
        (homeFocusCache && homeFocusCache.project) ||
        (global.OneToneHomeFocusStore &&
          global.OneToneHomeFocusStore.get &&
          global.OneToneHomeFocusStore.get() &&
          global.OneToneHomeFocusStore.get().project);
      var root = p && (p.root || p.workspacePath || p.workspace_path);
      if (!root || typeof root !== 'string') return null;
      root = String(root).trim();
      // Windows canonicalize often prefixes \\?\ — strip for PathBuf round-trip.
      if (root.indexOf('\\\\?\\') === 0) root = root.slice(4);
      else if (root.indexOf('//?/') === 0) root = root.slice(4);
      if (root.length < 2) return null;
      if (root.indexOf('/') < 0 && root.indexOf('\\') < 0 && root.indexOf(':') < 0) {
        return null;
      }
      return root;
    } catch (_) {
      return null;
    }
  }

  function fetchAgentHomeSnapshot() {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return;
    var hint = projectHintForHome();
    var args = hint ? { projectHint: hint } : {};
    ipc
      .invoke('cmd_agent_home_snapshot', args)
      .then(function (dto) {
        var key = '';
        try {
          // Do NOT key on asOf — it is "now" on every call and forces flicker.
          key = JSON.stringify({
            s: dto && dto.syncStatus,
            p: dto && dto.probeStatus,
            pid: dto && dto.project && dto.project.projectId,
            aid: dto && dto.activeSession && dto.activeSession.sessionId,
            ast: dto && dto.activeSession && dto.activeSession.status,
            at: dto && dto.activeSession && dto.activeSession.title,
            ck: dto && dto.checkpoint && dto.checkpoint.checkpointId,
            le: dto && dto.latestEvent && dto.latestEvent.eventId,
            n: dto && dto.recentSessions && dto.recentSessions.length,
            m: dto && dto.memories && dto.memories.length,
            h: hint || '',
            sa: Math.floor(Number((dto && dto.staleAgeMs) || 0) / 60000)
          });
        } catch (_) {
          key = String(Date.now());
        }
        if (key === lastAgentHomeKey) return;
        lastAgentHomeKey = key;
        agentHomeCache = dto || null;
        agentTask = null;
        agentRows = null;
        if (mounted) paint();
      })
      .catch(function () {});
  }

  function scheduleAgentHomeRefresh() {
    if (agentHomeFetchTimer) return;
    agentHomeFetchTimer = setTimeout(function () {
      agentHomeFetchTimer = 0;
      fetchAgentHomeSnapshot();
    }, 400);
  }

  function formatSessionWhen(ts) {
    var n = Number(ts) || 0;
    if (!n) return '';
    var d = Math.max(0, Date.now() - n);
    if (d < 60_000) return '刚刚';
    if (d < 3600_000) return Math.floor(d / 60_000) + ' 分钟前';
    if (d < 86400_000) return Math.floor(d / 3600_000) + ' 小时前';
    return Math.floor(d / 86400_000) + ' 天前';
  }

  function ensureAgentRows() {
    var AH = agentHomeApi();
    var out = [];
    if (AH && AH.rowsFromAttention) {
      out = AH.rowsFromAttention(attentionCache) || [];
    }
    // Append recent sessions as ledger rows (not CTA). Skip duplicates by provider+kind overload.
    var recent =
      (agentHomeCache && (agentHomeCache.recentSessions || agentHomeCache.recent_sessions)) || [];
    for (var i = 0; i < recent.length && out.length < 12; i++) {
      var s = recent[i];
      var sid = String(s.sessionId || s.session_id || '');
      var already = out.some(function (r) {
        return r.row && String(r.row.sessionId || r.row.session_id || '') === sid;
      });
      if (already) continue;
      var prov = String(s.provider || 'Agent');
      out.push({
        kind: s.isActive || s.is_active || s.status === 'running' ? 'living' : 'recent',
        provider: prov,
        title: s.title || prov + ' 会话',
        when: formatSessionWhen(s.updatedAt || s.updated_at),
        confidence: s.matchConfidence != null ? s.matchConfidence : s.match_confidence,
        evidenceTier: s.projectMatch || s.project_match || '',
        probeStatus: (agentHomeCache && (agentHomeCache.probeStatus || agentHomeCache.probe_status)) || '',
        sessionId: sid,
        row: s
      });
    }
    agentRows = out;
    return out;
  }

  function ensureAgentTask() {
    var AH = agentHomeApi();
    if (!AH) return null;
    if (agentDemo) {
      if (!agentTask || agentTask._fxIndex !== agentFixtureIndex) {
        agentTask = AH.cloneFixture(agentFixtureIndex);
        agentTask.demo = true;
        agentTask._fxIndex = agentFixtureIndex;
      }
      return agentTask;
    }
    var snap = snapshot();
    var attnKey = '';
    try {
      attnKey = JSON.stringify({
        w: attentionCache && (attentionCache.waitingKinds || attentionCache.waiting_kinds),
        r: attentionCache && attentionCache.revision,
        n: (snap.needsYou || []).map(function (x) {
          return x && x.id;
        }),
        h: lastAgentHomeKey
      });
    } catch (_) {
      attnKey = String(Date.now());
    }
    if (agentTask && agentTask._attnKey === attnKey) return agentTask;

    var fromAttn = AH.taskFromAttention(attentionCache, snap.needsYou, { demo: false });
    // Soft Pad waiting/working still wins until Plan B lifecycle events exist.
    if (fromAttn && fromAttn.snapshot && fromAttn.snapshot.status !== 'idle') {
      agentTask = fromAttn;
      agentTask._attnKey = attnKey;
      return agentTask;
    }
    if (agentHomeCache && AH.taskFromHomeSnapshot) {
      agentTask = AH.taskFromHomeSnapshot(agentHomeCache, { demo: false });
      agentTask._attnKey = attnKey;
      return agentTask;
    }
    agentTask = fromAttn;
    agentTask._attnKey = attnKey;
    return agentTask;
  }

  function buildAgentHomeView() {
    var AH = agentHomeApi();
    if (!AH || !AH.buildHomeView) return null;
    var task = ensureAgentTask();
    var view = task ? AH.buildHomeView(task) : null;
    if (view) {
      view.agentRows = ensureAgentRows();
    }
    return view;
  }

  function useRuntime() {
    var hr = runtime();
    return !isDemo && !!(hr && hr.getSnapshot && model() && model().projectFromRuntime);
  }

  function dashboardStack() {
    return document.querySelector(STACK_SEL);
  }

  function ensureLive() {
    if (live) return;
    var fx = fixtures();
    live = fx
      ? fx.cloneState(tier)
      : {
          habits: [],
          needsYou: [],
          status: { line: '' },
          system: { ok: true, label: '正常' },
          input: {}
        };
  }

  function savedMappings() {
    var cfg =
      global.OneToneState &&
      global.OneToneState.state &&
      global.OneToneState.state.config;
    var list = (cfg && cfg.mappings) || [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m) continue;
      var hp = global.OneToneHabitProfile;
      var core = global.OneToneMappingCore;
      var ok = true;
      if (hp && hp.isLibraryHabit) ok = !!hp.isLibraryHabit(m, cfg);
      else if (core && core.isSaved) ok = !!core.isSaved(m);
      if (ok) out.push(m);
    }
    return out;
  }

  function snapshot() {
    if (useRuntime()) {
      var hr = runtime();
      var rtSnap = hr.getSnapshot();
      var identity =
        global.OneToneRuntimeHabitControl &&
        global.OneToneRuntimeHabitControl.foregroundIdentity
          ? global.OneToneRuntimeHabitControl.foregroundIdentity()
          : null;
      return model().projectFromRuntime(rtSnap, savedMappings(), {
        attention: attentionCache,
        identity: identity
      });
    }
    ensureLive();
    var m = model();
    return m
      ? m.projectNowHome(live)
      : { habits: [], needsYou: [], status: { line: '' }, active: null, input: {} };
  }

  function fetchAttention() {
    if (!useRuntime()) return;
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return;
    ipc
      .invoke('cmd_agent_attention_snapshot', {})
      .then(function (attn) {
        var key = '';
        try {
          key = JSON.stringify({
            w: attn && (attn.waitingKinds || attn.waiting_kinds),
            r: attn && attn.revision
          });
        } catch (_) {
          key = String(Date.now());
        }
        if (key === lastAttentionKey) return;
        lastAttentionKey = key;
        attentionCache = attn || null;
        if (mounted) paint();
      })
      .catch(function () {});
  }

  function scheduleAttentionRefresh() {
    if (attentionFetchTimer) clearTimeout(attentionFetchTimer);
    attentionFetchTimer = setTimeout(function () {
      attentionFetchTimer = 0;
      fetchAttention();
    }, 200);
  }

  function fetchInventory() {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return;
    ipc
      .invoke('cmd_agent_install_inventory', {})
      .then(function (inv) {
        var key = '';
        try {
          var agents = (inv && inv.agents) || [];
          key = JSON.stringify(
            agents.map(function (a) {
              return [a.kind, a.running, a.presence, a.confidence];
            })
          );
        } catch (_) {
          key = String(Date.now());
        }
        if (key === lastInventoryKey) return;
        lastInventoryKey = key;
        inventoryCache = inv || null;
        if (mounted) paint();
      })
      .catch(function () {});
  }

  function fetchAgentCenter() {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return;
    ipc
      .invoke('cmd_agent_center_snapshot', {})
      .then(function (snap) {
        var key = '';
        try {
          var agents = (snap && snap.agents) || [];
          key = JSON.stringify(
            agents.map(function (a) {
              return [a.agentId, a.runtimeKind, a.status];
            })
          );
        } catch (_) {
          key = String(Date.now());
        }
        if (key === lastAgentCenterKey) return;
        lastAgentCenterKey = key;
        agentCenterCache = snap || null;
        if (mounted) paint();
      })
      .catch(function () {});
  }

  function scheduleAgentCenterRefresh() {
    if (agentCenterFetchTimer) return;
    agentCenterFetchTimer = setTimeout(function () {
      agentCenterFetchTimer = 0;
      fetchAgentCenter();
    }, 200);
  }

  function scheduleInventoryRefresh() {
    if (inventoryFetchTimer) return;
    inventoryFetchTimer = setTimeout(function () {
      inventoryFetchTimer = 0;
      fetchInventory();
    }, 800);
  }

  function hasFgExe(identity) {
    return !!(identity && String(identity.exeName || identity.exe_name || '').trim());
  }

  function isSelfFgIdentity(identity) {
    if (!identity) return true;
    var exe = String(identity.exeName || identity.exe_name || '').toLowerCase();
    if (exe.indexOf('onetone') >= 0) return true;
    var path = String(identity.fullPath || identity.full_path || '').toLowerCase();
    return path.indexOf('onetone') >= 0 || path.indexOf('voice-pilot') >= 0;
  }

  function isTrayFgIdentity(identity) {
    var exe = String((identity && (identity.exeName || identity.exe_name)) || '').toLowerCase();
    return (
      exe === 'explorer.exe' ||
      exe === 'shellexperiencehost.exe' ||
      exe === 'startmenuexperiencehost.exe' ||
      exe === 'searchhost.exe' ||
      exe === 'applicationframehost.exe' ||
      exe === 'textinputhost.exe' ||
      exe === 'lockapp.exe' ||
      exe === 'systemsettings.exe'
    );
  }

  function isUsableFg(identity) {
    return hasFgExe(identity) && !isSelfFgIdentity(identity) && !isTrayFgIdentity(identity);
  }

  /** Prefer workbench-noted identity; never let empty IPC {} block a good one. */
  function resolveFgIdentity() {
    var rt =
      global.OneToneRuntimeHabitControl &&
      global.OneToneRuntimeHabitControl.foregroundIdentity
        ? global.OneToneRuntimeHabitControl.foregroundIdentity()
        : null;
    if (isUsableFg(rt)) return rt;
    if (isUsableFg(fgIdentityCache)) return fgIdentityCache;
    return null;
  }

  function projectHintFromIdentity(identity) {
    if (!isUsableFg(identity)) return { text: '未发现', inferred: false };
    var exe = String(identity.exeName || identity.exe_name || '').toLowerCase();
    var title = String(identity.windowTitle || identity.window_title || '').trim();
    var editors =
      /^(cursor|code|code - insiders|windsurf|trae|zed|webstorm|idea64|pycharm64|devenv)\.exe$/;
    if (!editors.test(exe)) return { text: '未发现', inferred: false };
    var parts = title.split(/\s+[—–\-]\s+/);
    var cand = '';
    if (parts.length >= 2) cand = parts[parts.length - 2] || parts[0];
    else cand = parts[0] || '';
    cand = String(cand || '')
      .replace(/\s*[·|].*$/, '')
      .replace(/\.(tsx?|jsx?|rs|py|md|json|html?)$/i, '')
      .trim();
    if (!cand || cand.length < 2 || cand.length > 48) return { text: '未发现', inferred: false };
    if (/^(untitled|无标题|new folder|desktop)$/i.test(cand)) {
      return { text: '未发现', inferred: false };
    }
    return { text: cand, inferred: true };
  }

  function agentFactFromAttention(attn, needs) {
    var list = Array.isArray(needs) ? needs : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && (list[i].id === 'approve_rm' || list[i].id === 'view_reply')) {
        return { text: list[i].title || '在等你', waiting: true };
      }
    }
    var kinds = (attn && (attn.waitingKinds || attn.waiting_kinds)) || [];
    if (kinds.length) return { text: '在等你', waiting: true };
    return { text: '空闲', waiting: false };
  }

  function displayAppName(identity) {
    if (!isUsableFg(identity)) return '未发现';
    var name = String(
      identity.displayName ||
        identity.exeName ||
        identity.exe_name ||
        identity.appId ||
        ''
    ).trim();
    if (!name) return '未发现';
    // Strip .exe for display when that's all we have
    if (/\.exe$/i.test(name) && name.indexOf(' ') < 0) {
      name = name.replace(/\.exe$/i, '');
    }
    return name;
  }

  function buildNowFacts(snap, agentView) {
    var ctx = fgContextCache;
    var identity = resolveFgIdentity();
    var app =
      (ctx && ctx.appName) ||
      (ctx && ctx.selfForeground ? 'OneTone' : '') ||
      displayAppName(identity);
    var proj = { text: '未发现', inferred: false };
    if (ctx && ctx.projectName) {
      proj = {
        text: String(ctx.projectName),
        inferred: !!ctx.projectInferred
      };
    } else {
      proj = projectHintFromIdentity(identity);
    }
    if (!agentView) {
      try {
        agentView = buildAgentHomeView();
      } catch (_) {}
    }
    var match = (ctx && ctx.match) || '';
    var matchLabel =
      match === 'exact'
        ? '已匹配'
        : match === 'probable'
          ? '可能匹配'
          : match === 'unknown'
            ? '未匹配专属习惯'
            : '';
    return {
      hero: app,
      app: app || '未发现',
      project: proj.text,
      projectInferred: !!proj.inferred,
      processName:
        (ctx && ctx.processName) ||
        (identity ? String(identity.exeName || identity.exe_name || '') : ''),
      habitName: (ctx && ctx.habitName) || '',
      habitId: (ctx && ctx.habitId) || '',
      match: match,
      matchLabel: matchLabel,
      selfForeground: !!(ctx && ctx.selfForeground),
      detectedAt: (ctx && ctx.detectedAt) || 0,
      presence: '不知道',
      agentLine: agentView ? agentView.contextLine : '',
      agentWaiting: !!(agentView && agentView.status === 'waiting_approval')
    };
  }

  function criticalNeedOf(snap, agentView) {
    if (!agentView) {
      try {
        var AH = agentHomeApi();
        agentView = AH && AH.buildHomeView ? buildAgentHomeView() : null;
      } catch (_) {}
    }
    // Agent home owns waiting / running UX; skip Soft Pad duplicate need cards.
    if (
      agentView &&
      (agentView.status === 'waiting_approval' ||
        agentView.status === 'running' ||
        agentView.status === 'failed')
    ) {
      return null;
    }

    var list = (snap && snap.needsYou) || [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      if (!n) continue;
      if (n.id === 'approve_rm' || n.id === 'view_reply') {
        var key = String(n.id) + ':' + String(n.title || '') + ':' + String(n.detail || '');
        if (needDismissKey && key === needDismissKey) continue;
        return n;
      }
    }
    return null;
  }

  // Plan B: persist lifecycle via IPC; checkpoint resume stays Plan C no-op.
  function persistLifecycle(task, eventType, summary) {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke || !task || !task.snapshot) return Promise.resolve(null);
    var sessionId = task.snapshot.runId;
    if (!sessionId || sessionId === 'home_idle') return Promise.resolve(null);
    var provider = String(task.profileId || 'cursor')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (provider === 'cursorcli' || provider === 'cursor') provider = 'cursor';
    return ipc
      .invoke('cmd_agent_lifecycle_event', {
        sessionId: sessionId,
        provider: provider || 'cursor',
        eventType: eventType,
        summary: summary || eventType
      })
      .then(function (res) {
        scheduleAgentHomeRefresh();
        return res;
      })
      .catch(function () {
        return null;
      });
  }

  function resumeCheckpoint(task) {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke || !task || !task.snapshot) return Promise.resolve(null);
    var sessionId = task.snapshot.runId;
    if (!sessionId || sessionId === 'home_idle') return Promise.resolve(null);
    return ipc
      .invoke('cmd_agent_checkpoint_resume', { sessionId: sessionId })
      .then(function (res) {
        if (res && res.ok && res.brief) {
          var brief = res.brief.brief || '';
          if (brief) {
            task.context = task.context || [];
            task.context.unshift({ label: brief });
          }
          if (res.brief.checkpoint && res.brief.checkpoint.checkpointId) {
            task.snapshot.checkpointId = res.brief.checkpoint.checkpointId;
          }
        }
        scheduleAgentHomeRefresh();
        return res;
      })
      .catch(function () {
        return null;
      });
  }

  function handleAgentAct(act) {
    var AH = agentHomeApi();
    var task = ensureAgentTask();
    if (!AH || !task) return;

    if (act === 'pause' || act === 'pause-task') {
      AH.applyLocalStatus(task, 'paused');
      lastPaintHtml = '';
      paint();
      if (!agentDemo) persistLifecycle(task, 'task_paused', '已暂停状态更新');
      return;
    }
    if (act === 'abort') {
      AH.applyLocalStatus(task, 'cancelled');
      lastPaintHtml = '';
      paint();
      if (!agentDemo) persistLifecycle(task, 'session_aborted', '已停止这次处理');
      return;
    }
    if (act === 'resume' || act === 'approve') {
      if (agentDemo) {
        AH.applyLocalStatus(task, 'running');
        lastPaintHtml = '';
        paint();
      } else if (
        act === 'resume' &&
        task.snapshot &&
        (task.snapshot.status === 'paused' ||
          task.snapshot.status === 'failed' ||
          task.snapshot.checkpointId)
      ) {
        AH.applyLocalStatus(task, 'running');
        lastPaintHtml = '';
        paint();
        var resumeP = task.snapshot.checkpointId
          ? resumeCheckpoint(task)
          : persistLifecycle(task, 'task_resumed', '已继续');
        resumeP.then(function () {
          lastPaintHtml = '';
          paint();
        });
      } else {
        openNeedSurface();
      }
      return;
    }
    if (act === 'continue-last') {
      if (agentDemo) {
        openNeedSurface();
        return;
      }
      resumeCheckpoint(task).then(function (res) {
        lastPaintHtml = '';
        paint();
        if (!(res && res.ok)) openNeedSurface();
      });
      return;
    }
    if (act === 'detail') {
      openNeedSurface();
      return;
    }
    if (act === 'hand') {
      // Voice dock is the real handoff; nudge listen if available.
      try {
        var dock = root && root.querySelector('[data-now-voice]');
        if (dock) dock.click();
      } catch (_) {}
    }
  }

  function openNeedSurface() {
    var ipc = global.OneToneIpc;
    if (ipc && ipc.invoke) {
      ipc.invoke('cmd_soft_pad_force_open', {}).catch(function () {});
    }
    try {
      if (global.OneToneSoftPadHub && global.OneToneSoftPadHub.openPanel) {
        global.OneToneSoftPadHub.openPanel();
      }
    } catch (_) {}
  }

  var fgPollTimer = 0;

  function applyFgContext(ctx) {
    if (!ctx || typeof ctx !== 'object') return false;
    var prev = fgContextCache;
    var prevKey = prev
      ? [
          prev.appName || '',
          prev.processName || '',
          prev.fullPath || '',
          prev.projectName || '',
          prev.habitId || '',
          prev.match || '',
          prev.selfForeground ? '1' : '0'
        ].join('|')
      : '';
    var nextKey = [
      ctx.appName || '',
      ctx.processName || '',
      ctx.fullPath || '',
      ctx.projectName || '',
      ctx.habitId || '',
      ctx.match || '',
      ctx.selfForeground ? '1' : '0'
    ].join('|');
    fgContextCache = ctx;
    // Only note runtime identity when we have a stable path/class signature.
    // Incomplete identity (exe-only) would flip fgSignature and flicker the page.
    if (
      !ctx.selfForeground &&
      (ctx.fullPath || ctx.windowClass) &&
      (ctx.processName || ctx.appName)
    ) {
      applyFgIdentity({
        exeName: ctx.processName || '',
        fullPath: ctx.fullPath || '',
        windowClass: ctx.windowClass || '',
        windowTitle: ctx.windowTitle || '',
        displayName: ctx.appName || '',
        appId: ctx.appId || null,
        matchedPresetAppId: ctx.appId || null
      });
    }
    return prevKey !== nextKey;
  }

  function applyFgIdentity(res) {
    if (!isUsableFg(res)) return false;
    var prev = fgIdentityCache;
    // Title changes constantly in editors — do not treat as FG identity change.
    var prevKey =
      (prev && (prev.exeName || prev.exe_name || '')) +
      '|' +
      (prev && (prev.fullPath || prev.full_path || '')) +
      '|' +
      (prev && (prev.windowClass || prev.window_class || '')) +
      '|' +
      (prev && (prev.appId || prev.matchedPresetAppId || prev.matched_preset_app_id || ''));
    var nextKey =
      (res.exeName || res.exe_name || '') +
      '|' +
      (res.fullPath || res.full_path || '') +
      '|' +
      (res.windowClass || res.window_class || '') +
      '|' +
      (res.appId || res.matchedPresetAppId || res.matched_preset_app_id || '');
    // Keep newest title for project hint, but only repaint when stable fields change.
    var titleOnly =
      !!prev &&
      prevKey === nextKey &&
      String(prev.windowTitle || prev.window_title || '') !==
        String(res.windowTitle || res.window_title || '');
    fgIdentityCache = res;
    try {
      var rt = global.OneToneRuntimeHabitControl;
      if (rt && rt.noteForegroundIdentity) rt.noteForegroundIdentity(res);
    } catch (_) {}
    if (prevKey === nextKey) {
      // Update project hint quietly when only the window title changed.
      if (titleOnly && fgContextCache && !fgContextCache.selfForeground) {
        var proj = projectHintFromIdentity(res);
        var prevProj = String(fgContextCache.projectName || '');
        var nextProj = proj.text === '未发现' ? '' : String(proj.text || '');
        if (prevProj !== nextProj) {
          fgContextCache.projectName = nextProj || null;
          fgContextCache.projectInferred = !!proj.inferred && !!nextProj;
          return true;
        }
      }
      return false;
    }
    return true;
  }

  function refreshForeground() {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return;
    ipc
      .invoke('cmd_foreground_context_snapshot', {})
      .then(function (ctx) {
        if (ctx && (ctx.appName || ctx.processName || ctx.habitId || ctx.selfForeground)) {
          var changed = applyFgContext(ctx);
          // Do not clear lastPaintHtml — paint() already skips identical HTML.
          if (changed && mounted && visible) paint();
          return null;
        }
        // Fall back to older FG cmds if snapshot is empty.
        return ipc
          .invoke('cmd_habit_foreground_app', {})
          .catch(function () {
            return null;
          })
          .then(function (held) {
            if (isUsableFg(held)) return held;
            return ipc.invoke('cmd_foreground_app', {}).catch(function () {
              return held;
            });
          })
          .then(function (res) {
            var changed = applyFgIdentity(res);
            if (changed && mounted && visible) paint();
          });
      })
      .catch(function () {
        // Snapshot IPC unavailable — legacy path.
        return ipc
          .invoke('cmd_habit_foreground_app', {})
          .catch(function () {
            return null;
          })
          .then(function (held) {
            if (isUsableFg(held)) return held;
            return ipc.invoke('cmd_foreground_app', {}).catch(function () {
              return held;
            });
          })
          .then(function (res) {
            var changed = applyFgIdentity(res);
            if (changed && mounted && visible) paint();
          });
      });
  }

  function mainWindowDragActive() {
    try {
      var el = typeof document !== 'undefined' ? document.documentElement : null;
      return !!(el && el.classList && el.classList.contains('ot-drag-active'));
    } catch (_) {
      return false;
    }
  }

  function startFgPoll() {
    if (fgPollTimer) return;
    refreshForeground();
    fgPollTimer = setInterval(function () {
      if (!visible) return;
      if (mainWindowDragActive()) return;
      refreshForeground();
    }, 2000);
  }

  function stopFgPoll() {
    if (!fgPollTimer) return;
    clearInterval(fgPollTimer);
    fgPollTimer = 0;
  }

  function openContextPanel() {
    contextOpen = true;
    var gen = ++contextFetchGen;
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) {
      contextRows = [];
      paint();
      return;
    }
    ipc
      .invoke('cmd_context_snapshot_get', {})
      .then(function (dto) {
        if (gen !== contextFetchGen) return;
        var rows = [];
        if (!dto) {
          contextRows = [];
          paint();
          return;
        }
        function add(k, v) {
          if (v == null || v === '') return;
          rows.push({ k: k, v: String(v) });
        }
        add('你在不在', dto.presence);
        add('摄像头数据', dto.presenceFresh ? '刚上报' : '未开或已超时');
        add('说明', dto.presenceNote);
        add('你在做什么', dto.activity);
        add('专注程度', dto.focus);
        add('Agent 状态', dto.agentState);
        contextRows = rows;
        lastPaintHtml = '';
        paint();
      })
      .catch(function () {
        if (gen !== contextFetchGen) return;
        contextRows = [];
        paint();
      });
    paint();
  }

  function detectLegacyNow() {
    try {
      var q = new URLSearchParams(location.search);
      return q.get('legacyNow') === '1';
    } catch (_) {
      return false;
    }
  }

  // Thin Agent desk (Home Focus) is the default home. Opt out with ?now=0
  // or localStorage onetone.nowHome=0. Workbench trigger channels remain via
  // ?now=0 / legacy preferences.
  function isEnabled() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('now') === '0') return false;
      if (q.get('now') === '1') return true;
      var ls = global.localStorage && global.localStorage.getItem('onetone.nowHome');
      if (ls === '0') return false;
      if (ls === '1') return true;
      return true;
    } catch (_) {
      return true;
    }
  }

  function smokeFeedbackNodes() {
    var out = [];
    var a = $('codexSmokeFeedback');
    var b = $('claudeSmokeFeedback');
    if (a) out.push(a);
    if (b) out.push(b);
    return out;
  }

  function setSmokeFeedbackHidden(hidden) {
    smokeFeedbackNodes().forEach(function (el) {
      el.hidden = !!hidden;
      if (hidden) el.setAttribute('aria-hidden', 'true');
      else el.removeAttribute('aria-hidden');
    });
  }

  function useHomeFocusSurface() {
    return !useLegacyNow && !isDemo && !agentDemo && view !== 'scenes';
  }

  function ensureHomeFocusStore() {
    var S = global.OneToneHomeFocusStore;
    if (!S) return;
    if (homeFocusUnsub) return;
    homeFocusUnsub = S.subscribe(function (dto) {
      homeFocusCache = dto || null;
      if (mounted && useHomeFocusSurface()) {
        lastPaintHtml = '';
        // Project root may become available after confirm — refresh home snapshot filter.
        scheduleAgentHomeRefresh();
        scheduleAgentCenterRefresh();
        paint();
      }
    });
    S.fetch();
    S.startPolling(5000);
    scheduleAgentCenterRefresh();
  }

  /** In-memory dismiss of return Hero so Quiet Composer / agent jump can run. */
  var dismissedReturnKey = '';

  function returnResumeKey(vm) {
    var ck = agentHomeCache && agentHomeCache.checkpoint;
    if (ck && (ck.checkpointId || ck.sessionId)) {
      return String(ck.checkpointId || '') + '|' + String(ck.sessionId || '');
    }
    var w = (vm && vm.dto && vm.dto.work) || {};
    return (
      String(w.updatedAt || '') +
      '|' +
      String(w.title || '') +
      '|' +
      String(w.description || '')
    );
  }

  function isReturnDismissed(vm) {
    return !!(dismissedReturnKey && vm && dismissedReturnKey === returnResumeKey(vm));
  }

  function dismissReturnFor(vm) {
    dismissedReturnKey = returnResumeKey(vm);
  }

  function clearReturnDismiss() {
    dismissedReturnKey = '';
  }

  /** Return → Quiet Composer without deleting checkpoint. */
  function forceQuietStart(vm) {
    if (!vm) return vm;
    vm.mode = 'quiet';
    vm.primary = null;
    vm.secondary = null;
    vm.continuation = null;
    vm._returnDismissed = true;
    if (vm.desk) vm.desk.continueCard = null;
    return vm;
  }

  function buildHomeFocusVm() {
    var A = global.OneToneHomeFocusAdapter;
    if (!A || !A.toViewModel) return null;
    var vm = A.toViewModel(
      homeFocusCache || (global.OneToneHomeFocusStore && global.OneToneHomeFocusStore.get())
    );
    if (vm && A.enrichFromAttention) {
      vm = A.enrichFromAttention(vm, attentionCache);
    }
    if (vm && A.enrichFromHomeSnapshot) {
      vm = A.enrichFromHomeSnapshot(vm, agentHomeCache);
    }
    if (vm && A.enrichFromInventory) {
      vm = A.enrichFromInventory(vm, inventoryCache, attentionCache);
    }
    if (vm && vm.mode === 'return' && isReturnDismissed(vm)) {
      vm = forceQuietStart(vm);
    }
    return vm;
  }

  function renderHomeFocusHtml(voice) {
    var V = global.OneToneHomeFocusView;
    var Sec = global.OneToneHomeSecondaryViews;
    var vm = buildHomeFocusVm() || {
      mode: 'degraded',
      headline: '正在准备当前情境…',
      assistance: '正在读取前台应用与项目依据。',
      presence: { line: '未发现应用 · 未知项目', note: '不会用猜测填充首页' },
      evidence: [],
      primary: { id: 'retry', label: '重试' },
      appName: '未发现应用',
      projectName: '未知项目',
      title: '正在准备',
      copy: '正在读取当前工作…'
    };

    if (hfView === 'habits') {
      return Sec && Sec.renderHabits ? Sec.renderHabits() : '';
    }
    if (hfView === 'history') {
      // Drawer is preferred; keep page as deep-link fallback.
      var sessions = buildHistoryEntries()
        .filter(function (e) {
          return e.kind === 'session';
        })
        .map(function (e) {
          return { title: e.title, when: e.when, provider: e.badge };
        });
      return Sec && Sec.renderHistory
        ? Sec.renderHistory({ sessions: sessions })
        : '';
    }
    if (hfView === 'memory') {
      var memories = [];
      try {
        var mems = (agentHomeCache && agentHomeCache.memories) || [];
        memories = mems.map(function (m) {
          return { content: m.content || '', when: m.memoryType || '项目记忆' };
        });
      } catch (_) {}
      return Sec && Sec.renderMemory
        ? Sec.renderMemory({ memories: memories })
        : '';
    }
    if (hfView === 'connections') {
      return Sec && Sec.renderConnections
        ? Sec.renderConnections({
            source: (homeFocusCache && homeFocusCache.source) || {},
            provider: (homeFocusCache && homeFocusCache.provider) || {}
          })
        : '';
    }
    if (hfView === 'settings') {
      return Sec && Sec.renderSettings
        ? Sec.renderSettings({ legacyNote: '也可使用演示参数 ?legacyNow=1 查看旧首页。' })
        : '';
    }

    migrateQuietDraft(vm);
    ensureQuietMaterialsSub();
    var Policy = global.OneToneHomeActionPolicy;
    var cap =
      Policy && Policy.resolveQuickHandoffTarget
        ? Policy.resolveQuickHandoffTarget(vm, agentCenterCache)
        : { kind: 'unavailable' };
    var draftText = readQuietDraft(vm);
    var Prep = global.OneToneHomePromptPrep;
    var materialSummary =
      Prep && Prep.getMaterialSummary ? Prep.getMaterialSummary() : { count: 0, byKind: {}, refs: [] };
    var probeTargets = listProbeJumpTargets(agentCenterCache, inventoryCache);
    var hasDraft = !!String(draftText || '').trim();
    var hasMats = !!(materialSummary && Number(materialSummary.count) > 0);
    var html =
      V && V.renderFocus
        ? V.renderFocus(vm, {
            listening: !!(voice && voice.listening),
            draftText: draftText,
            draftPreview: draftText,
            materialSummary: materialSummary,
            probeTargets: probeTargets,
            resumeAvailable: !!vm._returnDismissed,
            handoffAct:
              Policy && Policy.handoffActForCap
                ? Policy.handoffActForCap(cap)
                : 'quick_handoff',
            handoffLabel:
              Policy && Policy.handoffLabelForCap
                ? Policy.handoffLabelForCap(cap)
                : '复制并打开 Agent',
            handoffDisabled: !hasDraft && !hasMats,
            voiceHtml: (function () {
              var U = ui();
              if (!U || !U.renderDock) return '';
              var snap = snapshot();
              var strip =
                U.renderVoiceStrip && typeof U.renderVoiceStrip === 'function'
                  ? U.renderVoiceStrip()
                  : '';
              return (
                '<div class="hn-dock-wrap">' +
                strip +
                U.renderDock({
                  voiceOn: !(snap.input && snap.input.voice === false),
                  listening: !!(voice && voice.listening),
                  hotkey:
                    (snap.input && (snap.input.hotkeyLabel || snap.input.hotkey)) || ''
                }) +
                '</div>'
              );
            })()
          })
        : '';
    if (hfOverlay === 'pick' && hfPickHtml) html += hfPickHtml;
    if (hfOverlay === 'progress' && hfProgressHtml) html += hfProgressHtml;
    return html;
  }

  function materialsPaintKey(summary) {
    summary = summary || {};
    var by = summary.byKind || {};
    var refs = summary.refs || [];
    var refSig = refs
      .map(function (r) {
        return r && r.id ? r.id : '';
      })
      .join(',');
    return (
      String(summary.collectionId || '') +
      ':' +
      String(summary.count || 0) +
      ':' +
      String(summary.manualUploadCount || 0) +
      ':' +
      Object.keys(by)
        .sort()
        .map(function (k) {
          return k + '=' + by[k];
        })
        .join(',') +
      ':' +
      refSig
    );
  }

  function ensureQuietMaterialsSub() {
    if (materialsUnsub) return;
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || typeof Prep.subscribeMaterials !== 'function') return;
    skipMaterialsPaint = true;
    materialsUnsub = Prep.subscribeMaterials(function (summary) {
      if (skipMaterialsPaint) {
        lastMaterialsPaintKey = materialsPaintKey(summary);
        return;
      }
      if (!mounted || !useHomeFocusSurface()) return;
      var key = materialsPaintKey(summary);
      if (key === lastMaterialsPaintKey) return;
      lastMaterialsPaintKey = key;
      lastPaintHtml = '';
      paint();
    });
    skipMaterialsPaint = false;
  }

  /** Agent icon tiles — builtins + install inventory (app / CLI) for homepage handoff. */
  function listProbeJumpTargets(snap, inv) {
    var Policy = global.OneToneHomeActionPolicy;
    var agents = (snap && snap.agents) || [];
    var order =
      Policy && Policy.PROBE_KINDS && Policy.PROBE_KINDS.length
        ? Policy.PROBE_KINDS
        : ['cursor', 'claude', 'chatgpt', 'minimax', 'workbuddy', 'trae', 'traeCode', 'qoder'];
    inv = inv || inventoryCache;
    var invByProbe = {};
    var invAgents = (inv && (inv.agents || inv.Agents)) || [];
    for (var ii = 0; ii < invAgents.length; ii++) {
      var row = invAgents[ii];
      if (!row) continue;
      var pk =
        Policy && Policy.inventoryKindToProbe
          ? Policy.inventoryKindToProbe(row.kind || row.Kind)
          : String(row.kind || row.Kind || '')
              .toLowerCase()
              .replace(/^kind:/, '');
      if (!pk || invByProbe[pk]) continue;
      invByProbe[pk] = row;
    }
    var Presets = global.OneToneAppTargetPresets;
    var Hub = global.OneToneSoftPadHub || global.OneToneSoftPadHubUi;
    var out = [];
    for (var i = 0; i < order.length; i++) {
      var want = order[i];
      var found = null;
      for (var j = 0; j < agents.length; j++) {
        var a = agents[j];
        if (!a || !a.agentId) continue;
        var kind =
          Policy && Policy.canonicalKind
            ? Policy.canonicalKind(a.runtimeKind || a.agentId)
            : String(a.runtimeKind || a.agentId || '')
                .toLowerCase()
                .replace(/^kind:/, '');
        if (kind !== want) continue;
        if (Policy && Policy.agentCanFocus && !Policy.agentCanFocus(a)) continue;
        found = a;
        break;
      }
      var invRow = invByProbe[want] || null;
      var evidence = (invRow && (invRow.evidence || invRow.Evidence)) || [];
      var hasCli = false;
      var hasApp = false;
      for (var e = 0; e < evidence.length; e++) {
        var ek = String((evidence[e] && (evidence[e].kind || evidence[e].Kind)) || '');
        if (ek === 'cli' || ek === 'embedded') hasCli = true;
        if (ek === 'desktop' || ek === 'package') hasApp = true;
      }
      var presence = String((invRow && (invRow.presence || invRow.Presence)) || '');
      if (presence === 'cli') hasCli = true;
      if (presence === 'desktop' || presence === 'package') hasApp = true;
      var installed = !!(
        invRow &&
        (invRow.running ||
          invRow.Running ||
          String(invRow.confidence || invRow.Confidence || '') === 'high' ||
          hasCli ||
          hasApp)
      );
      var channel = hasCli && !hasApp ? 'cli' : hasCli && hasApp ? 'both' : 'app';
      var appId =
        Policy && Policy.appIdForKind
          ? Policy.appIdForKind(want)
          : want === 'chatgpt'
            ? 'codex-chat'
            : '';
      var icon = '';
      if (Hub && typeof Hub.iconForKind === 'function') {
        icon = String(Hub.iconForKind(want === 'chatgpt' ? 'codex' : want) || '');
      }
      if (!icon && Presets && Presets.presetById && appId) {
        var preset = Presets.presetById(appId);
        icon = preset && preset.icon ? String(preset.icon) : '';
      }
      out.push({
        kind: want,
        label:
          Policy && Policy.displayNameForKind
            ? Policy.displayNameForKind(want)
            : want,
        agentId: found
          ? String(found.agentId)
          : Policy && Policy.syntheticAgentId
            ? Policy.syntheticAgentId(want)
            : want === 'chatgpt'
              ? 'kind:codex'
              : 'kind:' + want,
        appId: appId,
        icon: icon,
        installed: installed,
        channel: channel,
        running: !!(invRow && (invRow.running || invRow.Running))
      });
    }
    out.sort(function (a, b) {
      var ra = a.installed || a.running ? 0 : 1;
      var rb = b.installed || b.running ? 0 : 1;
      if (ra !== rb) return ra - rb;
      return order.indexOf(a.kind) - order.indexOf(b.kind);
    });
    return out;
  }

  function quietCollectMaterial(collectKind) {
    collectKind = String(collectKind || '');
    if (collectKind === 'capture') {
      var sc = global.OneToneSmartCapture;
      if (!sc || typeof sc.begin !== 'function') {
        toastQuiet('智能截图未就绪');
        return;
      }
      var PrepCap = global.OneToneHomePromptPrep;
      var vmCap = buildHomeFocusVm() || {};
      if (PrepCap && typeof PrepCap.beginMaterialCollection === 'function') {
        var beganCap = PrepCap.beginMaterialCollection({
          scopeId: vmCap.projectId || vmCap.projectName || '',
          resetIfHandedOff: true
        });
        if (beganCap && beganCap.outcome === 'busy') {
          toastQuiet('正在交接，暂不能改材料');
          return;
        }
      }
      sc.begin('home').catch(function (e) {
        toastQuiet(String((e && e.message) || e || '截图启动失败'));
      });
      return;
    }
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || typeof Prep.collectMaterial !== 'function') {
      toastQuiet('材料能力未就绪');
      return;
    }
    var vm = buildHomeFocusVm() || {};
    if (typeof Prep.beginMaterialCollection === 'function') {
      var began = Prep.beginMaterialCollection({
        scopeId: vm.projectId || vm.projectName || '',
        resetIfHandedOff: true
      });
      if (began && began.outcome === 'busy') {
        toastQuiet('正在交接，暂不能改材料');
        return;
      }
    }
    Prep.collectMaterial(collectKind)
      .then(function (res) {
        if (!res) return;
        if (res.outcome === 'added') {
          toastQuiet(res.message || '材料已加入');
          return;
        }
        if (res.outcome === 'cancelled') {
          if (res.message) toastQuiet(res.message);
          return;
        }
        toastQuiet(res.message || '加入材料失败');
      })
      .catch(function () {
        toastQuiet('加入材料失败');
      });
  }

  function handleHomeFocusAct(kind, el) {
    var vm = buildHomeFocusVm() || {};
    var Policy = global.OneToneHomeActionPolicy;
    var S = global.OneToneHomeFocusStore;

    if (kind === 'quiet_collect') {
      quietCollectMaterial((el && el.getAttribute('data-hf-collect')) || '');
      return;
    }
    if (kind === 'quiet_remove') {
      var PrepRm = global.OneToneHomePromptPrep;
      var mid = (el && el.getAttribute('data-hf-mat-id')) || '';
      if (PrepRm && typeof PrepRm.removeMaterial === 'function' && mid) {
        var rm = PrepRm.removeMaterial(mid);
        if (rm && rm.removed) toastQuiet('已移除材料');
        else toastQuiet((rm && rm.reason === 'busy' ? '正在交接，暂不能改材料' : '移除失败'));
      }
      return;
    }

    // Leave return Hero → Quiet Composer (agent jump). Checkpoint stays.
    if (kind === 'start_new_task') {
      dismissReturnFor(vm);
      lastPaintHtml = '';
      paint();
      return;
    }
    if (kind === 'restore_return') {
      clearReturnDismiss();
      lastPaintHtml = '';
      paint();
      return;
    }

    if (kind === 'close_pick' || kind === 'close_progress' || kind === 'close_drawer') {
      if (kind === 'close_drawer' && root) {
        var drawerClose = root.querySelector('#hnRecallDrawer');
        if (drawerClose) {
          drawerClose.hidden = true;
          drawerClose.classList.remove('is-history');
        }
        return;
      }
      hfOverlay = '';
      hfPickHtml = '';
      hfProgressHtml = '';
      lastPaintHtml = '';
      paint();
      return;
    }
    if (kind === 'open_scenes') {
      openHabitHub();
      return;
    }
    if (kind === 'open_settings_drawer') {
      openSettings();
      return;
    }
    if (kind === 'open_prep') {
      var Prep = global.OneToneHomePromptPrep;
      if (Prep && Prep.expand) Prep.expand();
      return;
    }
    if (kind === 'close_prep') {
      var PrepClose = global.OneToneHomePromptPrep;
      if (PrepClose && PrepClose.collapse) PrepClose.collapse();
      return;
    }
    if (kind === 'open_history') {
      openHistoryDrawer();
      return;
    }
    if (kind === 'open_agent_overview' || kind === 'choose_agent') {
      var NavOverview = global.OneToneAgentNavTarget;
      if (NavOverview && NavOverview.open) {
        NavOverview.open({
          view: 'overview',
          section: 'working',
          provider: (vm.dto && vm.dto.provider && vm.dto.provider.id) || null,
          projectId: vm.projectName || vm.projectId || null
        });
      }
      return;
    }
    // Prototype act aliases → existing policy kinds
    if (kind === 'decide') kind = 'view_progress';
    if (kind === 'continue') kind = 'resume';
    if (kind === 'restore') kind = (vm.primary && vm.primary.id) || 'confirm_project';

    if (!Policy || !Policy.execute) return;

    function openAgentOverview() {
      var Nav = global.OneToneAgentNavTarget;
      if (Nav && Nav.open) {
        Nav.open({
          view: 'overview',
          section: 'working',
          provider: (vm.dto && vm.dto.provider && vm.dto.provider.id) || null,
          projectId: vm.projectName || vm.projectId || null
        });
      }
    }

    var preferKind =
      (el && el.getAttribute && el.getAttribute('data-hf-handoff-kind')) || '';
    if (preferKind) {
      vm = Object.assign({}, vm, { handoffPreferKind: preferKind });
    }

    Policy.execute(kind, vm, {
      preferKind: preferKind || undefined,
      openVoice: function () {
        var btn = root && root.querySelector('[data-now-voice]');
        if (btn) btn.click();
      },
      openPrep: function () {
        var P = global.OneToneHomePromptPrep;
        if (P && P.expand) P.expand();
      },
      openProgress: function () {
        var Nav = global.OneToneAgentNavTarget;
        if (Nav && Nav.open) {
          Nav.open({
            view: 'overview',
            section: vm.mode === 'attention' ? 'attention' : 'working',
            provider: (vm.dto && vm.dto.provider && vm.dto.provider.id) || null,
            projectId: vm.projectName || vm.projectId || null,
            sessionId:
              (vm.dto && vm.dto.work && (vm.dto.work.sessionId || vm.dto.work.session_id)) || null
          });
        }
      },
      openPick: function () {
        if (!S) return;
        S.listProjects(20).then(function (res) {
          var projects = (res && res.projects) || [];
          var V = global.OneToneHomeFocusView;
          hfOverlay = 'pick';
          hfPickHtml = V ? V.renderPickPanel(projects) : '';
          lastPaintHtml = '';
          paint();
        });
      },
      openReason: function () {
        hfView = 'connections';
        lastPaintHtml = '';
        paint();
      },
      getDraftText: function () {
        var ta = root && root.querySelector('#hnQuietDraft');
        if (ta) return String(ta.value || '');
        return readQuietDraft(vm);
      },
      getAgentSnapshot: function () {
        return agentCenterCache;
      },
      openAgentChooser: openAgentOverview,
      openAgentOverview: openAgentOverview,
      toast: toastQuiet,
      pasteTextIntoDraft: function () {
        var clip = global.navigator && global.navigator.clipboard;
        if (!clip || typeof clip.readText !== 'function') {
          toastQuiet('无法读取剪贴板');
          return Promise.resolve();
        }
        return clip.readText().then(function (t) {
          var text = String(t || '');
          if (!text) {
            toastQuiet('剪贴板没有文字');
            return;
          }
          var ta = root && root.querySelector('#hnQuietDraft');
          var cur = ta ? String(ta.value || '') : readQuietDraft(vm);
          var next = cur ? cur.replace(/\s*$/, '') + '\n\n' + text : text;
          writeQuietDraft(vm, next);
          if (ta) {
            ta.value = next;
            setQuietHandoffDisabled(quietHandoffShouldDisable(next));
          } else {
            lastPaintHtml = '';
            paint();
          }
          toastQuiet('已粘贴文字');
        });
      }
    })
      .then(function (res) {
        if (res && res.outcome === 'clipboard_ready') {
          // Keep draft; do not invent running.
          return;
        }
        if (res && res.ok === false && res.error && res.outcome !== 'failed') {
          toastQuiet(String(res.error));
        }
        if (kind === 'confirm_project' || kind === 'pick_project') {
          migrateQuietDraft(buildHomeFocusVm() || vm);
        }
        if (S && kind !== 'quick_handoff' && kind !== 'quiet_paste_text') S.fetch();
        if (kind !== 'quiet_paste_text' && kind !== 'quick_handoff') {
          lastPaintHtml = '';
          paint();
        }
      })
      .catch(function (err) {
        var msg =
          (err && err.message) ||
          (typeof err === 'string' ? err : '') ||
          '确认失败';
        toastQuiet(msg);
        if (S) S.fetch();
        lastPaintHtml = '';
        paint();
      });
  }

  function setQuietHandoffDisabled(disabled) {
    if (!root) return;
    var nodes = root.querySelectorAll(
      '.hn-quiet-composer .hn-agent-tile, .hn-quiet-composer .hn-probe-jump'
    );
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].disabled = !!disabled;
    }
  }

  function quietHandoffShouldDisable(draftText) {
    var Prep = global.OneToneHomePromptPrep;
    var mats =
      Prep && Prep.getMaterialSummary ? Prep.getMaterialSummary() : { count: 0 };
    return !String(draftText || '').trim() && !(Number(mats.count) > 0);
  }

  function ingestDroppedFiles(fileList) {
    var files = fileList || [];
    if (!files.length) return Promise.resolve(0);
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || typeof Prep.collectMaterial !== 'function') {
      toastQuiet('材料能力未就绪');
      return Promise.resolve(0);
    }
    var vm = buildHomeFocusVm() || {};
    if (typeof Prep.beginMaterialCollection === 'function') {
      Prep.beginMaterialCollection({
        scopeId: vm.projectId || vm.projectName || '',
        resetIfHandedOff: true
      });
    }
    var chain = Promise.resolve();
    var n = Math.min(files.length, 12);
    for (var i = 0; i < n; i++) {
      (function (f) {
        var path = String((f && (f.path || f.name)) || '').trim();
        var name = String((f && f.name) || path).trim();
        var isFolder =
          !!(f && (f.isDirectory || f.type === '' && !/\.[a-z0-9]{1,8}$/i.test(name))) ||
          /[\\/]$/.test(path);
        chain = chain.then(function () {
          return Prep.collectMaterial(isFolder ? 'folder' : 'attach', {
            path: path,
            name: name
          });
        });
      })(files[i]);
    }
    return chain.then(function () {
      return n;
    });
  }

  function bindHomeMaterialDrop() {
    if (!root || root.getAttribute('data-hn-page-drop') === '1') return;
    root.setAttribute('data-hn-page-drop', '1');
    var depth = 0;
    function canvasEl() {
      return root.querySelector('.hn-canvas');
    }
    function setDropHi(on) {
      var c = canvasEl();
      if (c) c.classList.toggle('is-drop-target', !!on);
    }
    root.addEventListener('dragenter', function (e) {
      if (!e.dataTransfer) return;
      depth += 1;
      setDropHi(true);
    });
    root.addEventListener('dragleave', function () {
      depth = Math.max(0, depth - 1);
      if (!depth) setDropHi(false);
    });
    root.addEventListener('dragover', function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropHi(true);
    });
    root.addEventListener('drop', function (e) {
      if (!e.dataTransfer) return;
      // Materials sheet owns its own drop zone.
      if (e.target && e.target.closest && e.target.closest('[data-hpp-drop-zone]')) return;
      e.preventDefault();
      depth = 0;
      setDropHi(false);
      var files = e.dataTransfer.files;
      if (!files || !files.length) return;
      ingestDroppedFiles(files)
        .then(function (n) {
          if (n > 0) toastQuiet('已拖入 ' + n + ' 项到素材库');
        })
        .catch(function () {
          toastQuiet('拖入材料失败');
        });
    });
  }

  function bindQuietComposer() {
    if (!root) return;
    bindHomeMaterialDrop();
    var ta = root.querySelector('#hnQuietDraft');
    if (!ta) return;
    var vm = buildHomeFocusVm() || {};
    ta.oninput = function () {
      writeQuietDraft(vm, ta.value);
      setQuietHandoffDisabled(quietHandoffShouldDisable(ta.value));
    };
  }

  function sessionDisplayTitle(s) {
    if (!s) return '会话';
    var title = String(s.title || '').trim();
    if (title && title !== '未命名工作' && title.toLowerCase() !== 'untitled') return title;
    var prov = String(s.provider || s.agent || '').trim();
    if (prov) return prov + ' 会话';
    return '会话';
  }

  /** Merge Agent sessions + Prep work log (home/Soft Pad materials & handoffs) + quiet drafts. */
  function buildHistoryEntries() {
    var out = [];
    var seen = {};
    function push(entry) {
      if (!entry || !entry.title) return;
      var key = String(entry.kind || '') + '|' + String(entry.title) + '|' + String(entry.at || entry.when || '');
      if (seen[key]) return;
      seen[key] = true;
      out.push(entry);
    }

    try {
      var list = (agentHomeCache && (agentHomeCache.recentSessions || agentHomeCache.recent_sessions)) || [];
      for (var i = 0; i < list.length && i < 16; i++) {
        var s = list[i] || {};
        var at = Number(s.updatedAt || s.updated_at) || 0;
        push({
          kind: 'session',
          title: sessionDisplayTitle(s),
          when: formatSessionWhen(at),
          badge: String(s.provider || '').trim(),
          detail: '',
          at: at
        });
      }
    } catch (_) {}

    try {
      var Prep = global.OneToneHomePromptPrep;
      var log = Prep && Prep.listWorkLog ? Prep.listWorkLog() : [];
      for (var j = 0; j < log.length && j < 24; j++) {
        var w = log[j] || {};
        var wat = Date.parse(w.at) || 0;
        var badge =
          w.kind === 'handoff'
            ? '交接'
            : w.source === 'softpad'
              ? 'Soft Pad 素材'
              : '首页素材';
        push({
          kind: w.kind === 'handoff' ? 'handoff' : 'materials',
          title: String(w.title || '').trim() || badge,
          when: formatSessionWhen(wat),
          badge: badge,
          detail: String(w.detail || '').trim(),
          at: wat
        });
      }
      var handoffs = Prep && Prep.listHandoffs ? Prep.listHandoffs() : [];
      for (var h = 0; h < handoffs.length && h < 12; h++) {
        var ho = handoffs[h] || {};
        if (!ho.title) continue;
        var hat = Date.parse(ho.handedOffAt) || 0;
        push({
          kind: 'handoff',
          title: String(ho.title).trim(),
          when: formatSessionWhen(hat),
          badge: ho.targetKind ? String(ho.targetKind) : '交接',
          detail:
            (ho.materialCount ? ho.materialCount + ' 项素材' : '') ||
            (ho.chars ? ho.chars + ' 字' : ''),
          at: hat
        });
      }
    } catch (_) {}

    try {
      var vm = buildHomeFocusVm() || {};
      var draft = readQuietDraft(vm);
      if (String(draft || '').trim()) {
        push({
          kind: 'draft',
          title: String(draft).replace(/\s+/g, ' ').trim().slice(0, 56),
          when: '草稿',
          badge: '首页输入',
          detail: '尚未交接',
          at: Date.now()
        });
      }
    } catch (_) {}

    out.sort(function (a, b) {
      return (Number(b.at) || 0) - (Number(a.at) || 0);
    });
    return out.slice(0, 24);
  }

  function openHistoryDrawer() {
    if (!agentHomeCache) scheduleAgentHomeRefresh();
    var V = global.OneToneHomeFocusView;
    var drawer = root && root.querySelector('#hnRecallDrawer');
    var titleEl = root && root.querySelector('#hnRecallTitle');
    var bodyEl = root && root.querySelector('#hnRecallBody');
    var entries = buildHistoryEntries();
    if (drawer && titleEl && bodyEl && V) {
      titleEl.textContent = '近期对话';
      bodyEl.innerHTML =
        V.historyDrawerBodyHtml
          ? V.historyDrawerBodyHtml(entries)
          : V.drawerHtml
            ? V.drawerHtml('history', { historyEntries: entries })
            : '';
      drawer.hidden = false;
      drawer.classList.add('is-history');
      return;
    }
    // Fallback: secondary page if drawer host missing.
    hfView = 'history';
    hfOverlay = '';
    lastPaintHtml = '';
    paint();
  }

  function mountHomeFocusChrome() {
    var vm = buildHomeFocusVm() || {};
    var stripOpts = {
      heroMode: vm.mode || '',
      primaryId: (vm.primary && vm.primary.id) || '',
      provider: (vm.dto && vm.dto.provider && vm.dto.provider.id) || '',
      projectId: vm.projectName || vm.projectId || '',
      sessionId:
        (vm.dto && vm.dto.work && (vm.dto.work.sessionId || vm.dto.work.session_id)) || ''
    };
    if (global.OneToneHomeAgentStatusStrip && global.OneToneHomeAgentStatusStrip.ensureMounted) {
      try {
        global.OneToneHomeAgentStatusStrip.ensureMounted(stripOpts);
      } catch (_) {}
    }
    if (global.OneToneHomePromptPrep && global.OneToneHomePromptPrep.ensureMounted) {
      try {
        global.OneToneHomePromptPrep.ensureMounted();
      } catch (_) {}
    }
  }

  function paint() {
    if (!root) return;
    // Title-bar drag: skip innerHTML remount (was janking consecutive moves).
    if (mainWindowDragActive()) return;
    var U = ui();
    var voice = readVoiceUi();
    var html = '';
    // Home Focus thin desk: do not hard-depend on legacy Now model/ui.
    // Missing model used to early-return with an empty root while smoke/dashboard were hidden → blank home.
    if (useHomeFocusSurface()) {
      ensureHomeFocusStore();
      if (isDemo && U && U.renderDemoBar) {
        html += U.renderDemoBar({
          tier: tier,
          agentDemo: agentDemo,
          agentFixtureIndex: agentFixtureIndex
        });
      }
      html += renderHomeFocusHtml(voice);
      if (html === lastPaintHtml) {
        syncVoiceStrip(voice);
        mountHomeFocusChrome();
        bindQuietComposer();
        return;
      }
      lastPaintHtml = html;
      root.innerHTML = html;
      syncVoiceStrip(voice);
      mountHomeFocusChrome();
      bindQuietComposer();
      scheduleAgentCenterRefresh();
      return;
    }
    if (!U || !model()) return;
    var snap = snapshot();
    snap.today = todayEntries;
    var agentHome = buildAgentHomeView();
    if (isDemo) {
      html += U.renderDemoBar({
        tier: tier,
        agentDemo: agentDemo,
        agentFixtureIndex: agentFixtureIndex
      });
    }
    if (view === 'scenes') {
      html += U.renderScenesView({
        snapshot: snap,
        focusHabitId: focusHabitId,
        runtimeMode: useRuntime()
      });
    } else {
      // Keep dock listening out of paint HTML — syncVoiceStrip patches it live.
      // Otherwise voice flaps force full innerHTML replace and reset scroll.
      var paintVoice = {
        listening: false,
        liveText: '',
        isHint: false,
        statusLine: '',
        hintLine: ''
      };
      html += U.renderNowView({
        snapshot: snap,
        needsExpanded: needsExpanded,
        adjustOpen: adjustOpen,
        pending: pending,
        voice: paintVoice,
        facts: buildNowFacts(snap, agentHome),
        agentHome: agentHome,
        criticalNeed: criticalNeedOf(snap, agentHome),
        contextPanel: contextOpen
          ? { open: true, rows: contextRows }
          : { open: false, rows: [] }
      });
    }
    if (html === lastPaintHtml) {
      syncVoiceStrip(voice);
      return;
    }
    lastPaintHtml = html;
    root.innerHTML = html;
    syncVoiceStrip(voice);

    if (view === 'scenes' && focusHabitId) {
      var el = $('now-habit-' + focusHabitId);
      if (el && el.scrollIntoView) {
        setTimeout(function () {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 40);
      }
      if (focusHabitId === 'new') {
        var input = $('nowNewName');
        if (input) input.focus();
      }
    }
  }

  function readVoiceUi() {
    var summary =
      global.OneToneVoiceHomeSummary && global.OneToneVoiceHomeSummary.compute
        ? global.OneToneVoiceHomeSummary.compute()
        : {};
    var paused = !!(
      global.OneToneState &&
      global.OneToneState.runtime &&
      global.OneToneState.runtime.paused
    );
    if (paused) voiceArmed = false;
    var dictating = !!summary.dictating || summary.statusMode === 'dictating';
    var mode = String(summary.statusMode || '');
    var engineLive =
      dictating || mode === 'listening' || mode === 'triggered' || mode === 'LISTENING';
    var listening = !paused && (engineLive || voiceArmed);
    var liveText = '';
    var isHint = false;
    try {
      var parts =
        global.OneToneHomeV9 && global.OneToneHomeV9.micHeardLiveParts
          ? global.OneToneHomeV9.micHeardLiveParts()
          : null;
      if (parts) {
        liveText = String(parts.finalized || '') + String(parts.pending || '');
      }
    } catch (_) {}
    if (!liveText) {
      var heard = String(summary.heardLine || '').trim();
      if (heard) {
        liveText = heard.replace(/^[^：:]{1,12}[：:]\s*/, '');
      }
    }
    if (!liveText && listening) {
      liveText = '请对着麦克风说话…';
      isHint = true;
    }
    return {
      paused: paused,
      dictating: dictating,
      listening: listening,
      liveText: liveText,
      isHint: isHint,
      statusLine: dictating ? '听写中…' : listening ? '正在听…' : '',
      hintLine: dictating ? '说结束语或点停止' : '说完点停止，或按快捷键结束'
    };
  }

  var lastVoiceCmdHit = null;
  var lastVoiceCmdArmed = false;

  function normalizeVoiceCmdText(s) {
    return String(s || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[，。！？、·…\-_/\\:：]/g, '');
  }

  function collectVoiceCmdTargets() {
    var out = [];
    if (!root) return out;
    var nodes = root.querySelectorAll(
      '[data-voice-phrases], .hn-agent-tile[data-hf-handoff-kind], .hn-desk-row[data-hf-act], .hn-cta[data-hf-act], .hn-top-btn[data-hf-act], [data-home-agent-status-cta], .home-agent-status'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el.disabled || el.hidden) continue;
      var phrases = [];
      var raw = el.getAttribute('data-voice-phrases') || '';
      if (raw) {
        raw.split('|').forEach(function (p) {
          if (p && phrases.indexOf(p) < 0) phrases.push(p);
        });
      }
      var nameEl = el.querySelector('.hn-agent-tile__name, .hn-desk-title, .home-agent-status__text b');
      if (nameEl && nameEl.textContent) phrases.push(String(nameEl.textContent).trim());
      var kind = el.getAttribute('data-hf-handoff-kind') || '';
      if (kind) phrases.push(kind);
      var act = el.getAttribute('data-hf-act') || '';
      if (act && act !== 'quick_handoff') phrases.push(act);
      phrases = phrases.filter(Boolean);
      if (!phrases.length) continue;
      out.push({ el: el, phrases: phrases });
    }
    return out;
  }

  function scoreVoiceCmd(text, phrase) {
    var a = normalizeVoiceCmdText(text);
    var b = normalizeVoiceCmdText(phrase);
    if (!a || !b || b.length < 2) return 0;
    if (a === b) return 1;
    if (a.indexOf(b) >= 0) return 0.92;
    if (b.indexOf(a) >= 0 && a.length >= 2) return 0.78;
    return 0;
  }

  function bestVoiceCmdHit(liveText) {
    var text = String(liveText || '').trim();
    if (!text || text.indexOf('请对着') === 0) return null;
    var targets = collectVoiceCmdTargets();
    var best = null;
    for (var i = 0; i < targets.length; i++) {
      var t = targets[i];
      var score = 0;
      for (var j = 0; j < t.phrases.length; j++) {
        score = Math.max(score, scoreVoiceCmd(text, t.phrases[j]));
      }
      if (score >= 0.78 && (!best || score > best.score)) {
        best = { el: t.el, score: score, phrases: t.phrases };
      }
    }
    return best;
  }

  function clearVoiceCmdHits() {
    if (!root) return;
    root.querySelectorAll('.is-voice-hit').forEach(function (el) {
      el.classList.remove('is-voice-hit');
    });
    var canvas = root.querySelector('.hn-canvas');
    if (canvas) canvas.classList.remove('is-voice-cmd');
    lastVoiceCmdHit = null;
  }

  function syncVoiceCommandHits(voice) {
    if (!root) return;
    var canvas = root.querySelector('.hn-canvas');
    if (!voice || !voice.listening) {
      if (lastVoiceCmdArmed && lastVoiceCmdHit && lastVoiceCmdHit.el && lastVoiceCmdHit.el.isConnected) {
        try {
          lastVoiceCmdHit.el.click();
        } catch (_) {}
      }
      lastVoiceCmdArmed = false;
      clearVoiceCmdHits();
      return;
    }
    lastVoiceCmdArmed = true;
    if (canvas) canvas.classList.add('is-voice-cmd');
    root.querySelectorAll('.is-voice-hit').forEach(function (el) {
      el.classList.remove('is-voice-hit');
    });
    var hit = bestVoiceCmdHit(voice.liveText);
    lastVoiceCmdHit = hit;
    if (hit && hit.el) hit.el.classList.add('is-voice-hit');
  }

  function syncVoiceStrip(voice) {
    if (!root || view === 'scenes') return;
    voice = voice || readVoiceUi();
    // Command mode only after 开始听写 — engine may be live from Soft Pad / park-restore.
    var cmd = !!(voice.listening && voiceArmed);
    var strip = root.querySelector('[data-now-voice-strip]');
    var dock = root.querySelector('[data-now-voice]');
    var liveEl = root.querySelector('[data-now-voice-live]');
    var statusEl = root.querySelector('[data-now-voice-status]');
    var hintEl = root.querySelector('[data-now-voice-hint]');
    if (strip) {
      if (cmd) {
        strip.hidden = false;
        strip.removeAttribute('hidden');
      } else {
        strip.hidden = true;
        strip.setAttribute('hidden', '');
      }
    }
    syncVoiceCommandHits({ listening: cmd, liveText: voice.liveText });
    if (statusEl) {
      statusEl.textContent = cmd
        ? lastVoiceCmdHit
          ? '已映射 · 说完即执行'
          : '语音命令模式'
        : voice.statusLine || '';
    }
    if (hintEl) {
      hintEl.textContent = cmd
        ? '说出卡片名称，例如 Agent 名、历史、继续'
        : voice.hintLine || '';
    }
    if (liveEl) {
      liveEl.textContent = cmd ? voice.liveText || '' : '';
      liveEl.classList.toggle('is-hint', !!(cmd && voice.isHint));
    }
    if (dock && !dock.disabled) {
      dock.classList.toggle('is-on', cmd);
      dock.textContent = cmd ? '🎤 命令中…' : '🎤 开始听写';
    }
    var dictate = root && root.querySelector('.hn-cta--dictate[data-now-voice]');
    if (dictate && !dictate.disabled) {
      dictate.textContent = cmd ? '命令中…' : '开始听写';
      dictate.setAttribute('aria-pressed', cmd ? 'true' : 'false');
    }
    var ta = root.querySelector('#hnQuietDraft');
    if (ta && ta.getAttribute('data-voice-owned') === '1' && !cmd) {
      ta.removeAttribute('data-voice-owned');
    }
  }

  function triggerVoice() {
    var voice = readVoiceUi();
    // Armed + live → dock is「命令中」: pause / stop.
    if (voice.listening && voiceArmed) {
      voiceArmed = false;
      if (voice.dictating && global.OneToneIpc && global.OneToneIpc.invoke) {
        global.OneToneIpc.invoke('cmd_voice_end_ui_end', {}).catch(function () {});
      } else if (
        global.OneToneAppHomeRuntime &&
        typeof global.OneToneAppHomeRuntime.toggleGlobalListen === 'function'
      ) {
        global.OneToneAppHomeRuntime.toggleGlobalListen();
      } else if (global.OneToneIpc && global.OneToneIpc.invoke) {
        global.OneToneIpc.invoke('cmd_pause', {}).catch(function () {});
      }
      setTimeout(function () {
        syncVoiceStrip();
      }, 120);
      return;
    }

    // Engine already live (Soft Pad / park-restore) but desk not in command mode → arm only.
    if (voice.listening && !voiceArmed) {
      voiceArmed = true;
      syncVoiceStrip();
      return;
    }

    voiceArmed = true;
    syncVoiceStrip();

    function afterStart() {
      if (
        global.OneToneVoiceWake &&
        typeof global.OneToneVoiceWake.ensureHomeVoiceListening === 'function'
      ) {
        try {
          global.OneToneVoiceWake.ensureHomeVoiceListening({ force: true });
        } catch (_) {}
      }
      setTimeout(function () {
        syncVoiceStrip();
      }, 120);
    }

    // Start: resume first (ensureHomeVoiceListening no-ops while paused), then ensure engine.
    if (voice.paused && global.OneToneIpc && global.OneToneIpc.invoke) {
      global.OneToneIpc
        .invoke('cmd_resume', {})
        .catch(function () {})
        .then(afterStart);
      return;
    }
    afterStart();
  }

  function stopVoice() {
    var voice = readVoiceUi();
    voiceArmed = false;
    if (voice.dictating && global.OneToneIpc && global.OneToneIpc.invoke) {
      global.OneToneIpc.invoke('cmd_voice_end_ui_end', {}).catch(function () {});
      setTimeout(function () {
        syncVoiceStrip();
      }, 120);
      return;
    }
    if (!voice.paused) {
      if (
        global.OneToneAppHomeRuntime &&
        typeof global.OneToneAppHomeRuntime.toggleGlobalListen === 'function'
      ) {
        global.OneToneAppHomeRuntime.toggleGlobalListen();
      } else if (global.OneToneIpc && global.OneToneIpc.invoke) {
        global.OneToneIpc.invoke('cmd_pause', {}).catch(function () {});
      }
      setTimeout(function () {
        syncVoiceStrip();
      }, 120);
    } else {
      syncVoiceStrip();
    }
  }

  function refreshToday() {
    var api = todayApi();
    if (!api || !api.loadToday) {
      todayEntries = [];
      return;
    }
    var gen = ++todayFetchGen;
    api.loadToday(14).then(function (rows) {
      if (gen !== todayFetchGen) return;
      var next = Array.isArray(rows) ? rows : [];
      var key = '';
      try {
        key = JSON.stringify(
          next.map(function (e) {
            return [e.time || '', e.text || '', e.src || '', e.proactive ? 1 : 0];
          })
        );
      } catch (_) {
        key = String(next.length);
      }
      if (key === todayPaintKey) return;
      todayPaintKey = key;
      todayEntries = next;
      lastPaintHtml = '';
      if (mounted) paint();
    });
  }

  function scheduleTodayRefresh() {
    if (todayRefreshTimer) return;
    todayRefreshTimer = setTimeout(function () {
      todayRefreshTimer = 0;
      refreshToday();
    }, 1200);
  }

  function bindHistoryEvents() {
    if (historyBound) return;
    historyBound = true;
    try {
      if (global.chrome && global.chrome.webview && global.chrome.webview.addEventListener) {
        global.chrome.webview.addEventListener('message', function (e) {
          var msg = e && e.data;
          if (!msg || msg.type !== 'mvp_action_history_event') return;
          if (!mounted) return;
          refreshToday();
        });
      }
    } catch (_) {}
  }

  function openSettings() {
    if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
      global.OneToneSettingsDrawer.open({ panel: 'basic' });
      return;
    }
    var btn = $('wbNavGeneral');
    if (btn) btn.click();
  }

  /** Real habit hub (sidebar drawer) — not the hard-coded home stub / scenes page. */
  function openHabitHub() {
    if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
      global.OneToneSettingsDrawer.open({ panel: 'habits' });
      return;
    }
    var btn = $('wbNavHabits') || $('wbNavHabit');
    if (btn) btn.click();
  }

  function clearPending() {
    pending = null;
    lastPaintHtml = '';
  }

  function trySwitch(habitId, opts) {
    var hr = runtime();
    if (!hr || !hr.switch) return { ok: false, reason: 'no_runtime' };
    return hr.switch(habitId, opts || { source: 'home_quick_switch' });
  }

  function habitPreviewLines(h) {
    if (!h) return [];
    var lines = Array.isArray(h.does) && h.does.length ? h.does : h.helping;
    if (Array.isArray(lines) && lines.length) return lines.slice(0, 3);
    if (h.description) return [String(h.description)];
    return [];
  }

  function habitById(snap, id) {
    var habits = (snap && snap.habits) || [];
    var sid = String(id || '');
    for (var i = 0; i < habits.length; i++) {
      if (String(habits[i].id) === sid) return habits[i];
    }
    return null;
  }

  function buildPendingMeta(habitId, extra) {
    var snap = snapshot();
    var cur = snap && snap.active;
    var tgt = habitById(snap, habitId);
    return Object.assign(
      {
        targetId: habitId,
        currentName: (cur && cur.name) || '',
        currentDoes: habitPreviewLines(cur),
        targetName: (tgt && tgt.name) || '',
        targetDoes: habitPreviewLines(tgt)
      },
      extra || {}
    );
  }

  function applySwitchResult(habitId, sw) {
    if (!sw) return;
    if (sw.ok) {
      clearPending();
      needsExpanded = false;
      adjustOpen = false;
      if (!useRuntime()) {
        live = model().activateHabit(live, habitId);
      }
      paint();
      return;
    }
    if (sw.requiresConfirm) {
      pending = buildPendingMeta(habitId, {
        kind: 'confirm',
        pinnedName: sw.pinnedName || '',
        targetName: sw.targetName || ''
      });
      paint();
      return;
    }
    if (sw.requiresChoice) {
      pending = buildPendingMeta(habitId, {
        kind: 'choice',
        targetName: sw.targetName || '',
        choices: sw.choices || []
      });
      paint();
      return;
    }
  }

  function disableFollowAndSwitch(habitId) {
    var cfg =
      global.OneToneState &&
      global.OneToneState.state &&
      global.OneToneState.state.config;
    if (cfg) cfg.followForegroundAppScenario = false;
    var persist = global.OneToneConfigPersist;
    if (persist && persist.saveAsync) persist.saveAsync({ source: 'nowDisableFollow' });
    else if (persist && persist.save) persist.save();
    return trySwitch(habitId, {
      source: 'home_quick_switch',
      allowForegroundFollow: true
    });
  }

  function onRootClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;

    // History side drawer: click dimmed mask (not the panel) to close.
    var histDrawer = t.closest && t.closest('#hnRecallDrawer.is-history');
    if (histDrawer && (t === histDrawer || (!t.closest('header') && !t.closest('.hn-drawer-body')))) {
      histDrawer.hidden = true;
      histDrawer.classList.remove('is-history');
      return;
    }

    var hfViewBtn = t.closest('[data-hf-view]');
    if (hfViewBtn) {
      var nextView = hfViewBtn.getAttribute('data-hf-view') || 'focus';
      if (nextView === 'habits') {
        openHabitHub();
        return;
      }
      if (nextView === 'settings') {
        openSettings();
        return;
      }
      hfView = nextView;
      hfOverlay = '';
      lastPaintHtml = '';
      if (hfView !== 'focus' && !agentHomeCache) scheduleAgentHomeRefresh();
      paint();
      return;
    }
    var recallBtn = t.closest('[data-hn-recall]');
    if (recallBtn && useHomeFocusSurface()) {
      var recallId = recallBtn.getAttribute('data-hn-recall') || '';
      if (recallId === 'history') {
        openHistoryDrawer();
        return;
      }
      var V = global.OneToneHomeFocusView;
      var drawer = root && root.querySelector('#hnRecallDrawer');
      var titleEl = root && root.querySelector('#hnRecallTitle');
      var bodyEl = root && root.querySelector('#hnRecallBody');
      if (drawer && titleEl && bodyEl && V && V.drawerHtml) {
        var titles = { memory: '项目要点', evidence: '判断依据' };
        titleEl.textContent = titles[recallId] || '详情';
        bodyEl.innerHTML = V.drawerHtml(recallId, buildHomeFocusVm() || {});
        drawer.hidden = false;
        drawer.classList.remove('is-history');
      } else if (recallId === 'memory') {
        hfView = recallId;
        lastPaintHtml = '';
        paint();
      }
      return;
    }
    var hfAct = t.closest('[data-hf-act]');
    if (hfAct) {
      handleHomeFocusAct(hfAct.getAttribute('data-hf-act') || '', hfAct);
      return;
    }
    var hfPick = t.closest('[data-hf-pick-id]');
    if (hfPick) {
      var S = global.OneToneHomeFocusStore;
      if (S) {
        S.confirmProject({
          projectId: hfPick.getAttribute('data-hf-pick-id') || null,
          projectRoot: hfPick.getAttribute('data-hf-pick-root') || null
        }).then(function () {
          hfOverlay = '';
          hfPickHtml = '';
          hfView = 'focus';
          lastPaintHtml = '';
          paint();
        });
      }
      return;
    }

    if (t.classList && t.classList.contains('now-gate-scr')) {
      clearPending();
      paint();
      return;
    }

    var gateCancel = t.closest('[data-now-gate-cancel]');
    if (gateCancel) {
      clearPending();
      paint();
      return;
    }

    var gateConfirm = t.closest('[data-now-gate-confirm]');
    if (gateConfirm && pending && pending.targetId) {
      var idConfirm = pending.targetId;
      var swConfirm = trySwitch(idConfirm, {
        source: 'home_quick_switch',
        confirm: true,
        allowForegroundFollow: true
      });
      applySwitchResult(idConfirm, swConfirm);
      return;
    }

    var gateChoice = t.closest('[data-now-gate-choice]');
    if (gateChoice && pending && pending.targetId) {
      var choice = gateChoice.getAttribute('data-now-gate-choice');
      var idChoice = pending.targetId;
      var swChoice;
      if (choice === 'override') {
        swChoice = trySwitch(idChoice, {
          source: 'home_quick_switch',
          mode: 'override'
        });
      } else if (choice === 'pin') {
        swChoice = trySwitch(idChoice, {
          source: 'home_quick_switch',
          mode: 'pin'
        });
      } else if (choice === 'disable_follow') {
        swChoice = disableFollowAndSwitch(idChoice);
      }
      applySwitchResult(idChoice, swChoice);
      return;
    }

    var tierBtn = t.closest('[data-now-tier]');
    if (tierBtn) {
      loadTier(tierBtn.getAttribute('data-now-tier'));
      return;
    }

    var agentFx = t.closest('[data-now-agent-fx]');
    if (agentFx) {
      agentFixtureIndex = Number(agentFx.getAttribute('data-now-agent-fx')) || 0;
      agentTask = null;
      agentRows = null;
      lastPaintHtml = '';
      paint();
      return;
    }

    var agentAct = t.closest('[data-now-agent-act]');
    if (agentAct) {
      handleAgentAct(agentAct.getAttribute('data-now-agent-act'));
      return;
    }

    var back = t.closest('[data-now-back]');
    if (back) {
      setView('now');
      return;
    }

    var settings = t.closest('[data-now-settings]');
    if (settings) {
      openSettings();
      return;
    }

    var adjustDone = t.closest('[data-now-adjust-done]');
    if (adjustDone) {
      adjustOpen = false;
      paint();
      return;
    }

    var adjust = t.closest('[data-now-adjust]');
    if (adjust) {
      adjustOpen = true;
      paint();
      return;
    }

    if (t.closest('[data-now-ctx-close]')) {
      contextOpen = false;
      lastPaintHtml = '';
      paint();
      return;
    }
    var ctxScr = t.closest('[data-now-ctx-scr]');
    if (ctxScr && t === ctxScr) {
      contextOpen = false;
      lastPaintHtml = '';
      paint();
      return;
    }
    if (t.closest('[data-now-ctx-open]')) {
      openContextPanel();
      return;
    }

    var openNeed = t.closest('[data-now-open-need]');
    if (openNeed) {
      var snapNeed = snapshot();
      var crit = criticalNeedOf(snapNeed);
      if (crit) {
        needDismissKey =
          String(crit.id) + ':' + String(crit.title || '') + ':' + String(crit.detail || '');
      }
      openNeedSurface();
      lastPaintHtml = '';
      paint();
      return;
    }

    var bootstrap = t.closest('[data-now-bootstrap]');
    if (bootstrap) {
      var boot = model().bootstrapRecommendedHabit && model().bootstrapRecommendedHabit();
      if (!boot || !boot.ok) return;
      adjustOpen = false;
      needsExpanded = false;
      setView('now');
      paint();
      return;
    }

    var scenes = t.closest('[data-now-scenes]');
    if (scenes) {
      var hid = scenes.getAttribute('data-now-scenes') || '';
      adjustOpen = false;
      setView('scenes', hid || '');
      return;
    }

    var fgRefresh = t.closest('[data-now-fg-refresh]');
    if (fgRefresh) {
      lastPaintHtml = '';
      refreshForeground();
      paint();
      return;
    }

    var act = t.closest('[data-now-activate]');
    if (act) {
      var habitId = act.getAttribute('data-now-activate');
      if (useRuntime()) {
        applySwitchResult(habitId, trySwitch(habitId, { source: 'home_quick_switch' }));
        return;
      }
      // Demo / no Facade: fixtures only
      var hr = runtime();
      if (hr && hr.switch) {
        applySwitchResult(habitId, trySwitch(habitId, { source: 'home_quick_switch' }));
        if (pending) return;
      }
      live = model().activateHabit(live, habitId);
      needsExpanded = false;
      adjustOpen = false;
      paint();
      return;
    }

    var rem = t.closest('[data-now-remove]');
    if (rem) {
      if (useRuntime()) return;
      live = model().removeHabit(live, rem.getAttribute('data-now-remove'));
      paint();
      return;
    }

    var op = t.closest('[data-now-op]');
    if (op) {
      var parts = String(op.getAttribute('data-now-op') || '').split(':');
      if (parts.length < 2) return;
      if (useRuntime()) {
        var hr = runtime();
        if (hr && hr.toggleAssist) hr.toggleAssist(parts[0], parts[1]);
        else if (model().toggleHabitAssist) model().toggleHabitAssist(parts[0], parts[1]);
        paint();
        return;
      }
      live = model().toggleHabitOp(live, parts[0], parts[1]);
      paint();
      return;
    }

    var add = t.closest('[data-now-add]');
    if (add) {
      if (useRuntime()) return;
      var nameEl = $('nowNewName');
      var name = nameEl ? String(nameEl.value || '').trim() : '';
      live = model().addHabit(live, name || '新情景');
      if (nameEl) nameEl.value = '';
      paint();
      return;
    }

    var more = t.closest('[data-now-need-more]');
    if (more) {
      needsExpanded = !needsExpanded;
      paint();
      return;
    }

    var voice = t.closest('[data-now-voice]');
    if (voice && !voice.disabled) {
      triggerVoice();
      return;
    }

    if (t.closest('[data-now-voice-stop]')) {
      stopVoice();
      return;
    }

    if (t.closest('[data-now-voice-pause]')) {
      triggerVoice();
    }
  }

  function loadTier(id) {
    tier = id || 's1';
    needsExpanded = false;
    adjustOpen = false;
    clearPending();
    lastPaintHtml = '';
    live = fixtures().cloneState(tier);
    paint();
  }

  function setView(next, habitId) {
    view = next === 'scenes' ? 'scenes' : 'now';
    focusHabitId = habitId || '';
    lastPaintHtml = '';
    if (view === 'now') {
      needsExpanded = false;
      hfView = 'focus';
    } else {
      adjustOpen = false;
    }
    paint();
  }

  function bindRuntime() {
    if (unsubRuntime) return;
    var hr = runtime();
    if (!hr || !hr.subscribe) return;
    unsubRuntime = hr.subscribe('change', function () {
      if (!useRuntime()) return;
      scheduleAttentionRefresh();
      scheduleInventoryRefresh();
      scheduleAgentCenterRefresh();
      scheduleTodayRefresh();
      scheduleAgentHomeRefresh();
      // paint() already no-ops when HTML is unchanged; avoid forcing lastPaintHtml clear.
      if (mounted) paint();
    });
  }

  function mount() {
    if (mounted) return;
    root = $(ROOT_ID);
    if (!root) return;
    isDemo = detectDemo();
    agentDemo = detectAgentDemo();
    useLegacyNow = detectLegacyNow();
    if (agentDemo) {
      agentFixtureIndex = 0;
      agentTask = null;
      agentRows = null;
    }
    if (!useRuntime()) ensureLive();
    root.addEventListener('click', onRootClick);
    bindRuntime();
    bindHistoryEvents();
    mounted = true;
    if (useRuntime()) {
      fetchAttention();
      fetchInventory();
      refreshToday();
      startFgPoll();
      fetchAgentHomeSnapshot();
    }
    if (useHomeFocusSurface()) ensureHomeFocusStore();
    paint();
  }

  function show() {
    mount();
    if (!root) return;
    root.hidden = false;
    root.removeAttribute('aria-hidden');
    var stack = dashboardStack();
    if (stack) {
      stack.hidden = true;
      stack.setAttribute('aria-hidden', 'true');
    }
    setSmokeFeedbackHidden(true);
    visible = true;
    // Warm Home Focus cache BEFORE paint — painting on empty dto flashed
    //「你正在使用 未发现应用」+ blank hero until fetch landed.
    if (useHomeFocusSurface()) {
      ensureHomeFocusStore();
      try {
        var S0 = global.OneToneHomeFocusStore;
        if (S0 && S0.get) {
          var warm = S0.get();
          if (warm) homeFocusCache = warm;
        }
        if (S0 && S0.fetch) S0.fetch();
      } catch (_) {}
      scheduleAgentHomeRefresh();
    }
    paint();
    syncVoiceStrip();
    // Heavier IPC after first paint (title-bar drag / nav feel).
    setTimeout(function () {
      if (!visible) return;
      if (useRuntime()) {
        fetchAttention();
        fetchInventory();
        refreshToday();
        startFgPoll();
        scheduleAgentHomeRefresh();
      }
    }, 0);
  }

  function hide() {
    stopFgPoll();
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
    var stack = dashboardStack();
    // Default product home is Now. Revealing smoke/workbench on every left-nav
    // open painted Codex/Claude ask UI under the drawer and felt like a slow flash.
    // Legacy workbench (?now=0) still gets stack + smoke when Now is off.
    if (isEnabled()) {
      if (stack) {
        stack.hidden = true;
        stack.setAttribute('aria-hidden', 'true');
      }
      setSmokeFeedbackHidden(true);
    } else {
      if (stack) {
        stack.hidden = false;
        stack.removeAttribute('aria-hidden');
      }
      setSmokeFeedbackHidden(false);
    }
    visible = false;
  }

  function isVisible() {
    return visible;
  }

  global.OneToneNowHome = {
    mount: mount,
    show: show,
    hide: hide,
    setView: setView,
    loadTier: loadTier,
    isVisible: isVisible,
    isEnabled: isEnabled,
    isVoiceArmed: function () {
      return !!voiceArmed;
    },
    paint: paint,
    syncVoice: syncVoiceStrip,
    lastAgentSessionId: function () {
      try {
        return (
          (agentHomeCache &&
            agentHomeCache.activeSession &&
            agentHomeCache.activeSession.sessionId) ||
          (agentHomeCache &&
            agentHomeCache.checkpoint &&
            agentHomeCache.checkpoint.sessionId) ||
          ''
        );
      } catch (_) {
        return '';
      }
    }
  };

  function bootHomeSurface() {
    mount();
    // Prefer Now before workbench paints; syncNavActiveState will re-affirm.
    try {
      var st = global.OneToneState && global.OneToneState.ui;
      if (st && st.drawerOpen) return;
    } catch (_) {}
    show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootHomeSurface);
  } else {
    bootHomeSurface();
  }
})(typeof window !== 'undefined' ? window : globalThis);
