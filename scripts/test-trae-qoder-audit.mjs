/**
 * Audit: Trae Work (SOLO) = local activity lamps; Trae Code = OfficialHook-only;
 * Qoder/WorkBuddy stay Hook-only. TraeCode/IDE hooks accepted on 8796.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const setup = read('src-tauri/src/shell_agent_hook_setup.rs');
assert.ok(setup.includes('resolve_trae_hooks_path'), 'Trae dual-path resolver');
assert.ok(setup.includes('.trae-cn'), 'Trae CN hooks path');
assert.ok(setup.includes('migrate_trae_legacy_root'), 'Trae legacy root → hooks{} migrator');
assert.ok(
  /TRAE:[\s\S]*hooks_at_root:\s*false/.test(setup),
  'Trae hooks nest under hooks{} (official schema)'
);
assert.ok(
  /write_merged_hooks\(profile, &trae_cn_hooks_path/.test(setup),
  'Trae install always mirrors into ~/.trae-cn'
);
assert.ok(
  /kind:\s*AgentKind::TraeCode/.test(setup) && /source_arg:\s*"trae_code"/.test(setup),
  'TRAE hook profile binds TraeCode / trae_code'
);
assert.ok(!/kind:\s*AgentKind::Trae,/.test(setup) || !/TRAE:[\s\S]{0,80}AgentKind::Trae[^C]/.test(setup),
  'TRAE install profile is not Trae Work');

const overlay = read('src-tauri/src/codex_micro_overlay.rs');
assert.ok(
  /WorkBuddy \| AgentKind::Qoder/.test(overlay) &&
    overlay.includes('OfficialHook'),
  'WorkBuddy/Qoder stay OfficialHook-only'
);
assert.ok(
  !/matches!\(\s*kind,\s*AgentKind::WorkBuddy \| AgentKind::TraeCode \| AgentKind::Qoder\s*\)/.test(
    overlay
  ),
  'Trae Code must not stay OfficialHook-only (local activity + Hook)'
);
assert.ok(
  overlay.includes('soft_pad_agent_is_foreground') &&
    /AgentKind::Trae\s*\|\s*AgentKind::TraeCode/.test(overlay) &&
    /AgentKind::Qoder/.test(overlay),
  'Soft Pad host FG must include Trae Work + Trae Code + Qoder'
);

const model = read('src-tauri/src/soft_pad_runtime/model.rs');
assert.ok(/TraeCode/.test(model), 'AgentKind::TraeCode exists');
assert.ok(/"trae-work"/.test(model) && /"trae-code"/.test(model), 'app targets split');
assert.ok(/"trae-chat"/.test(model), 'legacy trae-chat → Work');

const identity = read('src-tauri/src/app_identity.rs');
assert.ok(/TRAE_APP_TARGET_ID:\s*&str\s*=\s*"trae-work"/.test(identity), 'Work id trae-work');
assert.ok(/TRAE_CODE_APP_TARGET_ID:\s*&str\s*=\s*"trae-code"/.test(identity), 'Code id trae-code');
assert.ok(
  identity.indexOf('TRAE SOLO.exe') < identity.indexOf('Trae.exe'),
  'SOLO matcher before IDE Trae.exe'
);

const proc = read('src-tauri/src/pad_status/adapters/shell_agent_process.rs');
assert.ok(proc.includes('trae_solo_activity_roots'), 'Trae Solo activity roots');
assert.ok(proc.includes('TRAE SOLO'), 'watches TRAE SOLO AppData');
assert.ok(
  /matches!\(kind, AgentKind::WorkBuddy \| AgentKind::Qoder\)/.test(proc),
  'WorkBuddy/Qoder inferred Working blocked'
);
{
  const apply = proc.split('fn apply_inferred')[1]?.split('fn refresh_configured_if_due')[0] || '';
  assert.ok(
    apply.includes('AgentKind::WorkBuddy | AgentKind::Qoder'),
    'apply_inferred blocks WorkBuddy/Qoder'
  );
  assert.ok(
    !/AgentKind::WorkBuddy \| AgentKind::TraeCode \| AgentKind::Qoder/.test(apply),
    'Trae Code allowed inferred Working'
  );
}

const usage = read('src-tauri/src/shell_agent_usage/official/trae.rs');
assert.ok(usage.includes('"TRAE SOLO"'), 'entitlement reads TRAE SOLO storage');

const app = read('src-tauri/src/codex_app_state.rs');
assert.ok(
  /"trae_code_hook" \| "trae_hook" => Some\("trae_hook"\)/.test(app),
  '8796 accepts trae_code_hook and legacy trae_hook'
);
assert.ok(/"qoder_hook" => Some\("qoder_hook"\)/.test(app), '8796 accepts qoder_hook');

const shellAgent = read('src-tauri/src/pad_status/adapters/shell_agent.rs');
assert.ok(
  /"trae_code_hook" \| "trae_hook" => Some\(AgentKind::TraeCode\)/.test(shellAgent),
  'trae_code_hook and trae_hook map to TraeCode'
);

const tip = read('src/codex-micro-overlay.html');
assert.ok(
  tip.includes('data-agent="traeCode"') && tip.includes('data-agent="trae"'),
  'Soft Pad has Work + Code chips'
);
assert.ok(
  tip.includes('本地活跃度') || tip.includes('Cursor 模式') || tip.includes('SOLO'),
  'Trae Work tip mentions Solo local activity'
);
assert.ok(
  tip.includes('Trae Code') && /Hook/.test(tip),
  'Trae Code tip mentions Hook'
);

const home = homedir();
const qoderSettings = join(home, '.qoder', 'settings.json');
const traeHooks = join(home, '.trae', 'hooks.json');
const traeCnHooks = join(home, '.trae-cn', 'hooks.json');

const qoderRaw = existsSync(qoderSettings) ? readFileSync(qoderSettings, 'utf8') : '';
const qoderHas = /onetone-hook-id|qoder-activity-v1/.test(qoderRaw);
const traeRaw = existsSync(traeHooks)
  ? readFileSync(traeHooks, 'utf8')
  : existsSync(traeCnHooks)
    ? readFileSync(traeCnHooks, 'utf8')
    : '';
const traeHas = /onetone-hook-id|trae-activity-v1/.test(traeRaw);
if (traeHas) {
  const parsed = JSON.parse(traeRaw);
  assert.ok(parsed.hooks && typeof parsed.hooks === 'object', 'installed Trae hooks use hooks{} wrapper');
  assert.equal(parsed.SessionStart, undefined, 'Trae events must not sit at JSON root');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      machine: {
        qoderSettingsExists: existsSync(qoderSettings),
        qoderOnetoneHookInstalled: qoderHas,
        traeHooksExists: existsSync(traeHooks),
        traeCnHooksExists: existsSync(traeCnHooks),
        traeOnetoneHookInstalled: traeHas
      }
    },
    null,
    2
  )
);
console.log('ok trae-qoder-audit');
