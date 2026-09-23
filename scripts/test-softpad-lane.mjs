// Soft Pad displayLane + Runtime Arbiter (pin > waiting > fg); FE oracle retained for tests.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const sandbox = {
  console,
  window: null,
  globalThis: null,
  document: {
    getElementById() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  },
  setTimeout,
  clearTimeout,
  performance: { now: () => Date.now() },
  Promise,
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.OneToneI18n = { t: (k, fb) => fb || k };
sandbox.OneToneState = {
  state: { config: { mappings: [] }, selectedMappingId: null },
  ui: {},
};
sandbox.OneToneIpc = { invoke: () => Promise.resolve({}) };
sandbox.__vp_invoke__ = sandbox.OneToneIpc.invoke;

vm.runInNewContext(
  readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8'),
  sandbox,
  { filename: 'soft-pad-hub-ui.js' }
);

const Hub = sandbox.OneToneSoftPadHub;
assert.ok(Hub && typeof Hub.resolvePrimaryLaneResult === 'function');
assert.ok(typeof Hub.ingestSoftPadRuntimeSnapshot === 'function');

function entry(kind, padEnabled) {
  return {
    kind,
    padEnabled: !!padEnabled,
    appId: kind === 'claude' ? 'claude-code' : 'codex-chat',
    title: kind,
    mapping: { id: 'm-' + kind, appTargetId: kind === 'claude' ? 'claude-code' : 'codex-chat' },
  };
}

const codexOn = entry('codex', true);
const claudeOn = entry('claude', true);
const cursorOn = {
  kind: 'cursor',
  padEnabled: true,
  appId: 'cursor-chat',
  title: 'cursor',
  mapping: { id: 'm-cursor', appTargetId: 'cursor-chat' },
};

function assertResult(entries, ctx, expectKind, expectReason) {
  const r = Hub.resolvePrimaryLaneResult(entries, ctx);
  assert.equal(Hub.resolvePrimaryLane(entries, ctx), r.entry);
  if (expectKind == null) {
    assert.equal(r.entry, null);
    assert.equal(r.reason, 'none');
  } else {
    assert.equal(r.entry.kind, expectKind);
    assert.equal(r.reason, expectReason);
  }
}

// Auto: waiting still wins when FG is that waiting agent
assertResult([codexOn, claudeOn], {
  foregroundAppId: 'codex-chat',
  waitingKinds: ['codex'],
}, 'codex', 'waiting');

assertResult([codexOn, claudeOn], {
  waitingKinds: ['claude'],
}, 'claude', 'waiting');

assertResult([codexOn, claudeOn], {
  foregroundAppId: 'claude-code',
}, 'claude', 'foreground');

// Intentional Soft Pad FG (open Cursor) beats another agent's waiting
assertResult([claudeOn, cursorOn], {
  foregroundAppId: 'cursor-chat',
  waitingKinds: ['claude'],
}, 'cursor', 'foreground');

const universalOn = {
  kind: 'universal',
  padEnabled: false,
  appId: '',
  title: '通用',
  mapping: { id: 'm-base', appTargetId: '' },
};
const chromeOn = {
  kind: 'soft',
  padEnabled: true,
  appId: 'chrome',
  title: 'Chrome',
  mapping: { id: 'm-chrome', appTargetId: 'chrome' },
};

assertResult([cursorOn, universalOn], {
  foreignHost: true,
  waitingKinds: ['cursor'],
}, 'universal', 'foreground');

assertResult([cursorOn, universalOn, chromeOn], {
  foreignHost: true,
  foregroundAppId: 'chrome',
}, 'soft', 'foreground');

assertResult([cursorOn], {
  foreignHost: true,
  waitingKinds: ['cursor'],
}, null, 'none');

assertResult([], {}, null, 'none');

// FE revision guard
assert.equal(Hub.ingestSoftPadRuntimeSnapshot({
  decisionRevision: 12,
  statusRevision: 1,
  cutover: true,
  health: 'ready',
  applied: { revision: 12, laneKind: 'claude', reason: 'foreground', mappingId: 'm1' },
}), true);
assert.equal(Hub.ingestSoftPadRuntimeSnapshot({
  decisionRevision: 11,
  statusRevision: 9,
  cutover: true,
  health: 'ready',
  applied: { revision: 11, laneKind: 'codex', reason: 'fallback', mappingId: 'm0' },
}), false, 'stale decisionRevision ignored');
assert.equal(Hub.getCachedSoftPadRuntime().snap.applied.laneKind, 'claude');

const hubSrc = readFileSync(join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
assert.match(hubSrc, /function followForegroundOnce/);
assert.match(hubSrc, /cmd_habit_foreground_app/);
assert.match(hubSrc, /refreshSoftPadEditChrome/);
assert.match(hubSrc, /SOFT_PAD_UNIVERSAL_KIND/);
// Open Soft Pad must follow FG even when first paint is need-agent /「通用」.
assert.match(hubSrc, /need-agent[\s\S]*?ensureForegroundFollow\(\)/);
assert.match(hubSrc, /Universal Soft Pad mapping is the open-page default/);
assert.match(hubSrc, /fromForeground: !!opts\.fromForeground/);

// resolveSoftPadEntry: universal Soft Pad mapping must not hide FG agent Soft Pad.
sandbox.OneToneHabitOverrideDiff = {
  findGlobalBaselineMapping: function (cfg) {
    var maps = (cfg && cfg.mappings) || [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && maps[i].id === 'm-base') return maps[i];
    }
    return null;
  },
};
sandbox.OneToneState.state.config.mappings = [
  {
    id: 'm-base',
    group: '通用设置',
    appTargetId: '',
    enabled: true,
    codexMicroPad: { enabled: true, overlayEnabled: true, keys: {} },
  },
  {
    id: 'm-cursor',
    appTargetId: 'cursor-chat',
    agentTemplateId: 'cursor',
    softPadKind: 'cursor',
    enabled: true,
    codexMicroPad: { enabled: true, overlayEnabled: true, keys: { a: {} } },
  },
];
sandbox.OneToneState.state.selectedMappingId = 'm-base';
Hub.noteLaneForeground('cursor-chat');
assert.equal(Hub.resolveSoftPadEntry().kind, 'cursor', 'FG Cursor beats sticky universal Soft Pad');
sandbox.OneToneState.state.selectedMappingId = 'm-cursor';
assert.equal(Hub.resolveSoftPadEntry().kind, 'cursor', 'concrete Cursor Soft Pad still resolves');
const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
assert.match(panels, /softPadSnapshotFromApplied|getCachedSoftPadRuntime/);
assert.match(panels, /homeWbSoftPadControlConfirming|正在确认当前控制/);

const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
assert.match(i18n, /homeWbSoftPadCurrentControl:'当前控制：\{name\}'/);
assert.match(i18n, /homeWbSoftPadConfirming:/);

const contract = readFileSync(join(root, 'docs/HABIT_UNIFIED_CONTRACT.md'), 'utf8');
assert.match(contract, /AppliedDecision/);
assert.match(contract, /request_soft_pad_recompute/);

const migration = readFileSync(join(root, 'docs/SOFT_PAD_ARBITER_MIGRATION.md'), 'utf8');
assert.match(migration, /sync_hook_cache/);

console.log('ok softpad-lane');
