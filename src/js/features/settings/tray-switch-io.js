/**
 * Tray switch IO facade — re-exports read/write from OneToneTrayChannelControls.
 */
(function (global) {
  'use strict';

  function api() {
    var TCC = global.OneToneTrayChannelControls;
    if (!TCC) return null;
    var os = TCC.getOsCtx ? TCC.getOsCtx() : {};
    return {
      readControlValue: TCC.readControlValue.bind(TCC),
      writeControlValue: TCC.writeControlValue.bind(TCC),
      findControlById: TCC.findControlById.bind(TCC),
      hydrateOsContext: TCC.hydrateOsContext.bind(TCC),
      getConfig: function () { var o = TCC.getOsCtx(); return o.config; },
      getMapping: function () { var o = TCC.getOsCtx(); return o.mapping; },
      getVoiceEnd: function () { var o = TCC.getOsCtx(); return o.voiceEnd; },
      getOpenOsChannel: function () { return TCC.getOpenOsChannel(); },
      setOpenOsChannel: function (ch) { TCC.setOpenOsChannel(ch); },
      controlsForSurface: function (ch, surface) { return TCC.getChannelControls(ch, surface); },
      traySceneLine: function (channel, state, ch) {
        var g = state && state.global;
        var fg = g && String(g.foregroundLabel || g.foregroundOsDebug || '').trim();
        var meta = String((ch && ch.meta) || '');
        if (channel === 'keys') {
          if (fg && fg !== '—') return meta && meta !== '未启用' ? fg + ' · ' + meta : fg;
          var ul = String(g.userLabel || '').trim();
          var hl = String(g.activeHabitLabel || '').trim();
          if (ul && ul !== '—') return hl && hl !== '—' && hl !== ul ? ul + ' · ' + hl : ul;
          if (hl && hl !== '—') return hl;
        }
        return meta;
      },
      t: function (key, fb) {
        var i18n = global.OneToneI18n;
        if (i18n && i18n.t) {
          var v = i18n.t(key, fb);
          if (v && v !== key) return v;
        }
        return fb || key;
      },
      invoke: function (cmd, args) {
        var ipc = global.OneToneIpc;
        return ipc && ipc.invoke ? ipc.invoke(cmd, args) : Promise.resolve();
      },
      loadTrayLayout: function () { return TCC.loadTrayLayout(); },
      syncAllSurfaces: function (ch) { return TCC.syncAllSurfaces(ch); },
      openSettingsPanel: function (panel) {
        var drawer = global.OneToneSettingsDrawer;
        if (drawer && drawer.open) drawer.open({ panel: panel });
        else if (drawer && drawer.openSettings) drawer.openSettings({ panel: panel });
      },
      SETTINGS_PANEL: TCC.SETTINGS_PANEL
    };
  }

  global.OneToneTraySwitchIo = {
    api: api
  };
})(typeof window !== 'undefined' ? window : globalThis);
