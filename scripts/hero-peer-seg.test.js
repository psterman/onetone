const fs = require('fs');
const h = fs.readFileSync('src/index.html', 'utf8');
const cssSp = fs.readFileSync('src/css/soft-pad-hub.css', 'utf8');
const cssCam = fs.readFileSync('src/css/camera-workflow.css', 'utf8');
const hub = fs.readFileSync('src/js/features/agent/soft-pad-hub-ui.js', 'utf8');
const cam = fs.readFileSync('src/js/features/camera/camera-workflow.js', 'utf8');

function check(name, cond) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name);
  return cond ? 0 : 1;
}

let fail = 0;
// Soft Pad face-seg retired → five padMode tabs (显示/键位/用途/灯效/迷你栏)
fail += check('soft-pad five pad tabs',
  h.includes('data-pad-mode="lights"') && h.includes('data-pad-mode="mini"') &&
  !h.includes('id="softPadFlowNodes"'));
fail += check('camera pro host + subtaps', h.includes('cameraProPreviewHost') && h.includes('cameraProDeviceRail') && h.includes('data-pro-subtab="calib"'));
fail += check('camera device not a subtab', !h.includes('data-pro-subtab="device"') && !h.includes('id="cameraProSubDevice"'));
fail += check('camera action panel gone', !h.includes('id="cameraPanelAction"'));
fail += check('no softpad flow grad', !h.includes('softPadFlowGrad'));
fail += check('no camera flow grad', !h.includes('cameraFlowGrad'));
fail += check('keep keys flow', h.includes('keysFlowGrad'));
fail += check('keep voice flow', h.includes('voiceFlowGrad'));
fail += check('camera pro hint host', h.includes('id="cameraFlowNodeProHint"'));
fail += check('softpad agent deep-link → lights',
  hub.includes("setSoftPadPadMode('lights'") && hub.includes("function isAgentWorkbenchMode"));
fail += check('camera parks preview in pro', cam.includes('cameraProPreviewHost') && cam.includes("PRO_SUBTABS=['vision','calib'"));
fail += check('softpad pad tabs css', cssSp.includes('.soft-pad-pad-tabs') || fs.readFileSync('src/css/ot-seg.css', 'utf8').includes('.soft-pad-pad-tabs'));
fail += check('camera two-col workbench', cssCam.includes('minmax(280px,.92fr) minmax(0,1.08fr)') && cssCam.includes('.camera-pro-device-rail'));

console.log('[hero-peer-seg] ' + (fail ? fail + ' failed' : 'all passed'));
process.exit(fail ? 1 : 0);
