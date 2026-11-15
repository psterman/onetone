import fs from 'node:fs';
import assert from 'node:assert/strict';

const team = fs.readFileSync('src-tauri/src/agent_task_runtime/team.rs', 'utf8');
const commands = fs.readFileSync('src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs', 'utf8');
const task = fs.readFileSync('src/js/features/now/home-agent-task.js', 'utf8');
const panel = fs.readFileSync('src/js/features/now/home-agent-team.js', 'utf8');

for (const marker of [
  'execution_provider',
  'ensure_team_coordinator',
  'claim_scheduler_lease',
  'prepare_repair',
  'team_completed',
  'team_cancelled',
  'patch_review',
  'test_result',
]) assert.match(team, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

for (const marker of [
  'cmd_agent_team_reconcile',
  'cmd_agent_team_resume',
  'cmd_agent_team_cancel',
]) assert.match(commands, new RegExp(marker));

for (const marker of ['teamReconcile', 'teamResume', 'teamCancel']) {
  assert.match(task, new RegExp(marker));
  assert.match(panel, new RegExp(marker));
}

if (process.env.TEAM_E2E_REAL === '1') {
  console.log('team-e2e: real DeepSeek smoke must be run with the desktop app and configured credentials');
} else {
  console.log('team-e2e: contract checks ok (set TEAM_E2E_REAL=1 for real-provider smoke)');
}
