/**
 * Soft Pad Form B — read-only tray projection (overlay WebView).
 * Listens tray_changed; paste via cmd_soft_pad_paste_only; dismiss ≠ clear materials.
 */
(function (global) {
  'use strict';

  var FORM_KEY = 'onetone.softPad.carryForm';
  var LISTEN_KEY = 'onetone.softPad.carryListen';
  /** Persist across restart — pin only keeps an explicitly opened drawer from auto-closing. */
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
  /** Ignore leave-close briefly after open (HWND widen + panel slide churn). */
  var matsLeaveGuardUntil = 0;
  /** Live drop/collect → open once; restart paint must not force-open. */
  var matsOpenOnCollect = false;
  /** Handoff / paste assist: open once; leave Soft Pad still retracts (pin is the only hold). */
  var matsAssistOpen = false;
  /** User dismissed bottom dock; cleared on next carry handoff. */
  var dockDismissed = false;
  /** Last carry generation we already reacted to (null = Soft Pad just mounted). */
  var lastArmedCarryGen = null;
  /** Bottom paste dock only after a fresh homepage handoff in this Soft Pad session. */
  var carryUiArmed = false;
  /** Fresh homepage handoff window when Soft Pad mounts after setCarryActive. */
  var HANDOFF_FRESH_MS = 120000;
  /** Mini bar materials popover (not the full-pad side rail). */
  var miniMatsOpen = false;
  var miniMatsEl = null;
  var miniMatsDocBound = false;
  /** Mini list fold — open by default when there are items. */
  var miniMatsListOpen = true;
  /** Serialize mats HWND IPC — ignore stale async responses; queue while overlay dragging. */
  var matsRailSeq = 0;
  var matsRailQueued = null;

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
    if (k === 'claude' || k === 'claude-code') return 'Claude';
    if (k === 'minimax' || k === 'minimax-chat') return 'MiniMax';
    if (k === 'workbuddy' || k === 'codebuddy' || k === 'workbuddy-chat') return 'WorkBuddy';
    if (k === 'trae' || k === 'trae-work' || k === 'trae-chat') return 'Trae Work';
    if (k === 'traecode' || k === 'trae-code') return 'Trae Code';
    if (k === 'qoder' || k === 'qoder-chat') return 'Qoder';
    if (k === 'windsurf' || k === 'windsurf-chat') return 'Windsurf';
    if (k === 'chatgpt' || k === 'codex' || k === 'codex-chat') return 'Codex';
    if (k === 'copilot' || k === 'copilotcli' || k === 'copilot-cli') return 'Copilot';
    if (k === 'copilotvscode' || k === 'copilot-vscode') return 'Copilot';
    if (k === 'gemini' || k === 'gemini-cli') return 'Gemini';
    if (k === 'cline' || k === 'cline-chat') return 'Cline';
    if (k === 'roo' || k === 'roo-chat') return 'Roo';
    if (k === 'opencode' || k === 'opencode-chat') return 'OpenCode';
    if (k === 'aider' || k === 'aider-chat') return 'Aider';
    return kind ? String(kind) : 'Agent';
  }

  function activeAgentChip() {
    try {
      return document.querySelector(
        '.soft-pad-agent-bar__chip[aria-pressed="true"], .soft-pad-agent-bar__chip.is-active, .soft-pad-agent-bar__chip.is-on'
      );
    } catch (_) {
      return null;
    }
  }

  /** Soft Pad FG chip → carry targetKind → Cursor. */
  function resolveTargetKind(s) {
    var fromCarry = s && s.carry && s.carry.targetKind;
    if (fromCarry) return String(fromCarry);
    var on = activeAgentChip();
    var a = on && on.getAttribute('data-agent');
    if (a) return a;
    return 'cursor';
  }

  /** Prefer the live Soft Pad chip <img> so badge matches the bar exactly. */
  function targetIconSrc(kind) {
    var on = activeAgentChip();
    var img = on && on.querySelector && on.querySelector('img[src]');
    var chipSrc = img && String(img.getAttribute('src') || '').trim();
    if (chipSrc) return chipSrc;
    var k = String(kind || '').toLowerCase();
    if (k === 'cursor' || k === 'cursor-chat') return 'icons/app-target/cursor.png';
    if (k === 'claude' || k === 'claude-code') return 'icons/app-target/claude.png';
    if (k === 'chatgpt' || k === 'codex' || k === 'codex-chat') return 'icons/app-target/codex.png';
    if (k === 'minimax' || k === 'minimax-chat') return 'icons/app-target/minimaxcode.png';
    if (k === 'workbuddy' || k === 'codebuddy' || k === 'workbuddy-chat') {
      return 'icons/app-target/workbuddy.png';
    }
    if (k === 'trae' || k === 'trae-work' || k === 'trae-chat') return 'icons/app-target/trae.png';
    if (k === 'traecode' || k === 'trae-code') return 'icons/app-target/trae-code.png';
    if (k === 'qoder' || k === 'qoder-chat') return 'icons/app-target/qoder.png';
    if (k === 'windsurf' || k === 'windsurf-chat') return 'icons/app-target/windsurf.png';
    if (k === 'copilot' || k === 'copilotcli' || k === 'copilot-cli') {
      return 'icons/app-target/copilot.png';
    }
    if (k === 'copilotvscode' || k === 'copilot-vscode') return 'icons/app-target/copilot.png';
    if (k === 'gemini' || k === 'gemini-cli') return 'icons/app-target/gemini.png';
    if (k === 'cline' || k === 'cline-chat') return 'icons/app-target/cline.png';
    if (k === 'roo' || k === 'roo-chat') return 'icons/app-target/roo.png';
    if (k === 'opencode' || k === 'opencode-chat') return 'icons/app-target/opencode.png';
    if (k === 'aider' || k === 'aider-chat') return 'icons/app-target/aider.png';
    return 'icons/app-target/cursor.png';
  }

  function carryActive(s) {
    return !!(s && s.carry && s.carry.active);
  }

  function materialBadge(s) {
    var n = (s && (s.includedCount || s.materialCount)) || 0;
    if (n < 1 && s && s.assembledMd) n = 1;
    return Math.max(0, n);
  }

  /** Show paste dock only after a fresh homepage handoff (not stale carry.active in RAM). */
  function shouldShowCarryUi(s) {
    if (dockDismissed) return false;
    if (!carryActive(s)) {
      carryUiArmed = false;
      return false;
    }
    return carryUiArmed;
  }

  function requestOverlayFit() {
    try {
      if (typeof global.__otReportOverlayFitContent === 'function') {
        global.__otReportOverlayFitContent();
      }
    } catch (_) {}
  }

  function ensureDom(host) {
    if (rootEl && rootEl.isConnected) {
      var icoEl = rootEl.querySelector('.sp-carry__ico');
      var icoText = String((icoEl && icoEl.textContent) || '').replace(/\s+/g, '');
      // Old mount (OT letters / no paste label / no agent img) → rebuild once.
      if (
        !rootEl.querySelector('[data-sp-agent-img]') ||
        !rootEl.querySelector('[data-sp-paste-lbl]') ||
        icoText === 'OT'
      ) {
        try {
          if (rootEl.parentNode) rootEl.parentNode.removeChild(rootEl);
        } catch (_) {}
        rootEl = null;
      } else {
        return rootEl;
      }
    }
    // Dock inside pad stack so fit_content height includes paste bar (not clipped).
    var stack = document.querySelector('.overlay-pad-stack');
    var parent = stack || host || document.body;
    var el = document.createElement('div');
    el.id = 'softPadCarryRoot';
    el.className = 'sp-carry sp-carry--dock';
    el.setAttribute('data-soft-pad-carry', '1');
    el.hidden = true;
    el.innerHTML =
      '<div class="sp-carry__stack" data-sp-carry-stack>' +
      '<div class="sp-carry__bar" data-sp-carry-bar>' +
      '<div class="sp-carry__top">' +
      '<div class="sp-carry__badge" title="携带材料" data-sp-badge>' +
      '<span class="sp-carry__ico" data-sp-agent-ico aria-hidden="true">' +
      '<img data-sp-agent-img src="icons/app-target/cursor.png" alt="" />' +
      '</span>' +
      '<span>+<span data-sp-count>0</span></span>' +
      '</div>' +
      '<div class="sp-carry__meta">' +
      '<span class="sp-carry__pill" data-sp-pill>材料就绪</span>' +
      '<button type="button" class="sp-carry__icon" data-sp-act="dismiss" title="收起操作条">×</button>' +
      '</div></div>' +
      '<p class="sp-carry__hint" data-sp-hint>先点目标输入框，再按「粘贴」</p>' +
      '<div class="sp-carry__preview"><b>将粘贴：</b><span data-sp-preview></span></div>' +
      '<div class="sp-carry__actions">' +
      '<button type="button" class="sp-carry__act sp-carry__act--primary sp-carry__act--paste" data-sp-act="paste" title="先点目标输入框，再按此粘贴">' +
      ico('paste') +
      '<span data-sp-paste-lbl>粘贴</span></button>' +
      '<button type="button" class="sp-carry__act sp-carry__act--wide" data-sp-act="mats" title="展开材料列表">' +
      ico('mats') +
      '<span>材料</span></button>' +
      '<button type="button" class="sp-carry__act sp-carry__act--wide" data-sp-act="copy" title="复制 Markdown">' +
      ico('copy') +
      '<span>复制</span></button>' +
      '<button type="button" class="sp-carry__act sp-carry__act--ghost" data-sp-act="dismiss" title="收起">收起</button>' +
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

  function armMatsAssist() {
    matsAssistOpen = true;
    matsOpenOnCollect = false;
    if (isMiniMode()) {
      setMiniMatsOpen(true);
      paintMiniMatsPop();
      return;
    }
    setMatsDrawerOpen(true);
  }

  function clearMatsAssist() {
    matsAssistOpen = false;
  }

  /** Homepage jump or live gen bump — never arm from a cold pull of stale carry.active. */
  function isFreshHandoff(s, prev) {
    if (!carryActive(s)) return false;
    var nextGen = (s.carry && Number(s.carry.generation)) || 0;
    var prevGen = (prev && prev.carry && Number(prev.carry.generation)) || 0;
    var prevCarry = carryActive(prev);
    if (prev) {
      return !prevCarry || nextGen > prevGen;
    }
    // Soft Pad just mounted: only reopen chrome if carry was updated very recently.
    var updated = s.carry && s.carry.updatedAt;
    var t = updated ? Date.parse(String(updated)) : NaN;
    if (!isFinite(t)) return false;
    return Date.now() - t < HANDOFF_FRESH_MS;
  }

  function isMiniMode() {
    var wrap = document.getElementById('wrap');
    return !!(wrap && wrap.classList.contains('is-minimized'));
  }

  function matsBlocksWindowDrag(target) {
    return !!(
      target &&
      target.closest &&
      target.closest(
        'button,summary,details,[data-sp-mats-toggle],[data-sp-mini-mats-close],[data-sp-mats-pin],[data-sp-mats-add],[data-sp-mats-capture],[data-sp-mats-paste],[data-sp-mats-paste-target],[data-sp-mats-clear],[data-sp-mats-rm],.sp-mats-rail__item,[data-sp-mats-list],[data-sp-mini-mats-fold],.sp-mini-mats__fold-sum,.sp-mini-mats__head,.sp-mini-mats__title,.sp-mini-mats__panel,.sp-mini-mats__preview,.sp-mini-mats__ops'
      )
    );
  }

  function toggleMiniMatsFold(forceNext) {
    var pop = ensureMiniMatsPop();
    var fold = pop && pop.querySelector('[data-sp-mini-mats-fold]');
    if (!fold) return;
    var next = forceNext != null ? !!forceNext : !fold.open;
    fold.open = next;
    miniMatsListOpen = next;
  }

  function miniMatsPreviewText() {
    var raw = String((snap && snap.preview) || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) {
      var md = String((snap && snap.assembledMd) || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (md) raw = md.length > 96 ? md.slice(0, 96) + '…' : md;
    }
    if (!raw && snap && Array.isArray(snap.materials) && snap.materials[0]) {
      raw = chipPreview(snap.materials[0]);
    }
    return raw || '（暂无内容 · 可先收入剪贴板或添加文件）';
  }

  function toggleMatsPanelOpen(forceNext) {
    var next =
      forceNext != null ? !!forceNext : isMiniMode() ? !miniMatsOpen : !matsDrawerOpen;
    if (isMiniMode()) {
      setMiniMatsOpen(next);
      return;
    }
    if (!next) {
      clearMatsAssist();
      matsOpenOnCollect = false;
    }
    setMatsDrawerOpen(next);
  }

  function handleMatsPanelClick(e) {
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
      return;
    }
    var addBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-add]');
    if (addBtn) {
      e.preventDefault();
      e.stopPropagation();
      pickLocalFile();
      return;
    }
    var captureBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-capture]');
    if (captureBtn) {
      e.preventDefault();
      e.stopPropagation();
      var sc = global.OneToneSmartCapture;
      if (sc && typeof sc.begin === 'function') {
        sc.begin('softPad').catch(function (err) {
          toast(String((err && err.message) || err || '截图启动失败'));
        });
      } else {
        toast('智能截图未就绪');
      }
      return;
    }
    var pasteTargetBtn =
      e.target && e.target.closest && e.target.closest('[data-sp-mats-paste-target]');
    if (pasteTargetBtn) {
      e.preventDefault();
      e.stopPropagation();
      pasteOnly();
      return;
    }
    var pasteBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-paste]');
    if (pasteBtn) {
      e.preventDefault();
      e.stopPropagation();
      ingestClipboard();
      return;
    }
    var closeBtn =
      e.target &&
      e.target.closest &&
      e.target.closest('[data-sp-mini-mats-close],.sp-mats-rail__fold');
    if (closeBtn) {
      e.preventDefault();
      e.stopPropagation();
      toggleMatsPanelOpen(false);
      return;
    }
    var toggleBtn =
      e.target && e.target.closest && e.target.closest('[data-sp-mats-toggle]');
    if (toggleBtn) {
      e.preventDefault();
      e.stopPropagation();
      // Tab toggles open/closed — must not pass false (that forced close and blocked open).
      toggleMatsPanelOpen();
      return;
    }
    var clearBtn = e.target && e.target.closest && e.target.closest('[data-sp-mats-clear]');
    if (clearBtn) {
      e.preventDefault();
      e.stopPropagation();
      confirmClearMats();
    }
  }

  function bindMatsPanelListeners(el) {
    if (!el || el.getAttribute('data-sp-mats-bound') === '1') return;
    el.setAttribute('data-sp-mats-bound', '1');
    el.addEventListener('pointerdown', function (e) {
      if (matsBlocksWindowDrag(e.target)) e.stopPropagation();
    });
    el.addEventListener('mousedown', function (e) {
      if (matsBlocksWindowDrag(e.target)) e.stopPropagation();
    });
    el.addEventListener(
      'click',
      function (e) {
        handleMatsPanelClick(e);
      },
      true
    );
  }

  function ensureMiniMatsPop() {
    function miniPopIsCurrent(el) {
      return !!(
        el &&
        el.querySelector('[data-sp-mini-mats-preview]') &&
        el.querySelector('[data-sp-mini-mats-fold]')
      );
    }
    if (miniMatsEl && miniMatsEl.isConnected) {
      if (miniPopIsCurrent(miniMatsEl)) return miniMatsEl;
      try {
        miniMatsEl.remove();
      } catch (_) {}
      miniMatsEl = null;
    }
    var existing = document.getElementById('spMiniMatsPop');
    if (miniPopIsCurrent(existing)) {
      miniMatsEl = existing;
      bindMatsPanelListeners(existing);
      return existing;
    }
    if (existing) {
      try {
        existing.remove();
      } catch (_) {}
    }
    var pop = document.createElement('div');
    pop.id = 'spMiniMatsPop';
    pop.className = 'sp-mini-mats';
    pop.setAttribute('data-sp-mini-mats', '1');
    pop.hidden = true;
    pop.innerHTML =
      '<div class="sp-mini-mats__panel" data-sp-mats-panel>' +
      '<div class="sp-mini-mats__head">' +
      '<div class="sp-mini-mats__head-row">' +
      '<span class="sp-mini-mats__title">材料</span>' +
      '<button type="button" class="sp-mats-rail__iconbtn sp-mats-rail__fold" data-sp-mini-mats-close title="收起" aria-label="收起">‹</button>' +
      '</div>' +
      '<p class="sp-mini-mats__hint" data-sp-mini-mats-hint>先点目标输入框，再按「粘贴到输入框」</p>' +
      '</div>' +
      '<div class="sp-mini-mats__preview" aria-live="polite">' +
      '<span class="sp-mini-mats__preview-k">将粘贴</span>' +
      '<span class="sp-mini-mats__preview-v" data-sp-mini-mats-preview></span>' +
      '</div>' +
      '<button type="button" class="sp-mini-mats__paste" data-sp-mats-paste-target title="先点目标输入框，再按此粘贴">' +
      ico('paste') +
      '<span data-sp-mini-mats-paste-lbl>粘贴到输入框</span></button>' +
      '<div class="sp-mini-mats__ops" role="group" aria-label="材料操作">' +
      '<button type="button" class="sp-mini-mats__op" data-sp-mats-paste title="收入剪贴板">' +
      ico('paste') +
      '<span>收入</span></button>' +
      '<button type="button" class="sp-mini-mats__op" data-sp-mats-add title="添加文件">' +
      ico('add') +
      '<span>添加</span></button>' +
      '<button type="button" class="sp-mini-mats__op" data-sp-mats-capture title="截图">' +
      ico('capture') +
      '<span>截图</span></button>' +
      '<button type="button" class="sp-mini-mats__op" data-sp-mats-pin title="置顶" aria-pressed="false">' +
      ico('pin') +
      '<span>置顶</span></button>' +
      '<button type="button" class="sp-mini-mats__op" data-sp-mats-clear title="清空">' +
      ico('clear') +
      '<span>清空</span></button>' +
      '</div>' +
      '<details class="sp-mini-mats__fold" data-sp-mini-mats-fold>' +
      '<summary class="sp-mini-mats__fold-sum">' +
      '<span class="sp-mini-mats__fold-ico" aria-hidden="true">' +
      ico('mats') +
      '</span>' +
      '<span class="sp-mini-mats__fold-lbl" data-sp-mini-mats-fold-lbl>材料</span>' +
      '<span class="sp-mini-mats__fold-chev" aria-hidden="true">▾</span>' +
      '</summary>' +
      '<div class="sp-mini-mats__chips" data-sp-mats-list aria-label="已收入材料"></div>' +
      '</details>' +
      '</div>';
    // Dock in mini stack (below the bar, above listen) — not absolute over listen/tools.
    var stack = document.getElementById('overlayMiniStack');
    var mini = document.getElementById('overlayMini');
    var host = stack || mini || document.getElementById('wrap') || document.body;
    if (stack && mini && mini.parentNode === stack) {
      // After mini chrome so layout is: agents/tools → materials → (listen hidden while open).
      if (mini.nextSibling) stack.insertBefore(pop, mini.nextSibling);
      else stack.appendChild(pop);
    } else {
      host.appendChild(pop);
    }
    bindMatsPanelListeners(pop);
    var fold = pop.querySelector('[data-sp-mini-mats-fold]');
    if (fold) {
      fold.open = !!miniMatsListOpen;
      fold.addEventListener('toggle', function () {
        miniMatsListOpen = !!fold.open;
      });
      // Stop drag steal on fold summary (pointerdown used to start window drag).
      var sum = fold.querySelector('summary');
      if (sum) {
        sum.addEventListener('pointerdown', function (e) {
          e.stopPropagation();
        });
      }
    }
    // Head title toggles the materials list fold (users click「材料」expecting expand/collapse).
    var head = pop.querySelector('.sp-mini-mats__head');
    if (head && head.getAttribute('data-sp-head-fold') !== '1') {
      head.setAttribute('data-sp-head-fold', '1');
      head.style.cursor = 'pointer';
      head.addEventListener('pointerdown', function (e) {
        e.stopPropagation();
      });
      head.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('button,[data-sp-mini-mats-close]')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        toggleMiniMatsFold();
      });
    }
    // Do NOT auto-close mini mats when clicking the mini bar (that felt like「自动收缩」
    // and stole clicks meant to drag / use tools). Close only via the fold/close control.
    miniMatsDocBound = true;
    pop.addEventListener('pointerenter', function () {
      clearMatsLeaveTimer();
    });
    // No pointerleave→close on mini: resize churn was snapping the panel shut.
    miniMatsEl = pop;
    syncMatsPinUi();
    return pop;
  }

  function setMiniMatsOpen(open) {
    var next = !!open;
    if (next === miniMatsOpen) {
      if (next) paintMiniMatsPop();
      return;
    }
    miniMatsOpen = next;
    if (next) {
      // Survive HWND grow + pointer churn after the materials tool click.
      matsLeaveGuardUntil = Date.now() + 900;
      clearMatsLeaveTimer();
    }
    var wrap = document.getElementById('wrap');
    if (wrap) wrap.classList.toggle('is-mini-mats', miniMatsOpen);
    var pop = ensureMiniMatsPop();
    // Grow mini HWND first so the panel is not painted outside the clip rect.
    var afterGeom = function () {
      if (miniMatsOpen !== next) return;
      pop.hidden = !miniMatsOpen;
      pop.classList.toggle('is-open', miniMatsOpen);
      document.querySelectorAll('[data-beginner-slot="materials"]').forEach(function (btn) {
        btn.classList.toggle('is-on', miniMatsOpen);
        btn.setAttribute('aria-expanded', miniMatsOpen ? 'true' : 'false');
      });
      if (miniMatsOpen) paintMiniMatsPop();
      else clearMatsAssist();
    };
    requestMatsRailWidth(miniMatsOpen).then(afterGeom).catch(afterGeom);
  }

  function toggleMiniMaterials() {
    toggleMatsPanelOpen();
  }

  function syncMiniMatsToolBadge(count) {
    if (count == null) count = materialBadge(snap);
    document.querySelectorAll('[data-beginner-slot="materials"]').forEach(function (btn) {
      btn.classList.toggle('is-has-mats', count > 0);
      var badge = btn.querySelector('[data-sp-mini-mats-count]');
      if (badge) {
        badge.textContent = count > 0 ? '+' + String(count) : '';
        badge.hidden = count < 1;
        badge.setAttribute('aria-hidden', count < 1 ? 'true' : 'false');
      }
    });
    if (miniMatsEl) {
      var title = miniMatsEl.querySelector('.sp-mini-mats__title');
      if (title) title.textContent = count > 0 ? '材料 · ' + count : '材料';
      var previewEl = miniMatsEl.querySelector('[data-sp-mini-mats-preview]');
      if (previewEl) previewEl.textContent = miniMatsPreviewText();
      var hintEl = miniMatsEl.querySelector('[data-sp-mini-mats-hint]');
      if (hintEl) {
        var tgt = targetLabel(resolveTargetKind(snap));
        hintEl.textContent = '① 点 ' + tgt + ' 输入框  ② 核对下方预览  ③ 按「粘贴到输入框」';
      }
      var pasteBtn = miniMatsEl.querySelector('[data-sp-mats-paste-target]');
      var pasteLbl = miniMatsEl.querySelector('[data-sp-mini-mats-paste-lbl]');
      if (pasteBtn) {
        var hasMd = !!String(materialsMarkdown(snap) || '').trim();
        pasteBtn.disabled = !hasMd || pasteBusy;
      }
      if (pasteLbl) pasteLbl.textContent = pasteBusy ? '粘贴中…' : '粘贴到输入框';
    }
  }

  function collectMatsListData() {
    var count = materialBadge(snap);
    var list = (snap && Array.isArray(snap.materials) && snap.materials.length
      ? snap.materials
      : []
    ).slice(0, 16);
    if (!list.length) {
      var carryRow = carryMarkdownPreviewRow();
      if (carryRow) list = [carryRow];
    }
    return { count: count, list: list };
  }

  function renderMatsListHtml(list) {
    return list
      .map(function (m) {
        if (!m) return '';
        var preview = chipPreview(m);
        var sub = rowListSubtitle(m);
        var rm =
          m._carryPreview || m.id === '__carry_md__'
            ? ''
            : '<button type="button" class="sp-mats-rail__x" data-sp-mats-rm="' +
              esc(m.id || '') +
              '" title="移除此项" aria-label="移除此项">' +
              ico('rm') +
              '</button>';
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
          rm +
          '</div>'
        );
      })
      .join('');
  }

  function shortMatName(m) {
    var t = chipPreview(m).replace(/\s+/g, ' ').trim();
    if (!t) t = kindLabel(m && m.kind);
    if (t.length > 16) t = t.slice(0, 14) + '…';
    return t;
  }

  function renderMiniMatsChipsHtml(list) {
    return list
      .map(function (m) {
        if (!m) return '';
        var name = shortMatName(m);
        var rm =
          m._carryPreview || m.id === '__carry_md__'
            ? ''
            : '<button type="button" class="sp-mini-mats__chip-x" data-sp-mats-rm="' +
              esc(m.id || '') +
              '" title="移除" aria-label="移除">' +
              ico('rm') +
              '</button>';
        return (
          '<div class="sp-mini-mats__chip" data-sp-mat-id="' +
          esc(m.id || '') +
          '" title="' +
          esc(chipPreview(m)) +
          '">' +
          '<span class="sp-mini-mats__chip-ico" aria-hidden="true">' +
          kindGlyph(m.kind) +
          '</span>' +
          '<span class="sp-mini-mats__chip-name">' +
          esc(name) +
          '</span>' +
          rm +
          '</div>'
        );
      })
      .join('');
  }

  function paintMatsListInto(listEl, list) {
    if (!listEl) return;
    bindMatsTipEvents(listEl);
    if (!list.length) {
      listEl.innerHTML =
        '<div class="sp-mats-rail__item sp-mats-rail__item--plain">' +
        esc('暂无材料 · 可添加或粘贴') +
        '</div>';
      return;
    }
    listEl.innerHTML = renderMatsListHtml(list);
  }

  function paintMiniMatsPop(count, list) {
    if (count == null || list == null) {
      var data = collectMatsListData();
      count = data.count;
      list = data.list;
    }
    var pop = ensureMiniMatsPop();
    pop.classList.toggle('is-empty', count < 1 && !list.length);
    syncMiniMatsToolBadge(count);
    var fold = pop.querySelector('[data-sp-mini-mats-fold]');
    var foldLbl = pop.querySelector('[data-sp-mini-mats-fold-lbl]');
    if (foldLbl) foldLbl.textContent = count > 0 ? '材料 · ' + count : '材料';
    if (fold) {
      // Sync from remembered intent only — never force-open over a user-closed fold.
      if (count < 1) {
        fold.open = false;
        miniMatsListOpen = false;
      } else if (fold.open !== !!miniMatsListOpen) {
        fold.open = !!miniMatsListOpen;
      }
    }
    var listEl = pop.querySelector('[data-sp-mats-list]');
    if (!listEl) return;
    if (!list.length) {
      listEl.innerHTML =
        '<div class="sp-mini-mats__chip sp-mini-mats__chip--empty">' +
        esc('暂无材料') +
        '</div>';
    } else {
      listEl.innerHTML = renderMiniMatsChipsHtml(list.slice(0, 8));
    }
    syncMatsPinUi();
  }

  function ico(kind) {
    // Compact inline SVGs — pin / trash / plus / clipboard / list / copy / fold.
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
      // Clipboard with distinct clip tab — not a briefcase block.
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.75 1.5h4.5a.75.75 0 0 1 .75.75V3h1.25A1.75 1.75 0 0 1 14 4.75v8.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-8.5A1.75 1.75 0 0 1 3.75 3H5V2.25a.75.75 0 0 1 .75-.75Zm.75 1.5v.25h3V3h-3Zm-2.75 1.5a.25.25 0 0 0-.25.25v8.5c0 .14.11.25.25.25h8.5a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25H10.5v.5a.75.75 0 0 1-.75.75h-3.5A.75.75 0 0 1 5.5 5.25V4.5H3.75Z"/></svg>';
    }
    if (kind === 'copy') {
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 0 4 3.5v8A1.5 1.5 0 0 0 5.5 13h6A1.5 1.5 0 0 0 13 11.5v-8A1.5 1.5 0 0 0 11.5 2h-6ZM5.5 3.5h6v8h-6v-8Zm-2 1.75a.75.75 0 0 0-1.5 0v6.75A2.5 2.5 0 0 0 4.5 14.5h6.75a.75.75 0 0 0 0-1.5H4.5a1 1 0 0 1-1-1V5.25Z"/></svg>';
    }
    if (kind === 'mats') {
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.5 3.25A.75.75 0 0 1 4.25 2.5h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Zm0 4.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Zm0 4.5a.75.75 0 0 1 .75-.75h7.5a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1-.75-.75Z"/></svg>';
    }
    if (kind === 'capture') {
      return '<svg class="sp-mats-rail__ico" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.5 3.5h3l.75-1h2.5l.75 1H12.5A1.5 1.5 0 0 1 14 5v6.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5V5A1.5 1.5 0 0 1 3.5 3.5ZM8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0-1.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>';
    }
    return '‹';
  }

  /** Right slide-out materials drawer (tab when collapsed; panel overlays pad when open). */
  function ensureMatsBar() {
    if (matsBarEl && matsBarEl.isConnected) {
      matsBarEl.hidden = false;
      return matsBarEl;
    }
    var existing = document.getElementById('softPadMatsBar');
    if (existing) {
      matsBarEl = existing;
      matsBarEl.hidden = false;
      bindMatsPanelListeners(existing);
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
      '<button type="button" class="sp-mats-rail__iconbtn" data-sp-mats-capture title="智能截图" aria-label="智能截图">' +
      ico('capture') +
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
    bindMatsPanelListeners(bar);
    // Materials opens only from an explicit tab/button click; hover must not expand it over Soft Pad.
    bar.addEventListener('pointerenter', function () {
      clearMatsLeaveTimer();
    });
    bar.addEventListener('pointerleave', function (e) {
      var to = e && e.relatedTarget;
      if (to && bar.contains(to)) {
        clearMatsLeaveTimer();
        return;
      }
      scheduleMatsLeaveClose();
    });
    matsBarEl = bar;
    bindMatsPadLeave();
    syncMatsPinUi();
    syncMatsRailGeometry();
    return bar;
  }

  /** Align rail to pad top, fill remaining wrap height so the list can scroll in-window. */
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
    // Prefer full remaining wrap (not pad-only) — short pad used to clip the list mid-row.
    var avail = Math.max(0, Math.round(wr.height - top - 8));
    var padH = Math.max(120, Math.round(pr.height));
    var h = Math.max(padH, avail);
    if (avail > 0) h = Math.min(h, avail);
    h = Math.max(160, h);
    bar.style.top = top + 'px';
    bar.style.height = h + 'px';
    bar.style.bottom = 'auto';
    bar.style.maxHeight = avail > 0 ? avail + 'px' : '';
  }

  function clearMatsLeaveTimer() {
    if (matsLeaveTimer) {
      clearTimeout(matsLeaveTimer);
      matsLeaveTimer = null;
    }
  }

  function matsPointerStillInside() {
    if (isMiniMode()) {
      var pop = miniMatsEl;
      if (pop && pop.isConnected) {
        try {
          if (pop.matches(':hover')) return true;
        } catch (_) {}
      }
      return false;
    }
    var bar = matsBarEl;
    if (bar && bar.isConnected) {
      try {
        if (bar.matches(':hover')) return true;
      } catch (_) {}
    }
    return false;
  }

  function scheduleMatsLeaveClose() {
    clearMatsLeaveTimer();
    // Pin is the only sticky hold — assist must not keep the panel up after leave.
    if (matsPinned) return;
    if (Date.now() < matsLeaveGuardUntil) return;
    // Mini popover: HWND grow / tools hover churn fake leave and snapped the panel shut.
    // Close only via outside click or the fold button.
    if (isMiniMode()) return;
    var delay = matsDrawerOpen ? 280 : 160;
    matsLeaveTimer = setTimeout(function () {
      matsLeaveTimer = null;
      if (matsPinned) return;
      if (Date.now() < matsLeaveGuardUntil) return;
      if (matsPointerStillInside()) return;
      clearMatsAssist();
      setMatsDrawerOpen(false);
    }, delay);
  }

  function bindMatsPadLeave() {
    if (matsHoverBound) return;
    var wrap = document.getElementById('wrap');
    if (!wrap) return;
    matsHoverBound = true;
    wrap.addEventListener('pointerenter', function () {
      clearMatsLeaveTimer();
    });
    wrap.addEventListener('pointerleave', function (e) {
      var to = e && e.relatedTarget;
      // Still under Soft Pad / mats rail — do not retract.
      if (to && wrap.contains(to)) {
        clearMatsLeaveTimer();
        return;
      }
      if (to && matsBarEl && matsBarEl.contains(to)) {
        clearMatsLeaveTimer();
        return;
      }
      if (to && miniMatsEl && miniMatsEl.contains(to)) {
        clearMatsLeaveTimer();
        return;
      }
      scheduleMatsLeaveClose();
    });
  }

  function setMatsPinned(on) {
    matsPinned = !!on;
    writeLocalFlag(PIN_KEY, matsPinned);
    syncMatsPinUi();
  }

  function syncMatsPinUi() {
    [matsBarEl, miniMatsEl].forEach(function (root) {
      if (!root || !root.isConnected) return;
      root.classList.toggle('is-pinned', matsPinned);
      var pinBtn = root.querySelector('[data-sp-mats-pin]');
      if (!pinBtn) return;
      pinBtn.setAttribute('aria-pressed', matsPinned ? 'true' : 'false');
      pinBtn.setAttribute('aria-label', matsPinned ? '取消置顶' : '置顶');
      pinBtn.classList.toggle('is-on', matsPinned);
      pinBtn.title = matsPinned
        ? '取消置顶：离开 Soft Pad 将收回列表'
        : '置顶：离开 Soft Pad 也不收回';
    });
  }

  function overlayIsDragging() {
    try {
      return !!global.__onetoneOverlayDragging;
    } catch (_) {
      return false;
    }
  }

  function requestMatsRailWidth(open) {
    var want = !!open;
    // While Soft Pad is being dragged, queue — Rust also defers; FE keeps latest intent.
    if (overlayIsDragging()) {
      matsRailQueued = want;
      return Promise.resolve(false);
    }
    var api = ipc();
    if (!api || typeof api.invoke !== 'function') {
      return Promise.resolve(false);
    }
    var seq = ++matsRailSeq;
    // Widen HWND left-anchored so Soft Pad stays put and the rail owns the new right strip.
    return api
      .invoke('cmd_codex_micro_overlay_set_mats_rail', { open: want })
      .then(function (ok) {
        if (seq !== matsRailSeq) return false;
        return ok;
      })
      .catch(function () {
        if (seq !== matsRailSeq) return false;
        return false;
      });
  }

  /** After overlay snap, flush the latest mats rail request deferred during drag. */
  function flushQueuedMatsRail() {
    if (matsRailQueued == null) return;
    var want = matsRailQueued;
    matsRailQueued = null;
    requestMatsRailWidth(want).then(function () {
      if (isMiniMode()) {
        if (want && !miniMatsOpen) setMiniMatsOpen(true);
        else if (!want && miniMatsOpen) setMiniMatsOpen(false);
      } else if (want !== matsDrawerOpen) {
        setMatsDrawerOpen(want);
      }
    });
  }

  if (typeof global.addEventListener === 'function') {
    global.addEventListener('pointerup', function () {
      if (matsRailQueued != null && !overlayIsDragging()) flushQueuedMatsRail();
    });
    global.addEventListener('pointercancel', function () {
      if (matsRailQueued != null && !overlayIsDragging()) flushQueuedMatsRail();
    });
  }

  function applyMatsDrawerDom(open) {
    var bar = matsBarEl;
    if (bar) {
      bar.classList.toggle('is-open', !!open);
      bar.setAttribute('data-sp-mats-open', open ? '1' : '0');
    }
    var wrap = document.getElementById('wrap');
    if (wrap) wrap.classList.toggle('is-mats-rail', !!open);
    syncMatsRailGeometry();
  }

  function setMatsDrawerOpen(open) {
    var next = !!open;
    if (isMiniMode()) {
      setMiniMatsOpen(next);
      if (next) paintMiniMatsPop();
      return;
    }
    var bar = matsBarEl;
    if (next === matsDrawerOpen) {
      applyMatsDrawerDom(matsDrawerOpen);
      return;
    }
    if (next) {
      // Survive widen + panel slide so moving into the list does not auto-close.
      matsLeaveGuardUntil = Date.now() + 500;
      clearMatsLeaveTimer();
      matsDrawerOpen = true;
      // Widen HWND first — painting is-open before resize stacks the panel over Soft Pad.
      requestMatsRailWidth(true).then(function () {
        if (!matsDrawerOpen) return;
        applyMatsDrawerDom(true);
      });
      return;
    }
    matsDrawerOpen = false;
    clearMatsAssist();
    applyMatsDrawerDom(false);
    requestMatsRailWidth(false);
    if (!bar) return;
  }

  function chipPreview(m) {
    if (!m) return '';
    var path = String(m.path || '').trim();
    if (path && (m.kind === 'file' || m.kind === 'image' || m.kind === 'folder')) {
      var leaf = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path;
      if (leaf) return leaf.length > 48 ? leaf.slice(0, 46) + '…' : leaf;
    }
    var raw = String(m.name || m.preview || m.description || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!raw) return kindLabel(m.kind);
    if (raw === '拖入的文本' || raw === '粘贴的文本' || raw === '未命名素材') {
      return kindLabel(m.kind);
    }
    // Don't put absolute paths in the title — leaf only (CSS clamps to 2 lines).
    if (/^[A-Za-z]:[\\/]/.test(raw) || raw.indexOf('\\\\') === 0) {
      var leaf2 = raw.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || raw;
      return leaf2.length > 48 ? leaf2.slice(0, 46) + '…' : leaf2;
    }
    return raw.length > 48 ? raw.slice(0, 46) + '…' : raw;
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
      else if (act === 'mats') {
        armMatsAssist();
        toast('已展开材料列表');
      } else if (act === 'copy') copyMaterialsMd();
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
    if (s === 'handoff') return '待粘贴';
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

  /** Draft-only handoff: no material rows but assembledMd — show paste preview. */
  function carryMarkdownPreviewRow() {
    var md = snap && String(snap.assembledMd || '').trim();
    var preview = String((snap && snap.preview) || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!preview && md) {
      preview = md.replace(/\s+/g, ' ').trim();
      if (preview.length > 80) preview = preview.slice(0, 80) + '…';
    }
    if (!preview) return null;
    return {
      id: '__carry_md__',
      kind: 'text',
      preview: preview,
      source: 'handoff',
      _carryPreview: true
    };
  }

  function paintMats() {
    var wrap = document.getElementById('wrap');
    var mini = !!(wrap && wrap.classList.contains('is-minimized'));
    var data = collectMatsListData();
    var count = data.count;
    var list = data.list;
    if (mini) {
      if (matsDrawerOpen) {
        matsDrawerOpen = false;
        applyMatsDrawerDom(false);
        requestMatsRailWidth(false);
      }
      // Keep the rail in DOM without [hidden] — CSS .wrap.is-minimized hides it.
      // Setting hidden here stuck the tab after expand (expand did not re-paint).
      if (matsBarEl) matsBarEl.hidden = false;
      syncMiniMatsToolBadge(count);
      paintMiniMatsPop(count, list);
      if (count < 1 && !list.length) {
        matsHadItems = false;
        matsOpenOnCollect = false;
        hideMatsTip(0);
      } else {
        matsHadItems = true;
        matsOpenOnCollect = false;
      }
      if (matsAssistOpen && !miniMatsOpen) setMiniMatsOpen(true);
      return;
    }
    if (miniMatsOpen) setMiniMatsOpen(false);
    var bar = ensureMatsBar();
    syncMatsRailGeometry();
    var listEl = bar.querySelector('[data-sp-mats-list]');
    var tabCount = bar.querySelector('[data-sp-mats-count]');
    bar.hidden = false;
    bar.classList.toggle('is-empty', count < 1);
    if (tabCount) {
      tabCount.textContent = String(count);
      tabCount.hidden = count < 1;
    }
    if (count < 1 && !list.length) {
      matsHadItems = false;
      matsOpenOnCollect = false;
      hideMatsTip(0);
      if (matsAssistOpen && !matsDrawerOpen) setMatsDrawerOpen(true);
      else applyMatsDrawerDom(matsDrawerOpen);
      paintMatsListInto(listEl, []);
      return;
    }
    matsHadItems = true;
    // Never force-open from paint — only click / fresh handoff (armMatsAssist) open the drawer.
    matsOpenOnCollect = false;
    if (matsAssistOpen && !matsDrawerOpen) setMatsDrawerOpen(true);
    else applyMatsDrawerDom(matsDrawerOpen);
    paintMatsListInto(listEl, list);
  }

  var WORK_JOURNAL_KEY = 'onetone.workJournal';

  /** Soft Pad overlay may lack Prep — write shared journal for home history drawer. */
  function noteSoftPadMaterial(name, preview, count) {
    var title = String(name || preview || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 72);
    if (!title) title = 'Soft Pad 素材';
    var detail =
      (count ? count + ' 项' : '') +
      (preview && preview !== title ? ' · ' + String(preview).replace(/\s+/g, ' ').trim().slice(0, 40) : '');
    var entry = {
      id: 'sp_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4),
      kind: 'materials',
      title: title,
      detail: detail,
      source: 'softpad',
      materialNames: [title],
      materialCount: count || 1,
      at: new Date().toISOString()
    };
    try {
      var Prep = global.OneToneHomePromptPrep;
      if (Prep && typeof Prep.noteWorkLog === 'function') {
        Prep.noteWorkLog(entry);
        return;
      }
    } catch (_) {}
    try {
      if (!global.localStorage) return;
      var raw = global.localStorage.getItem(WORK_JOURNAL_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) arr = [];
      var nowAt = Date.parse(entry.at) || Date.now();
      if (arr.length) {
        var last = arr[arr.length - 1];
        var lastAt = Date.parse(last && last.at) || 0;
        if (
          last &&
          last.kind === 'materials' &&
          last.source === 'softpad' &&
          nowAt - lastAt < 180000
        ) {
          last.title = entry.title;
          last.detail = entry.detail;
          last.materialNames = entry.materialNames;
          last.materialCount = entry.materialCount;
          last.at = entry.at;
          global.localStorage.setItem(WORK_JOURNAL_KEY, JSON.stringify(arr.slice(-60)));
          return;
        }
      }
      arr.push(entry);
      if (arr.length > 60) arr = arr.slice(-60);
      global.localStorage.setItem(WORK_JOURNAL_KEY, JSON.stringify(arr));
    } catch (_) {}
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
    var displayName = leaf || preview || kindLabel(k);
    mats.push({
      id: 'local_' + Date.now() + '_' + mats.length,
      kind: k,
      name: displayName,
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
    matsOpenOnCollect = false;
    noteSoftPadMaterial(displayName, preview, mats.length);
    paint();
  }

  function paint() {
    ensureMatsBar();
    var active = shouldShowCarryUi(snap);
    if (!active) clearMatsAssist();
    paintMats();
    var el = ensureDom();
    // Re-parent into pad stack if Soft Pad remounted DOM.
    var stack = document.querySelector('.overlay-pad-stack');
    if (stack && el.parentNode !== stack) {
      try {
        stack.appendChild(el);
      } catch (_) {}
    }
    var wasHidden = !!el.hidden;
    el.hidden = !active;
    el.classList.toggle('is-on', active);
    el.classList.toggle('is-carry', carryActive(snap));
    el.classList.toggle('is-expanded', !!formExpanded);
    var listenEl = el.querySelector('[data-sp-listen]');
    if (listenEl) listenEl.hidden = !active || !listenOn;
    if (!active) {
      syncCaptionAboveDock(false);
      if (!wasHidden) requestOverlayFit();
      return;
    }
    var countEl = el.querySelector('[data-sp-count]');
    var previewEl = el.querySelector('[data-sp-preview]');
    var pillEl = el.querySelector('[data-sp-pill]');
    var hintEl = el.querySelector('[data-sp-hint]');
    var pasteBtn = el.querySelector('[data-sp-act="paste"]');
    var pasteLbl = el.querySelector('[data-sp-paste-lbl]');
    var agentImg = el.querySelector('[data-sp-agent-img]');
    var badge = el.querySelector('[data-sp-badge]');
    var n = materialBadge(snap);
    if (countEl) countEl.textContent = String(n);
    if (previewEl) {
      previewEl.textContent = String((snap && snap.preview) || '（无预览）');
    }
    var kind = resolveTargetKind(snap);
    var tgt = targetLabel(kind);
    if (agentImg) {
      var src = targetIconSrc(kind);
      if (agentImg.getAttribute('src') !== src) agentImg.setAttribute('src', src);
      agentImg.setAttribute('alt', tgt);
    }
    if (badge) badge.title = tgt + ' · 携带材料';
    if (pillEl) {
      pillEl.textContent = carryActive(snap) ? '跟随 ' + tgt : '材料就绪 · ' + n + ' 项';
    }
    if (hintEl) {
      hintEl.textContent =
        '① 点 ' + tgt + ' 输入框  ② 看右侧材料列表  ③ 按「粘贴」';
    }
    if (pasteBtn) {
      var hasMd = !!String(materialsMarkdown(snap) || '').trim();
      pasteBtn.disabled = !hasMd || pasteBusy;
      // Never set textContent on the button — that wipes the SVG icon.
      if (pasteLbl) pasteLbl.textContent = pasteBusy ? '…' : '粘贴';
    }
    // Hide empty Soft Pad caption plate above the dock (white blank bar).
    syncCaptionAboveDock(active);
    requestOverlayFit();
  }

  function syncCaptionAboveDock(dockOn) {
    var wrap = document.getElementById('wrap') || document.querySelector('.wrap');
    if (wrap && wrap.classList) wrap.classList.toggle('is-sp-carry-dock', !!dockOn);
    var cap = document.getElementById('overlayKeyCaption');
    if (!cap) return;
    if (!dockOn) {
      cap.classList.remove('is-sp-caption-empty');
      cap.hidden = false;
      return;
    }
    var nameEl = cap.querySelector('[data-cap-name]');
    var chordEl = cap.querySelector('[data-cap-chord]');
    var cmdsEl = cap.querySelector('[data-cap-cmds]');
    var badgeEl = cap.querySelector('[data-cap-badge]');
    var name = String((nameEl && nameEl.textContent) || '').trim();
    var chord = String((chordEl && chordEl.textContent) || '').trim();
    var cmds = cmdsEl && !cmdsEl.hidden && String(cmdsEl.textContent || '').trim();
    var badge = badgeEl && !badgeEl.hidden && String(badgeEl.textContent || '').trim();
    var meaningful =
      (!!name && name !== '悬停按键查看名称') ||
      !!chord ||
      !!cmds ||
      !!badge ||
      cap.classList.contains('is-usage-sub') ||
      cap.classList.contains('is-beginner-arm-caption') ||
      cap.classList.contains('is-oral-arm-caption');
    var empty = !meaningful;
    cap.classList.toggle('is-sp-caption-empty', empty);
    cap.hidden = empty;
  }

  function pulsePasteCue() {
    var el = rootEl || ensureDom();
    var pasteBtn = el && el.querySelector('[data-sp-act="paste"]');
    if (!pasteBtn || !pasteBtn.classList) return;
    try {
      pasteBtn.classList.remove('is-pulse');
      // Restart CSS animation if carry re-fires while still active.
      void pasteBtn.offsetWidth;
      pasteBtn.classList.add('is-pulse');
    } catch (_) {
      return;
    }
    setTimeout(function () {
      try {
        pasteBtn.classList.remove('is-pulse');
      } catch (_) {}
    }, 3200);
  }

  function applySnapshot(next) {
    if (!next || typeof next !== 'object') return;
    var prev = snap;
    var prevCarry = carryActive(prev);
    var prevGen = (prev && prev.carry && Number(prev.carry.generation)) || 0;
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
    var nextCarry = carryActive(snap);
    var nextGen = (snap.carry && Number(snap.carry.generation)) || 0;
    // Homepage handoff: force-open list + dock. Cold pull of stale carry.active must not arm.
    var handoffFresh = isFreshHandoff(snap, prev);
    var assistFresh =
      handoffFresh && (lastArmedCarryGen == null || nextGen > lastArmedCarryGen);
    if (handoffFresh) {
      dockDismissed = false;
      carryUiArmed = true;
    }
    if (assistFresh) {
      lastArmedCarryGen = nextGen;
      armMatsAssist();
      var tgt = targetLabel(snap.carry && snap.carry.targetKind);
      toast(
        nextCarry
          ? '内容已就绪 · 点 ' + tgt + ' 输入框后按下方「粘贴」'
          : '材料已就绪 · 下方可粘贴 / 管理材料'
      );
    }
    paint();
    if (assistFresh) pulsePasteCue();
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
    var md = materialsMarkdown(snap);
    if (!String(md || '').trim()) {
      toast('暂无材料可粘贴');
      return Promise.resolve({ ok: false, error: 'empty' });
    }
    pasteBusy = true;
    paint();
    // Ensure clipboard has tray Markdown before Ctrl+V into Agent.
    return writeTextClipboard(md)
      .catch(function () {
        // Still try paste — handoff may have already written clipboard.
        return null;
      })
      .then(function () {
        return api.invoke('cmd_soft_pad_paste_only', { holdMs: 40 });
      })
      .then(function (res) {
        pasteBusy = false;
        paint();
        if (!res || !res.ok) {
          var err = (res && res.error) || 'paste_failed';
          if (err === 'no_external_foreground') toast('请先点目标输入框，再粘贴');
          else if (err === 'paste_busy') toast('粘贴进行中');
          else toast('粘贴未送达（SendInput 未确认进框）');
        } else {
          toast('已粘贴到输入框');
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
    dockDismissed = true;
    carryUiArmed = false;
    clearMatsAssist();
    var api = ipc();
    if (api && typeof api.invoke === 'function') {
      return api
        .invoke('cmd_tray_carry_dismiss', {})
        .then(function () {
          if (snap && snap.carry) {
            snap.carry.active = false;
            snap.carry.targetKind = null;
          }
          paintDismissedDock();
          toast('已收起操作条（材料仍在列表）');
        })
        .catch(function () {
          if (snap && snap.carry) snap.carry.active = false;
          paintDismissedDock();
        });
    }
    if (snap && snap.carry) snap.carry.active = false;
    paintDismissedDock();
    return Promise.resolve();
  }

  /** Hide dock without wiping tray materials; list can stay if user pinned. */
  function paintDismissedDock() {
    var el = ensureDom();
    el.hidden = true;
    el.classList.remove('is-on', 'is-carry');
    if (!matsPinned) setMatsDrawerOpen(false);
    syncCaptionAboveDock(false);
    requestOverlayFit();
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
      var t =
        document.getElementById('overlayToast') || document.getElementById('toast');
      if (t) {
        t.textContent = String(msg || '');
        t.hidden = false;
        // overlayToast uses is-show; legacy #toast uses show.
        t.classList.add('is-show');
        t.classList.add('show');
        setTimeout(function () {
          t.classList.remove('is-show');
          t.classList.remove('show');
        }, 2800);
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
    // Full pad: keep materials rail open. Mini: stay on the inline card (no full drawer).
    if (!isMiniMode()) setMatsDrawerOpen(true);
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
    toggleMiniMaterials: toggleMiniMaterials,
    /** Mini↔full chrome changed — refresh materials tab / mini popover. */
    syncChrome: paint,
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
