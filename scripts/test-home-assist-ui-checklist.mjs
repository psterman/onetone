/**
 * Phase1 publish checklist — simulated home UI paths (not a window screenshot).
 * Covers acceptance steps 1–8 at ownership/client layer.
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

const store = {};
let assistRunCount = 0;
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
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  OneToneIpc: {
    invoke(cmd, args) {
      if (cmd === 'cmd_assist_ready') {
        return Promise.resolve({
          skillId: 'task_organize',
          implemented: true,
          ready: false,
          reason: 'no_free_model'
        });
      }
      if (cmd === 'cmd_assist_run') {
        assistRunCount += 1;
        var runArgs = (args && args.args) || args || {};
        return Promise.resolve({
          ok: false,
          reason: 'no_free_model',
          retryable: false,
          attempts: 0,
          requestId: runArgs.requestId
        });
      }
      if (cmd === 'cmd_assist_cancel') {
        return Promise.resolve({ ok: true, state: 'cancelling' });
      }
      return Promise.reject(new Error('unexpected ' + cmd));
    }
  }
};
ctx.window = ctx;
ctx.globalThis = ctx;
vm.runInNewContext(read('src/js/features/now/home-assist-ownership.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-assist-client.js'), ctx);
vm.runInNewContext(read('src/js/features/now/home-prompt-prep.js'), ctx);

const Prep = ctx.OneToneHomePromptPrep;
const Client = ctx.OneToneHomeAssistClient;
const Own = ctx.OneToneHomeAssistOwnership;

// 1) draft + two materials
Prep.setDraftBody('fix the login crash', { skipSync: true });
Prep.addMaterial({
  kind: 'text',
  name: 'error.log',
  content: 'TypeError: x is null',
  citeMode: 'full',
  included: true
});
Prep.addMaterial({
  kind: 'text',
  name: 'notes.md',
  content: 'repro on win10',
  citeMode: 'full',
  included: true
});
assert.equal(Prep.getMaterialSummary().count, 2);

// 2) cancel one material → send scope matches Assist outbound snapshot
const mids = Prep.getMaterialSummary().refs.map((r) => r.id);
Prep.updateMaterialFlags(mids[1], { included: false });
const snap = Prep.buildAssistInputSnapshot();
assert.equal(snap.materials.length, 1);
assert.equal(snap.materials[0].name, 'error.log');
assert.match(Own.describeSendScope(snap).willSend, /1 个/);
assert.match(Client.sendScopeHint(), /草稿/);

// 3) begin → running; cancel; stale discard
const begun = Prep.beginAssistOrganize({
  allowMetered: false,
  deadlineMs: 30000
});
assert.equal(begun.ok, true);
assert.equal(Prep._model().assist.state, 'running');
Prep.finishAssistLocal('cancelled', { reason: 'cancelled' });
assert.equal(Prep._model().assist.state, 'cancelled');

const begun2 = Prep.beginAssistOrganize({ allowMetered: false, deadlineMs: 30000 });
assert.equal(begun2.ok, true);
Prep._model().contentRevision += 1;
const staleAdopt = Prep.adoptAssistResult({
  ok: true,
  requestId: begun2.requestId,
  result: {
    goal: 'SHOULD_NOT',
    facts: [],
    constraints: [],
    steps: [],
    acceptanceCriteria: [],
    unknowns: []
  }
});
assert.equal(staleAdopt.adopted, false);
assert.equal(staleAdopt.reason, 'stale');
Prep.finishAssistLocal('failed', { reason: 'stale' });

// 4–5) organized → edit → send body is edited text
Own.applyOrganizedFromStructured(Prep._model(), {
  goal: 'Fix login',
  facts: [],
  constraints: [],
  steps: [],
  acceptanceCriteria: [],
  unknowns: []
});
Prep.setOrganizedBody('EDITED_BODY_ONLY', { skipSync: true });
const edited = Prep.buildSendBody({ attachEvidence: false });
assert.match(edited.body, /EDITED_BODY_ONLY/);
assert.equal(edited.source, 'user_edited_organized');
assert.ok(edited.snapshotId);

// 6) material change → stale flag (send path shows confirm in UI)
Prep.addMaterial({
  kind: 'text',
  name: 'extra.txt',
  content: 'new',
  citeMode: 'full',
  included: true
});
assert.equal(Prep._model().organizedDraft.stale, true);
assert.equal(Prep.buildSendBody({ attachEvidence: false }).organizedStale, true);

// 7) receipt snapshotId matches last send
const send2 = Prep.buildSendBody({ attachEvidence: false });
assert.equal(Prep._model().lastSendSnapshotId, send2.snapshotId);
const receiptHtmlSrc = read('src/js/features/now/home-agent-v2.js');
assert.match(receiptHtmlSrc, /data-snapshot-id/);
assert.match(receiptHtmlSrc, /snapshotId/);

// 8) no_key / no_free_model / offline → actionable notice; direct raw send still works
for (const reason of ['no_key', 'no_free_model', 'offline']) {
  const notice = Client.formatFailureNotice(reason);
  assert.ok(notice.length > 8);
  assert.doesNotMatch(notice, /^整理失败$/);
  assert.match(notice, /直接发送/);
}
assert.match(Client.formatFailureNotice('no_free_model'), /允许计量额度/);
assert.equal(Client.allowMetered(), false);
const res = await Client.runOrganize({});
assert.equal(res.ok, false);
assert.equal(res.reason, 'no_free_model');
assert.ok(assistRunCount >= 1);

Prep.setActiveDraft('raw');
const sendRaw = Prep.buildSendBody({ attachEvidence: false });
assert.match(sendRaw.body, /login crash/);
assert.ok(sendRaw.snapshotId);

const ready = await Client.fetchReady();
assert.equal(ready.ready, false);
assert.equal(ready.reason, 'no_free_model');

// dock copy: metered entry + no bare failure
assert.match(receiptHtmlSrc, /允许计量额度/);
assert.match(receiptHtmlSrc, /data-ha2-allow-metered/);
assert.match(receiptHtmlSrc, /formatFailureNotice/);
assert.doesNotMatch(
  receiptHtmlSrc,
  /t\('ha2OrganizeFailed',\s*'整理失败'\)/
);

console.log('test-home-assist-ui-checklist: ok (simulated steps 1–8)');
console.log(
  'device_check_remaining: visual click-through on onetone.exe (screenshots / remote organize)'
);
process.exit(0);
