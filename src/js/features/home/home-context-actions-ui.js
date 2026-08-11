/**
 * Home context strip + pending confirm card. Gated by featureDynamicContextActions.
 * Poll is the only path that fetches pending; onChange only re-renders from cache.
 */
(function (global) {
  'use strict';

  var HOST_ID = 'wbContextActions';
  var _timer = null;
  var _lastNeeds = { kind: 'none' };
  var _lastOptions = [];
  var _subscribed = false;

  function t(k, fb) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(k);
      if (v && v !== k) return v;
    }
    return fb || k;
  }

  function ensureHost() {
    var el = document.getElementById(HOST_ID);
    if (el) return el;
    var pills = document.getElementById('wbHeroPills');
    var hero = document.getElementById('wbHero') || document.getElementById('wbTriggerCard');
    el = document.createElement('div');
    el.id = HOST_ID;
    el.className = 'wb-context-actions';
    el.hidden = true;
    if (pills && pills.parentNode) {
      pills.parentNode.insertBefore(el, pills.nextSibling);
    } else if (hero) {
      hero.appendChild(el);
    } else {
      document.body.appendChild(el);
    }
    return el;
  }

  function activeMappingId() {
    var st = global.OneToneState || {};
    return st.selectedMappingId || st.activeSceneId || null;
  }

  function homeVisible() {
    var app = document.getElementById('app');
    if (app && app.classList.contains('is-settings')) return false;
    return true;
  }

  function invokeNeeds() {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!fn) return Promise.resolve({ kind: 'none' });
    return Promise.resolve(fn('cmd_needs_input_kind')).catch(function () {
      return { kind: 'none' };
    });
  }

  /** Pull remote state (silent pending). */
  function refresh() {
    var aa = global.OneToneAgentActions;
    if (!aa || !aa.featureDynamicContextActions()) {
      var h = document.getElementById(HOST_ID);
      if (h) h.hidden = true;
      return;
    }
    if (!homeVisible()) return;
    var store = global.OneToneSemanticActionStore;
    var model = global.OneToneHomeContextActionsModel;
    if (!store || !model) return;
    var mid = activeMappingId();
    Promise.all([
      store.ensureCatalog(),
      invokeNeeds(),
      store.fetchPendingSnapshot(mid, { silent: true }),
      mid ? store.fetchOptions(mid, 'softPad', true) : Promise.resolve([])
    ]).then(function (parts) {
      _lastNeeds = parts[1] || { kind: 'none' };
      _lastOptions = parts[3] || [];
      paint();
    });
  }

  /** Local-only redraw from store cache — never fetches pending. */
  function paint() {
    var aa = global.OneToneAgentActions;
    if (!aa || !aa.featureDynamicContextActions()) {
      var h0 = document.getElementById(HOST_ID);
      if (h0) h0.hidden = true;
      return;
    }
    if (!homeVisible()) return;
    var store = global.OneToneSemanticActionStore;
    var model = global.OneToneHomeContextActionsModel;
    if (!store || !model) return;
    var mid = activeMappingId();
    var host = ensureHost();
    var catalog = store.catalog() || { entries: [] };
    var options = store.withExecutableNow(_lastOptions, _lastNeeds.kind);
    var built = model.buildHomeContextActions({
      needsInputKind: _lastNeeds.kind,
      catalogEntries: catalog.entries || [],
      options: options,
      pending: store.latestPending()
    });
    render(host, built, mid);
  }

  function render(host, built, mappingId) {
    var en = global.OneToneI18n && global.OneToneI18n.getLang && global.OneToneI18n.getLang() === 'en';
    if (built.pendingCard) {
      var pc = built.pendingCard;
      var sec = Math.max(0, Math.ceil((pc.expiresInMs || 0) / 1000));
      host.hidden = false;
      host.innerHTML =
        '<div class="wb-pending-card" role="status">' +
        '<p class="wb-pending-title">' +
        t('wbPendingTitle', en ? 'Camera needs confirmation' : '摄像头识别到需确认的动作') +
        '</p>' +
        '<p class="wb-pending-detail">' +
        escapeHtml(pc.actionId) +
        ' · ' +
        t('wbPendingRemain', en ? 'Remaining' : '剩余') +
        ' ' +
        sec +
        's</p>' +
        '<div class="wb-pending-actions">' +
        '<button type="button" class="wb-pending-confirm" id="wbPendConfirm">' +
        t('wbPendingConfirm', en ? 'Confirm' : '确认执行') +
        '</button>' +
        '<button type="button" class="wb-pending-reject" id="wbPendReject">' +
        t('wbPendingReject', en ? 'Reject' : '拒绝') +
        '</button></div>' +
        '<p class="wb-pending-hint">' +
        t(
          'wbPendingHint',
          en
            ? 'Or use a bound confirm key / say confirm'
            : '也可以按已绑定确认键，或说「确认」'
        ) +
        '</p></div>';
      document.getElementById('wbPendConfirm').onclick = function () {
        global.OneToneAgentActions.routeSemanticAction({
          actionId: pc.actionId,
          sourceChannel: 'softPad',
          mappingId: mappingId,
          confirmationId: pc.confirmationId
        }).then(function () {
          refresh();
        });
      };
      document.getElementById('wbPendReject').onclick = function () {
        var store = global.OneToneSemanticActionStore;
        if (!store) return;
        store.cancelPending(pc.confirmationId).then(paint);
      };
      return;
    }
    if (!built.actions || !built.actions.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML =
      '<div class="wb-context-strip" aria-label="context actions">' +
      built.actions
        .map(function (a) {
          var label = en ? a.labelEn : a.labelZh;
          return (
            '<button type="button" class="wb-context-btn" data-action="' +
            escapeHtml(a.actionId) +
            '">' +
            escapeHtml(label) +
            '</button>'
          );
        })
        .join('') +
      '</div>';
    host.querySelectorAll('.wb-context-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        global.OneToneAgentActions.routeSemanticAction({
          actionId: btn.getAttribute('data-action'),
          sourceChannel: 'softPad',
          mappingId: mappingId
        }).then(refresh);
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

  function start() {
    refresh();
    if (_timer) clearInterval(_timer);
    _timer = setInterval(function () {
      if (homeVisible()) refresh();
    }, 8000);
    if (!_subscribed && global.OneToneSemanticActionStore && global.OneToneSemanticActionStore.onChange) {
      _subscribed = true;
      global.OneToneSemanticActionStore.onChange(function () {
        if (homeVisible()) paint();
      });
    }
  }

  if (global.document) {
    global.document.addEventListener('DOMContentLoaded', function () {
      setTimeout(start, 800);
    });
  }

  global.OneToneHomeContextActionsUi = { refresh: refresh, paint: paint, start: start };
})(typeof window !== 'undefined' ? window : globalThis);
