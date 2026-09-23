/**
 * Soft Pad「何时显示」N1: object stage + 2×2 short tabs must stay wired.
 * Run: node scripts/check-soft-pad-show-obj.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const js = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');

for (const n of [
  'function softPadShowObjBodyHtml',
  'function renderShowModeObjectStageHtml',
  'renderShowModeObjectStageHtml(mode)',
  'data-show-obj',
  'softPadShowModeFollowShort'
]) {
  if (!js.includes(n)) throw new Error('missing in js: ' + n);
}
if (!js.includes("soft-pad-show-mode-tab__t") || !js.includes('softPadShowModeShort(id)')) {
  throw new Error('tabs missing N1 title/short structure');
}
for (const n of [
  '.soft-pad-show-obj',
  '.soft-pad-show-obj__mini',
  '.soft-pad-show-mode-tabs',
  'grid-template-columns: 1fr 1fr'
]) {
  if (!css.includes(n)) throw new Error('missing in css: ' + n);
}
console.log('ok soft-pad-show-obj N1');
