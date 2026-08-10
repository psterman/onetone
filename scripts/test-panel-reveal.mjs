/**
 * Panel reveal controller lifecycle (fake DOM + timers).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

let now = 0;
const timers = new Map();
let nextId = 1;
const rafQueue = [];

function fakeSetTimeout(fn, ms) {
  const id = nextId++;
  timers.set(id, { fn, due: now + (ms || 0) });
  return id;
}
function fakeClearTimeout(id) { timers.delete(id); }
function fakeRaf(fn) {
  rafQueue.push(fn);
  return rafQueue.length;
}
function fakeCancelRaf() { rafQueue.length = 0; }
function flushRaf() {
  const q = rafQueue.splice(0);
  for (const fn of q) fn();
}
function advance(ms) {
  now += ms;
  const due = [...timers.entries()].filter(([, t]) => t.due <= now);
  for (const [id, t] of due) {
    timers.delete(id);
    t.fn();
  }
}

function makeEl() {
  const styleProps = new Map();
  const listeners = new Map();
  const el = {
    hidden: true,
    inert: false,
    style: {
      setProperty(k, v) { styleProps.set(k, v); },
      removeProperty(k) { styleProps.delete(k); },
      get opacity() { return styleProps.get('opacity'); },
      set opacity(v) { if (v == null || v === '') styleProps.delete('opacity'); else styleProps.set('opacity', v); },
      get clipPath() { return styleProps.get('clip-path'); },
      set clipPath(v) { if (v == null || v === '') styleProps.delete('clip-path'); else styleProps.set('clip-path', v); },
      get transition() { return styleProps.get('transition'); },
      set transition(v) { if (v == null || v === '') styleProps.delete('transition'); else styleProps.set('transition', v); }
    },
    setAttribute(k, v) { el['_' + k] = v; },
    removeAttribute(k) { delete el['_' + k]; },
    getAttribute(k) { return el['_' + k]; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const s = listeners.get(type);
      if (s) s.delete(fn);
    },
    _emit(type, ev) {
      const s = listeners.get(type);
      if (!s) return;
      for (const fn of [...s]) fn(ev);
    },
    _listenerCount(type) { return listeners.get(type)?.size || 0; },
    _has(k) { return styleProps.has(k); }
  };
  return el;
}

const sandbox = {
  console,
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  requestAnimationFrame: fakeRaf,
  cancelAnimationFrame: fakeCancelRaf,
  matchMedia: () => ({ matches: false }),
  document: { activeElement: null, documentElement: {} },
  getComputedStyle: () => ({
    getPropertyValue: (name) => (name === '--motion-duration-enter' ? '200ms' : '')
  }),
  OneToneMotion: {
    prefersReducedMotion: () => false,
    readCssDurationMs: (name, fb) => (name === '--motion-duration-enter' ? 200 : fb)
  }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(read('src/js/core/panel-reveal.js'), sandbox);
const PR = sandbox.OneTonePanelReveal;
assert.ok(PR);

// Instant close recycles layout (hidden)
{
  const body = makeEl();
  body.hidden = false;
  const head = { setAttribute() {} };
  const ctrl = PR.createPanelReveal(body);
  ctrl.closeInstant(head, null);
  assert.equal(body.hidden, true);
  assert.equal(body.inert, true);
}

// Open reveal: start inert, finish clears inert; late fallback after cancel ignored
{
  const body = makeEl();
  const headAttrs = {};
  const head = { setAttribute(k, v) { headAttrs[k] = v; } };
  const ctrl = PR.createPanelReveal(body);
  ctrl.openReveal(head);
  assert.equal(body.hidden, false);
  assert.equal(body.inert, true);
  assert.equal(body.style.opacity, '0');
  flushRaf();
  assert.equal(body.style.opacity, '1');
  // Cancel mid-flight then open another — old fallback must not clear new inert incorrectly
  const genBefore = ctrl._generation();
  ctrl.cancel();
  assert.ok(ctrl._generation() > genBefore);
  ctrl.openReveal(head);
  assert.equal(body.inert, true);
  advance(500); // would have fired old+new fallbacks
  // After finish of latest open, inert false
  assert.equal(body.inert, false);
}

// Reduced motion: no rAF mid-state
{
  sandbox.OneToneMotion.prefersReducedMotion = () => true;
  const body = makeEl();
  const head = { setAttribute() {} };
  const ctrl = PR.createPanelReveal(body);
  ctrl.openReveal(head);
  assert.equal(body.hidden, false);
  assert.equal(body.inert, false);
  assert.equal(rafQueue.length, 0);
  sandbox.OneToneMotion.prefersReducedMotion = () => false;
}

// Stale transitionend after cancel does not finish new panel wrongly
{
  const body = makeEl();
  const head = { setAttribute() {} };
  const ctrl = PR.createPanelReveal(body);
  ctrl.openReveal(head);
  flushRaf();
  const listenersBefore = body._listenerCount('transitionend');
  assert.ok(listenersBefore >= 1);
  ctrl.closeInstant(head, null);
  assert.equal(body.hidden, true);
  assert.equal(body.inert, true);
  // Late transitionend from cancelled open
  body._emit('transitionend', { target: body, propertyName: 'opacity' });
  assert.equal(body.hidden, true);
  assert.equal(body.inert, true);
}

console.log('test-panel-reveal: ok');
