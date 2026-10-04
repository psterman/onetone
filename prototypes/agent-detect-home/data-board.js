/**
 * DataBoard.mount — adaptive Agent data board (not production IIFE copy).
 * Dock owns global focusId; strip/rank/ledger drill to single.
 */
(function (global) {
  'use strict';

  var Dto = global.AgentBoardDto;
  var LENSES = [
    { id: 'eff', label: '效率', sub: '回合 / 活跃时' },
    { id: 'cost', label: '费用', sub: '可知 $' },
    { id: 'cap', label: '能力', sub: '已整合源' },
    { id: 'time', label: '时长', sub: '活跃 · 热力' },
    { id: 'spark', label: '灵感', sub: '高峰 + 缓存' }
  ];
  var FILTERS = [
    { id: 'all', label: '全部' },
    { id: 'quota', label: '有额度' },
    { id: 'activity', label: '有活动' },
    { id: 'unwired', label: '未接通' },
    { id: 'domestic', label: '国内源' }
  ];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmt(v) {
    return v == null || v === '' ? '—' : String(v);
  }

  function fmtUsd(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    var x = Number(n);
    if (Math.abs(x) < 0.005) return '$0';
    return '$' + (Math.round(x * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  }

  function fmtMin(m) {
    if (m == null) return '—';
    m = Math.round(Number(m));
    var h = Math.floor(m / 60);
    var r = m % 60;
    return h ? h + 'h' + (r ? String(r).padStart(2, '0') : '00') : r + 'm';
  }

  function fmtTok(n) {
    if (n == null) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'K';
    return String(n);
  }

  function basisLabel(b) {
    if (b === 'official') return '已入账';
    if (b === 'estimate') return '估价·不计合计';
    return '无价';
  }

  function findAgent(dto, id) {
    id = Dto.canonicalId(id);
    return (dto.agents || []).find(function (a) { return a.id === id; }) || null;
  }

  function snapLine(a) {
    if (!a) return '今日 · —';
    if (a.id === 'cursor') {
      return '今日 · ' + a.name + ' · 效率 ' + fmt(a.eff) + ' · 活跃 ' + fmtMin(a.activeMin);
    }
    if (a.id === 'claude') {
      return '今日 · ' + a.name + ' · 费用 ' + (a.costBasis === 'estimate' ? '~' + fmtUsd(a.usd) : fmtUsd(a.usdBooked != null ? a.usdBooked : a.usd)) + ' · 配额 ' + fmt(a.remainingPercent != null ? a.remainingPercent + '%' : null);
    }
    return '今日 · ' + a.name + ' · Token ' + fmtTok(a.tok) + ' · 配额 ' + fmt(a.remainingPercent != null ? a.remainingPercent + '%' : null);
  }

  function insightFor(lens, dto, focus, filtered) {
    if (dto.cursorNeedsConsent && lens === 'eff') {
      return { text: 'Cursor 本机活动未开启，效率与活跃会显示 —。', cta: 'enable-cursor', ctaLabel: '开启本机活动' };
    }
    if (focus && focus.group === 'offline' && focus.presence === 'none') {
      return { text: focus.name + ' 未检测到，可先安装或连接。', cta: 'connect:' + focus.id, ctaLabel: '去连接' };
    }
    if (lens === 'cost') {
      var booked = Dto.ledgerBookedSum(filtered);
      var miss = Dto.ledgerMissCount(filtered);
      return {
        text: '可知费用合计 ' + fmtUsd(booked) + '（只计已入账原价）· 缺价 ' + miss + ' 源。估价单独显示，不进合计。',
        cta: 'layout:ledger',
        ctaLabel: '打开费用账本'
      };
    }
    if (lens === 'eff') {
      return {
        text: focus && focus.eff != null
          ? focus.name + ' 效率 ' + focus.eff + '（回合÷活跃时）。其它 Agent 无此字段则 —。'
          : '效率只对有本机活动的 Cursor 计算，缺字段不编造。',
        cta: null,
        ctaLabel: ''
      };
    }
    if (lens === 'cap') {
      var sig = filtered.filter(function (a) { return a.signal; }).length;
      return { text: '已整合信号 ' + sig + ' / ' + filtered.length + ' 源。未接通可筛选后去连接。', cta: null, ctaLabel: '' };
    }
    if (lens === 'time') {
      return { text: '活跃时长来自 Cursor 本机活动。热力需按小时分桶，目前只有今日。', cta: null, ctaLabel: '' };
    }
    return { text: '高峰与缓存最佳需更多时间序列，目前显示 —，不编造。', cta: null, ctaLabel: '' };
  }

  function kpisFor(lens, dto, focus, filtered) {
    var booked = Dto.ledgerBookedSum(filtered);
    var miss = Dto.ledgerMissCount(filtered);
    var sig = filtered.filter(function (a) { return a.signal; }).length;
    var tok = null;
    filtered.forEach(function (a) { if (a.tok != null) tok = (tok || 0) + a.tok; });
    if (lens === 'eff') {
      return [
        { l: '效率', v: focus && focus.id === 'cursor' ? fmt(focus.eff) : '—', miss: !(focus && focus.eff != null) },
        { l: '请求', v: focus && focus.turns != null ? String(focus.turns) : '—', miss: !(focus && focus.turns != null) },
        { l: '活跃', v: focus ? fmtMin(focus.activeMin) : '—', miss: !(focus && focus.activeMin != null) },
        { l: '最紧配额', v: (function () {
          var t = filtered.filter(function (a) { return a.remainingPercent != null; }).sort(function (a, b) { return a.remainingPercent - b.remainingPercent; })[0];
          return t ? t.name + ' ' + t.remainingPercent + '%' : '—';
        })(), miss: false }
      ];
    }
    if (lens === 'cost') {
      return [
        { l: '可知费用', v: fmtUsd(booked), miss: booked == null },
        { l: '缺价源', v: String(miss), miss: false },
        { l: 'Token Σ', v: fmtTok(tok), miss: tok == null },
        { l: '请求', v: focus && focus.turns != null ? String(focus.turns) : '—', miss: !(focus && focus.turns != null) }
      ];
    }
    if (lens === 'cap') {
      return [
        { l: '已整合', v: sig + '/' + filtered.length, miss: false },
        { l: '有活动', v: String(filtered.filter(function (a) { return a.group === 'active'; }).length), miss: false },
        { l: '仅配额', v: String(filtered.filter(function (a) { return a.group === 'quota'; }).length), miss: false },
        { l: '未接通', v: String(filtered.filter(function (a) { return a.group === 'offline'; }).length), miss: false }
      ];
    }
    if (lens === 'time') {
      return [
        { l: '活跃', v: focus ? fmtMin(focus.activeMin) : '—', miss: !(focus && focus.activeMin != null) },
        { l: '会话', v: focus && focus.sessions != null ? String(focus.sessions) : '—', miss: !(focus && focus.sessions != null) },
        { l: '请求', v: focus && focus.turns != null ? String(focus.turns) : '—', miss: !(focus && focus.turns != null) },
        { l: '热力', v: '—', miss: true }
      ];
    }
    return [
      { l: '高速窗', v: '—', miss: true },
      { l: '缓存最佳', v: focus && focus.cacheHit != null ? focus.cacheHit + '%' : '—', miss: !(focus && focus.cacheHit != null) },
      { l: '请求', v: focus && focus.turns != null ? String(focus.turns) : '—', miss: !(focus && focus.turns != null) },
      { l: '可知费用', v: fmtUsd(booked), miss: booked == null }
    ];
  }

  function honestyFields(a) {
    if (!a) return [];
    return [
      { l: '请求', ok: a.turns != null, v: fmt(a.turns) },
      { l: '会话', ok: a.sessions != null, v: fmt(a.sessions) },
      { l: '活跃', ok: a.activeMin != null, v: fmtMin(a.activeMin) },
      { l: '配额', ok: a.remainingPercent != null, v: a.remainingPercent != null ? a.remainingPercent + '%' : '—' },
      { l: '模型', ok: a.model && a.model !== '—', v: fmt(a.model) },
      { l: '可知费用', ok: a.usdBooked != null || (a.costBasis === 'official' && a.usd != null), v: a.costBasis === 'estimate' ? '~' + fmtUsd(a.usd) : fmtUsd(a.usdBooked != null ? a.usdBooked : a.usd) },
      { l: 'Token', ok: a.tok != null, v: fmtTok(a.tok) },
      { l: '缓存命中', ok: a.cacheHit != null, v: a.cacheHit != null ? a.cacheHit + '%' : '—' }
    ];
  }

  function mount(host, dto, opts) {
    if (!host || !Dto) throw new Error('DataBoard needs host + AgentBoardDto');
    opts = opts || {};
    var state = {
      dto: dto,
      focusId: Dto.canonicalId(opts.focusId || dto.focusId || ''),
      lens: opts.lens || 'eff',
      filter: opts.filter || 'all',
      layout: opts.layout || 'overview',
      showAll: !!opts.showAll,
      filterOpen: false,
      moreOpen: false
    };
    var onFocus = typeof opts.onFocus === 'function' ? opts.onFocus : function () {};
    var onAction = typeof opts.onAction === 'function' ? opts.onAction : function () {};
    var destroyed = false;

    function filtered() {
      var list = Dto.filterAgents(state.dto.agents, state.filter);
      if (state.filter === 'domestic' && !list.length) list = Dto.filterAgents(state.dto.agents, 'all');
      if (!state.showAll) {
        var sig = list.filter(function (a) { return a.signal; });
        var quiet = list.filter(function (a) { return !a.signal; });
        return sig.concat(quiet);
      }
      return list;
    }

    function hasDomestic() {
      return (state.dto.agents || []).some(function (a) { return a.domestic; });
    }

    function render() {
      if (destroyed) return;
      var list = filtered();
      var focus = findAgent(state.dto, state.focusId) || list[0] || null;
      if (focus) state.focusId = focus.id;
      var insight = insightFor(state.lens, state.dto, focus, list);
      var kpis = kpisFor(state.lens, state.dto, focus, list);
      var coverSig = list.filter(function (a) { return a.signal; }).length;
      var filterMeta = FILTERS.filter(function (f) {
        return f.id !== 'domestic' || hasDomestic();
      });
      var activeFilter = filterMeta.find(function (f) { return f.id === state.filter; }) || filterMeta[0];

      var strip = list.map(function (a) {
        var cls = 'db-src' + (a.id === state.focusId ? ' on' : '') + (a.tight ? ' tight' : '') + (!a.signal ? ' dim' : '');
        return (
          '<button type="button" class="' + cls + '" data-board="drill:' + esc(a.id) + '" title="' + esc(a.name) + '">' +
            '<span class="db-face">' + esc(a.name.slice(0, 1)) + '</span>' +
            '<i class="db-dot g-' + esc(a.group) + '"></i>' +
          '</button>'
        );
      }).join('');

      var rank = list.slice().sort(function (a, b) {
        if (state.lens === 'cost') {
          var av = a.usdBooked != null ? a.usdBooked : (a.costBasis === 'official' ? a.usd : -1);
          var bv = b.usdBooked != null ? b.usdBooked : (b.costBasis === 'official' ? b.usd : -1);
          return (bv || 0) - (av || 0);
        }
        if (state.lens === 'time') return (b.activeMin || 0) - (a.activeMin || 0);
        return (b.turns || b.tok || 0) - (a.turns || a.tok || 0);
      }).slice(0, 4).map(function (a) {
        var v = state.lens === 'cost'
          ? (a.costBasis === 'estimate' ? '~' + fmtUsd(a.usd) : fmtUsd(a.usdBooked != null ? a.usdBooked : a.usd))
          : state.lens === 'time' ? fmtMin(a.activeMin)
            : a.turns != null ? String(a.turns) : fmtTok(a.tok);
        return '<button type="button" class="db-rank-row" data-board="drill:' + esc(a.id) + '"><b>' + esc(a.name) + '</b><span>' + esc(v) + '</span></button>';
      }).join('') || '<p class="db-empty">暂无可排</p>';

      var bars = list.filter(function (a) { return a.turns != null || a.tok != null; }).slice(0, 6);
      var maxBar = bars.reduce(function (m, a) { return Math.max(m, a.turns || a.tok || 0); }, 1);
      var barHtml = bars.length
        ? bars.map(function (a) {
          var n = a.turns != null ? a.turns : a.tok;
          var h = Math.max(8, Math.round((n / maxBar) * 48));
          return '<button type="button" class="db-bar" data-board="drill:' + esc(a.id) + '" title="' + esc(a.name) + '"><i style="height:' + h + 'px"></i><span>' + esc(a.name.slice(0, 1)) + '</span></button>';
        }).join('')
        : '<p class="db-empty">今日请求柱 · 无数</p>';

      var midBody = '';
      if (state.layout === 'ledger') {
        midBody = renderLedger(list);
      } else if (state.layout === 'single' && focus) {
        midBody = renderSingle(focus);
      } else {
        midBody =
          '<div class="db-kpi">' + kpis.map(function (k) {
            return '<div class="db-kpi-card' + (k.miss ? ' miss' : '') + '"><span>' + esc(k.l) + '</span><b>' + esc(k.v) + '</b></div>';
          }).join('') + '</div>' +
          '<div class="db-focus">' +
            '<div class="db-focus-main"><span>焦点</span><b>' + esc(focus ? focus.name : '—') + '</b><small>' + esc(focus ? (focus.note || focus.group) : '') + '</small></div>' +
            '<div class="db-focus-mid">' + renderFocusMid(focus) + '</div>' +
            '<div class="db-focus-rank"><span class="db-cap">排行</span>' + rank + '</div>' +
          '</div>' +
          '<div class="db-charts"><div class="db-bars" id="dbBars">' + barHtml + '</div>' +
            '<p class="db-compare">较上周 · —（目前只有今日）</p></div>';
      }

      var previewOpen = state.layout === 'single';
      var fields = honestyFields(focus);
      var have = fields.filter(function (f) { return f.ok; }).length;

      host.innerHTML =
        '<div class="db-board" data-layout="' + esc(state.layout) + '">' +
          '<div class="db-top">' +
            '<div class="db-snap" id="dbSnap">' + esc(snapLine(focus)) + '</div>' +
            '<div class="db-more-wrap">' +
              '<button type="button" class="db-more-btn" data-board="toggle-more" aria-expanded="' + state.moreOpen + '">更多</button>' +
              (state.moreOpen
                ? '<div class="db-more-menu">' +
                    '<button type="button" data-board="export">导出今日</button>' +
                    '<button type="button" data-board="wall">副屏</button>' +
                    (state.lens === 'cost' ? '<button type="button" data-board="layout:ledger">费用账本</button>' : '') +
                  '</div>'
                : '') +
            '</div>' +
          '</div>' +
          '<nav class="db-lenses" aria-label="数据镜头">' +
            LENSES.map(function (l) {
              return '<button type="button" class="' + (state.lens === l.id ? 'on' : '') + '" data-board="lens:' + l.id + '"><b>' + l.label + '</b><small>' + l.sub + '</small></button>';
            }).join('') +
          '</nav>' +
          '<div class="db-toolbar">' +
            '<span class="db-period">目前只有今日</span>' +
            '<div class="db-filter-wrap">' +
              '<button type="button" class="db-filter-btn" data-board="toggle-filter">' +
                '筛选 · ' + esc(activeFilter.label) + (state.filter !== 'all' ? ' · 1' : '') +
              '</button>' +
              (state.filterOpen
                ? '<div class="db-filter-pop">' +
                    filterMeta.map(function (f) {
                      return '<button type="button" class="' + (state.filter === f.id ? 'on' : '') + '" data-board="filter:' + f.id + '">' + f.label + '</button>';
                    }).join('') +
                    '<button type="button" data-board="filter:all">清除筛选</button>' +
                  '</div>'
                : '') +
            '</div>' +
            '<button type="button" class="db-ghost" data-board="toggle-showall">' + (state.showAll ? '只看有信号' : '显示全部') + '</button>' +
          '</div>' +
          '<div class="db-cover"><b>已整合 ' + coverSig + ' / ' + list.length + ' 源</b><span>信号优先 · 缺字段为 —</span></div>' +
          '<div class="db-strip" id="dbStrip">' + strip + '</div>' +
          '<div class="db-insight">' +
            '<p>' + esc(insight.text) + '</p>' +
            (insight.cta ? '<button type="button" class="db-cta" data-board="' + esc(insight.cta) + '">' + esc(insight.ctaLabel) + '</button>' : '') +
          '</div>' +
          (state.layout === 'single'
            ? '<div class="db-crumb"><button type="button" data-board="layout:overview">全部 Agent</button><span>/</span><b>' + esc(focus ? focus.name : '') + '</b></div>'
            : '') +
          '<div class="db-mid" id="dbMid">' + midBody + '</div>' +
          '<aside class="db-preview' + (previewOpen ? ' is-open' : '') + '" id="dbPreview">' +
            '<header><b>' + esc(focus ? focus.name : '—') + '</b><span>' + have + '/' + fields.length + ' 字段有值</span></header>' +
            '<div class="db-fields">' +
              fields.map(function (f) {
                return '<div class="' + (f.ok ? 'ok' : 'miss') + '"><span>' + esc(f.l) + '</span><b>' + esc(f.v) + '</b></div>';
              }).join('') +
            '</div>' +
            (focus && focus.group === 'offline'
              ? '<button type="button" class="db-cta" data-board="connect:' + esc(focus.id) + '">去连接</button>'
              : '') +
            '<button type="button" class="db-ghost" data-board="export-one">导出此源</button>' +
          '</aside>' +
        '</div>';

      bind();
    }

    function renderFocusMid(focus) {
      if (!focus) return '<p class="db-empty">无数可钻</p>';
      if (focus.remainingPercent != null) {
        var rem = focus.remainingPercent;
        return '<div class="db-quota"><span>剩余配额</span><b>' + rem + '%</b><i><em style="width:' + rem + '%"></em></i></div>';
      }
      if (focus.id === 'cursor' && focus.activeMin != null) {
        return '<div class="db-quota"><span>本机活跃</span><b>' + fmtMin(focus.activeMin) + '</b><small>回合 ' + fmt(focus.turns) + '</small></div>';
      }
      return '<p class="db-empty">无配额读数</p>';
    }

    function renderSingle(a) {
      var fields = honestyFields(a);
      return (
        '<div class="db-single">' +
          '<h3>' + esc(a.name) + '</h3>' +
          '<p>' + esc(a.note || a.message || '') + ' · ' + esc(basisLabel(a.costBasis)) + '</p>' +
          renderFocusMid(a) +
          '<div class="db-fields">' +
            fields.map(function (f) {
              return '<div class="' + (f.ok ? 'ok' : 'miss') + '"><span>' + esc(f.l) + '</span><b>' + esc(f.v) + '</b></div>';
            }).join('') +
          '</div>' +
        '</div>'
      );
    }

    function renderLedger(list) {
      var booked = Dto.ledgerBookedSum(list);
      var rows = list.filter(function (a) {
        return a.usdBooked != null || a.costBasis === 'estimate' || a.costBasis === 'official' || a.costBasis === 'unpriced';
      });
      return (
        '<div class="db-ledger" id="dbLedger">' +
          '<header><h3>费用账本</h3><b>合计 ' + fmtUsd(booked) + '</b><span>估价不计合计</span></header>' +
          '<div class="db-led-rows">' +
            (rows.length ? rows.map(function (a) {
              var amt = a.usdBooked != null ? fmtUsd(a.usdBooked) : (a.costBasis === 'estimate' ? '~' + fmtUsd(a.usd) : '—');
              return '<button type="button" class="db-led-row" data-board="drill:' + esc(a.id) + '">' +
                '<b>' + esc(a.name) + '</b><em>' + esc(basisLabel(a.costBasis)) + '</em><span>' + esc(amt) + '</span></button>';
            }).join('') : '<p class="db-empty">暂无费用行</p>') +
          '</div>' +
          '<button type="button" class="db-ghost" data-board="layout:overview">返回总览</button>' +
        '</div>'
      );
    }

    function bind() {
      host.querySelectorAll('[data-board]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          handle(el.getAttribute('data-board'));
        });
      });
    }

    function handle(cmd) {
      if (!cmd) return;
      var parts = cmd.split(':');
      var head = parts[0];
      var arg = parts.slice(1).join(':');

      if (head === 'lens') {
        state.lens = arg;
        if (arg !== 'cost' && state.layout === 'ledger') state.layout = 'overview';
        render();
        return;
      }
      if (head === 'filter') {
        state.filter = arg || 'all';
        state.filterOpen = false;
        render();
        return;
      }
      if (head === 'layout') {
        state.layout = arg || 'overview';
        render();
        if (arg === 'ledger') {
          var led = host.querySelector('#dbLedger');
          if (led) led.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        return;
      }
      if (head === 'drill') {
        var id = Dto.canonicalId(arg);
        if (state.layout === 'single' && state.focusId === id) {
          state.layout = 'overview';
        } else {
          state.focusId = id;
          state.layout = 'single';
          onFocus(id);
        }
        render();
        return;
      }
      if (head === 'toggle-filter') {
        state.filterOpen = !state.filterOpen;
        state.moreOpen = false;
        render();
        return;
      }
      if (head === 'toggle-more') {
        state.moreOpen = !state.moreOpen;
        state.filterOpen = false;
        render();
        return;
      }
      if (head === 'toggle-showall') {
        state.showAll = !state.showAll;
        render();
        return;
      }
      if (head === 'enable-cursor') {
        onAction('enable-cursor');
        return;
      }
      if (head === 'connect') {
        onAction('connect:' + arg);
        return;
      }
      if (head === 'export' || head === 'export-one') {
        onAction('export');
        return;
      }
      if (head === 'wall') {
        onAction('wall');
        return;
      }
    }

    function setFocus(id) {
      state.focusId = Dto.canonicalId(id);
      // do not reset lens/filters/layout
      render();
    }

    function setLens(id) {
      state.lens = id || 'eff';
      render();
    }

    function setFilter(id) {
      state.filter = id || 'all';
      render();
    }

    function setLayout(id) {
      state.layout = id || 'overview';
      render();
    }

    function setDto(next) {
      state.dto = next;
      if (!findAgent(state.dto, state.focusId)) {
        state.focusId = next.focusId || (next.agents[0] && next.agents[0].id) || '';
      }
      render();
    }

    function destroy() {
      destroyed = true;
      host.innerHTML = '';
    }

    render();
    return {
      setFocus: setFocus,
      setLens: setLens,
      setFilter: setFilter,
      setLayout: setLayout,
      setDto: setDto,
      destroy: destroy,
      getState: function () {
        return {
          focusId: state.focusId,
          lens: state.lens,
          filter: state.filter,
          layout: state.layout,
          showAll: state.showAll
        };
      }
    };
  }

  global.AgentDataBoard = { mount: mount, LENSES: LENSES };
})(typeof window !== 'undefined' ? window : globalThis);
