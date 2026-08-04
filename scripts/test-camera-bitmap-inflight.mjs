// Guard: createImageBitmap must not stack while prior bitmap/detect is in flight (WebView2 假死).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log('  PASS ' + name);
  } else {
    fail++;
    console.error('  FAIL ' + name);
  }
}

const gaze = readFileSync(join(root, 'src/js/features/camera/camera-gaze-landmarker.js'), 'utf8');
const hand = readFileSync(join(root, 'src/js/features/camera/camera-hand-gesture.js'), 'utf8');

console.log('[camera-bitmap] gaze:');
check('有 bitmapInFlight', gaze.includes('var bitmapInFlight=false'));
check('detectOnce 跳过叠帧', /if\(bitmapInFlight\|\|detectInFlight\) return;/.test(gaze));
check('tag cameraBitmap', gaze.includes("setActivityTag('cameraBitmap')"));
check('pause/stop 清 bitmapInFlight', /bitmapInFlight=false/.test(gaze) && gaze.includes('function pauseInfer'));

console.log('[camera-bitmap] hand:');
check('有 bitmapInFlight', hand.includes('var bitmapInFlight=false'));
check('detectOnce 跳过叠帧', /if\(bitmapInFlight\|\|detectInFlight\) return;/.test(hand));
check('tag cameraHandBitmap', hand.includes("setActivityTag('cameraHandBitmap')"));

const presence = readFileSync(join(root, 'src/js/features/camera/camera-presence-actions.js'), 'utf8');
console.log('[camera-bitmap] presence home throttle:');
check('DETECT_HOME_MS', presence.includes('DETECT_HOME_MS=200'));
check('clampDetectIntervalMs', presence.includes('function clampDetectIntervalMs'));
check('renderHeroUi 有 sig 去重', presence.includes('lastHeroSig'));
check('onFrame 打 presenceFrame tag', presence.includes("presenceFrame"));

console.log(`[camera-bitmap] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
