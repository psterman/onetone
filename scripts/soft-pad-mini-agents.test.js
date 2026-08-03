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
assert.ok(html.includes('function applyMiniUsagePill'));
assert.ok(html.includes('function pickMiniUsageKind'));
assert.ok(html.includes('usage-format.js'));
assert.ok(html.includes('OneToneUsageFormat') || html.includes('formatResetCountdown'));
assert.ok(html.includes('id="miniUsagePill"'));
assert.ok(html.includes('function applyUsageRail'));
assert.ok(html.includes('usageSummary(kind,usage'));
assert.ok(html.includes('row.modelConfidence||row.model_confidence') || html.includes('modelConfidence'));
assert.ok(html.includes('模型 --') || html.includes("'模型 --'"));
assert.ok(html.includes('overlayUsageRail.hidden=false') || html.includes('overlayUsageRail.hidden = false'));
assert.ok(html.includes('data-usage-agent="codex"') && html.includes('data-usage-agent="claude"') && html.includes('data-usage-agent="cursor"'));
assert.ok(!/<div class="overlay-usage-rail"[^>]*\bhidden\b/.test(html), 'rail must not start hidden');
var padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
assert.ok(padUi.includes('cmd_cursor_hook_setup_status'));
assert.ok(padUi.includes('renderCursorHookSetupCard'));
assert.ok(padUi.includes('softPadMoreTabCursor'));
assert.ok(!html.includes('模型未知'));
assert.ok(!html.includes('账户余额'));
assert.ok(!html.includes('id="miniLeds"'));
var miniFn = html.match(/function applyMiniAgentChips\(s\)\{[\s\S]*?\n    \}/);
assert.ok(miniFn, 'applyMiniAgentChips body missing');
assert.ok(!/appAgent|app_agent|appStatus|app_status/.test(miniFn[0]), 'mini chips must not read singleton appAgent/appStatus');
assert.ok(html.includes('isRenderableUsage') || html.includes('hasRenderable'));
// Claude is renderable only via valid remaining windows (not OTel session/$ alone).
assert.ok(!/if\s*\(\s*kind\s*===\s*['"]claude['"]\s*\)\s*return\s*false/.test(html), 'Claude must not be hard-blocked for mini pill');
assert.ok(html.includes('Number.isFinite') || html.includes('isFinite'));
assert.ok(html.includes('claudeOtelBits') || html.includes('本会话'));
assert.ok(html.includes('无官方额度窗口') || html.includes('用量暂无接口'));
assert.ok(css.includes('.overlay-mini__agent[data-status="needs_input"]'));
assert.ok(css.includes('.overlay-mini__agent[data-status="running"]'));
assert.ok(css.includes('.overlay-usage-rail__badge'));
assert.ok(css.includes('.overlay-mini__usage'));
assert.ok(css.includes('text-overflow: ellipsis') || css.includes('text-overflow:ellipsis'));
assert.ok(rust.includes('pub agents: Vec<CodexMicroAgentSnapshot>'));
assert.ok(rust.includes('fn agent_chip_snapshots()'));
assert.ok(rust.includes('primary_state_for(kind)'));
assert.ok(rust.includes('agent_model_metadata::snapshot'));
assert.ok(rust.includes('headline_label') || rust.includes('headline_for_agent'));
assert.ok(/OVERLAY_WIDTH_MINI:\s*f64\s*=\s*24[0-9]\.0/.test(rust), 'mini width should be ~240-249');

var fmt = require(path.join(root, 'src/js/features/agent/usage-format.js'));
assert.strictEqual(fmt.formatResetCountdown(Math.floor(Date.now() / 1000) - 10), '待刷新');
assert.ok(/^2h/.test(fmt.formatResetCountdown(Math.floor(Date.now() / 1000) + 2 * 3600 + 90)));

console.log('soft-pad mini agent tests passed');
