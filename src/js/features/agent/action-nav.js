/**
 * Single navigation handoff for channel editors (selectedMappingId only).
 */
(function (global) {
  'use strict';

  var _pending = null;

  function openChannelEditor(opts) {
    opts = opts || {};
    var mappingId = String(opts.mappingId || '').trim();
    var channel = String(opts.channel || '').trim();
    if (!mappingId || !channel) return;
    _pending = {
      mappingId: mappingId,
      channel: channel,
      actionId: opts.actionId || null,
      bindingRef: opts.bindingRef || null
    };
    var st = global.OneToneState;
    if (st) st.selectedMappingId = mappingId;
    var drawer = global.OneToneSettingsDrawer;
    var panel =
      channel === 'key'
        ? 'keys'
        : channel === 'voice'
          ? 'voiceWake'
          : channel === 'camera'
            ? 'camera'
            : channel === 'softPad'
              ? 'softPad'
              : null;
    if (drawer && panel) {
      if (drawer.open) drawer.open({ panel: panel });
      else if (drawer.setPanel) drawer.setPanel(panel);
    }
    if (global.OneToneHabitScenarioContextBanner && global.OneToneHabitScenarioContextBanner.openScenarioKeysEdit) {
      /* keep habit context when available */
      try {
        if (channel === 'key') {
          global.OneToneHabitScenarioContextBanner.openScenarioKeysEdit(mappingId, {
            returnToHub: true
          });
        }
      } catch (_) {}
    }
  }

  function consumePendingNav() {
    var p = _pending;
    _pending = null;
    return p;
  }

  function peekPendingNav() {
    return _pending;
  }

  global.OneToneActionNav = {
    openChannelEditor: openChannelEditor,
    consumePendingNav: consumePendingNav,
    peekPendingNav: peekPendingNav
  };
})(typeof window !== 'undefined' ? window : globalThis);
