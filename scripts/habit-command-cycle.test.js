#!/usr/bin/env node
'use strict';

var assert = require('assert');

global.window = global;
global.OneToneAgentActions = {
  resolveCanonicalActionId: function (id) {
    var s = String(id || '');
    if (s === 'startDictation') return 'input.start';
    return s;
  },
  agentActionToken: function (id) {
    return 'agent:' + id;
  },
  isMultiInstance: function (id) {
    return String(id) === 'app.shortcut';
  }
};
global.OneToneActionBindingAdapters = {
  isMultiInstance: function (id) {
    return String(id) === 'app.shortcut';
  }
};

require('../src/js/features/agent/action-catalog-filter.js');
var F = global.OneToneActionCatalogFilter;
assert.ok(F, 'exports filter');

var views = [
  { mappingId: 'cursor', actionId: 'input.start', channel: 'key', trigger: 'LAlt+R', enabled: true },
  { mappingId: 'cursor', actionId: 'input.start', channel: 'voice', trigger: '说话', enabled: true },
  { mappingId: 'cursor', actionId: 'status', channel: 'key', trigger: 'F1', enabled: true },
  { mappingId: 'cursor', actionId: 'status', channel: 'key', trigger: 'F2', enabled: true },
  { mappingId: 'cursor', actionId: 'status', channel: 'key', trigger: 'F3', enabled: true },
  { mappingId: 'cursor', actionId: 'status', channel: 'key', trigger: 'F4', enabled: true },
  { mappingId: 'cursor', actionId: 'commandPalette', channel: 'key', trigger: 'Ctrl+Shift+P', enabled: true },
  {
    mappingId: 'cursor',
    actionId: 'app.shortcut',
    channel: 'key',
    trigger: 'Ctrl+1',
    enabled: true,
    actionInstanceId: 'a'
  },
  { mappingId: 'codex', actionId: 'input.start', channel: 'softPad', trigger: 'D1', enabled: true }
];

var hint = F.buildCrossHintMap(views, 'cursor');
assert.ok(F.tokenBoundOnChannel('input.start', hint, 'key'), 'start has clean key');
assert.ok(!F.tokenBoundOnChannel('status', hint, 'key'), 'status dump rejected');
assert.ok(F.tokenBoundOnChannel('commandPalette', hint, 'key'), 'palette kept');
assert.ok(!F.tokenBoundOnChannel('app.shortcut', hint, 'key'), 'app.shortcut excluded from channel dir');

var hintFmt = F.formatCrossHint('input.start', hint, 'key');
assert.ok(hintFmt.indexOf('LAlt+R') >= 0, 'primary chord shown');
assert.ok(hintFmt.indexOf('F1') < 0, 'unrelated chords not dumped');

var menuKey = F.filterViewsForMenu(views, { mappingId: 'cursor', channel: 'key' });
var aids = menuKey.map(function (v) {
  return v.actionId;
});
assert.ok(aids.indexOf('input.start') >= 0);
assert.ok(aids.indexOf('commandPalette') >= 0);
assert.ok(aids.indexOf('status') < 0, 'polluted status not in menu');
assert.ok(aids.indexOf('app.shortcut') < 0);

var counts = F.channelCounts(hint);
assert.ok(counts.key >= 2, 'counts unique clean key actions');

require('../src/js/features/agent/semantic-action-store.js');
var Store = global.OneToneSemanticActionStore;
assert.ok(Store.bindingViewsAll, 'store exposes bindingViewsAll');
assert.ok(Store.invalidateBindingViews, 'store can invalidate views cache');

console.log('habit-command-cycle.test.js: ok');
