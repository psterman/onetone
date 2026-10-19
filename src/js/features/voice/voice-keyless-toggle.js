/**
 * Shared 免按键语音 (voiceKeyless / wakeOrPushToTalk) toggle.
 * Same config as settings #voiceWakeListeningOptInToggle and tray voiceKeyless.
 */
(function (global) {
  'use strict';

  function t(key, fb) {
    var i18n = global.OneToneI18n;
    if (i18n && typeof i18n.t === 'function') {
      var v = i18n.t(key, fb);
      if (v && v !== key) return v;
    }
    return fb || key;
  }

  function cfg() {
    return (global.OneToneState && global.OneToneState.state && global.OneToneState.state.config) || {};
  }

  function isOn() {
    var c = cfg();
    return String(c.voiceActivation || '') === 'wakeOrPushToTalk' || !!c.voiceWakeListeningOptIn;
  }

  function syncSurfaces() {
    try {
      if (typeof global.__vp_syncWakeListeningOptInToggle__ === 'function') {
        global.__vp_syncWakeListeningOptInToggle__();
      }
    } catch (_) {}
    try {
      var scene = global.OneToneKeysSceneActionsPanel;
      if (scene && typeof scene.refresh === 'function') scene.refresh();
    } catch (_) {}
    try {
      if (global.OneToneHomeLive && global.OneToneHomeLive.render) global.OneToneHomeLive.render();
    } catch (_) {}
    try {
      if (global.OneToneIslands && global.OneToneIslands.refresh) {
        global.OneToneIslands.refresh('voiceConfig');
      }
    } catch (_) {}
  }

  /**
   * @param {boolean} next
   * @param {{ confirm?: boolean, reason?: string, skipConfirm?: boolean }} [opts]
   * @returns {Promise<{ok:boolean, on?:boolean, cancelled?:boolean}>}
   */
  function setOn(next, opts) {
    opts = opts || {};
    next = !!next;
    if (next && opts.confirm !== false && !opts.skipConfirm) {
      var msg = t(
        'voiceWakeListeningOptInConfirm',
        '开启后会在后台本地听唤醒词。确定开启免按键语音？'
      );
      if (typeof global.confirm === 'function' && !global.confirm(msg)) {
        return Promise.resolve({ ok: false, cancelled: true, on: isOn() });
      }
    }
    var mode = next ? 'wakeOrPushToTalk' : 'pushToTalk';
    var c = cfg();
    c.voiceActivation = mode;
    c.voiceWakeListeningOptIn = !!next;
    if (next) c.voiceAssistEnabled = true;
    syncSurfaces();

    var invoke = global.OneToneIpc && global.OneToneIpc.invoke;
    var p = invoke
      ? invoke('cmd_voice_set_activation', { mode: mode })
      : Promise.resolve({ ok: true });
    return Promise.resolve(p)
      .then(function (res) {
        try {
          var persist = global.OneToneConfigPersist;
          if (persist && persist.invokeSaveOnce) persist.invokeSaveOnce(opts.reason || 'voiceKeyless');
        } catch (_) {}
        try {
          var Tray = global.OneToneTrayChannelControls;
          if (Tray && typeof Tray.syncAllSurfaces === 'function') Tray.syncAllSurfaces();
        } catch (_) {}
        syncSurfaces();
        return { ok: !(res && res.ok === false), on: next, res: res };
      })
      .catch(function (err) {
        console.error('voiceKeyless.setOn', err);
        return { ok: false, on: isOn(), error: err };
      });
  }

  /**
   * @param {{ confirm?: boolean, reason?: string }} [opts]
   */
  function toggle(opts) {
    return setOn(!isOn(), opts || {});
  }

  global.OneToneVoiceKeyless = {
    isOn: isOn,
    setOn: setOn,
    toggle: toggle,
    SLOT_ID: 'toggleVoiceKeyless'
  };
})(typeof window !== 'undefined' ? window : globalThis);
