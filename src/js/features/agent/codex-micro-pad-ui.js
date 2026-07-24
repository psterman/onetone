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
      { microKeyId: 'AG00', uiLabelZh: 'Agent', uiLabelEn: 'Agent', kind: 'agent', gridRow: 2, gridCol: 2, agIndex: 0 },
      { microKeyId: 'AG01', uiLabelZh: 'Claude', uiLabelEn: 'Claude', kind: 'agent', gridRow: 2, gridCol: 3, agIndex: 1 },
      { microKeyId: 'AG02', uiLabelZh: 'Codex', uiLabelEn: 'Codex', kind: 'agent', gridRow: 2, gridCol: 4, agIndex: 2 },
      { microKeyId: 'PLUS', uiLabelZh: '加', uiLabelEn: 'Plus', kind: 'command', gridRow: 2, gridCol: 5, gridRowSpan: 2 },
      { microKeyId: 'NAV_LEFT', uiLabelZh: '左', uiLabelEn: 'Left', kind: 'nav', gridRow: 3, gridCol: 1 },
      { microKeyId: 'AG03', uiLabelZh: '权限', uiLabelEn: 'Permissions', kind: 'agent', gridRow: 3, gridCol: 2, agIndex: 3 },
      { microKeyId: 'AG04', uiLabelZh: '常用', uiLabelEn: 'Status', kind: 'agent', gridRow: 3, gridCol: 3, agIndex: 4 },
      { microKeyId: 'AG05', uiLabelZh: '应用', uiLabelEn: 'Apps', kind: 'agent', gridRow: 3, gridCol: 4, agIndex: 5 },
      { microKeyId: 'NAV_DOWN', uiLabelZh: '下', uiLabelEn: 'Down', kind: 'nav', gridRow: 4, gridCol: 1 },
      { microKeyId: 'ACT09', uiLabelZh: '上下文', uiLabelEn: 'Context', kind: 'command', gridRow: 4, gridCol: 2 },
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
      { microKeyId: 'AG00', sourceScan: 0x47, sourceExtended: false, slotId: 'switchAgent', uiIconId: 'agent' },
      { microKeyId: 'AG01', sourceScan: 0x48, sourceExtended: false, slotId: 'claudeModel', uiIconId: 'claude' },
      { microKeyId: 'AG02', sourceScan: 0x49, sourceExtended: false, slotId: 'switchModel', uiIconId: 'model' },
      { microKeyId: 'AG03', sourceScan: 0x4B, sourceExtended: false, slotId: 'permissions', uiIconId: 'folder' },
      { microKeyId: 'AG04', sourceScan: 0x4C, sourceExtended: false, slotId: 'status', uiIconId: 'status' },
      { microKeyId: 'AG05', sourceScan: 0x4D, sourceExtended: false, slotId: 'appsOrPlugins', uiIconId: 'cloud' },
      { microKeyId: 'ACT06', sourceScan: 0x37, sourceExtended: false, slotId: 'quickChat', uiIconId: 'fast' },
      { microKeyId: 'ACT07', sourceScan: 0x35, sourceExtended: true, slotId: 'commandPalette', uiIconId: 'palette' },
      { microKeyId: 'ACT08', sourceScan: 0x4A, sourceExtended: false, slotId: 'cancel', uiIconId: 'reject' },
      { microKeyId: 'ACT09', sourceScan: 0x4F, sourceExtended: false, slotId: 'newThread', uiIconId: 'fork' },
      { microKeyId: 'UNDO', sourceScan: 0x50, sourceExtended: false, slotId: 'undo', uiIconId: 'undo' },
      { microKeyId: 'SEARCH', sourceScan: 0x51, sourceExtended: false, slotId: 'quickSearch', uiIconId: 'search' },
      { microKeyId: 'ACT10', sourceScan: 0x52, sourceExtended: false, slotId: 'pushToTalk', uiIconId: 'mic' },
      { microKeyId: 'ACT12', sourceScan: 0x1C, sourceExtended: true, slotId: 'stopOrSend', uiIconId: 'send' },
      { microKeyId: 'ENC', sourceScan: 0, sourceExtended: false, slotId: 'summonCodex', uiIconId: 'power' },
      { microKeyId: 'PLUS', sourceScan: 0x4E, sourceExtended: false, slotId: '', uiIconId: 'plus' },
      { microKeyId: 'DOT', sourceScan: 0x53, sourceExtended: false, slotId: '', uiIconId: 'dot' }
    ]
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
    AG00: 'agent',
    AG01: 'claude',
    AG02: 'model',
    AG03: 'folder',
    AG04: 'status',
    AG05: 'cloud',
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
    power: '<svg viewBox="0 0 24 24"><path d="M12 3v6"/><path d="M8.5 5.2a7 7 0 101.5 10.1"/></svg>',
    codex: '<svg viewBox="0 0 24 24"><path d="M12 3l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z"/></svg>',
    palette: '<svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/></svg>',
    status: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    plan: '<svg viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>',
    review: '<svg viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    folder: '<svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>',
    cloud: '<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 00.5-8 5.5 5.5 0 00-10.7 1.5A3.5 3.5 0 007 18z"/></svg>',
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
      overlayEnabled: !!pad.overlayEnabled
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

  function padInvoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!fn) return Promise.resolve(null);
    return fn(cmd, args || {});
  }

  function applyEnsurePayloadToMapping(m, payload) {
    if (!m || !payload) return;
    if (payload.codexMicroPad) m.codexMicroPad = payload.codexMicroPad;
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

  function ensurePad(m, opts) {
    opts = opts || {};
    if (!m) return null;
    if (opts.force || !m.codexMicroPad) {
      m.codexMicroPad = {
        enabled: true,
        requireForeground: true,
        requireNumLockOff: false,
        overlayEnabled: true,
        layoutProfile: 'standard',
        softwareEnhanceEnabled: false,
        codexStatusLightsEnabled: false,
        keys: defaultSeedRoutes()
      };
      if (opts.persist !== false) persist();
      return m.codexMicroPad;
    }
    if (!Array.isArray(m.codexMicroPad.keys)) m.codexMicroPad.keys = [];
    if (!m.codexMicroPad.layoutProfile) m.codexMicroPad.layoutProfile = 'standard';
    if (m.codexMicroPad.softwareEnhanceEnabled == null) {
      m.codexMicroPad.softwareEnhanceEnabled = false;
    }
    if (m.codexMicroPad.codexStatusLightsEnabled == null) {
      m.codexMicroPad.codexStatusLightsEnabled = false;
    }
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
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var p = String(profile || 'standard').trim();
    if (LAYOUT_PROFILES.indexOf(p) < 0 && p !== 'custom') p = 'standard';
    pad.layoutProfile = p;
    if (p !== 'advanced') pad.softwareEnhanceEnabled = false;
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
    if (opts.persist !== false) persist();
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
    pad.layoutProfile = data.layoutProfile === 'custom'
      ? 'custom'
      : (LAYOUT_PROFILES.indexOf(data.layoutProfile) >= 0 ? data.layoutProfile : 'custom');
    pad.softwareEnhanceEnabled = !!data.softwareEnhanceEnabled;
    if (Array.isArray(data.keys)) {
      pad.keys = data.keys.map(function (k) {
        return seedRoute(k || {});
      });
    }
    healEncScreenOnly(pad);
    persist();
    return true;
  }

  function copyAsCustomLayout(m) {
    ensurePad(m, { persist: false });
    var snap = exportLayoutJson(m);
    snap.layoutProfile = 'custom';
    importLayoutJson(m, snap);
    toast(t('codexMicroPadCopiedCustom', '已复制为自定义布局'));
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
    persist();
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

  function notifyLinkedUi(m) {
    // Pad-only refresh. Never call AgentCapabilityUi.refresh() here — that remounts
    // camera/MediaPipe and has 假死'd the UI when toggling Micro enable.
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
    var body = document.getElementById('codexPadMgrBody');
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

  function allSlotOptions() {
    var A = agent();
    if (!A || !A.SLOTS) return [];
    return A.SLOTS.map(function (s) {
      return { id: s.slotId, label: lang().indexOf('en') === 0 ? s.labelEn : s.labelZh };
    });
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
    // Preview uses local state; other modes reflect pad.enabled for shell color.
    var codexOn = mode === 'preview'
      ? previewPadMode === 'codex'
      : !!(pad && pad.enabled);
    var shellCls = 'micro-hw-shell'
      + (codexOn ? ' is-mode-codex' : ' is-mode-numpad');

    var html =
      '<div class="micro-hw-wrap">' +
      '<div class="' + shellCls + '">' +
      '<div class="micro-hw' + sizeCls + compactCls + (codexOn ? '' : ' is-mode-numpad') + '">' +
      '<div class="micro-hw__face">' +
      '<div class="micro-hw__grid' + (codexOn ? '' : ' micro-hw__grid--numpad') + '">';

    var cells = codexOn ? LAYOUT.cells : (LAYOUT.numpadCells || LAYOUT.cells);
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
      html += '<' + tag + typeAttr + ' class="' + cls + '" data-micro-key="' + esc(cell.microKeyId) + '"' +
        ' data-run-status="' + esc(runSt) + '"' +
        agAttr + encModeAttr + ' style="' + style + '" aria-label="' + esc(ariaTip) + '"' +
        (cell.microKeyId === 'ENC' ? ' role="switch" aria-checked="' + (codexOn ? 'true' : 'false') + '"' : '') +
        '>';

      var iconId = resolveIconId(route, cell.microKeyId);
      if (isNp) {
        html += '<span class="micro-hw__digit" aria-hidden="true">' + esc(cell.digit || cell.uiLabelZh || '') + '</span>';
      } else {
        html += '<span class="micro-hw__icon" aria-hidden="true">' + iconSvg(iconId) + '</span>';
      }
      if (!isNp) {
        var metaName = '';
        var metaChord = '';
        if (cell.microKeyId === 'ENC') {
          metaName = tipName;
          metaChord = codexOn ? 'ON' : 'OFF';
        } else if (isNavMicroKey(cell.microKeyId)) {
          metaName = cellLabel(cell);
          metaChord = bound && route && route.slotId
            ? friendlyChord(chordForSlot(m, route.slotId))
            : t('codexMicroPadNavDefault', '默认注入方向键');
        } else if (bound && route && route.slotId) {
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
        } else {
          metaName = cellLabel(cell);
          metaChord = t('codexMicroPadUnbound', '未配置');
        }
        if (metaName || metaChord) {
          html += '<span class="micro-hw__meta" aria-hidden="true">'
            + (metaName ? '<span class="micro-hw__meta-name">' + esc(metaName) + '</span>' : '')
            + (metaChord ? '<span class="micro-hw__meta-chord">' + esc(metaChord) + '</span>' : '')
            + '</span>';
        }
      }
      html += '</' + tag + '>';
    });

    html += '</div>' +
      '<div class="micro-hw__leds" data-pad-status="' + esc(padRunStatus) + '" aria-hidden="true">' +
      '<span class="micro-hw__led"></span><span class="micro-hw__led"></span><span class="micro-hw__led"></span>' +
      '</div></div></div></div>' +
      '</div>';
    return html;
  }

  function isNavMicroKey(id) {
    return /^NAV_/.test(String(id || ''));
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
    if (res.ok) return;
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

  function renderHookStatusCard(pad) {
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
      '</details>' +
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

  function renderClaudeActivityPadCard() {
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
      '</details>' +
      '</div>'
    );
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
      var nameEl = el.querySelector('.micro-hw__meta-name');
      var chordEl = el.querySelector('.micro-hw__meta-chord');
      var label = String(info.label || '').trim();
      var sub = String(info.sub || '').trim();
      if (nameEl && label) nameEl.textContent = label;
      if (chordEl && sub) chordEl.textContent = sub;
      else if (chordEl && src) chordEl.textContent = statusSourceLabelFor(src, '');
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
            '<tr data-host-key="' + esc(r.hostKey || '') + '" data-act="claude-light-row">' +
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
          tr.addEventListener('click', function () {
            renderClaudeActDetail(tr.getAttribute('data-host-key'));
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

  function refreshClaudeActivityPad() {
    var root = document.getElementById('codexClaudeActivityPad');
    if (!root) return Promise.resolve(null);
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

  function refreshHookSetupStatus(m) {
    return padInvoke('cmd_codex_hook_setup_status', {
      mappingId: m && m.id ? String(m.id) : null
    }).then(function (st) {
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

  var padManagerMapping = null;

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
    modal.hidden = false;
    renderPadManager(m);
  }

  function closePadManager() {
    stopTryKeyListener();
    padManagerMapping = null;
    padUiMode = 'edit';
    var modal = document.getElementById('codexMicroPadManager');
    if (modal) modal.hidden = true;
    var more = document.getElementById('codexPadMgrMore');
    if (more) more.hidden = true;
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    var Cap = global.OneToneAgentCapabilityUi;
    var cur = Cap && Cap.activeCodexMapping ? Cap.activeCodexMapping() : null;
    // Soft remount — skip ensure_ready (sync save under modal close used to 假死).
    if (targetHost && !targetHost.hidden && cur) renderTarget(targetHost, cur, { skipEnsure: true });
  }

  function isPadManagerOpen() {
    var modal = document.getElementById('codexMicroPadManager');
    return !!(modal && !modal.hidden && padManagerMapping);
  }

  function renderPadManager(m, opts) {
    opts = opts || {};
    m = m || padManagerMapping;
    if (!m) return;
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var showEnhance = pad.layoutProfile === 'advanced';
    var body = document.getElementById('codexPadMgrBody');
    var modal = ensurePadManagerModal();
    if (!body) return;

    var padBindMode = padUiMode === 'run' ? 'run' : (padUiMode === 'try' ? 'try' : 'config');
    body.innerHTML =
      '<div class="codex-pad-mgr__section">' +
      '<p class="codex-pad-mgr__label">' + esc(t('codexMicroPadProfileLbl', '布局')) + '</p>' +
      renderProfileSeg(pad) +
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
      (showEnhance
        ? ('<label class="codex-pad-mgr__setting"><input type="checkbox" data-act="enhance"' +
          (pad.softwareEnhanceEnabled ? ' checked' : '') + '>' +
          esc(t('codexMicroPadEnhanceEnable', '软件增强：总开关滚轮 / 摇杆方向')) + '</label>')
        : '') +
      '</div>' +
      renderHookStatusCard(pad) +
      renderClaudeActivityPadCard() +
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
      '<div class="codex-pad-mgr__pad" id="codexPadMgrPad">' +
      renderHardwarePad(m, pad, { mode: padBindMode }) +
      '</div>' +
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

    body.querySelectorAll('[data-pad-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-mode');
        if (!next || next === padUiMode) return;
        if (padUiMode === 'try' && next !== 'try') stopTryKeyListener();
        padUiMode = next;
        renderPadManager(m, { skipHookRefresh: true });
      });
    });
    body.querySelectorAll('[data-pad-profile]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-profile');
        if (!next) return;
        applyLayoutProfile(m, next, { persist: true });
        if (next !== 'advanced') pad.softwareEnhanceEnabled = false;
        toast(t('codexMicroPadProfileApplied', '已切换布局：{p}').replace('{p}',
          next === 'beginner' ? t('codexMicroPadProfileBeginner', '入门')
            : next === 'advanced' ? t('codexMicroPadProfileAdvanced', '高级')
              : t('codexMicroPadProfileStandard', '标准')));
        renderPadManager(m, { skipHookRefresh: true });
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
        // Soft shell only — full renderPadManager on every click 假死'd the modal.
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
        persist();
        renderPadManager(m, { skipHookRefresh: true });
        notifyLinkedUi(m);
      });
    }

    var lightsEl = body.querySelector('[data-act="status-lights"]');
    if (lightsEl) {
      lightsEl.addEventListener('change', function () {
        setStatusLightsEnabled(m, !!lightsEl.checked);
      });
    }
    var hookCopyBtn = body.querySelector('[data-act="hook-copy"]');
    if (hookCopyBtn) {
      hookCopyBtn.addEventListener('click', function () { copyHookDraft(m); });
    }
    var hookDocsBtn = body.querySelector('[data-act="hook-docs"]');
    if (hookDocsBtn) {
      hookDocsBtn.addEventListener('click', function () { openHookDocs(); });
    }
    var hookRefreshBtn = body.querySelector('[data-act="hook-refresh"]');
    if (hookRefreshBtn) {
      hookRefreshBtn.addEventListener('click', function () {
        refreshHookSetupStatus(m).then(function () { refreshPadDiagnose(); });
      });
    }
    var diagRefreshBtn = body.querySelector('[data-act="pad-diag-refresh"]');
    if (diagRefreshBtn) {
      diagRefreshBtn.addEventListener('click', function () { refreshPadDiagnose(); });
    }
    body.querySelectorAll('[data-act="pad-diag-filter"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setPadDiagFilter(btn.getAttribute('data-filter') || 'all');
      });
    });
    var diagDetails = body.querySelector('#codexPadDiag');
    if (diagDetails) {
      diagDetails.addEventListener('toggle', function () {
        if (diagDetails.open) refreshPadDiagnose();
      });
    }
    var claudeRefreshBtn = body.querySelector('[data-act="claude-act-refresh"]');
    if (claudeRefreshBtn) {
      claudeRefreshBtn.addEventListener('click', function () { refreshPadDiagnose(); });
    }
    var claudeRedetect = body.querySelector('[data-act="claude-hook-redetect"]');
    if (claudeRedetect) {
      claudeRedetect.addEventListener('click', function () {
        redetectClaudeHookSetup();
      });
    }
    var claudeHookCopy = body.querySelector('[data-act="claude-hook-copy"]');
    if (claudeHookCopy) {
      claudeHookCopy.addEventListener('click', function () { copyClaudeHookDraft(); });
    }
    var claudeHookOpen = body.querySelector('[data-act="claude-hook-open"]');
    if (claudeHookOpen) {
      claudeHookOpen.addEventListener('click', function () { openClaudeSettingsFile(); });
    }
    var claudeHookPreview = body.querySelector('[data-act="claude-hook-preview"]');
    if (claudeHookPreview) {
      claudeHookPreview.addEventListener('click', function () { previewClaudeHookInstall(); });
    }
    var claudeHookInstall = body.querySelector('[data-act="claude-hook-install"]');
    if (claudeHookInstall) {
      claudeHookInstall.addEventListener('click', function () { confirmClaudeHookInstall(); });
    }
    var claudeHookUnPrev = body.querySelector('[data-act="claude-hook-uninstall-preview"]');
    if (claudeHookUnPrev) {
      claudeHookUnPrev.addEventListener('click', function () { previewClaudeHookUninstall(); });
    }
    var claudeHookUn = body.querySelector('[data-act="claude-hook-uninstall"]');
    if (claudeHookUn) {
      claudeHookUn.addEventListener('click', function () { confirmClaudeHookUninstall(); });
    }
    var claudeCliPref = body.querySelector('[data-act="claude-cli-pref-toggle"]');
    if (claudeCliPref) {
      claudeCliPref.addEventListener('click', function () { toggleClaudeCliInjectPref(m); });
    }
    body.querySelectorAll('[data-act="claude-inject"]').forEach(function (btn) {
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
    if (claudeClearBtn) {
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
      d.addEventListener('toggle', function () {
        if (d.open) refreshClaudeActivityPad();
      });
    });
    // Initial Claude Activity paint (shared diagnose cache).
    refreshClaudeActivityPad();
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
    // Hook status IPC only on open / explicit refresh — every remount used to stack IPC + 假死.
    if (opts.refreshHook !== false && !opts.skipHookRefresh) {
      refreshHookSetupStatus(m);
    }

    body.querySelector('[data-act="restore"]').addEventListener('click', function () {
      var profile = pad.layoutProfile === 'beginner' || pad.layoutProfile === 'advanced'
        ? pad.layoutProfile
        : 'standard';
      applyLayoutProfile(m, profile, { persist: true, resetKeys: true });
      renderPadManager(m, { skipHookRefresh: true });
      notifyLinkedUi(m);
      toast(t('codexMicroPadRestored', '已恢复默认：实体 12 键 + 屏幕总开关'));
    });
    body.querySelector('[data-act="export"]').addEventListener('click', function () {
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

    var moreMenu = body.querySelector('#codexPadMgrMore');
    body.querySelector('[data-act="more-toggle"]').addEventListener('click', function (e) {
      e.stopPropagation();
      if (!moreMenu) return;
      moreMenu.hidden = !moreMenu.hidden;
    });
    body.querySelector('[data-act="copyCustom"]').addEventListener('click', function () {
      copyAsCustomLayout(m);
      if (moreMenu) moreMenu.hidden = true;
      renderPadManager(m, { skipHookRefresh: true });
      notifyLinkedUi(m);
    });
    var fileEl = body.querySelector('[data-act="importFile"]');
    body.querySelector('[data-act="import"]').addEventListener('click', function () {
      if (moreMenu) moreMenu.hidden = true;
      if (fileEl) fileEl.click();
    });
    if (fileEl) {
      fileEl.addEventListener('change', function () {
        var file = fileEl.files && fileEl.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var data = JSON.parse(String(reader.result || ''));
            if (importLayoutJson(m, data)) {
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
    body.querySelector('[data-act="clear"]').addEventListener('click', function () {
      if (moreMenu) moreMenu.hidden = true;
      if (!window.confirm(t('codexMicroPadClearConfirm', '确定清空所有小键盘映射？'))) return;
      pad.keys = [];
      protectPrimaryLayout(pad);
      persist();
      renderPadManager(m, { skipHookRefresh: true });
      notifyLinkedUi(m);
      toast(t('codexMicroPadCleared', '已清空小键盘映射'));
    });

    if (padUiMode === 'try') startTryKeyListener(m);
    else stopTryKeyListener();
    bindPadClicks(body.querySelector('#codexPadMgrPad'), m, padBindMode);
    modal.hidden = false;
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
        if (mode === 'edit' || mode === 'config') {
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
      if (mode === 'edit' || mode === 'config') {
        // Edit/config always opens keycap editor — never bind hold-fire (pushToTalk used to
        // swallow clicks so「编辑：点击键帽」looked like 面板没有变化).
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
    if (!host || !m) {
      stopReadinessPoll();
      if (host) { host.innerHTML = ''; host.hidden = true; }
      return;
    }
    // Recognition page: config + physical-key preview; never fire actions from this surface.
    if (!isPadManagerOpen()) {
      stopTryKeyListener();
    }
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    host.hidden = false;
    host.classList.remove('is-pad-run', 'is-pad-try');
    padUiMode = 'config';
    var readyBanner = renderReadinessBanner(lastReadiness);
    host.innerHTML =
      '<div class="codex-micro-pad codex-micro-pad--inline">' +
      readyBanner +
      '<div class="codex-micro-pad__cta-row">' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-act="cta">' +
      esc(t('codexMicroPadCta', '标准版：实体小键盘 12 键 + 屏幕总开关')) + '</button>' +
      '<p class="codex-micro-pad__cta-sub">' +
      esc(t('codexMicroPadCtaSub', '普通数字键盘 12 键 + 屏幕总开关，开箱模拟 Codex Micro 标准版')) +
      '</p></div>' +
      '<label class="codex-micro-pad__toggle codex-micro-pad__toggle--enable">' +
      '<input type="checkbox" data-act="enabled"' + (pad.enabled ? ' checked' : '') + '>' +
      esc(t('codexMicroPadEnableCodex', 'Codex 场景映射（关=数字键模式）')) + '</label>' +
      renderHardwarePad(m, pad, { mode: 'config' }) +
      '<div class="codex-micro-pad__inline-actions">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="manage">' +
      esc(t('codexMicroPadManage', '管理小键盘')) + '</button>' +
      '</div></div>';

    var ctaBtn = host.querySelector('[data-act="cta"]');
    if (ctaBtn) {
      ctaBtn.addEventListener('click', function () {
        applyNumpadControllerStandard({ mode: 'openExisting', openPanel: false });
        renderTarget(host, m);
        notifyLinkedUi(m);
      });
    }

    var enabledEl = host.querySelector('[data-act="enabled"]');
    if (enabledEl) {
      enabledEl.addEventListener('change', function () {
        pad.enabled = !!enabledEl.checked;
        previewPadMode = pad.enabled ? 'codex' : 'numpad';
        // Enabling the layer also turns on foreground overlay by default (fewer checkboxes).
        if (pad.enabled) pad.overlayEnabled = true;
        persistPadFlags(m);
        var triggerHost = document.getElementById('codexMicroPadHostTrigger');
        if (triggerHost && !triggerHost.hidden) refreshTrigger(m);
        // Soft shell swap only — full renderTarget+ensure_ready remount storm 假死's keys panel.
        if (!remountTargetPadShell(host, m)) {
          renderTarget(host, m, { skipEnsure: true });
        }
        padInvoke('cmd_codex_micro_pad_get_readiness', {}).then(function (r) {
          if (r) updateReadinessDom(host, r);
        });
      });
    }

    var manageBtn = host.querySelector('[data-act="manage"]');
    if (manageBtn) {
      manageBtn.addEventListener('click', function () {
        openPadManager(m);
      });
    }

    // Silent edit: tap keycaps to change capability — physical keys highlight mapping.
    bindPadClicks(host, m, 'config');
    if (opts.skipEnsure) {
      if (keysPanelActive()) startReadinessPoll(host);
      return;
    }
    requestPadEnsureReady(m, function (res) {
      // User may have left keys for「我的习惯」while ensure_ready was in flight.
      if (!keysPanelActive()) {
        stopReadinessPoll();
        return;
      }
      if (res && res.readiness) updateReadinessDom(host, res.readiness);
      if (res && res.changed) {
        // One soft remount without nested ensure_ready / notifyLinkedUi→renderTarget loop (假死).
        renderTarget(host, m, { skipEnsure: true });
        refreshTrigger(m);
        return;
      }
      startReadinessPoll(host);
    });
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
    el.innerHTML =
      '<div class="micro-hw-modal__card" role="dialog" aria-modal="true">' +
      '<div class="micro-hw-modal__head">' +
      '<div><p class="micro-hw-modal__title" id="microHwEditTitle"></p>' +
      '<p class="micro-hw-modal__sub" id="microHwEditSub"></p></div>' +
      '<button type="button" class="micro-hw-modal__close" data-act="close" aria-label="Close">×</button>' +
      '</div>' +
      '<input type="search" class="micro-hw-modal__search" id="microHwEditSearch" placeholder="" />' +
      '<div class="micro-hw-modal__icons" id="microHwEditIcons"></div>' +
      '<div class="micro-hw-modal__assign">' +
      '<div><p class="micro-hw-modal__assign-label" id="microHwAssignTitle"></p>' +
      '<p class="micro-hw-modal__assign-hint" id="microHwAssignHint"></p></div>' +
      '<div class="micro-hw-modal__assign-controls">' +
      '<select id="microHwEditSlot"></select>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="record" id="microHwEditRecord"></button>' +
      '</div></div>' +
      '<details class="micro-hw-modal__debug" id="microHwEditDebug">' +
      '<summary id="microHwEditDebugSummary"></summary>' +
      '<p class="micro-hw-modal__debug-line" id="microHwEditDebugScan"></p>' +
      '</details>' +
      '<div class="micro-hw-modal__foot">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="cancel"></button>' +
      '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-act="save"></button>' +
      '</div></div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) closeEditKeycap();
    });
    return el;
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
      btn.innerHTML =
        '<span class="micro-hw__icon">' + iconSvg(def.id) + '</span>' +
        '<span class="micro-hw-modal__icon-label">' + esc(def.label) + '</span>';
      btn.addEventListener('click', function () {
        editDraft.uiIconId = def.id;
        renderIconGrid(document.getElementById('microHwEditSearch').value);
      });
      host.appendChild(btn);
    });
  }

  function openEditKeycap(m, microKeyId) {
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    var route = routeForMicroKey(pad, microKeyId) || {};
    var suggest = AGENT_NUMPAD_SUGGEST[microKeyId];
    var def = LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === microKeyId; });
    editDraft = {
      mapping: m,
      microKeyId: microKeyId,
      uiIconId: resolveIconId(route, microKeyId),
      slotId: route.slotId || (def && def.slotId) || '',
      sourceScan: route.sourceScan || (def && def.sourceScan) || (suggest && suggest.sourceScan) || 0,
      sourceExtended: route.sourceExtended != null
        ? !!route.sourceExtended
        : !!(def && def.sourceExtended) || !!(suggest && suggest.sourceExtended)
    };

    var modal = ensureEditModal();
    document.getElementById('microHwEditTitle').textContent =
      t('codexMicroEditTitle', '编辑键帽');
    document.getElementById('microHwEditSub').textContent = isNavMicroKey(microKeyId)
      ? t('codexMicroPadNavEditSub', '方向键默认注入箭头；可选绑定能力覆盖')
      : t('codexMicroEditHint', '选择显示在 {id} 上的图标').replace('{id}', microKeyId);
    var search = document.getElementById('microHwEditSearch');
    search.placeholder = t('codexMicroEditSearch', '搜索键帽');
    search.value = '';
    document.getElementById('microHwAssignTitle').textContent =
      t('codexMicroAssignedShortcut', '已分配快捷键');
    document.getElementById('microHwEditRecord').textContent =
      editDraft.sourceScan
        ? scanLabel(editDraft.sourceScan, editDraft.sourceExtended)
        : (microKeyId === 'ENC'
          ? t('codexMicroPadScreenPower', '屏幕总开关')
          : (isNavMicroKey(microKeyId)
            ? t('codexMicroPadNavScreenOnly', '屏幕方向键 · 无实体扫码')
            : t('codexMicroPadTapRecord', '点击绑定')));
    var dbgSum = document.getElementById('microHwEditDebugSummary');
    var dbgScan = document.getElementById('microHwEditDebugScan');
    if (dbgSum) dbgSum.textContent = t('codexMicroPadDebugSummary', '诊断（scanCode）');
    if (dbgScan) {
      dbgScan.textContent = 'microKeyId=' + microKeyId +
        ' · sourceScan=0x' + Number(editDraft.sourceScan || 0).toString(16) +
        ' · extended=' + (editDraft.sourceExtended ? '1' : '0');
    }
    if (microKeyId === 'ENC' || isNavMicroKey(microKeyId)) {
      var recBtn = document.getElementById('microHwEditRecord');
      if (recBtn) {
        recBtn.disabled = true;
        recBtn.title = microKeyId === 'ENC'
          ? t('codexMicroPadEncScreenOnly', '总开关默认仅屏幕点击，不占用小键盘 0（说话键）')
          : t('codexMicroPadNavScreenOnly', '屏幕方向键 · 无实体扫码');
      }
    } else {
      var recBtn2 = document.getElementById('microHwEditRecord');
      if (recBtn2) {
        recBtn2.disabled = false;
        recBtn2.title = '';
      }
    }

    var slotSel = document.getElementById('microHwEditSlot');
    slotSel.innerHTML = '<option value="">' + esc(isNavMicroKey(microKeyId)
      ? t('codexMicroPadNavDefaultSlot', '默认 · 注入方向键')
      : t('codexMicroPadPickSlot', '选择能力')) + '</option>';
    allSlotOptions().forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o.id;
      opt.textContent = o.label;
      if (o.id === editDraft.slotId) opt.selected = true;
      slotSel.appendChild(opt);
    });
    updateAssignHint();

    renderIconGrid('');
    search.oninput = function () { renderIconGrid(search.value); };
    slotSel.onchange = function () {
      editDraft.slotId = String(slotSel.value || '').trim();
      updateAssignHint();
    };

    modal.querySelector('[data-act="close"]').onclick = closeEditKeycap;
    modal.querySelector('[data-act="cancel"]').textContent = t('codexMicroEditCancel', '取消');
    modal.querySelector('[data-act="cancel"]').onclick = closeEditKeycap;
    modal.querySelector('[data-act="save"]').textContent = t('codexMicroEditSave', '保存');
    modal.querySelector('[data-act="save"]').onclick = function () { saveEditKeycap(); };
    modal.querySelector('[data-act="record"]').onclick = function () {
      startRecordNumpad(m, pad, microKeyId, function () {
        var r = routeForMicroKey(pad, microKeyId) || {};
        editDraft.sourceScan = r.sourceScan || 0;
        editDraft.sourceExtended = !!r.sourceExtended;
        document.getElementById('microHwEditRecord').textContent =
          editDraft.sourceScan
            ? scanLabel(editDraft.sourceScan, editDraft.sourceExtended)
            : t('codexMicroPadTapRecord', '点击绑定');
      });
    };

    // Ensure edit layer is above pad manager (DOM order + CSS z-index).
    if (modal.parentNode === document.body) {
      document.body.appendChild(modal);
    }
    modal.hidden = false;
    try {
      padInvoke('cmd_app_log', { line: 'fe openEditKeycap id=' + String(microKeyId || '') });
    } catch (_) {}
  }

  function updateAssignHint() {
    var hint = document.getElementById('microHwAssignHint');
    if (!hint || !editDraft) return;
    var chord = editDraft.slotId
      ? slotSubForDisplay(editDraft.mapping, editDraft.slotId)
      : '';
    hint.textContent = editDraft.slotId
      ? (slotLabel(editDraft.slotId) + (chord ? ' · ' + chord : ''))
      : t('codexMicroPadUnbound', '未配置');
  }

  function closeEditKeycap() {
    var modal = document.getElementById('codexMicroEditModal');
    if (modal) modal.hidden = true;
    editDraft = null;
  }

  function saveEditKeycap() {
    if (!editDraft) return;
    var m = editDraft.mapping;
    var pad = m.codexMicroPad;
    var slotId = editDraft.slotId;
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
    if (slotId && !scan && suggest && editDraft.microKeyId !== 'ENC' && !navKey) {
      upsertRoute(m, pad, editDraft.microKeyId, {
        sourceScan: suggest.sourceScan,
        sourceExtended: !!suggest.sourceExtended
      });
    }
    closeEditKeycap();
    if (isPadManagerOpen()) {
      renderPadManager(m, { skipHookRefresh: true });
    } else {
      var targetHost = document.getElementById('codexMicroPadHostTarget');
      if (targetHost) renderTarget(targetHost, m);
    }
    notifyLinkedUi(m);
    toast(t('codexMicroEditSaved', '键帽已更新'));
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
    persist();
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
    if (host) renderTrigger(host, m);
  }

  function mount(step, m) {
    var triggerHost = document.getElementById('codexMicroPadHostTrigger');
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    if (!m) {
      clearTriggerHeroPreview();
      if (triggerHost) { triggerHost.innerHTML = ''; triggerHost.hidden = true; }
      if (targetHost) { targetHost.innerHTML = ''; targetHost.hidden = true; }
      return;
    }
    if (step === 'trigger') {
      padUiMode = 'preview';
      renderTrigger(triggerHost, m);
      if (targetHost) { targetHost.innerHTML = ''; targetHost.hidden = true; }
    } else if (step === 'target') {
      clearTriggerHeroPreview();
      if (padUiMode !== 'edit' && padUiMode !== 'run') {
        padUiMode = 'edit';
      }
      renderTarget(targetHost, m);
      if (triggerHost) { triggerHost.innerHTML = ''; triggerHost.hidden = true; }
    } else {
      clearTriggerHeroPreview();
      if (triggerHost) { triggerHost.innerHTML = ''; triggerHost.hidden = true; }
      if (targetHost) { targetHost.innerHTML = ''; targetHost.hidden = true; }
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
    var cfg = global.OneToneState && global.OneToneState.state && global.OneToneState.state.config;
    if (!cfg || !Array.isArray(cfg.mappings)) return;
    var changed = false;
    var last = null;
    for (var i = 0; i < cfg.mappings.length; i++) {
      var m = cfg.mappings[i];
      if (!m || !m.codexMicroPad) continue;
      if (m.codexMicroPad.overlayEnabled) {
        m.codexMicroPad.overlayEnabled = false;
        changed = true;
        last = m;
      }
    }
    if (!changed) return;
    if (!keysPanelActive() && !isPadManagerOpen()) return;
    var host = document.getElementById('codexMicroPadHostTarget');
    var Cap = global.OneToneAgentCapabilityUi;
    var cur = Cap && Cap.activeCodexMapping ? Cap.activeCodexMapping() : last;
    if (host && !host.hidden && cur) renderTarget(host, cur);
    else if (cur) notifyLinkedUi(cur);
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
    openPadManager: openPadManager,
    closePadManager: closePadManager,
    isPadManagerOpen: isPadManagerOpen,
    notifyLinkedUi: notifyLinkedUi,
    stopBackgroundWork: stopReadinessPoll,
    renderHardwarePad: renderHardwarePad,
    applyTriggerHeroPreview: applyTriggerHeroPreview,
    clearTriggerHeroPreview: clearTriggerHeroPreview,
    LAYOUT: LAYOUT,
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
    displayActionForSlot: displayActionForSlot
  };
})(typeof window !== 'undefined' ? window : globalThis);
