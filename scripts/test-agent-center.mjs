/**
 * Agent Center static contract tests (Node).
 * Covers honest action IPC, no production fixture fallback, inventory path, version sniff.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const page = read('src/agent-proto/agent-page.html');
const js = read('src/js/features/agent/agent-center.js');
const css = read('src/css/agent-center.css');
const softPad = read('src/js/features/agent/soft-pad-agent-registry.js');
const registryRs = read('src-tauri/src/agent_memory/registry.rs');
const centerRs = read('src-tauri/src/agent_memory/agent_center.rs');
const storeRs = read('src-tauri/src/agent_memory/store.rs');
const ipcRs = read('src-tauri/src/ipc/commands/shell/agent_center_cmd.rs');

// --- HTML / IA ---
assert.match(page, /id="workHost"/);
assert.match(page, /agent-center\.js/);
assert.match(page, /agent-center\.css/);
assert.match(page, /setSub\(allowedDeep\[deepSub\]\?deepSub:'softPad'\)/);
assert.doesNotMatch(page, /data-sub="work"/);
assert.doesNotMatch(page, /data-sub="homeRoster"/);
assert.match(page, /id==='work'\|\|id==='homeRoster'/);

// Soft Pad boundary
assert.match(softPad, /NOT authoritative for Agent Center/);

// No parallel stores
assert.doesNotMatch(js, /livingStore|continueStore|recentStore/);

// P0-A: single action IPC (no per-action fake executors)
assert.match(js, /data-action/);
assert.match(js, /dispatchAction/);
assert.match(js, /cmd_agent_center_action/);
assert.doesNotMatch(js, /cmd_soft_pad_focus_agent/);
assert.doesNotMatch(js, /cmd_agent_checkpoint_resume/);
assert.doesNotMatch(js, /cmd_agent_lifecycle_event/);
assert.doesNotMatch(js, /session_aborted/);
assert.doesNotMatch(js, /claude stop|claude\.stop|Command\.new\(["']claude/i);
assert.doesNotMatch(js, /runtimeKind[\s\S]{0,80}agent\.interrupt|interrupt[\s\S]{0,80}runtimeKind/);
assert.match(js, /clientEffect/);
assert.match(js, /mountHome/);
assert.match(js, /control_plane_unavailable|controlPlaneUnavailable/);
assert.match(js, /background_session_not_found|backgroundSessionNotFound/);
assert.match(js, /stale_control_evidence|staleControlEvidence/);
assert.match(js, /stop_not_verified|stopNotVerified/);
assert.match(centerRs, /"agent\.focus"/);
assert.match(centerRs, /"agent\.interrupt"/);
assert.match(centerRs, /"session\.resume"/);
assert.match(centerRs, /"checkpoint\.preview"/);
assert.match(centerRs, /"ui\.open_config"/);
assert.match(centerRs, /"ui\.open_data"/);
assert.match(centerRs, /provider_handler_id/);
assert.match(centerRs, /AgentCenterExecutor/);
assert.match(centerRs, /ClaudeStop/);
assert.match(centerRs, /execute_agent_center_action/);
assert.match(centerRs, /collect_resolve_hints/);
assert.match(centerRs, /no_external_session|no_lane/);
assert.match(ipcRs, /collect_resolve_hints/);
assert.match(ipcRs, /ProbePolicy::Cached/);
assert.match(ipcRs, /ProbePolicy::ForceFresh/);
assert.doesNotMatch(ipcRs, /fn resolve_hints\(/);

// P0-B: production refresh must not call fixtureSnap on failure
const refreshFn = js.slice(js.indexOf('function refresh('), js.indexOf('function mount('));
assert.ok(refreshFn.includes('applyLoadFailure'), 'production path uses applyLoadFailure');
const returnIdxs = [...refreshFn.matchAll(/return invoke/g)].map((m) => m.index);
assert.ok(returnIdxs.length >= 3, 'demo + production invoke chains present');
const prodRefresh = refreshFn.slice(returnIdxs[2]);
assert.ok(prodRefresh.includes('applyLoadFailure'), 'production catch uses applyLoadFailure');
assert.ok(
  !prodRefresh.includes('fixtureSnap'),
  'production refresh catch must not call fixtureSnap'
);
assert.match(js, /isDemoMode/);
assert.match(js, /mountDemo/);
assert.match(js, /LAST_GOOD_KEY|lastGood/);

// P0-C: inventory wired
assert.match(ipcRs, /collect_inventory/);
assert.match(ipcRs, /cmd_agent_center_action/);
assert.match(centerRs, /install: &\[\(String, String, String\)\]/);
assert.doesNotMatch(centerRs, /let install: Vec<\(String, String, String\)> = Vec::new\(\)/);

// Version sniff
assert.match(registryRs, /pub fn sniff_version/);
assert.match(registryRs, /version: sniff_version\(kind\)/);
assert.match(centerRs, /note_successful_collection/);
assert.match(centerRs, /inventory_ok/);
assert.doesNotMatch(
  centerRs.replace(/if registry_ok[\s\S]*?note_successful_collection\(\);/, ''),
  /attention_state[\s\S]*note_successful_collection\(\)/
);

// Registry / snapshot contracts
assert.match(storeRs, /CREATE TABLE IF NOT EXISTS agent_registry/);
assert.match(registryRs, /kind:workbuddy/);
assert.match(centerRs, /recommended_agent_id/);
assert.match(centerRs, /build_agent_home_snapshot/);
assert.match(centerRs, /ObservedStatus|observed_status/);
assert.match(centerRs, /PresenceAxes|presence:/);
assert.doesNotMatch(centerRs, /OneToneAgentHomePulse|projectHelpedYou/);

// CSS / i18n surface
assert.match(css, /ac-banner-error/);
assert.match(js, /sessions/);
assert.match(js, /capLabel/);

// VM: fixture + dispatch surface
const sandbox = {
  window: {},
  console,
  setTimeout,
  clearTimeout,
  sessionStorage: {
    _m: {},
    setItem(k, v) {
      this._m[k] = String(v);
    },
    getItem(k) {
      return this._m[k] || null;
    }
  },
  location: { search: '' }
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
sandbox.document = {
  documentElement: { lang: 'zh' },
  getElementById: () => null,
  querySelector: () => null
};
vm.runInNewContext(js, sandbox);
const AC = sandbox.OneToneAgentCenter;
assert.ok(AC);
assert.ok(typeof AC.dispatchAction === 'function');
const fix = AC._fixture();
assert.ok(fix.groups.connected.length >= 1);
const focus = fix.agents[0].actions.find((a) => a.id === 'agent.focus');
assert.ok(focus && focus.supported);
const resume = fix.agents[0].actions.find((a) => a.id === 'session.resume');
assert.ok(resume && resume.reason === 'no_external_session');
const claude = fix.agents.find((a) => a.agentId === 'kind:claude');
assert.ok(claude);
const claudeInterrupt = claude.actions.find((a) => a.id === 'agent.interrupt');
assert.ok(claudeInterrupt && !claudeInterrupt.enabled);
assert.ok(typeof AC._humanReason === 'function');
assert.equal(AC._humanReason('control_plane_unavailable'), AC.t('controlPlaneUnavailable'));
assert.equal(AC._humanReason('background_session_not_found'), AC.t('backgroundSessionNotFound'));
assert.equal(AC._humanReason('stop_not_verified'), AC.t('stopNotVerified'));
assert.match(js, /destination:\s*['"]softPad['"]|clientEffect/);
const dispatchSrc = js.slice(js.indexOf('function dispatchAction'), js.indexOf('function ensureWorkHostVisible'));
assert.match(dispatchSrc, /cmd_agent_center_action/);
assert.doesNotMatch(dispatchSrc, /cmd_agent_lifecycle_event/);
assert.doesNotMatch(dispatchSrc, /runtimeKind/);

console.log('test-agent-center: ok');
