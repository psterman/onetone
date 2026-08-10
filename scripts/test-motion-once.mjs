/**
 * OneToneMotion.playOnce lifecycle (fake DOM + fake timers).
 * No jsdom — exercises class/timer/listener bookkeeping only.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const css = read('src/css/motion.css');
assert.ok(/--motion-duration-shake:\s*260ms/.test(css), 'CSS shake duration 260');
assert.ok(/--motion-duration-status:\s*120ms/.test(css), 'CSS status duration');
assert.ok(/@keyframes ot-status-pulse/.test(css), 'ot-status-pulse keyframe');
assert.ok(/\.ot-enter,\s*\n\s*\.ot-shake/.test(css) || /\.ot-enter,[\s\S]*\.ot-shake/.test(css), 'reduced-motion enumerates classes');
assert.ok(!/\[class\*="ot-"\]/.test(css), 'no class*=ot- wildcard');
assert.ok(/var\(--dur-press,\s*120ms\)/.test(css), 'press uses dur-press fallback');
assert.ok(
  /prefers-reduced-motion:\s*reduce[\s\S]*\.ot-press:active\s*\{\s*transform:\s*none\s*!important/s.test(css),
  'reduced-motion kills .ot-press:active transform'
);
assert.ok(/cubic-bezier\(0\.23,\s*1,\s*0\.32,\s*1\)/.test(css), 'shake uses enter easing');

const jsSrc = read('src/js/core/motion.js');
assert.ok(/FALLBACK_MS/.test(jsSrc), 'FALLBACK_MS present');
assert.ok(/'ot-shake':\s*260/.test(jsSrc), 'JS shake mirror 260');
assert.ok(/'ot-sparkle-once':\s*120/.test(jsSrc), 'JS sparkle mirror 120');
assert.ok(/function readCssDurationMs/.test(jsSrc) || /readCssDurationMs\s*[:=]/.test(jsSrc), 'readCssDurationMs exported');
assert.ok(/function animNameMatches/.test(jsSrc) || /animNameMatches\s*[:=]/.test(jsSrc), 'animNameMatches present');

// Recording ring: static box-shadow; ::after animates opacity/scale only
{
  const app = read('src/css/app.css');
  assert.ok(/keys-record-btn\.is-recording::after/.test(app), 'recording ::after present');
  assert.ok(/@keyframes keys-record-dot\{[\s\S]*?opacity[\s\S]*?scale/.test(app), 'dot keyframes opacity+scale');
  const recBlock = app.match(/keys-record-btn\.is-recording\{[^}]+\}/);
  assert.ok(recBlock, 'is-recording rule');
  assert.ok(!/animation\s*:/.test(recBlock[0]), 'recording button itself has no animation');
}

let now = 0;
const timers = new Map();
let nextTimerId = 1;

function fakeSetTimeout(fn, ms) {
  const id = nextTimerId++;
  timers.set(id, { fn, due: now + (ms || 0) });
  return id;
}
function fakeClearTimeout(id) {
  timers.delete(id);
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
  const classes = new Set();
  const listeners = new Map();
  const el = {
    isConnected: true,
    offsetWidth: 1,
    classList: {
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
      contains(c) { return classes.has(c); },
      toggle(c, force) {
        if (force === true) classes.add(c);
        else if (force === false) classes.delete(c);
        else if (classes.has(c)) classes.delete(c);
        else classes.add(c);
      }
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      const set = listeners.get(type);
      if (set) set.delete(fn);
    },
    _emit(type, event) {
      const set = listeners.get(type);
      if (!set) return;
      for (const fn of [...set]) fn(event);
    },
    _listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
    _classes() { return classes; }
  };
  return el;
}

const sandbox = {
  console,
  setTimeout: fakeSetTimeout,
  clearTimeout: fakeClearTimeout,
  matchMedia: () => ({ matches: false }),
  document: {
    documentElement: {},
  },
  getComputedStyle: () => ({
    getPropertyValue: (name) => {
      if (name === '--motion-duration-shake') return '260ms';
      if (name === '--motion-duration-status') return '120ms';
      if (name === '--motion-duration-enter') return '200ms';
      return '';
    }
  }),
  window: null,
  globalThis: null
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;

vm.runInNewContext(jsSrc, sandbox);
const Motion = sandbox.OneToneMotion;
assert.ok(Motion && typeof Motion.playOnce === 'function');
assert.equal(Motion.FALLBACK_MS['ot-shake'], 260);
assert.equal(Motion.FALLBACK_MS['ot-sparkle-once'], 120);
assert.equal(typeof Motion.readCssDurationMs, 'function');
assert.equal(typeof Motion.animNameMatches, 'function');

// animNameMatches: empty, multi, near-miss
assert.equal(Motion.animNameMatches('', 'ot-shake'), false);
assert.equal(Motion.animNameMatches('ot-shake', 'ot-shake'), true);
assert.equal(Motion.animNameMatches('foo, ot-shake', 'ot-shake'), true);
assert.equal(Motion.animNameMatches('foo,ot-shake', 'ot-shake'), true);
assert.equal(Motion.animNameMatches('not-ot-shake', 'ot-shake'), false);
assert.equal(Motion.animNameMatches('ot-shake-extra', 'ot-shake'), false);

// --- animationend cleans up ---
{
  const el = makeEl();
  const cancel = Motion.playOnce(el, 'ot-shake');
  assert.ok(el.classList.contains('ot-shake'));
  assert.equal(el._listenerCount('animationend'), 1);
  assert.ok(Motion.hasActiveSlot(el));
  el._emit('animationend', { target: el, animationName: 'ot-shake' });
  assert.ok(!el.classList.contains('ot-shake'));
  assert.equal(el._listenerCount('animationend'), 0);
  assert.ok(!Motion.hasActiveSlot(el));
  cancel(); // idempotent
}

// --- comma-separated animationName matches ---
{
  const el = makeEl();
  Motion.playOnce(el, 'ot-shake');
  el._emit('animationend', { target: el, animationName: 'foo, ot-shake' });
  assert.ok(!Motion.hasActiveSlot(el));
}

// --- near-miss name ignored ---
{
  const el = makeEl();
  Motion.playOnce(el, 'ot-shake', { fallbackMs: 5000 });
  el._emit('animationend', { target: el, animationName: 'not-ot-shake' });
  assert.ok(Motion.hasActiveSlot(el));
  el._emit('animationend', { target: el, animationName: 'ot-shake' });
  assert.ok(!Motion.hasActiveSlot(el));
}

// --- wrong target (bubbled child) ignored ---
{
  const el = makeEl();
  Motion.playOnce(el, 'ot-shake');
  el._emit('animationend', { target: {}, animationName: 'ot-shake' });
  assert.ok(el.classList.contains('ot-shake'));
  assert.ok(Motion.hasActiveSlot(el));
  el._emit('animationend', { target: el, animationName: 'ot-shake' });
  assert.ok(!Motion.hasActiveSlot(el));
}

// --- cancel then late animationend is no-op ---
{
  const el = makeEl();
  const cancel = Motion.playOnce(el, 'ot-shake', { fallbackMs: 5000 });
  cancel();
  assert.ok(!Motion.hasActiveSlot(el));
  el._emit('animationend', { target: el, animationName: 'ot-shake' });
  assert.ok(!el.classList.contains('ot-shake'));
  assert.ok(!Motion.hasActiveSlot(el));
}

// --- fallback timer cleanup ---
{
  const el = makeEl();
  Motion.playOnce(el, 'ot-shake', { fallbackMs: 100 });
  assert.ok(Motion.hasActiveSlot(el));
  advance(200);
  assert.ok(!el.classList.contains('ot-shake'));
  assert.equal(el._listenerCount('animationend'), 0);
  assert.ok(!Motion.hasActiveSlot(el));
  assert.equal(timers.size, 0);
}

// --- remove element then fallback still cleans records ---
{
  const el = makeEl();
  Motion.playOnce(el, 'ot-sparkle-once', { fallbackMs: 50 });
  el.isConnected = false;
  advance(200);
  assert.ok(!el.classList.contains('ot-sparkle-once'));
  assert.equal(el._listenerCount('animationend'), 0);
  assert.ok(!Motion.hasActiveSlot(el));
  assert.equal(timers.size, 0);
  el.isConnected = true;
  Motion.playOnce(el, 'ot-sparkle-once', { fallbackMs: 50 });
  assert.ok(el.classList.contains('ot-sparkle-once'));
  el._emit('animationend', { target: el, animationName: 'ot-sparkle-once' });
  assert.ok(!Motion.hasActiveSlot(el));
}

// --- new one-shot cancels previous ---
{
  const el = makeEl();
  Motion.playOnce(el, 'ot-shake', { fallbackMs: 5000 });
  assert.ok(el.classList.contains('ot-shake'));
  Motion.playOnce(el, 'ot-sparkle-once', { fallbackMs: 5000 });
  assert.ok(!el.classList.contains('ot-shake'));
  assert.ok(el.classList.contains('ot-sparkle-once'));
  assert.equal(el._listenerCount('animationend'), 1);
  el._emit('animationend', { target: el, animationName: 'ot-sparkle-once' });
  assert.ok(!Motion.hasActiveSlot(el));
}

// --- manual cancel ---
{
  const el = makeEl();
  const cancel = Motion.playOnce(el, 'ot-shake', { fallbackMs: 5000 });
  cancel();
  assert.ok(!el.classList.contains('ot-shake'));
  assert.equal(el._listenerCount('animationend'), 0);
  assert.ok(!Motion.hasActiveSlot(el));
  assert.equal(timers.size, 0);
}

// --- reduced motion ---
{
  sandbox.matchMedia = () => ({ matches: true });
  const el = makeEl();
  const cancel = Motion.playOnce(el, 'ot-shake', { fallbackMs: 5000 });
  assert.ok(!el.classList.contains('ot-shake'));
  assert.ok(!Motion.hasActiveSlot(el));
  assert.equal(typeof cancel, 'function');
  cancel();
  sandbox.matchMedia = () => ({ matches: false });
}

// --- HTML entry wiring (static) ---
const indexHtml = read('src/index.html');
const overlayHtml = read('src/codex-micro-overlay.html');
assert.ok(/css\/motion\.css/.test(indexHtml), 'index loads motion.css');
assert.ok(/js\/core\/motion\.js/.test(indexHtml), 'index loads motion.js');
assert.ok(/js\/core\/agent-status-edge\.js/.test(indexHtml), 'index loads agent-status-edge.js');
assert.ok(/js\/core\/panel-reveal\.js/.test(indexHtml), 'index loads panel-reveal.js');
assert.ok(/css\/motion\.css/.test(overlayHtml), 'overlay loads motion.css');
assert.ok(/js\/core\/motion\.js/.test(overlayHtml), 'overlay loads motion.js');
assert.ok(/js\/core\/agent-status-edge\.js/.test(overlayHtml), 'overlay loads agent-status-edge.js');
{
  const motion = overlayHtml.indexOf('js/core/motion.js');
  const edge = overlayHtml.indexOf('js/core/agent-status-edge.js');
  const usage = overlayHtml.indexOf('usage-format.js');
  assert.ok(motion >= 0 && edge > motion && usage > edge, 'overlay: motion → edge → usage-format');
}
{
  const biz = overlayHtml.indexOf('codex-micro-overlay.css');
  const mot = overlayHtml.indexOf('css/motion.css');
  assert.ok(biz >= 0 && mot > biz, 'overlay: motion.css after business css');
}
{
  const typo = indexHtml.indexOf('css/typography.css');
  const mot = indexHtml.indexOf('css/motion.css');
  assert.ok(typo >= 0 && mot > typo, 'index: motion.css after typography (last business)');
}

console.log('test-motion-once: ok');
