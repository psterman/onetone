/**
 * OneToneMotion — one-shot animation lifecycle for dual entry (main + overlay).
 * CSS authority: src/css/motion.css. FALLBACK_MS mirrors those durations.
 */
(function (global) {
  'use strict';

  // Keep in sync with src/css/motion.css :root durations (ms).
  var FALLBACK_MS = {
    'ot-shake': 260,
    'ot-sparkle-once': 120,
    'ot-enter': 200
  };

  var CLASS_TO_ANIM = {
    'ot-shake': 'ot-shake',
    'ot-sparkle-once': 'ot-sparkle-once',
    'ot-enter': 'ot-enter'
  };

  /** @type {WeakMap<Element, { className: string, timer: any, onEnd: Function, cancel: Function }>} */
  var slots = new WeakMap();

  function prefersReducedMotion() {
    try {
      if (global.matchMedia) {
        return !!global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      }
    } catch (_) {}
    return false;
  }

  function readCssDurationMs(varName, fallback) {
    try {
      var doc = global.document;
      if (!doc || !doc.documentElement || typeof global.getComputedStyle !== 'function') {
        return fallback;
      }
      var raw = String(global.getComputedStyle(doc.documentElement).getPropertyValue(varName) || '').trim();
      if (!raw) return fallback;
      var n = parseFloat(raw);
      if (!isFinite(n) || n < 0) return fallback;
      if (/ms$/i.test(raw)) return n;
      if (/s$/i.test(raw)) return n * 1000;
      return n;
    } catch (_) {
      return fallback;
    }
  }

  function animNameMatches(ended, expected) {
    if (!expected) return true;
    var parts = String(ended || '').split(',');
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].trim() === expected) return true;
    }
    return false;
  }

  function defaultFallbackMs(className) {
    if (className === 'ot-shake') {
      return readCssDurationMs('--motion-duration-shake', FALLBACK_MS['ot-shake']);
    }
    if (className === 'ot-sparkle-once') {
      return readCssDurationMs('--motion-duration-status', FALLBACK_MS['ot-sparkle-once']);
    }
    if (className === 'ot-enter') {
      return readCssDurationMs('--motion-duration-enter', FALLBACK_MS['ot-enter']);
    }
    return FALLBACK_MS[className] || 300;
  }

  function noopCancel() {}

  /**
   * Play a one-shot class animation. One active slot per element.
   * cleanup is always run (connected or not). Returns cancel().
   */
  function playOnce(el, className, opts) {
    opts = opts || {};
    if (!el || !className) return noopCancel;

    var prev = slots.get(el);
    if (prev && typeof prev.cancel === 'function') prev.cancel();

    if (prefersReducedMotion()) {
      try {
        if (el.classList) el.classList.remove(className);
      } catch (_) {}
      slots.delete(el);
      return noopCancel;
    }

    var animationName = opts.animationName || CLASS_TO_ANIM[className] || className;
    var fallbackMs = opts.fallbackMs != null ? Number(opts.fallbackMs) : defaultFallbackMs(className);
    if (!isFinite(fallbackMs) || fallbackMs < 0) fallbackMs = defaultFallbackMs(className);

    var finished = false;
    var timer = null;

    function cleanup() {
      if (finished) return;
      finished = true;
      if (timer != null) {
        try {
          global.clearTimeout(timer);
        } catch (_) {}
        timer = null;
      }
      try {
        el.removeEventListener('animationend', onEnd);
      } catch (_) {}
      try {
        if (el.classList) el.classList.remove(className);
      } catch (_) {}
      var cur = slots.get(el);
      if (cur && cur.className === className) slots.delete(el);
    }

    function onEnd(event) {
      if (!event || event.target !== el) return;
      if (animationName && !animNameMatches(event.animationName, animationName)) return;
      cleanup();
    }

    function cancel() {
      cleanup();
    }

    try {
      if (el.classList) {
        el.classList.remove(className);
        void el.offsetWidth;
        el.classList.add(className);
      }
    } catch (_) {
      cleanup();
      return noopCancel;
    }

    el.addEventListener('animationend', onEnd);
    timer = global.setTimeout(function () {
      cleanup();
    }, fallbackMs + 50);

    slots.set(el, { className: className, timer: timer, onEnd: onEnd, cancel: cancel });
    return cancel;
  }

  function hasActiveSlot(el) {
    return !!(el && slots.get(el));
  }

  global.OneToneMotion = {
    playOnce: playOnce,
    prefersReducedMotion: prefersReducedMotion,
    hasActiveSlot: hasActiveSlot,
    readCssDurationMs: readCssDurationMs,
    animNameMatches: animNameMatches,
    FALLBACK_MS: FALLBACK_MS
  };
})(typeof window !== 'undefined' ? window : globalThis);
