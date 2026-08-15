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
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?trae-work/.test(hubSrc), 'BUILTIN includes trae-work');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?trae-code/.test(hubSrc), 'BUILTIN includes trae-code');
assert.ok(/BUILTIN_SOFT_PAD_APPS[\s\S]*?qoder-chat/.test(hubSrc), 'BUILTIN includes qoder');
assert.ok(hubSrc.indexOf('HUB_KIND_RANK') >= 0, 'hub kind rank');
assert.ok(
  /minimax:\s*3[\s\S]*?workbuddy:\s*4[\s\S]*?trae:\s*5[\s\S]*?traeCode:\s*6[\s\S]*?qoder:\s*7/.test(hubSrc) ||
    hubSrc.indexOf('minimax: 3') >= 0,
  'order after cursor: minimax → workbuddy → trae → traeCode → qoder'
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
assert.ok(presetsSrc.indexOf("'trae-work'") >= 0);
assert.ok(presetsSrc.indexOf("'trae-code'") >= 0);
assert.ok(presetsSrc.indexOf("'trae-chat'") >= 0, 'legacy trae-chat alias kept');
assert.ok(presetsSrc.indexOf("'qoder-chat'") >= 0);
assert.ok(presetsSrc.indexOf('icons/app-target/workbuddy.png') >= 0);
assert.ok(presetsSrc.indexOf('icons/app-target/trae.png') >= 0);
assert.ok(presetsSrc.indexOf('icons/app-target/trae-code.png') >= 0);
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
assert.ok(padUiSrc.indexOf('AGENT_LIGHT_SPECS') >= 0, 'agent light rows');
assert.ok(padUiSrc.indexOf("agent: 'workbuddy'") >= 0);
assert.ok(padUiSrc.indexOf("agent: 'copilotCli'") >= 0, 'topbar includes copilotCli');
assert.ok(padUiSrc.indexOf("agent: 'gemini'") >= 0, 'topbar includes gemini');
assert.ok(padUiSrc.indexOf('copilotStatusLightsEnabled') >= 0, 'copilot light flag');
assert.ok(padUiSrc.indexOf('geminiStatusLightsEnabled') >= 0, 'gemini light flag');
assert.ok(padUiSrc.indexOf('clineStatusLightsEnabled') >= 0, 'cline light flag');
assert.ok(padUiSrc.indexOf('opencodeStatusLightsEnabled') >= 0, 'opencode light flag');
assert.ok(padUiSrc.indexOf('aiderStatusLightsEnabled') >= 0, 'aider light flag');
assert.ok(padUiSrc.indexOf("agent: 'cline'") >= 0, 'topbar includes cline');
assert.ok(padUiSrc.indexOf("agent: 'opencode'") >= 0, 'topbar includes opencode');
assert.ok(padUiSrc.indexOf('Aider（仅完成）') >= 0, 'aider done-only label');
assert.ok(padUiSrc.indexOf('cmd_shell_agent_hook_install_confirm') >= 0, 'shell connect CTA');
assert.ok(overlayHtml.indexOf('data-agent="workbuddy"') >= 0, 'overlay workbuddy chip');
assert.ok(overlayHtml.indexOf('data-agent="trae"') >= 0, 'overlay trae Work chip');
assert.ok(overlayHtml.indexOf('data-agent="traeCode"') >= 0, 'overlay trae Code chip');
assert.ok(panelSrc.indexOf('traecode: true') >= 0 || panelSrc.indexOf('traecode:true') >= 0, 'Hook panel allows traeCode');
assert.ok(!/SHELL_KINDS\s*=\s*\{[^}]*\btrae:\s*true/.test(panelSrc), 'Hook panel does not install for Trae Work');
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/trae-code.png')), 'trae-code.png');
assert.ok(overlayHtml.indexOf('data-agent="qoder"') >= 0, 'overlay qoder chip');
assert.ok(overlayHtml.indexOf('data-agent="copilotCli"') >= 0, 'overlay copilot chip');
assert.ok(overlayHtml.indexOf('data-agent="gemini"') >= 0, 'overlay gemini chip');
assert.ok(overlayHtml.indexOf('data-agent="cline"') >= 0, 'overlay cline chip');
assert.ok(overlayHtml.indexOf('data-agent="opencode"') >= 0, 'overlay opencode chip');
assert.ok(overlayHtml.indexOf('data-agent="aider"') >= 0, 'overlay aider chip');
assert.ok(runtimeCmd.indexOf('copilot_status_lights_enabled') >= 0, 'ipc persists copilot lights');
assert.ok(runtimeCmd.indexOf('gemini_status_lights_enabled') >= 0, 'ipc persists gemini lights');
assert.ok(runtimeCmd.indexOf('cline_status_lights_enabled') >= 0, 'ipc persists cline lights');
assert.ok(runtimeCmd.indexOf('opencode_status_lights_enabled') >= 0, 'ipc persists opencode lights');
assert.ok(runtimeCmd.indexOf('aider_status_lights_enabled') >= 0, 'ipc persists aider lights');
assert.ok(runtimeCmd.indexOf('workbuddy_status_lights_enabled') >= 0, 'ipc persists shell lights');

assert.ok(presetsSrc.indexOf("'copilot-cli'") >= 0, 'preset copilot-cli');
assert.ok(presetsSrc.indexOf("'gemini-cli'") >= 0, 'preset gemini-cli');
assert.ok(presetsSrc.indexOf("'cline-chat'") >= 0, 'preset cline-chat');
assert.ok(presetsSrc.indexOf("'opencode-chat'") >= 0, 'preset opencode-chat');
assert.ok(presetsSrc.indexOf("'aider-chat'") >= 0, 'preset aider-chat');
assert.ok(presetsSrc.indexOf('icons/app-target/copilot.png') >= 0);
assert.ok(presetsSrc.indexOf('icons/app-target/gemini.png') >= 0);
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/copilot.png')), 'copilot.png');
assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/gemini.png')), 'gemini.png');
var copilotSvg = fs.readFileSync(path.join(root, 'src/icons/app-target/copilot.svg'), 'utf8');
var geminiSvg = fs.readFileSync(path.join(root, 'src/icons/app-target/gemini.svg'), 'utf8');
assert.ok(copilotSvg.indexOf('<text') < 0 && copilotSvg.toLowerCase().indexOf('>cp<') < 0,
  'copilot.svg is a helmet mark, not Cp initials');
assert.ok(geminiSvg.indexOf('<text') < 0 && !/>G<\/text>/.test(geminiSvg),
  'gemini.svg is a sparkle, not G initials');
['cline', 'opencode', 'aider'].forEach(function (stem) {
  assert.ok(fs.existsSync(path.join(root, 'src/icons/app-target/' + stem + '.png')), stem + '.png');
  var svg = fs.readFileSync(path.join(root, 'src/icons/app-target/' + stem + '.svg'), 'utf8');
  assert.ok(svg.indexOf('<text') < 0, stem + '.svg is a mark, not initials');
});
assert.ok(!/WORKFLOW_APP_TARGET_IDS[\s\S]*?copilot-cli/.test(presetsSrc.split('var PRESETS')[0]),
  'copilot-cli not a workflow keyboard target');
assert.ok(!/WORKFLOW_APP_TARGET_IDS[\s\S]*?gemini-cli/.test(presetsSrc.split('var PRESETS')[0]),
  'gemini-cli not a workflow keyboard target');
assert.ok(!/WORKFLOW_APP_TARGET_IDS[\s\S]*?cline-chat/.test(presetsSrc.split('var PRESETS')[0]),
  'cline-chat not a workflow keyboard target');
assert.ok(!/WORKFLOW_APP_TARGET_IDS[\s\S]*?opencode-chat/.test(presetsSrc.split('var PRESETS')[0]),
  'opencode-chat not a workflow keyboard target');
assert.ok(!/WORKFLOW_APP_TARGET_IDS[\s\S]*?aider-chat/.test(presetsSrc.split('var PRESETS')[0]),
  'aider-chat not a workflow keyboard target');

var pickerSrc = fs.readFileSync(path.join(root, 'src/js/features/mapping/app-behavior-rules.js'), 'utf8');
assert.ok(pickerSrc.indexOf("p.id!=='minimax-chat'") < 0, 'topbar picker no longer hides MiniMax');
assert.ok(hubSrc.indexOf("'copilot-cli': 'copilotCli'") >= 0 || hubSrc.indexOf('"copilot-cli": "copilotCli"') >= 0
  || hubSrc.indexOf("'copilot-cli': 'copilotCli'") >= 0, 'hub kindForAppId copilot-cli');
assert.ok(hubSrc.indexOf("'gemini-cli': 'gemini'") >= 0, 'hub kindForAppId gemini-cli');
assert.ok(hubSrc.indexOf("'cline-chat': 'cline'") >= 0, 'hub kindForAppId cline-chat');
assert.ok(hubSrc.indexOf("'opencode-chat': 'opencode'") >= 0, 'hub kindForAppId opencode-chat');
assert.ok(hubSrc.indexOf("'aider-chat': 'aider'") >= 0, 'hub kindForAppId aider-chat');
assert.ok(!/BUILTIN_SOFT_PAD_APPS[\s\S]*?copilot-cli/.test(hubSrc), 'BUILTIN omits copilot keyboard scope');
assert.ok(!/BUILTIN_SOFT_PAD_APPS[\s\S]*?gemini-cli/.test(hubSrc), 'BUILTIN omits gemini keyboard scope');
assert.ok(!/BUILTIN_SOFT_PAD_APPS[\s\S]*?cline-chat/.test(hubSrc), 'BUILTIN omits cline keyboard scope');

assert.ok(padUiSrc.indexOf('TOPBAR_QUOTA_CANDIDATES') >= 0, 'quota backup candidates');
assert.ok(padUiSrc.indexOf("provider: 'openrouter'") >= 0, 'quota openrouter');
assert.ok(padUiSrc.indexOf("provider: 'deepseek'") >= 0, 'quota deepseek');
assert.ok(padUiSrc.indexOf("provider: 'kimi'") >= 0, 'quota kimi');
assert.ok(padUiSrc.indexOf("provider: 'siliconflow'") >= 0, 'quota siliconflow');
assert.ok(padUiSrc.indexOf("type === 'quota'") >= 0 || padUiSrc.indexOf("pick.type === 'quota'") >= 0, 'quota pick handler');
assert.ok(padUiSrc.indexOf('cmd_soft_pad_provider_key_set') >= 0, 'quota key set');
assert.ok(pickerSrc.indexOf('data-pick-quota') >= 0, 'picker quota items');
assert.ok(pickerSrc.indexOf('softPadTopbarPickerQuota') >= 0, 'picker quota section label');
assert.ok(pickerSrc.indexOf('softPadTopbarPickerLights') >= 0, 'picker lights section label');
assert.ok(pickerSrc.indexOf('pickerSession.lightItems') >= 0, 'topbar picker uses lightItems');
assert.ok(padUiSrc.indexOf('lightItems: topbarLightPickerItems') >= 0, 'pad ui passes light candidates');
assert.ok(padUiSrc.indexOf('function topbarLightPickerItems') >= 0, 'light items from TOPBAR_LIGHT_CANDIDATES');
assert.ok(padUiSrc.indexOf('agentLightIconSrc(c.agent)') >= 0, 'light picker icons from agentLightIconSrc');
assert.ok(indexHtml.indexOf('appPickerQuota') >= 0, 'quota picker host');
assert.ok(presetsSrc.indexOf("id: 'openrouter'") < 0 && presetsSrc.indexOf("id: 'deepseek'") < 0,
  'quota providers not mixed into workflow presets');
assert.ok(!/WORKFLOW_APP_TARGET_IDS[\s\S]*?openrouter/.test(presetsSrc.split('var PRESETS')[0]),
  'openrouter not a workflow keyboard target');

console.log('soft-pad-shell-hook-hub tests passed');
