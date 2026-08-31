/**
 * Shared tray footer — OS tray + settings preview.
 * Layout matches tray-editor-subtabs-prototype (tray-ft--nav).
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s || '').replace(/</g, '&lt;');
  }

  function trayIcons() {
    return (global.OneToneIcons && global.OneToneIcons.tray) || {};
  }

  function iconFor(id) {
    var ICONS = trayIcons();
    if (id === 'settings') return ICONS.settings || '';
    if (id === 'habits') return ICONS.keys || '';
    if (id === 'quit') return ICONS.quit || '';
    return ICONS.open || '';
  }

  function defaultLinks() {
    return [
      { id: 'main', label: '主窗口', href: 'main:home' },
      { id: 'habits', label: '习惯', href: 'main:habits' },
      { id: 'settings', label: '设置', href: 'main:settings' }
    ];
  }

  function actBtn(link, cls, quitAttr) {
    var quit = quitAttr ? ' ' + quitAttr : '';
    return '<button type="button" class="tray-ft__act' + (cls ? ' ' + cls : '') + '"' + quit +
      (link.href ? ' data-href="' + esc(link.href) + '"' : '') + '>' +
      '<span class="tray-ft__ic"><span class="ico">' + iconFor(link.id) + '</span></span>' +
      '<span class="tray-ft__lbl">' + esc(link.label) + '</span></button>';
  }

  function renderFooterHtml(links, opts) {
    opts = opts || {};
    links = links && links.length ? links.slice(0, 3) : defaultLinks();
    var main = links[0] || { id: 'main', label: '主窗口', href: 'main:home' };
    var habits = links[1] || { id: 'habits', label: '习惯', href: 'main:habits' };
    var settings = links[2] || { id: 'settings', label: '设置', href: 'main:settings' };
    var quitAttr = opts.previewOnly ? 'data-tray-quit-preview' : 'data-tray-quit';
    return '<footer class="tray-ft tray-ft--nav">' +
      '<div class="tray-ft__row tray-ft__row--main">' +
      actBtn(main, 'is-primary') +
      '</div>' +
      '<div class="tray-ft__row tray-ft__row--sub">' +
      actBtn(habits) +
      actBtn(settings) +
      actBtn({ id: 'quit', label: '退出', href: '' }, 'is-quiet', quitAttr) +
      '</div></footer>';
  }

  function bindFooter(host, opts) {
    opts = opts || {};
    if (!host) return;
    host.querySelectorAll('[data-href]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var href = btn.getAttribute('data-href');
        if (!href) return;
        if (opts.onLink) opts.onLink(href);
        else if (global.OneToneIpc && global.OneToneIpc.invoke) {
          global.OneToneIpc.invoke('cmd_tray_action', { action: 'deep_link', payload: { href: href } }).catch(function () {});
        }
      });
    });
    var quit = host.querySelector('[data-tray-quit]');
    if (quit) {
      quit.addEventListener('click', function () {
        if (global.OneToneIpc && global.OneToneIpc.invoke) {
          global.OneToneIpc.invoke('cmd_tray_action', { action: 'quit', payload: null }).catch(function () {});
        }
      });
    }
    var quitPreview = host.querySelector('[data-tray-quit-preview]');
    if (quitPreview) {
      quitPreview.addEventListener('click', function (e) {
        e.preventDefault();
        var toast = global.OneToneApp && global.OneToneApp.toast;
        if (toast) toast('仅在系统托盘菜单生效');
      });
    }
  }

  global.OneToneTrayFooter = {
    renderFooterHtml: renderFooterHtml,
    bindFooter: bindFooter,
    defaultLinks: defaultLinks
  };
})(typeof window !== 'undefined' ? window : globalThis);
