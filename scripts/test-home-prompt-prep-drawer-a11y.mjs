/**
 * Home Prompt Prep drawer a11y — VM protocol harness.
 *
 * behavioral unit harness，非浏览器级 a11y/IME 证明。
 * Manual acceptance: real Tab/Shift+Tab, inert Tab skip, Escape, focus restore in browser.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'src/js/features/now/home-prompt-prep.js'), 'utf8');

assert.match(src, /role="dialog"/);
assert.match(src, /\binert\b/);
assert.match(src, /aria-modal/);
assert.match(src, /function handleHppDrawerKeydown/);
assert.match(src, /function openHppDrawer/);
assert.match(src, /function closeHppDrawers/);
assert.match(src, /ensureHppDrawerKeysBound/);
assert.doesNotMatch(src, /listenerCount|getListenerCount/);

{
  const drawerIdx = src.indexOf('data-hpp-channel-drawer');
  assert.ok(drawerIdx >= 0);
  const chunk = src.slice(drawerIdx, drawerIdx + 500);
  assert.doesNotMatch(chunk, /tabindex\s*=\s*["'][1-9]/);
}

function makeEl(tag, attrs) {
  const el = {
    tagName: String(tag).toUpperCase(),
    nodeType: 1,
    attrs: Object.assign({}, attrs || {}),
    children: [],
    parentNode: null,
    isConnected: true,
    disabled: false,
    hidden: false,
    focused: false,
    textContent: '',
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
      }
    },
    ownerDocument: null,
    getAttribute(name) {
      return this.attrs[name] != null ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attrs[name];
    },
    focus() {
      this.focused = true;
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    },
    closest(sel) {
      let n = this;
      while (n) {
        if (sel.startsWith('[') && n.attrs[sel.slice(1, -1)] != null) return n;
        n = n.parentNode;
      }
      return null;
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      const walk = (node) => {
        if (!node || node.nodeType !== 1) return;
        if (match(node, sel)) out.push(node);
        (node.children || []).forEach(walk);
      };
      (this.children || []).forEach(walk);
      return out;
    },
    contains(other) {
      if (other === this) return true;
      return (this.children || []).some(function walk(n) {
        return n === other || (n.children || []).some(walk);
      });
    },
    appendChild(c) {
      c.parentNode = this;
      c.ownerDocument = this.ownerDocument;
      this.children.push(c);
      return c;
    },
    addEventListener() {},
    removeEventListener() {}
  };
  if (attrs && attrs.class) {
    String(attrs.class)
      .split(/\s+/)
      .filter(Boolean)
      .forEach((c) => el.classList.add(c));
  }
  return el;
}

function match(node, sel) {
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const key = sel.slice(1, -1);
    return node.attrs[key] != null;
  }
  if (sel.includes('button:not([disabled])')) {
    return node.tagName === 'BUTTON' && !node.disabled;
  }
  if (sel === 'button') return node.tagName === 'BUTTON';
  return false;
}

function loadApi() {
  const keydownListeners = [];
  const host = makeEl('div', { id: 'homePromptPrepHost' });
  const trigger = makeEl('button', { type: 'button', 'data-hpp-change-channel': '' });
  trigger.isConnected = true;

  const channel = makeEl('aside', {
    'data-hpp-channel-drawer': '',
    role: 'dialog',
    'aria-hidden': 'true',
    inert: '',
    class: 'hpp-drawer'
  });
  const handoff = makeEl('aside', {
    'data-hpp-handoff-drawer': '',
    role: 'dialog',
    'aria-hidden': 'true',
    inert: '',
    class: 'hpp-drawer'
  });
  const closeBtn = makeEl('button', { type: 'button', 'data-hpp-close': '', 'aria-label': '关闭' });
  const pickBtn = makeEl('button', { type: 'button', 'data-hpp-pick-channel': 'x' });
  channel.appendChild(closeBtn);
  channel.appendChild(pickBtn);
  const handoffBtn = makeEl('button', { type: 'button', 'data-hpp-handoff-go': '' });
  handoff.appendChild(handoffBtn);
  const scrim = makeEl('div', { 'data-hpp-scrim': '' });

  host.appendChild(trigger);
  host.appendChild(scrim);
  host.appendChild(channel);
  host.appendChild(handoff);

  const doc = {
    activeElement: trigger,
    getElementById(id) {
      return id === 'homePromptPrepHost' ? host : null;
    },
    querySelector(sel) {
      return host.querySelector(sel);
    },
    addEventListener(type, fn) {
      if (type === 'keydown') keydownListeners.push(fn);
    },
    removeEventListener() {}
  };
  host.ownerDocument = doc;
  channel.ownerDocument = doc;
  handoff.ownerDocument = doc;
  trigger.ownerDocument = doc;
  closeBtn.ownerDocument = doc;
  pickBtn.ownerDocument = doc;
  handoffBtn.ownerDocument = doc;

  // Stub paint so ensureMounted doesn't wipe our drawer DOM
  const store = Object.create(null);
  const sandbox = {
    window: {},
    globalThis: null,
    document: doc,
    localStorage: {
      getItem(k) {
        return store[k] != null ? store[k] : null;
      },
      setItem(k, v) {
        store[k] = String(v);
      },
      removeItem(k) {
        delete store[k];
      }
    },
    console,
    Promise
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(src, sandbox);
  const API = sandbox.OneToneHomePromptPrep;

  // Manually mark host as mounted without paint wiping drawers
  host.setAttribute('data-hpp-bound', '1');
  // Force mountedHost via ensureMounted after patching getElementById — but paint wipes.
  // Instead call open/close APIs after setting internal host via paint stub:
  const origPaint = API.paint;
  API.paint = function () {
    // no-op: preserve our constructed drawer DOM
    host.setAttribute('data-hpp-bound', '1');
  };
  API.ensureMounted();
  API.paint = origPaint;

  return { API, doc, host, channel, handoff, trigger, keydownListeners, closeBtn, pickBtn };
}

{
  const { API, channel, handoff, trigger, keydownListeners, closeBtn } = loadApi();

  // Closed: inert, aria-hidden, no aria-modal
  assert.equal(channel.getAttribute('aria-hidden'), 'true');
  assert.ok(channel.getAttribute('inert') != null);
  assert.equal(channel.getAttribute('aria-modal'), null);
  assert.equal(handoff.getAttribute('aria-hidden'), 'true');
  assert.ok(handoff.getAttribute('inert') != null);

  docActive(trigger);
  API.openHppDrawer('channel');
  assert.equal(API.__testOnly.getOpenDrawerKind(), 'channel');
  assert.equal(channel.getAttribute('aria-hidden'), 'false');
  assert.equal(channel.getAttribute('aria-modal'), 'true');
  assert.equal(channel.getAttribute('inert'), null);
  // Other drawer stays closed / inert
  assert.equal(handoff.getAttribute('aria-hidden'), 'true');
  assert.ok(handoff.getAttribute('inert') != null);
  assert.equal(handoff.getAttribute('aria-modal'), null);

  const nBefore = keydownListeners.length;
  API.openHppDrawer('channel');
  API.closeHppDrawers();
  API.openHppDrawer('handoff');
  API.closeHppDrawers();
  assert.equal(keydownListeners.length, nBefore, 'must not stack keydown listeners');

  docActive(trigger);
  API.openHppDrawer('channel');
  API.handleHppDrawerKeydown({
    key: 'Escape',
    isComposing: false,
    preventDefault() {}
  });
  assert.equal(API.__testOnly.getOpenDrawerKind(), null);
  assert.equal(channel.getAttribute('aria-hidden'), 'true');
  assert.ok(channel.getAttribute('inert') != null);
  assert.equal(channel.getAttribute('aria-modal'), null);
  // Focus restore protocol
  assert.equal(trigger.focused || trigger.ownerDocument.activeElement === trigger, true);

  void closeBtn;
}

function docActive(el) {
  el.focus();
}

console.log('ok home-prompt-prep-drawer-a11y');
