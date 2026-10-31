/**
 * OneToneHomeAgentV2 — new home workbench view.
 * Incremental paint: agent updates never rebuild the draft textarea or destroy focus.
 */
(function (global) {
  'use strict';

  var root = null;
  var mounted = false;
  var unsubStore = null;
  var shellBuilt = false;
  var matMenuOpen = false;
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
  var wbStreamingText = '';
  var wbStreamingTurnId = '';
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
  var atrWbLoginBusy = false;
  var atrWbLoginPendingId = '';
  var atrWbLoginPollTimer = 0;
  var atrWbLoginStatus = ''; // '' | pending | fail | expired
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
        global.localStorage.setItem(
          WB_CHAT_KEY,
          JSON.stringify({ turns: wbChatTurns.slice(-WB_CHAT_MAX), at: Date.now() })
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
    var row = {
      id: turn.id || 't_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4),
      role: turn.role === 'assistant' ? 'assistant' : 'user',
      text: String(turn.text || ''),
      model: turn.model ? String(turn.model) : '',
      accountId: turn.accountId ? String(turn.accountId) : '',
      at: turn.at || Date.now()
    };
    if (!row.text) return null;
    wbChatTurns.push(row);
    if (wbChatTurns.length > WB_CHAT_MAX) wbChatTurns = wbChatTurns.slice(-WB_CHAT_MAX);
    saveWbChatTurns();
    var J = global.OneToneHomeTaskJournal;
    if (J && typeof J.appendChatTurn === 'function') {
      try {
        J.appendChatTurn({
          id: row.id,
          at: row.at,
          role: row.role,
          text: row.text,
          model: row.model,
          accountId: row.accountId,
          agentKind: 'workbuddy'
        });
      } catch (_) {}
    }
    return row;
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
      materialNames: mats
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

  /** Pin picker to its own trigger — menu hangs under top-right; dock floats above chip. */
  function positionPickerPanel() {
    if (!root) return;
    var panel = root.querySelector('[data-ha2-picker-panel]');
    if (!panel) return;
    var anchor =
      pickerAnchor && pickerAnchor.isConnected
        ? pickerAnchor
        : pickerSurface === 'menu'
          ? root.querySelector('[data-ha2-menu-picker]')
          : root.querySelector('.ha2-chip.target[data-ha2-picker]') ||
            root.querySelector('[data-ha2-picker]');
    if (!anchor) return;
    var ar = anchor.getBoundingClientRect();
    var isMenu = pickerSurface === 'menu' || panel.classList.contains('is-menu');
    var pw = isMenu
      ? Math.min(260, Math.max(200, window.innerWidth - 24))
      : Math.min(430, Math.max(280, window.innerWidth - 24));
    var gap = 8;
    panel.style.width = pw + 'px';
    panel.style.right = 'auto';
    if (isMenu) {
      // Align to the right edge of the task menu (top-right).
      var left = Math.round(ar.right - pw);
      if (left < 12) left = 12;
      if (left + pw > window.innerWidth - 12) left = window.innerWidth - pw - 12;
      panel.style.left = left + 'px';
      panel.style.bottom = 'auto';
      panel.style.top = Math.round(ar.bottom + gap) + 'px';
      global.requestAnimationFrame(function () {
        if (!panel.isConnected) return;
        var ph = panel.offsetHeight || 200;
        if (ar.bottom + gap + ph > window.innerHeight - 12) {
          panel.style.top = 'auto';
          panel.style.bottom = Math.max(12, Math.round(window.innerHeight - ar.top + gap)) + 'px';
        }
      });
      return;
    }
    var leftDock = Math.round(ar.left);
    if (leftDock + pw > window.innerWidth - 12) leftDock = window.innerWidth - pw - 12;
    if (leftDock < 12) leftDock = 12;
    panel.style.left = leftDock + 'px';
    panel.style.top = 'auto';
    panel.style.bottom = Math.max(12, Math.round(window.innerHeight - ar.top + gap)) + 'px';
    global.requestAnimationFrame(function () {
      if (!panel.isConnected) return;
      var ph = panel.offsetHeight || 200;
      if (ar.top < ph + gap + 16) {
        panel.style.bottom = 'auto';
        panel.style.top = Math.min(window.innerHeight - ph - 12, Math.round(ar.bottom + gap)) + 'px';
      }
    });
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

  function atrWbLoginShouldShow(snap) {
    if (!atrEditPathOn(snap)) return false;
    if (atrWbLoginForced) return true;
    return !atrWbChatReady();
  }

  function atrWbLoginHtml(snap) {
    if (!atrWbLoginShouldShow(snap)) return '';
    var busy = atrWbLoginBusy || atrWbLoginStatus === 'pending';
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
        '登录 WorkBuddy 后用账号模型编辑，无需粘贴 API Key'
      );
    }
    return (
      '<div class="ha2-atr-wb-login" data-ha2-atr-wb-login>' +
      '<div class="ha2-atr-wb-login-hd">' +
      '<b>' +
      esc(t('ha2AtrWbLoginTitle', '登录 WorkBuddy 开始编辑')) +
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
      (atrWbChatReady()
        ? '<button type="button" class="ha2-link" data-ha2-atr-wb-login-dismiss>' +
          esc(t('ha2AtrWbLoginDismiss', '收起')) +
          '</button>'
        : '<button type="button" class="ha2-link" data-ha2-open-wb-config>' +
          esc(t('ha2WbGoConfig', '完整配置')) +
          '</button>') +
      '</div></div>'
    );
  }

  function atrWbLoginSig(snap) {
    if (!atrWbLoginShouldShow(snap)) return 'off';
    return (
      'on\0' +
      (atrWbChatReady() ? '1' : '0') +
      '\0' +
      (atrWbLoginBusy ? '1' : '0') +
      '\0' +
      atrWbLoginStatus +
      '\0' +
      (atrWbLoginForced ? '1' : '0')
    );
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
    if (!atrEditPathOn(snap || {})) return false;
    atrWbLoginForced = true;
    syncAtrWbLoginHost(snap || {});
    return true;
  }

  function finishAtrWbLoginOk() {
    stopAtrWbLoginPoll();
    atrWbLoginPendingId = '';
    atrWbLoginBusy = false;
    atrWbLoginStatus = '';
    atrWbLoginForced = false;
    var A = global.OneToneHomeAgentTask;
    if (A && A.writeProvider) A.writeProvider('workbuddy');
    toast(t('ha2AtrWbLoginOk', '已登录 WorkBuddy — 普通编辑需先隔离验证'));
    return refreshAtrProviders(true).then(function () {
      if (!mounted) return;
      var snap = store() && store().getSnapshot && store().getSnapshot();
      syncAtrProviderHost(snap);
      syncAtrWbLoginHost(snap);
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

  function wbTurnRoleHtml(role, modelId) {
    if (role === 'assistant') {
      return (
        '<img class="ha2-wb-turn-ico" src="' +
        esc(WB_CHAT_ICON) +
        '" alt="" />' +
        '<span>' +
        esc(t('ha2WbRoleAssistant', 'WorkBuddy')) +
        '</span>' +
        (modelId
          ? '<span class="ha2-wb-turn-meta">· ' + esc(modelId) + '</span>'
          : '')
      );
    }
    return (
      '<span class="ha2-wb-avatar-me" aria-hidden="true">' +
      esc(t('ha2WbRoleUser', '我')) +
      '</span><span>' +
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

  function wbTranscriptHtml(kind) {
    if (String(kind || '') !== 'workbuddy') return '';
    if (!wbChatTurns.length) return '';
    var collapsed = wbTranscriptCollapsed;
    var body = collapsed
      ? ''
      : '<div class="ha2-wb-transcript-body" data-ha2-wb-transcript-body>' +
        wbChatTurns
          .slice(-16)
          .map(function (turn) {
            var role = turn.role === 'assistant' ? 'assistant' : 'user';
            return (
              '<div class="ha2-wb-turn ha2-wb-turn--' +
              role +
              '"><span class="ha2-wb-turn-role">' +
              wbTurnRoleHtml(role, turn.model) +
              '</span><pre class="ha2-wb-turn-text">' +
              esc(turn.text) +
              '</pre></div>'
            );
          })
          .join('') +
        '</div>';
    return (
      '<div class="ha2-wb-transcript' +
      (collapsed ? ' is-collapsed' : '') +
      '" data-ha2-wb-transcript>' +
      '<div class="ha2-wb-transcript-head">' +
      '<button type="button" class="ha2-link" data-ha2-wb-transcript-toggle>' +
      esc(
        collapsed
          ? t('ha2WbTranscriptExpand', '展开对话') + ' · ' + wbChatTurns.length
          : t('ha2WbTranscriptCollapse', '收起对话')
      ) +
      '</button>' +
      '<button type="button" class="ha2-link ha2-wb-transcript-clear" data-ha2-wb-chat-clear>' +
      esc(t('ha2WbChatClear', '清空')) +
      '</button></div>' +
      body +
      '</div>'
    );
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

  function contextLabels() {
    var fg = t('ha2FgUnknown', '前台应用');
    var habit = t('ha2HabitUnknown', '当前习惯');
    try {
      var rt = global.OneToneRuntimeHabitControl;
      var id = rt && rt.foregroundIdentity ? rt.foregroundIdentity() : null;
      if (!id) {
        var nav = global.OneToneHabitLayerNav;
        id = nav && nav.getForegroundIdentity ? nav.getForegroundIdentity() : null;
      }
      if (id) {
        fg =
          truncateLabel(
            id.windowTitle || id.window_title || id.exeName || id.exe_name || id.appId || ''
          ) || fg;
      }
    } catch (_) {}
    try {
      var hr = global.OneToneHabitRuntime;
      var snap = hr && hr.getSnapshot ? hr.getSnapshot() : null;
      var name = snap && snap.current && snap.current.name;
      if (name) habit = truncateLabel(name, 28);
    } catch (_) {}
    return { fg: fg, habit: habit };
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
    // Work + ATR live: hide agent pulse — task core owns status credibility.
    if (atrEditPathOn(snap) && atrTaskShouldSurface(snap)) return '';
    // Mac pulse: eligible work first; else running targets before idle discovered.
    var rows = (store() && store().workRows && store().workRows(3)) || [];
    var chips = [];
    var seen = {};
    var i;
    var maxChips = atrEditPathOn(snap) ? 1 : 4;
    for (i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || !r.kind || seen[r.kind]) continue;
      seen[r.kind] = true;
      chips.push({
        kind: r.kind,
        name: (r.cat && r.cat.name) || r.kind,
        status: r.status
      });
      if (chips.length >= maxChips) break;
    }
    if (!chips.length) {
      var targets = (snap.targets || []).slice().sort(function (a, b) {
        return (b && b.running ? 1 : 0) - (a && a.running ? 1 : 0);
      });
      for (i = 0; i < targets.length && chips.length < maxChips; i++) {
        var tg = targets[i];
        if (!tg || !tg.kind || !tg.discovered || seen[tg.kind]) continue;
        seen[tg.kind] = true;
        chips.push({
          kind: tg.kind,
          name: tg.label || tg.kind,
          status: tg.running ? 'running' : 'idle',
          label: tg.running
            ? (tg.label || tg.kind) + ' · ' + t('ha2PulseFg', '前台')
            : (tg.label || tg.kind) + ' · ' + t('ha2PulseOptional', '可选')
        });
      }
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
      if (/list_dir|list_files|workspace|glob|check/i.test(tool)) {
        line = t('ha2AtrUserCheckWs', '检查工作区');
      } else if (/read/i.test(tool)) {
        line = path
          ? t('ha2AtrUserRead', '已读取') + ' ' + path
          : t('ha2AtrUserRead', '已读取');
      } else if (/write|patch|apply|edit|replace/i.test(tool)) {
        line = path
          ? t('ha2AtrUserPropose', '拟定修改') + ' ' + path
          : t('ha2AtrUserPropose', '拟定修改');
      } else if (/export|desktop|copy_to/i.test(tool)) {
        line = t('ha2AtrUserExportPrep', '准备放到桌面');
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
      } else if (/list_dir|list_files|workspace|glob|check/i.test(tool)) {
        line = t('ha2AtrUserCheckWs', '检查工作区');
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

  function atrEventDetail(e) {
    var p = (e && e.payload) || {};
    var args = p.arguments && typeof p.arguments === 'object' ? p.arguments : {};
    var bits = [];
    if (p.question) bits.push(String(p.question).slice(0, 480));
    if (p.summary) bits.push(String(p.summary).slice(0, 480));
    if (p.reason) bits.push(String(p.reason).slice(0, 480));
    if (p.message) bits.push(String(p.message).slice(0, 480));
    if (args.summary) bits.push(String(args.summary).slice(0, 480));
    if (args.rationale) bits.push(String(args.rationale).slice(0, 480));
    if (p.rationale) bits.push(String(p.rationale).slice(0, 480));
    if (p.path || args.path) {
      bits.push('path: ' + String(p.path || args.path));
    }
    if (args.query) bits.push('query: ' + String(args.query).slice(0, 200));
    if (args.new_content) {
      bits.push(String(args.new_content).slice(0, 420));
    }
    if (p.text) bits.push(String(p.text).slice(0, 480));
    if (p.error) bits.push(String(p.error).slice(0, 240));
    if (p.modelExcerpt || p.modelRaw || p.raw) {
      bits.push(
        String(p.modelExcerpt || p.modelRaw || p.raw).slice(0, 640)
      );
    }
    if (p.result != null) {
      try {
        var r = p.result;
        if (r && typeof r === 'object') {
          if (r.rationale) bits.push(String(r.rationale).slice(0, 400));
          if (r.summary) bits.push(String(r.summary).slice(0, 400));
          if (r.path) bits.push('path: ' + String(r.path));
          if (r.dest) bits.push('桌面: ' + String(r.dest));
        }
        var s = typeof r === 'string' ? r : JSON.stringify(r);
        bits.push(String(s).slice(0, 560));
      } catch (_) {}
    }
    // Dedup while preserving order.
    var seen = {};
    return bits
      .map(function (b) {
        return String(b || '').trim();
      })
      .filter(function (b) {
        if (!b || seen[b]) return false;
        seen[b] = 1;
        return true;
      })
      .join('\n');
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
  function atrWbPageMode(snap) {
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
    } else if (
      st === 'running' ||
      st === 'verifying' ||
      st === 'repair' ||
      st === 'review' ||
      st === 'failed'
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
    if (provider) progressBits.push(String(provider));
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

    var lastEv = evs.length ? evs[evs.length - 1] : null;
    var lastLine = lastEv
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
    if (mode === 'edit') return t('ha2ModeWork', '工作');
    return t('ha2ModeChat', '对话');
  }

  function modeBoundaryCopy(mode) {
    if (mode === 'edit') {
      return t(
        'ha2ModeBoundaryWork',
        '工作模式会读取并可能修改项目文件；开始前先确认，写入前再批准。'
      );
    }
    return t(
      'ha2ModeBoundaryChat',
      '对话模式只讨论与出方案，不会读写项目文件。'
    );
  }

  /** Codex-style 对话|工作 segment — home chrome + in-page rail. */
  function workModeSegmentHtml(snap, opts) {
    opts = opts || {};
    var session = (snap && snap.session) || {};
    var mode =
      (snap && snap.workMode) === 'edit' || session.mode === 'edit' ? 'edit' : 'think';
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
        title: t('ha2ModeChatHint', '本机对话：讨论、方案、给其他模型的步骤说明'),
        disabled: false
      },
      {
        id: 'edit',
        label: sessionModeLabel('edit'),
        title: editOk
          ? t('ha2ModeWorkHint', '工作：在项目里读文件、改代码（需确认时会停下）')
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
    return (
      '<div class="ha2-mode-row ha2-mode-row--segment' +
      (opts.compact ? ' is-compact' : '') +
      '" role="radiogroup" aria-label="' +
      esc(t('ha2WorkMode', '对话 / 工作')) +
      '">' +
      modeBtns +
      '</div>'
    );
  }

  function sessionChromeHtml(snap) {
    var session = snap && snap.session;
    if (!session) return '';
    var mode = session.mode === 'edit' ? 'edit' : 'think';
    var effective = !!session.modeEffective;
    var roleHint =
      mode === 'edit'
        ? t('ha2RoleWork', '读改项目文件与代码')
        : t('ha2RoleChat', '聊思路、整理方案（可交接给其他模型）');
    var handoffBtn = '';
    if (mode === 'think' && wbChatTurns.length) {
      handoffBtn =
        '<button type="button" class="ha2-link" data-ha2-handoff-open>' +
        esc(t('ha2HandoffOpen', '整理并交接任务')) +
        '</button>';
    }

    return (
      '<div class="ha2-session-chrome" data-ha2-session-chrome data-work-mode="' +
      esc(mode) +
      '">' +
      workModeSegmentHtml(snap) +
      '<p class="ha2-mode-boundary" data-ha2-mode-boundary data-mode="' +
      esc(mode) +
      '">' +
      esc(modeBoundaryCopy(mode)) +
      '</p>' +
      '<div class="ha2-session-role" data-ha2-session-role><b>' +
      esc(roleHint) +
      '</b>' +
      (effective
        ? ''
        : '<span class="ha2-session-mode-note">' +
          esc(session.modeReason || t('ha2ModeIneffective', '当前模式尚未真正生效')) +
          '</span>') +
      handoffBtn +
      '</div>' +
      handoffPanelHtml(snap) +
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

  function openWorkConfirm(goal, matSum) {
    workConfirmOpen = true;
    workConfirmGoal = String(goal || '').trim();
    workConfirmMatSum = String(matSum || '');
    if (workConfirmGoal) atrWbPagePendingGoal = workConfirmGoal;
    atrWbPageForced = true;
    atrWbPageUserClosed = false;
  }

  /** Keep draft/send chrome aligned with 对话|工作 after mode flips. */
  function syncModeChrome(snap) {
    if (!root) return;
    snap = snap || (store() && store().getSnapshot()) || {};
    var atrEdit = atrEditPathOn(snap);
    var draftLabel = atrEdit
      ? t('ha2AtrDraftLabel', '描述要改的代码或文件')
      : t('ha2DraftLabelChat', '继续讨论或整理方案');
    var draftPh = atrEdit
      ? t('ha2AtrDraftPlaceholder', '例如：把 README 复制到桌面 / 给登录页加错误提示…')
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
      sendBtn.textContent = atrEdit ? label : '↑';
    }
    var secondary = root.querySelectorAll('[data-ha2-work-secondary]');
    var i;
    var Pcx = global.OneToneHomeProjectContext;
    for (i = 0; i < secondary.length; i++) {
      if (atrEdit) {
        secondary[i].hidden = true;
      } else if (secondary[i].hasAttribute('data-ha2-pcx')) {
        secondary[i].hidden = !(
          Pcx &&
          Pcx.featureEnabled &&
          Pcx.featureEnabled()
        );
      } else {
        secondary[i].hidden = false;
      }
    }
  }

  function closeWorkConfirm() {
    workConfirmOpen = false;
    workConfirmGoal = '';
    workConfirmMatSum = '';
  }

  /**
   * Direct start — no confirm gate. If provider not editCapable, silent verify then goal.
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
        materialsSummary: mats
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
            materialsSummary: mats
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
    var task = snap && snap.agentTask;
    var st = task ? String(task.status || '') : '';
    var goal =
      (workConfirmOpen && workConfirmGoal) ||
      (task && task.goal) ||
      String((snap && snap.draft) || '').trim() ||
      '';
    var mats =
      (workConfirmOpen && workConfirmMatSum) ||
      materialsSummaryLine(snap) ||
      t('ha2MatNone', '无额外材料');
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
      '<div class="ha2-task-core-next">' +
      esc(next) +
      '</div></div>'
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
      esc(t('ha2Materials', '材料')) +
      '</span> ' +
      esc(mats) +
      '</div><div><span>' +
      esc(t('ha2AtrProvider', '引擎')) +
      '</span> ' +
      esc(atrProviderLabel(snap)) +
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
      ? taskCoreHtml(snap)
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
    return (
      '<div class="ha2-situation" data-ha2-situation>' +
      '<div class="ha2-ctx">' +
      '<span class="ha2-ctx-fg" title="' +
      esc(ctx.fg) +
      '">' +
      esc(ctx.fg) +
      '</span>' +
      '<button type="button" class="ha2-ctx-habit" data-ha2-habit-hub title="' +
      esc(t('ha2OpenHabitHub', '打开习惯')) +
      '"><b>' +
      esc(t('ha2HabitChip', '习惯')) +
      '</b> ' +
      esc(ctx.habit) +
      '</button></div>' +
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
      return (
        '<button type="button" class="ha2-btn ha2-row-cta" data-ha2-select="' +
        esc(r.kind) +
        '">' +
        esc(t('ha2SendHere', '发送到此')) +
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

  function listHtml(snap) {
    var rows = (store() && store().workRows && store().workRows(3)) || [];
    var workspace = workspaceCapsuleRowHtml(snap);
    if (!rows.length) return workspace + emptyListHtml(snap);
    var stale =
      snap.loadPhase === 'stale'
        ? '<div class="ha2-stale">' + esc(t('ha2ShowingStale', '显示上次可信快照，正在刷新…')) + '</div>'
        : '';
    return (
      workspace +
      stale +
      rows
        .map(function (r) {
          return rowHtml(r, snap);
        })
        .join('')
    );
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
    // ATR panel already owns waiting/interrupted/busy CTAs + timeline — avoid twin cards.
    if (
      snap.agentTask &&
      atrTaskShouldSurface(snap) &&
      (atrCode === 'waiting' ||
        atrCode === 'interrupted' ||
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
      atrCode === 'busy' ||
      atrCode === 'driving' ||
      atrCode === 'starting' ||
      atrCode === 'budget_exhausted' ||
      atrCode === 'drive_failed' ||
      atrCode === 'format_error'
    ) {
      cta =
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

  /** One workspace row inside the existing work list — never a separate receipt card. */
  function workspaceCapsuleRowHtml(snap) {
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
    var title = leaf ? leaf + ' 工作区' : t('ha2TmLabel', '项目时间胶囊');
    var tag;
    var note;
    var tagTone = '';
    // Home has no session-bound Diff — always open project timeline (prefer home project).
    var action = t('ha2OpenProjectTimeline', '打开项目时间线');
    var tipLabel = tm && (tm.tipLabel || tm.tip_label || tm.tipId || tm.tip_id);
    var homePath = (ctx && ctx.projectPath) || (snap.session && snap.session.projectPath) || '';
    if (homePath) {
      var homeLeaf = '';
      if (PP && PP.pathLeaf) homeLeaf = PP.pathLeaf(homePath) || '';
      else {
        var hp = String(homePath).replace(/[\\/]+$/, '').split(/[\\/]/);
        homeLeaf = hp[hp.length - 1] || homePath;
      }
      if (homeLeaf) title = homeLeaf + ' 工作区';
    }
    if (!tm && !homePath) {
      tag = t('ha2TmLoadingTag', '读取中');
      note = t('ha2TmLoading', '正在读取 Git 状态…');
    } else if (!homePath && !path) {
      tag = t('ha2TmNoProjectTag', '未接入');
      note = t('ha2TmNoProject', '选择项目后可查看改动与恢复点');
    } else if (block && (!homePath || targetPathMatchedTm(snap))) {
      tag = t('ha2TmNeedsAttention', '需处理');
      note = String(block);
      tagTone = ' is-wait';
    } else if (homePath && path && !targetPathMatchedTm(snap)) {
      tag = t('ha2TmOtherProjectTag', '将打开当前项目');
      note = t('ha2TmOpenHomeProject', '时间胶囊当前连着其他目录；入口会打开本页确认的项目');
      tagTone = ' is-wait';
    } else if (!isGit && path && targetPathMatchedTm(snap)) {
      tag = t('ha2TmUnprotected', '未保护');
      note = t('ha2TmNotGit', '当前项目还不是 Git 仓库');
      tagTone = ' is-wait';
    } else if (changed > 0 && targetPathMatchedTm(snap)) {
      tag = changed + t('ha2WorkspaceChanges', ' 项改动');
      note = tipLabel
        ? t('ha2RecentProtectPoint', '最近保护点') + ' · ' + tipLabel
        : t('ha2TmDirtyHint', '打开后可查看恢复点和影响文件');
    } else {
      tag = t('ha2TmClean', '工作区干净');
      note = tipLabel
        ? t('ha2RecentProtectPoint', '最近保护点') + ' · ' + tipLabel
        : t('ha2TmTimelineHint', '打开项目时间线查看恢复点（首页无会话绑定 Diff）');
    }
    return (
      '<article class="ha2-row ha2-workspace-row" data-ha2-workspace-row>' +
      '<button type="button" class="ha2-row-main" data-ha2-tm aria-label="' +
      esc(t('ha2OpenProjectTimeline', '打开项目时间线')) +
      '"><span class="ha2-workspace-icon" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" focusable="false"><path d="M3.5 6.5h6l1.8 2h9.2v9H3.5z"/><path d="M3.5 8.5h17"/></svg>' +
      '</span><div class="ha2-row-body"><div class="ha2-row-title"><b>' +
      esc(title) +
      '</b><span class="ha2-row-tag' +
      tagTone +
      '">' +
      esc(tag) +
      '</span></div><div class="ha2-note">' +
      esc(note) +
      '</div></div></button><div class="ha2-actions"><button type="button" class="ha2-btn ha2-row-cta" data-ha2-tm>' +
      esc(action) +
      '</button></div></article>'
    );
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
    if (snap && snap.agentTask && atrTaskShouldSurface(snap)) return true;
    var n = snap && snap.validationNotice;
    if (n && String(n.kind || '').indexOf('atr_') === 0) return true;
    return false;
  }

  function homeContentHtml(snap) {
    var atrLive = atrEditPathOn(snap) && atrTaskShouldSurface(snap);
    var atrOwns = atrOwnsHomeChrome(snap);
    var banner = primaryBannerHtml(snap);
    // Mutual exclusion: ATR / confirm / needsYou > permission > delivery > completion.
    var permOnly = '';
    if (!atrLive && !workConfirmOpen && banner.kind !== 'needsYou') {
      permOnly =
        banner.kind === 'permission' ? banner.html : permissionHtml(snap);
    }
    var delivery = atrOwns ? '' : deliveryReceiptHtml(snap);
    var completion = atrOwns ? '' : completionObservationHtml(snap);
    return (
      permOnly +
      situationHtml(snap) +
      '<div data-ha2-completion-obs>' +
      completion +
      '</div><div data-ha2-validation-notice>' +
      validationNoticeHtml(snap) +
      '</div><div data-ha2-delivery-receipt role="status" aria-live="polite" aria-atomic="true">' +
      delivery +
      '</div><div data-ha2-action-receipt role="status" aria-live="polite" aria-atomic="true">' +
      (atrOwns ? '' : actionReceiptHtml(snap)) +
      '</div>' +
      '<div class="ha2-section-head"><h3>' +
      esc(t('ha2Workspace', 'Agent 任务与会话')) +
      '</h3><span>' +
      esc(t('ha2WorkspaceHint', '改动 · 会话 · 任务')) +
      '</span><button type="button" class="ha2-link" data-ha2-open-center>' +
      esc(t('ha2ViewAll', '查看全部')) +
      '</button></div><div class="ha2-list" data-ha2-list>' +
      listHtml(snap) +
      '</div>'
    );
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
    // ATR edit uses WorkBuddy OAuth / Soft Pad keys as engines — Soft Pad runtime readiness is unrelated.
    if (atrEditPathOn(snap || {})) return '';
    var bits = [];
    function bit(cap, label) {
      if (!cap) return;
      if (cap.state === 'on' && cap.runtimeReady) bits.push(label + ' ' + t('ha2CapReady', '就绪'));
      else if (cap.state === 'on' || cap.configOn) bits.push(label + ' ' + t('ha2CapConfigOn', '已启用'));
      else if (cap.state === 'pending') bits.push(label + '…');
      else if (cap.state === 'error') bits.push(label + ' ' + t('ha2CapError', '异常'));
    }
    bit(caps.softPad, t('ha2SoftPad', 'Soft Pad'));
    bit(caps.voice, t('ha2Voice', '语音'));
    bit(caps.camera, t('ha2Camera', '摄像头'));
    if (!bits.length) return '';
    return bits.join(' · ') + ' · ' + t('ha2CapPanelHint', '配置开 ≠ 运行就绪');
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

  function matMenuHtml() {
    if (!matMenuOpen) return '';
    // File picker already accepts images — no separate「图片」row.
    return (
      '<div class="ha2-mat-menu" data-ha2-mat-menu role="menu">' +
      '<button type="button" data-ha2-mat="file">' +
      esc(t('ha2MatFile', '文件')) +
      '</button>' +
      '<button type="button" data-ha2-mat="screenshot">' +
      esc(t('ha2MatScreenshot', '截图')) +
      '</button>' +
      '<button type="button" data-ha2-mat="paste">' +
      esc(t('ha2MatPaste', '粘贴内容')) +
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
  }

  /** Crosshair mark: dashed = need aim, solid green = locked. */
  function aimChipHtml(hasAim) {
    var label = hasAim ? t('ha2AimLocked', '已对准输入框') : t('ha2AimNow', '现在定位');
    return (
      '<button type="button" class="ha2-aim-chip' +
      (hasAim ? ' is-ok' : ' is-off') +
      '" data-ha2-aim title="' +
      esc(label) +
      '" aria-label="' +
      esc(label) +
      '"><span class="ha2-aim-ico" aria-hidden="true">' +
      '<svg viewBox="0 0 20 20" width="16" height="16" fill="none">' +
      '<circle cx="10" cy="10" r="6.5" stroke="currentColor" stroke-width="1.6"/>' +
      '<circle class="ha2-aim-dot" cx="10" cy="10" r="2.2" fill="currentColor"/>' +
      '<path d="M10 2.5v2.2M10 15.3v2.2M2.5 10h2.2M15.3 10h2.2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>' +
      '</svg></span></button>'
    );
  }

  function syncAimChip(hasAim) {
    var aimBtn = root && root.querySelector('[data-ha2-aim]');
    var aimClear = root && root.querySelector('[data-ha2-aim-clear]');
    if (aimBtn) {
      var label = hasAim ? t('ha2AimLocked', '已对准输入框') : t('ha2AimNow', '现在定位');
      aimBtn.classList.toggle('is-ok', hasAim);
      aimBtn.classList.toggle('is-off', !hasAim);
      aimBtn.setAttribute('aria-label', label);
      aimBtn.title = label;
    }
    if (aimClear) aimClear.hidden = !hasAim;
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

  /** Edit mode: project context only — not a desktop Agent send target. */
  function atrEditTargetChipHtml(snap) {
    var projectLabel = targetProjectLabel(snap);
    return (
      '<span class="ha2-chip target is-atr-edit" data-ha2-atr-edit-chip title="' +
      esc(t('ha2AtrEditChipTitle', 'ATR 编辑任务（非投递到桌面 Agent）')) +
      '"><span class="ha2-chip-copy"><span data-ha2-dest-name>' +
      esc(t('ha2AtrEditChip', 'ATR 编辑')) +
      '</span><span class="ha2-chip-project" data-ha2-dest-project>' +
      esc(projectLabel) +
      '</span></span></span>'
    );
  }

  /** Why ↑ is blocked — edit/ATR never requires a desktop Agent selection. */
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
    return (
      '<button type="button" class="' +
      capClass(caps[key], key) +
      ' ha2-cap--icon" data-ha2-cap="' +
      esc(key) +
      '" title="' +
      esc(label) +
      '" aria-label="' +
      esc(label) +
      '"><span class="ha2-cap-lbl">' +
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
    var projectLabel = targetProjectLabel(snap);
    var sendOk = canSendNow(snap);
    var atrEdit = atrEditPathOn(snap);
    var draftLabel = atrEdit
      ? t('ha2AtrDraftLabel', '描述要改的代码或文件')
      : t('ha2DraftLabelChat', '继续讨论或整理方案');
    var draftPh = atrEdit
      ? t('ha2AtrDraftPlaceholder', '例如：把 README 复制到桌面 / 给登录页加错误提示…')
      : t('ha2DraftPlaceholderChat', '聊思路、读代码疑问，或生成给其他模型的步骤…');
    var targetChip = atrEdit
      ? atrEditTargetChipHtml(snap)
      : '<button type="button" class="ha2-chip target" data-ha2-picker title="' +
        esc(t('ha2PickAgent', '选择 Agent')) +
        '">' +
        iconHtml(c, 'ha2-chip-icon') +
        '<span class="ha2-chip-copy"><span data-ha2-dest-name>' +
        esc(c.name) +
        '</span><span class="ha2-chip-project" data-ha2-dest-project>' +
        esc(projectLabel) +
        '</span></span><span class="ha2-chip-caret" aria-hidden="true">▾</span></button>';
    return (
      '<div class="ha2-dock-zone"><section class="ha2-dock ha2-drop" data-ha2-drop>' +
      '<div data-ha2-wb-transcript-host>' +
      wbTranscriptHtml(c.id) +
      '</div>' +
      /* Consult above draft so restatement is not buried under the editor. */
      '<div data-ha2-consult-host>' +
      consultStripHtml(snap) +
      '</div>' +
      '<div class="ha2-compose"><label class="ha2-sr-only" for="ha2-draft-input">' +
      esc(draftLabel) +
      '</label><textarea id="ha2-draft-input" class="ha2-editor" data-ha2-draft aria-label="' +
      esc(draftLabel) +
      '" placeholder="' +
      esc(draftPh) +
      '" rows="3"></textarea></div>' +
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
      '<div class="ha2-dock-bar">' +
      '<div class="ha2-add-wrap"><button type="button" class="ha2-round" data-ha2-add title="' +
      esc(t('ha2AddMaterial', '加入材料')) +
      '">+</button>' +
      matMenuHtml() +
      '</div><i class="ha2-divider" aria-hidden="true"></i>' +
      '<div class="ha2-channel-caps" role="group" aria-label="' +
      esc(t('ha2ChannelCaps', '通道能力')) +
      '">' +
      agentCapBtn(caps, 'softPad', t('ha2SoftPad', 'Soft Pad')) +
      agentCapBtn(caps, 'voice', t('ha2Voice', '语音')) +
      agentCapBtn(caps, 'camera', t('ha2Camera', '摄像头')) +
      '</div><span class="ha2-spacer"></span>' +
      '<div class="ha2-agent-fuse" data-ha2-agent-fuse>' +
      targetChip +
      '<span class="ha2-wb-mode-host" data-ha2-wb-mode-host>' +
      wbModeToggleHtml(c.id, snap) +
      '</span>' +
      '<span class="ha2-wb-model-host" data-ha2-wb-model-host>' +
      wbModelSelectHtml(c.id) +
      '</span>' +
      '<span class="ha2-atr-provider-host" data-ha2-atr-provider-host>' +
      atrProviderSelectHtml(snap) +
      '</span>' +
      aimChipHtml(hasAim) +
      '<button type="button" class="ha2-link ha2-aim-clear" data-ha2-aim-clear' +
      (hasAim ? '' : ' hidden') +
      ' title="' +
      esc(t('ha2AimClear', '清除')) +
      '">' +
      esc(t('ha2AimClear', '清除')) +
      '</button></div>' +
      '<button type="button" class="ha2-link ha2-pcx ha2-work-secondary" data-ha2-work-secondary data-ha2-pcx title="' +
      esc(t('ha2AddProjectMaterials', '手动添加材料')) +
      '"' +
      (atrEdit ||
      !(
        global.OneToneHomeProjectContext &&
        global.OneToneHomeProjectContext.featureEnabled &&
        global.OneToneHomeProjectContext.featureEnabled()
      )
        ? ' hidden'
        : '') +
      '>' +
      esc(t('ha2AddProjectMaterialsManual', '手动添加材料')) +
      '</button>' +
      '<button type="button" class="ha2-btn ha2-organize ha2-work-secondary" data-ha2-work-secondary data-ha2-organize title="' +
      esc(t('ha2OrganizeTask', '整理任务')) +
      '"' +
      (atrEdit ? ' hidden' : '') +
      '>' +
      esc(t('ha2OrganizeTask', '整理任务')) +
      '</button>' +
      '<button type="button" class="ha2-link ha2-organize-cancel" data-ha2-organize-cancel hidden>' +
      esc(t('ha2OrganizeCancel', '取消整理')) +
      '</button>' +
      '<label class="ha2-metered-toggle ha2-work-secondary" data-ha2-work-secondary title="' +
      esc(
        t(
          'ha2AllowMeteredTitle',
          '允许计量额度：会产生费用；关闭时仅尝试零价模型'
        )
      ) +
      '"' +
      (atrEdit ? ' hidden' : '') +
      '><input type="checkbox" data-ha2-allow-metered />' +
      esc(t('ha2AllowMetered', '允许计量额度')) +
      '</label>' +
      '<button type="button" class="ha2-link ha2-work-secondary" data-ha2-work-secondary data-ha2-assist-keys title="' +
      esc(
        atrEdit
          ? t('ha2AtrSoftPadKeysSecondary', 'Soft Pad 密钥（次选）')
          : t('ha2AssistKeys', '配置 Soft Pad 提供商密钥')
      ) +
      '"' +
      (atrEdit ? ' hidden' : '') +
      '>' +
      esc(t('ha2AssistKeysShort', '密钥')) +
      '</button>' +
      '<button type="button" class="ha2-send' +
      (atrEdit ? ' is-labeled' : '') +
      '" data-ha2-send ' +
      (sendOk ? '' : 'disabled') +
      ' title="' +
      esc(
        sendOk
          ? atrEdit
            ? workPrimaryCtaLabel(snap) + '（Ctrl+Enter）'
            : wbUsesLocalChat(c.id, snap)
              ? t('ha2WbLocalSendHint', '本机对话（Ctrl+Enter）')
              : t('ha2SendHint', '发送（Ctrl+Enter）')
          : atrEdit
            ? t('ha2SendNeedDraft', '先写一句再发送')
            : !c.id
              ? t('ha2PickAgent', '选择 Agent')
              : t('ha2SendNeedDraft', '先写一句再发送')
      ) +
      '" aria-label="' +
      esc(atrEdit ? workPrimaryCtaLabel(snap) : t('ha2Send', '发送')) +
      '">' +
      (atrEdit ? esc(workPrimaryCtaLabel(snap)) : '↑') +
      '</button></div>' +
      '<div data-ha2-atr-wb-login-host>' +
      atrWbLoginHtml(snap) +
      '</div>' +
      '<p class="ha2-send-scope-hint" data-ha2-send-scope-hint></p></section></div>'
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
      S.setPickerOpen(false);
      return;
    }
    pickerSurface = surface;
    pickerAnchor = anchorEl || null;
    S.setPickerOpen(true);
    schedulePositionPicker();
  }

  function closePickerSurface() {
    pickerSurface = null;
    pickerAnchor = null;
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
      var shell = root.querySelector('.ha2-shell');
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
    if (snap.view === 'agent') {
      var c = currentCat(snap);
      el.innerHTML =
        '<button type="button" data-ha2-home>' +
        esc(t('ha2Home', '首页')) +
        '</button><span>›</span><b>' +
        esc(c.name) +
        '</b><span>›</span><button type="button" data-ha2-home>' +
        esc(t('ha2Close', '关闭')) +
        '</button>';
    } else {
      el.innerHTML = '<b>' + esc(t('ha2Home', '首页')) + '</b>';
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
        var wrap = document.createElement('div');
        wrap.innerHTML = situationHtml(snap);
        var next = wrap.firstChild;
        if (next) sit.replaceWith(next);
      }
      var list = el.querySelector('[data-ha2-list]');
      if (list) list.innerHTML = listHtml(snap);
      var doneRec =
        el.querySelector('[data-ha2-completion-obs]') ||
        el.querySelector('[data-ha2-done-receipt]');
      if (doneRec) doneRec.innerHTML = completionObservationHtml(snap);
      var valHost = el.querySelector('[data-ha2-validation-notice]');
      if (valHost) valHost.innerHTML = validationNoticeHtml(snap);
      var deliveryHost =
        el.querySelector('[data-ha2-delivery-receipt]') ||
        el.querySelector('[data-ha2-receipt]');
      if (deliveryHost) deliveryHost.innerHTML = deliveryReceiptHtml(snap);
      var actionHost = el.querySelector('[data-ha2-action-receipt]');
      if (actionHost) actionHost.innerHTML = actionReceiptHtml(snap);
      return;
    }
    el.setAttribute('data-ha2-view-key', key);
    el.innerHTML = snap.view === 'agent' ? detailContentHtml(snap) : homeContentHtml(snap);
  }

  function patchDockMeta(snap) {
    if (!root) return;
    var dockHost = root.querySelector('[data-ha2-dock-host]');
    if (!dockHost) return;
    syncAtrProviderHost(snap);
    syncAtrWbLoginHost(snap);
    if (atrEditPathOn(snap)) {
      refreshAtrProviders(!atrProvidersCache).then(function () {
        if (!mounted) return;
        var next = store() && store().getSnapshot();
        syncAtrProviderHost(next);
        syncAtrWbLoginHost(next);
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
    var fuse = root.querySelector('[data-ha2-agent-fuse]');
    if (fuse) {
      var chipNow = fuse.querySelector('.ha2-chip.target, [data-ha2-atr-edit-chip]');
      if (atrEdit) {
        if (!chipNow || !chipNow.hasAttribute('data-ha2-atr-edit-chip')) {
          var wrapAtr = document.createElement('div');
          wrapAtr.innerHTML = atrEditTargetChipHtml(snap);
          var nextAtr = wrapAtr.firstChild;
          if (chipNow && nextAtr) chipNow.replaceWith(nextAtr);
          else if (nextAtr) fuse.insertBefore(nextAtr, fuse.firstChild);
        } else {
          var projEl = chipNow.querySelector('[data-ha2-dest-project]');
          if (projEl) projEl.textContent = targetProjectLabel(snap);
        }
      } else if (chipNow && chipNow.hasAttribute('data-ha2-atr-edit-chip')) {
        var wrapBtn = document.createElement('div');
        wrapBtn.innerHTML =
          '<button type="button" class="ha2-chip target" data-ha2-picker title="' +
          esc(t('ha2PickAgent', '选择 Agent')) +
          '">' +
          iconHtml(c, 'ha2-chip-icon') +
          '<span class="ha2-chip-copy"><span data-ha2-dest-name>' +
          esc(c.name) +
          '</span><span class="ha2-chip-project" data-ha2-dest-project>' +
          esc(targetProjectLabel(snap)) +
          '</span></span><span class="ha2-chip-caret" aria-hidden="true">▾</span></button>';
        var nextBtn = wrapBtn.firstChild;
        if (nextBtn) chipNow.replaceWith(nextBtn);
      } else if (chipNow) {
        chipNow.innerHTML =
          iconHtml(c, 'ha2-chip-icon') +
          '<span class="ha2-chip-copy"><span data-ha2-dest-name>' +
          esc(c.name) +
          '</span><span class="ha2-chip-project" data-ha2-dest-project>' +
          esc(targetProjectLabel(snap)) +
          '</span></span><span class="ha2-chip-caret" aria-hidden="true">▾</span>';
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
    if (pickerHost) pickerHost.innerHTML = pickerHtml(snap);
    if (snap.pickerOpen && pickerSurface) schedulePositionPicker();
    else if (!snap.pickerOpen) {
      pickerAnchor = null;
      pickerSurface = null;
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
    if (composing || (store() && store().isComposing())) {
      // IME: skip dock rebuild, but still refresh ATR steps (failure / tool results).
      maybeOpenAtrWbPage(store().getSnapshot() || snap);
      return;
    }
    // Silent sync — never emit from inside a store subscriber paint.
    if (dock() && dock().syncCapabilityStates) {
      dock().syncCapabilityStates({ silent: true });
    }
    snap = store().getSnapshot();
    ensureShell(snap);
    var viewChanged = lastView !== snap.view;
    lastView = snap.view;
    patchCrumb(snap);
    patchContent(snap, viewChanged);
    patchDockMeta(snap);
    ensureDockReserveObserver();
    syncDockReserve();
    maybeOpenAtrWbPage(snap);
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
      var last = list[list.length - 1];
      var streamText = wbStreamingText || '…';
      if (last && last.role === 'assistant' && last.id === wbStreamingTurnId) {
        list[list.length - 1] = Object.assign({}, last, { text: streamText, streaming: true });
      } else {
        list.push({
          id: wbStreamingTurnId || 'stream_live',
          role: 'assistant',
          text: streamText,
          streaming: true
        });
      }
    }
    return list;
  }

  function atrLogPreviewLine(label, detail) {
    var head = String(label || '').trim();
    var extra = String(detail || '')
      .split('\n')
      .map(function (s) {
        return String(s || '').trim();
      })
      .filter(function (s) {
        return s && s !== head;
      })[0];
    if (extra) {
      extra = extra.replace(/\s+/g, ' ').slice(0, 96);
      return head ? head + ' · ' + extra : extra;
    }
    return head;
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
    var err = String((task && (task.lastError || task.last_error)) || '').trim();
    // Failures must appear in the transcript — toast alone is easy to miss.
    if ((st === 'failed' || st === 'cancelled') && err && !sawTerminal) {
      out.push(
        /format/i.test(err)
          ? t(
              'ha2AtrFormatNext',
              '模型未按工具格式行动。可换引擎/模型，或改写目标后重试；也可放弃当前任务。'
            )
          : t('ha2AtrEvFailed', '任务失败') + '\n' + err
      );
    } else if (!evs.length && (pendingGoal || st === 'running' || st === 'intake')) {
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
    return atrLogEntriesFrom(
      item.task,
      item.events,
      item.pending ? atrWbPagePendingGoal : ''
    ).join('\n\n');
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
    // Steps default collapsed; pending start-only card stays open briefly.
    var expanded =
      atrLogExpandedById[id] != null ? !!atrLogExpandedById[id] : !!item.pending;
    var entries = atrLogEntriesFrom(
      task,
      item.events,
      item.pending ? atrWbPagePendingGoal : ''
    );
    if (!entries.length) return '';
    var detailEntries = expanded
      ? atrLogDetailEntriesFrom(
          task,
          item.events,
          item.pending ? atrWbPagePendingGoal : ''
        )
      : entries;
    var full = detailEntries.join('\n\n');
    var last = atrLogPreviewLine(
      String(entries[entries.length - 1] || '').split('\n')[0],
      String(entries[entries.length - 1] || '')
        .split('\n')
        .slice(1)
        .join('\n')
    );
    var n = entries.length;
    var title =
      String(task.goal || '').trim() || t('ha2AtrWorkTask', '当前工作任务');
    var st = String(task.status || '');
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
      esc(st || (item.pending ? '…' : '')) +
      '</span></div>' +
      '<div class="ha2-atr-log-bar">' +
      '<button type="button" class="ha2-link" data-ha2-atr-log-toggle="' +
      esc(id) +
      '" aria-expanded="' +
      (expanded ? 'true' : 'false') +
      '">' +
      esc(
        expanded
          ? t('ha2AtrLogCollapse', '收起详情')
          : t('ha2AtrLogExpand', '展开详情') + (n > 1 ? ' · ' + n : '')
      ) +
      '</button>' +
      '<button type="button" class="ha2-link" data-ha2-atr-log-copy="' +
      esc(id) +
      '">' +
      esc(t('ha2AtrLogCopy', '复制')) +
      '</button></div>' +
      '<pre class="ha2-atr-log-text" data-ha2-atr-log-text tabindex="0">' +
      esc(expanded ? full : last) +
      '</pre></div>'
    );
  }

  /** Expanded log: user steps + technical detail (JSON / excerpt). */
  function atrLogDetailEntriesFrom(task, events, pendingGoal) {
    var out = [];
    var goalText = (task && task.goal) || pendingGoal || '';
    if (goalText) {
      out.push(t('ha2AtrGoalRole', '目标') + '\n' + String(goalText));
    }
    var evs = events || [];
    var i;
    for (i = 0; i < evs.length; i++) {
      var e = evs[i] || {};
      var line = atrUserStepLine(e);
      var detail = atrEventDetail(e);
      if (detail && detail !== line) line = line + '\n' + detail;
      out.push(line);
    }
    if (!evs.length && pendingGoal) {
      out.push(
        t('ha2AtrEvPending', '等待模型下一步…') +
          '\n' +
          t('ha2AtrPageStarting', '已打开步骤窗口，正在启动编辑任务…')
      );
    }
    return out.length ? out : atrLogEntriesFrom(task, events, pendingGoal);
  }

  function atrWbChatTurnsHtml(model) {
    var since = atrChatSinceMs || 0;
    var all = wbPageTurnsForPaint().filter(Boolean);
    var turns = all.filter(function (turn) {
      if (turn.streaming) return true;
      if (!since) return true;
      var at = Number(turn.at || 0);
      // Missing at → keep (loaded/legacy rows); else only turns after this ATR open.
      return !at || at >= since;
    });
    // If filter wiped everything but we still have chat, keep the latest few.
    if (!turns.length && all.length) turns = all.slice(-8);
    if (!turns.length) return '';
    return (
      '<div class="ha2-atr-chat-sep">' +
      esc(t('ha2AtrChatSep', '本次任务后的讨论')) +
      '</div>' +
      turns
        .map(function (turn) {
          var role = turn.role === 'assistant' ? 'assistant' : 'user';
          return (
            '<div class="ha2-wb-page-turn ha2-wb-page-turn--' +
            role +
            (turn.streaming ? ' is-streaming' : '') +
              '"><span class="ha2-wb-page-turn-role">' +
            wbTurnRoleHtml(role, turn.model || model) +
            '</span>' +
            wbTurnBodyHtml(turn.text || '', !!turn.streaming) +
            '</div>'
          );
        })
        .join('')
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
      : turns
          .map(function (turn) {
            var role = turn.role === 'assistant' ? 'assistant' : 'user';
            return (
              '<div class="ha2-wb-page-turn ha2-wb-page-turn--' +
              role +
              (turn.streaming ? ' is-streaming' : '') +
              '"><span class="ha2-wb-page-turn-role">' +
              wbTurnRoleHtml(role, turn.model || model) +
              '</span>' +
              wbTurnBodyHtml(turn.text || '', !!turn.streaming) +
              '</div>'
            );
          })
          .join('') ||
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
    var draftPh = atrMode
      ? atrTask &&
        String(atrTask.status) === 'waiting' &&
        String(atrTask.waitingReason || '') === 'user_input'
        ? t('ha2AtrPageInputPh', '补充说明…（Ctrl+Enter 继续任务）')
        : t('ha2AtrPageDraftPh', '继续讨论步骤或结果…（Ctrl+Enter）')
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
    return (
      '<div class="ha2-wb-page' +
      (atrMode ? ' is-atr-edit' : '') +
      '" data-ha2-wb-page' +
      (atrMode ? ' data-ha2-atr-page' : '') +
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
          : t('ha2WbPageTitle', 'WorkBuddy 本机对话')
      ) +
      '</div>' +
      workModeSegmentHtml(snap, { compact: true }) +
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
      '<p class="ha2-wb-page-rail-hint">' +
      esc(
        atrMode || (snap && snap.workMode) === 'edit'
          ? t(
              'ha2AtrPageHint',
              '工作模式：右侧显示读改步骤。对话模式只会聊方案、不会改文件。'
            )
          : t(
              'ha2WbPageHint',
              '对话模式：只讨论与生成方案。要真正改文件请切到「工作」。'
            )
      ) +
      '</p>' +
      '<div class="ha2-wb-page-rail-acts">' +
      railActs +
      '</div></aside>' +
      '<section class="ha2-wb-page-main">' +
      '<div class="ha2-wb-page-transcript" data-ha2-wb-page-transcript>' +
      body +
      '</div>' +
      (atrMode ? atrPageNoticeHtml(snap) + atrMainGateHtml(snap) : '') +
      '<div class="ha2-wb-page-compose">' +
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
          : t('ha2Send', '发送')
      ) +
      '</button></div></div></section></div>'
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
    var id = live ? String((snap.agentTask && snap.agentTask.taskId) || '') : '';
    // Real task bound — drop the synthetic 「正在启动」placeholder goal.
    if (id && atrWbPagePendingGoal) atrWbPagePendingGoal = '';
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
      : turns
          .map(function (turn) {
            var role = turn.role === 'assistant' ? 'assistant' : 'user';
            return (
              '<div class="ha2-wb-page-turn ha2-wb-page-turn--' +
              role +
              (turn.streaming ? ' is-streaming' : '') +
              '"><span class="ha2-wb-page-turn-role">' +
              wbTurnRoleHtml(role, turn.model || model) +
              '</span>' +
              wbTurnBodyHtml(turn.text || '', !!turn.streaming) +
              '</div>'
            );
          })
          .join('') ||
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
              : t('ha2WbPageDraftPh', '继续讨论…（Ctrl+Enter 发送）');
        draftEl.placeholder = draftPh;
        draftEl.setAttribute('aria-label', draftPh);
      }
    }
    var page = host.querySelector('[data-ha2-wb-page]');
    if (page) page.classList.toggle('is-atr-edit', !!atrMode);
    if (atrMode) page && page.setAttribute('data-ha2-atr-page', '');
    else if (page) page.removeAttribute('data-ha2-atr-page');
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
    var host = root.querySelector('[data-ha2-wb-page-host]');
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
      patchWbChatPageLive(host, snap);
      return;
    }
    host.innerHTML = wbChatPageHtml();
    var transcript = host.querySelector('[data-ha2-wb-page-transcript]');
    if (transcript) {
      try {
        transcript.scrollTop = transcript.scrollHeight;
      } catch (_) {}
    }
  }

  function openWbChatPage() {
    wbChatPageOpen = true;
    paintWbChatPage();
  }

  function closeWbChatPage() {
    wbChatPageOpen = false;
    atrWbPageForced = false;
    atrWbPageUserClosed = true;
    atrWbPagePendingGoal = '';
    paintWbChatPage();
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
   * Work mode stays on; non-edit Q&A answers via local chat (channel only — not a mode flip).
   */
  function routeToChatInsteadOfEdit(S, text) {
    if (!S) return;
    // Never flip 工作→对话：用户已选工作，只是这句不像改文件目标。
    if (S.setSelected) {
      try {
        S.setSelected('workbuddy', { silent: true });
      } catch (_) {}
    }
    var snap = (S.getSnapshot && S.getSnapshot()) || {};
    var c = currentCat(snap);
    if (!c || !c.id || c.id !== 'workbuddy') {
      c = { id: 'workbuddy', name: 'WorkBuddy' };
    }
    // Leave ATR chrome so the reply is visible as chat, not a done card.
    atrWbPageForced = false;
    atrWbPagePendingGoal = '';
    atrWbPageUserClosed = true;
    openWbChatPage();
    toast(
      t(
        'ha2WorkKeptChatAnswer',
        '仍在「工作」：这句先按问答回复。要改文件请直接说清目标（例如更新 README）'
      )
    );
    sendWbLocal(text, c);
  }

  /**
   * Work-mode send. Non-edit text → local chat answer, keep workMode.
   * New edit goal vs blocking ATR → abandon+start. Empty draft + patch waiting → approve only.
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

    if (!text) {
      if (S.setValidationNotice) {
        S.setValidationNotice({
          kind: 'atr_need_goal',
          message: t('ha2AtrNeedGoal', '请先写清要改什么')
        });
      }
      return;
    }

    // 「今天天气」类：绝不进编辑 / 绝不当旧任务补充。
    if (!looksLikeEditGoalText(text)) {
      if (typeof opts.clearInput === 'function') opts.clearInput();
      routeToChatInsteadOfEdit(S, text);
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
      return;
    }

    if (typeof opts.clearInput === 'function') opts.clearInput();
    startConfirmedWorkTask(text, matSum).catch(function (err) {
      toast(String((err && err.message) || err || 'atr_failed'));
    });
  }

  function sendWbPageDraft() {
    if (wbChatBusy) return;
    var ta = root && root.querySelector('[data-ha2-wb-page-draft]');
    var text = ta ? String(ta.value || '').trim() : '';
    if (!text) return;
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    snap = promoteWorkModeForEditGoal(S, snap, text);
    var atrTask = snap && snap.agentTask;
    var atrSt = atrTask ? String(atrTask.status || '') : '';
    var atrReason = atrTask ? String(atrTask.waitingReason || '') : '';

    if (String((snap && snap.workMode) || '') === 'edit') {
      dispatchEditModeSend(S, snap, text, materialsSummaryLine(snap), {
        clearInput: function () {
          if (ta) ta.value = '';
        }
      });
      return;
    }
    // ATR still running while UI is on 对话 — don't divert into local chat.
    if (
      atrTask &&
      (atrSt === 'running' ||
        atrSt === 'verifying' ||
        atrSt === 'repair' ||
        atrSt === 'review' ||
        (atrSt === 'waiting' && atrReason === 'approval'))
    ) {
      // Non-edit chat can still proceed; edit-like waits.
      if (!looksLikeEditGoalText(text)) {
        if (ta) ta.value = '';
        sendWbLocal(text, currentCat(snap || {}));
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
    var c = currentCat(snap || {});
    sendWbLocal(text, c);
  }

  function stopWbLocalStream() {
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
    wbStreamingTurnId = '';
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
    var last = '';
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
          if (soFar && soFar !== last) {
            last = soFar;
            onWbStreamDelta({
              runId: res.runId || runId,
              contentSoFar: soFar
            });
          }
          if (res.done) {
            stopWbPoll();
            onWbStreamDone({
              runId: res.runId || runId,
              content: soFar || res.content || '',
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
    wbStreamingText = String(
      payload.contentSoFar != null ? payload.contentSoFar : payload.delta || ''
    );
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
    var err = payload.error ? String(payload.error) : '';
    var model = (payload.model && String(payload.model)) || wbStreamModel;
    var accountId = payload.accountId ? String(payload.accountId) : '';
    wbStreamingText = '';
    wbStreamingTurnId = '';
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
          return invoke('cmd_workbuddy_local_chat_start', {
            args: {
              accountId: def.id,
              model: model,
              messages: messages
            }
          })
            .then(function (startRes) {
              if (gen !== wbChatPaintGen) return;
              wbStreamRunId = (startRes && startRes.runId) || '';
              if (!wbStreamRunId) throw new Error('chat_failed');
              startWbPoll(wbStreamRunId, gen);
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
    // Start immediately; poll for live text (events alone are unreliable).
    ensureWbStreamListen().catch(function () {});
    // No maxTokens: prepare_chat defaults to the model catalog output cap.
    invoke('cmd_workbuddy_local_chat_start', {
      args: {
        accountId: def.id,
        model: model,
        messages: messages
      }
    })
      .then(function (res) {
        if (gen !== wbChatPaintGen) return;
        wbStreamRunId = (res && res.runId) || '';
        if (!wbStreamRunId) throw new Error('chat_failed');
        startWbPoll(wbStreamRunId, gen);
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
    var Assist = global.OneToneHomeAssistClient;
    var model = Prep && Prep._model ? Prep._model() : null;
    var running =
      organizeBusy ||
      !!(model && model.assist && model.assist.state === 'running');
    var orgBtn = root.querySelector('[data-ha2-organize]');
    var cancelBtn = root.querySelector('[data-ha2-organize-cancel]');
    var hint = root.querySelector('[data-ha2-send-scope-hint]');
    var metered = root.querySelector('[data-ha2-allow-metered]');
    if (orgBtn) {
      orgBtn.disabled = !!running;
      orgBtn.textContent = running
        ? t('ha2Organizing', '整理中…')
        : t('ha2OrganizeTask', '整理任务');
    }
    if (cancelBtn) cancelBtn.hidden = !running;
    if (metered && Assist && typeof Assist.allowMetered === 'function') {
      metered.checked = !!Assist.allowMetered();
      metered.disabled = !!running;
    }
    if (hint) {
      var snapHint = store() && store().getSnapshot && store().getSnapshot();
      if (atrEditPathOn(snapHint)) {
        var AtrH = global.OneToneHomeAgentTask;
        var pid = (AtrH && AtrH.readProvider && AtrH.readProvider()) || '';
        hint.textContent = t(
          'ha2AtrSendScope',
          '编辑任务走 Agent Runtime' + (pid ? ' · 提供商 ' + pid : '') + '（与 Soft Pad「整理任务」密钥无关）'
        );
      } else if (Assist && typeof Assist.sendScopeHint === 'function') {
        var scopeLine = Assist.sendScopeHint() || '';
        var readyLine = '';
        if (assistReadyCache) {
          if (assistReadyCache.ready) {
            readyLine = t('ha2AssistReady', '整理可用');
          } else {
            readyLine =
              (Assist.formatFailureNotice &&
                Assist.formatFailureNotice(assistReadyCache.reason || 'no_free_model')) ||
              '';
          }
        }
        hint.textContent = readyLine ? scopeLine + ' · ' + readyLine : scopeLine;
      }
    }
  }

  function refreshAssistReady() {
    var Assist = global.OneToneHomeAssistClient;
    if (!Assist || typeof Assist.fetchReady !== 'function') return;
    Assist.fetchReady().then(function (ready) {
      assistReadyCache = ready;
      syncOrganizeChrome();
    });
  }

  function runOrganizeTask() {
    var S = store();
    var Assist = global.OneToneHomeAssistClient;
    if (!Assist || typeof Assist.runOrganize !== 'function') {
      if (S) {
        S.setValidationNotice({
          kind: 'assist_missing',
          message: t('ha2AssistMissing', '整理模块未加载；可直接发送原稿')
        });
      }
      return;
    }
    if (organizeBusy) return;
    organizeBusy = true;
    syncOrganizeChrome();
    if (S) {
      S.setValidationNotice({
        kind: 'assist_running',
        message: t('ha2OrganizingHint', '正在整理任务…本地取消不保证停止计费')
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
        }
        return Assist.runOrganize({});
      })
      .then(function (res) {
        organizeBusy = false;
        syncOrganizeChrome();
        if (!S) return;
        if (!res || !res.ok) {
          var failMsg =
            (Assist.formatFailureNotice &&
              Assist.formatFailureNotice(res && res.reason)) ||
            (Assist.reasonMessage && Assist.reasonMessage(res && res.reason)) ||
            t('ha2OrganizeFailed', '整理未完成 · 可直接发送原稿');
          S.setValidationNotice({
            kind: 'assist_failed',
            reason: (res && res.reason) || 'internal',
            message: failMsg
          });
          refreshAssistReady();
          return;
        }
        if (res.adopted === false && res.reason === 'stale') {
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
        S.setValidationNotice({
          kind: 'assist_done',
          message: t(
            'ha2OrganizeDone',
            '已生成整理稿（建议稿，请在会诊记录确认理解）；可编辑后发送'
          )
        });
        var Prep = global.OneToneHomePromptPrep;
        if (Prep && Prep.setActiveDraft) Prep.setActiveDraft('organized');
        var org =
          Prep && Prep._model && Prep._model().organizedDraft
            ? Prep._model().organizedDraft.body
            : '';
        if (org) {
          syncDraftMirrors(org);
          S.setDraft(org, { silent: true });
        }
        paint(S.getSnapshot());
      })
      .catch(function (err) {
        organizeBusy = false;
        syncOrganizeChrome();
        if (!S) return;
        S.setValidationNotice({
          kind: 'assist_failed',
          reason: 'offline',
          message:
            (Assist.formatFailureNotice && Assist.formatFailureNotice('offline')) ||
            t('ha2OrganizeOffline', '网络或后端不可用 · 可直接发送原稿')
        });
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
      !(editMode && (atrNeedsApproval(snap) || workConfirmOpen || atrTaskBusy(snap)))
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

    if (!c.id) {
      S.setValidationNotice({
        kind: 'missing_agent',
        message: t('ha2PickAgent', '选择 Agent')
      });
      return;
    }

    // WorkBuddy local LLM chat — only in think mode.
    if (wbUsesLocalChat(c.id, snap)) {
      if (!draftRemember) {
        S.setValidationNotice({
          kind: 'wb_need_text',
          message: t('ha2WbNeedText', '本机对话请先写一句（材料请用桌面模式投递）')
        });
        return;
      }
      if (!wbLocalCache) {
        refreshWbLocal(true).then(function () {
          if (!mounted) return;
          sendWbLocal(draftRemember, c);
        });
        return;
      }
      sendWbLocal(draftRemember, c);
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
    var nodes = root.querySelectorAll('[data-ha2-draft]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i] === active) continue;
      if (nodes[i].value !== text) nodes[i].value = text;
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
    if (el.matches('[data-ha2-consult-skill]')) {
      var Csk = concierge();
      if (Csk && Csk.setFlowSkill) Csk.setFlowSkill(el.value);
      var Ssk = store();
      if (Ssk) paint(Ssk.getSnapshot());
      return;
    }
    if (el.matches('[data-ha2-allow-metered]')) {
      var AssistM = global.OneToneHomeAssistClient;
      if (AssistM && AssistM.setAllowMetered) {
        AssistM.setAllowMetered(!!el.checked);
        refreshAssistReady();
        var SM = store();
        if (SM) {
          SM.setValidationNotice({
            kind: 'assist_metered',
            message: el.checked
              ? t(
                  'ha2MeteredOn',
                  '已允许计量额度整理（会产生费用）。仍可直接发送原稿。'
                )
              : t(
                  'ha2MeteredOff',
                  '仅尝试零价模型。无可用时请勾选允许计量额度，或直接发送。'
                )
          });
        }
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

  function onInput(e) {
    var D = dock();
    if (e.target.matches && e.target.matches('[data-ha2-mat-text]')) {
      if (composing) return;
      var mid = e.target.getAttribute('data-ha2-mat-text');
      if (!mid || !D || !D.updateMaterialContent) return;
      D.updateMaterialContent(mid, { content: e.target.value }, { skipSync: true });
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
    // Page draft is not mirrored to store draft — skip onInput for it.
    if (e.target.matches && e.target.matches('[data-ha2-wb-page-draft]')) return;
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
      '[data-ha2-menu-picker],[data-ha2-picker],[data-ha2-picker-close],[data-ha2-pick-follow],[data-ha2-pick],[data-ha2-detail],[data-ha2-home],[data-ha2-action],[data-ha2-open-center],[data-ha2-go-agent],[data-ha2-habit-hub],[data-ha2-alert-action],[data-ha2-session],[data-ha2-refresh],[data-ha2-send],[data-ha2-retry],[data-ha2-organize],[data-ha2-organize-cancel],[data-ha2-pcx],[data-ha2-consult-clarify],[data-ha2-consult-confirm],[data-ha2-consult-compile],[data-ha2-consult-find],[data-ha2-consult-skip-all],[data-ha2-consult-skip],[data-ha2-consult-answer],[data-ha2-consult-adopt],[data-ha2-assist-keys],[data-ha2-atr-wb-login-open],[data-ha2-atr-wb-login],[data-ha2-atr-wb-login-cancel],[data-ha2-atr-wb-login-dismiss],[data-ha2-enable-metered],[data-ha2-remove],[data-ha2-aim-clear],[data-ha2-aim],[data-ha2-cap],[data-ha2-add],[data-ha2-mat],[data-ha2-select],[data-ha2-tm],[data-ha2-mat-expand],[data-ha2-mat-collapse],[data-ha2-wb-mode],[data-ha2-wb-transcript-toggle],[data-ha2-wb-chat-clear],[data-ha2-open-wb-config],[data-ha2-work-mode],[data-ha2-work-confirm-start],[data-ha2-work-confirm-cancel],[data-ha2-handoff-open],[data-ha2-handoff-apply],[data-ha2-handoff-cancel],[data-ha2-wb-page-back],[data-ha2-wb-page-clear],[data-ha2-wb-page-send],[data-ha2-wb-page-stop],[data-ha2-atr-open-page],[data-ha2-atr-log-toggle],[data-ha2-atr-log-copy],[data-ha2-atr-approve],[data-ha2-atr-approve-all],[data-ha2-atr-reject],[data-ha2-atr-input],[data-ha2-atr-continue],[data-ha2-atr-keep-draft],[data-ha2-atr-resume],[data-ha2-atr-abandon],[data-ha2-atr-abandon-send],[data-ha2-atr-verify-engine],[data-ha2-atr-accept-recommend],[data-ha2-atr-switch-deepseek],[data-ha2-atr-toggle-beginner],[data-ha2-atr-advanced]'
    );
    if (!tEl) return;
    var S = store();
    var D = dock();
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
      openWbChatPage();
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
      if (S && S.resumeAndDriveAgentTask) {
        S.resumeAndDriveAgentTask()
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
        openAtrEditPage(draftSend);
        S.abandonAndStartAgentTask({
          goal: draftSend,
          materialsSummary: matSumSend
        })
          .then(function (dto) {
            if (!mounted) return;
            var snapAfter = S.getSnapshot();
            var n = snapAfter && snapAfter.validationNotice;
            if (n && n.code === 'abandon_start_failed') {
              toast(
                t(
                  'ha2AtrAbandonStartFailed',
                  '旧任务已放弃，新任务未创建 — 请检查项目或引擎后重发'
                )
              );
            } else if (!dto && n && n.abandoned === false) {
              toast(n.message || t('ha2AtrPreflightFail', '未放弃旧任务：启动条件未满足'));
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
    if (tEl.hasAttribute('data-ha2-atr-input')) {
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
      wbChatTurns = [];
      saveWbChatTurns();
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
      if (S && S.setWorkMode) S.setWorkMode(tEl.getAttribute('data-ha2-work-mode'));
      if (wbChatPageOpen) paintWbChatPage();
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
    if (tEl.hasAttribute('data-ha2-picker')) {
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
      send();
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
      syncAtrWbLoginHost(S && S.getSnapshot ? S.getSnapshot() : null);
      return;
    }
    if (tEl.hasAttribute('data-ha2-enable-metered')) {
      var AssistEn = global.OneToneHomeAssistClient;
      if (AssistEn && AssistEn.setAllowMetered) {
        AssistEn.setAllowMetered(true);
        var box = root && root.querySelector('[data-ha2-allow-metered]');
        if (box) box.checked = true;
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
        openPickerSurface(
          'dock',
          root.querySelector('.ha2-chip.target[data-ha2-picker]') || tEl
        );
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

  function onPickerReposition() {
    if (!mounted || !store()) return;
    if (store().getSnapshot().pickerOpen) positionPickerPanel();
  }

  function mount(el) {
    if (mounted) return;
    root = el;
    var S = store();
    if (!S) return;
    S.mount();
    // workMode already restored from localStorage in store — do not force edit.
    ensureWbStreamListen();
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', onMatTogglePointerDown, true);
    root.addEventListener('change', onChange);
    refreshAssistReady();
    root.addEventListener('input', onInput);
    root.addEventListener('compositionstart', onCompositionStart);
    root.addEventListener('compositionend', onCompositionEnd);
    // Capture so WebView image paste is handled before textarea swallows it.
    root.addEventListener('paste', onPaste, true);
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
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
    unsubStore = S.subscribe(function (snap) {
      if (!mounted) return;
      paint(snap);
    });
    mounted = true;
    paint(S.getSnapshot());
    refreshAllAgentAims();
    refreshWbLocal(true).then(function () {
      if (!mounted) return;
      var snap = S.getSnapshot();
      syncWbModelHost((snap && snap.selectedKind) || '');
    });
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
    // Soft Pad may have changed default model while this view was hidden.
    refreshWbLocal(true).then(function () {
      if (!mounted) return;
      var snap = S && S.getSnapshot();
      syncWbModelHost((snap && snap.selectedKind) || '');
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

  global.OneToneHomeAgentV2 = {
    mount: mount,
    show: show,
    hide: hide,
    refresh: refresh,
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
