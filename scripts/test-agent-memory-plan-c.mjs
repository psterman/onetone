#!/usr/bin/env node
/**
 * Plan C acceptance gate (named matrix).
 *
 * IMPORTANT:
 * - `cargo test --lib agent_memory` (11 tests) is Plan A/B unit coverage — NOT Plan C pass.
 * - This script requires `--test agent_memory_plan_c` named matrix to pass.
 * - MCP surface here is MCP-ready Tauri IPC, not an MCP stdio/HTTP server.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcTauri = path.join(root, 'src-tauri');
const manifest = path.join(srcTauri, 'Cargo.toml');

const REQUIRED_TESTS = [
  'checkpoint_create_and_resume',
  'checkpoint_rejects_invalid_session',
  'checkpoint_project_session_isolation',
  'checkpoint_auto_create_is_idempotent',
  'checkpoint_resume_has_no_side_effect',
  'checkpoint_auto_covers_waiting_completed_failed',
  'memory_is_project_scoped',
  'memory_requires_source_event',
  'memory_upsert_is_idempotent',
  'memory_rejects_cross_project_supersedes',
  'memory_fts_search',
  'memory_fts_rebuild',
  'memory_rejects_sensitive_fields',
  'context_is_project_scoped',
  'context_unknown_project_returns_empty',
  'context_limit_is_enforced',
  'context_failure_returns_diagnostics',
  'mcp_tools_are_read_only',
  'mcp_rejects_raw_sql',
  'mcp_query_and_limit_are_bounded',
  'mcp_does_not_expose_sensitive_fields',
  'mcp_checkpoint_preview_has_no_side_effect'
];

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

const planCTest = read(path.join(srcTauri, 'tests', 'agent_memory_plan_c.rs'));
for (const name of REQUIRED_TESTS) {
  if (!planCTest.includes(`fn ${name}(`)) {
    console.error('Plan C gate fail: missing named test', name);
    process.exit(1);
  }
}

const presence = [
  {
    file: path.join(srcTauri, 'src', 'agent_memory', 'checkpoint.rs'),
    needles: ['create_checkpoint', 'resume_checkpoint', 'maybe_auto_checkpoint']
  },
  {
    file: path.join(srcTauri, 'src', 'agent_memory', 'memory.rs'),
    needles: ['upsert_memory', 'query_memory', 'rebuild_memory_fts']
  },
  {
    file: path.join(srcTauri, 'src', 'agent_memory', 'mcp_readonly.rs'),
    needles: ['tool_memory_search', 'tool_checkpoint_preview', 'executes']
  },
  {
    file: path.join(root, 'src', 'js', 'features', 'now', 'now-home.js'),
    needles: ['cmd_agent_checkpoint_resume']
  },
  {
    file: path.join(root, 'src', 'js', 'features', 'now', 'now-agent-home.js'),
    needles: ['暂无可恢复任务', '暂无项目记忆']
  }
];

for (const item of presence) {
  const text = read(item.file);
  for (const n of item.needles) {
    if (!text.includes(n)) {
      console.error('Plan C presence fail:', n, 'in', path.relative(root, item.file));
      process.exit(1);
    }
  }
}

console.log('ok plan-c named matrix present');
console.log('note: MCP-ready Tauri IPC only — not MCP stdio/HTTP server');

// Avoid colliding with a running OneTone/debug build that locks target/debug/onetone.exe.
const isolatedTarget = path.join(srcTauri, 'target-plan-c');
if (!process.env.CARGO_TARGET_DIR) {
  process.env.CARGO_TARGET_DIR = isolatedTarget;
  console.log('note: CARGO_TARGET_DIR ->', isolatedTarget, '(avoids onetone.exe file lock)');
}

function cargo(args) {
  const r = spawnSync('cargo', args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

cargo([
  'test',
  '--manifest-path',
  manifest,
  '--no-default-features',
  '--test',
  'agent_memory_plan_c',
  '--',
  '--nocapture'
]);
console.log('ok agent_memory_plan_c named matrix');

// Smoke homepage projection (not full Tauri e2e).
const smoke = spawnSync('node', [path.join(root, 'scripts', 'smoke-now-home.mjs')], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: process.env
});
if (smoke.status !== 0) process.exit(smoke.status || 1);
console.log('ok plan-c homepage smoke (fixture projection; not live Tauri window)');

console.log('Plan C gate: PASS (named tests + smoke). MCP server: NOT claimed.');
