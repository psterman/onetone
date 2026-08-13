'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var root = path.resolve(__dirname, '..');
var orch = fs.readFileSync(path.join(root, 'src/js/features/agent/agent-install-orchestrator.js'), 'utf8');
var qs = fs.readFileSync(path.join(root, 'src/js/features/home/quick-start-orchestrator.js'), 'utf8');
var padUi = fs.readFileSync(path.join(root, 'src/js/features/agent/codex-micro-pad-ui.js'), 'utf8');
var overlay = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
var hub = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-hub-ui.js'), 'utf8');
var docs = fs.readFileSync(path.join(root, 'docs/soft-pad-shell-agents-hook-setup.md'), 'utf8');
var inv = fs.readFileSync(path.join(root, 'src-tauri/src/agent_install_inventory.rs'), 'utf8');
var lights = fs.readFileSync(path.join(root, 'src-tauri/src/ipc/commands/shell/soft_pad_runtime_cmd.rs'), 'utf8');
var indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
var css = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');

assert.ok(orch.includes('OneToneAgentInstall'), 'orchestrator export');
assert.ok(orch.includes('cmd_agent_install_inventory'));
assert.ok(orch.includes('cmd_soft_pad_agent_lights_batch_set'));
assert.ok(orch.includes('prepareKinds'));
assert.ok(orch.includes('enableNumpad'));
assert.ok(orch.includes('OneToneSoftPadHub'), 'use Soft Pad Hub ensureAppSoftPad');

assert.ok(qs.includes('qs-ai-card--mini') && qs.includes('qs-ai-card--pad'), 'split preview cards');
assert.ok(qs.includes('qs-ai-actions'), 'dock actions class');
assert.ok(qs.includes('qs-ai-scroll'), 'scroll region for dock layout');
assert.ok(qs.includes('qs-ai-danger') || qs.includes('qsAiDangerTitle'), 'occupy danger warning');
assert.ok(qs.includes('qs-ai-check'), 'material checkbox markup');
assert.ok(qs.includes('route.softEnabledPreview=false'), 'force numpad off on enter');
assert.ok(qs.includes('mountQsSoftPad'), 'real Soft Pad mount');
assert.ok(qs.includes('renderHardwarePad'), 'uses renderHardwarePad');
assert.ok(qs.includes('softPadLayoutKeyMeta'), 'real key meta captions');
assert.ok(!qs.includes('function softPadFaceHtml'), 'fake soft-face grid removed');
assert.ok(!qs.includes('qsStepConnect'), 'no connect nav step');
assert.ok(!qs.includes('function goConnect'), 'goConnect removed');
assert.ok(!qs.includes('qsDoneHookList') && !qs.includes('bindDoneConnectRows'), 'no done-page hook list');
assert.ok(qs.includes('mountQsAgentBar') && qs.includes('soft-pad-agent-bar'), 'agent bar on Soft Pad face top');
assert.ok(qs.includes("faceMode!=='shortcut'") || qs.includes('faceMode!=="shortcut"'), 'agent bar only on Soft Pad face');
assert.ok(!qs.includes('paintQsAgentKeys') && !qs.includes('qs-ai-agent-key'), 'no brand icons inside AG keys');
assert.ok(qs.includes('qsAiHonest') && qs.includes('Soft Pad 顶部'), 'honest copy says brands on Soft Pad top');
assert.ok(qs.includes('_occupyAnimating') || qs.includes('OccupyDemo'), 'occupy flip demo');
assert.ok(css.includes('.qs-ai-pad .soft-pad-agent-bar') && css.includes('.qs-ai-pad .micro-hw__icon'), 'top agent bar + readable key icons');
assert.ok(css.includes('qs-ai-face--with-agents'), 'face layout for top agent bar');
assert.ok(css.includes('#habitSetupToolView.habit-setup-view') && css.includes('overflow:hidden'), 'tool view dock fill');
assert.ok(css.includes('--surface-2'), 'surface-2 token defined');
assert.ok(padUi.includes('softPadLayoutKeyMeta: softPadLayoutKeyMeta'), 'key meta exported');
assert.ok(padUi.includes('bindSoftPadPreviewCaption: bindSoftPadPreviewCaption'), 'caption binder exported');

assert.ok(
  overlay.includes('el.hidden=!!plan.hidden') ||
    overlay.includes('el.hidden = !!plan.hidden') ||
    overlay.includes('el.hidden = !lightsOn') ||
    overlay.includes('el.hidden=!lightsOn'),
  'chip visibility gated by lights/plan'
);
assert.ok(orch.includes("'minimax'") || orch.includes('"minimax"') || /KINDS\s*=\s*\[[^\]]*minimax/.test(orch), 'orchestrator includes minimax');
assert.ok(inv.includes('AgentKind::MiniMax') || inv.includes('probe_minimax'), 'inventory probes MiniMax');
assert.ok(!/if\s*\(\s*SHELL_LIGHT_AGENTS\[kind\]\s*\)\s*\{\s*el\.hidden/.test(overlay));

assert.ok(hub.includes('refreshHubInventory'));
assert.ok(hub.includes('softPadScanBtn') || indexHtml.includes('softPadScanBtn'));
assert.ok(hub.includes('hubInventoryByKind'));

assert.ok(docs.includes('接入状态'));
assert.ok(!docs.includes('## Soft Pad Hub 一键接入'));

assert.ok(inv.includes('fn classify_evidence'));
assert.ok(inv.includes('is_embedded_codex_path'));
assert.ok(lights.includes('cmd_soft_pad_agent_lights_batch_set'));
assert.ok(lights.includes('cmd_agent_install_inventory'));
assert.ok(fs.readFileSync(path.join(root, 'src-tauri/permissions/app-ipc.toml'), 'utf8')
  .includes('allow-cmd-agent-install-inventory'), 'inventory IPC must be in app-ipc capability');
assert.ok(fs.readFileSync(path.join(root, 'src-tauri/permissions/app-ipc.toml'), 'utf8')
  .includes('allow-cmd-soft-pad-agent-lights-batch-set'), 'lights batch IPC must be in app-ipc capability');
assert.ok(orch.includes('maybeAutoSeedAfterInventory'), 'lazy seed after Soft Pad inventory');
assert.ok(!/whenBootSettled\(run\)/.test(orch) || /never on boot-settled|Intentionally no-op/.test(orch), 'no boot-settled inventory seed');
assert.ok(orch.includes('seedMinimaxMappingIfDetected'), 'minimax mapping seed helper');
assert.ok(orch.includes('autoSeedDetectedAgents'), 'boot auto-seed entry');
assert.ok(orch.includes("ensureAppSoftPad('minimax-chat'") || orch.includes('ensureAppSoftPad("minimax-chat"') || orch.includes("ensureAppSoftPad('minimax-chat', 'minimax'"), 'seeds via Hub ensureAppSoftPad');
assert.ok(orch.includes('enable: false') || orch.includes('enable:false'), 'pad stays off on seed');
assert.ok(inv.includes('MINIMAX_PROCESS_NAMES') || inv.includes('is_minimax_process_exe'), 'inventory MiniMax process whitelist');
assert.ok(inv.includes('MiniMax Code Desktop.exe') && inv.includes('MiniMax-Code.exe'), 'whitelist covers desktop variants');
assert.ok(inv.includes('minimax_exe_running') || inv.includes('is_minimax_process_exe'), 'running detect by process name');

assert.ok(qs.includes('selectedKinds'));
assert.ok(qs.includes('qs-ai-mini__agent'));

console.log('agent-install-quick-connect tests passed');
