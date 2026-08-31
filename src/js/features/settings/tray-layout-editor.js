/**
 * Tray layout editor — blocks / controls dual lists for #settingsPanelTray.
 */
(function (global) {
  'use strict';

  var mounted = false;
  var dirty = false;
  var focusChannel = null;
  var onChangeCb = null;

  function $(id) { return document.getElementById(id); }

  function t(key, fb) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fb || key;
  }

  function V2() { return global.OneToneTrayLayoutV2; }
  function TCC() { return global.OneToneTrayChannelControls; }

  function blockLabel(b) {
    return t(b.labelKey, b.labelFb || b.id);
  }

  function notifyChange() {
    dirty = true;
    var badge = $('softPadTrayEditorDirty');
    if (badge) badge.hidden = false;
    if (onChangeCb) onChangeCb();
  }

  function moveItem(list, idx, dir) {
    var j = idx + dir;
    if (j < 0 || j >= list.length) return;
    var tmp = list[idx].order;
    list[idx].order = list[j].order;
    list[j].order = tmp;
    list.sort(function (a, b) { return a.order - b.order; });
    list.forEach(function (it, i) { it.order = i; });
  }

  function renderBlockList(host, layout, catalog) {
    if (!host) return;
    host.innerHTML = '';
    var blocks = (layout.blocks || []).slice().sort(function (a, b) { return a.order - b.order; });
    blocks.forEach(function (item, idx) {
      var meta = catalog.blocks.find(function (b) { return b.id === item.id; }) || {};
      var row = document.createElement('div');
      row.className = 'tray-editor-item' + (item.visible === false ? ' is-off' : '');
      if (meta.channel && focusChannel === meta.channel) row.classList.add('is-focus');
      if (item.id === 'block:channel:' + focusChannel) row.classList.add('is-focus');
      var chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = item.visible !== false;
      chk.disabled = !!meta.locked;
      chk.addEventListener('change', function () {
        item.visible = chk.checked;
        row.classList.toggle('is-off', !chk.checked);
        notifyChange();
      });
      var grip = document.createElement('span');
      grip.className = 'tray-editor-grip';
      grip.textContent = '⠿';
      var lbl = document.createElement('span');
      lbl.className = 'tray-editor-lbl';
      lbl.textContent = blockLabel(meta);
      var tag = document.createElement('span');
      tag.className = 'tray-editor-tag';
      tag.textContent = item.id;
      var ord = document.createElement('div');
      ord.className = 'tray-editor-order';
      var up = document.createElement('button');
      up.type = 'button';
      up.textContent = '▲';
      up.addEventListener('click', function () { moveItem(blocks, idx, -1); render(); });
      var down = document.createElement('button');
      down.type = 'button';
      down.textContent = '▼';
      down.addEventListener('click', function () { moveItem(blocks, idx, 1); render(); });
      ord.appendChild(up);
      ord.appendChild(down);
      row.appendChild(grip);
      row.appendChild(chk);
      row.appendChild(lbl);
      row.appendChild(tag);
      row.appendChild(ord);
      host.appendChild(row);
    });
  }

  function renderControlList(host, layout, catalog) {
    if (!host) return;
    host.innerHTML = '';
    var byCh = {};
    (layout.controls || []).slice().sort(function (a, b) { return a.order - b.order; }).forEach(function (item) {
      var ch = item.channel || 'voice';
      if (!byCh[ch]) byCh[ch] = [];
      byCh[ch].push(item);
    });
    var chOrder = V2().CHANNELS;
    chOrder.forEach(function (ch) {
      var list = byCh[ch];
      if (!list || !list.length) return;
      var gh = document.createElement('div');
      gh.className = 'tray-editor-ch-head';
      gh.textContent = t('trayEditorCh' + ch.charAt(0).toUpperCase() + ch.slice(1), ch);
      host.appendChild(gh);
      list.forEach(function (item, idx) {
        var meta = catalog.controls.find(function (c) { return c.id === item.id; }) || {};
        var row = document.createElement('div');
        row.className = 'tray-editor-item' + (item.visible === false ? ' is-off' : '');
        var chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = item.visible !== false;
        chk.addEventListener('change', function () {
          item.visible = chk.checked;
          row.classList.toggle('is-off', !chk.checked);
          notifyChange();
        });
        var lbl = document.createElement('span');
        lbl.className = 'tray-editor-lbl';
        lbl.textContent = meta.label || item.id;
        if (meta.renderTier === 'title') {
          var sub = document.createElement('span');
          sub.className = 'tray-editor-sub';
          sub.textContent = ' ' + t('trayEditorTitleL1', '标题 L1');
          lbl.appendChild(sub);
        }
        if (meta.demoted) {
          var dem = document.createElement('span');
          dem.className = 'tray-editor-demote';
          dem.textContent = t('trayEditorDemotedL2', '已自动归入 L2');
          lbl.appendChild(dem);
        }
        var ord = document.createElement('div');
        ord.className = 'tray-editor-order';
        var up = document.createElement('button');
        up.type = 'button';
        up.textContent = '▲';
        up.addEventListener('click', function () { moveItem(list, idx, -1); render(); });
        var down = document.createElement('button');
        down.type = 'button';
        down.textContent = '▼';
        down.addEventListener('click', function () { moveItem(list, idx, 1); render(); });
        ord.appendChild(up);
        ord.appendChild(down);
        row.appendChild(chk);
        row.appendChild(lbl);
        row.appendChild(ord);
        host.appendChild(row);
      });
    });
  }

  function render() {
    var v2 = V2();
    var tcc = TCC();
    if (!v2 || !tcc) return;
    var layout = tcc.getTrayLayoutV2();
    var catalog = v2.getTrayCatalog();
    renderBlockList($('softPadTrayEditorBlocks'), layout, catalog);
    renderControlList($('softPadTrayEditorControls'), layout, catalog);
    if (focusChannel) {
      var el = document.querySelector('.tray-editor-item.is-focus');
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function showNewBanner(n) {
    var b = $('softPadTrayEditorBanner');
    if (!b) return;
    if (!n || n <= 0) { b.hidden = true; return; }
    b.hidden = false;
    b.querySelector('.tray-editor-banner-text').textContent =
      t('trayEditorNewControlsBanner', '新增 {n} 个开关，默认隐藏').replace('{n}', String(n));
  }

  function mount(opts) {
    opts = opts || {};
    onChangeCb = opts.onChange || null;
    focusChannel = opts.trayEditorFocus || null;
    if (!mounted) {
      mounted = true;
      var saveBtn = $('softPadTrayEditorSave');
      if (saveBtn) saveBtn.addEventListener('click', save);
      var resetBtn = $('softPadTrayEditorReset');
      if (resetBtn) resetBtn.addEventListener('click', reset);
      var dismiss = $('softPadTrayEditorBannerDismiss');
      if (dismiss) dismiss.addEventListener('click', function () {
        $('softPadTrayEditorBanner').hidden = true;
      });
      document.querySelectorAll('.tray-editor-fold-head').forEach(function (btn) {
        btn.addEventListener('click', function () {
          btn.parentElement.classList.toggle('is-open');
        });
      });
    }
    return TCC().loadTrayLayout().then(function (merged) {
      if (merged && merged.newControls) showNewBanner(merged.newControls);
      render();
    });
  }

  function save() {
    var tcc = TCC();
    if (!tcc) return Promise.resolve();
    return tcc.saveCustomization(tcc.getTrayLayoutV2()).then(function () {
      dirty = false;
      var badge = $('softPadTrayEditorDirty');
      if (badge) badge.hidden = true;
    }).catch(function (err) {
      var msg = (err && err.message) || String(err || '');
      if (msg.indexOf('trayEditorMinBlocks') >= 0) {
        alert(t('trayEditorMinBlocks', '至少保留一个区块'));
      }
    });
  }

  function reset() {
    var v2 = V2();
    var tcc = TCC();
    if (!v2 || !tcc) return;
    tcc.setTrayLayoutV2(v2.defaultLayout());
    notifyChange();
    render();
  }

  function setFocus(channel) {
    focusChannel = channel || null;
    render();
  }

  global.OneToneTrayLayoutEditor = {
    mount: mount,
    render: render,
    save: save,
    reset: reset,
    setFocus: setFocus,
    isDirty: function () { return dirty; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
