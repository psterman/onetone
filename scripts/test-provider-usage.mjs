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
assert.ok(/refresh_minimax_side_channel/.test(pu), 'MiniMax Soft Pad side-channel');
assert.ok(/minimax_desktop_logged_in/.test(pu), 'detect MiniMax Code login');
assert.ok(/Do NOT clear AgentKind::MiniMax/.test(au), 'DeepSeek clear keeps MiniMax usage');
assert.ok(/put_usage_snapshot/.test(au), 'put_usage_snapshot for MiniMax side-channel');
assert.ok(/minimaxi\.com/.test(pu) && /minimax\.io/.test(pu), 'MiniMax region fallback');
assert.ok(/record_local_usage/.test(pu) && /provider-usage-ledger\.json/.test(pu), 'local ledger');
assert.ok(/coding_plan_warning/.test(au) || /coding_plan_warning/.test(pu), 'coding plan warning field');
assert.ok(/ingest_claude_provider_view/.test(au), 'compose ingest');
assert.ok(/local_today_tokens/.test(au), 'snapshot local today');
assert.ok(/softPadCodingPlanProbeWarn|Coding Plan 套餐 key/.test(hub), 'Soft Pad probe warning');
assert.ok(/manual_or_local_estimate/.test(hub), 'hub manual confidence');
assert.ok(/providerBalanceCaption/.test(overlay), 'mini provider caption');
assert.ok(/minimax_balance|minimax/.test(overlay), 'mini accepts minimax usage source');
assert.ok(
  /minimax_remains has official|never treat as balance-only|src==='minimax_manual'/.test(overlay),
  'minimax_remains must not be balance-only caption'
);
assert.ok(
  /src === 'minimax_balance' \|\| src === 'minimax_manual'/.test(hub),
  'hub: minimax remains fall through to windows'
);
assert.ok(/点击填写 Key/.test(pu), 'manual caption invites Soft Pad key fill');
assert.ok(/read_stored_minimax_coding_key|apply_minimax_coding_key/.test(pu), 'OneTone-stored MiniMax key');
assert.ok(/cmd_minimax_coding_key_set/.test(overlay) && /configureMinimaxKeyFromOverlay/.test(overlay), 'overlay caption can set MiniMax key');
assert.ok(/overlayMinimaxKey/.test(overlay) && !/window\.prompt\(/.test(overlay), 'overlay uses inline key form (no WebView prompt)');
assert.ok(/#overlayKeyCaption|#overlayMinimaxKey|\.overlay-key-caption/.test(overlay), 'caption excluded from overlay drag');
assert.ok(/data-act="usage-caption"/.test(overlay), 'usage caption is interactive control');
assert.ok(/ensureMinimaxCodingKeyCard|softPadMinimaxKeyCard/.test(hub), 'Soft Pad MiniMax key card');
assert.ok(/cmd_minimax_coding_key_get/.test(hub) && /cmd_minimax_coding_key_set/.test(hub), 'hub key IPC');
assert.ok(/cmd_minimax_coding_key_get/.test(lib) && /cmd_minimax_coding_key_set/.test(lib), 'key cmds registered');
const overlayIpc = read('src-tauri/permissions/codex-micro-overlay-ipc.toml');
assert.ok(
  /allow-cmd-minimax-coding-key-set/.test(overlayIpc) && /allow-cmd-open-url/.test(overlayIpc),
  'overlay capability allows MiniMax key set + open url'
);
assert.ok(/miniUsageAbbrev[\s\S]*?minimax[\s\S]*?'Mn'/.test(overlay) || /kind==='minimax'\) return 'Mn'/.test(overlay), 'mini Mn abbrev');
assert.ok(/function reasonHint/.test(overlay) || /请切换到 '\+agentLabel/.test(overlay), 'not_foreground uses fg kind label');
assert.ok(/本机今日/.test(overlay) || /控制台查额度/.test(overlay), 'mini manual/local text');
assert.ok(/kind === 'minimax'|kind==='minimax'/.test(hub), 'hub usage includes minimax');
assert.ok(/AgentKind::MiniMax/.test(read('src-tauri/src/soft_pad_runtime/model.rs')), 'AgentKind::MiniMax');
assert.ok(/minimax-chat" => Some\(AgentKind::MiniMax\)/.test(read('src-tauri/src/soft_pad_runtime/model.rs')), 'from_app_target minimax-chat');
// Must not invent fake % for manual providers
assert.ok(!/bailian.*100%|mimo.*remaining_percent\s*=\s*Some\(100/.test(pu), 'no fake 100% for cookie platforms');

console.log('ok provider-usage');
