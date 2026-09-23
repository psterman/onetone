'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var bridge = fs.readFileSync(
  path.join(root, 'src/js/features/agent/agent-page-preview-bridge.js'),
  'utf8'
);
var agentPage = fs.readFileSync(
  path.join(root, 'src/agent-proto/agent-page.html'),
  'utf8'
);
var padUi = fs.readFileSync(
  path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'),
  'utf8'
);
var index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var drawer = fs.readFileSync(
  path.join(root, 'src/js/features/settings/settings-drawer.js'),
  'utf8'
);

assert.ok(bridge.includes('OneToneAgentPagePreviewBridge'));
assert.ok(bridge.includes('ot-agent-preview'));
assert.ok(bridge.includes('renderHardwarePad'));
assert.ok(bridge.includes("stripMode: 'full'"));
assert.ok(bridge.includes('omitFaceTopbar: false'));
assert.ok(bridge.includes('renderAgentMiniBarPreview'));
assert.ok(bridge.includes("cmd === 'setMiniPreview'"));
assert.ok(bridge.includes("cmd === 'setLeftPreview'"));
assert.ok(bridge.includes('miniRail'));
assert.ok(bridge.includes('rail: lastMiniRail'));
assert.ok(bridge.includes('renderAgentSettingsLeftPreview'));
assert.ok(padUi.includes('renderAgentMiniBarPreview: renderAgentMiniBarPreview'));
assert.ok(padUi.includes('renderAgentSettingsLeftPreview'));
assert.ok(padUi.includes('demoMiniBarChipsHtml'));
assert.ok(padUi.includes('opts.rail != null'));
assert.ok(agentPage.includes('codex-micro-pad.css'));
assert.ok(agentPage.includes('soft-pad-hub.css'));
assert.ok(agentPage.includes('agentPadPaint'));
assert.ok(agentPage.includes('agentMiniPaint'));
assert.ok(agentPage.includes('ot-agent-preview'));
assert.ok(agentPage.includes('setMiniPreview'));
assert.ok(agentPage.includes('setLeftPreview'));
assert.ok(agentPage.includes('postLeftPreview'));
assert.ok(agentPage.includes('data-mini-chrome'));
assert.ok(agentPage.includes('postMiniPreview'));
assert.ok(agentPage.includes('data-occupy-tog'));
assert.ok(!agentPage.includes('id="padKeys"'));
assert.ok(!agentPage.includes('id="barBig"'));
assert.ok(index.includes('agent-page-preview-bridge.js'));
assert.ok(drawer.includes('OneToneAgentPagePreviewBridge'));

console.log('ok agent-page-preview-bridge');
