(function () {
  'use strict';

  var R = window.OneToneNowProto;
  var stage = document.getElementById('stage');
  var modeBar = document.getElementById('modeBar');
  var confirmEl = document.getElementById('confirm');
  var chrome = document.getElementById('chrome');
  var frame = document.getElementById('productFrame');
  var sizeLabel = document.getElementById('frameSizeLabel');
  var sizeHint = document.getElementById('frameSizeHint');
  var frameLabel = document.querySelector('.frame-label');
  var canvasOnlyLink = document.getElementById('canvasOnlyLink');
  var toggleChrome = document.getElementById('toggleChrome');

  var state = { mode: 'quiet', page: 'now', canvasOnly: false };

  var modeLabels = {
    quiet: '安静陪伴',
    attention: '需要处理',
    return: '回到工作',
    degraded: '依据不足'
  };

  function applyShellClass() {
    document.body.classList.remove('review', 'canvas-only');
    if (state.canvasOnly) {
      document.body.classList.add('canvas-only');
      document.documentElement.classList.add('canvas-only');
    } else {
      document.body.classList.add('review');
      document.documentElement.classList.remove('canvas-only');
    }
  }

  function qs() {
    var p = new URLSearchParams(location.search);
    var m = p.get('mode') || p.get('state') || 'quiet';
    if (R.modes.indexOf(m) >= 0) state.mode = m;
    state.canvasOnly = p.get('canvas') === '1';
    applyShellClass();
  }

  function writeQs() {
    var p = new URLSearchParams();
    p.set('mode', state.mode);
    if (state.canvasOnly) p.set('canvas', '1');
    history.replaceState(null, '', '?' + p.toString());
    if (canvasOnlyLink) {
      canvasOnlyLink.href = '?mode=' + encodeURIComponent(state.mode) + '&canvas=1';
    }
  }

  function measureFrame() {
    if (!frame) return;
    var rect = frame.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    var trueSize = w === 640 && h === 680;
    if (state.canvasOnly) {
      if (frameLabel) frameLabel.hidden = true;
      frame.setAttribute(
        'aria-label',
        trueSize
          ? 'OneTone 产品窗口 640×680 真尺寸'
          : 'OneTone 产品窗口，目标 640×680，当前 ' + w + '×' + h
      );
      return;
    }
    if (frameLabel) frameLabel.hidden = false;
    if (sizeLabel) sizeLabel.textContent = w + ' × ' + h;
    if (sizeHint) {
      sizeHint.textContent = trueSize ? '· 真尺寸' : '· 缩放预览（目标 640×680）';
    }
    frame.setAttribute(
      'aria-label',
      trueSize
        ? 'OneTone 产品窗口 640×680 真尺寸'
        : 'OneTone 产品窗口缩放预览，目标 640×680，当前 ' + w + '×' + h
    );
  }

  function renderModeBar() {
    if (!modeBar) return;
    modeBar.innerHTML = R.modes
      .map(function (m) {
        return (
          '<button type="button" data-mode="' +
          m +
          '"' +
          (m === state.mode ? ' aria-current="true"' : '') +
          '>' +
          modeLabels[m] +
          '</button>'
        );
      })
      .join('');
  }

  function pageHtml(page) {
    if (page === 'habits') {
      return (
        '<div class="hn-page">' +
        '<button type="button" class="hn-back" data-nav="now">← 返回现在</button>' +
        R.navHtml('habits') +
        '<h1>我的习惯</h1>' +
        '<p>情景、语义动作与四通道绑定在这里配置，不占用首页。</p>' +
        '</div>'
      );
    }
    if (page === 'settings') {
      return (
        '<div class="hn-page">' +
        '<button type="button" class="hn-back" data-nav="now">← 返回现在</button>' +
        R.navHtml('settings') +
        '<h1>设置</h1>' +
        '<p>设备、隐私、数据源与 Agent 接入。链接与数据归入此处。</p>' +
        '</div>'
      );
    }
    return '';
  }

  function paint() {
    state.page = 'now';
    stage.innerHTML = R.renderHome(state.mode);
    writeQs();
    renderModeBar();
    requestAnimationFrame(measureFrame);
  }

  function openRecall(id) {
    var snap = R.snapshotFor(state.mode);
    var drawer = document.getElementById('recallDrawer');
    var title = document.getElementById('recallTitle');
    var body = document.getElementById('recallBody');
    if (!drawer || !title || !body) return;
    var titles = { history: '最近工作', memory: '项目要点', evidence: '判断依据' };
    title.textContent = titles[id] || '详情';
    body.innerHTML = R.drawerHtml(id, snap);
    drawer.hidden = false;
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var mBtn = t.closest('[data-mode]');
    if (mBtn && modeBar && modeBar.contains(mBtn)) {
      state.mode = mBtn.getAttribute('data-mode');
      paint();
      return;
    }

    var nav = t.closest('[data-nav]');
    if (nav) {
      var page = nav.getAttribute('data-nav');
      if (page === 'now') {
        paint();
        return;
      }
      if (page === 'habits' || page === 'settings') {
        state.page = page;
        stage.innerHTML = pageHtml(page);
        return;
      }
    }

    var recall = t.closest('[data-recall]');
    if (recall) {
      openRecall(recall.getAttribute('data-recall'));
      return;
    }

    var act = t.closest('[data-act]');
    if (act) {
      var kind = act.getAttribute('data-act');
      if (kind === 'close-drawer') {
        var d = document.getElementById('recallDrawer');
        if (d) d.hidden = true;
        return;
      }
      if (kind === 'decide') {
        R.toast('打开确认界面（原型）');
        return;
      }
      if (kind === 'continue') {
        R.toast('已通过 Soft Pad 继续 Cursor');
        state.mode = 'quiet';
        paint();
        return;
      }
      if (kind === 'restore') {
        R.toast('请确认当前项目');
        return;
      }
    }

    if (t.closest('[data-close-confirm]')) {
      confirmEl.hidden = true;
      return;
    }
    if (t.closest('[data-cross-confirm]')) {
      confirmEl.hidden = true;
      R.toast('已通过按键完成确认');
      state.mode = 'quiet';
      paint();
    }
  });

  if (toggleChrome && chrome) {
    toggleChrome.addEventListener('click', function () {
      var collapsed = chrome.getAttribute('data-collapsed') === 'true';
      chrome.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      toggleChrome.setAttribute('aria-pressed', collapsed ? 'false' : 'true');
      toggleChrome.textContent = collapsed ? '收起说明' : '展开说明';
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    var map = { q: 'quiet', a: 'attention', w: 'return', d: 'degraded' };
    if (map[e.key]) {
      state.mode = map[e.key];
      paint();
    }
    if (e.key === 'r' || e.key === 'R') paint();
  });

  window.addEventListener('resize', measureFrame);

  qs();
  paint();
})();
