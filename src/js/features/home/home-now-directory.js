/**
 * Left-nav parallel tabs under 首页: 对话 | 工作 long-term lists.
 * Does not replace 首页 or 新首页 — segmented switch with soft panel fade.
 */
(function (global) {
  'use strict';

  var bound = false;
  var unsubHa2 = null;
  var selectedId = '';
  var activeLane = 'chat'; // always one of chat | work
  var lastPaintKey = '';
  var switchRaf = 0;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function readIntent() {
    try {
      return localStorage.getItem('onetone.homeIntent') === 'work' ? 'work' : 'chat';
    } catch (_) {
      return 'chat';
    }
  }

  function writeIntent(next) {
    var intent = next === 'work' ? 'work' : 'chat';
    try {
      localStorage.setItem('onetone.homeIntent', intent);
    } catch (_) {}
    var Store = global.OneToneHomeAgentV2Store;
    if (Store && typeof Store.setWorkMode === 'function') {
      try {
        Store.setWorkMode(intent === 'work' ? 'edit' : 'think');
      } catch (_) {}
    }
    return intent;
  }

  function goHome() {
    // 首页 = Focus 桌面；关掉独占对话层，避免 stage 被藏成白屏。
    closeExclusiveChat();
    var Drawer = global.OneToneSettingsDrawer;
    if (Drawer && Drawer.close) {
      try {
        Drawer.close();
      } catch (_) {}
    }
    var WB = global.OneToneHomeWorkbench;
    if (WB && WB.syncNavActiveState) WB.syncNavActiveState('home');
    var Home = global.OneToneNowHome;
    if (Home && Home.show) {
      try {
        Home.show();
      } catch (_) {}
    }
    if (Home && Home.paint) {
      try {
        Home.paint();
      } catch (_) {}
    }
  }

  function truncate(s, n) {
    s = String(s || '').trim();
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + '…';
  }

  function relativeWhen(ts) {
    var t = Number(ts) || 0;
    if (!t) return '';
    var diff = Date.now() - t;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    if (diff < 48 * 60 * 60 * 1000) return '昨天';
    var d = new Date(t);
    return d.getMonth() + 1 + '/' + d.getDate();
  }

  function providerLabel(raw) {
    var s = String(raw || '').trim();
    if (!s) return 'Agent';
    if (/cursor/i.test(s)) return 'Cursor';
    if (/codex/i.test(s)) return 'Codex';
    if (/claude/i.test(s)) return 'Claude';
    if (/workbuddy|wb/i.test(s)) return 'WorkBuddy';
    if (/gemini/i.test(s)) return 'Gemini';
    if (/qoder/i.test(s)) return 'Qoder';
    if (/trae/i.test(s)) return 'Trae';
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function workTone(status) {
    var st = String(status || '').toLowerCase();
    if (/wait|approval|confirm|need/.test(st)) return 'warn';
    if (/run|send|verif|repair|review|active|working/.test(st)) return 'live';
    return 'idle';
  }

  function workStatusLabel(status, updatedAt) {
    var st = String(status || '').toLowerCase();
    if (/wait|approval|confirm|need/.test(st)) return '需确认';
    if (/run|send|verif|repair|review|active|working/.test(st)) return '发送中';
    if (/done|ok|success|delivered|pasted/.test(st)) return '已送达';
    if (/fail|error|interrupt/.test(st)) return '失败';
    return relativeWhen(updatedAt) || '—';
  }

  function taskHasHandoff(taskId) {
    var J = global.OneToneHomeTaskJournal;
    if (!J || !J.listEvents) return false;
    var evs = J.listEvents(taskId, 40) || [];
    for (var i = 0; i < evs.length; i++) {
      var k = String((evs[i] && evs[i].kind) || '');
      if (k === 'handoff' || k === 'receipt') return true;
    }
    return false;
  }

  function isWorkJournalTask(t) {
    if (!t) return false;
    if (String(t.lane || '') === 'work') return true;
    return taskHasHandoff(t.id);
  }

  function chatRows() {
    var J = global.OneToneHomeTaskJournal;
    if (!J || !J.listTasks) return [];
    var tasks = J.listTasks({ archived: false }) || [];
    var active = J.getActiveTaskId ? String(J.getActiveTaskId() || '') : '';
    var out = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (!t || !t.id) continue;
      if (isWorkJournalTask(t)) continue;
      var kinds = J.agentKindsForTask ? J.agentKindsForTask(t.id) : [];
      out.push({
        id: 'chat:' + t.id,
        lane: 'chat',
        taskId: String(t.id),
        title: truncate(t.title || '本机对话', 28),
        provider: providerLabel((kinds && kinds[0]) || 'workbuddy'),
        statusLabel: relativeWhen(t.updatedAt) || '对话',
        tone: 'idle',
        on: active && String(t.id) === active
      });
    }
    return out;
  }

  function workRows() {
    var out = [];
    var seen = {};
    var Store = global.OneToneHomeAgentV2Store;
    var snap = Store && Store.getSnapshot ? Store.getSnapshot() : null;
    var stack = (snap && snap.agentTaskStack) || [];
    var activeId =
      snap && snap.agentTask && snap.agentTask.taskId
        ? String(snap.agentTask.taskId)
        : '';
    var i;
    for (i = stack.length - 1; i >= 0; i--) {
      var item = stack[i];
      var task = item && item.task;
      if (!task || !task.taskId) continue;
      var id = String(task.taskId);
      if (seen[id]) continue;
      seen[id] = true;
      var goal = String(task.goal || '').trim() || '工作任务';
      out.push({
        id: 'atr:' + id,
        lane: 'work',
        atrId: id,
        title: '投递 · ' + truncate(goal, 22),
        provider: providerLabel(task.providerId || task.provider),
        statusLabel: workStatusLabel(task.status, task.updatedAt),
        tone: workTone(task.status),
        on: activeId && id === activeId
      });
    }
    var live = (Store && Store.workRows && Store.workRows(8)) || [];
    for (i = 0; i < live.length; i++) {
      var r = live[i];
      if (!r) continue;
      var key = String(r.kind || r.agentKind || r.id || i);
      var rowId = 'live:' + key;
      if (seen[rowId] || seen[key]) continue;
      seen[rowId] = true;
      var line = String(r.line || r.title || r.name || '').trim() || key;
      out.push({
        id: rowId,
        lane: 'work',
        agentKind: key,
        title: '投递 · ' + truncate(line, 22),
        provider: providerLabel(r.name || r.kind || r.agentKind),
        statusLabel: workStatusLabel(r.status, r.updated),
        tone: workTone(r.status),
        on: false
      });
    }
    var J = global.OneToneHomeTaskJournal;
    if (J && J.listTasks) {
      var tasks = J.listTasks({ archived: false }) || [];
      for (i = 0; i < tasks.length; i++) {
        var t = tasks[i];
        if (!t || !t.id || !isWorkJournalTask(t)) continue;
        var jid = 'chatwork:' + t.id;
        if (seen[jid]) continue;
        seen[jid] = true;
        var kinds = J.agentKindsForTask ? J.agentKindsForTask(t.id) : [];
        out.push({
          id: jid,
          lane: 'work',
          taskId: String(t.id),
          title: '投递 · ' + truncate(t.title || '工作', 22),
          provider: providerLabel((kinds && kinds[0]) || 'Agent'),
          statusLabel: relativeWhen(t.updatedAt) || '已送达',
          tone: 'idle',
          on: false
        });
      }
    }
    return out;
  }

  function rowHtml(row) {
    return (
      '<button type="button" class="wb-nav-acc__row' +
      (row.on || selectedId === row.id ? ' is-on' : '') +
      '" role="listitem" data-wb-now-row="' +
      esc(row.id) +
      '" data-wb-now-lane="' +
      esc(row.lane) +
      '">' +
      '<span class="wb-nav-acc__row-title">' +
      esc(row.title) +
      '</span>' +
      '<span class="wb-nav-acc__row-meta">' +
      '<i class="wb-nav-acc__dot is-' +
      esc(row.tone || 'idle') +
      '" aria-hidden="true"></i>' +
      esc(row.provider) +
      ' · ' +
      esc(row.statusLabel) +
      '</span></button>'
    );
  }

  function listInnerHtml(rows, emptyText, extras) {
    extras = extras || '';
    if (!rows.length) {
      return extras + '<p class="wb-nav-acc__empty">' + esc(emptyText) + '</p>';
    }
    return extras + rows.map(rowHtml).join('');
  }

  function syncTabChrome() {
    var host = $('wbNowDirectory');
    if (!host) return;
    host.setAttribute('data-wb-now-lane', activeLane);
    var tabs = host.querySelectorAll('[data-wb-now-tab]');
    for (var i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var on = tab.getAttribute('data-wb-now-tab') === activeLane;
      tab.classList.toggle('is-on', on);
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    }
    var panels = host.querySelectorAll('[data-wb-acc-panel]');
    for (var j = 0; j < panels.length; j++) {
      var panel = panels[j];
      var show = panel.getAttribute('data-wb-acc-panel') === activeLane;
      panel.classList.toggle('is-on', show);
      // Keep both panels in layout for crossfade — no [hidden] (kills transition).
      if (panel.hasAttribute('hidden')) panel.removeAttribute('hidden');
      panel.setAttribute('aria-hidden', show ? 'false' : 'true');
    }
  }

  function paintLists() {
    var chat = chatRows();
    var work = workRows();
    var key =
      chat.length +
      ':' +
      work.length +
      ':' +
      selectedId +
      ':' +
      (chat[0] && chat[0].id) +
      ':' +
      (work[0] && work[0].id);
    // Skip identical rebuilds so tab switches stay instant.
    if (key === lastPaintKey) return;
    lastPaintKey = key;

    var chatCountEl = $('wbNowDirChatCount');
    var workCountEl = $('wbNowDirWorkCount');
    if (chatCountEl) chatCountEl.textContent = String(chat.length);
    if (workCountEl) workCountEl.textContent = String(work.length);

    var chatList = $('wbNowDirChatList');
    if (chatList) {
      chatList.innerHTML = listInnerHtml(
        chat,
        '还没有对话。问一句，本机工具循环直接答。',
        '<button type="button" class="wb-nav-acc__new" id="wbNavNewChat">+ 新对话</button>'
      );
    }
    var workList = $('wbNowDirWorkList');
    if (workList) {
      workList.innerHTML = listInnerHtml(
        work,
        '还没有投递记录。写一句，转发到 Agent。',
        '<button type="button" class="wb-nav-acc__new" id="wbNavNewWork">+ 新工作</button>'
      );
    }
  }

  function paint() {
    if (!$('wbNowDirectory')) return;
    // Stay aligned if top chrome intent flipped elsewhere.
    var intent = readIntent();
    if (intent === 'work' || intent === 'chat') activeLane = intent;
    paintLists();
    syncTabChrome();
  }

  function openExclusiveChat() {
    var HA2 = global.OneToneHomeAgentV2;
    if (HA2 && typeof HA2.openWbChatPage === 'function') {
      try {
        HA2.openWbChatPage({ chatOnly: true });
      } catch (_) {}
    }
  }

  function closeExclusiveChat() {
    var HA2 = global.OneToneHomeAgentV2;
    if (HA2 && typeof HA2.closeWbChatPage === 'function') {
      try {
        // Leave ATR work page alone if it owns the host.
        if (HA2.isWbChatPageOpen && HA2.isWbChatPageOpen()) {
          HA2.closeWbChatPage();
        }
      } catch (_) {}
    }
  }

  function setActiveLane(lane, opts) {
    opts = opts || {};
    var next = lane === 'work' ? 'work' : 'chat';
    if (activeLane === next && !opts.force) {
      // Re-click same tab: stay on Focus desk (no empty exclusive takeover).
      return;
    }
    activeLane = next;
    writeIntent(activeLane);
    // Soft panel handoff first — avoid remounting home on every tab click.
    syncTabChrome();
    // 对话/工作 tabs only flip intent. Exclusive page opens from a chat row
    // (openChatTask) or after send — never blank-cover the home stage.
    closeExclusiveChat();
    var Home = global.OneToneNowHome;
    var onHome = !!(Home && Home.isVisible && Home.isVisible());
    if (onHome && Home.paint) {
      try {
        Home.paint();
      } catch (_) {}
    } else if (opts.goHome !== false) {
      goHome();
    }
    if (switchRaf) {
      try {
        cancelAnimationFrame(switchRaf);
      } catch (_) {}
    }
    switchRaf = requestAnimationFrame(function () {
      switchRaf = 0;
      paintLists();
      syncTabChrome();
    });
  }

  function openChatTask(taskId) {
    var J = global.OneToneHomeTaskJournal;
    if (J && J.setActiveTask) J.setActiveTask(taskId);
    activeLane = 'chat';
    writeIntent('chat');
    goHome();
    paint();
    var HA2 = global.OneToneHomeAgentV2;
    if (HA2 && typeof HA2.loadChatTaskTurns === 'function') {
      try {
        HA2.loadChatTaskTurns(taskId);
      } catch (_) {}
    }
    openExclusiveChat();
  }

  function onNewChat() {
    activeLane = 'chat';
    lastPaintKey = '';
    writeIntent('chat');
    var HA2 = global.OneToneHomeAgentV2;
    if (HA2 && typeof HA2.startNewChatSession === 'function') {
      try {
        HA2.startNewChatSession();
      } catch (_) {}
    } else {
      var J = global.OneToneHomeTaskJournal;
      if (J && J.createTask) {
        try {
          var t = J.createTask({ title: '本机对话', lane: 'chat', activate: true });
          if (t && t.id) selectedId = 'chat:' + t.id;
        } catch (_) {}
      }
    }
    goHome();
    paint();
    openExclusiveChat();
  }

  function openAtrTask(atrId) {
    writeIntent('work');
    goHome();
    var HA2 = global.OneToneHomeAgentV2;
    if (HA2 && typeof HA2.openAtrHistory === 'function') {
      try {
        HA2.openAtrHistory(atrId);
      } catch (_) {}
    }
    paint();
  }

  function onNewWork() {
    activeLane = 'work';
    lastPaintKey = '';
    writeIntent('work');
    var J = global.OneToneHomeTaskJournal;
    if (J && J.createTask) {
      try {
        var t = J.createTask({ title: '新工作', lane: 'work', activate: true });
        if (t && t.id) selectedId = 'chatwork:' + t.id;
      } catch (_) {}
    }
    goHome();
    paint();
    var host = document.querySelector(
      '[data-hf-ha2-compose-host] textarea, [data-ha2-dock-host] textarea'
    );
    if (host && host.focus) {
      try {
        host.focus();
      } catch (_) {}
    }
  }

  function onClick(e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var newChatBtn = t.closest('#wbNavNewChat');
    if (newChatBtn) {
      e.preventDefault();
      e.stopPropagation();
      onNewChat();
      return;
    }
    var newBtn = t.closest('#wbNavNewWork');
    if (newBtn) {
      e.preventDefault();
      e.stopPropagation();
      onNewWork();
      return;
    }
    var tab = t.closest('[data-wb-now-tab]');
    if (tab) {
      e.preventDefault();
      e.stopPropagation();
      setActiveLane(tab.getAttribute('data-wb-now-tab'));
      return;
    }
    var row = t.closest('[data-wb-now-row]');
    if (!row) return;
    e.preventDefault();
    e.stopPropagation();
    var id = row.getAttribute('data-wb-now-row') || '';
    selectedId = id;
    if (id.indexOf('chat:') === 0) {
      openChatTask(id.slice(5));
      return;
    }
    if (id.indexOf('atr:') === 0) {
      openAtrTask(id.slice(4));
      return;
    }
    if (id.indexOf('chatwork:') === 0) {
      openChatTask(id.slice(9));
      writeIntent('work');
      paint();
      return;
    }
    writeIntent('work');
    var kind = id.indexOf('live:') === 0 ? id.slice(5) : '';
    var Store = global.OneToneHomeAgentV2Store;
    if (kind && Store && Store.setSelected) {
      try {
        Store.setSelected(kind, { lock: true, closePicker: true });
      } catch (_) {}
    }
    goHome();
    paint();
  }

  function bindHa2() {
    var Store = global.OneToneHomeAgentV2Store;
    if (!Store || typeof Store.subscribe !== 'function') return;
    if (unsubHa2) return;
    unsubHa2 = Store.subscribe(function () {
      paint();
    });
  }

  function onKeydown(e) {
    var tab = e.target && e.target.closest && e.target.closest('[data-wb-now-tab]');
    if (!tab) return;
    var key = e.key;
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'Home' && key !== 'End') {
      return;
    }
    e.preventDefault();
    if (key === 'ArrowLeft' || key === 'Home') setActiveLane('chat');
    else setActiveLane('work');
    var next = $(activeLane === 'work' ? 'wbNowDirTabWork' : 'wbNowDirTabChat');
    if (next && next.focus) next.focus();
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var nav = $('wbLeftNav');
    if (nav) {
      nav.addEventListener('click', onClick);
      nav.addEventListener('keydown', onKeydown);
    }
    activeLane = readIntent();
    bindHa2();
    paint();
    var tries = 0;
    var timer = setInterval(function () {
      tries += 1;
      bindHa2();
      lastPaintKey = '';
      paint();
      if (unsubHa2 || tries > 20) clearInterval(timer);
    }, 500);
  }

  global.OneToneHomeNowDirectory = {
    bindOnce: bindOnce,
    paint: paint,
    syncVisibility: paint,
    refresh: function () {
      bindOnce();
      paint();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindOnce);
  } else {
    bindOnce();
  }
})(typeof window !== 'undefined' ? window : globalThis);
