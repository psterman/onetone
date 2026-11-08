#!/usr/bin/env node
/** Theme manager + token wiring — persistence, mode/style split, CSS load order. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf8');

function makeDom() {
  const attrs = new Map();
  const picks = [];
  const rootEl = {
    setAttribute(k, v) {
      attrs.set(k, String(v));
    },
    getAttribute(k) {
      return attrs.has(k) ? attrs.get(k) : null;
    },
    style: { setProperty() {} },
  };
  return {
    documentElement: rootEl,
    querySelector() {
      return null;
    },
    querySelectorAll(sel) {
      if (
        sel.includes('data-theme-pick') ||
        sel.includes('data-style-pick') ||
        sel.includes('data-density-pick') ||
        sel.includes('data-ot-theme-pick') ||
        sel.includes('data-ot-style-pick')
      ) {
        return picks;
      }
      return [];
    },
    _attrs: attrs,
    _picks: picks,
  };
}

function loadThemeManager({ matchDark = false, storage = {} } = {}) {
  const store = { ...storage };
  const mediaListeners = [];
  const document = makeDom();
  const localStorage = {
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem(k, v) {
      store[k] = String(v);
    },
    removeItem(k) {
      delete store[k];
    },
  };
  const matchMedia = (q) => {
    const mql = {
      matches: !!matchDark && String(q).includes('prefers-color-scheme: dark'),
      media: q,
      addEventListener(_ev, fn) {
        mediaListeners.push(fn);
      },
      addListener(fn) {
        mediaListeners.push(fn);
      },
      removeEventListener() {},
      removeListener() {},
    };
    return mql;
  };

  const sandbox = {
    window: null,
    globalThis: null,
    document,
    localStorage,
    matchMedia,
    console,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  const src = read('src/js/core/theme-manager.js');
  vm.runInNewContext(src, sandbox, { filename: 'theme-manager.js' });
  assert.ok(sandbox.OneToneTheme, 'OneToneTheme exported');
  return { api: sandbox.OneToneTheme, document, store, mediaListeners, matchMedia, sandbox };
}

// --- persistence ---
{
  const { api, store, document } = loadThemeManager();
  api.setMode('dark');
  const saved = JSON.parse(store.ot_theme_state);
  assert.equal(saved.mode, 'dark');
  assert.equal(store.vp_theme, 'dark', 'mirrors resolved mode to vp_theme');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');

  const again = loadThemeManager({ storage: { ot_theme_state: store.ot_theme_state } });
  assert.equal(again.api.getState().mode, 'dark');
  assert.equal(again.document.documentElement.getAttribute('data-theme'), 'dark');
}

{
  const { api, store, document } = loadThemeManager();
  api.setMode('light');
  assert.equal(JSON.parse(store.ot_theme_state).mode, 'light');
  assert.equal(store.vp_theme, 'light');
  const again = loadThemeManager({ storage: { ot_theme_state: store.ot_theme_state } });
  assert.equal(again.api.getState().mode, 'light');
  assert.equal(again.document.documentElement.getAttribute('data-theme'), 'light');
}

// --- legacy vp_theme migration ---
{
  const { api, document } = loadThemeManager({ storage: { vp_theme: 'dark' } });
  assert.equal(api.getState().mode, 'dark');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(api.getState().style, 'blue');
}

// --- system mode + media listener ---
{
  const dark = loadThemeManager({ matchDark: true });
  dark.api.setMode('system');
  assert.equal(dark.api.getState().mode, 'system');
  assert.equal(dark.document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(dark.store.vp_theme, 'dark');
  assert.ok(dark.mediaListeners.length >= 1, 'subscribes while system');

  const light = loadThemeManager({ matchDark: false });
  light.api.setMode('system');
  assert.equal(light.document.documentElement.getAttribute('data-theme'), 'light');
}

// --- style independent of mode ---
{
  const { api, document } = loadThemeManager();
  api.setMode('dark');
  api.setStyle('graphite');
  assert.equal(api.getState().mode, 'dark');
  assert.equal(api.getState().style, 'graphite');
  assert.equal(document.documentElement.getAttribute('data-theme'), 'dark');
  assert.equal(document.documentElement.getAttribute('data-style'), 'graphite');
  api.setMode('light');
  assert.equal(api.getState().style, 'graphite', 'mode change does not flip style');
  api.setStyle('blue');
  assert.equal(api.getState().mode, 'light', 'style change does not flip mode');
}

// --- density ---
{
  const { api, document } = loadThemeManager();
  api.setDensity('compact');
  assert.equal(api.getState().density, 'compact');
  assert.equal(document.documentElement.getAttribute('data-density'), 'compact');
}

// --- legacy setTheme shim still works via prefs forwarding contract ---
{
  const { api } = loadThemeManager();
  // Simulate AppThemePrefs.setTheme → setMode(light|dark only)
  api.setMode('dark');
  assert.equal(api.resolveMode(api.getState().mode), 'dark');
  api.setMode('light');
  assert.equal(api.resolveMode(api.getState().mode), 'light');
}

// --- CSS / HTML wiring ---
{
  const tokens = read('src/css/theme-tokens.css');
  for (const key of [
    '--ot-bg',
    '--ot-surface',
    '--ot-surface-raised',
    '--ot-text',
    '--ot-text-muted',
    '--ot-border',
    '--ot-accent',
  ]) {
    assert.ok(tokens.includes(key), `theme-tokens missing ${key}`);
  }
  assert.ok(tokens.includes('html[data-theme="dark"]'));
  assert.ok(tokens.includes('html[data-style="graphite"]'));
  assert.ok(tokens.includes('html[data-density="compact"]'));

  const index = read('src/index.html');
  const tokensPos = index.indexOf('css/theme-tokens.css');
  const appPos = index.indexOf('css/app.css');
  assert.ok(tokensPos >= 0 && appPos > tokensPos, 'theme-tokens.css must load before app.css');
  assert.ok(index.includes('js/core/theme-manager.js'));
  assert.ok(index.includes('data-style-pick="blue"'));
  assert.ok(index.includes('data-style-pick="graphite"'));
  assert.ok(!index.includes('data-style-pick="light"'));
  assert.ok(!index.includes('data-style-pick="dark"'));
  assert.ok(index.includes('data-theme-pick="system"'));

  const appCss = read('src/css/app.css');
  assert.ok(appCss.includes('--primary:var(--ot-accent)') || appCss.includes('--primary: var(--ot-accent)'));
  assert.ok(appCss.includes('var(--ot-surface)') || appCss.includes('var(--ot-text)'));

  const wbCss = read('src/css/workbuddy-local-chat.css');
  assert.ok(!wbCss.includes('prefers-color-scheme'));
  assert.ok(wbCss.includes('html[data-theme="dark"]'));
  assert.ok(wbCss.includes('var(--ot-'));

  const wbHtml = read('src/workbuddy-local-chat.html');
  assert.ok(wbHtml.includes('ot_theme_state') || wbHtml.includes('vp_theme'));
  assert.ok(wbHtml.includes('css/theme-tokens.css'));
  assert.ok(wbHtml.includes('data-theme'));

  const prefs = read('src/js/features/settings/app-prefs-bindings.js');
  assert.ok(prefs.includes('setStyle'));
  assert.ok(prefs.includes('setMode'));
  assert.ok(!/data-style-pick[\s\S]{0,200}hooks\.setTheme/.test(prefs), 'style picks must not call setTheme');
}

console.log('ok theme-manager persistence, system mode, tokens, settings split');
