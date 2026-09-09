#!/usr/bin/env node
'use strict';

/**
 * Camera Pro IA + Send Guard 静态护栏（不碰 MediaPipe）。
 * 安全说明页已下线；发送护栏仍在运行时生效。
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var wf = fs.readFileSync(path.join(root, 'src/js/features/camera/camera-workflow.js'), 'utf8');
var presence = fs.readFileSync(path.join(root, 'src/js/features/camera/camera-presence-actions.js'), 'utf8');
var agent = fs.readFileSync(path.join(root, 'src/js/features/agent/agent-actions.js'), 'utf8');
var i18n = fs.readFileSync(path.join(root, 'src/js/core/i18n.js'), 'utf8');

assert.ok(wf.indexOf("PRO_SUBTABS=['vision','privacy','beauty'") >= 0, 'PRO_SUBTABS starts with vision, no safety');
assert.ok(wf.indexOf("var currentProSubtab='vision'") >= 0, 'default pro subtab is vision');
assert.ok(wf.indexOf("TABS=['pro','action']") >= 0, 'top tabs are pro then action');
assert.ok(wf.indexOf('bindProSafetyCtas') < 0, 'safety CTA binder removed');
assert.ok(wf.indexOf("getProSubtabs:function()") >= 0, 'getProSubtabs exported');

assert.ok(html.indexOf('id="cameraProSubVision"') >= 0, 'vision panel in HTML');
assert.ok(html.indexOf('id="cameraProSubSafety"') < 0, 'safety panel removed');
assert.ok(html.indexOf('cameraProSubtabSafety') < 0, 'safety subtab removed');
assert.ok(html.indexOf('data-pro-subtab="safety"') < 0, 'no safety subtab attr');
assert.ok(html.indexOf('data-pro-subtab="vision"') >= 0 && html.indexOf('cameraProSubtabVision') >= 0);
assert.ok(html.indexOf('data-camera-node="trigger"') < 0, 'top-level trigger node removed');
assert.ok(html.indexOf('id="cameraPanelTrigger"') < 0, 'standalone trigger panel removed');
assert.ok(html.indexOf('立即发送') < 0, 'no immediate-send CTA copy in HTML');
assert.ok(/id="cameraProSubBeauty"[^>]*hidden/.test(html) || html.indexOf('data-pro-subpanel="beauty"') >= 0 && html.indexOf('cameraProSubBeauty') >= 0);
assert.ok(html.indexOf('data-camera-node="pro"') < html.indexOf('data-camera-node="action"'), 'pro node before action');
assert.ok(/id="cameraFlowNodePro"[\s\S]*?M1 12s4-8 11-8/.test(html), 'pro uses vision eye icon');

assert.ok(presence.indexOf('buildCameraSendGuardModel') >= 0);
assert.ok(presence.indexOf('allowsDirectSend:false') >= 0);
assert.ok(presence.indexOf("visionOutcome:'pendingConfirm'") >= 0);
assert.ok(presence.indexOf('isSendClassAction') >= 0);
assert.ok(presence.indexOf("reason:'send_guard'") >= 0);

assert.ok(agent.indexOf("return ['openAgent', 'startDictation', 'cancel', 'status', 'commandPalette']") >= 0);
assert.ok(agent.indexOf("cameraRecommendedActionIds") >= 0);
assert.ok(!/cameraRecommendedActionIds\(\)\s*\{[^}]*stopOrSendDictation/s.test(agent), 'camera recommended ids exclude stopOrSend');

assert.ok(i18n.indexOf("cameraProSubtabVision:'视觉识别'") >= 0);
assert.ok(i18n.indexOf("cameraPanelProTitle:'Pro 确认与安全'") >= 0);
assert.ok(i18n.indexOf("cameraFlowNodeProTitle:'Pro 确认与安全'") >= 0);

console.log('camera-pro-safety.test.js: ok');
