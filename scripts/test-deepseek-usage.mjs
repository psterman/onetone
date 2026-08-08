/**
 * DeepSeek balance on Claude Soft Pad / mini-bar — static self-check.
 * No network: asserts detection, compose, and UI accept balance captions without % windows.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const usageRs = read('src-tauri/src/agent_usage.rs');
const libRs = read('src-tauri/src/lib.rs');
const overlay = read('src/codex-micro-overlay.html');
const hub = read('src/js/features/agent/soft-pad-hub-ui.js');

assert.ok(/fn is_deepseek_api_base/.test(usageRs), 'is_deepseek_api_base present');
assert.ok(/fn parse_claude_deepseek_auth/.test(usageRs), 'parse_claude_deepseek_auth present');
assert.ok(/ANTHROPIC_BASE_URL/.test(usageRs), 'reads ANTHROPIC_BASE_URL');
assert.ok(/api\.deepseek\.com/.test(usageRs), 'official DeepSeek host');
assert.ok(/DEEPSEEK_BALANCE_URL|user\/balance/.test(usageRs), 'GET /user/balance');
assert.ok(/source:\s*"deepseek_balance"/.test(usageRs), 'snapshot source deepseek_balance');
assert.ok(/windows:\s*Vec::new\(\)/.test(usageRs), 'DeepSeek path clears windows');
assert.ok(
  /if ds\.detected/.test(usageRs) || /if ds.detected/.test(usageRs),
  'compose prefers DeepSeek when detected'
);
assert.ok(/start_deepseek_balance_poll/.test(usageRs), 'poll starter');
assert.ok(/kick_deepseek_balance_refresh/.test(usageRs), 'kick refresh');
assert.ok(/kick_deepseek_balance_refresh/.test(read('src-tauri/src/codex_micro_overlay.rs')), 'Claude FG kicks DeepSeek');
assert.ok(/start_deepseek_balance_poll/.test(libRs), 'poll wired in setup');
assert.ok(
  /deepseek_settings_pending_beats_otel_only/.test(usageRs),
  'pending DeepSeek settings beat OTel-only caption'
);
assert.ok(
  /deepseek_compose_ignores_statusline_windows/.test(usageRs),
  'Rust test: DeepSeek ignores statusLine windows'
);
assert.ok(
  /parse_claude_deepseek_auth_requires_deepseek_base/.test(usageRs),
  'Rust test: model name alone is not enough'
);

assert.ok(/function deepseekBalanceCaption/.test(overlay), 'mini deepseekBalanceCaption');
assert.ok(
  /deepseekBalanceCaption\(usage\)/.test(overlay) && /isRenderableUsage/.test(overlay),
  'mini isRenderableUsage can accept DeepSeek caption'
);
assert.ok(
  /replace\(\/\^\(DeepSeek\|Kimi\)\\s\+\//.test(overlay) ||
    /replace\(\/\^DeepSeek/.test(overlay),
  'mini pill shows balance text, not fake %'
);
assert.ok(
  /source \|\| ''\) === 'deepseek_balance'/.test(hub) ||
    /source \|\| ""\) === "deepseek_balance"/.test(hub) ||
    /'deepseek_balance'/.test(hub),
  'Soft Pad usageProps handles deepseek_balance'
);
assert.ok(
  !/remaining_percent.*deepseek|deepseek.*100%/.test(usageRs.toLowerCase()),
  'no fake DeepSeek percent windows in backend'
);

console.log('ok deepseek-usage');
