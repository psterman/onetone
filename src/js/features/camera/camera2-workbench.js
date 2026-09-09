/**
 * Camera 2 workbench — real presence prefs + preview (will replace Camera 1 IA).
 * Prototype look, live OneToneCameraPresenceActions / OneToneCameraPreview.
 */
(function (global) {
  'use strict';

  var mounted = false;
  var bound = false;
  var activeFn = 'away';
  var dirMode = 'simple';
  var TEACH_KEY = 'ot.camera.teach.v1';

  var PRIMARY = [
    { id: 'away', label: '离席', bind: 'onAway', trigger: 'away' },
    { id: 'back', label: '回席', bind: 'onReturn', trigger: null },
    { id: 'shake', label: '摇头', bind: 'shakeHead', trigger: 'shake' },
    { id: 'blink', label: '故意眨眼', bind: 'deliberateBlink', trigger: 'blink' },
  ];
  var EXTRA = [
    { id: 'palm', label: '五指张开', bind: 'openPalm', trigger: 'openPalm', group: '手势' },
    { id: 'ok', label: 'OK 手势', bind: 'okHand', trigger: 'okHand', group: '手势' },
    { id: 'fist', label: '握拳', bind: 'fist', trigger: 'fist', group: '手势' },
    { id: 'wave', label: '挥手', bind: 'wave', trigger: 'wave', group: '手势' },
  ];
  var ALL = PRIMARY.concat(EXTRA);

  function $(id) { return document.getElementById(id); }
  function pa() { return global.OneToneCameraPresenceActions || null; }
  function prefs() {
    var api = pa();
    return api && api.prefs ? api.prefs() : { enabled: false, triggers: {}, onAway: 'none', onReturn: 'none', shakeHead: 'none', deliberateBlink: 'none', openPalm: 'none', okHand: 'none', fist: 'none', wave: 'none', awayMs: 3000, presentMs: 1000 };
  }
  function persist(partial) {
    var api = pa();
    if (api && api.persist) api.persist(partial);
  }
  function actionLabel(token) {
    var api = pa();
    if (api && api.actionLabel) return api.actionLabel(token);
    return token || '—';
  }
  function allowed(bindKey) {
    var api = pa();
    if (api && api.allowedActionsForBindKey) return api.allowedActionsForBindKey(bindKey) || ['none'];
    return ['none'];
  }

  function setToggle(btn, on) {
    if (!btn) return;
    btn.classList.toggle('is-on', !!on);
    btn.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  function fillActionSelect(sel, bindKey, cur) {
    if (!sel) return;
    var list = allowed(bindKey);
    sel.innerHTML = '';
    list.forEach(function (token) {
      var opt = document.createElement('option');
      opt.value = token;
      opt.textContent = actionLabel(token);
      sel.appendChild(opt);
    });
    if (list.indexOf(cur) < 0 && cur) {
      var extra = document.createElement('option');
      extra.value = cur;
      extra.textContent = actionLabel(cur);
      sel.appendChild(extra);
    }
    sel.value = cur || 'none';
  }

  function mapOf(id) {
    var p = prefs();
    var row = ALL.find(function (x) { return x.id === id; });
    if (!row) return '—';
    return actionLabel(p[row.bind] || 'none');
  }

  function isOff(id) {
    var p = prefs();
    var row = ALL.find(function (x) { return x.id === id; });
    if (!row) return true;
    if (id === 'back') return !p.triggers || !p.triggers.away;
    if (!row.trigger) return false;
    return !(p.triggers && p.triggers[row.trigger]);
  }

  function buildOneLiner() {
    var p = prefs();
    var parts = [];
    if (p.triggers && p.triggers.away) parts.push('离席 → ' + actionLabel(p.onAway));
    if (p.triggers && p.triggers.away) parts.push('回席 → ' + actionLabel(p.onReturn));
    if (p.triggers && p.triggers.shake) parts.push('摇头 → ' + actionLabel(p.shakeHead));
    if (p.triggers && p.triggers.blink) parts.push('长眨 → ' + actionLabel(p.deliberateBlink));
    if (p.triggers && p.triggers.openPalm) parts.push('五指 → ' + actionLabel(p.openPalm));
    if (p.triggers && p.triggers.okHand) parts.push('OK → ' + actionLabel(p.okHand));
    if (!parts.length) return '尚未开启常用动作 · 点左侧开启';
    return parts.slice(0, 3).join(' · ');
  }

  function syncFgChrome() {
    var name = '通用';
    var meta = '写入通用摄像头习惯';
    try {
      var ui = global.OneToneState && global.OneToneState.ui;
      if (ui && String(ui.cameraEditMode || '') === 'appScenario' && ui.habitScenarioReturnId) {
        var core = global.OneToneMappingCore;
        var m = core && core.byId ? core.byId(ui.habitScenarioReturnId) : null;
        if (m) {
          name = String(m.name || m.appTargetId || '应用场景');
          meta = '写入应用场景覆盖';
        }
      } else if (global.OneToneHomeWorkbenchModel && global.OneToneHomeWorkbenchModel.peek) {
        var vm = global.OneToneHomeWorkbenchModel.peek({});
        if (vm && vm.m && vm.m.name) name = String(vm.m.name);
      }
    } catch (_) {}
    var fgName = $('c2FgName');
    var fgMeta = $('c2FgMeta');
    if (fgName) fgName.textContent = name;
    if (fgMeta) fgMeta.textContent = meta;
    var line = $('c2OneLinerText');
    if (line) line.innerHTML = '<em>' + name + '</em> 下：' + buildOneLiner();
    document.querySelectorAll('#camera2Mount [data-write-note]').forEach(function (el) {
      el.textContent = '写入：' + meta;
    });
  }

  function renderFnDir(filter) {
    var needle = (filter || '').trim().toLowerCase();
    var pri = $('c2FnPrimary');
    var extra = $('c2FnExtra');
    if (!pri || !extra) return;
    pri.innerHTML = '';
    extra.innerHTML = '';
    var shown = 0;

    function addBtn(it, ul) {
      var hay = (it.label + ' ' + mapOf(it.id)).toLowerCase();
      if (needle && hay.indexOf(needle) < 0) return;
      shown += 1;
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'c2-fn-item' + (activeFn === it.id ? ' is-on' : '') + (isOff(it.id) ? ' is-off' : '');
      btn.innerHTML = '<span class="name">' + it.label + '</span><span class="map">→ ' + mapOf(it.id) + '</span>';
      btn.addEventListener('click', function () {
        if (!PRIMARY.find(function (x) { return x.id === it.id; }) && dirMode !== 'adv') {
          var more = $('c2FnMore');
          if (more) more.open = true;
        }
        openFn(it.id);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }

    PRIMARY.forEach(function (it) { addBtn(it, pri); });

    var groups = {};
    EXTRA.forEach(function (it) {
      if (!groups[it.group]) groups[it.group] = [];
      groups[it.group].push(it);
    });
    Object.keys(groups).forEach(function (g) {
      var wrap = document.createElement('div');
      var kick = document.createElement('p');
      kick.className = 'c2-fn-kicker';
      kick.textContent = g;
      var ul = document.createElement('ul');
      ul.className = 'c2-fn-list';
      var n = 0;
      groups[g].forEach(function (it) {
        var before = shown;
        addBtn(it, ul);
        if (shown > before) n += 1;
      });
      if (!n) return;
      wrap.appendChild(kick);
      wrap.appendChild(ul);
      extra.appendChild(wrap);
    });

    var empty = $('c2FnEmpty');
    if (empty) empty.classList.toggle('is-show', shown === 0);
    var more = $('c2FnMore');
    if (more && (dirMode === 'adv' || needle)) more.open = true;
  }

  function openFn(id) {
    activeFn = id;
    document.querySelectorAll('#camera2Mount .c2-detail-panel').forEach(function (p) {
      p.hidden = p.id !== 'c2-edit-' + id;
    });
    syncDetailFromPrefs();
    renderFnDir(($('c2FnSearch') || {}).value || '');
    var testBtn = $('c2BtnTestFn');
    var row = ALL.find(function (x) { return x.id === id; });
    if (testBtn && row) testBtn.textContent = '测试：' + row.label;
  }

  function syncDetailFromPrefs() {
    var p = prefs();
    setToggle($('c2MasterToggle'), !!p.enabled);
    var lbl = $('c2MasterLbl');
    if (lbl) lbl.textContent = p.enabled ? '识别已开' : '识别已关';
    var warn = $('c2InactiveWarn');
    if (warn) warn.classList.toggle('is-show', !p.enabled);

    setToggle($('c2EnAway'), !!(p.triggers && p.triggers.away));
    setToggle($('c2EnShake'), !!(p.triggers && p.triggers.shake));
    setToggle($('c2EnBlink'), !!(p.triggers && p.triggers.blink));
    setToggle($('c2EnPalm'), !!(p.triggers && p.triggers.openPalm));
    setToggle($('c2EnOk'), !!(p.triggers && p.triggers.okHand));
    setToggle($('c2EnFist'), !!(p.triggers && p.triggers.fist));
    setToggle($('c2EnWave'), !!(p.triggers && p.triggers.wave));

    fillActionSelect($('c2ActAway'), 'onAway', p.onAway || 'none');
    fillActionSelect($('c2ActBack'), 'onReturn', p.onReturn || 'none');
    fillActionSelect($('c2ActShake'), 'shakeHead', p.shakeHead || 'none');
    fillActionSelect($('c2ActBlink'), 'deliberateBlink', p.deliberateBlink || 'none');
    fillActionSelect($('c2ActPalm'), 'openPalm', p.openPalm || 'none');
    fillActionSelect($('c2ActOk'), 'okHand', p.okHand || 'none');
    fillActionSelect($('c2ActFist'), 'fist', p.fist || 'none');
    fillActionSelect($('c2ActWave'), 'wave', p.wave || 'none');

    var awayMs = $('c2AwayMs');
    if (awayMs) awayMs.value = String(p.awayMs || 3000);
    var presentMs = $('c2PresentMs');
    if (presentMs) presentMs.value = String(p.presentMs || 1000);
    var blinkSec = $('c2BlinkSec');
    if (blinkSec) blinkSec.value = String(p.blinkCloseSec || 0.6);

    ['away', 'back', 'shake', 'blink', 'palm', 'ok', 'fist', 'wave'].forEach(function (id) {
      var el = document.querySelector('#camera2Mount [data-map-label="' + id + '"]');
      if (el) el.textContent = mapOf(id);
    });
    syncFgChrome();
  }

  function syncPreviewUi() {
    var live = global.OneToneCameraPreview && global.OneToneCameraPreview.isRunning && global.OneToneCameraPreview.isRunning();
    var chip = $('c2PreviewChip');
    var btn = $('c2BtnPreview');
    if (chip) chip.textContent = live ? '预览中 · 可测' : '待命 · 点开启后可测';
    if (btn) btn.textContent = live ? '停止预览' : '开启预览';
    var src = $('cameraPreviewVideo');
    var dst = $('c2PreviewVideo');
    if (src && dst && src.srcObject) {
      if (dst.srcObject !== src.srcObject) dst.srcObject = src.srcObject;
      dst.hidden = false;
      var face = $('c2PreviewFace');
      if (face) face.hidden = true;
    }
  }

  function togglePreview() {
    var api = global.OneToneCameraPreview;
    if (!api) return;
    if (api.isRunning && api.isRunning()) {
      if (api.stop) api.stop();
    } else {
      if (api.startPreview) api.startPreview({ reason: 'camera2' });
      else if (api.onPanelVisible) api.onPanelVisible();
    }
    setTimeout(syncPreviewUi, 400);
  }

  function setDirMode(mode) {
    dirMode = mode === 'adv' ? 'adv' : 'simple';
    var dir = $('c2FnDir');
    if (dir) dir.classList.toggle('is-adv', dirMode === 'adv');
    var more = $('c2FnMore');
    if (more) more.open = dirMode === 'adv';
    var kick = $('c2FnPrimaryKick');
    if (kick) kick.textContent = dirMode === 'adv' ? '常用（仍置顶）' : '常用';
    document.querySelectorAll('#camera2Mount [data-c2-mode]').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-c2-mode') === dirMode);
    });
    renderFnDir(($('c2FnSearch') || {}).value || '');
  }

  function setTab(tab) {
    var isMatch = tab !== 'lab';
    var panelMatch = $('c2PanelMatch');
    var panelLab = $('c2PanelLab');
    if (panelMatch) panelMatch.hidden = !isMatch;
    if (panelLab) panelLab.hidden = isMatch;
    document.querySelectorAll('#camera2Mount [data-c2-tab]').forEach(function (b) {
      b.classList.toggle('is-on', b.getAttribute('data-c2-tab') === (isMatch ? 'match' : 'lab'));
    });
  }

  function openTeach() {
    var api = global.OneToneCameraTeach;
    if (api && api.open) api.open({ mark: true });
  }

  function closeTeach() {
    var api = global.OneToneCameraTeach;
    if (api && api.close) api.close({ mark: true });
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var root = $('camera2Mount');
    if (!root) return;

    root.addEventListener('click', function (e) {
      var tab = e.target.closest('[data-c2-tab]');
      if (tab) { setTab(tab.getAttribute('data-c2-tab')); return; }
      var mode = e.target.closest('[data-c2-mode]');
      if (mode) { setDirMode(mode.getAttribute('data-c2-mode')); return; }
      if (e.target.closest('#c2BtnReplayTeach')) { openTeach(); return; }
      if (e.target.closest('#c2BtnPreview') || e.target.closest('#c2BtnLabPreview')) { togglePreview(); return; }
      if (e.target.closest('#c2BtnGotoCam1')) {
        if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.setPanel) {
          global.OneToneSettingsDrawer.setPanel('camera');
        } else if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.open) {
          global.OneToneSettingsDrawer.open({ panel: 'camera' });
        }
        return;
      }
      if (e.target.closest('#c2BtnTestFn')) {
        var api = pa();
        var st = api && api.getState ? api.getState() : null;
        var row = ALL.find(function (x) { return x.id === activeFn; });
        var msg = row ? ('测试 ' + row.label + ' → ' + mapOf(activeFn)) : '测试';
        if (st && st.presence) msg += ' · 当前:' + st.presence;
        var pulse = $('c2Pulse');
        if (pulse) {
          pulse.textContent = msg;
          pulse.classList.add('is-show');
          clearTimeout(bindOnce._pulseT);
          bindOnce._pulseT = setTimeout(function () { pulse.classList.remove('is-show'); }, 1800);
        }
        return;
      }
      var en = e.target.closest('[data-c2-en]');
      if (en) {
        var key = en.getAttribute('data-c2-en');
        var on = !en.classList.contains('is-on');
        var triggers = Object.assign({}, prefs().triggers || {});
        triggers[key] = on;
        // Ensure action not none when enabling common triggers
        var patch = { triggers: triggers };
        if (on) {
          if (key === 'away' && (!prefs().onAway || prefs().onAway === 'none')) patch.onAway = 'privacyScreen';
          if (key === 'shake' && (!prefs().shakeHead || prefs().shakeHead === 'none')) patch.shakeHead = 'pressEsc';
        }
        persist(patch);
        syncDetailFromPrefs();
        renderFnDir(($('c2FnSearch') || {}).value || '');
        return;
      }
      if (e.target.closest('#c2MasterToggle')) {
        var next = !($('c2MasterToggle').classList.contains('is-on'));
        persist({ enabled: next });
        var api2 = pa();
        if (api2 && api2.reconcileRuntime) api2.reconcileRuntime({ reason: next ? 'camera2_on' : 'camera2_off' });
        syncDetailFromPrefs();
      }
    });

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (!t) return;
      if (t.id === 'c2FnSearch') {
        renderFnDir(t.value);
        return;
      }
      var act = t.getAttribute('data-c2-act');
      if (act) {
        var patch = {};
        patch[act] = t.value;
        persist(patch);
        syncDetailFromPrefs();
        renderFnDir(($('c2FnSearch') || {}).value || '');
        return;
      }
      if (t.id === 'c2AwayMs') {
        persist({ awayMs: Number(t.value) || 3000 });
        return;
      }
      if (t.id === 'c2PresentMs') {
        persist({ presentMs: Number(t.value) || 1000 });
        return;
      }
      if (t.id === 'c2BlinkSec') {
        persist({ blinkCloseSec: Number(t.value) || 0.6 });
      }
    });
  }

  function ensureMarkup() {
    var mount = $('camera2Mount');
    if (!mount || mount.getAttribute('data-ready') === '1') return;
    mount.setAttribute('data-ready', '1');
    mount.innerHTML = [
      '<div class="c2-root">',
      '  <div class="c2-status">',
      '    <div class="c2-status-left">',
      '      <h1><span class="sub">摄像头 2 · </span>前台自动</h1>',
      '      <span class="c2-fg"><span class="dot"></span><span id="c2FgName">—</span></span>',
      '      <span class="c2-meta" id="c2FgMeta">—</span>',
      '      <button type="button" class="c2-chip-btn" id="c2BtnReplayTeach">再看一遍</button>',
      '    </div>',
      '    <div class="c2-status-right">',
      '      <span id="c2MasterLbl">识别已关</span>',
      '      <button type="button" class="c2-toggle" id="c2MasterToggle" role="switch" aria-checked="false"></button>',
      '    </div>',
      '  </div>',
      '  <nav class="c2-tabs">',
      '    <button type="button" class="is-on" data-c2-tab="match">识别匹配</button>',
      '    <button type="button" data-c2-tab="lab">摄像头设置</button>',
      '  </nav>',
      '  <div class="c2-body">',
      '    <p class="c2-warn" id="c2InactiveWarn">已配置，但不会生效 · 请打开识别总开关</p>',
      '    <div class="c2-one" id="c2OneLiner"><p class="k">当前匹配</p><p class="t" id="c2OneLinerText">—</p></div>',
      '    <section id="c2PanelMatch">',
      '      <div class="c2-mode">',
      '        <button type="button" class="is-on" data-c2-mode="simple">简易</button>',
      '        <button type="button" data-c2-mode="adv">高级</button>',
      '      </div>',
      '      <div class="c2-pair">',
      '        <aside class="c2-dir" id="c2FnDir">',
      '          <input type="search" class="c2-search" id="c2FnSearch" placeholder="搜索功能…" autocomplete="off" />',
      '          <p class="c2-fn-kicker" id="c2FnPrimaryKick">常用</p>',
      '          <ul class="c2-fn-list" id="c2FnPrimary"></ul>',
      '          <details class="c2-more" id="c2FnMore"><summary>高级 · 手势</summary><div id="c2FnExtra"></div></details>',
      '          <p class="c2-empty" id="c2FnEmpty">无匹配功能</p>',
      '        </aside>',
      '        <div class="c2-detail">',
      detailPanel('away', '反应', '离席', '人脸消失达时长 → 执行一次', 'c2EnAway', 'away', 'c2ActAway', 'onAway', true, '<div class="c2-field"><label>判定时长</label><select id="c2AwayMs"><option value="1000">1 秒</option><option value="2000">2 秒</option><option value="3000" selected>3 秒</option><option value="5000">5 秒</option></select></div>'),
      detailPanel('back', '反应', '回席', '跟随离席识别 · 无独立开关', null, null, 'c2ActBack', 'onReturn', false, '<div class="c2-field"><label>判定时长</label><select id="c2PresentMs"><option value="500">0.5 秒</option><option value="1000" selected>1 秒</option><option value="2000">2 秒</option></select></div>'),
      detailPanel('shake', '反应', '摇头', '左右三拍', 'c2EnShake', 'shake', 'c2ActShake', 'shakeHead', true, ''),
      detailPanel('blink', '反应', '故意眨眼', '普通眨眼不算', 'c2EnBlink', 'blink', 'c2ActBlink', 'deliberateBlink', true, '<div class="c2-field"><label>闭眼多久</label><select id="c2BlinkSec"><option value="0.6" selected>0.6 秒</option><option value="1">1 秒</option><option value="2">2 秒</option></select></div>'),
      detailPanel('palm', '反应', '五指张开', '手需进入画面', 'c2EnPalm', 'openPalm', 'c2ActPalm', 'openPalm', true, ''),
      detailPanel('ok', '反应', 'OK 手势', '拇指食指成圈', 'c2EnOk', 'okHand', 'c2ActOk', 'okHand', true, ''),
      detailPanel('fist', '反应', '握拳', '收拢五指', 'c2EnFist', 'fist', 'c2ActFist', 'fist', true, ''),
      detailPanel('wave', '反应', '挥手', '与五指可能互抢', 'c2EnWave', 'wave', 'c2ActWave', 'wave', true, ''),
      '          <details class="c2-test" id="c2TestFold">',
      '            <summary><span>测试画面</span><span class="hint">真预览 · 与摄像头 1 同源</span></summary>',
      '            <div class="c2-preview">',
      '              <div class="c2-preview-stage">',
      '                <video id="c2PreviewVideo" autoplay playsinline muted hidden></video>',
      '                <div class="c2-face" id="c2PreviewFace">预览</div>',
      '                <span class="c2-chip" id="c2PreviewChip">待命</span>',
      '                <div class="c2-pulse" id="c2Pulse"></div>',
      '              </div>',
      '              <div class="c2-preview-tools">',
      '                <button type="button" class="c2-btn is-primary" id="c2BtnPreview">开启预览</button>',
      '                <button type="button" class="c2-btn" id="c2BtnTestFn">测试：离席</button>',
      '              </div>',
      '            </div>',
      '          </details>',
      '        </div>',
      '      </div>',
      '    </section>',
      '    <section id="c2PanelLab" hidden>',
      '      <div class="c2-lab">',
      '        <p>设备选择、分辨率与视线校准仍在摄像头 1 完整页。</p>',
      '        <div class="c2-row">',
      '          <button type="button" class="c2-btn is-primary" id="c2BtnLabPreview">开启预览</button>',
      '          <button type="button" class="c2-btn" id="c2BtnGotoCam1">打开摄像头 1（设备/校准）→</button>',
      '        </div>',
      '      </div>',
      '    </section>',
      '  </div>',
      '</div>',
    ].join('\n');
  }

  function detailPanel(id, type, title, sub, enId, enKey, actId, actKey, hasToggle, extraFields) {
    var hidden = id === 'away' ? '' : ' hidden';
    var toggle = hasToggle
      ? '<button type="button" class="c2-toggle" id="' + enId + '" data-c2-en="' + enKey + '" role="switch" aria-checked="false"></button>'
      : '';
    return [
      '<div class="c2-detail-panel" id="c2-edit-' + id + '"' + hidden + '>',
      '  <div class="c2-detail-h"><div><h2><span class="c2-type">' + type + '</span> ' + title + '</h2><p>' + sub + '</p></div>' + toggle + '</div>',
      '  <div class="c2-arrow"><span>' + title + '</span><span class="sep">→</span><span data-map-label="' + id + '">—</span></div>',
      '  <div class="c2-fields">' + extraFields + '<div class="c2-field"><label>执行结果</label><select id="' + actId + '" data-c2-act="' + actKey + '"></select></div></div>',
      '  <p class="c2-note" data-write-note></p>',
      '</div>',
    ].join('');
  }

  function mount() {
    ensureMarkup();
    bindOnce();
    mounted = true;
    setDirMode('simple');
    setTab('match');
    openFn(activeFn || 'away');
    syncDetailFromPrefs();
    renderFnDir('');
    syncPreviewUi();
    // Auto teach only first time (same key as prototype)
    try {
      if (!localStorage.getItem(TEACH_KEY)) {
        setTimeout(function () {
          if (($('settingsPanelCamera2') || {}).hidden) return;
          openTeach();
          try { localStorage.setItem(TEACH_KEY, '1'); } catch (_) {}
        }, 500);
      }
    } catch (_) {}
    return true;
  }

  function refresh() {
    if (!mounted) return mount();
    syncDetailFromPrefs();
    renderFnDir(($('c2FnSearch') || {}).value || '');
    syncPreviewUi();
  }

  global.OneToneCamera2Workbench = {
    mount: mount,
    refresh: refresh,
    openTeach: openTeach,
    closeTeach: closeTeach,
  };
  // Back-compat alias used by settings-drawer
  global.OneToneCamera2Compare = {
    mount: mount,
    reload: function () { mounted = false; var m = $('camera2Mount'); if (m) m.removeAttribute('data-ready'); return mount(); },
    openTeach: openTeach,
  };
})(typeof window !== 'undefined' ? window : globalThis);
