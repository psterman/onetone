/**
 * Now home UI — 当前情景驾驶舱（看 / 调 / 切）+ 情景管理子页。
 */
(function (global) {
  'use strict';

  var NEED_CAP = 2;
  var CTA = {
    approve_rm: '查看并决定',
    view_reply: '查看请求',
    view_progress: '查看进度',
    keep_quiet: '继续别打扰',
    extra_demo: '确认'
  };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function resolveHotkey(input) {
    if (input && input.hotkey) return input.hotkey;
    try {
      var cfg = global.OneToneState && global.OneToneState.config;
      var hk = cfg && (cfg.hotkey || cfg.voiceHotkey || cfg.wakeHotkey);
      if (hk) return String(hk);
    } catch (_) {}
    return 'Ctrl+Space';
  }

  function renderNowView(opts) {
    var s = opts.snapshot;
    var needsExpanded = !!opts.needsExpanded;
    var adjustOpen = !!opts.adjustOpen;
    var active = s.active;
    var maybe = s.habits.filter(function (h) {
      return h.maybe && !h.active;
    });

    var cockpit;
    if (!active) {
      cockpit =
        '<section class="now-cockpit now-cockpit--idle" aria-label="当前情景">' +
        '<p class="now-k">当前情景</p>' +
        '<h1>待命</h1>' +
        '<p class="now-stance">还没进入明确情景。点下方切换，或等发现后由你确认。</p>' +
        '<div class="now-cockpit-foot">' +
        '<span class="now-status-line">' +
        esc(s.status.line) +
        '</span></div></section>';
    } else if (adjustOpen) {
      var actions = active.actions || active.ops || [];
      cockpit =
        '<section class="now-cockpit now-cockpit--adjust" aria-label="当前情景">' +
        '<p class="now-k">当前情景</p>' +
        '<h1>' +
        esc(active.name) +
        '</h1>' +
        '<p class="now-help-k">微调这个情景</p>' +
        '<div class="now-adjust-list">' +
        actions
          .map(function (a) {
            var label = a.label || a.title || '';
            var enabled = !!a.enabled;
            return (
              '<div class="now-adjust-row">' +
              '<div class="now-adjust-tx"><b>' +
              esc(label) +
              '</b>' +
              (a.effect ? '<s>' + esc(a.effect) + '</s>' : '') +
              '</div>' +
              '<button type="button" class="now-sw now-sw--on-cockpit' +
              (enabled ? ' on' : '') +
              '" data-now-op="' +
              esc(active.id) +
              ':' +
              esc(a.id) +
              '" aria-label="' +
              esc(label) +
              '"></button></div>'
            );
          })
          .join('') +
        '</div>' +
        '<div class="now-cockpit-foot">' +
        '<span class="now-status-line">' +
        esc(s.status.line) +
        '</span>' +
        '<button type="button" class="now-btn" data-now-adjust-done>完成</button>' +
        '</div></section>';
    } else {
      cockpit =
        '<section class="now-cockpit" aria-label="当前情景">' +
        '<p class="now-k">当前情景</p>' +
        '<h1>' +
        esc(active.name) +
        '</h1>' +
        (active.description
          ? '<p class="now-stance">' + esc(active.description) + '</p>'
          : '') +
        '<p class="now-help-k">OneTone 正在帮你</p>' +
        '<ul class="now-promises">' +
        (active.helping || [])
          .map(function (t) {
            return '<li>' + esc(t) + '</li>';
          })
          .join('') +
        '</ul>' +
        '<div class="now-cockpit-foot">' +
        '<span class="now-status-line">' +
        esc(s.status.line) +
        '</span>' +
        '<button type="button" class="now-btn" data-now-adjust>调整</button>' +
        '</div></section>';
    }

    var maybeHtml = maybe.length
      ? '<div class="now-maybe"><span class="now-maybe-k">可能正在</span>' +
        maybe
          .map(function (h) {
            return (
              '<button type="button" class="now-maybe-chip" data-now-activate="' +
              esc(h.id) +
              '">' +
              esc(h.name) +
              '</button>'
            );
          })
          .join('') +
        '</div>'
      : '';

    var allNeeds = s.needsYou || [];
    var shown =
      needsExpanded || allNeeds.length <= NEED_CAP
        ? allNeeds
        : allNeeds.slice(0, NEED_CAP);
    var more = allNeeds.length - shown.length;
    var needsHtml = allNeeds.length
      ? '<ul class="now-need-list">' +
        shown
          .map(function (n) {
            return (
              '<li><div><p class="now-need-title">' +
              esc(n.title) +
              '</p><p class="now-need-detail">' +
              esc(n.detail) +
              '</p></div><div class="now-act-row">' +
              '<button type="button" class="now-act' +
              (n.primary ? ' now-act--primary' : '') +
              '">' +
              esc(CTA[n.id] || (n.primary ? '处理' : '好的')) +
              '</button></div></li>'
            );
          })
          .join('') +
        '</ul>' +
        (more > 0
          ? '<button type="button" class="now-need-more" data-now-need-more>查看全部（' +
            allNeeds.length +
            '）</button>'
          : needsExpanded && allNeeds.length > NEED_CAP
            ? '<button type="button" class="now-need-more" data-now-need-more>收起</button>'
            : '')
      : '<p class="now-need-empty">没有需要你决定的事</p>';

    var strip = s.habits
      .map(function (h) {
        return (
          '<button type="button" class="now-scene-chip' +
          (h.active ? ' on' : '') +
          (h.maybe ? ' maybe' : '') +
          '" data-now-activate="' +
          esc(h.id) +
          '"><span class="now-sc-name">' +
          esc(h.short || h.name) +
          '</span>' +
          (h.active ? '<span class="now-sc-tag">当前</span>' : '') +
          (h.maybe && !h.active
            ? '<span class="now-sc-tag soft">可能</span>'
            : '') +
          '</button>'
        );
      })
      .join('');

    var voice = !(s.input && s.input.voice === false);
    var hotkey = resolveHotkey(s.input);

    return (
      '<div class="now-shell">' +
      '<div class="now-body">' +
      '<div class="now-layout">' +
      cockpit +
      maybeHtml +
      '<div class="now-below">' +
      '<section class="now-scenes-strip" aria-label="我的情景">' +
      '<div class="now-strip-head"><h2>我的情景</h2>' +
      '<button type="button" class="now-mgmt-link" data-now-scenes="">情景管理</button></div>' +
      '<div class="now-strip-row">' +
      strip +
      '</div></section>' +
      '<section class="now-block now-block--need" aria-label="需要你决定">' +
      '<h2>需要决定</h2>' +
      needsHtml +
      '</section></div></div></div>' +
      '<footer class="now-dock">' +
      '<button type="button" class="now-dock-voice" data-now-voice' +
      (voice ? '' : ' disabled') +
      '>🎤 说点什么</button>' +
      '<span class="now-dock-center">● OneTone</span>' +
      '<kbd class="now-dock-key">' +
      esc(hotkey) +
      '</kbd></footer></div>'
    );
  }

  function renderScenesView(opts) {
    var s = opts.snapshot;
    var focusId = opts.focusHabitId || '';
    var cards = s.habits
      .map(function (h) {
        return (
          '<article class="now-mgmt-card' +
          (h.active ? ' on' : '') +
          '" id="now-habit-' +
          esc(h.id) +
          '">' +
          '<h3>' +
          esc(h.name) +
          (h.active ? ' · 当前' : '') +
          '</h3>' +
          '<p class="now-blurb">' +
          esc(h.description || h.blurb) +
          '</p>' +
          '<p class="now-mgmt-sec">何时进入（参考）</p>' +
          '<ul class="now-mgmt-list">' +
          (h.when || [])
            .map(function (t) {
              return '<li>' + esc(t) + '</li>';
            })
            .join('') +
          '</ul>' +
          '<p class="now-mgmt-sec">自动协助</p>' +
          '<ul class="now-mgmt-list">' +
          (h.does || [])
            .map(function (t) {
              return '<li>' + esc(t) + '</li>';
            })
            .join('') +
          '</ul>' +
          '<p class="now-mgmt-sec">结果开关</p>' +
          (h.ops || [])
            .map(function (o) {
              return (
                '<div class="now-op-row"><div class="now-tx"><b>' +
                esc(o.title) +
                '</b><s>' +
                esc(o.effect) +
                '</s></div>' +
                '<button type="button" class="now-sw' +
                (o.enabled ? ' on' : '') +
                '" data-now-op="' +
                esc(h.id) +
                ':' +
                esc(o.id) +
                '" aria-label="' +
                esc(o.title) +
                '"></button></div>'
              );
            })
            .join('') +
          '<div class="now-mgmt-actions">' +
          (h.active
            ? ''
            : '<button type="button" class="now-btn now-btn--p" data-now-activate="' +
              esc(h.id) +
              '">切换到此状态</button>') +
          (h.active
            ? ''
            : '<button type="button" class="now-btn" data-now-remove="' +
              esc(h.id) +
              '">删除</button>') +
          '</div></article>'
        );
      })
      .join('');

    return (
      '<div class="now-shell now-shell--scenes">' +
      '<div class="now-body">' +
      '<div class="now-scenes-bar">' +
      '<button type="button" class="now-btn" data-now-back>← 回到现在</button>' +
      '<button type="button" class="now-btn" data-now-settings>设置</button></div>' +
      '<p class="now-secsub">首页是「当前情景」驾驶舱。这里管理情景清单与高级说明，不是写自动化规则。</p>' +
      '<div class="now-new-bar">' +
      '<input type="text" id="nowNewName" placeholder="新情景名称，例如：深度写作" />' +
      '<button type="button" class="now-btn now-btn--p" data-now-add>＋ 添加</button></div>' +
      '<div class="now-mgmt-grid" data-now-focus="' +
      esc(focusId) +
      '">' +
      cards +
      '</div>' +
      '<div class="now-note">首页只展示承诺（正在帮你什么）。这里才能微调「结果开关」。</div>' +
      '</div></div>'
    );
  }

  function renderDemoBar(opts) {
    var fixtures = global.OneToneNowFixtures;
    if (!fixtures) return '';
    var order = fixtures.DEMO_ORDER || [];
    var tier = opts.tier || 's1';
    return (
      '<div class="now-demo" id="nowDemoBar">' +
      order
        .map(function (id) {
          var row = fixtures.FIXTURES[id];
          return (
            '<button type="button" data-now-tier="' +
            esc(id) +
            '"' +
            (id === tier ? ' class="on"' : '') +
            '>' +
            esc(row ? row.label : id) +
            '</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  global.OneToneNowHomeUi = {
    NEED_CAP: NEED_CAP,
    esc: esc,
    resolveHotkey: resolveHotkey,
    renderNowView: renderNowView,
    renderScenesView: renderScenesView,
    renderDemoBar: renderDemoBar
  };
})(typeof window !== 'undefined' ? window : globalThis);
