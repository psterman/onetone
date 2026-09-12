(function (global) {
  'use strict';

  var $ = function (id) {
    return global.OneToneDom && global.OneToneDom.$
      ? global.OneToneDom.$(id)
      : document.getElementById(id);
  };
  var t = function (key, fallback) {
    try {
      if (global.OneToneI18n && global.OneToneI18n.t) {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback != null ? fallback : key;
  };

  var resolveFn = null;
  var mode = 'text';
  var bound = false;
  var DELAY_PILLS = [100, 200, 500, 1000];

  function close(result) {
    var overlay = $('keysActionInputOverlay');
    if (overlay) {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if (resolveFn) {
      var fn = resolveFn;
      resolveFn = null;
      fn(result);
    }
  }

  function syncDelayPills(ms) {
    var n = parseInt(ms, 10) || 0;
    document.querySelectorAll('#keysActionDelayPills [data-ms]').forEach(function (btn) {
      btn.classList.toggle('is-on', parseInt(btn.getAttribute('data-ms'), 10) === n);
    });
    var sel = $('keysActionDelaySel');
    if (sel) sel.textContent = n > 0 ? n + ' ms' : '—';
  }

  function submit() {
    if (mode === 'delay') {
      var delayInput = $('keysActionDelayInput');
      var n = parseInt(delayInput && delayInput.value, 10);
      if (!n || n <= 0) {
        close(null);
        return;
      }
      close(n);
      return;
    }
    var textInput = $('keysActionTextInput');
    var v = textInput ? String(textInput.value || '').trim() : '';
    close(v || null);
  }

  function showPanels() {
    var textPanel = $('keysActionTextPanel');
    var delayPanel = $('keysActionDelayPanel');
    if (textPanel) textPanel.hidden = mode !== 'text';
    if (delayPanel) delayPanel.hidden = mode !== 'delay';
    var title = $('keysActionInputTitle');
    var sub = $('keysActionInputSub');
    var ok = $('btnKeysActionInputOk');
    if (mode === 'delay') {
      if (title) title.textContent = t('keysActionDelaySheetTitle', '延迟');
      if (sub) sub.textContent = t('keysActionDelaySheetSub', '步骤之间停顿多久再继续。');
      if (ok) ok.textContent = t('keysActionSheetAdd', '添加');
    } else {
      if (title) title.textContent = t('keysActionTextSheetTitle', '填入文本');
      if (sub) sub.textContent = t('keysActionTextSheetSub', '步骤执行时会注入这段文字。');
      if (ok) ok.textContent = t('keysActionSheetAdd', '添加');
    }
  }

  function openMode(nextMode, seed, opts) {
    opts = opts || {};
    mode = nextMode === 'delay' ? 'delay' : 'text';
    return new Promise(function (resolve) {
      resolveFn = resolve;
      showPanels();
      if (opts.title) {
        var titleEl = $('keysActionInputTitle');
        if (titleEl) titleEl.textContent = String(opts.title);
      }
      if (opts.sub) {
        var subEl = $('keysActionInputSub');
        if (subEl) subEl.textContent = String(opts.sub);
      }
      if (opts.okLabel) {
        var okLbl = $('btnKeysActionInputOk');
        if (okLbl) okLbl.textContent = String(opts.okLabel);
      } else if (opts.edit) {
        var ok = $('btnKeysActionInputOk');
        if (ok) ok.textContent = t('keysActionSheetSave', '保存');
        if (!opts.title && mode === 'text') {
          var title = $('keysActionInputTitle');
          if (title) title.textContent = t('homeKeyMapActionPromptTextEdit', '编辑这段文本');
        } else if (!opts.title && mode === 'delay') {
          var titleD = $('keysActionInputTitle');
          if (titleD) titleD.textContent = t('homeKeyMapActionPromptDelayEdit', '编辑延迟毫秒数');
        }
      }
      var overlay = $('keysActionInputOverlay');
      if (!overlay) {
        resolve(null);
        return;
      }
      if (mode === 'delay') {
        var delayInput = $('keysActionDelayInput');
        var ms = parseInt(seed, 10);
        if (!ms || ms <= 0) ms = 200;
        if (delayInput) delayInput.value = String(ms);
        syncDelayPills(ms);
      } else {
        var textInput = $('keysActionTextInput');
        if (textInput) textInput.value = String(seed || '');
      }
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      setTimeout(function () {
        if (mode === 'delay') {
          var el = $('keysActionDelayInput');
          if (el) {
            el.focus();
            el.select();
          }
        } else {
          var el2 = $('keysActionTextInput');
          if (el2) {
            el2.focus();
            el2.select();
          }
        }
      }, 0);
    });
  }

  function openText(seed, opts) {
    return openMode('text', seed, opts);
  }

  function openDelay(seedMs, opts) {
    return openMode('delay', seedMs, opts);
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    var ok = $('btnKeysActionInputOk');
    var cancel = $('btnKeysActionInputCancel');
    var closeBtn = $('btnKeysActionInputClose');
    var overlay = $('keysActionInputOverlay');
    var delayInput = $('keysActionDelayInput');
    if (ok) ok.onclick = function (e) { e.preventDefault(); submit(); };
    if (cancel) cancel.onclick = function (e) { e.preventDefault(); close(null); };
    if (closeBtn) closeBtn.onclick = function (e) { e.preventDefault(); close(null); };
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) close(null);
      });
    }
    document.querySelectorAll('#keysActionDelayPills [data-ms]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var ms = btn.getAttribute('data-ms');
        if (delayInput) delayInput.value = ms;
        syncDelayPills(ms);
      });
    });
    if (delayInput) {
      delayInput.addEventListener('input', function () {
        syncDelayPills(delayInput.value);
      });
      delayInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          close(null);
        }
      });
    }
    var textInput = $('keysActionTextInput');
    if (textInput) {
      textInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(null);
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit();
        }
      });
    }
  }

  global.OneToneKeysActionInputSheet = {
    openText: openText,
    openDelay: openDelay,
    bindEvents: bindEvents,
    close: function () { close(null); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindEvents);
  } else {
    bindEvents();
  }
})(typeof window !== 'undefined' ? window : this);
