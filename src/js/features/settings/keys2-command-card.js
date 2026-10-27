/**
 * keys2 — read-only command×channel summary → Habits hub.
 * Uses OneToneHabitCommandLink.buildModel / commandIdentity. Never writes mappings.
 */
(function (global) {
  'use strict';

  var ROOT_ID = 'keys2CommandCardRoot';
  var selected = '';
  var mounted = false;

  function $(id) {
    return document.getElementById(id);
  }

  function root() {
    var sheet = $('keys2CommandSheet');
    if (sheet && !sheet.hidden) {
      var sheetRoot = $('keys2SheetCardRoot');
      if (sheetRoot) return sheetRoot;
    }
    return $(ROOT_ID);
  }

  function esc(s) {
    if (global.OneToneDom && global.OneToneDom.esc) return global.OneToneDom.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function Link() {
    return global.OneToneHabitCommandLink;
  }

  function mappingById(id) {
    id = String(id || '').trim();
    if (!id) return null;
    var core = global.OneToneMappingCore;
    if (core && core.byId) {
      var hit = core.byId(id);
      if (hit) return hit;
    }
    var st = global.OneToneState && global.OneToneState.state;
    var cfg = (st && st.config) || {};
    var maps = Array.isArray(cfg.mappings) ? cfg.mappings : [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && String(maps[i].id) === id) return maps[i];
    }
    return null;
  }

  function mappingHasMatchCmds(m) {
    if (!m) return false;
    var binds = Array.isArray(m.agentBindings) ? m.agentBindings : [];
    var bi;
    for (bi = 0; bi < binds.length; bi++) {
      var b = binds[bi];
      if (b && b.enabled !== false && String(b.triggerBinding || '').trim()) return true;
    }
    var keys =
      m.codexMicroPad && Array.isArray(m.codexMicroPad.keys) ? m.codexMicroPad.keys : [];
    var ki;
    for (ki = 0; ki < keys.length; ki++) {
      var k = keys[ki];
      if (k && k.enabled !== false && String(k.microKeyId || '').trim() && String(k.slotId || '').trim()) {
        return true;
      }
    }
    var oral = m.oralCommandScheme && m.oralCommandScheme.items;
    if (oral && typeof oral === 'object') {
      var oid;
      for (oid in oral) {
        if (!Object.prototype.hasOwnProperty.call(oral, oid)) continue;
        var ov = oral[oid];
        if (ov && ov.enabled !== false && String(ov.say || '').trim()) return true;
      }
    }
    var cam = m.cameraOverride;
    if (cam && typeof cam === 'object') {
      var ck;
      for (ck in cam) {
        if (Object.prototype.hasOwnProperty.call(cam, ck) && String(cam[ck] || '').trim()) return true;
      }
    }
    return false;
  }

  /**
   * Prefer edit selection (if it has L matches) → 正在使用 → Soft Pad 当前方案 → first mapping.
   * Avoids「selected 空习惯」盖住当前应用方案，导致「此习惯暂无匹配命令」。
   */
  function currentMapping() {
    var st = global.OneToneState && global.OneToneState.state;
    var cfg = (st && st.config) || {};
    var sel = mappingById(st && st.selectedMappingId);
    var active = mappingById(cfg.activeSceneId || (st && st.activeSceneId));
    var soft = null;
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.resolveSoftPadEntry === 'function') {
        var entry = Hub.resolveSoftPadEntry();
        if (entry && entry.mapping) soft = entry.mapping;
      }
    } catch (_) {}
    if (sel && mappingHasMatchCmds(sel)) return sel;
    if (active && mappingHasMatchCmds(active)) return active;
    if (soft && mappingHasMatchCmds(soft)) return soft;
    if (sel) return sel;
    if (active) return active;
    if (soft) return soft;
    var maps = Array.isArray(cfg.mappings) ? cfg.mappings : [];
    return maps[0] || null;
  }

  function buildModel(mapping) {
    var api = Link();
    if (api && typeof api.buildModel === 'function') return api.buildModel(mapping);
    return { mappingId: mapping && mapping.id ? String(mapping.id) : '', commands: [] };
  }

  function cmdRef(c) {
    var api = Link();
    if (api && typeof api.commandIdentity === 'function') return api.commandIdentity(c);
    if (c && c.commandRef) return c.commandRef;
    return c && c.actionId ? 'action:' + c.actionId : (c && c.slotId) || '';
  }

  function badgeLabel(st) {
    var api = Link();
    if (api && api.stateBadgeLabel) return api.stateBadgeLabel(st);
    if (st === 'bound') return '已绑定';
    if (st === 'deep-link') return '去按键页录制';
    if (st === 'readonly') return '由按键页管理';
    if (st === 'inherited') return '继承自通用';
    return '未配置';
  }

  function lightsHtml(c) {
    var ch = (c && c.channels) || {};
    function on(v) {
      return v && (v.state === 'bound' || v.state === 'deep-link' || v.state === 'inherited');
    }
    return (
      '<span class="keys2-light' + (on(ch.pad) ? ' on pad' : '') + '"><span class="dot"></span>屏幕</span>' +
      '<span class="keys2-light' + (on(ch.key) ? ' on keys' : '') + '"><span class="dot"></span>键</span>' +
      '<span class="keys2-light' + (on(ch.voice) ? ' on voice' : '') + '"><span class="dot"></span>口头</span>' +
      '<span class="keys2-light' + (on(ch.camera) ? ' on cam' : '') + '"><span class="dot"></span>摄像</span>'
    );
  }

  function goHabits(opts) {
    opts = opts || {};
    closeSheet();
    var m = currentMapping();
    var mid = String((m && m.id) || opts.mappingId || '').trim();
    var ref = String(opts.commandRef || opts.matchCommand || selected || '').trim();
    var api = Link();
    if (api && typeof api.openHabitsMatch === 'function') {
      api.openHabitsMatch({
        mappingId: mid,
        matchChannel: opts.matchChannel || 'key',
        commandRef: ref,
        matchCommand: ref,
        openMatchEditor: true,
        returnPanel: 'habits',
        // Prefer channel grid in habit right pane (keys2 directory removed).
      });
      try {
        var stUi = global.OneToneState && global.OneToneState.ui;
        if (stUi) {
          stUi.habitShellMode = 'commands';
          stUi.habitDetailPane = 'lanes';
        }
      } catch (_) {}
      return;
    }
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && typeof drawer.open === 'function') {
      drawer.open({
        panel: 'habits',
        mappingId: mid,
        matchChannel: opts.matchChannel || 'key',
        commandRef: ref,
        matchCommand: ref,
        openMatchEditor: true,
        habitShellMode: 'commands',
        habitDetailPane: 'lanes'
      });
    }
  }

  function shellHtml() {
    return (
      '<div class="keys2-brief">' +
      '<p>只读摘要（投影自习惯）。匹配写入在<strong>习惯</strong>中枢；本页不提供编辑。</p>' +
      '<div class="keys2-chips">' +
      '<span>摘要 → 习惯</span><span>灯 = 通道状态</span><span>只读</span>' +
      '</div>' +
      '<div class="keys2-actions" style="margin-top:10px">' +
      '<button type="button" class="keys2-btn primary" data-k2-go-habits="1">去习惯 · 命令视图</button>' +
      '</div></div>' +
      '<div class="keys2-frame">' +
      '<div class="keys2-scope">' +
      '<span class="brand">本习惯命令</span>' +
      '<span class="keys2-pill" id="keys2ScopeName">—</span>' +
      '<span class="help">只读摘要 · 写入在习惯页</span>' +
      '</div>' +
      '<div class="keys2-desk">' +
      '<aside class="keys2-rail">' +
      '<div class="lbl">命令列表</div>' +
      '<div id="keys2CmdList"></div>' +
      '<div class="keys2-hint"><b>状态：</b>已绑定 / 未配置 / 去通道页 · 点「去习惯」打开中枢。</div>' +
      '</aside>' +
      '<div class="keys2-mid">' +
      '<div class="keys2-hero">' +
      '<div class="ico" id="keys2HeroIco">—</div>' +
      '<div class="meta"><h2 id="keys2HeroTitle">选择一条命令</h2><p id="keys2HeroSub">只读 · 不写配置</p></div>' +
      '<div class="keys2-ask" id="keys2HeroAsk">通道状态</div>' +
      '</div>' +
      '<div class="keys2-sync"><span class="pulse" aria-hidden="true"></span><strong>只读</strong><span id="keys2SyncText">投影自 OneToneHabitCommandLink.buildModel</span></div>' +
      '<div class="keys2-lanes" id="keys2DetailLanes">' +
      '<p class="keys2-empty" style="display:block;padding:12px;color:var(--k2-faint,#8a93a3)">点左侧命令查看通道状态。</p>' +
      '</div>' +
      '<div class="keys2-actions" style="margin-top:12px">' +
      '<button type="button" class="keys2-btn primary" data-k2-go-habits="1" data-k2-edit-selected="1">在习惯中打开此命令</button>' +
      '</div>' +
      '</div></div></div>'
    );
  }

  function selectedCmd(model) {
    var list = (model && model.commands) || [];
    if (!list.length) return null;
    if (selected) {
      for (var i = 0; i < list.length; i++) {
        if (cmdRef(list[i]) === selected || list[i].actionId === selected || list[i].slotId === selected) {
          return list[i];
        }
      }
    }
    return list[0];
  }

  function renderList(model) {
    var host = $('keys2CmdList');
    if (!host) return;
    var list = (model && model.commands) || [];
    if (!list.length) {
      host.innerHTML = '<p class="keys2-empty" style="display:block;padding:8px">此习惯暂无匹配命令</p>';
      return;
    }
    var cur = selectedCmd(model);
    if (cur) selected = cmdRef(cur);
    host.innerHTML = list
      .map(function (c) {
        var ref = cmdRef(c);
        return (
          '<button type="button" class="keys2-cmd' +
          (ref === selected ? ' is-on' : '') +
          '" data-k2-cmd="' +
          esc(ref) +
          '"><span class="nm">' +
          esc(c.label || ref) +
          '</span><span class="keys2-lights">' +
          lightsHtml(c) +
          '</span></button>'
        );
      })
      .join('');
  }

  function laneHtml(title, chView, laneCls) {
    chView = chView || { state: 'empty', value: '' };
    var st = chView.state || 'empty';
    var txt = chView.value ? String(chView.value) : badgeLabel(st);
    return (
      '<div class="keys2-lane ' +
      laneCls +
      '"><div class="hd"><h3>' +
      esc(title) +
      '</h3><span class="keys2-st ' +
      (st === 'empty' ? 'off' : 'on') +
      '"><span class="dot"></span><span class="txt">' +
      esc(txt) +
      '</span></span></div>' +
      '<p class="keys2-owner">' +
      esc(badgeLabel(st)) +
      (chView.owner ? ' · ' + esc(chView.owner) : '') +
      '</p></div>'
    );
  }

  function renderDetail(c) {
    var host = $('keys2DetailLanes');
    var title = $('keys2HeroTitle');
    var sub = $('keys2HeroSub');
    var ico = $('keys2HeroIco');
    var ask = $('keys2HeroAsk');
    if (!c) {
      if (title) title.textContent = '选择一条命令';
      if (sub) sub.textContent = '只读 · 不写配置';
      if (ico) ico.textContent = '—';
      if (ask) ask.textContent = '通道状态';
      if (host) {
        host.innerHTML =
          '<p class="keys2-empty" style="display:block;padding:12px;color:var(--k2-faint,#8a93a3)">点左侧命令查看通道状态。</p>';
      }
      return;
    }
    if (!c.channels && Link() && Link().buildModel) {
      /* channels should already be on buildModel rows */
    }
    var ch = c.channels || {};
    if (title) title.textContent = c.label || c.actionId || c.slotId;
    if (sub) sub.textContent = cmdRef(c);
    if (ico) ico.textContent = String(c.label || '?').slice(0, 1);
    var n = 0;
    ['voice', 'key', 'pad', 'camera'].forEach(function (k) {
      var v = ch[k];
      if (v && v.state !== 'empty') n++;
    });
    if (ask) ask.textContent = n + ' / 4 通道有状态';
    if (!host) return;
    host.innerHTML =
      laneHtml('屏幕', ch.pad, 'pad') +
      laneHtml('实体键', ch.key, 'keys') +
      laneHtml('口头', ch.voice, 'voice') +
      laneHtml('摄像头', ch.camera, 'cam');
  }

  function refresh() {
    var m = currentMapping();
    var model = buildModel(m);
    var scope = $('keys2ScopeName');
    if (scope) {
      scope.textContent = m
        ? String(m.group || m.label || m.appTargetId || m.id || '习惯')
        : '无习惯';
    }
    renderList(model);
    renderDetail(selectedCmd(model));
  }

  function onRootClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('[data-k2-go-habits]')) {
      e.preventDefault();
      goHabits({
        commandRef: t.closest('[data-k2-edit-selected]') ? selected : ''
      });
      return;
    }
    var cmdBtn = t.closest('[data-k2-cmd]');
    if (cmdBtn) {
      selected = cmdBtn.getAttribute('data-k2-cmd') || '';
      refresh();
    }
  }

  function bindHost(host) {
    if (!host || host.__keys2Bound) return;
    host.__keys2Bound = true;
    host.addEventListener('click', onRootClick);
  }

  function mountInto(host) {
    if (!host) return;
    host.innerHTML = shellHtml();
    bindHost(host);
    refresh();
  }

  function mount() {
    var host = root();
    if (!host) return;
    if (!mounted || !host.firstChild) {
      mountInto(host);
      mounted = true;
    } else {
      refresh();
    }
  }

  function ensureSheet() {
    var sheet = $('keys2CommandSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'keys2CommandSheet';
    sheet.className = 'keys2-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', '习惯通道 · 只读摘要');
    sheet.innerHTML =
      '<div class="keys2-sheet-backdrop" data-k2-sheet-close="1"></div>' +
      '<div class="keys2-sheet-panel">' +
      '<header class="keys2-sheet-head">' +
      '<div><strong>习惯 · 通道摘要（只读）</strong>' +
      '<p>摘要来自习惯投影；编辑请到习惯中枢</p></div>' +
      '<button type="button" class="keys2-sheet-close" data-k2-sheet-close="1" aria-label="关闭">×</button>' +
      '</header>' +
      '<div class="keys2-root" id="keys2SheetCardRoot"></div>' +
      '</div>';
    document.body.appendChild(sheet);
    sheet.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-k2-sheet-close]')) closeSheet();
    });
    return sheet;
  }

  function openSheet(opts) {
    opts = opts || {};
    if (opts.actionId) selected = String(opts.actionId);
    if (opts.commandRef) selected = String(opts.commandRef);
    if (opts.matchCommand) selected = String(opts.matchCommand);
    goHabits({
      mappingId: opts.mappingId,
      matchChannel: opts.matchChannel || 'key',
      commandRef: selected
    });
  }

  function closeSheet() {
    var sheet = $('keys2CommandSheet');
    if (sheet) sheet.hidden = true;
    document.documentElement.classList.remove('keys2-sheet-open');
  }

  function isSheetOpen() {
    var sheet = $('keys2CommandSheet');
    return !!(sheet && !sheet.hidden);
  }

  global.OneToneKeys2CommandCard = {
    mount: mount,
    refresh: refresh,
    openSheet: openSheet,
    closeSheet: closeSheet,
    isSheetOpen: isSheetOpen,
    goHabits: goHabits,
    ensureSheet: ensureSheet,
    READ_ONLY: true
  };
})(typeof window !== 'undefined' ? window : globalThis);
