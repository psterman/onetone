'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
var rust = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');

['codex', 'claude', 'cursor'].forEach(function (kind) {
  assert.ok(html.includes('data-agent="' + kind + '"'), 'missing mini chip: ' + kind);
});
assert.ok(html.includes('function applyMiniAgentChips'));
assert.ok(html.includes('function applyUsageRail'));
assert.ok(html.includes("usageSummary(kind,usage,true)"));
assert.ok(html.includes("row.modelConfidence||row.model_confidence"));
assert.ok(html.includes("模型 --"));
assert.ok(html.includes('（会话值，可能不精确）'));
assert.ok(html.includes("窗口余 "));
assert.ok(!html.includes('模型未知'));
assert.ok(!html.includes('账户余额'));
assert.ok(!html.includes('id="miniLeds"'));
var miniFn = html.match(/function applyMiniAgentChips\(s\)\{[\s\S]*?\n    \}/);
assert.ok(miniFn, 'applyMiniAgentChips body missing');
assert.ok(!/appAgent|app_agent|appStatus|app_status/.test(miniFn[0]), 'mini chips must not read singleton appAgent/appStatus');
assert.ok(css.includes('.overlay-mini__agent[data-status="needs_input"]'));
assert.ok(css.includes('.overlay-mini__agent[data-status="running"]'));
assert.ok(rust.includes('pub agents: Vec<CodexMicroAgentSnapshot>'));
assert.ok(rust.includes('fn agent_chip_snapshots()'));
assert.ok(rust.includes('primary_state_for(kind)'));
assert.ok(rust.includes('agent_model_metadata::snapshot'));

console.log('soft-pad mini agent tests passed');
