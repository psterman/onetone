/**
 * Quarantine / restore Vosk models in ALL places the running app may load from:
 *   - src-tauri/resources/vosk          (source / prepare-vosk)
 *   - src-tauri/target/debug/resources/vosk  (debug exe neighbor)
 *
 * Leaves empty stub dirs so tauri.conf / build.rs still see the paths.
 *
 *   node scripts/vosk-replay-download.mjs quarantine
 *   node scripts/vosk-replay-download.mjs restore
 *   node scripts/vosk-replay-download.mjs status
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = ['vosk-model-small-cn-0.22', 'vosk-model-small-en-us-0.15'];
const VOSK_ROOTS = [
  path.join(root, 'src-tauri', 'resources', 'vosk'),
  path.join(root, 'src-tauri', 'target', 'debug', 'resources', 'vosk'),
];

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function modelReady(dir) {
  return exists(path.join(dir, 'conf', 'model.conf'));
}

function holdDirFor(voskDir) {
  return path.join(voskDir, '_quarantine_replay');
}

function writeStub(live) {
  fs.mkdirSync(live, { recursive: true });
  fs.writeFileSync(
    path.join(live, 'QUARANTINED.txt'),
    'Model files temporarily moved for SAPI / download UX replay.\nRun: node scripts/vosk-replay-download.mjs restore\n',
    'utf8'
  );
}

function statusOne(voskDir) {
  const rel = path.relative(root, voskDir);
  console.log(`[${rel}]`);
  if (!exists(voskDir)) {
    console.log('  (missing root)');
    return;
  }
  for (const name of MODELS) {
    const live = path.join(voskDir, name);
    const held = path.join(holdDirFor(voskDir), name);
    console.log(
      `  ${name}: live=${modelReady(live) ? 'yes' : 'no'} quarantined=${modelReady(held) ? 'yes' : 'no'}`
    );
  }
  console.log(`  dll: ${exists(path.join(voskDir, 'libvosk.dll')) ? 'yes' : 'no'}`);
}

function status() {
  for (const d of VOSK_ROOTS) statusOne(d);
}

function quarantineOne(voskDir) {
  if (!exists(voskDir)) {
    console.log('skip missing root:', path.relative(root, voskDir));
    return;
  }
  const holdDir = holdDirFor(voskDir);
  fs.mkdirSync(holdDir, { recursive: true });
  for (const name of MODELS) {
    const live = path.join(voskDir, name);
    const held = path.join(holdDir, name);
    if (!modelReady(live)) {
      if (!exists(live)) writeStub(live);
      console.log('skip (already empty):', path.relative(root, live));
      continue;
    }
    if (exists(held)) fs.rmSync(held, { recursive: true, force: true });
    fs.renameSync(live, held);
    writeStub(live);
    console.log('quarantined:', path.relative(root, live));
  }
}

function restoreOne(voskDir) {
  const holdDir = holdDirFor(voskDir);
  if (!exists(holdDir)) return;
  for (const name of MODELS) {
    const live = path.join(voskDir, name);
    const held = path.join(holdDir, name);
    if (!modelReady(held)) continue;
    if (exists(live)) fs.rmSync(live, { recursive: true, force: true });
    fs.renameSync(held, live);
    console.log('restored:', path.relative(root, live));
  }
  try {
    fs.rmdirSync(holdDir);
  } catch (_) {}
}

function quarantine() {
  for (const d of VOSK_ROOTS) quarantineOne(d);
  status();
  console.log('\nRestart OneTone. Soft Pad oral will borrow SAPI when Vosk is missing.');
  console.log('Restore later: node scripts/vosk-replay-download.mjs restore');
}

function restore() {
  for (const d of VOSK_ROOTS) restoreOne(d);
  status();
}

const cmd = String(process.argv[2] || 'status').trim();
if (cmd === 'quarantine') quarantine();
else if (cmd === 'restore') restore();
else if (cmd === 'status') status();
else {
  console.error('usage: quarantine | restore | status');
  process.exit(1);
}
