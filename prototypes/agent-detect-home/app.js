(function () {
  'use strict';

  var fixtures = window.AgentDetectFixtures;
  var stage = document.getElementById('stage');
  var sceneBar = document.getElementById('sceneBar');
  var viewBar = document.getElementById('viewBar');
  var filterBar = document.getElementById('filterBar');
  var filterSection = document.getElementById('filterSection');
  var frameLabel = document.getElementById('frameLabel');
  var toast = document.getElementById('toast');
  var params = new URLSearchParams(location.search);
  var sceneId = params.get('scene') || 'mixed';
  var viewId = params.get('view') || 'split';
  var filterId = params.get('filter') || 'actionable';
  var toastTimer = 0;
  var selectedKind = params.get('agent') || '';
  var draftText = '';
  var boardLens = params.get('lens') || 'eff';
  var boardInstance = null;
  var padCompact = params.get('pad') !== 'full';

  var VIEWS = [
    { id: 'split', label: '左右台', blurb: '左 Soft Pad+Dock · 右完整数据板', vibe: true },
    { id: 'flow', label: '编排流', blurb: 'Vibe：想法→帮手→开跑', vibe: true },
    { id: 'composer', label: 'Composer', blurb: 'Vibe：提示词台 + 就绪条', vibe: true },
    { id: 'terminal', label: '终端', blurb: 'Vibe：detect 命令输出', vibe: true },
    { id: 'scan', label: '扫描表', blurb: '运维：五列信号对照' },
    { id: 'radar', label: '雷达场', blurb: '空间：本机存在感' },
    { id: 'next', label: '唯一步', blurb: '小白：只告诉你下一步' },
    { id: 'lanes', label: '状态道', blurb: '运维：按灯态分道' }
  ];

  var LIGHT_LABEL = {
    idle: { text: '空闲', cls: 'pill-mute' },
    working: { text: '忙碌', cls: 'pill-busy' },
    needsInput: { text: '等你', cls: 'pill-wait' },
    complete: { text: '刚完成', cls: 'pill-ok' },
    error: { text: '异常', cls: 'pill-bad' },
    unknown: { text: '未知', cls: 'pill-mute' }
  };

  var HOOK_LABEL = {
    ok: { text: '已连接', cls: 'pill-ok' },
    partial: { text: '部分', cls: 'pill-warn' },
    missing: { text: '未连接', cls: 'pill-warn' }
  };

  function say(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 1800);
  }

  function presenceText(row) {
    if (row.presence === 'none') return { text: '未检测到', cls: 'pill-mute' };
    if (row.confidence === 'low') return { text: '弱证据', cls: 'pill-warn' };
    if (row.presence === 'cli') return { text: 'CLI', cls: 'pill-ok' };
    if (row.presence === 'desktop') return { text: '本机已装', cls: 'pill-ok' };
    return { text: row.presence, cls: 'pill-mute' };
  }

  function summarize(snap) {
    var installed = snap.agents.filter(function (a) { return a.presence !== 'none' && a.confidence === 'high'; }).length;
    var running = snap.agents.filter(function (a) { return a.running; }).length;
    var padReady = snap.agents.filter(function (a) { return a.padReady; }).length;
    var hookOk = snap.agents.filter(function (a) { return a.hook === 'ok'; }).length;
    var waiting = snap.agents.filter(function (a) { return a.light === 'needsInput'; }).length;
    var missingHook = snap.agents.filter(function (a) { return a.padReady && a.hook === 'missing'; }).length;
    var headline;
    var detail;
    var nextStep;
    if (installed === 0) {
      headline = '还没检测到可用帮手';
      detail = '本机没有高置信度的 Agent 安装证据。';
      nextStep = { label: '查看安装指引', action: 'install-help:cursor' };
    } else if (waiting > 0) {
      headline = waiting + ' 个帮手在等你';
      detail = '先处理等待确认的那个，其它先放一边。';
      nextStep = { label: '去处理等待中的帮手', action: 'focus-first-waiting' };
    } else if (missingHook > 0) {
      headline = '能打开，但状态灯大多未知';
      detail = 'Soft Pad 可控 ' + padReady + ' 个；Hook 缺口 ' + missingHook + ' 个。';
      nextStep = { label: '连接第一个 Hook', action: 'connect-first-hook' };
    } else if (running > 0) {
      headline = running + ' 个帮手正在运行';
      detail = '本机 ' + installed + ' · Soft Pad ' + padReady + ' · Hook ' + hookOk + '。';
      nextStep = { label: '打开 Soft Pad', action: 'open-softpad' };
    } else {
      headline = installed + ' 个帮手已就绪';
      detail = '都空闲。这里只报告检测结果，没有工作记录。';
      nextStep = { label: '开始帮我做事', action: 'start-help' };
    }
    return {
      installed: installed,
      running: running,
      padReady: padReady,
      hookOk: hookOk,
      waiting: waiting,
      missingHook: missingHook,
      headline: headline,
      detail: detail,
      nextStep: nextStep
    };
  }

  function passesFilter(row) {
    if (filterId === 'all') return true;
    if (filterId === 'running') return !!row.running;
    if (filterId === 'needs') return row.light === 'needsInput' || row.hook === 'missing' || !row.padReady;
    return (row.presence !== 'none' && row.confidence === 'high') || row.padReady || row.light === 'needsInput';
  }

  function visibleAgents(snap) {
    return snap.agents.filter(passesFilter);
  }

  function rowAction(row) {
    if (row.light === 'needsInput') return { label: '去处理', primary: true, action: 'focus-waiting:' + row.kind };
    if (row.presence !== 'none' && !row.padReady) return { label: '启用 Soft Pad', primary: true, action: 'enable-pad:' + row.kind };
    if (row.padReady && row.hook === 'missing') return { label: '连接 Hook', primary: true, action: 'connect-hook:' + row.kind };
    if (row.presence === 'none') return { label: '如何安装', primary: false, action: 'install-help:' + row.kind };
    return { label: row.running ? '打开 Soft Pad' : '打开', primary: false, action: 'open-pad:' + row.kind };
  }

  function pill(info) {
    return '<span class="pill ' + info.cls + '">' + info.text + '</span>';
  }

  function todayBits(snap) {
    var t = snap.onetoneToday;
    return ['语音 ' + t.voice, '按键 ' + t.keys, 'Soft Pad ' + t.softPad]
      .filter(function (x) { return !/ 0$/.test(x); })
      .join(' · ') || '今天还没通过 OneTone 帮过你';
  }

  function brandRow(snap) {
    return (
      '<div class="brand-row">' +
        '<div class="brand"><span class="brand-mark" aria-hidden="true">一</span><div><b>OneTone</b><small>Agent 检测</small></div></div>' +
        '<div class="scan-meta"><span>扫描 · ' + snap.scannedAt + '</span><button type="button" class="scan-btn" data-action="rescan">重新检测</button></div>' +
      '</div>'
    );
  }

  function footerBar(snap, sum) {
    return (
      '<div class="footer-bar">' +
        '<p>可靠信号：安装 · 进程 · Soft Pad · Hook · 状态灯 · OneTone 今日（' + todayBits(snap) + '）。不展示任务摘要。</p>' +
        '<div class="footer-actions">' +
          '<button type="button" class="ghost" data-action="open-softpad">打开 Soft Pad</button>' +
          '<button type="button" class="primary" data-action="' + sum.nextStep.action + '">' + sum.nextStep.label + '</button>' +
        '</div>' +
      '</div>'
    );
  }

  function bindActions(snap) {
    stage.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function () { onAction(btn.getAttribute('data-action'), snap); });
    });
  }

  function mountDock() {
    var root = stage.querySelector('[data-dock]');
    if (!root) return;
    var track = root.querySelector('.split-dock-track');
    var chips = Array.prototype.slice.call(root.querySelectorAll('.split-chip'));
    if (!track || !chips.length) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var maxScale = reduce ? 1.15 : 1.85;
    var range = 72;

    function fitBase() {
      var n = chips.length;
      var avail = Math.max(120, track.clientWidth - 4);
      var base = Math.min(38, Math.max(18, Math.floor(avail / n) - 2));
      root.style.setProperty('--dock-base', base + 'px');
      root.style.setProperty('--dock-icon', Math.max(16, Math.round(base * 0.72)) + 'px');
    }

    function setScale(chip, scale, hot) {
      chip.style.setProperty('--dock-scale', String(scale));
      chip.classList.toggle('is-hot', !!hot);
    }

    function reset() {
      chips.forEach(function (chip) {
        setScale(chip, chip.classList.contains('on') ? 1.22 : 1, false);
      });
    }

    function apply(mx) {
      chips.forEach(function (chip) {
        var r = chip.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var dist = Math.abs(mx - cx);
        var t = Math.max(0, 1 - dist / range);
        var scale = 1 + (maxScale - 1) * t * t;
        if (chip.classList.contains('on') && scale < 1.22) scale = 1.22;
        setScale(chip, Number(scale.toFixed(3)), t > 0.28);
      });
    }

    fitBase();
    reset();
    root.onmousemove = function (e) { apply(e.clientX); };
    root.onmouseleave = reset;
    if (!mountDock._resizeBound) {
      mountDock._resizeBound = true;
      window.addEventListener('resize', function () {
        var d = stage.querySelector('[data-dock]');
        if (d) mountDock();
      });
    }
  }

  function renderScan(snap, sum) {
    return (
      '<section class="detect-home view-scan" aria-label="扫描表视图">' +
        brandRow(snap) +
        '<div class="verdict">' +
          '<div><span class="eyebrow">扫描表 · 非工作记录</span><h1>' + sum.headline + '</h1><p>' + sum.detail + '</p></div>' +
          '<div class="stats">' +
            '<div class="stat"><b>' + sum.installed + '</b><span>本机检测到</span></div>' +
            '<div class="stat"><b>' + sum.running + '</b><span>正在运行</span></div>' +
            '<div class="stat"><b>' + sum.padReady + '</b><span>Soft Pad 可控制</span></div>' +
            '<div class="stat"><b>' + sum.hookOk + '</b><span>Hook 已连接</span></div>' +
          '</div>' +
        '</div>' +
        '<div class="table-wrap" role="table" aria-label="各 Agent 检测结果">' +
          '<div class="table-head" role="row"><span>帮手</span><span>本机</span><span>进程</span><span>Soft Pad</span><span>Hook</span><span>状态灯</span><span></span></div>' +
          snap.agents.map(function (row, index) {
            var act = rowAction(row);
            var hidden = passesFilter(row) ? '' : ' is-hidden';
            return (
              '<div class="agent-row' + hidden + '" style="animation-delay:' + (index * 35) + 'ms" data-kind="' + row.kind + '">' +
                '<div class="agent-name"><span class="agent-orb">' + row.name.slice(0, 1) + '</span><div><b>' + row.name + '</b><small>' + row.connect + '</small></div></div>' +
                pill(presenceText(row)) +
                pill(row.running ? { text: '运行中', cls: 'pill-busy' } : { text: '未运行', cls: 'pill-mute' }) +
                pill(row.padReady ? { text: '可控制', cls: 'pill-ok' } : { text: '未启用', cls: 'pill-warn' }) +
                pill(HOOK_LABEL[row.hook] || HOOK_LABEL.missing) +
                pill(LIGHT_LABEL[row.light] || LIGHT_LABEL.unknown) +
                '<button type="button" class="row-action' + (act.primary ? ' primary' : '') + '" data-action="' + act.action + '">' + act.label + '</button>' +
              '</div>'
            );
          }).join('') +
        '</div>' +
        footerBar(snap, sum) +
      '</section>'
    );
  }

  function radarTone(row) {
    if (row.light === 'needsInput') return 'wait';
    if (row.running || row.light === 'working') return 'busy';
    if (row.presence === 'none') return 'gone';
    if (row.hook === 'missing' || !row.padReady) return 'gap';
    return 'ready';
  }

  function renderRadar(snap, sum) {
    var list = visibleAgents(snap);
    var nodes = list.map(function (row, i) {
      var angle = (i / Math.max(list.length, 1)) * Math.PI * 2 - Math.PI / 2;
      var radius = 38 + (i % 2) * 8;
      var x = 50 + Math.cos(angle) * radius;
      var y = 50 + Math.sin(angle) * radius * 0.78;
      var tone = radarTone(row);
      var act = rowAction(row);
      return (
        '<button type="button" class="radar-node tone-' + tone + '" style="left:' + x + '%;top:' + y + '%" data-action="' + act.action + '" title="' + row.name + '">' +
          '<span class="radar-dot"></span><b>' + row.name + '</b><small>' + (LIGHT_LABEL[row.light] || LIGHT_LABEL.unknown).text +
          (row.running ? ' · 运行' : '') + '</small>' +
        '</button>'
      );
    }).join('');

    return (
      '<section class="detect-home view-radar" aria-label="雷达场视图">' +
        brandRow(snap) +
        '<div class="radar-hero">' +
          '<div class="radar-copy"><span class="eyebrow">雷达场 · 存在感</span><h1>' + sum.headline + '</h1><p>' + sum.detail + '</p>' +
            '<div class="radar-legend">' +
              '<span class="lg tone-wait">等你</span><span class="lg tone-busy">运行</span><span class="lg tone-ready">就绪</span><span class="lg tone-gap">缺口</span><span class="lg tone-gone">未检出</span>' +
            '</div>' +
          '</div>' +
          '<div class="radar-field" aria-label="Agent 雷达">' +
            '<div class="radar-ring r1"></div><div class="radar-ring r2"></div><div class="radar-ring r3"></div>' +
            '<div class="radar-core"><span>一</span><small>OneTone</small></div>' +
            nodes +
          '</div>' +
        '</div>' +
        footerBar(snap, sum) +
      '</section>'
    );
  }

  function renderNext(snap, sum) {
    var focus = snap.agents.find(function (a) { return a.light === 'needsInput'; }) ||
      snap.agents.find(function (a) { return a.padReady && a.hook === 'missing'; }) ||
      snap.agents.find(function (a) { return a.running; }) ||
      snap.agents.find(function (a) { return a.presence !== 'none' && a.confidence === 'high'; }) ||
      snap.agents[0];
    var why = snap.agents.filter(function (a) {
      return a.light === 'needsInput' || a.hook === 'missing' || !a.padReady || a.running;
    }).slice(0, 4);

    return (
      '<section class="detect-home view-next" aria-label="唯一步视图">' +
        brandRow(snap) +
        '<div class="next-stage">' +
          '<span class="eyebrow">唯一步 · 最低认知负担</span>' +
          '<p class="next-kicker">现在</p>' +
          '<h1>' + sum.headline + '</h1>' +
          '<p class="next-detail">' + sum.detail + '</p>' +
          '<button type="button" class="next-cta" data-action="' + sum.nextStep.action + '">' + sum.nextStep.label + '</button>' +
          '<button type="button" class="why-toggle" data-action="toggle-why" aria-expanded="false">看看为什么</button>' +
          '<div class="why-panel" id="whyPanel" hidden>' +
            '<div class="why-stats"><span>' + sum.installed + ' 检测到</span><span>' + sum.running + ' 运行</span><span>' + sum.padReady + ' 可控制</span><span>' + sum.hookOk + ' Hook</span></div>' +
            (why.length ? why.map(function (a) {
              var act = rowAction(a);
              return '<div class="why-row"><div><b>' + a.name + '</b><small>' +
                (a.light === 'needsInput' ? '在等你确认' : a.hook === 'missing' ? 'Hook 未连接' : a.running ? '进程运行中' : 'Soft Pad 未启用') +
                '</small></div><button type="button" data-action="' + act.action + '">' + act.label + '</button></div>';
            }).join('') : '<p class="why-empty">没有需要额外处理的项。</p>') +
            '<p class="why-note">今日 OneTone：' + todayBits(snap) + '</p>' +
          '</div>' +
          (focus ? '<div class="next-focus"><span>焦点帮手</span><b>' + focus.name + '</b><small>' +
            (LIGHT_LABEL[focus.light] || LIGHT_LABEL.unknown).text +
            (focus.running ? ' · 运行中' : '') +
            (focus.padReady ? ' · Soft Pad 可控制' : '') +
          '</small></div>' : '') +
        '</div>' +
      '</section>'
    );
  }

  function laneBucket(row) {
    if (row.light === 'needsInput') return 'waiting';
    if (row.running || row.light === 'working') return 'running';
    if (row.presence !== 'none' && row.padReady && row.hook === 'ok') return 'ready';
    if (row.presence !== 'none') return 'gap';
    return 'gone';
  }

  function pickDefaultAgent(snap) {
    return snap.agents.find(function (a) { return a.light === 'needsInput'; }) ||
      snap.agents.find(function (a) { return a.padReady && a.hook === 'ok'; }) ||
      snap.agents.find(function (a) { return a.padReady; }) ||
      snap.agents.find(function (a) { return a.presence !== 'none' && a.confidence === 'high'; }) ||
      snap.agents[0];
  }

  function ensureSelected(snap) {
    if (!selectedKind || !snap.agents.some(function (a) { return a.kind === selectedKind; })) {
      var d = pickDefaultAgent(snap);
      selectedKind = d ? d.kind : '';
    }
    return snap.agents.find(function (a) { return a.kind === selectedKind; }) || pickDefaultAgent(snap);
  }

  function agentReadyHint(row) {
    if (row.light === 'needsInput') return '在等你确认';
    if (row.running) return '进程运行中';
    if (row.padReady && row.hook === 'ok') return '可交给它';
    if (row.padReady && row.hook === 'missing') return '能控 · Hook 未连';
    if (row.presence !== 'none') return '已装 · 尚未就绪';
    return '未检测到';
  }

  function agentTone(row) {
    if (row.light === 'needsInput') return 'wait';
    if (row.running || row.light === 'working') return 'busy';
    if (row.padReady && row.hook === 'ok') return 'ready';
    if (row.presence !== 'none') return 'gap';
    return 'gone';
  }

  function renderSplit(snap, sum) {
    var selected = ensureSelected(snap);
    var Dto = window.AgentBoardDto;
    var boardAgent = null;
    if (Dto) {
      var dtoPreview = Dto.projectBoardDto(snap, { focusId: selected.kind });
      boardAgent = (dtoPreview.agents || []).find(function (a) { return a.id === Dto.canonicalId(selected.kind); });
    }
    var snapHint = boardAgent
      ? (boardAgent.id === 'cursor'
        ? '效率 ' + (boardAgent.eff != null ? boardAgent.eff : '—')
        : '配额 ' + (boardAgent.remainingPercent != null ? boardAgent.remainingPercent + '%' : '—'))
      : '检测就绪';

    return (
      '<section class="detect-home view-split" aria-label="左右台视图">' +
        '<div class="split-top">' +
          '<div class="brand"><span class="brand-mark" aria-hidden="true">一</span><div><b>OneTone</b><small>Agent 首页 · 检测 + 数据</small></div></div>' +
          '<div class="split-snap">' +
            '<span>今日 · <b id="splitSnapName">' + selected.name + '</b></span>' +
            '<em id="splitSnapHint">' + snapHint + '</em>' +
            '<button type="button" class="split-deep" data-action="open-data-deep">费用账本 ↓</button>' +
          '</div>' +
        '</div>' +
        '<div class="split-body">' +
          '<aside class="split-left' + (padCompact ? ' is-compact' : '') + '">' +
            '<div class="split-pad-panel">' +
              '<div class="split-rail-head">' +
                '<span>当前帮手</span>' +
                '<b id="splitFocusName">' + selected.name + '</b>' +
                '<small id="splitFocusHint">' + agentReadyHint(selected) + '</small>' +
              '</div>' +
              '<div class="split-dock" data-dock aria-label="Agent Dock">' +
                '<div class="split-dock-track" role="tablist">' +
                  snap.agents.map(function (row) {
                    return (
                      '<button type="button" role="tab" aria-selected="' + (row.kind === selected.kind) + '" ' +
                        'class="split-chip tone-' + agentTone(row) + (row.kind === selected.kind ? ' on' : '') +
                        (row.presence === 'none' ? ' is-absent' : '') + '" ' +
                        'data-action="select-agent:' + row.kind + '" title="' + row.name + ' · ' + agentReadyHint(row) + '">' +
                        '<span class="split-chip-icon">' + row.name.slice(0, 1) + '</span>' +
                        '<span class="split-chip-name">' + row.name + '</span>' +
                        '<i class="split-chip-dot" aria-hidden="true"></i>' +
                      '</button>'
                    );
                  }).join('') +
                '</div>' +
              '</div>' +
              '<div class="split-pad-cap">Soft Pad · ' + selected.name +
                ' <button type="button" class="split-pad-toggle" data-action="toggle-pad">' + (padCompact ? '展开' : '紧凑') + '</button></div>' +
              '<div class="split-pad-grid" aria-hidden="true">' +
                Array(20).fill(0).map(function (_, i) {
                  return '<span class="' + (i === 9 ? 'plus' : '') + '"></span>';
                }).join('') +
              '</div>' +
              '<p class="split-pad-meta">透明度 100% · ' + (selected.padReady ? '可控制' : '未启用') +
                ' · Hook ' + ((HOOK_LABEL[selected.hook] || HOOK_LABEL.missing).text) + '</p>' +
              '<div class="split-detect-mini">' +
                '<span>' + presenceText(selected).text + '</span>' +
                '<span>' + (selected.running ? '运行中' : '未运行') + '</span>' +
                '<span>' + (LIGHT_LABEL[selected.light] || LIGHT_LABEL.unknown).text + '</span>' +
              '</div>' +
              '<button type="button" class="split-pad-cta" data-action="open-softpad">打开 Soft Pad 配置</button>' +
              '<button type="button" class="split-pad-cta secondary" data-action="' + sum.nextStep.action + '">' + sum.nextStep.label + '</button>' +
            '</div>' +
          '</aside>' +
          '<main class="split-right">' +
            '<div id="dataBoardHost" class="data-board-host" aria-label="Agent 数据板"></div>' +
          '</main>' +
        '</div>' +
      '</section>'
    );
  }

  function mountDataBoard(snap) {
    if (boardInstance && boardInstance.destroy) boardInstance.destroy();
    boardInstance = null;
    var host = document.getElementById('dataBoardHost');
    var Dto = window.AgentBoardDto;
    var Board = window.AgentDataBoard;
    if (!host || !Dto || !Board) return;
    var dto = Dto.projectBoardDto(snap, { focusId: selectedKind });
    boardInstance = Board.mount(host, dto, {
      focusId: selectedKind || dto.focusId,
      lens: boardLens === 'overview' || boardLens === 'quota' ? 'eff' : boardLens,
      onFocus: function (id) {
        selectedKind = id;
        syncUrl();
        syncDockSelection(id);
        updateSplitChrome(snap, id);
      },
      onAction: function (cmd) {
        if (cmd === 'enable-cursor') say('已模拟开启 Cursor 本机活动（原型）');
        else if (cmd === 'export') say('即将支持 · 导出今日 JSON');
        else if (cmd === 'wall') say('即将支持 · 副屏');
        else if (String(cmd).indexOf('connect:') === 0) say('打开连接向导 · ' + String(cmd).slice(8));
        else say(cmd);
      }
    });
  }

  function syncDockSelection(kind) {
    var id = window.AgentBoardDto ? window.AgentBoardDto.canonicalId(kind) : kind;
    stage.querySelectorAll('.split-chip').forEach(function (chip) {
      var action = chip.getAttribute('data-action') || '';
      var k = action.split(':')[1] || '';
      var on = (window.AgentBoardDto ? window.AgentBoardDto.canonicalId(k) : k) === id;
      chip.classList.toggle('on', on);
      chip.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function updateSplitChrome(snap, kind) {
    var row = snap.agents.find(function (a) {
      var id = window.AgentBoardDto ? window.AgentBoardDto.canonicalId(a.kind) : a.kind;
      return id === (window.AgentBoardDto ? window.AgentBoardDto.canonicalId(kind) : kind);
    }) || ensureSelected(snap);
    var nameEl = document.getElementById('splitFocusName');
    var hintEl = document.getElementById('splitFocusHint');
    var snapName = document.getElementById('splitSnapName');
    var snapHint = document.getElementById('splitSnapHint');
    if (nameEl) nameEl.textContent = row.name;
    if (hintEl) hintEl.textContent = agentReadyHint(row);
    if (snapName) snapName.textContent = row.name;
    if (snapHint && window.AgentBoardDto) {
      var dto = window.AgentBoardDto.projectBoardDto(snap, { focusId: row.kind });
      var a = dto.agents.find(function (x) { return x.id === window.AgentBoardDto.canonicalId(row.kind); });
      snapHint.textContent = a && a.id === 'cursor'
        ? '效率 ' + (a.eff != null ? a.eff : '—')
        : '配额 ' + (a && a.remainingPercent != null ? a.remainingPercent + '%' : '—');
    }
  }

  function renderFlow(snap, sum) {
    var selected = ensureSelected(snap);
    var ready = snap.agents.filter(function (a) {
      return a.presence !== 'none' && a.confidence === 'high';
    });
    var canRun = selected && selected.padReady;
    return (
      '<section class="detect-home view-flow" aria-label="编排流视图">' +
        '<header class="flow-top">' +
          '<div><span class="wordmark">OneTone / Vibe Detect</span><h1>把一个想法交给电脑</h1></div>' +
          '<div class="flow-pill">' + sum.installed + ' 检测到 · ' + sum.padReady + ' 可控制 · ' + snap.scannedAt + '</div>' +
        '</header>' +
        '<div class="flow-board">' +
          '<div class="flow-step active">' +
            '<span>1</span><label>你想做什么</label>' +
            '<textarea id="flowDraft" aria-label="任务描述" placeholder="说一句，或写下你的想法">' + (draftText || '') + '</textarea>' +
            '<small>检测首页不存工作记录；这里只是发起前的草稿。</small>' +
          '</div>' +
          '<div class="flow-line" aria-hidden="true"></div>' +
          '<div class="flow-step">' +
            '<span>2</span><label>交给谁</label>' +
            '<div class="flow-agents">' +
              (ready.length ? ready.map(function (row) {
                var on = row.kind === selected.kind ? ' on' : '';
                return (
                  '<button type="button" class="flow-agent tone-' + agentTone(row) + on + '" data-action="select-agent:' + row.kind + '">' +
                    '<i></i><b>' + row.name + '</b><small>' + agentReadyHint(row) + '</small>' +
                  '</button>'
                );
              }).join('') : '<p class="flow-empty">还没检测到可用帮手</p>') +
            '</div>' +
          '</div>' +
          '<div class="flow-line" aria-hidden="true"></div>' +
          '<div class="flow-step">' +
            '<span>3</span><label>怎么开始</label>' +
            '<div class="flow-start">' +
              '<p>当前帮手 <b>' + (selected ? selected.name : '—') + '</b></p>' +
              '<p class="muted">' + (selected ? agentReadyHint(selected) : '先选一个检测到的帮手') +
                (selected && selected.padReady ? ' · Soft Pad 可控制' : '') +
                (selected && selected.hook === 'ok' ? ' · Hook 已连' : selected && selected.hook === 'missing' ? ' · Hook 未连' : '') +
              '</p>' +
              '<button type="button" class="flow-run" data-action="' + (canRun ? 'start-help' : (selected && selected.hook === 'missing' ? 'connect-hook:' + selected.kind : 'rescan')) + '">' +
                (canRun ? '开始帮我做事' : selected && selected.hook === 'missing' ? '先连接 Hook' : '重新检测') +
              '</button>' +
              '<button type="button" class="flow-soft" data-action="open-softpad">打开 Soft Pad</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<footer class="flow-foot"><span>' + sum.headline + '</span><span>今日 OneTone · ' + todayBits(snap) + '</span></footer>' +
      '</section>'
    );
  }

  function renderComposer(snap, sum) {
    var selected = ensureSelected(snap);
    var strip = snap.agents.filter(function (a) {
      return (a.presence !== 'none' && a.confidence === 'high') || a.padReady || a.light === 'needsInput';
    });
    return (
      '<section class="detect-home view-composer" aria-label="Composer 视图">' +
        '<div class="composer-shell">' +
          '<div class="composer-chrome"><span class="composer-brand">OneTone</span><span class="composer-tab on">Composer</span><span class="composer-tab">Detect</span><span class="composer-spacer"></span><button type="button" data-action="rescan">↻ 检测</button></div>' +
          '<div class="composer-body">' +
            '<div class="composer-prompt">' +
              '<label for="composerDraft">发给 ' + (selected ? selected.name : '帮手') + '</label>' +
              '<textarea id="composerDraft" placeholder="描述你想改的代码或要跑的事…">' + (draftText || '') + '</textarea>' +
              '<div class="composer-actions">' +
                '<button type="button" class="composer-send" data-action="' + (selected && selected.padReady ? 'start-help' : 'open-softpad') + '">' +
                  (selected && selected.padReady ? '⌘↵ 发送到 ' + selected.name : '先打开 Soft Pad') +
                '</button>' +
                '<span>' + sum.headline + '</span>' +
              '</div>' +
            '</div>' +
            '<aside class="composer-side">' +
              '<h2>谁能接</h2>' +
              '<p class="composer-side-lead">只显示本机检测信号，不是会话列表。</p>' +
              '<div class="composer-strip">' +
                strip.map(function (row) {
                  return (
                    '<button type="button" class="composer-agent' + (row.kind === selected.kind ? ' on' : '') + ' tone-' + agentTone(row) + '" data-action="select-agent:' + row.kind + '">' +
                      '<span class="composer-dot"></span>' +
                      '<span><b>' + row.name + '</b><small>' + agentReadyHint(row) + '</small></span>' +
                      '<em>' + (row.running ? 'RUN' : row.padReady ? 'PAD' : '—') + '</em>' +
                    '</button>'
                  );
                }).join('') +
              '</div>' +
              '<div class="composer-meta">' +
                '<div><span>检测到</span><b>' + sum.installed + '</b></div>' +
                '<div><span>可控制</span><b>' + sum.padReady + '</b></div>' +
                '<div><span>Hook</span><b>' + sum.hookOk + '</b></div>' +
                '<div><span>等你</span><b>' + sum.waiting + '</b></div>' +
              '</div>' +
            '</aside>' +
          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function renderTerminal(snap, sum) {
    var lines = snap.agents.map(function (row) {
      var flags = [
        row.presence !== 'none' && row.confidence === 'high' ? 'present' : 'absent',
        row.running ? 'running' : 'stopped',
        row.padReady ? 'pad=ok' : 'pad=off',
        'hook=' + row.hook,
        'light=' + row.light
      ].join(' ');
      var cls = agentTone(row);
      return '<div class="term-line tone-' + cls + '"><span class="term-kind">' + row.kind.padEnd(10, ' ') + '</span><span class="term-flags">' + flags + '</span></div>';
    }).join('');
    return (
      '<section class="detect-home view-terminal" aria-label="终端视图">' +
        '<div class="term-window">' +
          '<header class="term-bar"><span></span><span></span><span></span><b>onetone detect — agents</b></header>' +
          '<div class="term-body">' +
            '<div class="term-cmd"><span class="prompt">›</span> onetone agents detect --honest</div>' +
            '<div class="term-out">' +
              '<div class="term-line dim"># reliable signals only · no work history</div>' +
              '<div class="term-line dim"># scanned ' + snap.scannedAt + ' · today ' + todayBits(snap) + '</div>' +
              '<div class="term-blank"></div>' +
              lines +
              '<div class="term-blank"></div>' +
              '<div class="term-line ok">summary  installed=' + sum.installed +
                ' running=' + sum.running +
                ' pad=' + sum.padReady +
                ' hook=' + sum.hookOk +
                ' waiting=' + sum.waiting + '</div>' +
              '<div class="term-line ok">verdict   ' + sum.headline + '</div>' +
              '<div class="term-blank"></div>' +
              '<div class="term-cmd"><span class="prompt">›</span> <span class="cursor">█</span></div>' +
            '</div>' +
            '<div class="term-actions">' +
              '<button type="button" data-action="rescan">再跑一遍</button>' +
              '<button type="button" data-action="' + sum.nextStep.action + '">' + sum.nextStep.label + '</button>' +
              '<button type="button" data-action="open-softpad">softpad open</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</section>'
    );
  }

  function renderLanes(snap, sum) {
    var lanes = [
      { id: 'waiting', title: '等你', hint: 'needsInput' },
      { id: 'running', title: '运行中', hint: '进程 / working' },
      { id: 'ready', title: '就绪可控', hint: '本机 + Soft Pad + Hook' },
      { id: 'gap', title: '有缺口', hint: '装了但 Hook/Pad 不全' },
      { id: 'gone', title: '未检测到', hint: '无高置信证据' }
    ];
    var buckets = {};
    lanes.forEach(function (l) { buckets[l.id] = []; });
    visibleAgents(snap).forEach(function (row) { buckets[laneBucket(row)].push(row); });

    return (
      '<section class="detect-home view-lanes" aria-label="状态道视图">' +
        brandRow(snap) +
        '<div class="lanes-head"><div><span class="eyebrow">状态道 · 按灯分道</span><h1>' + sum.headline + '</h1><p>' + sum.detail + '</p></div>' +
          '<div class="lanes-count">' + sum.waiting + ' 等你 · ' + sum.running + ' 运行 · ' + sum.padReady + ' 可控制</div></div>' +
        '<div class="lanes-board">' +
          lanes.map(function (lane) {
            var rows = buckets[lane.id] || [];
            return (
              '<section class="lane lane-' + lane.id + '">' +
                '<header><b>' + lane.title + '</b><span>' + rows.length + '</span><small>' + lane.hint + '</small></header>' +
                '<div class="lane-body">' +
                  (rows.length ? rows.map(function (row) {
                    var act = rowAction(row);
                    return (
                      '<article class="lane-card">' +
                        '<div class="agent-name"><span class="agent-orb">' + row.name.slice(0, 1) + '</span><div><b>' + row.name + '</b><small>' +
                          (row.running ? '运行 · ' : '') + (HOOK_LABEL[row.hook] || HOOK_LABEL.missing).text +
                        '</small></div></div>' +
                        '<button type="button" class="row-action' + (act.primary ? ' primary' : '') + '" data-action="' + act.action + '">' + act.label + '</button>' +
                      '</article>'
                    );
                  }).join('') : '<p class="lane-empty">空</p>') +
                '</div>' +
              '</section>'
            );
          }).join('') +
        '</div>' +
        footerBar(snap, sum) +
      '</section>'
    );
  }

  function render(snap) {
    var sum = summarize(snap);
    var html =
      viewId === 'split' ? renderSplit(snap, sum) :
      viewId === 'flow' ? renderFlow(snap, sum) :
      viewId === 'composer' ? renderComposer(snap, sum) :
      viewId === 'terminal' ? renderTerminal(snap, sum) :
      viewId === 'radar' ? renderRadar(snap, sum) :
      viewId === 'next' ? renderNext(snap, sum) :
      viewId === 'lanes' ? renderLanes(snap, sum) :
      renderScan(snap, sum);
    stage.innerHTML = html;
    bindActions(snap);
    mountDock();
    if (viewId === 'split') mountDataBoard(snap);
    var draft = stage.querySelector('#flowDraft, #composerDraft');
    if (draft) {
      draft.value = draftText || '';
      draft.addEventListener('input', function () { draftText = draft.value; });
    }
    if (filterSection) {
      filterSection.hidden = viewId === 'next' || viewId === 'flow' || viewId === 'composer' || viewId === 'terminal' || viewId === 'split';
    }
    if (frameLabel) {
      var v = VIEWS.find(function (x) { return x.id === viewId; });
      frameLabel.textContent = 'Agent 检测 · ' + (v ? v.label : viewId) + ' · 1080 × 720';
    }
  }

  function onAction(action, snap) {
    if (action === 'rescan') {
      say('已重新扫描本机 Agent');
      render(fixtures.getSnapshot(sceneId));
      return;
    }
    if (action === 'toggle-why') {
      var panel = document.getElementById('whyPanel');
      var btn = stage.querySelector('[data-action="toggle-why"]');
      if (panel) {
        var open = panel.hasAttribute('hidden');
        if (open) panel.removeAttribute('hidden');
        else panel.setAttribute('hidden', '');
        if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      }
      return;
    }
    if (action === 'open-softpad') { say('打开 Soft Pad（原型）'); return; }
    if (action === 'open-data-deep') {
      if (boardInstance) {
        boardInstance.setLens('cost');
        boardInstance.setLayout('ledger');
        boardLens = 'cost';
        syncUrl();
        say('已打开费用账本');
      } else {
        say('数据板未就绪');
      }
      return;
    }
    if (action === 'toggle-pad') {
      padCompact = !padCompact;
      syncUrl();
      render(fixtures.getSnapshot(sceneId));
      return;
    }
    if (action === 'start-help') { say('进入发起流程（原型）'); return; }
    if (action === 'focus-first-waiting') {
      var wait = snap.agents.find(function (a) { return a.light === 'needsInput'; });
      say(wait ? ('聚焦 ' + wait.name + ' · 等待确认') : '没有等待中的帮手');
      return;
    }
    if (action === 'connect-first-hook') {
      var gap = snap.agents.find(function (a) { return a.padReady && a.hook === 'missing'; });
      say(gap ? ('打开 ' + gap.name + ' Hook 连接') : '没有 Hook 缺口');
      return;
    }
    var parts = String(action || '').split(':');
    var kind = parts[1];
    var agent = snap.agents.find(function (a) { return a.kind === kind; });
    var name = agent ? agent.name : kind;
    if (parts[0] === 'select-agent') {
      selectedKind = kind;
      syncUrl();
      syncDockSelection(kind);
      updateSplitChrome(snap, kind);
      if (boardInstance) boardInstance.setFocus(kind);
      else render(fixtures.getSnapshot(sceneId));
      say('已选择 ' + name);
      return;
    }
    if (parts[0] === 'lens') {
      boardLens = kind || 'eff';
      syncUrl();
      if (boardInstance) boardInstance.setLens(boardLens);
      else render(fixtures.getSnapshot(sceneId));
      return;
    }
    if (parts[0] === 'focus-waiting') say('聚焦 ' + name + ' · 去处理等待');
    else if (parts[0] === 'enable-pad') say('为 ' + name + ' 启用 Soft Pad');
    else if (parts[0] === 'connect-hook') say('打开 ' + name + ' Hook 连接');
    else if (parts[0] === 'install-help') say(name + ' 安装指引（原型）');
    else if (parts[0] === 'open-pad') say('打开 Soft Pad · ' + name);
    else say(action);
  }

  function syncUrl() {
    var u = new URL(location.href);
    u.searchParams.set('scene', sceneId);
    u.searchParams.set('view', viewId);
    u.searchParams.set('filter', filterId);
    if (selectedKind) u.searchParams.set('agent', selectedKind);
    u.searchParams.set('lens', boardLens);
    u.searchParams.set('pad', padCompact ? 'compact' : 'full');
    history.replaceState(null, '', u);
  }

  function setScene(id) {
    sceneId = fixtures.sceneIds.indexOf(id) >= 0 ? id : 'mixed';
    syncUrl();
    sceneBar.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.scene === sceneId ? 'true' : 'false');
    });
    render(fixtures.getSnapshot(sceneId));
  }

  function setView(id) {
    viewId = VIEWS.some(function (v) { return v.id === id; }) ? id : 'scan';
    syncUrl();
    viewBar.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.view === viewId ? 'true' : 'false');
    });
    render(fixtures.getSnapshot(sceneId));
  }

  function setFilter(id) {
    filterId = id;
    syncUrl();
    filterBar.querySelectorAll('button').forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.filter === filterId ? 'true' : 'false');
    });
    render(fixtures.getSnapshot(sceneId));
  }

  function mountChrome() {
    sceneBar.innerHTML = fixtures.sceneIds.map(function (id) {
      return '<button type="button" data-scene="' + id + '" aria-pressed="' + (id === sceneId) + '">' + fixtures.labels[id] + '</button>';
    }).join('');
    viewBar.innerHTML = VIEWS.map(function (v) {
      return '<button type="button" data-view="' + v.id + '" aria-pressed="' + (v.id === viewId) + '" title="' + v.blurb + '"' +
        (v.vibe ? ' data-vibe="1"' : '') + '>' + v.label + '</button>';
    }).join('');
    filterBar.innerHTML = [
      ['actionable', '有信号的'],
      ['needs', '需要处理'],
      ['running', '正在运行'],
      ['all', '全部']
    ].map(function (pair) {
      return '<button type="button" data-filter="' + pair[0] + '" aria-pressed="' + (pair[0] === filterId) + '">' + pair[1] + '</button>';
    }).join('');
    sceneBar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-scene]');
      if (b) setScene(b.dataset.scene);
    });
    viewBar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-view]');
      if (b) setView(b.dataset.view);
    });
    filterBar.addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (b) setFilter(b.dataset.filter);
    });
  }

  if (params.get('canvas') === '1') document.body.classList.add('canvas-only');
  mountChrome();
  setView(viewId);
  setScene(sceneId);
})();
