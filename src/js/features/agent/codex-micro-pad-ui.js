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
      { microKeyId: 'AG00', sourceScan: 0x47, sourceExtended: false, slotId: 'commandPalette', uiIconId: 'palette' },
      { microKeyId: 'AG01', sourceScan: 0x48, sourceExtended: false, slotId: 'newThread', uiIconId: 'fork' },
      { microKeyId: 'AG02', sourceScan: 0x49, sourceExtended: false, slotId: 'quickChat', uiIconId: 'fast' },
      { microKeyId: 'AG03', sourceScan: 0x4B, sourceExtended: false, slotId: 'quickSearch', uiIconId: 'search' },
      { microKeyId: 'AG04', sourceScan: 0x4C, sourceExtended: false, slotId: 'stopOrSend', uiIconId: 'send' },
      { microKeyId: 'AG05', sourceScan: 0x4D, sourceExtended: false, slotId: 'cancel', uiIconId: 'reject' },
      { microKeyId: 'ACT06', sourceScan: 0x37, sourceExtended: false, slotId: 'quickChat', uiIconId: 'fast' },
      { microKeyId: 'ACT07', sourceScan: 0x35, sourceExtended: true, slotId: 'commandPalette', uiIconId: 'palette' },
      { microKeyId: 'ACT08', sourceScan: 0x4A, sourceExtended: false, slotId: 'cancel', uiIconId: 'reject' },
      { microKeyId: 'ACT09', sourceScan: 0x4F, sourceExtended: false, slotId: 'newThread', uiIconId: 'fork' },
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
    focusBrowserAddressBar: 1
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
    cancel: 1,
    undo: 1,
    toggleSidebar: 1,
    openSettings: 1,
    navBack: 1,
    navForward: 1,
    openTerminal: 1,
    newBrowserTab: 1,
    plan: 1,
    switchAgent: 1
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
    newBrowserTab: 1
  };

  /** Default keycap icon when a capability is selected (beginner auto-suggest). */
  var SLOT_DEFAULT_ICON = {
    summonCodex: 'focus',
    commandPalette: 'palette',
    newThread: 'fork',
    quickChat: 'fast',
    quickSearch: 'search',
    pushToTalk: 'mic',
    stopOrSend: 'send',
    cancel: 'reject',
    undo: 'undo',
    openReviewTab: 'review',
    toggleReviewPanel: 'review',
    toggleSidebar: 'folder',
    openSettings: 'status',
    navBack: 'navLeft',
    navForward: 'navRight',
    openTerminal: 'terminal',
    toggleBrowserPanel: 'browser',
    newBrowserTab: 'browserPlus',
    focusBrowserAddressBar: 'search',
    plan: 'plan',
    switchAgent: 'agent'
  };

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
    ACT06: 'fast',
    ACT07: 'palette',
    ACT08: 'reject',
    ACT09: 'fork',
    UNDO: 'undo',
    SEARCH: 'search',
    ACT10: 'mic',
    ACT12: 'send',
    AG00: 'palette',
    AG01: 'fork',
    AG02: 'fast',
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
    { id: 'new', label: 'NEW' },
    { id: 'power', label: 'PWR' },
    { id: 'focus', label: 'FOCUS' },
    { id: 'navUp', label: 'UP' },
    { id: 'navDown', label: 'DOWN' },
    { id: 'navLeft', label: 'LEFT' },
    { id: 'navRight', label: 'RIGHT' },
    { id: 'codex', label: 'CODEX' },
    { id: 'palette', label: 'CMD' },
    { id: 'status', label: 'STATUS' },
    { id: 'plan', label: 'PLAN' },
    { id: 'review', label: 'REVIEW' },
    { id: 'trash', label: 'TRASH' },
    { id: 'folder', label: 'FOLDER' },
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
    new: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    /* Mode toggle — same stroke language as search icon. */
    power: '<svg viewBox="0 0 24 24"><path d="M12 2v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/></svg>',
    focus: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M4 12h4M16 12h4M12 4v4M12 16v4"/></svg>',
    codex: '<svg viewBox="0 0 24 24"><path d="M12 3l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>',
    status: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>',
    review: '<svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>',
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
      openEditKeycap(m, id);
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
        : undefined
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
    if (cur) return cur;
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
          uiIconId: npadEnter.uiIconId || 'palette'
        }));
      } else {
        var a7 = out[a7Idx];
        if (!String(a7.slotId || '').trim() && npadEnter.slotId) {
          a7.slotId = npadEnter.slotId;
          a7.enabled = npadEnter.enabled !== false;
          if (!a7.uiIconId) a7.uiIconId = 'palette';
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
    if (global.OneToneKeysPanelUi && global.OneToneKeysPanelUi.renderKeysHub) {
      try { global.OneToneKeysPanelUi.renderKeysHub(); } catch (_) {}
    }
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
      '<div class="codex-pad-mgr__claude-act" id="codexCursorActivityPad" data-cursor-activity-card="1">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('cursorActivityTitle', 'Cursor 本地活动统计')) + '</p>' +
      '<p class="codex-pad-mgr__hint">' + esc(t('cursorActivityReads', '用于显示：')) + '</p>' +
      '<ul class="codex-pad-mgr__hint">' +
      '<li>✓ ' + esc(t('cursorActivityAllowTurns', '今日对话次数')) + '</li>' +
      '<li>✓ ' + esc(t('cursorActivityAllowSessions', 'Agent 会话数量')) + '</li>' +
      '<li>✓ ' + esc(t('cursorActivityAllowTime', '使用活跃时间')) + '</li>' +
      '</ul>' +
      '<p class="codex-pad-mgr__hint">' + esc(t('cursorActivityDenies', '不会读取：')) + '</p>' +
      '<ul class="codex-pad-mgr__hint">' +
      '<li>× ' + esc(t('cursorActivityDenyLogin', '登录信息')) + '</li>' +
      '<li>× Token</li><li>× Cookie</li>' +
      '<li>× ' + esc(t('cursorActivityDenyText', '对话内容')) + '</li>' +
      '</ul>' +
      '<div class="codex-pad-mgr__claude-act-actions">' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="cursor-activity-enable">' +
      esc(t('cursorActivityEnable', '启用')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn is-primary" data-act="cursor-activity-disable" hidden>' +
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
    var focusMap = '';
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && Hub.resolveSoftPadEntry) {
        var entry = Hub.resolveSoftPadEntry();
        if (entry && entry.mapping) focusMap = String(entry.mapping.id);
      }
    } catch (_) {}
    var enabled = TOPBAR_LIGHT_CANDIDATES.filter(function (c) {
      return agentLightEnabledOnPad(pad, c.agent);
    });
    var habitIds = topbarHabitIdsOnPad(pad);
    return enabled.map(function (c) {
      var focused = focus && c.agent === focus;
      return (
        '<button type="button" class="soft-pad-agent-bar__chip soft-pad-agent-bar__chip--preview' +
        (focused ? ' is-focused' : '') + '" ' +
        'data-act="topbar-jump" data-agent="' + esc(c.agent) + '" data-status="idle"' +
        (focused ? ' aria-current="true"' : '') + '>' +
        '<img src="' + esc(agentLightIconSrc(c.agent)) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
        '<i class="soft-pad-agent-bar__dot" aria-hidden="true"></i></button>'
      );
    }).concat(habitIds.map(function (hid) {
      var focused = focusMap && String(hid) === focusMap;
      return (
        '<button type="button" class="soft-pad-agent-bar__chip soft-pad-agent-bar__chip--preview' +
        (focused ? ' is-focused' : '') + '" ' +
        'data-act="topbar-jump" data-habit-id="' + esc(hid) + '" data-status="idle"' +
        (focused ? ' aria-current="true"' : '') + '>' +
        '<img src="' + esc(habitIconForMappingId(hid)) + '" alt="" width="16" height="16" decoding="async" aria-hidden="true">' +
        '<i class="soft-pad-agent-bar__dot" aria-hidden="true"></i></button>'
      );
    })).join('');
  }

  /** In-face chrome: scope title + optional status-light strip (matches live overlay). */
  function renderPadFaceTopChrome(m, pad, opts) {
    opts = opts || {};
    var title = softPadPreviewMainTitle(m);
    var chips = buildTopbarPreviewChipsHtml(pad, opts);
    var bar = chips
      ? ('<div class="soft-pad-agent-bar soft-pad-agent-bar--preview soft-pad-agent-bar--face" role="presentation">' +
        chips + '</div>')
      : '';
    return (
      '<div class="micro-hw__face-top">' +
      '<span class="micro-hw__face-title">' + esc(title) + '</span>' +
      bar +
      '</div>'
    );
  }

  function agentLightIconSrc(agent) {
    agent = String(agent || '').toLowerCase();
    if (agent === 'copilotcli' || agent === 'copilot') {
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
            : agent === 'copilotcli' || agent === 'copilot' ? 'copilot-cli'
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
    return (
      '<div class="soft-pad-agent-light-row" data-agent-light-row="' + esc(agent) + '">' +
      '<span class="soft-pad-agent-light-row__chip" data-agent="' + esc(agent) + '" data-status="idle">' +
      '<img src="' + esc(icon) + '" alt="" width="16" height="16" aria-hidden="true">' +
      '<i class="soft-pad-agent-light-row__dot" aria-hidden="true"></i>' +
      '</span>' +
      '<span class="soft-pad-agent-light-row__name">' + esc(label) + '</span>' +
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

  function renderTopbarLightsPanel(pad) {
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
    return (
      '<article class="soft-pad-topbar-lights-card" data-topbar-lights-panel="1">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadTopbarMonitorTitle', '顶栏监视')) + '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadTopbarMonitorLead',
        '跨应用显示忙闲；点条目可跳转习惯。只读观察，不是钉主控（主控始终 Auto）。切换「通用」习惯不会关掉 Soft Pad 键位。')) +
      '</p>' +
      '<div class="soft-pad-topbar-light-active-list" role="list" aria-live="polite">' + activeHtml + '</div>' +
      '<p class="codex-pad-mgr__label" data-topbar-quota-lbl' +
      (pendingQuotaKeyProvider ? '' : ' hidden') + '>' +
      esc(t('softPadTopbarQuotaLbl', 'API 额度候补')) + '</p>' +
      '<div class="soft-pad-topbar-light-active-list" data-topbar-quota-list role="list"></div>' +
      renderQuotaKeyCardHtml() +
      addHtml +
      '<p class="codex-pad-mgr__hint soft-pad-agent-light-legend">' +
      esc(t('softPadAgentLightsLegend',
        '灰=空闲 · 蓝=忙 · 琥珀=等你 · 绿=完成 · 红=失败')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint soft-pad-agent-light-matrix">' +
      esc(t('softPadAgentLightsMatrix',
        '精度：Cursor/Claude/Codex 高（Hook/活动）；Trae Work 高（本地活跃度）；WorkBuddy/Trae Code/Qoder 高（仅 Hook，禁止进程假闪）；MiniMax 常亮额度灯（无运动）；Cline/OpenCode/Aider 中（仅 Hook）。')) +
      '</p>' +
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
    var chips = buildTopbarPreviewChipsHtml(pad, { focusAgent: focus, focusMap: focusMap });
    return (
      '<div class="soft-pad-lights-topbar-preview" data-lights-topbar-preview="1">' +
      '<p class="soft-pad-lights-topbar-preview__label">' +
      esc(t('softPadTopbarPreviewLbl', '顶栏预览')) + '</p>' +
      '<div class="soft-pad-agent-bar soft-pad-agent-bar--preview" role="presentation">' +
      (chips || ('<span class="soft-pad-lights-topbar-preview__empty">' +
        esc(t('softPadTopbarPreviewEmpty', '未添加')) + '</span>')) +
      '</div></div>'
    );
  }

  function paintTopbarPreviewChipStatus(root, agent, status) {
    if (!root) return;
    var strip = root.querySelector('[data-lights-topbar-preview]');
    if (!strip) return;
    var chip = strip.querySelector('.soft-pad-agent-bar__chip[data-agent="' + agent + '"]');
    if (chip) chip.setAttribute('data-status', status || 'idle');
  }

  function renderAgentLightsPicker(m, pad) {
    var anyOn = AGENT_LIGHT_SPECS.some(function (spec) {
      return agentLightEnabledOnPad(pad, spec.agent);
    });
    var sessionsNote = String((pad && pad.purpose) || '') === 'sessions'
      ? t('softPadLightsSessionsNote', '混排导航：仅配置的 AG 会话槽显示 Lane 角标；Claude 子代理只做角点装饰。')
      : t('softPadLightsShortcutsNote', 'AG 仍是动作键。顶栏灯只控显示；导航槽需在「更多」里启用。');
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
    return (
      '<article class="soft-pad-more-card" data-agent-lights-picker="1">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadAgentLightsTitle', '顶栏状态灯')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadAgentLightsLead',
        '对照 Soft Pad 顶栏状态灯：开关决定谁显示忙闲。灯≠按下动作。')) +
      '</p>' +
      '<div class="soft-pad-agent-light-list" role="group" aria-label="' +
      esc(t('softPadAgentLightsTitle', '顶栏状态灯')) + '" aria-live="polite">' +
      AGENT_LIGHT_SPECS.map(function (spec) {
        return renderAgentLightRow(spec.agent, spec.label, pad);
      }).join('') +
      '</div>' +
      '<p class="codex-pad-mgr__hint soft-pad-agent-light-legend">' +
      esc(t('softPadAgentLightsLegend',
        '灰=空闲 · 蓝=忙 · 琥珀=等你 · 绿=完成 · 红=失败')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint soft-pad-agent-light-matrix">' +
      esc(t('softPadAgentLightsMatrix',
        '精度：Cursor/Claude/Codex 高（Hook/活动）；Trae Work 高（本地活跃度）；WorkBuddy/Trae Code/Qoder 高（仅 Hook，禁止进程假闪）；MiniMax 常亮额度灯（无运动）；Cline/OpenCode/Aider 中（仅 Hook）。')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint" data-agent-lights-empty' + (anyOn ? ' hidden' : '') + '>' +
      esc(t('softPadAgentLightsEmpty',
        '至少打开一个 Agent 灯，才会在 Soft Pad 顶栏看到忙闲。')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint">' + esc(sessionsNote) + '</p>' +
      '<p class="codex-pad-mgr__hint is-error" data-agent-lights-error hidden></p>' +
      lab +
      '</article>'
    );
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
          'Cursor 仅支持动作键。AG 保持你的快捷动作；顶栏灯只显示忙闲，不能开会话槽。ACT/NAV/ENC 不变。');
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
    return (
      '<article class="soft-pad-more-card soft-pad-purpose-card" data-soft-pad-purpose-card="1">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadPurposeLbl', 'AG 键做什么')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint soft-pad-purpose-explain">' +
      esc(explain) +
      '</p>' +
      navActive +
      '<div class="pref-segmented is-wide" role="group" aria-label="' +
      esc(t('softPadPurposeAria', 'AG 键做什么')) + '">' +
      btn('shortcuts', t('softPadPurposeShortcuts', '动作键')) +
      (sessionsAllowed ? btn('sessions', sessionsLbl) : '') +
      '</div></article>'
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
    }
    var Hub = global.OneToneSoftPadHub;
    persistPadPurposeAndSlots(mappingId, purpose, purpose === 'sessions' ? recommended : [])
      .then(function () {
        try {
          if (Hub && typeof Hub.schedulePreviewPaint === 'function') {
            Hub.schedulePreviewPaint(Hub.resolveSoftPadEntry && Hub.resolveSoftPadEntry());
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

  var agentLightsHookCache = { claude: null, cursor: null, workbuddy: null, traeCode: null, qoder: null };

  function shellHookConnectNeeded(kind, st) {
    kind = String(kind || '').toLowerCase();
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
      root.querySelector('[data-agent-lights-picker]') ||
      (root.getAttribute && root.getAttribute('data-topbar-lights-panel') ? root : null);
    var scope = panel || root;
    var empty = scope.querySelector('[data-topbar-lights-empty]') ||
      scope.querySelector('[data-agent-lights-empty]');
    if (empty) {
      var any = TOPBAR_LIGHT_CANDIDATES.some(function (spec) {
        return agentLightEnabledOnPad(pad, spec.agent);
      });
      empty.hidden = !!any;
    }
    function paintFromCache(attn) {
      attn = attn || {};
      var claude = agentLightsHookCache.claude || {};
      var cursor = agentLightsHookCache.cursor || {};
      function stateFor(kind) {
        kind = String(kind || '');
        var kindLow = kind.toLowerCase();
        if (!agentLightEnabledOnPad(pad, kind)) return 'idle';
        var rows = attn.rows || attn.agents || [];
        var i;
        for (i = 0; i < rows.length; i++) {
          var r = rows[i];
          if (!r) continue;
          var a = String(r.agent || r.kind || '').toLowerCase();
          if (a === kindLow || a === kind) {
            var st = String(r.state || r.status || 'idle').toLowerCase();
            if (st === 'working') return 'running';
            if (st === 'needs_input' || st === 'needsinput') return 'needs_input';
            if (st === 'complete' || st === 'done') return 'done';
            if (st === 'error' || st === 'failed') return 'failed';
            return st || 'idle';
          }
        }
        return 'idle';
      }
      var claudePhase = String(
        claude.panelPhase || claude.panel_phase || claude.installPhase || claude.phase || ''
      ).toLowerCase();
      var claudeKnown = !!agentLightsHookCache.claude;
      var cursorKnown = !!agentLightsHookCache.cursor;
      var claudeNeed = claudeKnown && (
        claudePhase === 'not_installed' || claudePhase === 'offline' ||
        claudePhase === 'not-installed' || claudePhase === ''
      );
      var cursorReady = !!(cursor.tokenOk || cursor.token_ok || cursor.probeOk || cursor.probe_ok);
      var cursorNeed = cursorKnown && !cursorReady;
      paintAgentLightRowStatus(root, 'codex', stateFor('codex'), false, '');
      paintTopbarPreviewChipStatus(root, 'codex', stateFor('codex'));
      paintAgentLightRowStatus(
        root,
        'claude',
        stateFor('claude'),
        claudeNeed,
        t('softPadClaudeConnect', '连接 Claude（写入 hooks）')
      );
      paintTopbarPreviewChipStatus(root, 'claude', stateFor('claude'));
      paintAgentLightRowStatus(
        root,
        'cursor',
        stateFor('cursor'),
        cursorNeed,
        t('softPadCursorConnect', '复制 Cursor Hook 配置')
      );
      paintTopbarPreviewChipStatus(root, 'cursor', stateFor('cursor'));
      ['workbuddy', 'traeCode', 'qoder'].forEach(function (kind) {
        var st = agentLightsHookCache[kind] || {};
        var known = !!agentLightsHookCache[kind];
        var need = known && shellHookConnectNeeded(kind, st);
        var label = t('softPadShellHookInstall', '接入');
        paintAgentLightRowStatus(root, kind, stateFor(kind), need, label);
        paintTopbarPreviewChipStatus(root, kind, stateFor(kind));
        patchStatusLightsConnectRow(root, kind, need, label);
      });
      paintAgentLightRowStatus(root, 'trae', stateFor('trae'), false, '');
      paintTopbarPreviewChipStatus(root, 'trae', stateFor('trae'));
      patchStatusLightsConnectRow(root, 'trae', false, '');
      patchStatusLightsConnectRow(root, 'codex', false, '');
      patchStatusLightsConnectRow(
        root,
        'claude',
        claudeNeed,
        t('softPadClaudeConnect', '连接 Claude（写入 hooks）')
      );
      patchStatusLightsConnectRow(
        root,
        'cursor',
        cursorNeed,
        t('softPadCursorConnect', '复制 Cursor Hook 配置')
      );
    }
    return padInvoke('cmd_agent_attention_snapshot', {}).catch(function () { return null; })
      .then(function (attn) {
        paintFromCache(attn);
        if (!opts.hooks) return { attn: attn };
        var scope = hubSelectedScopeKind();
        var hookTasks = [];
        if (scope === 'claude' || !scope) {
          hookTasks.push(padInvoke('cmd_claude_hook_setup_status', {}).catch(function () { return null; }));
        }
        if (scope === 'cursor' || !scope) {
          hookTasks.push(padInvoke('cmd_cursor_hook_setup_status', {}).catch(function () { return null; }));
        }
        if (SHELL_HOOK_LIGHT_AGENTS[scope]) {
          hookTasks.push(
            padInvoke('cmd_shell_agent_hook_setup_status', { kind: scope }).catch(function () { return null; })
          );
        }
        if (!hookTasks.length) return { attn: attn };
        return Promise.all(hookTasks).then(function (results) {
          var ri = 0;
          if (scope === 'claude' || !scope) {
            if (results[ri]) agentLightsHookCache.claude = results[ri];
            ri++;
          }
          if (scope === 'cursor' || !scope) {
            if (results[ri]) agentLightsHookCache.cursor = results[ri];
            ri++;
          }
          if (SHELL_HOOK_LIGHT_AGENTS[scope] && results[ri]) {
            agentLightsHookCache[scope] = results[ri];
          }
          paintFromCache(attn);
          return { attn: attn };
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
        syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: softPadLightsSubtab });
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
      ? root.querySelectorAll('[data-cursor-activity-card], #codexCursorActivityPad, #softPadCursorActivityCard')
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
    host.querySelectorAll('.micro-hw').forEach(function (el) {
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

  /** Preview key →「改按键」左预览 + 右栏直改表单（不再弹能力列表）。 */
  function softPadPreviewEditKey(m, microKeyId) {
    markSoftPadPreviewFocus(microKeyId);
    var Hub = global.OneToneSoftPadHub;
    if (Hub && typeof Hub.isLandLocked === 'function' && Hub.isLandLocked()) {
      return;
    }
    function openLayoutEditor() {
      paintSoftPadLayoutKeyPreviewForMapping(m, microKeyId);
      openEditKeycap(m, microKeyId, {
        mode: 'inline',
        onSaved: function (mm) {
          paintSoftPadLayoutKeyPreviewForMapping(mm || m, microKeyId);
        }
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
    if (!opts.forceFull && remountSoftPadPreviewShell(host, m)) {
      applySoftPadPendingNav(m);
      return;
    }
    var skin = canonicalizePadSkin(pad && pad.skin);
    host.innerHTML =
      '<div class="codex-micro-pad soft-pad-preview" data-pad-skin="' + esc(skin) + '">' +
      '<div class="codex-micro-pad__head">' +
      '<p class="codex-micro-pad__title">' + esc(softPadPreviewMainTitle(m)) + '</p>' +
      '<span class="codex-micro-pad__status">' +
      esc(on
        ? t('codexMicroPadStatusOn', '已开启 · 已绑定 {n} 个键').replace('{n}', String(n))
        : t('codexMicroPadStatusOff', '已关闭')) +
      '</span></div>' +
      renderHardwarePad(m, pad, { mode: 'softPad' }) +
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
      // Prefill: open keycap editor if possible; else open shared picker.
      if (typeof openEditKeycap === 'function') {
        openEditKeycap(mapping, keyId, { mode: softPadPreviewOnLayout() ? 'inline' : 'modal' });
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

  function softPadLayoutKeyPreviewHtml(m, microKeyId) {
    var id = String(microKeyId || '').trim();
    if (!id || id === 'JOY' || !cellByMicroId(id)) {
      return (
        '<div class="soft-pad-layout-key-preview is-idle" data-soft-pad-layout-preview="1">' +
        '<p class="soft-pad-layout-key-preview__badge">' +
        esc(t('softPadLayoutPreviewBadge', '修改后预览')) + '</p>' +
        '<p class="codex-pad-mgr__hint soft-pad-layout-editor-pending">' +
        esc(t('softPadLayoutPickKey', '点左侧键盘选一个键开始改')) +
        '</p>' +
        '</div>'
      );
    }
    var meta = softPadLayoutKeyMeta(m, id);
    return (
      '<div class="soft-pad-layout-key-preview" data-soft-pad-layout-preview="1"' +
      ' data-preview-key="' + esc(id) + '">' +
      '<p class="soft-pad-layout-key-preview__badge">' +
      esc(t('softPadLayoutPreviewBadge', '修改后预览')) + '</p>' +
      '<div class="soft-pad-layout-key-preview__stage" aria-hidden="true">' +
      '<button type="button" class="micro-hw__key micro-hw__key--' + esc(meta.kind) +
      (meta.bound ? ' is-bound' : '') + ' is-focused soft-pad-layout-key-preview__cap"' +
      ' tabindex="-1" data-micro-key="' + esc(id) + '">' +
      '<span class="micro-hw__icon">' + iconSvg(meta.iconId) + '</span>' +
      '</button>' +
      '</div>' +
      '<p class="soft-pad-layout-key-preview__name">' + esc(meta.name) + '</p>' +
      '<p class="soft-pad-layout-key-preview__chord"' + (meta.chord ? '' : ' hidden') + '>' +
      esc(meta.chord || '') + '</p>' +
      '<p class="soft-pad-layout-key-preview__effect">' + esc(meta.effect) + '</p>' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary"' +
      ' data-act="editLayoutKey" data-micro-key="' + esc(id) + '">' +
      esc(t('softPadLayoutEditKey', '修改这个键')) + '</button>' +
      '</div>'
    );
  }

  function paintSoftPadLayoutKeyPreview(host, m, microKeyId) {
    if (!host || !m) return;
    var target = host.getAttribute && host.getAttribute('data-soft-pad-layout-preview') != null
      ? host
      : (host.querySelector && host.querySelector('[data-soft-pad-layout-preview]'));
    if (!target) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = softPadLayoutKeyPreviewHtml(m, microKeyId);
    var next = wrap.firstChild;
    if (!next || !target.parentNode) return;
    target.parentNode.replaceChild(next, target);
  }

  function paintSoftPadLayoutKeyPreviewForMapping(m, microKeyId) {
    var body = document.getElementById('softPadSubpageBody');
    if (!body || body.getAttribute('data-soft-pad-panel') !== 'layout') return;
    var paint = resolveSoftPadSubpagePaintHost(body) || body;
    paintSoftPadLayoutKeyPreview(paint, m, microKeyId);
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
    container.innerHTML =
      softPadExperienceChrome('layout', m) +
      '<div class="soft-pad-layout-shell">' +
      '<div class="soft-pad-layout-split">' +
      softPadLayoutKeyPreviewHtml(m, focusId) +
      '<div class="soft-pad-layout-editor" data-soft-pad-layout-editor="1" hidden></div>' +
      '</div>' +
      '<details class="soft-pad-layout-actions" data-soft-pad-layout-tools="1">' +
      '<summary class="soft-pad-layout-actions-label">' +
      esc(t('softPadLayoutActionsLbl', '批量操作')) +
      '</summary>' +
      '<div class="codex-pad-mgr__foot soft-pad-layout-foot">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="restore">' +
      esc(t('codexMicroPadRestore', '恢复默认')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="export">' +
      esc(t('codexMicroPadExport', '导出')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="import">' +
      esc(t('codexMicroPadImport', '导入')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn is-danger" data-act="clear">' +
      esc(t('codexMicroPadClear', '清空所有映射')) + '</button>' +
      '<input type="file" accept="application/json,.json" data-act="importFile" hidden />' +
      '</div>' +
      '<p class="codex-pad-mgr__hint soft-pad-layout-clear-hint">' +
      esc(t('softPadLayoutClearHint', '清空只去掉按键能力绑定，不会关闭滚轮/摇杆基础增强。')) +
      '</p>' +
      '</details>' +
      '</div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'layout');
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'layout' }));
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

  function markSoftPadPreviewFocus(microKeyId) {
    var id = String(microKeyId || '').trim();
    if (id === 'JOY') id = '';
    softPadLayoutFocusKeyId = id;
    if (id) previewMicroKeyId = id;
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
    paintSoftPadLayoutKeyPreview(container, m, softPadLayoutFocusKeyId || '');
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

  function syncSoftPadShowModeChrome(body, mode, pad) {
    if (!body) return;
    mode = String(mode || 'follow');
    var hint = body.querySelector('[data-show-mode-hint]');
    if (hint) hint.textContent = softPadShowModeHint(mode);
    body.querySelectorAll('button[data-act="showMode"][data-show-mode]').forEach(function (btn) {
      var on = btn.getAttribute('data-show-mode') === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var scene = body.querySelector('[data-show-scene]');
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

  /** Card 3: inverted-T → Soft Pad (same compare chassis as card 1; Soft Pad uses user skin). */
  function renderNavArrowDemoHtml(pad) {
    pad = pad || {};
    var navOn = navKeysOn(pad);
    var softCells = visibleSoftPadCells(pad);
    var softCols = navOn ? 5 : 4;
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
      renderSoftPadDemoHw(pad, softCells, softCols, { chassis: true }) +
      '</div>' +
      '</div>'
    );
  }

  var softPadPurposeFeatureTab = 'mapping';

  function renderNumpadMapHtml(pad) {
    pad = pad || {};
    var occupied = !!pad.requireNumLockOff;
    var mappingOn = !!pad.enabled;
    var navOn = navKeysOn(pad);
    var on = occupied ? '1' : '0';
    var demoMode = occupied ? 'soft' : 'numpad';
    var mapDisabled = mappingOn ? '' : ' disabled';
    var mapDisabledAttr = mappingOn ? '' : ' aria-disabled="true"';
    var numCells = LAYOUT.numpadCells || [];
    var softCells = visibleSoftPadCells(pad);
    var softCols = navOn ? 5 : 4;
    var tab = softPadPurposeFeatureTab === 'occupy' || softPadPurposeFeatureTab === 'nav'
      ? softPadPurposeFeatureTab
      : 'mapping';
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
      renderSoftPadDemoHw(pad, softCells, softCols, { chassis: true }) +
      '</div>' +
      '</div>' +
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
      '<div class="soft-pad-demo-switch" data-demo-mode="' + demoMode + '" data-numpad-on="' + on + '">' +
      '<div class="soft-pad-demo-switch__modes">' +
      '<span class="soft-pad-demo-switch__mode" data-mode="numpad">' +
      esc(t('codexMicroPadModeNumpad', '数字键模式')) + '</span>' +
      '<span class="soft-pad-demo-switch__mode" data-mode="soft">' +
      esc(t('codexMicroPadModeCodex', 'Soft Pad 模式')) + '</span>' +
      '</div>' +
      '<div class="soft-pad-demo-chassis soft-pad-demo-chassis--switch">' +
      '<div class="soft-pad-demo-switch__stack">' +
      renderNumpadDemoFace(numCells, 'numpad', 4) +
      renderSoftPadDemoHw(pad, softCells, softCols, { chassis: false }) +
      '</div>' +
      '</div>' +
      '<p class="soft-pad-demo-switch__hint">' +
      esc(t('softPadNumpadStep2Hint', '点左上角 ⏻ 总开关：数字键盘 ⇄ Soft Pad')) +
      '</p>' +
      '</div>' +
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
      '<div data-nav-demo-host>' +
      renderNavArrowDemoHtml(pad) +
      '</div>' +
      '</section>' +
      '</div></div>'
    );
  }

  /** Runtime subpage — show mode only; mapping demos live on「用途」. */
  function renderSoftPadRuntimePanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var mode = resolveSoftPadShowMode(pad);
    container.innerHTML =
      softPadExperienceChrome('runtime', m) +
      '<div class="soft-pad-runtime-show">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadShowModeLbl', '显示方式')) + '</p>' +
      renderShowModeTabsHtml(mode) +
      renderShowModeSceneHtml(mode, pad) +
      '<p class="codex-pad-mgr__hint soft-pad-runtime-show__hint" data-show-mode-hint>' +
      esc(softPadShowModeHint(mode)) +
      '</p>' +
      '</div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'runtime');
    container.classList.remove('is-editing-key');
    mirrorSoftPadSubpageChrome(container);
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'runtime' }));
    try { global.__otSoftPadRuntimeMounted = true; } catch (_) {}
  }

  /** Purpose tab — AG role chips + three Soft Pad feature demos. */
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

  function lightsSimpleLead(mode) {
    if (mode === 'preset-claude') {
      return t('softPadLightsLeadClaude', '多个任务时，不同键会亮不同颜色（自动）');
    }
    if (mode === 'preset-codex') {
      return t('softPadLightsLeadCodex', '一整段任务亮在一盏键上（自动）');
    }
    if (mode === 'preset-cursor') {
      return t('softPadLightsLeadCursor', '只看顶栏圆点（此应用不支持多键灯）');
    }
    if (mode === 'preset-shell') {
      return t('softPadLightsLeadShell', '顶栏显示忙闲（Hook 生命周期）');
    }
    return t('softPadLightsLeadCustom', '选下面一种效果即可');
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

  /** Agent subpage — v10/v12 lights config (center column). */
  var softPadLightsSubtab = 'topbar';

  function getSoftPadLightsSubtab() {
    return softPadLightsSubtab;
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

  function renderStatusLightsSubtabBar(activeTab) {
    function btn(id, label) {
      var on = activeTab === id;
      return (
        '<button type="button" class="soft-pad-feature-subtab soft-pad-lights-subtab' +
        (on ? ' is-active' : '') + '" role="tab" data-lights-subtab="' + id + '" aria-selected="' +
        (on ? 'true' : 'false') + '">' +
        '<span class="soft-pad-feature-subtab__lbl">' + esc(label) + '</span></button>'
      );
    }
    return (
      '<div class="soft-pad-lights-subtabs" data-lights-subtab-bar="1" role="tablist" aria-label="' +
      esc(t('softPadLightsSubtabsAria', '状态灯配置')) + '">' +
      btn('topbar', t('softPadLightsTabTopbar', '顶栏')) +
      btn('ambient', t('softPadLightsTabAmbient', '氛围灯')) +
      btn('keys', t('softPadLightsTabKeys', '按键灯')) +
      '</div>'
    );
  }

  function renderStatusLightsScopeLead(m, mode, appName) {
    appName = appName || appDisplayName(m, mode);
    return (
      '<p class="soft-pad-lights-scope-lead" data-lights-scope-lead="1">' +
      '<span class="soft-pad-lights-scope-lead__app">' +
      esc(t('softPadLightsScopeApp', '当前应用：{name}').replace('{name}', appName)) +
      '</span> · <span class="soft-pad-lights-scope-lead__hint">' +
      esc(lightsSimpleLead(mode)) + '</span></p>'
    );
  }

  function renderLightsTopbarTab(pad) {
    return renderTopbarLightsPanel(pad);
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
      syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: softPadLightsSubtab });
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
        '<div class="soft-pad-lights-simple__row">' +
        '<label><input type="checkbox" data-act="agent-light" data-agent="' + esc(agent) + '"' +
        (mainOn ? ' checked' : '') + '> ' +
        esc(t('softPadLightsShowApp', '显示 {name} 状态灯').replace('{name}', appName)) +
        '</label></div>' +
        '<div class="soft-pad-lights-simple__row" data-lights-connect-row="' + esc(agent) + '">' +
        '<span class="soft-pad-lights-simple__status" data-lights-connected hidden>' +
        '<i class="soft-pad-lights-simple__status-dot" aria-hidden="true"></i>' +
        esc(t('softPadLightsConnected', '已连接 {name} Activity').replace('{name}', appName)) +
        '</span>' +
        '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" ' +
        'data-act="agent-light-connect" data-agent="' + esc(agent) + '" hidden>' +
        esc(t('softPadLightsConnectApp', '连接 {name}').replace('{name}', appName)) +
        '</button></div>';
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

  function renderLightsTabPanel(tab, m, pad) {
    if (tab === 'ambient') return renderLightsAmbientTab(m, pad);
    if (tab === 'keys') return renderLightsKeysTab(m, pad);
    return renderLightsTopbarTab(pad);
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

  function renderStatusLightsSimple(m, pad) {
    var mode = resolveLightsPanelMode(m);
    var appName = appDisplayName(m, mode);
    var tab = softPadLightsSubtab;
    if (tab !== 'topbar' && tab !== 'ambient' && tab !== 'keys') tab = 'topbar';

    return (
      '<div class="soft-pad-lights-simple" data-lights-simple="1" data-lights-mode="' + esc(mode) +
      '" data-lights-subtab="' + esc(tab) + '">' +
      renderStatusLightsSubtabBar(tab) +
      renderStatusLightsScopeLead(m, mode, appName) +
      '<div class="soft-pad-lights-tab-panel" data-lights-tab-panel="1">' +
      renderLightsTabPanel(tab, m, pad) +
      '</div></div>'
    );
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

  function syncStatusLightsPreviewChrome(host, m, pad, opts) {
    opts = opts || {};
    if (!host) return;
    var tab = opts.subtab || softPadLightsSubtab || 'topbar';
    if (tab !== 'topbar' && tab !== 'ambient' && tab !== 'keys') tab = 'topbar';
    host.querySelectorAll('[data-lights-topbar-preview], [data-lights-preview-legend]').forEach(function (el) {
      el.remove();
    });
    if (!m || !pad) return;
    var mode = resolveLightsPanelMode(m);
    host.setAttribute('data-lights-preview-mode', mode);
    host.setAttribute('data-lights-subtab', tab);
    host.setAttribute('data-lights-preview-accent', tab);
    if (mode === 'custom') {
      host.setAttribute('data-light-template', String(pad.lightTemplate || 'bezel'));
    } else {
      host.removeAttribute('data-light-template');
    }
    applyStatusPaletteToPreview(host, pad);
    host.insertAdjacentHTML('afterbegin', renderTopbarPreviewStrip(pad, {
      focusAgent: opts.focusAgent || hubSelectedScopeKind()
    }));
    if (tab === 'keys') {
      host.insertAdjacentHTML('beforeend', renderStatusLightsPreviewLegend());
    }
    paintKeysPaletteDemo(host, tab === 'keys');
    host.querySelectorAll('[data-act="topbar-jump"]').forEach(function (btn) {
      if (btn.__topbarJumpBound) return;
      btn.__topbarJumpBound = true;
      btn.addEventListener('click', function () {
        jumpToTopbarTarget(btn.getAttribute('data-agent'), btn.getAttribute('data-habit-id'));
      });
    });
  }

  function applySoftPadLightsSubtab(body, m, pad, tab) {
    if (!body || !m || !pad) return;
    if (tab !== 'topbar' && tab !== 'ambient' && tab !== 'keys') tab = 'topbar';
    softPadLightsSubtab = tab;
    var root = body.querySelector('[data-lights-simple]');
    if (root) root.setAttribute('data-lights-subtab', tab);
    body.querySelectorAll('.soft-pad-lights-subtab[data-lights-subtab]').forEach(function (btn) {
      var on = btn.getAttribute('data-lights-subtab') === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    var panel = body.querySelector('[data-lights-tab-panel]');
    if (panel) panel.innerHTML = renderLightsTabPanel(tab, m, pad);
    var mode = resolveLightsPanelMode(m);
    var lead = body.querySelector('[data-lights-scope-lead]');
    if (lead) {
      lead.outerHTML = renderStatusLightsScopeLead(m, mode, appDisplayName(m, mode));
    }
    if (tab === 'keys') {
      var advHost = body.querySelector('.soft-pad-lights-advanced__body');
      if (advHost) advHost.setAttribute('data-filled', '0');
      fillStatusLightsAdvanced(body, m, pad);
      bindShellDiagOptional(body, m);
      refreshAgentLightsPickerState(body, m, pad);
      setTimeout(function () {
        try { refreshAgentLightsPickerState(body, m, pad, { hooks: true }); } catch (_) {}
      }, 0);
    }
    bindTopbarLightsPanelEvents(body, m, pad);
    bindSoftPadLightsSubtabEvents(body, m, pad);
    bindAgentConnectEvents(body, m, pad);
    var Hub = global.OneToneSoftPadHub;
    var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
    syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: tab });
    echoStatusPaletteOnSoftPads(pad);
  }

  function bindSoftPadLightsSubtabEvents(body, m, pad) {
    if (!body || !m || !pad) return;
    body.querySelectorAll('.soft-pad-lights-subtab[data-lights-subtab]').forEach(function (btn) {
      if (btn.__lightsSubtabBound) return;
      btn.__lightsSubtabBound = true;
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-lights-subtab') || 'topbar';
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
    var card = body.querySelector('[data-topbar-lights-panel]');
    if (!card) return;
    var wrap = document.createElement('div');
    wrap.innerHTML = renderTopbarLightsPanel(pad);
    var next = wrap.firstElementChild;
    if (next) card.replaceWith(next);
    bindTopbarLightsPanelEvents(body, m, pad);
    refreshAgentLightsPickerState(body, m, pad);
    var Hub = global.OneToneSoftPadHub;
    var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
    syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: softPadLightsSubtab });
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

  /** Agent subpage — advanced status lights; fill immediately (user entered intentionally). */
  function renderSoftPadAgentPanel(container, m, opts) {
    opts = opts || {};
    container = resolveSoftPadSubpagePaintHost(container);
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var token = opts.agentLoadToken != null ? opts.agentLoadToken : opts.token;
    container.innerHTML = renderStatusLightsSimple(m, pad);
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'agent');
    container.setAttribute('data-lights-simple', '1');
    container.classList.remove('is-editing-key');
    if (token != null) container.setAttribute('data-agent-load-token', String(token));
    if (softPadLightsSubtab === 'keys') {
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
    bindSoftPadLightsSubtabEvents(container, m, pad);
    var Hub = global.OneToneSoftPadHub;
    var previewHost = Hub && Hub.previewHostForFace ? Hub.previewHostForFace('agent') : null;
    syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: softPadLightsSubtab });
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

  function applySoftPadPurposeFeatureTab(body, tab) {
    tab = tab === 'occupy' || tab === 'nav' ? tab : 'mapping';
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
  }

  function bindSoftPadLightPanelEvents(body, m, pad, opts) {
    opts = opts || {};
    if (!body || !m || !pad) return;
    var controlBusyUntil = 0;

    function markBusy(ms) {
      controlBusyUntil = Date.now() + (ms || 250);
      setSoftPadControlsBusy(body, true);
      var until = controlBusyUntil;
      setTimeout(function () {
        if (Date.now() >= until - 5) setSoftPadControlsBusy(body, false);
      }, ms || 250);
    }

    function isBusy() {
      return Date.now() < controlBusyUntil;
    }

    body.querySelectorAll('button[data-feature-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-feature-tab');
        if (!next || next === softPadPurposeFeatureTab) return;
        applySoftPadPurposeFeatureTab(body, next);
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

    body.querySelectorAll('[data-pad-presentation]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-presentation');
        if (!next || (next !== 'full' && next !== 'mini')) return;
        if (pad.presentation === next) return;
        if (isBusy()) return;
        markBusy(250);
        pad.presentation = next;
        body.querySelectorAll('[data-pad-presentation]').forEach(function (b) {
          var on = b.getAttribute('data-pad-presentation') === next;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        var hints = body.querySelectorAll('.codex-pad-mgr__hint');
        if (hints[0]) {
          hints[0].textContent = next === 'mini'
            ? t('softPadPresMiniStatus', '小态栏：状态优先，操作能力有限（不是确认键条）')
            : t('softPadPresFullStatus', '完整体：显示全部键位');
        }
        persistPresentation(m);
        softPadPanelChanged(m, opts);
      });
    });
    body.querySelectorAll('[data-pad-purpose]').forEach(function (btn) {
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
    body.querySelectorAll('[data-pad-skin-opt]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = canonicalizePadSkin(btn.getAttribute('data-pad-skin-opt'));
        if (next === canonicalizePadSkin(pad.skin)) return;
        if (isBusy()) return;
        markBusy(220);
        pad.skin = next;
        patchSkinSegActive(body, next);
        patchSoftPadPreviewSkin(m);
        persistPadSkin(m);
        softPadPanelChanged(m, Object.assign({}, opts, { panel: 'presentation' }));
      });
    });
    body.querySelectorAll('[data-pad-profile]').forEach(function (btn) {
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

    var enabledEl = body.querySelector('[data-act="enabled"]');
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
        var overlayElSync = body.querySelector('[data-act="overlay"]');
        if (overlayElSync && pad.enabled) overlayElSync.checked = true;
        persistPadFlags(m);
        softPadPanelChanged(m, Object.assign({}, opts, {
          refreshPreview: true
        }));
      });
    }
    var overlayEl = body.querySelector('[data-act="overlay"]');
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
    var showModeEl = body.querySelector('select[data-act="showMode"]');
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
        syncSoftPadShowModeChrome(body, next, pad);
        softPadPanelChanged(m, opts);
      });
    }
    body.querySelectorAll('button[data-act="showMode"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var next = btn.getAttribute('data-show-mode');
        if (next) {
          if (next === resolveSoftPadShowMode(pad)) return;
          markBusy(280);
          applySoftPadShowMode(m, next);
          syncSoftPadShowModeChrome(body, next, pad);
          softPadPanelChanged(m, opts);
          return;
        }
        // Legacy chrome CTA (no data-show-mode): focus / enable follow.
        var cur = resolveSoftPadShowMode(pad);
        if (cur === 'hidden') {
          markBusy(280);
          applySoftPadShowMode(m, 'follow');
          syncSoftPadShowModeChrome(body, 'follow', pad);
          softPadPanelChanged(m, opts);
          return;
        }
        var focusTab = body.querySelector('button[data-act="showMode"][data-show-mode]');
        if (focusTab && typeof focusTab.focus === 'function') {
          try { focusTab.focus(); } catch (_) {}
        }
      });
    });
    body.querySelectorAll('[data-act="focusLayoutKey"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var id = pickDefaultLayoutKey(m);
        softPadPreviewEditKey(m, id);
      });
    });
    body.querySelectorAll('[data-act="focusSkin"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var skin = body.querySelector('[data-pad-skin-opt]');
        if (skin && typeof skin.focus === 'function') {
          try { skin.focus(); } catch (_) {}
        }
        if (skin && typeof skin.scrollIntoView === 'function') {
          try { skin.scrollIntoView({ block: 'nearest' }); } catch (_) {}
        }
      });
    });
    body.querySelectorAll('[data-act="focusAgent"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (isBusy()) return;
        var agentBody = body.querySelector('[data-lazy-agent-body]');
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
    var numLockEl = body.querySelector('[data-act="numlock"]');
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
        var numpadMap = body.querySelector('[data-numpad-on]');
        if (numpadMap) numpadMap.setAttribute('data-numpad-on', next ? '1' : '0');
        var demo = body.querySelector('[data-demo-mode]');
        if (demo) {
          demo.classList.remove('is-user-driven');
          demo.setAttribute('data-demo-mode', next ? 'soft' : 'numpad');
        }
        var hint = body.querySelector('[data-numpad-hint]');
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
    var navKeysEl = body.querySelector('[data-act="navKeys"]');
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
        var navCap = body.querySelector('[data-nav-cap]');
        if (navCap) {
          navCap.textContent = next
            ? t('softPadFeatureNavCapOn',
              '屏幕方向钮可注入 ↑↓←→；主键盘倒 T 保持系统原样（不劫持）。')
            : t('softPadFeatureNavCapOff',
              'Soft Pad 不显示左侧方向列；主键盘方向键始终系统原样。');
        }
        var arrowStory = body.querySelector('[data-nav-on]');
        if (arrowStory) arrowStory.setAttribute('data-nav-on', next ? '1' : '0');
        var navHost = body.querySelector('[data-nav-demo-host]');
        if (navHost) navHost.innerHTML = renderNavArrowDemoHtml(pad);
        persistPadFlags(m);
        softPadPanelChanged(m, Object.assign({}, opts, {
          refreshPreview: true
        }));
      });
    }

    body.querySelectorAll('[data-demo-enc]').forEach(function (encBtn) {
      encBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        var demo = encBtn.closest('[data-demo-mode]');
        if (!demo) return;
        demo.classList.add('is-user-driven');
        var cur = demo.getAttribute('data-demo-mode') === 'soft' ? 'soft' : 'numpad';
        demo.setAttribute('data-demo-mode', cur === 'soft' ? 'numpad' : 'soft');
      });
    });

    var enhanceEl = body.querySelector('[data-act="enhance"]');
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

    var restoreBtn = body.querySelector('[data-act="restore"]');
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
    var exportBtn = body.querySelector('[data-act="export"]');
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
    var fileEl = body.querySelector('[data-act="importFile"]');
    var importBtn = body.querySelector('[data-act="import"]');
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
        syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: softPadLightsSubtab });
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
        syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: softPadLightsSubtab });
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
          syncStatusLightsPreviewChrome(previewHost, m, pad, { subtab: softPadLightsSubtab });
          softPadPanelChanged(m, { panel: 'agent', refreshPreview: true });
        });
      });
    });
    body.querySelectorAll('[data-act="agent-light-connect"]').forEach(function (btn) {
      if (btn.__softPadBound) return;
      btn.__softPadBound = true;
      btn.addEventListener('click', function () {
        var agent = btn.getAttribute('data-agent') || '';
        if (agent === 'claude') {
          if (!window.confirm(t(
            'softPadClaudeConnectConfirm',
            '将把 OneTone hooks 写入 Claude Code 的 settings.json（会先备份）。继续？'
          ))) return;
          btn.disabled = true;
          btn.textContent = t('softPadConnecting', '连接中…');
          confirmClaudeHookInstall().then(function () {
            refreshAgentLightsPickerState(body, m, pad);
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
        // Soft Pad / edit / config: click keycap → capability editor (restore prior design).
        if (id === 'JOY') { return; }
        el.addEventListener('click', function (e) {
          if (e.target && e.target.closest && e.target.closest('[data-act="pad-mode"]')) return;
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
      // Keep ensureAgentKeyBinding's default chord when user didn't record.
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

  function fillLayoutKeySlotSelect(sel, m, currentId) {
    if (!sel) return;
    sel.innerHTML = '';
    var unbound = document.createElement('option');
    unbound.value = '';
    unbound.textContent = t('codexMicroPadUnbound', '未绑定');
    sel.appendChild(unbound);
    allSlotOptions(m).forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label || o.id;
      if (o.tip) opt.title = o.tip;
      sel.appendChild(opt);
    });
    sel.value = String(currentId || '');
  }

  function syncLayoutKeyFormFields() {
    if (!editDraft) return;
    var chordEl = document.getElementById('layoutKeyChord');
    var phrasesEl = document.getElementById('layoutKeyPhrases');
    var focusEl = document.getElementById('layoutKeyFocus');
    var recBtn = document.getElementById('layoutKeyRecord');
    var bound = !!String(editDraft.slotId || '').trim();
    if (chordEl) {
      chordEl.value = bound ? friendlyChord(editDraft.chord || '') : '';
      chordEl.disabled = !bound;
    }
    if (phrasesEl) {
      phrasesEl.value = bound ? String(editDraft.phrases || '') : '';
      phrasesEl.disabled = !bound;
    }
    if (focusEl) {
      focusEl.value = normalizeActivationScope(editDraft.activationScope);
      focusEl.disabled = !bound;
    }
    if (recBtn) recBtn.disabled = !bound;
    var badge = document.getElementById('microHwEditBadge');
    if (badge) {
      badge.textContent = bound
        ? t('softPadLayoutFormLive', '生效中')
        : t('codexMicroPadUnbound', '未绑定');
    }
  }

  function startRecordLayoutChord(btn) {
    if (!editDraft || !String(editDraft.slotId || '').trim()) return;
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) {
      toast(t('codexMicroPadRecordBusy', '请先结束按键录制'));
      return;
    }
    if (rec.mode && rec.mode() !== 'none') return;
    if (btn) btn.classList.add('is-recording');
    rec.startAgentBinding(editDraft.mapping && editDraft.mapping.id, {
      onDone: function (chord) {
        if (btn) btn.classList.remove('is-recording');
        if (!editDraft) return;
        editDraft.chord = String(chord || '').trim();
        syncLayoutKeyFormFields();
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      },
      onCancel: function () {
        if (btn) btn.classList.remove('is-recording');
      }
    });
  }

  function bindLayoutKeyForm(host, m) {
    var slotSel = document.getElementById('layoutKeySlot');
    fillLayoutKeySlotSelect(slotSel, m, editDraft && editDraft.slotId);
    syncHiddenSlotSelect();
    syncLayoutKeyFormFields();
    if (slotSel) {
      slotSel.onchange = function () {
        if (!editDraft) return;
        editDraft.slotId = String(slotSel.value || '');
        maybeAutoSuggestIcon();
        hydrateLayoutDraftBindings(editDraft);
        syncHiddenSlotSelect();
        syncLayoutKeyFormFields();
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      };
    }
    var phrasesEl = document.getElementById('layoutKeyPhrases');
    if (phrasesEl) {
      phrasesEl.onchange = function () {
        if (!editDraft) return;
        editDraft.phrases = String(phrasesEl.value || '').trim();
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      };
    }
    var focusEl = document.getElementById('layoutKeyFocus');
    if (focusEl) {
      focusEl.onchange = function () {
        if (!editDraft) return;
        editDraft.activationScope = normalizeActivationScope(focusEl.value);
        commitEditKeycapDraft({ keepOpen: true, quiet: true });
      };
    }
    var recBtn = document.getElementById('layoutKeyRecord');
    if (recBtn) {
      recBtn.textContent = t('softPadLayoutRecordChord', '录制键位');
      recBtn.onclick = function () { startRecordLayoutChord(recBtn); };
    }
  }

  function buildLayoutKeyFormHtml() {
    return (
      '<div class="soft-pad-layout-form-wrap">' +
      '<div class="soft-pad-layout-form-head">' +
      '<div>' +
      '<p class="soft-pad-layout-form-title" id="microHwEditTitle"></p>' +
      '<p class="soft-pad-layout-form-sub" id="microHwEditSub"></p>' +
      '</div>' +
      '<span class="soft-pad-layout-form-badge" id="microHwEditBadge"></span>' +
      editKeycapCloseBtnHtml() +
      '</div>' +
      '<p class="soft-pad-layout-form-hint" id="microHwEditHint"></p>' +
      '<div class="soft-pad-layout-form">' +
      '<label class="soft-pad-layout-form__field">' +
      '<span>' + esc(t('softPadLayoutFieldSlot', '动作分类')) + '</span>' +
      '<select id="layoutKeySlot"></select>' +
      '</label>' +
      '<label class="soft-pad-layout-form__field">' +
      '<span>' + esc(t('softPadLayoutFieldChord', '快捷键配置')) + '</span>' +
      '<span class="soft-pad-layout-form__chord-row">' +
      '<input id="layoutKeyChord" type="text" readonly autocomplete="off" />' +
      '<button type="button" class="codex-micro-pad__btn" id="layoutKeyRecord"></button>' +
      '</span>' +
      '</label>' +
      '<label class="soft-pad-layout-form__field">' +
      '<span>' + esc(t('softPadLayoutFieldPhrases', '文本口令')) + '</span>' +
      '<input id="layoutKeyPhrases" type="text" autocomplete="off" />' +
      '</label>' +
      '<label class="soft-pad-layout-form__field">' +
      '<span>' + esc(t('softPadLayoutFieldFocus', '窗口聚焦')) + '</span>' +
      '<select id="layoutKeyFocus">' +
      '<option value="foregroundApp">' +
      esc(t('softPadLayoutFocusEditor', '送到当前正在用的编辑器')) + '</option>' +
      '<option value="global">' +
      esc(t('softPadLayoutFocusGlobal', '不抢焦点（全局）')) + '</option>' +
      '</select>' +
      '</label>' +
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
    opts.forEach(function (o) {
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
    });
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
    var badgeEl = document.getElementById('microHwEditBadge');
    if (mode === 'inline') {
      var appName = String((m && (m.name || m.appTargetId)) || 'Soft Pad');
      if (titleEl) {
        titleEl.textContent = t('softPadLayoutFormTitle', '{app} · [{key}] 映射参数')
          .replace('{app}', appName)
          .replace('{key}', keyLabel);
      }
      if (subEl) subEl.textContent = '';
      var hintEl = document.getElementById('microHwEditHint');
      if (hintEl) {
        hintEl.textContent = t(
          'softPadLayoutFormHint',
          '设置敲击此键时分发的快捷键、口令与窗口聚焦。'
        );
      }
      bindLayoutKeyForm(host, m);
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
    if (mode === 'inline') {
      var layoutHost = softPadLayoutEditorHost();
      if (!layoutHost) mode = 'modal';
      else {
        renderEditKeycapEditor(layoutHost, m, microKeyId, {
          mode: 'inline',
          onClose: opts.onClose,
          onSaved: opts.onSaved
        });
        return;
      }
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
      paintSoftPadLayoutKeyPreviewForMapping(m, keyId);
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
    var A = agent();
    var id = String(slotId || '').trim();
    if (!m || !id || !A || !A.slotById) return;
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
      // Cursor Soft Pad keys are hotkeys, never Codex slash insertOnly.
      if (isCursorSoftPadMapping(m)) {
        found.executionMode = 'execute';
      }
      // Migrate legacy Cursor Plan chord off Ctrl+Alt+P (screenshot conflict).
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
    resolveSoftPadPreviewPaintHost: resolveSoftPadPreviewPaintHost,
    renderSoftPadLayoutPanel: renderSoftPadLayoutPanel,
    renderSoftPadPresentationPanel: renderSoftPadPresentationPanel,
    renderSoftPadRuntimePanel: renderSoftPadRuntimePanel,
    renderSoftPadPurposePanel: renderSoftPadPurposePanel,
    renderSoftPadAgentPanel: renderSoftPadAgentPanel,
    renderStatusLightsSimple: renderStatusLightsSimple,
    getSoftPadLightsSubtab: getSoftPadLightsSubtab,
    renderLightsAmbientTab: renderLightsAmbientTab,
    renderLightsKeysTab: renderLightsKeysTab,
    renderTopbarLightsPanel: renderTopbarLightsPanel,
    resolveLightsPanelMode: resolveLightsPanelMode,
    syncStatusLightsPreviewChrome: syncStatusLightsPreviewChrome,
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
    SLOT_DEFAULT_ICON: SLOT_DEFAULT_ICON,
    allSlotOptions: allSlotOptions,
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
    isHoldMicroKey: isHoldMicroKey
  };
})(typeof window !== 'undefined' ? window : globalThis);
