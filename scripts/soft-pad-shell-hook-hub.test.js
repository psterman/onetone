#!/usr/bin/env node
'use strict';

/**
 * Soft Pad Hub: WorkBuddy / Trae / Qoder as Shell Hook Shortcuts.
 * Source-level checks (no DOM); complements agent-codex-micro Soft Pad Hub asserts.
 */
var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.join(__dirname, '..');
var hubSrc = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
var panelSrc = fs.readFileSync(path.join(root, 'src/js/features/agent/shell-agent-hook-panel.js'), 'utf8');
var presetsSrc = fs.readFileSync(path.join(root, 'src/js/app-target-presets.js'), 'utf8');
var indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var padUiSrc = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
var overlayHtml = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var runtimeCmd = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/soft_pad_runtime_cmd.rs'),
  'utf8'
);

assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?cursor-chat/.test(hubSrc), 'BUILTIN includes cursor');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?minimax-chat/.test(hubSrc), 'BUILTIN includes minimax');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?workbuddy-chat/.test(hubSrc), 'BUILTIN includes workbuddy');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?trae-chat/.test(hubSrc), 'BUILTIN includes trae');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?qoder-chat/.test(hubSrc), 'BUILTIN includes qoder');
assert.ok(hubSrc.indexOf('HUB_KIND_RANK') >= 0, 'hub kind rank');
assert.ok(
  /minimax:\s*3[\s\S]*?workbuddy:\s*4[\s\S]*?trae:\s*5[\s\S]*?qoder:\s*6/.test(hubSrc) ||
    hubSrc.indexOf('minimax: 3') >= 0,
  'order after cursor: minimax → workbuddy → trae → qoder'
);
assert.ok(hubSrc.indexOf('BUILTIN_SOFT_PAD_APPS.map') >= 0, 'scopes from BUILTIN map');
assert.ok(hubSrc.indexOf('data-scope') >= 0, 'switcher uses data-scope');
assert.ok(hubSrc.indexOf('data-lane-pin') < 0, 'no temporary pin chips');
assert.ok(hubSrc.indexOf('data-lane-follow') < 0, 'no follow chip');
assert.ok(
  runtimeCmd.indexOf('set_follow_pin(None)') >= 0 &&
    /cmd_soft_pad_set_follow[\s\S]*?set_follow_pin\(None\)/.test(runtimeCmd),
  'set_follow always clears pin'
);
var workflowIsland = fs.readFileSync(
  path.join(root, 'src-islands/islands/soft-pad-workflow-island.tsx'),
  'utf8'
);
assert.ok(workflowIsland.indexOf('soft-pad-app-switcher__chips') >= 0, 'switcher island flex host');
assert.ok(workflowIsland.indexOf("display: 'contents'") < 0, 'no display:contents hit-test flake');
assert.ok(hubSrc.indexOf('function ensureSwitcherClickBound') >= 0, 'switcher click ensure helper');
assert.ok(hubSrc.indexOf('addEventListener(\'click\', onSwitcherActivate, true)') >= 0 ||
  hubSrc.indexOf('addEventListener("click", onSwitcherActivate, true)') >= 0,
  'capture-phase switcher click');
assert.ok(hubSrc.indexOf('fromList: true') >= 0 && hubSrc.indexOf('function selectScope') >= 0,
  'selectScope uses same fromList path as aside');
assert.ok(
  hubSrc.indexOf('legacy owns DOM') >= 0 ||
    hubSrc.indexOf('React island owns this DOM when mounted') >= 0,
  'switcher stays legacy when island unmounted'
);
var mainIslands = fs.readFileSync(path.join(root, 'src-islands/main.tsx'), 'utf8');
assert.ok(mainIslands.indexOf("unmountIsland('softPadAppSwitcher')") >= 0, 'tears down switcher island');
assert.ok(indexHtml.indexOf('id="softPadSchemeAside"') >= 0 && indexHtml.indexOf('softPadSchemeAside" hidden') >= 0,
  'aside hidden by default — shown on agent face via CSS');
var hubCss = fs.readFileSync(path.join(root, 'src/css/soft-pad-hub.css'), 'utf8');
assert.ok(hubCss.indexOf('#softPadSchemeAside') >= 0 && /#softPadSchemeAside[\s\S]*?display:\s*none/.test(hubCss),
  'aside display none by default');
assert.ok(/\.soft-pad-page-body\.is-face-agent[\s\S]*?#softPadSchemeAside[\s\S]*?display:\s*flex/.test(hubCss),
  'aside visible on agent face');
assert.ok(hubSrc.indexOf('mountShellAgentHookPanel(paintHost') < 0,
  'hub does not mount shell hook into agent center column');
assert.ok(padUiSrc.indexOf('bindShellDiagOptional') >= 0 &&
  padUiSrc.indexOf('hideProbeMissing') >= 0,
  'shell hook diagnose is optional under keys advanced');
assert.ok(panelSrc.indexOf('hideProbeMissing') >= 0 &&
  panelSrc.indexOf('softPadShellHookProbeMissingMuted') >= 0,
  'probe missing is muted, not a red center card');
assert.ok(/sessionsAllowed\s*=\s*kind === 'claude' \|\| kind === 'codex'/.test(hubSrc),
  'sessions only claude/codex');

assert.ok(panelSrc.indexOf('cmd_shell_agent_hook_setup_status') >= 0);
assert.ok(panelSrc.indexOf('cmd_shell_agent_hook_install_confirm') >= 0);
assert.ok(panelSrc.indexOf('cmd_shell_agent_hook_uninstall') >= 0);
assert.ok(panelSrc.indexOf('probe_missing') >= 0, 'probe missing is distinct phase');
assert.ok(panelSrc.indexOf('softPadShellHookCopyDraft') >= 0);
assert.ok(panelSrc.indexOf('softPadShellHookMore') >= 0);
assert.ok(panelSrc.indexOf('renderShellAgentHookPanel') >= 0);

assert.ok(presetsSrc.indexOf("'workbuddy-chat'") >= 0);
assert.ok(presetsSrc.indexOf("'trae-chat'") >= 0);
assert.ok(presetsSrc.indexOf("'qoder-chat'") >= 0);
assert.ok(presetsSrc.indexOf('icons/app-target/workbuddy.png') >= 0);
assert.ok(presetsSrc.indexOf('icons/app-target/trae.png') >= 0);
assert.ok(presetsSrc.indexOf('icons/app-target/qoder.png') >= 0);

['workbuddy', 'trae', 'qoder'].forEach(function (id) {
  assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/' + id + '.png')), id + '.png');
  assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/' + id + '.svg')), id + '.svg');
});

assert.ok(indexHtml.indexOf('shell-agent-hook-panel.js') >= 0, 'index loads panel script');
assert.ok(
  indexHtml.indexOf('shell-agent-hook-panel.js') < indexHtml.indexOf('soft-pad-hub-ui.js'),
  'panel script before hub'
);

assert.ok(padUiSrc.indexOf('workbuddyStatusLightsEnabled') >= 0, 'pad ui shell light flags');
assert.ok(padUiSrc.indexOf('AGENT_LIGHT_SPECS') >= 0, 'six agent light rows');
assert.ok(padUiSrc.indexOf("agent: 'workbuddy'") >= 0);
assert.ok(padUiSrc.indexOf('cmd_shell_agent_hook_install_confirm') >= 0, 'shell connect CTA');
assert.ok(overlayHtml.indexOf('data-agent="workbuddy"') >= 0, 'overlay workbuddy chip');
assert.ok(overlayHtml.indexOf('data-agent="trae"') >= 0, 'overlay trae chip');
assert.ok(overlayHtml.indexOf('data-agent="qoder"') >= 0, 'overlay qoder chip');
assert.ok(runtimeCmd.indexOf('"workbuddy" | "trae" | "qoder"') >= 0, 'ipc accepts shell agents');
assert.ok(runtimeCmd.indexOf('workbuddy_status_lights_enabled') >= 0, 'ipc persists shell lights');

console.log('soft-pad-shell-hook-hub tests passed');
