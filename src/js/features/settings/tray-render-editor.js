/**
 * Editor switch cards renderer (settings tray panel).
 */
(function (global) {
  'use strict';

  function setToggle(btn, on) {
    btn.classList.toggle('on', !!on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function renderSwitchCards(api, host, channel, ctx, opts) {
    opts = opts || {};
    if (!host || channel === 'habits') return Promise.resolve();
    ctx = ctx || { surface: 'editor' };
    return api.loadTrayLayout().then(function () {
      host.innerHTML = '';
      var controls = api.controlsForSurface(channel, 'editor');
      controls.forEach(function (ctrl) {
        var on = api.readControlValue(ctrl, Object.assign({ channel: channel }, ctx));
        var dep = ctrl.needs ? api.findControlById(ctrl.needs) : null;
        var depOn = dep ? api.readControlValue(dep, Object.assign({ channel: channel }, ctx)) : true;
        var card = document.createElement('div');
        card.className = 'ch-switch-card is-' + ctrl.tier + (on ? '' : ' is-off');
        card.setAttribute('data-sw-id', ctrl.id);
        var label = api.t(ctrl.labelKey, ctrl.labelKey);
        var hint = ctrl.hintKey ? api.t(ctrl.hintKey, '') : '';
        var warnHtml = '';
        if (dep && !depOn) {
          warnHtml = '<div class="ch-switch-card__warn"><span class="ch-switch-card__warn__ic">⚠</span><span>此开关依赖 <b>' +
            api.t(dep.labelKey, dep.labelKey) + '</b> 未开启</span></div>';
        } else if (dep && depOn) {
          warnHtml = '<div class="ch-switch-card__rel" data-go-rel="' + dep.id + '"><span class="ch-switch-card__rel__ic">↪</span><span class="ch-switch-card__rel__name">' +
            api.t(dep.labelKey, dep.labelKey) + '</span> 已开启</div>';
        }
        card.innerHTML = '<div class="ch-switch-card__head"><div class="ch-switch-card__main">' +
          '<div class="ch-switch-card__title"><span class="ch-switch-card__name">' + label + '</span>' +
          '<span class="ch-switch-card__lvl ' + ctrl.tier + '">' + ctrl.tier.toUpperCase() + '</span></div>' +
          (hint ? '<div class="ch-switch-card__hint">' + hint + '</div>' : '') +
          '</div><button type="button" class="ch-switch-card__toggle toggle-switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (on ? 'true' : 'false') + '"></button></div>' + warnHtml;
        var btn = card.querySelector('.ch-switch-card__toggle');
        btn.addEventListener('click', function () {
          var next = btn.getAttribute('aria-checked') !== 'true';
          setToggle(btn, next);
          api.writeControlValue(ctrl, next, Object.assign({ channel: channel, surface: 'editor' }, ctx)).then(function () {
            if (opts.onChange) opts.onChange(ctrl.id);
            api.syncAllSurfaces(channel);
            renderSwitchCards(api, host, channel, ctx, opts);
          }).catch(function () { setToggle(btn, !next); });
        });
        host.appendChild(card);
      });
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'go-link';
      go.textContent = api.t('trayChGoSettings', '完整设置 ▸');
      go.addEventListener('click', function () { api.openSettingsPanel(api.SETTINGS_PANEL[channel]); });
      host.appendChild(go);
    });
  }

  global.OneToneTrayRenderEditor = {
    renderSwitchCards: renderSwitchCards
  };
})(typeof window !== 'undefined' ? window : globalThis);
