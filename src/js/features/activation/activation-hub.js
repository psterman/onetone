/**
 * Activation Hub — SoftPad 激活窗信号台（方案 A）
 *
 * 开窗：听写 session_started（或 voice_wake_triggered）
 * 关窗：session_ended / 手动 deactivate
 * 不改写 Agent PadStatus；仅广播 activation:* 供摄像头门闩与迷你栏次行使用。
 */
(function (global) {
  'use strict';

  /** @type {'idle'|'listen'|'watch'|'think'|'done'} */
  var phase = 'idle';
  var session = null;
  var tickTimer = 0;
  var doneTimer = 0;
  var listeners = {};

  var DEFAULT_TIMEOUT_MS = 120000;
  var DEFAULT_SOFT_CLOSE_MS = 10000;

  function on(event, cb) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
    return function off() {
      var set = listeners[event];
      if (!set) return;
      var i = set.indexOf(cb);
      if (i >= 0) set.splice(i, 1);
    };
  }

  function emit(event, payload) {
    var set = listeners[event];
    if (!set || !set.length) return;
    for (var i = 0; i < set.length; i++) {
      try {
        set[i](payload);
      } catch (e) {
        console.error('[activation-hub] listener error', event, e);
      }
    }
  }

  function normalizeWindows(win) {
    win = win || {};
    return {
      timeoutMs: Math.max(3000, Number(win.timeoutMs) || DEFAULT_TIMEOUT_MS),
      softCloseMs: Math.max(1000, Number(win.softCloseMs) || DEFAULT_SOFT_CLOSE_MS),
    };
  }

  function activate(payload) {
    payload = payload || {};
    var windows = normalizeWindows(payload.windows);
    var startedAt = Number(payload.startedAt) || Date.now();
    if (session) {
      session.windows = windows;
      session.startedAt = startedAt;
      session.source = payload.source || session.source;
      emit('activation:refresh', session);
      startTickTimer();
      return session;
    }
    session = {
      source: payload.source || 'session',
      trigger: payload.trigger || null,
      windows: windows,
      startedAt: startedAt,
    };
    phase = 'listen';
    emit('activation:on', session);
    emit('activation:phase', { phase: phase, enteredAt: Date.now() });
    startTickTimer();
    return session;
  }

  function deactivate(reason) {
    if (!session) return;
    var durationMs = Date.now() - session.startedAt;
    stopTickTimer();
    if (doneTimer) {
      clearTimeout(doneTimer);
      doneTimer = 0;
    }
    var offPayload = {
      reason: reason || 'manual',
      durationMs: durationMs,
      endedAt: Date.now(),
    };
    phase = 'done';
    emit('activation:phase', { phase: 'done', enteredAt: Date.now() });
    emit('activation:off', offPayload);
    session = null;
    doneTimer = setTimeout(function () {
      doneTimer = 0;
      phase = 'idle';
      emit('activation:phase', { phase: 'idle', enteredAt: Date.now() });
    }, 400);
  }

  function setPhase(next, payload) {
    if (!session || phase === next) return;
    phase = next;
    emit(
      'activation:phase',
      Object.assign({ phase: next, enteredAt: Date.now() }, payload || {})
    );
  }

  function reportError(source, code, message, fatal) {
    emit('activation:error', {
      source: source,
      code: code,
      message: message,
      fatal: !!fatal,
    });
    if (fatal) deactivate('error');
  }

  function getPhase() {
    return phase;
  }
  function getSession() {
    return session;
  }
  function isActive() {
    return !!session;
  }

  function remainingMs() {
    if (!session) return 0;
    return Math.max(0, session.windows.timeoutMs - (Date.now() - session.startedAt));
  }

  function startTickTimer() {
    stopTickTimer();
    if (!session) return;
    tickTimer = setInterval(function () {
      if (!session) return;
      var remaining = remainingMs();
      var softClose = remaining <= session.windows.softCloseMs;
      emit('activation:tick', { remainingMs: remaining, inSoftClose: softClose });
      if (remaining <= 0) {
        // Session timeout is owned by Rust dictation; Hub only mirrors. Don't force-cancel here.
        emit('activation:tick', { remainingMs: 0, inSoftClose: true });
      }
    }, 1000);
  }

  function stopTickTimer() {
    if (tickTimer) {
      clearInterval(tickTimer);
      tickTimer = 0;
    }
  }

  function kindOf(evt) {
    return String((evt && (evt.kind || evt.Kind)) || '').toLowerCase();
  }

  function sourceOf(evt) {
    return String((evt && (evt.source || evt.Source)) || '').toLowerCase();
  }

  /** Consume structured runtime event from main webview bus. */
  function onRuntimeEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    var kind = kindOf(evt);
    var source = sourceOf(evt);
    if (kind === 'session_started' || (source === 'session' && kind.indexOf('started') >= 0)) {
      activate({
        source: 'session',
        trigger: { message: evt.message || '' },
        windows: { timeoutMs: DEFAULT_TIMEOUT_MS, softCloseMs: DEFAULT_SOFT_CLOSE_MS },
        startedAt: Date.now(),
      });
      return;
    }
    if (kind === 'voice_wake_triggered') {
      // Wake may precede session_started; open listen early.
      if (!session) {
        activate({
          source: 'voice-wake',
          trigger: { message: evt.message || '' },
          windows: { timeoutMs: DEFAULT_TIMEOUT_MS, softCloseMs: DEFAULT_SOFT_CLOSE_MS },
          startedAt: Date.now(),
        });
      }
      return;
    }
    if (kind === 'session_ended' || (source === 'session' && kind.indexOf('ended') >= 0)) {
      var msg = String(evt.message || '').toLowerCase();
      var reason = 'commit';
      if (msg.indexOf('cancel') >= 0) reason = 'cancel';
      else if (msg.indexOf('timeout') >= 0) reason = 'timeout';
      deactivate(reason);
    }
  }

  function bindWebviewBus() {
    // Prefer explicit call from webview-bus; keep no-op hook for tests.
  }

  global.OneToneActivationHub = {
    on: on,
    activate: activate,
    deactivate: deactivate,
    setPhase: setPhase,
    reportError: reportError,
    getPhase: getPhase,
    getSession: getSession,
    isActive: isActive,
    remainingMs: remainingMs,
    onRuntimeEvent: onRuntimeEvent,
    _bindIpcEvents: bindWebviewBus,
  };
})(typeof window !== 'undefined' ? window : globalThis);
