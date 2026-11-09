/**
 * OneToneHomeAgentV2 — new home workbench view.
 * Incremental paint: agent updates never rebuild the draft textarea or destroy focus.
 */
(function (global) {
  'use strict';

  var root = null;
  var mounted = false;
  var unsubStore = null;
  /** Prep materials → show/hide「整理」without a full dock rebuild. */
  var unsubMaterials = null;
  var shellBuilt = false;
  /** Focus home embeds dock only — never wipe Focus chrome with ha2-shell. */
  var embedMode = false;
  var matMenuOpen = false;
  /** Custom model-route dropdown (native <select> cannot show brand icons on Windows). */
  var modelRouteMenuOpen = false;
  /** Text material ids currently expanded for full read/edit. */
  var matTextExpanded = {};
  /** Bump to cancel stale expand focus rAF after collapse. */
  var matTextExpandSeq = {};
  /** Ignore expand for a beat after collapse — same-spot ghost click re-opens. */
  var matCollapseGuardUntil = {};
  var draftSel = { start: 0, end: 0 };
  var composing = false;
  var pickerAnchor = null;
  var pickerReposTimer = 0;
  /** 'menu' = top-right vertical list; 'dock' = dock grid. Never share one panel. */
  var pickerSurface = null;
  /** Lock above/below after first place — threshold flip + scroll re-entry caused jump. */
  var pickerSide = null;
  var pickerPositioning = false;
  /** WorkBuddy local-account projection for dock model switch (same store as Soft Pad). */
  var wbLocalCache = null;
  var wbLocalFetchGen = 0;
  /** Home local chat (separate from handoff journal). */
  var WB_CHAT_KEY = 'onetone.ha2.wbChat.v1';
  var WB_CHAT_MAX = 40;
  var wbChatTurns = [];
  var wbTranscriptCollapsed = false;
  var wbChatBusy = false;
  var wbChatPaintGen = 0;
  /** Active streaming run id for local chat. */
  var wbStreamRunId = '';
  var wbStreamAgentName = 'WorkBuddy';
  var wbStreamProjectLeaf = '';
  var wbStreamModel = '';
  var wbDoneUnsub = null;
  var wbDeltaUnsub = null;
  /** In-app chat page (left meta + right streaming Q&A). Also hosts ATR edit progress. */
  var wbChatPageOpen = false;
  /** Page compose is not store-backed — keep across Focus remount / full page rebuild. */
  var wbPageDraftText = '';
  /** Last ATR taskId we auto-opened the page for. */
  var atrWbAutoTaskId = '';
  /** Send → force ATR page open even before agentTask lands (paint-only open was unreliable). */
  var atrWbPageForced = false;
  /** User hit ← 返回; don't keep reopening until next send / new taskId. */
  var atrWbPageUserClosed = false;
  /** Goal text shown on pending ATR page before first status arrives. */
  var atrWbPagePendingGoal = '';
  /** ATR page only paints local-chat turns at/after this ms (hide prior「交 Cursor」闲聊). */
  var atrChatSinceMs = 0;
  /** ATR step log: collapsed shows last sentence only (per taskId). */
  var atrLogExpandedById = {};
  /** Chat tool-loop ATR task id (read_only lane) — keep transcript chrome, not edit page. */
  var chatLoopTaskId = '';
  /** Event ids already mirrored into wbChatTurns for the active chat loop. */
  var chatLoopSyncedEv = {};
  /** Soft-stop: ignore busy re-stick from poll until ATR leaves running for this id. */
  var chatStopPendingId = '';
  /** taskId → already tried one watchdog redrive (avoid paint thrash). */
  var chatHealTried = Object.create(null);
  /** taskId → recovery/conflict turn already appended for interrupt/heal. */
  var chatRecoveryEmitted = Object.create(null);
  /** Wall clock when chat ATR entered busy (stall watchdog). */
  var chatBusySinceMs = 0;
  /** taskId → stall heal already fired (first-turn hang). */
  var chatStallTried = Object.create(null);
  var chatLastProgressByTask = Object.create(null);
  /** First model turn can hang inside next_tool_json; FE cancel only helps between turns / after HTTP timeout. */
  var CHAT_STALL_MS = 45000;
  var wbStreamingText = '';
  var wbStreamingReasoning = '';
  var wbStreamingTurnId = '';
  var wbThinkingTurnId = '';
  var wbPollTimer = 0;
  /** Handoff draft editor open (summary → draft only; no auto-send). */
  var handoffOpen = false;
  var handoffSummary = '';
  var handoffTargetKind = '';
  /** Work-mode confirm gate — open before startAndDriveAgentTask. */
  var workConfirmOpen = false;
  var workConfirmGoal = '';
  var workConfirmMatSum = '';
  /** Assist organize in-flight (UI busy; Prep.assist is source of truth). */
  var organizeBusy = false;
  var assistReadyCache = null;
  /** ATR Soft Pad / WorkBuddy providers from cmd_agent_task_ready. */
  var atrProvidersCache = null;
  var atrProvidersFetchGen = 0;
  /** Inline WorkBuddy OAuth login on home (freemodel — not Soft Pad API keys). */
  var atrWbLoginForced = false;
  /** Chat-mode: user closed the login strip — don't re-block the home dock. */
  var atrWbLoginChatDismissed = false;
  var atrWbLoginBusy = false;
  var atrWbLoginPendingId = '';
  var atrWbLoginPollTimer = 0;
  var atrWbLoginStatus = ''; // '' | pending | fail | expired
  /** OpenCode Zen device OAuth (modal / dock). */
  var zenOauthBusy = false;
  var zenOauthPendingId = '';
  var zenOauthPollTimer = 0;
  var zenOauthStatus = ''; // '' | pending | fail | expired
  /** OpenCode Zen device OAuth ( freemodel — separate from WorkBuddy ). */
  var zenOauthBusy = false;
  var zenOauthPendingId = '';
  var zenOauthPollTimer = 0;
  /**
   * Soft Pad freemodel lanes (dsh-our-free-model style: fill key / login → pick model).
   * Matches assist model_catalog SoftPadQuotaProvider ids.
   */
  /**
   * Soft Pad lanes with live quota + Assist metered + ATR hooks.
   * Only these 4 are wired in SoftPadQuotaProvider today (P1: OpenAI/Qwen/Zhipu…).
   * Caps are Soft Pad product hooks — not “paid vs free” marketing.
   */
  var SOFTPAD_FREEMODEL_CATALOG = [
    {
      id: 'deepseek',
      label: 'DeepSeek',
      model: 'deepseek-chat',
      consoleUrl: 'https://platform.deepseek.com/',
      caps: ['quota', 'assist', 'atr', 'home']
    },
    {
      id: 'kimi',
      label: 'Kimi',
      model: 'moonshot-v1-8k',
      consoleUrl: 'https://platform.moonshot.cn/',
      caps: ['quota', 'assist', 'atr', 'home']
    },
    {
      id: 'siliconflow',
      label: 'SiliconFlow',
      model: 'Qwen/Qwen2.5-7B-Instruct',
      consoleUrl: 'https://cloud.siliconflow.cn/account/ak',
      caps: ['quota', 'assist', 'atr', 'home']
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      model: 'openrouter/auto',
      consoleUrl: 'https://openrouter.ai/settings/keys',
      caps: ['quota', 'assist', 'atr', 'home']
    }
  ];
  var SOFTPAD_CAP_LABEL = {
    quota: '余额可见',
    assist: 'Assist 计量',
    atr: 'ATR 可驱动',
    home: '首页 Soft Pad 车道'
  };
  function softPadCapsHtml(caps) {
    caps = Array.isArray(caps) ? caps : [];
    if (!caps.length) return '';
    return (
      '<div class="ha2-fm-caps">' +
      caps
        .map(function (c) {
          return (
            '<span class="ha2-fm-cap" data-cap="' +
            esc(c) +
            '">' +
            esc(SOFTPAD_CAP_LABEL[c] || c) +
            '</span>'
          );
        })
        .join('') +
      '</div>'
    );
  }
  /** { deepseek: { configured, masked }, … } */
  var softPadFreemodelKeys = {};
  var SOFTPAD_PREF_KEY = 'onetone.softpadPreferredProvider';
  var REPLY_TONE_KEY = 'onetone.chat.replyTone';

  function readChatReplyTone() {
    var Caps = global.OneToneHomeAgentCapabilities;
    var raw = '';
    try {
      raw = (global.localStorage && global.localStorage.getItem(REPLY_TONE_KEY)) || '';
    } catch (_) {}
    if (Caps && typeof Caps.normalizeChatReplyTone === 'function') {
      return Caps.normalizeChatReplyTone(raw);
    }
    return raw === 'concise' || raw === 'colleague' ? raw : 'natural';
  }

  function writeChatReplyTone(v) {
    var Caps = global.OneToneHomeAgentCapabilities;
    var tone =
      Caps && typeof Caps.normalizeChatReplyTone === 'function'
        ? Caps.normalizeChatReplyTone(v)
        : v === 'concise' || v === 'colleague'
          ? v
          : 'natural';
    try {
      if (global.localStorage) global.localStorage.setItem(REPLY_TONE_KEY, tone);
    } catch (_) {}
    return tone;
  }

  /**
   * Custom API presets from models.dev (OneToneCustomApiPresets) — OpenAI-compatible only.
   * Regenerate: node scripts/_build-custom-api-presets.mjs
   */
  function customApiPresets() {
    var list = global.OneToneCustomApiPresets;
    return Array.isArray(list) && list.length ? list : [];
  }
  function customApiDefaultPreset() {
    var list = customApiPresets();
    var prefer = [
      'minimax-cn-openai',
      'minimax-openai',
      'deepseek',
      'openai',
      'moonshotai-cn',
      'zhipuai',
      'openrouter'
    ];
    for (var i = 0; i < prefer.length; i++) {
      for (var j = 0; j < list.length; j++) {
        if (list[j] && list[j].id === prefer[i]) return list[j];
      }
    }
    return list[0] || null;
  }
  function customApiPresetById(id) {
    id = String(id || '');
    var list = customApiPresets();
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) return list[i];
    }
    return null;
  }
  function customApiProvOptHtml(p, selectedId, configuredIds) {
    p = p || {};
    var on = p.id === selectedId;
    var saved = !!(configuredIds && configuredIds[p.id]);
    var ico = p.icon
      ? '<img class="ha2-fm-ico" src="' + esc(p.icon) + '" alt="" width="18" height="18" decoding="async">'
      : '<span class="ha2-fm-ico ha2-fm-ico--empty" aria-hidden="true"></span>';
    return (
      '<button type="button" class="ha2-fm-prov-opt' +
      (on ? ' on' : '') +
      (saved ? ' is-saved' : '') +
      '" role="option" data-custom-prov="' +
      esc(p.id) +
      '" data-custom-prov-label="' +
      esc(p.label || p.id) +
      '"' +
      (saved ? ' data-custom-saved="1"' : '') +
      '>' +
      ico +
      '<span class="ha2-fm-prov-name">' +
      esc(p.label || p.id) +
      '</span>' +
      (saved
        ? '<span class="ha2-fm-prov-saved">' + esc(t('ha2FmCustomSavedBadge', '已保存')) + '</span>'
        : '') +
      '</button>'
    );
  }
  /** Keep main bottom pad ≥ absolute dock height (consult/materials grow). */
  var dockReserveRo = null;
  /** After weather ask with no city — next short city reply continues the ask. */
  var wbWeatherAwaitingCity = false;
  var WEATHER_CITY_KEY = 'onetone.weather.defaultCity';

  function readDefaultWeatherCity() {
    var Caps = global.OneToneHomeAgentCapabilities;
    try {
      var v = String(
        (global.localStorage && global.localStorage.getItem(WEATHER_CITY_KEY)) || ''
      ).trim();
      if (
        Caps &&
        Caps.isPlausibleWeatherCity &&
        !Caps.isPlausibleWeatherCity(v)
      ) {
        try {
          if (global.localStorage) global.localStorage.removeItem(WEATHER_CITY_KEY);
        } catch (_) {}
        return '';
      }
      return v;
    } catch (_) {
      return '';
    }
  }

  function writeDefaultWeatherCity(city) {
    var Caps = global.OneToneHomeAgentCapabilities;
    city = String(city || '').trim();
    if (
      !city ||
      (Caps && Caps.isPlausibleWeatherCity && !Caps.isPlausibleWeatherCity(city))
    ) {
      return;
    }
    try {
      if (global.localStorage) global.localStorage.setItem(WEATHER_CITY_KEY, city);
    } catch (_) {}
  }

  function loadWbChatTurns() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(WB_CHAT_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed && parsed.turns) ? parsed.turns.filter(Boolean) : [];
    } catch (_) {
      return [];
    }
  }

  function saveWbChatTurns() {
    try {
      if (global.localStorage) {
        // streaming is paint-only — never persist or reload as「思考中…」.
        var persisted = wbChatTurns.slice(-WB_CHAT_MAX).map(function (row) {
          if (!row || !row.streaming) return row;
          var copy = Object.assign({}, row);
          delete copy.streaming;
          return copy;
        });
        global.localStorage.setItem(
          WB_CHAT_KEY,
          JSON.stringify({ turns: persisted, at: Date.now() })
        );
      }
    } catch (_) {}
  }

  function wbSendModeOf(snap) {
    var S = store();
    if (snap && snap.wbSendMode) return snap.wbSendMode === 'desktop' ? 'desktop' : 'local';
    if (S && S.getSnapshot) {
      var s = S.getSnapshot();
      if (s && s.wbSendMode === 'desktop') return 'desktop';
    }
    return 'local';
  }

  function appendWbChatTurn(turn) {
    turn = turn || {};
    var kind = String(turn.kind || '') || undefined;
    var row = {
      id: turn.id || 't_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4),
      role: turn.role === 'assistant' || kind ? 'assistant' : 'user',
      text: String(turn.text || ''),
      model: turn.model ? String(turn.model) : '',
      providerId: turn.providerId ? String(turn.providerId) : '',
      fallbackFrom: turn.fallbackFrom ? String(turn.fallbackFrom) : '',
      accountId: turn.accountId ? String(turn.accountId) : '',
      at: turn.at || Date.now(),
      kind: kind,
      toolName: turn.toolName ? String(turn.toolName) : '',
      toolOk: turn.toolOk,
      detail: turn.detail ? String(turn.detail) : '',
      collapsed: turn.collapsed !== false,
      approvalToken: turn.approvalToken ? String(turn.approvalToken) : '',
      streaming: !!turn.streaming
    };
    if (
      !row.text &&
      !row.toolName &&
      kind !== 'tool_step' &&
      kind !== 'needs_input' &&
      kind !== 'deliver_approval'
    ) {
      return null;
    }
    // Upsert by id so ATR event mirrors stay stable across polls.
    var replaced = false;
    for (var ui = 0; ui < wbChatTurns.length; ui++) {
      if (wbChatTurns[ui] && String(wbChatTurns[ui].id) === String(row.id)) {
        wbChatTurns[ui] = row;
        replaced = true;
        break;
      }
    }
    if (!replaced) wbChatTurns.push(row);
    if (wbChatTurns.length > WB_CHAT_MAX) wbChatTurns = wbChatTurns.slice(-WB_CHAT_MAX);
    saveWbChatTurns();
    var J = global.OneToneHomeTaskJournal;
    if (J) {
      try {
        if (
          kind === 'tool_step' ||
          kind === 'needs_input' ||
          kind === 'deliver_approval' ||
          kind === 'finish'
        ) {
          if (typeof J.appendToolEvent === 'function') {
            J.appendToolEvent({
              id: row.id,
              at: row.at,
              kind: kind,
              text: row.text,
              toolName: row.toolName,
              toolOk: row.toolOk,
              detail: row.detail,
              collapsed: row.collapsed,
              atrTaskId: chatLoopTaskId || '',
              approvalToken: row.approvalToken || ''
            });
          }
        } else if (typeof J.appendChatTurn === 'function') {
          J.appendChatTurn({
            id: row.id,
            at: row.at,
            role: row.role,
            text: row.text,
            model: row.model,
            providerId: row.providerId,
            fallbackFrom: row.fallbackFrom,
            accountId: row.accountId,
            agentKind: row.providerId === 'softpad_our_freemodel' ? 'softpad' : 'workbuddy'
          });
        }
      } catch (_) {}
    }
    return row;
  }

  function loadChatTaskTurns(taskId) {
    var J = global.OneToneHomeTaskJournal;
    if (J && typeof J.listChatTurns === 'function') {
      try {
        var rows = J.listChatTurns(taskId) || [];
        wbChatTurns = rows.map(function (r) {
          return {
            id: r.id,
            role: r.role === 'user' ? 'user' : 'assistant',
            text: String(r.text || ''),
            model: r.model || '',
            providerId: r.providerId || '',
            accountId: r.accountId || '',
            at: r.at || Date.now(),
            kind: r.kind,
            toolName: r.toolName || '',
            toolOk: r.toolOk,
            detail: r.detail || '',
            collapsed: r.collapsed !== false
          };
        });
        saveWbChatTurns();
        paintWbTranscript();
        return wbChatTurns;
      } catch (_) {}
    }
    return wbChatTurns;
  }

  function startNewChatSession() {
    var J = global.OneToneHomeTaskJournal;
    chatLoopTaskId = '';
    chatLoopSyncedEv = {};
    chatStopPendingId = '';
    chatHealTried = Object.create(null);
    chatRecoveryEmitted = Object.create(null);
    chatStallTried = Object.create(null);
    chatBusySinceMs = 0;
    wbChatBusy = false;
    wbStreamingText = '';
    wbChatTurns = [];
    saveWbChatTurns();
    if (J && typeof J.createTask === 'function') {
      try {
        J.createTask({ title: '本机对话', lane: 'chat', activate: true });
      } catch (_) {}
    }
    paintWbTranscript();
  }

  function wbLocalPromptInput(snap) {
    snap = snap || (store() && store().getSnapshot && store().getSnapshot()) || {};
    var ctx = snap.targetContext || {};
    var session = snap.session || {};
    var project = snap.project || {};
    var focusLive = null;
    try {
      focusLive =
        (global.OneToneHomeFocusStore &&
          global.OneToneHomeFocusStore.get &&
          global.OneToneHomeFocusStore.get()) ||
        null;
    } catch (_) {}
    var focusProject = (focusLive && focusLive.project) || project || {};
    var path =
      (ctx && ctx.projectPath) ||
      session.projectPath ||
      focusProject.root ||
      focusProject.path ||
      project.root ||
      project.path ||
      null;
    var name =
      focusProject.name ||
      project.name ||
      project.displayName ||
      project.display_name ||
      (snap.focusVm && snap.focusVm.projectName) ||
      '';
    if (!name && path) {
      name = targetProjectLabel({ targetContext: { projectPath: path } });
      if (name === t('ha2NoProject', '未选项目')) name = '';
    }
    var focusWork = (focusLive && focusLive.work) || {};
    var work =
      (snap.focusVm &&
        (snap.focusVm.headline ||
          snap.focusVm.assistance ||
          snap.focusVm.line ||
          snap.focusVm.title ||
          snap.focusVm.workTitle)) ||
      focusWork.title ||
      focusWork.currentTask ||
      focusWork.current_task ||
      focusWork.nextAction ||
      focusWork.next_action ||
      '';
    var mats = (snap.materials || [])
      .map(function (m) {
        return (m && (m.title || m.name || m.label || m.path)) || '';
      })
      .filter(Boolean);
    return {
      projectPath: path,
      projectName: name,
      workTitle: work,
      materialNames: mats,
      workMode: String((snap && snap.workMode) || ''),
      replyTone: readChatReplyTone()
    };
  }

  function wbLocalSystemContent(snap) {
    var Caps = global.OneToneHomeAgentCapabilities;
    var input = wbLocalPromptInput(snap);
    if (Caps && typeof Caps.buildLocalChatSystemPrompt === 'function') {
      return Caps.buildLocalChatSystemPrompt(input);
    }
    var path = String((input && input.projectPath) || '').trim();
    return path
      ? '当前项目路径：' + path + '\n请在该项目语境下回答；不要假装能读写磁盘。'
      : '当前未选定项目；请说明缺少项目语境后再作仓库相关回答。';
  }

  function wbMessagesForApi(snap) {
    var turns = wbChatTurns
      .filter(function (t) {
        return t && (t.role === 'user' || t.role === 'assistant') && String(t.text || '').trim();
      })
      .slice(-24)
      .map(function (t) {
        return { role: t.role, content: String(t.text) };
      });
    var system = wbLocalSystemContent(snap);
    if (system) turns.unshift({ role: 'system', content: system });
    return turns;
  }

  wbChatTurns = loadWbChatTurns();

  function toast(msg) {
    var T = global.OneToneAppToast || global.OneToneToast;
    if (T && T.show) {
      try {
        T.show(String(msg || ''), 'scheme');
        return;
      } catch (_) {}
    }
  }

  /** Pin picker to its own trigger — menu hangs under top-right; dock floats by chip. */
  function positionPickerPanel() {
    if (!root || pickerPositioning) return;
    var panel =
      root.querySelector('[data-ha2-picker-host] [data-ha2-picker-panel]') ||
      root.querySelector('[data-ha2-picker-panel]');
    if (!panel) return;
    var anchor =
      pickerAnchor && pickerAnchor.isConnected
        ? pickerAnchor
        : pickerSurface === 'menu'
          ? root.querySelector('[data-ha2-menu-picker]')
          : root.querySelector('.ha2-chip.target[data-ha2-picker]') ||
            root.querySelector('[data-ha2-agent-fuse] [data-ha2-picker]');
    if (!anchor) return;
    pickerPositioning = true;
    var ar = anchor.getBoundingClientRect();
    var isMenu = pickerSurface === 'menu' || panel.classList.contains('is-menu');
    var pw = isMenu
      ? Math.min(260, Math.max(200, window.innerWidth - 24))
      : Math.min(430, Math.max(280, window.innerWidth - 24));
    var gap = 8;
    panel.style.width = pw + 'px';
    panel.style.right = 'auto';
    panel.style.background = '#ffffff';
    panel.style.zIndex = embedMode ? '12050' : '';
    // Measure once (hidden) — avoid bottom→top rAF flip that made Focus dock picker flash.
    panel.style.visibility = 'hidden';
    panel.style.left = '12px';
    panel.style.top = '0';
    panel.style.bottom = 'auto';
    var ph = panel.offsetHeight || (isMenu ? 200 : 280);
    if (isMenu) {
      var left = Math.round(ar.right - pw);
      if (left < 12) left = 12;
      if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
      panel.style.left = left + 'px';
      if (ar.bottom + gap + ph > window.innerHeight - 12) {
        panel.style.top = 'auto';
        panel.style.bottom = Math.max(12, Math.round(window.innerHeight - ar.top + gap)) + 'px';
      } else {
        panel.style.bottom = 'auto';
        panel.style.top = Math.round(ar.bottom + gap) + 'px';
      }
      panel.style.visibility = '';
      pickerPositioning = false;
      return;
    }
    var leftDock = Math.round(ar.left);
    if (leftDock + pw > window.innerWidth - 12) leftDock = window.innerWidth - pw - 12;
    if (leftDock < 12) leftDock = 12;
    panel.style.left = leftDock + 'px';
    // Stick first choice — mid-page Focus chip sits near the above/below threshold and
    // scroll(capture) from the picker's own overflow:auto used to flip every frame.
    var side = pickerSide;
    if (!side) {
      // Focus mid-stage: drop below. Bottom ha2 dock: prefer above when room.
      side =
        !embedMode && ar.top >= ph + gap + 16 ? 'above' : 'below';
      pickerSide = side;
    }
    if (side === 'above') {
      panel.style.top = 'auto';
      panel.style.bottom = Math.max(12, Math.round(window.innerHeight - ar.top + gap)) + 'px';
    } else {
      panel.style.bottom = 'auto';
      panel.style.top =
        Math.min(window.innerHeight - ph - 12, Math.round(ar.bottom + gap)) + 'px';
    }
    panel.style.visibility = '';
    pickerPositioning = false;
  }

  function schedulePositionPicker() {
    if (pickerReposTimer) clearTimeout(pickerReposTimer);
    pickerReposTimer = global.setTimeout(function () {
      pickerReposTimer = 0;
      positionPickerPanel();
    }, 0);
  }

  function t(key, fallback) {
    if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function store() {
    return global.OneToneHomeAgentV2Store;
  }

  function dock() {
    return global.OneToneHomeDockBridge;
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    return ipc && ipc.invoke
      ? ipc.invoke(cmd, args || {})
      : Promise.reject(new Error('ipc_unavailable'));
  }

  function projectWbLocal(raw) {
    var Bridge = global.OneToneAgentPageSettingsBridge;
    if (Bridge && typeof Bridge.projectWorkbuddyLocal === 'function') {
      return Bridge.projectWorkbuddyLocal(raw);
    }
    return { configured: false, defaultAccountId: '', accounts: [] };
  }

  function wbDefaultAccount(wb) {
    wb = wb || wbLocalCache || {};
    var defId = String(wb.defaultAccountId || '');
    var accounts = Array.isArray(wb.accounts) ? wb.accounts : [];
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
    return def && def.enabled ? def : null;
  }

  /** Same default-account model list Soft Pad「监视中」row uses. */
  function wbModelSelectHtml(kind) {
    if (String(kind || '') !== 'workbuddy') return '';
    var def = wbDefaultAccount(wbLocalCache);
    if (!def) return '';
    var models = Array.isArray(def.models) ? def.models : [];
    if (!models.length) return '';
    var opts = models
      .map(function (m) {
        m = m || {};
        var id = String(m.id || '');
        var sel = id && id === String(def.selectedModel || '') ? ' selected' : '';
        return (
          '<option value="' +
          esc(id) +
          '"' +
          sel +
          '>' +
          esc(m.name || id) +
          '</option>'
        );
      })
      .join('');
    return (
      '<select class="ha2-wb-model" data-ha2-wb-model data-wb-id="' +
      esc(def.id) +
      '" title="' +
      esc(t('ha2WbModel', '模型')) +
      '" aria-label="' +
      esc(t('ha2WbModel', '模型')) +
      '">' +
      opts +
      '</select>'
    );
  }

  function wbModelSig(kind) {
    if (String(kind || '') !== 'workbuddy') return '';
    var def = wbDefaultAccount(wbLocalCache);
    if (!def) return '';
    var models = Array.isArray(def.models) ? def.models : [];
    if (!models.length) return '';
    return (
      String(def.id || '') +
      '\0' +
      String(def.selectedModel || '') +
      '\0' +
      models
        .map(function (m) {
          return String((m && m.id) || '');
        })
        .join(',')
    );
  }

  function syncWbModelHost(kind) {
    if (!root) return;
    var host = root.querySelector('[data-ha2-wb-model-host]');
    if (!host) return;
    var sig = wbModelSig(kind);
    if (host.getAttribute('data-sig') === sig) return;
    host.setAttribute('data-sig', sig);
    host.innerHTML = wbModelSelectHtml(kind);
  }

  function atrProviderSelectHtml(snap) {
    if (!atrEditPathOn(snap)) return '';
    var list =
      (atrProvidersCache && Array.isArray(atrProvidersCache.providers) && atrProvidersCache.providers) ||
      [];
    if (!list.length) {
      return (
        '<select class="ha2-atr-provider" data-ha2-atr-provider disabled title="' +
        esc(t('ha2AtrEngine', 'ATR 编辑引擎')) +
        '"><option>' +
        esc(t('ha2AtrProviderLoading', '加载模型…')) +
        '</option></select>'
      );
    }
    var A = global.OneToneHomeAgentTask;
    var selected = (A && A.readProvider && A.readProvider()) || '';
    var opts = list
      .map(function (p) {
        p = p || {};
        var id = String(p.id || '');
        if (!id) return '';
        var kind = String(p.kind || '');
        var chat = !!(p.chatReady || p.ready);
        var tryEdit = !!p.tryEdit;
        var verified = !!p.locallyVerified || !!p.editCapable;
        var lab = String(p.label || id);
        if (!chat) {
          lab =
            kind === 'workbuddy'
              ? String(p.label || 'WorkBuddy · 未登录')
              : lab + ' · 未配置';
        } else if (verified) {
          lab = lab + ' · 已验证可编辑';
        } else if (tryEdit) {
          lab = lab + ' · 可验证（未开放普通编辑）';
        } else {
          lab = lab + ' · 不可编辑';
        }
        var usable = chat || tryEdit || verified;
        var sel = usable && id === String(selected) ? ' selected' : '';
        return (
          '<option value="' +
          esc(id) +
          '"' +
          sel +
          (usable ? '' : ' disabled') +
          '>' +
          esc(lab) +
          '</option>'
        );
      })
      .filter(Boolean)
      .join('');
    var verifyBtn =
      '<button type="button" class="ha2-link" data-ha2-atr-verify-engine title="' +
      esc(t('ha2AtrVerifyTitle', '在隔离沙箱验证此引擎')) +
      '">' +
      esc(t('ha2AtrVerifyCta', '隔离验证')) +
      '</button>';
    return (
      '<span class="ha2-atr-provider-wrap">' +
      '<select class="ha2-atr-provider" data-ha2-atr-provider title="' +
      esc(t('ha2AtrEngine', 'ATR 编辑引擎')) +
      '" aria-label="' +
      esc(t('ha2AtrEngine', 'ATR 编辑引擎')) +
      '">' +
      opts +
      '</select>' +
      verifyBtn +
      '</span>'
    );
  }

  function atrProviderSig(snap) {
    if (!atrEditPathOn(snap)) return '';
    var A = global.OneToneHomeAgentTask;
    var sel = (A && A.readProvider && A.readProvider()) || '';
    var list =
      (atrProvidersCache && Array.isArray(atrProvidersCache.providers) && atrProvidersCache.providers) ||
      [];
    return (
      String(sel) +
      '\0' +
      list
        .map(function (p) {
          return (
            String((p && p.id) || '') +
            ':' +
            (p && p.editCapable ? 'E' : p && p.tryEdit ? 'T' : p && (p.chatReady || p.ready) ? 'C' : '0') +
            ':' +
            String((p && p.editProbe) || '') +
            ':' +
            (p && p.locallyVerified ? '1' : '0')
          );
        })
        .join(',')
    );
  }

  function syncAtrProviderHost(snap) {
    if (!root) return;
    var host = root.querySelector('[data-ha2-atr-provider-host]');
    if (!host) return;
    var sig = atrProviderSig(snap);
    if (host.getAttribute('data-sig') === sig) return;
    host.setAttribute('data-sig', sig);
    host.innerHTML = atrProviderSelectHtml(snap);
  }

  function atrWbChatReady() {
    if (atrProvidersCache && atrProvidersCache.workbuddyReady) return true;
    if (atrProvidersCache && atrProvidersCache.workbuddyChatReady) return true;
    var list =
      (atrProvidersCache && Array.isArray(atrProvidersCache.providers) && atrProvidersCache.providers) ||
      [];
    for (var i = 0; i < list.length; i++) {
      var row = list[i] || {};
      if (String(row.kind || '') === 'workbuddy' || String(row.id || '') === 'workbuddy') {
        return !!(row.chatReady || row.ready);
      }
    }
    return false;
  }

  function wbLocalReady() {
    return !!wbDefaultAccount(wbLocalCache);
  }

  function wbRouteIsActive() {
    var gateway = global.OneToneModelGateway;
    // Boot / no gateway yet — do not assume WorkBuddy (avoids login-card flash).
    if (!gateway || !gateway.resolveProvider) return false;
    try {
      return gateway.resolveProvider('synthesis').id === 'workbuddy';
    } catch (_) {
      return false;
    }
  }

  /**
   * Login strip: work-mode when ATR WB not ready; chat-mode when WB route
   * has no account; always when user forced open (换号 / 登录 CTA).
   * Never flash while accounts list is still probing (wbLocalCache == null).
   */
  function atrWbLoginShouldShow(snap) {
    // Focus embed: WorkBuddy login belongs in 提供方 sheet — no dock banner.
    if (embedMode && !atrEditPathOn(snap)) return false;
    if (atrWbLoginForced) return true;
    if (atrEditPathOn(snap)) return !atrWbChatReady();
    if (wbLocalCache == null) return false;
    if (atrWbLoginChatDismissed) return false;
    // Chat / freemodel: offer OAuth without leaving home or flipping to 工作.
    if (wbRouteIsActive() && !wbLocalReady()) return true;
    return false;
  }

  function atrWbLoginHtml(snap) {
    if (!atrWbLoginShouldShow(snap)) return '';
    var busy = atrWbLoginBusy || atrWbLoginStatus === 'pending';
    var edit = atrEditPathOn(snap);
    var statusLine = '';
    if (atrWbLoginStatus === 'pending') {
      statusLine = t('ha2AtrWbLoginPending', '请在浏览器完成登录…');
    } else if (atrWbLoginStatus === 'fail') {
      statusLine = t('ha2AtrWbLoginFail', '登录失败，请重试');
    } else if (atrWbLoginStatus === 'expired') {
      statusLine = t('ha2AtrWbLoginExpired', '登录超时，请重试');
    } else {
      statusLine = t(
        'ha2AtrWbLoginHint',
        '登录 WorkBuddy 使用账号额度模型，无需粘贴 API Key'
      );
    }
    var title = edit
      ? t('ha2AtrWbLoginTitle', '登录 WorkBuddy 开始编辑')
      : t('ha2WbFreemodelLoginTitle', '登录 WorkBuddy 使用账号额度');
    // Chat: always allow 收起 — Soft Pad / 自定义 API 可继续，不必卡在登录上。
    // Work: dismiss only when WB already ready (otherwise keep 完整配置).
    var canDismiss = edit ? atrWbChatReady() : true;
    return (
      '<div class="ha2-atr-wb-login" data-ha2-atr-wb-login>' +
      '<div class="ha2-atr-wb-login-hd">' +
      '<b>' +
      esc(title) +
      '</b><span>' +
      esc(statusLine) +
      '</span></div>' +
      '<div class="ha2-atr-wb-login-row">' +
      '<button type="button" class="ha2-btn primary" data-ha2-atr-wb-login' +
      (busy ? ' disabled' : '') +
      '>' +
      esc(
        busy
          ? t('ha2AtrWbLoggingIn', '登录中…')
          : t('ha2AtrWbLoginCta', '登录 WorkBuddy')
      ) +
      '</button>' +
      (busy
        ? '<button type="button" class="ha2-link" data-ha2-atr-wb-login-cancel>' +
          esc(t('ha2AtrWbLoginCancel', '取消')) +
          '</button>'
        : '') +
      (canDismiss
        ? '<button type="button" class="ha2-link" data-ha2-atr-wb-login-dismiss>' +
          esc(t('ha2AtrWbLoginDismiss', '收起')) +
          '</button>'
        : '') +
      '<button type="button" class="ha2-link" data-ha2-open-wb-config>' +
      esc(t('ha2WbGoConfig', '完整配置')) +
      '</button>' +
      '</div></div>'
    );
  }

  function atrWbLoginSig(snap) {
    if (!atrWbLoginShouldShow(snap)) return 'off';
    return (
      'on\0' +
      (atrWbChatReady() ? '1' : '0') +
      '\0' +
      (wbLocalReady() ? '1' : '0') +
      '\0' +
      (atrWbLoginBusy ? '1' : '0') +
      '\0' +
      atrWbLoginStatus +
      '\0' +
      (atrWbLoginForced ? '1' : '0') +
      '\0' +
      (atrEditPathOn(snap) ? 'e' : 'c')
    );
  }

  /** Dock chip: 登录 / 账号·换号 — next to mixed model select. */
  function wbAccountChipHtml(snap) {
    if (atrEditPathOn(snap)) return '';
    var def = wbDefaultAccount(wbLocalCache);
    if (!def) {
      return (
        '<button type="button" class="ha2-link ha2-wb-account-cta" data-ha2-wb-login-cta title="' +
        esc(t('ha2WbFreemodelLoginHint', '浏览器登录后使用账号额度模型')) +
        '">' +
        esc(t('ha2WbLoginShort', '登录')) +
        '</button>'
      );
    }
    // Short chip — full id lives in title only (was "WorkBuddy OAu… · 换号").
    var tip = [
      def.label || 'WorkBuddy',
      def.authKind === 'oauth' ? 'OAuth' : 'Key',
      def.keyFingerprint || ''
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      '<button type="button" class="ha2-link ha2-wb-account-cta" data-ha2-wb-login-cta title="' +
      esc(tip || t('ha2WbSwitchAccount', '换号')) +
      '">' +
      esc(t('ha2WbSwitchAccount', '换号')) +
      '</button>'
    );
  }

  function wbAccountChipSig(snap) {
    if (atrEditPathOn(snap)) return 'off';
    var def = wbDefaultAccount(wbLocalCache);
    if (!def) return 'login';
    return (
      'on\0' +
      String(def.id || '') +
      '\0' +
      String(def.label || '') +
      '\0' +
      String(def.nickname || '') +
      '\0' +
      (atrWbLoginBusy ? '1' : '0')
    );
  }

  function syncWbAccountHost(snap) {
    if (!root) return;
    var host = root.querySelector('[data-ha2-wb-account-host]');
    if (!host) return;
    var sig = wbAccountChipSig(snap);
    if (host.getAttribute('data-sig') === sig) return;
    host.setAttribute('data-sig', sig);
    host.innerHTML = wbAccountChipHtml(snap);
  }

  function syncAtrWbLoginHost(snap) {
    if (!root) return;
    var host = root.querySelector('[data-ha2-atr-wb-login-host]');
    if (!host) return;
    var sig = atrWbLoginSig(snap);
    if (host.getAttribute('data-sig') === sig) return;
    host.setAttribute('data-sig', sig);
    host.innerHTML = atrWbLoginHtml(snap);
  }

  function stopAtrWbLoginPoll() {
    if (atrWbLoginPollTimer) {
      try {
        global.clearTimeout(atrWbLoginPollTimer);
      } catch (_) {}
      atrWbLoginPollTimer = 0;
    }
  }

  function openAtrWbLoginInline() {
    var snap = store() && store().getSnapshot && store().getSnapshot();
    atrWbLoginForced = true;
    atrWbLoginChatDismissed = false;
    syncAtrWbLoginHost(snap || {});
    return true;
  }

  /** Dock「登录 / 换号」: show strip and start browser OAuth immediately. */
  function startWbFreemodelLoginFromDock() {
    // Focus / providers sheet owns WorkBuddy OAuth — don't expand a dock banner.
    if (embedMode) {
      openModelProviderModal({ fmFocus: 'workbuddy' });
      return;
    }
    atrWbLoginForced = true;
    atrWbLoginChatDismissed = false;
    syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
    startAtrWbLoginInline();
  }

  function finishAtrWbLoginOk() {
    stopAtrWbLoginPoll();
    atrWbLoginPendingId = '';
    atrWbLoginBusy = false;
    atrWbLoginStatus = '';
    atrWbLoginForced = false;
    var A = global.OneToneHomeAgentTask;
    if (A && A.writeProvider) A.writeProvider('workbuddy');
    var gateway = global.OneToneModelGateway;
    if (gateway && gateway.setRoute) {
      ['intent', 'planning', 'review', 'repair', 'synthesis'].forEach(function (p) {
        gateway.setRoute(p, 'workbuddy');
      });
    }
    var FMOk = freemodelChannelsApi();
    if (FMOk && FMOk.markChecked) FMOk.markChecked('workbuddy', { status: 'ok', note: 'oauth_ok' });
    toast(t('ha2WbFreemodelLoginOk', '已登录 WorkBuddy — 可在模型列表切换账号额度模型'));
    return refreshAtrProviders(true)
      .then(function () {
        return refreshWbLocal(true);
      })
      .then(function () {
      if (!mounted) return;
      var snap = store() && store().getSnapshot && store().getSnapshot();
      syncAtrProviderHost(snap);
      syncAtrWbLoginHost(snap);
        syncWbAccountHost(snap);
        var host = root && root.querySelector('[data-ha2-model-route-host]');
        if (host) host.removeAttribute('data-sig');
        syncModeChrome(snap);
      paint(snap);
    });
  }

  function pollAtrWbLogin(pendingId) {
    if (!pendingId || pendingId !== atrWbLoginPendingId) return;
    invoke('cmd_workbuddy_local_oauth_poll', { pendingId: pendingId })
      .then(function (res) {
        if (pendingId !== atrWbLoginPendingId) return;
        var st = res && res.status;
        if (st === 'ok') {
          return finishAtrWbLoginOk();
        }
        if (st === 'fail' || st === 'expired') {
          stopAtrWbLoginPoll();
          atrWbLoginBusy = false;
          atrWbLoginPendingId = '';
          atrWbLoginStatus = st === 'expired' ? 'expired' : 'fail';
          syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
          return;
        }
        atrWbLoginStatus = 'pending';
        syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
        atrWbLoginPollTimer = global.setTimeout(function () {
          pollAtrWbLogin(pendingId);
        }, 1500);
      })
      .catch(function () {
        if (pendingId !== atrWbLoginPendingId) return;
        stopAtrWbLoginPoll();
        atrWbLoginBusy = false;
        atrWbLoginPendingId = '';
        atrWbLoginStatus = 'fail';
        syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
      });
  }

  function startAtrWbLoginInline() {
    if (atrWbLoginBusy) return;
    stopAtrWbLoginPoll();
    atrWbLoginBusy = true;
    atrWbLoginStatus = 'pending';
    atrWbLoginForced = true;
    syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
    invoke('cmd_workbuddy_local_oauth_start', { region: 'cn' })
      .then(function (res) {
        var pendingId = res && res.pendingId ? String(res.pendingId) : '';
        if (!pendingId) {
          atrWbLoginBusy = false;
          atrWbLoginStatus = 'fail';
          syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
          toast(t('ha2AtrWbLoginFail', '登录失败，请重试'));
          return;
        }
        atrWbLoginPendingId = pendingId;
        pollAtrWbLogin(pendingId);
      })
      .catch(function (err) {
        atrWbLoginBusy = false;
        atrWbLoginPendingId = '';
        atrWbLoginStatus = 'fail';
        syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
        toast(String((err && err.message) || err || 'oauth_start_failed'));
      });
  }

  function cancelAtrWbLoginInline() {
    var pendingId = atrWbLoginPendingId;
    stopAtrWbLoginPoll();
    atrWbLoginBusy = false;
    atrWbLoginStatus = '';
    atrWbLoginPendingId = '';
    if (pendingId) {
      invoke('cmd_workbuddy_local_oauth_cancel', { pendingId: pendingId }).catch(function () {});
    }
    syncAtrWbLoginHost(store() && store().getSnapshot && store().getSnapshot());
  }

  var atrWbProbeGen = 0;

  /**
   * Isolation verify in sandbox. Returns a Promise.
   * opts.silent — quieter toast (auto path before real goal).
   * opts.pageGoal — keep work-page title as user's goal while verify runs.
   * Uses write_autonomous so silent verify does not stop on patch approval.
   */
  function startAtrSandboxVerify(opts) {
    opts = opts || {};
    var A = global.OneToneHomeAgentTask;
    var S = store();
    if (!A || !S || !S.startAndDriveAgentTask || !A.ensureVerifySandbox) {
      toast(t('ha2AtrVerifyNoApi', '无法启动隔离验证'));
      return Promise.reject(new Error('verify_no_api'));
    }
    var provider = (A.readProvider && A.readProvider()) || '';
    if (!provider) {
      toast(t('ha2AtrVerifyPick', '请先选择要验证的引擎'));
      return Promise.reject(new Error('verify_no_provider'));
    }
    toast(
      (opts.silent
        ? t(
            'ha2AtrVerifySilent',
            '首次编辑：正在后台验证引擎，通过后自动执行你的目标…'
          )
        : t(
            'ha2AtrVerifyStarting',
            '正在隔离沙箱验证引擎（通过前不开放普通编辑）…'
          )) +
        ' ' +
        provider
    );
    openAtrEditPage(opts.pageGoal || 'verify sandbox hello');
    return A.ensureVerifySandbox()
      .then(function (sb) {
        if (!sb || !sb.workspaceRoot) {
          throw new Error('no_sandbox');
        }
        if (S.setValidationNotice) {
          S.setValidationNotice({
            kind: 'atr_verify',
            code: 'verify_starting',
            message:
              '隔离验证：' +
              provider +
              ' @ ' +
              String(sb.sandboxId || sb.workspaceRoot),
            provider: provider
          });
        }
        // Backend owns expected_*/verify_intent via sandbox registry — FE only passes sandboxId.
        return S.startAndDriveAgentTask({
          goal: '把 scratch/hello.txt 改成 hello atr-verify\\n',
          materialsSummary: 'atr-sandbox-verify',
          provider: provider,
          allowTryEdit: true,
          permissionMode: 'write_autonomous',
          verifySandboxRoot: String(sb.workspaceRoot),
          sandboxId: sb.sandboxId || null
        });
      })
      .then(function (dto) {
        var taskId = dto && dto.taskId;
        var evalP =
          taskId && A.evaluateVerify
            ? A.evaluateVerify(taskId).catch(function () {
                return null;
              })
            : Promise.resolve(null);
        return evalP.then(function (res) {
          return refreshAtrProviders(true).then(function () {
            if (!mounted) return res;
            paint(S.getSnapshot());
            return res;
          });
        });
      })
      .catch(function (err) {
        toast(
          t('ha2AtrVerifyFailed', '隔离验证未能启动') +
            '：' +
            String((err && err.message) || err || '')
        );
        return Promise.reject(err);
      });
  }

  /** Background diagnostic — tryEdit uses probe; does not auto-grant editCapable. */
  function maybeProbeWorkbuddyEdit(info) {
    if (!info || !info.workbuddyChatReady) return;
    var A = global.OneToneHomeAgentTask;
    if (!A || !A.probeWorkbuddy) return;
    var gen = ++atrWbProbeGen;
    A.probeWorkbuddy(false)
      .then(function (next) {
        if (gen !== atrWbProbeGen) return;
        if (next) atrProvidersCache = next;
        if (mounted) syncAtrProviderHost(store() && store().getSnapshot && store().getSnapshot());
      })
      .catch(function () {});
  }

  function refreshAtrProviders(force) {
    var A = global.OneToneHomeAgentTask;
    if (!A || !A.featureEnabled || !A.featureEnabled() || !A.ready) {
      atrProvidersCache = null;
      return Promise.resolve(null);
    }
    if (!force && atrProvidersCache) return Promise.resolve(atrProvidersCache);
    var gen = ++atrProvidersFetchGen;
    return A.ready()
      .then(function (info) {
        if (gen !== atrProvidersFetchGen) return atrProvidersCache;
        atrProvidersCache = info || null;
        var cur = A.readProvider && A.readProvider();
        var curOk = false;
        var curRow = null;
        var plist = (info && info.providers) || [];
        for (var i = 0; i < plist.length; i++) {
          var row = plist[i] || {};
          var id = String(row.id || '').toLowerCase();
          if (id === String(cur || '').toLowerCase()) {
            curRow = row;
            // Keep user's explicit choice while chat/try still viable.
            curOk = !!(row.chatReady || row.ready || row.tryEdit || row.editCapable);
            break;
          }
        }
        // Never silent-write recommended Soft Pad / selectedDefault.
        if (cur && !curOk) {
          var S = store();
          if (S && S.setValidationNotice) {
            S.setValidationNotice({
              kind: 'atr_provider_stale',
              code: 'provider_stale',
              message:
                '当前引擎不可用（' +
                String(cur) +
                '）— 请确认更换，不会自动切换',
              actions: ['pick_provider'],
              recommendedProvider: info && info.recommendedProvider,
              recommendReason: info && info.recommendReason
            });
          }
        } else if (!cur && info && info.recommendedProvider) {
          // First use: show recommendation only — user must pick.
          var S2 = store();
          if (S2 && S2.setValidationNotice && !S2.getSnapshot().validationNotice) {
            S2.setValidationNotice({
              kind: 'atr_provider_recommend',
              code: 'provider_recommend',
              message:
                '推荐引擎：' +
                String(info.recommendedProvider) +
                (info.recommendReason ? ' — ' + String(info.recommendReason) : ''),
              actions: ['accept_recommend', 'pick_provider'],
              recommendedProvider: info.recommendedProvider,
              recommendReason: info.recommendReason
            });
          }
        }
        maybeProbeWorkbuddyEdit(info);
        if (mounted) {
          var snapNow = store() && store().getSnapshot && store().getSnapshot();
          if (atrWbChatReady()) atrWbLoginForced = false;
          syncAtrWbLoginHost(snapNow);
          syncAtrProviderHost(snapNow);
        }
        return atrProvidersCache;
      })
      .catch(function () {
        if (gen !== atrProvidersFetchGen) return atrProvidersCache;
        atrProvidersCache = atrProvidersCache || { providers: [] };
        return atrProvidersCache;
      });
  }

  function refreshWbLocal(force) {
    if (!force && wbLocalCache) return Promise.resolve(wbLocalCache);
    var gen = ++wbLocalFetchGen;
    return invoke('cmd_workbuddy_local_accounts_list', {})
      .then(function (res) {
        if (gen !== wbLocalFetchGen) return wbLocalCache;
        wbLocalCache = projectWbLocal(res);
        return wbLocalCache;
      })
      .catch(function () {
        if (gen !== wbLocalFetchGen) return wbLocalCache;
        wbLocalCache = projectWbLocal(null);
        return wbLocalCache;
      });
  }

  function ensureWbModelForDock(kind) {
    kind = String(kind || '');
    if (kind !== 'workbuddy') {
      syncWbModelHost(kind);
      syncWbChatChrome(kind);
      return;
    }
    syncWbModelHost(kind);
    syncWbChatChrome(kind);
    refreshWbLocal(!wbLocalCache).then(function () {
      if (!mounted) return;
      syncWbModelHost('workbuddy');
      syncWbChatChrome('workbuddy');
    });
  }

  function wbSelectedModelId() {
    var el = root && root.querySelector('[data-ha2-wb-model]');
    if (el && el.value) return String(el.value);
    var def = wbDefaultAccount(wbLocalCache);
    return def ? String(def.selectedModel || '') : '';
  }

  /** local = in-app WorkBuddy LLM; desktop = paste into WorkBuddy.exe. */
  function wbUsesLocalChat(kind, snap) {
    return String(kind || '') === 'workbuddy' && wbSendModeOf(snap) !== 'desktop';
  }

  /**
   * Chat-mode ModelGateway path (WB freemodel / Soft Pad / API).
   * Model route is the transport; Agent chip is context (project/app).
   * Only WorkBuddy「桌面」opts out to paste into WorkBuddy.exe.
   */
  function gatewayChatEligible(snap) {
    if (atrEditPathOn(snap)) return false;
    var kind = String((snap && snap.selectedKind) || '');
    if (kind === 'workbuddy' && wbSendModeOf(snap) === 'desktop') return false;
    return true;
  }

  function openWbAgentConfig() {
    var Nav = global.OneToneAgentNavTarget;
    if (Nav && Nav.open) {
      Nav.open({ view: 'overview', section: 'working', provider: 'workbuddy' });
      return;
    }
    var S = store();
    if (S && S.setSelected) S.setSelected('workbuddy', { lock: true, force: true });
    if (S) S.setView('agent');
  }

  function wbModeToggleHtml(kind, snap) {
    if (String(kind || '') !== 'workbuddy') return '';
    var mode = wbSendModeOf(snap);
    var busy = wbChatBusy ? ' disabled aria-disabled="true"' : '';
    return (
      '<span class="ha2-wb-mode" role="group" aria-label="' +
      esc(t('ha2WbSendMode', '发送方式')) +
      '">' +
      '<button type="button" class="ha2-wb-mode-btn' +
      (mode === 'local' ? ' is-on' : '') +
      '" data-ha2-wb-mode="local"' +
      busy +
      ' title="' +
      esc(t('ha2WbModeLocalHint', '本机大模型对话，不打开 WorkBuddy 窗口')) +
      '">' +
      esc(t('ha2WbModeLocal', '本机')) +
      '</button>' +
      '<button type="button" class="ha2-wb-mode-btn' +
      (mode === 'desktop' ? ' is-on' : '') +
      '" data-ha2-wb-mode="desktop"' +
      busy +
      ' title="' +
      esc(t('ha2WbModeDesktopHint', '粘贴到桌面 WorkBuddy')) +
      '">' +
      esc(t('ha2WbModeDesktop', '桌面')) +
      '</button></span>'
    );
  }

  var WB_CHAT_ICON = 'icons/app-target/workbuddy.png';

  function wbAssistantLabel(providerId, fallbackFrom) {
    var pid = String(providerId || '');
    var from = String(fallbackFrom || '');
    if (from === 'softpad_our_freemodel' || (from && pid === 'workbuddy')) {
      return t('ha2WbRoleSoftPadFallback', 'Soft Pad→WorkBuddy');
    }
    if (
      pid === 'softpad_our_freemodel' ||
      /^(deepseek|kimi|openrouter|siliconflow)$/i.test(pid)
    ) {
      return t('ha2WbRoleSoftPad', 'Soft Pad');
    }
    if (pid && pid !== 'workbuddy' && pid !== 'weather' && pid !== 'system') {
      return pid;
    }
    return t('ha2WbRoleAssistant', 'WorkBuddy');
  }

  function wbTurnRoleHtml(role, modelId, providerId, fallbackFrom) {
    if (role === 'assistant') {
      // Icon follows selected model/provider brand; label stays channel-facing.
      var brand = modelRouteDisplay(modelId, providerId);
      var icon = (brand && brand.icon) || WB_CHAT_ICON;
      return (
        '<img class="ha2-wb-turn-ico" src="' +
        esc(icon) +
        '" alt="" />' +
        '<span>' +
        esc(wbAssistantLabel(providerId, fallbackFrom)) +
        '</span>' +
        (modelId
          ? '<span class="ha2-wb-turn-meta">· ' + esc(modelId) + '</span>'
          : '')
      );
    }
    return (
      '<span class="ha2-wb-avatar-me">' +
      esc(t('ha2WbRoleUser', '我')) +
      '</span>'
    );
  }

  /** Presentation shell only — does not rewrite model wording. */
  function wbTurnBodyHtml(text, streaming) {
    if (streaming) {
      return (
        '<pre class="ha2-wb-page-turn-text is-plain">' +
        esc(text || '…') +
        '</pre>'
      );
    }
    var Caps = global.OneToneHomeAgentCapabilities;
    if (Caps && typeof Caps.formatChatBodyHtml === 'function') {
      return (
        '<div class="ha2-wb-page-turn-text ha2-md">' +
        Caps.formatChatBodyHtml(text) +
        '</div>'
      );
    }
    return '<pre class="ha2-wb-page-turn-text is-plain">' + esc(text || '') + '</pre>';
  }

  /** Fold-chip summary only — CoT stays in detail. */
  function thinkingChipLabel(turn) {
    turn = turn || {};
    if (turn.toolOk === false) {
      var stopped = String(turn.text || '').trim();
      return stopped || t('ha2WbChatCancelled', '已停止');
    }
    var live =
      !!turn.streaming ||
      (!!wbChatBusy &&
        turn.id &&
        (String(turn.id) === String(wbThinkingTurnId || '') ||
          String(turn.id) === 'think_' + String(chatLoopTaskId || '')));
    if (live) return t('ha2ToolThinkingLive', '思考中…');
    if (String(turn.detail || '').trim()) {
      return t('ha2ToolThinkingDone', '已思考');
    }
    return t('ha2ToolThinkingIdle', '思考');
  }

  function wbToolStepHtml(turn) {
    turn = turn || {};
    var tool = turn.toolName || '';
    var isThinking = tool === 'thinking';
    var label = isThinking
      ? thinkingChipLabel(turn)
      : chatToolStepLabel(tool) || turn.text || tool;
    var open = turn.collapsed === false;
    var ok = turn.toolOk !== false;
    var detail = String(turn.detail || '').trim();
    var thinkSub = '';
    if (isThinking) {
      // Summary subtitle must stay visible (badge-only was washing out on light themes).
      thinkSub = String(turn.text || '').trim();
      if (!thinkSub || thinkSub === label) {
        thinkSub = detail.split('\n')[0] || '';
      }
      if (!thinkSub) {
        thinkSub = t('ha2ChatLoopWaitingModel', '正在等待模型回应…');
      }
      if (!detail) detail = thinkSub;
    }
    var turnId = turn.id ? String(turn.id) : '';
    if (turn.kind === 'needs_input') {
      return (
        '<div class="ha2-wb-page-turn ha2-wb-page-turn--tool is-needs-input" data-ha2-tool-step>' +
        '<div class="ha2-tool-step-hd">' +
        '<span class="ha2-tool-step-badge">' +
        esc(t('ha2NeedsInput', 'Needs input')) +
        '</span>' +
        '<span class="ha2-tool-step-label">' +
        esc(turn.text || label) +
        '</span></div>' +
        '<div class="ha2-chat-needs-row">' +
        '<input type="text" class="ha2-chat-needs-input" data-ha2-chat-needs-input' +
        ' placeholder="' +
        esc(t('ha2ChatNeedsPh', '在此回复…')) +
        '" />' +
        '<button type="button" class="ha2-btn primary ha2-chat-needs-go" data-ha2-chat-needs-reply>' +
        esc(t('ha2ChatNeedsGo', '继续')) +
        '</button></div></div>'
      );
    }
    if (turn.kind === 'deliver_approval') {
      return (
        '<div class="ha2-wb-page-turn ha2-wb-page-turn--tool is-deliver-approval" data-ha2-tool-step' +
        ' data-ha2-deliver-token="' +
        esc(turn.approvalToken || '') +
        '">' +
        '<div class="ha2-tool-step-hd">' +
        '<span class="ha2-tool-step-badge">' +
        esc(t('ha2DeliverApprove', '投递确认')) +
        '</span>' +
        '<span class="ha2-tool-step-label">' +
        esc(turn.text || label) +
        '</span></div>' +
        (detail
          ? '<pre class="ha2-tool-step-detail">' + esc(detail) + '</pre>'
          : '') +
        '<div class="ha2-chat-deliver-actions">' +
        '<button type="button" class="ha2-btn primary" data-ha2-chat-deliver-approve>' +
        esc(t('ha2DeliverOk', '批准投递')) +
        '</button>' +
        '<button type="button" class="ha2-btn" data-ha2-chat-deliver-reject>' +
        esc(t('ha2DeliverNo', '取消')) +
        '</button></div></div>'
      );
    }
    if (turn.kind === 'finish') {
      return (
        '<div class="ha2-wb-page-turn ha2-wb-page-turn--assistant ha2-wb-page-turn--finish">' +
        '<span class="ha2-wb-page-turn-role">' +
        wbTurnRoleHtml('assistant', turn.model, turn.providerId, turn.fallbackFrom) +
        '</span>' +
        wbTurnBodyHtml(turn.text || '', false) +
        '</div>'
      );
    }
    // Empty chips (no badge text) paint as purple/grey border rails — skip.
    if (!String(label || '').trim() && !detail && !thinkSub) return '';
    if (!String(label || '').trim()) {
      label = isThinking
        ? thinkSub || t('ha2ToolThinkingLive', '思考中…')
        : thinkSub || detail.split('\n')[0] || t('ha2ToolStep', '工具');
    }
    // Live thinking must NOT use <details> — WebView2 often collapses open details
    // to a border-only rail with no visible badge/body text.
    if (isThinking && (open || turn.streaming)) {
      var liveSub = thinkSub || label;
      // Don't mirror the same waiting line under the header — that was getting
      // clipped mid-glyph by overflow:hidden on the tool shell.
      var liveBody =
        detail &&
        detail !== liveSub &&
        detail !== label
          ? detail
          : '';
      return (
        '<div class="ha2-wb-page-turn ha2-wb-page-turn--tool ha2-wb-page-turn--thinking is-live"' +
        ' data-ha2-tool-step data-ha2-thinking="1"' +
        (liveBody ? ' data-ha2-has-detail="1"' : '') +
        (turnId ? ' data-ha2-turn-id="' + esc(turnId) + '"' : '') +
        '>' +
        '<div class="ha2-tool-step-hd">' +
        '<span class="ha2-tool-step-badge">' +
        esc(label) +
        '</span>' +
        '<span class="ha2-tool-step-label">' +
        esc(liveSub) +
        '</span></div>' +
        (liveBody
          ? '<pre class="ha2-tool-step-detail">' + esc(liveBody) + '</pre>'
          : '') +
        '</div>'
      );
    }
    // Closed chips: omit detail from DOM so WebView2 cannot paint grey body strips.
    // Toggle handler remounts detail when the user expands.
    return (
      '<details class="ha2-wb-page-turn ha2-wb-page-turn--tool' +
      (isThinking ? ' ha2-wb-page-turn--thinking' : '') +
      (ok ? '' : ' is-err') +
      '" data-ha2-tool-step' +
      (isThinking ? ' data-ha2-thinking="1"' : '') +
      (turnId ? ' data-ha2-turn-id="' + esc(turnId) + '"' : '') +
      (detail ? ' data-ha2-has-detail="1"' : '') +
      (open ? ' open' : '') +
      '>' +
      '<summary class="ha2-tool-step-hd">' +
      '<span class="ha2-tool-step-badge">' +
      esc(label) +
      '</span>' +
      (isThinking && thinkSub
        ? '<span class="ha2-tool-step-label">' + esc(thinkSub) + '</span>'
        : '') +
      (ok ? '' : '<span class="ha2-tool-step-err">!</span>') +
      '</summary>' +
      (detail && open
        ? '<pre class="ha2-tool-step-detail">' + esc(detail) + '</pre>'
        : '') +
      '</details>'
    );
  }

  function wbChatTurnHtml(turn, model) {
    turn = turn || {};
    if (turn.kind === 'chat_conflict') {
      return chatConflictTurnHtml(turn);
    }
    if (
      turn.kind === 'tool_step' ||
      turn.kind === 'needs_input' ||
      turn.kind === 'deliver_approval' ||
      turn.kind === 'finish'
    ) {
      return wbToolStepHtml(turn);
    }
    var role = turn.role === 'assistant' ? 'assistant' : 'user';
    // Empty assistant shells paint as thin border rails in WebView2 — skip them.
    if (
      role === 'assistant' &&
      !turn.streaming &&
      !String(turn.text || '').trim()
    ) {
      return '';
    }
    return (
      '<div class="ha2-wb-page-turn ha2-wb-page-turn--' +
      role +
      (turn.streaming ? ' is-streaming' : '') +
      '"><span class="ha2-wb-page-turn-role">' +
      wbTurnRoleHtml(role, turn.model || model, turn.providerId, turn.fallbackFrom) +
      '</span>' +
      wbTurnBodyHtml(turn.text || '', !!turn.streaming) +
      '</div>'
    );
  }

  /**
   * Home dock no longer embeds the dialogue list — exclusive right window only
   * (openWbChatPage). Kept as a no-op so syncWbChatChrome / dockStaticHtml stay stable.
   */
  function wbTranscriptHtml(kind) {
    void kind;
    return '';
  }

  function syncWbChatChrome(kind) {
    if (!root) return;
    var snap = store() && store().getSnapshot ? store().getSnapshot() : null;
    var host = root.querySelector('[data-ha2-wb-transcript-host]');
    if (host) host.innerHTML = wbTranscriptHtml(kind);
    var modeHost = root.querySelector('[data-ha2-wb-mode-host]');
    if (modeHost) {
      var html = wbModeToggleHtml(kind, snap);
      if (modeHost.getAttribute('data-sig') !== html) {
        modeHost.setAttribute('data-sig', html);
        modeHost.innerHTML = html;
      }
    }
  }

  function iconHtml(cat, cls) {
    cls = cls || 'ha2-icon';
    if (cat && cat.icon) {
      return (
        '<span class="' +
        cls +
        ' ha2-icon--img"><img src="' +
        esc(cat.icon) +
        '" alt="" decoding="async" /></span>'
      );
    }
    return (
      '<span class="' +
      cls +
      ' ha2-icon--fallback" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v2a7 7 0 0 1-14 0V10a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4zm-1 9a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg></span>'
    );
  }

  function can(actions, id) {
    if (!Array.isArray(actions)) return false;
    for (var i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].id === id && actions[i].enabled !== false) return true;
    }
    return false;
  }

  function statusTone(status) {
    if (/needs|waiting|approval|needsinput/.test(status)) return 'wait';
    if (/working|running|active/.test(status)) return 'live';
    if (/fail|error/.test(status)) return 'fail';
    if (/done|complet/.test(status)) return 'done';
    return '';
  }

  function pulseSt(status) {
    var tone = statusTone(status);
    if (tone === 'wait' || tone === 'fail') return 'needs';
    if (tone === 'live') return 'running';
    if (tone === 'done') return 'done';
    return 'idle';
  }

  function relWhen(ms) {
    var n = Number(ms) || 0;
    if (!n) return '';
    var d = Math.max(0, Date.now() - n);
    if (d < 60000) return t('ha2JustNow', '刚刚');
    if (d < 3600000) return Math.floor(d / 60000) + t('ha2MinutesAgo', ' 分钟前');
    if (d < 86400000) return Math.floor(d / 3600000) + t('ha2HoursAgo', ' 小时前');
    return Math.floor(d / 86400000) + t('ha2DaysAgo', ' 天前');
  }

  function truncateLabel(s, max) {
    s = String(s || '').trim();
    if (!s) return '';
    max = max || 42;
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function catalogByAppId(appId) {
    appId = String(appId || '').trim();
    if (!appId) return null;
    var S = store();
    var list = (S && S.catalogList && S.catalogList()) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].appId || '') === appId) return list[i];
    }
    // Soft aliases: cursor-chat / Cursor.exe → Cursor catalog row.
    var low = appId.toLowerCase();
    for (i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c) continue;
      if (low.indexOf(String(c.id || '')) >= 0) return c;
      if (String(c.appId || '').toLowerCase().indexOf(low) >= 0) return c;
    }
    return null;
  }

  function resolveAppDisplay(appId) {
    appId = String(appId || '').trim();
    if (!appId) return null;
    var cat = catalogByAppId(appId);
    if (cat) return { id: cat.id, name: cat.name, icon: cat.icon || '', appId: cat.appId || appId };
    var Rules = global.OneToneAppBehaviorRules;
    var name =
      (Rules && Rules.appDisplayName && Rules.appDisplayName(appId)) ||
      appId;
    var Atp = global.OneToneAppTargetPresets;
    var preset = Atp && Atp.presetById ? Atp.presetById(appId) : null;
    return {
      id: '',
      name: name,
      icon: (preset && preset.icon) || '',
      appId: appId
    };
  }

  function currentHabitMatchedApps() {
    var out = [];
    try {
      var cfg =
        (global.OneToneState &&
          global.OneToneState.state &&
          global.OneToneState.state.config) ||
        {};
      var activeId = String(cfg.activeSceneId || '').trim();
      var core = global.OneToneMappingCore;
      var m =
        (activeId && core && core.byId && core.byId(activeId)) ||
        (global.OneToneHomeScheme &&
          global.OneToneHomeScheme.activeMapping &&
          global.OneToneHomeScheme.activeMapping()) ||
        null;
      var Hp = global.OneToneHabitProfile;
      var ids =
        (Hp && Hp.configuredAppIds && Hp.configuredAppIds(m)) ||
        (m && m.appTargetId ? [m.appTargetId] : []) ||
        [];
      var seen = {};
      for (var i = 0; i < ids.length; i++) {
        var id = String(ids[i] || '').trim();
        if (!id || seen[id]) continue;
        seen[id] = true;
        var app = resolveAppDisplay(id);
        if (app) out.push(app);
      }
    } catch (_) {}
    return out;
  }

  function contextLabels() {
    var appName = t('ha2FgUnknown', '前台应用');
    var appIcon = '';
    var kind = '';
    var appId = '';
    var windowTitle = '';
    var habit = t('ha2HabitUnknown', '当前习惯');
    var matchedApps = currentHabitMatchedApps();
    try {
      var rt = global.OneToneRuntimeHabitControl;
      var id = rt && rt.foregroundIdentity ? rt.foregroundIdentity() : null;
      if (!id) {
        var nav = global.OneToneHabitLayerNav;
        id = nav && nav.getForegroundIdentity ? nav.getForegroundIdentity() : null;
      }
      if (id) {
        windowTitle = String(id.windowTitle || id.window_title || '').trim();
        appId = String(
          id.matchedPresetAppId ||
            id.matched_preset_app_id ||
            id.appId ||
            ''
        ).trim();
        var resolved = resolveAppDisplay(appId);
        if (resolved) {
          appName = resolved.name || appName;
          appIcon = resolved.icon || '';
          kind = resolved.id || '';
        } else {
          appName =
            truncateLabel(id.exeName || id.exe_name || appId || '', 28) || appName;
        }
      }
    } catch (_) {}
    // Habit-matched primary app wins the chip when FG is unknown / OneTone itself.
    if ((!kind || !appIcon) && matchedApps.length) {
      var primary = matchedApps[0];
      if (!kind) {
        appName = primary.name || appName;
        appIcon = primary.icon || appIcon;
        kind = primary.id || kind;
        appId = primary.appId || appId;
      } else if (!appIcon && primary.icon) {
        appIcon = primary.icon;
      }
    }
    try {
      var hr = global.OneToneHabitRuntime;
      var snap = hr && hr.getSnapshot ? hr.getSnapshot() : null;
      var name = snap && snap.current && snap.current.name;
      if (name) habit = truncateLabel(name, 28);
    } catch (_) {}
    return {
      appName: appName,
      appIcon: appIcon,
      kind: kind,
      appId: appId,
      windowTitle: windowTitle,
      habit: habit,
      matchedApps: matchedApps,
      // Compat for older callers that still read .fg
      fg: appName
    };
  }

  /** Document-looking FG titles (plans, paths) belong on the matching agent card. */
  function fgDocHintForKind(kind) {
    kind = String(kind || '');
    if (!kind) return '';
    var ctx = contextLabels();
    if (String(ctx.kind || '') !== kind) return '';
    var title = String(ctx.windowTitle || '').trim();
    if (!title) return '';
    if (
      !/\.(md|txt|json|ts|tsx|js|rs|py|plan\.md)\b/i.test(title) &&
      title.indexOf('\\') < 0 &&
      title.indexOf('/') < 0 &&
      title.indexOf('.plan') < 0
    ) {
      return '';
    }
    // Strip directory noise — keep the leaf (home_card_dedup_….plan.md).
    var leaf = title.replace(/^[\\\/]+/, '');
    var parts = leaf.split(/[\\\/]/);
    leaf = parts[parts.length - 1] || leaf;
    return truncateLabel(leaf, 52);
  }

  function selectedAgent(snap) {
    var kind = (snap && snap.selectedKind) || '';
    if (!kind) return null;
    var list = (snap && snap.agents) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === kind) return list[i];
    }
    return null;
  }

  function taskVm(snap) {
    var fvm = snap.focusVm;
    var mode = snap.mode || (fvm && fvm.mode) || 'quiet';
    if (fvm && fvm.headline && (mode === 'attention' || mode === 'return' || mode === 'degraded')) {
      return {
        kicker:
          mode === 'attention'
            ? t('ha2TaskNeeds', '需要你确认')
            : mode === 'return'
              ? t('ha2TaskReturn', '可以继续')
              : t('ha2TaskFailed', '遇到问题'),
        title: fvm.headline,
        sub: fvm.assistance || fvm.copy || '',
        menu: sendMenuLabel(snap)
      };
    }
    var rows = (store() && store().workRows && store().workRows(3)) || [];
    var agent = rows[0] || null;
    if (!agent) {
      // Honest resume path when Focus stayed quiet but archive / continue evidence exists.
      // Never claim "running" — only surface that work can be continued.
      var runs = (snap && snap.interruptedWorkRuns) || [];
      var notice = snap && snap.validationNotice;
      var noticeInterrupted =
        !!(
          notice &&
          (notice.code === 'interrupted' ||
            notice.kind === 'atr_interrupted' ||
            notice.kind === 'atr_archive_interrupted')
        );
      var task = snap && snap.agentTask;
      var taskInterrupted = !!(task && String(task.status || '') === 'interrupted');
      if (runs.length || noticeInterrupted || taskInterrupted) {
        var goal =
          (task && String(task.goal || '').trim()) ||
          (runs[0] &&
            String(
              runs[0].goal || runs[0].title || runs[0].summary || runs[0].runId || ''
            ).trim()) ||
          (notice && String(notice.message || '').trim()) ||
          t('ha2AtrInterruptedTitle', '编辑任务已中断');
        return {
          kicker: t('ha2TaskReturn', '可以继续'),
          title: goal,
          sub: t(
            'ha2ResumeArchiveN',
            '有 {n} 个可恢复档案 — 恢复或放弃'
          ).replace('{n}', String(runs.length || 1)),
          menu: sendMenuLabel(snap)
        };
      }
      var ck = fvm && fvm.desk && fvm.desk.continueCard;
      var ckTitle = ck && String(ck.title || '').trim();
      var weakCk =
        !ckTitle ||
        /上次进度\s*$/.test(ckTitle) ||
        ckTitle === '可恢复' ||
        ckTitle === String((ck && ck.badge) || '') + ' 上次进度';
      if (ckTitle && !weakCk) {
        return {
          kicker: t('ha2TaskReturn', '可以继续'),
          title: ckTitle,
          sub: String((ck && (ck.detail || ck.note)) || '').trim() || t('ha2ResumeTag', '可恢复'),
          menu: sendMenuLabel(snap)
        };
      }
      // Prefer a real history / help hint over industrial empty boilerplate.
      var hints =
        (store() && store().quietHintLines && store().quietHintLines(1)) || [];
      var sub =
        hints[0] && hints[0].text
          ? hints[0].text
          : !snap.inventoryLoaded
            ? t('ha2TaskEmptySubLoading', '正在探测本机 Agent…')
            : t('ha2TaskEmptySub', '在底栏选一个 Agent，写一句就能发过去');
      return {
        // Nav / page already says「现在」— empty state needs no kicker prefix.
        kicker: '',
        title: t('ha2TaskEmptyTitle', '没有正在推进的事'),
        sub: sub,
        menu: sendMenuLabel(snap)
      };
    }
    var st = String(agent.status || '');
    var kicker = t('ha2TaskNow', '现在');
    if (/needs|waiting|approval|needsinput/.test(st)) kicker = t('ha2TaskNeeds', '需要你确认');
    else if (/fail|error/.test(st)) kicker = t('ha2TaskFailed', '遇到问题');
    else if (/done|complet/.test(st)) kicker = t('ha2TaskDone', '刚刚完成');
    else if (/working|running|active/.test(st)) kicker = t('ha2TaskWorking', '正在处理');
    else if (/resumable|interrupted/.test(st)) kicker = t('ha2TaskReturn', '可以继续');
    var title = agent.line || agent.title || t('ha2TaskWorkingTitle', '正在处理中');
    var when = relWhen(agent.updated);
    var subParts = [(agent.cat && agent.cat.name) || agent.kind];
    if (agent.project) subParts.push(agent.project);
    if (when) subParts.push(when);
    return {
      kicker: kicker,
      title: title,
      sub: subParts.join(' · '),
      menu: sendMenuLabel(snap)
    };
  }

  /** Soft Pad trigger copy: 「发送 Cursor」 when a target is known. */
  function sendMenuLabel(snap) {
    var c = currentCat(snap);
    if (c && c.id && c.name) return t('ha2Send', '发送') + ' ' + c.name;
    return t('ha2PickAgent', '选择 Agent');
  }

  function presenceBits(snap) {
    var targets = (snap && snap.targets) || [];
    var running = [];
    var idle = [];
    var i;
    for (i = 0; i < targets.length; i++) {
      var tg = targets[i];
      if (!tg || !tg.kind || !tg.discovered) continue;
      var name = tg.label || tg.kind;
      if (tg.running) running.push(name);
      else idle.push(name);
    }
    return { running: running, idle: idle };
  }

  function pulseHtml(snap) {
    // Dock owns target pick; pulse only surfaces agents that need the user.
    if (atrEditPathOn(snap)) return '';
    var rows = (store() && store().workRows && store().workRows(5)) || [];
    var chips = [];
    var seen = {};
    var i;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.kind || seen[r.kind]) continue;
      if (pulseSt(r.status) !== 'needs') continue;
      seen[r.kind] = true;
      chips.push({
        kind: r.kind,
        name: (r.cat && r.cat.name) || r.kind,
        status: r.status
      });
      if (chips.length >= 2) break;
    }
    if (!chips.length) return '';
    return (
      '<div class="ha2-pulse" data-ha2-pulse role="list" aria-label="' +
      esc(t('ha2PulseLabel', 'Agent 状态')) +
      '">' +
      chips
        .map(function (chip) {
          var st = pulseSt(chip.status);
          var on = snap.selectedKind === chip.kind ? ' is-on' : '';
          var text = chip.label || chip.name;
          return (
            '<button type="button" class="ha2-pulse-chip' +
            on +
            '" data-st="' +
            st +
            '" data-ha2-select="' +
            esc(chip.kind) +
            '" role="listitem">' +
            '<i class="ha2-dot ' +
            (st === 'running' ? 'live' : st === 'needs' ? 'wait' : st === 'done' ? 'done' : '') +
            '" aria-hidden="true"></i>' +
            esc(text) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function pillsHtml(snap) {
    var receipt = snap && (snap.deliveryReceipt || snap.receipt);
    var notice = snap && snap.validationNotice;
    var receiptLocal = !!(receipt && receipt.kind === 'local_chat');
    var modeLocal = wbUsesLocalChat((snap && snap.selectedKind) || '', snap);
    var isLocalChat = receiptLocal || (!receipt && modeLocal);
    var atrEdit = atrEditPathOn(snap);
    var atrTask = snap && snap.agentTask;
    var atrLive = atrTaskShouldSurface(snap);
    var atrNoticeOn =
      !!(notice && (String(notice.kind || '').indexOf('atr_') === 0 || notice.code));
    var deliv =
      atrEdit || atrLive
        ? t('ha2PillNoEditTask', '尚未启动编辑')
        : isLocalChat
          ? t('ha2PillNoLocalChat', '尚未本机对话')
          : t('ha2PillNoDelivery', '尚未投递');
    var tone = '';
    var atrPillOpen = false;
    if (notice && notice.kind === 'missing_project') {
      deliv = notice.message || t('ha2NeedProject', '先选定项目');
      tone = ' is-warn';
    } else if (atrTask && atrLive) {
      var turnP = atrTask.currentTurn != null ? atrTask.currentTurn : 0;
      var toolsP = atrTask.toolCallCount != null ? atrTask.toolCallCount : 0;
      deliv =
        t('ha2AtrStepN', '第 {n} 步').replace('{n}', String(turnP || 0)) +
        (toolsP
          ? ' · ' + t('ha2AtrToolN', '{n} 次工具').replace('{n}', String(toolsP))
          : '') +
        ' · ' +
        String(atrTask.status || '');
      tone =
        atrTask.status === 'failed' || atrTask.status === 'interrupted'
          ? ' is-warn'
          : atrTask.status === 'done'
            ? ' is-ok'
            : '';
      atrPillOpen = true;
    } else if (atrEdit && atrNoticeOn) {
      deliv = notice.message || t('ha2PillEditFailed', '编辑任务失败');
      tone =
        notice.code === 'starting' || notice.kind === 'atr_starting' ? '' : ' is-warn';
      atrPillOpen = !!(notice.code === 'driving' || notice.code === 'starting');
    } else if (receipt) {
      if (receipt.phase === 'sending' || receipt.outcome === 'delivery_attempt') {
        deliv =
          receipt.title ||
          (receiptLocal ? t('ha2WbChatting', '正在回复…') : t('ha2PillSending', '正在尝试投递'));
      } else if (receipt.phase === 'failed' || receipt.outcome === 'failed') {
        deliv =
          receipt.title ||
          (receiptLocal ? t('ha2WbChatFailed', '本机对话失败') : t('ha2PillFailed', '投递失败'));
        tone = ' is-warn';
      } else if (receipt.outcome === 'pasted_confirmed') {
        deliv = receipt.title || t('ha2PillPasted', '已确认粘贴');
        tone = ' is-ok';
      } else if (receipt.outcome === 'activated_confirmed') {
        deliv = receipt.title || t('ha2PillActivated', '已确认唤起');
        tone = ' is-ok';
      } else if (receipt.outcome === 'local_replied') {
        deliv = receipt.title || t('ha2WbReplied', '本机对话已回复');
        tone = ' is-ok';
      } else if (receipt.outcome === 'attempted') {
        deliv = receipt.title || t('ha2PillAttempted', '结果未确认');
        tone = ' is-warn';
      } else {
        deliv = receipt.title || t('ha2PillAttempted', '结果未确认');
        tone = receipt.verified ? ' is-ok' : ' is-warn';
      }
    }
    // Target lives on task-menu / dock chip — no second「发送到 X」echo.
    // ATR live pill opens the steps/dialogue page (not just a truncated status).
    var pillInner =
      '<i aria-hidden="true"></i><span class="ha2-pill-lbl">' +
      esc(
        atrEdit
          ? t('ha2PillEditTask', '编辑')
          : receiptLocal || isLocalChat
            ? t('ha2PillLocalChat', '本机对话')
            : t('ha2PillDelivery', '投递')
      ) +
      '</span><span class="ha2-pill-val">' +
      esc(truncateLabel(deliv, 28)) +
      '</span>';
    return (
      '<div class="ha2-pills" data-ha2-pills>' +
      (atrPillOpen
        ? '<button type="button" class="ha2-pill ha2-pill--btn' +
          tone +
          '" data-ha2-atr-open-page title="' +
          esc(t('ha2AtrOpenPage', '查看步骤对话')) +
          '">' +
          pillInner +
          '</button>'
        : '<span class="ha2-pill' + tone + '">' + pillInner + '</span>') +
      '</div>'
    );
  }

  /**
   * Waiting-for-user target. Never treat phantom approval.approve as eligibility —
   * Agent Center does not wire that action; only real needs/waiting status qualifies.
   */
  function approvalTarget(snap) {
    function eligible(a) {
      if (!a) return false;
      var Caps = global.OneToneHomeAgentCapabilities;
      if (Caps && Caps.isWaitingForUserStatus) return Caps.isWaitingForUserStatus(a.status);
      return /needs|waiting|approval|needsinput/.test(String(a.status || ''));
    }
    // Prefer merged workRows (Center ∪ Soft Pad desk) so Soft Pad wait isn't a second strip.
    var rows = (store() && store().workRows && store().workRows(5)) || [];
    var i;
    for (i = 0; i < rows.length; i++) {
      if (eligible(rows[i])) return rows[i];
    }
    var sel = selectedAgent(snap);
    if (eligible(sel)) return sel;
    var list = (snap && snap.agents) || [];
    for (i = 0; i < list.length; i++) {
      if (eligible(list[i])) return list[i];
    }
    return null;
  }

  function atrEventMs(e) {
    var n = Number(
      (e && (e.createdAt != null ? e.createdAt : e.created_at)) || 0
    );
    return n > 1e11 ? n : n > 0 ? n * 1000 : 0;
  }

  function atrFormatClock(ms) {
    if (!ms) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    function pad(n) {
      return n < 10 ? '0' + n : String(n);
    }
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  function atrFormatDuration(ms) {
    var n = Number(ms) || 0;
    if (n <= 0) return '';
    if (n < 1000) return Math.max(1, Math.round(n)) + 'ms';
    if (n < 10000) return (Math.round(n / 100) / 10).toFixed(1) + 's';
    return Math.round(n / 1000) + 's';
  }

  function atrFormatBytes(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function atrEventLabel(e) {
    e = e || {};
    var kind = String(e.kind || '');
    var tool = String(e.toolName || '');
    var map = {
      started: t('ha2AtrEvStarted', '已启动'),
      task_started: t('ha2AtrEvStarted', '已启动'),
      tool_call: t('ha2AtrEvTool', '调用工具'),
      tool_result: t('ha2AtrEvResult', '工具结果'),
      tool_error: t('ha2AtrEvToolErr', '工具失败'),
      format_retry: t('ha2AtrEvFormatRetry', '格式重试'),
      format_error: t('ha2AtrEvFormatFail', '模型未按工具格式行动'),
      model_error: t('ha2AtrEvModelErr', '模型调用失败'),
      budget_exhausted: t('ha2AtrEvBudget', '步数用尽'),
      rate_limited: t('ha2AtrEvRate', '请求过于频繁'),
      waiting_approval: t('ha2AtrEvWaitApprove', '等待批准补丁'),
      waiting_user: t('ha2AtrEvWaitInput', '等待你补充'),
      waiting_user_input: t('ha2AtrEvWaitInput', '等待你补充'),
      user_input: t('ha2AtrEvUserIn', '你已补充'),
      patch_applied: t('ha2AtrEvApplied', '已写入'),
      exported_desktop: t('ha2AtrEvExported', '已放到桌面'),
      done: t('ha2AtrEvDone', '任务完成'),
      task_done: t('ha2AtrEvDone', '任务完成'),
      failed: t('ha2AtrEvFailed', '任务失败'),
      task_failed: t('ha2AtrEvFailed', '任务失败'),
      interrupted: t('ha2AtrEvInterrupted', '已中断'),
      task_interrupted: t('ha2AtrEvInterrupted', '已中断'),
      cancelled: t('ha2AtrEvCancelled', '已取消'),
      task_cancelled: t('ha2AtrEvCancelled', '已取消')
    };
    var base = map[kind] || kind || t('ha2AtrEvStep', '步骤');
    var turn = e.turn != null ? Number(e.turn) : 0;
    var step =
      turn > 0 ? t('ha2AtrStepN', '第 {n} 步').replace('{n}', String(turn)) + ' · ' : '';
    return step + (tool ? base + ' · ' + tool : base);
  }

  /** User-facing short step — no tool JSON / modelExcerpt. */
  function atrUserStepLine(e) {
    e = e || {};
    var kind = String(e.kind || '');
    var tool = String(e.toolName || e.tool || '');
    var p = e.payload || {};
    var args = p.arguments && typeof p.arguments === 'object' ? p.arguments : {};
    var path = String(p.path || args.path || (p.result && p.result.path) || '');
    var dest = String(p.dest || (p.result && p.result.dest) || '');
    var turn = e.turn != null ? Number(e.turn) : 0;
    var step =
      turn > 0 ? t('ha2AtrStepN', '第 {n} 步').replace('{n}', String(turn)) + ' · ' : '';
    var line = '';
    if (kind === 'started' || kind === 'task_started') {
      line = t('ha2AtrEvStarted', '已启动');
    } else if (kind === 'tool_call') {
      if (/list_dir|list_files|workspace|glob|inspect_workspace|check/i.test(tool)) {
        line = t('ha2AtrUserCheckWs', '检查工作区');
      } else if (/inspect_diff|diff/i.test(tool)) {
        line = t('ha2AtrUserDiff', '查看改动');
      } else if (/read/i.test(tool)) {
        line = path
          ? t('ha2AtrUserRead', '已读取') + ' ' + path
          : t('ha2AtrUserRead', '已读取');
      } else if (/write|patch|apply|edit|replace|propose/i.test(tool)) {
        line = path
          ? t('ha2AtrUserPropose', '拟定修改') + ' ' + path
          : t('ha2AtrUserPropose', '拟定修改');
      } else if (/export|desktop|copy_to/i.test(tool)) {
        line = t('ha2AtrUserExportPrep', '准备放到桌面');
      } else if (/finish/i.test(tool)) {
        line = t('ha2AtrEvDone', '任务完成');
      } else {
        line = t('ha2AtrEvTool', '调用工具') + (tool ? ' · ' + tool : '');
      }
    } else if (kind === 'tool_result') {
      if (/read/i.test(tool)) {
        line = path
          ? t('ha2AtrUserRead', '已读取') + ' ' + path
          : t('ha2AtrUserRead', '已读取');
      } else if (/write|patch|apply|edit|replace/i.test(tool)) {
        line = path
          ? t('ha2AtrEvApplied', '已写入') + ' ' + path
          : t('ha2AtrEvApplied', '已写入');
      } else if (/export|desktop|copy_to/i.test(tool) || dest) {
        line = t('ha2AtrEvExported', '已放到桌面') + (dest ? ' · ' + dest : '');
      } else if (/inspect_diff|diff/i.test(tool)) {
        var cf = p.result && p.result.changedFiles;
        var nDiff = Array.isArray(cf) ? cf.length : 0;
        line =
          t('ha2AtrUserDiff', '查看改动') +
          (nDiff ? ' · ' + nDiff + ' 个文件' : '');
      } else if (/list_dir|list_files|workspace|glob|inspect_workspace|check/i.test(tool)) {
        line = t('ha2AtrUserCheckWs', '检查工作区');
      } else if (/finish/i.test(tool) || p.summary) {
        line = t('ha2AtrEvDone', '任务完成');
      } else {
        line = t('ha2AtrEvResult', '工具结果') + (tool ? ' · ' + tool : '');
      }
    } else if (kind === 'tool_error') {
      line =
        t('ha2AtrEvToolErr', '工具失败') +
        (p.error ? ' · ' + String(p.error).slice(0, 120) : '');
    } else if (kind === 'waiting_approval') {
      line = path
        ? t('ha2AtrUserWaitConfirm', '等待确认') + ' · ' + path
        : t('ha2AtrUserWaitConfirm', '等待确认');
    } else if (kind === 'waiting_user' || kind === 'waiting_user_input') {
      line = t('ha2AtrEvWaitInput', '等待你补充');
    } else if (kind === 'patch_applied') {
      line = path
        ? t('ha2AtrEvApplied', '已写入') + ' ' + path
        : t('ha2AtrEvApplied', '已写入');
    } else if (kind === 'exported_desktop') {
      line = t('ha2AtrEvExported', '已放到桌面') + (dest ? ' · ' + dest : '');
    } else if (kind === 'format_error') {
      line = t(
        'ha2AtrFormatNext',
        '模型未按工具格式行动。可换引擎/模型，或改写目标后重试；也可放弃当前任务。'
      );
    } else if (kind === 'done' || kind === 'task_done') {
      line = t('ha2AtrEvDone', '任务完成');
    } else if (kind === 'failed' || kind === 'task_failed') {
      line =
        t('ha2AtrEvFailed', '任务失败') +
        (p.error || p.message ? ' · ' + String(p.error || p.message).slice(0, 120) : '');
    } else {
      line = atrEventLabel(e);
      return line;
    }
    return step + line;
  }

  function atrEventTool(e) {
    return String((e && (e.toolName || e.tool)) || '');
  }

  function atrFileRowsFromResult(r) {
    var rows = [];
    if (!r || typeof r !== 'object') return rows;
    if (Array.isArray(r.changedFiles)) {
      var i;
      for (i = 0; i < r.changedFiles.length; i++) {
        var f = r.changedFiles[i] || {};
        var path = f.path || f.name;
        if (!path) continue;
        rows.push({
          path: String(path),
          bytes: f.bytes != null ? Number(f.bytes) : null,
          status: 'M'
        });
      }
      return rows;
    }
    if (r.baselineDirty != null) {
      var dirty = r.baselineDirty;
      var src = Array.isArray(dirty)
        ? dirty
        : dirty && Array.isArray(dirty.sample)
          ? dirty.sample
          : [];
      var total =
        dirty && dirty.count != null ? Number(dirty.count) : src.length;
      var j;
      for (j = 0; j < src.length; j++) {
        if (!src[j]) continue;
        rows.push({ path: String(src[j]), bytes: null, status: 'M' });
      }
      if (total > rows.length) {
        rows._omitted = total - rows.length;
      }
    }
    return rows;
  }

  function atrResultCount(r) {
    if (!r || typeof r !== 'object') return 0;
    if (Array.isArray(r.changedFiles)) return r.changedFiles.length;
    if (r.baselineDirty != null) {
      var dirty = r.baselineDirty;
      if (dirty && dirty.count != null) return Number(dirty.count) || 0;
      if (Array.isArray(dirty)) return dirty.length;
    }
    if (r.totalCandidates != null) return Number(r.totalCandidates) || 0;
    return 0;
  }

  function atrStepRole(kind, tool) {
    kind = String(kind || '');
    tool = String(tool || '');
    if (kind === 'goal') return 'goal';
    if (kind === 'thinking' || kind === 'pending') return 'thinking';
    if (kind === 'done' || kind === 'task_done' || /finish/i.test(tool)) return 'done';
    if (
      kind === 'failed' ||
      kind === 'task_failed' ||
      kind === 'format_error' ||
      kind === 'tool_error'
    ) {
      return 'error';
    }
    if (kind === 'tool_call' || kind === 'tool_result' || kind === 'patch_applied') {
      return 'tool';
    }
    return 'step';
  }

  /** One-line human detail — no path walls. */
  function atrEventBrief(e) {
    e = e || {};
    var kind = String(e.kind || '');
    var tool = atrEventTool(e);
    var p = e.payload || {};
    var args = p.arguments && typeof p.arguments === 'object' ? p.arguments : {};
    if (kind === 'tool_call') {
      if (args.path) return String(args.path);
      if (args.query) return String(args.query).slice(0, 160);
      if (args.check_id || args.checkId) return String(args.check_id || args.checkId);
      return '';
    }
    if (kind === 'tool_result' || kind === 'patch_applied' || kind === 'exported_desktop') {
        var r = p.result;
        if (r && typeof r === 'object') {
        var n = atrResultCount(r);
        if (Array.isArray(r.changedFiles) || r.baselineDirty != null) {
          return n
            ? t('ha2AtrFileCount', '共 {n} 个文件').replace('{n}', String(n))
            : t('ha2AtrNoFiles', '无匹配文件');
        }
        if (r.summary) return String(r.summary).slice(0, 480);
        if (r.rationale) return String(r.rationale).slice(0, 360);
        if (r.path) return String(r.path) + (r.dest ? ' → ' + String(r.dest) : '');
        if (r.content != null) return String(r.content).slice(0, 280);
        if (r.ok != null && (args.check_id || tool === 'run_check')) {
          return r.ok ? '检查通过' : String(r.output || '检查未通过').slice(0, 240);
        }
      }
      if (p.summary) return String(p.summary).slice(0, 480);
      if (p.path) return String(p.path);
      if (p.dest) return String(p.dest);
      if (p.error) return String(p.error).slice(0, 200);
      return '';
    }
    if (kind === 'done' || kind === 'task_done') {
      return String(p.summary || args.summary || '').slice(0, 900);
    }
    if (kind === 'waiting_user' || kind === 'waiting_user_input' || kind === 'waiting_approval') {
      return String(p.question || p.path || args.path || '').slice(0, 280);
    }
    if (kind === 'format_error' || kind === 'format_retry' || kind === 'failed' || kind === 'task_failed') {
      return String(p.error || p.message || p.reason || '').slice(0, 240);
    }
    if (p.question) return String(p.question).slice(0, 280);
    if (p.summary) return String(p.summary).slice(0, 480);
    if (p.message) return String(p.message).slice(0, 280);
    if (p.error) return String(p.error).slice(0, 200);
    return '';
  }

  function atrEventDetail(e) {
    return atrEventBrief(e);
  }

  /** Collapse call+result pairs and drop duplicate terminal rows. */
  function atrCompactEvents(events) {
    var list = (events || []).filter(Boolean).slice();
    var out = [];
    var i;
    for (i = 0; i < list.length; i++) {
      var e = list[i];
      var kind = String(e.kind || '');
      var tool = atrEventTool(e);
      var turn = e.turn != null ? Number(e.turn) : 0;
      var next = list[i + 1];
      if (kind === 'tool_call' && next) {
        var nk = String(next.kind || '');
        var nt = atrEventTool(next);
        var nturn = next.turn != null ? Number(next.turn) : 0;
        if (
          (nk === 'tool_result' || nk === 'tool_error') &&
          (!tool || !nt || tool === nt) &&
          (!turn || !nturn || turn === nturn)
        ) {
          list[i + 1] = Object.assign({}, next, { _callMs: atrEventMs(e) });
          continue;
        }
      }
      if ((kind === 'done' || kind === 'task_done') && out.length) {
        var prev = out[out.length - 1];
        var pk = String(prev.kind || '');
        var pt = atrEventTool(prev);
        if (pk === 'tool_result' && /finish/i.test(pt)) {
          var prevSum = String(
            (prev.payload &&
              (prev.payload.summary ||
                (prev.payload.result && prev.payload.result.summary))) ||
              ''
          );
          var curSum = String((e.payload && e.payload.summary) || '');
          if (!prevSum && curSum) out[out.length - 1] = e;
          continue;
        }
        if (pk === 'done' || pk === 'task_done') continue;
      }
      if (kind === 'started' || kind === 'task_started') {
        if (
          out.some(function (x) {
            return /^(started|task_started)$/.test(String(x.kind || ''));
          })
        ) {
          continue;
        }
      }
      out.push(e);
    }
    return out;
  }

  function atrLogStepRowsFrom(task, events, pendingGoal) {
    var rows = [];
    var goalText = (task && task.goal) || pendingGoal || '';
    var t0 =
      (events && events[0] && atrEventMs(events[0])) ||
      Number((task && (task.createdAt || task.created_at)) || 0) ||
      0;
    if (goalText) {
      rows.push({
        ms: t0,
        time: atrFormatClock(t0),
        durationMs: 0,
        duration: '',
        title: t('ha2AtrGoalRole', '目标'),
        detail: String(goalText),
        tool: '',
        files: [],
        kind: 'goal',
        role: 'goal'
      });
    }
    var evs = atrCompactEvents(events || []);
    var prevMs = t0;
    var i;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i] || {};
      var endMs = atrEventMs(e) || prevMs;
      var startMs = Number(e._callMs) || prevMs || endMs;
      var dur = Math.max(0, endMs - startMs);
      var tool = atrEventTool(e);
      var kind = String(e.kind || '');
      var r = e.payload && e.payload.result;
      var files = atrFileRowsFromResult(r);
      rows.push({
        ms: endMs,
        time: atrFormatClock(endMs),
        durationMs: dur,
        duration: atrFormatDuration(dur),
        title: atrUserStepLine(e),
        detail: atrEventBrief(e),
        tool: tool,
        files: files,
        omitted: files && files._omitted ? files._omitted : 0,
        kind: kind,
        role: atrStepRole(kind, tool)
      });
      prevMs = endMs || prevMs;
    }
    var st = String((task && task.status) || '');
    var busy =
      st === 'running' || st === 'verifying' || st === 'repair' || st === 'review';
    var live = (task && (task.liveThinking || task.live_thinking)) || '';
    var now = Date.now();
    if (busy && live) {
      var thinkDur =
        Number(task.providerDurationMs || task.provider_duration_ms || 0) ||
        Math.max(0, now - (prevMs || now));
      rows.push({
        ms: now,
        time: atrFormatClock(now),
        durationMs: thinkDur,
        duration: atrFormatDuration(thinkDur),
        title: t('ha2AtrThinking', '思考'),
        detail: String(live).slice(0, 1600),
        tool: '',
        files: [],
        kind: 'thinking',
        role: 'thinking',
        live: true
      });
    } else if (!evs.length && (pendingGoal || busy)) {
      rows.push({
        ms: now,
        time: atrFormatClock(now),
        durationMs: 0,
        duration: '',
        title: t('ha2AtrEvPending', '等待模型下一步…'),
        detail: t('ha2AtrPageStarting', '已打开步骤窗口，正在启动编辑任务…'),
        tool: '',
        files: [],
        kind: 'pending',
        role: 'thinking',
        live: true
      });
    }
    return rows;
  }

  function atrLogSummaryRow(rows) {
    rows = rows || [];
    if (!rows.length) return null;
    var i;
    for (i = rows.length - 1; i >= 0; i--) {
      if (rows[i] && rows[i].kind !== 'goal') return rows[i];
    }
    return rows[rows.length - 1];
  }

  function atrLogTotalDuration(rows) {
    rows = rows || [];
    var first = 0;
    var last = 0;
    var i;
    for (i = 0; i < rows.length; i++) {
      var ms = Number(rows[i] && rows[i].ms) || 0;
      if (!ms) continue;
      if (!first || ms < first) first = ms;
      if (ms > last) last = ms;
    }
    return first && last && last >= first ? last - first : 0;
  }

  function atrFileTableHtml(files, omitted) {
    files = files || [];
    if (!files.length) return '';
    var body = files
      .map(function (f) {
        f = f || {};
        return (
          '<tr><td class="ha2-atr-ft-status">' +
          esc(f.status || 'M') +
          '</td><td class="ha2-atr-ft-path">' +
          esc(f.path || '') +
          '</td><td class="ha2-atr-ft-meta">' +
          esc(f.bytes != null ? atrFormatBytes(f.bytes) : '') +
          '</td></tr>'
        );
      })
      .join('');
    return (
      '<div class="ha2-atr-ft-wrap"><table class="ha2-atr-ftable">' +
      '<thead><tr><th>' +
      esc(t('ha2AtrColStatus', '')) +
      '</th><th>' +
      esc(t('ha2AtrColFile', '文件')) +
      '</th><th>' +
      esc(t('ha2AtrColSize', '大小')) +
      '</th></tr></thead><tbody>' +
      body +
      '</tbody></table>' +
      (omitted
        ? '<div class="ha2-atr-ft-more">' +
          esc(
            t('ha2AtrMoreFiles', '另有 {n} 个未列出').replace(
              '{n}',
              String(omitted)
            )
          ) +
          '</div>'
        : '') +
      '</div>'
    );
  }

  function atrLogStepsHtml(rows, expanded, task) {
    rows = rows || [];
    if (!rows.length) return '';
    var list = expanded ? rows : (function () {
      var sum = atrLogSummaryRow(rows);
      return sum ? [sum] : [];
    })();
    var totalDur = atrFormatDuration(atrLogTotalDuration(rows));
    var stepN = rows.filter(function (r) {
      return r && r.kind !== 'goal';
    }).length;
    var meta =
      expanded && stepN
        ? '<div class="ha2-atr-tl-meta">' +
          esc(
            t('ha2AtrTlMeta', '{n} 步').replace('{n}', String(stepN)) +
              (totalDur ? ' · ' + totalDur : '')
          ) +
          '</div>'
        : '';
    return (
      '<div class="ha2-atr-tl' +
      (expanded ? ' is-expanded' : ' is-collapsed') +
      '">' +
      meta +
      list
        .map(function (row) {
          row = row || {};
          var role = row.role || atrStepRole(row.kind, row.tool);
          var files = Array.isArray(row.files) ? row.files : [];
          var dur = row.duration || '';
          if (role === 'thinking') {
            return (
              '<div class="ha2-atr-tl-item is-thinking' +
              (row.live ? ' is-live' : '') +
              '">' +
              '<div class="ha2-atr-tl-rail" aria-hidden="true"><span class="ha2-atr-tl-dot"></span></div>' +
              '<details class="ha2-atr-think"' +
              (row.live || !expanded ? ' open' : '') +
              '>' +
              '<summary><span class="ha2-atr-think-label">' +
              esc(t('ha2AtrThinking', '思考')) +
              '</span>' +
              (dur
                ? '<span class="ha2-atr-dur">' + esc(dur) + '</span>'
                : '') +
              (row.time
                ? '<time class="ha2-atr-clock">' + esc(row.time) + '</time>'
                : '') +
              '</summary>' +
              (row.detail
                ? '<div class="ha2-atr-think-body">' + esc(row.detail) + '</div>'
                : '') +
              '</details></div>'
            );
          }
          if (role === 'tool') {
            var table =
              expanded && files.length
                ? atrFileTableHtml(files, row.omitted)
                : '';
            return (
              '<div class="ha2-atr-tl-item is-tool">' +
              '<div class="ha2-atr-tl-rail" aria-hidden="true"><span class="ha2-atr-tl-dot"></span></div>' +
              '<div class="ha2-atr-tl-body">' +
              '<div class="ha2-atr-toolchip">' +
              '<span class="ha2-atr-toolchip-run">' +
              esc(t('ha2AtrRan', '已运行')) +
              '</span>' +
              '<code class="ha2-atr-toolchip-name">' +
              esc(row.tool || row.title || 'tool') +
              '</code>' +
              (dur
                ? '<span class="ha2-atr-dur">' + esc(dur) + '</span>'
                : '') +
              (row.time
                ? '<time class="ha2-atr-clock">' + esc(row.time) + '</time>'
                : '') +
              '</div>' +
              (row.title
                ? '<div class="ha2-atr-tool-title">' + esc(row.title) + '</div>'
                : '') +
              (row.detail && !files.length
                ? '<div class="ha2-atr-tool-detail">' + esc(row.detail) + '</div>'
                : '') +
              (files.length && !expanded
                ? '<div class="ha2-atr-tool-detail">' +
                  esc(
                    t('ha2AtrFileCount', '共 {n} 个文件').replace(
                      '{n}',
                      String(files.length + (row.omitted || 0))
                    )
                  ) +
                  '</div>'
                : '') +
              table +
              '</div></div>'
            );
          }
          return (
            '<div class="ha2-atr-tl-item is-' +
            esc(role) +
            (row.live ? ' is-live' : '') +
            '">' +
            '<div class="ha2-atr-tl-rail" aria-hidden="true"><span class="ha2-atr-tl-dot"></span></div>' +
            '<div class="ha2-atr-tl-body">' +
            '<div class="ha2-atr-tl-head">' +
            '<div class="ha2-atr-tl-title">' +
            esc(row.title || '') +
            '</div>' +
            (dur
              ? '<span class="ha2-atr-dur">' + esc(dur) + '</span>'
              : '') +
            (row.time
              ? '<time class="ha2-atr-clock">' + esc(row.time) + '</time>'
              : '') +
            '</div>' +
            (row.detail
              ? '<div class="ha2-atr-tl-detail">' + esc(row.detail) + '</div>'
              : '') +
            (expanded && files.length
              ? atrFileTableHtml(files, row.omitted)
              : '') +
            '</div></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function atrRuntimeOn() {
    var A = global.OneToneHomeAgentTask;
    return !!(A && A.featureEnabled && A.featureEnabled());
  }

  /** Live ATR task — surface even if UI is on 对话 (do not hide mid-run). */
  function atrTaskShouldSurface(snap) {
    if (!atrRuntimeOn()) return false;
    var task = snap && snap.agentTask;
    if (!task || !task.status) return false;
    var st = String(task.status || '');
    return (
      st === 'running' ||
      st === 'verifying' ||
      st === 'repair' ||
      st === 'review' ||
      st === 'waiting' ||
      st === 'interrupted' ||
      st === 'failed' ||
      st === 'done'
    );
  }

  /** Page chrome for live ATR or forced-open-after-send. */
  function atrIsChatLoopTask(task) {
    if (!task) return false;
    var id = String(task.taskId || task.task_id || '');
    if (chatLoopTaskId && id && id === String(chatLoopTaskId)) return true;
    var pm = String(task.permissionMode || task.permission_mode || '').toLowerCase();
    return pm === 'read_only' || pm === 'readonly';
  }

  function atrWbPageMode(snap) {
    if (atrIsChatLoopTask(snap && snap.agentTask)) return false;
    if (atrWbPageForced) return true;
    if (!atrTaskShouldSurface(snap)) return false;
    // Dialogue mode: don't keep ATR chrome for finished tasks — it buries the chat reply.
    var st = String((snap.agentTask && snap.agentTask.status) || '');
    if (
      String((snap && snap.workMode) || '') !== 'edit' &&
      (st === 'done' || st === 'failed')
    ) {
      return false;
    }
    return true;
  }

  /** Open ATR steps/dialogue page immediately (send path). */
  function openAtrEditPage(goal) {
    atrWbPageForced = true;
    atrWbPageUserClosed = false;
    atrWbPagePendingGoal = String(goal || '').trim();
    atrChatSinceMs = Date.now();
    openWbChatPage();
  }

  function atrTaskWaitingReason(task) {
    task = task || {};
    return String(task.waitingReason || task.waiting_reason || '');
  }

  function atrPendingApprovalToken(snap) {
    var task = snap && snap.agentTask;
    var tok =
      (task && (task.pendingApprovalToken || task.pending_approval_token)) || '';
    if (tok) return String(tok);
    var evs = (snap && snap.agentTaskEvents) || [];
    for (var i = evs.length - 1; i >= 0; i--) {
      var e = evs[i];
      if (!e || e.kind !== 'waiting_approval' || !e.payload) continue;
      var p = e.payload.approvalToken || e.payload.approval_token;
      if (p) return String(p);
    }
    return '';
  }

  function atrPendingApprovalPath(snap) {
    var task = snap && snap.agentTask;
    var files = (task && task.changedFiles) || [];
    if (files && files.length) return String(files[0] || '');
    var evs = (snap && snap.agentTaskEvents) || [];
    for (var i = evs.length - 1; i >= 0; i--) {
      var e = evs[i];
      if (!e || e.kind !== 'waiting_approval' || !e.payload) continue;
      if (e.payload.path) return String(e.payload.path);
    }
    return '';
  }

  function atrNeedsApproval(snap) {
    var task = snap && snap.agentTask;
    if (!task || String(task.status || '') !== 'waiting') return false;
    if (atrTaskWaitingReason(task) === 'approval') return true;
    return !!atrPendingApprovalToken(snap);
  }

  function atrSendConflictOf(snap) {
    return (snap && snap.atrSendConflict) || null;
  }

  /** Status-aware "continue old task" label for send-conflict triage. */
  function atrConflictContinueLabel(st) {
    st = String(st || '');
    if (st === 'waiting') return t('ha2AtrHandlePending', '处理待确认事项');
    if (st === 'interrupted') return t('ha2AtrResume', '恢复当前任务');
    return t('ha2AtrViewProgress', '查看进度');
  }

  function atrConflictContinueAttr(st) {
    st = String(st || '');
    if (st === 'waiting') return 'data-ha2-atr-continue';
    if (st === 'interrupted') return 'data-ha2-atr-resume';
    return 'data-ha2-atr-open-page';
  }

  /** Explicit send conflict strip on the task card (no second modal). */
  function atrSendConflictHtml(snap) {
    var c = atrSendConflictOf(snap);
    if (!c || !c.goal) return '';
    var st = String(c.status || (snap.agentTask && snap.agentTask.status) || '');
    return (
      '<div class="ha2-atr-send-conflict" data-ha2-atr-send-conflict role="region" aria-label="' +
      esc(t('ha2AtrSendConflictTitle', '当前输入与进行中的任务冲突')) +
      '"><b>' +
      esc(t('ha2AtrSendConflictTitle', '当前输入与进行中的任务冲突')) +
      '</b><small>' +
      esc(
        t(
          'ha2AtrSendConflictHint',
          '不会自动放弃旧任务。请选择：继续旧任务、放弃旧任务并发送草稿，或保留草稿稍后处理。'
        )
      ) +
      '</small><div class="ha2-atr-send-conflict-acts">' +
      '<button type="button" class="ha2-btn" ' +
      atrConflictContinueAttr(st) +
      '>' +
      esc(atrConflictContinueLabel(st)) +
      '</button>' +
      '<button type="button" class="ha2-btn primary" data-ha2-atr-abandon-send>' +
      esc(t('ha2AtrAbandonSend', '放弃并发送')) +
      '</button>' +
      '<button type="button" class="ha2-btn" data-ha2-atr-keep-draft>' +
      esc(t('ha2AtrKeepDraft', '保留草稿稍后处理')) +
      '</button></div></div>'
    );
  }

  function atrActsHtml(snap) {
    var task = snap && snap.agentTask;
    if (!task) return '';
    var st = String(task.status || '');
    var acts = [];
    if (atrSendConflictOf(snap)) {
      // Conflict strip owns the primary triage; keep patch approve when waiting.
      if (st === 'waiting' && atrNeedsApproval(snap) && atrPendingApprovalToken(snap)) {
        acts.push(
          '<button type="button" class="ha2-btn primary" data-ha2-atr-approve>' +
            esc(t('ha2AtrApprovePatch', '批准补丁写入')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-reject>' +
            esc(t('ha2AtrRejectPlan', '拒绝方案')) +
            '</button>'
        );
      }
      return acts.join('');
    }
    if (st === 'waiting') {
      if (atrNeedsApproval(snap) && atrPendingApprovalToken(snap)) {
        acts.push(
          '<button type="button" class="ha2-btn primary" data-ha2-atr-approve>' +
            esc(t('ha2AtrApprovePatch', '批准补丁写入')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-approve-all>' +
            esc(t('ha2AtrApproveAll', '同意所有任务')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-reject>' +
            esc(t('ha2AtrRejectPlan', '拒绝方案')) +
            '</button>'
        );
      } else {
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
            esc(t('ha2AtrAbandon', '放弃')) +
            '</button>'
        );
      }
    } else if (st === 'interrupted') {
      acts.push(
        '<button type="button" class="ha2-btn primary" data-ha2-atr-resume>' +
          esc(t('ha2AtrResume', '恢复当前任务')) +
          '</button>'
      );
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
          esc(t('ha2AtrAbandon', '放弃')) +
          '</button>'
      );
    } else if (st === 'failed') {
      acts.push(
        '<button type="button" class="ha2-btn primary" data-ha2-atr-resume>' +
          esc(t('ha2AtrResume', '恢复当前任务')) +
          '</button>'
      );
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
          esc(t('ha2AtrAbandon', '放弃')) +
          '</button>'
      );
    } else if (
      st === 'running' ||
      st === 'verifying' ||
      st === 'repair' ||
      st === 'review'
    ) {
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
          esc(t('ha2AtrAbandon', '放弃')) +
          '</button>'
      );
    }
    return acts.join('');
  }

  function atrWrittenFiles(snap) {
    var task = snap && snap.agentTask;
    var files = (task && task.changedFiles) || [];
    if (files && files.length) return files.slice();
    var evs = (snap && snap.agentTaskEvents) || [];
    var out = [];
    var i;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (
        !e ||
        (e.kind !== 'patch_applied' &&
          e.kind !== 'done' &&
          e.kind !== 'exported_desktop')
      )
        continue;
      var r = e.payload && e.payload.result;
      var p =
        (e.payload && (e.payload.path || (r && r.path))) ||
        (r && r.dest) ||
        '';
      if (p && out.indexOf(p) < 0) out.push(p);
      if (r && r.dest && out.indexOf(r.dest) < 0) out.push(r.dest);
    }
    return out;
  }

  /**
   * Separate stages so "model replied" never reads as "code edit done".
   * @returns {{ modelReplied:boolean, patchPending:boolean, fileWritten:boolean, checkRan:boolean, checkOk:boolean|null, checkId:string, reason:string }}
   */
  function atrEditStages(snap) {
    var task = snap && snap.agentTask;
    var evs = (snap && snap.agentTaskEvents) || [];
    var st = String((task && task.status) || '');
    var modelReplied = false;
    var patchPending = atrNeedsApproval(snap);
    var fileWritten = atrWrittenFiles(snap).length > 0;
    var checkRan = false;
    var checkOk = null;
    var checkId = '';
    var i;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i] || {};
      var kind = String(e.kind || '');
      var tool = String(e.toolName || e.tool || '');
      if (kind === 'tool_call' || kind === 'tool_result' || kind === 'waiting_approval') {
        modelReplied = true;
      }
      if (kind === 'patch_applied') fileWritten = true;
      if (kind === 'waiting_approval') patchPending = true;
      if (tool === 'run_check' && (kind === 'tool_result' || kind === 'tool_call')) {
        checkRan = true;
        var res = e.payload && (e.payload.result || e.payload);
        if (res && typeof res.ok === 'boolean') checkOk = res.ok;
        if (res && res.checkId) checkId = String(res.checkId);
        if (e.payload && e.payload.arguments && e.payload.arguments.check_id) {
          checkId = String(e.payload.arguments.check_id);
        }
      }
    }
    if (st === 'done' || st === 'failed' || st === 'verifying' || st === 'repair') {
      modelReplied = true;
    }
    if (st === 'waiting' && atrNeedsApproval(snap)) patchPending = true;
    var reason = '';
    if (!checkRan && (st === 'done' || st === 'failed')) {
      reason = t('ha2AtrNoCheckReason', '模型未调用已登记 check_id，或任务在检查前结束');
    }
    return {
      modelReplied: modelReplied,
      patchPending: patchPending,
      fileWritten: fileWritten,
      checkRan: checkRan,
      checkOk: checkOk,
      checkId: checkId,
      reason: reason
    };
  }

  function atrStagesHtml(snap) {
    if (!snap || !snap.agentTask) return '';
    var s = atrEditStages(snap);
    function pill(on, label, warn) {
      return (
        '<span class="ha2-atr-stage' +
        (on ? ' is-on' : '') +
        (warn ? ' is-warn' : '') +
        '">' +
        esc(label) +
        '</span>'
      );
    }
    var checkLabel = !s.checkRan
      ? t('ha2AtrCheckNotRun', '未运行检查')
      : s.checkOk
        ? t('ha2AtrCheckPassed', '检查已通过') + (s.checkId ? ' · ' + s.checkId : '')
        : t('ha2AtrCheckFailed', '检查未通过') + (s.checkId ? ' · ' + s.checkId : '');
    return (
      '<div class="ha2-atr-stages" data-ha2-atr-stages>' +
      pill(s.modelReplied, t('ha2AtrStageModel', '模型已回答')) +
      pill(s.patchPending, t('ha2AtrStagePatch', '补丁待批准')) +
      pill(s.fileWritten, t('ha2AtrStageWrote', '文件已写入')) +
      pill(s.checkRan && s.checkOk, checkLabel, s.checkRan && s.checkOk === false) +
      (!s.checkRan && (String(snap.agentTask.status) === 'done' || s.fileWritten)
        ? '<small class="ha2-atr-stage-note">' +
          esc(s.reason || t('ha2AtrNoCheckReason', '未运行检查')) +
          '</small>'
        : '') +
      '</div>'
    );
  }

  var BEGINNER_KEY = 'onetone.atr.beginnerMode';
  function atrBeginnerOn() {
    try {
      var v = global.localStorage && global.localStorage.getItem(BEGINNER_KEY);
      if (v === '0' || v === 'false') return false;
      return true;
    } catch (_) {
      return true;
    }
  }
  function setAtrBeginner(on) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(BEGINNER_KEY, on ? '1' : '0');
      }
    } catch (_) {}
  }

  /** Main-column gate — Approve must be visible without hunting the left rail. */
  function atrMainGateHtml(snap) {
    // Confirm for a new goal must win over a prior done/failed card on the work page.
    if (workConfirmOpen && atrEditPathOn(snap)) return workConfirmGateHtml(snap);
    var task = snap && snap.agentTask;
    if (!task) return '';
    var st = String(task.status || '');
    var path = atrPendingApprovalPath(snap);
    var token = atrPendingApprovalToken(snap);
    var files = atrWrittenFiles(snap);
    var fileLine = files.length ? files.join(', ') : path;
    var title = '';
    var detail = '';
    if (st === 'done') {
      var stagesDone = atrEditStages(snap);
      // Quiet strip: no write → one line; wrote → file names only. No stage-pill wall.
      if (!stagesDone.fileWritten) {
        return (
          '<div class="ha2-wb-page-gate is-quiet" data-ha2-atr-gate data-atr-status="done">' +
          '<div class="ha2-wb-page-gate-copy"><span>' +
          esc(t('ha2AtrDoneQuietNoWrite', '编辑回合结束 · 未写入文件')) +
          '</span></div></div>'
        );
      }
      return (
        '<div class="ha2-wb-page-gate is-quiet" data-ha2-atr-gate data-atr-status="done">' +
        '<div class="ha2-wb-page-gate-copy"><b>' +
        esc(t('ha2AtrDoneQuietWrote', '已写入')) +
        '</b><span>' +
        esc(fileLine || t('ha2AtrDoneOk', '工作区已有改动')) +
        '</span></div></div>'
      );
    } else if (st === 'failed') {
      title = t('ha2AtrFailedTitle', '编辑任务失败');
      detail =
        atrFailureNextHint(snap) +
        (fileLine
          ? '\n' + t('ha2AtrWroteButFail', '已写入') + ' ' + fileLine
          : '');
    } else if (st === 'interrupted') {
      title = t('ha2AtrInterruptedTitle', '编辑任务已中断');
      detail = t('ha2AtrNextResume', '下一步：恢复当前任务，或放弃后按新目标重发。');
    } else if (st === 'waiting' && atrNeedsApproval(snap)) {
      title = t('ha2AtrNeedsYou', '编辑任务等待确认');
      detail =
        t(
          'ha2AtrGateApprove',
          '批准补丁写入：本任务剩余写入不再询问。同意所有：以后新任务也不再询问。'
        ) +
        (fileLine ? '\n' + fileLine : '');
    } else if (st === 'waiting') {
      title = t('ha2AtrEvWaitInput', '等待你补充');
      detail = t('ha2AtrNextInput', '下一步：在下方补充说明，继续当前编辑任务。');
    } else {
      return '';
    }
    var acts = atrActsHtml(snap);
    return (
      '<div class="ha2-wb-page-gate" data-ha2-atr-gate data-atr-status="' +
      esc(st) +
      '"' +
      (token ? ' data-has-token="1"' : '') +
      '><div class="ha2-wb-page-gate-copy"><b>' +
      esc(title) +
      '</b><span>' +
      esc(detail) +
      '</span></div>' +
      atrStagesHtml(snap) +
      (acts ? '<div class="ha2-wb-page-gate-acts">' + acts + '</div>' : '') +
      '</div>'
    );
  }

  /** ATR progress / gate card — separate from Codex Soft Pad completion observation. */
  function atrTaskPanelHtml(snap) {
    var A = global.OneToneHomeAgentTask;
    if (!A || !A.featureEnabled || !A.featureEnabled()) return '';
    // Keep visible after flipping to 对话 — otherwise mid-run tasks vanish and sends divert to chat.
    var task = snap && snap.agentTask;
    if (!task || !task.status) return '';
    var st = String(task.status || '');
    var busy = st === 'running' || st === 'verifying' || st === 'repair' || st === 'review';
    if (!(busy || st === 'waiting' || st === 'interrupted' || st === 'failed' || st === 'done'))
      return '';

    var reason = String(task.waitingReason || '');
    var files = Array.isArray(task.changedFiles) ? task.changedFiles : [];
    var evs = (snap.agentTaskEvents || []).slice(-12);
    var pendingPath = '';
    for (var ei = evs.length - 1; ei >= 0; ei--) {
      if (evs[ei] && evs[ei].kind === 'waiting_approval' && evs[ei].payload) {
        pendingPath = String(evs[ei].payload.path || '');
        break;
      }
    }
    var turn = task.currentTurn != null ? task.currentTurn : 0;
    var tools = task.toolCallCount != null ? task.toolCallCount : 0;
    var provider =
      (A.readProvider && A.readProvider()) ||
      (atrProvidersCache && atrProvidersCache.recommendedProvider) ||
      '';
    var modelRouting = snap && snap.modelRouting;
    var routeProvider =
      modelRouting && modelRouting.routes && modelRouting.routes.toolDecision
        ? modelRouting.routes.toolDecision
        : '';
    var routeLabel = provider || routeProvider;
    var title =
      st === 'waiting'
        ? t('ha2AtrNeedsYou', '编辑任务等待确认')
        : st === 'interrupted'
          ? t('ha2AtrInterruptedTitle', '编辑任务已中断')
          : st === 'failed'
            ? t('ha2AtrFailedTitle', '编辑任务失败')
            : st === 'done'
              ? files.length
                ? t('ha2AtrDoneQuietWrote', '已写入')
                : t('ha2AtrDoneQuietNoWrite', '编辑回合结束 · 未写入文件')
              : t('ha2AtrDrivingTitle', '编辑任务执行中');
    var progressBits = [];
    if (routeLabel) progressBits.push('模型 ' + String(routeLabel));
    if (task.providerId || task.modelProvider) {
      progressBits.push('实际 ' + String(task.providerId || task.modelProvider));
    }
    if (task.modelId) progressBits.push(String(task.modelId));
    var fb =
      task.fallbackFrom || task.modelFallbackFrom || task.fallback_from || '';
    if (fb) progressBits.push('已从 ' + String(fb) + ' 回退');
    var dur =
      task.providerDurationMs != null
        ? task.providerDurationMs
        : task.modelDurationMs != null
          ? task.modelDurationMs
          : null;
    if (dur != null) progressBits.push(String(dur) + 'ms');
    var wc = snap.workController;
    if (wc && Array.isArray(wc.providerCalls) && wc.providerCalls.length) {
      var lastCall = wc.providerCalls[wc.providerCalls.length - 1];
      if (lastCall && lastCall.providerId) {
        progressBits.push('档案 ' + String(lastCall.providerId));
        if (lastCall.model) progressBits.push(String(lastCall.model));
      }
    }
    progressBits.push(
      t('ha2AtrStepN', '第 {n} 步').replace('{n}', String(turn || 0))
    );
    if (tools) {
      progressBits.push(
        t('ha2AtrToolN', '{n} 次工具').replace('{n}', String(tools))
      );
    }
    progressBits.push(st);
    var fileLine = '';
    if (st === 'waiting') {
      fileLine = files.length
        ? files.join(', ')
        : pendingPath
          ? pendingPath + ' · ' + t('ha2AtrPendingFile', '待批准（尚未写入）')
          : t('ha2AtrPendingFile', '待批准补丁（尚未写入）');
    } else if (files.length) {
      fileLine = files.join(', ');
    } else if (task.lastError) {
      fileLine = String(task.lastError).slice(0, 160);
    } else if (st === 'done') {
      fileLine = t('ha2AtrDoneQuietNoWrite', '编辑回合结束 · 未写入文件');
    }

    var liveThink =
      task.liveThinking || task.live_thinking || '';
    var lastEv = evs.length ? evs[evs.length - 1] : null;
    var lastLine = liveThink
      ? t('ha2AtrThinking', '思考中') + ' · ' + String(liveThink).replace(/\s+/g, ' ').slice(0, 120)
      : lastEv
      ? atrUserStepLine(lastEv)
      : busy
        ? t('ha2AtrEvPending', '等待模型下一步…')
        : '';
    if (st === 'failed') {
      lastLine = atrFailureNextHint(snap);
    }

    var conflict = atrSendConflictOf(snap);
    var acts = [];
    acts.push(
      '<button type="button" class="ha2-btn primary" data-ha2-atr-open-page>' +
        esc(t('ha2AtrOpenPage', '查看步骤对话')) +
        '</button>'
    );
    if (conflict) {
      // Triage lives in atrSendConflictHtml; keep patch approve when waiting.
      if (st === 'waiting' && reason === 'approval' && task.pendingApprovalToken) {
        acts.push(
          '<button type="button" class="ha2-btn primary" data-ha2-atr-approve>' +
            esc(t('ha2AtrApprovePatch', '批准补丁写入')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-reject>' +
            esc(t('ha2AtrRejectPlan', '拒绝方案')) +
            '</button>'
        );
      }
    } else if (st === 'waiting') {
      if (reason === 'approval' && task.pendingApprovalToken) {
        acts.push(
          '<button type="button" class="ha2-btn primary" data-ha2-atr-approve>' +
            esc(t('ha2AtrApprovePatch', '批准补丁写入')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-approve-all>' +
            esc(t('ha2AtrApproveAll', '同意所有任务')) +
            '</button>'
        );
        acts.push(
          '<button type="button" class="ha2-btn" data-ha2-atr-reject>' +
            esc(t('ha2AtrRejectPlan', '拒绝方案')) +
            '</button>'
        );
      } else if (reason === 'user_input') {
        acts.push(
          '<button type="button" class="ha2-btn primary" data-ha2-atr-input>' +
            esc(t('ha2AtrContinue', '继续输入')) +
            '</button>'
        );
      }
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
          esc(t('ha2AtrAbandon', '放弃')) +
          '</button>'
      );
    } else if (st === 'interrupted') {
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-resume>' +
          esc(t('ha2AtrResume', '恢复当前任务')) +
          '</button>'
      );
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
          esc(t('ha2AtrAbandon', '放弃')) +
          '</button>'
      );
    } else if (st === 'failed') {
      acts.push(
        '<button type="button" class="ha2-btn primary" data-ha2-atr-resume>' +
          esc(t('ha2AtrResume', '恢复当前任务')) +
          '</button>'
      );
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-retry-action>' +
          esc(t('ha2AtrRetryAction', '重试失败动作')) +
          '</button>'
      );
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-replan>' +
          esc(t('ha2AtrReplan', '重新规划')) +
          '</button>'
      );
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
          esc(t('ha2AtrAbandon', '放弃')) +
          '</button>'
      );
    } else {
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
          esc(t('ha2AtrAbandon', '放弃')) +
          '</button>'
      );
    }

    return (
      '<div class="ha2-approve ha2-atr-approve ha2-atr-panel" data-ha2-approve data-ha2-atr-card data-atr-status="' +
      esc(st) +
      '" role="status">' +
      '<div class="ha2-approve-copy"><b>' +
      esc(title) +
      '</b><span>' +
      esc(task.goal || '') +
      '</span><span class="ha2-atr-progress">' +
      esc(progressBits.join(' · ')) +
      '</span>' +
      (fileLine && st !== 'done'
        ? '<span class="ha2-atr-files">' + esc(fileLine) + '</span>'
        : files.length
          ? '<span class="ha2-atr-files">' + esc(files.join(', ')) + '</span>'
          : '') +
      '</div>' +
      (st === 'done' ? '' : atrStagesHtml(snap)) +
      (st === 'done'
        ? ''
        : !atrBeginnerOn() && lastLine
          ? '<p class="ha2-atr-last ha2-atr-timeline" data-ha2-atr-timeline>' +
            esc(lastLine) +
            '</p>'
          : atrBeginnerOn() && lastLine
            ? '<details class="ha2-atr-details"><summary>' +
              esc(t('ha2AtrShowSteps', '查看步骤')) +
              '</summary><p class="ha2-atr-last">' +
              esc(lastLine) +
              '</p></details>'
            : '') +
      atrSendConflictHtml(snap) +
      '<div class="ha2-approve-acts">' +
      (atrBeginnerOn()
        ? (acts[0] || '') +
          (acts.length > 1
            ? '<button type="button" class="ha2-link" data-ha2-atr-advanced>' +
              esc(t('ha2AtrShowAdvanced', '更多操作')) +
              '</button>'
            : '')
        : acts.join('')) +
      '</div>' +
      (st === 'done'
        ? ''
        : '<div class="ha2-atr-mode-row">' +
          '<button type="button" class="ha2-link" data-ha2-atr-toggle-beginner>' +
          esc(
            atrBeginnerOn()
              ? t('ha2AtrSwitchAdvanced', '高级模式')
              : t('ha2AtrSwitchBeginner', '新手模式')
          ) +
          '</button></div>') +
      '</div>'
    );
  }

  function atrWaitingHtml(snap) {
    return atrTaskPanelHtml(snap);
  }

  function approveHtml(snap) {
    var atr = atrTaskPanelHtml(snap);
    if (atr) return atr;
    var agent = approvalTarget(snap);
    if (!agent) return '';
    // External Agent Center: no approve/reject wire — open target only.
    var acts = [
      '<button type="button" class="ha2-btn primary" data-ha2-go-agent="' +
        esc(agent.kind || '') +
        '" data-agent="' +
        esc(agent.agentId || '') +
        '">' +
        esc(t('ha2GoHandle', '前往处理')) +
        '</button>'
    ];
    return (
      '<div class="ha2-approve" data-ha2-approve role="status">' +
      '<div class="ha2-approve-copy"><b>' +
      esc(t('ha2NeedsYou', '需要你处理')) +
      '</b><span>' +
      esc(
        agent.line ||
          agent.title ||
          ((agent.cat && agent.cat.name) || agent.kind) +
            ' · ' +
            t('ha2NeedsYouHint', '打开详情查看请求')
      ) +
      '</span></div><div class="ha2-approve-acts">' +
      acts.join('') +
      '</div></div>'
    );
  }

  /** At most one primary banner: permission/runtime > needsYou > warning alert. */
  function primaryBannerHtml(snap) {
    var perm = permissionHtml(snap);
    if (perm) return { html: perm, kind: 'permission' };
    var approve = approveHtml(snap);
    if (approve) return { html: approve, kind: 'needsYou' };
    var WB = global.OneToneHomeWorkbench;
    var alert =
      WB && typeof WB.getPrimaryAlertModel === 'function' ? WB.getPrimaryAlertModel() : null;
    // HA2 thin desk:「开始设置」belongs in Settings — don't block home entry.
    if (alert && alert.kind === 'needs_setup') {
      return { html: '', kind: null };
    }
    if (alert && alert.text) {
      return {
        kind: 'alert',
        html:
          '<div class="ha2-runtime-alert ' +
          esc(alert.severity || 'is-warn') +
          '" data-ha2-runtime-alert role="status">' +
          '<div class="ha2-grow"><b>' +
          esc(t('ha2RuntimeAlert', '需要注意')) +
          '</b><span>' +
          esc(alert.text) +
          '</span></div>' +
          (alert.action
            ? '<button type="button" class="ha2-btn" data-ha2-alert-action="' +
              esc(JSON.stringify(alert.action)) +
              '">' +
              esc(alert.actionLabel || t('ha2Handle', '处理')) +
              '</button>'
            : '') +
          '</div>'
      };
    }
    return { html: '', kind: null };
  }

  function sessionModeLabel(mode) {
    if (mode === 'edit') return t('ha2ModeWork', '投递');
    if (mode === 'research') return t('ha2ModeResearch', '调研');
    return t('ha2ModeChat', '提问');
  }

  function modeBoundaryCopy(mode) {
    if (mode === 'edit') {
      return t(
        'ha2ModeBoundaryWork',
        '投递模式会把任务转发到各桌面 Agent；开始前先确认，写入前再批准。'
      );
    }
    if (mode === 'research') {
      return t(
        'ha2ModeBoundaryResearch',
        '调研模式会搜索公开网页并综合成带来源的报告；无来源时只做材料整理。'
      );
    }
    return t(
      'ha2ModeBoundaryChat',
      '提问模式只向大模型提问与出方案，不会读写项目文件。'
    );
  }

  var researchPaintRaf = 0;
  /** Open dossier file: '' | 'markdown' | 'html' | 'sources' */
  var researchFilePreview = 'markdown';

  /** Research progress: coalesce paints to one rAF — avoid fetch-loop jank. */
  function paintResearchLive() {
    if (researchPaintRaf) return;
    researchPaintRaf = requestAnimationFrame
      ? requestAnimationFrame(function () {
          researchPaintRaf = 0;
          paintResearchLiveNow();
        })
      : (setTimeout(function () {
          researchPaintRaf = 0;
          paintResearchLiveNow();
        }, 32),
        1);
  }

  function paintResearchLiveNow() {
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    if (!snap || snap.workMode !== 'research') {
      if (S) paint(S.getSnapshot());
      return;
    }
    var rs = snap.research || {};
    var terminal = !!(rs.isTerminal || rs.status === 'failed');
    if (terminal) {
      if (wbChatPageOpen) paintWbChatPage();
      else if (S) paint(S.getSnapshot());
      return;
    }
    if (wbChatPageOpen) {
      var host = root && root.querySelector('[data-ha2-wb-page-host]');
      if (host) {
        var researchHost = host.querySelector('[data-ha2-research-host]');
        var aePage = document.activeElement;
        // Only preserve focus for editable fields — clarify buttons must not block paint
        // (stuck chips + second click used to turn topic into "opt3").
        var keepResearchFocus =
          aePage &&
          researchHost &&
          researchHost.contains(aePage) &&
          /^(INPUT|TEXTAREA|SELECT)$/i.test(aePage.tagName || '');
        if (researchHost && !keepResearchFocus) {
          researchHost.innerHTML = researchPanelHtml(snap);
        }
        var live = host.querySelector('[data-ha2-research-live]');
        var bodyHtml = researchPageBodyHtml(snap);
        if (live && bodyHtml.indexOf('data-ha2-research-live') >= 0) {
          var wrapLive = document.createElement('div');
          wrapLive.innerHTML = bodyHtml;
          if (wrapLive.firstChild) live.replaceWith(wrapLive.firstChild);
        } else {
          var transcript = host.querySelector('[data-ha2-wb-page-transcript]');
          if (transcript) transcript.innerHTML = bodyHtml;
        }
      }
      return;
    }
    var sit = root && root.querySelector('[data-ha2-situation]');
    if (sit) {
      var panel = sit.querySelector('[data-ha2-research]');
      var aeHome = document.activeElement;
      var keepHomeFocus =
        aeHome &&
        panel &&
        panel.contains(aeHome) &&
        /^(INPUT|TEXTAREA|SELECT)$/i.test(aeHome.tagName || '');
      if (panel && !keepHomeFocus) {
        var wrap = document.createElement('div');
        wrap.innerHTML = researchPanelHtml(snap);
        if (wrap.firstChild) panel.replaceWith(wrap.firstChild);
      } else if (!panel) {
        paint(snap);
      }
    } else if (S) {
      paint(snap);
    }
  }

  function clearResearchComposeInputs() {
    var pageTa = root && root.querySelector('[data-ha2-wb-page-draft]');
    if (pageTa) pageTa.value = '';
    wbPageDraftText = '';
    var dockTa = root && root.querySelector('.ha2-compose [data-ha2-draft]');
    if (dockTa) dockTa.value = '';
    var S = store();
    if (S && S.setDraft) S.setDraft('', { silent: true });
  }

  /**
   * Flush live compose into durable slots before Focus/innerHTML remounts.
   * Page draft is not in ha2 store — without this, Shift+Enter / poll remount wipes it.
   */
  function stashLiveComposeDrafts() {
    if (!root) return;
    var dockTa = root.querySelector('.ha2-compose [data-ha2-draft]');
    if (dockTa) {
      var S = store();
      if (S && S.setDraft) S.setDraft(dockTa.value, { lock: true, silent: true });
      try {
        var D = dock();
        if (D && D.syncDraftToPrep) D.syncDraftToPrep(dockTa.value);
      } catch (_) {}
    }
    var pageTa = root.querySelector('[data-ha2-wb-page-draft]');
    if (pageTa) wbPageDraftText = String(pageTa.value || '');
  }

  function resolveResearchTopic(snap) {
    var pageTa = root && root.querySelector('[data-ha2-wb-page-draft]');
    var pageVal = pageTa ? String(pageTa.value || '').trim() : '';
    if (pageVal) return pageVal;
    var dockTa = root && root.querySelector('.ha2-compose [data-ha2-draft]');
    var dockVal = dockTa ? String(dockTa.value || '').trim() : '';
    if (dockVal) return dockVal;
    var draft = String((snap && snap.draft) || '').trim();
    if (draft) return draft;
    for (var i = wbChatTurns.length - 1; i >= 0; i--) {
      if (wbChatTurns[i] && wbChatTurns[i].role === 'user') {
        var t0 = String(wbChatTurns[i].text || '').trim();
        if (t0) return t0;
      }
    }
    var R = global.OneToneHomeResearch;
    var prev =
      (R && R.getSnapshot && R.getSnapshot().config && R.getSnapshot().config.topic) ||
      '';
    return String(prev || '').trim();
  }

  function researchPanelHtml(snap) {
    if (!snap || snap.workMode !== 'research') return '';
    var R = global.OneToneHomeResearch;
    var rs =
      (snap && snap.research) ||
      (R && R.getSnapshot ? R.getSnapshot() : null) ||
      {};
    var status = String(rs.status || 'idle');
    var cfg = rs.config || {};
    var prog = rs.progress || {};
    var err = rs.error;
    var result = rs.result;
    var label =
      (R && R.statusLabel && R.statusLabel(status)) || status;
    var modelHint = wbSelectedModelId() || '';
    var head =
      '<div class="ha2-research" data-ha2-research data-status="' +
      esc(status) +
      '"><div class="ha2-research-status"><b>' +
      esc(label) +
      '</b>' +
      (modelHint
        ? ' · <span class="ha2-research-model" title="' +
          esc(t('ha2ResearchUsesModel', '沿用当前 WorkBuddy 模型')) +
          '">' +
          esc(modelHint) +
          '</span>'
        : '') +
      (prog.sourcesFound
        ? ' · ' +
          esc(
            t('ha2ResearchSources', '来源') +
              ' ' +
              String(prog.sourcesFetched || 0) +
              '/' +
              String(prog.sourcesFound)
          )
        : '') +
      '</div>';
    // awaiting_approval shows plan.pathReason; still surface "正在用模型规划…" while planning.
    if (
      status !== 'configuring' &&
      status !== 'idle' &&
      !(status === 'awaiting_approval' && !(rs.plan && rs.plan.planning)) &&
      prog.message
    ) {
      head +=
        '<p class="ha2-research-msg">' + esc(prog.message) + '</p>';
    }
    if (
      (status === 'searching' ||
        status === 'fetching' ||
        status === 'briefing' ||
        status === 'reviewing' ||
        status === 'synthesizing') &&
      prog.sourcesFound
    ) {
      var pct = Math.min(
        100,
        Math.round(
          ((Number(prog.sourcesFetched) || 0) / Math.max(1, Number(prog.sourcesFound))) *
            100
        )
      );
      if (status === 'synthesizing') pct = 100;
      head +=
        '<div class="ha2-research-bar" aria-hidden="true"><i style="width:' +
        pct +
        '%"></i></div>';
    }
    if (err) {
      var hint =
        (R && R.nextStepHint && R.nextStepHint(err)) || '';
      head +=
        '<p class="ha2-research-err">' +
        esc(err.message || '') +
        (hint ? ' — ' + esc(hint) : '') +
        '</p>';
    }
    if (status === 'awaiting_approval') {
      var plan = rs.plan || {};
      var facets = plan.facets || [];
      var pathNow = plan.path || 'fast';
      var planning = !!plan.planning;
      var intent = rs.researchIntent || plan.researchIntent || {};
      var needsClarify = !!intent.needsClarify;
      var clarifyOpts = Array.isArray(intent.clarifyOptions)
        ? intent.clarifyOptions
        : [];
      var planDegraded =
        !needsClarify &&
        !planning &&
        (intent.runnable === false ||
          intent.status === 'degraded' ||
          (String(intent.planSource || '') === 'local' && !!intent.degradeReason) ||
          (String(intent.planSource || '') !== 'wb' && !intent.needsClarify));
      var degradeBanner = planDegraded
        ? '<p class="ha2-research-err" data-ha2-research-plan-degraded>' +
          esc(
            prog.message ||
              t(
                'ha2ResearchPlanDegraded',
                '正式路径需要模型规划 JSON——请换模型或点「重新规划」。本地解析不会开跑。'
              )
          ) +
          '</p>' +
          '<div class="ha2-research-actions" style="margin:0 0 10px">' +
          '<button type="button" class="ha2-btn primary" data-ha2-research-replan>' +
          esc(t('ha2ResearchReplan', '重新规划（调模型）')) +
          '</button></div>'
        : '';
      var clarifyFree =
        needsClarify && !clarifyOpts.length
          ? '<div class="ha2-research-clarify-free">' +
            '<input type="text" class="ha2-research-clarify-input" data-ha2-research-clarify-text' +
            ' placeholder="' +
            esc(t('ha2ResearchClarifyTextPh', '补充更具体的调研主题…')) +
            '" />' +
            '<button type="button" class="ha2-btn primary" data-ha2-research-clarify-submit>' +
            esc(t('ha2ResearchClarifySubmit', '用这个主题继续')) +
            '</button></div>'
          : '';
      var clarifyChips = needsClarify
        ? '<div class="ha2-research-clarify" data-ha2-research-clarify-list>' +
          '<p class="ha2-research-msg">' +
          esc(
            intent.clarifyQuestion ||
              prog.message ||
              t('ha2ResearchClarify', '主题偏宽，先选一个方向：')
          ) +
          '</p>' +
          (clarifyOpts.length
            ? '<div class="ha2-research-clarify-opts" role="group">' +
              clarifyOpts
                .map(function (o) {
                  return (
                    '<button type="button" class="ha2-btn ha2-research-clarify-opt" data-ha2-research-clarify="' +
                    esc(o.id) +
                    '" data-ha2-research-clarify-topic="' +
                    esc(o.refinedTopic || o.label || '') +
                    '">' +
                    esc(o.label) +
                    '</button>'
                  );
                })
                .join('') +
              '</div>'
            : clarifyFree) +
          '</div>'
        : '';
      var facetRows = facets
        .map(function (f, idx) {
          return (
            '<label class="ha2-research-facet">' +
            '<span>' +
            esc(f.label || '面' + (idx + 1)) +
            '</span>' +
            '<input type="text" data-ha2-research-facet-q="' +
            esc(f.id) +
            '" value="' +
            esc(f.query || '') +
            '"' +
            (planning || needsClarify ? ' disabled' : '') +
            ' /></label>'
          );
        })
        .join('');
      return (
        head +
        '<div class="ha2-research-config" data-ha2-research-config data-ha2-research-plan' +
        (planning ? ' data-ha2-research-planning' : '') +
        (needsClarify ? ' data-ha2-research-clarify-gate' : '') +
        '>' +
        (needsClarify
          ? ''
          : '<p class="ha2-research-msg">' +
            esc(
              planning
                ? prog.message || t('ha2ResearchPlanning', '正在用模型规划…')
                : plan.pathReason || ''
            ) +
            '</p>') +
        (plan.topic
          ? '<p class="ha2-research-msg ha2-research-topic-line"><b>' +
            esc(t('ha2ResearchTopic', '主题')) +
            '</b> ' +
            esc(plan.topic) +
            '</p>'
          : '') +
        degradeBanner +
        clarifyChips +
        (needsClarify
          ? ''
          : '<div class="ha2-research-row">' +
        '<label>' +
        esc(t('ha2ResearchPath', '路径')) +
            '<select data-ha2-research-path' +
            (planning ? ' disabled' : '') +
            '>' +
        '<option value="fast"' +
        (pathNow === 'fast' ? ' selected' : '') +
        '>' +
        esc(t('ha2ResearchPathFast', '快速核实（仍查来源）')) +
        '</option>' +
        '<option value="faceted"' +
        (pathNow === 'faceted' ? ' selected' : '') +
        '>' +
        esc(t('ha2ResearchPathFaceted', '分工调研')) +
        '</option></select></label></div>' +
        (pathNow === 'faceted'
          ? '<div class="ha2-research-facets" data-ha2-research-facets>' +
            '<p class="ha2-research-msg">' +
                esc(
                  planning
                    ? t('ha2ResearchFacetsPlanning', '模型正在规划调查面…')
                    : t('ha2ResearchFacetsHint', '将调查这些方面（可改查询词）')
                ) +
            '</p>' +
            facetRows +
            '</div>'
          : '<p class="ha2-research-msg">' +
            esc(
              t(
                'ha2ResearchFastHint',
                '快速路径仍会搜索并抓取有限来源，给出可核查短答。'
              )
            ) +
                '</p>')) +
        '<div class="ha2-research-actions">' +
        (needsClarify || planDegraded
          ? ''
          : '<button type="button" class="ha2-btn primary" data-ha2-research-confirm' +
            (planning ? ' disabled' : '') +
            '>' +
            esc(
              planning
                ? t('ha2ResearchPlanningCta', '规划中…')
                : t('ha2ResearchConfirm', '确认并开始')
            ) +
            '</button>') +
        '<button type="button" class="ha2-btn" data-ha2-research-cancel>' +
        esc(t('ha2ResearchCancel', '取消')) +
        '</button></div></div></div>'
      );
    }
    if (status === 'configuring' || status === 'idle') {
      return (
        head +
        '<div class="ha2-research-config" data-ha2-research-config>' +
        '<div class="ha2-research-row">' +
        '<label>' +
        esc(t('ha2ResearchDepth', '深度')) +
        '<select data-ha2-research-depth>' +
        '<option value="quick"' +
        (cfg.depth === 'quick' ? ' selected' : '') +
        '>' +
        esc(t('ha2ResearchDepthQuick', '快速')) +
        '</option>' +
        '<option value="standard"' +
        (cfg.depth !== 'quick' && cfg.depth !== 'deep' ? ' selected' : '') +
        '>' +
        esc(t('ha2ResearchDepthStandard', '标准')) +
        '</option>' +
        '<option value="deep"' +
        (cfg.depth === 'deep' ? ' selected' : '') +
        '>' +
        esc(t('ha2ResearchDepthDeep', '深度')) +
        '</option></select></label>' +
        '<label>' +
        esc(t('ha2ResearchFormat', '输出')) +
        '<select data-ha2-research-format>' +
        '<option value="markdown"' +
        (cfg.format !== 'html' ? ' selected' : '') +
        '>Markdown</option>' +
        '<option value="html"' +
        (cfg.format === 'html' ? ' selected' : '') +
        '>HTML</option></select></label></div>' +
        '<div class="ha2-research-actions">' +
        '<button type="button" class="ha2-btn primary" data-ha2-research-start>' +
        esc(t('ha2ResearchStart', '开始调研')) +
        '</button>' +
        '<button type="button" class="ha2-btn" data-ha2-research-cancel>' +
        esc(t('ha2ResearchCancel', '取消')) +
        '</button></div></div></div>'
      );
    }
    var body = '';
    var live = prog.liveSources || [];
    if (
      !result &&
      live.length &&
      (status === 'fetching' || status === 'synthesizing' || status === 'searching')
    ) {
      body +=
        '<ul class="ha2-research-sources ha2-research-sources--live">' +
        live
          .map(function (s) {
            var st = String(s.state || 'pending');
            var mark =
              st === 'ok'
                ? '✓'
                : st === 'fail'
                  ? '×'
                  : st === 'snippet'
                    ? '·'
                    : st === 'fetching'
                      ? '…'
                      : '○';
            return (
              '<li data-state="' +
              esc(st) +
              '"><span class="ha2-research-sid">[' +
              esc(s.id) +
              ']</span> <span class="ha2-research-live-mark">' +
              mark +
              '</span> ' +
              (s.url
                ? '<a href="' +
                  esc(s.url) +
                  '" target="_blank" rel="noreferrer">' +
                  esc(s.title || s.url) +
                  '</a>'
                : esc(s.title || '')) +
              '</li>'
            );
          })
          .join('') +
        '</ul>';
    } else if (result && result.sources && result.sources.length) {
      body +=
        '<ul class="ha2-research-sources">' +
        result.sources
          .map(function (s) {
            return (
              '<li><span class="ha2-research-sid">[' +
              esc(s.id) +
              ']</span> <a href="' +
              esc(s.url) +
              '" target="_blank" rel="noreferrer">' +
              esc(s.title || s.url) +
              '</a></li>'
            );
          })
          .join('') +
        '</ul>';
    } else if (
      status === 'completed_without_sources' ||
      (result && result.status === 'completed_without_sources')
    ) {
      body +=
        '<p class="ha2-research-msg">' +
        esc(t('ha2ResearchNoSources', '基于已有材料整理（无网络来源）')) +
        '</p>';
    }
    if (result) {
      body +=
        '<div class="ha2-research-file-rail" data-ha2-research-files>' +
        '<button type="button" class="ha2-research-file' +
        (researchFilePreview === 'markdown' ? ' is-on' : '') +
        '" data-ha2-research-file="markdown">report.md</button>' +
        '<button type="button" class="ha2-research-file' +
        (researchFilePreview === 'html' ? ' is-on' : '') +
        '" data-ha2-research-file="html">report.html</button>' +
        '<button type="button" class="ha2-research-file' +
        (researchFilePreview === 'sources' ? ' is-on' : '') +
        '" data-ha2-research-file="sources">' +
        esc(t('ha2ResearchSources', '来源')) +
        '</button></div>' +
        '<div class="ha2-research-actions">' +
        '<button type="button" class="ha2-btn" data-ha2-research-export="markdown">' +
        esc(t('ha2ResearchExportMd', '另存 Markdown')) +
        '</button>' +
        '<button type="button" class="ha2-btn" data-ha2-research-export="html">' +
        esc(t('ha2ResearchExportHtml', '另存 HTML')) +
        '</button>' +
        '<button type="button" class="ha2-btn" data-ha2-research-restart>' +
        esc(t('ha2ResearchRestart', '重新调研')) +
        '</button>' +
        (rs.lastExportPath
          ? '<span class="ha2-research-path">' + esc(rs.lastExportPath) + '</span>'
          : '') +
        '</div>';
    } else if (
      status === 'searching' ||
      status === 'fetching' ||
      status === 'briefing' ||
      status === 'reviewing' ||
      status === 'synthesizing'
    ) {
      body +=
        '<div class="ha2-research-actions">' +
        '<button type="button" class="ha2-btn" data-ha2-research-cancel>' +
        esc(t('ha2ResearchCancel', '取消')) +
        '</button></div>';
    } else if (status === 'failed') {
      body +=
        '<div class="ha2-research-actions">' +
        '<button type="button" class="ha2-btn primary" data-ha2-research-restart>' +
        esc(t('ha2ResearchRestart', '重新调研')) +
        '</button>' +
        '<button type="button" class="ha2-btn" data-ha2-research-cancel>' +
        esc(t('ha2ResearchCancel', '关闭')) +
        '</button></div>';
    }
    return head + body + '</div>';
  }

  /** Codex-style 提问|投递 segment — research mode hidden from chrome. */
  function workModeSegmentHtml(snap, opts) {
    opts = opts || {};
    var session = (snap && snap.session) || {};
    var wm = String((snap && snap.workMode) || session.mode || 'think');
    // Research is product-hidden; never surface it as the active segment.
    var mode = wm === 'edit' || session.mode === 'edit' ? 'edit' : 'think';
    var effective = !!session.modeEffective;
    var AtrMode = global.OneToneHomeAgentTask;
    var editOk =
      AtrMode && typeof AtrMode.editModeSelectable === 'function'
        ? AtrMode.editModeSelectable(session.capabilities)
        : !!(
            session.capabilities &&
            session.capabilities.write_project &&
            session.capabilities.write_project.implemented &&
            session.capabilities.approval_execute &&
            session.capabilities.approval_execute.implemented
    );
    var modes = [
      {
        id: 'think',
        label: sessionModeLabel('think'),
        title: t('ha2ModeChatHint', '向大模型提问：讨论、方案，不改项目文件'),
        disabled: false
      },
      {
        id: 'edit',
        label: sessionModeLabel('edit'),
        title: editOk
          ? t('ha2ModeWorkHint', '向各 Agent 转发投递：送到桌面 Agent 执行（需确认时会停下）')
          : t('ha2ModeNotWired', '暂未接入') +
            ' · ' +
            ((session.capabilities &&
              session.capabilities.write_project &&
              session.capabilities.write_project.reason) ||
              t('ha2AtrNeedFlag', '开启 Agent Task Runtime')),
        disabled: !editOk
      }
    ];
    var modeBtns = modes
      .map(function (m) {
        var on = m.id === mode;
        var title =
          on && !effective && session.modeReason ? session.modeReason : m.title;
        return (
          '<button type="button" class="ha2-mode-btn' +
          (on ? ' is-on' : '') +
          (m.disabled ? ' is-disabled' : '') +
          '"' +
          (m.disabled ? ' disabled aria-disabled="true"' : '') +
          ' role="radio" aria-checked="' +
          (on ? 'true' : 'false') +
          '" data-ha2-work-mode="' +
          esc(m.id) +
          '" title="' +
          esc(title) +
          '">' +
          esc(m.label) +
          (m.disabled ? ' · ' + esc(t('ha2NotWiredShort', '暂未接入')) : '') +
          '</button>'
        );
      })
      .join('');
    // Model lives in the dock compose bar — tabs stay mode-only.
    return (
      '<div class="ha2-mode-row ha2-mode-row--segment ha2-mode-row--tabs' +
      (opts.compact ? ' is-compact' : '') +
      '" role="radiogroup" aria-label="' +
      esc(t('ha2WorkMode', '提问 / 投递')) +
      '">' +
      modeBtns +
      '</div>'
    );
  }

  function softPadPreferredProvider() {
    try {
      return String(
        (global.localStorage && global.localStorage.getItem(SOFTPAD_PREF_KEY)) || ''
      ).trim();
    } catch (_) {
      return '';
    }
  }

  function writeSoftPadPreferredProvider(id) {
    id = String(id || '').trim();
    try {
      if (!global.localStorage) return;
      if (id) global.localStorage.setItem(SOFTPAD_PREF_KEY, id);
      else global.localStorage.removeItem(SOFTPAD_PREF_KEY);
    } catch (_) {}
  }

  function refreshSoftPadFreemodelKeys() {
    var ipc = global.OneToneIpc;
    if (!ipc || !ipc.invoke) return Promise.resolve(softPadFreemodelKeys);
    return Promise.all(
      SOFTPAD_FREEMODEL_CATALOG.map(function (row) {
        return ipc
          .invoke('cmd_soft_pad_provider_key_get', { provider: row.id })
          .then(function (res) {
            softPadFreemodelKeys[row.id] = {
              configured: !!(res && res.configured),
              masked: (res && res.masked) || ''
            };
          })
          .catch(function () {
            softPadFreemodelKeys[row.id] = { configured: false, masked: '' };
          });
      })
    ).then(function () {
      return softPadFreemodelKeys;
    });
  }

  /**
   * Mixed model picker: WB login models + Soft Pad freemodel lanes + API.
   * Values: wb:<modelId> | sp:<softPadId> | api:<providerId> | __add__
   * Work mode uses ATR engine host instead.
   */
  function freemodelReadyIds() {
    var gateway = global.OneToneModelGateway;
    var providers = gateway && gateway.providers ? gateway.providers() : [];
    var ids = {};
    var i;
    for (i = 0; i < providers.length; i++) {
      if (providers[i] && providers[i].id) ids[providers[i].id] = true;
    }
    var def = wbDefaultAccount(wbLocalCache);
    if (def && Array.isArray(def.models) && def.models.length) ids.workbuddy = true;
    return ids;
  }

  function freemodelCapCtx(ch) {
    var ready = freemodelReadyIds();
    var def = wbDefaultAccount(wbLocalCache);
    var models = def && Array.isArray(def.models) ? def.models : [];
    return {
      hasProvider: !!(ch && ready[ch.id]),
      wbLoggedIn: !!def,
      wbModelCount: models.length
    };
  }

  var MODEL_BRAND_ICON_BASE = 'icons/model-brand/';

  /** Official / Google favicon files under icons/model-brand — never hand-drawn. */
  function modelBrandMeta(raw) {
    var s = String(raw || '').toLowerCase();
    if (/deepseek|深度求索/.test(s)) return { brand: '深度求索', icon: 'deepseek.png' };
    if (/glm|zhipu|智谱|bigmodel/.test(s)) return { brand: '智谱', icon: 'zhipu.png' };
    if (/kimi|moonshot|月之暗面/.test(s)) return { brand: '月之暗面', icon: 'kimi.png' };
    if (/minimax|minimaxi|abab/.test(s)) return { brand: 'MiniMax', icon: 'minimax.png' };
    if (/hailuo|海螺/.test(s)) return { brand: '海螺', icon: 'hailuo.png' };
    if (/hunyuan|混元|hy[\d_-]/.test(s)) return { brand: '混元', icon: 'hunyuan.png' };
    if (/stepfun|阶跃|\bstep-?\d|\bstep[\s_-]/.test(s)) {
      return { brand: '阶跃星辰', icon: 'stepfun.png' };
    }
    if (/xiaomi|mimo|小米/.test(s)) return { brand: '小米', icon: 'xiaomi.png' };
    if (/qwen|通义|dashscope/.test(s)) return { brand: '通义千问', icon: 'qwen.png' };
    if (/spark|xunfei|讯飞|星火/.test(s)) return { brand: '讯飞', icon: 'xunfei.png' };
    if (/sense|商汤|sensenova|sensetime/.test(s)) {
      return { brand: '商汤', icon: 'sensetime.png' };
    }
    if (/kilo/.test(s)) return { brand: 'Kilo', icon: 'kilo.png' };
    if (/opencode|open.?code/.test(s)) return { brand: 'OpenCode', icon: 'opencode.png' };
    if (/loomy/.test(s)) return { brand: 'Loomy', icon: 'loomy.png' };
    if (/raccoon|小浣熊|huanxiong/.test(s)) {
      return { brand: 'Raccoon', icon: 'raccoon.png' };
    }
    if (/space[-_\s]?bunny|太空兔/.test(s)) {
      return { brand: '太空兔', icon: 'space-bunny.png' };
    }
    if (/siliconflow|硅基/.test(s)) return { brand: '硅基流动', icon: 'siliconflow.png' };
    if (/openrouter/.test(s)) return { brand: 'OpenRouter', icon: 'openrouter.png' };
    if (/openai|gpt-/.test(s)) return { brand: 'OpenAI', icon: '../provider/openai.png' };
    if (/workbuddy|codebuddy/.test(s)) {
      return { brand: 'WorkBuddy', icon: 'workbuddy.png' };
    }
    return { brand: '', icon: 'workbuddy.png' };
  }

  function modelRouteDisplay(nameOrId, hint) {
    var raw = String(nameOrId || '').trim() || String(hint || '').trim();
    var meta = modelBrandMeta(raw + ' ' + String(hint || ''));
    var model = String(nameOrId || '').trim() || meta.brand || String(hint || '');
    var label = meta.brand
      ? model.toLowerCase().indexOf(meta.brand.toLowerCase()) === 0
        ? model
        : meta.brand + ' ' + model
      : model;
    return { label: label, icon: MODEL_BRAND_ICON_BASE + meta.icon };
  }

  /**
   * Collapse legacy MiniMax CN ids (minimax_cn / MiniMax CN) with models.dev
   * minimax-cn-openai — same OpenAI-compat CN lane, not Soft Pad Coding Plan.
   */
  function modelRouteApiLaneKey(id, label) {
    var blob = (String(id || '') + ' ' + String(label || ''))
      .toLowerCase()
      .replace(/_/g, '-');
    if (
      /minimax\.io|api\.minimax\.io/.test(blob) ||
      (/(^|[^a-z])minimax-openai([^a-z]|$)/.test(blob) && !/minimax-cn/.test(blob))
    ) {
      return 'minimax-io';
    }
    if (/minimax[-]?cn|minimaxi\.com|minimax\.cn|(^|[^a-z])minimax cn([^a-z]|$)/.test(blob)) {
      return 'minimax-cn';
    }
    return String(id || '')
      .toLowerCase()
      .replace(/_/g, '-');
  }

  function modelRouteApiPreferScore(p, currentProviderId) {
    p = p || {};
    var id = String(p.id || '');
    var score = 0;
    // Canonical models.dev ids beat legacy minimax_cn / "MiniMax CN" aliases.
    if (id === 'minimax-cn-openai' || id === 'minimax-openai') score += 100;
    if (id && id === String(currentProviderId || '')) score += 20;
    if (p.configured) score += 10;
    if (/^minimax[_-]?cn$/.test(id)) score -= 40;
    return score;
  }

  /**
   * Display chips for model rows (tag / relative rate / speed).
   * WorkBuddy catalog has no price fields yet — name heuristics mirror the product UI.
   * Soft Pad / free / custom lanes use lane labels, not invented multipliers.
   */
  function modelRouteOfferMeta(kind, name, id) {
    var raw = (String(name || '') + ' ' + String(id || '')).toLowerCase();
    if (kind === 'free') {
      return { tag: '免费额度', tagKind: 'free', rate: '0.00x', speed: '快' };
    }
    if (kind === 'sp') {
      return { tag: 'Soft Pad', tagKind: 'sub', rate: '计量', speed: '中' };
    }
    if (kind === 'api') {
      var lane = modelRouteApiLaneKey(id, name);
      // OpenAI-compat Chat API has no wallet probe. Coding Plan 5h lives on Soft Pad.
      if (lane === 'minimax-cn' || lane === 'minimax-io') {
        return {
          tag: 'API',
          tagKind: 'api',
          rate: '无余额',
          speed: '—',
          rateHint: 'Chat API Key 无平台余额接口；Coding Plan 5h 余量请看 Soft Pad'
        };
      }
      return {
        tag: 'API',
        tagKind: 'api',
        rate: '—',
        speed: '—',
        rateHint: '自定义 API 无实时余额探针'
      };
    }
    if (kind === 'add') return null;
    // wb
    if (/free|免费|bunny|space-?bunny/.test(raw)) {
      return { tag: '限时免费', tagKind: 'free', rate: '0.00x', speed: '快' };
    }
    if (/flash|lite|mini/.test(raw)) {
      return { tag: '夜间折扣', tagKind: 'night', rate: '0.11x', speed: '快' };
    }
    if (/preview|hy4/.test(raw)) {
      return { tag: '预览', tagKind: 'hot', rate: '0.29x', speed: '中' };
    }
    if (/\bhy3\b/.test(raw) && !/flash/.test(raw)) {
      return { tag: '限时免费', tagKind: 'free', rate: '0.00x', speed: '中' };
    }
    if (/pro|k3\.1|reasoning|think/.test(raw)) {
      return { tag: '订阅优先', tagKind: 'sub', rate: '0.69x', speed: '慢' };
    }
    return { tag: '订阅优先', tagKind: 'sub', rate: '0.79x', speed: '中' };
  }

  function modelRouteOptHtml(value, label, icon, selected, offer) {
    var tagHtml = '';
    var rateHtml = '';
    var checkHtml = selected
      ? '<span class="ha2-model-dd-check" aria-hidden="true">✓</span>'
      : '';
    if (offer && offer.tag) {
      tagHtml =
        '<span class="ha2-model-dd-tag ha2-model-dd-tag--' +
        esc(offer.tagKind || 'api') +
        '" title="' +
        esc(offer.speed ? '消耗速度 · ' + offer.speed : offer.tag) +
        '">' +
        esc(offer.tag) +
        (offer.speed ? '<i class="ha2-model-dd-speed">' + esc(offer.speed) + '</i>' : '') +
        '</span>';
    }
    if (offer && offer.rate) {
      rateHtml =
        '<span class="ha2-model-dd-rate" title="' +
        esc(
          offer.rateHint ||
            t('ha2ModelRateHint', '相对消耗倍率（展示估算）')
        ) +
        '">' +
        esc(offer.rate) +
        '</span>';
    }
    var searchBlob = [label, offer && offer.tag, offer && offer.rate, offer && offer.speed]
      .filter(Boolean)
      .join(' ');
    return (
      '<button type="button" class="ha2-model-dd-opt' +
      (selected ? ' on' : '') +
      '" role="option" aria-selected="' +
      (selected ? 'true' : 'false') +
      '" data-ha2-model-route-opt="' +
      esc(value) +
      '" data-ha2-model-dd-q="' +
      esc(searchBlob) +
      '"><img class="ha2-model-dd-ico" src="' +
      esc(icon) +
      '" alt="" width="16" height="16" decoding="async"><span class="ha2-model-dd-main"><span class="ha2-model-dd-name">' +
      esc(label) +
      '</span>' +
      tagHtml +
      '</span>' +
      rateHtml +
      checkHtml +
      '</button>'
    );
  }

  function modelRouteGroupHtml(label) {
    return (
      '<div class="ha2-model-dd-group" data-ha2-model-dd-group>' + esc(label) + '</div>'
    );
  }

  function filterModelRouteMenu(q) {
    var list =
      (root && root.querySelector('[data-ha2-model-route-list]')) ||
      document.querySelector('.ha2-model-dd-menu.is-portaled [data-ha2-model-route-list]');
    if (!list) return;
    var needle = String(q || '')
      .trim()
      .toLowerCase();
    var kids = list.children;
    var i;
    var groupEl = null;
    var groupHas = false;
    function flushGroup() {
      if (groupEl) groupEl.hidden = needle ? !groupHas : false;
      groupEl = null;
      groupHas = false;
    }
    for (i = 0; i < kids.length; i++) {
      var el = kids[i];
      if (el.hasAttribute('data-ha2-model-dd-group')) {
        flushGroup();
        groupEl = el;
        continue;
      }
      if (!el.hasAttribute('data-ha2-model-route-opt')) continue;
      var blob = String(el.getAttribute('data-ha2-model-dd-q') || '').toLowerCase();
      var hit = !needle || blob.indexOf(needle) >= 0;
      el.hidden = !hit;
      if (hit) groupHas = true;
    }
    flushGroup();
  }

  function clearModelRouteMenuPos(menu) {
    if (!menu || !menu.style) return;
    menu.style.position = '';
    menu.style.top = '';
    menu.style.bottom = '';
    menu.style.left = '';
    menu.style.right = '';
    menu.style.minWidth = '';
    menu.style.maxWidth = '';
    menu.style.maxHeight = '';
    menu.style.zIndex = '';
    menu.style.background = '';
  }

  function restorePortaledMenu(menu) {
    if (!menu || !menu.__ha2MenuHome) return;
    try {
      menu.__ha2MenuHome.appendChild(menu);
    } catch (_) {}
    menu.__ha2MenuHome = null;
    menu.classList.remove('is-portaled');
  }

  /** Escape Focus stacking / dock overflow — park on body while open. */
  function portalOverlayToBody(el) {
    if (!el || !document.body) return;
    if (el.parentElement === document.body) return;
    el.__ha2MenuHome = el.parentElement;
    document.body.appendChild(el);
    el.classList.add('is-portaled');
  }

  /** Escape .ha2-dock overflow clipping via fixed viewport coords. */
  function positionModelRouteMenu(trig, menu) {
    if (!trig || !menu || !global.getComputedStyle) return;
    var r = trig.getBoundingClientRect();
    var vw = global.innerWidth || 0;
    var vh = global.innerHeight || 0;
    var maxH = Math.min(embedMode ? 420 : 360, Math.floor(vh * (embedMode ? 0.58 : 0.5)));
    var spaceAbove = Math.max(0, r.top - 8);
    var spaceBelow = Math.max(0, vh - r.bottom - 8);
    var openUp = spaceAbove >= 160 || spaceAbove > spaceBelow;
    var avail = openUp ? spaceAbove : spaceBelow;
    var width = Math.max(r.width, 300);
    var left = Math.min(Math.max(8, r.left), Math.max(8, vw - width - 8));
    menu.style.position = 'fixed';
    menu.style.zIndex = '12050';
    menu.style.background = '#ffffff';
    menu.style.left = left + 'px';
    menu.style.right = 'auto';
    menu.style.minWidth = width + 'px';
    menu.style.maxWidth = Math.min(420, Math.floor(vw * 0.86)) + 'px';
    menu.style.maxHeight = Math.min(maxH, Math.max(160, avail)) + 'px';
    if (openUp) {
      menu.style.top = 'auto';
      menu.style.bottom = vh - r.top + 6 + 'px';
    } else {
      menu.style.bottom = 'auto';
      menu.style.top = r.bottom + 6 + 'px';
    }
  }

  function scrubPortaledOverlays() {
    var nodes = document.querySelectorAll(
      '.ha2-model-dd-menu.is-portaled, .ha2-picker.is-portaled'
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      el.hidden = true;
      clearModelRouteMenuPos(el);
      restorePortaledMenu(el);
      if (el.classList.contains('ha2-picker') && el.parentElement === document.body) {
        try {
          el.remove();
        } catch (_) {}
      }
    }
  }

  function closeModelRouteMenu() {
    modelRouteMenuOpen = false;
    var dd = root && root.querySelector('[data-ha2-model-route-dd]');
    var menu =
      (dd && dd.querySelector('[data-ha2-model-route-menu]')) ||
      document.querySelector('[data-ha2-model-route-menu]');
    var trig = dd && dd.querySelector('[data-ha2-model-route-trigger]');
    if (dd) dd.classList.remove('is-open');
    if (menu) {
      menu.hidden = true;
      clearModelRouteMenuPos(menu);
      restorePortaledMenu(menu);
    }
    scrubPortaledOverlays();
    if (trig) trig.setAttribute('aria-expanded', 'false');
  }

  function openModelRouteMenu() {
    if (!root) return;
    scrubPortaledOverlays();
    var dd = root.querySelector('[data-ha2-model-route-dd]');
    if (!dd) return;
    modelRouteMenuOpen = true;
    dd.classList.add('is-open');
    var menu = dd.querySelector('[data-ha2-model-route-menu]');
    var trig = dd.querySelector('[data-ha2-model-route-trigger]');
    if (menu) {
      menu.hidden = false;
      // Keep menu in-tree; fixed + high z-index (portal left stuck overlays / 假死).
      positionModelRouteMenu(trig, menu);
      var search = menu.querySelector('[data-ha2-model-route-search]');
      if (search) {
        search.value = '';
        filterModelRouteMenu('');
        try {
          search.focus();
        } catch (_) {}
      }
      var on = menu.querySelector('.ha2-model-dd-opt.on');
      if (on && on.scrollIntoView) {
        try {
          on.scrollIntoView({ block: 'nearest' });
        } catch (_) {
          on.scrollIntoView(false);
        }
      }
    }
    if (trig) trig.setAttribute('aria-expanded', 'true');
  }

  function toggleModelRouteMenu() {
    if (modelRouteMenuOpen) closeModelRouteMenu();
    else openModelRouteMenu();
  }

  /** Apply wb:/sp:/api:/__add__ from the custom model dropdown. */
  function applyModelRouteSelection(routeId, purpose) {
    purpose = purpose || 'synthesis';
    routeId = String(routeId || '');
    var gatewayRoute = global.OneToneModelGateway;
    if (routeId === '__add__') {
      closeModelRouteMenu();
      openModelProviderModal();
      return;
    }
    var providerId = routeId;
    var wbModel = '';
    var softPadId = '';
    if (routeId.indexOf('wb:') === 0) {
      providerId = 'workbuddy';
      wbModel = routeId.slice(3);
      writeSoftPadPreferredProvider('');
    } else if (routeId.indexOf('sp:') === 0) {
      softPadId = routeId.slice(3);
      providerId = 'softpad_our_freemodel';
      writeSoftPadPreferredProvider(softPadId);
      var softSt = softPadFreemodelKeys[softPadId] || {};
      if (!softSt.configured) {
        closeModelRouteMenu();
        openModelProviderModal({ softPadFocus: softPadId });
        return;
      }
    } else if (routeId.indexOf('api:') === 0) {
      providerId = routeId.slice(4);
      writeSoftPadPreferredProvider('');
      var FMRoute = freemodelChannelsApi();
      var fmCh = FMRoute && FMRoute.byId ? FMRoute.byId(providerId) : null;
      var fmCap = freemodelTokenCapture(fmCh);
      var fmIsLane =
        !!fmCh &&
        fmCh.id !== 'workbuddy' &&
        !!fmCh.baseUrl &&
        (fmCap === 'oauth_poll' || fmCap === 'paste_key');
      if (fmIsLane) {
        var routeProviders =
          gatewayRoute && gatewayRoute.providers ? gatewayRoute.providers() : [];
        var fmReady = routeProviders.some(function (rp) {
          return rp && rp.id === providerId;
        });
        if (!fmReady) {
          closeModelRouteMenu();
          openModelProviderModal({ fmFocus: providerId });
          return;
        }
      }
    }
    if (gatewayRoute && gatewayRoute.setRoute && providerId) {
      gatewayRoute.setRoute(purpose, providerId);
      if (purpose === 'intent') {
        ['intent', 'planning', 'review', 'repair', 'synthesis'].forEach(function (p) {
          gatewayRoute.setRoute(p, providerId);
        });
      }
    }
    if (wbModel) {
      var acc = wbDefaultAccount(wbLocalCache);
      if (acc && acc.id) {
        invoke('cmd_workbuddy_local_account_set_model', {
          id: acc.id,
          model: wbModel
        })
          .then(function (res) {
            if (res && res.snapshot) wbLocalCache = projectWbLocal(res.snapshot);
            else return refreshWbLocal(true);
          })
          .catch(function () {
            return refreshWbLocal(true);
          })
          .then(function () {
            closeModelRouteMenu();
            if (mounted && store()) paint(store().getSnapshot());
          });
        return;
      }
    }
    closeModelRouteMenu();
    if (mounted && store()) paint(store().getSnapshot());
  }

  /**
   * Values: wb:<modelId> | sp:<softPadId> | api:<providerId> | __add__
   * Only READY options — unconfigured free lanes open the connect sheet via CTA.
   * Work mode uses ATR engine host instead.
   */
  function modelRouteSelectHtml(snap) {
    if (atrEditPathOn(snap)) return '';
    var purpose = 'synthesis';
    var gateway = global.OneToneModelGateway;
    var providers = gateway && gateway.providers ? gateway.providers() : [];
    var currentProvider =
      gateway && gateway.resolveProvider
        ? gateway.resolveProvider(purpose).id
        : 'workbuddy';
    var def = wbDefaultAccount(wbLocalCache);
    var wbModels = def && Array.isArray(def.models) ? def.models : [];
    var selectedModel = def ? String(def.selectedModel || '') : '';
    var softPref = softPadPreferredProvider();
    var currentValue =
      currentProvider === 'softpad_our_freemodel' && softPref
        ? 'sp:' + softPref
        : currentProvider === 'workbuddy' && selectedModel
          ? 'wb:' + selectedModel
          : currentProvider === 'workbuddy'
            ? 'api:workbuddy'
            : 'api:' + currentProvider;

    var FMPick = freemodelChannelsApi();
    var freeLaneIds = {};
    if (FMPick && FMPick.connectChannels) {
      FMPick.connectChannels().forEach(function (c) {
        if (c && c.id && c.id !== 'workbuddy') freeLaneIds[c.id] = true;
      });
    }

    var html = '';
    var currentLabel = '';
    var currentIcon = MODEL_BRAND_ICON_BASE + 'workbuddy.png';

    if (wbModels.length) {
      html += modelRouteGroupHtml(t('ha2ModelTagWb', 'WorkBuddy'));
      for (var i = 0; i < wbModels.length; i++) {
        var m = wbModels[i] || {};
        var mid = String(m.id || '');
        if (!mid) continue;
        var wbDisp = modelRouteDisplay(m.name || mid, mid);
        var wbVal = 'wb:' + mid;
        var wbOn = currentValue === wbVal;
        if (wbOn) {
          currentLabel = wbDisp.label;
          currentIcon = wbDisp.icon;
        }
        html += modelRouteOptHtml(
          wbVal,
          wbDisp.label,
          wbDisp.icon,
          wbOn,
          modelRouteOfferMeta('wb', m.name || mid, mid)
        );
      }
    }

    var freeReadyOpts = '';
    for (var pi0 = 0; pi0 < providers.length; pi0++) {
      var fp = providers[pi0];
      if (!fp || !fp.id || !freeLaneIds[fp.id]) continue;
      var fpDisp = modelRouteDisplay(fp.label || fp.name || fp.id, fp.id);
      var fpVal = 'api:' + fp.id;
      var fpOn = currentValue === fpVal;
      if (fpOn) {
        currentLabel = fpDisp.label;
        currentIcon = fpDisp.icon;
      }
      freeReadyOpts += modelRouteOptHtml(
        fpVal,
        fpDisp.label,
        fpDisp.icon,
        fpOn,
        modelRouteOfferMeta('free', fp.label || fp.id, fp.id)
      );
    }
    if (freeReadyOpts) {
      html +=
        modelRouteGroupHtml(t('ha2ModelTagFreeReady', '免费模型')) + freeReadyOpts;
    }

    var softReady = '';
    for (var si = 0; si < SOFTPAD_FREEMODEL_CATALOG.length; si++) {
      var sp = SOFTPAD_FREEMODEL_CATALOG[si];
      var st = softPadFreemodelKeys[sp.id] || {};
      if (!st.configured) continue;
      var spDisp = modelRouteDisplay(sp.label || sp.id, sp.id);
      var spVal = 'sp:' + sp.id;
      var spOn = currentValue === spVal;
      if (spOn) {
        currentLabel = spDisp.label;
        currentIcon = spDisp.icon;
      }
      softReady += modelRouteOptHtml(
        spVal,
        spDisp.label,
        spDisp.icon,
        spOn,
        modelRouteOfferMeta('sp', sp.label || sp.id, sp.id)
      );
    }
    var paidApiOpts = '';
    var paidByLane = {};
    for (var pi = 0; pi < providers.length; pi++) {
      var p = providers[pi];
      if (!p || !p.id || p.id === 'workbuddy') continue;
      if (p.id === 'softpad_our_freemodel' || p.source === 'softpad') continue;
      if (freeLaneIds[p.id]) continue;
      if (p.id === 'custom_openai_compatible' && !p.configured) continue;
      var lane = modelRouteApiLaneKey(p.id, p.label || p.name);
      var prev = paidByLane[lane];
      if (
        !prev ||
        modelRouteApiPreferScore(p, currentProvider) >
          modelRouteApiPreferScore(prev, currentProvider)
      ) {
        paidByLane[lane] = p;
      }
    }
    var paidLanes = Object.keys(paidByLane);
    for (var pli = 0; pli < paidLanes.length; pli++) {
      var pPick = paidByLane[paidLanes[pli]];
      var pDisp = modelRouteDisplay(pPick.label || pPick.name || pPick.id, pPick.id);
      var pVal = 'api:' + pPick.id;
      var curLane = modelRouteApiLaneKey(currentProvider, '');
      var pOn =
        currentValue === pVal ||
        (curLane === paidLanes[pli] && String(currentValue || '').indexOf('api:') === 0);
      if (pOn) {
        currentLabel = pDisp.label;
        currentIcon = pDisp.icon;
      }
      paidApiOpts += modelRouteOptHtml(
        pVal,
        pDisp.label,
        pDisp.icon,
        pOn,
        modelRouteOfferMeta('api', pPick.label || pPick.id, pPick.id)
      );
    }
    if (softReady || paidApiOpts) {
      html +=
        modelRouteGroupHtml(t('ha2ModelTagApi', 'API 提供方')) +
        softReady +
        paidApiOpts;
    }

    // Empty / all-unconfigured: primary CTA opens provider sheet (Focus + full page).
    var modelListEmpty = !String(html || '').trim();
    if (modelListEmpty) {
      html +=
        '<button type="button" class="ha2-btn primary ha2-model-empty-cta" data-ha2-open-model-providers>' +
        esc(t('ha2ModelOpenProviders', '开通模型')) +
        '</button>';
    } else {
      html += modelRouteOptHtml(
        '__add__',
        t('ha2ModelAddProvider', '开通免费模型…'),
        MODEL_BRAND_ICON_BASE + 'workbuddy.png',
        false,
        null
      );
    }

    if (!currentLabel) {
      var fallback = modelRouteDisplay(currentProvider, currentProvider);
      currentLabel = modelListEmpty
        ? t('ha2ModelOpenProviders', '开通模型')
        : fallback.label;
      currentIcon = fallback.icon;
    }

    var hint = modelListEmpty
      ? t('ha2ModelEmptyHint', '还没有可用模型，点这里开通')
      : t(
          'ha2ModelMixHint',
          '只列已可用模型；未开通请点「开通免费模型」'
        );
    return (
      '<div class="ha2-model-route-label" data-ha2-model-route-label>' +
      '<span class="ha2-model-route-caption">' +
      esc(t('ha2Model', '模型')) +
      '</span>' +
      '<div class="ha2-model-dd" data-ha2-model-route-dd>' +
      '<button type="button" class="ha2-model-dd-trigger" data-ha2-model-route-trigger data-ha2-model-route="' +
      esc(purpose) +
      '" data-ha2-model-route-value="' +
      esc(currentValue) +
      '" aria-haspopup="listbox" aria-expanded="false" title="' +
      esc(hint) +
      '"><img class="ha2-model-dd-ico" src="' +
      esc(currentIcon) +
      '" alt="" width="16" height="16" decoding="async"><span class="ha2-model-dd-name">' +
      esc(currentLabel) +
      '</span><span class="ha2-model-dd-caret" aria-hidden="true">' +
      lucide('chevron-down', 12) +
      '</span></button>' +
      '<div class="ha2-model-dd-menu" data-ha2-model-route-menu hidden>' +
      '<div class="ha2-model-dd-search">' +
      '<span class="ha2-model-dd-search-ico" aria-hidden="true">⌕</span>' +
      '<input type="search" class="ha2-model-dd-search-input" data-ha2-model-route-search placeholder="' +
      esc(t('ha2ModelSearch', '搜索')) +
      '" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="ha2-model-dd-list" data-ha2-model-route-list role="listbox">' +
      html +
      '</div></div></div></div>'
    );
  }

  function sessionChromeHtml(snap) {
    var session = snap && snap.session;
    if (!session) return '';
    var wm = String((snap && snap.workMode) || session.mode || 'think');
    var mode = wm === 'edit' || session.mode === 'edit' ? 'edit' : 'think';
    var handoffBtn = '';
    if (mode === 'think' && wbChatTurns.length) {
      handoffBtn =
        '<button type="button" class="ha2-link" data-ha2-handoff-open>' +
        esc(t('ha2HandoffOpen', '整理并交接任务')) +
        '</button>';
    }

    // Segment titles already explain modes — no boundary / role copy stack.
    return (
      '<div class="ha2-session-chrome" data-ha2-session-chrome data-work-mode="' +
      esc(mode) +
      '">' +
      workModeSegmentHtml(snap) +
      (handoffBtn
        ? '<div class="ha2-session-role" data-ha2-session-role>' +
          handoffBtn +
          '</div>'
        : '') +
      handoffPanelHtml(snap) +
      researchPanelHtml(snap) +
      '</div>'
    );
  }

  function materialsSummaryLine(snap) {
    try {
      var mats = (snap && snap.materials) || [];
      if (!mats.length) return '';
      return mats
        .slice(0, 8)
        .map(function (m) {
          return String((m && (m.title || m.path || m.name || m.content)) || '').slice(0, 80);
        })
        .filter(Boolean)
        .join('; ');
    } catch (_) {
      return '';
    }
  }

  function atrProviderLabel(snap) {
    var A = global.OneToneHomeAgentTask;
    var id =
      (A && A.readProvider && A.readProvider()) ||
      (atrProvidersCache && atrProvidersCache.selectedDefault) ||
      '';
    var list =
      (atrProvidersCache && Array.isArray(atrProvidersCache.providers) && atrProvidersCache.providers) ||
      [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === String(id)) {
        return String(list[i].label || id);
      }
    }
    return id || t('ha2AtrProviderUnset', '未选引擎');
  }

  function atrTaskBusy(snap) {
    var st = String((snap && snap.agentTask && snap.agentTask.status) || '');
    return (
      st === 'running' || st === 'verifying' || st === 'repair' || st === 'review'
    );
  }

  /**
   * Current ATR provider has backend editCapable acceptance.
   * Cold cache / unknown id → true (defer to preflight); known false → block ordinary start.
   */
  function atrSelectedProviderEditCapable() {
    var A = global.OneToneHomeAgentTask;
    var want = String((A && A.readProvider && A.readProvider()) || '')
      .trim()
      .toLowerCase();
    var list =
      (atrProvidersCache &&
        Array.isArray(atrProvidersCache.providers) &&
        atrProvidersCache.providers) ||
      [];
    if (!list.length) return true;
    var i;
    var matched = null;
    for (i = 0; i < list.length; i++) {
      var row = list[i];
      if (!row) continue;
      var id = String(row.id || '').toLowerCase();
      if (want) {
        if (id === want) {
          matched = row;
          break;
        }
        continue;
      }
      if (row.editCapable === true) return true;
    }
    if (!want) return false;
    if (!matched) return true;
    return matched.editCapable === true;
  }

  function workPrimaryCtaLabel(snap) {
    if (atrNeedsApproval(snap)) return t('ha2AtrApprovePatch', '批准补丁写入');
    if (atrSendConflictOf(snap)) {
      var cst = String(
        (snap.atrSendConflict && snap.atrSendConflict.status) ||
          (snap.agentTask && snap.agentTask.status) ||
          ''
      );
      return atrConflictContinueLabel(cst);
    }
    if (atrTaskBusy(snap)) return t('ha2AtrViewProgress', '查看进度');
    return t('ha2WorkStartCta', '开始执行');
  }

  function openWorkConfirm(goal, matSum, opts) {
    opts = opts || {};
    workConfirmOpen = true;
    workConfirmGoal = String(goal || '').trim();
    workConfirmMatSum = String(matSum || '');
    if (workConfirmGoal) atrWbPagePendingGoal = workConfirmGoal;
    // Focus/embed must not auto-cover with ATR page; full-page home still may force.
    if (opts.forcePage === true) {
      atrWbPageForced = true;
      atrWbPageUserClosed = false;
    }
  }

  /** Keep draft/send chrome aligned with 对话|工作 after mode flips. */
  function syncModeChrome(snap) {
    if (!root) return;
    snap = snap || (store() && store().getSnapshot()) || {};
    var atrEdit = atrEditPathOn(snap);
    var isResearch =
      String((snap && snap.workMode) || (snap.session && snap.session.mode) || '') ===
      'research';
    var draftLabel = atrEdit
      ? t('ha2AtrDraftLabel', '描述要改的代码或文件')
      : isResearch
        ? t('ha2DraftLabelResearch', '调研主题或补充说明')
        : t('ha2DraftLabelChat', '继续讨论或整理方案');
    var draftPh = atrEdit
      ? t('ha2AtrDraftPlaceholder', '例如：把 README 复制到桌面 / 给登录页加错误提示…')
      : isResearch
        ? t('ha2DraftPlaceholderResearch', '也可在上方调研面板填写主题后开始…')
        : t('ha2DraftPlaceholderChat', '聊思路、读代码疑问，或生成给其他模型的步骤…');
    var ta = root.querySelector('.ha2-compose [data-ha2-draft]');
    if (ta && document.activeElement !== ta) {
      ta.placeholder = draftPh;
      ta.setAttribute('aria-label', draftLabel);
    }
    var sendBtn = root.querySelector('[data-ha2-send]');
    if (sendBtn) {
      var sendOk = canSendNow(snap);
      var label = atrEdit
        ? workPrimaryCtaLabel(snap)
        : t('ha2SendMessage', '发送消息');
      sendBtn.disabled = !sendOk;
      sendBtn.classList.toggle('is-labeled', !!atrEdit);
      sendBtn.setAttribute('aria-label', label);
      sendBtn.title = sendOk
        ? atrEdit
          ? label + '（Ctrl+Enter）'
          : t('ha2WbLocalSendHint', '本机对话（Ctrl+Enter）')
        : t('ha2SendNeedDraft', '先写一句再发送');
      if (atrEdit) sendBtn.textContent = label;
      else sendBtn.innerHTML = lucide('arrow-up', 16);
    }
    var secondary = root.querySelectorAll('[data-ha2-work-secondary]');
    var i;
    for (i = 0; i < secondary.length; i++) {
      secondary[i].hidden = !!atrEdit;
    }
    var providerCta = root.querySelector('[data-ha2-open-model-providers]');
    if (providerCta) providerCta.hidden = !!atrEdit;
    // Model mutex: chat → dock gateway route; work → ATR engine only.
    var wbModeHost = root.querySelector('[data-ha2-wb-mode-host]');
    var modelRouteHost = root.querySelector('[data-ha2-model-route-host]');
    var wbAccountHost = root.querySelector('[data-ha2-wb-account-host]');
    var atrProvHost = root.querySelector('[data-ha2-atr-provider-host]');
    if (wbModeHost) wbModeHost.hidden = !!atrEdit;
    if (modelRouteHost) {
      modelRouteHost.hidden = !!atrEdit;
      // Never wipe the open model dropdown (Focus remount / async chrome refresh).
      if (!atrEdit && !modelRouteMenuOpen) {
        var routeSig = modelRouteSelectHtml(snap);
        if (modelRouteHost.getAttribute('data-sig') !== routeSig) {
          modelRouteHost.setAttribute('data-sig', routeSig);
          modelRouteHost.innerHTML = routeSig;
        }
      } else if (atrEdit) {
        closeModelRouteMenu();
        modelRouteHost.innerHTML = '';
        modelRouteHost.removeAttribute('data-sig');
      }
    }
    if (wbAccountHost) {
      wbAccountHost.hidden = !!atrEdit;
      if (!atrEdit) syncWbAccountHost(snap);
      else {
        wbAccountHost.innerHTML = '';
        wbAccountHost.removeAttribute('data-sig');
      }
    }
    if (atrProvHost) atrProvHost.hidden = !atrEdit;
    if (askModeOn(snap)) clearAskModeTargetChrome();
    else if (!atrEdit) syncAgentStrip(snap);
    syncAtrWbLoginHost(snap);
  }

  function closeWorkConfirm() {
    workConfirmOpen = false;
    workConfirmGoal = '';
    workConfirmMatSum = '';
    // Cancel must not leave a forced ATR cover pending.
    atrWbPageForced = false;
  }

  /**
   * After UI plan confirm only. Passes planConfirmed so Controller hard-gate opens.
   * If provider not editCapable, silent verify then goal (verify uses skipPlanConfirm).
   */
  function startConfirmedWorkTask(goal, matSum) {
    var S = store();
    var text = String(goal || '').trim();
    var mats = String(matSum || '');
    if (!S || !S.startAndDriveAgentTask || !text) return Promise.resolve();
    closeWorkConfirm();
    openAtrEditPage(text);
    if (atrSelectedProviderEditCapable()) {
      return S.startAndDriveAgentTask({
        goal: text,
        materialsSummary: mats,
        planConfirmed: true
      }).then(function () {
        if (!mounted) return;
        paint(S.getSnapshot());
      });
    }
    return startAtrSandboxVerify({ silent: true, pageGoal: text })
      .then(function (res) {
        if (!mounted) return null;
        if (res && res.ok === false) {
          toast(
            t(
              'ha2AtrVerifyNotAccepted',
              '引擎验证未通过 — 可换引擎后重试，或稍后再发'
            )
          );
          paint(S.getSnapshot());
          return null;
        }
        return refreshAtrProviders(true).then(function () {
          if (!atrSelectedProviderEditCapable()) {
            toast(
              t(
                'ha2AtrVerifyNotAccepted',
                '引擎验证未通过 — 可换引擎后重试，或稍后再发'
              )
            );
            paint(S.getSnapshot());
            return null;
          }
          openAtrEditPage(text);
          return S.startAndDriveAgentTask({
            goal: text,
            materialsSummary: mats,
            planConfirmed: true
          });
        });
      })
      .then(function () {
        if (!mounted) return;
        paint(S.getSnapshot());
      })
      .catch(function (err) {
        if (!mounted) return;
        paint(S.getSnapshot());
        return Promise.reject(err);
      });
  }

  function taskCoreHtml(snap) {
    if (!atrEditPathOn(snap)) return '';
    // Confirm gate owns the same project/engine/goal table — avoid twin cards.
    if (workConfirmOpen) return '';
    var task = snap && snap.agentTask;
    var atrLive = atrTaskShouldSurface(snap);
    var st = task ? String(task.status || '') : '';
    var goal =
      (task && task.goal) ||
      String((snap && snap.draft) || '').trim() ||
      '';
    var mats = materialsSummaryLine(snap) || t('ha2MatNone', '无额外材料');
    // Live ATR: pillsHtml is the sole home progress CTA — skip next row.
    var nextBlock = '';
    if (!atrLive) {
    var next = '';
    if (atrNeedsApproval(snap)) {
      next = t('ha2AtrNextApprove', '批准后才会写入文件');
    } else if (atrTaskBusy(snap)) {
      next = t('ha2AtrNextRunning', '查看进度，或放弃当前任务');
    } else if (st === 'waiting') {
      next = t('ha2AtrNextInput', '下一步：在下方补充说明，继续当前编辑任务。');
    } else if (st === 'done') {
      var files = atrWrittenFiles(snap);
      next = files.length
        ? t('ha2AtrDoneWrote', '已写入') + ' ' + files.join(', ')
        : t('ha2AtrDoneOk', '改动已写入工作区。');
    } else if (st === 'failed' || st === 'interrupted') {
      next = atrFailureNextHint(snap);
    } else {
      next = t('ha2WorkStartNext', '写清目标后直接开始；未验证引擎会先静默验证');
      }
      nextBlock = '<div class="ha2-task-core-next">' + esc(next) + '</div>';
    }
    function row(lab, val) {
      return (
        '<div class="ha2-task-core-row"><span>' +
        esc(lab) +
        '</span><b>' +
        esc(val || '—') +
        '</b></div>'
      );
    }
    return (
      '<div class="ha2-task-core" data-ha2-task-core>' +
      row(t('ha2Project', '项目'), targetProjectLabel(snap)) +
      row(t('ha2AtrProvider', '引擎'), atrProviderLabel(snap)) +
      row(t('ha2Goal', '目标'), goal || '—') +
      row(t('ha2Materials', '材料'), mats) +
      nextBlock +
      '</div>'
    );
  }

  function workConfirmGateHtml(snap) {
    if (!workConfirmOpen || !atrEditPathOn(snap)) return '';
    var goal = workConfirmGoal || '';
    var path =
      (snap && snap.targetContext && snap.targetContext.projectPath) || '';
    var mats =
      workConfirmMatSum ||
      materialsSummaryLine(snap) ||
      t('ha2MatNone', '无额外材料');
    var canEdit = atrSelectedProviderEditCapable();
    var providerLine = atrProviderLabel(snap);
    var A = global.OneToneHomeAgentTask;
    var modelHint =
      (A && A.readProvider && A.readProvider()) ||
      (atrProvidersCache && atrProvidersCache.recommendedProvider) ||
      '';
    var acts = canEdit
      ? '<button type="button" class="ha2-btn primary" data-ha2-work-confirm-start>' +
        esc(t('ha2WorkConfirmStart', '批准并开始')) +
        '</button><button type="button" class="ha2-btn" data-ha2-work-confirm-cancel>' +
        esc(t('ha2WorkConfirmCancel', '取消')) +
        '</button>'
      : '<button type="button" class="ha2-btn primary" data-ha2-atr-verify-engine>' +
        esc(t('ha2AtrVerifyCta', '隔离验证')) +
        '</button><button type="button" class="ha2-btn" data-ha2-work-confirm-cancel>' +
        esc(t('ha2WorkConfirmCancel', '取消')) +
        '</button>';
    return (
      '<div class="ha2-work-confirm" data-ha2-work-confirm role="region" aria-label="' +
      esc(t('ha2WorkConfirmTitle', '确认后开始执行')) +
      '"><b>' +
      esc(t('ha2WorkConfirmTitle', '确认后开始执行')) +
      '</b><div class="ha2-work-confirm-meta">' +
      '<div><span>' +
      esc(t('ha2Goal', '目标')) +
      '</span> ' +
      esc(goal) +
      '</div><div><span>' +
      esc(t('ha2Project', '项目')) +
      '</span> ' +
      esc(targetProjectLabel(snap)) +
      (path ? ' · ' + esc(path) : '') +
      '</div><div><span>' +
      esc(t('ha2PlanFiles', '涉及文件')) +
      '</span> ' +
      esc(t('ha2PlanFilesTbd', '启动后 inspect_workspace / search_code 确定')) +
      '</div><div><span>' +
      esc(t('ha2PlanChanges', '预计修改')) +
      '</span> ' +
      esc(t('ha2PlanChangesHint', '仅在批准补丁后写入；无计划不直接改文件')) +
      '</div><div><span>' +
      esc(t('ha2PlanRisk', '风险')) +
      '</span> ' +
      esc(t('ha2PlanRiskHint', '工作区写盘 · 需审批令牌 · 可取消')) +
      '</div><div><span>' +
      esc(t('ha2PlanVerify', '验证方式')) +
      '</span> ' +
      esc(t('ha2PlanVerifyHint', 'apply 后 run_check；失败进入 repair')) +
      '</div><div><span>' +
      esc(t('ha2Materials', '材料')) +
      '</span> ' +
      esc(mats) +
      '</div><div><span>' +
      esc(t('ha2AtrProvider', '引擎')) +
      '</span> ' +
      esc(providerLine + (modelHint ? ' · ' + modelHint : '')) +
      '</div><div><span>' +
      esc(t('ha2WriteGate', '写入')) +
      '</span> ' +
      esc(
        canEdit
          ? t(
              'ha2WriteWithApproval',
              'write_with_approval · 写入前再批准'
            )
          : t(
              'ha2NeedVerifyBeforeEdit',
              '未开放普通编辑 · 先隔离验证再改项目'
            )
      ) +
      '</div></div><div class="ha2-work-confirm-acts">' +
      acts +
      '</div></div>'
    );
  }

  function atrFailureNextHint(snap) {
    var task = snap && snap.agentTask;
    var err = String((task && (task.lastError || task.last_error)) || '');
    var evs = (snap && snap.agentTaskEvents) || [];
    var i;
    var formatFail = /format/i.test(err);
    for (i = evs.length - 1; i >= 0 && !formatFail; i--) {
      if (evs[i] && String(evs[i].kind || '') === 'format_error') formatFail = true;
    }
    if (formatFail) {
      return t(
        'ha2AtrFormatNext',
        '模型未按工具格式行动。可换引擎/模型，或改写目标后重试；也可放弃当前任务。'
      );
    }
    if (err) return err.slice(0, 200);
    return t('ha2AtrFailedNext', '可放弃后改写目标重试，或换引擎后再开始执行。');
  }

  function degradedNextHint(snap) {
    var bits = [];
    var ctx = (snap && snap.targetContext) || {};
    if (!ctx.projectPath) {
      bits.push(t('ha2DegradedNeedProject', '缺项目：先在底栏选定项目路径'));
    }
    if (atrEditPathOn(snap)) {
      var list =
        (atrProvidersCache &&
          Array.isArray(atrProvidersCache.providers) &&
          atrProvidersCache.providers) ||
        [];
      var chatAny = false;
      var editAny = false;
      var i;
      for (i = 0; i < list.length; i++) {
        var row = list[i];
        if (!row) continue;
        if (row.chatReady || row.ready) chatAny = true;
        if (row.editCapable === true || row.locallyVerified) editAny = true;
      }
      if (!list.length) {
        bits.push(t('ha2DegradedNeedEngine', '缺引擎：打开工作模式后选择 ATR 引擎'));
      } else if (!chatAny) {
        bits.push(
          t(
            'ha2DegradedNeedAccount',
            '缺账号：登录 WorkBuddy 或配置 Soft Pad 密钥'
          )
        );
      } else if (!editAny) {
        bits.push(
          t(
            'ha2DegradedNeedVerify',
            '引擎未验证：点「隔离验证」通过后才开放普通编辑'
          )
        );
      }
    }
    if (!bits.length) {
      return t(
        'ha2DegradedHint',
        '当前依据不足 · 检查项目、引擎或账号后重试'
      );
    }
    return bits.join(' · ');
  }

  function buildHandoffSummaryFromChat() {
    var turns = wbChatTurns.slice(-12);
    if (!turns.length) return '';
    var lines = [];
    var i;
    for (i = 0; i < turns.length; i++) {
      var turn = turns[i];
      if (!turn || !turn.text) continue;
      var who = turn.role === 'assistant' ? '助手' : '我';
      lines.push(who + '：' + String(turn.text).replace(/\s+/g, ' ').trim());
    }
    var body = lines.join('\n');
    if (body.length > 1200) body = body.slice(0, 1200) + '…';
    return t('ha2HandoffLead', '请按以下整理后的任务继续处理：') + '\n\n' + body;
  }

  function handoffPanelHtml(snap) {
    if (!handoffOpen) return '';
    var catalog = (snap && snap.catalog) || [];
    var opts = catalog
      .filter(function (c) {
        return c && c.id && c.id !== 'workbuddy';
      })
      .map(function (c) {
        var sel = handoffTargetKind === c.id ? ' selected' : '';
        return (
          '<option value="' + esc(c.id) + '"' + sel + '>' + esc(c.name || c.id) + '</option>'
        );
      })
      .join('');
    return (
      '<div class="ha2-handoff" data-ha2-handoff role="region" aria-label="' +
      esc(t('ha2HandoffOpen', '整理并交接任务')) +
      '">' +
      '<label class="ha2-handoff-label">' +
      esc(t('ha2HandoffSummary', '任务摘要（可编辑）')) +
      '</label>' +
      '<textarea class="ha2-handoff-summary" data-ha2-handoff-summary rows="5">' +
      esc(handoffSummary) +
      '</textarea>' +
      '<label class="ha2-handoff-label">' +
      esc(t('ha2HandoffTarget', '目标 Agent')) +
      '</label>' +
      '<select class="ha2-handoff-target" data-ha2-handoff-target>' +
      '<option value="">' +
      esc(t('ha2PickAgent', '选择 Agent')) +
      '</option>' +
      opts +
      '</select>' +
      '<div class="ha2-handoff-acts">' +
      '<button type="button" class="ha2-btn primary" data-ha2-handoff-apply>' +
      esc(t('ha2HandoffApply', '填入草稿')) +
      '</button>' +
      '<button type="button" class="ha2-btn" data-ha2-handoff-cancel>' +
      esc(t('ha2HandoffCancel', '取消')) +
      '</button></div>' +
      '<p class="ha2-handoff-hint">' +
      esc(t('ha2HandoffHint', '不会自动发送；确认后点底栏发送才会投递。原对话会保留。')) +
      '</p></div>'
    );
  }

  function applyHandoffToDraft() {
    var S = store();
    if (!S) return;
    var summary = String(handoffSummary || '').trim();
    var host = root && root.querySelector('[data-ha2-handoff-summary]');
    if (host) summary = String(host.value || '').trim();
    var sel = root && root.querySelector('[data-ha2-handoff-target]');
    var target = sel ? String(sel.value || '').trim() : handoffTargetKind;
    if (!summary) {
      S.setValidationNotice({
        kind: 'handoff_empty',
        message: t('ha2HandoffNeedSummary', '先整理一段任务摘要')
      });
      return;
    }
    if (!target) {
      S.setValidationNotice({
        kind: 'handoff_no_target',
        message: t('ha2HandoffNeedTarget', '先选择要交接的 Agent')
      });
      return;
    }
    var prevDraft = S.getSnapshot && S.getSnapshot().draft;
    var handoffId = 'handoff_' + Date.now().toString(36);
    try {
      S.setHandoffId(handoffId, { silent: true });
      S.setSelected(target, { lock: true, force: true, closePicker: true });
      S.setDraft(summary, { silent: true });
      handoffOpen = false;
      handoffSummary = summary;
      handoffTargetKind = target;
      syncDraftMirrors(summary);
      S.setValidationNotice({
        kind: 'handoff_drafted',
        message: t('ha2HandoffDrafted', '已填入草稿') + ' · ' + target
      });
      // Keep WorkBuddy transcript — do not clear wbChatTurns.
      if (S.emit) {
        /* getSnapshot emit via setValidationNotice */
      }
      paint(S.getSnapshot());
    } catch (e) {
      if (prevDraft != null) S.setDraft(prevDraft, { silent: true });
      S.setValidationNotice({
        kind: 'handoff_failed',
        message: t('ha2HandoffFailed', '交接失败，已保留原对话与草稿')
      });
      paint(S.getSnapshot());
    }
  }

  function situationHtml(snap) {
    var ctx = contextLabels();
    var task = taskVm(snap);
    var atrLive = atrEditPathOn(snap) && atrTaskShouldSurface(snap);
    var banner = primaryBannerHtml(snap);
    // One primary status: ATR / confirm gate beats Soft Pad alert.
    var statusHtml = '';
    if (workConfirmOpen && atrEditPathOn(snap)) {
      statusHtml = workConfirmGateHtml(snap);
    } else if (banner.kind === 'needsYou') {
      statusHtml = banner.html;
    } else if (!atrLive && banner.kind === 'alert') {
      statusHtml = banner.html;
    }
    var taskBlock = atrEditPathOn(snap)
      ? taskCoreHtml(snap) + pillsHtml(snap)
      : '<div class="ha2-task">' +
        '<div class="ha2-task-body">' +
        (task.kicker
          ? '<div class="ha2-task-kicker">' + esc(task.kicker) + '</div>'
          : '') +
        '<h2 class="ha2-task-title">' +
        esc(task.title) +
        '</h2>' +
        (task.sub ? '<p class="ha2-task-sub">' + esc(task.sub) + '</p>' : '') +
        '</div>' +
        '<button type="button" class="ha2-task-menu" data-ha2-menu-picker aria-haspopup="listbox">' +
        esc(task.menu) +
        ' ▾</button></div>' +
        pillsHtml(snap);
    // Matched apps stay in habit hub — no「匹配应用」chrome on home (noise).
    var appIcon =
      ctx.appIcon
        ? '<img class="ha2-ctx-app-icon" src="' +
          esc(ctx.appIcon) +
          '" alt="" width="16" height="16" decoding="async" />'
        : '';
    return (
      '<div class="ha2-situation" data-ha2-situation>' +
      '<div class="ha2-ctx">' +
      '<button type="button" class="ha2-ctx-app" data-ha2-habit-hub title="' +
      esc(ctx.habit || t('ha2OpenHabitHub', '打开习惯')) +
      '">' +
      appIcon +
      '<span class="ha2-ctx-app-name">' +
      esc(ctx.appName) +
      '</span></button></div>' +
      sessionChromeHtml(snap) +
      taskBlock +
      pulseHtml(snap) +
      statusHtml +
      '</div>'
    );
  }

  function currentCat(snap) {
    var S = store();
    var kind = (snap && snap.selectedKind) || '';
    // No inventing targets[0] (often closed Codex) when nothing is selected.
    if (!kind) return { id: '', name: t('ha2PickAgent', '选择 Agent'), appId: '', icon: '' };
    return (S && S.catalog && S.catalog(kind)) || { id: kind, name: kind, appId: '', icon: '' };
  }

  function classifyActionResult(res) {
    var outcome = String((res && res.outcome) || '').toLowerCase();
    var detail = String((res && (res.detail || res.error)) || '');
    var pasteOk = /composer_pasted|chat_pasted/.test(detail);
    if (outcome === 'failed' || outcome === 'fail') {
      return { tier: 'failed', pasteOk: false, detail: detail };
    }
    if (outcome === 'attemptedunverified' || outcome === 'attempted_unverified') {
      return { tier: 'attempted', pasteOk: false, detail: detail };
    }
    if (outcome === 'verified' || outcome === 'ok' || outcome === 'success') {
      return { tier: pasteOk ? 'verified_paste' : 'verified_no_paste', pasteOk: pasteOk, detail: detail };
    }
    // Legacy: detail-only evidence when outcome missing.
    if (pasteOk) return { tier: 'verified_paste', pasteOk: true, detail: detail };
    if (res && outcome && outcome !== 'failed') {
      return { tier: 'attempted', pasteOk: false, detail: detail };
    }
    return { tier: 'failed', pasteOk: false, detail: detail };
  }

  function emptyListHtml(snap) {
    if (snap.loadPhase === 'loading') {
      return (
        '<div class="ha2-empty" data-ha2-phase="loading">' +
        esc(t('ha2LoadingAgents', '正在读取 Agent 会话…')) +
        '</div>'
      );
    }
    if (snap.loadPhase === 'error') {
      return (
        '<div class="ha2-empty" data-ha2-phase="error">' +
        esc(t('ha2LoadFailed', '无法加载 Agent 数据')) +
        ' <button type="button" class="ha2-link" data-ha2-refresh>' +
        esc(t('ha2Retry', '重试')) +
        '</button></div>'
      );
    }
    var stale =
      snap.loadPhase === 'stale'
        ? '<div class="ha2-stale">' + esc(t('ha2ShowingStale', '显示上次可信快照，正在刷新…')) + '</div>'
        : '';
    var hints =
      (store() && store().quietHintLines && store().quietHintLines(3)) || [];
    if (!hints.length && !snap.inventoryLoaded) {
      return (
        stale +
        '<div class="ha2-empty">' +
        esc(t('ha2EmptyAgentsProbing', '会话已同步 · 本机 Agent 探测稍候…')) +
        '</div>'
      );
    }
    var lines = '';
    var hi;
    for (hi = 0; hi < hints.length; hi++) {
      var h = hints[hi];
      if (!h || !h.text) continue;
      lines +=
        '<div class="ha2-quiet-hint" data-kind="' +
        esc(h.kind || 'hist') +
        '">' +
        esc(h.text) +
        '</div>';
    }
    if (!lines) {
      lines =
        '<div class="ha2-quiet-hint" data-kind="help">' +
        esc(t('ha2EmptyHelp', '在底栏选一个 Agent，写一句就能发过去')) +
        '</div>';
    }
    return stale + '<div class="ha2-empty ha2-empty--hints">' + lines + '</div>';
  }

  function rowPrimaryCta(r, snap) {
    var cta = r.primaryCta || 'open';
    // Avoid duplicate approve when the top approve bar already covers this agent.
    var bar = approvalTarget(snap);
    if ((cta === 'approve' || cta === 'navigate') && bar && bar.kind === r.kind) cta = 'open';
    if (cta === 'navigate' || cta === 'approve') {
      return (
        '<button type="button" class="ha2-btn primary ha2-row-cta" data-ha2-go-agent="' +
        esc(r.kind) +
        '" data-agent="' +
        esc(r.agentId || '') +
        '">' +
        esc(t('ha2GoHandle', '前往处理')) +
        '</button>'
      );
    }
    if (cta === 'resume' && can(r.actions, 'session.resume')) {
      return (
        '<button type="button" class="ha2-btn primary ha2-row-cta" data-ha2-action="session.resume" data-agent="' +
        esc(r.agentId) +
        '">' +
        esc(t('ha2Continue', '继续')) +
        '</button>'
      );
    }
    if (cta === 'send' && (r.canSend || can(r.actions, 'agent.focus'))) {
      // Dock owns target pick — list rows open detail instead of「发送到此」.
      return (
        '<button type="button" class="ha2-btn ha2-row-cta" data-ha2-detail="' +
        esc(r.kind) +
        '">' +
        esc(t('ha2View', '查看')) +
        '</button>'
      );
    }
    return (
      '<button type="button" class="ha2-btn ha2-row-cta" data-ha2-detail="' +
      esc(r.kind) +
      '">' +
      esc(t('ha2View', '查看')) +
      '</button>'
    );
  }

  function rowHtml(r, snap) {
    var st = statusTone(r.status);
    var selected = snap && snap.selectedKind === r.kind ? ' is-on' : '';
    var tag = r.tag
      ? '<span class="ha2-row-tag' +
        (r.tagTone ? ' is-' + esc(r.tagTone) : '') +
        '">' +
        esc(r.tag) +
        '</span>'
      : '';
    var S = store();
    var note =
      S && typeof S.rowNoteText === 'function'
        ? S.rowNoteText(r)
        : String(r.line || r.title || '').trim();
    // Plan / file paths belong on the Cursor (etc.) card — not the top-left chrome.
    var docHint = fgDocHintForKind(r.kind);
    if (docHint && (!note || note === docHint || /执行中|等待|可恢复|空闲/.test(note))) {
      note = docHint;
    } else if (docHint && note && note.indexOf(docHint) < 0) {
      note = docHint + ' · ' + note;
    }
    var when = relWhen(r.updated);
    var tier = r.evidenceTier ? ' data-evidence="' + esc(r.evidenceTier) + '"' : '';
    var name = (r.cat && r.cat.name) || r.kind;
    return (
      '<article class="ha2-row' +
      selected +
      '" data-ha2-agent="' +
      esc(r.kind) +
      '"' +
      tier +
      '>' +
      '<button type="button" class="ha2-row-main" data-ha2-detail="' +
      esc(r.kind) +
      '" aria-label="' +
      esc(t('ha2OpenDetail', '打开详情') + ' · ' + name) +
      '">' +
      iconHtml(r.cat) +
      '<div class="ha2-row-body"><div class="ha2-row-title"><i class="ha2-dot ' +
      st +
      '"></i><b>' +
      esc(name) +
      '</b>' +
      tag +
      '</div>' +
      (note ? '<div class="ha2-note">' + esc(note) + '</div>' : '') +
      (when ? '<div class="ha2-when">' + esc(when) + '</div>' : '') +
      (r.boundary
        ? '<div class="ha2-boundary">' + esc(r.boundary) + '</div>'
        : '') +
      '</div></button><div class="ha2-actions">' +
      rowPrimaryCta(r, snap) +
      '</div></article>'
    );
  }

  function workHistoryRowsHtml(snap) {
    var stack = ((snap && snap.agentTaskStack) || []).slice();
    if (!stack.length) return '';
    var activeId =
      snap && snap.agentTask && snap.agentTask.taskId
        ? String(snap.agentTask.taskId)
        : '';
    var out = '';
    var n = 0;
    var i;
    // Fold OneTone ATR stack on home — only the latest task stays expanded.
    for (i = stack.length - 1; i >= 0 && n < 1; i--) {
      var item = stack[i];
      var task = item && item.task;
      if (!task || !task.taskId) continue;
      var id = String(task.taskId);
      var st = String(task.status || '');
      var goal = String(task.goal || '').trim() || t('ha2AtrWorkTask', '当前工作任务');
      var turn = task.currentTurn != null ? task.currentTurn : 0;
      var tag =
        st === 'running' || st === 'verifying' || st === 'repair' || st === 'review'
          ? t('ha2AtrStepN', '第 {n} 步').replace('{n}', String(turn || 0)) + ' · ' + st
          : st || '—';
      var on = activeId && id === activeId ? ' is-on' : '';
      n += 1;
      out +=
        '<article class="ha2-row ha2-atr-history-row' +
        on +
        '" data-ha2-atr-history-row data-atr-task-id="' +
        esc(id) +
        '">' +
        '<button type="button" class="ha2-row-main" data-ha2-atr-open-history="' +
        esc(id) +
        '" aria-label="' +
        esc(t('ha2AtrOpenPage', '查看步骤对话') + ' · ' + goal) +
        '"><div class="ha2-row-body"><div class="ha2-row-title"><i class="ha2-dot ' +
        esc(
          st === 'done'
            ? 'done'
            : st === 'failed' || st === 'interrupted'
              ? 'fail'
              : st === 'waiting'
                ? 'wait'
                : 'live'
        ) +
        '"></i><b>' +
        esc(truncateLabel(goal, 36)) +
        '</b><span class="ha2-row-tag">' +
        esc(tag) +
        '</span></div><div class="ha2-note">' +
        esc(t('ha2AtrHistoryNote', '工作任务 · 点击查看步骤')) +
        '</div></div></button><div class="ha2-actions"><button type="button" class="ha2-btn ha2-row-cta" data-ha2-atr-open-history="' +
        esc(id) +
        '">' +
        esc(t('ha2AtrViewProgress', '查看进度')) +
        '</button></div></article>';
    }
    return out;
  }

  /** Recoverable ATR / archive — lives in the workspace list, not a top notice. */
  function workspaceResumeRowHtml(snap) {
    var runs = (snap && snap.interruptedWorkRuns) || [];
    var task = snap && snap.agentTask;
    var st = task ? String(task.status || '') : '';
    var notice = snap && snap.validationNotice;
    var noticeInterrupted =
      !!(
        notice &&
        (notice.code === 'interrupted' ||
          notice.kind === 'atr_interrupted' ||
          notice.kind === 'atr_archive_interrupted')
      );
    if (!runs.length && st !== 'interrupted' && !noticeInterrupted) return '';
    var goal =
      (task && String(task.goal || '').trim()) ||
      (runs[0] &&
        String(
          runs[0].goal || runs[0].title || runs[0].summary || runs[0].runId || ''
        ).trim()) ||
      (notice && String(notice.message || '').trim()) ||
      t('ha2AtrInterruptedTitle', '编辑任务已中断');
    var n = runs.length || 1;
    var note =
      n > 1
        ? t('ha2ResumeArchiveN', '有 {n} 个可恢复档案 — 恢复或放弃').replace(
            '{n}',
            String(n)
          )
        : t(
            'ha2AtrInterruptedHint',
            '恢复当前任务，或放弃；有新输入时可放弃并发送'
          );
    return (
      '<article class="ha2-row ha2-resume-row" data-ha2-resume-row>' +
      '<div class="ha2-row-main ha2-resume-main">' +
      '<div class="ha2-row-body"><div class="ha2-row-title"><i class="ha2-dot wait" aria-hidden="true"></i><b>' +
      esc(truncateLabel(goal, 42)) +
      '</b><span class="ha2-row-tag is-wait">' +
      esc(t('ha2ResumeTag', '可恢复')) +
      '</span></div><div class="ha2-note">' +
      esc(note) +
      '</div></div></div>' +
      '<div class="ha2-actions ha2-resume-actions">' +
      '<button type="button" class="ha2-btn" data-ha2-atr-resume>' +
      esc(t('ha2AtrResume', '恢复当前任务')) +
      '</button><button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
      esc(t('ha2AtrAbandon', '放弃')) +
      '</button><button type="button" class="ha2-btn primary" data-ha2-atr-abandon-send>' +
      esc(t('ha2AtrAbandonSend', '放弃并发送')) +
      '</button></div></article>'
    );
  }

  function listHtml(snap) {
    // Running / needs Agents first; ATR resume + latest OneTone task fold below.
    var rows = (store() && store().workRows && store().workRows(5)) || [];
    var resume = workspaceResumeRowHtml(snap);
    var history = workHistoryRowsHtml(snap);
    var agentHtml = rows
        .map(function (r) {
          return rowHtml(r, snap);
        })
      .join('');
    if (!rows.length) {
      return resume + history + (history || resume ? '' : emptyListHtml(snap));
    }
    var stale =
      snap.loadPhase === 'stale'
        ? '<div class="ha2-stale">' + esc(t('ha2ShowingStale', '显示上次可信快照，正在刷新…')) + '</div>'
        : '';
    return agentHtml + stale + resume + history;
  }

  /**
   * Agent reported done/completed — observation only, not a verified task receipt.
   * No aria-live: avoid re-announcing on every refresh.
   */
  function completionObservationHtml(snap) {
    // ATR edit has its own progress card — don't stack Codex Soft Pad "完成观察" on top.
    if (atrEditPathOn(snap)) return '';
    var list = (snap && snap.agents) || [];
    var done = null;
    for (var i = 0; i < list.length; i++) {
      if (/done|complet/.test(String(list[i].status || ''))) {
        done = list[i];
        break;
      }
    }
    if (!done) return '';
    return (
      '<div class="ha2-done-receipt ha2-completion-obs" data-ha2-completion-obs>' +
      '<span class="ha2-receipt-mark">·</span><div class="ha2-grow"><b>' +
      esc(t('ha2CompletionObserved', '检测到 Agent 报告完成状态')) +
      '</b><small>' +
      esc((done.cat && done.cat.name) || done.kind) +
      ' · ' +
      esc(t('ha2NoOnetoneVerify', '尚未运行 OneTone 验证')) +
      '</small></div><button type="button" class="ha2-link" data-ha2-detail="' +
      esc(done.kind) +
      '">' +
      esc(t('ha2View', '查看')) +
      '</button></div>'
    );
  }

  /** @deprecated use completionObservationHtml */
  function doneReceiptHtml(snap) {
    return completionObservationHtml(snap);
  }

  function validationNoticeHtml(snap) {
    var n = snap && snap.validationNotice;
    if (!n) return '';
    var atrCode = n.code ? String(n.code) : '';
    // Recoverable / interrupted CTAs live in workspaceResumeRowHtml.
    if (
        atrCode === 'interrupted' ||
      n.kind === 'atr_interrupted' ||
      n.kind === 'atr_archive_interrupted'
    ) {
      return '';
    }
    // Live ATR: pills + work page own progress — skip atr_* home notices.
    if (
      atrEditPathOn(snap) &&
      atrTaskShouldSurface(snap) &&
      (String(n.kind || '').indexOf('atr_') === 0 ||
        atrCode === 'waiting' ||
        atrCode === 'busy' ||
        atrCode === 'driving' ||
        atrCode === 'starting')
    ) {
      return '';
    }
    var isWbCfg = n.kind === 'wb_no_account';
    var isAssistFail = n.kind === 'assist_failed' || n.kind === 'assist_missing';
    var reason = n.reason ? String(n.reason) : '';
    var hint = t('ha2ValidationHint', '尚未尝试投递');
    if (isWbCfg) {
      hint = t('ha2WbNeedAccountHint', '账号与 Key 只在 Agent 页管理');
    } else if (isAssistFail) {
      hint = reason
        ? t('ha2AssistReasonCode', '原因码') + ': ' + reason
        : t('ha2AssistCanDirectSend', '整理失败不影响直接发送原稿');
    } else if (n.kind === 'consult') {
      hint = t('ha2ConsultConfirmHint', '请在下方会诊记录点「理解正确」');
    } else if (
      atrCode === 'workbuddy_unconfigured' ||
      atrCode === 'provider_unconfigured' ||
      atrCode === 'deepseek_unconfigured' ||
      /_unconfigured$/.test(atrCode)
    ) {
      hint = t(
        'ha2AtrNeedModel',
        '登录 WorkBuddy 用账号模型编辑；Soft Pad 密钥为次选'
      );
    } else if (atrCode === 'need_project') {
      hint = t('ha2AtrNeedProjectHint', '在工作区确认当前项目后重试');
    } else if (atrCode === 'abandon_and_send') {
      hint = t('ha2AtrAbandonSendHint', '旧任务会先结束，再按当前输入启动新编辑');
    } else if (atrCode === 'provider_recommend') {
      hint = t(
        'ha2AtrRecommendHint',
        '不会后台改写已选引擎；点「使用推荐」或自行选择'
      );
    } else if (atrCode === 'provider_stale') {
      hint = t(
        'ha2AtrProviderStaleHint',
        '保留你的选择直至你确认更换；可登录 WorkBuddy 或改选 Soft Pad'
      );
    } else if (atrCode === 'starting' || atrCode === 'driving') {
      hint = t('ha2AtrDrivingHint', '后台在跑工具循环 — 可放弃；成功后会出现补丁确认');
    } else if (atrCode === 'waiting') {
      hint = t(
        'ha2AtrWaitingHint',
        '批准/拒绝补丁，或放弃；有新输入时可放弃并发送'
      );
    } else if (atrCode === 'interrupted') {
      hint = t(
        'ha2AtrInterruptedHint',
        '恢复当前任务，或放弃；有新输入时可放弃并发送'
      );
    } else if (
      atrCode === 'edit_not_admitted' ||
      atrCode === 'provider_not_edit_capable'
    ) {
      hint = t(
        'ha2AtrEditNotAdmittedHint',
        '普通编辑需先在隔离沙箱验证当前引擎配置'
      );
    } else if (atrCode === 'budget_exhausted' || atrCode === 'drive_failed') {
      hint = t('ha2AtrBudgetHint', '这不是投递失败 — 写清目标后重发，或放弃后重试');
    } else if (atrCode === 'provider_stream' || atrCode === 'controller_required') {
      hint = t(
        'ha2AtrRecoverHint',
        '这不是最终结果失败 — 请点恢复继续，或放弃后重试'
      );
    } else if (atrCode === 'format_error') {
      hint = t(
        'ha2AtrFormatHint',
        '请选用已登录的 WorkBuddy，或已配置密钥的 Soft Pad 引擎'
      );
    } else if (String(n.kind || '').indexOf('atr_') === 0) {
      hint = t('ha2AtrFailHint', '编辑任务未完成（≠ 投递）');
    }
    var cta = '';
    if (isWbCfg) {
      cta =
        '<button type="button" class="ha2-btn" data-ha2-open-wb-config>' +
        esc(t('ha2WbGoConfig', '去配置')) +
        '</button>';
    } else if (isAssistFail && (reason === 'no_key' || reason === 'missing_key')) {
      // Dock no longer keeps a permanent「密钥」link — surface only when organize needs it.
      cta =
        '<button type="button" class="ha2-btn primary" data-ha2-assist-keys>' +
        esc(t('ha2AssistKeysShort', '密钥')) +
        '</button>';
    } else if (
      reason === 'no_key' ||
      atrCode === 'deepseek_unconfigured' ||
      atrCode === 'provider_unconfigured' ||
      atrCode === 'workbuddy_unconfigured' ||
      /_unconfigured$/.test(atrCode)
    ) {
      cta =
        '<button type="button" class="ha2-btn primary" data-ha2-atr-wb-login-open>' +
        esc(t('ha2AtrWbLoginCta', '登录 WorkBuddy')) +
        '</button>';
    } else if (reason === 'no_free_model') {
      cta =
        '<button type="button" class="ha2-btn" data-ha2-enable-metered>' +
        esc(t('ha2AllowMetered', '允许计量额度')) +
        '</button>';
    } else if (
      atrCode === 'provider_recommend' ||
      atrCode === 'edit_not_admitted' ||
      atrCode === 'provider_not_edit_capable'
    ) {
      cta =
        (atrCode === 'provider_recommend'
          ? '<button type="button" class="ha2-btn primary" data-ha2-atr-accept-recommend>' +
            esc(t('ha2AtrUseRecommend', '使用推荐')) +
            '</button>'
          : '') +
        '<button type="button" class="ha2-btn' +
        (atrCode === 'edit_not_admitted' ||
        atrCode === 'provider_not_edit_capable'
          ? ' primary'
          : '') +
        '" data-ha2-atr-verify-engine>' +
        esc(t('ha2AtrVerifyCta', '隔离验证')) +
        '</button>';
    } else if (atrCode === 'provider_stale') {
      cta =
        '<button type="button" class="ha2-btn primary" data-ha2-atr-wb-login-open>' +
        esc(t('ha2AtrWbLoginCta', '登录 WorkBuddy')) +
        '</button><button type="button" class="ha2-btn" data-ha2-atr-switch-deepseek>' +
        esc(t('ha2AtrSwitchDeepseek', '改用 DeepSeek')) +
        '</button>';
    } else if (atrCode === 'waiting') {
      cta =
        '<button type="button" class="ha2-btn" data-ha2-atr-continue>' +
        esc(t('ha2AtrContinueTask', '继续当前任务')) +
        '</button><button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
        esc(t('ha2AtrAbandon', '放弃')) +
        '</button><button type="button" class="ha2-btn primary" data-ha2-atr-abandon-send>' +
        esc(t('ha2AtrAbandonSend', '放弃并发送')) +
        '</button>';
    } else if (atrCode === 'interrupted') {
      cta =
        '<button type="button" class="ha2-btn" data-ha2-atr-resume>' +
        esc(t('ha2AtrResume', '恢复当前任务')) +
        '</button><button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
        esc(t('ha2AtrAbandon', '放弃')) +
        '</button><button type="button" class="ha2-btn primary" data-ha2-atr-abandon-send>' +
        esc(t('ha2AtrAbandonSend', '放弃并发送')) +
        '</button>';
    } else if (
      atrCode === 'provider_stream' ||
      atrCode === 'controller_required'
    ) {
      cta =
        '<button type="button" class="ha2-btn primary" data-ha2-atr-resume>' +
        esc(t('ha2AtrResume', '恢复当前任务')) +
        '</button><button type="button" class="ha2-btn" data-ha2-atr-open-page>' +
        esc(t('ha2AtrViewProgress', '查看进度')) +
        '</button><button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
        esc(t('ha2AtrAbandon', '放弃')) +
        '</button>';
    } else if (
      atrCode === 'busy' ||
      atrCode === 'driving' ||
      atrCode === 'starting' ||
      atrCode === 'budget_exhausted' ||
      atrCode === 'drive_failed' ||
      atrCode === 'format_error'
    ) {
      cta =
        (atrCode === 'busy' || atrCode === 'driving' || atrCode === 'starting'
          ? '<button type="button" class="ha2-btn primary" data-ha2-atr-open-page>' +
            esc(t('ha2AtrViewProgress', '查看进度')) +
            '</button>'
          : '') +
        '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
        esc(t('ha2AtrAbandon', '放弃')) +
        '</button>';
    }
    return (
      '<div class="ha2-receipt ha2-validation-notice" data-receipt-kind="validation"' +
      (reason ? ' data-assist-reason="' + esc(reason) + '"' : '') +
      (atrCode ? ' data-atr-code="' + esc(atrCode) + '"' : '') +
      '>' +
      '<span class="ha2-receipt-mark">!</span><div class="ha2-grow"><b>' +
      esc(n.message || t('ha2NeedProject', '先选定项目')) +
      '</b><small>' +
      esc(hint) +
      '</small></div>' +
      cta +
      '</div>'
    );
  }

  /** Delivery attempt outcome — never labeled「已发送」. */
  function deliveryReceiptHtml(snap) {
    var receipt = snap && (snap.deliveryReceipt || snap.receipt);
    if (!receipt) return '';
    var failed = receipt.phase === 'failed' || receipt.outcome === 'failed';
    var sending =
      receipt.phase === 'sending' || receipt.outcome === 'delivery_attempt';
    var mark = sending ? '…' : failed ? '!' : '✓';
    var snapId = receipt.snapshotId ? String(receipt.snapshotId) : '';
    var snapLine = snapId
      ? ' · snapshotId ' + snapId
      : '';
    return (
      '<div class="ha2-receipt ha2-delivery-receipt" data-phase="' +
      esc(receipt.phase || receipt.outcome || '') +
      '" data-receipt-kind="delivery" data-outcome="' +
      esc(receipt.outcome || '') +
      '"' +
      (snapId ? ' data-snapshot-id="' + esc(snapId) + '"' : '') +
      '><span class="ha2-receipt-mark">' +
      mark +
      '</span><div class="ha2-grow"><b>' +
      esc(receipt.title) +
      '</b><small>' +
      esc(receipt.message || '') +
      (receipt.message ? ' · ' : '') +
      esc(t('ha2DeliveryReceiptHint', '投递回执')) +
      esc(snapLine) +
      '</small></div>' +
      (failed
        ? '<button type="button" class="ha2-btn" data-ha2-retry>' +
          esc(t('ha2Retry', '重试')) +
          '</button>'
        : '') +
      '</div>'
    );
  }

  function actionReceiptHtml(snap) {
    var receipt = snap && snap.actionReceipt;
    if (!receipt) return '';
    var failed = receipt.outcome === 'failed';
    var verified = receipt.outcome === 'verified';
    var mark = receipt.phase === 'sending' ? '…' : failed ? '!' : verified ? '✓' : '·';
    return (
      '<div class="ha2-receipt ha2-action-receipt" data-receipt-kind="action" data-outcome="' +
      esc(receipt.outcome || '') +
      '"><span class="ha2-receipt-mark">' +
      mark +
      '</span><div class="ha2-grow"><b>' +
      esc(receipt.title || '') +
      '</b><small>' +
      esc(receipt.message || '') +
      (receipt.message ? ' · ' : '') +
      esc(t('ha2ActionReceiptHint', '操作回执（≠ 任务完成）')) +
      '</small></div></div>'
    );
  }

  /** @deprecated use deliveryReceiptHtml */
  function receiptHtml(snap) {
    return deliveryReceiptHtml(snap);
  }

  /**
   * Mac WorkbenchHomeView scroll: perm? → ctx/task/pills/pulse/approve →
   * done receipt → delivery receipt → rows. Draft lives only in Dock.
   */
  function permissionHtml(snap) {
    var mode = snap.mode || (snap.focusVm && snap.focusVm.mode) || 'quiet';
    var deliv = snap.deliveryReceipt || snap.receipt;
    var need =
      mode === 'degraded' ||
      snap.loadPhase === 'error' ||
      (deliv &&
        (deliv.phase === 'failed' || deliv.outcome === 'failed') &&
        /权限|permission|access/i.test(String(deliv.message || '')));
    if (!need) return '';
    var S = store();
    var c = currentCat(snap);
    var win = S && S.windowsLabel ? S.windowsLabel(c.id) : '';
    var hint =
      mode === 'degraded'
        ? degradedNextHint(snap)
        : t('ha2PermHint', '需要权限才能向 Agent 投递文本');
    return (
      '<div class="ha2-permission" data-ha2-mode="' +
      esc(mode) +
      '"><span>' +
      esc(hint) +
      (win ? ' · ' + esc(win) : '') +
      '</span><button type="button" class="ha2-btn" data-ha2-refresh>' +
      esc(t('ha2Redetect', '重新检测')) +
      '</button></div>'
    );
  }

  function tmWorkspaceRaw(snap) {
    var tm = snap && snap.timeMachine;
    return tm && (tm.workspace || tm.workspacePath || tm.workspace_path)
      ? String(tm.workspace || tm.workspacePath || tm.workspace_path)
      : '';
  }

  function tmChangedCount(snap) {
    var tm = snap && snap.timeMachine;
    return Number((tm && (tm.changedCount != null ? tm.changedCount : tm.changed_count)) || 0);
  }

  function targetPathMatchedTm(snap) {
    var ctx = snap && snap.targetContext;
    var S = store();
    if (!ctx || !ctx.projectPath) return false;
    if (ctx.tmWorkspaceMatched) return true;
    if (S && S.pathsEqual) return S.pathsEqual(ctx.projectPath, tmWorkspaceRaw(snap));
    var PP = global.OneToneProjectPath;
    return !!(PP && PP.pathsEqual && PP.pathsEqual(ctx.projectPath, tmWorkspaceRaw(snap)));
  }

  /** Compact title-bar chip — replaces the old full-width workspace card. */
  function workspaceTitleChipHtml(snap) {
    var tm = snap && snap.timeMachine;
    var path = tmWorkspaceRaw(snap);
    var leaf = '';
    var PP = global.OneToneProjectPath;
    if (PP && PP.pathLeaf) leaf = PP.pathLeaf(path) || '';
    else if (path) {
      var parts = path.replace(/[\\/]+$/, '').split(/[\\/]/);
      leaf = parts[parts.length - 1] || path;
    }
    var isGit = !!(tm && (tm.isGit === true || tm.is_git === true));
    var block = tm && (tm.blockReason || tm.block_reason);
    var changed = tmChangedCount(snap);
    var ctx = snap && snap.targetContext;
    var homePath =
      (ctx && ctx.projectPath) || (snap.session && snap.session.projectPath) || '';
    var name = leaf || '';
    if (homePath) {
      var homeLeaf = '';
      if (PP && PP.pathLeaf) homeLeaf = PP.pathLeaf(homePath) || '';
      else {
        var hp = String(homePath).replace(/[\\/]+$/, '').split(/[\\/]/);
        homeLeaf = hp[hp.length - 1] || homePath;
      }
      if (homeLeaf) name = homeLeaf;
    }
    if (!name && !homePath && !path) return '';
    var tag = t('ha2TmClean', '干净');
    var tagTone = '';
    if (!tm && !homePath) {
      tag = t('ha2TmLoadingTag', '读取中');
    } else if (block && (!homePath || targetPathMatchedTm(snap))) {
      tag = t('ha2TmNeedsAttention', '需处理');
      tagTone = ' is-wait';
    } else if (!isGit && path && targetPathMatchedTm(snap)) {
      tag = t('ha2TmUnprotected', '未保护');
      tagTone = ' is-wait';
    } else if (changed > 0 && (!path || targetPathMatchedTm(snap) || homePath)) {
      tag = changed + t('ha2WorkspaceChangesShort', ' 改动');
      tagTone = ' is-run';
    }
    var label = (name || t('ha2TmLabel', '工作区')) + ' · ' + tag;
    return (
      '<button type="button" class="ha2-ws-chip' +
      tagTone +
      '" data-ha2-tm data-ha2-ws-chip title="' +
      esc(t('ha2OpenProjectTimeline', '打开项目时间线')) +
      '">' +
      esc(label) +
      '</button>'
    );
  }

  /** @deprecated name kept for tests — chip lives in the section head now. */
  function workspaceCapsuleRowHtml(snap) {
    return workspaceTitleChipHtml(snap);
  }

  function openTimeCapsule() {
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    var ctx = snap && snap.targetContext;
    var session = snap && snap.session;
    var Caps = global.OneToneHomeAgentCapabilities;
    // Prefer home-confirmed project — TM current workspace may be a different folder.
    var ws =
      Caps && Caps.resolveHomeTimelineWorkspace
        ? Caps.resolveHomeTimelineWorkspace({
            projectPath:
              (ctx && ctx.projectPath) || (session && session.projectPath) || null,
            tmWorkspace: tmWorkspaceRaw(snap)
          })
        : (ctx && ctx.projectPath) ||
          (session && session.projectPath) ||
          tmWorkspaceRaw(snap) ||
          '';
    ws = String(ws || '').trim();
    var Nav = global.OneToneAgentNavTarget;
    if (Nav && typeof Nav.open === 'function') {
      if (Nav.open({ view: 'capsule', workspace: ws || null })) return;
    }
    var Drawer = global.OneToneSettingsDrawer;
    if (Drawer && typeof Drawer.open === 'function') {
      try {
        Drawer.open({
          panel: 'agent',
          agentSub: 'capsule',
          tmWorkspace: ws || undefined
        });
      } catch (_) {}
    }
  }

  /** ATR card / conflict owns the page — don't stack Soft Pad done + delivery + twin atr notices. */
  function atrOwnsHomeChrome(snap) {
    if (atrEditPathOn(snap)) return true;
    if (snap && snap.atrSendConflict) return true;
    // Chat tool-loop owns transcript chrome — don't treat it as edit ATR home ownership.
    if (
      snap &&
      snap.agentTask &&
      atrTaskShouldSurface(snap) &&
      !atrIsChatLoopTask(snap.agentTask)
    ) {
      return true;
    }
    var n = snap && snap.validationNotice;
    if (n && String(n.kind || '').indexOf('atr_') === 0) return true;
    return false;
  }

  /** One home notice slot: validation > delivery > action > completion. */
  function homeNoticeHtml(snap) {
    if (atrOwnsHomeChrome(snap)) {
      return validationNoticeHtml(snap) || '';
    }
    return (
      validationNoticeHtml(snap) ||
      deliveryReceiptHtml(snap) ||
      actionReceiptHtml(snap) ||
      completionObservationHtml(snap) ||
      ''
    );
  }

  function homeContentHtml(snap) {
    var atrLive = atrEditPathOn(snap) && atrTaskShouldSurface(snap);
    var banner = primaryBannerHtml(snap);
    // Mutual exclusion: ATR / confirm / needsYou > permission > single notice.
    var permOnly = '';
    if (!atrLive && !workConfirmOpen && banner.kind !== 'needsYou') {
      permOnly =
        banner.kind === 'permission' ? banner.html : permissionHtml(snap);
    }
    return (
      permOnly +
      situationHtml(snap) +
      '<div class="ha2-home-notice" data-ha2-home-notice role="status" aria-live="polite" aria-atomic="true">' +
      homeNoticeHtml(snap) +
      '</div>' +
      '<div class="ha2-section-head"><h3>' +
      esc(t('ha2Workspace', '任务与会话')) +
      '</h3>' +
      workspaceTitleChipHtml(snap) +
      '</div><div class="ha2-list" data-ha2-list>' +
      listHtml(snap) +
      '</div>'
    );
  }

  function freemodelChannelsApi() {
    return global.OneToneFreemodelChannels || null;
  }

  function freemodelTokenCapture(ch) {
    var FM = freemodelChannelsApi();
    if (FM && FM.tokenCaptureOf) return FM.tokenCaptureOf(ch);
    if (!ch) return 'none';
    if (ch.tokenCapture) return ch.tokenCapture;
    if (ch.authKind === 'oauth') return 'oauth_poll';
    if (ch.authKind === 'paste_key') return 'paste_key';
    return 'none';
  }

  function freemodelCheckinCtaLabel(ch, cap) {
    var FM = freemodelChannelsApi();
    if (FM && FM.connectCtaLabel) return FM.connectCtaLabel(ch, cap);
    if (!ch) return '';
    if (cap && cap.state === 'ready') return t('ha2FmReady', '已可用');
    if (ch.id === 'workbuddy' && cap && cap.wbPhase === 'no_models') {
      return t('ha2FmWbRefresh', '刷新模型');
    }
    var kind = (FM && FM.connectKindOf && FM.connectKindOf(ch)) || ch.connectKind || '';
    if (kind === 'one_tap') return t('ha2FmCtaOneTap', '一键启用');
    if (optsSiteLoginCta(ch)) return t('ha2FmCtaOpenSite', '打开登录页');
    return t('ha2FmCtaOauth', '登录开通');
  }

  function optsSiteLoginCta(ch) {
    return !!(ch && ch.authKind === 'browser_checkin');
  }

  function freemodelChannelIcon(ch) {
    var meta = modelBrandMeta((ch && (ch.id + ' ' + ch.label)) || '');
    return MODEL_BRAND_ICON_BASE + meta.icon;
  }

  /**
   * Freemodel rows. Default = connectChannels (connectOrder).
   * opts.siteOnly = vendor-site quota only (kept for browser_checkin; not shown in modal).
   * Ready lanes collapse to one icon row (no duplicate「已可用」button).
   */
  function freemodelCheckinCardsHtml(opts) {
    opts = opts || {};
    var siteOnly = !!opts.siteOnly;
    var FM = freemodelChannelsApi();
    if (!FM) return '';
    var rows = siteOnly
      ? FM.channels
        ? FM.channels({ siteOnly: true })
        : []
      : FM.connectChannels
        ? FM.connectChannels()
        : FM.channels
          ? FM.channels({ chatCapable: true })
          : [];
    if (!rows.length) return '';
    return rows
      .map(function (ch) {
        var ctx = freemodelCapCtx(ch);
        var cap =
          FM.resolveCapability ? FM.resolveCapability(ch, ctx) : { state: 'unconfigured', label: '未开通' };
        var summary = FM.summaryLine ? FM.summaryLine(ch, cap) : cap.label;
        var cta = freemodelCheckinCtaLabel(ch, cap);
        var kind =
          (FM.connectKindOf && FM.connectKindOf(ch)) || ch.connectKind || '';
        var tok = freemodelTokenCapture(ch);
        var showPaste =
          !siteOnly &&
          (kind === 'paste_key' || tok === 'paste_key' || kind === 'one_tap');
        var isReady = cap.state === 'ready';
        var needWbRefresh =
          ch.id === 'workbuddy' && (cap.wbPhase === 'no_models' || !isReady);
        var pasteHidden = kind === 'one_tap' || isReady;
        var pasteBlock = showPaste
          ? '<div class="ha2-fm-paste" data-fm-paste-host="' +
            esc(ch.id) +
            '"' +
            (pasteHidden ? ' hidden' : '') +
            '>' +
            '<label class="ha2-fm-field">' +
            esc(t('ha2FmPasteLabel', 'Token / API Key')) +
            '<input type="password" autocomplete="new-password" data-fm-paste-key="' +
            esc(ch.id) +
            '" placeholder="' +
            esc(t('ha2FmPastePh', '粘贴后保存开通')) +
            '"></label>' +
            '<button type="button" class="ha2-btn primary ha2-fm-row-cta" data-fm-paste-save="' +
            esc(ch.id) +
            '">' +
            esc(t('ha2FmPasteSave', '保存并选用')) +
            '</button></div>'
          : '';
        var pasteReveal =
          showPaste && kind === 'one_tap' && !isReady
            ? '<button type="button" class="ha2-btn ha2-fm-ghost" data-fm-paste-reveal="' +
              esc(ch.id) +
              '">' +
              esc(t('ha2FmPasteReveal', '填写 API Key')) +
              '</button>'
            : '';
        var loomySms =
          ch.id === 'loomy' && !isReady
            ? '<div class="ha2-fm-sms" data-loomy-sms-host>' +
              '<label class="ha2-fm-field">' +
              esc(t('ha2FmLoomyPhone', '手机号')) +
              '<input type="tel" inputmode="numeric" autocomplete="tel" maxlength="11" data-loomy-phone placeholder="11 位手机号"></label>' +
              '<label class="ha2-fm-field">' +
              esc(t('ha2FmLoomyCode', '验证码')) +
              '<input type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" data-loomy-code placeholder="短信验证码"></label>' +
              '<input type="hidden" data-loomy-msgid value="">' +
              '<div class="ha2-fm-card-acts">' +
              '<button type="button" class="ha2-btn" data-loomy-sms-send>' +
              esc(t('ha2FmLoomySend', '发送验证码')) +
              '</button>' +
              '<button type="button" class="ha2-btn primary" data-loomy-sms-login>' +
              esc(t('ha2FmLoomyLogin', '登录开通')) +
              '</button></div></div>'
            : '';
        var raccoonQr =
          ch.id === 'raccoon' && !isReady
            ? '<div class="ha2-fm-qr" data-raccoon-qr-host hidden>' +
              '<p class="ha2-model-provider-hint">' +
              esc(t('ha2FmRaccoonQrHint', '请用微信扫一扫下方二维码（不要用浏览器打开）')) +
              '</p>' +
              '<div class="ha2-fm-qr-frame" data-raccoon-qr-svg></div></div>'
            : '';
        var stateClass =
          isReady
            ? ' is-ready'
            : cap.state === 'connecting'
              ? ' is-connecting'
              : cap.state === 'error'
                ? ' is-error'
                : '';
        var wbPhaseAttr =
          ch.id === 'workbuddy' && cap.wbPhase
            ? ' data-fm-wb-phase="' + esc(cap.wbPhase) + '"'
            : '';
        var icon = freemodelChannelIcon(ch);
        var primaryCta = '';
        if (ch.id === 'loomy' && !isReady) {
          primaryCta = '';
        } else if (isReady && !needWbRefresh) {
          primaryCta = '';
        } else {
          primaryCta =
            '<button type="button" class="ha2-btn primary ha2-fm-row-cta" data-fm-checkin="' +
            esc(ch.id) +
            '">' +
            esc(cta) +
            '</button>';
        }
        var sub =
          isReady
            ? ''
            : esc(ch.freeQuota || (siteOnly ? '' : summary) || '');
        return (
          '<div class="ha2-fm-card ha2-fm-connect' +
          stateClass +
          (siteOnly ? ' is-site' : '') +
          '" data-fm-card="' +
          esc(ch.id) +
          '" data-fm-cap="' +
          esc(cap.state) +
          '"' +
          wbPhaseAttr +
          '>' +
          '<div class="ha2-fm-card-hd">' +
          '<div class="ha2-fm-card-title">' +
          '<img class="ha2-fm-ico" src="' +
          esc(icon) +
          '" alt="" width="20" height="20" decoding="async">' +
          '<div class="ha2-fm-card-copy"><b>' +
          esc(ch.label) +
          '</b>' +
          (sub ? '<span class="ha2-fm-quota-inline">' + sub + '</span>' : '') +
          '</div></div>' +
          '<span class="ha2-fm-state">' +
          esc(isReady ? t('ha2FmReady', '已可用') : summary) +
          '</span></div>' +
          (primaryCta || pasteReveal
            ? '<div class="ha2-fm-card-acts">' + primaryCta + pasteReveal + '</div>'
            : '') +
          loomySms +
          raccoonQr +
          '<p class="ha2-fm-login-status" data-fm-login-status="' +
          esc(ch.id) +
          '" hidden></p>' +
          pasteBlock +
          '</div>'
        );
      })
      .join('');
  }

  /** Upsert OpenAI-compatible freemodel channel into model_provider + optional key. */
  function upsertFreemodelProvider(ch, apiKey) {
    if (!ch || !ch.baseUrl) {
      return Promise.reject(new Error('no_base_url'));
    }
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    var key = apiKey == null ? '' : String(apiKey).trim();
    return ipc
      .invoke('cmd_model_provider_upsert', {
        args: {
          id: ch.id,
          name: ch.label || ch.id,
          protocol: 'openai_compatible',
          baseUrl: ch.baseUrl,
          model: ch.defaultModel || 'default',
          enabled: true,
          timeoutMs: 60000,
          supportsJson: true,
          supportsStreaming: false,
          supportsTools: false
        }
      })
      .then(function () {
        if (!key) {
          // Kilo anonymous free — sentinel so chat may omit Authorization.
          if (ch.id === 'kilo') {
            return ipc.invoke('cmd_model_provider_set_key', {
              args: { providerId: ch.id, apiKey: 'anonymous' }
            });
          }
          return null;
        }
        return ipc.invoke('cmd_model_provider_set_key', {
          args: { providerId: ch.id, apiKey: key }
        });
      });
  }

  function afterFreemodelProviderReady(channelId) {
    var FM = freemodelChannelsApi();
    if (FM && FM.markChecked) {
      FM.markChecked(channelId, { status: 'ok', note: 'provider_ready' });
    }
    if (FM && FM.setConnectState) FM.setConnectState(channelId, 'ready');
    if (FM && FM.setEnabled) FM.setEnabled(channelId, true);
    var gateway = global.OneToneModelGateway;
    var refresh = gateway && gateway.refreshCustomProviders
      ? gateway.refreshCustomProviders()
      : Promise.resolve();
    return refresh.then(function () {
      if (gateway && gateway.setRoute) {
        ['intent', 'planning', 'review', 'repair', 'synthesis'].forEach(function (p) {
          gateway.setRoute(p, channelId);
        });
      }
      if (!mounted || !root) return;
      var host = root.querySelector('[data-ha2-model-route-host]');
      if (host) host.removeAttribute('data-sig');
      syncModeChrome(store() && store().getSnapshot && store().getSnapshot());
    });
  }

  function stopZenOauthPoll() {
    if (zenOauthPollTimer) {
      try {
        global.clearTimeout(zenOauthPollTimer);
      } catch (_) {}
      zenOauthPollTimer = 0;
    }
  }

  function markZenOauthFail(errMsg) {
    var FM = freemodelChannelsApi();
    if (FM && FM.setConnectState) {
      FM.setConnectState('opencode_zen', 'error', {
        error: String(errMsg || 'oauth_fail')
      });
    }
  }

  function finishZenOauthOk(messageFn) {
    stopZenOauthPoll();
    zenOauthBusy = false;
    zenOauthPendingId = '';
    zenOauthStatus = '';
    var msg = messageFn || function () {};
    msg(t('ha2FmZenOk', '已登录 OpenCode Zen — 可在模型列表选用'));
    return afterFreemodelProviderReady('opencode_zen').then(function () {
      toast(t('ha2FmZenOk', '已登录 OpenCode Zen — 可在模型列表选用'));
    });
  }

  function pollZenOauth(pendingId, messageFn) {
    if (!pendingId || pendingId !== zenOauthPendingId) return;
    var msg = messageFn || function () {};
    invoke('cmd_opencode_zen_oauth_poll', { pendingId: pendingId })
      .then(function (res) {
        if (pendingId !== zenOauthPendingId) return;
        var st = res && res.status;
        if (st === 'ok') {
          return finishZenOauthOk(msg);
        }
        if (st === 'fail' || st === 'expired') {
          stopZenOauthPoll();
          zenOauthBusy = false;
          zenOauthPendingId = '';
          zenOauthStatus = st === 'expired' ? 'expired' : 'fail';
          var failLine =
            st === 'expired'
              ? t('ha2AtrWbLoginExpired', '登录超时，请重试')
              : t('ha2AtrWbLoginFail', '登录失败，请重试');
          markZenOauthFail(failLine);
          msg(failLine);
          return;
        }
        zenOauthStatus = 'pending';
        msg(t('ha2FmZenPending', '请在浏览器完成 OpenCode 登录…'));
        zenOauthPollTimer = global.setTimeout(function () {
          pollZenOauth(pendingId, messageFn);
        }, 2000);
      })
      .catch(function () {
        if (pendingId !== zenOauthPendingId) return;
        stopZenOauthPoll();
        zenOauthBusy = false;
        zenOauthPendingId = '';
        zenOauthStatus = 'fail';
        var failLine = t('ha2AtrWbLoginFail', '登录失败，请重试');
        markZenOauthFail(failLine);
        msg(failLine);
      });
  }

  function startOpencodeZenOauth(messageFn) {
    var msg = messageFn || function (s) {
      toast(s);
    };
    if (zenOauthBusy) return;
    stopZenOauthPoll();
    zenOauthBusy = true;
    zenOauthStatus = 'pending';
    var FM = freemodelChannelsApi();
    if (FM && FM.setConnectState) FM.setConnectState('opencode_zen', 'connecting');
    msg(t('ha2FmLoginWaiting', '已打开登录页，等待授权…（最长约 10 分钟）'));
    invoke('cmd_opencode_zen_oauth_start', {})
      .then(function (res) {
        var pendingId = res && res.pendingId ? String(res.pendingId) : '';
        var userCode = res && res.userCode ? String(res.userCode) : '';
        if (!pendingId) {
          zenOauthBusy = false;
          zenOauthStatus = 'fail';
          var noPending = t('ha2AtrWbLoginFail', '登录失败，请重试');
          markZenOauthFail(noPending);
          msg(noPending);
          return;
        }
        // Rust already opened verification_uri_complete once — do not open again
        // (second tab can race and show「Unable to verify this device code」).
        zenOauthPendingId = pendingId;
        msg(
          t('ha2FmZenCodeHint', '请在浏览器登录 OpenCode 并点 Authorize') +
            (userCode ? ' · 验证码 ' + userCode : '') +
            ' · ' +
            t('ha2FmLoginWaiting', '等待授权…（最长约 10 分钟）')
        );
        pollZenOauth(pendingId, messageFn);
      })
      .catch(function (err) {
        zenOauthBusy = false;
        zenOauthPendingId = '';
        zenOauthStatus = 'fail';
        var detail = String((err && err.message) || err || 'oauth_start_failed');
        // Do not open bare /console/device without a device code — page will fail verify.
        var failLine =
          t(
            'ha2FmZenIpcFail',
            '无法启动 OpenCode 设备登录（需本机后端；无需另装 CLI）。请重启应用后重试。'
          ) +
          ' · ' +
          detail;
        markZenOauthFail(detail);
        msg(failLine);
      });
  }

  var raccoonOauthBusy = false;
  var raccoonOauthPendingId = '';
  var raccoonOauthPollTimer = 0;

  function stopRaccoonOauthPoll() {
    if (raccoonOauthPollTimer) {
      try {
        global.clearTimeout(raccoonOauthPollTimer);
      } catch (_) {}
      raccoonOauthPollTimer = 0;
    }
  }

  function markRaccoonOauthFail(errMsg) {
    var FM = freemodelChannelsApi();
    if (FM && FM.setConnectState) {
      FM.setConnectState('raccoon', 'error', {
        error: String(errMsg || 'oauth_fail')
      });
    }
  }

  function pollRaccoonOauth(pendingId, messageFn) {
    if (!pendingId || pendingId !== raccoonOauthPendingId) return;
    var msg = messageFn || function () {};
    invoke('cmd_raccoon_oauth_poll', { pendingId: pendingId })
      .then(function (res) {
        if (pendingId !== raccoonOauthPendingId) return;
        var st = res && res.status;
        if (st === 'ok') {
          stopRaccoonOauthPoll();
          raccoonOauthBusy = false;
          raccoonOauthPendingId = '';
          hideRaccoonQr();
          msg(t('ha2FmRaccoonOk', '已登录 Raccoon — 可在模型列表选用'));
          return afterFreemodelProviderReady('raccoon').then(function () {
            toast(t('ha2FmRaccoonOk', '已登录 Raccoon — 可在模型列表选用'));
          });
        }
        if (st === 'fail' || st === 'expired') {
          stopRaccoonOauthPoll();
          raccoonOauthBusy = false;
          raccoonOauthPendingId = '';
          hideRaccoonQr();
          var failLine =
            st === 'expired'
              ? t('ha2FmRaccoonExpired', '二维码已过期，请重新点「登录开通」')
              : t('ha2AtrWbLoginFail', '登录失败，请重试');
          markRaccoonOauthFail(failLine);
          msg(failLine);
          return;
        }
        msg(t('ha2FmRaccoonPending', '请用微信扫一扫卡片内二维码…'));
        raccoonOauthPollTimer = global.setTimeout(function () {
          pollRaccoonOauth(pendingId, messageFn);
        }, 2000);
      })
      .catch(function () {
        if (pendingId !== raccoonOauthPendingId) return;
        stopRaccoonOauthPoll();
        raccoonOauthBusy = false;
        raccoonOauthPendingId = '';
        hideRaccoonQr();
        var failLine = t('ha2AtrWbLoginFail', '登录失败，请重试');
        markRaccoonOauthFail(failLine);
        msg(failLine);
      });
  }

  function raccoonQrModalScope() {
    return (
      (document && document.querySelector('[data-ha2-model-provider-modal]')) ||
      root ||
      null
    );
  }

  function showRaccoonQr(authUrl) {
    if (!authUrl) return;
    var scope = raccoonQrModalScope();
    if (!scope) return;
    var host = scope.querySelector('[data-raccoon-qr-host]');
    var frame = scope.querySelector('[data-raccoon-qr-svg]');
    if (!host || !frame) return;
    var Qr = global.OneToneRaccoonQr;
    var svg =
      Qr && typeof Qr.renderSvg === 'function'
        ? Qr.renderSvg(String(authUrl), { size: 168 })
        : '';
    if (!svg) {
      host.hidden = true;
      return;
    }
    frame.innerHTML = svg;
    host.hidden = false;
  }

  function hideRaccoonQr() {
    var scope = raccoonQrModalScope();
    if (!scope) return;
    var host = scope.querySelector('[data-raccoon-qr-host]');
    var frame = scope.querySelector('[data-raccoon-qr-svg]');
    if (frame) frame.innerHTML = '';
    if (host) host.hidden = true;
  }

  function startRaccoonOauth(messageFn) {
    var msg = messageFn || function (s) {
      toast(s);
    };
    if (raccoonOauthBusy) return;
    stopRaccoonOauthPoll();
    hideRaccoonQr();
    raccoonOauthBusy = true;
    var FM = freemodelChannelsApi();
    if (FM && FM.setConnectState) FM.setConnectState('raccoon', 'connecting');
    msg(t('ha2FmRaccoonOpening', '正在生成微信登录码…'));
    invoke('cmd_raccoon_oauth_start', {})
      .then(function (res) {
        var pendingId = res && res.pendingId ? String(res.pendingId) : '';
        var authUrl = res && res.authUrl ? String(res.authUrl) : '';
        if (!pendingId || !authUrl) {
          raccoonOauthBusy = false;
          var noPending = t('ha2AtrWbLoginFail', '登录失败，请重试');
          markRaccoonOauthFail(noPending);
          msg(noPending);
          return;
        }
        raccoonOauthPendingId = pendingId;
        showRaccoonQr(authUrl);
        msg(t('ha2FmRaccoonPending', '请用微信扫一扫卡片内二维码…'));
        pollRaccoonOauth(pendingId, messageFn);
      })
      .catch(function (err) {
        raccoonOauthBusy = false;
        raccoonOauthPendingId = '';
        hideRaccoonQr();
        var detail = String((err && err.message) || err || 'oauth_start_failed');
        markRaccoonOauthFail(detail);
        msg(
          t('ha2FmRaccoonIpcFail', '无法启动 Raccoon 扫码登录，请重启应用后重试。') +
            ' · ' +
            detail
        );
      });
  }

  function startFreemodelOauthById(channelId, messageFn) {
    if (channelId === 'workbuddy') {
      startWbFreemodelLoginFromDock();
      return;
    }
    if (channelId === 'opencode_zen') {
      startOpencodeZenOauth(messageFn);
      return;
    }
    if (channelId === 'raccoon') {
      startRaccoonOauth(messageFn);
      return;
    }
    if (channelId === 'loomy') {
      if (messageFn) {
        messageFn(t('ha2FmLoomyHint', '请在卡片内填写手机号并完成短信登录'));
      }
      return;
    }
    if (messageFn) messageFn(t('ha2FmOauthUnknown', '未知 OAuth 渠道'));
  }

  function openModelProviderModal(opts) {
    opts = opts || {};
    var softPadFocus = String(opts.softPadFocus || '').trim();
    var fmFocus = String(opts.fmFocus || '').trim();
    var old = document.querySelector('[data-ha2-model-provider-modal]');
    if (old) {
      old.hidden = false;
      var reuseTab = softPadFocus ? 'paid' : fmFocus ? 'free' : '';
      if (reuseTab && typeof old.__ha2SetTab === 'function') old.__ha2SetTab(reuseTab);
      if (softPadFocus) {
        var focusEl = old.querySelector('[data-softpad-key="' + softPadFocus + '"]');
        if (focusEl) {
          try {
            focusEl.focus();
          } catch (_) {}
        }
      }
      if (fmFocus) {
        var fmCard = old.querySelector('[data-fm-card="' + fmFocus + '"]');
        if (fmCard) {
          try {
            fmCard.scrollIntoView({ block: 'nearest' });
            var fmBtn = fmCard.querySelector('[data-fm-checkin]');
            if (fmBtn) fmBtn.focus();
          } catch (_) {}
        }
      }
      return;
    }
    var modal = document.createElement('div');
    modal.className = 'ha2-model-provider-modal';
    modal.setAttribute('data-ha2-model-provider-modal', '');
    var softCards = SOFTPAD_FREEMODEL_CATALOG.map(function (row) {
      var st = softPadFreemodelKeys[row.id] || {};
      var disp = modelRouteDisplay(row.label || row.id, row.id);
      var status = st.configured
        ? esc(t('ha2ModelSoftPadReady', '已配置')) +
          (st.masked ? ' · ' + esc(st.masked) : '')
        : esc(t('ha2ModelSoftPadNeedKey', '待填 Key'));
      return (
        '<div class="ha2-fm-card ha2-softpad-key-card' +
        (st.configured ? ' is-ready' : '') +
        '" data-softpad-card="' +
        esc(row.id) +
        '">' +
        '<div class="ha2-fm-card-hd">' +
        '<div class="ha2-fm-card-title"><img class="ha2-fm-ico" src="' +
        esc(disp.icon) +
        '" alt="" width="18" height="18" decoding="async"><b>' +
        esc(disp.label || row.label) +
        '</b></div><span class="ha2-fm-state" data-softpad-state="' +
        esc(row.id) +
        '">' +
        status +
        '</span></div>' +
        softPadCapsHtml(row.caps) +
        '<div class="ha2-softpad-key-row">' +
        '<input type="password" class="ha2-softpad-key-input" autocomplete="new-password" data-softpad-key="' +
        esc(row.id) +
        '" placeholder="' +
        esc(st.configured ? '•••• 已保存，粘贴可覆盖' : '粘贴即自动保存') +
        '">' +
        '<a class="ha2-softpad-key-link" href="' +
        esc(row.consoleUrl) +
        '" target="_blank" rel="noopener noreferrer">' +
        esc(t('ha2ModelSoftPadGetKey', '拿 Key')) +
        '</a></div></div>'
      );
    }).join('');
    var FM = freemodelChannelsApi();
    var readyIds = freemodelReadyIds();
    var dueN = FM && FM.dueCount ? FM.dueCount({ readyIds: readyIds }) : 0;
    var freeModelCards = freemodelCheckinCardsHtml();
    modal.innerHTML =
      '<div class="ha2-model-provider-backdrop" data-model-provider-close></div>' +
      '<section class="ha2-model-provider-dialog ha2-fm-dialog ha2-fm-connect-sheet" role="dialog" aria-modal="true" aria-labelledby="ha2ModelProviderTitle">' +
      '<button type="button" class="ha2-model-provider-close" data-model-provider-close aria-label="关闭">×</button>' +
      '<header class="ha2-fm-sheet-hd">' +
      '<h2 id="ha2ModelProviderTitle">' +
      esc(t('ha2ModelProviders', '开通免费模型')) +
      (dueN ? '<span class="ha2-fm-due-badge">' + dueN + '</span>' : '') +
      '</h2>' +
      '<p class="ha2-fm-sheet-lead">' +
      esc(
        t(
          'ha2ModelProviderFuseHint',
          '开通后进首页模型下拉。已可用只显示状态；未开通才展开操作。'
        )
      ) +
      '</p></header>' +
      '<div class="ha2-model-provider-tabs" role="tablist" data-fm-subtabs>' +
      '<button type="button" class="ha2-model-provider-tab is-on" role="tab" aria-selected="true" data-fm-tab="free">' +
      esc(t('ha2FmTabFree', '免费开通')) +
      '</button>' +
      '<button type="button" class="ha2-model-provider-tab" role="tab" aria-selected="false" data-fm-tab="paid">' +
      esc(t('ha2FmTabSoftPad', 'Soft Pad 能力')) +
      '</button>' +
      '<button type="button" class="ha2-model-provider-tab" role="tab" aria-selected="false" data-fm-tab="api">' +
      esc(t('ha2ModelTabApi', '自定义 API')) +
      '</button></div>' +
      '<div class="ha2-model-provider-pane" data-fm-pane="free" data-fm-connect-list>' +
      '<div class="ha2-fm-connect-list">' +
      freeModelCards +
      '</div></div>' +
      '<div class="ha2-model-provider-pane" data-fm-pane="paid" data-fm-paid-keys hidden>' +
      '<p class="ha2-model-provider-hint">' +
      esc(
        t(
          'ha2FmSoftPadCapsHint',
          '目前仅这 4 家接了 Soft Pad 余额/计量/ATR；粘贴 Key 后自动保存。其它厂商请用「自定义 API」。'
        )
      ) +
      '</p>' +
      '<div class="ha2-fm-connect-list">' +
      softCards +
      '</div></div>' +
      '<div class="ha2-model-provider-pane" data-fm-pane="api" data-provider-pane="api" hidden>' +
      (function () {
        var def = customApiDefaultPreset();
        var defId = def ? def.id : '';
        var defLabel = def ? def.label : t('ha2FmCustomPickProv', '请选择提供商');
        var defModel = def ? def.model || '' : '';
        var defIco = def && def.icon
          ? '<img class="ha2-fm-ico" data-custom-prov-ico src="' +
            esc(def.icon) +
            '" alt="" width="18" height="18" decoding="async">'
          : '<span class="ha2-fm-ico ha2-fm-ico--empty" data-custom-prov-ico-empty aria-hidden="true"></span><img class="ha2-fm-ico" data-custom-prov-ico hidden alt="" width="18" height="18" decoding="async">';
        var opts = customApiPresets()
          .map(function (p) {
            return customApiProvOptHtml(p, defId, {});
          })
          .join('');
        return (
          '<div class="ha2-fm-custom-grid" data-custom-api>' +
          '<div class="ha2-fm-field">' +
          esc(t('ha2FmCustomProvider', '提供商')) +
          '<button type="button" class="ha2-fm-prov-trigger" data-custom-prov-trigger aria-haspopup="listbox" aria-expanded="false">' +
          defIco +
          '<span data-custom-prov-label>' +
          esc(defLabel) +
          '</span><span class="ha2-fm-prov-caret" aria-hidden="true">▾</span></button>' +
          '<div class="ha2-fm-prov-menu" data-custom-prov-menu role="listbox" hidden>' +
          '<input type="search" class="ha2-fm-prov-search" data-custom-prov-search placeholder="' +
          esc(t('ha2FmCustomSearch', '搜索提供商')) +
          '" autocomplete="off">' +
          '<div class="ha2-fm-prov-list" data-custom-prov-list>' +
          opts +
          '<button type="button" class="ha2-fm-prov-opt ha2-fm-prov-other" role="option" data-custom-prov="__other__">' +
          '<span class="ha2-fm-prov-plus">+</span><span>' +
          esc(t('ha2FmCustomOther', '其他')) +
          '</span></button></div></div></div>' +
          '<label class="ha2-fm-field" data-custom-model-field>' +
          esc(t('ha2FmCustomModel', '模型')) +
          '<input data-custom-model list="ha2-custom-model-list" value="' +
          esc(defModel) +
          '" placeholder="' +
          esc(t('ha2FmCustomModelPh', '有 Key 后可下拉选择')) +
          '"><datalist id="ha2-custom-model-list" data-custom-model-list></datalist></label>' +
          '<div class="ha2-fm-custom-other" data-custom-other hidden>' +
          '<label class="ha2-fm-field">' +
          esc(t('ha2FmCustomName', '名称')) +
          '<input data-custom-other-name value="Custom"></label>' +
          '<label class="ha2-fm-field">Provider ID<input data-custom-other-id value="custom"></label>' +
          '<label class="ha2-fm-field">' +
          esc(t('ha2FmCustomBaseUrl', 'API 地址')) +
          '<input data-custom-other-base placeholder="https://…/v1"></label></div>' +
      '<label class="ha2-fm-field">API Key<input name="apiKey" type="password" autocomplete="new-password" placeholder="' +
      esc(t('ha2FmCustomKeyPh', '粘贴 API Key')) +
      '"></label>' +
      '<p class="ha2-model-provider-hint" data-custom-key-note hidden>' +
      esc(
        t(
          'ha2FmCustomMinimaxKeyNote',
          'Soft Pad 的 MiniMax Coding Plan Key 只管 5h 余量，和这里的开放平台 Chat API Key 不是同一把；首页模型下拉要用这边保存的 Key。'
        )
      ) +
      '</p>' +
      '<div class="ha2-fm-card-acts"><button type="button" class="ha2-btn" data-model-provider-test>' +
          esc(t('ha2FmCustomTest', '测试连接')) +
          '</button><button type="button" class="ha2-btn primary ha2-fm-row-cta" data-model-provider-save>' +
          esc(t('ha2FmCustomSave', '保存')) +
          '</button></div></div>'
        );
      })() +
      '</div>' +
      '<div class="ha2-model-provider-status" role="status"></div></section>';
    document.body.appendChild(modal);
    var close = function () {
      modal.hidden = true;
    };
    modal.querySelectorAll('[data-model-provider-close]').forEach(function (el) {
      el.onclick = close;
    });
    var setTab = function (tab) {
      tab = String(tab || 'free');
      if (tab !== 'free' && tab !== 'paid' && tab !== 'api') tab = 'free';
      modal.querySelectorAll('[data-fm-tab]').forEach(function (btn) {
        var on = btn.getAttribute('data-fm-tab') === tab;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      modal.querySelectorAll('[data-fm-pane]').forEach(function (pane) {
        var on = pane.getAttribute('data-fm-pane') === tab;
        if (on) pane.removeAttribute('hidden');
        else pane.setAttribute('hidden', '');
      });
    };
    modal.querySelectorAll('[data-fm-tab]').forEach(function (btn) {
      btn.onclick = function () {
        setTab(btn.getAttribute('data-fm-tab'));
      };
    });
    modal.__ha2SetTab = setTab;
    var customDef = customApiDefaultPreset();
    var customProvId = customDef ? customDef.id : '';
    var customConfiguredIds = {};
    var customSavedModels = {};
    var customProvMenu = modal.querySelector('[data-custom-prov-menu]');
    var customProvTrigger = modal.querySelector('[data-custom-prov-trigger]');
    var customProvSearch = modal.querySelector('[data-custom-prov-search]');
    var customProvList = modal.querySelector('[data-custom-prov-list]');
    var customModelsSeq = 0;
    var seedModelsForProv = function (id) {
      var preset = customApiPresetById(id);
      return preset && Array.isArray(preset.models) ? preset.models.slice() : [];
    };
    var fillCustomModelList = function (ids, prefer) {
      var dl = modal.querySelector('[data-custom-model-list]');
      var modelEl = modal.querySelector('[data-custom-model]');
      if (!dl) return;
      ids = Array.isArray(ids) ? ids : [];
      var seen = {};
      var merged = [];
      ids.concat(seedModelsForProv(customProvId)).forEach(function (id) {
        id = String(id || '').trim();
        if (!id || seen[id]) return;
        seen[id] = true;
        merged.push(id);
      });
      dl.innerHTML = merged
        .map(function (id) {
          return '<option value="' + esc(id) + '"></option>';
        })
        .join('');
      if (modelEl && prefer) {
        if (merged.indexOf(prefer) >= 0 || !modelEl.value) modelEl.value = prefer;
      }
    };
    var syncCustomKeyPlaceholder = function () {
      var keyEl = modal.querySelector('[name="apiKey"]');
      if (!keyEl) return;
      var saved = !!(customProvId && customConfiguredIds[customProvId]);
      keyEl.placeholder = saved
        ? t('ha2FmCustomKeySavedPh', '已保存 · 留空沿用，重填可覆盖')
        : t('ha2FmCustomKeyPh', '粘贴 API Key');
    };
    var fetchCustomModels = function () {
      var cfg = resolveCustomApi();
      if (!cfg || !cfg.baseUrl) {
        fillCustomModelList(seedModelsForProv(customProvId));
        return;
      }
      // Always seed known catalog models (API /models can lag or omit latest).
      fillCustomModelList(
        seedModelsForProv(cfg.id),
        cfg.model || customSavedModels[cfg.id] || ''
      );
      var hasKey = !!(cfg.apiKey || customConfiguredIds[cfg.id]);
      if (!hasKey) return;
      var seq = ++customModelsSeq;
      invokeMp('cmd_model_provider_list_models', {
        providerId: cfg.id || undefined,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey || undefined
      })
        .then(function (ids) {
          if (seq !== customModelsSeq) return;
          fillCustomModelList(
            (Array.isArray(ids) ? ids : []).concat(seedModelsForProv(cfg.id)),
            cfg.model || customSavedModels[cfg.id] || ''
          );
        })
        .catch(function () {
          /* seed list already shown */
        });
    };
    var bindCustomProvOpts = function () {
      modal.querySelectorAll('[data-custom-prov]').forEach(function (opt) {
        opt.onclick = function () {
          applyCustomProv(opt.getAttribute('data-custom-prov'));
        };
      });
    };
    var rebuildCustomProvList = function () {
      if (!customProvList) return;
      var html = customApiPresets()
        .map(function (p) {
          return customApiProvOptHtml(p, customProvId, customConfiguredIds);
        })
        .join('');
      html +=
        '<button type="button" class="ha2-fm-prov-opt ha2-fm-prov-other" role="option" data-custom-prov="__other__">' +
        '<span class="ha2-fm-prov-plus">+</span><span>' +
        esc(t('ha2FmCustomOther', '其他')) +
        '</span></button>';
      customProvList.innerHTML = html;
      bindCustomProvOpts();
      filterCustomProv(customProvSearch ? customProvSearch.value : '');
    };
    var applyCustomProv = function (id) {
      customProvId = String(id || '');
      var isOther = customProvId === '__other__';
      var preset = isOther ? null : customApiPresetById(customProvId);
      var ico = modal.querySelector('[data-custom-prov-ico]');
      var icoEmpty = modal.querySelector('[data-custom-prov-ico-empty]');
      var lab = modal.querySelector('[data-custom-prov-label]');
      var modelEl = modal.querySelector('[data-custom-model]');
      var other = modal.querySelector('[data-custom-other]');
      if (isOther) {
        if (ico) ico.hidden = true;
        if (icoEmpty) icoEmpty.hidden = false;
        if (lab) lab.textContent = t('ha2FmCustomOther', '其他');
        if (other) other.hidden = false;
      } else if (preset) {
        if (preset.icon) {
          if (ico) {
            ico.hidden = false;
            ico.src = preset.icon;
          }
          if (icoEmpty) icoEmpty.hidden = true;
        } else {
          if (ico) ico.hidden = true;
          if (icoEmpty) icoEmpty.hidden = false;
        }
        if (lab) lab.textContent = preset.label;
        if (modelEl) {
          modelEl.value = customSavedModels[preset.id] || preset.model || '';
        }
        if (other) other.hidden = true;
      }
      modal.querySelectorAll('[data-custom-prov]').forEach(function (opt) {
        opt.classList.toggle('on', opt.getAttribute('data-custom-prov') === customProvId);
      });
      if (customProvMenu) customProvMenu.hidden = true;
      if (customProvTrigger) customProvTrigger.setAttribute('aria-expanded', 'false');
      if (customProvSearch) customProvSearch.value = '';
      filterCustomProv('');
      syncCustomKeyPlaceholder();
      var note = modal.querySelector('[data-custom-key-note]');
      if (note) {
        var showMm =
          !isOther &&
          preset &&
          (/^minimax/i.test(preset.id) || /minimax/i.test(preset.label || ''));
        note.hidden = !showMm;
      }
      fetchCustomModels();
    };
    var filterCustomProv = function (q) {
      q = String(q || '')
        .trim()
        .toLowerCase();
      modal.querySelectorAll('[data-custom-prov-list] [data-custom-prov]').forEach(function (opt) {
        if (opt.getAttribute('data-custom-prov') === '__other__') {
          opt.hidden = false;
          return;
        }
        var label = String(opt.getAttribute('data-custom-prov-label') || opt.textContent || '')
          .toLowerCase();
        var id = String(opt.getAttribute('data-custom-prov') || '').toLowerCase();
        var savedOnly = q === '已保存' || q === 'saved';
        if (savedOnly) {
          opt.hidden = opt.getAttribute('data-custom-saved') !== '1';
          return;
        }
        opt.hidden = !!(q && label.indexOf(q) < 0 && id.indexOf(q) < 0);
      });
    };
    if (customProvTrigger) {
      customProvTrigger.onclick = function (ev) {
        ev.preventDefault();
        if (!customProvMenu) return;
        var open = customProvMenu.hidden;
        customProvMenu.hidden = !open;
        customProvTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open && customProvSearch) {
          try {
            customProvSearch.focus();
          } catch (_) {}
        }
      };
    }
    if (customProvSearch) {
      customProvSearch.oninput = function () {
        filterCustomProv(customProvSearch.value);
      };
      customProvSearch.onclick = function (ev) {
        ev.stopPropagation();
      };
    }
    bindCustomProvOpts();
    var keyInput = modal.querySelector('[name="apiKey"]');
    if (keyInput) {
      var keyTimer = 0;
      keyInput.oninput = function () {
        if (keyTimer) clearTimeout(keyTimer);
        keyTimer = setTimeout(function () {
          fetchCustomModels();
        }, 450);
      };
    }
    var resolveCustomApi = function () {
      var keyEl = modal.querySelector('[name="apiKey"]');
      var apiKey = keyEl ? String(keyEl.value || '').trim() : '';
      var modelEl = modal.querySelector('[data-custom-model]');
      var model = modelEl ? String(modelEl.value || '').trim() : '';
      if (customProvId === '__other__') {
        return {
          id: String(
            (modal.querySelector('[data-custom-other-id]') || {}).value || ''
          ).trim(),
          name: String(
            (modal.querySelector('[data-custom-other-name]') || {}).value || ''
          ).trim(),
          baseUrl: String(
            (modal.querySelector('[data-custom-other-base]') || {}).value || ''
          ).trim(),
          model: model,
          apiKey: apiKey
        };
      }
      var preset = customApiPresetById(customProvId);
      if (!preset) return null;
      return {
        id: preset.id,
        name: preset.label,
        baseUrl: preset.baseUrl,
        model: model || preset.model || '',
        apiKey: apiKey
      };
    };
    var applyCustomRoutes = function (cfg) {
      var gateway = global.OneToneModelGateway;
      if (!gateway || !cfg || !cfg.id) return;
      gateway.registerProvider({
        id: cfg.id,
        name: cfg.name || cfg.id,
        label: cfg.name || cfg.id,
        kind: 'custom',
        source: 'user',
        configured: true
      });
      ['intent', 'planning', 'review', 'repair', 'synthesis'].forEach(function (p) {
        if (gateway.setRoute) gateway.setRoute(p, cfg.id);
      });
    };
    var message = function (s) {
      var el = modal.querySelector('.ha2-model-provider-status');
      if (el) el.textContent = s;
    };
    var invokeMp = function (cmd, args) {
      return global.OneToneIpc.invoke(cmd, { args: args || {} });
    };
    var refreshRouteHost = function () {
      if (!mounted || !root) return;
      var host = root.querySelector('[data-ha2-model-route-host]');
      if (host) host.removeAttribute('data-sig');
      syncModeChrome(store() && store().getSnapshot());
    };
    function refreshFreemodelModalCards() {
      var api = freemodelChannelsApi();
      if (!api) return;
      modal.querySelectorAll('[data-fm-card]').forEach(function (card) {
        var id = card.getAttribute('data-fm-card');
        var ch = api.byId(id);
        if (!ch) return;
        var ctx = freemodelCapCtx(ch);
        var cap = api.resolveCapability
          ? api.resolveCapability(ch, ctx)
          : { state: 'unconfigured', label: '' };
        card.classList.toggle('is-ready', cap.state === 'ready');
        card.classList.toggle('is-connecting', cap.state === 'connecting');
        card.classList.toggle('is-error', cap.state === 'error');
        card.classList.remove('is-done');
        card.setAttribute('data-fm-cap', cap.state || 'unconfigured');
        if (cap.wbPhase) card.setAttribute('data-fm-wb-phase', cap.wbPhase);
        else card.removeAttribute('data-fm-wb-phase');
        var stEl = card.querySelector('.ha2-fm-state');
        if (stEl) {
          stEl.textContent = api.summaryLine
            ? api.summaryLine(ch, cap)
            : cap.label || '';
        }
        var btn = card.querySelector('[data-fm-checkin]');
        var acts = card.querySelector('.ha2-fm-card-acts');
        var needWbRefresh =
          ch.id === 'workbuddy' &&
          (cap.wbPhase === 'no_models' || cap.state !== 'ready');
        if (cap.state === 'ready' && !needWbRefresh) {
          if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
          if (acts && !acts.querySelector('button, a')) {
            acts.setAttribute('hidden', '');
          }
        } else if (btn) {
          btn.classList.add('primary', 'ha2-fm-row-cta');
          btn.textContent = freemodelCheckinCtaLabel(ch, cap);
          btn.disabled = false;
          btn.removeAttribute('disabled');
          if (acts) acts.removeAttribute('hidden');
        }
      });
      var badge = modal.querySelector('.ha2-fm-due-badge');
      var due = api.dueCount({ readyIds: freemodelReadyIds() });
      if (badge) {
        if (due) badge.textContent = String(due);
        else badge.remove();
      } else if (due) {
        var title = modal.querySelector('#ha2ModelProviderTitle');
        if (title) {
          var span = document.createElement('span');
          span.className = 'ha2-fm-due-badge';
          span.textContent = String(due);
          title.appendChild(span);
        }
      }
    }

    function setFmLoginStatus(id, text) {
      var el = modal.querySelector('[data-fm-login-status="' + id + '"]');
      if (!el) return;
      var s = String(text || '').trim();
      el.hidden = !s;
      el.textContent = s;
    }

    function showFreemodelPaste(id) {
      var host = modal.querySelector('[data-fm-paste-host="' + id + '"]');
      if (host) {
        host.hidden = false;
        var input = host.querySelector('[data-fm-paste-key]');
        if (input) {
          try {
            input.focus();
          } catch (_) {}
        }
      }
      var reveal = modal.querySelector('[data-fm-paste-reveal="' + id + '"]');
      if (reveal) reveal.hidden = true;
    }

    function runFreemodelCheckin(id) {
      var api = freemodelChannelsApi();
      if (!api) {
        message(t('ha2FmMissing', '签到模块未加载'));
        return;
      }
      var ch = api.byId ? api.byId(id) : null;
      message(t('ha2FmWorking', '处理中…'));
      setFmLoginStatus(id, t('ha2FmWorking', '处理中…'));
      if (api.setConnectState) api.setConnectState(id, 'connecting');
      refreshFreemodelModalCards();
      // One open only: oauth opens in Rust; paste/browser open inside checkIn.
      api
        .checkIn(id)
        .then(function (res) {
          if (res && res.action === 'one_tap') {
            var tapCh = (res && res.channel) || ch;
            if (!tapCh) {
              message(t('ha2FmFail', '开通失败'));
              return;
            }
            return upsertFreemodelProvider(tapCh, '')
              .then(function () {
                if (api.setConnectState) api.setConnectState(id, 'ready');
                return afterFreemodelProviderReady(id);
              })
              .then(function () {
                refreshFreemodelModalCards();
                refreshRouteHost();
                var ready = t(
                  'ha2FmKiloAnonReady',
                  '已一键启用 — 需要账号额度时再点「填写 API Key」'
                );
                message(ready);
                setFmLoginStatus(id, ready);
              })
              .catch(function (err) {
                if (api.setConnectState) {
                  api.setConnectState(id, 'error', {
                    error: String((err && err.message) || err || '')
                  });
                }
                refreshFreemodelModalCards();
                var fail =
                  t('ha2FmFail', '开通失败') +
                  '：' +
                  String((err && err.message) || err || '');
                message(fail);
                setFmLoginStatus(id, fail);
              });
          }
          if (res && res.action === 'oauth') {
            var chId = (res.channel && res.channel.id) || id;
            var waiting = t(
              'ha2FmLoginWaiting',
              '已打开登录页，等待授权…（最长约 10 分钟）'
            );
            message(waiting);
            setFmLoginStatus(chId, waiting);
            if (chId === 'workbuddy') {
              close();
              startFreemodelOauthById(chId, message);
              return;
            }
            startFreemodelOauthById(chId, function (s) {
              message(s);
              setFmLoginStatus(chId, s);
              refreshFreemodelModalCards();
            });
            return;
          }
          if (res && res.action === 'paste_key') {
            showFreemodelPaste(id);
            var pasteHint = t(
              'ha2FmPasteHint',
              '已打开控制台 — 登录后复制 Key 粘到下方即可进下拉'
            );
            message(pasteHint);
            setFmLoginStatus(id, pasteHint);
            return;
          }
          if (res && res.action === 'opened') {
            var openedLine =
              (res.channel && res.channel.label ? res.channel.label + ' · ' : '') +
              t('ha2FmPageOpened', '已打开登录页 — 请在浏览器完成登录');
            message(openedLine);
            setFmLoginStatus(id, openedLine);
            refreshFreemodelModalCards();
            return;
          }
          if (res && res.ok) {
            if (api.setConnectState) api.setConnectState(id, 'ready');
            var okLine =
              (res.channel && res.channel.label ? res.channel.label + ' · ' : '') +
              t('ha2FmOk', '已开通');
            message(okLine);
            setFmLoginStatus(id, okLine);
            refreshFreemodelModalCards();
            refreshRouteHost();
            return;
          }
          if (api.setConnectState) {
            api.setConnectState(id, 'error', {
              error: String((res && res.message) || '')
            });
          }
          var fail =
            t('ha2FmFail', '开通失败') +
            '：' +
            String((res && res.message) || '');
          message(fail);
          setFmLoginStatus(id, fail);
          refreshFreemodelModalCards();
        })
        .catch(function (err) {
          if (api.setConnectState) {
            api.setConnectState(id, 'error', {
              error: String((err && err.message) || err || '')
            });
          }
          var fail =
            t('ha2FmFail', '开通失败') +
            '：' +
            String((err && err.message) || err || '');
          message(fail);
          setFmLoginStatus(id, fail);
          refreshFreemodelModalCards();
        });
    }

    var checkAllBtn = modal.querySelector('[data-fm-checkin-all]');
    if (checkAllBtn) {
      checkAllBtn.onclick = function () {
        var api = freemodelChannelsApi();
        if (!api) {
          message(t('ha2FmMissing', '签到模块未加载'));
          return;
        }
        message(t('ha2FmBatchWorking', '正在批量开通…'));
        api
          .checkInAllDue({ staggerMs: 400, readyIds: freemodelReadyIds() })
          .then(function (batch) {
          var opened = (batch.results || []).filter(function (r) {
            return r && r.ok;
          }).length;
          var tapQueue = Promise.resolve();
          (batch.results || []).forEach(function (r) {
            if (r && r.action === 'paste_key' && r.channel) {
              showFreemodelPaste(r.channel.id);
            }
            if (r && r.action === 'one_tap' && r.channel) {
              tapQueue = tapQueue
                .then(function () {
                  return upsertFreemodelProvider(r.channel, '').then(function () {
                    if (api.setConnectState) {
                      api.setConnectState(r.channel.id, 'ready');
                    }
                    return afterFreemodelProviderReady(r.channel.id);
                  });
                })
                .catch(function () {});
            }
          });
          (batch.oneTapIds || []).forEach(function (tapId) {
            var already = (batch.results || []).some(function (r) {
              return r && r.channel && r.channel.id === tapId;
            });
            if (already) return;
            var tapCh = api.byId(tapId);
            if (!tapCh) return;
            tapQueue = tapQueue
              .then(function () {
                return upsertFreemodelProvider(tapCh, '').then(function () {
                  if (api.setConnectState) api.setConnectState(tapId, 'ready');
                  return afterFreemodelProviderReady(tapId);
                });
              })
              .catch(function () {});
          });
          return tapQueue.then(function () {
            refreshFreemodelModalCards();
            refreshRouteHost();
            var oauthIds = batch.oauthIds || [];
            if (oauthIds.length) {
              var first =
                oauthIds.indexOf('workbuddy') >= 0
                  ? 'workbuddy'
                  : oauthIds[0];
              message(
                t('ha2FmBatchPartial', '已处理') +
                  ' · ' +
                  opened +
                  ' · ' +
                  t('ha2AtrWbLoginPending', '请在浏览器完成登录…')
              );
              if (first === 'workbuddy') close();
              startFreemodelOauthById(first, message);
              return;
            }
            message(
              t('ha2FmBatchDone', '批量开通完成') +
                ' · ' +
                opened +
                '/' +
                (batch.dueCount || 0)
            );
          });
        });
      };
    }
    modal.querySelectorAll('[data-fm-checkin]').forEach(function (btn) {
      btn.onclick = function () {
        runFreemodelCheckin(btn.getAttribute('data-fm-checkin'));
      };
    });
    modal.querySelectorAll('[data-fm-paste-save]').forEach(function (btn) {
      btn.onclick = function () {
        var pid = String(btn.getAttribute('data-fm-paste-save') || '').trim();
        var api = freemodelChannelsApi();
        var ch = api && api.byId ? api.byId(pid) : null;
        if (!ch) {
          message(t('ha2FmMissing', '签到模块未加载'));
          return;
        }
        var input = modal.querySelector('[data-fm-paste-key="' + pid + '"]');
        var key = input ? String(input.value || '').trim() : '';
        if (!key) {
          message(t('ha2FmPasteEmpty', '请先粘贴 Token / API Key'));
          return;
        }
        message(t('ha2FmPasteSaving', '正在保存…'));
        upsertFreemodelProvider(ch, key)
          .then(function () {
            if (api.setConnectState) api.setConnectState(pid, 'ready');
            return afterFreemodelProviderReady(pid);
          })
          .then(function () {
            message(
              (ch.label || pid) + ' · ' + t('ha2FmPasteSaved', '已保存并选用')
            );
            refreshFreemodelModalCards();
            refreshRouteHost();
          })
          .catch(function (err) {
            if (api.setConnectState) {
              api.setConnectState(pid, 'error', {
                error: String((err && err.message) || err || '')
              });
            }
            message(
              t('ha2FmFail', '开通失败') +
                '：' +
                String((err && err.message) || err || '')
            );
            refreshFreemodelModalCards();
          });
      };
    });
    modal.querySelectorAll('[data-fm-paste-reveal]').forEach(function (btn) {
      btn.onclick = function () {
        var pid = String(btn.getAttribute('data-fm-paste-reveal') || '').trim();
        showFreemodelPaste(pid);
        setFmLoginStatus(
          pid,
          t('ha2FmPasteOptional', '可选：粘贴账号 API Key 覆盖匿名额度')
        );
      };
    });
    var loomySmsSendBtn = modal.querySelector('[data-loomy-sms-send]');
    if (loomySmsSendBtn) {
      loomySmsSendBtn.onclick = function () {
        var phoneEl = modal.querySelector('[data-loomy-phone]');
        var msgidEl = modal.querySelector('[data-loomy-msgid]');
        var phone = phoneEl ? String(phoneEl.value || '').trim() : '';
        var api = freemodelChannelsApi();
        if (api && api.setConnectState) api.setConnectState('loomy', 'connecting');
        message(t('ha2FmLoomySending', '正在发送验证码…'));
        setFmLoginStatus('loomy', t('ha2FmLoomySending', '正在发送验证码…'));
        refreshFreemodelModalCards();
        invoke('cmd_loomy_sms_send', { phone: phone })
          .then(function (res) {
            var msgid = res && res.msgid ? String(res.msgid) : '';
            if (msgidEl) msgidEl.value = msgid;
            var ok = t('ha2FmLoomySent', '验证码已发送，请查收短信');
            message(ok);
            setFmLoginStatus('loomy', ok);
          })
          .catch(function (err) {
            if (api && api.setConnectState) {
              api.setConnectState('loomy', 'error', {
                error: String((err && err.message) || err || '')
              });
            }
            var fail =
              t('ha2FmFail', '开通失败') +
              '：' +
              String((err && err.message) || err || '');
            message(fail);
            setFmLoginStatus('loomy', fail);
            refreshFreemodelModalCards();
          });
      };
    }
    var loomySmsLoginBtn = modal.querySelector('[data-loomy-sms-login]');
    if (loomySmsLoginBtn) {
      loomySmsLoginBtn.onclick = function () {
        var phoneEl = modal.querySelector('[data-loomy-phone]');
        var codeEl = modal.querySelector('[data-loomy-code]');
        var msgidEl = modal.querySelector('[data-loomy-msgid]');
        var phone = phoneEl ? String(phoneEl.value || '').trim() : '';
        var code = codeEl ? String(codeEl.value || '').trim() : '';
        var msgid = msgidEl ? String(msgidEl.value || '').trim() : '';
        var api = freemodelChannelsApi();
        if (!msgid) {
          message(t('ha2FmLoomyNeedSend', '请先发送验证码'));
          return;
        }
        if (api && api.setConnectState) api.setConnectState('loomy', 'connecting');
        message(t('ha2FmWorking', '处理中…'));
        setFmLoginStatus('loomy', t('ha2FmWorking', '处理中…'));
        invoke('cmd_loomy_sms_login', { phone: phone, code: code, msgid: msgid })
          .then(function () {
            if (api && api.setConnectState) api.setConnectState('loomy', 'ready');
            return afterFreemodelProviderReady('loomy');
          })
          .then(function () {
            var ok = t('ha2FmLoomyOk', '已登录 Loomy — 可在模型列表选用');
            message(ok);
            setFmLoginStatus('loomy', ok);
            refreshFreemodelModalCards();
            refreshRouteHost();
          })
          .catch(function (err) {
            if (api && api.setConnectState) {
              api.setConnectState('loomy', 'error', {
                error: String((err && err.message) || err || '')
              });
            }
            var fail =
              t('ha2FmFail', '开通失败') +
              '：' +
              String((err && err.message) || err || '');
            message(fail);
            setFmLoginStatus('loomy', fail);
            refreshFreemodelModalCards();
          });
      };
    }
    var softPadSaveBusy = {};
    var saveSoftPadKey = function (pid, key, opts) {
      opts = opts || {};
      pid = String(pid || '').trim();
      key = String(key || '').trim();
      if (!pid || !key || softPadSaveBusy[pid]) return;
      // Ignore obvious incomplete paste.
      if (key.length < 12) return;
      softPadSaveBusy[pid] = true;
      var stEl = modal.querySelector('[data-softpad-state="' + pid + '"]');
      var card = modal.querySelector('[data-softpad-card="' + pid + '"]');
      if (stEl) stEl.textContent = t('ha2ModelSoftPadSaving', '保存中…');
      message(t('ha2ModelSoftPadSaving', '正在保存 Soft Pad Key…'));
      // Soft Pad key IPC takes flat provider/key — not { args: … }.
      global.OneToneIpc.invoke('cmd_soft_pad_provider_key_set', {
        provider: pid,
        key: key
      })
        .then(function () {
          writeSoftPadPreferredProvider(pid);
          var gateway = global.OneToneModelGateway;
          if (gateway && gateway.setRoute) {
            ['intent', 'planning', 'review', 'repair', 'synthesis'].forEach(function (p) {
              gateway.setRoute(p, 'softpad_our_freemodel');
            });
          }
          return refreshSoftPadFreemodelKeys();
        })
        .then(function () {
          var st = softPadFreemodelKeys[pid] || {};
          if (stEl) {
            stEl.textContent =
              t('ha2ModelSoftPadReady', '已配置') +
              (st.masked ? ' · ' + st.masked : '');
          }
          if (card) card.classList.add('is-ready');
          var input = modal.querySelector('[data-softpad-key="' + pid + '"]');
          if (input) {
            input.value = '';
            input.placeholder = t('ha2ModelSoftPadKeySavedPh', '•••• 已保存，粘贴可覆盖');
          }
          message(
            t('ha2ModelSoftPadSaved', '已自动保存并选用 Soft Pad') + ' · ' + pid
          );
          refreshRouteHost();
          if (opts.close) close();
        })
        .catch(function (e) {
          if (stEl) stEl.textContent = t('ha2ModelSoftPadNeedKey', '待填 Key');
          message(
            t('ha2ModelSoftPadSaveFail', '保存失败') +
              '：' +
              String((e && e.message) || e || '')
          );
        })
        .finally(function () {
          softPadSaveBusy[pid] = false;
        });
    };
    modal.querySelectorAll('[data-softpad-key]').forEach(function (input) {
      var pid = String(input.getAttribute('data-softpad-key') || '').trim();
      var timer = 0;
      var trySave = function () {
        saveSoftPadKey(pid, input.value);
      };
      input.addEventListener('paste', function () {
        setTimeout(trySave, 0);
      });
      input.addEventListener('change', trySave);
      input.addEventListener('input', function () {
        if (timer) clearTimeout(timer);
        timer = setTimeout(trySave, 500);
      });
    });
    modal.querySelector('[data-model-provider-save]').onclick = function () {
      var v = resolveCustomApi();
      if (!v || !v.id || !v.baseUrl || !v.model) {
        message(t('ha2FmCustomNeedProv', '请先选择提供商（或其他里填完整信息）'));
        return;
      }
      var hadKey = !!customConfiguredIds[v.id];
      if (!v.apiKey && !hadKey) {
        message(t('ha2FmCustomNeedKey', '请粘贴 API Key'));
        return;
      }
      message(t('ha2FmCustomSaving', '正在保存…'));
      invokeMp('cmd_model_provider_upsert', {
        id: v.id,
        name: v.name || v.id,
        protocol: 'openai_compatible',
        baseUrl: v.baseUrl,
        model: v.model,
        enabled: true,
        supportsJson: true,
        supportsStreaming: false,
        supportsTools: false
      })
        .then(function () {
          return v.apiKey
            ? invokeMp('cmd_model_provider_set_key', {
                providerId: v.id,
                apiKey: v.apiKey
              })
            : null;
        })
        .then(function () {
          applyCustomRoutes(v);
          writeSoftPadPreferredProvider('');
          customConfiguredIds[v.id] = true;
          customSavedModels[v.id] = v.model || '';
          rebuildCustomProvList();
          syncCustomKeyPlaceholder();
          fetchCustomModels();
          message(t('ha2FmCustomSaved', '已保存，可在首页模型下拉选用'));
          refreshRouteHost();
        })
        .catch(function (e) {
          message(
            t('ha2FmCustomSaveFail', '保存失败') +
              '：' +
              String(e.message || e)
          );
        });
    };
    modal.querySelector('[data-model-provider-test]').onclick = function () {
      var v = resolveCustomApi();
      if (!v || !v.id || !v.baseUrl || !v.model) {
        message(t('ha2FmCustomNeedProv', '请先选择提供商（或其他里填完整信息）'));
        return;
      }
      var hadKey = !!customConfiguredIds[v.id];
      if (!v.apiKey && !hadKey) {
        message(t('ha2FmCustomNeedKey', '请粘贴 API Key'));
        return;
      }
      message(t('ha2FmCustomTesting', '正在测试连接…'));
      invokeMp('cmd_model_provider_upsert', {
        id: v.id,
        name: v.name || v.id,
        protocol: 'openai_compatible',
        baseUrl: v.baseUrl,
        model: v.model,
        enabled: true,
        supportsJson: true,
        supportsStreaming: false,
        supportsTools: false
      })
        .then(function () {
          return v.apiKey
            ? invokeMp('cmd_model_provider_set_key', {
                providerId: v.id,
                apiKey: v.apiKey
              })
            : null;
        })
        .then(function () {
          return invokeMp('cmd_model_provider_chat', {
            providerId: v.id,
            messages: [{ role: 'user', content: '请只回复：连接成功' }],
            maxTokens: 32,
            temperature: 0
          });
        })
        .then(function () {
          applyCustomRoutes(v);
          writeSoftPadPreferredProvider('');
          customConfiguredIds[v.id] = true;
          customSavedModels[v.id] = v.model || '';
          rebuildCustomProvList();
          syncCustomKeyPlaceholder();
          fetchCustomModels();
          message(t('ha2FmCustomTestOk', '连接成功，已保存'));
          refreshRouteHost();
        })
        .catch(function (e) {
          message(
            t('ha2FmCustomTestFail', '连接失败') +
              '：' +
              String(e.message || e)
          );
        });
    };
    invokeMp('cmd_model_provider_snapshot', {})
      .then(function (items) {
        var list = Array.isArray(items) ? items : [];
        customConfiguredIds = {};
        customSavedModels = {};
        list.forEach(function (p) {
          if (!p || !p.id) return;
          if (p.configured) customConfiguredIds[p.id] = true;
          if (p.model) customSavedModels[p.id] = p.model;
        });
        rebuildCustomProvList();
        var matchId = '';
        var presets = customApiPresets();
        for (var i = 0; i < presets.length; i++) {
          if (customConfiguredIds[presets[i].id]) {
            matchId = presets[i].id;
            break;
          }
        }
        if (matchId) applyCustomProv(matchId);
        else fetchCustomModels();
      })
      .catch(function () {});
    if (softPadFocus) {
      setTab('paid');
      var focusInput = modal.querySelector('[data-softpad-key="' + softPadFocus + '"]');
      if (focusInput) {
        try {
          focusInput.focus();
        } catch (_) {}
      }
    }
    if (fmFocus) {
      setTab('free');
      var fmCardNew = modal.querySelector('[data-fm-card="' + fmFocus + '"]');
      if (fmCardNew) {
        try {
          fmCardNew.scrollIntoView({ block: 'nearest' });
          var fmBtnNew = fmCardNew.querySelector('[data-fm-checkin]');
          if (fmBtnNew) fmBtnNew.focus();
        } catch (_) {}
      }
    }
  }

  function sessionCardHtml(s) {
    if (!s) return '';
    var when = s.updatedAt ? relWhen(s.updatedAt) : '';
    var meta = [
      s.projectId || s.projectMatch || '',
      s.activitySource || '',
      when,
      s.status || ''
    ]
      .filter(Boolean)
      .join(' · ');
    return (
      '<button type="button" class="ha2-session" data-ha2-session="' +
      esc(s.sessionId) +
      '" aria-expanded="false">' +
      '<b>' +
      esc(s.title || s.sessionId || t('ha2UnnamedSession', '未命名会话')) +
      '</b><small>' +
      esc(meta) +
      '</small>' +
      '<div class="ha2-session-meta" hidden>' +
      '<div>' +
      esc(t('ha2SessionId', '会话')) +
      ': ' +
      esc(s.sessionId) +
      '</div>' +
      (s.provider
        ? '<div>' + esc(t('ha2Provider', '来源')) + ': ' + esc(s.provider) + '</div>'
        : '') +
      (s.projectId
        ? '<div>' + esc(t('ha2ProjectId', '项目')) + ': ' + esc(s.projectId) + '</div>'
        : '') +
      (s.projectMatch
        ? '<div>' + esc(t('ha2ProjectMatch', '匹配')) + ': ' + esc(s.projectMatch) + '</div>'
        : '') +
      (s.activitySource
        ? '<div>' + esc(t('ha2ActivitySource', '活动来源')) + ': ' + esc(s.activitySource) + '</div>'
        : '') +
      (s.activeConfidence != null
        ? '<div>' +
          esc(t('ha2ActiveConfidence', '活跃置信')) +
          ': ' +
          esc(String(s.activeConfidence)) +
          '</div>'
        : '') +
      '</div></button>'
    );
  }

  function detailContentHtml(snap) {
    var c = currentCat(snap);
    var agent = null;
    for (var i = 0; i < snap.agents.length; i++) {
      if (snap.agents[i].kind === c.id) {
        agent = snap.agents[i];
        break;
      }
    }
    var S = store();
    var win = S && S.windowsLabel ? S.windowsLabel(c.id) : '';
    var sessions =
      S && typeof S.buildSessionCards === 'function'
        ? S.buildSessionCards(agent || c.id)
        : [];
    var a = agent || { actions: [], agentId: '' };
    var obsFresh =
      agent && agent.observedStatus
        ? agent.observedStatus.freshUntil || agent.observedStatus.fresh_until
        : null;
    var agentFreshBit = obsFresh
      ? '<p class="ha2-agent-fresh">' +
        esc(t('ha2AgentStatusFresh', 'Agent 状态新鲜度')) +
        ' · ' +
        esc(String(obsFresh)) +
        '</p>'
      : '';
    return (
      '<div class="ha2-head"><div><h1>' +
      esc(c.name) +
      '</h1><p>' +
      esc(t('ha2DetailSub', '当前工作、会话和现有 Agent 控制能力。')) +
      '</p></div><button type="button" class="ha2-link" data-ha2-home>' +
      esc(t('ha2Close', '关闭')) +
      '</button></div><div class="ha2-detail"><div class="ha2-detail-hero">' +
      iconHtml(c) +
      '<div><h2>' +
      esc(c.name) +
      '</h2><p>' +
      esc(win) +
      '</p>' +
      agentFreshBit +
      '</div><div class="ha2-actions">' +
      (can(a.actions, 'agent.focus')
        ? '<button type="button" class="ha2-btn" data-ha2-action="agent.focus" data-agent="' +
          esc(a.agentId) +
          '">' +
          esc(t('ha2Focus', '聚焦')) +
          '</button>'
        : '') +
      (can(a.actions, 'session.resume')
        ? '<button type="button" class="ha2-btn primary" data-ha2-action="session.resume" data-agent="' +
          esc(a.agentId) +
          '">' +
          esc(t('ha2ContinueWork', '继续工作')) +
          '</button>'
        : '') +
      (can(a.actions, 'agent.interrupt')
        ? '<button type="button" class="ha2-btn warn" data-ha2-action="agent.interrupt" data-agent="' +
          esc(a.agentId) +
          '">' +
          esc(t('ha2Interrupt', '中断')) +
          '</button>'
        : '') +
      '</div></div><div class="ha2-sessions"><b>' +
      esc(t('ha2RecentSessions', '最近会话')) +
      '</b>' +
      (sessions.length
        ? sessions.slice(0, 5).map(sessionCardHtml).join('')
        : '<div class="ha2-empty">' + esc(t('ha2NoSessions', '没有可确认的会话记录')) + '</div>') +
      '<button type="button" class="ha2-link" data-ha2-open-center>' +
      esc(t('ha2OpenAgentCenter', '在 Agent Center 查看完整能力 ›')) +
      '</button></div></div>'
    );
  }

  function capClass(cap, kind) {
    var st = (cap && cap.state) || 'off';
    if (st === 'on') {
      return kind === 'camera' ? 'ha2-cap on on-cam' : 'ha2-cap on';
    }
    if (st === 'pending') return 'ha2-cap pending';
    if (st === 'error' || (cap && cap.error)) return 'ha2-cap error';
    if (st === 'unavailable') return 'ha2-cap unavailable';
    return 'ha2-cap';
  }

  function capPanelText(caps, snap) {
    caps = caps || {};
    // Ready strip (软键盘/语音/摄像头 就绪) is noise on home — keep caps in overflow only.
    if (embedMode || atrEditPathOn(snap || {})) return '';
    // ATR edit uses WorkBuddy OAuth / Soft Pad keys as engines — Soft Pad runtime readiness is unrelated.
    var bits = [];
    function bit(cap, label) {
      if (!cap) return;
      if (cap.state === 'error') bits.push(label + ' ' + t('ha2CapError', '异常'));
    }
    bit(caps.softPad, t('ha2SoftPad', 'Soft Pad'));
    bit(caps.voice, t('ha2Voice', '语音'));
    bit(caps.camera, t('ha2Camera', '摄像头'));
    if (!bits.length) return '';
    return bits.join(' · ');
  }

  function matKindLabel(kind, source) {
    var k = String(kind || '');
    var src = String(source || '');
    if (/截图|capture|screenshot/i.test(src) || k === 'screenshot') {
      return t('ha2MatScreenshot', '截图');
    }
    if (k === 'image') return t('ha2MatImage', '图片');
    if (k === 'file' || k === 'folder' || k === 'attach') return t('ha2MatFile', '文件');
    if (k === 'url') return t('ha2MatUrl', '链接');
    if (k === 'text') return t('ha2MatPaste', '粘贴内容');
    return t('ha2Attachment', '附件');
  }

  function localFileSrc(path) {
    var p = String(path || '').trim();
    if (!p) return '';
    try {
      var core = global.__TAURI__ && global.__TAURI__.core;
      if (core && typeof core.convertFileSrc === 'function') return core.convertFileSrc(p);
    } catch (_) {}
    return '';
  }

  function materialCardHtml(x) {
    if (!x || !x.id) return '';
    var kind = String(x.kind || 'text');
    var label = matKindLabel(kind, x.source);
    var closeBtn =
      '<button type="button" class="ha2-mat-card-close" data-ha2-remove="' +
      esc(x.id) +
      '" title="' +
      esc(t('ha2MatRemove', '移除')) +
      '" aria-label="' +
      esc(t('ha2MatRemove', '移除')) +
      '">×</button>';
    var isImg =
      kind === 'image' ||
      !!(x.previewDataUrl) ||
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(x.name || x.path || ''));
    var thumbSrc = x.previewDataUrl || localFileSrc(x.path) || '';
    // Compact image tiles — many can sit in one row.
    if (isImg && thumbSrc) {
      return (
        '<article class="ha2-mat-card ha2-mat-card--thumb" data-ha2-mat-card="' +
        esc(x.id) +
        '" data-kind="image" title="' +
        esc(x.name || label) +
        '">' +
        closeBtn +
        '<img class="ha2-mat-thumb" src="' +
        esc(thumbSrc) +
        '" alt="' +
        esc(x.name || label) +
        '" decoding="async" />' +
        '</article>'
      );
    }
    if (isImg && !thumbSrc) {
      return (
        '<article class="ha2-mat-card ha2-mat-card--thumb is-ph" data-ha2-mat-card="' +
        esc(x.id) +
        '" data-kind="image" title="' +
        esc(x.name || label) +
        '">' +
        closeBtn +
        '<span class="ha2-mat-thumb-ph" aria-hidden="true"></span></article>'
      );
    }
    var body;
    var toggleBtn = '';
    if (kind === 'text') {
      var raw = String(x.content || '');
      var long = isLongMatText(raw);
      var open = !!matTextExpanded[x.id];
      var chars = raw.length;
      // Toggle lives in the header so 收起 stays visible (not under the tall editor).
      if (long) {
        toggleBtn = open
          ? '<button type="button" class="ha2-mat-toggle" data-ha2-mat-collapse="' +
            esc(x.id) +
            '">' +
            esc(t('ha2MatCollapse', '收起')) +
            '</button>'
          : '<button type="button" class="ha2-mat-toggle" data-ha2-mat-expand="' +
            esc(x.id) +
            '">' +
            esc(t('ha2MatExpand', '展开')) +
            '</button>';
      }
      if (long && !open) {
        var prev = raw.replace(/\s+/g, ' ').trim();
        if (prev.length > 96) prev = prev.slice(0, 96) + '…';
        body =
          '<button type="button" class="ha2-mat-preview" data-ha2-mat-expand="' +
          esc(x.id) +
          '" title="' +
          esc(t('ha2MatExpand', '展开全文')) +
          '">' +
          esc(prev || t('ha2MatTextPlaceholder', '粘贴的文字，可直接改')) +
          '</button>' +
          '<div class="ha2-mat-preview-meta"><span>' +
          chars +
          esc(t('ha2MatChars', ' 字')) +
          '</span></div>';
      } else if (long && open) {
        body =
          '<textarea class="ha2-mat-card-text is-open" data-ha2-mat-text="' +
          esc(x.id) +
          '" rows="12" placeholder="' +
          esc(t('ha2MatTextPlaceholder', '粘贴的文字，可直接改')) +
          '">' +
          esc(raw) +
          '</textarea>';
      } else {
        body =
          '<textarea class="ha2-mat-card-text" data-ha2-mat-text="' +
          esc(x.id) +
          '" rows="2" placeholder="' +
          esc(t('ha2MatTextPlaceholder', '粘贴的文字，可直接改')) +
          '">' +
          esc(raw) +
          '</textarea>';
      }
    } else if (kind === 'url') {
      body =
        '<input class="ha2-mat-card-url" data-ha2-mat-text="' +
        esc(x.id) +
        '" type="text" value="' +
        esc(x.content || x.path || x.name || '') +
        '" />';
    } else {
      var sub = x.path || x.description || '';
      body =
        '<div class="ha2-mat-card-file">' +
        '<b>' +
        esc(x.name || label) +
        '</b>' +
        (sub ? '<small title="' + esc(sub) + '">' + esc(sub) + '</small>' : '') +
        '</div>';
    }
    return (
      '<article class="ha2-mat-card ha2-mat-card--wide' +
      (kind === 'text' && matTextExpanded[x.id] ? ' is-text-open' : '') +
      '" data-ha2-mat-card="' +
      esc(x.id) +
      '" data-kind="' +
      esc(kind) +
      '">' +
      '<header class="ha2-mat-card-head"><span class="ha2-mat-card-kind">' +
      esc(label) +
      '</span>' +
      toggleBtn +
      closeBtn +
      '</header>' +
      '<div class="ha2-mat-card-body">' +
      body +
      '</div></article>'
    );
  }

  function attachmentsHtml(snap) {
    var mats = snap.materials || [];
    if (!mats.length) return '';
    var thumbs = [];
    var rest = [];
    var i;
    for (i = 0; i < mats.length; i++) {
      var m = mats[i];
      if (!m) continue;
      var k = String(m.kind || '');
      var img =
        k === 'image' ||
        !!m.previewDataUrl ||
        /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(String(m.name || m.path || ''));
      if (img) thumbs.push(m);
      else rest.push(m);
    }
    return (
      '<div class="ha2-attachments" data-ha2-attachments>' +
      (thumbs.length
        ? '<div class="ha2-mat-thumbs">' + thumbs.map(materialCardHtml).join('') + '</div>'
        : '') +
      rest.map(materialCardHtml).join('') +
      '</div>'
    );
  }

  /** Lucide-style stroke icons (inline; no extra dependency). */
  function lucide(name, size) {
    size = size || 16;
    var paths = {
      'arrow-up':
        '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
      plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
      paperclip:
        '<path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551"/>',
      'chevron-down': '<path d="m6 9 6 6 6-6"/>',
      ellipsis:
        '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
      infinity:
        '<path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"/>',
      mic:
        '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>',
      video:
        '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
      'panel-left':
        '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
      monitor:
        '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>'
    };
    var body = paths[name];
    if (!body) return '';
    return (
      '<svg class="ha2-lucide" data-lucide="' +
      esc(name) +
      '" viewBox="0 0 24 24" width="' +
      size +
      '" height="' +
      size +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      body +
      '</svg>'
    );
  }

  function matMenuHtml() {
    if (!matMenuOpen) return '';
    // Single + menu owns all collect kinds (Focus + ha2).
    return (
      '<div class="ha2-mat-menu" data-ha2-mat-menu role="menu">' +
      '<button type="button" data-ha2-mat="paste">' +
      esc(t('ha2MatPaste', '粘贴')) +
      '</button>' +
      '<button type="button" data-ha2-mat="url">' +
      esc(t('ha2MatUrl', '网址')) +
      '</button>' +
      '<button type="button" data-ha2-mat="folder">' +
      esc(t('ha2MatFolder', '目录')) +
      '</button>' +
      '<button type="button" data-ha2-mat="screenshot">' +
      esc(t('ha2MatScreenshot', '截图')) +
      '</button>' +
      '<button type="button" data-ha2-mat="file">' +
      esc(t('ha2MatFile', '附件')) +
      '</button></div>'
    );
  }

  function closeMatMenu() {
    if (!matMenuOpen) return;
    matMenuOpen = false;
    if (store()) paint(store().getSnapshot());
  }

  /** Outside click / Escape — picker and mat menu must rebound. */
  function onDocPointerDown(e) {
    if (!mounted || !root) return;
    var t = e.target;
    if (modelRouteMenuOpen) {
      if (
        !(
          t &&
          t.closest &&
          (t.closest('[data-ha2-model-route-dd]') ||
            t.closest('[data-ha2-model-route-menu]'))
        )
      ) {
        closeModelRouteMenu();
      }
    } else if (document.querySelector('.ha2-model-dd-menu.is-portaled')) {
      // Leftover portal from a prior stuck open — don't leave a click blackhole.
      scrubPortaledOverlays();
    }
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    if (snap && snap.pickerOpen) {
      if (
        !(t && t.closest && (t.closest('[data-ha2-picker-panel]') ||
          t.closest('[data-ha2-picker]') ||
          t.closest('[data-ha2-menu-picker]')))
      ) {
        closePickerSurface();
      }
    }
    if (matMenuOpen) {
      if (!(t && t.closest && (t.closest('[data-ha2-mat-menu]') || t.closest('[data-ha2-add]')))) {
        closeMatMenu();
      }
    }
    var agentPick = root.querySelector('[data-ha2-agent-pick].is-open');
    if (
      agentPick &&
      !(
        t &&
        t.closest &&
        (t.closest('[data-ha2-agent-pick]') || t.closest('[data-ha2-agent-flyout]'))
      )
    ) {
      closeAgentFlyout();
    }
  }

  /** Portaled menus live on document.body — forward their clicks into onClick. */
  function onPortaledDocClick(e) {
    if (!mounted || !e || !e.target || !e.target.closest) return;
    if (
      !e.target.closest(
        '.ha2-model-dd-menu.is-portaled, .ha2-picker.is-portaled'
      )
    ) {
      return;
    }
    onClick(e);
  }

  function onDocKeyDown(e) {
    if (!mounted || !e) return;
    // Ctrl/Cmd+Enter in draft → aim + paste send (same as ↑).
    if (
      (e.key === 'Enter' || e.key === 'NumpadEnter') &&
      (e.ctrlKey || e.metaKey) &&
      e.target &&
      e.target.matches &&
      e.target.matches('[data-ha2-draft]')
    ) {
      e.preventDefault();
      send();
      return;
    }
    if (
      (e.key === 'Enter' || e.key === 'NumpadEnter') &&
      (e.ctrlKey || e.metaKey) &&
      e.target &&
      e.target.matches &&
      e.target.matches('[data-ha2-wb-page-draft]')
    ) {
      e.preventDefault();
      sendWbPageDraft();
      return;
    }
    if (e.key !== 'Escape') return;
    if (modelRouteMenuOpen) {
      e.preventDefault();
      closeModelRouteMenu();
      return;
    }
    if (wbChatPageOpen) {
      e.preventDefault();
      closeWbChatPage();
      return;
    }
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    if (snap && snap.pickerOpen) {
      e.preventDefault();
      closePickerSurface();
      return;
    }
    if (matMenuOpen) {
      e.preventDefault();
      closeMatMenu();
      return;
    }
    if (root && root.querySelector('[data-ha2-agent-pick].is-open')) {
      e.preventDefault();
      closeAgentFlyout();
    }
  }

  /** Crosshair mark: dashed = need aim, solid green = locked. */
  function aimChipHtml(hasAim) {
    var label = hasAim ? t('ha2AimLocked', '已对准输入框') : t('ha2AimNow', '现在定位');
    var tip = hasAim
      ? t('ha2AimLockedTip', '已对准当前 Agent 输入框，发送时会快速粘贴')
      : t(
          'ha2AimTip',
          '点击准星：提前定位当前选中 Agent 的输入框，便于快速发送'
        );
    return (
      '<button type="button" class="ha2-aim-chip' +
      (hasAim ? ' is-ok' : ' is-off') +
      '" data-ha2-aim data-ot-tip-prefer="above" data-ot-tip="' +
      esc(tip) +
      '" aria-label="' +
      esc(label) +
      '"><span class="ha2-aim-ico" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none">' +
      '<circle cx="12" cy="12" r="7.25" stroke="currentColor" stroke-width="2"/>' +
      '<circle class="ha2-aim-dot" cx="12" cy="12" r="2.6" fill="currentColor"/>' +
      '<path d="M12 2.75v2.6M12 18.65v2.6M2.75 12h2.6M18.65 12h2.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '</svg></span></button>'
    );
  }

  function syncAimChip(hasAim) {
    var aimBtn = root && root.querySelector('[data-ha2-aim]');
    var aimClear = root && root.querySelector('[data-ha2-aim-clear]');
    if (aimBtn) {
      var label = hasAim ? t('ha2AimLocked', '已对准输入框') : t('ha2AimNow', '现在定位');
      var tip = hasAim
        ? t('ha2AimLockedTip', '已对准当前 Agent 输入框，发送时会快速粘贴')
        : t(
            'ha2AimTip',
            '点击准星：提前定位当前选中 Agent 的输入框，便于快速发送'
          );
      aimBtn.classList.toggle('is-ok', hasAim);
      aimBtn.classList.toggle('is-off', !hasAim);
      aimBtn.setAttribute('aria-label', label);
      aimBtn.setAttribute('data-ot-tip', tip);
      aimBtn.setAttribute('data-ot-tip-prefer', 'above');
      aimBtn.removeAttribute('title');
    }
    if (aimClear) aimClear.hidden = !hasAim;
  }

  /** Inline horizontal agent row inside compose — no floating picker. */
  function agentTipFor(name) {
    return (
      t('ha2AgentTipSelect', '选中「') +
      name +
      t('ha2AgentTipSend', '」：发送提示词给 ') +
      name +
      t('ha2AgentTipAim', '。点击准星可提前定位 ') +
      name +
      t('ha2AgentTipAimEnd', ' 输入框，便于快速发送')
    );
  }

  function agentIcoBtnHtml(a, selected, opts) {
    opts = opts || {};
    if (!a || !a.id) return '';
    var name = String(a.name || a.id);
    var on = a.id === selected ? ' on' : '';
    var attrs = opts.toggle
      ? ' data-ha2-agent-toggle aria-haspopup="listbox" aria-expanded="false"'
      : ' role="option" aria-selected="' +
        (on ? 'true' : 'false') +
        '" data-ha2-pick="' +
        esc(a.id) +
        '"';
    return (
      '<button type="button" class="ha2-agent-ico' +
      on +
      '"' +
      attrs +
      ' data-ot-tip-prefer="above" data-ot-tip="' +
      esc(agentTipFor(name)) +
      '" aria-label="' +
      esc(name) +
      '">' +
      iconHtml(a, 'ha2-agent-ico-img') +
      '</button>'
    );
  }

  function agentCatalogSig(snap) {
    return ((snap && snap.catalog) || [])
      .map(function (a) {
        return a && a.id ? a.id : '';
      })
      .filter(Boolean)
      .join('|');
  }

  function agentCurrentCat(snap) {
    var catalog = (snap && snap.catalog) || [];
    var selected = String((snap && snap.selectedKind) || '');
    var i;
    for (i = 0; i < catalog.length; i++) {
      if (catalog[i] && catalog[i].id === selected) return catalog[i];
    }
    return catalog[0] || { id: '', name: t('ha2PickAgent', '选择 Agent') };
  }

  /** Fused aim + one selected agent (idle). Flyout is a sibling inside compose. */
  function agentStripHtml(snap, hasAim) {
    var selected = String((snap && snap.selectedKind) || '');
    var cur = agentCurrentCat(snap);
    var sig = agentCatalogSig(snap);
    return (
      '<div class="ha2-agent-pick" data-ha2-agent-pick data-ha2-agent-strip data-sig="' +
      esc(sig) +
      '"><div class="ha2-agent-fused">' +
      aimChipHtml(!!hasAim) +
      '<button type="button" class="ha2-link ha2-aim-clear" data-ha2-aim-clear' +
      (hasAim ? '' : ' hidden') +
      ' title="' +
      esc(t('ha2AimClear', '清除')) +
      '">' +
      esc(t('ha2AimClear', '清除')) +
      '</button>' +
      agentIcoBtnHtml(cur, selected, { toggle: true }) +
      '</div></div>'
    );
  }

  function agentFlyoutHtml(snap) {
    var catalog = (snap && snap.catalog) || [];
    var selected = String((snap && snap.selectedKind) || '');
    var fly = catalog
      .map(function (a) {
        return agentIcoBtnHtml(a, selected, {});
      })
      .filter(Boolean)
      .join('');
    return (
      '<div class="ha2-agent-flyout" data-ha2-agent-flyout hidden role="listbox" aria-label="' +
      esc(t('ha2PickTarget', '选择发送目标')) +
      '">' +
      fly +
      '</div>'
    );
  }

  function agentFlyoutEl() {
    return (
      (root && root.querySelector('[data-ha2-compose] > [data-ha2-agent-flyout]')) ||
      (root && root.querySelector('[data-ha2-agent-flyout]'))
    );
  }

  function closeAgentFlyout() {
    var pick = root && root.querySelector('[data-ha2-agent-pick]');
    var fly = agentFlyoutEl();
    var trig = pick && pick.querySelector('[data-ha2-agent-toggle]');
    if (pick) pick.classList.remove('is-open');
    if (root) {
      var compose = root.querySelector('[data-ha2-compose]');
      if (compose) compose.classList.remove('is-agent-open');
    }
    if (fly) fly.hidden = true;
    if (trig) trig.setAttribute('aria-expanded', 'false');
  }

  function openAgentFlyout() {
    var pick = root && root.querySelector('[data-ha2-agent-pick]');
    var fly = agentFlyoutEl();
    var trig = pick && pick.querySelector('[data-ha2-agent-toggle]');
    if (pick) pick.classList.add('is-open');
    if (root) {
      var compose = root.querySelector('[data-ha2-compose]');
      if (compose) compose.classList.add('is-agent-open');
    }
    if (fly) fly.hidden = false;
    if (trig) trig.setAttribute('aria-expanded', 'true');
  }

  function syncAgentStrip(snap) {
    if (askModeOn(snap) || atrEditPathOn(snap)) {
      if (askModeOn(snap)) clearAskModeTargetChrome();
      return false;
    }
    var pick = root && root.querySelector('[data-ha2-agent-pick],[data-ha2-agent-strip]');
    if (!pick) return false;
    var selected = String((snap && snap.selectedKind) || '');
    var catalog = (snap && snap.catalog) || [];
    var sig = agentCatalogSig(snap);
    var wasOpen = pick.classList.contains('is-open');
    var appId = (agentCurrentCat(snap) && agentCurrentCat(snap).appId) || '';
    var hasAim = !!(snap.aimByAppId && snap.aimByAppId[appId] && snap.aimByAppId[appId].hasActive);
    if (pick.getAttribute('data-sig') !== sig) {
      var wrap = document.createElement('div');
      wrap.innerHTML = agentStripHtml(snap, hasAim);
      var next = wrap.firstChild;
      if (next) {
        pick.replaceWith(next);
        pick = next;
      }
      var flyHost = agentFlyoutEl();
      var flyWrap = document.createElement('div');
      flyWrap.innerHTML = agentFlyoutHtml(snap);
      if (flyHost && flyWrap.firstChild) flyHost.replaceWith(flyWrap.firstChild);
      else if (flyWrap.firstChild) {
        var compose = root.querySelector('[data-ha2-compose]');
        var rail = compose && compose.querySelector('[data-ha2-compose-rail]');
        if (rail && rail.parentNode) rail.parentNode.insertBefore(flyWrap.firstChild, rail.nextSibling);
      }
      if (wasOpen) openAgentFlyout();
      return true;
    }
    var cur = agentCurrentCat(snap);
    var trig = pick.querySelector('[data-ha2-agent-toggle]');
    if (trig && cur) {
      var name = String(cur.name || cur.id);
      trig.classList.add('on');
      trig.setAttribute('aria-label', name);
      trig.setAttribute('data-ot-tip', agentTipFor(name));
      trig.setAttribute('data-ot-tip-prefer', 'above');
      trig.innerHTML = iconHtml(cur, 'ha2-agent-ico-img');
    }
    syncAimChip(hasAim);
    var fly = agentFlyoutEl();
    var btns = fly ? fly.querySelectorAll('[data-ha2-pick]') : [];
    var i;
    for (i = 0; i < btns.length; i++) {
      var btn = btns[i];
      var on = btn.getAttribute('data-ha2-pick') === selected;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    return true;
  }

  function targetProjectLabel(snap) {
    var ctx = snap && snap.targetContext;
    if (!ctx || !ctx.projectPath) return t('ha2NoProject', '未选项目');
    var PP = global.OneToneProjectPath;
    if (PP && PP.pathLeaf) return PP.pathLeaf(ctx.projectPath) || ctx.projectPath;
    var parts = String(ctx.projectPath).replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1] || ctx.projectPath;
  }

  function atrEditPathOn(snap) {
    var A = global.OneToneHomeAgentTask;
    return !!(
      snap &&
      snap.workMode === 'edit' &&
      A &&
      A.featureEnabled &&
      A.featureEnabled()
    );
  }

  /** 提问（think/research）：本机大模型，不显示对准准星与桌面 Agent 图标. */
  function askModeOn(snap) {
    return String((snap && snap.workMode) || '') !== 'edit';
  }

  function clearAskModeTargetChrome() {
    if (!root) return;
    var pick = root.querySelector('[data-ha2-agent-pick],[data-ha2-agent-strip]');
    if (pick) pick.remove();
    var fly = agentFlyoutEl();
    if (fly) fly.remove();
    var fuse = root.querySelector('[data-ha2-agent-fuse]');
    if (!fuse) return;
    var aim = fuse.querySelector('[data-ha2-aim]');
    if (aim) aim.remove();
    var clear = fuse.querySelector('[data-ha2-aim-clear]');
    if (clear) clear.remove();
  }

  /** Edit mode: project context only — not a desktop Agent send target. */
  function atrEditTargetChipHtml(_snap) {
    // Project name lives in Focus chrome (top-left) — chip is ATR mode only.
    return (
      '<span class="ha2-chip target is-atr-edit" data-ha2-atr-edit-chip title="' +
      esc(t('ha2AtrEditChipTitle', 'ATR 编辑任务（非投递到桌面 Agent）')) +
      '"><span class="ha2-chip-icon ha2-icon--fallback" aria-hidden="true">' +
      lucide('panel-left', 14) +
      '</span><span class="ha2-chip-copy"><span data-ha2-dest-name>' +
      esc(t('ha2AtrEditChip', 'ATR 编辑')) +
      '</span></span></span>'
    );
  }

  /** Why ↑ is blocked — edit/ATR + gateway chat never require a desktop Agent. */
  function sendBlockReason(snap, draftOverride) {
    var draft =
      draftOverride != null
        ? draftOverride
        : snap && snap.draft
          ? snap.draft
          : '';
    var hasContent =
      !!String(draft || '').trim() || !!(snap && snap.materials && snap.materials.length);
    if (wbChatBusy) return t('ha2WbChatting', '正在回复…');
    // Edit → ATR: allow approve / view progress / confirm without fresh draft.
    if (String((snap && snap.workMode) || '') === 'edit') {
      if (atrNeedsApproval(snap)) return '';
      if (workConfirmOpen && workConfirmGoal) return '';
      if (atrTaskBusy(snap)) return '';
      if (!hasContent) return t('ha2SendNeedDraft', '先写一句再发送');
      return '';
    }
    if (!hasContent) return t('ha2SendNeedDraft', '先写一句再发送');
    // Freemodel / API chat: draft alone is enough.
    if (gatewayChatEligible(snap)) return '';
    var ctx = snap && snap.targetContext;
    if (!(ctx && ctx.kind)) return t('ha2PickAgent', '选择 Agent');
    return '';
  }

  function canSendNow(snap, draftOverride) {
    return !sendBlockReason(snap, draftOverride);
  }

  /** Center row agentId, or synthetic kind:… when inventory/FG picked an agent with no row. */
  function sendAgentIdFor(kind, snap) {
    var list = (snap && snap.agents) || [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].kind === kind && list[i].agentId) return list[i].agentId;
    }
    var Policy = global.OneToneHomeActionPolicy;
    if (Policy && typeof Policy.syntheticAgentId === 'function') {
      return Policy.syntheticAgentId(kind === 'codex' ? 'chatgpt' : kind);
    }
    return kind ? 'kind:' + kind : '';
  }

  function agentCapBtn(caps, key, label) {
    var ico =
      key === 'softPad'
        ? lucide('panel-left', 14)
        : key === 'voice'
          ? lucide('mic', 14)
          : key === 'camera'
            ? lucide('video', 14)
            : '';
    return (
      '<button type="button" class="' +
      capClass(caps[key], key) +
      ' ha2-cap--icon" data-ha2-cap="' +
      esc(key) +
      '" title="' +
      esc(label) +
      '" aria-label="' +
      esc(label) +
      '">' +
      ico +
      '<span class="ha2-cap-lbl">' +
      esc(label) +
      '</span></button>'
    );
  }

  function concierge() {
    return global.OneToneHomeContextConcierge || null;
  }

  function draftTextNow() {
    var ta = root && root.querySelector('[data-ha2-draft]');
    if (ta && typeof ta.value === 'string') return ta.value;
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    return (snap && snap.draft) || '';
  }

  /** Consult UI retired — home send goes ATR edit, not会诊. */
  function consultStripHtml(_snap) {
    return '';
  }

  function runConsultClarify() {
    var C = concierge();
    var S = store();
    if (!C) return;
    var raw = draftTextNow();
    C.restateLocal(raw);
    var decision = C.decide(raw);
    if (decision && decision.action === 'suggest_evidence') {
      C.suggestEvidence({ rawText: raw }).then(function () {
        if (S) paint(S.getSnapshot());
      });
    }
    if (S) {
      S.setValidationNotice({
        kind: 'consult',
        message: t('ha2ConsultRestated', '已生成问题复述（建议稿，请确认）')
      });
      paint(S.getSnapshot());
    }
  }

  function runConsultCompile() {
    var C = concierge();
    var S = store();
    if (!C || !C.compileTask) return;
    var pack = C.compileTask({ rawText: draftTextNow() });
    if (!pack || !pack.body) return;
    syncDraftMirrors(pack.body);
    if (S && S.setDraft) S.setDraft(pack.body, { silent: true });
    var Prep = global.OneToneHomePromptPrep;
    if (Prep && Prep.setDraftBody) {
      try {
        Prep.setDraftBody(pack.body, { skipSync: true });
      } catch (_) {}
    }
    if (S) {
      S.setValidationNotice({
        kind: 'consult',
        message: t(
          'ha2ConsultCompiled',
          pack.level === 'conditional_change'
            ? '已按当前证据生成有条件修改建议（可再编辑后发送）'
            : '已生成调查检查单（可再编辑后发送）'
        )
      });
      paint(S.getSnapshot());
    }
  }

  function runConsultFindMaterials() {
    var C = concierge();
    var S = store();
    if (!C) return;
    var projectId =
      (S && S.getSnapshot && S.getSnapshot().project && S.getSnapshot().project.id) ||
      (S && S.getSnapshot && S.getSnapshot().focusDto && S.getSnapshot().focusDto.project &&
        S.getSnapshot().focusDto.project.id) ||
      '';
    var ok = false;
    try {
      ok = global.confirm
        ? global.confirm(
            t(
              'ha2ConsultFindConfirm',
              '允许 OneTone 在当前任务中按预算寻找候选材料？候选正文仍需你确认后才会发送。'
            )
          )
        : false;
    } catch (_) {}
    if (!ok) return;
    if (!projectId) {
      if (S) {
        S.setValidationNotice({
          kind: 'consult',
          message: t('ha2ConsultNoProject', '请先确认当前项目，或使用「手动添加材料」')
        });
      }
      return;
    }
    C.syncCapsule({ projectId: projectId });
    C.requestFindMaterials(projectId)
      .then(function () {
        return C.suggestEvidence({ rawText: draftTextNow() });
      })
      .then(function (res) {
        if (!S) return;
        var n = (res && res.candidates && res.candidates.length) || 0;
        S.setValidationNotice({
          kind: 'consult',
          message:
            n > 0
              ? t('ha2ConsultFindDone', '已查找候选；采用后才会进入发送材料') +
                ' · ' +
                n +
                t('ha2ConsultFindCount', ' 条（未采用）')
              : t(
                  'ha2ConsultFindEmpty',
                  '已授权但未找到候选 — 草稿写个关键词（如 README / error）再点查找'
                )
        });
        paint(S.getSnapshot());
      })
      .catch(function (err) {
        if (S) {
          S.setValidationNotice({
            kind: 'consult',
            message:
              t('ha2ConsultFindFail', '暂时无法查找工程材料') +
              ' · ' +
              String((err && err.message) || err || '') +
              ' · ' +
              t('ha2ConsultFindFailNext', '仍可直接发送或手动添加材料')
          });
          paint(S.getSnapshot());
        }
      });
  }

  function dockStaticHtml(snap) {
    var c = currentCat(snap);
    var caps = snap.capabilities || {};
    var appId = c.appId || '';
    var aim = (snap.aimByAppId && snap.aimByAppId[appId]) || {};
    var hasAim = !!aim.hasActive;
    var panel = capPanelText(caps, snap);
    var sendOk = canSendNow(snap);
    var atrEdit = atrEditPathOn(snap);
    var draftLabel = atrEdit
      ? t('ha2AtrDraftLabel', '描述要改的代码或文件')
      : t('ha2DraftLabelChat', '继续讨论或整理方案');
    var draftPh = atrEdit
      ? t('ha2AtrDraftPlaceholder', '例如：把 README 复制到桌面 / 给登录页加错误提示…')
      : t('ha2DraftPlaceholderChat', '聊思路、读代码疑问，或生成给其他模型的步骤…');
    // 提问：无对准 / Agent 图标。投递：桌面 Agent 条。ATR 编辑：项目芯片。
    var askMode = askModeOn(snap);
    var targetChip = atrEdit
      ? atrEditTargetChipHtml(snap)
      : askMode
        ? ''
        : agentStripHtml(snap, hasAim);
    var agentFly = atrEdit || askMode ? '' : agentFlyoutHtml(snap);
    var providerDue = (function () {
      var fm = freemodelChannelsApi();
      var n =
        fm && fm.dueCount ? fm.dueCount({ readyIds: freemodelReadyIds() }) : 0;
      return n
        ? '<span class="ha2-fm-due-badge" aria-label="' +
            esc(t('ha2FmDue', '待开通')) +
            '">' +
            n +
            '</span>'
        : '';
    })();
    var sendHint = sendOk
      ? atrEdit
        ? workPrimaryCtaLabel(snap) + '（Ctrl+Enter）'
        : gatewayChatEligible(snap)
          ? t('ha2WbLocalSendHint', '本机对话（Ctrl+Enter）')
          : t('ha2SendHint', '发送（Ctrl+Enter）')
      : atrEdit
        ? t('ha2SendNeedDraft', '先写一句再发送')
        : gatewayChatEligible(snap)
          ? t('ha2SendNeedDraft', '先写一句再发送')
          : !c.id
            ? t('ha2PickAgent', '选择 Agent')
            : t('ha2SendNeedDraft', '先写一句再发送');
    return (
      '<div class="ha2-dock-zone"><section class="ha2-dock ha2-drop" data-ha2-drop>' +
      '<div data-ha2-wb-transcript-host>' +
      wbTranscriptHtml(c.id) +
      '</div>' +
      /* Consult above draft so restatement is not buried under the editor. */
      '<div data-ha2-consult-host>' +
      consultStripHtml(snap) +
      '</div>' +
      '<div class="ha2-compose" data-ha2-compose><label class="ha2-sr-only" for="ha2-draft-input">' +
      esc(draftLabel) +
      '</label><textarea id="ha2-draft-input" class="ha2-editor" data-ha2-draft aria-label="' +
      esc(draftLabel) +
      '" placeholder="' +
      esc(draftPh) +
      '" rows="3"></textarea>' +
      '<div class="ha2-compose-rail" data-ha2-compose-rail>' +
      '<div class="ha2-compose-rail-left">' +
      '<div class="ha2-agent-fuse" data-ha2-agent-fuse>' +
      targetChip +
      '<span class="ha2-model-route-host" data-ha2-model-route-host' +
      (atrEdit ? ' hidden' : '') +
      '>' +
      modelRouteSelectHtml(snap) +
      '</span>' +
      '<span class="ha2-wb-mode-host" data-ha2-wb-mode-host' +
      (atrEdit ? ' hidden' : '') +
      '>' +
      wbModeToggleHtml(c.id, snap) +
      '</span>' +
      '<span class="ha2-wb-model-host" data-ha2-wb-model-host hidden></span>' +
      '<span class="ha2-atr-provider-host" data-ha2-atr-provider-host' +
      (atrEdit ? '' : ' hidden') +
      '>' +
      atrProviderSelectHtml(snap) +
      '</span></div></div>' +
      '<div class="ha2-compose-rail-right">' +
      '<button type="button" class="ha2-link ha2-organize ha2-work-secondary" data-ha2-work-secondary data-ha2-organize title="' +
      esc(t('ha2OrganizeTask', '整理任务')) +
      '"' +
      // Idle: hide until + loads materials. syncOrganizeChrome reveals.
      ' hidden' +
      '>' +
      esc(t('ha2OrganizeTask', '整理')) +
      '</button>' +
      '<button type="button" class="ha2-link ha2-organize-cancel" data-ha2-organize-cancel hidden>' +
      esc(t('ha2OrganizeCancel', '取消')) +
      '</button>' +
      '<button type="button" class="ha2-compose-more" data-ha2-compose-more title="' +
      esc(t('ha2ComposeMore', '更多')) +
      '" aria-expanded="false" aria-controls="ha2-compose-overflow">' +
      lucide('ellipsis', 16) +
      '</button>' +
      '<div class="ha2-add-wrap"><button type="button" class="ha2-round" data-ha2-add title="' +
      esc(t('ha2AddMaterial', '加入材料')) +
      '" aria-label="' +
      esc(t('ha2AddMaterial', '加入材料')) +
      '">' +
      lucide('plus', 16) +
      '</button>' +
      matMenuHtml() +
      '</div>' +
      '<button type="button" class="ha2-send' +
      (atrEdit ? ' is-labeled' : '') +
      '" data-ha2-send ' +
      (sendOk ? '' : 'disabled') +
      ' title="' +
      esc(sendHint) +
      '" aria-label="' +
      esc(atrEdit ? workPrimaryCtaLabel(snap) : t('ha2Send', '发送')) +
      '">' +
      (atrEdit ? esc(workPrimaryCtaLabel(snap)) : lucide('arrow-up', 16)) +
      '</button></div></div>' +
      agentFly +
      '<div class="ha2-compose-overflow" id="ha2-compose-overflow" data-ha2-compose-overflow hidden>' +
      '<div class="ha2-channel-caps" role="group" aria-label="' +
      esc(t('ha2ChannelCaps', '通道能力')) +
      '">' +
      agentCapBtn(caps, 'softPad', t('ha2SoftPad', 'Soft Pad')) +
      agentCapBtn(caps, 'voice', t('ha2Voice', '语音')) +
      agentCapBtn(caps, 'camera', t('ha2Camera', '摄像头')) +
      '</div>' +
      replyToneSegmentHtml() +
      '<span class="ha2-wb-account-host" data-ha2-wb-account-host' +
      (atrEdit ? ' hidden' : '') +
      '>' +
      wbAccountChipHtml(snap) +
      '</span>' +
      '<button type="button" class="ha2-link ha2-model-provider-cta" data-ha2-open-model-providers' +
      (atrEdit ? ' hidden' : '') +
      ' title="' +
      esc(t('ha2ModelProviders', '模型提供方')) +
      '">' +
      esc(t('ha2ModelProvidersShort', '提供方')) +
      providerDue +
      '</button></div></div>' +
      '<div data-ha2-attach-host>' +
      attachmentsHtml(snap) +
      '</div>' +
      '<div class="ha2-cap-panel' +
      (panel ? ' is-show' : '') +
      '" data-ha2-cap-panel' +
      (panel ? '' : ' hidden') +
      '>' +
      esc(panel) +
      '</div>' +
      '<div data-ha2-atr-wb-login-host>' +
      atrWbLoginHtml(snap) +
      '</div></section></div>'
    );
  }

  function agentPickButtons(snap, layout) {
    var catalog = snap.catalog || [];
    var locked = !!snap.userLocked;
    return catalog
      .map(function (a) {
        var on =
          layout === 'list'
            ? locked && a.id === snap.selectedKind
              ? ' on'
              : ''
            : a.id === snap.selectedKind
              ? ' on'
              : '';
        if (layout === 'list') {
          return (
            '<button type="button" class="ha2-picker-row' +
            on +
            '" role="option" aria-selected="' +
            (on ? 'true' : 'false') +
            '" data-ha2-pick="' +
            esc(a.id) +
            '">' +
            iconHtml(a, 'ha2-icon ha2-picker-row-ico') +
            '<span class="ha2-picker-row-name">' +
            esc(a.name) +
            '</span></button>'
          );
        }
        return (
          '<button type="button" class="' +
          (on ? 'on' : '') +
          '" data-ha2-pick="' +
          esc(a.id) +
          '">' +
          iconHtml(a) +
          esc(a.name) +
          '</button>'
        );
      })
      .join('');
  }

  /** Top-right: Soft Pad dark-glass vertical list. Dock: icon grid. Never shared. */
  function pickerHtml(snap) {
    if (!snap.pickerOpen || !pickerSurface) return '';
    if (pickerSurface === 'menu') {
      var followOn = !snap.userLocked ? ' on' : '';
      return (
        '<aside class="ha2-picker is-menu" data-ha2-picker-panel data-ha2-picker-kind="menu" role="listbox" aria-label="' +
        esc(t('ha2PickAgent', '选择 Agent')) +
        '"><button type="button" class="ha2-picker-row ha2-picker-follow' +
        followOn +
        '" role="option" aria-selected="' +
        (followOn ? 'true' : 'false') +
        '" data-ha2-pick-follow>' +
        esc(t('ha2FollowRecogn', '跟随识别')) +
        '</button><div class="ha2-picker-divider" aria-hidden="true"></div><div class="ha2-picker-list">' +
        agentPickButtons(snap, 'list') +
        '</div></aside>'
      );
    }
    return (
      '<aside class="ha2-picker is-dock" data-ha2-picker-panel data-ha2-picker-kind="dock"><div class="ha2-picker-head"><b>' +
      esc(t('ha2PickTarget', '选择发送目标')) +
      '</b><span>' +
      esc(t('ha2PickHint', '点图标只切换目标')) +
      '</span><button type="button" class="ha2-link" data-ha2-picker-close>×</button></div><div class="ha2-grid">' +
      agentPickButtons(snap, 'grid') +
      '</div></aside>'
    );
  }

  function openPickerSurface(surface, anchorEl) {
    var S = store();
    if (!S) return;
    var open = S.getSnapshot().pickerOpen;
    if (open && pickerSurface === surface) {
      pickerSurface = null;
      pickerAnchor = null;
      pickerSide = null;
      S.setPickerOpen(false);
      return;
    }
    pickerSurface = surface;
    pickerAnchor = anchorEl || null;
    pickerSide = null;
    S.setPickerOpen(true);
    schedulePositionPicker();
  }

  function closePickerSurface() {
    pickerSurface = null;
    pickerAnchor = null;
    pickerSide = null;
    scrubPortaledOverlays();
    var S = store();
    if (S) S.setPickerOpen(false);
  }

  function syncDockReserve() {
    if (!root) return;
    var main = root.querySelector('.ha2-main');
    var zone = root.querySelector('.ha2-dock-zone');
    if (!main || !zone) return;
    var h = Math.ceil(zone.getBoundingClientRect().height || 0);
    // Fade + breathing room so receipts above dock are not clipped.
    var pad = Math.max(190, h + 28);
    root.style.setProperty('--ha2-dock-reserve', pad + 'px');
  }

  function ensureDockReserveObserver() {
    if (dockReserveRo || !root || typeof global.ResizeObserver !== 'function') return;
    var zone = root.querySelector('.ha2-dock-zone');
    if (!zone) return;
    dockReserveRo = new global.ResizeObserver(function () {
      syncDockReserve();
    });
    dockReserveRo.observe(zone);
  }

  function ensureShell(snap) {
    if (!root) return;
    // Focus embed: never replace Focus chrome / stage with ha2-shell.
    if (embedMode) {
      var embedDock = root.querySelector('[data-hf-ha2-compose-host],[data-ha2-dock-host]');
      if (embedDock && !embedDock.querySelector('[data-ha2-compose]')) {
        embedDock.innerHTML = dockStaticHtml(snap);
        var taEmbed = embedDock.querySelector('[data-ha2-draft]');
        if (taEmbed) taEmbed.value = snap.draft || '';
      }
      return;
    }
    if (!shellBuilt) {
      root.className = 'now-home is-home-agent-v2';
      root.innerHTML =
        '<div class="ha2-shell"><header class="ha2-top"><div class="ha2-crumb" data-ha2-crumb></div></header><main class="ha2-main"><div class="ha2-content" data-ha2-content></div></main><div data-ha2-picker-host></div><div data-ha2-dock-host></div><div class="ha2-wb-page-host" data-ha2-wb-page-host hidden></div></div>';
      shellBuilt = true;
      var dockHost = root.querySelector('[data-ha2-dock-host]');
      if (dockHost) dockHost.innerHTML = dockStaticHtml(snap);
      var ta = root.querySelector('[data-ha2-draft]');
      if (ta) ta.value = snap.draft || '';
      ensureDockReserveObserver();
      syncDockReserve();
    }
    if (!root.querySelector('[data-ha2-wb-page-host]')) {
      var shell = root.querySelector('.ha2-shell') || root.querySelector('.hn-canvas') || root;
      if (shell) {
        var pageHost = document.createElement('div');
        pageHost.className = 'ha2-wb-page-host';
        pageHost.setAttribute('data-ha2-wb-page-host', '');
        pageHost.hidden = true;
        shell.appendChild(pageHost);
      }
    }
  }

  function patchCrumb(snap) {
    var el = root && root.querySelector('[data-ha2-crumb]');
    if (!el) return;
    var top = root.querySelector('.ha2-top');
    if (snap.view === 'agent') {
      if (top) top.hidden = false;
      var c = currentCat(snap);
      // No「首页」label — agent chrome is just name + close.
      el.innerHTML =
        '<b>' +
        esc(c.name) +
        '</b><span>›</span><button type="button" data-ha2-home>' +
        esc(t('ha2Close', '关闭')) +
        '</button>';
    } else {
      el.innerHTML = '';
      if (top) top.hidden = true;
    }
  }

  function patchContent(snap, force) {
    var el = root && root.querySelector('[data-ha2-content]');
    if (!el) return;
    var key = snap.view + ':' + (snap.view === 'agent' ? snap.selectedKind : 'home');
    if (!force && el.getAttribute('data-ha2-view-key') === key && snap.view === 'home') {
      var perm = el.querySelector('.ha2-permission');
      var nextPerm = permissionHtml(snap);
      if (perm && nextPerm) {
        var pWrap = document.createElement('div');
        pWrap.innerHTML = nextPerm;
        if (pWrap.firstChild) perm.replaceWith(pWrap.firstChild);
      } else if (perm && !nextPerm) {
        perm.remove();
      } else if (!perm && nextPerm) {
        el.insertAdjacentHTML('afterbegin', nextPerm);
      }
      var sit = el.querySelector('[data-ha2-situation]');
      if (sit) {
        var researchFocus =
          document.activeElement &&
          document.activeElement.closest &&
          document.activeElement.closest('[data-ha2-research]');
        var wrap = document.createElement('div');
        wrap.innerHTML = situationHtml(snap);
        var next = wrap.firstChild;
        if (next) {
          if (researchFocus) {
            var oldResearch = sit.querySelector('[data-ha2-research]');
            var newResearch = next.querySelector('[data-ha2-research]');
            if (oldResearch && newResearch) newResearch.replaceWith(oldResearch);
          }
          sit.replaceWith(next);
        }
      }
      var list = el.querySelector('[data-ha2-list]');
      if (list) list.innerHTML = listHtml(snap);
      var noticeHost = el.querySelector('[data-ha2-home-notice]');
      if (noticeHost) noticeHost.innerHTML = homeNoticeHtml(snap);
      return;
    }
    el.setAttribute('data-ha2-view-key', key);
    el.innerHTML = snap.view === 'agent' ? detailContentHtml(snap) : homeContentHtml(snap);
  }

  /** Focus embed: delivery / work-confirm under compose (no full-page content). */
  function patchFocusNotice(snap) {
    if (!root) return;
    var host = root.querySelector('[data-hf-home-notice]');
    if (!host) return;
    var html = '';
    if (workConfirmOpen && atrEditPathOn(snap)) {
      html = workConfirmGateHtml(snap) || '';
    } else {
      html = homeNoticeHtml(snap) || '';
    }
    if (host.innerHTML !== html) host.innerHTML = html;
  }

  function patchDockMeta(snap) {
    if (!root) return;
    var dockHost = root.querySelector('[data-ha2-dock-host]');
    if (!dockHost) return;
    syncAtrProviderHost(snap);
    syncAtrWbLoginHost(snap);
    syncWbAccountHost(snap);
    if (atrEditPathOn(snap)) {
      refreshAtrProviders(!atrProvidersCache).then(function () {
        if (!mounted) return;
        var next = store() && store().getSnapshot();
        syncAtrProviderHost(next);
        syncAtrWbLoginHost(next);
        syncWbAccountHost(next);
      });
    }
    var ta = root.querySelector('.ha2-compose [data-ha2-draft]');
    var focused = document.activeElement && document.activeElement.matches && document.activeElement.matches('[data-ha2-draft]');
    var focusedEl = focused ? document.activeElement : null;
    if (focusedEl) {
      try {
        draftSel.start = focusedEl.selectionStart;
        draftSel.end = focusedEl.selectionEnd;
      } catch (_) {}
    }

    var c = currentCat(snap);
    var atrEdit = atrEditPathOn(snap);
    var askMode = askModeOn(snap);
    var fuse = root.querySelector('[data-ha2-agent-fuse]');
    var composeEl = root.querySelector('[data-ha2-compose]');
    var flyNow = agentFlyoutEl();
    if (atrEdit || askMode) {
      closeAgentFlyout();
      if (flyNow) flyNow.remove();
    }
    if (fuse) {
      var stripNow = fuse.querySelector('[data-ha2-agent-strip]');
      var chipNow = fuse.querySelector('.ha2-chip.target, [data-ha2-atr-edit-chip]');
      var aimHas =
        !!(snap.aimByAppId && snap.aimByAppId[c.appId || ''] && snap.aimByAppId[c.appId || ''].hasActive);
      if (askMode) {
        clearAskModeTargetChrome();
        if (chipNow && chipNow.hasAttribute('data-ha2-atr-edit-chip')) chipNow.remove();
      } else if (atrEdit) {
        if (stripNow) stripNow.remove();
        if (!chipNow || !chipNow.hasAttribute('data-ha2-atr-edit-chip')) {
          var wrapAtr = document.createElement('div');
          wrapAtr.innerHTML = atrEditTargetChipHtml(snap);
          var nextAtr = wrapAtr.firstChild;
          if (chipNow && nextAtr) chipNow.replaceWith(nextAtr);
          else if (nextAtr) fuse.appendChild(nextAtr);
        }
      } else {
        if (chipNow && chipNow.hasAttribute('data-ha2-atr-edit-chip')) {
          var wrapStrip = document.createElement('div');
          wrapStrip.innerHTML = agentStripHtml(snap, aimHas);
          var nextStrip = wrapStrip.firstChild;
          if (nextStrip) chipNow.replaceWith(nextStrip);
          if (!agentFlyoutEl() && composeEl) {
            var rail0 = composeEl.querySelector('[data-ha2-compose-rail]');
            var fw0 = document.createElement('div');
            fw0.innerHTML = agentFlyoutHtml(snap);
            if (rail0 && fw0.firstChild) {
              rail0.parentNode.insertBefore(fw0.firstChild, rail0.nextSibling);
            }
          }
        } else if (!syncAgentStrip(snap) && !stripNow) {
          var wrapNew = document.createElement('div');
          wrapNew.innerHTML = agentStripHtml(snap, aimHas);
          var inserted = wrapNew.firstChild;
          if (inserted) fuse.appendChild(inserted);
          if (!agentFlyoutEl() && composeEl) {
            var rail1 = composeEl.querySelector('[data-ha2-compose-rail]');
            var fw1 = document.createElement('div');
            fw1.innerHTML = agentFlyoutHtml(snap);
            if (rail1 && fw1.firstChild) {
              rail1.parentNode.insertBefore(fw1.firstChild, rail1.nextSibling);
            }
          }
        }
      }
    }
    if (!composing && !(store() && store().isComposing())) {
      syncDraftMirrors(snap.draft || '');
    }
    if (ta) {
      ta.placeholder = atrEdit
        ? t('ha2AtrDraftPlaceholder', '例如：把 README 复制到桌面 / 给登录页加错误提示…')
        : t('ha2DraftPlaceholderChat', '聊思路、读代码疑问，或生成给其他模型的步骤…');
      ta.setAttribute(
        'aria-label',
        atrEdit
          ? t('ha2AtrDraftLabel', '描述要改的代码或文件')
          : t('ha2DraftLabelChat', '继续讨论或整理方案')
      );
    }
    var consultHost = root.querySelector('[data-ha2-consult-host]');
    if (consultHost) consultHost.innerHTML = consultStripHtml(snap);

    var attachHost = root.querySelector('[data-ha2-attach-host]');
    if (attachHost) {
      var matFocus =
        document.activeElement &&
        document.activeElement.matches &&
        document.activeElement.matches('[data-ha2-mat-text]');
      // Keep editable paste card focus while typing — don't rebuild the strip.
      if (!matFocus) attachHost.innerHTML = attachmentsHtml(snap);
    }

    var caps = snap.capabilities || {};
    ['softPad', 'voice', 'camera'].forEach(function (k) {
      var btn = root.querySelector('[data-ha2-cap="' + k + '"]');
      if (btn) btn.className = capClass(caps[k], k) + ' ha2-cap--icon';
    });
    var panelEl = root.querySelector('[data-ha2-cap-panel]');
    if (panelEl) {
      var panel = capPanelText(caps, snap);
      panelEl.textContent = panel;
      panelEl.hidden = !panel;
      panelEl.classList.toggle('is-show', !!panel);
    }

    var appId = c.appId || '';
    var aim = (snap.aimByAppId && snap.aimByAppId[appId]) || {};
    syncAimChip(!!aim.hasActive);
    ensureWbModelForDock(c.id);

    syncModeChrome(snap);
    syncOrganizeChrome();

    var addWrap = root.querySelector('.ha2-add-wrap');
    if (addWrap) {
      var menu = addWrap.querySelector('[data-ha2-mat-menu]');
      if (matMenuOpen && !menu) {
        addWrap.insertAdjacentHTML('beforeend', matMenuHtml());
      } else if (!matMenuOpen && menu) {
        menu.remove();
      }
    }

    var pickerHost = root.querySelector('[data-ha2-picker-host]');
    if (pickerHost) {
      var hadPicker = !!pickerHost.querySelector('[data-ha2-picker-panel]');
      // While open: never rewrite innerHTML — string drift remounted an unpositioned
      // twin and fought the sticky coords (上下交错跳动).
      if (!snap.pickerOpen) {
        var stray = document.querySelector('.ha2-picker.is-portaled[data-ha2-picker-panel]');
        if (stray) {
          restorePortaledMenu(stray);
          stray.remove();
        }
        if (pickerHost.innerHTML) pickerHost.innerHTML = '';
      } else if (pickerSurface && !hadPicker) {
        pickerHost.innerHTML = pickerHtml(snap);
        schedulePositionPicker();
      }
    }
    if (!snap.pickerOpen) {
      pickerAnchor = null;
      pickerSurface = null;
      pickerSide = null;
    }

    if (focusedEl && focusedEl.isConnected) {
      try {
        focusedEl.focus();
        focusedEl.selectionStart = draftSel.start;
        focusedEl.selectionEnd = draftSel.end;
      } catch (_) {}
    }
  }

  var lastView = '';

  function paint(snap) {
    if (!root || !snap) return;
    // Keep the custom model dropdown open while the user is choosing.
    if (modelRouteMenuOpen) return;
    if (composing || (store() && store().isComposing())) {
      // IME: skip dock rebuild, but still refresh ATR steps (failure / tool results).
      var snapIme = store().getSnapshot() || snap;
      syncChatLoopFromAtr(snapIme);
      maybeOpenAtrWbPage(snapIme);
      return;
    }
    // Silent sync — never emit from inside a store subscriber paint.
    if (dock() && dock().syncCapabilityStates) {
      dock().syncCapabilityStates({ silent: true });
    }
    snap = store().getSnapshot();
    syncChatLoopFromAtr(snap);
    ensureShell(snap);
    if (embedMode) {
      // No maybeOpenAtrWbPage — Focus must not get an unsolicited full-page cover.
      // Always patchDockMeta: skipping while pickerOpen/matMenuOpen left Agent/+ dead
      // (menus never got HTML). modelRouteMenuOpen already returns above.
      patchDockMeta(snap);
      patchFocusNotice(snap);
      paintWbTranscript();
      return;
    }
    var viewChanged = lastView !== snap.view;
    lastView = snap.view;
    patchCrumb(snap);
    patchContent(snap, viewChanged);
    patchDockMeta(snap);
    ensureDockReserveObserver();
    syncDockReserve();
    maybeOpenAtrWbPage(snap);
    paintWbTranscript();
  }

  function refreshAimForSelected() {
    var D = dock();
    var snap = store() && store().getSnapshot();
    if (!D || !snap) return;
    var c = currentCat(snap);
    if (c.appId && D.refreshAim) D.refreshAim(c.appId);
  }

  /** Prefetch every catalog agent's aim so the chip flips correctly on switch. */
  function refreshAllAgentAims() {
    var D = dock();
    if (D && D.refreshAllAims) return D.refreshAllAims();
    refreshAimForSelected();
    return Promise.resolve();
  }

  function applyActionClientEffect(res, agentId) {
    var effect = res && res.clientEffect;
    if (!effect) return false;
    var Effects = global.OneToneAgentClientEffects;
    var Center = global.OneToneAgentCenter;
    var apply =
      (Effects && Effects.apply) || (Center && Center.applyClientEffect) || null;
    if (!apply) return false;
    var agent = { agentId: agentId };
    try {
      return !!apply(effect, agent);
    } catch (_) {
      return false;
    }
  }

  function dispatch(actionId, agentId) {
    var S = store();
    var snap = S.getSnapshot();
    var hint =
      (snap.targetContext && snap.targetContext.projectPath) ||
      null;
    S.setActionReceipt({
      phase: 'sending',
      actionId: actionId,
      outcome: 'attempted',
      title: t('ha2ActionSending', '正在尝试 Agent 操作'),
      message: actionId
    });
    return invoke('cmd_agent_center_action', {
      args: {
        agentId: agentId,
        actionId: actionId,
        projectHint: hint,
        attemptId: 'home-v2-' + Date.now().toString(36)
      }
    })
      .then(function (res) {
        var failed = !res || res.outcome === 'failed';
        var verified = !!(res && String(res.outcome || '').toLowerCase() === 'verified');
        S.setActionReceipt({
          actionId: actionId,
          outcome: failed ? 'failed' : verified ? 'verified' : 'attempted',
          title: failed
            ? t('ha2ActionFailed', '操作失败')
            : verified
              ? t('ha2ActionVerified', '操作已确认')
              : t('ha2ActionAttempted', '操作已尝试'),
          message:
            (res && (res.detail || res.error || res.outcome)) || t('ha2NoResult', '未返回结果')
        });
        applyActionClientEffect(res, agentId);
        return S.refresh('action');
      })
      .catch(function (e) {
        S.setActionReceipt({
          actionId: actionId,
          outcome: 'failed',
          title: t('ha2ActionFailed', '操作失败'),
          message: (e && e.message) || String(e)
        });
      });
  }

  function paintWbTranscript() {
    if (!root) return;
    var snap = store() && store().getSnapshot();
    var kind = (snap && snap.selectedKind) || '';
    syncWbChatChrome(kind);
    var host = root.querySelector('[data-ha2-wb-transcript-host]');
    if (host && !wbTranscriptCollapsed && wbChatTurns.length) {
      try {
        host.scrollTop = host.scrollHeight;
      } catch (_) {}
    }
    if (wbChatPageOpen) paintWbChatPage();
  }

  function wbPageTurnsForPaint() {
    var list = wbChatTurns.slice();
    if (wbChatBusy) {
      var thinkId = wbThinkingTurnId || 'stream_think';
      var sid = wbStreamingTurnId || 'stream_live';
      var i;
      var foundThink = -1;
      var foundAns = -1;
      for (i = 0; i < list.length; i++) {
        if (!list[i]) continue;
        if (String(list[i].id) === String(thinkId)) foundThink = i;
        if (String(list[i].id) === String(sid)) foundAns = i;
        if (
          foundThink < 0 &&
          list[i].toolName === 'thinking' &&
          list[i].kind === 'tool_step'
        ) {
          foundThink = i;
          if (!wbThinkingTurnId) thinkId = String(list[i].id);
        }
      }
      // Thinking chip — never dump CoT into the answer bubble. Open while live.
      if (wbStreamingReasoning) {
        var thinkRow = {
          id: thinkId,
          role: 'assistant',
          kind: 'tool_step',
          toolName: 'thinking',
          text: t('ha2ToolThinkingLive', '思考中…'),
          detail: wbStreamingReasoning,
          collapsed: false,
          toolOk: true,
          streaming: true
        };
        if (foundThink >= 0) list[foundThink] = Object.assign({}, list[foundThink], thinkRow);
        else list.push(thinkRow);
        foundThink = foundThink >= 0 ? foundThink : list.length - 1;
      } else if (foundThink >= 0 && list[foundThink]) {
        list[foundThink] = Object.assign({}, list[foundThink], {
          streaming: true,
          collapsed: list[foundThink].collapsed === false ? false : list[foundThink].collapsed
        });
      }
      // Answer bubble only once content starts. While CoT/thinking chip is live,
      // keep the reply empty — no second grey "正在思考…" line.
      if (wbStreamingText) {
        var ansRow = {
          id: sid,
          role: 'assistant',
          text: wbStreamingText,
          streaming: true
        };
        if (foundAns >= 0) list[foundAns] = Object.assign({}, list[foundAns], ansRow);
        else list.push(ansRow);
      } else if (foundThink < 0 && !wbStreamingReasoning) {
        // Waiting for first token with no thinking chip yet.
        var waitRow = {
          id: sid,
          role: 'assistant',
          text: t('ha2ChatLoopStarting', '正在启动工具循环…'),
          streaming: true
        };
        if (foundAns >= 0) list[foundAns] = Object.assign({}, list[foundAns], waitRow);
        else list.push(waitRow);
      }
    }
    return list;
  }

  function atrLogEntriesFrom(task, events, pendingGoal) {
    var out = [];
    var goalText = (task && task.goal) || pendingGoal || '';
    if (goalText) {
      out.push(t('ha2AtrGoalRole', '目标') + '\n' + String(goalText));
    }
    var evs = events || [];
    var i;
    var sawTerminal = false;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i] || {};
      var kind = String(e.kind || '');
      if (
        /^(failed|task_failed|cancelled|task_cancelled|format_error|model_error|budget_exhausted|rate_limited|done|task_done)$/.test(
          kind
        )
      ) {
        sawTerminal = true;
      }
      // User-language step only; JSON / modelExcerpt stay out of the default log.
      out.push(atrUserStepLine(e));
    }
    var st = String((task && task.status) || '');
    var busy =
      st === 'running' || st === 'verifying' || st === 'repair' || st === 'review';
    var live =
      (task && (task.liveThinking || task.live_thinking)) || '';
    // Live SSE thinking while the next tool turn is in flight (not a persisted event).
    if (busy && live && !sawTerminal) {
      out.push(t('ha2AtrThinking', '思考中') + '\n' + String(live).slice(0, 900));
    }
    var err = String((task && (task.lastError || task.last_error)) || '').trim();
    // Failures must appear in the transcript - toast alone is easy to miss.
    if ((st === 'failed' || st === 'cancelled') && err && !sawTerminal) {
      out.push(
        /format/i.test(err)
          ? t(
              'ha2AtrFormatNext',
              '模型未按工具格式行动。可换引擎/模型，或改写目标后重试；也可放弃当前任务。'
            )
          : t('ha2AtrEvFailed', '任务失败') + '\n' + err
      );
    } else if (!evs.length && !live && (pendingGoal || busy)) {
      out.push(
        t('ha2AtrEvPending', '等待模型下一步…') +
          '\n' +
          t('ha2AtrPageStarting', '已打开步骤窗口，正在启动编辑任务…')
      );
    }
    return out;
  }

  function atrLogEntries(snap) {
    return atrLogEntriesFrom(
      snap && snap.agentTask,
      snap && snap.agentTaskEvents,
      atrWbPagePendingGoal
    );
  }

  function atrTaskLogItems(snap) {
    var list = ((snap && snap.agentTaskStack) || []).slice();
    var active = snap && snap.agentTask;
    var activeId = active && active.taskId ? String(active.taskId) : '';
    var i;
    var found = false;
    if (activeId) {
      for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].task && String(list[i].task.taskId) === activeId) {
          list[i] = {
            task: active,
            events: (snap.agentTaskEvents && snap.agentTaskEvents.length
              ? snap.agentTaskEvents
              : list[i].events) || []
          };
          found = true;
          break;
        }
      }
      if (!found) {
        list.push({ task: active, events: snap.agentTaskEvents || [] });
      }
    } else if (atrWbPageForced && atrWbPagePendingGoal) {
      list.push({
        task: {
          taskId: '__pending__',
          goal: atrWbPagePendingGoal,
          status: 'running'
        },
        events: [],
        pending: true
      });
    }
    return list;
  }

  function atrLogPlainFromItem(item) {
    item = item || {};
    var rows = atrLogStepRowsFrom(
      item.task,
      item.events,
      item.pending ? atrWbPagePendingGoal : ''
    );
    var total = atrFormatDuration(atrLogTotalDuration(rows));
    var lines = rows.map(function (row) {
      var head =
        (row.time ? '[' + row.time + '] ' : '') +
        (row.title || '') +
        (row.duration ? ' (' + row.duration + ')' : '') +
        (row.tool ? ' · ' + row.tool : '');
      var body = row.detail ? head + '\n' + row.detail : head;
      if (row.files && row.files.length) {
        body +=
          '\n' +
          row.files
            .map(function (f) {
              return (
                '  ' +
                (f.status || 'M') +
                '  ' +
                f.path +
                (f.bytes != null ? '  ' + atrFormatBytes(f.bytes) : '')
              );
            })
            .join('\n');
      }
      return body;
    });
    if (total) lines.unshift(t('ha2AtrTlMeta', '{n} 步').replace('{n}', String(rows.length)) + ' · ' + total);
    return lines.join('\n\n');
  }

  function copyAtrLog(taskId) {
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    var items = atrTaskLogItems(snap);
    var id = String(taskId || '');
    var item = null;
    var i;
    if (id) {
      for (i = 0; i < items.length; i++) {
        if (items[i] && items[i].task && String(items[i].task.taskId) === id) {
          item = items[i];
          break;
        }
      }
    }
    if (!item) item = items[items.length - 1];
    var text = atrLogPlainFromItem(item);
    if (!text) {
      toast(t('ha2AtrLogCopyEmpty', '没有可复制的步骤'));
      return;
    }
    var copied = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      copied = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {
      copied = false;
    }
    function markCopied(ok) {
      var btn =
        root &&
        root.querySelector(
          '[data-ha2-atr-log-copy="' + String(id).replace(/"/g, '') + '"]'
        );
      if (btn) {
        btn.textContent = ok
          ? t('ha2AtrLogCopied', '已复制')
          : t('ha2AtrLogCopyFail', '复制失败');
      }
      toast(
        ok
          ? t('ha2AtrLogCopied', '已复制步骤')
          : t('ha2AtrLogCopyFail', '复制失败，请手动选择文本')
      );
    }
    if (copied) {
      markCopied(true);
      return;
    }
    var write =
      global.navigator &&
      global.navigator.clipboard &&
      global.navigator.clipboard.writeText
        ? global.navigator.clipboard.writeText(text)
        : Promise.reject(new Error('clipboard_unavailable'));
    write
      .then(function () {
        markCopied(true);
      })
      .catch(function () {
        markCopied(false);
      });
  }

  function atrLogCardHtml(item, activeId) {
    item = item || {};
    var task = item.task || {};
    var id = String(task.taskId || '');
    var isActive = !!(activeId && id === String(activeId));
    // Default collapsed — users only need the latest outcome unless they expand.
    var expanded =
      atrLogExpandedById[id] != null ? !!atrLogExpandedById[id] : false;
    var rows = atrLogStepRowsFrom(
      task,
      item.events,
      item.pending ? atrWbPagePendingGoal : ''
    );
    if (!rows.length) return '';
    var stepCount = rows.filter(function (r) {
      return r && r.kind !== 'goal';
    }).length;
    var totalDur = atrFormatDuration(atrLogTotalDuration(rows));
    var title =
      String(task.goal || '').trim() || t('ha2AtrWorkTask', '当前工作任务');
    var st = String(task.status || '');
    var headMeta = [st || (item.pending ? '…' : ''), totalDur]
      .filter(Boolean)
      .join(' · ');
    return (
      '<div class="ha2-atr-log' +
      (expanded ? ' is-expanded' : '') +
      (isActive ? ' is-active' : '') +
      '" data-ha2-atr-log data-atr-task-id="' +
      esc(id) +
      '">' +
      '<div class="ha2-atr-log-head"><b title="' +
      esc(title) +
      '">' +
      esc(title) +
      '</b><span>' +
      esc(headMeta) +
      '</span></div>' +
      '<div class="ha2-atr-log-bar">' +
      '<button type="button" class="ha2-link" data-ha2-atr-log-toggle="' +
      esc(id) +
      '" aria-expanded="' +
      (expanded ? 'true' : 'false') +
      '">' +
      esc(
        expanded
          ? t('ha2AtrLogCollapse', '收起流程')
          : t('ha2AtrLogExpand', '展开流程') +
              (stepCount > 1
                ? ' · ' +
                  stepCount +
                  t('ha2AtrStepUnit', ' 步') +
                  (totalDur ? ' · ' + totalDur : '')
                : totalDur
                  ? ' · ' + totalDur
                  : '')
      ) +
      '</button>' +
      '<button type="button" class="ha2-link" data-ha2-atr-log-copy="' +
      esc(id) +
      '">' +
      esc(t('ha2AtrLogCopy', '复制')) +
      '</button></div>' +
      atrLogStepsHtml(rows, expanded, task) +
      '</div>'
    );
  }

  function atrWbChatTurnsHtml(model) {
    var since = atrChatSinceMs || 0;
    var all = wbPageTurnsForPaint().filter(Boolean);
    var turns = all.filter(function (turn) {
      if (turn.streaming) return true;
      if (!since) return false;
      var at = Number(turn.at || 0);
      // Only turns after this ATR open — never resurrect prior 对话闲聊 over 工作步骤.
      return at && at >= since;
    });
    if (!turns.length) return '';
    return (
      '<div class="ha2-atr-chat-sep">' +
      esc(t('ha2AtrChatSep', '本次任务后的讨论')) +
      '</div>' +
      turns.map(function (turn) {
        return wbChatTurnHtml(turn, model);
      }).join('')
    );
  }

  function atrWbPageTranscriptHtml(snap) {
    var items = atrTaskLogItems(snap);
    var activeId =
      (snap && snap.agentTask && snap.agentTask.taskId) || '';
    var cards = [];
    var i;
    for (i = 0; i < items.length; i++) {
      var html = atrLogCardHtml(items[i], activeId);
      if (html) cards.push(html);
    }
    var model = wbStreamModel || wbSelectedModelId() || '';
    var chatHtml = atrWbChatTurnsHtml(model);
    if (!cards.length && !chatHtml) {
      return (
        '<div class="ha2-wb-page-empty">' +
        esc(t('ha2AtrPageEmpty', '编辑步骤会出现在这里')) +
        '</div>'
      );
    }
    // Steps first; then local-chat only after this ATR open (not prior 交 Cursor 闲聊).
    return cards.join('') + chatHtml;
  }

  function wbChatPageHtml() {
    var snap = store() && store().getSnapshot();
    var atrMode = atrWbPageMode(snap);
    var atrTask = (atrMode && snap && snap.agentTask) || null;
    var promptIn = {};
    try {
      promptIn = wbLocalPromptInput(snap) || {};
    } catch (_) {}
    var projectLeaf =
      wbStreamProjectLeaf || String(promptIn.projectName || '').trim() || t('ha2NoProject', '未选项目');
    var model = wbStreamModel || wbSelectedModelId() || '';
    var A = global.OneToneHomeAgentTask;
    var provider =
      (A && A.readProvider && A.readProvider()) ||
      (atrProvidersCache && atrProvidersCache.selectedDefault) ||
      '';
    var J = global.OneToneHomeTaskJournal;
    var activeTask = null;
    try {
      if (J && J.getActiveTaskId && J.getTask) {
        activeTask = J.getTask(J.getActiveTaskId());
      }
    } catch (_) {}
    var atrGoalTitle =
      (workConfirmOpen && workConfirmGoal) ||
      (atrTask && atrTask.goal) ||
      atrWbPagePendingGoal ||
      '';
    var taskTitle = atrMode
      ? String(atrGoalTitle).slice(0, 80) || t('ha2AtrWorkTask', '当前工作任务')
      : (activeTask && activeTask.title) || t('ha2WbTaskDefault', '本机对话');
    var turns = wbPageTurnsForPaint();
    var body = atrMode
      ? atrWbPageTranscriptHtml(snap)
      : turns.map(function (turn) {
          return wbChatTurnHtml(turn, model);
        }).join('') ||
        '<div class="ha2-wb-page-empty">' +
          esc(t('ha2WbPageEmpty', '本机讨论会出现在这里（流式回复）')) +
          '</div>';
    var logN = atrMode ? atrTaskLogItems(snap).length : 0;
    var turnN = atrTask && atrTask.currentTurn != null ? atrTask.currentTurn : 0;
    var toolsN = atrTask && atrTask.toolCallCount != null ? atrTask.toolCallCount : 0;
    var statusLine = atrMode
      ? atrTask
        ? t('ha2AtrStepN', '第 {n} 步').replace('{n}', String(turnN || 0)) +
          (toolsN
            ? ' · ' +
              t('ha2AtrToolN', '{n} 次工具').replace('{n}', String(toolsN))
            : '') +
          ' · ' +
          String(atrTask.status || '')
        : t('ha2AtrPageStarting', '已打开步骤窗口，正在启动编辑任务…')
      : '';
    var researchMode = String((snap && snap.workMode) || '') === 'research';
    var draftPh = atrMode
      ? atrTask &&
        String(atrTask.status) === 'waiting' &&
        String(atrTask.waitingReason || '') === 'user_input'
        ? t('ha2AtrPageInputPh', '补充说明…（Ctrl+Enter 继续任务）')
        : t('ha2AtrPageDraftPh', '继续讨论步骤或结果…（Ctrl+Enter）')
      : researchMode
        ? t('ha2ResearchPageDraftPh', '输入调研主题后发送，或点左侧「开始调研」…')
        : t('ha2WbPageDraftPh', '继续讨论…（Ctrl+Enter 发送）');
    var railActs = atrMode
      ? atrActsHtml(snap) +
        '<button type="button" class="ha2-link" data-ha2-open-wb-config>' +
        esc(t('ha2WbOpenConfig', '账号设置')) +
        '</button>'
      : '<button type="button" class="ha2-link" data-ha2-wb-page-clear>' +
        esc(t('ha2WbChatClear', '清空')) +
        '</button>' +
        '<button type="button" class="ha2-link" data-ha2-open-wb-config>' +
        esc(t('ha2WbOpenConfig', '账号设置')) +
        '</button>';
    if (researchMode) {
      body = researchPageBodyHtml(snap);
    }
    return (
      '<div class="ha2-wb-page' +
      (atrMode ? ' is-atr-edit' : '') +
      (researchMode ? ' is-research' : '') +
      '" data-ha2-wb-page' +
      (atrMode ? ' data-ha2-atr-page' : '') +
      (researchMode ? ' data-ha2-research-page' : '') +
      '>' +
      '<aside class="ha2-wb-page-rail">' +
      '<button type="button" class="ha2-link ha2-wb-page-back" data-ha2-wb-page-back>' +
      esc(
        atrMode
          ? t('ha2AtrPageBack', '← 返回')
          : t('ha2WbPageBack', '← 返回首页')
      ) +
      '</button>' +
      '<div class="ha2-wb-page-rail-title">' +
      esc(
        atrMode
          ? t('ha2AtrWorkTask', '当前工作任务') +
            (logN > 1 ? ' · ' + logN : '')
          : researchMode
            ? t('ha2ResearchPageTitle', '调研')
            : t('ha2WbPageTitle', 'WorkBuddy 本机对话')
      ) +
      '</div>' +
      workModeSegmentHtml(snap, { compact: true }) +
      '<div data-ha2-research-host>' +
      researchPanelHtml(snap) +
      '</div>' +
      '<div class="ha2-wb-page-rail-meta">' +
      '<div><span>' +
      esc(t('ha2WbTask', '任务')) +
      '</span><b title="' +
      esc(taskTitle) +
      '">' +
      esc(taskTitle) +
      '</b></div>' +
      '<div><span>' +
      esc(t('ha2Project', '项目')) +
      '</span><b title="' +
      esc(promptIn.projectPath || '') +
      '">' +
      esc(projectLeaf) +
      '</b></div>' +
      (atrMode
        ? '<div><span>' +
          esc(t('ha2AtrStatus', '状态')) +
          '</span><b>' +
          esc(statusLine || '—') +
          '</b></div><div><span>' +
          esc(t('ha2AtrProvider', '引擎')) +
          '</span><b>' +
          esc(provider || '—') +
          '</b></div>'
        : '<div><span>' +
          esc(t('ha2WbModel', '模型')) +
          '</span><b>' +
          esc(model || '—') +
          '</b></div><div><span>' +
          esc(t('ha2WbSendMode', '发送方式')) +
          '</span><b>' +
          esc(t('ha2WbModeLocal', '本机')) +
          '</b></div>') +
      '</div>' +
      (researchMode
        ? ''
        : '<p class="ha2-wb-page-rail-hint" data-ha2-wb-page-hint>' +
          esc(
            atrMode || (snap && snap.workMode) === 'edit'
              ? t(
                  'ha2AtrPageHint',
                  '工作模式：右侧显示读改步骤。对话模式只会聊方案、不会改文件。'
                )
              : t(
                  'ha2WbPageHint',
                  '对话模式：只讨论与生成方案。要联网查资料请切到「调研」。'
                )
          ) +
          '</p>') +
      '<div class="ha2-wb-page-rail-acts">' +
      railActs +
      '</div></aside>' +
      '<section class="ha2-wb-page-main">' +
      '<div class="ha2-wb-page-transcript" data-ha2-wb-page-transcript>' +
      body +
      '</div>' +
      (atrMode ? atrPageNoticeHtml(snap) + atrMainGateHtml(snap) : '') +
      '<div class="ha2-wb-page-compose">' +
      (atrMode || researchMode ? '' : replyToneSegmentHtml()) +
      '<textarea data-ha2-wb-page-draft rows="2" placeholder="' +
      esc(
        (snap && snap.workMode) === 'edit'
          ? t('ha2AtrPageDraftPh', '描述要改什么…（Ctrl+Enter，工作模式会真正读写文件）')
          : draftPh
      ) +
      '" aria-label="' +
      esc(draftPh) +
      '"></textarea>' +
      '<div class="ha2-wb-page-compose-acts">' +
      (wbChatBusy
        ? '<button type="button" class="ha2-btn" data-ha2-wb-page-stop>' +
          esc(t('ha2WbChatStop', '停止')) +
          '</button>'
        : '') +
      '<button type="button" class="ha2-btn primary" data-ha2-wb-page-send' +
      (wbChatBusy ? ' disabled' : '') +
      '>' +
      esc(
        atrMode && String((snap && snap.workMode) || '') === 'edit'
          ? workPrimaryCtaLabel(snap)
          : researchMode
            ? t('ha2ResearchStart', '开始调研')
            : t('ha2Send', '发送')
      ) +
      '</button></div></div></section></div>'
    );
  }

  function researchLiveFeedHtml(rs) {
    var prog = (rs && rs.progress) || {};
    var live = prog.liveSources || [];
    var found = Number(prog.sourcesFound) || live.length || 0;
    var done = Number(prog.sourcesFetched) || 0;
    var pct =
      rs.status === 'synthesizing'
        ? 100
        : found
          ? Math.min(100, Math.round((done / found) * 100))
          : rs.status === 'searching'
            ? 8
            : 0;
    var rows =
      live.length > 0
        ? live
            .map(function (s) {
              var st = String(s.state || 'pending');
              var label =
                st === 'ok'
                  ? t('ha2ResearchLiveOk', '已读取')
                  : st === 'fail'
                    ? t('ha2ResearchLiveFail', '失败')
                    : st === 'snippet'
                      ? t('ha2ResearchLiveSnippet', '仅摘要')
                      : st === 'fetching'
                        ? t('ha2ResearchLiveFetching', '读取中')
                        : t('ha2ResearchLivePending', '等待');
              var meta =
                st === 'ok' && s.chars
                  ? ' · ' + Math.round(Number(s.chars) / 100) / 10 + 'k'
                  : '';
              return (
                '<li class="ha2-research-live-item is-' +
                esc(st) +
                '">' +
                '<span class="ha2-research-live-state">' +
                esc(label) +
                '</span>' +
                '<div class="ha2-research-live-main">' +
                '<strong>' +
                esc(s.title || s.url || s.id) +
                '</strong>' +
                (s.url
                  ? '<a href="' +
                    esc(s.url) +
                    '" target="_blank" rel="noreferrer">' +
                    esc(s.url) +
                    '</a>'
                  : '') +
                '<em>' +
                esc(label + meta) +
                '</em></div></li>'
              );
            })
            .join('')
        : '<li class="ha2-research-live-item is-pending"><span class="ha2-research-live-state">' +
          esc(t('ha2ResearchLivePending', '等待')) +
          '</span><div class="ha2-research-live-main"><strong>' +
          esc(prog.message || t('ha2ResearchRunning', '正在调研…')) +
          '</strong></div></li>';
    return (
      '<div class="ha2-research-live" data-ha2-research-live>' +
      '<div class="ha2-research-live-head">' +
      '<b>' +
      esc(prog.message || t('ha2ResearchRunning', '正在调研…')) +
      '</b>' +
      '<span>' +
      esc(String(done) + '/' + String(found || '—')) +
      '</span></div>' +
      '<div class="ha2-research-bar ha2-research-bar--lg" aria-hidden="true"><i style="width:' +
      pct +
      '%"></i></div>' +
      (Array.isArray(prog.queries) && prog.queries.length
        ? '<p class="ha2-research-live-queries">' +
          esc(t('ha2ResearchLiveQueries', '检索词')) +
          '：' +
          esc(prog.queries.join(' · ')) +
          '</p>'
        : '') +
      (prog.currentUrl
        ? '<p class="ha2-research-live-current">' +
          esc(t('ha2ResearchLiveCurrent', '当前')) +
          ' · <a href="' +
          esc(prog.currentUrl) +
          '" target="_blank" rel="noreferrer">' +
          esc(prog.currentTitle || prog.currentUrl) +
          '</a></p>'
        : '') +
      '<ul class="ha2-research-live-list">' +
      rows +
      '</ul></div>'
    );
  }

  function researchNodesHtml(result, rs) {
    var tasks =
      (rs && rs.progress && rs.progress.tasks) ||
      (rs && rs.tasks) ||
      [];
    var metrics = (result && result.metrics) || (rs && rs.metrics) || null;
    var metricsHtml = '';
    if (metrics) {
      var fsc = metrics.facetSourceCoverage || {};
      var kcc = metrics.keyClaimCiteRate || {};
      metricsHtml =
        '<div class="ha2-research-metrics" data-ha2-research-metrics>' +
        esc(
          'path=' +
            (metrics.path || '') +
            ' · ' +
            (metrics.durationMs != null ? metrics.durationMs + 'ms' : '') +
            ' · search ' +
            (metrics.searchCount || 0) +
            ' · fetch try/ok/fail ' +
            (metrics.fetchAttempt != null
              ? metrics.fetchAttempt
              : (metrics.funnel && metrics.funnel.fetchAttempt) || 0) +
            '/' +
            (metrics.fetchOk || 0) +
            '/' +
            (metrics.fetchFail || 0) +
            (metrics.funnel
              ? ' · funnel ' +
                (metrics.funnel.rawHits || 0) +
                '>' +
                (metrics.funnel.relevantHits || 0) +
                '>' +
                (metrics.funnel.pickedHits || 0)
              : '') +
            ' · model ' +
            (metrics.modelCalls || 0) +
            ' · facets ' +
            (fsc.num || 0) +
            '/' +
            (fsc.den || 0) +
            ' · claims ' +
            (kcc.num || 0) +
            '/' +
            (kcc.den || 0) +
            (metrics.documentMode ? ' · doc ' + metrics.documentMode : '') +
            (metrics.planSource
              ? ' · plan ' +
                metrics.planSource +
                (metrics.intentConfidence ? '/' + metrics.intentConfidence : '')
              : '') +
            (metrics.coverageBlocked ? ' · coverageBlocked' : '') +
            (metrics.degradeReason ? ' · degrade ' + metrics.degradeReason : '')
        ) +
        '</div>';
    }
    if (!tasks.length) {
      return (
        metricsHtml +
        '<div class="ha2-research-nodes" data-ha2-research-nodes">' +
        '<div class="ha2-research-node is-on"><strong>' +
        esc(t('ha2ResearchNodeEmpty', '暂无任务')) +
        '</strong></div></div>'
      );
    }
    return (
      metricsHtml +
      '<div class="ha2-research-nodes" data-ha2-research-nodes aria-label="' +
      esc(t('ha2ResearchNodes', '调研任务')) +
      '">' +
      tasks
        .map(function (n) {
          var st = String(n.status || 'pending');
          return (
            '<div class="ha2-research-node' +
            (st === 'completed' || st === 'running' ? ' is-on' : '') +
            (st === 'running' ? ' is-focus' : '') +
            (st === 'failed' ? ' is-fail' : '') +
            '" data-node="' +
            esc(n.id) +
            '" data-task-status="' +
            esc(st) +
            '">' +
            '<span class="ha2-research-node-role">' +
            esc(n.kind || '') +
            '</span>' +
            '<strong>' +
            esc(n.subject || n.id) +
            '</strong>' +
            '<em>' +
            esc(n.detail || st) +
            '</em>' +
            ((n.error || st === 'failed') ? '<div class="ha2-research-task-actions"><button type="button" class="ha2-btn" data-ha2-research-task-detail="' + esc(n.id) + '">动作详情</button><button type="button" class="ha2-btn" data-ha2-research-task-retry="' + esc(n.id) + '">重试</button></div>' : '') +
            ((n.error || st === 'failed') ? '<pre class="ha2-research-task-error" data-ha2-research-task-error="' + esc(n.id) + '" hidden>' +
              esc(JSON.stringify({ taskId: n.id, kind: n.kind, status: st, attempt: n.attempt || 1, startedAt: n.startedAt || null, finishedAt: n.finishedAt || null, error: n.error || null, actions: ((rs.actions || []).filter(function (a) { return a.taskId === n.id; })) }, null, 2)) +
              '</pre>' : '') +
            '</div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function researchFilePreviewPaneHtml(result, R) {
    var kind = researchFilePreview || 'markdown';
    var md =
      R && R.renderMarkdown ? R.renderMarkdown(result) : String(result.summary || '');
    if (kind === 'html') {
      var htmlDoc =
        R && R.renderHtml ? R.renderHtml(result) : '<pre>' + esc(md) + '</pre>';
      // Strip outer document chrome for embedded preview.
      var bodyMatch = String(htmlDoc).match(/<body[^>]*>([\s\S]*)<\/body>/i);
      var inner = bodyMatch ? bodyMatch[1] : htmlDoc;
      return (
        '<div class="ha2-research-file-pane is-html" data-ha2-research-pane="html">' +
        '<div class="ha2-research-file-pane-label">report.html</div>' +
        '<div class="ha2-research-html-frame">' +
        inner +
        '</div></div>'
      );
    }
    if (kind === 'sources') {
      var srcs = result.sources || [];
      return (
        '<div class="ha2-research-file-pane is-sources" data-ha2-research-pane="sources">' +
        '<div class="ha2-research-file-pane-label">' +
        esc(t('ha2ResearchSources', '来源')) +
        '</div>' +
        (srcs.length
          ? '<ol class="ha2-research-source-preview">' +
            srcs
              .map(function (s) {
                return (
                  '<li><b>[' +
                  esc(s.id) +
                  ']</b> ' +
                  esc(s.title || '') +
                  '<br/><a href="' +
                  esc(s.url) +
                  '" target="_blank" rel="noreferrer">' +
                  esc(s.url) +
                  '</a>' +
                  (s.snippet
                    ? '<p>' + esc(String(s.snippet).slice(0, 220)) + '</p>'
                    : '') +
                  '</li>'
                );
              })
              .join('') +
            '</ol>'
          : '<p class="ha2-research-msg">' +
            esc(t('ha2ResearchNoSources', '无来源')) +
            '</p>') +
        '</div>'
      );
    }
    return (
      '<div class="ha2-research-file-pane is-md" data-ha2-research-pane="markdown">' +
      '<div class="ha2-research-file-pane-label">report.md</div>' +
      '<div class="ha2-research-preview-body">' +
      wbTurnBodyHtml(md, false) +
      '</div></div>'
    );
  }

  function researchReportPreviewHtml(result, R, rs) {
    var srcCount = (result.sources && result.sources.length) || 0;
    return (
      '<article class="ha2-research-preview" data-ha2-research-preview>' +
      '<header class="ha2-research-preview-head">' +
      '<p class="ha2-research-preview-kicker">' +
      esc(t('ha2ResearchPreviewKicker', '调研成稿')) +
      (result.model ? ' · ' + esc(result.model) : '') +
      (srcCount
        ? ' · ' +
          esc(t('ha2ResearchSources', '来源') + ' ' + String(srcCount))
        : '') +
      (result.metrics && result.metrics.documentMode
        ? ' · ' + esc(String(result.metrics.documentMode))
        : '') +
      '</p>' +
      '<h1 class="ha2-research-preview-title">' +
      esc(result.title || t('ha2ResearchTitle', '调研')) +
      '</h1>' +
      (result.summary
        ? '<p class="ha2-research-preview-summary">' + esc(result.summary) + '</p>'
        : '') +
      '</header>' +
      researchNodesHtml(result, rs || {}) +
      '<div class="ha2-research-files-bar">' +
      '<button type="button" class="ha2-research-file' +
      (researchFilePreview === 'markdown' ? ' is-on' : '') +
      '" data-ha2-research-file="markdown">report.md</button>' +
      '<button type="button" class="ha2-research-file' +
      (researchFilePreview === 'html' ? ' is-on' : '') +
      '" data-ha2-research-file="html">report.html</button>' +
      '<button type="button" class="ha2-research-file' +
      (researchFilePreview === 'sources' ? ' is-on' : '') +
      '" data-ha2-research-file="sources">' +
      esc(t('ha2ResearchSourcesFile', 'sources')) +
      '</button></div>' +
      researchFilePreviewPaneHtml(result, R) +
      '</article>'
    );
  }

  function researchPageBodyHtml(snap) {
    var R = global.OneToneHomeResearch;
    var rs =
      (snap && snap.research) ||
      (R && R.getSnapshot ? R.getSnapshot() : null) ||
      {};
    var result = rs.result;
    if (result) {
      return researchReportPreviewHtml(result, R, rs);
    }
    if (rs.status === 'awaiting_approval') {
      var pageIntent = rs.researchIntent || (rs.plan && rs.plan.researchIntent) || {};
      return (
        '<div class="ha2-research-plan-page" data-ha2-research-live>' +
        '<p class="ha2-research-msg">' +
        esc(
          pageIntent.needsClarify
            ? t(
                'ha2ResearchClarifyPage',
                '左侧先选一个更具体的调研方向，再开始。'
              )
            : t(
            'ha2ResearchPlanPage',
            '左侧确认路径与调查面后点「确认并开始」。'
          )
        ) +
        '</p>' +
        researchNodesHtml(null, rs) +
        '</div>'
      );
    }
    if (rs.isRunning) {
      return (
        researchNodesHtml(null, rs) + researchLiveFeedHtml(rs)
      );
    }
    if (rs.status === 'failed' && rs.error) {
      var hint =
        (R && R.nextStepHint && R.nextStepHint(rs.error)) || rs.error.message || '';
      return (
        '<div class="ha2-wb-page-empty">' +
        esc(rs.error.message || t('ha2ResearchFailed', '调研失败')) +
        (hint ? '<br/>' + esc(hint) : '') +
        '</div>'
      );
    }
    return (
      '<div class="ha2-wb-page-empty">' +
      esc(
        t(
          'ha2ResearchPageEmpty',
          '在左侧填写主题后点「开始调研」，或在下方输入主题后发送。'
        )
      ) +
      '</div>'
    );
  }

  /** ATR notices on the work page (home validation strip is hidden behind this view). */
  function atrPageNoticeHtml(snap) {
    var n = snap && snap.validationNotice;
    if (!n || String(n.kind || '').indexOf('atr_') !== 0) return '';
    var inner = validationNoticeHtml(snap);
    if (!inner) return '';
    return '<div data-ha2-atr-page-notice>' + inner + '</div>';
  }

  function maybeOpenAtrWbPage(snap) {
    var live = atrTaskShouldSurface(snap);
    var chatLoop = atrIsChatLoopTask(snap && snap.agentTask);
    var id = live ? String((snap.agentTask && snap.agentTask.taskId) || '') : '';
    // Real task bound — drop the synthetic 「正在启动」placeholder goal.
    if (id && atrWbPagePendingGoal) atrWbPagePendingGoal = '';
    // Chat tool-loop stays on chat transcript chrome (never force ATR edit page).
    if (chatLoop) {
      if (id) atrWbAutoTaskId = id;
      if (!wbChatPageOpen) openWbChatPage({ chatOnly: true });
      else paintWbChatPage();
      return;
    }
    // New task after user closed → reopen once.
    if (live && id && atrWbPageUserClosed && id !== atrWbAutoTaskId) {
      atrWbPageUserClosed = false;
      atrWbPageForced = true;
      atrWbAutoTaskId = id;
      openWbChatPage();
      return;
    }
    if (atrWbPageUserClosed && !atrWbPageForced) {
      return;
    }
    if (atrWbPageForced || live) {
      if (id) atrWbAutoTaskId = id;
      if (!wbChatPageOpen) openWbChatPage();
      else paintWbChatPage();
    }
  }

  /** Live-update ATR/chat page without destroying the compose textarea (poll jank / IME). */
  function patchWbChatPageLive(host, snap) {
    snap = snap || (store() && store().getSnapshot()) || {};
    var atrMode = atrWbPageMode(snap);
    var atrTask = (atrMode && snap.agentTask) || null;
    var researchMode = String((snap && snap.workMode) || '') === 'research';
    var prevTranscript = host.querySelector('[data-ha2-wb-page-transcript]');
    var keepScroll = prevTranscript ? prevTranscript.scrollTop : 0;
    // Only pin to bottom when already near end — never yank while reading history.
    var stickBottom = false;
    if (prevTranscript) {
      stickBottom =
        prevTranscript.scrollHeight -
          prevTranscript.scrollTop -
          prevTranscript.clientHeight <
        72;
    }
    var model = wbStreamModel || wbSelectedModelId() || '';
    var turns = wbPageTurnsForPaint();
    var body = atrMode
      ? atrWbPageTranscriptHtml(snap)
      : researchMode
        ? researchPageBodyHtml(snap)
        : turns.map(function (turn) {
            return wbChatTurnHtml(turn, model);
          }).join('') ||
          '<div class="ha2-wb-page-empty">' +
            esc(t('ha2WbPageEmpty', '本机讨论会出现在这里（流式回复）')) +
            '</div>';
    if (prevTranscript) prevTranscript.innerHTML = body;
    var main = host.querySelector('.ha2-wb-page-main');
    if (main) {
      var noticeEl = main.querySelector('[data-ha2-atr-page-notice]');
      var noticeHtml = atrMode ? atrPageNoticeHtml(snap) : '';
      var gate = main.querySelector('[data-ha2-atr-gate], [data-ha2-work-confirm]');
      var gateHtml = atrMode ? atrMainGateHtml(snap) : '';
      var compose = main.querySelector('.ha2-wb-page-compose');
      if (noticeHtml) {
        if (noticeEl) noticeEl.outerHTML = noticeHtml;
        else if (compose) compose.insertAdjacentHTML('beforebegin', noticeHtml);
      } else if (noticeEl) {
        noticeEl.remove();
      }
      // Re-query: notice insert may sit before gate.
      gate = main.querySelector('[data-ha2-atr-gate], [data-ha2-work-confirm]');
      if (gateHtml) {
        if (gate) gate.outerHTML = gateHtml;
        else if (compose) compose.insertAdjacentHTML('beforebegin', gateHtml);
      } else if (gate) {
        gate.remove();
      }
      var acts = main.querySelector('.ha2-wb-page-compose-acts');
      if (acts) {
        acts.innerHTML =
          (wbChatBusy
            ? '<button type="button" class="ha2-btn" data-ha2-wb-page-stop>' +
              esc(t('ha2WbChatStop', '停止')) +
              '</button>'
            : '') +
          '<button type="button" class="ha2-btn primary" data-ha2-wb-page-send' +
          (wbChatBusy ? ' disabled' : '') +
          '>' +
          esc(
            atrMode && String((snap && snap.workMode) || '') === 'edit'
              ? workPrimaryCtaLabel(snap)
              : t('ha2Send', '发送')
          ) +
          '</button>';
      }
      var draftEl = main.querySelector('[data-ha2-wb-page-draft]');
      if (draftEl && document.activeElement !== draftEl) {
        var draftPh =
          atrMode &&
          atrTask &&
          String(atrTask.status) === 'waiting' &&
          String(atrTask.waitingReason || '') === 'user_input'
            ? t('ha2AtrPageInputPh', '补充说明…（Ctrl+Enter 继续任务）')
            : (snap && snap.workMode) === 'edit'
              ? t(
                  'ha2AtrPageDraftPh',
                  '描述要改什么…（Ctrl+Enter，工作模式会真正读写文件）'
                )
              : researchMode
                ? t(
                    'ha2ResearchPageDraftPh',
                    '输入调研主题后发送，或点左侧「开始调研」…'
                  )
                : t('ha2WbPageDraftPh', '继续讨论…（Ctrl+Enter 发送）');
        draftEl.placeholder = draftPh;
        draftEl.setAttribute('aria-label', draftPh);
      }
      var sendBtn = main.querySelector('[data-ha2-wb-page-send]');
      if (sendBtn && !wbChatBusy) {
        sendBtn.textContent =
          atrMode && String((snap && snap.workMode) || '') === 'edit'
            ? workPrimaryCtaLabel(snap)
            : researchMode
              ? t('ha2ResearchStart', '开始调研')
              : t('ha2Send', '发送');
      }
    }
    var page = host.querySelector('[data-ha2-wb-page]');
    if (page) {
      page.classList.toggle('is-atr-edit', !!atrMode);
      page.classList.toggle('is-research', !!researchMode);
      if (atrMode) page.setAttribute('data-ha2-atr-page', '');
      else page.removeAttribute('data-ha2-atr-page');
      if (researchMode) page.setAttribute('data-ha2-research-page', '');
      else page.removeAttribute('data-ha2-research-page');
    }
    var researchHost = host.querySelector('[data-ha2-research-host]');
    if (researchHost) {
      var researchFocusLive =
        document.activeElement &&
        document.activeElement.closest &&
        document.activeElement.closest('[data-ha2-research]');
      if (!researchFocusLive || !researchHost.contains(document.activeElement)) {
        researchHost.innerHTML = researchPanelHtml(snap);
      }
    }
    var hintEl = host.querySelector('[data-ha2-wb-page-hint]');
    if (hintEl) {
      if (researchMode) {
        hintEl.hidden = true;
      } else {
        hintEl.hidden = false;
        hintEl.textContent =
          atrMode || (snap && snap.workMode) === 'edit'
            ? t(
                'ha2AtrPageHint',
                '工作模式：右侧显示读改步骤。对话模式只会聊方案、不会改文件。'
              )
            : t(
                'ha2WbPageHint',
                '对话模式：只讨论与生成方案。要联网查资料请切到「调研」。'
              );
      }
    }
    var railTitle = host.querySelector('.ha2-wb-page-rail-title');
    if (railTitle && !atrMode) {
      railTitle.textContent = researchMode
        ? t('ha2ResearchPageTitle', '调研')
        : t('ha2WbPageTitle', 'WorkBuddy 本机对话');
    }
    var turnN = atrTask && atrTask.currentTurn != null ? atrTask.currentTurn : 0;
    var toolsN = atrTask && atrTask.toolCallCount != null ? atrTask.toolCallCount : 0;
    var statusLine = atrMode
      ? atrTask
        ? t('ha2AtrStepN', '第 {n} 步').replace('{n}', String(turnN || 0)) +
          (toolsN
            ? ' · ' +
              t('ha2AtrToolN', '{n} 次工具').replace('{n}', String(toolsN))
            : '') +
          ' · ' +
          String(atrTask.status || '')
        : t('ha2AtrPageStarting', '已打开步骤窗口，正在启动编辑任务…')
      : '';
    var metaBs = host.querySelectorAll('.ha2-wb-page-rail-meta b');
    // Meta order: task, project, [status, engine] | [model, sendMode]
    if (atrMode && metaBs.length >= 1) {
      var liveGoal =
        (workConfirmOpen && workConfirmGoal) ||
        (atrTask && atrTask.goal) ||
        atrWbPagePendingGoal ||
        '';
      metaBs[0].textContent =
        String(liveGoal).slice(0, 80) || t('ha2AtrWorkTask', '当前工作任务');
      metaBs[0].setAttribute('title', String(liveGoal || ''));
    }
    if (atrMode && metaBs.length >= 3 && statusLine) {
      metaBs[2].textContent = statusLine;
    }
    var railActs = host.querySelector('.ha2-wb-page-rail-acts');
    if (railActs) {
      railActs.innerHTML = atrMode
        ? atrActsHtml(snap) +
          '<button type="button" class="ha2-link" data-ha2-open-wb-config>' +
          esc(t('ha2WbOpenConfig', '账号设置')) +
          '</button>'
        : '<button type="button" class="ha2-link" data-ha2-wb-page-clear>' +
          esc(t('ha2WbChatClear', '清空')) +
          '</button>' +
          '<button type="button" class="ha2-link" data-ha2-open-wb-config>' +
          esc(t('ha2WbOpenConfig', '账号设置')) +
          '</button>';
    }
    var modeHost = host.querySelector('.ha2-mode-row--segment');
    if (modeHost) {
      var wrap = document.createElement('div');
      wrap.innerHTML = workModeSegmentHtml(snap, { compact: true });
      if (wrap.firstChild) modeHost.replaceWith(wrap.firstChild);
    }
    var transcript = host.querySelector('[data-ha2-wb-page-transcript]');
    if (transcript) {
      try {
        if (stickBottom) transcript.scrollTop = transcript.scrollHeight;
        else transcript.scrollTop = keepScroll;
      } catch (_) {}
    }
  }

  function paintWbChatPage() {
    if (!root) return;
    var host = ensureChatPageHost();
    if (!host) return;
    if (!wbChatPageOpen) {
      host.innerHTML = '';
      host.hidden = true;
      root.classList.remove('is-wb-chat-page');
      return;
    }
    host.hidden = false;
    root.classList.add('is-wb-chat-page');
    var snap = store() && store().getSnapshot();
    var atrMode = atrWbPageMode(snap);
    var page = host.querySelector('[data-ha2-wb-page]');
    var draftEl = host.querySelector('[data-ha2-wb-page-draft]');
    // ATR poll / stream: never rebuild textarea (IME 「自动回车」/ 卡顿).
    if (page && draftEl) {
      if (document.activeElement === draftEl) {
        wbPageDraftText = String(draftEl.value || '');
      } else if (wbPageDraftText && !String(draftEl.value || '')) {
        draftEl.value = wbPageDraftText;
      } else if (draftEl.value) {
        wbPageDraftText = String(draftEl.value || '');
      }
      patchWbChatPageLive(host, snap);
      return;
    }
    // Stash before wipe — Focus remount recreates an empty host.
    if (draftEl) wbPageDraftText = String(draftEl.value || wbPageDraftText || '');
    host.innerHTML = wbChatPageHtml();
    var restored = host.querySelector('[data-ha2-wb-page-draft]');
    if (restored && wbPageDraftText) restored.value = wbPageDraftText;
    var transcript = host.querySelector('[data-ha2-wb-page-transcript]');
    if (transcript) {
      try {
        transcript.scrollTop = transcript.scrollHeight;
      } catch (_) {}
    }
  }

  function openWbChatPage(opts) {
    opts = opts || {};
    wbChatPageOpen = true;
    atrWbPageUserClosed = false;
    // Left-nav「对话」: force chat transcript chrome, not ATR edit.
    if (opts.chatOnly) {
      atrWbPageForced = false;
      atrWbPagePendingGoal = '';
    }
    ensureChatPageHost();
    paintWbChatPage();
  }

  function closeWbChatPage() {
    wbChatPageOpen = false;
    atrWbPageForced = false;
    atrWbPageUserClosed = true;
    atrWbPagePendingGoal = '';
    paintWbChatPage();
  }

  /** Focus embed: page host lives on #nowHomeRoot canvas, not inside the dock. */
  function ensureChatPageHost() {
    if (!root) return null;
    var host = root.querySelector('[data-ha2-wb-page-host]');
    if (host) return host;
    host = document.createElement('div');
    host.className = 'ha2-wb-page-host';
    host.setAttribute('data-ha2-wb-page-host', '');
    host.hidden = true;
    var shell =
      root.querySelector('.hn-canvas') ||
      root.querySelector('.ha2-shell') ||
      root;
    shell.appendChild(host);
    return host;
  }

  function promoteWorkModeForEditGoal(S, snap, text) {
    if (!S || String((snap && snap.workMode) || '') === 'edit') return snap;
    var Caps = global.OneToneHomeAgentCapabilities;
    if (
      !Caps ||
      typeof Caps.looksLikeWorkspaceEditGoal !== 'function' ||
      !Caps.looksLikeWorkspaceEditGoal(text)
    ) {
      return snap;
    }
    if (!atrRuntimeOn()) return snap;
    if (S.setWorkMode) S.setWorkMode('edit');
    toast(t('ha2AutoSwitchedWork', '已切到「工作」：这类目标会改项目文件'));
    return (S.getSnapshot && S.getSnapshot()) || snap;
  }

  function looksLikeEditGoalText(text) {
    var Caps = global.OneToneHomeAgentCapabilities;
    return !!(
      Caps &&
      typeof Caps.looksLikeWorkspaceEditGoal === 'function' &&
      Caps.looksLikeWorkspaceEditGoal(text)
    );
  }

  /** Short replies that continue a waiting ATR — not a brand-new goal. */
  function atrLooksLikeContinueInput(text) {
    var s = String(text || '').trim();
    if (!s) return true;
    return /^(没有补充|无补充|没有|无|继续|继续吧|跳过|好的|可以|行|ok|okay|yes|y|n\/a|none|skip)$/i.test(
      s
    );
  }

  function atrTextIsNewGoal(text, task) {
    var t = String(text || '').trim();
    if (!t || atrLooksLikeContinueInput(t)) return false;
    var g = String((task && task.goal) || '').trim();
    if (!g) return true;
    if (t === g) return false;
    if (g.indexOf(t) >= 0 || t.indexOf(g) >= 0) return false;
    return true;
  }

  /**
   * Chat waiting on request_user_input: short answers ("1"/"了解") continue;
   * a clearly new question ("iphone duo有没有降价?") must start a new loop —
   * otherwise it is swallowed as clarify text and the user sees「不回复」.
   */
  function chatShouldStartNewWhileWaiting(text, task) {
    var t = String(text || '').trim();
    if (!t || !atrTextIsNewGoal(t, task)) return false;
    if (t.length <= 8) return false;
    if (/^[1-9]([\s.、)）]|[、.].*)?$/.test(t)) return false;
    return true;
  }

  /**
   * Work-mode send. User already chose 工作 — default ATR, never regex-kick to chat.
   * Weather is the only dedicated non-ATR IPC (tryHandleWeatherLocal).
   */
  function dispatchEditModeSend(S, snap, text, matSum, opts) {
    opts = opts || {};
    text = String(text || '').trim();
    matSum = String(matSum || '');
    snap = snap || (S && S.getSnapshot && S.getSnapshot()) || {};
    var task = snap.agentTask;
    var st = task ? String(task.status || '') : '';
    var reason = task ? String(task.waitingReason || task.waiting_reason || '') : '';

    if (!S || !S.startAndDriveAgentTask || !atrRuntimeOn()) {
      toast(
        t(
          'ha2AtrNeedFlag',
          '修改代码需开启 Agent Task Runtime（勿设 onetone.agentTaskRuntime=0）'
        )
      );
      return;
    }

    // Empty send while patch waiting → approve (legacy primary CTA).
    if (!text && atrNeedsApproval(snap) && S.approveAgentPatch) {
      S.approveAgentPatch()
        .then(function () {
          if (!mounted) return;
          toast(t('ha2AtrApproved', '已同意这次任务'));
          paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'approve_failed'));
        });
      return;
    }

    // Empty send + live/finished ATR → open steps page (CTA often labeled「查看进度」).
    if (!text && snap.agentTask && atrTaskShouldSurface(snap)) {
      openAtrEditPage(String((snap.agentTask && snap.agentTask.goal) || atrWbPagePendingGoal || ''));
      paint(S.getSnapshot());
      return;
    }

    if (!text) {
      if (S.setValidationNotice) {
        S.setValidationNotice({
          kind: 'atr_need_goal',
          message: t('ha2AtrNeedGoal', '请先写清要改什么')
        });
      }
      return;
    }

    // Weather uses system IPC — not workspace ATR. Everything else stays on work path.
    var Caps = global.OneToneHomeAgentCapabilities;
    if (Caps && typeof Caps.looksLikeWeatherAsk === 'function' && Caps.looksLikeWeatherAsk(text)) {
      if (typeof opts.clearInput === 'function') opts.clearInput();
      var cat = currentCat(snap);
      if (!tryHandleWeatherLocal(text, cat)) sendWbLocal(text, cat);
      return;
    }

    // Continue old task only for short confirmations while waiting on user_input.
    if (
      task &&
      st === 'waiting' &&
      reason === 'user_input' &&
      !atrTextIsNewGoal(text, task) &&
      S.submitAgentInput
    ) {
      if (typeof opts.clearInput === 'function') opts.clearInput();
      S.submitAgentInput(text)
        .then(function () {
          if (!mounted) return;
          paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'input_failed'));
        });
      return;
    }

    // New edit goal while old task still blocking → drop old, start new (one click).
    if (
      task &&
      (atrNeedsApproval(snap) ||
        st === 'waiting' ||
        st === 'interrupted' ||
        atrTaskBusy(snap)) &&
      atrTextIsNewGoal(text, task) &&
      S.abandonAndStartAgentTask
    ) {
      if (typeof opts.clearInput === 'function') opts.clearInput();
      openAtrEditPage(text);
      S.abandonAndStartAgentTask({
        goal: text,
        materialsSummary: matSum
      })
        .then(function () {
          if (!mounted) return;
          paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'atr_failed'));
        });
      return;
    }

    if (atrTaskBusy(snap)) {
      openAtrEditPage((task && task.goal) || text);
      paint(S.getSnapshot());
      return;
    }

    if (typeof opts.clearInput === 'function') opts.clearInput();
    // Product gate: editable plan confirm before any ATR write path.
    // Focus embed: confirm in-place (no atrWbPageForced). Full-page home may force.
    openWorkConfirm(text, matSum, { forcePage: !embedMode });
    if (S) paint(S.getSnapshot());
  }

  function sendWbPageDraft() {
    if (wbChatBusy) return;
    var ta = root && root.querySelector('[data-ha2-wb-page-draft]');
    var text = ta ? String(ta.value || '').trim() : '';
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    // Empty send on work page: CTA often says「查看进度」/「批准」— must not no-op.
    if (!text && String((snap && snap.workMode) || '') === 'edit') {
      dispatchEditModeSend(S, snap, '', materialsSummaryLine(snap), {
        clearInput: function () {
          if (ta) ta.value = '';
          wbPageDraftText = '';
        }
      });
      return;
    }
    if (!text) return;
    snap = promoteWorkModeForEditGoal(S, snap, text);
    var atrTask = snap && snap.agentTask;
    var atrSt = atrTask ? String(atrTask.status || '') : '';
    var atrReason = atrTask ? String(atrTask.waitingReason || '') : '';

    if (String((snap && snap.workMode) || '') === 'research') {
      var Rsend = global.OneToneHomeResearch;
      if (!Rsend || !Rsend.start) {
        toast(t('ha2ResearchMissing', '调研模块未加载'));
        return;
      }
      clearResearchComposeInputs();
      Rsend.start({ topic: text, autoConfirm: false })
        .then(function () {
          if (wbChatPageOpen) paintWbChatPage();
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'research_failed'));
        });
      return;
    }

    if (String((snap && snap.workMode) || '') === 'edit') {
      dispatchEditModeSend(S, snap, text, materialsSummaryLine(snap), {
        clearInput: function () {
          if (ta) ta.value = '';
          wbPageDraftText = '';
        }
      });
      return;
    }
    // ATR still running while UI is on 对话 — don't divert into local chat.
    if (
      atrTask &&
      !atrIsChatLoopTask(atrTask) &&
      (atrSt === 'running' ||
        atrSt === 'verifying' ||
        atrSt === 'repair' ||
        atrSt === 'review' ||
        (atrSt === 'waiting' && atrReason === 'approval'))
    ) {
      // Non-edit chat can still proceed; edit-like waits.
      if (!looksLikeEditGoalText(text)) {
        if (ta) ta.value = '';
        wbPageDraftText = '';
        dispatchChatModeSend(S, snap, text, {
          clearInput: function () {},
          materialsSummary: materialsSummaryLine(snap)
        });
        return;
      }
      toast(
        t(
          'ha2AtrWaitSteps',
          '编辑任务进行中 — 右侧步骤会实时更新；完成或等待补充后再发'
        )
      );
      return;
    }
    if (ta) ta.value = '';
    wbPageDraftText = '';
    dispatchChatModeSend(S, snap, text, {
      clearInput: function () {},
      materialsSummary: materialsSummaryLine(snap)
    });
  }

  function stopWbLocalStream() {
    var atrId = chatLoopTaskId;
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    var task = snap && snap.agentTask;
    if (!atrId && atrIsChatLoopTask(task)) {
      atrId = String((task && task.taskId) || '');
    }
    if (atrId) {
      var A = global.OneToneHomeAgentTask;
      // Keep chatLoopTaskId until cancel settles — else poll sync re-sticks busy.
      chatStopPendingId = String(atrId);
      chatLoopSyncedEv = {};
      finalizeChatLoopProgressTurn(atrId);
      wbChatBusy = false;
      wbStreamingText = '';
      wbStreamingReasoning = '';
      wbStreamingTurnId = '';
      wbThinkingTurnId = '';
      if (A && typeof A.cancel === 'function') {
        A.cancel(atrId)
          .catch(function () {})
          .then(function () {
            if (String(chatStopPendingId) === String(atrId)) {
              chatStopPendingId = '';
              chatLoopTaskId = '';
            }
          });
      } else {
        chatStopPendingId = '';
        chatLoopTaskId = '';
      }
      appendWbChatTurn({
        role: 'assistant',
        kind: 'finish',
        text: t('ha2WbChatCancelled', '已停止'),
        toolOk: false
      });
      paintWbTranscript();
    }
    if (global.OneToneModelGateway && global.OneToneModelGateway.cancel) {
      global.OneToneModelGateway.cancel();
      return;
    }
    invoke('cmd_workbuddy_local_chat_cancel', {
      args: { runId: wbStreamRunId || undefined }
    }).catch(function () {});
  }

  function mapWbChatError(msg) {
    msg = String(msg || '');
    if (msg === 'no_default_account' || msg === 'not_found' || msg === 'key_missing') {
      return t('ha2WbNeedAccount', '先去 Agent 页添加 WorkBuddy 账号');
    }
    if (msg === 'authExpired' || msg === 'key_unauthorized') {
      return t('ha2WbAuthFail', '账号鉴权失败，请到 Agent 页重新登录或换 Key');
    }
    if (msg === 'no_model' || msg === 'model_not_in_catalog') {
      return t('ha2WbNeedModel', '先选择一个模型（或去 Agent 页刷新模型）');
    }
    if (msg === 'rate_limited') {
      return t('ha2WbRateLimited', '请求过于频繁，稍后再试');
    }
    if (msg === 'empty_model_content') {
      return t(
        'ha2WbEmptyReply',
        '模型返回为空（可换非纯推理模型，或去 Agent 页刷新模型后再试）'
      );
    }
    if (/iam_confirm_required|raccoon_relogin|auth_failed/i.test(msg)) {
      return t('ha2WbAuthFail', '账号鉴权失败，请到 Agent 页重新登录或换 Key');
    }
    if (msg === 'cancelled') {
      return t('ha2WbChatCancelled', '已停止');
    }
    if (msg === 'ipc_unavailable') {
      return t('ha2IpcUnavailable', '桌面通道未就绪');
    }
    return msg;
  }

  function finishWbLocalBusy() {
    stopWbPoll();
    wbChatBusy = false;
    wbStreamRunId = '';
    wbStreamingText = '';
    wbStreamingReasoning = '';
    wbStreamingTurnId = '';
    wbThinkingTurnId = '';
    paintWbTranscript();
    var S = store();
    if (!S || !S.getSnapshot) return;
    var snap = S.getSnapshot();
    var sendBtn = root && root.querySelector('[data-ha2-send]');
    if (sendBtn) sendBtn.disabled = !canSendNow(snap);
    syncOrganizeChrome();
  }

  function paintWbStreamingLive() {
    if (!wbChatPageOpen || !root) {
      paintWbTranscript();
      return;
    }
    // Reasoning chip needs a full patch (details markup); answer-only can patch text.
    if (wbStreamingReasoning) {
      paintWbChatPage();
      return;
    }
    var textEl = root.querySelector(
      '.ha2-wb-page-turn.is-streaming .ha2-wb-page-turn-text'
    );
    if (textEl) {
      textEl.textContent = wbStreamingText || '…';
      var transcript = root.querySelector('[data-ha2-wb-page-transcript]');
      if (transcript) {
        try {
          transcript.scrollTop = transcript.scrollHeight;
        } catch (_) {}
      }
      return;
    }
    paintWbChatPage();
  }

  function stopWbPoll() {
    if (wbPollTimer) {
      clearInterval(wbPollTimer);
      wbPollTimer = 0;
    }
  }

  function startWbPoll(runId, gen) {
    stopWbPoll();
    var lastKey = '';
    wbPollTimer = setInterval(function () {
      if (gen !== wbChatPaintGen) {
        stopWbPoll();
        return;
      }
      invoke('cmd_workbuddy_local_chat_poll', {
        args: { runId: runId || undefined }
      })
        .then(function (res) {
          if (gen !== wbChatPaintGen) return;
          res = res || {};
          var soFar = String(res.contentSoFar != null ? res.contentSoFar : res.content || '');
          var reasoning =
            res.reasoningSoFar != null ? String(res.reasoningSoFar) : '';
          var key = soFar + '\0' + reasoning;
          if (key !== lastKey && (soFar || reasoning)) {
            lastKey = key;
            onWbStreamDelta({
              runId: res.runId || runId,
              contentSoFar: soFar,
              reasoningSoFar: res.reasoningSoFar != null ? reasoning : undefined
            });
          }
          if (res.done) {
            stopWbPoll();
            onWbStreamDone({
              runId: res.runId || runId,
              content: soFar || res.content || '',
              reasoningSoFar: reasoning,
              model: res.model || wbStreamModel,
              accountId: res.accountId || '',
              error: res.error || null,
              ok: !res.error
            });
          }
        })
        .catch(function () {});
    }, 80);
  }

  function onWbStreamDelta(payload) {
    payload = payload || {};
    if (wbStreamRunId && payload.runId && payload.runId !== wbStreamRunId) return;
    // New backend always sends reasoningSoFar (string, maybe empty). Legacy omits it
    // and folds CoT into contentSoFar — keep that as a single answer bubble.
    if (payload.reasoningSoFar != null) {
      wbStreamingReasoning = String(payload.reasoningSoFar || '');
      wbStreamingText = String(payload.contentSoFar != null ? payload.contentSoFar : '');
    } else {
      wbStreamingReasoning = '';
      wbStreamingText = String(
        payload.contentSoFar != null ? payload.contentSoFar : payload.delta || ''
      );
    }
    if (!wbThinkingTurnId) wbThinkingTurnId = 'think_' + Date.now().toString(36);
    if (!wbStreamingTurnId) wbStreamingTurnId = 'stream_' + Date.now().toString(36);
    paintWbStreamingLive();
  }

  function onWbStreamDone(payload) {
    payload = payload || {};
    // Poll + event can both fire; only settle once.
    if (!wbChatBusy) return;
    if (wbStreamRunId && payload.runId && payload.runId !== wbStreamRunId) return;
    var S = store();
    if (!S) return;
    // Shared history may have been updated by another surface — reload first.
    wbChatTurns = loadWbChatTurns();
    var content = payload.content != null ? String(payload.content).trim() : '';
    var reasoning = String(payload.reasoningSoFar || wbStreamingReasoning || '').trim();
    var err = payload.error ? String(payload.error) : '';
    var model = (payload.model && String(payload.model)) || wbStreamModel;
    var accountId = payload.accountId ? String(payload.accountId) : '';
    wbStreamingText = '';
    wbStreamingReasoning = '';
    wbStreamingTurnId = '';
    var thinkId = wbThinkingTurnId;
    wbThinkingTurnId = '';
    // Persist the collected reasoning even when the provider ends with an
    // error/cancel. Previously this branch returned before creating the
    // collapsible thinking step, so the UI lost the entire streamed trace.
    if (reasoning && (!content || reasoning !== content)) {
      appendWbChatTurn({
        id: thinkId || 'think_' + Date.now().toString(36),
        role: 'assistant',
        kind: 'tool_step',
        toolName: 'thinking',
        text: err
          ? t('ha2WbChatCancelled', '已停止')
          : t('ha2ToolThinkingDone', '已思考'),
        detail: reasoning,
        collapsed: true,
        toolOk: !err
      });
    }
    if (!content && err) {
      appendWbChatTurn({
        role: 'assistant',
        text: err === 'cancelled'
          ? '任务已停止，未生成最终回复。'
          : mapWbChatError(err),
        model: model,
        accountId: accountId
      });
    }
    if (err && err !== 'cancelled') {
      paintWbTranscript();
      S.setDeliveryReceipt({
        kind: 'local_chat',
        phase: 'failed',
        outcome: 'failed',
        title: t('ha2WbChatFailed', '本机对话失败'),
        message: mapWbChatError(err),
        verified: false,
        inputConfirmed: false
      });
      finishWbLocalBusy();
      return;
    }
    // Thinking was persisted above, before the error/cancel branch.
    if (content) {
      var last = wbChatTurns[wbChatTurns.length - 1];
      if (!(last && last.role === 'assistant' && String(last.text || '') === content)) {
        appendWbChatTurn({
          role: 'assistant',
          text: content,
          model: model,
          accountId: accountId
        });
      }
    }
    paintWbTranscript();
    if (err === 'cancelled') {
      S.setDeliveryReceipt({
        kind: 'local_chat',
        phase: 'failed',
        outcome: 'failed',
        title: t('ha2WbChatFailed', '本机对话失败'),
        message: mapWbChatError('cancelled'),
        verified: false,
        inputConfirmed: false
      });
    } else {
      S.setDeliveryReceipt({
        kind: 'local_chat',
        phase: 'done',
        outcome: 'local_replied',
        title: t('ha2WbReplied', '本机对话已回复') + ' · ' + wbStreamAgentName,
        message: wbStreamProjectLeaf ? wbStreamProjectLeaf + ' · ' + model : model,
        verified: true,
        inputConfirmed: true
      });
    }
    finishWbLocalBusy();
  }

  var wbToJsHooked = false;

  function onWbToJsMessage(ev) {
    var d = (ev && ev.data) || ev || {};
    if (!d || !d.type) return;
    if (d.type === 'wb_local_chat_delta') onWbStreamDelta(d);
    else if (d.type === 'wb_local_chat_done') onWbStreamDone(d);
  }

  function ensureWbStreamListen() {
    var ipc = global.OneToneIpc;
    var pending = [];
    if (ipc && typeof ipc.listen === 'function') {
      if (!wbDoneUnsub) {
        pending.push(
          ipc
            .listen('wb_local_chat_done', function (ev) {
              onWbStreamDone((ev && ev.payload) || ev || {});
            })
            .then(function (unsub) {
              if (typeof unsub === 'function') wbDoneUnsub = unsub;
            })
            .catch(function () {})
        );
      }
      if (!wbDeltaUnsub) {
        pending.push(
          ipc
            .listen('wb_local_chat_delta', function (ev) {
              onWbStreamDelta((ev && ev.payload) || ev || {});
            })
            .then(function (unsub) {
              if (typeof unsub === 'function') wbDeltaUnsub = unsub;
            })
            .catch(function () {})
        );
      }
    }
    // Backup: to_js envelope (same bus Soft Pad / config use).
    if (!wbToJsHooked && global.chrome && global.chrome.webview && global.chrome.webview.addEventListener) {
      wbToJsHooked = true;
      try {
        global.chrome.webview.addEventListener('message', onWbToJsMessage);
      } catch (_) {
        wbToJsHooked = false;
      }
    }
    return pending.length ? Promise.all(pending) : Promise.resolve();
  }

  function compactWbLocalUserText(raw) {
    var Caps = global.OneToneHomeAgentCapabilities;
    if (Caps && typeof Caps.compactLocalChatUserText === 'function') {
      return Caps.compactLocalChatUserText(raw);
    }
    return String(raw || '').trim();
  }

  /**
   * System weather capability (wttr.in) — clarify city if missing; remember default.
   * Does not require WorkBuddy account.
   */
  function tryHandleWeatherLocal(rawText, c) {
    var Caps = global.OneToneHomeAgentCapabilities;
    var S = store();
    if (!Caps || !S) return false;
    var text = String(rawText || '').trim();
    if (!text) return false;
    var isAsk = Caps.looksLikeWeatherAsk(text);
    var cityOnly = wbWeatherAwaitingCity && Caps.looksLikeCityOnly(text);
    if (!isAsk && !cityOnly) return false;

    var city =
      Caps.extractWeatherCity(text) ||
      (cityOnly ? text : '') ||
      readDefaultWeatherCity() ||
      '';
    city = String(city || '').trim();
    if (city && Caps.isPlausibleWeatherCity && !Caps.isPlausibleWeatherCity(city)) {
      city = '';
    }

    appendWbChatTurn({
      role: 'user',
      text: text,
      model: '',
      accountId: ''
    });
    S.setDraft('', { silent: true });
    syncDraftMirrors('');
    openWbChatPage();
    paintWbTranscript();

    if (!city) {
      // 诚实确认：不擅自 IP/GPS 定位，先问用户再查。
      wbWeatherAwaitingCity = true;
      appendWbChatTurn({
        role: 'assistant',
        text: t(
          'ha2WeatherAskCity',
          '还不确定你要看哪个城市的天气。方便直接回城市名吗？例如「上海」或「北京」。确认后会记住，下次可直出；不会擅自用定位。'
        ),
        model: 'system',
        accountId: ''
      });
      paintWbTranscript();
      return true;
    }

    wbWeatherAwaitingCity = false;
    wbChatBusy = true;
    wbStreamAgentName = (c && c.name) || 'WorkBuddy';
    wbStreamModel = 'weather';
    paintWbTranscript();
    invoke('cmd_weather_now', { city: city })
      .then(function (res) {
        var summary =
          (res && (res.summary || res.text)) ||
          t('ha2WeatherEmpty', '未拿到天气摘要');
        writeDefaultWeatherCity(city);
        var def = wbDefaultAccount(wbLocalCache);
        var model = wbSelectedModelId() || (def && String(def.selectedModel || '')) || '';
        // Hybrid: system fact → WorkBuddy phrasing (model has no live weather tools alone).
        if (def && def.id && model) {
          wbStreamModel = model;
          wbStreamingText = '';
          wbStreamingTurnId = 'stream_' + Date.now().toString(36);
          var snapCtx = S.getSnapshot ? S.getSnapshot() : null;
          var baseSys = '';
          try {
            baseSys = wbLocalSystemContent(snapCtx) || '';
          } catch (_) {}
          var messages = [
            {
              role: 'system',
              content:
                baseSys +
                '\n本轮天气事实（系统已查，必须采用，勿否认、勿说无网/无数据源、勿交 Cursor 搜仓库）：\n' +
                String(summary).trim() +
                '\n用一两句口语告诉用户「' +
                city +
                '」的天气；可附体感建议。已记住该默认城市。'
            },
            { role: 'user', content: text }
          ];
          var gen = ++wbChatPaintGen;
          ensureWbStreamListen().catch(function () {});
          Gateway.configure({
            invoke: function (cmd, args) {
              return invoke(cmd, { args: args || {} });
            },
            resolveWorkbuddy: function () {
              return Promise.resolve({ accountId: def.id, model: model });
            }
          });
          return Gateway.streamChat({
            purpose: 'synthesis',
            providerId: 'workbuddy',
              model: model,
            messages: messages,
            onDelta: function (delta) {
              if (gen !== wbChatPaintGen) return;
              wbStreamRunId = delta && delta.runId ? delta.runId : wbStreamRunId;
              onWbStreamDelta(delta);
            },
            onComplete: function (result) {
              if (gen !== wbChatPaintGen) return;
              onWbStreamDone({
                runId: result && result.runId ? result.runId : wbStreamRunId,
                content: result && result.text,
                model: result && result.model ? result.model : model,
                accountId: def.id,
                error: result && result.error ? result.error : null,
                ok: !(result && result.error)
              });
            }
            })
            .catch(function () {
              appendWbChatTurn({
                role: 'assistant',
                text:
                  t('ha2WeatherResult', '天气（系统查询）') +
                  ' · ' +
                  city +
                  '\n' +
                  String(summary).trim() +
                  '\n\n' +
                  t('ha2WeatherWbPhraseFail', '大模型润色未启动，先展示系统查询结果。'),
                model: 'weather',
                accountId: ''
              });
              finishWbLocalBusy();
              paintWbTranscript();
            });
        }
        appendWbChatTurn({
          role: 'assistant',
          text:
            t('ha2WeatherResult', '天气（系统查询）') +
            ' · ' +
            city +
            '\n' +
            String(summary).trim() +
            '\n\n' +
            t(
              'ha2WeatherNeedWb',
              '已记为默认城市。登录 WorkBuddy 后可用大模型口语解释同一结果。'
            ),
          model: 'weather',
          accountId: ''
        });
        if (S.setDeliveryReceipt) {
          S.setDeliveryReceipt({
            kind: 'local_chat',
            phase: 'done',
            outcome: 'local_replied',
            title: t('ha2WeatherDone', '已查询天气'),
            message: String(summary).slice(0, 80),
            verified: true,
            inputConfirmed: false
          });
        }
        finishWbLocalBusy();
        paintWbTranscript();
        if (mounted) paint(S.getSnapshot());
      })
      .catch(function (err) {
        var raw = String((err && err.message) || err || '');
        var notFound =
          /need_city|city_not_found|bad_city|location not found|unknown location/i.test(
            raw
          );
        var msg = notFound
          ? t(
              'ha2WeatherBadCity',
              '这个城市名暂时查不到。方便换一个常见写法再确认一下吗？例如「上海」「北京」或「Shanghai」。'
            )
          : t(
              'ha2WeatherFetchFail',
              '天气服务暂时没返回结果。可以稍后再试，或换个城市名让我确认后再查。'
            );
        wbWeatherAwaitingCity = true;
        appendWbChatTurn({
          role: 'assistant',
          text: msg,
          model: 'weather',
          accountId: ''
        });
        finishWbLocalBusy();
        paintWbTranscript();
        if (mounted) paint(S.getSnapshot());
      });
    return true;
  }

  function sendWbLocal(draftRemember, c) {
    var S = store();
    if (wbChatBusy) return;

    // Checklist markdown → short goal turn (avoid section-fill replies).
    draftRemember = compactWbLocalUserText(draftRemember);
    if (!draftRemember) return;

    // Weather: system IPC + reverse-ask city — before WorkBuddy account gate.
    if (tryHandleWeatherLocal(draftRemember, c)) return;

    // The model selector is independent from the WorkBuddy Agent target.
    // Route non-WorkBuddy providers through ModelGateway instead of the
    // legacy WorkBuddy streaming IPC.
    var routedGateway = global.OneToneModelGateway;
    var routedProvider = routedGateway && routedGateway.resolveProvider
      ? routedGateway.resolveProvider('synthesis')
      : null;
    if (routedGateway && routedProvider && routedProvider.id !== 'workbuddy') {
      wbChatBusy = true;
      wbTranscriptCollapsed = false;
      wbStreamingText = '';
      var routedGen = ++wbChatPaintGen;
      appendWbChatTurn({ role: 'user', text: draftRemember, model: routedProvider.model || routedProvider.id });
      S.setDraft('', { silent: true });
      syncDraftMirrors('');
      openWbChatPage();
      paintWbTranscript();
      var routedMessages = wbMessagesForApi(S.getSnapshot ? S.getSnapshot() : null);
      if (typeof routedGateway.configure === 'function') {
        routedGateway.configure({
          invoke: function (cmd, args) {
            return invoke(cmd, { args: args || {} });
          },
          resolveWorkbuddy: function () {
            var def = wbDefaultAccount(wbLocalCache);
            var model = wbSelectedModelId() || (def && String(def.selectedModel || '')) || '';
            return Promise.resolve({ accountId: def && def.id, model: model });
          }
        });
      }
      routedGateway.chat({
        purpose: 'synthesis',
        messages: routedMessages,
        responseFormat: 'text',
        maxTokens: 4096,
        temperature: 0.3
      }).then(function (res) {
        if (routedGen !== wbChatPaintGen) return;
        if (!res || res.ok === false) throw new Error((res && (res.message || res.code)) || 'model_failed');
        var reply = String(res.text || '').trim();
        if (!reply) throw new Error('empty_model_content');
        appendWbChatTurn({
          role: 'assistant',
          text: reply,
          model: res.model || routedProvider.model || routedProvider.id,
          providerId: res.providerId || routedProvider.id,
          fallbackFrom: res.fallbackFrom || ''
        });
        paintWbTranscript();
        finishWbLocalBusy();
      }).catch(function (e) {
        if (routedGen !== wbChatPaintGen) return;
        wbStreamingText = '';
        paintWbTranscript();
        var raw = (e && (e.message || e.code)) || String(e || 'model_failed');
        S.setDeliveryReceipt({
          kind: 'local_chat',
          phase: 'failed',
          outcome: 'failed',
          title: '模型调用失败',
          message: mapWbChatError(raw),
          verified: false,
          inputConfirmed: false
        });
        finishWbLocalBusy();
      });
      return;
    }

    var def = wbDefaultAccount(wbLocalCache);
    if (!def) {
      S.setValidationNotice({
        kind: 'wb_no_account',
        message: t('ha2WbNeedAccount', '先去 Agent 页添加 WorkBuddy 账号')
      });
      return;
    }
    var model = wbSelectedModelId() || String(def.selectedModel || '');
    if (!model) {
      S.setValidationNotice({
        kind: 'wb_no_account',
        message: t('ha2WbNeedModel', '先选择一个模型（或去 Agent 页刷新模型）')
      });
      return;
    }

    wbChatBusy = true;
    wbTranscriptCollapsed = false;
    wbStreamingText = '';
    wbStreamingTurnId = 'stream_' + Date.now().toString(36);
    appendWbChatTurn({
      role: 'user',
      text: draftRemember,
      model: model,
      accountId: def.id
    });
    S.setDraft('', { silent: true });
    syncDraftMirrors('');
    openWbChatPage();
    paintWbTranscript();
    var gen = ++wbChatPaintGen;
    var snapCtx = S.getSnapshot ? S.getSnapshot() : null;
    var messages = wbMessagesForApi(snapCtx);
    var promptIn = {};
    try {
      promptIn = wbLocalPromptInput(snapCtx) || {};
    } catch (_) {}
    var projectLeaf = String(promptIn.projectName || '').trim();
    wbStreamAgentName = (c && c.name) || 'WorkBuddy';
    wbStreamProjectLeaf = projectLeaf;
    wbStreamModel = model;
    // All providers now pass through the Gateway. WorkBuddy keeps its
    // native start/poll transport inside the Gateway adapter.
    var Gateway = global.OneToneModelGateway;
    if (!Gateway || !Gateway.streamChat) throw new Error('model_gateway_unavailable');
    Gateway.configure({
      invoke: function (cmd, args) { return invoke(cmd, { args: args || {} }); },
      resolveWorkbuddy: function () { return Promise.resolve({ accountId: def.id, model: model }); }
    });
    Gateway.streamChat({
      purpose: 'synthesis',
      providerId: 'workbuddy',
        model: model,
      messages: messages,
      onDelta: function (payload) {
        if (gen !== wbChatPaintGen) return;
        wbStreamRunId = payload.runId || wbStreamRunId;
        onWbStreamDelta(payload);
      },
      onComplete: function (res) {
        if (gen !== wbChatPaintGen) return;
        wbStreamRunId = res && res.runId || wbStreamRunId;
        onWbStreamDone({
          runId: wbStreamRunId,
          content: res && res.text || '',
          model: res && res.model || model,
          accountId: def.id,
          ok: true
        });
      }
      })
      .catch(function (e) {
        if (gen !== wbChatPaintGen) return;
        var msg = mapWbChatError((e && e.message) || String(e || ''));
        wbStreamingText = '';
        wbStreamingTurnId = '';
        paintWbTranscript();
        S.setDeliveryReceipt({
          kind: 'local_chat',
          phase: 'failed',
          outcome: 'failed',
          title: t('ha2WbChatFailed', '本机对话失败'),
          message: msg,
          verified: false,
          inputConfirmed: false
        });
        finishWbLocalBusy();
      });
  }

  function syncOrganizeChrome() {
    if (!root) return;
    var Prep = global.OneToneHomePromptPrep;
    var model = Prep && Prep._model ? Prep._model() : null;
    var running =
      organizeBusy ||
      !!(model && model.assist && model.assist.state === 'running');
    var mats =
      Prep && typeof Prep.getMaterialSummary === 'function'
        ? Prep.getMaterialSummary()
        : { count: 0 };
    var hasMats = Number(mats.count) > 0;
    var snap = store() && store().getSnapshot ? store().getSnapshot() : null;
    var atrEdit = atrEditPathOn(snap || {});
    var orgBtn = root.querySelector('[data-ha2-organize]');
    var cancelBtn = root.querySelector('[data-ha2-organize-cancel]');
    if (orgBtn) {
      // Only after + loaded materials (keep visible while organize is running).
      orgBtn.hidden = atrEdit || (!running && !hasMats);
      orgBtn.disabled = !!running;
      orgBtn.textContent = running
        ? t('ha2Organizing', '整理中…')
        : t('ha2OrganizeShort', '整理');
    }
    if (cancelBtn) cancelBtn.hidden = !running;
  }

  function refreshAssistReady() {
    var Assist = global.OneToneHomeAssistClient;
    if (!Assist || typeof Assist.fetchReady !== 'function') return;
    Assist.fetchReady().then(function (ready) {
      assistReadyCache = ready;
      syncOrganizeChrome();
    });
  }

  /** Focus compose draft lives in ha2 store — Prep must see it before organize. */
  function syncComposeDraftIntoPrep() {
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || typeof Prep.setDraftBody !== 'function') return '';
    var draft = String(draftTextNow() || '');
    try {
      Prep.setDraftBody(draft, { skipSync: true, force: true });
    } catch (_) {}
    return draft.trim();
  }

  function runOrganizeTask() {
    var S = store();
    var Assist = global.OneToneHomeAssistClient;
    var Prep = global.OneToneHomePromptPrep;
    if (Prep && typeof Prep.ensureMounted === 'function') {
      try {
        Prep.ensureMounted();
      } catch (_) {}
    }
    var draft = syncComposeDraftIntoPrep();
    var mats =
      Prep && typeof Prep.getMaterialSummary === 'function'
        ? Prep.getMaterialSummary()
        : { count: 0 };
    if (!draft && !(Number(mats.count) > 0)) {
      toast(t('ha2OrganizeNeedDraft', '先写一句或加入材料，再点整理'));
      return;
    }
    if (!Assist || typeof Assist.runOrganize !== 'function') {
      var miss = t('ha2AssistMissing', '整理模块未加载；可直接发送原稿');
      toast(miss);
      if (S) {
        S.setValidationNotice({ kind: 'assist_missing', message: miss });
      }
      return;
    }
    if (organizeBusy) return;
    organizeBusy = true;
    syncOrganizeChrome();
    var runningMsg = t('ha2OrganizingHint', '正在整理任务…本地取消不保证停止计费');
    toast(runningMsg);
    if (S) {
      S.setValidationNotice({
        kind: 'assist_running',
        message: runningMsg
      });
    }
    Assist.fetchReady()
      .then(function (ready) {
        assistReadyCache = ready;
        if (ready && ready.ready === false && ready.reason === 'no_free_model') {
          var allow = false;
          try {
            allow = global.confirm
              ? global.confirm(
                  t(
                    'ha2AllowMeteredConfirm',
                    '当前无零价模型。是否允许使用计量额度整理？（会产生费用）'
                  )
                )
              : false;
          } catch (_) {}
          if (allow) Assist.setAllowMetered(true);
          else {
            organizeBusy = false;
            syncOrganizeChrome();
            toast(t('ha2OrganizeNeedFree', '未允许计量额度，已取消整理'));
            return { ok: false, reason: 'metered_declined' };
          }
        }
        // Re-sync in case user kept typing during confirm.
        syncComposeDraftIntoPrep();
        return Assist.runOrganize({});
      })
      .then(function (res) {
        organizeBusy = false;
        syncOrganizeChrome();
        if (!res) return;
        if (!res.ok) {
          if (res.reason === 'metered_declined') return;
          var failMsg =
            (Assist.formatFailureNotice &&
              Assist.formatFailureNotice(res && res.reason)) ||
            (Assist.reasonMessage && Assist.reasonMessage(res && res.reason)) ||
            t('ha2OrganizeFailed', '整理未完成 · 可直接发送原稿');
          toast(failMsg);
          if (S) {
            S.setValidationNotice({
              kind: 'assist_failed',
              reason: (res && res.reason) || 'internal',
              message: failMsg
            });
          }
          refreshAssistReady();
          return;
        }
        if (res.adopted === false && res.reason === 'stale') {
          toast(t('ha2OrganizeStale', '整理结果已过期，请再试一次'));
          return;
        }
        // Phase2.5: organize output is suggested ProblemBrief only — never auto user_confirmed.
        try {
          var PrepOrg = global.OneToneHomePromptPrep;
          var modelOrg = PrepOrg && PrepOrg._model && PrepOrg._model();
          var structured =
            modelOrg && modelOrg.organizedDraft && modelOrg.organizedDraft.structured;
          var Conc = concierge();
          if (Conc && Conc.adoptOrganizeSuggested && structured) {
            Conc.adoptOrganizeSuggested(structured, {});
          }
        } catch (_) {}
        var doneMsg = t(
          'ha2OrganizeDone',
          '已生成整理稿；可编辑后发送'
        );
        toast(doneMsg);
        if (S) {
          S.setValidationNotice({
            kind: 'assist_done',
            message: doneMsg
          });
        }
        var PrepDone = global.OneToneHomePromptPrep;
        if (PrepDone && PrepDone.setActiveDraft) PrepDone.setActiveDraft('organized');
        var org =
          PrepDone && PrepDone._model && PrepDone._model().organizedDraft
            ? PrepDone._model().organizedDraft.body
            : '';
        if (org && S) {
          syncDraftMirrors(org);
          S.setDraft(org, { silent: true });
        }
        if (S) paint(S.getSnapshot());
      })
      .catch(function () {
        organizeBusy = false;
        syncOrganizeChrome();
        var offline =
          (Assist.formatFailureNotice && Assist.formatFailureNotice('offline')) ||
          t('ha2OrganizeOffline', '网络或后端不可用 · 可直接发送原稿');
        toast(offline);
        if (S) {
          S.setValidationNotice({
            kind: 'assist_failed',
            reason: 'offline',
            message: offline
          });
        }
      });
  }

  function cancelOrganizeTask() {
    var Assist = global.OneToneHomeAssistClient;
    if (!Assist || typeof Assist.cancelOrganize !== 'function') {
      organizeBusy = false;
      syncOrganizeChrome();
      return;
    }
    Assist.cancelOrganize().then(function () {
      organizeBusy = false;
      syncOrganizeChrome();
      var S = store();
      if (S) {
        S.setValidationNotice({
          kind: 'assist_cancelled',
          message: t('ha2OrganizeCancelled', '已取消整理（提供商侧可能仍在计费）')
        });
      }
    });
  }

  /** Map compose picker wb:/sp:/api: → ATR make_driver provider id. */
  function resolveAtrProviderForChat() {
    var gateway = global.OneToneModelGateway;
    var purpose = 'synthesis';
    var current =
      gateway && gateway.resolveProvider ? gateway.resolveProvider(purpose) : null;
    var softPref = softPadPreferredProvider();
    var def = wbDefaultAccount(wbLocalCache);
    var selectedModel = def ? String(def.selectedModel || '') : '';
    // Prefer soft-pad lane id when Soft Pad freemodel is selected.
    if (current && current.id === 'softpad_our_freemodel' && softPref) {
      return softPref;
    }
    if (current && current.id && current.id !== 'softpad_our_freemodel') {
      return String(current.id);
    }
    if (softPref) return softPref;
    if (selectedModel || (def && def.id)) return 'workbuddy';
    var A = global.OneToneHomeAgentTask;
    return (A && A.readProvider && A.readProvider()) || 'workbuddy';
  }

  function chatToolStepLabel(tool) {
    tool = String(tool || '');
    if (tool === 'thinking') return t('ha2ToolThinking', '思考中');
    if (tool === 'process_trace') return t('ha2ToolProcessTrace', '查询过程');
    if (tool === 'web_search') return t('ha2ToolWebSearch', '联网搜索');
    if (tool === 'fetch_url') return t('ha2ToolFetch', '打开网页');
    if (tool === 'search_code') return t('ha2ToolSearchCode', '搜代码');
    if (tool === 'read_file') return t('ha2ToolReadFile', '读文件');
    if (tool === 'inspect_workspace') return t('ha2ToolInspect', '查看工作区');
    if (tool === 'deliver_to_agent') return t('ha2ToolDeliver', '投递到 Agent');
    if (tool === 'request_user_input') return t('ha2ToolAsk', '需要你补充');
    if (tool === 'finish') return t('ha2ToolFinish', '结案');
    return tool || t('ha2ToolStep', '工具');
  }

  /** Pack recent journal/chat turns into materialsSummary for ATR prior_chat. */
  function chatHistoryMaterialsSummary(extra) {
    var lines = [];
    var turns = [];
    var J = global.OneToneHomeTaskJournal;
    if (J && typeof J.listChatTurns === 'function') {
      try {
        turns = J.listChatTurns() || [];
      } catch (_) {
        turns = [];
      }
    }
    if (!turns.length && wbChatTurns && wbChatTurns.length) {
      turns = wbChatTurns;
    }
    var i;
    var start = Math.max(0, turns.length - 12);
    for (i = start; i < turns.length; i++) {
      var row = turns[i] || {};
      var role = row.role === 'user' ? 'user' : 'assistant';
      var kind = String(row.kind || '');
      if (kind === 'tool_step' || kind === 'needs_input' || kind === 'deliver_approval') {
        continue;
      }
      var body = String(row.text || '').replace(/\s+/g, ' ').trim();
      if (!body) continue;
      if (body.length > 220) body = body.slice(0, 220) + '…';
      lines.push(role + ': ' + body);
    }
    var out = lines.join('\n');
    if (extra) {
      out = (out ? out + '\n' : '') + String(extra);
    }
    if (out.length > 2800) out = out.slice(out.length - 2800);
    var Caps = global.OneToneHomeAgentCapabilities;
    if (Caps && typeof Caps.withChatReplyToneMaterials === 'function') {
      return Caps.withChatReplyToneMaterials(out, readChatReplyTone());
    }
    return out;
  }

  function replyToneSegmentHtml() {
    var cur = readChatReplyTone();
    var opts = [
      { id: 'natural', label: t('ha2ReplyToneNatural', '自然') },
      { id: 'concise', label: t('ha2ReplyToneConcise', '简洁') },
      { id: 'colleague', label: t('ha2ReplyToneColleague', '同事') }
    ];
    return (
      '<div class="ha2-reply-tone" role="group" aria-label="' +
      esc(t('ha2ReplyTone', '回复语气')) +
      '">' +
      '<span class="ha2-reply-tone-lab">' +
      esc(t('ha2ReplyTone', '语气')) +
      '</span>' +
      opts
        .map(function (o) {
          return (
            '<button type="button" class="ha2-reply-tone-btn' +
            (o.id === cur ? ' is-on' : '') +
            '" data-ha2-reply-tone="' +
            esc(o.id) +
            '"' +
            (o.id === cur ? ' aria-pressed="true"' : ' aria-pressed="false"') +
            '>' +
            esc(o.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function chatLoopHonestFailText(code, fallback) {
    code = String(code || '');
    fallback = String(fallback || '');
    if (code === 'cancelled' || /^cancelled$/i.test(fallback)) {
      return t('ha2WbChatCancelled', '已停止');
    }
    if (
      code === 'tool_not_allowed' ||
      /tool_not_allowed/i.test(code) ||
      /tool_not_allowed/i.test(fallback)
    ) {
      return t(
        'ha2ChatToolNotAllowed',
        '对话工具环配置异常 — 请刷新后再问一次；若仍失败请换引擎'
      );
    }
    if (code === 'format_error' || /format_error|parse_|not_json|no_tool_calls/i.test(code)) {
      return t(
        'ha2ChatFormatFail',
        '模型未按工具格式行动 — 请换引擎或换更强模型后再试'
      );
    }
    if (/_unconfigured|provider_unconfigured|not_ready/i.test(code)) {
      return t(
        'ha2ChatNeedEngine',
        '对话引擎未就绪 — 请登录 WorkBuddy，或配置 Soft Pad / API 密钥后再试'
      );
    }
    if (code === 'need_project' || code === 'scratch_failed') {
      return t(
        'ha2ChatScratchFail',
        '无法准备对话工作区 — 请确认数据目录可用，或换引擎后再试'
      );
    }
    if (
      code === 'interrupted' ||
      code === 'busy' ||
      code === 'waiting' ||
      /atr_interrupted|atr_busy|atr_waiting/i.test(code)
    ) {
      return t(
        'ha2ChatBlockedByWork',
        '有未结束的编辑任务挡住了提问 — 请点「放弃并发送」或直接再发一次问题'
      );
    }
    if (
      code === 'abandon_start_failed' ||
      /abandon_start_failed|provider_not_edit_capable|edit_not_admitted/i.test(code)
    ) {
      return t(
        'ha2ChatAbandonStartFail',
        '提问未能启动 — 请再发一次原问题；若仍失败请换引擎或确认已登录 WorkBuddy'
      );
    }
    if (
      code === 'tool_error' ||
      code === 'timeout' ||
      /tool_error|timeout/i.test(code) ||
      /提问失败\s*[:：]?\s*tool_error/i.test(fallback) ||
      /^tool_error$/i.test(fallback)
    ) {
      return t(
        'ha2ChatToolError',
        '检索/工具调用中断 — 可点恢复继续，或放弃后换引擎再问'
      );
    }
    // Never surface edit-lane wording ("编辑任务失败") in chat transcript.
    if (/编辑任务失败|提问失败/i.test(fallback)) {
      return t(
        'ha2ChatLoopNeedReady',
        '未能启动对话工具循环 — 请换引擎或配置密钥后再试'
      );
    }
    return (
      fallback ||
      t(
        'ha2ChatLoopNeedReady',
        '未能启动对话工具循环 — 请换引擎或配置密钥后再试'
      )
    );
  }

  /** Inline triage when chat still hits a work conflict (buttons live in transcript). */
  function chatConflictTurnHtml(turn) {
    turn = turn || {};
    return (
      '<div class="ha2-wb-page-turn ha2-wb-page-turn--tool is-needs-input" data-ha2-tool-step>' +
      '<div class="ha2-tool-step-hd">' +
      '<span class="ha2-tool-step-badge">' +
      esc(t('ha2ChatConflict', '需处理')) +
      '</span>' +
      '<span class="ha2-tool-step-label">' +
      esc(turn.text || '') +
      '</span></div>' +
      '<div class="ha2-chat-deliver-actions">' +
      '<button type="button" class="ha2-btn primary" data-ha2-atr-abandon-send>' +
      esc(t('ha2AtrAbandonSend', '放弃并发送')) +
      '</button>' +
      '<button type="button" class="ha2-btn" data-ha2-atr-abandon>' +
      esc(t('ha2AtrAbandon', '放弃旧任务')) +
      '</button>' +
      '<button type="button" class="ha2-btn" data-ha2-atr-resume>' +
      esc(t('ha2AtrResume', '恢复旧任务')) +
      '</button></div></div>'
    );
  }

  function chatAtrBusyPhase(st) {
    st = String(st || '');
    return (
      st === 'running' ||
      st === 'verifying' ||
      st === 'repair' ||
      st === 'review'
    );
  }

  function chatDriveAlive(taskId) {
    var S = store();
    if (S && typeof S.isAtrDriveInFlight === 'function') {
      return !!S.isAtrDriveInFlight(taskId);
    }
    return false;
  }

  /**
   * Busy projection for the thinking chip / answer bubble.
   * Raw CoT stays in kind:thinking (chip detail) — never the answer bubble.
   */
  function chatLiveProjection(task) {
    var raw = String(
      (task && (task.liveThinking || task.live_thinking)) || ''
    );
    if (raw.indexOf('answer|') === 0) {
      return { kind: 'answer', text: raw.slice(7) };
    }
    if (raw.indexOf('status|') === 0) {
      return { kind: 'status', text: raw.slice(7) };
    }
    if (raw.trim()) {
      return { kind: 'thinking', text: raw };
    }
    return { kind: 'empty', text: '' };
  }

  function chatLoopProgressText(task) {
    var live = chatLiveProjection(task);
    var turn = task && task.currentTurn != null ? Number(task.currentTurn) : 0;
    if (live.kind === 'answer' && live.text) return live.text;
    if (live.kind === 'status' && live.text) {
      return live.text + (turn ? ' · 第 ' + turn + ' 步' : '');
    }
    if (live.kind === 'thinking') {
      return turn
        ? t('ha2ChatLoopThinking', '模型思考中 · 第 {n} 步… — 可点停止').replace(
            '{n}',
            String(turn)
          )
        : t('ha2ToolThinkingLive', '思考中…');
    }
    if (!turn) {
      return t(
        'ha2ChatLoopWaitingModel',
        '正在等待模型回应（第 0 步）… — 可点停止'
      );
    }
    return t('ha2ChatLoopBusyStep', '工具循环中 · 第 {n} 步…')
      .replace('{n}', String(turn));
  }

  /** Persist collapsible progress chip — must survive cancel (streaming alone evaporates). */
  function upsertChatLoopProgressTurn(task) {
    var tid = String((task && task.taskId) || chatLoopTaskId || '');
    if (!tid) return null;
    var text = chatLoopProgressText(task);
    if (!text) return null;
    var live = chatLiveProjection(task);
    if (live.kind === 'answer' && live.text) {
      var answerId = 'answer_' + tid;
      var answerRow = appendWbChatTurn({
        id: answerId,
        role: 'assistant',
        text: live.text,
        streaming: true
      });
      wbStreamingTurnId = answerId;
      wbStreamingText = live.text;
      // Keep any prior thinking chip; do not recycle it as the answer id.
      if (!wbThinkingTurnId) wbThinkingTurnId = 'think_' + tid;
      // Settle the thinking fold once the answer starts streaming.
      var ti;
      for (ti = 0; ti < wbChatTurns.length; ti++) {
        if (
          wbChatTurns[ti] &&
          String(wbChatTurns[ti].id) === 'think_' + tid &&
          wbChatTurns[ti].toolName === 'thinking'
        ) {
          wbChatTurns[ti] = Object.assign({}, wbChatTurns[ti], {
            text: t('ha2ToolThinkingDone', '已思考'),
            collapsed: true,
            streaming: false
          });
          break;
        }
      }
      return answerRow;
    }
    // Live thinking body: prefer CoT/status payload; fall back to progress label.
    var detailBits = [];
    if (
      (live.kind === 'status' || live.kind === 'thinking') &&
      live.text
    ) {
      detailBits.push(String(live.text));
    } else if (text) {
      detailBits.push(String(text));
    }
    var detailText = detailBits.join('\n');
    // Drive the paint overlay so CoT keeps streaming even if a turn upsert races.
    wbStreamingReasoning = detailText || text || wbStreamingReasoning;
    var row = appendWbChatTurn({
      id: 'think_' + tid,
      role: 'assistant',
      kind: 'tool_step',
      toolName: 'thinking',
      text: text,
      detail: detailText,
      // Open while live so the thinking flow is visible without a click.
      collapsed: false,
      toolOk: true,
      streaming: true
    });
    wbThinkingTurnId = 'think_' + tid;
    // Thinking stays on the fold chip — never paint a second answer bubble for status.
    wbStreamingTurnId = '';
    wbStreamingText = '';
    // Drop the synthetic start chip once the real task id is known.
    if (tid) {
      wbChatTurns = wbChatTurns.filter(function (r) {
        return !(r && r.id === 'chat_loop_live');
      });
    }
    return row;
  }

  /** Convert the in-flight answer bubble into the one terminal transcript row. */
  function settleStreamedChatAnswer(tid, finalId, text, options) {
    tid = String(tid || chatLoopTaskId || '');
    if (!tid) return false;
    var answerId = 'answer_' + tid;
    var opts = options || {};
    var i;
    for (i = 0; i < wbChatTurns.length; i++) {
      if (wbChatTurns[i] && String(wbChatTurns[i].id) === answerId) {
        wbChatTurns[i] = Object.assign({}, wbChatTurns[i], {
          id: String(finalId || answerId),
          role: 'assistant',
          kind: String(opts.kind || 'finish'),
          toolName: String(opts.toolName || ''),
          text: String(text || ''),
          streaming: false,
          collapsed: false,
          toolOk: opts.toolOk !== false
        });
        wbStreamingTurnId = '';
        wbStreamingText = '';
        saveWbChatTurns();
        return true;
      }
    }
    return false;
  }

  /**
   * Persist a safe action trace at terminal state. It records observable ATR
   * actions only (tool, query/path, result state), never provider reasoning/CoT.
   */
  function persistChatProcessTrace(tid, evs, terminalKind) {
    tid = String(tid || chatLoopTaskId || '');
    if (!tid) return null;
    evs = Array.isArray(evs) ? evs : [];
    var lines = [t('ha2ChatTraceUnderstand', '理解问题并规划查询')];
    var toolSteps = 0;
    var i;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i] || {};
      var kind = String(e.kind || '');
      var tool = String(e.toolName || e.tool_name || '');
      var p = e.payload || {};
      if (kind === 'tool_call') {
        toolSteps += 1;
        var args = p.arguments && typeof p.arguments === 'object' ? p.arguments : p;
        var subject = String(
          (args && (args.query || args.url || args.path || args.question)) || ''
        )
          .replace(/\s+/g, ' ')
          .slice(0, 160);
        lines.push(
          chatToolStepLabel(tool) + (subject ? '：' + subject : '')
        );
      } else if (kind === 'tool_error') {
        lines.push(chatToolStepLabel(tool) + '：' + t('ha2ChatTraceFailed', '失败'));
      }
    }
    if (toolSteps) {
      lines.push(t('ha2ChatTraceSynthesize', '汇总工具结果并核对答案'));
    }
    lines.push(
      terminalKind === 'done'
        ? t('ha2ChatTraceAnswered', '生成最终回复')
        : t('ha2ChatTraceStopped', '查询未正常完成')
    );
    // Separate id from think_<tid> — never overwrite the CoT thinking chip.
    var rowId = 'trace_' + tid;
    var label = t('ha2ToolProcessTrace', '查询过程') + ' · ' + lines.length + ' 步';
    var row = appendWbChatTurn({
      id: rowId,
      role: 'assistant',
      kind: 'tool_step',
      toolName: 'process_trace',
      text: label,
      detail: lines.join('\n'),
      collapsed: true,
      toolOk: terminalKind === 'done'
    });
    // Collapse the live thinking chip once the turn settles.
    var thinkId = 'think_' + tid;
    var i2;
    for (i2 = 0; i2 < wbChatTurns.length; i2++) {
      if (
        wbChatTurns[i2] &&
        String(wbChatTurns[i2].id) === thinkId &&
        wbChatTurns[i2].toolName === 'thinking'
      ) {
        wbChatTurns[i2] = Object.assign({}, wbChatTurns[i2], {
          text:
            terminalKind === 'done'
              ? t('ha2ToolThinkingDone', '已思考')
              : t('ha2WbChatCancelled', '已停止'),
          collapsed: true,
          streaming: false,
          toolOk: terminalKind === 'done'
        });
        break;
      }
    }
    if (wbStreamingTurnId === rowId || wbStreamingTurnId === thinkId) {
      wbStreamingTurnId = '';
    }
    if (wbThinkingTurnId === thinkId) wbThinkingTurnId = '';
    return row;
  }

  /**
   * Append/replace a reply so it always sits after the latest user turn.
   * Plain upsert-by-id can refresh an older finish still parked above a newer question.
   */
  function ensureChatReplyAfterLatestUser(turn) {
    turn = turn || {};
    var id = String(turn.id || '');
    if (id) {
      var lastUser = -1;
      var existing = -1;
      var i;
      for (i = 0; i < wbChatTurns.length; i++) {
        if (!wbChatTurns[i]) continue;
        if (wbChatTurns[i].role === 'user') lastUser = i;
        if (String(wbChatTurns[i].id) === id) existing = i;
      }
      if (existing >= 0 && existing < lastUser) {
        wbChatTurns.splice(existing, 1);
      }
    }
    return appendWbChatTurn(turn);
  }

  /** True when an assistant finish/conflict already follows the latest user turn. */
  function latestUserHasChatReply() {
    var i;
    var lastUser = -1;
    for (i = 0; i < wbChatTurns.length; i++) {
      if (wbChatTurns[i] && wbChatTurns[i].role === 'user') lastUser = i;
    }
    if (lastUser < 0) return true;
    for (i = lastUser + 1; i < wbChatTurns.length; i++) {
      var row = wbChatTurns[i];
      if (!row || row.role === 'user') continue;
      if (
        row.kind === 'finish' ||
        row.kind === 'chat_conflict' ||
        row.kind === 'needs_input' ||
        row.kind === 'deliver_approval' ||
        (!row.kind && String(row.text || '').trim())
      ) {
        return true;
      }
    }
    return false;
  }

  /** Pull finish summary from task/events when drive resolves done without a tail bubble. */
  function ensureLatestChatFinish(dto, snap) {
    if (latestUserHasChatReply()) return false;
    var tid = String((dto && dto.taskId) || chatLoopTaskId || '');
    if (!tid) return false;
    var summary = '';
    var evs =
      (snap && snap.agentTaskEvents) ||
      (dto && (dto.events || dto.agentTaskEvents)) ||
      [];
    var i;
    for (i = evs.length - 1; i >= 0; i--) {
      var e = evs[i] || {};
      var kind = String(e.kind || '');
      if (kind === 'done' || kind === 'task_done') {
        summary = String(
          (e.payload && e.payload.summary) || e.summary || ''
        ).trim();
        if (summary) break;
      }
    }
    if (!summary) {
      summary = String(
        (dto && (dto.summary || dto.lastSummary || dto.resultSummary)) || ''
      ).trim();
    }
    if (!summary) {
      summary = t('ha2ToolFinishDone', '已完成');
    }
    finalizeChatLoopProgressTurn(tid, t('ha2ToolThinkingDone', '已思考'), {
      toolOk: true
    });
    ensureChatReplyAfterLatestUser({
      id: 'fin_' + tid,
      role: 'assistant',
      kind: 'finish',
      toolName: 'finish',
      text: summary,
      collapsed: false,
      toolOk: true
    });
    return true;
  }

  /** Keep the progress chip after stop/cancel — do not delete it. */
  function finalizeChatLoopProgressTurn(tid, label, opts) {
    opts = opts || {};
    tid = String(tid || chatLoopTaskId || '');
    var targets = { chat_loop_live: true };
    if (tid) targets['think_' + tid] = true;
    if (wbThinkingTurnId) targets[String(wbThinkingTurnId)] = true;
    var i;
    var touched = false;
    for (i = 0; i < wbChatTurns.length; i++) {
      var row = wbChatTurns[i];
      if (!row || row.toolName !== 'thinking') continue;
      var rowId = String(row.id || '');
      if (!targets[rowId] && !row.streaming) continue;
      var prev = String(row.text || '');
      var m = prev.match(/第\s*(\d+)\s*步/);
      var step = m ? Number(m[1]) || 0 : 0;
      var text =
        label ||
        (step
          ? t('ha2ChatLoopStoppedStep', '已停止（第 {n} 步）').replace(
              '{n}',
              String(step)
            )
          : t('ha2WbChatCancelled', '已停止'));
      wbChatTurns[i] = Object.assign({}, row, {
        text: text,
        toolOk: opts.toolOk === true,
        collapsed: true,
        streaming: false
      });
      touched = true;
    }
    if (touched) {
      wbThinkingTurnId = '';
      wbStreamingReasoning = '';
      saveWbChatTurns();
    }
  }

  /**
   * Model hang (any turn): no new ATR events for CHAT_STALL_MS while busy.
   * Covers turn0 first call AND post-user_input second call (log: iphone stuck running@turn1).
   */
  function maybeStallChatDrive(snap, task) {
    var tid = String((task && task.taskId) || '');
    if (!tid || chatStallTried[tid] || chatStopPendingId === tid) return;
    var evs = (snap && snap.agentTaskEvents) || [];
    var lastMs = 0;
    var i;
    for (i = 0; i < evs.length; i++) {
      var em =
        typeof atrEventMs === 'function'
          ? atrEventMs(evs[i])
          : Number(
              (evs[i] && (evs[i].createdAtMs || evs[i].created_at_ms)) || 0
            );
      if (em > lastMs) lastMs = em;
    }
    if (!chatBusySinceMs) chatBusySinceMs = Date.now();
    var live = chatLiveProjection(task);
    var progress = chatLastProgressByTask[tid];
    if (!progress || progress.kind !== live.kind || progress.text !== live.text) {
      progress = { kind: live.kind, text: live.text, at: Date.now() };
      chatLastProgressByTask[tid] = progress;
    }
    var since = Math.max(lastMs || 0, chatBusySinceMs || 0, progress.at || 0);
    if (!since || Date.now() - since < CHAT_STALL_MS) return;
    // A quiet event log does not prove the provider stopped. The request may
    // still be streaming; the transport owns the timeout and final error.
    chatStallTried[tid] = true;
    appendWbChatTurn({
      id: 'slow_' + tid,
      role: 'assistant',
      kind: 'tool_step',
      toolName: 'thinking',
      text: t('ha2ChatLoopSlow', '模型仍在处理，等待下一步或超时结果'),
      detail: chatLoopProgressText(task),
      collapsed: true,
      toolOk: true
    });
    paintWbTranscript();
  }

  function emitChatRecoveryTurn(tid, text) {
    tid = String(tid || '');
    if (!tid || chatRecoveryEmitted[tid]) return;
    chatRecoveryEmitted[tid] = true;
    wbStreamingText = '';
    wbStreamingReasoning = '';
    wbStreamingTurnId = '';
    wbThinkingTurnId = '';
    // Drop empty answer shells that become border-only rails.
    wbChatTurns = wbChatTurns.filter(function (row) {
      if (!row) return false;
      if (row.role === 'assistant' && !row.kind && !String(row.text || '').trim()) {
        return false;
      }
      return true;
    });
    var recoveryText =
      text ||
      t(
        'ha2ChatLoopInterrupted',
        '工具循环已中断 — 可恢复、放弃旧任务，或放弃并发送新问题'
      );
    if (
      settleStreamedChatAnswer(tid, 'recover_' + tid, recoveryText, {
        kind: 'chat_conflict',
        toolOk: false
      })
    ) {
      saveWbChatTurns();
      return;
    }
    appendWbChatTurn({
      id: 'recover_' + tid,
      role: 'assistant',
      kind: 'chat_conflict',
      text: recoveryText,
      toolOk: false
    });
  }

  /**
   * Chat lane: one silent resume before showing the recovery card.
   * Interrupted without finish left users with「没有回复」+ grey rails.
   */
  function tryResumeInterruptedChat(tid, snap, task) {
    tid = String(tid || (task && task.taskId) || '');
    if (!tid || chatHealTried[tid] || chatStopPendingId === tid) return false;
    if (!atrIsChatLoopTask(task)) return false;
    var S = store();
    if (!S || typeof S.resumeAndDriveAgentTask !== 'function') return false;
    chatHealTried[tid] = true;
    chatLoopTaskId = tid;
    wbChatBusy = true;
    wbStreamingText = '';
    wbStreamingReasoning = '';
    wbStreamingTurnId = '';
    chatBusySinceMs = Date.now();
    upsertChatLoopProgressTurn(
      Object.assign({}, task || {}, { taskId: tid, status: 'running' })
    );
    paintWbTranscript();
    S.resumeAndDriveAgentTask()
      .then(function () {
        if (!mounted) return;
        var next = S.getSnapshot && S.getSnapshot();
        var t2 = (next && next.agentTask) || null;
        var st2 = String((t2 && t2.status) || '');
        if (st2 === 'done') {
          wbChatBusy = false;
          chatBusySinceMs = 0;
        } else if (chatAtrBusyPhase(st2) || st2 === 'waiting') {
          wbChatBusy = st2 !== 'waiting';
          if (wbChatBusy) upsertChatLoopProgressTurn(t2);
        } else {
          wbChatBusy = false;
          persistChatProcessTrace(
            tid,
            (next && next.agentTaskEvents) || [],
            'interrupted'
          );
          emitChatRecoveryTurn(tid);
        }
        paint(next || snap);
      })
      .catch(function () {
        if (!mounted) return;
        wbChatBusy = false;
        emitChatRecoveryTurn(tid);
        paint(S.getSnapshot());
      });
    return true;
  }

  /**
   * Watchdog: ATR busy but JS drive dropped → one redrive, else surface recovery.
   * Leaves task running so「恢复」can call driveActiveIfRunning (cancel is not resumable).
   */
  function maybeHealChatDrive(snap, task) {
    var tid = String((task && task.taskId) || '');
    if (!tid || chatHealTried[tid] || chatStopPendingId === tid) return;
    if (chatDriveAlive(tid)) return;
    chatHealTried[tid] = true;
    var S = store();
    if (!S || typeof S.driveActiveIfRunning !== 'function') {
      wbChatBusy = false;
      wbStreamingText = '';
      emitChatRecoveryTurn(tid);
      return;
    }
    S.driveActiveIfRunning({ force: true })
      .then(function () {
        if (!mounted) return;
        var next = S.getSnapshot && S.getSnapshot();
        var t2 = next && next.agentTask;
        var st2 = String((t2 && t2.status) || '');
        if (chatAtrBusyPhase(st2) && !chatDriveAlive(tid)) {
          wbChatBusy = false;
          wbStreamingText = '';
          emitChatRecoveryTurn(
            tid,
            t(
              'ha2ChatLoopDriveDropped',
              '工具循环驱动已断开 — 可恢复继续，或放弃后重发'
            )
          );
        }
        paint(next || snap);
      })
      .catch(function () {
        if (!mounted) return;
        wbChatBusy = false;
        wbStreamingText = '';
        emitChatRecoveryTurn(
          tid,
          t(
            'ha2ChatLoopDriveDropped',
            '工具循环驱动已断开 — 可恢复继续，或放弃后重发'
          )
        );
        paint(S.getSnapshot());
      });
  }

  function syncChatLoopFromAtr(snap) {
    var task = snap && snap.agentTask;
    if (!atrIsChatLoopTask(task)) return;
    var tid = String(task.taskId || '');
    var stBind = String((task && task.status) || '');
    // Never rebind the live chat loop to a terminal abandoned/cancelled leftover.
    if (
      tid &&
      tid !== chatLoopTaskId &&
      !chatStopPendingId &&
      stBind !== 'cancelled' &&
      stBind !== 'done' &&
      stBind !== 'failed'
    ) {
      chatLoopTaskId = tid;
      chatLoopSyncedEv = {};
    }
    if (chatStopPendingId && tid && tid === String(chatStopPendingId)) {
      // Soft-stop in flight — never re-stick busy from poll.
      wbChatBusy = false;
      wbStreamingText = '';
    }
    var evs = (snap && snap.agentTaskEvents) || [];
    var i;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i] || {};
      var eid = String(e.eventId || e.event_id || e.id || i);
      if (chatLoopSyncedEv[eid]) continue;
      var kind = String(e.kind || '');
      var tool = String(e.toolName || e.tool_name || '');
      var payload = e.payload || {};
      if (kind === 'tool_call') {
        // Persist call chip immediately — cancel mid-think must leave a foldable step.
        var callDetail = '';
        try {
          callDetail = JSON.stringify(payload).slice(0, 280);
        } catch (_) {
          callDetail = String(payload || '').slice(0, 280);
        }
        appendWbChatTurn({
          id: 'toolcall_' + eid,
          role: 'assistant',
          kind: 'tool_step',
          toolName: tool,
          toolOk: null,
          text: chatToolStepLabel(tool),
          detail: callDetail,
          collapsed: true
        });
        chatLoopSyncedEv[eid] = true;
      } else if (kind === 'tool_result' || kind === 'tool_error') {
        var ok = kind !== 'tool_error';
        var detail = '';
        try {
          detail = JSON.stringify(payload).slice(0, 480);
        } catch (_) {
          detail = String(payload || '').slice(0, 480);
        }
        if (
          tool === 'deliver_to_agent' &&
          payload &&
          payload.result &&
          payload.approved === true
        ) {
          var Sdel = store();
          if (Sdel && Sdel.setDeliveryReceipt) {
            try {
              Sdel.setDeliveryReceipt({
                phase: payload.result.ok ? 'done' : 'failed',
                outcome: payload.result.ok ? 'pasted_confirmed' : 'paste_failed',
                detail: payload.result.message || ''
              });
            } catch (_) {}
          }
        }
        appendWbChatTurn({
          id: 'tool_' + eid,
          role: 'assistant',
          kind: 'tool_step',
          toolName: tool,
          toolOk: ok && !(payload && payload.result && payload.result.ok === false),
          text: chatToolStepLabel(tool),
          detail: detail,
          collapsed: true
        });
        chatLoopSyncedEv[eid] = true;
      } else if (kind === 'waiting_user' || kind === 'waiting_user_input') {
        var q =
          (payload && (payload.question || payload.prompt)) ||
          t('ha2AtrAskInput', '回复 Agent 任务');
        appendWbChatTurn({
          id: 'need_' + eid,
          role: 'assistant',
          kind: 'needs_input',
          toolName: 'request_user_input',
          text: String(q),
          collapsed: false
        });
        chatLoopSyncedEv[eid] = true;
        wbChatBusy = false;
      } else if (kind === 'waiting_deliver') {
        var preview =
          (payload && (payload.preview || payload.text)) ||
          t('ha2ToolDeliver', '投递到 Agent');
        appendWbChatTurn({
          id: 'deliv_' + eid,
          role: 'assistant',
          kind: 'deliver_approval',
          toolName: 'deliver_to_agent',
          text: String(preview).slice(0, 280),
          detail: String((payload && payload.text) || '').slice(0, 800),
          approvalToken:
            (payload && (payload.approvalToken || payload.approval_token)) || '',
          collapsed: false
        });
        chatLoopSyncedEv[eid] = true;
        wbChatBusy = false;
      } else if (kind === 'interrupted' || kind === 'task_interrupted') {
        chatLoopSyncedEv[eid] = true;
        if (tryResumeInterruptedChat(tid, snap, task)) {
          continue;
        }
        // Resume already in flight — wait for its settle; don't double-paint recovery.
        if (chatHealTried[tid] && (wbChatBusy || chatDriveAlive(tid))) {
          continue;
        }
        wbChatBusy = false;
        wbStreamingText = '';
        wbStreamingReasoning = '';
        wbStreamingTurnId = '';
        wbThinkingTurnId = '';
        persistChatProcessTrace(tid, evs, 'interrupted');
        emitChatRecoveryTurn(
          tid,
          (payload && (payload.message || payload.summary || payload.error)) ||
            t(
              'ha2ChatLoopInterrupted',
              '工具循环已中断 — 可恢复、放弃旧任务，或放弃并发送新问题'
            )
        );
      } else if (kind === 'done' || kind === 'task_done') {
        var summary =
          (payload && payload.summary) ||
          t('ha2ToolFinishDone', '已完成');
        persistChatProcessTrace(tid, evs, 'done');
        // Key by task id — event-id upsert reused the old bubble above a newer user turn.
        var finId = 'fin_' + (tid || eid);
        if (
          !settleStreamedChatAnswer(tid, finId, summary, {
            kind: 'finish',
            toolName: 'finish',
            toolOk: true
          })
        ) {
          ensureChatReplyAfterLatestUser({
            id: finId,
            role: 'assistant',
            kind: 'finish',
            toolName: 'finish',
            text: String(summary),
            collapsed: false,
            toolOk: true
          });
        }
        // Collapse live thinking chip once the answer is settled.
        finalizeChatLoopProgressTurn(tid, t('ha2ToolThinkingDone', '已思考'), {
          toolOk: true
        });
        chatLoopSyncedEv[eid] = true;
        wbChatBusy = false;
        chatLoopTaskId = '';
        chatStopPendingId = '';
        chatBusySinceMs = 0;
        wbThinkingTurnId = '';
        wbStreamingReasoning = '';
        if (tid) {
          delete chatHealTried[tid];
          delete chatRecoveryEmitted[tid];
          delete chatStallTried[tid];
        }
      } else if (
        kind === 'failed' ||
        kind === 'task_failed' ||
        kind === 'cancelled' ||
        kind === 'model_error' ||
        kind === 'format_error'
      ) {
        var cancelReason = String(
          (payload && (payload.reason || payload.message)) || ''
        );
        // Auto-abandon when starting a new question — not a user Stop.
        if (
          kind === 'cancelled' &&
          (/abandoned/i.test(cancelReason) || chatDriveAlive(''))
        ) {
          chatLoopSyncedEv[eid] = true;
          continue;
        }
        // Event for a different task while this chat loop is bound elsewhere.
        if (
          chatLoopTaskId &&
          tid &&
          String(chatLoopTaskId) !== String(tid) &&
          kind === 'cancelled'
        ) {
          chatLoopSyncedEv[eid] = true;
          continue;
        }
        var rawErr =
          (payload && (payload.error || payload.message || payload.summary)) ||
          (task && (task.lastError || task.last_error)) ||
          kind;
        var err =
          kind === 'format_error'
            ? chatLoopHonestFailText('format_error', String(rawErr))
            : kind === 'cancelled'
              ? t('ha2WbChatCancelled', '已停止')
              : chatLoopHonestFailText(String(rawErr), String(rawErr));
        if (kind === 'cancelled') finalizeChatLoopProgressTurn(tid);
        persistChatProcessTrace(tid, evs, kind);
        if (
          !settleStreamedChatAnswer(tid, 'err_' + eid, err, {
            kind: 'finish',
            toolOk: false
          })
        ) {
          appendWbChatTurn({
            id: 'err_' + eid,
            role: 'assistant',
            kind: 'finish',
            text: String(err),
            toolOk: false
          });
        }
        chatLoopSyncedEv[eid] = true;
        if (!chatDriveAlive('')) {
          wbChatBusy = false;
          chatLoopTaskId = '';
          chatStopPendingId = '';
          chatBusySinceMs = 0;
          if (tid) {
            delete chatHealTried[tid];
            delete chatRecoveryEmitted[tid];
            delete chatStallTried[tid];
          }
        }
      }
    }
    var st = String((task && task.status) || '');
    if (chatStopPendingId && tid && tid === String(chatStopPendingId)) {
      if (
        st === 'done' ||
        st === 'failed' ||
        st === 'cancelled' ||
        st === 'interrupted' ||
        st === 'waiting'
      ) {
        chatStopPendingId = '';
        if (st !== 'interrupted' && st !== 'waiting') chatLoopTaskId = '';
      }
      return;
    }
    if (chatAtrBusyPhase(st)) {
      if (!chatBusySinceMs) chatBusySinceMs = Date.now();
      if (chatDriveAlive(tid)) {
        wbChatBusy = true;
        upsertChatLoopProgressTurn(task);
        maybeStallChatDrive(snap, task);
      } else {
        wbChatBusy = false;
        wbStreamingText = '';
        maybeHealChatDrive(snap, task);
      }
    } else if (st === 'waiting') {
      wbChatBusy = false;
      chatBusySinceMs = 0;
      if (tid) {
        delete chatHealTried[tid];
        delete chatStallTried[tid];
      }
    } else if (
      st === 'done' ||
      st === 'failed' ||
      st === 'cancelled' ||
      st === 'interrupted'
    ) {
      // New chat send already in flight — ignore leftover cancelled/interrupted dto.
      if (chatDriveAlive('') || chatDriveAlive(tid)) {
        return;
      }
      if (st === 'cancelled' || st === 'failed') {
        finalizeChatLoopProgressTurn(tid);
      }
      wbChatBusy = false;
      wbStreamingText = '';
      wbStreamingReasoning = '';
      wbStreamingTurnId = '';
      chatBusySinceMs = 0;
      if (st === 'interrupted') {
        if (tryResumeInterruptedChat(tid, snap, task)) {
          return;
        }
        if (chatHealTried[tid] && (wbChatBusy || chatDriveAlive(tid))) {
          return;
        }
        emitChatRecoveryTurn(tid);
      } else if (st === 'cancelled') {
        // Silent if auto-abandoned; user Stop still paints via cancel event / stopWbLocalStream.
        chatLoopTaskId = '';
        if (tid) {
          delete chatHealTried[tid];
          delete chatRecoveryEmitted[tid];
          delete chatStallTried[tid];
        }
      } else {
        chatLoopTaskId = '';
        if (tid) {
          delete chatHealTried[tid];
          delete chatRecoveryEmitted[tid];
          delete chatStallTried[tid];
        }
      }
    }
  }

  /**
   * Chat send → ATR read_only tool loop (same engine as work; different tools/prompt).
   * Freemodel / Soft Pad / custom API all via ATR provider.
   */
  function dispatchChatModeSend(S, snap, text, opts) {
    opts = opts || {};
    text = String(text || '').trim();
    if (!text) return;
    snap = snap || (S && S.getSnapshot && S.getSnapshot()) || {};

    // Weather stays on dedicated IPC (not ATR).
    var Caps = global.OneToneHomeAgentCapabilities;
    if (Caps && typeof Caps.looksLikeWeatherAsk === 'function' && Caps.looksLikeWeatherAsk(text)) {
      if (typeof opts.clearInput === 'function') opts.clearInput();
      if (!tryHandleWeatherLocal(text, currentCat(snap))) {
        // Fall through to ATR if weather handler declines.
      } else {
        return;
      }
    }

    if (!S || !S.startAndDriveAgentTask || !atrRuntimeOn()) {
      if (typeof opts.clearInput === 'function') opts.clearInput();
      appendWbChatTurn({ role: 'user', text: text });
      openWbChatPage({ chatOnly: true });
      appendWbChatTurn({
        role: 'assistant',
        kind: 'finish',
        text: chatLoopHonestFailText(
          'not_ready',
          t(
            'ha2ChatAtrOff',
            '对话工具循环未开启 — 请开启 Agent Task Runtime，并换引擎/配置密钥后再试'
          )
        ),
        toolOk: false
      });
      paintWbTranscript();
      return;
    }

    // Continue chat loop when waiting on user_input.
    var task = snap.agentTask;
    var st = task ? String(task.status || '') : '';
    var reason = atrTaskWaitingReason(task);
    if (
      atrIsChatLoopTask(task) &&
      st === 'waiting' &&
      reason === 'deliver_approval'
    ) {
      toast(t('ha2ChatWaitDeliver', '请先批准或取消投递'));
      return;
    }
    if (
      atrIsChatLoopTask(task) &&
      st === 'waiting' &&
      reason === 'user_input' &&
      S.submitAgentInput
    ) {
      // New unrelated question → abandon waiting clarify and start fresh chat.
      if (chatShouldStartNewWhileWaiting(text, task) && S.abandonAgentTask) {
        if (typeof opts.clearInput === 'function') opts.clearInput();
        appendWbChatTurn({ role: 'user', text: text });
        openWbChatPage({ chatOnly: true });
        wbChatBusy = true;
        wbStreamingText = '';
        wbStreamingReasoning = '';
        wbStreamingTurnId = '';
        wbThinkingTurnId = 'chat_loop_live';
        appendWbChatTurn({
          id: 'chat_loop_live',
          role: 'assistant',
          kind: 'tool_step',
          toolName: 'thinking',
          text: t('ha2ToolThinkingLive', '思考中…'),
          detail: t('ha2ChatLoopStarting', '正在启动工具循环…'),
          collapsed: false,
          toolOk: true,
          streaming: true
        });
        chatBusySinceMs = Date.now();
        chatHealTried = Object.create(null);
        chatStallTried = Object.create(null);
        chatRecoveryEmitted = Object.create(null);
        paintWbTranscript();
        S.abandonAgentTask()
          .catch(function (err) {
            if (String((err && err.message) || err) === 'no_task') return null;
            return Promise.reject(err);
          })
          .then(function () {
            return S.startAndDriveAgentTask({
              goal: text,
              materialsSummary:
                chatHistoryMaterialsSummary(opts.materialsSummary || '') ||
                opts.materialsSummary ||
                '',
              permissionMode: 'read_only',
              lane: 'chat',
              skipPlanConfirm: true,
              skipBlockingCheck: true,
              provider: resolveAtrProviderForChat()
            });
          })
          .then(function (dto) {
            if (!mounted) return;
            if (dto && dto.taskId) chatLoopTaskId = String(dto.taskId);
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            wbChatBusy = false;
            wbStreamingText = '';
            appendWbChatTurn({
              role: 'assistant',
              kind: 'finish',
              text: chatLoopHonestFailText(
                String((err && (err.code || err.message)) || err || ''),
                String((err && err.message) || err || 'chat_loop_failed')
              ),
              toolOk: false
            });
            paintWbTranscript();
          });
        return;
      }
      if (typeof opts.clearInput === 'function') opts.clearInput();
      appendWbChatTurn({ role: 'user', text: text });
      openWbChatPage({ chatOnly: true });
      wbChatBusy = true;
      upsertChatLoopProgressTurn(task);
      chatBusySinceMs = Date.now();
      if (task && task.taskId) {
        delete chatHealTried[String(task.taskId)];
        delete chatStallTried[String(task.taskId)];
      }
      paintWbTranscript();
      S.submitAgentInput(text)
        .then(function () {
          if (!mounted) return;
          wbChatBusy = true;
          paint(S.getSnapshot());
        })
        .catch(function (err) {
          wbChatBusy = false;
          wbStreamingText = '';
          appendWbChatTurn({
            role: 'assistant',
            kind: 'finish',
            text: chatLoopHonestFailText(
              String((err && (err.code || err.message)) || err || ''),
              String((err && err.message) || err || 'input_failed')
            ),
            toolOk: false
          });
          paintWbTranscript();
          toast(String((err && err.message) || err || 'input_failed'));
        });
      return;
    }

    // 「继续」在冲突/失败后应重发上一句真实问题，不要把「继续」当 goal。
    if (typeof atrLooksLikeContinueInput === 'function' && atrLooksLikeContinueInput(text)) {
      var conflictGoal =
        (snap.atrSendConflict && snap.atrSendConflict.goal) || '';
      var priorQ = '';
      var ti;
      for (ti = wbChatTurns.length - 1; ti >= 0; ti--) {
        var prev = wbChatTurns[ti];
        if (
          prev &&
          prev.role === 'user' &&
          String(prev.text || '').trim() &&
          !atrLooksLikeContinueInput(prev.text)
        ) {
          priorQ = String(prev.text).trim();
          break;
        }
      }
      text = String(conflictGoal || priorQ || text).trim();
    }

    var provider = resolveAtrProviderForChat();
    if (typeof opts.clearInput === 'function') opts.clearInput();
    appendWbChatTurn({
      role: 'user',
      text: text,
      model: provider,
      providerId: provider
    });
    chatLoopSyncedEv = {};
    chatLoopTaskId = '';
    chatStopPendingId = '';
    chatHealTried = Object.create(null);
    chatRecoveryEmitted = Object.create(null);
    chatStallTried = Object.create(null);
    chatBusySinceMs = Date.now();
    wbChatBusy = true;
    // Thinking chip — never an empty answer bubble (those paint as grey rails).
    wbStreamingText = '';
    wbStreamingReasoning = '';
    wbStreamingTurnId = '';
    wbThinkingTurnId = 'chat_loop_live';
    appendWbChatTurn({
      id: 'chat_loop_live',
      role: 'assistant',
      kind: 'tool_step',
      toolName: 'thinking',
      text: t('ha2ToolThinkingLive', '思考中…'),
      detail: t('ha2ChatLoopStarting', '正在启动工具循环…'),
      collapsed: false,
      toolOk: true,
      streaming: true
    });
    openWbChatPage({ chatOnly: true });
    paintWbTranscript();

    var matSum =
      chatHistoryMaterialsSummary(opts.materialsSummary || '') ||
      opts.materialsSummary ||
      '';

    function clearChatLoopBusy() {
      wbChatBusy = false;
      wbStreamingText = '';
      wbStreamingReasoning = '';
      wbStreamingTurnId = '';
      wbThinkingTurnId = '';
    }

    S.startAndDriveAgentTask({
      goal: text,
      materialsSummary: matSum,
      permissionMode: 'read_only',
      lane: 'chat',
      skipPlanConfirm: true,
      provider: provider
    })
      .then(function (dto) {
        if (!mounted) return;
        var stDone = dto ? String(dto.status || '') : '';
        if (dto && dto.taskId && stDone !== 'failed' && stDone !== 'cancelled') {
          chatLoopTaskId = String(dto.taskId);
          if (stDone === 'done') {
            clearChatLoopBusy();
            // sync may have upserted an older fin_* above this user turn — force a tail reply.
            ensureLatestChatFinish(dto, S.getSnapshot && S.getSnapshot());
          } else if (stDone === 'interrupted') {
            if (
              !tryResumeInterruptedChat(
                dto.taskId,
                S.getSnapshot && S.getSnapshot(),
                dto
              )
            ) {
              clearChatLoopBusy();
              emitChatRecoveryTurn(String(dto.taskId));
            }
          } else if (!chatAtrBusyPhase(stDone) && stDone !== 'waiting') {
            clearChatLoopBusy();
          }
        } else {
          var snapAfter =
            (S.getSnapshot && S.getSnapshot()) || {};
          var live = snapAfter.agentTask || dto;
          var liveId = String((live && live.taskId) || '');
          var liveSt = String((live && live.status) || '');
          var vn = snapAfter.validationNotice || {};
          var vnCode = String(vn.code || vn.kind || '');
          // FE atr_turn timeout / tool_error while Rust still finishing web_search —
          // keep the loop alive and redrive instead of painting opaque 提问失败.
          if (
            liveId &&
            chatAtrBusyPhase(liveSt) &&
            (/tool_error|timeout/i.test(vnCode) ||
              /tool_error|timeout/i.test(String(vn.message || '')))
          ) {
            chatLoopTaskId = liveId;
            wbChatBusy = true;
            wbStreamingText =
              chatLoopProgressText(live) ||
              t('ha2ChatLoopBusy', '工具循环中…');
            wbStreamingTurnId = 'chat_loop_live';
            chatBusySinceMs = Date.now();
            delete chatHealTried[liveId];
            if (typeof S.driveActiveIfRunning === 'function') {
              S.driveActiveIfRunning({ force: true }).catch(function () {});
            }
            paint(snapAfter);
            return;
          }
          finalizeChatLoopProgressTurn(
            chatLoopTaskId || (dto && dto.taskId) || liveId
          );
          clearChatLoopBusy();
          chatLoopTaskId = '';
          var failText =
            (dto && (dto.lastError || dto.last_error)) ||
            vn.message ||
            '';
          if (
            vnCode === 'interrupted' ||
            vnCode === 'busy' ||
            vnCode === 'waiting' ||
            vnCode === 'abandon_start_failed' ||
            /atr_interrupted|atr_busy|atr_waiting|abandon_start_failed/i.test(
              vnCode
            )
          ) {
            appendWbChatTurn({
              role: 'assistant',
              kind: 'chat_conflict',
              text: chatLoopHonestFailText(vnCode, failText),
              toolOk: false
            });
          } else {
            appendWbChatTurn({
              role: 'assistant',
              kind: 'finish',
              text: chatLoopHonestFailText(
                vnCode || stDone || 'chat_loop_failed',
                failText || String(stDone || 'chat_loop_failed')
              ),
              toolOk: false
            });
          }
        }
        paint(S.getSnapshot());
      })
      .catch(function (err) {
        var code = String((err && (err.code || err.message)) || err || '');
        var snapAfter = (S.getSnapshot && S.getSnapshot()) || {};
        var live = snapAfter.agentTask;
        var liveId = String((live && live.taskId) || '');
        var liveSt = String((live && live.status) || '');
        if (
          liveId &&
          chatAtrBusyPhase(liveSt) &&
          /tool_error|timeout/i.test(code)
        ) {
          chatLoopTaskId = liveId;
          wbChatBusy = true;
          wbStreamingText =
            chatLoopProgressText(live) ||
            t('ha2ChatLoopBusy', '工具循环中…');
          wbStreamingTurnId = 'chat_loop_live';
          chatBusySinceMs = Date.now();
          delete chatHealTried[liveId];
          if (typeof S.driveActiveIfRunning === 'function') {
            S.driveActiveIfRunning({ force: true }).catch(function () {});
          }
          paint(snapAfter);
          return;
        }
        clearChatLoopBusy();
        chatLoopTaskId = '';
        appendWbChatTurn({
          role: 'assistant',
          kind: 'finish',
          text: chatLoopHonestFailText(
            code,
            String((err && err.message) || err || 'chat_loop_failed')
          ),
          toolOk: false
        });
        paintWbTranscript();
      });
  }

  function send() {
    var S = store();
    var D = dock();
    var snap = S.getSnapshot();
    var c = currentCat(snap);
    var ctx = snap.targetContext || (S.resolveTargetContext && S.resolveTargetContext()) || {};
    var draft = snap.draft || '';
    var dockTa = root && root.querySelector('.ha2-compose [data-ha2-draft]');
    if (dockTa) draft = dockTa.value;
    S.setDraft(draft, { silent: true });
    var draftRemember = String(draft).trim();
    var editMode = String((snap && snap.workMode) || '') === 'edit';
    if (
      !draftRemember &&
      !(snap.materials && snap.materials.length) &&
      !(
        editMode &&
        (atrNeedsApproval(snap) ||
          workConfirmOpen ||
          atrTaskBusy(snap) ||
          atrTaskShouldSurface(snap))
      )
    ) {
      return;
    }

    // Write-like goals in 对话 → auto 工作 (otherwise toast "已发送" but never touches files).
    snap = promoteWorkModeForEditGoal(S, snap, draftRemember);
    editMode = String((snap && snap.workMode) || '') === 'edit';

    // Edit mode → ATR for file goals; chat for non-edit text (e.g. 今天天气).
    // Must run before the desktop-Agent gate — ATR uses Soft Pad/WorkBuddy providers.
    if (editMode) {
      dispatchEditModeSend(S, snap, draftRemember, materialsSummaryLine(snap), {
        clearInput: function () {
          S.setDraft('', { silent: true });
          syncDraftMirrors('');
          if (dockTa) dockTa.value = '';
        }
      });
      return;
    }

    // Chat → ATR tool loop (freemodel / Soft Pad / API). Gateway plain-text is no longer primary.
    if (gatewayChatEligible(snap)) {
      if (!draftRemember) {
        S.setValidationNotice({
          kind: 'wb_need_text',
          message: t('ha2WbNeedText', '本机对话请先写一句（材料请用桌面模式投递）')
        });
        return;
      }
      var clearChat = function () {
        S.setDraft('', { silent: true });
        syncDraftMirrors('');
        if (dockTa) dockTa.value = '';
      };
      var bootChat = function () {
        dispatchChatModeSend(S, snap, draftRemember, {
          clearInput: clearChat,
          materialsSummary: materialsSummaryLine(snap)
        });
      };
      if (!wbLocalCache) {
        refreshWbLocal(true).then(function () {
          if (!mounted) return;
          bootChat();
        });
        return;
      }
      bootChat();
      return;
    }

    if (!c.id) {
      S.setValidationNotice({
        kind: 'missing_agent',
        message: t('ha2PickAgent', '选择 Agent')
      });
      return;
    }

    var matching = null;
    for (var i = 0; i < snap.agents.length; i++) {
      if (snap.agents[i].kind === c.id) {
        matching = snap.agents[i];
        break;
      }
    }
    var agentId = sendAgentIdFor(c.id, snap);
    var appId =
      c.appId ||
      (D && typeof D.appIdForTarget === 'function' ? D.appIdForTarget(c.id) : '') ||
      '';
    // Desktop catalog target can hand off even when Center row is missing / focus disabled.
    if (!appId && (!matching || !can(matching.actions, 'agent.focus'))) {
      S.setValidationNotice({
        kind: 'no_focus_action',
        message: matching
          ? t('ha2NoFocusAction', 'Agent Center 未提供可发送动作')
          : t('ha2NoDeliverable', '未发现可投递的桌面 App 或匹配 CLI')
      });
      return;
    }
    if (!agentId) {
      S.setValidationNotice({
        kind: 'no_focus_action',
        message: t('ha2NoDeliverable', '未发现可投递的桌面 App 或匹配 CLI')
      });
      return;
    }

    var PrepSend = global.OneToneHomePromptPrep;
    if (
      PrepSend &&
      PrepSend._model &&
      PrepSend._model().organizedDraft &&
      PrepSend._model().organizedDraft.stale &&
      PrepSend._model().activeDraft === 'organized'
    ) {
      var proceedStale = true;
      try {
        proceedStale = global.confirm
          ? global.confirm(
              t(
                'ha2OrganizeStaleConfirm',
                '材料或原稿已变化，整理稿可能过期。仍要发送当前整理稿吗？'
              )
            )
          : true;
      } catch (_) {}
      if (!proceedStale) return;
    }
    var sendBody =
      PrepSend && typeof PrepSend.buildSendBody === 'function'
        ? PrepSend.buildSendBody({
            attachEvidence: true,
            projectPath: ctx.projectPath || null,
            targetKind: c.id
          })
        : null;
    var text =
      sendBody && String(sendBody.body || '').trim()
        ? String(sendBody.body)
        : D && D.assembledText
          ? D.assembledText(draft)
          : draft;
    var snapId =
      (sendBody && sendBody.snapshotId) ||
      (PrepSend && PrepSend._model && PrepSend._model().lastSendSnapshotId) ||
      null;
    S.setDeliveryReceipt({
      phase: 'sending',
      outcome: 'delivery_attempt',
      title: t('ha2AttemptingTo', '正在尝试投递到') + ' ' + c.name,
      message: S.windowsLabel(c.id),
      verified: false,
      inputConfirmed: false,
      snapshotId: snapId,
      taskScopeId:
        (sendBody && sendBody.taskScopeId) ||
        (PrepSend && PrepSend._model ? PrepSend._model().taskScopeId : null)
    });

    var clipWrite =
      global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText
        ? global.navigator.clipboard.writeText(String(text || ''))
        : Promise.reject(new Error('clipboard_unavailable'));

    clipWrite
      .then(function () {
        // Ensure composer memory (inherit or first-use calibrate), then paste.
        if (D && D.ensureAim) {
          return D.ensureAim(c.id, { force: false });
        }
        return { ok: !!appId, reason: appId ? null : 'no_app_target' };
      })
      .then(function (aim) {
        if (aim && aim.reason === 'no_app_target') {
          throw new Error(t('ha2AimNeedTarget', '先选发送目标，再发送'));
        }
        // aim_not_confirmed: still paste — Rust falls back to profile / layout anchors.
        // Project is a handoff hint only — never gate send on projectPath.
        return invoke('cmd_agent_center_action', {
          args: {
            agentId: agentId,
            actionId: 'agent.focus',
            pasteClipboard: true,
            projectHint: ctx.projectPath || undefined,
            attemptId: 'home-v2-send-' + Date.now().toString(36)
          }
        });
      })
      .then(function (res) {
        var cls = classifyActionResult(res);
        var remember =
          draftRemember &&
          (cls.tier === 'verified_paste' ||
            cls.tier === 'verified_no_paste' ||
            cls.tier === 'attempted');
        if (remember && D && D.archiveOnSuccess) {
          D.archiveOnSuccess(c.id, {
            body: draftRemember,
            outcome:
              cls.tier === 'verified_paste'
                ? 'sent'
                : cls.tier === 'verified_no_paste'
                  ? 'activated'
                  : 'attempted',
            clear: cls.tier === 'verified_paste',
            source: 'home-v2'
          });
        }
        if (cls.tier === 'verified_paste') {
          S.setDeliveryReceipt({
            phase: 'done',
            outcome: 'pasted_confirmed',
            title: t('ha2PastedConfirmed', '已确认粘贴到输入框') + ' · ' + c.name,
            message: t('ha2FgAndComposer', '目标前台与输入框均已确认'),
            verified: true,
            inputConfirmed: true,
            snapshotId: snapId
          });
          S.setDraft('', { silent: true });
          syncDraftMirrors('');
        } else if (cls.tier === 'verified_no_paste') {
          S.setDeliveryReceipt({
            phase: 'done',
            outcome: 'activated_confirmed',
            title: t('ha2ActivatedConfirmed', '已确认唤起目标') + ' · ' + c.name,
            message: cls.detail || t('ha2FgOnly', '目标已取得前台 · 未确认粘贴'),
            verified: true,
            inputConfirmed: false
          });
        } else if (cls.tier === 'attempted') {
          S.setDeliveryReceipt({
            phase: 'done',
            outcome: 'attempted',
            title: t('ha2AttemptedUnverified', '已尝试，结果未确认'),
            message: cls.detail || t('ha2DeliveryUnconfirmed', '已尝试投递 · 未确认进入输入框'),
            verified: false,
            inputConfirmed: false
          });
        } else {
          S.setDeliveryReceipt({
            phase: 'failed',
            outcome: 'failed',
            title: t('ha2DeliveryFailed', '投递失败'),
            message: cls.detail || t('ha2ActivateFailed', '无法激活目标或执行粘贴'),
            verified: false,
            inputConfirmed: false
          });
        }
        applyActionClientEffect(res, agentId);
      })
      .catch(function (e) {
        S.setDeliveryReceipt({
          phase: 'failed',
          outcome: 'failed',
          title: t('ha2DeliveryFailed', '投递失败'),
          message: (e && e.message) || String(e),
          verified: false,
          inputConfirmed: false
        });
      });
  }

  function openAttentionAgent(kind, agentId) {
    var S = store();
    if (kind && S && S.setSelected) S.setSelected(kind, { lock: true });
    var Nav = global.OneToneAgentNavTarget;
    if (Nav && Nav.open) {
      Nav.open({
        view: 'overview',
        section: 'working',
        provider: kind || undefined,
        agentId: agentId || undefined
      });
      return;
    }
    if (S) S.setView('agent');
  }

  function syncDraftMirrors(text) {
    if (!root) return;
    var active = document.activeElement;
    var next = text == null ? '' : String(text);
    var nodes = root.querySelectorAll('[data-ha2-draft]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] === active) continue;
      // Remount race: never clobber non-empty live text with empty store.
      if (!next && String(nodes[i].value || '')) continue;
      if (nodes[i].value !== next) nodes[i].value = next;
    }
  }

  function onChange(e) {
    var el = e && e.target;
    if (!el || !el.matches) return;
    if (el.matches('[data-ha2-atr-provider]')) {
      var Atr = global.OneToneHomeAgentTask;
      var pid = String(el.value || '').trim();
      if (Atr && Atr.writeProvider && pid) Atr.writeProvider(pid);
      var Sprov = store();
      if (Sprov && Sprov.setValidationNotice) Sprov.setValidationNotice(null);
      if (mounted) paint(Sprov && Sprov.getSnapshot ? Sprov.getSnapshot() : null);
      return;
    }
    /* model route uses custom dropdown click handler (applyModelRouteSelection) */
    if (el.matches('[data-ha2-consult-skill]')) {
      var Csk = concierge();
      if (Csk && Csk.setFlowSkill) Csk.setFlowSkill(el.value);
      var Ssk = store();
      if (Ssk) paint(Ssk.getSnapshot());
      return;
    }
    if (
      el.matches('[data-ha2-research-depth]') ||
      el.matches('[data-ha2-research-format]') ||
      el.matches('[data-ha2-research-path]')
    ) {
      var Rcfg = global.OneToneHomeResearch;
      if (el.matches('[data-ha2-research-path]') && Rcfg && Rcfg.updatePlan) {
        Rcfg.updatePlan({ path: el.value });
        if (wbChatPageOpen) paintWbChatPage();
        else if (store()) paint(store().getSnapshot());
        return;
      }
      if (Rcfg && Rcfg.updateConfig) {
        var patch = {};
        if (el.matches('[data-ha2-research-depth]')) patch.depth = el.value;
        if (el.matches('[data-ha2-research-format]')) patch.format = el.value;
        Rcfg.updateConfig(patch, { silent: true });
      }
      return;
    }
    if (!el.matches('[data-ha2-wb-model]')) return;
    var id = String(el.getAttribute('data-wb-id') || '');
    var model = String(el.value || '');
    if (!id || !model) return;
    invoke('cmd_workbuddy_local_account_set_model', { id: id, model: model })
      .then(function (res) {
        if (res && res.snapshot) {
          wbLocalCache = projectWbLocal(res.snapshot);
          return wbLocalCache;
        }
        return refreshWbLocal(true);
      })
      .catch(function () {
        return refreshWbLocal(true);
      })
      .then(function () {
        if (mounted) {
          syncWbModelHost('workbuddy');
          syncWbChatChrome('workbuddy');
        }
      });
  }

  // The compose can become visible before the deferred home-agent group has
  // finished registering its store/controller. Serialize the first send behind
  // that load so the user's draft is not lost during cold start.
  var homeAgentSendInFlight = null;
  function ensureHomeAgentReadyThenSend() {
    var Defer = global.OneToneDefer;
    if (!Defer || typeof Defer.loadGroup !== 'function') {
      send();
      return;
    }
    if (homeAgentSendInFlight) return homeAgentSendInFlight;
    homeAgentSendInFlight = Promise.resolve()
      .then(function () { return Defer.loadGroup('home-agent'); })
      .then(function () {
        if (mounted) send();
      })
      .catch(function (err) {
        var msg = String((err && err.message) || err || 'home_agent_load_failed');
        toast('首页 Agent 模块加载失败：' + msg.slice(0, 120));
      })
      .then(function (result) {
        homeAgentSendInFlight = null;
        return result;
      });
    return homeAgentSendInFlight;
  }

  function onInput(e) {
    var D = dock();
    if (e.target.matches && e.target.matches('[data-ha2-model-route-search]')) {
      filterModelRouteMenu(e.target.value);
      return;
    }
    if (e.target.matches && e.target.matches('[data-ha2-mat-text]')) {
      if (composing) return;
      var mid = e.target.getAttribute('data-ha2-mat-text');
      if (!mid || !D || !D.updateMaterialContent) return;
      D.updateMaterialContent(mid, { content: e.target.value }, { skipSync: true });
      return;
    }
    if (e.target.matches && e.target.matches('[data-ha2-wb-page-draft]')) {
      if (composing) return;
      wbPageDraftText = String(e.target.value || '');
      return;
    }
    if (!e.target.matches || !e.target.matches('[data-ha2-draft]')) return;
    if (composing) return;
    var val = e.target.value;
    try {
      draftSel.start = e.target.selectionStart;
      draftSel.end = e.target.selectionEnd;
    } catch (_) {}
    if (D && D.syncDraftToPrep) D.syncDraftToPrep(val);
    else if (store()) store().setDraft(val, { lock: true, silent: true });
    syncDraftMirrors(val);
    var sendBtn = root && root.querySelector('[data-ha2-send]');
    var snap = store() && store().getSnapshot();
    if (sendBtn) {
      sendBtn.disabled = !String(val).trim() && !(snap && snap.materials && snap.materials.length);
    }
  }

  function isHa2ComposeTarget(el) {
    return !!(
      el &&
      el.matches &&
      (el.matches('[data-ha2-draft]') ||
        el.matches('[data-ha2-mat-text]') ||
        el.matches('[data-ha2-wb-page-draft]'))
    );
  }

  function onCompositionStart(e) {
    if (!isHa2ComposeTarget(e.target)) return;
    composing = true;
    if (store() && store().setComposing) store().setComposing(true);
  }

  function onCompositionEnd(e) {
    if (!isHa2ComposeTarget(e.target)) return;
    composing = false;
    if (store() && store().setComposing) store().setComposing(false);
    // Page draft still needs stash (not store-backed); dock goes through onInput.
    onInput(e);
  }

  /** Multi-line / multi-paragraph / medium+ paste → expandable card (not draft). */
  function isLongMatText(text) {
    var s = String(text || '');
    if (!s.trim()) return false;
    if (s.length >= 48) return true;
    // \r, \n, or Unicode line/para separators (Word / web paste).
    if (/[\r\n\u2028\u2029]/.test(s)) return true;
    return false;
  }

  function shouldPasteAsTextCard(text) {
    return isLongMatText(text);
  }

  /** text/html → plain with paragraph breaks when plain clipboard flattened them. */
  function htmlToPlainMultiline(html) {
    var s = String(html || '');
    if (!s) return '';
    s = s.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n');
    s = s.replace(/<(p|div|li|h[1-6]|tr)(?:\s[^>]*)?>/gi, '\n');
    s = s.replace(/<[^>]+>/g, '');
    s = s
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
    return s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  function clipboardPlainText(cd) {
    var plain = '';
    try {
      plain = cd ? String(cd.getData('text/plain') || '') : '';
    } catch (_) {
      plain = '';
    }
    if (/[\r\n\u2028\u2029]/.test(plain)) return plain;
    var html = '';
    try {
      html = cd ? String(cd.getData('text/html') || '') : '';
    } catch (_) {
      html = '';
    }
    if (!html) return plain;
    var fromHtml = htmlToPlainMultiline(html);
    if (fromHtml && /[\r\n]/.test(fromHtml)) return fromHtml;
    return plain || fromHtml;
  }

  function toastMatResult(res, failFallback) {
    if (!res) return;
    if (res.message) {
      toast(res.message);
      return;
    }
    if (res.outcome === 'failed') toast(failFallback || t('ha2MatFailed', '添加材料失败'));
    else if (res.outcome === 'cancelled') toast(t('ha2MatCancelled', '已取消'));
  }

  function draftWantsImagePaste(cd) {
    if (!cd) return false;
    var i;
    var items = cd.items;
    if (items) {
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (it && String(it.type || '').indexOf('image/') === 0) return true;
      }
    }
    if (cd.files && cd.files.length) {
      for (i = 0; i < cd.files.length; i++) {
        var f = cd.files[i];
        if (f && String(f.type || '').indexOf('image/') === 0) return true;
        if (f && /\.(png|jpe?g|gif|webp|bmp)$/i.test(String(f.name || ''))) return true;
      }
    }
    return false;
  }

  function onPaste(e) {
    // Editing an existing text card — keep native paste; upgrade to expand if multi-para.
    if (e.target.matches && e.target.matches('[data-ha2-mat-text]')) {
      var editId = e.target.getAttribute('data-ha2-mat-text');
      global.requestAnimationFrame(function () {
        var ta = e.target;
        if (!ta || !editId) return;
        var val = String(ta.value || '');
        var Dk = dock();
        if (Dk && Dk.updateMaterialContent) {
          Dk.updateMaterialContent(editId, { content: val }, { skipSync: true });
        }
        if (isLongMatText(val) && !matTextExpanded[editId]) expandMatText(editId);
      });
      return;
    }
    var inDraft =
      e.target.matches &&
      (e.target.matches('[data-ha2-draft]') ||
        (e.target.closest && e.target.closest('[data-ha2-draft]')));
    if (!inDraft) return;
    var cd = e.clipboardData;
    var D = dock();
    if (!D) return;

    var files = [];
    var items = cd && cd.items;
    var i;
    if (items) {
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it) continue;
        var typ = String(it.type || '');
        var asFile =
          it.kind === 'file' || typ.indexOf('image/') === 0
            ? typeof it.getAsFile === 'function'
              ? it.getAsFile()
              : null
            : null;
        if (asFile) files.push(asFile);
      }
    }
    // Soft Pad path: some WebViews expose image only via files[].
    if (!files.length && cd && cd.files && cd.files.length) {
      for (i = 0; i < cd.files.length; i++) {
        if (cd.files[i]) files.push(cd.files[i]);
      }
    }
    if (files.length && D.addFiles) {
      e.preventDefault();
      e.stopPropagation();
      D.addFiles(files).then(
        function (res) {
          // Blob write may be denied on main window — fall back to Win32.
          if (res && res.outcome === 'failed' && D.pasteImageFromNative) {
            return D.pasteImageFromNative().then(function (nativeRes) {
              toastMatResult(nativeRes || res, t('ha2MatImageFailed', '粘贴图片失败'));
            });
          }
          toastMatResult(res, t('ha2MatImageFailed', '粘贴图片失败'));
        },
        function () {
          if (D.pasteImageFromNative) {
            return D.pasteImageFromNative().then(function (res) {
              toastMatResult(res, t('ha2MatImageFailed', '粘贴图片失败'));
            });
          }
          toast(t('ha2MatImageFailed', '粘贴图片失败'));
        }
      );
      return;
    }

    var text = clipboardPlainText(cd);
    var hintImg = draftWantsImagePaste(cd);
    var emptyText = !String(text || '').trim();
    // Explicit image MIME, or empty paste (screenshot often has no text/files in WebView).
    if ((hintImg || emptyText) && !shouldPasteAsTextCard(text) && D.pasteImageFromNative) {
      e.preventDefault();
      e.stopPropagation();
      D.pasteImageFromNative().then(
        function (res) {
          if (res && res.outcome === 'added') {
            toastMatResult(res);
            return;
          }
          // No image — don't spam on empty Ctrl+V; only toast when MIME hinted image.
          if (hintImg) toastMatResult(res, t('ha2MatImageFailed', '粘贴图片失败'));
        },
        function () {
          if (hintImg) toast(t('ha2MatImageFailed', '粘贴图片失败'));
        }
      );
      return;
    }
    if (!shouldPasteAsTextCard(text) || !D.pasteTextAsMaterial) return;
    e.preventDefault();
    e.stopPropagation();
    D.pasteTextAsMaterial(text).then(
      function (res) {
        toastMatResult(res, t('ha2MatFailed', '添加材料失败'));
        maybeExpandLongMat(res);
      },
      function () {
        toast(t('ha2MatFailed', '添加材料失败'));
      }
    );
  }

  function rebuildAttachments(snap) {
    if (!root) return;
    var host = root.querySelector('[data-ha2-attach-host]');
    if (!host) return;
    snap = snap || (store() && store().getSnapshot());
    if (!snap) return;
    // Bypass paint()'s matFocus skip — expand/collapse/new paste must refresh the strip.
    host.innerHTML = attachmentsHtml(snap);
  }

  function paintMatsOnly() {
    if (!root || !store()) return;
    paint(store().getSnapshot());
  }

  function expandMatText(id) {
    id = String(id || '');
    if (!id) return;
    // Ghost click after 收起 lands on 展开 at the same spot — ignore briefly.
    if (matCollapseGuardUntil[id] && Date.now() < matCollapseGuardUntil[id]) return;
    matTextExpanded[id] = true;
    var seq = (matTextExpandSeq[id] = (matTextExpandSeq[id] || 0) + 1);
    rebuildAttachments();
    global.requestAnimationFrame(function () {
      if (matTextExpandSeq[id] !== seq || !matTextExpanded[id]) return;
      var ta = root && root.querySelector('[data-ha2-mat-text="' + id + '"]');
      if (ta && ta.focus) {
        try {
          ta.focus();
          var len = String(ta.value || '').length;
          ta.setSelectionRange(len, len);
        } catch (_) {}
      }
    });
  }

  function maybeExpandLongMat(res) {
    if (!res || res.outcome !== 'added' || !res.material || !res.material.id) return;
    var c = String(res.material.content || '');
    if (isLongMatText(c)) expandMatText(res.material.id);
  }

  function collapseMatText(id) {
    id = String(id || '');
    if (!id) return;
    matTextExpandSeq[id] = (matTextExpandSeq[id] || 0) + 1;
    matCollapseGuardUntil[id] = Date.now() + 400;
    // Flush edits before collapsing (skipSync paint would otherwise lose focus mid-type).
    var ta = root && root.querySelector('[data-ha2-mat-text="' + id + '"]');
    var D = dock();
    if (ta && D && D.updateMaterialContent) {
      D.updateMaterialContent(id, { content: ta.value }, { skipSync: true });
    }
    delete matTextExpanded[id];
    if (ta && ta.blur) {
      try {
        ta.blur();
      } catch (_) {}
    }
    rebuildAttachments();
  }

  function eventEl(e) {
    var t = e && e.target;
    if (t && t.nodeType === 3) t = t.parentElement;
    return t && t.nodeType === 1 ? t : null;
  }

  /** Mouse/touch: handle on pointerdown + preventDefault so the follow-up click cannot re-expand. */
  function onMatTogglePointerDown(e) {
    if (e.button != null && e.button !== 0) return;
    var el = eventEl(e);
    if (!el || !el.closest) return;
    var tEl = el.closest('[data-ha2-mat-expand],[data-ha2-mat-collapse]');
    if (!tEl || !root || !root.contains(tEl)) return;
    e.preventDefault();
    e.stopPropagation();
    if (tEl.hasAttribute('data-ha2-mat-collapse')) {
      collapseMatText(tEl.getAttribute('data-ha2-mat-collapse'));
    } else {
      expandMatText(tEl.getAttribute('data-ha2-mat-expand'));
    }
  }

  function onClick(e) {
    var el = eventEl(e);
    if (!el || !el.closest) return;
    var tEl = el.closest(
      '[data-ha2-model-route-trigger],[data-ha2-model-route-opt],[data-ha2-menu-picker],[data-ha2-agent-toggle],[data-ha2-picker],[data-ha2-picker-close],[data-ha2-pick-follow],[data-ha2-pick],[data-ha2-detail],[data-ha2-home],[data-ha2-action],[data-ha2-open-center],[data-ha2-open-model-providers],[data-ha2-go-agent],[data-ha2-habit-hub],[data-ha2-alert-action],[data-ha2-session],[data-ha2-refresh],[data-ha2-send],[data-ha2-retry],[data-ha2-organize],[data-ha2-organize-cancel],[data-ha2-pcx],[data-ha2-consult-clarify],[data-ha2-consult-confirm],[data-ha2-consult-compile],[data-ha2-consult-find],[data-ha2-consult-skip-all],[data-ha2-consult-skip],[data-ha2-consult-answer],[data-ha2-consult-adopt],[data-ha2-assist-keys],[data-ha2-wb-login-cta],[data-ha2-atr-wb-login-open],[data-ha2-atr-wb-login],[data-ha2-atr-wb-login-cancel],[data-ha2-atr-wb-login-dismiss],[data-ha2-enable-metered],[data-ha2-remove],[data-ha2-aim-clear],[data-ha2-aim],[data-ha2-cap],[data-ha2-reply-tone],[data-ha2-compose-more],[data-ha2-add],[data-ha2-mat],[data-ha2-select],[data-ha2-tm],[data-ha2-mat-expand],[data-ha2-mat-collapse],[data-ha2-wb-mode],[data-ha2-wb-transcript-toggle],[data-ha2-wb-chat-clear],[data-ha2-open-wb-config],[data-ha2-work-mode],[data-ha2-work-confirm-start],[data-ha2-work-confirm-cancel],[data-ha2-handoff-open],[data-ha2-handoff-apply],[data-ha2-handoff-cancel],[data-ha2-research-start],[data-ha2-research-confirm],[data-ha2-research-replan],[data-ha2-research-clarify],[data-ha2-research-clarify-submit],[data-ha2-research-cancel],[data-ha2-research-restart],[data-ha2-research-export],[data-ha2-research-file],[data-ha2-wb-page-back],[data-ha2-wb-page-clear],[data-ha2-wb-page-send],[data-ha2-wb-page-stop],[data-ha2-chat-needs-reply],[data-ha2-chat-deliver-approve],[data-ha2-chat-deliver-reject],[data-ha2-atr-open-page],[data-ha2-atr-open-history],[data-ha2-atr-log-toggle],[data-ha2-atr-log-copy],[data-ha2-atr-approve],[data-ha2-atr-approve-all],[data-ha2-atr-reject],[data-ha2-atr-input],[data-ha2-atr-continue],[data-ha2-atr-keep-draft],[data-ha2-atr-resume],[data-ha2-atr-retry-action],[data-ha2-atr-replan],[data-ha2-atr-abandon],[data-ha2-atr-abandon-send],[data-ha2-atr-verify-engine],[data-ha2-atr-accept-recommend],[data-ha2-atr-switch-deepseek],[data-ha2-atr-toggle-beginner],[data-ha2-atr-advanced]'
    );
    if (!tEl) return;
    var S = store();
    var D = dock();
    if (tEl.hasAttribute('data-ha2-model-route-trigger')) {
      toggleModelRouteMenu();
      return;
    }
    if (tEl.hasAttribute('data-ha2-model-route-opt')) {
      var routeOpt = tEl.getAttribute('data-ha2-model-route-opt') || '';
      var routeTrig =
        (root && root.querySelector('[data-ha2-model-route-trigger]')) || null;
      var routePurpose =
        (routeTrig && routeTrig.getAttribute('data-ha2-model-route')) || 'synthesis';
      applyModelRouteSelection(routeOpt, routePurpose);
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-accept-recommend')) {
      var Arec = global.OneToneHomeAgentTask;
      var nRec = S && S.getSnapshot && S.getSnapshot().validationNotice;
      var recId =
        (nRec && nRec.recommendedProvider) ||
        (atrProvidersCache && atrProvidersCache.recommendedProvider) ||
        '';
      if (Arec && Arec.writeProvider && recId) {
        Arec.writeProvider(recId);
        if (S.setValidationNotice) S.setValidationNotice(null);
        toast(t('ha2AtrRecommendAccepted', '已选用推荐引擎') + '：' + recId);
        paint(S.getSnapshot());
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-verify-engine')) {
      closeWorkConfirm();
      startAtrSandboxVerify();
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-switch-deepseek')) {
      var Ads = global.OneToneHomeAgentTask;
      if (Ads && Ads.writeProvider) {
        Ads.writeProvider('deepseek');
        if (S && S.setValidationNotice) S.setValidationNotice(null);
        toast(t('ha2AtrSwitchedDeepseek', '已改用 DeepSeek（Soft Pad）— 请确认密钥后发送'));
        paint(S.getSnapshot());
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-toggle-beginner')) {
      setAtrBeginner(!atrBeginnerOn());
      toast(
        atrBeginnerOn()
          ? t('ha2AtrBeginnerOn', '已切换到新手模式')
          : t('ha2AtrAdvancedOn', '已切换到高级模式')
      );
      paint(S && S.getSnapshot ? S.getSnapshot() : null);
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-advanced')) {
      setAtrBeginner(false);
      paint(S && S.getSnapshot ? S.getSnapshot() : null);
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-open-page')) {
      if (S && S.clearAtrSendConflict) S.clearAtrSendConflict({ silent: true });
      atrWbPageUserClosed = false;
      atrWbPageForced = true;
      openAtrEditPage(
        (S &&
          S.getSnapshot &&
          S.getSnapshot().agentTask &&
          S.getSnapshot().agentTask.goal) ||
          atrWbPagePendingGoal ||
          ''
      );
      if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-open-history')) {
      var histId = String(tEl.getAttribute('data-ha2-atr-open-history') || '').trim();
      var snapH = S && S.getSnapshot ? S.getSnapshot() : null;
      var stackH = (snapH && snapH.agentTaskStack) || [];
      var goalH = '';
      var hi;
      for (hi = 0; hi < stackH.length; hi++) {
        if (
          stackH[hi] &&
          stackH[hi].task &&
          String(stackH[hi].task.taskId) === histId
        ) {
          goalH = String(stackH[hi].task.goal || '');
          break;
        }
      }
      if (
        histId &&
        S &&
        S.setActiveAgentTask &&
        !(snapH && snapH.agentTask && String(snapH.agentTask.taskId) === histId)
      ) {
        S.setActiveAgentTask(histId, { grant: true }).catch(function () {});
      }
      atrWbPageUserClosed = false;
      atrLogExpandedById[histId] = true;
      openAtrEditPage(goalH || atrWbPagePendingGoal || '');
      if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-continue')) {
      if (S && S.clearAtrSendConflict) S.clearAtrSendConflict({ silent: true });
      if (S && S.setValidationNotice) S.setValidationNotice(null);
      paint(S && S.getSnapshot ? S.getSnapshot() : null);
      toast(t('ha2AtrSeeApproval', '请在上方审批卡处理'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-keep-draft')) {
      if (S && S.keepDraftDeferAtrSend) {
        S.keepDraftDeferAtrSend().then(function () {
          toast(t('ha2AtrKeepDraftOk', '草稿已保留，旧任务未改动'));
          paint(S.getSnapshot());
        });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-resume')) {
      if (S && S.clearAtrSendConflict) S.clearAtrSendConflict({ silent: true });
      if (S && S.setValidationNotice) S.setValidationNotice(null);
      var snapResume = S && S.getSnapshot ? S.getSnapshot() : null;
      var taskResume = snapResume && snapResume.agentTask;
      var stResume = String((taskResume && taskResume.status) || '');
      var tidResume = String((taskResume && taskResume.taskId) || '');
      if (tidResume) {
        delete chatHealTried[tidResume];
        delete chatRecoveryEmitted[tidResume];
      }
      // Chat heal may leave status running — resume IPC only accepts interrupted/waiting/failed.
      var chatRedrive =
        atrIsChatLoopTask(taskResume) &&
        chatAtrBusyPhase(stResume) &&
        S &&
        typeof S.driveActiveIfRunning === 'function';
      var resumeP = chatRedrive
        ? (function () {
            wbChatBusy = true;
            wbStreamingText = t('ha2ChatLoopBusy', '工具循环中…');
            return S.driveActiveIfRunning({ force: true });
          })()
        : S && S.resumeAndDriveAgentTask
          ? S.resumeAndDriveAgentTask()
          : null;
      if (resumeP) {
        resumeP
          .then(function () {
            toast(t('ha2AtrResumed', '已恢复任务'));
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'resume_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-retry-action')) {
      if (S && typeof S.retryFailedWorkAction === 'function') {
        S.retryFailedWorkAction()
          .then(function () {
            toast(t('ha2AtrRetried', '已重试失败动作'));
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'retry_failed'));
          });
      } else {
        toast(t('ha2AtrNoFailedAction', '没有可重试的失败动作'));
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-replan')) {
      var snapP = S && S.getSnapshot ? S.getSnapshot() : {};
      var goalP = (snapP.agentTask && snapP.agentTask.goal) || workConfirmGoal || '';
      if (S && S.abandonAgentTask) {
        S.abandonAgentTask()
          .then(function () {
            openWorkConfirm(goalP, materialsSummaryLine(snapP), {
              forcePage: !embedMode
            });
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'replan_failed'));
          });
      } else {
        openWorkConfirm(goalP, materialsSummaryLine(snapP), {
          forcePage: !embedMode
        });
        if (S) paint(S.getSnapshot());
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-abandon-send')) {
      if (S && S.abandonAndStartAgentTask) {
        var snapSend = S.getSnapshot ? S.getSnapshot() : {};
        var conflictSend = snapSend && snapSend.atrSendConflict;
        var draftSend =
          (conflictSend && conflictSend.goal) || (snapSend && snapSend.draft) || '';
        var dockTaSend = root && root.querySelector('.ha2-compose [data-ha2-draft]');
        if (dockTaSend && String(dockTaSend.value || '').trim()) {
          draftSend = dockTaSend.value;
        }
        draftSend = String(draftSend || '').trim();
        if (!draftSend) {
          toast(t('ha2AtrNeedGoal', '请先写清要改什么'));
          return;
        }
        S.setDraft(draftSend, { silent: true });
        var matSumSend =
          (conflictSend && conflictSend.materialsSummary) || '';
        if (!matSumSend) {
          try {
            var matsSend = (snapSend && snapSend.materials) || [];
            if (matsSend.length) {
              matSumSend = matsSend
                .slice(0, 8)
                .map(function (m) {
                  return String((m && (m.title || m.path || m.name)) || '').slice(0, 80);
                })
                .filter(Boolean)
                .join('; ');
            }
          } catch (_) {}
        }
        var chatCtx = String((snapSend && snapSend.workMode) || '') !== 'edit';
        if (!chatCtx) openAtrEditPage(draftSend);
        else openWbChatPage({ chatOnly: true });
        S.abandonAndStartAgentTask({
          goal: draftSend,
          materialsSummary: chatCtx
            ? chatHistoryMaterialsSummary(matSumSend)
            : matSumSend,
          permissionMode: chatCtx ? 'read_only' : undefined,
          lane: chatCtx ? 'chat' : undefined,
          skipPlanConfirm: !!chatCtx,
          planConfirmed: true
        })
          .then(function (dto) {
            if (!mounted) return;
            var snapAfter = S.getSnapshot();
            var n = snapAfter && snapAfter.validationNotice;
            if (n && n.code === 'abandon_start_failed') {
              if (chatCtx) {
                appendWbChatTurn({
                  role: 'assistant',
                  kind: 'chat_conflict',
                  text: chatLoopHonestFailText(
                    'abandon_start_failed',
                    n.message || ''
                  ),
                  toolOk: false
                });
              }
              toast(
                t(
                  'ha2AtrAbandonStartFailed',
                  '旧任务已放弃，新任务未创建 — 请检查项目或引擎后重发'
                )
              );
            } else if (!dto && n && n.abandoned === false) {
              toast(n.message || t('ha2AtrPreflightFail', '未放弃旧任务：启动条件未满足'));
            } else if (chatCtx && dto && dto.taskId) {
              chatLoopTaskId = String(dto.taskId);
              wbChatBusy = true;
            }
            paint(snapAfter);
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'abandon_send_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-abandon')) {
      if (S && S.abandonAgentTask) {
        S.abandonAgentTask()
          .then(function () {
            atrWbPageForced = false;
            atrWbPagePendingGoal = '';
            toast(t('ha2AtrAbandoned', '已放弃任务'));
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'abandon_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-approve-all')) {
      if (S && S.approveAgentPatch) {
        S.approveAgentPatch({ persistAutonomous: true })
          .then(function () {
            toast(t('ha2AtrApprovedAll', '已同意所有任务，之后写入不再询问'));
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'approve_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-approve')) {
      if (S && S.approveAgentPatch) {
        S.approveAgentPatch()
          .then(function () {
            toast(t('ha2AtrApproved', '已同意这次任务'));
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'approve_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-reject')) {
      if (S && S.rejectAgentPatch) {
        S.rejectAgentPatch()
          .then(function () {
            toast(t('ha2AtrRejected', '已拒绝方案，任务继续'));
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'reject_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-chat-needs-reply')) {
      var needWrap = tEl.closest('[data-ha2-tool-step]');
      var needInp =
        needWrap && needWrap.querySelector('[data-ha2-chat-needs-input]');
      var needText = needInp ? String(needInp.value || '').trim() : '';
      if (!needText) return;
      appendWbChatTurn({ role: 'user', text: needText });
      if (needInp) needInp.value = '';
      if (S && S.submitAgentInput) {
        wbChatBusy = true;
        S.submitAgentInput(needText)
          .then(function () {
            if (!mounted) return;
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            wbChatBusy = false;
            toast(String((err && err.message) || err || 'input_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-chat-deliver-approve')) {
      if (S && S.approveAgentDeliver) {
        wbChatBusy = true;
        S.approveAgentDeliver()
          .then(function () {
            toast(t('ha2DeliverApproved', '已批准投递'));
            if (!mounted) return;
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            wbChatBusy = false;
            toast(String((err && err.message) || err || 'deliver_approve_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-chat-deliver-reject')) {
      if (S && S.rejectAgentDeliver) {
        wbChatBusy = true;
        S.rejectAgentDeliver()
          .then(function () {
            toast(t('ha2DeliverRejected', '已取消投递'));
            if (!mounted) return;
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            wbChatBusy = false;
            toast(String((err && err.message) || err || 'deliver_reject_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-input')) {
      // Work ATR page only — chat uses inline needs_input (data-ha2-chat-needs-reply).
      var answer = global.prompt(t('ha2AtrAskInput', '回复 Agent 任务'), '');
      if (answer == null) return;
      if (S && S.submitAgentInput) {
        S.submitAgentInput(answer)
          .then(function () {
            paint(S.getSnapshot());
          })
          .catch(function (err) {
            toast(String((err && err.message) || err || 'input_failed'));
          });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-page-back')) {
      closeWbChatPage();
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-page-clear')) {
      var Jclear = global.OneToneHomeTaskJournal;
      var clearId = Jclear && Jclear.getActiveTaskId ? Jclear.getActiveTaskId() : '';
      if (Jclear && typeof Jclear.clearChatTurns === 'function') {
        try {
          Jclear.clearChatTurns(clearId);
        } catch (_) {}
      }
      wbChatTurns = [];
      saveWbChatTurns();
      chatLoopTaskId = '';
      chatLoopSyncedEv = {};
      wbStreamingText = '';
      wbStreamingTurnId = '';
      paintWbTranscript();
      toast(t('ha2WbChatCleared', '已清空本机对话'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-page-send')) {
      sendWbPageDraft();
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-page-stop')) {
      stopWbLocalStream();
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-mode')) {
      if (wbChatBusy || tEl.disabled || tEl.getAttribute('aria-disabled') === 'true') return;
      if (S && S.setWbSendMode) S.setWbSendMode(tEl.getAttribute('data-ha2-wb-mode'));
      syncWbChatChrome('workbuddy');
      var snapMode = S && S.getSnapshot();
      if (snapMode) {
        var sendBtnMode = root && root.querySelector('[data-ha2-send]');
        if (sendBtnMode) {
          var okMode = canSendNow(snapMode) && !wbChatBusy;
          sendBtnMode.disabled = !okMode;
          sendBtnMode.title = okMode
            ? wbUsesLocalChat('workbuddy', snapMode)
              ? t('ha2WbLocalSendHint', '本机对话（Ctrl+Enter）')
              : t('ha2SendHint', '发送（Ctrl+Enter）')
            : t('ha2SendNeedDraft', '先写一句再发送');
        }
        paint(snapMode);
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-work-mode')) {
      if (tEl.disabled || tEl.getAttribute('aria-disabled') === 'true') return;
      closeWorkConfirm();
      var nextMode = tEl.getAttribute('data-ha2-work-mode');
      // Research chrome is hidden — ignore stray research switches.
      if (nextMode === 'research') nextMode = 'think';
      if (S && S.setWorkMode) S.setWorkMode(nextMode);
      // Keep home chrome 提问/投递 in sync with compose segment.
      var HomePaint = global.OneToneNowHome;
      if (HomePaint && typeof HomePaint.paint === 'function' && HomePaint.isVisible && HomePaint.isVisible()) {
        try {
          HomePaint.paint();
        } catch (_) {}
      }
      if (wbChatPageOpen) paintWbChatPage();
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-start')) {
      var Rstart = global.OneToneHomeResearch;
      if (!Rstart || !Rstart.start) {
        toast(t('ha2ResearchMissing', '调研模块未加载'));
        return;
      }
      var panel = tEl.closest('[data-ha2-research]');
      var depthEl = panel && panel.querySelector('[data-ha2-research-depth]');
      var formatEl = panel && panel.querySelector('[data-ha2-research-format]');
      var topic = resolveResearchTopic(S && S.getSnapshot && S.getSnapshot());
      if (!String(topic || '').trim()) {
        toast(t('ha2ResearchNeedTopic', '先在下方输入框写调研主题'));
        return;
      }
      clearResearchComposeInputs();
      Rstart.start({
        topic: String(topic || '').trim(),
        depth: (depthEl && depthEl.value) || 'standard',
        format: (formatEl && formatEl.value) || 'markdown',
        autoConfirm: false
      })
        .then(function () {
          if (wbChatPageOpen) paintWbChatPage();
          else if (S) paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'research_failed'));
        });
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-replan')) {
      var Rre = global.OneToneHomeResearch;
      if (!Rre || !Rre.preparePlan) {
        toast(t('ha2ResearchMissing', '调研模块未加载'));
        return;
      }
      var reTopic =
        (Rre.getSnapshot &&
          Rre.getSnapshot().plan &&
          Rre.getSnapshot().plan.topic) ||
        '';
      Rre.preparePlan({ topic: reTopic })
        .then(function () {
          if (wbChatPageOpen) paintWbChatPage();
          else if (S) paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'replan_failed'));
        });
      return;
    }
    if (
      tEl.hasAttribute('data-ha2-research-clarify') ||
      tEl.hasAttribute('data-ha2-research-clarify-submit')
    ) {
      var Rclar = global.OneToneHomeResearch;
      if (!Rclar || !Rclar.applyClarifyOption) {
        toast(t('ha2ResearchMissing', '调研模块未加载'));
        return;
      }
      var clarArg = tEl.getAttribute('data-ha2-research-clarify') || '';
      if (tEl.hasAttribute('data-ha2-research-clarify-submit')) {
        var panelClar = tEl.closest('[data-ha2-research]');
        var textEl =
          panelClar && panelClar.querySelector('[data-ha2-research-clarify-text]');
        clarArg = { refinedTopic: textEl ? String(textEl.value || '').trim() : '' };
        if (!clarArg.refinedTopic || clarArg.refinedTopic.length < 2) {
          toast(t('ha2ResearchClarifyNeedText', '请先写清更具体的主题'));
          return;
        }
      } else {
        // Prefer topic baked into the chip — state may already be wiped by a prior click/paint race.
        clarArg = {
          id: clarArg,
          refinedTopic:
            tEl.getAttribute('data-ha2-research-clarify-topic') ||
            String(tEl.textContent || '').trim()
        };
      }
      try {
        if (tEl.blur) tEl.blur();
      } catch (_) {}
      Rclar.applyClarifyOption(clarArg)
        .then(function () {
          if (wbChatPageOpen) paintWbChatPage();
          else if (S) paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'clarify_failed'));
        });
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-confirm')) {
      var Rconf = global.OneToneHomeResearch;
      if (!Rconf || !Rconf.confirmAndRun) {
        toast(t('ha2ResearchMissing', '调研模块未加载'));
        return;
      }
      if (tEl.disabled || tEl.getAttribute('disabled') != null) return;
      var planSnap =
        (Rconf.getSnapshot && Rconf.getSnapshot()) ||
        {};
      if (planSnap.plan && planSnap.plan.planning) {
        toast(t('ha2ResearchPlanning', '正在用模型规划…'));
        return;
      }
      var clarIntent =
        planSnap.researchIntent ||
        (planSnap.plan && planSnap.plan.researchIntent) ||
        null;
      if (clarIntent && clarIntent.needsClarify) {
        toast(t('ha2ResearchClarifyNeed', '请先选择一个调研方向'));
        return;
      }
      if (
        clarIntent &&
        (clarIntent.runnable === false ||
          clarIntent.status === 'degraded' ||
          clarIntent.degradeReason ||
          String(clarIntent.planSource || '') !== 'wb')
      ) {
        toast(
          t(
            'ha2ResearchNeedModelPlan',
            '正式路径需要模型规划 JSON，请先「重新规划」'
          )
        );
        return;
      }
      var planPanel = tEl.closest('[data-ha2-research]');
      var pathEl = planPanel && planPanel.querySelector('[data-ha2-research-path]');
      var facetInputs =
        (planPanel && planPanel.querySelectorAll('[data-ha2-research-facet-q]')) || [];
      if (Rconf.updatePlan) {
        var facetPatch = [];
        for (var fi = 0; fi < facetInputs.length; fi++) {
          var inp = facetInputs[fi];
          facetPatch.push({
            id: inp.getAttribute('data-ha2-research-facet-q'),
            query: inp.value,
            label: (inp.previousElementSibling && inp.previousElementSibling.textContent) || ''
          });
        }
        Rconf.updatePlan({
          path: (pathEl && pathEl.value) || undefined,
          facets: facetPatch.length ? facetPatch : undefined
        });
      }
      Rconf.confirmAndRun({})
        .then(function () {
          if (wbChatPageOpen) paintWbChatPage();
          else if (S) paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'research_failed'));
        });
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-cancel')) {
      var Rc = global.OneToneHomeResearch;
      if (Rc && Rc.cancel) Rc.cancel();
      if (S && S.setWorkMode) S.setWorkMode('think');
      if (wbChatPageOpen) paintWbChatPage();
      else if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-restart')) {
      var Rr = global.OneToneHomeResearch;
      if (Rr && Rr.openConfig) {
        var prev = Rr.getSnapshot ? Rr.getSnapshot() : {};
        Rr.openConfig({
          topic: (prev.config && prev.config.topic) || '',
          depth: (prev.config && prev.config.depth) || 'standard',
          format: (prev.config && prev.config.format) || 'markdown'
        });
      }
      if (wbChatPageOpen) paintWbChatPage();
      else if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-file')) {
      var fileKind = tEl.getAttribute('data-ha2-research-file') || 'markdown';
      if (fileKind === researchFilePreview) {
        // Toggle collapse → default back to markdown summary view still open.
        researchFilePreview = fileKind;
      } else {
        researchFilePreview = fileKind;
      }
      if (wbChatPageOpen) paintWbChatPage();
      else if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-export')) {
      var Re = global.OneToneHomeResearch;
      var fmt = tEl.getAttribute('data-ha2-research-export') || 'markdown';
      if (!Re || !Re.exportReport) {
        toast(t('ha2ResearchMissing', '调研模块未加载'));
        return;
      }
      Re.exportReport(fmt)
        .then(function (snapExp) {
          var path =
            (snapExp && snapExp.lastExportPath) ||
            (Re.getSnapshot && Re.getSnapshot().lastExportPath) ||
            '';
          toast(
            path
              ? t('ha2ResearchExported', '已导出') + '：' + path
              : t('ha2ResearchExported', '已导出')
          );
          if (wbChatPageOpen) paintWbChatPage();
          else if (S) paint(S.getSnapshot());
        })
        .catch(function (err) {
          toast(String((err && err.message) || err || 'export_failed'));
        });
      return;
    }
    if (tEl.hasAttribute('data-ha2-work-confirm-cancel')) {
      closeWorkConfirm();
      if (wbChatPageOpen) paintWbChatPage();
      if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-work-confirm-start')) {
      var startGoal = workConfirmGoal || '';
      if (!startGoal) {
        toast(t('ha2AtrNeedGoal', '请先写清要改什么'));
        return;
      }
      startConfirmedWorkTask(startGoal, workConfirmMatSum).catch(function (err) {
        toast(String((err && err.message) || err || 'atr_failed'));
      });
      return;
    }
    if (tEl.hasAttribute('data-ha2-handoff-open')) {
      handoffOpen = true;
      handoffSummary = buildHandoffSummaryFromChat();
      handoffTargetKind = handoffTargetKind || 'cursor';
      if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-handoff-cancel')) {
      handoffOpen = false;
      if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-handoff-apply')) {
      applyHandoffToDraft();
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-log-toggle')) {
      var togId = tEl.getAttribute('data-ha2-atr-log-toggle') || '';
      var logCard = tEl.closest && tEl.closest('[data-ha2-atr-log]');
      // Prefer live DOM class — active cards default expanded without a map entry.
      var wasExpanded = logCard
        ? logCard.classList.contains('is-expanded')
        : !!atrLogExpandedById[togId];
      atrLogExpandedById[togId] = !wasExpanded;
      paintWbChatPage();
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-log-copy')) {
      copyAtrLog(tEl.getAttribute('data-ha2-atr-log-copy'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-transcript-toggle')) {
      wbTranscriptCollapsed = !wbTranscriptCollapsed;
      paintWbTranscript();
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-chat-clear')) {
      wbChatTurns = [];
      saveWbChatTurns();
      wbTranscriptCollapsed = false;
      paintWbTranscript();
      toast(t('ha2WbChatCleared', '已清空本机对话'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-open-wb-config')) {
      openWbAgentConfig();
      return;
    }
    // Keyboard activation (Enter/Space) lands here; pointer path already handled above.
    if (tEl.hasAttribute('data-ha2-mat-expand')) {
      expandMatText(tEl.getAttribute('data-ha2-mat-expand'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-mat-collapse')) {
      collapseMatText(tEl.getAttribute('data-ha2-mat-collapse'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-menu-picker')) {
      openPickerSurface('menu', tEl);
      return;
    }
    if (tEl.hasAttribute('data-ha2-agent-toggle')) {
      var pickHost = tEl.closest('[data-ha2-agent-pick]');
      if (pickHost && pickHost.classList.contains('is-open')) closeAgentFlyout();
      else openAgentFlyout();
      return;
    }
    if (tEl.hasAttribute('data-ha2-picker')) {
      if (root && root.querySelector('[data-ha2-agent-pick]')) {
        openAgentFlyout();
        return;
      }
      openPickerSurface('dock', tEl);
      return;
    }
    if (tEl.hasAttribute('data-ha2-picker-close')) {
      closePickerSurface();
      return;
    }
    if (tEl.hasAttribute('data-ha2-pick-follow')) {
      if (S && S.clearSelected) S.clearSelected({ closePicker: true });
      refreshAimForSelected();
      return;
    }
    if (tEl.hasAttribute('data-ha2-pick')) {
      S.setSelected(tEl.getAttribute('data-ha2-pick'), { closePicker: true });
      refreshAimForSelected();
      closeAgentFlyout();
      return;
    }
    if (tEl.hasAttribute('data-ha2-detail')) {
      S.setSelected(tEl.getAttribute('data-ha2-detail'), { lock: true });
      S.setView('agent');
      return;
    }
    if (tEl.hasAttribute('data-ha2-select')) {
      S.setSelected(tEl.getAttribute('data-ha2-select'), { lock: true, closePicker: true });
      refreshAimForSelected();
      return;
    }
    if (tEl.hasAttribute('data-ha2-home')) {
      S.setView('home');
      return;
    }
    if (tEl.hasAttribute('data-ha2-open-model-providers')) {
      closeModelRouteMenu();
      openModelProviderModal();
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-task-detail')) {
      var detailId = tEl.getAttribute('data-ha2-research-task-detail');
      var detailEl = root && root.querySelector('[data-ha2-research-task-error="' + detailId.replace(/"/g, '') + '"]');
      if (detailEl) detailEl.hidden = !detailEl.hidden;
      return;
    }
    if (tEl.hasAttribute('data-ha2-research-task-retry')) {
      var Rretry = global.OneToneHomeResearch;
      var retryId = tEl.getAttribute('data-ha2-research-task-retry');
      if (Rretry && Rretry.retryTaskAction) {
        tEl.disabled = true;
        tEl.textContent = '重试中…';
        Rretry.retryTaskAction(retryId).then(function () { if (Rretry && Rretry.getSnapshot) paint(Rretry.getSnapshot()); }).catch(function () { if (Rretry && Rretry.getSnapshot) paint(Rretry.getSnapshot()); });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-action')) {
      dispatch(tEl.getAttribute('data-ha2-action'), tEl.getAttribute('data-agent'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-go-agent')) {
      openAttentionAgent(
        tEl.getAttribute('data-ha2-go-agent'),
        tEl.getAttribute('data-agent')
      );
      return;
    }
    if (tEl.hasAttribute('data-ha2-habit-hub')) {
      var NH = global.OneToneNowHome;
      if (NH && typeof NH.openHabitHub === 'function') NH.openHabitHub();
      else if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
        global.OneToneSettingsDrawer.open({ panel: 'habits' });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-alert-action')) {
      var rawAct = tEl.getAttribute('data-ha2-alert-action');
      var WB = global.OneToneHomeWorkbench;
      try {
        var act = rawAct ? JSON.parse(rawAct) : null;
        if (WB && typeof WB.handleAlertAction === 'function') WB.handleAlertAction(act);
      } catch (_) {}
      return;
    }
    if (tEl.hasAttribute('data-ha2-session')) {
      var expanded = tEl.getAttribute('aria-expanded') === 'true';
      tEl.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      var meta = tEl.querySelector('.ha2-session-meta');
      if (meta) meta.hidden = expanded;
      return;
    }
    if (tEl.hasAttribute('data-ha2-open-center')) {
      var Nav = global.OneToneAgentNavTarget;
      var goKind = tEl.getAttribute('data-ha2-go-agent');
      if (Nav && Nav.open) {
        Nav.open({
          view: 'overview',
          section: 'working',
          provider: goKind || S.getSnapshot().selectedKind
        });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-refresh')) {
      S.refresh('user');
      return;
    }
    if (tEl.hasAttribute('data-ha2-send') || tEl.hasAttribute('data-ha2-retry')) {
      ensureHomeAgentReadyThenSend();
      return;
    }
    if (tEl.hasAttribute('data-ha2-pcx')) {
      var Pcx = global.OneToneHomeProjectContext;
      if (Pcx && typeof Pcx.openDrawer === 'function') Pcx.openDrawer();
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-clarify')) {
      runConsultClarify();
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-confirm')) {
      var Cc = concierge();
      if (Cc && Cc.confirmUnderstanding) Cc.confirmUnderstanding();
      if (S) {
        S.setValidationNotice({
          kind: 'consult',
          message: t('ha2ConsultConfirmedNotice', '已确认问题理解（会诊记录）')
        });
        paint(S.getSnapshot());
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-compile')) {
      runConsultCompile();
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-find')) {
      runConsultFindMaterials();
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-skip-all')) {
      var Cskip = concierge();
      if (Cskip && Cskip.resetConsult) Cskip.resetConsult();
      if (S) {
        S.setValidationNotice({
          kind: 'consult',
          message: t('ha2ConsultSkipped', '已跳过会诊，可直接整理或发送')
        });
        paint(S.getSnapshot());
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-skip')) {
      var Cq = concierge();
      if (Cq && Cq.answerQuestion) Cq.answerQuestion('', { skipped: true });
      if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-answer')) {
      var ans = tEl.getAttribute('data-ha2-consult-answer') || '';
      var Ca = concierge();
      if (Ca && Ca.answerQuestion) Ca.answerQuestion(ans);
      if (S) paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-consult-adopt')) {
      var idx = parseInt(tEl.getAttribute('data-ha2-consult-adopt'), 10);
      var Cad = concierge();
      if (Cad && Cad.adoptCandidate) {
        Cad.adoptCandidate(idx).then(function (res) {
          if (S) {
            S.setValidationNotice({
              kind: 'consult',
              message: res && res.ok
                ? t('ha2ConsultAdopted', '已采用材料')
                : t('ha2ConsultAdoptFail', '采用失败，可手动添加材料')
            });
            if (S.syncMaterialsFromPrep) S.syncMaterialsFromPrep();
            paint(S.getSnapshot());
          }
        });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-organize')) {
      runOrganizeTask();
      return;
    }
    if (tEl.hasAttribute('data-ha2-organize-cancel')) {
      cancelOrganizeTask();
      return;
    }
    if (tEl.hasAttribute('data-ha2-assist-keys')) {
      var AssistKeys = global.OneToneHomeAssistClient;
      if (AssistKeys && AssistKeys.openProviderKeys) AssistKeys.openProviderKeys();
      else {
        S.setValidationNotice({
          kind: 'assist_keys',
          message: t(
            'ha2AssistKeysHint',
            '请到 Soft Pad 页面配置 DeepSeek / Kimi 等提供商密钥'
          )
        });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-wb-login-cta')) {
      startWbFreemodelLoginFromDock();
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-wb-login-open')) {
      openAtrWbLoginInline();
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-wb-login')) {
      startAtrWbLoginInline();
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-wb-login-cancel')) {
      cancelAtrWbLoginInline();
      return;
    }
    if (tEl.hasAttribute('data-ha2-atr-wb-login-dismiss')) {
      atrWbLoginForced = false;
      atrWbLoginStatus = '';
      var snapDismiss = S && S.getSnapshot ? S.getSnapshot() : null;
      if (!atrEditPathOn(snapDismiss)) atrWbLoginChatDismissed = true;
      syncAtrWbLoginHost(snapDismiss);
      return;
    }
    if (tEl.hasAttribute('data-ha2-enable-metered')) {
      var AssistEn = global.OneToneHomeAssistClient;
      if (AssistEn && AssistEn.setAllowMetered) {
        AssistEn.setAllowMetered(true);
        refreshAssistReady();
        S.setValidationNotice({
          kind: 'assist_metered',
          message: t(
            'ha2MeteredOn',
            '已允许计量额度整理（会产生费用）。仍可直接发送原稿。'
          )
        });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-remove')) {
      var rmId = tEl.getAttribute('data-ha2-remove');
      if (rmId) delete matTextExpanded[rmId];
      if (D && D.removeMaterial) D.removeMaterial(rmId);
      return;
    }
    if (tEl.hasAttribute('data-ha2-aim-clear')) {
      var clearKind = S.getSnapshot().selectedKind;
      if (!clearKind) {
        toast(t('ha2AimNeedTarget', '先选发送目标，再清除对准'));
        return;
      }
      if (!D || !D.clearAim) return;
      D.clearAim(clearKind).then(function (res) {
        if (res && res.ok) {
          toast(t('ha2AimCleared', '已清除对准'));
          return;
        }
        if (res && res.reason === 'no_app_target') {
          toast(t('ha2AimNeedTarget', '先选发送目标，再清除对准'));
          return;
        }
        // Local state already cleared; IPC miss is non-fatal.
        toast(t('ha2AimCleared', '已清除对准'));
      });
      return;
    }
    if (tEl.hasAttribute('data-ha2-aim')) {
      var aimKind = S.getSnapshot().selectedKind;
      if (!aimKind) {
        toast(t('ha2AimNeedTarget', '先选发送目标，再点「现在定位」'));
        openAgentFlyout();
        return;
      }
      if (!D || !D.calibrateAim) return;
      D.calibrateAim(aimKind).then(function (res) {
        if (res && res.ok && res.hasActive) {
          toast(t('ha2AimLockedToast', '已对准输入框'));
          return;
        }
        if (res && res.reason === 'no_app_target') {
          toast(t('ha2AimNeedTarget', '先选发送目标，再点「现在定位」'));
          return;
        }
        toast(t('ha2AimFailed', '未能对准输入框，请在目标窗口点一下输入区后重试'));
      });
      return;
    }
    if (tEl.hasAttribute('data-ha2-tm')) {
      openTimeCapsule();
      return;
    }
    if (tEl.hasAttribute('data-ha2-cap')) {
      var cap = tEl.getAttribute('data-ha2-cap');
      if (cap === 'softPad' && D) D.toggleSoftPad();
      else if (cap === 'voice' && D) D.toggleVoice();
      else if (cap === 'camera' && D) D.toggleCamera();
      return;
    }
    if (tEl.hasAttribute('data-ha2-reply-tone')) {
      writeChatReplyTone(tEl.getAttribute('data-ha2-reply-tone') || 'natural');
      // Soft prompt only — next reply picks it up; no toast spam.
      paint(S && S.getSnapshot ? S.getSnapshot() : null);
      if (wbChatPageOpen) paintWbChatPage();
      return;
    }
    if (tEl.hasAttribute('data-ha2-compose-more')) {
      var ov = root && root.querySelector('[data-ha2-compose-overflow]');
      if (ov) {
        var open = ov.hasAttribute('hidden');
        if (open) ov.removeAttribute('hidden');
        else ov.setAttribute('hidden', '');
        tEl.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-add')) {
      matMenuOpen = !matMenuOpen;
      paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-mat')) {
      matMenuOpen = false;
      paint(S.getSnapshot());
      var matKind = tEl.getAttribute('data-ha2-mat');
      if (!D || !D.pickMaterial) return;
      Promise.resolve(D.pickMaterial(matKind)).then(
        function (res) {
          if (!res) return;
          if (res.message) {
            toast(res.message);
            return;
          }
          if (res.outcome === 'failed') toast(t('ha2MatFailed', '添加材料失败'));
          else if (res.outcome === 'cancelled') toast(t('ha2MatCancelled', '已取消'));
          else maybeExpandLongMat(res);
        },
        function () {
          toast(t('ha2MatFailed', '添加材料失败'));
        }
      );
    }
  }

  function onPickerReposition(e) {
    if (!mounted || !store() || pickerPositioning) return;
    if (!store().getSnapshot().pickerOpen) return;
    // Picker itself is overflow:auto — its scroll must not re-run placement.
    var t = e && e.target;
    if (
      t &&
      t.closest &&
      t.closest('[data-ha2-picker-panel], .ha2-picker')
    ) {
      return;
    }
    positionPickerPanel();
  }

  function onToolStepToggle(ev) {
    var el = ev && ev.target;
    if (!el || el.tagName !== 'DETAILS' || !el.hasAttribute('data-ha2-tool-step')) {
      return;
    }
    var id = String(el.getAttribute('data-ha2-turn-id') || '');
    if (!id) return;
    var open = !!el.open;
    var i;
    for (i = 0; i < wbChatTurns.length; i++) {
      if (wbChatTurns[i] && String(wbChatTurns[i].id) === id) {
        if (!!wbChatTurns[i].collapsed === !open) return;
        wbChatTurns[i] = Object.assign({}, wbChatTurns[i], {
          collapsed: !open
        });
        saveWbChatTurns();
        paintWbTranscript();
        return;
      }
    }
  }

  function bindHa2RootEvents(S) {
    if (!root || root.__ha2EventsBound) return;
    root.__ha2EventsBound = true;
    ensureWbStreamListen();
    root.addEventListener('click', onClick);
    root.addEventListener('toggle', onToolStepToggle, true);
    root.addEventListener('pointerdown', onMatTogglePointerDown, true);
    root.addEventListener('change', onChange);
    refreshAssistReady();
    root.addEventListener('input', onInput);
    root.addEventListener('compositionstart', onCompositionStart);
    root.addEventListener('compositionend', onCompositionEnd);
    root.addEventListener('paste', onPaste, true);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
    if (!global.__ha2PortaledClickBound) {
      global.__ha2PortaledClickBound = true;
      document.addEventListener('click', onPortaledDocClick, true);
    }
    if (!global.__ha2PickerPosBound) {
      global.__ha2PickerPosBound = true;
      global.addEventListener('resize', onPickerReposition);
      global.addEventListener('scroll', onPickerReposition, true);
    }
    root.addEventListener('dragover', function (e) {
      if (e.target.closest('[data-ha2-drop]')) {
        e.preventDefault();
        e.target.closest('[data-ha2-drop]').classList.add('is-over');
      }
    });
    root.addEventListener('dragleave', function (e) {
      var d = e.target.closest('[data-ha2-drop]');
      if (d) d.classList.remove('is-over');
    });
    root.addEventListener('drop', function (e) {
      var d = e.target.closest('[data-ha2-drop]');
      if (!d) return;
      e.preventDefault();
      d.classList.remove('is-over');
      var D = dock();
      if (D && D.addFiles) D.addFiles(e.dataTransfer && e.dataTransfer.files);
    });
    if (!unsubStore && S && S.subscribe) {
      unsubStore = S.subscribe(function (snap) {
        if (!mounted) return;
        paint(snap);
      });
    }
    if (!unsubMaterials) {
      var PrepMat = global.OneToneHomePromptPrep;
      if (PrepMat && typeof PrepMat.subscribeMaterials === 'function') {
        unsubMaterials = PrepMat.subscribeMaterials(function () {
          if (!mounted) return;
          syncOrganizeChrome();
        });
      } else {
        syncOrganizeChrome();
      }
    }
    try {
      var Rsub = global.OneToneHomeResearch;
      if (Rsub && typeof Rsub.subscribe === 'function' && !global.__ha2ResearchSub) {
        global.__ha2ResearchSub = true;
        Rsub.subscribe(function () {
          if (!mounted) return;
          paintResearchLive();
        });
      }
    } catch (_) {}
  }

  function refreshHa2ModelChrome(S) {
    var routeGateway = global.OneToneModelGateway;
    if (routeGateway && routeGateway.refreshCustomProviders) {
      routeGateway.refreshCustomProviders().then(function () {
        if (!mounted || !root) return;
        var host = root.querySelector('[data-ha2-model-route-host]');
        if (host) host.removeAttribute('data-sig');
        syncModeChrome(S.getSnapshot());
      }).catch(function () {});
    }
    Promise.all([refreshWbLocal(true), refreshSoftPadFreemodelKeys()]).then(function () {
      if (!mounted) return;
      var snap = S.getSnapshot();
      syncWbModelHost((snap && snap.selectedKind) || '');
      var host = root.querySelector('[data-ha2-model-route-host]');
      if (host) host.removeAttribute('data-sig');
      syncModeChrome(snap);
    });
  }

  function mount(el) {
    if (mounted) return;
    root = el;
    embedMode = false;
    var S = store();
    if (!S) return;
    S.mount();
    bindHa2RootEvents(S);
    mounted = true;
    paint(S.getSnapshot());
    refreshAllAgentAims();
    refreshHa2ModelChrome(S);
  }

  /**
   * Focus home: paint ha2 compose into [data-hf-ha2-compose-host] without
   * replacing Focus chrome. Reuses the same click/send/model handlers.
   */
  function embedCompose(homeRoot) {
    if (!homeRoot) return;
    root = homeRoot;
    embedMode = true;
    root.classList.add('is-hf-ha2-compose');
    var S = store();
    if (!S) return;
    if (!mounted) {
      S.mount();
      bindHa2RootEvents(S);
      mounted = true;
      refreshAllAgentAims();
      refreshHa2ModelChrome(S);
    }
    var snap = S.getSnapshot();
    ensureShell(snap);
    // Focus remount (innerHTML) destroys [data-ha2-wb-page-host] but can leave
    // is-wb-chat-page on root → hn-stage stays visibility:hidden → blank home.
    if (wbChatPageOpen) {
      ensureChatPageHost();
      paintWbChatPage();
    } else {
      root.classList.remove('is-wb-chat-page');
      var orphanHost = root.querySelector('[data-ha2-wb-page-host]');
      if (orphanHost) {
        orphanHost.innerHTML = '';
        orphanHost.hidden = true;
      }
    }
    // Do not maybeOpenAtrWbPage here — auto ATR/wb full-page was covering Focus
    // and eating clicks. sendWbLocal may still open the page on purpose.
    // Never skip patch while Agent picker / + menu open — that was the "no reaction" bug.
    if (!modelRouteMenuOpen) patchDockMeta(snap);
  }

  function show() {
    if (!root) return;
    var S = store();
    root.hidden = false;
    root.removeAttribute('aria-hidden');
    if (S) {
      S.setVisible(true);
      S.refresh('show');
    }
    refreshAllAgentAims();
    // Soft Pad / WB login may have changed models while this view was hidden.
    Promise.all([refreshWbLocal(true), refreshSoftPadFreemodelKeys()]).then(function () {
      if (!mounted) return;
      consumeFocusAskHandoff();
      var snap = S && S.getSnapshot();
      syncWbModelHost((snap && snap.selectedKind) || '');
      var host = root.querySelector('[data-ha2-model-route-host]');
      if (host) host.removeAttribute('data-sig');
      syncModeChrome(snap);
    });
  }

  function hide() {
    closePickerSurface();
    closeMatMenu();
    var S = store();
    if (S) S.setVisible(false);
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
  }

  function refresh() {
    var S = store();
    return S ? S.refresh('external') : Promise.resolve();
  }

  /** At least one freemodel / WorkBuddy route can answer 问模型. */
  function accountReadySync() {
    var ids = freemodelReadyIds();
    for (var k in ids) {
      if (ids[k]) return true;
    }
    return false;
  }

  function probeAccountReady() {
    return Promise.all([refreshWbLocal(true), refreshSoftPadFreemodelKeys()])
      .then(function () {
        return accountReadySync();
      })
      .catch(function () {
        return accountReadySync();
      });
  }

  var FOCUS_ASK_KEY = 'onetone.focusAskDraft';

  function consumeFocusAskHandoff() {
    var text = '';
    try {
      text = String(sessionStorage.getItem(FOCUS_ASK_KEY) || '').trim();
      if (text) sessionStorage.removeItem(FOCUS_ASK_KEY);
    } catch (_) {}
    if (!text) return;
    var S = store();
    if (S && S.setDraft) S.setDraft(text, { silent: true });
    global.setTimeout(function () {
      try {
        sendWbLocal(text, {
          id: 'workbuddy',
          name: 'WorkBuddy',
          appId: '',
          icon: WB_CHAT_ICON
        });
      } catch (_) {}
    }, 120);
  }

  /**
   * Focus / other surfaces: real freemodel ask in-place.
   * Not ready → connect sheet. Ready → send on current surface (no reload / no surface flip).
   */
  function askFromDraft(text, opts) {
    opts = opts || {};
    text = String(text || '').trim();
    if (!text) return Promise.resolve({ ok: false, reason: 'empty' });
    return probeAccountReady().then(function (ready) {
      if (!ready) {
        openModelProviderModal(opts);
        return { ok: false, reason: 'need_account' };
      }
      var S = store();
      if (S && S.setDraft) S.setDraft(text, { silent: true });
      try {
        // Keep FOCUS_ASK_KEY for tests / resume paths — never flip homeSurface or reload.
        sessionStorage.setItem(FOCUS_ASK_KEY, text);
      } catch (_) {}
      try {
        sendWbLocal(text, {
          id: 'workbuddy',
          name: 'WorkBuddy',
          appId: '',
          icon: WB_CHAT_ICON
        });
      } catch (_) {
        try {
          sessionStorage.removeItem(FOCUS_ASK_KEY);
        } catch (_) {}
        return { ok: false, reason: 'send_failed' };
      }
      try {
        sessionStorage.removeItem(FOCUS_ASK_KEY);
      } catch (_) {}
      return { ok: true, inPlace: true };
    });
  }

  function openAtrHistory(taskId) {
    var histId = String(taskId || '').trim();
    if (!histId) return;
    var S = store();
    var snapH = S && S.getSnapshot ? S.getSnapshot() : null;
    var stackH = (snapH && snapH.agentTaskStack) || [];
    var goalH = '';
    var hi;
    for (hi = 0; hi < stackH.length; hi++) {
      if (
        stackH[hi] &&
        stackH[hi].task &&
        String(stackH[hi].task.taskId) === histId
      ) {
        goalH = String(stackH[hi].task.goal || '');
        break;
      }
    }
    if (
      S &&
      S.setActiveAgentTask &&
      !(snapH && snapH.agentTask && String(snapH.agentTask.taskId) === histId)
    ) {
      S.setActiveAgentTask(histId, { grant: true }).catch(function () {});
    }
    atrWbPageUserClosed = false;
    atrLogExpandedById[histId] = true;
    openAtrEditPage(goalH || atrWbPagePendingGoal || '');
    if (S) paint(S.getSnapshot());
  }

  global.OneToneHomeAgentV2 = {
    mount: mount,
    embedCompose: embedCompose,
    stashLiveComposeDrafts: stashLiveComposeDrafts,
    show: show,
    hide: hide,
    refresh: refresh,
    openAtrHistory: openAtrHistory,
    openWbChatPage: openWbChatPage,
    closeWbChatPage: closeWbChatPage,
    loadChatTaskTurns: loadChatTaskTurns,
    startNewChatSession: startNewChatSession,
    isWbChatPageOpen: function () {
      return !!wbChatPageOpen;
    },
    /** Shared entry for Focus / other surfaces — opens freemodel connect sheet. */
    openModelProviders: function (opts) {
      openModelProviderModal(opts || {});
    },
    accountReadySync: accountReadySync,
    probeAccountReady: probeAccountReady,
    askFromDraft: askFromDraft,
    _state: function () {
      var S = store();
      var snap = S ? S.getSnapshot() : {};
      return {
        selected: snap.selectedKind,
        userLocked: snap.userLocked,
        view: snap.view,
        targetContext: snap.targetContext || null,
        deliveryReceipt: snap.deliveryReceipt || null,
        actionReceipt: snap.actionReceipt || null,
        validationNotice: snap.validationNotice || null,
        receipt: snap.deliveryReceipt || snap.receipt || null
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
