(function (global) {
  'use strict';

  var PANEL_MAP = {
    keys: 'settingsPanelKeys',
    voice: 'settingsPanelVoiceWake',
    softPad: 'settingsPanelSoftPad',
    camera: 'settingsPanelCamera'
  };

  var DRAWER_PANEL = {
    keys: 'keys',
    voice: 'voiceWake',
    softPad: 'softPad',
    camera: 'camera'
  };

  function $(id) { return document.getElementById(id); }

  function notifyChanged(detail) {
    try {
      global.dispatchEvent(new CustomEvent('channel-config:changed', { detail: detail || {} }));
    } catch (_) {}
  }

  var RENDER_CHANNELS = ['keys', 'voice', 'softPad', 'camera'];

  function mount(channel) {
    var hostId = channel === 'voice' ? 'channelConfigCompactVoice' : 'channelConfigCompact' + channel.charAt(0).toUpperCase() + channel.slice(1);
    var host = $(hostId);
    var TCC = global.OneToneTrayChannelControls;
    if (!host || !TCC || !TCC.renderCompactGroup) return Promise.resolve();
    return TCC.renderCompactGroup(host, channel).then(function () {
      host.classList.add('channel-config-compact');
      host.setAttribute('data-component', 'settings-panel-compact');
      host.setAttribute('data-channel', channel);
    });
  }

  function mountAll() {
    var TCC = global.OneToneTrayChannelControls;
    if (!TCC || !TCC.loadTrayLayout) return Promise.all(RENDER_CHANNELS.map(mount));
    return TCC.loadTrayLayout().then(function () {
      return Promise.all(RENDER_CHANNELS.map(mount));
    });
  }

  function refresh(channel) {
    if (channel) return mount(channel);
    return mountAll();
  }

  global.OneToneChannelConfigCompact = {
    mount: mount,
    mountAll: mountAll,
    refresh: refresh,
    notifyChanged: notifyChanged,
    saveCustomization: function () {
      var TCC = global.OneToneTrayChannelControls;
      return TCC && TCC.saveCustomization ? TCC.saveCustomization() : Promise.resolve();
    },
    saveMappingConfig: function (source) {
      var persist = global.OneToneConfigPersist;
      if (persist && persist.save) {
        return Promise.resolve(persist.save({ source: source || 'channel-config-compact' })).then(function () {
          notifyChanged({ source: 'config' });
        });
      }
      notifyChanged({ source: 'config' });
      return Promise.resolve();
    },
    PANEL_MAP: PANEL_MAP,
    DRAWER_PANEL: DRAWER_PANEL
  };

  global.addEventListener('channel-config:changed', function () {
    if (global.OneToneChannelConfigOverview && global.OneToneChannelConfigOverview.refresh) {
      global.OneToneChannelConfigOverview.refresh();
    }
  });

  function boot() {
    mountAll().catch(function () {});
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
