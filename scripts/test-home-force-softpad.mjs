/**
 * Guard: home sidebar force Soft Pad switch stays removed.
 * Soft Pad follows foreground; leftover softPadForceOpen is cleared on bind.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const html = read('src/index.html');
assert.ok(!html.includes('wbForceSoftPadToggle'), 'home force Soft Pad toggle removed from DOM');
assert.ok(!html.includes('wbForceSoftPadRow'), 'force Soft Pad row removed');
assert.ok(html.includes('wb-home-sidebar-foot'), 'sidebar foot remains for quick start');
assert.ok(html.includes('wbBtnTestSend'), '快速入门 remains');

const wb = read('src/js/features/home/home-workbench.js');
assert.ok(!wb.includes('setForceSoftPadOpen'), 'home no longer toggles force open');
assert.ok(!wb.includes('refreshForceSoftPadToggle'), 'force Soft Pad toggle UI refresh removed');
assert.ok(wb.includes('clearLegacyForceSoftPadOpen'), 'legacy force flag cleared on bind');

const css = read('src/css/home-workbench.css');
assert.ok(!css.includes('.wb-home-force-softpad'), 'force Soft Pad home styles removed');

console.log('ok home-force-softpad-removed');
