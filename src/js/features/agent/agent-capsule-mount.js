/**
 * Resolves the lazy Agent iframe hosts before the parent mounts Time Machine.
 * The helper is DOM-light so the readiness contract can be regression-tested.
 */
(function (root, factory) {
  'use strict';

  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.OneToneAgentCapsuleMount = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function resolveHosts(frame) {
    var doc = null;
    try {
      doc = frame && (frame.contentDocument || (frame.contentWindow && frame.contentWindow.document));
    } catch (_) {
      doc = null;
    }
    if (!doc || typeof doc.getElementById !== 'function') return null;
    var host = doc.getElementById('capsuleHost');
    var desk = doc.getElementById('agentCapsuleDesk');
    if (!host || !desk) return null;
    return {
      host: host,
      desk: desk,
      detail: doc.getElementById('agentCapsuleDetail') || null
    };
  }

  function waitForHosts(opts) {
    opts = opts || {};
    var getFrame = typeof opts.getFrame === 'function' ? opts.getFrame : function () { return null; };
    var schedule =
      typeof opts.schedule === 'function'
        ? opts.schedule
        : function (run, delay) { setTimeout(run, delay); };
    var maxAttempts = Math.max(1, Number(opts.maxAttempts) || 60);
    var delayMs = Math.max(0, Number(opts.delayMs) || 50);
    var attempts = 0;

    return new Promise(function (resolve, reject) {
      function probe() {
        attempts += 1;
        var hosts = resolveHosts(getFrame());
        if (hosts) {
          resolve(hosts);
          return;
        }
        if (attempts >= maxAttempts) {
          reject(new Error('胶囊视图尚未就绪，请重试'));
          return;
        }
        schedule(probe, delayMs);
      }
      probe();
    });
  }

  return {
    resolveHosts: resolveHosts,
    waitForHosts: waitForHosts
  };
});
