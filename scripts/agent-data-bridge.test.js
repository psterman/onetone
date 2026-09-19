'use strict';

var assert = require('assert');
var path = require('path');
var bridge = require(path.join(__dirname, '../src/js/features/agent/agent-data-bridge.js'));

var snap = {
  agents: [
    {
      kind: 'cursor',
      lightsEnabled: true,
      model: 'Composer',
      modelConfidence: 'med',
      usage: {
        status: 'ready',
        source: 'cursor_local_activity',
        confidence: 'local_only',
        message: '本地活动',
        localTodayRequests: 86,
        localTodaySessions: 11,
        localTodayActiveMs: 102 * 60000,
        estimatedCostUsd: null,
        sessionTokens: null
      }
    },
    {
      kind: 'claude',
      lightsEnabled: true,
      model: 'Sonnet',
      modelConfidence: 'high',
      usage: {
        status: 'ready',
        source: 'otel',
        message: 'OTel',
        estimatedCostUsd: 1.12,
        sessionTokens: 270000,
        localTodayTokens: null
      }
    },
    {
      kind: 'codex',
      lightsEnabled: false,
      model: 'o系列',
      modelConfidence: 'high',
      usage: {
        status: 'waiting',
        source: 'account',
        sessionTokens: 410000,
        estimatedCostUsd: null
      }
    },
    {
      kind: 'ghost',
      lightsEnabled: false,
      model: '',
      modelConfidence: '',
      usage: { status: 'unavailable' }
    }
  ]
};

var board = bridge.projectBoardFromOverlay(snap);
assert.strictEqual(board.range, 'day');
assert.strictEqual(board.history, false);
assert.ok(Array.isArray(board.agents));
assert.strictEqual(board.agents.length, 3, 'core agents + lights/ready; ghost dropped');
assert.strictEqual(board.agents[0].id, 'cursor');
assert.ok(board.agents.some(function (a) { return a.id === 'codex'; }), 'codex always kept');

var cursor = board.agents.find(function (a) { return a.id === 'cursor'; });
assert.ok(cursor);
assert.strictEqual(cursor.turns, 86);
assert.strictEqual(cursor.sessions, 11);
assert.strictEqual(cursor.activeMin, 102);
assert.strictEqual(cursor.usd, null);
assert.strictEqual(cursor.tok, null);
assert.strictEqual(cursor.peakLabel, null);
assert.strictEqual(cursor.cacheHit, null);
assert.ok(bridge.isCursorLocalReady(snap.agents[0].usage));

var claude = board.agents.find(function (a) { return a.id === 'claude'; });
assert.ok(claude);
assert.strictEqual(claude.activeMin, null);
assert.strictEqual(claude.turns, null);
assert.strictEqual(claude.usd, 1.12);
assert.strictEqual(claude.tok, 270000);
assert.strictEqual(claude.model, 'Sonnet');
assert.strictEqual(claude.modelConf, 'high');

var usdSum = null;
var miss = 0;
board.agents.forEach(function (a) {
  if (a.usd == null) miss++;
  else usdSum = (usdSum || 0) + a.usd;
});
assert.strictEqual(usdSum, 1.12);
assert.strictEqual(miss, 2);

var offCursor = bridge.projectBoardFromOverlay({
  agents: [{
    kind: 'cursor',
    lightsEnabled: false,
    model: 'Composer',
    modelConfidence: 'med',
    usage: {
      status: 'unavailable',
      source: 'cursor_local_activity',
      confidence: 'local_only',
      message: '未启用 Cursor 活动统计',
      localTodayRequests: 10,
      localTodayActiveMs: 60000
    }
  }]
});
assert.strictEqual(offCursor.agents.length, 1, 'core Cursor always included');
assert.strictEqual(offCursor.agents[0].turns, null, 'Cursor turns only when local-ready');
assert.strictEqual(offCursor.agents[0].activeMin, null);
assert.strictEqual(board.cursorReady, true);
assert.strictEqual(board.cursorNeedsConsent, false);
assert.strictEqual(offCursor.cursorNeedsConsent, true);
assert.strictEqual(offCursor.cursorReady, false);

console.log('ok agent-data-bridge');
