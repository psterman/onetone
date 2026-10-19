/**
 * OneToneHomeDockBridge — Soft Pad / voice / camera / aim / materials for home-agent-v2.
 * No optimistic "on"; pending until backend/config confirms.
 */
(function (global) {
  'use strict';

  function store() {
    return global.OneToneHomeAgentV2Store;
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    return ipc && ipc.invoke
      ? ipc.invoke(cmd, args || {})
      : Promise.reject(new Error('ipc_unavailable'));
  }

  function cfg() {
    return (global.OneToneState && global.OneToneState.state && global.OneToneState.state.config) || {};
  }

  function persistConfig() {
    var P = global.OneToneConfigPersist;
    if (!P) return;
    try {
      if (P.saveAsync) P.saveAsync();
      else if (P.save) P.save();
    } catch (_) {}
  }

  function voiceOn() {
    try {
      var Live = global.OneToneHomeLive;
      if (Live && typeof Live.voiceEngineOn === 'function') {
        return Live.voiceEngineOn() !== 'off';
      }
      var c = cfg();
      if (global.OneToneVoiceSurfaceCopy && global.OneToneVoiceSurfaceCopy.assistEnabled) {
        return !!global.OneToneVoiceSurfaceCopy.assistEnabled(c);
      }
      return !!c.voiceAssistEnabled;
    } catch (_) {
      return false;
    }
  }

  function cameraOn() {
    var Cam = global.OneToneCameraPresenceActions;
    if (!Cam) return false;
    try {
      if (typeof Cam.isEnabled === 'function') return !!Cam.isEnabled();
      var prefs = typeof Cam.prefs === 'function' ? Cam.prefs() : null;
      return !!(prefs && prefs.enabled);
    } catch (_) {
      return false;
    }
  }

  function softPadOn() {
    return !!cfg().softPadForceOpen;
  }

  function capState(key) {
    var S = store();
    var snap = S && S.getSnapshot ? S.getSnapshot() : null;
    return (snap && snap.capabilities && snap.capabilities[key]) || { state: 'off', error: null };
  }

  function setCap(key, patch, opts) {
    var S = store();
    if (S && S.setCapability) S.setCapability(key, patch, opts);
  }

  /** Sync from config/runtime into store. Use silent during paint to avoid re-entrancy. */
  function syncCapabilityStates(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    var soft = softPadOn();
    var curSoft = capState('softPad');
    if (curSoft.state !== 'pending') {
      setCap('softPad', { state: soft ? 'on' : 'off', error: null }, { silent: silent });
    }
    var vOn = voiceOn();
    var curV = capState('voice');
    if (curV.state !== 'pending') {
      setCap('voice', { state: vOn ? 'on' : 'off', error: null }, { silent: silent });
    }
    var Cam = global.OneToneCameraPresenceActions;
    if (!Cam) {
      setCap('camera', { state: 'unavailable', error: 'camera_unavailable' }, { silent: silent });
    } else {
      var curC = capState('camera');
      if (curC.state !== 'pending') {
        var enabled = cameraOn();
        setCap('camera', { state: enabled ? 'on' : 'off', error: null }, { silent: silent });
      }
    }
  }

  function getCapabilityState() {
    syncCapabilityStates();
    var S = store();
    return (S && S.getSnapshot && S.getSnapshot().capabilities) || {
      softPad: { state: 'off' },
      voice: { state: 'off' },
      camera: { state: 'off' }
    };
  }

  function toggleSoftPad() {
    var next = !softPadOn();
    setCap('softPad', { state: 'pending', error: null });
    var c = cfg();
    c.softPadForceOpen = next;
    return invoke('cmd_soft_pad_force_open', { enabled: next })
      .then(function () {
        persistConfig();
        if (next && global.OneToneSoftPadHub && global.OneToneSoftPadHub.openPanel) {
          try {
            global.OneToneSoftPadHub.openPanel();
          } catch (_) {}
        }
        setCap('softPad', { state: next ? 'on' : 'off', error: null });
        return { ok: true, enabled: next };
      })
      .catch(function (e) {
        c.softPadForceOpen = !next;
        setCap('softPad', {
          state: softPadOn() ? 'on' : 'off',
          error: String((e && e.message) || e || 'soft_pad_failed')
        });
        return { ok: false, enabled: softPadOn(), error: e };
      });
  }

  function toggleVoice() {
    setCap('voice', { state: 'pending', error: null });
    var Actions = global.OneToneHomeLiveActions;
    try {
      if (Actions && typeof Actions.homeToggleVoiceWake === 'function') {
        Actions.homeToggleVoiceWake();
      } else {
        throw new Error('voice_unavailable');
      }
    } catch (e) {
      setCap('voice', {
        state: voiceOn() ? 'on' : 'off',
        error: String((e && e.message) || e || 'voice_failed')
      });
      return Promise.resolve({ ok: false, error: e });
    }
    return new Promise(function (resolve) {
      global.setTimeout(function () {
        var on = voiceOn();
        setCap('voice', { state: on ? 'on' : 'off', error: null });
        resolve({ ok: true, enabled: on });
      }, 180);
    });
  }

  function toggleCamera() {
    var Cam = global.OneToneCameraPresenceActions;
    if (!Cam || typeof Cam.persist !== 'function') {
      setCap('camera', { state: 'unavailable', error: 'camera_unavailable' });
      return Promise.resolve({ ok: false, error: 'camera_unavailable' });
    }
    var next = !cameraOn();
    setCap('camera', { state: 'pending', error: null });
    try {
      Cam.persist({ enabled: next });
      if (typeof Cam.reconcileRuntime === 'function') {
        Cam.reconcileRuntime({ reason: next ? 'home_v2_on' : 'home_v2_off' });
      }
    } catch (e) {
      setCap('camera', {
        state: 'off',
        error: String((e && e.message) || e || 'camera_failed')
      });
      return Promise.resolve({ ok: false, error: e });
    }
    return new Promise(function (resolve) {
      global.setTimeout(function () {
        var on = cameraOn();
        var err = null;
        try {
          if (next && !on) {
            var rs = typeof Cam.getRuntimeStatus === 'function' ? Cam.getRuntimeStatus() : null;
            err =
              (rs && (rs.error || rs.message || rs.reason)) ||
              'camera_permission_or_runtime';
          }
        } catch (_) {}
        setCap('camera', {
          state: on ? 'on' : 'off',
          error: on ? null : err
        });
        resolve({ ok: !!on === !!next, enabled: on, error: err });
      }, 220);
    });
  }

  function prepBegin() {
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep) return { ok: false, reason: 'prep_unavailable' };
    if (typeof Prep.beginMaterialCollection === 'function') {
      var began = Prep.beginMaterialCollection({ resetIfHandedOff: true });
      if (began && began.outcome === 'busy') return { ok: false, reason: 'busy' };
    }
    return { ok: true, Prep: Prep };
  }

  function pickMaterial(kind) {
    kind = String(kind || 'file');
    if (kind === 'screenshot' || kind === 'capture') {
      return captureScreen();
    }
    var began = prepBegin();
    if (!began.ok) {
      return Promise.resolve({ outcome: 'failed', message: began.reason });
    }
    var Prep = began.Prep;
    var collectKind =
      kind === 'paste' ? 'paste' : kind === 'image' ? 'image' : kind === 'file' ? 'file' : 'attach';
    return Prep.collectMaterial(collectKind).then(function (res) {
      if (store() && store().syncMaterialsFromPrep) store().syncMaterialsFromPrep();
      return res;
    });
  }

  function captureScreen() {
    var sc = global.OneToneSmartCapture;
    if (!sc || typeof sc.begin !== 'function') {
      return Promise.resolve({ outcome: 'failed', message: 'smart_capture_unavailable' });
    }
    prepBegin();
    return sc.begin('home').then(
      function () {
        return { outcome: 'started' };
      },
      function (e) {
        return { outcome: 'failed', message: String((e && e.message) || e) };
      }
    );
  }

  function appIdForTarget(target) {
    var S = store();
    var kind = target;
    if (S && S.resolveKind) kind = S.resolveKind(target) || target;
    var cat = S && S.catalog ? S.catalog(kind) : null;
    if (cat && cat.appId) return cat.appId;
    var Policy = global.OneToneHomeActionPolicy;
    if (Policy && typeof Policy.appIdForKind === 'function') {
      return Policy.appIdForKind(kind === 'codex' ? 'chatgpt' : kind) || '';
    }
    return (cat && cat.appId) || '';
  }

  function calibrateAim(target) {
    var appId = appIdForTarget(target);
    if (!appId) return Promise.resolve({ ok: false, reason: 'no_app_target' });
    var Policy = global.OneToneHomeActionPolicy;
    var S = store();
    if (S && S.setAim) {
      S.setAim(appId, { pending: true, hasActive: !!(S.getSnapshot().aimByAppId[appId] || {}).hasActive });
    }
    var p =
      Policy && typeof Policy.ensureComposerAim === 'function'
        ? Policy.ensureComposerAim(appId, {})
        : invoke('cmd_input_aim_calibrate_start', { appTargetId: appId });
    return Promise.resolve(p)
      .then(function () {
        return refreshAim(appId);
      })
      .catch(function (e) {
        if (S && S.setAim) S.setAim(appId, { hasActive: false, error: String((e && e.message) || e) });
        return { ok: false, error: e };
      });
  }

  function clearAim(target) {
    var appId = appIdForTarget(target);
    if (!appId) return Promise.resolve({ ok: false });
    return invoke('cmd_input_aim_calibrate_clear', { appTargetId: appId, slot: 'active' })
      .then(function () {
        var S = store();
        if (S && S.setAim) S.setAim(appId, { hasActive: false });
        return { ok: true };
      })
      .catch(function (e) {
        return { ok: false, error: e };
      });
  }

  function refreshAim(appId) {
    return invoke('cmd_input_aim_calibrate_status', { appTargetId: appId })
      .then(function (s) {
        var has = !!(s && (s.hasActive || s.active || s.confirmed));
        var S = store();
        if (S && S.setAim) S.setAim(appId, { hasActive: has, raw: s });
        return { ok: true, hasActive: has, raw: s };
      })
      .catch(function () {
        return { ok: false, hasActive: false };
      });
  }

  function syncDraftToPrep(text) {
    var Prep = global.OneToneHomePromptPrep;
    var S = store();
    if (S && S.setDraft) S.setDraft(text, { lock: true, silent: true });
    if (Prep && typeof Prep.setDraftBody === 'function') {
      try {
        Prep.setDraftBody(text, { skipSync: true });
      } catch (_) {}
    }
  }

  function assembledText(fallback) {
    var Prep = global.OneToneHomePromptPrep;
    var text = fallback || '';
    if (Prep && Prep.setDraftBody) {
      try {
        Prep.setDraftBody(text, { skipSync: true });
        var assembled = Prep.ensureAssembled && Prep.ensureAssembled();
        if (assembled && assembled.md) text = String(assembled.md);
      } catch (_) {}
    }
    return text;
  }

  function archiveOnSuccess(kind) {
    var Prep = global.OneToneHomePromptPrep;
    if (Prep && Prep.archiveHandoff) {
      try {
        Prep.archiveHandoff({ targetKind: kind, outcome: 'sent' });
      } catch (_) {}
    }
    var S = store();
    if (S && S.setDraft) S.setDraft('', { silent: true });
    if (Prep && Prep.setDraftBody) {
      try {
        Prep.setDraftBody('', { skipSync: true });
      } catch (_) {}
    }
  }

  /** Pathless File/Blob → tray inbox → Prep material (same as Soft Pad carry). */
  function ingestBlobFile(blob, nameHint) {
    var name =
      (nameHint && String(nameHint)) ||
      (blob && blob.name) ||
      'clipboard.bin';
    var isImg =
      (blob && blob.type && String(blob.type).indexOf('image/') === 0) ||
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
    if (isImg && !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
      var t = (blob && blob.type) || '';
      if (t.indexOf('jpeg') >= 0 || t.indexOf('jpg') >= 0) name = 'clipboard.jpg';
      else if (t.indexOf('gif') >= 0) name = 'clipboard.gif';
      else if (t.indexOf('webp') >= 0) name = 'clipboard.webp';
      else name = 'clipboard.png';
    }
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        var dataUrl = String(r.result || '');
        var b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        invoke('cmd_tray_inbox_write', { name: name, bytesBase64: b64 })
          .then(function (path) {
            var p = String(path || '').trim();
            if (!p) throw new Error('no_path');
            var began = prepBegin();
            if (!began.ok) throw new Error(began.reason || 'prep');
            return began.Prep.collectMaterial('attach', { path: p, name: name });
          })
          .then(resolve)
          .catch(reject);
      };
      r.onerror = function () {
        reject(new Error('read_failed'));
      };
      r.readAsDataURL(blob);
    });
  }

  function addFiles(list) {
    var files = Array.prototype.slice.call(list || []);
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        var path = (f && f.path && String(f.path).trim()) || '';
        if (path) {
          var began = prepBegin();
          if (!began.ok) return { outcome: 'failed', message: began.reason };
          return began.Prep.collectMaterial('attach', {
            path: path,
            name: f.name || path.split(/[\\/]/).pop()
          });
        }
        return ingestBlobFile(f, f && f.name);
      });
    });
    return chain.then(function (last) {
      if (store() && store().syncMaterialsFromPrep) store().syncMaterialsFromPrep();
      return last;
    });
  }

  function removeMaterial(id) {
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || !Prep.removeMaterial || !id) return { removed: false };
    var res = Prep.removeMaterial(id);
    if (store() && store().syncMaterialsFromPrep) store().syncMaterialsFromPrep();
    return res;
  }

  global.OneToneHomeDockBridge = {
    getCapabilityState: getCapabilityState,
    toggleSoftPad: toggleSoftPad,
    toggleVoice: toggleVoice,
    toggleCamera: toggleCamera,
    pickMaterial: pickMaterial,
    captureScreen: captureScreen,
    calibrateAim: calibrateAim,
    clearAim: clearAim,
    refreshAim: refreshAim,
    syncDraftToPrep: syncDraftToPrep,
    assembledText: assembledText,
    archiveOnSuccess: archiveOnSuccess,
    addFiles: addFiles,
    ingestBlobFile: ingestBlobFile,
    removeMaterial: removeMaterial,
    syncCapabilityStates: syncCapabilityStates,
    appIdForTarget: appIdForTarget
  };
})(typeof window !== 'undefined' ? window : globalThis);
