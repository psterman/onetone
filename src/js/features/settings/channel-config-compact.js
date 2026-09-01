/** Legacy shim — channel toggles live in the OS tray menu, not settings pages. */
(function (global) {
  'use strict';

  function notifyChanged(detail) {
    try {
      global.dispatchEvent(new CustomEvent('channel-config:changed', { detail: detail || {} }));
    } catch (_) {}
  }

  global.OneToneChannelConfigCompact = {
    mount: function () { return Promise.resolve(); },
    mountAll: function () { return Promise.resolve(); },
    refresh: function () { return Promise.resolve(); },
    notifyChanged: notifyChanged,
    PANEL_MAP: {
      keys: 'settingsPanelKeys',
      voice: 'settingsPanelVoiceWake',
      softPad: 'settingsPanelSoftPad',
      camera: 'settingsPanelCamera'
    },
    DRAWER_PANEL: {
      keys: 'keys',
      voice: 'voiceWake',
      softPad: 'softPad',
      camera: 'camera'
    }
  };

  global.addEventListener('channel-config:changed', function () {
    if (global.OneToneChannelConfigOverview && global.OneToneChannelConfigOverview.refresh) {
      global.OneToneChannelConfigOverview.refresh();
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
