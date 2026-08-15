/**
 * Apple Design remediation checks for QS Mode Matrix cards.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'src/css/qs-mode-matrix.css'), 'utf8');

assert.ok(!/\.mode-card\s+\*\s*\{[^}]*animation:\s*none/s.test(css), 'no .mode-card * animation wipe');

// Press feedback
assert.ok(/\.mode-card:active\{[^}]*scale\(0\.98\)/s.test(css), ':active scale press feedback');

// Selection focus — no grayscale punishment
assert.ok(!/grayscale\(70%\)/.test(css), 'no grayscale deselect punishment');
assert.ok(
  /\.mode-card:not\(\.selected\)\{[^}]*opacity\s*:\s*\.72/s.test(css) ||
    /has-selection \.mode-card:not\(\.selected\)\{[^}]*opacity\s*:\s*\.72/s.test(css),
  'unselected only soft opacity'
);
assert.ok(!/\.mode-card\.selected\{[^}]*scale\(1\.02\)/s.test(css), 'no gamey selected scale(1.02)');

// Idle restraint — heavy demos gated to selected
assert.ok(/Center demos: loop on hover/.test(css), 'hover/selected demo block present');
assert.ok(
  /\.mode-card:is\(:hover,\s*\.selected\)\s+\.qs-newbie-rings i\{[^}]*qs-newbie-ring/s.test(css),
  'newbie rings animate on hover or selected'
);
assert.ok(
  /\.qs-quad-track\{[^}]*animation\s*:\s*none/s.test(css),
  'carousel idle none'
);
assert.ok(
  /\.mode-card:is\(:hover,\s*\.selected\)\s+\.qs-quad-track\{[^}]*qs-quad-carousel/s.test(css) ||
    /\.mode-card\.selected\s+\.qs-quad-track\{[^}]*qs-quad-carousel/s.test(css),
  'carousel on hover or selected'
);

// Unified graphic stage
assert.ok(
  /\.mode-card__visual\s*>\s*\*\{[^}]*height\s*:\s*168px/s.test(css),
  'unified graphic stage height'
);

// Hint / chip contrast
assert.ok(
  /\.qs-newbie-key-hint\{[^}]*color\s*:\s*var\(--primary-strong/s.test(css) &&
    /\.qs-newbie-key-hint\{[^}]*background\s*:\s*var\(--primary-soft/s.test(css),
  'key hint primary-strong on soft fill'
);
assert.ok(
  /\.qs-intent-tools em\{[^}]*color\s*:\s*var\(--primary-strong/s.test(css),
  'agent chip uses primary-strong'
);

assert.ok(/prefers-reduced-motion:reduce/.test(css), 'reduced-motion kept');

console.log('test-qs-idle-motion: ok (apple remediation)');
