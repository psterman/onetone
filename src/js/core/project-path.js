/**
 * Shared absolute project/workspace path normalization for Home Focus / HA2 send.
 * Single source — do not duplicate strip/accept rules elsewhere.
 */
(function (global) {
  'use strict';

  /**
   * Normalize and accept only absolute filesystem paths.
   * Returns null for blank, relative, or display-name tokens.
   *
   * @param {unknown} raw
   * @returns {string|null}
   */
  function normalizeAbsolutePath(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;

    // Windows extended-length prefixes (PathBuf canonicalize).
    // \\?\C:\repo → C:\repo
    // \\?\UNC\server\share → \\server\share
    if (s.indexOf('\\\\?\\UNC\\') === 0 || s.indexOf('\\\\?\\unc\\') === 0) {
      s = '\\\\' + s.slice(8);
    } else if (s.indexOf('\\\\?\\') === 0) {
      s = s.slice(4);
    } else if (s.indexOf('//?/UNC/') === 0 || s.indexOf('//?/unc/') === 0) {
      s = '//' + s.slice(8);
    } else if (s.indexOf('//?/') === 0) {
      s = s.slice(4);
    }

    s = s.replace(/[\\/]+$/, '');
    if (s.length < 2) return null;

    // Windows drive: C:\… or C:/…
    if (/^[A-Za-z]:[\\/]/.test(s)) return s;

    // UNC: \\server\share or //server/share
    if (/^\\\\[^\\/]+[\\/]/.test(s) || /^\/\/[^\\/]+[\\/]/.test(s)) return s;

    // POSIX absolute
    if (s.charAt(0) === '/' && s.charAt(1) !== '/') return s;

    // Relative (foo/bar), bare tokens (voice-pilot), or incomplete UNC — reject.
    return null;
  }

  /**
   * Compare two paths after normalize (case-insensitive on Windows-like).
   * @param {unknown} a
   * @param {unknown} b
   * @returns {boolean}
   */
  function pathsEqual(a, b) {
    var na = normalizeAbsolutePath(a);
    var nb = normalizeAbsolutePath(b);
    if (!na || !nb) return false;
    var la = na.replace(/\//g, '\\').toLowerCase();
    var lb = nb.replace(/\//g, '\\').toLowerCase();
    return la === lb;
  }

  /**
   * Leaf folder name for dock display.
   * @param {unknown} path
   * @returns {string}
   */
  function pathLeaf(path) {
    var n = normalizeAbsolutePath(path);
    if (!n) return '';
    var parts = n.replace(/[\\/]+$/, '').split(/[\\/]/);
    return parts[parts.length - 1] || n;
  }

  global.OneToneProjectPath = {
    normalizeAbsolutePath: normalizeAbsolutePath,
    pathsEqual: pathsEqual,
    pathLeaf: pathLeaf
  };
})(typeof window !== 'undefined' ? window : globalThis);
