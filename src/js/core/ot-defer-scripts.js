/**
 * Cold-start first knife: scripts marked type=text/plain data-ot-defer stay
 * inert until loadGroup / loadAll. Keeps homepage sync parse smaller.
 */
(function (global) {
  'use strict';

  var loaded = Object.create(null);
  var inflight = Object.create(null);

  function nodesFor(group) {
    var sel = group
      ? 'script[type="text/plain"][data-ot-defer="' + group + '"]'
      : 'script[type="text/plain"][data-ot-defer]';
    return Array.prototype.slice.call(document.querySelectorAll(sel));
  }

  var LOAD_ONE_MS = 12000;

  function runOne(el) {
    return new Promise(function (resolve) {
      if (!el || el.getAttribute('data-ot-defer-done') === '1') {
        resolve();
        return;
      }
      var src = el.getAttribute('src') || el.getAttribute('data-src') || '';
      if (!src) {
        el.setAttribute('data-ot-defer-done', '1');
        resolve();
        return;
      }
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        el.setAttribute('data-ot-defer-done', '1');
        resolve();
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = finish;
      s.onerror = function (err) {
        try {
          console.warn('[onetone] defer script failed', src, err);
        } catch (_) {}
        finish(); // do not block the chain
      };
      // WebView2 occasionally never fires onload — don't leave camera/debug open hung.
      setTimeout(function () {
        if (done) return;
        try {
          console.warn('[onetone] defer script timeout', src);
        } catch (_) {}
        finish();
      }, LOAD_ONE_MS);
      (el.parentNode || document.head || document.documentElement).insertBefore(s, el.nextSibling);
    });
  }

  function loadGroup(group) {
    group = String(group || '').trim();
    if (!group) return Promise.resolve();
    if (loaded[group]) return Promise.resolve();
    if (inflight[group]) return inflight[group];
    var nodes = nodesFor(group);
    inflight[group] = nodes
      .reduce(function (chain, el) {
        return chain.then(function () {
          return runOne(el);
        });
      }, Promise.resolve())
      .then(function () {
        loaded[group] = true;
        delete inflight[group];
      });
    return inflight[group];
  }

  function loadAll() {
    var groups = {};
    nodesFor('').forEach(function (el) {
      var g = el.getAttribute('data-ot-defer');
      if (g) groups[g] = true;
    });
    return Object.keys(groups).reduce(function (chain, g) {
      return chain.then(function () {
        return loadGroup(g);
      });
    }, Promise.resolve());
  }

  function isLoaded(group) {
    return !!loaded[String(group || '')];
  }

  /** Panels that must wait on a deferred group before paint. */
  function panelNeedsDefer(panel) {
    panel = String(panel || '');
    return panel === 'debug' || panel === 'camera' || panel === 'camera2';
  }

  /**
   * Only camera-ui + debug are deferred (habit-heavy stays sync for left nav).
   * Callers should skip the Promise hop when panelNeedsDefer is false.
   */
  function ensureForPanel(panel) {
    panel = String(panel || '');
    if (panel === 'debug') return loadGroup('debug');
    if (panel === 'camera' || panel === 'camera2') return loadGroup('camera-ui');
    return Promise.resolve();
  }

  global.OneToneDefer = {
    loadGroup: loadGroup,
    loadAll: loadAll,
    isLoaded: isLoaded,
    ensureForPanel: ensureForPanel,
    panelNeedsDefer: panelNeedsDefer,
  };
})(typeof window !== 'undefined' ? window : globalThis);
