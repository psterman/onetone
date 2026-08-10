/**
 * Panel reveal controller — instant layout hide + opacity/clip reveal.
 * Uses OneToneMotion.readCssDurationMs when available.
 */
(function (global) {
  'use strict';

  var DEFAULT_ENTER_MS = 200;
  var EASING = 'cubic-bezier(0.23, 1, 0.32, 1)';

  function readEnterMs() {
    var M = global.OneToneMotion;
    if (M && typeof M.readCssDurationMs === 'function') {
      return M.readCssDurationMs('--motion-duration-enter', DEFAULT_ENTER_MS);
    }
    return DEFAULT_ENTER_MS;
  }

  function prefersReduced() {
    var M = global.OneToneMotion;
    if (M && typeof M.prefersReducedMotion === 'function') return !!M.prefersReducedMotion();
    try {
      return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }

  function clearInlineReveal(el) {
    if (!el || !el.style) return;
    el.style.removeProperty('opacity');
    el.style.removeProperty('clip-path');
    el.style.removeProperty('transition');
  }

  /**
   * Create a controller bound to one panel element.
   * generation bumps invalidate late fallbacks.
   */
  function createPanelReveal(body) {
    var timer = null;
    var raf = 0;
    var onEnd = null;
    var generation = 0;

    function clearAnim() {
      if (timer != null) {
        try { global.clearTimeout(timer); } catch (_) {}
        timer = null;
      }
      if (raf) {
        try { global.cancelAnimationFrame(raf); } catch (_) {}
        raf = 0;
      }
      if (onEnd && body) {
        try { body.removeEventListener('transitionend', onEnd); } catch (_) {}
        onEnd = null;
      }
    }

    function setInert(on) {
      if (!body) return;
      try {
        body.inert = !!on;
      } catch (_) {
        if (on) body.setAttribute('inert', '');
        else body.removeAttribute('inert');
      }
    }

    function setOpenInstant(head, open) {
      clearAnim();
      generation += 1;
      if (!body) return;
      clearInlineReveal(body);
      if (open) {
        body.hidden = false;
        body.removeAttribute('aria-hidden');
        setInert(false);
      } else {
        setInert(true);
        body.setAttribute('aria-hidden', 'true');
        body.hidden = true;
      }
      if (head) head.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    function focusIn(el, root) {
      if (!el || !root) return false;
      try { return root === el || root.contains(el); } catch (_) { return false; }
    }

    function closeInstant(head, focusTarget) {
      clearAnim();
      generation += 1;
      if (!body) return;
      try {
        var active = global.document && global.document.activeElement;
        if (focusIn(active, body) && focusTarget && focusTarget.focus) focusTarget.focus();
      } catch (_) {}
      setInert(true);
      body.setAttribute('aria-hidden', 'true');
      body.hidden = true;
      clearInlineReveal(body);
      if (head) head.setAttribute('aria-expanded', 'false');
    }

    function openReveal(head) {
      if (!body) return;
      clearAnim();
      var gen = ++generation;

      if (prefersReduced()) {
        setOpenInstant(head, true);
        return;
      }

      body.hidden = false;
      body.removeAttribute('aria-hidden');
      setInert(true);
      body.style.opacity = '0';
      body.style.clipPath = 'inset(0 0 8% 0)';
      body.style.transition = 'none';
      if (head) head.setAttribute('aria-expanded', 'true');

      var duration = readEnterMs();
      var fallbackMs = duration + 50;

      function finish() {
        if (gen !== generation) return; // stale — do not clear new panel inert
        clearAnim();
        clearInlineReveal(body);
        setInert(false);
      }

      onEnd = function (ev) {
        if (!ev || ev.target !== body) return;
        var prop = ev.propertyName || '';
        if (prop && prop !== 'opacity' && prop !== 'clip-path') return;
        finish();
      };
      body.addEventListener('transitionend', onEnd);

      raf = global.requestAnimationFrame(function () {
        if (gen !== generation) return;
        body.style.transition =
          'opacity ' + duration + 'ms ' + EASING + ', clip-path ' + duration + 'ms ' + EASING;
        body.style.opacity = '1';
        body.style.clipPath = 'inset(0)';
      });

      timer = global.setTimeout(function () {
        finish();
      }, fallbackMs);
    }

    function cancel() {
      clearAnim();
      generation += 1;
    }

    return {
      setOpenInstant: setOpenInstant,
      closeInstant: closeInstant,
      openReveal: openReveal,
      cancel: cancel,
      /** @internal test helper */
      _generation: function () { return generation; }
    };
  }

  global.OneTonePanelReveal = {
    createPanelReveal: createPanelReveal,
    readEnterMs: readEnterMs,
    DEFAULT_ENTER_MS: DEFAULT_ENTER_MS,
    EASING: EASING
  };
})(typeof window !== 'undefined' ? window : globalThis);
