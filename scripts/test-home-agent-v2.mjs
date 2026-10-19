import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const read = (p) => fs.readFileSync(p, 'utf8');
const html = read('src/index.html');
const storeSrc = read('src/js/features/now/home-agent-v2-store.js');
const dockSrc = read('src/js/features/now/home-agent-v2-dock.js');
const shell = read('src/js/features/now/home-agent-v2.js');
const css = read('src/css/home-agent-v2.css');
const now = read('src/js/features/now/now-home.js');
const workbench = read('src/js/features/home/home-workbench.js');

assert.match(html, /css\/home-agent-v2\.css/);
assert.match(html, /js\/features\/now\/home-agent-v2-store\.js/);
assert.match(html, /js\/features\/now\/home-agent-v2-dock\.js/);
assert.match(html, /js\/features\/now\/home-agent-v2\.js/);
assert.match(html, /data-wb-nav="homeV2"/);
assert.match(html, />新首页</);
assert.match(now, /homeAgentV2/);
assert.match(now, /onetone\.homeSurface/);
assert.match(now, /OneToneHomeAgentV2\.mount/);
assert.match(now, /detectHomeAgentV2\(\)[\s\S]*dashboardStack\(\)[\s\S]*OneToneHomeAgentV2\.show/);
assert.match(workbench, /onetone\.homeSurface/);
assert.match(workbench, /action==='homeV2'/);

assert.match(storeSrc, /OneToneHomeAgentV2Store/);
assert.match(storeSrc, /currentWork/);
assert.match(storeSrc, /recentWork/);
assert.match(storeSrc, /recentPrompt/);
assert.match(storeSrc, /observedStatus/);
assert.match(storeSrc, /presenceState/);
assert.match(storeSrc, /resolvedCapabilities/);
assert.match(storeSrc, /onetone\.agentCenter\.lastGood/);
assert.match(storeSrc, /COALESCE_MS/);
assert.match(storeSrc, /cmd_agent_center_snapshot/);
assert.match(storeSrc, /cmd_agent_install_inventory/);
assert.match(storeSrc, /cmd_agent_attention_snapshot/);
assert.match(storeSrc, /OneToneHabitRuntime/);
assert.match(storeSrc, /Unknown → null|return null/);
assert.doesNotMatch(storeSrc, /function canonical\(raw\)[\s\S]*return'codex'/);

assert.match(dockSrc, /OneToneHomeDockBridge/);
assert.match(dockSrc, /cmd_soft_pad_force_open/);
assert.match(dockSrc, /softPadForceOpen/);
assert.match(dockSrc, /homeToggleVoiceWake/);
assert.match(dockSrc, /OneToneCameraPresenceActions/);
assert.match(dockSrc, /OneToneSmartCapture/);
assert.match(dockSrc, /begin\('home'\)/);
assert.match(dockSrc, /cmd_tray_inbox_write/);
assert.match(dockSrc, /ensureComposerAim|cmd_input_aim_calibrate/);
assert.match(dockSrc, /collectMaterial/);

assert.match(dockSrc, /OneToneHomePromptPrep/);
assert.match(dockSrc, /setDraftBody|syncDraftToPrep/);
assert.match(dockSrc, /archiveHandoff|archiveOnSuccess/);
assert.match(shell, /OneToneHomeAgentV2Store/);
assert.match(shell, /OneToneHomeDockBridge/);
assert.match(shell, /cmd_agent_center_action/);
assert.match(shell, /data-ha2-drop/);
assert.match(shell, /clipboardData|dataTransfer/);
assert.match(shell, /inputConfirmed/);
assert.match(shell, /composer_pasted|chat_pasted/);
assert.match(shell, /patchDockMeta|data-ha2-dock-host/);
assert.match(storeSrc, /icons\/app-target/);
assert.match(shell, /ha2-icon--fallback/);
assert.doesNotMatch(shell, /\babbr\b|'CX'|'CU'|'CL'/);
assert.doesNotMatch(storeSrc, /abbr:\s*'CX'|abbr:\s*'CU'|abbr:\s*'CL'/);

assert.match(storeSrc, /codex[\s\S]*claude[\s\S]*cursor/);
assert.match(css, /grid-template-columns:\s*repeat\(5,\s*1fr\)/);
assert.match(css, /position:\s*absolute/);
assert.match(css, /overflow-y:\s*auto/);
assert.match(css, /--surface|--primary|--on-surface/);
assert.match(css, /var\(--primary/);

// --- DTO fixture: projectAgent reads Agent Center fields (incl. Cursor) ---
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(storeSrc, sandbox, { filename: 'home-agent-v2-store.js' });

const Store = sandbox.OneToneHomeAgentV2Store;
assert.ok(Store && Store.__testOnly, 'store exports __testOnly');

const cursorDto = {
  agentId: 'kind:cursor',
  runtimeKind: 'cursor',
  displayName: 'Cursor',
  recentPrompt: 'refactor home dock',
  currentWork: {
    projectName: 'voice-pilot',
    title: 'Home Agent V2 merge',
    updatedAt: Date.now() - 60_000
  },
  recentWork: [{ title: 'older', projectName: 'voice-pilot' }],
  observedStatus: { value: 'working', source: 'probe', confidence: 'high' },
  presenceState: 'here',
  resolvedCapabilities: { interrupt: { enabled: true } },
  actions: [
    { id: 'agent.focus', enabled: true },
    { id: 'agent.interrupt', enabled: true }
  ]
};

const projected = Store.__testOnly.projectAgent(cursorDto);
assert.equal(projected.kind, 'cursor');
assert.equal(projected.project, 'voice-pilot');
assert.equal(projected.title, 'refactor home dock');
assert.equal(projected.status, 'working');
assert.equal(projected.recentPrompt, 'refactor home dock');
assert.ok(projected.currentWork);
assert.equal(Store.__testOnly.workLine(cursorDto), 'refactor home dock');
assert.equal(Store.__testOnly.projectNameOf(cursorDto), 'voice-pilot');
assert.equal(Store.__testOnly.statusOf(cursorDto), 'working');

const unknown = Store.__testOnly.projectAgent({
  agentId: 'kind:totally-unknown-xyz',
  runtimeKind: 'totally-unknown-xyz',
  currentWork: { projectName: 'x' }
});
assert.equal(unknown, null, 'unknown agent must not become Codex');
assert.equal(Store.__testOnly.resolveKind('totally-unknown-xyz'), null);
assert.equal(Store.__testOnly.resolveKind('cursor-chat'), 'cursor');
assert.equal(Store.__testOnly.resolveKind('codex'), 'codex');

const idleDto = {
  agentId: 'kind:claude',
  runtimeKind: 'claude',
  recentWork: [{ title: 'last session', projectName: 'demo' }],
  observedStatus: { value: 'idle' }
};
const idleProj = Store.__testOnly.projectAgent(idleDto);
assert.equal(idleProj.kind, 'claude');
assert.equal(idleProj.title, 'last session');
assert.equal(idleProj.project, '最近工作'); // no currentWork.projectName

console.log('test-home-agent-v2: ok');
