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

  /** Cached oral-command listen arm (not dictation / wake assist). */
  var oralArmed = false;
  var oralArmBound = false;

  function voiceOn() {
    return !!oralArmed;
  }

  function bindOralArmEvents() {
    if (oralArmBound || typeof global.addEventListener !== 'function') return;
    oralArmBound = true;
    global.addEventListener('ot:runtime-event', function (ev) {
      var evt = ev && ev.detail;
      if (!evt || typeof evt !== 'object') return;
      var source = String(evt.source || evt.Source || '').toLowerCase();
      var kind = String(evt.kind || evt.Kind || '').toLowerCase();
      if (source !== 'voice_command') return;
      if (kind === 'session_begin') {
        oralArmed = true;
        syncCapabilityStates({ silent: false });
      } else if (kind === 'session_end') {
        oralArmed = false;
        syncCapabilityStates({ silent: false });
      }
    });
  }

  function selectedMappingId() {
    try {
      var st = global.OneToneState;
      return String((st && st.selectedMappingId) || '').trim();
    } catch (_) {
      return '';
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
    // configOn = preference/forced; runtimeReady = actually usable now (same probe for Soft Pad open).
    var soft = softPadOn();
    var curSoft = capState('softPad');
    if (curSoft.state !== 'pending') {
      setCap(
        'softPad',
        {
          state: soft ? 'on' : 'off',
          configOn: soft,
          runtimeReady: soft && !!(global.OneToneSoftPadHub || global.OneToneSoftPadHubUi),
          error: null
        },
        { silent: silent }
      );
    }
    bindOralArmEvents();
    var vOn = voiceOn();
    var curV = capState('voice');
    if (curV.state !== 'pending') {
      setCap(
        'voice',
        {
          state: vOn ? 'on' : 'off',
          configOn: vOn,
          runtimeReady: vOn,
          error: null
        },
        { silent: silent }
      );
    }
    var Cam = global.OneToneCameraPresenceActions;
    if (!Cam) {
      setCap(
        'camera',
        { state: 'unavailable', configOn: false, runtimeReady: false, error: 'camera_unavailable' },
        { silent: silent }
      );
    } else {
      var curC = capState('camera');
      if (curC.state !== 'pending') {
        var enabled = cameraOn();
        setCap(
          'camera',
          {
            state: enabled ? 'on' : 'off',
            configOn: enabled,
            runtimeReady: enabled,
            error: null
          },
          { silent: silent }
        );
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

  /** Soft Pad oral needs Vosk STT (preview + free-say). Same as old home speak channel. */
  function ensureOralVoiceEngine() {
    var vw = global.OneToneVoiceWake;
    try {
      if (vw && typeof vw.unparkHomeAsrQuiet === 'function') vw.unparkHomeAsrQuiet();
    } catch (_) {}
    if (!vw || typeof vw.switchListeningStrategy !== 'function') {
      return Promise.resolve();
    }
    return Promise.resolve(vw.switchListeningStrategy('auto', { force: true })).catch(function () {});
  }

  function toggleVoice() {
    setCap('voice', { state: 'pending', error: null });
    var mid = selectedMappingId();
    var arming = !oralArmed;
    var prep = arming ? ensureOralVoiceEngine() : Promise.resolve();
    return prep
      .then(function () {
        return invoke('cmd_voice_command_session_toggle', { mappingId: mid || null });
      })
      .then(function (res) {
        // Toggle may no-op on wrong_fg / recording; trust backend armed flag.
        var on = !!(res && res.armed);
        oralArmed = on;
        setCap('voice', {
          state: on ? 'on' : 'off',
          configOn: on,
          runtimeReady: on,
          error: null
        });
        return { ok: !(res && res.ok === false), enabled: on, armed: on };
      })
      .catch(function (e) {
        setCap('voice', {
          state: voiceOn() ? 'on' : 'off',
          error: String((e && e.message) || e || 'voice_failed')
        });
        return { ok: false, error: e, enabled: voiceOn() };
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

  function mapInboxErr(err) {
    var msg = String((err && err.message) || err || '');
    if (/denied|not allowed|forbidden|permission/i.test(msg)) {
      return '应用权限未开放剪贴板读图，请重启应用后再试';
    }
    if (msg === 'too_large') return '图片过大（上限 12MB）';
    if (msg === 'bad_base64' || msg === 'read_failed') return '无法解码剪贴板图片';
    if (msg === 'empty' || msg === 'no_path' || msg === 'no_image') return '剪贴板里没有图片';
    if (msg === 'clipboard_busy') return '剪贴板正忙，请再试一次';
    if (msg === 'ipc_unavailable' || msg === 'unsupported') return '桌面通道未就绪，无法保存图片';
    if (!msg || msg === 'Error') return '粘贴图片失败';
    return msg;
  }

  /** Native Win32 clipboard image → inbox path → material card. */
  function pasteImageFromNative() {
    var began = prepBegin();
    if (!began.ok) {
      return Promise.resolve({
        outcome: 'failed',
        message: began.reason === 'busy' ? '正在交接，暂不能改材料' : '材料收集未就绪'
      });
    }
    return invoke('cmd_clipboard_read_image', {})
      .then(function (path) {
        var p = String(path || '').trim();
        if (!p) throw new Error('no_path');
        return began.Prep.collectMaterial('attach', {
          path: p,
          name: 'clipboard.png',
          source: '剪贴板'
        });
      })
      .then(function (res) {
        if (store() && store().syncMaterialsFromPrep) store().syncMaterialsFromPrep();
        return res;
      })
      .catch(function (err) {
        return { outcome: 'failed', message: mapInboxErr(err) };
      });
  }

  function pasteFromClipboard() {
    var began = prepBegin();
    if (!began.ok) {
      return Promise.resolve({
        outcome: 'failed',
        message: began.reason === 'busy' ? '正在交接，暂不能改材料' : '材料收集未就绪'
      });
    }
    var Prep = began.Prep;
    var clip = global.navigator && global.navigator.clipboard;
    function finish(res) {
      if (store() && store().syncMaterialsFromPrep) store().syncMaterialsFromPrep();
      return res;
    }
    function asTextPaste(text) {
      return Prep.collectMaterial('paste', { text: String(text || '') }).then(finish);
    }
    function pasteImageBlob(blob, mime) {
      if (!blob) {
        return Promise.resolve({ outcome: 'cancelled', message: '剪贴板为空' });
      }
      var hint = 'clipboard.png';
      var t = String(mime || blob.type || '');
      if (t.indexOf('jpeg') >= 0 || t.indexOf('jpg') >= 0) hint = 'clipboard.jpg';
      else if (t.indexOf('gif') >= 0) hint = 'clipboard.gif';
      else if (t.indexOf('webp') >= 0) hint = 'clipboard.webp';
      // Image ingest errors must NOT fall through to text clipboard fallback.
      return ingestBlobFile(blob, hint).then(finish, function (err) {
        // WebView blob path failed — try native Win32 clipboard.
        return pasteImageFromNative();
      });
    }
    function afterJsClipMiss() {
      // Screenshots often invisible to navigator.clipboard — native Win32 next.
      return pasteImageFromNative().then(function (res) {
        if (res && res.outcome === 'added') return res;
        if (clip && typeof clip.readText === 'function') {
          return clip.readText().then(asTextPaste).catch(function () {
            return res && res.message
              ? res
              : { outcome: 'failed', message: '无法读取剪贴板' };
          });
        }
        return res && res.message
          ? res
          : { outcome: 'failed', message: '无法读取剪贴板' };
      });
    }
    // Prefer image (browser copy), else native Win32, else text.
    if (clip && typeof clip.read === 'function') {
      return clip
        .read()
        .then(
          function (items) {
            var list = items || [];
            var i;
            var j;
            for (i = 0; i < list.length; i++) {
              var types = (list[i] && list[i].types) || [];
              for (j = 0; j < types.length; j++) {
                var mime = String(types[j] || '');
                if (mime.indexOf('image/') === 0) {
                  return list[i].getType(mime).then(function (blob) {
                    return pasteImageBlob(blob, mime);
                  });
                }
              }
            }
            return afterJsClipMiss();
          },
          function () {
            return afterJsClipMiss();
          }
        );
    }
    return afterJsClipMiss();
  }

  function pickMaterial(kind) {
    kind = String(kind || 'file');
    if (kind === 'screenshot' || kind === 'capture') {
      return captureScreen();
    }
    if (kind === 'paste') {
      return pasteFromClipboard();
    }
    var began = prepBegin();
    if (!began.ok) {
      return Promise.resolve({
        outcome: 'failed',
        message: began.reason === 'busy' ? '正在交接，暂不能改材料' : '材料收集未就绪'
      });
    }
    var Prep = began.Prep;
    var collectKind = kind === 'image' ? 'image' : kind === 'file' ? 'file' : 'attach';
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

  /** Real composer aim only — never treat slot index `active` as locked. */
  function aimPointActive(st) {
    if (!st) return false;
    if (st.hasActive === true || st.confirmed === true) return true;
    return st.x != null && st.y != null && isFinite(Number(st.x)) && isFinite(Number(st.y));
  }

  /**
   * Per-app composer memory (composer_anchors[appTargetId]).
   * force=false: inherit saved point (send path).
   * force=true: reopen calibrate (「现在定位」).
   */
  function ensureAim(target, opts) {
    opts = opts || {};
    var force = !!opts.force;
    var appId = appIdForTarget(target);
    if (!appId) return Promise.resolve({ ok: false, reason: 'no_app_target' });
    var Policy = global.OneToneHomeActionPolicy;
    var S = store();
    if (S && S.setAim) {
      S.setAim(appId, {
        pending: true,
        hasActive: !!(S.getSnapshot().aimByAppId[appId] || {}).hasActive
      });
    }
    var p =
      Policy && typeof Policy.ensureComposerAim === 'function'
        ? Policy.ensureComposerAim(appId, { force: force, wait: opts.wait !== false })
        : force
          ? invoke('cmd_input_aim_calibrate_begin', { appTargetId: appId })
          : invoke('cmd_input_aim_ensure', { appTargetId: appId, force: false });
    return Promise.resolve(p)
      .then(function (ens) {
        return refreshAim(appId).then(function (r) {
          var has = !!(r && r.hasActive) || !!(ens && ens.hasActive);
          if (S && S.setAim) {
            S.setAim(appId, {
              hasActive: has,
              pending: false,
              error: has ? null : 'aim_not_confirmed',
              raw: (r && r.raw) || ens
            });
          }
          return { ok: has, hasActive: has, reason: has ? null : 'aim_not_confirmed' };
        });
      })
      .catch(function (e) {
        if (S && S.setAim) {
          S.setAim(appId, {
            hasActive: false,
            pending: false,
            error: String((e && e.message) || e)
          });
        }
        return { ok: false, error: e };
      });
  }

  /** Homepage「现在定位」— always re-open calibrate for this agent only. */
  function calibrateAim(target) {
    return ensureAim(target, { force: true });
  }

  /** Load aim status for every catalog app so switching agents keeps the right chip. */
  function refreshAllAims() {
    var S = store();
    var list = S && typeof S.catalogList === 'function' ? S.catalogList() : [];
    var seen = {};
    var jobs = [];
    for (var j = 0; j < list.length; j++) {
      var appId = list[j] && list[j].appId;
      if (!appId || seen[appId]) continue;
      seen[appId] = true;
      jobs.push(refreshAim(appId));
    }
    return Promise.all(jobs);
  }

  function clearAim(target) {
    var appId = appIdForTarget(target);
    if (!appId) return Promise.resolve({ ok: false, reason: 'no_app_target' });
    var S = store();
    // Optimistic UI — slot must be usize (or omitted); string 'active' used to break IPC.
    if (S && S.setAim) S.setAim(appId, { hasActive: false, pending: false, raw: null });
    return invoke('cmd_input_aim_calibrate_clear', { appTargetId: appId })
      .then(function () {
        return { ok: true };
      })
      .catch(function (e) {
        return { ok: false, error: e };
      });
  }

  function refreshAim(appId) {
    return invoke('cmd_input_aim_calibrate_status', { appTargetId: appId })
      .then(function (s) {
        var has = aimPointActive(s);
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
      if (!blob) {
        reject(new Error('empty'));
        return;
      }
      var r = new FileReader();
      r.onload = function () {
        var dataUrl = String(r.result || '');
        var b64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
        if (!b64) {
          reject(new Error('empty'));
          return;
        }
        invoke('cmd_tray_inbox_write', { name: name, bytesBase64: b64 })
          .then(function (path) {
            var p = String(path || '').trim();
            if (!p) throw new Error('no_path');
            var began = prepBegin();
            if (!began.ok) throw new Error(began.reason || 'prep');
            return began.Prep.collectMaterial('attach', {
              path: p,
              name: name,
              source: '剪贴板',
              previewDataUrl: isImg ? dataUrl : ''
            });
          })
          .then(resolve)
          .catch(function (err) {
            var raw = err && (err.message || err);
            // Tauri often returns plain string errors (too_large / bad_base64).
            reject(new Error(String(raw || 'inbox_write_failed')));
          });
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
          if (!began.ok) {
            return {
              outcome: 'failed',
              message: began.reason === 'busy' ? '正在交接，暂不能改材料' : '材料收集未就绪'
            };
          }
          return began.Prep.collectMaterial('attach', {
            path: path,
            name: f.name || path.split(/[\\/]/).pop()
          });
        }
        return ingestBlobFile(f, f && f.name).then(null, function (err) {
          var msg = String((err && err.message) || err || '');
          if (msg === 'too_large') msg = '图片过大（上限 12MB）';
          else if (msg === 'bad_base64' || msg === 'read_failed') msg = '无法解码剪贴板图片';
          else if (msg === 'empty' || msg === 'no_path') msg = '剪贴板图片为空';
          else if (msg === 'ipc_unavailable') msg = '桌面通道未就绪，无法保存图片';
          else if (!msg || msg === 'Error') msg = '粘贴图片失败';
          return { outcome: 'failed', message: msg };
        });
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

  function updateMaterialContent(id, patch, opts) {
    var Prep = global.OneToneHomePromptPrep;
    if (!Prep || !Prep.updateMaterialContent || !id) return null;
    var res = Prep.updateMaterialContent(id, patch || {}, opts || {});
    // Typing in card: refresh store refs without forcing a full emit thrash.
    if (store() && store().syncMaterialsFromPrep) {
      store().syncMaterialsFromPrep({ emit: !(opts && opts.skipSync) });
    }
    return res;
  }

  /** Plain / large clipboard text → material card (not the draft textarea). */
  function pasteTextAsMaterial(text, opts) {
    opts = opts || {};
    var began = prepBegin();
    if (!began.ok) {
      return Promise.resolve({
        outcome: 'failed',
        message: began.reason === 'busy' ? '正在交接，暂不能改材料' : '材料收集未就绪'
      });
    }
    return began.Prep.collectMaterial('paste', {
      text: String(text || ''),
      source: opts.source || '剪贴板',
      name: opts.name
    }).then(function (res) {
      if (store() && store().syncMaterialsFromPrep) store().syncMaterialsFromPrep();
      return res;
    });
  }

  global.OneToneHomeDockBridge = {
    getCapabilityState: getCapabilityState,
    toggleSoftPad: toggleSoftPad,
    toggleVoice: toggleVoice,
    toggleCamera: toggleCamera,
    pickMaterial: pickMaterial,
    captureScreen: captureScreen,
    ensureAim: ensureAim,
    calibrateAim: calibrateAim,
    clearAim: clearAim,
    refreshAim: refreshAim,
    refreshAllAims: refreshAllAims,
    syncDraftToPrep: syncDraftToPrep,
    assembledText: assembledText,
    archiveOnSuccess: archiveOnSuccess,
    addFiles: addFiles,
    ingestBlobFile: ingestBlobFile,
    removeMaterial: removeMaterial,
    updateMaterialContent: updateMaterialContent,
    pasteTextAsMaterial: pasteTextAsMaterial,
    pasteImageFromNative: pasteImageFromNative,
    syncCapabilityStates: syncCapabilityStates,
    appIdForTarget: appIdForTarget
  };
})(typeof window !== 'undefined' ? window : globalThis);
