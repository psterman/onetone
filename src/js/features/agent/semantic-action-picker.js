/**
 * Shared Action Picker — single DOM host. Gated by featureActionPickerUi.
 */
(function (global) {
  'use strict';

  var HOST_ID = 'semanticActionPickerOverlay';
  var _open = false;
  var _opts = null;
  var _returnFocus = null;
  var CATEGORIES = [
    { id: 'input', zh: '控制输入', en: 'Control input' },
    { id: 'agent', zh: '控制当前 Agent', en: 'Control agent' },
    { id: 'decision', zh: '确认或拒绝', en: 'Decide' },
    { id: 'session', zh: '会话与状态', en: 'Session' },
    { id: 'system', zh: 'OneTone 与界面', en: 'OneTone & UI' }
  ];

  function t(key, fallback) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function langIsEn() {
    return global.OneToneI18n && global.OneToneI18n.getLang && global.OneToneI18n.getLang() === 'en';
  }

  function ensureHost() {
    var el = document.getElementById(HOST_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = HOST_ID;
    el.className = 'semantic-action-picker-overlay';
    el.hidden = true;
    el.innerHTML =
      '<div class="semantic-action-picker-modal" role="dialog" aria-modal="true" aria-labelledby="sapTitle">' +
      '<header class="sap-header">' +
      '<div><h2 id="sapTitle" class="sap-title"></h2><p class="sap-sub" id="sapSub"></p></div>' +
      '<button type="button" class="sap-close" id="sapClose" aria-label="Close">×</button>' +
      '</header>' +
      '<div class="sap-toolbar"><input type="search" id="sapSearch" class="sap-search" autocomplete="off" /></div>' +
      '<nav class="sap-cats" id="sapCats"></nav>' +
      '<div class="sap-list" id="sapList" tabindex="0"></div>' +
      '<p class="sap-empty" id="sapEmpty" hidden></p>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', function (e) {
      if (e.target === el) close();
    });
    el.querySelector('#sapClose').addEventListener('click', close);
    el.querySelector('#sapSearch').addEventListener('input', renderList);
    el.addEventListener('keydown', onKey);
    return el;
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  function activeCat() {
    var n = document.querySelector('#sapCats .is-active');
    return n ? n.getAttribute('data-cat') : 'input';
  }

  function renderCats() {
    var host = document.getElementById('sapCats');
    if (!host) return;
    var en = langIsEn();
    host.innerHTML = CATEGORIES.map(function (c, i) {
      return (
        '<button type="button" class="sap-cat' +
        (i === 0 ? ' is-active' : '') +
        '" data-cat="' +
        c.id +
        '">' +
        (en ? c.en : c.zh) +
        '</button>'
      );
    }).join('');
    host.querySelectorAll('.sap-cat').forEach(function (btn) {
      btn.addEventListener('click', function () {
        host.querySelectorAll('.sap-cat').forEach(function (b) {
          b.classList.remove('is-active');
        });
        btn.classList.add('is-active');
        renderList();
      });
    });
  }

  function renderList() {
    var store = global.OneToneSemanticActionStore;
    var list = document.getElementById('sapList');
    var empty = document.getElementById('sapEmpty');
    if (!list || !store || !_opts) return;
    var q = String((document.getElementById('sapSearch') || {}).value || '')
      .trim()
      .toLowerCase();
    var cat = activeCat();
    var en = langIsEn();
    var catalog = store.catalog();
    var options = _opts._options || [];
    // Fail closed: no options yet → empty list (do not fall back to catalog-only).
    if (!options.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.textContent = t('sapEmpty', en ? 'No actions available' : '没有可用动作');
      return;
    }
    var rows = [];
    (catalog && catalog.entries ? catalog.entries : []).forEach(function (meta) {
      if (meta.legacy) return;
      if (!meta.implemented) return;
      if (meta.category !== cat) return;
      if (_opts.channel && meta.channels && meta.channels.indexOf(_opts.channel) < 0) return;
      var opt = null;
      for (var i = 0; i < options.length; i++) {
        if (options[i].actionId === meta.id) {
          opt = options[i];
          break;
        }
      }
      if (!opt || !opt.bindable) return;
      var label = en ? meta.labelEn : meta.labelZh;
      if (q && String(label).toLowerCase().indexOf(q) < 0 && meta.id.indexOf(q) < 0) return;
      rows.push({ meta: meta, opt: opt, label: label });
    });
    if (!rows.length) {
      list.innerHTML = '';
      empty.hidden = false;
      empty.textContent = t('sapEmpty', en ? 'No actions available' : '没有可用动作');
      return;
    }
    empty.hidden = true;
    list.innerHTML = rows
      .map(function (r) {
        var risk = r.meta.risk || '';
        var disp = (r.opt && r.opt.routeDisposition) || '';
        var needsConfirm =
          disp === 'pendingConfirmation' ||
          (r.meta.requiresSecondChannelFrom &&
            r.meta.requiresSecondChannelFrom.indexOf(_opts.channel) >= 0);
        var warn = needsConfirm
          ? '<span class="sap-warn" data-sap-pending-hint="1">' +
            t('sapNeedOtherEntry', en ? 'Needs confirm from another entry' : '需其他入口确认') +
            '</span>'
          : '';
        var cur = _opts.currentActionId === r.meta.id ? ' is-current' : '';
        return (
          '<button type="button" class="sap-item' +
          cur +
          '" data-action-id="' +
          r.meta.id +
          '"' +
          (disp ? ' data-route-disposition="' + escapeHtml(disp) + '"' : '') +
          '>' +
          '<span class="sap-item-label">' +
          escapeHtml(r.label) +
          '</span>' +
          '<span class="sap-item-risk risk-' +
          escapeHtml(risk) +
          '">' +
          escapeHtml(risk) +
          '</span>' +
          warn +
          '</button>'
        );
      })
      .join('');
    list.querySelectorAll('.sap-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        pick(btn.getAttribute('data-action-id'));
      });
    });
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function pick(actionId) {
    var store = global.OneToneSemanticActionStore;
    var meta = store && store.entryMeta(actionId);
    var channel = (_opts && _opts.channel) || null;
    var result = {
      actionId: actionId,
      channel: channel,
      providerScope: (meta && meta.providerScope) || 'none'
    };
    var cb = _opts && _opts.onSelect;
    close();
    if (typeof cb === 'function') cb(result);
  }

  function open(opts) {
    var aa = global.OneToneAgentActions;
    if (aa && !aa.featureActionPickerUi()) {
      console.warn('[sap] FEATURE_ACTION_PICKER_UI off');
      return;
    }
    _opts = opts || {};
    _returnFocus = document.activeElement;
    var store = global.OneToneSemanticActionStore;
    if (!store) return;
    var host = ensureHost();
    var en = langIsEn();
    document.getElementById('sapTitle').textContent = t(
      'sapTitle',
      en ? 'Choose an action' : '选择动作'
    );
    document.getElementById('sapSub').textContent =
      (_opts.mappingId || '') + (en ? ' · same action, many entries' : ' · 同一动作，多种入口');
    document.getElementById('sapSearch').placeholder = t('sapSearch', en ? 'Search' : '搜索');
    renderCats();
    host.hidden = false;
    _open = true;
    store.ensureCatalog().then(function () {
      var ch = _opts.channel || 'key';
      return store.fetchOptions(_opts.mappingId, ch, true);
    }).then(function (entries) {
      _opts._options = entries;
      renderList();
      var search = document.getElementById('sapSearch');
      if (search) search.focus();
    });
  }

  function close() {
    var host = document.getElementById(HOST_ID);
    if (host) host.hidden = true;
    _open = false;
    _opts = null;
    if (_returnFocus && _returnFocus.focus) {
      try {
        _returnFocus.focus();
      } catch (_) {}
    }
    _returnFocus = null;
  }

  function isOpen() {
    return _open;
  }

  global.OneToneSemanticActionPicker = { open: open, close: close, isOpen: isOpen };
})(typeof window !== 'undefined' ? window : globalThis);
