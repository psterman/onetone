/**
 * Mark camera-ui + debug script tags in src/index.html as data-ot-defer.
 * habit-heavy stays sync (left nav Soft Pad / Agent / keys).
 * Run: node scripts/apply-ot-defer-scripts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = path.join(root, 'src/index.html');
let html = fs.readFileSync(htmlPath, 'utf8');

if (!html.includes('ot-defer-scripts.js')) {
  html = html.replace(
    '<script src="js/core/app-debug-state.js"></script>',
    '<script src="js/core/app-debug-state.js"></script>\n  <script src="js/core/ot-defer-scripts.js"></script>'
  );
}

const groups = {
  'camera-ui': [
    'js/features/camera/gaze-karaoke-lines.js',
    'js/features/camera/camera-gaze-calibration.js',
    'js/features/camera/camera-action-picker.js',
    'vendor/face-mask/face-mask.js',
    'vendor/gpuimage-beautify/gpuimage-beautify.js',
    'js/features/camera/camera-video-enhancer.js',
    'js/features/camera/camera-workflow.js',
    'js/features/camera/camera-teach.js',
    'js/features/camera/camera2-workbench.js',
    'js/features/camera/camera-pro-glance.js',
  ],
  debug: [
    'js/features/debug/voice-hang-classify.js',
    'js/features/debug/voice-diag.js',
    'js/features/debug/debug-panel.js',
    'js/features/debug/drag-lag-panel.js',
    'js/features/debug/debug-about.js',
    'js/features/debug/debug-about-bindings.js',
  ],
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let changed = 0;
for (const [group, prefixes] of Object.entries(groups)) {
  for (const prefix of prefixes) {
    const re = new RegExp(
      '<script src="(' + escapeRe(prefix) + '[^"]*)"><\\/script>',
      'g'
    );
    html = html.replace(re, (_m, src) => {
      changed += 1;
      return (
        '<script type="text/plain" data-ot-defer="' +
        group +
        '" src="' +
        src +
        '"></script>'
      );
    });
  }
}

fs.writeFileSync(htmlPath, html);
console.log('loader', html.includes('ot-defer-scripts.js'));
console.log('deferred replacements', changed);
console.log('data-ot-defer count', (html.match(/data-ot-defer=/g) || []).length);
