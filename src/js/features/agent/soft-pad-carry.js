/**
 * Soft Pad Form B — read-only tray projection (overlay WebView).
 * Listens tray_changed; paste via cmd_soft_pad_paste_only; dismiss ≠ clear materials.
 */
(function (global) {
  'use strict';

  var FORM_KEY = 'onetone.softPad.carryForm';
  var LISTEN_KEY = 'onetone.softPad.carryListen';
  /** Persist across restart — pin keeps materials drawer open. */
  var PIN_KEY = 'onetone.softPad.matsPinned';
  var rootEl = null;
  var snap = null;
  var unlisten = null;
  var pasteBusy = false;
  var formExpanded = false;
  var listenOn = false;
  var dropDepth = 0;
  var dropBoundEl = null;
  var matsBarEl = null;
  var matsDrawerOpen = false;
  var matsHadItems = false;
  var matsPinned = false;
  var matsLeaveTimer = null;
  var matsHoverBound = false;
  /** Live drop/collect → open once; restart paint must not force-open. */
  var matsOpenOnCollect = false;

  function ipc() {
    if (global.OneToneIpc && typeof global.OneToneIpc.invoke === 'function') {
      return global.OneToneIpc;
    }
    // Soft Pad overlay never loads js/core/ipc.js — use Tauri internals directly
    // (same bridge as codex-micro-overlay.html's local `invoke`).
    var internals = global.__TAURI_INTERNALS__;
    if (!internals || typeof internals.invoke !== 'function') return null;
    return {
      invoke: function (cmd, args) {
        return internals.invoke(cmd, args || {});
      },
      listen: function (event, handler) {
        if (typeof internals.listen === 'function') {
          return internals.listen(event, handler);
        }
        var ev = global.__TAURI__ && global.__TAURI__.event;
        if (ev && typeof ev.listen === 'function') return ev.listen(event, handler);
        return Promise.reject(new Error('listen unavailable'));
      }
    };
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readUiFlag(key, fallback) {
    try {
      var ss = global.sessionStorage;
      if (!ss || !ss.getItem) return fallback;
      var v = ss.getItem(key);
      if (v == null) return fallback;
      return v === '1' || v === 'true';
    } catch (_) {
      return fallback;
    }
  }

  function writeUiFlag(key, on) {
    try {
      var ss = global.sessionStorage;
      if (ss && ss.setItem) ss.setItem(key, on ? '1' : '0');
    } catch (_) {}
  }

  function readLocalFlag(key, fallback) {
    try {
      var ls = global.localStorage;
      if (!ls || !ls.getItem) return fallback;
      var v = ls.getItem(key);
      if (v == null) return fallback;
      return v === '1' || v === 'true';
    } catch (_) {
      return fallback;
    }
  }

  function writeLocalFlag(key, on) {
    try {
      var ls = global.localStorage;
      if (ls && ls.setItem) ls.setItem(key, on ? '1' : '0');
    } catch (_) {}
  }

  function targetLabel(kind) {
    var k = String(kind || '').toLowerCase();
    if (k === 'cursor' || k === 'cursor-chat') return 'Cursor';
    if (k === 'minimax') return 'MiniMax';
    if (k === 'workbuddy' || k === 'codebuddy') return 'WorkBuddy';
    if (k === 'trae' || k === 'trae-work') return 'Trae Work';
    if (k === 'traecode' || k === 'trae-code') return 'Trae Code';
    if (k === 'qoder') return 'Qoder';
    if (k === 'chatgpt' || k === 'codex') return 'ChatGPT';
    return kind ? String(kind) : 'Agent';
  }

  function carryActive(s) {
    return !!(s && s.carry && s.carry.active);
  }

  function materialBadge(s) {
    var n = (s && (s.includedCount || s.materialCount)) || 0;
    if (n < 1 && s && s.assembledMd) n = 1;
    return Math.max(0, n);
  }

  function ensureDom(host) {
    if (rootEl && rootEl.isConnected) return rootEl;
    var parent = host || document.body;
    var el = document.createElement('div');
    el.id = 'softPadCarryRoot';
    el.className = 'sp-carry';
    el.setAttribute('data-soft-pad-carry', '1');
    el.hidden = true;
    el.innerHTML =
      '<div class="sp-carry__stack" data-sp-carry-stack>' +
      '<div class="sp-carry__bar" data-sp-carry-bar>' +
      '<div class="sp-carry__top">' +
      '<div class="sp-carry__badge" title="携带材料">' +
      '<span class="sp-carry__ico">OT</span>' +
      '<span>+<span data-sp-count>0</span></span>' +
      '</div>' +
      '<div class="sp-carry__meta">' +
      '<span class="sp-carry__pill" data-sp-pill>携带中</span>' +
      '<button type="button" class="sp-carry__icon" data-sp-act="expand" title="展开完整 Soft Pad">⤢</button>' +
      '<button type="button" class="sp-carry__icon" data-sp-act="dismiss" title="取消携带">×</button>' +
      '</div></div>' +
      '<div class="sp-carry__preview"><b>携带：</b><span data-sp-preview></span></div>' +
      '<div class="sp-carry__actions">' +
      '<button type="button" class="sp-carry__act" data-sp-act="mic" title="听指令">🎙</button>' +
      '<button type="button" class="sp-carry__act sp-carry__act--primary" data-sp-act="paste" title="粘贴到输入框">⇢|</button>' +
      '<button type="button" class="sp-carry__act sp-carry__act--ghost" data-sp-act="dismiss" title="取消携带">⊘</button>' +
      '</div></div>' +
      '<div class="sp-carry__listen" data-sp-listen hidden>' +
      '<div class="sp-carry__listen-mic" aria-hidden="true">🎙</div>' +
      '<div class="sp-carry__listen-copy">' +
      '<strong>聆听中 · 可说：粘贴、取消</strong>' +
      '<span>粘贴 → Soft Pad 粘贴键 · 取消 → 退出聆听</span>' +
      '</div></div></div>';
    parent.appendChild(el);
    rootEl = el;
    bind(el);
    return el;
  }

  function ico(kind) {
    // Compact inline SVGs — pin / trash / plus / clipboard / fold.
    if (kind === 'pin') {
      // Classic thumbtack (SF Symbols–like), not a diagonal scribble.
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M9.75 1.5a.75.75 0 0 0-1.5 0v.66c-1.55.2-2.75 1.52-2.75 3.12v.5l-1.72 1.72a.75.75 0 0 0 .53 1.28H7.5v4.47a.75.75 0 0 0 1.5 0V8.78h2.69a.75.75 0 0 0 .53-1.28L10.5 5.78v-.5c0-1.6-1.2-2.92-2.75-3.12V1.5Zm-1.5 2.18c.97.17 1.7 1.01 1.7 2.02v.81c0 .2.08.39.22.53L11 7.78H5.55l.83-.83a.75.75 0 0 0 .22-.53v-.81c0-1.01.73-1.85 1.7-2.02h.45Z"/></svg>';
    }
    if (kind === 'clear') {
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 2.75A.75.75 0 0 1 6.75 2h2.5a.75.75 0 0 1 0 1.5h-.5v.25h3.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1 0-1.5H7.75V3.5h-.5A.75.75 0 0 1 6 2.75ZM5.1 6.5a.75.75 0 0 1 .75-.65h4.3a.75.75 0 0 1 .74.65l.4 6.1A1.5 1.5 0 0 1 9.8 14H6.2a1.5 1.5 0 0 1-1.49-1.4l.4-6.1Z"/></svg>';
    }
    if (kind === 'rm') {
      // Distinct from toolbar clear (trash): row uses a plain ×.
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l2.72 2.72a.75.75 0 1 1-1.06 1.06L8 9.06l-2.72 2.72a.75.75 0 0 1-1.06-1.06L6.94 8 4.22 5.28a.75.75 0 0 1 0-1.06Z"/></svg>';
    }
    if (kind === 'add') {
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 2.5a.75.75 0 0 1 .75.75v4h4a.75.75 0 0 1 0 1.5h-4v4a.75.75 0 0 1-1.5 0v-4h-4a.75.75 0 0 1 0-1.5h4v-4A.75.75 0 0 1 8 2.5Z"/></svg>';
    }
    if (kind === 'paste') {
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 1.5h4a1.5 1.5 0 0 1 1.5 1.5v.5H13a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 13 14.5H3A1.5 1.5 0 0 1 1.5 13V5A1.5 1.5 0 0 1 3 3.5h1.5V3A1.5 1.5 0 0 1 6 1.5Zm0 1.5a.5.5 0 0 0-.5.5v.5h5V3.5a.5.5 0 0 0-.5-.5H6Zm-2.5 3A.5.5 0 0 0 3 6.5v6.5a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V6.5a.5.5 0 0 0-.5-.5H3.5Z"/></svg>';
    }
    return '‹';
  }

  /** Right slide-out materials drawer (tab when collapsed; panel overlays pad when open). */
  function ensureMatsBar() {
    if (matsBarEl && matsBarEl.isConnected) return matsBarEl;
    var existing = document.getElementById('softPadMatsBar');
    if (existing) {
      matsBarEl = existing;
      return matsBarEl;
    }
    var bar = document.createElement('div');
    bar.id = 'softPadMatsBar';
    bar.className = 'sp-mats-rail';
    bar.setAttribute('data-sp-mats-bar', '1');
    bar.setAttribute('data-sp-mats-rail', '1');
    bar.hidden = false;
    bar.innerHTML =
      '<div class="sp-mats-rail__hot" data-sp-mats-hot aria-hidden="true"></div>' +
      '<button type="button" class="sp-mats-rail__tab" data-sp-mats-toggle title="材料列表">' +
      '<span class="sp-mats-rail__tab-label">材料</span>' +
      '<span class="sp-mats-rail__tab-count" data-sp-mats-count>0</span>' +
      '</button>' +
      '<div class="sp-mats-rail__panel" data-sp-mats-panel>' +
      '<div class="sp-mats-rail__head">' +
      '<div class="sp-mats-rail__actions">' +
      '<button type="button" class="sp-mats-rail__iconbtn" data-sp-mats-add title="添加本机文件" aria-label="添加本机文件">' +
      ico('add') +
      '</button>' +
      '<button type="button" class="sp-mats-rail__iconbtn" data-sp-mats-paste title="粘贴剪贴板（文字/图片）" aria-label="粘贴">' +
      ico('paste') +
      '</button>' +
      '<button type="button" class="sp-mats-rail__iconbtn" data-sp-mats-pin title="置顶：离开 Soft Pad 也不收回" aria-label="置顶" aria-pressed="false">' +
      ico('pin') +
      '</button>' +
      '<button type="button" class="sp-mats-rail__iconbtn" data-sp-mats-clear title="清空材料" aria-label="清空">' +
      ico('clear') +
      '</button>' +
      '<button type="button" class="sp-mats-rail__iconbtn sp-mats-rail__fold" data-sp-mats-toggle title="收起" aria-label="收起">‹</button>' +
      '</div></div>' +
      '<div class="sp-mats-rail__list" data-sp-mats-list aria-label="已收入材料"></div>' +
      '</div>';
    var host = document.getElementById('wrap') || document.body;
    host.appendChild(bar);
    // Block Soft Pad window-drag; do NOT preventDefault on row delete (breaks click).
    bar.addEventListener('pointerdown', function (e) {
      e.stopPropagation();
    });
    bar.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    });
    // Near-tab hover → open (not whole Soft Pad).
    bar.addEventListener('pointerenter', function () {
      clearMatsLeaveTimer();
      setMatsDrawerOpen(true);
    });
    // Capture so row × wins even if a child SVG is the event target.
    bar.addEventListener(
      'click',
      function (e) {
        var rm = e.target && e.target.closest && e.target.closest('[data-sp-mats-rm]');
        if (rm) {
          e.preventDefault();
          e.stopPropagation();
          var mid = rm.getAttribute('data-sp-mats-rm') || '';
          if (!mid) return;
          removeMatLocal(mid);
          invokeCollect('remove', { id: mid }).then(function () {
            setTimeout(pullSnapshot, 80);
          });
          return;
        }
        var pinBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-pin]');
        if (pinBtn) {
          e.preventDefault();
          e.stopPropagation();
          setMatsPinned(!matsPinned);
          if (matsPinned) setMatsDrawerOpen(true);
          return;
        }
        var addBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-add]');
        if (addBtn) {
          e.preventDefault();
          e.stopPropagation();
          pickLocalFile();
          return;
        }
        var pasteBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-paste]');
        if (pasteBtn) {
          e.preventDefault();
          e.stopPropagation();
          ingestClipboard();
          return;
        }
        var toggleBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-toggle]');
        if (toggleBtn) {
          e.preventDefault();
          e.stopPropagation();
          setMatsDrawerOpen(!matsDrawerOpen);
          return;
        }
        var clearBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-clear]');
        if (clearBtn) {
          e.preventDefault();
          e.stopPropagation();
          confirmClearMats();
        }
      },
      true
    );
    matsBarEl = bar;
    bindMatsPadLeave();
    syncMatsPinUi();
    syncMatsRailGeometry();
    return bar;
  }

  /** Align rail height to Soft Pad chassis (macOS companion-panel style). */
  function syncMatsRailGeometry() {
    var bar = matsBarEl;
    if (!bar || !bar.isConnected) return;
    var wrap = document.getElementById('wrap');
    var pad =
      document.querySelector('.overlay-pad-stack') ||
      document.querySelector('.micro-hw') ||
      null;
    if (!wrap || !pad) return;
    var wr = wrap.getBoundingClientRect();
    var pr = pad.getBoundingClientRect();
    if (!wr.height || !pr.height) return;
    var top = Math.max(0, Math.round(pr.top - wr.top));
    var h = Math.max(120, Math.round(pr.height));
    bar.style.top = top + 'px';
    bar.style.height = h + 'px';
    bar.style.bottom = 'auto';
  }

  function clearMatsLeaveTimer() {
    if (matsLeaveTimer) {
      clearTimeout(matsLeaveTimer);
      matsLeaveTimer = null;
    }
  }

  function bindMatsPadLeave() {
    if (matsHoverBound) return;
    var wrap = document.getElementById('wrap');
    if (!wrap) return;
    matsHoverBound = true;
    wrap.addEventListener('pointerenter', function () {
      clearMatsLeaveTimer();
    });
    wrap.addEventListener('pointerleave', function () {
      clearMatsLeaveTimer();
      // Leave Soft Pad → retract unless pinned.
      matsLeaveTimer = setTimeout(function () {
        matsLeaveTimer = null;
        if (!matsPinned) setMatsDrawerOpen(false);
      }, 160);
    });
  }

  function setMatsPinned(on) {
    matsPinned = !!on;
    writeLocalFlag(PIN_KEY, matsPinned);
    syncMatsPinUi();
  }

  function syncMatsPinUi() {
    var bar = matsBarEl;
    if (!bar) return;
    bar.classList.toggle('is-pinned', matsPinned);
    var pinBtn = bar.querySelector('[data-sp-mats-pin]');
    if (pinBtn) {
      pinBtn.setAttribute('aria-pressed', matsPinned ? 'true' : 'false');
      pinBtn.setAttribute('aria-label', matsPinned ? '取消置顶' : '置顶');
      pinBtn.classList.toggle('is-on', matsPinned);
      pinBtn.title = matsPinned
        ? '取消置顶：离开 Soft Pad 将收回列表'
        : '置顶：离开 Soft Pad 也不收回';
    }
  }

  function setMatsDrawerOpen(open) {
    matsDrawerOpen = !!open;
    var bar = matsBarEl;
    if (!bar) return;
    bar.classList.toggle('is-open', matsDrawerOpen);
    bar.setAttribute('data-sp-mats-open', matsDrawerOpen ? '1' : '0');
    var wrap = document.getElementById('wrap');
    if (wrap) wrap.classList.toggle('is-mats-rail', matsDrawerOpen);
    syncMatsRailGeometry();
    // Panel overlays the pad in-place. Do NOT widen HWND — that shifts Soft Pad on screen.
  }

  function chipPreview(m) {
    if (!m) return '';
    var path = String(m.path || '').trim();
    if (path && (m.kind === 'file' || m.kind === 'image' || m.kind === 'folder')) {
      var leaf = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
      if (leaf) return leaf.length > 28 ? leaf.slice(0, 26) + '…' : leaf;
    }
    var raw = String(m.name || m.preview || m.description || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return kindLabel(m.kind);
    if (raw === '拖入的文本' || raw === '粘贴的文本' || raw === '未命名素材') {
      return kindLabel(m.kind);
    }
    // Don't put absolute paths in the one-line title.
    if (/^[A-Za-z]:[\\/]/.test(raw) || raw.indexOf('\\\\') === 0) {
      var leaf2 = raw.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || raw;
      return leaf2.length > 28 ? leaf2.slice(0, 26) + '…' : leaf2;
    }
    return raw.length > 28 ? raw.slice(0, 26) + '…' : raw;
  }

  function removeMatLocal(id) {
    if (!snap || !Array.isArray(snap.materials)) return;
    var mid = String(id || '');
    snap.materials = snap.materials.filter(function (m) {
      return m && m.id !== mid;
    });
    snap.materialCount = snap.materials.length;
    snap.includedCount = snap.materials.length;
    snap.empty = snap.materials.length < 1;
    paint();
  }

  function clearMatsLocal() {
    snap = snap && typeof snap === 'object' ? snap : {};
    snap.materials = [];
    snap.materialCount = 0;
    snap.includedCount = 0;
    snap.empty = true;
    paint();
  }

  function dismissClearConfirm() {
    var el =
      (typeof document !== 'undefined' && document.getElementById('spMatsConfirm')) || null;
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function runClearMats() {
    dismissClearConfirm();
    clearMatsLocal();
    invokeCollect('clear', {}).then(function () {
      setTimeout(pullSnapshot, 80);
    });
  }

  /**
   * Soft Pad confirm — mirrors main `.confirm-overlay` / `.confirm-modal`
   * (native browser dialogs clip inside the overlay HWND).
   */
  function confirmClearMats() {
    var n = materialBadge(snap);
    if (n < 1) {
      toast('暂无材料');
      return;
    }
    setMatsDrawerOpen(true);
    dismissClearConfirm();
    var host = document.getElementById('wrap') || document.body;
    var overlay = document.createElement('div');
    overlay.id = 'spMatsConfirm';
    overlay.className = 'sp-mats-confirm';
    overlay.setAttribute('data-sp-mats-confirm', '1');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="sp-mats-confirm__modal">' +
      '<h3 class="sp-mats-confirm__title">清空材料</h3>' +
      '<p class="sp-mats-confirm__body">清空全部 <b>' +
      n +
      '</b> 项材料？此操作不可撤销。</p>' +
      '<div class="sp-mats-confirm__actions">' +
      '<button type="button" class="sp-mats-confirm__btn" data-sp-mats-confirm-no>取消</button>' +
      '<button type="button" class="sp-mats-confirm__btn is-danger" data-sp-mats-confirm-yes>清空</button>' +
      '</div></div>';
    host.appendChild(overlay);
    requestAnimationFrame(function () {
      overlay.classList.add('is-open');
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        dismissClearConfirm();
        return;
      }
      var yes = e.target && e.target.closest && e.target.closest('[data-sp-mats-confirm-yes]');
      var no = e.target && e.target.closest && e.target.closest('[data-sp-mats-confirm-no]');
      if (yes) {
        e.preventDefault();
        e.stopPropagation();
        runClearMats();
        return;
      }
      if (no) {
        e.preventDefault();
        e.stopPropagation();
        dismissClearConfirm();
      }
    });
  }

  var matsTipEl = null;
  var matsTipHideTimer = null;

  function ensureMatsTip() {
    if (matsTipEl && matsTipEl.isConnected) return matsTipEl;
    var host = document.getElementById('wrap') || document.body;
    var el = document.createElement('div');
    el.id = 'spMatsTip';
    el.className = 'sp-mats-tip';
    el.hidden = true;
    el.setAttribute('role', 'tooltip');
    host.appendChild(el);
    matsTipEl = el;
    el.addEventListener('pointerenter', function () {
      if (matsTipHideTimer) {
        clearTimeout(matsTipHideTimer);
        matsTipHideTimer = null;
      }
    });
    el.addEventListener('pointerleave', function () {
      hideMatsTip(80);
    });
    return el;
  }

  function hideMatsTip(delay) {
    if (matsTipHideTimer) clearTimeout(matsTipHideTimer);
    matsTipHideTimer = setTimeout(function () {
      matsTipHideTimer = null;
      if (matsTipEl) {
        matsTipEl.hidden = true;
        matsTipEl.classList.remove('is-open');
      }
    }, delay == null ? 0 : delay);
  }

  function showMatsTip(row, m) {
    if (!row || !m) return;
    if (matsTipHideTimer) {
      clearTimeout(matsTipHideTimer);
      matsTipHideTimer = null;
    }
    var tip = ensureMatsTip();
    var bits = rowDetailBits(m);
    tip.innerHTML =
      '<div class="sp-mats-tip__head">' +
      esc(bits.title) +
      '</div>' +
      bits.rows
        .map(function (r) {
          return (
            '<div class="sp-mats-tip__row">' +
            '<span class="sp-mats-tip__k">' +
            esc(r.k) +
            '</span>' +
            '<span class="sp-mats-tip__v">' +
            esc(r.v) +
            '</span></div>'
          );
        })
        .join('');
    tip.hidden = false;
    tip.classList.add('is-open');
    var wrap = document.getElementById('wrap') || document.body;
    var wr = wrap.getBoundingClientRect();
    var rr = row.getBoundingClientRect();
    var tipW = Math.min(220, Math.max(160, wr.width * 0.48));
    tip.style.width = tipW + 'px';
    tip.style.maxWidth = tipW + 'px';
    // Prefer left of the row (over Soft Pad), keep inside wrap.
    var left = rr.left - wr.left - tipW - 8;
    if (left < 8) left = Math.max(8, rr.right - wr.left + 8);
    var top = rr.top - wr.top;
    tip.style.left = Math.round(left) + 'px';
    tip.style.top = Math.round(top) + 'px';
    // Clamp vertically after measure.
    requestAnimationFrame(function () {
      if (!matsTipEl || matsTipEl.hidden) return;
      var th = matsTipEl.offsetHeight || 0;
      var maxTop = Math.max(8, wr.height - th - 8);
      var t = Math.min(maxTop, Math.max(8, top));
      matsTipEl.style.top = Math.round(t) + 'px';
    });
  }

  function bindMatsTipEvents(listEl) {
    if (!listEl || typeof listEl.addEventListener !== 'function') return;
    if (
      typeof listEl.getAttribute === 'function' &&
      listEl.getAttribute('data-sp-tip-bound') === '1'
    ) {
      return;
    }
    if (typeof listEl.setAttribute === 'function') {
      listEl.setAttribute('data-sp-tip-bound', '1');
    }
    listEl.addEventListener('pointerover', function (e) {
      var row = e.target && e.target.closest && e.target.closest('.sp-mats-rail__item[data-sp-mat-id]');
      if (!row || row.classList.contains('sp-mats-rail__item--plain')) return;
      if (e.target.closest && e.target.closest('[data-sp-mats-rm]')) return;
      var id = row.getAttribute('data-sp-mat-id') || '';
      var mats = (snap && snap.materials) || [];
      var m = null;
      var i;
      for (i = 0; i < mats.length; i++) {
        if (mats[i] && String(mats[i].id) === id) {
          m = mats[i];
          break;
        }
      }
      if (m) showMatsTip(row, m);
    });
    listEl.addEventListener('pointerout', function (e) {
      var to = e.relatedTarget;
      if (to && matsTipEl && matsTipEl.contains(to)) return;
      if (to && listEl.contains(to) && to.closest && to.closest('.sp-mats-rail__item[data-sp-mat-id]')) {
        return;
      }
      hideMatsTip(120);
    });
  }

  function bind(el) {
    if (el.getAttribute('data-sp-bound') === '1') return;
    el.setAttribute('data-sp-bound', '1');
    // FE assist: don't steal FG when clicking carry controls (WS_EX_NOACTIVATE is primary).
    el.addEventListener('mousedown', function (e) {
      if (e.target && e.target.closest && e.target.closest('[data-sp-act],button')) {
        e.preventDefault();
      }
    });
    el.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('[data-sp-act]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      var act = btn.getAttribute('data-sp-act');
      if (act === 'paste') pasteOnly();
      else if (act === 'dismiss') dismissCarry();
      else if (act === 'expand') toggleExpand();
      else if (act === 'mic') toggleListen();
    });
  }

  function kindLabel(kind) {
    var k = String(kind || '').toLowerCase();
    if (k === 'text') return '文字';
    if (k === 'image') return '图片';
    if (k === 'file') return '文件';
    if (k === 'folder') return '目录';
    if (k === 'url') return '网址';
    if (k === 'voice') return '口述';
    return '材料';
  }

  function kindGlyph(kind) {
    var k = String(kind || '').toLowerCase();
    if (k === 'image') {
      return '<svg class="sp-mats-rail__type" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2.5 3.5A1.5 1.5 0 0 1 4 2h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 12 14H4a1.5 1.5 0 0 1-1.5-1.5v-9Zm1.5 0v6.3l2.1-2.1a.75.75 0 0 1 1.06 0L10 10.5l1.2-1.2a.75.75 0 0 1 1.06 0l.74.74V3.5H4Zm7.25 8.25-.72-.72-2.47 2.47H12a.5.5 0 0 0 .5-.5v-.5l-.75-.75ZM5.75 6.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z"/></svg>';
    }
    if (k === 'file') {
      return '<svg class="sp-mats-rail__type" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 1.5A1.5 1.5 0 0 0 2.5 3v10A1.5 1.5 0 0 0 4 14.5h8A1.5 1.5 0 0 0 13.5 13V5.56a1.5 1.5 0 0 0-.44-1.06L10.5 1.94A1.5 1.5 0 0 0 9.44 1.5H4Zm5.5 1.56L12.44 5.5H10a.5.5 0 0 1-.5-.5V3.06ZM4 3h4.5v2A1.5 1.5 0 0 0 10 6.5h2.5V13a.5.5 0 0 1-.5.5H4a.5.5 0 0 1-.5-.5V3A.5.5 0 0 1 4 3Z"/></svg>';
    }
    if (k === 'folder') {
      return '<svg class="sp-mats-rail__type" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M2.5 3.75A1.75 1.75 0 0 1 4.25 2h2.38c.4 0 .78.16 1.06.44L8.56 3.3h3.19A1.75 1.75 0 0 1 13.5 5.06v6.19A1.75 1.75 0 0 1 11.75 13h-7.5A1.75 1.75 0 0 1 2.5 11.25v-7.5Z"/></svg>';
    }
    if (k === 'url') {
      return '<svg class="sp-mats-rail__type" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.1 9.9a.75.75 0 0 1 0-1.06l2.8-2.8a2.5 2.5 0 1 1 3.54 3.54l-1.2 1.2a.75.75 0 1 1-1.06-1.06l1.2-1.2a1 1 0 1 0-1.42-1.42L7.16 8.84A.75.75 0 0 1 6.1 9.9Zm3.8-3.8a.75.75 0 0 1 0 1.06l-2.8 2.8a2.5 2.5 0 1 1-3.54-3.54l1.2-1.2a.75.75 0 0 1 1.06 1.06l-1.2 1.2a1 1 0 1 0 1.42 1.42l2.8-2.8a.75.75 0 0 1 1.06 0Z"/></svg>';
    }
    if (k === 'voice') {
      return '<svg class="sp-mats-rail__type" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.75a2.25 2.25 0 0 0-2.25 2.25v3a2.25 2.25 0 1 0 4.5 0v-3A2.25 2.25 0 0 0 8 1.75ZM4.5 7a.75.75 0 0 1 1.5 0 2 2 0 1 0 4 0 .75.75 0 0 1 1.5 0 3.5 3.5 0 0 1-2.75 3.4v1.35h1.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5h1.5V10.4A3.5 3.5 0 0 1 4.5 7Z"/></svg>';
    }
    // text / default
    return '<svg class="sp-mats-rail__type" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.5 2.75A.75.75 0 0 1 4.25 2h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75ZM3.5 6A.75.75 0 0 1 4.25 5.25h7.5a.75.75 0 0 1 0 1.5h-7.5A.75.75 0 0 1 3.5 6Zm0 3.25a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5h-5a.75.75 0 0 1-.75-.75ZM3.5 12.5a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 0 1.5H4.25a.75.75 0 0 1-.75-.75Z"/></svg>';
  }

  function formatCapturedAt(iso) {
    var s = String(iso || '').trim();
    if (!s) return '';
    try {
      var d = new Date(s);
      if (!isNaN(d.getTime())) {
        var hh = String(d.getHours()).padStart
          ? String(d.getHours()).padStart(2, '0')
          : ('0' + d.getHours()).slice(-2);
        var mi = String(d.getMinutes()).padStart
          ? String(d.getMinutes()).padStart(2, '0')
          : ('0' + d.getMinutes()).slice(-2);
        var hm = hh + ':' + mi;
        var now = new Date();
        var sameDay =
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate();
        if (sameDay) return '今天 ' + hm;
        var yday = new Date(now);
        yday.setDate(now.getDate() - 1);
        if (
          d.getFullYear() === yday.getFullYear() &&
          d.getMonth() === yday.getMonth() &&
          d.getDate() === yday.getDate()
        ) {
          return '昨天 ' + hm;
        }
        var mm = String(d.getMonth() + 1).padStart
          ? String(d.getMonth() + 1).padStart(2, '0')
          : ('0' + (d.getMonth() + 1)).slice(-2);
        var dd = String(d.getDate()).padStart
          ? String(d.getDate()).padStart(2, '0')
          : ('0' + d.getDate()).slice(-2);
        return mm + '-' + dd + ' ' + hm;
      }
    } catch (_) {}
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
    if (m) return m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
    return s.length > 19 ? s.slice(0, 19) : s;
  }

  function sourceLabel(raw) {
    var s = String(raw || '').trim();
    if (!s || s === 'local') return '本机';
    if (s === 'Soft Pad') return 'Soft Pad';
    return s;
  }

  function rowDetailBits(m) {
    var title = chipPreview(m) || kindLabel(m && m.kind);
    var src = sourceLabel(m && m.source);
    var when = formatCapturedAt(m && m.capturedAt) || '未知时间';
    var loc = String((m && m.path) || '').trim();
    var rows = [
      { k: '类型', v: kindLabel(m && m.kind) },
      { k: '来源', v: src },
      { k: '时间', v: when }
    ];
    if (loc) {
      rows.push({ k: '位置', v: loc });
    } else if (m && String(m.kind || '') === 'text') {
      var body = String(m.preview || m.description || m.name || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (body && body !== title) {
        rows.push({ k: '内容', v: body.slice(0, 160) });
      }
    }
    if (m && m.needsManualUpload) {
      rows.push({ k: '提示', v: '图片需在目标 Agent 中手动上传' });
    }
    return { title: title, rows: rows };
  }

  function rowListSubtitle(m) {
    var src = sourceLabel(m && m.source);
    var when = formatCapturedAt(m && m.capturedAt);
    if (src && when) return src + ' · ' + when;
    return src || when || kindLabel(m && m.kind);
  }

  function paintMats() {
    var bar = ensureMatsBar();
    syncMatsRailGeometry();
    var listEl = bar.querySelector('[data-sp-mats-list]');
    var tabCount = bar.querySelector('[data-sp-mats-count]');
    var count = materialBadge(snap);
    var list = (snap && Array.isArray(snap.materials) && snap.materials.length
      ? snap.materials
      : []
    ).slice(0, 16);
    bar.hidden = false;
    bar.classList.toggle('is-empty', count < 1);
    if (tabCount) {
      tabCount.textContent = String(count);
      tabCount.hidden = count < 1;
    }
    if (count < 1) {
      matsHadItems = false;
      matsOpenOnCollect = false;
      hideMatsTip(0);
      bar.classList.toggle('is-open', matsDrawerOpen);
      bar.setAttribute('data-sp-mats-open', matsDrawerOpen ? '1' : '0');
      if (listEl) {
        listEl.innerHTML =
          '<div class="sp-mats-rail__item sp-mats-rail__item--plain">' +
          esc('暂无材料 · 可添加或粘贴') +
          '</div>';
      }
      return;
    }
    matsHadItems = true;
    // Pinned or live collect → open; restart/passive sync → tab only (hover expands).
    if (matsPinned || matsOpenOnCollect) {
      matsOpenOnCollect = false;
      setMatsDrawerOpen(true);
    } else {
      bar.classList.toggle('is-open', matsDrawerOpen);
      bar.setAttribute('data-sp-mats-open', matsDrawerOpen ? '1' : '0');
    }
    if (!listEl) return;
    bindMatsTipEvents(listEl);
    listEl.innerHTML = list
      .map(function (m) {
        if (!m) return '';
        var preview = chipPreview(m);
        var sub = rowListSubtitle(m);
        return (
          '<div class="sp-mats-rail__item" data-sp-mat-id="' +
          esc(m.id || '') +
          '">' +
          '<span class="sp-mats-rail__kindico" aria-hidden="true">' +
          kindGlyph(m.kind) +
          '</span>' +
          '<div class="sp-mats-rail__body">' +
          '<span class="sp-mats-rail__preview">' +
          esc(preview) +
          '</span>' +
          '<span class="sp-mats-rail__sub">' +
          esc(sub) +
          '</span></div>' +
          '<button type="button" class="sp-mats-rail__x" data-sp-mats-rm="' +
          esc(m.id || '') +
          '" title="移除此项" aria-label="移除此项">' +
          ico('rm') +
          '</button></div>'
        );
      })
      .join('');
  }

  function optimisticAddMaterial(kind, name, description, opts) {
    opts = opts || {};
    snap = snap && typeof snap === 'object' ? snap : {};
    var mats = Array.isArray(snap.materials) ? snap.materials.slice() : [];
    var k = kind || 'text';
    var isPath = k === 'file' || k === 'image' || k === 'folder';
    var path = isPath ? String(description || opts.path || '').trim() : '';
    var leaf =
      (name && String(name).trim()) ||
      (path ? path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : '') ||
      '';
    var desc = String(isPath ? leaf : description || name || '')
      .replace(/\s+/g, ' ')
      .trim();
    var preview = desc.length > 40 ? desc.slice(0, 40) + '…' : desc;
    var src =
      String(opts.source || '').trim() ||
      (k === 'image' ? '本机图片' : k === 'file' || k === 'folder' ? '本机文件' : 'Soft Pad');
    mats.push({
      id: 'local_' + Date.now() + '_' + mats.length,
      kind: k,
      name: leaf || preview || kindLabel(k),
      description: preview,
      preview: preview,
      source: src,
      capturedAt: new Date().toISOString(),
      path: path,
      needsManualUpload: k === 'image'
    });
    snap.materials = mats.slice(-24);
    snap.materialCount = Math.max(Number(snap.materialCount) || 0, mats.length);
    snap.includedCount = Math.max(Number(snap.includedCount) || 0, mats.length);
    snap.empty = false;
    // Bump so a stale get_snapshot cannot clobber this paint.
    snap.contentRevision = (Number(snap.contentRevision) || 0) + 1;
    matsOpenOnCollect = true;
    paint();
  }

  function paint() {
    ensureMatsBar();
    paintMats();
    var active = carryActive(snap);
    var el = ensureDom();
    el.hidden = !active;
    el.classList.toggle('is-on', active);
    el.classList.toggle('is-carry', active);
    el.classList.toggle('is-expanded', !!formExpanded);
    var listenEl = el.querySelector('[data-sp-listen]');
    if (listenEl) listenEl.hidden = !active || !listenOn;
    if (!active) return;
    var countEl = el.querySelector('[data-sp-count]');
    var previewEl = el.querySelector('[data-sp-preview]');
    var pillEl = el.querySelector('[data-sp-pill]');
    var pasteBtn = el.querySelector('[data-sp-act="paste"]');
    if (countEl) countEl.textContent = String(materialBadge(snap));
    if (previewEl) {
      previewEl.textContent = String((snap && snap.preview) || '（无预览）');
    }
    if (pillEl) {
      var tgt = targetLabel(snap && snap.carry && snap.carry.targetKind);
      pillEl.textContent = '跟随 ' + tgt;
    }
    if (pasteBtn) {
      var hasMd = !!(snap && String(snap.assembledMd || '').trim());
      pasteBtn.disabled = !hasMd || pasteBusy;
    }
  }

  function applySnapshot(next) {
    if (!next || typeof next !== 'object') return;
    var prev = snap;
    if (prev && Array.isArray(prev.materials) && prev.materials.length) {
      var prevRev = Number(prev.contentRevision) || 0;
      var nextRev = Number(next.contentRevision) || 0;
      // Ignore stale pulls that would wipe optimistic rows (flash-then-empty bug).
      if (nextRev < prevRev) return;
      var nextMats = Array.isArray(next.materials) ? next.materials.slice() : [];
      if (nextRev === prevRev && nextMats.length < prev.materials.length) {
        var seen = {};
        var i;
        for (i = 0; i < nextMats.length; i++) {
          if (nextMats[i] && nextMats[i].id) seen[String(nextMats[i].id)] = true;
        }
        for (i = 0; i < prev.materials.length; i++) {
          var m = prev.materials[i];
          if (!m || !m.id || seen[String(m.id)]) continue;
          nextMats.push(m);
        }
        next = Object.assign({}, next, {
          materials: nextMats.slice(-24),
          materialCount: Math.max(Number(next.materialCount) || 0, nextMats.length),
          includedCount: Math.max(Number(next.includedCount) || 0, nextMats.length),
          empty: nextMats.length < 1
        });
      }
    }
    snap = next;
    paint();
  }

  function pullSnapshot() {
    var api = ipc();
    if (!api || typeof api.invoke !== 'function') return Promise.resolve(null);
    return api
      .invoke('cmd_tray_snapshot_get', {})
      .then(function (s) {
        applySnapshot(s);
        return s;
      })
      .catch(function () {
        return null;
      });
  }

  /** Cold Soft Pad may race main publish — retry a few times. */
  function pullSnapshotWithRetry() {
    var tries = 0;
    function once() {
      return pullSnapshot().then(function (s) {
        var n =
          (s &&
            (Number(s.materialCount) ||
              (Array.isArray(s.materials) ? s.materials.length : 0))) ||
          0;
        if (n > 0 || tries >= 6) return s;
        tries += 1;
        return new Promise(function (resolve) {
          setTimeout(function () {
            resolve(once());
          }, 250);
        });
      });
    }
    return once();
  }

  function subscribe() {
    var api = ipc();
    if (!api || typeof api.listen !== 'function') return;
    if (unlisten) return;
    api
      .listen('tray_changed', function (ev) {
        applySnapshot(ev && ev.payload);
      })
      .then(function (fn) {
        unlisten = typeof fn === 'function' ? fn : null;
      })
      .catch(function () {});
  }

  function pasteOnly() {
    if (pasteBusy) return Promise.resolve({ ok: false, error: 'paste_busy' });
    var api = ipc();
    if (!api || typeof api.invoke !== 'function') {
      return Promise.resolve({ ok: false, error: 'no_ipc' });
    }
    pasteBusy = true;
    paint();
    return api
      .invoke('cmd_soft_pad_paste_only', { holdMs: 40 })
      .then(function (res) {
        pasteBusy = false;
        paint();
        if (!res || !res.ok) {
          var err = (res && res.error) || 'paste_failed';
          if (err === 'no_external_foreground') toast('请先点目标输入框，再粘贴');
          else if (err === 'paste_busy') toast('粘贴进行中');
          else toast('粘贴未送达（SendInput 未确认进框）');
        }
        return res;
      })
      .catch(function () {
        pasteBusy = false;
        paint();
        toast('粘贴失败');
        return { ok: false, error: 'invoke_failed' };
      });
  }

  function dismissCarry() {
    var api = ipc();
    if (api && typeof api.invoke === 'function') {
      return api
        .invoke('cmd_tray_carry_dismiss', {})
        .then(function () {
          if (snap && snap.carry) {
            snap.carry.active = false;
            snap.carry.targetKind = null;
          }
          paint();
          toast('已取消携带（材料仍在首页）');
        })
        .catch(function () {
          if (snap && snap.carry) snap.carry.active = false;
          paint();
        });
    }
    if (snap && snap.carry) snap.carry.active = false;
    paint();
    return Promise.resolve();
  }

  function toggleExpand() {
    formExpanded = !formExpanded;
    writeUiFlag(FORM_KEY, formExpanded);
    paint();
    // Expanding returns focus to the existing full Soft Pad chrome.
    if (formExpanded) {
      try {
        var wrap = document.getElementById('wrap');
        if (wrap) wrap.classList.add('sp-carry-expanded');
        var full = document.getElementById('overlayFull');
        if (full) {
          var mini = document.getElementById('overlayMiniStack');
          if (mini) mini.hidden = true;
          full.hidden = false;
        }
      } catch (_) {}
    } else {
      try {
        var wrap2 = document.getElementById('wrap');
        if (wrap2) wrap2.classList.remove('sp-carry-expanded');
      } catch (_) {}
    }
  }

  function toggleListen() {
    listenOn = !listenOn;
    writeUiFlag(LISTEN_KEY, listenOn);
    paint();
  }

  function toast(msg) {
    try {
      var t = document.getElementById('toast');
      if (t) {
        t.textContent = String(msg || '');
        t.classList.add('show');
        setTimeout(function () {
          t.classList.remove('show');
        }, 2200);
        return;
      }
    } catch (_) {}
    try {
      if (global.console && console.info) console.info('[soft-pad-carry]', msg);
    } catch (_) {}
  }

  /** Heuristic for tests / drop validation. Dragover must NOT gate on this —
   * Windows OLE text often has empty types until drop. */
  function canAcceptDrop(dt) {
    if (!dt) return true;
    try {
      if (dt.files && dt.files.length) return true;
    } catch (_) {}
    var types = [];
    try {
      types = dt.types ? Array.prototype.slice.call(dt.types) : [];
    } catch (_) {
      types = [];
    }
    if (!types.length) return true;
    for (var i = 0; i < types.length; i++) {
      var t = String(types[i] || '').toLowerCase();
      if (
        t === 'files' ||
        t === 'text/plain' ||
        t === 'text' ||
        t === 'text/uri-list' ||
        t.indexOf('text/') === 0
      ) {
        return true;
      }
    }
    return false;
  }

  function allowDrop(e) {
    if (!e) return;
    e.preventDefault();
    try {
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    } catch (_) {}
  }

  function ensureDropHint(wrap) {
    if (!wrap || !wrap.querySelector) return null;
    var hint = wrap.querySelector('[data-sp-drop-hint]');
    if (hint) return hint;
    try {
      hint = document.createElement('div');
      hint.setAttribute('data-sp-drop-hint', '1');
      hint.className = 'sp-drop-hint';
      hint.hidden = true;
      hint.setAttribute('aria-hidden', 'true');
      hint.textContent = '松手收入材料托盘';
      wrap.appendChild(hint);
      return hint;
    } catch (_) {
      return null;
    }
  }

  function setDropTarget(wrap, on) {
    if (!wrap || !wrap.classList) return;
    wrap.classList.toggle('is-drop-target', !!on);
    var hint = ensureDropHint(wrap);
    if (hint) hint.hidden = !on;
  }

  function clearDropTarget(wrap) {
    dropDepth = 0;
    setDropTarget(wrap, false);
  }

  function invokeCollect(kind, payload) {
    var api = ipc();
    if (!api || typeof api.invoke !== 'function') {
      return Promise.resolve({ ok: false, error: 'no_ipc' });
    }
    var args = Object.assign({ kind: kind }, payload || {});
    return api.invoke('cmd_tray_collect_from_soft_pad', args).catch(function () {
      return { ok: false, error: 'invoke_failed' };
    });
  }

  function afterCollectOk(res) {
    if (res && res.ok) {
      toast('已收入材料托盘');
      // Prefer tray_changed; delayed pull only as backup (merge guards optimistic rows).
      setTimeout(pullSnapshot, 600);
      setTimeout(pullSnapshot, 1600);
      return;
    }
    if (res && res.error === 'too_large') {
      toast('内容过大');
      return;
    }
    toast('收入托盘失败');
  }

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      if (!blob) {
        reject(new Error('no_blob'));
        return;
      }
      var r = new FileReader();
      r.onload = function () {
        var s = String(r.result || '');
        var i = s.indexOf(',');
        resolve(i >= 0 ? s.slice(i + 1) : s);
      };
      r.onerror = function () {
        reject(new Error('read_failed'));
      };
      r.readAsDataURL(blob);
    });
  }

  function inboxWrite(name, bytesBase64) {
    var api = ipc();
    if (!api || typeof api.invoke !== 'function') {
      return Promise.reject(new Error('no_ipc'));
    }
    return api.invoke('cmd_tray_inbox_write', {
      name: name || 'clipboard.png',
      bytesBase64: bytesBase64
    });
  }

  function collectImageBlob(blob, nameHint) {
    return collectBlobFile(blob, nameHint);
  }

  /** Any File/Blob → tray inbox path → attach (works when WebView File has no .path). */
  function collectBlobFile(blob, nameHint) {
    var name =
      (nameHint && String(nameHint)) ||
      (blob && blob.name) ||
      'clipboard.bin';
    var isImg =
      (blob && blob.type && String(blob.type).indexOf('image/') === 0) ||
      /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
    if (isImg && !/\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
      var t = (blob && blob.type) || '';
      if (t.indexOf('jpeg') >= 0 || t.indexOf('jpg') >= 0) name = 'clipboard.jpg';
      else if (t.indexOf('gif') >= 0) name = 'clipboard.gif';
      else if (t.indexOf('webp') >= 0) name = 'clipboard.webp';
      else name = 'clipboard.png';
    }
    var kind = isImg ? 'image' : 'file';
    return blobToBase64(blob).then(function (b64) {
      return inboxWrite(name, b64).then(function (path) {
        var p = String(path || '').trim();
        if (!p) throw new Error('no_path');
        optimisticAddMaterial(kind, name, p, { source: '剪贴板' });
        return invokeCollect('attach', { path: p, name: name });
      });
    });
  }

  function setOverlayTopmostSuspended(on) {
    var api = ipc();
    if (!api || typeof api.invoke !== 'function') return Promise.resolve(false);
    return api
      .invoke('cmd_codex_micro_overlay_suspend_topmost', { suspend: !!on })
      .catch(function () {
        return false;
      });
  }

  function collectTextPayload(text, opts) {
    opts = opts || {};
    var t = String(text || '').trim();
    if (!t) return Promise.resolve({ ok: false, error: 'empty' });
    optimisticAddMaterial('text', t, t, {
      source: opts.source || '剪贴板'
    });
    return invokeCollect('text', { text: t });
  }

  function collectFilePath(path, name, opts) {
    opts = opts || {};
    var p = String(path || '').trim();
    if (!p) return Promise.resolve({ ok: false, error: 'empty_path' });
    var n = String(name || p.split(/[\\/]/).pop() || p);
    var kind = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(n) ? 'image' : 'file';
    optimisticAddMaterial(kind, n, p, {
      source: opts.source || (kind === 'image' ? '本机图片' : '本机文件')
    });
    return invokeCollect('attach', { path: p, name: n });
  }

  var pickBusy = false;

  /** WebView <input type=file> — OS dialog owned by Soft Pad HWND (no PowerShell). */
  function pickViaHtmlInput() {
    return new Promise(function (resolve) {
      if (typeof document === 'undefined') {
        resolve(null);
        return;
      }
      var input = document.createElement('input');
      input.type = 'file';
      input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      var done = false;
      function finish(val) {
        if (done) return;
        done = true;
        try {
          if (typeof global.removeEventListener === 'function') {
            global.removeEventListener('focus', onWinFocus);
          }
        } catch (_) {}
        try {
          if (input.parentNode) input.parentNode.removeChild(input);
        } catch (_) {}
        resolve(val);
      }
      function fileFromInput() {
        var f = input.files && input.files[0];
        if (!f) return null;
        var path = String(f.path || '').trim();
        if (path) return { path: path, name: f.name || path };
        // No Tauri File.path — still ingest via inbox blob write.
        return { blob: f, name: f.name || 'picked.bin' };
      }
      function onWinFocus() {
        // Dialog closed (ok or cancel) — give change event a beat to land.
        setTimeout(function () {
          if (done) return;
          finish(fileFromInput());
        }, 350);
      }
      input.addEventListener('change', function () {
        finish(fileFromInput());
      });
      input.addEventListener('cancel', function () {
        finish(null);
      });
      document.body.appendChild(input);
      if (typeof global.addEventListener === 'function') {
        global.addEventListener('focus', onWinFocus);
      }
      try {
        input.click();
      } catch (_) {
        finish(null);
      }
    });
  }

  function pickViaCmd() {
    var api = ipc();
    if (!api || typeof api.invoke !== 'function') {
      return Promise.resolve(null);
    }
    return api.invoke('cmd_pick_path', { kind: 'file' }).then(function (path) {
      var p = String(path || '').trim();
      if (!p) return null;
      return { path: p, name: p.split(/[\\/]/).pop() || p };
    });
  }

  function pickLocalFile() {
    setMatsDrawerOpen(true);
    if (pickBusy) return Promise.resolve(null);
    pickBusy = true;
    toast('打开文件…');
    // Soft Pad owns the dialog via <input type=file>. Suspend always-on-top so the
    // OS picker is not buried; do not chain slow PowerShell cmd_pick_path.
    var htmlOk = typeof document !== 'undefined' && !!document.createElement;
    return setOverlayTopmostSuspended(true)
      .then(function () {
        return htmlOk ? pickViaHtmlInput() : pickViaCmd();
      })
      .then(function (picked) {
        return setOverlayTopmostSuspended(false).then(function () {
          return picked;
        });
      })
      .catch(function (err) {
        return setOverlayTopmostSuspended(false).then(function () {
          throw err;
        });
      })
      .then(function (picked) {
        if (!picked) {
          toast('未选择文件');
          return null;
        }
        if (picked.blob) {
          return collectBlobFile(picked.blob, picked.name).then(afterCollectOk);
        }
        return collectFilePath(picked.path, picked.name).then(afterCollectOk);
      })
      .catch(function () {
        toast('无法打开文件选择器');
        return null;
      })
      .then(function (res) {
        pickBusy = false;
        return res;
      });
  }

  function materialsMarkdown(s) {
    if (s && String(s.assembledMd || '').trim()) return String(s.assembledMd);
    var mats = (s && s.materials) || [];
    if (!mats.length) return '';
    var lines = ['# 材料托盘', ''];
    var i;
    for (i = 0; i < mats.length; i++) {
      var m = mats[i] || {};
      var title = String(m.name || m.preview || '材料 ' + (i + 1)).trim();
      lines.push('## ' + title);
      if (m.path) lines.push('`' + String(m.path) + '`');
      else if (m.preview || m.description) {
        lines.push(String(m.preview || m.description));
      }
      lines.push('');
    }
    return lines.join('\n').trim() + '\n';
  }

  function writeTextClipboard(text) {
    var t = String(text || '');
    if (!t) return Promise.reject(new Error('empty'));
    var clip = global.navigator && global.navigator.clipboard;
    if (clip && typeof clip.writeText === 'function') {
      return clip.writeText(t);
    }
    return Promise.reject(new Error('no_clipboard'));
  }

  /** Ctrl+C on Soft Pad → materials as Markdown. Also ask main to assemble+write full MD. */
  function copyMaterialsMd() {
    var local = materialsMarkdown(snap);
    var n = materialBadge(snap);
    if (n < 1 && !local) {
      toast('暂无材料可复制');
      return Promise.resolve(null);
    }
    // Ask main to ensureAssembled + write full clipboard (tray materials lack full text body).
    invokeCollect('copy_md', {});
    if (!local) {
      toast('正在装订并复制…');
      return Promise.resolve(null);
    }
    return writeTextClipboard(local)
      .then(function () {
        toast('已复制材料 Markdown');
        return local;
      })
      .catch(function () {
        toast('复制失败（已请求主窗写入剪贴板）');
        return null;
      });
  }

  function fileFromClipboardItem(item, mime) {
    if (!item || typeof item.getType !== 'function') return Promise.resolve(null);
    return item.getType(mime).then(function (blob) {
      return blob || null;
    });
  }

  function ingestTextOrFail(text, emptyMsg) {
    if (!String(text || '').trim()) {
      toast(emptyMsg || '剪贴板为空');
      return Promise.resolve(null);
    }
    return collectTextPayload(text).then(afterCollectOk);
  }

  /** Prefer image (browser copy), else text. Soft Pad IPC must work for tray write. */
  function ingestClipboard() {
    setMatsDrawerOpen(true);
    var clip = global.navigator && global.navigator.clipboard;
    if (clip && typeof clip.read === 'function') {
      return clip
        .read()
        .then(function (items) {
          var list = items || [];
          var i;
          var j;
          for (i = 0; i < list.length; i++) {
            var types = (list[i] && list[i].types) || [];
            for (j = 0; j < types.length; j++) {
              if (String(types[j]).indexOf('image/') === 0) {
                return fileFromClipboardItem(list[i], types[j]).then(function (blob) {
                  if (!blob) return { ok: false, error: 'empty' };
                  return collectImageBlob(blob).then(afterCollectOk);
                });
              }
            }
          }
          if (typeof clip.readText === 'function') {
            return clip.readText().then(function (text) {
              return ingestTextOrFail(text);
            });
          }
          toast('剪贴板无可识别内容');
          return null;
        })
        .catch(function () {
          if (clip && typeof clip.readText === 'function') {
            return clip.readText().then(function (text) {
              return ingestTextOrFail(text, '无法读取剪贴板（或为空）');
            });
          }
          toast('无法读取剪贴板');
          return null;
        });
    }
    if (clip && typeof clip.readText === 'function') {
      return clip.readText().then(function (text) {
        return ingestTextOrFail(text);
      });
    }
    toast('当前环境不支持读取剪贴板');
    return Promise.resolve(null);
  }

  function bindMatsHotkeys() {
    if (typeof document === 'undefined' || document.documentElement.getAttribute('data-sp-mats-keys') === '1') {
      return;
    }
    document.documentElement.setAttribute('data-sp-mats-keys', '1');
    document.addEventListener(
      'keydown',
      function (e) {
        if (!e) return;
        var mod = e.ctrlKey || e.metaKey;
        if (!mod || e.altKey) return;
        var key = String(e.key || '').toLowerCase();
        // Only when Soft Pad / mats rail has focus-ish activity (overlay is topmost).
        if (key === 'v') {
          var tag = e.target && e.target.tagName ? String(e.target.tagName).toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable)) {
            return; // native paste into Soft Pad fields
          }
          e.preventDefault();
          ingestClipboard();
          return;
        }
        if (key === 'c') {
          var sel = '';
          try {
            sel = String((global.getSelection && global.getSelection()) || '');
          } catch (_) {}
          if (sel && String(sel).trim()) return; // native copy of selection
          e.preventDefault();
          copyMaterialsMd();
        }
      },
      true
    );
  }

  function extractDropText(dt) {
    if (!dt) return '';
    var keys = ['text/plain', 'text', 'Text', 'text/uri-list'];
    var i;
    for (i = 0; i < keys.length; i++) {
      try {
        var raw = dt.getData(keys[i]);
        var t = String(raw || '').trim();
        if (t) return t;
      } catch (_) {}
    }
    try {
      var html = dt.getData('text/html');
      if (html && typeof document !== 'undefined' && document.createElement) {
        var tmp = document.createElement('div');
        tmp.innerHTML = String(html);
        var fromHtml = String(tmp.textContent || tmp.innerText || '').trim();
        if (fromHtml) return fromHtml;
      }
    } catch (_) {}
    return '';
  }

  function imageBlobFromDataTransfer(dt) {
    if (!dt) return null;
    try {
      var items = dt.items;
      if (items && items.length) {
        var i;
        for (i = 0; i < items.length; i++) {
          var it = items[i];
          if (it && it.kind === 'file' && String(it.type || '').indexOf('image/') === 0) {
            var f = typeof it.getAsFile === 'function' ? it.getAsFile() : null;
            if (f) return f;
          }
        }
      }
    } catch (_) {}
    return null;
  }

  function handleDrop(e, wrap) {
    if (!e || !e.dataTransfer) return;
    e.preventDefault();
    e.stopPropagation();
    clearDropTarget(wrap);
    var dt = e.dataTransfer;
    var imgBlob = imageBlobFromDataTransfer(dt);
    if (imgBlob && !(imgBlob.path && String(imgBlob.path).trim())) {
      collectImageBlob(imgBlob)
        .then(afterCollectOk)
        .catch(function () {
          toast('图片收入失败');
          pullSnapshot();
        });
      return;
    }
    var text = extractDropText(dt);
    if (text) {
      collectTextPayload(text, { source: 'Soft Pad 拖入' }).then(afterCollectOk);
      return;
    }
    var files = dt.files;
    if (!files || !files.length) {
      toast('没有可收入的内容');
      return;
    }
    var chain = Promise.resolve({ ok: true });
    var n = Math.min(files.length, 8);
    var i;
    for (i = 0; i < n; i++) {
      (function (f) {
        var path = (f && f.path && String(f.path).trim()) || '';
        var name = (f && f.name) || path || 'file';
        if (path) {
          chain = chain.then(function () {
            return collectFilePath(path, name);
          });
        } else if (f && String(f.type || '').indexOf('image/') === 0) {
          chain = chain.then(function () {
            return collectImageBlob(f, name);
          });
        }
      })(files[i]);
    }
    chain.then(afterCollectOk).catch(function () {
      toast('收入托盘失败');
      pullSnapshot();
    });
  }

  function handlePasteEvent(e) {
    var cd = e && e.clipboardData;
    if (!cd) return;
    var items = cd.items;
    var i;
    if (items && items.length) {
      for (i = 0; i < items.length; i++) {
        var it = items[i];
        if (it && it.kind === 'file' && String(it.type || '').indexOf('image/') === 0) {
          var blob = typeof it.getAsFile === 'function' ? it.getAsFile() : null;
          if (blob) {
            e.preventDefault();
            e.stopPropagation();
            setMatsDrawerOpen(true);
            collectImageBlob(blob)
              .then(afterCollectOk)
              .catch(function () {
                toast('图片粘贴失败');
                pullSnapshot();
              });
            return;
          }
        }
      }
    }
    if (cd.files && cd.files.length) {
      var f0 = cd.files[0];
      if (f0) {
        e.preventDefault();
        e.stopPropagation();
        setMatsDrawerOpen(true);
        var path = (f0.path && String(f0.path).trim()) || '';
        if (path) {
          collectFilePath(path, f0.name).then(afterCollectOk);
        } else {
          collectImageBlob(f0, f0.name)
            .then(afterCollectOk)
            .catch(function () {
              toast('粘贴失败');
              pullSnapshot();
            });
        }
        return;
      }
    }
    var text = '';
    try {
      text = String(cd.getData('text/plain') || '').trim();
    } catch (_) {}
    if (text) {
      e.preventDefault();
      e.stopPropagation();
      setMatsDrawerOpen(true);
      collectTextPayload(text).then(afterCollectOk);
    }
  }

  function bindDropZone(host) {
    var wrap =
      (host && host.id === 'wrap' && host) ||
      document.getElementById('wrap') ||
      host ||
      null;
    if (!wrap || wrap.getAttribute('data-sp-drop-bound') === '1') return;
    wrap.setAttribute('data-sp-drop-bound', '1');
    dropBoundEl = wrap;
    ensureDropHint(wrap);

    // Always preventDefault on enter/over — empty types during OS text drag still
    // need copy cursor; gating caused the Windows "禁止" glyph.
    wrap.addEventListener('dragenter', function (e) {
      allowDrop(e);
      dropDepth += 1;
      setDropTarget(wrap, true);
    });
    wrap.addEventListener('dragover', function (e) {
      allowDrop(e);
      setDropTarget(wrap, true);
    });
    wrap.addEventListener('dragleave', function () {
      dropDepth = Math.max(0, dropDepth - 1);
      if (dropDepth === 0) setDropTarget(wrap, false);
    });
    wrap.addEventListener('drop', function (e) {
      handleDrop(e, wrap);
    });
    wrap.addEventListener('paste', function (e) {
      handlePasteEvent(e);
    });

    // Capture on document so chrome/keys children don't leave dropEffect=none.
    if (typeof document !== 'undefined' && document.documentElement) {
      var root = document.documentElement;
      if (root.getAttribute('data-sp-drop-doc') !== '1') {
        root.setAttribute('data-sp-drop-doc', '1');
        root.addEventListener(
          'dragover',
          function (e) {
            allowDrop(e);
          },
          true
        );
        root.addEventListener(
          'drop',
          function (e) {
            if (!dropBoundEl) return;
            handleDrop(e, dropBoundEl);
          },
          true
        );
      }
    }
  }

  function mount(host) {
    formExpanded = readUiFlag(FORM_KEY, false);
    listenOn = readUiFlag(LISTEN_KEY, false);
    matsPinned = readLocalFlag(PIN_KEY, false);
    var mountHost = host || document.getElementById('wrap') || document.body;
    ensureMatsBar();
    ensureDom(mountHost);
    bindDropZone(mountHost);
    bindMatsHotkeys();
    subscribe();
    pullSnapshotWithRetry();
    paint();
    if (typeof global.addEventListener === 'function' && !global.__otSpMatsGeomBound) {
      global.__otSpMatsGeomBound = true;
      global.addEventListener('resize', function () {
        syncMatsRailGeometry();
      });
    }
  }

  global.OneToneSoftPadCarry = {
    mount: mount,
    pull: pullSnapshot,
    applySnapshot: applySnapshot,
    pasteOnly: pasteOnly,
    dismissCarry: dismissCarry,
    getSnapshot: function () {
      return snap;
    },
    isActive: function () {
      return carryActive(snap);
    },
    __testOnly: {
      canAcceptDrop: canAcceptDrop,
      extractDropText: extractDropText,
      imageBlobFromDataTransfer: imageBlobFromDataTransfer,
      pickLocalFile: pickLocalFile,
      ingestClipboard: ingestClipboard,
      copyMaterialsMd: copyMaterialsMd,
      materialsMarkdown: materialsMarkdown,
      getDropBoundEl: function () {
        return dropBoundEl;
      },
      getMatsBar: function () {
        return matsBarEl;
      }
    }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        mount();
      });
    } else {
      try {
        mount();
      } catch (_) {}
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
