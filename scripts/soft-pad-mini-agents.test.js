'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
var rust = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
var overlayCmd = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/codex_micro_overlay_cmd.rs'),
  'utf8'
);
var fmt = require(path.join(root, 'src/js/features/agent/usage-format.js'));

['codex', 'claude', 'cursor'].forEach(function (kind) {
  assert.ok(html.includes('data-agent="' + kind + '"'), 'missing agent chip: ' + kind);
});
assert.ok(html.includes('id="padAgentBar"') || html.includes('soft-pad-agent-bar'));
assert.ok(html.includes('function applyMiniAgentChips'));
assert.ok(html.includes('function applyMiniUsagePill'));
assert.ok(html.includes('function pickMiniUsageKind'));
assert.ok(html.includes('function applyUsageCaptionIdle') || html.includes('usageCaptionIdle'));
assert.ok(html.includes('usage-format.js'));
assert.ok(html.includes('OneToneUsageFormat') || html.includes('formatResetCountdown'));
assert.ok(html.includes('id="miniUsagePill"'));
assert.ok(html.includes('usageSummary(kind,usage'));
assert.ok(html.includes('row.modelConfidence||row.model_confidence') || html.includes('modelConfidence'));
assert.ok(html.includes('模型 --') || html.includes("'模型 --'"));
assert.ok(!html.includes('id="overlayUsageRail"'), 'usage rail must be removed');
assert.ok(!html.includes('data-usage-tab='), 'usage tabs must be removed');
assert.ok(!html.includes('function applyUsageRail'), 'applyUsageRail must be removed');
assert.ok(html.includes('cmd_soft_pad_focus_agent'));
assert.ok(html.includes('focusedUsageAgent') || html.includes('onetoneFocusedUsageAgent'));
assert.ok(html.includes('usageFocusPinned') || html.includes('onetoneUsageFocusPinned'));
assert.ok(html.includes('is-usage-focus') || html.includes('setUsageFocusFromUi'));
assert.ok(fmt.windowQuotaLabel, 'windowQuotaLabel missing');
assert.strictEqual(fmt.windowQuotaLabel({ kind: 'primary', durationMins: 10080, remainingPercent: 35 }), '周余35%');
assert.strictEqual(fmt.windowQuotaLabel({ kind: 'primary', durationMins: 300, remainingPercent: 76 }), '5h余76%');
assert.ok(!String(fmt.windowQuotaLabel({ durationMins: 10080, remainingPercent: 35 })).includes('10080'));
assert.ok(css.includes('soft-pad-agent-bar'));
assert.ok(css.includes('soft-pad-agent-bar__chip'));
assert.ok(html.includes('icons/app-target/codex.png') && html.includes('icons/app-target/claude.png') && html.includes('icons/app-target/cursor.png'));
assert.ok(!html.includes('codex-glyph.svg') && !html.includes('claude-glyph.svg') && !html.includes('cursor-glyph.svg'));
assert.ok(!html.includes('soft-pad-agent-bar__abbr'));
assert.ok(css.includes('is-usage-focus'));
assert.ok(!css.includes('.overlay-usage-rail {') && !css.includes('.overlay-usage-rail{'), 'rail CSS must be gone');
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/codex.png')));
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/claude.png')));
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/cursor.png')));
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
assert.ok(!/if\s*\(\s*kind\s*===\s*['"]claude['"]\s*\)\s*return\s*false/.test(html), 'Claude must not be hard-blocked for mini pill');
assert.ok(html.includes('Number.isFinite') || html.includes('isFinite'));
assert.ok(html.includes('claudeOtelBits') || html.includes('本会话'));
assert.ok(html.includes('额度未同步') || html.includes('无官方额度') || html.includes('用量暂无接口'));
assert.ok(html.includes('claudeFallbackCaption') || html.includes('额度未同步'));
assert.ok(css.includes('.overlay-mini__agent[data-status="needs_input"]'));
assert.ok(css.includes('.overlay-mini__agent[data-status="running"]'));
assert.ok(css.includes('.overlay-mini__usage'));
assert.ok(css.includes('text-overflow: ellipsis') || css.includes('text-overflow:ellipsis'));
assert.ok(rust.includes('pub agents: Vec<CodexMicroAgentSnapshot>'));
assert.ok(rust.includes('fn agent_chip_snapshots()'));
assert.ok(rust.includes('primary_state_for(kind)'));
assert.ok(rust.includes('agent_model_metadata::snapshot'));
assert.ok(rust.includes('headline_label') || rust.includes('headline_for_agent'));
assert.ok(/OVERLAY_WIDTH_MINI:\s*f64\s*=\s*24[0-9]\.0/.test(rust), 'mini width should be ~240-249');
assert.ok(/OVERLAY_HEIGHT_FULL:\s*f64\s*=\s*46[0-9]\.0/.test(rust), 'full height should drop after rail removal (~460-469)');
assert.ok(overlayCmd.includes('cmd_soft_pad_focus_agent'));
assert.ok(overlayCmd.includes('CLAUDE_CODE_APP_TARGET_ID'));
assert.ok(overlayCmd.includes('CURSOR_APP_TARGET_ID'));

assert.strictEqual(fmt.formatResetCountdown(Math.floor(Date.now() / 1000) - 10), '待刷新');
assert.ok(/^2h/.test(fmt.formatResetCountdown(Math.floor(Date.now() / 1000) + 2 * 3600 + 90)));

console.log('soft-pad mini agent tests passed');
