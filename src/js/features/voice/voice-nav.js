/**
 * Unified voice entry: openVoice({ focus }) → voiceLab regions.
 * Legacy panel:'voiceWake' / focus / subpage map through adaptOpenOpts.
 */
(function (global) {
  'use strict';

  var FOCUS_ALIASES = {
    wake: 'wake',
    wakePhrases: 'wake',
    finish: 'finish',
    endPhrases: 'finish',
    end: 'finish',
    recognize: 'finish',
    send: 'finish',
    mic: 'mic',
    engine: 'engine',
    softpad: 'softpad',
    softPad: 'softpad',
    keys: 'keys',
    camera: 'camera',
    models: 'engine',
  };

  function normalizeFocus(focus) {
    focus = String(focus || '').trim();
    if (!focus) return '';
    return FOCUS_ALIASES[focus] || focus;
  }

  function drawer() {
    return global.OneToneSettingsDrawer || null;
  }

  function labApi() {
    return global.OneToneVoiceLabPanel || null;
  }

  function applyLabFocus(focus) {
    focus = normalizeFocus(focus);
    var Lab = labApi();
    if (Lab && typeof Lab.focusRegion === 'function') {
      Lab.focusRegion(focus);
      return;
    }
    // Fallback: scroll Lab hosts if present.
    var map = {
      wake: ['voiceLabRailGate', 'voiceLabWakePhrase', 'voiceLabSceneChrome'],
      finish: ['voiceLabFinishCard', 'voiceLabEndPhraseTags', 'voiceLabCancelPhraseTags'],
      mic: ['voiceLabAdvanced', 'voiceLabMicBtn', 'voiceLabMicPicker'],
      engine: ['voiceLabAdvanced', 'voiceLabEngineGrid', 'voiceLabResourceStatus'],
      softpad: ['voiceLabOralChromeHost', 'voiceLabRailGate'],
      keys: ['voiceLabOralChromeHost', 'voiceLabRailGate'],
      camera: ['voiceLabOralChromeHost', 'voiceLabRailGate'],
    };
    var ids = map[focus] || [];
    var adv = document.getElementById('voiceLabAdvanced');
    if ((focus === 'mic' || focus === 'engine') && adv) adv.open = true;
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.scrollIntoView) {
        try {
          el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {}
        return;
      }
    }
  }

  /**
   * Map legacy openSettings opts onto the product voice entry (voiceLab).
   * Explicit legacy:true or openLegacy keeps voiceWake.
   */
  function adaptOpenOpts(opts) {
    opts = opts || {};
    if (opts.legacy === true || opts.openLegacy === true) {
      return Object.assign({}, opts, { panel: 'voiceWake' });
    }
    var panel = String(opts.panel || '').trim();
    var focus = normalizeFocus(opts.focus || opts.voiceFocus || '');
    var sub = String(opts.voiceSubpage || opts.subpage || '').trim();
    if (!focus && sub) focus = normalizeFocus(sub);

    if (panel === 'voiceEnd' || panel === 'models') {
      panel = 'voiceLab';
      if (!focus) focus = panel === 'models' || opts.panel === 'models' ? 'engine' : 'finish';
    }
    if (panel === 'voiceWake' || panel === 'voice' || panel === 'voiceLab' || !panel) {
      // Product path: voiceLab. Keep voiceWake only when caller opts.legacy.
      panel = 'voiceLab';
    }
    if (opts.voiceTab === 'end' && !focus) focus = 'finish';
    var out = Object.assign({}, opts, { panel: panel });
    if (focus) out.focus = focus;
    return out;
  }

  function openVoice(opts) {
    opts = adaptOpenOpts(opts || {});
    var focus = normalizeFocus(opts.focus);
    var d = drawer();
    if (d && typeof d.open === 'function') {
      d.open(
        Object.assign({}, opts, {
          panel: opts.panel || 'voiceLab',
          focus: focus || undefined,
          // Avoid drawer focusSettingsField targeting classic Wake DOM when landing on Lab.
          _voiceNavFocus: focus || '',
        })
      );
    } else if (d && typeof d.setPanel === 'function') {
      d.setPanel(opts.panel || 'voiceLab', opts);
    }
    if ((opts.panel || 'voiceLab') === 'voiceLab' && focus) {
      setTimeout(function () {
        applyLabFocus(focus);
      }, 40);
    }
    return opts;
  }

  global.OneToneVoiceNav = {
    FOCUS_ALIASES: FOCUS_ALIASES,
    normalizeFocus: normalizeFocus,
    adaptOpenOpts: adaptOpenOpts,
    openVoice: openVoice,
    applyLabFocus: applyLabFocus,
  };
})(typeof window !== 'undefined' ? window : globalThis);
