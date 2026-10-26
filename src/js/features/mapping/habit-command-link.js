/**
 * Habit command × channel matching — single projection + L7/L3 write APIs.
 * UI consumers must use buildModel only; phrase/pad writes go through this module.
 */
(function (global) {
  'use strict';

  var MATCH_CHANNELS = { voice: 1, key: 1, softPad: 1, camera: 1 };
  var DEFAULT_PAD_KEYS = [
    'AG00', 'AG01', 'AG02', 'AG03', 'AG04', 'AG05', 'AG06', 'AG07', 'AG08',
    '7', '8', '9', '4', '5', '6', '1', '2', '3', '0', 'ESC', 'FN', 'ENC'
  ];
  var GESTURE_OPTS = [
    { id: 'okHand', label: 'OK 手势' },
    { id: 'wave', label: '挥手' },
    { id: 'blink', label: '眨眼' },
    { id: 'deliberateBlink', label: '故意眨眼' },
    { id: 'openPalm', label: '张开手掌' },
    { id: 'fist', label: '握拳' },
    { id: 'shakeHead', label: '摇头' },
    { id: 'onAway', label: '离开' },
    { id: 'onReturn', label: '回来' }
  ];
  var CAM_OVERRIDE_ACTION_KEYS = {
    okHand: 1,
    wave: 1,
    blink: 1,
    deliberateBlink: 1,
    openPalm: 1,
    fist: 1,
    shakeHead: 1,
    onAway: 1,
    onReturn: 1
  };
  var ACTION_LABEL_FALLBACK = {
    pressEsc: '按 Esc 取消',
    pressCtrlI: '按 Ctrl+I',
    cancel: '取消',
    cancelListen: '取消',
    none: '',
    continueReply: '继续回复',
    continue: '继续',
    newThread: '新建对话',
    openTerminal: '打开终端',
    commandPalette: '命令菜单',
    quickSearch: '快速搜索',
    quickChat: '快速聊天',
    pasteAndSend: '粘贴发送',
    pasteSend: '粘贴发送',
    pushToTalk: '说话',
    startDictation: '开始听写',
    stopOrSend: '发送',
    stopOrSendDictation: '结束或发送',
    'input.start': '开始听写',
    'input.cancel': '取消本轮',
    'input.commit': '完成本轮',
    'input.pause': '暂停听写',
    'input.send': '发送',
    'app.shortcut': '应用快捷键',
    'app.open': '打开应用'
  };
  /** One-step undo for the last Soft Pad / key / gesture / phrase write in this page. */
  var lastBindUndo = null;
  var CATEGORY_LABELS = {
    input: '控制输入',
    agent: '控制当前 Agent',
    decision: '确认或拒绝',
    session: '会话与状态',
    system: '应用与界面'
  };
  /**
   * 方案 B · 角色（与通道正交）：
   * talk=对话控制 · cursorKey=Cursor 快捷键 · slash=斜杠指令 · softPad=Soft Pad 原生
   */
  var CAPABILITY_KIND_ORDER = ['talk', 'cursorKey', 'slash', 'softPad'];
  var CAPABILITY_KIND_LABELS = {
    talk: '对话控制',
    cursorKey: 'Cursor 快捷键',
    slash: '斜杠指令',
    softPad: 'Soft Pad 原生'
  };
  /**
   * 习惯列表分区：按「我现在在干什么」场景分（听写/对话中/控 Agent/找入口/本应用）。
   * 不用 Cursor 键位桶。默认只展开一个分区，点 summary 换开。
   */
  var HABIT_SECTION_ORDER = ['dictate', 'chat', 'agent', 'find', 'app'];
  var HABIT_SECTION_LABELS = {
    dictate: '听写',
    chat: '对话中',
    agent: '控 Agent',
    find: '找入口',
    app: '本应用'
  };
  var HABIT_SECTION_SLOTS = {
    dictate: {
      pushToTalk: 1,
      stopOrSend: 1,
      stopOrSendDictation: 1,
      pasteAndSend: 1,
      pasteSend: 1,
      cancel: 1,
      cancelListen: 1,
      startDictation: 1,
      'input.start': 1,
      'input.pause': 1,
      'input.cancel': 1,
      'input.commit': 1,
      'input.send': 1
    },
    chat: {
      newThread: 1,
      quickChat: 1,
      focusComposer: 1,
      continueReply: 1,
      continue: 1,
      openAgent: 1,
      'agent.focus': 1,
      'agent.continue': 1,
      'agent.retry': 1
    },
    agent: {
      modeMenu: 1,
      plan: 1,
      switchAgent: 1,
      status: 1,
      switchModel: 1,
      claudeModel: 1,
      review: 1,
      'agent.status': 1,
      'agent.interrupt': 1,
      'agent.approve': 1,
      'agent.reject': 1,
      'agent.respond': 1,
      acceptTab: 1,
      nextChange: 1,
      prevChange: 1,
      acceptChanges: 1,
      acceptAllChanges: 1,
      summarizeDiff: 1
    },
    find: {
      quickSearch: 1,
      commandPalette: 1,
      inlineEdit: 1,
      openTerminal: 1,
      openReviewTab: 1,
      toggleReviewPanel: 1,
      toggleSidebar: 1
    },
    app: {
      runChecks: 1,
      undo: 1,
      openSettings: 1,
      navBack: 1,
      navForward: 1,
      newBrowserTab: 1,
      focusBrowserAddressBar: 1,
      toggleBrowserPanel: 1
    }
  };
  var CURSOR_KEY_FAMILY_ORDER = ['agentMode', 'editorShell'];
  var CURSOR_KEY_FAMILY_LABELS = {
    agentMode: 'Agent 模式键',
    editorShell: '编辑器壳'
  };
  /** Cursor 模式热键（非斜杠）— Soft Pad isSoftPadInsertOnlySlot 同源 */
  var CURSOR_MODE_IDS = {
    plan: 1,
    switchAgent: 1,
    quickChat: 1
  };
  /** VS Code / Cursor 编辑器壳快捷键白名单 */
  var CURSOR_SHELL_IDS = {
    openTerminal: 1,
    commandPalette: 1,
    quickSearch: 1,
    undo: 1,
    toggleSidebar: 1,
    openSettings: 1,
    navBack: 1,
    navForward: 1,
    newBrowserTab: 1,
    focusBrowserAddressBar: 1,
    toggleBrowserPanel: 1,
    openReviewTab: 1,
    toggleReviewPanel: 1
  };
  var TALK_IDS = {
    continueReply: 1,
    continue: 1,
    cancel: 1,
    newThread: 1,
    openAgent: 1,
    focusComposer: 1,
    'agent.focus': 1,
    'agent.continue': 1,
    'agent.interrupt': 1,
    'agent.retry': 1,
    'agent.status': 1
  };
  var AGENT_CAP_IDS = TALK_IDS;
  var CATEGORY_FALLBACK = {
    startDictation: 'input',
    stopOrSendDictation: 'input',
    pasteAndSend: 'input',
    runTargetSequence: 'input',
    cancel: 'input',
    'input.start': 'input',
    'input.pause': 'input',
    'input.cancel': 'input',
    'input.commit': 'input',
    'input.send': 'input',
    openAgent: 'agent',
    focusComposer: 'agent',
    status: 'agent',
    plan: 'agent',
    review: 'agent',
    switchAgent: 'agent',
    switchModel: 'agent',
    claudeModel: 'agent',
    continueReply: 'agent',
    'agent.focus': 'agent',
    'agent.continue': 'agent',
    'agent.interrupt': 'agent',
    'agent.retry': 'agent',
    'agent.status': 'agent',
    permissions: 'decision',
    'agent.approve': 'decision',
    'agent.reject': 'decision',
    'agent.respond': 'decision',
    'choice.select': 'decision',
    newThread: 'session',
    continue: 'agent',
    continueReply: 'agent',
    stopOrSend: 'input',
    pushToTalk: 'input',
    cancelListen: 'input',
    summonCodex: 'agent',
    pasteSend: 'input',
    'session.new': 'session',
    'session.next': 'session',
    undo: 'system',
    quickSearch: 'system',
    quickChat: 'system',
    commandPalette: 'system',
    openReviewTab: 'system',
    toggleReviewPanel: 'system',
    toggleSidebar: 'system',
    openSettings: 'system',
    navBack: 'system',
    navForward: 'system',
    openTerminal: 'system',
    toggleBrowserPanel: 'system',
    newBrowserTab: 'system',
    focusBrowserAddressBar: 'system',
    appsOrPlugins: 'system',
    'app.open': 'system',
    'app.shortcut': 'system',
    'onetone.pause': 'system',
    'onetone.resume': 'system',
    'overlay.toggle': 'system',
    'status.read': 'system',
    'workspace.applyLayout': 'system'
  };

  function state() {
    return (global.OneToneState && global.OneToneState.state) || {};
  }

  function ui() {
    return (global.OneToneState && global.OneToneState.ui) || {};
  }

  function esc(s) {
    if (global.OneToneDom && global.OneToneDom.esc) return global.OneToneDom.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function asPlainLabel(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string' || typeof v === 'number') {
      var s0 = String(v).trim();
      return s0 === '[object Object]' ? '' : s0;
    }
    if (typeof v === 'object') {
      if (v.zh || v.en) return String(v.zh || v.en || '').trim();
      if (v.label) return asPlainLabel(v.label);
      if (v.name) return asPlainLabel(v.name);
    }
    return '';
  }

  function gestureTitle(bindKey) {
    var id = String(bindKey || '').trim();
    var i;
    for (i = 0; i < GESTURE_OPTS.length; i++) {
      if (GESTURE_OPTS[i].id === id) return GESTURE_OPTS[i].label;
    }
    return '';
  }

  function fallbackActionLabel(actionId) {
    var id = String(actionId || '').trim();
    if (!id || id === '[object Object]') return '';
    if (ACTION_LABEL_FALLBACK[id]) return ACTION_LABEL_FALLBACK[id];
    if (id.indexOf('agent:') === 0) return fallbackActionLabel(id.slice(6));
    if (id.indexOf('soft:') === 0 || id.indexOf('prompt:') === 0) {
      return fallbackActionLabel(id.slice(id.indexOf(':') + 1));
    }
    return '';
  }

  function canonical(actionId) {
    var A = global.OneToneAgentActions;
    if (A && A.resolveCanonicalActionId) return A.resolveCanonicalActionId(actionId);
    return String(actionId || '').trim();
  }

  function actionLabel(actionId) {
    var store = global.OneToneSemanticActionStore;
    if (store && store.entryMeta) {
      var meta = store.entryMeta(actionId);
      if (meta) {
        var en = false;
        try {
          if (global.OneToneI18n && global.OneToneI18n.lang) en = /^en/i.test(String(global.OneToneI18n.lang()));
        } catch (_) {}
        var fromMeta = asPlainLabel(!en ? meta.labelZh || meta.labelEn : meta.labelEn || meta.labelZh);
        if (fromMeta) return fromMeta;
      }
    }
    var A = global.OneToneAgentActions;
    if (A && A.labelForActionId) {
      var L = asPlainLabel(A.labelForActionId(actionId));
      if (L) return L;
    }
    if (A && A.actionById) {
      var def = A.actionById(actionId);
      if (def) {
        var fromDef = asPlainLabel(def.labelZh || def.label || (def.label && def.label.zh));
        if (fromDef) return fromDef;
      }
    }
    var fb = fallbackActionLabel(actionId);
    if (fb) return fb;
    var raw = String(actionId || '').trim();
    if (!raw || raw === '[object Object]') return '—';
    // camelCase tech id without catalog → still show raw only as last resort
    return raw;
  }

  function softInnerId(slotId) {
    var sid = String(slotId || '').trim();
    if (sid.indexOf('soft:') === 0 || sid.indexOf('prompt:') === 0) return sid.slice(sid.indexOf(':') + 1);
    return '';
  }

  function looksTechLabel(lab) {
    var s = String(lab || '').trim();
    if (!s) return false;
    if (/^(soft|prompt|action|semantic|bind|pad|cam):/i.test(s)) return true;
    if (/^[a-z]+[A-Z][a-zA-Z0-9.]*$/.test(s)) return true;
    return false;
  }

  /** soft:stopOrSend / stopOrSend → 发送 (ORAL_SOFT_SLOTS + fallback). */
  function softSlotDisplayName(raw) {
    var id = String(raw || '').trim();
    if (!id) return '';
    var Oral = global.OneToneOralCommandUi;
    var i;
    if (Oral && Array.isArray(Oral.ORAL_SOFT_SLOTS)) {
      for (i = 0; i < Oral.ORAL_SOFT_SLOTS.length; i++) {
        var d = Oral.ORAL_SOFT_SLOTS[i];
        if (!d) continue;
        if (d.id === id || d.slotId === id || (d.slotId && 'soft:' + d.slotId === id)) {
          var n = String(d.name || '').trim();
          if (n && !looksTechLabel(n)) return n;
        }
      }
    }
    var inner = softInnerId(id) || id;
    if (inner.indexOf('semantic:') === 0) {
      var parts = inner.split(':');
      if (parts.length >= 3) inner = parts.slice(2).join(':');
    }
    return fallbackActionLabel(inner) || fallbackActionLabel(id) || '';
  }

  /** Soft Pad micro → owning slotId (enabled route only). */
  function padKeyOwnerSlot(mapping, microKeyId) {
    var micro = String(microKeyId || '').trim();
    if (!micro) return '';
    var keys =
      mapping && mapping.codexMicroPad && Array.isArray(mapping.codexMicroPad.keys)
        ? mapping.codexMicroPad.keys
        : [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!k || k.enabled === false) continue;
      if (String(k.microKeyId || '').trim() !== micro) continue;
      var sid = String(k.slotId || '').trim();
      if (sid) return sid;
    }
    return '';
  }

  function padBindDisplayName(mapping, slotOrRef) {
    var ref = String(slotOrRef || '').trim();
    if (!ref) return '';
    var cmd = resolveCommandRef(mapping, ref);
    if (cmd) {
      var lab =
        asPlainLabel(cmd.label) ||
        softSlotDisplayName(cmd.padSlotId || cmd.slotId) ||
        actionLabel(cmd.actionId);
      if (lab && !looksTechLabel(lab)) return lab;
    }
    return softSlotDisplayName(ref) || actionLabel(ref) || '';
  }

  /**
   * Confirm only when stealing a micro from another command.
   * Empty key / own key / clear → resolve true without dialog.
   */
  function confirmStealPadKey(mapping, focusSlot, microKeyId) {
    var micro = String(microKeyId || '').trim();
    var focus = String(focusSlot || '').trim();
    if (!micro || !focus) return Promise.resolve(true);
    var owner = padKeyOwnerSlot(mapping, micro);
    if (!owner || owner === focus) return Promise.resolve(true);
    var focusCmd = resolveCommandRef(mapping, focus);
    var focusPad = String(
      (focusCmd && (focusCmd.padSlotId || focusCmd.slotId)) || focus
    ).trim();
    if (owner === focusPad) return Promise.resolve(true);
    var fromName = padBindDisplayName(mapping, owner) || '其它命令';
    var toName = padBindDisplayName(mapping, focus) || '当前命令';
    var msg = '「' + fromName + '」已占用此键。改绑给「' + toName + '」？';
    var confirmApi = global.OneToneConfirm;
    if (confirmApi && typeof confirmApi.ask === 'function') {
      return confirmApi.ask(msg, { title: '替换 Soft Pad 键', fallback: msg });
    }
    try {
      return Promise.resolve(!!global.confirm(msg));
    } catch (_) {
      return Promise.resolve(false);
    }
  }

  function toastMsg(msg) {
    try {
      if (global.OneToneAppToast && typeof global.OneToneAppToast.show === 'function') {
        global.OneToneAppToast.show(msg);
        return;
      }
      if (global.OneToneUiFeedback && typeof global.OneToneUiFeedback.toast === 'function') {
        global.OneToneUiFeedback.toast(msg);
      }
    } catch (_) {}
  }

  function setLastBindUndo(entry) {
    lastBindUndo = entry || null;
  }

  function clearLastBindUndo() {
    lastBindUndo = null;
  }

  function snapshotSoftPadState(mapping) {
    var pad = mapping && mapping.codexMicroPad;
    return {
      keys: JSON.parse(JSON.stringify((pad && Array.isArray(pad.keys) && pad.keys) || [])),
      binds: JSON.parse(
        JSON.stringify(
          ((mapping && mapping.agentBindings) || []).filter(function (b) {
            return b && String(b.triggerType || '') === 'softPad';
          })
        )
      )
    };
  }

  function restoreSoftPadState(mapping, snap) {
    if (!mapping || !snap) return Promise.resolve(false);
    var pad = ensurePad(mapping);
    pad.keys = JSON.parse(JSON.stringify(snap.keys || []));
    mapping.agentBindings = (mapping.agentBindings || []).filter(function (b) {
      return !(b && String(b.triggerType || '') === 'softPad');
    }).concat(JSON.parse(JSON.stringify(snap.binds || [])));
    return persistMapping('habitCommandLink.padUndo');
  }

  function actionExecMode(actionId) {
    var aid = canonical(actionId);
    var A = global.OneToneAgentActions;
    if (A && A.actionById) {
      var def = A.actionById(aid);
      if (def && def.mode) return String(def.mode);
    }
    return '';
  }

  /** semantic:key:plan → plan；soft:continue → continue */
  function actionSlotToken(cmd) {
    var aid = canonical((cmd && cmd.actionId) || '');
    var sid = String((cmd && cmd.slotId) || '').trim();
    if (sid.indexOf('semantic:') === 0) {
      var parts = sid.split(':');
      if (parts.length >= 3) return canonical(parts.slice(2).join(':')) || aid;
    }
    var soft = softInnerId(sid);
    if (soft) return soft;
    return aid || sid;
  }

  function resolveCursorKeyFamily(token) {
    var id = String(token || '').trim();
    if (CURSOR_MODE_IDS[id]) return 'agentMode';
    if (CURSOR_SHELL_IDS[id]) return 'editorShell';
    return '';
  }

  /**
   * 方案 B 角色（与通道图标正交）：
   * softPad · cursorKey（白名单）· slash（真 insertOnly）· talk（对话推进）。
   */
  function resolveCapabilityKind(cmd) {
    if (!cmd) return 'talk';
    var aid = canonical(cmd.actionId || '');
    var sid = String(cmd.slotId || '').trim();
    var token = actionSlotToken(cmd);
    if (sid.indexOf('soft:') === 0 || sid.indexOf('prompt:') === 0) return 'softPad';
    var family = resolveCursorKeyFamily(token) || resolveCursorKeyFamily(aid);
    if (family) return 'cursorKey';
    // 已绑键且落在 Cursor 默认和弦表 → 仍算 Cursor 快捷键
    var hasKey = !!(cmd.key && cmd.key.enabled);
    if (hasKey) {
      var A = global.OneToneAgentActions;
      var defChord = '';
      if (A && A.defaultCursorKeyForSlot) defChord = String(A.defaultCursorKeyForSlot(token) || '').trim();
      if (!defChord && A && A.defaultVscodeKeyForSlot) {
        defChord = String(A.defaultVscodeKeyForSlot(token) || '').trim();
      }
      if (defChord && !TALK_IDS[token] && !TALK_IDS[aid]) return 'cursorKey';
    }
    var mode = actionExecMode(aid) || actionExecMode(token);
    if (mode === 'insertOnly') return 'slash';
    if (TALK_IDS[token] || TALK_IDS[aid] || aid.indexOf('agent.') === 0) return 'talk';
    var hasOral = !!(cmd.oral && cmd.oral.enabled);
    var hasPad = !!(cmd.pad && cmd.pad.enabled);
    var hasGest = !!(cmd.gesture && cmd.gesture.enabled);
    if (hasPad && !hasOral && !hasKey) return 'softPad';
    if (hasGest && !hasOral && !hasKey && !hasPad) return 'talk';
    if (hasOral) return 'talk';
    return 'talk';
  }

  function attachCursorKeyFamily(cmd) {
    if (!cmd || cmd.capabilityKind !== 'cursorKey') {
      if (cmd) cmd.cursorKeyFamily = '';
      return cmd;
    }
    var token = actionSlotToken(cmd);
    var fam = resolveCursorKeyFamily(token) || resolveCursorKeyFamily(canonical(cmd.actionId || ''));
    if (!fam) fam = 'editorShell';
    cmd.cursorKeyFamily = fam;
    return cmd;
  }

  /** Habit list section — scene buckets (dictate/chat/agent/find/app). */
  function listSection(cmd) {
    var cat = String((cmd && cmd.category) || '').trim();
    if (cat === 'decision') return 'agent';
    if (cat === 'session') return 'chat';
    if (cat === 'input') return 'dictate';
    var aid = canonical((cmd && cmd.actionId) || '');
    var token = actionSlotToken(cmd) || aid;
    var soft = softInnerId((cmd && cmd.slotId) || '');
    var i;
    for (i = 0; i < HABIT_SECTION_ORDER.length; i++) {
      var sec = HABIT_SECTION_ORDER[i];
      var slots = HABIT_SECTION_SLOTS[sec];
      if (!slots) continue;
      if ((token && slots[token]) || (aid && slots[aid]) || (soft && slots[soft])) return sec;
    }
    if (soft === 'continue' || soft === 'newThread') return 'chat';
    if (soft === 'cancel' || soft === 'cancelListen' || soft === 'pushToTalk') return 'dictate';
    var kind = String((cmd && cmd.capabilityKind) || '').trim();
    if (kind === 'talk') return 'chat';
    if (kind === 'slash') return 'agent';
    if (CURSOR_MODE_IDS[token] || CURSOR_MODE_IDS[aid]) return 'agent';
    if (
      token === 'commandPalette' ||
      token === 'quickSearch' ||
      token === 'inlineEdit' ||
      token === 'openTerminal'
    ) {
      return 'find';
    }
    return 'app';
  }

  function resolveCategory(cmd) {
    var aid = canonical((cmd && cmd.actionId) || '');
    var sid = String((cmd && cmd.slotId) || '').trim();
    var softInner = softInnerId(sid);
    var store = global.OneToneSemanticActionStore;
    if (store && store.entryMeta) {
      var meta =
        store.entryMeta(aid) ||
        store.entryMeta(softInner) ||
        store.entryMeta(sid);
      var cat = meta && String(meta.category || '').trim();
      if (cat && CATEGORY_LABELS[cat]) return cat;
    }
    if (aid && CATEGORY_FALLBACK[aid]) return CATEGORY_FALLBACK[aid];
    if (softInner && CATEGORY_FALLBACK[softInner]) return CATEGORY_FALLBACK[softInner];
    if (aid.indexOf('input.') === 0) return 'input';
    if (aid.indexOf('agent.') === 0) {
      if (aid === 'agent.approve' || aid === 'agent.reject' || aid === 'agent.respond') return 'decision';
      return 'agent';
    }
    if (aid.indexOf('session.') === 0) return 'session';
    // Soft Pad / oral soft slots: 未知口令类默认控制输入；勿一刀切全进 input
    if (softInner) return 'input';
    if (sid.indexOf('cam:') === 0) return 'system';
    return 'system';
  }

  /**
   * List-row summary: bound channel values (oral / key / pad / gesture).
   * Empty → caller hides the meta line. Never echo the command title.
   */
  function channelMetaLabel(cmd) {
    var title = String((cmd && cmd.label) || '')
      .trim()
      .toLowerCase();
    function distinct(v) {
      var s = String(v || '').trim();
      if (!s) return '';
      if (title && s.toLowerCase() === title) return '';
      return s;
    }
    var parts = [];
    if (cmd && cmd.oral && cmd.oral.enabled && cmd.oral.say) {
      var say = String(cmd.oral.say)
        .split(/[、,，;\s]+/)
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean)[0];
      say = distinct(say);
      if (say) parts.push(say);
    }
    if (cmd && cmd.key && cmd.key.enabled && cmd.key.chord) {
      var chord = distinct(cmd.key.chord);
      if (chord) parts.push(chord);
    }
    if (cmd && cmd.pad && cmd.pad.enabled && cmd.pad.microKeyId) {
      var pad = distinct(cmd.pad.microKeyId);
      if (pad) parts.push(pad);
    }
    if (cmd && cmd.gesture && cmd.gesture.enabled && cmd.gesture.bindingRef) {
      var gest = distinct(gestureTitle(cmd.gesture.bindingRef) || cmd.gesture.bindingRef);
      if (gest) parts.push(gest);
    }
    return parts.join(' · ');
  }

  function customShortcutTitle(mapping, id) {
    id = String(id || '').trim();
    if (!id) return '';
    var pad = mapping && mapping.codexMicroPad;
    var list = pad && Array.isArray(pad.customShortcuts) ? pad.customShortcuts : [];
    var i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id || '') === id) {
        return String(list[i].name || list[i].chord || '').trim();
      }
    }
    return '';
  }

  function bindingDisplayLabel(b, aid) {
    var args = (b && (b.actionArgs || b.action_args)) || null;
    var fromArgs = args
      ? String(args.name || args.title || args.label || args.chord || '').trim()
      : '';
    if (fromArgs) return fromArgs;
    var sid = String((b && (b.slotId || b.slot_id)) || '').trim();
    var inst = String((b && (b.actionInstanceId || b.action_instance_id)) || '').trim();
    // caller may pass mapping via b.__mapping — avoid; use trigger as last resort
    var trig = String((b && (b.triggerBinding || b.trigger_binding)) || '').trim();
    if ((aid === 'app.shortcut' || aid === 'app.open') && trig) return trig;
    if (sid || inst) {
      /* titles resolved later with mapping in refineCommandLabel */
    }
    return '';
  }

  /**
   * Soft Pad / Cursor 布局种子与仅按键的 app.shortcut 不进习惯列表：
   * 习惯页管「怎么调用」；这些由 Soft Pad / 按键页管，且会刷出十几条同名「应用快捷键」。
   */
  function isHabitListNoise(c) {
    if (!c) return true;
    var aid = String(c.actionId || '');
    var sid = String(c.slotId || '');
    var inst = String(c.actionInstanceId || '');
    if (
      /^cursorBeginner/i.test(aid) ||
      /^cursorBeginner/i.test(sid) ||
      /^cursorBeginner/i.test(inst) ||
      /^cursorBeginner/i.test(String(c.label || ''))
    ) {
      return true;
    }
    if (aid === 'agent.continue' || sid === 'agent.continue') return true;
    var hasOral = !!(c.oral && c.oral.enabled);
    var hasPad = !!(c.pad && c.pad.enabled);
    var hasGest = !!(c.gesture && c.gesture.enabled);
    var hasKey = !!(c.key && c.key.enabled);
    // Soft Pad / Keys 管：仅按键的应用快捷键（同名刷屏）
    if ((aid === 'app.shortcut' || aid === 'app.open') && !hasOral && !hasPad && !hasGest) {
      return true;
    }
    // Soft Pad custom_*：无口头说法时不进习惯列表
    if ((/^custom_/i.test(sid) || /^custom_/i.test(inst)) && !hasOral) return true;
    // Soft Pad 裸布局键：仅 Pad、非 soft: 口令
    if (hasPad && !hasOral && !hasKey && !hasGest && sid.indexOf('soft:') !== 0) {
      return true;
    }
    return false;
  }

  function refineCommandLabel(c, mapping) {
    var lab = asPlainLabel(c && c.label);
    var aid = String((c && c.actionId) || '');
    var sid = String((c && c.slotId) || '');
    if (!lab || lab === '[object Object]' || lab === '—') lab = '';
    if (aid === 'app.shortcut' || aid === 'app.open') {
      var named =
        customShortcutTitle(mapping, c.slotId) ||
        customShortcutTitle(mapping, c.actionInstanceId) ||
        '';
      if (named) return named;
      if (c.oral && c.oral.say) {
        var first = String(c.oral.say)
          .split(/[、,，;\s]+/)
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean)[0];
        if (first) return first;
      }
      if (c.key && c.key.chord) return c.key.chord;
      if (c.actionArgs && c.actionArgs.chord) return String(c.actionArgs.chord).trim();
    }
    var softName =
      softSlotDisplayName(sid) || softSlotDisplayName(lab) || softSlotDisplayName(aid) || '';
    if (softName && (!lab || looksTechLabel(lab) || lab === sid || lab === aid)) return softName;
    var fb = fallbackActionLabel(aid) || fallbackActionLabel(sid);
    if (fb && (!lab || lab === aid || lab === sid || looksTechLabel(lab))) return fb;
    // camelCase / soft: 技术 id 不当标题
    if (lab && looksTechLabel(lab)) {
      var better = softName || actionLabel(aid) || fb;
      if (better && better !== lab && !looksTechLabel(better)) return better;
      if (c.oral && c.oral.say) return String(c.oral.say).split(/[、,，]/)[0].trim() || lab;
      var gest = gestureTitle(c.gesture && c.gesture.bindingRef);
      if (gest) return gest;
    }
    if (!lab) {
      return (
        softName ||
        fb ||
        gestureTitle(c.gesture && c.gesture.bindingRef) ||
        actionLabel(aid) ||
        '命令'
      );
    }
    return lab;
  }

  function emptyChannel() {
    return { enabled: false, say: '', itemId: '', chord: '', microKeyId: '', bindingRef: '' };
  }

  /**
   * Stable command identity — sole merge key for all consumers.
   * actionId + actionInstanceId (instance non-empty must participate)
   * → semantic slot fallback → slotId
   */
  function commandIdentity(input) {
    if (input == null) return '';
    if (typeof input === 'string') {
      var s = String(input).trim();
      if (!s) return '';
      if (s.indexOf('action:') === 0) return s;
      if (
        s.indexOf('soft:') === 0 ||
        s.indexOf('prompt:') === 0 ||
        s.indexOf('bind:') === 0 ||
        s.indexOf('cam:') === 0 ||
        s.indexOf('semantic:') === 0 ||
        s.indexOf('pad:') === 0
      ) {
        return s;
      }
      return s;
    }
    var aid = canonical((input && (input.actionId || input.action_id)) || '');
    var inst = String((input && (input.actionInstanceId || input.action_instance_id)) || '').trim();
    var sid = String((input && (input.slotId || input.slot_id)) || '').trim();
    if (aid) {
      if (inst) return 'action:' + aid + '#' + inst;
      return 'action:' + aid;
    }
    if (sid.indexOf('semantic:') === 0) return sid;
    if (sid) return sid;
    return '';
  }

  function parseIdentity(ref) {
    ref = String(ref || '').trim();
    if (ref.indexOf('action:') === 0) {
      var body = ref.slice(7);
      var hash = body.indexOf('#');
      if (hash >= 0) {
        return {
          actionId: body.slice(0, hash),
          actionInstanceId: body.slice(hash + 1),
          slotId: '',
          commandRef: ref
        };
      }
      return { actionId: body, actionInstanceId: '', slotId: '', commandRef: ref };
    }
    return { actionId: '', actionInstanceId: '', slotId: ref, commandRef: ref };
  }

  /** Channel ownership view for UI — never invent write affordances. */
  function channelView(st, value, owner, action) {
    return {
      state: st,
      value: value == null ? '' : value,
      owner: owner,
      action: action,
      enabled: st === 'bound' || st === 'deep-link' || st === 'inherited' || st === 'readonly'
    };
  }

  function actionCtaLabel(action, channel) {
    if (action === 'edit') {
      if (channel === 'camera') return '选手势';
      return '改说法';
    }
    if (action === 'record') return '点此录键';
    if (action === 'bind-pad') return '选 Pad 键';
    if (action === 'open') {
      if (channel === 'softPad' || channel === 'padLayout') return '改布局 / 外观 → Pad 页';
      if (channel === 'keys' || channel === 'trigger') return '查看 / 修改 → 按键页';
      if (channel === 'voice' || channel === 'wake' || channel === 'engine') return '查看 / 修改 → 语音页';
      if (channel === 'camera') return '查看 → 摄像头页';
      return '查看 / 修改';
    }
    return '';
  }

  function enrichCommandChannels(cmd) {
    if (!cmd) return cmd;
    cmd.channels = {
      voice: cmd.oral && cmd.oral.enabled && cmd.oral.say
        ? channelView('bound', cmd.oral.say, 'habit', 'edit')
        : channelView('empty', '', 'habit', 'edit'),
      key:
        cmd.key && cmd.key.enabled && cmd.key.chord
          ? channelView('bound', cmd.key.chord, 'habit', 'record')
          : channelView('empty', '', 'habit', 'record'),
      pad:
        cmd.pad && cmd.pad.enabled && cmd.pad.microKeyId
          ? channelView('bound', cmd.pad.microKeyId, 'habit', 'bind-pad')
          : channelView('empty', '', 'habit', 'bind-pad'),
      padLayout: channelView('deep-link', '', 'softPad', 'open'),
      camera:
        cmd.gesture && cmd.gesture.enabled && cmd.gesture.bindingRef
          ? channelView('bound', cmd.gesture.bindingRef, 'habit', 'edit')
          : channelView('empty', '', 'habit', 'edit')
    };
    cmd.commandRef = commandIdentity({
      actionId: cmd.actionId,
      actionInstanceId: cmd.actionInstanceId,
      slotId: cmd.slotId
    });
    return cmd;
  }

  function buildEntryModel(mapping) {
    var trigger = String((mapping && mapping.triggerKey) || '').trim();
    var wake = '';
    var ov = mapping && mapping.voiceOverride;
    if (ov && Array.isArray(ov.wakePhrases) && ov.wakePhrases.length) {
      wake = ov.wakePhrases
        .map(function (p) {
          return String(p || '').trim();
        })
        .filter(Boolean)
        .slice(0, 2)
        .join('、');
    }
    if (!wake) {
      try {
        var cfg = state().config || {};
        var vw = cfg.voiceWake || cfg.voice || {};
        var list = vw.wakePhrases || vw.phrases || [];
        if (Array.isArray(list) && list.length) wake = String(list[0] || '').trim();
      } catch (_) {}
    }
    return {
      triggerKey: channelView(
        trigger ? 'readonly' : 'empty',
        trigger || '未设置',
        'keys',
        'open'
      ),
      wake: channelView(wake ? 'readonly' : 'empty', wake || '未设置', 'voice', 'open'),
      engine: channelView('readonly', '识别引擎', 'voice', 'open')
    };
  }

  function ensureCmd(map, key, seed) {
    key = String(key || '').trim();
    if (!key) return null;
    seed = seed || {};
    if (!map[key]) {
      map[key] = {
        slotId: seed.slotId || key,
        actionId: seed.actionId || '',
        actionInstanceId: seed.actionInstanceId || '',
        commandRef: key,
        label: seed.label || '',
        oral: emptyChannel(),
        key: emptyChannel(),
        pad: emptyChannel(),
        gesture: emptyChannel()
      };
    }
    var row = map[key];
    if (seed.actionId && !row.actionId) row.actionId = seed.actionId;
    if (seed.actionInstanceId && !row.actionInstanceId) row.actionInstanceId = seed.actionInstanceId;
    if (seed.slotId && !row.slotId) row.slotId = seed.slotId;
    if (seed.label && (!row.label || row.label === '—')) row.label = seed.label;
    row.commandRef = key;
    return row;
  }

  /** @deprecated use commandIdentity — kept as alias for any stray callers */
  function cmdKeyForBinding(b) {
    return commandIdentity(b);
  }

  /**
   * Pure read: command × channel projection for one mapping.
   */
  function buildModel(mapping) {
    var m = mapping || null;
    var mid = m && m.id ? String(m.id) : '';
    var byId = Object.create(null);

    var binds = (m && Array.isArray(m.agentBindings) ? m.agentBindings : []) || [];
    var bi;
    for (bi = 0; bi < binds.length; bi++) {
      var b = binds[bi];
      if (!b || b.enabled === false) continue;
      var tt = String(b.triggerType || b.trigger_type || '').trim();
      var aid = canonical(b.actionId || b.action_id || '');
      var inst = String(b.actionInstanceId || b.action_instance_id || '').trim();
      var sid = String(b.slotId || b.slot_id || '').trim();
      if (
        /^cursorBeginner/i.test(aid) ||
        /^cursorBeginner/i.test(sid) ||
        /^cursorBeginner/i.test(inst)
      ) {
        continue;
      }
      var ck = commandIdentity(b);
      if (!ck) continue;
      var args = b.actionArgs || b.action_args || null;
      var nice =
        bindingDisplayLabel(b, aid) ||
        customShortcutTitle(m, sid) ||
        customShortcutTitle(m, inst) ||
        actionLabel(aid) ||
        String(b.triggerBinding || '').trim();
      var row = ensureCmd(byId, ck, {
        slotId: sid || ck,
        actionId: aid,
        actionInstanceId: inst,
        label: nice
      });
      if (!row) continue;
      if (inst) row.actionInstanceId = inst;
      if (args && !row.actionArgs) row.actionArgs = args;
      if (sid && (!row.slotId || row.slotId.indexOf('semantic:') !== 0)) row.slotId = sid;
      var trig = String(b.triggerBinding || b.trigger_binding || '').trim();
      if (tt === 'voice') {
        row.oral.enabled = !!trig;
        row.oral.say = trig;
        row.oral.itemId = 'bind:' + sid;
        row.voiceSlotId = sid;
      } else if (tt === 'key') {
        row.key.enabled = !!trig;
        row.key.chord = trig;
        row.keySlotId = sid;
      } else if (tt === 'softPad') {
        row.pad.enabled = !!trig;
        row.pad.microKeyId = trig;
        row.padSlotId = sid;
      } else if (tt === 'camera') {
        row.gesture.enabled = !!trig;
        row.gesture.bindingRef = trig;
      }
    }

    var scheme = m && m.oralCommandScheme && typeof m.oralCommandScheme === 'object' ? m.oralCommandScheme : null;
    var items = scheme && scheme.items && typeof scheme.items === 'object' ? scheme.items : {};
    Object.keys(items).forEach(function (itemId) {
      var ov = items[itemId] || {};
      if (ov.enabled === false) return;
      var say = ov.say != null ? String(ov.say).trim() : '';
      if (itemId.indexOf('bind:') === 0) {
        var ref = itemId.slice(5);
        var bindRow = null;
        for (var bi2 = 0; bi2 < binds.length; bi2++) {
          if (binds[bi2] && String(binds[bi2].slotId || '') === ref) {
            bindRow = binds[bi2];
            break;
          }
        }
        var mergeKey = bindRow ? commandIdentity(bindRow) : commandIdentity({ slotId: ref });
        var rowB = ensureCmd(byId, mergeKey, {
          slotId: ref,
          actionId: bindRow ? canonical(bindRow.actionId) : '',
          actionInstanceId: bindRow
            ? String(bindRow.actionInstanceId || bindRow.action_instance_id || '').trim()
            : '',
          label: say || ref
        });
        if (!rowB) return;
        if (say) {
          rowB.oral.enabled = true;
          rowB.oral.say = say;
        }
        rowB.oral.itemId = itemId;
        rowB.voiceSlotId = rowB.voiceSlotId || ref;
        return;
      }
      if (itemId.indexOf('soft:') === 0 || itemId.indexOf('prompt:') === 0) {
        var Oral = global.OneToneOralCommandUi;
        var softLabel = itemId;
        if (Oral && Array.isArray(Oral.ORAL_SOFT_SLOTS)) {
          for (var si = 0; si < Oral.ORAL_SOFT_SLOTS.length; si++) {
            if (Oral.ORAL_SOFT_SLOTS[si].id === itemId) {
              softLabel = Oral.ORAL_SOFT_SLOTS[si].name || itemId;
              break;
            }
          }
        }
        var softKey = commandIdentity({ slotId: itemId });
        var rowS = ensureCmd(byId, softKey, {
          slotId: itemId,
          actionId: '',
          label: softLabel
        });
        if (!rowS) return;
        rowS.oral.enabled = ov.enabled !== false && (!!say || ov.enabled === true);
        rowS.oral.say = say;
        rowS.oral.itemId = itemId;
      }
    });

    var OralSlots = global.OneToneOralCommandUi;
    function softSlotIdForPad(slotOrAid) {
      var key = String(slotOrAid || '').trim();
      if (!key || !OralSlots || !Array.isArray(OralSlots.ORAL_SOFT_SLOTS)) return '';
      var si;
      for (si = 0; si < OralSlots.ORAL_SOFT_SLOTS.length; si++) {
        var d = OralSlots.ORAL_SOFT_SLOTS[si];
        if (!d) continue;
        if (d.id === key || d.slotId === key || d.microKeyId === key) return d.id;
      }
      return '';
    }

    var pad = m && m.codexMicroPad && typeof m.codexMicroPad === 'object' ? m.codexMicroPad : null;
    var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
    var ki;
    for (ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      if (!k || k.enabled === false) continue;
      var micro = String(k.microKeyId || '').trim();
      var slot = String(k.slotId || '').trim();
      if (!micro || !slot) continue;
      var padAid = '';
      if (slot.indexOf('semantic:') === 0) {
        var parts = slot.split(':');
        if (parts.length >= 3) padAid = canonical(parts.slice(2).join(':'));
      } else if (slot.indexOf(':') < 0) {
        // Soft Pad seed routes store bare action ids (newThread / openTerminal / …)
        padAid = canonical(slot);
      }
      // Bare Soft Pad seed → soft: oral 同行；semantic:softPad:X 仅在已有 soft: 口令行时合并，避免与 action 行拆开。
      var softMerge = '';
      if (slot.indexOf('semantic:') !== 0) {
        softMerge = softSlotIdForPad(slot) || softSlotIdForPad(padAid);
      } else {
        var softCand =
          softSlotIdForPad(padAid) || (padAid ? softSlotIdForPad('soft:' + padAid) : '');
        if (softCand && byId[commandIdentity({ slotId: softCand })]) softMerge = softCand;
      }
      var padKey = softMerge
        ? commandIdentity({ slotId: softMerge })
        : commandIdentity({ actionId: padAid, slotId: slot });
      var softDef = softMerge && OralSlots && OralSlots.ORAL_SOFT_SLOTS
        ? OralSlots.ORAL_SOFT_SLOTS.filter(function (d) {
            return d && d.id === softMerge;
          })[0]
        : null;
      var padLab =
        (softDef && softDef.name) ||
        softSlotDisplayName(softMerge || slot) ||
        actionLabel(padAid || slot) ||
        slot;
      var rowP = ensureCmd(byId, padKey, {
        slotId: softMerge || slot,
        actionId: padAid || (softDef && softDef.slotId ? canonical(softDef.slotId) : ''),
        label: padLab
      });
      if (!rowP) continue;
      rowP.pad.enabled = true;
      rowP.pad.microKeyId = micro;
      rowP.padSlotId = slot;
      if (softMerge) rowP.slotId = softMerge;
      if (!rowP.actionId) rowP.actionId = padAid;
      if (!rowP.label || rowP.label === '—' || looksTechLabel(rowP.label)) {
        rowP.label =
          (softDef && softDef.name) ||
          softSlotDisplayName(rowP.slotId) ||
          actionLabel(rowP.actionId) ||
          padLab;
      }
    }

    var cam = m && m.cameraOverride && typeof m.cameraOverride === 'object' ? m.cameraOverride : {};
    Object.keys(cam).forEach(function (bindKey) {
      // Skip presence prefs bag keys (triggers/enabled/…); only gesture→action strings.
      if (!CAM_OVERRIDE_ACTION_KEYS[bindKey]) return;
      var raw = cam[bindKey];
      if (raw == null || typeof raw === 'object') return;
      var token = String(raw).trim();
      if (!token || token === 'none' || token === '[object Object]') return;
      var aid = token.indexOf('agent:') === 0 ? token.slice(6) : token;
      var gAid = canonical(aid);
      if (!gAid || gAid === '[object Object]') return;
      var gKey = commandIdentity({ actionId: gAid, slotId: gAid ? '' : 'cam:' + bindKey });
      if (!gKey) gKey = 'cam:' + bindKey;
      var rowG = ensureCmd(byId, gKey, {
        slotId: 'cam:' + bindKey,
        actionId: gAid,
        label: actionLabel(gAid) || gestureTitle(bindKey) || fallbackActionLabel(gAid) || bindKey
      });
      if (!rowG) return;
      rowG.gesture.enabled = true;
      rowG.gesture.bindingRef = bindKey;
    });

    var commands = Object.keys(byId)
      .map(function (id) {
        var c = byId[id];
        c.label = asPlainLabel(c.label) || actionLabel(c.actionId) || asPlainLabel(c.slotId) || id;
        enrichCommandChannels(c);
        c.label = refineCommandLabel(c, m) || c.label;
        c.category = resolveCategory(c);
        c.capabilityKind = resolveCapabilityKind(c);
        attachCursorKeyFamily(c);
        return c;
      })
      .filter(function (c) {
        if (!(c.oral.enabled || c.key.enabled || c.pad.enabled || c.gesture.enabled)) return false;
        return !isHabitListNoise(c);
      })
      .sort(function (a, b) {
        var ka = CAPABILITY_KIND_ORDER.indexOf(a.capabilityKind);
        var kb = CAPABILITY_KIND_ORDER.indexOf(b.capabilityKind);
        if (ka < 0) ka = 99;
        if (kb < 0) kb = 99;
        if (ka !== kb) return ka - kb;
        if (a.capabilityKind === 'cursorKey' && b.capabilityKind === 'cursorKey') {
          var fa = CURSOR_KEY_FAMILY_ORDER.indexOf(a.cursorKeyFamily);
          var fb = CURSOR_KEY_FAMILY_ORDER.indexOf(b.cursorKeyFamily);
          if (fa < 0) fa = 99;
          if (fb < 0) fb = 99;
          if (fa !== fb) return fa - fb;
        }
        return String(a.label).localeCompare(String(b.label), 'zh');
      });

    return {
      mappingId: mid,
      commands: commands,
      entry: buildEntryModel(m)
    };
  }

  function tokenizeSay(v) {
    var Oral = global.OneToneOralCommandUi;
    if (Oral && Oral.tokenizeOralSay) return Oral.tokenizeOralSay(v).join('、');
    return String(v || '')
      .split(/[、,，;\s]+/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean)
      .join('、');
  }

  function listPadMicroKeys(mapping) {
    var seen = Object.create(null);
    var out = [];
    function push(id) {
      id = String(id || '').trim();
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push(id);
    }
    DEFAULT_PAD_KEYS.forEach(push);
    var keys =
      mapping && mapping.codexMicroPad && Array.isArray(mapping.codexMicroPad.keys)
        ? mapping.codexMicroPad.keys
        : [];
    keys.forEach(function (k) {
      if (k) push(k.microKeyId);
    });
    return out;
  }

  function resolveCommandRef(mapping, commandRef) {
    var ref = String(commandRef || '').trim();
    if (!ref || !mapping) return null;
    if (ref.indexOf('pad:') === 0) {
      var micro = ref.slice(4);
      var pad = mapping.codexMicroPad;
      var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
      var hit = null;
      var pi;
      for (pi = 0; pi < keys.length; pi++) {
        if (keys[pi] && String(keys[pi].microKeyId || '') === micro) {
          hit = keys[pi];
          break;
        }
      }
      var slot = hit && String(hit.slotId || '').trim();
      if (slot) return resolveCommandRef(mapping, slot) || {
        slotId: slot,
        oral: emptyChannel(),
        key: emptyChannel(),
        pad: { enabled: true, microKeyId: micro },
        gesture: emptyChannel(),
        padSlotId: slot,
        actionId: ''
      };
      return {
        slotId: 'semantic:softPad:' + micro,
        oral: emptyChannel(),
        key: emptyChannel(),
        pad: { enabled: false, microKeyId: micro },
        gesture: emptyChannel(),
        padSlotId: 'semantic:softPad:' + micro,
        actionId: ''
      };
    }
    var model = buildModel(mapping);
    var parsed = parseIdentity(ref);
    var i;
    for (i = 0; i < model.commands.length; i++) {
      var c = model.commands[i];
      var cRef = c.commandRef || commandIdentity(c);
      if (cRef === ref) return c;
      if (c.slotId === ref || c.oral.itemId === ref || c.actionId === ref) return c;
      if (parsed.actionId && c.actionId === parsed.actionId) {
        var cInst = String(c.actionInstanceId || '').trim();
        if (parsed.actionInstanceId) {
          if (cInst === parsed.actionInstanceId) return c;
        } else if (!cInst) {
          return c;
        }
      }
      if (c.voiceSlotId && c.voiceSlotId === ref) return c;
      if (c.padSlotId && c.padSlotId === ref) return c;
      if (c.keySlotId && c.keySlotId === ref) return c;
      if (ref.indexOf('bind:') === 0 && c.oral.itemId === ref) return c;
      if (ref.indexOf('bind:') === 0 && (c.voiceSlotId === ref.slice(5) || c.slotId === ref.slice(5))) return c;
    }
    if (ref.indexOf('soft:') === 0 || ref.indexOf('prompt:') === 0 || ref.indexOf('bind:') === 0) {
      return enrichCommandChannels({
        slotId: ref.indexOf('bind:') === 0 ? ref.slice(5) : ref,
        oral: { itemId: ref, enabled: false, say: '' },
        key: emptyChannel(),
        pad: emptyChannel(),
        gesture: emptyChannel(),
        actionId: '',
        actionInstanceId: '',
        voiceSlotId: ref.indexOf('bind:') === 0 ? ref.slice(5) : ''
      });
    }
    if (ref.indexOf('action:') === 0) {
      return enrichCommandChannels({
        slotId: ref,
        oral: emptyChannel(),
        key: emptyChannel(),
        pad: emptyChannel(),
        gesture: emptyChannel(),
        actionId: parsed.actionId || ref.slice(7),
        actionInstanceId: parsed.actionInstanceId || ''
      });
    }
    if (ref.indexOf('semantic:camera:') === 0 || ref.indexOf('cam:') === 0) {
      return {
        slotId: ref,
        oral: emptyChannel(),
        key: emptyChannel(),
        pad: emptyChannel(),
        gesture: {
          enabled: true,
          bindingRef: ref.indexOf('cam:') === 0 ? ref.slice(4) : ref.slice('semantic:camera:'.length)
        },
        actionId: ''
      };
    }
    return {
      slotId: ref,
      oral: emptyChannel(),
      key: emptyChannel(),
      pad: emptyChannel(),
      gesture: emptyChannel(),
      actionId: ref
    };
  }

  function persistMapping(source) {
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.ensureConfig) {
        global.OneToneConfigPersist.ensureConfig();
      }
      if (global.OneToneConfigPersist && typeof global.OneToneConfigPersist.saveAsync === 'function') {
        return Promise.resolve(global.OneToneConfigPersist.saveAsync({ source: source || 'habitCommandLink' }));
      }
      if (global.OneToneConfigPersist && typeof global.OneToneConfigPersist.save === 'function') {
        global.OneToneConfigPersist.save({ source: source || 'habitCommandLink' });
      }
    } catch (_) {}
    return Promise.resolve(true);
  }

  /**
   * L7: set oral phrase for a command. Writes items and/or voice agentBindings.triggerBinding.
   * Does not change activeSceneId.
   */
  function setCommandPhrase(mapping, commandRef, phrase) {
    if (!mapping) return Promise.reject(new Error('no_mapping'));
    var resolved = resolveCommandRef(mapping, commandRef);
    if (!resolved) return Promise.reject(new Error('no_command'));
    var say = tokenizeSay(phrase);
    var Oral = global.OneToneOralCommandUi;
    var itemId = String((resolved.oral && resolved.oral.itemId) || '').trim();
    var slotId = String(resolved.voiceSlotId || resolved.slotId || '').trim();
    if (slotId.indexOf('action:') === 0) {
      slotId = resolved.voiceSlotId || 'semantic:voice:' + String(resolved.actionId || slotId.slice(7)).trim();
    }

    if (!itemId && slotId && slotId.indexOf('soft:') !== 0 && slotId.indexOf('prompt:') !== 0) {
      itemId = 'bind:' + slotId;
    }
    if (!itemId) itemId = slotId;

    var prevItems = JSON.parse(
      JSON.stringify((mapping.oralCommandScheme && mapping.oralCommandScheme.items) || {})
    );
    var prevVoice = JSON.parse(
      JSON.stringify(
        (mapping.agentBindings || []).filter(function (b) {
          return b && String(b.triggerType || '') === 'voice';
        })
      )
    );
    setLastBindUndo({
      mappingId: mapping.id,
      kind: 'phrase',
      restore: function () {
        if (!mapping.oralCommandScheme) mapping.oralCommandScheme = { items: {} };
        mapping.oralCommandScheme.items = JSON.parse(JSON.stringify(prevItems));
        mapping.agentBindings = (mapping.agentBindings || []).filter(function (b) {
          return !(b && String(b.triggerType || '') === 'voice');
        }).concat(JSON.parse(JSON.stringify(prevVoice)));
        return persistMapping('habitCommandLink.phraseUndo');
      }
    });

    if (Oral && typeof Oral.persistOralScheme === 'function') {
      var prev = (mapping.oralCommandScheme && mapping.oralCommandScheme.items) || {};
      var items = Object.assign({}, prev);
      var prevRow = items[itemId] || {};
      items[itemId] = Object.assign({}, prevRow, {
        enabled: true,
        say: say
      });
      Oral.persistOralScheme(mapping, items);
    } else {
      if (!mapping.oralCommandScheme) mapping.oralCommandScheme = { items: {}, triggerKey: '', activationMode: 'hold' };
      if (!mapping.oralCommandScheme.items) mapping.oralCommandScheme.items = {};
      mapping.oralCommandScheme.items[itemId] = Object.assign({}, mapping.oralCommandScheme.items[itemId] || {}, {
        enabled: true,
        say: say
      });
    }

    if (itemId.indexOf('bind:') === 0) {
      var bindRef = itemId.slice(5);
      mapping.agentBindings = mapping.agentBindings || [];
      var found = false;
      var i;
      for (i = 0; i < mapping.agentBindings.length; i++) {
        var b = mapping.agentBindings[i];
        if (!b || String(b.triggerType || '') !== 'voice') continue;
        if (String(b.slotId || '') !== bindRef) continue;
        b.triggerBinding = say;
        b.enabled = true;
        found = true;
        break;
      }
      if (!found && resolved.actionId) {
        mapping.agentBindings.push({
          slotId: bindRef || 'semantic:voice:' + resolved.actionId,
          actionId: resolved.actionId,
          triggerType: 'voice',
          triggerBinding: say,
          enabled: true,
          activationScope: 'global'
        });
      }
    }

    return persistMapping('habitCommandLink.phrase');
  }

  function removeCommandPhrase(mapping, commandRef) {
    if (!mapping) return Promise.reject(new Error('no_mapping'));
    var resolved = resolveCommandRef(mapping, commandRef);
    if (!resolved) return Promise.reject(new Error('no_command'));
    var Oral = global.OneToneOralCommandUi;
    var itemId = String((resolved.oral && resolved.oral.itemId) || '').trim();
    var slotId = String(resolved.voiceSlotId || resolved.slotId || '').trim();
    if (slotId.indexOf('action:') === 0) {
      slotId = resolved.voiceSlotId || 'semantic:voice:' + String(resolved.actionId || '').trim();
    }
    if (!itemId && slotId) itemId = slotId.indexOf('bind:') === 0 || slotId.indexOf('soft:') === 0 ? slotId : 'bind:' + slotId;

    if (itemId && Oral && typeof Oral.persistOralScheme === 'function') {
      var prev = (mapping.oralCommandScheme && mapping.oralCommandScheme.items) || {};
      var items = Object.assign({}, prev);
      if (items[itemId]) {
        if (itemId.indexOf('soft:') === 0) {
          items[itemId] = Object.assign({}, items[itemId], { enabled: false, say: '' });
        } else {
          delete items[itemId];
        }
        Oral.persistOralScheme(mapping, items);
      }
    } else if (itemId && mapping.oralCommandScheme && mapping.oralCommandScheme.items) {
      delete mapping.oralCommandScheme.items[itemId];
    }

    var bindRef = itemId.indexOf('bind:') === 0 ? itemId.slice(5) : slotId;
    if (Array.isArray(mapping.agentBindings) && bindRef) {
      mapping.agentBindings = mapping.agentBindings.filter(function (b) {
        if (!b || String(b.triggerType || '') !== 'voice') return true;
        if (String(b.slotId || '') !== bindRef) return true;
        return false;
      });
    }

    return persistMapping('habitCommandLink.phraseRemove');
  }

  /**
   * L2 write: single path onto captureHeroRef (delegates MappingCore).
   * Soft Pad stampSoftPadSceneHero / channel claims must use this.
   */
  function setCaptureHero(mapping, ref) {
    if (!mapping) return;
    var core = global.OneToneMappingCore;
    if (core && typeof core.setCaptureHeroRef === 'function') {
      core.setCaptureHeroRef(mapping, ref || null);
      return;
    }
    if (!ref) {
      mapping.captureHeroRef = null;
      return;
    }
    mapping.captureHeroRef = {
      channel: String(ref.channel || 'key').trim(),
      bindingRef: String(ref.bindingRef || '').trim(),
      actionId: String(ref.actionId || '').trim(),
      actionInstanceId: String(ref.actionInstanceId || '').trim(),
      kind: String(ref.kind || 'action').trim()
    };
  }

  /**
   * Sync voice triggerBinding for a slot (Soft Pad keycap phrases).
   * Does not persist — caller owns save. Prefer over ad-hoc agentBindings.push.
   */
  function syncSlotVoicePhrase(mapping, slotId, phrase, opts) {
    if (!mapping) return false;
    opts = opts || {};
    var id = String(slotId || '').trim();
    if (!id) return false;
    var say = tokenizeSay(phrase);
    mapping.agentBindings = mapping.agentBindings || [];
    var found = null;
    var i;
    for (i = 0; i < mapping.agentBindings.length; i++) {
      var b = mapping.agentBindings[i];
      if (!b || String(b.triggerType || '') !== 'voice') continue;
      if (String(b.slotId || '') !== id) continue;
      found = b;
      break;
    }
    if (!say) {
      if (found) {
        found.enabled = false;
        found.triggerBinding = '';
      }
      return true;
    }
    if (found) {
      found.triggerBinding = say;
      found.enabled = true;
      if (opts.actionId) found.actionId = opts.actionId;
      if (opts.actionInstanceId != null && opts.actionInstanceId !== '') {
        found.actionInstanceId = opts.actionInstanceId;
      }
      if (opts.actionArgs) found.actionArgs = opts.actionArgs;
      if (opts.activationScope) found.activationScope = opts.activationScope;
      if (opts.executionMode) found.executionMode = opts.executionMode;
      return true;
    }
    var row = {
      slotId: id,
      actionId: opts.actionId || id,
      triggerType: 'voice',
      triggerBinding: say,
      enabled: true,
      executionMode: opts.executionMode || 'execute',
      activationScope: opts.activationScope || 'foregroundApp'
    };
    if (opts.actionInstanceId) row.actionInstanceId = opts.actionInstanceId;
    if (opts.actionArgs) row.actionArgs = opts.actionArgs;
    mapping.agentBindings.push(row);
    return true;
  }

  function ensurePad(m) {
    if (!m.codexMicroPad || typeof m.codexMicroPad !== 'object') {
      m.codexMicroPad = { enabled: true, keys: [] };
    }
    if (!Array.isArray(m.codexMicroPad.keys)) m.codexMicroPad.keys = [];
    return m.codexMicroPad;
  }

  function clearPadMicroKey(pad, microKeyId, exceptSlot) {
    var micro = String(microKeyId || '').trim();
    if (!micro) return;
    pad.keys.forEach(function (k) {
      if (!k) return;
      if (String(k.microKeyId || '') !== micro) return;
      if (exceptSlot && String(k.slotId || '') === exceptSlot) return;
      k.slotId = '';
      k.enabled = false;
    });
  }

  function clearPadSlot(pad, slotId, exceptMicro) {
    var slot = String(slotId || '').trim();
    if (!slot) return;
    pad.keys.forEach(function (k) {
      if (!k) return;
      if (String(k.slotId || '') !== slot) return;
      if (exceptMicro && String(k.microKeyId || '') === exceptMicro) return;
      k.slotId = '';
      k.enabled = false;
    });
  }

  function upsertPadRoute(pad, microKeyId, slotId) {
    var micro = String(microKeyId || '').trim();
    var slot = String(slotId || '').trim();
    if (!micro) return;
    var route = null;
    var i;
    for (i = 0; i < pad.keys.length; i++) {
      if (pad.keys[i] && String(pad.keys[i].microKeyId || '') === micro) {
        route = pad.keys[i];
        break;
      }
    }
    if (!route) {
      route = {
        microKeyId: micro,
        sourceScan: 0,
        sourceExtended: false,
        sourceKey: '',
        slotId: '',
        uiIconId: '',
        enabled: false
      };
      pad.keys.push(route);
    }
    route.slotId = slot;
    route.enabled = !!slot;
  }

  function removeOrphanSoftPadBindings(m, keepSlotId, keepMicro) {
    if (!Array.isArray(m.agentBindings)) return;
    m.agentBindings = m.agentBindings.filter(function (b) {
      if (!b || String(b.triggerType || '') !== 'softPad') return true;
      var sid = String(b.slotId || '').trim();
      var micro = String(b.triggerBinding || '').trim();
      if (keepSlotId && sid === keepSlotId) return true;
      if (keepMicro && micro === keepMicro && sid === keepSlotId) return true;
      var pad = m.codexMicroPad;
      var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
      var still = keys.some(function (k) {
        return k && k.enabled !== false && String(k.slotId || '') === sid && String(k.microKeyId || '') === micro;
      });
      return still;
    });
  }

  /**
   * L3: bind slotId ↔ microKeyId on Soft Pad + softPad agentBindings.
   * microKeyId empty clears the pad route for that slot and drops orphan softPad bindings.
   */
  function setSoftPadBinding(mapping, slotId, microKeyId) {
    if (!mapping || !mapping.id) return Promise.reject(new Error('no_mapping'));
    var slot = String(slotId || '').trim();
    var micro = String(microKeyId || '').trim();
    if (!slot) return Promise.reject(new Error('no_slot'));
    if (slot.indexOf('action:') === 0) {
      var resolvedPad = resolveCommandRef(mapping, slot);
      slot = String((resolvedPad && (resolvedPad.padSlotId || resolvedPad.slotId)) || '').trim();
      if (!slot || slot.indexOf('action:') === 0) {
        var aid = String((resolvedPad && resolvedPad.actionId) || slotId.slice(7)).trim();
        slot = 'semantic:softPad:' + aid;
      }
    }

    var undoSnap = snapshotSoftPadState(mapping);
    setLastBindUndo({
      mappingId: mapping.id,
      kind: 'softPad',
      restore: function () {
        return restoreSoftPadState(mapping, undoSnap);
      }
    });

    var pad = ensurePad(mapping);
    var adapters = global.OneToneActionBindingAdapters;
    var softPad = adapters && adapters.softPad;

    if (!micro) {
      clearPadSlot(pad, slot, '');
      if (Array.isArray(mapping.agentBindings)) {
        mapping.agentBindings = mapping.agentBindings.filter(function (b) {
          if (!b || String(b.triggerType || '') !== 'softPad') return true;
          return String(b.slotId || '') !== slot;
        });
      }
      removeOrphanSoftPadBindings(mapping, '', '');
      return persistMapping('habitCommandLink.padClear');
    }

    clearPadMicroKey(pad, micro, slot);
    clearPadSlot(pad, slot, micro);
    upsertPadRoute(pad, micro, slot);

    var actionId = slot;
    if (slot.indexOf('semantic:') === 0) {
      var parts = slot.split(':');
      if (parts.length >= 3) actionId = parts.slice(2).join(':');
    }
    actionId = canonical(actionId) || slot;

    var mid = String(mapping.id);
    function stampBinding() {
      mapping.agentBindings = mapping.agentBindings || [];
      var hit = null;
      var i;
      for (i = 0; i < mapping.agentBindings.length; i++) {
        var b = mapping.agentBindings[i];
        if (!b || String(b.triggerType || '') !== 'softPad') continue;
        if (String(b.slotId || '') === slot || canonical(b.actionId) === actionId) {
          hit = b;
          break;
        }
      }
      if (hit) {
        hit.triggerBinding = micro;
        hit.enabled = true;
        hit.slotId = hit.slotId || slot;
      } else {
        mapping.agentBindings.push({
          slotId: slot,
          actionId: actionId,
          triggerType: 'softPad',
          triggerBinding: micro,
          enabled: true,
          activationScope: 'global'
        });
      }
      removeOrphanSoftPadBindings(mapping, slot, micro);
    }

    var p =
      softPad && typeof softPad.upsert === 'function'
        ? softPad.upsert(mid, actionId, { microKeyId: micro }, slot).catch(function () {
            // Adapter may reject when SemanticActionStore.assertBindable is unavailable;
            // pad.keys already updated — stamp softPad agentBindings locally.
            stampBinding();
          })
        : Promise.resolve();

    return Promise.resolve(p).then(function () {
      stampBinding();
      return persistMapping('habitCommandLink.pad');
    });
  }

  /**
   * Gesture match: cameraOverride[gesture] = agent:<actionId>.
   * gestureId empty clears all gestures pointing at this action.
   */
  function setGestureBinding(mapping, commandRef, gestureId) {
    if (!mapping) return Promise.reject(new Error('no_mapping'));
    var resolved = resolveCommandRef(mapping, commandRef);
    if (!resolved) return Promise.reject(new Error('no_command'));
    var aid = canonical(resolved.actionId || '') || String(resolved.slotId || '').trim();
    if (!aid) return Promise.reject(new Error('no_action'));
    if (!mapping.cameraOverride || typeof mapping.cameraOverride !== 'object') {
      mapping.cameraOverride = {};
    }
    var cam = mapping.cameraOverride;
    var gest = String(gestureId || '').trim();
    var prevCam = JSON.parse(JSON.stringify(cam));
    setLastBindUndo({
      mappingId: mapping.id,
      kind: 'gesture',
      restore: function () {
        mapping.cameraOverride = JSON.parse(JSON.stringify(prevCam));
        return persistMapping('habitCommandLink.gestureUndo');
      }
    });
    Object.keys(cam).forEach(function (k) {
      var tok = String(cam[k] || '').trim();
      var tokAid = tok.indexOf('agent:') === 0 ? tok.slice(6) : tok;
      if (canonical(tokAid) === canonical(aid) || tokAid === aid) delete cam[k];
    });
    if (gest) cam[gest] = aid.indexOf('agent:') === 0 ? aid : 'agent:' + aid;
    return persistMapping('habitCommandLink.gesture');
  }

  /**
   * Local key chord for a command (agentBindings triggerType=key).
   * Empty chord clears the key binding for this command.
   */
  function setCommandKeyChord(mapping, commandRef, chord) {
    if (!mapping) return Promise.reject(new Error('no_mapping'));
    var resolved = resolveCommandRef(mapping, commandRef);
    if (!resolved) return Promise.reject(new Error('no_command'));
    var cmdRef = resolved.commandRef || commandIdentity(resolved);
    var aid = canonical(resolved.actionId || '');
    var slot = String(resolved.keySlotId || '').trim();
    if (!slot || slot.indexOf('action:') === 0) {
      slot = aid ? 'semantic:key:' + aid : String(resolved.slotId || cmdRef);
    }
    mapping.agentBindings = mapping.agentBindings || [];
    var chordStr = String(chord || '').trim();
    var prevKeys = JSON.parse(
      JSON.stringify(
        mapping.agentBindings.filter(function (b) {
          return b && String(b.triggerType || '') === 'key';
        })
      )
    );
    setLastBindUndo({
      mappingId: mapping.id,
      kind: 'key',
      restore: function () {
        mapping.agentBindings = (mapping.agentBindings || []).filter(function (b) {
          return !(b && String(b.triggerType || '') === 'key');
        }).concat(JSON.parse(JSON.stringify(prevKeys)));
        return persistMapping('habitCommandLink.keyUndo');
      }
    });
    var hit = null;
    var i;
    for (i = 0; i < mapping.agentBindings.length; i++) {
      var b = mapping.agentBindings[i];
      if (!b || String(b.triggerType || '') !== 'key') continue;
      if (
        commandIdentity(b) === cmdRef ||
        String(b.slotId || '') === slot ||
        (aid && canonical(b.actionId) === aid && !String(b.actionInstanceId || b.action_instance_id || '').trim())
      ) {
        hit = b;
        break;
      }
    }
    if (!chordStr) {
      mapping.agentBindings = mapping.agentBindings.filter(function (b) {
        if (!b || String(b.triggerType || '') !== 'key') return true;
        if (hit && b === hit) return false;
        return !(commandIdentity(b) === cmdRef || String(b.slotId || '') === slot);
      });
      return persistMapping('habitCommandLink.keyClear');
    }
    if (hit) {
      hit.triggerBinding = chordStr;
      hit.enabled = true;
      hit.slotId = hit.slotId || slot;
    } else {
      var row = {
        slotId: slot,
        actionId: aid,
        triggerType: 'key',
        triggerBinding: chordStr,
        enabled: true,
        activationScope: 'global'
      };
      if (resolved.actionInstanceId) row.actionInstanceId = resolved.actionInstanceId;
      mapping.agentBindings.push(row);
    }
    return persistMapping('habitCommandLink.key');
  }

  function startHabitKeyRecord(host, mapping, cmdRef, btn, afterSave) {
    function finishUi() {
      if (btn) btn.classList.remove('is-recording');
    }
    function onChord(chord) {
      finishUi();
      var next = String(chord || '').trim();
      if (!next) {
        if (typeof afterSave === 'function') afterSave();
        return;
      }
      setCommandKeyChord(mapping, cmdRef, next).then(afterSave);
    }
    function onCancel() {
      finishUi();
      if (host && mapping) mountInto(host, mapping);
    }
    var Rec = global.OneToneMappingRecording;
    if (Rec && typeof Rec.startAgentBinding === 'function') {
      if (Rec.mode && Rec.mode() !== 'none') return;
      if (btn) {
        btn.classList.add('is-recording');
        btn.innerHTML = '按下快捷键… <span>Esc 取消</span>';
      }
      Rec.startAgentBinding(mapping.id, { onDone: onChord, onCancel: onCancel });
      return;
    }
    if (typeof global.OneToneHomeRecordChord === 'function') {
      if (btn) {
        btn.classList.add('is-recording');
        btn.innerHTML = '按下快捷键… <span>Esc 取消</span>';
      }
      global.OneToneHomeRecordChord(onChord);
      return;
    }
    openChannelPanel('keys');
  }

  function maybeReturnAfterSave() {
    if (!String(ui().habitMatchReturnPanel || '').trim()) return false;
    return returnToCaller();
  }

  /** Deep-link / focus state (does not activateScene). commandRef aliases matchCommand. */
  function applyMatchDeepLink(opts) {
    opts = opts || {};
    var st = state();
    var u = ui();
    var mid = String(opts.mappingId || '').trim();
    if (mid) st.selectedMappingId = mid;
    var ch = String(opts.matchChannel || '').trim();
    if (MATCH_CHANNELS[ch]) u.habitMatchChannel = ch;
    var cmd = String(opts.commandRef || opts.matchCommand || '').trim();
    if (cmd) u.habitMatchCommand = cmd;
    u.habitOpenMatchEditor = opts.openMatchEditor !== false;
    if (opts.returnPanel) u.habitMatchReturnPanel = String(opts.returnPanel);
    return {
      mappingId: st.selectedMappingId,
      matchChannel: u.habitMatchChannel,
      matchCommand: u.habitMatchCommand,
      commandRef: u.habitMatchCommand
    };
  }

  function consumeMatchDeepLink() {
    var u = ui();
    var cmd = String(u.habitMatchCommand || '').trim();
    var out = {
      matchChannel: String(u.habitMatchChannel || '').trim(),
      matchCommand: cmd,
      commandRef: cmd,
      openMatchEditor: !!u.habitOpenMatchEditor,
      returnPanel: String(u.habitMatchReturnPanel || '').trim()
    };
    return out;
  }

  function clearMatchDeepLink() {
    var u = ui();
    delete u.habitMatchChannel;
    delete u.habitMatchCommand;
    delete u.habitOpenMatchEditor;
    delete u.habitMatchReturnPanel;
  }

  /** After match edit: restore returnPanel (does not activateScene). */
  function returnToCaller() {
    var panel = String(ui().habitMatchReturnPanel || '').trim();
    clearMatchDeepLink();
    if (!panel || panel === 'habits') return false;
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && typeof drawer.open === 'function') {
      drawer.open({ panel: panel });
      return true;
    }
    if (drawer && typeof drawer.setPanel === 'function') {
      drawer.setPanel(panel);
      return true;
    }
    return false;
  }

  function openHabitsMatch(opts) {
    opts = opts || {};
    var mid = String(opts.mappingId || state().selectedMappingId || '').trim();
    var cmd = String(opts.commandRef || opts.matchCommand || '').trim();
    applyMatchDeepLink({
      mappingId: mid,
      matchChannel: opts.matchChannel,
      matchCommand: cmd,
      commandRef: cmd,
      openMatchEditor: opts.openMatchEditor !== false,
      returnPanel: opts.returnPanel
    });
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && typeof drawer.open === 'function') {
      drawer.open({
        panel: 'habits',
        mappingId: mid,
        matchChannel: opts.matchChannel,
        matchCommand: cmd,
        commandRef: cmd,
        openMatchEditor: opts.openMatchEditor !== false,
        returnPanel: opts.returnPanel
      });
    }
  }

  function openChannelPanel(panel) {
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && typeof drawer.open === 'function') {
      drawer.open({ panel: panel });
      return true;
    }
    return false;
  }

  function stateBadgeLabel(st) {
    if (st === 'bound') return '已绑定';
    if (st === 'inherited') return '继承自通用';
    if (st === 'readonly') return '由通道页管理';
    if (st === 'deep-link') return '去通道页配置';
    return '未配置';
  }

  function channelIconSvg(kind) {
    // Match left-nav stroke icons (wb-nav / settings-nav) — thin outline, not fill blobs.
    var attrs =
      ' viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (kind === 'all') {
      return (
        '<svg' +
        attrs +
        '><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/></svg>'
      );
    }
    if (kind === 'voice') {
      return (
        '<svg' +
        attrs +
        '><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>'
      );
    }
    if (kind === 'key') {
      return (
        '<svg' +
        attrs +
        '><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>'
      );
    }
    if (kind === 'pad') {
      return (
        '<svg' +
        attrs +
        '><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>'
      );
    }
    return (
      '<svg' +
      attrs +
      '><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>'
    );
  }

  function commandChannelFlags(c) {
    var flags = [];
    if (c && c.oral && c.oral.enabled) flags.push('voice');
    if (c && c.key && c.key.enabled) flags.push('key');
    if (c && c.pad && c.pad.enabled) flags.push('pad');
    if (c && c.gesture && c.gesture.enabled) flags.push('cam');
    return flags;
  }

  function commandSearchHay(c) {
    var parts = [
      c && c.label,
      c && c.actionId,
      c && c.slotId,
      c && c.oral && c.oral.say,
      c && c.key && c.key.chord,
      c && c.pad && c.pad.microKeyId,
      c && c.gesture && c.gesture.bindingRef,
      CAPABILITY_KIND_LABELS[(c && c.capabilityKind) || ''] || ''
    ];
    return parts
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
  }

  function rowChannelIconsHtml(c) {
    var on = {
      voice: !!(c && c.oral && c.oral.enabled),
      key: !!(c && c.key && c.key.enabled),
      pad: !!(c && c.pad && c.pad.enabled),
      cam: !!(c && c.gesture && c.gesture.enabled)
    };
    function ch(kind) {
      return (
        '<span class="hcl-ch' +
        (on[kind] ? ' is-on ' + kind : '') +
        '" aria-hidden="true"><span class="hcl-ch-ico">' +
        channelIconSvg(kind) +
        '</span></span>'
      );
    }
    return (
      '<span class="hcl-chs" aria-hidden="true">' +
      ch('voice') +
      ch('key') +
      ch('pad') +
      ch('cam') +
      '</span>'
    );
  }

  function renderCommandRow(c, focus) {
    var cmdRef = c.commandRef || commandIdentity(c);
    var on = cmdMatchesFocus(c, focus);
    var chFlags = commandChannelFlags(c).join(' ');
    var meta = channelMetaLabel(c);
    // Flat row: title + bound summary + four channel icons. Detail editors live right.
    return (
      '<button type="button" class="hcl-row' +
      (on ? ' is-focus' : '') +
      '" data-hcl-cmd="' +
      esc(cmdRef) +
      '" data-kind="' +
      esc(c.capabilityKind || '') +
      '" data-hcl-ch="' +
      esc(chFlags) +
      '" data-hcl-hay="' +
      esc(commandSearchHay(c)) +
      '"><span class="hcl-row-main"><span class="hcl-name">' +
      esc(c.label) +
      '</span>' +
      (meta ? '<span class="hcl-sum">' + esc(meta) + '</span>' : '') +
      '</span>' +
      rowChannelIconsHtml(c) +
      '</button>'
    );
  }

  function renderSectionListHtml(list, focus) {
    // 文件夹内扁平行：形态差异用行内徽章，不再加子目录标题
    return list
      .map(function (c) {
        return renderCommandRow(c, focus);
      })
      .join('');
  }

  function cmdMatchesFocus(c, focus) {
    if (!focus || !c) return false;
    var cmdRef = c.commandRef || commandIdentity(c);
    return (
      cmdRef === focus ||
      c.slotId === focus ||
      (c.oral && c.oral.itemId === focus) ||
      c.actionId === focus ||
      c.voiceSlotId === focus ||
      c.padSlotId === focus ||
      c.keySlotId === focus
    );
  }

  function channelFilterChipHtml(id, label, icoKind) {
    var u = ui();
    var cur = String(u.habitListChannel || 'all').trim() || 'all';
    var on = cur === id;
    return (
      '<button type="button" class="hcl-chip' +
      (id !== 'all' ? ' ' + id : ' all') +
      (on ? ' is-on' : '') +
      '" data-hcl-ch-filter="' +
      esc(id) +
      '" title="' +
      esc(label) +
      '" aria-label="' +
      esc(label) +
      '" aria-pressed="' +
      (on ? 'true' : 'false') +
      '"><span class="hcl-ch-ico">' +
      channelIconSvg(icoKind || id) +
      '</span></button>'
    );
  }

  function applyHabitListFilter(host) {
    if (!host) return;
    var u = ui();
    var q = String(u.habitListQuery || '')
      .trim()
      .toLowerCase();
    var ch = String(u.habitListChannel || 'all').trim() || 'all';
    var rows = host.querySelectorAll('.hcl-list > [data-hcl-cmd]');
    var n = 0;
    var i;
    for (i = 0; i < rows.length; i++) {
      var row = rows[i];
      var hay = String(row.getAttribute('data-hcl-hay') || '').toLowerCase();
      var rowCh = String(row.getAttribute('data-hcl-ch') || '');
      var okQ = !q || hay.indexOf(q) >= 0;
      var okC = ch === 'all' || (' ' + rowCh + ' ').indexOf(' ' + ch + ' ') >= 0;
      var show = okQ && okC;
      row.hidden = !show;
      if (show) n += 1;
    }
    var secs = host.querySelectorAll('.hcl-sec[data-cat]');
    var firstVisible = '';
    for (i = 0; i < secs.length; i++) {
      var sec = secs[i];
      var visible = 0;
      var kids = sec.querySelectorAll('.hcl-list > [data-hcl-cmd]');
      var j;
      for (j = 0; j < kids.length; j++) {
        if (!kids[j].hidden) visible += 1;
      }
      sec.hidden = visible === 0;
      var nEl = sec.querySelector('.hcl-sec-n');
      if (nEl) nEl.textContent = String(visible);
      if (visible > 0 && !firstVisible) firstVisible = sec.getAttribute('data-cat') || '';
    }
    // Search/filter: open every matching section. Idle: keep a single open folder.
    if (q || ch !== 'all') {
      for (i = 0; i < secs.length; i++) {
        if (!secs[i].hidden) secs[i].open = true;
      }
    } else {
      var prefer = String(u.habitListOpenSec || '').trim() || firstVisible;
      for (i = 0; i < secs.length; i++) {
        var cat = secs[i].getAttribute('data-cat') || '';
        secs[i].open = !secs[i].hidden && cat === prefer;
      }
      if (prefer) u.habitListOpenSec = prefer;
    }
    var countEl = host.querySelector('[data-hcl-count]');
    if (countEl) countEl.textContent = n + ' 条';
  }

  function renderMatrixHtml(mapping) {
    var model = buildModel(mapping);
    var focus = String(ui().habitMatchCommand || '').trim();
    var selected = focus
      ? model.commands.find(function (c) {
          return cmdMatchesFocus(c, focus);
        }) || null
      : null;
    var q = String(ui().habitListQuery || '');

    var bySec = Object.create(null);
    HABIT_SECTION_ORDER.forEach(function (k) {
      bySec[k] = [];
    });
    model.commands.forEach(function (c) {
      var sec = listSection(c);
      if (!HABIT_SECTION_LABELS[sec]) sec = 'app';
      bySec[sec].push(c);
    });
    var openSec = String(ui().habitListOpenSec || '').trim();
    if (selected) {
      openSec = listSection(selected);
      if (!HABIT_SECTION_LABELS[openSec]) openSec = 'app';
    } else if (!openSec || !(bySec[openSec] && bySec[openSec].length)) {
      openSec = '';
      HABIT_SECTION_ORDER.forEach(function (sec) {
        if (!openSec && bySec[sec] && bySec[sec].length) openSec = sec;
      });
    }
    ui().habitListOpenSec = openSec;
    var secHtml = HABIT_SECTION_ORDER.map(function (sec) {
      var list = bySec[sec] || [];
      if (!list.length) return '';
      var isOpen = sec === openSec;
      return (
        '<details class="hcl-acc hcl-sec" data-cat="' +
        esc(sec) +
        '"' +
        (isOpen ? ' open' : '') +
        '><summary class="hcl-sec-h"><span class="hcl-sec-lab">' +
        esc(HABIT_SECTION_LABELS[sec]) +
        '</span><span class="hcl-sec-n">' +
        esc(String(list.length)) +
        '</span></summary><div class="hcl-list" role="list">' +
        renderSectionListHtml(list, focus) +
        '</div></details>'
      );
    }).join('');

    var listHtml =
      '<aside class="hcl-zone hcl-cmds" aria-label="命令列表">' +
      '<div class="hcl-cmds-head"><strong>本习惯 · 命令</strong><span data-hcl-count>' +
      esc(String(model.commands.length)) +
      ' 条</span></div>' +
      '<input type="search" class="hcl-search" id="hclSearch" data-hcl-search placeholder="搜索命令、说法、和弦…" value="' +
      esc(q) +
      '" autocomplete="off" aria-label="搜索命令" />' +
      '<div class="hcl-chips" role="group" aria-label="按通道筛选">' +
      channelFilterChipHtml('all', '全部', 'all') +
      channelFilterChipHtml('voice', '口头', 'voice') +
      channelFilterChipHtml('key', '按键', 'key') +
      channelFilterChipHtml('pad', 'Soft Pad', 'pad') +
      channelFilterChipHtml('cam', '手势', 'cam') +
      '</div>' +
      (secHtml
        ? '<div class="hcl-sec-wrap">' + secHtml + '</div>'
        : '<p class="hcl-empty">暂无匹配命令。请到各通道页配置后再回此查看。</p>') +
      '</aside>';

    var detailHtml =
      '<div class="hcl-zone hcl-detail" id="habitCommandLinkEditor" aria-label="怎么调用">' +
      (selected
        ? renderEditorHtml(mapping, selected.commandRef || commandIdentity(selected))
        : '<p class="hcl-empty">搜索或点选一条命令，查看怎么调用</p>') +
      '</div>';

    return (
      '<section class="hcl-hub" data-hcl-root id="habitCommandLinkRoot">' +
      '<div class="hcl-body">' +
      listHtml +
      detailHtml +
      '</div></section>'
    );
  }

  function habitPadPillKeys(preferMicro) {
    // Curated Soft Pad surface — not the full numpad dump.
    var prefer = String(preferMicro || '').trim();
    var pick = ['AG01', 'AG02', 'AG03', 'AG04', 'AG05', 'AG06', 'ACT06', 'ACT08', 'ACT10', 'ACT12'];
    var seen = Object.create(null);
    var out = [];
    function push(id) {
      id = String(id || '').trim();
      if (!id || seen[id]) return;
      seen[id] = 1;
      out.push(id);
    }
    pick.forEach(push);
    if (prefer) push(prefer);
    return out;
  }

  function padPillsHtml(preferMicro) {
    var prefer = String(preferMicro || '').trim();
    var keys = habitPadPillKeys(prefer);
    var ag = [];
    var act = [];
    keys.forEach(function (k) {
      if (/^ACT/i.test(k)) act.push(k);
      else ag.push(k);
    });
    function pills(list) {
      return list
        .map(function (k) {
          var on = prefer === k;
          return (
            '<button type="button" class="hcl-pill pad' +
            (on ? ' is-on' : '') +
            '" data-hcl-pad-pill="' +
            esc(k) +
            '" aria-pressed="' +
            (on ? 'true' : 'false') +
            '"><span class="hcl-keycap-lab">' +
            esc(k) +
            '</span></button>'
          );
        })
        .join('');
    }
    return (
      (ag.length
        ? '<div class="hcl-pad-row"><span class="hcl-pad-row-lab">AG</span><div class="hcl-pills">' +
          pills(ag) +
          '</div></div>'
        : '') +
      (act.length
        ? '<div class="hcl-pad-row"><span class="hcl-pad-row-lab">ACT</span><div class="hcl-pills">' +
          pills(act) +
          '</div></div>'
        : '')
    );
  }

  /** Soft Pad float-style mini board (same chrome as Keys Soft Pad pick). */
  function habitSoftPadBoardHtml(mapping, preferMicro) {
    var PadUi = global.OneToneCodexMicroPadUi;
    if (!PadUi || typeof PadUi.renderHardwarePad !== 'function' || !mapping) {
      return padPillsHtml(preferMicro);
    }
    var src = mapping.codexMicroPad;
    // Preview-only copy: hide NAV arrows; never mutate the habit mapping.
    var pad = Object.assign({}, src && typeof src === 'object' ? src : {}, {
      enabled: true,
      showNavigationPad: false,
      navKeysEnabled: false,
      keys: src && Array.isArray(src.keys) ? src.keys : []
    });
    var board = '';
    try {
      board = PadUi.renderHardwarePad(mapping, pad, {
        mode: 'softPad',
        compact: true,
        omitFaceTopbar: true
      });
    } catch (_) {
      board = '';
    }
    if (!board) return padPillsHtml(preferMicro);
    return (
      '<div class="hcl-softpad-host keys-softpad-pick-host keys-softpad-pick-host--mini" data-hcl-softpad-board="1" aria-label="Soft Pad 悬浮键盘">' +
      board +
      '<div class="soft-pad-key-caption soft-pad-key-caption--sel hcl-softpad-cap" data-soft-pad-caption aria-live="polite">' +
      '<span class="soft-pad-key-caption__name" data-cap-name>悬停键帽看说明</span>' +
      '<span class="soft-pad-key-caption__chord" data-cap-chord hidden></span>' +
      '</div></div>' +
      '<p class="hcl-pad-hint">点键帽绑定 · 占位键需确认 · 再点已绑键可清除</p>'
    );
  }

  function paintHabitPadCaption(board, keyEl) {
    if (!board) return;
    var cap = board.querySelector('[data-soft-pad-caption]');
    if (!cap) return;
    var nameEl = cap.querySelector('.soft-pad-key-caption__name');
    var chordEl = cap.querySelector('.soft-pad-key-caption__chord');
    var name = '';
    var chord = '';
    if (keyEl) {
      name = String(keyEl.getAttribute('data-cap-name') || keyEl.getAttribute('aria-label') || '').trim();
      chord = String(keyEl.getAttribute('data-cap-chord') || '').trim();
      if (looksTechLabel(name)) {
        name =
          softSlotDisplayName(name) ||
          softSlotDisplayName(keyEl.getAttribute('data-hcl-bound-slot')) ||
          name;
      }
    }
    if (nameEl) nameEl.textContent = name || '悬停键帽看说明';
    if (chordEl) {
      chordEl.textContent = chord;
      if (chord) chordEl.removeAttribute('hidden');
      else chordEl.setAttribute('hidden', '');
    }
    cap.classList.toggle('is-active', !!name);
  }

  function syncHabitPadCaption(host) {
    var board = host && host.querySelector('[data-hcl-softpad-board]');
    if (!board) return;
    var focused = board.querySelector('.micro-hw__key.is-focused[data-micro-key]');
    paintHabitPadCaption(board, focused);
  }

  function bindHabitPadCaption(host) {
    var board = host && host.querySelector('[data-hcl-softpad-board]');
    if (!board || board.__hclCapBound) return;
    board.__hclCapBound = true;
    board.addEventListener('pointerover', function (ev) {
      var keyEl = ev.target && ev.target.closest && ev.target.closest('.micro-hw__key[data-micro-key]');
      if (!keyEl || !board.contains(keyEl)) return;
      paintHabitPadCaption(board, keyEl);
    });
    board.addEventListener('pointerout', function (ev) {
      var to = ev.relatedTarget;
      if (to && board.contains(to) && to.closest && to.closest('.micro-hw__key[data-micro-key]')) return;
      syncHabitPadCaption(host);
    });
  }

  function shortPadKeyLabel(name) {
    var s = String(name || '').trim();
    if (!s) return '';
    if (s.length <= 6) return s;
    return s.slice(0, 5) + '…';
  }

  /** Key titles + occupancy dots on the habit Soft Pad mini board (Mac locator parity). */
  function decorateHabitPadBoard(host, mapping) {
    var board = host && host.querySelector('[data-hcl-softpad-board]');
    if (!board) return;
    var edit = host.querySelector('[data-hcl-edit]');
    var focusSlot = String(
      (edit && (edit.getAttribute('data-hcl-pad-slot') || edit.getAttribute('data-hcl-edit'))) || ''
    ).trim();
    var byMicro = Object.create(null);
    var keys =
      mapping && mapping.codexMicroPad && Array.isArray(mapping.codexMicroPad.keys)
        ? mapping.codexMicroPad.keys
        : [];
    keys.forEach(function (k) {
      if (!k || k.enabled === false) return;
      var mid = String(k.microKeyId || '').trim();
      var sid = String(k.slotId || '').trim();
      if (!mid || !sid) return;
      byMicro[mid] = sid;
    });
    board.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
      var mid = String(el.getAttribute('data-micro-key') || '').trim();
      if (!mid || mid === 'ENC' || /^NAV_/i.test(mid)) return;
      var boundSlot = byMicro[mid] || '';
      var taken = !!(boundSlot && focusSlot && boundSlot !== focusSlot);
      el.classList.toggle('is-taken', taken);
      var lab = el.querySelector('.hcl-pk-lab');
      var name = String(el.getAttribute('data-cap-name') || '').trim() || mid;
      if (boundSlot) el.setAttribute('data-hcl-bound-slot', boundSlot);
      else el.removeAttribute('data-hcl-bound-slot');
      if (looksTechLabel(name) || !name || name === mid) {
        name =
          softSlotDisplayName(boundSlot) ||
          softSlotDisplayName(name) ||
          actionLabel(boundSlot) ||
          name;
      }
      if (name && !looksTechLabel(name)) el.setAttribute('data-cap-name', name);
      if (!lab) {
        lab = document.createElement('span');
        lab.className = 'hcl-pk-lab';
        lab.setAttribute('aria-hidden', 'true');
        el.appendChild(lab);
      }
      lab.textContent = shortPadKeyLabel(name);
      // Occupancy: CSS mutes .is-taken — no corner badge.
      var staleDot = el.querySelector('.hcl-pk-dot');
      if (staleDot) staleDot.remove();
    });
  }

  function markHabitPadFocus(host, micro) {
    if (!host) return;
    var want = String(micro || '').trim();
    host.querySelectorAll('.hcl-softpad-host .micro-hw__key[data-micro-key]').forEach(function (el) {
      var on = want && el.getAttribute('data-micro-key') === want;
      el.classList.toggle('is-focused', on);
    });
    syncHabitPadCaption(host);
  }

  function renderEditorHtml(mapping, slotId) {
    var cmd = resolveCommandRef(mapping, slotId);
    if (!cmd) {
      return '<p class="hcl-empty">未找到命令</p>';
    }
    if (!cmd.channels) enrichCommandChannels(cmd);
    if (!cmd.oral) cmd.oral = emptyChannel();
    if (!cmd.pad) cmd.pad = emptyChannel();
    if (!cmd.gesture) cmd.gesture = emptyChannel();
    var cmdRef = cmd.commandRef || commandIdentity(cmd);
    var padSlot = cmd.padSlotId || (cmd.actionId ? 'semantic:softPad:' + cmd.actionId : cmd.slotId);
    var preferMicro = String(ui().habitMatchPadMicroKey || cmd.pad.microKeyId || '').trim();
    var gestCur = String(cmd.gesture.bindingRef || '').trim();
    var sec = listSection(cmd);
    var secLab = HABIT_SECTION_LABELS[sec] || '';
    var keyVal = cmd.key && cmd.key.enabled && cmd.key.chord ? String(cmd.key.chord) : '';
    var gestPills = GESTURE_OPTS.map(function (g) {
      return (
        '<button type="button" class="hcl-pill cam' +
        (gestCur === g.id ? ' is-on' : '') +
        '" data-hcl-gest-pill="' +
        esc(g.id) +
        '" aria-pressed="' +
        (gestCur === g.id ? 'true' : 'false') +
        '">' +
        esc(g.label) +
        '</button>'
      );
    }).join('');
    return (
      '<div class="hcl-edit" data-hcl-edit="' +
      esc(cmdRef) +
      '" data-hcl-pad-slot="' +
      esc(padSlot) +
      '">' +
      '<h3 class="hcl-edit-title">' +
      esc(cmd.label || cmd.actionId || cmd.slotId || '命令') +
      '</h3>' +
      '<p class="hcl-edit-sub">分区「' +
      esc(secLab || '其它') +
      '」· 本页改完即生效</p>' +
      '<div class="hcl-edit-card" aria-label="四通道绑定">' +
      '<div class="hcl-lane voice">' +
      '<span class="hcl-lane-bar" aria-hidden="true"></span>' +
      '<span class="hcl-lane-ico" aria-hidden="true">' +
      channelIconSvg('voice') +
      '</span><div class="hcl-lane-body"><div class="hcl-lane-lab">语音</div>' +
      '<input type="text" class="hcl-say" id="hclPhraseInput" data-hcl-phrase-input value="' +
      esc(cmd.oral.say || '') +
      '" placeholder="说法，逗号分隔" aria-label="口头说法" />' +
      '</div></div>' +
      '<div class="hcl-lane key">' +
      '<span class="hcl-lane-bar" aria-hidden="true"></span>' +
      '<span class="hcl-lane-ico" aria-hidden="true">' +
      channelIconSvg('key') +
      '</span><div class="hcl-lane-body"><div class="hcl-lane-lab">按键</div>' +
      '<div class="hcl-key-row">' +
      '<button type="button" class="hcl-rec' +
      (keyVal ? ' is-bound' : '') +
      '" data-hcl-rec-key>' +
      (keyVal ? esc(keyVal) : '点此录键') +
      ' <span>' +
      (keyVal ? '再录覆盖' : '本页录制 · 键盘 / 侧键 / HID') +
      '</span></button>' +
      (keyVal
        ? '<button type="button" class="hcl-key-clear" data-hcl-clear-key title="清除按键">清除</button>'
        : '') +
      '</div></div></div>' +
      '<div class="hcl-lane pad">' +
      '<span class="hcl-lane-bar" aria-hidden="true"></span>' +
      '<span class="hcl-lane-ico" aria-hidden="true">' +
      channelIconSvg('pad') +
      '</span><div class="hcl-lane-body"><div class="hcl-lane-lab">Soft Pad' +
      (preferMicro ? '<span class="hcl-lane-cur">已绑 ' + esc(preferMicro) + '</span>' : '') +
      '</div><div class="hcl-pad-pick" role="group" aria-label="Soft Pad 键位">' +
      habitSoftPadBoardHtml(mapping, preferMicro) +
      '</div></div></div>' +
      '<div class="hcl-lane cam">' +
      '<span class="hcl-lane-bar" aria-hidden="true"></span>' +
      '<span class="hcl-lane-ico" aria-hidden="true">' +
      channelIconSvg('cam') +
      '</span><div class="hcl-lane-body"><div class="hcl-lane-lab">手势' +
      (gestCur
        ? '<span class="hcl-lane-cur cam">' + esc(gestureTitle(gestCur) || gestCur) + '</span>'
        : '') +
      '</div><div class="hcl-pills" role="group" aria-label="手势">' +
      gestPills +
      '</div></div></div></div>' +
      '<div class="hcl-edit-foot-row">' +
      '<p class="hcl-edit-foot">改完自动写入本习惯 · 无需「保存」· 按键本页可录</p>' +
      (lastBindUndo && lastBindUndo.mappingId === mapping.id
        ? '<button type="button" class="hcl-undo" data-hcl-undo title="撤销上一次绑定">撤销刚才</button>'
        : '') +
      '</div>' +
      (ui().habitMatchReturnPanel
        ? '<div class="hcl-actions"><button type="button" class="hcl-btn" data-hcl-return>返回原通道</button></div>'
        : '') +
      '</div>'
    );
  }

  function undoLastBind(host) {
    var u = lastBindUndo;
    if (!u || typeof u.restore !== 'function') return Promise.resolve(false);
    clearLastBindUndo();
    return Promise.resolve(u.restore()).then(function () {
      toastMsg('已撤销刚才的绑定');
      if (host) mountInto(host, currentMapping());
      return true;
    });
  }

  function currentMapping() {
    var id = String(state().selectedMappingId || '').trim();
    var core = global.OneToneMappingCore;
    if (id && core && core.byId) return core.byId(id);
    return null;
  }

  function mountInto(host, mapping) {
    if (!host) return;
    var m = mapping || currentMapping();
    var deep = consumeMatchDeepLink();
    if (deep.commandRef || deep.matchCommand) {
      ui().habitMatchCommand = deep.commandRef || deep.matchCommand;
    }
    host.innerHTML = renderMatrixHtml(m);
    applyHabitListFilter(host);
    bindHabitPadCaption(host);
    decorateHabitPadBoard(host, m);
    var focusCmd = String(ui().habitMatchCommand || '').trim();
    if (focusCmd && m) {
      var focused = resolveCommandRef(m, focusCmd);
      var focusMicro =
        (focused && focused.pad && focused.pad.microKeyId) ||
        String(ui().habitMatchPadMicroKey || '').trim();
      markHabitPadFocus(host, focusMicro);
    } else {
      syncHabitPadCaption(host);
    }
    var focusRow = host.querySelector('.hcl-row.is-focus');
    if (focusRow && focusRow.scrollIntoView) {
      try {
        focusRow.scrollIntoView({ block: 'nearest' });
      } catch (_) {}
    }
    if (!host.__hclBound) {
      host.__hclBound = true;
      host.addEventListener('click', onHostClick);
      host.addEventListener(
        'toggle',
        function (e) {
          var d = e && e.target;
          if (!d || !d.classList || !d.classList.contains('hcl-acc')) return;
          if (!d.open) {
            if (ui().habitListOpenSec === (d.getAttribute('data-cat') || '')) {
              ui().habitListOpenSec = '';
            }
            return;
          }
          var cat = d.getAttribute('data-cat') || '';
          ui().habitListOpenSec = cat;
          host.querySelectorAll('details.hcl-acc').forEach(function (other) {
            if (other !== d) other.open = false;
          });
        },
        true
      );
      host.addEventListener('input', function (e) {
        var t = e && e.target;
        if (!t || !t.getAttribute) return;
        if (t.getAttribute('data-hcl-search') != null) {
          ui().habitListQuery = String(t.value || '');
          applyHabitListFilter(host);
        }
      });
      host.addEventListener('change', function (e) {
        var t = e && e.target;
        if (!t || !t.getAttribute || t.getAttribute('data-hcl-phrase-input') == null) return;
        var m = currentMapping();
        var edit = host.querySelector('[data-hcl-edit]');
        var sid = edit && edit.getAttribute('data-hcl-edit');
        if (!m || !sid) return;
        var say = String(t.value || '').trim();
        var p = say ? setCommandPhrase(m, sid, say) : removeCommandPhrase(m, sid);
        p.then(function () {
          delete ui().habitMatchPadMicroKey;
          if (maybeReturnAfterSave()) return;
          mountInto(host, m);
        });
      });
      host.addEventListener('keydown', function (e) {
        var t = e && e.target;
        if (!t || !t.getAttribute || t.getAttribute('data-hcl-phrase-input') == null) return;
        if (e.key !== 'Enter') return;
        e.preventDefault();
        t.blur();
      });
    }
  }

  function openEditor(host, mapping, slotId) {
    ui().habitMatchCommand = slotId;
    mountInto(host, mapping);
  }

  function onHostClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var host = t.closest('[data-hcl-root]');
    if (!host) return;
    var m = currentMapping();
    if (!m) return;

    var openPanel = t.closest('[data-hcl-open-panel]');
    if (openPanel) {
      openChannelPanel(openPanel.getAttribute('data-hcl-open-panel'));
      return;
    }

    var chFilter = t.closest('[data-hcl-ch-filter]');
    if (chFilter) {
      ui().habitListChannel = chFilter.getAttribute('data-hcl-ch-filter') || 'all';
      host.querySelectorAll('[data-hcl-ch-filter]').forEach(function (btn) {
        var on = btn === chFilter;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      applyHabitListFilter(host);
      return;
    }

    function afterSave() {
      delete ui().habitMatchPadMicroKey;
      if (maybeReturnAfterSave()) return;
      mountInto(host, m);
    }

    var undoBtn = t.closest('[data-hcl-undo]');
    if (undoBtn) {
      undoLastBind(host);
      return;
    }

    var recKey = t.closest('[data-hcl-rec-key]');
    if (recKey) {
      var editKey = host.querySelector('[data-hcl-edit]');
      var keySid = editKey && editKey.getAttribute('data-hcl-edit');
      if (!keySid) return;
      startHabitKeyRecord(host, m, keySid, recKey, afterSave);
      return;
    }
    var clearKey = t.closest('[data-hcl-clear-key]');
    if (clearKey) {
      var editClear = host.querySelector('[data-hcl-edit]');
      var clearSid = editClear && editClear.getAttribute('data-hcl-edit');
      if (!clearSid) return;
      setCommandKeyChord(m, clearSid, '').then(afterSave);
      return;
    }

    var padBoardKey =
      t.closest('.hcl-softpad-host .micro-hw__key[data-micro-key]') ||
      t.closest('[data-hcl-softpad-board] .micro-hw__key[data-micro-key]');
    if (padBoardKey) {
      if (
        padBoardKey.classList.contains('is-disabled') ||
        padBoardKey.classList.contains('is-fixed-nav') ||
        padBoardKey.getAttribute('aria-disabled') === 'true'
      ) {
        return;
      }
      var boardMicro = String(padBoardKey.getAttribute('data-micro-key') || '').trim();
      if (!boardMicro || boardMicro === 'ENC' || /^NAV_/i.test(boardMicro)) return;
      var editBoard = host.querySelector('[data-hcl-edit]');
      var boardSlot =
        (editBoard && editBoard.getAttribute('data-hcl-pad-slot')) ||
        (editBoard && editBoard.getAttribute('data-hcl-edit'));
      if (!boardSlot) return;
      if (padBoardKey.classList.contains('is-focused')) boardMicro = '';
      confirmStealPadKey(m, boardSlot, boardMicro).then(function (ok) {
        if (!ok) return;
        setSoftPadBinding(m, boardSlot, boardMicro).then(afterSave);
      });
      return;
    }
    var padPill = t.closest('[data-hcl-pad-pill]');
    if (padPill) {
      var editPad = host.querySelector('[data-hcl-edit]');
      var padSlot =
        (editPad && editPad.getAttribute('data-hcl-pad-slot')) ||
        (editPad && editPad.getAttribute('data-hcl-edit'));
      if (!padSlot) return;
      var micro = padPill.getAttribute('data-hcl-pad-pill') || '';
      if (padPill.classList.contains('is-on')) micro = '';
      confirmStealPadKey(m, padSlot, micro).then(function (ok) {
        if (!ok) return;
        setSoftPadBinding(m, padSlot, micro).then(afterSave);
      });
      return;
    }
    var gestPill = t.closest('[data-hcl-gest-pill]');
    if (gestPill) {
      var editGest = host.querySelector('[data-hcl-edit]');
      var gestSid = editGest && editGest.getAttribute('data-hcl-edit');
      if (!gestSid) return;
      var gestId = gestPill.getAttribute('data-hcl-gest-pill') || '';
      if (gestPill.classList.contains('is-on')) gestId = '';
      setGestureBinding(m, gestSid, gestId).then(afterSave);
      return;
    }

    var row = t.closest('[data-hcl-cmd]');
    if (row) {
      openEditor(host, m, row.getAttribute('data-hcl-cmd'));
      return;
    }
    if (t.closest('[data-hcl-return]')) {
      returnToCaller();
    }
  }

  function paintWorkspaceHost() {
    var ws = document.getElementById('habitWorkspace');
    if (!ws) return;
    var mount = document.getElementById('habitCommandLinkMount');
    if (!mount) {
      mount = document.createElement('div');
      mount.id = 'habitCommandLinkMount';
      mount.className = 'hcl-mount';
      ws.appendChild(mount);
    }
    mountInto(mount, currentMapping());
  }

  global.OneToneHabitCommandLink = {
    buildModel: buildModel,
    commandIdentity: commandIdentity,
    actionCtaLabel: actionCtaLabel,
    stateBadgeLabel: stateBadgeLabel,
    setCommandPhrase: setCommandPhrase,
    removeCommandPhrase: removeCommandPhrase,
    setCommandKeyChord: setCommandKeyChord,
    setSoftPadBinding: setSoftPadBinding,
    setGestureBinding: setGestureBinding,
    confirmStealPadKey: confirmStealPadKey,
    undoLastBind: undoLastBind,
    setCaptureHero: setCaptureHero,
    syncSlotVoicePhrase: syncSlotVoicePhrase,
    listPadMicroKeys: listPadMicroKeys,
    applyMatchDeepLink: applyMatchDeepLink,
    consumeMatchDeepLink: consumeMatchDeepLink,
    clearMatchDeepLink: clearMatchDeepLink,
    returnToCaller: returnToCaller,
    openHabitsMatch: openHabitsMatch,
    openChannelPanel: openChannelPanel,
    renderMatrixHtml: renderMatrixHtml,
    mountInto: mountInto,
    paintWorkspaceHost: paintWorkspaceHost
  };

  // Alias per plan naming on AgentCapabilityUi
  if (!global.OneToneAgentCapabilityUi) global.OneToneAgentCapabilityUi = {};
  global.OneToneAgentCapabilityUi.setSoftPadBinding = function (mapping, slotId, microKeyId) {
    return setSoftPadBinding(mapping, slotId, microKeyId);
  };
})(typeof window !== 'undefined' ? window : globalThis);
