/**
 * ATR session intents — approve / reject / user input / deliver.
 * Projection-only UI calls these; never rewrite ATR status locally.
 */
(function (global) {
  'use strict';

  function store() {
    return global.OneToneHomeAgentV2Store;
  }

  function atrApi() {
    return global.OneToneHomeAgentTask;
  }

  function approvePatch(taskId, token, opts) {
    var S = store();
    if (S && typeof S.approveAgentPatch === 'function') {
      return S.approveAgentPatch(opts || {});
    }
    var A = atrApi();
    return A.approvePatch(taskId, token, opts);
  }

  function rejectPatch(taskId, token) {
    var S = store();
    if (S && typeof S.rejectAgentPatch === 'function') {
      return S.rejectAgentPatch();
    }
    var A = atrApi();
    return A.rejectPatch(taskId, token);
  }

  function submitUserInput(taskId, text) {
    var S = store();
    if (S && typeof S.submitAgentUserInput === 'function') {
      return S.submitAgentUserInput(text);
    }
    var A = atrApi();
    return A.submitUserInput(taskId, text);
  }

  function approveDeliver(taskId, token) {
    var A = atrApi();
    return A.approveDeliver(taskId, token);
  }

  function rejectDeliver(taskId, token) {
    var A = atrApi();
    return A.rejectDeliver(taskId, token);
  }

  function confirmPlan(opts) {
    var A = atrApi();
    if (!A || typeof A.confirmPlan !== 'function') {
      return Promise.reject(new Error('atr_unavailable'));
    }
    return A.confirmPlan(opts || {});
  }

  global.OneToneAtrSessionActions = {
    approvePatch: approvePatch,
    rejectPatch: rejectPatch,
    submitUserInput: submitUserInput,
    approveDeliver: approveDeliver,
    rejectDeliver: rejectDeliver,
    confirmPlan: confirmPlan
  };
})(typeof window !== 'undefined' ? window : globalThis);
