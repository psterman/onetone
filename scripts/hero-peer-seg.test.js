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
fail += check('soft-pad ot-seg markup', h.includes('soft-pad-face-seg') && h.includes('data-soft-pad-node="pad"'));
fail += check('camera pro host + subtaps', h.includes('cameraProPreviewHost') && h.includes('cameraProDeviceRail') && h.includes('data-pro-subtab="calib"'));
fail += check('camera device not a subtab', !h.includes('data-pro-subtab="device"') && !h.includes('id="cameraProSubDevice"'));
fail += check('camera action panel gone', !h.includes('id="cameraPanelAction"'));
fail += check('no softpad flow grad', !h.includes('softPadFlowGrad'));
fail += check('no camera flow grad', !h.includes('cameraFlowGrad'));
fail += check('keep keys flow', h.includes('keysFlowGrad'));
fail += check('keep voice flow', h.includes('voiceFlowGrad'));
fail += check('camera pro hint host', h.includes('id="cameraFlowNodeProHint"'));
fail += check('softpad click data attr', hub.includes("closest('[data-soft-pad-node]')"));
fail += check('camera parks preview in pro', cam.includes('cameraProPreviewHost') && cam.includes("PRO_SUBTABS=['vision','calib'"));
fail += check('softpad face-seg css', cssSp.includes('.soft-pad-face-seg'));
fail += check('camera two-col workbench', cssCam.includes('minmax(280px,.92fr) minmax(0,1.08fr)') && cssCam.includes('.camera-pro-device-rail'));

console.log('[hero-peer-seg] ' + (fail ? fail + ' failed' : 'all passed'));
process.exit(fail ? 1 : 0);
