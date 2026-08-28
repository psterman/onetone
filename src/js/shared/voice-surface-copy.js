/**
 * Home voice surface copy: single-switch UX (off / on+key / on+wake / dictating).
 * ponytail: one resolver — no user-facing "armed" phase.
 */
(function (global) {
  'use strict';

  function t(key, params) {
    if (!global.OneToneI18n || !global.OneToneI18n.t) return key;
    var out = global.OneToneI18n.t(key);
    if (params && typeof out === 'string') {
      Object.keys(params).forEach(function (k) {
        out = out.replace(new RegExp('\\{' + k + '\\}', 'g'), String(params[k]));
      });
    }
    return out;
  }

  function cfg() {
    return (global.OneToneState && global.OneToneState.state && global.OneToneState.state.config) || {};
  }

  function runtimePaused() {
    return !!(global.OneToneState && global.OneToneState.runtime && global.OneToneState.runtime.paused);
  }

  function assistEnabled(c) {
    c = c || cfg();
    if (c.voiceAssistEnabled === false) return false;
    if (c.voiceAssistEnabled === true) return true;
    return String(c.voiceListeningStrategy || c.voice_listening_strategy || 'off').trim() !== 'off';
  }

  function wakeOptIn(c) {
    c = c || cfg();
    return !!c.voiceWakeListeningOptIn;
  }

  function strategy(c) {
    c = c || cfg();
    return String(c.voiceListeningStrategy || c.voice_listening_strategy || 'off').trim() || 'off';
  }

  function activeTriggerKey(c) {
    c = c || cfg();
    var id = String(c.activeSceneId || '').trim();
    var m = (c.mappings || []).find(function (x) {
      return x && String(x.id) === id;
    });
    if (m && m.triggerKey) return String(m.triggerKey).trim();
    if (m && m.targetKey) return String(m.targetKey).trim();
    var enabled = (c.mappings || []).find(function (x) {
      return x && x.enabled && x.triggerKey;
    });
    return enabled ? String(enabled.triggerKey).trim() : '';
  }

  function primaryWakePhrase(bits) {
    bits = bits || {};
    if (bits.wakePhrase) return String(bits.wakePhrase).trim();
    if (global.OneToneHomeLive && global.OneToneHomeLive.voiceWakePhrase) {
      return String(global.OneToneHomeLive.voiceWakePhrase() || '').trim();
    }
    return '';
  }

  function primaryEndPhrase(bits) {
    bits = bits || {};
    if (bits.endPhrase) return String(bits.endPhrase).trim();
    if (global.OneToneHomeLive && global.OneToneHomeLive.voiceEndPhrases) {
      var list = global.OneToneHomeLive.voiceEndPhrases();
      return list && list[0] ? String(list[0]).trim() : '';
    }
    return t('homeEndPhraseDefault');
  }

  function resolve(bits) {
    bits = bits || {};
    var c = cfg();
    var paused = bits.paused != null ? !!bits.paused : runtimePaused();
    var dictating = !!bits.dictating;
    var on = assistEnabled(c) && !paused;
    var wake = wakeOptIn(c);
    var strat = strategy(c);
    var key = bits.triggerKey != null ? String(bits.triggerKey).trim() : activeTriggerKey(c);
    var wakePhrase = primaryWakePhrase(bits);
    var endPhrase = primaryEndPhrase(bits);

    if (dictating) {
      return {
        phase: 'dictating',
        voiceOn: on,
        line1: t('voiceSurfaceDictatingLine', { end: endPhrase || t('homeEndPhraseDefault') }),
        line2: '',
        switchOn: on,
        switchDisabled: true,
        wakeMode: wake,
      };
    }
    if (!on) {
      return {
        phase: paused ? 'paused' : 'off',
        voiceOn: false,
        line1: paused ? t('voiceSurfacePausedLine') : t('voiceSurfaceOffLine'),
        line2: paused ? t('voiceSurfacePausedHint') : t('voiceSurfaceOffHint'),
        switchOn: false,
        switchDisabled: false,
        wakeMode: wake,
      };
    }
    if (wake && (strat === 'resourceSaver' || strat === 'auto' || strat === 'enhanced')) {
      return {
        phase: 'wake',
        voiceOn: true,
        line1: t('voiceSurfaceWakeLine', { wake: wakePhrase || t('homeEndPhraseDefault') }),
        line2: t('voiceSurfaceWakeHint'),
        switchOn: true,
        switchDisabled: false,
        wakeMode: true,
      };
    }
    return {
      phase: 'key',
      voiceOn: true,
      line1: t('voiceSurfaceKeyLine', { key: key || '—' }),
      line2: t('voiceSurfaceKeyHint'),
      switchOn: true,
      switchDisabled: false,
      wakeMode: wake,
    };
  }

  global.OneToneVoiceSurfaceCopy = {
    resolve: resolve,
    assistEnabled: assistEnabled,
    wakeOptIn: wakeOptIn,
  };
})(typeof window !== 'undefined' ? window : globalThis);
