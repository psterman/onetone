/**
 * Shell agent Soft Pad usage — phase-1+2 static self-check.
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function readTree(dir) {
  const abs = join(root, dir);
  if (!existsSync(abs)) return '';
  let out = '';
  for (const name of readdirSync(abs, { withFileTypes: true })) {
    const p = join(dir, name.name);
    if (name.isDirectory()) out += readTree(p);
    else if (name.name.endsWith('.rs')) out += read(p);
  }
  return out;
}

const su = readTree('src-tauri/src/shell_agent_usage');
const au = read('src-tauri/src/agent_usage.rs');
const lib = read('src-tauri/src/lib.rs');
const hub = read('src/js/features/agent/soft-pad-hub-ui.js');
const overlay = read('src/codex-micro-overlay.html');
const cargo = read('src-tauri/Cargo.toml');

assert.ok(/mod shell_agent_usage/.test(lib), 'shell_agent_usage module wired');
assert.ok(/start_shell_agent_usage_poll/.test(lib), 'poll started in setup');
assert.ok(/pub fn put_snapshot/.test(au), 'agent_usage put_snapshot');

// Module split
assert.ok(existsSync(join(root, 'src-tauri/src/shell_agent_usage/mod.rs')), 'mod.rs');
assert.ok(existsSync(join(root, 'src-tauri/src/shell_agent_usage/official/trae.rs')), 'official/trae');
assert.ok(existsSync(join(root, 'src-tauri/src/shell_agent_usage/official/qoder.rs')), 'official/qoder');
assert.ok(existsSync(join(root, 'src-tauri/src/shell_agent_usage/official/workbuddy.rs')), 'official/workbuddy');
assert.ok(existsSync(join(root, 'src-tauri/src/shell_agent_usage/local_usage/mod.rs')), 'local_usage');
assert.ok(existsSync(join(root, 'src-tauri/src/shell_agent_usage/models.rs')), 'models');

// Qoder
assert.ok(/fn parse_qoder_local_session/.test(su), 'qoder local_session parser');
assert.ok(/fn parse_qoder_openapi_quota/.test(su), 'qoder openapi parser');
assert.ok(/qoder_local_session/.test(su) && /qoder_openapi/.test(su), 'qoder sources');
assert.ok(/套餐额度/.test(su) && /额外购买/.test(su), 'qoder Plan/Add-on UX copy');
assert.ok(/下次恢复/.test(su), 'qoder reset copy');
assert.ok(/额度已用尽|已用尽/.test(su) && /friendly_qoder_plan/.test(su), 'qoder membership + exhausted tip');
assert.ok(/开通自/.test(su), 'qoder plan start tip');
assert.ok(/本机今日/.test(overlay) && /localTodayTokens/.test(overlay), 'shell tip local burn');
assert.ok(/api\.qoder\.com/.test(su), 'qoder openapi host');

// WorkBuddy
assert.ok(/fn parse_workbuddy_personal/.test(su), 'wb personal parser');
assert.ok(/fn parse_workbuddy_enterprise/.test(su), 'wb enterprise parser');
assert.ok(/workbuddy_local_session/.test(su), 'wb source');
assert.ok(/copilot\.tencent\.com/.test(su), 'wb billing host');
assert.ok(/WorkBuddy.*CodeBuddy|CodeBuddy.*WorkBuddy/.test(su), 'wb electron roots');
assert.ok(/CodeBuddyExtension/.test(su) && /workbuddy-desktop\.info/.test(su), 'wb desktop auth.info');
assert.ok(/hooks live under ~\/\.codebuddy|not a quota source/.test(su), 'wb hook path note');
assert.ok(/get-dosage-notify/.test(su) && /dosageNotifyZh/.test(su), 'wb dosage_notify');
assert.ok(/裂变包/.test(su) && /体验版/.test(su), 'wb package labels');
assert.ok(/DeductionEndTime/.test(su) && /REFILL_GAP_MS/.test(su), 'wb refill vs bonus');
assert.ok(/shellUsageCaption\(usage,!!detail\)/.test(overlay), 'overlay detail caption');

// Trae entitlement (P0)
assert.ok(/trae_entitlement_api/.test(su), 'trae source name');
assert.ok(!/trae_local_session/.test(su), 'no misleading trae_local_session');
assert.ok(/ide_user_ent_usage/.test(su), 'trae entitlement endpoint');
assert.ok(/Cloud-IDE-JWT/.test(su), 'trae jwt auth');
assert.ok(/iCubeAuthInfo:\/\/icube\.cloudide/.test(su), 'trae storage key');
assert.ok(/fn parse_trae_entitlement/.test(su), 'trae parser');
assert.ok(/速通请求/.test(su), 'trae fast-request copy');
assert.ok(/请登录 Trae 查看额度/.test(su), 'trae manual login copy');
assert.ok(/api-sg-central\.trae\.ai/.test(su) && /fn usage_urls/.test(su), 'trae ROW host fallback');
assert.ok(!/const USAGE_URL: &str = "https:\/\/api\.trae\.cn\/trae\/api\/v2/.test(su), 'no hardcoded CN-only usage URL');

// Forbidden defaults
assert.ok(!/sqlcipher::|SQLCipher::/.test(su), 'no SQLCipher API');
assert.ok(!/ReadProcessMemory|OpenProcess|scan_memory|VirtualQuery/.test(su), 'no process memory scan');
assert.ok(!/CookieJar|SET-COOKIE|set_cookie|document\.cookie/i.test(su), 'no cookie scrape impl');
assert.ok(!/预计还能|还能用\s*\d+\s*天|days remaining/i.test(su), 'no predicted remaining days');

// Local aux isolation
assert.ok(/fn attach_local/.test(su), 'attach_local helper');
assert.ok(/qoder_local_totals|workbuddy_local_totals/.test(su), 'local token collectors');
assert.ok(/parse_wb_stats_tokens/.test(su), 'wb stats parser');
assert.ok(/api\/v1\/stats/.test(su), 'wb CLI stats path');
assert.ok(/今日消耗/.test(hub), 'hub local burn copy');

// Must not invent fake 100% for free/exceeded with total=0
assert.ok(/exceeded \|\| \(total == Some\(0\.0\)/.test(su) || /Some\(0\.0\)/.test(su), 'exceeded → 0%');

assert.ok(/rusqlite/.test(cargo) && /aes-gcm/.test(cargo), 'windows secret deps');
assert.ok(/cbc/.test(cargo) && /sha2/.test(cargo), 'trae decrypt deps');

// Hub / mini gates
assert.ok(/isShellUsageKind/.test(hub), 'hub shell kind helper');
assert.ok(/kind !== 'workbuddy'/.test(hub) || /kind === 'workbuddy'/.test(hub), 'hub merge workbuddy');
assert.ok(/return 'Wb'/.test(overlay) && (/return 'Tw'/.test(overlay) || /return 'Tr'/.test(overlay)) && /return 'Qd'/.test(overlay), 'abbrevs');
assert.ok(/shellUsageCaption/.test(overlay), 'shell caption');
assert.ok(/isUsageFocusKind/.test(overlay), 'focus kinds');
// Soft Pad tip: shell kinds must read message when ready (not fall through to 用量数据未返回).
assert.ok(
  /isShellUsageKind\(kind\)[\s\S]{0,400}shellUsageCaption/.test(overlay),
  'usageSummary shows Trae/WorkBuddy/Qoder message'
);

// Fixture shapes (documented for parsers)
const traeEntitlement = {
  code: 0,
  user_entitlement_pack_list: [
    {
      entitlement_base_info: {
        product_type: 4,
        quota: { premium_model_fast_request_limit: 1000, basic_usage_limit: 500 },
      },
      usage: { premium_model_fast_amount: 275, basic_usage_amount: 150 },
    },
  ],
};
assert.ok(traeEntitlement.user_entitlement_pack_list[0].entitlement_base_info.product_type === 4);
assert.ok(/user_entitlement_pack_list/.test(su), 'trae packs field');
assert.ok(/premium_model_fast_request_limit/.test(su), 'trae fast limit field');
assert.ok(/CycleCapacityRemainPrecise/.test(su), 'wb remain field');
assert.ok(/usedValue/.test(su) && /limitValue/.test(su), 'openapi quota fields');

console.log('ok shell-agent-usage');
