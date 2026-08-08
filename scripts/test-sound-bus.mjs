/**
 * Sound bus: few user slots, policy matrix, source guards.
 * L1 static + in-process bus notify (no Audio).
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const USER_SLOT_CAP = 5;
const RESULT_CODES = new Set([
  'played',
  'suppressed_seen',
  'suppressed_duplicate',
  'suppressed_disabled',
  'suppressed_priority',
  'suppressed_master',
]);

// --- L1 static guards ---
const busSrc = read('src/js/core/sound-bus.js');
const surfacesSrc = read('src/js/core/sound-surfaces.js');
const themeSrc = read('src/js/core/app-theme-prefs.js');
const storeSrc = read('src-tauri/src/agent_attention/store.rs');

assert.ok(/masterEnabled===undefined/.test(themeSrc), 'L1 masterEnabled default only when undefined');
assert.ok(/Do NOT force masterEnabled/.test(themeSrc), 'L1 mute stick comment');
assert.ok(!/sounds\.masterEnabled\s*=\s*true(?!\s*;)/.test(themeSrc.replace(/if\(state\(\)\.config\.sounds\.masterEnabled===undefined\) state\(\)\.config\.sounds\.masterEnabled=true;/, '')),
  'L1 no other masterEnabled=true force');
assert.ok(/struct RaiseOutcome/.test(storeSrc), 'L1 RaiseOutcome');
assert.ok(/signal_inserted/.test(storeSrc) && /state_changed/.test(storeSrc), 'L1 RaiseOutcome fields');
assert.ok(/MIN_AGENT_TASK_MS:\s*u64\s*=\s*3000/.test(storeSrc), 'L1 3s gate');
assert.ok(/agent\.needs_input/.test(storeSrc) && /agent\.failed/.test(storeSrc) && /agent\.completed/.test(storeSrc),
  'L1 agent sound events');
assert.ok(/agentFeedbackSeen/.test(surfacesSrc), 'L1 agentFeedbackSeen');
assert.ok(/setOverlayVisible/.test(surfacesSrc), 'L1 setOverlayVisible');
assert.ok(/USER_CATEGORY_KEYS/.test(busSrc), 'L1 USER_CATEGORY_KEYS');
assert.ok(/when_unseen/.test(busSrc), 'L1 when_unseen policy');

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walkJs(p, out);
    } else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const featureJs = walkJs(join(root, 'src/js/features'));
const bannedDirectAudio = [];
const bannedBareCuePick = [];
for (const file of featureJs) {
  const rel = file.slice(root.length + 1).replace(/\\/g, '/');
  if (rel.includes('sound-bus') || rel.includes('app-theme-prefs')) continue;
  const src = readFileSync(file, 'utf8');
  if (/\bnew\s+Audio\s*\(/.test(src)) bannedDirectAudio.push(rel);
  // Business must not pick wav files by id for playSoundFile
  if (/playSoundFile\s*\(\s*['"][^'"]+['"]/.test(src)) bannedBareCuePick.push(rel);
}
assert.equal(bannedDirectAudio.length, 0, `L1 no new Audio in features: ${bannedDirectAudio.join(', ')}`);
assert.equal(bannedBareCuePick.length, 0, `L1 no direct playSoundFile(id) in features: ${bannedBareCuePick.join(', ')}`);

console.log('L1 static ok');

// --- L2 in-process bus ---
const plays = [];
const sandbox = {
  console,
  Date,
  Math,
  String,
  Number,
  Object,
  Array,
  isFinite,
  window: {},
  globalThis: {},
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.OneToneAppThemePrefs = {
  ensureSoundsConfig() {
    return sandbox.__sounds;
  },
  playSoundFile(id) {
    plays.push(id);
  },
};
sandbox.OneToneSoundSurfaces = {
  agentFeedbackSeen() {
    return !!sandbox.__agentSeen;
  },
  deviceAlertSeen() {
    return !!sandbox.__deviceSeen;
  },
};

vm.runInNewContext(busSrc, sandbox, { filename: 'sound-bus.js' });
const Bus = sandbox.OneToneSoundBus;
assert.ok(Bus, 'bus exported');
assert.equal(Bus.USER_CATEGORY_KEYS.length, USER_SLOT_CAP, `user slots ≤ ${USER_SLOT_CAP}`);
assert.ok(Bus.USER_CATEGORY_KEYS.length <= USER_SLOT_CAP, 'slot cap');

function resetSounds(partial) {
  sandbox.__sounds = {
    masterEnabled: true,
    masterVolume: 0.65,
    categories: JSON.parse(JSON.stringify(Bus.CATEGORY_DEFAULTS)),
    ...partial,
  };
  Bus.ensureCategoriesConfig(sandbox.__sounds);
  Bus.resetForTest();
  plays.length = 0;
  sandbox.__agentSeen = false;
  sandbox.__deviceSeen = false;
}

function lastResult() {
  const rows = Bus.lastResults();
  return rows[rows.length - 1];
}

resetSounds({ masterEnabled: false });
assert.equal(Bus.notify('agent.needs_input'), 'suppressed_master');
assert.ok(RESULT_CODES.has(lastResult().result));

resetSounds();
sandbox.__agentSeen = true;
assert.equal(Bus.notify('agent.needs_input'), 'suppressed_seen');

resetSounds();
assert.equal(Bus.notify('agent.needs_input'), 'played');
assert.equal(Bus.notify('agent.needs_input'), 'suppressed_duplicate');

resetSounds();
assert.equal(Bus.notify('agent.completed', { taskMs: 500 }), 'suppressed_disabled');
assert.equal(lastResult().detail, 'short_task');
assert.equal(Bus.notify('agent.completed', { taskMs: 4000 }), 'played');
Bus.resetForTest();
assert.equal(Bus.notify('agent.completed'), 'played'); // Rust-gated path: no taskMs

resetSounds();
assert.equal(Bus.notify('agent.failed'), 'played');
assert.equal(Bus.notify('agent.completed', { taskMs: 5000 }), 'suppressed_priority');

resetSounds();
Bus.notify('agent.needs_input');
assert.equal(Bus.notify('agent.completed', { taskMs: 5000 }), 'suppressed_priority');

resetSounds();
assert.equal(Bus.notify('pad.dispatch_failed'), 'played');
sandbox.__agentSeen = true;
assert.equal(Bus.notify('pad.dispatch_failed'), 'suppressed_duplicate'); // same dedupe window
Bus.resetForTest();
assert.equal(Bus.notify('pad.dispatch_failed'), 'played'); // always ignores agent seen

resetSounds({
  categories: {
    ...Bus.CATEGORY_DEFAULTS,
    needAttention: { policy: 'never', id: 'input-ready-soft' },
  },
});
assert.equal(Bus.notify('agent.needs_input'), 'suppressed_disabled');

assert.equal(Bus.handleRuntimeCue('send_fail'), 'played');
assert.equal(lastResult().eventId, 'voice.send_failed');

console.log('L2 bus matrix ok');
console.log('test-sound-bus: ok');
