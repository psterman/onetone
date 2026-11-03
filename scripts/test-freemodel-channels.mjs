/**
 * Freemodel channel registry + connect capability (no Tauri).
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
assert.equal(FM.byId('workbuddy').tokenCapture, 'oauth_poll');
assert.equal(FM.byId('workbuddy').connectKind, 'oauth');
assert.equal(FM.byId('workbuddy').connectOrder, 20);
assert.equal(FM.byId('opencode_zen').authKind, 'oauth');
assert.equal(FM.byId('opencode_zen').tokenCapture, 'oauth_poll');
assert.equal(FM.byId('opencode_zen').connectKind, 'oauth');
assert.equal(FM.byId('opencode_zen').connectOrder, 30);
assert.ok(String(FM.byId('opencode_zen').baseUrl || '').includes('opencode'));
assert.equal(FM.byId('opencode_zen').loginUrl, 'https://opencode.ai/console/device');
assert.ok(!String(FM.byId('opencode_zen').loginUrl).includes('/console/console/'));

// Kilo = true one_tap (not paste_key primary).
assert.equal(FM.byId('kilo').connectKind, 'one_tap');
assert.equal(FM.byId('kilo').connectOrder, 10);
assert.equal(FM.byId('kilo').baseUrl, 'https://ai-gateway.kilo.ai/api/v1');
assert.equal(FM.byId('kilo').defaultModel, 'kilo-auto/free');

assert.equal(FM.byId('loomy').connectKind, 'oauth');
assert.equal(FM.byId('loomy').connectOrder, 40);
assert.equal(FM.byId('loomy').baseUrl, 'https://loomyad.xunfei.cn/api/v1');
assert.equal(FM.byId('loomy').defaultModel, 'spark-x');
assert.equal(FM.byId('raccoon').connectKind, 'oauth');
assert.equal(FM.byId('raccoon').connectOrder, 50);
assert.equal(FM.byId('raccoon').baseUrl, 'https://xiaohuanxiong.com/api/web/llm/v2');
assert.equal(FM.byId('raccoon').defaultModel, 'sn-sensenova-6-8-flash-lite');

assert.equal(FM.byId('gemini_ca').authKind, 'browser_checkin');
assert.equal(FM.byId('gemini_ca').tokenCapture, 'none');
assert.equal(FM.byId('gemini_ca').label, 'Google Antigravity');
assert.ok(String(FM.byId('gemini_ca').loginUrl || '').includes('antigravity.google.com'));
assert.equal(FM.byId('softpad_paid_keys').status, 'eliminated');
assert.equal(FM.byId('muse_spark').status, 'eliminated');
assert.equal(FM.byId('sensenova').status, 'eliminated');
assert.ok(String(FM.byId('loomy').label || '').includes('Loomy'));
assert.ok(String(FM.byId('raccoon').label || '').includes('Raccoon'));
assert.equal(FM.byId('raccoon').authKind, 'oauth');
assert.ok(String(FM.byId('raccoon').loginUrl || '').includes('xiaohuanxiong.com'));
assert.ok(String(FM.byId('lobsterai').loginUrl || '').includes('portal#/login'));
assert.ok(String(FM.byId('trae').loginUrl || '').includes('/login'));
assert.ok(String(FM.byId('zcode').loginUrl || '').includes('bigmodel.cn'));
assert.ok(String(FM.byId('qoder_cn').loginUrl || '').includes('qoder.com.cn/users/sign-in'));

// connectOrder sort for chatCapable (Array.from: vm realm arrays ≠ outer Array)
const ordered = FM.connectChannels();
assert.equal(
  Array.from(ordered, (c) => c.id).join(','),
  'kilo,workbuddy,opencode_zen,loomy,raccoon'
);

// Capability status helpers
assert.equal(typeof FM.resolveCapability, 'function');
assert.equal(typeof FM.setConnectState, 'function');
assert.equal(
  FM.resolveCapability(FM.byId('kilo'), { hasProvider: false }).state,
  'unconfigured'
);
FM.setConnectState('kilo', 'connecting');
assert.equal(FM.resolveCapability(FM.byId('kilo'), { hasProvider: false }).state, 'connecting');
FM.setConnectState('kilo', 'ready');
assert.equal(FM.resolveCapability(FM.byId('kilo'), { hasProvider: true }).state, 'ready');
FM.setConnectState('kilo', 'error', { error: 'boom' });
assert.equal(FM.resolveCapability(FM.byId('kilo'), { hasProvider: false }).state, 'error');

// WB tristate via resolveCapability
assert.equal(
  FM.resolveCapability(FM.byId('workbuddy'), { wbLoggedIn: false }).wbPhase,
  'logged_out'
);
assert.equal(
  FM.resolveCapability(FM.byId('workbuddy'), { wbLoggedIn: true, wbModelCount: 0 }).wbPhase,
  'no_models'
);
assert.equal(
  FM.resolveCapability(FM.byId('workbuddy'), { wbLoggedIn: true, wbModelCount: 2 }).wbPhase,
  'ready'
);
assert.equal(
  FM.resolveCapability(FM.byId('workbuddy'), { wbLoggedIn: true, wbModelCount: 2 }).state,
  'ready'
);

// checkedToday still works but is NOT the primary capability gate
assert.equal(FM.checkedToday('workbuddy'), false);
FM.markChecked('workbuddy', { status: 'pending', note: 'oauth_started' });
assert.equal(FM.checkedToday('workbuddy'), false, 'pending is not logged-in');
FM.markChecked('workbuddy', { status: 'ok' });
assert.equal(FM.checkedToday('workbuddy'), true);

// due = chatCapable not ready (not "unchecked today")
store.clear();
FM.setConnectState('kilo', 'ready');
const dueNone = FM.dueChannels({ readyIds: { kilo: true, workbuddy: true, opencode_zen: true, loomy: true, raccoon: true } });
assert.equal(dueNone.length, 0);
const dueSome = FM.dueChannels({ readyIds: { kilo: true } });
assert.ok(dueSome.every((c) => c.id !== 'kilo'));
assert.ok(dueSome.some((c) => c.id === 'loomy'));

sandbox.__opened = [];
const oneTap = await FM.checkIn('kilo');
assert.equal(oneTap.action, 'one_tap');
assert.equal(sandbox.__opened.length, 0, 'one_tap must not open login page');

sandbox.__opened = [];
const loomyOauth = await FM.checkIn('loomy');
assert.equal(loomyOauth.action, 'oauth');
assert.equal(loomyOauth.channel.id, 'loomy');
const raccoonOauth = await FM.checkIn('raccoon');
assert.equal(raccoonOauth.action, 'oauth');
assert.equal(raccoonOauth.channel.id, 'raccoon');

sandbox.__opened = [];
const browser = await FM.checkIn('trae');
assert.equal(browser.action, 'opened');
assert.equal(sandbox.__opened.length, 1);
assert.ok(sandbox.__opened.some((u) => String(u).includes('trae') && String(u).includes('login')));
assert.equal(FM.checkedToday('trae'), false);

sandbox.__opened = [];
const raccoonOnce = await FM.checkIn('raccoon', { openUrl: false });
assert.equal(raccoonOnce.action, 'oauth');
assert.equal(sandbox.__opened.length, 0);
assert.equal(FM.getConnectState('raccoon').state, 'connecting');

const oauthWb = await FM.checkIn('workbuddy', { skipMark: true });
assert.equal(oauthWb.action, 'oauth');
assert.equal(oauthWb.channel.id, 'workbuddy');

const oauthZen = await FM.checkIn('opencode_zen', { skipMark: true });
assert.equal(oauthZen.action, 'oauth');
assert.equal(oauthZen.channel.id, 'opencode_zen');

const chatCapable = FM.channels({ chatCapable: true });
assert.ok(chatCapable.some((c) => c.id === 'workbuddy'));
assert.ok(chatCapable.some((c) => c.id === 'opencode_zen'));
assert.ok(chatCapable.some((c) => c.id === 'kilo'));
assert.ok(chatCapable.some((c) => c.id === 'loomy'));
assert.ok(chatCapable.some((c) => c.id === 'raccoon'));
assert.ok(!chatCapable.some((c) => c.id === 'trae'));
assert.ok(!chatCapable.some((c) => c.id === 'lobsterai'));
assert.ok(!chatCapable.some((c) => c.id === 'muse_spark'));
assert.ok(!chatCapable.some((c) => c.id === 'sensenova'));
const siteOnly = FM.channels({ siteOnly: true });
assert.ok(siteOnly.some((c) => c.id === 'trae'));
assert.ok(!siteOnly.some((c) => c.id === 'raccoon'));
assert.ok(!siteOnly.some((c) => c.id === 'loomy'));
assert.ok(!siteOnly.some((c) => c.id === 'kilo'));

const batch = await FM.checkInAllDue({
  openUrl: false,
  staggerMs: 0,
  readyIds: { kilo: true }
});
assert.ok(Array.isArray(batch.results));
assert.ok(Array.isArray(batch.oauthIds));

console.log('ok freemodel-channels', {
  active: FM.channels({ activeOnly: true }).length,
  due: FM.dueCount({ readyIds: { kilo: true } }),
  connectOrder: ordered.map((c) => c.id)
});
