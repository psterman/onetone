/**
 * Phase1 / Phase2 RC acceptance radar + guided verify desk.
 * Enable: localStorage onetone.acceptanceFloat=1  or  Ctrl+Shift+A
 * Marks: localStorage onetone.acceptanceMarks (operator only — ≠ release docs)
 */
(function (global) {
  'use strict';

  var FLAG = 'onetone.acceptanceFloat';
  var MARKS_KEY = 'onetone.acceptanceMarks';
  var PCX_FLAG = 'onetone.projectContext.enabled';
  var ROOT_ID = 'onetoneAcceptanceFloat';
  var AUTO_CMD = 'npm run verify:phase2-rc';

  var LABEL = {
    passed: '通过',
    pending: '待验',
    skipped: '跳过',
    unverified: '未验证',
    failed: '失败'
  };

  /** Manual queue — cannot be one-click (native dialog / real UI). */
  var GUIDE = [
    {
      id: 'a1_flag',
      title: '打开工程材料入口',
      how: '点下方「启用入口」→ 刷新后应出现「添加工程材料」。未启用时必须隐藏。'
    },
    {
      id: 'a3_dialog',
      title: '原生目录选择器',
      how: '主窗口打开材料抽屉 →「选择工程目录」→ 系统文件夹对话框选一个小仓库。禁止手输路径开权。'
    },
    {
      id: 'a5_read',
      title: '读片段 / 名片',
      how: '点「添加项目名片」或「读取选定文件」→ 抽屉内填路径（勿用系统 prompt）→ 出现候选预览。'
    },
    {
      id: 'a7_adopt',
      title: 'Adopt 与预算',
      how: '点候选下「加入材料」→ 状态栏显示已加入；材料进入交接区（未加入前不进发送正文）。'
    },
    {
      id: 'a9_send',
      title: '无 key 直发',
      how: '首页交接区对已加入材料直接发送（不要点整理）。无模型密钥也应能发。'
    },
    {
      id: 'a8_stale',
      title: 'Stale 三态',
      how: '先读文件片段并加入（名片无效）→ 改磁盘文件 →「校验新鲜度」→ 刷新/继续旧版/移除任选一。'
    },
    {
      id: 'b1_git',
      title: 'Git staged ≠ unstaged',
      how: '「查看变更」→ 分别点 unstaged / staged → 从列表点文件加载 Diff。无变更时先改一个已跟踪文件。'
    },
    {
      id: 'b_degrade',
      title: '非 Git / 降级',
      how: '选非 Git 文件夹后点「查看变更」→ 应出现「改用读取选定文件」。'
    },
    {
      id: 'a10_shot',
      title: '截图留证',
      how: 'Win+Shift+S 截：材料抽屉、Diff 列表、新鲜度过期面板各一张即可。'
    }
  ];

  var DATA = {
    stamp: 'RC 闭环 2026-10-28 · C skipped',
    layers:
      'implementation: passed\n' +
      'automated verification: passed\n' +
      'Phase2.0 preflight: passed\n' +
      'local desktop: passed\n' +
      'remote organize: skipped\n' +
      'release acceptance: passed',
    phase1Banner:
      'Phase1 status: accepted\nAssist: implemented\ntask_organize: local verified · real skipped',
    phase1: [
      { status: 'passed', title: 'Assist Runtime', note: 'cmd_assist_run / cancel / ready' },
      { status: 'passed', title: '出站快照 + citeMode', note: 'buildAssistInputSnapshot' },
      { status: 'passed', title: '草稿守卫 / 直接发送', note: 'raw / organized / activeDraft' },
      { status: 'passed', title: '本地假传输整理', note: 'task_organize · local/fake verified' },
      { status: 'skipped', title: '真实提供商整理', note: 'real provider · skipped（无授权）' },
      { status: 'passed', title: '真机引导 / 截图', note: '引导九步全绿 2026-10-28' },
      { status: 'passed', title: '模拟 UI checklist', note: '自动化层' }
    ],
    phase2: [
      { status: 'passed', title: '实现 + 自动化', note: 'verify:phase2-rc 全绿' },
      { status: 'passed', title: 'Phase2.0 预检门', note: '七项通过 · RC 口径' },
      { status: 'passed', title: 'Assist IPC args 包装', note: 'test-home-assist-ipc-contract' },
      { status: 'passed', title: '主窗口 capability', note: 'project-context-main only' },
      { status: 'passed', title: '路径安全 / junction', note: 'lib tests · Windows' },
      { status: 'passed', title: 'exe 重建 (debug)', note: '含 dialog/serde 修复' },
      { status: 'passed', title: '桌面本地闭环 A', note: '引导九步真机点通' },
      { status: 'passed', title: 'Git 闭环 B', note: 'unstaged + 非 Git 降级' },
      { status: 'skipped', title: '真实远程整理 C', note: '无费用授权 · skipped' },
      { status: 'passed', title: 'Release acceptance', note: 'A+B 过 · C skipped · 非 NSIS' }
    ]
  };

  function flagOn() {
    try {
      return !!(global.localStorage && global.localStorage.getItem(FLAG) === '1');
    } catch (_) {
      return false;
    }
  }

  function setFlag(on) {
    try {
      if (!global.localStorage) return;
      if (on) global.localStorage.setItem(FLAG, '1');
      else global.localStorage.removeItem(FLAG);
    } catch (_) {}
  }

  function loadMarks() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(MARKS_KEY);
      var o = raw ? JSON.parse(raw) : {};
      return o && typeof o === 'object' ? o : {};
    } catch (_) {
      return {};
    }
  }

  function saveMarks(marks) {
    try {
      if (global.localStorage) global.localStorage.setItem(MARKS_KEY, JSON.stringify(marks || {}));
    } catch (_) {}
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function count(items) {
    var pass = 0;
    var pend = 0;
    for (var i = 0; i < items.length; i++) {
      var st = items[i].status;
      if (st === 'passed') pass++;
      else if (st === 'pending' || st === 'unverified') pend++;
    }
    return { pass: pass, pend: pend };
  }

  function listHtml(items) {
    var html = '<ul class="acc-list">';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      html +=
        '<li class="acc-item">' +
        '<span class="acc-dot" data-s="' +
        esc(it.status) +
        '"></span>' +
        '<div class="acc-item-main"><b>' +
        esc(it.title) +
        '</b><small>' +
        esc(it.note) +
        '</small></div>' +
        '<span class="acc-pill" data-s="' +
        esc(it.status) +
        '">' +
        esc(LABEL[it.status] || it.status) +
        '</span></li>';
    }
    return html + '</ul>';
  }

  function guideProgress(marks) {
    var done = 0;
    for (var i = 0; i < GUIDE.length; i++) {
      var st = marks[GUIDE[i].id];
      if (st === 'passed' || st === 'skipped') done++;
    }
    return { done: done, total: GUIDE.length };
  }

  function firstOpenStep(marks) {
    for (var i = 0; i < GUIDE.length; i++) {
      if (!marks[GUIDE[i].id]) return { index: i, step: GUIDE[i] };
    }
    return null;
  }

  function guideHtml(marks, stepIndex) {
    var gp = guideProgress(marks);
    var idx = typeof stepIndex === 'number' ? stepIndex : 0;
    if (idx < 0) idx = 0;
    if (idx >= GUIDE.length) idx = GUIDE.length - 1;
    var step = GUIDE[idx];
    var st = marks[step.id] || 'pending';
    var open = firstOpenStep(marks);
    var allDone = !open;

    var trail = '<ol class="acc-trail">';
    for (var i = 0; i < GUIDE.length; i++) {
      var m = marks[GUIDE[i].id] || 'pending';
      trail +=
        '<li class="acc-trail-item' +
        (i === idx ? ' is-current' : '') +
        '" data-acc="goto" data-idx="' +
        i +
        '"><span class="acc-dot" data-s="' +
        esc(m) +
        '"></span>' +
        esc(GUIDE[i].title) +
        '</li>';
    }
    trail += '</ol>';

    return (
      '<div class="acc-guide" data-guide-idx="' +
      idx +
      '">' +
      '<div class="acc-layer">一键只能跑自动化。本台逐步勾选手动项（存本机，≠ 文档 release）。</div>' +
      '<div class="acc-auto-row">' +
      '<button type="button" class="acc-cta" data-acc="copy-auto">复制：' +
      esc(AUTO_CMD) +
      '</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="enable-pcx">启用入口</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="open-pcx">打开材料抽屉</button>' +
      '</div>' +
      '<p class="acc-guide-prog">手动进度 <strong>' +
      gp.done +
      '/' +
      gp.total +
      '</strong>' +
      (allDone ? ' · 可回填 A/B 文档' : '') +
      '</p>' +
      '<div class="acc-guide-card">' +
      '<em>步骤 ' +
      (idx + 1) +
      '/' +
      GUIDE.length +
      '</em>' +
      '<b>' +
      esc(step.title) +
      '</b>' +
      '<p>' +
      esc(step.how) +
      '</p>' +
      '<span class="acc-pill" data-s="' +
      esc(st) +
      '">' +
      esc(LABEL[st] || st) +
      '</span>' +
      '<div class="acc-guide-actions">' +
      '<button type="button" class="acc-cta" data-acc="mark" data-mark="passed" data-id="' +
      esc(step.id) +
      '">本步通过</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="mark" data-mark="failed" data-id="' +
      esc(step.id) +
      '">失败</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="mark" data-mark="skipped" data-id="' +
      esc(step.id) +
      '">跳过</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="prev">上一步</button>' +
      '<button type="button" class="acc-cta is-ghost" data-acc="next">下一步</button>' +
      '</div></div>' +
      trail +
      '<button type="button" class="acc-cta is-ghost acc-reset" data-acc="reset-marks">清空手动勾选</button>' +
      '</div>'
    );
  }

  function paintGuide(el, stepIndex) {
    var panel = el.querySelector('[data-panel="guide"]');
    if (!panel) return;
    var marks = loadMarks();
    var idx = stepIndex;
    if (idx == null) {
      var open = firstOpenStep(marks);
      idx = open ? open.index : 0;
    }
    panel.innerHTML = guideHtml(marks, idx);
  }

  function ensure() {
    var el = document.getElementById(ROOT_ID);
    if (el) return el;

    var all = DATA.phase1.concat(DATA.phase2);
    var c = count(all);
    var pct = all.length ? c.pass / all.length : 0;

    el = document.createElement('aside');
    el.id = ROOT_ID;
    el.className = 'acc-float acc-float--desk';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'OneTone 验收台');
    el.style.setProperty('--pct', String(pct));
    el.innerHTML =
      '<header class="acc-head" data-acc="drag">' +
      '<div class="acc-badge" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><circle cx="12" cy="12" r="4"/>' +
      '</svg></div>' +
      '<div class="acc-titles"><strong>验收台 · Phase2 RC</strong>' +
      '<span>' +
      esc(DATA.stamp) +
      '</span></div>' +
      '<div class="acc-actions">' +
      '<button type="button" class="acc-icon-btn" data-acc="collapse" title="折叠" aria-expanded="true">−</button>' +
      '<button type="button" class="acc-icon-btn" data-acc="close" title="关闭">×</button>' +
      '</div></header>' +
      '<div class="acc-body" data-acc="body">' +
      '<div class="acc-summary">' +
      '<div class="acc-stat" data-tone="pass"><em>Auto 层</em><strong>' +
      c.pass +
      '</strong></div>' +
      '<div class="acc-stat" data-tone="pend"><em>仍待验</em><strong>' +
      c.pend +
      '</strong></div></div>' +
      '<div class="acc-tabs" role="tablist">' +
      '<button type="button" class="acc-tab" data-acc="tab" data-tab="guide" aria-selected="true">引导</button>' +
      '<button type="button" class="acc-tab" data-acc="tab" data-tab="1" aria-selected="false">Phase1</button>' +
      '<button type="button" class="acc-tab" data-acc="tab" data-tab="2" aria-selected="false">Phase2</button>' +
      '</div>' +
      '<div data-acc="panel" data-panel="guide"></div>' +
      '<div data-acc="panel" data-panel="1" hidden>' +
      '<div class="acc-layer">' +
      esc(DATA.phase1Banner) +
      '</div>' +
      listHtml(DATA.phase1) +
      '</div>' +
      '<div data-acc="panel" data-panel="2" hidden>' +
      '<div class="acc-layer">' +
      esc(DATA.layers) +
      '</div>' +
      listHtml(DATA.phase2) +
      '</div></div>' +
      '<footer class="acc-foot">自动：终端 <code>' +
      esc(AUTO_CMD) +
      '</code> · 手动：引导台勾选 · <code>Ctrl+Shift+A</code></footer>';

    document.body.appendChild(el);
    paintGuide(el);
    bind(el);
    return el;
  }

  function currentGuideIdx(el) {
    var g = el.querySelector('.acc-guide');
    if (!g) return 0;
    return parseInt(g.getAttribute('data-guide-idx'), 10) || 0;
  }

  function toast(msg) {
    if (typeof global.__vp_toast__ === 'function') global.__vp_toast__(msg);
    else if (global.console) global.console.info('[acceptance]', msg);
  }

  function bind(el) {
    el.addEventListener('click', function (ev) {
      var t = ev.target && ev.target.closest && ev.target.closest('[data-acc]');
      if (!t) return;
      var act = t.getAttribute('data-acc');
      if (act === 'close') {
        hide();
        setFlag(false);
        return;
      }
      if (act === 'collapse') {
        var on = el.classList.toggle('is-collapsed');
        t.textContent = on ? '+' : '−';
        t.setAttribute('aria-expanded', on ? 'false' : 'true');
        return;
      }
      if (act === 'tab') {
        var which = t.getAttribute('data-tab');
        var tabs = el.querySelectorAll('[data-acc="tab"]');
        var panels = el.querySelectorAll('[data-acc="panel"]');
        for (var i = 0; i < tabs.length; i++) {
          tabs[i].setAttribute(
            'aria-selected',
            tabs[i].getAttribute('data-tab') === which ? 'true' : 'false'
          );
        }
        for (var j = 0; j < panels.length; j++) {
          panels[j].hidden = panels[j].getAttribute('data-panel') !== which;
        }
        if (which === 'guide') paintGuide(el, currentGuideIdx(el));
        return;
      }
      if (act === 'copy-auto') {
        var done = function () {
          toast('已复制 ' + AUTO_CMD + ' — 在仓库根目录终端执行');
        };
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(AUTO_CMD).then(done).catch(done);
        } else {
          done();
        }
        return;
      }
      if (act === 'enable-pcx') {
        try {
          global.localStorage.setItem(PCX_FLAG, '1');
          toast('已启用 onetone.projectContext.enabled — 请刷新页面');
        } catch (_) {
          toast('无法写 localStorage');
        }
        return;
      }
      if (act === 'open-pcx') {
        var PC = global.OneToneHomeProjectContext;
        if (PC && typeof PC.openDrawer === 'function') {
          try {
            PC.openDrawer();
            toast('已请求打开材料抽屉');
          } catch (err) {
            toast(String(err && err.message ? err.message : err));
          }
        } else if (PC && typeof PC.ensureDrawer === 'function') {
          var host = PC.ensureDrawer();
          if (host) host.hidden = false;
          toast(host ? '抽屉已显示' : '请先启用入口并刷新');
        } else {
          toast('Project Context 未加载或未启用');
        }
        return;
      }
      if (act === 'mark') {
        var id = t.getAttribute('data-id');
        var mark = t.getAttribute('data-mark');
        var marks = loadMarks();
        marks[id] = mark;
        saveMarks(marks);
        var nextIdx = currentGuideIdx(el) + (mark === 'passed' || mark === 'skipped' ? 1 : 0);
        if (nextIdx >= GUIDE.length) nextIdx = GUIDE.length - 1;
        paintGuide(el, nextIdx);
        return;
      }
      if (act === 'next') {
        paintGuide(el, Math.min(GUIDE.length - 1, currentGuideIdx(el) + 1));
        return;
      }
      if (act === 'prev') {
        paintGuide(el, Math.max(0, currentGuideIdx(el) - 1));
        return;
      }
      if (act === 'goto') {
        paintGuide(el, parseInt(t.getAttribute('data-idx'), 10) || 0);
        return;
      }
      if (act === 'reset-marks') {
        saveMarks({});
        paintGuide(el, 0);
        toast('已清空手动勾选');
      }
    });

    var drag = el.querySelector('[data-acc="drag"]');
    var ox = 0;
    var oy = 0;
    var dragging = false;
    if (!drag) return;
    drag.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      dragging = true;
      var r = el.getBoundingClientRect();
      ox = e.clientX - r.left;
      oy = e.clientY - r.top;
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      try {
        drag.setPointerCapture(e.pointerId);
      } catch (_) {}
    });
    drag.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      el.style.left = Math.max(8, e.clientX - ox) + 'px';
      el.style.top = Math.max(8, e.clientY - oy) + 'px';
    });
    drag.addEventListener('pointerup', function () {
      dragging = false;
    });
  }

  function show() {
    var el = ensure();
    el.hidden = false;
    el.classList.remove('is-collapsed');
    setFlag(true);
    paintGuide(el);
    return el;
  }

  function hide() {
    var el = document.getElementById(ROOT_ID);
    if (el) el.hidden = true;
  }

  function toggle() {
    var el = document.getElementById(ROOT_ID);
    if (el && !el.hidden) {
      hide();
      setFlag(false);
      return false;
    }
    show();
    return true;
  }

  function boot() {
    if (flagOn()) show();
  }

  document.addEventListener(
    'keydown',
    function (e) {
      if (e.ctrlKey && e.shiftKey && (e.key === 'A' || e.key === 'a')) {
        e.preventDefault();
        toggle();
      }
    },
    true
  );

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.OneToneAcceptanceFloat = {
    show: show,
    hide: hide,
    toggle: toggle,
    data: DATA,
    guide: GUIDE,
    FLAG: FLAG,
    MARKS_KEY: MARKS_KEY,
    AUTO_CMD: AUTO_CMD
  };
})(typeof window !== 'undefined' ? window : globalThis);
