// Soft Pad primary lane: only padEnabled; waiting > fg > user > first; empty → null.
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
assert.ok(Hub && typeof Hub.resolvePrimaryLane === 'function', 'export resolvePrimaryLane');
assert.ok(typeof Hub.laneContextFromRuntime === 'function', 'export laneContextFromRuntime');
assert.ok(typeof Hub.pickHubDefaultScopeId === 'function', 'export pickHubDefaultScopeId');
assert.ok(typeof Hub.noteLaneForeground === 'function', 'export noteLaneForeground');

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
const codexOff = entry('codex', false);
const claudeOff = entry('claude', false);

assert.equal(Hub.resolvePrimaryLane([], {}), null);
assert.equal(Hub.resolvePrimaryLane([codexOff, claudeOff], { waitingKinds: ['codex'] }), null);
assert.equal(
  Hub.resolvePrimaryLane([codexOff, claudeOn], { waitingKinds: ['codex'] }),
  claudeOn,
  'waiting on disabled kind must not win'
);
assert.equal(
  Hub.resolvePrimaryLane([codexOn, claudeOn], { waitingKinds: ['claude'] }),
  claudeOn
);
assert.equal(
  Hub.resolvePrimaryLane([codexOn, claudeOn], {
    waitingKinds: [],
    foregroundAppId: 'claude-code',
  }),
  claudeOn
);
assert.equal(
  Hub.resolvePrimaryLane([codexOn, claudeOn], {
    foregroundAppId: 'cursor-chat',
    userLaneId: 'claude',
  }),
  claudeOn
);
assert.equal(
  Hub.resolvePrimaryLane([codexOn, claudeOn], {}),
  codexOn,
  'first enabled in list order'
);
assert.equal(
  Hub.pickHubDefaultScopeId([codexOff, claudeOff]),
  'codex',
  'hub tab may placeholder Codex when none enabled'
);
assert.equal(Hub.resolvePrimaryLane([codexOff], { userLaneId: 'codex' }), null);

const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
const snap = panels.match(/function softPadHowToSnapshot\(\)\{[\s\S]*?\n  function /);
assert.ok(snap, 'softPadHowToSnapshot present');
assert.match(snap[0], /resolvePrimaryLane/);
assert.doesNotMatch(snap[0], /\(on\.length\s*\?\s*on\s*:\s*entries\)\s*\[\s*0\s*\]/);

const i18n = readFileSync(join(root, 'src/js/core/i18n.js'), 'utf8');
assert.match(i18n, /softPadHubEmptyDesc:'点顶栏 Claude \/ Codex/);
assert.doesNotMatch(
  i18n.match(/softPadHubEmptyDesc:'[^']+'/)?.[0] || '',
  /Cursor/
);

const contract = readFileSync(join(root, 'docs/HABIT_UNIFIED_CONTRACT.md'), 'utf8');
assert.match(contract, /resolvePrimaryLane/);
assert.match(contract, /padEnabled/);

console.log('ok softpad-lane');
