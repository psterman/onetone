/**
 * Pure home context-actions model (max 3). No waitingChoice.
 */
(function (global) {
  'use strict';

  var SUGGEST = {
    none: ['input.start', 'agent.focus', 'session.new'],
    waitingText: ['agent.focus', 'input.start', 'agent.reject'],
    waitingApproval: ['agent.approve', 'agent.reject', 'agent.focus'],
    agentRunning: ['agent.interrupt', 'agent.status', 'agent.focus'],
    dictating: ['input.send', 'input.commit', 'input.cancel']
  };

  /**
   * @param {{ needsInputKind:string, catalogEntries:array, options:array, pending:object|null }} input
   */
  function buildHomeContextActions(input) {
    input = input || {};
    var kind = String(input.needsInputKind || 'none');
    if (kind === 'waitingChoice') kind = 'waitingText';
    var pending = input.pending || null;
    if (pending && pending.confirmationId) {
      return {
        state: 'pending',
        title: 'pending',
        actions: [],
        pendingCard: {
          confirmationId: pending.confirmationId,
          actionId: pending.actionId,
          sourceChannel: pending.sourceChannel,
          expiresInMs: pending.expiresInMs || 0
        }
      };
    }
    var want = SUGGEST[kind] || SUGGEST.none;
    var entries = input.catalogEntries || [];
    var options = input.options || [];
    var optMap = {};
    options.forEach(function (o) {
      optMap[o.actionId] = o;
    });
    var metaMap = {};
    entries.forEach(function (e) {
      metaMap[e.id] = e;
    });
    var actions = [];
    for (var i = 0; i < want.length && actions.length < 3; i++) {
      var id = want[i];
      var meta = metaMap[id];
      if (!meta || !meta.implemented) continue;
      var opt = optMap[id];
      if (opt && !opt.bindable) continue;
      if (opt && opt.executableNow === false) continue;
      actions.push({
        actionId: id,
        labelZh: meta.labelZh,
        labelEn: meta.labelEn,
        risk: meta.risk
      });
    }
    return {
      state: kind,
      title: kind,
      actions: actions,
      pendingCard: null
    };
  }

  global.OneToneHomeContextActionsModel = {
    buildHomeContextActions: buildHomeContextActions,
    SUGGEST: SUGGEST
  };
})(typeof window !== 'undefined' ? window : globalThis);
