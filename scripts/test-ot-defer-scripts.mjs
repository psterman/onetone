/**
 * Phase 1 cold-start defer contracts: camera-ui + debug only; habit-heavy sync;
 * chrome-first ensure (no openDrawer Promise gate); idle-preload camera-ui only.
 * Run: node scripts/test-ot-defer-scripts.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const drawer = fs.readFileSync(
  path.join(root, 'src/js/features/settings/settings-drawer.js'),
  'utf8'
);
const boot = fs.readFileSync(path.join(root, 'src/js/core/app-boot.js'), 'utf8');
const deferApi = fs.readFileSync(
  path.join(root, 'src/js/core/ot-defer-scripts.js'),
  'utf8'
);

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    fail++;
  } else {
    console.log('PASS', msg);
  }
}

function isDeferred(srcStem) {
  const tagRe = new RegExp(
    '<script\\b[^>]*src="[^"]*' + srcStem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^"]*"[^>]*>',
    'i'
  );
  const m = html.match(tagRe);
  if (!m) return { found: false, deferred: false };
  return {
    found: true,
    deferred: /type="text\/plain"/i.test(m[0]) && /data-ot-defer=/i.test(m[0]),
  };
}

assert(/ot-defer-scripts\.js/.test(html), 'index loads ot-defer-scripts.js');

const deferCount = (html.match(/data-ot-defer=/g) || []).length;
assert(deferCount === 16, 'exactly 16 data-ot-defer markers (got ' + deferCount + ')');

const cameraUi = [
  'gaze-karaoke-lines.js',
  'camera-gaze-calibration.js',
  'camera-action-picker.js',
  'face-mask.js',
  'gpuimage-beautify.js',
  'camera-video-enhancer.js',
  'camera-workflow.js',
  'camera-teach.js',
  'camera2-workbench.js',
  'camera-pro-glance.js',
];
for (const stem of cameraUi) {
  const r = isDeferred(stem);
  assert(r.found && r.deferred, stem + ' is deferred (camera-ui)');
}

const debugScripts = [
  'voice-hang-classify.js',
  'voice-diag.js',
  'debug-panel.js',
  'drag-lag-panel.js',
  'debug-about.js',
  'debug-about-bindings.js',
];
for (const stem of debugScripts) {
  const r = isDeferred(stem);
  assert(r.found && r.deferred, stem + ' is deferred (debug)');
}

const habitHeavySync = [
  'soft-pad-hub-ui.js',
  'agent-center.js',
  'keys-scene-actions-panel.js',
  'habit-channel-edit-banner.js',
  'codex-micro-pad-ui.js',
];
for (const stem of habitHeavySync) {
  const r = isDeferred(stem);
  assert(r.found && !r.deferred, stem + ' stays sync (no data-ot-defer)');
}

assert(!/__deferReady/.test(drawer), 'drawer has no __deferReady early-return');
assert(
  /function openDrawer\(/.test(drawer) &&
    !/function openDrawer\([\s\S]*?return\s+OneToneDefer|function openDrawer\([\s\S]*?ensureForPanel[\s\S]*?return/.test(
      drawer.slice(drawer.indexOf('function openDrawer('), drawer.indexOf('function openDrawer(') + 800)
    ),
  'openDrawer is not Promise-gated by ensureForPanel'
);
assert(/runAfterPanelScripts/.test(drawer), 'setSettingsPanel uses runAfterPanelScripts');
assert(
  /runAfterPanelScripts\('debug'/.test(drawer) &&
    /runAfterPanelScripts\('camera'/.test(drawer) &&
    /runAfterPanelScripts\('camera2'/.test(drawer),
  'ensure hop only for debug/camera/camera2 bodies'
);

assert(
  /panel === 'debug' \|\| panel === 'camera' \|\| panel === 'camera2'/.test(deferApi) ||
    /panel === 'debug' \|\| panel === 'camera' \|\| panel === 'camera2'/.test(
      deferApi.replace(/\s+/g, ' ')
    ),
  'panelNeedsDefer maps only camera/debug family'
);
assert(
  /if \(panel === 'debug'\) return loadGroup\('debug'\)/.test(deferApi) &&
    /loadGroup\('camera-ui'\)/.test(deferApi),
  'ensureForPanel maps debug→debug, camera*→camera-ui'
);
assert(!/soft-pad|habit|agent|keys/.test(
  deferApi.match(/function ensureForPanel[\s\S]*?^  \}/m)?.[0] || ''
), 'ensureForPanel does not map soft-pad/habit/agent/keys');

assert(
  /loadGroup\(['"]camera-ui['"]\)/.test(boot) && !/loadAll\s*\(/.test(boot),
  'boot idle-preloads camera-ui only (no loadAll)'
);

// camera2 right column (画面观感) needs the same unpause as camera1 — not `!== 'camera'`.
assert(
  /function syncCameraInferForPanel\([\s\S]*?isCameraFamilyPanel\(panel\)/.test(drawer) &&
    !/normalizePanel\(panel\)!=='camera'/.test(
      drawer.slice(
        drawer.indexOf('function syncCameraInferForPanel'),
        drawer.indexOf('function syncCameraInferForPanel') + 280
      )
    ),
  'syncCameraInferForPanel unpauses camera family (camera + camera2)'
);
assert(
  /requestIdleCallback/.test(boot) || /setTimeout\(preloadCameraUi/.test(boot),
  'boot uses idle/timeout preload for camera-ui'
);

if (fail) {
  console.error('\n' + fail + ' failure(s)');
  process.exit(1);
}
console.log('\nAll ot-defer Phase 1 contracts passed.');
