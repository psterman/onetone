/**
 * Interaction smoke for Agent home DataBoard (no Playwright dependency).
 * Exercises mount API: lens, focus, strip→single→overview, ledger honesty.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'prototypes', 'agent-detect-home');

function makeDom() {
  function el(tag) {
    const node = {
      tagName: String(tag || 'div').toUpperCase(),
      attrs: Object.create(null),
      children: [],
      style: {},
      parentNode: null,
      classList: {
        _set: new Set(),
        add(c) { this._set.add(c); node.className = [...this._set].join(' '); },
        remove(c) { this._set.delete(c); node.className = [...this._set].join(' '); },
        toggle(c, force) {
          if (force === true) this.add(c);
          else if (force === false) this.remove(c);
          else if (this._set.has(c)) this.remove(c);
          else this.add(c);
        },
        contains(c) { return this._set.has(c); }
      },
      className: '',
      listeners: Object.create(null),
      get innerHTML() { return node._html || ''; },
      set innerHTML(html) {
        node._html = String(html || '');
        node.children = parseLoose(node._html, node);
      },
      get textContent() {
        return String(node._html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      },
      setAttribute(k, v) { node.attrs[k] = String(v); },
      getAttribute(k) { return node.attrs[k] != null ? node.attrs[k] : null },
      addEventListener(type, fn) {
        (node.listeners[type] || (node.listeners[type] = [])).push(fn);
      },
      click() {
        const list = node.listeners.click || [];
        list.forEach((fn) => fn({ preventDefault() {} }));
      },
      querySelector(sel) {
        return queryAll(node, sel)[0] || null;
      },
      querySelectorAll(sel) {
        return queryAll(node, sel);
      },
      scrollIntoView() {}
    };
    return node;
  }

  function parseLoose(html, parent) {
    const out = [];
    const re = /<([a-zA-Z0-9-]+)([^>]*)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9-]+)([^>]*)\/>/g;
    // Lightweight: extract elements with data-board / id / class via regex on source
    const tagRe = /<([a-zA-Z0-9-]+)([^>]*?)(?:\/>|>)/g;
    let m;
    while ((m = tagRe.exec(html))) {
      const tag = m[1];
      const attrs = m[2] || '';
      const child = el(tag);
      child.parentNode = parent;
      const attrRe = /([:@a-zA-Z0-9_-]+)=["']([^"']*)["']/g;
      let a;
      while ((a = attrRe.exec(attrs))) {
        child.setAttribute(a[1], a[2]);
        if (a[1] === 'class') {
          String(a[2]).split(/\s+/).filter(Boolean).forEach((c) => child.classList.add(c));
        }
      }
      out.push(child);
    }
    return out;
  }

  function matches(node, sel) {
    if (sel.startsWith('#')) return node.getAttribute('id') === sel.slice(1);
    if (sel.startsWith('.')) return node.classList.contains(sel.slice(1));
    if (sel.includes('[')) {
      const m = sel.match(/^([a-zA-Z0-9-]*)\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
      if (!m) return false;
      if (m[1] && node.tagName.toLowerCase() !== m[1].toLowerCase()) return false;
      const val = node.getAttribute(m[2]);
      if (m[3] != null) return val === m[3];
      return val != null;
    }
    return node.tagName.toLowerCase() === sel.toLowerCase();
  }

  function queryAll(rootNode, sel) {
    const parts = sel.trim().split(/\s+/);
    let set = [rootNode];
    for (const part of parts) {
      const next = [];
      for (const n of set) {
        walk(n, (c) => {
          if (matches(c, part)) next.push(c);
        });
      }
      set = next;
    }
    // querySelectorAll on host should not include host itself usually
    return set.filter((n) => n !== rootNode || matches(n, parts[parts.length - 1]));
  }

  function walk(node, fn) {
    (node.children || []).forEach((c) => {
      fn(c);
      walk(c, fn);
    });
  }

  const host = el('div');
  host.setAttribute('id', 'dataBoardHost');
  return { host, el };
}

function loadBoard() {
  const sandbox = { window: {}, globalThis: {}, module: { exports: {} }, exports: {} };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'fixtures.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'board-dto.js'), 'utf8'), sandbox);
  vm.runInNewContext(fs.readFileSync(path.join(dir, 'data-board.js'), 'utf8'), sandbox);
  return {
    F: sandbox.AgentDetectFixtures,
    Dto: sandbox.AgentBoardDto,
    Board: sandbox.AgentDataBoard
  };
}

function clickBoard(host, dataBoard) {
  const btn = host.querySelector(`[data-board="${dataBoard}"]`);
  assert.ok(btn, `missing control ${dataBoard}`);
  // Re-bind: DataBoard binds on each render; our parseLoose creates fresh nodes
  // so we must fire via host's stored handlers by re-query after ensuring bind.
  // DataBoard adds listeners on the parsed children of host — our innerHTML setter
  // recreates children, and DataBoard's bind() attaches to those child objects.
  btn.click();
}

const { F, Dto, Board } = loadBoard();
const { host } = makeDom();
const snap = F.getSnapshot('mixed');
const dto = Dto.projectBoardDto(snap, { focusId: 'cursor' });
let focusLog = [];
const board = Board.mount(host, dto, {
  focusId: 'cursor',
  lens: 'eff',
  onFocus(id) { focusLog.push(id); }
});

assert.match(host.innerHTML, /db-lenses/);
assert.match(host.innerHTML, /目前只有今日/);
assert.match(host.innerHTML, /db-strip/);
assert.ok((host.innerHTML.match(/data-board="lens:/g) || []).length >= 5);

// Switch lens to cost — must not be note-only (KPI / insight change)
clickBoard(host, 'lens:cost');
assert.equal(board.getState().lens, 'cost');
assert.match(host.innerHTML, /可知费用|打开费用账本|费用/);

// Preserve lens when setFocus from Dock
board.setFocus('claude');
assert.equal(board.getState().lens, 'cost');
assert.equal(board.getState().focusId, 'claude');
assert.match(host.innerHTML, /Claude/);

// Strip drill → single
clickBoard(host, 'drill:codex');
assert.equal(board.getState().layout, 'single');
assert.equal(board.getState().focusId, 'codex');
assert.ok(focusLog.includes('codex'));
assert.match(host.innerHTML, /db-crumb|全部 Agent/);
assert.match(host.innerHTML, /db-preview is-open|is-open/);

// Breadcrumb back
clickBoard(host, 'layout:overview');
assert.equal(board.getState().layout, 'overview');

// Ledger
board.setLens('cost');
board.setLayout('ledger');
assert.match(host.innerHTML, /db-ledger|费用账本/);
assert.match(host.innerHTML, /估价不计合计/);
const booked = Dto.ledgerBookedSum(dto.agents);
assert.equal(booked, 0.85);
assert.match(host.innerHTML, /0\.85|\$0\.85|合计/);

// Filter pop
clickBoard(host, 'toggle-filter');
assert.match(host.innerHTML, /data-board="filter:activity"/);
clickBoard(host, 'filter:activity');
assert.equal(board.getState().filter, 'activity');

// CSS gate: no production fixed 3-col tokens
const css = fs.readFileSync(path.join(dir, 'styles.css'), 'utf8');
assert.doesNotMatch(css, /--lens:\s*148px|--preview:\s*300px/);
assert.match(css, /\.db-lenses/);

board.destroy();
assert.equal(host.innerHTML, '');

console.log('smoke-agent-detect-home: DataBoard focus/single/ledger/filter ok');
