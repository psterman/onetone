/**
 * P1 gate: deferred voice boot must IPC-activate when no engine is healthy.
 * Static + mocked runtime (no full Tauri). Fail if cold-start skip returns without invoke.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sessionSrc = readFileSync(join(root, 'src/js/core/app-session.js'), 'utf8');
const bootstrapSrc = readFileSync(join(root, 'src-tauri/src/voice_bootstrap.rs'), 'utf8');

assert.ok(
  /deferred_model_load|deferred model load/.test(bootstrapSrc),
  'Rust bootstrap must defer model load'
);
assert.ok(
  !/activate_desired_engine\(app, state, "bootstrap"\)/.test(bootstrapSrc),
  'Rust bootstrap must not activate_desired_engine(..., "bootstrap")'
);
assert.ok(
  /cmd_voice_set_listening_strategy/.test(sessionSrc),
  'FE deferred boot must invoke cmd_voice_set_listening_strategy'
);
assert.ok(
  /welcomeOpen\(\)\|\|hooks\(\)\.onboardIsOpen\(\)/.test(sessionSrc) &&
    /scheduleDeferredVoiceEngineBoot\(\)/.test(sessionSrc),
  'FE must keep retrying deferred boot while welcome/onboard is open'
);

// --- mocked enable-listen path ---
const invokes = [];
const hooks = {
  welcomeOpen: () => false,
  onboardIsOpen: () => false,
  state: () => ({ config: { voiceListeningStrategy: 'auto' } }),
  voiceUiSnapshot: { wake: null },
  renderVoiceVoskStatus: () => {},
  renderVoiceSapiStatus: () => {},
  renderVoiceKwsStatus: () => {},
  syncHomeFromVoiceSettings: () => {},
  renderHomeLiveZone: () => {},
  vpInvoke: (cmd, args) => globalThis.OneToneIpc.invoke(cmd, args),
};

const sandbox = {
  console,
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: () => {},
  requestIdleCallback: undefined,
  __vp_app_session_hooks__: hooks,
  OneToneConfigPersist: { isLoaded: () => true },
  OneToneIpc: {
    invoke: (cmd, args) => {
      invokes.push({ cmd, args });
      if (cmd === 'cmd_voice_set_listening_strategy') {
        return Promise.resolve({
          voiceVosk: { enabled: true, state: 'starting' },
          voiceKws: { enabled: false, state: 'stopped' },
          voiceSapi: { enabled: false, state: 'stopped' },
        });
      }
      return Promise.resolve(null);
    },
  },
  OneToneUiHeartbeat: { setTag: () => {}, clearTag: () => {} },
  global: null,
};
sandbox.global = sandbox;

vm.runInNewContext(sessionSrc + '\n;this.__session = this.OneToneAppSession;', sandbox);
const session = sandbox.__session || sandbox.OneToneAppSession;
assert.ok(session && typeof session.scheduleDeferredVoiceEngineBoot === 'function');

session.setVoiceEngineBootDone(false);
session.clearVoiceEngineBootTimer();
session.markBootSettled();
session.scheduleDeferredVoiceEngineBoot();

await new Promise((r) => setTimeout(r, 50));
// The real timer is 10s — force by patching: re-read uses setTimeout 10000.
// Drive the timer callback by advancing: re-exec with short timer injection.
assert.ok(true, 'session module loads');

// Force-fire path: evaluate the strategy invoke contract with a shortened copy.
const shortSrc = sessionSrc.replace(',10000)', ',0)');
const sandbox2 = {
  ...sandbox,
  invokes: [],
  setTimeout: (fn, ms) => {
    if (typeof fn === 'function') fn();
    return 0;
  },
  clearTimeout: () => {},
  __vp_app_session_hooks__: hooks,
  OneToneConfigPersist: { isLoaded: () => true },
  OneToneIpc: {
    invoke: (cmd, args) => {
      sandbox2.invokes.push({ cmd, args });
      return Promise.resolve({
        voiceVosk: { enabled: true, state: 'listening' },
        voiceKws: { enabled: false, state: 'stopped' },
        voiceSapi: { enabled: false, state: 'stopped' },
      });
    },
  },
  OneToneUiHeartbeat: { setTag: () => {}, clearTag: () => {} },
};
sandbox2.global = sandbox2;
vm.runInNewContext(shortSrc + '\n;this.__session = this.OneToneAppSession;', sandbox2);
const s2 = sandbox2.__session || sandbox2.OneToneAppSession;
s2.setVoiceEngineBootDone(false);
s2.clearVoiceEngineBootTimer();
s2.markBootSettled();
s2.scheduleDeferredVoiceEngineBoot();
await new Promise((r) => setTimeout(r, 30));

const strategyInvoke = sandbox2.invokes.find((x) => x.cmd === 'cmd_voice_set_listening_strategy');
assert.ok(strategyInvoke, 'enable-listen deferred boot must call cmd_voice_set_listening_strategy');
assert.equal(strategyInvoke.args.strategy, 'auto');

console.log('ok: deferred bootstrap + enable-listen IPC path');
