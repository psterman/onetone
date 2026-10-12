/**
 * Smart region capture — invoke from Home / Soft Pad / tray.
 * Opens system overlay; crops land in homepage materials via tray_collect.
 *
 * begin() returns immediately (queued). Overlay opens on the UI thread —
 * creating a webview while JS awaits the command deadlocks (same as input-aim).
 */
(function (global) {
  'use strict';

  function invoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (typeof fn !== 'function' && global.__TAURI_INTERNALS__) {
      fn = function (c, a) {
        return global.__TAURI_INTERNALS__.invoke(c, a || {});
      };
    }
    if (typeof fn !== 'function') return Promise.reject(new Error('no_invoke'));
    return Promise.resolve(fn(cmd, args || {}));
  }

  function listen(event, handler) {
    var api = global.OneToneIpc;
    if (api && typeof api.listen === 'function') {
      return api.listen(event, handler);
    }
    var internals = global.__TAURI_INTERNALS__;
    if (internals && typeof internals.listen === 'function') {
      return internals.listen(event, handler);
    }
    return Promise.reject(new Error('no_listen'));
  }

  function toast(msg) {
    if (global.OneToneAppToast && global.OneToneAppToast.show) {
      try {
        global.OneToneAppToast.show(msg, 'scheme');
        return;
      } catch (_) {}
    }
    try {
      console.warn('[SmartCapture]', msg);
    } catch (_) {}
  }

  function bindFailToast() {
    if (global.__otSmartCaptureFailBound) return;
    global.__otSmartCaptureFailBound = true;
    listen('smart_capture_failed', function (ev) {
      var p = ev && ev.payload;
      var err = (p && p.error) || '截图启动失败';
      toast(String(err));
    }).catch(function () {
      global.__otSmartCaptureFailBound = false;
    });
  }

  /**
   * @param {'home'|'softPad'|'tray'|'hotkey'} entry
   * @param {{ monitorIndex?: number }} [opts]
   */
  function begin(entry, opts) {
    opts = opts || {};
    bindFailToast();
    return invoke('cmd_smart_capture_begin', {
      args: {
        entry: entry || 'hotkey',
        monitorIndex: opts.monitorIndex != null ? opts.monitorIndex : null
      }
    }).then(function (res) {
      if (res && res.ok === false) {
        throw new Error((res && res.error) || 'begin_failed');
      }
      return res;
    });
  }

  function cancel() {
    return invoke('cmd_smart_capture_cancel', {});
  }

  bindFailToast();

  global.OneToneSmartCapture = {
    begin: begin,
    cancel: cancel
  };
})(typeof window !== 'undefined' ? window : globalThis);
