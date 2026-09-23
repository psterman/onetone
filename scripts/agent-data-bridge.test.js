'use strict';

var assert = require('assert');
var path = require('path');
var fs = require('fs');
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
        sessionTokens: null,
        remainingPercent: 72
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
        localTodayTokens: null,
        remainingPercent: 28
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
assert.strictEqual(cursor.usdBooked, null);
assert.strictEqual(cursor.costBasis, 'unpriced');
assert.strictEqual(cursor.tok, null);
assert.strictEqual(cursor.signal, true);
assert.strictEqual(cursor.group, 'active');
assert.strictEqual(cursor.tight, false);
assert.strictEqual(cursor.remainingPercent, 72);
assert.strictEqual(cursor.peakLabel, null);
assert.strictEqual(cursor.cacheHit, null);
assert.ok(cursor.icon && /cursor\.(png|svg)$/.test(cursor.icon), 'cursor icon path');
assert.ok(bridge.isCursorLocalReady(snap.agents[0].usage));

var claude = board.agents.find(function (a) { return a.id === 'claude'; });
assert.ok(claude);
assert.strictEqual(claude.activeMin, null);
assert.strictEqual(claude.turns, null);
assert.strictEqual(claude.usd, 1.12);
assert.strictEqual(claude.usdBooked, 1.12);
assert.strictEqual(claude.costBasis, 'official');
assert.strictEqual(claude.tok, 270000);
assert.strictEqual(claude.model, 'Sonnet');
assert.strictEqual(claude.modelConf, 'high');
assert.strictEqual(claude.signal, true);
assert.strictEqual(claude.group, 'active');
assert.strictEqual(claude.tight, true, 'remaining 28% => tight');
assert.ok(claude.icon && /claude\.(png|svg)$/.test(claude.icon), 'claude icon path');
assert.strictEqual(board.focusId, 'cursor', 'default focus is cursor');

var codex = board.agents.find(function (a) { return a.id === 'codex'; });
assert.ok(codex);
assert.strictEqual(codex.costBasis, 'unpriced');
assert.strictEqual(codex.usdBooked, null);
assert.strictEqual(codex.group, 'active', 'tokens count as activity');
assert.strictEqual(codex.signal, true);

var booked = null;
var miss = 0;
board.agents.forEach(function (a) {
  if (a.usdBooked != null) booked = (booked || 0) + a.usdBooked;
  if (a.costBasis === 'unpriced') miss++;
});
assert.strictEqual(booked, 1.12);
assert.strictEqual(miss, 2);

// Explicit estimate does not book
var estRow = bridge.projectAgentRow({
  kind: 'copilotcli',
  lightsEnabled: true,
  usage: {
    status: 'ready',
    estimatedCostUsd: 0.64,
    costIsEstimate: true
  }
});
assert.ok(estRow);
assert.strictEqual(estRow.costBasis, 'estimate');
assert.strictEqual(estRow.usd, 0.64);
assert.strictEqual(estRow.usdBooked, null);

// totalCostUsd wins as official
var offRow = bridge.projectAgentRow({
  kind: 'claude',
  lightsEnabled: true,
  usage: {
    status: 'ready',
    totalCostUsd: 2.5,
    estimatedCostUsd: 9.9
  }
});
assert.strictEqual(offRow.costBasis, 'official');
assert.strictEqual(offRow.usdBooked, 2.5);

assert.strictEqual(bridge.filterAgents(board.agents, 'activity').length, 3);
assert.strictEqual(bridge.filterAgents(board.agents, 'quota').length, 2);
assert.strictEqual(bridge.filterAgents(board.agents, 'unwired').length, 0);

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
assert.strictEqual(offCursor.agents[0].group, 'offline');
assert.strictEqual(board.cursorReady, true);
assert.strictEqual(board.cursorNeedsConsent, false);
assert.strictEqual(offCursor.cursorNeedsConsent, true);
assert.strictEqual(offCursor.cursorReady, false);

// Board HTML markers for gap-fill UI
var html = fs.readFileSync(path.join(__dirname, '../src/agent-proto/agent-data.html'), 'utf8');
assert.ok(html.includes('lens-rail') || html.includes('id="lensRail"'), 'lens rail');
assert.ok(html.includes('id="stripRow"'), 'denoise strip');
assert.ok(html.includes('显示全部') && html.includes('id="togAll"'), 'show all toggle');
assert.ok(html.includes('data-filter="activity"'), 'activity filter');
assert.ok(html.includes('data-layout="ledger"'), 'cost ledger layout');
assert.ok(html.includes('id="previewBody"'), 'right preview');
assert.ok(html.includes('aside class="preview"') || html.includes("aside class='preview'"), 'preview aside');
assert.ok(/ot-embed[\s\S]*?\.preview[\s\S]*?width:\s*var\(--preview\)/.test(html) || html.includes('html.ot-embed .preview'), 'embed keeps right preview');
assert.ok(html.includes('id="focusRank"'), 'focus triple rank');
assert.ok(html.includes('id="appSnap"') && html.includes('id="snapMets"'), 'current-app snap');
assert.ok(html.includes('AGENT_ICON') && html.includes('icons/app-target/'), 'agent icons');
assert.ok(html.includes('function faceHtml') || html.includes('faceHtml('), 'faceHtml helper');
assert.ok(html.includes('需日桶'), 'period disabled honesty');
assert.ok(html.includes('较上周'), 'compare shell');
assert.ok(!html.includes('id="subtabs"'), 'old 4 subtabs removed');
assert.ok(!html.includes('pane-rank'), 'old rank pane removed');

console.log('ok agent-data-bridge');
