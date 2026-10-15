/**
 * Main-window drag de-load.
 *
 * Why: main title-bar drag and Soft Pad drag share ONE UI thread with the
 * WebView2 render/paint work. `backdrop-filter` (68 uses across app.css and
 * friends) must re-sample the backdrop on every move pulse, so a heavy home
 * screen repaints per pixel moved and the modal move loop starves — the window
 * "waits, then teleports". Dropping the expensive paint during the gesture is
 * invisible (nothing is readable mid-drag) and removes most of that cost.
 *
 * Source of truth: Rust `window_layout.rs` emits `drag_trace` with native
 * WM_NCLBUTTONDOWN / ENTERSIZEMOVE / EXITSIZEMOVE — no FE guesswork.
 *
 * Critical: do NOT flush deferred to_js or strip ot-drag-active right after a
 * smooth drag ends — that re-arms backdrop-filter and floods the UI thread so
 * the *next* grab stutters. Match Rust MAIN_PAINT_RESTORE_MS (~1000ms).
 */
(function (global) {
  'use strict';

  var CLS = 'ot-drag-active';
  // Native end event can be lost (crash / stale latch) — never leave the de-load on.
  var MAX_MS = 4000;
  // Keep paint de-load across the post-drag gap (400ms was too short → 二次延迟).
  var OFF_DEBOUNCE_MS = 1000;
  var timer = 0;
  var offTimer = 0;
  var root = null;

  function beginSet() {
    return /^(ncl_down|enter_sizemove|overlay_drag_prepare|overlay_drag_begin)$/;
  }
  function endSet() {
    // paint_restore is Rust's delayed clear — treat as end. exit_sizemove alone
    // must NOT strip the class (Rust keeps it for MAIN_PAINT_RESTORE_MS).
    return /^(ncl_up_click|overlay_drag_end|overlay_drag_end_stale|paint_restore)$/;
  }

  function flushDeferred() {
    try {
      if (typeof global.__vp_flush_to_js__ === 'function') global.__vp_flush_to_js__();
    } catch (_) {}
  }

  function clearTimers() {
    if (timer) {
      global.clearTimeout(timer);
      timer = 0;
    }
    if (offTimer) {
      global.clearTimeout(offTimer);
      offTimer = 0;
    }
  }

  function stripClassOnly() {
    clearTimers();
    if (!root) root = global.document && global.document.documentElement;
    if (root && root.classList) root.classList.remove(CLS);
  }

  function apply(on) {
    if (!root) root = global.document && global.document.documentElement;
    if (!root) return;
    if (on) {
      // Cancel pending off/flush — consecutive grabs must keep de-load.
      clearTimers();
      if (root.classList) root.classList.add(CLS);
      timer = global.setTimeout(function () {
        timer = 0;
        stripClassOnly();
        flushDeferred();
      }, MAX_MS);
      return;
    }
    if (offTimer) return;
    if (timer) {
      global.clearTimeout(timer);
      timer = 0;
    }
    offTimer = global.setTimeout(function () {
      offTimer = 0;
      stripClassOnly();
      // Rust owns staggered flush (~1100ms); FE safety path flushes after class.
      flushDeferred();
    }, OFF_DEBOUNCE_MS);
  }

  function bind() {
    var handler = function (ev) {
      var p = ev && ev.payload;
      if (!p || typeof p.phase !== 'string') return;
      // exit_sizemove: keep class (Rust owns delayed paint_restore).
      if (p.phase === 'exit_sizemove') {
        if (root && root.classList && root.classList.contains(CLS)) {
          if (timer) global.clearTimeout(timer);
          timer = global.setTimeout(function () {
            timer = 0;
            stripClassOnly();
            flushDeferred();
          }, MAX_MS);
        }
        return;
      }
      // Rust cleared class; do not flush here (to_js_flush is staggered).
      if (p.phase === 'paint_restore') {
        stripClassOnly();
        return;
      }
      if (p.phase === 'to_js_flush') {
        flushDeferred();
        return;
      }
      if (beginSet().test(p.phase)) apply(true);
      else if (endSet().test(p.phase)) apply(false);
    };
    try {
      if (global.OneToneIpc && typeof global.OneToneIpc.listen === 'function') {
        global.OneToneIpc.listen('drag_trace', handler);
        return true;
      }
    } catch (_) {}
    try {
      var listen = global.__TAURI_INTERNALS__ && global.__TAURI_INTERNALS__.listen;
      if (typeof listen === 'function') {
        listen('drag_trace', handler);
        return true;
      }
    } catch (_) {}
    return false;
  }

  // Native NCLBUTTONDOWN pauses the UI thread — keep the listener attach itself
  // off the critical path; retry a few times if IPC is not ready yet.
  var tries = 0;
  var poll = global.setInterval(function () {
    tries++;
    if (bind() || tries >= 40) global.clearInterval(poll);
  }, 100);
  bind();

  global.OneToneWindowDragPerf = {
    set: apply,
    isActive: function () {
      return !!(root && root.classList && root.classList.contains(CLS));
    },
  };
})((typeof window !== 'undefined') ? window : globalThis);
