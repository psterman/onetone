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

  /**
   * Duration-first window label. Never emit "10080min窗口余…".
   * Day-length windows must NOT read as "Nd remaining" (that is resetsAt).
   * Weekly (7d) → 周余N%; other day multiples → N天窗余N%.
   * withReset: append " · Xm重置" using that window's own resetsAt.
   */
  function windowQuotaLabel(w, withReset) {
    if (!w) return '';
    var mins = Number(w.durationMins != null ? w.durationMins : w.duration_mins) || 0;
    var rem = w.remainingPercent != null ? w.remainingPercent : w.remaining_percent;
    if (rem == null) return '';
    var pct = Math.round(Number(rem));
    if (!isFinite(pct)) return '';
    var base = '';
    var dayMins = 24 * 60;
    if (mins > 0 && mins % dayMins === 0) {
      var days = mins / dayMins;
      // 7d window length ≠ days until reset (Codex "Weekly 23% Aug 8").
      base = days === 7 ? '周余' + pct + '%' : days + '天窗余' + pct + '%';
    } else if (mins > 0 && mins % 60 === 0) {
      base = mins / 60 + 'h余' + pct + '%';
    } else if (mins > 0) {
      base = mins + 'min余' + pct + '%';
    } else {
      base = '窗口余' + pct + '%';
    }
    if (!withReset) return base;
    var cd = formatResetCountdown(w.resetsAt != null ? w.resetsAt : w.resets_at);
    return cd ? base + ' · ' + cd + '重置' : base;
  }

  var FRESH_STALE_MS = 5 * 60 * 1000;

  /**
   * Mini freshness dot from providerQuotasUpdatedAt (ms; <1e12 treated as sec).
   * @returns {{ ageMs: number, stale: boolean, title: string, mins: number }}
   */
  function quotasFreshnessAge(updatedAt, nowMs) {
    var now = nowMs != null && isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    var at = Number(updatedAt);
    if (!isFinite(at) || at <= 0) {
      return { ageMs: 0, stale: false, title: '', mins: 0 };
    }
    if (at < 1e12) at *= 1000;
    var ageMs = Math.max(0, now - at);
    var mins = Math.floor(ageMs / 60000);
    var title =
      mins < 1 ? 'Updated just now' : 'Updated ' + mins + 'm ago';
    return {
      ageMs: ageMs,
      stale: ageMs > FRESH_STALE_MS,
      title: title,
      mins: mins
    };
  }

  function quotaIconGlyph(icon) {
    var i = String(icon || '').trim().toLowerCase();
    if (i === 'ok') return '✓';
    if (i === 'warn') return '⚠';
    return '✗';
  }

  /**
   * Dropdown rows for providerQuotas. Partial failure keeps successful rows.
   * @param {Array} rows SoftPadQuotaRow[]
   * @returns {Array<{ provider, label, status, icon, glyph, caption, message }>}
   */
  function providerQuotaDropdownRows(rows) {
    if (!Array.isArray(rows)) return [];
    return rows
      .filter(function (r) {
        return r && (r.provider || r.label || r.caption);
      })
      .map(function (r) {
        return {
          provider: String(r.provider || ''),
          label: String(r.label || r.provider || ''),
          status: String(r.status || ''),
          icon: String(r.icon || ''),
          glyph: quotaIconGlyph(r.icon),
          caption: String(r.caption || ''),
          message: String(r.message || '')
        };
      });
  }

  /** First ok caption for chill pill, else ''. */
  function firstOkQuotaCaption(rows) {
    if (!Array.isArray(rows)) return '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r) continue;
      if (String(r.status || '').toLowerCase() === 'ok' && r.caption) {
        return String(r.caption);
      }
    }
    return '';
  }

  var api = {
    formatResetCountdown: formatResetCountdown,
    primaryResetAt: primaryResetAt,
    windowQuotaLabel: windowQuotaLabel,
    FRESH_STALE_MS: FRESH_STALE_MS,
    quotasFreshnessAge: quotasFreshnessAge,
    quotaIconGlyph: quotaIconGlyph,
    providerQuotaDropdownRows: providerQuotaDropdownRows,
    firstOkQuotaCaption: firstOkQuotaCaption
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.OneToneUsageFormat = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
