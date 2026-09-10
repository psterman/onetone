'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var wf = fs.readFileSync(path.join(root, 'src/js/features/camera/camera-workflow.js'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/camera-workflow.css'), 'utf8');
var presence = fs.readFileSync(path.join(root, 'src/js/features/camera/camera-presence-actions.js'), 'utf8');
var agent = fs.readFileSync(path.join(root, 'src/js/features/agent/agent-actions.js'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(wf.indexOf("PRO_SUBTABS=['vision','calib','privacy','beauty'") >= 0, 'PRO_SUBTABS has calib after vision, no device');
assert.ok(wf.indexOf("var currentProSubtab='vision'") >= 0, 'default pro subtab is vision');
assert.ok(wf.indexOf("TABS=['pro']") >= 0, 'single top tab pro');
assert.ok(wf.indexOf('bindProSafetyCtas') < 0, 'safety CTA binder removed');
assert.ok(wf.indexOf("getProSubtabs:function()") >= 0, 'getProSubtabs exported');
assert.ok(wf.indexOf("activateProSubtab('calib')") >= 0, 'calib deep-link');
assert.ok(wf.indexOf('cameraProDeviceRail') >= 0, 'device rail deep-link');

assert.ok(html.indexOf('id="cameraProSubVision"') >= 0, 'vision panel in HTML');
assert.ok(html.indexOf('id="cameraProDeviceRail"') >= 0, 'device rail in HTML');
assert.ok(html.indexOf('id="cameraProSubCalib"') >= 0, 'calib panel in HTML');
assert.ok(html.indexOf('id="cameraProSubDevice"') < 0, 'device subpanel removed');
assert.ok(html.indexOf('data-pro-subtab="device"') < 0, 'device subtab removed');
assert.ok(html.indexOf('id="cameraProSubSafety"') < 0, 'safety panel removed');
assert.ok(html.indexOf('data-pro-subtab="calib"') >= 0 && html.indexOf('cameraProSubtabCalib') >= 0);
assert.ok(html.indexOf('id="cameraPanelAction"') < 0, 'standalone action panel removed');
assert.ok(html.indexOf('立即发送') < 0, 'no immediate-send CTA copy in HTML');

function countId(id) {
  var n = 0;
  var pos = 0;
  var needle = 'id="' + id + '"';
  while ((pos = html.indexOf(needle, pos)) >= 0) {
    n++;
    pos += needle.length;
  }
  return n;
}
['cameraHeroPreview', 'cameraMediaSettings', 'cameraRuntimeStatus', 'cameraCalibBlock', 'cameraDeviceSelect'].forEach(function (id) {
  assert.strictEqual(countId(id), 1, id + ' unique');
});

var hostAt = html.indexOf('id="cameraProPreviewHost"');
var railAt = html.indexOf('id="cameraProDeviceRail"');
var stackAt = html.indexOf('id="cameraProStack"');
var mediaAt = html.indexOf('id="cameraMediaSettings"');
assert.ok(hostAt >= 0 && railAt > hostAt && railAt < stackAt, 'device rail under preview host before stack');
assert.ok(mediaAt > railAt && mediaAt < stackAt, 'media settings in left rail');

assert.ok(css.indexOf('minmax(280px,.92fr) minmax(0,1.08fr)') >= 0, 'pro workbench two columns');
assert.ok(css.indexOf('.camera-pro-device-rail') >= 0, 'device rail css');

assert.ok(presence.indexOf('buildCameraSendGuardModel') >= 0);
assert.ok(presence.indexOf("openProPanel('cameraCalibBlock')") >= 0, 'blink recalib opens calib');

assert.ok(agent.indexOf("cameraRecommendedActionIds") >= 0);
assert.ok(!/cameraRecommendedActionIds\(\)\s*\{[^}]*stopOrSendDictation/s.test(agent), 'camera recommended ids exclude stopOrSend');

assert.ok(i18n.indexOf("cameraProSubtabVision:'视觉识别'") >= 0);
assert.ok(i18n.indexOf("cameraProSubtabCalib:'校准'") >= 0);
assert.ok(i18n.indexOf("cameraPanelProTitle:'Pro 确认与安全'") >= 0);

console.log('camera-pro-safety.test.js: ok');
