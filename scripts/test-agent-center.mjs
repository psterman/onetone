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
assert.match(page, /data-sub="overview"/);
assert.match(page, /setSub\(allowedDeep\[deepSub\]\?deepSub:'overview'\)/);
assert.doesNotMatch(page, /data-sub="work"/);
assert.doesNotMatch(page, /data-sub="homeRoster"/);
assert.match(page, /id==='work'\|\|id==='homeRoster'/);
assert.match(page, /ensureOverviewMounted/);
assert.match(js, /ensureOverviewMounted/);

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
assert.ok(refreshFn.includes('isDemoMode()'), 'demo gate present');
assert.ok(
  refreshFn.includes('applySnap(fixtureSnap())'),
  'demo path may use fixtureSnap'
);
const demoBlock = refreshFn.slice(
  refreshFn.indexOf('if (isDemoMode())'),
  refreshFn.indexOf('homeRefreshInFlight = tracked')
);
assert.ok(demoBlock.includes('fixtureSnap'), 'demo branch uses fixtureSnap');
assert.ok(refreshFn.includes('applyLoadFailure(err)'), 'production catch uses applyLoadFailure');
// Production branch after demo: fixtureSnap must not appear in the else run=
const afterDemo = refreshFn.slice(refreshFn.indexOf('} else {'));
assert.ok(
  !afterDemo.includes('fixtureSnap'),
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
  Promise,
  Date,
  Math,
  JSON,
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
const dispatchSrc = js.slice(js.indexOf('function dispatchAction'), js.indexOf('function onHostClick'));
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
assert.equal(ov.controllable, 2);
assert.equal(ov.viewOnly, 2);
assert.equal(ov.unsupported, 1);
assert.equal(ov.notWired, 2, 'native-without-enabled + probe_not_implemented');
assert.equal(ov.stale, 1, 'hotkey row with expired observedStatus');
assert.equal(ov.verifiableInterrupt, 1);
assert.equal(ov.bestEffortInterrupt, 1);
assert.equal(ov.unsupportedInterrupt, 2);
assert.equal(ov.unknownInterrupt, 3, 'notWired×2 + stale×1');
assert.equal(ov.bestEffort, 1, 'bestEffort card excludes notWired/unsupported capability');

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
assert.equal(cursorOv.bestEffort, 4, 'capability counts all Cursor rows including blocked');
assert.equal(cursorOv.controllable, 4);
assert.equal(AC._matchesHomeFilter(cursorNoMap, 'bestEffort', cursorBreakSnap), true);
assert.equal(AC._matchesHomeFilter(cursorStale, 'bestEffort', cursorBreakSnap), true);
assert.equal(AC._matchesHomeFilter(cursorNoAct, 'notWired', cursorBreakSnap), true);
assert.equal(AC._matchesHomeFilter(cursorAgent, 'bestEffort', cursorBreakSnap), true);
assert.equal(cursorNoMapProj.capability, 'bestEffort');
assert.equal(cursorNoMapProj.availability, 'blocked');
assert.equal(cursorStaleProj.capability, 'bestEffort');
assert.equal(cursorStaleProj.availability, 'blocked');
assert.equal(cursorStaleProj.blocker, 'stale');
assert.equal(cursorStaleProj.recovery && cursorStaleProj.recovery.id, 'refresh');
assert.doesNotMatch(cursorStaleProj.primaryLabel, /不可控制/);
assert.doesNotMatch(cursorNoMapProj.primaryLabel, /不可控制/);

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

// --- Trust UI: capability ≠ temporary unsupported ---
const codexBlocked = {
  agentId: 'kind:codex',
  runtimeKind: 'codex',
  displayName: 'Codex',
  actions: [
    {
      id: 'agent.interrupt',
      supported: false,
      support: 'unsupported',
      enabled: false,
      reason: 'control_plane_unavailable'
    }
  ]
};
const codexProj = AC._projectAgentControl(codexBlocked, { asOf });
assert.equal(codexProj.capability, 'confirmable', 'Codex stays confirmable when control plane unavailable');
assert.notEqual(codexProj.capability, 'viewOnly');
assert.equal(codexProj.availability, 'blocked');
assert.equal(codexProj.blocker, 'notWired');
assert.equal(codexProj.recovery && codexProj.recovery.id, 'connect');
assert.doesNotMatch(codexProj.primaryLabel, /不可控制/);

const idleClaude = {
  agentId: 'kind:claude-idle',
  runtimeKind: 'claude',
  actions: [
    {
      id: 'agent.interrupt',
      support: 'native',
      enabled: false,
      reason: 'not_running'
    }
  ]
};
const idleProj = AC._projectAgentControl(idleClaude, { asOf });
assert.equal(idleProj.capability, 'confirmable');
assert.equal(idleProj.availability, 'idle');
assert.equal(idleProj.blocker, 'noTask');
assert.equal(idleProj.recovery, null);
assert.match(idleProj.primaryLabel, /无需停止|No stop needed/);
assert.match(idleProj.supportingText, /未检测到正在运行|No running task/);
assert.doesNotMatch(idleProj.primaryLabel, /无需操作|Nothing to do/);
assert.doesNotMatch(idleProj.supportingText, /没有可操作的任务|No operable task/);

// viewOnly + expired observation must stay unsupported (not stale)
const viewOnlyStaleObs = {
  agentId: 'kind:gemini',
  runtimeKind: 'gemini',
  displayName: 'Gemini',
  observedStatus: { value: 'idle', freshUntil: asOf - 1 },
  actions: [
    {
      id: 'agent.interrupt',
      reason: 'provider_unsupported',
      enabled: false,
      freshUntil: asOf - 1
    }
  ]
};
const viewStaleProj = AC._projectAgentControl(viewOnlyStaleObs, { asOf });
assert.equal(viewStaleProj.capability, 'viewOnly');
assert.equal(viewStaleProj.blocker, 'unsupported');
assert.notEqual(viewStaleProj.blocker, 'stale');
const cursorStaleNamed = Object.assign({}, cursorStale, { displayName: 'Cursor Stale' });
const mixedOv = AC._computeHomeOverview({
  asOf,
  groups: {
    needsAttention: [],
    connected: ['kind:gemini', 'kind:cursor-stale'],
    discoveredLimited: [],
    supportedNotFound: []
  },
  agents: [viewOnlyStaleObs, cursorStaleNamed]
});
assert.equal(mixedOv.unsupported, 1);
assert.equal(mixedOv.stale, 1);
assert.equal(mixedOv.staleNames.length, 1);
assert.equal(mixedOv.staleNames[0], 'Cursor Stale');
assert.match(AC.t('overviewStaleHintMany'), /等 \{n\}|and \{n\}/);

const aiderView = {
  agentId: 'kind:aider',
  runtimeKind: 'aider',
  actions: [{ id: 'agent.interrupt', reason: 'provider_unsupported', enabled: false }]
};
assert.equal(AC._projectAgentControl(aiderView, { asOf }).capability, 'viewOnly');

// focus enabled + interrupt blocked → focus button, no grey stop placeholder
AC._state.snap = { asOf, agents: [], groups: {} };
const focusOnlyAgent = {
  agentId: 'kind:claude-focus',
  runtimeKind: 'claude',
  displayName: 'Claude',
  actions: [
    { id: 'agent.focus', enabled: true, supported: true },
    {
      id: 'agent.interrupt',
      support: 'native',
      enabled: false,
      reason: 'control_plane_unavailable'
    }
  ]
};
const rowHtml = AC.__test.homeActionButtons(focusOnlyAgent, { rowOnly: true });
assert.match(rowHtml, /data-action="agent\.focus"/);
assert.doesNotMatch(rowHtml, /data-action="agent\.interrupt"/);
assert.match(rowHtml, /data-har-recovery="connect"/);
assert.doesNotMatch(rowHtml, /disabled/);

// Constants + TTL source
assert.equal(AC.__test.OVERVIEW_SOFT_POLL_MS, 5000);
assert.equal(AC.__test.STALE_AUTO_COOLDOWN_MS, 30000);
const codexBg = read('src-tauri/src/agent_memory/codex_background.rs');
const claudeBg = read('src-tauri/src/agent_memory/claude_background.rs');
assert.match(codexBg, /PROBE_TTL_MS:\s*u64\s*=\s*30_000/);
assert.match(claudeBg, /PROBE_TTL_MS:\s*u64\s*=\s*30_000/);
assert.match(js, /OVERVIEW_SOFT_POLL_MS\s*=\s*5000/);
assert.match(js, /scheduleOverviewSoftPoll/);
assert.match(js, /staleRecovery/);
assert.match(js, /data-har-fold-toggle/);
assert.match(js, /aria-controls/);
assert.doesNotMatch(js, /primaryLabel[\s\S]{0,80}interruptUnavailablePrefix/);

const rosterCss = read('src/css/home-agent-roster.css');
assert.match(rosterCss, /\.har-fold-toggle/);
assert.match(rosterCss, /\.har-action--recovery/);
assert.match(rosterCss, /\.har-row--view-only/);
assert.match(rosterCss, /\.har-verdict/);

// stale auto-recover: same asOf only once
const staleSnap = {
  asOf: 9001,
  groups: {
    needsAttention: [],
    connected: ['kind:cursor-stale'],
    discoveredLimited: [],
    supportedNotFound: []
  },
  agents: [cursorStale]
};
AC._state.mountMode = 'overview';
AC._state.snap = staleSnap;
let forceCalls = 0;
sandbox.__TAURI_INTERNALS__ = {
  invoke: function (cmd) {
    forceCalls += 1;
    return Promise.resolve(staleSnap);
  }
};
AC.__test.getStaleRecovery().attemptedSnapshotAsOf = 0;
AC.__test.getStaleRecovery().lastAttemptAt = 0;
AC.__test.getStaleRecovery().inFlight = false;
AC.__test.maybeAutoRecoverStale(AC._computeHomeOverview(staleSnap));
assert.equal(AC.__test.getStaleRecovery().attemptedSnapshotAsOf, 9001);
assert.ok(forceCalls >= 1, 'first stale auto force fires');
const callsAfterFirst = forceCalls;
AC.__test.maybeAutoRecoverStale(AC._computeHomeOverview(staleSnap));
assert.equal(forceCalls, callsAfterFirst, 'same asOf must not auto-force again');

// in-flight refresh merges
forceCalls = 0;
let resolveFirst;
const slow = new Promise(function (r) {
  resolveFirst = r;
});
sandbox.__TAURI_INTERNALS__ = {
  invoke: function () {
    forceCalls += 1;
    return slow.then(function () {
      return staleSnap;
    });
  }
};
AC._state.snap = null;
AC.__test.getStaleRecovery().inFlight = false;
AC.__test.clearOverviewPoll();
{
  const prevFly = AC.__test.getHomeRefreshInFlight();
  if (prevFly) await prevFly.then(function () {}, function () {});
}
const p1 = AC.refresh(null, { force: true });
const p2 = AC.refresh(null, { softPoll: true });
assert.equal(p1, p2, 'in-flight soft refresh reuses promise');
assert.equal(forceCalls, 1);
resolveFirst();
await p1;

// soft in-flight + stale force: force waits; soft completion must not null a later force slot
let softResolve;
const softGate = new Promise(function (r) {
  softResolve = r;
});
let invokePhase = 'soft';
let softInvokes = 0;
let forceInvokes = 0;
sandbox.__TAURI_INTERNALS__ = {
  invoke: function (cmd) {
    if (invokePhase === 'soft') {
      softInvokes += 1;
      return softGate.then(function () {
        return Object.assign({}, staleSnap, { asOf: 9100 });
      });
    }
    forceInvokes += 1;
    return Promise.resolve(Object.assign({}, staleSnap, { asOf: 9101 }));
  }
};
AC._state.snap = null;
AC._state.mountMode = 'overview';
AC.__test.getStaleRecovery().attemptedSnapshotAsOf = 0;
AC.__test.getStaleRecovery().lastAttemptAt = 0;
AC.__test.getStaleRecovery().inFlight = false;
invokePhase = 'soft';
const softPending = AC.refresh(null, { softPoll: true });
assert.equal(softInvokes, 1);
invokePhase = 'force';
const forcePending = AC.refresh(null, { force: true });
assert.equal(forceInvokes, 0, 'force must wait for soft in-flight');
softResolve();
await softPending;
await forcePending;
assert.ok(forceInvokes >= 1, 'force runs after soft completes');

assert.match(rosterCss, /\.har-fold-toggle:focus-visible/);

// overview hidden → soft poll timer cleared
AC._state.mountMode = 'overview';
sandbox.document.hidden = true;
AC.__test.clearOverviewPoll();
AC.__test.scheduleOverviewSoftPoll(null);
assert.equal(AC.__test.isOverviewHostVisible(), false);

// Narrow drawer a11y markup contracts (behavior covered by test-agent-center-drawer-a11y)
assert.match(js, /aria-modal="true"/);
assert.match(js, /name="ac-drawer-search"/);
assert.match(js, /autocomplete="off"/);
assert.match(js, /escapeAttr\(t\('drawerSearch'\)\)/);
assert.match(js, /\binert\b/);
assert.match(js, /handleDrawerKeydown/);
assert.ok(typeof AC.__test.openDrawer === 'function');
assert.ok(typeof AC.__test.closeDrawer === 'function');
assert.ok(typeof AC.__test.handleDrawerKeydown === 'function');

console.log('test-agent-center: ok');
