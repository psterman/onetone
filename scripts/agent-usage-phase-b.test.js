'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var rust = fs.readFileSync(path.join(root, 'src-tauri/src/agent_usage.rs'), 'utf8');
var health = fs.readFileSync(path.join(root, 'src-tauri/src/connector_health.rs'), 'utf8');
var server = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_protocol_server.rs'), 'utf8');
var overlay = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var example = fs.readFileSync(path.join(root, 'scripts/claude-otel-onetone.example.json'), 'utf8');
var fmt = require(path.join(root, 'src/js/features/agent/usage-format.js'));

assert.ok(rust.includes('account/rateLimits/read'));
assert.ok(rust.includes('account/usage/read'));
assert.ok(rust.includes('account/read'));
assert.ok(rust.includes('refreshToken'));
assert.ok(rust.includes('account_label') || rust.includes('accountLabel'));
assert.ok(rust.includes('plan_type') || rust.includes('planType'));
assert.ok(rust.includes('fn mask_email') || rust.includes('mask_email'));
assert.ok(rust.includes('rate_settled') && rust.includes('usage_settled') && rust.includes('account_settled'));
assert.ok(rust.includes('ACCOUNT_EXTRA_WAIT'));
assert.ok(rust.includes('Identity alone never marks usage ready') || rust.includes('account-only'));
assert.ok(rust.includes('thread/tokenUsage/updated'));
assert.ok(rust.includes('claude_code.token.usage'));
assert.ok(rust.includes('claude_code.cost.usage'));
assert.ok(rust.includes('100.0 - used') || rust.includes('100.0 - u'));
assert.ok(rust.includes('pub windows: Vec<UsageWindow>'));
assert.ok(rust.includes('Neither path reads transcripts'));
assert.ok(rust.includes('Cursor 暂无稳定官方用量接口'));
assert.ok(rust.includes('mark_codex_usage_disabled') || rust.includes('用量轮询已关闭'));
assert.ok(!rust.includes('账户余额'));
assert.ok(health.includes('value_present') || health.includes('valuePresent') || health.includes('ValueState'));
assert.ok(health.includes('aggregate_actionable_state'));
assert.ok(server.includes('TEST_PULSE_PATH'));
assert.ok(server.includes('host_is_loopback'));
assert.ok(server.includes('cors_headers_get'));
assert.ok(server.includes('http://localhost:1420'));
// Production CORS helper must not use wildcard; ignore test assertions that mention "*".
var corsFn = server.match(/fn cors_headers_get\(\)[\s\S]*?\n\}/);
assert.ok(corsFn, 'cors_headers_get missing');
assert.ok(!/Access-Control-Allow-Origin:\s*\*/.test(corsFn[0]));
assert.ok(overlay.includes('id="overlayUsageRail"'));
assert.ok(overlay.includes('function usageSummary'));
assert.ok(overlay.includes('usage-format.js'));
assert.ok(overlay.includes('OneToneUsageFormat'));
assert.ok(overlay.includes('id="miniUsagePill"') || overlay.includes("id='miniUsagePill'"));
assert.ok(overlay.includes('function pickMiniUsageKind') || overlay.includes('function applyMiniUsagePill'));
assert.ok(overlay.includes('overlayUsageRail.hidden=false') || overlay.includes('overlayUsageRail.hidden = false'));
assert.ok(!overlay.includes('账户余额'));
assert.ok(example.includes('http://127.0.0.1:8796/v1/metrics'));
assert.ok(example.includes('"OTEL_LOGS_EXPORTER": "none"'));

var hub = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
assert.ok(hub.includes('cmd_codex_micro_overlay_get_state'));
assert.ok(hub.includes('usageSummary'));
assert.ok(hub.includes('resetCountdown'));
assert.ok(hub.includes('formatResetCountdown'));
assert.ok(hub.includes('primaryResetAt'));
assert.ok(hub.includes('OVERLAY_USAGE_POLL_MS') || hub.includes('30000'));
assert.ok(hub.includes('overlayUsageDeferToken') || hub.includes('requestAnimationFrame'));
assert.ok(hub.includes('stopOverlayUsagePolling'));
assert.ok(hub.includes('onPanelLeave') && hub.includes('stopOverlayUsagePolling'));
assert.ok(hub.includes('ensureOverlayUsagePolling'));
assert.ok(hub.includes('isSoftPadPageVisible'));

var island = fs.readFileSync(path.join(root, 'src-islands/islands/soft-pad-status-island.tsx'), 'utf8');
assert.ok(island.includes('usageSummary'));
assert.ok(island.includes('resetCountdown'));
assert.ok(island.includes('restorePoint'));
assert.ok(island.includes('账号'));
assert.ok(island.includes('额度'));
assert.ok(island.includes('重置'));
assert.ok(island.includes('恢复点'));

// --- Executable countdown contract (not source-string guards) ---
assert.strictEqual(typeof fmt.formatResetCountdown, 'function');
assert.strictEqual(typeof fmt.primaryResetAt, 'function');

assert.strictEqual(fmt.formatResetCountdown(null), '');
assert.strictEqual(fmt.formatResetCountdown(undefined), '');
assert.strictEqual(fmt.formatResetCountdown(0), '');
assert.strictEqual(fmt.formatResetCountdown(NaN), '');
assert.strictEqual(fmt.formatResetCountdown(''), '');

var pastSec = Math.floor(Date.now() / 1000) - 60;
assert.strictEqual(fmt.formatResetCountdown(pastSec), '待刷新');
var pastMs = Date.now() - 60_000;
assert.strictEqual(fmt.formatResetCountdown(pastMs), '待刷新');

var in2h12mSec = Math.floor(Date.now() / 1000) + (2 * 3600) + (12 * 60) + 30;
assert.strictEqual(fmt.formatResetCountdown(in2h12mSec), '2h12m');

var in2h12mMs = Date.now() + (2 * 3600 * 1000) + (12 * 60 * 1000) + 30_000;
assert.strictEqual(fmt.formatResetCountdown(in2h12mMs), '2h12m');

var in3d4hSec = Math.floor(Date.now() / 1000) + (3 * 24 * 3600) + (4 * 3600) + 90;
assert.strictEqual(fmt.formatResetCountdown(in3d4hSec), '3d4h');

var in45mSec = Math.floor(Date.now() / 1000) + (45 * 60) + 5;
assert.strictEqual(fmt.formatResetCountdown(in45mSec), '45m');

// primary missing → first window; primary present wins over scalar
assert.strictEqual(
  fmt.primaryResetAt({
    resetsAt: 111,
    windows: [{ kind: 'secondary', resetsAt: 222 }, { kind: 'primary', resetsAt: 333 }]
  }),
  333
);
assert.strictEqual(
  fmt.primaryResetAt({
    resets_at: 111,
    windows: [{ kind: 'secondary', resets_at: 222 }]
  }),
  222
);
assert.strictEqual(fmt.primaryResetAt({ resetsAt: 999, windows: [] }), 999);
assert.strictEqual(fmt.primaryResetAt({ windows: [{ kind: 'primary' }] }), undefined);

console.log('agent usage Phase B tests passed');
