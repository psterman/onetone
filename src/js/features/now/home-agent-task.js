/**
 * OneToneHomeAgentTask — thin IPC client for Agent Task Runtime.
 * Home entry/status only; does not invent running state from local chat.
 */
(function (global) {
  'use strict';

  var FLAG_KEY = 'onetone.agentTaskRuntime';
  var ACTIVE_KEY = 'onetone.agentTask.activeId';
  var PROVIDER_KEY = 'onetone.atr.provider';
  var PERM_KEY = 'onetone.atr.permissionMode';

  /** Default ON — opt out with localStorage '0'. */
  function featureEnabled() {
    try {
      var v = global.localStorage && global.localStorage.getItem(FLAG_KEY);
      if (v === '0' || v === 'false') return false;
      return true;
    } catch (_) {
      return true;
    }
  }

  function invoke(cmd, payload) {
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    return ipc.invoke(cmd, { args: payload || {} });
  }

  function readActiveId() {
    try {
      return (global.localStorage && global.localStorage.getItem(ACTIVE_KEY)) || null;
    } catch (_) {
      return null;
    }
  }

  function writeActiveId(id) {
    try {
      if (!global.localStorage) return;
      if (id) global.localStorage.setItem(ACTIVE_KEY, String(id));
      else global.localStorage.removeItem(ACTIVE_KEY);
    } catch (_) {}
  }

  function readProvider() {
    try {
      var v = (global.localStorage && global.localStorage.getItem(PROVIDER_KEY)) || '';
      return String(v || '').trim().toLowerCase() || null;
    } catch (_) {
      return null;
    }
  }

  function writeProvider(id) {
    try {
      if (!global.localStorage) return;
      var s = String(id || '').trim().toLowerCase();
      if (s) global.localStorage.setItem(PROVIDER_KEY, s);
      else global.localStorage.removeItem(PROVIDER_KEY);
    } catch (_) {}
  }

  function readPermissionMode() {
    try {
      var v = (global.localStorage && global.localStorage.getItem(PERM_KEY)) || '';
      v = String(v || '').trim();
      if (v === 'write_autonomous') return v;
    } catch (_) {}
    return 'write_with_approval';
  }

  function writePermissionMode(mode) {
    try {
      if (!global.localStorage) return;
      var s = String(mode || '').trim();
      if (s === 'write_autonomous') global.localStorage.setItem(PERM_KEY, s);
      else global.localStorage.setItem(PERM_KEY, 'write_with_approval');
    } catch (_) {}
  }

  function start(opts) {
    opts = opts || {};
    return invoke('cmd_agent_task_start', {
      goal: String(opts.goal || ''),
      workspaceRoot: String(opts.workspaceRoot || ''),
      permissionMode: opts.permissionMode || readPermissionMode(),
      materialsSummary: opts.materialsSummary || '',
      useFakeDriver: !!opts.useFakeDriver
    }).then(function (dto) {
      if (dto && dto.taskId) writeActiveId(dto.taskId);
      return dto;
    });
  }

  function status(taskId) {
    return invoke('cmd_agent_task_status', { taskId: String(taskId || '') });
  }

  function events(taskId) {
    return invoke('cmd_agent_task_events', { taskId: String(taskId || '') });
  }

  function cancel(taskId) {
    return invoke('cmd_agent_task_cancel', { taskId: String(taskId || '') });
  }

  function approvePatch(taskId, approvalToken, opts) {
    opts = opts || {};
    return invoke('cmd_agent_task_approve_patch', {
      taskId: String(taskId || ''),
      approvalToken: String(approvalToken || ''),
      persistAutonomous: !!opts.persistAutonomous
    });
  }

  function rejectPatch(taskId, approvalToken) {
    return invoke('cmd_agent_task_reject_patch', {
      taskId: String(taskId || ''),
      approvalToken: String(approvalToken || '')
    });
  }

  function submitUserInput(taskId, text) {
    return invoke('cmd_agent_task_submit_user_input', {
      taskId: String(taskId || ''),
      text: String(text || '')
    });
  }

  function resume(taskId) {
    return invoke('cmd_agent_task_resume', { taskId: String(taskId || '') });
  }

  function abandon(taskId) {
    return invoke('cmd_agent_task_abandon', { taskId: String(taskId || '') }).then(function (dto) {
      writeActiveId(null);
      return dto;
    });
  }

  function ready() {
    return invoke('cmd_agent_task_ready', {});
  }

  var IDLE = { waiting: 1, done: 1, failed: 1, cancelled: 1, interrupted: 1 };

  /** One IPC = one tool turn, loop until idle — keeps the home UI from freezing. */
  function drive(taskId, provider) {
    var p = provider != null ? String(provider || '').trim() : readProvider() || '';
    var id = String(taskId || '');
    var guard = 0;
    function step() {
      if (guard++ > 40) {
        return Promise.reject(codedError('drive_failed', 'max_drive_steps'));
      }
      return invoke('cmd_agent_task_drive', {
        taskId: id,
        provider: p || undefined,
        maxSteps: 1
      }).then(function (dto) {
        var st = dto && dto.status;
        if (st && IDLE[st]) return dto;
        return new Promise(function (resolve, reject) {
          global.setTimeout(function () {
            step().then(resolve, reject);
          }, 0);
        });
      });
    }
    return step();
  }

  function driveDeepseek(taskId) {
    return drive(taskId, 'deepseek');
  }

  function driveFake(taskId, steps) {
    return invoke('cmd_agent_task_drive_fake', {
      taskId: String(taskId || ''),
      steps: Array.isArray(steps) ? steps : []
    });
  }

  function codedError(code, message) {
    var err = new Error(message || code);
    err.code = code;
    return err;
  }

  function isEditCapableRow(row) {
    if (!row || !row.ready) return false;
    // Respect backend editCapable (WorkBuddy OAuth freemodel or Soft Pad key).
    if (row.editCapable === false) return false;
    return true;
  }

  function resolveProvider(info, preferred) {
    var want = String(preferred || readProvider() || '')
      .trim()
      .toLowerCase();
    var list = (info && Array.isArray(info.providers) && info.providers) || [];
    function findReady(id) {
      for (var i = 0; i < list.length; i++) {
        var row = list[i] || {};
        if (String(row.id || '').toLowerCase() === id && isEditCapableRow(row)) {
          return String(row.id);
        }
      }
      return null;
    }
    if (want) {
      var hit = findReady(want);
      if (hit) return hit;
      // Preferred set but not ready — still return it so backend emits *_unconfigured.
      return want;
    }
    if (info && info.selectedDefault) return String(info.selectedDefault);
    for (var j = 0; j < list.length; j++) {
      if (isEditCapableRow(list[j])) return String(list[j].id);
    }
    return null;
  }

  function anyProviderReady(info) {
    var list = (info && Array.isArray(info.providers) && info.providers) || [];
    for (var i = 0; i < list.length; i++) {
      if (isEditCapableRow(list[i])) return true;
    }
    return !!(info && (info.workbuddyReady || info.deepseekReady));
  }

  function probeWorkbuddy(force) {
    return invoke('cmd_agent_task_probe_workbuddy', { force: !!force });
  }

  /**
   * start → drive(provider). Distinct codes — never crush "no model" into not_ready.
   * @param {{ goal: string, workspaceRoot: string, materialsSummary?: string, permissionMode?: string, useFakeDriver?: boolean, driveFakeSteps?: string[], provider?: string }} opts
   */
  function runGoal(opts) {
    opts = opts || {};
    if (!featureEnabled()) {
      return Promise.reject(codedError('not_ready', 'agent_task_runtime_off'));
    }
    var resolvedProvider = null;
    return ready()
      .catch(function (e) {
        return Promise.reject(
          codedError('not_ready', String((e && e.message) || e || 'ready_failed'))
        );
      })
      .then(function (info) {
        if (!info || info.implemented === false) {
          return Promise.reject(codedError('not_ready', 'atr_not_implemented'));
        }
        var useFake = !!opts.useFakeDriver || (Array.isArray(opts.driveFakeSteps) && opts.driveFakeSteps.length);
        if (!useFake) {
          resolvedProvider = resolveProvider(info, opts.provider);
          if (!resolvedProvider || !anyProviderReady(info)) {
            return Promise.reject(
              codedError('provider_unconfigured', 'provider_unconfigured')
            );
          }
          // If user picked a specific unready provider, fail with that id.
          var list = info.providers || [];
          var row = null;
          for (var i = 0; i < list.length; i++) {
            if (String((list[i] && list[i].id) || '').toLowerCase() === resolvedProvider) {
              row = list[i];
              break;
            }
          }
          if (row && !row.ready) {
            return Promise.reject(
              codedError(
                resolvedProvider + '_unconfigured',
                resolvedProvider + '_unconfigured'
              )
            );
          }
          writeProvider(resolvedProvider);
        }
        return start(opts).catch(function (e) {
          return Promise.reject(
            codedError('start_failed', String((e && e.message) || e || 'start_failed'))
          );
        });
      })
      .then(function (dto) {
        if (!dto || !dto.taskId) {
          return Promise.reject(codedError('start_failed', 'no_task_id'));
        }
        // Let UI bind taskId + poll before the long drive blocks.
        if (typeof opts.onStarted === 'function') {
          try {
            opts.onStarted(dto, resolvedProvider || readProvider());
          } catch (_) {}
        }
        var driveP =
          Array.isArray(opts.driveFakeSteps) && opts.driveFakeSteps.length
            ? driveFake(dto.taskId, opts.driveFakeSteps)
            : drive(dto.taskId, resolvedProvider || readProvider());
        return driveP
          .catch(function (e) {
            return Promise.reject(
              codedError('drive_failed', String((e && e.message) || e || 'drive_failed'))
            );
          })
          .then(function (driven) {
            var out = driven || dto;
            if (out && out.status === 'failed') {
              return Promise.reject(
                codedError('drive_failed', (out.lastError && String(out.lastError)) || 'drive_failed')
              );
            }
            return out;
          });
      });
  }

  function capabilityInput(extra) {
    extra = extra || {};
    return Object.assign(
      {
        agentTaskRuntime: featureEnabled(),
        agentTaskGrant: !!extra.agentTaskGrant
      },
      extra
    );
  }

  /**
   * edit mode selectable when ATR flag on and write + approval pipelines exist.
   * Shared by capabilities.modeEffective and home UI mode buttons.
   */
  function editModeSelectable(caps) {
    if (!featureEnabled()) return false;
    caps = caps || {};
    var w = caps.write_project;
    var a = caps.approval_execute;
    return !!(w && w.implemented && a && a.implemented);
  }

  global.OneToneHomeAgentTask = {
    FLAG_KEY: FLAG_KEY,
    ACTIVE_KEY: ACTIVE_KEY,
    PROVIDER_KEY: PROVIDER_KEY,
    PERM_KEY: PERM_KEY,
    featureEnabled: featureEnabled,
    capabilityInput: capabilityInput,
    editModeSelectable: editModeSelectable,
    readActiveId: readActiveId,
    writeActiveId: writeActiveId,
    readProvider: readProvider,
    writeProvider: writeProvider,
    readPermissionMode: readPermissionMode,
    writePermissionMode: writePermissionMode,
    start: start,
    status: status,
    events: events,
    cancel: cancel,
    approvePatch: approvePatch,
    rejectPatch: rejectPatch,
    submitUserInput: submitUserInput,
    resume: resume,
    abandon: abandon,
    ready: ready,
    probeWorkbuddy: probeWorkbuddy,
    drive: drive,
    driveDeepseek: driveDeepseek,
    driveFake: driveFake,
    runGoal: runGoal
  };
})(typeof window !== 'undefined' ? window : globalThis);
