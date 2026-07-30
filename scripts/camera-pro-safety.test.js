#!/usr/bin/env node
'use strict';

/**
 * #4a/#4b Camera Pro safety IA + Send Guard 静态护栏（不碰 MediaPipe）。
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

assert.ok(wf.indexOf("PRO_SUBTABS=['safety','privacy','beauty'") >= 0, 'PRO_SUBTABS starts with safety');
assert.ok(wf.indexOf("var currentProSubtab='safety'") >= 0, 'default pro subtab is safety');
assert.ok(wf.indexOf('bindProSafetyCtas') >= 0, 'safety CTAs bound');
assert.ok(wf.indexOf("getProSubtabs:function()") >= 0, 'getProSubtabs exported');

assert.ok(html.indexOf('id="cameraProSubSafety"') >= 0, 'safety panel in HTML');
assert.ok(html.indexOf('id="cameraProSendGuardCard"') >= 0, 'send guard card in HTML');
assert.ok(html.indexOf('data-pro-subtab="safety"') >= 0 && html.indexOf('cameraProSubtabSafety') >= 0);
assert.ok(html.indexOf('data-camera-pro-safety-act="rules"') >= 0);
assert.ok(html.indexOf('data-camera-pro-safety-act="probe"') >= 0);
assert.ok(html.indexOf('data-camera-pro-safety-act="preview"') >= 0);
assert.ok(html.indexOf('立即发送') < 0, 'no immediate-send CTA copy in HTML');
assert.ok(/id="cameraProSubBeauty"[^>]*hidden/.test(html) || html.indexOf('data-pro-subpanel="beauty"') >= 0 && html.indexOf('cameraProSubBeauty') >= 0);

assert.ok(presence.indexOf('buildCameraSendGuardModel') >= 0);
assert.ok(presence.indexOf('allowsDirectSend:false') >= 0);
assert.ok(presence.indexOf("visionOutcome:'pendingConfirm'") >= 0);
assert.ok(presence.indexOf('isSendClassAction') >= 0);
assert.ok(presence.indexOf("reason:'send_guard'") >= 0);

assert.ok(agent.indexOf("return ['openAgent', 'startDictation', 'cancel', 'status', 'commandPalette']") >= 0);
assert.ok(agent.indexOf("cameraRecommendedActionIds") >= 0);
assert.ok(!/cameraRecommendedActionIds\(\)\s*\{[^}]*stopOrSendDictation/s.test(agent), 'camera recommended ids exclude stopOrSend');

assert.ok(i18n.indexOf("cameraProSubtabSafety:'安全'") >= 0);
assert.ok(i18n.indexOf("cameraProHardRule:") >= 0);
assert.ok(i18n.indexOf("cameraPanelProTitle:'Pro 确认与安全'") >= 0);
assert.ok(i18n.indexOf("cameraFlowNodeProTitle:'Pro 确认与安全'") >= 0);
assert.ok(i18n.indexOf("cameraFlowNodeProHint:'确认 · 安全 · 隐私'") >= 0);

console.log('camera-pro-safety.test.js: ok');
