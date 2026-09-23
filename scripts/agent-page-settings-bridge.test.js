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
assert.ok(agentPage.includes('data-soft-pad'));
assert.ok(agentPage.includes('data-sub="softPad"'));
assert.ok(!agentPage.includes('data-sub="connect"'));
assert.ok(!agentPage.includes('data-sub="lights"'));
assert.ok(agentPage.includes('键盘顶栏'));
assert.ok(agentPage.includes("data-soft-pad','numpad'"));
assert.ok(agentPage.includes('替换数字键盘'));
assert.ok(!agentPage.includes('开关·继续'));
assert.ok(!agentPage.includes('开关 · 继续'));
assert.ok(agentPage.includes('三叶'));
assert.ok(!agentPage.includes('data-sub="keys"'));
assert.ok(!agentPage.includes("data-soft-pad','ambient'"));
assert.ok(agentPage.includes("data-soft-pad','lights'"));
assert.ok(agentPage.includes("data-soft-pad','hook'"));
assert.ok(agentPage.includes("data-soft-pad','topbar'"));
assert.ok(!agentPage.includes("data-soft-pad','voice'"));
assert.ok(!agentPage.includes("data-float','voice'"));
assert.ok(!/聆听口令/.test(agentPage));
assert.ok(agentPage.includes('浮窗 ≠ Soft Pad ≠ 迷你栏'));
assert.ok(agentPage.includes('接入 Agent'));
assert.ok(agentPage.includes('data-agent-hook'));
assert.ok(agentPage.includes('data-settings-act="') && agentPage.includes('data-agent="'));
assert.ok(agentPage.includes('keys-gain') || agentPage.includes('keysGain'));
assert.ok(agentPage.includes('一句话说清') || agentPage.includes('paintKeysGain'));
assert.ok(agentPage.includes('data-numpad-wizard'));
assert.ok(agentPage.includes('你想让数字键帮你做什么'));
assert.ok(agentPage.includes('一起改（推荐）'));
assert.ok(agentPage.includes('保持打数字'));
assert.ok(agentPage.includes('开始使用'));
assert.ok(agentPage.includes('nw-opt') || agentPage.includes('numpadWizard'));
assert.ok(!agentPage.includes('keys-choice'));
assert.ok(!agentPage.includes('keys-block'));
assert.ok(!agentPage.includes('split-note'));
assert.ok(!agentPage.includes('旧名「开关继续」'));
assert.ok(!agentPage.includes('AG 键变成什么'));
assert.ok(!agentPage.includes('占用成快捷'));
assert.ok(!agentPage.includes('purposeSeg'));
assert.ok(agentPage.includes('data-hook-mode'));
assert.ok(agentPage.includes('hook-modes'));
assert.ok(agentPage.includes('监视中'));
assert.ok(agentPage.includes('data-hook-add') || agentPage.includes('hook-dock'));
assert.ok(agentPage.includes('hook-watch-list') || agentPage.includes('hook-watch-row'));
assert.ok(agentPage.includes('hook-dock--inline'));
assert.ok(agentPage.includes('hook-grid'));
assert.ok(agentPage.includes('data-hook-search'));
assert.ok(!agentPage.includes('data-hook-filter'));
assert.ok(!agentPage.includes('data-pad-enabled-tog'));
assert.ok(!agentPage.includes('打开 Soft Pad</span>'));
assert.ok(agentPage.includes('data-keylight-scheme'));
assert.ok(agentPage.includes('一盏') || agentPage.includes('一盏键灯'));
assert.ok(agentPage.includes('跟随紧急状态'));
assert.ok(agentPage.includes('自定义颜色'));
assert.ok(agentPage.includes('何时用'));
assert.ok(!agentPage.includes('>跟随状态</'));
assert.ok(!agentPage.includes('>固定色</'));
assert.ok(!agentPage.includes('盘边氛围灯'));
assert.ok(agentPage.includes('data-keylight-preset'));
assert.ok(!agentPage.includes('data-key-lights-tog'));
assert.ok(agentPage.includes("leaf==='hook'") || agentPage.includes("softPad==='hook'"));
assert.ok(agentPage.includes('接入对照 · Soft Pad'));
assert.ok(src.includes("cmd === 'setKeyLightScheme'"));
assert.ok(src.includes('setKeyLightScheme'));
assert.ok(src.includes('keyLightPreset'));
assert.ok(agentPage.includes('padPlaceRail'));
assert.ok(agentPage.includes('padPlacePill'));
assert.ok(agentPage.includes('data-busy-off'));
assert.ok(agentPage.includes('data-pad-topbar-preview'));
assert.ok(agentPage.includes('aspect-ratio:auto'));
assert.ok(agentPage.includes('paintTopbarPreview'));
assert.ok(!agentPage.includes('padPlaceBusy'));
assert.ok(agentPage.includes('data-topbar-move'));
assert.ok(agentPage.includes('topbar-legend'));
assert.ok(agentPage.includes('展示位置'));
assert.ok(src.includes('topbar'));
assert.ok(src.includes('TOPBAR_CORE'));
assert.ok(src.includes("agent: 'workbuddy'"));
assert.ok(src.includes("agent: 'aider'"));
assert.ok(src.includes('statusByKind'));
assert.ok(src.includes('data.agent'));
assert.ok(agentPage.includes('data-float-opacity'));
assert.ok(agentPage.includes('浮窗透明度'));
assert.ok(agentPage.includes('paintFloatOpacity'));
assert.ok(agentPage.includes('data-settings-act'));
assert.ok(agentPage.includes('postSettingsCmd'));
assert.ok(!/badge warn">还没接上</.test(agentPage));
assert.ok(agentPage.includes('phaseBadgeHtml') || agentPage.includes('phaseLabel'));

var snapRoster = bridge.projectSettingsSnapshot({
  kind: 'cursor',
  app: 'Cursor',
  pad: {
    enabled: true,
    cursorStatusLightsEnabled: true,
    codexStatusLightsEnabled: false
  },
  statusByKind: {
    cursor: { tokenOk: true, lightStatus: 'busy' },
    codex: { panelPhase: 'not_configured' }
  }
});
assert.ok(Array.isArray(snapRoster.topbar.agents));
assert.strictEqual(snapRoster.topbar.agents.length, 16);
var cursorRow = snapRoster.topbar.agents.filter(function (a) {
  return a.agent === 'cursor';
})[0];
var codexRow = snapRoster.topbar.agents.filter(function (a) {
  return a.agent === 'codex';
})[0];
assert.ok(cursorRow && cursorRow.enabled === true);
assert.ok(codexRow && codexRow.enabled === false);
assert.strictEqual(cursorRow.phase, 'connected');
assert.strictEqual(codexRow.phase, 'not_configured');

var index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
assert.ok(index.includes('agent-page-settings-bridge.js'));

var drawer = fs.readFileSync(
  path.join(root, 'src/js/features/settings/settings-drawer.js'),
  'utf8'
);
assert.ok(drawer.includes('OneToneAgentPageSettingsBridge'));

console.log('ok agent-page-settings-bridge');
