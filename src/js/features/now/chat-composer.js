/**
 * Chat composer — input-only helpers. Drive/cancel go through AtrSessionController.
 */
(function (global) {
  'use strict';

  /**
   * Normalize send payload for chat lane. Does not start ATR itself —
   * callers pass the result to store/session controller.
   */
  function buildChatSendOpts(text, extra) {
    extra = extra || {};
    return Object.assign(
      {
        goal: String(text || '').trim(),
        permissionMode: 'read_only',
        skipPlanConfirm: true,
        planConfirmed: true,
        lane: 'chat'
      },
      extra
    );
  }

  function canSend(text, busy) {
    if (busy) return false;
    return String(text || '').trim().length > 0;
  }

  global.OneToneChatComposer = {
    buildChatSendOpts: buildChatSendOpts,
    canSend: canSend
  };
})(typeof window !== 'undefined' ? window : globalThis);
