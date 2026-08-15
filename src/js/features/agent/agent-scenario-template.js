/**
 * Codex Micro pack apply — unique write entry for keys / voice / camera.
 * Pages only call apply / reset / edit-one; they do not assemble binding arrays.
 * Voice truth = agentBindings(voice); never legacy voiceCommands / wake / acoustic.
 */
(function (global) {
  'use strict';

  function t(key, fallback) {
    try {
      if (global.OneToneI18n && global.OneToneI18n.t) {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback != null ? fallback : key;
  }

  function hub() {
    return global.OneToneHabitHub;
  }

  function agent() {
    return global.OneToneAgentActions;
  }

  function toast(msg) {
    try {
      if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
        global.OneToneUiFeedback.toast(msg);
        return;
      }
    } catch (_) {}
    try { console.log(msg); } catch (_) {}
  }

  function persist() {
    var p = global.OneToneConfigPersist;
    if (p && p.saveAsync) p.saveAsync();
    else if (p && p.save) p.save();
  }

  function findExistingCodexScenario() {
    var A = agent();
    var H = hub();
    if (!A || !H || !H.findAppScenarioByAppId) return null;
    return H.findAppScenarioByAppId(A.APP_TARGET_ID) || null;
  }

  /** Recommend entry: reuse first Codex scenario if any, else create one. */
  function findOrCreateCodexScenario() {
    var A = agent();
    var H = hub();
    if (!H || !H.createAppScenario) return null;
    var existing = findExistingCodexScenario();
    if (existing) return { mapping: existing, created: false };
    var m = H.createAppScenario(A.APP_TARGET_ID, { reuseExisting: false });
    return m ? { mapping: m, created: true } : null;
  }

  /** Reuse existing Codex scenario when present (one preset app → one scenario). */
  function createNewCodexScenario() {
    return findOrCreateCodexScenario();
  }

  /**
   * Seed capability slots on THIS mapping only — recommended key chords + default voice phrases.
   * Does not navigate to another Codex scenario.
   */
  function ensurePackForMapping(m, opts) {
    opts = opts || {};
    if (!m) return m;
    if (isCursorScenario(m)) {
      if (hasCursorPack(m) && !opts.force) {
        if (fillEmptyKeyDefaults(m) && opts.persist !== false) persist();
        return m;
      }
      return applyCursorPackToMapping(m, {
        channels: ['keys', 'voice', 'camera'],
        essentialsOnly: false,
        reset: !hasCursorPack(m),
        cameraTarget: 'override',
        enableProfile: 'scenarioAllKeys',
        setAppTarget: true,
        persist: opts.persist !== false
      });
    }
    if (isVscodeLineageScenario(m)) {
      if (hasVscodePack(m) && !opts.force) {
        if (fillEmptyKeyDefaults(m) && opts.persist !== false) persist();
        return m;
      }
      return applyVscodePackToMapping(m, {
        channels: ['keys', 'voice', 'camera'],
        essentialsOnly: false,
        reset: !hasVscodePack(m),
        cameraTarget: 'override',
        enableProfile: 'scenarioAllKeys',
        setAppTarget: true,
        persist: opts.persist !== false
      });
    }
    if (!isCodexScenario(m)) return m;
    if (hasCodexPack(m) && !opts.force) {
      if (fillEmptyKeyDefaults(m) && opts.persist !== false) persist();
      return m;
    }
    return applyCodexPackToMapping(m, {
      channels: ['keys', 'voice', 'camera'],
      essentialsOnly: false,
      reset: !hasCodexPack(m),
      cameraTarget: 'override',
      enableProfile: 'scenarioAllKeys',
      setAppTarget: true,
      persist: opts.persist !== false
    });
  }

  /** Backfill recommended chords when older packs left key bindings empty. */
  function fillEmptyKeyDefaults(m) {
    var A = agent();
    if (!A || !m || !Array.isArray(m.agentBindings)) return false;
    var changed = false;
    var app = String(m.appTargetId || '').trim();
    var provider = A.providerIdForApp ? A.providerIdForApp(app) : '';
    if (provider && !String(m.agentProviderId || '').trim()) {
      m.agentProviderId = provider;
    }
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (!b || b.triggerType !== 'key') continue;
      if (String(b.triggerBinding || '').trim()) continue;
      var def = A.defaultKeyForMapping
        ? A.defaultKeyForMapping(m, b.slotId)
        : (A.defaultKeyForSlot ? A.defaultKeyForSlot(b.slotId) : '');
      if (!def) continue;
      b.triggerBinding = def;
      changed = true;
    }
    if (isVscodeLineageScenario(m) && realignAppBindingsFromStaleDefaults(m)) changed = true;
    return changed;
  }

  function realignCursorBindingsFromCodexDefaults(m) {
    return realignAppBindingsFromStaleDefaults(m);
  }

  function realignVscodeBindingsFromCodexDefaults(m) {
    return realignAppBindingsFromStaleDefaults(m);
  }

  function realignAppBindingsFromStaleDefaults(m) {
    var A = agent();
    if (!A || !m || !Array.isArray(m.agentBindings)) return false;
    var target = (A.defaultKeyMapForApp && A.defaultKeyMapForApp(m.appTargetId)) || {};
    var staleMaps = [
      A.DEFAULT_KEY_BY_SLOT || {},
      A.VSCODE_DEFAULT_KEY_BY_SLOT || {},
      A.STALE_GENERIC_VSCODE_KEY_BY_SLOT || { quickChat: 'Ctrl+L' },
      A.CURSOR_DEFAULT_KEY_BY_SLOT || {},
      A.TRAE_DEFAULT_KEY_BY_SLOT || {},
      A.QODER_DEFAULT_KEY_BY_SLOT || {},
      A.WORKBUDDY_DEFAULT_KEY_BY_SLOT || {}
    ];
    var changed = false;
    m.agentBindings.forEach(function (b) {
      if (!b || b.triggerType !== 'key') return;
      var sid = String(b.slotId || '').trim();
      var cur = String(b.triggerBinding || '').trim();
      var next = String(target[sid] || '').trim();
      if (cur === next) return;
      var stale = staleMaps.some(function (map) {
        return String(map[sid] || '').trim() === cur && cur !== '';
      });
      if (!stale) return;
      b.triggerBinding = next;
      changed = true;
    });
    return changed;
  }

  function isCodexScenario(m) {
    if (!m) return false;
    if (isVscodeLineageScenario(m)) return false;
    var A = agent();
    if (!A) return false;
    return String(m.appTargetId || '') === A.APP_TARGET_ID
      || String(m.agentTemplateId || '') === A.TEMPLATE_ID;
  }

  function isCursorScenario(m) {
    return !!(m && String(m.appTargetId || '') === 'cursor-chat');
  }

  function isVscodeLineageScenario(m) {
    var A = agent();
    var app = String((m && m.appTargetId) || '').trim();
    if (A && A.isVscodeLineageApp) return A.isVscodeLineageApp(app);
    return app === 'cursor-chat' || app === 'workbuddy-chat' ||
      app === 'trae-work' || app === 'trae-chat' || app === 'trae-code' || app === 'qoder-chat';
  }

  function hasVscodePack(m) {
    return !!(m && isVscodeLineageScenario(m)
      && String(m.agentTemplateId || '') === (agent() && agent().TEMPLATE_ID)
      && Array.isArray(m.agentBindings) && m.agentBindings.length);
  }

  function hasCursorPack(m) {
    return !!(m && isCursorScenario(m)
      && String(m.agentTemplateId || '') === (agent() && agent().TEMPLATE_ID)
      && Array.isArray(m.agentBindings) && m.agentBindings.length);
  }

  function hasCodexPack(m) {
    return !!(m && String(m.agentTemplateId || '') === (agent() && agent().TEMPLATE_ID)
      && Array.isArray(m.agentBindings) && m.agentBindings.length);
  }

  function bindingKey(b) {
    return String(b.slotId || '') + '|' + String(b.triggerType || '');
  }

  function mergeBindings(existing, fresh, reset) {
    existing = Array.isArray(existing) ? existing : [];
    fresh = Array.isArray(fresh) ? fresh : [];
    if (reset || !existing.length) return fresh.slice();
    var map = {};
    for (var i = 0; i < existing.length; i++) {
      if (existing[i]) map[bindingKey(existing[i])] = existing[i];
    }
    var out = existing.slice();
    for (var j = 0; j < fresh.length; j++) {
      var f = fresh[j];
      if (!f) continue;
      var k = bindingKey(f);
      if (!map[k]) {
        out.push(f);
        map[k] = f;
      }
    }
    return out;
  }

  function applyKeysVoice(m, opts) {
    var A = agent();
    if (!A || !m) return;
    var profile = opts.enableProfile || 'scenarioAllKeys';
    var channels = opts.channels || ['keys', 'voice'];
    var wantKeys = channels.indexOf('keys') >= 0;
    var wantVoice = channels.indexOf('voice') >= 0;
    if (!wantKeys && !wantVoice) return;

    var app = String(m.appTargetId || '').trim();
    m.agentTemplateId = A.TEMPLATE_ID;
    var provider = (A.providerIdForApp && A.providerIdForApp(app)) || '';
    if (provider) m.agentProviderId = provider;
    else if (!String(m.agentProviderId || '').trim()) m.agentProviderId = A.PROVIDER_ID;
    if (isCodexScenario(m) || opts.setAppTarget) {
      m.appTargetId = m.appTargetId || A.APP_TARGET_ID;
    }

    var fresh = A.buildScenarioBindings
      ? A.buildScenarioBindings(m, { enableProfile: profile })
      : A.buildCodexMicro13Bindings({ enableProfile: profile });
    if (!wantKeys) fresh = fresh.filter(function (b) { return b.triggerType !== 'key'; });
    if (!wantVoice) fresh = fresh.filter(function (b) { return b.triggerType !== 'voice'; });

    if (opts.reset) {
      // Reset only requested channels; keep the other channel's bindings.
      var keep = (m.agentBindings || []).filter(function (b) {
        if (!b) return false;
        if (wantKeys && b.triggerType === 'key') return false;
        if (wantVoice && b.triggerType === 'voice') return false;
        return true;
      });
      m.agentBindings = keep.concat(fresh);
    } else {
      m.agentBindings = mergeBindings(m.agentBindings, fresh, false);
    }
    fillEmptyKeyDefaults(m);

    var MicroPad = global.OneToneCodexMicroPadUi;
    if (MicroPad && MicroPad.ensurePad) {
      MicroPad.ensurePad(m, { persist: false });
    }

    // Strip legacy agent-action voiceCommands if present (unused at runtime).
    if (Array.isArray(m.voiceCommands)) {
      m.voiceCommands = m.voiceCommands.filter(function (c) {
        return !c || String(c.kind || '') !== 'agent-action';
      });
    }
  }

  function isNoneAction(v) {
    var s = String(v == null ? 'none' : v).trim();
    return !s || s === 'none';
  }

  function applyCameraPatch(target, patch, reset) {
    if (!target || !patch) return target;
    var out = Object.assign({}, target);
    out.triggers = Object.assign({}, (target.triggers && typeof target.triggers === 'object') ? target.triggers : {});
    var filledKeys = [];
    ['onAway', 'onReturn', 'shakeHead', 'deliberateBlink', 'openPalm', 'okHand', 'fist', 'wave'].forEach(function (key) {
      if (patch[key] == null) return;
      if (reset || isNoneAction(out[key])) {
        out[key] = patch[key];
        filledKeys.push(key);
      }
    });
    if (patch.triggers && typeof patch.triggers === 'object') {
      Object.keys(patch.triggers).forEach(function (k) {
        if (!patch.triggers[k]) return;
        if (reset || out.triggers[k] == null || filledKeys.length) {
          // Enable trigger when resetting, missing, or we just filled a related action.
          if (reset || out.triggers[k] == null) out.triggers[k] = true;
        }
      });
    }
    // Ensure triggers for newly filled actions.
    if (filledKeys.indexOf('shakeHead') >= 0) out.triggers.shake = true;
    if (filledKeys.indexOf('deliberateBlink') >= 0) out.triggers.blink = true;
    if (filledKeys.indexOf('openPalm') >= 0) out.triggers.openPalm = true;
    if (filledKeys.indexOf('okHand') >= 0) out.triggers.okHand = true;
    if (filledKeys.indexOf('fist') >= 0) out.triggers.fist = true;
    if (filledKeys.indexOf('wave') >= 0) out.triggers.wave = true;
    if (filledKeys.indexOf('onAway') >= 0 || filledKeys.indexOf('onReturn') >= 0) out.triggers.away = true;
    return out;
  }

  function applyCamera(m, opts) {
    var A = agent();
    if (!A || !A.cameraRecommendedPresencePatch) return;
    var patch = A.cameraRecommendedPresencePatch();
    var reset = !!opts.reset;
    var target = opts.cameraTarget || 'override';

    if (target === 'globalPrefs') {
      var cfg = global.OneToneState && global.OneToneState.state && global.OneToneState.state.config;
      if (!cfg) return;
      if (!cfg.cameraPrefs) cfg.cameraPrefs = {};
      var cur = cfg.cameraPrefs.presenceActions && typeof cfg.cameraPrefs.presenceActions === 'object'
        ? Object.assign({}, cfg.cameraPrefs.presenceActions)
        : {};
      cfg.cameraPrefs.presenceActions = applyCameraPatch(cur, patch, reset);
      var Cam = global.OneToneCameraPresenceActions;
      if (Cam && Cam.persist) {
        try { Cam.persist(cfg.cameraPrefs.presenceActions); } catch (_) {}
      } else {
        var p = global.OneToneConfigPersist;
        if (p && p.rememberCameraPrefs) {
          try { p.rememberCameraPrefs(); } catch (_) {}
        }
        if (p && p.saveCameraPrefsQuiet) p.saveCameraPrefsQuiet();
        else persist();
      }
      return;
    }

    // scenario override
    if (!m) return;
    var ov = m.cameraOverride && typeof m.cameraOverride === 'object'
      ? Object.assign({}, m.cameraOverride)
      : {};
    m.cameraOverride = applyCameraPatch(ov, patch, reset);
  }

  function applyCursorPackToMapping(m, opts) {
    opts = opts || {};
    var A = agent();
    if (!A || !m) return null;
    m.appTargetId = m.appTargetId || 'cursor-chat';
    m.agentProviderId = m.agentProviderId || 'cursor';
    return applyCodexPackToMapping(m, opts);
  }

  function applyVscodePackToMapping(m, opts) {
    opts = opts || {};
    var A = agent();
    if (!A || !m) return null;
    var app = String(m.appTargetId || '').trim();
    if (A.providerIdForApp) {
      m.agentProviderId = m.agentProviderId || A.providerIdForApp(app) || m.agentProviderId;
    }
    return applyCodexPackToMapping(m, opts);
  }

  /**
   * Unique write API for Codex pack.
   * @param {object|null} m mapping (required for keys/voice/override camera)
   * @param {{
   *   channels?: Array<'keys'|'voice'|'camera'>,
   *   essentialsOnly?: boolean,
   *   reset?: boolean,
   *   cameraTarget?: 'override'|'globalPrefs',
   *   enableProfile?: 'globalSafe'|'scenarioEssentials'|'scenarioAllKeys',
   *   setAppTarget?: boolean,
   *   persist?: boolean
   * }} opts
   */
  function applyCodexPackToMapping(m, opts) {
    opts = opts || {};
    var A = agent();
    if (!A) return null;
    var channels = opts.channels || ['keys', 'voice', 'camera'];
    var enableProfile = opts.enableProfile
      || (opts.cameraTarget === 'globalPrefs' ? 'globalSafe' : 'scenarioAllKeys');

    var channelOpts = {
      channels: channels,
      reset: !!opts.reset,
      enableProfile: enableProfile,
      setAppTarget: opts.setAppTarget !== false
    };

    if (channels.indexOf('keys') >= 0 || channels.indexOf('voice') >= 0) {
      if (!m) return null;
      applyKeysVoice(m, channelOpts);
    }
    if (channels.indexOf('camera') >= 0) {
      applyCamera(m, {
        reset: !!opts.reset,
        cameraTarget: opts.cameraTarget || 'override'
      });
    }

    if (m && global.OneToneAppBehaviorRules && (isCodexScenario(m) || isVscodeLineageScenario(m))) {
      if (global.OneToneAppBehaviorRules.ensureRules) global.OneToneAppBehaviorRules.ensureRules(m);
      if (global.OneToneAppBehaviorRules.ensurePrimaryAppRule) {
        global.OneToneAppBehaviorRules.ensurePrimaryAppRule(m, m.appTargetId || A.APP_TARGET_ID);
      }
    }

    if (opts.persist !== false) persist();
    return m;
  }

  /**
   * Habit hub recommend / apply.
   * @param {{ mode?: 'openExisting'|'createNew', reset?: boolean, openPanel?: 'keys'|'voice'|'camera'|false|'chooser' }} opts
   */
  function applyCodexMicro13(opts) {
    opts = opts || {};
    var A = agent();
    if (!A) {
      toast(t('habitCodexApplyMissing', '能力模块未加载'));
      return null;
    }
    var mode = opts.mode || 'openExisting';
    var result = mode === 'createNew' ? createNewCodexScenario() : findOrCreateCodexScenario();
    if (!result || !result.mapping) {
      toast(t('habitCodexApplyFailed', '无法创建 Codex 应用场景'));
      return null;
    }
    var m = result.mapping;
    var hadPack = hasCodexPack(m);

    applyCodexPackToMapping(m, {
      channels: ['keys', 'voice', 'camera'],
      essentialsOnly: false,
      reset: !!opts.reset || !hadPack,
      cameraTarget: 'override',
      enableProfile: opts.enableProfile || (
        opts.layoutProfile === 'beginner' ? 'scenarioEssentials' : 'scenarioAllKeys'
      ),
      setAppTarget: true,
      persist: true
    });

    var MicroPad = global.OneToneCodexMicroPadUi;
    if (MicroPad && MicroPad.applyLayoutProfile) {
      MicroPad.applyLayoutProfile(m, opts.layoutProfile || 'standard', { persist: true });
    } else if (MicroPad && MicroPad.ensurePad) {
      MicroPad.ensurePad(m, { persist: true });
    }
    if (m.codexMicroPad) {
      if (opts.enablePad !== false) m.codexMicroPad.enabled = true;
      if (opts.overlayEnabled !== false) m.codexMicroPad.overlayEnabled = true;
      m.codexMicroPad.softwareEnhanceEnabled = false;
    }

    toast(
      result.created
        ? t('habitCodexCreated', '已创建 Codex 应用场景 · 常用能力已准备好')
        : (opts.reset
          ? t('habitCodexReset', '已重置能力槽位 · 请重新录制快捷键')
          : t('habitCodexUpdated', '常用能力已准备好 · 点击录制你的快捷键'))
    );

    var panel = opts.openPanel;
    if (panel === false) return m;
    var banner = global.OneToneHabitScenarioContextBanner;
    if (!banner) return m;
    if (panel === 'voice' && banner.openScenarioVoiceEdit) {
      banner.openScenarioVoiceEdit(m.id, { returnToHub: true });
    } else if (panel === 'camera' && banner.openScenarioCameraEdit) {
      banner.openScenarioCameraEdit(m.id, { returnToHub: true });
    } else if (panel === 'chooser') {
      // Leave on hub; card has 改按键 / 配语音 / 配摄像头.
    } else if (banner.openScenarioKeysEdit && opts.openKeys !== false) {
      banner.openScenarioKeysEdit(m.id, { returnToHub: true });
    }
    return m;
  }

  /** @deprecated no-op — voice runtime reads agentBindings, not voiceCommands */
  function syncAgentVoiceCommands() {
    /* intentionally empty */
  }

  global.OneToneAgentScenarioTemplate = {
    applyCodexPackToMapping: applyCodexPackToMapping,
    applyCursorPackToMapping: applyCursorPackToMapping,
    applyVscodePackToMapping: applyVscodePackToMapping,
    applyCodexMicro13: applyCodexMicro13,
    findOrCreateCodexScenario: findOrCreateCodexScenario,
    findExistingCodexScenario: findExistingCodexScenario,
    createNewCodexScenario: createNewCodexScenario,
    ensurePackForMapping: ensurePackForMapping,
    fillEmptyKeyDefaults: fillEmptyKeyDefaults,
    realignCursorBindingsFromCodexDefaults: realignCursorBindingsFromCodexDefaults,
    isCodexScenario: isCodexScenario,
    isCursorScenario: isCursorScenario,
    isVscodeLineageScenario: isVscodeLineageScenario,
    hasCursorPack: hasCursorPack,
    hasVscodePack: hasVscodePack,
    hasCodexPack: hasCodexPack,
    syncAgentVoiceCommands: syncAgentVoiceCommands
  };
})(typeof window !== 'undefined' ? window : globalThis);
