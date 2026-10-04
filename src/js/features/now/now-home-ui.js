/**
 * Now home UI — Hero 情景组件 + 我的情景条 + 现在/可以/今天。
 */
(function (global) {
  'use strict';

  var NEED_CAP = 2;
  var NEED_CTA = {
    approve_rm: '查看并决定',
    view_reply: '查看请求',
    view_progress: '查看进度',
    keep_quiet: '继续别打扰',
    extra_demo: '确认'
  };
  var CTA = NEED_CTA;

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
      renderHero({ active: null, status: { line: '' }, habits: [] }) +
      '<p class="now-secsub" style="margin-top:14px">也可以用推荐情景快速开始。</p>' +
      '<div class="now-cockpit-foot now-cockpit-foot--stack" style="max-width:28ch">' +
      '<button type="button" class="now-btn now-btn--p" data-now-bootstrap="recommended">用推荐情景开始</button>' +
      '<button type="button" class="now-btn" data-now-scenes="new">自己建</button></div>' +
      renderVoiceStrip() +
      '</div>' +
      renderDock({ voiceOn: true, listening: false, hotkey: resolveHotkey(null) }) +
      '</div>'
    );
  }

  function sourcePill(line) {
    var s = String(line || '');
    if (/锁定/.test(s)) return { pill: '已锁定', rest: s };
    if (/跟随前台/.test(s)) return { pill: '跟随前台', rest: s };
    if (/临时|一会儿/.test(s)) return { pill: '先用一会儿', rest: s };
    if (/手动/.test(s)) return { pill: '手动', rest: s };
    return { pill: '', rest: s };
  }

  function renderHero(s, facts) {
    facts = facts || {};
    var active = s && s.active;
    var app = facts.app || '未发现';
    var project = facts.project || '未发现';
    var habitName =
      (facts.habitName && String(facts.habitName).trim()) ||
      (active ? active.name : '还没有情景');
    var statusLine = (s && s.status && s.status.line) || '';
    var src = sourcePill(statusLine);
    var matchLabel =
      facts.matchLabel ||
      (src.pill === '已锁定'
        ? '已锁定'
        : src.pill === '跟随前台'
          ? '已匹配前台'
          : src.pill || (active ? '当前配置' : '未配置'));
    var isOnetone =
      !!facts.selfForeground ||
      /onetone|一声/i.test(String(app)) ||
      /onetone\.exe/i.test(String(facts.processName || ''));

    var hint = '';
    if (!active && !facts.habitId) {
      hint = '先添加一个情景，才能按应用帮忙。';
    } else if (isOnetone) {
      hint = '正在查看 OneTone，不切换应用习惯。';
    } else if (facts.match === 'probable' || (/通用设置/.test(habitName) && app && app !== '未发现')) {
      hint = '还没有为此应用配置专属习惯。';
    } else {
      hint = src.rest || (active && active.description) || '';
    }

    return (
      '<section class="now-cockpit now-cockpit--fg" aria-label="当前前台上下文">' +
      '<p class="now-k">当前前台</p>' +
      '<h1>' +
      esc(app) +
      '</h1>' +
      '<div class="now-fg-grid" role="list">' +
      '<div class="now-fg-cell" role="listitem"><span class="now-fg-k">项目</span><span class="now-fg-v' +
      (!project || project === '未发现' ? ' is-mute' : '') +
      (facts.projectInferred ? ' is-inferred' : '') +
      '">' +
      esc(project) +
      (facts.projectInferred ? '<i>推断</i>' : '') +
      '</span></div>' +
      '<div class="now-fg-cell" role="listitem"><span class="now-fg-k">正在使用</span><span class="now-fg-v">' +
      esc(habitName) +
      '</span></div>' +
      '<div class="now-fg-cell" role="listitem"><span class="now-fg-k">状态</span><span class="now-fg-v">' +
      esc(matchLabel) +
      '</span></div>' +
      '</div>' +
      (hint ? '<p class="now-stance">' + esc(hint) + '</p>' : '') +
      '<div class="now-cockpit-foot">' +
      '<button type="button" class="now-btn" data-now-fg-refresh="">刷新</button>' +
      (active || facts.habitId
        ? '<button type="button" class="now-btn" data-now-scenes="">切换配置</button>'
        : '<button type="button" class="now-btn now-btn--p" data-now-scenes="new">去添加</button>') +
      '</div></section>'
    );
  }

  function renderScenesStrip(s) {
    var strip = (s.habits || [])
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
    return (
      '<details class="now-fold now-scenes-fold">' +
      '<summary>切换情景</summary>' +
      '<section class="now-scenes-strip" aria-label="我的情景">' +
      '<div class="now-strip-head"><h2>我的情景</h2>' +
      '<button type="button" class="now-mgmt-link" data-now-scenes="">情景管理</button></div>' +
      '<div class="now-strip-row">' +
      strip +
      '</div></section></details>'
    );
  }

  function renderFacts(_facts) {
    // First screen: foreground facts live in the cockpit. Keep stub for callers.
    return '';
  }

  function renderAgentHome(view) {
    if (!view) return '';
    var actions =
      '<div class="now-agent-actions">' +
      (view.actions || [])
        .map(function (a) {
          var cls = 'now-btn';
          if (a.kind === 'primary') cls += ' now-btn--p';
          if (a.kind === 'ghost') cls += ' now-btn--ghost';
          return (
            '<button type="button" class="' +
            cls +
            '" data-now-agent-act="' +
            esc(a.id) +
            '">' +
            esc(a.label) +
            '</button>'
          );
        })
        .join('') +
      '</div>';

    var step = view.stepText
      ? '<div class="now-agent-step"><span>当前正在</span><b>' +
        esc(view.stepText) +
        '</b></div>'
      : '';

    var progress = view.progress
      ? '<div class="now-agent-progress">' +
        '<div class="now-agent-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
        esc(String(view.progress.pct)) +
        '"><i style="width:' +
        esc(String(view.progress.pct)) +
        '%"></i></div>' +
        '<strong>' +
        esc(view.progress.text) +
        '</strong></div>'
      : '';

    var need = view.needYou
      ? '<p class="now-agent-need">' + esc(view.needYou) + '</p>'
      : '';

    var note = view.controlNote
      ? '<p class="now-agent-note">' + esc(view.controlNote) + '</p>'
      : '';

    var acts = view.activity || [];
    var firstAct = acts[0];
    var latestOne = firstAct
      ? '<div class="now-agent-act-item">' +
        '<span class="now-agent-mark ' +
        esc((firstAct.mark && firstAct.mark.cls) || '') +
        '" aria-hidden="true">' +
        esc((firstAct.mark && firstAct.mark.mark) || '·') +
        '</span>' +
        '<div><div class="tx">' +
        esc(firstAct.text) +
        '</div>' +
        (firstAct.time ? '<div class="sub">' + esc(firstAct.time) + '</div>' : '') +
        '</div></div>'
      : '<div class="now-agent-empty">' + esc(view.activityEmpty || '还没有新动静') + '</div>';

    var activityItems = acts
      .map(function (a) {
        return (
          '<div class="now-agent-act-item">' +
          '<span class="now-agent-mark ' +
          esc((a.mark && a.mark.cls) || '') +
          '" aria-hidden="true">' +
          esc((a.mark && a.mark.mark) || '·') +
          '</span>' +
          '<div><div class="tx">' +
          esc(a.text) +
          '</div>' +
          (a.time ? '<div class="sub">' + esc(a.time) + '</div>' : '') +
          '</div></div>'
        );
      })
      .join('');

    var memHtml = (view.refs && view.refs.memLines ? view.refs.memLines : [])
      .map(function (m) {
        return (
          '<span class="now-agent-mem" title="' +
          esc(m.body || '') +
          '">' +
          esc(m.title) +
          '</span>'
        );
      })
      .join('');

    var moreBody =
      '<div class="now-agent-activity" aria-label="最近活动">' +
      '<p class="now-sec-k">最近活动</p>' +
      (activityItems ||
        '<div class="now-agent-empty">' + esc(view.activityEmpty || '还没有新动静') + '</div>') +
      '</div>' +
      '<div class="now-agent-refs" aria-label="上下文摘要">' +
      '<p class="now-sec-k">上下文摘要</p>' +
      '<p class="now-agent-stats">' +
      esc((view.refs && view.refs.statsLine) || '') +
      '</p>' +
      (memHtml ? '<div class="now-agent-mems">' + memHtml + '</div>' : '') +
      '</div>';

    var rows = Array.isArray(view.agentRows) ? view.agentRows : [];
    var kindLabel = {
      needsYou: '需要你',
      living: '进行中',
      error: '异常',
      recent: '最近'
    };
    var ledger =
      rows.length > 1
        ? rows
            .map(function (r) {
              var badges = '';
              if (r.evidenceTier || r.confidence) {
                badges +=
                  '<span class="now-agent-badge">' +
                  esc(String(r.evidenceTier || r.confidence || '')) +
                  '</span>';
              }
              if (r.probeStatus && /stale|read_locked|consent/i.test(String(r.probeStatus))) {
                badges +=
                  '<span class="now-agent-badge now-agent-badge--warn">' +
                  esc(String(r.probeStatus)) +
                  '</span>';
              }
              return (
                '<div class="now-agent-ledger-row" data-kind="' +
                esc(String(r.kind || '')) +
                '">' +
                '<span class="now-agent-ledger-kind">' +
                esc(kindLabel[r.kind] || r.kind || '') +
                '</span>' +
                '<span class="now-agent-ledger-prov">' +
                esc(r.provider || 'Agent') +
                '</span>' +
                '<span class="now-agent-ledger-title">' +
                esc(r.title || r.cause || '') +
                '</span>' +
                (r.when
                  ? '<span class="now-agent-ledger-when">' + esc(r.when) + '</span>'
                  : '') +
                (badges ? '<span class="now-agent-ledger-badges">' + badges + '</span>' : '') +
                '</div>'
              );
            })
            .join('')
        : '';

    return (
      '<section class="now-zone now-zone--agent" aria-label="Agent 台账" data-now-agent-home>' +
      (ledger
        ? '<div class="now-agent-ledger" aria-label="多个 Agent">' +
          '<p class="now-help-k">Agent 台账 · ' +
          esc(String(rows.length)) +
          ' 条</p>' +
          ledger +
          '</div>'
        : '') +
      '<div class="now-agent-card' +
      (view.idle ? ' is-idle' : '') +
      '">' +
      '<p class="now-help-k">' +
      esc(view.helpK) +
      '</p>' +
      '<h3 class="now-agent-title">' +
      esc(view.title) +
      '</h3>' +
      '<p class="now-agent-blurb">' +
      view.blurb +
      '</p>' +
      step +
      progress +
      need +
      actions +
      note +
      (view.demo
        ? '<p class="now-agent-demo">演示数据 · 尚未连接 Provider</p>'
        : '') +
      '</div>' +
      '<div class="now-agent-latest" aria-label="最近一条活动">' +
      latestOne +
      '</div>' +
      '<details class="now-fold now-agent-more"><summary>更多信息</summary>' +
      moreBody +
      '</details>' +
      '</section>'
    );
  }

  function renderCanZone(opts) {
    var need = opts.criticalNeed;
    var needHtml = need
      ? '<div class="now-crit">' +
        '<div><b>' +
        esc(need.title || '') +
        '</b><s>' +
        esc(need.detail || '') +
        '</s></div>' +
        '<button type="button" class="now-crit-go" data-now-open-need="' +
        esc(need.id || '') +
        '">' +
        esc(NEED_CTA[need.id] || '查看') +
        '</button></div>'
      : '<div class="now-crit-empty">暂时没有需要你决定的事</div>';
    return (
      '<section class="now-zone now-zone--can" aria-label="可以">' +
      '<p class="now-zone-k">可以 <span>有证据才给按钮</span></p>' +
      needHtml +
      '<div class="now-can-pair">' +
      '<button type="button" class="now-can-card" data-now-ctx-open>' +
      '<span class="now-can-ic">🔍</span><b>查看上下文</b>' +
      '<s>看看 OneTone 到底知道什么</s></button></div></section>'
    );
  }

  function renderTodayBox(today) {
    var entries = Array.isArray(today) ? today : [];
    var sub =
      entries.length > 0
        ? entries.length + ' 条真实操作'
        : '还没有记录';
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
              '<div class="now-today-tx"><b' +
              (e.proactive ? ' class="is-proactive"' : '') +
              '>' +
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
      '<section class="now-today" aria-label="今天你用了什么">' +
      '<div class="now-today-bh"><h2>今天你用了什么</h2>' +
      '<span class="now-today-s">' +
      esc(sub) +
      '</span></div>' +
      '<div class="now-today-box">' +
      body +
      '</div></section>'
    );
  }

  function renderContextPanel(ctx) {
    if (!ctx || !ctx.open) return '';
    var rows = Array.isArray(ctx.rows) ? ctx.rows : [];
    var body = rows.length
      ? '<ul class="now-ctx-list">' +
        rows
          .map(function (r) {
            return (
              '<li><span>' +
              esc(r.k) +
              '</span><b>' +
              esc(r.v) +
              '</b></li>'
            );
          })
          .join('') +
        '</ul>'
      : '<p class="now-ctx-empty">它现在什么都不知道</p>';
    return (
      '<div class="now-ctx-scr" data-now-ctx-scr role="presentation">' +
      '<div class="now-ctx-panel" role="dialog" aria-label="查看上下文">' +
      '<div class="now-ctx-hd"><h3>它现在知道什么</h3>' +
      '<button type="button" data-now-ctx-close>关闭</button></div>' +
      body +
      '</div></div>'
    );
  }

  function renderNowView(opts) {
    var s = opts.snapshot;
    if (s && s.empty) return renderEmptyView();

    var pending = opts.pending || null;
    var voice = !(s.input && s.input.voice === false);
    var hotkey = resolveHotkey(s.input);
    var listening = !!(opts.voice && opts.voice.listening);

    return (
      '<div class="now-shell">' +
      renderPending(pending) +
      renderContextPanel(opts.contextPanel) +
      '<div class="now-body">' +
      '<div class="now-layout">' +
      renderHero(s, opts.facts) +
      renderAgentHome(opts.agentHome) +
      renderCanZone({ criticalNeed: opts.criticalNeed }) +
      renderScenesStrip(s) +
      '<details class="now-fold now-today-fold"><summary>今天</summary>' +
      renderTodayBox(s.today) +
      '</details>' +
      renderVoiceStrip() +
      '</div></div>' +
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
    var agentBar = '';
    var AH = global.OneToneNowAgentHome;
    if (AH && AH.fixtureLabels && opts.agentDemo) {
      var labels = AH.fixtureLabels();
      var ai = opts.agentFixtureIndex != null ? opts.agentFixtureIndex : 0;
      agentBar =
        '<div class="now-demo now-demo--agent" id="nowAgentDemoBar">' +
        labels
          .map(function (row) {
            return (
              '<button type="button" data-now-agent-fx="' +
              esc(String(row.index)) +
              '"' +
              (row.index === ai ? ' class="on"' : '') +
              '>' +
              esc(row.label) +
              '</button>'
            );
          })
          .join('') +
        '</div>';
    }
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
      '</div>' +
      agentBar
    );
  }

  global.OneToneNowHomeUi = {
    NEED_CAP: NEED_CAP,
    NEED_CTA: NEED_CTA,
    esc: esc,
    resolveHotkey: resolveHotkey,
    renderVoiceStrip: renderVoiceStrip,
    renderDock: renderDock,
    renderAgentHome: renderAgentHome,
    renderNowView: renderNowView,
    renderScenesView: renderScenesView,
    renderDemoBar: renderDemoBar
  };
})(typeof window !== 'undefined' ? window : globalThis);
