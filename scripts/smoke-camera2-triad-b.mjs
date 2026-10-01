/**
 * Camera2 triad-B workbench — static smoke (no browser).
 * Asserts catalog maps to real presence bind keys + feature kinds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsPath = path.join(root, 'src/js/features/camera/camera2-workbench.js');
const cssPath = path.join(root, 'src/css/camera2-workbench.css');
const htmlPath = path.join(root, 'src/index.html');

const js = fs.readFileSync(jsPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const html = fs.readFileSync(htmlPath, 'utf8');

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(js.includes("DATA_READY='camera2-triad-b-v8'"), 'data-ready bump missing');
assert(js.includes('resolveBind'), 'resolveBind missing');
assert(js.includes('addCatalogItem'), 'addCatalogItem missing');
assert(js.includes("defaultBind:'pressCtrlI'"), 'hand gesture default bind missing');
assert(js.includes('camera2LookPreview'), 'look preview video missing');
assert(js.includes('data-look-tab'), 'look tabs missing');
assert(js.includes('c2Res'), 'resolution select missing');
assert(js.includes('data-mask'), 'mask grid missing');
assert(js.includes('data-enh-level'), 'level rows missing');
assert(js.includes('c2CompareBtn'), 'compare button missing');
assert(js.includes('antiFlicker'), 'antiFlicker missing');
assert(js.includes('displayFrameRate'), 'displayFrameRate missing');
assert(js.includes('brightness'), 'brightness slider missing');
assert(js.includes('faceMask'), 'faceMask wiring missing');
assert(js.includes('var GOALS=['), 'GOALS shell missing');
assert(js.includes('setGoalOn'), 'setGoalOn missing');
assert(js.includes('data-switch-goal'), 'goal switch missing');
assert(js.includes('c2AtomsBtn'), 'atoms detail door missing');
assert(js.includes('我想要'), 'goal mental model copy missing');
assert(js.includes("setGoalOn('privacy',true)"), 'recommend must enable privacy goal');
assert(js.includes("setGoalOn('meeting',true)"), 'recommend must enable meeting goal');
assert(js.includes("setGoalOn('gesture',false)"), 'recommend must leave gesture off');
assert(!js.includes('applyRecommendedPresencePrefs'), 'Camera2 recommend must not reuse Camera1 gesture pack');
assert(!js.includes("data-dim=\"task\""), 'old task/trig dim must be removed from markup');
assert(css.includes('#camera2Mount'), 'mount token scope missing');
assert(css.includes('button.c2-look-card'), 'look card button css missing');
assert(css.includes('button.c2-pill-btn'), 'pill button css missing');
assert(css.includes('.c2-look-hero'), 'look hero css missing');
assert(css.includes('.c2-look-tab'), 'look tab css missing');
assert(css.includes('.c2-goal'), 'goal card css missing');
assert(css.includes('.c2-cause'), 'cause row css missing');
assert(html.includes('摄像头 · 目标') || html.includes('homeWbNavCamera2'), 'nav label missing');

/* resolveBind must not leave adds on none when catalog default is none */
assert(js.includes('function resolveBind'), 'resolveBind fn missing');
assert(js.includes('function addCatalogItem'), 'addCatalogItem fn missing');
assert(js.includes("trigs[item.trigKey]=true"), 'trigger enable on add missing');
assert(js.includes('patch.enabled=true') || js.includes('patch.enabled=true'), 'master enable on add missing');
assert(js.includes('OneToneCamera2Workbench'), 'export missing');
assert(js.includes("bindKey:'onAway'"), 'onAway mapping missing');
assert(js.includes("bindKey:'wave'"), 'wave mapping missing');
assert(js.includes("trigKey:'openPalm'"), 'openPalm trigger missing');
assert(js.includes('function applyRecommend'), 'recommend wiring missing');
assert(js.includes('requireActivationHub'), 'hub gate missing');
assert(js.includes('persistProFeatures'), 'glance feature wiring missing');
assert(js.includes('writeSettings'), 'feature writeSettings missing');
assert(js.includes('c2-ov'), 'modal shell missing in js');
assert(css.includes('.c2-root'), 'css shell missing');
assert(css.includes('.c2-desk'), 'css desk missing');
assert(html.includes('camera2-workbench.css'), 'css link missing');
assert(html.includes('camera2-workbench.js'), 'js script missing');
assert(html.includes('id="camera2Mount"'), 'mount missing');
/* Camera1 panel must still exist unchanged as reference */
assert(html.includes('id="settingsPanelCamera"'), 'Camera1 panel missing');
assert(html.includes('id="settingsPanelCamera2"'), 'Camera2 panel missing');

const requiredBindKeys = ['onAway', 'onReturn', 'shakeHead', 'deliberateBlink', 'openPalm', 'okHand', 'fist', 'wave'];
for (const k of requiredBindKeys) {
  assert(js.includes(`bindKey:'${k}'`), `catalog missing bindKey ${k}`);
}

const requiredFeatures = ['automute', 'track', 'snap', 'wellness', 'guard'];
for (const f of requiredFeatures) {
  assert(js.includes(`feature:'${f}'`), `catalog missing feature ${f}`);
}

console.log('smoke-camera2-triad-b: ok');
