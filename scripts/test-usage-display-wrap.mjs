/**
 * Soft Pad / mini-bar usage display wrap-up — static self-check.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const hub = read('src/js/features/agent/soft-pad-hub-ui.js');
const overlay = read('src/codex-micro-overlay.html');

// Cursor Activity Provider (not fake official quota)
assert.ok(/次对话/.test(hub), 'hub cursor activity turns');
assert.ok(/本地统计/.test(hub) && /不代表官方额度/.test(hub), 'hub cursor local disclaimer');
assert.ok(!/bits\.push\('用量暂无官方接口'\)/.test(hub), 'hub no old cursor copy');
assert.ok(/isCursorActivityUsage/.test(overlay), 'overlay cursor activity gate');
assert.ok(/cursorActivityBits/.test(overlay), 'overlay cursor activity bits');
assert.ok(/Cu · /.test(overlay), 'mini Cu · N次');
assert.ok(/Cursor 本地活动/.test(overlay), 'hover Cursor 本地活动');
assert.ok(!/if\(kind==='cursor'\) return '用量暂无官方接口'/.test(overlay), 'no dual cursor copy');

// Claude OTel as auxiliary on both surfaces
assert.ok(/本会话消耗/.test(hub), 'hub otel aux wording');
assert.ok(/本会话消耗/.test(overlay), 'overlay otel detail wording');
assert.ok(/claudeOtelBits\(usage,false\)\.length/.test(overlay), 'otel renderable gate');
assert.ok(/Claude OTel-only: show session burn/.test(overlay) || /otel=claudeOtelBits\(usage,false\)/.test(overlay), 'mini otel text path');

// Must not invent remaining % from session tokens
assert.ok(!/sessionTokens[\s\S]{0,120}remaining_percent\s*=/.test(overlay), 'no session→remaining assignment');
assert.ok(!/session_tokens[\s\S]{0,80}remainingPercent/.test(hub), 'hub no session as remaining');

console.log('ok usage-display-wrap');
