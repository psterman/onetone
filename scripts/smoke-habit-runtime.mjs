/**
 * Smoke: OneToneHabitRuntime facade + calculate/reconcile split.
 * Run: npm run test:habit-runtime
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sceneDir = path.join(root, 'src/js/features/scene');

let persistCount = 0;
const activateCalls = [];
const softOverrideCalls = [];

const config = {
  activeSceneId: 'habit-a',
  followForegroundAppScenario: false,
  mappings: [
    { id: 'habit-a', group: '工作', saved: true },
    { id: 'habit-b', group: '专注', saved: true },
    { id: 'habit-c', group: '休息', saved: true }
  ],
  runtimeHabitControl: { softOverride: null, pin: null }
};

const mappingsById = Object.fromEntries(config.mappings.map((m) => [m.id, m]));

const ctx = {
  window: {},
  globalThis: null,
  OneToneState: { state: { config } },
  OneToneConfigPersist: {
    saveAsync() {
      persistCount += 1;
    },
    save() {
      persistCount += 1;
    }
  },
  OneToneMappingCore: {
    byId(id) {
      return mappingsById[id] || null;
    },
    isSaved(m) {
      return !!(m && m.saved);
    }
  },
  OneToneHabitProfile: {
    habitDisplayName(m) {
      return m ? String(m.group || m.id) : '';
    },
    isLibraryHabit(m) {
      return !!(m && m.saved);
    }
  },
  OneToneI18n: {
    t(key) {
      return key;
    }
  },
  OneToneAppToast: { show() {} },
  requestAnimationFrame(fn) {
    fn();
  },
  chrome: undefined
};
ctx.globalThis = ctx;
ctx.window = ctx;

for (const f of ['runtime-habit-control.js', 'scene-activate.js', 'habit-runtime.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(sceneDir, f), 'utf8'), ctx);
}

const rt = ctx.OneToneRuntimeHabitControl;
const hr = ctx.OneToneHabitRuntime;
const act = ctx.OneToneSceneActivate;

const origActivate = act.activateScene.bind(act);
act.activateScene = function (id, opts) {
  activateCalls.push({ id, opts });
  return origActivate(id, opts);
};
const origSoft = rt.setSoftOverride.bind(rt);
rt.setSoftOverride = function (id, identity, opts) {
  softOverrideCalls.push({ id, identity });
  return origSoft(id, identity, opts);
};

function assertShape(snap, label) {
  if (!snap || typeof snap !== 'object') throw new Error(label + ': missing snapshot');
  for (const k of ['current', 'control', 'source', 'hasHabits']) {
    if (!(k in snap)) throw new Error(label + ': missing ' + k);
  }
  for (const k of ['id', 'name', 'mode', 'badge', 'tooltip', 'canClearPin', 'canClearOverride']) {
    if (!(k in snap.current)) throw new Error(label + ': current.' + k);
  }
  for (const k of ['canClearPin', 'canClearOverride', 'staleOverride']) {
    if (!(k in snap.control)) throw new Error(label + ': control.' + k);
  }
  for (const k of ['pin', 'override', 'foreground', 'manual']) {
    if (!(k in snap.source)) throw new Error(label + ': source.' + k);
  }
  if (typeof snap.hasHabits !== 'boolean') throw new Error(label + ': hasHabits');
}

function resetRuntime() {
  config.activeSceneId = 'habit-a';
  config.followForegroundAppScenario = false;
  config.runtimeHabitControl = { softOverride: null, pin: null };
  persistCount = 0;
  activateCalls.length = 0;
  softOverrideCalls.length = 0;
  hr._resetForTests();
  rt.noteForegroundIdentity({
    fullPath: 'C:\\Apps\\Foo.exe',
    windowClass: 'FooClass',
    exeName: 'Foo.exe',
    matchedPresetAppId: 'app-foo'
  });
}

// --- 1. getSnapshot shape in 4 modes ---
resetRuntime();
assertShape(hr.getSnapshot(), 'manual');
if (hr.getSnapshot().current.mode !== 'manual') throw new Error('expected manual mode');

resetRuntime();
rt.setPinHabit('habit-b', { skipPersist: true });
assertShape(hr.getSnapshot(), 'pinHabit');
if (hr.getSnapshot().current.mode !== 'pinHabit') throw new Error('expected pinHabit');
if (!hr.getSnapshot().source.pin) throw new Error('source.pin');

resetRuntime();
rt.setPinAppHabit('app-foo', 'habit-c', { skipPersist: true });
assertShape(hr.getSnapshot(), 'pinAppHabit');
if (hr.getSnapshot().current.mode !== 'pinAppHabit') throw new Error('expected pinAppHabit');

resetRuntime();
rt.setSoftOverride('habit-b', rt.foregroundIdentity(), { skipPersist: true });
assertShape(hr.getSnapshot(), 'softOverride');
if (hr.getSnapshot().current.mode !== 'softOverride') throw new Error('expected softOverride');
if (!hr.getSnapshot().source.override) throw new Error('source.override');

// --- 2. pin without confirm → requiresConfirm, no activate ---
resetRuntime();
rt.setPinHabit('habit-a', { skipPersist: true });
activateCalls.length = 0;
const blocked = hr.switch('habit-b', { source: 'manual' });
if (!blocked.requiresConfirm || blocked.ok) throw new Error('expected requiresConfirm');
if (activateCalls.length !== 0) throw new Error('activate must not run when pin blocks');

// --- 3. confirm clears pin then activates ---
resetRuntime();
rt.setPinHabit('habit-a', { skipPersist: true });
activateCalls.length = 0;
const confirmed = hr.switch('habit-b', { source: 'manual', confirm: true });
if (!confirmed.ok) throw new Error('confirm switch failed');
if (rt.getPin()) throw new Error('pin should be cleared');
if (activateCalls.length !== 1 || activateCalls[0].id !== 'habit-b') {
  throw new Error('expected one activate to habit-b');
}

// --- 4. mode override → setSoftOverride only, no activeSceneId change ---
resetRuntime();
config.activeSceneId = 'habit-a';
softOverrideCalls.length = 0;
activateCalls.length = 0;
const ov = hr.switch('habit-b', { source: 'manual', mode: 'override' });
if (!ov.ok) throw new Error('override switch failed');
if (softOverrideCalls.length !== 1) throw new Error('expected setSoftOverride');
if (config.activeSceneId !== 'habit-a') throw new Error('override must not flip activeSceneId');
if (activateCalls.length !== 0) throw new Error('override must not activateScene');

// --- 5. calculate twice → persist 0 ---
resetRuntime();
config.runtimeHabitControl.softOverride = {
  mappingId: 'habit-b',
  fgSignature: 'stale\0sig'
};
persistCount = 0;
rt.calculateEffectiveScene(rt.foregroundIdentity());
rt.calculateEffectiveScene(rt.foregroundIdentity());
if (persistCount !== 0) throw new Error('calculate must not persist, got ' + persistCount);
if (!rt.calculateEffectiveScene(rt.foregroundIdentity()).staleOverride) {
  throw new Error('expected staleOverride');
}

// --- 6. reconcile stale → persist 1 ---
persistCount = 0;
const rec = rt.reconcileRuntimeHabitState({});
if (!rec.cleared) throw new Error('expected clear');
if (persistCount !== 1) throw new Error('reconcile persist once, got ' + persistCount);

// --- 7. subscribe on switch success ---
resetRuntime();
let changeCount = 0;
let lastPayload = null;
hr.subscribe('change', (p) => {
  changeCount += 1;
  lastPayload = p;
});
hr.switch('habit-b', { source: 'manual', allowForegroundFollow: true });
if (changeCount !== 1) throw new Error('subscribe expected 1, got ' + changeCount);
if (!lastPayload || !('previous' in lastPayload) || !('current' in lastPayload)) {
  throw new Error('payload missing previous/current');
}

// --- bonus: requiresChoice when follow on ---
resetRuntime();
config.followForegroundAppScenario = true;
const choice = hr.switch('habit-b', { source: 'home_quick_switch' });
if (!choice.requiresChoice || choice.ok) throw new Error('expected requiresChoice');
if (!Array.isArray(choice.choices) || choice.choices.length !== 3) {
  throw new Error('choices must list override/pin/disable_follow');
}

// --- bonus: home_quick_switch source passthrough ---
resetRuntime();
activateCalls.length = 0;
hr.switch('habit-b', { source: 'home_quick_switch', allowForegroundFollow: true });
if (activateCalls[0].opts.source !== 'home_quick_switch') {
  throw new Error('home_quick_switch must pass through normalizeSource');
}

console.log('smoke-habit-runtime: ok');
