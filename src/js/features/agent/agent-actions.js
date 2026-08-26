/**
 * AgentAction helpers + Soft Pad slots.
 * Semantic dotted catalog / aliases / feature gates: Rust is source of truth
 * (`cmd_semantic_action_catalog`). This file keeps slot templates + legacy ACTION
 * rows for bindings until edit surfaces write dotted ids; hydrate via fetchSemanticCatalog().
 *
 * Display groups:
 * - essentialSlots (5): UI「常用」展示分组
 * - globalSafeSlots (3): 全局默认 enabled（防误触）
 * 场景内再启用完整 5 项 essentials.
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
    { id: 'newThread', labelZh: '新建对话', labelEn: 'New chat', risk: 'confirm', scope: 'foregroundApp', mode: 'execute', phrasesZh: '新建对话', phrasesEn: 'new chat' },
    { id: 'undo', labelZh: '撤销', labelEn: 'Undo', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '撤销', phrasesEn: 'undo' },
    { id: 'quickSearch', labelZh: '快速搜索', labelEn: 'Quick search', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '搜索', phrasesEn: 'search' },
    { id: 'quickChat', labelZh: '快速聊天', labelEn: 'Quick chat', risk: 'confirm', scope: 'foregroundApp', mode: 'execute', phrasesZh: '快速聊天', phrasesEn: 'quick chat' },
    { id: 'commandPalette', labelZh: '命令菜单', labelEn: 'Command palette', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '打开命令菜单', phrasesEn: 'open command palette' },
    { id: 'openReviewTab', labelZh: '打开审查选项卡', labelEn: 'Open review tab', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '打开审查', phrasesEn: 'open review tab' },
    { id: 'toggleReviewPanel', labelZh: '显示/隐藏当前聊天审阅面板', labelEn: 'Toggle review panel', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '切换审阅面板', phrasesEn: 'toggle review panel' },
    { id: 'toggleSidebar', labelZh: '切换边栏', labelEn: 'Toggle sidebar', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '切换边栏', phrasesEn: 'toggle sidebar' },
    { id: 'openSettings', labelZh: '打开设置', labelEn: 'Open settings', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '打开设置', phrasesEn: 'open settings' },
    { id: 'navBack', labelZh: '返回', labelEn: 'Go back', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '返回', phrasesEn: 'go back' },
    { id: 'navForward', labelZh: '前进', labelEn: 'Go forward', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '前进', phrasesEn: 'go forward' },
    { id: 'openTerminal', labelZh: '打开终端', labelEn: 'Open terminal', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '打开终端', phrasesEn: 'open terminal' },
    { id: 'toggleBrowserPanel', labelZh: '显示/隐藏浏览器面板', labelEn: 'Toggle browser panel', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '切换浏览器面板', phrasesEn: 'toggle browser panel' },
    { id: 'newBrowserTab', labelZh: '打开浏览器标签', labelEn: 'New browser tab', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '打开浏览器标签', phrasesEn: 'new browser tab' },
    { id: 'focusBrowserAddressBar', labelZh: '聚焦浏览器地址栏', labelEn: 'Focus browser address bar', risk: 'safe', scope: 'foregroundApp', mode: 'execute', phrasesZh: '聚焦地址栏', phrasesEn: 'focus address bar' },
    { id: 'status', labelZh: '查看状态', labelEn: 'Status', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '查看状态', phrasesEn: 'show status', insert: '/status' },
    { id: 'plan', labelZh: '制定计划', labelEn: 'Plan', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '制定计划', phrasesEn: 'make a plan', insert: '/plan' },
    { id: 'review', labelZh: '审查', labelEn: 'Review', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '开始审查', phrasesEn: 'start review', insert: '/review' },
    { id: 'permissions', labelZh: '权限', labelEn: 'Permissions', risk: 'confirm', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '打开权限', phrasesEn: 'open permissions', insert: '/permissions' },
    { id: 'switchAgent', labelZh: '切换助手', labelEn: 'Switch agent', risk: 'confirm', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '切换助手', phrasesEn: 'switch agent', insert: '/agent' },
    { id: 'claudeModel', labelZh: 'Claude 模型', labelEn: 'Claude model', risk: 'safe', scope: 'global', mode: 'execute', phrasesZh: '切换 Claude 模型', phrasesEn: 'claude model', insert: '/model' },
    { id: 'switchModel', labelZh: '切换模型', labelEn: 'Switch model', risk: 'confirm', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '切换模型', phrasesEn: 'switch model', insert: '/model' },
    { id: 'appsOrPlugins', labelZh: '应用与插件', labelEn: 'Apps', risk: 'safe', scope: 'foregroundApp', mode: 'insertOnly', phrasesZh: '打开应用', phrasesEn: 'open apps', insert: '/apps' }
  ];

  var SLOTS = [
    { slotId: 'summonCodex', actionId: 'openAgent', labelZh: '召唤 Codex', labelEn: 'Summon Codex' },
    { slotId: 'pushToTalk', actionId: 'startDictation', labelZh: '开始说话', labelEn: 'Start talking' },
    { slotId: 'stopOrSend', actionId: 'stopOrSendDictation', labelZh: '结束或发送', labelEn: 'Stop or send' },
    { slotId: 'cancel', actionId: 'cancel', labelZh: '取消', labelEn: 'Cancel' },
    { slotId: 'newThread', actionId: 'newThread', labelZh: '新建对话', labelEn: 'New chat' },
    { slotId: 'undo', actionId: 'undo', labelZh: '撤销', labelEn: 'Undo' },
    { slotId: 'quickSearch', actionId: 'quickSearch', labelZh: '快速搜索', labelEn: 'Quick search' },
    { slotId: 'quickChat', actionId: 'quickChat', labelZh: '快速聊天', labelEn: 'Quick chat' },
    { slotId: 'commandPalette', actionId: 'commandPalette', labelZh: '命令菜单', labelEn: 'Command palette' },
    { slotId: 'openReviewTab', actionId: 'openReviewTab', labelZh: '打开审查选项卡', labelEn: 'Open review tab' },
    { slotId: 'toggleReviewPanel', actionId: 'toggleReviewPanel', labelZh: '显示/隐藏当前聊天审阅面板', labelEn: 'Toggle review panel' },
    { slotId: 'toggleSidebar', actionId: 'toggleSidebar', labelZh: '切换边栏', labelEn: 'Toggle sidebar' },
    { slotId: 'openSettings', actionId: 'openSettings', labelZh: '打开设置', labelEn: 'Open settings' },
    { slotId: 'navBack', actionId: 'navBack', labelZh: '返回', labelEn: 'Go back' },
    { slotId: 'navForward', actionId: 'navForward', labelZh: '前进', labelEn: 'Go forward' },
    { slotId: 'openTerminal', actionId: 'openTerminal', labelZh: '打开终端', labelEn: 'Open terminal' },
    { slotId: 'toggleBrowserPanel', actionId: 'toggleBrowserPanel', labelZh: '显示/隐藏浏览器面板', labelEn: 'Toggle browser panel' },
    { slotId: 'newBrowserTab', actionId: 'newBrowserTab', labelZh: '打开浏览器标签', labelEn: 'New browser tab' },
    { slotId: 'focusBrowserAddressBar', actionId: 'focusBrowserAddressBar', labelZh: '聚焦浏览器地址栏', labelEn: 'Focus browser address bar' },
    { slotId: 'status', actionId: 'status', labelZh: '查看状态', labelEn: 'Status' },
    { slotId: 'plan', actionId: 'plan', labelZh: '制定计划', labelEn: 'Plan' },
    { slotId: 'review', actionId: 'review', labelZh: '审查', labelEn: 'Review' },
    { slotId: 'permissions', actionId: 'permissions', labelZh: '权限', labelEn: 'Permissions' },
    { slotId: 'switchAgent', actionId: 'switchAgent', labelZh: '切换助手', labelEn: 'Switch agent' },
    { slotId: 'claudeModel', actionId: 'claudeModel', labelZh: 'Claude 模型', labelEn: 'Claude model' },
    { slotId: 'switchModel', actionId: 'switchModel', labelZh: '切换模型', labelEn: 'Switch model' },
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
    summonCodex: '',
    pushToTalk: 'Ctrl+Shift+D',
    stopOrSend: 'Enter',
    cancel: 'Escape',
    newThread: 'Ctrl+N',
    undo: 'Ctrl+Z',
    quickSearch: 'Ctrl+F',
    quickChat: 'Ctrl+Alt+N',
    commandPalette: 'Ctrl+K',
    openReviewTab: 'Ctrl+Shift+G',
    toggleReviewPanel: 'Ctrl+Alt+B',
    toggleSidebar: 'Ctrl+B',
    openSettings: 'Ctrl+,',
    navBack: 'Ctrl+[',
    navForward: 'Ctrl+]',
    openTerminal: 'Ctrl+`',
    toggleBrowserPanel: 'Ctrl+Shift+B',
    newBrowserTab: 'Ctrl+T',
    focusBrowserAddressBar: 'Ctrl+L',
    status: 'Ctrl+Alt+S',
    plan: 'Ctrl+Alt+P',
    review: 'Ctrl+Alt+R',
    permissions: 'Ctrl+Alt+,',
    switchAgent: 'Ctrl+Alt+.',
    claudeModel: '',
    switchModel: 'Ctrl+Alt+M',
    appsOrPlugins: 'Ctrl+Alt+A'
  };

  /** Editor chords shared by VS Code forks (Cursor / Trae / Qoder). Not WorkBuddy desktop. */
  var VSCODE_EDITOR_KEY_BY_SLOT = {
    summonCodex: '',
    pushToTalk: '',
    stopOrSend: 'Enter',
    cancel: 'Escape',
    newThread: 'Ctrl+N',
    undo: 'Ctrl+Z',
    quickSearch: 'Ctrl+F',
    quickChat: '',
    commandPalette: 'Ctrl+Shift+P',
    openReviewTab: '',
    toggleReviewPanel: '',
    toggleSidebar: 'Ctrl+B',
    openSettings: 'Ctrl+,',
    navBack: 'Alt+Left',
    navForward: 'Alt+Right',
    openTerminal: 'Ctrl+`',
    toggleBrowserPanel: '',
    newBrowserTab: 'Ctrl+T',
    focusBrowserAddressBar: '',
    status: '',
    plan: '',
    review: '',
    permissions: '',
    switchAgent: '',
    claudeModel: '',
    switchModel: '',
    appsOrPlugins: ''
  };

  /** Cursor IDE: Agent `Ctrl+I`, cancel generation.
   * Soft Pad mic follows OneTone voice input target key (default `RAlt`). */
  var CURSOR_DEFAULT_KEY_BY_SLOT = Object.assign({}, VSCODE_EDITOR_KEY_BY_SLOT, {
    cancel: 'Ctrl+Shift+Backspace',
    quickChat: 'Ctrl+I',
    // Cursor voice input should follow OneTone configured IME/voice key, not Cursor native toggle.
    pushToTalk: 'RAlt',
    // Avoid Ctrl+Alt+P — clashes with screenshot / pin tools.
    plan: 'Ctrl+Alt+Shift+P',
    switchAgent: 'Ctrl+Alt+.'
  });

  /** Trae IDE: side chat is Ctrl+U, inline is Ctrl+I. Pad quickChat → side chat. */
  var TRAE_DEFAULT_KEY_BY_SLOT = Object.assign({}, VSCODE_EDITOR_KEY_BY_SLOT, {
    quickChat: 'Ctrl+U'
  });

  /** Qoder IDE: chat panel Ctrl+L; reject-all Ctrl+Backspace. */
  var QODER_DEFAULT_KEY_BY_SLOT = Object.assign({}, VSCODE_EDITOR_KEY_BY_SLOT, {
    quickChat: 'Ctrl+L',
    cancel: 'Ctrl+Backspace'
  });

  /**
   * WorkBuddy desktop client (WorkBuddy.exe), not CodeBuddy IDE.
   * Wake is Ctrl+Space (global — do not inject from pad). New task Ctrl+N. Send Enter.
   */
  var WORKBUDDY_DEFAULT_KEY_BY_SLOT = {
    summonCodex: '',
    pushToTalk: '',
    stopOrSend: 'Enter',
    cancel: 'Escape',
    newThread: 'Ctrl+N',
    undo: 'Ctrl+Z',
    quickSearch: '',
    quickChat: '',
    commandPalette: '',
    openReviewTab: '',
    toggleReviewPanel: '',
    toggleSidebar: '',
    openSettings: '',
    navBack: '',
    navForward: '',
    openTerminal: '',
    toggleBrowserPanel: '',
    newBrowserTab: '',
    focusBrowserAddressBar: '',
    status: '',
    plan: '',
    review: '',
    permissions: '',
    switchAgent: '',
    claudeModel: '',
    switchModel: '',
    appsOrPlugins: ''
  };

  var VSCODE_DEFAULT_KEY_BY_SLOT = VSCODE_EDITOR_KEY_BY_SLOT;

  /** One-release generic dump (quickChat Ctrl+L for all forks). Heal toward per-client maps. */
  var STALE_GENERIC_VSCODE_KEY_BY_SLOT = Object.assign({}, VSCODE_EDITOR_KEY_BY_SLOT, {
    quickChat: 'Ctrl+L'
  });

  /** Shared Soft Pad pack path — chords are per-app, not this set. */
  var VSCODE_LINEAGE_APP_IDS = {
    'cursor-chat': 1,
    'workbuddy-chat': 1,
    'trae-work': 1,
    'trae-chat': 1,
    'trae-code': 1,
    'windsurf-chat': 1,
    'qoder-chat': 1
  };

  var PROVIDER_BY_APP = {
    'codex-chat': 'codex',
    'cursor-chat': 'cursor',
    'workbuddy-chat': 'workbuddy',
    'trae-work': 'trae',
    'trae-chat': 'trae',
    'trae-code': 'traeCode',
    'windsurf-chat': 'windsurf',
    'qoder-chat': 'qoder',
    'claude-code': 'claude',
    'minimax-chat': 'minimax'
  };

  function isVscodeLineageApp(appId) {
    return !!VSCODE_LINEAGE_APP_IDS[String(appId || '').trim()];
  }

  function providerIdForApp(appId) {
    return PROVIDER_BY_APP[String(appId || '').trim()] || '';
  }

  function defaultKeyForSlot(slotId) {
    var id = String(slotId || '').trim();
    return DEFAULT_KEY_BY_SLOT[id] || '';
  }

  function defaultCursorKeyForSlot(slotId) {
    var id = String(slotId || '').trim();
    return CURSOR_DEFAULT_KEY_BY_SLOT[id] || '';
  }

  function defaultVscodeKeyForSlot(slotId) {
    var id = String(slotId || '').trim();
    return VSCODE_EDITOR_KEY_BY_SLOT[id] || '';
  }

  function defaultKeyMapForApp(appId) {
    var app = String(appId || '').trim();
    if (app === 'cursor-chat') return CURSOR_DEFAULT_KEY_BY_SLOT;
    if (app === 'trae-work' || app === 'trae-chat' || app === 'trae-code' || app === 'windsurf-chat') return TRAE_DEFAULT_KEY_BY_SLOT;
    if (app === 'qoder-chat') return QODER_DEFAULT_KEY_BY_SLOT;
    if (app === 'workbuddy-chat') return WORKBUDDY_DEFAULT_KEY_BY_SLOT;
    if (app === 'codex-chat') return DEFAULT_KEY_BY_SLOT;
    return null;
  }

  function defaultKeyForMapping(m, slotId) {
    if (m && String((m.appTargetId) || '').trim() === 'cursor-chat' && String(slotId || '').trim() === 'pushToTalk') {
      var target = String(m.targetKey || '').trim();
      if (target) return target;
    }
    var map = defaultKeyMapForApp((m && m.appTargetId) || '');
    if (map) return map[String(slotId || '').trim()] || '';
    return defaultKeyForSlot(slotId);
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

  function labelForSlotForMapping(m, slotId) {
    var app = String((m && m.appTargetId) || '').trim();
    var id = String(slotId || '').trim();
    var names = {
      'cursor-chat': { zh: 'Cursor', en: 'Cursor' },
      'workbuddy-chat': { zh: 'WorkBuddy', en: 'WorkBuddy' },
      'trae-work': { zh: 'Trae Work', en: 'Trae Work' },
      'trae-chat': { zh: 'Trae Work', en: 'Trae Work' },
      'trae-code': { zh: 'Trae Code', en: 'Trae Code' },
      'windsurf-chat': { zh: 'Windsurf', en: 'Windsurf' },
      'qoder-chat': { zh: 'Qoder', en: 'Qoder' }
    };
    var name = names[app];
    if (name) {
      if (id === 'summonCodex') return isEnLocale() ? ('Focus ' + name.en) : ('聚焦 ' + name.zh);
      if (id === 'pushToTalk') return isEnLocale() ? 'Voice input' : '语音输入';
      if (id === 'cancel' && app === 'cursor-chat') {
        return isEnLocale() ? 'Cancel generation' : '取消生成';
      }
      if (id === 'plan' && app === 'cursor-chat') {
        return isEnLocale() ? 'Plan mode' : 'Plan 模式';
      }
      if (id === 'switchAgent' && app === 'cursor-chat') {
        return isEnLocale() ? 'Agent mode' : 'Agent 模式';
      }
    }
    return labelForSlot(slotById(id));
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

  function buildCursorChordBindings(opts) {
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
        triggerBinding: defaultCursorKeyForSlot(s.slotId),
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

  function buildScenarioBindings(m, opts) {
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
        triggerBinding: defaultKeyForMapping(m, s.slotId),
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
    return Promise.resolve(invoke('cmd_agent_action_execute', {
      providerId: opts.providerId || PROVIDER_ID,
      actionId: opts.actionId,
      mappingId: opts.mappingId || null,
      slotId: opts.slotId || null,
      executionMode: opts.executionMode || null,
      activationScope: opts.activationScope || null
    })).catch(function (err) {
      return {
        ok: false,
        reason: 'input_failed',
        detail: err && err.message ? err.message : String(err || 'invoke_failed')
      };
    });
  }

  /** Cached Rust catalog (source of truth). Null until hydrate. */
  var _semanticCatalog = null;

  var ALIAS_TO_CANONICAL = {
    startDictation: 'input.start',
    cancel: 'input.cancel',
    openAgent: 'agent.focus',
    focusComposer: 'agent.focus'
  };

  function resolveCanonicalActionId(raw, sendMode) {
    var id = String(raw || '').trim();
    if (id === 'stopOrSendDictation') {
      return String(sendMode || '').toLowerCase() === 'auto' ? 'input.send' : 'input.commit';
    }
    return ALIAS_TO_CANONICAL[id] || id;
  }

  function hydrateSemanticCatalog(dto) {
    if (!dto || typeof dto !== 'object') return null;
    _semanticCatalog = dto;
    return dto;
  }

  function fetchSemanticCatalog() {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return Promise.resolve(_semanticCatalog);
    return Promise.resolve(invoke('cmd_semantic_action_catalog'))
      .then(function (dto) {
        return hydrateSemanticCatalog(dto);
      })
      .catch(function () {
        return _semanticCatalog;
      });
  }

  function semanticCatalog() {
    return _semanticCatalog;
  }

  function featureDynamicContextActions() {
    return !!(
      _semanticCatalog && _semanticCatalog.featureDynamicContextActions
    );
  }

  function featureActionPickerUi() {
    return !!(_semanticCatalog && _semanticCatalog.featureActionPickerUi);
  }

  function routeSemanticAction(opts) {
    opts = opts || {};
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) {
      return Promise.resolve({
        status: 'failed',
        reasonCode: 'no_invoke',
        actionId: opts.actionId || ''
      });
    }
    return Promise.resolve(
      invoke('cmd_semantic_action_route', {
        actionId: opts.actionId,
        sourceChannel: opts.sourceChannel || 'key',
        mappingId: opts.mappingId || null,
        providerId: opts.providerId != null ? opts.providerId : null,
        confirmationId: opts.confirmationId || null,
        slotId: opts.slotId || null,
        args: opts.args || null
      })
    ).catch(function (err) {
      return {
        status: 'failed',
        reasonCode: 'input_failed',
        detail: err && err.message ? err.message : String(err || 'invoke_failed'),
        actionId: opts.actionId || ''
      };
    });
  }

  // Boot: pull Rust catalog when IPC is ready (non-blocking).
  try {
    if (global.document && global.document.addEventListener) {
      global.document.addEventListener('DOMContentLoaded', function () {
        fetchSemanticCatalog();
      });
    } else {
      fetchSemanticCatalog();
    }
  } catch (_) {}

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
    buildCursorChordBindings: buildCursorChordBindings,
    buildScenarioBindings: buildScenarioBindings,
    defaultKeyForSlot: defaultKeyForSlot,
    defaultCursorKeyForSlot: defaultCursorKeyForSlot,
    defaultVscodeKeyForSlot: defaultVscodeKeyForSlot,
    defaultKeyForMapping: defaultKeyForMapping,
    isVscodeLineageApp: isVscodeLineageApp,
    providerIdForApp: providerIdForApp,
    DEFAULT_KEY_BY_SLOT: DEFAULT_KEY_BY_SLOT,
    CURSOR_DEFAULT_KEY_BY_SLOT: CURSOR_DEFAULT_KEY_BY_SLOT,
    VSCODE_DEFAULT_KEY_BY_SLOT: VSCODE_DEFAULT_KEY_BY_SLOT,
    STALE_GENERIC_VSCODE_KEY_BY_SLOT: STALE_GENERIC_VSCODE_KEY_BY_SLOT,
    TRAE_DEFAULT_KEY_BY_SLOT: TRAE_DEFAULT_KEY_BY_SLOT,
    QODER_DEFAULT_KEY_BY_SLOT: QODER_DEFAULT_KEY_BY_SLOT,
    WORKBUDDY_DEFAULT_KEY_BY_SLOT: WORKBUDDY_DEFAULT_KEY_BY_SLOT,
    defaultKeyMapForApp: defaultKeyMapForApp,
    cameraRecommendedActionIds: cameraRecommendedActionIds,
    cameraRecommendedPresencePatch: cameraRecommendedPresencePatch,
    agentActionToken: agentActionToken,
    parseAgentActionToken: parseAgentActionToken,
    labelForSlot: labelForSlot,
    labelForSlotForMapping: labelForSlotForMapping,
    phraseForAction: phraseForAction,
    insertTextForSlot: insertTextForSlot,
    slotSubForDisplay: slotSubForDisplay,
    displayActionForSlot: displayActionForSlot,
    execute: execute,
    resolveCanonicalActionId: resolveCanonicalActionId,
    fetchSemanticCatalog: fetchSemanticCatalog,
    hydrateSemanticCatalog: hydrateSemanticCatalog,
    semanticCatalog: semanticCatalog,
    featureDynamicContextActions: featureDynamicContextActions,
    featureActionPickerUi: featureActionPickerUi,
    routeSemanticAction: routeSemanticAction
  };
})(typeof window !== 'undefined' ? window : globalThis);
