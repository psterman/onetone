(function () {
  'use strict';

  var R = window.OneToneAgentWorkHistory;
  var stage = document.getElementById('stage');
  var modeBar = document.getElementById('modeBar');
  var variantBar = document.getElementById('variantBar');
  var chrome = document.getElementById('chrome');
  var frame = document.getElementById('productFrame');
  var sizeLabel = document.getElementById('frameSizeLabel');
  var sizeHint = document.getElementById('frameSizeHint');
  var frameLabel = document.querySelector('.frame-label');
  var canvasOnlyLink = document.getElementById('canvasOnlyLink');
  var toggleChrome = document.getElementById('toggleChrome');
  var listeningToggle = document.getElementById('listeningToggle');
  var emptyToggle = document.getElementById('emptyToggle');
  var livePadToggle = document.getElementById('livePadToggle');
  var liveSnapToggle = document.getElementById('liveSnapToggle');

  var state = {
    variant: 'timeline',
    mode: 'quiet',
    surface: 'work',
    canvasOnly: false,
    listening: false,
    empty: false,
    livePad: false,
    live: false,
    liveSnap: null,
    liveError: '',
    selectedEventId: ''
  };

  var variantLabels = {
    timeline: 'A · 时间线优先',
    session: 'B · 当前会话优先',
    resume: 'C · 恢复工作优先',
    attention: 'D · 待处理优先'
  };

  var modeLabels = {
    quiet: '安静',
    attention: '需要注意',
    return: '返回工作',
    degraded: '数据受限'
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
    var v = p.get('variant') || 'timeline';
    var m = p.get('mode') || 'quiet';
    var s = p.get('surface') || 'work';
    if (R.variants.indexOf(v) >= 0) state.variant = v;
    if (R.modes.indexOf(m) >= 0) state.mode = m;
    if (R.surfaces.indexOf(s) >= 0) state.surface = s;
    state.canvasOnly = p.get('canvas') === '1';
    state.listening = p.get('listening') === '1';
    state.empty = p.get('empty') === '1';
    state.livePad = p.get('livePad') === '1';
    state.live = p.get('live') === '1';
    if (listeningToggle) listeningToggle.checked = state.listening;
    if (emptyToggle) emptyToggle.checked = state.empty;
    if (livePadToggle) livePadToggle.checked = state.livePad;
    if (liveSnapToggle) liveSnapToggle.checked = state.live;
    applyShellClass();
  }

  function writeQs() {
    var p = new URLSearchParams();
    p.set('variant', state.variant);
    p.set('mode', state.mode);
    if (state.surface !== 'work') p.set('surface', state.surface);
    if (state.canvasOnly) p.set('canvas', '1');
    if (state.listening) p.set('listening', '1');
    if (state.empty) p.set('empty', '1');
    if (state.livePad) p.set('livePad', '1');
    if (state.live) p.set('live', '1');
    history.replaceState(null, '', '?' + p.toString());
    if (canvasOnlyLink) {
      var q =
        '?variant=' +
        encodeURIComponent(state.variant) +
        '&mode=' +
        encodeURIComponent(state.mode) +
        '&canvas=1';
      if (state.surface !== 'work') q += '&surface=' + encodeURIComponent(state.surface);
      if (state.listening) q += '&listening=1';
      if (state.empty) q += '&empty=1';
      if (state.livePad) q += '&livePad=1';
      if (state.live) q += '&live=1';
      canvasOnlyLink.href = q;
    }
  }

  function invoke(cmd, args) {
    var ipc = window.OneToneIpc;
    if (ipc && typeof ipc.invoke === 'function') {
      return Promise.resolve(ipc.invoke(cmd, args || {}));
    }
    var core = window.__TAURI__ && window.__TAURI__.core;
    if (core && typeof core.invoke === 'function') {
      return Promise.resolve(core.invoke(cmd, args || {}));
    }
    return Promise.reject(new Error('no_ipc'));
  }

  function fetchLiveSnap() {
    if (!state.live) {
      state.liveSnap = null;
      state.liveError = '';
      return Promise.resolve(null);
    }
    return invoke('cmd_agent_home_snapshot', {})
      .then(function (dto) {
        var mapped = R.fromHomeSnapshot(dto);
        if (!mapped) throw new Error('no_projector');
        state.liveSnap = mapped;
        state.liveError = '';
        if (state.mode !== mapped.mode && R.modes.indexOf(mapped.mode) >= 0) {
          // Align review chrome with derived mode so bars match data.
          state.mode = mapped.mode;
        }
        return mapped;
      })
      .catch(function (err) {
        state.liveSnap = null;
        state.liveError = err && err.message ? String(err.message) : 'fetch_failed';
        return null;
      });
  }

  function measureFrame() {
    if (!frame) return;
    var rect = frame.getBoundingClientRect();
    var w = Math.round(rect.width);
    var h = Math.round(rect.height);
    var trueSize = w === 980 && h === 720;
    if (state.canvasOnly) {
      if (frameLabel) frameLabel.hidden = true;
      return;
    }
    if (frameLabel) frameLabel.hidden = false;
    if (sizeLabel) sizeLabel.textContent = w + ' × ' + h;
    if (sizeHint) {
      sizeHint.textContent = trueSize ? '· 真尺寸' : '· 缩放预览（目标 980×720）';
    }
  }

  function renderBars() {
    if (variantBar) {
      variantBar.innerHTML = R.variants
        .map(function (v) {
          return (
            '<button type="button" data-variant="' +
            v +
            '"' +
            (v === state.variant ? ' aria-current="true"' : '') +
            (state.surface !== 'work' ? ' disabled title="请先切回工作记录"' : '') +
            '>' +
            variantLabels[v] +
            '</button>'
          );
        })
        .join('');
    }
    if (modeBar) {
      modeBar.innerHTML = R.modes
        .map(function (m) {
          return (
            '<button type="button" data-mode="' +
            m +
            '"' +
            (m === state.mode ? ' aria-current="true" ' : '') +
            (state.live ? ' disabled title="实况中由快照决定"' : '') +
            '>' +
            modeLabels[m] +
            '</button>'
          );
        })
        .join('');
    }
  }

  function paint() {
    stage.innerHTML = R.renderPage({
      variant: state.variant,
      mode: state.mode,
      surface: state.surface,
      listening: state.listening,
      empty: state.empty && !state.live,
      liveSnap: state.live && state.liveSnap ? state.liveSnap : null,
      selectedEventId: state.selectedEventId
    });
    // Keep selection stable after paint
    var root = stage.querySelector('.ot-app');
    if (root && root.getAttribute('data-selected')) {
      state.selectedEventId = root.getAttribute('data-selected') || '';
    }
    writeQs();
    renderBars();
    if (state.live && state.liveError && R.toast) {
      R.toast(
        state.liveError === 'no_ipc'
          ? '无 IPC：在 OneTone 内打开，或先关「实况快照」'
          : '实况拉取失败 · ' + state.liveError
      );
    }
    requestAnimationFrame(function () {
      measureFrame();
      var Bridge = window.OneToneAwhSoftPadGlanceBridge;
      if (Bridge && Bridge.start) {
        Bridge.start({ livePad: state.livePad });
      }
    });
  }

  function paintMaybeLive() {
    if (!state.live) {
      paint();
      return;
    }
    fetchLiveSnap().then(function () {
      paint();
    });
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var vBtn = t.closest('[data-variant]');
    if (vBtn && variantBar && variantBar.contains(vBtn) && !vBtn.disabled) {
      state.variant = vBtn.getAttribute('data-variant');
      state.surface = 'work';
      paint();
      return;
    }

    var mBtn = t.closest('[data-mode]');
    if (mBtn && modeBar && modeBar.contains(mBtn) && !mBtn.disabled) {
      state.mode = mBtn.getAttribute('data-mode');
      paint();
      return;
    }

    var surf = t.closest('[data-surface]');
    if (surf && stage.contains(surf)) {
      state.surface = surf.getAttribute('data-surface') || 'work';
      paint();
      return;
    }

    var act = t.closest('[data-act]');
    if (act && stage.contains(act)) {
      var kind = act.getAttribute('data-act');
      var labels = {
        'resume-work': '继续这项工作（原型）',
        'attention-primary': '处理注意事项（原型）',
        'start-work': '开始一项 Agent 工作（原型）',
        'view-all': '打开左侧「数据」入口（原型）',
        'view-data': '打开 Agent 数据（现有入口）',
        'open-softpad': '打开 Soft Pad 标签看实况',
        'pad-refresh': '刷新 Soft Pad 预览桥',
        'pick-agent': '切换 Agent 提供方（现有控件）',
        'agent-settings': 'Agent 设置',
        resume: '继续该记录（原型）',
        open: '查看详情（原型）',
        reopen: '重新打开项目（原型）',
        'listen-pause': '暂停倾听（原型）',
        'listen-end': '结束并查看（原型）',
        'listen-cancel': '取消倾听（原型）',
        'trifolium-float': '浮窗配置（现有三叶）',
        'trifolium-mini': '迷你栏配置（现有三叶）',
        'trifolium-pad': 'Soft Pad 配置（现有三叶）',
        noop: '三叶选项（示意）'
      };
      R.toast(labels[kind] || kind);
      if (kind === 'listen-cancel' || kind === 'listen-end') {
        state.listening = false;
        if (listeningToggle) listeningToggle.checked = false;
        paint();
      }
      if (kind === 'select-event') {
        var art = act.closest('[data-event-id]') || act;
        state.selectedEventId = art.getAttribute('data-event-id') || '';
        paint();
        return;
      }
      if (kind === 'pad-refresh') {
        var B = window.OneToneAwhSoftPadGlanceBridge;
        if (B) B.refresh();
        return;
      }
      if (kind === 'open-softpad') {
        state.surface = 'softPad';
        paint();
        return;
      }
      if (kind === 'view-data' || kind === 'view-all') {
        R.toast('跳转左侧「数据」——沿用现有全局导航');
      }
    }
  });

  if (listeningToggle) {
    listeningToggle.addEventListener('change', function () {
      state.listening = !!listeningToggle.checked;
      paint();
    });
  }
  if (emptyToggle) {
    emptyToggle.addEventListener('change', function () {
      state.empty = !!emptyToggle.checked;
      paint();
    });
  }
  if (livePadToggle) {
    livePadToggle.addEventListener('change', function () {
      state.livePad = !!livePadToggle.checked;
      paint();
    });
  }
  if (liveSnapToggle) {
    liveSnapToggle.addEventListener('change', function () {
      state.live = !!liveSnapToggle.checked;
      if (!state.live) {
        state.liveSnap = null;
        state.liveError = '';
        paint();
      } else {
        paintMaybeLive();
      }
    });
  }

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
    var modes = { q: 'quiet', a: 'attention', w: 'return', d: 'degraded' };
    var variants = { '1': 'timeline', '2': 'session', '3': 'resume', '4': 'attention' };
    if (modes[e.key]) {
      state.mode = modes[e.key];
      paint();
    }
    if (variants[e.key]) {
      state.variant = variants[e.key];
      state.surface = 'work';
      paint();
    }
    if (e.key === 't' || e.key === 'T') {
      var i = R.surfaces.indexOf(state.surface);
      state.surface = R.surfaces[(i + 1) % R.surfaces.length];
      paint();
    }
    if (e.key === 'l' || e.key === 'L') {
      state.listening = !state.listening;
      if (listeningToggle) listeningToggle.checked = state.listening;
      paint();
    }
    if (e.key === 'r' || e.key === 'R') {
      if (state.live) paintMaybeLive();
      else paint();
    }
  });

  window.addEventListener('resize', measureFrame);

  qs();
  paintMaybeLive();
})();
