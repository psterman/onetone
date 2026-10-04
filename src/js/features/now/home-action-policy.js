/**
 * Home Focus action policy — single primary action with real IPC handlers.
 */
(function (global) {
  'use strict';

  function store() {
    return global.OneToneHomeFocusStore;
  }

  /**
   * @param {string} kind
   * @param {object} vm view model from adapter
   * @param {{ openVoice?: Function, openProgress?: Function, openPick?: Function, openReason?: Function }} hooks
   */
  function execute(kind, vm, hooks) {
    hooks = hooks || {};
    vm = vm || {};
    var S = store();
    if (!kind) return Promise.resolve({ ok: false, error: 'no action' });

    if (kind === 'retry') {
      if (!S) return Promise.resolve({ ok: false, error: 'no store' });
      return S.retry();
    }
    if (kind === 'confirm_project') {
      if (!S) return Promise.resolve({ ok: false, error: 'no store' });
      return S.confirmProject({
        projectRoot: vm.projectRoot || null,
        projectId: vm.projectId || null
      });
    }
    if (kind === 'pick_project') {
      if (typeof hooks.openPick === 'function') hooks.openPick(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'view_progress') {
      if (typeof hooks.openProgress === 'function') hooks.openProgress(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'view_reason') {
      if (typeof hooks.openReason === 'function') hooks.openReason(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    if (kind === 'resume') {
      if (!S) return Promise.resolve({ ok: false, error: 'no store' });
      var sid =
        (vm.dto &&
          vm.dto.work &&
          null) ||
        null;
      // Resume uses agent checkpoint via session from agent home cache if present.
      var ipc = global.OneToneIpc;
      var sessionId =
        (vm.dto && vm.dto._sessionId) ||
        (global.OneToneNowHome &&
          global.OneToneNowHome.lastAgentSessionId &&
          global.OneToneNowHome.lastAgentSessionId());
      if (!sessionId && ipc && ipc.invoke) {
        // Fallback: ask agent home snapshot for active session, then resume.
        return ipc
          .invoke('cmd_agent_home_snapshot', {})
          .then(function (snap) {
            var id =
              (snap && snap.activeSession && snap.activeSession.sessionId) ||
              (snap &&
                snap.checkpoint &&
                snap.checkpoint.sessionId) ||
              '';
            if (!id) return { ok: false, error: 'no session' };
            return S.resumeCheckpoint(id);
          });
      }
      if (!sessionId) return Promise.resolve({ ok: false, error: 'no session' });
      return S.resumeCheckpoint(sessionId);
    }
    if (kind === 'start_task') {
      if (typeof hooks.openVoice === 'function') hooks.openVoice(vm);
      return Promise.resolve({ ok: true, kind: kind });
    }
    // v1 canvas aliases
    if (kind === 'decide') return execute('view_progress', vm, hooks);
    if (kind === 'continue') return execute('resume', vm, hooks);
    if (kind === 'restore') {
      var restoreKind =
        (vm.primary && vm.primary.id) ||
        (vm.projectRoot ? 'confirm_project' : 'pick_project');
      return execute(restoreKind, vm, hooks);
    }
    return Promise.resolve({ ok: false, error: 'unknown kind' });
  }

  /** Prefer backend nextAction; never invent a second primary. */
  function primaryFromVm(vm) {
    if (!vm || !vm.primary) return null;
    return vm.primary;
  }

  global.OneToneHomeActionPolicy = {
    execute: execute,
    primaryFromVm: primaryFromVm
  };
})(typeof window !== 'undefined' ? window : globalThis);
