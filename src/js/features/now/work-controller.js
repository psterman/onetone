/**
 * OneToneWorkController — sole Run state mover + tool executor.
 */
(function (global) {
  'use strict';

  var PHASES = [
    'observe', 'understand', 'plan', 'choose_action', 'validate_action',
    'execute_tool', 'validate_result', 'update_state', 'finished'
  ];
  var TERMINAL = {
    completed: true, failed: true, cancelled: true, interrupted: true
  };
  /**
   * Pause: no new atr_turn until resume/continue.
   * Canonical pause status is waiting; legacy aliases normalize to waiting.
   * verifying / repair / review stay running so Controller keeps stepping.
   */
  var PAUSE = {
    waiting: true,
    // Legacy aliases (normalize to waiting via mapAtrStatus / finish).
    waiting_approval: true,
    waiting_user: true
  };
  var ATR_IDLE = {
    waiting: 1,
    waiting_approval: 1,
    waiting_user: 1,
    completed: 1,
    failed: 1,
    cancelled: 1,
    interrupted: 1
  };

  function contracts() { return global.OneToneRunContracts; }
  function registry() { return global.OneToneToolRegistry; }
  function archive() { return global.OneToneRunArchive; }
  function gateway() { return global.OneToneModelGateway; }

  function nowIso() { return new Date().toISOString(); }

  function createAbortBundle(externalSignal) {
    var aborted = false;
    var reason = null;
    var listeners = [];
    function abort(r) {
      if (aborted) return;
      aborted = true;
      reason = r || 'cancelled';
      listeners.slice().forEach(function (fn) {
        try { fn(reason); } catch (_) {}
      });
    }
    if (externalSignal) {
      if (externalSignal.aborted) abort(externalSignal.reason || 'cancelled');
      else if (typeof externalSignal.addEventListener === 'function') {
        externalSignal.addEventListener('abort', function () {
          abort(externalSignal.reason || 'cancelled');
        });
      } else if (typeof externalSignal.onabort === 'function' || externalSignal.onabort === null) {
        var prev = externalSignal.onabort;
        externalSignal.onabort = function (ev) {
          if (typeof prev === 'function') prev(ev);
          abort('cancelled');
        };
      }
    }
    return {
      get aborted() { return aborted; },
      get reason() { return reason; },
      abort: abort,
      throwIfAborted: function () {
        if (aborted) {
          var err = new Error('cancelled');
          err.code = 'cancelled';
          throw err;
        }
      },
      onAbort: function (fn) { listeners.push(fn); },
      asSignal: function () {
        return {
          get aborted() { return aborted; },
          addEventListener: function (type, fn) {
            if (type === 'abort') listeners.push(fn);
          }
        };
      }
    };
  }

  function create(opts) {
    opts = opts || {};
    var C = contracts();
    if (!C) throw new Error('run_contracts_required');

    if (archive() && archive().migrate) {
      try { archive().migrate(); } catch (_) {}
    }

    var state = C.createRun({
      runId: opts.runId,
      mode: opts.mode || 'research',
      originalRequest: opts.originalRequest || '',
      goal: opts.goal || '',
      plan: opts.plan || null,
      tasks: Array.isArray(opts.tasks) ? opts.tasks : [],
      budget: opts.budget || {},
      providerRoute: opts.providerRoute || null
    });
    if (C.migrateAtrTaskSlot) state = C.migrateAtrTaskSlot(state) || state;
    C.assertRun(state);

    var host = {
      invoke: opts.invoke || null,
      permissions: opts.permissions || ['*'],
      timeoutMs: opts.timeoutMs || 120000
    };
    var activeAbort = null;
    var listeners = [];
    // Work mode: atr_turn blocked until confirmPlan (unless restore / skip / already confirmed).
    var planConfirmed = state.mode !== 'work'
      || !!opts.planConfirmed
      || !!opts.skipPlanConfirm
      || !!opts.restore
      || !!(opts.plan && (opts.plan.confirmed === true || opts.plan.status === 'confirmed'));
    if (state.mode === 'work' && !planConfirmed && !opts.restore) {
      state.phase = 'plan';
      state.status = 'waiting';
      state.stopReason = 'awaiting_plan';
      state.resumeAvailable = true;
    }

    function emitEvent(type, detail) {
      var payload = Object.assign({ at: nowIso(), type: type }, detail || {});
      state.trace.push(C.scrubValue ? C.scrubValue(payload) : payload);
      state.updatedAt = nowIso();
      try { C.assertRun(state); } catch (_) {}
      if (archive() && archive().save) {
        try { archive().save(C.toArchivePayload(state)); } catch (_) {}
      }
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](type, snapshot()); } catch (_) {}
      }
    }

    function snapshot() {
      return C.normalizeRun(JSON.parse(JSON.stringify(state)));
    }

    function transition(next) {
      if (PHASES.indexOf(next) < 0) throw new Error('invalid_phase');
      state.phase = next;
      state.updatedAt = nowIso();
      emitEvent('phase', { phase: next });
      return snapshot();
    }

    function budgetKindForTool(tool) {
      if (tool && tool.budgetKind) return tool.budgetKind;
      var id = tool && tool.id;
      if (id === 'web_search' || id === 'search') return 'search';
      if (id === 'fetch_url' || id === 'fetch') return 'fetch';
      return 'model';
    }

    function validateAction(action) {
      if (!action) return { ok: false, code: 'invalid_action' };
      if (state.status !== 'running') return { ok: false, code: 'controller_stopped' };
      var reg = registry();
      var toolId = reg && reg.aliasToolId ? reg.aliasToolId(action.toolId || action.action) : String(action.toolId || action.action || '');
      var input = Object.assign({}, action.input || action.arguments || {});
      if (action.query != null && input.query == null) input.query = action.query;
      if (action.url != null && input.url == null) input.url = action.url;
      if (action.limit != null && input.limit == null) input.limit = action.limit;
      if (toolId === 'atr_turn' || toolId === 'atr_tool_call') {
        if (state.mode === 'work' && !planConfirmed) {
          return { ok: false, code: 'plan_not_confirmed' };
        }
        if (Number(input.maxSteps) !== 1) {
          return { ok: false, code: 'atr_max_steps_required' };
        }
        var atrTid = String(input.taskId || '').trim();
        if (!atrTid) return { ok: false, code: 'atr_task_required' };
        var actTid = action.taskId != null ? String(action.taskId) : '';
        // Legacy literal 'atr' slot is upgraded; any other mismatch is rejected.
        if (actTid && actTid !== atrTid && actTid !== 'atr') {
          return { ok: false, code: 'atr_task_mismatch' };
        }
        // Force Action.taskId === ATR task id
        action.taskId = atrTid;
      }
      if (reg && reg.validate) {
        var vr = reg.validate(toolId, input, state.mode);
        if (!vr.ok) return vr;
      }
      if (reg && reg.checkPermission) {
        var pr = reg.checkPermission(toolId, state.mode, host.permissions);
        if (!pr.ok) return pr;
      }
      var tool = reg && reg.get ? reg.get(toolId) : null;
      var kind = budgetKindForTool(tool || { id: toolId });
      if (state.budget[kind] != null && state.budget[kind] <= 0) {
        return { ok: false, code: 'budget_exhausted', kind: kind };
      }
      return { ok: true, toolId: toolId, tool: tool, input: input, kind: kind };
    }

    function choose(action) {
      var check = validateAction(action);
      if (!check.ok) { emitEvent('action_rejected', check); return check; }
      state.nextAction = C.createAction({
        toolId: check.toolId,
        input: check.input,
        taskId: action.taskId || null
      });
      C.assertAction(state.nextAction);
      transition('validate_action');
      return { ok: true, action: state.nextAction };
    }

    function consume(kind) {
      if (state.budget[kind] != null) {
        state.budget[kind] = Math.max(0, state.budget[kind] - 1);
      }
      emitEvent('budget', { kind: kind, remaining: state.budget[kind] });
    }

    function actionStarted(action) {
      var check = validateAction(action);
      if (!check.ok) return check;
      var actionId = String(action.actionId || C.id('action'));
      if (state.actions.some(function (a) {
        return a.actionId === actionId && a.status !== 'failed' && a.status !== 'cancelled';
      })) {
        return { ok: false, code: 'duplicate_action' };
      }
      consume(check.kind);
      transition('execute_tool');
      var record = C.createAction({
        actionId: actionId,
        taskId: action.taskId != null ? action.taskId : null,
        toolId: check.toolId,
        input: check.input,
        status: 'running',
        attempt: Number(action.attempt || 1),
        providerId: action.providerId || null,
        model: action.model || null,
        startedAt: nowIso(),
        generation: Number(action.generation || 1)
      });
      C.assertAction(record);
      state.actions.push(record);
      emitEvent('action_start', { action: record });
      return { ok: true, actionId: actionId, action: record, tool: check.tool };
    }

    function findAction(actionId) {
      for (var i = 0; i < state.actions.length; i++) {
        if (state.actions[i].actionId === actionId) return state.actions[i];
      }
      return null;
    }

    function actionResult(result) {
      var actionId = result && result.actionId;
      var record = findAction(actionId);
      if (!record) return snapshot();
      // Late-arrival guard
      if (record.status !== 'running') {
        emitEvent('action_late_ignored', { actionId: actionId, status: record.status });
        return snapshot();
      }
      var gen = Number(result.generation || record.generation || 1);
      if (gen !== Number(record.generation || 1)) {
        emitEvent('action_stale_ignored', { actionId: actionId });
        return snapshot();
      }
      var failed = !!(result && (result.error || result.ok === false));
      var cancelled = failed && result.error && (result.error.code === 'cancelled' || result.error === 'cancelled');
      record.status = cancelled ? 'cancelled' : failed ? 'failed' : 'completed';
      record.result = result && result.result != null ? result.result : (result || null);
      record.error = cancelled
        ? { code: 'cancelled', message: 'cancelled' }
        : (result && result.error ? result.error : null);
      if (result && result.providerId) record.providerId = result.providerId;
      if (result && result.model) record.model = result.model;
      record.finishedAt = nowIso();
      C.assertAction(record);

      var obs = C.createObservation({
        actionId: actionId,
        toolId: record.toolId,
        ok: !failed,
        summary: cancelled ? 'cancelled' : (failed ? String((result.error && (result.error.code || result.error.message)) || 'error') : 'ok'),
        data: result && result.observation != null ? result.observation : (result && result.result != null ? result.result : null)
      });
      C.assertObservation(obs);
      state.observations.push(obs);

      if (result && result.evidence) {
        var ev = C.createEvidence(Object.assign({ actionId: actionId }, result.evidence));
        C.assertEvidence(ev);
        state.evidence.push(ev);
      }
      if (result && result.gaps) state.gaps = state.gaps.concat(result.gaps);

      transition('validate_result');
      emitEvent('action_result', { ok: !failed, actionId: actionId, status: record.status });
      return snapshot();
    }

    function recordProviderCall(partial) {
      if (state.status === 'cancelled') {
        emitEvent('provider_call_ignored', { reason: 'cancelled' });
        return null;
      }
      var call = C.createProviderCall(partial || {});
      C.assertProviderCall(call);
      state.providerCalls.push(call);
      emitEvent('provider_call', { callId: call.callId, providerId: call.providerId, ok: call.ok });
      return call;
    }

    /**
     * Project one ATR drive turn into ProviderCall + Observations from tool events.
     * Rust still owns tool execution; Controller owns the Run contract.
     */
    function boundAtrTaskId() {
      var i;
      for (i = 0; i < state.tasks.length; i++) {
        var t = state.tasks[i];
        if (!t) continue;
        if (t.kind === 'atr' && t.taskId && t.taskId !== 'atr') return String(t.taskId);
        if (t.outputs && t.outputs.atrTaskId) return String(t.outputs.atrTaskId);
        if (t.taskId === 'atr' && t.outputs && t.outputs.taskId) return String(t.outputs.taskId);
      }
      return null;
    }

    function bindAtrTask(dto) {
      if (!dto || !dto.taskId) return { ok: false, code: 'atr_unbound' };
      var id = String(dto.taskId);
      var map = C.mapAtrStatus || function (s) { return s; };
      // Drop legacy literal slot once real ATR id is known.
      state.tasks = state.tasks.filter(function (t) {
        return !(t && t.taskId === 'atr' && t.kind === 'atr');
      });
      var outputs = {
        atrTaskId: id,
        taskId: id,
        checkpointId: dto.checkpointId || (dto.checkpoint_id) || null,
        providerId: dto.providerId || dto.provider || null,
        status: dto.status || null,
        currentTurn: dto.currentTurn != null ? dto.currentTurn : null,
        waitingReason: dto.waitingReason || null
      };
      updateTask(id, {
        kind: 'atr',
        status: dto.status ? map(dto.status) : 'running',
        detail: dto.goal ? String(dto.goal).slice(0, 200) : undefined,
        outputs: outputs,
        error: dto.lastError ? { code: 'atr_error', message: String(dto.lastError) } : null
      });
      if (state.plan && typeof state.plan === 'object') {
        state.plan.atrTaskId = id;
        if (outputs.checkpointId) state.plan.checkpointId = outputs.checkpointId;
      }
      emitEvent('atr_bind', { taskId: id, checkpointId: outputs.checkpointId });
      return { ok: true, taskId: id, snapshot: snapshot() };
    }

    function ingestAtrTurn(dto, events, meta) {
      meta = meta || {};
      var actionId = meta.actionId || null;
      var map = C.mapAtrStatus || function (s) { return s; };
      var atrId = (dto && dto.taskId) ? String(dto.taskId) : boundAtrTaskId();
      if (dto && dto.taskId) bindAtrTask(dto);
      if (dto && dto.status) {
        var proj = C.projectAtrTask ? C.projectAtrTask(dto) : null;
        var mapped = proj ? proj.status : map(dto.status);
        // Keep verifying/repair as running so the outer Controller loop can step.
        if (mapped === 'verifying' || mapped === 'repair') {
          state.status = 'running';
          state.stopReason = mapped;
          state.resumeAvailable = false;
          state.updatedAt = nowIso();
          emitEvent('status', { status: state.status, reason: state.stopReason, atrStatus: mapped });
        } else {
          setStatus(
            mapped,
            dto.lastError ||
              (proj && proj.waitingReason) ||
              dto.waitingReason ||
              dto.waiting_reason ||
              null
          );
        }
      }
      if (dto) {
        recordProviderCall({
          actionId: actionId,
          purpose: meta.purpose || (String(dto.status || '') === 'repair' ? 'repair' : 'toolDecision'),
          providerId: dto.providerId || dto.provider || meta.providerId || '',
          model: dto.modelId || dto.model || meta.model || '',
          ok: !(dto.status === 'failed' || dto.lastError),
          fallbackFrom: dto.fallbackFrom || meta.fallbackFrom || null,
          durationMs: Number(dto.providerDurationMs || meta.durationMs || 0),
          error: dto.lastError ? { code: 'atr_error', message: String(dto.lastError) } : null,
          startedAt: meta.startedAt || null,
          finishedAt: nowIso()
        });
      }
      var list = Array.isArray(events) ? events : [];
      var seen = {};
      var obsCount = 0;
      list.forEach(function (ev) {
        if (!ev) return;
        var kind = String(ev.kind || ev.type || '');
        if (kind !== 'tool_result' && kind !== 'tool_call') return;
        var toolId = String((ev.payload && (ev.payload.tool || ev.payload.toolId)) || ev.toolName || ev.tool || '');
        var obsKey = String(ev.eventId || ev.id || ev.at || '') + ':' + toolId;
        if (seen[obsKey]) return;
        seen[obsKey] = 1;
        if (kind !== 'tool_result') return;
        var obs = C.createObservation({
          actionId: actionId || String(ev.actionId || ''),
          toolId: toolId || 'atr_tool',
          ok: !(ev.payload && ev.payload.ok === false),
          summary: String((ev.payload && (ev.payload.summary || ev.payload.error)) || toolId || 'tool_result'),
          data: ev.payload != null ? C.scrubValue(ev.payload) : null,
          at: ev.at || ev.createdAt || nowIso()
        });
        C.assertObservation(obs);
        state.observations.push(obs);
        obsCount += 1;
      });
      // Every atr_turn produces at least one Observation (turn-level if no tool_result).
      if (!obsCount) {
        var turnObs = C.createObservation({
          actionId: actionId || '',
          toolId: 'atr_turn',
          ok: !(dto && (dto.status === 'failed' || dto.lastError)),
          summary: String((dto && (dto.status || dto.waitingReason)) || 'atr_turn'),
          data: dto
            ? C.scrubValue({
                taskId: atrId,
                status: dto.status,
                waitingReason: dto.waitingReason || null,
                changedFiles: dto.changedFiles || null,
                currentTurn: dto.currentTurn,
                checkpointId: dto.checkpointId || null
              })
            : null,
          at: nowIso()
        });
        C.assertObservation(turnObs);
        state.observations.push(turnObs);
      }
      if (atrId) {
        updateTask(atrId, {
          status: dto && dto.status ? map(dto.status) : undefined,
          detail: dto && dto.goal ? String(dto.goal).slice(0, 200) : undefined,
          outputs: dto
            ? {
                atrTaskId: atrId,
                taskId: atrId,
                checkpointId: dto.checkpointId || null,
                providerId: dto.providerId || null,
                status: dto.status,
                currentTurn: dto.currentTurn,
                waitingReason: dto.waitingReason || null
              }
            : undefined,
          error: dto && dto.lastError ? { code: 'atr_error', message: String(dto.lastError) } : undefined
        });
      }
      emitEvent('atr_ingest', { taskId: atrId, status: dto && dto.status });
      return snapshot();
    }

    function setStatus(status, reason) {
      var next = String(status || '');
      if (C.mapAtrStatus) {
        next = C.mapAtrStatus(next);
      } else if (!C.RUN_STATUSES[next]) {
        next = String(status || '');
      }
      if (!C.RUN_STATUSES[next]) throw new Error('invalid_status:' + status);
      state.status = next;
      if (reason) {
        var nr =
          C.normalizeWaitingReason && next === 'waiting'
            ? C.normalizeWaitingReason(reason)
            : null;
        state.stopReason = nr || String(reason);
      }
      if (PAUSE[next] || next === 'waiting') {
        state.resumeAvailable =
          next === 'waiting' || next === 'interrupted';
      }
      if (TERMINAL[next] && next !== 'interrupted') {
        state.resumeAvailable = false;
      }
      state.updatedAt = nowIso();
      emitEvent('status', { status: state.status, reason: state.stopReason });
      return snapshot();
    }

    function updateTask(taskId, patch) {
      patch = patch || {};
      var task = null;
      for (var i = 0; i < state.tasks.length; i++) {
        if (state.tasks[i].taskId === taskId || state.tasks[i].id === taskId) {
          task = state.tasks[i];
          break;
        }
      }
      if (!task) {
        task = C.createTask(Object.assign({ taskId: taskId }, patch));
        C.assertTask(task);
        state.tasks.push(task);
      } else {
        if (patch.status != null) task.status = String(patch.status);
        if (patch.detail != null) task.detail = String(patch.detail);
        if (patch.error !== undefined) task.error = patch.error;
        if (patch.outputs !== undefined) task.outputs = patch.outputs;
        if (patch.bumpAttempt) task.attemptId = Number(task.attemptId || 1) + 1;
        if (patch.kind) task.kind = String(patch.kind);
        task = C.normalizeTask(task);
        C.assertTask(task);
        for (var j = 0; j < state.tasks.length; j++) {
          if (state.tasks[j].taskId === task.taskId) state.tasks[j] = task;
        }
      }
      state.updatedAt = nowIso();
      emitEvent('task_update', { taskId: task.taskId, status: task.status });
      return task;
    }

    function upsertTasks(list) {
      (list || []).forEach(function (t) {
        var n = C.createTask(t);
        C.assertTask(n);
        var found = false;
        for (var i = 0; i < state.tasks.length; i++) {
          if (state.tasks[i].taskId === n.taskId) {
            state.tasks[i] = n;
            found = true;
            break;
          }
        }
        if (!found) state.tasks.push(n);
      });
      emitEvent('tasks_set', { count: state.tasks.length });
    }

    function invokeHost(cmd, args) {
      if (typeof host.invoke === 'function') return Promise.resolve(host.invoke(cmd, args || {}));
      var ipc = global.OneToneIpc;
      if (!ipc || typeof ipc.invoke !== 'function') {
        return Promise.reject(Object.assign(new Error('no_ipc'), { code: 'no_ipc' }));
      }
      return ipc.invoke(cmd, { args: args || {} });
    }

    function runExecutor(tool, input, signal, actionRec) {
      if (!tool || !tool.executor) {
        return Promise.resolve({ ok: true, result: input || {} });
      }
      // ATR owns workspace + chat/work network tools. Research mode still drives
      // web_search/fetch_url via research IPC from the Controller.
      if (tool.executor === 'atr_internal') {
        if (
          state.mode === 'research' &&
          (tool.id === 'web_search' || tool.id === 'fetch_url')
        ) {
          tool = Object.assign({}, tool, {
            executor:
              tool.id === 'web_search'
                ? 'cmd_research_web_search'
                : 'cmd_research_fetch_url'
          });
        } else {
          return Promise.reject(Object.assign(
            new Error('atr_internal_not_executable'),
            { code: 'atr_internal_not_executable' }
          ));
        }
      }
      if (tool.executor === 'model_chat') {
        var gw = gateway();
        if (!gw || typeof gw.chat !== 'function') {
          return Promise.reject(Object.assign(new Error('model_gateway_unavailable'), { code: 'model_gateway_unavailable' }));
        }
        var started = nowIso();
        var startedMs = Date.now();
        return gw.chat({
          purpose: input.purpose || 'synthesis',
          providerId: input.providerId,
          model: input.model,
          messages: input.messages || [],
          maxTokens: input.maxTokens || 4096,
          responseFormat: input.responseFormat || 'text',
          signal: signal && signal.asSignal ? signal.asSignal() : signal
        }).then(function (res) {
          recordProviderCall({
            actionId: actionRec.actionId,
            purpose: input.purpose || 'synthesis',
            providerId: res.providerId || '',
            model: res.model || '',
            ok: true,
            fallbackFrom: res.fallbackFrom || null,
            durationMs: res.durationMs || (Date.now() - startedMs),
            status: 'ok',
            startedAt: started,
            finishedAt: nowIso()
          });
          return {
            ok: true,
            result: res,
            observation: { text: res.text, providerId: res.providerId, model: res.model },
            providerId: res.providerId,
            model: res.model
          };
        }).catch(function (err) {
          recordProviderCall({
            actionId: actionRec.actionId,
            purpose: input.purpose || 'synthesis',
            providerId: (err && err.providerId) || input.providerId || '',
            model: input.model || '',
            ok: false,
            durationMs: (err && err.durationMs) || (Date.now() - startedMs),
            error: err,
            errorCode: (err && err.code) || 'model_error',
            status: 'error',
            startedAt: started,
            finishedAt: nowIso()
          });
          throw err;
        });
      }

      var args = Object.assign({}, input || {});
      if (tool.id === 'web_search') {
        args.query = args.query;
        args.limit = args.limit || 6;
        args.provider = args.provider || 'auto';
      }
      if (tool.id === 'fetch_url') {
        args.url = args.url;
        args.provider = args.provider || 'direct';
        args.maxChars = args.maxChars || 12000;
      }

      return new Promise(function (resolve, reject) {
        var settled = false;
        function done(err, res) {
          if (settled) return;
          settled = true;
          if (err) reject(err);
          else resolve(res);
        }
        if (signal) {
          signal.onAbort(function () {
            done(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
          });
        }
        invokeHost(tool.executor, args).then(function (res) {
          if (signal && signal.aborted) {
            done(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
            return;
          }
          if (tool.id === 'web_search' && res && res.ok === false) {
            done(Object.assign(new Error(res.message || 'search_unavailable'), {
              code: res.code || 'search_unavailable',
              diagnostics: res.diagnostics || null
            }));
            return;
          }
          if (tool.id === 'fetch_url' && res && res.ok === false) {
            // Jina fallback inside executor path
            invokeHost(tool.executor, Object.assign({}, args, { provider: 'jina' }))
              .then(function (res2) {
                if (signal && signal.aborted) {
                  done(Object.assign(new Error('cancelled'), { code: 'cancelled' }));
                  return;
                }
                if (!res2 || res2.ok === false) {
                  done(Object.assign(new Error((res2 && res2.message) || res.message || 'fetch_failed'), {
                    code: (res2 && res2.code) || res.code || 'fetch_failed'
                  }));
                  return;
                }
                done(null, { ok: true, result: res2, observation: res2 });
              }, done);
            return;
          }
          if (tool.id === 'atr_turn' || tool.id === 'atr_tool_call') {
            ingestAtrTurn(res, metaEventsFromDto(res), {
              actionId: actionRec.actionId,
              providerId: (input && input.provider) || (res && res.providerId) || '',
              model: res && res.model,
              purpose: 'toolDecision'
            });
          }
          done(null, {
            ok: true,
            result: res,
            observation: res,
            evidence: tool.id === 'network_diagnostics' ? { kind: 'network', payload: res } : null,
            providerId: res && res.providerId,
            model: res && res.model
          });
        }, function (err) {
          done(err);
        });
      });
    }

    function metaEventsFromDto(dto) {
      if (!dto) return [];
      if (Array.isArray(dto.events)) return dto.events;
      if (Array.isArray(dto.recentEvents)) return dto.recentEvents;
      return [];
    }

    function executeAction(spec, execOpts) {
      execOpts = execOpts || {};
      if (state.status !== 'running') {
        return Promise.resolve({ ok: false, code: 'controller_stopped', status: state.status });
      }
      var started = actionStarted(spec || {});
      if (!started.ok) return Promise.resolve(started);

      var actionRec = started.action;
      var tool = started.tool || (registry() && registry().get(actionRec.toolId));
      var signal = createAbortBundle(execOpts.signal);
      activeAbort = signal;
      var generation = actionRec.generation;
      var timer = 0;
      var timeoutMs = execOpts.timeoutMs != null
        ? execOpts.timeoutMs
        : (tool && tool.timeoutMs != null ? tool.timeoutMs : host.timeoutMs);
      if (timeoutMs > 0) {
        timer = setTimeout(function () {
          signal.abort('timeout');
        }, timeoutMs);
      }

      return runExecutor(tool, actionRec.input, signal, actionRec)
        .then(function (out) {
          if (timer) clearTimeout(timer);
          if (signal.aborted) {
            actionResult({
              actionId: actionRec.actionId,
              generation: generation,
              ok: false,
              error: { code: 'cancelled', message: 'cancelled' }
            });
            return { ok: false, code: 'cancelled', actionId: actionRec.actionId, snapshot: snapshot() };
          }
          actionResult({
            actionId: actionRec.actionId,
            generation: generation,
            ok: true,
            result: out && out.result,
            observation: out && out.observation,
            evidence: out && out.evidence,
            providerId: out && out.providerId,
            model: out && out.model
          });
          transition('update_state');
          return { ok: true, actionId: actionRec.actionId, result: out && out.result, snapshot: snapshot() };
        })
        .catch(function (err) {
          if (timer) clearTimeout(timer);
          var code = (err && err.code) || 'tool_error';
          actionResult({
            actionId: actionRec.actionId,
            generation: generation,
            ok: false,
            error: { code: code, message: String((err && err.message) || err || 'error') }
          });
          transition('update_state');
          return {
            ok: false,
            code: code,
            actionId: actionRec.actionId,
            error: err,
            snapshot: snapshot()
          };
        })
        .finally(function () {
          if (activeAbort === signal) activeAbort = null;
        });
    }

    function retryAction(actionId) {
      if (state.status !== 'running') return { ok: false, code: 'controller_stopped' };
      var record = findAction(actionId);
      if (!record || (record.status !== 'failed' && record.status !== 'cancelled')) {
        return { ok: false, code: 'action_not_retryable' };
      }
      var tool = registry() && registry().get(record.toolId);
      if (tool && tool.retryable === false) return { ok: false, code: 'tool_not_retryable' };
      var kind = budgetKindForTool(tool || { id: record.toolId });
      if (state.budget[kind] != null && state.budget[kind] <= 0) {
        return { ok: false, code: 'budget_exhausted' };
      }
      return executeAction({
        actionId: record.actionId + '-r' + ((record.attempt || 1) + 1),
        toolId: record.toolId,
        input: record.input,
        taskId: record.taskId,
        attempt: (record.attempt || 1) + 1,
        generation: (record.generation || 1) + 1
      });
    }

    function clearRunningWork(code) {
      state.actions.forEach(function (a) {
        if (a.status === 'running') {
          a.status = 'cancelled';
          a.error = { code: code || 'cancelled', message: 'run_finished' };
          a.finishedAt = nowIso();
        }
      });
      state.tasks.forEach(function (t) {
        if (t.status === 'running') {
          t.status = 'cancelled';
          t.error = { code: code || 'cancelled', message: 'run_finished' };
        }
      });
    }

    function finish(status, reason) {
      var mapped = C.mapAtrStatus ? C.mapAtrStatus(status) : String(status || '');
      if (PAUSE[mapped] || mapped === 'waiting') {
        return setStatus(mapped, reason);
      }
      state.status = TERMINAL[mapped] ? mapped : (C.RUN_STATUSES[mapped] ? mapped : 'failed');
      state.stopReason = reason || null;
      state.resumeAvailable = state.status === 'interrupted';
      if (TERMINAL[state.status] && state.status !== 'interrupted') {
        clearRunningWork('run_finished');
      }
      // Completion gate: no running leftovers
      if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') {
        clearRunningWork(state.status);
      }
      transition(state.status === 'completed' ? 'finished' : 'update_state');
      emitEvent('finish', { status: state.status, reason: state.stopReason });
      return snapshot();
    }

    /** Move pause → running so atr_turn / tools may proceed (approve, resume). */
    function continueFromPause(reason) {
      if (!PAUSE[state.status] && state.status !== 'interrupted') {
        if (state.status === 'running') return { ok: true, snapshot: snapshot() };
        return { ok: false, code: 'not_pausable' };
      }
      if (state.mode === 'work' && state.stopReason === 'awaiting_plan' && !planConfirmed) {
        return { ok: false, code: 'plan_not_confirmed' };
      }
      state.status = 'running';
      state.resumeAvailable = false;
      state.stopReason = null;
      state.updatedAt = nowIso();
      emitEvent('continue', { reason: reason || 'continue' });
      return { ok: true, snapshot: snapshot() };
    }

    function confirmPlan(plan) {
      plan = plan || {};
      state.plan = Object.assign({}, state.plan || {}, plan, {
        confirmed: true,
        status: 'confirmed',
        confirmedAt: nowIso()
      });
      if (plan.goal) state.goal = String(plan.goal);
      planConfirmed = true;
      state.phase = 'choose_action';
      state.status = 'running';
      state.stopReason = null;
      state.resumeAvailable = false;
      state.updatedAt = nowIso();
      emitEvent('plan_confirmed', { plan: state.plan });
      // Persist to ATR when a task is already bound (start usually sends planConfirmed).
      var tid = boundAtrTaskId();
      var A = global.OneToneHomeAgentTask;
      if (tid && A && typeof A.confirmPlan === 'function') {
        try {
          A.confirmPlan({
            taskId: tid,
            plan: state.plan,
            goal: state.goal || plan.goal || ''
          }).catch(function () {});
        } catch (_) {}
      }
      return { ok: true, snapshot: snapshot() };
    }

    function isPlanConfirmed() {
      return !!planConfirmed;
    }

    /** One ATR IPC turn (maxSteps must be 1). */
    function stepAtr(opts) {
      opts = opts || {};
      if (state.mode === 'work' && !planConfirmed) {
        return Promise.resolve({ ok: false, code: 'plan_not_confirmed', snapshot: snapshot() });
      }
      if (PAUSE[state.status] || state.status === 'interrupted') {
        return Promise.resolve({
          ok: false,
          code: 'paused',
          status: state.status,
          snapshot: snapshot()
        });
      }
      if (state.status !== 'running') {
        return Promise.resolve({
          ok: false,
          code: 'controller_stopped',
          status: state.status,
          snapshot: snapshot()
        });
      }
      var taskId = String(opts.taskId || boundAtrTaskId() || '').trim();
      if (!taskId) {
        return Promise.resolve({ ok: false, code: 'atr_unbound', snapshot: snapshot() });
      }
      return executeAction({
        toolId: 'atr_turn',
        input: {
          taskId: taskId,
          provider: opts.provider || undefined,
          maxSteps: 1
        },
        taskId: taskId
      });
    }

    /**
     * Controller-owned outer loop: atr_turn until ATR idle / pause / terminal.
     * Rust still executes exactly one tool turn per IPC.
     */
    function driveAtrUntilIdle(opts) {
      opts = opts || {};
      var guard = 0;
      function step() {
        if (guard++ > 40) {
          return Promise.reject(Object.assign(new Error('max_drive_steps'), { code: 'drive_failed' }));
        }
        if (TERMINAL[state.status] && state.status !== 'interrupted') {
          return Promise.resolve({
            ok: true,
            status: state.status,
            result: null,
            snapshot: snapshot()
          });
        }
        if (PAUSE[state.status] || state.status === 'interrupted') {
          return Promise.resolve({
            ok: true,
            status: state.status,
            paused: true,
            snapshot: snapshot()
          });
        }
        // ATR busy phases (verifying/repair/review) are still "keep driving".
        // Coerce before atr_turn — poll used to leave Controller on verifying and
        // stepAtr then returned controller_stopped (UI stuck at 第0步).
        if (
          state.status === 'verifying' ||
          state.status === 'repair' ||
          state.status === 'review'
        ) {
          try {
            setStatus('running');
          } catch (_) {}
        }
        return stepAtr(opts).then(function (res) {
          if (!res || !res.ok) {
            if (res && (res.code === 'paused' || res.code === 'controller_stopped' || res.code === 'plan_not_confirmed')) {
              return res;
            }
            var err = Object.assign(
              new Error((res && res.code) || 'drive_failed'),
              { code: (res && res.code) || 'drive_failed', result: res }
            );
            return Promise.reject(err);
          }
          var dto = res.result || {};
          var raw = String(dto.status || '');
          var mapped = (C.mapAtrStatus ? C.mapAtrStatus(raw) : raw) || state.status;
          if (ATR_IDLE[mapped] || ATR_IDLE[raw] || TERMINAL[mapped] || PAUSE[mapped]) {
            return {
              ok: true,
              status: mapped,
              result: dto,
              snapshot: snapshot()
            };
          }
          // running / verifying / repair / review → next atr_turn
          return new Promise(function (resolve, reject) {
            global.setTimeout(function () {
              step().then(resolve, reject);
            }, 0);
          });
        });
      }
      return step();
    }

    function cancel(reason) {
      if (activeAbort) activeAbort.abort(reason || 'cancelled');
      var gw = gateway();
      if (gw && typeof gw.cancel === 'function') {
        try { gw.cancel(); } catch (_) {}
      }
      state.status = 'cancelled';
      state.stopReason = reason || 'cancelled';
      state.resumeAvailable = false;
      state.actions.forEach(function (a) {
        if (a.status === 'running') {
          a.status = 'cancelled';
          a.error = { code: 'cancelled', message: 'cancelled' };
          a.finishedAt = nowIso();
        }
      });
      transition('update_state');
      emitEvent('finish', { status: 'cancelled', reason: state.stopReason });
      return snapshot();
    }

    function restore(saved) {
      if (!saved || !saved.runId) throw new Error('invalid_controller_snapshot');
      var next = C.coerceInterrupted ? C.coerceInterrupted(saved) : C.normalizeRun(saved);
      if (C.migrateAtrTaskSlot) next = C.migrateAtrTaskSlot(next) || next;
      C.assertRun(next);
      state = next;
      // Restored work runs are past the plan gate.
      if (state.mode === 'work') {
        planConfirmed = true;
        if (state.plan && typeof state.plan === 'object') state.plan.confirmed = true;
      }
      emitEvent('restore', { runId: state.runId, status: state.status });
      return snapshot();
    }

    /** Continue an interrupted/paused run: mark running and leave failed interrupted actions for retry. */
    function resume() {
      if (state.mode === 'work' && !boundAtrTaskId()) {
        return { ok: false, code: 'atr_unbound' };
      }
      if (state.status === 'running') return { ok: true, snapshot: snapshot() };
      if (PAUSE[state.status] || state.status === 'interrupted' || state.resumeAvailable) {
        return continueFromPause('resume');
      }
      return { ok: false, code: 'not_resumable' };
    }

    function discard(reason) {
      return finish('cancelled', reason || 'discarded');
    }

    function onEvent(fn) {
      if (typeof fn === 'function') listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (x) { return x !== fn; });
      };
    }

    // Optional sync hydrate from local archive (async restore preferred via restore()).
    if (opts.restore) {
      restore(opts.restore);
    } else if (!opts.skipArchiveLoad && archive() && archive().load) {
      var archived = archive().load(state.runId);
      if (archived && archived.runId === state.runId) restore(archived);
    }

    return {
      snapshot: snapshot,
      transition: transition,
      choose: choose,
      validateAction: validateAction,
      actionStarted: actionStarted,
      actionResult: actionResult,
      executeAction: executeAction,
      recordProviderCall: recordProviderCall,
      ingestAtrTurn: ingestAtrTurn,
      bindAtrTask: bindAtrTask,
      boundAtrTaskId: boundAtrTaskId,
      confirmPlan: confirmPlan,
      isPlanConfirmed: isPlanConfirmed,
      stepAtr: stepAtr,
      driveAtrUntilIdle: driveAtrUntilIdle,
      setStatus: setStatus,
      updateTask: updateTask,
      upsertTasks: upsertTasks,
      finish: finish,
      cancel: cancel,
      restore: restore,
      resume: resume,
      continueFromPause: continueFromPause,
      discard: discard,
      retryAction: retryAction,
      onEvent: onEvent,
      setInvoke: function (fn) { host.invoke = fn; },
      proposeAction: choose,
      completeAction: actionResult,
      failAction: actionResult
    };
  }

  function createAsync(opts) {
    opts = opts || {};
    var runId = opts.runId;
    var arch = archive();
    var loadP = arch && arch.restore
      ? arch.restore(runId)
      : Promise.resolve(null);
    return Promise.resolve(loadP).then(function (saved) {
      var controller = create(Object.assign({}, opts, {
        restore: saved || opts.restore || null,
        skipArchiveLoad: true
      }));
      return controller;
    });
  }

  global.OneToneWorkController = {
    PHASES: PHASES,
    PAUSE: PAUSE,
    create: create,
    createAsync: createAsync
  };
})(typeof window !== 'undefined' ? window : globalThis);
