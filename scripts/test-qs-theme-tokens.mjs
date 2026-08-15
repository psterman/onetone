/**
 * Quick-start Mode Matrix theme tokens + light polish.
 * Blue-progression card tints; light IDE insets; always-on soft wash.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const matrix = readFileSync(join(root, 'src/css/qs-mode-matrix.css'), 'utf8');
const app = readFileSync(join(root, 'src/css/app.css'), 'utf8');

assert.ok(!matrix.includes('#08090b'), 'matrix must not force #08090b stage');
assert.ok(!matrix.includes('#a8c7fa'), 'matrix must not use Material lavender #a8c7fa');
assert.ok(!/rgba\(\s*168\s*,\s*199\s*,\s*250/i.test(matrix), 'matrix must not use lavender rgba');

assert.ok(
  /--qs-m3-primary\s*:\s*var\(--primary\)/.test(matrix),
  'matrix primary maps to --primary'
);
assert.ok(
  /--qs-m3-surface(?:-low)?\s*:\s*var\(--surface/.test(matrix),
  'matrix surfaces map to --surface*'
);
assert.ok(
  matrix.includes('var(--vp-bg, var(--surface-2))'),
  'matrix stage uses theme bg / surface-2'
);
assert.ok(!/font-family\s*:\s*Inter\b/i.test(matrix), 'matrix inherits app font (no Inter force)');

const miniBlock = app.match(/\.qs-ai-mini\{[^}]+\}/);
assert.ok(miniBlock, '.qs-ai-mini rule present');
assert.ok(!miniBlock[0].includes('#0f172a'), '.qs-ai-mini no #0f172a chrome');
assert.ok(
  /background\s*:\s*var\(--surface-high\)/.test(miniBlock[0]),
  '.qs-ai-mini uses --surface-high'
);

assert.ok(
  !/:hover\s+\.mode-card__copy\s+h2/.test(matrix),
  'h2 must not tint on :hover'
);

// Unified white idle / shared primary-soft hover
assert.ok(
  /\.mode-card\{[^}]*background\s*:\s*#ffffff/s.test(matrix),
  'cards idle background is white'
);
assert.ok(
  /--qs-card-tint\s*:\s*var\(--primary-soft/.test(matrix),
  'shared hover tint = primary-soft'
);
assert.ok(
  !/\[data-type="vibe"\]\{[^}]*--qs-card-tint/s.test(matrix),
  'no per-card tint overrides'
);
assert.ok(
  /\.mode-card:hover\{[^}]*background\s*:\s*var\(--qs-card-tint\)/s.test(matrix),
  'hover shows shared blue tint'
);
assert.ok(
  /\.mode-card__wash\{[^}]*opacity\s*:\s*0/s.test(matrix),
  'wash hidden when idle'
);

// Light IDE insets
assert.ok(/--qs-ide-bg\s*:\s*#f3f7fb/.test(matrix), 'light theme IDE bg is light');
assert.ok(
  /html\[data-theme="dark"\]\s+\.qs-mode-matrix\{[^}]*--qs-ide-bg\s*:\s*#0c0e14/s.test(matrix),
  'dark theme keeps dark IDE bg'
);

function ruleBody(css, selectorRe) {
  const m = css.match(new RegExp(selectorRe.source + '\\{([^}]*)\\}'));
  return m ? m[1] : '';
}
const monitorBody = ruleBody(matrix, /\.qs-mode-matrix\s+\.qs-monitor/);
const frameBody = ruleBody(matrix, /\.qs-mode-matrix\s+\.qs-frame(?!--)/);
assert.ok(monitorBody, '.qs-monitor rule present');
assert.ok(frameBody, '.qs-frame rule present');
assert.ok(
  !/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0\.(4|45)\s*\)/.test(monitorBody),
  '.qs-monitor must not use rgba(0,0,0,.4/.45) outer shadow'
);
assert.ok(/animation\s*:\s*none/.test(monitorBody), '.qs-monitor idle animation none');
assert.ok(
  /\.mode-card:is\(:hover,\s*\.selected\)\s+\.qs-monitor\{[^}]*qs-ai-pulse/s.test(matrix) ||
    /\.mode-card\.selected\s+\.qs-monitor\{[^}]*qs-ai-pulse/s.test(matrix),
  'qs-ai-pulse on hover or selected'
);
assert.ok(/qs-card-wash-breathe/.test(matrix), 'card wash ambient present');
assert.ok(
  /\.mode-card:is\(:hover,\s*\.selected\)\s+\.qs-quad-track\{[^}]*qs-quad-carousel/s.test(matrix) ||
    /\.mode-card\.selected\s+\.qs-quad-track\{[^}]*qs-quad-carousel/s.test(matrix),
  'veteran carousel on hover or selected'
);
assert.ok(/Center demos: loop on hover/.test(matrix), 'hover/selected demos present');
assert.ok(/\.mode-card:active\{[^}]*scale\(0\.98\)/s.test(matrix), 'press :active feedback');
assert.ok(!/grayscale\(70%\)/.test(matrix), 'no grayscale deselect');
assert.ok(
  /\.mode-card__visual\s*>\s*\*\{[^}]*height\s*:\s*168px/s.test(matrix),
  'unified graphic stage'
);

console.log('qs-theme-tokens tests passed');
