/**
 * Phase2 home project context — exact excerpts, candidates vs outbound, cross-scope guard.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

assert.match(read('src/index.html'), /home-project-context\.js/);

const store = { 'onetone.projectContext.enabled': '1' };
const ctx = {
  console,
  localStorage: {
    getItem(k) {
      return store[k] != null ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    }
  },
  Date,
  Math,
  JSON,
  Promise,
  document: {
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return { style: {}, addEventListener() {}, appendChild() {}, setAttribute() {} };
    },
    addEventListener() {},
    removeEventListener() {}
  },
  OneToneIpc: {
    invoke() {
      return Promise.reject(new Error('no desktop in unit test'));
    }
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(read('src/js/features/now/home-assist-ownership.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-prompt-prep.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-project-context.js'), ctx);

const Prep = ctx.OneToneHomePromptPrep;
const Own = ctx.OneToneHomeAssistOwnership;
const Pcx = ctx.OneToneHomeProjectContext;
assert.ok(Prep && Own && Pcx);
assert.equal(Pcx.featureEnabled(), true);
assert.match(Pcx.reasonMessage('excluded'), /隐私/);

// Exact excerpt > 400 chars preserved for engineering evidence
const longBody = Array.from({ length: 60 }, (_, i) => `// line ${101 + i} ${'x'.repeat(12)}`).join(
  '\n'
);
assert.ok(longBody.length > 400);
Prep._setModel({
  phase: 'COLLECTING',
  collectionId: 'c_pcx',
  taskScopeId: 'ts_a',
  materials: [],
  rawDraft: { title: '', body: 'draft body keep me' },
  draft: { title: '', body: 'draft body keep me' },
  organizedDraft: { body: '', structured: null, editGeneration: 0 },
  activeDraft: 'raw',
  assist: { state: 'idle', requestId: null },
  contentRevision: 0,
  sendScope: 'included_materials'
});

Pcx._setActiveScopeForTest({
  scopeId: 'pcs_a',
  taskScopeId: 'ts_a',
  displayName: 'demo'
});

// Candidate preview must NOT enter outbound until adopt
Pcx._pushCandidatesForTest([
  {
    evidenceId: 'ev1',
    scopeId: 'pcs_a',
    taskScopeId: 'ts_a',
    kind: 'file_excerpt',
    label: 'big.rs:101-160',
    displayPath: 'big.rs',
    sourceRef: 'big.rs:101-160',
    content: longBody,
    sourceVersion: 'abc',
    freshness: 'captured'
  }
]);
let snap = Prep.buildAssistInputSnapshot();
assert.equal(snap.materials.length, 0);

const adopted = Pcx.adoptEvidence({
  id: 'ev1',
  scopeId: 'pcs_a',
  taskScopeId: 'ts_a',
  kind: 'file_excerpt',
  label: 'big.rs:101-160',
  displayPath: 'big.rs',
  sourceRef: 'big.rs:101-160',
  content: longBody,
  sourceVersion: 'abc',
  freshness: 'captured',
  range: { startLine: 101, endLine: 160 }
});
assert.ok(adopted);
assert.equal(adopted.excerptText.length, longBody.length);
snap = Prep.buildAssistInputSnapshot();
assert.equal(snap.materials.length, 1);
assert.equal(snap.materials[0].content.length, longBody.length);
assert.ok(!JSON.stringify(snap).includes('C:\\'));
assert.ok(!JSON.stringify(snap).includes('absolutePath'));

// Uncheck → not outbound
Prep.updateMaterialFlags(adopted.id, { included: false });
snap = Prep.buildAssistInputSnapshot();
assert.equal(snap.materials.length, 0);

// Late response from project B cannot adopt into A
Pcx._setActiveScopeForTest({
  scopeId: 'pcs_a',
  taskScopeId: 'ts_a',
  displayName: 'demo'
});
const rejected = Pcx.adoptEvidence({
  id: 'ev_b',
  scopeId: 'pcs_b',
  taskScopeId: 'ts_b',
  kind: 'file_excerpt',
  label: 'other',
  content: 'nope',
  freshness: 'captured'
});
assert.equal(rejected, null);

// refreshEvidenceMaterial keeps citeMode / does not wipe raw draft body
Prep.updateMaterialFlags(adopted.id, { included: true, citeMode: 'excerpt' });
const beforeBody = Prep._model().rawDraft.body;
Prep.refreshEvidenceMaterial(adopted.id, {
  id: 'ev1',
  scopeId: 'pcs_a',
  kind: 'file_excerpt',
  label: 'big.rs:101-160',
  displayPath: 'big.rs',
  sourceRef: 'big.rs:101-160',
  content: longBody + '\n// refreshed',
  sourceVersion: 'def',
  freshness: 'fresh',
  excerptText: longBody + '\n// refreshed'
});
assert.equal(Prep._model().rawDraft.body, beforeBody);
const refreshed = Prep._model().materials.find((m) => m.id === adopted.id);
assert.ok(refreshed.content.includes('refreshed'));
assert.equal(refreshed.citeMode, 'excerpt');

// stale_user_confirmed
const stale = Pcx.markStaleUserConfirmed(adopted.id);
assert.equal(stale.freshness, 'stale_user_confirmed');
snap = Prep.buildAssistInputSnapshot();
assert.equal(snap.materials[0].freshness, 'stale_user_confirmed');

console.log('test-home-project-context: ok');
