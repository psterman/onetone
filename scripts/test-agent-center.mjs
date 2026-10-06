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
const acceptanceJs = read('src/js/features/agent/agent-control-acceptance.js');
assert.doesNotMatch(js, /real-provider\/NOT_EXECUTED/);
assert.match(js, /function projectAgentControl/);
assert.match(js, /overviewSummaryLine|另有/);
assert.ok(!fs.existsSync(path.join(root, 'src/data/agent-control-acceptance.json')), 'JSON twin must be deleted — JS is sole source');

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
assert.match(centerRs, /recent_prompt|recentPrompt/);
assert.match(centerRs, /title_source|titleSource/);
assert.match(centerRs, /ProbeNotImplemented|probe_not_implemented|presence_state.*unknown/);
assert.match(centerRs, /resolve_interrupt_evidence|codex_background/);
assert.match(js, /recentPrompt|最近提问/);
assert.doesNotMatch(js, /最近对话/);


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
vm.runInNewContext(acceptanceJs, sandbox);
vm.runInNewContext(js, sandbox);
const AC = sandbox.OneToneAgentCenter;
assert.ok(AC);
assert.ok(sandbox.OneToneAgentControlAcceptance);
assert.equal(sandbox.OneToneAgentControlAcceptance.providers.claude.status, 'pending');
assert.equal(sandbox.OneToneAgentControlAcceptance.providers.codex.status, 'pending');
assert.equal(sandbox.OneToneAgentControlAcceptance.providers.cursor.status, 'notApplicable');
assert.ok(typeof AC._projectAgentControl === 'function');
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
assert.ok(typeof AC._humanActionReason === 'function');
assert.equal(AC._humanActionReason('no_window_target', 'agent.interrupt'), AC.t('noWindowTarget'));
assert.equal(AC._humanActionReason('ambiguous_session', 'agent.interrupt'), AC.t('ambiguousSession'));
assert.equal(AC._humanActionReason('session_not_found', 'agent.interrupt'), AC.t('sessionNotFound'));
assert.equal(
  AC._humanActionReason('no_external_session', 'agent.interrupt'),
  AC.t('noInterruptSession')
);
assert.equal(AC._humanActionReason('no_external_session', 'session.resume'), AC.t('notResumable'));
assert.equal(AC._humanActionReason('no_mapping_target', 'agent.interrupt'), AC.t('noMappingTarget'));
// E1–E5 honest failure copy (must not collapse)
const e1Text = AC._humanActionReason('no_window_target', 'agent.interrupt');
const e2Text = AC._humanActionReason('no_mapping_target', 'agent.interrupt');
const e3Text = AC._humanActionReason('evidence_stale', 'agent.interrupt');
const e4Text = AC._humanActionReason('ProbeNotImplemented', 'agent.interrupt');
const e5Text = AC._humanActionReason('provider_unsupported', 'agent.interrupt');
assert.notEqual(e1Text, e2Text, 'E1/E2 must differ');
assert.equal(e1Text, '窗口不可定位');
assert.equal(e2Text, '没有可定位的 Cursor 控制目标');
assert.equal(e3Text, '控制证据已过期');
assert.equal(e4Text, '本机检测尚未接入');
assert.equal(e5Text, '不支持');
assert.notEqual(e4Text, e5Text, 'E4/E5 must differ');
assert.notEqual(e3Text, e5Text, 'E3/E5 must differ');
assert.equal(AC._humanActionReason('not_wired', 'export_history'), AC.t('notWired'));
assert.equal(AC._humanActionReason('not_wired', 'disable_source'), AC.t('notWired'));
const exportAct = fix.agents
  .flatMap((a) => a.actions || [])
  .find((a) => a.id === 'export_history' && a.reason === 'not_wired');
assert.ok(exportAct, 'fixture must include not_wired export_history');
assert.equal(exportAct.enabled, false, 'export_history must stay disabled when not_wired');
assert.match(AC._humanActionReason('not_wired', 'export_history'), /尚未接入|Not wired/);
assert.match(js, /humanActionReason/);
assert.match(js, /har-action-reason/);
assert.match(js, /presenceAxes|actionEvidence/);
assert.match(centerRs, /resolve_interrupt\(/);
assert.match(centerRs, /codex_control/);
assert.doesNotMatch(centerRs, /no_control_evidence/);
assert.doesNotMatch(centerRs, /no_cursor_mapping/);
assert.match(js, /destination:\s*['"]softPad['"]|clientEffect/);
const dispatchSrc = js.slice(js.indexOf('function dispatchAction'), js.indexOf('function ensureWorkHostVisible'));
assert.match(dispatchSrc, /cmd_agent_center_action/);
assert.match(dispatchSrc, /attemptId/);
assert.match(dispatchSrc, /outcome/);
assert.match(js, /actionAttemptedUnverified/);
assert.match(js, /actionVerifiedStop/);
assert.doesNotMatch(dispatchSrc, /cmd_agent_lifecycle_event/);
assert.doesNotMatch(dispatchSrc, /runtimeKind/);

assert.match(centerRs, /enum ActionOutcome/);
assert.match(centerRs, /AttemptedUnverified/);
assert.match(centerRs, /normalize_attempt_id/);
assert.match(centerRs, /interrupt_attempted/);
assert.match(centerRs, /try_begin_inflight/);

// Home roster v2 pure projections — capability ≠ outcome
assert.ok(typeof AC._classifyInterrupt === 'function');
assert.ok(typeof AC._computeHomeOverview === 'function');
assert.ok(typeof AC._matchesHomeFilter === 'function');
assert.ok(typeof AC._formatEvidenceFreshness === 'function');
assert.equal(AC._classifyInterrupt(null), null);
assert.equal(AC._classifyInterrupt({ id: 'agent.focus', support: 'native', state: 'available' }), null);
assert.equal(
  AC._classifyInterrupt({
    id: 'agent.interrupt',
    support: 'native',
    state: 'available'
  }),
  'verifiable'
);
assert.equal(
  AC._classifyInterrupt({
    id: 'agent.interrupt',
    support: 'hotkey',
    state: 'available'
  }),
  'bestEffort'
);
assert.equal(
  AC._classifyInterrupt({
    id: 'agent.interrupt',
    reason: 'provider_unsupported'
  }),
  'unsupported'
);
assert.equal(
  AC._classifyInterrupt({
    id: 'agent.interrupt',
    reason: 'ProbeNotImplemented'
  }),
  'unknown'
);
assert.equal(
  AC._classifyInterrupt({ id: 'agent.interrupt' }),
  'unknown',
  'missing support/state must not become verifiable'
);
assert.equal(
  AC._classifyInterrupt({ id: 'agent.interrupt', support: 'native' }),
  'unknown',
  'native without available state is unknown'
);

const asOf = 1_000_000;
const overviewSnap = {
  asOf,
  groups: {
    needsAttention: [],
    connected: ['a', 'b', 'c', 'd'],
    discoveredLimited: [],
    supportedNotFound: []
  },
  agents: [
    {
      agentId: 'a',
      observedStatus: { value: 'working', freshUntil: asOf + 10_000 },
      actions: [{ id: 'agent.interrupt', support: 'native', state: 'available' }]
    },
    {
      agentId: 'b',
      observedStatus: { value: 'working', freshUntil: asOf - 1 },
      actions: [{ id: 'agent.interrupt', support: 'hotkey', state: 'available' }]
    },
    {
      agentId: 'c',
      observedStatus: { value: 'idle', freshUntil: asOf + 10_000 },
      actions: [{ id: 'agent.interrupt', reason: 'provider_unsupported' }]
    },
    {
      agentId: 'd',
      observedStatus: { value: 'unknown', freshUntil: 0 },
      actions: [{ id: 'agent.interrupt', reason: 'probe_not_implemented' }]
    }
  ]
};
const ov = AC._computeHomeOverview(overviewSnap);
assert.equal(ov.discovered, 4);
assert.equal(ov.working, 1, 'stale working must not count');
assert.equal(ov.confirmable, 1);
assert.equal(ov.bestEffort, 1);
assert.equal(ov.unsupported, 1);
assert.equal(ov.notWired, 1);
assert.equal(ov.verifiableInterrupt, 1);
assert.equal(ov.bestEffortInterrupt, 1);
assert.equal(ov.unsupportedInterrupt, 1);
assert.equal(ov.unknownInterrupt, 1);
assert.equal(ov.bestEffort, 1, 'bestEffort card excludes notWired/unsupported');
assert.equal(ov.notWired + ov.unsupported + ov.confirmable + ov.bestEffort, 4);

assert.equal(AC._matchesHomeFilter(overviewSnap.agents[0], 'confirmable', overviewSnap), true);
assert.equal(AC._matchesHomeFilter(overviewSnap.agents[0], 'verifiable', overviewSnap), true);
assert.equal(AC._matchesHomeFilter(overviewSnap.agents[2], 'unsupported', overviewSnap), true);
assert.equal(AC._matchesHomeFilter(overviewSnap.agents[2], 'notWired', overviewSnap), false);
assert.equal(AC._matchesHomeFilter(overviewSnap.agents[3], 'notWired', overviewSnap), true);
assert.equal(AC._matchesHomeFilter(overviewSnap.agents[3], 'unknown', overviewSnap), true);
assert.equal(AC._matchesHomeFilter(overviewSnap.agents[1], 'working', overviewSnap), false);

const missingAct = { agentId: 'x', actions: [] };
assert.equal(AC._matchesHomeFilter(missingAct, 'notWired', overviewSnap), true);
assert.equal(AC._classifyInterrupt(AC._findInterruptAction(missingAct)), null);

// projectAgentControl: Cursor bestEffort; Claude pending → 支持结果确认 + confirmable
const cursorAgent = {
  agentId: 'kind:cursor',
  runtimeKind: 'cursor',
  actions: [
    {
      id: 'agent.interrupt',
      support: 'hotkey',
      state: 'available',
      enabled: true,
      supported: true,
      freshUntil: asOf + 60_000
    }
  ]
};
const cursorProj = AC._projectAgentControl(cursorAgent, overviewSnap);
assert.equal(cursorProj.controlMode, 'bestEffort');
assert.equal(cursorProj.acceptance, 'notApplicable');
assert.match(cursorProj.primaryLabel, /尽力停止|Best-effort/);
assert.equal(
  AC._resolveActionOutcome({ outcome: 'verified', ok: true, verified: true }, { id: 'agent.interrupt' }, cursorAgent),
  'attemptedUnverified'
);
assert.match(
  AC._outcomeMessage(
    { outcome: 'verified', ok: true, verified: true },
    { id: 'agent.interrupt' },
    cursorAgent
  ),
  /请自行确认|confirm yourself/i
);
assert.doesNotMatch(
  AC._outcomeMessage(
    { outcome: 'verified', ok: true, verified: true },
    { id: 'agent.interrupt' },
    cursorAgent
  ),
  /已确认 Agent 停止|Agent stop confirmed/
);

// Cursor + no_mapping_target → not bestEffort
const cursorNoMap = {
  agentId: 'kind:cursor-nomap',
  runtimeKind: 'cursor',
  actions: [
    {
      id: 'agent.interrupt',
      support: 'hotkey',
      state: 'unavailable',
      enabled: false,
      supported: true,
      reason: 'no_mapping_target'
    }
  ]
};
const cursorNoMapProj = AC._projectAgentControl(cursorNoMap, overviewSnap);
assert.notEqual(cursorNoMapProj.controlMode, 'bestEffort');
assert.equal(cursorNoMapProj.controlMode, 'unavailable');
assert.equal(cursorNoMapProj.reason, 'noMapping');

// Cursor + stale evidence → not bestEffort
const cursorStale = {
  agentId: 'kind:cursor-stale',
  runtimeKind: 'cursor',
  actions: [
    {
      id: 'agent.interrupt',
      support: 'hotkey',
      state: 'available',
      enabled: true,
      supported: true,
      reason: 'evidence_stale',
      freshUntil: asOf - 1
    }
  ]
};
const cursorStaleProj = AC._projectAgentControl(cursorStale, overviewSnap);
assert.notEqual(cursorStaleProj.controlMode, 'bestEffort');
assert.equal(cursorStaleProj.controlMode, 'unavailable');
assert.equal(cursorStaleProj.reason, 'stale');

// Cursor + no action → notWired
const cursorNoAct = { agentId: 'kind:cursor-empty', runtimeKind: 'cursor', actions: [] };
const cursorNoActProj = AC._projectAgentControl(cursorNoAct, overviewSnap);
assert.equal(cursorNoActProj.controlMode, 'unavailable');
assert.equal(cursorNoActProj.reason, 'notWired');

// Broken Cursor rows must not inflate bestEffort card
const cursorBreakSnap = {
  asOf,
  groups: {
    needsAttention: [],
    connected: ['kind:cursor-nomap', 'kind:cursor-stale', 'kind:cursor-empty', 'kind:cursor'],
    discoveredLimited: [],
    supportedNotFound: []
  },
  agents: [cursorNoMap, cursorStale, cursorNoAct, cursorAgent]
};
const cursorOv = AC._computeHomeOverview(cursorBreakSnap);
assert.equal(cursorOv.bestEffort, 1, 'only enabled fresh Cursor hotkey counts as bestEffort');
assert.equal(AC._matchesHomeFilter(cursorNoMap, 'bestEffort', cursorBreakSnap), false);
assert.equal(AC._matchesHomeFilter(cursorStale, 'bestEffort', cursorBreakSnap), false);
assert.equal(AC._matchesHomeFilter(cursorNoAct, 'notWired', cursorBreakSnap), true);
assert.equal(AC._matchesHomeFilter(cursorAgent, 'bestEffort', cursorBreakSnap), true);

const claudeAgent = {
  agentId: 'kind:claude',
  runtimeKind: 'claude',
  actions: [{ id: 'agent.interrupt', support: 'native', state: 'available', enabled: true }]
};
const claudeProj = AC._projectAgentControl(claudeAgent, overviewSnap);
assert.equal(claudeProj.controlMode, 'confirmable');
assert.equal(claudeProj.acceptance, 'pendingRealVerify');
assert.match(claudeProj.primaryLabel, /支持结果确认|Supports result confirmation/);
assert.doesNotMatch(claudeProj.primaryLabel, /^可确认停止$|^Stop can be confirmed$/);

AC._setAcceptanceManifest({
  providers: { claude: { status: 'realVerified' }, codex: { status: 'pending' }, cursor: { status: 'notApplicable' } }
});
const claudeVerified = AC._projectAgentControl(claudeAgent, overviewSnap);
assert.equal(claudeVerified.controlMode, 'confirmable');
assert.match(claudeVerified.primaryLabel, /可确认停止|Stop can be confirmed/);
AC._setAcceptanceManifest(null);

const freshOk = AC._formatEvidenceFreshness({
  observedAt: asOf - 1000,
  freshUntil: asOf + 38_000,
  asOf,
  source: 'probe',
  confidence: 'high'
});
assert.equal(freshOk.expired, false);
assert.match(String(freshOk.remainingLabel), /38/);
assert.equal(freshOk.sourceLabel, 'probe');

const freshExpired = AC._formatEvidenceFreshness({
  observedAt: asOf - 1000,
  freshUntil: asOf,
  asOf,
  source: 'probe',
  confidence: 'high'
});
assert.equal(freshExpired.expired, true);
assert.equal(freshExpired.validLabel, AC.t('evidenceExpired'));

const freshMissing = AC._formatEvidenceFreshness({ observedAt: null, freshUntil: null, asOf: null });
assert.equal(freshMissing.observedLabel, AC.t('evidenceUnconfirmable'));
assert.equal(freshMissing.remainingLabel, AC.t('evidenceUnconfirmable'));
assert.doesNotMatch(String(freshMissing.remainingLabel), /^0/);

assert.equal(AC._humanReason('ProbeNotImplemented'), AC.t('probeNotImplemented'));
assert.equal(AC._humanReason('provider_unsupported'), AC.t('providerUnsupportedInterrupt'));
assert.notEqual(AC.t('probeNotImplemented'), AC.t('providerUnsupportedInterrupt'));

assert.equal(
  AC._outcomeMessage({ outcome: 'attemptedUnverified', ok: true }, { id: 'agent.interrupt' }),
  AC.t('actionAttemptedUnverified')
);
assert.equal(
  AC._outcomeMessage({ outcome: 'verified', ok: true }, { id: 'agent.interrupt' }),
  AC.t('actionVerifiedStop')
);
assert.match(
  AC._outcomeMessage({ outcome: 'failed', ok: false, error: 'provider_unsupported' }, { id: 'agent.interrupt' }),
  /不支持|Unsupported/
);

assert.doesNotMatch(js, /\bdiscovered:\s*7\b|\bworking:\s*2\b|\bverifiableInterrupt:\s*2\b/);
assert.match(js, /function computeHomeOverview/);
assert.match(js, /function classifyInterrupt/);
assert.doesNotMatch(js, /CodexInterrupt/);
assert.match(js, /__test/);
assert.match(js, /resolveActionOutcome/);
assert.doesNotMatch(js, /res\.outcome \|\| \(res\.ok === false \? 'failed' : 'verified'\)/);

// IPC fixtures — camelCase + outcome invariants (primary acceptance, not regex)
function loadFix(name) {
  return JSON.parse(read(path.join('scripts/fixtures/agent-center', name)));
}
const fixVerified = loadFix('action-result-verified.json');
assert.equal(fixVerified.outcome, 'verified');
assert.equal(fixVerified.ok, true);
assert.equal(fixVerified.verified, true);
assert.ok(fixVerified.attemptId);
assert.equal(AC._resolveActionOutcome(fixVerified), 'verified');
assert.equal(
  AC._outcomeMessage(fixVerified, { id: 'agent.interrupt' }),
  AC.t('actionVerifiedStop')
);

const fixAttempted = loadFix('action-result-attempted-unverified.json');
assert.equal(fixAttempted.outcome, 'attemptedUnverified');
assert.equal(fixAttempted.ok, true);
assert.equal(fixAttempted.verified, false);
assert.equal(AC._resolveActionOutcome(fixAttempted), 'attemptedUnverified');
assert.equal(
  AC._outcomeMessage(fixAttempted, { id: 'agent.interrupt' }),
  AC.t('actionAttemptedUnverified')
);

const fixFailed = loadFix('action-result-failed.json');
assert.equal(fixFailed.outcome, 'failed');
assert.equal(fixFailed.ok, false);
assert.equal(fixFailed.verified, false);
assert.equal(AC._resolveActionOutcome(fixFailed), 'failed');
assert.match(AC._outcomeMessage(fixFailed, { id: 'agent.interrupt' }), /失败|Failed|fail/i);

const fixCap = loadFix('action-capability.json');
assert.equal(fixCap.observedAt, 1000);
assert.equal(fixCap.freshUntil, 4000);
assert.ok(!('observed_at' in fixCap));
assert.ok(!('fresh_until' in fixCap));

// Fail-closed: missing / illegal outcomes must never invent Verified
assert.equal(AC._resolveActionOutcome({ ok: true }), 'failed');
assert.equal(AC._resolveActionOutcome({ ok: true, verified: false }), 'failed');
assert.equal(AC._resolveActionOutcome({ ok: false, verified: true }), 'failed');
assert.equal(AC._resolveActionOutcome({ outcome: 'verified', ok: false }), 'failed');
assert.equal(AC._resolveActionOutcome({ outcome: 'verified', verified: false }), 'failed');
assert.equal(
  AC._resolveActionOutcome({ outcome: 'attemptedUnverified', ok: false }),
  'failed'
);
assert.doesNotMatch(
  AC._outcomeMessage({ ok: true }, { id: 'agent.interrupt' }),
  /已确认|confirmed|VerifiedStop/i
);

assert.ok(AC.__test && typeof AC.__test.applySnap === 'function');
assert.ok(typeof AC.__test.dispatchAction === 'function');

console.log('test-agent-center: ok');
