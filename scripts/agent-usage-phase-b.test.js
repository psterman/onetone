'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var rust = fs.readFileSync(path.join(root, 'src-tauri/src/agent_usage.rs'), 'utf8');
var server = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_protocol_server.rs'), 'utf8');
var overlay = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var example = fs.readFileSync(path.join(root, 'scripts/claude-otel-onetone.example.json'), 'utf8');

assert.ok(rust.includes('account/rateLimits/read'));
assert.ok(rust.includes('account/usage/read'));
assert.ok(rust.includes('thread/tokenUsage/updated'));
assert.ok(rust.includes('claude_code.token.usage'));
assert.ok(rust.includes('claude_code.cost.usage'));
assert.ok(rust.includes('100.0 - used'));
assert.ok(rust.includes('Neither path reads transcripts'));
assert.ok(rust.includes('Cursor 暂无稳定官方用量接口'));
assert.ok(rust.includes('Codex 窗口限额未连接'));
assert.ok(!rust.includes('账户余额'));
assert.ok(!/transcript.*scan|scan.*transcript|read_to_string.*transcript/i.test(rust));
assert.ok(server.includes('pub const CLAUDE_OTEL_METRICS_PATH: &str = "/v1/metrics"'));
assert.ok(overlay.includes('id="overlayUsageRail"'));
assert.ok(overlay.includes('function usageSummary'));
assert.ok(overlay.includes("窗口余 "));
assert.ok(overlay.includes("用量 --"));
assert.ok(!overlay.includes('账户余额'));
assert.ok(example.includes('http://127.0.0.1:8796/v1/metrics'));
assert.ok(example.includes('"OTEL_LOGS_EXPORTER": "none"'));

console.log('agent usage Phase B tests passed');
