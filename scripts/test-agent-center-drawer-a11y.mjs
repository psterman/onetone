/**
 * Agent Center narrow drawer a11y: name, focus trap, Escape, restore, no stacked listeners.
 * Run: node scripts/test-agent-center-drawer-a11y.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const js = read('src/js/features/agent/agent-center.js');
const acceptanceJs = read('src/js/features/agent/agent-control-acceptance.js');

// --- Source contracts ---
assert.match(js, /aria-modal="true"/);
assert.match(js, /\binert\b/);
assert.match(js, /name="ac-drawer-search"/);
assert.match(js, /autocomplete="off"/);
assert.match(js, /escapeAttr\(t\('drawerSearch'\)\)/);
assert.match(js, /function handleDrawerKeydown/);
assert.match(js, /function openDrawer/);
assert.match(js, /function closeDrawer/);
assert.match(js, /drawerKeysBound/);
assert.match(js, /openDrawer:\s*openDrawer/);
assert.match(js, /closeDrawer:\s*closeDrawer/);
assert.match(js, /handleDrawerKeydown:\s*handleDrawerKeydown/);
assert.doesNotMatch(js, /listenerCount|getListenerCount|drawerListenerCount/);

// Drawer markup fragment only — do not scan unrelated UI for tabindex.
{
  const drawerIdx = js.indexOf('id="acDrawer"');
  assert.ok(drawerIdx >= 0, 'acDrawer markup present');
  const drawerChunk = js.slice(drawerIdx, drawerIdx + 900);
  assert.match(drawerChunk, /ac-drawer-search/);
  assert.doesNotMatch(drawerChunk, /tabindex\s*=\s*["'][1-9]/);
}

function makeEl(tag, attrs) {
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    attrs: Object.assign({}, attrs || {}),
    children: [],
    parentNode: null,
    isConnected: true,
    disabled: !!(attrs && attrs.disabled),
    hidden: !!(attrs && attrs.hidden),
    classList: {
      _s: new Set(),
      add(c) {
        this._s.add(c);
      },
      remove(c) {
        this._s.delete(c);
      },
      contains(c) {
        return this._s.has(c);
      },
      toggle(c, force) {
        if (force === true) this._s.add(c);
        else if (force === false) this._s.delete(c);
        else if (this._s.has(c)) this._s.delete(c);
        else this._s.add(c);
      }
    },
    style: {},
    focused: false,
    offsetParent: {},
    ownerDocument: null,
    getAttribute(name) {
      if (name === 'tabindex' || name === 'tabIndex') return this.attrs.tabindex ?? this.attrs.tabIndex ?? null;
      return this.attrs[name] != null ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'disabled') this.disabled = true;
      if (name === 'hidden') this.hidden = true;
      if (name === 'inert') this.attrs.inert = '';
    },
    removeAttribute(name) {
      delete this.attrs[name];
      if (name === 'disabled') this.disabled = false;
      if (name === 'hidden') this.hidden = false;
      if (name === 'inert') delete this.attrs.inert;
    },
    focus() {
      this.focused = true;
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    },
    blur() {
      this.focused = false;
    },
    closest(sel) {
      if (sel === '[data-ac-picker]' && this.attrs['data-ac-picker']) return this;
      if (sel === '[data-ac-drawer-close]' && this.attrs['data-ac-drawer-close']) return this;
      if (sel === '[data-ac-search]' && this.attrs['data-ac-search'] != null) return this;
      return null;
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        if (!node || node.nodeType !== 1) return;
        if (matchSel(node, sel)) out.push(node);
        (node.children || []).forEach(walk);
      };
      (this.children || []).forEach(walk);
      if (matchSel(this, sel)) out.unshift(this);
      return out;
    },
    contains(other) {
      if (other === this) return true;
      const walk = (n) => {
        if (n === other) return true;
        return (n.children || []).some(walk);
      };
      return (this.children || []).some(walk);
    },
    appendChild(child) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
      return child;
    },
    getClientRects() {
      return this.hidden ? [] : [{ width: 1, height: 1 }];
    }
  };
  if (attrs && attrs.class) {
    String(attrs.class)
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => el.classList.add(c));
  }
  return el;
}

function matchSel(node, sel) {
  if (!sel) return false;
  if (sel === '.ac-drawer-panel') return node.classList.contains('ac-drawer-panel');
  if (sel === '[data-ac-search]') return node.attrs['data-ac-search'] != null;
  if (sel === '[data-ac-picker]') return node.attrs['data-ac-picker'] != null;
  if (sel === 'button') return node.tagName.toLowerCase() === 'button';
  const tag = node.tagName.toLowerCase();
  // Compound focusable selector used by getDrawerFocusables
  if (sel.includes('button:not([disabled])') || sel.includes('input:not([disabled])')) {
    if (tag === 'button' && !node.disabled) return true;
    if (tag === 'input' && !node.disabled) return true;
    if (tag === 'select' && !node.disabled) return true;
    if (tag === 'textarea' && !node.disabled) return true;
    if (node.getAttribute('tabindex') != null) return true;
  }
  return false;
}

function buildDrawerDom({ withSearch = true, extraButtons = 1, disabledBtn = false } = {}) {
  const drawer = makeEl('div', {
    id: 'acDrawer',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-hidden': 'true',
    inert: '',
    class: 'ac-drawer',
    'aria-label': '选择 Agent'
  });
  const backdrop = makeEl('div', { class: 'ac-drawer-backdrop', 'data-ac-drawer-close': '1' });
  const panel = makeEl('div', { class: 'ac-drawer-panel' });
  drawer.appendChild(backdrop);
  drawer.appendChild(panel);
  let search = null;
  if (withSearch) {
    search = makeEl('input', {
      class: 'ac-drawer-search',
      'data-ac-search': '',
      type: 'search',
      name: 'ac-drawer-search',
      autocomplete: 'off',
      'aria-label': '搜索 Agent',
      placeholder: '搜索 Agent'
    });
    panel.appendChild(search);
  }
  for (let i = 0; i < extraButtons; i++) {
    const b = makeEl('button', {
      type: 'button',
      'data-agent-id': 'a' + i,
      disabled: disabledBtn && i === 0 ? '' : undefined
    });
    if (disabledBtn && i === 0) b.disabled = true;
    panel.appendChild(b);
  }
  const hidden = makeEl('button', { type: 'button', hidden: '' });
  hidden.hidden = true;
  panel.appendChild(hidden);
  const neg = makeEl('button', { type: 'button', tabindex: '-1' });
  panel.appendChild(neg);
  return { drawer, panel, search };
}

function loadAc() {
  const keydownListeners = [];
  const doc = {
    documentElement: { lang: 'zh' },
    hidden: false,
    body: makeEl('body', {}),
    activeElement: null,
    getElementById(id) {
      if (id === 'acDrawer') return this._drawer || null;
      if (id === 'workHost') return this._host || null;
      return null;
    },
    querySelector(sel) {
      if (sel === '[data-ac-picker]') return this._picker || null;
      return null;
    },
    addEventListener(type, fn) {
      if (type === 'keydown') keydownListeners.push(fn);
    },
    removeEventListener() {},
    createElement(tag) {
      return makeEl(tag, {});
    }
  };
  doc.body.ownerDocument = doc;
  doc.defaultView = {
    getComputedStyle(el) {
      return {
        visibility: el.hidden ? 'hidden' : 'visible',
        display: el.hidden ? 'none' : 'block'
      };
    }
  };

  const sandbox = {
    window: {},
    console,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Date,
    Math,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    Error,
    Promise,
    document: doc,
    HTMLElement: function HTMLElement() {}
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(acceptanceJs, sandbox);
  vm.runInNewContext(js, sandbox);
  const AC = sandbox.OneToneAgentCenter;
  assert.ok(AC);
  return { AC, doc, keydownListeners, sandbox };
}

{
  const { AC, doc, keydownListeners } = loadAc();
  const picker = makeEl('button', { type: 'button', 'data-ac-picker': '1' });
  picker.ownerDocument = doc;
  picker.isConnected = true;
  doc._picker = picker;
  doc.activeElement = picker;

  const { drawer, search } = buildDrawerDom({ withSearch: true, extraButtons: 2 });
  drawer.ownerDocument = doc;
  search.ownerDocument = doc;
  drawer.children.forEach((c) => {
    c.ownerDocument = doc;
    (c.children || []).forEach((x) => (x.ownerDocument = doc));
  });
  doc._drawer = drawer;
  doc.body.appendChild(drawer);

  assert.equal(search.getAttribute('aria-label'), '搜索 Agent');
  assert.equal(search.getAttribute('name'), 'ac-drawer-search');
  assert.equal(search.getAttribute('autocomplete'), 'off');

  // Open → focus search
  AC.__test.openDrawer();
  assert.equal(AC._state.drawerOpen, true);
  assert.equal(drawer.getAttribute('aria-hidden'), 'false');
  assert.equal(drawer.attrs.inert, undefined);
  assert.equal(doc.activeElement, search);

  // Tab from last wraps to first
  const focusables = [search].concat(
    drawer.querySelectorAll('button').filter((b) => !b.disabled && !b.hidden && b.getAttribute('tabindex') !== '-1')
  );
  // Use production trap via handleDrawerKeydown
  const buttons = drawer
    .querySelector('.ac-drawer-panel')
    .children.filter((c) => c.tagName === 'BUTTON' && !c.disabled && !c.hidden && c.getAttribute('tabindex') !== '-1');
  assert.ok(buttons.length >= 1);
  const lastBtn = buttons[buttons.length - 1];
  doc.activeElement = lastBtn;
  const tabEv = {
    key: 'Tab',
    shiftKey: false,
    isComposing: false,
    keyCode: 9,
    preventDefault() {
      this.prevented = true;
    },
    prevented: false
  };
  AC.__test.handleDrawerKeydown(tabEv);
  assert.equal(tabEv.prevented, true);
  assert.equal(doc.activeElement, search);

  // Shift+Tab from search → last
  doc.activeElement = search;
  const shiftEv = {
    key: 'Tab',
    shiftKey: true,
    isComposing: false,
    keyCode: 9,
    preventDefault() {
      this.prevented = true;
    },
    prevented: false
  };
  AC.__test.handleDrawerKeydown(shiftEv);
  assert.equal(shiftEv.prevented, true);
  assert.equal(doc.activeElement, lastBtn);

  // Escape closes + restores picker
  const esc = {
    key: 'Escape',
    isComposing: false,
    preventDefault() {
      this.prevented = true;
    },
    prevented: false
  };
  AC.__test.handleDrawerKeydown(esc);
  assert.equal(AC._state.drawerOpen, false);
  assert.equal(drawer.getAttribute('aria-hidden'), 'true');
  assert.ok(drawer.attrs.inert != null);
  assert.equal(doc.activeElement, picker);

  // Escape when closed does not throw / does not steal
  doc.activeElement = picker;
  AC.__test.handleDrawerKeydown({
    key: 'Escape',
    isComposing: false,
    preventDefault() {
      throw new Error('should not prevent when closed');
    }
  });

  // Composition ignored
  AC.__test.openDrawer();
  AC.__test.handleDrawerKeydown({
    key: 'Escape',
    isComposing: true,
    preventDefault() {
      throw new Error('composition must be ignored');
    }
  });
  assert.equal(AC._state.drawerOpen, true);
  AC.__test.closeDrawer();

  // Idempotent close
  AC.__test.closeDrawer();
  AC.__test.closeDrawer();
  assert.equal(AC._state.drawerOpen, false);

  // Listener bound once across remount-style ensure
  const before = keydownListeners.length;
  AC.__test.openDrawer();
  AC.__test.closeDrawer();
  // mount path calls ensureDrawerKeysBound again — still one
  assert.equal(keydownListeners.length, before);
  assert.equal(keydownListeners.length, 1);
}

// Single focusable: Tab stays
{
  const { AC, doc } = loadAc();
  const picker = makeEl('button', { type: 'button', 'data-ac-picker': '1' });
  picker.ownerDocument = doc;
  doc._picker = picker;
  doc.activeElement = picker;
  const { drawer, search } = buildDrawerDom({ withSearch: true, extraButtons: 0 });
  // remove non-focusable extras for this case — rebuild minimal
  const panel = drawer.querySelector('.ac-drawer-panel');
  panel.children = [search];
  search.parentNode = panel;
  search.ownerDocument = doc;
  drawer.ownerDocument = doc;
  doc._drawer = drawer;
  AC.__test.openDrawer();
  doc.activeElement = search;
  const tabEv = {
    key: 'Tab',
    shiftKey: false,
    isComposing: false,
    preventDefault() {
      this.prevented = true;
    },
    prevented: false
  };
  AC.__test.handleDrawerKeydown(tabEv);
  assert.equal(doc.activeElement, search);
  const shiftEv = {
    key: 'Tab',
    shiftKey: true,
    isComposing: false,
    preventDefault() {
      this.prevented = true;
    },
    prevented: false
  };
  AC.__test.handleDrawerKeydown(shiftEv);
  assert.equal(doc.activeElement, search);
  AC.__test.closeDrawer();
}

// Zero focusables: no throw
{
  const { AC, doc } = loadAc();
  const picker = makeEl('button', { type: 'button', 'data-ac-picker': '1' });
  picker.ownerDocument = doc;
  doc._picker = picker;
  doc.activeElement = picker;
  const { drawer } = buildDrawerDom({ withSearch: false, extraButtons: 0 });
  const panel = drawer.querySelector('.ac-drawer-panel');
  panel.children = [];
  drawer.ownerDocument = doc;
  doc._drawer = drawer;
  assert.doesNotThrow(() => AC.__test.openDrawer());
  assert.doesNotThrow(() =>
    AC.__test.handleDrawerKeydown({
      key: 'Tab',
      shiftKey: false,
      isComposing: false,
      preventDefault() {}
    })
  );
  AC.__test.closeDrawer();
}

// Stale disconnect restore → picker fallback
{
  const { AC, doc } = loadAc();
  const stale = makeEl('button', { type: 'button', id: 'stale' });
  stale.ownerDocument = doc;
  stale.isConnected = false;
  const picker = makeEl('button', { type: 'button', 'data-ac-picker': '1' });
  picker.ownerDocument = doc;
  picker.isConnected = true;
  doc._picker = picker;
  doc.activeElement = stale;
  const { drawer, search } = buildDrawerDom();
  drawer.ownerDocument = doc;
  search.ownerDocument = doc;
  doc._drawer = drawer;
  AC.__test.openDrawer();
  // force return focus to disconnected
  AC.__test.closeDrawer();
  // reopen with connected picker as active
  doc.activeElement = picker;
  AC.__test.openDrawer();
  AC.__test.closeDrawer();
  assert.equal(doc.activeElement, picker);
}

console.log('ok test-agent-center-drawer-a11y');
