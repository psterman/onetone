/**
 * Size + hot-signal scan for the 26 former ot-defer candidates.
 * Run: node scripts/analyze-ot-defer-candidates.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [
  ['camera-ui', 'js/features/camera/gaze-karaoke-lines.js'],
  ['camera-ui', 'js/features/camera/camera-gaze-calibration.js'],
  ['camera-ui', 'js/features/camera/camera-action-picker.js'],
  ['camera-ui', 'vendor/face-mask/face-mask.js'],
  ['camera-ui', 'vendor/gpuimage-beautify/gpuimage-beautify.js'],
  ['camera-ui', 'js/features/camera/camera-video-enhancer.js'],
  ['camera-ui', 'js/features/camera/camera-workflow.js'],
  ['camera-ui', 'js/features/camera/camera-teach.js'],
  ['camera-ui', 'js/features/camera/camera2-workbench.js'],
  ['camera-ui', 'js/features/camera/camera-pro-glance.js'],
  ['debug', 'js/features/debug/voice-hang-classify.js'],
  ['debug', 'js/features/debug/voice-diag.js'],
  ['debug', 'js/features/debug/debug-panel.js'],
  ['debug', 'js/features/debug/drag-lag-panel.js'],
  ['debug', 'js/features/debug/debug-about.js'],
  ['debug', 'js/features/debug/debug-about-bindings.js'],
  ['habit-heavy', 'js/features/mapping/habit-workspace.js'],
  ['habit-heavy', 'js/features/mapping/habit-hub-side-peek.js'],
  ['habit-heavy', 'js/features/mapping/habit-scenario-wizard.js'],
  ['habit-heavy', 'js/features/mapping/habit-usage-sheet.js'],
  ['habit-heavy', 'js/features/mapping/keys-scene-actions-panel.js'],
  ['habit-heavy', 'js/features/agent/soft-pad-hub-ui.js'],
  ['habit-heavy', 'js/features/agent/soft-pad-time-machine-ui.js'],
  ['habit-heavy', 'js/features/agent/agent-center.js'],
  ['habit-heavy', 'js/features/agent/agent-capability-ui.js'],
  ['habit-heavy', 'js/features/agent/shell-agent-hook-panel.js'],
];

function score(t) {
  let s = 0;
  if (/requestAnimationFrame/.test(t)) s += 3;
  if (/setInterval/.test(t)) s += 2;
  if (/createImageBitmap/.test(t)) s += 5;
  if (/WebGL|getContext\(\s*['"]webgl|gpuimage|GPUImage/i.test(t)) s += 5;
  if (/MediaPipe|FilesetResolver|VisionTask/.test(t)) s += 4;
  if (/\.init\(\)|bindOnce\(\)|startLoop\(|attachEnhancer/.test(t)) s += 1;
  return s;
}

const rows = files.map(([group, rel]) => {
  const abs = path.join(root, rel);
  const buf = fs.readFileSync(abs);
  const t = buf.toString('utf8');
  return {
    group,
    name: path.basename(rel),
    rel,
    kb: +(buf.length / 1024).toFixed(1),
    lines: t.split(/\n/).length,
    hot: score(t),
    bytes: buf.length,
  };
});

rows.sort((a, b) => b.bytes - a.bytes || b.hot - a.hot);

console.log('group\thot\tkB\tlines\tfile');
for (const r of rows) {
  console.log([r.group, r.hot, r.kb, r.lines, r.name].join('\t'));
}
const byGroup = {};
for (const r of rows) {
  byGroup[r.group] = byGroup[r.group] || { kb: 0, n: 0, hot: 0 };
  byGroup[r.group].kb += r.bytes;
  byGroup[r.group].n += 1;
  byGroup[r.group].hot += r.hot;
}
console.log('\nBY GROUP');
for (const [g, v] of Object.entries(byGroup)) {
  console.log(g, 'files=' + v.n, 'kB=' + (v.kb / 1024).toFixed(1), 'hotSum=' + v.hot);
}
console.log('TOTAL_KB', +(rows.reduce((s, r) => s + r.bytes, 0) / 1024).toFixed(1));
