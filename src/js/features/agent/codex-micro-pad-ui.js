/**
 * Codex Micro numpad layer UI — hardware 1:1 pad + Edit keycap modal.
 * Physical sourceScan/sourceExtended routes to agent slot; output chord stays on agentBindings.
 */
(function (global) {
  'use strict';

  var LAYOUT = {
    cells: [
      /* 5×5 PC-numpad topology: NAV col1 (space above ↑), right +/Enter tall */
      { microKeyId: 'ENC', uiLabelZh: '总开关', uiLabelEn: 'Power', kind: 'control', gridRow: 1, gridCol: 2 },
      { microKeyId: 'ACT06', uiLabelZh: '快速', uiLabelEn: 'Fast', kind: 'command', gridRow: 1, gridCol: 3 },
      { microKeyId: 'ACT07', uiLabelZh: '命令菜单', uiLabelEn: 'Command palette', kind: 'command', gridRow: 1, gridCol: 4 },
      { microKeyId: 'ACT08', uiLabelZh: '拒绝', uiLabelEn: 'Reject', kind: 'command', gridRow: 1, gridCol: 5 },
      { microKeyId: 'NAV_UP', uiLabelZh: '上', uiLabelEn: 'Up', kind: 'nav', gridRow: 2, gridCol: 1 },
      { microKeyId: 'AG00', uiLabelZh: '命令菜单', uiLabelEn: 'Command', kind: 'agent', gridRow: 2, gridCol: 2, agIndex: 0 },
      { microKeyId: 'AG01', uiLabelZh: '新建', uiLabelEn: 'New chat', kind: 'agent', gridRow: 2, gridCol: 3, agIndex: 1 },
      { microKeyId: 'AG02', uiLabelZh: '快速聊天', uiLabelEn: 'Quick chat', kind: 'agent', gridRow: 2, gridCol: 4, agIndex: 2 },
      { microKeyId: 'PLUS', uiLabelZh: '加', uiLabelEn: 'Plus', kind: 'command', gridRow: 2, gridCol: 5, gridRowSpan: 2 },
      { microKeyId: 'NAV_LEFT', uiLabelZh: '左', uiLabelEn: 'Left', kind: 'nav', gridRow: 3, gridCol: 1 },
      { microKeyId: 'AG03', uiLabelZh: '搜索', uiLabelEn: 'Find', kind: 'agent', gridRow: 3, gridCol: 2, agIndex: 3 },
      { microKeyId: 'AG04', uiLabelZh: '发送', uiLabelEn: 'Send', kind: 'agent', gridRow: 3, gridCol: 3, agIndex: 4 },
      { microKeyId: 'AG05', uiLabelZh: '取消', uiLabelEn: 'Cancel', kind: 'agent', gridRow: 3, gridCol: 4, agIndex: 5 },
      { microKeyId: 'NAV_DOWN', uiLabelZh: '下', uiLabelEn: 'Down', kind: 'nav', gridRow: 4, gridCol: 1 },
      { microKeyId: 'ACT09', uiLabelZh: '新建', uiLabelEn: 'New', kind: 'command', gridRow: 4, gridCol: 2 },
      { microKeyId: 'UNDO', uiLabelZh: '撤销', uiLabelEn: 'Undo', kind: 'command', gridRow: 4, gridCol: 3 },
      { microKeyId: 'SEARCH', uiLabelZh: '搜索', uiLabelEn: 'Find', kind: 'command', gridRow: 4, gridCol: 4 },
      { microKeyId: 'ACT12', uiLabelZh: '发送', uiLabelEn: 'Send', kind: 'command', gridRow: 4, gridCol: 5, gridRowSpan: 2 },
      { microKeyId: 'NAV_RIGHT', uiLabelZh: '右', uiLabelEn: 'Right', kind: 'nav', gridRow: 5, gridCol: 1 },
      { microKeyId: 'ACT10', uiLabelZh: '开始说话', uiLabelEn: 'Mic', kind: 'command', gridRow: 5, gridCol: 2, gridColSpan: 2 },
      { microKeyId: 'DOT', uiLabelZh: '小数点', uiLabelEn: 'Dot', kind: 'command', gridRow: 5, gridCol: 4 }
    ],
    numpadCells: [
      { microKeyId: 'ENC', uiLabelZh: '总开关', uiLabelEn: 'Power', kind: 'control', gridRow: 1, gridCol: 1 },
      { microKeyId: 'NP_DIV', uiLabelZh: '除', uiLabelEn: '/', kind: 'numpad', gridRow: 1, gridCol: 2, digit: '/' },
      { microKeyId: 'NP_MUL', uiLabelZh: '乘', uiLabelEn: '*', kind: 'numpad', gridRow: 1, gridCol: 3, digit: '*' },
      { microKeyId: 'NP_SUB', uiLabelZh: '减', uiLabelEn: '-', kind: 'numpad', gridRow: 1, gridCol: 4, digit: '-' },
      { microKeyId: 'NP7', uiLabelZh: '7', uiLabelEn: '7', kind: 'numpad', gridRow: 2, gridCol: 1, digit: '7' },
      { microKeyId: 'NP8', uiLabelZh: '8', uiLabelEn: '8', kind: 'numpad', gridRow: 2, gridCol: 2, digit: '8' },
      { microKeyId: 'NP9', uiLabelZh: '9', uiLabelEn: '9', kind: 'numpad', gridRow: 2, gridCol: 3, digit: '9' },
      { microKeyId: 'NP_ADD', uiLabelZh: '加', uiLabelEn: '+', kind: 'numpad', gridRow: 2, gridCol: 4, gridRowSpan: 2, digit: '+' },
      { microKeyId: 'NP4', uiLabelZh: '4', uiLabelEn: '4', kind: 'numpad', gridRow: 3, gridCol: 1, digit: '4' },
      { microKeyId: 'NP5', uiLabelZh: '5', uiLabelEn: '5', kind: 'numpad', gridRow: 3, gridCol: 2, digit: '5' },
      { microKeyId: 'NP6', uiLabelZh: '6', uiLabelEn: '6', kind: 'numpad', gridRow: 3, gridCol: 3, digit: '6' },
      { microKeyId: 'NP1', uiLabelZh: '1', uiLabelEn: '1', kind: 'numpad', gridRow: 4, gridCol: 1, digit: '1' },
      { microKeyId: 'NP2', uiLabelZh: '2', uiLabelEn: '2', kind: 'numpad', gridRow: 4, gridCol: 2, digit: '2' },
      { microKeyId: 'NP3', uiLabelZh: '3', uiLabelEn: '3', kind: 'numpad', gridRow: 4, gridCol: 3, digit: '3' },
      { microKeyId: 'NP_ENTER', uiLabelZh: '回车', uiLabelEn: 'Enter', kind: 'numpad', gridRow: 4, gridCol: 4, gridRowSpan: 2, digit: '↵' },
      { microKeyId: 'NP0', uiLabelZh: '0', uiLabelEn: '0', kind: 'numpad', gridRow: 5, gridCol: 1, gridColSpan: 2, digit: '0' },
      { microKeyId: 'NP_DOT', uiLabelZh: '小数点', uiLabelEn: '.', kind: 'numpad', gridRow: 5, gridCol: 3, digit: '.' }
    ],
    defaultRoutes: [
      { microKeyId: 'AG00', sourceScan: 0x47, sourceExtended: false, slotId: 'commandPalette', uiIconId: 'command' },
      { microKeyId: 'AG01', sourceScan: 0x48, sourceExtended: false, slotId: 'newThread', uiIconId: 'messagePlus' },
      { microKeyId: 'AG02', sourceScan: 0x49, sourceExtended: false, slotId: 'quickChat', uiIconId: 'sparkles' },
      { microKeyId: 'AG03', sourceScan: 0x4B, sourceExtended: false, slotId: 'quickSearch', uiIconId: 'search' },
      { microKeyId: 'AG04', sourceScan: 0x4C, sourceExtended: false, slotId: 'stopOrSend', uiIconId: 'send' },
      { microKeyId: 'AG05', sourceScan: 0x4D, sourceExtended: false, slotId: 'cancel', uiIconId: 'reject' },
      { microKeyId: 'ACT06', sourceScan: 0x37, sourceExtended: false, slotId: 'quickChat', uiIconId: 'sparkles' },
      { microKeyId: 'ACT07', sourceScan: 0x35, sourceExtended: true, slotId: 'commandPalette', uiIconId: 'command' },
      { microKeyId: 'ACT08', sourceScan: 0x4A, sourceExtended: false, slotId: 'cancel', uiIconId: 'reject' },
      { microKeyId: 'ACT09', sourceScan: 0x4F, sourceExtended: false, slotId: 'newThread', uiIconId: 'messagePlus' },
      { microKeyId: 'UNDO', sourceScan: 0x50, sourceExtended: false, slotId: '', uiIconId: 'undo' },
      { microKeyId: 'SEARCH', sourceScan: 0x51, sourceExtended: false, slotId: 'quickSearch', uiIconId: 'search' },
      { microKeyId: 'ACT10', sourceScan: 0x52, sourceExtended: false, slotId: 'pushToTalk', uiIconId: 'mic' },
      { microKeyId: 'ACT12', sourceScan: 0x1C, sourceExtended: true, slotId: 'stopOrSend', uiIconId: 'send' },
      { microKeyId: 'ENC', sourceScan: 0, sourceExtended: false, slotId: 'summonCodex', uiIconId: 'power' },
      { microKeyId: 'PLUS', sourceScan: 0x4E, sourceExtended: false, slotId: '', uiIconId: 'plus' },
      { microKeyId: 'DOT', sourceScan: 0x53, sourceExtended: false, slotId: '', uiIconId: 'dot' }
    ]
  };

  /** Codex Soft Pad openEditKeycap: one-press App-aligned slots only. */
  var CODEX_SOFT_PAD_SLOT_IDS = {
    summonCodex: 1,
    commandPalette: 1,
    newThread: 1,
    quickChat: 1,
    quickSearch: 1,
    pushToTalk: 1,
    stopOrSend: 1,
    cancel: 1,
    undo: 1,
    openReviewTab: 1,
    toggleReviewPanel: 1,
    toggleSidebar: 1,
    openSettings: 1,
    navBack: 1,
    navForward: 1,
    openTerminal: 1,
    toggleBrowserPanel: 1,
    newBrowserTab: 1,
    focusBrowserAddressBar: 1,
    runTargetSequence: 1
  };

  /** Cursor Soft Pad openEditKeycap: App chords + Plan/Agent mode. */
  var CURSOR_SOFT_PAD_SLOT_IDS = {
    summonCodex: 1,
    commandPalette: 1,
    newThread: 1,
    quickChat: 1,
    quickSearch: 1,
    pushToTalk: 1,
    stopOrSend: 1,
    pasteAndSend: 1,
    cancel: 1,
    undo: 1,
    toggleSidebar: 1,
    openSettings: 1,
    navBack: 1,
    navForward: 1,
    openTerminal: 1,
    newBrowserTab: 1,
    plan: 1,
    switchAgent: 1,
    runTargetSequence: 1
  };
  /** WorkBuddy / Trae / Qoder — no Plan/Agent composer modes. */
  var VSCODE_SOFT_PAD_SLOT_IDS = {
    summonCodex: 1,
    commandPalette: 1,
    newThread: 1,
    quickChat: 1,
    quickSearch: 1,
    pushToTalk: 1,
    stopOrSend: 1,
    cancel: 1,
    undo: 1,
    toggleSidebar: 1,
    openSettings: 1,
    navBack: 1,
    navForward: 1,
    openTerminal: 1,
    newBrowserTab: 1,
    runTargetSequence: 1
  };

  /** Default keycap icon when a capability is selected (beginner auto-suggest). */
  var SLOT_DEFAULT_ICON = {
    summonCodex: 'focus',
    commandPalette: 'command',
    newThread: 'messagePlus',
    quickChat: 'sparkles',
    quickSearch: 'search',
    pushToTalk: 'mic',
    stopOrSend: 'send',
    pasteAndSend: 'clipboardPaste',
    cancel: 'reject',
    undo: 'undo',
    openReviewTab: 'review',
    toggleReviewPanel: 'review',
    toggleSidebar: 'panelLeft',
    openSettings: 'settings',
    navBack: 'navLeft',
    navForward: 'navRight',
    openTerminal: 'terminal',
    toggleBrowserPanel: 'browser',
    newBrowserTab: 'browserPlus',
    focusBrowserAddressBar: 'search',
    plan: 'plan',
    switchAgent: 'agent',
    runTargetSequence: 'plan'
  };

  /** Prior SLOT_DEFAULT_ICON values — migrate only when still these (user custom stays). */
  var SLOT_WEAK_LEGACY_ICON = {
    commandPalette: 'palette',
    newThread: 'fork',
    quickChat: 'fast',
    toggleSidebar: 'folder',
    openSettings: 'status'
  };

  /**
   * Cursor Soft Pad scenes (allowlist only). Plain-language titles for beginners.
   * slot ids must stay inside CURSOR_SOFT_PAD_SLOT_IDS.
   */
  var CURSOR_SLOT_GROUPS = [
    {
      id: 'talk',
      labelZh: '说话、发出去、叫停',
      labelEn: 'Talk, send, stop',
      descZh: '输入这一轮：开麦、发送、粘贴发、取消',
      descEn: 'This turn: mic, send, paste-send, cancel',
      slots: ['pushToTalk', 'stopOrSend', 'pasteAndSend', 'cancel']
    },
    {
      id: 'open',
      labelZh: '开聊天、回到 Cursor',
      labelEn: 'Open chat / focus Cursor',
      descZh: '新开对话、拉开 Chat、从别的软件切回来',
      descEn: 'New chat, side chat, or focus Cursor',
      slots: ['newThread', 'quickChat', 'summonCodex']
    },
    {
      id: 'mode',
      labelZh: '换 AI 怎么干活',
      labelEn: 'How AI works',
      descZh: 'Plan 先想清楚，或 Agent 直接改代码',
      descEn: 'Plan first, or Agent edits directly',
      slots: ['plan', 'switchAgent']
    },
    {
      id: 'find',
      labelZh: '找文件或命令',
      labelEn: 'Find files or commands',
      descZh: '搜文件名，或打开命令面板',
      descEn: 'Quick Open or Command Palette',
      slots: ['quickSearch', 'commandPalette']
    },
    {
      id: 'nav',
      labelZh: '在窗口里走动',
      labelEn: 'Move around the UI',
      descZh: '前进后退、显示或隐藏侧栏',
      descEn: 'Back, forward, toggle sidebar',
      slots: ['navBack', 'navForward', 'toggleSidebar']
    },
    {
      id: 'tools',
      labelZh: '打开其它工具',
      labelEn: 'Other tools',
      descZh: '终端、浏览器、设置、撤销',
      descEn: 'Terminal, browser, settings, undo',
      slots: ['openTerminal', 'newBrowserTab', 'openSettings', 'undo']
    },
    {
      id: 'seq',
      labelZh: '跑我录的动作',
      labelEn: 'Run my recorded actions',
      descZh: '执行按键页「我录的键」里配好的步骤',
      descEn: 'Run the steps from Keys → My recorded keys',
      slots: ['runTargetSequence']
    }
  ];

  /** Default「我的常见」pack (Cursor Soft Pad). Overridden by pad.commonSlotIds when set. */
  var CURSOR_COMMON_DEFAULT_SLOTS = [
    'pushToTalk',
    'stopOrSend',
    'cancel',
    'plan',
    'newThread'
  ];

  /** Right command library: browse (按场景) | custom (本应用) */
  var layoutActionLayer = 'browse';
  /** Scene rail id from CURSOR_SLOT_GROUPS. Legacy '__common__' remaps away. */
  var layoutActionSceneId = 'talk';
  var LAYOUT_SCENE_COMMON = '__common__';
  /** Draft for custom shortcut / browse-record escape (never touches editDraft until save+bind). */
  var layoutCustomDraft = { name: '', phrases: '' };
  var layoutCustomRecChord = '';
  var layoutCustomRecListening = false;
  /** Rec sheet mode: custom (new shortcut) | layoutKey (write chord to current Soft Pad key). */
  var layoutRecSheetMode = 'custom';
  /** After custom save from browse sheet: also bind Soft Pad key. */
  var layoutCustomRecBindPad = false;
  /** Keys-tab channel rail — same semantics as #settingsPanelKeys trigger picker. */
  var layoutChannelTab = 'softPad';
  var layoutChannelRows = [];
  var layoutChannelQuery = '';
  var layoutSoftPadPickSubtab = 'dictation';
  var layoutCursorPickSubtab = 'talk';
  var LAYOUT_CHANNEL_TABS = ['ime', 'key', 'voice', 'camera', 'cursor', 'softPad'];
  /** Cross-channel browse sheet (legacy modal; rail replaces inline browse). */
  var layoutBrowseChannel = 'key';
  var layoutBrowseSelected = null;
  var layoutBrowseQuery = '';
  var layoutBrowseRows = [];
  var layoutBrowseView = 'browse';
  var layoutBrowseMapping = null;

  /** Human physical key names for edit subtitle (not capability labels, not AG ids). */
  var PHYSICAL_KEY_LABELS = {
    AG00: { zh: '数字 7', en: 'Numpad 7' },
    AG01: { zh: '数字 8', en: 'Numpad 8' },
    AG02: { zh: '数字 9', en: 'Numpad 9' },
    AG03: { zh: '数字 4', en: 'Numpad 4' },
    AG04: { zh: '数字 5', en: 'Numpad 5' },
    AG05: { zh: '数字 6', en: 'Numpad 6' },
    ACT09: { zh: '数字 1', en: 'Numpad 1' },
    UNDO: { zh: '数字 2', en: 'Numpad 2' },
    SEARCH: { zh: '数字 3', en: 'Numpad 3' },
    ACT10: { zh: '数字 0', en: 'Numpad 0' },
    DOT: { zh: '. 键', en: 'Numpad .' },
    ACT07: { zh: '/ 键', en: 'Numpad /' },
    ACT06: { zh: '* 键', en: 'Numpad *' },
    ACT08: { zh: '- 键', en: 'Numpad -' },
    PLUS: { zh: '+ 键', en: 'Numpad +' },
    ACT12: { zh: '回车', en: 'Enter' },
    ENC: { zh: '屏幕总开关', en: 'Screen power' },
    NAV_UP: { zh: '上方向键', en: 'Arrow Up' },
    NAV_DOWN: { zh: '下方向键', en: 'Arrow Down' },
    NAV_LEFT: { zh: '左方向键', en: 'Arrow Left' },
    NAV_RIGHT: { zh: '右方向键', en: 'Arrow Right' }
  };

  /** Legacy stock icons that looked like capabilities — treat as untouched for auto-correct.
   * Do NOT include `agent` / `plan` — those are Cursor Soft Pad capability glyphs. */
  var LEGACY_MISLEADING_ICONS = {
    claude: 1,
    status: 1,
    model: 1
  };

  var DEFAULT_ICON_BY_MICRO = {
    ACT06: 'sparkles',
    ACT07: 'command',
    ACT08: 'reject',
    ACT09: 'messagePlus',
    UNDO: 'undo',
    SEARCH: 'search',
    ACT10: 'mic',
    ACT12: 'send',
    AG00: 'command',
    AG01: 'messagePlus',
    AG02: 'sparkles',
    AG03: 'search',
    AG04: 'send',
    AG05: 'reject',
    ENC: 'power',
    JOY: 'empty',
    PLUS: 'plus',
    DOT: 'dot',
    NAV_UP: 'navUp',
    NAV_DOWN: 'navDown',
    NAV_LEFT: 'navLeft',
    NAV_RIGHT: 'navRight'
  };

  var ICON_DEFS = [
    { id: 'fast', label: 'FAST' },
    { id: 'approve', label: 'OK' },
    { id: 'reject', label: 'X' },
    { id: 'fork', label: 'FORK' },
    { id: 'mic', label: 'MIC' },
    { id: 'send', label: 'SEND' },
    { id: 'clipboardPaste', label: 'PASTE' },
    { id: 'new', label: 'NEW' },
    { id: 'power', label: 'PWR' },
    { id: 'focus', label: 'FOCUS' },
    { id: 'navUp', label: 'UP' },
    { id: 'navDown', label: 'DOWN' },
    { id: 'navLeft', label: 'LEFT' },
    { id: 'navRight', label: 'RIGHT' },
    { id: 'codex', label: 'CODEX' },
    { id: 'palette', label: 'CMD' },
    { id: 'command', label: 'CMD' },
    { id: 'status', label: 'STATUS' },
    { id: 'settings', label: 'SET' },
    { id: 'plan', label: 'PLAN' },
    { id: 'review', label: 'REVIEW' },
    { id: 'trash', label: 'TRASH' },
    { id: 'folder', label: 'FOLDER' },
    { id: 'panelLeft', label: 'SIDE' },
    { id: 'cloud', label: 'CLOUD' },
    { id: 'browser', label: 'WEB' },
    { id: 'browserPlus', label: 'TAB+' },
    { id: 'bug', label: 'BUG' },
    { id: 'merge', label: 'MERGE' },
    { id: 'terminal', label: 'TERM' },
    { id: 'agent', label: 'AGENT' },
    { id: 'claude', label: 'CLAUDE' },
    { id: 'cursor', label: 'CURSOR' },
    { id: 'model', label: 'MODEL' },
    { id: 'undo', label: 'UNDO' },
    { id: 'search', label: 'FIND' },
    { id: 'messagePlus', label: 'NEW' },
    { id: 'sparkles', label: 'CHAT' },
    { id: 'plus', label: 'PLUS' },
    { id: 'dot', label: 'DOT' },
    { id: 'empty', label: 'EMPT' }
  ];

  var ICON_SVG = {
    navUp: '<svg viewBox="0 0 24 24"><path d="M12 4l-8 8h5v8h6v-8h5z"/></svg>',
    navDown: '<svg viewBox="0 0 24 24"><path d="M12 20l8-8h-5V4H9v8H4z"/></svg>',
    navLeft: '<svg viewBox="0 0 24 24"><path d="M4 12l8-8v5h8v6h-8v5z"/></svg>',
    navRight: '<svg viewBox="0 0 24 24"><path d="M20 12l-8 8v-5H4V8h8V3z"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    dot: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg>',
    fast: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 10-14h-7l0-6z"/></svg>',
    approve: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
    reject: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    fork: '<svg viewBox="0 0 24 24"><path d="M7 4v8a4 4 0 004 4h2a4 4 0 004-4V4"/><path d="M17 4l3 3-3 3M7 4L4 7l3 3"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M4 12h12"/><path d="M12 6l6 6-6 6"/><path d="M20 7v10"/></svg>',
    /* Lucide clipboard-paste */
    clipboardPaste: '<svg viewBox="0 0 24 24"><path d="M15 2H9a1 1 0 00-1 1v2h8V3a1 1 0 00-1-1z"/><path d="M8 4H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2v-2"/><path d="M16 4h2a2 2 0 012 2v4"/><path d="M21 14H11"/><path d="M15 10l-4 4 4 4"/></svg>',
    new: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    /* Mode toggle — same stroke language as search icon. */
    power: '<svg viewBox="0 0 24 24"><path d="M12 2v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/></svg>',
    focus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M4 12h4M16 12h4M12 4v4M12 16v4"/></svg>',
    codex: '<svg viewBox="0 0 24 24"><path d="M12 3l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>',
    /* Lucide command — ⌘ corners */
    command: '<svg viewBox="0 0 24 24"><path d="M15 6v12a3 3 0 103-3H6a3 3 0 103 3V6a3 3 0 10-3 3h12a3 3 0 10-3-3"/></svg>',
    status: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    /* Lucide settings — gear */
    settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>',
    review: '<svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>',
    /* Lucide panel-left */
    panelLeft: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 00.5-8 5.5 5.5 0 00-10.7 1.5A3.5 3.5 0 007 18z"/></svg>',
    browser: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M8 4v5"/></svg>',
    browserPlus: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 8h14M19 14v6M16 17h6"/></svg>',
    bug: '<svg viewBox="0 0 24 24"><path d="M9 9a3 3 0 016 0v1H9z"/><path d="M8 10h8v5a4 4 0 01-8 0z"/><path d="M5 12h3M16 12h3M5 16h3M16 16h3"/></svg>',
    merge: '<svg viewBox="0 0 24 24"><circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="12" r="2"/><path d="M7 8v8M9 12h6"/></svg>',
    terminal: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 10l3 2-3 2M12 14h5"/></svg>',
    agent: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 5v2M12 17v2M5 12h2M17 12h2"/></svg>',
    claude: '<svg viewBox="0 0 24 24"><path d="M12 3l2.2 6.2L21 12l-6.8 2.8L12 21l-2.2-6.2L3 12l6.8-2.8z"/></svg>',
    cursor: '<svg viewBox="0 0 24 24"><path d="M5 3l14 9-6.2 1.4L16 21l-3.2-1.8L10 14 5 3z"/></svg>',
    model: '<svg viewBox="0 0 24 24"><path d="M4 7h16v10H4z"/><path d="M8 7V5h8v2M8 17v2h8v-2"/><path d="M9 11h6M9 14h4"/></svg>',
    undo: '<svg viewBox="0 0 24 24"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a5 5 0 010 10h-1"/></svg>',
    search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6"/><path d="M16 16l4 4"/></svg>',
    /* Lucide message-square-plus */
    messagePlus: '<svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/><path d="M12 7v6M9 10h6"/></svg>',
    /* Lucide sparkles (compact) */
    sparkles: '<svg viewBox="0 0 24 24"><path d="M12 3l1.2 3.6L17 8l-3.8 1.4L12 13l-1.2-3.6L7 8l3.8-1.4z"/><path d="M19 14l.7 2.1L22 17l-2.3.9L19 20l-.7-2.1L16 17l2.3-.9z"/><path d="M5 14l.6 1.8L8 16.5l-2.4.7L5 19l-.6-1.8L2 16.5l2.4-.7z"/></svg>',
    empty: '<svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2" stroke-dasharray="3 3"/></svg>'
  };

  var SCAN_LABELS = {
    'sc4A:ext0': '小键盘 -',
    'sc50:ext0': '小键盘 2',
    'sc51:ext0': '小键盘 3',
    'sc4F:ext0': '小键盘 1',
    'sc52:ext0': '小键盘 0',
    'sc1C:ext1': '小键盘 Enter',
    'sc47:ext0': '小键盘 7',
    'sc48:ext0': '小键盘 8',
    'sc49:ext0': '小键盘 9',
    'sc4B:ext0': '小键盘 4',
    'sc4C:ext0': '小键盘 5',
    'sc4D:ext0': '小键盘 6',
    'sc53:ext0': '小键盘 .',
    'sc4E:ext0': '小键盘 +',
    'sc37:ext0': '小键盘 *',
    'sc35:ext1': '小键盘 /'
  };

  var activeHighlightId = '';
  var highlightSlotId = '';
  var previewMicroKeyId = '';
  /** Recognition-page UI mode: edit | run | try (trigger step is always click-to-preview). */
  var padUiMode = 'edit';
  var runPointerActiveId = '';
  var runPointerHoldMapping = null;
  var holdPointerUpInstalled = false;
  var holdSuppressCancel = false;
  var holdUiReleased = false;
  function isHoldMicroKey(m, microKeyId) {
    var pad = m && m.codexMicroPad;
    var route = routeForMicroKey(pad, microKeyId);
    if (!route || route.enabled === false || !String(route.slotId || '').trim()) return false;
    return String(route.slotId).trim() === 'pushToTalk';
  }

  function ensureHoldPointerUpListener() {
    if (holdPointerUpInstalled || typeof window === 'undefined') return;
    holdPointerUpInstalled = true;
    function endRunHold(e) {
      if (!runPointerActiveId || !runPointerHoldMapping) return;
      if (holdSuppressCancel && e && e.type === 'pointercancel') return;
      var id = runPointerActiveId;
      var m = runPointerHoldMapping;
      runPointerActiveId = '';
      runPointerHoldMapping = null;
      holdSuppressCancel = false;
      if (isHoldMicroKey(m, id)) holdUiReleased = true;
      applyPressedClass('');
      document.querySelectorAll('.micro-hw__key[data-micro-key="' + id + '"]').forEach(function (el) {
        el.classList.remove('is-pressed', 'is-active');
        el.setAttribute('data-run-status', 'idle');
      });
      applyPadRunStatusDom();
      fireMicroKey(m, id, 'up');
    }
    window.addEventListener('pointerup', endRunHold, true);
    window.addEventListener('pointercancel', endRunHold, true);
    window.addEventListener('mouseup', endRunHold, true);
  }

  /** Pointer hold — same down/up path as physical Numpad0 (pushToTalk). */
  function bindHoldFirePointer(el, m, id) {
    ensureHoldPointerUpListener();
    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      runPointerActiveId = id;
      runPointerHoldMapping = m;
      if (isHoldMicroKey(m, id)) {
        holdSuppressCancel = true;
        holdUiReleased = false;
      }
      applyPressedClass(id);
      el.classList.add('is-pressed', 'is-active');
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      fireMicroKey(m, id, 'down');
    });
    el.addEventListener('click', function (e) {
      e.preventDefault();
    });
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      if (softPadPanelActive()) softPadPreviewEditKey(m, id);
      else openEditKeycap(m, id);
    });
  }

  function bindTapFirePointer(el, m, id) {
    ensureHoldPointerUpListener();
    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      runPointerActiveId = id;
      runPointerHoldMapping = m;
      if (isHoldMicroKey(m, id)) {
        holdSuppressCancel = true;
        holdUiReleased = false;
      }
      applyPressedClass(id);
      el.classList.add('is-pressed', 'is-active');
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      fireMicroKey(m, id, 'down');
    });
    el.addEventListener('click', function (e) {
      e.preventDefault();
    });
  }

  var tryKeydownHandler = null;
  var tryKeydownUntil = 0;
  var padRunStatus = 'idle';
  var padRunMicroKeyId = '';
  var padRunTimer = null;
  var PAD_STATUS_MS = { running: 800, done: 600, failed: 1200 };
  /** M4: JOY direction mode window (ms). Arrow/Enter only while active. */
  var JOY_DIR_MS = 3000;
  var joyDirUntil = 0;
  var joyDirTimer = null;
  var joyDirKeyHandler = null;
  var joyDirMapping = null;
  var readinessPollTimer = null;
  var lastReadiness = null;
  /** Settings preview only — does not touch overlay session / config. */
  var previewPadMode = 'codex';
  /** Edit-keycap modal draft (strict mode requires declaration). */
  var editDraft = null;

  var PRIMARY_MICRO_IDS = [
    'AG00', 'AG01', 'AG02', 'AG03', 'AG04', 'AG05',
    'ACT06', 'ACT07', 'ACT08', 'ACT09', 'ACT10', 'ACT12', 'ENC',
    'UNDO', 'SEARCH', 'PLUS', 'DOT'
  ];

  var ENHANCE_MICRO_IDS = {
    ENC_CW: true,
    ENC_CC: true,
    NAV_UP: true,
    NAV_DOWN: true,
    NAV_LEFT: true,
    NAV_RIGHT: true,
    NAV_PRESS: true
  };

  var LAYOUT_PROFILES = ['beginner', 'standard', 'advanced'];
  /** All known skins (incl. legacy vibe-dark). */
  var PAD_SKINS = ['default', 'glass-light', 'hybrid-pro', 'vibe-light', 'vibe-dark'];
  /** User-selectable skins — vibe-dark is theme-auto only (hidden from picker). */
  var PAD_SKIN_CHOICES = ['default', 'glass-light', 'hybrid-pro', 'vibe-light'];

  function normalizePadSkin(raw) {
    var s = String(raw || '').trim().toLowerCase();
    return PAD_SKINS.indexOf(s) >= 0 ? s : 'default';
  }

  /** Persistable preference — never store vibe-dark (dark theme CSS handles it). */
  function canonicalizePadSkin(raw) {
    var s = normalizePadSkin(raw);
    return s === 'vibe-dark' ? 'vibe-light' : s;
  }

  function isAppDarkTheme() {
    try {
      if (document.documentElement.getAttribute('data-theme') === 'dark') return true;
      if (localStorage.getItem('vp_theme') === 'dark') return true;
    } catch (_) {}
    return false;
  }

  /**
   * Skin stamped on DOM. Soft Pad settings use preference id + html[data-theme] CSS.
   * Overlay may stamp vibe-dark when app theme is dark and preference is vibe-light.
   */
  function resolveEffectivePadSkin(raw, opts) {
    opts = opts || {};
    var base = canonicalizePadSkin(raw);
    if (opts.forOverlay && isAppDarkTheme() && base === 'vibe-light') return 'vibe-dark';
    return base;
  }

  var AGENT_NUMPAD_SUGGEST = {
    AG00: { sourceScan: 0x47, sourceExtended: false },
    AG01: { sourceScan: 0x48, sourceExtended: false },
    AG02: { sourceScan: 0x49, sourceExtended: false },
    AG03: { sourceScan: 0x4B, sourceExtended: false },
    AG04: { sourceScan: 0x4C, sourceExtended: false },
    AG05: { sourceScan: 0x4D, sourceExtended: false }
  };

  function t(key, fallback) {
    try {
      if (global.OneToneI18n && global.OneToneI18n.t) {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback != null ? fallback : key;
  }

  function lang() {
    try {
      if (global.OneToneI18n && global.OneToneI18n.lang) return global.OneToneI18n.lang();
    } catch (_) {}
    return 'zh-CN';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function agent() {
    return global.OneToneAgentActions;
  }

  function persist() {
    var p = global.OneToneConfigPersist;
    if (p && p.saveAsync) p.saveAsync();
    else if (p && p.save) p.save();
  }

  /** Checkbox flags only — avoid full cmd_save payload (假死 on keys panel). */
  var padFlagsPersistTimer = 0;
  var padFlagsPersistPending = null;
  function persistPadFlags(m) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !m.id || !pad) {
      persist();
      return;
    }
    // Coalesce rapid toggles — each click used to sync-save settings.json and 假死.
    padFlagsPersistPending = {
      mappingId: String(m.id),
      enabled: !!pad.enabled,
      requireNumLockOff: !!pad.requireNumLockOff,
      overlayEnabled: !!pad.overlayEnabled,
      requireForeground: pad.requireForeground !== false,
      navKeysEnabled: navKeysOn(pad)
    };
    if (padFlagsPersistTimer) clearTimeout(padFlagsPersistTimer);
    padFlagsPersistTimer = setTimeout(function () {
      padFlagsPersistTimer = 0;
      var args = padFlagsPersistPending;
      padFlagsPersistPending = null;
      if (!args) return;
      invoke('cmd_codex_micro_pad_set_flags', args).catch(function () {
        persist();
      });
    }, 120);
  }

  /** Layout profile / enhance / routes — quiet IPC; full cmd_save 假死'd Soft Pad「高级」. */
  var layoutPersistTimer = 0;
  var layoutPersistPending = null;

  function buildLayoutPersistArgs(m) {
    var pad = m && m.codexMicroPad;
    if (!m || !m.id || !pad) return null;
    var profile = String(pad.layoutProfile || 'custom');
    if (LAYOUT_PROFILES.indexOf(profile) < 0 && profile !== 'custom') profile = 'custom';
    return {
      mappingId: String(m.id),
      layoutProfile: profile,
      softwareEnhanceEnabled: !!pad.softwareEnhanceEnabled,
      keys: (pad.keys || []).map(function (k) {
        return {
          microKeyId: String(k.microKeyId || ''),
          sourceScan: Number(k.sourceScan) || 0,
          sourceExtended: !!k.sourceExtended,
          slotId: String(k.slotId || ''),
          uiIconId: String(k.uiIconId || ''),
          enabled: k.enabled !== false,
          advanced: !!k.advanced,
          lightRgb: String(k.lightRgb || k.light_rgb || '')
        };
      }),
      agentBindings: Array.isArray(m.agentBindings)
        ? m.agentBindings.map(function (b) {
          return {
            slotId: String(b.slotId || ''),
            actionId: String(b.actionId || ''),
            actionInstanceId: String(b.actionInstanceId || ''),
            actionArgs: b.actionArgs != null ? b.actionArgs : undefined,
            triggerType: String(b.triggerType || ''),
            triggerBinding: String(b.triggerBinding || ''),
            enabled: b.enabled !== false,
            executionMode: b.executionMode != null ? String(b.executionMode) : undefined,
            activationScope: String(b.activationScope || 'foregroundApp')
          };
        })
        : undefined,
      commonSlotIds: Array.isArray(pad.commonSlotIds) ? pad.commonSlotIds.slice() : undefined,
      customShortcuts: Array.isArray(pad.customShortcuts)
        ? pad.customShortcuts.map(function (c) {
          return {
            id: String(c.id || ''),
            name: String(c.name || ''),
            chord: String(c.chord || ''),
            phrases: String(c.phrases || ''),
            activationScope: String(c.activationScope || 'foregroundApp')
          };
        })
        : []
    };
  }

  function persistLayout(m, opts) {
    opts = opts || {};
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var args = buildLayoutPersistArgs(m);
    if (!invoke || !args) {
      // Soft Pad open: never fall back to full buildSavePayload.
      return Promise.resolve(null);
    }
    layoutPersistPending = args;
    function flush() {
      layoutPersistTimer = 0;
      var payload = layoutPersistPending;
      layoutPersistPending = null;
      if (!payload) return Promise.resolve(null);
      return invoke('cmd_codex_micro_pad_set_layout', payload).then(function (res) {
        if (res) applyEnsurePayloadToMapping(m, res);
        return res;
      }).catch(function (err) {
        try {
          padInvoke('cmd_app_log', {
            line: 'fe persistLayout fail ' + (err && err.message ? err.message : 'unknown')
          });
        } catch (_) {}
        // Do NOT fall back to full persist()/cmd_save — quiet IPC is required.
        return null;
      });
    }
    if (opts.immediate) {
      if (layoutPersistTimer) clearTimeout(layoutPersistTimer);
      layoutPersistTimer = 0;
      return flush();
    }
    if (layoutPersistTimer) clearTimeout(layoutPersistTimer);
    layoutPersistTimer = setTimeout(function () { flush(); }, 120);
    return Promise.resolve(null);
  }

  function persistLayoutNow(m) {
    return persistLayout(m, { immediate: true });
  }

  function padInvoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!fn) return Promise.resolve(null);
    return fn(cmd, args || {});
  }

  function applyEnsurePayloadToMapping(m, payload) {
    if (!m || !payload) return;
    var mid = String(payload.mappingId || payload.mapping_id || '').trim();
    if (mid && String(m.id || '') !== mid) return;
    if (payload.codexMicroPad) {
      var prevSkin = m.codexMicroPad && m.codexMicroPad.skin;
      m.codexMicroPad = payload.codexMicroPad;
      if (m.codexMicroPad) {
        if (!m.codexMicroPad.skin && prevSkin) m.codexMicroPad.skin = prevSkin;
        m.codexMicroPad.skin = canonicalizePadSkin(m.codexMicroPad.skin);
      }
    }
    if (Array.isArray(payload.agentBindings)) {
      m.agentBindings = payload.agentBindings;
    }
  }

  function readinessMessage(r) {
    r = r || {};
    if (r.ready) {
      return t('codexMicroPadReadinessReady', '已就绪：在 Codex 前台按数字键即可');
    }
    switch (r.blocker) {
      case 'no_mapping':
        return t('codexMicroPadReadinessNoMapping', '请先创建 Codex 应用场景');
      case 'mapping_off':
        return t('codexMicroPadReadinessMappingOff', '请启用 Codex 应用场景');
      case 'pad_off':
        return t('codexMicroPadReadinessPadOff', '请开启「启用小键盘」');
      case 'not_foreground':
        return t('codexMicroPadReadinessNotFg', '切到 Codex 桌面版后，数字键会自动映射到虚拟键盘');
      case 'num_lock':
        return t('codexMicroPadReadinessNumLock', '请关闭 NumLock，或取消「NumLock 关闭时接管」');
      case 'no_routes':
        return t('codexMicroPadReadinessNoRoutes', '正在初始化映射…');
      default:
        return t('codexMicroPadReadinessWaiting', '准备中…');
    }
  }

  function readinessStateClass(r) {
    r = r || {};
    if (r.ready) return 'ready';
    if (r.blocker === 'not_foreground') return 'waiting';
    return 'blocked';
  }

  function renderReadinessBanner(readiness) {
    readiness = readiness || lastReadiness || {};
    var state = readinessStateClass(readiness);
    return '<div class="codex-micro-pad__readiness is-' + esc(state) + '" data-readiness-state="' +
      esc(state) + '">' + esc(readinessMessage(readiness)) + '</div>';
  }

  function updateReadinessDom(host, readiness) {
    if (!host || !readiness) return;
    lastReadiness = readiness;
    var el = host.querySelector('.codex-micro-pad__readiness');
    if (!el) return;
    var state = readinessStateClass(readiness);
    el.className = 'codex-micro-pad__readiness is-' + state;
    el.setAttribute('data-readiness-state', state);
    el.textContent = readinessMessage(readiness);
    var cta = host.querySelector('.codex-micro-pad__cta-row');
    if (cta) cta.hidden = !!readiness.ready;
  }

  function stopReadinessPoll() {
    if (readinessPollTimer) {
      clearInterval(readinessPollTimer);
      readinessPollTimer = null;
    }
  }

  function startReadinessPoll(host) {
    stopReadinessPoll();
    function tick() {
      padInvoke('cmd_codex_micro_pad_get_readiness', {}).then(function (r) {
        if (!r || !host || host.hidden) return;
        updateReadinessDom(host, r);
      });
    }
    tick();
    readinessPollTimer = setInterval(tick, 1800);
  }

  function requestPadEnsureReady(m, cb) {
    return padInvoke('cmd_codex_micro_pad_ensure_ready', { locale: lang() }).then(function (res) {
      if (res && m) applyEnsurePayloadToMapping(m, res);
      if (res && res.readiness) lastReadiness = res.readiness;
      if (cb) cb(res);
      return res;
    });
  }

  function toast(msg) {
    try {
      if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
        global.OneToneUiFeedback.toast(msg);
        return;
      }
    } catch (_) {}
    try { console.log(msg); } catch (_) {}
  }

  function sourceId(scan, ext) {
    return 'sc' + Number(scan).toString(16).toUpperCase().padStart(2, '0') + ':ext' + (ext ? 1 : 0);
  }

  function scanLabel(scan, ext) {
    var id = sourceId(scan, ext);
    if (SCAN_LABELS[id]) return SCAN_LABELS[id];
    return id;
  }

  function cellLabel(cell) {
    var en = lang().toLowerCase().indexOf('en') === 0;
    return en ? (cell.uiLabelEn || cell.uiLabelZh) : (cell.uiLabelZh || cell.uiLabelEn);
  }

  function slotLabel(slotId, m) {
    if (isCursorCustomSlotId(slotId)) {
      var cs = findCustomShortcut(m && m.codexMicroPad, slotId);
      if (cs && cs.name) return cs.name;
      return slotId;
    }
    var A = agent();
    if (A && A.labelForSlotForMapping && m) {
      var mapped = A.labelForSlotForMapping(m, slotId);
      if (mapped) return mapped;
    }
    if (!A || !slotId) return slotId || '';
    var s = A.slotById ? A.slotById(slotId) : null;
    if (!s) return slotId;
    var en = lang().toLowerCase().indexOf('en') === 0;
    return en ? s.labelEn : s.labelZh;
  }

  function chordForSlot(m, slotId) {
    if (!m || !Array.isArray(m.agentBindings)) return '';
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (b && b.slotId === slotId && b.triggerType === 'key') {
        var raw = String(b.triggerBinding || '').trim();
        // Cursor Plan: treat empty / legacy Ctrl+Alt+P as the current default chord.
        if (
          isCursorSoftPadMapping(m) &&
          String(slotId) === 'plan' &&
          (!raw || raw.replace(/\s+/g, '').toLowerCase() === 'ctrl+alt+p')
        ) {
          var Aheal = agent();
          if (Aheal && Aheal.defaultKeyForMapping) {
            return Aheal.defaultKeyForMapping(m, slotId) || raw;
          }
        }
        return raw;
      }
    }
    var A = agent();
    if (A && A.defaultKeyForMapping) return A.defaultKeyForMapping(m, slotId);
    return A && A.defaultKeyForSlot ? A.defaultKeyForSlot(slotId) : '';
  }

  /**
   * Soft Pad caption (settings + preview): match floating overlay.
   * Cursor Plan/Agent → name + chord; Codex insertOnly → name +「插入 /x」.
   */
  function softPadKeyCaption(m, slotId, fallbackName) {
    var id = String(slotId || '').trim();
    var name = slotLabel(id, m) || fallbackName || id;
    var chord = friendlyChord(chordForSlot(m, id));
    if (id && isSoftPadInsertOnlySlot(id, m)) {
      var A = agent();
      var ins = A && A.insertTextForSlot ? A.insertTextForSlot(id) : '';
      if (ins) {
        chord = (lang().toLowerCase().indexOf('en') === 0 ? 'Insert ' : '插入 ') + ins;
      }
    }
    return { name: name, chord: chord };
  }

  /** Display subtitle: insertOnly →「插入 /xxx」; else friendly chord. */
  function slotSubForDisplay(m, slotId) {
    return softPadKeyCaption(m, slotId).chord;
  }

  function displayActionForSlot(m, slotId) {
    var cap = softPadKeyCaption(m, slotId);
    if (isSoftPadInsertOnlySlot(slotId, m) && cap.chord) return cap.chord;
    return cap.chord || cap.name;
  }

  function friendlyChord(raw) {
    var kl = global.OneToneKeyLabels;
    if (kl && kl.formatChord) return kl.formatChord(raw, lang());
    return raw;
  }

  function iconSvg(id) {
    return ICON_SVG[id] || ICON_SVG.empty;
  }

  /** True when icon is empty/stock/prior-capability leftover (safe to auto-replace for plan/agent). */
  function isSoftPadLeftoverIcon(iconId, microKeyId, exceptSlot) {
    var cur = String(iconId || '').trim();
    if (!cur || cur === 'empty' || cur === 'plus' || cur === 'dot') return true;
    var stock = DEFAULT_ICON_BY_MICRO[microKeyId] || '';
    if (stock && cur === stock) return true;
    var except = String(exceptSlot || '').trim();
    for (var k in SLOT_DEFAULT_ICON) {
      if (!Object.prototype.hasOwnProperty.call(SLOT_DEFAULT_ICON, k)) continue;
      if (except && k === except) continue;
      if (SLOT_DEFAULT_ICON[k] === cur) return true;
    }
    for (var wk in SLOT_WEAK_LEGACY_ICON) {
      if (!Object.prototype.hasOwnProperty.call(SLOT_WEAK_LEGACY_ICON, wk)) continue;
      if (SLOT_WEAK_LEGACY_ICON[wk] === cur) return true;
    }
    return !!LEGACY_MISLEADING_ICONS[cur];
  }

  function resolveIconId(route, microKeyId) {
    var slotId = route && route.slotId ? String(route.slotId).trim() : '';
    var cur = route && route.uiIconId ? String(route.uiIconId).trim() : '';
    // Cursor Plan/Agent: never keep leftover palette/fork/etc. from the previous binding.
    if (slotId === 'plan' || slotId === 'switchAgent') {
      var slotIcon = SLOT_DEFAULT_ICON[slotId] || '';
      if (slotIcon) return slotIcon;
    }
    if (cur) {
      var weak = SLOT_WEAK_LEGACY_ICON[slotId] || '';
      var want = SLOT_DEFAULT_ICON[slotId] || '';
      if (weak && want && cur === weak) return want;
      return cur;
    }
    return DEFAULT_ICON_BY_MICRO[microKeyId] || 'empty';
  }

  function seedRoute(r) {
    return {
      microKeyId: r.microKeyId,
      sourceScan: Number(r.sourceScan) || 0,
      sourceExtended: !!r.sourceExtended,
      slotId: String(r.slotId || ''),
      uiIconId: r.uiIconId || DEFAULT_ICON_BY_MICRO[r.microKeyId] || '',
      enabled: r.enabled !== false,
      advanced: !!r.advanced
    };
  }

  function defaultSeedRoutes() {
    var routes = LAYOUT.defaultRoutes.map(seedRoute);
    ['NAV_UP', 'NAV_DOWN', 'NAV_LEFT', 'NAV_RIGHT'].forEach(function (navId) {
      if (!routes.some(function (r) { return r.microKeyId === navId; })) {
        routes.push(seedRoute({
          microKeyId: navId,
          sourceScan: 0,
          sourceExtended: false,
          slotId: '',
          uiIconId: DEFAULT_ICON_BY_MICRO[navId] || 'empty',
          enabled: true,
          advanced: true
        }));
      }
    });
    return routes;
  }

  /** Migrate DIAL/NPAD* ghosts; never overwrite an already-bound target key. */
  function migrateLegacyKeys(keys) {
    var out = [];
    var npad0 = null;
    var npadEnter = null;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!k || !k.microKeyId) continue;
      var id = String(k.microKeyId);
      if (id === 'DIAL') {
        out.push(Object.assign({}, k, {
          microKeyId: 'ENC',
          uiIconId: k.uiIconId || 'codex'
        }));
        continue;
      }
      if (id === 'NPAD0') {
        npad0 = k;
        continue;
      }
      if (id === 'NPAD_ENTER') {
        npadEnter = k;
        continue;
      }
      out.push(k);
    }
    function findIdx(mid) {
      for (var j = 0; j < out.length; j++) {
        if (out[j] && out[j].microKeyId === mid) return j;
      }
      return -1;
    }
    if (npad0) {
      var encIdx = findIdx('ENC');
      if (encIdx < 0) {
        out.push(Object.assign({}, npad0, {
          microKeyId: 'ENC',
          uiIconId: npad0.uiIconId || 'codex'
        }));
      } else {
        var enc = out[encIdx];
        if (!String(enc.slotId || '').trim() && npad0.slotId) {
          enc.slotId = npad0.slotId;
          enc.enabled = npad0.enabled !== false;
          if (!enc.uiIconId) enc.uiIconId = 'codex';
        }
        // ENC stays screen-only — never steal Numpad0 from Mic.
        enc.sourceScan = 0;
        enc.sourceExtended = false;
      }
    }
    if (npadEnter) {
      var a7Idx = findIdx('ACT07');
      if (a7Idx < 0) {
        out.push(Object.assign({}, npadEnter, {
          microKeyId: 'ACT07',
          uiIconId: npadEnter.uiIconId || 'command'
        }));
      } else {
        var a7 = out[a7Idx];
        if (!String(a7.slotId || '').trim() && npadEnter.slotId) {
          a7.slotId = npadEnter.slotId;
          a7.enabled = npadEnter.enabled !== false;
          if (!a7.uiIconId) a7.uiIconId = 'command';
        }
        if (!(Number(a7.sourceScan) > 0) && Number(npadEnter.sourceScan) > 0) {
          a7.sourceScan = npadEnter.sourceScan;
          a7.sourceExtended = !!npadEnter.sourceExtended;
        }
      }
    }
    // Stock: mic was Numpad 2, ENC stole Numpad 0 — move mic to 0; ENC screen-only.
    var act10Idx = findIdx('ACT10');
    var encIdx2 = findIdx('ENC');
    if (act10Idx >= 0 && encIdx2 >= 0) {
      var mic = out[act10Idx];
      var dial = out[encIdx2];
      if (Number(mic.sourceScan) === 0x50 && !mic.sourceExtended
          && Number(dial.sourceScan) === 0x52 && !dial.sourceExtended) {
        mic.sourceScan = 0x52;
        dial.sourceScan = 0;
        dial.sourceExtended = false;
      }
    }
    // Always keep ENC screen-only (summon via virtual pad / overlay).
    var encFinal = findIdx('ENC');
    if (encFinal >= 0) {
      out[encFinal].sourceScan = 0;
      out[encFinal].sourceExtended = false;
      if (!String(out[encFinal].slotId || '').trim()) {
        out[encFinal].slotId = 'summonCodex';
        out[encFinal].enabled = true;
        if (!out[encFinal].uiIconId) out[encFinal].uiIconId = 'codex';
      }
    }
    return out;
  }

  function healEncScreenOnly(pad) {
    if (!pad || !Array.isArray(pad.keys)) return false;
    var changed = false;
    var enc = null;
    var act10 = null;
    for (var i = 0; i < pad.keys.length; i++) {
      var k = pad.keys[i];
      if (!k) continue;
      if (k.microKeyId === 'ENC') enc = k;
      if (k.microKeyId === 'ACT10') act10 = k;
    }
    if (enc && Number(enc.sourceScan) > 0) {
      if (act10 && !(Number(act10.sourceScan) > 0) && Number(enc.sourceScan) === 0x52) {
        act10.sourceScan = 0x52;
        act10.sourceExtended = false;
      }
      enc.sourceScan = 0;
      enc.sourceExtended = false;
      changed = true;
    }
    return changed;
  }

  /** Keep Cursor Soft Pad settings preview in sync with floating overlay (Plan/Agent). */
  function syncCursorSoftPadDisplay(m) {
    if (!isCursorSoftPadMapping(m)) return false;
    var changed = false;
    var pad = m.codexMicroPad;
    if (pad && Array.isArray(pad.keys)) {
      for (var i = 0; i < pad.keys.length; i++) {
        var k = pad.keys[i];
        if (!k) continue;
        var id = String(k.microKeyId || '');
        var slot = String(k.slotId || '').trim();
        // Drop Codex insertOnly leftovers (appsOrPlugins / review / …).
        if (slot && !CURSOR_SOFT_PAD_SLOT_IDS[slot]) {
          k.slotId = '';
          k.enabled = false;
          slot = '';
          changed = true;
        }
        if (id === 'PLUS' && !slot) {
          k.slotId = 'plan';
          k.enabled = true;
          slot = 'plan';
          changed = true;
        } else if (id === 'DOT' && !slot) {
          k.slotId = 'switchAgent';
          k.enabled = true;
          slot = 'switchAgent';
          changed = true;
        }
        if (slot === 'plan' || slot === 'switchAgent') {
          var want = SLOT_DEFAULT_ICON[slot] || '';
          var cur = String(k.uiIconId || '').trim();
          if (want && cur !== want && isSoftPadLeftoverIcon(cur, id, slot)) {
            k.uiIconId = want;
            changed = true;
          }
        } else if (slot && SLOT_DEFAULT_ICON[slot]) {
          // One-shot: old weak defaults (palette/folder/…) → Lucide-like ids.
          var wantSlot = SLOT_DEFAULT_ICON[slot];
          var curIcon = String(k.uiIconId || '').trim();
          var weak = SLOT_WEAK_LEGACY_ICON[slot] || '';
          if (wantSlot && weak && curIcon === weak) {
            k.uiIconId = wantSlot;
            changed = true;
          }
        }
      }
    }
    if (!Array.isArray(m.agentBindings)) m.agentBindings = [];
    var A = agent();
    var planChord = A && A.defaultKeyForMapping
      ? A.defaultKeyForMapping(m, 'plan')
      : 'Ctrl+Alt+Shift+P';
    var agentChord = A && A.defaultKeyForMapping
      ? A.defaultKeyForMapping(m, 'switchAgent')
      : 'Ctrl+Alt+.';
    var sawPlan = false;
    var sawAgent = false;
    for (var j = 0; j < m.agentBindings.length; j++) {
      var b = m.agentBindings[j];
      if (!b || String(b.triggerType || '') !== 'key') continue;
      var sid = String(b.slotId || '').trim();
      if (sid === 'plan') {
        sawPlan = true;
        var pt = String(b.triggerBinding || '').replace(/\s+/g, '').toLowerCase();
        if (!pt || pt === 'ctrl+alt+p') {
          b.triggerBinding = planChord;
          changed = true;
        }
        if (String(b.executionMode || '') === 'insertOnly') {
          b.executionMode = 'execute';
          changed = true;
        }
      } else if (sid === 'switchAgent') {
        sawAgent = true;
        if (!String(b.triggerBinding || '').trim() && agentChord) {
          b.triggerBinding = agentChord;
          changed = true;
        }
        if (String(b.executionMode || '') === 'insertOnly') {
          b.executionMode = 'execute';
          changed = true;
        }
      }
    }
    if (!sawPlan && planChord) {
      m.agentBindings.push({
        slotId: 'plan',
        actionId: 'plan',
        triggerType: 'key',
        triggerBinding: planChord,
        enabled: true,
        executionMode: 'execute',
        activationScope: 'foregroundApp'
      });
      changed = true;
    }
    if (!sawAgent && agentChord) {
      m.agentBindings.push({
        slotId: 'switchAgent',
        actionId: 'switchAgent',
        triggerType: 'key',
        triggerBinding: agentChord,
        enabled: true,
        executionMode: 'execute',
        activationScope: 'foregroundApp'
      });
      changed = true;
    }
    return changed;
  }

  /** Session heal cache — avoid JSON.stringify+migrate on every Soft Pad scheme click (假死风暴). */
  var padHealDone = Object.create(null);

  function defaultMiniChrome() {
    return {
      voiceChipEnabled: true,
      voiceChipWhen: 'listening',
      agentsBarEnabled: true,
      textPreviewEnabled: true,
      textPreviewWhen: 'listening',
      toolsBarEnabled: true,
      toolIds: [],
      expandBtnEnabled: true,
      closeBtnEnabled: true
    };
  }

  function ensureMiniChrome(pad) {
    if (!pad) return defaultMiniChrome();
    var d = defaultMiniChrome();
    var c = pad.miniChrome;
    if (!c || typeof c !== 'object') {
      pad.miniChrome = d;
      return pad.miniChrome;
    }
    if (c.voiceChipEnabled == null) c.voiceChipEnabled = d.voiceChipEnabled;
    if (c.voiceChipWhen !== 'armed') c.voiceChipWhen = 'listening';
    if (c.agentsBarEnabled == null) c.agentsBarEnabled = d.agentsBarEnabled;
    if (c.textPreviewEnabled == null) c.textPreviewEnabled = d.textPreviewEnabled;
    if (c.textPreviewWhen !== 'hasText') c.textPreviewWhen = 'listening';
    if (c.toolsBarEnabled == null) c.toolsBarEnabled = d.toolsBarEnabled;
    if (!Array.isArray(c.toolIds)) c.toolIds = [];
    if (c.expandBtnEnabled == null) c.expandBtnEnabled = d.expandBtnEnabled;
    if (c.closeBtnEnabled == null) c.closeBtnEnabled = d.closeBtnEnabled;
    pad.miniChrome = c;
    return c;
  }

  function invalidatePadHeal(m) {
    if (m && m.id) delete padHealDone[String(m.id)];
  }

  function ensurePad(m, opts) {
    opts = opts || {};
    if (!m) return null;
    if (opts.force || !m.codexMicroPad) {
      m.codexMicroPad = {
        enabled: true,
        requireForeground: true,
        requireNumLockOff: false,
        showNavigationPad: true,
        capturePhysicalArrows: false,
        overlayEnabled: true,
        layoutProfile: 'custom',
        purpose: 'shortcuts',
        softwareEnhanceEnabled: true,
        codexStatusLightsEnabled: false,
        claudeStatusLightsEnabled: false,
        cursorStatusLightsEnabled: false,
        workbuddyStatusLightsEnabled: true,
        traeStatusLightsEnabled: true,
        traeCodeStatusLightsEnabled: true,
        windsurfStatusLightsEnabled: true,
        qoderStatusLightsEnabled: true,
        minimaxStatusLightsEnabled: false,
        copilotStatusLightsEnabled: false,
        copilotVscodeStatusLightsEnabled: false,
        geminiStatusLightsEnabled: false,
        clineStatusLightsEnabled: false,
        rooStatusLightsEnabled: false,
        opencodeStatusLightsEnabled: false,
        aiderStatusLightsEnabled: false,
        ambientMode: 'status',
        ambientSolidRgb: '#7c3aed',
        ambientOpacity: 100,
        ambientEnabled: true,
        keyLightPreset: 'default',
        statusColors: {},
        topbarHabitIds: [],
        presentation: 'full',
        miniUsagePillEnabled: true,
        miniUsagePillHideEmpty: true,
        miniChrome: defaultMiniChrome(),
        skin: 'default',
        keys: defaultSeedRoutes()
      };
      if (m.id) padHealDone[String(m.id)] = true;
      if (opts.persist !== false) persist();
      migrateMinimaxTopbarHabitToAgentLight(m, m.codexMicroPad);
      return m.codexMicroPad;
    }
    if (m.codexMicroPad) {
      if (m.codexMicroPad.minimaxStatusLightsEnabled == null) {
        m.codexMicroPad.minimaxStatusLightsEnabled = false;
      }
      if (!Array.isArray(m.codexMicroPad.topbarHabitIds)) {
        m.codexMicroPad.topbarHabitIds = [];
      }
      migrateMinimaxTopbarHabitToAgentLight(m, m.codexMicroPad);
    }
    if (!opts.force && m.id && padHealDone[String(m.id)]) {
      syncCursorSoftPadDisplay(m);
      return m.codexMicroPad;
    }
    if (!Array.isArray(m.codexMicroPad.keys)) m.codexMicroPad.keys = [];
    // Missing profile → custom; do not rewrite existing beginner/standard/advanced keys.
    if (!m.codexMicroPad.layoutProfile) m.codexMicroPad.layoutProfile = 'custom';
    if (!m.codexMicroPad.purpose ||
        (m.codexMicroPad.purpose !== 'shortcuts' && m.codexMicroPad.purpose !== 'sessions')) {
      m.codexMicroPad.purpose = 'shortcuts';
    }
    if (m.codexMicroPad.softwareEnhanceEnabled == null) {
      m.codexMicroPad.softwareEnhanceEnabled = true;
    }
    if (m.codexMicroPad.requireForeground == null) {
      m.codexMicroPad.requireForeground = true;
    }
    // showNavigationPad (display) — migrate older navKeysEnabled; never keep both
    // (Rust serde alias rejects duplicate → cmd_save 假死).
    if (m.codexMicroPad.showNavigationPad == null && m.codexMicroPad.navKeysEnabled != null) {
      m.codexMicroPad.showNavigationPad = m.codexMicroPad.navKeysEnabled !== false;
    }
    if (m.codexMicroPad.showNavigationPad == null) {
      m.codexMicroPad.showNavigationPad = true;
    }
    try { delete m.codexMicroPad.navKeysEnabled; } catch (_) { m.codexMicroPad.navKeysEnabled = undefined; }
    if (m.codexMicroPad.capturePhysicalArrows == null) {
      m.codexMicroPad.capturePhysicalArrows = false;
    }
    if (m.codexMicroPad.codexStatusLightsEnabled == null) {
      m.codexMicroPad.codexStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.claudeStatusLightsEnabled == null) {
      m.codexMicroPad.claudeStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.cursorStatusLightsEnabled == null) {
      m.codexMicroPad.cursorStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.workbuddyStatusLightsEnabled == null) {
      m.codexMicroPad.workbuddyStatusLightsEnabled = true;
    }
    if (m.codexMicroPad.traeStatusLightsEnabled == null) {
      m.codexMicroPad.traeStatusLightsEnabled = true;
    }
    if (m.codexMicroPad.traeCodeStatusLightsEnabled == null) {
      m.codexMicroPad.traeCodeStatusLightsEnabled = true;
    }
    if (m.codexMicroPad.windsurfStatusLightsEnabled == null) {
      m.codexMicroPad.windsurfStatusLightsEnabled = true;
    }
    if (m.codexMicroPad.qoderStatusLightsEnabled == null) {
      m.codexMicroPad.qoderStatusLightsEnabled = true;
    }
    if (m.codexMicroPad.minimaxStatusLightsEnabled == null) {
      m.codexMicroPad.minimaxStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.copilotStatusLightsEnabled == null) {
      m.codexMicroPad.copilotStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.copilotVscodeStatusLightsEnabled == null) {
      m.codexMicroPad.copilotVscodeStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.geminiStatusLightsEnabled == null) {
      m.codexMicroPad.geminiStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.clineStatusLightsEnabled == null) {
      m.codexMicroPad.clineStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.rooStatusLightsEnabled == null) {
      m.codexMicroPad.rooStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.opencodeStatusLightsEnabled == null) {
      m.codexMicroPad.opencodeStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.aiderStatusLightsEnabled == null) {
      m.codexMicroPad.aiderStatusLightsEnabled = false;
    }
    if (m.codexMicroPad.ambientMode !== 'solid' && m.codexMicroPad.ambientMode !== 'status') {
      m.codexMicroPad.ambientMode = 'status';
    }
    if (!m.codexMicroPad.ambientSolidRgb) {
      m.codexMicroPad.ambientSolidRgb = '#7c3aed';
    }
    var ao = Number(m.codexMicroPad.ambientOpacity);
    if (!(ao >= 0) || ao > 100) m.codexMicroPad.ambientOpacity = 100;
    if (m.codexMicroPad.ambientEnabled == null) m.codexMicroPad.ambientEnabled = true;
    if (!m.codexMicroPad.keyLightPreset) m.codexMicroPad.keyLightPreset = 'default';
    if (!m.codexMicroPad.statusColors || typeof m.codexMicroPad.statusColors !== 'object') {
      m.codexMicroPad.statusColors = {};
    }
    if (!Array.isArray(m.codexMicroPad.topbarHabitIds)) {
      m.codexMicroPad.topbarHabitIds = [];
    }
    // MiniMax used to only land in topbarHabitIds (habit slot). Live overlay only
    // renders agent chips — migrate habit → minimaxStatusLightsEnabled.
    migrateMinimaxTopbarHabitToAgentLight(m, m.codexMicroPad);
    if (!m.codexMicroPad.presentation ||
        (m.codexMicroPad.presentation !== 'full' && m.codexMicroPad.presentation !== 'mini')) {
      m.codexMicroPad.presentation = 'full';
    }
    ensureMiniChrome(m.codexMicroPad);
    m.codexMicroPad.skin = canonicalizePadSkin(m.codexMicroPad.skin);
    var before = JSON.stringify(m.codexMicroPad.keys);
    m.codexMicroPad.keys = migrateLegacyKeys(m.codexMicroPad.keys);
    healEncScreenOnly(m.codexMicroPad);
    var byId = {};
    m.codexMicroPad.keys.forEach(function (k) {
      if (k && k.microKeyId) byId[k.microKeyId] = k;
    });
    defaultSeedRoutes().forEach(function (seed) {
      if (!byId[seed.microKeyId]) {
        m.codexMicroPad.keys.push(seedRoute(seed));
      }
    });
    healEncScreenOnly(m.codexMicroPad);
    protectPrimaryLayout(m.codexMicroPad);
    syncCursorSoftPadDisplay(m);
    // Heal-only scan moves: persist quietly later via normal save — never block hub open.
    if (before !== JSON.stringify(m.codexMicroPad.keys) && opts.persist === true) persist();
    if (m.id) padHealDone[String(m.id)] = true;
    return m.codexMicroPad;
  }

  /** Keep 12 physical + ENC slots present; ENC stays screen-only (no alternate chord schemes). */
  function protectPrimaryLayout(pad) {
    if (!pad || !Array.isArray(pad.keys)) return;
    var byId = {};
    pad.keys.forEach(function (k) {
      if (k && k.microKeyId) byId[k.microKeyId] = k;
    });
    defaultSeedRoutes().forEach(function (seed) {
      if (PRIMARY_MICRO_IDS.indexOf(seed.microKeyId) < 0) return;
      if (!byId[seed.microKeyId]) {
        pad.keys.push(seedRoute(seed));
        byId[seed.microKeyId] = seed;
      }
    });
    healEncScreenOnly(pad);
  }

  function isEnhanceOn(pad) {
    return !!(pad && pad.softwareEnhanceEnabled);
  }

  function isEnhanceMicroKey(id) {
    return !!ENHANCE_MICRO_IDS[String(id || '')];
  }

  function isEssentialSlot(slotId) {
    var A = agent();
    if (A && A.isEssentialSlot) return A.isEssentialSlot(slotId);
    return false;
  }

  function isPrimaryMapped(route) {
    return !!(route && Number(route.sourceScan) > 0 && String(route.slotId || '').trim());
  }

  function isScreenOnly(route) {
    return !!(route && !(Number(route.sourceScan) > 0) && String(route.slotId || '').trim());
  }

  function isAdvancedOnly(route, microKeyId) {
    var id = String(microKeyId || (route && route.microKeyId) || '');
    if (route && route.advanced) return true;
    return /^(ENC_CW|ENC_CC|NAV_)/.test(id);
  }

  function applyLayoutProfile(m, profile, opts) {
    opts = opts || {};
    invalidatePadHeal(m);
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var p = String(profile || 'standard').trim();
    if (LAYOUT_PROFILES.indexOf(p) < 0 && p !== 'custom') p = 'standard';
    pad.layoutProfile = p;
    // Enhance is independent of profile; do not force-off when leaving advanced.
    // Reset routes from stock seeds when switching profile (not custom paste).
    if (opts.resetKeys !== false && p !== 'custom') {
      pad.keys = defaultSeedRoutes();
    }
    healEncScreenOnly(pad);
    pad.keys.forEach(function (k) {
      if (!k) return;
      if (k.microKeyId === 'ENC') {
        k.sourceScan = 0;
        k.sourceExtended = false;
        k.slotId = k.slotId || 'summonCodex';
        k.enabled = true;
        k.advanced = false;
        return;
      }
      if (k.microKeyId === 'JOY') {
        k.enabled = false;
        k.slotId = '';
        k.advanced = true;
        return;
      }
      var slot = String(k.slotId || '').trim();
      if (p === 'beginner') {
        k.enabled = !!(slot && isEssentialSlot(slot));
      } else {
        k.enabled = !!slot;
      }
      k.advanced = false;
    });
    if (opts.persist !== false) persistLayout(m);
    return pad;
  }

  function exportLayoutJson(m) {
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    return {
      version: 1,
      kind: 'onetone-codex-numpad-layout',
      layoutProfile: pad.layoutProfile || 'standard',
      softwareEnhanceEnabled: !!pad.softwareEnhanceEnabled,
      keys: (pad.keys || []).map(function (k) {
        return {
          microKeyId: k.microKeyId,
          sourceScan: Number(k.sourceScan) || 0,
          sourceExtended: !!k.sourceExtended,
          slotId: String(k.slotId || ''),
          uiIconId: String(k.uiIconId || ''),
          enabled: k.enabled !== false,
          advanced: !!k.advanced
        };
      })
    };
  }

  function importLayoutJson(m, data) {
    if (!m || !data || data.kind !== 'onetone-codex-numpad-layout') {
      toast(t('codexMicroPadImportInvalid', '无法导入：不是有效的布局文件'));
      return false;
    }
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    // Keep keys; normalize profile to custom for hub (legacy beginner/standard/advanced accepted).
    pad.layoutProfile = 'custom';
    if (data.softwareEnhanceEnabled == null) pad.softwareEnhanceEnabled = true;
    else pad.softwareEnhanceEnabled = !!data.softwareEnhanceEnabled;
    if (Array.isArray(data.keys)) {
      pad.keys = data.keys.map(function (k) {
        return seedRoute(k || {});
      });
    }
    healEncScreenOnly(pad);
    persistLayout(m);
    return true;
  }

  function copyAsCustomLayout(m) {
    ensurePad(m, { persist: false });
    var snap = exportLayoutJson(m);
    snap.layoutProfile = 'custom';
    importLayoutJson(m, snap);
    toast(t('codexMicroPadCopiedCustom', '已复制为自定义布局'));
  }

  /** Restore stock 15-key layout as custom (not「标准档」语义); enhance stays on. */
  function restoreDefaultCustomLayout(m) {
    invalidatePadHeal(m);
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    pad.layoutProfile = 'custom';
    pad.softwareEnhanceEnabled = true;
    pad.keys = defaultSeedRoutes();
    healEncScreenOnly(pad);
    pad.keys.forEach(function (k) {
      if (!k) return;
      if (k.microKeyId === 'ENC') {
        k.sourceScan = 0;
        k.sourceExtended = false;
        k.slotId = k.slotId || 'summonCodex';
        k.enabled = true;
        k.advanced = false;
        return;
      }
      if (k.microKeyId === 'JOY') {
        k.enabled = false;
        k.slotId = '';
        k.advanced = true;
        return;
      }
      var slot = String(k.slotId || '').trim();
      k.enabled = !!slot;
      k.advanced = false;
    });
    persistLayout(m);
    return pad;
  }

  /** Clear capability mappings only — keep enhance / physical layout skeleton. */
  function clearCapabilityMappings(m) {
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    pad.layoutProfile = 'custom';
    if (pad.softwareEnhanceEnabled == null) pad.softwareEnhanceEnabled = true;
    (pad.keys || []).forEach(function (k) {
      if (!k) return;
      k.slotId = '';
      k.enabled = false;
      k.uiIconId = '';
      if (k.microKeyId === 'ENC' || isNavMicroKey(k.microKeyId)) {
        k.sourceScan = 0;
        k.sourceExtended = false;
      }
    });
    protectPrimaryLayout(pad);
    persistLayout(m);
    return pad;
  }

  /** CTA: create/fix Codex scene as standard numpad controller (12 physical + screen dial). */
  function applyNumpadControllerStandard(opts) {
    opts = opts || {};
    var T = global.OneToneAgentScenarioTemplate;
    if (!T || !T.applyCodexMicro13) {
      toast(t('habitCodexApplyMissing', '能力模块未加载'));
      return null;
    }
    var m = T.applyCodexMicro13({
      mode: opts.mode || 'openExisting',
      reset: !!opts.reset,
      openPanel: opts.openPanel != null ? opts.openPanel : 'keys',
      openKeys: opts.openKeys !== false,
      layoutProfile: 'standard',
      enablePad: true
    });
    if (!m) return null;
    applyLayoutProfile(m, 'standard', { persist: true });
    var pad = m.codexMicroPad;
    pad.enabled = true;
    pad.overlayEnabled = true;
    pad.softwareEnhanceEnabled = false;
    persistPadFlags(m);
    persistLayout(m);
    notifyLinkedUi(m);
    toast(t('codexMicroPadCtaDone', '已启用标准版：实体小键盘 12 键 + 屏幕总开关'));
    return m;
  }

  function stopTryKeyListener() {
    if (tryKeydownHandler) {
      document.removeEventListener('keydown', tryKeydownHandler, true);
      tryKeydownHandler = null;
    }
    tryKeydownUntil = 0;
  }

  function noteTryRecognized(m, microKeyId, sourceLabel) {
    var pad = m && m.codexMicroPad;
    var route = routeForMicroKey(pad, microKeyId);
    if (!route || !route.enabled || !String(route.slotId || '').trim()) {
      toast(t('codexMicroPadTryUnbound', '这个键还没有绑定能力'));
      applyPressedClass(microKeyId);
      return;
    }
    applyPressedClass(microKeyId);
    var cap = slotLabel(route.slotId);
    var src = sourceLabel || (Number(route.sourceScan) > 0
      ? scanLabel(route.sourceScan, route.sourceExtended)
      : t('codexMicroPadScreenPower', '屏幕总开关'));
    toast(t('codexMicroPadTryOk', '已识别：{src} → {cap}')
      .replace('{src}', src)
      .replace('{cap}', cap));
  }

  function startTryKeyListener(m) {
    stopTryKeyListener();
    tryKeydownUntil = Date.now() + 15000;
    tryKeydownHandler = function (e) {
      if (padUiMode !== 'try') {
        stopTryKeyListener();
        return;
      }
      if (Date.now() > tryKeydownUntil) {
        stopTryKeyListener();
        return;
      }
      var code = String(e.code || '');
      if (e.location === 3 && /^Digit\d$/.test(code) && m.codexMicroPad && m.codexMicroPad.requireNumLockOff) {
        toast(t('codexMicroPadTryNumLock', '请关闭 NumLock 后再试'));
        return;
      }
      if (code.indexOf('Numpad') !== 0 && code !== 'NumpadEnter') return;
      e.preventDefault();
      e.stopPropagation();
      var parsed = parseRecordedNumpad(code === 'NumpadEnter' ? 'NumpadEnter' : code);
      if (!parsed) return;
      var route = routeBySource(m.codexMicroPad, parsed.scan, parsed.ext);
      if (!route) {
        toast(t('codexMicroPadTryUnbound', '这个键还没有绑定能力'));
        return;
      }
      noteTryRecognized(m, route.microKeyId, scanLabel(parsed.scan, parsed.ext));
      tryKeydownUntil = Date.now() + 15000;
    };
    document.addEventListener('keydown', tryKeydownHandler, true);
  }

  function routeForSlot(m, slotId) {
    var pad = m && m.codexMicroPad;
    if (!pad || !slotId) return null;
    return routeForMicroKey(pad, findMicroKeyForSlot(pad, slotId) || '') ||
      (function () {
        if (!Array.isArray(pad.keys)) return null;
        for (var i = 0; i < pad.keys.length; i++) {
          var k = pad.keys[i];
          if (k && k.enabled && k.slotId === slotId && k.sourceScan) return k;
        }
        return null;
      })();
  }

  function findMicroKeyForSlot(pad, slotId) {
    if (!pad || !Array.isArray(pad.keys)) return '';
    for (var i = 0; i < pad.keys.length; i++) {
      var k = pad.keys[i];
      if (k && k.enabled && k.slotId === slotId) return k.microKeyId;
    }
    return '';
  }

  function routeForMicroKey(pad, microKeyId) {
    if (!pad || !Array.isArray(pad.keys) || !microKeyId) return null;
    for (var i = 0; i < pad.keys.length; i++) {
      if (pad.keys[i] && pad.keys[i].microKeyId === microKeyId) return pad.keys[i];
    }
    return null;
  }

  function findTriggerConflict(m, slotId, excludeMicroId) {
    if (!m || !slotId) return null;
    var chord = chordForSlot(m, slotId);
    if (!chord) return null;
    var ownerPad = m.codexMicroPad;
    if (ownerPad && Array.isArray(ownerPad.keys)) {
      for (var i = 0; i < ownerPad.keys.length; i++) {
        var r = ownerPad.keys[i];
        if (!r || !r.enabled || r.microKeyId === excludeMicroId) continue;
        if (r.slotId && r.slotId !== slotId && chordForSlot(m, r.slotId) === chord) {
          return r.microKeyId;
        }
      }
    }
    return null;
  }

  function listPadMappings(m) {
    if (!m) return [];
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var rows = [];
    LAYOUT.cells.forEach(function (cell) {
      var route = routeForMicroKey(pad, cell.microKeyId);
      var slotId = (route && route.enabled !== false)
        ? String(route.slotId || '').trim()
        : '';
      var bound = !!slotId;
      var numpadLabel = '';
      if (route && Number(route.sourceScan) > 0) {
        numpadLabel = scanLabel(route.sourceScan, route.sourceExtended);
      }
      rows.push({
        microKeyId: cell.microKeyId,
        keyLabel: cellLabel(cell),
        numpadLabel: numpadLabel,
        slotId: slotId,
        slotLabel: bound ? slotLabel(slotId) : '',
        chord: bound ? slotSubForDisplay(m, slotId) : '',
        enabled: !(route && route.enabled === false),
        bound: bound,
        uiIconId: resolveIconId(route, cell.microKeyId)
      });
    });
    return rows;
  }

  function keysPanelActive() {
    var drawer = global.OneToneSettingsDrawer;
    return !!(global.OneToneState && global.OneToneState.ui && global.OneToneState.ui.drawerOpen
      && drawer && drawer.isKeysPanel && drawer.isKeysPanel());
  }

  function softPadPanelActive() {
    var ui = global.OneToneState && global.OneToneState.ui;
    return !!(ui && ui.drawerOpen && ui.settingsPanel === 'softPad');
  }

  function notifyLinkedUi(m) {
    // Pad-only refresh. Never call AgentCapabilityUi.refresh() here — that remounts
    // camera/MediaPipe and has 假死'd the UI when toggling Micro enable.
    if (softPadPanelActive() && global.OneToneSoftPadHub && global.OneToneSoftPadHub.refreshSelected) {
      // Skip while Soft Pad is mid-paint — refreshSelected→paintPreview would re-enter.
      if (global.OneToneSoftPadHub.isPaintBusy && global.OneToneSoftPadHub.isPaintBusy()) return;
      try { global.OneToneSoftPadHub.refreshSelected(m); } catch (_) {}
      return;
    }
    // Skip keys chrome when user already left keys (opening「我的习惯」was 假死'd by this).
    if (!keysPanelActive() && !isPadManagerOpen()) return;
    refreshTrigger(m);
    if (isPadManagerOpen()) {
      if (m) padManagerMapping = m;
      // Manager owns the pad UI — do not rebuild keys hub under the modal (假死 / 面板无变化).
      return;
    }
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    if (targetHost && !targetHost.hidden) renderTarget(targetHost, m, { skipEnsure: true });
  }

  /** Swap only the hardware pad shell after mode toggle — keep checkbox alive (avoid remount 假死). */
  function remountTargetPadShell(host, m) {
    if (!host || !m) return false;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    if (!pad) return false;
    var oldWrap = host.querySelector('.micro-hw-wrap') || host.querySelector('.micro-hw-shell');
    if (!oldWrap || !oldWrap.parentNode) return false;
    var tmp = document.createElement('div');
    tmp.innerHTML = renderHardwarePad(m, pad, { mode: 'config' });
    var next = tmp.firstChild;
    if (!next) return false;
    oldWrap.parentNode.replaceChild(next, oldWrap);
    var toggle = host.querySelector('[data-act="enabled"]');
    if (toggle) toggle.checked = !!pad.enabled;
    bindPadClicks(host, m, 'config');
    return true;
  }

  /** Soft-swap pad manager hardware shell (do not rebuild checkbox / sections). */
  function remountPadManagerShell(m) {
    if (!m) return false;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var host = document.getElementById('codexPadMgrPad');
    if (!host || !pad) return false;
    var padBindMode = padUiMode === 'run' ? 'run' : (padUiMode === 'try' ? 'try' : 'config');
    var oldWrap = host.querySelector('.micro-hw-wrap') || host.querySelector('.micro-hw-shell');
    var tmp = document.createElement('div');
    tmp.innerHTML = renderHardwarePad(m, pad, { mode: padBindMode });
    var next = tmp.firstChild;
    if (!next) return false;
    if (oldWrap && oldWrap.parentNode) oldWrap.parentNode.replaceChild(next, oldWrap);
    else host.replaceChildren(next);
    var body = activePadManagerBody();
    var enabledEl = body && body.querySelector('[data-act="enabled"]');
    if (enabledEl) enabledEl.checked = !!pad.enabled;
    var overlayEl = body && body.querySelector('[data-act="overlay"]');
    if (overlayEl) overlayEl.checked = !!pad.overlayEnabled;
    bindPadClicks(host, m, padBindMode);
    return true;
  }

  function onCapabilitySelected(m, slotId) {
    highlightSlotId = slotId || '';
    activeHighlightId = slotId ? (findMicroKeyForSlot(m && m.codexMicroPad, slotId) || '') : '';
    refreshTrigger(m);
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    if (targetHost && !targetHost.hidden) {
      targetHost.querySelectorAll('.micro-hw__key').forEach(function (el) {
        var mid = el.getAttribute('data-micro-key');
        var route = routeForMicroKey(m && m.codexMicroPad, mid);
        el.classList.toggle('is-focused', !!(slotId && route && route.slotId === slotId));
      });
    }
  }

  function badgeForSlot(m, slotId) {
    var pad = m && m.codexMicroPad;
    if (!pad || !pad.enabled || !slotId) return '';
    var route = routeForSlot(m, slotId);
    if (!route || !route.enabled) return '';
    return routeSourceLabel(route);
  }

  function routeBySource(pad, scan, ext) {
    if (!pad || !Array.isArray(pad.keys)) return null;
    for (var i = 0; i < pad.keys.length; i++) {
      var k = pad.keys[i];
      if (!k || !k.enabled) continue;
      if (Number(k.sourceScan) === Number(scan) && !!k.sourceExtended === !!ext) return k;
    }
    return null;
  }

  function countBound(pad) {
    if (!pad || !pad.enabled || !Array.isArray(pad.keys)) return 0;
    var n = 0;
    for (var i = 0; i < pad.keys.length; i++) {
      if (pad.keys[i] && pad.keys[i].enabled && String(pad.keys[i].slotId || '').trim()) n++;
    }
    return n;
  }

  function isCodexSoftPadMapping(m) {
    return String((m && m.appTargetId) || '').trim() === 'codex-chat';
  }

  function isCursorSoftPadMapping(m) {
    return String((m && m.appTargetId) || '').trim() === 'cursor-chat';
  }

  function isVscodeSoftPadMapping(m) {
    var app = String((m && m.appTargetId) || '').trim();
    return app === 'cursor-chat' || app === 'workbuddy-chat' ||
      app === 'trae-work' || app === 'trae-chat' || app === 'trae-code' ||
      app === 'windsurf-chat' ||
      app === 'qoder-chat';
  }

  function isSoftPadInsertOnlySlot(slotId, m) {
    var id = String(slotId || '').trim();
    // Cursor: plan / switchAgent are composerMode hotkeys (Ctrl+Alt+Shift+P / Ctrl+Alt+.), not slash insert.
    if (isCursorSoftPadMapping(m) && (id === 'plan' || id === 'switchAgent')) {
      return false;
    }
    var A = agent();
    if (!A || !A.slotById || !A.actionById) return false;
    var s = A.slotById(id);
    if (!s) return false;
    var a = A.actionById(s.actionId);
    return !!(a && String(a.mode || '') === 'insertOnly');
  }

  function allSlotOptions(m) {
    var A = agent();
    if (!A || !A.SLOTS) return [];
    var codexOnly = isCodexSoftPadMapping(m);
    var cursorOnly = isCursorSoftPadMapping(m);
    var vscodeOnly = isVscodeSoftPadMapping(m);
    return A.SLOTS.filter(function (s) {
      var id = String(s.slotId || '').trim();
      // Soft Pad: never offer insertOnly slash as one-press keys (Cursor plan/agent excepted).
      if (isSoftPadInsertOnlySlot(id, m)) return false;
      if (codexOnly) return !!CODEX_SOFT_PAD_SLOT_IDS[id];
      if (cursorOnly) return !!CURSOR_SOFT_PAD_SLOT_IDS[id];
      if (vscodeOnly) return !!VSCODE_SOFT_PAD_SLOT_IDS[id];
      return true;
    }).map(function (s) {
      var label = (A.labelForSlotForMapping
        ? A.labelForSlotForMapping(m, s.slotId)
        : (lang().indexOf('en') === 0 ? s.labelEn : s.labelZh)) ||
        (lang().indexOf('en') === 0 ? s.labelEn : s.labelZh);
      var tip = slotEffectTip(s.slotId, label, m);
      return { id: s.slotId, label: label, tip: tip };
    });
  }

  /** Hover / option tip: what this capability does when the key fires. */
  function slotEffectTip(slotId, label, m) {
    var A = agent();
    var name = label || slotLabel(slotId, m) || String(slotId || '');
    if (!slotId) {
      return lang().indexOf('en') === 0
        ? 'No capability — key will not run an action'
        : '未绑定能力 — 按键不会执行动作';
    }
    // Soft Pad never advertises insert-only slash (one-press only).
    if (isSoftPadInsertOnlySlot(slotId, m)) {
      return lang().indexOf('en') === 0
        ? (name + ' — not available as a one-press Soft Pad action')
        : (name + ' — 不可作为 Soft Pad 一键动作');
    }
    var chord = '';
    try {
      if (m) chord = friendlyChord(chordForSlot(m, slotId));
      else if (editDraft && editDraft.mapping) chord = friendlyChord(chordForSlot(editDraft.mapping, slotId));
    } catch (_) {}
    if (!chord && A && A.defaultKeyForMapping) chord = friendlyChord(A.defaultKeyForMapping(m, slotId));
    else if (!chord && A && A.defaultKeyForSlot) chord = friendlyChord(A.defaultKeyForSlot(slotId));
    if (chord) {
      return lang().indexOf('en') === 0
        ? (name + ' — sends shortcut ' + chord)
        : (name + ' — 触发快捷键 ' + chord);
    }
    if (String(slotId) === 'summonCodex') {
      return lang().indexOf('en') === 0
        ? (name + ' — OneTone focus workflow')
        : (name + ' — OneTone 聚焦操作');
    }
    if (String(slotId) === 'pushToTalk') {
      if (isVscodeSoftPadMapping(m)) {
        return lang().indexOf('en') === 0
          ? (name + ' — OneTone voice hold')
          : (name + ' — OneTone 按住说话');
      }
      return lang().indexOf('en') === 0
        ? (name + ' — Codex Start dictation (Ctrl+Shift+D)')
        : (name + ' — Codex 开始听写（Ctrl+Shift+D）');
    }
    if (String(slotId) === 'claudeModel') {
      return lang().indexOf('en') === 0
        ? (name + ' — Claude model workflow (not a slash insert)')
        : (name + ' — Claude 模型工作流（不是 slash 插入）');
    }
    return lang().indexOf('en') === 0
      ? (name + ' — runs this Soft Pad capability')
      : (name + ' — 执行该 Soft Pad 能力');
  }

  /** Source tag for Zone 2 — honest origin, never “official Micro”. */
  function slotSourceTag(slotId, m) {
    var en = lang().indexOf('en') === 0;
    var id = String(slotId || '').trim();
    if (!id) return '';
    if (id === 'summonCodex') {
      return en ? 'OneTone focus' : 'OneTone 聚焦操作';
    }
    if (isVscodeSoftPadMapping(m)) {
      var app = String((m && m.appTargetId) || '').trim();
      var brand =
        app === 'cursor-chat' ? (en ? 'Cursor shortcut' : 'Cursor 快捷键')
        : (app === 'trae-work' || app === 'trae-chat') ? (en ? 'Trae Work shortcut' : 'Trae Work 快捷键')
        : app === 'trae-code' ? (en ? 'Trae Code shortcut' : 'Trae Code 快捷键')
        : app === 'windsurf-chat' ? (en ? 'Windsurf shortcut' : 'Windsurf 快捷键')
        : app === 'qoder-chat' ? (en ? 'Qoder shortcut' : 'Qoder 快捷键')
        : app === 'workbuddy-chat' ? (en ? 'WorkBuddy shortcut' : 'WorkBuddy 快捷键')
        : (en ? 'IDE shortcut' : 'IDE 快捷键');
      if (id === 'pushToTalk') {
        return en ? 'OneTone voice' : 'OneTone 语音';
      }
      if (id === 'cancel' && app === 'cursor-chat') {
        return en ? 'Cursor cancel generation' : 'Cursor 取消生成';
      }
      if (id === 'commandPalette' || id === 'newThread' || id === 'quickChat' || id === 'quickSearch'
        || id === 'undo' || id === 'toggleSidebar' || id === 'openSettings'
        || id === 'navBack' || id === 'navForward'
        || id === 'openTerminal' || id === 'newBrowserTab' || id === 'cancel' || id === 'stopOrSend') {
        return brand;
      }
      return en ? 'Soft Pad action' : 'Soft Pad 动作';
    }
    if (id === 'pushToTalk') {
      return en ? 'Codex desktop shortcut' : 'Codex 桌面快捷键';
    }
    if (id === 'stopOrSend') {
      return en ? 'General input / OneTone workflow' : '通用输入 / OneTone 工作流';
    }
    if (id === 'cancel') {
      return en ? 'General input' : '通用输入';
    }
    if (id === 'commandPalette' || id === 'newThread' || id === 'quickChat' || id === 'quickSearch'
      || id === 'undo' || id === 'openReviewTab' || id === 'toggleReviewPanel'
      || id === 'toggleSidebar' || id === 'openSettings'
      || id === 'navBack' || id === 'navForward'
      || id === 'openTerminal' || id === 'toggleBrowserPanel' || id === 'newBrowserTab'
      || id === 'focusBrowserAddressBar') {
      return en ? 'Codex desktop shortcut / open entry' : 'Codex 桌面快捷键 / 打开入口';
    }
    return en ? 'Soft Pad action' : 'Soft Pad 动作';
  }

  var ICON_APPEARANCE_LABELS = {
    approve: { zh: '确认', en: 'OK' },
    reject: { zh: '取消', en: 'Cancel' },
    fork: { zh: '分叉', en: 'Fork' },
    mic: { zh: '麦克风', en: 'Mic' },
    send: { zh: '发送', en: 'Send' },
    clipboardPaste: { zh: '粘贴发送', en: 'Paste send' },
    new: { zh: '新建', en: 'New' },
    power: { zh: '电源', en: 'Power' },
    focus: { zh: '聚焦', en: 'Focus' },
    palette: { zh: '菜单', en: 'Menu' },
    status: { zh: '状态', en: 'Status' },
    plan: { zh: '计划', en: 'Plan' },
    review: { zh: '审查', en: 'Review' },
    folder: { zh: '文件夹', en: 'Folder' },
    cloud: { zh: '云', en: 'Cloud' },
    browser: { zh: '浏览器', en: 'Browser' },
    browserPlus: { zh: '新标签', en: 'New tab' },
    agent: { zh: '助手', en: 'Agent' },
    claude: { zh: 'Claude', en: 'Claude' },
    cursor: { zh: 'Cursor', en: 'Cursor' },
    model: { zh: '模型', en: 'Model' },
    undo: { zh: '撤销', en: 'Undo' },
    search: { zh: '搜索', en: 'Search' },
    codex: { zh: 'Codex', en: 'Codex' },
    fast: { zh: '快速', en: 'Fast' },
    navUp: { zh: '上', en: 'Up' },
    navDown: { zh: '下', en: 'Down' },
    navLeft: { zh: '左', en: 'Left' },
    navRight: { zh: '右', en: 'Right' },
    empty: { zh: '空白', en: 'Empty' },
    plus: { zh: '加号', en: 'Plus' },
    dot: { zh: '圆点', en: 'Dot' },
    trash: { zh: '回收站', en: 'Trash' },
    bug: { zh: '缺陷', en: 'Bug' },
    merge: { zh: '合并', en: 'Merge' },
    term: { zh: '终端', en: 'Term' }
  };

  /** Appearance-only tip — never capability / slash language. */
  function iconEffectTip(def) {
    if (!def) return '';
    var lab = ICON_APPEARANCE_LABELS[def.id];
    var name = lab
      ? (lang().indexOf('en') === 0 ? lab.en : lab.zh)
      : (def.label || def.id);
    return lang().indexOf('en') === 0
      ? ('Appearance: ' + name)
      : ('外观：' + name);
  }

  function capabilityCardCopy(slotId, m) {
    var en = lang().indexOf('en') === 0;
    var id = String(slotId || '').trim();
    m = m || (editDraft && editDraft.mapping) || null;

    if (isVscodeSoftPadMapping(m) && id) {
      var title = slotLabel(id, m);
      return {
        title: title,
        result: slotEffectTip(id, title, m),
        source: slotSourceTag(id, m)
      };
    }

    var cards = {
      commandPalette: {
        titleZh: '打开命令菜单', titleEn: 'Open command menu',
        resultZh: '发送 Codex 桌面快捷键 Ctrl+K',
        resultEn: 'Sends Codex desktop shortcut Ctrl+K',
        triggerZh: 'Codex 桌面快捷键', triggerEn: 'Codex desktop shortcut'
      },
      newThread: {
        titleZh: '新建对话', titleEn: 'New chat',
        resultZh: '发送 Codex 桌面快捷键 Ctrl+N',
        resultEn: 'Sends Codex desktop shortcut Ctrl+N',
        triggerZh: 'Codex 桌面快捷键', triggerEn: 'Codex desktop shortcut'
      },
      quickChat: {
        titleZh: '快速对话', titleEn: 'Quick chat',
        resultZh: '发送 Codex 桌面快捷键 Ctrl+Alt+N',
        resultEn: 'Sends Codex desktop shortcut Ctrl+Alt+N',
        triggerZh: 'Codex 桌面快捷键', triggerEn: 'Codex desktop shortcut'
      },
      quickSearch: {
        titleZh: '在对话中查找', titleEn: 'Find in chat',
        resultZh: '发送 Codex 桌面快捷键 Ctrl+F',
        resultEn: 'Sends Codex desktop shortcut Ctrl+F',
        triggerZh: 'Codex 桌面快捷键', triggerEn: 'Codex desktop shortcut'
      },
      pushToTalk: {
        titleZh: '语音输入', titleEn: 'Voice input',
        resultZh: '按住发送 Codex Ctrl+Shift+D（开始听写），松开结束',
        resultEn: 'Hold Codex Ctrl+Shift+D (Start dictation); release to end',
        triggerZh: 'Codex 桌面快捷键', triggerEn: 'Codex desktop shortcut'
      },
      stopOrSend: {
        titleZh: '发送或停止口述', titleEn: 'Send or stop dictation',
        resultZh: '发送 Enter：会发送当前已输入内容；空输入框时不会生成新内容。口述中则结束 OneTone 口述。审批焦点时≈批准请求',
        resultEn: 'Sends Enter: current composer text, or invents nothing if empty. Ends OneTone dictation if running. When focused on approval ≈ approve',
        triggerZh: '通用输入 / OneTone 工作流', triggerEn: 'General input / OneTone workflow'
      },
      pasteAndSend: {
        titleZh: '粘贴发送', titleEn: 'Paste and send',
        resultZh: '聚焦右侧 Agent 输入框 → 粘贴剪贴板 → Enter 发送',
        resultEn: 'Focus Agent composer → paste clipboard → Enter',
        triggerZh: 'OneTone Soft Pad 工作流', triggerEn: 'OneTone Soft Pad workflow'
      },
      cancel: {
        titleZh: '取消', titleEn: 'Cancel',
        resultZh: '发送 Esc：审批焦点时≈拒绝请求；否则取消当前可取消的界面或输入',
        resultEn: 'Sends Esc: when focused on approval ≈ decline; otherwise cancels whatever Codex can cancel',
        triggerZh: '通用输入', triggerEn: 'General input'
      },
      summonCodex: {
        titleZh: '聚焦 Codex', titleEn: 'Focus Codex',
        resultZh: '通过 OneTone 聚焦操作聚焦 Codex 输入区域',
        resultEn: 'Focuses the Codex composer via OneTone focus workflow',
        triggerZh: 'OneTone 聚焦操作', triggerEn: 'OneTone focus'
      },
      undo: {
        titleZh: '撤销', titleEn: 'Undo',
        resultZh: '发送 Codex 桌面快捷键 Ctrl+Z（打开入口：撤销最近应用操作）',
        resultEn: 'Sends Codex desktop shortcut Ctrl+Z (open entry: undo last app action)',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      openReviewTab: {
        titleZh: '打开审查选项卡', titleEn: 'Open review tab',
        resultZh: '发送 Ctrl+Shift+G，打开审查选项卡（入口，不自动跑完审查）',
        resultEn: 'Sends Ctrl+Shift+G to open the review tab (entry — does not finish a review)',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      toggleReviewPanel: {
        titleZh: '显示/隐藏当前聊天审阅面板', titleEn: 'Toggle current-chat review panel',
        resultZh: '发送 Ctrl+Alt+B，显示或隐藏当前聊天的审阅面板（入口）',
        resultEn: 'Sends Ctrl+Alt+B to show or hide the review panel for the current chat (entry)',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      toggleSidebar: {
        titleZh: '切换边栏', titleEn: 'Toggle sidebar',
        resultZh: '发送 Ctrl+B，显示或隐藏边栏',
        resultEn: 'Sends Ctrl+B to show or hide the sidebar',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      openSettings: {
        titleZh: '打开设置', titleEn: 'Open settings',
        resultZh: '先聚焦 Codex 并离开输入法，再发送 Ctrl+, 打开设置',
        resultEn: 'Focuses Codex, clears IME, then sends Ctrl+, to open settings',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      navBack: {
        titleZh: '返回', titleEn: 'Go back',
        resultZh: '发送 Ctrl+[，在导航历史中后退',
        resultEn: 'Sends Ctrl+[ to go back in navigation history',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      navForward: {
        titleZh: '前进', titleEn: 'Go forward',
        resultZh: '发送 Ctrl+]，在导航历史中前进',
        resultEn: 'Sends Ctrl+] to go forward in navigation history',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      openTerminal: {
        titleZh: '打开终端', titleEn: 'Open terminal',
        resultZh: '发送 Ctrl+`，打开终端面板（入口）',
        resultEn: 'Sends Ctrl+` to open the terminal panel (entry)',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      toggleBrowserPanel: {
        titleZh: '显示/隐藏浏览器面板', titleEn: 'Toggle browser panel',
        resultZh: '发送 Ctrl+Shift+B，显示或隐藏浏览器面板（入口）',
        resultEn: 'Sends Ctrl+Shift+B to show or hide the browser panel (entry)',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      newBrowserTab: {
        titleZh: '打开浏览器标签', titleEn: 'New browser tab',
        resultZh: '发送 Ctrl+T，打开浏览器标签（入口）',
        resultEn: 'Sends Ctrl+T to open a browser tab (entry)',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      },
      focusBrowserAddressBar: {
        titleZh: '聚焦浏览器地址栏', titleEn: 'Focus browser address bar',
        resultZh: '发送 Ctrl+L，聚焦应用内浏览器地址栏（入口）',
        resultEn: 'Sends Ctrl+L to focus the in-app browser address bar (entry)',
        triggerZh: 'Codex 桌面快捷键 / 打开入口', triggerEn: 'Codex desktop shortcut / open entry'
      }
    };
    if (!id) {
      return {
        title: en ? 'Unbound' : '未绑定',
        result: en ? 'This key will not run an action' : '这个键暂时不执行动作',
        source: ''
      };
    }
    var c = cards[id];
    if (c) {
      return {
        title: en ? c.titleEn : c.titleZh,
        result: en ? c.resultEn : c.resultZh,
        source: en ? c.triggerEn : c.triggerZh
      };
    }
    var A = agent();
    var s = A && A.slotById ? A.slotById(id) : null;
    var title = s
      ? (en ? s.labelEn : s.labelZh)
      : id;
    return {
      title: title,
      result: slotEffectTip(id, title, editDraft && editDraft.mapping),
      source: slotSourceTag(id, editDraft && editDraft.mapping)
    };
  }

  function isLegacyMisleadingIcon(iconId) {
    var id = String(iconId || '').trim();
    return !id || !!LEGACY_MISLEADING_ICONS[id];
  }

  function suggestIconForSlot(slotId) {
    var id = String(slotId || '').trim();
    return SLOT_DEFAULT_ICON[id] || '';
  }

  function iconIdForCapabilitySlot(slotId) {
    var id = String(slotId || '').trim();
    if (!id) return 'empty';
    if (isCursorCustomSlotId(id)) return 'command';
    return SLOT_DEFAULT_ICON[id] || 'empty';
  }

  /** Resolve saved keycap icon + reopen iconTouched without a new config field. */
  function resolveOpenEditIconState(route, initialSlot, def) {
    var slotDefaultIcon = iconIdForCapabilitySlot(initialSlot);
    var routeIcon = String((route && route.uiIconId) || '').trim();
    var defIcon = String((def && def.uiIconId) || '').trim();
    var microId = String((route && route.microKeyId) || (def && def.microKeyId) || '');
    // Rebinding to Plan/Agent left palette/fork on the key — treat as untouched.
    if (
      slotDefaultIcon &&
      routeIcon &&
      routeIcon !== slotDefaultIcon &&
      isSoftPadLeftoverIcon(routeIcon, microId, initialSlot)
    ) {
      return {
        uiIconId: slotDefaultIcon,
        iconTouched: false,
        slotDefaultIcon: slotDefaultIcon
      };
    }
    return {
      uiIconId: routeIcon || defIcon || slotDefaultIcon,
      iconTouched: !!routeIcon && routeIcon !== slotDefaultIcon,
      slotDefaultIcon: slotDefaultIcon
    };
  }

  function maybeAutoSuggestIcon(draft) {
    draft = draft || editDraft;
    if (!draft || draft.iconTouched) return false;
    var suggested = suggestIconForSlot(draft.slotId);
    if (!suggested) {
      // Unbound: clear legacy misleading icons only
      if (isLegacyMisleadingIcon(draft.uiIconId) && LEGACY_MISLEADING_ICONS[String(draft.uiIconId || '').trim()]) {
        draft.uiIconId = 'empty';
        return true;
      }
      return false;
    }
    if (draft.uiIconId === suggested) return false;
    // Untouched: always align icon to capability (beginner).
    // Legacy misleading icons are also treated as untouched (iconTouched stays false).
    draft.uiIconId = suggested;
    return true;
  }

  function syncHiddenSlotSelect() {
    var slotSel = document.getElementById('microHwEditSlot');
    if (!slotSel || !editDraft) return;
    slotSel.value = String(editDraft.slotId || '');
  }

  function showCapabilityEffectTip() {
    if (!editDraft) return;
    var copy = capabilityCardCopy(editDraft.slotId, editDraft.mapping);
    var source = copy.source || slotSourceTag(editDraft.slotId, editDraft.mapping);
    var text = editDraft.slotId
      ? (copy.result + (source ? (' · ' + source) : ''))
      : copy.result;
    showEditEffectTip(text);
    var sourceEl = document.getElementById('microHwEffectSource');
    if (sourceEl) {
      sourceEl.textContent = source || '';
      sourceEl.hidden = !source;
    }
    var hint = document.getElementById('microHwAssignHint');
    if (hint) hint.textContent = text;
    updateStatusLightNote();
  }

  function updateStatusLightNote() {
    var note = document.getElementById('microHwStatusLightNote');
    var editor = document.getElementById('microHwKeyLightEditor');
    if (!editDraft) return;
    var pad = editDraft.mapping && editDraft.mapping.codexMicroPad;
    var host = resolveStatusLightMicroKeyId(pad);
    var show = host
      && host === String(editDraft.microKeyId || '')
      && String(editDraft.slotId || '').trim() !== 'status';
    if (note) {
      note.textContent = show
        ? t('codexMicroEditStatusLightNote', '状态灯显示运行状态，不改变此键当前动作')
        : '';
      note.hidden = !show;
    }
    if (editor) {
      if (show && pad && editDraft.mapping) {
        editor.hidden = false;
        editor.innerHTML = renderKeyLightPaletteEditor(pad, {
          lead: t('softPadKeyLightEditLead', '调整此键/盘的状态灯氛围色（保存到当前习惯）')
        });
        bindKeyLightPaletteEvents(editor, editDraft.mapping, pad);
      } else {
        editor.hidden = true;
        editor.innerHTML = '';
      }
    }
  }

  function findSourceConflict(pad, scan, ext, exceptMicroId) {
    if (!pad || !Array.isArray(pad.keys)) return null;
    if (!(Number(scan) > 0)) return null;
    for (var i = 0; i < pad.keys.length; i++) {
      var k = pad.keys[i];
      if (!k || k.microKeyId === exceptMicroId) continue;
      if (!(Number(k.sourceScan) > 0)) continue;
      if (Number(k.sourceScan) === Number(scan) && !!k.sourceExtended === !!ext && k.enabled) {
        return k.microKeyId;
      }
    }
    return null;
  }

  function findNamedSourceConflict(pad, key, exceptMicroId) {
    var k = String(key || '').trim();
    if (!k || !pad || !Array.isArray(pad.keys)) return null;
    for (var i = 0; i < pad.keys.length; i++) {
      var r = pad.keys[i];
      if (!r || !r.enabled || r.microKeyId === exceptMicroId) continue;
      if (String(r.sourceKey || '').trim() === k) return r.microKeyId;
    }
    return null;
  }

  function routeSourceLabel(route) {
    if (!route) return '';
    var named = String(route.sourceKey || '').trim();
    if (named) {
      var kl = global.OneToneKeyLabels;
      return kl && kl.friendlyKeyName ? kl.friendlyKeyName(named) : named;
    }
    if (Number(route.sourceScan) > 0) return scanLabel(route.sourceScan, route.sourceExtended);
    return '';
  }

  function renderHardwarePad(m, pad, opts) {
    opts = opts || {};
    var mode = opts.mode || 'preview';
    var sizeCls = opts.compact ? ' micro-hw--sm' : '';
    var compactCls = mode === 'overlay' ? ' micro-hw--compact' : '';
    // Preview uses local state; softPad/config/run reflect pad.enabled for shell color.
    var codexOn = mode === 'preview'
      ? previewPadMode === 'codex'
      : !!(pad && pad.enabled);
    var shellCls = 'micro-hw-shell'
      + (codexOn ? ' is-mode-codex' : ' is-mode-numpad');
    var skin = canonicalizePadSkin(pad && pad.skin);

    var html =
      '<div class="micro-hw-wrap">' +
      '<div class="' + shellCls + '">' +
      '<div class="micro-hw' + sizeCls + compactCls + (codexOn ? '' : ' is-mode-numpad') +
      '" data-pad-skin="' + esc(skin) + '">' +
      '<div class="micro-hw__face">' +
      ((mode === 'softPad' || mode === 'preview')
        ? renderPadFaceTopChrome(m, pad, opts)
        : '') +
      '<div class="micro-hw__grid' +
      (codexOn
        ? (navKeysOn(pad) ? '' : ' micro-hw__grid--no-nav')
        : ' micro-hw__grid--numpad') +
      '">';

    var cells = codexOn
      ? visibleSoftPadCells(pad)
      : (LAYOUT.numpadCells || LAYOUT.cells);
    cells.forEach(function (cell) {
      if (cell.kind === 'numpad' && codexOn) return;
      var isNp = cell.kind === 'numpad';
      var route = isNp ? null : routeForMicroKey(pad, cell.microKeyId);
      var isNav = isNavMicroKey(cell.microKeyId);
      var bound = isNp || isNav ? true : !!(route && route.enabled && route.slotId);
      var tag = cell.kind === 'placeholder' ? 'div' : 'button';
      var cls = 'micro-hw__key micro-hw__key--' + (cell.kind || 'command');
      if (cell.gridColSpan === 2) cls += ' micro-hw__key--span2';
      if (cell.gridRowSpan === 2) cls += ' micro-hw__key--rowspan2';
      if (bound) cls += ' is-bound';
      if (!isNp && !isNav && route && route.slotId && route.enabled === false) cls += ' is-route-disabled';
      if ((!isNp && isScreenOnly(route) && !isAdvancedOnly(route, cell.microKeyId)) || isNav) cls += ' is-screen-only';
      if (!isNp && !isNav && isAdvancedOnly(route, cell.microKeyId)) {
        cls += ' is-advanced-only';
      }
      if (cell.microKeyId === 'ENC') cls += codexOn ? ' is-mode-on' : ' is-mode-off';
      if (highlightSlotId && route && route.slotId === highlightSlotId) cls += ' is-focused';
      if (activeHighlightId && activeHighlightId === cell.microKeyId) cls += ' is-pressed is-active';
      var runSt = (padRunStatus !== 'idle' && padRunMicroKeyId === cell.microKeyId)
        ? padRunStatus
        : 'idle';
      var keyLightRgb = '';
      if (!isNp && !isNav && route) {
        keyLightRgb = String(route.lightRgb || route.light_rgb || '').trim();
        if (keyLightRgb && keyLightRgb.charAt(0) !== '#') keyLightRgb = '#' + keyLightRgb;
        if (keyLightRgb.length !== 7) keyLightRgb = '';
      }
      var style = 'grid-row:' + cell.gridRow + (cell.gridRowSpan ? ' / span ' + cell.gridRowSpan : '') +
        ';grid-column:' + cell.gridCol +
        (cell.gridColSpan ? ' / span ' + cell.gridColSpan : '') +
        (keyLightRgb ? (';--key-light-rgb:' + keyLightRgb + ';') : '') + ';';
      var typeAttr = tag === 'button' ? ' type="button"' : '';
      var agAttr = cell.kind === 'agent' && cell.agIndex != null ? ' data-ag="' + cell.agIndex + '"' : '';
      var tipName = cellLabel(cell);
      var tipChord = '';
      if (bound && route && route.slotId) {
        var tipCap = softPadKeyCaption(m, route.slotId, tipName);
        tipName = tipCap.name;
        tipChord = tipCap.chord;
      }
      if (cell.microKeyId === 'ENC') {
        tipName = codexOn
          ? t('codexMicroPadModeCodex', '虚拟键盘模式')
          : t('codexMicroPadModeNumpad', '数字键模式');
      }
      var ariaTip = tipChord ? (tipName + ' · ' + tipChord) : tipName;
      var encModeAttr = cell.microKeyId === 'ENC' ? ' data-act="pad-mode"' : '';
        var metaName = '';
        var metaChord = '';
        if (cell.microKeyId === 'ENC') {
          metaName = tipName;
          metaChord = codexOn ? 'ON' : 'OFF';
      } else if (!isNp && isNavMicroKey(cell.microKeyId)) {
          metaName = cellLabel(cell);
          metaChord = bound && route && route.slotId
            ? friendlyChord(chordForSlot(m, route.slotId))
            : t('codexMicroPadNavDefault', '默认注入方向键');
      } else if (!isNp && bound && route && route.slotId) {
          var metaCap = softPadKeyCaption(m, route.slotId, cellLabel(cell));
          metaName = metaCap.name;
          metaChord = metaCap.chord;
          if (cell.microKeyId === 'ACT10' && route && Number(route.sourceScan) > 0) {
            var numLbl = scanLabel(route.sourceScan, route.sourceExtended);
            metaChord = numLbl + (metaChord ? ' · ' + metaChord : '');
          }
      } else if (!isNp) {
          metaName = cellLabel(cell);
          metaChord = t('codexMicroPadUnbound', '未配置');
      } else {
        metaName = String(cell.digit || cell.uiLabelZh || cell.microKeyId || '');
      }
      html += '<' + tag + typeAttr + ' class="' + cls + '" data-micro-key="' + esc(cell.microKeyId) + '"' +
        ' data-run-status="' + esc(runSt) + '"' +
        (keyLightRgb ? ' data-key-light="1"' : '') +
        (metaName ? ' data-cap-name="' + esc(metaName) + '"' : '') +
        (metaChord ? ' data-cap-chord="' + esc(metaChord) + '"' : '') +
        agAttr + encModeAttr + ' style="' + style + '" aria-label="' + esc(ariaTip) + '"' +
        (cell.microKeyId === 'ENC' ? ' role="switch" aria-checked="' + (codexOn ? 'true' : 'false') + '"' : '') +
        '>';

      var iconId = resolveIconId(route, cell.microKeyId);
      if (isNp) {
        html += '<span class="micro-hw__digit" aria-hidden="true">' + esc(cell.digit || cell.uiLabelZh || '') + '</span>';
      } else {
        var encIconId = cell.microKeyId === 'ENC' ? 'power' : iconId;
        html += '<span class="micro-hw__icon" aria-hidden="true">' + iconSvg(encIconId) + '</span>';
      }
      html += '</' + tag + '>';
    });

    html += '</div>';
    // Soft Pad settings preview: hide decorative status LEDs (bottom-left dots).
    // Overlay / manager keep them for run-status chrome. Not clickable; no protocol impact.
    if (mode !== 'softPad') {
      html +=
      '<div class="micro-hw__leds" data-pad-status="' + esc(padRunStatus) + '" aria-hidden="true">' +
      '<span class="micro-hw__led"></span><span class="micro-hw__led"></span><span class="micro-hw__led"></span>' +
        '</div>';
    }
    html += '</div></div></div>' +
      '</div>';
    return html;
  }

  function isNavMicroKey(id) {
    return /^NAV_/.test(String(id || ''));
  }

  /** Soft Pad left NAV column visibility (showNavigationPad). Does not capture physical arrows. */
  function navKeysOn(pad) {
    if (!pad) return true;
    if (pad.showNavigationPad != null) return pad.showNavigationPad !== false;
    return pad.navKeysEnabled !== false;
  }

  function setNavColumnShown(pad, on) {
    if (!pad) return;
    pad.showNavigationPad = !!on;
    try { delete pad.navKeysEnabled; } catch (_) { pad.navKeysEnabled = undefined; }
  }

  /** Shift Soft Pad cell one column left after removing the NAV rail. */
  function compactCellWithoutNav(cell) {
    if (!cell) return null;
    var out = Object.assign({}, cell);
    var col = Number(out.gridCol) || 0;
    if (col > 1) out.gridCol = col - 1;
    return out;
  }

  /** Soft Pad face cells for preview/overlay; hides NAV when navKeysEnabled is off. */
  function visibleSoftPadCells(pad) {
    var cells = LAYOUT.cells || [];
    if (navKeysOn(pad)) return cells.slice();
    return cells
      .filter(function (c) { return c && !isNavMicroKey(c.microKeyId); })
      .map(compactCellWithoutNav);
  }

  /** Soft heuristic only — null = uncertain (do not tip). */
  function softLikelyNoNumpad() {
    try {
      if (typeof navigator === 'undefined') return null;
      var touch = Number(navigator.maxTouchPoints || 0) > 0;
      var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
      if (touch && coarse) return true;
    } catch (_) {}
    return null;
  }

  function cellByMicroId(microKeyId) {
    for (var i = 0; i < LAYOUT.cells.length; i++) {
      if (LAYOUT.cells[i].microKeyId === microKeyId) return LAYOUT.cells[i];
    }
    return null;
  }

  function previewKeyInHero(m, microKeyId) {
    previewMicroKeyId = String(microKeyId || '').trim();
    applyPressedClass(previewMicroKeyId);
    var host = document.getElementById('codexMicroPadHostTrigger')
      || document.getElementById('codexMicroPadHostTarget');
    if (host) {
      host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
        el.classList.toggle('is-focused', el.getAttribute('data-micro-key') === previewMicroKeyId);
      });
    }
    applyTriggerHeroPreview(m);
  }

  function clearTriggerHeroPreview() {
    previewMicroKeyId = '';
    var disp = document.getElementById('triggerDisplay');
    if (disp) disp.classList.remove('is-micro-preview');
    var tgt = document.getElementById('targetDisplay');
    if (tgt) tgt.classList.remove('is-micro-preview');
  }

  /** Show numpad label + command on hero; does not change mappings. */
  function applyTriggerHeroPreview(m) {
    if (!previewMicroKeyId) return false;
    var step = global.OneToneKeysPageState && global.OneToneKeysPageState.getStep
      ? global.OneToneKeysPageState.getStep()
      : '';
    // Trigger page only — recognition page uses edit/run, not hero preview.
    if (step === 'target') return false;
    if (step && step !== 'trigger') return false;
    m = m || (global.OneToneAgentCapabilityUi && global.OneToneAgentCapabilityUi.activeCodexMapping
      ? global.OneToneAgentCapabilityUi.activeCodexMapping()
      : null);
    if (!m) return false;
    var pad = m.codexMicroPad;
    var route = routeForMicroKey(pad, previewMicroKeyId);
    var cell = cellByMicroId(previewMicroKeyId);
    var numLabel = '';
    if (route && route.sourceScan) {
      numLabel = scanLabel(route.sourceScan, route.sourceExtended);
    } else if (cell) {
      numLabel = cellLabel(cell);
    } else {
      numLabel = previewMicroKeyId;
    }
    var cmdLabel = route && route.slotId && route.enabled
      ? slotLabel(route.slotId)
      : t('codexMicroPadUnbound', '未配置');
    var text = numLabel + (cmdLabel ? ' · ' + cmdLabel : '');
    var viewId = step === 'target' ? 'targetView' : 'triggerView';
    var dispId = step === 'target' ? 'targetDisplay' : 'triggerDisplay';
    var viewEl = document.getElementById(viewId);
    var dispEl = document.getElementById(dispId);
    if (viewEl) viewEl.textContent = text;
    if (dispEl) {
      dispEl.classList.remove('empty');
      dispEl.classList.add('is-micro-preview');
    }
    var hintId = step === 'target' ? 'keysTargetKeycapHint' : 'keysKeycapHint';
    var hint = document.getElementById(hintId);
    if (hint) {
      hint.textContent = step === 'target'
        ? t('codexStepRecognitionKeycapHint', '点击下方键帽编辑能力 · 长按物理说话键听写')
        : t('keysKeycapHint', '点击修改快捷键');
    }
    return true;
  }

  function invokeFire(microKeyId, phase) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) {
      return Promise.resolve({ ok: false, reason: 'no_invoke' });
    }
    return invoke('cmd_codex_micro_pad_fire', {
      microKeyId: microKeyId,
      phase: phase
    }).catch(function () {
      return { ok: false, reason: 'invoke_failed' };
    });
  }

  function explainFireResult(res) {
    if (!res) return;
    var reason = String(res.reason || '');
    if (reason === 'hold_busy') {
      toast(t('codexMicroPadHoldBusy', '说话键占用中，请先松开'));
      return;
    }
    if (reason === 'hold_failed') {
      toast(t('codexMicroPadHoldFailed', '无法启动听写，请确认 Codex 桌面版已打开'));
      return;
    }
    if (reason === 'no_profile') {
      toast(t('codexMicroPadNoProfile', '未找到 Codex 应用场景配置'));
      return;
    }
    if (res.ok) {
      var slot = String(res.slotId || res.slot_id || '').trim();
      var label = slot ? slotLabel(slot) : '';
      if (reason === 'hold_down') {
        toast(t('softPadKeyListening', '听写中 · 松开结束') + (label ? ' · ' + label : ''));
        return;
      }
      if (reason === 'hold_up') {
        toast(t('softPadKeyDone', '已完成') + (label ? ' · ' + label : ''));
        return;
      }
      if (reason === 'fired' || reason === 'enhance_pulse') {
        toast(t('softPadKeyFired', '已触发') + (label ? ' · ' + label : ''));
      }
      return;
    }
    if (reason === 'not_foreground') {
      toast(t('codexMicroPadNeedCodexFg', '请先切到 Codex 前台再运行'));
    } else if (reason === 'unbound') {
      toast(t('codexMicroPadUnbound', '未配置'));
    } else if (reason === 'invalid_key' || reason === 'invalid_phase') {
      toast(t('codexMicroPadFireFailed', '无法触发该键'));
    }
  }

  function clearPadRunTimer() {
    if (padRunTimer) {
      clearTimeout(padRunTimer);
      padRunTimer = null;
    }
  }

  function padRunStatusLabel(status) {
    if (status === 'listening') return t('codexMicroPadStatusListening', '听写中');
    if (status === 'needs_input') return t('codexMicroPadStatusNeedsInput', '等待输入');
    if (status === 'running') return t('codexMicroPadStatusRunning', '执行中');
    if (status === 'done') return t('codexMicroPadStatusDone', '完成');
    if (status === 'failed') return t('codexMicroPadStatusFailed', '失败');
    return t('codexMicroPadStatusIdle', '空闲');
  }

  /** Map Hook lifecycle event → Micro light status (same as Rust map_event_to_status). */
  function mapHookEventToLight(event) {
    var ev = String(event || '').trim();
    if (ev === 'UserPromptSubmit') return 'running';
    if (ev === 'PreToolUse' || ev === 'PostToolUse') return 'running';
    if (ev === 'PermissionRequest') return 'needs_input';
    if (ev === 'Stop') return 'done';
    if (ev === 'SessionStart') return 'idle';
    return '';
  }

  function hookLightStatusFromSetup(st) {
    st = st || {};
    var light = String(st.lightStatus || st.light_status || '').trim();
    if (light) return light;
    return mapHookEventToLight(st.lastEvent || st.last_event) || 'idle';
  }

  function hookHumanHint(phase, light, source, agent) {
    var src = String(source || '').trim();
    var agentLbl = agentDisplayLabel(agent);
    var who = agentLbl || (src.indexOf('claude') === 0 ? 'Claude' : 'Codex');
    if (phase === 'not_configured') {
      return t('codexMicroPadHookHintNone', '先复制 Hook 配置并合并到 Codex，再在 /hooks 里信任');
    }
    if (phase === 'configured_waiting') {
      return t('codexMicroPadHookHintWaiting', '配置已就绪。在 Codex 发一条消息后，status 绑定键会亮起状态灯');
    }
    if (light === 'running') {
      return t('codexMicroPadHookHintRunningAgent', '{agent} 正在处理请求 · status 键执行中').replace(
        '{agent}',
        who
      );
    }
    if (light === 'needs_input') {
      return t('codexMicroPadHookHintNeedsInputAgent', '{agent} 在等你确认权限或继续输入').replace(
        '{agent}',
        who
      );
    }
    if (light === 'done') {
      return t('codexMicroPadHookHintDone', '本回合刚完成 · 状态灯稍后回到空闲');
    }
    if (light === 'failed') {
      return t('codexMicroPadHookHintFailedAgent', '{agent} 侧出现失败，可查看对话详情').replace(
        '{agent}',
        who
      );
    }
    if (src === 'codex_hook' || src === 'codex_app' || src === 'claude_hook' || src === 'claude_app') {
      return t('codexMicroPadHookHintIdleLinkedAgent', '已与 {agent} 状态灯联动 · status 键空闲待命').replace(
        '{agent}',
        who
      );
    }
    return t('codexMicroPadHookHintIdle', '状态灯已就绪');
  }

  /** Honest status-source labels (native stays internal; UI says Native Micro).
   * Prefer legacy labels (codex_hook / claude_hook). Raw "hook"/"app" alone are ambiguous —
   * pass sourceLegacy or use statusSourceLabelFor(source, agent). */
  function statusSourceLabel(source) {
    var s = String(source || '').trim();
    if (s === 'native' || s === 'native_micro') {
      return t('codexMicroPadStatusSourceNative', 'Native Micro');
    }
    if (s === 'codex_hook') {
      return t('codexMicroPadStatusSourceHook', 'Codex Hook');
    }
    if (s === 'claude_hook') {
      return t('codexMicroPadStatusSourceClaudeHook', 'Claude Hook');
    }
    if (s === 'codex_app') {
      return t('codexMicroPadStatusSourceApp', 'Codex App');
    }
    if (s === 'claude_app') {
      return t('codexMicroPadStatusSourceClaudeApp', 'Claude App');
    }
    if (s === 'inferred') return t('codexMicroPadStatusSourceInferred', 'Inferred');
    if (s === 'fallback') return t('codexMicroPadStatusSourceFallback', 'Fallback');
    // Ambiguous core channel — do not assume Codex.
    if (s === 'hook' || s === 'app') return s;
    return s || t('codexMicroPadStatusSourceFallback', 'Fallback');
  }

  function statusSourceLabelFor(source, agent) {
    var s = String(source || '').trim();
    var a = String(agent || '').trim().toLowerCase();
    if (s === 'hook' || s === 'codex_hook' || s === 'claude_hook') {
      return statusSourceLabel(a === 'claude' ? 'claude_hook' : (s === 'claude_hook' ? 'claude_hook' : 'codex_hook'));
    }
    if (s === 'app' || s === 'codex_app' || s === 'claude_app') {
      return statusSourceLabel(a === 'claude' ? 'claude_app' : (s === 'claude_app' ? 'claude_app' : 'codex_app'));
    }
    return statusSourceLabel(s);
  }

  function agentDisplayLabel(agent) {
    var a = String(agent || '').trim().toLowerCase();
    if (a === 'claude') return t('codexMicroPadAgentClaude', 'Claude');
    if (a === 'codex') return t('codexMicroPadAgentCodex', 'Codex');
    return a;
  }

  function hookPanelPhaseLabel(phase) {
    if (phase === 'connected') return t('codexMicroPadHookPhaseConnected', '已连接');
    if (phase === 'configured_waiting') {
      return t('codexMicroPadHookPhaseWaiting', '已配置，等待 Codex 事件');
    }
    return t('codexMicroPadHookPhaseNone', '未配置');
  }

  /**
   * Codex status-light host: enabled slotId=status → that microKeyId;
   * else fallback AG00 if in LAYOUT.cells; else '' (ring/Soft RGB only).
   * Light is overlay only — does not change the key's click/slot action
   * (stock Soft Pad has no status route; AG00 hosts the light while pressing still runs commandPalette).
   */
  function resolveStatusLightMicroKeyId(pad) {
    var keys = (pad && pad.keys) || [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var r = keys[i];
      if (!r || r.enabled === false) continue;
      if (String(r.slotId || '').trim() !== 'status') continue;
      var id = String(r.microKeyId || '').trim();
      if (!id) continue;
      if (cellByMicroId(id)) return id;
      return '';
    }
    if (cellByMicroId('AG00')) return 'AG00';
    return '';
  }

  var CLAUDE_AG_POOL = ['AG01', 'AG00', 'AG02', 'AG03', 'AG05', 'AG04'];
  var CLAUDE_MAIN_KEY = 'claude/main';

  function resolveClaudeMainLightMicroKeyId(pad) {
    var keys = (pad && pad.keys) || [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var r = keys[i];
      if (!r || r.enabled === false) continue;
      if (String(r.slotId || '').trim() !== 'claudeModel') continue;
      var id = String(r.microKeyId || '').trim();
      if (!id) continue;
      if (cellByMicroId(id)) return id;
      return '';
    }
    if (cellByMicroId('AG01')) return 'AG01';
    return '';
  }

  function shortAgentType(agentType) {
    var raw = String(agentType || '').trim();
    if (!raw) return 'Claude';
    var lower = raw.toLowerCase();
    if (lower === 'code-reviewer') return 'reviewer';
    if (lower === 'test-runner') return 'tests';
    if (lower === 'debugger') return 'debug';
    var parts = raw.split(/[\/\-]/);
    var seg = parts.length ? parts[parts.length - 1] : raw;
    seg = String(seg || raw).trim() || raw;
    if (seg.length > 10) seg = seg.slice(0, 10);
    return seg || 'Claude';
  }

  /**
   * Legacy helper: sticky Claude agent → AG hosts (Actions face / diagnose only).
   * SessionLanes paint from AgentLane slots — do not use this to place clickable subagents.
   */
  function assignClaudeAgentLightHosts(pad, lights, stickyMap) {
    var statusHost = resolveStatusLightMicroKeyId(pad);
    var mainHost = resolveClaudeMainLightMicroKeyId(pad);
    var sticky = stickyMap || {};
    var used = {};
    if (statusHost) used[statusHost] = true;
    var pool = CLAUDE_AG_POOL.filter(function (id) {
      return cellByMicroId(id) && id !== statusHost;
    });
    var list = (lights || []).slice().filter(function (l) {
      return l && String(l.state || '') !== 'idle';
    });
    list.sort(function (a, b) {
      var fa = Number(a.firstSeenAt || a.first_seen_at || 0);
      var fb = Number(b.firstSeenAt || b.first_seen_at || 0);
      if (fa !== fb) return fa - fb;
      return String(a.agentKey || a.agent_key || '').localeCompare(
        String(b.agentKey || b.agent_key || '')
      );
    });
    var assigned = [];
    var overflow = [];
    var mainActive = list.some(function (l) {
      return String(l.agentKey || l.agent_key) === CLAUDE_MAIN_KEY;
    });
    list.forEach(function (light) {
      var key = String(light.agentKey || light.agent_key || '').trim();
      if (!key) return;
      var isMain = key === CLAUDE_MAIN_KEY;
      var host = '';
      var keys = (pad && pad.keys) || [];
      var i;
      for (i = 0; i < keys.length; i++) {
        var r = keys[i];
        if (!r || r.enabled === false) continue;
        var bind = String(r.agentLightId || r.agent_light_id || '').trim();
        if (!bind) continue;
        var mid = String(r.microKeyId || '').trim();
        if (!mid || !cellByMicroId(mid) || mid === statusHost) continue;
        if (
          bind === key ||
          bind === String(light.agentId || light.agent_id || '') ||
          bind === String(light.agentType || light.agent_type || '')
        ) {
          host = mid;
          break;
        }
      }
      if (!host && isMain && mainHost) host = mainHost;
      if (!host && sticky[key] && pool.indexOf(sticky[key]) >= 0 && !used[sticky[key]]) {
        host = sticky[key];
      }
      if (!host) {
        for (i = 0; i < pool.length; i++) {
          var p = pool[i];
          if (used[p]) continue;
          if (!isMain && p === mainHost && mainActive) continue;
          host = p;
          break;
        }
      }
      var agentType = String(light.agentType || light.agent_type || '').trim();
      var agentId = String(light.agentId || light.agent_id || '').trim();
      if (!host || (used[host] && sticky[key] !== host)) {
        overflow.push({
          agentKey: key,
          agentId: agentId,
          agentType: agentType,
          shortLabel: shortAgentType(agentType)
        });
        return;
      }
      used[host] = true;
      sticky[key] = host;
      assigned.push({ microKeyId: host, light: light });
    });
    return {
      assigned: assigned,
      overflow: overflow,
      sticky: sticky
    };
  }

  function applyHookLightToManagerPad(light, source, pad) {
    var host = document.getElementById('codexPadMgrPad');
    if (!host) return;
    var st = String(light || 'idle').trim() || 'idle';
    var src = String(source || 'codex_hook').trim() || 'codex_hook';
    var targetId = resolveStatusLightMicroKeyId(
      pad || (padManagerMapping && padManagerMapping.codexMicroPad) || null
    );
    host.querySelectorAll('[data-micro-key]').forEach(function (el) {
      var mid = el.getAttribute('data-micro-key');
      var prevSrc = el.getAttribute('data-status-source') || '';
      if (targetId && mid === targetId) {
        el.setAttribute('data-run-status', st);
        el.setAttribute('data-status-source', src);
        return;
      }
      if (
        prevSrc === 'codex_hook' ||
        prevSrc === 'claude_hook' ||
        prevSrc === 'codex_app' ||
        prevSrc === 'hook' ||
        prevSrc === 'app'
      ) {
        el.setAttribute('data-run-status', 'idle');
        el.removeAttribute('data-status-source');
      }
    });
    var leds = host.querySelector('.micro-hw__leds');
    if (leds) leds.setAttribute('data-pad-status', st);
  }

  function renderPadDiagDetails() {
    return (
      '<details class="codex-pad-mgr__diag" id="codexPadDiag">' +
      '<summary>' + esc(t('codexMicroPadDiagSummary', '状态诊断')) + '</summary>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('codexMicroPadDiagHint', '只读解释当前 pad_status 与最近仲裁事件，不改灯色。')) +
      '</p>' +
      '<div class="codex-pad-mgr__diag-snap" data-pad-diag-snap aria-live="polite"></div>' +
      '<div class="codex-pad-mgr__diag-filters" role="group" aria-label="' +
      esc(t('codexMicroPadDiagFilterAria', '回放筛选')) + '">' +
      '<button type="button" class="codex-micro-pad__btn is-active" data-act="pad-diag-filter" data-filter="all">' +
      esc(t('codexMicroPadDiagFilterAll', '全部')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="pad-diag-filter" data-filter="accepted">' +
      esc(t('codexMicroPadDiagFilterAccepted', '已接受')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="pad-diag-filter" data-filter="rejected">' +
      esc(t('codexMicroPadDiagFilterRejected', '已拒绝')) + '</button>' +
      '</div>' +
      '<ol class="codex-pad-mgr__diag-replay" data-pad-diag-replay aria-live="polite"></ol>' +
      '<p class="codex-pad-mgr__hint" data-pad-diag-empty hidden>' +
      esc(t('codexMicroPadDiagReplayEmpty', '尚无 pad-status.jsonl 事件')) +
      '</p>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="pad-diag-refresh">' +
      esc(t('codexMicroPadDiagRefresh', '刷新诊断')) + '</button>' +
      '</details>'
    );
  }

  function renderHookStatusCard(pad, opts) {
    opts = opts || {};
    var includeDiag = opts.includeDiag === true;
    var on = !!(pad && pad.codexStatusLightsEnabled);
    return (
      '<div class="codex-pad-mgr__hook" id="codexPadHookCard" data-phase="not_configured" data-light="idle">' +
      '<p class="codex-pad-mgr__label">' + esc(t('codexMicroPadHookTitle', 'Codex 状态灯')) + '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('codexMicroPadStatusLightsLead',
        '要配置「忙不忙」的颜色灯：就在这里打开开关。灯只显示状态，不会改你的快捷动作。')) +
      '</p>' +
      '<label class="codex-pad-mgr__setting"><input type="checkbox" data-act="status-lights"' +
      (on ? ' checked' : '') + '>' +
      esc(t('codexMicroPadStatusLightsEnable', '开启 Codex 状态灯')) +
      '</label>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('codexMicroPadStatusLightsHint',
        '用法：打开后在 Codex 发一条消息，status 绑定键会亮。只收状态，不注入按键。')) +
      '</p>' +
      '<div class="codex-pad-mgr__hook-live" data-hook-live data-light="idle">' +
      '<span class="codex-pad-mgr__hook-led" aria-hidden="true"></span>' +
      '<div class="codex-pad-mgr__hook-live-text">' +
      '<div class="codex-pad-mgr__hook-status">' +
      '<span class="codex-pad-mgr__hook-phase" data-hook-phase>' +
      esc(hookPanelPhaseLabel('not_configured')) + '</span>' +
      '<span class="codex-micro-pad__run-status" data-hook-light-label data-status="idle">' +
      esc(padRunStatusLabel('idle')) + '</span>' +
      '<span class="codex-pad-mgr__hook-meta" data-hook-meta></span>' +
      '</div>' +
      '<p class="codex-pad-mgr__hook-hint-line" data-hook-human>' +
      esc(hookHumanHint('not_configured', 'idle', '')) + '</p>' +
      '</div></div>' +
      '<p class="codex-pad-mgr__hint" data-hook-trust>' +
      esc(t('codexMicroPadHookTrustHint', '如果已配置但没有事件，请在 Codex 的 /hooks 中信任该 Hook。')) +
      '</p>' +
      '<div class="codex-pad-mgr__hook-actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="hook-copy">' +
      esc(t('codexMicroPadHookCopy', '复制 Hook 配置')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="hook-install">' +
      esc(t('codexMicroPadHookInstall', '一键安装 hooks')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="hook-docs">' +
      esc(t('codexMicroPadHookDocs', '打开说明')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="hook-refresh">' +
      esc(t('codexMicroPadHookRefresh', '刷新状态')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="clear-errors">' +
      esc(t('codexMicroPadClearErrors', '清除红灯')) + '</button>' +
      '</div>' +
      (includeDiag ? renderPadDiagDetails() : '') +
      '<p class="codex-pad-mgr__hint is-error" data-hook-error hidden></p>' +
      '</div>'
    );
  }

  function renderBindingValidateCard() {
    return (
      '<details class="codex-pad-mgr__bind" id="codexPadBindCard">' +
      '<summary>' + esc(t('codexMicroPadBindSummary', '绑定校验')) + '</summary>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('codexMicroPadBindHint', '检查缺槽、空热键、扫描码冲突；可一键修复（不改已有非空热键）。')) +
      '</p>' +
      '<p class="codex-pad-mgr__bind-snap" data-bind-diag-snap aria-live="polite"></p>' +
      '<ul class="codex-pad-mgr__bind-issues" data-bind-diag-issues></ul>' +
      '<p class="codex-pad-mgr__hint" data-bind-diag-empty hidden>' +
      esc(t('codexMicroPadBindOk', '绑定完整，未发现问题')) +
      '</p>' +
      '<div class="codex-pad-mgr__bind-actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="pad-bind-refresh">' +
      esc(t('codexMicroPadBindRefresh', '刷新校验')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="pad-bind-heal">' +
      esc(t('codexMicroPadBindHeal', '一键修复')) + '</button>' +
      '</div>' +
      '</details>'
    );
  }

  function claudeHookPhaseLabel(phase) {
    if (phase === 'connected') return t('claudeActPhaseConnected', '已连接');
    if (phase === 'waiting') return t('claudeActPhaseWaiting', '等待事件');
    if (phase === 'stale') return t('claudeActPhaseStale', '已过期');
    if (phase === 'not_installed') return t('claudeActPhaseNotInstalled', '未接入');
    if (phase === 'error') return t('claudeActPhaseError', '异常');
    return t('claudeActPhaseOffline', '离线');
  }

  function overflowReasonLabel(reason) {
    if (reason === 'status_host') return t('claudeActOvStatusHost', '被 status 宿主占用');
    if (reason === 'layout') return t('claudeActOvLayout', 'layout 不可见');
    return t('claudeActOvPoolFull', 'AG 池满');
  }

  var claudeHookSetupLast = null;

  function formatAgeSec(ms) {
    var n = Number(ms) || 0;
    if (n <= 0) return '';
    if (n < 1000) return n + ' ms';
    return Math.round(n / 1000) + ' 秒前';
  }

  function renderClaudeLabDetails() {
    return (
      '<details class="codex-pad-mgr__diag" data-claude-act-pad-details>' +
      '<summary>' + esc(t('claudeActPadPreview', 'Soft Pad 预览')) + '</summary>' +
      '<div class="codex-pad-mgr__claude-pad-row">' +
      '<div class="codex-pad-mgr__claude-pad" data-claude-act-pad></div>' +
      '<div class="codex-pad-mgr__claude-detail" data-claude-act-detail>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('claudeActDetailEmpty', '点击左侧键查看详情（只读）')) +
      '</p></div></div>' +
      '</details>' +
      '<details class="codex-pad-mgr__diag" data-claude-act-lights-details>' +
      '<summary>' + esc(t('claudeActLights', 'Claude 活动灯')) + '</summary>' +
      '<div class="codex-pad-mgr__claude-lights" data-claude-act-lights></div>' +
      '<div class="codex-pad-mgr__claude-overflow" data-claude-act-overflow></div>' +
      '</details>' +
      '<details class="codex-pad-mgr__diag" data-claude-act-inject-details>' +
      '<summary>' + esc(t('claudeActInject', '测试注入')) + '</summary>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('claudeActInjectNote', '测试注入，不是 native · 只写 claude_hook · 不写 thstatus')) +
      '</p>' +
      '<div class="codex-pad-mgr__claude-inject">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-inject" data-preset="session_start">' +
      esc(t('claudeActInjSession', '注入 SessionStart')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-inject" data-preset="running">' +
      esc(t('claudeActInjRunning', '注入 Claude running')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-inject" data-preset="needs_input">' +
      esc(t('claudeActInjNeeds', '注入 Claude needs_input')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-inject" data-preset="failed">' +
      esc(t('claudeActInjFailed', '注入 Claude failed')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-inject" data-preset="two_subagents">' +
      esc(t('claudeActInjTwo', '注入两个 subagents')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-inject" data-preset="subagent_stop">' +
      esc(t('claudeActInjStop', '注入 SubagentStop')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn is-danger" data-act="claude-act-clear">' +
      esc(t('claudeActClear', '清空测试活动灯')) + '</button>' +
      '</div>' +
      '</details>'
    );
  }

  function renderClaudeActivityPadCard(opts) {
    opts = opts || {};
    var includeLab = opts.includeLab === true;
    return (
      '<div class="codex-pad-mgr__claude-act" id="codexClaudeActivityPad" data-phase="not_installed">' +
      '<div class="codex-pad-mgr__claude-act-head">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('claudeActTitle', 'Claude Activity 接入')) + '</p>' +
      '</div>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t(
        'claudeActHint',
        '检测 → 预览 → 确认安装 Claude Hooks。需你确认后才会写入，并可撤回。CLI 操作键盘与 Hook 安装分开。'
      )) +
      '</p>' +
      '<div class="codex-pad-mgr__claude-status" data-claude-setup-status aria-live="polite">' +
      '<div class="codex-pad-mgr__claude-status-row"><span>Claude Hooks</span><strong data-setup-hooks>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>配置文件</span><code data-setup-settings>—</code></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>Probe 脚本</span><strong data-setup-probe>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>最近事件</span><strong data-setup-event>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>Soft Pad</span><strong data-setup-softpad>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>CLI 操作</span><strong data-setup-cli>—</strong></div>' +
      '</div>' +
      '<ol class="codex-pad-mgr__claude-steps" data-claude-setup-steps>' +
      '<li data-step="1"><strong>1. 检测</strong><span data-step-1-body>查找 settings.json / 现有 hooks / probe</span></li>' +
      '<li data-step="2"><strong>2. 预览</strong><span data-step-2-body>将新增的事件与 JSON diff</span></li>' +
      '<li data-step="3"><strong>3. 安装</strong><span data-step-3-body>备份后合并 OneTone hooks</span></li>' +
      '<li data-step="4"><strong>4. 验证</strong><span data-step-4-body>打开 Claude Code 发一句 prompt</span></li>' +
      '</ol>' +
      '<pre class="codex-pad-mgr__diag-pre" data-claude-setup-preview hidden></pre>' +
      '<pre class="codex-pad-mgr__diag-pre" data-claude-setup-uninstall-preview hidden></pre>' +
      '<ul class="codex-pad-mgr__claude-issues" data-claude-act-issues></ul>' +
      '<div class="codex-pad-mgr__claude-act-actions codex-pad-mgr__claude-setup-actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-hook-redetect">' +
      esc(t('claudeActRedetect', '重新检测')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-hook-copy">' +
      esc(t('claudeActHookCopy', '复制配置')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-hook-open">' +
      esc(t('claudeActHookOpen', '打开配置文件')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-hook-preview">' +
      esc(t('claudeActHookPreview', '预览安装')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="claude-hook-install">' +
      esc(t('claudeActHookInstall', '确认安装')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-hook-uninstall-preview">' +
      esc(t('claudeActHookUninstallPreview', '预览撤回')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn is-danger" data-act="claude-hook-uninstall">' +
      esc(t('claudeActHookUninstall', '确认撤回')) + '</button>' +
      '</div>' +
      '<div class="codex-pad-mgr__claude-cli-bar" data-claude-cli-bar>' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('claudeCliBarTitle', 'Claude CLI 操作键盘')) + '</p>' +
      '<p class="codex-pad-mgr__hint" data-claude-cli-map aria-live="polite">' +
      esc(t('claudeCliMapPrefOff', '偏好：关闭 · 不会键注入')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t(
        'claudeCliBarHint',
        'CLI 操作通过键盘输入实现，只在偏好开启且 OneTone 确认当前前台是 Claude 会话时启用。无法确认时不会注入按键。'
      )) +
      '</p>' +
      '<p class="codex-pad-mgr__hint">ACT12：确认 / 发送 · ACT08：拒绝 / 取消</p>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="claude-cli-pref-toggle">' +
      esc(t('claudeCliPrefEnable', '允许高置信时启用')) + '</button>' +
      '</div>' +
      '<div class="codex-pad-mgr__claude-chips" data-claude-act-chips aria-live="polite"></div>' +
      '<p class="codex-pad-mgr__hint" data-claude-act-waiting hidden></p>' +
      (includeLab ? renderClaudeLabDetails() : '') +
      '</div>'
    );
  }

  function renderCursorHookSetupCard() {
    return (
      '<div class="codex-pad-mgr__claude-act" id="codexCursorHookPad" data-phase="not_configured">' +
      '<div class="codex-pad-mgr__claude-act-head">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('cursorHookTitle', 'Cursor Hook 接入')) + '</p>' +
      '</div>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t(
        'cursorHookHint',
        '检测用户级 hooks；项目级需你选择工作区后检测。用量暂无官方接口。需双回执后才会写入。'
      )) +
      '</p>' +
      '<div class="codex-pad-mgr__claude-status" data-cursor-setup-status aria-live="polite">' +
      '<div class="codex-pad-mgr__claude-status-row"><span>Node</span><strong data-cursor-node>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>Probe</span><strong data-cursor-probe>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>Scope</span><strong data-cursor-scope>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>Token</span><strong data-cursor-token>—</strong></div>' +
      '<div class="codex-pad-mgr__claude-status-row"><span>冲突</span><strong data-cursor-conflicts>—</strong></div>' +
      '</div>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t(
        'cursorHookUsageHonesty',
        '悬停迷你栏可看模型提示；用量请用下方「Cursor活动统计」（本地次数，非官方额度）。'
      )) +
      '</p>' +
      renderCursorActivityConsentCard() +
      '<pre class="codex-pad-mgr__diag-pre" data-cursor-merge-preview hidden></pre>' +
      '<div class="codex-pad-mgr__claude-act-actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="cursor-hook-redetect">' +
      esc(t('cursorHookRedetect', '重新检测')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="cursor-hook-copy">' +
      esc(t('cursorHookCopy', '复制合并预览')) + '</button>' +
      '</div></div>'
    );
  }

  function renderCursorActivityConsentCard() {
    return (
      '<div class="codex-pad-mgr__claude-act soft-pad-cursor-activity" id="codexCursorActivityPad" data-cursor-activity-card="1">' +
      '<div class="soft-pad-cursor-activity__viz" aria-hidden="true">' +
      '<div class="soft-pad-cursor-activity__meter">' +
      '<span class="soft-pad-cursor-activity__bar" style="--h:72%"></span>' +
      '<span class="soft-pad-cursor-activity__bar" style="--h:48%"></span>' +
      '<span class="soft-pad-cursor-activity__bar" style="--h:88%"></span>' +
      '<span class="soft-pad-cursor-activity__bar" style="--h:36%"></span>' +
      '<span class="soft-pad-cursor-activity__bar is-today" style="--h:64%"></span>' +
      '</div>' +
      '<div class="soft-pad-cursor-activity__chips">' +
      '<span class="soft-pad-cursor-activity__chip is-on">' +
      esc(t('cursorActivityAllowTurns', '今日对话')) + '</span>' +
      '<span class="soft-pad-cursor-activity__chip is-on">' +
      esc(t('cursorActivityAllowSessions', '会话数')) + '</span>' +
      '<span class="soft-pad-cursor-activity__chip is-on">' +
      esc(t('cursorActivityAllowTime', '活跃时长')) + '</span>' +
      '<span class="soft-pad-cursor-activity__chip is-off">Token</span>' +
      '<span class="soft-pad-cursor-activity__chip is-off">' +
      esc(t('cursorActivityDenyText', '对话内容')) + '</span>' +
      '</div></div>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('cursorActivityVizLead',
        '本机活动柱状示意 · 非官方额度。不读登录 / Token / Cookie / 对话正文。')) +
      '</p>' +
      '<div class="codex-pad-mgr__claude-act-actions">' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="cursor-activity-enable">' +
      esc(t('cursorActivityEnable', '启用本地统计')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="cursor-activity-disable" hidden>' +
      esc(t('cursorActivityDisable', '关闭')) + '</button>' +
      '</div>' +
      '<p class="codex-pad-mgr__hint" data-cursor-activity-status aria-live="polite"></p>' +
      '</div>'
    );
  }

  function softPadLabVisible(pad) {
    return String((pad && pad.layoutProfile) || '').toLowerCase() === 'advanced';
  }

  function hubSelectedScopeKind() {
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.getSelectedScopeId === 'function') {
        return String(Hub.getSelectedScopeId() || '').toLowerCase();
      }
    } catch (_) {}
    return '';
  }

  /** Scope / app label for Soft Pad settings preview chrome (通用 · Cursor …). */
  function softPadPreviewMainTitle(m) {
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.getSelectedScopeId === 'function' &&
          typeof Hub.appTitleFor === 'function') {
        return Hub.appTitleFor(Hub.getSelectedScopeId());
      }
    } catch (_) {}
    var app = String((m && m.appTargetId) || '').trim();
    if (!app) return t('softPadScopeUniversal', '通用');
    try {
      var Hub2 = global.OneToneSoftPadHub;
      if (Hub2 && Hub2.kindForAppId && Hub2.appTitleFor) {
        return Hub2.appTitleFor(Hub2.kindForAppId(app) || app);
      }
    } catch (_2) {}
    return t('codexMicroPadTitle', '小键盘');
  }

  function buildTopbarPreviewChipsHtml(pad, opts) {
    opts = opts || {};
    var focus = String(opts.focusAgent || hubSelectedScopeKind() || '').toLowerCase();
    var stripMode = opts.stripMode === 'full' ? 'full' : 'focus';
    var focusMap = '';
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && Hub.resolveSoftPadEntry) {
        var entry = Hub.resolveSoftPadEntry();
        if (entry && entry.mapping) focusMap = String(entry.mapping.id);
      }
    } catch (_) {}
    if (stripMode === 'focus') {
      if (!focus && !focusMap) return '';
      var habitIds = topbarHabitIdsOnPad(pad);
      if (focusMap && habitIds.indexOf(focusMap) >= 0) {
        return (
          '<button type="button" class="soft-pad-agent-bar__chip soft-pad-agent-bar__chip--preview is-focused" ' +
          'data-act="topbar-jump" data-habit-id="' + esc(focusMap) + '" data-status="idle" aria-current="true">' +
          '<img src="' + esc(habitIconForMappingId(focusMap)) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
          '<i class="soft-pad-agent-bar__dot" aria-hidden="true"></i></button>'
        );
      }
      var i;
      for (i = 0; i < TOPBAR_LIGHT_CANDIDATES.length; i++) {
        if (TOPBAR_LIGHT_CANDIDATES[i].agent === focus) {
          var inTopbar = agentLightEnabledOnPad(pad, focus);
          return (
            '<button type="button" class="soft-pad-agent-bar__chip soft-pad-agent-bar__chip--preview is-focused' +
            (inTopbar ? '' : ' is-preview-off') + '" ' +
            'data-act="topbar-jump" data-agent="' + esc(focus) + '" data-status="idle" aria-current="true">' +
            '<img src="' + esc(agentLightIconSrc(focus)) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
            '<i class="soft-pad-agent-bar__dot" aria-hidden="true"></i></button>'
          );
        }
      }
      return '';
    }
    var enabled = TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
      return agentLightEnabledOnPad(pad, c.agent);
    });
    var enabledKinds = {};
    enabled.forEach(function (c) { enabledKinds[c.agent] = true; });
    var habitIdsFull = topbarHabitIdsOnPad(pad).filter(function (hid) {
      // Skip habit chips whose Soft Pad kind already has an agent light (same icon twice).
      var kind = habitKindForMappingId(hid);
      return !(kind && enabledKinds[kind]);
    });
    var maxChips = opts.maxChips > 0 ? opts.maxChips : 0;
    var chipRows = enabled.map(function (c) {
      var focused = focus && c.agent === focus;
      return (
        '<button type="button" class="soft-pad-agent-bar__chip soft-pad-agent-bar__chip--preview' +
        (focused ? ' is-focused' : '') + '" ' +
        'data-act="topbar-jump" data-agent="' + esc(c.agent) + '" data-status="idle"' +
        (focused ? ' aria-current="true"' : '') + '>' +
        '<img src="' + esc(agentLightIconSrc(c.agent)) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
        '<i class="soft-pad-agent-bar__dot" aria-hidden="true"></i></button>'
      );
    }).concat(habitIdsFull.map(function (hid) {
      var focused = focusMap && String(hid) === focusMap;
      return (
        '<button type="button" class="soft-pad-agent-bar__chip soft-pad-agent-bar__chip--preview' +
        (focused ? ' is-focused' : '') + '" ' +
        'data-act="topbar-jump" data-habit-id="' + esc(hid) + '" data-status="idle"' +
        (focused ? ' aria-current="true"' : '') + '>' +
        '<img src="' + esc(habitIconForMappingId(hid)) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
        '<i class="soft-pad-agent-bar__dot" aria-hidden="true"></i></button>'
      );
    }));
    if (maxChips > 0 && chipRows.length > maxChips) chipRows = chipRows.slice(0, maxChips);
    return chipRows.join('');
  }

  /** In-face chrome: scope title + optional status-light strip (matches live overlay). */
  function renderPadFaceTopChrome(m, pad, opts) {
    opts = opts || {};
    var title = softPadPreviewMainTitle(m);
    var bar = '';
    if (!opts.omitFaceTopbar) {
      var chips = buildTopbarPreviewChipsHtml(pad, opts);
      if (chips) {
        bar = '<div class="soft-pad-agent-bar soft-pad-agent-bar--preview soft-pad-agent-bar--face" role="presentation">' +
          chips + '</div>';
      }
    }
    return (
      '<div class="micro-hw__face-top' + (opts.omitFaceTopbar ? ' micro-hw__face-top--title-only' : '') + '">' +
      '<span class="micro-hw__face-title">' + esc(title) + '</span>' +
      bar +
      '</div>'
    );
  }

  function agentLightIconSrc(agent) {
    agent = String(agent || '').toLowerCase();
    if (agent === 'copilotcli' || agent === 'copilot' || agent === 'copilotvscode') {
      return 'icons/app-target/copilot.png';
    }
    if (agent === 'gemini') return 'icons/app-target/gemini.png';
    if (agent === 'cline') return 'icons/app-target/cline.png';
    if (agent === 'opencode') return 'icons/app-target/opencode.png';
    if (agent === 'aider') return 'icons/app-target/aider.png';
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.iconForKind === 'function') {
        var fromHub = Hub.iconForKind(agent);
        if (fromHub) return fromHub;
      }
    } catch (_) {}
    var P = global.OneToneAppTargetPresets;
    if (P && P.presetById) {
      var appId = agent === 'codex' ? 'codex-chat'
        : agent === 'claude' ? 'claude-code'
          : agent === 'cursor' ? 'cursor-chat'
            : agent === 'copilotcli' || agent === 'copilot' || agent === 'copilotvscode' ? 'copilot-cli'
              : agent === 'gemini' ? 'gemini-cli'
                : agent === 'cline' ? 'cline-chat'
                  : agent === 'roo' ? 'roo-chat'
                    : agent === 'opencode' ? 'opencode-chat'
                      : agent === 'aider' ? 'aider-chat'
                      : agent === 'minimax' ? 'minimax-chat'
                  : agent === 'workbuddy' ? 'workbuddy-chat'
                    : agent === 'trae' ? 'trae-work'
                      : agent === 'traeCode' || agent === 'traecode' ? 'trae-code'
                        : agent === 'windsurf' ? 'windsurf-chat'
                        : agent === 'qoder' ? 'qoder-chat'
                        : agent;
      var preset = P.presetById(appId);
      if (preset && preset.icon) return String(preset.icon);
    }
    if (agent === 'minimax') return 'icons/app-target/minimaxcode.png';
    return 'icons/app-target/' + agent + '.png';
  }

  /** Developer registry — append agent + pad flag + overlay chip to extend. */
  var TOPBAR_LIGHT_CANDIDATES = [
    { agent: 'codex', label: 'Codex', connectKind: 'codex' },
    { agent: 'claude', label: 'Claude', connectKind: 'claude' },
    { agent: 'cursor', label: 'Cursor', connectKind: 'cursor' },
    { agent: 'copilotCli', label: 'Copilot', connectKind: 'shell' },
    { agent: 'copilotVscode', label: 'Copilot VS Code', connectKind: 'shell' },
    { agent: 'gemini', label: 'Gemini', connectKind: 'shell' },
    { agent: 'minimax', label: 'MiniMax', connectKind: 'minimax' },
    { agent: 'workbuddy', label: 'WorkBuddy', connectKind: 'shell' },
    { agent: 'trae', label: 'Trae Work', connectKind: 'solo' },
    { agent: 'traeCode', label: 'Trae Code', connectKind: 'shell' },
    { agent: 'windsurf', label: 'Windsurf', connectKind: 'solo' },
    { agent: 'qoder', label: 'Qoder', connectKind: 'shell' },
    { agent: 'cline', label: 'Cline', connectKind: 'shell' },
    { agent: 'roo', label: 'Roo', connectKind: 'shell' },
    { agent: 'opencode', label: 'OpenCode', connectKind: 'shell' },
    { agent: 'aider', label: 'Aider（仅完成）', connectKind: 'shell' }
  ];
  var AGENT_LIGHT_SPECS = TOPBAR_LIGHT_CANDIDATES;

  /** P0 Soft Pad quota providers — not Agent lights; mini pill lists saved keys. */
  var TOPBAR_QUOTA_CANDIDATES = [
    { provider: 'openrouter', label: 'OpenRouter', icon: 'icons/provider/openrouter.png' },
    { provider: 'deepseek', label: 'DeepSeek', icon: 'icons/app-target/deepseek.svg' },
    { provider: 'kimi', label: 'Kimi', icon: 'icons/provider/kimi.png' },
    { provider: 'siliconflow', label: 'SiliconFlow', icon: 'icons/provider/siliconflow.png' }
  ];
  var pendingQuotaKeyProvider = '';

  var SHELL_HOOK_LIGHT_AGENTS = {
    workbuddy: true,
    traeCode: true,
    traecode: true,
    qoder: true,
    copilotCli: true,
    copilotcli: true,
    gemini: true,
    cline: true,
    roo: true,
    opencode: true,
    aider: true
  };

  function agentLightEnabledOnPad(pad, agent) {
    if (!pad) return false;
    if (agent === 'claude') return !!pad.claudeStatusLightsEnabled;
    if (agent === 'cursor') return !!pad.cursorStatusLightsEnabled;
    if (agent === 'copilotCli' || agent === 'copilotcli') return !!pad.copilotStatusLightsEnabled;
    if (agent === 'copilotVscode' || agent === 'copilotvscode') return !!pad.copilotVscodeStatusLightsEnabled;
    if (agent === 'gemini') return !!pad.geminiStatusLightsEnabled;
    if (agent === 'minimax') return !!pad.minimaxStatusLightsEnabled;
    if (agent === 'workbuddy') return !!pad.workbuddyStatusLightsEnabled;
    if (agent === 'trae') return !!pad.traeStatusLightsEnabled;
    if (agent === 'traeCode' || agent === 'traecode') return !!pad.traeCodeStatusLightsEnabled;
    if (agent === 'windsurf') return !!pad.windsurfStatusLightsEnabled;
    if (agent === 'qoder') return !!pad.qoderStatusLightsEnabled;
    if (agent === 'cline') return !!pad.clineStatusLightsEnabled;
    if (agent === 'roo') return !!pad.rooStatusLightsEnabled;
    if (agent === 'opencode') return !!pad.opencodeStatusLightsEnabled;
    if (agent === 'aider') return !!pad.aiderStatusLightsEnabled;
    return !!pad.codexStatusLightsEnabled;
  }

  function setAgentLightFlagOnPad(pad, agent, enabled) {
    if (!pad) return;
    if (agent === 'claude') pad.claudeStatusLightsEnabled = !!enabled;
    else if (agent === 'cursor') pad.cursorStatusLightsEnabled = !!enabled;
    else if (agent === 'copilotCli' || agent === 'copilotcli') pad.copilotStatusLightsEnabled = !!enabled;
    else if (agent === 'copilotVscode' || agent === 'copilotvscode') pad.copilotVscodeStatusLightsEnabled = !!enabled;
    else if (agent === 'gemini') pad.geminiStatusLightsEnabled = !!enabled;
    else if (agent === 'minimax') pad.minimaxStatusLightsEnabled = !!enabled;
    else if (agent === 'workbuddy') pad.workbuddyStatusLightsEnabled = !!enabled;
    else if (agent === 'trae') pad.traeStatusLightsEnabled = !!enabled;
    else if (agent === 'traeCode' || agent === 'traecode') pad.traeCodeStatusLightsEnabled = !!enabled;
    else if (agent === 'windsurf') pad.windsurfStatusLightsEnabled = !!enabled;
    else if (agent === 'qoder') pad.qoderStatusLightsEnabled = !!enabled;
    else if (agent === 'cline') pad.clineStatusLightsEnabled = !!enabled;
    else if (agent === 'roo') pad.rooStatusLightsEnabled = !!enabled;
    else if (agent === 'opencode') pad.opencodeStatusLightsEnabled = !!enabled;
    else if (agent === 'aider') pad.aiderStatusLightsEnabled = !!enabled;
    else pad.codexStatusLightsEnabled = !!enabled;
  }

  function renderAgentLightRow(agent, label, pad) {
    var on = agentLightEnabledOnPad(pad, agent);
    var icon = agentLightIconSrc(agent);
    var fg = String(hubSelectedScopeKind() || '').toLowerCase() === String(agent || '').toLowerCase();
    var Conn = global.OneToneSoftPadConnect;
    var pill = Conn && Conn.renderPhasePillHtml
      ? Conn.renderPhasePillHtml('unknown')
      : '';
    return (
      '<div class="soft-pad-agent-light-row' + (fg ? ' is-fg' : '') +
      '" data-agent-light-row="' + esc(agent) + '"' +
      (fg ? ' data-connect-fg="1"' : '') + '>' +
      '<span class="soft-pad-agent-light-row__chip" data-agent="' + esc(agent) + '" data-status="idle">' +
      '<img src="' + esc(icon) + '" alt="" width="16" height="16" aria-hidden="true">' +
      '<i class="soft-pad-agent-light-row__dot" aria-hidden="true"></i>' +
      '</span>' +
      '<span class="soft-pad-agent-light-row__name">' + esc(label) +
      (fg ? (' <span class="soft-pad-connect-card__fg">' +
        esc(t('softPadConnectFgBadge', '当前前台')) + '</span>') : '') +
      '</span>' +
      '<span class="soft-pad-agent-light-row__phase" data-connect-phase-host="' + esc(agent) + '">' +
      pill + '</span>' +
      '<label class="soft-pad-agent-light-row__toggle">' +
      '<input type="checkbox" data-act="agent-light" data-agent="' + esc(agent) + '"' +
      (on ? ' checked' : '') +
      ' aria-label="' + esc(label) + '">' +
      '</label>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-agent-light-row__cta" ' +
      'data-act="agent-light-connect" data-agent="' + esc(agent) + '" hidden></button>' +
      '</div>'
    );
  }

  function sortConnectAgentsForUi(agents, fgKind) {
    fgKind = String(fgKind || '').toLowerCase();
    return (agents || []).slice().sort(function (a, b) {
      var al = String(a || '').toLowerCase();
      var bl = String(b || '').toLowerCase();
      var af = !!(fgKind && al === fgKind);
      var bf = !!(fgKind && bl === fgKind);
      if (af !== bf) return af ? -1 : 1;
      var ai = TOPBAR_LIGHT_CANDIDATES.findIndex(function (c) {
        return String(c.agent).toLowerCase() === al;
      });
      var bi = TOPBAR_LIGHT_CANDIDATES.findIndex(function (c) {
        return String(c.agent).toLowerCase() === bl;
      });
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
  }

  function labelForConnectAgent(agent) {
    var i;
    for (i = 0; i < TOPBAR_LIGHT_CANDIDATES.length; i++) {
      if (TOPBAR_LIGHT_CANDIDATES[i].agent === agent) return TOPBAR_LIGHT_CANDIDATES[i].label;
    }
    return agent;
  }

  function normConnectAgent(agent) {
    var Connect = global.OneToneSoftPadConnect;
    if (Connect && Connect.normKind) return Connect.normKind(agent);
    agent = String(agent || '').trim();
    if (agent === 'traecode') return 'traeCode';
    if (agent === 'copilotcli') return 'copilotCli';
    return agent;
  }

  /** MiniMax-style connect cards for enabled topbar agents. */
  function renderConnectStatusSectionHtml(pad, phaseByAgent, opts) {
    var Connect = global.OneToneSoftPadConnect;
    if (!Connect || !Connect.renderExpandCardHtml) return '';
    opts = opts || {};
    var mode = opts.mode || 'full';
    phaseByAgent = phaseByAgent || {};
    var fg = '';
    try { fg = String(hubSelectedScopeKind() || ''); } catch (_) {}
    var scopeAgent = normConnectAgent(opts.scopeAgent || fg);

    if (mode === 'scope') {
      if (!scopeAgent) return '';
      if (Connect.isSoloKind && Connect.isSoloKind(scopeAgent)) {
        return (
          '<div class="soft-pad-connect-section" data-connect-section="scope" data-connect-host="1" data-connect-mode="scope" data-connect-scope="' +
          esc(scopeAgent) + '">' +
          '<p class="codex-pad-mgr__label">' +
          esc(t('softPadConnectScopeTitle', '接入')) + '</p>' +
          '<p class="codex-pad-mgr__hint">' +
          esc(t('softPadConnectSoloLead',
            '此应用无需 Hook；忙闲灯跟本机窗口活跃度走。')) +
          '</p></div>'
        );
      }
      if (Connect.isQuotaKind && Connect.isQuotaKind(scopeAgent)) {
        return (
          '<div class="soft-pad-connect-section" data-connect-section="scope" data-connect-host="1" data-connect-mode="scope" data-connect-scope="' +
          esc(scopeAgent) + '">' +
          '<p class="codex-pad-mgr__label">' +
          esc(t('softPadConnectScopeTitle', '接入')) + '</p>' +
          renderQuotaKeyCardHtml() +
          '</div>'
        );
      }
      var scopeEntry = phaseByAgent[scopeAgent] || phaseByAgent[String(scopeAgent).toLowerCase()] || {};
      var scopePhase = scopeEntry.phase || 'unknown';
      // Scope card always expands — bare name+pill looked like a dead row.
      var scopeBody = Connect.renderExpandCardHtml({
        kind: scopeAgent,
        label: labelForConnectAgent(scopeAgent),
        phase: scopePhase,
        status: scopeEntry.status || null,
        isFg: true
      });
      return (
        '<div class="soft-pad-connect-section" data-connect-section="scope" data-connect-host="1" data-connect-mode="scope" data-connect-scope="' +
        esc(scopeAgent) + '">' +
        '<p class="codex-pad-mgr__label">' +
        esc(t('softPadConnectScopeTitle', '接入')) + '</p>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadConnectScopeLead',
          '接入只负责灯效事件；用量数字在下方「当前读数」看。')) +
        '</p>' +
        scopeBody +
        '</div>'
      );
    }

    var enabled = TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
      return agentLightEnabledOnPad(pad, c.agent);
    }).map(function (c) { return c.agent; });
    if (mode === 'fold') {
      if (!enabled.length) {
        return (
          '<p class="codex-pad-mgr__hint">' +
          esc(t('softPadConnectFoldEmpty', '开启 Agent 顶栏灯后，可在此查看跨应用接入状态。')) +
          '</p>'
        );
      }
      enabled = sortConnectAgentsForUi(enabled, fg);
      var foldCards = enabled.map(function (agent) {
        var entry = phaseByAgent[agent] || phaseByAgent[String(agent).toLowerCase()] || {};
        var phase = entry.phase || 'unknown';
        var isFg = fg && String(agent).toLowerCase() === String(fg).toLowerCase();
        var force = !!(entry.forceExpand || connectExpandOverride[agent]);
        if (!Connect.needsAction(phase) && !isFg && !force) {
          return (
            '<div class="soft-pad-connect-strip" data-connect-strip="' + esc(agent) +
            '" data-connect-phase="' + esc(phase) + '">' +
            '<span class="soft-pad-connect-strip__name">' + esc(labelForConnectAgent(agent)) + '</span>' +
            Connect.renderPhasePillHtml(phase) +
            '<button type="button" class="codex-micro-pad__btn soft-pad-connect-strip__btn" ' +
            'data-act="connect-expand" data-agent="' + esc(agent) + '">' +
            esc(t('softPadConnectExpand', '详情')) + '</button></div>'
          );
        }
        return Connect.renderExpandCardHtml({
          kind: agent,
          label: labelForConnectAgent(agent),
          phase: phase,
          status: entry.status || null,
          isFg: !!isFg
        });
      }).join('');
      return (
        '<div class="soft-pad-connect-section" data-connect-section="fold" data-connect-mode="fold">' +
        '<div class="soft-pad-connect-section__list" data-connect-list="1">' + foldCards + '</div>' +
        '</div>'
      );
    }

    if (!enabled.length) {
      return (
        '<div class="soft-pad-connect-section" data-connect-section="1">' +
        '<p class="codex-pad-mgr__label">' +
        esc(t('softPadConnectSectionTitle', '状态连接')) + '</p>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadConnectSectionEmpty',
          '在上方添加 Agent 灯后，可在此查看接入状态并一键安装 hooks。')) +
        '</p></div>'
      );
    }
    enabled = sortConnectAgentsForUi(enabled, fg);
    var cards = enabled.map(function (agent) {
      var entry = phaseByAgent[agent] || phaseByAgent[String(agent).toLowerCase()] || {};
      var phase = entry.phase || 'unknown';
      var isFg = fg && String(agent).toLowerCase() === String(fg).toLowerCase();
      var force = !!(entry.forceExpand || connectExpandOverride[agent]);
      if (!Connect.needsAction(phase) && !isFg && !force) {
        return (
          '<div class="soft-pad-connect-strip" data-connect-strip="' + esc(agent) +
          '" data-connect-phase="' + esc(phase) + '">' +
          '<span class="soft-pad-connect-strip__name">' + esc(labelForConnectAgent(agent)) + '</span>' +
          Connect.renderPhasePillHtml(phase) +
          '<button type="button" class="codex-micro-pad__btn soft-pad-connect-strip__btn" ' +
          'data-act="connect-expand" data-agent="' + esc(agent) + '">' +
          esc(t('softPadConnectExpand', '详情')) + '</button></div>'
        );
      }
      return Connect.renderExpandCardHtml({
        kind: agent,
        label: labelForConnectAgent(agent),
        phase: phase,
        status: entry.status || null,
        isFg: !!isFg
      });
    }).join('');
    return (
      '<div class="soft-pad-connect-section" data-connect-section="1">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadConnectSectionTitle', '状态连接')) + '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadConnectSectionLead',
        '像额度监视一样：看状态 → 未接入就确认安装 → 装完持续监视灯。')) +
      '</p>' +
      '<div class="soft-pad-connect-section__list" data-connect-list="1">' + cards + '</div>' +
      '</div>'
    );
  }

  function topbarHabitIdsOnPad(pad) {
    return Array.isArray(pad && pad.topbarHabitIds) ? pad.topbarHabitIds.map(String) : [];
  }

  /** Habit-slot MiniMax → real agent light (overlay has no habit chips). Once per mapping. */
  var minimaxTopbarMigrateDone = Object.create(null);
  function migrateMinimaxTopbarHabitToAgentLight(m, pad) {
    if (!m || !pad) return;
    var mid = m.id ? String(m.id) : '';
    if (mid && minimaxTopbarMigrateDone[mid]) return;
    var st = global.OneToneState && global.OneToneState.state;
    var maps = (st && st.config && st.config.mappings) || [];
    var byId = {};
    maps.forEach(function (row) {
      if (row && row.id) byId[String(row.id)] = row;
    });
    var habitIds = topbarHabitIdsOnPad(pad);
    var kept = [];
    var saw = false;
    habitIds.forEach(function (hid) {
      var row = byId[String(hid)];
      if (row && String(row.appTargetId || '') === 'minimax-chat') {
        saw = true;
        return;
      }
      kept.push(String(hid));
    });
    var isMinimaxMap = String(m.appTargetId || '') === 'minimax-chat';
    if (saw) {
      pad.topbarHabitIds = kept;
      pad.minimaxStatusLightsEnabled = true;
    } else if (isMinimaxMap && pad.enabled && !pad.minimaxStatusLightsEnabled) {
      // Soft Pad on for MiniMax scene → show Mn chip without extra click.
      pad.minimaxStatusLightsEnabled = true;
    }
    if (mid) minimaxTopbarMigrateDone[mid] = true;
  }

  function listSoftPadHabitCandidates() {
    var Hub = global.OneToneSoftPadHub;
    var schemes = Hub && Hub.listSoftPadSchemes ? Hub.listSoftPadSchemes() : [];
    return schemes.filter(function (e) {
      return e && e.mapping && e.mapping.id && e.padEnabled &&
        (e.kind === 'soft' || !TOPBAR_LIGHT_CANDIDATES.some(function (c) { return c.agent === e.kind; }));
    });
  }

  function habitTitleForMappingId(mappingId) {
    var Hub = global.OneToneSoftPadHub;
    var schemes = Hub && Hub.listSoftPadSchemes ? Hub.listSoftPadSchemes() : [];
    var i;
    for (i = 0; i < schemes.length; i++) {
      if (schemes[i].mapping && String(schemes[i].mapping.id) === String(mappingId)) {
        return schemes[i].title || t('softPadHubKindSoft', '我的应用');
      }
    }
    return t('softPadHubKindSoft', '我的应用');
  }

  function habitKindForMappingId(mappingId) {
    var Hub = global.OneToneSoftPadHub;
    var schemes = Hub && Hub.listSoftPadSchemes ? Hub.listSoftPadSchemes() : [];
    var i;
    for (i = 0; i < schemes.length; i++) {
      if (schemes[i].mapping && String(schemes[i].mapping.id) === String(mappingId)) {
        var kind = String(schemes[i].kind || '').toLowerCase();
        return kind && kind !== 'soft' ? kind : '';
      }
    }
    return '';
  }

  function habitIconForMappingId(mappingId) {
    var Hub = global.OneToneSoftPadHub;
    var schemes = Hub && Hub.listSoftPadSchemes ? Hub.listSoftPadSchemes() : [];
    var i;
    for (i = 0; i < schemes.length; i++) {
      if (schemes[i].mapping && String(schemes[i].mapping.id) === String(mappingId)) {
        if (Hub.iconForKind) {
          var src = Hub.iconForKind(schemes[i].kind === 'soft' ? '' : schemes[i].kind);
          if (src) return src;
        }
        var appId = schemes[i].appId || '';
        var P = global.OneToneAppTargetPresets;
        var preset = P && P.presetById ? P.presetById(appId) : null;
        if (preset && preset.icon) return String(preset.icon);
      }
    }
    return 'icons/app-target/codex.png';
  }

  function jumpToTopbarTarget(agent, habitId) {
    var Hub = global.OneToneSoftPadHub;
    if (!Hub) return;
    if (habitId && Hub.selectScheme) {
      Hub.selectScheme(String(habitId), {
        fromList: true,
        scopeId: 'soft',
        forceRemount: true,
        resetView: false
      });
      return;
    }
    if (agent && Hub.selectScope) {
      Hub.selectScope(String(agent), { fromUser: true, forceRemount: true, resetView: false });
    }
  }

  function persistTopbarHabitIds(m, pad) {
    pad.topbarHabitIds = topbarHabitIdsOnPad(pad);
    softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
    var p = global.OneToneConfigPersist;
    if (p && p.saveAsync) p.saveAsync();
    else if (p && p.save) p.save();
  }

  function renderTopbarLightActiveChip(agent, label) {
    var icon = agentLightIconSrc(agent);
    return (
      '<div class="soft-pad-topbar-light-active" data-agent-light-row="' + esc(agent) +
      '" data-topbar-jump-agent="' + esc(agent) + '" role="listitem">' +
      '<button type="button" class="soft-pad-topbar-light-active__jump" data-act="topbar-jump" data-agent="' +
      esc(agent) + '" title="' + esc(t('softPadTopbarJump', '跳转到此习惯')) + '">' +
      '<span class="soft-pad-agent-light-row__chip" data-agent="' + esc(agent) + '" data-status="idle">' +
      '<img src="' + esc(icon) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
      '<i class="soft-pad-agent-light-row__dot" aria-hidden="true"></i></span>' +
      '<span class="soft-pad-topbar-light-active__name">' + esc(label) + '</span></button>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-agent-light-row__cta" ' +
      'data-act="agent-light-connect" data-agent="' + esc(agent) + '" hidden></button>' +
      '<button type="button" class="soft-pad-topbar-light-active__remove" data-act="topbar-light-remove" ' +
      'data-agent="' + esc(agent) + '" aria-label="' + esc(t('softPadTopbarRemove', '移除')) + '">×</button>' +
      '</div>'
    );
  }

  function renderTopbarHabitActiveChip(mappingId) {
    var label = habitTitleForMappingId(mappingId);
    var icon = habitIconForMappingId(mappingId);
    return (
      '<div class="soft-pad-topbar-light-active" data-topbar-habit="' + esc(mappingId) +
      '" role="listitem">' +
      '<button type="button" class="soft-pad-topbar-light-active__jump" data-act="topbar-jump" data-habit-id="' +
      esc(mappingId) + '" title="' + esc(t('softPadTopbarJump', '跳转到此习惯')) + '">' +
      '<span class="soft-pad-agent-light-row__chip" data-status="idle">' +
      '<img src="' + esc(icon) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
      '<i class="soft-pad-agent-light-row__dot" aria-hidden="true"></i></span>' +
      '<span class="soft-pad-topbar-light-active__name">' + esc(label) + '</span></button>' +
      '<button type="button" class="soft-pad-topbar-light-active__remove" data-act="topbar-habit-remove" ' +
      'data-habit-id="' + esc(mappingId) + '" aria-label="' + esc(t('softPadTopbarRemove', '移除')) +
      '">×</button></div>'
    );
  }

  function renderTopbarQuotaActiveChip(spec, masked) {
    return (
      '<div class="soft-pad-topbar-light-active" data-topbar-quota="' + esc(spec.provider) +
      '" role="listitem">' +
      '<span class="soft-pad-topbar-light-active__jump">' +
      '<span class="soft-pad-agent-light-row__chip" data-status="idle">' +
      '<img src="' + esc(spec.icon) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
      '</span>' +
      '<span class="soft-pad-topbar-light-active__name">' + esc(spec.label) +
      (masked ? ' · ' + esc(masked) : '') + '</span></span>' +
      '<button type="button" class="soft-pad-topbar-light-active__remove" data-act="topbar-quota-remove" ' +
      'data-provider="' + esc(spec.provider) + '" aria-label="' + esc(t('softPadTopbarRemove', '移除')) +
      '">×</button></div>'
    );
  }

  function renderQuotaKeyCardHtml() {
    var spec = quotaCandidate(pendingQuotaKeyProvider);
    if (!spec) return '';
    return (
      '<div class="codex-pad-mgr__claude-act soft-pad-minimax-key" data-quota-key-card="1">' +
      '<p class="codex-pad-mgr__label">' + esc(spec.label) + ' API Key</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadQuotaKeyHint', '粘贴 API Key 后，迷你栏用量 pill 会列出该候补（不是登录 token）。')) +
      '</p>' +
      '<input class="soft-pad-minimax-key__input" data-quota-key-input type="password" autocomplete="off" spellcheck="false" placeholder="sk-…" />' +
      '<div class="codex-pad-mgr__claude-act-actions">' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="quota-key-save">' +
      esc(t('softPadQuotaKeySave', '保存并监视额度')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="quota-key-cancel">' +
      esc(t('softPadQuotaKeyCancel', '取消')) + '</button></div>' +
      '<p class="codex-pad-mgr__hint is-error" data-quota-key-status hidden></p></div>'
    );
  }

  function agentFromPresetAppId(appId) {
    appId = String(appId || '').trim();
    var Hub = global.OneToneSoftPadHub;
    if (Hub && Hub.kindForAppId) {
      var kind = String(Hub.kindForAppId(appId) || '').toLowerCase();
      if (TOPBAR_LIGHT_CANDIDATES.some(function (c) { return c.agent === kind; })) return kind;
    }
    if (appId === 'codex-chat') return 'codex';
    if (appId === 'claude-code') return 'claude';
    if (appId === 'cursor-chat') return 'cursor';
    if (appId === 'copilot-cli') return 'copilotCli';
    if (appId === 'gemini-cli') return 'gemini';
    if (appId === 'minimax-chat') return 'minimax';
    if (appId === 'workbuddy-chat') return 'workbuddy';
    if (appId === 'trae-work' || appId === 'trae-chat') return 'trae';
    if (appId === 'trae-code') return 'traeCode';
    if (appId === 'windsurf-chat') return 'windsurf';
    if (appId === 'qoder-chat') return 'qoder';
    if (appId === 'cline-chat') return 'cline';
    if (appId === 'opencode-chat') return 'opencode';
    if (appId === 'aider-chat') return 'aider';
    return '';
  }

  function topbarHabitPickerItems(pad) {
    var habitIds = topbarHabitIdsOnPad(pad);
    return listSoftPadHabitCandidates().filter(function (e) {
      return habitIds.indexOf(String(e.mapping.id)) < 0;
    }).map(function (e) {
      return {
        id: String(e.mapping.id),
        title: e.title || t('softPadHubKindSoft', '我的应用'),
        icon: habitIconForMappingId(e.mapping.id)
      };
    });
  }

  function findSoftPadSchemeForRunningIdentity(identity) {
    if (!identity) return null;
    var Hub = global.OneToneSoftPadHub;
    var schemes = Hub && Hub.listSoftPadSchemes ? Hub.listSoftPadSchemes() : [];
    var presetId = String(identity.matchedPresetAppId || identity.matched_preset_app_id || '').trim();
    var exe = String(identity.exeName || identity.exe_name || '').trim().toLowerCase();
    var i;
    for (i = 0; i < schemes.length; i++) {
      var e = schemes[i];
      if (!e || !e.mapping || !e.mapping.id || !e.padEnabled) continue;
      var appId = String(e.appId || e.mapping.appTargetId || '').trim();
      if (presetId && appId === presetId) return e;
      if (exe && appId && String(appId).toLowerCase() === exe) return e;
    }
    return null;
  }

  function appIdForAgent(agent) {
    agent = String(agent || '').trim();
    if (agent === 'codex') return 'codex-chat';
    if (agent === 'claude') return 'claude-code';
    if (agent === 'cursor') return 'cursor-chat';
    if (agent === 'copilotCli' || agent === 'copilotcli' || agent === 'copilot') return 'copilot-cli';
    if (agent === 'gemini') return 'gemini-cli';
    if (agent === 'minimax') return 'minimax-chat';
    if (agent === 'workbuddy') return 'workbuddy-chat';
    if (agent === 'trae') return 'trae-work';
    if (agent === 'traeCode' || agent === 'traecode') return 'trae-code';
    if (agent === 'qoder') return 'qoder-chat';
    if (agent === 'cline') return 'cline-chat';
    if (agent === 'opencode') return 'opencode-chat';
    if (agent === 'aider') return 'aider-chat';
    return '';
  }

  function topbarLightPickerItems(pad) {
    return TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
      return !agentLightEnabledOnPad(pad, c.agent);
    }).map(function (c) {
      return {
        id: appIdForAgent(c.agent),
        name: c.label,
        icon: agentLightIconSrc(c.agent),
        meta: t('softPadTopbarPickerPresetMeta', '加入顶栏监视')
      };
    }).filter(function (item) { return !!item.id; });
  }

  function openTopbarMonitorPicker(body, m, pad) {
    var Rules = global.OneToneAppBehaviorRules;
    if (!Rules || !Rules.openAppPicker) return;
    Rules.openAppPicker({
      mode: 'topbarMonitor',
      habitItems: topbarHabitPickerItems(pad),
      lightItems: topbarLightPickerItems(pad),
      quotaItems: TOPBAR_QUOTA_CANDIDATES.map(function (c) {
        return {
          id: c.provider,
          name: c.label,
          icon: c.icon,
          meta: t('softPadTopbarPickerQuotaMeta', '填 key 后进用量 pill')
        };
      }),
      onPick: function (pick) {
        applyTopbarMonitorPick(body, m, pad, pick || {});
      }
    });
  }

  function quotaCandidate(provider) {
    provider = String(provider || '').trim().toLowerCase();
    var i;
    for (i = 0; i < TOPBAR_QUOTA_CANDIDATES.length; i++) {
      if (TOPBAR_QUOTA_CANDIDATES[i].provider === provider) return TOPBAR_QUOTA_CANDIDATES[i];
    }
    return null;
  }

  function padQuotaInvoke(cmd, args) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return Promise.reject(new Error('no_ipc'));
    return Promise.resolve(invoke(cmd, args || {}));
  }

  function applyTopbarQuotaPick(body, m, pad, provider) {
    var spec = quotaCandidate(provider);
    if (!spec) return;
    padQuotaInvoke('cmd_soft_pad_provider_key_get', { provider: spec.provider }).then(function (res) {
      if (res && res.configured) {
        toast(t('softPadQuotaAlready', '{name} 已在用量 pill').replace('{name}', spec.label));
        pendingQuotaKeyProvider = '';
        patchTopbarLightsPanel(body, m, pad);
        return;
      }
      pendingQuotaKeyProvider = spec.provider;
      patchTopbarLightsPanel(body, m, pad);
    }).catch(function () {
      pendingQuotaKeyProvider = spec.provider;
      patchTopbarLightsPanel(body, m, pad);
    });
  }

  function applyTopbarMonitorPick(body, m, pad, pick) {
    if (!m || !pad || !pick) return;
    if (pick.type === 'quota' && pick.provider) {
      applyTopbarQuotaPick(body, m, pad, pick.provider);
      return;
    }
    if (pick.type === 'habit' && pick.habitId) {
      var ids = topbarHabitIdsOnPad(pad);
      if (ids.indexOf(String(pick.habitId)) < 0) ids.push(String(pick.habitId));
      pad.topbarHabitIds = ids;
      persistTopbarHabitIds(m, pad);
      patchTopbarLightsPanel(body, m, pad);
      return;
    }
    if (pick.type === 'preset' && pick.presetId) {
      var agent = agentFromPresetAppId(pick.presetId);
      if (agent) {
        setAgentLightEnabled(m, agent, true).then(function () {
          patchTopbarLightsPanel(body, m, pad);
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        });
        return;
      }
      var Hub = global.OneToneSoftPadHub;
      var schemes = Hub && Hub.listSoftPadSchemes ? Hub.listSoftPadSchemes() : [];
      var hit = schemes.find(function (e) {
        return e && e.mapping && String(e.appId || e.mapping.appTargetId || '') === String(pick.presetId);
      });
      if (hit && hit.mapping && hit.mapping.id) {
        applyTopbarMonitorPick(body, m, pad, { type: 'habit', habitId: String(hit.mapping.id) });
      }
      return;
    }
    if (pick.type === 'running' && pick.identity) {
      var presetId = String(pick.identity.matchedPresetAppId || pick.identity.matched_preset_app_id || '').trim();
      if (presetId) {
        applyTopbarMonitorPick(body, m, pad, { type: 'preset', presetId: presetId });
        return;
      }
      var scheme = findSoftPadSchemeForRunningIdentity(pick.identity);
      if (scheme && scheme.mapping && scheme.mapping.id) {
        applyTopbarMonitorPick(body, m, pad, { type: 'habit', habitId: String(scheme.mapping.id) });
      }
    }
  }

  function renderCrossTopbarMergedRow(c, phaseByAgent, fg) {
    var agent = c.agent;
    var entry = phaseByAgent[agent] || phaseByAgent[String(agent).toLowerCase()] || {};
    var phase = entry.phase || 'unknown';
    var Connect = global.OneToneSoftPadConnect;
    var pill = Connect && Connect.renderPhasePillHtml
      ? Connect.renderPhasePillHtml(phase)
      : '';
    var icon = agentLightIconSrc(agent);
    var isFg = fg && String(agent).toLowerCase() === String(fg).toLowerCase();
    var force = !!(entry.forceExpand || connectExpandOverride[agent]);
    var showExpandBtn = Connect && !Connect.needsAction(phase) && !isFg && !force;
    var expandBody = '';
    if (Connect && Connect.renderExpandCardHtml &&
      (Connect.needsAction(phase) || isFg || force)) {
      expandBody = Connect.renderExpandCardHtml({
        kind: agent,
        label: c.label,
        phase: phase,
        status: entry.status || null,
        isFg: !!isFg
      });
    }
    return (
      '<div class="soft-pad-cross-item" data-cross-agent-item="' + esc(agent) + '">' +
      '<div class="soft-pad-cross-row soft-pad-topbar-light-active" data-agent-light-row="' + esc(agent) +
      '" data-cross-agent="' + esc(agent) + '" role="listitem">' +
      '<button type="button" class="soft-pad-topbar-light-active__jump" data-act="topbar-jump" data-agent="' +
      esc(agent) + '" title="' + esc(t('softPadTopbarJump', '跳转到此习惯')) + '">' +
      '<span class="soft-pad-agent-light-row__chip" data-agent="' + esc(agent) + '" data-status="idle">' +
      '<img src="' + esc(icon) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
      '<i class="soft-pad-agent-light-row__dot" aria-hidden="true"></i></span>' +
      '<span class="soft-pad-topbar-light-active__name">' + esc(c.label) + '</span></button>' +
      '<span class="soft-pad-cross-row__phase" data-connect-phase-host="' + esc(agent) + '">' +
      pill + '</span>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-connect-strip__btn" data-act="connect-expand" data-agent="' +
      esc(agent) + '"' + (showExpandBtn ? '' : ' hidden') + '>' +
      esc(t('softPadConnectExpand', '详情')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-agent-light-row__cta" ' +
      'data-act="agent-light-connect" data-agent="' + esc(agent) + '" hidden></button>' +
      '<button type="button" class="soft-pad-topbar-light-active__remove" data-act="topbar-light-remove" ' +
      'data-agent="' + esc(agent) + '" aria-label="' + esc(t('softPadTopbarRemove', '移除')) + '">×</button>' +
      '</div>' +
      '<div class="soft-pad-cross-expand" data-cross-expand-host="' + esc(agent) + '"' +
      (expandBody ? '' : ' hidden') + '>' + expandBody + '</div>' +
      '</div>'
    );
  }

  function renderCrossTopbarMergedPanel(pad, phaseByAgent) {
    phaseByAgent = phaseByAgent || {};
    var fg = '';
    try { fg = String(hubSelectedScopeKind() || ''); } catch (_) {}
    var enabled = TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
      return agentLightEnabledOnPad(pad, c.agent);
    });
    var habitIds = topbarHabitIdsOnPad(pad);
    enabled = sortConnectAgentsForUi(enabled.map(function (c) { return c.agent; }), fg)
      .map(function (agent) {
        var i;
        for (i = 0; i < TOPBAR_LIGHT_CANDIDATES.length; i++) {
          if (TOPBAR_LIGHT_CANDIDATES[i].agent === agent) return TOPBAR_LIGHT_CANDIDATES[i];
        }
        return null;
      })
      .filter(Boolean);
    var rows = enabled.map(function (c) {
      return renderCrossTopbarMergedRow(c, phaseByAgent, fg);
    }).concat(habitIds.map(renderTopbarHabitActiveChip));
    var listHtml = rows.length
      ? rows.join('')
      : ('<p class="codex-pad-mgr__hint" data-topbar-lights-empty="1">' +
        esc(t('softPadTopbarEmpty', '尚未添加 — 顶栏不会显示圆点')) + '</p>');
    return (
      '<article class="soft-pad-topbar-lights-card soft-pad-cross-merged" data-cross-topbar-merged="1" data-topbar-lights-panel="1">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadTopbarMonitorTitle', '顶栏监视')) + '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadCrossMergedLead',
        '每行一个 Agent：图标与名称、接入状态、移除；需操作时自动展开。')) +
      '</p>' +
      '<div class="soft-pad-topbar-light-active-list soft-pad-cross-merged__list" role="list" aria-live="polite">' +
      listHtml + '</div>' +
      '<div class="soft-pad-topbar-add" data-topbar-add="1">' +
      '<button type="button" class="soft-pad-topbar-add__btn" data-act="topbar-add-open" ' +
      'aria-haspopup="dialog">' +
      esc(t('softPadTopbarAdd', '+ 添加')) + '</button></div>' +
      '<p class="codex-pad-mgr__hint soft-pad-agent-light-legend">' +
      esc(t('softPadAgentLightsLegend',
        '灰=空闲 · 蓝=忙 · 琥珀=等你 · 绿=完成 · 红=失败')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint is-error" data-topbar-lights-error hidden></p>' +
      '</article>'
    );
  }

  function paintCrossTopbarMergedConnect(root, pad, phaseByAgent) {
    if (!root || !pad) return;
    var panel = root.querySelector('[data-cross-topbar-merged]');
    if (!panel) return;
    var Connect = global.OneToneSoftPadConnect;
    var fg = '';
    try { fg = String(hubSelectedScopeKind() || ''); } catch (_) {}
    TOPBAR_LIGHT_CANDIDATES.forEach(function (c) {
      if (!agentLightEnabledOnPad(pad, c.agent)) return;
      var agent = c.agent;
      var entry = phaseByAgent[agent] || phaseByAgent[String(agent).toLowerCase()] || {};
      var phase = entry.phase || 'unknown';
      var isFg = fg && String(agent).toLowerCase() === String(fg).toLowerCase();
      var force = !!(entry.forceExpand || connectExpandOverride[agent]);
      paintConnectPhasePill(root, agent, phase);
      var item = root.querySelector('[data-cross-agent-item="' + agent + '"]');
      if (!item) return;
      var expandBtn = item.querySelector('[data-act="connect-expand"]');
      var expandHost = item.querySelector('[data-cross-expand-host="' + agent + '"]');
      var need = Connect && Connect.needsAction(phase);
      if (expandBtn) expandBtn.hidden = !(Connect && !need && !isFg && !force);
      if (expandHost && Connect && Connect.renderExpandCardHtml) {
        if (need || isFg || force) {
          expandHost.innerHTML = Connect.renderExpandCardHtml({
            kind: agent,
            label: c.label,
            phase: phase,
            status: entry.status || null,
            isFg: !!isFg
          });
          expandHost.hidden = false;
        } else {
          expandHost.innerHTML = '';
          expandHost.hidden = true;
        }
      }
    });
    bindConnectStatusCardEvents(root, null, pad);
  }

  function renderTopbarLightsPanel(pad, opts) {
    opts = opts || {};
    var enabled = TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
      return agentLightEnabledOnPad(pad, c.agent);
    });
    var habitIds = topbarHabitIdsOnPad(pad);
    var activeParts = enabled.map(function (c) {
      return renderTopbarLightActiveChip(c.agent, c.label);
    }).concat(habitIds.map(renderTopbarHabitActiveChip));
    var activeHtml = activeParts.length
      ? activeParts.join('')
      : ('<p class="codex-pad-mgr__hint" data-topbar-lights-empty="1">' +
        esc(t('softPadTopbarEmpty', '尚未添加 — 顶栏不会显示圆点')) + '</p>');
    var addHtml =
      '<div class="soft-pad-topbar-add" data-topbar-add="1">' +
      '<button type="button" class="soft-pad-topbar-add__btn" data-act="topbar-add-open" ' +
      'aria-haspopup="dialog">' +
      esc(t('softPadTopbarAdd', '+ 添加')) + '</button></div>';
    var connectHtml = (opts.noConnect || opts.rosterOnly)
      ? ''
      : ('<div data-connect-host="1">' + renderConnectStatusSectionHtml(pad, {}, { mode: 'full' }) + '</div>');
    var matrixHtml = (opts.compact || opts.rosterOnly)
      ? ''
      : ('<p class="codex-pad-mgr__hint soft-pad-agent-light-matrix">' +
        esc(t('softPadAgentLightsMatrix',
          '精度：Cursor/Claude/Codex 高（Hook/活动）；Trae Work 高（本地活跃度）；WorkBuddy/Trae Code/Qoder 高（仅 Hook，禁止进程假闪）；MiniMax 常亮额度灯（无运动）；Cline/OpenCode/Aider 中（仅 Hook）。')) +
        '</p>');
    var headHtml = opts.rosterOnly
      ? ''
      : ('<p class="codex-pad-mgr__label">' + esc(t('softPadTopbarMonitorTitle', '顶栏监视')) + '</p>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadTopbarMonitorLead',
          '跨应用显示忙闲；点条目可跳转习惯。只读观察，不是钉主控（主控始终 Auto）。切换「通用」习惯不会关掉 Soft Pad 键位。')) +
        '</p>');
    var quotaHtml = opts.rosterOnly
      ? ''
      : ('<p class="codex-pad-mgr__label" data-topbar-quota-lbl' +
        (pendingQuotaKeyProvider ? '' : ' hidden') + '>' +
        esc(t('softPadTopbarQuotaLbl', 'API 额度候补')) + '</p>' +
        '<div class="soft-pad-topbar-light-active-list" data-topbar-quota-list role="list"></div>' +
        renderQuotaKeyCardHtml());
    return (
      '<article class="soft-pad-topbar-lights-card' + (opts.rosterOnly ? ' is-roster-only' : '') +
      '" data-topbar-lights-panel="1"' +
      (opts.rosterOnly ? ' data-topbar-roster-only="1"' : '') + '>' +
      headHtml +
      '<div class="soft-pad-topbar-light-active-list" role="list" aria-live="polite">' + activeHtml + '</div>' +
      quotaHtml +
      connectHtml +
      addHtml +
      '<p class="codex-pad-mgr__hint soft-pad-agent-light-legend">' +
      esc(t('softPadAgentLightsLegend',
        '灰=空闲 · 蓝=忙 · 琥珀=等你 · 绿=完成 · 红=失败')) +
      '</p>' +
      matrixHtml +
      '<p class="codex-pad-mgr__hint is-error" data-topbar-lights-error hidden></p>' +
      '</article>'
    );
  }

  function renderTopbarPreviewStrip(pad, opts) {
    opts = opts || {};
    var focus = String(opts.focusAgent || hubSelectedScopeKind() || '').toLowerCase();
    var focusMap = '';
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && Hub.resolveSoftPadEntry) {
        var entry = Hub.resolveSoftPadEntry();
        if (entry && entry.mapping) focusMap = String(entry.mapping.id);
      }
    } catch (_) {}
    var chips = buildTopbarPreviewChipsHtml(pad, opts);
    var stripMode = opts.stripMode === 'full' ? 'full' : 'focus';
    return (
      '<div class="soft-pad-lights-topbar-preview" data-lights-topbar-preview="1" data-strip-mode="' +
      esc(stripMode) + '">' +
      '<p class="soft-pad-lights-topbar-preview__label">' +
      esc(t('softPadTopbarPreviewLbl', '顶栏预览')) + '</p>' +
      '<div class="soft-pad-agent-bar soft-pad-agent-bar--preview" role="presentation">' +
      (chips || ('<span class="soft-pad-lights-topbar-preview__empty">' +
        esc(t('softPadTopbarPreviewEmpty', '未添加')) + '</span>')) +
      '</div></div>'
    );
  }

  function paintTopbarPreviewChipStatus(root, agent, status) {
    if (!agent) return;
    var hosts = [];
    if (root) hosts.push(root);
    try {
      var Hub = global.OneToneSoftPadHub;
      var ph = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
      if (ph && hosts.indexOf(ph) < 0) hosts.push(ph);
    } catch (_) {}
    var sel =
      '.soft-pad-agent-bar__chip[data-agent="' + agent + '"],' +
      '.soft-pad-agent-bar__chip[data-agent="' + String(agent).toLowerCase() + '"]';
    hosts.forEach(function (h) {
      if (!h || !h.querySelectorAll) return;
      h.querySelectorAll(sel).forEach(function (chip) {
        chip.setAttribute('data-status', status || 'idle');
      });
    });
  }

  /** Soft Pad「更多」：横向标签 + 规整卡片（主题 segmented）。 */
  function renderPadPurposeCard(m, pad) {
    var cur = (pad && String(pad.purpose || '').toLowerCase() === 'sessions')
      ? 'sessions'
      : 'shortcuts';
    var mid = String((m && m.id) || '');
    var kind = '';
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.kindForAppId === 'function') {
        kind = String(Hub.kindForAppId(m && m.appTargetId) || '').toLowerCase();
      }
    } catch (_) {}
    if (!kind && m) {
      var tid = String(m.appTargetId || m.agentProviderId || '').toLowerCase();
      if (tid.indexOf('claude') >= 0) kind = 'claude';
      else if (tid.indexOf('cursor') >= 0) kind = 'cursor';
      else if (tid.indexOf('codex') >= 0 || tid.indexOf('chatgpt') >= 0) kind = 'codex';
    }
    var sessionsAllowed = kind === 'claude' || kind === 'codex';
    function btn(id, label) {
      var on = cur === id;
      return (
        '<button type="button" class="pref-segmented-btn' + (on ? ' is-active' : '') +
        '" data-pad-purpose="' + id + '" data-mapping-id="' + esc(mid) + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(label) + '</button>'
      );
    }
    var explain = kind === 'claude'
      ? t('softPadPurposeExplainClaude',
        '动作键（默认）：AG 保持快捷动作。启用会话导航后，推荐 AG00–03 为会话槽（可混排）；角点为子代理装饰。顶栏灯只控显示。ACT/NAV/ENC 不变。')
      : kind === 'codex'
        ? t('softPadPurposeExplainCodex',
          '动作键（默认）：AG 保持快捷动作。启用线程导航后，推荐 AG00–01 为实验槽（可混排）。ACT/NAV/ENC 不变。')
        : t('softPadPurposeExplainCursor',
          'Cursor 的 AG 键只能做快捷动作（发命令 / 快捷键），不能切成会话槽。状态灯只显示忙闲。');
    var sessionsLbl = kind === 'codex'
      ? t('softPadPurposeSessionsCodex', '线程槽（实验）')
      : t('softPadPurposeSessions', '会话导航');
    var navActive = '';
    if (cur === 'sessions') {
      var activeSlots = (pad && pad.keys || []).filter(function (k) {
        return k.enabled !== false &&
          String(k.keyRole || '').toLowerCase() === 'agentlane';
      }).map(function (k) { return String(k.microKeyId || ''); }).filter(Boolean);
      if (activeSlots.length) {
        navActive = '<p class="codex-pad-mgr__hint soft-pad-nav-active-hint">' +
          esc(t('softPadNavActiveHint', '当前导航键：{slots}')
            .replace('{slots}', activeSlots.join(', '))) +
          '</p>';
      }
    }
    var control = sessionsAllowed
      ? (
        '<div class="pref-segmented is-wide" role="group" aria-label="' +
        esc(t('softPadPurposeAria', 'AG 键做什么')) + '">' +
        btn('shortcuts', t('softPadPurposeShortcuts', '动作键')) +
        btn('sessions', sessionsLbl) +
        '</div>'
      )
      : (
        '<p class="soft-pad-purpose-locked" data-purpose-locked="1">' +
        '<span class="soft-pad-purpose-locked__badge">' +
        esc(t('softPadPurposeShortcuts', '动作键')) + '</span>' +
        '<span class="soft-pad-purpose-locked__hint">' +
        esc(t('softPadPurposeCursorLocked', '此应用无其它模式可选')) +
        '</span></p>'
      );
    return (
      '<article class="soft-pad-more-card soft-pad-purpose-card" data-soft-pad-purpose-card="1">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadPurposeLbl', 'AG 键做什么')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint soft-pad-purpose-explain">' +
      esc(explain) +
      '</p>' +
      navActive +
      control +
      '</article>'
    );
  }

  function recommendedNavigationSlots(kind) {
    if (kind === 'claude') return ['AG00', 'AG01', 'AG02', 'AG03'];
    if (kind === 'codex') return ['AG00', 'AG01'];
    return [];
  }

  function navigationSlotConflicts(pad, slots) {
    var conflicts = [];
    (slots || []).forEach(function (slot) {
      var route = (pad.keys || []).find(function (k) {
        return k.enabled !== false && String(k.microKeyId || '') === slot;
      });
      if (!route) return;
      var sid = String(route.slotId || '').trim();
      if (!sid || sid === 'status') return;
      conflicts.push(slot);
    });
    return conflicts;
  }

  function applyNavigationKeyRolesOnPad(pad, slots) {
    var set = {};
    (slots || []).forEach(function (s) { set[s] = true; });
    (pad.keys || []).forEach(function (k) {
      var mid = String(k.microKeyId || '');
      if (!/^AG\d+$/i.test(mid)) return;
      if (set[mid]) {
        k.keyRole = 'agentLane';
        k.autoAssignable = true;
      } else {
        k.keyRole = 'action';
        k.autoAssignable = false;
      }
    });
  }

  function navigationSlotsOnPad(pad) {
    return (pad && pad.keys || []).filter(function (k) {
      return k.enabled !== false &&
        String(k.keyRole || '').toLowerCase() === 'agentlane';
    }).map(function (k) { return String(k.microKeyId || ''); }).filter(Boolean);
  }

  function persistPadPurposeAndSlots(mappingId, purpose, slots) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!invoke) return Promise.resolve();
    mappingId = String(mappingId || '');
    purpose = purpose === 'sessions' ? 'sessions' : 'shortcuts';
    slots = slots || [];
    if (purpose === 'shortcuts') {
      return Promise.resolve(invoke('cmd_soft_pad_set_navigation_slots', {
        mappingId: mappingId,
        slots: []
      })).then(function () {
        return invoke('cmd_soft_pad_set_purpose', { mappingId: mappingId, purpose: 'shortcuts' });
      });
    }
    return Promise.resolve(invoke('cmd_soft_pad_set_purpose', {
      mappingId: mappingId,
      purpose: 'sessions'
    })).then(function () {
      // Backend seeds recommended slots when empty; skip empty follow-up (would clear them).
      if (!slots.length) return null;
      return invoke('cmd_soft_pad_set_navigation_slots', {
        mappingId: mappingId,
        slots: slots
      });
    });
  }

  function applyPadPurposeFromUi(body, m, pad, purpose) {
    purpose = String(purpose || '').toLowerCase() === 'sessions' ? 'sessions' : 'shortcuts';
    if (!m || !pad) return;
    var tid = String(m.appTargetId || m.agentProviderId || '').toLowerCase();
    var kind = tid.indexOf('claude') >= 0 ? 'claude'
      : tid.indexOf('cursor') >= 0 ? 'cursor'
      : (tid.indexOf('codex') >= 0 || tid.indexOf('chatgpt') >= 0) ? 'codex' : '';
    if (purpose === 'sessions' && kind !== 'claude' && kind !== 'codex') return;
    if (String(pad.purpose || 'shortcuts') === purpose) {
      if (purpose !== 'sessions' || navigationSlotsOnPad(pad).length) return;
    }
    var mappingId = String(m.id || '');
    var recommended = recommendedNavigationSlots(kind);
    if (purpose === 'sessions') {
      var conflicts = navigationSlotConflicts(pad, recommended);
      var msg = t('softPadNavEnableConfirm',
        '启用导航后，将把 {slots} 设为物理会话槽（其余 AG 保持动作键）。')
        .replace('{slots}', recommended.join(', '));
      if (conflicts.length) {
        msg += ' ' + t('softPadNavConflictWarn',
          '以下键将不再执行原快捷动作：{keys}。')
          .replace('{keys}', conflicts.join(', '));
      }
      if (typeof global.confirm === 'function' && !global.confirm(msg)) return;
    }
    pad.purpose = purpose;
    if (purpose === 'sessions') {
      applyNavigationKeyRolesOnPad(pad, recommended);
    } else {
      applyNavigationKeyRolesOnPad(pad, []);
    }
    if (body) {
      body.querySelectorAll('[data-pad-purpose]').forEach(function (b) {
        var on = b.getAttribute('data-pad-purpose') === purpose;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      var card = body.querySelector('.soft-pad-numpad-card');
      if (card) card.innerHTML = renderNumpadMapHtml(pad);
    }
    var Hub = global.OneToneSoftPadHub;
    persistPadPurposeAndSlots(mappingId, purpose, purpose === 'sessions' ? recommended : [])
      .then(function () {
        try {
          if (Hub && typeof Hub.schedulePreviewPaint === 'function') {
            Hub.schedulePreviewPaint(Hub.resolveSoftPadEntry && Hub.resolveSoftPadEntry());
          }
          if (body && body.getAttribute('data-style-subtab') === 'pad') {
            paintSoftPadPadModePreview(document.getElementById('softPadPreviewHost'), m, 'purpose');
          }
        } catch (_) {}
      })
      .catch(function (err) {
        toast(t('softPadPurposePersistFail', '会话导航保存失败：{err}')
          .replace('{err}', String((err && err.message) || err || 'unknown')));
      });
  }

  function renderSoftPadMoreBody(m, pad) {
    return (
      '<div class="soft-pad-more" data-more-tab="status">' +
      renderPadPurposeCard(m, pad) +
      '<p class="codex-pad-mgr__hint soft-pad-topbar-more-hint">' +
      esc(t('softPadTopbarMoreHint', '顶栏监视（增删 Agent）请在「状态灯」页配置。')) +
      '</p></div>'
    );
  }

  function bindSoftPadMoreTabs(root) {
    // Tabs removed; keep no-op so callers stay safe.
    void root;
  }

  function paintAgentLightRowStatus(root, agent, status, connectNeed, connectLabel) {
    if (!root) return;
    var row = root.querySelector('[data-agent-light-row="' + agent + '"]');
    if (!row) return;
    var chip = row.querySelector('.soft-pad-agent-light-row__chip');
    if (chip) chip.setAttribute('data-status', status || 'idle');
    var cta = row.querySelector('[data-act="agent-light-connect"]');
    var input = row.querySelector('[data-act="agent-light"]');
    var on = !!(input && input.checked);
    if (cta) {
      if (on && connectNeed) {
        cta.hidden = false;
        cta.textContent = connectLabel || t('softPadAgentLightConnect', '连接');
        cta.disabled = false;
      } else {
        cta.hidden = true;
      }
    }
  }

  function paintConnectPhasePill(root, agent, phase) {
    if (!root) return;
    var Conn = global.OneToneSoftPadConnect;
    if (!Conn || !Conn.renderPhasePillHtml) return;
    var host = root.querySelector('[data-connect-phase-host="' + agent + '"]');
    if (!host) return;
    host.innerHTML = Conn.renderPhasePillHtml(phase || 'unknown');
  }

  function paintConnectStatusSection(root, pad, phaseByAgent) {
    if (!root) return;
    if (root.querySelector('[data-cross-topbar-merged]')) {
      paintCrossTopbarMergedConnect(root, pad, phaseByAgent || {});
      return;
    }
    var host = root.querySelector('[data-connect-host]');
    if (!host) return;
    var mode = host.getAttribute('data-connect-mode') || '';
    var scope = host.getAttribute('data-connect-scope') || '';
    if (mode === 'scope') {
      // Scope section is the host itself (embedded in readiness).
      host.outerHTML = renderConnectStatusSectionHtml(pad, phaseByAgent || {}, {
        mode: 'scope',
        scopeAgent: scope
      });
    } else {
      host.innerHTML = renderConnectStatusSectionHtml(pad, phaseByAgent || {});
    }
    bindConnectStatusCardEvents(root, null, pad);
  }

  var agentLightsHookCache = {
    codex: null,
    claude: null,
    cursor: null,
    workbuddy: null,
    traeCode: null,
    qoder: null,
    gemini: null,
    copilotCli: null,
    cline: null,
    roo: null,
    opencode: null,
    aider: null
  };
  var connectExpandOverride = Object.create(null);

  function shellHookConnectNeeded(kind, st) {
    var Conn = global.OneToneSoftPadConnect;
    if (Conn && Conn.phaseOf) {
      var ph = Conn.phaseOf(kind, st, {});
      return Conn.needsAction(ph);
    }
    st = st || {};
    if (st.probeExists === false) return true;
    if (st.onetoneConfigured) return false;
    if (st.settingsParseOk === false && st.settingsExists) return true;
    return !st.onetoneConfigured;
  }

  function refreshAgentLightsPickerState(root, m, pad, opts) {
    opts = opts || {};
    if (!root) return Promise.resolve();
    var panel = root.querySelector('[data-topbar-lights-panel]') ||
      root.querySelector('[data-cross-topbar-merged]') ||
      root.querySelector('[data-agent-lights-picker]') ||
      (root.getAttribute && root.getAttribute('data-topbar-lights-panel') ? root : null);
    var scopeEl = panel || root;
    var empty = scopeEl.querySelector('[data-topbar-lights-empty]') ||
      scopeEl.querySelector('[data-agent-lights-empty]');
    if (empty) {
      var any = TOPBAR_LIGHT_CANDIDATES.some(function (spec) {
        return agentLightEnabledOnPad(pad, spec.agent);
      });
      empty.hidden = !!any;
    }
    var Conn = global.OneToneSoftPadConnect;

    function attnLightFor(attn, kind) {
      kind = String(kind || '').toLowerCase();
      var rows = (attn && (attn.rows || attn.agents)) || [];
      var i;
      for (i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r) continue;
        var a = String(r.agent || r.kind || '').toLowerCase();
        if (a === kind) return String(r.state || r.status || 'idle').toLowerCase();
      }
      return 'idle';
    }

    function stateFor(attn, kind) {
      if (!agentLightEnabledOnPad(pad, kind)) return 'idle';
      var st = attnLightFor(attn, kind);
      if (st === 'working') return 'running';
      if (st === 'needs_input' || st === 'needsinput') return 'needs_input';
      if (st === 'complete' || st === 'done') return 'done';
      if (st === 'error' || st === 'failed') return 'failed';
      return st || 'idle';
    }

    function buildPhaseMap(attn) {
      var map = {};
      TOPBAR_LIGHT_CANDIDATES.forEach(function (spec) {
        var agent = spec.agent;
        var st = agentLightsHookCache[agent] ||
          agentLightsHookCache[String(agent).toLowerCase()] || null;
        var light = stateFor(attn, agent);
        var phase = 'unknown';
        if (Conn && Conn.phaseOf) {
          phase = Conn.phaseOf(agent, st, {
            lightStatus: light,
            hasRecentEvent: light && light !== 'idle'
          });
        }
        if (connectExpandOverride[agent]) {
          // Force expand card even when watching.
          map[agent] = { phase: phase, status: st, forceExpand: true };
        } else {
          map[agent] = { phase: phase, status: st };
        }
      });
      return map;
    }

    function paintFromCache(attn) {
      attn = attn || {};
      var phaseMap = buildPhaseMap(attn);

      function paintOne(agent, needLabel) {
        var entry = phaseMap[agent] || {};
        var phase = entry.phase || 'unknown';
        var need = Conn ? Conn.needsAction(phase) : false;
        var label = needLabel || t('softPadConnectInstallWatch', '确认接入并监视状态');
        if (String(agent).toLowerCase() === 'cursor') {
          label = t('softPadCursorConnect', '复制 Cursor Hook 配置');
        }
        paintAgentLightRowStatus(root, agent, stateFor(attn, agent), need, label);
        paintTopbarPreviewChipStatus(root, agent, stateFor(attn, agent));
        paintConnectPhasePill(root, agent, phase);
        patchStatusLightsConnectRow(root, agent, need, label);
      }

      paintOne('codex');
      paintOne('claude', t('softPadClaudeConnect', '连接 Claude（写入 hooks）'));
      paintOne('cursor', t('softPadCursorConnect', '复制 Cursor Hook 配置'));
      ['workbuddy', 'traeCode', 'qoder', 'gemini', 'copilotCli', 'cline', 'roo', 'opencode', 'aider']
        .forEach(function (kind) {
          paintOne(kind, t('softPadShellHookInstall', '接入'));
        });
      paintOne('trae');
      paintOne('minimax');
      paintOne('windsurf');

      Object.keys(connectExpandOverride).forEach(function (k) {
        if (connectExpandOverride[k] && phaseMap[k]) phaseMap[k].forceExpand = true;
      });
      paintConnectStatusSection(root, pad, phaseMap);
    }

    return padInvoke('cmd_agent_attention_snapshot', {}).catch(function () { return null; })
      .then(function (attn) {
        paintFromCache(attn);
        if (!opts.hooks) return { attn: attn };
        var fg = hubSelectedScopeKind();
        var enabled = TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
          return agentLightEnabledOnPad(pad, c.agent);
        }).map(function (c) { return c.agent; });
        // Always refresh FG + enabled hook agents (cap to avoid storm).
        var want = {};
        enabled.forEach(function (a) { want[a] = true; });
        if (fg) want[fg] = true;
        ['codex', 'claude', 'cursor'].forEach(function (a) {
          if (want[a] || !enabled.length) want[a] = true;
        });

        var tasks = [];
        var keys = [];
        Object.keys(want).forEach(function (agent) {
          if (Conn && Conn.isSoloKind && Conn.isSoloKind(agent)) return;
          if (Conn && Conn.isQuotaKind && Conn.isQuotaKind(agent)) return;
          if (Conn && Conn.fetchStatus) {
            keys.push(agent);
            tasks.push(Conn.fetchStatus(agent).catch(function () { return null; }));
          }
        });
        if (!tasks.length) return { attn: attn };
        return Promise.all(tasks).then(function (results) {
          results.forEach(function (st, i) {
            if (st && keys[i]) agentLightsHookCache[keys[i]] = st;
          });
          paintFromCache(attn);
          return { attn: attn };
        });
      });
  }

  function bindConnectStatusCardEvents(root, m, pad) {
    if (!root) return;
    var Conn = global.OneToneSoftPadConnect;
    function refresh() {
      return refreshAgentLightsPickerState(root, m, pad, { hooks: true });
    }
    root.querySelectorAll('[data-act="connect-expand"]').forEach(function (btn) {
      if (btn.__connectBound) return;
      btn.__connectBound = true;
      btn.addEventListener('click', function () {
        var agent = btn.getAttribute('data-agent') || '';
        if (!agent) return;
        connectExpandOverride[agent] = true;
        refresh();
      });
    });
    root.querySelectorAll('[data-act="connect-refresh"]').forEach(function (btn) {
      if (btn.__connectBound) return;
      btn.__connectBound = true;
      btn.addEventListener('click', function () {
        var agent = btn.getAttribute('data-agent') || '';
        btn.disabled = true;
        var p = Conn && Conn.fetchStatus
          ? Conn.fetchStatus(agent).then(function (st) {
            if (st) agentLightsHookCache[agent] = st;
          })
          : Promise.resolve();
        p.finally(function () {
          btn.disabled = false;
          refresh();
        });
      });
    });
    root.querySelectorAll('[data-act="connect-install"]').forEach(function (btn) {
      if (btn.__connectBound) return;
      btn.__connectBound = true;
      btn.addEventListener('click', function () {
        var agent = btn.getAttribute('data-agent') || '';
        if (!agent) return;
        if (!window.confirm(t(
          'softPadConnectInstallConfirm',
          '将把 OneTone hooks 写入该 Agent 配置（会先备份）。继续？'
        ))) return;
        btn.disabled = true;
        btn.textContent = t('softPadConnecting', '连接中…');
        var run = Conn && Conn.installKind
          ? Conn.installKind(agent)
          : Promise.reject(new Error('no_connect'));
        Promise.resolve(run).then(function (res) {
          if (res && res.ok === false && res.manual) {
            toast(t('softPadConnectManualOnly', '请使用复制配置完成接入'));
            return;
          }
          toast(t('softPadConnectInstalled', '已接入 — 回 Agent 发一条消息以点亮状态'));
          return Conn.fetchStatus(agent).then(function (st) {
            if (st) agentLightsHookCache[agent] = st;
          });
        }).catch(function (err) {
          toast(String(err && err.message || err || 'install_failed'));
        }).finally(function () {
          btn.disabled = false;
          refresh();
        });
      });
    });
    root.querySelectorAll('[data-act="connect-copy"]').forEach(function (btn) {
      if (btn.__connectBound) return;
      btn.__connectBound = true;
      btn.addEventListener('click', function () {
        var agent = btn.getAttribute('data-agent') || 'cursor';
        btn.disabled = true;
        var cached = agentLightsHookCache[agent];
        function runCopy(st) {
          btn.disabled = false;
          var text = (st && (st.mergePreview || st.merge_preview || st.previewCopy || st.draftJson || '')) || '';
          if (!text) {
            toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
            return;
          }
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(text).then(function () {
                toast(t('cursorHookCopied', '已复制 Cursor Hook 合并预览（不会自动写入）'));
              }).catch(function () {
                toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
              });
            } else {
              toast(t('cursorHookCopied', '已复制 Cursor Hook 合并预览（不会自动写入）'));
            }
          } catch (_) {
            toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
          }
        }
        if (cached && (cached.mergePreview || cached.merge_preview)) {
          runCopy(cached);
          return;
        }
        padInvoke('cmd_cursor_hook_setup_status', {}).then(function (st) {
          if (st) agentLightsHookCache.cursor = st;
          runCopy(st);
        }).catch(function () {
          btn.disabled = false;
          toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
        });
      });
    });
    root.querySelectorAll('[data-act="connect-uninstall"]').forEach(function (btn) {
      if (btn.__connectBound) return;
      btn.__connectBound = true;
      btn.addEventListener('click', function () {
        var agent = btn.getAttribute('data-agent') || '';
        if (!agent) return;
        if (!window.confirm(t('softPadConnectUninstallConfirm', '撤回 OneTone 写入的 hooks？'))) return;
        btn.disabled = true;
        var run = Conn && Conn.uninstallKind
          ? Conn.uninstallKind(agent)
          : Promise.resolve({ ok: false });
        Promise.resolve(run).then(function (res) {
          if (res && res.ok === false && res.reason === 'codex_manual') {
            toast(t('softPadConnectCodexUninstallManual', 'Codex 请手动编辑 hooks.json 移除 OneTone 段'));
            return;
          }
          toast(t('softPadConnectUninstalled', '已撤回'));
          return Conn.fetchStatus(agent).then(function (st) {
            if (st) agentLightsHookCache[agent] = st;
          });
        }).catch(function (err) {
          toast(String(err && err.message || err || 'uninstall_failed'));
        }).finally(function () {
          btn.disabled = false;
          refresh();
        });
      });
    });
  }

  function setAgentLightEnabled(m, agent, enabled) {
    var pad = m && m.codexMicroPad;
    if (!pad || !m.id) return Promise.resolve(null);
    setAgentLightFlagOnPad(pad, agent, enabled);
    var body = activePadManagerBody() || document;
    var picker = body.querySelector('[data-topbar-lights-panel]') ||
      body.querySelector('[data-agent-lights-picker]');
    // Optimistic empty-hint paint — do not wait on disk/hook IPC.
    if (picker) {
      var empty = picker.querySelector('[data-topbar-lights-empty]') ||
        picker.querySelector('[data-agent-lights-empty]');
      if (empty) {
        var any = TOPBAR_LIGHT_CANDIDATES.some(function (spec) {
          return agentLightEnabledOnPad(pad, spec.agent);
        });
        empty.hidden = !!any;
      }
    }
    return padInvoke('cmd_soft_pad_agent_lights_set', {
      mappingId: String(m.id),
      agent: String(agent || 'codex'),
      enabled: !!enabled
    }).then(function (res) {
      var errEl = picker && (picker.querySelector('[data-topbar-lights-error]') ||
        picker.querySelector('[data-agent-lights-error]'));
      if (res && res.error) {
        var msg = res.error === 'port_in_use'
          ? t('codexMicroPadLoopbackPortInUse', '本机 8796 已被占用')
          : (res.error === 'bind_failed'
            ? t('codexMicroPadLoopbackBindFailed', '无法绑定本机状态通道')
            : String(res.error));
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = msg;
        }
        toast(msg);
      } else if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      // Soft refresh dots only — never chain Cursor/Claude hook setup here.
      var refreshRoot = picker || body;
      return refreshAgentLightsPickerState(refreshRoot, m, pad).then(function () {
        var Hub = global.OneToneSoftPadHub;
        var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
        syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts());
        return res;
      });
    }).catch(function () {
      toast(t('codexMicroPadStatusLightsFail', '状态灯开关失败'));
      return null;
    });
  }

  var cursorHookSetupLast = null;

  function applyCursorHookSetupDom(st) {
    var root = document.getElementById('codexCursorHookPad');
    if (!root || !st) return;
    cursorHookSetupLast = st;
    var scopes = Array.isArray(st.configuredScopes || st.configured_scopes)
      ? (st.configuredScopes || st.configured_scopes)
      : [];
    var phase = scopes.length
      ? 'configured_waiting'
      : 'not_configured';
    if (!(st.nodeOk || st.node_ok)) phase = 'error';
    root.setAttribute('data-phase', phase);
    var nodeEl = root.querySelector('[data-cursor-node]');
    if (nodeEl) {
      nodeEl.textContent = (st.nodeOk || st.node_ok)
        ? t('cursorHookNodeOk', '可用')
        : t('cursorHookNodeMissing', st.nodeReason || st.node_reason || 'runtime_not_found');
    }
    var probeEl = root.querySelector('[data-cursor-probe]');
    if (probeEl) {
      probeEl.textContent = (st.probeExists || st.probe_exists)
        ? t('cursorHookProbeOk', '已找到')
        : t('cursorHookProbeMissing', '未找到');
    }
    var scopeEl = root.querySelector('[data-cursor-scope]');
    if (scopeEl) {
      var eff = String(st.effectiveScope || st.effective_scope || '').trim();
      scopeEl.textContent = scopes.length
        ? (eff || scopes.join('+'))
        : t('cursorHookScopeNone', '未配置');
    }
    var tokenEl = root.querySelector('[data-cursor-token]');
    if (tokenEl) {
      tokenEl.textContent = (st.tokenConfigured || st.token_configured)
        ? t('cursorHookTokenOk', '已就绪')
        : t('cursorHookTokenMissing', '未生成');
    }
    var confEl = root.querySelector('[data-cursor-conflicts]');
    if (confEl) {
      var conflicts = Array.isArray(st.conflicts) ? st.conflicts : [];
      confEl.textContent = conflicts.length
        ? conflicts.slice(0, 2).join(' · ')
        : t('cursorHookConflictsNone', '无');
    }
    var pre = root.querySelector('[data-cursor-merge-preview]');
    if (pre) {
      pre.textContent = String(st.mergePreview || st.merge_preview || '');
      pre.hidden = !pre.textContent;
    }
  }

  function refreshCursorHookSetup() {
    return padInvoke('cmd_cursor_hook_setup_status', { workspace: null })
      .then(function (st) {
        applyCursorHookSetupDom(st || {});
        return st;
      })
      .catch(function () {
        return null;
      });
  }

  function copyCursorHookPreview() {
    return refreshCursorHookSetup().then(function (st) {
      var text = (st && (st.mergePreview || st.merge_preview)) || '';
      if (!text) {
        toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
        return;
      }
      var done = function () {
        toast(t('cursorHookCopied', '已复制 Cursor Hook 合并预览（不会自动写入）'));
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(done).catch(function () {
          toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
        });
      }
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
      }
    });
  }

  function applyClaudeHookSetupDom(st) {
    var root = document.getElementById('codexClaudeActivityPad');
    if (!root || !st) return;
    claudeHookSetupLast = st;
    var phase = String(st.installPhase || st.install_phase || 'not_installed');
    root.setAttribute('data-phase', phase);
    var hooksEl = root.querySelector('[data-setup-hooks]');
    if (hooksEl) hooksEl.textContent = claudeHookPhaseLabel(phase);
    var settingsEl = root.querySelector('[data-setup-settings]');
    if (settingsEl) {
      settingsEl.textContent = String(st.settingsPath || st.settings_path || '—');
    }
    var probeEl = root.querySelector('[data-setup-probe]');
    if (probeEl) {
      var pe = !!(st.probeExists || st.probe_exists);
      var cpe = st.configuredProbeExists != null
        ? !!(st.configuredProbeExists || st.configured_probe_exists)
        : true;
      if (!pe) probeEl.textContent = t('claudeActProbeMissing', '未找到');
      else if (st.onetoneConfigured && !cpe) {
        probeEl.textContent = t('claudeActProbeStalePath', '路径失效');
      } else probeEl.textContent = t('claudeActProbeOk', '已找到');
    }
    var evEl = root.querySelector('[data-setup-event]');
    if (evEl) {
      var ev = String(st.lastEvent || st.last_event || '').trim();
      var age = formatAgeSec(st.lastAgeMs || st.last_age_ms);
      evEl.textContent = ev ? (age ? age + ' · ' + ev : ev) : '—';
    }
    var softEl = root.querySelector('[data-setup-softpad]');
    if (softEl) {
      softEl.textContent = (st.softPadVisible || st.soft_pad_visible)
        ? t('claudeActSoftPadOn', '可显示')
        : t('claudeActSoftPadOff', '未显示');
    }
    var cliEl = root.querySelector('[data-setup-cli]');
    if (cliEl) {
      var pref = !!(st.cliPrefEnabled || st.cli_pref_enabled);
      var can = !!(st.cliCanInject || st.cli_can_inject);
      if (!pref) cliEl.textContent = t('claudeCliStatusPrefOff', '未启用（偏好关）');
      else if (can) cliEl.textContent = t('claudeCliStatusReady', '高置信可注入');
      else cliEl.textContent = t('claudeCliStatusPrefOn', '允许高置信时启用 · 尚未确认会话');
    }
    var step1 = root.querySelector('[data-step-1-body]');
    if (step1) {
      step1.textContent =
        (st.settingsExists || st.settings_exists ? '已找到 settings.json' : '尚无 settings.json') +
        ' · ' +
        ((st.hasUserHooks || st.has_user_hooks) ? '已有用户 hooks' : '无用户 hooks') +
        ' · ' +
        ((st.probeExists || st.probe_exists) ? 'probe 可用' : 'probe 缺失');
    }
    var installBtn = root.querySelector('[data-act="claude-hook-install"]');
    if (installBtn) {
      var canInstall = st.canInstall !== false && st.can_install !== false;
      installBtn.disabled = !canInstall;
      if (st.onetoneConfigured && st.configuredProbeExists === false) {
        installBtn.textContent = t('claudeActHookReinstall', '重新安装并刷新路径');
      } else {
        installBtn.textContent = t('claudeActHookInstall', '确认安装');
      }
    }
    var issuesEl = root.querySelector('[data-claude-act-issues]');
    if (issuesEl && Array.isArray(st.issues)) {
      issuesEl.innerHTML = '';
      st.issues.slice(0, 6).forEach(function (iss) {
        var li = document.createElement('li');
        li.className = 'codex-pad-mgr__claude-issue is-' + String(iss.severity || 'info');
        li.innerHTML =
          '<span class="codex-pad-mgr__bind-sev">' + esc(severityLabel(iss.severity)) + '</span>' +
          '<span class="codex-pad-mgr__bind-body">' +
          '<strong>' + esc(iss.title || '') + '</strong> · ' +
          esc(iss.reason || '') +
          (iss.action ? (' · ' + esc(iss.action)) : '') +
          '</span>';
        issuesEl.appendChild(li);
      });
    }
    var mapEl = root.querySelector('[data-claude-cli-map]');
    var toggleBtn = root.querySelector('[data-act="claude-cli-pref-toggle"]');
    var prefOn = !!(st.cliPrefEnabled || st.cli_pref_enabled);
    if (mapEl) {
      if (prefOn) {
        mapEl.textContent = (st.cliCanInject || st.cli_can_inject)
          ? t('claudeCliMapPrefOnReady', '偏好：允许高置信时启用 · 当前可注入')
          : t('claudeCliMapPrefOnWait', '偏好：允许高置信时启用 · 尚未确认 Claude 会话');
      } else {
        mapEl.textContent = t('claudeCliMapPrefOff', '偏好：关闭 · 不会键注入');
      }
    }
    if (toggleBtn) {
      toggleBtn.textContent = prefOn
        ? t('claudeCliPrefDisable', '关闭 CLI 键注入偏好')
        : t('claudeCliPrefEnable', '允许高置信时启用');
      toggleBtn.setAttribute('data-enabled', prefOn ? '1' : '0');
    }
  }

  function refreshClaudeHookSetup() {
    return padInvoke('cmd_claude_hook_setup_status', {})
      .then(function (st) {
        applyClaudeHookSetupDom(st || {});
        return st;
      })
      .catch(function () {
        return null;
      });
  }

  /** Lightweight redetect — avoid stacking diagnose+overlay IPCs that wedge the UI. */
  function redetectClaudeHookSetup() {
    var root = document.getElementById('codexClaudeActivityPad');
    var btn = root && root.querySelector('[data-act="claude-hook-redetect"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('claudeActRedetecting', '检测中…');
    }
    var done = function () {
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('claudeActRedetect', '重新检测');
      }
    };
    return refreshClaudeHookSetup()
      .then(function (st) {
        done();
        if (!st) {
          toast(t('claudeActRedetectFail', '检测失败：应用可能未响应，请重启 OneTone'));
          return null;
        }
        toast(t('claudeActRedetectOk', '已重新检测'));
        // Soft paint only — do not chain full diagnose/overlay refresh here.
        if (padDiagLastView) {
          renderClaudeActivityPad(padDiagLastView, claudeActOverlaySnap);
        }
        return st;
      })
      .catch(function () {
        done();
        toast(t('claudeActRedetectFail', '检测失败：应用可能未响应，请重启 OneTone'));
        return null;
      });
  }

  var claudeActOverlaySnap = null;
  var claudeActSelectedKey = '';

  function patchClaudeActPadFromOverlayCells(root, cells) {
    if (!root) return;
    var map = {};
    (cells || []).forEach(function (c) {
      if (!c || !c.microKeyId) return;
      map[c.microKeyId] = c;
    });
    root.querySelectorAll('[data-micro-key]').forEach(function (el) {
      var mid = el.getAttribute('data-micro-key');
      var info = map[mid];
      if (!info) {
        el.setAttribute('data-run-status', 'idle');
        el.removeAttribute('data-status-source');
        return;
      }
      var st = String(info.runStatus || info.run_status || 'idle').trim() || 'idle';
      var src = String(info.statusSource || info.status_source || '').trim();
      el.setAttribute('data-run-status', st);
      if (src) el.setAttribute('data-status-source', src);
      else el.removeAttribute('data-status-source');
      el.classList.toggle('is-native-status', src === 'native');
      el.classList.toggle('is-claude-lit', src === 'claude_hook' || src === 'claude_app');
      var label = String(info.label || '').trim();
      var sub = String(info.sub || '').trim();
      if (label) el.setAttribute('data-cap-name', label);
      if (sub) el.setAttribute('data-cap-chord', sub);
      else if (src) el.setAttribute('data-cap-chord', statusSourceLabelFor(src, ''));
    });
  }

  function renderClaudeActDetail(microKeyId) {
    var el = document.querySelector('[data-claude-act-detail]');
    if (!el) return;
    claudeActSelectedKey = String(microKeyId || '').trim();
    var host = document.querySelector('[data-claude-act-pad]');
    if (host) {
      host.querySelectorAll('[data-micro-key]').forEach(function (node) {
        node.classList.toggle('is-focused', node.getAttribute('data-micro-key') === claudeActSelectedKey);
      });
    }
    if (!claudeActSelectedKey) {
      el.innerHTML = '<p class="codex-pad-mgr__hint">' +
        esc(t('claudeActDetailEmpty', '点击左侧键查看详情（只读）')) + '</p>';
      return;
    }
    var cell = null;
    var cells = (claudeActOverlaySnap && claudeActOverlaySnap.cells) || [];
    for (var i = 0; i < cells.length; i++) {
      if (cells[i].microKeyId === claudeActSelectedKey) {
        cell = cells[i];
        break;
      }
    }
    var pad = (padManagerMapping && padManagerMapping.codexMicroPad) || null;
    var route = routeForMicroKey(pad, claudeActSelectedKey);
    var light = null;
    var lights = (padDiagLastView && padDiagLastView.claudeLights) || [];
    for (var j = 0; j < lights.length; j++) {
      if (lights[j].hostKey === claudeActSelectedKey) {
        light = lights[j];
        break;
      }
    }
    var lines = [
      '键 · ' + claudeActSelectedKey,
      'slot · ' + ((route && route.slotId) || '—'),
      'scan · ' + (route
        ? (scanLabel(route.sourceScan, route.sourceExtended) || String(route.sourceScan || '—'))
        : '—'),
      'status · ' + ((cell && (cell.runStatus || cell.run_status)) || 'idle'),
      'source · ' + ((cell && (cell.statusSource || cell.status_source)) || '—'),
      'label · ' + ((cell && cell.label) || '—'),
      'sub · ' + ((cell && cell.sub) || '—')
    ];
    if (light) {
      lines.push('Claude · ' + (light.shortLabel || light.agentType || light.agentKey));
      lines.push('agentId · ' + (light.agentId || '—'));
      lines.push('lastEvent · ' + (light.lastEvent || '—'));
    }
    var src = cell && (cell.statusSource || cell.status_source);
    if (src === 'native') lines.push('覆盖 · Native thstatus 优先');
    else if (src === 'claude_hook' || src === 'claude_app') lines.push('覆盖 · Claude activity light');
    else if (src === 'codex_hook' || src === 'codex_app') lines.push('覆盖 · Codex status host');
    el.innerHTML = '<pre class="codex-pad-mgr__diag-pre">' + esc(lines.join('\n')) + '</pre>';
  }

  function renderClaudeActivityPad(view, overlaySnap) {
    var root = document.getElementById('codexClaudeActivityPad');
    if (!root) return;
    if (overlaySnap) claudeActOverlaySnap = overlaySnap;
    var phase = String((view && view.claudeHookPhase) || 'offline');
    root.setAttribute('data-phase', phase);

    var chipsEl = root.querySelector('[data-claude-act-chips]');
    if (chipsEl) {
      var lastEv = (view && (view.claudeLastEvent || view.lastEvent)) || '—';
      var age = formatAgeMs(view && view.claudeLastAgeMs);
      var chips = [
        { k: 'hook', label: 'Claude Hook', v: claudeHookPhaseLabel(phase), tip: phase, phase: phase },
        {
          k: 'event',
          label: '最近事件',
          v: lastEv + (age ? ' · ' + age : ''),
          tip: (view && view.claudeLastSource) || ''
        },
        {
          k: 'endpoint',
          label: 'Endpoint',
          v: view && view.claudeEndpointRecent ? 'recent' : 'idle',
          tip: 'OneTone /api/codex-app/state 近窗 claude_hook'
        },
        {
          k: 'lights',
          label: '状态灯',
          v: view && view.statusLightsEnabled ? 'on' : 'off',
          tip: 'codexStatusLightsEnabled'
        },
        {
          k: 'pad',
          label: 'Soft Pad',
          v: (view && view.padMode) || 'numpad',
          tip: 'Codex mode / numpad mode'
        },
        {
          k: 'native',
          label: 'Native Micro',
          v: (view && view.nativeConnectionState) || 'fallback',
          tip: '仅 Micro thstatus，不是 Claude Hook'
        },
        {
          k: 'term',
          label: 'Terminal→Claude',
          v: view && view.terminalHasClaudeChild ? 'yes' : 'no',
          tip: '诊断-only：前台终端子孙是否含 claude.exe（不驱动 Soft Pad 显示）'
        },
        {
          k: 'latch',
          label: 'CLI latch',
          v: (view && view.claudeCliLatch && view.claudeCliLatch.confidence) || 'none',
          tip: (view && view.claudeCliLatch && view.claudeCliLatch.reason) || ''
        },
        {
          k: 'inject',
          label: 'can inject',
          v: view && view.claudeCliCanInject && view.claudeCliCanInject.ok ? 'yes' : 'no',
          tip: (view && view.claudeCliCanInject && view.claudeCliCanInject.reason) || ''
        }
      ];
      chipsEl.innerHTML = chips.map(function (c) {
        return (
          '<span class="codex-pad-mgr__claude-chip" data-chip="' + esc(c.k) + '"' +
          (c.phase ? ' data-phase="' + esc(c.phase) + '"' : '') +
          ' title="' + esc((c.label + ' · ' + (c.tip || c.v)).trim()) + '">' +
          '<span class="codex-pad-mgr__claude-chip-k">' + esc(c.label) + '</span>' +
          '<span class="codex-pad-mgr__claude-chip-v">' + esc(c.v) + '</span></span>'
        );
      }).join('');
    }

    var mapEl = root.querySelector('[data-claude-cli-map]');
    if (mapEl) {
      var pending = view && view.claudePendingApproval;
      var prefOn = claudeHookSetupLast &&
        !!(claudeHookSetupLast.cliPrefEnabled || claudeHookSetupLast.cli_pref_enabled);
      if (pending && pending.active) {
        mapEl.textContent = t(
          'claudeCliMapHook',
          'Hook 审批通道就绪 · ACT12 允许 / ACT08 拒绝'
        );
      } else if (prefOn) {
        mapEl.textContent = (claudeHookSetupLast.cliCanInject || claudeHookSetupLast.cli_can_inject)
          ? t('claudeCliMapPrefOnReady', '偏好：允许高置信时启用 · 当前可注入')
          : t('claudeCliMapPrefOnWait', '偏好：允许高置信时启用 · 尚未确认 Claude 会话');
      } else {
        mapEl.textContent = t(
          'claudeCliMapPrefOff',
          '偏好：关闭 · 不会键注入'
        );
      }
    }

    var issuesEl = root.querySelector('[data-claude-act-issues]');
    if (issuesEl && !(claudeHookSetupLast && Array.isArray(claudeHookSetupLast.issues))) {
      var issues = (view && Array.isArray(view.issues) ? view.issues : []).slice(0, 3);
      issuesEl.innerHTML = '';
      issues.forEach(function (iss) {
        var li = document.createElement('li');
        li.className = 'codex-pad-mgr__claude-issue is-' + String(iss.severity || 'info');
        li.innerHTML =
          '<span class="codex-pad-mgr__bind-sev">' + esc(severityLabel(iss.severity)) + '</span>' +
          '<span class="codex-pad-mgr__bind-body">' +
          '<strong>' + esc(iss.title || '') + '</strong> · ' +
          esc(iss.reason || '') +
          (iss.action ? (' · ' + esc(iss.action)) : '') +
          '</span>';
        issuesEl.appendChild(li);
      });
    }

    var waitEl = root.querySelector('[data-claude-act-waiting]');
    if (waitEl) {
      var hint = String((view && view.claudeWaitingHint) || '').trim();
      waitEl.hidden = !hint;
      waitEl.textContent = hint;
    }

    var padHost = root.querySelector('[data-claude-act-pad]');
    if (padHost && padManagerMapping) {
      var pad = padManagerMapping.codexMicroPad || {};
      padHost.innerHTML = renderHardwarePad(padManagerMapping, pad, {
        mode: 'run',
        compact: true
      });
      patchClaudeActPadFromOverlayCells(
        padHost,
        (claudeActOverlaySnap && claudeActOverlaySnap.cells) || []
      );
      padHost.querySelectorAll('[data-micro-key]').forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          renderClaudeActDetail(btn.getAttribute('data-micro-key'));
        });
      });
      if (claudeActSelectedKey) renderClaudeActDetail(claudeActSelectedKey);
    }

    var lightsEl = root.querySelector('[data-claude-act-lights]');
    if (lightsEl) {
      var rows = (view && view.claudeLights) || [];
      if (!rows.length) {
        lightsEl.innerHTML =
          '<p class="codex-pad-mgr__hint">' +
          esc(t(
            'claudeActLightsEmpty',
            '还没有 Claude activity。合并 hooks 后打开 Claude CLI（SessionStart 可先亮 Soft Pad），或点击测试注入。'
          )) +
          '</p>';
      } else {
        var table =
          '<table class="codex-pad-mgr__claude-table"><thead><tr>' +
          '<th></th><th>短名</th><th>type</th><th>id</th><th>host</th><th>state</th><th>source</th><th>age</th><th>event</th>' +
          '</tr></thead><tbody>';
        rows.forEach(function (r) {
          table +=
            '<tr data-host-key="' + esc(r.hostKey || '') + '" data-act="claude-light-row" tabindex="0" role="button" aria-label="' + esc(r.shortLabel || r.hostKey || 'Claude activity') + '">' +
            '<td><span class="codex-pad-mgr__claude-dot" data-status="' + esc(r.state || 'idle') + '"></span></td>' +
            '<td>' + esc(r.shortLabel || '') + '</td>' +
            '<td>' + esc(r.agentType || '') + '</td>' +
            '<td>' + esc(r.agentId || '') + '</td>' +
            '<td>' + esc(r.hostKey || '') + '</td>' +
            '<td>' + esc(r.state || '') + '</td>' +
            '<td>' + esc(r.source || '') + '</td>' +
            '<td>' + esc(formatAgeMs(r.ageMs) || '—') + '</td>' +
            '<td>' + esc(r.lastEvent || '') + '</td>' +
            '</tr>';
        });
        table += '</tbody></table>';
        lightsEl.innerHTML = table;
        lightsEl.querySelectorAll('[data-act="claude-light-row"]').forEach(function (tr) {
          function openRow() {
            renderClaudeActDetail(tr.getAttribute('data-host-key'));
          }
          tr.addEventListener('click', openRow);
          tr.addEventListener('keydown', function (e) {
            var key = e.key || e.code || '';
            if (key !== 'Enter' && key !== ' ' && key !== 'Spacebar' && key !== 'Space') return;
            e.preventDefault();
            openRow();
          });
        });
      }
    }

    var ovEl = root.querySelector('[data-claude-act-overflow]');
    if (ovEl) {
      var ov = (view && view.claudeOverflow) || [];
      var count = Number(view && view.claudeOverflowCount) || ov.length;
      if (!count) {
        ovEl.innerHTML = '';
      } else {
        var html = '<p class="codex-pad-mgr__label">Overflow · ' + esc(String(count)) + '</p><ul>';
        ov.forEach(function (o) {
          html +=
            '<li>' +
            esc(o.shortLabel || o.agentType || o.agentKey || '?') +
            ' · ' + esc(o.state || '') +
            ' · ' + esc(overflowReasonLabel(o.reason)) +
            ' · ' + esc(t('claudeActOvHint', '等待释放 / 调整 status 宿主')) +
            '</li>';
        });
        html += '</ul>';
        ovEl.innerHTML = html;
      }
    }
  }

  function agentRefreshStillCurrent(ctx) {
    ctx = ctx || {};
    // Soft Pad agent subpage requires a token; modal/manager may omit it.
    if (ctx.requireSoftPad === true && ctx.token == null) return false;
    if (ctx.token == null && ctx.requireSoftPad !== true) return true;
    var Hub = global.OneToneSoftPadHub;
    if (Hub && typeof Hub.isAgentPanelCurrent === 'function') {
      if (!Hub.isAgentPanelCurrent(ctx.token, ctx.mappingId)) return false;
    }
    if (ctx.container && !ctx.container.isConnected) return false;
    if (ctx.token != null && ctx.container) {
      var stamped = ctx.container.getAttribute('data-agent-load-token');
      if (stamped != null && String(stamped) !== String(ctx.token)) return false;
    }
    return true;
  }

  function refreshClaudeActivityPad(opts) {
    opts = opts || {};
    var root = document.getElementById('codexClaudeActivityPad');
    if (!root) return Promise.resolve(null);
    var ctx = {
      token: opts.agentLoadToken != null ? opts.agentLoadToken : opts.token,
      mappingId: opts.mappingId != null ? opts.mappingId : (opts.mapping && opts.mapping.id),
      container: opts.container || null,
      requireSoftPad: opts.requireSoftPad
    };
    var diagP = padInvoke('cmd_pad_status_diagnose', { limit: 48 })
      .then(function (v) {
        padDiagLastView = v || {};
        return padDiagLastView;
      })
      .catch(function () {
        return padDiagLastView || {};
      });
    var ovP = padInvoke('cmd_codex_micro_overlay_get_state', {}).catch(function () {
      return null;
    });
    return Promise.all([diagP, ovP]).then(function (pair) {
      if (!agentRefreshStillCurrent(ctx)) return null;
      if (pair[0] && document.querySelector('[data-pad-diag-snap]')) {
        renderPadDiagnoseReplay(pair[0], padDiagFilter);
      }
      renderClaudeActivityPad(pair[0], pair[1]);
      return refreshClaudeHookSetup().then(function () { return pair[0]; });
    }).catch(function () {
      return null;
    });
  }

  function applyHookSetupStatusDom(st) {
    var card = document.getElementById('codexPadHookCard');
    if (!card || !st) return;
    var phase = String(st.panelPhase || st.panel_phase || 'not_configured');
    var light = hookLightStatusFromSetup(st);
    var source = String(st.lastSource || st.last_source || '').trim();
    // Only show live light when linked / events exist; setup phases stay soft-idle.
    var showLight = phase === 'connected' || !!(st.lastEvent || st.last_event);
    var lightForUi = showLight ? light : 'idle';
    card.setAttribute('data-phase', phase);
    card.setAttribute('data-light', lightForUi);
    var live = card.querySelector('[data-hook-live]');
    if (live) live.setAttribute('data-light', lightForUi);
    var phaseEl = card.querySelector('[data-hook-phase]');
    if (phaseEl) phaseEl.textContent = hookPanelPhaseLabel(phase);
    var lightLbl = card.querySelector('[data-hook-light-label]');
    if (lightLbl) {
      lightLbl.setAttribute('data-status', lightForUi);
      lightLbl.textContent = padRunStatusLabel(lightForUi);
      // Setup phases: show phase only. Connected: show Micro-style light chip.
      lightLbl.hidden = phase !== 'connected';
    }
    var metaEl = card.querySelector('[data-hook-meta]');
    var agent = String(st.agent || '').trim();
    if (metaEl) {
      // Human source only — never raw event names / ageMs / loopback.
      if (phase === 'connected' && source) {
        metaEl.textContent = statusSourceLabelFor(source, agent);
      } else {
        metaEl.textContent = '';
      }
    }
    var humanEl = card.querySelector('[data-hook-human]');
    if (humanEl) humanEl.textContent = hookHumanHint(phase, lightForUi, source, agent);
    var trustEl = card.querySelector('[data-hook-trust]');
    if (trustEl) trustEl.hidden = phase !== 'configured_waiting';
    var errEl = card.querySelector('[data-hook-error]');
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = '';
    }
    if (showLight) applyHookLightToManagerPad(lightForUi, source || 'codex_hook');
  }

  function refreshHookSetupStatus(m, opts) {
    opts = opts || {};
    var ctx = {
      token: opts.agentLoadToken != null ? opts.agentLoadToken : opts.token,
      mappingId: opts.mappingId != null ? opts.mappingId : (m && m.id),
      container: opts.container || null,
      requireSoftPad: opts.requireSoftPad
    };
    return padInvoke('cmd_codex_hook_setup_status', {
      mappingId: m && m.id ? String(m.id) : null
    }).then(function (st) {
      if (!agentRefreshStillCurrent(ctx)) return null;
      applyHookSetupStatusDom(st || {});
      return st;
    }).catch(function () {
      return null;
    });
  }

  function formatAgeMs(ageMs) {
    var n = Number(ageMs) || 0;
    if (n <= 0) return '';
    if (n < 1000) return '刚刚';
    if (n < 60000) return Math.floor(n / 1000) + 's';
    if (n < 3600000) return Math.floor(n / 60000) + 'm';
    return Math.floor(n / 3600000) + 'h';
  }

  var padDiagFilter = 'all';
  var padDiagLastView = null;

  function formatDiagClock(ts) {
    var n = Number(ts) || 0;
    if (n <= 0) return '';
    // jsonl stores ms epoch; tolerate seconds.
    if (n < 1e12) n *= 1000;
    try {
      var d = new Date(n);
      if (isNaN(d.getTime())) return '';
      var hh = String(d.getHours()).padStart(2, '0');
      var mm = String(d.getMinutes()).padStart(2, '0');
      var ss = String(d.getSeconds()).padStart(2, '0');
      return hh + ':' + mm + ':' + ss;
    } catch (e) {
      return '';
    }
  }

  function formatPadDiagnoseSnap(view) {
    if (!view) return t('codexMicroPadDiagEmpty', '暂无诊断数据');
    var bits = [
      (view.uiStatus || view.state || 'idle'),
      statusSourceLabelFor(view.sourceLegacy || view.source, view.agent)
    ];
    if (view.confidence) bits.push(view.confidence);
    var age = formatAgeMs(view.ageMs);
    if (age) bits.push(age + ' 前');
    var lines = ['当前 · ' + bits.join(' · ')];
    if (view.message) lines.push('说明 · ' + view.message);
    if (view.claudeWaitingHint) lines.push('等待 · ' + view.claudeWaitingHint);
    if (view.lastEvent) lines.push('事件 · ' + view.lastEvent);
    if (view.sessionId) lines.push('会话 · ' + view.sessionId);
    if (view.taskId) lines.push('任务 · ' + view.taskId);
    if (view.logPath) lines.push('日志 · ' + view.logPath);
    var hid = view.hid || {};
    var hidSink = String(hid.sink || 'none');
    var hidLine = '输出 · ' + (hidSink === 'soft_rgb' ? 'Soft RGB' : '无') +
      (hid.emitEnabled ? ' · HID 可发射' : ' · HID 关闭');
    if (hid.note) hidLine += ' · ' + hid.note;
    lines.push(hidLine);
    var claudeLights = Array.isArray(view.claudeLights) ? view.claudeLights : [];
    if (claudeLights.length) {
      lines.push('Claude 活动灯 · ' + claudeLights.length);
      claudeLights.forEach(function (row) {
        var label = row.shortLabel || shortAgentType(row.agentType) || row.agentType || row.agentKey || '?';
        var host = row.hostKey || '—';
        var st = row.state || 'idle';
        var src = row.source || '';
        var ageL = formatAgeMs(row.ageMs);
        var sticky = row.stickyUntil ? String(row.stickyUntil) : '';
        var evt = row.lastEvent || '';
        var parts = [label, st, 'host ' + host];
        if (src) parts.push(src);
        if (ageL) parts.push(ageL);
        if (row.agentId) parts.push('id ' + row.agentId);
        if (evt) parts.push(evt);
        if (sticky) parts.push('sticky ' + sticky);
        lines.push('  · ' + parts.join(' · '));
      });
    }
    var ovCount = Number(view.claudeOverflowCount) || 0;
    var ov = Array.isArray(view.claudeOverflow) ? view.claudeOverflow : [];
    if (ovCount > 0 || ov.length) {
      var names = ov.map(function (o) {
        return o.shortLabel || shortAgentType(o.agentType) || o.agentType || o.agentKey || '?';
      }).filter(Boolean);
      lines.push(
        'Claude overflow · ' + (ovCount || ov.length) +
        (names.length ? ' · ' + names.join(', ') : '')
      );
    }
    return lines.join('\n');
  }

  function filterDiagRows(rows, filter) {
    var list = Array.isArray(rows) ? rows : [];
    if (filter === 'accepted') return list.filter(function (r) { return !!r.accepted; });
    if (filter === 'rejected') return list.filter(function (r) { return !r.accepted; });
    return list;
  }

  function renderPadDiagnoseReplay(view, filter) {
    var snapEl = document.querySelector('[data-pad-diag-snap]');
    var listEl = document.querySelector('[data-pad-diag-replay]');
    var emptyEl = document.querySelector('[data-pad-diag-empty]');
    if (!listEl) return;
    if (snapEl) snapEl.textContent = formatPadDiagnoseSnap(view || {});
    var rows = filterDiagRows(view && view.recent, filter || padDiagFilter);
    listEl.innerHTML = '';
    if (!rows.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    rows.forEach(function (r) {
      var li = document.createElement('li');
      li.className = 'codex-pad-mgr__diag-row' + (r.accepted ? ' is-accepted' : ' is-rejected');
      var ui = String(r.uiStatus || r.state || '').trim() || 'idle';
      var clock = formatDiagClock(r.ts);
      var why = r.rejectReason ? String(r.rejectReason) : '';
      var msg = r.message ? String(r.message) : '';
      var evt = r.lastEvent ? String(r.lastEvent) : '';
      li.innerHTML =
        '<span class="codex-pad-mgr__diag-mark" aria-hidden="true">' +
        (r.accepted ? '✓' : '✗') +
        '</span>' +
        '<span class="codex-pad-mgr__diag-main">' +
        '<span class="codex-pad-mgr__diag-top">' +
        (clock ? '<time class="codex-pad-mgr__diag-time">' + esc(clock) + '</time>' : '') +
        '<span class="codex-pad-mgr__diag-status" data-status="' + esc(ui) + '">' +
        esc(padRunStatusLabel(ui)) +
        '</span>' +
        '<span class="codex-pad-mgr__diag-source">' +
        esc(statusSourceLabelFor(r.sourceLegacy || r.source, r.agent) || r.source || '') +
        '</span>' +
        '</span>' +
        '<span class="codex-pad-mgr__diag-raw">' + esc(r.raw || '') + '</span>' +
        (evt || msg || why
          ? '<span class="codex-pad-mgr__diag-meta">' +
            esc([evt, msg, why].filter(Boolean).join(' · ')) +
            '</span>'
          : '') +
        '</span>';
      listEl.appendChild(li);
    });
  }

  function setPadDiagFilter(filter) {
    padDiagFilter = filter === 'accepted' || filter === 'rejected' ? filter : 'all';
    var card = document.getElementById('codexPadDiag');
    if (card) {
      card.querySelectorAll('[data-act="pad-diag-filter"]').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-filter') === padDiagFilter);
      });
    }
    if (padDiagLastView) renderPadDiagnoseReplay(padDiagLastView, padDiagFilter);
  }

  function refreshPadDiagnose() {
    var listEl = document.querySelector('[data-pad-diag-replay]');
    var snapEl = document.querySelector('[data-pad-diag-snap]');
    var claudeRoot = document.getElementById('codexClaudeActivityPad');
    if (!listEl && !snapEl && !claudeRoot) return Promise.resolve(null);
    return padInvoke('cmd_pad_status_diagnose', { limit: 48 })
      .then(function (view) {
        padDiagLastView = view || {};
        if (listEl || snapEl) renderPadDiagnoseReplay(padDiagLastView, padDiagFilter);
        if (!claudeRoot) return padDiagLastView;
        return padInvoke('cmd_codex_micro_overlay_get_state', {})
          .catch(function () { return null; })
          .then(function (ov) {
            renderClaudeActivityPad(padDiagLastView, ov);
            return padDiagLastView;
          });
      })
      .catch(function () {
        padDiagLastView = null;
        if (snapEl) snapEl.textContent = t('codexMicroPadDiagFail', '诊断读取失败');
        if (listEl) listEl.innerHTML = '';
        return null;
      });
  }

  function severityLabel(sev) {
    if (sev === 'error') return t('codexMicroPadBindSevError', '错误');
    if (sev === 'warn') return t('codexMicroPadBindSevWarn', '警告');
    return t('codexMicroPadBindSevInfo', '提示');
  }

  function renderBindingDiagnose(view) {
    var snapEl = document.querySelector('[data-bind-diag-snap]');
    var listEl = document.querySelector('[data-bind-diag-issues]');
    var emptyEl = document.querySelector('[data-bind-diag-empty]');
    if (!listEl) return;
    var issues = (view && Array.isArray(view.issues)) ? view.issues : [];
    var ok = !!(view && view.ok);
    var errN = issues.filter(function (i) { return i.severity === 'error'; }).length;
    var warnN = issues.filter(function (i) { return i.severity === 'warn'; }).length;
    if (snapEl) {
      snapEl.textContent = ok
        ? t('codexMicroPadBindSnapOk', '通过') +
          (warnN ? (' · ' + warnN + ' ' + t('codexMicroPadBindSevWarn', '警告')) : '') +
          (view && view.layoutProfile ? (' · ' + view.layoutProfile) : '')
        : (t('codexMicroPadBindSnapFail', '未通过') +
          ' · ' + errN + ' ' + t('codexMicroPadBindSevError', '错误') +
          (warnN ? (' · ' + warnN + ' ' + t('codexMicroPadBindSevWarn', '警告')) : ''));
      snapEl.setAttribute('data-ok', ok ? '1' : '0');
    }
    listEl.innerHTML = '';
    var show = issues.filter(function (i) { return i.severity !== 'info'; });
    // Still show info if nothing else.
    if (!show.length) show = issues;
    if (!show.length) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    show.forEach(function (i) {
      var li = document.createElement('li');
      li.className = 'codex-pad-mgr__bind-issue is-' + String(i.severity || 'info');
      var where = [i.microKeyId, i.slotId].filter(Boolean).join(' · ');
      li.innerHTML =
        '<span class="codex-pad-mgr__bind-sev">' + esc(severityLabel(i.severity)) + '</span>' +
        '<span class="codex-pad-mgr__bind-body">' +
        (where ? '<span class="codex-pad-mgr__bind-where">' + esc(where) + '</span> ' : '') +
        esc(i.detail || i.code || '') +
        '</span>';
      listEl.appendChild(li);
    });
  }

  function refreshBindingDiagnose(m) {
    var listEl = document.querySelector('[data-bind-diag-issues]');
    var snapEl = document.querySelector('[data-bind-diag-snap]');
    if (!listEl && !snapEl) return Promise.resolve(null);
    return padInvoke('cmd_codex_pad_binding_diagnose', {
      mappingId: m && m.id ? String(m.id) : null
    }).then(function (view) {
      renderBindingDiagnose(view || {});
      return view;
    }).catch(function () {
      if (snapEl) snapEl.textContent = t('codexMicroPadBindFail', '绑定校验失败');
      if (listEl) listEl.innerHTML = '';
      return null;
    });
  }

  function healBindingDiagnose(m) {
    var snapEl = document.querySelector('[data-bind-diag-snap]');
    var healBtn = document.querySelector('[data-act="pad-bind-heal"]');
    if (healBtn) healBtn.disabled = true;
    return padInvoke('cmd_codex_pad_binding_heal', {
      mappingId: m && m.id ? String(m.id) : null,
      locale: lang()
    }).then(function (res) {
      if (res && m) applyEnsurePayloadToMapping(m, res);
      if (res && res.diagnose) renderBindingDiagnose(res.diagnose);
      else return refreshBindingDiagnose(m).then(function () { return res; });
      // Refresh on-screen pad keys without closing the bind card.
      var host = document.getElementById('codexPadMgrPad');
      if (host && m && m.codexMicroPad) {
        var padBindMode = padUiMode === 'run' ? 'run' : (padUiMode === 'try' ? 'try' : 'config');
        host.innerHTML = renderHardwarePad(m, m.codexMicroPad, { mode: padBindMode });
      }
      if (res && res.changed) {
        toast(t('codexMicroPadBindHealed', '已修复可自动项'));
        notifyLinkedUi(m);
      } else {
        toast(t('codexMicroPadBindHealNoop', '无需修复或无可自动项'));
      }
      return res;
    }).catch(function () {
      if (snapEl) snapEl.textContent = t('codexMicroPadBindHealFail', '一键修复失败');
      toast(t('codexMicroPadBindHealFail', '一键修复失败'));
      return null;
    }).then(function (res) {
      if (healBtn) healBtn.disabled = false;
      return res;
    });
  }

  function setStatusLightsEnabled(m, enabled) {
    return setAgentLightEnabled(m, 'codex', enabled);
  }

  function copyClaudeHookDraft() {
    return padInvoke('cmd_claude_hook_setup_status', {})
      .then(function (st) {
        applyClaudeHookSetupDom(st || {});
        var text = (st && (st.draftJson || st.draft_json || st.hooksDraftJson || st.hooks_draft_json)) || '';
        if (!text) {
          toast(t('claudeActHookCopyFail', '无法生成 Claude Hook 配置'));
          return;
        }
        var done = function () {
          toast(t(
            'claudeActHookCopied',
            '已复制 Claude Hook 草稿（也可在面板确认安装；需你确认后才会写入）'
          ));
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text).then(done).catch(function () {
            toast(t('claudeActHookCopyFail', '无法生成 Claude Hook 配置'));
          });
        }
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (e) {
          toast(t('claudeActHookCopyFail', '无法生成 Claude Hook 配置'));
        }
      })
      .catch(function () {
        toast(t('claudeActHookCopyFail', '无法生成 Claude Hook 配置'));
      });
  }

  function previewClaudeHookInstall() {
    return refreshClaudeHookSetup().then(function (st) {
      var root = document.getElementById('codexClaudeActivityPad');
      if (!root || !st) return;
      var pre = root.querySelector('[data-claude-setup-preview]');
      var un = root.querySelector('[data-claude-setup-uninstall-preview]');
      if (un) un.hidden = true;
      if (pre) {
        pre.hidden = false;
        pre.textContent =
          String(st.previewCopy || st.preview_copy || '') +
          '\n\n--- diff ---\n' +
          String(st.diff || '') +
          '\n\n--- mergedPreview ---\n' +
          String(st.mergedPreview || st.merged_preview || '');
      }
      var step2 = root.querySelector('[data-step-2-body]');
      if (step2) step2.textContent = String(st.diff || '已生成预览');
      toast(t('claudeActHookPreviewOk', '已生成安装预览'));
    });
  }

  function confirmClaudeHookInstall() {
    return padInvoke('cmd_claude_hook_install_confirm', {})
      .then(function (res) {
        if (!res || !res.ok) {
          toast(t('claudeActHookInstallFail', '安装失败：') + ((res && res.reason) || ''));
          return refreshClaudeHookSetup();
        }
        toast(t(
          'claudeActHookInstallOk',
          '已安装 OneTone Claude Hooks' +
            (res.backupPath ? (' · 备份：' + res.backupPath) : '')
        ));
        return refreshClaudeHookSetup().then(function () {
          return refreshClaudeActivityPad();
        });
      })
      .catch(function () {
        toast(t('claudeActHookInstallFail', '安装失败'));
      });
  }

  function previewClaudeHookUninstall() {
    return refreshClaudeHookSetup().then(function (st) {
      var root = document.getElementById('codexClaudeActivityPad');
      if (!root || !st) return;
      var pre = root.querySelector('[data-claude-setup-preview]');
      var un = root.querySelector('[data-claude-setup-uninstall-preview]');
      if (pre) pre.hidden = true;
      if (un) {
        un.hidden = false;
        un.textContent = String(st.uninstallPreview || st.uninstall_preview || '');
      }
      toast(t('claudeActHookUninstallPreviewOk', '已显示撤回说明'));
    });
  }

  function confirmClaudeHookUninstall() {
    return padInvoke('cmd_claude_hook_uninstall_onetone', {})
      .then(function (res) {
        if (!res || !res.ok) {
          toast(t('claudeActHookUninstallFail', '撤回失败：') + ((res && res.reason) || ''));
          return refreshClaudeHookSetup();
        }
        toast(t(
          'claudeActHookUninstallOk',
          '已撤回 OneTone Claude Hooks' +
            (res.backupPath ? (' · 备份：' + res.backupPath) : '')
        ));
        return refreshClaudeHookSetup().then(function () {
          return refreshClaudeActivityPad();
        });
      })
      .catch(function () {
        toast(t('claudeActHookUninstallFail', '撤回失败'));
      });
  }

  function openClaudeSettingsFile() {
    return refreshClaudeHookSetup().then(function (st) {
      var path = (st && (st.settingsPath || st.settings_path)) || '';
      if (!path) {
        toast(t('claudeActHookOpenFail', '无配置路径'));
        return;
      }
      var url = 'file:///' + String(path).replace(/\\/g, '/');
      return padInvoke('cmd_open_url', { url: url }).then(function () {
        toast(t('claudeActHookOpenOk', '已尝试打开配置文件'));
      }).catch(function () {
        toast(t('claudeActHookOpenFail', '无法打开配置文件'));
      });
    });
  }

  function toggleClaudeCliInjectPref(m) {
    if (!m || !m.id) {
      toast(t('claudeCliPrefFail', '无 Soft Pad 映射'));
      return Promise.resolve();
    }
    var root = document.getElementById('codexClaudeActivityPad');
    var btn = root && root.querySelector('[data-act="claude-cli-pref-toggle"]');
    var currentlyOn = btn && btn.getAttribute('data-enabled') === '1';
    var next = !currentlyOn;
    return padInvoke('cmd_claude_cli_inject_pref_set', {
      mappingId: String(m.id),
      enabled: next
    }).then(function () {
      toast(next
        ? t('claudeCliPrefOnOk', '已允许高置信时启用 CLI 键注入')
        : t('claudeCliPrefOffOk', '已关闭 CLI 键注入偏好'));
      return refreshClaudeHookSetup();
    }).catch(function () {
      toast(t('claudeCliPrefFail', '偏好切换失败'));
    });
  }

  function refreshCursorActivityPrefDom(root) {
    root = root || document;
    var cards = root.querySelectorAll
      ? root.querySelectorAll('[data-cursor-activity-card], #codexCursorActivityPad, #cursorActivityMaintenanceCard')
      : [];
    if (!cards.length && root.id === 'codexCursorActivityPad') cards = [root];
    return padInvoke('cmd_cursor_activity_pref_get', {})
      .then(function (st) {
        var on = !!(st && (st.enabled || st.consent));
        Array.prototype.forEach.call(cards, function (card) {
          if (!card || !card.querySelector) return;
          var enableBtn = card.querySelector('[data-act="cursor-activity-enable"]');
          var disableBtn = card.querySelector('[data-act="cursor-activity-disable"]');
          var statusEl = card.querySelector('[data-cursor-activity-status]');
          if (enableBtn) enableBtn.hidden = !!on;
          if (disableBtn) disableBtn.hidden = !on;
          if (statusEl) {
            statusEl.textContent = on
              ? t('cursorActivityOn', '已启用 · 仅本地统计，不代表官方额度')
              : t('cursorActivityOff', '未启用 · 不会读取本机 Cursor 使用记录');
          }
        });
      })
      .catch(function () {});
  }

  function setCursorActivityPref(enabled) {
    return padInvoke('cmd_cursor_activity_pref_set', { enabled: !!enabled })
      .then(function () {
        toast(enabled
          ? t('cursorActivityEnableOk', '已启用 Cursor 活动统计')
          : t('cursorActivityDisableOk', '已关闭 Cursor 活动统计'));
        return refreshCursorActivityPrefDom();
      })
      .catch(function () {
        toast(t('cursorActivityPrefFail', '活动统计偏好切换失败'));
      });
  }

  function copyHookDraft(m) {
    return refreshHookSetupStatus(m).then(function (st) {
      var text = (st && st.hooksDraftJson) || '';
      if (!text) {
        toast(t('codexMicroPadHookCopyFail', '无法生成 Hook 配置'));
        return;
      }
      var done = function () {
        toast(t('codexMicroPadHookCopied', '已复制 hooks.json 草稿（请手动合并到 ~/.codex）'));
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(done).catch(function () {
          toast(t('codexMicroPadHookCopyFail', '无法生成 Hook 配置'));
        });
      }
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (e) {
        toast(t('codexMicroPadHookCopyFail', '无法生成 Hook 配置'));
      }
    });
  }

  function installCodexHooks(m) {
    return refreshHookSetupStatus(m).then(function (st) {
      if (st && st.canInstall === false) {
        toast(t('codexMicroPadHookInstallNoProbe', '找不到探针脚本，无法安装'));
        return;
      }
      var files = (st && st.inspectFiles) || [];
      var summary = files.map(function (f) {
        return (f.role || '') + ': ' + (f.exists ? 'ok' : 'missing') + ' — ' + (f.detail || '');
      }).join('\n');
      if (summary) console.info('[codex-hooks inspect]\n' + summary);
      return padInvoke('cmd_codex_hook_install_confirm').then(function (r) {
        if (r && r.ok) {
          toast(t('codexMicroPadHookInstalled', '已写入 ~/.codex/hooks.json（请在 Codex /hooks 信任）'));
          return refreshHookSetupStatus(m);
        }
        toast(t('codexMicroPadHookInstallFail', '安装失败') + ': ' + ((r && r.message) || ''));
      });
    }).catch(function (e) {
      toast(t('codexMicroPadHookInstallFail', '安装失败') + ': ' + String(e || ''));
    });
  }

  function clearPadErrors(opts) {
    opts = opts || {};
    return padInvoke('cmd_pad_status_clear_errors', {
      sessionId: opts.sessionId || null,
      laneId: opts.laneId || null
    }).then(function (r) {
      toast(t('codexMicroPadErrorsCleared', '已清除红灯'));
      refreshPadDiagnose();
      return r;
    }).catch(function () {
      toast(t('codexMicroPadClearErrorsFail', '清除失败'));
    });
  }

  function openHookDocs() {
    padInvoke('cmd_open_url', { url: 'docs/codex-hook-onetone-setup.md' }).catch(function () {
      toast(t('codexMicroPadHookDocsToast',
        '见 docs/codex-hook-onetone-setup.md：复制配置 → 写入 ~/.codex/hooks.json → Codex /hooks 信任'));
    });
  }

  function applyPadRunStatusDom() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    document.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
      var id = el.getAttribute('data-micro-key');
      var on = padRunStatus !== 'idle' && id === padRunMicroKeyId;
      if (padRunStatus === 'listening' && holdUiReleased) on = false;
      el.setAttribute('data-run-status', on ? padRunStatus : 'idle');
    });
    document.querySelectorAll('.codex-micro-pad__run-status').forEach(function (chip) {
      chip.setAttribute('data-status', padRunStatus);
      chip.textContent = padRunStatusLabel(padRunStatus);
    });
    document.querySelectorAll('.micro-hw__leds').forEach(function (leds) {
      leds.setAttribute('data-pad-status', padRunStatus);
    });
  }

  function schedulePadRunFallback(fromStatus) {
    clearPadRunTimer();
    if (fromStatus === 'running') {
      padRunTimer = setTimeout(function () {
        setPadRunStatus('done', padRunMicroKeyId);
      }, PAD_STATUS_MS.running);
    } else if (fromStatus === 'done') {
      padRunTimer = setTimeout(function () {
        setPadRunStatus('idle', '');
      }, PAD_STATUS_MS.done);
    } else if (fromStatus === 'failed') {
      padRunTimer = setTimeout(function () {
        setPadRunStatus('idle', '');
      }, PAD_STATUS_MS.failed);
    }
  }

  function setPadRunStatus(status, microKeyId) {
    var next = String(status || 'idle');
    if (['idle', 'running', 'listening', 'done', 'failed'].indexOf(next) < 0) next = 'idle';
    padRunStatus = next;
    padRunMicroKeyId = next === 'idle' ? '' : String(microKeyId || padRunMicroKeyId || '');
    applyPadRunStatusDom();
    if (next === 'listening') {
      clearPadRunTimer();
      return;
    }
    schedulePadRunFallback(next);
  }

  function applyFireRunStatus(res, microKeyId, phase) {
    if (!res) {
      if (phase === 'down' || phase === 'tap') setPadRunStatus('failed', microKeyId);
      return;
    }
    var reason = String(res.reason || '');
    if (reason === 'hold_down') {
      holdSuppressCancel = true;
      holdUiReleased = false;
      setPadRunStatus('listening', microKeyId);
      return;
    }
    if (reason === 'hold_up') {
      holdSuppressCancel = false;
      holdUiReleased = false;
      setPadRunStatus('done', microKeyId);
      return;
    }
    if (reason === 'hold_busy') return;
    if (reason === 'numpad_mode') {
      toast(t('codexMicroPadNumpadPassThrough', '请先打开模式开关 · 切换到虚拟键盘模式'));
      return;
    }
    if (reason === 'fired' || reason === 'enhance_pulse') {
      setPadRunStatus('running', microKeyId);
      return;
    }
    if (!res.ok && (phase === 'down' || phase === 'tap')) {
      setPadRunStatus('failed', microKeyId);
    }
  }

  function fireMicroKey(m, microKeyId, phase) {
    var pad = m && m.codexMicroPad;
    if (!pad || !pad.enabled) {
      toast(t('codexMicroPadStatusOff', '已关闭'));
      return Promise.resolve({ ok: false, reason: 'disabled' });
    }
    var enhancePulse = isEnhanceOn(pad) && isEnhanceMicroKey(microKeyId);
    var route = routeForMicroKey(pad, microKeyId);
    var holdKey = isHoldMicroKey(m, microKeyId);
    if (!enhancePulse && !holdKey && (!route || !route.enabled || !String(route.slotId || '').trim())) {
      toast(t('codexMicroPadUnbound', '未配置'));
      return Promise.resolve({ ok: false, reason: 'unbound' });
    }
    if (phase === 'down' || phase === 'tap') {
      applyPressedClass(microKeyId);
    } else if (phase === 'up') {
      applyPressedClass('');
    }
    return invokeFire(microKeyId, phase).then(function (res) {
      explainFireResult(res);
      applyFireRunStatus(res, microKeyId, phase);
      return res;
    });
  }

  function fireEnhanceTap(m, microKeyId) {
    return fireMicroKey(m, microKeyId, 'down').then(function (res) {
      fireMicroKey(m, microKeyId, 'up');
      return res;
    });
  }

  function exitJoyDirectionMode() {
    joyDirUntil = 0;
    joyDirMapping = null;
    if (joyDirTimer) {
      clearTimeout(joyDirTimer);
      joyDirTimer = null;
    }
    if (joyDirKeyHandler) {
      try {
        if (typeof window !== 'undefined' && window.removeEventListener) {
          window.removeEventListener('keydown', joyDirKeyHandler, true);
        }
      } catch (_) {}
      joyDirKeyHandler = null;
    }
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      document.querySelectorAll('.micro-hw__key[data-micro-key="JOY"]').forEach(function (el) {
        el.classList.remove('is-joy-dir');
      });
    }
  }

  function enterJoyDirectionMode(m) {
    if (!m || !isEnhanceOn(m.codexMicroPad)) return false;
    if (typeof window === 'undefined' || !window.addEventListener) return false;
    exitJoyDirectionMode();
    joyDirMapping = m;
    joyDirUntil = Date.now() + JOY_DIR_MS;
    if (typeof document !== 'undefined' && document.querySelectorAll) {
      document.querySelectorAll('.micro-hw__key[data-micro-key="JOY"]').forEach(function (el) {
        el.classList.add('is-joy-dir');
      });
    }
    toast(t('codexMicroPadJoyDirHint', '方向模式 3 秒：方向键导航 · Enter 确认 · Esc 退出'));
    joyDirKeyHandler = function (e) {
      if (!joyDirUntil || Date.now() > joyDirUntil) {
        exitJoyDirectionMode();
        return;
      }
      var key = e.key;
      var nav = null;
      if (key === 'ArrowUp') nav = 'NAV_UP';
      else if (key === 'ArrowDown') nav = 'NAV_DOWN';
      else if (key === 'ArrowLeft') nav = 'NAV_LEFT';
      else if (key === 'ArrowRight') nav = 'NAV_RIGHT';
      else if (key === 'Enter') nav = 'NAV_PRESS';
      else if (key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        exitJoyDirectionMode();
        return;
      }
      if (!nav) return;
      e.preventDefault();
      e.stopPropagation();
      fireEnhanceTap(joyDirMapping, nav);
    };
    window.addEventListener('keydown', joyDirKeyHandler, true);
    joyDirTimer = setTimeout(function () {
      exitJoyDirectionMode();
    }, JOY_DIR_MS);
    return true;
  }

  function isJoyDirectionActive() {
    return !!(joyDirUntil && Date.now() <= joyDirUntil && joyDirKeyHandler);
  }

  function renderModeSeg() {
    var modes = [
      { id: 'edit', label: t('codexMicroPadModeEdit', '编辑') },
      { id: 'try', label: t('codexMicroPadModeTry', '试按') },
      { id: 'run', label: t('codexMicroPadModeRun', '运行') }
    ];
    var html = '<div class="codex-micro-pad__modes" role="radiogroup" aria-label="' +
      esc(t('codexMicroPadModeLbl', '虚拟盘模式')) + '">';
    modes.forEach(function (opt) {
      html += '<button type="button" class="codex-micro-pad__mode' +
        (padUiMode === opt.id ? ' is-active' : '') +
        '" data-pad-mode="' + opt.id + '" role="radio" aria-checked="' +
        (padUiMode === opt.id ? 'true' : 'false') + '">' + esc(opt.label) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function renderProfileSeg(pad) {
    var cur = (pad && pad.layoutProfile) || 'standard';
    if (LAYOUT_PROFILES.indexOf(cur) < 0 && cur !== 'custom') cur = 'standard';
    var opts = [
      { id: 'beginner', label: t('codexMicroPadProfileBeginner', '入门') },
      { id: 'standard', label: t('codexMicroPadProfileStandard', '标准') },
      { id: 'advanced', label: t('codexMicroPadProfileAdvanced', '高级') }
    ];
    var html = '<div class="codex-micro-pad__profiles" role="radiogroup" aria-label="' +
      esc(t('codexMicroPadProfileLbl', '布局')) + '">';
    opts.forEach(function (opt) {
      html += '<button type="button" class="codex-micro-pad__profile' +
        (cur === opt.id ? ' is-active' : '') +
        '" data-pad-profile="' + opt.id + '" role="radio" aria-checked="' +
        (cur === opt.id ? 'true' : 'false') + '">' + esc(opt.label) + '</button>';
    });
    if (cur === 'custom') {
      html += '<span class="codex-micro-pad__profile-custom">' +
        esc(t('codexMicroPadProfileCustom', '自定义')) + '</span>';
    }
    html += '</div>';
    return html;
  }

  function modeHintText() {
    if (padUiMode === 'run') {
      return t('codexMicroPadModeRunHint', '运行：点击键帽会执行对应动作');
    }
    if (padUiMode === 'try') {
      return t('codexMicroPadModeTryHint', '试按：按实体小键盘，只验证映射，不执行动作');
    }
    return t('codexMicroPadModeEditHint', '编辑：点击键帽修改能力');
  }

  function renderPresentationSeg(pad) {
    var cur = (pad && pad.presentation) === 'mini' ? 'mini' : 'full';
    var opts = [
      { id: 'full', label: t('codexMicroPadPresentationFull', '完整体') },
      { id: 'mini', label: t('codexMicroPadPresentationMini', '精简态') }
    ];
    var html = '<div class="codex-micro-pad__modes" role="radiogroup" aria-label="' +
      esc(t('codexMicroPadPresentationLbl', '显示形态')) + '">';
    opts.forEach(function (opt) {
      html += '<button type="button" class="codex-micro-pad__mode' +
        (cur === opt.id ? ' is-active' : '') +
        '" data-pad-presentation="' + opt.id + '" role="radio" aria-checked="' +
        (cur === opt.id ? 'true' : 'false') + '">' + esc(opt.label) + '</button>';
    });
    html += '</div>';
    return html;
  }

  function skinLabel(id) {
    if (id === 'glass-light') return t('softPadSkinGlassLight', '玻璃浅色');
    if (id === 'hybrid-pro') return t('softPadSkinHybridPro', 'Hybrid Pro');
    if (id === 'vibe-light') return t('softPadSkinVibeLight', 'Vibe Light');
    return t('softPadSkinDefault', '默认');
  }

  /** Compact non-interactive pad thumb — reuses real data-pad-skin CSS. */
  function renderSkinMiniPreview(skinId) {
    var skin = canonicalizePadSkin(skinId);
    var keys = [
      'command', 'control', 'agent',
      'agent', 'command', 'command',
      'command', 'agent', 'control'
    ];
    var cells = '';
    for (var i = 0; i < keys.length; i++) {
      cells += '<span class="micro-hw__key micro-hw__key--' + keys[i] +
        ' is-bound soft-pad-skin-mini__key" aria-hidden="true"></span>';
    }
    return (
      '<span class="soft-pad-skin-mini micro-hw" data-pad-skin="' + esc(skin) + '">' +
      '<span class="micro-hw__face soft-pad-skin-mini__face">' +
      '<span class="micro-hw__grid soft-pad-skin-mini__grid">' + cells + '</span>' +
      '</span></span>'
    );
  }

  function renderSkinSeg(pad) {
    var cur = canonicalizePadSkin(pad && pad.skin);
    var html = '<div class="soft-pad-skin-grid" role="radiogroup" aria-label="' +
      esc(t('softPadSkinLbl', '外观风格')) + '">';
    PAD_SKIN_CHOICES.forEach(function (id) {
      var on = cur === id;
      html +=
        '<button type="button" class="soft-pad-skin-card' + (on ? ' is-active' : '') +
        '" data-pad-skin-opt="' + id + '" role="radio" aria-checked="' +
        (on ? 'true' : 'false') + '" title="' + esc(skinLabel(id)) + '">' +
        '<span class="soft-pad-skin-card__preview" aria-hidden="true">' +
        renderSkinMiniPreview(id) +
        '</span>' +
        '<span class="soft-pad-skin-card__label">' + esc(skinLabel(id)) + '</span>' +
        '</button>';
    });
    html += '</div>';
    return html;
  }

  function patchSoftPadPreviewSkin(m) {
    var skin = canonicalizePadSkin(m && m.codexMicroPad && m.codexMicroPad.skin);
    var host = document.getElementById('softPadPreviewHost');
    if (!host) return;
    var root = host.querySelector('.codex-micro-pad.soft-pad-preview');
    if (root) root.setAttribute('data-pad-skin', skin);
    host.querySelectorAll('.micro-hw, .soft-pad-show-scene__pad--mini, .soft-pad-demo-hw').forEach(function (el) {
      el.setAttribute('data-pad-skin', skin);
    });
  }

  function patchSkinSegActive(body, skin) {
    if (!body) return;
    var cur = canonicalizePadSkin(skin);
    body.querySelectorAll('[data-pad-skin-opt]').forEach(function (b) {
      var on = b.getAttribute('data-pad-skin-opt') === cur;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function renderAgentConnectFold(m, pad, opts) {
    opts = opts || {};
    // Soft Pad panel: keep fold shell only — Hook/Claude cards are huge and were
    // re-injected on every scheme click (DOM+listener 风暴 → 假死).
    if (opts.lazyAgent) {
      return (
        '<details class="codex-pad-mgr__agent-connect" id="codexPadAgentConnect" data-lazy-agent="1">' +
        '<summary>' + esc(t('codexMicroPadAgentConnect', 'Agent 接入')) + '</summary>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('codexMicroPadAgentConnectHint', 'Codex 状态灯与 Claude Activity 安装收纳于此，不影响布局编辑。')) +
        '</p>' +
        '<div class="codex-pad-mgr__agent-lazy" data-lazy-agent-body></div>' +
        '</details>'
      );
    }
    return (
      '<details class="codex-pad-mgr__agent-connect" id="codexPadAgentConnect">' +
      '<summary>' + esc(t('codexMicroPadAgentConnect', 'Agent 接入')) + '</summary>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('codexMicroPadAgentConnectHint', 'Codex 状态灯与 Claude Activity 安装收纳于此，不影响布局编辑。')) +
      '</p>' +
      renderSoftPadMoreBody(m, pad) +
      '</details>'
    );
  }

  function fillLazyAgentConnect(body, m, pad, opts) {
    opts = opts || {};
    if (!body || !m || !pad) return;
    var host = body.querySelector('[data-lazy-agent-body]');
    if (!host || host.getAttribute('data-filled') === '1') return;
    var token = opts.agentLoadToken != null ? opts.agentLoadToken : opts.token;
    var requireSoftPad = opts.requireSoftPad === true;
    // Soft Pad panel must carry a token; modal may omit it.
    if (requireSoftPad && token == null) return;
    if (token != null) body.setAttribute('data-agent-load-token', String(token));
    host.setAttribute('data-filled', '1');
    host.innerHTML = renderSoftPadMoreBody(m, pad);
    bindSoftPadMoreTabs(host);
    bindAgentConnectEvents(body, m, pad);
    var refreshOpts = {
      agentLoadToken: token,
      mappingId: m.id,
      container: body,
      requireSoftPad: requireSoftPad
    };
    refreshAgentLightsPickerState(host, m, pad);
    // Defer disk-heavy Hook probes so the panel stays clickable.
    setTimeout(function () {
      try {
        refreshAgentLightsPickerState(host, m, pad, { hooks: true });
      } catch (_) {}
    }, 0);
    if (softPadLabVisible(pad)) {
      try { refreshPadDiagnose(); } catch (_) {}
    }
    void refreshOpts;
  }

  var padManagerMapping = null;
  var padManagerMode = 'modal';
  var padManagerContainer = null;

  function findMappingById(id) {
    id = String(id || '');
    if (!id) return null;
    var st = global.OneToneState && global.OneToneState.state;
    var list = (st && st.config && st.config.mappings) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && String(list[i].id) === id) return list[i];
    }
    return null;
  }

  function activePadManagerBody() {
    if (padManagerContainer && padManagerContainer.isConnected) return padManagerContainer;
    return document.getElementById('codexPadMgrBody');
  }

  var presentationPersistTimer = 0;
  var presentationPersistPending = null;
  var miniChromePersistTimer = 0;
  var miniChromePersistPending = null;

  function persistMiniChrome(m) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !m.id || !pad) return Promise.resolve();
    var chrome = ensureMiniChrome(pad);
    miniChromePersistPending = {
      mappingId: String(m.id),
      chrome: {
        voiceChipEnabled: chrome.voiceChipEnabled !== false,
        voiceChipWhen: chrome.voiceChipWhen === 'armed' ? 'armed' : 'listening',
        agentsBarEnabled: chrome.agentsBarEnabled !== false,
        textPreviewEnabled: chrome.textPreviewEnabled !== false,
        textPreviewWhen: chrome.textPreviewWhen === 'hasText' ? 'hasText' : 'listening',
        toolsBarEnabled: chrome.toolsBarEnabled !== false,
        toolIds: Array.isArray(chrome.toolIds) ? chrome.toolIds.slice() : [],
        expandBtnEnabled: chrome.expandBtnEnabled !== false,
        closeBtnEnabled: chrome.closeBtnEnabled !== false
      }
    };
    if (miniChromePersistTimer) clearTimeout(miniChromePersistTimer);
    miniChromePersistTimer = setTimeout(function () {
      miniChromePersistTimer = 0;
      var args = miniChromePersistPending;
      miniChromePersistPending = null;
      if (!args) return;
      invoke('cmd_codex_micro_pad_set_mini_chrome', args).catch(function (err) {
        console.warn('[soft-pad] set_mini_chrome', err);
      });
    }, 120);
    return Promise.resolve();
  }

  function persistPresentation(m) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !m.id || !pad) {
      // Avoid sync full cmd_save on Soft Pad panel — that path 假死'd 返回.
      return Promise.resolve();
    }
    var presentation = pad.presentation === 'mini' ? 'mini' : 'full';
    pad.presentation = presentation;
    presentationPersistPending = {
      mappingId: String(m.id),
      presentation: presentation
    };
    if (presentationPersistTimer) clearTimeout(presentationPersistTimer);
    presentationPersistTimer = setTimeout(function () {
      presentationPersistTimer = 0;
      var args = presentationPersistPending;
      presentationPersistPending = null;
      if (!args) return;
      invoke('cmd_codex_micro_pad_set_presentation', args).catch(function (err) {
        try {
          padInvoke('cmd_app_log', {
            line: 'fe persistPresentation fail ' + (err && err.message ? err.message : 'unknown')
          });
        } catch (_) {}
        // Do NOT fall back to full persist()/cmd_save — quiet IPC is required.
      });
    }, 120);
    return Promise.resolve();
  }

  var miniPillPersistTimer = 0;
  var miniPillPersistPending = null;
  function persistMiniUsagePill(m) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !m.id || !pad) {
      return Promise.resolve();
    }
    miniPillPersistPending = {
      mappingId: String(m.id),
      enabled: miniUsagePillOnPad(pad),
      hideEmpty: miniUsagePillHideEmptyOnPad(pad)
    };
    if (miniPillPersistTimer) clearTimeout(miniPillPersistTimer);
    miniPillPersistTimer = setTimeout(function () {
      miniPillPersistTimer = 0;
      var args = miniPillPersistPending;
      miniPillPersistPending = null;
      if (!args) return;
      invoke('cmd_codex_micro_pad_set_mini_usage_pill', args).catch(function () {});
    }, 120);
    return Promise.resolve();
  }

  var skinPersistTimer = 0;
  var skinPersistPending = null;
  function persistPadSkin(m) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !m.id || !pad) {
      return Promise.resolve();
    }
    var skin = canonicalizePadSkin(pad.skin);
    pad.skin = skin;
    skinPersistPending = {
      mappingId: String(m.id),
      skin: skin
    };
    if (skinPersistTimer) clearTimeout(skinPersistTimer);
    skinPersistTimer = setTimeout(function () {
      skinPersistTimer = 0;
      var args = skinPersistPending;
      skinPersistPending = null;
      if (!args) return;
      invoke('cmd_codex_micro_pad_set_skin', args).then(function () {
        // Keep optimistic UI; quiet IPC already wrote config + pushed overlay.
      }).catch(function (err) {
        try {
          padInvoke('cmd_app_log', {
            line: 'fe persistPadSkin fail ' + (err && err.message ? err.message : 'unknown')
          });
        } catch (_) {}
        // Match persistPresentation: do NOT roll back UI (stale binary without set_skin
        // used to snap the seg control back to 默认). Toast so the user knows to rebuild.
        toast(t('softPadSkinSaveFail', '外观风格保存失败，请重新编译运行后重试'));
        // Quiet IPC only — never fall back to a full config save.
      });
    }, 120);
    return Promise.resolve();
  }

  function ensurePadManagerModal() {
    var el = document.getElementById('codexMicroPadManager');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'codexMicroPadManager';
    el.className = 'micro-hw-modal micro-hw-modal--pad-manager';
    el.hidden = true;
    el.innerHTML =
      '<div class="micro-hw-modal__card micro-hw-modal__card--pad-manager" role="dialog" aria-modal="true" aria-labelledby="codexPadMgrTitle">' +
      '<div class="micro-hw-modal__head">' +
      '<p class="micro-hw-modal__title" id="codexPadMgrTitle"></p>' +
      '<button type="button" class="micro-hw-modal__close" data-act="mgr-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="codex-pad-mgr" id="codexPadMgrBody"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) closePadManager();
    });
    return el;
  }

  function openPadManager(m) {
    if (!m) return;
    ensurePad(m, { persist: false });
    padManagerMapping = m;
    if (padUiMode !== 'edit' && padUiMode !== 'run' && padUiMode !== 'try') {
      padUiMode = 'edit';
    }
    var modal = ensurePadManagerModal();
    modal.querySelector('#codexPadMgrTitle').textContent =
      t('codexMicroPadManageTitle', '小键盘管理');
    modal.querySelector('[data-act="mgr-close"]').onclick = closePadManager;
    var body = modal.querySelector('#codexPadMgrBody');
    // Clear Soft Pad subpage host so only one #codexPadMgrPad exists.
    var panelBody = document.getElementById('softPadSubpageBody') ||
      document.getElementById('softPadMgrBody');
    if (panelBody && panelBody !== body) panelBody.replaceChildren();
    modal.hidden = false;
    renderCodexMicroPadManager({
      container: body,
      mode: 'modal',
      mapping: m
    });
  }

  function closePadManager() {
    stopTryKeyListener();
    padManagerMapping = null;
    padUiMode = 'edit';
    var modal = document.getElementById('codexMicroPadManager');
    if (modal) modal.hidden = true;
    var more = document.getElementById('codexPadMgrMore');
    if (more) more.hidden = true;
    if (padManagerMode === 'modal') {
      padManagerContainer = null;
      padManagerMode = 'modal';
    }
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    var Cap = global.OneToneAgentCapabilityUi;
    var cur = Cap && Cap.activeCodexMapping ? Cap.activeCodexMapping() : null;
    // Soft remount — skip ensure_ready (sync save under modal close used to 假死).
    if (targetHost && !targetHost.hidden && cur) renderTarget(targetHost, cur, { skipEnsure: true });
  }

  function isPadManagerOpen() {
    if (padManagerMode === 'panel' && padManagerMapping && padManagerContainer && padManagerContainer.isConnected) {
      return softPadPanelActive();
    }
    var modal = document.getElementById('codexMicroPadManager');
    return !!(modal && !modal.hidden && padManagerMapping);
  }

  /** Soft Pad page preview host — visual anchor above function tiles. */
  var softPadPreviewMapping = null;
  /** Last key focused in hub layout editor (persists across preview remounts). */
  var softPadLayoutFocusKeyId = '';

  function softPadPreviewOnLayout() {
    var Hub = global.OneToneSoftPadHub;
    return !!(softPadPanelActive() && Hub && typeof Hub.getView === 'function' && Hub.getView() === 'layout');
  }

  function ensureSoftPadPreviewDelegate(host) {
    if (!host || host.getAttribute('data-soft-pad-preview-delegate') === '1') return;
    host.setAttribute('data-soft-pad-preview-delegate', '1');
    host.addEventListener('click', function (ev) {
      var outerPrev = document.getElementById('softPadPreviewHost');
      var modePrev = outerPrev && outerPrev.getAttribute('data-pad-mode-preview');
      // appear/purpose left column is visual (scene / live skin / demos) — don't run keys edit path.
      if (modePrev === 'appear' || modePrev === 'purpose') return;
      var m = softPadPreviewMapping;
      if (!m || !m.codexMicroPad) return;
      var modeSw = ev.target.closest && ev.target.closest('[data-act="pad-mode"]');
      if (modeSw && host.contains(modeSw)) {
        ev.preventDefault();
        ev.stopPropagation();
        if (modeSw._padModeBusy) return;
        modeSw._padModeBusy = true;
        setTimeout(function () { modeSw._padModeBusy = false; }, 280);
        var pad = m.codexMicroPad;
        pad.enabled = !pad.enabled;
        if (pad.enabled) pad.overlayEnabled = true;
        previewPadMode = pad.enabled ? 'codex' : 'numpad';
        persistPadFlags(m);
        toast(pad.enabled
          ? t('codexMicroPadModeCodex', '虚拟键盘模式')
          : t('codexMicroPadModeNumpad', '数字键模式'));
        if (!remountSoftPadPreviewShell(host, m)) {
          renderSoftPadPreview(host, m, { forceFull: true });
        }
        notifyLinkedUi(m);
        if (pad.enabled) fireMicroKey(m, 'ENC', 'down');
        return;
      }
      var navEl = ev.target.closest && ev.target.closest('[data-nav]');
      if (navEl && host.contains(navEl)) {
        ev.preventDefault();
        ev.stopPropagation();
        var nav = navEl.getAttribute('data-nav');
        if (nav) softPadPreviewEditKey(m, nav);
        return;
      }
      var keyEl = ev.target.closest && ev.target.closest('.micro-hw__key[data-micro-key]');
      if (!keyEl || !host.contains(keyEl)) return;
      if (keyEl.classList.contains('micro-hw__key--placeholder')) return;
      var id = keyEl.getAttribute('data-micro-key');
      if (!id || id === 'JOY') return;
      ev.preventDefault();
      ev.stopPropagation();
      softPadPreviewEditKey(m, id);
    });
  }

  /** Preview key →「改按键」左预览 + 右栏场景目录内嵌表单并快速定位。 */
  function softPadPreviewEditKey(m, microKeyId) {
    markSoftPadPreviewFocus(microKeyId);
    var Hub = global.OneToneSoftPadHub;
    if (Hub && typeof Hub.isLandLocked === 'function' && Hub.isLandLocked()) {
      return;
    }
    function openLayoutEditor() {
      revealCommonsLayoutForKey(m);
      var host = softPadLayoutEditorHost();
      if (host) {
        renderEditKeycapEditor(host, m, microKeyId, {
          mode: 'inline',
          onSaved: function (mm) {
            refreshLayoutActionLibrary(mm || m);
          }
        });
        return;
      }
      // Host still mounting — one short retry, never open capability modal.
      requestAnimationFrame(function () {
        setTimeout(function () {
          revealCommonsLayoutForKey(m);
          var host2 = softPadLayoutEditorHost();
          if (!host2) return;
          renderEditKeycapEditor(host2, m, microKeyId, {
            mode: 'inline',
            onSaved: function (mm) {
              refreshLayoutActionLibrary(mm || m);
            }
          });
        }, 80);
      });
    }
    if (softPadPreviewOnLayout()) {
      openLayoutEditor();
      return;
    }
    if (Hub && typeof Hub.openSubpage === 'function') {
      Hub.openSubpage('layout', { fromUser: true, keyId: microKeyId });
      requestAnimationFrame(function () {
        setTimeout(openLayoutEditor, 48);
      });
    }
  }

  function setSoftPadPreviewCaption(host, name, chord) {
    if (!host) return;
    var cap = host.querySelector('[data-soft-pad-caption]');
    if (!cap) return;
    var nameEl = cap.querySelector('[data-cap-name]');
    var chordEl = cap.querySelector('[data-cap-chord]');
    var n = String(name || '').trim();
    var c = String(chord || '').trim();
    if (nameEl) {
      nameEl.textContent = n || t('softPadKeyCaptionIdle', '悬停或点按键查看名称');
    }
    if (chordEl) {
      chordEl.textContent = c;
      chordEl.hidden = !c;
    }
    cap.classList.toggle('is-active', !!n);
  }

  function bindSoftPadPreviewCaption(host) {
    if (!host || host.__softPadCaptionBound) return;
    host.__softPadCaptionBound = true;
    host.addEventListener('pointerover', function (ev) {
      var keyEl = ev.target && ev.target.closest && ev.target.closest('.micro-hw__key[data-micro-key]');
      if (!keyEl || !host.contains(keyEl)) return;
      setSoftPadPreviewCaption(
        host,
        keyEl.getAttribute('data-cap-name') || keyEl.getAttribute('aria-label') || '',
        keyEl.getAttribute('data-cap-chord') || ''
      );
    });
    host.addEventListener('pointerout', function (ev) {
      var to = ev.relatedTarget;
      if (to && host.contains(to) && to.closest && to.closest('.micro-hw__key[data-micro-key]')) return;
      var focused = host.querySelector('.micro-hw__key.is-focused[data-micro-key]');
      if (focused) {
        setSoftPadPreviewCaption(
          host,
          focused.getAttribute('data-cap-name') || focused.getAttribute('aria-label') || '',
          focused.getAttribute('data-cap-chord') || ''
        );
        return;
      }
      setSoftPadPreviewCaption(host, '', '');
    });
  }

  function resolveSoftPadPreviewPaintHost(preferred) {
    // Face hosts (agent / timeline) own their own preview — do not redirect to pad island.
    if (preferred && preferred.id && preferred.id !== 'softPadPreviewHost') {
      var facePaint = preferred.querySelector('[data-soft-pad-preview-paint]');
      return facePaint || preferred;
    }
    var outer = document.getElementById('softPadPreviewHost');
    if (!outer) return preferred || null;
    var paint = outer.querySelector('[data-soft-pad-preview-paint]');
    if (paint) return paint;
    if (preferred && (preferred === outer || (outer.contains && outer.contains(preferred)))) {
      return preferred;
    }
    return outer;
  }

  function remountSoftPadPreviewShell(host, m) {
    host = resolveSoftPadPreviewPaintHost(host);
    if (!host || !m) return false;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    if (!pad) return false;
    softPadPreviewMapping = m;
    ensureSoftPadPreviewDelegate(host);
    var root = host.querySelector('.codex-micro-pad.soft-pad-preview');
    if (!root) return false;
    root.setAttribute('data-pad-skin', canonicalizePadSkin(pad.skin));
    var oldWrap = root.querySelector('.micro-hw-wrap') || root.querySelector('.micro-hw-shell');
    if (!oldWrap || !oldWrap.parentNode) return false;
    var n = countBound(pad);
    var on = !!pad.enabled;
    var titleEl = root.querySelector('.codex-micro-pad__title');
    if (titleEl) titleEl.textContent = softPadPreviewMainTitle(m);
    var statusEl = root.querySelector('.codex-micro-pad__status');
    if (statusEl) {
      statusEl.textContent = on
        ? t('codexMicroPadStatusOn', '已开启 · 已绑定 {n} 个键').replace('{n}', String(n))
        : t('codexMicroPadStatusOff', '已关闭');
    }
    var hintEl = root.querySelector('.soft-pad-preview__hint');
    var onLayout = softPadPreviewOnLayout();
    if (hintEl) {
      hintEl.textContent = onLayout
        ? t('softPadPreviewTapHint', '蓝框=正在编辑 · 点其它键可切换')
        : t('softPadPreviewBrowseHint', '点按键可去「改按键」编辑');
      hintEl.hidden = false;
    }
    if (!root.querySelector('[data-soft-pad-caption]')) {
      var cap = document.createElement('div');
      cap.className = 'soft-pad-key-caption';
      cap.setAttribute('data-soft-pad-caption', '');
      cap.setAttribute('aria-live', 'polite');
      cap.innerHTML =
        '<span class="soft-pad-key-caption__name" data-cap-name></span>' +
        '<span class="soft-pad-key-caption__chord" data-cap-chord hidden></span>';
      if (hintEl && hintEl.parentNode) hintEl.parentNode.insertBefore(cap, hintEl);
      else oldWrap.parentNode.appendChild(cap);
    }
    var tmp = document.createElement('div');
    tmp.innerHTML = renderHardwarePad(m, pad, { mode: 'softPad' });
    var next = tmp.firstChild;
    if (!next) return false;
    oldWrap.parentNode.replaceChild(next, oldWrap);
    markSoftPadPreviewFocus(onLayout
      ? (softPadLayoutFocusKeyId || (editDraft && editDraft.microKeyId) || '')
      : '');
    bindSoftPadPreviewCaption(host);
    var focused = host.querySelector('.micro-hw__key.is-focused[data-micro-key]');
    if (focused) {
      setSoftPadPreviewCaption(
        host,
        focused.getAttribute('data-cap-name') || focused.getAttribute('aria-label') || '',
        focused.getAttribute('data-cap-chord') || ''
      );
    } else {
      setSoftPadPreviewCaption(host, '', '');
    }
    return true;
  }

  /** Read-only 5×5 grid for homepage Hero pane — no hub interaction. */
  var HERO_PAD_HIDDEN_KEYS = { ACT10: 1, ACT06: 1, ACT07: 1 };
  var HERO_PAD_HOT_KEYS = { ACT10: 1, AG04: 1, ACT08: 1 };

  function renderHeroPadPreviewGrid(host, opts) {
    opts = opts || {};
    if (!host) return;
    var sel = String(opts.selId || '');
    var hot = String(opts.hotMicroKeyId || '');
    var live = !!opts.live;
    var voiceHint = String(opts.voiceHint || '').trim();
    var m = opts.mapping;
    var agentHi = ['bind', 'scheme', 'status'].indexOf(sel) >= 0;
    var padHtml = '';

    if (m && m.codexMicroPad) {
      ensurePad(m, { persist: false });
      var pad = m.codexMicroPad;
      var prevHot = activeHighlightId;
      var prevPreview = previewPadMode;
      activeHighlightId = live && hot ? hot : '';
      previewPadMode = pad.enabled ? 'codex' : 'numpad';
      padHtml = renderHardwarePad(m, pad, { mode: 'preview', omitFaceTopbar: false });
      activeHighlightId = prevHot;
      previewPadMode = prevPreview;
    } else {
      var cells = (LAYOUT && LAYOUT.cells) || [];
      var gridHtml = cells.map(function (c) {
        var cls = 'micro-hw__key micro-hw__key--' + (c.kind || 'command');
        if (c.kind === 'agent') cls += ' micro-hw__key--agent';
        if (c.kind === 'nav') cls += ' micro-hw__key--nav';
        if (c.gridColSpan === 2) cls += ' micro-hw__key--span2';
        if (c.gridRowSpan === 2) cls += ' micro-hw__key--rowspan2';
        if (HERO_PAD_HOT_KEYS[c.microKeyId]) cls += ' is-feature';
        if (sel === c.microKeyId) cls += ' is-focused is-sel';
        if (agentHi && c.kind === 'agent') cls += ' is-agent-hi';
        if (live && c.microKeyId === hot) cls += ' is-live is-pressed';
        if (HERO_PAD_HIDDEN_KEYS[c.microKeyId]) cls += ' is-route-disabled';
        else if (!live && c.kind === 'nav') cls += ' is-dim';
        var style = 'grid-row:' + c.gridRow + (c.gridRowSpan ? ' / span ' + c.gridRowSpan : '') +
          ';grid-column:' + c.gridCol + (c.gridColSpan ? ' / span ' + c.gridColSpan : '') + ';';
        return '<button type="button" class="' + cls + '" style="' + style + '" data-node-id="' +
          esc(c.microKeyId) + '" aria-label="' + esc(cellLabel(c)) + '">' + esc(cellLabel(c)) + '</button>';
      }).join('');
      padHtml =
        '<div class="micro-hw-wrap">' +
        '<div class="micro-hw-shell is-mode-codex">' +
        '<div class="micro-hw"><div class="micro-hw__face">' +
        '<div class="micro-hw__grid">' + gridHtml + '</div></div></div></div></div>';
    }

    var hintHtml = voiceHint
      ? '<div class="wb-hero-pad-voice-hint" aria-live="polite">' + esc(voiceHint) + '</div>'
      : '';
    host.innerHTML = '<div class="wb-hero-pad-preview">' + padHtml + '</div>';
    if (voiceHint) {
      var face = host.querySelector('.micro-hw__face');
      if (face) face.insertAdjacentHTML('beforeend', hintHtml);
    }

    if (sel) {
      host.querySelectorAll('[data-node-id="' + sel + '"], [data-micro-key="' + sel + '"]').forEach(function (el) {
        el.classList.add('is-sel', 'is-focused');
      });
    }
    if (live && hot) {
      host.querySelectorAll('[data-micro-key="' + hot + '"], [data-node-id="' + hot + '"]').forEach(function (el) {
        el.classList.add('is-live', 'is-pressed');
      });
    }
  }

  function renderSoftPadPreview(host, m, opts) {
    opts = opts || {};
    host = resolveSoftPadPreviewPaintHost(host);
    if (!host) return;
    var handoff = !!(host.getAttribute && host.getAttribute('data-soft-pad-preview-paint') != null
      && host.hasAttribute('data-soft-pad-preview-paint'));
    if (!m) {
      softPadPreviewMapping = null;
      host.innerHTML = '';
      // paint-target handoff：外层 #softPadPreviewHost.hidden 由岛 sync 管
      if (!handoff) host.hidden = true;
      return;
    }
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var n = countBound(pad);
    var on = pad && pad.enabled;
    previewPadMode = on ? 'codex' : 'numpad';
    softPadPreviewMapping = m;
    ensureSoftPadPreviewDelegate(host);
    if (!handoff) host.hidden = false;
    var outerClear = document.getElementById('softPadPreviewHost');
    if (outerClear) outerClear.removeAttribute('data-pad-mode-preview');
    if (!opts.forceFull && remountSoftPadPreviewShell(host, m)) {
      applySoftPadPendingNav(m);
      return;
    }
    var skin = canonicalizePadSkin(pad && pad.skin);
    var omitFaceTopbar = false;
    try {
      var HubFace = global.OneToneSoftPadHub;
      // Merged Soft Pad: lights/mini report as agent via getSoftPadFace.
      if (HubFace && HubFace.getSoftPadFace && HubFace.getSoftPadFace() === 'agent') {
        omitFaceTopbar = true;
      } else if (HubFace && HubFace.getFace && HubFace.getFace() === 'agent') {
        omitFaceTopbar = true;
      }
    } catch (_) {}
    // Leaving appear/purpose: drop leftover lights chrome on outer host.
    try {
      var outerPrev = document.getElementById('softPadPreviewHost');
      if (outerPrev) {
        outerPrev.removeAttribute('data-pad-mode-preview');
        if (!omitFaceTopbar) clearStatusLightsPreviewChrome(outerPrev);
      }
    } catch (_) {}
    host.innerHTML =
      '<div class="codex-micro-pad soft-pad-preview" data-pad-skin="' + esc(skin) + '">' +
      '<div class="codex-micro-pad__head">' +
      '<p class="codex-micro-pad__title">' + esc(softPadPreviewMainTitle(m)) + '</p>' +
      '<span class="codex-micro-pad__status">' +
      esc(on
        ? t('codexMicroPadStatusOn', '已开启 · 已绑定 {n} 个键').replace('{n}', String(n))
        : t('codexMicroPadStatusOff', '已关闭')) +
      '</span></div>' +
      renderHardwarePad(m, pad, { mode: 'softPad', omitFaceTopbar: omitFaceTopbar }) +
      '<div class="soft-pad-key-caption" data-soft-pad-caption aria-live="polite">' +
      '<span class="soft-pad-key-caption__name" data-cap-name>' +
      esc(t('softPadKeyCaptionIdle', '悬停或点按键查看名称')) + '</span>' +
      '<span class="soft-pad-key-caption__chord" data-cap-chord hidden></span>' +
      '</div>' +
      '<p class="soft-pad-preview__hint codex-pad-mgr__hint">' +
      esc(softPadPreviewOnLayout()
        ? t('softPadPreviewTapHint', '蓝框=正在编辑 · 点其它键可切换')
        : t('softPadPreviewBrowseHint', '点按键可去「改按键」编辑')) +
      '</p></div>';
    markSoftPadPreviewFocus(softPadPreviewOnLayout()
      ? (softPadLayoutFocusKeyId || (editDraft && editDraft.microKeyId) || '')
      : '');
    bindSoftPadPreviewCaption(host);
    applySoftPadPendingNav(m);
    if (omitFaceTopbar) {
      try {
        syncStatusLightsPreviewChrome(
          document.getElementById('softPadPreviewHost') || host,
          m,
          pad,
          workbenchPreviewOpts()
        );
      } catch (_) {}
    }
  }

  function softPadPanelChanged(m, opts) {
    if (opts && typeof opts.onChanged === 'function') {
      try { opts.onChanged(m, opts.panel || null, opts); } catch (_) {}
      applySoftPadPendingNav(m);
      return;
    }
    notifyLinkedUi(m);
    applySoftPadPendingNav(m);
  }

  function applySoftPadPendingNav(m) {
    var nav = global.OneToneActionNav;
    if (!nav || !nav.peekPendingNav || !nav.consumePendingNav) return;
    var pending = nav.peekPendingNav();
    if (!pending || pending.channel !== 'softPad') return;
    if (m && m.id && pending.mappingId && pending.mappingId !== m.id) return;
    pending = nav.consumePendingNav();
    if (!pending || !pending.actionId) return;
    var mapping = m;
    if (!mapping || mapping.id !== pending.mappingId) {
      var st = global.OneToneState || {};
      var cfg = st.cfg || st.config;
      var list = (cfg && cfg.mappings) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === pending.mappingId) {
          mapping = list[i];
          break;
        }
      }
    }
    if (!mapping) return;
    setTimeout(function () {
      var keyId = (pending.bindingRef && String(pending.bindingRef).indexOf('semantic:') !== 0)
        ? pending.bindingRef
        : 'F1';
      // Prefill: Soft Pad → inline form; elsewhere keycap editor + optional semantic picker.
      if (softPadPanelActive()) {
        softPadPreviewEditKey(mapping, keyId);
        return;
      }
      if (typeof openEditKeycap === 'function') {
        openEditKeycap(mapping, keyId, { mode: 'modal' });
      }
      if (global.OneToneSemanticActionPicker) {
        global.OneToneSemanticActionPicker.open({
          mappingId: mapping.id,
          channel: 'softPad',
          placement: 'softPad',
          currentActionId: pending.actionId,
          onSelect: function (sel) {
            if (!sel || !sel.actionId) return;
            var adapters = global.OneToneActionBindingAdapters;
            if (adapters && adapters.softPad) {
              adapters.softPad
                .upsert(mapping.id, sel.actionId, { microKeyId: keyId }, null)
                .then(function (res) {
                  if (editDraft) {
                    editDraft.slotId = (res && res.slotId) ||
                      ('semantic:softPad:' + sel.actionId);
                    commitEditKeycapDraft({ keepOpen: true, quiet: true });
                  }
                })
                .catch(function (err) {
                  toast(String(err && err.message ? err.message : err));
                });
            }
          }
        });
      }
    }, 0);
  }

  /** Layout subpage — tools idle + inline editor host; no profile/enhance UI. */
  function resolveSoftPadSubpagePaintHost(preferred) {
    // Agent face paints into #softPadAgentBody — never redirect to pad face island.
    if (preferred && preferred.id === 'softPadAgentBody') {
      var agentPaint = preferred.querySelector('[data-soft-pad-subpage-paint]');
      return agentPaint || preferred;
    }
    var outer = document.getElementById('softPadSubpageBody');
    if (!outer) return preferred || null;
    var paint = outer.querySelector('[data-soft-pad-subpage-paint]');
    if (paint) return paint;
    if (preferred && (preferred === outer || (outer.contains && outer.contains(preferred)))) {
      return preferred;
    }
    return outer;
  }

  /** CSS / softPadLayoutEditorHost 读外层 #softPadSubpageBody 上的 panel 属性。 */
  function mirrorSoftPadSubpageChrome(from) {
    var outer = document.getElementById('softPadSubpageBody');
    if (!outer || !from || from === outer) return;
    var panel = from.getAttribute('data-soft-pad-panel');
    var mapping = from.getAttribute('data-soft-pad-mapping');
    var token = from.getAttribute('data-agent-load-token');
    if (panel) outer.setAttribute('data-soft-pad-panel', panel);
    else outer.removeAttribute('data-soft-pad-panel');
    if (mapping) outer.setAttribute('data-soft-pad-mapping', mapping);
    else outer.removeAttribute('data-soft-pad-mapping');
    if (token != null) outer.setAttribute('data-agent-load-token', token);
    else outer.removeAttribute('data-agent-load-token');
    outer.classList.toggle('is-editing-key', from.classList.contains('is-editing-key'));
  }

  function softPadExperienceChrome(panelId, m) {
    var Hub = global.OneToneSoftPadHub;
    if (!Hub || typeof Hub.softPadPanelExperienceHtml !== 'function') return '';
    try {
      var entry = m && m.id
        ? { mapping: m, padEnabled: !!(m.codexMicroPad && m.codexMicroPad.enabled) }
        : undefined;
      return Hub.softPadPanelExperienceHtml(panelId, entry) || '';
    } catch (_) {
      return '';
    }
  }

  function softPadLayoutKeyMeta(m, microKeyId) {
    var pad = m && m.codexMicroPad;
    var cell = cellByMicroId(microKeyId);
    var route = routeForMicroKey(pad, microKeyId);
    var isNav = isNavMicroKey(microKeyId);
    var name = cell ? cellLabel(cell) : humanMicroKeyLabel(microKeyId);
    var chord = '';
    var effect = '';
    if (microKeyId === 'ENC') {
      name = t('codexMicroPadModeCodex', '虚拟键盘模式');
      chord = pad && pad.enabled ? 'ON' : 'OFF';
      effect = t('softPadLayoutEncEffect', '点此键切换数字键盘 ⇄ Soft Pad。');
    } else if (isNav) {
      chord = route && route.slotId
        ? friendlyChord(chordForSlot(m, route.slotId))
        : t('codexMicroPadNavDefault', '默认注入方向键');
      effect = route && route.slotId
        ? slotEffectTip(route.slotId, slotLabel(route.slotId), m)
        : t('softPadLayoutNavEffect', '未绑定时注入系统方向键。');
    } else if (route && route.enabled && route.slotId) {
      var layoutCap = softPadKeyCaption(m, route.slotId, name);
      name = layoutCap.name;
      chord = layoutCap.chord;
      effect = slotEffectTip(route.slotId, name, m);
    } else {
      chord = t('codexMicroPadUnbound', '未配置');
      effect = t('softPadLayoutUnboundEffect', '点「修改这个键」选择按下后要做的事。');
    }
    return {
      name: name,
      chord: chord,
      effect: effect,
      iconId: microKeyId === 'ENC' ? 'power' : resolveIconId(route, microKeyId),
      bound: !!(route && route.enabled && route.slotId) || isNav || microKeyId === 'ENC',
      kind: (cell && cell.kind) || 'command'
    };
  }

  function layoutSlotLabel(m, slotId) {
    slotId = String(slotId || '').trim();
    if (!slotId) return '';
    var opts = allSlotOptions(m);
    var i;
    for (i = 0; i < opts.length; i++) {
      if (String(opts[i].id || '') === slotId) return opts[i].label || slotId;
    }
    return slotLabel(slotId, m) || slotId;
  }

  function cursorSlotGroupLabel(g) {
    if (!g) return '';
    return lang().indexOf('en') === 0 ? (g.labelEn || g.labelZh) : (g.labelZh || g.labelEn);
  }

  function cursorSlotGroupDesc(g) {
    if (!g) return '';
    return lang().indexOf('en') === 0 ? (g.descEn || g.descZh || '') : (g.descZh || g.descEn || '');
  }

  /** Short rail label for Directory D (first phrase before顿号/comma). */
  function cursorSlotGroupRailLabel(g) {
    var full = cursorSlotGroupLabel(g);
    var cut = String(full || '').split(/[、，,/]/)[0].trim();
    return cut || full;
  }

  function defaultCursorCommonSlots() {
    return CURSOR_COMMON_DEFAULT_SLOTS.slice();
  }

  function isCursorCommonDefaultSlot(slotId) {
    return CURSOR_COMMON_DEFAULT_SLOTS.indexOf(String(slotId || '')) >= 0;
  }

  function isCursorCustomSlotId(slotId) {
    var id = String(slotId || '').trim();
    return id.indexOf('custom_') === 0 && id.length > 7;
  }

  function getCustomShortcuts(pad) {
    if (!pad || !Array.isArray(pad.customShortcuts)) return [];
    return pad.customShortcuts.filter(function (c) {
      return c && isCursorCustomSlotId(c.id);
    });
  }

  function findCustomShortcut(pad, slotId) {
    var id = String(slotId || '').trim();
    var list = getCustomShortcuts(pad);
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id || '') === id) return list[i];
    }
    return null;
  }

  function isAllowedCommonSlotId(pad, slotId) {
    var id = String(slotId || '').trim();
    if (!id) return false;
    if (CURSOR_SOFT_PAD_SLOT_IDS[id]) return true;
    return isCursorCustomSlotId(id) && !!findCustomShortcut(pad, id);
  }

  function normalizeBrowseChannel(ch) {
    var s = String(ch || '').trim();
    if (s === 'key' || s === 'keys') return 'key';
    if (s === 'voice' || s === 'voiceWake') return 'voice';
    if (s === 'camera' || s === 'cam' || s === 'gesture') return 'camera';
    if (s === 'softPad' || s === 'softpad' || s === 'soft_pad') return 'softPad';
    return s;
  }

  /** Map semantic actionId → Soft Pad-bindable slotId (skip camera.local.*). */
  function softPadSlotIdForActionId(m, actionId) {
    var aid = String(actionId || '').trim();
    if (aid.indexOf('agent:') === 0) aid = aid.slice(6).trim();
    if (!aid || aid.indexOf('camera.local.') === 0) return '';
    var pad = m && m.codexMicroPad;
    var A = agent();
    if (A && Array.isArray(A.SLOTS)) {
      for (var i = 0; i < A.SLOTS.length; i++) {
        var s = A.SLOTS[i];
        if (!s) continue;
        var slotAid = String(s.actionId || '').trim();
        if (slotAid.indexOf('agent:') === 0) slotAid = slotAid.slice(6).trim();
        if (slotAid !== aid) continue;
        var sid = String(s.slotId || '').trim();
        if (isAllowedCommonSlotId(pad, sid)) return sid;
      }
    }
    var binds = (m && m.agentBindings) || [];
    for (var j = 0; j < binds.length; j++) {
      var b = binds[j];
      if (!b) continue;
      var bAid = String(b.actionId || '').trim();
      if (bAid.indexOf('agent:') === 0) bAid = bAid.slice(6).trim();
      if (bAid !== aid) continue;
      var id = String(b.slotId || '').trim();
      if (isAllowedCommonSlotId(pad, id)) return id;
    }
    return '';
  }

  // Soft Pad 手势通道：与摄像头设置同一套手势键（应用已选动作）。
  var SOFT_PAD_CAMERA_GESTURES = [
    { ref: 'onAway', actionKey: 'onAway', zh: '离开座位', en: 'Away' },
    { ref: 'onReturn', actionKey: 'onReturn', zh: '回到座位', en: 'Return' },
    { ref: 'shakeHead', actionKey: 'shakeHead', zh: '摇头', en: 'Shake head' },
    { ref: 'deliberateBlink', actionKey: 'deliberateBlink', zh: '刻意眨眼', en: 'Deliberate blink' },
    { ref: 'openPalm', actionKey: 'openPalm', zh: '张开手掌', en: 'Open palm' },
    { ref: 'okHand', actionKey: 'okHand', zh: 'OK 手势', en: 'OK hand' },
    { ref: 'fist', actionKey: 'fist', zh: '握拳', en: 'Fist' },
    { ref: 'wave', actionKey: 'wave', zh: '挥手', en: 'Wave' }
  ];

  function softPadAppConfig() {
    return (
      (global.OneToneState &&
        global.OneToneState.state &&
        global.OneToneState.state.config) ||
      {}
    );
  }

  function cameraActionHasPick(token) {
    var s = String(token || '').trim();
    return !!(s && s !== 'none');
  }

  function cameraMappingHasPicks(m) {
    if (!m) return false;
    var ov = m.cameraOverride || m.camera_override;
    if (!ov || typeof ov !== 'object') return false;
    var i;
    for (i = 0; i < SOFT_PAD_CAMERA_GESTURES.length; i++) {
      if (cameraActionHasPick(ov[SOFT_PAD_CAMERA_GESTURES[i].actionKey])) return true;
    }
    return false;
  }

  function cameraTokenToActionId(token) {
    var s = String(token || '').trim();
    if (!s || s === 'none') return '';
    if (s.indexOf('agent:') === 0) return s.slice(6).trim();
    if (s.indexOf('camera.local.') === 0) return s;
    if (
      s === 'pressEsc' ||
      s === 'pressCtrlI' ||
      s === 'pauseVoice' ||
      s === 'resumeVoice' ||
      s === 'privacyScreen' ||
      s === 'lowPowerMode'
    ) {
      return 'camera.local.' + s;
    }
    return s;
  }

  function cameraActionDisplayName(token, actionId) {
    var aid = String(actionId || cameraTokenToActionId(token) || '').trim();
    var store = global.OneToneSemanticActionStore;
    if (store && typeof store.entryMeta === 'function') {
      try {
        var meta = store.entryMeta(aid);
        if (meta) {
          var lab =
            lang().indexOf('en') === 0
              ? meta.labelEn || meta.label || meta.labelZh
              : meta.labelZh || meta.label || meta.labelEn;
          if (lab) return String(lab);
        }
      } catch (_) {}
    }
    var A = agent();
    if (A && typeof A.actionById === 'function') {
      try {
        var act = A.actionById(aid);
        if (act && (act.label || act.name)) return String(act.label || act.name);
      } catch (_) {}
    }
    var locals = {
      'camera.local.pressEsc': t('cameraPresenceActionEsc', '语音取消'),
      'camera.local.pressCtrlI': t('cameraPresenceActionCtrlI', '唤起输入'),
      'camera.local.pauseVoice': t('cameraPresenceActionPauseVoice', '暂停听写'),
      'camera.local.resumeVoice': t('cameraPresenceActionResumeVoice', '继续听写'),
      'camera.local.privacyScreen': t('cameraPresenceActionPrivacy', '隐私遮罩'),
      'camera.local.lowPowerMode': t('cameraPresenceActionLowPower', '低功耗')
    };
    if (locals[aid]) return locals[aid];
    return String(token || aid || '').replace(/^agent:/, '') || '—';
  }

  function effectiveCameraActionToken(srcM, actionKey) {
    var base =
      ((softPadAppConfig().cameraPrefs || softPadAppConfig().camera_prefs || {})
        .presenceActions ||
        (softPadAppConfig().cameraPrefs || {}).presence_actions ||
        {}) || {};
    var ov =
      (srcM && (srcM.cameraOverride || srcM.camera_override)) || {};
    if (ov[actionKey] != null && String(ov[actionKey]).trim() !== '') {
      return String(ov[actionKey]).trim();
    }
    return String(base[actionKey] || '').trim() || 'none';
  }

  /** Prefer Soft Pad mapping's real camera picks; else same-app mapping that owns them. */
  function resolveCameraConfigMapping(softPadM) {
    if (!softPadM) return null;
    if (cameraMappingHasPicks(softPadM)) return softPadM;
    var appId = String(softPadM.appTargetId || '').trim();
    var maps = softPadAppConfig().mappings || [];
    if (!Array.isArray(maps)) return softPadM;
    var bestPick = null;
    var bestInherit = null;
    var i;
    for (i = 0; i < maps.length; i++) {
      var x = maps[i];
      if (!x) continue;
      if (appId && String(x.appTargetId || '').trim() !== appId) continue;
      if (cameraMappingHasPicks(x)) {
        if (String(x.id || '') === String(softPadM.id || '')) return x;
        bestPick = bestPick || x;
        continue;
      }
      // Blank cameraOverride blocks global presence projection — prefer a peer without override.
      if (!(x.cameraOverride || x.camera_override)) {
        bestInherit = bestInherit || x;
      }
    }
    if (bestPick) return bestPick;
    if (!(softPadM.cameraOverride || softPadM.camera_override)) return softPadM;
    return bestInherit || softPadM;
  }

  /**
   * Soft Pad「手势」列表：当前应用（如 Cursor）摄像头里用户已选好的动作。
   * 不读通用手势目录；本地 camera.local.* 也会列出，但只有 Soft Pad 能跑的才可绑。
   */
  function collectAppSelectedCameraRows(m) {
    var rows = [];
    if (!m) return rows;
    var src = resolveCameraConfigMapping(m) || m;
    var Picker = layoutChannelPicker();
    var q = String(layoutChannelQuery || '').trim().toLowerCase();
    var i;
    for (i = 0; i < SOFT_PAD_CAMERA_GESTURES.length; i++) {
      var g = SOFT_PAD_CAMERA_GESTURES[i];
      var token = effectiveCameraActionToken(src, g.actionKey);
      if (!cameraActionHasPick(token)) continue;
      var actionId = cameraTokenToActionId(token);
      if (!actionId) continue;
      var slotId = softPadSlotIdForActionId(m, actionId);
      var name = slotId
        ? slotLabel(slotId, m) || cameraActionDisplayName(token, actionId)
        : cameraActionDisplayName(token, actionId);
      var note =
        Picker && typeof Picker.gestureLabel === 'function'
          ? Picker.gestureLabel(g.ref)
          : lang().indexOf('en') === 0
            ? g.en
            : g.zh;
      var hay = (name + ' ' + note + ' ' + slotId + ' ' + actionId + ' ' + g.ref).toLowerCase();
      if (q && hay.indexOf(q) < 0) continue;
      rows.push({
        channel: 'camera',
        slotId: slotId,
        name: name,
        note: note,
        blurb: '',
        actionId: actionId,
        bindingRef: g.ref,
        bindable: !!slotId
      });
    }
    return rows;
  }

  function layoutConfiguredCameraRows(m) {
    return collectAppSelectedCameraRows(m);
  }

  /**
   * Same-app commands already defined on other channels (not Soft Pad).
   * Only rows Soft Pad can bind (allowlisted / custom_* slots).
   */
  function collectSoftPadOtherChannelRows(m, views) {
    var rows = [];
    var seen = {};
    var pad = m && m.codexMicroPad;
    var Picker = layoutChannelPicker();

    function pushRow(ch, slotId, note, blurb, extra) {
      ch = normalizeBrowseChannel(ch);
      slotId = String(slotId || '').trim();
      if (!slotId || !isAllowedCommonSlotId(pad, slotId)) return;
      if (ch !== 'key' && ch !== 'voice' && ch !== 'camera' && ch !== 'ime') return;
      note = String(note || '').trim();
      var dedupe = ch + '::' + slotId + '::' + note;
      if (seen[dedupe]) return;
      seen[dedupe] = 1;
      var name = '';
      if (extra && extra.name) {
        name = String(extra.name);
      } else if (isCursorCustomSlotId(slotId)) {
        var cs = findCustomShortcut(pad, slotId);
        name = cs && cs.name ? String(cs.name) : slotId;
      } else {
        name = slotLabel(slotId, m) || slotId;
      }
      rows.push({
        channel: ch,
        slotId: slotId,
        name: name,
        note: note,
        blurb: String(blurb || slotEffectTip(slotId, name, m) || '').trim(),
        actionId: extra && extra.actionId ? String(extra.actionId) : '',
        bindingRef: extra && extra.bindingRef ? String(extra.bindingRef) : ''
      });
    }

    (views || []).forEach(function (v) {
      if (!v || v.enabled === false) return;
      var ch = normalizeBrowseChannel(v.channel);
      if (ch === 'softPad' || ch === 'cursor') return;
      var trig = String(v.trigger || v.bindingRef || v.binding_ref || '').trim();
      var ref = String(v.bindingRef || v.binding_ref || '').trim();
      var aid = String(v.actionId || v.action_id || '').trim();
      var slotId = '';
      var note = trig;
      var extra = { actionId: aid, bindingRef: ref };
      if (ch === 'key' || ch === 'voice') {
        slotId = ref;
        if (ch === 'key') note = friendlyChord(trig) || trig;
        else if (trig) {
          note = lang().indexOf('en') === 0 ? ('Phrase “' + trig + '”') : ('口令「' + trig + '」');
        }
      } else if (ch === 'camera') {
        // Soft Pad only lists gestures that already have a Soft Pad-bindable action
        // (user-selected on Camera for this app) — never empty common fillers.
        if (!aid || aid.indexOf('camera.local.') === 0) return;
        slotId = softPadSlotIdForActionId(m, aid);
        if (!slotId) return;
        var gLab =
          Picker && typeof Picker.gestureLabel === 'function'
            ? Picker.gestureLabel(ref || trig)
            : '';
        note = gLab || trig || t('keysChannelGesture', '手势');
        extra.name = slotLabel(slotId, m) || aid;
      }
      pushRow(ch, slotId, note, '', extra);
    });

    // Local fallback when BindingViews empty / lagging.
    ((m && m.agentBindings) || []).forEach(function (b) {
      if (!b || b.enabled === false) return;
      var ch = normalizeBrowseChannel(b.triggerType);
      if (ch !== 'key' && ch !== 'voice') return;
      var slotId = String(b.slotId || '').trim();
      var trig = String(b.triggerBinding || '').trim();
      var note = trig;
      if (ch === 'key') note = friendlyChord(trig) || trig;
      else if (trig) {
        note = lang().indexOf('en') === 0 ? ('Phrase “' + trig + '”') : ('口令「' + trig + '」');
      }
      pushRow(ch, slotId, note, '', {
        actionId: String(b.actionId || ''),
        bindingRef: slotId
      });
    });

    return rows;
  }

  function collectSoftPadLayoutChannelRows(m, views) {
    return collectSoftPadOtherChannelRows(m, views || []).slice();
  }

  function layoutChannelPicker() {
    return global.OneToneKeysChannelCommandPicker || null;
  }

  function normalizeLayoutChannelTab(tab) {
    tab = String(tab || '').trim();
    if (LAYOUT_CHANNEL_TABS.indexOf(tab) >= 0) return tab;
    return 'softPad';
  }

  function layoutChannelTabLabel(tab) {
    tab = normalizeLayoutChannelTab(tab);
    if (tab === 'ime') return t('keysChannelTabIme', '听写方式');
    if (tab === 'key') return t('keysChannelTabKey', '我录的键');
    if (tab === 'voice') return t('keysChannelTabVoice', '口头指令');
    if (tab === 'camera') return t('keysChannelTabCamera', '手势');
    if (tab === 'softPad') return t('keysChannelTabSoftPad', '屏幕按钮');
    return t('keysChannelTabCursor', '软件自带');
  }

  function layoutChannelLeadText(tab, m) {
    tab = normalizeLayoutChannelTab(tab);
    if (tab === 'ime') {
      return t('softPadLayoutChannelLeadIme', '选输入法 · 绑定其听写快捷键到左侧选中的键');
    }
    if (tab === 'key') {
      return t('softPadLayoutChannelLeadKey', '来自按键页「我录的键」· 点一条绑到左侧选中的键');
    }
    if (tab === 'voice') {
      return t(
        'softPadLayoutChannelLeadVoice',
        '来自语音设置里已录的 Cursor 口头指令 · 点一条绑到左侧选中的键'
      );
    }
    if (tab === 'camera') {
      return t(
        'softPadLayoutChannelLeadCamera',
        '当前应用摄像头里已选好的手势动作 · 点一条绑到左侧选中的键'
      );
    }
    if (tab === 'softPad') {
      return t(
        'softPadLayoutChannelLeadSoftPad',
        '按需求分类找 Agent 命令 · 点一条绑到左侧选中键，可改快捷键与口令'
      );
    }
    if (tab === 'cursor') {
      return t(
        'keysCursorPickLead',
        'Cursor 常用快捷键，按场景点一条绑到左侧选中键。'
      );
    }
    return layoutBindContextText();
  }

  function countLayoutChannelRows(channel, m) {
    channel = normalizeLayoutChannelTab(channel);
    var q = String(layoutChannelQuery || '');
    var Picker = layoutChannelPicker();
    if (!m) return 0;
    if (channel === 'ime') return 0;
    if (channel === 'cursor') {
      if (!Picker || !Picker.catalogCursorPickRows) return 0;
      return Picker.catalogCursorPickRows(q).length;
    }
    if (!Picker) return 0;
    if (channel === 'key') {
      return Picker.catalogCustomKeysForApp
        ? Picker.catalogCustomKeysForApp(m, q).length
        : 0;
    }
    if (channel === 'voice') {
      return Picker.catalogVoicePromptsForMapping
        ? Picker.catalogVoicePromptsForMapping(m, q).length
        : 0;
    }
    if (channel === 'camera') {
      return layoutConfiguredCameraRows(m).length;
    }
    if (channel === 'softPad') {
      try {
        return allSlotOptions(m).length;
      } catch (_) {
        return 0;
      }
    }
    return 0;
  }

  function layoutBindContextText() {
    var keyLbl = editDraft && editDraft.microKeyId
      ? humanMicroKeyLabel(editDraft.microKeyId)
      : '-';
    return t('softPadLayoutBrowseBindCtx', '绑到 屏幕按钮 · {key}').replace('{key}', keyLbl);
  }

  function ensureLayoutChannelRows(m) {
    if (!m) return;
    layoutChannelRows = collectSoftPadLayoutChannelRows(m, []);
    var store = global.OneToneSemanticActionStore;
    if (!store) return;
    var camSrc = resolveCameraConfigMapping(m);
    var camMid = camSrc && camSrc.id ? String(camSrc.id) : '';
    var softP = store.bindingViewsForMappingCached
      ? store.bindingViewsForMappingCached(m.id, true)
      : store.bindingViews(m.id);
    var camP =
      camMid && camMid !== String(m.id || '')
        ? store.bindingViewsForMappingCached
          ? store.bindingViewsForMappingCached(camMid, true)
          : store.bindingViews(camMid)
        : Promise.resolve(null);
    Promise.all([Promise.resolve(softP), Promise.resolve(camP)])
      .then(function (pair) {
        var views = Array.isArray(pair[0]) ? pair[0].slice() : [];
        var camViews = pair[1];
        if (Array.isArray(camViews) && camViews.length) {
          // Camera picks live on the app's camera-config mapping (often habit),
          // not necessarily the Soft Pad scheme mapping itself.
          views = views
            .filter(function (v) {
              return normalizeBrowseChannel(v && v.channel) !== 'camera';
            })
            .concat(
              camViews.filter(function (v) {
                return normalizeBrowseChannel(v && v.channel) === 'camera';
              })
            );
        }
        layoutChannelRows = collectSoftPadLayoutChannelRows(m, views);
        refreshLayoutActionLibrary(m);
      })
      .catch(function () {});
  }

  function buildSoftPadLayoutChannelRailHtml(activeTab, m) {
    activeTab = normalizeLayoutChannelTab(activeTab);
    var html =
      '<nav class="soft-pad-layout-channel-rail" role="tablist" aria-label="' +
      esc(t('softPadLayoutChannelsAria', '动作通道')) + '">';
    LAYOUT_CHANNEL_TABS.forEach(function (id) {
      var on = activeTab === id;
      var cnt = countLayoutChannelRows(id, m);
      html +=
        '<button type="button" class="soft-pad-layout-channel-rail__btn' +
        (on ? ' is-active' : '') +
        '" role="tab" data-layout-channel="' +
        id +
        '" aria-selected="' +
        (on ? 'true' : 'false') +
        '">' +
        '<span class="soft-pad-layout-channel-rail__title">' +
        esc(layoutChannelTabLabel(id)) +
        '</span>' +
        (cnt > 0
          ? '<small>' + cnt + esc(t('softPadLayoutSceneItemCount', ' 项')) + '</small>'
          : '') +
        '</button>';
    });
    html += '</nav>';
    return html;
  }

  function buildSoftPadLayoutChannelCardHead(m, tab) {
    tab = normalizeLayoutChannelTab(tab || layoutChannelTab);
    var appTitle = softPadPreviewMainTitle(m);
    return (
      '<div class="keys-voice-pick-head">' +
      '<span class="keys-voice-pick-title">' +
      esc(layoutChannelTabLabel(tab)) +
      '</span>' +
      (appTitle
        ? '<span class="keys-voice-pick-pill">' +
          esc(t('keysSoftPadPickPill', '正在用 · {app}').replace('{app}', appTitle)) +
          '</span>'
        : '') +
      '</div>' +
      '<p class="keys-voice-pick-lead" data-soft-pad-layout-bind-ctx="1">' +
      esc(layoutChannelLeadText(tab, m)) +
      '</p>'
    );
  }

  function paintSoftPadLayoutChannelChrome(host, m) {
    if (!host) return;
    var tab = normalizeLayoutChannelTab(layoutChannelTab);
    layoutChannelTab = tab;
    host.querySelectorAll('[data-layout-channel]').forEach(function (btn) {
      var ch = btn.getAttribute('data-layout-channel') || '';
      var on = ch === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
      var cnt = countLayoutChannelRows(ch, m);
      var sm = btn.querySelector('small');
      if (cnt > 0) {
        if (!sm) {
          sm = document.createElement('small');
          btn.appendChild(sm);
        }
        sm.textContent = String(cnt) + t('softPadLayoutSceneItemCount', ' 项');
      } else if (sm) {
        sm.remove();
      }
    });
    var titleEl = host.querySelector('.keys-voice-pick-title');
    if (titleEl) titleEl.textContent = layoutChannelTabLabel(tab);
    var ctx = host.querySelector('[data-soft-pad-layout-bind-ctx]');
    if (ctx) ctx.textContent = layoutChannelLeadText(tab, m);
    var search = host.querySelector('[data-soft-pad-channel-search]');
    if (search && String(search.value || '') !== String(layoutChannelQuery || '')) {
      search.value = String(layoutChannelQuery || '');
    }
  }

  function renderLayoutCatalogChannelList(listHost, host, m) {
    var query = String(layoutChannelQuery || '').trim();
    var groups = filterLayoutActionGroups(slotOptionsGrouped(m), query);
    var selectedSlot = editDraft && editDraft.mapping && String(editDraft.mapping.id) === String(m.id)
      ? String(editDraft.slotId || '')
      : '';
    var html = '';
    html +=
      '<button type="button" class="soft-pad-action-item is-unbind' +
      (!selectedSlot ? ' is-active is-selected' : '') +
      '" data-layout-slot="" role="option" aria-selected="' +
      (!selectedSlot ? 'true' : 'false') +
      '"><span class="soft-pad-action-item__title">' +
      esc(t('codexMicroPadUnbound', '未绑定')) +
      '</span></button>';
    var itemCount = 0;
    groups.forEach(function (g) {
      if (g.label) {
        html += '<p class="soft-pad-action-group" role="presentation">' + esc(g.label) + '</p>';
      }
      (g.options || []).forEach(function (o) {
        var id = String(o.id || '');
        if (!id) return;
        itemCount++;
        html += layoutActionRowHtml(id, m, selectedSlot, {});
      });
    });
    if (query && !itemCount) {
      html +=
        '<p class="soft-pad-action-empty">' +
        esc(t('softPadLayoutActionEmpty', '没有匹配的命令')) +
        '</p>';
    }
    listHost.innerHTML = html;
  }

  function layoutSelectedSlotId(m) {
    return editDraft && editDraft.mapping && String(editDraft.mapping.id) === String(m.id)
      ? String(editDraft.slotId || '')
      : '';
  }

  function layoutUnbindRowHtml(selectedSlot) {
    return (
      '<button type="button" class="soft-pad-action-item is-unbind' +
      (!selectedSlot ? ' is-active is-selected' : '') +
      '" data-layout-slot="" role="option" aria-selected="' +
      (!selectedSlot ? 'true' : 'false') +
      '"><span class="soft-pad-action-item__title">' +
      esc(t('codexMicroPadUnbound', '未绑定')) +
      '</span></button>'
    );
  }

  function resolveDictationBindSlot(m) {
    var pad = m && m.codexMicroPad;
    var candidates = ['stopOrSend', 'holdDictation', 'dictationStart'];
    var i;
    for (i = 0; i < candidates.length; i++) {
      if (isAllowedCommonSlotId(pad, candidates[i])) return candidates[i];
    }
    var opts = allSlotOptions(m);
    for (i = 0; i < opts.length; i++) {
      var id = String(opts[i].id || '');
      if (!isAllowedCommonSlotId(pad, id)) continue;
      var aid = String(opts[i].actionId || id).toLowerCase();
      if (aid.indexOf('dict') >= 0 || aid.indexOf('voice') >= 0 || aid.indexOf('mic') >= 0) {
        return id;
      }
    }
    return '';
  }

  function refreshSoftPadSceneDock(m) {
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.refreshSoftPadSceneKeys === 'function') {
        Hub.refreshSoftPadSceneKeys();
        return;
      }
    } catch (_) {}
    try {
      var scene = global.OneToneKeysSceneActionsPanel;
      if (scene && typeof scene.render === 'function' && m) scene.render(m);
      else if (scene && typeof scene.refresh === 'function') scene.refresh();
    } catch (_2) {}
  }

  /** Stamp Soft Pad habit last-scheme so Keys「本场景动作」lists this channel pick. */
  function stampSoftPadSceneHero(m, opts) {
    if (!m) return;
    opts = opts || {};
    var channel = String(opts.channel || 'softPad').trim() || 'softPad';
    var bindingRef = String(opts.bindingRef || '').trim();
    var actionId = String(opts.actionId || '').trim();
    var kind = String(opts.kind || '').trim();
    if (!kind) {
      if (channel === 'key' && bindingRef && bindingRef !== 'ime') kind = 'customKey';
      else if (channel === 'key' || channel === 'ime') kind = 'ime';
      else if (channel === 'camera') kind = 'gesture';
      else kind = 'action';
    }
    m.captureHeroRef = {
      channel: channel === 'ime' ? 'key' : channel,
      bindingRef: channel === 'ime' ? 'ime' : bindingRef,
      actionId: actionId,
      actionInstanceId: String(opts.actionInstanceId || ''),
      kind: kind
    };
  }

  function bindImePresetToPadKey(m, preset) {
    if (!editDraft || !preset) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return;
    }
    var chord = String(preset.targetKey || '').trim();
    if (!chord) return;
    var presetId = String(preset.id || '').trim();
    var label = t(preset.shortKey || preset.nameKey);

    // Same as Keys IME strip: write 听写方式 onto this app scenario so 本场景动作 updates.
    // skipRender: full habits remount would drop Soft Pad editDraft before pad-key bind.
    var Apply = global.OneToneTargetKeyApply;
    var applied = false;
    if (Apply && typeof Apply.applyCustomMappingTarget === 'function') {
      try {
        applied = !!Apply.applyCustomMappingTarget(chord, {
          source: 'ime',
          presetId: presetId,
          mapping: m,
          skipRender: true,
          quiet: true
        });
      } catch (_) {
        applied = false;
      }
    }
    if (!applied) {
      m.imePresetId = presetId;
      m.targetKey = chord;
      m.targetActions = [];
      try {
        if (m.captureHeroRef && String(m.captureHeroRef.kind || '').toLowerCase() === 'customkey') {
          m.captureHeroRef = null;
        }
      } catch (_) {}
    }
    stampSoftPadSceneHero(m, { channel: 'ime', kind: 'ime' });

    // Soft Pad key → 语音输入；fallback to injecting the IME chord.
    if (isAllowedCommonSlotId(m.codexMicroPad, 'pushToTalk')) {
      onLayoutActionPick('pushToTalk');
    } else {
      var entry = createCustomShortcut(m, { name: label, phrases: '', chord: chord });
      if (!entry) {
        toast(t('softPadLayoutCustomSaveFail', '没能保存，请检查名称后重试'));
        return;
      }
      onLayoutActionPick(entry.id);
    }
    // Re-stamp after pad bind — onLayoutActionPick must not leave Soft Pad as sole scheme.
    stampSoftPadSceneHero(m, { channel: 'ime', kind: 'ime' });

    refreshLayoutActionLibrary(m);
    refreshSoftPadSceneDock(m);

    if (!applied) {
      toast(
        t('softPadLayoutImeBoundToast', '已绑定 {ime} · {chord}')
          .replace('{ime}', label)
          .replace('{chord}', friendlyChord(chord) || chord)
      );
    } else {
      toast(t('imePresetApplied', '已应用听写方式'));
    }
  }

  function bindCustomKeyRowToPadKey(m, row) {
    if (!editDraft || !row) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return;
    }
    var matchId = String(row.mappingId || '').trim();
    if (!matchId) {
      toast(t('keysCustomKeyMatchEmpty', '还没有自定义键。点右上角 + 新建一条，再加步骤。'));
      return;
    }
    // Point selectedMappingId at Soft Pad habit without MappingCore.focus —
    // focus() remounts Soft Pad and drops editDraft, so the key never binds.
    try {
      var st = global.OneToneState && global.OneToneState.state;
      if (st) st.selectedMappingId = String(m.id);
    } catch (_) {}
    var Picker = layoutChannelPicker();
    var applied = false;
    if (Picker && typeof Picker.applyCustomKeyMatchAsRecognition === 'function') {
      try {
        applied = !!Picker.applyCustomKeyMatchAsRecognition(matchId);
      } catch (_) {
        applied = false;
      }
    }
    if (!applied) {
      toast(t('softPadLayoutCustomSaveFail', '没能保存，请检查名称后重试'));
      return;
    }
    // Soft Pad key runs the copied sequence (same runner as Keys 我录的键).
    onLayoutActionPick('runTargetSequence');
    refreshLayoutActionLibrary(m);
    refreshSoftPadSceneDock(m);
  }

  function bindCameraGestureToPadKey(m, row) {
    if (!editDraft || !row) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return;
    }
    var actionId = String(row.actionId || '').trim();
    var pickId = String(row.pickId || row.gesture || row.bindingRef || '').trim();
    var slotId = String(row.slotId || '').trim() || softPadSlotIdForActionId(m, actionId);
    if (!slotId) {
      toast(
        t(
          'softPadLayoutCameraNeedSlot',
          '这个手势的动作还不能绑到 Soft Pad 键，请换一个 Soft Pad 能跑的动作。'
        )
      );
      return;
    }
    onLayoutActionPick(slotId);
    stampSoftPadSceneHero(m, {
      channel: 'camera',
      bindingRef: pickId,
      actionId: actionId,
      kind: 'gesture'
    });
    refreshLayoutActionLibrary(m);
    refreshSoftPadSceneDock(m);
    toast(
      t('softPadLayoutCameraBoundToast', '已绑定手势：{name}')
        .replace('{name}', String(row.title || row.name || pickId || actionId))
    );
  }

  function renderLayoutCameraChannelList(listHost, m) {
    // Only gestures whose action the user already picked for this app (e.g. Cursor).
    var rows = layoutConfiguredCameraRows(m);
    var selectedSlot = layoutSelectedSlotId(m);
    var html = layoutUnbindRowHtml(selectedSlot);
    if (!rows.length) {
      html +=
        '<p class="soft-pad-action-empty">' +
        esc(
          t(
            'softPadLayoutEmptyCamera',
            '当前应用还没有选好手势动作。先去摄像头设置里为手势选一个 Soft Pad 能跑的动作。'
          )
        ) +
        '</p>' +
        '<p class="soft-pad-action-empty">' +
        esc(t('keysCameraPickDesignHint', '想先把手势设好？')) +
        ' <button type="button" class="keys-channel-item-link" data-layout-go-camera="1">' +
        esc(t('keysCameraPickGoCamera', '去摄像头设置')) +
        '</button></p>';
    } else {
      rows.forEach(function (row) {
        var pickId = String(row.bindingRef || '');
        var slotId = String(row.slotId || '');
        var on = !!(slotId && selectedSlot === slotId);
        var disabled = !slotId || row.bindable === false;
        html +=
          '<button type="button" class="soft-pad-action-item keys-voice-pick-row' +
          (on ? ' is-selected is-on' : '') +
          (disabled ? ' is-disabled' : '') +
          '" data-layout-camera="1" data-camera-pick="' +
          esc(pickId) +
          '" data-camera-action="' +
          esc(row.actionId || '') +
          '" data-layout-slot="' +
          esc(slotId) +
          '" data-camera-title="' +
          esc(row.name || '') +
          '"' +
          (disabled ? ' disabled aria-disabled="true"' : '') +
          ' role="option" aria-selected="' +
          (on ? 'true' : 'false') +
          '">' +
          '<span class="soft-pad-action-item__title keys-voice-pick-row-name">' +
          esc(row.name || slotId || '—') +
          '</span>' +
          (row.note
            ? '<span class="soft-pad-action-item__when keys-cursor-pick-chord">' +
              esc(row.note) +
              '</span>'
            : '') +
          (disabled
            ? '<span class="soft-pad-action-item__when">' +
              esc(
                t(
                  'softPadLayoutCameraNeedSlot',
                  '这个手势的动作还不能绑到 Soft Pad 键，请换一个 Soft Pad 能跑的动作。'
                )
              ) +
              '</span>'
            : row.blurb
              ? '<span class="soft-pad-action-item__when">' + esc(row.blurb) + '</span>'
              : '') +
          '</button>';
      });
    }
    listHost.innerHTML = html;
  }

  function resolveVoiceRowSlotId(m, row) {
    if (!m || !row) return '';
    var pad = m.codexMicroPad;
    var ref = String(row.bindingRef || '').trim();
    if (ref && isAllowedCommonSlotId(pad, ref)) return ref;
    var sid = softPadSlotIdForActionId(m, row.actionId);
    if (sid) return sid;
    var binds = m.agentBindings || [];
    var i;
    for (i = 0; i < binds.length; i++) {
      var b = binds[i];
      if (!b || b.enabled === false) continue;
      if (String(b.actionId || '') !== String(row.actionId || '')) continue;
      var id = String(b.slotId || '').trim();
      if (isAllowedCommonSlotId(pad, id)) return id;
    }
    return '';
  }

  function renderLayoutImeChannelList(listHost, m) {
    var Ime = global.OneToneImePresets;
    var selectedId = String(m && m.imePresetId || '').trim();
    var html = '<div class="soft-pad-layout-ime-pane">';
    if (Ime && typeof Ime.buildLabeledStripHtml === 'function') {
      html +=
        '<div class="ime-preset-strip ime-preset-strip--labeled soft-pad-layout-ime-strip" role="list">';
      html += Ime.buildLabeledStripHtml({ selectedId: selectedId, disabled: !editDraft });
      html += '</div>';
      html +=
        '<p class="soft-pad-layout-ime-confirm">' +
        esc(
          typeof Ime.confirmLineText === 'function'
            ? Ime.confirmLineText(selectedId, '')
            : t('softPadLayoutChannelLeadIme', '选输入法 · 绑定其听写快捷键到左侧选中的键')
        ) +
        '</p>';
    } else {
      html += '<p class="soft-pad-action-empty">—</p>';
    }
    html += '</div>';
    listHost.innerHTML = html;
  }

  function renderLayoutKeyChannelList(listHost, m) {
    var Picker = layoutChannelPicker();
    var rows =
      Picker && Picker.catalogCustomKeysForApp
        ? Picker.catalogCustomKeysForApp(m, layoutChannelQuery)
        : [];
    var selectedSlot = layoutSelectedSlotId(m);
    var selectedMatchId = '';
    try {
      var href = m && m.captureHeroRef;
      if (
        href &&
        String(href.kind || '')
          .trim()
          .toLowerCase() === 'customkey'
      ) {
        var bref = String(href.bindingRef || '').trim();
        if (bref && bref !== String(m.id || '')) selectedMatchId = bref;
      }
    } catch (_) {}
    var html = layoutUnbindRowHtml(
      selectedMatchId && selectedSlot === 'runTargetSequence' ? 'runTargetSequence' : selectedSlot
    );
    if (!rows.length) {
      html +=
        '<p class="soft-pad-action-empty">' +
        esc(t('keysCustomKeyMatchEmpty', '还没有自定义键。点右上角 + 新建一条，再加步骤。')) +
        '</p>';
    } else {
      rows.forEach(function (row) {
        var mid = String(row.mappingId || '');
        var on = !!(selectedMatchId && mid === selectedMatchId);
        html +=
          '<button type="button" class="soft-pad-action-item keys-voice-pick-row' +
          (on ? ' is-selected is-on' : '') +
          '" data-layout-custom-key="1" ' +
          'data-custom-key-id="' +
          esc(mid) +
          '" data-custom-key-chord="' +
          esc(row.chord || '') +
          '" data-custom-key-name="' +
          esc(row.name || '') +
          '" role="option" aria-selected="' +
          (on ? 'true' : 'false') +
          '">' +
          '<span class="soft-pad-action-item__title keys-voice-pick-row-name">' +
          esc(row.name || '—') +
          '</span>' +
          '<span class="soft-pad-action-item__when keys-cursor-pick-chord">' +
          esc(row.note || '—') +
          '</span>' +
          (row.stepCount
            ? '<span class="soft-pad-action-item__when">' +
              esc(
                t('softPadLayoutKeyStepCount', '{n} 步').replace('{n}', String(row.stepCount))
              ) +
              '</span>'
            : '') +
          '</button>';
      });
    }
    listHost.innerHTML = html;
  }

  function bindPromptInjectToPadKey(m, row) {
    if (!editDraft || !row) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return;
    }
    var text = String(row.say || '').trim();
    if (!text) {
      toast(t('voicePromptRowEmpty', '未填写 prompt'));
      return;
    }
    // Same semantics as voice 一词注入: Text + Enter via runTargetSequence
    // (runtime aims composer through shared InputFocusAim first).
    if (!isAllowedCommonSlotId(m && m.codexMicroPad, 'runTargetSequence')) {
      toast(
        t(
          'softPadLayoutPromptNeedSeq',
          '当前 Soft Pad 不能跑「执行动作序列」。请先在屏幕按钮里放开该能力。'
        )
      );
      return;
    }
    var Picker = layoutChannelPicker();
    var acts =
      Picker && typeof Picker.promptInjectActions === 'function'
        ? Picker.promptInjectActions(text)
        : [
            { type: 'text', value: text },
            { type: 'key', value: 'Enter' }
          ];
    m.targetActions = acts;
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.save) {
        global.OneToneConfigPersist.save({ source: 'softpad-prompt-inject' });
      }
    } catch (_) {}
    onLayoutActionPick('runTargetSequence');
    stampSoftPadSceneHero(m, {
      channel: 'voice',
      bindingRef: String(row.mappingId || row.id || '').trim(),
      actionId: 'prompt.inject',
      kind: 'prompt'
    });
    refreshLayoutActionLibrary(m);
    refreshSoftPadSceneDock(m);
    toast(
      t('softPadLayoutPromptBoundToast', '已绑定一词注入：{name}').replace(
        '{name}',
        String(row.name || text).slice(0, 24)
      )
    );
  }

  function renderLayoutVoiceChannelList(listHost, m) {
    var Picker = layoutChannelPicker();
    var rows =
      Picker && Picker.catalogVoicePromptsForMapping
        ? Picker.catalogVoicePromptsForMapping(m, layoutChannelQuery)
        : [];
    var selectedSlot = layoutSelectedSlotId(m);
    var html = layoutUnbindRowHtml(selectedSlot);
    if (!rows.length) {
      html +=
        '<p class="soft-pad-action-empty">' +
        esc(
          t(
            'softPadLayoutVoiceEmpty',
            '还没有 Cursor 口头指令。去语音设置录一条，或在 SoftPad 自定义快捷键里填口令。'
          )
        ) +
        '</p>';
    } else {
      rows.forEach(function (row) {
        var kind = String(row.kind || '');
        var slotId = '';
        if (kind === 'custom' || kind === 'bind') {
          slotId = resolveVoiceRowSlotId(m, row);
        } else if (kind === 'acoustic') {
          slotId = softPadSlotIdForActionId(m, row.actionId) || '';
        }
        var on = slotId && selectedSlot === slotId;
        var isPrompt = kind === 'prompt';
        var disabled = !isPrompt && (!slotId || row.bindable === false);
        html +=
          '<button type="button" class="soft-pad-action-item keys-voice-pick-row' +
          (on ? ' is-active is-selected' : '') +
          (disabled ? ' is-disabled' : '') +
          '"' +
          (slotId ? ' data-layout-slot="' + esc(slotId) + '"' : '') +
          (isPrompt
            ? ' data-layout-voice-prompt="1" data-prompt-name="' +
              esc(row.name || '') +
              '" data-prompt-text="' +
              esc(row.say || '') +
              '"'
            : ' data-layout-voice-row="1"') +
          (disabled ? ' disabled aria-disabled="true"' : '') +
          ' role="option" aria-selected="' +
          (on ? 'true' : 'false') +
          '">' +
          '<span class="soft-pad-action-item__title keys-voice-pick-row-name">' +
          esc(row.name || '—') +
          '</span>' +
          (row.say
            ? '<span class="soft-pad-action-item__when keys-cursor-pick-chord">「' +
              esc(row.say) +
              '」</span>'
            : '') +
          '</button>';
      });
    }
    listHost.innerHTML = html;
  }

  function bindCursorShortcutToPadKey(m, row) {
    if (!editDraft || !row) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return;
    }
    var slotId = String(row.slotId || '').trim();
    var pad = m && m.codexMicroPad;
    if (slotId && isAllowedCommonSlotId(pad, slotId)) {
      onLayoutActionPick(slotId);
      stampSoftPadSceneHero(m, {
        channel: 'cursor',
        bindingRef: slotId,
        actionId: slotId,
        kind: 'action'
      });
      refreshSoftPadSceneDock(m);
      return;
    }
    var chord = String(row.chord || '').trim();
    if (!chord) {
      toast(t('keysPickOnlySetEmptyCursor', '没有可加按键的软件自带功能（需自带快捷键）。'));
      return;
    }
    var entry = createCustomShortcut(m, {
      name: String(row.title || row.name || chord).trim() || chord,
      phrases: '',
      chord: chord
    });
    if (entry) {
      onLayoutActionPick(entry.id);
      stampSoftPadSceneHero(m, {
        channel: 'cursor',
        bindingRef: entry.id,
        actionId: 'app.shortcut',
        kind: 'action'
      });
      refreshSoftPadSceneDock(m);
    }
  }

  function renderLayoutCursorChannelList(listHost, m) {
    var Picker = layoutChannelPicker();
    var catalog =
      Picker && Picker.catalogCursorPickRows
        ? Picker.catalogCursorPickRows(layoutChannelQuery)
        : [];
    var groupDefs =
      Picker && Picker.catalogCursorPickGroups
        ? Picker.catalogCursorPickGroups()
        : [];
    var tabs = [];
    var tabSeen = {};
    var gi;
    var ri;
    for (gi = 0; gi < groupDefs.length; gi++) {
      var gdef = groupDefs[gi];
      for (ri = 0; ri < catalog.length; ri++) {
        if (catalog[ri].groupId === gdef.id && !tabSeen[gdef.id]) {
          tabSeen[gdef.id] = true;
          tabs.push({ id: gdef.id, title: gdef.title });
        }
      }
    }
    for (ri = 0; ri < catalog.length; ri++) {
      if (!tabSeen[catalog[ri].groupId]) {
        tabSeen[catalog[ri].groupId] = true;
        tabs.push({
          id: catalog[ri].groupId,
          title: catalog[ri].groupTitle || t('keysCursorPickGroupExtra', '其它')
        });
      }
    }
    if (tabs.length && tabs.every(function (t) { return t.id !== layoutCursorPickSubtab; })) {
      layoutCursorPickSubtab = tabs[0].id;
    }
    var selectedSlot = layoutSelectedSlotId(m);
    var html = layoutUnbindRowHtml(selectedSlot);
    if (tabs.length > 1) {
      html += '<div class="keys-pick-subtabs soft-pad-layout-cursor-subtabs" role="tablist">';
      tabs.forEach(function (tab) {
        var on = tab.id === layoutCursorPickSubtab;
        html +=
          '<button type="button" class="keys-pick-subtab' +
          (on ? ' is-active' : '') +
          '" data-layout-cursor-subtab="' +
          esc(tab.id) +
          '" role="tab" aria-selected="' +
          (on ? 'true' : 'false') +
          '">' +
          esc(tab.title) +
          '</button>';
      });
      html += '</div>';
    }
    if (!catalog.length) {
      html +=
        '<p class="soft-pad-action-empty">' +
        esc(
          t(
            'keysPickOnlySetEmptyCursor',
            '没有可加按键的软件自带功能（需自带快捷键）。'
          )
        ) +
        '</p>';
    } else {
      html += '<div class="keys-cursor-pick-list soft-pad-layout-cursor-list">';
      catalog.forEach(function (row) {
        if (tabs.length > 1 && row.groupId !== layoutCursorPickSubtab) return;
        var slotId = String(row.slotId || '');
        var on = slotId && selectedSlot === slotId;
        var chord = String(row.chord || '').trim();
        var sub = String(row.effect || row.when || '').trim();
        var canSoft = isAllowedCommonSlotId(m.codexMicroPad, slotId);
        html +=
          '<button type="button" class="keys-voice-pick-row soft-pad-layout-cursor-row' +
          (on ? ' is-active is-selected' : '') +
          (row.gated ? ' is-gated' : '') +
          '"' +
          (canSoft ? ' data-layout-slot="' + esc(slotId) + '"' : '') +
          ' data-layout-cursor-row="1"' +
          ' data-cursor-slot="' +
          esc(slotId) +
          '"' +
          ' data-cursor-title="' +
          esc(row.title || '') +
          '"' +
          ' data-cursor-chord="' +
          esc(chord) +
          '"' +
          (row.gated ? ' aria-disabled="true"' : '') +
          ' role="option" aria-selected="' +
          (on ? 'true' : 'false') +
          '">' +
          '<span class="keys-voice-pick-row-name">' +
          esc(row.title || slotId) +
          '</span>' +
          (chord
            ? '<span class="keys-cursor-pick-chord">' +
              esc(friendlyChord(chord) || chord) +
              '</span>'
            : '') +
          (sub
            ? '<span class="keys-voice-pick-row-meta">' + esc(sub) + '</span>'
            : '') +
          '</button>';
      });
      html += '</div>';
    }
    listHost.innerHTML = html;
  }

  /** 屏幕按钮：按需求场景竖列 + 键编辑卡片。 */
  function renderLayoutSoftPadChannelList(listHost, m) {
    if (isCursorSoftPadMapping(m) || isCodexSoftPadMapping(m)) {
      renderCursorLayoutActionList(listHost, listHost.closest('[data-soft-pad-action-library]') || listHost, m);
      return;
    }
    renderLayoutCatalogChannelList(listHost, listHost.closest('[data-soft-pad-action-library]') || listHost, m);
  }

  function getCursorCommonSlotIds(pad) {
    if (pad && Array.isArray(pad.commonSlotIds)) {
      var out = [];
      var seen = {};
      pad.commonSlotIds.forEach(function (raw) {
        var id = String(raw || '').trim();
        if (!id || seen[id] || !isAllowedCommonSlotId(pad, id)) return;
        seen[id] = 1;
        out.push(id);
      });
      return out;
    }
    return defaultCursorCommonSlots().filter(function (id) {
      return !!CURSOR_SOFT_PAD_SLOT_IDS[id];
    });
  }

  function setCursorCommonSlotIds(m, ids) {
    if (!m) return;
    if (!m.codexMicroPad) ensurePad(m, { persist: false });
    if (!m.codexMicroPad) return;
    var pad = m.codexMicroPad;
    var next = [];
    var seen = {};
    (ids || []).forEach(function (raw) {
      var id = String(raw || '').trim();
      if (!id || seen[id] || !isAllowedCommonSlotId(pad, id)) return;
      seen[id] = 1;
      next.push(id);
    });
    pad.commonSlotIds = next;
    persistLayout(m, { quiet: true });
  }

  function pinCursorCommonSlot(m, slotId) {
    var id = String(slotId || '').trim();
    if (!m || !isAllowedCommonSlotId(m.codexMicroPad, id)) return false;
    var cur = getCursorCommonSlotIds(m.codexMicroPad);
    if (cur.indexOf(id) >= 0) return false;
    cur.unshift(id);
    setCursorCommonSlotIds(m, cur);
    return true;
  }

  function unpinCursorCommonSlot(m, slotId) {
    var id = String(slotId || '').trim();
    var cur = getCursorCommonSlotIds(m && m.codexMicroPad).filter(function (x) {
      return x !== id;
    });
    setCursorCommonSlotIds(m, cur);
    return true;
  }

  function moveCursorCommonSlot(m, slotId, dir) {
    var id = String(slotId || '').trim();
    var cur = getCursorCommonSlotIds(m && m.codexMicroPad).slice();
    var i = cur.indexOf(id);
    if (i < 0) return false;
    var j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= cur.length) return false;
    var tmp = cur[i];
    cur[i] = cur[j];
    cur[j] = tmp;
    setCursorCommonSlotIds(m, cur);
    return true;
  }

  function resetCursorCommonSlots(m) {
    setCursorCommonSlotIds(m, defaultCursorCommonSlots());
    return true;
  }

  function upsertCustomShortcutBindings(m, entry) {
    if (!m || !entry || !isCursorCustomSlotId(entry.id)) return;
    if (!Array.isArray(m.agentBindings)) m.agentBindings = [];
    var id = String(entry.id);
    var chord = String(entry.chord || '').trim();
    var phrases = String(entry.phrases || '').trim();
    var scope = normalizeActivationScope(entry.activationScope);
    var keyB = agentBindingFor(m, id, 'key');
    if (!keyB) {
      keyB = {
        slotId: id,
        actionId: 'app.shortcut',
        actionInstanceId: id,
        actionArgs: { chord: chord },
        triggerType: 'key',
        triggerBinding: chord,
        enabled: true,
        executionMode: 'execute',
        activationScope: scope
      };
      m.agentBindings.push(keyB);
    } else {
      keyB.actionId = 'app.shortcut';
      keyB.actionInstanceId = id;
      keyB.actionArgs = { chord: chord };
      keyB.triggerBinding = chord;
      keyB.enabled = true;
      keyB.executionMode = 'execute';
      keyB.activationScope = scope;
    }
    var voiceB = agentBindingFor(m, id, 'voice');
    if (phrases) {
      if (!voiceB) {
        m.agentBindings.push({
          slotId: id,
          actionId: 'app.shortcut',
          actionInstanceId: id,
          actionArgs: { chord: chord },
          triggerType: 'voice',
          triggerBinding: phrases,
          enabled: true,
          executionMode: 'execute',
          activationScope: scope
        });
      } else {
        voiceB.actionId = 'app.shortcut';
        voiceB.actionInstanceId = id;
        voiceB.actionArgs = { chord: chord };
        voiceB.triggerBinding = phrases;
        voiceB.enabled = true;
        voiceB.activationScope = scope;
      }
    } else if (voiceB) {
      voiceB.enabled = false;
      voiceB.triggerBinding = '';
    }
  }

  function createCustomShortcut(m, draft) {
    if (!m) return null;
    if (!m.codexMicroPad) ensurePad(m, { persist: false });
    if (!m.codexMicroPad) return null;
    var name = String((draft && draft.name) || '').trim();
    var chord = String((draft && draft.chord) || '').trim();
    var phrases = String((draft && draft.phrases) || '').trim();
    if (!name || !chord) return null;
    var id = 'custom_' + Date.now().toString(36);
    var entry = {
      id: id,
      name: name,
      chord: chord,
      phrases: phrases,
      activationScope: 'foregroundApp'
    };
    if (!Array.isArray(m.codexMicroPad.customShortcuts)) m.codexMicroPad.customShortcuts = [];
    m.codexMicroPad.customShortcuts.unshift(entry);
    upsertCustomShortcutBindings(m, entry);
    // Do not pin into retired「我的常见」pack — Soft Pad browse is scene categories only.
    persistLayout(m, { quiet: true, immediate: true });
    return entry;
  }

  function deleteCustomShortcut(m, slotId) {
    var id = String(slotId || '').trim();
    if (!m || !m.codexMicroPad || !isCursorCustomSlotId(id)) return false;
    m.codexMicroPad.customShortcuts = getCustomShortcuts(m.codexMicroPad).filter(function (c) {
      return String(c.id) !== id;
    });
    if (Array.isArray(m.agentBindings)) {
      m.agentBindings = m.agentBindings.filter(function (b) {
        return !(b && String(b.slotId || '') === id);
      });
    }
    unpinCursorCommonSlot(m, id);
    // Clear Soft Pad routes that pointed at this custom id (do not leave dead binds).
    if (Array.isArray(m.codexMicroPad.keys)) {
      m.codexMicroPad.keys.forEach(function (k) {
        if (k && String(k.slotId || '') === id) {
          k.slotId = '';
          k.enabled = false;
        }
      });
    }
    persistLayout(m, { quiet: true, immediate: true });
    return true;
  }

  function layoutActionWhenText(slotId, m) {
    if (isCursorCustomSlotId(slotId)) {
      var cs = findCustomShortcut(m && m.codexMicroPad, slotId);
      if (!cs) return '';
      var parts = [];
      if (cs.chord) parts.push(friendlyChord(cs.chord));
      if (cs.phrases) parts.push(cs.phrases);
      return parts.join(' · ');
    }
    var copy = capabilityCardCopy(slotId, m);
    var tip = slotEffectTip(slotId, copy && copy.title, m);
    return String((copy && copy.result) || tip || '').trim();
  }

  function softPadTrailIcon(kind) {
    // Compact Material-style glyphs for list trailing actions.
    if (kind === 'up') {
      return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
    }
    if (kind === 'down') {
      return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';
    }
    if (kind === 'close') {
      return '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
    }
    return '';
  }

  function layoutActionRowHtml(slotId, m, selectedSlot, opts) {
    opts = opts || {};
    var id = String(slotId || '');
    var copy = capabilityCardCopy(id, m);
    var title = (copy && copy.title) || slotLabel(id, m) || id;
    var when = layoutActionWhenText(id, m);
    var iconId = iconIdForCapabilitySlot(id);
    var on = selectedSlot === id;
    var pinned = opts.showPin ? getCursorCommonSlotIds(m && m.codexMicroPad).indexOf(id) >= 0 : false;
    var tag = '';
    if (opts.commonTag) {
      // Default commons need no badge; only mark custom / user-added.
      if (isCursorCustomSlotId(id)) {
        tag = '<span class="soft-pad-action-item__tag is-user">' +
          esc(t('softPadLayoutCommonTagCustom', '自定义')) + '</span>';
      } else if (!isCursorCommonDefaultSlot(id)) {
        tag = '<span class="soft-pad-action-item__tag is-user">' +
          esc(t('softPadLayoutCommonTagUser', '已添加')) + '</span>';
      }
    }
    var pinBtn = opts.showPin
      ? ('<button type="button" class="soft-pad-action-pin' + (pinned ? ' is-pinned' : '') +
        '" data-layout-pin="' + esc(id) + '" title="' +
        esc(pinned
          ? t('softPadLayoutUnpinCommon', '移出常见')
          : t('softPadLayoutPinCommon', '加入常见')) +
        '">' +
        (pinned
          ? esc(t('softPadLayoutPinnedShort', '已在常见'))
          : esc(t('softPadLayoutPinShort', '加入常见'))) +
        '</button>')
      : '';
    var unpinBtn = opts.showUnpin
      ? ('<button type="button" class="soft-pad-action-icon-btn soft-pad-action-unpin" data-layout-unpin="' +
        esc(id) +
        '" title="' + esc(t('softPadLayoutUnpinCommon', '移出常见')) + '" aria-label="' +
        esc(t('softPadLayoutUnpinCommon', '移出常见')) + '">' +
        softPadTrailIcon('close') + '</button>')
      : '';
    var delBtn = opts.showCustomDelete
      ? ('<button type="button" class="soft-pad-action-icon-btn soft-pad-action-custom-del" data-layout-custom-delete="' +
        esc(id) +
        '" title="' +
        esc(t('softPadLayoutCustomDelete', '删除自定义')) +
        '" aria-label="' +
        esc(t('softPadLayoutCustomDelete', '删除自定义')) +
        '">' +
        softPadTrailIcon('close') +
        '</button>')
      : '';
    var moveBtns = '';
    if (opts.showCommonManage) {
      var idx = Number(opts.commonIndex) || 0;
      var count = Number(opts.commonCount) || 0;
      moveBtns =
        '<span class="soft-pad-action-common-moves" role="group" aria-label="' +
        esc(t('softPadLayoutCommonReorder', '排序')) +
        '">' +
        '<button type="button" class="soft-pad-action-icon-btn soft-pad-action-common-move" data-layout-common-move="up" data-layout-common-id="' +
        esc(id) +
        '"' +
        (idx <= 0 ? ' disabled' : '') +
        ' title="' +
        esc(t('softPadLayoutCommonMoveUp', '上移')) +
        '" aria-label="' +
        esc(t('softPadLayoutCommonMoveUp', '上移')) +
        '">' + softPadTrailIcon('up') + '</button>' +
        '<button type="button" class="soft-pad-action-icon-btn soft-pad-action-common-move" data-layout-common-move="down" data-layout-common-id="' +
        esc(id) +
        '"' +
        (idx >= count - 1 ? ' disabled' : '') +
        ' title="' +
        esc(t('softPadLayoutCommonMoveDown', '下移')) +
        '" aria-label="' +
        esc(t('softPadLayoutCommonMoveDown', '下移')) +
        '">' + softPadTrailIcon('down') + '</button></span>';
    }
    // Custom delete supersedes unpin (same remove affordance).
    var removeBtn = delBtn || unpinBtn;
    return (
      '<div class="soft-pad-action-item' + (on ? ' is-selected' : '') +
      (opts.commonTag ? ' soft-pad-action-item--card' : '') +
      '" data-layout-slot="' + esc(id) + '" role="option" aria-selected="' + (on ? 'true' : 'false') + '">' +
      '<span class="soft-pad-action-item__icon micro-hw__icon" aria-hidden="true">' +
      iconSvg(iconId) +
      '</span>' +
      '<span class="soft-pad-action-item__text">' +
      '<span class="soft-pad-action-item__title">' + esc(title) + '</span>' +
      (when ? '<span class="soft-pad-action-item__when">' + esc(when) + '</span>' : '') +
      '</span>' +
      '<span class="soft-pad-action-item__trail">' +
      tag + moveBtns + pinBtn + removeBtn +
      '</span></div>'
    );
  }

  function filterLayoutActionGroups(groups, query) {
    query = String(query || '').trim().toLowerCase();
    if (!query) return groups;
    return groups.map(function (g) {
      var list = (g.options || []).filter(function (o) {
        var hay = (String(o.label || '') + ' ' + String(o.tip || '') + ' ' + String(o.id || '') +
          ' ' + String(g.label || '') + ' ' + String(g.desc || '')).toLowerCase();
        return hay.indexOf(query) >= 0;
      });
      if (!list.length) return null;
      return { id: g.id, label: g.label, desc: g.desc, options: list };
    }).filter(Boolean);
  }

  function normalizeLayoutActionLayer(layer) {
    layer = String(layer || '');
    if (layer === 'common' || layer === 'scenes') return 'browse';
    if (layer === 'custom') return 'custom';
    return 'browse';
  }

  function buildSoftPadLayoutActionLibraryHtml(m) {
    layoutActionLayer = 'browse';
    layoutChannelTab = normalizeLayoutChannelTab(layoutChannelTab);
    return (
      '<div class="soft-pad-action-library soft-pad-action-library--channels" data-soft-pad-action-library="1">' +
      '<div class="soft-pad-layout-channel-split">' +
      '<div class="soft-pad-layout-channel-left">' +
      '<label class="soft-pad-layout-channel-search">' +
      '<span class="sr-only">' +
      esc(t('softPadLayoutChannelSearchLbl', '搜索命令')) +
      '</span>' +
      '<input type="search" data-soft-pad-channel-search="1" autocomplete="off" spellcheck="false" ' +
      'placeholder="' +
      esc(t('softPadLayoutChannelSearchPh', '搜索功能…')) +
      '" aria-label="' +
      esc(t('softPadLayoutChannelSearchLbl', '搜索命令')) +
      '" />' +
      '</label>' +
      buildSoftPadLayoutChannelRailHtml(layoutChannelTab, m) +
      '</div>' +
      '<div class="soft-pad-layout-channel-right">' +
      '<div class="soft-pad-layout-channel-card keys-voice-pick keys-softpad-pick">' +
      buildSoftPadLayoutChannelCardHead(m, layoutChannelTab) +
      '<div class="soft-pad-action-list" data-soft-pad-action-list="1" role="listbox"></div>' +
      '<p class="codex-pad-mgr__hint soft-pad-action-library__hint" data-soft-pad-action-hint="1"></p>' +
      '</div></div></div></div>'
    );
  }

  function defaultLayoutActionSceneId() {
    return (CURSOR_SLOT_GROUPS[0] && CURSOR_SLOT_GROUPS[0].id) || 'talk';
  }

  function layoutSceneIdForSlot(slotId) {
    var id = String(slotId || '').trim();
    for (var i = 0; i < CURSOR_SLOT_GROUPS.length; i++) {
      if ((CURSOR_SLOT_GROUPS[i].slots || []).indexOf(id) >= 0) {
        return CURSOR_SLOT_GROUPS[i].id;
      }
    }
    return defaultLayoutActionSceneId();
  }

  function buildCursorLayoutSceneGroups(m, byId) {
    return CURSOR_SLOT_GROUPS.map(function (g) {
      var options = [];
      (g.slots || []).forEach(function (sid) {
        if (byId[sid]) options.push(byId[sid]);
      });
      return {
        id: g.id,
        label: cursorSlotGroupLabel(g),
        rail: cursorSlotGroupRailLabel(g),
        desc: cursorSlotGroupDesc(g),
        options: options
      };
    }).filter(function (g) {
      return g.options.length;
    });
  }

  function renderCursorLayoutActionList(listHost, host, m) {
    var selectedSlot = editDraft && editDraft.mapping && String(editDraft.mapping.id) === String(m.id)
      ? String(editDraft.slotId || '')
      : '';
    var hint = host.querySelector('[data-soft-pad-action-hint]');
    layoutActionLayer = normalizeLayoutActionLayer(layoutActionLayer);
    var html = '';

    layoutActionLayer = 'browse';

    // browse = 按需求分类（场景）找 Agent 命令
    if (hint) {
      hint.textContent = t(
        'softPadLayoutBrowseHint',
        '左侧按需求分类；右侧选动作。也可直接搜索。'
      );
    }
    var libHost = host.closest('[data-soft-pad-action-library]') || host;
    var prevSearch = libHost.querySelector('[data-soft-pad-channel-search]');
    var searchVal = prevSearch
      ? String(prevSearch.value || '')
      : String(layoutChannelQuery || '');
    var byId = {};
    allSlotOptions(m).forEach(function (o) {
      byId[String(o.id || '')] = o;
    });
    var sceneGroups = buildCursorLayoutSceneGroups(m, byId);

    if (layoutActionSceneId === LAYOUT_SCENE_COMMON) {
      layoutActionSceneId = selectedSlot
        ? layoutSceneIdForSlot(selectedSlot)
        : defaultLayoutActionSceneId();
    }
    if (
      !searchVal &&
      (!layoutActionSceneId ||
        !sceneGroups.some(function (g) {
          return g.id === layoutActionSceneId;
        }))
    ) {
      layoutActionSceneId = selectedSlot
        ? layoutSceneIdForSlot(selectedSlot)
        : (sceneGroups[0] && sceneGroups[0].id) || defaultLayoutActionSceneId();
      if (
        !sceneGroups.some(function (g) {
          return g.id === layoutActionSceneId;
        })
      ) {
        layoutActionSceneId = (sceneGroups[0] && sceneGroups[0].id) || defaultLayoutActionSceneId();
      }
    }

    html += '<div class="soft-pad-action-scene-split">';
    html +=
      '<div class="soft-pad-action-scene-rail" role="tablist" aria-label="' +
      esc(t('softPadLayoutScenesRailAria', '场景目录')) +
      '">';
    sceneGroups.forEach(function (g) {
      var on = !searchVal && g.id === layoutActionSceneId;
      html +=
        '<button type="button" class="soft-pad-action-scene-rail__btn' +
        (on ? ' is-active' : '') +
        '" data-layout-scene="' +
        esc(g.id) +
        '" role="tab" aria-selected="' +
        (on ? 'true' : 'false') +
        '" title="' +
        esc(g.label) +
        '">' +
        '<span class="soft-pad-action-scene-rail__title">' +
        esc(g.rail) +
        '</span>' +
        '<small>' +
        (g.options || []).length +
        esc(t('softPadLayoutSceneItemCount', ' 项')) +
        '</small></button>';
    });
    html += '</div><div class="soft-pad-action-scene-pane" role="tabpanel">';

    if (searchVal) {
      var q = searchVal.toLowerCase();
      var hits = [];
      var seen = {};
      sceneGroups.forEach(function (g) {
        (g.options || []).forEach(function (o) {
          var id = String(o.id || '');
          if (!id || seen[id]) return;
          var when = layoutActionWhenText(id, m);
          var hay = (o.label + ' ' + id + ' ' + g.label + ' ' + g.desc + ' ' + when).toLowerCase();
          if (hay.indexOf(q) >= 0) {
            hits.push(id);
            seen[id] = true;
          }
        });
      });
      html +=
        '<div class="soft-pad-action-scene-meta">' +
        '<strong>' +
        esc(t('softPadLayoutSceneSearchMeta', '搜索结果')) +
        '</strong>' +
        '<span>' +
        hits.length +
        esc(t('softPadLayoutSceneHitCount', ' 条匹配')) +
        '</span></div>';
      if (!hits.length) {
        html +=
          '<p class="soft-pad-action-empty">' +
          esc(t('softPadLayoutActionEmpty', '没有匹配的命令')) +
          '</p>';
      } else {
        hits.forEach(function (id) {
          html += layoutActionRowHtml(id, m, selectedSlot, {});
        });
      }
    } else {
      var scene = sceneGroups.filter(function (g) {
        return g.id === layoutActionSceneId;
      })[0];
      if (scene) {
        html +=
          '<div class="soft-pad-action-scene-meta">' +
          '<strong>' +
          esc(scene.label) +
          '</strong>' +
          (scene.desc ? '<span>' + esc(scene.desc) + '</span>' : '') +
          '</div>';
        (scene.options || []).forEach(function (o) {
          html += layoutActionRowHtml(String(o.id || ''), m, selectedSlot, {});
        });
      } else {
        html +=
          '<p class="soft-pad-action-empty">' +
          esc(t('softPadLayoutActionEmpty', '没有匹配的命令')) +
          '</p>';
      }
    }

    html += '</div></div>';
    listHost.innerHTML = html;
  }

  function parkLayoutEditorOutsideList(listHost) {
    var ed = document.querySelector('[data-soft-pad-layout-editor="1"]');
    if (!ed || !listHost || !listHost.contains(ed)) return ed;
    var stack = listHost.closest('.soft-pad-layout-stack');
    if (stack) stack.appendChild(ed);
    return ed;
  }

  function placeLayoutEditorUnderSelection(host) {
    var ed = document.querySelector('[data-soft-pad-layout-editor="1"]');
    if (!ed || !host) return;
    var listHost = host.querySelector('[data-soft-pad-action-list]');
    if (!listHost) return;
    ed.classList.add('soft-pad-layout-editor--accordion');
    // 「自己录」新建自定义：藏下手风琴，避免改当前键。
    if (layoutActionLayer === 'custom') {
      var stackCustom = listHost.closest('.soft-pad-layout-stack');
      if (stackCustom && ed.parentNode !== stackCustom) stackCustom.appendChild(ed);
      ed.hidden = true;
      return;
    }
    var withSlot = listHost.querySelector(
      '.soft-pad-action-item.is-selected[data-layout-slot]:not([data-layout-slot=""])'
    );
    var unbound = listHost.querySelector('.soft-pad-action-item.is-selected.is-unbind');
    var anchor = withSlot || unbound;
    var pane = listHost.querySelector('.soft-pad-action-scene-pane');
    if (anchor) {
      if (anchor.nextElementSibling !== ed) {
        anchor.insertAdjacentElement('afterend', ed);
      }
      ed.hidden = false;
      scrollLayoutEditorIntoView(ed);
      return;
    }
    // No matching row (slot not in current rail) — still embed form in scene pane.
    if (pane) {
      if (ed.parentNode !== pane) pane.appendChild(ed);
      ed.hidden = !(editDraft && editDraft.microKeyId);
      if (!ed.hidden) scrollLayoutEditorIntoView(ed);
      return;
    }
    var stack = listHost.closest('.soft-pad-layout-stack');
    if (stack && ed.parentNode !== stack) stack.appendChild(ed);
    ed.hidden = !(editDraft && editDraft.microKeyId);
    if (!ed.hidden) scrollLayoutEditorIntoView(ed);
  }

  function scrollLayoutEditorIntoView(ed) {
    if (!ed) return;
    requestAnimationFrame(function () {
      try {
        ed.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } catch (_) {
        try { ed.scrollIntoView(true); } catch (_2) {}
      }
    });
  }

  /** Prefer the scene that owns the draft slot so the inline key form sits with its peers. */
  function revealCommonsLayoutForKey(m) {
    layoutActionLayer = 'browse';
    var slot = editDraft && editDraft.mapping && m &&
      String(editDraft.mapping.id) === String(m.id)
      ? String(editDraft.slotId || '')
      : '';
    layoutActionSceneId = layoutSceneIdForSlot(slot);
    var lib = document.querySelector('[data-soft-pad-action-library="1"]');
    if (lib && m) {
      // Clear search so the matching scene rail + pane are visible.
      layoutChannelTab = 'softPad';
      layoutChannelQuery = '';
      var sEl = lib.querySelector('[data-soft-pad-channel-search]');
      if (sEl) sEl.value = '';
      renderLayoutActionList(lib, m);
    }
  }

  function filteredBrowseRows() {
    var q = String(layoutBrowseQuery || '').trim().toLowerCase();
    return (layoutBrowseRows || []).filter(function (row) {
      if (!row || row.channel !== layoutBrowseChannel) return false;
      if (!q) return true;
      return (String(row.name || '') + ' ' + String(row.note || '')).toLowerCase().indexOf(q) >= 0;
    });
  }

  function browseRowKey(row) {
    if (!row) return '';
    return String(row.channel || '') + '::' + String(row.slotId || '') + '::' + String(row.note || '');
  }

  function ensureBrowseSheet() {
    var el = document.getElementById('softPadBrowseSheet');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'softPadBrowseSheet';
    el.className = 'soft-pad-browse-sheet';
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="soft-pad-browse-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="softPadBrowseSheetTitle">' +
      '<div class="soft-pad-browse-sheet__view is-on" data-browse-view="browse">' +
      '<div class="soft-pad-browse-sheet__head">' +
      '<div><h2 id="softPadBrowseSheetTitle">' +
      esc(t('softPadLayoutBrowseSheetTitle', '选择命令')) +
      '</h2><p>' +
      esc(t('softPadLayoutBrowseSheetSub', '其它通道已有命令')) +
      '</p></div>' +
      '<button type="button" class="soft-pad-browse-sheet__close" data-browse-close="1" aria-label="' +
      esc(t('softPadLayoutBrowseClose', '关闭')) +
      '">×</button></div>' +
      '<div class="soft-pad-browse-sheet__ctx" data-browse-ctx="1"></div>' +
      '<div class="soft-pad-browse-sheet__tabs" role="tablist" aria-label="' +
      esc(t('softPadLayoutBrowseChannelsAria', '通道')) +
      '">' +
      '<button type="button" class="soft-pad-browse-sheet__tab is-on" data-browse-ch="key" role="tab">' +
      esc(t('softPadLayoutBrowseChKey', '按键')) +
      '<em data-browse-count="key">0</em></button>' +
      '<button type="button" class="soft-pad-browse-sheet__tab" data-browse-ch="voice" role="tab">' +
      esc(t('softPadLayoutBrowseChVoice', '口头')) +
      '<em data-browse-count="voice">0</em></button>' +
      '<button type="button" class="soft-pad-browse-sheet__tab" data-browse-ch="camera" role="tab">' +
      esc(t('softPadLayoutBrowseChGesture', '手势')) +
      '<em data-browse-count="camera">0</em></button>' +
      '</div>' +
      '<label class="soft-pad-browse-sheet__search">' +
      '<span aria-hidden="true">⌕</span>' +
      '<input type="search" data-browse-search="1" autocomplete="off" spellcheck="false" placeholder="' +
      esc(t('softPadLayoutBrowseSearchPh', '搜索名称')) +
      '" /></label>' +
      '<div class="soft-pad-browse-sheet__list" data-browse-list="1" role="listbox"></div>' +
      '<div class="soft-pad-browse-sheet__escape">' +
      '<button type="button" data-browse-open-record="1">' +
      esc(t('softPadLayoutBrowseEscapeRecord', '没有想要的？录制按键')) +
      '</button></div>' +
      '<div class="soft-pad-browse-sheet__foot">' +
      '<p data-browse-foot="1">' +
      esc(t('softPadLayoutBrowsePickHint', '点一条选中')) +
      '</p>' +
      '<div class="soft-pad-browse-sheet__actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-browse-close="1">' +
      esc(t('softPadLayoutBrowseCancel', '取消')) +
      '</button>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-browse-sheet__ok" data-browse-confirm="1" disabled>' +
      esc(t('softPadLayoutBrowseUse', '用这个')) +
      '</button></div></div></div>' +
      '<div class="soft-pad-browse-sheet__view" data-browse-view="record">' +
      '<div class="soft-pad-browse-sheet__head">' +
      '<div><h2>' +
      esc(t('softPadLayoutBrowseRecordTitle', '录制按键')) +
      '</h2><p>' +
      esc(t('softPadLayoutBrowseRecordSub', '补目录缺口 · 录完可绑到 Soft Pad')) +
      '</p></div>' +
      '<button type="button" class="soft-pad-browse-sheet__close" data-browse-close="1" aria-label="' +
      esc(t('softPadLayoutBrowseClose', '关闭')) +
      '">×</button></div>' +
      '<div class="soft-pad-browse-sheet__ctx" data-browse-ctx-rec="1"></div>' +
      '<div class="soft-pad-browse-sheet__record">' +
      '<label class="soft-pad-browse-sheet__field"><span>' +
      esc(t('softPadLayoutCustomNameLbl', '名称')) +
      '</span><input type="text" data-browse-rec-name="1" autocomplete="off" spellcheck="false" placeholder="' +
      esc(t('softPadLayoutCustomNamePh', '例如：打开终端分屏')) +
      '" /></label>' +
      '<div class="soft-pad-browse-sheet__chord-row">' +
      '<span class="soft-pad-browse-sheet__chord is-empty" data-browse-rec-chord="1">' +
      esc(t('softPadLayoutBrowseChordEmpty', '尚未录制')) +
      '</span>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-browse-sheet__ok" data-browse-rec-listen="1">' +
      esc(t('softPadLayoutStartRecordBtn', '开始听键')) +
      '</button></div>' +
      '<p class="soft-pad-browse-sheet__hint">' +
      esc(t('softPadLayoutBrowseRecordHint', '保存后进「自定义」分类，并可用于当前 Soft Pad 键。')) +
      '</p></div>' +
      '<div class="soft-pad-browse-sheet__foot">' +
      '<p data-browse-rec-foot="1">' +
      esc(t('softPadLayoutBrowseRecordFoot', '填写名称并录制按键')) +
      '</p>' +
      '<div class="soft-pad-browse-sheet__actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-browse-back="1">' +
      esc(t('softPadLayoutBrowseBackList', '返回列表')) +
      '</button>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-browse-sheet__ok" data-browse-rec-save="1" disabled>' +
      esc(t('softPadLayoutBrowseRecordSave', '加入并使用')) +
      '</button></div></div></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', onBrowseSheetClick);
    el.addEventListener('input', onBrowseSheetInput);
    return el;
  }

  function browseBindTargetText() {
    var keyLbl = editDraft && editDraft.microKeyId
      ? humanMicroKeyLabel(editDraft.microKeyId)
      : '—';
    return t('softPadLayoutBrowseBindCtx', '绑到 屏幕按钮 · {key}').replace('{key}', keyLbl);
  }

  function showBrowseView(view) {
    layoutBrowseView = view === 'record' ? 'record' : 'browse';
    var el = ensureBrowseSheet();
    el.querySelectorAll('[data-browse-view]').forEach(function (v) {
      v.classList.toggle('is-on', v.getAttribute('data-browse-view') === layoutBrowseView);
    });
  }

  function paintBrowseCounts() {
    var el = ensureBrowseSheet();
    var c = { key: 0, voice: 0, camera: 0 };
    (layoutBrowseRows || []).forEach(function (row) {
      if (row && c[row.channel] != null) c[row.channel]++;
    });
    Object.keys(c).forEach(function (k) {
      var node = el.querySelector('[data-browse-count="' + k + '"]');
      if (node) node.textContent = String(c[k]);
    });
  }

  function paintBrowseList() {
    var el = ensureBrowseSheet();
    var list = el.querySelector('[data-browse-list]');
    var foot = el.querySelector('[data-browse-foot]');
    var ok = el.querySelector('[data-browse-confirm]');
    if (!list) return;
    var rows = filteredBrowseRows();
    if (!rows.length) {
      list.innerHTML =
        '<p class="soft-pad-browse-sheet__empty">' +
        esc(t('softPadLayoutBrowseEmpty', '这个通道还没有已定义命令')) +
        '</p>';
    } else {
      var selKey = browseRowKey(layoutBrowseSelected);
      list.innerHTML = rows
        .map(function (row) {
          var key = browseRowKey(row);
          var on = selKey && key === selKey;
          return (
            '<button type="button" class="soft-pad-browse-sheet__cmd' +
            (on ? ' is-sel' : '') +
            '" data-browse-row="' +
            esc(key) +
            '" role="option" aria-selected="' +
            (on ? 'true' : 'false') +
            '"><span class="soft-pad-browse-sheet__cmd-title">' +
            esc(row.name) +
            '</span><span class="soft-pad-browse-sheet__cmd-note">' +
            esc(row.note || '—') +
            '</span>' +
            (on && row.blurb
              ? '<span class="soft-pad-browse-sheet__cmd-blurb">' + esc(row.blurb) + '</span>'
              : '') +
            '</button>'
          );
        })
        .join('');
    }
    if (foot) {
      foot.innerHTML = layoutBrowseSelected
        ? t('softPadLayoutBrowseSelected', '已选 <b>{name}</b>').replace(
            '{name}',
            esc(layoutBrowseSelected.name || '')
          )
        : esc(t('softPadLayoutBrowsePickHint', '点一条选中'));
    }
    if (ok) ok.disabled = !layoutBrowseSelected;
  }

  function paintBrowseSheetChrome() {
    var el = ensureBrowseSheet();
    var ctx = browseBindTargetText();
    el.querySelectorAll('[data-browse-ctx], [data-browse-ctx-rec]').forEach(function (node) {
      node.textContent = ctx;
    });
    el.querySelectorAll('[data-browse-ch]').forEach(function (btn) {
      var on = btn.getAttribute('data-browse-ch') === layoutBrowseChannel;
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    paintBrowseCounts();
    paintBrowseList();
    paintBrowseRecordFoot();
  }

  function paintBrowseRecordFoot() {
    var el = document.getElementById('softPadBrowseSheet');
    if (!el) return;
    var name = String(layoutCustomDraft.name || '').trim();
    var chord = String(layoutCustomRecChord || '').trim();
    var save = el.querySelector('[data-browse-rec-save]');
    var foot = el.querySelector('[data-browse-rec-foot]');
    var chordEl = el.querySelector('[data-browse-rec-chord]');
    if (chordEl) {
      if (chord) {
        chordEl.textContent = friendlyChord(chord) || chord;
        chordEl.classList.remove('is-empty');
      } else {
        chordEl.textContent = t('softPadLayoutBrowseChordEmpty', '尚未录制');
        chordEl.classList.add('is-empty');
      }
    }
    var ok = !!(name && chord);
    if (save) save.disabled = !ok;
    if (foot) {
      foot.innerHTML = ok
        ? t('softPadLayoutBrowseRecordReady', '将保存 <b>{name}</b>（{chord}）')
            .replace('{name}', esc(name))
            .replace('{chord}', esc(friendlyChord(chord) || chord))
        : esc(t('softPadLayoutBrowseRecordFoot', '填写名称并录制按键'));
    }
  }

  function closeBrowseSheet() {
    var el = document.getElementById('softPadBrowseSheet');
    if (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    }
    layoutBrowseMapping = null;
    layoutBrowseSelected = null;
    layoutBrowseView = 'browse';
    layoutCustomRecBindPad = false;
  }

  function openBrowseSheet(m) {
    if (!m) return;
    if (!editDraft) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return;
    }
    layoutBrowseMapping = m;
    layoutBrowseChannel = 'key';
    layoutBrowseSelected = null;
    layoutBrowseQuery = '';
    layoutBrowseRows = collectSoftPadOtherChannelRows(m, []);
    layoutCustomDraft = { name: '', phrases: '' };
    layoutCustomRecChord = '';
    layoutCustomRecBindPad = false;
    var el = ensureBrowseSheet();
    var search = el.querySelector('[data-browse-search]');
    if (search) search.value = '';
    var nameEl = el.querySelector('[data-browse-rec-name]');
    if (nameEl) nameEl.value = '';
    showBrowseView('browse');
    paintBrowseSheetChrome();
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');

    var store = global.OneToneSemanticActionStore;
    if (store && (store.bindingViewsForMappingCached || store.bindingViews)) {
      var p = store.bindingViewsForMappingCached
        ? store.bindingViewsForMappingCached(m.id, true)
        : store.bindingViews(m.id);
      Promise.resolve(p)
        .then(function (views) {
          if (layoutBrowseMapping !== m) return;
          layoutBrowseRows = collectSoftPadOtherChannelRows(m, views || []);
          paintBrowseSheetChrome();
        })
        .catch(function () {});
    }
  }

  function confirmBrowseSelection() {
    if (!layoutBrowseSelected || !editDraft) return;
    var slotId = String(layoutBrowseSelected.slotId || '').trim();
    if (!slotId) return;
    onLayoutActionPick(slotId);
    toast(
      t('softPadLayoutBrowseBoundToast', '已绑到当前键：{name}').replace(
        '{name}',
        layoutBrowseSelected.name || slotId
      )
    );
    closeBrowseSheet();
  }

  function startBrowseRecordListen() {
    var m = layoutBrowseMapping;
    var el = ensureBrowseSheet();
    var nameEl = el.querySelector('[data-browse-rec-name]');
    if (nameEl) layoutCustomDraft.name = String(nameEl.value || '');
    if (!String(layoutCustomDraft.name || '').trim()) {
      toast(t('softPadLayoutCustomNeedName', '请先填写名称'));
      if (nameEl) nameEl.focus();
      return;
    }
    layoutCustomRecBindPad = true;
    layoutRecSheetMode = 'custom';
    beginRecSheetListen(m);
  }

  function saveBrowseRecordWithoutListen() {
    // If chord already captured in browse chord pill (from listen sheet round-trip).
    var m = layoutBrowseMapping;
    var el = ensureBrowseSheet();
    var nameEl = el.querySelector('[data-browse-rec-name]');
    if (nameEl) layoutCustomDraft.name = String(nameEl.value || '');
    if (!String(layoutCustomDraft.name || '').trim() || !layoutCustomRecChord) {
      toast(t('softPadLayoutBrowseRecordFoot', '填写名称并录制按键'));
      return;
    }
    layoutCustomRecBindPad = true;
    var entry = createCustomShortcut(m, {
      name: layoutCustomDraft.name,
      phrases: layoutCustomDraft.phrases,
      chord: layoutCustomRecChord
    });
    if (!entry) {
      toast(t('softPadLayoutCustomSaveFail', '没能保存，请检查名称后重试'));
      return;
    }
    layoutCustomDraft = { name: '', phrases: '' };
    layoutCustomRecChord = '';
    if (editDraft) onLayoutActionPick(entry.id);
    layoutActionLayer = 'browse';
    layoutActionSceneId = defaultLayoutActionSceneId();
    toast(t('softPadLayoutCustomSavedToast', '已保存自定义快捷键'));
    if (m) refreshLayoutActionLibrary(m);
    closeBrowseSheet();
  }

  function onBrowseSheetClick(ev) {
    var el = ensureBrowseSheet();
    if (ev.target === el) {
      closeBrowseSheet();
      return;
    }
    var closeBtn = ev.target.closest && ev.target.closest('[data-browse-close]');
    if (closeBtn) {
      ev.preventDefault();
      closeBrowseSheet();
      return;
    }
    var tab = ev.target.closest && ev.target.closest('[data-browse-ch]');
    if (tab) {
      ev.preventDefault();
      layoutBrowseChannel = normalizeBrowseChannel(tab.getAttribute('data-browse-ch'));
      layoutBrowseSelected = null;
      paintBrowseSheetChrome();
      return;
    }
    var rowBtn = ev.target.closest && ev.target.closest('[data-browse-row]');
    if (rowBtn) {
      ev.preventDefault();
      var key = rowBtn.getAttribute('data-browse-row') || '';
      layoutBrowseSelected =
        (layoutBrowseRows || []).filter(function (r) {
          return browseRowKey(r) === key;
        })[0] || null;
      paintBrowseList();
      return;
    }
    var confirm = ev.target.closest && ev.target.closest('[data-browse-confirm]');
    if (confirm && !confirm.disabled) {
      ev.preventDefault();
      confirmBrowseSelection();
      return;
    }
    var openRec = ev.target.closest && ev.target.closest('[data-browse-open-record]');
    if (openRec) {
      ev.preventDefault();
      layoutCustomDraft = { name: '', phrases: '' };
      layoutCustomRecChord = '';
      var nameEl = el.querySelector('[data-browse-rec-name]');
      if (nameEl) nameEl.value = '';
      showBrowseView('record');
      paintBrowseRecordFoot();
      if (nameEl) nameEl.focus();
      return;
    }
    var back = ev.target.closest && ev.target.closest('[data-browse-back]');
    if (back) {
      ev.preventDefault();
      showBrowseView('browse');
      return;
    }
    var listen = ev.target.closest && ev.target.closest('[data-browse-rec-listen]');
    if (listen) {
      ev.preventDefault();
      startBrowseRecordListen();
      return;
    }
    var save = ev.target.closest && ev.target.closest('[data-browse-rec-save]');
    if (save && !save.disabled) {
      ev.preventDefault();
      saveBrowseRecordWithoutListen();
    }
  }

  function onBrowseSheetInput(ev) {
    var tEl = ev.target;
    if (!tEl || !tEl.getAttribute) return;
    if (tEl.getAttribute('data-browse-search') === '1') {
      layoutBrowseQuery = String(tEl.value || '');
      layoutBrowseSelected = null;
      paintBrowseList();
      return;
    }
    if (tEl.getAttribute('data-browse-rec-name') === '1') {
      layoutCustomDraft.name = String(tEl.value || '');
      paintBrowseRecordFoot();
    }
  }

  function ensureCustomRecSheet() {
    var el = document.getElementById('softPadCustomRecSheet');
    // Drop stale sheet markup from older builds (extra copy / 关闭).
    if (el && el.querySelector('.soft-pad-custom-rec-sheet__sub')) {
      try { el.remove(); } catch (_) {}
      el = null;
    }
    if (el) {
      var cancelBtn = el.querySelector('.soft-pad-custom-rec-sheet__actions [data-custom-rec-cancel]');
      if (cancelBtn) cancelBtn.textContent = t('softPadLayoutCustomRecCancel', '取消');
      return el;
    }
    el = document.createElement('div');
    el.id = 'softPadCustomRecSheet';
    el.className = 'soft-pad-custom-rec-sheet';
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<div class="soft-pad-custom-rec-sheet__panel" role="dialog" aria-modal="true">' +
      '<div class="soft-pad-custom-rec-sheet__head">' +
      '<button type="button" class="soft-pad-custom-rec-sheet__back" data-custom-rec-cancel="1">‹ ' +
      esc(t('softPadLayoutCustomRecBack', '返回')) +
      '</button>' +
      '<strong>' +
      esc(t('softPadLayoutCustomRecTitle', '录制快捷键')) +
      '</strong><span></span></div>' +
      '<div class="soft-pad-custom-rec-sheet__pulse" data-custom-rec-pulse="1">' +
      esc(t('softPadLayoutRecordingBtn', '正在听键…')) +
      '</div>' +
      '<p class="soft-pad-custom-rec-sheet__copy" data-custom-rec-copy="1"></p>' +
      '<div class="soft-pad-custom-rec-sheet__chord" data-custom-rec-chord="1">—</div>' +
      '<div class="soft-pad-custom-rec-sheet__actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-custom-rec-cancel="1">' +
      esc(t('softPadLayoutCustomRecCancel', '取消')) +
      '</button>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-custom-rec-sheet__ok" data-custom-rec-ok="1" disabled>' +
      esc(t('softPadLayoutCustomRecOk', '确认并加入常见')) +
      '</button></div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (ev) {
      if (ev.target === el) closeCustomRecSheet(false);
      var cancel = ev.target.closest && ev.target.closest('[data-custom-rec-cancel]');
      if (cancel) {
        ev.preventDefault();
        closeCustomRecSheet(false);
        return;
      }
      var ok = ev.target.closest && ev.target.closest('[data-custom-rec-ok]');
      if (ok && !ok.disabled) {
        ev.preventDefault();
        closeCustomRecSheet(true);
      }
    });
    return el;
  }

  function paintCustomRecSheet() {
    var el = ensureCustomRecSheet();
    var pulse = el.querySelector('[data-custom-rec-pulse]');
    var copy = el.querySelector('[data-custom-rec-copy]');
    var chordEl = el.querySelector('[data-custom-rec-chord]');
    var ok = el.querySelector('[data-custom-rec-ok]');
    var isKey = layoutRecSheetMode === 'layoutKey';
    if (ok) {
      ok.textContent = isKey
        ? t('softPadLayoutCustomRecOkKey', '确认')
        : t('softPadLayoutCustomRecOk', '确认并加入常见');
    }
    if (layoutCustomRecChord) {
      if (pulse) {
        pulse.classList.add('is-done');
        pulse.textContent = t('softPadLayoutCustomRecGot', '已收到');
      }
      if (copy) {
        copy.textContent = isKey
          ? t('softPadLayoutCustomRecConfirmKey', '确认后写入这个键')
          : t('softPadLayoutCustomRecConfirm', '确认后将自动加入常见');
      }
      if (chordEl) chordEl.textContent = friendlyChord(layoutCustomRecChord) || layoutCustomRecChord;
      if (ok) ok.disabled = false;
    } else {
      if (pulse) {
        pulse.classList.remove('is-done');
        pulse.textContent = t('softPadLayoutRecordingBtn', '正在听键…');
      }
      if (copy) copy.textContent = t('softPadLayoutCustomRecListen', '请按下 Cursor 里要用的组合键');
      if (chordEl) chordEl.textContent = '—';
      if (ok) ok.disabled = true;
    }
  }

  function closeCustomRecSheet(apply) {
    var el = document.getElementById('softPadCustomRecSheet');
    var rec = global.OneToneMappingRecording;
    if (rec && rec.mode && rec.mode() !== 'none' && rec.cancel) {
      try { rec.cancel(); } catch (_) {}
    }
    layoutCustomRecListening = false;
    if (el) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    }
    var mode = layoutRecSheetMode;
    layoutRecSheetMode = 'custom';
    if (!apply) {
      if (!layoutCustomRecBindPad) layoutCustomRecChord = '';
      else paintBrowseRecordFoot();
      return;
    }
    if (!layoutCustomRecChord) return;
    var chord = layoutCustomRecChord;
    layoutCustomRecChord = '';
    if (mode === 'layoutKey') {
      if (!editDraft) return;
      editDraft.chord = String(chord || '').trim();
      syncLayoutKeyFormFields();
      commitEditKeycapDraft({ keepOpen: true, quiet: true });
      toast(t('softPadLayoutRecordUpdatedToast', '快捷键已更新'));
      return;
    }
    var Cap = global.OneToneAgentCapabilityUi;
    var m =
      (editDraft && editDraft.mapping) ||
      (Cap && Cap.activeCodexMapping && Cap.activeCodexMapping());
    var entry = createCustomShortcut(m, {
      name: layoutCustomDraft.name,
      phrases: layoutCustomDraft.phrases,
      chord: chord
    });
    if (!entry) {
      layoutCustomRecBindPad = false;
      toast(t('softPadLayoutCustomSaveFail', '没能保存，请检查名称后重试'));
      return;
    }
    var bindPad = layoutCustomRecBindPad;
    layoutCustomRecBindPad = false;
    layoutCustomDraft = { name: '', phrases: '' };
    layoutActionLayer = 'browse';
    layoutActionSceneId = defaultLayoutActionSceneId();
    toast(t('softPadLayoutCustomSavedToast', '已保存自定义快捷键'));
    if (bindPad && editDraft) onLayoutActionPick(entry.id);
    if (m) refreshLayoutActionLibrary(m);
    closeBrowseSheet();
  }

  function beginRecSheetListen(m) {
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) {
      toast(t('codexMicroPadRecordBusy', '请先结束按键录制'));
      return false;
    }
    if (rec.mode && rec.mode() !== 'none') {
      toast(t('codexMicroPadRecordBusy', '请先结束按键录制'));
      return false;
    }
    if (!m || !m.id) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return false;
    }
    layoutCustomRecChord = '';
    layoutCustomRecListening = true;
    var el = ensureCustomRecSheet();
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    paintCustomRecSheet();
    var started = rec.startAgentBinding(m.id, {
      onDone: function (chord) {
        layoutCustomRecListening = false;
        layoutCustomRecChord = String(chord || '').trim();
        paintCustomRecSheet();
        if (layoutCustomRecBindPad) paintBrowseRecordFoot();
      },
      onCancel: function () {
        layoutCustomRecListening = false;
        if (!layoutCustomRecChord) closeCustomRecSheet(false);
      }
    });
    if (started && typeof started.then === 'function') {
      started.then(function (ok) {
        if (ok) return;
        layoutCustomRecListening = false;
        closeCustomRecSheet(false);
        toast(t('softPadLayoutRecordFailed', '没能开始录制，请再试一次'));
      });
    }
    return true;
  }

  function openCustomRecSheet(m) {
    var nameEl = document.querySelector('[data-layout-custom-name]');
    var phrasesEl = document.querySelector('[data-layout-custom-phrases]');
    var browseName = document.querySelector('[data-browse-rec-name]');
    if (nameEl) layoutCustomDraft.name = String(nameEl.value || '');
    if (phrasesEl) layoutCustomDraft.phrases = String(phrasesEl.value || '');
    if (browseName) layoutCustomDraft.name = String(browseName.value || '');
    if (!String(layoutCustomDraft.name || '').trim()) {
      toast(t('softPadLayoutCustomNeedName', '请先填写名称'));
      if (browseName) browseName.focus();
      else if (nameEl) nameEl.focus();
      return;
    }
    layoutRecSheetMode = 'custom';
    beginRecSheetListen(m);
  }

  function renderLayoutActionList(host, m) {
    if (!host || !m) return;
    var listHost = host.querySelector('[data-soft-pad-action-list]');
    if (!listHost) return;

    parkLayoutEditorOutsideList(listHost);
    paintSoftPadLayoutChannelChrome(host, m);

    var channel = normalizeLayoutChannelTab(layoutChannelTab);
    var hint = host.querySelector('[data-soft-pad-action-hint]');
    if (hint) hint.textContent = '';
    if (channel === 'ime') {
      renderLayoutImeChannelList(listHost, m);
    } else if (channel === 'key') {
      renderLayoutKeyChannelList(listHost, m);
    } else if (channel === 'voice') {
      renderLayoutVoiceChannelList(listHost, m);
    } else if (channel === 'camera') {
      renderLayoutCameraChannelList(listHost, m);
    } else if (channel === 'cursor') {
      renderLayoutCursorChannelList(listHost, m);
    } else if (channel === 'softPad') {
      renderLayoutSoftPadChannelList(listHost, m);
      placeLayoutEditorUnderSelection(host);
    }
  }

  function bindLayoutActionLibrary(host, m) {
    if (!host || !m) return;
    function liveMapping() {
      try {
        var scope = host.closest('[data-soft-pad-mapping]') || host;
        var mid = String((scope && scope.getAttribute('data-soft-pad-mapping')) || m.id || '').trim();
        if (mid && global.OneToneMappingCore && global.OneToneMappingCore.byId) {
          var live = global.OneToneMappingCore.byId(mid);
          if (live) return live;
        }
      } catch (_) {}
      return m;
    }
    if (!host.__softPadActionClickBound) {
      host.__softPadActionClickBound = true;
      host.addEventListener('click', function (ev) {
        var cur = liveMapping();
        var chBtn = ev.target.closest && ev.target.closest('[data-layout-channel]');
        if (chBtn && host.contains(chBtn)) {
          var nextCh = normalizeLayoutChannelTab(chBtn.getAttribute('data-layout-channel') || 'cursor');
          if (nextCh !== layoutChannelTab) {
            layoutChannelTab = nextCh;
            layoutChannelQuery = '';
            var chSearch = host.querySelector('[data-soft-pad-channel-search]');
            if (chSearch) chSearch.value = '';
            if (nextCh === 'softPad') layoutActionSceneId = defaultLayoutActionSceneId();
            if (nextCh === 'cursor') layoutCursorPickSubtab = 'talk';
          }
          renderLayoutActionList(host, cur);
          try {
            var sceneCh = global.OneToneKeysSceneActionsPanel;
            if (sceneCh && typeof sceneCh.refresh === 'function') sceneCh.refresh();
          } catch (_) {}
          return;
        }
        var cursorSub = ev.target.closest && ev.target.closest('[data-layout-cursor-subtab]');
        if (cursorSub && host.contains(cursorSub)) {
          ev.preventDefault();
          layoutCursorPickSubtab = cursorSub.getAttribute('data-layout-cursor-subtab') || 'talk';
          renderLayoutActionList(host, cur);
          return;
        }
        var cursorRow = ev.target.closest && ev.target.closest('[data-layout-cursor-row]');
        if (cursorRow && host.contains(cursorRow)) {
          ev.preventDefault();
          if (cursorRow.getAttribute('aria-disabled') === 'true') return;
          var slotAttr = cursorRow.getAttribute('data-layout-slot');
          if (slotAttr != null) {
            if (!editDraft) {
              toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
              return;
            }
            onLayoutActionPick(slotAttr);
            return;
          }
          bindCursorShortcutToPadKey(cur, {
            slotId: cursorRow.getAttribute('data-cursor-slot') || '',
            title: cursorRow.getAttribute('data-cursor-title') || '',
            chord: cursorRow.getAttribute('data-cursor-chord') || ''
          });
          return;
        }
        var imePresetBtn = ev.target.closest && ev.target.closest('[data-soft-pad-ime-id]');
        if (imePresetBtn && host.contains(imePresetBtn)) {
          ev.preventDefault();
          var Ime = global.OneToneImePresets;
          var preset =
            Ime && Ime.presetById
              ? Ime.presetById(imePresetBtn.getAttribute('data-soft-pad-ime-id'))
              : null;
          if (preset) bindImePresetToPadKey(cur, preset);
          return;
        }
        var imePickerBtn = ev.target.closest && ev.target.closest('[data-soft-pad-ime-picker]');
        if (imePickerBtn && host.contains(imePickerBtn)) {
          ev.preventDefault();
          toast(t('softPadLayoutImeGoKeys', '自定义听写键请去按键设置 → 听写方式'));
          return;
        }
        var imeCustomBtn = ev.target.closest && ev.target.closest('[data-soft-pad-ime-custom]');
        if (imeCustomBtn && host.contains(imeCustomBtn)) {
          ev.preventDefault();
          toast(t('softPadLayoutImeGoKeys', '自定义听写键请去按键设置 → 听写方式'));
          return;
        }
        var customKeyBtn = ev.target.closest && ev.target.closest('[data-layout-custom-key]');
        if (customKeyBtn && host.contains(customKeyBtn)) {
          ev.preventDefault();
          bindCustomKeyRowToPadKey(cur, {
            mappingId: customKeyBtn.getAttribute('data-custom-key-id') || '',
            name: customKeyBtn.getAttribute('data-custom-key-name') || '',
            chord: customKeyBtn.getAttribute('data-custom-key-chord') || ''
          });
          return;
        }
        var goCam = ev.target.closest && ev.target.closest('[data-layout-go-camera]');
        if (goCam && host.contains(goCam)) {
          ev.preventDefault();
          try {
            var mid = String((cur && cur.id) || '').trim();
            var drawer = global.OneToneSettingsDrawer;
            if (drawer && typeof drawer.setPanel === 'function') {
              if (mid) drawer.setPanel('camera', { mappingId: mid });
              else drawer.setPanel('camera');
            } else {
              toast(t('keysCameraPickGoCameraToast', '请打开摄像头设置'));
            }
          } catch (_) {
            toast(t('keysCameraPickGoCameraToast', '请打开摄像头设置'));
          }
          return;
        }
        var cameraBtn = ev.target.closest && ev.target.closest('[data-layout-camera]');
        if (cameraBtn && host.contains(cameraBtn)) {
          ev.preventDefault();
          if (cameraBtn.getAttribute('aria-disabled') === 'true') return;
          bindCameraGestureToPadKey(cur, {
            pickId: cameraBtn.getAttribute('data-camera-pick') || '',
            actionId: cameraBtn.getAttribute('data-camera-action') || '',
            slotId: cameraBtn.getAttribute('data-layout-slot') || '',
            title: cameraBtn.getAttribute('data-camera-title') || '',
            name: cameraBtn.getAttribute('data-camera-title') || '',
            bindable: true
          });
          return;
        }
        var promptBtn = ev.target.closest && ev.target.closest('[data-layout-voice-prompt]');
        if (promptBtn && host.contains(promptBtn)) {
          ev.preventDefault();
          bindPromptInjectToPadKey(cur, {
            name: promptBtn.getAttribute('data-prompt-name') || '',
            say: promptBtn.getAttribute('data-prompt-text') || ''
          });
          return;
        }
        var padSubtab = ev.target.closest && ev.target.closest('[data-layout-softpad-subtab]');
        if (padSubtab && host.contains(padSubtab)) {
          ev.preventDefault();
          layoutSoftPadPickSubtab = padSubtab.getAttribute('data-layout-softpad-subtab') || 'dictation';
          renderLayoutActionList(host, cur);
          return;
        }
        var recEsc = ev.target.closest && ev.target.closest('[data-layout-browse-open-record]');
        if (recEsc && host.contains(recEsc)) {
          ev.preventDefault();
          openBrowseSheet(cur);
          showBrowseView('record');
          return;
        }
        var layerBtn = ev.target.closest && ev.target.closest('[data-layout-layer]');
        if (layerBtn && host.contains(layerBtn)) {
          layoutActionLayer = normalizeLayoutActionLayer(
            layerBtn.getAttribute('data-layout-layer') || 'browse'
          );
          if (layoutActionLayer === 'browse' && !layoutActionSceneId) {
            layoutActionSceneId = defaultLayoutActionSceneId();
          }
          renderLayoutActionList(host, cur);
          return;
        }
        var sceneBtn = ev.target.closest && ev.target.closest('[data-layout-scene]');
        if (sceneBtn && host.contains(sceneBtn)) {
          layoutActionSceneId = sceneBtn.getAttribute('data-layout-scene') || '';
          layoutChannelQuery = '';
          var sClear = host.querySelector('[data-soft-pad-channel-search]');
          if (sClear) sClear.value = '';
          renderLayoutActionList(host, cur);
          return;
        }
        var pinBtn = ev.target.closest && ev.target.closest('[data-layout-pin]');
        if (pinBtn && host.contains(pinBtn)) {
          ev.preventDefault();
          ev.stopPropagation();
          var pinId = pinBtn.getAttribute('data-layout-pin') || '';
          if (getCursorCommonSlotIds(cur.codexMicroPad).indexOf(pinId) >= 0) {
            unpinCursorCommonSlot(cur, pinId);
            toast(t('softPadLayoutUnpinnedToast', '已移出常见'));
          } else if (pinCursorCommonSlot(cur, pinId)) {
            toast(t('softPadLayoutPinnedToast', '已加入「我的常见」'));
          }
          renderLayoutActionList(host, cur);
          return;
        }
        var unpinBtn = ev.target.closest && ev.target.closest('[data-layout-unpin]');
        if (unpinBtn && host.contains(unpinBtn)) {
          ev.preventDefault();
          ev.stopPropagation();
          unpinCursorCommonSlot(cur, unpinBtn.getAttribute('data-layout-unpin') || '');
          toast(t('softPadLayoutUnpinnedToast', '已移出常见'));
          renderLayoutActionList(host, cur);
          return;
        }
        var moveBtn = ev.target.closest && ev.target.closest('[data-layout-common-move]');
        if (moveBtn && host.contains(moveBtn)) {
          ev.preventDefault();
          ev.stopPropagation();
          if (moveBtn.disabled) return;
          moveCursorCommonSlot(
            cur,
            moveBtn.getAttribute('data-layout-common-id') || '',
            moveBtn.getAttribute('data-layout-common-move') || ''
          );
          renderLayoutActionList(host, cur);
          return;
        }
        var resetBtn = ev.target.closest && ev.target.closest('[data-layout-common-reset]');
        if (resetBtn && host.contains(resetBtn)) {
          ev.preventDefault();
          ev.stopPropagation();
          resetCursorCommonSlots(cur);
          toast(t('softPadLayoutCommonResetToast', '已恢复默认常见'));
          renderLayoutActionList(host, cur);
          return;
        }
        var delCustom = ev.target.closest && ev.target.closest('[data-layout-custom-delete]');
        if (delCustom && host.contains(delCustom)) {
          ev.preventDefault();
          ev.stopPropagation();
          deleteCustomShortcut(cur, delCustom.getAttribute('data-layout-custom-delete') || '');
          toast(t('softPadLayoutCustomDeletedToast', '已删除自定义快捷键'));
          renderLayoutActionList(host, cur);
          return;
        }
        var customRec = ev.target.closest && ev.target.closest('[data-layout-custom-record]');
        if (customRec && host.contains(customRec)) {
          ev.preventDefault();
          openCustomRecSheet(cur);
          return;
        }
        var browseOpen = ev.target.closest && ev.target.closest('[data-layout-browse-open]');
        if (browseOpen && host.contains(browseOpen)) {
          ev.preventDefault();
          openBrowseSheet(cur);
          return;
        }
        var btn = ev.target.closest && ev.target.closest('[data-layout-slot]');
        if (!btn || !host.contains(btn)) return;
        if (!editDraft) {
          toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
          return;
        }
        ev.preventDefault();
        onLayoutActionPick(btn.getAttribute('data-layout-slot') || '');
      });
      host.addEventListener('input', function (ev) {
        var tEl = ev.target;
        if (!tEl || !tEl.getAttribute) return;
        if (tEl.getAttribute('data-layout-custom-name') === '1') {
          layoutCustomDraft.name = String(tEl.value || '');
          return;
        }
        if (tEl.getAttribute('data-layout-custom-phrases') === '1') {
          layoutCustomDraft.phrases = String(tEl.value || '');
          return;
        }
        if (tEl.getAttribute('data-soft-pad-channel-search') !== '1') return;
        layoutChannelQuery = String(tEl.value || '');
        if (normalizeLayoutChannelTab(layoutChannelTab) === 'softPad') {
          layoutActionSceneId = layoutChannelQuery ? '' : (layoutActionSceneId || defaultLayoutActionSceneId());
        }
        renderLayoutActionList(host, liveMapping());
      });
    }
    ensureLayoutChannelRows(m);
    renderLayoutActionList(host, m);
  }

  function onLayoutActionPick(slotId) {
    if (!editDraft) return;
    editDraft.slotId = String(slotId || '').trim();
    maybeAutoSuggestIcon();
    hydrateLayoutDraftBindings(editDraft);
    syncHiddenSlotSelect();
    syncLayoutKeyFormFields();
    refreshLayoutActionLibrary(editDraft.mapping);
    commitEditKeycapDraft({ keepOpen: true, quiet: true });
    // Soft Pad「屏幕按钮」等：把选中能力写到本场景动作 last-scheme.
    try {
      var ui = global.OneToneState && global.OneToneState.ui;
      if (ui && ui.settingsPanel === 'softPad' && editDraft.mapping && editDraft.slotId) {
        var ch = normalizeLayoutChannelTab(layoutChannelTab);
        if (ch === 'softPad' || ch === 'cursor') {
          stampSoftPadSceneHero(editDraft.mapping, {
            channel: ch,
            bindingRef: editDraft.slotId,
            actionId: editDraft.slotId,
            kind: 'action'
          });
          refreshSoftPadSceneDock(editDraft.mapping);
        }
      }
    } catch (_) {}
  }

  function refreshLayoutActionLibrary(m) {
    var lib = document.querySelector('[data-soft-pad-action-library="1"]');
    if (!lib || !m) return;
    var scope = lib.closest('[data-soft-pad-mapping]');
    if (scope) {
      var mapId = scope.getAttribute('data-soft-pad-mapping');
      if (mapId && String(mapId) !== String(m.id || '')) return;
    }
    renderLayoutActionList(lib, m);
  }

  function paintSoftPadLayoutKeyPreviewForMapping(m) {
    refreshLayoutActionLibrary(m);
  }

  function renderSoftPadLayoutPanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    var pad = m.codexMicroPad;
    if (!pad) {
      ensurePad(m, { persist: false });
      pad = m.codexMicroPad;
    }
    if (!pad) {
      container.innerHTML = '<p class="codex-pad-mgr__hint">—</p>';
      mirrorSoftPadSubpageChrome(container);
      return;
    }
    var focusId = softPadLayoutFocusKeyId && cellByMicroId(softPadLayoutFocusKeyId) &&
      softPadLayoutFocusKeyId !== 'JOY'
      ? softPadLayoutFocusKeyId
      : '';
    layoutChannelTab = 'softPad';
    layoutChannelQuery = '';
    layoutActionSceneId = defaultLayoutActionSceneId();
    container.innerHTML =
      softPadExperienceChrome('layout', m) +
      '<div class="soft-pad-layout-shell">' +
      '<div class="soft-pad-layout-stack">' +
      buildSoftPadLayoutActionLibraryHtml(m) +
      '<div class="soft-pad-layout-editor" data-soft-pad-layout-editor="1" hidden></div>' +
      '</div></div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'layout');
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'layout' }));
    var actionLib = container.querySelector('[data-soft-pad-action-library="1"]');
    if (actionLib) bindLayoutActionLibrary(actionLib, m);
    try { global.__otSoftPadLayoutShellMounted = true; } catch (_) {}
    var openId = focusId || pickDefaultLayoutKey(m);
    if (openId) {
      requestAnimationFrame(function () {
        openEditKeycap(m, openId, { mode: 'inline' });
      });
    }
  }

  /** Prefer last focused key, else a sensible starter (AG00). */
  function pickDefaultLayoutKey(m) {
    if (softPadLayoutFocusKeyId && cellByMicroId(softPadLayoutFocusKeyId) &&
        softPadLayoutFocusKeyId !== 'JOY') {
      return softPadLayoutFocusKeyId;
    }
    var prefer = ['AG00', 'ACT06', 'SEARCH', 'DOT', 'ACT07', 'ACT08', 'ENC'];
    var i;
    for (i = 0; i < prefer.length; i++) {
      if (cellByMicroId(prefer[i])) return prefer[i];
    }
    var cells = (LAYOUT && LAYOUT.cells) || [];
    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!c || c.kind === 'placeholder' || c.microKeyId === 'JOY') continue;
      if (c.microKeyId) return c.microKeyId;
    }
    return 'AG00';
  }

  function getSoftPadLayoutFocusKeyId() {
    return String(softPadLayoutFocusKeyId || (editDraft && editDraft.microKeyId) || '').trim();
  }

  function markSoftPadPreviewFocus(microKeyId) {
    var id = String(microKeyId || '').trim();
    if (id === 'JOY') id = '';
    softPadLayoutFocusKeyId = id;
    if (id) previewMicroKeyId = id;
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.refreshSoftPadSceneKeys === 'function') Hub.refreshSoftPadSceneKeys();
    } catch (_) {}
    var host = document.getElementById('softPadPreviewHost');
    if (!host) return;
    var focused = null;
    host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
      var on = !!id && el.getAttribute('data-micro-key') === id;
      el.classList.toggle('is-focused', on);
      if (on) focused = el;
    });
    if (focused) {
      setSoftPadPreviewCaption(
        host,
        focused.getAttribute('data-cap-name') || focused.getAttribute('aria-label') || '',
        focused.getAttribute('data-cap-chord') || ''
      );
    } else {
      setSoftPadPreviewCaption(host, '', '');
    }
  }

  function showSoftPadLayoutTools(container) {
    if (!container) return;
    var mapId = container.getAttribute('data-soft-pad-mapping');
    var m = mapId ? findMappingById(mapId) : null;
    if (!m) return;
    refreshLayoutActionLibrary(m);
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
  }

  function softPadLayoutEditorHost() {
    var body = document.getElementById('softPadSubpageBody');
    if (!body || body.getAttribute('data-soft-pad-panel') !== 'layout') return null;
    var paint = resolveSoftPadSubpagePaintHost(body) || body;
    return paint.querySelector('[data-soft-pad-layout-editor]');
  }

  /** Presentation subpage — skins only (full/mini live under「何时显示」). */
  function renderSoftPadPresentationPanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    var pad = m.codexMicroPad;
    if (!pad) {
      ensurePad(m, { persist: false });
      pad = m.codexMicroPad;
    }
    if (!pad) {
      container.innerHTML = '<p class="codex-pad-mgr__hint">—</p>';
      mirrorSoftPadSubpageChrome(container);
      return;
    }
    container.innerHTML =
      softPadExperienceChrome('presentation', m) +
      '<div class="codex-pad-mgr__section">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadSkinLbl', '外观风格')) + '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadPresModeMovedHint', '大键盘 / 迷你条在「何时显示」里选择；这里只换皮肤。')) +
      '</p>' +
      renderSkinSeg(pad) +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadSkinHint', '点预览图即可更换风格；左侧键盘会同步。深色模式自动套用对应深色外观。')) +
      '</p>' +
      '</div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'presentation');
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'presentation' }));
    try { global.__otSoftPadPresentationMounted = true; } catch (_) {}
  }

  /** Soft Pad show-mode for hub「何时显示」dropdown. */
  function resolveSoftPadShowMode(pad) {
    if (!pad || !pad.overlayEnabled) return 'hidden';
    if (pad.presentation === 'mini') return 'mini';
    if (pad.requireForeground === false) return 'front';
    return 'follow';
  }

  function applySoftPadShowMode(m, mode) {
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    if (!pad) return;
    mode = String(mode || 'follow');
    if (mode === 'hidden') {
      pad.overlayEnabled = false;
      // Do not change enabled / keys.
      persistPadFlags(m);
      return;
    }
    pad.overlayEnabled = true;
    pad.enabled = true;
    if (mode === 'mini') {
      pad.presentation = 'mini';
      pad.requireForeground = true;
      persistPresentation(m);
      persistPadFlags(m);
      return;
    }
    pad.presentation = 'full';
    pad.requireForeground = mode !== 'front';
    persistPresentation(m);
    persistPadFlags(m);
  }

  function softPadShowModeLabel(mode) {
    if (mode === 'front') return t('softPadShowModeFront', '保持在最前');
    if (mode === 'mini') return t('softPadShowModeMini', '显示为迷你条');
    if (mode === 'hidden') return t('softPadShowModeHidden', '不显示浮窗');
    return t('softPadShowModeFollow', '跟随应用显示');
  }

  function softPadShowModeHint(mode) {
    if (mode === 'front') {
      return t('softPadShowModeFrontHint', '浮窗保持可见；按键动作仍发给对应应用，不会接管其它窗口。');
    }
    if (mode === 'mini') {
      return t('softPadShowModeMiniHint', '精简为状态灯条，适合少占屏幕。');
    }
    if (mode === 'hidden') {
      return t('softPadShowModeHiddenHint', '不显示悬浮键盘；你改过的键位配置会保留。');
    }
    return t('softPadShowModeFollowHint', '目标应用在前台时显示悬浮键盘。');
  }

  function softPadShowModeCaption(mode) {
    if (mode === 'front') {
      return t('softPadShowSceneFrontCap', '切到其它窗口，悬浮键盘仍在');
    }
    if (mode === 'mini') {
      return t('softPadShowSceneMiniCap', '变成迷你条，少占屏幕');
    }
    if (mode === 'hidden') {
      return t('softPadShowSceneHiddenCap', '不显示浮窗 · 键位配置仍保留');
    }
    return t('softPadShowSceneFollowCap', '目标应用在前台才出现');
  }

  function syncSoftPadShowModeChrome(root, mode, pad) {
    mode = String(mode || 'follow');
    var roots = [];
    if (root) roots.push(root);
    var preview = document.getElementById('softPadPreviewHost');
    if (preview && roots.indexOf(preview) < 0) roots.push(preview);
    var body = document.getElementById('softPadSubpageBody');
    if (body && roots.indexOf(body) < 0) roots.push(body);
    roots.forEach(function (scope) {
      if (!scope) return;
      var hint = scope.querySelector('[data-show-mode-hint]');
      if (hint) hint.textContent = softPadShowModeHint(mode);
      scope.querySelectorAll('button[data-act="showMode"][data-show-mode]').forEach(function (btn) {
        var on = btn.getAttribute('data-show-mode') === mode;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var scene = scope.querySelector('[data-show-scene]');
      if (scene) {
        scene.setAttribute('data-show-scene', mode);
        var cap = scene.querySelector('[data-show-scene-caption]');
        if (cap) cap.textContent = softPadShowModeCaption(mode);
        if (pad) {
          var skin = canonicalizePadSkin(pad.skin);
          scene.querySelectorAll('.soft-pad-show-scene__pad [data-pad-skin], .soft-pad-show-scene__pad--mini').forEach(function (el) {
            el.setAttribute('data-pad-skin', skin);
          });
        }
      }
    });
  }

  function renderShowModeTabsHtml(mode) {
    mode = String(mode || 'follow');
    function tab(id, label) {
      var on = mode === id;
      return (
        '<button type="button" class="soft-pad-show-mode-tab' + (on ? ' is-active' : '') + '"' +
        ' role="tab" data-act="showMode" data-show-mode="' + id + '"' +
        ' aria-selected="' + (on ? 'true' : 'false') + '">' +
        esc(label) + '</button>'
      );
    }
    return (
      '<div class="soft-pad-show-mode-tabs" role="tablist" aria-label="' +
      esc(t('softPadShowModeLbl', '显示方式')) + '">' +
      tab('follow', t('softPadShowModeFollow', '跟随应用显示')) +
      tab('front', t('softPadShowModeFront', '保持在最前')) +
      tab('mini', t('softPadShowModeMini', '显示为迷你条')) +
      tab('hidden', t('softPadShowModeHidden', '不显示浮窗')) +
      '</div>'
    );
  }

  function renderShowModeSceneHtml(mode, pad) {
    mode = String(mode || 'follow');
    pad = pad || {};
    var skin = canonicalizePadSkin(pad.skin);
    var softCells = visibleSoftPadCells(pad);
    var softCols = navKeysOn(pad) ? 5 : 4;
    var fullPadHw = renderSoftPadDemoHw(pad, softCells, softCols, { chassis: true });
    function winChrome(kind, title, bodyClass) {
      return (
        '<div class="soft-pad-show-scene__win soft-pad-show-scene__win--' + esc(kind) + '">' +
        '<div class="soft-pad-show-scene__titlebar">' +
        '<span class="soft-pad-show-scene__app-ico" aria-hidden="true"></span>' +
        '<span class="soft-pad-show-scene__win-title">' + esc(title) + '</span>' +
        '<span class="soft-pad-show-scene__caption-btns" aria-hidden="true">' +
        '<i class="is-min"></i><i class="is-max"></i><i class="is-close"></i>' +
        '</span>' +
        '</div>' +
        '<div class="soft-pad-show-scene__win-body ' + esc(bodyClass) + '">' +
        '<span class="soft-pad-show-scene__sidebar"></span>' +
        '<span class="soft-pad-show-scene__content">' +
        '<em></em><em></em><em></em>' +
        '</span>' +
        '</div>' +
        '</div>'
      );
    }
    return (
      '<div class="soft-pad-show-scene" data-show-scene="' + esc(mode) + '" aria-hidden="true">' +
      '<div class="soft-pad-show-scene__desk">' +
      '<div class="soft-pad-show-scene__wallpaper" aria-hidden="true"></div>' +
      '<div class="soft-pad-show-scene__taskbar" aria-hidden="true">' +
      '<span class="soft-pad-show-scene__start"></span>' +
      '<span class="soft-pad-show-scene__task is-target"></span>' +
      '<span class="soft-pad-show-scene__task is-other"></span>' +
      '<span class="soft-pad-show-scene__tray"></span>' +
      '</div>' +
      winChrome('target', t('softPadShowSceneAppTarget', '目标应用（如 Codex）'), 'is-agent') +
      winChrome('other', t('softPadShowSceneAppOther', '其它 Windows 窗口'), 'is-browser') +
      '<div class="soft-pad-show-scene__pad soft-pad-show-scene__pad--full">' +
      '<span class="soft-pad-show-scene__pad-tag">' +
      esc(t('softPadShowScenePadTag', '悬浮键盘')) + '</span>' +
      '<div class="soft-pad-show-scene__pad-body">' + fullPadHw + '</div>' +
      '</div>' +
      '<div class="soft-pad-show-scene__pad soft-pad-show-scene__pad--mini" data-pad-skin="' +
      esc(skin) + '">' +
      '<span class="soft-pad-show-scene__pad-tag soft-pad-show-scene__pad-tag--mini">' +
      esc(t('softPadShowScenePadTagMini', '迷你条')) + '</span>' +
      '<span class="soft-pad-show-scene__mini-face" aria-hidden="true">' +
      '<em></em><em></em><em></em>' +
      '</span>' +
      '</div>' +
      '<div class="soft-pad-show-scene__saved">' +
      esc(t('softPadShowSceneKeysKept', '键位已保留')) +
      '</div>' +
      '</div>' +
      '<p class="soft-pad-show-scene__caption" data-show-scene-caption>' +
      esc(softPadShowModeCaption(mode)) +
      '</p>' +
      '</div>'
    );
  }

  function renderNumpadDemoFace(cells, face, cols) {
    var navGlyph = { NAV_UP: '↑', NAV_DOWN: '↓', NAV_LEFT: '←', NAV_RIGHT: '→' };
    var html = '<div class="soft-pad-demo-face soft-pad-demo-face--' + esc(face) +
      '" style="--demo-cols:' + cols + '">';
    (cells || []).forEach(function (cell) {
      if (!cell || !cell.microKeyId) return;
      var isEnc = cell.microKeyId === 'ENC';
      var isNav = !!navGlyph[cell.microKeyId];
      var tag = isEnc ? 'button' : 'span';
      var cls = 'soft-pad-demo-key soft-pad-demo-key--' + esc(cell.kind || 'command');
      if (cell.gridColSpan === 2) cls += ' is-span2';
      if (cell.gridRowSpan === 2) cls += ' is-row2';
      if (isEnc) cls += ' is-enc';
      if (isNav) cls += ' is-nav';
      var style = 'grid-row:' + cell.gridRow +
        (cell.gridRowSpan ? ' / span ' + cell.gridRowSpan : '') +
        ';grid-column:' + cell.gridCol +
        (cell.gridColSpan ? ' / span ' + cell.gridColSpan : '') + ';';
      var label = '';
      if (isEnc) label = '⏻';
      else if (face === 'numpad') label = String(cell.digit || '');
      else if (isNav) label = navGlyph[cell.microKeyId];
      html += '<' + tag +
        (isEnc ? ' type="button" data-demo-enc="1" aria-label="' +
          esc(t('softPadNumpadEncLabel', '总开关')) + '"' : '') +
        ' class="' + cls + '" style="' + style + '">' +
        (label
          ? '<b>' + esc(label) + '</b>'
          : '<i class="soft-pad-demo-key__glyph" aria-hidden="true"></i>') +
        '</' + tag + '>';
    });
    html += '</div>';
    return html;
  }

  /** Soft Pad demo using real micro-hw + user skin (same visual language as left preview). */
  function renderSoftPadDemoHw(pad, cells, cols, opts) {
    opts = opts || {};
    var skin = canonicalizePadSkin(pad && pad.skin);
    var navGlyph = { NAV_UP: '↑', NAV_DOWN: '↓', NAV_LEFT: '←', NAV_RIGHT: '→' };
    var cls = 'soft-pad-demo-face soft-pad-demo-face--soft soft-pad-demo-hw micro-hw';
    if (opts.chassis !== false) cls += ' soft-pad-demo-chassis soft-pad-demo-chassis--soft';
    if (skin === 'default') cls += ' is-demo-codex';
    var html = '<div class="' + cls + '" data-pad-skin="' + esc(skin) +
      '" style="--demo-cols:' + (cols || 5) + '">' +
      '<div class="micro-hw__face soft-pad-demo-hw__face">' +
      '<div class="micro-hw__grid soft-pad-demo-hw__grid">';
    (cells || []).forEach(function (cell) {
      if (!cell || !cell.microKeyId) return;
      var isEnc = cell.microKeyId === 'ENC';
      var isNav = !!navGlyph[cell.microKeyId];
      var keyCls = 'micro-hw__key micro-hw__key--' + esc(cell.kind || 'command') +
        ' is-bound soft-pad-demo-hw__key';
      if (cell.gridColSpan === 2) keyCls += ' micro-hw__key--span2';
      if (cell.gridRowSpan === 2) keyCls += ' micro-hw__key--rowspan2';
      if (isEnc) keyCls += ' is-mode-on';
      if (isNav) keyCls += ' is-screen-only is-nav-demo';
      var style = 'grid-row:' + cell.gridRow +
        (cell.gridRowSpan ? ' / span ' + cell.gridRowSpan : '') +
        ';grid-column:' + cell.gridCol +
        (cell.gridColSpan ? ' / span ' + cell.gridColSpan : '') + ';';
      var inner;
      if (isEnc) {
        inner = '<span class="micro-hw__icon soft-pad-demo-hw__icon" aria-hidden="true">' +
          iconSvg('power') + '</span>';
      } else if (isNav) {
        inner = '<span class="micro-hw__digit" aria-hidden="true">' +
          esc(navGlyph[cell.microKeyId]) + '</span>';
      } else {
        inner = '<i class="soft-pad-demo-key__glyph" aria-hidden="true"></i>';
      }
      html += '<span class="' + keyCls + '" style="' + style + '" data-micro-key="' +
        esc(cell.microKeyId) + '">' + inner + '</span>';
    });
    html += '</div></div></div>';
    return html;
  }

  /** Main-keyboard inverted-T using the same keycap language as the numpad demo. */
  function renderArrowTDemoChassis() {
    return (
      '<div class="soft-pad-demo-chassis soft-pad-demo-chassis--numpad soft-pad-demo-arrows-t">' +
      '<div class="soft-pad-demo-arrows-t__grid" aria-hidden="true">' +
      '<span class="soft-pad-demo-key soft-pad-demo-key--numpad soft-pad-demo-arrows-t__u"><b>↑</b></span>' +
      '<span class="soft-pad-demo-key soft-pad-demo-key--numpad soft-pad-demo-arrows-t__l"><b>←</b></span>' +
      '<span class="soft-pad-demo-key soft-pad-demo-key--numpad soft-pad-demo-arrows-t__d"><b>↓</b></span>' +
      '<span class="soft-pad-demo-key soft-pad-demo-key--numpad soft-pad-demo-arrows-t__r"><b>→</b></span>' +
      '</div>' +
      '</div>'
    );
  }

  /** Card 3: inverted-T → Soft Pad (Soft Pad uses real hardware + user skin). */
  function renderNavArrowDemoHtml(pad, m) {
    pad = pad || {};
    m = m || softPadPreviewMapping;
    var navOn = navKeysOn(pad);
    return (
      '<div class="soft-pad-demo-compare soft-pad-nav-demo" data-nav-on="' +
      (navOn ? '1' : '0') + '" data-nav-demo>' +
      '<div class="soft-pad-demo-compare__col">' +
      '<span class="soft-pad-demo-compare__tag">' +
      esc(t('softPadNumpadArrowFrom', '主键盘倒 T')) + '</span>' +
      renderArrowTDemoChassis() +
      '</div>' +
      '<div class="soft-pad-demo-compare__bridge" aria-hidden="true">' +
      '<span class="soft-pad-demo-compare__bridge-line"></span>' +
      '<span class="soft-pad-demo-compare__bridge-txt">' +
      esc(navOn
        ? t('softPadNumpadArrowBridgeOn', '靠左接入')
        : t('softPadNumpadArrowBridgeOff', '保持原样')) + '</span>' +
      '</div>' +
      '<div class="soft-pad-demo-compare__col">' +
      '<span class="soft-pad-demo-compare__tag is-soft">' +
      esc(t('softPadNumpadBadgeSoft', '临时 Soft Pad')) + '</span>' +
      renderPurposeLiveSoftPadHtml(m, pad) +
      '</div>' +
      '</div>'
    );
  }

  var softPadPurposeFeatureTab = 'mapping';
  /** Style tab top-level panes: show | pad | lights | mini */
  var softPadStyleSubtab = 'show';

  function resolveSoftPadPurposeFeatureTab(tab) {
    return tab === 'occupy' || tab === 'nav' ? tab : 'mapping';
  }

  /** Real Soft Pad for purpose demos — same chrome/skin as keys preview. */
  function renderPurposeLiveSoftPadHtml(m, pad, opts) {
    opts = opts || {};
    m = m || softPadPreviewMapping;
    pad = pad || (m && m.codexMicroPad) || {};
    // Seat-match demos (mapping/occupy): 4-col Soft Pad aligned to numpad seats.
    var demoPad = pad;
    if (opts.seatMatch && pad) {
      demoPad = Object.assign({}, pad, {
        showNavigationPad: false,
        navKeysEnabled: false
      });
    }
    if (!m || !demoPad) {
      var softCells = visibleSoftPadCells(demoPad || pad);
      var softCols = navKeysOn(demoPad || pad) ? 5 : 4;
      return renderSoftPadDemoHw(demoPad || pad, softCells, softCols, { chassis: true });
    }
    var skin = canonicalizePadSkin(demoPad.skin);
    return (
      '<div class="codex-micro-pad soft-pad-preview soft-pad-purpose-live-hw' +
      (opts.seatMatch ? ' is-seat-match' : '') +
      '" data-pad-skin="' + esc(skin) + '" data-purpose-live-pad="1">' +
      renderHardwarePad(m, demoPad, { mode: 'softPad', omitFaceTopbar: true }) +
      '</div>'
    );
  }

  /** Left-column purpose demos (one active feature at a time). */
  function renderPurposeFeatureDemoHtml(pad, tab, m) {
    pad = pad || {};
    m = m || softPadPreviewMapping;
    tab = resolveSoftPadPurposeFeatureTab(tab || softPadPurposeFeatureTab);
    var occupied = !!pad.requireNumLockOff;
    var on = occupied ? '1' : '0';
    var demoMode = occupied ? 'soft' : 'numpad';
    var numCells = LAYOUT.numpadCells || [];
    if (tab === 'occupy') {
      return (
        '<div class="soft-pad-demo-switch" data-demo-mode="' + demoMode + '" data-numpad-on="' + on + '">' +
        '<div class="soft-pad-demo-switch__modes" role="tablist" aria-label="' +
        esc(t('softPadPurposeModeSwitchAria', '模式预览')) + '">' +
        '<button type="button" class="soft-pad-demo-switch__mode" role="tab" data-mode="numpad"' +
        ' aria-selected="' + (demoMode === 'numpad' ? 'true' : 'false') + '">' +
        esc(t('codexMicroPadModeNumpad', '数字键模式')) + '</button>' +
        '<button type="button" class="soft-pad-demo-switch__mode" role="tab" data-mode="soft"' +
        ' aria-selected="' + (demoMode === 'soft' ? 'true' : 'false') + '">' +
        esc(t('codexMicroPadModeCodex', 'Soft Pad 模式')) + '</button>' +
        '</div>' +
        '<div class="soft-pad-demo-switch__stage">' +
        '<div class="soft-pad-demo-switch__stack">' +
        '<div class="soft-pad-demo-switch__layer soft-pad-demo-face--numpad">' +
        '<div class="soft-pad-demo-chassis soft-pad-demo-chassis--numpad">' +
        renderNumpadDemoFace(numCells, 'numpad', 4) +
        '</div></div>' +
        '<div class="soft-pad-demo-switch__layer soft-pad-demo-face--soft">' +
        renderPurposeLiveSoftPadHtml(m, pad, { seatMatch: true }) +
        '</div>' +
        '</div></div>' +
        '<p class="soft-pad-demo-switch__hint">' +
        esc(t('softPadNumpadStep2Hint', '点左上角 ⏻ 总开关：数字键盘 ⇄ Soft Pad')) +
        '</p>' +
        '</div>'
      );
    }
    if (tab === 'nav') {
      return '<div data-nav-demo-host>' + renderNavArrowDemoHtml(pad, m) + '</div>';
    }
    return (
      '<div class="soft-pad-demo-compare">' +
      '<div class="soft-pad-demo-compare__col">' +
      '<span class="soft-pad-demo-compare__tag">' +
      esc(t('softPadNumpadBadgeDigit', '日常数字键盘')) + '</span>' +
      '<div class="soft-pad-demo-chassis soft-pad-demo-chassis--numpad">' +
      renderNumpadDemoFace(numCells, 'numpad', 4) +
      '</div>' +
      '</div>' +
      '<div class="soft-pad-demo-compare__bridge" aria-hidden="true">' +
      '<span class="soft-pad-demo-compare__bridge-line"></span>' +
      '<span class="soft-pad-demo-compare__bridge-txt">' +
      esc(t('softPadNumpadSameSeat', '同一键位')) + '</span>' +
      '</div>' +
      '<div class="soft-pad-demo-compare__col">' +
      '<span class="soft-pad-demo-compare__tag is-soft">' +
      esc(t('softPadNumpadBadgeSoft', '临时 Soft Pad')) + '</span>' +
      renderPurposeLiveSoftPadHtml(m, pad, { seatMatch: true }) +
      '</div>' +
      '</div>'
    );
  }

  function buildSoftPadPurposePreviewHtml(pad, m) {
    var tab = resolveSoftPadPurposeFeatureTab(softPadPurposeFeatureTab);
    return (
      '<div class="soft-pad-mode-preview soft-pad-mode-preview--purpose" data-soft-pad-mode-preview="purpose"' +
      ' data-feature-tab="' + tab + '">' +
      renderPurposeFeatureDemoHtml(pad, tab, m) +
      '</div>'
    );
  }

  /** Right-column purpose controls (toggles / captions; demos live in left preview). */
  function renderNumpadMapHtml(pad) {
    pad = pad || {};
    var occupied = !!pad.requireNumLockOff;
    var mappingOn = !!pad.enabled;
    var navOn = navKeysOn(pad);
    var mapDisabled = mappingOn ? '' : ' disabled';
    var mapDisabledAttr = mappingOn ? '' : ' aria-disabled="true"';
    var tab = resolveSoftPadPurposeFeatureTab(softPadPurposeFeatureTab);
    softPadPurposeFeatureTab = tab;
    function featureTabBtn(id, n, label) {
      var active = tab === id;
      return (
        '<button type="button" class="soft-pad-feature-subtab' + (active ? ' is-active' : '') + '"' +
        ' role="tab" data-feature-tab="' + id + '" aria-selected="' + (active ? 'true' : 'false') + '">' +
        '<span class="soft-pad-feature-subtab__n">' + n + '</span>' +
        '<span class="soft-pad-feature-subtab__lbl">' + esc(label) + '</span>' +
        '</button>'
      );
    }
    var noPadTip = softLikelyNoNumpad() === true && occupied
      ? ('<p class="soft-pad-feature-hint" data-numpad-hint>' +
        esc(t('softPadNumpadNoPadHint',
          '未检测到独立数字键区。你可以关闭占用，只用悬浮 Soft Pad。')) +
        '</p>')
      : '<p class="soft-pad-feature-hint" data-numpad-hint hidden></p>';
    return (
      '<div class="soft-pad-feature-cards" data-mapping-on="' + (mappingOn ? '1' : '0') + '"' +
      ' data-feature-tab="' + tab + '">' +
      '<div class="soft-pad-feature-subtabs" role="tablist" aria-label="' +
      esc(t('softPadPurposeFeaturesAria', '用途配置')) + '">' +
      featureTabBtn('mapping', '1', t('softPadFeatureMappingTitle', 'Soft Pad 映射')) +
      featureTabBtn('occupy', '2', t('softPadFeatureOccupyTitle', '数字键占用')) +
      featureTabBtn('nav', '3', t('softPadFeatureNavTitle', 'Soft Pad 方向栏')) +
      '</div>' +
      '<div class="soft-pad-feature-panels">' +
      '<section class="soft-pad-feature-card soft-pad-numpad-step soft-pad-numpad-step--map' +
      (tab === 'mapping' ? ' is-active' : '') + '" data-feature="mapping"' +
      (tab === 'mapping' ? '' : ' hidden') + '>' +
      '<label class="codex-pad-mgr__setting soft-pad-feature-card__toggle">' +
      '<input type="checkbox" data-act="enabled"' + (mappingOn ? ' checked' : '') + '>' +
      esc(t('softPadFeatureMappingSwitch', '启用 Soft Pad 映射')) + '</label>' +
      '<p class="soft-pad-feature-card__cap">' +
      esc(t('softPadFeatureMappingCap',
        '关闭后，实体数字键恢复普通数字键；悬浮键位配置保留。')) + '</p>' +
      '</section>' +
      '<section class="soft-pad-feature-card soft-pad-numpad-step soft-pad-numpad-step--use' +
      (mappingOn ? '' : ' is-disabled') + (tab === 'occupy' ? ' is-active' : '') +
      '" data-feature="occupy"' + mapDisabledAttr +
      (tab === 'occupy' ? '' : ' hidden') + '>' +
      '<label class="codex-pad-mgr__setting soft-pad-feature-card__toggle">' +
      '<input type="checkbox" data-act="numlock"' +
      (occupied ? ' checked' : '') + mapDisabled + '>' +
      esc(t('softPadFeatureOccupySwitch', '用电脑数字键触发 Soft Pad')) + '</label>' +
      '<p class="soft-pad-feature-card__cap">' +
      esc(t('softPadFeatureOccupyCap',
        '关闭后数字键照常输入数字；你仍可点击悬浮 Soft Pad。')) + '</p>' +
      noPadTip +
      '</section>' +
      '<section class="soft-pad-feature-card soft-pad-numpad-step soft-pad-numpad-step--arrows' +
      (mappingOn ? '' : ' is-disabled') + (tab === 'nav' ? ' is-active' : '') +
      '" data-feature="nav"' + mapDisabledAttr +
      (tab === 'nav' ? '' : ' hidden') + '>' +
      '<label class="codex-pad-mgr__setting soft-pad-feature-card__toggle">' +
      '<input type="checkbox" data-act="navKeys"' +
      (navOn ? ' checked' : '') + mapDisabled + '>' +
      esc(t('softPadFeatureNavSwitch', '显示左侧方向栏')) + '</label>' +
      '<p class="soft-pad-feature-card__cap" data-nav-cap>' +
      esc(navOn
        ? t('softPadFeatureNavCapOn',
          '屏幕方向钮可注入 ↑↓←→；主键盘倒 T 保持系统原样（不劫持）。')
        : t('softPadFeatureNavCapOff',
          'Soft Pad 不显示左侧方向列；主键盘方向键始终系统原样。')) + '</p>' +
      '</section>' +
      '</div></div>'
    );
  }

  /** Runtime subpage — alias for display tab (show mode + skin). */
  function renderSoftPadRuntimePanel(container, m, opts) {
    renderSoftPadDisplayPanel(container, m, opts);
  }

  function buildSoftPadPresentationSkinSectionHtml(pad) {
    return (
      '<div class="codex-pad-mgr__section soft-pad-display-skin">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadSkinLbl', '外观风格')) + '</p>' +
      renderSkinSeg(pad) +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadSkinHint', '点选右侧风格；左侧 Soft Pad 立即换成真实外观。深色模式自动套用对应深色外观。')) +
      '</p>' +
      '</div>'
    );
  }

  /** Real Soft Pad on the left — skin comes from pad.skin (not thumbnail cards). */
  function buildSoftPadAppearLivePadHtml(m, pad) {
    pad = pad || (m && m.codexMicroPad) || {};
    var skin = canonicalizePadSkin(pad.skin);
    return (
      '<div class="soft-pad-mode-preview__live" data-soft-pad-live-skin>' +
      '<p class="soft-pad-mode-preview__live-lbl">' +
      esc(t('softPadSkinLiveLbl', '当前 Soft Pad')) + '</p>' +
      '<div class="codex-micro-pad soft-pad-preview soft-pad-mode-preview__hw" data-pad-skin="' +
      esc(skin) + '">' +
      renderHardwarePad(m, pad, { mode: 'softPad', omitFaceTopbar: true }) +
      '</div>' +
      '</div>'
    );
  }

  function buildSoftPadDisplayPreviewHtml(m, pad) {
    pad = pad || (m && m.codexMicroPad) || {};
    var mode = resolveSoftPadShowMode(pad);
    return (
      '<div class="soft-pad-mode-preview soft-pad-mode-preview--appear" data-soft-pad-mode-preview="appear">' +
      renderShowModeSceneHtml(mode, pad) +
      buildSoftPadAppearLivePadHtml(m, pad) +
      '</div>'
    );
  }

  function buildSoftPadCursorArmRowHtml(m) {
    var isCursor = String(m && m.appTargetId || '').toLowerCase().indexOf('cursor') >= 0;
    if (!isCursor) return '';
    var armPhrase = '';
    try {
      var st = global.OneToneState && global.OneToneState.state;
      armPhrase = String((st && st.config && st.config.cursorBeginnerArmPhrase) || '').trim() || '一声';
    } catch (_) { armPhrase = '一声'; }
    return (
      '<article class="soft-pad-runtime-arm soft-pad-minimax-key" data-cursor-arm-card="1">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadCursorArmSectionLbl', '聆听')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint soft-pad-runtime-arm__lead">' +
      esc(t('softPadCursorArmPhraseHint',
        '未在 Cursor 前台时，说这句可手动进入聆听。默认「一声」。与语音页全局唤醒词无关。')) +
      '</p>' +
      '<p class="codex-pad-mgr__label soft-pad-runtime-arm__field-lbl">' +
      esc(t('softPadCursorArmPhraseLbl', '聆听激活口令')) +
      '</p>' +
      '<div class="soft-pad-runtime-arm__row">' +
      '<input type="text" class="soft-pad-runtime-arm__input" data-act="cursorArmPhrase" maxlength="12" value="' +
      esc(armPhrase) + '" autocomplete="off" spellcheck="false" ' +
      'aria-label="' + esc(t('softPadCursorArmPhraseLbl', '聆听激活口令')) + '">' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="cursorArmPhraseSave">' +
      esc(t('softPadCursorArmPhraseSave', '保存')) + '</button>' +
      '</div></article>'
    );
  }

  function buildSoftPadDisplayControlsHtml(m, pad, opts) {
    opts = opts || {};
    var mode = resolveSoftPadShowMode(pad);
    var body =
      '<div class="soft-pad-display-panel">' +
      '<div class="soft-pad-runtime-show">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadShowModeLbl', '显示方式')) + '</p>' +
      renderShowModeTabsHtml(mode) +
      '<p class="codex-pad-mgr__hint soft-pad-runtime-show__hint" data-show-mode-hint>' +
      esc(softPadShowModeHint(mode)) +
      '</p>' +
      '</div>' +
      buildSoftPadCursorArmRowHtml(m) +
      buildSoftPadPresentationSkinSectionHtml(pad) +
      '</div>';
    if (opts.omitChrome) return body;
    return softPadExperienceChrome('runtime', m) + body;
  }

  /** Left-column demo for appear / purpose pad modes. */
  function paintSoftPadPadModePreview(host, m, padMode) {
    host = resolveSoftPadPreviewPaintHost(host);
    if (!host || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    if (!pad) return;
    padMode = padMode === 'purpose' ? 'purpose' : 'appear';
    softPadPreviewMapping = m;
    // Lights/mini chrome lives on outer #softPadPreviewHost — clear before mode demos.
    clearStatusLightsPreviewChrome(document.getElementById('softPadPreviewHost') || host);
    host.innerHTML = padMode === 'purpose'
      ? buildSoftPadPurposePreviewHtml(pad, m)
      : buildSoftPadDisplayPreviewHtml(m, pad);
    var outer = document.getElementById('softPadPreviewHost');
    if (outer) {
      outer.hidden = false;
      outer.removeAttribute('hidden');
      outer.classList.remove('is-collapsed');
      outer.setAttribute('data-pad-mode-preview', padMode);
    }
  }

  function buildSoftPadPurposeBodyHtml(m, pad) {
    var Hub = global.OneToneSoftPadHub;
    var entry = (Hub && typeof Hub.resolveSoftPadEntry === 'function')
      ? Hub.resolveSoftPadEntry()
      : { mapping: m };
    if (!entry || !entry.mapping) entry = { mapping: m };
    var chips = (Hub && typeof Hub.purposeChipView === 'function')
      ? (Hub.purposeChipView(entry) || '')
      : '';
    return (
      '<div class="soft-pad-purpose-panel">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadPurposeAria', 'AG 键做什么')) + '</p>' +
      chips +
      '</div>' +
      '<div class="soft-pad-numpad-card">' +
      renderNumpadMapHtml(pad) +
      '</div>'
    );
  }

  function resolveSoftPadStyleSubtab(tab) {
    tab = String(tab || '').trim();
    if (tab === 'pad' || tab === 'lights' || tab === 'mini') return tab;
    return 'show';
  }

  function setSoftPadStyleSubtab(tab) {
    softPadStyleSubtab = resolveSoftPadStyleSubtab(tab);
  }

  function getSoftPadStyleSubtab() {
    return resolveSoftPadStyleSubtab(softPadStyleSubtab);
  }

  function buildSoftPadStyleSubtabBar(activeTab) {
    activeTab = resolveSoftPadStyleSubtab(activeTab);
    function btn(id, label) {
      var on = activeTab === id;
      return (
        '<button type="button" class="soft-pad-style-subtab' + (on ? ' is-active' : '') + '"' +
        ' role="tab" data-style-subtab="' + id + '" aria-selected="' + (on ? 'true' : 'false') + '">' +
        esc(label) + '</button>'
      );
    }
    return (
      '<div class="soft-pad-style-subtabs" role="tablist" aria-label="' +
      esc(t('softPadStyleSubtabsAria', '样式分类')) + '">' +
      btn('show', t('softPadStyleSubtabShow', '何时出现')) +
      btn('pad', t('softPadStyleSubtabPad', '动作键')) +
      btn('lights', t('softPadStyleSubtabLights', '灯效')) +
      btn('mini', t('softPadStyleSubtabMini', '迷你栏')) +
      '</div>'
    );
  }

  function applySoftPadStyleSubtab(body, tab, m) {
    tab = resolveSoftPadStyleSubtab(tab);
    softPadStyleSubtab = tab;
    if (!body) return;
    body.setAttribute('data-style-subtab', tab);
    body.querySelectorAll('[data-style-subtab]').forEach(function (btn) {
      if (!btn.classList.contains('soft-pad-style-subtab')) return;
      var on = btn.getAttribute('data-style-subtab') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    body.querySelectorAll('[data-style-pane]').forEach(function (pane) {
      var on = pane.getAttribute('data-style-pane') === tab;
      pane.classList.toggle('is-active', on);
      if (on) pane.removeAttribute('hidden');
      else pane.setAttribute('hidden', '');
    });
    if (m && m.codexMicroPad) {
      var previewMode = tab === 'pad' ? 'purpose' : 'appear';
      paintSoftPadPadModePreview(document.getElementById('softPadPreviewHost'), m, previewMode);
    }
  }

  function bindSoftPadStyleSubtabEvents(body, m, pad) {
    if (!body || body.getAttribute('data-style-subtab-bound') === '1') return;
    body.setAttribute('data-style-subtab-bound', '1');
    body.addEventListener('click', function (ev) {
      var btn = ev.target.closest && ev.target.closest('.soft-pad-style-subtab[data-style-subtab]');
      if (!btn || !body.contains(btn)) return;
      var next = btn.getAttribute('data-style-subtab');
      if (!next || next === softPadStyleSubtab) return;
      applySoftPadStyleSubtab(body, next, m);
      if (next === 'lights' || next === 'mini') {
        try {
          var Hub = global.OneToneSoftPadHub;
          if (Hub && Hub.requestOverlayUsageForScope) Hub.requestOverlayUsageForScope(hubSelectedScopeKind());
        } catch (_) {}
      }
    });
  }

  /** 样式 Tab — 横向 subtab：何时出现 / 动作键 / 灯效 / 迷你栏 */
  function renderSoftPadStylePanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var scopeKind = '';
    try { scopeKind = String(hubSelectedScopeKind() || ''); } catch (_) {}
    var wbCtx = resolveAgentWorkbenchCaps(m, scopeKind);
    var tab = resolveSoftPadStyleSubtab(softPadStyleSubtab);
    softPadStyleSubtab = tab;
    function pane(id, inner) {
      var on = tab === id;
      return (
        '<div class="soft-pad-style-pane' + (on ? ' is-active' : '') + '" data-style-pane="' + id + '"' +
        (on ? '' : ' hidden') + '>' + inner + '</div>'
      );
    }
    container.innerHTML =
      softPadExperienceChrome('runtime', m) +
      '<div class="soft-pad-style-panel" data-style-subtab="' + tab + '">' +
      buildSoftPadStyleSubtabBar(tab) +
      '<div class="soft-pad-style-panes">' +
      pane('show', buildSoftPadDisplayControlsHtml(m, pad, { omitChrome: true })) +
      pane('pad', buildSoftPadPurposeBodyHtml(m, pad)) +
      pane('lights', renderAgentLightsPanel(m, pad, wbCtx)) +
      pane('mini', renderAgentMiniPanel(m, pad)) +
      '</div></div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'style');
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
    paintSoftPadPadModePreview(
      document.getElementById('softPadPreviewHost'),
      m,
      tab === 'pad' ? 'purpose' : 'appear'
    );
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'runtime' }));
    bindSoftPadStyleSubtabEvents(container, m, pad);
    bindAgentConnectEvents(container, m, pad);
    bindTopbarLightsPanelEvents(container, m, pad);
    bindSoftPadLightsSubtabEvents(container, m, pad);
    bindAgentWorkbenchPanelEvents(container, m, pad);
    try { global.__otSoftPadRuntimeMounted = true; } catch (_) {}
  }

  /** Display tab — show mode controls on right; scene + skin live in left preview. */
  function renderSoftPadDisplayPanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    container.innerHTML = buildSoftPadDisplayControlsHtml(m, pad);
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'runtime');
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
    paintSoftPadPadModePreview(document.getElementById('softPadPreviewHost'), m, 'appear');
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'runtime' }));
    try { global.__otSoftPadRuntimeMounted = true; } catch (_) {}
  }

  /** Purpose tab — AG chips + toggles on right; demos in left preview. */
  function renderSoftPadPurposePanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var Hub = global.OneToneSoftPadHub;
    var entry = (Hub && typeof Hub.resolveSoftPadEntry === 'function')
      ? Hub.resolveSoftPadEntry()
      : { mapping: m };
    if (!entry || !entry.mapping) entry = { mapping: m };
    var chips = (Hub && typeof Hub.purposeChipView === 'function')
      ? (Hub.purposeChipView(entry) || '')
      : '';
    container.innerHTML =
      '<div class="soft-pad-purpose-panel">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadPurposeAria', 'AG 键做什么')) + '</p>' +
      chips +
      '</div>' +
      '<div class="soft-pad-numpad-card">' +
      renderNumpadMapHtml(pad) +
      '</div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'purpose');
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
    paintSoftPadPadModePreview(document.getElementById('softPadPreviewHost'), m, 'purpose');
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'purpose' }));
  }

  /** Agent subpage — v10 simple lights config (center column). */
  function resolveLightsPanelMode(m) {
    var kind = '';
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.kindForAppId === 'function') {
        kind = String(Hub.kindForAppId(m && m.appTargetId) || '').toLowerCase();
      }
    } catch (_) {}
    if (!kind && m) {
      var tid = String(m.appTargetId || m.agentProviderId || '').toLowerCase();
      if (tid.indexOf('claude') >= 0) kind = 'claude';
      else if (tid.indexOf('codex') >= 0) kind = 'codex';
      else if (tid.indexOf('cursor') >= 0) kind = 'cursor';
      else if (tid.indexOf('workbuddy') >= 0 || tid.indexOf('codebuddy') >= 0) kind = 'workbuddy';
      else if (tid.indexOf('trae-code') >= 0) kind = 'traeCode';
      else if (tid.indexOf('trae') >= 0) kind = 'trae';
      else if (tid.indexOf('qoder') >= 0) kind = 'qoder';
    }
    if (kind === 'claude') return 'preset-claude';
    if (kind === 'codex') return 'preset-codex';
    if (kind === 'cursor') return 'preset-cursor';
    var kLow = String(kind || '').toLowerCase();
    if (kLow === 'workbuddy' || kLow === 'traecode' || kLow === 'qoder') return 'preset-shell';
    return 'custom';
  }

  function scopeAgentKind(m, mode) {
    if (mode === 'preset-claude') return 'claude';
    if (mode === 'preset-codex') return 'codex';
    if (mode === 'preset-cursor') return 'cursor';
    if (mode === 'preset-shell') {
      try {
        var Hub = global.OneToneSoftPadHub;
        if (Hub && typeof Hub.kindForAppId === 'function') {
          return String(Hub.kindForAppId(m && m.appTargetId) || '').toLowerCase();
        }
      } catch (_) {}
    }
    return '';
  }

  function appDisplayName(m, mode) {
    var agent = scopeAgentKind(m, mode);
    if (agent === 'claude') return t('softPadHubKindClaude', 'Claude');
    if (agent === 'codex') return t('softPadHubKindCodex', 'Codex');
    if (agent === 'cursor') return t('softPadHubKindCursor', 'Cursor');
    if (agent === 'workbuddy') return t('softPadHubKindWorkBuddy', 'WorkBuddy');
    if (agent === 'trae') return t('softPadHubKindTraeWork', 'Trae Work');
    if (agent === 'traeCode' || agent === 'traecode') return t('softPadHubKindTraeCode', 'Trae Code');
    if (agent === 'qoder') return t('softPadHubKindQoder', 'Qoder');
    if (m && m.name) return String(m.name);
    return t('softPadHubKindSoft', '我的应用');
  }

  /** Agent subpage — v16.1 lights peer (match | data | mini). */
  var softPadLightsSubtab = 'ambient';
  var softPadWorkbenchTab = 'match';
  var softPadMiniRail = 'agents';

  function getSoftPadLightsSubtab() {
    return softPadLightsSubtab;
  }

  function getSoftPadWorkbenchTab() {
    return softPadWorkbenchTab;
  }

  function setSoftPadWorkbenchTab(tab) {
    softPadWorkbenchTab = normalizeWorkbenchTab(tab);
    return softPadWorkbenchTab;
  }

  function normalizeWorkbenchTab(tab) {
    tab = String(tab || '');
    /* Migrate v15c ids */
    if (tab === 'readiness' || tab === 'lights') return 'match';
    if (tab === 'cross') return 'mini';
    if (tab === 'session') return 'match';
    if (tab === 'match' || tab === 'data' || tab === 'mini') return tab;
    return 'match';
  }

  function renderAmbientBezelCard(pad) {
    var on = String((pad && pad.lightTemplate) || 'bezel') === 'bezel';
    return (
      '<button type="button" class="soft-pad-lights-template' + (on ? ' is-active' : '') +
      '" data-light-template="bezel" data-light-template-scope="ambient" aria-pressed="' +
      (on ? 'true' : 'false') + '">' +
      '<span class="soft-pad-lights-template__title">' + esc(t('softPadLightTplBezel', '盘边变色')) +
      ' · ' + esc(t('softPadLightTplRecommended', '推荐')) + '</span>' +
      '<span class="soft-pad-lights-template__hint">' +
      esc(t('softPadLightTplBezelHint', '前台时盘边一种颜色')) + '</span></button>'
    );
  }

  function renderLightTemplateKeysCards(pad) {
    var cur = String((pad && pad.lightTemplate) || 'bezel');
    if (cur === 'bezel') cur = 'single';
    var items = [
      ['single', t('softPadLightTplSingle', '一盏键灯'), t('softPadLightTplSingleHint', '像 Codex，一颗键表示忙闲'), false],
      ['multi', t('softPadLightTplMulti', '多键提示'), t('softPadLightTplMultiHint', '看起来像 Claude（规则驱动）'), false]
    ];
    return (
      '<div class="soft-pad-lights-templates" role="radiogroup" aria-label="' +
      esc(t('softPadLightTplPickKeys', '选按键灯效果')) + '">' +
      items.map(function (row) {
        var id = row[0];
        var on = cur === id;
        return (
          '<button type="button" class="soft-pad-lights-template' + (on ? ' is-active' : '') +
          '" data-light-template="' + esc(id) + '" data-light-template-scope="keys" aria-pressed="' +
          (on ? 'true' : 'false') + '">' +
          '<span class="soft-pad-lights-template__title">' + esc(row[1]) + '</span>' +
          '<span class="soft-pad-lights-template__hint">' + esc(row[2]) + '</span>' +
          (id === 'multi'
            ? ('<span class="soft-pad-lights-template__badge">' +
              esc(t('softPadLightTplMultiBadge', '模拟效果 · 非官方 Hook')) + '</span>')
            : '') +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function clampAmbientOpacity(v) {
    var n = Math.round(Number(v));
    if (!(n >= 0)) n = 100;
    if (n > 100) n = 100;
    return n;
  }

  var KEY_LIGHT_PRESETS = [
    { id: 'default', titleKey: 'softPadKeyLightPresetDefault', title: '默认', hint: '蓝忙 / 琥珀等你 / 绿完成' },
    { id: 'cool', titleKey: 'softPadKeyLightPresetCool', title: '冷色', hint: '偏蓝青' },
    { id: 'warm', titleKey: 'softPadKeyLightPresetWarm', title: '暖色', hint: '偏橙黄' },
    { id: 'highContrast', titleKey: 'softPadKeyLightPresetHC', title: '高对比', hint: '更醒目' }
  ];

  var KEY_LIGHT_STATUS_FIELDS = [
    { key: 'running', label: '忙/运行', fallback: '#3053FE' },
    { key: 'needsInput', label: '等你', fallback: '#FF6A00' },
    { key: 'done', label: '完成', fallback: '#00FF4C' },
    { key: 'failed', label: '失败', fallback: '#FF0033' },
    { key: 'listening', label: '聆听', fallback: '#00A3FF' }
  ];

  var KEY_LIGHT_PRESET_COLORS = {
    default: { running: '#3053FE', needsInput: '#FF6A00', done: '#00FF4C', failed: '#FF0033', listening: '#00A3FF' },
    cool: { running: '#3B82F6', needsInput: '#06B6D4', done: '#22D3EE', failed: '#F43F5E', listening: '#60A5FA' },
    warm: { running: '#F59E0B', needsInput: '#F97316', done: '#84CC16', failed: '#EF4444', listening: '#FB923C' },
    highContrast: { running: '#0055FF', needsInput: '#FF8800', done: '#00FF66', failed: '#FF0033', listening: '#00CCFF' }
  };

  function normalizeKeyLightPreset(id) {
    id = String(id || 'default');
    if (id === 'high_contrast') id = 'highContrast';
    if (!KEY_LIGHT_PRESET_COLORS[id]) return 'default';
    return id;
  }

  function statusColorsOnPad(pad) {
    return (pad && pad.statusColors && typeof pad.statusColors === 'object') ? pad.statusColors : {};
  }

  function resolvedStatusColor(pad, key) {
    var ov = statusColorsOnPad(pad);
    var raw = String(ov[key] || '').trim();
    if (raw) {
      if (raw.charAt(0) !== '#') raw = '#' + raw;
      return raw;
    }
    var preset = KEY_LIGHT_PRESET_COLORS[normalizeKeyLightPreset(pad && pad.keyLightPreset)] || KEY_LIGHT_PRESET_COLORS.default;
    return preset[key] || '#888888';
  }

  function echoStatusPaletteOnSoftPads(pad) {
    var ids = ['softPadPreviewHost', 'softPadAgentPreviewHost'];
    var i;
    for (i = 0; i < ids.length; i++) {
      var host = document.getElementById(ids[i]);
      if (!host) continue;
      applyStatusPaletteToPreview(host, pad);
      paintKeysPaletteDemo(host, softPadLightsSubtab === 'keys');
    }
  }

  function persistPadLightColors(m, pad) {
    softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
    echoStatusPaletteOnSoftPads(pad);
    var Hub = global.OneToneSoftPadHub;
    var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
    if (previewHost) {
      syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts());
    }
    var p = global.OneToneConfigPersist;
    if (p && p.saveAsync) p.saveAsync();
    else if (p && p.save) p.save();
  }

  function hexToRgba(hex, alpha) {
    var t = String(hex || '').trim().replace(/^#/, '');
    if (t.length !== 6) return '';
    var r = parseInt(t.slice(0, 2), 16);
    var g = parseInt(t.slice(2, 4), 16);
    var b = parseInt(t.slice(4, 6), 16);
    if (!(r >= 0) || !(g >= 0) || !(b >= 0)) return '';
    var a = alpha == null ? 0.85 : alpha;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + a + ')';
  }

  function applyStatusPaletteToPreview(host, pad) {
    if (!host || !host.style || typeof host.style.setProperty !== 'function') return;
    var map = [
      ['running', '--micro-hw-status-running', 0.75],
      ['needsInput', '--micro-hw-status-needs-input', 0.88],
      ['done', '--micro-hw-status-done', 0.85],
      ['failed', '--micro-hw-status-failed', 0.9],
      ['listening', '--micro-hw-status-listening', 0.9]
    ];
    var i;
    for (i = 0; i < map.length; i++) {
      var rgba = hexToRgba(resolvedStatusColor(pad, map[i][0]), map[i][2]);
      if (rgba) host.style.setProperty(map[i][1], rgba);
    }
  }

  var KEYS_PALETTE_DEMO = [
    { micro: 'AG00', status: 'running' },
    { micro: 'AG01', status: 'needs_input' },
    { micro: 'AG02', status: 'done' },
    { micro: 'AG03', status: 'failed' },
    { micro: 'AG04', status: 'listening' }
  ];

  function paintKeysPaletteDemo(host, on) {
    if (!host) return;
    var padEl = host.querySelector('.micro-hw') || host;
    KEYS_PALETTE_DEMO.forEach(function (row) {
      var el = padEl.querySelector('.micro-hw__key[data-micro-key="' + row.micro + '"]');
      if (!el) return;
      if (on) {
        el.setAttribute('data-run-status', row.status);
        el.setAttribute('data-palette-demo', '1');
      } else if (el.getAttribute('data-palette-demo') === '1') {
        el.setAttribute('data-run-status', 'idle');
        el.removeAttribute('data-palette-demo');
      }
    });
  }

  function renderKeyLightPaletteEditor(pad, opts) {
    opts = opts || {};
    var cur = normalizeKeyLightPreset(pad && pad.keyLightPreset);
    var presetHtml = KEY_LIGHT_PRESETS.map(function (row) {
      var on = row.id === cur;
      return (
        '<button type="button" class="soft-pad-lights-template' + (on ? ' is-active' : '') +
        '" data-act="key-light-preset" data-key-light-preset="' + esc(row.id) +
        '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        '<span class="soft-pad-lights-template__title">' + esc(t(row.titleKey, row.title)) + '</span>' +
        '<span class="soft-pad-lights-template__hint">' + esc(row.hint) + '</span></button>'
      );
    }).join('');
    var colorRows = KEY_LIGHT_STATUS_FIELDS.map(function (f) {
      return (
        '<div class="soft-pad-keylight-color-row">' +
        '<span>' + esc(f.label) + '</span>' +
        '<input type="color" data-act="status-color" data-status-key="' + esc(f.key) +
        '" value="' + esc(resolvedStatusColor(pad, f.key)) + '"></div>'
      );
    }).join('');
    return (
      '<div class="soft-pad-keylight-editor" data-keylight-editor="1">' +
      (opts.lead
        ? ('<p class="codex-pad-mgr__hint">' + esc(opts.lead) + '</p>')
        : '') +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadKeyLightPresetTitle', '状态配色')) + '</p>' +
      '<div class="soft-pad-keylight-presets" role="radiogroup">' + presetHtml + '</div>' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadKeyLightCustomTitle', '单独调整')) + '</p>' +
      '<div class="soft-pad-keylight-colors">' + colorRows + '</div></div>'
    );
  }

  function bindKeyLightPaletteEvents(root, m, pad) {
    if (!root || !m || !pad) return;
    root.querySelectorAll('[data-act="key-light-preset"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        var next = normalizeKeyLightPreset(btn.getAttribute('data-key-light-preset'));
        pad.keyLightPreset = next;
        pad.statusColors = {};
        root.querySelectorAll('[data-act="key-light-preset"]').forEach(function (b) {
          var on = b.getAttribute('data-key-light-preset') === next;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        root.querySelectorAll('[data-act="status-color"]').forEach(function (inp) {
          var key = inp.getAttribute('data-status-key');
          if (key) inp.value = resolvedStatusColor(pad, key);
        });
        persistPadLightColors(m, pad);
      });
    });
    root.querySelectorAll('[data-act="status-color"]').forEach(function (inp) {
      if (inp.__softPadBound) return;
      inp.__softPadBound = true;
      inp.addEventListener('input', function () {
        var key = inp.getAttribute('data-status-key');
        if (!key) return;
        if (!pad.statusColors || typeof pad.statusColors !== 'object') pad.statusColors = {};
        pad.statusColors[key] = String(inp.value || '');
        persistPadLightColors(m, pad);
      });
    });
  }

  function renderLightsAmbientTab(m, pad) {
    var mode = resolveLightsPanelMode(m);
    var appName = appDisplayName(m, mode);
    var ambientMode = String((pad && pad.ambientMode) || 'status') === 'solid' ? 'solid' : 'status';
    var solid = String((pad && pad.ambientSolidRgb) || '#7c3aed');
    if (solid.charAt(0) !== '#') solid = '#' + solid;
    var opacity = clampAmbientOpacity(pad && pad.ambientOpacity);
    var mainOn = pad && pad.ambientEnabled !== false;
    var lead = mode.indexOf('preset-') === 0
      ? t('softPadLightsAmbientPresetLead',
        '盘边与 Soft RGB 可跟随 {name} 主状态，也可固定一种颜色。各 agent 默认跟随状态，可分别调整并保存。')
        .replace('{name}', appName)
      : t('softPadLightsAmbientCustomLead', '为此习惯配置盘边氛围灯（无需探针）。');
    return (
      '<div class="soft-pad-lights-tab-panel__inner" data-lights-tab="ambient" data-ambient-mode="' +
      esc(ambientMode) + '">' +
      '<p class="codex-pad-mgr__hint">' + esc(lead) + '</p>' +
      '<div class="soft-pad-lights-simple__row">' +
      '<label><input type="checkbox" data-act="lights-ambient-enabled"' +
      (mainOn ? ' checked' : '') + '> ' +
      esc(t('softPadLightsAmbientEnable', '启用盘边氛围灯')) +
      '</label></div>' +
      '<div class="soft-pad-ambient-modes" role="radiogroup" aria-label="' +
      esc(t('softPadAmbientModeAria', '氛围效果')) + '">' +
      '<button type="button" class="soft-pad-lights-template' +
      (ambientMode === 'status' ? ' is-active' : '') +
      '" data-act="ambient-mode" data-ambient-mode="status" aria-pressed="' +
      (ambientMode === 'status' ? 'true' : 'false') + '">' +
      '<span class="soft-pad-lights-template__title">' +
      esc(t('softPadAmbientModeStatus', '跟随状态')) + '</span>' +
      '<span class="soft-pad-lights-template__hint">' +
      esc(t('softPadAmbientModeStatusHint', '忙/等你/完成用系统色')) + '</span></button>' +
      '<button type="button" class="soft-pad-lights-template' +
      (ambientMode === 'solid' ? ' is-active' : '') +
      '" data-act="ambient-mode" data-ambient-mode="solid" aria-pressed="' +
      (ambientMode === 'solid' ? 'true' : 'false') + '">' +
      '<span class="soft-pad-lights-template__title">' +
      esc(t('softPadAmbientModeSolid', '固定盘边色')) + '</span>' +
      '<span class="soft-pad-lights-template__hint">' +
      esc(t('softPadAmbientModeSolidHint', '自定义一种颜色常亮')) + '</span></button>' +
      '</div>' +
      '<div class="soft-pad-ambient-color' + (ambientMode === 'solid' ? '' : ' is-dim') + '">' +
      '<label class="soft-pad-ambient-color__lbl">' +
      esc(t('softPadAmbientColorLbl', '盘边颜色')) +
      ' <input type="color" data-act="ambient-solid-rgb" value="' + esc(solid) + '"></label></div>' +
      '<div class="soft-pad-ambient-opacity">' +
      '<label><span>' + esc(t('softPadAmbientOpacityLbl', '氛围透明度')) + '</span>' +
      '<input type="range" min="10" max="100" step="1" data-act="ambient-opacity" value="' +
      opacity + '"><span data-ambient-opacity-val>' + opacity + '%</span></label></div>' +
      '</div>'
    );
  }

  function keysLightsCapability(mode) {
    if (mode === 'preset-claude' || mode === 'preset-codex') return 'preset';
    if (mode === 'preset-cursor' || mode === 'custom') return 'customizable';
    return 'unsupported';
  }

  function renderLightsKeysTab(m, pad) {
    var mode = resolveLightsPanelMode(m);
    var agent = scopeAgentKind(m, mode);
    var appName = appDisplayName(m, mode);
    var cap = keysLightsCapability(mode);
    var mainOn = mode.indexOf('preset-') === 0 && agent
      ? agentLightEnabledOnPad(pad, agent)
      : !!(pad && pad.enabled);
    var body = '';
    if (cap === 'preset' && agent) {
      body =
        '<p class="codex-pad-mgr__hint" data-lights-keys-preset-lead="1">' +
        esc(t('softPadLightsKeysPresetLead',
          '按键灯配色见下方；顶栏开关与接入请在「迷你栏」管理。')) +
        '</p>';
    } else if (cap === 'customizable') {
      body =
        renderLightTemplateKeysCards(pad) +
        '<div class="soft-pad-lights-simple__row">' +
        '<label><input type="checkbox" data-act="lights-custom-enabled"' +
        (mainOn ? ' checked' : '') + '> ' +
        esc(t('softPadLightsShowApp', '显示 {name} 状态灯').replace('{name}', appName)) +
        '</label></div>';
    } else {
      body =
        '<p class="codex-pad-mgr__hint" data-lights-keys-unsupported="1">' +
        esc(t('softPadLightsKeysUnsupported',
          '此习惯无自动按键灯。可用氛围灯/顶栏，或在右侧改习惯配置。')) +
        '</p>';
    }
    var adv = '';
    if (cap === 'preset' || cap === 'customizable') {
      adv =
        renderKeyLightPaletteEditor(pad, {
          lead: t('softPadKeyLightLead', '各 agent 共用一套默认状态色；可换预设或单独改色，并持久保存到当前习惯。')
        }) +
        '<details class="soft-pad-lights-advanced">' +
        '<summary>' + esc(t('softPadLightsAdvancedSummary', '高级设置（逐键、API、能力对照、诊断）')) + '</summary>' +
        '<div class="soft-pad-lights-advanced__body" data-lazy-agent-body data-filled="0"></div>' +
        '</details>';
    } else if (mode === 'preset-shell' && agent) {
      adv =
        renderKeyLightPaletteEditor(pad, {
          lead: t('softPadKeyLightLeadShell', '为此习惯配置状态灯配色（可与顶栏/氛围灯一起用）。')
        }) +
        '<details class="soft-pad-lights-advanced soft-pad-lights-advanced--shell">' +
        '<summary>' + esc(t('softPadLightsShellDiagSummary', '诊断（可选）')) + '</summary>' +
        '<div class="soft-pad-lights-shell-diag" data-shell-diag-host="' + esc(agent) + '"></div>' +
        '</details>';
    } else {
      adv = renderKeyLightPaletteEditor(pad, {
        lead: t('softPadKeyLightLeadSoft', '为此习惯配置状态灯配色。')
      });
    }
    return (
      '<div class="soft-pad-lights-tab-panel__inner" data-lights-tab="keys" data-keys-cap="' +
      esc(cap) + '">' + body + adv + '</div>'
    );
  }

  function renderLightTemplateCards(pad) {
    var cur = String((pad && pad.lightTemplate) || 'bezel');
    var items = [
      ['bezel', t('softPadLightTplBezel', '盘边变色'), t('softPadLightTplBezelHint', '前台时盘边一种颜色'), true],
      ['single', t('softPadLightTplSingle', '一盏键灯'), t('softPadLightTplSingleHint', '像 Codex，一颗键表示忙闲'), false],
      ['multi', t('softPadLightTplMulti', '多键提示'), t('softPadLightTplMultiHint', '看起来像 Claude（规则驱动）'), false]
    ];
    return (
      '<div class="soft-pad-lights-templates" role="radiogroup" aria-label="' +
      esc(t('softPadLightTplPick', '选一种效果')) + '">' +
      items.map(function (row) {
        var id = row[0];
        var on = cur === id;
        return (
          '<button type="button" class="soft-pad-lights-template' + (on ? ' is-active' : '') +
          '" data-light-template="' + esc(id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
          '<span class="soft-pad-lights-template__title">' + esc(row[1]) +
          (row[3] ? ' · ' + esc(t('softPadLightTplRecommended', '推荐')) : '') + '</span>' +
          '<span class="soft-pad-lights-template__hint">' + esc(row[2]) + '</span>' +
          (id === 'multi'
            ? ('<span class="soft-pad-lights-template__badge">' +
              esc(t('softPadLightTplMultiBadge', '模拟效果 · 非官方 Hook')) + '</span>')
            : '') +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function workbenchPreviewSubtab(tab) {
    tab = normalizeWorkbenchTab(tab || softPadWorkbenchTab);
    if (tab === 'match') {
      return softPadLightsSubtab === 'keys' ? 'keys' : 'ambient';
    }
    if (tab === 'mini') return 'topbar';
    return 'ambient';
  }

  function workbenchPreviewOpts(tab) {
    tab = normalizeWorkbenchTab(tab || softPadWorkbenchTab);
    return {
      subtab: workbenchPreviewSubtab(tab),
      focusAgent: hubSelectedScopeKind(),
      stripMode: 'focus',
      previewFace: tab
    };
  }

  function resolveAgentWorkbenchCaps(m, scopeKind) {
    var mode = resolveLightsPanelMode(m);
    var Reg = global.OneToneSoftPadAgentRegistry;
    var caps = Reg && Reg.agentLightsCapability
      ? Reg.agentLightsCapability(scopeKind)
      : { topbar: true, keys: keysLightsCapability(mode), ambient: true, session: false };
    return { mode: mode, caps: caps };
  }

  function renderAgentWorkbenchSubtabBar(activeTab) {
    activeTab = normalizeWorkbenchTab(activeTab);
    function btn(id, label) {
      var on = activeTab === id;
      return (
        '<button type="button" class="soft-pad-feature-subtab soft-pad-agent-workbench__tab' +
        (on ? ' is-active' : '') + '" role="tab" data-agent-workbench-tab="' + id +
        '" aria-selected="' + (on ? 'true' : 'false') + '">' +
        '<span class="soft-pad-feature-subtab__lbl">' + esc(label) + '</span></button>'
      );
    }
    return (
      '<div class="soft-pad-agent-workbench__tabs" data-agent-workbench-tab-bar="1" role="tablist" aria-label="' +
      esc(t('softPadWorkbenchTabsAria', '灯效与浮窗')) + '">' +
      btn('match', t('softPadWorkbenchTabMatch', '灯效匹配')) +
      btn('data', t('softPadWorkbenchTabData', '显示数据')) +
      btn('mini', t('softPadWorkbenchTabMini', '迷你栏')) +
      '</div>'
    );
  }

  function renderAgentWorkbenchLightsSubtabBar(activeTab) {
    function btn(id, label) {
      var on = activeTab === id;
      return (
        '<button type="button" class="soft-pad-feature-subtab soft-pad-lights-subtab' +
        (on ? ' is-active' : '') + '" role="tab" data-lights-subtab="' + id +
        '" aria-selected="' + (on ? 'true' : 'false') + '">' +
        '<span class="soft-pad-feature-subtab__lbl">' + esc(label) + '</span></button>'
      );
    }
    /* v16: ambient first */
    return (
      '<div class="soft-pad-lights-subtabs soft-pad-agent-workbench__lights-tabs" data-lights-subtab-bar="1" role="tablist" aria-label="' +
      esc(t('softPadLightsSubtabsAria', '状态灯配置')) + '">' +
      btn('ambient', t('softPadLightsTabAmbient', '氛围灯')) +
      btn('keys', t('softPadLightsTabKeys', '按键灯')) +
      '</div>'
    );
  }

  function renderAgentReadinessPanel(m, pad, ctx) {
    ctx = ctx || {};
    var caps = ctx.caps;
    var scopeKind = ctx.scopeKind;
    var mid = m && m.id ? String(m.id) : '';
    var padOn = !!(pad && pad.enabled);
    return (
      '<div class="soft-pad-agent-readiness soft-pad-agent-workbench__card" data-agent-readiness="1">' +
      '<h4>' + esc(t('softPadMatchConnectTitle', '当前 Agent')) +
      (scopeKind ? (' · ' + esc(String(scopeKind))) : '') + '</h4>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadMatchConnectLead',
        '先开 Pad，再完成下方「接入」。要改顶栏亮哪些 Agent，切到「迷你栏」页。')) +
      '</p>' +
      '<div class="soft-pad-agent-readiness__row">' +
      '<span class="soft-pad-agent-readiness__lbl">' + esc(t('softPadReadinessPad', 'Pad')) + '</span>' +
      (mid
        ? ('<button type="button" class="toggle-switch' + (padOn ? ' is-on' : '') +
          '" data-act="agent-pad-enable" data-scheme-enable="' + esc(mid) +
          '" role="switch" aria-checked="' +
          (padOn ? 'true' : 'false') + '" aria-label="' +
          esc(t('softPadReadinessPadToggle', '虚拟键盘开关')) + '"></button>')
        : '<span class="soft-pad-agent-readiness__lbl">—</span>') +
      '<span class="soft-pad-agent-readiness__hint" data-agent-pad-enable-hint="1">' +
      esc(padOn ? t('softPadHubStatusOn', '已启用') : t('softPadHubStatusOff', '未启用')) +
      '</span></div>' +
      (caps && caps.topbar
        ? ('<p class="codex-pad-mgr__hint soft-pad-agent-readiness__topbar-hint">' +
          esc(t('softPadReadinessTopbarHint',
            '顶栏灯名单在「迷你栏 → Agents」添加或移除。')) + '</p>')
        : '') +
      renderConnectStatusSectionHtml(pad, {}, { mode: 'scope', scopeAgent: scopeKind }) +
      '</div>'
    );
  }

  function renderAgentLightsPanel(m, pad, ctx) {
    ctx = ctx || {};
    var caps = ctx.caps || {};
    var keysCap = caps.keys || keysLightsCapability(ctx.mode);
    var keysNa = keysCap === 'unsupported';
    var ambientNa = caps.ambient === false;
    var tab = softPadLightsSubtab;
    if (tab !== 'keys' && tab !== 'ambient') tab = 'ambient';
    var body = '';
    if (tab === 'ambient') {
      body = ambientNa
        ? ('<p class="codex-pad-mgr__hint">' + esc(t('softPadLightsCapNa', '此应用不支持')) + '</p>')
        : renderLightsAmbientTab(m, pad);
    } else {
      body = keysNa
        ? ('<p class="codex-pad-mgr__hint">' +
          esc(t('softPadLightsKeysUnsupported',
            '此习惯无自动按键灯。可用氛围灯/顶栏，或在右侧改习惯配置。')) + '</p>')
        : renderLightsKeysTab(m, pad);
    }
    return (
      '<div class="soft-pad-agent-workbench__lights" data-agent-lights-panel="1">' +
      renderAgentWorkbenchLightsSubtabBar(tab) +
      '<div class="soft-pad-agent-workbench__lights-body" data-agent-workbench-lights-body="1" data-lights-subtab="' +
      esc(tab) + '">' + body + '</div></div>'
    );
  }

  function previewMetaOnPad(pad) {
    var meta = pad && pad.previewMeta && typeof pad.previewMeta === 'object' ? pad.previewMeta : null;
    return {
      account: !(meta && meta.account === false),
      usage: !(meta && meta.usage === false),
      reset: !(meta && meta.reset === false)
    };
  }

  function scopeKindForDataPanel(m) {
    var kind = '';
    try { kind = String(hubSelectedScopeKind() || ''); } catch (_) {}
    if (!kind) {
      try {
        var Hub = global.OneToneSoftPadHub;
        if (Hub && Hub.kindForAppId && m) {
          kind = String(Hub.kindForAppId(m.appTargetId) || '');
        }
      } catch (_) {}
    }
    return String(kind || '').toLowerCase();
  }

  function resolvePreviewUsageDetail(m) {
    var kind = scopeKindForDataPanel(m);
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && Hub.previewUsageDetailForScope) {
        return Hub.previewUsageDetailForScope(kind) || { kind: kind };
      }
    } catch (_) {}
    return { kind: kind };
  }

  function dataLiveMetric(key, label, value, opts) {
    opts = opts || {};
    var empty = value == null || value === '' || value === '—';
    return (
      '<div class="soft-pad-agent-data-live__metric' + (empty ? ' is-empty' : '') +
      (opts.wide ? ' is-wide' : '') + '" data-live-key="' + esc(key) + '">' +
      '<span class="soft-pad-agent-data-live__k">' + esc(label) + '</span>' +
      '<span class="soft-pad-agent-data-live__v">' + esc(empty ? '—' : String(value)) + '</span></div>'
    );
  }

  function cursorLiveBarPct(value, max) {
    var n = Number(value);
    var m = Math.max(1, Number(max) || 1);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.max(8, Math.min(100, Math.round((n / m) * 100)));
  }

  function renderCursorDataLiveHtml(detail) {
    detail = detail || {};
    var turns = detail.ready && detail.turns != null ? Number(detail.turns) : null;
    var sessions = detail.ready && detail.sessions != null ? Number(detail.sessions) : null;
    var yest = detail.yesterdayTurns != null ? Number(detail.yesterdayTurns) : null;
    var maxTurns = Math.max(turns || 0, yest || 0, 1);
    var deltaHtml = '';
    if (detail.ready && detail.deltaPct != null) {
      var arrow = detail.deltaPct > 0 ? '↑' : (detail.deltaPct < 0 ? '↓' : '·');
      var deltaCls = detail.deltaPct > 0 ? 'is-up' : (detail.deltaPct < 0 ? 'is-down' : '');
      deltaHtml =
        '<div class="soft-pad-cursor-live__delta ' + deltaCls + '">' +
        esc(arrow + Math.abs(detail.deltaPct) + '%') +
        '<span>' + esc(t('softPadDataCursorDelta', '较昨日对话')) +
        (yest != null ? esc(' · 昨 ' + yest + ' 次') : '') +
        '</span></div>';
    }
    var body = detail.ready
      ? (
        '<div class="soft-pad-cursor-live__stats">' +
        '<div class="soft-pad-cursor-live__stat">' +
        '<span class="soft-pad-cursor-live__n">' + esc(turns != null ? String(turns) : '—') + '</span>' +
        '<span class="soft-pad-cursor-live__k">' + esc(t('softPadDataCursorTurns', '今日对话')) + '</span>' +
        '<span class="soft-pad-cursor-live__bar" style="--pct:' +
        cursorLiveBarPct(turns, maxTurns) + '%"></span></div>' +
        '<div class="soft-pad-cursor-live__stat">' +
        '<span class="soft-pad-cursor-live__n">' +
        esc(sessions != null ? String(sessions) : '—') + '</span>' +
        '<span class="soft-pad-cursor-live__k">' +
        esc(t('softPadDataCursorSessions', 'Agent 会话')) + '</span>' +
        '<span class="soft-pad-cursor-live__bar" style="--pct:' +
        cursorLiveBarPct(sessions, Math.max(sessions || 0, 8)) + '%"></span></div>' +
        '<div class="soft-pad-cursor-live__stat">' +
        '<span class="soft-pad-cursor-live__n">' +
        esc(detail.activeLabel || '—') + '</span>' +
        '<span class="soft-pad-cursor-live__k">' +
        esc(t('softPadDataCursorActive', '今日活跃')) + '</span></div>' +
        '</div>' + deltaHtml
      )
      : (
        '<p class="codex-pad-mgr__hint soft-pad-cursor-live__empty">' +
        esc(detail.message || t('cursorActivityOff', '未启用 · 不会读取本机 Cursor 使用记录')) +
        '</p>'
      );
    return (
      '<div class="soft-pad-agent-data-live soft-pad-cursor-live" data-agent-data-live="1" data-kind="cursor">' +
      '<p class="soft-pad-agent-data-live__note">' +
      esc(t('softPadDataCursorNote',
        '本机活动（非官方额度）。迷你栏用量 pill 只摘一句摘要。')) +
      '</p>' + body +
      '<p class="soft-pad-cursor-live__state">' +
      esc(detail.ready
        ? t('softPadDataCursorReadyOn', '已就绪 · 本地活动')
        : t('softPadDataCursorReadyOff', '暂无读数')) +
      '</p></div>'
    );
  }

  function renderGenericDataLiveHtml(detail, pad) {
    detail = detail || {};
    var meta = previewMetaOnPad(pad);
    var metrics = '';
    if (meta.account) {
      var acct = String(detail.account || '').trim();
      var plan = String(detail.plan || '').trim();
      metrics += dataLiveMetric('account', t('softPadDataLiveAccount', '账号 / 套餐'),
        acct && plan ? (acct + ' · ' + plan) : (acct || plan || '—'));
    }
    if (meta.usage) {
      metrics += dataLiveMetric('usage', t('softPadDataLiveUsage', '用量摘要'),
        String(detail.usageSummary || '').trim() || '—', { wide: true });
    }
    if (meta.reset) {
      metrics += dataLiveMetric('reset', t('softPadDataLiveReset', '重置倒计时'),
        String(detail.resetCountdown || '').trim() || '—');
    }
    if (!metrics) {
      return (
        '<p class="codex-pad-mgr__hint" data-agent-data-live="1">' +
        esc(t('softPadDataPreviewOff', '第二行已关')) + '</p>'
      );
    }
    if (detail.sourceLabel) {
      metrics += dataLiveMetric('src', t('softPadDataLiveSource', '数据来源'), detail.sourceLabel);
    }
    return (
      '<div class="soft-pad-agent-data-live" data-agent-data-live="1" data-kind="' +
      esc(detail.kind || '') + '">' +
      '<div class="soft-pad-agent-data-live__grid">' + metrics + '</div></div>'
    );
  }

  function renderAgentDataLiveHtml(m, pad) {
    var detail = resolvePreviewUsageDetail(m);
    if (String(detail.kind || '') === 'cursor') {
      return renderCursorDataLiveHtml(detail);
    }
    return renderGenericDataLiveHtml(detail, pad);
  }

  function patchAgentDataLive(body, m, pad) {
    if (!body || !m || !pad) return;
    var host = body.querySelector('[data-agent-data-live]');
    if (!host) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = renderAgentDataLiveHtml(m, pad);
    var next = wrap.firstChild;
    if (next) host.replaceWith(next);
  }

  function renderAgentDataQuotaBlock() {
    var adds = TOPBAR_QUOTA_CANDIDATES.map(function (c) {
      return (
        '<button type="button" class="codex-micro-pad__btn" data-act="data-quota-open" data-provider="' +
        esc(c.provider) + '">' + esc('+ ' + c.label) + '</button>'
      );
    }).join('');
    return (
      '<div class="soft-pad-agent-workbench__card" data-agent-data-quota="1">' +
      '<h4>' + esc(t('softPadTopbarQuotaLbl', 'API 额度候补')) + '</h4>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadDataQuotaLead',
        '填 key 后供迷你栏 pill 选用（不是登录 token）。')) +
      '</p>' +
      '<div class="soft-pad-topbar-light-active-list" data-topbar-quota-list role="list"></div>' +
      '<div class="codex-pad-mgr__claude-act-actions soft-pad-agent-data-quota-adds">' + adds + '</div>' +
      renderQuotaKeyCardHtml() +
      '</div>'
    );
  }

  function renderAgentDataPanel(m, pad, opts) {
    opts = opts || {};
    var meta = previewMetaOnPad(pad);
    var kind = scopeKindForDataPanel(m);
    var isCursor = kind === 'cursor';
    function sw(key, on, label) {
      return (
        '<div class="soft-pad-agent-data-toggle">' +
        '<span class="soft-pad-agent-data-toggle__lbl">' + esc(label) + '</span>' +
        '<button type="button" class="toggle-switch' + (on ? ' is-on' : '') +
        '" data-act="preview-meta" data-meta-key="' + esc(key) + '" role="switch" aria-checked="' +
        (on ? 'true' : 'false') + '"></button></div>'
      );
    }
    var sourceCard = isCursor
      ? (
        '<div class="soft-pad-agent-workbench__card" data-agent-data-cursor="1">' +
        '<h4>' + esc(t('cursorActivityTitle', 'Cursor 本地活动统计')) + '</h4>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadDataCursorLead',
          'Cursor 没有官方额度 API。数字来自本机活动（今日对话等）。「接入」只管灯效 Hook，不挡这里读数。')) +
        '</p>' +
        renderCursorActivityConsentCard() +
        '</div>'
      )
      : renderAgentDataQuotaBlock();
    var metaCard = isCursor
      ? (
        '<div class="soft-pad-agent-workbench__card" data-agent-data-meta="1" data-meta-kind="cursor">' +
        '<h4>' + esc(t('softPadDataMetaTitleCursor', '预览条摘要')) + '</h4>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadDataMetaCursorLead',
          'Cursor 固定显示本地活动摘要。开关控制预览条第二行是否摘录账号 / 用量 / 重置字段（多数时候为空）。')) +
        '</p>' +
        sw('account', meta.account, t('softPadDataShowAccount', '显示账号')) +
        sw('usage', meta.usage, t('softPadDataShowUsage', '显示用量摘要')) +
        sw('reset', meta.reset, t('softPadDataShowReset', '显示重置')) +
        '</div>'
      )
      : (
        '<div class="soft-pad-agent-workbench__card" data-agent-data-meta="1">' +
        '<h4>' + esc(t('softPadDataMetaTitle', '设置页状态栏 · 第二行')) + '</h4>' +
        sw('account', meta.account, t('softPadDataShowAccount', '显示账号')) +
        sw('usage', meta.usage, t('softPadDataShowUsage', '显示额度')) +
        sw('reset', meta.reset, t('softPadDataShowReset', '显示重置')) +
        '</div>'
      );
    return (
      '<div class="soft-pad-agent-workbench__data" data-agent-data-panel="1">' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadDataLead',
        '这里改「设置页预览条」看哪些数；迷你栏 pill / 顶栏亮谁在本页下方的迷你分区调。')) +
      '</p>' +
      '<div class="soft-pad-agent-workbench__card" data-agent-data-live-card="1">' +
      '<h4>' + esc(t('softPadDataLiveTitle', '当前读数')) + '</h4>' +
      renderAgentDataLiveHtml(m, pad) +
      '</div>' +
      metaCard +
      sourceCard +
      (opts.omitGotoMini
        ? ''
        : ('<button type="button" class="codex-micro-pad__btn" data-act="goto-workbench" data-goto-tab="mini">' +
          esc(t('softPadDataGotoMini', '去迷你栏调形态 / 亮谁 →')) +
          '</button>')) +
      '</div>'
    );
  }

  function miniUsagePillOnPad(pad) {
    return !pad || pad.miniUsagePillEnabled !== false;
  }

  function miniUsagePillHideEmptyOnPad(pad) {
    return !pad || pad.miniUsagePillHideEmpty !== false;
  }

  function resolveMiniUsagePillCopy(m, pad) {
    var kind = '';
    try { kind = String(hubSelectedScopeKind() || ''); } catch (_) {}
    if (!kind && m) {
      try {
        var Hub = global.OneToneSoftPadHub;
        if (Hub && Hub.kindForAppId) kind = String(Hub.kindForAppId(m.appTargetId) || '');
      } catch (_) {}
    }
    var abbr = ({
      cursor: 'Cu', claude: 'Cl', codex: 'Cd', windsurf: 'Ws', trae: 'Tr',
      traeCode: 'Tr', gemini: 'Ge', minimax: 'Mx', qoder: 'Qo'
    })[kind] || (kind ? String(kind).slice(0, 2) : '');
    try {
      var HubD = global.OneToneSoftPadHub;
      if (HubD && HubD.previewUsageDetailForScope) {
        var d = HubD.previewUsageDetailForScope(kind || 'cursor') || {};
        if (d.turns != null && isFinite(Number(d.turns))) {
          return (abbr || 'Cu') + ' · ' + Math.round(Number(d.turns)) + '次';
        }
      }
    } catch (_) {}
    var props = resolvePreviewUsageProps(m);
    var summary = String(props.usageSummary || '').trim();
    if (summary && summary !== '—' && summary !== '--') {
      /* Mini bar: first segment only — long “今日…会话…活跃…” belongs in 显示数据 */
      var first = summary.split(/\s*[·/]\s*/)[0] || summary;
      if (first.length > 14) first = first.slice(0, 12) + '…';
      return abbr ? (abbr + ' · ' + first.replace(/^今日\s*/, '')) : first;
    }
    if (miniUsagePillHideEmptyOnPad(pad)) return '';
    return '--';
  }

  function patchAgentMiniPillCopy(body, m, pad) {
    if (!body || !pad) return;
    var copyEl = body.querySelector('[data-mini-pill-copy]');
    if (!copyEl) return;
    var copy = resolveMiniUsagePillCopy(m, pad);
    if (copy) {
      copyEl.hidden = false;
      copyEl.classList.remove('is-empty');
      copyEl.textContent = copy;
    } else {
      copyEl.hidden = true;
      copyEl.classList.add('is-empty');
      copyEl.textContent = '';
    }
  }

  function renderMiniChromeToggle(flag, on, label) {
    return (
      '<div class="soft-pad-agent-mini-pill-row soft-pad-agent-data-toggle soft-pad-agent-mini-toggle">' +
      '<span class="soft-pad-agent-data-toggle__lbl">' + esc(label) + '</span>' +
      '<button type="button" class="toggle-switch' + (on ? ' is-on' : '') +
      '" data-act="mini-chrome" data-chrome-flag="' + esc(flag) +
      '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></button></div>'
    );
  }

  function renderMiniChromeSeg(key, cur, opts) {
    return (
      '<div class="soft-pad-agent-mini-seg" role="radiogroup" data-chrome-seg="' +
      esc(key) + '">' +
      opts.map(function (o) {
        var on = cur === o.id;
        return (
          '<button type="button" class="soft-pad-agent-mini-seg__btn' + (on ? ' is-active' : '') +
          '" data-chrome-seg-val="' + esc(o.id) + '" role="radio" aria-checked="' +
          (on ? 'true' : 'false') + '">' +
          (o.icon
            ? ('<span class="soft-pad-agent-mini-seg__ico" aria-hidden="true">' + o.icon + '</span>')
            : '') +
          '<span class="soft-pad-agent-mini-seg__title">' + esc(o.title) + '</span>' +
          (o.hint
            ? ('<span class="soft-pad-agent-mini-seg__hint">' + esc(o.hint) + '</span>')
            : '') +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
  }

  var MINI_TOOL_DEFS = [
    { id: 'pushToTalk', label: '麦克风', slot: 'ACT10', ico: 'mic' },
    { id: 'stopOrSend', label: '发送', slot: 'ACT12', ico: 'send' },
    { id: 'continue', label: '继续', slot: 'AG02', ico: 'spark' },
    { id: 'newThread', label: '新建', slot: 'AG01', ico: 'plus' },
    { id: 'cancelListen', label: '取消', slot: 'ACT08', ico: 'x' }
  ];
  var MINI_TOOL_ICON = {
    pushToTalk: '🎙',
    stopOrSend: '⏎',
    continue: '⚡',
    newThread: '💬',
    cancelListen: '⊘'
  };
  var MINI_TOOL_SVG = {
    mic: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 12h14M13 6l6 6-6 6"/></svg>',
    spark: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M12 5v14M5 12h14"/><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 7l10 10M17 7L7 17"/></svg>'
  };

  function renderAgentMiniPillCard(m, pad) {
    var on = miniUsagePillOnPad(pad);
    var hideEmpty = miniUsagePillHideEmptyOnPad(pad);
    return (
      '<div class="soft-pad-agent-mini-look-extras" data-agent-mini-pill-card="1">' +
      '<span class="soft-pad-agent-mini-field__lbl">' +
      esc(t('softPadMiniPillTitle', '条上用量')) + '</span>' +
      renderMiniChromeToggle('__pillEnabled', on, t('softPadMiniPillShow', '显示当前前台用量')) +
      renderMiniChromeToggle('__pillHideEmpty', hideEmpty, t('softPadMiniPillHideEmpty', '没数据时先藏着')) +
      '</div>'
    );
  }

  function ensureAutoTopbarLights(pad) {
    if (!pad) return false;
    var changed = false;
    try {
      var Hub = global.OneToneSoftPadHub;
      var scopes = Hub && Hub.listAppScopes ? Hub.listAppScopes() : [];
      scopes.forEach(function (scope) {
        var kind = String((scope && (scope.kind || scope.id)) || '');
        if (!kind || kind === 'universal' || kind.indexOf('softPad') === 0) return;
        if (!(scope.installed || scope.connected || scope.padEnabled)) return;
        if (!TOPBAR_LIGHT_CANDIDATES.some(function (c) { return c.agent === kind; })) return;
        if (!agentLightEnabledOnPad(pad, kind)) {
          setAgentLightFlagOnPad(pad, kind, true);
          changed = true;
        }
      });
    } catch (_) {}
    if (changed) {
      try {
        var p = global.OneToneConfigPersist;
        if (p && p.saveAsync) p.saveAsync();
        else if (p && p.save) p.save();
      } catch (_) {}
    }
    return changed;
  }

  function renderMiniAutoRoster(pad) {
    ensureAutoTopbarLights(pad);
    var Connect = global.OneToneSoftPadConnect;
    var enabled = TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
      return agentLightEnabledOnPad(pad, c.agent);
    });
    var rows = enabled.map(function (c) {
      var need = !!(Connect && Connect.isQuotaKind && Connect.isQuotaKind(c.agent));
      return (
        '<div class="soft-pad-mini-auto-row' + (need ? ' is-need' : '') +
        '" data-mini-auto-agent="' + esc(c.agent) + '">' +
        '<span class="soft-pad-agent-light-row__chip" data-agent="' + esc(c.agent) + '" data-status="idle">' +
        '<img src="' + esc(agentLightIconSrc(c.agent)) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
        '<i class="soft-pad-agent-light-row__dot" aria-hidden="true"></i></span>' +
        '<span class="soft-pad-mini-auto-row__name">' + esc(c.label) + '</span>' +
        (need
          ? ('<button type="button" class="codex-micro-pad__btn soft-pad-mini-auto-row__need" data-act="agent-light-connect" data-agent="' +
            esc(c.agent) + '">' + esc(t('softPadMiniRosterSetup', '去配置')) + '</button>')
          : '') +
        '</div>'
      );
    }).join('');
    if (!rows) {
      rows = '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadMiniRosterEmptyAuto', '还没检测到已安装的 Agent。装好后会自动出现。')) +
        '</p>';
    }
    return (
      '<div class="soft-pad-mini-auto-roster" data-mini-auto-roster="1">' +
      rows +
      '</div>'
    );
  }

  var MINI_RAIL_ICO = {
    agents: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="7" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="17" cy="12" r="2.2" fill="currentColor"/></svg>',
    speech: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
    tools: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="3" y="7" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="10" y="7" width="5" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="17" y="7" width="4" height="5" rx="1.2" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 16h16"/></svg>',
    display: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="3" y="8" width="18" height="8" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M7 12h4M14 12h3"/></svg>'
  };

  function miniRailCoach(rail) {
    if (rail === 'speech') return t('softPadMiniCoachSpeech', '左边条下会亮：麦标 + 你说的话');
    if (rail === 'tools') return t('softPadMiniCoachTools', '左边悬停第二行：点选的快捷钮会亮');
    if (rail === 'display') return t('softPadMiniCoachDisplay', '左边对照细条 / 完整键盘；改完立刻换预览');
    return t('softPadMiniCoachAgents', '左边第一行圆点 = 已装 Agent 的忙闲');
  }

  function renderMiniShowModeTabs(mode) {
    mode = String(mode || 'follow');
    var opts = [
      ['follow', t('softPadMiniShowFollow', '跟前台'), t('softPadMiniShowFollowHint', 'Agent 在前才出')],
      ['front', t('softPadMiniShowFront', '一直挂着'), t('softPadMiniShowFrontHint', '不跟前台藏起')],
      ['mini', t('softPadMiniShowForceMini', '强制细条'), t('softPadMiniShowForceMiniHint', '固定迷你栏形态')],
      ['hidden', t('softPadMiniShowHidden', '不浮出'), t('softPadMiniShowHiddenHint', '关掉悬浮窗')]
    ];
    return (
      '<div class="soft-pad-show-mode-tabs soft-pad-agent-mini-show" role="tablist" aria-label="' +
      esc(t('softPadMiniShowModeLbl', '何时浮出')) + '">' +
      opts.map(function (o) {
        var on = mode === o[0];
        return (
          '<button type="button" class="soft-pad-show-mode-tab' + (on ? ' is-active' : '') + '"' +
          ' role="tab" data-act="showMode" data-show-mode="' + o[0] + '"' +
          ' aria-selected="' + (on ? 'true' : 'false') + '">' +
          '<span class="soft-pad-show-mode-tab__t">' + esc(o[1]) + '</span>' +
          '<span class="soft-pad-show-mode-tab__h">' + esc(o[2]) + '</span></button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function renderAgentMiniPanel(m, pad) {
    var chrome = ensureMiniChrome(pad);
    var cur = (pad && pad.presentation) === 'mini' ? 'mini' : 'full';
    var showMode = resolveSoftPadShowMode(pad);
    var toolIds = Array.isArray(chrome.toolIds) ? chrome.toolIds : [];
    var toolsAll = !toolIds.length;
    var rail = softPadMiniRail;
    if (rail === 'voice' || rail === 'text') rail = 'speech';
    if (['agents', 'speech', 'tools', 'display'].indexOf(rail) < 0) rail = 'agents';
    softPadMiniRail = rail;
    var railItems = [
      ['agents', t('softPadMiniRosterTitle', '谁在忙')],
      ['speech', t('softPadMiniSpeechTitle', '听你说话')],
      ['tools', t('softPadMiniToolsTitle', '快捷钮')],
      ['display', t('softPadMiniDisplayTitle', '浮窗形态')]
    ];
    var titles = {
      agents: t('softPadMiniRosterTitle', '谁在忙'),
      speech: t('softPadMiniSpeechTitle', '听你说话'),
      tools: t('softPadMiniToolsTitle', '快捷钮'),
      display: t('softPadMiniDisplayTitle', '浮窗形态')
    };
    var head = titles[rail] || titles.agents;
    var detailBody = '';
    if (rail === 'agents') {
      detailBody =
        renderMiniChromeToggle('agentsBarEnabled', chrome.agentsBarEnabled !== false,
          t('softPadMiniAgentsShow', '条上显示忙闲圆点')) +
        '<p class="soft-pad-agent-mini-note">' +
        esc(t('softPadMiniRosterNote', '已安装的会自动进条；要额度的点「去配置」。')) +
        '</p>' +
        renderMiniAutoRoster(pad);
    } else if (rail === 'speech') {
      detailBody =
        renderMiniChromeToggle('textPreviewEnabled', chrome.textPreviewEnabled !== false,
          t('softPadMiniSpeechShow', '条下显示你说的话')) +
        renderMiniChromeToggle('voiceChipEnabled', chrome.voiceChipEnabled !== false,
          t('softPadMiniVoiceShow', '预览卡里带麦标')) +
        '<div class="soft-pad-agent-mini-field">' +
        '<span class="soft-pad-agent-mini-field__lbl">' +
        esc(t('softPadMiniTextWhenLbl', '预览卡何时出现')) + '</span>' +
        renderMiniChromeSeg('textPreviewWhen', chrome.textPreviewWhen === 'hasText' ? 'hasText' : 'listening', [
          {
            id: 'listening',
            title: t('softPadMiniTextWhenListening', '说话时'),
            hint: t('softPadMiniTextWhenListeningHint', '一开口就出'),
            icon: MINI_TOOL_SVG.mic
          },
          {
            id: 'hasText',
            title: t('softPadMiniTextWhenHasText', '有字才出'),
            hint: t('softPadMiniTextWhenHasTextHint', '有转写再显'),
            icon: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" d="M4 7h16M4 12h10M4 17h13"/></svg>'
          }
        ]) +
        '</div>';
    } else if (rail === 'tools') {
      detailBody =
        renderMiniChromeToggle('toolsBarEnabled', chrome.toolsBarEnabled !== false,
          t('softPadMiniToolsShow', '悬停时出现快捷钮')) +
        '<p class="soft-pad-agent-mini-note">' +
        esc(t('softPadMiniToolsNote', '点亮的会出现在左边第二行；关掉的不显示。')) +
        '</p>' +
        '<div class="soft-pad-agent-mini-tools" data-mini-tools="1">' +
        MINI_TOOL_DEFS.map(function (td) {
          var on = toolsAll || toolIds.indexOf(td.id) >= 0;
          var svg = MINI_TOOL_SVG[td.ico] || '';
          return (
            '<button type="button" class="soft-pad-agent-mini-tool' + (on ? ' is-active' : '') +
            '" data-act="mini-tool-id" data-tool-id="' + esc(td.id) + '" aria-pressed="' +
            (on ? 'true' : 'false') + '" title="' + esc(td.label + ' · ' + td.slot) + '">' +
            '<span class="soft-pad-agent-mini-tool__ico" aria-hidden="true">' + svg + '</span>' +
            '<span class="soft-pad-agent-mini-tool__lbl">' + esc(td.label) + '</span>' +
            '<span class="soft-pad-agent-mini-tool__slot">' + esc(td.slot) + '</span></button>'
          );
        }).join('') +
        '</div>';
    } else {
      detailBody =
        '<div class="soft-pad-agent-mini-look-seg" role="radiogroup" aria-label="' +
        esc(t('codexMicroPadPresentationLbl', '长什么样')) + '">' +
        '<button type="button" class="soft-pad-agent-mini-look' + (cur === 'mini' ? ' is-active' : '') +
        '" data-pad-presentation="mini" role="radio" aria-checked="' + (cur === 'mini' ? 'true' : 'false') + '">' +
        '<span class="soft-pad-agent-mini-look__sketch soft-pad-agent-mini-look__sketch--mini" aria-hidden="true">' +
        '<i></i><i></i><b></b></span>' +
        '<span class="soft-pad-agent-mini-look__title">' +
        esc(t('codexMicroPadPresentationMini', '细条')) + '</span>' +
        '<span class="soft-pad-agent-mini-look__hint">' +
        esc(t('softPadMiniBarHint', '当前前台 · 省略数据')) + '</span></button>' +
        '<button type="button" class="soft-pad-agent-mini-look' + (cur === 'full' ? ' is-active' : '') +
        '" data-pad-presentation="full" role="radio" aria-checked="' + (cur === 'full' ? 'true' : 'false') + '">' +
        '<span class="soft-pad-agent-mini-look__sketch soft-pad-agent-mini-look__sketch--full" aria-hidden="true">' +
        '<span></span><span></span><span></span><span></span></span>' +
        '<span class="soft-pad-agent-mini-look__title">' +
        esc(t('codexMicroPadPresentationFull', '完整键盘')) + '</span>' +
        '<span class="soft-pad-agent-mini-look__hint">' +
        esc(t('softPadMiniFullHint', '全名单 · 全量数据')) + '</span></button>' +
        '</div>' +
        '<div class="soft-pad-agent-mini-field">' +
        '<span class="soft-pad-agent-mini-field__lbl">' +
        esc(t('softPadMiniShowModeLbl', '何时浮出')) + '</span>' +
        renderMiniShowModeTabs(showMode) +
        '</div>' +
        renderAgentMiniPillCard(m, pad) +
        '<div class="soft-pad-agent-mini-look-extras soft-pad-agent-mini-look-win">' +
        '<span class="soft-pad-agent-mini-field__lbl">' +
        esc(t('softPadMiniWinLbl', '细条右侧按钮')) + '</span>' +
        renderMiniChromeToggle('expandBtnEnabled', chrome.expandBtnEnabled !== false,
          t('softPadMiniExpandShow', '显示「放大到完整键盘」')) +
        renderMiniChromeToggle('closeBtnEnabled', chrome.closeBtnEnabled !== false,
          t('softPadMiniCloseShow', '显示「关掉浮窗」')) +
        '</div>';
    }
    return (
      '<div class="soft-pad-agent-workbench__mini" data-agent-mini-panel="1" data-mini-five-chrome="1" data-mini-rail="' +
      esc(rail) + '">' +
      '<div class="soft-pad-agent-mini-rail-layout">' +
      '<nav class="soft-pad-agent-mini-rail" aria-label="' +
      esc(t('softPadMiniRailAria', '迷你栏分区')) + '">' +
      railItems.map(function (it) {
        return (
          '<button type="button" class="soft-pad-agent-mini-rail__btn' +
          (it[0] === rail ? ' is-on' : '') + '" data-act="mini-rail" data-mini-rail-id="' +
          esc(it[0]) + '" aria-pressed="' + (it[0] === rail ? 'true' : 'false') + '">' +
          '<span class="soft-pad-agent-mini-rail__ico" aria-hidden="true">' + (MINI_RAIL_ICO[it[0]] || '') +
          '</span>' +
          '<span class="soft-pad-agent-mini-rail__txt">' + esc(it[1]) + '</span></button>'
        );
      }).join('') +
      '</nav>' +
      '<div class="soft-pad-agent-workbench__card soft-pad-agent-mini-detail' +
      (rail === 'display' ? ' is-look' : '') + '" data-mini-block="' + esc(rail) + '">' +
      '<div class="soft-pad-agent-mini-detail__head"><h4>' + esc(head) + '</h4>' +
      '<p class="soft-pad-agent-mini-detail__coach">' + esc(miniRailCoach(rail)) + '</p></div>' +
      detailBody +
      '</div></div>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="goto-workbench" data-goto-tab="data">' +
      esc(t('softPadMiniGotoData', '用量来源 →')) +
      '</button></div>'
    );
  }

  function renderAgentCrossPanel(pad) {
    /* Legacy alias — v16 mini hosts the roster */
    return renderAgentMiniPanel(null, pad);
  }

  function renderAgentSessionPanel(m, pad) {
    return (
      '<div class="soft-pad-agent-workbench__session" data-agent-session-panel="1">' +
      renderPadPurposeCard(m, pad) +
      '</div>'
    );
  }

  function renderAgentMatchPanel(m, pad, ctx) {
    return (
      '<div class="soft-pad-agent-workbench__match" data-agent-match-panel="1">' +
      renderAgentReadinessPanel(m, pad, ctx) +
      renderAgentLightsPanel(m, pad, ctx) +
      '</div>'
    );
  }

  function renderAgentWorkbenchPanel(tab, m, pad, ctx) {
    tab = normalizeWorkbenchTab(tab);
    if (tab === 'data') return renderAgentDataPanel(m, pad, ctx);
    if (tab === 'mini') return renderAgentMiniPanel(m, pad);
    return renderAgentMatchPanel(m, pad, ctx);
  }

  function renderAgentWorkbench(m, pad, opts) {
    opts = opts || {};
    var scopeKind = '';
    try { scopeKind = String(hubSelectedScopeKind() || ''); } catch (_) {}
    var resolved = resolveAgentWorkbenchCaps(m, scopeKind);
    var mode = resolved.mode;
    var caps = resolved.caps;
    var agent = scopeAgentKind(m, mode);
    if (!scopeKind && agent) scopeKind = agent;
    var appName = appDisplayName(m, mode);
    var fgLow = '';
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && Hub.laneContextFromRuntime) {
        var laneCtx = Hub.laneContextFromRuntime();
        fgLow = String(Hub.kindForAppId(laneCtx.foregroundAppId || '') || '').toLowerCase();
      }
    } catch (_) {}
    var isFg = fgLow && fgLow === String(scopeKind || '').toLowerCase();
    var hideTabs = !!opts.hideWorkbenchTabs;
    var foldData = !!opts.foldDataIntoMini;
    var tab = normalizeWorkbenchTab(softPadWorkbenchTab);
    if (foldData) tab = 'mini';
    else if (hideTabs && tab !== 'match' && tab !== 'mini') tab = 'match';
    softPadWorkbenchTab = tab;
    var ctx = { mode: mode, caps: caps, agent: agent, scopeKind: scopeKind, omitGotoMini: foldData };
    var panelHtml = foldData
      ? (renderAgentDataPanel(m, pad, { omitGotoMini: true }) + renderAgentMiniPanel(m, pad))
      : renderAgentWorkbenchPanel(tab, m, pad, ctx);

    return (
      '<div class="soft-pad-agent-workbench" data-agent-workbench="1" data-agent-workbench-tab="' +
      esc(tab) + '" data-lights-mode="' + esc(mode) + '"' +
      (hideTabs ? ' data-hide-workbench-tabs="1"' : '') +
      (foldData ? ' data-fold-data-into-mini="1"' : '') + '>' +
      '<header class="soft-pad-agent-workbench__head">' +
      '<h3>' + esc(appName) + '</h3>' +
      (isFg
        ? ('<span class="soft-pad-agent-workbench__fg">' +
          esc(t('softPadConnectFgBadge', '当前前台')) + '</span>')
        : '') +
      '</header>' +
      (hideTabs ? '' : renderAgentWorkbenchSubtabBar(tab)) +
      '<div class="soft-pad-agent-workbench__panel" data-agent-workbench-panel="1">' +
      panelHtml +
      '</div></div>'
    );
  }

  function applyAgentWorkbenchTab(body, m, pad, tab) {
    if (!body || !m || !pad) return;
    tab = normalizeWorkbenchTab(tab);
    softPadWorkbenchTab = tab;
    var root = body.querySelector('[data-agent-workbench]');
    if (root) root.setAttribute('data-agent-workbench-tab', tab);
    body.querySelectorAll('[data-agent-workbench-tab][role="tab"]').forEach(function (btn) {
      var on = btn.getAttribute('data-agent-workbench-tab') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var panel = body.querySelector('[data-agent-workbench-panel]');
    var foldData = !!(root && root.getAttribute('data-fold-data-into-mini') === '1');
    if (panel) {
      var scopeKind = '';
      try { scopeKind = String(hubSelectedScopeKind() || ''); } catch (_) {}
      var resolved = resolveAgentWorkbenchCaps(m, scopeKind);
      var agent = scopeAgentKind(m, resolved.mode);
      if (!scopeKind && agent) scopeKind = agent;
      var ctx = {
        mode: resolved.mode,
        caps: resolved.caps,
        agent: agent,
        scopeKind: scopeKind,
        omitGotoMini: foldData
      };
      // Flat mini tab folds data above mini — never wipe data when switching mini-rail.
      if (foldData && (tab === 'mini' || tab === 'data')) {
        panel.innerHTML = renderAgentDataPanel(m, pad, { omitGotoMini: true }) +
          renderAgentMiniPanel(m, pad);
        softPadWorkbenchTab = 'mini';
        if (root) root.setAttribute('data-agent-workbench-tab', 'mini');
      } else {
        panel.innerHTML = renderAgentWorkbenchPanel(tab, m, pad, ctx);
      }
    }
    if (tab === 'match') {
      var lightsTab = softPadLightsSubtab;
      if (lightsTab !== 'keys' && lightsTab !== 'ambient') softPadLightsSubtab = 'ambient';
      var keysCap = keysLightsCapability(resolveLightsPanelMode(m));
      if (softPadLightsSubtab === 'keys' && (keysCap === 'preset' || keysCap === 'customizable')) {
        var advHost = body.querySelector('.soft-pad-lights-advanced__body');
        if (advHost) advHost.setAttribute('data-filled', '0');
        fillStatusLightsAdvanced(body, m, pad);
        bindShellDiagOptional(body, m);
        refreshAgentLightsPickerState(body, m, pad);
        setTimeout(function () {
          try { refreshAgentLightsPickerState(body, m, pad, { hooks: true }); } catch (_) {}
        }, 0);
      }
    }
    bindTopbarLightsPanelEvents(body, m, pad);
    bindAgentConnectEvents(body, m, pad);
    bindSoftPadLightsSubtabEvents(body, m, pad);
    bindAgentWorkbenchPanelEvents(body, m, pad);
    if (foldData || tab === 'data' || tab === 'mini') {
      try { refreshCursorActivityPrefDom(body); } catch (_) {}
      try {
        var HubData = global.OneToneSoftPadHub;
        if (HubData && HubData.requestOverlayUsageForScope) {
          HubData.requestOverlayUsageForScope(hubSelectedScopeKind());
        }
      } catch (_) {}
      setTimeout(function () {
        try { patchAgentDataLive(body, m, pad); } catch (_) {}
        try {
          if (foldData || softPadWorkbenchTab === 'mini') {
            patchAgentMiniPillCopy(body, m, pad);
          }
          var HubStrip = global.OneToneSoftPadHub;
          if (HubStrip && HubStrip.syncAgentPreviewUsageStrip) HubStrip.syncAgentPreviewUsageStrip();
        } catch (_) {}
      }, 160);
    }
    var Hub = global.OneToneSoftPadHub;
    var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
    syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts(foldData ? 'mini' : tab));
    echoStatusPaletteOnSoftPads(pad);
  }

  function bindAgentWorkbenchPanelEvents(body, m, pad) {
    if (!body || !m || !pad) return;
    body.querySelectorAll('[data-pad-presentation]').forEach(function (btn) {
      if (btn.__wbPresBound) return;
      btn.__wbPresBound = true;
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-presentation');
        if (!next || (next !== 'full' && next !== 'mini')) return;
        if (pad.presentation === next) return;
        pad.presentation = next;
        body.querySelectorAll('[data-pad-presentation]').forEach(function (b) {
          var on = b.getAttribute('data-pad-presentation') === next;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        persistPresentation(m);
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        var Hub = global.OneToneSoftPadHub;
        var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
        syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts('mini'));
      });
    });
    body.querySelectorAll('[data-act="mini-usage-pill"]').forEach(function (btn) {
      if (btn.__wbMiniPillBound) return;
      btn.__wbMiniPillBound = true;
      btn.addEventListener('click', function () {
        var flag = btn.getAttribute('data-pill-flag') || '';
        if (flag === 'enabled') {
          pad.miniUsagePillEnabled = !miniUsagePillOnPad(pad);
        } else if (flag === 'hideEmpty') {
          pad.miniUsagePillHideEmpty = !miniUsagePillHideEmptyOnPad(pad);
        } else {
          return;
        }
        var on = flag === 'enabled' ? miniUsagePillOnPad(pad) : miniUsagePillHideEmptyOnPad(pad);
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        persistMiniUsagePill(m);
        patchAgentMiniPillCopy(body, m, pad);
        var Hub = global.OneToneSoftPadHub;
        var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
        if (previewHost) patchAgentMiniBarPreviewPill(previewHost, m, pad);
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: false });
      });
    });
    body.querySelectorAll('[data-act="mini-rail"]').forEach(function (btn) {
      if (btn.__wbMiniRailBound) return;
      btn.__wbMiniRailBound = true;
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-mini-rail-id') || 'agents';
        if (['agents', 'speech', 'tools', 'display', 'voice', 'text'].indexOf(id) < 0) id = 'agents';
        if (id === 'voice' || id === 'text') id = 'speech';
        if (id === softPadMiniRail) return;
        softPadMiniRail = id;
        applyAgentWorkbenchTab(body, m, pad, 'mini');
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
      });
    });
    body.querySelectorAll('[data-act="mini-chrome"]').forEach(function (btn) {
      if (btn.__wbMiniChromeBound) return;
      btn.__wbMiniChromeBound = true;
      btn.addEventListener('click', function () {
        var flag = btn.getAttribute('data-chrome-flag') || '';
        if (flag === '__pillEnabled') {
          pad.miniUsagePillEnabled = !miniUsagePillOnPad(pad);
          var pillOn = miniUsagePillOnPad(pad);
          btn.classList.toggle('is-on', pillOn);
          btn.setAttribute('aria-checked', pillOn ? 'true' : 'false');
          persistMiniUsagePill(m);
          patchAgentMiniPillCopy(body, m, pad);
          var HubP = global.OneToneSoftPadHub;
          var ph = HubP && HubP.previewHostForFace ? HubP.previewHostForFace('agent') : null;
          if (ph) patchAgentMiniBarPreviewPill(ph, m, pad);
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: false });
          return;
        }
        if (flag === '__pillHideEmpty') {
          pad.miniUsagePillHideEmpty = !miniUsagePillHideEmptyOnPad(pad);
          var hideOn = miniUsagePillHideEmptyOnPad(pad);
          btn.classList.toggle('is-on', hideOn);
          btn.setAttribute('aria-checked', hideOn ? 'true' : 'false');
          persistMiniUsagePill(m);
          patchAgentMiniPillCopy(body, m, pad);
          var HubH = global.OneToneSoftPadHub;
          var ph2 = HubH && HubH.previewHostForFace ? HubH.previewHostForFace('agent') : null;
          if (ph2) patchAgentMiniBarPreviewPill(ph2, m, pad);
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: false });
          return;
        }
        var chrome = ensureMiniChrome(pad);
        if (!(flag in chrome) && flag !== 'voiceChipEnabled' && flag !== 'agentsBarEnabled' &&
            flag !== 'textPreviewEnabled' && flag !== 'toolsBarEnabled' &&
            flag !== 'expandBtnEnabled' && flag !== 'closeBtnEnabled') {
          return;
        }
        chrome[flag] = !(chrome[flag] !== false);
        var on = chrome[flag] !== false;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        persistMiniChrome(m);
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
      });
    });
    body.querySelectorAll('[data-chrome-seg]').forEach(function (seg) {
      if (seg.__wbChromeSegBound) return;
      seg.__wbChromeSegBound = true;
      seg.querySelectorAll('[data-chrome-seg-val]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var key = seg.getAttribute('data-chrome-seg') || '';
          var val = btn.getAttribute('data-chrome-seg-val') || '';
          var chrome = ensureMiniChrome(pad);
          if (key === 'voiceChipWhen') chrome.voiceChipWhen = val === 'armed' ? 'armed' : 'listening';
          else if (key === 'textPreviewWhen') chrome.textPreviewWhen = val === 'hasText' ? 'hasText' : 'listening';
          else return;
          seg.querySelectorAll('[data-chrome-seg-val]').forEach(function (b) {
            var on = b.getAttribute('data-chrome-seg-val') === chrome[key];
            b.classList.toggle('is-active', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
          });
          persistMiniChrome(m);
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        });
      });
    });
    body.querySelectorAll('[data-act="mini-tool-id"]').forEach(function (btn) {
      if (btn.__wbMiniToolBound) return;
      btn.__wbMiniToolBound = true;
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-tool-id') || '';
        if (!id) return;
        var chrome = ensureMiniChrome(pad);
        var allIds = MINI_TOOL_DEFS.map(function (x) { return x.id; });
        var cur = Array.isArray(chrome.toolIds) ? chrome.toolIds.slice() : [];
        if (!cur.length) cur = allIds.slice();
        var i = cur.indexOf(id);
        if (i >= 0) cur.splice(i, 1);
        else cur.push(id);
        cur = allIds.filter(function (x) { return cur.indexOf(x) >= 0; });
        chrome.toolIds = cur.length === allIds.length ? [] : cur;
        var on = !chrome.toolIds.length || chrome.toolIds.indexOf(id) >= 0;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        persistMiniChrome(m);
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
      });
    });
    body.querySelectorAll('button[data-act="showMode"][data-show-mode]').forEach(function (btn) {
      if (btn.__wbShowModeBound) return;
      btn.__wbShowModeBound = true;
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-show-mode') || 'follow';
        applySoftPadShowMode(m, mode);
        syncSoftPadShowModeChrome(body, mode, pad);
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
      });
    });
    body.querySelectorAll('[data-act="preview-meta"]').forEach(function (btn) {
      if (btn.__wbMetaBound) return;
      btn.__wbMetaBound = true;
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-meta-key') || '';
        if (key !== 'account' && key !== 'usage' && key !== 'reset') return;
        if (!pad.previewMeta || typeof pad.previewMeta !== 'object') pad.previewMeta = {};
        var cur = previewMetaOnPad(pad);
        var nextOn = !cur[key];
        pad.previewMeta[key] = nextOn;
        btn.classList.toggle('is-on', nextOn);
        btn.setAttribute('aria-checked', nextOn ? 'true' : 'false');
        try { persist(); } catch (_) {}
        patchAgentDataLive(body, m, pad);
        var Hub = global.OneToneSoftPadHub;
        var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
        if (previewHost) {
          try { patchAgentLeftDataStrip(previewHost, m, pad); } catch (_) {}
        }
        syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts('data'));
        if (Hub && Hub.syncAgentPreviewUsageStrip) {
          try { Hub.syncAgentPreviewUsageStrip(); } catch (_) {}
        }
      });
    });
    body.querySelectorAll('[data-act="data-quota-open"]').forEach(function (btn) {
      if (btn.__wbQuotaBound) return;
      btn.__wbQuotaBound = true;
      btn.addEventListener('click', function () {
        var provider = btn.getAttribute('data-provider') || '';
        if (!quotaCandidate(provider)) return;
        pendingQuotaKeyProvider = provider;
        var card = body.querySelector('[data-agent-data-quota]');
        if (card) {
          var tmp = document.createElement('div');
          tmp.innerHTML = renderAgentDataQuotaBlock();
          var next = tmp.firstChild;
          if (next) {
            card.replaceWith(next);
            bindTopbarLightsPanelEvents(body, m, pad);
            bindAgentWorkbenchPanelEvents(body, m, pad);
          }
        }
      });
    });
    body.querySelectorAll('[data-act="cursor-activity-enable"]').forEach(function (btn) {
      if (btn.__wbActBound) return;
      btn.__wbActBound = true;
      btn.addEventListener('click', function () {
        setCursorActivityPref(true).then(function () {
          try { refreshCursorActivityPrefDom(body); } catch (_) {}
          patchAgentDataLive(body, m, pad);
          try {
            var Hub = global.OneToneSoftPadHub;
            if (Hub && Hub.requestOverlayUsageForScope) {
              Hub.requestOverlayUsageForScope('cursor');
            }
            if (Hub && Hub.syncAgentPreviewUsageStrip) Hub.syncAgentPreviewUsageStrip();
          } catch (_) {}
        });
      });
    });
    body.querySelectorAll('[data-act="cursor-activity-disable"]').forEach(function (btn) {
      if (btn.__wbActBound) return;
      btn.__wbActBound = true;
      btn.addEventListener('click', function () {
        setCursorActivityPref(false).then(function () {
          try { refreshCursorActivityPrefDom(body); } catch (_) {}
          patchAgentDataLive(body, m, pad);
          try {
            var Hub = global.OneToneSoftPadHub;
            if (Hub && Hub.syncAgentPreviewUsageStrip) Hub.syncAgentPreviewUsageStrip();
          } catch (_) {}
        });
      });
    });
    body.querySelectorAll('[data-act="agent-pad-enable"]').forEach(function (btn) {
      if (btn.__wbPadEnBound) return;
      btn.__wbPadEnBound = true;
      btn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var mid = btn.getAttribute('data-scheme-enable') || (m && m.id) || '';
        var Hub = global.OneToneSoftPadHub;
        if (Hub && typeof Hub.toggleRowEnable === 'function' && mid) {
          Hub.toggleRowEnable(mid);
        } else if (pad) {
          pad.enabled = !pad.enabled;
          if (pad.enabled) pad.overlayEnabled = true;
          try { persist(); } catch (_) {}
        }
        var on = !!(pad && pad.enabled);
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-checked', on ? 'true' : 'false');
        var hint = body.querySelector('[data-agent-pad-enable-hint]');
        if (hint) {
          hint.textContent = on
            ? t('softPadHubStatusOn', '已启用')
            : t('softPadHubStatusOff', '未启用');
        }
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
      });
    });
    body.querySelectorAll('[data-act="goto-workbench"]').forEach(function (btn) {
      if (btn.__wbGotoBound) return;
      btn.__wbGotoBound = true;
      btn.addEventListener('click', function () {
        var next = normalizeWorkbenchTab(btn.getAttribute('data-goto-tab'));
        var root = body.querySelector('[data-agent-workbench]');
        var fold = !!(root && root.getAttribute('data-fold-data-into-mini') === '1');
        // Flat Soft Pad tabs: data is folded into mini — scroll, don't remount away.
        if (fold && next === 'data') {
          var dataPanel = body.querySelector('[data-agent-data-panel]');
          if (dataPanel && typeof dataPanel.scrollIntoView === 'function') {
            dataPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            dataPanel.classList.add('is-goto-flash');
            setTimeout(function () {
              try { dataPanel.classList.remove('is-goto-flash'); } catch (_) {}
            }, 900);
          }
          return;
        }
        if (root && root.getAttribute('data-hide-workbench-tabs') === '1') {
          var HubGoto = global.OneToneSoftPadHub;
          if (HubGoto && typeof HubGoto.setSoftPadPadMode === 'function') {
            if (next === 'mini' || next === 'match' || next === 'data') {
              HubGoto.setSoftPadPadMode('agent', { fromUser: true });
              if (next === 'data') {
                setTimeout(function () {
                  var dp = document.querySelector('[data-agent-data-panel]');
                  if (dp && dp.scrollIntoView) dp.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 80);
              }
              return;
            }
          }
        }
        if (next === softPadWorkbenchTab) return;
        applyAgentWorkbenchTab(body, m, pad, next);
      });
    });
  }

  function bindAgentWorkbenchSubtabEvents(body, m, pad) {
    if (!body || !m || !pad) return;
    body.querySelectorAll('[data-agent-workbench-tab][role="tab"]').forEach(function (btn) {
      if (btn.__workbenchTabBound) return;
      btn.__workbenchTabBound = true;
      btn.addEventListener('click', function () {
        var next = normalizeWorkbenchTab(btn.getAttribute('data-agent-workbench-tab'));
        if (next === softPadWorkbenchTab) return;
        applyAgentWorkbenchTab(body, m, pad, next);
      });
    });
  }

  function patchAgentWorkbench(body, m, pad) {
    if (!body || !m || !pad) return;
    applyAgentWorkbenchTab(body, m, pad, normalizeWorkbenchTab(softPadWorkbenchTab));
  }

  function resolvePreviewUsageProps(m) {
    var kind = '';
    try { kind = String(hubSelectedScopeKind() || ''); } catch (_) {}
    if (!kind) {
      try {
        var HubKind = global.OneToneSoftPadHub;
        if (HubKind && HubKind.kindForAppId && m) {
          kind = String(HubKind.kindForAppId(m.appTargetId) || '');
        }
      } catch (_) {}
    }
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && Hub.previewUsagePropsForScope) {
        return Hub.previewUsagePropsForScope(kind) || {};
      }
    } catch (_) {}
    return {};
  }

  function renderAgentLeftDataStrip(m, pad) {
    var meta = previewMetaOnPad(pad);
    var mode = resolveLightsPanelMode(m);
    var name = appDisplayName(m, mode);
    var props = resolvePreviewUsageProps(m);
    var bits = [];
    if (meta.account) {
      var acct = String(props.account || '').trim();
      var plan = String(props.plan || '').trim();
      bits.push(acct && plan ? (acct + ' · ' + plan) : (acct || plan || String(name || '—')));
    }
    if (meta.usage) {
      var usage = String(props.usageSummary || '').trim();
      bits.push(usage || t('softPadDataPreviewUsage', '额度 —'));
    }
    if (meta.reset) {
      var reset = String(props.resetCountdown || '').trim();
      bits.push(reset && reset !== '—'
        ? reset
        : t('softPadDataPreviewReset', '重置 —'));
    }
    if (!bits.length) bits.push(t('softPadDataPreviewOff', '第二行已关'));
    return (
      '<div class="soft-pad-agent-left-data" data-agent-left-data="1">' +
      esc(bits.join(' · ')) + '</div>'
    );
  }

  function patchAgentLeftDataStrip(host, m, pad) {
    if (!host || !m || !pad) return;
    var el = host.querySelector('[data-agent-left-data]');
    if (!el) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = renderAgentLeftDataStrip(m, pad);
    var next = wrap.firstChild;
    if (next) el.replaceWith(next);
  }

  function renderAgentMiniBarPreview(pad, opts) {
    opts = opts || {};
    var chrome = ensureMiniChrome(pad);
    var rail = softPadMiniRail;
    if (rail === 'voice' || rail === 'text') rail = 'speech';
    var chips = buildTopbarPreviewChipsHtml(pad, Object.assign({}, opts, { stripMode: 'focus' }));
    var pillOn = miniUsagePillOnPad(pad);
    var copy = '';
    try {
      var Hub = global.OneToneSoftPadHub;
      var entry = Hub && Hub.resolveSoftPadEntry ? Hub.resolveSoftPadEntry() : null;
      var m = entry && entry.mapping ? entry.mapping : null;
      copy = resolveMiniUsagePillCopy(m, pad);
    } catch (_) {}
    var showPill = pillOn && (!!copy || !miniUsagePillHideEmptyOnPad(pad));
    if (showPill && !copy) copy = '--';
    var pillHtml = showPill
      ? ('<span class="soft-pad-agent-mini-bar__pill" data-mini-usage-pill="1" data-mini-zone="pill">' + esc(copy) + '</span>')
      : '<span class="soft-pad-agent-mini-bar__pill" data-mini-usage-pill="1" data-mini-zone="pill" hidden></span>';
    var winOn = rail === 'display' || chrome.expandBtnEnabled !== false || chrome.closeBtnEnabled !== false;
    var winHtml = winOn
      ? ('<span class="soft-pad-agent-mini-bar__win" data-mini-zone="win">' +
        (chrome.expandBtnEnabled !== false
          ? ('<span class="soft-pad-agent-mini-bar__winbtn" title="' +
            esc(t('softPadMiniExpandShow', '显示「放大到完整键盘」')) + '">⤢</span>')
          : '') +
        (chrome.closeBtnEnabled !== false
          ? ('<span class="soft-pad-agent-mini-bar__winbtn" title="' +
            esc(t('softPadMiniCloseShow', '显示「关掉浮窗」')) + '">×</span>')
          : '') +
        '</span>')
      : '';
    var listenHtml = chrome.voiceChipEnabled !== false
      ? ('<span class="soft-pad-agent-mini-bar__listen" data-mini-listen-halo="1" aria-label="' +
        esc(t('softPadMiniVoiceTitle', '听音提示')) + '">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">' +
        '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"/>' +
        '<path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M5 11a7 7 0 0014 0M12 18v3"/>' +
        '</svg></span>')
      : '<span class="soft-pad-agent-mini-bar__listen" data-mini-listen-halo="1" hidden></span>';
    var toolIds = Array.isArray(chrome.toolIds) ? chrome.toolIds : [];
    var toolsAll = !toolIds.length;
    var toolsOn = chrome.toolsBarEnabled !== false;
    var toolsHtml = toolsOn
      ? ('<div class="soft-pad-agent-mini-bar__tools" data-mini-preview-tools="1" data-mini-zone="tools">' +
        MINI_TOOL_DEFS.filter(function (td) {
          return toolsAll || toolIds.indexOf(td.id) >= 0;
        }).map(function (td) {
          var svg = MINI_TOOL_SVG[td.ico] || '';
          return '<span class="soft-pad-agent-mini-bar__tool" title="' + esc(td.label) + '" aria-label="' +
            esc(td.label) + '">' + (svg || (MINI_TOOL_ICON[td.id] || '·')) + '</span>';
        }).join('') +
        '<button type="button" class="soft-pad-agent-mini-bar__tool soft-pad-agent-mini-bar__tool--settings" title="' +
        esc(t('softPadMiniSettingsBtn', '迷你栏设置')) + '" aria-label="' +
        esc(t('softPadMiniSettingsBtn', '迷你栏设置')) + '">⚙</button></div>')
      : '<div class="soft-pad-agent-mini-bar__tools" data-mini-preview-tools="1" data-mini-zone="tools" hidden></div>';
    var speechForce = rail === 'speech';
    var speechOn = speechForce;
    var speechHtml = speechOn
      ? ('<div class="soft-pad-agent-mini-bar__speech" data-mini-speech="1" data-mini-zone="speech">' +
        listenHtml +
        '<span class="soft-pad-agent-mini-bar__speech-text">' +
        esc(t('softPadMiniSpeechSample', '你说的话…')) +
        '</span></div>')
      : '<div class="soft-pad-agent-mini-bar__speech" data-mini-speech="1" data-mini-zone="speech" hidden></div>';
    var busyHtml = chrome.agentsBarEnabled === false
      ? ''
      : ('<div class="soft-pad-agent-mini-bar__busy" data-mini-zone="agents">' +
        '<div class="soft-pad-agent-bar soft-pad-agent-bar--preview soft-pad-agent-mini-bar__chips">' +
        (chips || '') +
        '</div></div>');
    return (
      '<div class="soft-pad-agent-mini-bar-stage is-demo' +
      (rail === 'tools' ? ' is-mini-rail-tools' : '') +
      (rail === 'speech' ? ' is-mini-rail-speech' : '') +
      (rail === 'agents' ? ' is-mini-rail-agents' : '') +
      (rail === 'display' ? ' is-mini-rail-display' : '') +
      '" data-agent-mini-bar="1" data-mini-rail-focus="' +
      esc(rail) + '" aria-label="' +
      esc(t('softPadMiniBarPreviewAria', '迷你栏预览')) + '">' +
      '<div class="soft-pad-agent-mini-demo-banner">' +
      '<b>' + esc(t('softPadMiniDemoEditing', '正在改')) + '</b> ' +
      esc(miniRailCoach(rail)) +
      '</div>' +
      '<div class="soft-pad-agent-mini-bar' + (chrome.agentsBarEnabled === false ? ' is-agents-off' : '') + '">' +
      '<div class="soft-pad-agent-mini-bar__row">' +
      busyHtml +
      '<div class="soft-pad-agent-mini-bar__data">' + pillHtml + winHtml + '</div>' +
      '</div>' +
      toolsHtml +
      '</div>' +
      speechHtml +
      '</div>'
    );
  }

  function patchAgentMiniBarPreviewPill(host, m, pad) {
    if (!host || !pad) return;
    var el = host.querySelector('[data-mini-usage-pill]');
    if (!el) return;
    var pillOn = miniUsagePillOnPad(pad);
    var copy = resolveMiniUsagePillCopy(m, pad);
    var showPill = pillOn && (!!copy || !miniUsagePillHideEmptyOnPad(pad));
    if (showPill && !copy) copy = '--';
    if (!showPill) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    el.hidden = false;
    el.textContent = copy;
  }

  function renderStatusLightsPreviewLegend() {
    var items = [
      ['idle', t('softPadAgentLightsLegendIdle', '空闲')],
      ['running', t('softPadAgentLightsLegendRunning', '忙')],
      ['wait', t('softPadAgentLightsLegendWait', '等你')],
      ['done', t('softPadAgentLightsLegendDone', '完成')],
      ['fail', t('softPadAgentLightsLegendFail', '失败')]
    ];
    return (
      '<div class="soft-pad-lights-preview-legend" data-lights-preview-legend="1">' +
      items.map(function (row) {
        return (
          '<span class="soft-pad-lights-preview-legend__item">' +
          '<i class="soft-pad-lights-preview-legend__dot is-' + esc(row[0]) + '" aria-hidden="true"></i>' +
          esc(row[1]) + '</span>'
        );
      }).join('') +
      '</div>'
    );
  }

  function clearStatusLightsPreviewChrome(host) {
    var outer = document.getElementById('softPadPreviewHost') || host;
    if (!outer || !outer.querySelectorAll) return;
    outer.querySelectorAll(
      '[data-lights-topbar-preview], [data-lights-preview-legend], [data-agent-left-data], [data-agent-mini-bar]'
    ).forEach(function (el) {
      el.remove();
    });
    outer.classList.remove('is-agent-preview-mini', 'is-agent-preview-data');
    [
      'data-lights-preview-mode',
      'data-lights-subtab',
      'data-lights-preview-accent',
      'data-agent-preview-face',
      'data-agent-preview-presentation',
      'data-light-template'
    ].forEach(function (attr) {
      try { outer.removeAttribute(attr); } catch (_) {}
    });
  }

  function syncStatusLightsPreviewChrome(host, m, pad, opts) {
    opts = opts || {};
    // Always operate on outer Soft Pad preview host — island paint target is an inner child.
    var outer = document.getElementById('softPadPreviewHost') || host;
    if (!outer) return;
    clearStatusLightsPreviewChrome(outer);
    if (!m || !pad) return;
    var face = normalizeWorkbenchTab(opts.previewFace || softPadWorkbenchTab);
    var tab = opts.subtab || workbenchPreviewSubtab(face);
    if (tab !== 'topbar' && tab !== 'ambient' && tab !== 'keys') tab = 'ambient';
    var mode = resolveLightsPanelMode(m);
    /* 细条 = FG abbrev mini bar; 完整键盘 / 显示数据 = full roster + full metrics */
    var showMini = face === 'mini' && pad.presentation === 'mini';
    outer.setAttribute('data-lights-preview-mode', mode);
    outer.setAttribute('data-lights-subtab', tab);
    outer.setAttribute('data-lights-preview-accent', tab);
    outer.setAttribute('data-agent-preview-face', face);
    outer.setAttribute('data-agent-preview-presentation', pad.presentation === 'mini' ? 'mini' : 'full');
    outer.classList.toggle('is-agent-preview-mini', showMini);
    outer.classList.toggle('is-agent-preview-data', face === 'data' || (face === 'mini' && !showMini));
    if (mode === 'custom') {
      outer.setAttribute('data-light-template', String(pad.lightTemplate || 'bezel'));
    } else {
      outer.removeAttribute('data-light-template');
    }
    applyStatusPaletteToPreview(outer, pad);
    var stripOpts = {
      focusAgent: opts.focusAgent || hubSelectedScopeKind(),
      stripMode: showMini ? 'focus'
        : ((face === 'mini' || face === 'data') ? 'full'
          : (opts.stripMode === 'full' ? 'full' : 'focus'))
    };
    if (showMini) {
      outer.insertAdjacentHTML('beforeend', renderAgentMiniBarPreview(pad, stripOpts));
      patchAgentMiniBarPreviewPill(outer, m, pad);
    } else {
      outer.insertAdjacentHTML('afterbegin', renderTopbarPreviewStrip(pad, stripOpts));
      outer.insertAdjacentHTML('beforeend', renderAgentLeftDataStrip(m, pad));
      if (tab === 'keys') {
        outer.insertAdjacentHTML('beforeend', renderStatusLightsPreviewLegend());
      }
    }
    paintKeysPaletteDemo(outer, face === 'match' && tab === 'keys');
    outer.querySelectorAll('[data-act="topbar-jump"]').forEach(function (btn) {
      if (btn.__topbarJumpBound) return;
      btn.__topbarJumpBound = true;
      btn.addEventListener('click', function () {
        jumpToTopbarTarget(btn.getAttribute('data-agent'), btn.getAttribute('data-habit-id'));
      });
    });
    /* Chips insert as idle — refresh attention onto preview host too. */
    try {
      var body = document.querySelector('[data-soft-pad-panel="agent"]');
      if (body) refreshAgentLightsPickerState(body, m, pad);
    } catch (_) {}
  }

  function applySoftPadLightsSubtab(body, m, pad, tab) {
    if (!body || !m || !pad) return;
    var wbLights = body.querySelector('[data-agent-workbench-lights-body]');
    if (wbLights) {
      if (tab !== 'keys' && tab !== 'ambient') tab = 'ambient';
      softPadLightsSubtab = tab;
      wbLights.setAttribute('data-lights-subtab', tab);
      body.querySelectorAll('.soft-pad-lights-subtab[data-lights-subtab]').forEach(function (btn) {
        var on = btn.getAttribute('data-lights-subtab') === tab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      var scopeKind = '';
      try { scopeKind = String(hubSelectedScopeKind() || ''); } catch (_) {}
      var resolved = resolveAgentWorkbenchCaps(m, scopeKind);
      var keysCap = resolved.caps.keys || keysLightsCapability(resolved.mode);
      var keysNa = keysCap === 'unsupported';
      var ambientNa = resolved.caps.ambient === false;
      if (tab === 'ambient') {
        wbLights.innerHTML = ambientNa
          ? ('<p class="codex-pad-mgr__hint">' + esc(t('softPadLightsCapNa', '此应用不支持')) + '</p>')
          : renderLightsAmbientTab(m, pad);
      } else {
        wbLights.innerHTML = keysNa
          ? ('<p class="codex-pad-mgr__hint">' +
            esc(t('softPadLightsKeysUnsupported',
              '此习惯无自动按键灯。可用氛围灯/顶栏，或在右侧改习惯配置。')) + '</p>')
          : renderLightsKeysTab(m, pad);
      }
      if (tab === 'keys' && (keysCap === 'preset' || keysCap === 'customizable')) {
        var advHost = body.querySelector('.soft-pad-lights-advanced__body');
        if (advHost) advHost.setAttribute('data-filled', '0');
        fillStatusLightsAdvanced(body, m, pad);
        bindShellDiagOptional(body, m);
        refreshAgentLightsPickerState(body, m, pad);
        setTimeout(function () {
          try { refreshAgentLightsPickerState(body, m, pad, { hooks: true }); } catch (_) {}
        }, 0);
      }
      bindSoftPadLightPanelEvents(body, m, pad, { panel: 'agent' });
      bindAgentConnectEvents(body, m, pad);
      var HubWb = global.OneToneSoftPadHub;
      var previewHostWb = HubWb && HubWb.previewHostForFace ? HubWb.previewHostForFace('agent') : null;
      syncStatusLightsPreviewChrome(previewHostWb, m, pad, workbenchPreviewOpts());
      echoStatusPaletteOnSoftPads(pad);
      return;
    }
  }

  function bindSoftPadLightsSubtabEvents(body, m, pad) {
    if (!body || !m || !pad) return;
    body.querySelectorAll('.soft-pad-lights-subtab[data-lights-subtab]').forEach(function (btn) {
      if (btn.__lightsSubtabBound) return;
      btn.__lightsSubtabBound = true;
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-lights-subtab') || 'keys';
        if (next === softPadLightsSubtab) return;
        applySoftPadLightsSubtab(body, m, pad, next);
      });
    });
  }

  function bindShellDiagOptional(body, m) {
    if (!body) return;
    var fold = body.querySelector('.soft-pad-lights-advanced--shell');
    var host = body.querySelector('[data-shell-diag-host]');
    if (!fold || !host || fold.__shellDiagBound) return;
    fold.__shellDiagBound = true;
    fold.addEventListener('toggle', function () {
      if (!fold.open || host.getAttribute('data-filled') === '1') return;
      host.setAttribute('data-filled', '1');
      var kind = host.getAttribute('data-shell-diag-host') || '';
      var Shell = global.OneToneShellAgentHookPanel;
      if (Shell && Shell.mountShellAgentHookPanel) {
        Shell.mountShellAgentHookPanel(host, kind, { hideProbeMissing: true });
      }
    });
    void m;
  }

  function fillStatusLightsAdvanced(body, m, pad, opts) {
    opts = opts || {};
    if (!body || !m || !pad) return;
    var host = body.querySelector('.soft-pad-lights-advanced__body');
    if (!host || host.getAttribute('data-filled') === '1') return;
    host.setAttribute('data-filled', '1');
    var lab = softPadLabVisible(pad)
      ? (
        '<details class="codex-pad-mgr__diag soft-pad-more-lab" data-soft-pad-lab="1">' +
        '<summary>' + esc(t('softPadMoreLabSummary', '高级诊断（开发用）')) + '</summary>' +
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadMoreLabLead', '诊断回放与测试注入，日常不必打开。')) +
        '</p>' +
        renderPadDiagDetails() +
        renderClaudeLabDetails() +
        '</details>'
      )
      : '';
    host.innerHTML =
      '<div class="soft-pad-more" data-more-tab="status">' +
      renderPadPurposeCard(m, pad) +
      lab +
      '</div>';
    bindAgentConnectEvents(body, m, pad);
    void opts;
  }

  function patchTopbarLightsPanel(body, m, pad) {
    if (!body || !pad) return;
    var merged = body.querySelector('[data-cross-topbar-merged]');
    if (merged) {
      var wrapMerged = document.createElement('div');
      wrapMerged.innerHTML = renderCrossTopbarMergedPanel(pad, {});
      var nextMerged = wrapMerged.firstElementChild;
      if (nextMerged) merged.replaceWith(nextMerged);
      bindTopbarLightsPanelEvents(body, m, pad);
      refreshAgentLightsPickerState(body, m, pad);
      var HubM = global.OneToneSoftPadHub;
      var previewHostM = HubM && HubM.previewHostForFace ? HubM.previewHostForFace('agent') : null;
      syncStatusLightsPreviewChrome(previewHostM, m, pad, workbenchPreviewOpts('mini'));
      return;
    }
    var card = body.querySelector('[data-topbar-lights-panel]');
    if (!card) return;
    var rosterOnly = card.getAttribute('data-topbar-roster-only') === '1';
    var wrap = document.createElement('div');
    wrap.innerHTML = renderTopbarLightsPanel(pad, rosterOnly
      ? { noConnect: true, compact: true, rosterOnly: true }
      : {});
    var next = wrap.firstElementChild;
    if (next) card.replaceWith(next);
    bindTopbarLightsPanelEvents(body, m, pad);
    refreshAgentLightsPickerState(body, m, pad);
    var Hub = global.OneToneSoftPadHub;
    var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
    syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts(rosterOnly ? 'mini' : undefined));
  }

  function bindTopbarLightsPanelEvents(body, m, pad) {
    if (!body || !m || !pad) return;
    body.querySelectorAll('[data-act="topbar-add-open"]').forEach(function (btn) {
      if (btn.__topbarBound) return;
      btn.__topbarBound = true;
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        openTopbarMonitorPicker(body, m, pad);
      });
    });
    body.querySelectorAll('[data-act="topbar-light-remove"]').forEach(function (btn) {
      if (btn.__topbarBound) return;
      btn.__topbarBound = true;
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var agent = btn.getAttribute('data-agent') || '';
        if (!agent) return;
        setAgentLightEnabled(m, agent, false).then(function () {
          patchTopbarLightsPanel(body, m, pad);
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        });
      });
    });
    body.querySelectorAll('[data-act="topbar-habit-remove"]').forEach(function (btn) {
      if (btn.__topbarBound) return;
      btn.__topbarBound = true;
      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        var hid = btn.getAttribute('data-habit-id') || '';
        pad.topbarHabitIds = topbarHabitIdsOnPad(pad).filter(function (id) { return id !== hid; });
        persistTopbarHabitIds(m, pad);
        patchTopbarLightsPanel(body, m, pad);
      });
    });
    var quotaSave = body.querySelector('[data-act="quota-key-save"]');
    if (quotaSave && !quotaSave.__topbarBound) {
      quotaSave.__topbarBound = true;
      quotaSave.addEventListener('click', function () {
        var spec = quotaCandidate(pendingQuotaKeyProvider);
        var input = body.querySelector('[data-quota-key-input]');
        var statusEl = body.querySelector('[data-quota-key-status]');
        var v = input ? String(input.value || '').trim() : '';
        if (!spec || !v) {
          toast(t('softPadQuotaKeyEmpty', '请先粘贴 API Key'));
          return;
        }
        padQuotaInvoke('cmd_soft_pad_provider_key_set', { provider: spec.provider, key: v }).then(function () {
          pendingQuotaKeyProvider = '';
          toast(t('softPadQuotaSaved', '{name} 已加入用量 pill').replace('{name}', spec.label));
          patchTopbarLightsPanel(body, m, pad);
        }).catch(function (err) {
          var msg = String(err && err.message || err || '');
          if (statusEl) {
            statusEl.hidden = false;
            statusEl.textContent = /invalid_/.test(msg)
              ? t('softPadQuotaInvalid', 'key 无效')
              : msg;
          }
          toast(t('softPadQuotaInvalid', 'key 无效'));
        });
      });
    }
    var quotaCancel = body.querySelector('[data-act="quota-key-cancel"]');
    if (quotaCancel && !quotaCancel.__topbarBound) {
      quotaCancel.__topbarBound = true;
      quotaCancel.addEventListener('click', function () {
        pendingQuotaKeyProvider = '';
        patchTopbarLightsPanel(body, m, pad);
      });
    }
    body.querySelectorAll('[data-act="topbar-jump"]').forEach(function (btn) {
      if (btn.__topbarBound) return;
      btn.__topbarBound = true;
      btn.addEventListener('click', function () {
        jumpToTopbarTarget(btn.getAttribute('data-agent'), btn.getAttribute('data-habit-id'));
      });
    });
    fillTopbarQuotaChips(body, m, pad);
    bindConnectStatusCardEvents(body, m, pad);
    try {
      refreshAgentLightsPickerState(body, m, pad, { hooks: true });
    } catch (_) {}
  }

  function fillTopbarQuotaChips(body, m, pad) {
    var host = body && body.querySelector('[data-topbar-quota-list]');
    var lbl = body && body.querySelector('[data-topbar-quota-lbl]');
    if (!host) return;
    var gets = TOPBAR_QUOTA_CANDIDATES.map(function (c) {
      return padQuotaInvoke('cmd_soft_pad_provider_key_get', { provider: c.provider }).then(function (res) {
        return { spec: c, res: res || {} };
      }).catch(function () {
        return { spec: c, res: {} };
      });
    });
    Promise.all(gets).then(function (rows) {
      var html = rows.filter(function (row) {
        return row.res && row.res.configured;
      }).map(function (row) {
        return renderTopbarQuotaActiveChip(row.spec, row.res.masked || '');
      }).join('');
      host.innerHTML = html;
      if (lbl) lbl.hidden = !html && !pendingQuotaKeyProvider;
      host.querySelectorAll('[data-act="topbar-quota-remove"]').forEach(function (btn) {
        if (btn.__topbarBound) return;
        btn.__topbarBound = true;
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var provider = btn.getAttribute('data-provider') || '';
          if (!provider) return;
          padQuotaInvoke('cmd_soft_pad_provider_key_set', { provider: provider, key: '' }).then(function () {
            pendingQuotaKeyProvider = '';
            patchTopbarLightsPanel(body, m, pad);
          }).catch(function (err) {
            toast(String(err && err.message || err || 'quota_clear_failed'));
          });
        });
      });
    });
  }

  function patchStatusLightsConnectRow(body, agent, connectNeed, connectLabel) {
    if (!body || !agent) return;
    var row = body.querySelector('[data-lights-connect-row="' + agent + '"]');
    if (!row) return;
    var ok = row.querySelector('[data-lights-connected]');
    var cta = row.querySelector('[data-act="agent-light-connect"]');
    var input = body.querySelector('[data-act="agent-light"][data-agent="' + agent + '"]');
    var on = !!(input && input.checked);
    if (ok) ok.hidden = !(on && !connectNeed);
    if (cta) {
      if (on && connectNeed) {
        cta.hidden = false;
        cta.textContent = connectLabel || t('softPadAgentLightConnect', '连接');
      } else {
        cta.hidden = true;
      }
    }
  }

  /** Agent subpage — v12c workbench; fill immediately (user entered intentionally). */
  function renderSoftPadAgentPanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var token = opts.agentLoadToken != null ? opts.agentLoadToken : opts.token;
    softPadWorkbenchTab = normalizeWorkbenchTab(softPadWorkbenchTab);
    if (opts.foldDataIntoMini) softPadWorkbenchTab = 'mini';
    else if (opts.hideWorkbenchTabs && softPadWorkbenchTab !== 'mini') softPadWorkbenchTab = 'match';
    if (softPadWorkbenchTab === 'match' &&
      softPadLightsSubtab !== 'keys' && softPadLightsSubtab !== 'ambient') {
      softPadLightsSubtab = 'ambient';
    }
    container.innerHTML = renderAgentWorkbench(m, pad, opts);
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'agent');
    container.setAttribute('data-agent-workbench', '1');
    container.removeAttribute('data-lights-simple');
    container.classList.remove('is-editing-key');
    if (token != null) container.setAttribute('data-agent-load-token', String(token));
    var mode = resolveLightsPanelMode(m);
    var keysCap = keysLightsCapability(mode);
    if (softPadWorkbenchTab === 'match' && softPadLightsSubtab === 'keys' &&
      (keysCap === 'preset' || keysCap === 'customizable')) {
      fillStatusLightsAdvanced(container, m, pad, {
        agentLoadToken: token,
        requireSoftPad: true
      });
      bindShellDiagOptional(container, m);
    }
    refreshAgentLightsPickerState(container, m, pad);
    setTimeout(function () {
      try {
        refreshAgentLightsPickerState(container, m, pad, { hooks: true });
      } catch (_) {}
    }, 0);
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'agent' }));
    bindAgentConnectEvents(container, m, pad);
    bindTopbarLightsPanelEvents(container, m, pad);
    if (!opts.hideWorkbenchTabs) bindAgentWorkbenchSubtabEvents(container, m, pad);
    bindSoftPadLightsSubtabEvents(container, m, pad);
    bindAgentWorkbenchPanelEvents(container, m, pad);
    if (opts.foldDataIntoMini || softPadWorkbenchTab === 'data' || softPadWorkbenchTab === 'mini') {
      try { refreshCursorActivityPrefDom(container); } catch (_) {}
      try {
        var HubData = global.OneToneSoftPadHub;
        if (HubData && HubData.requestOverlayUsageForScope) {
          HubData.requestOverlayUsageForScope(hubSelectedScopeKind());
        }
      } catch (_) {}
      setTimeout(function () {
        try { patchAgentDataLive(container, m, pad); } catch (_) {}
        try {
          if (softPadWorkbenchTab === 'mini' || opts.foldDataIntoMini) {
            patchAgentMiniPillCopy(container, m, pad);
          }
          var HubStrip = global.OneToneSoftPadHub;
          if (HubStrip && HubStrip.syncAgentPreviewUsageStrip) HubStrip.syncAgentPreviewUsageStrip();
        } catch (_) {}
      }, 160);
    }
    var Hub = global.OneToneSoftPadHub;
    var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
    syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts());
    echoStatusPaletteOnSoftPads(pad);
  }

  function setSoftPadControlsBusy(body, busy) {
    if (!body) return;
    body.querySelectorAll('[data-pad-presentation], [data-pad-profile], [data-pad-skin-opt]').forEach(function (btn) {
      btn.disabled = !!busy;
    });
    body.querySelectorAll(
      '[data-act="enabled"], [data-act="overlay"], [data-act="numlock"], [data-act="navKeys"], [data-act="enhance"], [data-act="showMode"]'
    ).forEach(function (el) {
      if (busy) {
        el.disabled = true;
        return;
      }
      var act = el.getAttribute('data-act');
      var mappingOff = !!body.querySelector('.soft-pad-feature-cards[data-mapping-on="0"]');
      if (mappingOff && (act === 'numlock' || act === 'navKeys')) {
        el.disabled = true;
      } else {
        el.disabled = false;
      }
    });
  }

  /** Patch layout profile chrome in-place — avoid paintSubpage remount on 高级/标准 switch. */
  function patchSoftPadLayoutProfileUi(body, pad) {
    if (!body || !pad) return;
    var cur = String(pad.layoutProfile || 'standard');
    body.querySelectorAll('[data-pad-profile]').forEach(function (b) {
      var on = b.getAttribute('data-pad-profile') === cur;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
    var showEnhance = cur === 'advanced';
    var enhanceWrap = body.querySelector('[data-pad-enhance-wrap]');
    if (enhanceWrap) enhanceWrap.hidden = !showEnhance;
    var enhanceEl = body.querySelector('[data-act="enhance"]');
    if (enhanceEl) {
      enhanceEl.checked = !!pad.softwareEnhanceEnabled && showEnhance;
    }
  }

  function applySoftPadPurposeFeatureTab(body, tab, m) {
    tab = resolveSoftPadPurposeFeatureTab(tab);
    softPadPurposeFeatureTab = tab;
    if (!body) return;
    var cards = body.querySelector('.soft-pad-feature-cards');
    if (!cards) return;
    cards.setAttribute('data-feature-tab', tab);
    cards.querySelectorAll('.soft-pad-feature-subtab').forEach(function (btn) {
      var on = btn.getAttribute('data-feature-tab') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    cards.querySelectorAll('[data-feature]').forEach(function (sec) {
      var on = sec.getAttribute('data-feature') === tab;
      sec.classList.toggle('is-active', on);
      sec.hidden = !on;
    });
    if (m && m.codexMicroPad) {
      paintSoftPadPadModePreview(document.getElementById('softPadPreviewHost'), m, 'purpose');
    }
  }

  function softPadLightPanelRoot(body, opts) {
    if (opts && (opts.panel === 'runtime' || opts.panel === 'purpose')) {
      var face = document.getElementById('softPadFacePad');
      if (face) return face;
    }
    return body;
  }

  function bindSoftPadLightPanelEvents(body, m, pad, opts) {
    opts = opts || {};
    if (!body || !m || !pad) return;
    var root = softPadLightPanelRoot(body, opts);
    var controlBusyUntil = 0;

    function markBusy(ms) {
      controlBusyUntil = Date.now() + (ms || 250);
      setSoftPadControlsBusy(root, true);
      var until = controlBusyUntil;
      setTimeout(function () {
        if (Date.now() >= until - 5) setSoftPadControlsBusy(root, false);
      }, ms || 250);
    }

    function isBusy() {
      return Date.now() < controlBusyUntil;
    }

    function bindPurposeDemoInteractions(scope) {
      if (!scope) return;
      scope.querySelectorAll('[data-demo-enc]').forEach(function (encBtn) {
        if (encBtn.getAttribute('data-demo-enc-bound') === '1') return;
        encBtn.setAttribute('data-demo-enc-bound', '1');
        encBtn.addEventListener('click', function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          var demo = encBtn.closest('[data-demo-mode]');
          if (!demo) return;
          demo.classList.add('is-user-driven');
          var cur = demo.getAttribute('data-demo-mode') === 'soft' ? 'soft' : 'numpad';
          var next = cur === 'soft' ? 'numpad' : 'soft';
          demo.setAttribute('data-demo-mode', next);
          demo.querySelectorAll('.soft-pad-demo-switch__mode[data-mode]').forEach(function (tab) {
            var on = tab.getAttribute('data-mode') === next;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
          });
        });
      });
      scope.querySelectorAll('.soft-pad-demo-switch__mode[data-mode]').forEach(function (modeBtn) {
        if (modeBtn.getAttribute('data-demo-mode-bound') === '1') return;
        modeBtn.setAttribute('data-demo-mode-bound', '1');
        modeBtn.addEventListener('click', function () {
          var demo = modeBtn.closest('[data-demo-mode]');
          if (!demo) return;
          var next = modeBtn.getAttribute('data-mode') === 'soft' ? 'soft' : 'numpad';
          demo.classList.add('is-user-driven');
          demo.setAttribute('data-demo-mode', next);
          demo.querySelectorAll('.soft-pad-demo-switch__mode[data-mode]').forEach(function (tab) {
            var on = tab.getAttribute('data-mode') === next;
            tab.classList.toggle('is-active', on);
            tab.setAttribute('aria-selected', on ? 'true' : 'false');
          });
        });
      });
      scope.querySelectorAll('[data-purpose-live-pad] .micro-hw__key[data-micro-key]').forEach(function (keyEl) {
        if (keyEl.getAttribute('data-demo-press-bound') === '1') return;
        keyEl.setAttribute('data-demo-press-bound', '1');
        keyEl.addEventListener('pointerdown', function () {
          keyEl.classList.add('is-demo-press');
        });
        keyEl.addEventListener('pointerup', function () {
          keyEl.classList.remove('is-demo-press');
        });
        keyEl.addEventListener('pointerleave', function () {
          keyEl.classList.remove('is-demo-press');
        });
      });
    }

    root.querySelectorAll('button[data-feature-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-feature-tab');
        if (!next || next === softPadPurposeFeatureTab) return;
        applySoftPadPurposeFeatureTab(body, next, m);
        bindPurposeDemoInteractions(root);
      });
    });
    if (body.getAttribute('data-soft-pad-layout-delegate') !== '1') {
      body.setAttribute('data-soft-pad-layout-delegate', '1');
      body.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest && ev.target.closest('[data-act="editLayoutKey"]');
        if (!btn || !body.contains(btn)) return;
        if (isBusy()) return;
        ev.preventDefault();
        var id = btn.getAttribute('data-micro-key') || softPadLayoutFocusKeyId || pickDefaultLayoutKey(m);
        softPadPreviewEditKey(m, id);
      });
    }

    root.querySelectorAll('[data-pad-presentation]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-presentation');
        if (!next || (next !== 'full' && next !== 'mini')) return;
        if (pad.presentation === next) return;
        if (isBusy()) return;
        markBusy(250);
        pad.presentation = next;
        root.querySelectorAll('[data-pad-presentation]').forEach(function (b) {
          var on = b.getAttribute('data-pad-presentation') === next;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        var hints = root.querySelectorAll('.codex-pad-mgr__hint');
        if (hints[0]) {
          hints[0].textContent = next === 'mini'
            ? t('softPadPresMiniStatus', '小态栏：状态优先，操作能力有限（不是确认键条）')
            : t('softPadPresFullStatus', '完整体：显示全部键位');
        }
        persistPresentation(m);
        softPadPanelChanged(m, opts);
      });
    });
    root.querySelectorAll('[data-pad-purpose]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-purpose');
        if (!next) return;
        if (isBusy()) return;
        markBusy(280);
        applyPadPurposeFromUi(body, m, pad, next);
        toast(t('softPadPurposeApplied', '已切换：{p}').replace('{p}',
          next === 'sessions'
            ? t('softPadPurposeSessions', '会话槽')
            : t('softPadPurposeShortcuts', '动作键')));
        softPadPanelChanged(m, Object.assign({}, opts, { refreshPreview: true }));
      });
    });
    root.querySelectorAll('[data-pad-skin-opt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = canonicalizePadSkin(btn.getAttribute('data-pad-skin-opt'));
        if (next === canonicalizePadSkin(pad.skin)) return;
        if (isBusy()) return;
        markBusy(220);
        pad.skin = next;
        patchSkinSegActive(root, next);
        patchSoftPadPreviewSkin(m);
        syncSoftPadShowModeChrome(root, resolveSoftPadShowMode(pad), pad);
        persistPadSkin(m);
        softPadPanelChanged(m, Object.assign({}, opts, { panel: 'presentation' }));
      });
    });
    root.querySelectorAll('[data-pad-profile]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-profile');
        if (!next) return;
        if (String(pad.layoutProfile || '') === next) return;
        if (isBusy()) return;
        markBusy(320);
        applyLayoutProfile(m, next, { persist: true });
        if (next !== 'advanced') pad.softwareEnhanceEnabled = false;
        patchSoftPadLayoutProfileUi(body, pad);
        toast(t('codexMicroPadProfileApplied', '已切换布局：{p}').replace('{p}',
          next === 'beginner' ? t('codexMicroPadProfileBeginner', '入门')
            : next === 'advanced' ? t('codexMicroPadProfileAdvanced', '高级')
              : t('codexMicroPadProfileStandard', '标准')));
        // Preview only — do not remount this layout panel (高级 switch 假死).
        softPadPanelChanged(m, Object.assign({}, opts, {
          panel: 'layout',
          remountLayout: false
        }));
      });
    });

    var enabledEl = root.querySelector('[data-act="enabled"]');
    if (enabledEl) {
      enabledEl.addEventListener('change', function () {
        if (isBusy()) {
          enabledEl.checked = !!pad.enabled;
          return;
        }
        var next = !!enabledEl.checked;
        if (next === !!pad.enabled) return;
        markBusy(250);
        pad.enabled = next;
        previewPadMode = pad.enabled ? 'codex' : 'numpad';
        if (pad.enabled) pad.overlayEnabled = true;
        var overlayElSync = root.querySelector('[data-act="overlay"]');
        if (overlayElSync && pad.enabled) overlayElSync.checked = true;
        persistPadFlags(m);
        softPadPanelChanged(m, Object.assign({}, opts, {
          refreshPreview: true
        }));
      });
    }
    var overlayEl = root.querySelector('[data-act="overlay"]');
    if (overlayEl) {
      overlayEl.addEventListener('change', function () {
        if (isBusy()) {
          overlayEl.checked = !!pad.overlayEnabled;
          return;
        }
        var next = !!overlayEl.checked;
        if (next === !!pad.overlayEnabled) return;
        markBusy(250);
        pad.overlayEnabled = next;
        persistPadFlags(m);
        softPadPanelChanged(m, opts);
      });
    }
    var showModeEl = root.querySelector('select[data-act="showMode"]');
    if (showModeEl) {
      showModeEl.addEventListener('change', function () {
        if (isBusy()) {
          showModeEl.value = resolveSoftPadShowMode(pad);
          return;
        }
        var next = String(showModeEl.value || 'follow');
        if (next === resolveSoftPadShowMode(pad)) return;
        markBusy(280);
        applySoftPadShowMode(m, next);
        syncSoftPadShowModeChrome(root, next, pad);
        softPadPanelChanged(m, opts);
      });
    }
    root.querySelectorAll('button[data-act="showMode"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var next = btn.getAttribute('data-show-mode');
        if (next) {
          if (next === resolveSoftPadShowMode(pad)) return;
          markBusy(280);
          applySoftPadShowMode(m, next);
          syncSoftPadShowModeChrome(root, next, pad);
          softPadPanelChanged(m, opts);
          return;
        }
        // Legacy chrome CTA (no data-show-mode): focus / enable follow.
        var cur = resolveSoftPadShowMode(pad);
        if (cur === 'hidden') {
          markBusy(280);
          applySoftPadShowMode(m, 'follow');
          syncSoftPadShowModeChrome(root, 'follow', pad);
          softPadPanelChanged(m, opts);
          return;
        }
        var focusTab = root.querySelector('button[data-act="showMode"][data-show-mode]');
        if (focusTab && typeof focusTab.focus === 'function') {
          try { focusTab.focus(); } catch (_) {}
        }
      });
    });
    root.querySelectorAll('[data-act="focusLayoutKey"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var id = pickDefaultLayoutKey(m);
        softPadPreviewEditKey(m, id);
      });
    });
    root.querySelectorAll('[data-act="focusSkin"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var skin = root.querySelector('[data-pad-skin-opt]');
        if (skin && typeof skin.focus === 'function') {
          try { skin.focus(); } catch (_) {}
        }
        if (skin && typeof skin.scrollIntoView === 'function') {
          try { skin.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        }
      });
    });
    root.querySelectorAll('[data-act="focusAgent"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var agentBody = root.querySelector('[data-lazy-agent-body]');
        if (agentBody && typeof agentBody.scrollIntoView === 'function') {
          try { agentBody.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        }
        if (agentBody && typeof agentBody.focus === 'function') {
          try {
            if (!agentBody.hasAttribute('tabindex')) agentBody.setAttribute('tabindex', '-1');
            agentBody.focus();
          } catch (_) {}
        }
      });
    });
    var numLockEl = root.querySelector('[data-act="numlock"]');
    if (numLockEl) {
      numLockEl.addEventListener('change', function () {
        if (isBusy()) {
          numLockEl.checked = !!pad.requireNumLockOff;
          return;
        }
        var next = !!numLockEl.checked;
        if (next === !!pad.requireNumLockOff) return;
        markBusy(250);
        pad.requireNumLockOff = next;
        var numpadMap = root.querySelector('[data-numpad-on]');
        if (numpadMap) numpadMap.setAttribute('data-numpad-on', next ? '1' : '0');
        var demo = root.querySelector('[data-demo-mode]');
        if (demo) {
          demo.classList.remove('is-user-driven');
          demo.setAttribute('data-demo-mode', next ? 'soft' : 'numpad');
        }
        var hint = root.querySelector('[data-numpad-hint]');
        if (hint) {
          if (softLikelyNoNumpad() === true && next) {
            hint.hidden = false;
            hint.textContent = t('softPadNumpadNoPadHint',
              '未检测到独立数字键区。你可以关闭占用，只用悬浮 Soft Pad。');
          } else {
            hint.hidden = true;
            hint.textContent = '';
          }
        }
        persistPadFlags(m);
        softPadPanelChanged(m, opts);
      });
    }
    var navKeysEl = root.querySelector('[data-act="navKeys"]');
    if (navKeysEl) {
      navKeysEl.addEventListener('change', function () {
        if (isBusy()) {
          navKeysEl.checked = navKeysOn(pad);
          return;
        }
        var next = !!navKeysEl.checked;
        if (next === navKeysOn(pad)) return;
        markBusy(280);
        setNavColumnShown(pad, next);
        var navCap = root.querySelector('[data-nav-cap]');
        if (navCap) {
          navCap.textContent = next
            ? t('softPadFeatureNavCapOn',
              '屏幕方向钮可注入 ↑↓←→；主键盘倒 T 保持系统原样（不劫持）。')
            : t('softPadFeatureNavCapOff',
              'Soft Pad 不显示左侧方向列；主键盘方向键始终系统原样。');
        }
        var arrowStory = root.querySelector('[data-nav-on]');
        if (arrowStory) arrowStory.setAttribute('data-nav-on', next ? '1' : '0');
        var navHost = root.querySelector('[data-nav-demo-host]');
        if (navHost) navHost.innerHTML = renderNavArrowDemoHtml(pad, m);
        persistPadFlags(m);
        softPadPanelChanged(m, Object.assign({}, opts, {
          refreshPreview: true
        }));
      });
    }

    var armSaveBtn = root.querySelector('[data-act="cursorArmPhraseSave"]');
    var armInput = root.querySelector('[data-act="cursorArmPhrase"]');
    if (armSaveBtn && armInput) {
      function saveArmPhrase() {
        if (isBusy()) return;
        var next = String(armInput.value || '').replace(/\s+/g, '').slice(0, 12);
        if (!next) next = '一声';
        armInput.value = next;
        markBusy(280);
        try {
          var App = global.OneToneApp;
          if (App && typeof App.saveConfigPatch === 'function') {
            App.saveConfigPatch(function (_m, cfg) {
              if (cfg) cfg.cursorBeginnerArmPhrase = next;
            });
          } else {
            var st = global.OneToneState && global.OneToneState.state;
            if (st && st.config) st.config.cursorBeginnerArmPhrase = next;
            if (global.OneToneConfigPersist && typeof global.OneToneConfigPersist.save === 'function') {
              global.OneToneConfigPersist.save();
            }
          }
          toast(t('softPadCursorArmPhraseSaved', '已保存聆听口令：{p}').replace('{p}', next));
        } catch (err) {
          toast(t('softPadCursorArmPhraseSaveFail', '保存失败'));
        }
      }
      armSaveBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        saveArmPhrase();
      });
      armInput.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          saveArmPhrase();
        }
      });
    }

    bindPurposeDemoInteractions(root);

    var enhanceEl = root.querySelector('[data-act="enhance"]');
    if (enhanceEl) {
      enhanceEl.addEventListener('change', function () {
        if (isBusy()) {
          enhanceEl.checked = !!pad.softwareEnhanceEnabled;
          return;
        }
        markBusy(250);
        pad.softwareEnhanceEnabled = !!enhanceEl.checked;
        persistLayout(m);
        softPadPanelChanged(m, Object.assign({}, opts, {
          panel: 'layout',
          remountLayout: false
        }));
      });
    }

    var restoreBtn = root.querySelector('[data-act="restore"]');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', function () {
        var confirmApi = global.OneToneConfirm;
        var run = function () {
          if (opts.panel === 'layout' && softPadPanelActive()) {
            restoreDefaultCustomLayout(m);
          } else {
            var profile = pad.layoutProfile === 'beginner' || pad.layoutProfile === 'advanced'
              ? pad.layoutProfile
              : 'standard';
            applyLayoutProfile(m, profile, { persist: true, resetKeys: true });
          }
          softPadPanelChanged(m, opts);
          toast(t('codexMicroPadRestored', '已恢复默认：实体 12 键 + 屏幕总开关'));
        };
        if (confirmApi && confirmApi.ask) {
          confirmApi.ask('codexMicroPadRestoreConfirm', {
            fallback: '确定恢复默认布局？当前自定义布局与按键映射将被覆盖。'
          }).then(function (ok) { if (ok) run(); });
          return;
        }
        if (!window.confirm(t('codexMicroPadRestoreConfirm', '确定恢复默认布局？当前自定义布局与按键映射将被覆盖。'))) return;
        run();
      });
    }
    var exportBtn = root.querySelector('[data-act="export"]');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        try {
          var blob = new Blob([JSON.stringify(exportLayoutJson(m), null, 2)], { type: 'application/json' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'soft-pad-layout.json';
          a.click();
          URL.revokeObjectURL(a.href);
          toast(t('codexMicroPadExported', '布局已导出'));
        } catch (_) {
          toast(t('codexMicroPadExportFail', '导出失败'));
        }
      });
    }
    var fileEl = root.querySelector('[data-act="importFile"]');
    var importBtn = root.querySelector('[data-act="import"]');
    if (importBtn && fileEl) {
      importBtn.addEventListener('click', function () { fileEl.click(); });
      fileEl.addEventListener('change', function () {
        var file = fileEl.files && fileEl.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(String(reader.result || ''));
            if (importLayoutJson(m, data)) {
              invalidatePadHeal(m);
              toast(t('codexMicroPadImported', '布局已导入'));
              softPadPanelChanged(m, opts);
            }
          } catch (_) {
            toast(t('codexMicroPadImportInvalid', '无法导入：不是有效的布局文件'));
          }
          fileEl.value = '';
        };
        reader.readAsText(file);
      });
    }
    var copyBtn = body.querySelector('[data-act="copyCustom"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyAsCustomLayout(m);
        invalidatePadHeal(m);
        softPadPanelChanged(m, opts);
      });
    }
    var clearBtn = body.querySelector('[data-act="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (!window.confirm(t('codexMicroPadClearConfirm', '确定清空所有小键盘映射？'))) return;
        if (opts.panel === 'layout' && softPadPanelActive()) {
          clearCapabilityMappings(m);
          toast(t('softPadLayoutCleared', '已清空按键能力绑定（滚轮/摇杆增强仍可用）'));
        } else {
        pad.keys = [];
        protectPrimaryLayout(pad);
        invalidatePadHeal(m);
          persistLayout(m);
        toast(t('codexMicroPadCleared', '已清空小键盘映射'));
        }
        softPadPanelChanged(m, opts);
      });
    }
  }

  /**
   * Embeddable Soft Pad manager body.
   * @param {{ container: HTMLElement, mode?: 'panel'|'modal', mappingId?: string, mapping?: object, skipHookRefresh?: boolean, refreshHook?: boolean, omitPad?: boolean, foldSettings?: boolean }} opts
   */
  function renderCodexMicroPadManager(opts) {
    opts = opts || {};
    var mode = opts.mode === 'panel' ? 'panel' : 'modal';
    var omitPad = !!opts.omitPad;
    var foldSettings = !!opts.foldSettings;
    var m = opts.mapping || null;
    if (!m && opts.mappingId) m = findMappingById(opts.mappingId);
    m = m || padManagerMapping;
    if (!m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var showEnhance = pad.layoutProfile === 'advanced';
    var body = opts.container || activePadManagerBody();
    if (!body) {
      if (mode === 'modal') {
        ensurePadManagerModal();
        body = document.getElementById('codexPadMgrBody');
      }
    }
    if (!body) return;

    padManagerMode = mode;
    padManagerContainer = body;
    padManagerMapping = m;

    if (mode === 'panel') {
      var modalEl = document.getElementById('codexMicroPadManager');
      if (modalEl) {
        modalEl.hidden = true;
        var modalBody = modalEl.querySelector('#codexPadMgrBody');
        if (modalBody && modalBody !== body) modalBody.replaceChildren();
      }
    }

    var padBindMode = padUiMode === 'run' ? 'run' : (padUiMode === 'try' ? 'try' : 'config');
    var coreSettingsHtml =
      '<div class="codex-pad-mgr__section">' +
      '<p class="codex-pad-mgr__label">' + esc(t('codexMicroPadProfileLbl', '布局')) + '</p>' +
      renderProfileSeg(pad) +
      '</div>' +
      '<div class="codex-pad-mgr__section">' +
      '<p class="codex-pad-mgr__label">' + esc(t('codexMicroPadPresentationLbl', '显示形态')) + '</p>' +
      renderPresentationSeg(pad) +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('codexMicroPadPresentationHint', '精简态为灯条形态（展开/关闭），不是确认键条。')) +
      '</p>' +
      '</div>' +
      '<div class="codex-pad-mgr__section">' +
      '<p class="codex-pad-mgr__label">' + esc(t('codexMicroPadModeLbl', '操作')) + '</p>' +
      renderModeSeg() +
      '<p class="codex-pad-mgr__hint" id="codexPadMgrHint">' + esc(modeHintText()) + '</p>' +
      '</div>' +
      '<div class="codex-pad-mgr__settings">' +
      '<label class="codex-pad-mgr__setting"><input type="checkbox" data-act="enabled"' +
      (pad.enabled ? ' checked' : '') + '>' +
      esc(t('codexMicroPadEnableCodex', '虚拟键盘映射（关=数字键模式）')) + '</label>' +
      '<label class="codex-pad-mgr__setting"><input type="checkbox" data-act="overlay"' +
      (pad.overlayEnabled ? ' checked' : '') + '>' +
      esc(t('codexMicroPadOverlayEnable', '前台置顶小键盘')) + '</label>' +
      '<label class="codex-pad-mgr__setting"><input type="checkbox" data-act="numlock"' +
      (pad.requireNumLockOff ? ' checked' : '') + '>' +
      esc(t('codexMicroPadNumLockOff', 'NumLock 关闭时接管小键盘')) + '</label>' +
      '<div data-pad-enhance-wrap="1"' + (showEnhance ? '' : ' hidden') + '>' +
      '<label class="codex-pad-mgr__setting"><input type="checkbox" data-act="enhance"' +
          (pad.softwareEnhanceEnabled ? ' checked' : '') + '>' +
      esc(t('codexMicroPadEnhanceEnable', '软件增强：总开关滚轮 / 摇杆方向')) + '</label>' +
      '</div>' +
      '</div>';

    var settingsBlock = foldSettings
      ? ('<details class="codex-pad-mgr__fold" id="codexPadSettingsFold" open>' +
        '<summary>' + esc(t('codexMicroPadSettingsFold', '布局与形态')) + '</summary>' +
        coreSettingsHtml +
        '</details>')
      : coreSettingsHtml;

    var padBlock = omitPad
      ? ''
      : ('<div class="codex-pad-mgr__pad" id="codexPadMgrPad">' +
        renderHardwarePad(m, pad, { mode: padBindMode }) +
        '</div>');

    // Panel Soft Pad: never mount Hook/Claude trees until Agent fold opens.
    var lazyAgent = opts.lazyAgent != null ? !!opts.lazyAgent : !!(omitPad || foldSettings);

    body.innerHTML =
      settingsBlock +
      renderAgentConnectFold(m, pad, { lazyAgent: lazyAgent }) +
      renderBindingValidateCard() +
      (padUiMode === 'run'
        ? ('<div class="codex-micro-pad__run-status" data-status="' + esc(padRunStatus) + '"' +
          (window.__codexMicroStatusSource
            ? (' data-status-source="' + esc(String(window.__codexMicroStatusSource)) + '"')
            : '') +
          '>' +
          esc(padRunStatusLabel(padRunStatus)) +
          (window.__codexMicroStatusSource
            ? (' · <span class="codex-micro-pad__status-source">' + esc(statusSourceLabel(window.__codexMicroStatusSource)) + '</span>')
            : '') +
          '</div>')
        : '') +
      padBlock +
      '<div class="codex-pad-mgr__foot">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="restore">' +
      esc(t('codexMicroPadRestore', '恢复默认')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="export">' +
      esc(t('codexMicroPadExport', '导出')) + '</button>' +
      '<div class="codex-pad-mgr__more-wrap">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="more-toggle">' +
      esc(t('codexMicroPadMore', '更多')) + '</button>' +
      '<div class="codex-pad-mgr__more" id="codexPadMgrMore" hidden>' +
      '<button type="button" data-act="copyCustom">' + esc(t('codexMicroPadCopyCustom', '复制为自定义布局')) + '</button>' +
      '<button type="button" data-act="import">' + esc(t('codexMicroPadImport', '导入')) + '</button>' +
      '<button type="button" class="is-danger" data-act="clear">' + esc(t('codexMicroPadClear', '清空所有映射')) + '</button>' +
      '</div></div>' +
      '<input type="file" accept="application/json,.json" data-act="importFile" hidden />' +
      '</div>';

    if (body.setAttribute) body.setAttribute('data-soft-pad-mapping', String(m.id || ''));

    // Keep the rest of event wiring by falling through — call shared binder.
    bindPadManagerEvents(body, m, pad, Object.assign({}, opts, { lazyAgent: lazyAgent }));
    if (!omitPad) {
      bindPadClicks(body.querySelector('#codexPadMgrPad'), m, padBindMode);
    }
    if (padUiMode === 'try') startTryKeyListener(m);
    else stopTryKeyListener();
    if (mode === 'modal') {
      var modalShow = document.getElementById('codexMicroPadManager');
      if (modalShow) modalShow.hidden = false;
    }
  }

  function bindAgentConnectEvents(body, m, pad) {
    if (!body || !m || !pad) return;
    bindSoftPadMoreTabs(body);
    body.querySelectorAll('[data-pad-purpose]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-purpose');
        if (!next) return;
        applyPadPurposeFromUi(body, m, pad, next);
        toast(t('softPadPurposeApplied', '已切换：{p}').replace('{p}',
          next === 'sessions'
            ? t('softPadPurposeSessions', '会话槽')
            : t('softPadPurposeShortcuts', '动作键')));
      });
    });
    function agentCtx() {
      var tokenAttr = body.getAttribute('data-agent-load-token');
      if (tokenAttr == null) return {};
      return {
        agentLoadToken: Number(tokenAttr),
        mappingId: m.id,
        container: body,
        requireSoftPad: true
      };
    }
    var lightsEl = body.querySelector('[data-act="status-lights"]');
    if (lightsEl && !lightsEl.__softPadBound) {
      lightsEl.__softPadBound = true;
      lightsEl.addEventListener('change', function () {
        setStatusLightsEnabled(m, !!lightsEl.checked);
      });
    }
    body.querySelectorAll('[data-act="agent-light"]').forEach(function (el) {
      if (el.__softPadBound) return;
      el.__softPadBound = true;
      el.addEventListener('change', function () {
        var agent = el.getAttribute('data-agent') || 'codex';
        setAgentLightEnabled(m, agent, !!el.checked).then(function () {
          patchTopbarLightsPanel(body, m, pad);
        });
      });
    });
    bindTopbarLightsPanelEvents(body, m, pad);
    bindSoftPadLightsSubtabEvents(body, m, pad);
    body.querySelectorAll('[data-light-template]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-light-template') || 'bezel';
        var tplScope = btn.getAttribute('data-light-template-scope') || '';
        if (tplScope === 'ambient') next = 'bezel';
        else if (tplScope === 'keys' && next !== 'single' && next !== 'multi') next = 'single';
        else if (next !== 'bezel' && next !== 'single' && next !== 'multi') next = 'bezel';
        pad.lightTemplate = next;
        var scopeSel = tplScope
          ? '[data-light-template-scope="' + tplScope + '"]'
          : '[data-light-template]';
        body.querySelectorAll(scopeSel).forEach(function (b) {
          var on = b.getAttribute('data-light-template') === next;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        var Hub = global.OneToneSoftPadHub;
        var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
        syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts());
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
      });
    });
    body.querySelectorAll('[data-act="lights-ambient-enabled"]').forEach(function (el) {
      if (el.__softPadBound) return;
      el.__softPadBound = true;
      el.addEventListener('change', function () {
        var next = !!el.checked;
        pad.ambientEnabled = next;
        if (next) pad.lightTemplate = 'bezel';
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        var Hub = global.OneToneSoftPadHub;
        var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
        syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts());
        var p = global.OneToneConfigPersist;
        if (p && p.saveAsync) p.saveAsync();
        else if (p && p.save) p.save();
      });
    });
    body.querySelectorAll('[data-act="ambient-mode"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-ambient-mode') === 'solid' ? 'solid' : 'status';
        pad.ambientMode = next;
        pad.lightTemplate = 'bezel';
        body.querySelectorAll('[data-act="ambient-mode"]').forEach(function (b) {
          var on = b.getAttribute('data-ambient-mode') === next;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        var colorWrap = body.querySelector('.soft-pad-ambient-color');
        if (colorWrap) colorWrap.classList.toggle('is-dim', next !== 'solid');
        var root = body.querySelector('[data-lights-tab="ambient"]');
        if (root) root.setAttribute('data-ambient-mode', next);
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        var p = global.OneToneConfigPersist;
        if (p && p.saveAsync) p.saveAsync();
        else if (p && p.save) p.save();
      });
    });
    body.querySelectorAll('[data-act="ambient-solid-rgb"]').forEach(function (el) {
      if (el.__softPadBound) return;
      el.__softPadBound = true;
      el.addEventListener('input', function () {
        var v = String(el.value || '#7c3aed');
        pad.ambientSolidRgb = v;
        pad.ambientMode = 'solid';
        pad.lightTemplate = 'bezel';
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        var p = global.OneToneConfigPersist;
        if (p && p.saveAsync) p.saveAsync();
        else if (p && p.save) p.save();
      });
    });
    body.querySelectorAll('[data-act="ambient-opacity"]').forEach(function (el) {
      if (el.__softPadBound) return;
      el.__softPadBound = true;
      el.addEventListener('input', function () {
        var v = clampAmbientOpacity(el.value);
        pad.ambientOpacity = v;
        var lab = body.querySelector('[data-ambient-opacity-val]');
        if (lab) lab.textContent = v + '%';
        softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        var p = global.OneToneConfigPersist;
        if (p && p.saveAsync) p.saveAsync();
        else if (p && p.save) p.save();
      });
    });
    bindKeyLightPaletteEvents(body, m, pad);
    body.querySelectorAll('[data-act="lights-custom-enabled"]').forEach(function (el) {
      if (el.__softPadBound) return;
      el.__softPadBound = true;
      el.addEventListener('change', function () {
        var next = !!el.checked;
        pad.enabled = next;
        if (next) pad.overlayEnabled = true;
        var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
        if (!invoke) {
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
          return;
        }
        invoke('cmd_codex_micro_pad_set_flags', {
          mappingId: String(m.id),
          enabled: next,
          requireNumLockOff: !!pad.requireNumLockOff,
          overlayEnabled: !!pad.overlayEnabled,
          requireForeground: pad.requireForeground !== false,
          navKeysEnabled: pad.showNavigationPad !== false && pad.navKeysEnabled !== false
        }).catch(function () {
          pad.enabled = !next;
          el.checked = !next;
        }).finally(function () {
          var Hub = global.OneToneSoftPadHub;
          var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
          syncStatusLightsPreviewChrome(previewHost, m, pad, workbenchPreviewOpts());
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        });
      });
    });
    body.querySelectorAll('[data-act="agent-light-connect"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        var agent = btn.getAttribute('data-agent') || '';
        var Conn = global.OneToneSoftPadConnect;
        if (agent === 'claude') {
          if (!window.confirm(t(
            'softPadClaudeConnectConfirm',
            '将把 OneTone hooks 写入 Claude Code 的 settings.json（会先备份）。继续？'
          ))) return;
          btn.disabled = true;
          btn.textContent = t('softPadConnecting', '连接中…');
          confirmClaudeHookInstall().then(function () {
            refreshAgentLightsPickerState(body, m, pad, { hooks: true });
          }).finally(function () {
            btn.disabled = false;
          });
          return;
        }
        if (agent === 'codex') {
          if (!window.confirm(t(
            'softPadConnectInstallConfirm',
            '将把 OneTone hooks 写入该 Agent 配置（会先备份）。继续？'
          ))) return;
          btn.disabled = true;
          btn.textContent = t('softPadConnecting', '连接中…');
          var installCodex = Conn && Conn.installKind
            ? Conn.installKind('codex')
            : padInvoke('cmd_codex_hook_install_confirm', {});
          Promise.resolve(installCodex).then(function () {
            toast(t('softPadConnectInstalled', '已接入 — 回 Agent 发一条消息以点亮状态'));
            return Conn && Conn.fetchStatus
              ? Conn.fetchStatus('codex').then(function (st) {
                if (st) agentLightsHookCache.codex = st;
              })
              : null;
          }).then(function () {
            refreshAgentLightsPickerState(body, m, pad, { hooks: true });
          }).catch(function (err) {
            toast(String(err && err.message || err || 'install_failed'));
          }).finally(function () {
            btn.disabled = false;
          });
          return;
        }
        if (agent === 'cursor') {
          btn.disabled = true;
          var cached = agentLightsHookCache.cursor;
          var runCopy = function (st) {
            btn.disabled = false;
            var text = (st && (st.mergePreview || st.merge_preview || st.previewCopy || '')) || '';
            if (!text) {
              toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
              return;
            }
            try {
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () {
                  toast(t('cursorHookCopied', '已复制 Cursor Hook 合并预览（不会自动写入）'));
                }).catch(function () {
                  toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
                });
              } else {
                toast(t('cursorHookCopied', '已复制 Cursor Hook 合并预览（不会自动写入）'));
              }
            } catch (_) {
              toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
            }
          };
          if (cached && (cached.mergePreview || cached.merge_preview)) {
            runCopy(cached);
            return;
          }
          padInvoke('cmd_cursor_hook_setup_status', {}).then(function (st) {
            if (st) agentLightsHookCache.cursor = st;
            runCopy(st);
          }).catch(function () {
            btn.disabled = false;
            toast(t('cursorHookCopyFail', '无法生成 Cursor Hook 预览'));
          });
          return;
        }
        if (SHELL_HOOK_LIGHT_AGENTS[agent]) {
          var Shell = global.OneToneShellAgentHookPanel;
          btn.disabled = true;
          btn.textContent = t('softPadConnecting', '连接中…');
          var install = Shell && Shell.installShellAgentHook
            ? Shell.installShellAgentHook(agent)
            : padInvoke('cmd_shell_agent_hook_install_confirm', { kind: agent });
          Promise.resolve(install).then(function () {
            return padInvoke('cmd_shell_agent_hook_setup_status', { kind: agent }).then(function (st) {
              if (st) agentLightsHookCache[agent] = st;
            });
          }).then(function () {
            refreshAgentLightsPickerState(body, m, pad, { hooks: true });
          }).finally(function () {
            btn.disabled = false;
          });
        }
      });
    });
    bindConnectStatusCardEvents(body, m, pad);
    var hookCopyBtn = body.querySelector('[data-act="hook-copy"]');
    if (hookCopyBtn && !hookCopyBtn.__softPadBound) {
      hookCopyBtn.__softPadBound = true;
      hookCopyBtn.addEventListener('click', function () { copyHookDraft(m); });
    }
    var hookInstallBtn = body.querySelector('[data-act="hook-install"]');
    if (hookInstallBtn && !hookInstallBtn.__softPadBound) {
      hookInstallBtn.__softPadBound = true;
      hookInstallBtn.addEventListener('click', function () { installCodexHooks(m); });
    }
    var clearErrorsBtn = body.querySelector('[data-act="clear-errors"]');
    if (clearErrorsBtn && !clearErrorsBtn.__softPadBound) {
      clearErrorsBtn.__softPadBound = true;
      clearErrorsBtn.addEventListener('click', function () { clearPadErrors({}); });
    }
    var hookDocsBtn = body.querySelector('[data-act="hook-docs"]');
    if (hookDocsBtn && !hookDocsBtn.__softPadBound) {
      hookDocsBtn.__softPadBound = true;
      hookDocsBtn.addEventListener('click', function () { openHookDocs(); });
    }
    var hookRefreshBtn = body.querySelector('[data-act="hook-refresh"]');
    if (hookRefreshBtn && !hookRefreshBtn.__softPadBound) {
      hookRefreshBtn.__softPadBound = true;
      hookRefreshBtn.addEventListener('click', function () {
        refreshHookSetupStatus(m, agentCtx()).then(function () { refreshPadDiagnose(); });
      });
    }
    var diagRefreshBtn = body.querySelector('[data-act="pad-diag-refresh"]');
    if (diagRefreshBtn && !diagRefreshBtn.__softPadBound) {
      diagRefreshBtn.__softPadBound = true;
      diagRefreshBtn.addEventListener('click', function () { refreshPadDiagnose(); });
    }
    body.querySelectorAll('[data-act="pad-diag-filter"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        setPadDiagFilter(btn.getAttribute('data-filter') || 'all');
      });
    });
    var diagDetails = body.querySelector('#codexPadDiag');
    if (diagDetails && !diagDetails.__softPadBound) {
      diagDetails.__softPadBound = true;
      diagDetails.addEventListener('toggle', function () {
        if (diagDetails.open) refreshPadDiagnose();
      });
    }
    var claudeRefreshBtn = body.querySelector('[data-act="claude-act-refresh"]');
    if (claudeRefreshBtn && !claudeRefreshBtn.__softPadBound) {
      claudeRefreshBtn.__softPadBound = true;
      claudeRefreshBtn.addEventListener('click', function () { refreshPadDiagnose(); });
    }
    var cursorRedetect = body.querySelector('[data-act="cursor-hook-redetect"]');
    if (cursorRedetect && !cursorRedetect.__softPadBound) {
      cursorRedetect.__softPadBound = true;
      cursorRedetect.addEventListener('click', function () {
        refreshCursorHookSetup().then(function (st) {
          toast(st
            ? t('cursorHookRedetectOk', '已重新检测 Cursor Hook')
            : t('cursorHookRedetectFail', '检测失败'));
        });
      });
    }
    var cursorHookCopy = body.querySelector('[data-act="cursor-hook-copy"]');
    if (cursorHookCopy && !cursorHookCopy.__softPadBound) {
      cursorHookCopy.__softPadBound = true;
      cursorHookCopy.addEventListener('click', function () { copyCursorHookPreview(); });
    }
    var claudeRedetect = body.querySelector('[data-act="claude-hook-redetect"]');
    if (claudeRedetect && !claudeRedetect.__softPadBound) {
      claudeRedetect.__softPadBound = true;
      claudeRedetect.addEventListener('click', function () {
        redetectClaudeHookSetup();
      });
    }
    var claudeHookCopy = body.querySelector('[data-act="claude-hook-copy"]');
    if (claudeHookCopy && !claudeHookCopy.__softPadBound) {
      claudeHookCopy.__softPadBound = true;
      claudeHookCopy.addEventListener('click', function () { copyClaudeHookDraft(); });
    }
    var claudeHookOpen = body.querySelector('[data-act="claude-hook-open"]');
    if (claudeHookOpen && !claudeHookOpen.__softPadBound) {
      claudeHookOpen.__softPadBound = true;
      claudeHookOpen.addEventListener('click', function () { openClaudeSettingsFile(); });
    }
    var claudeHookPreview = body.querySelector('[data-act="claude-hook-preview"]');
    if (claudeHookPreview && !claudeHookPreview.__softPadBound) {
      claudeHookPreview.__softPadBound = true;
      claudeHookPreview.addEventListener('click', function () { previewClaudeHookInstall(); });
    }
    var claudeHookInstall = body.querySelector('[data-act="claude-hook-install"]');
    if (claudeHookInstall && !claudeHookInstall.__softPadBound) {
      claudeHookInstall.__softPadBound = true;
      claudeHookInstall.addEventListener('click', function () { confirmClaudeHookInstall(); });
    }
    var claudeHookUnPrev = body.querySelector('[data-act="claude-hook-uninstall-preview"]');
    if (claudeHookUnPrev && !claudeHookUnPrev.__softPadBound) {
      claudeHookUnPrev.__softPadBound = true;
      claudeHookUnPrev.addEventListener('click', function () { previewClaudeHookUninstall(); });
    }
    var claudeHookUn = body.querySelector('[data-act="claude-hook-uninstall"]');
    if (claudeHookUn && !claudeHookUn.__softPadBound) {
      claudeHookUn.__softPadBound = true;
      claudeHookUn.addEventListener('click', function () { confirmClaudeHookUninstall(); });
    }
    var claudeCliPref = body.querySelector('[data-act="claude-cli-pref-toggle"]');
    if (claudeCliPref && !claudeCliPref.__softPadBound) {
      claudeCliPref.__softPadBound = true;
      claudeCliPref.addEventListener('click', function () { toggleClaudeCliInjectPref(m); });
    }
    body.querySelectorAll('[data-act="cursor-activity-enable"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () { setCursorActivityPref(true); });
    });
    body.querySelectorAll('[data-act="cursor-activity-disable"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () { setCursorActivityPref(false); });
    });
    refreshCursorActivityPrefDom(body);
    body.querySelectorAll('[data-act="claude-inject"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        var preset = btn.getAttribute('data-preset') || '';
        padInvoke('cmd_claude_activity_inject', { preset: preset })
          .then(function () { return refreshPadDiagnose(); })
          .then(function () {
            toast(t('claudeActInjOk', '已注入测试事件（claude_hook）'));
          })
          .catch(function () {
            toast(t('claudeActInjFail', '注入失败'));
          });
      });
    });
    var claudeClearBtn = body.querySelector('[data-act="claude-act-clear"]');
    if (claudeClearBtn && !claudeClearBtn.__softPadBound) {
      claudeClearBtn.__softPadBound = true;
      claudeClearBtn.addEventListener('click', function () {
        padInvoke('cmd_claude_activity_clear', {})
          .then(function () { return refreshPadDiagnose(); })
          .then(function () {
            toast(t('claudeActClearOk', '已清空测试活动灯'));
          })
          .catch(function () {
            toast(t('claudeActClearFail', '清空失败'));
          });
      });
    }
    body.querySelectorAll('[data-claude-act-pad-details],[data-claude-act-lights-details]').forEach(function (d) {
      if (d.__softPadBound) return;
      d.__softPadBound = true;
      d.addEventListener('toggle', function () {
        if (d.open) refreshClaudeActivityPad();
      });
    });
  }

  function bindPadManagerEvents(body, m, pad, opts) {
    opts = opts || {};
    if (!body || !m || !pad) return;

    body.querySelectorAll('[data-pad-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-mode');
        if (!next || next === padUiMode) return;
        if (padUiMode === 'try' && next !== 'try') stopTryKeyListener();
        padUiMode = next;
        renderPadManager(m, { skipHookRefresh: true });
      });
    });
    body.querySelectorAll('[data-pad-presentation]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-presentation');
        if (!next || (next !== 'full' && next !== 'mini')) return;
        if (pad.presentation === next) return;
        pad.presentation = next;
        persistPresentation(m);
        renderPadManager(m, { skipHookRefresh: true });
        notifyLinkedUi(m);
      });
    });
    body.querySelectorAll('[data-pad-profile]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-profile');
        if (!next) return;
        if (String(pad.layoutProfile || '') === next) return;
        applyLayoutProfile(m, next, { persist: true });
        if (next !== 'advanced') pad.softwareEnhanceEnabled = false;
        toast(t('codexMicroPadProfileApplied', '已切换布局：{p}').replace('{p}',
          next === 'beginner' ? t('codexMicroPadProfileBeginner', '入门')
            : next === 'advanced' ? t('codexMicroPadProfileAdvanced', '高级')
              : t('codexMicroPadProfileStandard', '标准')));
        // Soft remount pad shell + patch profile chrome — avoid full manager rebuild 假死.
        patchSoftPadLayoutProfileUi(body, pad);
        if (!remountPadManagerShell(m)) {
        renderPadManager(m, { skipHookRefresh: true });
        }
        notifyLinkedUi(m);
      });
    });

    var enabledMgrEl = body.querySelector('[data-act="enabled"]');
    if (enabledMgrEl) {
      enabledMgrEl.addEventListener('change', function () {
        pad.enabled = !!enabledMgrEl.checked;
        previewPadMode = pad.enabled ? 'codex' : 'numpad';
        if (pad.enabled) pad.overlayEnabled = true;
        persistPadFlags(m);
        if (!remountPadManagerShell(m)) {
          renderPadManager(m, { skipHookRefresh: true });
        }
        notifyLinkedUi(m);
      });
    }
    var overlayEl = body.querySelector('[data-act="overlay"]');
    if (overlayEl) {
      overlayEl.addEventListener('change', function () {
        pad.overlayEnabled = !!overlayEl.checked;
        persistPadFlags(m);
      });
    }
    var numLockEl = body.querySelector('[data-act="numlock"]');
    if (numLockEl) {
      numLockEl.addEventListener('change', function () {
        pad.requireNumLockOff = !!numLockEl.checked;
        persistPadFlags(m);
      });
    }
    var enhanceEl = body.querySelector('[data-act="enhance"]');
    if (enhanceEl) {
      enhanceEl.addEventListener('change', function () {
        pad.softwareEnhanceEnabled = !!enhanceEl.checked;
        persistLayout(m);
        notifyLinkedUi(m);
      });
    }

    var bindRefreshBtn = body.querySelector('[data-act="pad-bind-refresh"]');
    if (bindRefreshBtn) {
      bindRefreshBtn.addEventListener('click', function () { refreshBindingDiagnose(m); });
    }
    var bindHealBtn = body.querySelector('[data-act="pad-bind-heal"]');
    if (bindHealBtn) {
      bindHealBtn.addEventListener('click', function () { healBindingDiagnose(m); });
    }
    var bindDetails = body.querySelector('#codexPadBindCard');
    if (bindDetails) {
      bindDetails.addEventListener('toggle', function () {
        if (bindDetails.open) refreshBindingDiagnose(m);
      });
    }

    var agentFold = body.querySelector('#codexPadAgentConnect');
    if (agentFold && !agentFold.__softPadLazyBound) {
      agentFold.__softPadLazyBound = true;
      agentFold.addEventListener('toggle', function () {
        if (!agentFold.open) return;
        if (opts.lazyAgent || agentFold.getAttribute('data-lazy-agent') === '1') {
          fillLazyAgentConnect(body, m, pad);
        } else {
          refreshHookSetupStatus(m);
          refreshClaudeActivityPad();
        }
      });
    }

    // Eager Agent cards (modal): bind + optional IPC. Soft Pad panel skips until fold open.
    if (!opts.lazyAgent && body.querySelector('#codexPadHookCard')) {
      bindAgentConnectEvents(body, m, pad);
      if (opts.refreshHook !== false && !opts.skipHookRefresh) {
        refreshHookSetupStatus(m);
        refreshClaudeActivityPad();
      }
    }

    var restoreBtn = body.querySelector('[data-act="restore"]');
    if (restoreBtn) {
      restoreBtn.addEventListener('click', function () {
        var confirmApi = global.OneToneConfirm;
        var run = function () {
          var profile = pad.layoutProfile === 'beginner' || pad.layoutProfile === 'advanced'
            ? pad.layoutProfile
            : 'standard';
          applyLayoutProfile(m, profile, { persist: true, resetKeys: true });
          renderPadManager(m, { skipHookRefresh: true });
          notifyLinkedUi(m);
          toast(t('codexMicroPadRestored', '已恢复默认：实体 12 键 + 屏幕总开关'));
        };
        if (confirmApi && confirmApi.ask) {
          confirmApi.ask('codexMicroPadRestoreConfirm', {
            fallback: '确定恢复默认布局？当前自定义布局与按键映射将被覆盖。'
          }).then(function (ok) { if (ok) run(); });
          return;
        }
        if (!window.confirm(t('codexMicroPadRestoreConfirm', '确定恢复默认布局？当前自定义布局与按键映射将被覆盖。'))) return;
        run();
      });
    }
    var exportBtn = body.querySelector('[data-act="export"]');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        try {
          var blob = new Blob([JSON.stringify(exportLayoutJson(m), null, 2)], { type: 'application/json' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = 'codex-numpad-layout.json';
          a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
          toast(t('codexMicroPadExported', '布局已导出'));
        } catch (err) {
          toast(t('codexMicroPadExportFail', '导出失败'));
        }
      });
    }

    var moreMenu = body.querySelector('#codexPadMgrMore');
    var moreToggle = body.querySelector('[data-act="more-toggle"]');
    if (moreToggle) {
      moreToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        if (!moreMenu) return;
        moreMenu.hidden = !moreMenu.hidden;
      });
    }
    var copyCustom = body.querySelector('[data-act="copyCustom"]');
    if (copyCustom) {
      copyCustom.addEventListener('click', function () {
        copyAsCustomLayout(m);
        if (moreMenu) moreMenu.hidden = true;
        invalidatePadHeal(m);
        renderPadManager(m, { skipHookRefresh: true });
        notifyLinkedUi(m);
      });
    }
    var fileEl = body.querySelector('[data-act="importFile"]');
    var importBtn = body.querySelector('[data-act="import"]');
    if (importBtn) {
      importBtn.addEventListener('click', function () {
        if (moreMenu) moreMenu.hidden = true;
        if (fileEl) fileEl.click();
      });
    }
    if (fileEl) {
      fileEl.addEventListener('change', function () {
        var file = fileEl.files && fileEl.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(String(reader.result || ''));
            if (importLayoutJson(m, data)) {
              invalidatePadHeal(m);
              toast(t('codexMicroPadImported', '布局已导入'));
              renderPadManager(m, { skipHookRefresh: true });
              notifyLinkedUi(m);
            }
          } catch (_) {
            toast(t('codexMicroPadImportInvalid', '无法导入：不是有效的布局文件'));
          }
          fileEl.value = '';
        };
        reader.readAsText(file);
      });
    }
    var clearBtn = body.querySelector('[data-act="clear"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        if (moreMenu) moreMenu.hidden = true;
        if (!window.confirm(t('codexMicroPadClearConfirm', '确定清空所有小键盘映射？'))) return;
        pad.keys = [];
        protectPrimaryLayout(pad);
        invalidatePadHeal(m);
        persistLayout(m);
        renderPadManager(m, { skipHookRefresh: true });
        notifyLinkedUi(m);
        toast(t('codexMicroPadCleared', '已清空小键盘映射'));
      });
    }
  }

  function renderPadManager(m, opts) {
    opts = opts || {};
    var panelFold = softPadPanelActive() && padManagerMode === 'panel';
    renderCodexMicroPadManager({
      container: activePadManagerBody(),
      mode: padManagerMode || 'modal',
      mapping: m || padManagerMapping,
      skipHookRefresh: opts.skipHookRefresh,
      refreshHook: opts.refreshHook,
      omitPad: panelFold,
      foldSettings: panelFold,
      lazyAgent: panelFold || !!opts.lazyAgent
    });
  }

  function bindPadClicks(host, m, mode) {
    if (!host) return;

    function rerenderPreviewLocal() {
      var pad = m && m.codexMicroPad;
      var oldWrap = host.querySelector('.micro-hw-wrap') || host.querySelector('.micro-hw-shell');
      if (oldWrap && pad) {
        var tmp = document.createElement('div');
        tmp.innerHTML = renderHardwarePad(m, pad, { mode: mode });
        var next = tmp.firstChild;
        if (next) {
          oldWrap.parentNode.replaceChild(next, oldWrap);
          bindPadClicks(host, m, mode);
        }
        return;
      }
      if (host.id === 'codexMicroPadHostTrigger') renderTrigger(host, m);
      else if (host.id === 'codexMicroPadHostTarget') renderTarget(host, m);
    }

    // ENC / pad-mode: preview is local; settings/manager/run toggle real pad + overlay.
    host.querySelectorAll('[data-act="pad-mode"]').forEach(function (sw) {
      sw.addEventListener('pointerdown', function (e) {
        if (e.button != null && e.button !== 0) return;
        sw.classList.add('is-pressed');
      });
      function clearPress() { sw.classList.remove('is-pressed'); }
      sw.addEventListener('pointerup', clearPress);
      sw.addEventListener('pointerleave', clearPress);
      sw.addEventListener('pointercancel', clearPress);
      sw.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        sw.classList.remove('is-pressed');
        if (mode === 'preview') {
          if (sw._padModeBusy) return;
          sw._padModeBusy = true;
          setTimeout(function () { sw._padModeBusy = false; }, 220);
          previewPadMode = previewPadMode === 'codex' ? 'numpad' : 'codex';
          toast(previewPadMode === 'codex'
            ? t('codexMicroPadModeCodex', '虚拟键盘模式')
            : t('codexMicroPadModeNumpad', '数字键模式'));
          rerenderPreviewLocal();
          return;
        }
        // Config / manager / run: ENC toggles real Codex ↔ numpad and keeps overlay on.
        if (!m || !m.codexMicroPad) return;
        if (sw._padModeBusy) return;
        sw._padModeBusy = true;
        setTimeout(function () { sw._padModeBusy = false; }, 280);
        var pad = m.codexMicroPad;
        pad.enabled = !pad.enabled;
        if (pad.enabled) pad.overlayEnabled = true;
        previewPadMode = pad.enabled ? 'codex' : 'numpad';
        persistPadFlags(m);
        toast(pad.enabled
          ? t('codexMicroPadModeCodex', '虚拟键盘模式')
          : t('codexMicroPadModeNumpad', '数字键模式'));
        if (document.getElementById('codexPadMgrBody')) {
          if (!remountPadManagerShell(m)) renderPadManager(m, { skipHookRefresh: true });
        } else if (host.id === 'codexMicroPadHostTarget') {
          if (!remountTargetPadShell(host, m)) renderTarget(host, m, { skipEnsure: true });
        } else if (host.id === 'softPadPreviewHost' || host.closest('#softPadPreviewHost')) {
          renderSoftPadPreview(resolveSoftPadPreviewPaintHost(host), m, { forceFull: true });
        } else {
          var oldWrap = host.querySelector('.micro-hw-wrap') || host.querySelector('.micro-hw-shell');
          if (oldWrap) {
            var tmp = document.createElement('div');
            tmp.innerHTML = renderHardwarePad(m, pad, { mode: mode });
            var next = tmp.firstChild;
            if (next) {
              oldWrap.parentNode.replaceChild(next, oldWrap);
              bindPadClicks(host, m, mode);
            }
          }
        }
        notifyLinkedUi(m);
        // Turning Codex mode on → summon/focus so FG latch + key mapping activate.
        if (pad.enabled) {
          fireMicroKey(m, 'ENC', 'down');
        }
      });
    });

    host.querySelectorAll('[data-nav]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var nav = btn.getAttribute('data-nav');
        if (!nav) return;
        if (mode === 'run' && m && isEnhanceOn(m.codexMicroPad)) {
          fireEnhanceTap(m, nav);
          return;
        }
        if (mode === 'softPad' || mode === 'edit' || mode === 'config') {
          if (softPadPanelActive()) {
            softPadPreviewEditKey(m, nav);
            return;
          }
          openEditKeycap(m, nav);
          return;
        }
        toast(t('codexMicroPadNavPreview', '方向键预览') + ' · ' + String(nav || '')
          + ' · ' + t('codexMicroPadNavEditHint', '点击绑定能力（默认注入方向键）'));
      });
    });

    host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
      if (el.classList.contains('micro-hw__key--placeholder')) return;
      var id = el.getAttribute('data-micro-key');
      if (mode === 'preview') {
        el.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('[data-act="pad-mode"]')) return;
          // Legacy JOY key: no-op (side-rail removed; NAV lives on main pad).
          if (id === 'JOY') { return; }
          if (id === 'ENC') {
            toast(t('codexMicroPadSummonCodex', '召唤 Codex（预览）'));
          }
          previewKeyInHero(m, id);
        });
        return;
      }
      if (mode === 'try') {
        el.addEventListener('click', function () {
          var route = routeForMicroKey(m.codexMicroPad, id);
          var src = (route && Number(route.sourceScan) > 0)
            ? scanLabel(route.sourceScan, route.sourceExtended)
            : t('codexMicroPadScreenPower', '屏幕总开关');
          noteTryRecognized(m, id, src);
        });
        return;
      }
      if (mode === 'softPad' || mode === 'edit' || mode === 'config') {
        // Soft Pad settings: left preview + right form. Modal capability list only outside Soft Pad.
        if (id === 'JOY') { return; }
        el.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('[data-act="pad-mode"]')) return;
          if (softPadPanelActive()) {
            softPadPreviewEditKey(m, id);
            return;
          }
          openEditKeycap(m, id);
        });
        return;
      }
      if (mode === 'run') {
        if (id === 'JOY') { return; }
        if (isHoldMicroKey(m, id)) {
          bindHoldFirePointer(el, m, id);
        } else {
          bindTapFirePointer(el, m, id);
        }
        if (id === 'ENC' && isEnhanceOn(m.codexMicroPad)) {
          el.addEventListener('wheel', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var cw = e.deltaY > 0 || e.deltaX > 0;
            fireEnhanceTap(m, cw ? 'ENC_CW' : 'ENC_CC');
          }, { passive: false });
        }
      }
    });
  }

  function renderTrigger(host, m) {
    if (!host || !m) {
      if (host) host.innerHTML = '';
      host && (host.hidden = true);
      return;
    }
    padUiMode = 'preview';
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var n = countBound(pad);
    var on = pad && pad.enabled;
    host.hidden = false;
    host.innerHTML =
      '<div class="codex-micro-pad">' +
      '<div class="codex-micro-pad__head">' +
      '<p class="codex-micro-pad__title">' + esc(softPadPreviewMainTitle(m)) + '</p>' +
      '<span class="codex-micro-pad__status">' +
      esc(on
        ? t('codexMicroPadStatusOn', '已开启 · 已绑定 {n} 个键').replace('{n}', String(n))
        : t('codexMicroPadStatusOff', '已关闭')) +
      '</span></div>' +
      renderHardwarePad(m, pad, { mode: 'preview' }) +
      '</div>';
    bindPadClicks(host, m, 'preview');
    if (previewMicroKeyId) {
      applyPressedClass(previewMicroKeyId);
      host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
        el.classList.toggle('is-focused', el.getAttribute('data-micro-key') === previewMicroKeyId);
      });
      applyTriggerHeroPreview(m);
    }
  }

  function renderTarget(host, m, opts) {
    opts = opts || {};
    stopReadinessPoll();
    if (!isPadManagerOpen()) stopTryKeyListener();
    // Keys page no longer hosts Soft Pad preview — jump only.
    renderKeysSoftPadJump(host, m);
  }

  function humanMicroKeyLabel(microKeyId) {
    var id = String(microKeyId || '').trim();
    var phys = PHYSICAL_KEY_LABELS[id];
    if (phys) {
      return lang().indexOf('en') === 0 ? phys.en : phys.zh;
    }
    var suggest = AGENT_NUMPAD_SUGGEST[id];
    if (suggest && Number(suggest.sourceScan) > 0) {
      return scanLabel(suggest.sourceScan, !!suggest.sourceExtended);
    }
    return id;
  }

  function editKeycapCloseBtnHtml() {
    return (
      '<button type="button" class="micro-hw-modal__close" data-act="close" aria-label="Close">' +
      '<span class="micro-hw-modal__close-ring" aria-hidden="true"></span>' +
      '<svg class="micro-hw-modal__close-x" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">' +
      '<path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round"/></svg></button>'
    );
  }

  function editKeycapGuideHtml() {
    return (
      '<div class="micro-hw-modal__guide" id="microHwEditLead" role="tablist" aria-label="' +
      esc(t('codexMicroEditGuideAria', '编辑步骤')) + '">' +
      '<button type="button" class="micro-hw-modal__guide-step is-active" role="tab" aria-selected="true" ' +
      'data-guide="action" data-act="edit-guide-tab">' +
      '<span class="micro-hw-modal__guide-ico" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12h11M12 6l6 6-6 6" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
      '<span class="micro-hw-modal__guide-label" data-guide-label="action"></span></button>' +
      '<span class="micro-hw-modal__guide-sep" aria-hidden="true"></span>' +
      '<button type="button" class="micro-hw-modal__guide-step" role="tab" aria-selected="false" ' +
      'data-guide="look" data-act="edit-guide-tab">' +
      '<span class="micro-hw-modal__guide-ico" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="3.2" fill="none" ' +
      'stroke="currentColor" stroke-width="2"/><path d="M12 4.5v2.2M12 17.3v2.2M4.5 12h2.2M17.3 12h2.2' +
      'M6.8 6.8l1.6 1.6M15.6 15.6l1.6 1.6M17.2 6.8l-1.6 1.6M8.4 15.6l-1.6 1.6" fill="none" ' +
      'stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></span>' +
      '<span class="micro-hw-modal__guide-label" data-guide-label="look"></span></button>' +
      '</div>'
    );
  }

  var KEY_LIGHT_SWATCHES = [
    '#3053FE', '#3B82F6', '#06B6D4', '#00A3FF',
    '#F59E0B', '#F97316', '#FF6A00', '#EF4444',
    '#00FF4C', '#84CC16', '#7C3AED', '#A855F7',
    '#E2E8F0', '#94A3B8'
  ];

  function renderKeyLightSwatchDisk(selectedHex) {
    var cur = String(selectedHex || '').trim().toUpperCase();
    if (cur && cur.charAt(0) !== '#') cur = '#' + cur;
    return (
      '<div class="soft-pad-key-swatch-disk" role="listbox" aria-label="' +
      esc(t('softPadKeyLightSwatchAria', '按键灯色盘')) + '">' +
      KEY_LIGHT_SWATCHES.map(function (hex) {
        var on = cur === hex.toUpperCase();
        return (
          '<button type="button" class="soft-pad-key-swatch' + (on ? ' is-active' : '') +
          '" role="option" aria-selected="' + (on ? 'true' : 'false') +
          '" data-act="key-light-swatch" data-hex="' + esc(hex) +
          '" style="--swatch:' + esc(hex) + '" title="' + esc(hex) + '"></button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function agentBindingFor(m, slotId, type) {
    if (!m || !Array.isArray(m.agentBindings)) return null;
    var id = String(slotId || '').trim();
    var want = String(type || '');
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (b && b.slotId === id && String(b.triggerType || '') === want) return b;
    }
    return null;
  }

  function normalizeActivationScope(v) {
    return String(v || '').trim() === 'global' ? 'global' : 'foregroundApp';
  }

  function defaultPhrasesForSlot(m, slotId) {
    var A = agent();
    if (!A || !A.slotById) return '';
    var slot = A.slotById(slotId);
    if (!slot) return '';
    if (A.phraseForAction) return String(A.phraseForAction(slot.actionId) || '').trim();
    var act = A.actionById && A.actionById(slot.actionId);
    if (!act) return '';
    return String((lang().indexOf('en') === 0 ? act.phrasesEn : act.phrasesZh) || '').trim();
  }

  function readLayoutKeyBindings(m, slotId) {
    var id = String(slotId || '').trim();
    if (!id) return { chord: '', phrases: '', activationScope: 'foregroundApp' };
    var keyB = agentBindingFor(m, id, 'key');
    var voiceB = agentBindingFor(m, id, 'voice');
    return {
      chord: String((keyB && keyB.triggerBinding) || chordForSlot(m, id) || '').trim(),
      phrases: String((voiceB && voiceB.triggerBinding) || defaultPhrasesForSlot(m, id) || '').trim(),
      activationScope: normalizeActivationScope(
        (keyB && keyB.activationScope) || (voiceB && voiceB.activationScope)
      )
    };
  }

  function applyLayoutKeyBindings(m, slotId, draft) {
    var id = String(slotId || '').trim();
    if (!m || !id || !draft) return;
    if (!Array.isArray(m.agentBindings)) m.agentBindings = [];
    if (isCursorCustomSlotId(id)) {
      var cs = findCustomShortcut(m.codexMicroPad, id);
      if (!cs) return;
      var chordC = String(draft.chord != null ? draft.chord : cs.chord || '').trim();
      var phrasesC = String(draft.phrases != null ? draft.phrases : cs.phrases || '').trim();
      var scopeC = normalizeActivationScope(draft.activationScope || cs.activationScope);
      cs.chord = chordC;
      cs.phrases = phrasesC;
      cs.activationScope = scopeC;
      upsertCustomShortcutBindings(m, cs);
      return;
    }
    ensureAgentKeyBinding(m, id);
    var scope = normalizeActivationScope(draft.activationScope);
    var chord = String(draft.chord != null ? draft.chord : '').trim();
    var phrases = String(draft.phrases != null ? draft.phrases : '').trim();
    var A = agent();
    var slot = A && A.slotById ? A.slotById(id) : null;
    var act = slot && A.actionById ? A.actionById(slot.actionId) : null;
    var keyB = agentBindingFor(m, id, 'key');
    if (keyB) {
      keyB.activationScope = scope;
      keyB.enabled = true;
      if (chord) keyB.triggerBinding = chord;
    }
    var voiceB = agentBindingFor(m, id, 'voice');
    if (!voiceB) {
      if (phrases) {
        m.agentBindings.push({
          slotId: id,
          actionId: slot ? slot.actionId : id,
          triggerType: 'voice',
          triggerBinding: phrases,
          enabled: true,
          executionMode: (act && act.mode) || 'execute',
          activationScope: scope
        });
      }
    } else {
      voiceB.enabled = !!phrases;
      voiceB.triggerBinding = phrases;
      voiceB.activationScope = scope;
      if (slot) voiceB.actionId = slot.actionId;
    }
  }

  function hydrateLayoutDraftBindings(draft) {
    if (!draft || !draft.mapping) return;
    var fields = readLayoutKeyBindings(draft.mapping, draft.slotId);
    draft.chord = fields.chord;
    draft.phrases = fields.phrases;
    draft.activationScope = fields.activationScope;
  }

  /** Grouped Cursor Soft Pad options; flat list for other Soft Pads. */
  function slotOptionsGrouped(m) {
    var opts = allSlotOptions(m);
    if (!isCursorSoftPadMapping(m)) {
      return [{ id: '', label: '', options: opts }];
    }
    var byId = {};
    opts.forEach(function (o) {
      byId[String(o.id || '')] = o;
    });
    var groups = [];
    var seen = {};
    CURSOR_SLOT_GROUPS.forEach(function (g) {
      var list = [];
      (g.slots || []).forEach(function (sid) {
        var o = byId[sid];
        if (!o || seen[sid]) return;
        seen[sid] = 1;
        list.push(o);
      });
      if (list.length) {
        groups.push({
          id: g.id,
          label: cursorSlotGroupLabel(g),
          desc: cursorSlotGroupDesc(g),
          options: list
        });
      }
    });
    var orphan = [];
    opts.forEach(function (o) {
      var sid = String(o.id || '');
      if (!sid || seen[sid]) return;
      orphan.push(o);
    });
    if (orphan.length) {
      groups.push({
        id: 'other',
        label: lang().indexOf('en') === 0 ? 'Other' : '其他',
        options: orphan
      });
    }
    return groups;
  }

  function fillLayoutKeySlotSelect(sel, m, currentId) {
    if (!sel) return;
    sel.innerHTML = '';
    var unbound = document.createElement('option');
    unbound.value = '';
    unbound.textContent = t('codexMicroPadUnbound', '未绑定');
    sel.appendChild(unbound);
    var groups = slotOptionsGrouped(m);
    groups.forEach(function (g) {
      var parent = sel;
      if (g.label && isCursorSoftPadMapping(m)) {
        var og = document.createElement('optgroup');
        og.label = g.label;
        sel.appendChild(og);
        parent = og;
      }
      (g.options || []).forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = o.label || o.id;
        if (o.tip) opt.title = o.tip;
        parent.appendChild(opt);
      });
    });
    sel.value = String(currentId || '');
  }

  function syncLayoutFocusSegments(scope) {
    var host = document.querySelector('.soft-pad-layout-form__segment');
    if (!host) return;
    var val = normalizeActivationScope(scope);
    host.querySelectorAll('[data-layout-focus]').forEach(function (btn) {
      var on = btn.getAttribute('data-layout-focus') === val;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function syncLayoutKeyFormFields() {
    if (!editDraft) return;
    var chordEl = document.getElementById('layoutKeyChord');
    var phrasesEl = document.getElementById('layoutKeyPhrases');
    var focusEl = document.getElementById('layoutKeyFocus');
    var recBtn = document.getElementById('layoutKeyRecord');
    var bound = !!String(editDraft.slotId || '').trim();
    var scope = normalizeActivationScope(editDraft.activationScope);
    if (chordEl) {
      var chordTxt = bound ? (friendlyChord(editDraft.chord || '') || '—') : '—';
      if ('value' in chordEl && chordEl.tagName === 'INPUT') chordEl.value = bound ? friendlyChord(editDraft.chord || '') : '';
      else chordEl.textContent = chordTxt;
      chordEl.classList.toggle('is-empty', !bound || !String(editDraft.chord || '').trim());
    }
    if (phrasesEl) {
      phrasesEl.value = bound ? String(editDraft.phrases || '') : '';
      phrasesEl.disabled = !bound;
    }
    if (focusEl) {
      focusEl.value = scope;
      focusEl.disabled = !bound;
    }
    syncLayoutFocusSegments(scope);
    var seg = document.querySelector('.soft-pad-layout-form__segment');
    if (seg) {
      seg.querySelectorAll('[data-layout-focus]').forEach(function (btn) {
        btn.disabled = !bound;
      });
    }
    if (recBtn) recBtn.disabled = !bound;
    var actionLbl = bound
      ? layoutSlotLabel(editDraft.mapping, editDraft.slotId)
      : t('codexMicroPadUnbound', '未绑定');
    var curEl = document.getElementById('layoutKeyCurrentAction');
    if (curEl) curEl.textContent = actionLbl;
    var subEl = document.getElementById('microHwEditSub');
    if (subEl && editDraft.mode === 'inline') subEl.textContent = actionLbl;
  }

  function startRecordLayoutChord() {
    if (!editDraft) {
      toast(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改'));
      return;
    }
    if (!String(editDraft.slotId || '').trim()) {
      toast(t('softPadLayoutCustomNeedSlot', '请先在「找命令」里选一个动作。'));
      return;
    }
    layoutRecSheetMode = 'layoutKey';
    if (!beginRecSheetListen(editDraft.mapping)) layoutRecSheetMode = 'custom';
  }

  function bindLayoutKeyForm(host, m) {
    syncHiddenSlotSelect();
    syncLayoutKeyFormFields();
    refreshLayoutActionLibrary(m);
    var phrasesEl = document.getElementById('layoutKeyPhrases');
    if (phrasesEl) {
      phrasesEl.onchange = function () {
        if (!editDraft) return;
        editDraft.phrases = String(phrasesEl.value || '').trim();
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      };
    }
    var focusEl = document.getElementById('layoutKeyFocus');
    var seg = document.querySelector('.soft-pad-layout-form__segment');
    if (seg) {
      seg.querySelectorAll('[data-layout-focus]').forEach(function (btn) {
        btn.onclick = function () {
          if (!editDraft || btn.disabled) return;
          var val = normalizeActivationScope(btn.getAttribute('data-layout-focus'));
          editDraft.activationScope = val;
          if (focusEl) focusEl.value = val;
          syncLayoutFocusSegments(val);
          commitEditKeycapDraft({ keepOpen: true, quiet: true });
        };
      });
    } else if (focusEl) {
      focusEl.onchange = function () {
        if (!editDraft) return;
        editDraft.activationScope = normalizeActivationScope(focusEl.value);
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      };
    }
    var recBtn = document.getElementById('layoutKeyRecord');
    if (recBtn) {
      recBtn.textContent = t('softPadLayoutRecordChord', '录制');
      recBtn.onclick = function () { startRecordLayoutChord(); };
    }
  }

  function buildLayoutKeyFormHtml() {
    return (
      '<div class="soft-pad-layout-form-wrap">' +
      '<div class="soft-pad-layout-form-head">' +
      '<div>' +
      '<p class="soft-pad-layout-form-title" id="microHwEditTitle"></p>' +
      '<p class="soft-pad-layout-form-sub" id="microHwEditSub"></p>' +
      '<span id="layoutKeyCurrentAction" hidden></span>' +
      '</div>' +
      editKeycapCloseBtnHtml() +
      '</div>' +
      '<div class="soft-pad-layout-form">' +
      '<div class="soft-pad-layout-form__field soft-pad-layout-form__chord">' +
      '<span class="soft-pad-layout-form__lbl">' +
      esc(t('softPadLayoutFieldChord', '快捷键')) +
      '</span>' +
      '<div class="soft-pad-layout-form__chord-row">' +
      '<div class="soft-pad-layout-form__chord-value is-empty" id="layoutKeyChord">—</div>' +
      '<button type="button" class="codex-micro-pad__btn soft-pad-layout-form__record" id="layoutKeyRecord">' +
      esc(t('softPadLayoutRecordChord', '录制')) +
      '</button>' +
      '</div></div>' +
      '<label class="soft-pad-layout-form__field">' +
      '<span class="soft-pad-layout-form__lbl">' +
      esc(t('softPadLayoutFieldPhrases', '文本口令')) +
      '（' +
      esc(t('softPadLayoutOptional', '可选')) +
      '）</span>' +
      '<input id="layoutKeyPhrases" type="text" autocomplete="off" />' +
      '</label>' +
      '<div class="soft-pad-layout-form__field soft-pad-layout-form__focus">' +
      '<span class="soft-pad-layout-form__lbl">' +
      esc(t('softPadLayoutFieldFocus', '送到哪里')) +
      '</span>' +
      '<input id="layoutKeyFocus" type="hidden" value="foregroundApp" />' +
      '<div class="soft-pad-layout-form__segment" role="group" aria-label="' +
      esc(t('softPadLayoutFieldFocus', '送到哪里')) +
      '">' +
      '<button type="button" class="soft-pad-layout-form__seg is-active" data-layout-focus="foregroundApp" aria-pressed="true">' +
      esc(t('softPadLayoutFocusEditor', '正在用的编辑器')) +
      '</button>' +
      '<button type="button" class="soft-pad-layout-form__seg" data-layout-focus="global" aria-pressed="false">' +
      esc(t('softPadLayoutFocusGlobal', '不抢焦点')) +
      '</button>' +
      '</div></div>' +
      '</div>' +
      '<select id="microHwEditSlot" class="micro-hw-modal__slot-hidden" aria-hidden="true" tabindex="-1" hidden></select>' +
      '</div>'
    );
  }

  function applyEditKeycapGuideTab(host, tab) {
    if (!host) return;
    if (tab !== 'look') tab = 'action';
    host.setAttribute('data-edit-guide', tab);
    host.querySelectorAll('[data-act="edit-guide-tab"]').forEach(function (btn) {
      var on = btn.getAttribute('data-guide') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var lookPanel = host.querySelector('[data-edit-panel="look"]');
    var actionPanels = host.querySelectorAll('[data-edit-panel="action"]');
    if (lookPanel) lookPanel.hidden = tab !== 'look';
    actionPanels.forEach(function (el) { el.hidden = tab === 'look'; });
    if (tab === 'look') {
      var details = host.querySelector('#microHwIconDetails');
      if (details) details.open = true;
    }
  }

  function buildEditKeycapInnerHtml(mode) {
    if (mode === 'inline') return buildLayoutKeyFormHtml();
    return (
      '<div class="micro-hw-modal__head">' +
      '<div class="micro-hw-modal__head-main">' +
      '<p class="micro-hw-modal__title" id="microHwEditTitle"></p>' +
      '<p class="micro-hw-modal__sub" id="microHwEditSub"></p>' +
      editKeycapGuideHtml() +
      '</div>' + editKeycapCloseBtnHtml() +
      '</div>' +
      '<div class="soft-pad-keycap-editor__scroll">' +
      '<section class="micro-hw-modal__effect-section soft-pad-keycap-editor__effect" data-edit-panel="action" id="microHwEffectSection">' +
      '<p class="micro-hw-modal__section-title" id="microHwEffectTitle"></p>' +
      '<p class="micro-hw-modal__effect-source" id="microHwEffectSource" hidden></p>' +
      '<p class="micro-hw-modal__effect-tip" id="microHwEditEffectTip" aria-live="polite"></p>' +
      '<p class="micro-hw-modal__status-note" id="microHwStatusLightNote" hidden></p>' +
      '<div class="soft-pad-keylight-editor soft-pad-keylight-editor--edit" id="microHwKeyLightEditor" hidden></div>' +
      '<p class="micro-hw-modal__assign-hint" id="microHwAssignHint" hidden></p>' +
      '</section>' +
      '<section class="micro-hw-modal__cap-section" data-edit-panel="action" id="microHwCapSection">' +
      '<p class="micro-hw-modal__section-title" id="microHwCapTitle"></p>' +
      '<div class="micro-hw-modal__cap-list" id="microHwCapList" role="listbox"></div>' +
      '<select id="microHwEditSlot" class="micro-hw-modal__slot-hidden" aria-hidden="true" tabindex="-1"></select>' +
      '</section>' +
      '<section class="soft-pad-keycap-look" data-edit-panel="look" id="microHwLookPanel" hidden>' +
      '<p class="micro-hw-modal__section-title" id="microHwLookTitle"></p>' +
      '<p class="codex-pad-mgr__hint" id="microHwLookHint"></p>' +
      '<div class="soft-pad-key-light-rgb" id="microHwKeyLightRgbRow">' +
      '<label class="soft-pad-key-light-rgb__lbl">' +
      '<span id="microHwKeyLightRgbLbl"></span>' +
      '<input type="color" id="microHwKeyLightRgb" data-act="key-light-rgb" value="#3053FE">' +
      '</label>' +
      '<button type="button" class="codex-micro-pad__btn" id="microHwKeyLightRgbClear" data-act="key-light-rgb-clear"></button>' +
      '</div>' +
      '<div id="microHwKeyLightSwatches"></div>' +
      '<details class="micro-hw-modal__details" id="microHwIconDetails" open>' +
      '<summary id="microHwIconDetailsSummary"></summary>' +
      '<p class="micro-hw-modal__details-hint" id="microHwIconDetailsHint"></p>' +
      '<input type="search" class="micro-hw-modal__search" id="microHwEditSearch" autocomplete="off" />' +
      '<div class="micro-hw-modal__icons" id="microHwEditIcons"></div>' +
      '<p class="micro-hw-modal__icon-preview" id="microHwIconPreviewTip" aria-live="polite"></p>' +
      '</details>' +
      '</section>' +
      '<details class="micro-hw-modal__details" data-edit-panel="action" id="microHwHwDetails">' +
      '<summary id="microHwHwDetailsSummary"></summary>' +
      '<p class="micro-hw-modal__details-hint" id="microHwHwDetailsHint"></p>' +
      '<div class="micro-hw-modal__hw-row">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="record" id="microHwEditRecord"></button>' +
      '</div>' +
      '<details class="micro-hw-modal__debug" id="microHwEditDebug">' +
      '<summary id="microHwEditDebugSummary"></summary>' +
      '<p class="micro-hw-modal__debug-line" id="microHwEditDebugScan"></p>' +
      '</details>' +
      '</details>' +
      '</div>'
    );
  }

  function clearEditKeycapDomHosts(opts) {
    opts = opts || {};
    var modal = document.getElementById('codexMicroEditModal');
    if (modal) {
      modal.hidden = true;
      var card = modal.querySelector('.micro-hw-modal__card');
      if (card) card.innerHTML = '';
    }
    if (opts.keepLayoutHost) return;
    var layoutEd = softPadLayoutEditorHost();
    if (layoutEd) {
      layoutEd.innerHTML = '';
      // Close inline right panel shell (keep preview on the left).
      layoutEd.hidden = true;
    }
    var bodyEl = document.getElementById('softPadSubpageBody');
    var paintEl = resolveSoftPadSubpagePaintHost(bodyEl);
    if (paintEl) paintEl.classList.remove('is-editing-key');
    if (bodyEl) bodyEl.classList.remove('is-editing-key');
    if (layoutEd && layoutEd.parentNode) layoutEd.parentNode.classList.remove('is-editing-key');
  }

  function ensureEditModal() {
    var el = document.getElementById('codexMicroEditModal');
    if (el) {
      el.classList.add('micro-hw-modal--edit');
      return el;
    }
    el = document.createElement('div');
    el.id = 'codexMicroEditModal';
    el.className = 'micro-hw-modal micro-hw-modal--edit';
    el.hidden = true;
    el.innerHTML = '<div class="micro-hw-modal__card" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) closeEditKeycap();
    });
    return el;
  }

  function renderCapabilityList(m) {
    var host = document.getElementById('microHwCapList');
    var slotSel = document.getElementById('microHwEditSlot');
    if (!host || !editDraft) return;
    host.innerHTML = '';
    if (slotSel) slotSel.innerHTML = '';
    var A = global.OneToneAgentActions;
    if (A && A.featureActionPickerUi && A.featureActionPickerUi() && global.OneToneSemanticActionPicker) {
      var pickBtn = document.createElement('button');
      pickBtn.type = 'button';
      pickBtn.className = 'micro-hw-modal__cap-card micro-hw-modal__cap-card--sap';
      pickBtn.textContent = t('codexMicroPickSemantic', '从语义目录选择…');
      pickBtn.addEventListener('click', function () {
        global.OneToneSemanticActionPicker.open({
          mappingId: m && m.id,
          channel: 'softPad',
          placement: 'softPad',
          onSelect: function (sel) {
            if (!sel || !sel.actionId) return;
            var adapters = global.OneToneActionBindingAdapters;
            var microKeyId = editDraft && editDraft.microKeyId;
            function applySlot(sid) {
              editDraft.slotId = sid;
              maybeAutoSuggestIcon();
              syncHiddenSlotSelect();
              renderCapabilityList(m);
              commitEditKeycapDraft({ keepOpen: true, quiet: true });
            }
            if (adapters && adapters.softPad && adapters.softPad.upsert) {
              adapters.softPad
                .upsert(m.id, sel.actionId, { microKeyId: microKeyId || '' }, null)
                .then(function (res) {
                  applySlot((res && res.slotId) || (global.OneToneSemanticActionStore
                    ? global.OneToneSemanticActionStore.semanticSlotId('softPad', sel.actionId)
                    : 'semantic:softPad:' + sel.actionId));
                })
                .catch(function (err) {
                  toast(String(err && err.message ? err.message : err));
                });
              return;
            }
            var sid =
              (global.OneToneSemanticActionStore &&
                global.OneToneSemanticActionStore.semanticSlotId('softPad', sel.actionId)) ||
              ('semantic:softPad:' + sel.actionId);
            applySlot(sid);
          }
        });
      });
      host.appendChild(pickBtn);
    }
    var opts = allSlotOptions(m).concat([{ id: '', label: '' }]);
    var cursorGrouped = isCursorSoftPadMapping(m);
    var renderCapCard = function (o) {
      var id = String(o.id || '');
      var copy = capabilityCardCopy(id, m);
      var iconId = iconIdForCapabilitySlot(id);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'micro-hw-modal__cap-card' +
        (String(editDraft.slotId || '') === id ? ' is-selected' : '');
      btn.setAttribute('data-capability-slot', id);
      btn.setAttribute('data-icon-id', iconId);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(editDraft.slotId || '') === id ? 'true' : 'false');
      btn.innerHTML =
        '<span class="micro-hw-modal__cap-icon micro-hw__icon" aria-hidden="true">' +
        iconSvg(iconId) +
        '</span>' +
        '<span class="micro-hw-modal__cap-text">' +
        '<span class="micro-hw-modal__cap-title">' + esc(copy.title) + '</span>' +
        '</span>';
      btn.addEventListener('click', function () {
        editDraft.slotId = id;
        maybeAutoSuggestIcon();
        syncHiddenSlotSelect();
        renderCapabilityList(m);
        renderIconGrid(
          (document.getElementById('microHwEditSearch') || {}).value || ''
        );
        showCapabilityEffectTip();
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      });
      host.appendChild(btn);
      if (slotSel) {
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = id
          ? copy.title
          : (isNavMicroKey(editDraft.microKeyId)
            ? t('codexMicroPadNavDefaultSlot', '默认 · 注入方向键')
            : t('codexMicroPadUnbound', '未绑定'));
        if (String(editDraft.slotId || '') === id) opt.selected = true;
        slotSel.appendChild(opt);
      }
    };
    if (cursorGrouped) {
      // Unbound on top, then section headers + cards.
      renderCapCard({ id: '', label: '' });
      slotOptionsGrouped(m).forEach(function (g) {
        if (!g.options || !g.options.length) return;
        var head = document.createElement('div');
        head.className = 'micro-hw-modal__cap-group';
        head.textContent = g.label || '';
        head.setAttribute('role', 'presentation');
        host.appendChild(head);
        g.options.forEach(renderCapCard);
      });
    } else {
      opts.forEach(renderCapCard);
    }
    syncHiddenSlotSelect();
  }

  function showIconPreviewTip(text) {
    var tip = document.getElementById('microHwIconPreviewTip');
    if (!tip) return;
    tip.textContent = String(text || '');
    tip.hidden = !text;
  }

  function renderIconGrid(filter) {
    var host = document.getElementById('microHwEditIcons');
    if (!host || !editDraft) return;
    var q = String(filter || '').trim().toLowerCase();
    host.innerHTML = '';
    ICON_DEFS.forEach(function (def) {
      if (q && def.id.indexOf(q) < 0 && def.label.toLowerCase().indexOf(q) < 0) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'micro-hw-modal__icon-btn' + (editDraft.uiIconId === def.id ? ' is-selected' : '');
      btn.setAttribute('data-icon', def.id);
      btn.setAttribute('data-icon-id', def.id);
      var tip = iconEffectTip(def);
      btn.title = tip;
      btn.setAttribute('aria-label', tip);
      btn.innerHTML =
        '<span class="micro-hw__icon" aria-hidden="true">' + iconSvg(def.id) + '</span>' +
        '<span class="micro-hw-modal__icon-label">' + esc(def.label) + '</span>';
      btn.addEventListener('mouseenter', function () { showIconPreviewTip(tip); });
      btn.addEventListener('focus', function () { showIconPreviewTip(tip); });
      btn.addEventListener('mouseleave', function () { showIconPreviewTip(''); });
      btn.addEventListener('blur', function () { showIconPreviewTip(''); });
      btn.addEventListener('click', function () {
        editDraft.iconTouched = true;
        editDraft.uiIconId = def.id;
        showIconPreviewTip(tip);
        var searchEl = document.getElementById('microHwEditSearch');
        renderIconGrid(searchEl ? searchEl.value : '');
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      });
      host.appendChild(btn);
    });
  }

  function showEditEffectTip(text) {
    var tip = document.getElementById('microHwEditEffectTip');
    if (!tip) return;
    tip.textContent = String(text || '');
    tip.hidden = !text;
  }

  /** Shared editor mount — modal or Soft Pad layout inline. */
  function renderEditKeycapEditor(host, m, microKeyId, opts) {
    opts = opts || {};
    if (!host || !m || !microKeyId) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var mode = opts.mode === 'inline' ? 'inline' : 'modal';
    var route = routeForMicroKey(pad, microKeyId) || {};
    var suggest = AGENT_NUMPAD_SUGGEST[microKeyId];
    var def = LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === microKeyId; });
    var initialSlot = route.slotId || (def && def.slotId) || '';
    var iconState = resolveOpenEditIconState(route, initialSlot, def);

    // Free global edit ids from any prior host (do not flash layout tools yet).
    var modal = document.getElementById('codexMicroEditModal');
    if (modal) {
      modal.hidden = true;
      var card = modal.querySelector('.micro-hw-modal__card');
      if (card && card !== host) card.innerHTML = '';
    }
    var layoutEd = softPadLayoutEditorHost();
    if (layoutEd && layoutEd !== host) {
      layoutEd.innerHTML = '';
      layoutEd.hidden = true;
    }
    host.innerHTML = buildEditKeycapInnerHtml(mode);
    host.hidden = false;
    if (mode === 'inline') {
      // Intro + batch fold stay visible; editor fills the middle.
      // CSS targets #softPadSubpageBody.is-editing-key — mirror onto outer + paint.
      var bodyEl = document.getElementById('softPadSubpageBody');
      var paintEl = resolveSoftPadSubpagePaintHost(bodyEl);
      if (paintEl) paintEl.classList.add('is-editing-key');
      if (bodyEl) bodyEl.classList.add('is-editing-key');
      if (host.parentNode) host.parentNode.classList.add('is-editing-key');
      markSoftPadPreviewFocus(microKeyId);
    }

    editDraft = {
      mapping: m,
      microKeyId: microKeyId,
      uiIconId: iconState.uiIconId,
      lightRgb: String(route.lightRgb || route.light_rgb || '').trim(),
      slotId: initialSlot,
      sourceScan: route.sourceScan || (def && def.sourceScan) || (suggest && suggest.sourceScan) || 0,
      sourceExtended: route.sourceExtended != null
        ? !!route.sourceExtended
        : !!(def && def.sourceExtended) || !!(suggest && suggest.sourceExtended),
      sourceKey: String(route.sourceKey || '').trim(),
      iconTouched: iconState.iconTouched,
      mode: mode,
      root: host,
      onClose: opts.onClose || null,
      onSaved: opts.onSaved || null,
      chord: '',
      phrases: '',
      activationScope: 'foregroundApp'
    };
    hydrateLayoutDraftBindings(editDraft);

    var keyLabel = humanMicroKeyLabel(microKeyId);
    var titleEl = document.getElementById('microHwEditTitle');
    var subEl = document.getElementById('microHwEditSub');
    if (mode === 'inline') {
      if (titleEl) {
        titleEl.textContent = t('softPadLayoutFormTitle', '{key}').replace('{key}', keyLabel);
      }
      if (subEl) {
        subEl.textContent = String(editDraft.slotId || '').trim()
          ? layoutSlotLabel(m, editDraft.slotId)
          : t('codexMicroPadUnbound', '未绑定');
      }
      bindLayoutKeyForm(host, m);
      revealCommonsLayoutForKey(m);
      var libHost = document.querySelector('[data-soft-pad-action-library="1"]');
      if (libHost) placeLayoutEditorUnderSelection(libHost);
      host.querySelectorAll('[data-act="close"]').forEach(function (btn) {
        if (btn.__softPadCloseBound) return;
        btn.__softPadCloseBound = true;
        btn.setAttribute('aria-label', t('codexMicroEditClose', '关闭'));
        btn.onclick = function () { closeEditKeycap({ reopenInline: false }); };
      });
      try {
        padInvoke('cmd_app_log', {
          line: 'fe renderEditKeycapEditor mode=inline id=' + String(microKeyId || '')
        });
      } catch (_) {}
      return;
    }
    var badgeEl = document.getElementById('microHwEditBadge');
    if (badgeEl) {
      badgeEl.textContent = t('softPadLayoutEditingBadge', '正在编辑');
    }
    if (titleEl) titleEl.textContent = t('codexMicroEditTitle', '编辑这个键');
    if (subEl) subEl.textContent = keyLabel;
    var actionLbl = host.querySelector('[data-guide-label="action"]');
    var lookLbl = host.querySelector('[data-guide-label="look"]');
    if (isNavMicroKey(microKeyId)) {
      if (actionLbl) actionLbl.textContent = t('codexMicroEditGuideNavAction', '可选动作');
    } else {
      if (actionLbl) actionLbl.textContent = t('codexMicroEditGuideAction', '选动作');
    }
    if (lookLbl) lookLbl.textContent = t('codexMicroEditGuideLook', '改外观');
    var lookTitle = document.getElementById('microHwLookTitle');
    if (lookTitle) lookTitle.textContent = t('softPadKeyLookTitle', '按键灯色与外观');
    var lookHint = document.getElementById('microHwLookHint');
    if (lookHint) {
      lookHint.textContent = t(
        'softPadKeyLookHint',
        '点色盘选此键灯色，左侧 Soft Pad 会立刻预览；清空则跟随状态配色。'
      );
    }
    host.querySelectorAll('[data-act="edit-guide-tab"]').forEach(function (btn) {
      if (btn.__guideBound) return;
      btn.__guideBound = true;
      btn.addEventListener('click', function () {
        applyEditKeycapGuideTab(host, btn.getAttribute('data-guide') || 'action');
      });
    });
    applyEditKeycapGuideTab(host, 'action');
    var effectTitle = document.getElementById('microHwEffectTitle');
    if (effectTitle) effectTitle.textContent = t('codexMicroEditEffectTitle', '按下后会发生什么');

    var iconSum = document.getElementById('microHwIconDetailsSummary');
    var iconHint = document.getElementById('microHwIconDetailsHint');
    if (iconSum) iconSum.textContent = t('codexMicroEditIconDetails', '键帽外观（可选）');
    if (iconHint) {
      iconHint.textContent = t(
        'codexMicroEditIconDetailsHint',
        '只改变键上的图案，不会改变按键能力。'
      );
    }
    var rgbLbl = document.getElementById('microHwKeyLightRgbLbl');
    if (rgbLbl) rgbLbl.textContent = t('softPadKeyLightRgbLbl', '此键灯色');
    var rgbClear = document.getElementById('microHwKeyLightRgbClear');
    if (rgbClear) rgbClear.textContent = t('softPadKeyLightRgbClear', '跟随状态盘');
    var rgbInp = document.getElementById('microHwKeyLightRgb');
    var swatchHost = document.getElementById('microHwKeyLightSwatches');
    function syncKeyLightSwatches() {
      if (!swatchHost) return;
      var v = rgbInp ? String(rgbInp.value || '') : '';
      swatchHost.innerHTML = renderKeyLightSwatchDisk(v);
      swatchHost.querySelectorAll('[data-act="key-light-swatch"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var hex = btn.getAttribute('data-hex') || '';
          if (!editDraft || !hex) return;
          editDraft.lightRgb = hex;
          if (rgbInp) rgbInp.value = hex;
          syncKeyLightSwatches();
          commitEditKeycapDraft({ keepOpen: true });
        });
      });
    }
    if (rgbInp) {
      var curRgb = String(editDraft.lightRgb || '').trim();
      if (curRgb && curRgb.charAt(0) !== '#') curRgb = '#' + curRgb;
      if (curRgb.length !== 7) curRgb = resolvedStatusColor(pad, 'running');
      rgbInp.value = curRgb;
      if (!rgbInp.__softPadBound) {
        rgbInp.__softPadBound = true;
        rgbInp.addEventListener('input', function () {
          if (!editDraft) return;
          editDraft.lightRgb = String(rgbInp.value || '');
          syncKeyLightSwatches();
          commitEditKeycapDraft({ keepOpen: true });
        });
      }
    }
    syncKeyLightSwatches();
    if (rgbClear && !rgbClear.__softPadBound) {
      rgbClear.__softPadBound = true;
      rgbClear.addEventListener('click', function () {
        if (!editDraft) return;
        editDraft.lightRgb = '';
        if (rgbInp) rgbInp.value = resolvedStatusColor(pad, 'running');
        syncKeyLightSwatches();
        commitEditKeycapDraft({ keepOpen: true });
      });
    }
    var searchEl = document.getElementById('microHwEditSearch');
    if (searchEl) {
      searchEl.placeholder = t('codexMicroEditSearch', '搜索外观图标');
      searchEl.value = '';
      searchEl.oninput = function () { renderIconGrid(searchEl.value); };
    }

    var hwSum = document.getElementById('microHwHwDetailsSummary');
    var hwHint = document.getElementById('microHwHwDetailsHint');
    if (hwSum) hwSum.textContent = t('codexMicroEditHwDetails', '实体小键盘（高级）');
    if (hwHint) {
      hwHint.textContent = t(
        'codexMicroEditHwDetailsHint',
        '把脚踏/旋钮固件设成 F13–F24、音量或侧键。官方小键盘仍可用扫描码。'
      );
    }

    var recBtn = document.getElementById('microHwEditRecord');
    if (recBtn) {
      recBtn.textContent = routeSourceLabel(editDraft)
        ? routeSourceLabel(editDraft)
        : (microKeyId === 'ENC'
          ? t('codexMicroPadScreenPower', '屏幕总开关')
          : (isNavMicroKey(microKeyId)
            ? t('codexMicroPadNavScreenOnly', '屏幕方向键 · 无实体扫码')
            : t('codexMicroPadTapRecord', '点击绑定')));
    if (microKeyId === 'ENC' || isNavMicroKey(microKeyId)) {
        recBtn.disabled = true;
        recBtn.title = microKeyId === 'ENC'
          ? t('codexMicroPadEncScreenOnly', '总开关默认仅屏幕点击，不占用小键盘 0（说话键）')
          : t('codexMicroPadNavScreenOnly', '屏幕方向键 · 无实体扫码');
    } else {
        recBtn.disabled = false;
        recBtn.title = '';
      }
    }
    var dbgSum = document.getElementById('microHwEditDebugSummary');
    var dbgScan = document.getElementById('microHwEditDebugScan');
    if (dbgSum) dbgSum.textContent = t('codexMicroPadDebugSummary', '诊断（scanCode）');
    if (dbgScan) {
      dbgScan.textContent = 'microKeyId=' + microKeyId +
        ' · sourceScan=0x' + Number(editDraft.sourceScan || 0).toString(16) +
        ' · extended=' + (editDraft.sourceExtended ? '1' : '0') +
        ' · sourceKey=' + String(editDraft.sourceKey || '');
    }

    renderCapabilityList(m);
    renderIconGrid('');
    showIconPreviewTip('');
    showCapabilityEffectTip();

    function bindAct(sel, fn) {
      var el = host.querySelector(sel);
      if (el) el.onclick = fn;
    }
    host.querySelectorAll('[data-act="close"]').forEach(function (btn) {
      btn.setAttribute('aria-label', t('codexMicroEditClose', '关闭'));
      btn.onclick = function () { closeEditKeycap({ reopenInline: false }); };
    });
    bindAct('[data-act="record"]', function () {
      startRecordNumpad(m, pad, microKeyId, function () {
        var r = routeForMicroKey(pad, microKeyId) || {};
        editDraft.sourceScan = r.sourceScan || 0;
        editDraft.sourceExtended = !!r.sourceExtended;
        editDraft.sourceKey = String(r.sourceKey || '').trim();
        var rb = document.getElementById('microHwEditRecord');
        if (rb) {
          rb.textContent = routeSourceLabel(editDraft)
            || t('codexMicroPadTapRecord', '点击绑定');
        }
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      });
    });

    try {
      padInvoke('cmd_app_log', {
        line: 'fe renderEditKeycapEditor mode=' + mode + ' id=' + String(microKeyId || '')
      });
    } catch (_) {}
  }

  function openEditKeycap(m, microKeyId, opts) {
    opts = opts || {};
    ensurePad(m, { persist: false });
    var mode = opts.mode === 'inline' ? 'inline' : 'modal';
    // Soft Pad settings: always left preview + right form — never capability modal.
    if (softPadPanelActive() && mode !== 'inline') {
      softPadPreviewEditKey(m, microKeyId);
      return;
    }
    if (mode === 'inline') {
      var layoutHost = softPadLayoutEditorHost();
      if (layoutHost) {
        renderEditKeycapEditor(layoutHost, m, microKeyId, {
          mode: 'inline',
          onClose: opts.onClose,
          onSaved: opts.onSaved
        });
        return;
      }
      if (softPadPanelActive()) {
        // Layout host not ready yet (subpage paint race) — wait, do not fall back to modal.
        var Hub = global.OneToneSoftPadHub;
        if (Hub && typeof Hub.getView === 'function' && Hub.getView() !== 'layout' &&
            typeof Hub.openSubpage === 'function') {
          Hub.openSubpage('layout', { fromUser: true, keyId: microKeyId });
        }
        requestAnimationFrame(function () {
          setTimeout(function () {
            var host2 = softPadLayoutEditorHost();
            if (!host2) return;
            renderEditKeycapEditor(host2, m, microKeyId, {
              mode: 'inline',
              onClose: opts.onClose,
              onSaved: opts.onSaved
            });
          }, 80);
        });
        return;
      }
      mode = 'modal';
    }
    var modal = ensureEditModal();
    var card = modal.querySelector('.micro-hw-modal__card');
    if (!card) return;
    renderEditKeycapEditor(card, m, microKeyId, {
      mode: 'modal',
      onClose: opts.onClose,
      onSaved: opts.onSaved
    });
    if (modal.parentNode === document.body) {
      document.body.appendChild(modal);
    }
    modal.hidden = false;
  }

  function updateAssignHint() {
    showCapabilityEffectTip();
  }

  function closeEditKeycap(opts) {
    opts = opts || {};
    var mode = editDraft && editDraft.mode;
    var m = editDraft && editDraft.mapping;
    var keyId = editDraft && editDraft.microKeyId;
    var onClose = editDraft && editDraft.onClose;
    editDraft = null;

    // Leaving Soft Pad layout / remounting: wipe without reopening.
    if (opts.reopenInline === false) {
      clearEditKeycapDomHosts();
      if (typeof onClose === 'function') {
        try { onClose(); } catch (_) {}
      }
      return;
    }

    if (mode === 'inline' && m) {
      // Stay on layout editor — reload same (or default) key so the pane never blanks.
      clearEditKeycapDomHosts({ keepLayoutHost: true });
      openEditKeycap(m, keyId || pickDefaultLayoutKey(m), { mode: 'inline' });
      if (typeof onClose === 'function') {
        try { onClose(); } catch (_) {}
      }
      return;
    }

    clearEditKeycapDomHosts();
    if (typeof onClose === 'function') {
      try { onClose(); } catch (_) {}
    }
  }

  function isEditKeycapOpen() {
    return !!editDraft;
  }

  /** Persist current edit draft. keepOpen=true for pick-to-autosave without dismissing modal. */
  function commitEditKeycapDraft(opts) {
    opts = opts || {};
    if (!editDraft) return false;
    var m = editDraft.mapping;
    var pad = m.codexMicroPad;
    var mode = editDraft.mode;
    var keyId = editDraft.microKeyId;
    var onSaved = editDraft.onSaved;
    var slotId = String(editDraft.slotId || '').trim();
    if (slotId && findTriggerConflict(m, slotId, editDraft.microKeyId)) {
      toast(t('codexMicroPadChordConflict', '该能力的快捷键已被其他键位使用'));
      return false;
    }
    var suggest = AGENT_NUMPAD_SUGGEST[editDraft.microKeyId];
    var navKey = isNavMicroKey(editDraft.microKeyId);
    var scan = (editDraft.microKeyId === 'ENC' || navKey) ? 0 : (editDraft.sourceScan || 0);
    // Seed binding before route persist so quiet IPC never races an empty chord.
    if (slotId) {
      ensureAgentKeyBinding(m, slotId);
      // Inline layout editor needs to persist chord/phrases/scope into agentBindings.
      if (mode === 'inline') {
        applyLayoutKeyBindings(m, slotId, editDraft);
      }
    }
    var saveIcon = editDraft.uiIconId;
    if (
      (slotId === 'plan' || slotId === 'switchAgent') &&
      isSoftPadLeftoverIcon(saveIcon, keyId, slotId)
    ) {
      saveIcon = SLOT_DEFAULT_ICON[slotId] || saveIcon;
    }
    upsertRoute(m, pad, editDraft.microKeyId, {
      uiIconId: saveIcon,
      lightRgb: editDraft.lightRgb != null ? String(editDraft.lightRgb || '') : undefined,
      slotId: slotId,
      enabled: !!slotId,
      sourceScan: scan,
      sourceExtended: (editDraft.microKeyId === 'ENC' || navKey) ? false : editDraft.sourceExtended,
      sourceKey: (editDraft.microKeyId === 'ENC' || navKey) ? '' : String(editDraft.sourceKey || '').trim(),
      advanced: navKey ? true : undefined
    }, { skipPersist: true });
    pad.layoutProfile = 'custom';
    if (pad.softwareEnhanceEnabled == null) pad.softwareEnhanceEnabled = true;
    if (slotId && !scan && !editDraft.sourceKey && suggest && editDraft.microKeyId !== 'ENC' && !navKey) {
      upsertRoute(m, pad, editDraft.microKeyId, {
        sourceScan: suggest.sourceScan,
        sourceExtended: !!suggest.sourceExtended
      }, { skipPersist: true });
    }
    persistLayoutNow(m);
    if (typeof onSaved === 'function') {
      try { onSaved(m); } catch (_) {}
    }
    if (mode === 'inline' || softPadPanelActive()) {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.schedulePreviewPaint === 'function') {
        try { Hub.schedulePreviewPaint({ mapping: m }); } catch (_) {}
      }
      markSoftPadPreviewFocus(keyId);
      refreshLayoutActionLibrary(m);
    } else if (isPadManagerOpen()) {
      renderPadManager(m, { skipHookRefresh: true });
    } else {
      var targetHost = document.getElementById('codexMicroPadHostTarget');
      if (targetHost) renderTarget(targetHost, m);
    }
    notifyLinkedUi(m);
    if (!opts.quiet) toast(t('codexMicroEditSaved', '键帽已更新'));
    if (!opts.keepOpen) {
      if (mode === 'inline') closeEditKeycap();
      else closeEditKeycap({ reopenInline: false });
    }
    return true;
  }

  function saveEditKeycap() {
    commitEditKeycapDraft({ keepOpen: false, quiet: false });
  }

  /** Ensure Soft Pad can fire: pad routes need a matching agentBindings key row. */
  function ensureAgentKeyBinding(m, slotId) {
    var id = String(slotId || '').trim();
    if (!m || !id) return;
    if (isCursorCustomSlotId(id)) {
      var cs = findCustomShortcut(m.codexMicroPad, id);
      if (cs) upsertCustomShortcutBindings(m, cs);
      return;
    }
    var A = agent();
    if (!A || !A.slotById) return;
    var slot = A.slotById(id);
    if (!slot) return;
    if (!Array.isArray(m.agentBindings)) m.agentBindings = [];
    var chord = A.defaultKeyForMapping
      ? A.defaultKeyForMapping(m, id)
      : (A.defaultKeyForSlot ? A.defaultKeyForSlot(id) : '');
    var found = null;
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (b && b.slotId === id && String(b.triggerType || '') === 'key') {
        found = b;
        break;
      }
    }
    if (found) {
      found.actionId = slot.actionId;
      found.enabled = true;
      if (!String(found.triggerBinding || '').trim() && chord) {
        found.triggerBinding = chord;
      }
      if (isCursorSoftPadMapping(m)) {
        found.executionMode = 'execute';
      }
      if (
        isCursorSoftPadMapping(m) &&
        id === 'plan' &&
        chord &&
        String(found.triggerBinding || '').replace(/\s+/g, '').toLowerCase() === 'ctrl+alt+p'
      ) {
        found.triggerBinding = chord;
      }
      return;
    }
    var mode = 'execute';
    if (A.actionById) {
      var act = A.actionById(slot.actionId);
      if (act && act.mode) mode = String(act.mode);
    }
    if (isCursorSoftPadMapping(m)) {
      mode = 'execute';
    }
    m.agentBindings.push({
      slotId: id,
      actionId: slot.actionId,
      triggerType: 'key',
      triggerBinding: chord,
      enabled: true,
      executionMode: mode,
      activationScope: 'foregroundApp'
    });
  }

  function upsertRoute(m, pad, microKeyId, patch, opts) {
    opts = opts || {};
    if (!pad.keys) pad.keys = [];
    var route = routeForMicroKey(pad, microKeyId);
    if (!route) {
      route = {
        microKeyId: microKeyId,
        sourceScan: 0,
        sourceExtended: false,
        sourceKey: '',
        slotId: '',
        uiIconId: '',
        enabled: false
      };
      pad.keys.push(route);
    }
    if (patch.sourceScan != null) route.sourceScan = patch.sourceScan;
    if (patch.sourceExtended != null) route.sourceExtended = !!patch.sourceExtended;
    if (patch.sourceKey != null) route.sourceKey = String(patch.sourceKey || '').trim();
    if (route.sourceKey) {
      route.sourceScan = 0;
      route.sourceExtended = false;
    }
    if (patch.slotId != null) route.slotId = patch.slotId;
    if (patch.enabled != null) route.enabled = !!patch.enabled;
    if (patch.uiIconId != null) route.uiIconId = patch.uiIconId;
    if (patch.lightRgb != null) route.lightRgb = String(patch.lightRgb || '').trim();
    if (patch.advanced != null) route.advanced = !!patch.advanced;
    // ENC / JOY / NAV stay screen-only — never auto-fill a physical scan.
    if (microKeyId === 'ENC' || microKeyId === 'JOY' || isNavMicroKey(microKeyId)) {
      if (microKeyId === 'ENC' || isNavMicroKey(microKeyId)) {
        route.sourceScan = 0;
        route.sourceExtended = false;
        route.sourceKey = '';
      }
      if (isNavMicroKey(microKeyId)) route.advanced = true;
    } else if (route.slotId && !route.sourceScan && !route.sourceKey) {
      var def = LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === microKeyId; });
      var suggest = AGENT_NUMPAD_SUGGEST[microKeyId];
      if (def && Number(def.sourceScan) > 0) {
        route.sourceScan = def.sourceScan;
        route.sourceExtended = !!def.sourceExtended;
      } else if (suggest) {
        route.sourceScan = suggest.sourceScan;
        route.sourceExtended = !!suggest.sourceExtended;
      }
    }
    if (!route.uiIconId) route.uiIconId = DEFAULT_ICON_BY_MICRO[microKeyId] || '';
    if (opts.skipPersist) return;
    // Soft Pad: quiet layout IPC (includes keys). Modal/manager keeps full persist().
    if (softPadPanelActive()) persistLayout(m);
    else persist();
  }

  var padBindPending = null;

  function stopPadBindSession() {
    var pending = padBindPending;
    padBindPending = null;
    var Rec = global.OneToneMappingRecording;
    if (Rec && Rec.mode && Rec.mode() === 'padBind' && Rec.setMode) Rec.setMode('none');
    if (Rec && Rec.invokeStop) Rec.invokeStop();
    var probe = global.OneToneRecordProbe;
    if (probe && probe.setRecording) probe.setRecording(false);
    return pending;
  }

  function applyPadBindKey(key) {
    var pending = padBindPending;
    if (!pending) return false;
    padBindPending = null;
    var Rec = global.OneToneMappingRecording;
    if (Rec && Rec.invokeStop) Rec.invokeStop();
    var physical = String(key || '').trim();
    var ku = global.OneToneAppKeyUtils;
    var cfg = global.OneToneState && global.OneToneState.state && global.OneToneState.state.config;
    var occupied = !!(ku && ku.effectiveTriggerOccupiesPhysical && ku.effectiveTriggerOccupiesPhysical(cfg, pending.m, physical));
    if (occupied) {
      toast(t('recordPadTriggerOccupied', '这是 01 触发键，不能绑到 SoftPad 格子'));
      if (pending.done) pending.done();
      return true;
    }
    var parsed = parseRecordedNumpad(physical);
    if (parsed) {
      if (findSourceConflict(pending.pad, parsed.scan, parsed.ext, pending.microKeyId)) {
        toast(t('codexMicroPadSourceConflict', '该小键盘键已被占用'));
        if (pending.done) pending.done();
        return true;
      }
      upsertRoute(pending.m, pending.pad, pending.microKeyId, {
        sourceScan: parsed.scan,
        sourceExtended: parsed.ext,
        sourceKey: '',
        enabled: true
      });
      toast(t('codexMicroPadRecordDone', '已绑定小键盘键'));
    } else {
      if (findNamedSourceConflict(pending.pad, physical, pending.microKeyId)) {
        toast(t('codexMicroPadSourceConflict', '该小键盘键已被占用'));
        if (pending.done) pending.done();
        return true;
      }
      upsertRoute(pending.m, pending.pad, pending.microKeyId, {
        sourceKey: physical,
        sourceScan: 0,
        sourceExtended: false,
        enabled: true
      });
      toast(t('codexMicroPadNamedRecordDone', '已绑定 ') + physical);
    }
    if (pending.done) pending.done();
    return true;
  }

  function onPadBindCaptured(key) {
    applyPadBindKey(key);
  }

  function onPadBindRejected(reason, key) {
    if (reason === 'trigger_occupied') {
      toast(t('recordPadTriggerOccupied', '这是 01 触发键，不能绑到 SoftPad 格子'));
    } else if (reason === 'pad_unfriendly_key') {
      toast(t('recordPadUnfriendlyKey', '请用 F13–F24 / 音量 / 侧键 / 小键盘，不要用字母或 Enter'));
    } else {
      toast(t('codexMicroPadRecordInvalid', '请录制小键盘区按键'));
    }
    void key;
  }

  function onPadBindCancelled() {
    padBindPending = null;
  }

  function startRecordNumpad(m, pad, microKeyId, done) {
    if (microKeyId === 'ENC') {
      toast(t('codexMicroPadEncScreenOnly', '总开关默认仅屏幕点击，不占用小键盘 0（说话键）'));
      if (done) done();
      return;
    }
    if (isNavMicroKey(microKeyId)) {
      toast(t('codexMicroPadNavScreenOnly', '屏幕方向键 · 无实体扫码'));
      if (done) done();
      return;
    }
    var Rec = global.OneToneMappingRecording;
    if (Rec && Rec.mode && Rec.mode() !== 'none' && Rec.mode() !== 'padBind') {
      toast(t('codexMicroPadRecordBusy', '请先结束按键录制'));
      if (done) done();
      return;
    }
    stopPadBindSession();
    toast(t('codexMicroPadFolkRecordHint', '按下目标键：F13–F24、音量、侧键或小键盘。把脚踏/旋钮固件设成这些键。'));
    padBindPending = { m: m, pad: pad, microKeyId: microKeyId, done: done || function () {} };
    if (Rec && Rec.setMode) Rec.setMode('padBind');
    var probe = global.OneToneRecordProbe;
    if (probe && probe.setRecording) probe.setRecording(true, 'padBind');
    if (Rec && Rec.invokeStart) Rec.invokeStart(m && m.id, 'padBind');
    setTimeout(function () {
      if (!padBindPending || padBindPending.microKeyId !== microKeyId) return;
      stopPadBindSession();
      toast(t('logTimeout', '录制超时'));
      if (done) done();
    }, 12000);
  }

  function parseRecordedNumpad(key) {
    var m = /^sc([0-9A-Fa-f]{2}):ext([01])$/.exec(String(key || '').trim());
    if (m) return { scan: parseInt(m[1], 16), ext: m[2] === '1' };
    var map = {
      Numpad0: [0x52, false], Numpad1: [0x4F, false], Numpad2: [0x50, false], Numpad3: [0x51, false],
      Numpad4: [0x4B, false], Numpad5: [0x4C, false], Numpad6: [0x4D, false], Numpad7: [0x47, false],
      Numpad8: [0x48, false], Numpad9: [0x49, false], NumpadDecimal: [0x53, false],
      NumpadAdd: [0x4E, false], NumpadSubtract: [0x4A, false], NumpadMultiply: [0x37, false],
      NumpadDivide: [0x35, true], NumpadEnter: [0x1C, true]
    };
    if (map[key]) return { scan: map[key][0], ext: map[key][1] };
    return null;
  }

  function refreshTrigger(m) {
    var host = document.getElementById('codexMicroPadHostTrigger');
    if (host && !host.hidden) renderKeysSoftPadJump(host, m);
  }

  function clearKeysSoftPadHosts() {
    ['codexMicroPadHostTrigger', 'codexMicroPadHostTarget'].forEach(function (id) {
      var host = document.getElementById(id);
      if (host) {
        host.innerHTML = '';
        host.hidden = true;
      }
    });
    clearTriggerHeroPreview();
    stopReadinessPoll();
  }

  function renderKeysSoftPadJump(host, m) {
    if (!host) return;
    if (!m) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    var eligible = global.OneToneSoftPadHub && global.OneToneSoftPadHub.isSoftPadSchemeEligible
      ? global.OneToneSoftPadHub.isSoftPadSchemeEligible(m)
      : !!(m.codexMicroPad || String(m.appTargetId || '') === 'codex-chat' || String(m.appTargetId || '') === 'claude-code');
    if (!eligible) {
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    host.hidden = false;
    host.innerHTML =
      '<div class="codex-micro-pad codex-micro-pad--keys-jump">' +
      '<p class="codex-micro-pad__cta-sub">' +
      esc(t('codexMicroPadKeysJumpHint', '虚拟键盘已移至独立目录统一管理')) +
      '</p>' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-act="manage">' +
      esc(t('codexMicroPadManageInSoftPad', '在虚拟键盘中管理')) +
      '</button></div>';
    var manageBtn = host.querySelector('[data-act="manage"]');
    if (manageBtn) {
      manageBtn.addEventListener('click', function () {
        var drawer = global.OneToneSettingsDrawer;
        if (drawer && drawer.setPanel) {
          drawer.setPanel('softPad', { mappingId: m && m.id ? String(m.id) : '' });
        } else if (drawer && drawer.open) {
          drawer.open({ panel: 'softPad', mappingId: m && m.id ? String(m.id) : '' });
        } else {
          openPadManager(m);
        }
      });
    }
  }

  function mount(step, m) {
    var triggerHost = document.getElementById('codexMicroPadHostTrigger');
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    if (!m) {
      clearKeysSoftPadHosts();
      return;
    }
    // Soft Pad big preview lives on 虚拟键盘 page — Keys only shows a jump CTA.
    if (step === 'trigger') {
      if (targetHost) { targetHost.innerHTML = ''; targetHost.hidden = true; }
      renderKeysSoftPadJump(triggerHost, m);
    } else if (step === 'target') {
      if (triggerHost) { triggerHost.innerHTML = ''; triggerHost.hidden = true; }
      renderKeysSoftPadJump(targetHost, m);
    } else {
      clearKeysSoftPadHosts();
    }
  }

  function ensureHosts(step, m) {
    if (step === 'trigger') {
      var triggerRow = document.getElementById('habitKeyMapRowTrigger');
      var anchor = triggerRow && triggerRow.querySelector('.keys-trigger-modes-block');
      if (anchor && anchor.parentNode) {
        var host = document.getElementById('codexMicroPadHostTrigger');
        if (!host) {
          host = document.createElement('div');
          host.id = 'codexMicroPadHostTrigger';
          host.className = 'codex-micro-pad-host';
          anchor.parentNode.insertBefore(host, anchor);
        }
      }
    }
    if (step === 'target') {
      var th = document.getElementById('codexMicroPadHostTarget');
      if (!th) {
        th = document.createElement('div');
        th.id = 'codexMicroPadHostTarget';
        th.className = 'codex-micro-pad-host';
        var targetRow = document.getElementById('habitKeyMapRowTarget');
        var stepBody = targetRow && targetRow.querySelector('.keys-step-body');
        var capHost = document.getElementById('codexCapHostTarget');
        var parent = (capHost && capHost.parentNode)
          || stepBody
          || targetRow;
        if (parent) {
          if (capHost && capHost.parentNode === parent) parent.insertBefore(th, capHost);
          else parent.appendChild(th);
        }
      }
    }
    mount(step, m);
  }

  function applyPressedClass(microId) {
    document.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
      var on = el.getAttribute('data-micro-key') === microId;
      el.classList.toggle('is-pressed', on);
      el.classList.toggle('is-active', on);
    });
  }

  function onPadKeyEvent(payload) {
    if (!payload) return;
    var microId = String(payload.microKeyId || '').trim();
    if (!microId && payload.sourceId) {
      var m0 = global.OneToneAgentCapabilityUi && global.OneToneAgentCapabilityUi.activeCodexMapping
        ? global.OneToneAgentCapabilityUi.activeCodexMapping()
        : null;
      if (m0 && m0.codexMicroPad) {
        var m2 = /^sc([0-9A-Fa-f]{2}):ext([01])$/.exec(String(payload.sourceId || ''));
        if (m2) {
          var route = routeBySource(m0.codexMicroPad, parseInt(m2[1], 16), m2[2] === '1');
          if (route) microId = route.microKeyId;
        }
      }
    }
    if (!microId) return;
    var mFb = global.OneToneAgentCapabilityUi && global.OneToneAgentCapabilityUi.activeCodexMapping
      ? global.OneToneAgentCapabilityUi.activeCodexMapping()
      : null;
    if (padUiMode === 'try' && payload.phase !== 'up') {
      if (mFb) noteTryRecognized(mFb, microId, null);
    } else if (payload.phase !== 'up' && (padUiMode === 'config' || padUiMode === 'preview' || padUiMode === 'edit')) {
      if (mFb) noteTryRecognized(mFb, microId, null);
    }
    // Physical PTT / fire feedback (hardware path already ran; sync five-state lights).
    if (microId === 'ACT10') {
      if (payload.phase === 'up') setPadRunStatus('done', microId);
      else setPadRunStatus('listening', microId);
    } else if (payload.phase !== 'up' && padUiMode === 'run') {
      setPadRunStatus('running', microId);
    }
    if (payload.phase === 'up') {
      activeHighlightId = '';
      applyPressedClass('');
      return;
    }
    activeHighlightId = microId;
    applyPressedClass(microId);
    setTimeout(function () {
      if (activeHighlightId === microId) {
        activeHighlightId = '';
        applyPressedClass('');
      }
    }, 280);
  }

  function onPadReady(payload) {
    var Cap = global.OneToneAgentCapabilityUi;
    var mid = payload && (payload.mappingId || payload.mapping_id);
    var m = mid ? findMappingById(mid) : null;
    if (!m && Cap && Cap.activeCodexMapping) m = Cap.activeCodexMapping();
    // Only apply ensure payload onto the mapping it healed — Cursor heal must not
    // overwrite Codex FE pad (that desync stopped Soft Pad auto-show after Plan edits).
    if (payload && m) {
      var payloadMid = String(mid || '').trim();
      if (!payloadMid || String(m.id) === payloadMid) {
        applyEnsurePayloadToMapping(m, payload);
      }
    }
    if (payload && payload.readiness) lastReadiness = payload.readiness;
    var host = document.getElementById('codexMicroPadHostTarget');
    if (host && m && !host.hidden) {
      // Never nest ensure_ready from its own ready event (toggle / heal 假死 loop).
      renderTarget(host, m, { skipEnsure: true });
    } else if (m) {
      notifyLinkedUi(m);
    }
  }

  function onOverlayDismissed() {
    // Soft dismiss is session-only on the BE now — do not flip overlayEnabled in config.
    // Refresh Soft Pad chrome if open so status text stays honest.
    if (!keysPanelActive() && !isPadManagerOpen() && !softPadPanelActive()) return;
    var Cap = global.OneToneAgentCapabilityUi;
    var cur = Cap && Cap.activeCodexMapping ? Cap.activeCodexMapping() : null;
    if (cur) notifyLinkedUi(cur);
  }

  global.OneToneCodexMicroPadUi = {
    ensurePad: ensurePad,
    applyLayoutProfile: applyLayoutProfile,
    applyNumpadControllerStandard: applyNumpadControllerStandard,
    exportLayoutJson: exportLayoutJson,
    importLayoutJson: importLayoutJson,
    healEncScreenOnly: healEncScreenOnly,
    isPrimaryMapped: isPrimaryMapped,
    isScreenOnly: isScreenOnly,
    isAdvancedOnly: isAdvancedOnly,
    setPadRunStatus: setPadRunStatus,
    getPadRunStatus: function () {
      return { status: padRunStatus, microKeyId: padRunMicroKeyId };
    },
    statusSourceLabel: statusSourceLabel,
    statusSourceLabelFor: statusSourceLabelFor,
    agentDisplayLabel: agentDisplayLabel,
    PAD_STATUS_MS: PAD_STATUS_MS,
    JOY_DIR_MS: JOY_DIR_MS,
    enterJoyDirectionMode: enterJoyDirectionMode,
    exitJoyDirectionMode: exitJoyDirectionMode,
    isJoyDirectionActive: isJoyDirectionActive,
    protectPrimaryLayout: protectPrimaryLayout,
    PRIMARY_MICRO_IDS: PRIMARY_MICRO_IDS,
    mount: mount,
    ensureHosts: ensureHosts,
    refreshTrigger: refreshTrigger,
    onPadKeyEvent: onPadKeyEvent,
    onPadBindCaptured: onPadBindCaptured,
    onPadBindRejected: onPadBindRejected,
    onPadBindCancelled: onPadBindCancelled,
    onPadReady: onPadReady,
    onOverlayDismissed: onOverlayDismissed,
    onCapabilitySelected: onCapabilitySelected,
    routeForSlot: routeForSlot,
    badgeForSlot: badgeForSlot,
    ensurePad: ensurePad,
    listPadMappings: listPadMappings,
    openEditKeycap: openEditKeycap,
    closeEditKeycap: closeEditKeycap,
    isEditKeycapOpen: isEditKeycapOpen,
    renderEditKeycapEditor: renderEditKeycapEditor,
    openPadManager: openPadManager,
    renderCodexMicroPadManager: renderCodexMicroPadManager,
    renderSoftPadPreview: renderSoftPadPreview,
    paintSoftPadPadModePreview: paintSoftPadPadModePreview,
    renderHeroPadPreviewGrid: renderHeroPadPreviewGrid,
    resolveSoftPadPreviewPaintHost: resolveSoftPadPreviewPaintHost,
    renderSoftPadLayoutPanel: renderSoftPadLayoutPanel,
    renderSoftPadPresentationPanel: renderSoftPadPresentationPanel,
    renderSoftPadDisplayPanel: renderSoftPadDisplayPanel,
    renderSoftPadStylePanel: renderSoftPadStylePanel,
    getSoftPadStyleSubtab: getSoftPadStyleSubtab,
    setSoftPadStyleSubtab: setSoftPadStyleSubtab,
    renderSoftPadRuntimePanel: renderSoftPadRuntimePanel,
    renderSoftPadPurposePanel: renderSoftPadPurposePanel,
    renderSoftPadAgentPanel: renderSoftPadAgentPanel,
    getSoftPadLayoutFocusKeyId: getSoftPadLayoutFocusKeyId,
    openBrowseSheet: openBrowseSheet,
    renderAgentWorkbench: renderAgentWorkbench,
    getSoftPadWorkbenchTab: getSoftPadWorkbenchTab,
    setSoftPadWorkbenchTab: setSoftPadWorkbenchTab,
    patchAgentWorkbench: patchAgentWorkbench,
    agentLightEnabledOnPad: agentLightEnabledOnPad,
    getSoftPadLightsSubtab: getSoftPadLightsSubtab,
    renderLightsAmbientTab: renderLightsAmbientTab,
    renderLightsKeysTab: renderLightsKeysTab,
    renderTopbarLightsPanel: renderTopbarLightsPanel,
    resolveLightsPanelMode: resolveLightsPanelMode,
    syncStatusLightsPreviewChrome: syncStatusLightsPreviewChrome,
    clearStatusLightsPreviewChrome: clearStatusLightsPreviewChrome,
    workbenchPreviewOpts: workbenchPreviewOpts,
    patchAgentLeftDataStrip: patchAgentLeftDataStrip,
    patchAgentMiniBarPreviewPill: patchAgentMiniBarPreviewPill,
    patchAgentMiniPillCopy: patchAgentMiniPillCopy,
    patchAgentDataLive: patchAgentDataLive,
    TOPBAR_LIGHT_CANDIDATES: TOPBAR_LIGHT_CANDIDATES,
    TOPBAR_QUOTA_CANDIDATES: TOPBAR_QUOTA_CANDIDATES,
    resolveSoftPadSubpagePaintHost: resolveSoftPadSubpagePaintHost,
    mirrorSoftPadSubpageChrome: mirrorSoftPadSubpageChrome,
    resolveSoftPadShowMode: resolveSoftPadShowMode,
    softPadShowModeLabel: softPadShowModeLabel,
    applySoftPadShowMode: applySoftPadShowMode,
    syncSoftPadShowModeChrome: syncSoftPadShowModeChrome,
    closePadManager: closePadManager,
    isPadManagerOpen: isPadManagerOpen,
    notifyLinkedUi: notifyLinkedUi,
    stopBackgroundWork: stopReadinessPoll,
    renderHardwarePad: renderHardwarePad,
    softPadLayoutKeyMeta: softPadLayoutKeyMeta,
    bindSoftPadPreviewCaption: bindSoftPadPreviewCaption,
    applyTriggerHeroPreview: applyTriggerHeroPreview,
    clearTriggerHeroPreview: clearTriggerHeroPreview,
    LAYOUT: LAYOUT,
    PAD_SKINS: PAD_SKINS,
    PAD_SKIN_CHOICES: PAD_SKIN_CHOICES,
    normalizePadSkin: normalizePadSkin,
    canonicalizePadSkin: canonicalizePadSkin,
    resolveEffectivePadSkin: resolveEffectivePadSkin,
    navKeysOn: navKeysOn,
    visibleSoftPadCells: visibleSoftPadCells,
    compactCellWithoutNav: compactCellWithoutNav,
    softLikelyNoNumpad: softLikelyNoNumpad,
    renderNavArrowDemoHtml: renderNavArrowDemoHtml,
    CODEX_SOFT_PAD_SLOT_IDS: CODEX_SOFT_PAD_SLOT_IDS,
    CURSOR_SOFT_PAD_SLOT_IDS: CURSOR_SOFT_PAD_SLOT_IDS,
    VSCODE_SOFT_PAD_SLOT_IDS: VSCODE_SOFT_PAD_SLOT_IDS,
    CURSOR_SLOT_GROUPS: CURSOR_SLOT_GROUPS,
    CURSOR_COMMON_DEFAULT_SLOTS: CURSOR_COMMON_DEFAULT_SLOTS,
    isCursorCustomSlotId: isCursorCustomSlotId,
    createCustomShortcut: createCustomShortcut,
    collectSoftPadOtherChannelRows: collectSoftPadOtherChannelRows,
    SLOT_DEFAULT_ICON: SLOT_DEFAULT_ICON,
    SLOT_WEAK_LEGACY_ICON: SLOT_WEAK_LEGACY_ICON,
    ICON_SVG: ICON_SVG,
    allSlotOptions: allSlotOptions,
    slotOptionsGrouped: slotOptionsGrouped,
    slotEffectTip: slotEffectTip,
    slotSourceTag: slotSourceTag,
    capabilityCardCopy: capabilityCardCopy,
    iconEffectTip: iconEffectTip,
    iconIdForCapabilitySlot: iconIdForCapabilitySlot,
    resolveOpenEditIconState: resolveOpenEditIconState,
    maybeAutoSuggestIcon: maybeAutoSuggestIcon,
    humanMicroKeyLabel: humanMicroKeyLabel,
    isCodexSoftPadMapping: isCodexSoftPadMapping,
    cellByMicroId: cellByMicroId,
    resolveStatusLightMicroKeyId: resolveStatusLightMicroKeyId,
    resolveClaudeMainLightMicroKeyId: resolveClaudeMainLightMicroKeyId,
    assignClaudeAgentLightHosts: assignClaudeAgentLightHosts,
    shortAgentType: shortAgentType,
    CLAUDE_MAIN_KEY: CLAUDE_MAIN_KEY,
    CLAUDE_AG_POOL: CLAUDE_AG_POOL,
    ICON_DEFS: ICON_DEFS,
    DEFAULT_ICON_BY_MICRO: DEFAULT_ICON_BY_MICRO,
    sourceId: sourceId,
    scanLabel: scanLabel,
    chordForSlot: chordForSlot,
    slotSubForDisplay: slotSubForDisplay,
    displayActionForSlot: displayActionForSlot,
    isHoldMicroKey: isHoldMicroKey,
    getLayoutChannelTab: function () {
      return normalizeLayoutChannelTab(layoutChannelTab);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
