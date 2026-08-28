/* eslint-disable no-unused-vars */
(function (global) {
  'use strict';

  var MIC_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v11m0 0a4 4 0 01-4-4V5a4 4 0 118 0v4a4 4 0 01-4 4zm0 0v3m0 0a7 7 0 01-7-7M12 15a7 7 0 007-7M12 18v3m-3 0h6"/></svg>';
  var KEY_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" class="wb-key-frame"/><circle cx="6" cy="10" r="1.1" class="wb-key-el wb-key-1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.1" class="wb-key-el wb-key-2" fill="currentColor" stroke="none"/><circle cx="14" cy="10" r="1.1" class="wb-key-el wb-key-3" fill="currentColor" stroke="none"/><circle cx="18" cy="10" r="1.1" class="wb-key-el wb-key-4" fill="currentColor" stroke="none"/><rect x="7" y="13.5" width="10" height="1.8" rx="0.9" class="wb-key-el wb-key-space" fill="currentColor" stroke="none"/></svg>';
  var CAM_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var PAD_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>';

  var ICONS = {
    voice: MIC_SVG,
    keys: KEY_SVG,
    softPad: PAD_SVG,
    camera: CAM_SVG,
  };

  var CARDS = [
    {
      id: 'voice',
      title: '说话触发',
      primary: '开始输入',
      state: '已配置',
      stateTone: 'is-on',
      heroLabel: '说完会进到当前窗口',
      tip: {
        lead: '说话',
        desc: '说完的话会进到当前正在用的窗口',
        current: '当前：麦克风 Yeti Nano',
        foot: '点按可在上方预览',
      },
      meta: [
        { lbl: '麦克风', val: 'Yeti Nano' },
        { lbl: '唤醒词', val: '开始输入' },
      ],
    },
    {
      id: 'keys',
      title: '按键触发',
      primary: 'HID 键 R03-80 → 右 Alt',
      state: '已激活',
      stateTone: 'is-on',
      heroLabel: '按住侧键即可映射',
      tip: {
        lead: '按键',
        desc: '按住你设的键，就能代替另一个键',
        current: '当前：HID 键 R03-80 → 右 Alt',
        foot: '点按可在上方预览',
      },
      meta: [{ lbl: '结束动作', val: '单击开始，再单击后 5.0 秒发送' }],
    },
    {
      id: 'softPad',
      title: '屏幕按钮',
      primary: 'Codex (自动)',
      state: '不含 Soft Pad',
      stateTone: 'is-warn',
      heroLabel: '屏幕上的按钮控制 Agent',
      tip: {
        lead: '屏幕按钮',
        desc: '在屏幕上点按钮，控制 Codex / Claude 等 Agent',
        current: '当前：Codex (自动)',
        foot: '点按查看完整配置',
      },
      meta: [
        { lbl: '此习惯', val: '不含 Soft Pad' },
        { lbl: '当前控制', val: 'Codex (自动)' },
        { lbl: '跟随', val: '运行时自动跟随 Agent' },
      ],
    },
    {
      id: 'camera',
      title: '摄像头确认',
      primary: '张掌 → 语音取消',
      state: '已开启',
      stateTone: 'is-on',
      heroLabel: '用手势确认或取消输入',
      tip: {
        lead: '摄像头',
        desc: '做手势可以确认、取消或结束语音输入',
        current: '当前：张掌 → 语音取消',
        foot: '点按可在上方预览',
      },
      meta: [
        { lbl: '在席状态', val: '已检测' },
        { lbl: '动作', val: '张掌 → 语音取消' },
      ],
    },
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cardById(id) {
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i].id === id) return CARDS[i];
    }
    return CARDS[0];
  }

  function metaHtml(rows) {
    if (!rows || !rows.length) return '';
    return (
      '<div class="howto-meta">' +
      rows
        .map(function (r) {
          return (
            '<div class="howto-meta-row"><span class="howto-meta-lbl">' +
            esc(r.lbl) +
            '</span><strong class="howto-meta-val">' +
            esc(r.val) +
            '</strong></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function colForCardId(id) {
    for (var i = 0; i < CARDS.length; i++) {
      if (CARDS[i].id === id) return i + 1;
    }
    return 1;
  }

  function summaryCardHtml(card, opts) {
    opts = opts || {};
    var active = opts.activeId === card.id;
    var expanded = !!opts.expanded;
    var selected = !!opts.selected;
    var extra = opts.extraClass || '';
    var col = opts.col != null ? opts.col : colForCardId(card.id);
    var gridStyle = opts.col != null ? ' style="grid-column:' + col + '"' : '';
    return (
      '<article class="howto-card is-' +
      card.id +
      (active ? ' is-active' : '') +
      (expanded ? ' is-expanded' : '') +
      (selected ? ' is-selected' : '') +
      ' ' +
      extra +
      '" data-card="' +
      esc(card.id) +
      '" data-col="' +
      col +
      '"' +
      gridStyle +
      ' data-tip="1" tabindex="0" role="button">' +
      '<button type="button" class="howto-card-edit" tabindex="-1">编辑</button>' +
      '<div class="howto-card-top">' +
      '<div class="howto-card-head">' +
      '<span class="howto-card-ico" aria-hidden="true">' +
      (ICONS[card.id] || '') +
      '</span>' +
      '<span class="howto-card-title">' +
      esc(card.title) +
      '</span></div>' +
      '<span class="howto-card-state ' +
      esc(card.stateTone) +
      '">' +
      esc(card.state) +
      '</span></div>' +
      '<p class="howto-card-primary">' +
      esc(card.primary) +
      '</p>' +
      (opts.body || '') +
      '</article>'
    );
  }

  function detailBodyHtml(card, opts) {
    opts = opts || {};
    var enterCls = opts.animate !== false ? ' is-enter' : '';
    return (
      '<div class="detail-body">' +
      '<div class="detail-hero-icon is-' +
      card.id +
      enterCls +
      '" aria-hidden="true">' +
      (ICONS[card.id] || '') +
      '</div>' +
      '<div class="detail-copy">' +
      '<p class="howto-card-primary detail-primary">' +
      esc(card.primary) +
      '</p>' +
      metaHtml(card.meta) +
      '</div></div>'
    );
  }

  function renderScopeTop() {
    return (
      '<section class="scope-top">' +
      '<div class="scope-head">' +
      '<div><div class="scope-title">当前习惯</div>' +
      '<p class="scope-sub">切换习惯时，下方四通道状态一起跟着变。</p></div>' +
      '<button type="button" class="scope-manage">管理</button></div>' +
      '<div class="scene-chips">' +
      '<span class="scene-chip is-active"><span class="scene-chip-dot"></span>Cursor</span>' +
      '<span class="scene-chip"><span class="scene-chip-dot"></span>VS Code</span>' +
      '<span class="scene-chip"><span class="scene-chip-dot"></span>Chrome</span>' +
      '</div></section>'
    );
  }

  function setHeroMode(mode) {
    var icon = document.getElementById('heroOrbIcon');
    var label = document.getElementById('heroLabel');
    var live = document.getElementById('heroLive');
    var card = cardById(mode);
    if (!icon) return;
    icon.classList.add('is-switching');
    setTimeout(function () {
      icon.innerHTML = ICONS[mode] || ICONS.voice;
      icon.setAttribute('data-mode', mode);
      requestAnimationFrame(function () {
        icon.classList.remove('is-switching');
      });
    }, 150);
    if (label) label.textContent = card.title.replace('触发', '').replace('确认', '') || card.title;
    if (live) live.textContent = card.heroLabel;
  }

  function renderHero(activeId) {
    var card = cardById(activeId || 'voice');
    return (
      '<section class="hero-card" id="heroCard">' +
      '<div class="hero-orb-wrap"><div class="hero-orb">' +
      '<div class="hero-orb-icon" id="heroOrbIcon" data-mode="' +
      esc(activeId || 'voice') +
      '">' +
      (ICONS[activeId || 'voice'] || ICONS.voice) +
      '</div></div></div>' +
      '<div class="hero-label" id="heroLabel">' +
      esc(card.title.replace('触发', '').replace('确认', '')) +
      '</div>' +
      '<div class="hero-live" id="heroLive">' +
      esc(card.heroLabel) +
      '</div></section>'
    );
  }

  /* Stack tooltip — prototype only */
  var tipEl = null;
  var tipTimer = 0;

  function ensureTip() {
    if (tipEl && tipEl.isConnected) return tipEl;
    tipEl = document.createElement('div');
    tipEl.className = 'stack-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    document.body.appendChild(tipEl);
    return tipEl;
  }

  function positionTip(anchor) {
    var tip = ensureTip();
    var r = anchor.getBoundingClientRect();
    var tw = tip.offsetWidth;
    var left = r.left + r.width / 2 - tw / 2;
    left = Math.max(8, Math.min(window.innerWidth - tw - 8, left));
    var top = r.bottom + 8;
    if (top + tip.offsetHeight > window.innerHeight - 8) {
      top = r.top - tip.offsetHeight - 8;
    }
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }

  function showStackTip(anchor, card) {
    clearTimeout(tipTimer);
    var tip = ensureTip();
    var t = card.tip || {};
    tip.innerHTML =
      '<div class="stack-tip__lead">【' +
      esc(t.lead || '') +
      '】</div>' +
      '<div class="stack-tip__desc">' +
      esc(t.desc || '') +
      '</div>' +
      (t.current
        ? '<div class="stack-tip__desc">' + esc(t.current) + '</div>'
        : '') +
      '<div class="stack-tip__foot">' +
      esc(t.foot || '') +
      '</div>';
    tip.hidden = false;
    tip.classList.remove('is-show');
    positionTip(anchor);
    requestAnimationFrame(function () {
      tip.classList.add('is-show');
    });
  }

  function hideStackTip() {
    clearTimeout(tipTimer);
    if (!tipEl) return;
    tipEl.classList.remove('is-show');
    tipEl.hidden = true;
  }

  function bindStackTips(root) {
    if (!root) return;
    root.addEventListener('mouseover', function (e) {
      var card = e.target.closest && e.target.closest('[data-tip]');
      if (!card || card.contains(e.relatedTarget)) return;
      if (e.target.closest && e.target.closest('.howto-card-edit')) return;
      var id = card.getAttribute('data-card');
      tipTimer = setTimeout(function () {
        showStackTip(card, cardById(id));
      }, 280);
    });
    root.addEventListener('mouseout', function (e) {
      var card = e.target.closest && e.target.closest('[data-tip]');
      if (!card) return;
      if (card.contains(e.relatedTarget)) return;
      hideStackTip();
    });
    window.addEventListener('scroll', hideStackTip, true);
  }

  function stopEditClick(root) {
    if (!root) return;
    root.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.howto-card-edit')) {
        e.stopPropagation();
      }
    });
  }

  global.HowtoExpandProto = {
    CARDS: CARDS,
    ICONS: ICONS,
    esc: esc,
    cardById: cardById,
    colForCardId: colForCardId,
    metaHtml: metaHtml,
    summaryCardHtml: summaryCardHtml,
    detailBodyHtml: detailBodyHtml,
    renderScopeTop: renderScopeTop,
    renderHero: renderHero,
    setHeroMode: setHeroMode,
    bindStackTips: bindStackTips,
    stopEditClick: stopEditClick,
  };
})(window);
