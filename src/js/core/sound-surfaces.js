/**
 * Soft Pad / Agent related-surface visibility for when_unseen sound policy.
 * Window focus alone is not enough — Agent panel or overlay counts as seen.
 */
(function (global) {
  'use strict';

  function drawerOpen() {
    try {
      var ui = global.OneToneState && global.OneToneState.ui;
      return !!(ui && ui.drawerOpen);
    } catch (_) {
      return false;
    }
  }

  function settingsPanel() {
    try {
      var ui = global.OneToneState && global.OneToneState.ui;
      return ui && ui.settingsPanel ? String(ui.settingsPanel) : '';
    } catch (_) {
      return '';
    }
  }

  function softPadPanelOpen() {
    if (!drawerOpen()) return false;
    var p = settingsPanel();
    return p === 'softPad' || p === 'habits';
  }

  function softPadOverlayVisible() {
    try {
      if (global.__otSoftPadOverlayVisible) return true;
    } catch (_) {}
    try {
      var hub = global.OneToneSoftPadHub;
      if (hub && typeof hub.isOverlayVisible === 'function') return !!hub.isOverlayVisible();
    } catch (_) {}
    return false;
  }

  function homeSoftPadHeroActive() {
    try {
      var wb = global.OneToneHomeWorkbench;
      if (!wb || typeof wb.getHeroMode !== 'function') return false;
      if (drawerOpen()) return false;
      return wb.getHeroMode() === 'softPad';
    } catch (_) {
      return false;
    }
  }

  /** True when the user can already see Agent / Soft Pad feedback (suppress when_unseen). */
  function agentFeedbackSeen() {
    // Overlay / Soft Pad panel can be seen while the main window is hidden — check first.
    if (softPadOverlayVisible()) return true;
    if (softPadPanelOpen()) return true;
    if (homeSoftPadHeroActive()) return true;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    return false;
  }

  function windowBackgrounded() {
    try {
      if (typeof document === 'undefined') return true;
      if (document.visibilityState === 'hidden') return true;
      if (typeof document.hasFocus === 'function' && !document.hasFocus()) return true;
      return false;
    } catch (_) {
      return true;
    }
  }

  function deviceAlertSeen() {
    // Device alerts: any focused visible OneTone chrome counts as seen.
    return !windowBackgrounded();
  }

  global.OneToneSoundSurfaces = {
    agentFeedbackSeen: agentFeedbackSeen,
    deviceAlertSeen: deviceAlertSeen,
    softPadPanelOpen: softPadPanelOpen,
    softPadOverlayVisible: softPadOverlayVisible,
    windowBackgrounded: windowBackgrounded,
    setOverlayVisible: function (v) {
      try {
        global.__otSoftPadOverlayVisible = !!v;
      } catch (_) {}
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
