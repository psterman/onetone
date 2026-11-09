/**
 * ATR session controller — sole FE caller for resume / drive / cancel intents.
 * UI modules dispatch here; this layer talks to the store (which owns WorkController pump).
 */
(function (global) {
  'use strict';

  function store() {
    return global.OneToneHomeAgentV2Store;
  }

  function atrApi() {
    return global.OneToneHomeAgentTask;
  }

  function resumeAndDrive() {
    var S = store();
    if (!S || typeof S.resumeAndDriveAgentTask !== 'function') {
      return Promise.reject(new Error('store_unavailable'));
    }
    return S.resumeAndDriveAgentTask();
  }

  function driveActive(opts) {
    var S = store();
    if (!S || typeof S.driveActiveIfRunning !== 'function') {
      return Promise.reject(new Error('store_unavailable'));
    }
    return S.driveActiveIfRunning(opts || {});
  }

  function cancel(taskId) {
    var A = atrApi();
    if (!A || typeof A.cancel !== 'function') {
      return Promise.reject(new Error('atr_unavailable'));
    }
    return A.cancel(taskId);
  }

  function abandon(taskId) {
    var S = store();
    if (S && typeof S.abandonAgentTask === 'function') {
      return S.abandonAgentTask(taskId);
    }
    var A = atrApi();
    if (!A || typeof A.abandon !== 'function') {
      return Promise.reject(new Error('atr_unavailable'));
    }
    return A.abandon(taskId);
  }

  global.OneToneAtrSessionController = {
    resumeAndDrive: resumeAndDrive,
    driveActive: driveActive,
    cancel: cancel,
    abandon: abandon
  };
})(typeof window !== 'undefined' ? window : globalThis);
