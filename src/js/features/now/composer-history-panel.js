/**
 * Left-nav「对话历史」— homepage composer send journal (PromptPrep handoffs).
 */
(function (global) {
  'use strict';

  function t(key, fallback) {
    if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dock() {
    return global.OneToneHomeDockBridge;
  }

  function host() {
    return document.getElementById('composerHistoryList');
  }

  function whenLabel(iso) {
    var ms = Date.parse(String(iso || ''));
    if (!ms) return '';
    var d = new Date(ms);
    var now = new Date();
    var sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return (
      d.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }

  function truncate(s, max) {
    s = String(s || '').trim();
    if (!s) return '';
    max = max || 120;
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function rows() {
    var D = dock();
    if (D && typeof D.listComposerHistory === 'function') {
      try {
        return D.listComposerHistory(40) || [];
      } catch (_) {}
    }
    var Prep = global.OneToneHomePromptPrep;
    return Prep && Prep.listHandoffs ? Prep.listHandoffs().slice(0, 40) : [];
  }

  function goHomeWithDraft() {
    try {
      if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.close) {
        global.OneToneSettingsDrawer.close();
      }
    } catch (_) {}
    try {
      localStorage.setItem('onetone.homeSurface', 'agentV2');
    } catch (_) {}
    var WB = global.OneToneHomeWorkbench;
    if (WB && typeof WB.syncNavActiveState === 'function') {
      try {
        WB.syncNavActiveState('home', { navKey: 'homeV2' });
      } catch (_) {}
    }
    var NH = global.OneToneNowHome;
    if (NH && NH.show) {
      try {
        NH.show();
      } catch (_) {}
    }
    var HA = global.OneToneHomeAgentV2;
    if (HA && HA.show) {
      try {
        HA.show();
      } catch (_) {}
    }
  }

  function toast(msg) {
    var T = global.OneToneToast;
    if (T && T.show) {
      try {
        T.show(String(msg || ''));
      } catch (_) {}
    }
  }

  function paint() {
    var list = host();
    if (!list) return;
    var data = rows();
    if (!data.length) {
      list.innerHTML =
        '<p class="composer-hist-empty">' +
        esc(t('composerHistEmpty', '还没有发送记录。在新首页写一句并发送后会出现在这里。')) +
        '</p>';
      return;
    }
    list.innerHTML = data
      .map(function (h) {
        var line = truncate(h.preview || h.title || h.body || '', 140);
        var meta =
          (h.targetKind ? String(h.targetKind) + ' · ' : '') +
          whenLabel(h.handedOffAt) +
          (h.chars ? ' · ' + h.chars + t('composerHistChars', ' 字') : '');
        return (
          '<article class="composer-hist-row" data-composer-hist-id="' +
          esc(h.id || '') +
          '">' +
          '<div class="composer-hist-body">' +
          '<p class="composer-hist-line">' +
          esc(line || t('composerHistUntitled', '（无正文）')) +
          '</p>' +
          '<p class="composer-hist-meta">' +
          esc(meta) +
          '</p></div>' +
          '<div class="composer-hist-acts">' +
          '<button type="button" class="composer-hist-btn primary" data-composer-hist-act="restore">' +
          esc(t('composerHistRestore', '回填首页')) +
          '</button>' +
          '<button type="button" class="composer-hist-btn" data-composer-hist-act="copy">' +
          esc(t('composerHistCopy', '复制')) +
          '</button>' +
          '<button type="button" class="composer-hist-btn danger" data-composer-hist-act="remove">' +
          esc(t('composerHistRemove', '删除')) +
          '</button></div></article>'
        );
      })
      .join('');
  }

  function onClick(e) {
    var tEl = e.target && e.target.closest && e.target.closest('[data-composer-hist-act]');
    if (!tEl) return;
    var row = tEl.closest('[data-composer-hist-id]');
    if (!row) return;
    var id = row.getAttribute('data-composer-hist-id');
    var act = tEl.getAttribute('data-composer-hist-act');
    var D = dock();
    if (act === 'restore') {
      var res = D && D.restoreComposerHistory ? D.restoreComposerHistory(id) : { ok: false };
      if (!res || !res.ok) {
        toast(t('composerHistRestoreFail', '无法回填这条记录'));
        return;
      }
      toast(t('composerHistRestored', '已回填到首页输入框'));
      goHomeWithDraft();
      return;
    }
    if (act === 'copy') {
      var hit = null;
      var list = rows();
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].id || '') === String(id || '')) {
          hit = list[i];
          break;
        }
      }
      var text = hit ? String(hit.body || hit.preview || '') : '';
      if (!text) return;
      var clip =
        global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText
          ? global.navigator.clipboard.writeText(text)
          : Promise.reject();
      Promise.resolve(clip)
        .then(function () {
          toast(t('composerHistCopied', '已复制'));
        })
        .catch(function () {
          toast(t('composerHistCopyFail', '复制失败'));
        });
      return;
    }
    if (act === 'remove') {
      var ok = D && D.removeComposerHistory ? D.removeComposerHistory(id) : false;
      if (!ok) {
        var Prep = global.OneToneHomePromptPrep;
        ok = !!(Prep && Prep.removeHandoff && Prep.removeHandoff(id));
      }
      if (ok) paint();
      else toast(t('composerHistRemoveFail', '删除失败'));
    }
  }

  var bound = false;
  function bindOnce() {
    if (bound) return;
    bound = true;
    var root = document.getElementById('settingsPanelComposerHistory');
    if (root) root.addEventListener('click', onClick);
    var clearBtn = document.getElementById('composerHistoryClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        var Prep = global.OneToneHomePromptPrep;
        if (!Prep || !Prep.clearHandoffs) return;
        if (!rows().length) return;
        if (
          typeof global.confirm === 'function' &&
          !global.confirm(t('composerHistClearConfirm', '清空全部对话历史？此操作不可撤销。'))
        ) {
          return;
        }
        Prep.clearHandoffs();
        paint();
      });
    }
  }

  function render() {
    bindOnce();
    paint();
  }

  global.OneToneComposerHistoryPanel = {
    render: render,
    paint: paint
  };
})(typeof window !== 'undefined' ? window : globalThis);
