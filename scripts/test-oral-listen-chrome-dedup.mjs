/**
 * Guard: oral listen caption must not stack status +「可说」list + chips.
 * Current agent chip needs shared is-usage-focus chrome (not ring-only).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'src/codex-micro-overlay.html'), 'utf8');
const css = readFileSync(join(root, 'src/css/codex-micro-overlay.css'), 'utf8');

assert.ok(
  html.includes("chips\n            ?(needAim?armHint:'')") ||
    html.includes("?(needAim?armHint:'')"),
  'applyOralListenMini clears name when chips cover sayables'
);
assert.ok(html.includes("is-oral-cmds"), 'caption marks chip-led oral layout');
assert.ok(
  css.includes('.overlay-key-caption__name:empty'),
  'empty oral name line collapses'
);
assert.ok(
  css.includes('.soft-pad-agent-bar:has(.is-usage-focus)') &&
    css.includes('opacity: 0.48'),
  'non-current agent chips dim when one is focused'
);
assert.ok(
  css.includes('.soft-pad-agent-bar__chip.is-usage-focus') &&
    css.includes('.soft-pad-agent-bar__chip.is-usage-focus::after'),
  'current agent has shared strong chrome + marker'
);

console.log('ok oral-listen-chrome-dedup');
