// Guard: bare custom stubs are not habits and must not survive prune / remember filters.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const sandbox = {
  console,
  globalThis: null,
  window: null,
  performance: { now: () => Date.now() },
  document: {
    getElementById(){ return null; },
    querySelector(){ return null; },
    querySelectorAll(){ return []; },
  },
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
sandbox.OneToneI18n = { t: (k) => k };
sandbox.OneToneState = {
  state: {
    config: {
      mappings: [
        { id: 'base', enabled: true, triggerKey: 'F8', targetKey: 'RAlt' },
        { id: 'stub', enabled: true, appTargetId: 'custom', appBehaviorRules: [], triggerKey: '', targetKey: '' },
        {
          id: 'real',
          enabled: true,
          appTargetId: 'custom',
          appBehaviorRules: [{ appId: 'custom', match: { exeNames: ['notepad.exe'] } }],
        },
      ],
      activeSceneId: 'stub',
    },
    selectedMappingId: 'stub',
  },
  ui: {},
};
sandbox.OneToneMappingCore = {
  byId(id) {
    return sandbox.OneToneState.state.config.mappings.find((m) => m && m.id === id) || null;
  },
  sorted() {
    return sandbox.OneToneState.state.config.mappings.slice();
  },
};
sandbox.OneToneHabitOverrideDiff = {
  findGlobalBaselineMapping(cfg) {
    return (cfg.mappings || []).find((m) => m && m.id === 'base') || null;
  },
  isAppScenarioMapping(m) {
    return !!(m && String(m.appTargetId || '').trim());
  },
};
let forgot = [];
sandbox.OneToneConfigPersist = {
  save() {},
  forgetAppScenarioIds(ids) {
    forgot = ids.slice();
  },
};

const code = readFileSync(join(root, 'src/js/features/mapping/app-behavior-rules.js'), 'utf8');
// Load only needs the IIFE; many helpers touch DOM — stub enough for stub helpers.
vm.runInNewContext(code, sandbox, { filename: 'app-behavior-rules.js' });

const Api = sandbox.OneToneAppBehaviorRules;
assert.ok(Api && typeof Api.isIncompleteCustomStub === 'function', 'export isIncompleteCustomStub');
assert.equal(Api.isIncompleteCustomStub(sandbox.OneToneState.state.config.mappings[1]), true);
assert.equal(Api.isIncompleteCustomStub(sandbox.OneToneState.state.config.mappings[2]), false);

assert.equal(Api.pruneIncompleteCustomStubs({ persist: false }), true);
const ids = sandbox.OneToneState.state.config.mappings.map((m) => m.id);
assert.deepEqual(ids, ['base', 'real']);
assert.equal(sandbox.OneToneState.state.config.activeSceneId, 'base');
assert.equal(sandbox.OneToneState.state.selectedMappingId, 'base');
assert.ok(forgot.indexOf('stub') >= 0, 'forgot stub from backup');
const trash = sandbox.OneToneState.state.config.trash || [];
assert.ok(trash.some((m) => m && m.id === 'stub'), 'stub must enter trash so Rust merge allows delete');

console.log('test-incomplete-custom-stub.mjs: ok');
