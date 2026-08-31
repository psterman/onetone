(function (global) {
  'use strict';

  var CHANNELS = [
    { id: 'voice', panel: 'voiceWake', label: '语音' },
    { id: 'keys', panel: 'keys', label: '按键' },
    { id: 'softPad', panel: 'softPad', label: '小键盘' },
    { id: 'camera', panel: 'camera', label: '摄像头' }
  ];

  function $(id) { return document.getElementById(id); }
  function invoke(cmd) {
    var ipc = global.OneToneIpc;
    return ipc && ipc.invoke ? ipc.invoke(cmd) : Promise.resolve('{}');
  }

  function channelFromTray(channels, id) {
    if (!channels || !channels.length) return null;
    return channels.find(function (c) { return c && (c.id === id || c.id === (id === 'softPad' ? 'softPad' : id)); }) || null;
  }

  function openPanel(panel) {
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.openDrawer) drawer.openDrawer({ panel: panel });
    else if (drawer && drawer.open) drawer.open({ panel: panel });
  }

  function render() {
    var host = $('channelConfigOverview');
    if (!host) return;
    host.classList.add('channel-config-overview');
    host.setAttribute('data-component', 'home-overview');
    host.innerHTML = '<div class="cco-grid" role="list"></div>';
    var grid = host.querySelector('.cco-grid');

    Promise.all([
      invoke('cmd_tray_menu_ready'),
      invoke('cmd_tray_customization_get').catch(function () { return null; })
    ]).then(function (res) {
      var raw = res[0];
      var data = typeof raw === 'string' ? JSON.parse(raw) : (raw || {});
      var channels = data.channels || [];
      CHANNELS.forEach(function (ch) {
        var c = channelFromTray(channels, ch.id);
        var st = 'off';
        var stText = '未启用';
        if (c && c.enabled) {
          if (c.state === 'error') { st = 'warn'; stText = '异常'; }
          else if (c.state === 'off') { st = 'off'; stText = '未启用'; }
          else if (c.state === 'listening' || c.state === 'standby') { st = ''; stText = c.state === 'listening' ? '工作中' : '待命'; }
          else { stText = c.meta || '—'; }
        }
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'cco-card';
        card.setAttribute('data-nav', ch.panel);
        card.innerHTML = '<div class="cco-card__head"><span class="cco-card__name">' + ch.label + '</span>'
          + '<span class="cco-card__st ' + st + '">' + stText + '</span></div>'
          + '<div class="cco-card__meta">' + (c && c.meta ? String(c.meta).replace(/</g, '') : '—') + '</div>';
        card.addEventListener('click', function () { openPanel(ch.panel); });
        grid.appendChild(card);
      });
    }).catch(function () {
      host.innerHTML = '';
    });
  }

  global.OneToneChannelConfigOverview = {
    render: render,
    refresh: render
  };

  global.addEventListener('channel-config:changed', function () {
    render();
  });

  function boot() {
    render();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
