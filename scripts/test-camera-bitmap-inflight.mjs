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
check('可调 detectIntervalMs', hand.includes('function setDetectIntervalMs'));
check('慢 bitmap 退避', hand.includes('took>80'));

const presence = readFileSync(join(root, 'src/js/features/camera/camera-presence-actions.js'), 'utf8');
console.log('[camera-bitmap] presence home throttle:');
check('DETECT_HOME_MS', presence.includes('DETECT_HOME_MS=200'));
check('clampDetectIntervalMs', presence.includes('function clampDetectIntervalMs'));
check('clamp 不因 gaze.enabled 旁路首页', /gazeOn/.test(presence)===false || !/if\(gazeOn\) return ms;/.test(presence));
check('sync 把手势间隔一并节流', presence.includes('hand.setDetectIntervalMs'));
check('renderHeroUi 有 sig 去重', presence.includes('lastHeroSig'));
check('onFrame 打 presenceFrame tag', presence.includes("presenceFrame"));

const preview = readFileSync(join(root, 'src/js/features/camera/camera-preview.js'), 'utf8');
console.log('[camera-bitmap] preview home gate:');
check('hand 需手势绑定或 camera 面板', preview.includes('handGestureWanted') && preview.includes('cameraPanelHot'));
check('presence 首页仍允许 preview/gaze', preview.includes('Presence home still runs getUserMedia + gaze'));
check('无全量 cameraWanted 禁 startPreview', !/function cameraWanted\b/.test(preview) && preview.includes('function startPreview'));
check('attach 不强制开 gaze overlay', preview.includes('Do not force gaze overlay'));
check('presence 首页不覆盖间隔', preview.includes('Presence already applied DETECT_HOME_MS'));

const shell = readFileSync(join(root, 'src/js/features/home/home-shell.js'), 'utf8');
const wb = readFileSync(join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
const panels = readFileSync(join(root, 'src/js/features/home/home-workbench-panels.js'), 'utf8');
console.log('[camera-bitmap] home paint:');
check('renderHome 不双刷 workbench', /HomeWorkbench\.applyLang\(\);\s*global\.OneToneHomeWorkbench\.render\(\)/.test(shell)===false);
check('applyLang 不 forceHomeRender', !/forceHomeRender\(\);\s*\n\s*\}?\s*\n?\s*if\(global\.OneToneHomeWorkbench&&global\.OneToneHomeWorkbench\.render\)/.test(wb));
check('softPad snapshot 节流', panels.includes('softPadHowToSnapshot._lastRefreshAt'));

const langSettings = readFileSync(join(root, 'src/js/core/app-lang-settings.js'), 'utf8');
const bus = readFileSync(join(root, 'src/js/core/webview-bus.js'), 'utf8');
console.log('[camera-bitmap] settings/boot paint:');
check('applyLang 关抽屉不刷 SceneModeHub', langSettings.includes('if(ui&&ui.drawerOpen) global.OneToneSceneModeHub.render()'));
check('voice diag 仅 voice 面板', langSettings.includes("settingsPanel==='voiceWake'"));
check('soft_pad settle dirty 标记', bus.includes('softPadHomeDirty'));
check('soft_pad settle 后 whenBootSettled 补绘', bus.includes('whenBootSettled(flushSoftPadHomeDirty)'));
check('soft_pad 启动期不立刻 forceHome', bus.includes('markSoftPadHomeDirty()'));

console.log(`[camera-bitmap] ${pass} 通过 / ${fail} 失败`);
if (fail > 0) process.exit(1);
