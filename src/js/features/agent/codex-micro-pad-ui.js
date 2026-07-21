/**
 * Codex Micro numpad layer UI — hardware 1:1 pad + Edit keycap modal.
 * Physical sourceScan/sourceExtended routes to agent slot; output chord stays on agentBindings.
 */
(function (global) {
  'use strict';

  var LAYOUT = {
    cells: [
      { microKeyId: 'ENC', uiLabelZh: '旋钮', uiLabelEn: 'Dial', kind: 'control', gridRow: 1, gridCol: 1 },
      { microKeyId: 'AG00', uiLabelZh: '任务 1', uiLabelEn: 'Agent 1', kind: 'agent', gridRow: 1, gridCol: 2, agIndex: 0 },
      { microKeyId: 'AG01', uiLabelZh: '任务 2', uiLabelEn: 'Agent 2', kind: 'agent', gridRow: 1, gridCol: 3, agIndex: 1 },
      { microKeyId: 'AG02', uiLabelZh: '任务 3', uiLabelEn: 'Agent 3', kind: 'agent', gridRow: 1, gridCol: 4, agIndex: 2 },
      { microKeyId: 'JOY', uiLabelZh: '摇杆', uiLabelEn: 'Stick', kind: 'control', gridRow: 1, gridCol: 5 },
      { microKeyId: 'AG03', uiLabelZh: '任务 4', uiLabelEn: 'Agent 4', kind: 'agent', gridRow: 2, gridCol: 2, agIndex: 3 },
      { microKeyId: 'AG04', uiLabelZh: '任务 5', uiLabelEn: 'Agent 5', kind: 'agent', gridRow: 2, gridCol: 3, agIndex: 4 },
      { microKeyId: 'AG05', uiLabelZh: '任务 6', uiLabelEn: 'Agent 6', kind: 'agent', gridRow: 2, gridCol: 4, agIndex: 5 },
      { microKeyId: 'ACT06', uiLabelZh: '快速', uiLabelEn: 'Fast', kind: 'command', gridRow: 3, gridCol: 2 },
      { microKeyId: 'ACT07', uiLabelZh: '命令菜单', uiLabelEn: 'Command palette', kind: 'command', gridRow: 3, gridCol: 3 },
      { microKeyId: 'ACT08', uiLabelZh: '拒绝', uiLabelEn: 'Reject', kind: 'command', gridRow: 3, gridCol: 4 },
      { microKeyId: 'ACT09', uiLabelZh: '分支', uiLabelEn: 'Fork', kind: 'command', gridRow: 3, gridCol: 5 },
      { microKeyId: 'ACT10', uiLabelZh: '开始说话', uiLabelEn: 'Mic', kind: 'command', gridRow: 4, gridCol: 2, gridColSpan: 2 },
      { microKeyId: 'ACT12', uiLabelZh: '发送', uiLabelEn: 'Send', kind: 'command', gridRow: 4, gridCol: 4 }
    ],
    defaultRoutes: [
      { microKeyId: 'AG00', sourceScan: 0x47, sourceExtended: false, slotId: 'status', uiIconId: 'status' },
      { microKeyId: 'AG01', sourceScan: 0x48, sourceExtended: false, slotId: 'plan', uiIconId: 'plan' },
      { microKeyId: 'AG02', sourceScan: 0x49, sourceExtended: false, slotId: 'review', uiIconId: 'review' },
      { microKeyId: 'AG03', sourceScan: 0x4B, sourceExtended: false, slotId: 'permissions', uiIconId: 'folder' },
      { microKeyId: 'AG04', sourceScan: 0x4C, sourceExtended: false, slotId: 'switchAgent', uiIconId: 'agent' },
      { microKeyId: 'AG05', sourceScan: 0x4D, sourceExtended: false, slotId: 'appsOrPlugins', uiIconId: 'cloud' },
      { microKeyId: 'ACT06', sourceScan: 0x37, sourceExtended: false, slotId: 'quickChat', uiIconId: 'fast' },
      { microKeyId: 'ACT07', sourceScan: 0x35, sourceExtended: true, slotId: 'commandPalette', uiIconId: 'palette' },
      { microKeyId: 'ACT08', sourceScan: 0x4A, sourceExtended: false, slotId: 'cancel', uiIconId: 'reject' },
      { microKeyId: 'ACT09', sourceScan: 0x4F, sourceExtended: false, slotId: 'newThread', uiIconId: 'fork' },
      { microKeyId: 'ACT10', sourceScan: 0x52, sourceExtended: false, slotId: 'pushToTalk', uiIconId: 'mic' },
      { microKeyId: 'ACT12', sourceScan: 0x51, sourceExtended: false, slotId: 'stopOrSend', uiIconId: 'send' },
      { microKeyId: 'ENC', sourceScan: 0, sourceExtended: false, slotId: 'summonCodex', uiIconId: 'codex' }
    ]
  };

  var DEFAULT_ICON_BY_MICRO = {
    ACT06: 'fast',
    ACT07: 'palette',
    ACT08: 'reject',
    ACT09: 'fork',
    ACT10: 'mic',
    ACT12: 'send',
    AG00: 'status',
    AG01: 'plan',
    AG02: 'review',
    AG03: 'folder',
    AG04: 'agent',
    AG05: 'cloud',
    ENC: 'codex',
    JOY: 'empty'
  };

  var ICON_DEFS = [
    { id: 'fast', label: 'FAST' },
    { id: 'approve', label: 'OK' },
    { id: 'reject', label: 'X' },
    { id: 'fork', label: 'FORK' },
    { id: 'mic', label: 'MIC' },
    { id: 'send', label: 'SEND' },
    { id: 'new', label: 'NEW' },
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
    { id: 'empty', label: 'EMPT' }
  ];

  var ICON_SVG = {
    fast: '<svg viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 10-14h-7l0-6z"/></svg>',
    approve: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 12l3 3 5-6"/></svg>',
    reject: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
    fork: '<svg viewBox="0 0 24 24"><path d="M7 4v8a4 4 0 004 4h2a4 4 0 004-4V4"/><path d="M17 4l3 3-3 3M7 4L4 7l3 3"/></svg>',
    mic: '<svg viewBox="0 0 24 24"><path d="M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3z"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>',
    send: '<svg viewBox="0 0 24 24"><path d="M4 12h12"/><path d="M12 6l6 6-6 6"/><path d="M20 7v10"/></svg>',
    new: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
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
  /** Recognition-page UI mode: edit | run (trigger step is always click-to-preview). */
  var padUiMode = 'edit';
  var runPointerActiveId = '';
  var editDraft = null;

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
  function persistPadFlags(m) {
    var invoke = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    var pad = m && m.codexMicroPad;
    if (!invoke || !m || !m.id || !pad) {
      persist();
      return;
    }
    invoke('cmd_codex_micro_pad_set_flags', {
      mappingId: String(m.id),
      enabled: !!pad.enabled,
      requireNumLockOff: !!pad.requireNumLockOff,
      overlayEnabled: !!pad.overlayEnabled
    }).catch(function () {
      persist();
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
      enabled: r.enabled !== false
    };
  }

  function defaultSeedRoutes() {
    var routes = LAYOUT.defaultRoutes.map(seedRoute);
    var hasJoy = routes.some(function (r) { return r.microKeyId === 'JOY'; });
    if (!hasJoy) {
      routes.push(seedRoute({
        microKeyId: 'JOY',
        sourceScan: 0,
        sourceExtended: false,
        slotId: '',
        uiIconId: 'empty',
        enabled: true
      }));
    }
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
        if (!(Number(enc.sourceScan) > 0) && Number(npad0.sourceScan) > 0) {
          enc.sourceScan = npad0.sourceScan;
          enc.sourceExtended = !!npad0.sourceExtended;
        }
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
    // Stock: mic was Numpad 2, ENC stole Numpad 0 — move mic to 0.
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
    return out;
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
        keys: defaultSeedRoutes()
      };
      if (opts.persist !== false) persist();
      return m.codexMicroPad;
    }
    if (!Array.isArray(m.codexMicroPad.keys)) m.codexMicroPad.keys = [];
    var before = JSON.stringify(m.codexMicroPad.keys);
    m.codexMicroPad.keys = migrateLegacyKeys(m.codexMicroPad.keys);
    var byId = {};
    m.codexMicroPad.keys.forEach(function (k) {
      if (k && k.microKeyId) byId[k.microKeyId] = k;
    });
    defaultSeedRoutes().forEach(function (seed) {
      if (!byId[seed.microKeyId]) {
        m.codexMicroPad.keys.push(seedRoute(seed));
      }
    });
    // Heal-only scan moves: persist quietly later via normal save — never block hub open.
    if (before !== JSON.stringify(m.codexMicroPad.keys) && opts.persist === true) persist();
    return m.codexMicroPad;
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

  function notifyLinkedUi(m) {
    // Pad-only refresh. Never call AgentCapabilityUi.refresh() here — that remounts
    // camera/MediaPipe and has 假死'd the UI when toggling Micro enable.
    refreshTrigger(m);
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    if (targetHost && !targetHost.hidden) renderTarget(targetHost, m);
    if (global.OneToneKeysPanelUi && global.OneToneKeysPanelUi.renderKeysHub) {
      try { global.OneToneKeysPanelUi.renderKeysHub(); } catch (_) {}
    }
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
    var html =
      '<div class="micro-hw' + sizeCls + compactCls + '">' +
      '<div class="micro-hw__face">' +
      '<span class="micro-hw__screw micro-hw__screw--tl"></span>' +
      '<span class="micro-hw__screw micro-hw__screw--tr"></span>' +
      '<span class="micro-hw__screw micro-hw__screw--bl"></span>' +
      '<span class="micro-hw__screw micro-hw__screw--br"></span>' +
      '<div class="micro-hw__grid">';

    LAYOUT.cells.forEach(function (cell) {
      if (cell.kind === 'numpad') return;
      var route = routeForMicroKey(pad, cell.microKeyId);
      var bound = !!(route && route.enabled && route.slotId);
      var tag = cell.kind === 'placeholder' ? 'div' : 'button';
      var cls = 'micro-hw__key micro-hw__key--' + (cell.kind || 'command');
      if (cell.gridColSpan === 2) cls += ' micro-hw__key--span2';
      if (bound) cls += ' is-bound';
      if (highlightSlotId && route && route.slotId === highlightSlotId) cls += ' is-focused';
      if (activeHighlightId && activeHighlightId === cell.microKeyId) cls += ' is-pressed is-active';
      var style = 'grid-row:' + cell.gridRow + ';grid-column:' + cell.gridCol +
        (cell.gridColSpan ? ' / span ' + cell.gridColSpan : '') + ';';
      var typeAttr = tag === 'button' ? ' type="button"' : '';
      var agAttr = cell.kind === 'agent' && cell.agIndex != null ? ' data-ag="' + cell.agIndex + '"' : '';
      html += '<' + tag + typeAttr + ' class="' + cls + '" data-micro-key="' + esc(cell.microKeyId) + '"' +
        agAttr + ' style="' + style + '" title="' + esc(cellLabel(cell)) + '">';

      var iconId = resolveIconId(route, cell.microKeyId);
      html += '<span class="micro-hw__icon" aria-hidden="true">' + iconSvg(iconId) + '</span>';
      if (mode !== 'overlay') {
        var sub = bound
          ? slotSubForDisplay(m, route.slotId)
          : t('codexMicroPadUnbound', '未配置');
        html += '<span class="micro-hw__sub">' + esc(sub) + '</span>';
      }
      html += '</' + tag + '>';
    });

    html += '</div>' +
      '<div class="micro-hw__leds" aria-hidden="true">' +
      '<span class="micro-hw__led"></span><span class="micro-hw__led"></span><span class="micro-hw__led"></span>' +
      '</div></div></div>';
    return html;
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
    if (!res || res.ok) return;
    var reason = String(res.reason || '');
    if (reason === 'not_foreground') {
      toast(t('codexMicroPadNeedCodexFg', '请先切到 Codex 前台再运行'));
    } else if (reason === 'unbound') {
      toast(t('codexMicroPadUnbound', '未配置'));
    } else if (reason === 'invalid_key' || reason === 'invalid_phase') {
      toast(t('codexMicroPadFireFailed', '无法触发该键'));
    }
  }

  function fireMicroKey(m, microKeyId, phase) {
    var pad = m && m.codexMicroPad;
    if (!pad || !pad.enabled) {
      toast(t('codexMicroPadStatusOff', '已关闭'));
      return Promise.resolve({ ok: false, reason: 'disabled' });
    }
    var route = routeForMicroKey(pad, microKeyId);
    if (!route || !route.enabled || !String(route.slotId || '').trim()) {
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
      return res;
    });
  }

  function renderModeSeg() {
    var modes = [
      { id: 'edit', label: t('codexMicroPadModeEdit', '编辑') },
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

  function modeHintText() {
    if (padUiMode === 'run') {
      return t('codexMicroPadModeRunHint', '运行：点击触发能力 · 说话键按住听写 · 需 Codex 前台');
    }
    return t('codexMicroPadTapKeyHint', '点击键帽编辑能力与图标 · 仅 Codex 前台生效');
  }

  function bindPadClicks(host, m, mode) {
    if (!host) return;
    host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function (el) {
      if (el.classList.contains('micro-hw__key--placeholder')) return;
      var id = el.getAttribute('data-micro-key');
      if (mode === 'preview') {
        el.addEventListener('click', function () {
          previewKeyInHero(m, id);
        });
        return;
      }
      if (mode === 'edit' || mode === 'config') {
        el.addEventListener('click', function () {
          openEditKeycap(m, id);
        });
        return;
      }
      if (mode === 'run') {
        el.addEventListener('pointerdown', function (e) {
          if (e.button != null && e.button !== 0) return;
          e.preventDefault();
          runPointerActiveId = id;
          try { el.setPointerCapture(e.pointerId); } catch (_) {}
          fireMicroKey(m, id, 'down');
        });
        el.addEventListener('pointerup', function (e) {
          if (runPointerActiveId !== id) return;
          runPointerActiveId = '';
          fireMicroKey(m, id, 'up');
        });
        el.addEventListener('pointercancel', function () {
          if (runPointerActiveId !== id) return;
          runPointerActiveId = '';
          fireMicroKey(m, id, 'up');
        });
        el.addEventListener('click', function (e) {
          // Hold keys already handled via pointer; suppress accidental double-fire.
          e.preventDefault();
        });
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

  function renderTarget(host, m) {
    if (!host || !m) {
      if (host) { host.innerHTML = ''; host.hidden = true; }
      return;
    }
    if (padUiMode !== 'edit' && padUiMode !== 'run') {
      padUiMode = 'edit';
    }
    ensurePad(m, { persist: false });
    var pad = m.codexMicroPad;
    host.hidden = false;
    host.classList.toggle('is-pad-run', padUiMode === 'run');
    host.innerHTML =
      '<div class="codex-micro-pad">' +
      '<div class="codex-micro-pad__head">' +
      '<p class="codex-micro-pad__title">' + esc(t('codexMicroPadConfigTitle', '小键盘键位配置')) + '</p>' +
      '<label class="codex-micro-pad__toggle"><input type="checkbox" data-act="enabled"' +
      (pad.enabled ? ' checked' : '') + '>' +
      esc(t('codexMicroPadEnable', '启用小键盘层')) + '</label></div>' +
      renderModeSeg() +
      '<div class="codex-micro-pad__toggles">' +
      '<label class="codex-micro-pad__toggle"><input type="checkbox" data-act="numlock"' +
      (pad.requireNumLockOff ? ' checked' : '') + '>' +
      esc(t('codexMicroPadNumLockOff', '仅在关闭数字锁定（NumLock）时生效')) + '</label>' +
      '<label class="codex-micro-pad__toggle"><input type="checkbox" data-act="overlay"' +
      (pad.overlayEnabled ? ' checked' : '') + '>' +
      esc(t('codexMicroPadOverlayEnable', 'Codex 前台时显示置顶小键盘')) + '</label></div>' +
      renderHardwarePad(m, pad, { mode: padUiMode === 'run' ? 'run' : 'config' }) +
      '<div class="codex-micro-pad__toolbar">' +
      '<button type="button" class="codex-micro-pad__btn" data-act="restore">' +
      esc(t('codexMicroPadRestore', '恢复默认键位')) + '</button>' +
      '<button type="button" class="codex-micro-pad__btn" data-act="clear">' +
      esc(t('codexMicroPadClear', '清空所有映射')) + '</button>' +
      '</div>' +
      '<p class="codex-micro-pad__hint">' +
      esc(t('codexMicroPadForegroundHint', '仅 Codex 桌面端前台显示与触发 · 网页版 ChatGPT 无效')) +
      '</p>' +
      '<p class="codex-micro-pad__hint">' + esc(modeHintText()) + '</p></div>';

    host.querySelectorAll('[data-pad-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = btn.getAttribute('data-pad-mode');
        if (!next || next === padUiMode) return;
        padUiMode = next;
        renderTarget(host, m);
      });
    });

    // Toggle flags: dedicated quiet IPC. Full persist/buildSavePayload used to 假死.
    var enabledEl = host.querySelector('[data-act="enabled"]');
    if (enabledEl) {
      enabledEl.addEventListener('change', function () {
        pad.enabled = !!enabledEl.checked;
        persistPadFlags(m);
        refreshTrigger(m);
      });
    }
    var numLockEl = host.querySelector('[data-act="numlock"]');
    if (numLockEl) {
      numLockEl.addEventListener('change', function () {
        pad.requireNumLockOff = !!numLockEl.checked;
        persistPadFlags(m);
      });
    }
    var overlayEl = host.querySelector('[data-act="overlay"]');
    if (overlayEl) {
      overlayEl.addEventListener('change', function () {
        pad.overlayEnabled = !!overlayEl.checked;
        persistPadFlags(m);
      });
    }
    host.querySelector('[data-act="restore"]').addEventListener('click', function () {
      m.codexMicroPad = null;
      ensurePad(m, { force: true });
      renderTarget(host, m);
      notifyLinkedUi(m);
      toast(t('codexMicroPadRestored', '已恢复默认键位映射（含 12 矩阵键与旋钮）'));
    });
    host.querySelector('[data-act="clear"]').addEventListener('click', function () {
      pad.keys = [];
      persist();
      renderTarget(host, m);
      notifyLinkedUi(m);
      toast(t('codexMicroPadCleared', '已清空小键盘映射'));
    });
    bindPadClicks(host, m, padUiMode);
  }

  function ensureEditModal() {
    var el = document.getElementById('codexMicroEditModal');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'codexMicroEditModal';
    el.className = 'micro-hw-modal';
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
    document.getElementById('microHwEditSub').textContent =
      t('codexMicroEditHint', '选择显示在 {id} 上的图标').replace('{id}', microKeyId);
    var search = document.getElementById('microHwEditSearch');
    search.placeholder = t('codexMicroEditSearch', '搜索键帽');
    search.value = '';
    document.getElementById('microHwAssignTitle').textContent =
      t('codexMicroAssignedShortcut', '已分配快捷键');
    document.getElementById('microHwEditRecord').textContent =
      editDraft.sourceScan
        ? scanLabel(editDraft.sourceScan, editDraft.sourceExtended)
        : t('codexMicroPadTapRecord', '点击绑定');

    var slotSel = document.getElementById('microHwEditSlot');
    slotSel.innerHTML = '<option value="">' + esc(t('codexMicroPadPickSlot', '选择能力')) + '</option>';
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

    modal.hidden = false;
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
    upsertRoute(m, pad, editDraft.microKeyId, {
      uiIconId: editDraft.uiIconId,
      slotId: slotId,
      enabled: !!slotId,
      sourceScan: editDraft.sourceScan || (suggest && suggest.sourceScan) || 0,
      sourceExtended: editDraft.sourceExtended
    });
    if (slotId && !editDraft.sourceScan && suggest) {
      upsertRoute(m, pad, editDraft.microKeyId, {
        sourceScan: suggest.sourceScan,
        sourceExtended: !!suggest.sourceExtended
      });
    }
    closeEditKeycap();
    var targetHost = document.getElementById('codexMicroPadHostTarget');
    if (targetHost) renderTarget(targetHost, m);
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
    if (route.slotId && !route.sourceScan) {
      var def = LAYOUT.defaultRoutes.find(function (r) { return r.microKeyId === microKeyId; });
      var suggest = AGENT_NUMPAD_SUGGEST[microKeyId];
      if (def) {
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
    var host = document.getElementById('codexMicroPadHostTarget');
    var Cap = global.OneToneAgentCapabilityUi;
    var cur = Cap && Cap.activeCodexMapping ? Cap.activeCodexMapping() : last;
    if (host && !host.hidden && cur) renderTarget(host, cur);
    else if (cur) notifyLinkedUi(cur);
  }

  global.OneToneCodexMicroPadUi = {
    ensurePad: ensurePad,
    mount: mount,
    ensureHosts: ensureHosts,
    refreshTrigger: refreshTrigger,
    onPadKeyEvent: onPadKeyEvent,
    onOverlayDismissed: onOverlayDismissed,
    onCapabilitySelected: onCapabilitySelected,
    routeForSlot: routeForSlot,
    badgeForSlot: badgeForSlot,
    listPadMappings: listPadMappings,
    openEditKeycap: openEditKeycap,
    notifyLinkedUi: notifyLinkedUi,
    renderHardwarePad: renderHardwarePad,
    applyTriggerHeroPreview: applyTriggerHeroPreview,
    clearTriggerHeroPreview: clearTriggerHeroPreview,
    LAYOUT: LAYOUT,
    ICON_DEFS: ICON_DEFS,
    DEFAULT_ICON_BY_MICRO: DEFAULT_ICON_BY_MICRO,
    sourceId: sourceId,
    scanLabel: scanLabel,
    chordForSlot: chordForSlot,
    slotSubForDisplay: slotSubForDisplay,
    displayActionForSlot: displayActionForSlot
  };
})(typeof window !== 'undefined' ? window : globalThis);
