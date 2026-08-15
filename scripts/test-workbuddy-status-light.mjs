/**
 * Guard: WorkBuddy Hook-driven lamp + correct settings path; no mtime fake motion.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const setup = read('src-tauri/src/shell_agent_hook_setup.rs');
assert.ok(setup.includes('resolve_workbuddy_settings_path'), 'WorkBuddy path resolver');
assert.ok(setup.includes('.workbuddy-ai'), 'prefers workbuddy-ai generation');
assert.ok(setup.includes('.workbuddy'), 'legacy .workbuddy supported');
assert.ok(
  !/AgentKind::WorkBuddy => home\.join\("\.codebuddy"\)/.test(setup),
  'must not write WorkBuddy hooks only to .codebuddy'
);
assert.ok(setup.includes('("PreToolUse", 5)'), 'WorkBuddy hooks include PreToolUse');

const rustOverlay = read('src-tauri/src/codex_micro_overlay.rs');
assert.ok(
  rustOverlay.includes('AgentKind::WorkBuddy') &&
    rustOverlay.includes('OfficialHook') &&
    /WorkBuddy[\s\S]{0,400}OfficialHook/.test(rustOverlay),
  'WorkBuddy lamp follows OfficialHook only'
);
assert.ok(
  !/MiniMax \|\| kind == AgentKind::WorkBuddy/.test(rustOverlay),
  'WorkBuddy not lumped with MiniMax idle-forever'
);

const rustProc = read('src-tauri/src/pad_status/adapters/shell_agent_process.rs');
assert.ok(
  rustProc.includes('no realtime motion lamp'),
  'inferred Working still blocked for WorkBuddy'
);

const overlay = read('src/codex-micro-overlay.html');
assert.ok(
  overlay.includes("if(kind==='minimax') state='idle'"),
  'only MiniMax forces idle in overlay'
);
assert.ok(
  !overlay.includes("kind==='minimax'||kind==='workbuddy') state='idle'"),
  'WorkBuddy not forced idle in overlay'
);

console.log('ok workbuddy-hook-lamp');
