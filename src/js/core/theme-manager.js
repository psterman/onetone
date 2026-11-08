(function (global) {
  'use strict';

  var STORAGE_KEY = 'ot_theme_state';
  var LEGACY_KEY = 'vp_theme';
  var DEFAULT_STATE = { mode: 'light', style: 'blue', density: 'comfortable' };

  var state = {
    mode: DEFAULT_STATE.mode,
    style: DEFAULT_STATE.style,
    density: DEFAULT_STATE.density
  };
  var mediaQuery = null;
  var mediaBound = false;

  function normalizeMode(mode) {
    mode = String(mode || '').trim().toLowerCase();
    if (mode === 'dark' || mode === 'system') return mode;
    return 'light';
  }

  function normalizeStyle(style) {
    style = String(style || '').trim().toLowerCase();
    if (style === 'default') return 'blue';
    if (style === 'graphite') return 'graphite';
    // Legacy style cards used light/dark as fake style ids.
    if (style === 'dark') return 'graphite';
    if (style === 'light') return 'blue';
    return 'blue';
  }

  function normalizeDensity(density) {
    density = String(density || '').trim().toLowerCase();
    return density === 'compact' ? 'compact' : 'comfortable';
  }

  function resolveMode(mode) {
    mode = normalizeMode(mode);
    if (mode !== 'system') return mode;
    try {
      if (global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch (_) {}
    return 'light';
  }

  function cloneState() {
    return { mode: state.mode, style: state.style, density: state.density };
  }

  function readStored() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            mode: normalizeMode(parsed.mode),
            style: normalizeStyle(parsed.style),
            density: normalizeDensity(parsed.density)
          };
        }
      }
    } catch (_) {}
    try {
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === 'dark' || legacy === 'light') {
        return {
          mode: legacy,
          style: DEFAULT_STATE.style,
          density: DEFAULT_STATE.density
        };
      }
    } catch (_) {}
    return {
      mode: DEFAULT_STATE.mode,
      style: DEFAULT_STATE.style,
      density: DEFAULT_STATE.density
    };
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {}
    // Mirror resolved light/dark for overlay windows still reading vp_theme.
    try {
      localStorage.setItem(LEGACY_KEY, resolveMode(state.mode));
    } catch (_) {}
  }

  function syncBrandLogos(resolved) {
    var fav = document.querySelector('link[rel="icon"]');
    if (fav) fav.setAttribute('href', resolved === 'dark' ? 'icon-dark.png' : 'icon-light.png');
  }

  function syncPickUi() {
    document.querySelectorAll('[data-theme-pick]').forEach(function (btn) {
      // Mode picks: light / dark / system match stored mode (not only resolved).
      btn.classList.toggle('is-active', btn.getAttribute('data-theme-pick') === state.mode);
    });
    document.querySelectorAll('[data-ot-theme-pick]').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-ot-theme-pick') === state.mode);
    });
    document.querySelectorAll('[data-style-pick]').forEach(function (btn) {
      btn.classList.toggle('is-active', normalizeStyle(btn.getAttribute('data-style-pick')) === state.style);
    });
    document.querySelectorAll('[data-ot-style-pick]').forEach(function (btn) {
      btn.classList.toggle('is-active', normalizeStyle(btn.getAttribute('data-ot-style-pick')) === state.style);
    });
    document.querySelectorAll('[data-density-pick]').forEach(function (btn) {
      btn.classList.toggle('is-active', normalizeDensity(btn.getAttribute('data-density-pick')) === state.density);
    });
  }

  function ensureMediaListener() {
    if (!global.matchMedia) return;
    if (!mediaQuery) {
      try {
        mediaQuery = global.matchMedia('(prefers-color-scheme: dark)');
      } catch (_) {
        mediaQuery = null;
        return;
      }
    }
    if (state.mode === 'system') {
      if (!mediaBound && mediaQuery) {
        var onChange = function () {
          if (state.mode === 'system') apply();
        };
        if (typeof mediaQuery.addEventListener === 'function') {
          mediaQuery.addEventListener('change', onChange);
        } else if (typeof mediaQuery.addListener === 'function') {
          mediaQuery.addListener(onChange);
        }
        mediaBound = true;
        mediaQuery.__otThemeOnChange = onChange;
      }
    }
  }

  function apply() {
    var resolved = resolveMode(state.mode);
    var root = document.documentElement;
    root.setAttribute('data-theme', resolved);
    root.setAttribute('data-style', state.style);
    root.setAttribute('data-density', state.density);
    syncPickUi();
    syncBrandLogos(resolved);
    persist();
    ensureMediaListener();
    try {
      if (global.chrome && global.chrome.webview && typeof global.chrome.webview.postMessage === 'function') {
        global.chrome.webview.postMessage({ type: 'mvp_sync_theme_backdrop', theme: resolved });
      }
    } catch (_) {}
    if (global.OneToneBasicPanelUi && typeof global.OneToneBasicPanelUi.render === 'function') {
      global.OneToneBasicPanelUi.render();
    }
    return cloneState();
  }

  function load() {
    var stored = readStored();
    state.mode = stored.mode;
    state.style = stored.style;
    state.density = stored.density;
    return apply();
  }

  function setMode(mode) {
    state.mode = normalizeMode(mode);
    return apply();
  }

  function setStyle(style) {
    state.style = normalizeStyle(style);
    return apply();
  }

  function setDensity(density) {
    state.density = normalizeDensity(density);
    return apply();
  }

  function getState() {
    return cloneState();
  }

  // Eager load so early paint after script can pick up saved state.
  try {
    load();
  } catch (_) {
    apply();
  }

  global.OneToneTheme = {
    getState: getState,
    setMode: setMode,
    setStyle: setStyle,
    setDensity: setDensity,
    apply: apply,
    load: load,
    resolveMode: resolveMode,
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_KEY: LEGACY_KEY
  };
})(typeof window !== 'undefined' ? window : globalThis);
