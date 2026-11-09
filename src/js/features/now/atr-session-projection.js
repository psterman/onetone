/**
 * ATR session projection — DTO → UI busy/pause. Never invents task phase.
 */
(function (global) {
  'use strict';

  function contracts() {
    return global.OneToneRunContracts;
  }

  function chatAtrBusyPhase(st) {
    st = String(st || '');
    return (
      st === 'running' ||
      st === 'verifying' ||
      st === 'repair' ||
      st === 'review' ||
      st === 'intake'
    );
  }

  function projectChatAtr(task) {
    var C = contracts();
    if (C && typeof C.projectAtrTask === 'function') {
      return C.projectAtrTask(task || {});
    }
    var st = String((task && task.status) || '');
    return {
      status: st === 'done' ? 'completed' : st,
      waitingReason:
        (task && (task.waitingReason || task.waiting_reason)) || null,
      busy: chatAtrBusyPhase(st),
      pauseKind: st === 'waiting' ? 'user_input' : null,
      atrStatus: st
    };
  }

  /**
   * @param {object|null} task
   * @param {{ driveAlive?: boolean, optimisticSend?: boolean, stopPendingId?: string, boundTaskId?: string, driveAliveFn?: function }} opts
   * @returns {{ busy: boolean, proj: object }}
   */
  function projectChatBusy(task, opts) {
    opts = opts || {};
    var proj = projectChatAtr(task);
    var tid = String((task && task.taskId) || opts.boundTaskId || '');
    if (opts.stopPendingId && tid && tid === String(opts.stopPendingId)) {
      return { busy: false, proj: proj };
    }
    if (opts.optimisticSend) {
      return { busy: true, proj: proj };
    }
    var alive =
      opts.driveAlive === true ||
      (typeof opts.driveAliveFn === 'function' && opts.driveAliveFn(tid));
    var busy = !!(proj.busy && alive);
    return { busy: busy, proj: proj };
  }

  global.OneToneAtrSessionProjection = {
    chatAtrBusyPhase: chatAtrBusyPhase,
    projectChatAtr: projectChatAtr,
    projectChatBusy: projectChatBusy
  };
})(typeof window !== 'undefined' ? window : globalThis);
