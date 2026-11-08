'use strict';

/**
 * Home status push path: Rust emit + FE listen, not 5s/15s hot poll.
 */
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

var root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

var notifyRs = read('src-tauri/src/home_status_notify.rs');
var storeJs = read('src/js/features/now/home-focus-store.js');
var ha2Store = read('src/js/features/now/home-agent-v2-store.js');
var stripJs = read('src/js/features/now/home-agent-status-strip.js');
var nowHome = read('src/js/features/now/now-home.js');
var padStore = read('src-tauri/src/pad_status/store.rs');
var worker = read('src-tauri/src/agent_memory/worker.rs');
var attention = read('src-tauri/src/agent_attention/store.rs');
var libRs = read('src-tauri/src/lib.rs');

assert.ok(notifyRs.includes('home_status_changed'), 'Rust payload type');
assert.ok(notifyRs.includes('DEBOUNCE_MS'), 'Rust debounce');
assert.ok(notifyRs.includes('emit_to_main_if_available'), 'Rust to_js emit');
assert.ok(libRs.includes('home_status_notify::bind_app'), 'bind_app at startup');
assert.ok(padStore.includes('home_status_notify::schedule("pad_status")'), 'pad_status schedules');
assert.ok(attention.includes('home_status_notify::schedule("attention")'), 'attention schedules');
assert.ok(worker.includes('home_status_notify::schedule("discover")'), 'discover schedules');

assert.ok(storeJs.includes("msg.type !== 'home_status_changed'"), 'FocusStore listens');
assert.ok(storeJs.includes('SAFETY_POLL_MS'), 'FocusStore safety poll const');
assert.ok(/SAFETY_POLL_MS\s*=\s*30000/.test(storeJs), 'FocusStore 30s safety');
assert.ok(!/startPolling\(5000\)/.test(storeJs), 'FocusStore no hardcoded 5s');
assert.ok(!/startPolling\(5000\)/.test(nowHome), 'now-home no 5s poll');
assert.ok(!/Focus\.startPolling\(5000\)/.test(ha2Store), 'ha2 no 5s focus poll');
assert.ok(/POLL_MS\s*=\s*30000/.test(ha2Store), 'ha2 30s safety poll');
assert.ok(ha2Store.includes("msg.type !== 'home_status_changed'"), 'ha2 listens push');
assert.ok(ha2Store.includes('scheduleRefresh'), 'ha2 schedules refresh on push');
assert.ok(stripJs.includes("msg.type !== 'home_status_changed'"), 'status-strip listens');

// Runtime: push message triggers fetch without interval.
var fetches = 0;
var sandbox = {
  console: console,
  setInterval: function () {
    return 0;
  },
  clearInterval: function () {},
  setTimeout: function (fn) {
    fn();
    return 0;
  },
  chrome: {
    webview: {
      _cbs: [],
      addEventListener: function (ev, cb) {
        if (ev === 'message') this._cbs.push(cb);
      },
      dispatch: function (data) {
        this._cbs.forEach(function (cb) {
          cb({ data: data });
        });
      }
    }
  },
  OneToneIpc: {
    invoke: function (cmd) {
      if (cmd === 'cmd_home_focus_snapshot') {
        fetches += 1;
        return Promise.resolve({
          project: { id: 'p', match: 'exact', confirmed: true },
          work: { status: 'idle' },
          nextAction: { kind: 'none' },
          provider: { status: 'idle' },
          foreground: { appName: 'Cursor' },
          source: { freshness: 'live' }
        });
      }
      return Promise.resolve(null);
    }
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(storeJs, sandbox);
var Focus = sandbox.OneToneHomeFocusStore;
assert.ok(Focus && Focus.fetch && Focus.subscribe, 'FocusStore exports');
assert.strictEqual(Focus.SAFETY_POLL_MS, 30000, 'exported safety ms');

var notified = 0;
Focus.subscribe(function () {
  notified += 1;
});
sandbox.chrome.webview.dispatch({ type: 'home_status_changed', reason: 'pad_status', at: 1 });

// Allow microtask settle for Promise.then
await new Promise(function (r) {
  setTimeout(r, 20);
});

assert.ok(fetches >= 1, 'push schedules fetchSnapshot');
assert.ok(notified >= 1, 'push notifies subscribers when dto key changes');

console.log('ok: home status push path');
