/**
 * One-shot Phase2 RC *automated* verification.
 * Does NOT mark local desktop / remote / release as passed.
 *
 *   npm run verify:phase2-rc
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const STEPS = [
  { name: 'home-assist-ipc-contract', cmd: 'npm', args: ['run', 'test:home-assist-ipc-contract'] },
  { name: 'home-assist-ownership', cmd: 'npm', args: ['run', 'test:home-assist-ownership'] },
  { name: 'home-assist-ui-checklist', cmd: 'npm', args: ['run', 'test:home-assist-ui-checklist'] },
  { name: 'home-project-context', cmd: 'npm', args: ['run', 'test:home-project-context'] },
  { name: 'home-prompt-prep', cmd: 'npm', args: ['run', 'test:home-prompt-prep'] },
  { name: 'home-agent-v2', cmd: 'npm', args: ['run', 'test:home-agent-v2'] },
  {
    name: 'cargo project_context',
    cmd: 'cargo',
    args: ['test', '--lib', 'project_context', '--no-default-features'],
    cwd: join(root, 'src-tauri')
  },
  { name: 'acceptance-float honesty', cmd: 'node', args: ['scripts/home-acceptance-float-check.js'] }
];

const results = [];
let failed = 0;

for (const step of STEPS) {
  process.stdout.write(`\n── ${step.name} ──\n`);
  const r = spawnSync(step.cmd, step.args, {
    cwd: step.cwd || root,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  const ok = r.status === 0;
  if (!ok) failed++;
  results.push({ name: step.name, ok });
}

console.log('\n========== Phase2 RC auto verify ==========');
for (const r of results) {
  console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.name);
}
console.log(
  failed
    ? `\n${failed} failed — automated layer NOT green`
    : '\nAll automated checks green.\nStill manual: desktop A, Git B, screenshots.\nRemote C needs fee auth (or keep skipped).\nRelease = only after A/B human pass.'
);
process.exit(failed ? 1 : 0);
