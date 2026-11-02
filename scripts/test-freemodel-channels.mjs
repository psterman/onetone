/**
 * Freemodel channel registry + check-in state (no Tauri).
 * Run: node scripts/test-freemodel-channels.mjs
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const src = fs.readFileSync('src/js/features/now/freemodel-channels.js', 'utf8');
const store = new Map();
const sandbox = {
  window: null,
  localStorage: {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    }
  },
  open() {
    sandbox.__opened.push(arguments[0]);
    return true;
  },
  setTimeout(fn) {
    fn();
    return 1;
  },
  __opened: []
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(src, sandbox);

const FM = sandbox.OneToneFreemodelChannels;
assert.ok(FM);
assert.equal(FM.byId('workbuddy').authKind, 'oauth');
assert.equal(FM.byId('opencode_zen').authKind, 'anonymous');
assert.equal(FM.byId('gemini_ca').authKind, 'browser_checkin');
assert.equal(FM.byId('softpad_paid_keys').status, 'eliminated');
assert.equal(FM.byId('muse_spark').status, 'eliminated');

assert.equal(FM.checkedToday('workbuddy'), false);
FM.markChecked('workbuddy', { status: 'ok' });
assert.equal(FM.checkedToday('workbuddy'), true);
assert.ok(FM.dueCount() >= 1);

const anon = await FM.checkIn('opencode_zen', { openUrl: false });
assert.equal(anon.action, 'enabled');
assert.equal(FM.isEnabled('opencode_zen'), true);
assert.equal(FM.checkedToday('opencode_zen'), true);

sandbox.__opened = [];
const browser = await FM.checkIn('trae');
assert.equal(browser.action, 'opened');
assert.ok(sandbox.__opened.some((u) => String(u).includes('trae')));
assert.equal(FM.checkedToday('trae'), true);

const oauth = await FM.checkIn('workbuddy', { skipMark: true });
assert.equal(oauth.action, 'oauth');

const batch = await FM.checkInAllDue({ openUrl: false, staggerMs: 0 });
assert.ok(Array.isArray(batch.results));
assert.ok(batch.oauthIds.includes('workbuddy') === false || FM.needsCheckin('workbuddy') === false);

console.log('ok freemodel-channels', {
  active: FM.channels({ activeOnly: true }).length,
  due: FM.dueCount()
});
