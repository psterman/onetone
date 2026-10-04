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
  /** Home Focus surface: focus | history | memory | connections | settings */
  var hfView = 'focus';
  var homeFocusCache = null;
  var homeFocusUnsub = null;
  var hfOverlay = ''; // pick | progress | ''
  var hfPickHtml = '';
  var hfProgressHtml = '';
  var useLegacyNow = false;

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

  function startFgPoll() {
    if (fgPollTimer) return;
    refreshForeground();
    fgPollTimer = setInterval(function () {
      if (!visible) return;
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
        paint();
      }
    });
    S.fetch();
    S.startPolling(5000);
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
      var sessions = [];
      try {
        var snapHist = agentHomeCache;
        var list = (snapHist && snapHist.recentSessions) || [];
        sessions = list.map(function (s) {
          return {
            title: s.title || '未命名工作',
            when: formatSessionWhen(s.updatedAt || s.updated_at)
          };
        });
      } catch (_) {}
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

    var html =
      V && V.renderFocus
        ? V.renderFocus(vm, {
            voiceHtml: (function () {
              var U = ui();
              if (!U || !U.renderDock) return '';
              var snap = snapshot();
              return (
                '<div class="hn-dock-wrap">' +
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

  function handleHomeFocusAct(kind) {
    var vm = buildHomeFocusVm() || {};
    var Policy = global.OneToneHomeActionPolicy;
    var S = global.OneToneHomeFocusStore;

    if (kind === 'close_pick' || kind === 'close_progress' || kind === 'close_drawer') {
      if (kind === 'close_drawer' && root) {
        var drawer = root.querySelector('#hnRecallDrawer');
        if (drawer) drawer.hidden = true;
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
      setView('scenes');
      return;
    }
    // Prototype act aliases → existing policy kinds
    if (kind === 'decide') kind = 'view_progress';
    if (kind === 'continue') kind = 'resume';
    if (kind === 'restore') kind = (vm.primary && vm.primary.id) || 'confirm_project';

    if (!Policy || !Policy.execute) return;
    Policy.execute(kind, vm, {
      openVoice: function () {
        var btn = root && root.querySelector('[data-now-voice]');
        if (btn) btn.click();
      },
      openProgress: function () {
        var CW = global.OneToneCursorWorkView;
        hfOverlay = 'progress';
        hfProgressHtml = CW
          ? CW.render({
              title: vm.title,
              copy: vm.copy,
              events: []
            })
          : '';
        lastPaintHtml = '';
        paint();
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
      }
    }).then(function () {
      if (S) S.fetch();
      lastPaintHtml = '';
      paint();
    });
  }

  function paint() {
    if (!root) return;
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
        return;
      }
      lastPaintHtml = html;
      root.innerHTML = html;
      syncVoiceStrip(voice);
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

  function syncVoiceStrip(voice) {
    if (!root || view === 'scenes') return;
    voice = voice || readVoiceUi();
    var strip = root.querySelector('[data-now-voice-strip]');
    var dock = root.querySelector('[data-now-voice]');
    var liveEl = root.querySelector('[data-now-voice-live]');
    var statusEl = root.querySelector('[data-now-voice-status]');
    var hintEl = root.querySelector('[data-now-voice-hint]');
    if (strip) {
      if (voice.listening) {
        strip.hidden = false;
        strip.removeAttribute('hidden');
      } else {
        strip.hidden = true;
        strip.setAttribute('hidden', '');
      }
    }
    if (statusEl && voice.statusLine) statusEl.textContent = voice.statusLine;
    if (hintEl && voice.hintLine) hintEl.textContent = voice.hintLine;
    if (liveEl) {
      liveEl.textContent = voice.liveText || '';
      liveEl.classList.toggle('is-hint', !!voice.isHint);
    }
    if (dock && !dock.disabled) {
      dock.classList.toggle('is-on', !!voice.listening);
      dock.textContent = voice.listening ? '🎤 倾听中…' : '🎤 说点什么';
    }
  }

  function triggerVoice() {
    var voice = readVoiceUi();
    // Already live → dock is「倾听中」: pause / stop.
    if (voice.listening) {
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

    var hfViewBtn = t.closest('[data-hf-view]');
    if (hfViewBtn) {
      var nextView = hfViewBtn.getAttribute('data-hf-view') || 'focus';
      if (nextView === 'habits') {
        // Prefer dedicated habits page; scenes remains behind CTA.
        hfView = 'habits';
      } else {
        hfView = nextView;
      }
      hfOverlay = '';
      lastPaintHtml = '';
      if (hfView !== 'focus' && !agentHomeCache) scheduleAgentHomeRefresh();
      paint();
      return;
    }
    var recallBtn = t.closest('[data-hn-recall]');
    if (recallBtn && useHomeFocusSurface()) {
      var recallId = recallBtn.getAttribute('data-hn-recall') || '';
      var V = global.OneToneHomeFocusView;
      var drawer = root && root.querySelector('#hnRecallDrawer');
      var titleEl = root && root.querySelector('#hnRecallTitle');
      var bodyEl = root && root.querySelector('#hnRecallBody');
      if (drawer && titleEl && bodyEl && V && V.drawerHtml) {
        var titles = { history: '最近工作', memory: '项目要点', evidence: '判断依据' };
        titleEl.textContent = titles[recallId] || '详情';
        bodyEl.innerHTML = V.drawerHtml(recallId, buildHomeFocusVm() || {});
        drawer.hidden = false;
      } else if (recallId === 'history' || recallId === 'memory') {
        hfView = recallId;
        lastPaintHtml = '';
        paint();
      }
      return;
    }
    var hfAct = t.closest('[data-hf-act]');
    if (hfAct) {
      handleHomeFocusAct(hfAct.getAttribute('data-hf-act') || '');
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
    if (useRuntime()) {
      fetchAttention();
      fetchInventory();
      refreshToday();
      startFgPoll();
      scheduleAgentHomeRefresh();
    }
    if (useHomeFocusSurface()) {
      ensureHomeFocusStore();
      var S = global.OneToneHomeFocusStore;
      if (S && S.fetch) S.fetch();
      // Continue/Recent come from agent_home_snapshot — refresh even if already mounted.
      scheduleAgentHomeRefresh();
    }
    paint();
    syncVoiceStrip();
  }

  function hide() {
    stopFgPoll();
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
    var stack = dashboardStack();
    if (stack) {
      stack.hidden = false;
      stack.removeAttribute('aria-hidden');
    }
    setSmokeFeedbackHidden(false);
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
