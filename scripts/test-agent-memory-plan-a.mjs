#!/usr/bin/env node
/**
 * Plan A agent_memory acceptance (still valid under Plan C tree):
 * 1) cargo test --lib agent_memory (--no-default-features avoids Vosk DLL locks)
 * 2) integration test agent_memory_plan_a (observed never mutates lifecycle status)
 *
 * Plan C IPC/homepage projection is allowed in the live tree; see test-agent-memory-plan-c.mjs.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const srcTauri = path.join(root, 'src-tauri');

function cargo(args) {
  const r = spawnSync('cargo', args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: process.env
  });
  if (r.status !== 0) process.exit(r.status || 1);
}

const manifest = path.join(srcTauri, 'Cargo.toml');

cargo([
  'test',
  '--manifest-path',
  manifest,
  'agent_memory',
  '--lib',
  '--no-default-features',
  '--',
  '--nocapture'
]);
console.log('ok cargo test agent_memory --lib');

cargo([
  'test',
  '--manifest-path',
  manifest,
  '--no-default-features',
  '--test',
  'agent_memory_plan_a',
  '--',
  '--nocapture'
]);
console.log('ok agent_memory_plan_a');
