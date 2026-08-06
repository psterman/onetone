'use strict';

/**
 * Audit guard: Claude-based AG/ACT + mini status boundaries for Codex/Cursor.
 * Matches docs/pad-status-core.md honesty ceilings — not product parity claims.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var padStatus = fs.readFileSync(path.join(root, 'src-tauri/src/pad_status/mod.rs'), 'utf8');
var purpose = fs.readFileSync(path.join(root, 'src-tauri/src/soft_pad_purpose.rs'), 'utf8');
var catalog = fs.readFileSync(path.join(root, 'src-tauri/src/agent_catalog/mod.rs'), 'utf8');
var overlay = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
var overlayCmd = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/codex_micro_overlay_cmd.rs'),
  'utf8'
);
var docs = fs.readFileSync(path.join(root, 'docs/pad-status-core.md'), 'utf8');

// Cursor hook → Attention only; never writes PadStatus AG host.
assert.ok(
  /if source == "cursor_hook" \{[\s\S]*?ingest_cursor_hook_event[\s\S]*?return snapshot\(\);/.test(
    padStatus
  ),
  'cursor_hook must early-return after Attention ingest'
);

// Cursor never owns AG session navigation.
assert.ok(
  /if kind == AgentKind::Cursor \{\s*return false;\s*\}/.test(purpose),
  'is_navigation_micro_key must hard-block Cursor'
);
assert.ok(purpose.includes('cursor_no_navigation') || purpose.includes('cursor_forces_action'));

// Catalog ceilings.
assert.ok(
  /AgentKind::Claude =>[\s\S]*?can_multi_agent_lights:\s*true/.test(catalog),
  'Claude owns multi-agent lights'
);
assert.ok(
  /AgentKind::Codex =>[\s\S]*?can_multi_agent_lights:\s*false/.test(catalog),
  'Codex multi-AG lights are a non-goal'
);
assert.ok(
  /fn cursor_capabilities[\s\S]*?can_observe_session_lanes:\s*false[\s\S]*?can_multi_agent_lights:\s*false/.test(
    catalog
  ),
  'Cursor: no session lanes, no multi AG lights'
);

// AG cell paint priority: native > Claude lights > Codex status host.
assert.ok(overlay.includes('fn resolve_cell_run_status'));
assert.ok(
  /fresh native|Claude agent light|Codex status host/i.test(overlay) ||
    (overlay.includes('claude_lights') && overlay.includes('status_light_micro_key')),
  'AG paint must keep Claude + Codex host paths'
);
assert.ok(overlay.includes('fn act_context_for'), 'ACT emphasize map present');
assert.ok(overlay.includes('fn agent_chip_snapshots'), 'mini chips from Attention projection');

// Mini jump = focus composer for all three.
assert.ok(overlayCmd.includes('"codex"'));
assert.ok(overlayCmd.includes('"claude"'));
assert.ok(overlayCmd.includes('"cursor"'));
assert.ok(overlayCmd.includes('focus_composer_only'));

// Doc honesty: Cursor not Micro-equivalent; no Codex Hook multi-AG.
assert.ok(docs.includes('不做 Codex Hook 多灯') || docs.includes('Codex Hook 多灯'));
assert.ok(/Cursor/.test(docs) && docs.includes('can_observe_needs_input'));

console.log('soft-pad AG/ACT compat audit passed');
