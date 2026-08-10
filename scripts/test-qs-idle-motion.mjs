/**
 * Assert qs-mode-matrix idle infinite animations are statically overridden
 * (or deferred in motion-inventory), and no .mode-card * wildcard.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/css/qs-mode-matrix.css'), 'utf8');
const inventory = readFileSync(join(root, 'docs/motion-inventory.md'), 'utf8');

assert.ok(!/\.mode-card\s+\*\s*\{[^}]*animation:\s*none/s.test(css), 'no .mode-card * animation wipe');

// Split override block: after "explicit consumers" comment through closing brace of that rule.
const overrideIdx = css.indexOf('explicit consumers only');
assert.ok(overrideIdx >= 0, 'explicit consumers override block present');
const overrideSlice = css.slice(overrideIdx, overrideIdx + 2500);

// Find rules with infinite animation (excluding @keyframes and animation:none)
const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
const idleConsumers = [];
let m;
while ((m = ruleRe.exec(css))) {
  const sel = m[1].trim();
  const body = m[2];
  if (sel.startsWith('@')) continue;
  if (/animation\s*:\s*none/i.test(body)) continue;
  if (!/animation(?:-name)?\s*:/i.test(body)) continue;
  if (!/\binfinite\b/i.test(body)) continue;
  // Skip keyframes contents accidentally — selectors for keyframes are @keyframes name
  idleConsumers.push(sel.replace(/\s+/g, ' '));
}

assert.ok(idleConsumers.length >= 10, 'expected many idle infinite rules, got ' + idleConsumers.length);

const uncovered = [];
for (const sel of idleConsumers) {
  // A consumer is covered if any simple token from the selector appears in override block
  // or is listed deferred in inventory.
  const tokens = sel.split(/,\s*/);
  let ok = false;
  for (const token of tokens) {
    const compact = token.trim();
    if (!compact) continue;
    // Check if override block contains a selector that would match this rule's subject
    // Heuristic: last class/id in the selector appears in override list.
    const parts = compact.match(/\.[a-zA-Z0-9_-]+|#[a-zA-Z0-9_-]+/g) || [];
    const last = parts[parts.length - 1];
    if (last && overrideSlice.includes(last)) {
      ok = true;
      break;
    }
    if (inventory.includes(compact) && /deferred/i.test(inventory)) {
      ok = true;
      break;
    }
  }
  if (!ok) uncovered.push(sel);
}

assert.equal(
  uncovered.length,
  0,
  'idle infinite consumers missing static override:\n' + uncovered.join('\n')
);

console.log('test-qs-idle-motion: ok (' + idleConsumers.length + ' infinite rules covered)');
