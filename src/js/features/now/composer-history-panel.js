/**
 * Left-nav「对话历史」— task list + mixed timeline; right-click task actions.
 */
(function (global) {
  'use strict';

  var selectedId = '';
  var showArchived = false;
  var query = '';
  var selectedSet = {};
  var ctxTaskId = '';
  var bound = false;

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

  function journal() {
    return global.OneToneHomeTaskJournal;
  }

  function dock() {
    return global.OneToneHomeDockBridge;
  }

  function toast(msg) {
    var T = global.OneToneToast;
    if (T && T.show) {
      try {
        T.show(String(msg || ''));
      } catch (_) {}
    }
  }

  function whenLabel(msOrIso) {
    var ms = typeof msOrIso === 'number' ? msOrIso : Date.parse(String(msOrIso || ''));
    if (!ms) return '';
    var d = new Date(ms);
    var now = new Date();
    var sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return (
      d.toLocaleDateString([], { month: 'numeric', day: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  }

  function truncate(s, max) {
    s = String(s || '').trim();
    if (!s) return '';
    max = max || 120;
    return s.length > max ? s.slice(0, max - 1) + '…' : s;
  }

  function goHomeWithDraft() {
    try {
      if (global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.close) {
        global.OneToneSettingsDrawer.close();
      }
    } catch (_) {}
    try {
      localStorage.setItem('onetone.homeSurface', 'agentV2');
    } catch (_) {}
    var WB = global.OneToneHomeWorkbench;
    if (WB && typeof WB.syncNavActiveState === 'function') {
      try {
        WB.syncNavActiveState('home', { navKey: 'homeV2' });
      } catch (_) {}
    }
    var NH = global.OneToneNowHome;
    if (NH && NH.show) {
      try {
        NH.show();
      } catch (_) {}
    }
    var HA = global.OneToneHomeAgentV2;
    if (HA && HA.show) {
      try {
        HA.show();
      } catch (_) {}
    }
  }

  function hideCtx() {
    var ctx = document.getElementById('composerHistoryCtx');
    if (ctx) {
      ctx.hidden = true;
      ctx.innerHTML = '';
    }
    ctxTaskId = '';
  }

  function selectedIds() {
    return Object.keys(selectedSet).filter(function (id) {
      return selectedSet[id];
    });
  }

  function syncBatchBar() {
    var bar = document.getElementById('composerHistoryBatch');
    var count = document.getElementById('composerHistoryBatchCount');
    var ids = selectedIds();
    if (bar) bar.hidden = !ids.length;
    if (count) count.textContent = t('composerHistSelected', '已选 {n}').replace('{n}', String(ids.length));
  }

  function agentIconsHtml(kinds) {
    var J = journal();
    return (kinds || [])
      .slice(0, 4)
      .map(function (k) {
        var icon = J && J.iconForAgent ? J.iconForAgent(k) : '';
        if (icon) {
          return (
            '<img class="composer-hist-agent-ico" src="' +
            esc(icon) +
            '" alt="' +
            esc(k) +
            '" title="' +
            esc(k) +
            '" />'
          );
        }
        return '<span class="composer-hist-agent-tag">' + esc(k) + '</span>';
      })
      .join('');
  }

  function paintTaskList() {
    var list = document.getElementById('composerHistoryList');
    if (!list) return;
    var J = journal();
    if (!J) {
      list.innerHTML =
        '<p class="composer-hist-empty">' + esc(t('composerHistNoJournal', '任务日记未加载')) + '</p>';
      return;
    }
    var tasks = J.listTasks({ archived: showArchived, query: query });
    if (!tasks.length) {
      list.innerHTML =
        '<p class="composer-hist-empty">' +
        esc(
          showArchived
            ? t('composerHistArchivedEmpty', '没有已归档任务。')
            : t('composerHistEmptyTasks', '还没有任务。右键空白处可新建。')
        ) +
        '</p>';
      return;
    }
    var pinned = tasks.filter(function (t) {
      return t.pinned;
    });
    var rest = tasks.filter(function (t) {
      return !t.pinned;
    });
    function section(label, rows) {
      if (!rows.length) return '';
      return (
        '<div class="composer-hist-sec">' +
        esc(label) +
        '</div>' +
        rows
          .map(function (task) {
            var n = J.eventCount(task.id);
            var kinds = J.agentKindsForTask(task.id);
            var on = String(task.id) === String(selectedId);
            var checked = !!selectedSet[task.id];
            return (
              '<button type="button" class="composer-hist-task' +
              (on ? ' is-on' : '') +
              (checked ? ' is-selected' : '') +
              '" data-hist-task="' +
              esc(task.id) +
              '" role="listitem">' +
              '<input type="checkbox" data-hist-check="' +
              esc(task.id) +
              '"' +
              (checked ? ' checked' : '') +
              ' aria-label="' +
              esc(t('composerHistSelectTask', '选择任务')) +
              '" />' +
              '<span class="composer-hist-task-body">' +
              '<span class="composer-hist-task-title">' +
              (task.pinned ? '<span class="composer-hist-pin" aria-hidden="true">⬆</span>' : '') +
              '<span>' +
              esc(task.title || t('composerHistUntitled', '（无标题）')) +
              '</span></span>' +
              '<span class="composer-hist-task-meta">' +
              esc(whenLabel(task.updatedAt) + (n ? ' · ' + n + t('composerHistEvents', ' 条') : '')) +
              '</span>' +
              '<span class="composer-hist-task-agents">' +
              agentIconsHtml(kinds) +
              '</span></span></button>'
            );
          })
          .join('')
      );
    }
    list.innerHTML =
      section(t('composerHistPinned', '置顶'), pinned) +
      section(t('composerHistRecent', '最近'), rest);
  }

  function paintTimeline() {
    var titleEl = document.getElementById('composerHistoryTaskTitle');
    var metaEl = document.getElementById('composerHistoryTaskMeta');
    var tl = document.getElementById('composerHistoryTimeline');
    var restoreBtn = document.getElementById('composerHistoryRestore');
    var J = journal();
    if (!tl || !J) return;
    var task = selectedId ? J.getTask(selectedId) : null;
    if (!task) {
      if (titleEl) titleEl.textContent = t('composerHistPickTask', '选择一个任务');
      if (metaEl) metaEl.textContent = '';
      if (restoreBtn) restoreBtn.hidden = true;
      tl.innerHTML =
        '<p class="composer-hist-empty">' +
        esc(t('composerHistTimelineHint', '从左侧打开任务，查看混排时间线。')) +
        '</p>';
      return;
    }
    if (titleEl) titleEl.textContent = task.title || t('composerHistUntitled', '（无标题）');
    if (metaEl) {
      metaEl.textContent =
        whenLabel(task.updatedAt) +
        ' · ' +
        J.eventCount(task.id) +
        t('composerHistEvents', ' 条');
    }
    if (restoreBtn) restoreBtn.hidden = false;
    var events = J.listEvents(task.id, 120);
    if (!events.length) {
      tl.innerHTML =
        '<p class="composer-hist-empty">' +
        esc(t('composerHistNoEvents', '这个任务还没有对话或投递。')) +
        '</p>';
      return;
    }
    tl.innerHTML = events
      .map(function (ev) {
        var isUser = ev.role === 'user' || ev.kind === 'handoff';
        var isEdge = ev.kind === 'handoff' || ev.kind === 'receipt';
        var icon = J.iconForAgent(ev.agentKind);
        var who =
          ev.kind === 'handoff'
            ? t('composerHistMeTo', '我 → ') + String(ev.agentKind || 'Agent')
            : isUser
              ? t('ha2WbRoleUser', '我')
              : String(ev.agentKind || 'Agent');
        var kindLbl =
          ev.kind === 'handoff'
            ? t('composerHistHandoff', '桌面投递')
            : ev.kind === 'receipt'
              ? t('composerHistReceipt', '投递回执')
              : isUser
                ? t('composerHistLocalUser', '本机对话')
                : t('composerHistLocalReply', '本机回复');
        return (
          '<article class="composer-hist-ev" data-hist-ev="' +
          esc(ev.id) +
          '">' +
          '<div class="composer-hist-ev-time">' +
          esc(whenLabel(ev.at)) +
          '</div>' +
          '<div class="composer-hist-ev-card' +
          (isUser ? ' is-user' : '') +
          (isEdge ? ' is-edge' : '') +
          '">' +
          '<div class="composer-hist-ev-top">' +
          (icon
            ? '<img class="composer-hist-agent-ico" src="' + esc(icon) + '" alt="" />'
            : '') +
          '<span class="composer-hist-ev-who">' +
          esc(who) +
          '</span>' +
          '<span class="composer-hist-ev-kind">' +
          esc(kindLbl) +
          '</span></div>' +
          '<pre class="composer-hist-ev-body">' +
          esc(truncate(ev.text, 2000) || '—') +
          '</pre></div></article>'
        );
      })
      .join('');
  }

  function paint() {
    var J = journal();
    if (J && !selectedId) {
      selectedId = J.getActiveTaskId() || '';
    }
    paintTaskList();
    paintTimeline();
    syncBatchBar();
  }

  function restoreSelected() {
    var J = journal();
    if (!J || !selectedId) return;
    var text = J.latestUserText(selectedId);
    if (!text) {
      toast(t('composerHistRestoreFail', '无法回填这条记录'));
      return;
    }
    var D = dock();
    var S = global.OneToneHomeAgentV2Store;
    if (S && S.setDraft) S.setDraft(text, { silent: true });
    if (D && D.syncDraftToPrep) {
      try {
        D.syncDraftToPrep(text);
      } catch (_) {}
    } else {
      var Prep = global.OneToneHomePromptPrep;
      if (Prep && Prep.setDraftBody) {
        try {
          Prep.setDraftBody(text, { skipSync: true });
        } catch (_) {}
      }
    }
    toast(t('composerHistRestored', '已回填到首页输入框'));
    goHomeWithDraft();
  }

  function showCtx(x, y, taskId) {
    var shell = document.getElementById('composerHistoryShell');
    var ctx = document.getElementById('composerHistoryCtx');
    if (!shell || !ctx) return;
    ctxTaskId = taskId || '';
    var J = journal();
    var task = taskId && J ? J.getTask(taskId) : null;
    var multi = selectedIds().length >= 2;
    var items = [];
    items.push({ act: 'new', label: t('composerHistNewTask', '新建任务') });
    if (task) {
      items.push({ hr: true });
      items.push({
        act: 'pin',
        label: task.pinned
          ? t('composerHistUnpin', '取消置顶')
          : t('composerHistPin', '置顶')
      });
      items.push({ act: 'rename', label: t('composerHistRename', '重命名') });
      items.push({
        act: 'archive',
        label: task.archived
          ? t('composerHistUnarchive', '取消归档')
          : t('composerHistArchive', '归档')
      });
      items.push({ hr: true });
      items.push({ act: 'restore', label: t('composerHistRestore', '回填首页') });
      items.push({ act: 'delete', label: t('composerHistRemove', '删除'), danger: true });
    }
    if (multi) {
      items.push({ hr: true });
      items.push({
        act: 'batch',
        label: t('composerHistBatch', '批量操作（{n}）…').replace(
          '{n}',
          String(selectedIds().length)
        )
      });
    }
    ctx.innerHTML = items
      .map(function (it) {
        if (it.hr) return '<hr />';
        return (
          '<button type="button" role="menuitem" data-ctx-act="' +
          esc(it.act) +
          '"' +
          (it.danger ? ' class="is-danger"' : '') +
          '>' +
          esc(it.label) +
          '</button>'
        );
      })
      .join('');
    ctx.hidden = false;
    var rect = shell.getBoundingClientRect();
    var left = x - rect.left;
    var top = y - rect.top;
    ctx.style.left = '0px';
    ctx.style.top = '0px';
    var w = ctx.offsetWidth || 168;
    var h = ctx.offsetHeight || 120;
    ctx.style.left = Math.max(8, Math.min(left, rect.width - w - 8)) + 'px';
    ctx.style.top = Math.max(8, Math.min(top, rect.height - h - 8)) + 'px';
  }

  function runCtx(act) {
    var J = journal();
    if (!J) return;
    if (act === 'new') {
      var task = J.createTask({ title: t('composerHistNewTaskDefault', '新任务') });
      selectedId = task.id;
      showArchived = false;
      paint();
      toast(t('composerHistCreated', '已新建任务'));
      return;
    }
    if (act === 'batch') {
      syncBatchBar();
      return;
    }
    if (!ctxTaskId) return;
    if (act === 'pin') {
      var cur = J.getTask(ctxTaskId);
      J.setPinned(ctxTaskId, !(cur && cur.pinned));
      paint();
      return;
    }
    if (act === 'rename') {
      var t0 = J.getTask(ctxTaskId);
      var next = global.prompt(
        t('composerHistRenamePrompt', '任务名称'),
        (t0 && t0.title) || ''
      );
      if (next == null) return;
      if (!J.renameTask(ctxTaskId, next)) {
        toast(t('composerHistRenameFail', '重命名失败'));
        return;
      }
      paint();
      return;
    }
    if (act === 'archive') {
      var t1 = J.getTask(ctxTaskId);
      var archiving = !(t1 && t1.archived);
      J.setArchived(ctxTaskId, archiving);
      if (archiving && String(selectedId) === String(ctxTaskId)) selectedId = '';
      paint();
      return;
    }
    if (act === 'restore') {
      selectedId = ctxTaskId;
      restoreSelected();
      return;
    }
    if (act === 'delete') {
      if (
        typeof global.confirm === 'function' &&
        !global.confirm(t('composerHistDeleteConfirm', '删除此任务及其时间线？不可撤销。'))
      ) {
        return;
      }
      J.deleteTasks(ctxTaskId);
      if (String(selectedId) === String(ctxTaskId)) selectedId = '';
      delete selectedSet[ctxTaskId];
      paint();
    }
  }

  function runBatch(act) {
    var J = journal();
    if (!J) return;
    var ids = selectedIds();
    if (!ids.length) return;
    if (act === 'pin') {
      J.setPinned(ids, true);
    } else if (act === 'archive') {
      J.setArchived(ids, true);
      ids.forEach(function (id) {
        if (String(selectedId) === String(id)) selectedId = '';
        delete selectedSet[id];
      });
    } else if (act === 'delete') {
      if (
        typeof global.confirm === 'function' &&
        !global.confirm(
          t('composerHistBatchDeleteConfirm', '删除选中的 {n} 个任务？不可撤销。').replace(
            '{n}',
            String(ids.length)
          )
        )
      ) {
        return;
      }
      J.deleteTasks(ids);
      ids.forEach(function (id) {
        if (String(selectedId) === String(id)) selectedId = '';
        delete selectedSet[id];
      });
    }
    paint();
  }

  function onRootClick(e) {
    var ctxBtn = e.target.closest && e.target.closest('[data-ctx-act]');
    if (ctxBtn) {
      var act = ctxBtn.getAttribute('data-ctx-act');
      hideCtx();
      runCtx(act);
      return;
    }
    if (!e.target.closest || !e.target.closest('#composerHistoryCtx')) {
      if (!e.target.closest('#composerHistoryList')) hideCtx();
    }

    var filter = e.target.closest && e.target.closest('[data-hist-filter]');
    if (filter) {
      showArchived = filter.getAttribute('data-hist-filter') === 'archived';
      document.querySelectorAll('[data-hist-filter]').forEach(function (b) {
        b.classList.toggle('is-on', b === filter);
      });
      selectedId = '';
      paint();
      return;
    }

    var batch = e.target.closest && e.target.closest('[data-hist-batch]');
    if (batch) {
      runBatch(batch.getAttribute('data-hist-batch'));
      return;
    }

    if (e.target && e.target.getAttribute && e.target.getAttribute('data-hist-check')) {
      var cid = e.target.getAttribute('data-hist-check');
      selectedSet[cid] = !!e.target.checked;
      if (!e.target.checked) delete selectedSet[cid];
      paintTaskList();
      syncBatchBar();
      e.stopPropagation();
      return;
    }

    var taskBtn = e.target.closest && e.target.closest('[data-hist-task]');
    if (taskBtn) {
      selectedId = taskBtn.getAttribute('data-hist-task') || '';
      var J = journal();
      if (J && selectedId) J.setActiveTask(selectedId);
      paint();
      return;
    }

    if (e.target && e.target.id === 'composerHistoryRestore') {
      restoreSelected();
    }
  }

  function onContextMenu(e) {
    var list = document.getElementById('composerHistoryList');
    if (!list || !list.contains(e.target)) return;
    e.preventDefault();
    var taskBtn = e.target.closest && e.target.closest('[data-hist-task]');
    showCtx(e.clientX, e.clientY, taskBtn ? taskBtn.getAttribute('data-hist-task') : '');
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    var root = document.getElementById('settingsPanelComposerHistory');
    if (root) {
      root.addEventListener('click', onRootClick);
      root.addEventListener('contextmenu', onContextMenu);
    }
    var search = document.getElementById('composerHistorySearch');
    if (search) {
      search.addEventListener('input', function () {
        query = String(search.value || '');
        paintTaskList();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hideCtx();
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('#composerHistoryCtx')) {
        if (!e.target.closest || !e.target.closest('#composerHistoryList')) hideCtx();
      }
    });
  }

  function render() {
    bindOnce();
    var J = journal();
    if (J && J.migrateOnce) J.migrateOnce();
    paint();
  }

  global.OneToneComposerHistoryPanel = {
    render: render,
    paint: paint
  };
})(typeof window !== 'undefined' ? window : globalThis);
