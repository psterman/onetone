/**
 * Soft Pad connect-status (MiniMax-quota-style) — phase helpers + HTML markers.
 * Run: node scripts/soft-pad-connect-status.test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('assert');

var root = path.join(__dirname, '..');
var connectSrc = fs.readFileSync(
  path.join(root, 'src/js/features/agent/soft-pad-connect-status.js'),
  'utf8'
);
var padSrc = fs.readFileSync(
  path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
var orchSrc = fs.readFileSync(
  path.join(root, 'src/js/features/agent/agent-install-orchestrator.js'),
  'utf8'
);
var qsSrc = fs.readFileSync(
  path.join(root, 'src/js/features/home/quick-start-orchestrator.js'),
  'utf8'
);
var indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');

assert.ok(connectSrc.indexOf('OneToneSoftPadConnect') >= 0, 'exports OneToneSoftPadConnect');
assert.ok(connectSrc.indexOf('function phaseOf') >= 0, 'phaseOf');
assert.ok(connectSrc.indexOf('renderExpandCardHtml') >= 0, 'expand card');
assert.ok(connectSrc.indexOf('确认接入并监视状态') >= 0 || connectSrc.indexOf('softPadConnectInstallWatch') >= 0,
  'install CTA copy');

// Load module in isolation
var vm = require('vm');
var ctx = { console: console };
ctx.window = ctx;
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(connectSrc, ctx);
var C = ctx.OneToneSoftPadConnect || ctx.window.OneToneSoftPadConnect;
assert.ok(C, 'module loaded');

assert.strictEqual(C.phaseOf('codex', { panelPhase: 'not_configured' }), 'not_configured');
assert.strictEqual(C.phaseOf('codex', { panelPhase: 'configured_waiting' }), 'waiting');
assert.strictEqual(C.phaseOf('codex', { panelPhase: 'connected' }), 'connected');
assert.strictEqual(C.phaseOf('claude', { installPhase: 'not_installed' }), 'not_configured');
assert.strictEqual(C.phaseOf('claude', { installPhase: 'waiting' }), 'waiting');
assert.strictEqual(C.phaseOf('claude', { installPhase: 'connected' }), 'connected');
assert.strictEqual(C.phaseOf('claude', { installPhase: 'error' }), 'error');
assert.strictEqual(
  C.phaseOf('workbuddy', { onetoneConfigured: false, probeExists: true }),
  'not_configured'
);
assert.strictEqual(
  C.phaseOf('workbuddy', { onetoneConfigured: true }, { lightStatus: 'idle' }),
  'waiting'
);
assert.strictEqual(
  C.phaseOf('workbuddy', { onetoneConfigured: true }, { lightStatus: 'running' }),
  'connected'
);
assert.strictEqual(C.phaseOf('trae', {}), 'solo');
assert.strictEqual(C.phaseOf('minimax', {}), 'quota');
assert.ok(C.needsAction('not_configured'));
assert.ok(C.needsAction('error'));
assert.ok(!C.needsAction('connected'));
assert.ok(!C.needsAction('waiting'));
assert.strictEqual(C.primaryAction('cursor', 'not_configured'), 'copy');
assert.strictEqual(C.primaryAction('claude', 'not_configured'), 'install');

var card = C.renderExpandCardHtml({
  kind: 'claude',
  label: 'Claude',
  phase: 'not_configured',
  status: { settingsPath: 'C:\\Users\\x\\.claude\\settings.json' },
  isFg: true
});
assert.ok(card.indexOf('data-connect-card="claude"') >= 0, 'card marker');
assert.ok(card.indexOf('data-act="connect-install"') >= 0, 'install act');
assert.ok(card.indexOf('当前前台') >= 0 || card.indexOf('Foreground') >= 0 || card.indexOf('softPadConnectFgBadge') >= 0 || card.indexOf('is-fg') >= 0 || card.indexOf('connect-card__fg') >= 0, 'fg badge');

var waitCard = C.renderExpandCardHtml({
  kind: 'codex',
  label: 'Codex',
  phase: 'waiting',
  status: { trustHint: 'Trust me' }
});
assert.ok(waitCard.indexOf('data-connect-trust') >= 0, 'codex trust on waiting');
assert.ok(waitCard.indexOf('Trust me') >= 0, 'trust text');

assert.ok(padSrc.indexOf('renderConnectStatusSectionHtml') >= 0, 'pad section');
assert.ok(padSrc.indexOf('data-connect-host') >= 0, 'connect host in topbar panel');
assert.ok(padSrc.indexOf('bindConnectStatusCardEvents') >= 0, 'bind connect events');
assert.ok(padSrc.indexOf("Conn.installKind('codex')") >= 0 || padSrc.indexOf('cmd_codex_hook_install_confirm') >= 0,
  'codex one-click');

assert.ok(orchSrc.indexOf('connectSelectedKinds') >= 0, 'orchestrator batch connect');
assert.ok(orchSrc.indexOf('cmd_codex_hook_install_confirm') >= 0, 'orchestrator codex install');
assert.ok(qsSrc.indexOf('connectSelectedKinds') >= 0, 'quick start calls batch connect');

var scriptHits = indexHtml.split('soft-pad-connect-status.js').length - 1;
assert.strictEqual(scriptHits, 1, 'connect-status script included once');

console.log('soft-pad-connect-status.test.js: ok');
