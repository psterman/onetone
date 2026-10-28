/**
 * Home assist ownership — snapshot, draft body send source, stale guards.
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

const ownSrc = read('src/js/features/now/home-assist-ownership.js');
const prepSrc = read('src/js/features/now/home-prompt-prep.js');
const indexHtml = read('src/index.html');
assert.match(indexHtml, /home-assist-ownership\.js/);
assert.match(indexHtml, /home-assist-ownership\.js[\s\S]*home-prompt-prep\.js/);

const ctx = {
  console,
  localStorage: {
    _m: {},
    getItem(k) {
      return this._m[k] || null;
    },
    setItem(k, v) {
      this._m[k] = String(v);
    },
    removeItem(k) {
      delete this._m[k];
    }
  },
  Date,
  Math,
  JSON,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(ownSrc, ctx);
vm.runInNewContext(prepSrc, ctx);
const Own = ctx.OneToneHomeAssistOwnership;
const Prep = ctx.OneToneHomePromptPrep;
assert.ok(Own && Prep);

// --- citeMode snapshot ---
Prep._setModel({
  phase: 'COLLECTING',
  collectionId: 'c1',
  materials: [
    {
      id: 'm_full',
      name: 'a.txt',
      included: true,
      citeMode: 'full',
      content: 'FULL_BODY'
    },
    {
      id: 'm_sum',
      name: 'b.txt',
      included: true,
      citeMode: 'summary',
      content: 'x'.repeat(500),
      userSummary: 'SUM_ONLY'
    },
    {
      id: 'm_skip',
      name: 'c.txt',
      included: true,
      citeMode: 'skip',
      content: 'SECRET'
    },
    {
      id: 'm_off',
      name: 'd.txt',
      included: false,
      citeMode: 'full',
      content: 'OFF'
    },
    {
      id: 'm_path',
      name: 'e.txt',
      included: true,
      citeMode: 'pathOnly',
      path: 'E:/repo/e.txt',
      content: 'SHOULD_NOT'
    }
  ],
  draft: { title: 't', body: 'draft-body' },
  contentRevision: 1
});

const snapDefault = Prep.buildAssistInputSnapshot();
assert.equal(snapDefault.sendScope, 'included_materials');
const ids = snapDefault.materials.map((m) => m.id);
assert.equal(ids.length, 3);
assert.ok(ids.includes('m_full') && ids.includes('m_sum') && ids.includes('m_path'));
assert.equal(snapDefault.materials.find((m) => m.id === 'm_full').content, 'FULL_BODY');
assert.equal(snapDefault.materials.find((m) => m.id === 'm_sum').content, 'SUM_ONLY');
assert.equal(snapDefault.materials.find((m) => m.id === 'm_path').content, null);
assert.equal(snapDefault.materials.find((m) => m.id === 'm_path').path, null);
assert.ok(!ids.includes('m_skip'));
assert.ok(!ids.includes('m_off'));

const snapPaths = Prep.buildAssistInputSnapshot({ sendScope: 'included_materials_and_paths' });
assert.ok(snapPaths.materials.some((m) => m.id === 'm_path' && m.path === 'E:/repo/e.txt'));
assert.equal(snapPaths.materials.find((m) => m.id === 'm_path').content, null);

const snapDraft = Prep.buildAssistInputSnapshot({ sendScope: 'draft_only' });
assert.equal(snapDraft.materials.length, 0);
assert.equal(snapDraft.draft.body, 'draft-body');

// --- organize → edit body → send uses edited text ---
const begun = Prep.beginAssistOrganize({ allowMetered: true });
assert.equal(begun.ok, true);
assert.ok(begun.snapshot.materials.every((m) => m.id !== 'm_skip'));

const adopted = Prep.adoptAssistResult({
  ok: true,
  requestId: begun.requestId,
  result: {
    goal: 'Fix bug',
    facts: [{ text: 'error X', kind: 'evidence', sourceIds: ['m_full'] }],
    constraints: [{ text: 'no rewrite', kind: 'user_requirement', sourceIds: [] }],
    steps: [{ text: 'reproduce', kind: 'suggestion', sourceIds: [] }],
    acceptanceCriteria: [{ text: 'tests pass', kind: 'suggestion', sourceIds: [] }],
    unknowns: [{ text: 'which branch', kind: 'unknown', sourceIds: [] }]
  }
});
assert.equal(adopted.adopted, true);
assert.equal(Prep._model().activeDraft, 'organized');
assert.match(Prep._model().organizedDraft.body, /Fix bug/);

Prep.setOrganizedBody('USER_EDITED_SEND_BODY\nplease use this', { skipSync: true });
assert.equal(Prep._model().organizedDraft.structuredOutdated, true);
assert.equal(Prep._model().organizedDraft.source, 'user_edited_organized');

const send = Prep.buildSendBody({ attachEvidence: false });
assert.match(send.body, /USER_EDITED_SEND_BODY/);
assert.doesNotMatch(send.body, /please first/i); // not re-rendered from structured
assert.equal(send.source, 'user_edited_organized');
assert.ok(send.snapshotId);
assert.equal(Prep._model().lastSendSnapshotId, send.snapshotId);

// rawDraft untouched
assert.equal(Prep._model().rawDraft.body, 'draft-body');
Prep.restoreRawDraft();
assert.equal(Prep._model().activeDraft, 'raw');
const sendRaw = Prep.buildSendBody({ attachEvidence: false });
assert.equal(sendRaw.body, 'draft-body');

// --- uncheck material → not in new snapshot; old send snapshot was frozen ---
Prep.setActiveDraft('organized');
Prep.updateMaterialFlags('m_full', { included: false });
const afterUncheck = Prep.buildAssistInputSnapshot();
assert.ok(!afterUncheck.materials.some((m) => m.id === 'm_full'));
assert.equal(Prep._model().organizedDraft.stale, true);

// --- stale adopt discarded ---
const b2 = Prep.beginAssistOrganize({});
const modelBefore = Prep._model();
modelBefore.contentRevision += 1; // materials changed while in flight
Prep._setModel(modelBefore);
const stale = Prep.adoptAssistResult({
  ok: true,
  requestId: b2.requestId,
  result: { goal: 'SHOULD_NOT', facts: [], constraints: [], steps: [], acceptanceCriteria: [], unknowns: [] }
});
assert.equal(stale.adopted, false);
assert.equal(stale.reason, 'stale');
assert.doesNotMatch(String(Prep._model().organizedDraft.body || ''), /SHOULD_NOT/);

// --- editGeneration blocks overwrite ---
Prep._setModel({
  phase: 'COLLECTING',
  collectionId: 'c2',
  materials: [{ id: 'm1', name: 'n', included: true, citeMode: 'full', content: 'c' }],
  draft: { title: '', body: 'b' },
  contentRevision: 0
});
const b3 = Prep.beginAssistOrganize({});
Prep.setOrganizedBody('manual while running', { skipSync: true });
const blocked = Prep.adoptAssistResult({
  ok: true,
  requestId: b3.requestId,
  result: { goal: 'OVERWRITE', facts: [], constraints: [], steps: [], acceptanceCriteria: [], unknowns: [] }
});
assert.equal(blocked.adopted, false);
assert.match(Prep._model().organizedDraft.body, /manual while running/);

// formatFailureNotice must never be bare「整理失败」
const clientSrc = read('src/js/features/now/home-assist-client.js');
assert.match(clientSrc, /formatFailureNotice/);
assert.match(clientSrc, /允许计量额度/);
assert.doesNotMatch(
  clientSrc.replace(/\/\/.*$/gm, ''),
  /return map\[r\] \|\| reason \|\| '整理失败'/
);
vm.runInNewContext(clientSrc, ctx);
const Client = ctx.OneToneHomeAssistClient;
assert.ok(Client.formatFailureNotice);
const msg = Client.formatFailureNotice('no_free_model');
assert.match(msg, /零价模型/);
assert.match(msg, /允许计量|直接发送/);
assert.doesNotMatch(msg, /^整理失败$/);

console.log('test-home-assist-ownership: ok');
// Prep registers tray drain intervals on load — force exit.
process.exit(0);
