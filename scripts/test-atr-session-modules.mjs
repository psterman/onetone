/**
 * Ownership split modules load and expose the expected APIs.
 * Run: node scripts/test-atr-session-modules.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';

const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('src/index.html');
assert.match(html, /atr-session-projection\.js/);
assert.match(html, /atr-session-controller\.js/);
assert.match(html, /atr-session-actions\.js/);
assert.match(html, /chat-composer\.js/);

const sandbox = {
  console,
  JSON,
  Object,
  Array,
  String,
  Number,
  Date,
  Math,
  Error,
  Promise,
  localStorage: {
    _d: {},
    getItem(k) {
      return this._d[k] || null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    },
    removeItem(k) {
      delete this._d[k];
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

for (const f of [
  'run-contracts.js',
  'atr-session-projection.js',
  'atr-session-controller.js',
  'atr-session-actions.js',
  'chat-composer.js'
]) {
  vm.runInContext(
    read(path.join('src/js/features/now', f)),
    sandbox,
    { filename: f }
  );
}

assert.ok(sandbox.OneToneAtrSessionProjection);
assert.ok(sandbox.OneToneAtrSessionController);
assert.ok(sandbox.OneToneAtrSessionActions);
assert.ok(sandbox.OneToneChatComposer);

const proj = sandbox.OneToneAtrSessionProjection.projectChatAtr({
  status: 'waiting',
  waitingReason: 'approval'
});
assert.equal(proj.status, 'waiting');
assert.equal(proj.busy, false);
assert.equal(proj.pauseKind, 'approval');

const busy = sandbox.OneToneAtrSessionProjection.projectChatBusy(
  { status: 'running', taskId: 't1' },
  { driveAlive: true }
);
assert.equal(busy.busy, true);

const opts = sandbox.OneToneChatComposer.buildChatSendOpts('hello');
assert.equal(opts.permissionMode, 'read_only');
assert.equal(opts.skipPlanConfirm, true);
assert.equal(sandbox.OneToneChatComposer.canSend('hi', false), true);
assert.equal(sandbox.OneToneChatComposer.canSend('hi', true), false);

console.log('test-atr-session-modules: ok');
