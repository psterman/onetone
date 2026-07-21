/**
 * AgentAction catalog (mirrors Rust). Architecture only — not shown as jargon in UI.
 * User-facing copy uses capability labels (召唤 Codex / 开始说话 / …).
 *
 * Display groups:
 * - essentialSlots (5): UI「常用」展示分组
 * - globalSafeSlots (3): 全局默认 enabled（防误触）
 * 场景内再启用完整 5 项 essentials。
 */
(function (global) {
  'use strict';

  /** UI「常用」展示分组（不等于全局全启用） */
  var ESSENTIAL_SLOT_IDS = {
    summonCodex: 1,
    pushToTalk: 1,
    cancel: 1,
    commandPalette: 1,
    status: 1
  };

  /** 全局默认启用（召唤 / 开始说话 / 取消） */
  var GLOBAL_SAFE_SLOT_IDS = {
    summonCodex: 1,
    pushToTalk: 1,
    cancel: 1
  };

  var ACTIONS = [
    { id: 'openAgent', labelZh: '召唤 Codex', labelEn: 'Summon Codex', risk: 'safe', scope: 'global', mode: 'execute', phrasesZh: '打开 Codex', phrasesEn: 'open Codex' },
    { id: 'focusComposer', labelZh: '聚焦输入框', labelEn: 'Focus composer', risk: 'safe', scope: 'global', mode: 'execute', phrasesZh: '聚焦输入框', phrasesEn: 'focus composer' },
    { id: 'startDictation', labelZh: '开始说话', labelEn: 'Start talking', risk: 'confirm', scope: 'global', mode: 'execute', phrasesZh: '开始说话', phrasesEn: 'start talking' },
    { id: 'stopOrSendDictation', labelZh: '结束或发送', labelEn: 'Stop or send', risk: 'confirm', scope: 'foregroundApp', mode: 'execute', phrasesZh: '结束输入', phrasesEn: 'stop dictation' },
    { id: 'cancel', labelZh: '取消', labelEn: 'Cancel', risk: 'safe', scope: 'global', mode: 'execute', phrasesZh: '取消', phrasesEn: 'cancel' },
    { id: 'newThread', labelZh: '新聊天', labelEn: 'New thread', risk: 'confirm', scope: 'foregroundApp', mode: 'execute', phrasesZh: '新建对话', phrasesEn: 'new chat' },
    { id: 'quickChat', labelZh: '快速聊天', labelEn: 'Quick chat', risk: 'confirm', scope: 'foregroundApp', mode: 'execute', phrasesZh: '快速聊天', phrasesEn: 'quick chat' },
    { id: 'commandPalette', labelZh: '命令菜单', labelEn: 'Command palette', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '打开命令菜单', phrasesEn: 'open command palette' },
    { id: 'status', labelZh: '查看状态', labelEn: 'Status', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '查看状态', phrasesEn: 'show status', insert: '/status' },
    { id: 'plan', labelZh: '制定计划', labelEn: 'Plan', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '制定计划', phrasesEn: 'make a plan', insert: '/plan' },
    { id: 'review', labelZh: '审查', labelEn: 'Review', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '开始审查', phrasesEn: 'start review', insert: '/review' },
    { id: 'permissions', labelZh: '权限', labelEn: 'Permissions', risk: 'confirm', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '打开权限', phrasesEn: 'open permissions', insert: '/permissions' },
    { id: 'switchAgent', labelZh: '切换助手', labelEn: 'Switch agent', risk: 'confirm', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '切换助手', phrasesEn: 'switch agent', insert: '/agent' },
    { id: 'appsOrPlugins', labelZh: '应用与插件', labelEn: 'Apps', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '打开应用', phrasesEn: 'open apps', insert: '/apps' }
  ];

  var SLOTS = [
    { slotId: 'summonCodex', actionId: 'openAgent', labelZh: '召唤 Codex', labelEn: 'Summon Codex' },
    { slotId: 'pushToTalk', actionId: 'startDictation', labelZh: '开始说话', labelEn: 'Start talking' },
    { slotId: 'stopOrSend', actionId: 'stopOrSendDictation', labelZh: '结束或发送', labelEn: 'Stop or send' },
    { slotId: 'cancel', actionId: 'cancel', labelZh: '取消', labelEn: 'Cancel' },
    { slotId: 'newThread', actionId: 'newThread', labelZh: '新聊天', labelEn: 'New thread' },
    { slotId: 'quickChat', actionId: 'quickChat', labelZh: '快速聊天', labelEn: 'Quick chat' },
    { slotId: 'commandPalette', actionId: 'commandPalette', labelZh: '命令菜单', labelEn: 'Command palette' },
    { slotId: 'status', actionId: 'status', labelZh: '查看状态', labelEn: 'Status' },
    { slotId: 'plan', actionId: 'plan', labelZh: '制定计划', labelEn: 'Plan' },
    { slotId: 'review', actionId: 'review', labelZh: '审查', labelEn: 'Review' },
    { slotId: 'permissions', actionId: 'permissions', labelZh: '权限', labelEn: 'Permissions' },
    { slotId: 'switchAgent', actionId: 'switchAgent', labelZh: '切换助手', labelEn: 'Switch agent' },
    { slotId: 'appsOrPlugins', actionId: 'appsOrPlugins', labelZh: '应用与插件', labelEn: 'Apps' }
  ];

  var TEMPLATE_ID = 'codex-micro-13';
  var PROVIDER_ID = 'codex';
  var APP_TARGET_ID = 'codex-chat';

  /**
   * Codex App official shortcuts (developers.openai.com/codex/app/commands).
   * Insert-only slash slots keep OneTone chords for voice/keys overlay.
   */
  var DEFAULT_KEY_BY_SLOT = {
    summonCodex: 'Ctrl+Shift+P',
    pushToTalk: 'Ctrl+Shift+D',
    stopOrSend: 'Enter',
    cancel: 'Escape',
    newThread: 'Ctrl+N',
    quickChat: 'Ctrl+Alt+N',
    commandPalette: 'Ctrl+K',
    status: 'Ctrl+Alt+S',
    plan: 'Ctrl+Alt+P',
    review: 'Ctrl+Alt+R',
    permissions: 'Ctrl+Alt+,',
    switchAgent: 'Ctrl+Alt+.',
    appsOrPlugins: 'Ctrl+Alt+A'
  };

  function defaultKeyForSlot(slotId) {
    var id = String(slotId || '').trim();
    return DEFAULT_KEY_BY_SLOT[id] || '';
  }

  function actionById(id) {
    id = String(id || '').trim();
    for (var i = 0; i < ACTIONS.length; i++) {
      if (ACTIONS[i].id === id) return ACTIONS[i];
    }
    return null;
  }

  function slotById(id) {
    id = String(id || '').trim();
    for (var i = 0; i < SLOTS.length; i++) {
      if (SLOTS[i].slotId === id) return SLOTS[i];
    }
    return null;
  }

  function isEssentialSlot(slotId) {
    return !!ESSENTIAL_SLOT_IDS[String(slotId || '').trim()];
  }

  function isGlobalSafeSlot(slotId) {
    return !!GLOBAL_SAFE_SLOT_IDS[String(slotId || '').trim()];
  }

  /** Foreground-only essentials shown in「常用」but off by default globally. */
  function isForegroundEssentialSlot(slotId) {
    return isEssentialSlot(slotId) && !isGlobalSafeSlot(slotId);
  }

  function isEnLocale() {
    var lang = '';
    try {
      if (global.OneToneI18n && global.OneToneI18n.lang) lang = String(global.OneToneI18n.lang());
    } catch (_) {}
    return /^en/i.test(lang);
  }

  function phraseForAction(actionId) {
    var a = actionById(actionId);
    if (!a) return '';
    return isEnLocale() ? a.phrasesEn : a.phrasesZh;
  }

  function labelForSlot(slot) {
    if (!slot) return '';
    return isEnLocale() ? slot.labelEn : slot.labelZh;
  }

  /**
   * @param {'globalSafe'|'scenarioEssentials'|'scenarioAllKeys'} profile
   * @param {'key'|'voice'} [triggerType]
   * globalSafe: only summon/pushToTalk/cancel enabled
   * scenarioEssentials: all 5 essentials enabled (key + voice)
   * scenarioAllKeys: all 13 keys enabled; voice stays essentials
   */
  function slotEnabledByProfile(slotId, profile, triggerType) {
    profile = profile || 'scenarioEssentials';
    if (profile === 'globalSafe') return isGlobalSafeSlot(slotId);
    if (profile === 'scenarioAllKeys') {
      if (triggerType === 'key') return true;
      return isEssentialSlot(slotId);
    }
    return isEssentialSlot(slotId);
  }

  /**
   * Build key+voice bindings.
   * @param {{ enableProfile?: 'globalSafe'|'scenarioEssentials'|'scenarioAllKeys' }} opts
   */
  function buildCodexMicro13Bindings(opts) {
    opts = opts || {};
    var profile = opts.enableProfile || 'scenarioEssentials';
    var out = [];
    for (var i = 0; i < SLOTS.length; i++) {
      var s = SLOTS[i];
      var a = actionById(s.actionId);
      var scope = a ? a.scope : 'foregroundApp';
      var mode = a ? a.mode : 'execute';
      out.push({
        slotId: s.slotId,
        actionId: s.actionId,
        triggerType: 'key',
        triggerBinding: defaultKeyForSlot(s.slotId),
        enabled: slotEnabledByProfile(s.slotId, profile, 'key'),
        executionMode: mode,
        activationScope: scope
      });
      out.push({
        slotId: s.slotId,
        actionId: s.actionId,
        triggerType: 'voice',
        triggerBinding: phraseForAction(s.actionId),
        enabled: slotEnabledByProfile(s.slotId, profile, 'voice'),
        executionMode: mode,
        activationScope: scope
      });
    }
    return out;
  }

  /** Slash insert text for insertOnly slots (e.g. "/plan"), else ''. */
  function insertTextForSlot(slotId) {
    var s = slotById(slotId);
    if (!s) return '';
    var a = actionById(s.actionId);
    return (a && a.insert) ? String(a.insert) : '';
  }

  /**
   * UI subtitle for a slot: insertOnly →「插入 /plan」; else friendly chord fallback.
   * Does not replace chordForSlot (conflict detection still uses real chords).
   */
  function slotSubForDisplay(slotId, chordFriendly) {
    var insert = insertTextForSlot(slotId);
    if (insert) {
      return isEnLocale() ? ('Insert ' + insert) : ('插入 ' + insert);
    }
    return chordFriendly || '';
  }

  /** Same as slotSubForDisplay when chord is unknown — insert text or slot label. */
  function displayActionForSlot(slotId, chordFriendly) {
    var insert = insertTextForSlot(slotId);
    if (insert) {
      return isEnLocale() ? ('Insert ' + insert) : ('插入 ' + insert);
    }
    if (chordFriendly) return chordFriendly;
    return labelForSlot(slotById(slotId));
  }

  function essentialSlots() {
    return SLOTS.filter(function (s) { return isEssentialSlot(s.slotId); });
  }

  function globalSafeSlots() {
    return SLOTS.filter(function (s) { return isGlobalSafeSlot(s.slotId); });
  }

  function allSlots() {
    return SLOTS.slice();
  }

  /** Camera-recommended safe actions for menus (≤5). */
  function cameraRecommendedActionIds() {
    return ['openAgent', 'startDictation', 'cancel', 'status', 'commandPalette'];
  }

  /** Camera pack default bindings (safe only). */
  function cameraRecommendedPresencePatch() {
    return {
      triggers: { blink: true, shake: true },
      deliberateBlink: agentActionToken('startDictation'),
      shakeHead: agentActionToken('cancel'),
      openPalm: agentActionToken('openAgent'),
      okHand: agentActionToken('status'),
      fist: agentActionToken('commandPalette')
    };
  }

  function agentActionToken(actionId) {
    return 'agent:' + String(actionId || '').trim();
  }

  function parseAgentActionToken(token) {
    var s = String(token || '');
    if (s.indexOf('agent:') !== 0) return null;
    return s.slice(6).trim() || null;
  }

  function execute(opts) {
    opts = opts || {};
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return Promise.resolve({ ok: false, reason: 'input_failed', detail: 'no invoke' });
    return invoke('cmd_agent_action_execute', {
      providerId: opts.providerId || PROVIDER_ID,
      actionId: opts.actionId,
      mappingId: opts.mappingId || null,
      slotId: opts.slotId || null,
      executionMode: opts.executionMode || null,
      activationScope: opts.activationScope || null
    });
  }

  global.OneToneAgentActions = {
    TEMPLATE_ID: TEMPLATE_ID,
    PROVIDER_ID: PROVIDER_ID,
    APP_TARGET_ID: APP_TARGET_ID,
    DISCLAIMER_ZH: 'OneTone 推荐模板，非官方固定布局',
    DISCLAIMER_EN: 'OneTone recommended layout — not an official fixed keymap',
    ACTIONS: ACTIONS,
    SLOTS: SLOTS,
    actionById: actionById,
    slotById: slotById,
    isEssentialSlot: isEssentialSlot,
    isGlobalSafeSlot: isGlobalSafeSlot,
    isForegroundEssentialSlot: isForegroundEssentialSlot,
    slotEnabledByProfile: slotEnabledByProfile,
    essentialSlots: essentialSlots,
    globalSafeSlots: globalSafeSlots,
    allSlots: allSlots,
    buildCodexMicro13Bindings: buildCodexMicro13Bindings,
    defaultKeyForSlot: defaultKeyForSlot,
    DEFAULT_KEY_BY_SLOT: DEFAULT_KEY_BY_SLOT,
    cameraRecommendedActionIds: cameraRecommendedActionIds,
    cameraRecommendedPresencePatch: cameraRecommendedPresencePatch,
    agentActionToken: agentActionToken,
    parseAgentActionToken: parseAgentActionToken,
    labelForSlot: labelForSlot,
    phraseForAction: phraseForAction,
    insertTextForSlot: insertTextForSlot,
    slotSubForDisplay: slotSubForDisplay,
    displayActionForSlot: displayActionForSlot,
    execute: execute
  };
})(typeof window !== 'undefined' ? window : globalThis);
