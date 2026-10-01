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

  function renderPending(pending) {
    if (!pending) return '';
    if (pending.kind === 'confirm') {
      return (
        '<div class="now-gate-scr" role="presentation">' +
        '<div class="now-gate now-gate--modal" role="dialog" aria-label="确认解除锁定">' +
        '<p class="now-gate-k">情景已锁定</p>' +
        '<h3 class="now-gate-h">要换成「' +
        esc(pending.targetName || '') +
        '」吗？</h3>' +
        '<p class="now-gate-detail">现在锁着「' +
        esc(pending.pinnedName || '') +
        '」，换过去前要先解开。</p>' +
        renderGateCompare(pending) +
        '<div class="now-gate-choices">' +
        '<button type="button" class="now-gate-opt is-rec" data-now-gate-confirm>' +
        '<span class="now-gate-opt__t">解开并换过去</span>' +
        '<span class="now-gate-opt__h">锁定会取消，立刻用新情景</span></button>' +
        '<button type="button" class="now-gate-opt is-quiet" data-now-gate-cancel>' +
        '<span class="now-gate-opt__t">先不换</span>' +
        '<span class="now-gate-opt__h">继续用锁定中的情景</span></button>' +
        '</div></div></div>'
      );
    }
    if (pending.kind === 'choice') {
      return (
        '<div class="now-gate-scr" role="presentation">' +
        '<div class="now-gate now-gate--modal" role="dialog" aria-label="选择切换方式">' +
        '<p class="now-gate-k">正在跟随前台</p>' +
        '<h3 class="now-gate-h">要换成「' +
        esc(pending.targetName || '') +
        '」吗？</h3>' +
        '<p class="now-gate-detail">现在会跟着你打开的应用自动换情景。先看两边差别，再选怎么切。</p>' +
        renderGateCompare(pending) +
        '<div class="now-gate-choices">' +
        '<button type="button" class="now-gate-opt is-rec" data-now-gate-choice="override">' +
        '<span class="now-gate-opt__t">先用一会儿</span>' +
        '<span class="now-gate-opt__h">推荐 · 离开这个应用后，继续跟前台</span></button>' +
        '<button type="button" class="now-gate-opt" data-now-gate-choice="pin">' +
        '<span class="now-gate-opt__t">就锁定这个</span>' +
        '<span class="now-gate-opt__h">先别自动跳走，直到你手动解锁</span></button>' +
        '<button type="button" class="now-gate-opt is-quiet" data-now-gate-choice="disable_follow">' +
        '<span class="now-gate-opt__t">关掉自动跟随，再切过去</span>' +
        '<span class="now-gate-opt__h">以后不会再跟着前台应用变</span></button>' +
        '</div>' +
        '<button type="button" class="now-gate-cancel" data-now-gate-cancel>取消</button>' +
        '</div></div>'
      );
    }
    return '';
  }

  function renderGateCompare(pending) {
    var fromName = pending.currentName || '当前情景';
    var toName = pending.targetName || '目标情景';
    var fromLines = Array.isArray(pending.currentDoes) ? pending.currentDoes : [];
    var toLines = Array.isArray(pending.targetDoes) ? pending.targetDoes : [];
    function card(lab, name, lines, tone) {
      var list =
        lines && lines.length
          ? '<ul>' +
            lines
              .slice(0, 3)
              .map(function (x) {
                return '<li>' + esc(x) + '</li>';
              })
              .join('') +
            '</ul>'
          : '<p class="now-gate-card__empty">暂无能力摘要</p>';
      return (
        '<div class="now-gate-card ' +
        tone +
        '"><span class="now-gate-card__lab">' +
        esc(lab) +
        '</span><strong>' +
        esc(name) +
        '</strong>' +
        list +
        '</div>'
      );
    }
    return (
      '<div class="now-gate-compare" aria-hidden="true">' +
      card('现在', fromName, fromLines, 'is-from') +
      '<span class="now-gate-arrow" aria-hidden="true">→</span>' +
      card('换成', toName, toLines, 'is-to') +
      '</div>'
    );
  }

  function renderVoiceStrip() {
    // Always in DOM (hidden when idle) so live sync can patch without full paint.
    return (
      '<section class="now-vstrip" data-now-voice-strip hidden aria-live="polite">' +
      '<div class="now-vstrip-hd">' +
      '<div class="now-vstrip-pulse" aria-hidden="true">🎤</div>' +
      '<div class="now-vstrip-st"><span data-now-voice-status>正在听…</span>' +
      '<s data-now-voice-hint>说完点停止，或按快捷键结束</s></div>' +
      '<div class="now-vstrip-acts">' +
      '<button type="button" data-now-voice-pause>暂停</button>' +
      '<button type="button" class="now-vstrip-stop" data-now-voice-stop>停止</button>' +
      '</div></div>' +
      '<div class="now-vstrip-live is-hint" data-now-voice-live>请对着麦克风说话…</div>' +
      '</section>'
    );
  }

  function renderDock(opts) {
    var voiceOn = opts.voiceOn !== false;
    var listening = !!opts.listening;
    var hotkey = opts.hotkey || resolveHotkey(null);
    return (
      '<footer class="now-dock">' +
      '<button type="button" class="now-dock-voice' +
      (listening ? ' is-on' : '') +
      '" data-now-voice' +
      (voiceOn ? '' : ' disabled') +
      '>' +
      (listening ? '🎤 倾听中…' : '🎤 说点什么') +
      '</button>' +
      '<span class="now-dock-center">● OneTone</span>' +
      '<kbd class="now-dock-key">' +
      esc(hotkey) +
      '</kbd></footer>'
    );
  }

  function renderEmptyView() {
    return (
      '<div class="now-shell">' +
      '<div class="now-body">' +
      '<section class="now-cockpit now-cockpit--idle" aria-label="当前情景">' +
      '<p class="now-k">当前情景</p>' +
      '<h1>还没有情景</h1>' +
      '<p class="now-stance">先添加一个情景，OneTone 才能按情景帮你。</p>' +
      '<div class="now-cockpit-foot now-cockpit-foot--stack">' +
      '<button type="button" class="now-btn now-btn--p" data-now-bootstrap="recommended">用推荐情景开始</button>' +
      '<button type="button" class="now-btn" data-now-scenes="new">自己建</button>' +
      '</div></section>' +
      renderVoiceStrip() +
      '</div>' +
      renderDock({ voiceOn: true, listening: false, hotkey: resolveHotkey(null) }) +
      '</div>'
    );
  }

  function renderTodayBox(today) {
    var entries = Array.isArray(today) ? today : [];
    var T = global.OneToneNowToday;
    var buckets =
      T && T.summarizeBuckets
        ? T.summarizeBuckets(entries)
        : { total: entries.length, interrupt: 0, restore: 0, privacy: 0, status: 0 };
    var labels =
      (T && T.BUCKET_LABEL) || {
        interrupt: '减少打断',
        restore: '恢复环境',
        privacy: '保护隐私',
        status: '提醒状态'
      };

    var head =
      '<div class="now-today-hd">' +
      '<div class="now-today-n">' +
      esc(String(buckets.total)) +
      '<span>次</span></div>' +
      '<div class="now-today-lb">主动帮你处理了事情</div>' +
      '<div class="now-today-kpis">' +
      '<div class="now-today-kpi"><b>' +
      esc(String(buckets.interrupt)) +
      '</b><s>' +
      esc(labels.interrupt) +
      '</s></div>' +
      '<div class="now-today-kpi"><b>' +
      esc(String(buckets.restore)) +
      '</b><s>' +
      esc(labels.restore) +
      '</s></div>' +
      '<div class="now-today-kpi"><b>' +
      esc(String(buckets.privacy)) +
      '</b><s>' +
      esc(labels.privacy) +
      '</s></div>' +
      '<div class="now-today-kpi"><b>' +
      esc(String(buckets.status)) +
      '</b><s>' +
      esc(labels.status) +
      '</s></div>' +
      '</div></div>';

    var body;
    if (!entries.length) {
      body = '<div class="now-today-empty">今天还没有记录</div>';
    } else {
      body =
        '<div class="now-today-list">' +
        entries
          .map(function (e) {
            return (
              '<div class="now-today-item">' +
              '<span class="now-today-tm">' +
              esc(e.time || '') +
              '</span>' +
              '<div class="now-today-tx"><b>' +
              esc(e.text || '') +
              '</b></div>' +
              '<span class="now-today-ch" title="' +
              esc(e.channel || '') +
              '">' +
              esc(e.src || '•') +
              '</span></div>'
            );
          })
          .join('') +
        '</div>';
    }

    return (
      '<section class="now-today" aria-label="它今天为你做了什么">' +
      '<div class="now-today-bh"><h2>它今天为你做了什么</h2>' +
      '<span class="now-today-s">全部来自真实执行记录</span></div>' +
      '<div class="now-today-box">' +
      head +
      body +
      '</div></section>'
    );
  }

  function renderNowView(opts) {
    var s = opts.snapshot;
    if (s && s.empty) return renderEmptyView();

    var needsExpanded = !!opts.needsExpanded;
    var adjustOpen = !!opts.adjustOpen;
    var pending = opts.pending || null;
    var active = s.active;
    var maybe = s.habits.filter(function (h) {
      return h.maybe && !h.active;
    });
    var canAdjust =
      !!(active && ((active.actions && active.actions.length) || (active.ops && active.ops.length)));

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
    } else if (adjustOpen && canAdjust) {
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
      var todayList = Array.isArray(s.today) ? s.today : [];
      var showHelping = !todayList.length;
      var helpingBlock = showHelping
        ? '<p class="now-help-k">OneTone 正在帮你</p>' +
          '<ul class="now-promises">' +
          (active.helping || [])
            .map(function (t) {
              return '<li>' + esc(t) + '</li>';
            })
            .join('') +
          '</ul>'
        : '';
      cockpit =
        '<section class="now-cockpit" aria-label="当前情景">' +
        '<p class="now-k">当前情景</p>' +
        '<h1>' +
        esc(active.name) +
        '</h1>' +
        (active.description
          ? '<p class="now-stance">' + esc(active.description) + '</p>'
          : '') +
        helpingBlock +
        '<div class="now-cockpit-foot">' +
        '<span class="now-status-line">' +
        esc(s.status.line) +
        '</span>' +
        (canAdjust
          ? '<button type="button" class="now-btn" data-now-adjust>调整</button>'
          : '') +
        '</div></section>';
    }

    var maybeHtml = maybe.length
      ? '<div class="now-maybe"><span class="now-maybe-k">可能切换</span>' +
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

    var todayHtml = renderTodayBox(s.today);

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
    var listening = !!(opts.voice && opts.voice.listening);

    return (
      '<div class="now-shell">' +
      renderPending(pending) +
      '<div class="now-body">' +
      '<div class="now-layout">' +
      cockpit +
      maybeHtml +
      renderVoiceStrip() +
      todayHtml +
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
      renderDock({ voiceOn: voice, listening: listening, hotkey: hotkey }) +
      '</div>'
    );
  }

  function renderScenesView(opts) {
    var s = opts.snapshot;
    var focusId = opts.focusHabitId || '';
    var runtimeMode = !!opts.runtimeMode;
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
              '">切换到此情景</button>') +
          (!runtimeMode && !h.active
            ? '<button type="button" class="now-btn" data-now-remove="' +
              esc(h.id) +
              '">删除</button>'
            : '') +
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
      '<p class="now-secsub">首页是「当前情景」驾驶舱。这里查看结果开关；添加/删除情景请用情景库。</p>' +
      (runtimeMode
        ? ''
        : '<div class="now-new-bar">' +
          '<input type="text" id="nowNewName" placeholder="新情景名称，例如：深度写作" />' +
          '<button type="button" class="now-btn now-btn--p" data-now-add>＋ 添加</button></div>') +
      '<div class="now-mgmt-grid" data-now-focus="' +
      esc(focusId) +
      '">' +
      cards +
      '</div>' +
      '<div class="now-note">首页与这里共用同一份结果开关。' +
      (runtimeMode ? '新增情景请打开情景库。' : '') +
      '</div>' +
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
    renderVoiceStrip: renderVoiceStrip,
    renderDock: renderDock,
    renderNowView: renderNowView,
    renderScenesView: renderScenesView,
    renderDemoBar: renderDemoBar
  };
})(typeof window !== 'undefined' ? window : globalThis);
