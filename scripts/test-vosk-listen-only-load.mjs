/**
 * Vosk listen-only cold load: strategy/config alone must not Model::new;
 * grammar reload is debounced; Soft Pad boot stays deferred.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const bootstrap = readFileSync(join(root, 'src-tauri/src/voice_bootstrap.rs'), 'utf8');
const voskRt = readFileSync(join(root, 'src-tauri/src/voice_vosk_runtime.rs'), 'utf8');
const libRs = readFileSync(join(root, 'src-tauri/src/lib.rs'), 'utf8');
const overlay = readFileSync(join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');

assert.match(
  bootstrap,
  /fn activate_is_listen_intent/,
  'listen-intent allowlist helper must exist'
);
assert.match(
  bootstrap,
  /fn should_defer_vosk_cold_load/,
  'vosk cold-load defer helper must exist'
);
assert.match(
  bootstrap,
  /skip activate \(await listen\)/,
  'activate must log await-listen skip before Model::new'
);
assert.match(
  bootstrap,
  /should_defer_vosk_cold_load\(desired, from, reason\)/,
  'activate_desired_engine_locked must gate Vosk cold load'
);

// Strategy / bare config must NOT be listen-intent (static allowlist shape).
const intentFn = bootstrap.match(
  /pub\(crate\) fn activate_is_listen_intent\(reason: &str\) -> bool \{[\s\S]*?\n\}/
)?.[0];
assert.ok(intentFn, 'activate_is_listen_intent body');
assert.doesNotMatch(intentFn, /"set_listening_strategy"/);
assert.doesNotMatch(intentFn, /"config change"/);
assert.doesNotMatch(intentFn, /"force:vosk_grammar_reload"/);
assert.doesNotMatch(intentFn, /vosk_retry_start/);
assert.match(intentFn, /"listen resume"/);
assert.match(intentFn, /"force:oral_arm"/);
assert.match(intentFn, /"set_voice_activation"/);

assert.match(
  bootstrap,
  /action=deferred_model_load|deferred model load/,
  'cold bootstrap must stay deferred (no Model::new on boot)'
);
assert.doesNotMatch(
  bootstrap,
  /activate_desired_engine\(app, state, "bootstrap"\)/,
  'must not reintroduce bootstrap activate'
);

assert.match(
  libRs,
  /overlay_boot_hold_active\(\)[\s\S]{0,200}bootstrap_voice_engines/,
  'Soft Pad boot_hold still precedes bootstrap_voice_engines'
);

assert.match(
  voskRt,
  /vosk_grammar_reload_should_debounce/,
  'grammar reload debounce helper'
);
assert.match(
  voskRt,
  /vosk_grammar_reload debounced/,
  'debounced path must log'
);
assert.match(
  voskRt,
  /VOSK_GRAMMAR_RELOAD_DEBOUNCE/,
  'debounce window constant'
);
assert.match(
  voskRt,
  /maybe_restart_vosk_for_grammar[\s\S]*?vosk_grammar_reload_should_debounce/,
  'maybe_restart_vosk_for_grammar must debounce before activate'
);

// Acceptance log markers operators grep in runtime-live.log / console.
assert.ok(bootstrap.includes('skip activate (await listen)'));
assert.ok(voskRt.includes('vosk_grammar_reload debounced'));
assert.ok(/deferred_model_load|deferred model load/.test(bootstrap));
assert.match(overlay, /boot_hold/, 'Soft Pad boot_hold marker for cold-start acceptance');
assert.match(
  overlay,
  /softpad_drag|follow_start_lmb/,
  'Soft Pad drag log markers for moves>0 acceptance'
);

console.log('ok vosk-listen-only-load');
