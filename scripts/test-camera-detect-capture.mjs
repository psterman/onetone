/**
 * Camera detect-mode contracts: 640×360@8, preview reasons, no detect persist.
 * Run: node scripts/test-camera-detect-capture.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const preview = fs.readFileSync(path.join(root, 'src/js/features/camera/camera-preview.js'), 'utf8');
const drawer = fs.readFileSync(
  path.join(root, 'src/js/features/settings/settings-drawer.js'),
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

assert(
  /DETECT_CONSTRAINTS\s*=\s*\{\s*width:\s*640\s*,\s*height:\s*360\s*,\s*frameRate:\s*8\s*\}/.test(
    preview
  ),
  'DETECT_CONSTRAINTS is 640×360@8'
);
assert(/function isPreviewCaptureReason/.test(preview), 'isPreviewCaptureReason helper');
assert(
  /camera2/.test(preview) && /panel_visible/.test(preview) && /user_restart/.test(preview),
  'preview reasons include camera2 / panel_visible / user_restart'
);
assert(/function detectPreferConstraints/.test(preview), 'detectPreferConstraints helper');
assert(/function ensurePreviewCapture/.test(preview), 'ensurePreviewCapture upgrades detect→preview');
assert(
  /applyConstraints/.test(preview) &&
    /kept_detect_stream|upgraded_soft|promoted/.test(preview) &&
    !/ensurePreviewCapture[\s\S]{0,400}releaseStreamOnly\(/.test(preview),
  'ensurePreviewCapture soft-upgrades (no stop+getUserMedia)'
);
assert(
  /captureMode=wantPreview\?'preview':'detect'/.test(preview) ||
    /captureMode\s*=\s*wantPreview\s*\?\s*'preview'\s*:\s*'detect'/.test(preview),
  'startPreview sets captureMode from wantPreview'
);
assert(
  /Never persist background detect|wantPreview&&sz\.width/.test(preview),
  'detect success path gates persistCameraPrefs on wantPreview'
);
assert(/detectOnly/.test(preview), 'requestUserMedia supports detectOnly (no video:true fallback)');
assert(/camera_capture|getLastCaptureSettings/.test(preview), 'runtime getSettings evidence exposed');
assert(
  /detachEnhancer|detectHome/.test(preview) && /captureMode==='detect'/.test(preview),
  'detect mode skips enhancer / gaze HUD loop'
);
assert(
  !/persistCameraPrefs\(\{\s*selectedWidth:sz\.width[\s\S]{0,80}selectedHeight:sz\.height[\s\S]{0,120}\}\);[\s\S]{0,40}starting=false/.test(
    preview.replace(/\s+/g, ' ')
  ) || /wantPreview&&sz\.width/.test(preview),
  'persist of actual size is gated (not unconditional after gUM)'
);
assert(
  /paCamEnter\.setDrawerUiPaused\(false\)/.test(drawer),
  'camera panel unpauses drawer camera tracks before preview'
);

const enhancer = fs.readFileSync(
  path.join(root, 'src/js/features/camera/camera-video-enhancer.js'),
  'utf8'
);
assert(
  /lazy/.test(enhancer) &&
    !/addEventListener\(\s*['"]DOMContentLoaded['"]/.test(enhancer),
  'camera enhancer does not auto-init on DOMContentLoaded'
);

if (fail) {
  console.error('\n' + fail + ' failure(s)');
  process.exit(1);
}
console.log('\nAll camera detect capture contracts passed.');
