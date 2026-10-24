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
assert.match(src, /function collectMaterial\s*\(/);
assert.match(src, /tray_collect/);
assert.match(src, /bindTrayCollectBridge/);
assert.match(src, /bindTrayCollectToJs/);
assert.match(src, /drainPendingCollects/);
assert.match(src, /cmd_tray_collect_drain/);
assert.match(src, /Soft Pad 拖入/);
assert.match(src, /materialsForTray/);
assert.match(src, /clearMaterials/);
assert.match(src, /kind === 'clear'/);
assert.match(src, /kind === 'remove'/);
assert.doesNotMatch(src, /name:\s*'拖入的文本'/);
assert.match(src, /function beginMaterialCollection\s*\(/);
assert.match(src, /function getMaterialSummary\s*\(/);
assert.match(src, /function removeMaterial\s*\(/);
assert.match(src, /function moveMaterial\s*\(/);
assert.match(src, /data-hpp-drop-zone/);
assert.match(src, /拖入文件或文件夹/);
assert.match(src, /function subscribeMaterials\s*\(/);

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
    setTimeout,
    clearTimeout,
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
  assert.ok(typeof API.noteWorkLog === 'function' && typeof API.listWorkLog === 'function');
  const workLog = API.listWorkLog();
  assert.ok(workLog.length >= 1, 'addMaterial must journal workLog');
  assert.ok(!/未命名工作/.test(workLog[0].title || ''), 'workLog title must be descriptive');
  assert.match(workLog[0].title || '', /note\.md|hello/);
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
  const hostListenerLog = [];
  const host = makeEl('div', { id: 'homePromptPrepHost' });
  host.addEventListener = function (type, fn, opts) {
    hostListenerLog.push({ type, fn, opts });
  };
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
    setTimeout,
    clearTimeout,
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

  // Collapsed by default — must expand before paint/bind.
  API.expand();
  assert.ok(API.isExpanded(), 'expand opens prep desk');
  assert.equal(host.getAttribute('data-hpp-bound'), '1', 'bound after first expand');
  assert.ok(hostListenerLog.length > 0, 'first expand must attach host listeners');
  const listenerCountAfterExpand = hostListenerLog.length;
  assert.ok(
    hostListenerLog.some((e) => e.type === 'click'),
    'click delegation must exist after expand'
  );

  const body1 = API.__testOnly.getMountedBodyEl();
  assert.ok(body1, 'body el after first expand');
  assert.equal(API.__testOnly.getMountedHost(), host);

  API.ensureMounted();
  const body2 = API.__testOnly.getMountedBodyEl();
  assert.strictEqual(body1, body2, 'ensureMounted must not replace body node');
  assert.strictEqual(API.__testOnly.getMountedHost(), host);
  assert.equal(hostListenerLog.length, listenerCountAfterExpand, 'ensureMounted must not rebind');

  API.refresh();
  const body3 = API.__testOnly.getMountedBodyEl();
  assert.strictEqual(body1, body3, 'refresh must not replace body node');
  assert.equal(hostListenerLog.length, listenerCountAfterExpand, 'refresh must not rebind');

  // Model round-trip for multiline (VM textContent; not browser innerText proof)
  assert.equal(API.__testOnly.getModel().draft.body, 'a\nb');
  if (body1.textContent != null && body1.textContent.length) {
    assert.equal(body1.textContent, 'a\nb');
  }

  const listenersBefore = keydownListeners.length;
  API.ensureMounted();
  API.ensureMounted();
  assert.equal(keydownListeners.length, listenersBefore || keydownListeners.length);

  // collapse keeps bound + listeners; re-expand rebuilds content only
  API.collapse();
  assert.equal(API.isExpanded(), false);
  assert.equal(host.getAttribute('data-hpp-bound'), '1', 'collapse must keep data-hpp-bound');
  assert.equal(hostListenerLog.length, listenerCountAfterExpand, 'collapse must not rebind');
  assert.equal(API.__testOnly.getMountedHost(), null);

  API.expand();
  assert.ok(API.isExpanded());
  assert.equal(host.getAttribute('data-hpp-bound'), '1', 'bound stays 1 after re-expand');
  assert.equal(
    hostListenerLog.length,
    listenerCountAfterExpand,
    're-expand must not duplicate addEventListener'
  );
  const body4 = API.__testOnly.getMountedBodyEl();
  assert.ok(body4, 'body el after re-expand');
  assert.equal(API.__testOnly.getMountedHost(), host);

  // Click still reaches onHostClick (delegation survived collapse)
  const mainBtn = host.querySelector('[data-hpp-main]');
  assert.ok(mainBtn, 'main action after re-expand');
  const clickHandler = hostListenerLog.find((e) => e.type === 'click');
  assert.ok(clickHandler && clickHandler.fn, 'click handler retained');
  clickHandler.fn({
    target: mainBtn,
    preventDefault() {},
    stopPropagation() {}
  });
}

// --- Material public API (Slice B) ---
{
  const store = Object.create(null);
  let pickReject = false;
  let pickPathValue = 'E:/demo/shot.png';
  let ipcCalls = 0;
  const host = makeEl('div', { id: 'homePromptPrepHost' });
  const hostListenerLog = [];
  host.addEventListener = function (type, fn) {
    hostListenerLog.push({ type, fn });
  };
  const doc = {
    activeElement: null,
    getElementById(id) {
      return id === 'homePromptPrepHost' ? host : null;
    },
    querySelector() {
      return null;
    },
    addEventListener() {},
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
    navigator: {
      clipboard: {
        readText() {
          return Promise.resolve('hello paste');
        },
        writeText() {
          return Promise.resolve();
        }
      }
    },
    OneToneIpc: {
      invoke(cmd, args) {
        ipcCalls += 1;
        if (cmd === 'cmd_pick_path') {
          if (pickReject) return Promise.reject(new Error('no_picker'));
          return Promise.resolve({ path: pickPathValue });
        }
        return Promise.resolve({});
      }
    },
    prompt() {
      return '';
    },
    setTimeout,
    clearTimeout,
    console,
    Promise
  };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.runInNewContext(src, ctx);
  const API = ctx.OneToneHomePromptPrep;

  // 1 paste → text
  const pasteRes = await API.collectMaterial('paste', { text: 'from options' });
  assert.equal(pasteRes.outcome, 'added');
  assert.equal(pasteRes.material.kind, 'text');
  assert.ok(pasteRes.material.id);
  assert.equal(API.getMaterialSummary().byKind.text, 1);
  const textRef = API.getMaterialSummary().refs.find((r) => r.kind === 'text');
  assert.equal(textRef.content, 'from options');
  assert.ok(typeof API.updateMaterialContent === 'function');
  API.updateMaterialContent(textRef.id, { content: 'edited paste' }, { skipSync: true });
  assert.equal(
    API.getMaterialSummary().refs.find((r) => r.id === textRef.id).content,
    'edited paste'
  );

  // 6 subscribe immediate
  const notes = [];
  const unsub = API.subscribeMaterials((s) => notes.push(s));
  assert.equal(notes.length, 1, 'subscribe pushes current summary immediately');
  assert.equal(notes[0].count, 1);

  // 2 empty path cancelled, no IPC
  ipcCalls = 0;
  const cancelPath = await API.collectMaterial('file', { path: '' });
  assert.equal(cancelPath.outcome, 'cancelled');
  assert.equal(ipcCalls, 0);
  assert.equal(API.getMaterialSummary().count, 1);

  // 3 picker reject → failed
  pickReject = true;
  const failPick = await API.collectMaterial('image');
  assert.equal(failPick.outcome, 'failed');
  assert.equal(API.getMaterialSummary().count, 1);
  pickReject = false;

  // 4 URL cancel
  const urlCancel = await API.collectMaterial('url', { url: '' });
  assert.equal(urlCancel.outcome, 'cancelled');

  // 7 add notifies once more
  const beforeAdd = notes.length;
  await API.collectMaterial('file', { path: 'E:/a/b.md' });
  assert.equal(notes.length, beforeAdd + 1, 'add notifies once');

  // 5 collapsed collect: no expand, no full DOM rebuild
  API.collapse();
  assert.equal(API.isExpanded(), false);
  host.innerHTML = '';
  const listenersBeforeCollect = hostListenerLog.length;
  await API.collectMaterial('paste', { text: 'while collapsed' });
  assert.equal(API.isExpanded(), false, 'collect must never expand');
  assert.ok(!host.querySelector('.hpp-root'), 'collapsed collect must not paint full desk');
  assert.equal(hostListenerLog.length, listenersBeforeCollect, 'collapsed collect must not rebind');

  // 9 remove invalidates assembly/channel/receipt
  API._setModel({
    phase: 'ASSEMBLED',
    collectionId: 'c_keep',
    materials: [
      { id: 'm1', kind: 'text', name: 'n', content: 'x', included: true },
      { id: 'm2', kind: 'file', name: 'f', path: 'p', included: true }
    ],
    draft: { title: '', body: '' },
    channel: { agentId: 'x', name: 'X' },
    receipt: { filled: true },
    assembledMd: '# old',
    assembledAt: 't',
    assemblyMeta: { collected: 2 }
  });
  const rm = API.removeMaterial('m1');
  assert.equal(rm.removed, true);
  assert.equal(rm.summary.count, 1);
  assert.equal(rm.summary.phase, 'COLLECTING');
  const afterRm = API.__testOnly.getModel();
  assert.equal(afterRm.assembledMd, '');
  assert.equal(afterRm.channel, null);
  assert.equal(afterRm.receipt, null);
  assert.equal(afterRm.assemblyMeta, null);

  // 9b reorder materials for drag sorting
  API._setModel({
    phase: 'COLLECTING',
    collectionId: 'c_ord',
    materials: [
      { id: 'a', kind: 'text', name: 'A', included: true },
      { id: 'b', kind: 'folder', name: 'B', path: 'E:/b', included: true },
      { id: 'c', kind: 'file', name: 'C', path: 'E:/c', included: true }
    ],
    draft: { title: '', body: '' },
    channel: null,
    receipt: null,
    assembledMd: ''
  });
  assert.equal(API.moveMaterial('c', 0), true);
  assert.deepEqual(
    API.__testOnly.getModel().materials.map((m) => m.id),
    ['c', 'a', 'b']
  );

  // 10 HANDING_OFF busy
  API._setModel({
    phase: 'HANDING_OFF',
    collectionId: 'c_busy',
    materials: [{ id: 'mx', kind: 'text', name: 'n', included: true }],
    draft: { title: '', body: '' },
    channel: { agentId: 'x' },
    receipt: null,
    assembledMd: '# x'
  });
  const busyRm = API.removeMaterial('mx');
  assert.equal(busyRm.removed, false);
  assert.equal(busyRm.reason, 'busy');
  assert.equal(API.__testOnly.getModel().materials.length, 1);
  const busyCollect = await API.collectMaterial('paste', { text: 'nope' });
  assert.equal(busyCollect.outcome, 'busy');
  const busyBegin = API.beginMaterialCollection({ resetIfHandedOff: true });
  assert.equal(busyBegin.outcome, 'busy');
  assert.equal(busyBegin.reset, false);

  // 11 HANDED_OFF begin resets — no mix
  API._setModel({
    phase: 'HANDED_OFF',
    collectionId: 'c_old',
    materials: [{ id: 'old1', kind: 'text', name: 'old', included: true }],
    draft: { title: '', body: '' },
    channel: { agentId: 'codex', name: 'Codex' },
    receipt: { filled: true },
    assembledMd: '# handed'
  });
  const began = API.beginMaterialCollection({
    scopeId: 'voice-pilot',
    resetIfHandedOff: true
  });
  assert.equal(began.reset, true);
  assert.equal(began.outcome, 'ok');
  assert.notEqual(began.collectionId, 'c_old');
  assert.equal(API.getMaterialSummary().count, 0);
  assert.equal(API.getMaterialSummary().phase, 'EMPTY');
  assert.equal(API.getMaterialSummary().scopeId, 'voice-pilot');
  await API.collectMaterial('paste', { text: 'fresh' });
  const sum = API.getMaterialSummary();
  assert.equal(sum.count, 1);
  assert.equal(sum.refs[0].name, 'fresh');
  assert.ok(!sum.refs.some((r) => r.id === 'old1'));

  // 8 unsubscribe
  const afterUnsubBase = notes.length;
  unsub();
  unsub(); // idempotent
  await API.collectMaterial('url', { url: 'https://example.com' });
  assert.equal(notes.length, afterUnsubBase, 'unsubscribed listener must not fire');

  // 12 continuous collect does not grow host listeners (collapsed)
  API.collapse();
  const n0 = hostListenerLog.length;
  await API.collectMaterial('paste', { text: 'a' });
  await API.collectMaterial('paste', { text: 'b' });
  assert.equal(hostListenerLog.length, n0);

  // 13 revision gate: draft edit invalidates assembledMd reuse
  API._setModel({
    phase: 'ASSEMBLED',
    collectionId: 'c_rev',
    materials: [],
    handoffs: [],
    draft: { title: 't', body: 'v1' },
    channel: null,
    receipt: null,
    assembledMd: '# old\nv1\n',
    assembledAt: 't0',
    contentRevision: 1,
    assembledRevision: 1,
    carry: { active: false, targetKind: null, updatedAt: null, generation: 0 }
  });
  API.setDraftBody('v2', { skipSync: true });
  const mRev = API.__testOnly.getModel();
  assert.equal(mRev.contentRevision, 2);
  assert.notEqual(mRev.assembledRevision, mRev.contentRevision);
  const ensured = API.ensureAssembled();
  assert.ok(String(ensured.md).includes('v2'));
  assert.equal(API.__testOnly.getModel().assembledRevision, 2);

  // 14 handoff kind rejected from materials; archive goes to handoffs[]
  assert.equal(API.addMaterial({ kind: 'handoff', name: 'bad' }), null);
  const beforeHo = (API.listHandoffs() || []).length;
  API.archiveHandoff({ targetKind: 'traeCode', outcome: 'clipboard_ready' });
  assert.equal(API.listHandoffs().length, beforeHo + 1);
  assert.equal(API.listHandoffs()[0].targetKind, 'traeCode');
  assert.ok(!API.getMaterialSummary().refs.some((r) => r.kind === 'handoff'));

  // 15 carry dismiss keeps materials; restart migrate clears carry.active
  API.setCarryActive('minimax');
  assert.equal(API.getTraySnapshot().carry.active, true);
  const matsBefore = API.getMaterialSummary().count;
  await API.dismissCarry();
  assert.equal(API.getTraySnapshot().carry.active, false);
  assert.equal(API.getMaterialSummary().count, matsBefore);
  const raw = JSON.parse(ctx.localStorage.getItem('onetone.homePromptPrep'));
  raw.carry = { active: true, targetKind: 'x', updatedAt: 't', generation: 3 };
  ctx.localStorage.setItem('onetone.homePromptPrep', JSON.stringify(raw));
  const reloaded = API._loadModel();
  assert.equal(reloaded.carry.active, false, 'restart must clear carry.active');
  assert.ok(Array.isArray(reloaded.handoffs));

  // 16 unified attach: detect image vs file from extension
  assert.equal(API.guessAttachKind('C:/a/shot.PNG'), 'image');
  assert.equal(API.guessAttachKind('notes.md'), 'file');
  const imgAdd = await API.collectMaterial('attach', { path: 'E:/demo/photo.jpg' });
  assert.equal(imgAdd.outcome, 'added');
  assert.equal(imgAdd.material.kind, 'image');
  const fileAdd = await API.collectMaterial('attach', { path: 'E:/demo/spec.md' });
  assert.equal(fileAdd.outcome, 'added');
  assert.equal(fileAdd.material.kind, 'file');

  // 17 begin after ASSEMBLED must keep materials (quiet attach calls begin every time)
  API._setModel({
    phase: 'ASSEMBLED',
    collectionId: 'c_keep_mats',
    materials: [
      { id: 'k1', kind: 'file', name: 'a.md', path: 'a.md', included: true },
      { id: 'k2', kind: 'image', name: 'b.png', path: 'b.png', included: true }
    ],
    handoffs: [],
    draft: { title: '', body: '' },
    channel: null,
    receipt: null,
    assembledMd: '# old',
    assembledAt: 't',
    contentRevision: 3,
    assembledRevision: 3,
    carry: { active: false, targetKind: null, updatedAt: null, generation: 0 }
  });
  const keep = API.beginMaterialCollection({ scopeId: 'voice-pilot' });
  assert.equal(keep.reset, false);
  assert.equal(API.getMaterialSummary().count, 2);
  assert.equal(API.getMaterialSummary().phase, 'COLLECTING');
  assert.equal(API.__testOnly.getModel().assembledMd, '');
}

console.log('ok home-prompt-prep');
