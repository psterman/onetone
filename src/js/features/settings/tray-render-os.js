/**
 * OS tray channel block renderer (tray menu + editor preview).
 */
(function (global) {
  'use strict';

  function osToggleHtml(on) {
    return '<button type="button" class="sw-toggle' + (on ? '' : ' off') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></button>';
  }

  function patchOsToggles(shell, controls, ctx, api) {
    shell.querySelectorAll('[data-ctrl]').forEach(function (row) {
      var ctrlId = row.getAttribute('data-ctrl');
      var ctrl = controls.find(function (c) { return c.id === ctrlId; });
      if (!ctrl) return;
      var btn = row.querySelector('.sw-toggle');
      if (!btn) return;
      var on = api.readControlValue(ctrl, ctx);
      btn.classList.toggle('off', !on);
      btn.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function tryPatchBlock(shell, channel, state, ctx, controls, api) {
    var block = shell.querySelector('.ch-block');
    if (!block || shell.getAttribute('data-ot-ch') !== channel) return false;
    var ch = (state && state.channels || []).find(function (c) { return c.id === channel; }) || {};
    var sceneEl = block.querySelector('.ch-scene');
    var sceneText = api.traySceneLine(channel, state, ch);
    if (sceneEl && sceneEl.textContent !== sceneText) sceneEl.textContent = sceneText;
    var nameEl = block.querySelector('.ch-title-row .name');
    if (nameEl && ch.name && nameEl.textContent !== ch.name) nameEl.textContent = ch.name;
    patchOsToggles(shell, controls, ctx, api);
    return true;
  }

  function bindOsBlock(shell, channel, state, ctx, controls, api, opts) {
    shell.querySelectorAll('.sw-toggle').forEach(function (btn) {
      var row = btn.closest('[data-ctrl]');
      if (!row) return;
      var ctrlId = row.getAttribute('data-ctrl');
      var ctrl = controls.find(function (c) { return c.id === ctrlId; });
      if (!ctrl) return;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var next = btn.getAttribute('aria-checked') !== 'true';
        btn.classList.toggle('off', !next);
        btn.setAttribute('aria-checked', next ? 'true' : 'false');
        api.writeControlValue(ctrl, next, ctx).then(function () {
          if (opts.onSwitchChange) opts.onSwitchChange();
          else if (opts.onRefresh) opts.onRefresh();
        }).catch(function () {
          btn.classList.toggle('off', next);
          btn.setAttribute('aria-checked', next ? 'false' : 'true');
        });
      });
    });
    var chevBtn = shell.querySelector('[data-ch-chev]');
    function toggleFold(e) {
      if (e) e.stopPropagation();
      var open = api.getOpenOsChannel();
      api.setOpenOsChannel(open === channel ? null : channel);
      renderBlock(api, shell, channel, state, opts);
    }
    if (chevBtn) chevBtn.addEventListener('click', toggleFold);
    var mainRow = shell.querySelector('[data-ch-toggle]');
    if (mainRow) {
      mainRow.addEventListener('click', function (e) {
        if (e.target.closest('.ch-actions, .sw-toggle, [data-ctrl]')) return;
        toggleFold(e);
      });
    }
    var moreBtn = shell.querySelector('[data-ch-more]');
    if (moreBtn) {
      moreBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        api.invoke('cmd_tray_action', { action: 'deep_link', payload: { href: 'main:' + (channel === 'softPad' ? 'softPad' : channel) } });
      });
    }
  }

  function renderBlock(api, shell, channel, state, opts) {
    opts = opts || {};
    if (!shell || channel === 'habits') return Promise.resolve();
    var ch = (state && state.channels || []).find(function (c) { return c.id === channel; }) || {};
    var isOpen = api.getOpenOsChannel() === channel;
    var iconCls = channel === 'softPad' ? 'softpad' : channel;
    var ICONS = (global.OneToneIcons && global.OneToneIcons.tray) || {};
    var ctx = {
      surface: 'os',
      channel: channel,
      global: state && state.global,
      voiceEnd: api.getVoiceEnd(),
      config: api.getConfig(),
      mapping: api.getMapping()
    };

    return api.hydrateOsContext(state && state.global).then(function () {
      ctx.config = api.getConfig();
      ctx.mapping = api.getMapping();
      ctx.voiceEnd = api.getVoiceEnd();
      var controls = api.controlsForSurface(channel, 'os');
      if (tryPatchBlock(shell, channel, state, ctx, controls, api)) return;
      var titleCtrl = controls.filter(function (c) { return c.tier === 'l1'; })[0];
      var l2 = controls.filter(function (c) {
        return c.tier === 'l2' || (c.tier === 'l1' && c !== titleCtrl);
      });
      var l1 = titleCtrl;
      var l1Toggle = l1
        ? '<span class="ch-l1-sw" data-ctrl="' + l1.id + '">' + osToggleHtml(api.readControlValue(l1, ctx)) + '</span>'
        : '';
      var l2Html = '';
      if (l2.length) {
        l2Html = '<div class="ch-l2 ch-drawer' + (isOpen ? ' is-open' : '') + '">' + l2.map(function (ctrl) {
          return '<div class="sw-inline" data-ctrl="' + ctrl.id + '"><span>' + api.t(ctrl.labelKey, ctrl.labelKey) + '</span>' + osToggleHtml(api.readControlValue(ctrl, ctx)) + '</div>';
        }).join('') + '<button type="button" class="more" data-ch-more="' + channel + '">' + api.t('trayChGoSettings', '完整设置 ▸') + '</button></div>';
      }
      var foldBtn = l2.length
        ? '<button type="button" class="ch-fold-btn' + (isOpen ? ' is-open' : '') + '" data-ch-chev="' + channel + '" aria-expanded="' + (isOpen ? 'true' : 'false') + '" aria-label="' + (isOpen ? '收起' : '展开') + '"><span class="ch-fold-btn__ic" aria-hidden="true">⌄</span></button>'
        : '';
      var actions = '<div class="ch-actions">' + l1Toggle + foldBtn + '</div>';
      var mainToggle = l2.length ? ' data-ch-toggle="' + channel + '"' : '';
      shell.setAttribute('data-ot-ch', channel);
      shell.innerHTML = '<div class="ch-block' + (isOpen ? ' is-open' : '') + '"><div class="ch-main"' + mainToggle + '>'
        + '<span class="icowrap ' + iconCls + '"><span class="ico">' + (ICONS[channel] || ICONS.voice || '') + '</span></span>'
        + '<div class="ch-body"><div class="ch-title-row"><span class="name">' + (ch.name || channel) + '</span></div>'
        + '<div class="ch-scene">' + api.traySceneLine(channel, state, ch).replace(/</g, '&lt;') + '</div></div>'
        + actions + '</div>' + l2Html + '</div>';
      bindOsBlock(shell, channel, state, ctx, controls, api, opts);
    });
  }

  global.OneToneTrayRenderOs = {
    renderBlock: renderBlock,
    patchOsToggles: patchOsToggles
  };
})(typeof window !== 'undefined' ? window : globalThis);
