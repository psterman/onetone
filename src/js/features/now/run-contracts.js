/**
 * OneToneRunContracts — sole factory/normalize/assert for Run runtime shapes.
 * Controller must assert before every write; archive persist uses allowlist only.
 */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;

  var RUN_KEYS = [
    'schemaVersion', 'runId', 'mode', 'originalRequest', 'goal', 'phase', 'status',
    'plan', 'tasks', 'actions', 'observations', 'evidence', 'providerCalls', 'gaps',
    'budget', 'providerRoute', 'trace', 'stopReason', 'resumeAvailable',
    'createdAt', 'updatedAt', 'nextAction'
  ];
  var TASK_KEYS = [
    'taskId', 'kind', 'status', 'deps', 'attemptId', 'detail', 'outputs', 'error'
  ];
  var ACTION_KEYS = [
    'actionId', 'taskId', 'toolId', 'input', 'status', 'attempt',
    'result', 'error', 'providerId', 'model', 'startedAt', 'finishedAt', 'generation'
  ];
  var OBS_KEYS = [
    'observationId', 'actionId', 'toolId', 'ok', 'summary', 'data', 'at'
  ];
  var EVIDENCE_KEYS = [
    'evidenceId', 'actionId', 'kind', 'ref', 'payload', 'at'
  ];
  var CALL_KEYS = [
    'callId', 'actionId', 'purpose', 'providerId', 'model', 'ok',
    'fallbackFrom', 'durationMs', 'error', 'errorCode', 'startedAt', 'finishedAt', 'status'
  ];

  var SECRET_KEYS = {
    apiKey: 1, accessToken: 1, authorization: 1, headers: 1,
    rawRequest: 1, rawResponse: 1, messages: 1, prompt: 1,
    Authorization: 1, password: 1, token: 1, secret: 1
  };

  var TASK_STATUSES = {
    pending: 1, ready: 1, running: 1, completed: 1, failed: 1,
    cancelled: 1, waiting: 1, waiting_approval: 1, waiting_user: 1,
    verifying: 1, repair: 1, skipped: 1
  };
  var ACTION_STATUSES = {
    pending: 1, running: 1, completed: 1, failed: 1, cancelled: 1, waiting: 1
  };
  /** Product run statuses. `resumable` is NOT a status — use resumeAvailable + interrupted. */
  var RUN_STATUSES = {
    running: 1, completed: 1, failed: 1, cancelled: 1, waiting: 1,
    // Legacy aliases — normalizeRun / mapAtrStatus collapse these to waiting.
    waiting_approval: 1, waiting_user: 1, verifying: 1, repair: 1, interrupted: 1
  };

  var WAITING_REASONS = {
    approval: 1,
    user_input: 1,
    deliver_approval: 1,
    abandoned: 1
  };

  var ATR_BUSY = {
    running: 1,
    verifying: 1,
    repair: 1,
    review: 1,
    intake: 1
  };

  /** Map ATR TaskRow.status → RunContracts run status (reasons stay on waitingReason). */
  function mapAtrStatus(atrStatus) {
    var s = String(atrStatus || '').toLowerCase();
    if (s === 'done') return 'completed';
    // Legacy FE aliases → canonical waiting (reason lives separately).
    if (
      s === 'waiting' ||
      s === 'waiting_approval' ||
      s === 'waiting_user' ||
      s === 'needs_input' ||
      s === 'waiting_input'
    ) {
      return 'waiting';
    }
    if (s === 'verifying' || s === 'review') return 'verifying';
    if (s === 'repair') return 'repair';
    if (s === 'failed') return 'failed';
    if (s === 'cancelled') return 'cancelled';
    if (s === 'interrupted') return 'interrupted';
    if (s === 'running' || s === 'intake') return 'running';
    return RUN_STATUSES[s] ? s : 'running';
  }

  function normalizeWaitingReason(raw) {
    var s = String(raw || '').trim().toLowerCase();
    if (!s) return null;
    if (WAITING_REASONS[s]) return s;
    // Legacy event-kind / UI labels → canonical reason.
    if (s === 'waiting_approval' || s === 'awaiting_approval' || s === 'patch') {
      return 'approval';
    }
    if (s === 'waiting_user' || s === 'waiting_user_input' || s === 'needs_input') {
      return 'user_input';
    }
    if (s === 'waiting_deliver' || s === 'deliver') return 'deliver_approval';
    return null;
  }

  /**
   * Sole ATR→UI/controller projection. Never invents phase from local flags.
   * @returns {{ status:string, waitingReason:string|null, busy:boolean, pauseKind:string|null, atrStatus:string }}
   */
  function projectAtrTask(dto) {
    dto = dto || {};
    var atrStatus = String(dto.status || '').toLowerCase();
    var status = mapAtrStatus(atrStatus);
    var waitingReason = normalizeWaitingReason(
      dto.waitingReason != null ? dto.waitingReason : dto.waiting_reason
    );
    if (status === 'waiting' && !waitingReason) {
      waitingReason = 'user_input';
    }
    var busy = !!ATR_BUSY[atrStatus];
    var pauseKind = null;
    if (status === 'waiting') {
      pauseKind =
        waitingReason === 'approval'
          ? 'approval'
          : waitingReason === 'deliver_approval'
            ? 'deliver_approval'
            : 'user_input';
    } else if (status === 'interrupted') {
      pauseKind = 'interrupted';
    }
    return {
      status: status,
      waitingReason: waitingReason,
      busy: busy,
      pauseKind: pauseKind,
      atrStatus: atrStatus || status
    };
  }

  function nowIso() { return new Date().toISOString(); }

  function id(prefix) {
    return String(prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function pick(obj, keys) {
    var out = {};
    if (!obj || typeof obj !== 'object') return out;
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  function fail(code, detail) {
    var err = new Error(code + (detail ? ': ' + detail : ''));
    err.code = code;
    throw err;
  }

  function scrubValue(v, depth) {
    depth = depth == null ? 0 : depth;
    if (depth > 12) return null;
    if (v == null) return v;
    if (Array.isArray(v)) {
      return v.map(function (x) { return scrubValue(x, depth + 1); });
    }
    if (typeof v !== 'object') return v;
    var out = {};
    Object.keys(v).forEach(function (k) {
      if (SECRET_KEYS[k]) return;
      out[k] = scrubValue(v[k], depth + 1);
    });
    return out;
  }

  /**
   * Coerce budget — Object.assign copies undefined and wiped {search:0,…} to undefined.
   * search/fetch default 0; model null = uncapped (provider owns LLM limits).
   */
  function normalizeBudget(raw) {
    var b = raw && typeof raw === 'object' ? raw : {};
    function n(v) {
      if (v == null || v === '') return 0;
      var x = Number(v);
      return isFinite(x) && x >= 0 ? x : 0;
    }
    function nModel(v) {
      if (v == null || v === '') return null;
      var x = Number(v);
      return isFinite(x) && x >= 0 ? x : null;
    }
    return {
      search: n(b.search),
      fetch: n(b.fetch),
      model: nModel(b.model != null ? b.model : b.modelCalls)
    };
  }

  function createRun(opts) {
    opts = opts || {};
    var t = nowIso();
    return normalizeRun({
      schemaVersion: SCHEMA_VERSION,
      runId: String(opts.runId || id('run')),
      mode: opts.mode || 'research',
      originalRequest: String(opts.originalRequest || ''),
      goal: String(opts.goal || opts.originalRequest || ''),
      phase: opts.phase || 'observe',
      status: opts.status || 'running',
      plan: opts.plan || null,
      tasks: Array.isArray(opts.tasks) ? opts.tasks.map(normalizeTask) : [],
      actions: [],
      observations: [],
      evidence: [],
      providerCalls: [],
      gaps: [],
      budget: normalizeBudget(opts.budget),
      providerRoute: opts.providerRoute || null,
      trace: [],
      stopReason: null,
      resumeAvailable: false,
      nextAction: null,
      createdAt: opts.createdAt || t,
      updatedAt: opts.updatedAt || t
    });
  }

  function createTask(partial) {
    partial = partial || {};
    return normalizeTask({
      taskId: String(partial.taskId || partial.id || id('task')),
      kind: String(partial.kind || 'generic'),
      status: partial.status || 'pending',
      deps: Array.isArray(partial.deps) ? partial.deps.slice() : [],
      attemptId: Number(partial.attemptId || 1),
      detail: partial.detail != null ? String(partial.detail) : '',
      outputs: partial.outputs != null ? partial.outputs : null,
      error: partial.error || null
    });
  }

  function createAction(partial) {
    partial = partial || {};
    return normalizeAction({
      actionId: String(partial.actionId || id('action')),
      taskId: partial.taskId != null ? partial.taskId : null,
      toolId: String(partial.toolId || partial.action || ''),
      input: partial.input || partial.arguments || {},
      status: partial.status || 'pending',
      attempt: Number(partial.attempt || 1),
      result: partial.result != null ? partial.result : null,
      error: partial.error || null,
      providerId: partial.providerId != null ? partial.providerId : null,
      model: partial.model != null ? partial.model : null,
      startedAt: partial.startedAt || null,
      finishedAt: partial.finishedAt || null,
      generation: Number(partial.generation || 1)
    });
  }

  function createObservation(partial) {
    partial = partial || {};
    return normalizeObservation({
      observationId: String(partial.observationId || id('obs')),
      actionId: String(partial.actionId || ''),
      toolId: String(partial.toolId || ''),
      ok: !!partial.ok,
      summary: String(partial.summary || ''),
      data: partial.data != null ? scrubValue(partial.data) : null,
      at: partial.at || nowIso()
    });
  }

  function createEvidence(partial) {
    partial = partial || {};
    return normalizeEvidence({
      evidenceId: String(partial.evidenceId || id('ev')),
      actionId: String(partial.actionId || ''),
      kind: String(partial.kind || 'generic'),
      ref: partial.ref != null ? String(partial.ref) : null,
      payload: partial.payload != null ? scrubValue(partial.payload) : null,
      at: partial.at || nowIso()
    });
  }

  function createProviderCall(partial) {
    partial = partial || {};
    return normalizeProviderCall({
      callId: String(partial.callId || id('call')),
      actionId: partial.actionId != null ? partial.actionId : null,
      purpose: String(partial.purpose || 'synthesis'),
      providerId: String(partial.providerId || ''),
      model: String(partial.model || ''),
      ok: !!partial.ok,
      fallbackFrom: partial.fallbackFrom || null,
      durationMs: Number(partial.durationMs || 0),
      error: partial.error || null,
      errorCode: partial.errorCode || (partial.error && partial.error.code) || null,
      status: partial.status || (partial.ok ? 'ok' : 'error'),
      startedAt: partial.startedAt || null,
      finishedAt: partial.finishedAt || nowIso()
    });
  }

  function normalizeRun(raw) {
    var r = pick(raw || {}, RUN_KEYS);
    r.schemaVersion = SCHEMA_VERSION;
    r.runId = String(r.runId || id('run'));
    r.mode = String(r.mode || 'research');
    r.originalRequest = String(r.originalRequest || '');
    r.goal = String(r.goal || '');
    r.phase = String(r.phase || 'observe');
    r.status = String(r.status || 'running');
    r.plan = r.plan || null;
    r.tasks = Array.isArray(r.tasks) ? r.tasks.map(normalizeTask) : [];
    r.actions = Array.isArray(r.actions) ? r.actions.map(normalizeAction) : [];
    r.observations = Array.isArray(r.observations) ? r.observations.map(normalizeObservation) : [];
    r.evidence = Array.isArray(r.evidence) ? r.evidence.map(normalizeEvidence) : [];
    r.providerCalls = Array.isArray(r.providerCalls) ? r.providerCalls.map(normalizeProviderCall) : [];
    r.gaps = Array.isArray(r.gaps) ? r.gaps.slice() : [];
    r.budget = normalizeBudget(r.budget);
    r.providerRoute = r.providerRoute || null;
    r.trace = Array.isArray(r.trace) ? r.trace.map(function (t) { return scrubValue(t); }) : [];
    r.stopReason = r.stopReason != null ? String(r.stopReason) : null;
    r.resumeAvailable = !!r.resumeAvailable;
    r.nextAction = r.nextAction ? normalizeAction(r.nextAction) : null;
    r.createdAt = r.createdAt || nowIso();
    r.updatedAt = r.updatedAt || nowIso();
    return r;
  }

  function normalizeTask(raw) {
    var t = pick(raw || {}, TASK_KEYS);
    if (!t.taskId && raw && raw.id) t.taskId = String(raw.id);
    t.taskId = String(t.taskId || id('task'));
    t.kind = String(t.kind || 'generic');
    t.status = String(t.status || 'pending');
    t.deps = Array.isArray(t.deps) ? t.deps.map(String) : [];
    t.attemptId = Number(t.attemptId || 1);
    t.detail = t.detail != null ? String(t.detail) : '';
    t.outputs = t.outputs != null ? scrubValue(t.outputs) : null;
    t.error = t.error ? scrubValue(t.error) : null;
    return t;
  }

  function normalizeAction(raw) {
    var a = pick(raw || {}, ACTION_KEYS);
    a.actionId = String(a.actionId || id('action'));
    a.taskId = a.taskId != null ? a.taskId : null;
    a.toolId = String(a.toolId || '');
    a.input = scrubValue(a.input && typeof a.input === 'object' ? a.input : {});
    a.status = String(a.status || 'pending');
    a.attempt = Number(a.attempt || 1);
    a.result = a.result != null ? scrubValue(a.result) : null;
    a.error = a.error != null ? scrubValue(a.error) : null;
    a.providerId = a.providerId != null ? String(a.providerId) : null;
    a.model = a.model != null ? String(a.model) : null;
    a.startedAt = a.startedAt || null;
    a.finishedAt = a.finishedAt || null;
    a.generation = Number(a.generation || 1);
    return a;
  }

  function normalizeObservation(raw) {
    var o = pick(raw || {}, OBS_KEYS);
    o.observationId = String(o.observationId || id('obs'));
    o.actionId = String(o.actionId || '');
    o.toolId = String(o.toolId || '');
    o.ok = !!o.ok;
    o.summary = String(o.summary || '');
    o.data = o.data != null ? scrubValue(o.data) : null;
    o.at = o.at || nowIso();
    return o;
  }

  function normalizeEvidence(raw) {
    var e = pick(raw || {}, EVIDENCE_KEYS);
    e.evidenceId = String(e.evidenceId || id('ev'));
    e.actionId = String(e.actionId || '');
    e.kind = String(e.kind || 'generic');
    e.ref = e.ref != null ? String(e.ref) : null;
    e.payload = e.payload != null ? scrubValue(e.payload) : null;
    e.at = e.at || nowIso();
    return e;
  }

  function normalizeProviderCall(raw) {
    var c = pick(raw || {}, CALL_KEYS);
    c.callId = String(c.callId || id('call'));
    c.actionId = c.actionId != null ? c.actionId : null;
    c.purpose = String(c.purpose || 'synthesis');
    c.providerId = String(c.providerId || '');
    c.model = String(c.model || '');
    c.ok = !!c.ok;
    c.fallbackFrom = c.fallbackFrom || null;
    c.durationMs = Number(c.durationMs || 0);
    c.error = c.error != null ? scrubValue(c.error) : null;
    c.errorCode = c.errorCode != null ? String(c.errorCode) : null;
    c.status = String(c.status || (c.ok ? 'ok' : 'error'));
    c.startedAt = c.startedAt || null;
    c.finishedAt = c.finishedAt || null;
    return c;
  }

  function assertRun(run) {
    if (!run || typeof run !== 'object') fail('invalid_run', 'not_object');
    if (Number(run.schemaVersion) !== SCHEMA_VERSION) fail('invalid_run', 'schemaVersion');
    if (!run.runId) fail('invalid_run', 'runId');
    if (!RUN_STATUSES[run.status]) fail('invalid_run', 'status=' + run.status);
    if (!Array.isArray(run.tasks) || !Array.isArray(run.actions) || !Array.isArray(run.observations)) {
      fail('invalid_run', 'collections');
    }
    if (!run.createdAt || !run.updatedAt) fail('invalid_run', 'timestamps');
    return true;
  }

  function assertTask(task) {
    if (!task || typeof task !== 'object') fail('invalid_task', 'not_object');
    if (!task.taskId) fail('invalid_task', 'taskId');
    if (!TASK_STATUSES[task.status]) fail('invalid_task', 'status=' + task.status);
    return true;
  }

  function assertAction(action) {
    if (!action || typeof action !== 'object') fail('invalid_action', 'not_object');
    if (!action.actionId) fail('invalid_action', 'actionId');
    if (!action.toolId) fail('invalid_action', 'toolId');
    if (!ACTION_STATUSES[action.status]) fail('invalid_action', 'status=' + action.status);
    if (action.input == null || typeof action.input !== 'object' || Array.isArray(action.input)) {
      fail('invalid_action', 'input');
    }
    return true;
  }

  function assertObservation(obs) {
    if (!obs || typeof obs !== 'object') fail('invalid_observation', 'not_object');
    if (!obs.observationId || !obs.actionId) fail('invalid_observation', 'ids');
    return true;
  }

  function assertEvidence(ev) {
    if (!ev || typeof ev !== 'object') fail('invalid_evidence', 'not_object');
    if (!ev.evidenceId || !ev.actionId) fail('invalid_evidence', 'ids');
    return true;
  }

  function assertProviderCall(call) {
    if (!call || typeof call !== 'object') fail('invalid_provider_call', 'not_object');
    if (!call.callId || !call.providerId) fail('invalid_provider_call', 'ids');
    return true;
  }

  function toArchivePayload(run) {
    var normalized = normalizeRun(run);
    assertRun(normalized);
    normalized.updatedAt = nowIso();
    // Drop secrets again on nested traces/results
    return scrubValue(normalized);
  }

  /** Alias required by product contract — same as toArchivePayload. */
  function scrubRun(run) {
    return toArchivePayload(run);
  }

  /**
   * Legacy slot taskId:'atr' + outputs.taskId → Task.taskId === ATR uuid.
   * Also rewrite Action.taskId 'atr' → real id when present.
   */
  function migrateAtrTaskSlot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return snapshot;
    var run = normalizeRun(snapshot);
    var realId = null;
    var i;
    for (i = 0; i < (run.tasks || []).length; i++) {
      var t = run.tasks[i];
      if (!t) continue;
      if (t.taskId === 'atr') {
        realId = (t.outputs && (t.outputs.atrTaskId || t.outputs.taskId)) || null;
        if (realId) {
          t.taskId = String(realId);
          t.kind = t.kind || 'atr';
          t.outputs = Object.assign({}, t.outputs || {}, {
            atrTaskId: String(realId),
            taskId: String(realId)
          });
        }
      } else if (t.kind === 'atr' && t.outputs) {
        if (!t.outputs.atrTaskId) t.outputs.atrTaskId = t.taskId;
      }
    }
    if (realId) {
      run.actions = (run.actions || []).map(function (a) {
        if (a && a.taskId === 'atr') a.taskId = String(realId);
        if (a && a.toolId === 'atr_turn' && a.input && !a.input.taskId) {
          a.input.taskId = String(realId);
        }
        return a;
      });
      if (run.plan && typeof run.plan === 'object' && !run.plan.atrTaskId) {
        run.plan.atrTaskId = String(realId);
      }
    }
    return run;
  }

  /** Disk running → interrupted for restore decision (Controller owns resume). */
  function coerceInterrupted(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return null;
    var run = migrateAtrTaskSlot(normalizeRun(snapshot));
    if (run.status === 'running' || run.status === 'verifying' || run.status === 'repair') {
      run.status = 'interrupted';
      run.stopReason = run.stopReason || 'process_restart';
      run.resumeAvailable = true;
      run.actions = (run.actions || []).map(function (a) {
        if (a.status === 'running') {
          a.status = 'failed';
          a.error = a.error || { code: 'interrupted', message: 'process_restart' };
          a.finishedAt = a.finishedAt || nowIso();
        }
        return a;
      });
      run.updatedAt = nowIso();
    }
    return run;
  }

  global.OneToneRunContracts = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    SECRET_KEYS: SECRET_KEYS,
    RUN_STATUSES: RUN_STATUSES,
    TASK_STATUSES: TASK_STATUSES,
    ACTION_STATUSES: ACTION_STATUSES,
    createRun: createRun,
    createTask: createTask,
    createAction: createAction,
    createObservation: createObservation,
    createEvidence: createEvidence,
    createProviderCall: createProviderCall,
    normalizeRun: normalizeRun,
    normalizeTask: normalizeTask,
    normalizeAction: normalizeAction,
    normalizeObservation: normalizeObservation,
    normalizeEvidence: normalizeEvidence,
    normalizeProviderCall: normalizeProviderCall,
    assertRun: assertRun,
    assertTask: assertTask,
    assertAction: assertAction,
    assertObservation: assertObservation,
    assertEvidence: assertEvidence,
    assertProviderCall: assertProviderCall,
    toArchivePayload: toArchivePayload,
    scrubRun: scrubRun,
    coerceInterrupted: coerceInterrupted,
    migrateAtrTaskSlot: migrateAtrTaskSlot,
    mapAtrStatus: mapAtrStatus,
    normalizeWaitingReason: normalizeWaitingReason,
    projectAtrTask: projectAtrTask,
    WAITING_REASONS: WAITING_REASONS,
    ATR_BUSY: ATR_BUSY,
    scrubValue: scrubValue,
    id: id
  };
})(typeof window !== 'undefined' ? window : globalThis);
