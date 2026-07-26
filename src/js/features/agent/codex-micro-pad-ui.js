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
    focusBrowserAddressBar: 'search'
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

  /** Legacy stock icons that looked like capabilities — treat as untouched for auto-correct. */
  var LEGACY_MISLEADING_ICONS = {
    claude: 1,
    status: 1,
    agent: 1,
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
      navKeysEnabled: pad.navKeysEnabled !== false
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
  function persistLayout(m) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !m.id || !pad) {
      // Soft Pad open: never fall back to full buildSavePayload.
      return;
    }
    var profile = String(pad.layoutProfile || 'custom');
    if (LAYOUT_PROFILES.indexOf(profile) < 0 && profile !== 'custom') profile = 'custom';
    layoutPersistPending = {
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
          advanced: !!k.advanced
        };
      })
    };
    if (layoutPersistTimer) clearTimeout(layoutPersistTimer);
    layoutPersistTimer = setTimeout(function () {
      layoutPersistTimer = 0;
      var args = layoutPersistPending;
      layoutPersistPending = null;
      if (!args) return;
      invoke('cmd_codex_micro_pad_set_layout', args).catch(function (err) {
        try {
          padInvoke('cmd_app_log', {
            line: 'fe persistLayout fail ' + (err && err.message ? err.message : 'unknown')
          });
        } catch (_) {}
        // Do NOT fall back to full persist()/cmd_save — quiet IPC is required.
      });
    }, 120);
  }

  function padInvoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!fn) return Promise.resolve(null);
    return fn(cmd, args || {});
  }

  function applyEnsurePayloadToMapping(m, payload) {
    if (!m || !payload) return;
    if (payload.codexMicroPad) {
      var prevSkin = m.codexMicroPad && m.codexMicroPad.skin;
      m.codexMicroPad = payload.codexMicroPad;
      if (m.codexMicroPad) {
        if (!m.codexMicroPad.skin && prevSkin) m.codexMicroPad.skin = prevSkin;
        m.codexMicroPad.skin = canonicalizePadSkin(m.codexMicroPad.skin);
      }
    }
    if (payload.agentBindings && payload.agentBindings.length) {
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
        return t('codexMicroPadReadinessNoMapping', '请先创建 Codex 工作场景');
      case 'mapping_off':
        return t('codexMicroPadReadinessMappingOff', '请启用 Codex 工作场景');
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

  function slotLabel(slotId) {
    var A = agent();
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
        return String(b.triggerBinding || '').trim();
      }
    }
    var A = agent();
    return A && A.defaultKeyForSlot ? A.defaultKeyForSlot(slotId) : '';
  }

  /** Display subtitle: insertOnly →「插入 /xxx」; else friendly chord. chordForSlot unchanged. */
  function slotSubForDisplay(m, slotId) {
    var A = agent();
    var chord = friendlyChord(chordForSlot(m, slotId));
    if (A && A.slotSubForDisplay) return A.slotSubForDisplay(slotId, chord);
    return chord;
  }

  function displayActionForSlot(m, slotId) {
    var A = agent();
    var chord = friendlyChord(chordForSlot(m, slotId));
    if (A && A.displayActionForSlot) return A.displayActionForSlot(slotId, chord);
    return chord || slotLabel(slotId);
  }

  function friendlyChord(raw) {
    var kl = global.OneToneKeyLabels;
    if (kl && kl.formatChord) return kl.formatChord(raw, lang());
    return raw;
  }

  function iconSvg(id) {
    return ICON_SVG[id] || ICON_SVG.empty;
  }

  function resolveIconId(route, microKeyId) {
    if (route && route.uiIconId) return route.uiIconId;
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
        navKeysEnabled: true,
        overlayEnabled: true,
        layoutProfile: 'custom',
        softwareEnhanceEnabled: true,
        codexStatusLightsEnabled: false,
        presentation: 'full',
        skin: 'default',
        keys: defaultSeedRoutes()
      };
      if (m.id) padHealDone[String(m.id)] = true;
      if (opts.persist !== false) persist();
      return m.codexMicroPad;
    }
    if (!opts.force && m.id && padHealDone[String(m.id)]) {
      return m.codexMicroPad;
    }
    if (!Array.isArray(m.codexMicroPad.keys)) m.codexMicroPad.keys = [];
    // Missing profile → custom; do not rewrite existing beginner/standard/advanced keys.
    if (!m.codexMicroPad.layoutProfile) m.codexMicroPad.layoutProfile = 'custom';
    if (m.codexMicroPad.softwareEnhanceEnabled == null) {
      m.codexMicroPad.softwareEnhanceEnabled = true;
    }
    if (m.codexMicroPad.requireForeground == null) {
      m.codexMicroPad.requireForeground = true;
    }
    if (m.codexMicroPad.navKeysEnabled == null) {
      m.codexMicroPad.navKeysEnabled = true;
    }
    if (m.codexMicroPad.codexStatusLightsEnabled == null) {
      m.codexMicroPad.codexStatusLightsEnabled = false;
    }
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
    if (!route || !route.enabled || !route.sourceScan) return '';
    return scanLabel(route.sourceScan, route.sourceExtended);
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

  function isSoftPadInsertOnlySlot(slotId) {
    var A = agent();
    if (!A || !A.slotById || !A.actionById) return false;
    var s = A.slotById(slotId);
    if (!s) return false;
    var a = A.actionById(s.actionId);
    return !!(a && String(a.mode || '') === 'insertOnly');
  }

  function allSlotOptions(m) {
    var A = agent();
    if (!A || !A.SLOTS) return [];
    var codexOnly = isCodexSoftPadMapping(m);
    return A.SLOTS.filter(function (s) {
      // Soft Pad (Codex + Claude): never offer insertOnly slash as one-press keys.
      if (isSoftPadInsertOnlySlot(s.slotId)) return false;
      if (codexOnly) return !!CODEX_SOFT_PAD_SLOT_IDS[String(s.slotId || '').trim()];
      return true;
    }).map(function (s) {
      var label = lang().indexOf('en') === 0 ? s.labelEn : s.labelZh;
      var tip = slotEffectTip(s.slotId, label, m);
      return { id: s.slotId, label: label, tip: tip };
    });
  }

  /** Hover / option tip: what this capability does when the key fires. */
  function slotEffectTip(slotId, label, m) {
    var A = agent();
    var name = label || slotLabel(slotId) || String(slotId || '');
    if (!slotId) {
      return lang().indexOf('en') === 0
        ? 'No capability — key will not run an action'
        : '未绑定能力 — 按键不会执行动作';
    }
    // Soft Pad never advertises insert-only slash (one-press only).
    if (isSoftPadInsertOnlySlot(slotId)) {
      return lang().indexOf('en') === 0
        ? (name + ' — not available as a one-press Soft Pad action')
        : (name + ' — 不可作为 Soft Pad 一键动作');
    }
    var chord = '';
    try {
      if (m) chord = friendlyChord(chordForSlot(m, slotId));
      else if (editDraft && editDraft.mapping) chord = friendlyChord(chordForSlot(editDraft.mapping, slotId));
    } catch (_) {}
    if (!chord && A && A.defaultKeyForSlot) chord = friendlyChord(A.defaultKeyForSlot(slotId));
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
  function slotSourceTag(slotId) {
    var en = lang().indexOf('en') === 0;
    var id = String(slotId || '').trim();
    if (!id) return '';
    if (id === 'summonCodex') {
      return en ? 'OneTone focus' : 'OneTone 聚焦操作';
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

  function capabilityCardCopy(slotId) {
    var en = lang().indexOf('en') === 0;
    var id = String(slotId || '').trim();
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
      source: slotSourceTag(id)
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
    var copy = capabilityCardCopy(editDraft.slotId);
    var source = copy.source || slotSourceTag(editDraft.slotId);
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
    if (!note || !editDraft) return;
    var pad = editDraft.mapping && editDraft.mapping.codexMicroPad;
    var host = resolveStatusLightMicroKeyId(pad);
    var show = host
      && host === String(editDraft.microKeyId || '')
      && String(editDraft.slotId || '').trim() !== 'status';
    note.textContent = show
      ? t('codexMicroEditStatusLightNote', '状态灯显示运行状态，不改变此键当前动作')
      : '';
    note.hidden = !show;
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
      var style = 'grid-row:' + cell.gridRow + (cell.gridRowSpan ? ' / span ' + cell.gridRowSpan : '') +
        ';grid-column:' + cell.gridCol +
        (cell.gridColSpan ? ' / span ' + cell.gridColSpan : '') + ';';
      var typeAttr = tag === 'button' ? ' type="button"' : '';
      var agAttr = cell.kind === 'agent' && cell.agIndex != null ? ' data-ag="' + cell.agIndex + '"' : '';
      var tipName = cellLabel(cell);
      var tipChord = '';
      if (bound && route && route.slotId) {
        tipChord = friendlyChord(chordForSlot(m, route.slotId));
        var tipIns = '';
        var tipA = agent();
        if (tipA && tipA.insertTextForSlot) {
          var tipInsert = tipA.insertTextForSlot(route.slotId);
          if (tipInsert) tipIns = (lang().toLowerCase().indexOf('en') === 0 ? 'Insert ' : '插入 ') + tipInsert;
        }
        tipName = tipIns || slotLabel(route.slotId) || tipName;
      }
      if (cell.microKeyId === 'ENC') {
        tipName = codexOn
          ? t('codexMicroPadModeCodex', 'Codex 场景模式')
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
          var insertCap = '';
          var A = agent();
          if (A && A.insertTextForSlot) {
            var ins = A.insertTextForSlot(route.slotId);
            if (ins) insertCap = (lang().toLowerCase().indexOf('en') === 0 ? 'Insert ' : '插入 ') + ins;
          }
          metaName = insertCap || slotLabel(route.slotId) || cellLabel(cell);
          metaChord = friendlyChord(chordForSlot(m, route.slotId));
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

  /** Direction-key capture + NAV column — default on when field missing. */
  function navKeysOn(pad) {
    return !pad || pad.navKeysEnabled !== false;
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
      toast(t('codexMicroPadNoProfile', '未找到 Codex 场景配置'));
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
   * Sticky Claude agent → AG hosts. Excludes Codex status host. No hash.
   * lights: [{ agentKey, agentId, agentType, state, firstSeenAt }]
   * stickyMap: optional { agentKey: microKeyId } mutated in place for reuse.
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
      '<label class="codex-pad-mgr__setting"><input type="checkbox" data-act="status-lights"' +
      (on ? ' checked' : '') + '>' +
      esc(t('codexMicroPadStatusLightsEnable', '开启 Codex 状态灯（官方 Hook → status 绑定键）')) +
      '</label>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('codexMicroPadStatusLightsHint', '跟 Codex Micro 一样用颜色表示状态；只收状态，不注入按键。')) +
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
      '<button type="button" class="codex-micro-pad__btn" data-act="hook-docs">' +
      esc(t('codexMicroPadHookDocs', '打开说明')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="hook-refresh">' +
      esc(t('codexMicroPadHookRefresh', '刷新状态')) + '</button>' +
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

  /** Soft Pad「更多」：横向标签 + 规整卡片（主题 segmented）。 */
  function renderSoftPadMoreBody(pad) {
    return (
      '<div class="soft-pad-more" data-more-tab="status">' +
      '<div class="soft-pad-more__tabs pref-segmented is-wide" role="tablist" aria-label="' +
      esc(t('softPadMoreTabsAria', '更多选项')) + '">' +
      '<button type="button" class="pref-segmented-btn is-active" role="tab" id="softPadMoreTabStatus" data-more-tab-btn="status" aria-controls="softPadMorePanelStatus" aria-selected="true">' +
      esc(t('softPadMoreTabStatus', '状态灯')) + '</button>' +
      '<button type="button" class="pref-segmented-btn" role="tab" id="softPadMoreTabClaude" data-more-tab-btn="claude" aria-controls="softPadMorePanelClaude" aria-selected="false">' +
      esc(t('softPadMoreTabClaude', 'Claude')) + '</button>' +
      '<button type="button" class="pref-segmented-btn" role="tab" id="softPadMoreTabLab" data-more-tab-btn="lab" aria-controls="softPadMorePanelLab" aria-selected="false">' +
      esc(t('softPadMoreTabLab', '开发测试')) + '</button>' +
      '</div>' +
      '<div class="soft-pad-more__panels">' +
      '<section class="soft-pad-more__panel is-active" id="softPadMorePanelStatus" data-more-panel="status" role="tabpanel" aria-labelledby="softPadMoreTabStatus">' +
      '<article class="soft-pad-more-card">' +
      renderHookStatusCard(pad, { includeDiag: false }) +
      '</article></section>' +
      '<section class="soft-pad-more__panel" id="softPadMorePanelClaude" data-more-panel="claude" role="tabpanel" aria-labelledby="softPadMoreTabClaude" hidden>' +
      '<article class="soft-pad-more-card">' +
      renderClaudeActivityPadCard({ includeLab: false }) +
      '</article></section>' +
      '<section class="soft-pad-more__panel" id="softPadMorePanelLab" data-more-panel="lab" role="tabpanel" aria-labelledby="softPadMoreTabLab" hidden>' +
      '<article class="soft-pad-more-card soft-pad-more-card--lab">' +
      '<p class="soft-pad-more-card__desc">' +
      esc(t('softPadMoreLabLead',
        '诊断回放、活动灯、测试注入等，给排查问题用；日常不必打开。')) +
      '</p>' +
      renderPadDiagDetails() +
      renderClaudeLabDetails() +
      '</article></section>' +
      '</div></div>'
    );
  }

  function bindSoftPadMoreTabs(root) {
    if (!root || root.__softPadMoreTabsBound) return;
    var host = root.querySelector('.soft-pad-more') || root;
    if (!host.querySelector('[data-more-tab-btn]')) return;
    root.__softPadMoreTabsBound = true;
    host.querySelectorAll('[data-more-tab-btn]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = String(btn.getAttribute('data-more-tab-btn') || 'status');
        host.setAttribute('data-more-tab', id);
        host.querySelectorAll('[data-more-tab-btn]').forEach(function (b) {
          var on = b.getAttribute('data-more-tab-btn') === id;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        host.querySelectorAll('[data-more-panel]').forEach(function (panel) {
          var on = panel.getAttribute('data-more-panel') === id;
          panel.classList.toggle('is-active', on);
          panel.hidden = !on;
        });
        if (id === 'lab') {
          try { refreshPadDiagnose(); } catch (_) {}
        }
      });
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
    var pad = m && m.codexMicroPad;
    if (!pad || !m.id) return Promise.resolve(null);
    pad.codexStatusLightsEnabled = !!enabled;
    return padInvoke('cmd_codex_status_lights_set', {
      mappingId: String(m.id),
      enabled: !!enabled
    }).then(function (res) {
      var card = document.getElementById('codexPadHookCard');
      var errEl = card && card.querySelector('[data-hook-error]');
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
      } else if (enabled && res && !res.loopbackEnabled) {
        var fail = t('codexMicroPadLoopbackNotReady', '状态通道未启动');
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = fail;
        }
        toast(fail);
      } else if (errEl) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      return refreshHookSetupStatus(m).then(function () { return res; });
    }).catch(function () {
      toast(t('codexMicroPadStatusLightsFail', '状态灯开关失败'));
      return null;
    });
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
      toast(t('codexMicroPadNumpadPassThrough', '请先打开模式开关 · 切换到 Codex 场景'));
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

  function renderAgentConnectFold(pad, opts) {
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
      renderSoftPadMoreBody(pad) +
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
    host.innerHTML = renderSoftPadMoreBody(pad);
    bindSoftPadMoreTabs(host);
    bindAgentConnectEvents(body, m, pad);
    var refreshOpts = {
      agentLoadToken: token,
      mappingId: m.id,
      container: body,
      requireSoftPad: requireSoftPad
    };
    refreshHookSetupStatus(m, refreshOpts);
    refreshClaudeActivityPad(refreshOpts);
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
          ? t('codexMicroPadModeCodex', 'Codex 场景模式')
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
        if (nav) openEditKeycap(m, nav);
        return;
      }
      var keyEl = ev.target.closest && ev.target.closest('.micro-hw__key[data-micro-key]');
      if (!keyEl || !host.contains(keyEl)) return;
      if (keyEl.classList.contains('micro-hw__key--placeholder')) return;
      var id = keyEl.getAttribute('data-micro-key');
      if (!id || id === 'JOY') return;
      ev.preventDefault();
      ev.stopPropagation();
      openEditKeycap(m, id);
    });
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

  function remountSoftPadPreviewShell(host, m) {
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
    var statusEl = root.querySelector('.codex-micro-pad__status');
    if (statusEl) {
      statusEl.textContent = on
        ? t('codexMicroPadStatusOn', '已开启 · 已绑定 {n} 个键').replace('{n}', String(n))
        : t('codexMicroPadStatusOff', '已关闭');
    }
    var hintEl = root.querySelector('.soft-pad-preview__hint');
    if (hintEl) {
      hintEl.textContent = t('softPadPreviewTapHint', '蓝框=正在编辑 · 点其它键可切换');
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
    markSoftPadPreviewFocus(softPadLayoutFocusKeyId || (editDraft && editDraft.microKeyId) || '');
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
    if (!host) return;
    if (!m) {
      softPadPreviewMapping = null;
      host.innerHTML = '';
      host.hidden = true;
      return;
    }
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var n = countBound(pad);
    var on = pad && pad.enabled;
    previewPadMode = on ? 'codex' : 'numpad';
    softPadPreviewMapping = m;
    ensureSoftPadPreviewDelegate(host);
    host.hidden = false;
    if (!opts.forceFull && remountSoftPadPreviewShell(host, m)) return;
    var skin = canonicalizePadSkin(pad && pad.skin);
    host.innerHTML =
      '<div class="codex-micro-pad soft-pad-preview" data-pad-skin="' + esc(skin) + '">' +
      '<div class="codex-micro-pad__head">' +
      '<p class="codex-micro-pad__title">' + esc(t('codexMicroPadTitle', '虚拟键盘')) + '</p>' +
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
      esc(t('softPadPreviewTapHint', '蓝框=正在编辑 · 点其它键可切换')) +
      '</p></div>';
    markSoftPadPreviewFocus(softPadLayoutFocusKeyId || (editDraft && editDraft.microKeyId) || '');
    bindSoftPadPreviewCaption(host);
  }

  function softPadPanelChanged(m, opts) {
    if (opts && typeof opts.onChanged === 'function') {
      try { opts.onChanged(m, opts.panel || null, opts); } catch (_) {}
      return;
    }
    notifyLinkedUi(m);
  }

  /** Layout subpage — tools idle + inline editor host; no profile/enhance UI. */
  function renderSoftPadLayoutPanel(container, m, opts) {
    opts = opts || {};
    if (!container || !m) return;
    var pad = m.codexMicroPad;
    if (!pad) {
      ensurePad(m, { persist: false });
      pad = m.codexMicroPad;
    }
    if (!pad) {
      container.innerHTML = '<p class="codex-pad-mgr__hint">—</p>';
      return;
    }
    container.innerHTML =
      '<div class="soft-pad-layout-shell">' +
      '<div class="soft-pad-layout-editor" data-soft-pad-layout-editor="1"></div>' +
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
    container.classList.add('is-editing-key');
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'layout' }));
    var focusId = pickDefaultLayoutKey(m);
    // Open editor immediately — never leave the right pane blank.
    requestAnimationFrame(function () {
      if (!container.isConnected) return;
      if (container.getAttribute('data-soft-pad-panel') !== 'layout') return;
      if (String(container.getAttribute('data-soft-pad-mapping') || '') !== String(m.id || '')) return;
      openEditKeycap(m, focusId, { mode: 'inline' });
    });
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
    // Keep intro + batch fold; never blank the editor pane — reopen default key.
    var editor = container.querySelector('[data-soft-pad-layout-editor]');
    if (editor) editor.hidden = false;
    container.classList.add('is-editing-key');
    var mapId = container.getAttribute('data-soft-pad-mapping');
    var m = mapId ? findMappingById(mapId) : null;
    if (m) {
      openEditKeycap(m, pickDefaultLayoutKey(m), { mode: 'inline' });
    } else if (editor) {
      editor.innerHTML = '';
    }
  }

  function softPadLayoutEditorHost() {
    var body = document.getElementById('softPadSubpageBody');
    if (!body || body.getAttribute('data-soft-pad-panel') !== 'layout') return null;
    return body.querySelector('[data-soft-pad-layout-editor]');
  }

  /** Presentation subpage — skins only (full/mini live under「何时显示」). */
  function renderSoftPadPresentationPanel(container, m, opts) {
    opts = opts || {};
    if (!container || !m) return;
    var pad = m.codexMicroPad;
    if (!pad) {
      ensurePad(m, { persist: false });
      pad = m.codexMicroPad;
    }
    if (!pad) {
      container.innerHTML = '<p class="codex-pad-mgr__hint">—</p>';
      return;
    }
    container.innerHTML =
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
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'presentation' }));
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
    var noPadTip = softLikelyNoNumpad() === true && occupied
      ? ('<p class="soft-pad-feature-hint" data-numpad-hint>' +
        esc(t('softPadNumpadNoPadHint',
          '未检测到独立数字键区。你可以关闭占用，只用悬浮 Soft Pad。')) +
        '</p>')
      : '<p class="soft-pad-feature-hint" data-numpad-hint hidden></p>';
    return (
      '<div class="soft-pad-feature-cards" data-mapping-on="' + (mappingOn ? '1' : '0') + '">' +
      '<section class="soft-pad-feature-card soft-pad-numpad-step soft-pad-numpad-step--map" data-feature="mapping">' +
      '<header class="soft-pad-numpad-step__head">' +
      '<span class="soft-pad-numpad-step__n">1</span>' +
      '<span class="soft-pad-numpad-step__h">' +
      esc(t('softPadFeatureMappingTitle', 'Soft Pad 映射')) + '</span>' +
      '</header>' +
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
      (mappingOn ? '' : ' is-disabled') + '" data-feature="occupy"' + mapDisabledAttr + '>' +
      '<header class="soft-pad-numpad-step__head">' +
      '<span class="soft-pad-numpad-step__n">2</span>' +
      '<span class="soft-pad-numpad-step__h">' +
      esc(t('softPadFeatureOccupyTitle', '数字键占用')) + '</span>' +
      '</header>' +
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
      (mappingOn ? '' : ' is-disabled') + '" data-feature="nav"' + mapDisabledAttr + '>' +
      '<header class="soft-pad-numpad-step__head">' +
      '<span class="soft-pad-numpad-step__n">3</span>' +
      '<span class="soft-pad-numpad-step__h">' +
      esc(t('softPadFeatureNavTitle', '方向键进 Soft Pad')) + '</span>' +
      '</header>' +
      '<label class="codex-pad-mgr__setting soft-pad-feature-card__toggle">' +
      '<input type="checkbox" data-act="navKeys"' +
      (navOn ? ' checked' : '') + mapDisabled + '>' +
      esc(t('softPadFeatureNavSwitch', '主键盘方向键进入 Soft Pad')) + '</label>' +
      '<p class="soft-pad-feature-card__cap" data-nav-cap>' +
      esc(navOn
        ? t('softPadFeatureNavCapOn',
          '主键盘方向键临时靠在虚拟键盘左侧；与小键盘 2/4/6/8 无关。')
        : t('softPadFeatureNavCapOff',
          '方向键保持系统原样，Soft Pad 不显示左侧方向列。')) + '</p>' +
      '<div data-nav-demo-host>' +
      renderNavArrowDemoHtml(pad) +
      '</div>' +
      '</section>' +
      '</div>'
    );
  }

  /** Runtime subpage — show mode + three feature cards. */
  function renderSoftPadRuntimePanel(container, m, opts) {
    opts = opts || {};
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var mode = resolveSoftPadShowMode(pad);
    container.innerHTML =
      '<div class="soft-pad-runtime-show">' +
      '<p class="codex-pad-mgr__label">' + esc(t('softPadShowModeLbl', '显示方式')) + '</p>' +
      '<select class="soft-pad-runtime-show__select" data-act="showMode" aria-label="' +
      esc(t('softPadShowModeLbl', '显示方式')) + '">' +
      '<option value="follow"' + (mode === 'follow' ? ' selected' : '') + '>' +
      esc(t('softPadShowModeFollow', '跟随应用显示')) + '</option>' +
      '<option value="front"' + (mode === 'front' ? ' selected' : '') + '>' +
      esc(t('softPadShowModeFront', '保持在最前')) + '</option>' +
      '<option value="mini"' + (mode === 'mini' ? ' selected' : '') + '>' +
      esc(t('softPadShowModeMini', '显示为迷你条')) + '</option>' +
      '<option value="hidden"' + (mode === 'hidden' ? ' selected' : '') + '>' +
      esc(t('softPadShowModeHidden', '不显示浮窗')) + '</option>' +
      '</select>' +
      renderShowModeSceneHtml(mode, pad) +
      '<p class="codex-pad-mgr__hint soft-pad-runtime-show__hint" data-show-mode-hint>' +
      esc(softPadShowModeHint(mode)) +
      '</p>' +
      '</div>' +
      '<div class="soft-pad-numpad-card">' +
      renderNumpadMapHtml(pad) +
      '</div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'runtime');
    // Layout panel leaves is-editing-key (overflow:hidden); clear so cards 2/3 can scroll.
    container.classList.remove('is-editing-key');
    bindSoftPadLightPanelEvents(container, m, pad, Object.assign({}, opts, { panel: 'runtime' }));
  }

  /** Agent subpage — advanced status lights; fill immediately (user entered intentionally). */
  function renderSoftPadAgentPanel(container, m, opts) {
    opts = opts || {};
    if (!container || !m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var token = opts.agentLoadToken != null ? opts.agentLoadToken : opts.token;
    container.innerHTML =
      '<div class="codex-pad-mgr__agent-connect" data-lazy-agent="1">' +
      '<p class="codex-pad-mgr__label">' +
      esc(t('softPadAgentPanelTitle', '更多')) +
      '</p>' +
      '<p class="codex-pad-mgr__hint">' +
      esc(t('softPadAgentPanelLead',
        '用上方标签切换：状态灯、Claude、开发测试。')) +
      '</p>' +
      '<div class="codex-pad-mgr__agent-lazy" data-lazy-agent-body></div>' +
      '</div>';
    container.setAttribute('data-soft-pad-mapping', String(m.id || ''));
    container.setAttribute('data-soft-pad-panel', 'agent');
    container.classList.remove('is-editing-key');
    if (token != null) container.setAttribute('data-agent-load-token', String(token));
    fillLazyAgentConnect(container, m, pad, {
      agentLoadToken: token,
      requireSoftPad: true
    });
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
    var showModeEl = body.querySelector('[data-act="showMode"]');
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
        pad.navKeysEnabled = next;
        var navCap = body.querySelector('[data-nav-cap]');
        if (navCap) {
          navCap.textContent = next
            ? t('softPadFeatureNavCapOn',
              '主键盘方向键临时靠在虚拟键盘左侧；与小键盘 2/4/6/8 无关。')
            : t('softPadFeatureNavCapOff',
              '方向键保持系统原样，Soft Pad 不显示左侧方向列。');
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
      esc(t('codexMicroPadEnableCodex', 'Codex 场景映射（关=数字键模式）')) + '</label>' +
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
      renderAgentConnectFold(pad, { lazyAgent: lazyAgent }) +
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
    var hookCopyBtn = body.querySelector('[data-act="hook-copy"]');
    if (hookCopyBtn && !hookCopyBtn.__softPadBound) {
      hookCopyBtn.__softPadBound = true;
      hookCopyBtn.addEventListener('click', function () { copyHookDraft(m); });
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
            ? t('codexMicroPadModeCodex', 'Codex 场景模式')
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
          ? t('codexMicroPadModeCodex', 'Codex 场景模式')
          : t('codexMicroPadModeNumpad', '数字键模式'));
        if (document.getElementById('codexPadMgrBody')) {
          if (!remountPadManagerShell(m)) renderPadManager(m, { skipHookRefresh: true });
        } else if (host.id === 'codexMicroPadHostTarget') {
          if (!remountTargetPadShell(host, m)) renderTarget(host, m, { skipEnsure: true });
        } else if (host.id === 'softPadPreviewHost' || host.closest('#softPadPreviewHost')) {
          renderSoftPadPreview(host.id === 'softPadPreviewHost' ? host : document.getElementById('softPadPreviewHost'), m, { forceFull: true });
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
      '<p class="codex-micro-pad__title">' + esc(t('codexMicroPadTitle', '小键盘')) + '</p>' +
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

  function buildEditKeycapInnerHtml(mode) {
    var inline = mode === 'inline';
    return (
      (inline
        ? '<div class="soft-pad-keycap-editor__bar">' +
          '<div class="soft-pad-keycap-editor__head-text">' +
          '<p class="soft-pad-keycap-editor__badge" id="microHwEditBadge"></p>' +
          '<p class="soft-pad-keycap-editor__key-name" id="microHwEditSub"></p>' +
          '</div></div>'
        : '<div class="micro-hw-modal__head">' +
      '<div><p class="micro-hw-modal__title" id="microHwEditTitle"></p>' +
          '<p class="micro-hw-modal__sub" id="microHwEditSub"></p>' +
          '<p class="micro-hw-modal__lead" id="microHwEditLead"></p></div>' +
      '<button type="button" class="micro-hw-modal__close" data-act="close" aria-label="Close">×</button>' +
          '</div>') +
      '<div class="soft-pad-keycap-editor__scroll">' +
      // Effect first — stay visible while picking a capability below.
      '<section class="micro-hw-modal__effect-section soft-pad-keycap-editor__effect" id="microHwEffectSection">' +
      '<p class="micro-hw-modal__section-title" id="microHwEffectTitle"></p>' +
      '<p class="micro-hw-modal__effect-source" id="microHwEffectSource" hidden></p>' +
      '<p class="micro-hw-modal__effect-tip" id="microHwEditEffectTip" aria-live="polite"></p>' +
      '<p class="micro-hw-modal__status-note" id="microHwStatusLightNote" hidden></p>' +
      '<p class="micro-hw-modal__assign-hint" id="microHwAssignHint" hidden></p>' +
      '</section>' +
      '<section class="micro-hw-modal__cap-section" id="microHwCapSection">' +
      (inline ? '' : '<p class="micro-hw-modal__section-title" id="microHwCapTitle"></p>') +
      '<div class="micro-hw-modal__cap-list" id="microHwCapList" role="listbox"></div>' +
      '<select id="microHwEditSlot" class="micro-hw-modal__slot-hidden" aria-hidden="true" tabindex="-1"></select>' +
      '</section>' +
      '<details class="micro-hw-modal__details" id="microHwIconDetails">' +
      '<summary id="microHwIconDetailsSummary"></summary>' +
      '<p class="micro-hw-modal__details-hint" id="microHwIconDetailsHint"></p>' +
      '<input type="search" class="micro-hw-modal__search" id="microHwEditSearch" autocomplete="off" />' +
      '<div class="micro-hw-modal__icons" id="microHwEditIcons"></div>' +
      '<p class="micro-hw-modal__icon-preview" id="microHwIconPreviewTip" aria-live="polite"></p>' +
      '</details>' +
      '<details class="micro-hw-modal__details" id="microHwHwDetails">' +
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
      '</div>' +
      '<div class="micro-hw-modal__foot soft-pad-keycap-editor__foot">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="cancel"></button>' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-act="save"></button>' +
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
      // Keep host visible — layout page always shows an editor.
      layoutEd.hidden = false;
    }
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
    var opts = allSlotOptions(m).concat([{ id: '', label: '' }]);
    opts.forEach(function (o) {
      var id = String(o.id || '');
      var copy = capabilityCardCopy(id);
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
      if (host.parentNode) host.parentNode.classList.add('is-editing-key');
      markSoftPadPreviewFocus(microKeyId);
    }

    editDraft = {
      mapping: m,
      microKeyId: microKeyId,
      uiIconId: iconState.uiIconId,
      slotId: initialSlot,
      sourceScan: route.sourceScan || (def && def.sourceScan) || (suggest && suggest.sourceScan) || 0,
      sourceExtended: route.sourceExtended != null
        ? !!route.sourceExtended
        : !!(def && def.sourceExtended) || !!(suggest && suggest.sourceExtended),
      iconTouched: iconState.iconTouched,
      mode: mode,
      root: host,
      onClose: opts.onClose || null,
      onSaved: opts.onSaved || null
    };

    var keyLabel = humanMicroKeyLabel(microKeyId);
    var titleEl = document.getElementById('microHwEditTitle');
    var subEl = document.getElementById('microHwEditSub');
    var badgeEl = document.getElementById('microHwEditBadge');
    if (badgeEl) {
      badgeEl.textContent = t('softPadLayoutEditingBadge', '正在编辑');
    }
    if (mode === 'inline') {
      // Inline: only badge + bold key name — no extra instructional copy.
      if (subEl) subEl.textContent = keyLabel;
    } else {
      if (titleEl) titleEl.textContent = t('codexMicroEditTitle', '编辑这个键');
      if (subEl) subEl.textContent = keyLabel;
      var lead = document.getElementById('microHwEditLead');
      if (lead) {
        lead.textContent = isNavMicroKey(microKeyId)
      ? t('codexMicroPadNavEditSub', '方向键默认注入箭头；可选绑定能力覆盖')
          : t('codexMicroEditHint', '先选择这个键的动作；键帽图标只影响外观。');
      }
      var capTitle = document.getElementById('microHwCapTitle');
      if (capTitle) capTitle.textContent = t('codexMicroEditCapTitle', '这个键做什么');
    }
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
        '不连接实体键盘时无需设置。只有连接实体小键盘或调试扫描码时才需要。'
      );
    }

    var recBtn = document.getElementById('microHwEditRecord');
    if (recBtn) {
      recBtn.textContent = editDraft.sourceScan
        ? scanLabel(editDraft.sourceScan, editDraft.sourceExtended)
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
        ' · extended=' + (editDraft.sourceExtended ? '1' : '0');
    }

    renderCapabilityList(m);
    renderIconGrid('');
    showIconPreviewTip('');
    showCapabilityEffectTip();

    function bindAct(sel, fn) {
      var el = host.querySelector(sel);
      if (el) el.onclick = fn;
    }
    bindAct('[data-act="close"]', function () { closeEditKeycap({ reopenInline: false }); });
    var cancelBtn = host.querySelector('[data-act="cancel"]');
    if (cancelBtn) {
      cancelBtn.textContent = mode === 'inline'
        ? t('softPadLayoutResetDraft', '还原')
        : t('codexMicroEditCancel', '取消');
      cancelBtn.onclick = function () {
        if (mode === 'inline') {
          // Reload same key from saved pad state — never leave blank.
          openEditKeycap(m, microKeyId, { mode: 'inline' });
        } else {
          closeEditKeycap({ reopenInline: false });
        }
      };
    }
    var saveBtn = host.querySelector('[data-act="save"]');
    if (saveBtn) {
      saveBtn.textContent = t('codexMicroEditSave', '保存');
      saveBtn.onclick = function () { saveEditKeycap(); };
    }
    bindAct('[data-act="record"]', function () {
      startRecordNumpad(m, pad, microKeyId, function () {
        var r = routeForMicroKey(pad, microKeyId) || {};
        editDraft.sourceScan = r.sourceScan || 0;
        editDraft.sourceExtended = !!r.sourceExtended;
        var rb = document.getElementById('microHwEditRecord');
        if (rb) {
          rb.textContent = editDraft.sourceScan
            ? scanLabel(editDraft.sourceScan, editDraft.sourceExtended)
            : t('codexMicroPadTapRecord', '点击绑定');
        }
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
    var Hub = global.OneToneSoftPadHub;
    var mode = opts.mode;
    if (!mode) {
      mode = (softPadPanelActive() && Hub && typeof Hub.getView === 'function' && Hub.getView() === 'layout')
        ? 'inline'
        : 'modal';
    }
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

  function saveEditKeycap() {
    if (!editDraft) return;
    var m = editDraft.mapping;
    var pad = m.codexMicroPad;
    var mode = editDraft.mode;
    var keyId = editDraft.microKeyId;
    var onSaved = editDraft.onSaved;
    var slotId = String(editDraft.slotId || '').trim();
    if (slotId && findTriggerConflict(m, slotId, editDraft.microKeyId)) {
      toast(t('codexMicroPadChordConflict', '该能力的快捷键已被其他键位使用'));
      return;
    }
    var suggest = AGENT_NUMPAD_SUGGEST[editDraft.microKeyId];
    var navKey = isNavMicroKey(editDraft.microKeyId);
    var scan = (editDraft.microKeyId === 'ENC' || navKey) ? 0 : (editDraft.sourceScan || 0);
    upsertRoute(m, pad, editDraft.microKeyId, {
      uiIconId: editDraft.uiIconId,
      slotId: slotId,
      enabled: !!slotId,
      sourceScan: scan,
      sourceExtended: (editDraft.microKeyId === 'ENC' || navKey) ? false : editDraft.sourceExtended,
      advanced: navKey ? true : undefined
    });
    pad.layoutProfile = 'custom';
    if (pad.softwareEnhanceEnabled == null) pad.softwareEnhanceEnabled = true;
    if (slotId) ensureAgentKeyBinding(m, slotId);
    if (slotId && !scan && suggest && editDraft.microKeyId !== 'ENC' && !navKey) {
      upsertRoute(m, pad, editDraft.microKeyId, {
        sourceScan: suggest.sourceScan,
        sourceExtended: !!suggest.sourceExtended
      });
    }
    persistLayout(m);
    if (mode === 'inline') {
      // Keep editor open on the same key after save.
      closeEditKeycap(); // reopens inline by default
    } else {
      closeEditKeycap({ reopenInline: false });
    }
    if (typeof onSaved === 'function') {
      try { onSaved(m); } catch (_) {}
    }
    if (mode === 'inline' || softPadPanelActive()) {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.schedulePreviewPaint === 'function') {
        try { Hub.schedulePreviewPaint({ mapping: m }); } catch (_) {}
      }
      markSoftPadPreviewFocus(keyId);
    } else if (isPadManagerOpen()) {
      renderPadManager(m, { skipHookRefresh: true });
    } else {
      var targetHost = document.getElementById('codexMicroPadHostTarget');
      if (targetHost) renderTarget(targetHost, m);
    }
    notifyLinkedUi(m);
    toast(t('codexMicroEditSaved', '键帽已更新'));
  }

  /** Ensure Soft Pad can fire: pad routes need a matching agentBindings key row. */
  function ensureAgentKeyBinding(m, slotId) {
    var A = agent();
    var id = String(slotId || '').trim();
    if (!m || !id || !A || !A.slotById) return;
    var slot = A.slotById(id);
    if (!slot) return;
    if (!Array.isArray(m.agentBindings)) m.agentBindings = [];
    var chord = A.defaultKeyForSlot ? A.defaultKeyForSlot(id) : '';
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
      return;
    }
    m.agentBindings.push({
      slotId: id,
      actionId: slot.actionId,
      triggerType: 'key',
      triggerBinding: chord,
      enabled: true,
      executionMode: 'execute',
      activationScope: 'foregroundApp'
    });
  }

  function upsertRoute(m, pad, microKeyId, patch) {
    if (!pad.keys) pad.keys = [];
    var route = routeForMicroKey(pad, microKeyId);
    if (!route) {
      route = {
        microKeyId: microKeyId,
        sourceScan: 0,
        sourceExtended: false,
        slotId: '',
        uiIconId: '',
        enabled: false
      };
      pad.keys.push(route);
    }
    if (patch.sourceScan != null) route.sourceScan = patch.sourceScan;
    if (patch.sourceExtended != null) route.sourceExtended = !!patch.sourceExtended;
    if (patch.slotId != null) route.slotId = patch.slotId;
    if (patch.enabled != null) route.enabled = !!patch.enabled;
    if (patch.uiIconId != null) route.uiIconId = patch.uiIconId;
    if (patch.advanced != null) route.advanced = !!patch.advanced;
    // ENC / JOY / NAV stay screen-only — never auto-fill a physical scan.
    if (microKeyId === 'ENC' || microKeyId === 'JOY' || isNavMicroKey(microKeyId)) {
      if (microKeyId === 'ENC' || isNavMicroKey(microKeyId)) {
        route.sourceScan = 0;
        route.sourceExtended = false;
      }
      if (isNavMicroKey(microKeyId)) route.advanced = true;
    } else if (route.slotId && !route.sourceScan) {
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
    // Soft Pad: quiet layout IPC (includes keys). Modal/manager keeps full persist().
    if (softPadPanelActive()) persistLayout(m);
    else persist();
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
    toast(t('codexMicroPadRecordHint', '请按下小键盘上的目标键…'));
    var handler = function (e) {
      var code = String(e.code || '');
      if (code.indexOf('Numpad') !== 0 && code !== 'NumpadEnter') return;
      e.preventDefault();
      e.stopPropagation();
      document.removeEventListener('keydown', handler, true);
      var keyName = code === 'NumpadEnter' ? 'NumpadEnter' : code;
      var parsed = parseRecordedNumpad(keyName);
      if (!parsed) {
        toast(t('codexMicroPadRecordInvalid', '请录制小键盘区按键'));
        if (done) done();
        return;
      }
      var conflict = findSourceConflict(pad, parsed.scan, parsed.ext, microKeyId);
      if (conflict) {
        toast(t('codexMicroPadSourceConflict', '该小键盘键已被占用'));
        if (done) done();
        return;
      }
      upsertRoute(m, pad, microKeyId, {
        sourceScan: parsed.scan,
        sourceExtended: parsed.ext,
        enabled: true
      });
      toast(t('codexMicroPadRecordDone', '已绑定小键盘键'));
      if (done) done();
    };
    document.addEventListener('keydown', handler, true);
    setTimeout(function () {
      document.removeEventListener('keydown', handler, true);
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
    var m = Cap && Cap.activeCodexMapping ? Cap.activeCodexMapping() : null;
    if (payload && m) applyEnsurePayloadToMapping(m, payload);
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
    onPadReady: onPadReady,
    onOverlayDismissed: onOverlayDismissed,
    onCapabilitySelected: onCapabilitySelected,
    routeForSlot: routeForSlot,
    badgeForSlot: badgeForSlot,
    listPadMappings: listPadMappings,
    openEditKeycap: openEditKeycap,
    closeEditKeycap: closeEditKeycap,
    isEditKeycapOpen: isEditKeycapOpen,
    renderEditKeycapEditor: renderEditKeycapEditor,
    openPadManager: openPadManager,
    renderCodexMicroPadManager: renderCodexMicroPadManager,
    renderSoftPadPreview: renderSoftPadPreview,
    renderSoftPadLayoutPanel: renderSoftPadLayoutPanel,
    renderSoftPadPresentationPanel: renderSoftPadPresentationPanel,
    renderSoftPadRuntimePanel: renderSoftPadRuntimePanel,
    renderSoftPadAgentPanel: renderSoftPadAgentPanel,
    resolveSoftPadShowMode: resolveSoftPadShowMode,
    softPadShowModeLabel: softPadShowModeLabel,
    applySoftPadShowMode: applySoftPadShowMode,
    syncSoftPadShowModeChrome: syncSoftPadShowModeChrome,
    closePadManager: closePadManager,
    isPadManagerOpen: isPadManagerOpen,
    notifyLinkedUi: notifyLinkedUi,
    stopBackgroundWork: stopReadinessPoll,
    renderHardwarePad: renderHardwarePad,
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
