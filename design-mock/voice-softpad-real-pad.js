/**
 * SoftPad face paint for design-mock — same micro-hw topology as codex-micro-pad-ui LAYOUT.
 * Only paints routes that are "开通" (enabled + slotId), mirroring user Soft Pad keys.
 * Live app should call OneToneCodexMicroPadUi.renderSoftPadPreview(host, mapping) instead.
 */
(function (global) {
  'use strict';

  var LAYOUT_CELLS = [
    { microKeyId: 'ENC', uiLabelZh: '总开关', kind: 'control', gridRow: 1, gridCol: 2 },
    { microKeyId: 'ACT06', uiLabelZh: '快速', kind: 'command', gridRow: 1, gridCol: 3 },
    { microKeyId: 'ACT07', uiLabelZh: '命令菜单', kind: 'command', gridRow: 1, gridCol: 4 },
    { microKeyId: 'ACT08', uiLabelZh: '拒绝', kind: 'command', gridRow: 1, gridCol: 5 },
    { microKeyId: 'NAV_UP', uiLabelZh: '上', kind: 'nav', gridRow: 2, gridCol: 1 },
    { microKeyId: 'AG00', uiLabelZh: '命令菜单', kind: 'agent', gridRow: 2, gridCol: 2, agIndex: 0 },
    { microKeyId: 'AG01', uiLabelZh: '新建', kind: 'agent', gridRow: 2, gridCol: 3, agIndex: 1 },
    { microKeyId: 'AG02', uiLabelZh: '快速聊天', kind: 'agent', gridRow: 2, gridCol: 4, agIndex: 2 },
    { microKeyId: 'PLUS', uiLabelZh: '加', kind: 'command', gridRow: 2, gridCol: 5, gridRowSpan: 2 },
    { microKeyId: 'NAV_LEFT', uiLabelZh: '左', kind: 'nav', gridRow: 3, gridCol: 1 },
    { microKeyId: 'AG03', uiLabelZh: '搜索', kind: 'agent', gridRow: 3, gridCol: 2, agIndex: 3 },
    { microKeyId: 'AG04', uiLabelZh: '发送', kind: 'agent', gridRow: 3, gridCol: 3, agIndex: 4 },
    { microKeyId: 'AG05', uiLabelZh: '取消', kind: 'agent', gridRow: 3, gridCol: 4, agIndex: 5 },
    { microKeyId: 'NAV_DOWN', uiLabelZh: '下', kind: 'nav', gridRow: 4, gridCol: 1 },
    { microKeyId: 'ACT09', uiLabelZh: '新建', kind: 'command', gridRow: 4, gridCol: 2 },
    { microKeyId: 'UNDO', uiLabelZh: '撤销', kind: 'command', gridRow: 4, gridCol: 3 },
    { microKeyId: 'SEARCH', uiLabelZh: '搜索', kind: 'command', gridRow: 4, gridCol: 4 },
    { microKeyId: 'ACT12', uiLabelZh: '发送', kind: 'command', gridRow: 4, gridCol: 5, gridRowSpan: 2 },
    { microKeyId: 'NAV_RIGHT', uiLabelZh: '右', kind: 'nav', gridRow: 5, gridCol: 1 },
    { microKeyId: 'ACT10', uiLabelZh: '开始说话', kind: 'command', gridRow: 5, gridCol: 2, gridColSpan: 2 },
    { microKeyId: 'DOT', uiLabelZh: '小数点', kind: 'command', gridRow: 5, gridCol: 4 }
  ];

  /** Fixture = 用户 Soft Pad 已开通 keys（enabled + slotId）+ voice agentBindings */
  var FIXTURE_ROUTES = {
    AG00: { slotId: 'commandPalette', label: '命令菜单', phrases: ['命令菜单', '命令'], sayable: true },
    AG01: { slotId: 'newThread', label: '新建', phrases: ['新会话', '新建'], sayable: false },
    AG04: { slotId: 'stopOrSend', label: '发送', phrases: ['发送', '发出去'], sayable: true },
    AG05: { slotId: 'cancel', label: '取消', phrases: ['取消', '不要了'], sayable: true },
    ACT06: { slotId: 'quickChat', label: '快速', phrases: ['快速聊天'], sayable: true },
    ACT10: { slotId: 'pushToTalk', label: '开始说话', phrases: ['说话', '开始说话'], sayable: true },
    ACT12: { slotId: 'stopOrSend', label: '发送', phrases: ['发送'], sayable: true }
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normalize(s) {
    return String(s || '').replace(/[「」\s]/g, '');
  }

  function enabledCatalog() {
    return Object.keys(FIXTURE_ROUTES).map(function (id) {
      var r = FIXTURE_ROUTES[id];
      return {
        id: id,
        slotId: r.slotId,
        name: r.label,
        phrases: r.phrases.slice(),
        sayable: !!r.sayable
      };
    });
  }

  function matchHeard(heard) {
    var h = normalize(heard);
    if (!h) return null;
    var best = null;
    enabledCatalog().forEach(function (row) {
      if (!row.sayable) return;
      row.phrases.forEach(function (p) {
        if (!p) return;
        if (h === p) best = { row: row, phrase: p, exact: true };
        else if (!best && (h.indexOf(p) === 0 || p.indexOf(h) === 0)) {
          best = { row: row, phrase: p, exact: false };
        }
      });
    });
    return best;
  }

  function paintHardwarePad(host, opts) {
    opts = opts || {};
    var sel = opts.selId || '';
    var hit = opts.hitId || '';
    var cellsHtml = '';
    LAYOUT_CELLS.forEach(function (cell) {
      var route = FIXTURE_ROUTES[cell.microKeyId];
      var isNav = cell.kind === 'nav';
      var bound = !!(route && route.slotId) || isNav || cell.microKeyId === 'ENC';
      var cls = 'micro-hw__key micro-hw__key--' + (cell.kind || 'command');
      if (cell.kind === 'agent') cls += ' micro-hw__key--agent';
      if (cell.kind === 'nav') cls += ' micro-hw__key--nav';
      if (cell.gridColSpan === 2) cls += ' micro-hw__key--span2';
      if (cell.gridRowSpan === 2) cls += ' micro-hw__key--rowspan2';
      if (bound && route) cls += ' is-bound';
      if (!bound && !isNav && cell.microKeyId !== 'ENC') cls += ' is-route-disabled';
      if (isNav) cls += ' is-screen-only';
      if (cell.microKeyId === 'ENC') cls += ' is-mode-on';
      if (sel && cell.microKeyId === sel) cls += ' is-focused is-sel';
      if (hit && cell.microKeyId === hit) cls += ' is-pressed is-active is-live';
      if (route && !route.sayable) cls += ' is-voice-off';
      var style =
        'grid-row:' + cell.gridRow + (cell.gridRowSpan ? ' / span ' + cell.gridRowSpan : '') +
        ';grid-column:' + cell.gridCol + (cell.gridColSpan ? ' / span ' + cell.gridColSpan : '') + ';';
      var label = route ? route.label : cell.uiLabelZh;
      var phrase = route && route.sayable && route.phrases[0] ? route.phrases[0] : '';
      cellsHtml +=
        '<button type="button" class="' + cls + '" style="' + style + '"' +
        ' data-micro-key="' + esc(cell.microKeyId) + '"' +
        ' aria-label="' + esc(label) + '"' +
        ' title="' + esc(label + (phrase ? ' · ' + phrase : '')) + '">' +
        '<span class="micro-hw__digit" aria-hidden="true">' + esc(label) + '</span>' +
        (phrase ? '<span class="sp-voice-ph" aria-hidden="true">' + esc(phrase) + '</span>' : '') +
        '</button>';
    });

    var sayableN = enabledCatalog().filter(function (r) { return r.sayable; }).length;
    host.innerHTML =
      '<div class="codex-micro-pad soft-pad-preview" data-pad-skin="default">' +
      '<div class="codex-micro-pad__head">' +
      '<p class="codex-micro-pad__title">Soft Pad · Cursor</p>' +
      '<span class="codex-micro-pad__status">有口令 ' + sayableN + ' 颗</span>' +
      '</div>' +
      '<div class="micro-hw-wrap">' +
      '<div class="micro-hw-shell is-mode-codex">' +
      '<div class="micro-hw" data-pad-skin="default">' +
      '<div class="micro-hw__face">' +
      '<div class="micro-hw__face-top micro-hw__face-top--title-only">' +
      '<span class="micro-hw__face-title">Cursor</span></div>' +
      '<div class="micro-hw__grid">' + cellsHtml + '</div>' +
      '</div></div></div></div>' +
      '<div class="soft-pad-key-caption" aria-live="polite">' +
      '<span class="soft-pad-key-caption__name" data-cap-name>点一颗键，右边显示口令</span>' +
      '</div>' +
      '<p class="soft-pad-preview__hint">亮着的有口令 · 灰的还没有</p>' +
      '</div>';
  }

  function tryLivePaint(host, mapping) {
    var Pad = global.OneToneCodexMicroPadUi;
    if (Pad && typeof Pad.renderSoftPadPreview === 'function' && mapping) {
      Pad.renderSoftPadPreview(host, mapping, { forceFull: true });
      return true;
    }
    if (Pad && typeof Pad.renderHeroPadPreviewGrid === 'function' && mapping) {
      Pad.renderHeroPadPreviewGrid(host, { mapping: mapping, live: true });
      return true;
    }
    return false;
  }

  global.VoiceSoftPadRealPad = {
    LAYOUT_CELLS: LAYOUT_CELLS,
    FIXTURE_ROUTES: FIXTURE_ROUTES,
    enabledCatalog: enabledCatalog,
    matchHeard: matchHeard,
    paintHardwarePad: paintHardwarePad,
    tryLivePaint: tryLivePaint,
    normalize: normalize
  };
})(typeof window !== 'undefined' ? window : globalThis);
