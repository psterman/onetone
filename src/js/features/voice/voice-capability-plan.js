/**
 * Soft Pad oral / wake capability routing (pure; FE displays Rust probe results).
 * Vosk is never auto-downloaded — caller opens downloadVoskModelGuide on download_*.
 */
(function (global) {
  'use strict';

  /**
   * Soft Pad oral is Vosk STT only — SAPI/KWS are wake/keyword engines, not Soft Pad 转写.
   * @param {{ voskInstalled?: boolean, recommendedSoftPad?: string, sapiZhAvailable?: boolean }|null} cap
   * @returns {{ action: 'switch_auto'|'download', warnKey?: string }}
   */
  function oralVoicePlan(cap) {
    if (!cap) return { action: 'switch_auto' };
    if (cap.voskInstalled) return { action: 'switch_auto' };
    return { action: 'download' };
  }

  /**
   * @param {{ recommendedWake?: string, reasons?: Array<{messageKey?: string}> }|null} cap
   * @returns {{ summaryKey: string, reasonKey: string, showDownload: boolean, showSpeechSetup: boolean }}
   */
  function capabilityStripPlan(cap) {
    if (!cap) {
      return {
        summaryKey: 'voiceCapSummaryUnknown',
        reasonKey: '',
        showDownload: false,
        showSpeechSetup: false
      };
    }
    var wake = String(cap.recommendedWake || 'none');
    var summaryKey =
      wake === 'sapi'
        ? 'voiceCapSummaryWakeSapi'
        : wake === 'vosk'
          ? 'voiceCapSummaryWakeVosk'
          : 'voiceCapSummaryWakeNone';
    var reasons = Array.isArray(cap.reasons) ? cap.reasons : [];
    var reasonKey = reasons.length ? String(reasons[0].messageKey || '') : '';
    var codes = reasons.map(function (r) {
      return String((r && r.code) || '');
    });
    var showDownload = !!cap.needVoskDownload || codes.indexOf('vosk_model_missing') >= 0;
    var showSpeechSetup =
      codes.indexOf('sapi_zh_engine_missing') >= 0 ||
      codes.indexOf('sapi_unavailable') >= 0 ||
      codes.indexOf('sapi_short_command_fail') >= 0;
    return { summaryKey: summaryKey, reasonKey: reasonKey, showDownload: showDownload, showSpeechSetup: showSpeechSetup };
  }

  global.OneToneVoiceCapabilityPlan = {
    oralVoicePlan: oralVoicePlan,
    capabilityStripPlan: capabilityStripPlan
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.OneToneVoiceCapabilityPlan;
  }
})(typeof window !== 'undefined' ? window : globalThis);
