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
  var historyBound = false;
  // User armed listen from Now dock; show strip until pause/stop even if status is still ready.
  var voiceArmed = false;
  var contextOpen = false;
  var contextRows = [];
  var contextFetchGen = 0;
  var fgIdentityCache = null;
  var needDismissKey = '';

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
      return new URLSearchParams(location.search).get('nowDemo') === '1';
    } catch (_) {
      return false;
    }
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

  function buildNowFacts(snap) {
    var identity = resolveFgIdentity();
    var app = displayAppName(identity);
    var proj = projectHintFromIdentity(identity);
    var ag = agentFactFromAttention(attentionCache, snap && snap.needsYou);
    return {
      hero: app,
      app: app,
      project: proj.text,
      projectInferred: !!proj.inferred,
      presence: '不知道',
      agent: ag.text,
      agentWaiting: !!ag.waiting
    };
  }

  function criticalNeedOf(snap) {
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

  function applyFgIdentity(res) {
    if (!isUsableFg(res)) return false;
    var prev = fgIdentityCache;
    var prevKey =
      (prev && (prev.exeName || prev.exe_name || '')) +
      '|' +
      (prev && (prev.windowTitle || prev.window_title || ''));
    var nextKey =
      (res.exeName || res.exe_name || '') +
      '|' +
      (res.windowTitle || res.window_title || '');
    fgIdentityCache = res;
    try {
      var rt = global.OneToneRuntimeHabitControl;
      if (rt && rt.noteForegroundIdentity) rt.noteForegroundIdentity(res);
    } catch (_) {}
    if (prevKey === nextKey) return false;
    return true;
  }

  function refreshForeground() {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return;
    ipc
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
        // Even if IPC empty, runtime may already hold Cursor from workbench poll.
        if (changed || resolveFgIdentity()) {
          lastPaintHtml = '';
          if (mounted && visible) paint();
        }
      })
      .catch(function () {});
  }

  function startFgPoll() {
    if (fgPollTimer) return;
    refreshForeground();
    fgPollTimer = setInterval(function () {
      if (!visible) return;
      refreshForeground();
    }, 1200);
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

  function paint() {
    if (!root) return;
    var U = ui();
    if (!U || !model()) return;
    var snap = snapshot();
    snap.today = todayEntries;
    var voice = readVoiceUi();
    var html = '';
    if (isDemo) html += U.renderDemoBar({ tier: tier });
    if (view === 'scenes') {
      html += U.renderScenesView({
        snapshot: snap,
        focusHabitId: focusHabitId,
        runtimeMode: useRuntime()
      });
    } else {
      html += U.renderNowView({
        snapshot: snap,
        needsExpanded: needsExpanded,
        adjustOpen: adjustOpen,
        pending: pending,
        voice: voice,
        facts: buildNowFacts(snap),
        criticalNeed: criticalNeedOf(snap),
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
      todayEntries = Array.isArray(rows) ? rows : [];
      lastPaintHtml = '';
      if (mounted) paint();
    });
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
      refreshToday();
      if (mounted) paint();
    });
  }

  function mount() {
    if (mounted) return;
    root = $(ROOT_ID);
    if (!root) return;
    isDemo = detectDemo();
    if (!useRuntime()) ensureLive();
    root.addEventListener('click', onRootClick);
    bindRuntime();
    bindHistoryEvents();
    mounted = true;
    if (useRuntime()) {
      fetchAttention();
      refreshToday();
      startFgPoll();
    }
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
    visible = true;
    if (useRuntime()) {
      fetchAttention();
      refreshToday();
      startFgPoll();
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
    paint: paint,
    syncVoice: syncVoiceStrip
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
