/**
 * Home Focus action policy — single primary action with real IPC handlers.
 * Quiet quick_handoff returns honest clipboard_ready | failed (no fake sent).
 * Agent icon handoff: Cursor keeps pasteClipboard; others open-only + tray paste.
 */
(function (global) {
  'use strict';

  var PROBE_LABEL = {
    cursor: 'Cursor',
    claude: 'Claude',
    minimax: 'MiniMax',
    workbuddy: 'WorkBuddy',
    trae: 'Trae Work',
    traeCode: 'Trae Code',
    qoder: 'Qoder',
    chatgpt: 'ChatGPT'
  };
  /** Homepage agent icon order. Cursor = pasteClipboard; others = Soft Pad carry. */
  var PROBE_KINDS = [
    'cursor',
    'claude',
    'chatgpt',
    'minimax',
    'workbuddy',
    'trae',
    'traeCode',
    'qoder'
  ];

  /** Probe kind → app-target preset id (icons / launch). */
  var PROBE_APP_ID = {
    cursor: 'cursor-chat',
    claude: 'claude-code',
    chatgpt: 'codex-chat',
    minimax: 'minimax-chat',
    workbuddy: 'workbuddy-chat',
    trae: 'trae-work',
    traeCode: 'trae-code',
    qoder: 'qoder-chat'
  };

  /** Cursor keeps auto-paste; all other probes are open-only + Soft Pad「粘贴」. */
  function wantsPasteClipboard(kind) {
    return canonicalKind(kind) === 'cursor';
  }

  function store() {
    return global.OneToneHomeFocusStore;
  }

  function normalizeKind(s) {
    s = String(s || '')
      .toLowerCase()
      .trim();
    if (s.indexOf('kind:') === 0) s = s.slice(5);
    return s;
  }

  /** Map provider / app-target aliases to probe / runtime kind. */
  function canonicalKind(s) {
    s = normalizeKind(s);
    if (s === 'cursor-chat' || s === 'cursor') return 'cursor';
    if (s === 'claude-code' || s === 'claude' || s === 'claude-cli') return 'claude';
    if (s === 'minimax-chat' || s === 'minimax') return 'minimax';
    if (s === 'workbuddy-chat' || s === 'workbuddy' || s === 'codebuddy') return 'workbuddy';
    if (
      s === 'trae-work' ||
      s === 'trae_work' ||
      s === 'trae-solo' ||
      s === 'traework' ||
      s === 'trae'
    ) {
      return 'trae';
    }
    if (s === 'trae-code' || s === 'trae_code' || s === 'traecode') {
      return 'traeCode';
    }
    if (s === 'qoder-chat' || s === 'qoder' || s === 'qoder-cn' || s === 'qodercn') {
      return 'qoder';
    }
    // ChatGPT desktop UI = Codex app target (ChatGPT.exe / OpenAI.Codex_*).
    if (
      s === 'chatgpt' ||
      s === 'codex' ||
      s === 'codex-chat' ||
      s === 'openai' ||
      s === 'openai-codex'
    ) {
      return 'chatgpt';
    }
    return s;
  }

  /** Inventory row kind (codex/claude/…) → probe kind used by homepage icons. */
  function inventoryKindToProbe(kind) {
    kind = normalizeKind(kind);
    if (kind === 'codex') return 'chatgpt';
    return canonicalKind(kind);
  }

  function appIdForKind(kind) {
    kind = canonicalKind(kind);
    return PROBE_APP_ID[kind] || '';
  }

  /** Agent Center stub id — chatgpt probe maps to kind:codex. */
  function syntheticAgentId(kind) {
    kind = canonicalKind(kind);
    if (kind === 'chatgpt') return 'kind:codex';
    return 'kind:' + kind;
  }

  function isProbeKind(kind) {
    kind = canonicalKind(kind);
    return PROBE_KINDS.indexOf(kind) >= 0;
  }

  function agentKindOf(agent) {
    if (!agent) return '';
    return canonicalKind(agent.runtimeKind || agent.agentId || '');
  }

  function displayNameForKind(kind) {
    kind = canonicalKind(kind);
    return PROBE_LABEL[kind] || 'Agent';
  }

  function agentCanFocus(agent) {
    if (!agent) return false;
    var acts = agent.actions || agent.availableActions || [];
    if (!acts.length) return true;
    for (var i = 0; i < acts.length; i++) {
      var id = String((acts[i] && (acts[i].id || acts[i].actionId)) || '');
      if (id === 'agent.focus' || id === 'focus' || id === 'view') {
        if (acts[i].enabled === false || acts[i].available === false) return false;
        return true;
      }
    }
    return true;
  }

  function matchFocusable(focusable, want) {
    want = canonicalKind(want);
    if (!want) return [];
    return focusable.filter(function (a) {
      return agentKindOf(a) === want;
    });
  }

  /**
   * Resolve executable agentId from Focus provider + Agent Center snapshot.
   * Never treat bare provider.id as agentId.
   * vm.handoffPreferKind / preferKind forces Cursor|MiniMax probe target.
   * @returns {{ kind: 'clipboard_focus'|'choose_agent'|'unavailable', agentId?: string, provider?: string, reason?: string }}
   */
  function resolveQuickHandoffTarget(vm, agentSnapshot) {
    var prefer = canonicalKind(
      (vm && (vm.handoffPreferKind || vm.preferKind)) || ''
    );
    var providerRaw =
      (vm && vm.dto && vm.dto.provider && vm.dto.provider.id) ||
      (vm && vm.providerId) ||
      '';
    var want = prefer || canonicalKind(providerRaw);
    var agents = (agentSnapshot && agentSnapshot.agents) || [];
    var focusable = agents.filter(function (a) {
      return a && a.agentId && agentCanFocus(a);
    });

    if (prefer) {
      var prefMatches = matchFocusable(focusable, prefer);
      if (prefMatches.length === 1) {
        return {
          kind: 'clipboard_focus',
          agentId: String(prefMatches[0].agentId),
          provider: prefer,
          reason: 'prefer_kind'
        };
      }
      if (prefMatches.length > 1) {
        return { kind: 'choose_agent', provider: prefer, reason: 'ambiguous' };
      }
      // Probe clients: still try kind:X so Agent Center can focus/launch.
      if (isProbeKind(prefer)) {
        return {
          kind: 'clipboard_focus',
          agentId: syntheticAgentId(prefer),
          provider: prefer,
          reason: 'probe_synthetic'
        };
      }
      return { kind: 'unavailable', provider: prefer, reason: 'no_match' };
    }

    if (!want) {
      if (focusable.length === 1) {
        return {
          kind: 'clipboard_focus',
          agentId: String(focusable[0].agentId),
          provider: agentKindOf(focusable[0]),
          reason: 'single_agent'
        };
      }
      if (focusable.length > 1) {
        return { kind: 'choose_agent', reason: 'no_provider' };
      }
      return { kind: 'unavailable', reason: 'no_agents' };
    }

    var matches = matchFocusable(focusable, want);

    if (matches.length === 1) {
      return {
        kind: 'clipboard_focus',
        agentId: String(matches[0].agentId),
        provider: want,
        reason: 'unique_match'
      };
    }
    if (matches.length > 1) {
      return { kind: 'choose_agent', provider: want, reason: 'ambiguous' };
    }
    return { kind: 'unavailable', provider: want, reason: 'no_match' };
  }

  function handoffLabelForCap(cap) {
    if (!cap || !cap.kind) return '复制并打开 Agent';
    if (cap.kind === 'clipboard_focus') {
      var name = displayNameForKind(cap.provider);
      return name === 'Agent' ? '复制并打开 Agent' : '复制并打开 ' + name;
    }
    if (cap.kind === 'choose_agent') return '选择 Agent';
    return '打开 Agent 总览';
  }

  function handoffActForCap(cap) {
    if (!cap || !cap.kind) return 'quick_handoff';
    if (cap.kind === 'clipboard_focus') return 'quick_handoff';
    if (cap.kind === 'choose_agent') return 'choose_agent';
    return 'open_agent_overview';
  }

  function writeClipboard(text) {
    var clip = global.navigator && global.navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      return clip.writeText(String(text || ''));
    }
    return Promise.reject(new Error('no_clipboard'));
  }

  function invokeCenter(actionId, agentId, opts) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    opts = opts || {};
    // Tauri cmd_agent_center_action takes a single `args` struct — nest like Agent Center UI.
    var body = {
      actionId: actionId,
      agentId: agentId
    };
    if (opts.pasteClipboard) body.pasteClipboard = true;
    return ipc.invoke('cmd_agent_center_action', { args: body });
  }

  /**
   * @param {string} kind
   * @param {object} vm view model from adapter
   * @param {{ openVoice?: Function, openProgress?: Function, openPick?: Function, openReason?: Function, openPrep?: Function, getDraftText?: Function, getAgentSnapshot?: Function, openAgentChooser?: Function, openAgentOverview?: Function, toast?: Function }} hooks
   */
  function execute(kind, vm, hooks) {
    hooks = hooks || {};
    vm = vm || {};
    var S = store();
    if (!kind) return Promise.resolve({ ok: false, error: 'no action' });

    if (kind === 'retry') {
      if (!S) return Promise.resolve({ ok: false, error: 'no store' });
      return S.retry();
    }
    if (kind === 'confirm_project') {
      if (!S) return Promise.resolve({ ok: false, error: 'no store' });
      return S.confirmProject({
        projectRoot: vm.projectRoot || null,
        projectId: vm.projectId || null
      });
    }
    if (kind === 'pick_project') {
      if (typeof hooks.openPick === 'function') hooks.openPick(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'view_progress') {
      if (typeof hooks.openProgress === 'function') hooks.openProgress(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'view_reason') {
      if (typeof hooks.openReason === 'function') hooks.openReason(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'resume') {
      if (!S) return Promise.resolve({ ok: false, error: 'no store' });
      var ipc = global.OneToneIpc;
      var sessionId =
        (vm.dto && vm.dto._sessionId) ||
        (global.OneToneNowHome &&
          global.OneToneNowHome.lastAgentSessionId &&
          global.OneToneNowHome.lastAgentSessionId());
      if (!sessionId && ipc && ipc.invoke) {
        return ipc
          .invoke('cmd_agent_home_snapshot', {})
          .then(function (snap) {
            var id =
              (snap && snap.activeSession && snap.activeSession.sessionId) ||
              (snap && snap.checkpoint && snap.checkpoint.sessionId) ||
              '';
            if (!id) return { ok: false, error: 'no session' };
            return S.resumeCheckpoint(id);
          });
      }
      if (!sessionId) return Promise.resolve({ ok: false, error: 'no session' });
      return S.resumeCheckpoint(sessionId);
    }
    if (kind === 'open_prep' || kind === 'start_task') {
      if (typeof hooks.openPrep === 'function') {
        hooks.openPrep(vm);
        return Promise.resolve({ ok: true, kind: kind });
      }
      var Prep = global.OneToneHomePromptPrep;
      if (Prep && Prep.expand) {
        Prep.expand();
        return Promise.resolve({ ok: true, kind: kind });
      }
      if (typeof hooks.openVoice === 'function') hooks.openVoice(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'choose_agent' || kind === 'open_agent_overview') {
      if (typeof hooks.openAgentOverview === 'function') {
        hooks.openAgentOverview(vm);
      } else if (typeof hooks.openAgentChooser === 'function') {
        hooks.openAgentChooser(vm);
      } else if (typeof hooks.openProgress === 'function') {
        hooks.openProgress(vm);
      }
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'quiet_paste_text') {
      if (typeof hooks.pasteTextIntoDraft === 'function') {
        return Promise.resolve(hooks.pasteTextIntoDraft()).then(function () {
          return { ok: true, kind: kind };
        });
      }
      return Promise.resolve({ ok: false, error: 'no_paste_hook' });
    }
    if (kind === 'quick_handoff') {
      var Prep = global.OneToneHomePromptPrep;
      var draftText =
        typeof hooks.getDraftText === 'function' ? String(hooks.getDraftText() || '') : '';
      if (Prep && typeof Prep.setDraftBody === 'function' && draftText) {
        try {
          Prep.setDraftBody(draftText, { skipSync: true });
        } catch (_) {}
      }

      var assembled = null;
      var text = '';
      var truncated = false;
      if (Prep && typeof Prep.ensureAssembled === 'function') {
        try {
          assembled = Prep.ensureAssembled();
          text = String((assembled && assembled.md) || '');
          truncated = !!(assembled && assembled.truncated);
        } catch (_) {
          text = draftText;
        }
      } else {
        text = draftText;
      }

      if (!text.trim()) {
        return Promise.resolve({
          outcome: 'failed',
          agentId: null,
          sessionId: null,
          lifecycleCreated: false,
          message: '输入为空',
          ok: false,
          error: 'empty'
        });
      }
      if (hooks.preferKind || hooks.handoffPreferKind) {
        vm = Object.assign({}, vm, {
          handoffPreferKind: hooks.preferKind || hooks.handoffPreferKind
        });
      }
      var snap =
        typeof hooks.getAgentSnapshot === 'function' ? hooks.getAgentSnapshot() : null;
      var cap = resolveQuickHandoffTarget(vm, snap);
      var targetName = displayNameForKind(cap.provider);
      if (cap.kind === 'choose_agent') {
        if (typeof hooks.openAgentChooser === 'function') hooks.openAgentChooser(vm);
        else if (typeof hooks.openAgentOverview === 'function') hooks.openAgentOverview(vm);
        return Promise.resolve({
          outcome: 'failed',
          agentId: null,
          sessionId: null,
          lifecycleCreated: false,
          message: '请先选择 Agent',
          ok: false,
          error: 'choose_agent'
        });
      }
      if (cap.kind === 'unavailable' || !cap.agentId) {
        if (typeof hooks.openAgentOverview === 'function') hooks.openAgentOverview(vm);
        var missMsg =
          targetName !== 'Agent'
            ? '没有可用的 ' + targetName
            : '没有可用的 Agent 目标';
        return Promise.resolve({
          outcome: 'failed',
          agentId: null,
          sessionId: null,
          lifecycleCreated: false,
          message: missMsg,
          ok: false,
          error: 'unavailable'
        });
      }

      var usePaste = wantsPasteClipboard(cap.provider);
      var focused = false;
      var focusDetail = '';
      return writeClipboard(text)
        .catch(function () {
          return Promise.reject(new Error('clipboard_failed'));
        })
        .then(function () {
          if (Prep && typeof Prep.setCarryActive === 'function') {
            return Prep.setCarryActive(cap.provider || null);
          }
        })
        .then(function () {
          if (Prep && typeof Prep.archiveHandoff === 'function') {
            try {
              Prep.archiveHandoff({
                targetKind: cap.provider || null,
                outcome: 'clipboard_ready'
              });
            } catch (_) {}
          }
          // Toast before focus — agent.window steals FG and hides main-window toasts.
          if (typeof hooks.toast === 'function') {
            hooks.toast(
              usePaste
                ? '内容已就绪 · 正在打开 ' + targetName + '…'
                : '内容已就绪 · 正在打开 ' +
                    targetName +
                    ' · 下方可预览并粘贴',
              'scheme'
            );
          }
          var focusOpts = usePaste ? { pasteClipboard: true } : { pasteClipboard: false };
          return invokeCenter('agent.focus', cap.agentId, focusOpts)
            .then(function (res) {
              focusDetail = String((res && (res.detail || res.error)) || '');
              focused = !!(
                res &&
                (res.ok ||
                  res.outcome === 'verified' ||
                  res.outcome === 'attemptedUnverified' ||
                  res.outcome === 'attempted_unverified')
              );
              if (
                !focused &&
                res &&
                /composer_miss|window_focus|input_not_found/i.test(focusDetail)
              ) {
                focused = true;
              }
            })
            .catch(function () {
              focused = false;
            });
        })
        .then(function () {
          var pasted = usePaste && /composer_pasted:|chat_pasted:|paste=true/i.test(focusDetail);
          var composerMiss =
            usePaste &&
            /composer_focus_failed|composer_miss|paste=false|paste_failed/i.test(focusDetail);
          var message;
          if (!focused) {
            message =
              '内容已复制，但未能打开 ' +
              targetName +
              (usePaste ? '，请手动切换后粘贴' : '；下方「粘贴」仍可用');
          } else if (usePaste) {
            message = pasted
              ? '已粘贴到 ' + targetName + ' 输入框，请确认发送'
              : composerMiss
                ? '已打开 ' +
                  targetName +
                  '，请点输入框后按下方「粘贴」或 Ctrl+V'
                : '已打开 ' + targetName + '，请 Ctrl+V 粘贴并确认发送';
          } else {
            message =
              '已打开 ' + targetName + ' · 点输入框后按下方「粘贴」';
          }
          if (truncated) {
            message = '装订已截断 · ' + message;
          }
          var manualN =
            Prep && typeof Prep.getMaterialSummary === 'function'
              ? Number((Prep.getMaterialSummary() || {}).manualUploadCount) || 0
              : 0;
          if (manualN > 0) {
            message += ' · 本地图片不上传图床，请自行附上';
          }
          if (typeof hooks.toast === 'function') {
            hooks.toast(message, focused ? 'scheme' : 'warn');
          }
          return {
            outcome: 'clipboard_ready',
            agentId: cap.agentId,
            provider: cap.provider || null,
            sessionId: null,
            lifecycleCreated: false,
            focused: focused,
            pasteClipboard: usePaste,
            truncated: truncated,
            message: message,
            ok: true,
            kind: 'quick_handoff'
          };
        })
        .catch(function (err) {
          var msg =
            err && err.message === 'clipboard_failed'
              ? '无法写入剪贴板'
              : (err && err.message) || '交给 Agent 失败';
          if (typeof hooks.toast === 'function') hooks.toast(msg, 'warn');
          return {
            outcome: 'failed',
            agentId: cap.agentId || null,
            sessionId: null,
            lifecycleCreated: false,
            message: msg,
            ok: false,
            error: msg
          };
        });
    }
    // v1 canvas aliases
    if (kind === 'decide') return execute('view_progress', vm, hooks);
    if (kind === 'continue') return execute('resume', vm, hooks);
    if (kind === 'restore') {
      var restoreKind =
        (vm.primary && vm.primary.id) ||
        (vm.projectRoot ? 'confirm_project' : 'pick_project');
      return execute(restoreKind, vm, hooks);
    }
    return Promise.resolve({ ok: false, error: 'unknown kind' });
  }

  /** Prefer backend nextAction; never invent a second primary. */
  function primaryFromVm(vm) {
    if (!vm || !vm.primary) return null;
    return vm.primary;
  }

  global.OneToneHomeActionPolicy = {
    execute: execute,
    primaryFromVm: primaryFromVm,
    resolveQuickHandoffTarget: resolveQuickHandoffTarget,
    handoffLabelForCap: handoffLabelForCap,
    handoffActForCap: handoffActForCap,
    canonicalKind: canonicalKind,
    inventoryKindToProbe: inventoryKindToProbe,
    appIdForKind: appIdForKind,
    syntheticAgentId: syntheticAgentId,
    displayNameForKind: displayNameForKind,
    agentCanFocus: agentCanFocus,
    isProbeKind: isProbeKind,
    wantsPasteClipboard: wantsPasteClipboard,
    PROBE_KINDS: PROBE_KINDS.slice()
  };
})(typeof window !== 'undefined' ? window : globalThis);
