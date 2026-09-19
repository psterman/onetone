'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');

// Soft Pad connect helpers before settings bridge (phaseOf / phaseLabel).
require(path.join(root, 'src/js/features/agent/soft-pad-connect-status.js'));
var bridge = require(path.join(
  root,
  'src/js/features/agent/agent-page-settings-bridge.js'
));

assert.strictEqual(bridge.MSG_TYPE, 'ot-agent-settings');
assert.strictEqual(bridge.CMD_TYPE, 'ot-agent-settings-cmd');
assert.strictEqual(bridge.kindFromApp('Cursor'), 'cursor');
assert.strictEqual(bridge.kindFromApp('Codex'), 'codex');
assert.strictEqual(bridge.appFromKind('claude'), 'Claude');

assert.ok(/没接上/.test(bridge.connectJobLead('not_configured', 'Codex')));
assert.ok(!/还没接上/.test(bridge.connectJobLead('connected', 'Codex')));
assert.ok(/已接通/.test(bridge.connectJobLead('connected', 'Codex')));
assert.ok(/等待/.test(bridge.connectJobLead('waiting', 'Cursor')));

var snapNeed = bridge.projectSettingsSnapshot({
  kind: 'codex',
  app: 'Codex',
  pad: {
    enabled: true,
    ambientEnabled: true,
    ambientMode: 'status',
    ambientOpacity: 100,
    codexStatusLightsEnabled: false
  },
  status: { panelPhase: 'not_configured' }
});
assert.strictEqual(snapNeed.connect.phase, 'not_configured');
assert.ok(snapNeed.connect.phaseLabel.indexOf('接入') >= 0);
assert.ok(/没接上/.test(snapNeed.connect.jobLead));
assert.ok(snapNeed.connect.phaseLabel !== '还没接上');

var snapOk = bridge.projectSettingsSnapshot({
  kind: 'codex',
  app: 'Codex',
  pad: { enabled: true, ambientEnabled: false, codexStatusLightsEnabled: true },
  status: { panelPhase: 'connected' }
});
assert.strictEqual(snapOk.connect.phase, 'connected');
assert.strictEqual(snapOk.connect.phaseLabel, '已接入');
assert.ok(!/还没接上/.test(snapOk.connect.jobLead));
assert.ok(/已接通/.test(snapOk.connect.jobLead));
assert.strictEqual(snapOk.ambient.enabled, false);
assert.strictEqual(snapOk.keyLights.enabled, true);
assert.strictEqual(snapOk.padEnabled, true);

var src = fs.readFileSync(
  path.join(root, 'src/js/features/agent/agent-page-settings-bridge.js'),
  'utf8'
);
assert.ok(src.includes("cmd === 'setPadEnabled'"));
assert.ok(src.includes("cmd === 'setAmbient'"));
assert.ok(src.includes("cmd === 'setScreenOpacity'"));
assert.ok(src.includes("cmd === 'setAgentLights'"));
assert.ok(src.includes("cmd === 'refreshConnect'"));
assert.ok(src.includes("cmd === 'copyHookConfig'"));
assert.ok(src.includes("cmd === 'enableCursorActivity'"));
assert.ok(src.includes("cmd === 'selectAgent'"));
assert.ok(src.includes('setScreenOpacity'));
assert.ok(src.includes('screenOpacity'));
assert.ok(src.includes('cmd_codex_micro_pad_set_flags'));
assert.ok(src.includes('cmd_soft_pad_agent_lights_set'));

var agentPage = fs.readFileSync(
  path.join(root, 'src/agent-proto/agent-page.html'),
  'utf8'
);
assert.ok(agentPage.includes('ot-agent-settings'));
assert.ok(agentPage.includes('ot-agent-settings-cmd'));
assert.ok(agentPage.includes('connectJobBody'));
assert.ok(agentPage.includes('data-pad-enabled-tog'));
assert.ok(agentPage.includes('data-key-lights-tog'));
assert.ok(agentPage.includes('data-float-opacity'));
assert.ok(agentPage.includes('浮窗透明度'));
assert.ok(agentPage.includes('paintFloatOpacity'));
assert.ok(agentPage.includes('data-settings-act'));
assert.ok(agentPage.includes('postSettingsCmd'));
assert.ok(!/badge warn">还没接上</.test(agentPage));
assert.ok(agentPage.includes('phaseBadgeHtml') || agentPage.includes('phaseLabel'));

var index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
assert.ok(index.includes('agent-page-settings-bridge.js'));

var drawer = fs.readFileSync(
  path.join(root, 'src/js/features/settings/settings-drawer.js'),
  'utf8'
);
assert.ok(drawer.includes('OneToneAgentPageSettingsBridge'));

console.log('ok agent-page-settings-bridge');
