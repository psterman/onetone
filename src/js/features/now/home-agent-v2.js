/**
 * OneToneHomeAgentV2 — new home workbench view.
 * Incremental paint: agent updates never rebuild the draft textarea or destroy focus.
 */
(function (global) {
  'use strict';

  var root = null;
  var mounted = false;
  var unsubStore = null;
  var shellBuilt = false;
  var matMenuOpen = false;
  var draftSel = { start: 0, end: 0 };

  function t(key, fallback) {
    if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function store() {
    return global.OneToneHomeAgentV2Store;
  }

  function dock() {
    return global.OneToneHomeDockBridge;
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    return ipc && ipc.invoke
      ? ipc.invoke(cmd, args || {})
      : Promise.reject(new Error('ipc_unavailable'));
  }

  function iconHtml(cat, cls) {
    cls = cls || 'ha2-icon';
    if (cat && cat.icon) {
      return (
        '<span class="' +
        cls +
        ' ha2-icon--img"><img src="' +
        esc(cat.icon) +
        '" alt="" decoding="async" /></span>'
      );
    }
    return (
      '<span class="' +
      cls +
      ' ha2-icon--fallback" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 3 3v2a7 7 0 0 1-14 0V10a3 3 0 0 1 3-3h1V6a4 4 0 0 1 4-4zm-1 9a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm4 0a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg></span>'
    );
  }

  function can(actions, id) {
    if (!Array.isArray(actions)) return false;
    for (var i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].id === id && actions[i].enabled !== false) return true;
    }
    return false;
  }

  function statusTone(status) {
    if (/needs|waiting|approval|needsinput/.test(status)) return 'wait';
    if (/working|running|active/.test(status)) return 'live';
    if (/fail|error/.test(status)) return 'fail';
    return '';
  }

  function currentCat(snap) {
    var S = store();
    var kind = (snap && snap.selectedKind) || 'codex';
    return (S && S.catalog && S.catalog(kind)) || { id: kind, name: kind, appId: '', icon: '' };
  }

  function emptyListHtml(snap) {
    if (snap.loadPhase === 'loading') {
      return (
        '<div class="ha2-empty" data-ha2-phase="loading">' +
        esc(t('ha2LoadingAgents', '正在确认 Agent 状态…')) +
        '</div>'
      );
    }
    if (snap.loadPhase === 'error') {
      return (
        '<div class="ha2-empty" data-ha2-phase="error">' +
        esc(t('ha2LoadFailed', '无法加载 Agent 数据')) +
        ' <button type="button" class="ha2-link" data-ha2-refresh>' +
        esc(t('ha2Retry', '重试')) +
        '</button></div>'
      );
    }
    var stale =
      snap.loadPhase === 'stale'
        ? '<div class="ha2-stale">' + esc(t('ha2ShowingStale', '显示上次可信快照，正在刷新…')) + '</div>'
        : '';
    return (
      stale +
      '<div class="ha2-empty">' +
      esc(t('ha2EmptyAgents', '尚未发现 Agent 工作区。你仍可从下方选择目标并发送。')) +
      '</div>'
    );
  }

  function rowHtml(r) {
    var st = statusTone(r.status);
    var acts = [];
    if (can(r.actions, 'approval.reject')) {
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-action="approval.reject" data-agent="' +
          esc(r.agentId) +
          '">' +
          esc(t('ha2Reject', '拒绝')) +
          '</button>'
      );
    }
    if (can(r.actions, 'approval.approve')) {
      acts.push(
        '<button type="button" class="ha2-btn primary" data-ha2-action="approval.approve" data-agent="' +
          esc(r.agentId) +
          '">' +
          esc(t('ha2Approve', '批准')) +
          '</button>'
      );
    }
    if (can(r.actions, 'agent.focus')) {
      acts.push(
        '<button type="button" class="ha2-btn" data-ha2-action="agent.focus" data-agent="' +
          esc(r.agentId) +
          '">' +
          esc(t('ha2Focus', '聚焦')) +
          '</button>'
      );
    }
    if (can(r.actions, 'session.resume')) {
      acts.push(
        '<button type="button" class="ha2-btn primary" data-ha2-action="session.resume" data-agent="' +
          esc(r.agentId) +
          '">' +
          esc(t('ha2Continue', '继续')) +
          '</button>'
      );
    }
    var S = store();
    var win = S && S.windowsLabel ? S.windowsLabel(r.kind) : '';
    return (
      '<article class="ha2-row" data-ha2-agent="' +
      esc(r.kind) +
      '">' +
      iconHtml(r.cat) +
      '<div><div class="ha2-row-title"><i class="ha2-dot ' +
      st +
      '"></i><b>' +
      esc(r.cat.name + ' · ' + r.project) +
      '</b></div><div class="ha2-meta">' +
      esc(win) +
      '</div><div class="ha2-note">' +
      esc(r.title) +
      '</div></div><div class="ha2-actions">' +
      acts.join('') +
      '<button type="button" class="ha2-btn" data-ha2-detail="' +
      esc(r.kind) +
      '">›</button></div></article>'
    );
  }

  function listHtml(snap) {
    var rows = (store() && store().workRows && store().workRows(3)) || snap.agents.slice(0, 3);
    if (!rows.length) return emptyListHtml(snap);
    var stale =
      snap.loadPhase === 'stale'
        ? '<div class="ha2-stale">' + esc(t('ha2ShowingStale', '显示上次可信快照，正在刷新…')) + '</div>'
        : '';
    return stale + rows.map(rowHtml).join('');
  }

  function ticketHtml(snap) {
    var attention = snap.attention;
    var rows =
      (attention && (attention.signals || attention.items || attention.needsInput || attention.rows)) ||
      [];
    if (!Array.isArray(rows) || !rows.length) return '';
    var x = rows[0] || {};
    return (
      '<div class="ha2-ticket"><span class="ha2-receipt-mark ha2-warn">!</span><div class="ha2-grow"><b>' +
      esc(x.title || t('ha2NeedsYou', '需要你处理')) +
      '</b><small>' +
      esc(x.message || x.detail || x.cause || t('ha2NeedsYouHint', '打开详情查看请求')) +
      '</small></div><button type="button" class="ha2-btn" data-ha2-open-center>' +
      esc(t('ha2View', '查看')) +
      '</button></div>'
    );
  }

  function receiptHtml(snap) {
    var receipt = snap.receipt;
    if (!receipt) return '';
    var mark = receipt.phase === 'sending' ? '…' : receipt.phase === 'failed' ? '!' : '✓';
    return (
      '<div class="ha2-receipt" data-phase="' +
      esc(receipt.phase) +
      '"><span class="ha2-receipt-mark">' +
      mark +
      '</span><div class="ha2-grow"><b>' +
      esc(receipt.title) +
      '</b><small>' +
      esc(receipt.message) +
      '</small></div>' +
      (receipt.phase === 'failed'
        ? '<button type="button" class="ha2-btn" data-ha2-retry>' +
          esc(t('ha2Retry', '重试')) +
          '</button>'
        : '') +
      '</div>'
    );
  }

  function homeContentHtml(snap) {
    var rows = (store() && store().workRows && store().workRows(3)) || snap.agents.slice(0, 3);
    var S = store();
    var c = currentCat(snap);
    var win = S && S.windowsLabel ? S.windowsLabel(c.id) : '';
    return (
      '<div class="ha2-head"><div><h1>' +
      esc(t('ha2HomeTitle', '继续正在推进的工作')) +
      '</h1><p>' +
      esc(t('ha2HomeSub', 'Agent、项目和需要你处理的事情都在这里。')) +
      '</p></div><button type="button" class="ha2-link" data-ha2-picker>' +
      esc(t('ha2PickAgent', '选择 Agent')) +
      '</button></div><div class="ha2-permission"><b>' +
      esc(t('ha2WinCapability', 'Windows 投递能力')) +
      '</b><span data-ha2-win-label>' +
      esc(win) +
      '</span><button type="button" class="ha2-btn" data-ha2-refresh>' +
      esc(t('ha2Redetect', '重新检测')) +
      '</button></div><div class="ha2-section-head"><h2>' +
      esc(t('ha2Workspace', '工作区')) +
      '</h2><span data-ha2-active-count>' +
      rows.length +
      ' ' +
      esc(t('ha2ActiveCount', '个正在活动')) +
      '</span><button type="button" class="ha2-link" data-ha2-open-center>' +
      esc(t('ha2ViewAll', '查看全部')) +
      '</button></div><div class="ha2-list" data-ha2-list>' +
      listHtml(snap) +
      '</div><div data-ha2-ticket>' +
      ticketHtml(snap) +
      '</div><div data-ha2-receipt>' +
      receiptHtml(snap) +
      '</div>'
    );
  }

  function detailContentHtml(snap) {
    var c = currentCat(snap);
    var agent = null;
    for (var i = 0; i < snap.agents.length; i++) {
      if (snap.agents[i].kind === c.id) {
        agent = snap.agents[i];
        break;
      }
    }
    var S = store();
    var win = S && S.windowsLabel ? S.windowsLabel(c.id) : '';
    var sessions = (agent && agent.sessions) || [];
    var a = agent || { actions: [], agentId: '' };
    return (
      '<div class="ha2-head"><div><h1>' +
      esc(c.name) +
      '</h1><p>' +
      esc(t('ha2DetailSub', '当前工作、会话和现有 Agent 控制能力。')) +
      '</p></div><button type="button" class="ha2-link" data-ha2-home>' +
      esc(t('ha2Close', '关闭')) +
      '</button></div><div class="ha2-detail"><div class="ha2-detail-hero">' +
      iconHtml(c) +
      '<div><h2>' +
      esc(c.name) +
      '</h2><p>' +
      esc(win) +
      '</p></div><div class="ha2-actions">' +
      (can(a.actions, 'agent.focus')
        ? '<button type="button" class="ha2-btn" data-ha2-action="agent.focus" data-agent="' +
          esc(a.agentId) +
          '">' +
          esc(t('ha2Focus', '聚焦')) +
          '</button>'
        : '') +
      (can(a.actions, 'session.resume')
        ? '<button type="button" class="ha2-btn primary" data-ha2-action="session.resume" data-agent="' +
          esc(a.agentId) +
          '">' +
          esc(t('ha2ContinueWork', '继续工作')) +
          '</button>'
        : '') +
      (can(a.actions, 'agent.interrupt')
        ? '<button type="button" class="ha2-btn warn" data-ha2-action="agent.interrupt" data-agent="' +
          esc(a.agentId) +
          '">' +
          esc(t('ha2Interrupt', '中断')) +
          '</button>'
        : '') +
      '</div></div><div class="ha2-sessions"><b>' +
      esc(t('ha2RecentSessions', '最近会话')) +
      '</b>' +
      (sessions.length
        ? sessions
            .slice(0, 5)
            .map(function (s) {
              return (
                '<div class="ha2-session"><b>' +
                esc(s.title || s.sessionId || t('ha2UnnamedSession', '未命名会话')) +
                '</b><small>' +
                esc(s.status || '') +
                '</small></div>'
              );
            })
            .join('')
        : '<div class="ha2-empty">' + esc(t('ha2NoSessions', '没有可确认的会话记录')) + '</div>') +
      '<button type="button" class="ha2-link" data-ha2-open-center>' +
      esc(t('ha2OpenAgentCenter', '在 Agent Center 查看完整能力 ›')) +
      '</button></div></div>'
    );
  }

  function capClass(cap) {
    var st = (cap && cap.state) || 'off';
    if (st === 'on') return 'ha2-cap on';
    if (st === 'pending') return 'ha2-cap pending';
    if (st === 'error' || (cap && cap.error)) return 'ha2-cap error';
    if (st === 'unavailable') return 'ha2-cap unavailable';
    return 'ha2-cap';
  }

  function attachmentsHtml(snap) {
    var mats = snap.materials || [];
    if (!mats.length) return '';
    return (
      '<div class="ha2-attachments" data-ha2-attachments>' +
      mats
        .map(function (x) {
          return (
            '<button type="button" class="ha2-attachment" data-ha2-remove="' +
            esc(x.id) +
            '">' +
            esc(x.name || t('ha2Attachment', '附件')) +
            ' ×</button>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function matMenuHtml() {
    if (!matMenuOpen) return '';
    return (
      '<div class="ha2-mat-menu" data-ha2-mat-menu role="menu">' +
      '<button type="button" data-ha2-mat="file">' +
      esc(t('ha2MatFile', '文件')) +
      '</button>' +
      '<button type="button" data-ha2-mat="image">' +
      esc(t('ha2MatImage', '图片')) +
      '</button>' +
      '<button type="button" data-ha2-mat="screenshot">' +
      esc(t('ha2MatScreenshot', '截图')) +
      '</button>' +
      '<button type="button" data-ha2-mat="paste">' +
      esc(t('ha2MatPaste', '粘贴内容')) +
      '</button></div>'
    );
  }

  function dockStaticHtml(snap) {
    var c = currentCat(snap);
    var caps = snap.capabilities || {};
    var catalog = snap.catalog || [];
    var quick = catalog.slice(0, 4);
    var appId = c.appId || '';
    var aim = (snap.aimByAppId && snap.aimByAppId[appId]) || {};
    var hasAim = !!aim.hasActive;
    return (
      '<div class="ha2-dock-zone"><section class="ha2-dock ha2-drop" data-ha2-drop><div class="ha2-dock-top"><button type="button" class="ha2-chip target" data-ha2-picker>' +
      iconHtml(c, 'ha2-chip-icon') +
      esc(c.name) +
      '⌄</button><span class="ha2-chip keys" data-ha2-soft-chip hidden>' +
      esc(t('ha2SoftPadOn', '软键盘常开')) +
      '</span>' +
      (snap.materials && snap.materials.length
        ? '<span class="ha2-chip saved">' + esc(t('ha2Saved', '已存')) + '</span>'
        : '') +
      '<div class="ha2-aim"><span data-ha2-aim-label>' +
      esc(hasAim ? t('ha2AimCustom', '已自定义') : t('ha2AimDefault', '默认')) +
      '</span><button type="button" data-ha2-aim>' +
      esc(hasAim ? t('ha2AimChange', '更改位置') : t('ha2AimNow', '现在定位')) +
      '</button><button type="button" data-ha2-aim-clear' +
      (hasAim ? '' : ' hidden') +
      '>' +
      esc(t('ha2AimClear', '清除')) +
      '</button></div></div><textarea class="ha2-editor" data-ha2-draft placeholder="' +
      esc(t('ha2DraftPlaceholder', '写给') + ' ' + c.name + '…') +
      '"></textarea><div data-ha2-attach-host>' +
      attachmentsHtml(snap) +
      '</div><div class="ha2-dock-bottom"><div class="ha2-add-wrap"><button type="button" class="ha2-round" data-ha2-add title="' +
      esc(t('ha2AddMaterial', '加入材料')) +
      '">+</button>' +
      matMenuHtml() +
      '</div><i class="ha2-divider"></i><button type="button" class="' +
      capClass(caps.softPad) +
      '" data-ha2-cap="softPad">' +
      esc(t('ha2SoftPad', '软键盘')) +
      '</button><button type="button" class="' +
      capClass(caps.voice) +
      '" data-ha2-cap="voice">' +
      esc(t('ha2Voice', '语音')) +
      '</button><button type="button" class="' +
      capClass(caps.camera) +
      '" data-ha2-cap="camera">' +
      esc(t('ha2Camera', '摄像头')) +
      '</button><span class="ha2-spacer"></span><div class="ha2-quick" data-ha2-quick>' +
      quick
        .map(function (a) {
          return (
            '<button type="button" class="ha2-agent-btn ' +
            (a.id === snap.selectedKind ? 'on' : '') +
            '" data-ha2-pick="' +
            esc(a.id) +
            '" title="' +
            esc(a.name) +
            '">' +
            iconHtml(a, 'ha2-agent-icon') +
            '</button>'
          );
        })
        .join('') +
      '</div><button type="button" class="ha2-agent-btn more" data-ha2-picker>···</button><button type="button" class="ha2-send" data-ha2-send ' +
      (!String(snap.draft || '').trim() && !(snap.materials && snap.materials.length) ? 'disabled' : '') +
      ' title="' +
      esc(t('ha2Send', '发送')) +
      '">↑</button></div></section></div>'
    );
  }

  function pickerHtml(snap) {
    if (!snap.pickerOpen) return '';
    var catalog = snap.catalog || [];
    return (
      '<aside class="ha2-picker" data-ha2-picker-panel><div class="ha2-picker-head"><b>' +
      esc(t('ha2PickTarget', '选择发送目标')) +
      '</b><span>' +
      esc(t('ha2PickHint', '点图标只切换目标')) +
      '</span><button type="button" class="ha2-link" data-ha2-picker-close>×</button></div><div class="ha2-grid">' +
      catalog
        .map(function (a) {
          return (
            '<button type="button" class="' +
            (a.id === snap.selectedKind ? 'on' : '') +
            '" data-ha2-pick="' +
            esc(a.id) +
            '">' +
            iconHtml(a) +
            esc(a.name) +
            '</button>'
          );
        })
        .join('') +
      '</div></aside>'
    );
  }

  function ensureShell(snap) {
    if (!root) return;
    if (!shellBuilt) {
      root.className = 'now-home is-home-agent-v2';
      root.innerHTML =
        '<div class="ha2-shell"><header class="ha2-top"><div class="ha2-crumb" data-ha2-crumb></div></header><main class="ha2-main"><div class="ha2-content" data-ha2-content></div></main><div data-ha2-picker-host></div><div data-ha2-dock-host></div></div>';
      shellBuilt = true;
      var dockHost = root.querySelector('[data-ha2-dock-host]');
      if (dockHost) dockHost.innerHTML = dockStaticHtml(snap);
      var ta = root.querySelector('[data-ha2-draft]');
      if (ta) ta.value = snap.draft || '';
    }
  }

  function patchCrumb(snap) {
    var el = root && root.querySelector('[data-ha2-crumb]');
    if (!el) return;
    if (snap.view === 'agent') {
      var c = currentCat(snap);
      el.innerHTML =
        '<button type="button" data-ha2-home>' +
        esc(t('ha2Home', '首页')) +
        '</button><span>›</span><b>' +
        esc(c.name) +
        '</b><span>›</span><button type="button" data-ha2-home>' +
        esc(t('ha2Close', '关闭')) +
        '</button>';
    } else {
      el.innerHTML = '<b>' + esc(t('ha2Home', '首页')) + '</b>';
    }
  }

  function patchContent(snap, force) {
    var el = root && root.querySelector('[data-ha2-content]');
    if (!el) return;
    var key = snap.view + ':' + (snap.view === 'agent' ? snap.selectedKind : 'home');
    if (!force && el.getAttribute('data-ha2-view-key') === key && snap.view === 'home') {
      var list = el.querySelector('[data-ha2-list]');
      if (list) list.innerHTML = listHtml(snap);
      var ticket = el.querySelector('[data-ha2-ticket]');
      if (ticket) ticket.innerHTML = ticketHtml(snap);
      var receipt = el.querySelector('[data-ha2-receipt]');
      if (receipt) receipt.innerHTML = receiptHtml(snap);
      var win = el.querySelector('[data-ha2-win-label]');
      if (win && store()) win.textContent = store().windowsLabel(currentCat(snap).id);
      var count = el.querySelector('[data-ha2-active-count]');
      if (count) {
        var n = ((store() && store().workRows && store().workRows(3)) || []).length;
        count.textContent = n + ' ' + t('ha2ActiveCount', '个正在活动');
      }
      return;
    }
    el.setAttribute('data-ha2-view-key', key);
    el.innerHTML = snap.view === 'agent' ? detailContentHtml(snap) : homeContentHtml(snap);
  }

  function patchDockMeta(snap) {
    if (!root) return;
    var dockHost = root.querySelector('[data-ha2-dock-host]');
    if (!dockHost) return;
    var ta = root.querySelector('[data-ha2-draft]');
    var focused = ta && document.activeElement === ta;
    if (focused) {
      try {
        draftSel.start = ta.selectionStart;
        draftSel.end = ta.selectionEnd;
      } catch (_) {}
    }

    var c = currentCat(snap);
    var chip = root.querySelector('.ha2-chip.target');
    if (chip) {
      chip.innerHTML = iconHtml(c, 'ha2-chip-icon') + esc(c.name) + '⌄';
    }
    if (ta && !focused) {
      var next = snap.draft || '';
      if (ta.value !== next) ta.value = next;
      ta.placeholder = t('ha2DraftPlaceholder', '写给') + ' ' + c.name + '…';
    }
    var attachHost = root.querySelector('[data-ha2-attach-host]');
    if (attachHost) attachHost.innerHTML = attachmentsHtml(snap);

    var caps = snap.capabilities || {};
    ['softPad', 'voice', 'camera'].forEach(function (k) {
      var btn = root.querySelector('[data-ha2-cap="' + k + '"]');
      if (btn) btn.className = capClass(caps[k]);
    });
    var softChip = root.querySelector('[data-ha2-soft-chip]');
    if (softChip) softChip.hidden = !(caps.softPad && caps.softPad.state === 'on');

    var appId = c.appId || '';
    var aim = (snap.aimByAppId && snap.aimByAppId[appId]) || {};
    var hasAim = !!aim.hasActive;
    var aimLabel = root.querySelector('[data-ha2-aim-label]');
    var aimBtn = root.querySelector('[data-ha2-aim]');
    var aimClear = root.querySelector('[data-ha2-aim-clear]');
    if (aimLabel) aimLabel.textContent = hasAim ? t('ha2AimCustom', '已自定义') : t('ha2AimDefault', '默认');
    if (aimBtn) aimBtn.textContent = hasAim ? t('ha2AimChange', '更改位置') : t('ha2AimNow', '现在定位');
    if (aimClear) aimClear.hidden = !hasAim;

    var sendBtn = root.querySelector('[data-ha2-send]');
    if (sendBtn) {
      sendBtn.disabled = !String(snap.draft || (ta && ta.value) || '').trim() && !(snap.materials && snap.materials.length);
    }

    var quick = root.querySelector('[data-ha2-quick]');
    if (quick) {
      var catalog = (snap.catalog || []).slice(0, 4);
      quick.innerHTML = catalog
        .map(function (a) {
          return (
            '<button type="button" class="ha2-agent-btn ' +
            (a.id === snap.selectedKind ? 'on' : '') +
            '" data-ha2-pick="' +
            esc(a.id) +
            '" title="' +
            esc(a.name) +
            '">' +
            iconHtml(a, 'ha2-agent-icon') +
            '</button>'
          );
        })
        .join('');
    }

    var addWrap = root.querySelector('.ha2-add-wrap');
    if (addWrap) {
      var menu = addWrap.querySelector('[data-ha2-mat-menu]');
      if (matMenuOpen && !menu) {
        addWrap.insertAdjacentHTML('beforeend', matMenuHtml());
      } else if (!matMenuOpen && menu) {
        menu.remove();
      }
    }

    var pickerHost = root.querySelector('[data-ha2-picker-host]');
    if (pickerHost) pickerHost.innerHTML = pickerHtml(snap);

    if (focused && ta) {
      try {
        ta.focus();
        ta.selectionStart = draftSel.start;
        ta.selectionEnd = draftSel.end;
      } catch (_) {}
    }
  }

  var lastView = '';

  function paint(snap) {
    if (!root || !snap) return;
    // Silent sync — never emit from inside a store subscriber paint.
    if (dock() && dock().syncCapabilityStates) {
      dock().syncCapabilityStates({ silent: true });
    }
    snap = store().getSnapshot();
    ensureShell(snap);
    var viewChanged = lastView !== snap.view;
    lastView = snap.view;
    patchCrumb(snap);
    patchContent(snap, viewChanged);
    patchDockMeta(snap);
  }

  function refreshAimForSelected() {
    var D = dock();
    var snap = store() && store().getSnapshot();
    if (!D || !snap) return;
    var c = currentCat(snap);
    if (c.appId && D.refreshAim) D.refreshAim(c.appId);
  }

  function dispatch(actionId, agentId) {
    var S = store();
    S.setReceipt({
      phase: 'sending',
      title: t('ha2ActionSending', '正在执行 Agent 操作'),
      message: actionId
    });
    return invoke('cmd_agent_center_action', {
      args: {
        agentId: agentId,
        actionId: actionId,
        projectHint: null,
        attemptId: 'home-v2-' + Date.now().toString(36)
      }
    })
      .then(function (res) {
        var failed = !res || res.outcome === 'failed';
        S.setReceipt({
          phase: failed ? 'failed' : 'sent',
          title: failed ? t('ha2ActionFailed', '操作失败') : t('ha2ActionDone', 'Agent 操作已执行'),
          message: (res && (res.detail || res.error || res.outcome)) || t('ha2NoResult', '未返回结果')
        });
        return S.refresh('action');
      })
      .catch(function (e) {
        S.setReceipt({
          phase: 'failed',
          title: t('ha2ActionFailed', '操作失败'),
          message: (e && e.message) || String(e)
        });
      });
  }

  function send() {
    var S = store();
    var D = dock();
    var snap = S.getSnapshot();
    var c = currentCat(snap);
    var draft = snap.draft || '';
    var ta = root && root.querySelector('[data-ha2-draft]');
    if (ta) draft = ta.value;
    if (!String(draft).trim() && !(snap.materials && snap.materials.length)) return;

    var matching = null;
    for (var i = 0; i < snap.agents.length; i++) {
      if (snap.agents[i].kind === c.id) {
        matching = snap.agents[i];
        break;
      }
    }
    if (!matching) {
      S.setReceipt({
        phase: 'failed',
        title: t('ha2InstallFirst', '安装或打开') + ' ' + c.name + ' ' + t('ha2ThenSend', '后再发'),
        message: t('ha2NoDeliverable', '未发现可投递的桌面 App 或匹配 CLI')
      });
      return;
    }

    var text = D && D.assembledText ? D.assembledText(draft) : draft;
    S.setReceipt({
      phase: 'sending',
      title: t('ha2SendingTo', '正在发送到') + ' ' + c.name,
      message: S.windowsLabel(c.id)
    });

    var clipWrite =
      global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText
        ? global.navigator.clipboard.writeText(String(text || ''))
        : Promise.reject(new Error('clipboard_unavailable'));

    clipWrite
      .then(function () {
        if (D && D.calibrateAim) {
          return D.calibrateAim(c.id).catch(function () {
            return null;
          });
        }
        return null;
      })
      .then(function () {
        return invoke('cmd_agent_center_action', {
          args: {
            agentId: matching.agentId,
            actionId: 'agent.focus',
            pasteClipboard: true,
            projectHint: null,
            attemptId: 'home-v2-send-' + Date.now().toString(36)
          }
        });
      })
      .then(function (res) {
        var detail = String((res && (res.detail || res.error)) || '');
        var ok = !!res && res.outcome !== 'failed' && /composer_pasted|chat_pasted/.test(detail);
        var inputConfirmed = /composer_pasted|ready=composer/.test(detail);
        if (ok) {
          S.setReceipt({
            phase: 'sent',
            title: inputConfirmed
              ? t('ha2DeliveredComposer', '已送达') + ' ' + c.name + ' ' + t('ha2InputBox', '输入框')
              : t('ha2SentUnconfirmed', '已发出 · 未确认进入输入框'),
            message: inputConfirmed
              ? t('ha2FgAndComposer', '目标前台与输入框均已确认')
              : t('ha2FgPasted', '目标已取得前台，粘贴已执行'),
            inputConfirmed: inputConfirmed
          });
          if (D && D.archiveOnSuccess) D.archiveOnSuccess(c.id);
        } else {
          S.setReceipt({
            phase: 'failed',
            title: t('ha2SendFailed', '发送失败'),
            message: detail || t('ha2ActivateFailed', '无法激活目标或执行粘贴'),
            inputConfirmed: false
          });
        }
      })
      .catch(function (e) {
        S.setReceipt({
          phase: 'failed',
          title: t('ha2SendFailed', '发送失败'),
          message: (e && e.message) || String(e),
          inputConfirmed: false
        });
      });
  }

  function onInput(e) {
    if (!e.target.matches || !e.target.matches('[data-ha2-draft]')) return;
    var val = e.target.value;
    try {
      draftSel.start = e.target.selectionStart;
      draftSel.end = e.target.selectionEnd;
    } catch (_) {}
    var D = dock();
    if (D && D.syncDraftToPrep) D.syncDraftToPrep(val);
    else if (store()) store().setDraft(val, { lock: true, silent: true });
    var sendBtn = root && root.querySelector('[data-ha2-send]');
    var snap = store() && store().getSnapshot();
    if (sendBtn) {
      sendBtn.disabled = !String(val).trim() && !(snap && snap.materials && snap.materials.length);
    }
  }

  function onPaste(e) {
    if (!e.target.matches || !e.target.matches('[data-ha2-draft]')) return;
    var items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    var D = dock();
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        var f = items[i].getAsFile();
        if (f && D && D.addFiles) {
          e.preventDefault();
          D.addFiles([f]);
        }
      }
    }
  }

  function onClick(e) {
    var tEl = e.target.closest(
      '[data-ha2-picker],[data-ha2-picker-close],[data-ha2-pick],[data-ha2-detail],[data-ha2-home],[data-ha2-action],[data-ha2-open-center],[data-ha2-refresh],[data-ha2-send],[data-ha2-retry],[data-ha2-remove],[data-ha2-aim-clear],[data-ha2-aim],[data-ha2-cap],[data-ha2-add],[data-ha2-mat]'
    );
    if (!tEl) return;
    var S = store();
    var D = dock();
    if (tEl.hasAttribute('data-ha2-picker')) {
      S.setPickerOpen(!S.getSnapshot().pickerOpen);
      return;
    }
    if (tEl.hasAttribute('data-ha2-picker-close')) {
      S.setPickerOpen(false);
      return;
    }
    if (tEl.hasAttribute('data-ha2-pick')) {
      S.setSelected(tEl.getAttribute('data-ha2-pick'), { closePicker: true });
      refreshAimForSelected();
      return;
    }
    if (tEl.hasAttribute('data-ha2-detail')) {
      S.setSelected(tEl.getAttribute('data-ha2-detail'), { lock: true });
      S.setView('agent');
      return;
    }
    if (tEl.hasAttribute('data-ha2-home')) {
      S.setView('home');
      return;
    }
    if (tEl.hasAttribute('data-ha2-action')) {
      dispatch(tEl.getAttribute('data-ha2-action'), tEl.getAttribute('data-agent'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-open-center')) {
      var Nav = global.OneToneAgentNavTarget;
      if (Nav && Nav.open) {
        Nav.open({
          view: 'overview',
          section: 'working',
          provider: S.getSnapshot().selectedKind
        });
      }
      return;
    }
    if (tEl.hasAttribute('data-ha2-refresh')) {
      S.refresh('user');
      return;
    }
    if (tEl.hasAttribute('data-ha2-send') || tEl.hasAttribute('data-ha2-retry')) {
      send();
      return;
    }
    if (tEl.hasAttribute('data-ha2-remove')) {
      if (D && D.removeMaterial) D.removeMaterial(tEl.getAttribute('data-ha2-remove'));
      return;
    }
    if (tEl.hasAttribute('data-ha2-aim-clear')) {
      if (D) D.clearAim(S.getSnapshot().selectedKind);
      return;
    }
    if (tEl.hasAttribute('data-ha2-aim')) {
      if (D) D.calibrateAim(S.getSnapshot().selectedKind);
      return;
    }
    if (tEl.hasAttribute('data-ha2-cap')) {
      var cap = tEl.getAttribute('data-ha2-cap');
      if (cap === 'softPad' && D) D.toggleSoftPad();
      else if (cap === 'voice' && D) D.toggleVoice();
      else if (cap === 'camera' && D) D.toggleCamera();
      return;
    }
    if (tEl.hasAttribute('data-ha2-add')) {
      matMenuOpen = !matMenuOpen;
      paint(S.getSnapshot());
      return;
    }
    if (tEl.hasAttribute('data-ha2-mat')) {
      matMenuOpen = false;
      paint(S.getSnapshot());
      if (D) D.pickMaterial(tEl.getAttribute('data-ha2-mat'));
    }
  }

  function mount(el) {
    if (mounted) return;
    root = el;
    var S = store();
    if (!S) return;
    S.mount();
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('paste', onPaste);
    root.addEventListener('dragover', function (e) {
      if (e.target.closest('[data-ha2-drop]')) {
        e.preventDefault();
        e.target.closest('[data-ha2-drop]').classList.add('is-over');
      }
    });
    root.addEventListener('dragleave', function (e) {
      var d = e.target.closest('[data-ha2-drop]');
      if (d) d.classList.remove('is-over');
    });
    root.addEventListener('drop', function (e) {
      var d = e.target.closest('[data-ha2-drop]');
      if (!d) return;
      e.preventDefault();
      d.classList.remove('is-over');
      var D = dock();
      if (D && D.addFiles) D.addFiles(e.dataTransfer && e.dataTransfer.files);
    });
    unsubStore = S.subscribe(function (snap) {
      if (!mounted) return;
      paint(snap);
    });
    mounted = true;
    paint(S.getSnapshot());
    refreshAimForSelected();
  }

  function show() {
    if (!root) return;
    var S = store();
    root.hidden = false;
    root.removeAttribute('aria-hidden');
    if (S) {
      S.setVisible(true);
      S.refresh('show');
    }
    refreshAimForSelected();
  }

  function hide() {
    var S = store();
    if (S) S.setVisible(false);
    if (root) {
      root.hidden = true;
      root.setAttribute('aria-hidden', 'true');
    }
  }

  function refresh() {
    var S = store();
    return S ? S.refresh('external') : Promise.resolve();
  }

  global.OneToneHomeAgentV2 = {
    mount: mount,
    show: show,
    hide: hide,
    refresh: refresh,
    _state: function () {
      var S = store();
      var snap = S ? S.getSnapshot() : {};
      return {
        selected: snap.selectedKind,
        userLocked: snap.userLocked,
        view: snap.view,
        receipt: snap.receipt
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
