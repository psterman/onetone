/**
 * Phase3a：录制 IPC 生命周期。
 * UI / MediaRecorder / SoftPad 应围绕这些相位；setRecording 经 transition() 强制 canTransition。
 */
(function (global) {
  'use strict';

  var PHASES = {
    idle: 'idle',
    starting: 'starting',
    recording: 'recording',
    stopping: 'stopping',
    ready: 'ready',
    cancelled: 'cancelled',
    error: 'error',
  };

  var ALLOWED = {
    idle: ['starting'],
    starting: ['recording', 'error', 'cancelled'],
    recording: ['stopping', 'error', 'cancelled'],
    stopping: ['ready', 'error', 'cancelled'],
    ready: ['idle', 'starting'],
    cancelled: ['idle', 'starting'],
    error: ['idle', 'starting'],
  };

  var currentPhase = PHASES.idle;

  function normalize(phase) {
    phase = String(phase || 'idle').toLowerCase();
    return PHASES[phase] || PHASES.idle;
  }

  function canTransition(from, to) {
    from = normalize(from);
    to = normalize(to);
    if (from === to) return true;
    var next = ALLOWED[from] || [];
    return next.indexOf(to) >= 0;
  }

  function fromLegacyRecordingMode(mode) {
    mode = String(mode || 'none');
    if (mode === 'none' || !mode) return PHASES.idle;
    if (mode === 'trigger' || mode === 'target' || mode === 'agentBinding' || mode === 'padBind') return PHASES.recording;
    return PHASES.idle;
  }

  /**
   * Legacy bool modes collapse to idle/recording. Bridge via starting/stopping when possible.
   */
  function resolveTargetPhase(mode, opts) {
    opts = opts || {};
    if (opts.error) return PHASES.error;
    if (opts.cancelled) return PHASES.cancelled;
    var legacy = fromLegacyRecordingMode(mode);
    var from = normalize(currentPhase);
    if (legacy === PHASES.recording) {
      if (from === PHASES.idle || from === PHASES.ready || from === PHASES.cancelled || from === PHASES.error) {
        return PHASES.starting;
      }
      if (from === PHASES.starting) return PHASES.recording;
      return PHASES.recording;
    }
    // stop path
    if (from === PHASES.recording || from === PHASES.starting) return PHASES.stopping;
    if (from === PHASES.stopping) return PHASES.ready;
    return PHASES.idle;
  }

  function transition(to, extra) {
    to = normalize(to);
    var from = normalize(currentPhase);
    if (!canTransition(from, to)) {
      // Force to idle then retry once for recoverability (avoid permanent stuck).
      if (to !== PHASES.idle && canTransition(PHASES.idle, to === PHASES.recording ? PHASES.starting : to)) {
        currentPhase = PHASES.idle;
        from = PHASES.idle;
        if (to === PHASES.recording) to = PHASES.starting;
      } else if (!canTransition(from, to)) {
        try {
          console.warn('[record-ipc] blocked transition', from, '→', to);
        } catch (_) {}
        return currentPhase;
      }
    }
    currentPhase = to;
    var ev = toPublicEvent(to, extra);
    try {
      global.__otRecordIpcPhase = to;
      if (typeof global.dispatchEvent === 'function') {
        global.dispatchEvent(new CustomEvent('ot:record-ipc', { detail: ev }));
      }
    } catch (_) {}
    return currentPhase;
  }

  function applyLegacyMode(mode, opts) {
    opts = opts || {};
    var target = resolveTargetPhase(mode, opts);
    var phase = transition(target, { mode: mode || 'none' });
    // Auto-advance starting→recording and stopping→ready/idle on same tick for legacy callers.
    if (phase === PHASES.starting && !opts.error && !opts.cancelled) {
      phase = transition(PHASES.recording, { mode: mode || 'none' });
    }
    if (phase === PHASES.stopping && !opts.error && !opts.cancelled) {
      phase = transition(PHASES.ready, { mode: mode || 'none' });
      phase = transition(PHASES.idle, { mode: 'none' });
    }
    return phase;
  }

  function toPublicEvent(phase, extra) {
    phase = normalize(phase);
    return Object.assign(
      {
        type: 'record_ipc',
        phase: phase,
        ts: Date.now(),
      },
      extra || {},
    );
  }

  function isBusy(phase) {
    phase = normalize(phase || currentPhase);
    return (
      phase === PHASES.starting ||
      phase === PHASES.recording ||
      phase === PHASES.stopping
    );
  }

  /** UI「是否在录」：优先相位，legacy mode 仅作回退。 */
  function isRecordingUi(mode, phase) {
    phase = normalize(phase || currentPhase || global.__otRecordIpcPhase);
    if (isBusy(phase)) return true;
    mode = String(mode || 'none');
    return mode === 'trigger' || mode === 'target' || mode === 'agentBinding' || mode === 'padBind';
  }

  function getPhase() {
    return normalize(currentPhase);
  }

  global.OneToneRecordIpcLifecycle = {
    PHASES: PHASES,
    normalize: normalize,
    canTransition: canTransition,
    fromLegacyRecordingMode: fromLegacyRecordingMode,
    resolveTargetPhase: resolveTargetPhase,
    transition: transition,
    applyLegacyMode: applyLegacyMode,
    toPublicEvent: toPublicEvent,
    getPhase: getPhase,
    isBusy: isBusy,
    isRecordingUi: isRecordingUi,
  };
})(typeof window !== 'undefined' ? window : globalThis);
