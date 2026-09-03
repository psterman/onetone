(function (global) {
  'use strict';

  var PAGES = {
    voice: 'channel-voice.html',
    keys: 'channel-keys.html',
    softPad: 'channel-softpad.html',
    camera: 'channel-camera.html'
  };

  var ICONS = {
    voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>',
    keys: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>',
    softPad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
  };

  var CHANNELS = {
    voice: {
      label: '说话',
      title: '说话通道',
      tag: 'Voice',
      statusReady: '待命 · 唤醒词：<strong>嘿 Cursor</strong>',
      statusFirst: '未配置 · 先设置唤醒词或麦克风',
      statusDictating: '听写中 · <strong>正在写入 Cursor</strong>',
      ctaReady: '开始听写',
      ctaFirst: '配置语音',
      ctaDictating: '说完了',
      mic: true,
      off: false,
      rows: [
        { label: '唤醒词', value: '嘿 Cursor' },
        { label: '麦克风', value: 'Realtek Audio' },
        { label: '说完后', value: '自动发送' }
      ],
      link: '打开语音设置 →'
    },
    keys: {
      label: '按键',
      title: '按键通道',
      tag: 'Keys',
      statusReady: '就绪 · <strong>F9</strong> → Ctrl+Shift+Space',
      statusFirst: '未配置 · 先绑定触发键',
      statusDictating: '按键触发中 · <strong>F9 按住</strong>',
      ctaReady: '测试按键',
      ctaFirst: '配置触发键',
      ctaDictating: '说完了',
      mic: false,
      off: false,
      rows: [
        { label: '触发键', value: 'F9（单击）' },
        { label: '目标输入法', value: 'Ctrl+Shift+Space' },
        { label: '说完后', value: '自动发送' }
      ],
      link: '打开按键设置 →'
    },
    softPad: {
      label: '屏幕按钮',
      title: '屏幕按钮通道',
      tag: 'SoftPad',
      statusReady: '已配置 · 3 个动作槽',
      statusFirst: '未配置 · 添加屏幕按钮',
      statusDictating: 'SoftPad 激活中',
      ctaReady: '打开 SoftPad',
      ctaFirst: '配置 SoftPad',
      ctaDictating: '关闭',
      mic: false,
      off: true,
      rows: [
        { label: '动作槽', value: '发送 / 换行 / 取消', empty: false },
        { label: '托盘显示', value: '已开启' },
        { label: '前台应用', value: 'Cursor' }
      ],
      link: '打开虚拟键盘设置 →'
    },
    camera: {
      label: '摄像头',
      title: '摄像头通道',
      tag: 'Camera',
      statusReady: '运行中 · 摇头 → <strong>取消</strong>',
      statusFirst: '未启用 · 打开摄像头权限',
      statusDictating: '摄像头监听中 · 检测到手势',
      ctaReady: '打开 Camera Pro',
      ctaFirst: '启用摄像头',
      ctaDictating: '暂停',
      mic: false,
      off: true,
      rows: [
        { label: '摇头', value: '→ 取消听写' },
        { label: '闭眼', value: '→ 暂停语音' },
        { label: '回席', value: '→ 恢复语音' }
      ],
      link: '打开摄像头设置 →'
    }
  };

  function waveHtml() {
    var hs = [1, 1.5, 2, 3, 4, 6, 9, 12, 9, 6, 4, 3, 2, 1.5, 1];
    return hs.map(function (h, i) {
      return '<span style="--h:' + h + ';--i:' + i + '"></span>';
    }).join('');
  }

  function renderChannelNav(current) {
    var nav = document.getElementById('protoChannelNav');
    if (!nav) return;
    nav.innerHTML = Object.keys(PAGES).map(function (id) {
      var ch = CHANNELS[id];
      var cls = id === current ? ' class="is-current"' : '';
      return '<a href="' + PAGES[id] + '"' + cls + '>' + ch.label + '</a>';
    }).join('');
  }

  function renderTabs(current) {
    var host = document.getElementById('channelTabs');
    if (!host) return;
    host.innerHTML = Object.keys(PAGES).map(function (id) {
      var ch = CHANNELS[id];
      var cls = 'channel-tab';
      if (id === current) cls += ' is-active';
      if (ch.off && id !== current) cls += ' is-off';
      if (ch.off && id === current) cls += ' is-off is-active';
      var href = id === current ? '#' : PAGES[id];
      return '<a class="' + cls + '" href="' + href + '" role="tab" aria-selected="' + (id === current ? 'true' : 'false') + '">'
        + ICONS[id] + '<span>' + ch.label + '</span></a>';
    }).join('');
  }

  function renderPage(channelId, appState) {
    var ch = CHANNELS[channelId];
    if (!ch) return;

    document.title = 'OneTone 首页原型 · ' + ch.label + '通道';
    var tag = document.getElementById('protoTag');
    if (tag) tag.textContent = ch.tag;

    var hero = document.getElementById('heroWrap');
    if (hero) {
      hero.setAttribute('data-channel', channelId);
      hero.classList.toggle('is-idle', appState !== 'dictating');
      hero.classList.toggle('is-dictating', appState === 'dictating');
    }

    var waveLeft = document.getElementById('waveLeft');
    var waveRight = document.getElementById('waveRight');
    if (waveLeft) waveLeft.innerHTML = waveHtml();
    if (waveRight) waveRight.innerHTML = waveHtml();

    var orb = document.getElementById('orb');
    if (orb) {
      orb.innerHTML = ICONS[channelId];
      orb.setAttribute('aria-label', ch.title);
    }

    var statusKey = appState === 'dictating' ? 'statusDictating' : (appState === 'first-run' ? 'statusFirst' : 'statusReady');
    var statusEl = document.getElementById('heroStatus');
    if (statusEl) statusEl.innerHTML = ch[statusKey];

    var ctaKey = appState === 'dictating' ? 'ctaDictating' : (appState === 'first-run' ? 'ctaFirst' : 'ctaReady');
    var ctaRow = document.getElementById('ctaRow');
    if (ctaRow) {
      var html = '<button type="button" class="cta-primary">' + ch[ctaKey] + '</button>';
      if (appState === 'dictating') html += '<button type="button" class="cta-secondary">取消，不要了</button>';
      ctaRow.innerHTML = html;
    }

    var micRow = document.getElementById('micRow');
    if (micRow) {
      if (ch.mic && appState !== 'first-run') {
        micRow.hidden = false;
        micRow.innerHTML = '<span class="mic-chip"><span class="dot"></span> 麦克风可用</span><span class="mic-chip">Vosk</span>';
      } else {
        micRow.hidden = true;
        micRow.innerHTML = '';
      }
    }

    var panel = document.getElementById('detailPanel');
    if (panel) {
      var rows = ch.rows;
      if (appState === 'first-run' && ch.off) {
        rows = [
          { label: '状态', value: '未配置', empty: true },
          { label: '动作', value: '—', empty: true },
          { label: '提示', value: '完成快速入门后启用', empty: true }
        ];
      }
      panel.innerHTML =
        '<div class="detail-head">'
        + '<h3 class="detail-title">' + ICONS[channelId] + ' ' + ch.title + '</h3>'
        + '<button type="button" class="detail-edit">编辑</button>'
        + '</div>'
        + '<dl class="detail-rows">'
        + rows.map(function (r) {
          return '<div class="detail-row"><dt>' + r.label + '</dt><dd' + (r.empty ? ' class="is-empty"' : '') + '>' + r.value + '</dd></div>';
        }).join('')
        + '</dl>'
        + '<a href="#" class="detail-link" onclick="return false">' + ch.link + '</a>';
    }

    renderChannelNav(channelId);
    renderTabs(channelId);

    document.querySelectorAll('[data-app-state]').forEach(function (btn) {
      btn.classList.toggle('is-on', btn.getAttribute('data-app-state') === appState);
    });

    var settingsBtn = document.getElementById('btnSettings');
    if (settingsBtn) settingsBtn.hidden = appState === 'first-run';
  }

  function boot() {
    var channel = document.body.getAttribute('data-channel') || 'voice';
    var appState = document.body.getAttribute('data-app-state') || 'ready';
    renderPage(channel, appState);

    document.querySelectorAll('[data-app-state]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.body.setAttribute('data-app-state', btn.getAttribute('data-app-state'));
        renderPage(channel, btn.getAttribute('data-app-state'));
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.OneToneHomeProto = { CHANNELS: CHANNELS, PAGES: PAGES, renderPage: renderPage };
})(window);
