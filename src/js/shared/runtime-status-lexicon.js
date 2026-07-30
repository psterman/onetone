/**
 * Phase2b：home / HUD / tray 共用状态协议（字段少，防噪音）。
 * Tokens：idle + paused / listening / dictating / error / triggered / needsSetup
 * Wire：statusToken + statusText + triggerText + targetText + repairText
 *       + canPause + canResume + lastEventText (+ ts)
 */
(function (global) {
  'use strict';

  var TOKENS = {
    idle: { labelKey: 'homeStatusTapToStart', trayQuiet: true },
    listening: { labelKey: 'homeStatusListening', trayQuiet: false },
    dictating: { labelKey: 'chipDictating', trayQuiet: false },
    paused: { labelKey: 'homeStatusPaused', trayQuiet: false },
    error: { labelKey: 'homeWbTriggerError', trayQuiet: false },
    triggered: { labelKey: 'homeWbTriggerLive', trayQuiet: false, ephemeral: true },
    needsSetup: { labelKey: 'homeSetupStart', trayQuiet: false },
  };

  var CONTENT_KEYS = [
    'statusToken',
    'statusText',
    'triggerText',
    'targetText',
    'repairText',
    'canPause',
    'canResume',
    'lastEventText',
  ];

  function normalize(token) {
    token = String(token || 'idle').toLowerCase();
    // Back-compat: older 'trigger' → 'triggered'
    if (token === 'trigger') token = 'triggered';
    // Preserve camelCase wire token (toLowerCase would break the key).
    if (token === 'needssetup') return 'needsSetup';
    return TOKENS[token] ? token : 'idle';
  }

  function fromHomeBits(bits) {
    bits = bits || {};
    if (bits.paused) return 'paused';
    if (bits.dictating) return 'dictating';
    if (bits.triggered) return 'triggered';
    var mode = String(bits.statusMode || '').toLowerCase();
    if (mode === 'error') return 'error';
    if (mode === 'triggered' || mode === 'success') return 'triggered';
    if (bits.needsSetup || mode === 'needs_setup' || mode === 'needssetup') return 'needsSetup';
    if (mode === 'listening' || mode === 'active' || mode === 'ready') return 'listening';
    if (mode === 'warn') return 'listening';
    return 'idle';
  }

  function labelFor(token) {
    token = normalize(token);
    var meta = TOKENS[token];
    var t = global.OneToneI18n && global.OneToneI18n.t;
    return t ? t(meta.labelKey) : meta.labelKey;
  }

  function str(v) {
    return v == null ? '' : String(v);
  }

  /**
   * Locked wire snapshot. One-version compat: also mirrors label/detail.
   * @param {object} model workbench bits or prior snapshot fields
   */
  function protocolSnapshot(model) {
    model = model || {};
    var token = normalize(model.statusToken || fromHomeBits(model));
    var statusText =
      str(model.statusText) ||
      str(model.statusLine) ||
      str(model.label) ||
      labelFor(token);
    var triggerText =
      str(model.triggerText) ||
      str(model.triggerLabel) ||
      str(model.detail) ||
      '';
    var targetText = str(model.targetText) || str(model.targetLabel) || '';
    var repairText = '';
    if (model.repairText != null && str(model.repairText)) {
      repairText = str(model.repairText);
    } else if (model.repair && model.repair.label) {
      repairText = str(model.repair.label);
    } else if (token === 'error') {
      repairText = labelFor('error');
    }

    var paused = token === 'paused' || !!model.paused;
    var canResume = typeof model.canResume === 'boolean' ? !!model.canResume : paused;
    var canPause =
      typeof model.canPause === 'boolean'
        ? !!model.canPause
        : !paused && token !== 'needsSetup';

    var lastEventText = str(model.lastEventText);
    if (!lastEventText) {
      if (token === 'triggered' || token === 'error') {
        lastEventText = statusText || triggerText;
      }
    }

    var snap = {
      statusToken: token,
      statusText: statusText,
      triggerText: triggerText,
      targetText: targetText,
      repairText: repairText,
      canPause: !!canPause,
      canResume: !!canResume,
      lastEventText: lastEventText,
      ts: Date.now(),
      // One-version wire compat for older tray/HUD consumers
      label: statusText,
      detail: triggerText,
      quiet: !!TOKENS[token].trayQuiet,
      ephemeral: !!TOKENS[token].ephemeral,
    };
    return snap;
  }

  /**
   * Build protocol from workbench inputs (token already decided + surface texts).
   */
  function buildFromWorkbenchInputs(bits) {
    bits = bits || {};
    return protocolSnapshot({
      statusToken: bits.statusToken,
      statusLine: bits.statusText || bits.statusLine,
      triggerLabel: bits.triggerText || bits.triggerLabel,
      targetLabel: bits.targetText || bits.targetLabel,
      repair: bits.repairText
        ? { label: bits.repairText }
        : bits.repair || null,
      paused: !!bits.paused,
      lastEventText: bits.lastEventText,
      canPause: bits.canPause,
      canResume: bits.canResume,
    });
  }

  global.OneToneRuntimeStatusLexicon = {
    TOKENS: TOKENS,
    CONTENT_KEYS: CONTENT_KEYS,
    normalize: normalize,
    fromHomeBits: fromHomeBits,
    labelFor: labelFor,
    protocolSnapshot: protocolSnapshot,
    buildFromWorkbenchInputs: buildFromWorkbenchInputs,
  };
})(typeof window !== 'undefined' ? window : globalThis);
