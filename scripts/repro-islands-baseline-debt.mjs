/**
 * Reproduce ISLANDS-HOME-ROADMAP-BASELINE debt against git HEAD sources.
 * Same two assertions as scripts/test-home-roadmap.mjs (boot settle + hub card).
 *
 * Run: node scripts/repro-islands-baseline-debt.mjs
 * Exit 0 = both fail on HEAD (debt still valid). Exit 1 = unexpected PASS (debt may be stale).
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function show(rel) {
  return execSync(`git show HEAD:${rel}`, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

function bootSettledOk(boot, persist, session, presence) {
  return (
    persist.includes('__otBootCameraCold') &&
    persist.includes('bootCameraReconcile') &&
    /camDelay\s*=\s*2500/.test(persist) &&
    /reason==='config_applied'[\s\S]*?boot_deferred/.test(presence) &&
    session.includes('Yield between settle jobs') &&
    /setTimeout\(next,\s*0\)/.test(session) &&
    /setTimeout\(function\(\)\{[\s\S]*flushDeferredMvpInitSideEffects[\s\S]*\},120\)/.test(boot)
  );
}

function hubGlobalCardOk(hub) {
  const fn = hub.match(/function renderGlobalDefaultCard\(\)\{[\s\S]*?\n  function /);
  return !!(
    fn &&
    !fn[0].includes('habit-hub-channels') &&
    fn[0].includes('data-habit-global-home') &&
    fn[0].includes('habit-hub-hero--thin')
  );
}

const commit = execSync('git rev-parse HEAD', { cwd: root, encoding: 'utf8' }).trim();
const files = {
  boot: 'src/js/core/app-boot.js',
  persist: 'src/js/core/config-persist.js',
  session: 'src/js/core/app-session.js',
  presence: 'src/js/features/camera/camera-presence-actions.js',
  hub: 'src/js/features/mapping/habit-hub.js'
};

const base = {
  boot: show(files.boot),
  persist: show(files.persist),
  session: show(files.session),
  presence: show(files.presence),
  hub: show(files.hub)
};
const cur = {
  boot: readFileSync(join(root, files.boot), 'utf8'),
  persist: readFileSync(join(root, files.persist), 'utf8'),
  session: readFileSync(join(root, files.session), 'utf8'),
  presence: readFileSync(join(root, files.presence), 'utf8'),
  hub: readFileSync(join(root, files.hub), 'utf8')
};

const rows = [
  {
    name: 'boot settled heavy 错峰',
    baseline: bootSettledOk(base.boot, base.persist, base.session, base.presence),
    current: bootSettledOk(cur.boot, cur.persist, cur.session, cur.presence)
  },
  {
    name: 'hub 通用设置无四通道栅格',
    baseline: hubGlobalCardOk(base.hub),
    current: hubGlobalCardOk(cur.hub)
  }
];

console.log('ISLANDS-HOME-ROADMAP-BASELINE repro');
console.log('HEAD', commit);
for (const r of rows) {
  console.log(
    `  ${r.name}: baseline=${r.baseline ? 'PASS' : 'FAIL'} current=${r.current ? 'PASS' : 'FAIL'}`
  );
}

const bothBaselineFail = rows.every((r) => !r.baseline);
if (bothBaselineFail) {
  console.log('OK: both checks FAIL on git HEAD — debt evidence still valid.');
  process.exit(0);
}
console.error('UNEXPECTED: at least one baseline check PASSes — update ISLANDS_DEBT.md.');
process.exit(1);
