#!/usr/bin/env node
'use strict';

/**
 * Soft Pad「本应用」二级页：其它通道行收集契约（与 collectSoftPadOtherChannelRows 对齐）。
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var ALLOW = {
  newThread: 1,
  commandPalette: 1,
  plan: 1
};

function isCustom(id) {
  return String(id || '').indexOf('custom_') === 0;
}

function allowed(pad, slotId) {
  var id = String(slotId || '').trim();
  if (!id) return false;
  if (ALLOW[id]) return true;
  if (!isCustom(id)) return false;
  return !!(pad && pad.customShortcuts || []).some(function (c) {
    return c && String(c.id) === id;
  });
}

function normalize(ch) {
  var s = String(ch || '').trim();
  if (s === 'key' || s === 'keys') return 'key';
  if (s === 'voice') return 'voice';
  if (s === 'camera' || s === 'gesture') return 'camera';
  if (s === 'softPad') return 'softPad';
  return s;
}

function collect(m, views) {
  var rows = [];
  var seen = {};
  var pad = m && m.codexMicroPad;
  function push(ch, slotId, note) {
    ch = normalize(ch);
    slotId = String(slotId || '').trim();
    if (!allowed(pad, slotId)) return;
    if (ch !== 'key' && ch !== 'voice' && ch !== 'camera') return;
    note = String(note || '').trim();
    var k = ch + '::' + slotId + '::' + note;
    if (seen[k]) return;
    seen[k] = 1;
    rows.push({ channel: ch, slotId: slotId, note: note });
  }
  (views || []).forEach(function (v) {
    if (!v || v.enabled === false) return;
    var ch = normalize(v.channel);
    if (ch === 'softPad') return;
    var ref = String(v.bindingRef || '').trim();
    var trig = String(v.trigger || '').trim();
    if (ch === 'key' || ch === 'voice') push(ch, ref, trig);
  });
  ((m && m.agentBindings) || []).forEach(function (b) {
    if (!b || b.enabled === false) return;
    var ch = normalize(b.triggerType);
    if (ch !== 'key' && ch !== 'voice') return;
    push(ch, b.slotId, b.triggerBinding || '');
  });
  return rows;
}

var m = {
  codexMicroPad: {
    customShortcuts: [{ id: 'custom_abc', name: '分屏' }]
  },
  agentBindings: [
    { slotId: 'newThread', triggerType: 'key', triggerBinding: 'Ctrl+N', enabled: true },
    { slotId: 'unknownSlot', triggerType: 'key', triggerBinding: 'F9', enabled: true }
  ]
};

var views = [
  { channel: 'key', bindingRef: 'commandPalette', trigger: 'Ctrl+Shift+P', enabled: true },
  { channel: 'softPad', bindingRef: 'AG00', trigger: 'D1', enabled: true },
  { channel: 'voice', bindingRef: 'plan', trigger: '定计划', enabled: true },
  { channel: 'key', bindingRef: 'custom_abc', trigger: 'Ctrl+Alt+T', enabled: true }
];

var rows = collect(m, views);
assert.ok(rows.some(function (r) { return r.slotId === 'commandPalette' && r.channel === 'key'; }));
assert.ok(rows.some(function (r) { return r.slotId === 'plan' && r.channel === 'voice'; }));
assert.ok(rows.some(function (r) { return r.slotId === 'custom_abc'; }));
assert.ok(rows.some(function (r) { return r.slotId === 'newThread'; }), 'fallback agentBindings');
assert.ok(!rows.some(function (r) { return r.channel === 'softPad'; }), 'exclude softPad');
assert.ok(!rows.some(function (r) { return r.slotId === 'unknownSlot'; }), 'reject non-allowlist');

var src = fs.readFileSync(
  path.join(__dirname, '../src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
assert.ok(src.indexOf('collectSoftPadOtherChannelRows') >= 0);
assert.ok(src.indexOf('data-browse-open-record') >= 0);
assert.ok(src.indexOf('openBrowseSheet') >= 0);

console.log('softpad-other-channel-rows: ok');
