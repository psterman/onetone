(function (global) {
  'use strict';

  var $ = function (id) {
    return global.OneToneDom && global.OneToneDom.$ ? global.OneToneDom.$(id) : document.getElementById(id);
  };

  var state = { mappingId: '', hours: 168, open: false };
  var bound = false;

  function t(key, fb) {
    try {
      var v = global.OneToneI18n && global.OneToneI18n.t ? global.OneToneI18n.t(key) : key;
      if (v && v !== key) return v;
    } catch (_) {}
    return fb != null ? fb : key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function core() {
    return global.OneToneMappingCore;
  }

  function statsApi() {
    return global.OneToneHabitActionStats;
  }

  function mappingLabel(mappingId) {
    var id = String(mappingId || '').trim();
    var m = core() && core().byId ? core().byId(id) : null;
    if (!m) return id || '—';
    var hub = global.OneToneHabitHub;
    if (hub && hub.habitName) return hub.habitName(m);
    return String(m.group || m.label || m.id || '—');
  }

  function windowBtn(hours, label, active) {
    return '<button type="button" role="tab" class="habit-usage-sheet-window-btn' +
      (active ? ' is-active' : '') +
      '" data-hours="' + hours + '" aria-selected="' + (active ? 'true' : 'false') + '">' +
      esc(label) + '</button>';
  }

  function renderWindowTabs(hours) {
    var h = hours != null ? hours : 168;
    return windowBtn(168, t('habitUsageWindowWeek', '近 7 天'), h <= 168) +
      windowBtn(720, t('habitUsageWindowMonth', '近 30 天'), h > 168 && h <= 720) +
      windowBtn(8760, t('habitUsageWindowAllTime', '一共'), h > 720);
  }

  function renderKpi(mappingId, failed) {
    var host = $('habitUsageSheetKpi');
    if (!host) return;
    if (failed) {
      host.innerHTML =
        '<div class="habit-usage-sheet-error" role="alert" aria-live="polite">' +
        '<p class="habit-usage-sheet-error-text">' + esc(t('habitUsageStatsLoadFail', '统计加载失败')) + '</p>' +
        '<button type="button" class="habit-usage-sheet-retry" data-usage-sheet-retry>' +
        esc(t('habitUsageStatsRetry', '重试')) + '</button></div>';
      return;
    }
    var api = statsApi();
    host.innerHTML = api && api.kpiHtml ? api.kpiHtml(mappingId) : '';
  }

  function renderExportHint(hours) {
    var hint = $('habitUsageSheetExportHint');
    if (!hint) return;
    var api = statsApi();
    hint.textContent = api && api.exportHint ? api.exportHint(hours) : '';
  }

  function mountHistory(mappingId, hours) {
    var mount = global.__otMountHabitUsageSheetHistory;
    if (typeof mount === 'function') {
      try {
        mount(String(mappingId || ''), hours);
      } catch (err) {
        console.error('habit usage sheet history', err);
      }
    }
  }

  function refreshData(force) {
    var api = statsApi();
    if (!api || !api.fetch || !state.mappingId) return Promise.resolve();
    return api.fetch({ hours: state.hours, force: !!force })
      .then(function () {
        renderKpi(state.mappingId, false);
        renderExportHint(state.hours);
        mountHistory(state.mappingId, state.hours);
      })
      .catch(function () {
        renderKpi(state.mappingId, true);
      });
  }

  function setWindowHours(hours) {
    state.hours = hours > 0 ? hours : 168;
    var wrap = document.querySelector('[data-usage-sheet-window]');
    if (wrap) {
      wrap.querySelectorAll('[data-hours]').forEach(function (btn) {
        var on = Number(btn.getAttribute('data-hours')) === state.hours;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    refreshData(true);
  }

  function showShell(on) {
    var backdrop = $('habitUsageSheetBackdrop');
    var sheet = $('habitUsageSheet');
    if (backdrop) backdrop.hidden = !on;
    if (sheet) {
      sheet.classList.toggle('is-closed', !on);
      sheet.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    state.open = !!on;
    if (!on) state.mappingId = '';
  }

  function open(mappingId, opts) {
    opts = opts || {};
    var id = String(mappingId || '').trim();
    if (!id) return;
    state.mappingId = id;
    state.hours = opts.hours != null ? opts.hours : 168;

    var title = $('habitUsageSheetTitle');
    var sub = $('habitUsageSheetSub');
    var tabs = $('habitUsageSheetWindow');
    if (title) title.textContent = mappingLabel(id);
    if (sub) sub.textContent = t('habitUsageSheetSub', '使用记录');
    if (tabs) tabs.innerHTML = renderWindowTabs(state.hours);
    renderExportHint(state.hours);
    var exportBtn = $('btnHabitUsageSheetExport');
    if (exportBtn) exportBtn.textContent = t('habitUsageExport', '导出文档');

    showShell(true);
    refreshData(true);

    var closeBtn = $('btnHabitUsageSheetClose');
    if (closeBtn) closeBtn.focus();
  }

  function close() {
    try {
      if (global.OneToneIslands && global.OneToneIslands.isMounted &&
        global.OneToneIslands.isMounted('habitUsageSheetHistory')) {
        global.OneToneIslands.unmountIsland('habitUsageSheetHistory');
      }
    } catch (_) {}
    var host = $('habitUsageSheetHistory');
    if (host) host.innerHTML = '';
    showShell(false);
  }

  function bindEvents() {
    if (bound) return;
    bound = true;

    var backdrop = $('habitUsageSheetBackdrop');
    var closeBtn = $('btnHabitUsageSheetClose');
    if (backdrop) backdrop.addEventListener('click', close);
    if (closeBtn) closeBtn.addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (!state.open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });

    var sheet = $('habitUsageSheet');
    if (sheet) {
      sheet.addEventListener('click', function (e) {
        var winBtn = e.target && e.target.closest && e.target.closest('[data-usage-sheet-window] [data-hours]');
        if (winBtn) {
          e.preventDefault();
          setWindowHours(Number(winBtn.getAttribute('data-hours')) || 168);
          return;
        }
        var retry = e.target && e.target.closest && e.target.closest('[data-usage-sheet-retry]');
        if (retry) {
          e.preventDefault();
          refreshData(true);
          return;
        }
        var exportBtn = e.target && e.target.closest && e.target.closest('[data-usage-sheet-export]');
        if (exportBtn) {
          e.preventDefault();
          var api = statsApi();
          if (api && api.exportHabitDoc) {
            api.exportHabitDoc(state.mappingId, { hours: state.hours }).catch(function () {});
          }
        }
      });
    }
  }

  global.OneToneHabitUsageSheet = {
    open: open,
    close: close,
    bindEvents: bindEvents,
    isOpen: function () { return state.open; },
    currentHours: function () { return state.hours; },
  };

  bindEvents();
})(typeof window !== 'undefined' ? window : globalThis);
