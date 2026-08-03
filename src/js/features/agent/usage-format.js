/**
 * Shared Soft Pad usage formatters (overlay + settings + node tests).
 * < 1e12 → epoch seconds; >= 1e12 → epoch ms. Past/zero → 待刷新.
 */
(function (root) {
  'use strict';

  function formatResetCountdown(resetsAt) {
    if (resetsAt == null || resetsAt === '') return '';
    var n = Number(resetsAt);
    if (!isFinite(n) || n <= 0) return '';
    var ms = n < 1e12 ? n * 1000 : n;
    var rem = ms - Date.now();
    if (rem <= 0) return '待刷新';
    var totalMins = Math.floor(rem / 60000);
    if (totalMins < 1) return '1m';
    var days = Math.floor(totalMins / (24 * 60));
    var hours = Math.floor((totalMins % (24 * 60)) / 60);
    var mins = totalMins % 60;
    if (days > 0) return hours > 0 ? days + 'd' + hours + 'h' : days + 'd';
    if (hours > 0) return mins > 0 ? hours + 'h' + mins + 'm' : hours + 'h';
    return mins + 'm';
  }

  /** Prefer primary window resetsAt; else first window with a value; else scalar. */
  function primaryResetAt(usage) {
    usage = usage || {};
    var windows = Array.isArray(usage.windows) ? usage.windows : [];
    var primary = null;
    for (var i = 0; i < windows.length; i++) {
      if (String(windows[i].kind || '') === 'primary') {
        primary = windows[i];
        break;
      }
    }
    var pick = primary || windows[0];
    if (pick) {
      var at = pick.resetsAt != null ? pick.resetsAt : pick.resets_at;
      if (at != null && at !== '') return at;
    }
    return usage.resetsAt != null ? usage.resetsAt : usage.resets_at;
  }

  var api = {
    formatResetCountdown: formatResetCountdown,
    primaryResetAt: primaryResetAt
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.OneToneUsageFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
