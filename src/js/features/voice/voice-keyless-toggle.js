/**
 * Shared 免按键语音 (voiceKeyless / wakeOrPushToTalk) toggle.
 * Armed = Vosk auto; off = pushToTalk + engines stopped.
 * Same config as settings #voiceWakeListeningOptInToggle, tray voiceKeyless, Soft Pad / mini.
 */
(function (global) {
  'use strict';

  var EVENT = 'voice-keyless-changed';

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

  function emitChanged(on) {
    try {
      var detail = { on: !!on };
      if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(EVENT, { detail: detail }));
      } else if (typeof document !== 'undefined' && document.dispatchEvent) {
        document.dispatchEvent(new CustomEvent(EVENT, { detail: detail }));
      }
    } catch (_) {}
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
      if (global.OneToneHomeWorkbench && global.OneToneHomeWorkbench.render) {
        global.OneToneHomeWorkbench.render();
      }
    } catch (_) {}
    try {
      if (global.OneToneIslands && global.OneToneIslands.refresh) {
        global.OneToneIslands.refresh('voiceConfig');
      }
    } catch (_) {}
    try {
      var Tray = global.OneToneTrayChannelControls;
      if (Tray && typeof Tray.syncAllSurfaces === 'function') Tray.syncAllSurfaces();
    } catch (_) {}
    emitChanged(isOn());
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
    c.voiceListeningStrategy = next ? 'auto' : 'off';
    c.desiredEngine = next ? 'vosk' : 'none';
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

  function onChange(fn) {
    if (typeof fn !== 'function') return function () {};
    var handler = function (ev) {
      try {
        fn(ev && ev.detail ? ev.detail : { on: isOn() });
      } catch (_) {}
    };
    var target = typeof global.addEventListener === 'function' ? global : document;
    if (!target || !target.addEventListener) return function () {};
    target.addEventListener(EVENT, handler);
    return function () {
      try {
        target.removeEventListener(EVENT, handler);
      } catch (_) {}
    };
  }

  /** Apply activation pushed from Soft Pad / mini / other webview via Tauri. */
  function applyRemote(payload) {
    payload = payload || {};
    var c = cfg();
    if (!c) return;
    var mode = String(payload.voiceActivation || payload.voice_activation || '').trim();
    var on =
      mode === 'wakeOrPushToTalk' ||
      payload.on === true ||
      (!!payload.voiceWakeListeningOptIn && mode !== 'pushToTalk' && mode !== 'disabled');
    if (!mode) mode = on ? 'wakeOrPushToTalk' : 'pushToTalk';
    c.voiceActivation = mode;
    c.voiceWakeListeningOptIn = on && mode === 'wakeOrPushToTalk';
    var strategy = String(payload.strategy || payload.voiceListeningStrategy || '').trim();
    if (!strategy) strategy = on && mode === 'wakeOrPushToTalk' ? 'auto' : 'off';
    c.voiceListeningStrategy = strategy;
    var eng = String(payload.desiredEngine || '').trim();
    if (!eng) eng = strategy === 'auto' || strategy === 'enhanced' ? 'vosk' : 'none';
    c.desiredEngine = eng;
    if (on && mode === 'wakeOrPushToTalk') c.voiceAssistEnabled = true;
    syncSurfaces();
  }

  var tauriBound = false;
  function bindCrossWebviewSync() {
    if (tauriBound) return;
    var ipc = global.OneToneIpc;
    if (!ipc || typeof ipc.listen !== 'function') return;
    tauriBound = true;
    try {
      ipc.listen(EVENT, function (ev) {
        var payload = (ev && ev.payload) || ev || {};
        applyRemote(payload);
      });
    } catch (_) {
      tauriBound = false;
    }
  }

  try {
    bindCrossWebviewSync();
  } catch (_) {}

  global.OneToneVoiceKeyless = {
    isOn: isOn,
    setOn: setOn,
    toggle: toggle,
    syncSurfaces: syncSurfaces,
    onChange: onChange,
    applyRemote: applyRemote,
    EVENT: EVENT,
    SLOT_ID: 'toggleVoiceKeyless'
  };
})(typeof window !== 'undefined' ? window : globalThis);
