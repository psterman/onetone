/**
 * Phase F helper: validates DeepSeek driver source has native tools/tool_calls
 * and documents the e2e export checklist (events JSON via cmd_agent_task_events).
 *
 * Real single-file e2e (needs Soft Pad DeepSeek key + desktop):
 *   1. localStorage onetone.agentTaskRuntime=1
 *   2. start task on a clean git workspace with one target file
 *   3. cmd_agent_task_drive_deepseek → waiting_approval
 *   4. approve → drive again → run_check → done
 *   5. export: cmd_agent_task_events → save JSON
 *   6. restart app → status/events/checkpoint_id still coherent
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const deepseek = fs.readFileSync(
  path.join(root, 'src-tauri/src/agent_task_runtime/deepseek.rs'),
  'utf8'
);
assert.match(deepseek, /\"tools\"/);
assert.match(deepseek, /tool_calls/);
assert.match(deepseek, /extract_tool_json/);
assert.match(deepseek, /content_fallback/);

const engine = fs.readFileSync(
  path.join(root, 'src-tauri/src/agent_task_runtime/mod.rs'),
  'utf8'
);
assert.match(engine, /drive_releasing/);
assert.match(engine, /api_reject/);

const acceptance = path.join(root, 'docs', 'atr-deepseek-e2e-acceptance.md');
const checklist = {
  flag: 'onetone.agentTaskRuntime=1',
  acceptanceDoc: fs.existsSync(acceptance)
    ? 'docs/atr-deepseek-e2e-acceptance.md'
    : null,
  evidenceDir: 'logs/atr-deepseek-e2e/',
  prepScript: 'scripts/atr-deepseek-e2e-prep.mjs',
  runScript: 'scripts/atr-deepseek-e2e-run.mjs',
  ipc: [
    'cmd_agent_task_start',
    'cmd_agent_task_drive_deepseek',
    'cmd_agent_task_approve_patch',
    'cmd_agent_task_events',
    'cmd_agent_task_status',
    'cmd_agent_task_resume',
    'cmd_agent_task_cancel'
  ],
  constraints: [
    'single file only',
    'baseline dirty refuse overwrite',
    'approve then run_check',
    'same checkpoint_id across waiting→done',
    'real DeepSeek desktop evidence required for harness complete'
  ],
  remainingBoundaries: [
    'real DeepSeek single-file edit',
    'real model check-fail then repair',
    'restart from waiting/interrupted',
    'user dirty not overwritten',
    'long model request vs home/DB'
  ]
};
fs.mkdirSync(path.join(root, 'logs'), { recursive: true });
const out = path.join(root, 'logs', 'atr-phase-f-checklist.json');
fs.writeFileSync(out, JSON.stringify(checklist, null, 2));
console.log('test-atr-phase-f-export: ok →', out);
