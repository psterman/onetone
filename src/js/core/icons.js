/**
 * OneTone channel + UI icons — Lucide paths, 14px default.
 * Shared by tray-menu.html, Face3 tray inspector, habit workspace.
 */
(function (global) {
  'use strict';

  var PATHS = {
    voice: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>',
    keys: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="7" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="12" r="1" fill="currentColor" stroke="none"/>',
    softPad: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="8" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="7" r="1" fill="currentColor" stroke="none"/>',
    camera: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><path d="M12 19v4"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    open: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M9 5V3h6v2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    diag: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    quit: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'
  };

  var CHANNEL_ALIASES = {
    voice: 'voice',
    keys: 'keys',
    key: 'keys',
    softpad: 'softPad',
    softPad: 'softPad',
    camera: 'camera',
    cam: 'camera'
  };

  var FILLED = { pause: true, play: true };

  function html(name, opts) {
    opts = opts || {};
    var paths = PATHS[name];
    if (!paths) return '';
    var size = opts.size || 14;
    var cls = opts.className ? ' class="' + opts.className + '"' : '';
    var sw = opts.strokeWidth != null ? opts.strokeWidth : 2;
    if (FILLED[name]) {
      return '<svg' + cls + ' viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="currentColor" aria-hidden="true">' + paths + '</svg>';
    }
    return '<svg' + cls + ' viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';
  }

  function channelHtml(channel, opts) {
    var id = CHANNEL_ALIASES[String(channel || '').trim()] || 'keys';
    return html(id, opts);
  }

  function trayBundle() {
    var out = {};
    Object.keys(PATHS).forEach(function (key) {
      out[key] = html(key, { strokeWidth: 2.2 });
    });
    return out;
  }

  // ponytail: assert known channels resolve
  if (typeof console !== 'undefined' && console.assert) {
    console.assert(channelHtml('voice').indexOf('<svg') === 0, 'OneToneIcons: voice');
    console.assert(channelHtml('key').indexOf('<svg') === 0, 'OneToneIcons: key alias');
  }

  global.OneToneIcons = {
    html: html,
    channelHtml: channelHtml,
    tray: trayBundle(),
    PATHS: PATHS
  };
})(typeof window !== 'undefined' ? window : globalThis);
