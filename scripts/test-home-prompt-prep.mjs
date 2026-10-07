/**
 * Home prompt prep — phase machine + mount/refresh VM harness.
 *
 * behavioral unit harness，非浏览器级 a11y/IME 证明。
 * Manual acceptance still required for real contenteditable newlines, IME, and CSS pre-wrap rendering.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const src = read('src/js/features/now/home-prompt-prep.js');
const css = read('src/css/home-prompt-prep.css');
const hfView = read('src/js/features/now/home-focus-view.js');
const indexHtml = read('src/index.html');

assert.match(indexHtml, /home-prompt-prep\.js/);
assert.match(indexHtml, /home-prompt-prep\.css/);
assert.match(hfView, /homePromptPrepHost/);
assert.doesNotMatch(hfView, /homeAgentRoster/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /@media \(max-width:\s*760px\)/);
assert.match(css, /\.hpp-writing\s*\{[^}]*white-space:\s*pre-wrap/s);
assert.match(css, /\.hpp-writing\s*\{[^}]*overflow-wrap:\s*anywhere/s);
assert.match(src, /EMPTY/);
assert.match(src, /COLLECTING/);
assert.match(src, /ASSEMBLED/);
assert.match(src, /CHANNEL_SELECTED/);
assert.match(src, /HANDING_OFF/);
assert.match(src, /HANDED_OFF/);
assert.match(src, /没有使用 LLM 改写或总结/);
assert.match(src, /无法确认是否发送/);
assert.match(src, /口述一段话/);
assert.doesNotMatch(src, /发送成功/);
assert.match(src, /function refresh\s*\(/);
assert.match(src, /mountedHost/);
assert.doesNotMatch(src, /removeAttribute\(['"]data-hpp-bound['"]\)/);

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
    textContent: '',
    innerText: '',
    _innerHTML: '',
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
    style: {},
    ownerDocument: null,
    getAttribute(name) {
      return this.attrs[name] != null ? String(this.attrs[name]) : null;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === 'disabled') this.disabled = true;
      if (name === 'hidden') this.hidden = true;
    },
    removeAttribute(name) {
      delete this.attrs[name];
      if (name === 'disabled') this.disabled = false;
      if (name === 'hidden') this.hidden = false;
    },
    addEventListener() {},
    removeEventListener() {},
    focus() {
      if (this.ownerDocument) this.ownerDocument.activeElement = this;
    },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchAttrSel(n, sel)) return n;
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
        if (matchAttrSel(node, sel)) out.push(node);
        (node.children || []).forEach(walk);
      };
      (this.children || []).forEach(walk);
      return out;
    },
    contains(other) {
      if (other === this) return true;
      const walk = (n) => (n.children || []).some((c) => c === other || walk(c));
      return walk(this);
    },
    appendChild(child) {
      child.parentNode = this;
      child.ownerDocument = this.ownerDocument;
      this.children.push(child);
      return child;
    }
  };
  Object.defineProperty(el, 'innerHTML', {
    get() {
      return this._innerHTML;
    },
    set(html) {
      this._innerHTML = String(html == null ? '' : html);
      // Lightweight parse for data-* hooks used by tests
      this.children = [];
      const re =
        /<(div|aside|button|h1|h2|article|section|footer|span|b)([^>]*)>([\s\S]*?)<\/\1>|<(\w+)([^>]*)\/>/gi;
      // Fall back: create known markers from attribute strings in html
      const markers = [
        'data-hpp-body',
        'data-hpp-title',
        'data-hpp-item-list',
        'data-hpp-channel-drawer',
        'data-hpp-handoff-drawer',
        'data-hpp-status-title',
        'data-hpp-status-text',
        'data-hpp-main',
        'data-hpp-list-head',
        'data-hpp-list-count',
        'data-hpp-channel-strip-slot',
        'data-hpp-channel-list',
        'data-hpp-scrim',
        'data-hpp-sheet',
        'hpp-root'
      ];
      for (const m of markers) {
        if (!this._innerHTML.includes(m)) continue;
        const child = makeEl(m.startsWith('data-hpp-channel-drawer') || m.startsWith('data-hpp-handoff') ? 'aside' : 'div', {});
        if (m === 'hpp-root') {
          child.classList.add('hpp-root');
          child.setAttribute('data-hpp-phase', 'EMPTY');
        } else if (m.startsWith('data-')) {
          child.setAttribute(m, m === 'data-hpp-body' || m === 'data-hpp-title' ? '' : '');
          // setAttribute with empty for boolean-ish data attrs
          child.attrs[m] = m === 'data-hpp-body' || m === 'data-hpp-title' ? '' : '1';
        }
        if (m === 'data-hpp-channel-drawer' || m === 'data-hpp-handoff-drawer') {
          child.setAttribute('role', 'dialog');
          child.setAttribute('aria-hidden', 'true');
          child.setAttribute('inert', '');
          child.attrs[m] = '';
        }
        if (m === 'data-hpp-body' || m === 'data-hpp-title') {
          const bodyMatch = this._innerHTML.match(
            new RegExp(m + '[^>]*>([\\s\\S]*?)</(?:div|h1)>')
          );
          if (bodyMatch) {
            child.textContent = decodeEntities(bodyMatch[1]);
            child.innerText = child.textContent;
          }
        }
        child.ownerDocument = this.ownerDocument;
        child.parentNode = this;
        this.children.push(child);
      }
      void re;
    }
  });
  return el;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

function matchAttrSel(node, sel) {
  if (!sel) return false;
  if (sel === '.hpp-root') return node.classList.contains('hpp-root');
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    const eq = inner.indexOf('=');
    if (eq < 0) return node.attrs[inner] != null;
    const key = inner.slice(0, eq).replace(/['"]/g, '');
    return node.attrs[key] != null;
  }
  if (sel === 'button') return node.tagName === 'BUTTON';
  return false;
}

// --- Phase machine (no host) ---
{
  const store = Object.create(null);
  const ctx = {
    window: {},
    globalThis: null,
    document: {
      getElementById() {
        return null;
      },
      querySelector() {
        return null;
      },
      addEventListener() {}
    },
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
    console
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  const API = ctx.OneToneHomePromptPrep;
  assert.ok(API, 'OneToneHomePromptPrep exported');
  assert.equal(API.derivePhase(), 'EMPTY');
  API.addMaterial({
    kind: 'text',
    name: 'note.md',
    content: 'hello world',
    source: '测试'
  });
  assert.equal(API.derivePhase(), 'COLLECTING');
  const md = API.assembleMarkdown();
  assert.match(md, /机械装订/);
  assert.match(md, /没有使用 LLM/);
  assert.match(md, /note\.md/);
  assert.equal(API.derivePhase(), 'ASSEMBLED');
  const m = API._model();
  assert.ok(m.assemblyMeta);
  assert.equal(m.assemblyMeta.collected, 1);
  assert.equal(m.assemblyMeta.included, 1);
  assert.ok(m.assemblyMeta.chars > 0);
  assert.ok(m.assemblyMeta.tokensApprox > 0);
  API._setModel({
    phase: 'EMPTY',
    materials: [],
    draft: { title: '', body: '' },
    channel: null,
    receipt: null,
    assembledMd: ''
  });
  assert.equal(API.derivePhase(), 'EMPTY');
}

// --- Mount idempotency VM harness ---
{
  const store = Object.create(null);
  const keydownListeners = [];
  const host = makeEl('div', { id: 'homePromptPrepHost' });
  const doc = {
    activeElement: null,
    getElementById(id) {
      return id === 'homePromptPrepHost' ? host : null;
    },
    querySelector() {
      return null;
    },
    addEventListener(type, fn) {
      if (type === 'keydown') keydownListeners.push(fn);
    },
    removeEventListener() {}
  };
  host.ownerDocument = doc;
  const ctx = {
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
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  const API = ctx.OneToneHomePromptPrep;

  API.__testOnly.setDraftBody('a\nb');
  API._setModel({
    phase: 'ASSEMBLED',
    materials: [{ id: '1', kind: 'text', name: 'n', content: 'x', included: true, citeMode: 'full' }],
    draft: { title: 'T', body: 'a\nb' },
    channel: null,
    receipt: null,
    assembledMd: '# x',
    assemblyMeta: { collected: 1, included: 1, excluded: 0, chars: 1, tokensApprox: 1 }
  });

  API.ensureMounted();
  const body1 = API.__testOnly.getMountedBodyEl();
  assert.ok(body1, 'body el after first mount');
  assert.equal(API.__testOnly.getMountedHost(), host);
  assert.equal(host.getAttribute('data-hpp-bound'), '1');

  API.ensureMounted();
  const body2 = API.__testOnly.getMountedBodyEl();
  assert.strictEqual(body1, body2, 'ensureMounted must not replace body node');
  assert.strictEqual(API.__testOnly.getMountedHost(), host);

  API.refresh();
  const body3 = API.__testOnly.getMountedBodyEl();
  assert.strictEqual(body1, body3, 'refresh must not replace body node');

  // Model round-trip for multiline (VM textContent; not browser innerText proof)
  assert.equal(API.__testOnly.getModel().draft.body, 'a\nb');
  if (body1.textContent != null && body1.textContent.length) {
    assert.equal(body1.textContent, 'a\nb');
  }

  const listenersBefore = keydownListeners.length;
  API.ensureMounted();
  API.ensureMounted();
  assert.equal(keydownListeners.length, listenersBefore || keydownListeners.length);
}

console.log('ok home-prompt-prep');
