/**
 * Multi-provider Soft Pad usage — static self-check (no network).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const pu = read('src-tauri/src/provider_usage.rs');
const au = read('src-tauri/src/agent_usage.rs');
const lib = read('src-tauri/src/lib.rs');
const hub = read('src/js/features/agent/soft-pad-hub-ui.js');
const overlay = read('src/codex-micro-overlay.html');

assert.ok(/mod provider_usage/.test(lib), 'provider_usage module wired');
assert.ok(/start_provider_usage_poll/.test(lib), 'poll started in setup');
assert.ok(/fn detect_provider_from_base/.test(pu), 'BASE_URL detector');
assert.ok(/ProviderId::Ark/.test(pu) && /ProviderId::Glm/.test(pu), 'Ark+GLM');
assert.ok(/ProviderId::Kimi/.test(pu) && /ProviderId::MiniMax/.test(pu), 'Kimi+MiniMax');
assert.ok(/ProviderId::Bailian/.test(pu) && /ProviderId::Mimo/.test(pu), 'bailian+mimo');
assert.ok(/is_manual_only/.test(pu), 'manual-only gate');
assert.ok(/manual_or_local_estimate/.test(pu), 'manual confidence');
assert.ok(/arkcli/.test(pu) && /coding-plan/.test(pu), 'arkcli coding-plan');
assert.ok(/quota\/limit/.test(pu), 'GLM quota endpoint');
assert.ok(/users\/me\/balance/.test(pu), 'Kimi balance');
assert.ok(/coding_plan\/remains/.test(pu), 'MiniMax remains');
assert.ok(/minimaxi\.com/.test(pu) && /minimax\.io/.test(pu), 'MiniMax region fallback');
assert.ok(/record_local_usage/.test(pu) && /provider-usage-ledger\.json/.test(pu), 'local ledger');
assert.ok(/coding_plan_warning/.test(au) || /coding_plan_warning/.test(pu), 'coding plan warning field');
assert.ok(/ingest_claude_provider_view/.test(au), 'compose ingest');
assert.ok(/local_today_tokens/.test(au), 'snapshot local today');
assert.ok(/softPadCodingPlanProbeWarn|Coding Plan 套餐 key/.test(hub), 'Soft Pad probe warning');
assert.ok(/manual_or_local_estimate/.test(hub), 'hub manual confidence');
assert.ok(/providerBalanceCaption/.test(overlay), 'mini provider caption');
assert.ok(/本机今日/.test(overlay) || /控制台查额度/.test(overlay), 'mini manual/local text');
// Must not invent fake % for manual providers
assert.ok(!/bailian.*100%|mimo.*remaining_percent\s*=\s*Some\(100/.test(pu), 'no fake 100% for cookie platforms');

console.log('ok provider-usage');
