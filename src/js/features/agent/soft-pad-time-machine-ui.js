/**
 * Soft Pad Time Machine — project-scoped timeline capsules + automatic checkpoints.
 * File restore only; agent_context is display / post-restore assist.
 */
(function (global) {
  'use strict';

  var NOW_ID = '__now__';
  var selectedId = NOW_ID;
  var lastPreview = null;
  var lastStatus = null;
  var lastRestoreOpId = null;
  var restoreArmedUntil = 0;
  var cachedHeroLabel = null;
  var deskSession = false;
  var loadSeq = 0;
  var autoSaveInFlight = false;
  var autoScheduleKey = '';
  var autoNextAt = 0;
  var autoNextByWorkspace = {};
  var AUTO_HEARTBEAT_MS = 60 * 1000;
  var pendingPreferWorkspace = null;
  var deskLoading = false;
  /** Active paint targets: Soft Pad face by default; Agent「时间胶囊」tab when mount=agent. */
  var mountHosts = { desk: null, detail: null, mode: 'softPad' };

  function deskEl() {
    if (mountHosts.desk && mountHosts.desk.isConnected) return mountHosts.desk;
    return document.getElementById('softPadTmDesk');
  }

  function detailEl() {
    if (mountHosts.detail && mountHosts.detail.isConnected) return mountHosts.detail;
    return document.getElementById('softPadTmDetailHost');
  }

  function resolveAgentMountEls() {
    var frame = document.getElementById('agentProtoFrame');
    var doc = null;
    try {
      doc = frame && (frame.contentDocument || (frame.contentWindow && frame.contentWindow.document));
    } catch (_) {
      doc = null;
    }
    if (!doc) return null;
    var desk = doc.getElementById('agentCapsuleDesk');
    if (!desk) return null;
    return { desk: desk, detail: doc.getElementById('agentCapsuleDetail') };
  }

  function adoptMount(opts) {
    opts = opts || {};
    if (opts.mount === 'agent' || opts.deskEl) {
      var els = opts.deskEl
        ? { desk: opts.deskEl, detail: opts.detailEl || null }
        : resolveAgentMountEls();
      if (els && els.desk) {
        mountHosts.desk = els.desk;
        mountHosts.detail = els.detail || null;
        mountHosts.mode = 'agent';
        return;
      }
    }
    mountHosts.desk = null;
    mountHosts.detail = null;
    mountHosts.mode = 'softPad';
  }

  function feLog(line) {
    try {
      var inv = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
      if (inv) inv('cmd_app_log', { line: String(line || '') }).catch(function () {});
    } catch (_) {}
  }

  function invoke(cmd, args) {
    var ipc = global.OneToneIpc;
    if (ipc && typeof ipc.invoke === 'function') {
      return Promise.resolve(ipc.invoke(cmd, args || {}));
    }
    return Promise.reject(new Error('IPC unavailable'));
  }

  function toast(msg) {
    var t = global.OneToneToast;
    if (t && t.show) {
      try {
        t.show(msg);
      } catch (_) {}
    }
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildAgentContext() {
    var hub = global.OneToneSoftPadHub;
    var snap = hub && hub.getCachedSoftPadRuntime ? hub.getCachedSoftPadRuntime() : null;
    var fg = '';
    try {
      var pub = global.__otSoftPadRuntimeSnapshot;
      if (pub && pub.foregroundKind) fg = String(pub.foregroundKind);
    } catch (_) {}
    if (!fg && snap && snap.snap && snap.snap.foregroundKind) {
      fg = String(snap.snap.foregroundKind);
    }
    var provider = fg || 'unknown';
    var app =
      provider === 'claude'
        ? 'Claude'
        : provider === 'codex'
          ? 'Codex'
          : provider === 'cursor'
            ? 'Cursor'
            : '未知';
    return {
      provider: provider,
      foregroundApp: app,
      observedAt: new Date().toISOString(),
      externalSessionId: null,
      source: fg ? 'foreground_detection' : 'none',
      confidence: 'low'
    };
  }

  function agentLine(ctx) {
    if (!ctx) return '';
    var name = ctx.foregroundApp || ctx.foreground_app || ctx.provider || '';
    if (!name || name === '未知' || name === 'unknown') return '';
    return name + ' 使用期间保存';
  }

  function softPadSelectedMapping() {
    var hub = global.OneToneSoftPadHub;
    if (!hub || typeof hub.getSelectedSoftPadMappingForSubpage !== 'function') return null;
    try {
      var m = hub.getSelectedSoftPadMappingForSubpage();
      return m || null;
    } catch (_) {
      return null;
    }
  }

  function resolveBoundWorkspace() {
    var m = softPadSelectedMapping();
    var path = m && String(m.timeMachineWorkspace || '').trim();
    return path || '';
  }

  function persistBoundWorkspace(path) {
    var m = softPadSelectedMapping();
    if (!m) return false;
    m.timeMachineWorkspace = String(path || '').trim();
    var persist = global.OneToneConfigPersist;
    if (persist && persist.saveAsync) persist.saveAsync();
    else if (persist && persist.save) persist.save();
    return true;
  }

  function triggerLabel(src) {
    if (src === 'scheduled') return '自动存档';
    if (src === 'safety_before_restore') return '恢复前存档';
    if (src === 'restore') return '恢复记录';
    if (src === 'manual') return '手动存档';
    return src || '存档';
  }

  function asDate(iso) {
    var d = iso ? new Date(iso) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  }

  function shortTime(iso) {
    var d = asDate(iso);
    return d
      ? d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '—';
  }

  function relativeTime(iso) {
    var d = asDate(iso);
    if (!d) return '';
    var seconds = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前';
    return Math.floor(seconds / 86400) + ' 天前';
  }

  function dayKey(iso) {
    var d = asDate(iso);
    if (!d) return '更早';
    var now = new Date();
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var days = Math.round((start.getTime() - that.getTime()) / 86400000);
    if (days === 0) return '今天';
    if (days === 1) return '昨天';
    return '更早';
  }

  function shortPath(path) {
    if (!path) return '未选择项目';
    var normalized = String(path).replace(/\\/g, '/').replace(/\/$/, '');
    var parts = normalized.split('/').filter(Boolean);
    return parts.length > 2 ? '…/' + parts.slice(-2).join('/') : normalized;
  }

  function autoLabel(status) {
    if (!status || !status.autoSaveEnabled) return '自动保存已关闭';
    return '自动 · 每 ' + (status.autoSaveIntervalMin || 15) + ' 分钟';
  }

  function workspaceChoices(status) {
    var seen = {};
    var paths = [];
    function push(path) {
      path = String(path || '').trim();
      if (!path || seen[path]) return;
      seen[path] = true;
      paths.push(path);
    }
    push(status && status.workspace);
    (status && status.recentWorkspaces || []).forEach(push);
    return paths;
  }

  function setDeskVisible(on) {
    // Soft Pad face chrome owns #softPadFaceTimeline; Agent capsule host is owned by agent-page setSub.
    var desk = deskEl();
    var detail = detailEl();
    var stage = document.getElementById('softPadHubStage');
    var page = document.getElementById('settingsPanelSoftPad');
    if (stage) stage.classList.remove('is-tm-desk');
    if (page) page.classList.remove('is-tm-desk');
    if (mountHosts.mode === 'agent') {
      if (desk && on) {
        desk.hidden = false;
        desk.removeAttribute('hidden');
      }
      if (detail && !on) detail.innerHTML = '';
      try {
        feLog('fe tm.deskVisible agent on=' + (!!on));
      } catch (_) {}
      return;
    }
    if (desk) {
      if (on) {
        desk.hidden = false;
        desk.removeAttribute('hidden');
      } else {
        desk.hidden = true;
        desk.setAttribute('hidden', '');
      }
    }
    if (detail && !on) {
      detail.innerHTML = '';
    }
    try {
      feLog('fe tm.deskVisible on=' + (!!on) +
        ' hiddenAttr=' + !!(desk && desk.hasAttribute('hidden')));
    } catch (_) {}
  }

  function chromeHtml(status, body) {
    var bound = resolveBoundWorkspace();
    var boundHint = bound
      ? (status && status.workspace && normPath(status.workspace) === normPath(bound)
        ? ' · 已绑到 Soft Pad 场景'
        : ' · Soft Pad 场景绑了另一个文件夹')
      : '';
    return (
      '<header class="soft-pad-tm-chrome">' +
      '<div class="soft-pad-tm-heading"><h3 class="soft-pad-tm-chrome__title">项目时间胶囊</h3>' +
      '<span class="soft-pad-tm-chrome__path" title="' + esc(status && status.workspace) + '">' +
      esc(shortPath(status && status.workspace)) + esc(boundHint) + '</span></div></header>' + body
    );
  }

  function normPath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  }

  function renderL0(status) {
    var desk = deskEl();
    if (!desk) return;
    var gitBlocked = status && status.isGit;
    var choices = workspaceChoices(status);
    var bound = resolveBoundWorkspace();
    if (bound && !choices.some(function (p) { return normPath(p) === normPath(bound); })) {
      choices.unshift(bound);
    }
    var recs = choices.slice(0, 3);
    var recHtml = recs.length && !gitBlocked
      ? '<div class="soft-pad-tm-recs"><div class="soft-pad-tm-recs__label">推荐项目</div>' +
        recs.map(function (path) {
          return '<button type="button" class="soft-pad-tm-rec" data-tm-workspace="' + esc(path) +
            '" title="' + esc(path) + '"><strong>' + esc(shortPath(path)) +
            '</strong><span>点一下接入这个文件夹</span></button>';
        }).join('') + '</div>'
      : '';
    desk.innerHTML = chromeHtml(
      status,
      '<div class="soft-pad-tm-l0"><div class="soft-pad-tm-l0__mark">↶</div>' +
        '<h3 class="soft-pad-tm-l0__title">' +
        (gitBlocked ? '这个项目暂时不能存档' : '选一个正在写的项目文件夹') + '</h3>' +
        '<p class="soft-pad-tm-l0__msg">' +
        esc(gitBlocked
          ? ((status && status.blockReason) || '先处理当前冲突，再回来恢复。')
          : '做错了可以回到刚才。优先选你用 Cursor 或 VS Code 打开过的项目。') +
        '</p>' + recHtml + '<div class="soft-pad-tm-l0__actions">' +
        (gitBlocked ? '' : '<button type="button" class="page-status-btn is-primary" data-tm-act="pick-workspace">选我正在做的项目</button>') +
        '<button type="button" class="page-status-btn" data-tm-act="open-help">更多说明</button>' +
        '</div></div>'
    );
  }

  function opChangeLabel(op) {
    var stats = op && op.stats;
    var changed = Math.max(0, Number(stats && stats.changed) || 0);
    return changed ? changed + ' 项文件变化' : '已保存项目状态';
  }

  function timelineOpHtml(op, status) {
    var isNow = !op;
    var id = isNow ? NOW_ID : op.id;
    var active = id === selectedId;
    var title = isNow ? '当前状态' : (op.label || triggerLabel(op.triggerSource));
    var meta = isNow
      ? Math.max(0, Number(status && status.changedCount) || 0) + ' 项改动'
      : opChangeLabel(op);
    var aside = isNow ? '现在' : shortTime(op.createdAt);
    var agent = isNow ? autoLabel(status) : agentLine(op.agentContext);
    return '<button type="button" class="soft-pad-tm-op' + (isNow ? ' soft-pad-tm-op--now' : '') +
      (active ? ' is-active' : '') + '" data-tm-select="' + esc(id) +
      '" role="listitem" aria-current="' + (active ? 'true' : 'false') + '">' +
      '<span class="soft-pad-tm-op__rail" aria-hidden="true"><i></i></span>' +
      '<span class="soft-pad-tm-op__body"><span class="soft-pad-tm-op__top"><strong>' +
      esc(title) + '</strong><em>' + esc(aside) + '</em></span>' +
      '<span class="soft-pad-tm-op__meta">' + esc(meta) + '</span>' +
      (agent ? '<span class="soft-pad-tm-op__agent">' + esc(agent) + '</span>' : '') +
      '</span></button>';
  }

  function timelineHtml(status, ops) {
    var groups = { '今天': [], '昨天': [], '更早': [] };
    (ops || []).forEach(function (op) {
      groups[dayKey(op.createdAt)].push(op);
    });
    var html = '<div class="soft-pad-tm-list-head"><strong>恢复点</strong><span>' +
      (ops || []).length + ' 个</span></div><div class="soft-pad-tm-timeline" role="list">' +
      '<div class="soft-pad-tm-group soft-pad-tm-group--now">' + timelineOpHtml(null, status) + '</div>';
    ['今天', '昨天', '更早'].forEach(function (label) {
      if (!groups[label].length) return;
      html += '<section class="soft-pad-tm-group" aria-label="' + label + '">' +
        '<h4 class="soft-pad-tm-group__label">' + label + '</h4>' +
        groups[label].map(function (op) { return timelineOpHtml(op, status); }).join('') + '</section>';
    });
    if (!ops || !ops.length) {
      html += '<div class="soft-pad-tm-empty-action"><strong>还没有恢复点</strong>' +
        '<p>保存当前状态后，就能从这里回到它。</p></div>';
    }
    return html + '</div>';
  }

  function fileListHtml(diff) {
    if (!diff || !Array.isArray(diff.files)) return '';
    return diff.files.slice(0, 3).map(function (f) {
      var label = f.status === 'added' ? '新增' : f.status === 'deleted' ? '移走' : f.status === 'renamed' ? '改名' : '改回';
      return '<li class="soft-pad-tm-file soft-pad-tm-file--' + esc(f.status) + '">' +
        '<span>' + esc(label) + '</span><code>' + esc(f.path) + '</code></li>';
    }).join('');
  }

  function diffFromPreview(preview) {
    if (!preview) return null;
    var files = [];
    (preview.overwriteSample || []).forEach(function (path) {
      files.push({ path: path, status: 'modified' });
    });
    (preview.deleteSample || []).forEach(function (path) {
      files.push({ path: path, status: 'deleted' });
    });
    return { files: files };
  }

  function nowDetailHtml(status, ops) {
    status = status || {};
    ops = Array.isArray(ops) ? ops : [];
    var changed = Math.max(0, Number(status.changedCount != null ? status.changedCount : status.changed_count) || 0);
    var checkpointCount = ops.length;
    var recent = status.lastAutoSaveAt
      ? '最近一次自动保存于' + relativeTime(status.lastAutoSaveAt)
      : '有文件变化后，会自动存下一份';
    var tip = status.tipLabel || status.tip_label || '';
    return '<div class="soft-pad-tm-now-card"><div class="soft-pad-tm-detail-head">' +
      '<div><h3>当前状态</h3><p title="' + esc(status.workspace) + '">' +
      esc(shortPath(status.workspace)) + '</p></div><span>' +
      (status.autoSaveEnabled ? '自动保护中' : '自动保护已关闭') + '</span></div>' +
      '<div class="soft-pad-tm-now-summary" aria-label="当前项目状态">' +
      '<div><strong>' + changed + ' 项改动</strong><span>尚未提交</span></div>' +
      '<div><strong>' + checkpointCount + ' 个恢复点</strong><span>可以回到</span></div></div>' +
      '<p class="soft-pad-tm-now-meta">' + esc(tip ? '最近保护点：' + tip : recent) + '</p>' +
      '<p class="soft-pad-tm-safety">恢复旧状态前，会先自动保存现在。</p></div>';
  }

  function checkpointDetailHtml(status, diff, loading) {
    var preview = lastPreview;
    var files = fileListHtml(diff);
    if (loading || !preview) {
      return '<div class="soft-pad-tm-detail-loading"><span></span><strong>正在计算恢复影响</strong>' +
        '<p>时间轴已经可以浏览，文件预览稍后出现。</p></div>';
    }
    return '<div class="soft-pad-tm-impact"><div class="soft-pad-tm-detail-head"><div>' +
      '<h3>回到 ' + esc(shortTime(selectedOpCreatedAt())) + '</h3>' +
      '<p>先确认恢复会影响哪些文件</p></div></div>' +
      '<div class="soft-pad-tm-impact__counts"><div><strong>' + (preview.overwriteCount || 0) +
      '</strong><span>会改回的文件</span></div><div class="is-delete"><strong>' + (preview.deleteCount || 0) +
      '</strong><span>会移走的新文件</span></div></div>' +
      '<p class="soft-pad-tm-safety">只影响当前项目。回去前会先存一份现在。</p>' +
      (status.agentBusy ? '<p class="soft-pad-tm-warn">Agent 正在工作，请停止当前操作后再恢复。</p>' : '') +
      '<button type="button" class="page-status-btn is-primary soft-pad-tm-restore" data-tm-act="restore"' +
      (status.agentBusy ? ' disabled' : '') + '>回到这里</button>' +
      '<p class="soft-pad-tm-keep">' + esc(preview.keepNote || '') + '</p></div>' +
      '<details class="soft-pad-tm-changes" open><summary>看看前 3 个文件</summary>' +
      '<ul class="soft-pad-tm-files">' + (files || '<li class="soft-pad-tm-empty">没有可显示的文件变化</li>') +
      '</ul></details>';
  }

  var currentOps = [];
  function selectedOpCreatedAt() {
    var op = currentOps.find(function (item) { return item.id === selectedId; });
    return op && op.createdAt;
  }

  function managerHeadHtml(status) {
    var savePrimary = selectedId === NOW_ID ? ' is-primary' : '';
    return '<header class="soft-pad-tm-manager-head"><div class="soft-pad-tm-manager-project">' +
      '<h3>项目时间胶囊</h3><p title="' + esc(status.workspace) + '">' +
      esc(shortPath(status.workspace)) + '</p></div><div class="soft-pad-tm-manager-actions">' +
      '<button type="button" class="page-status-btn" data-tm-act="pick-workspace">换项目</button>' +
      '<button type="button" class="page-status-btn' + savePrimary + '" data-tm-act="snapshot">保存当前状态</button>' +
      '</div></header>';
  }

  function protectionSettingsHtml(status) {
    var interval = status.autoSaveIntervalMin || 15;
    return '<section class="soft-pad-tm-protection" aria-labelledby="softPadTmProtectionTitle">' +
      '<div><strong id="softPadTmProtectionTitle">自动保护</strong>' +
      '<span>有文件改动时定时创建恢复点</span></div>' +
      '<div class="soft-pad-tm-autosave-bar" role="group" aria-label="自动保护设置">' +
      '<label class="soft-pad-tm-toggle"><input type="checkbox" data-tm-autosave-toggle' +
      (status.autoSaveEnabled ? ' checked' : '') + '><span></span>' +
      (status.autoSaveEnabled ? '已开启' : '已关闭') + '</label>' +
      '<label class="soft-pad-tm-interval"><span>间隔</span><select data-tm-autosave-interval aria-label="自动保护间隔"' +
      (status.autoSaveEnabled ? '' : ' disabled') + '>' +
      [5, 15, 30, 60].map(function (n) {
        return '<option value="' + n + '"' + (n === interval ? ' selected' : '') + '>' + n + ' 分钟</option>';
      }).join('') + '</select></label></div></section>';
  }

  function renderDesk(status, ops, diff, loading) {
    var desk = deskEl();
    var detailHost = detailEl();
    if (!desk) return;
    lastStatus = status;
    currentOps = ops || [];
    if (!status || status.level === 'L0' || !status.isGit) {
      renderL0(status || {});
      if (detailHost) detailHost.innerHTML = '';
      return;
    }
    var detail = selectedId === NOW_ID ? nowDetailHtml(status, ops) : checkpointDetailHtml(status, diff, loading);
    desk.innerHTML = managerHeadHtml(status) + protectionSettingsHtml(status) +
      '<div class="soft-pad-tm-manager-list" aria-label="当前项目的恢复点">' +
      timelineHtml(status, ops) + '</div>';
    if (detailHost) {
      detailHost.innerHTML =
        '<section class="soft-pad-tm-detail soft-pad-tm-detail--face" aria-live="polite">' +
        detail +
        '<div class="soft-pad-tm-post" id="softPadTmPost" hidden><p>文件已恢复。聊天记录可能还要跟 AI 说一声。</p>' +
        '<details><summary>告诉 AI</summary><div><button type="button" class="page-status-btn is-primary" data-tm-act="remind-agent">提醒 AI 重读文件</button>' +
        '<button type="button" class="page-status-btn" data-tm-act="claude-rewind">复制 /rewind</button>' +
        (lastRestoreOpId ? '<button type="button" class="page-status-btn" data-tm-act="undo-restore">撤销这次恢复</button>' : '') +
        '</div></details></div></section>';
    }
  }

  function heroLabelFromStatus(status) {
    if (!status) return '即将接入';
    if (status.level === 'L0' || !status.isGit) return '未保护';
    if (status.autoSaveEnabled) return '自动 · ' + (status.autoSaveIntervalMin || 15) + 'm';
    if (status.tipLabel) return status.tipLabel;
    return '已保护';
  }

  function refreshStatusBar(status) {
    cachedHeroLabel = heroLabelFromStatus(status);
    var el = document.getElementById('softPadSummaryTm');
    if (el) el.textContent = cachedHeroLabel;
  }

  function renderLoading(status) {
    var desk = deskEl();
    if (!desk) return;
    desk.innerHTML = chromeHtml(
      status || lastStatus || {},
      '<div class="soft-pad-tm-detail-loading"><span></span><strong>正在打开项目时间胶囊</strong>' +
        '<p>读取当前文件夹的恢复点…</p></div>'
    );
  }

  function loadAll(opts) {
    opts = opts || {};
    var seq = ++loadSeq;
    deskLoading = true;
    var t0 = Date.now();
    var prefer = String(opts.workspace || pendingPreferWorkspace || '').trim();
    pendingPreferWorkspace = null;
    feLog('fe tm.load begin prefer=' + (prefer ? shortPath(prefer) : '-') + ' force=' + (!!opts.force));
    if (deskSession) renderLoading(lastStatus);

    var sameWs = prefer && lastStatus && lastStatus.workspace &&
      normPath(prefer) === normPath(lastStatus.workspace);
    var statusPromise;
    if (prefer && !sameWs) {
      statusPromise = invoke('cmd_tm_set_workspace', { path: prefer }).catch(function (err) {
        var msg = String((err && err.message) || err || '');
        feLog('fe tm.set_workspace fail ' + msg);
        // Busy / transient: read status for prefer without rewriting config.
        return invoke('cmd_tm_status', { workspace: prefer });
      });
    } else {
      statusPromise = invoke('cmd_tm_status', prefer ? { workspace: prefer } : {});
    }

    return statusPromise.then(function (status) {
      if (seq !== loadSeq) return status;
      lastStatus = status;
      refreshStatusBar(status);
      syncAutoSchedule(status);
      feLog('fe tm.status ' + (Date.now() - t0) + 'ms level=' + (status && status.level) +
        ' ws=' + shortPath(status && status.workspace));
      if (!status || status.level === 'L0' || !status.isGit) {
        renderDesk(status, [], null, false);
        return status;
      }
      return invoke('cmd_tm_list', { workspace: status.workspace || null }).then(function (ops) {
        if (seq !== loadSeq) return status;
        ops = Array.isArray(ops) ? ops : [];
        feLog('fe tm.list ' + (Date.now() - t0) + 'ms ops=' + ops.length);
        if (selectedId !== NOW_ID && !ops.some(function (op) { return op.id === selectedId; })) {
          selectedId = NOW_ID;
        }
        lastPreview = null;
        renderDesk(status, ops, null, selectedId !== NOW_ID);
        if (selectedId === NOW_ID) return status;
        // One preview call — samples cover the file list. Avoid pairing with diff_summary
        // (both used to lock + snapshot and made Soft Pad 未响应 on large repos).
        return invoke('cmd_tm_preview_restore', {
          workspace: status.workspace || null,
          targetId: selectedId
        }).then(function (preview) {
          if (seq !== loadSeq) return status;
          lastPreview = preview;
          feLog('fe tm.preview ' + (Date.now() - t0) + 'ms ow=' + (preview && preview.overwriteCount) +
            ' del=' + (preview && preview.deleteCount));
          renderDesk(status, ops, diffFromPreview(preview), false);
          return status;
        }).catch(function (err) {
          feLog('fe tm.preview fail ' + String((err && err.message) || err));
          if (seq === loadSeq) renderDesk(status, ops, null, false);
          return status;
        });
      });
    }).then(function (status) {
      if (seq === loadSeq) {
        deskLoading = false;
        feLog('fe tm.load done ' + (Date.now() - t0) + 'ms');
      }
      return status;
    }).catch(function (err) {
      if (seq === loadSeq) deskLoading = false;
      feLog('fe tm.load fail ' + (Date.now() - t0) + 'ms ' + String((err && err.message) || err));
      throw err;
    });
  }

  function openDesk(opts) {
    opts = opts || {};
    adoptMount(opts);
    bindDesk();
    setDeskVisible(true);
    // Agent capsule: prefer explicit workspace (home strip). Soft Pad face still
    // falls back to scenario-bound folder when caller omits workspace.
    if (!opts.workspace && mountHosts.mode !== 'agent') {
      var bound = resolveBoundWorkspace();
      if (bound) opts.workspace = bound;
    }
    var sameSession =
      deskSession && lastStatus && !opts.force && mountHosts.mode !== 'agent';
    var want = String(opts.workspace || '').trim();
    if (sameSession && want && lastStatus.workspace &&
        normPath(want) === normPath(lastStatus.workspace)) {
      ensureDeskVisible();
      return Promise.resolve(lastStatus);
    }
    if (sameSession && !want) {
      ensureDeskVisible();
      return Promise.resolve(lastStatus);
    }
    deskSession = true;
    return loadAll(opts).catch(function (err) {
      toast(String((err && err.message) || err || 'Time Machine 加载失败'));
      renderL0({ blockReason: String((err && err.message) || err) });
    });
  }

  function ensureDeskVisible() { setDeskVisible(true); }
  function closeDesk() {
    setDeskVisible(false);
    deskSession = false;
    mountHosts.desk = null;
    mountHosts.detail = null;
    mountHosts.mode = 'softPad';
  }

  /** Leave Agent「时间胶囊」tab without touching Soft Pad face hosts. */
  function closeAgentMount() {
    if (mountHosts.mode !== 'agent') return;
    closeDesk();
  }

  function remindAgent(kind) {
    var value = kind === 'rewind' ? '/rewind' : '工作区已回滚到 OneTone 恢复点，请重新读取相关文件后再继续。';
    try {
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(value).catch(function () {});
      }
    } catch (_) {}
    toast(kind === 'rewind' ? '已复制 /rewind' : '已复制提醒文案');
  }

  function setPickBusy(on) {
    var desk = deskEl();
    if (!desk) return;
    desk.querySelectorAll('[data-tm-act="pick-workspace"]').forEach(function (btn) {
      btn.disabled = !!on;
    });
  }

  function setAutosaveFromDesk(src) {
    var desk = deskEl();
    if (!desk) return;
    var toggle = (src && src.matches && src.matches('[data-tm-autosave-toggle]'))
      ? src
      : desk.querySelector('[data-tm-autosave-toggle]');
    var select = (src && src.matches && src.matches('[data-tm-autosave-interval]'))
      ? src
      : desk.querySelector('[data-tm-autosave-interval]');
    var enabled = !!(toggle && toggle.checked);
    var intervalMin = Number(select && select.value) || 15;
    feLog('fe tm.autosave.set enabled=' + enabled + ' interval=' + intervalMin);
    return invoke('cmd_tm_set_autosave', { enabled: enabled, intervalMin: intervalMin })
      .then(function (status) {
        lastStatus = status;
        refreshStatusBar(status);
        autoScheduleKey = '';
        syncAutoSchedule(status);
        toast(enabled ? '定时保存已开启' : '定时保存已关闭');
        return loadAll({ force: true });
      })
      .catch(function (e) {
        feLog('fe tm.autosave.set fail ' + String((e && e.message) || e));
        toast(String((e && e.message) || e));
        return loadAll({ force: true });
      });
  }

  function onAct(act) {
    if (act === 'back') {
      var hub = global.OneToneSoftPadHub;
      if (hub && typeof hub.setSoftPadFace === 'function') hub.setSoftPadFace('pad');
      else if (hub && typeof hub.closeSubpage === 'function') hub.closeSubpage();
      else closeDesk();
      return;
    }
    if (act === 'pick-workspace') {
      setPickBusy(true);
      return invoke('cmd_tm_pick_workspace', {}).then(function (status) {
        selectedId = NOW_ID;
        lastStatus = status;
        refreshStatusBar(status);
        if (status && status.isGit && status.workspace && softPadSelectedMapping()) {
          persistBoundWorkspace(status.workspace);
          toast('项目已接入，并绑到当前 Soft Pad 场景');
        } else {
          toast(status && status.isGit ? '项目已接入自动保护' : '已选择目录，但还不是 Git 仓库');
        }
        return loadAll({ force: true });
      }).catch(function (e) {
        var msg = String((e && e.message) || e || '');
        if (msg.indexOf('取消') < 0) toast(msg || '选择目录失败');
      }).then(function () { setPickBusy(false); });
    }
    if (act === 'bind-soft-pad') {
      if (!lastStatus || !lastStatus.workspace) {
        toast('请先接入一个项目文件夹');
        return;
      }
      if (!softPadSelectedMapping()) {
        toast('请先在 Soft Pad 选中一个应用场景');
        return;
      }
      persistBoundWorkspace(lastStatus.workspace);
      toast('已把当前胶囊绑到 Soft Pad 场景');
      return loadAll({ force: true });
    }
    if (act === 'open-help') {
      toast('时间胶囊是这个项目的后悔药：只保护你选的项目文件夹，有改动时自动存档；需要项目本身已经有版本记录。');
      return;
    }
    if (act === 'snapshot') {
      feLog('fe tm.snapshot begin');
      return invoke('cmd_tm_create', { triggerSource: 'manual', agentContext: buildAgentContext() })
        .then(function () { toast('现在已经存好了'); return loadAll({ force: true }); })
        .catch(function (e) { toast(String((e && e.message) || e)); });
    }
    if (act === 'restore') {
      if (selectedId === NOW_ID || !lastPreview) return;
      var del = lastPreview.deleteCount || 0;
      // Avoid window.confirm — WebView2 native modals mark the host window 未响应.
      if (Date.now() > restoreArmedUntil) {
        restoreArmedUntil = Date.now() + 4000;
        toast('再点一次「回到这里」确认（约改 ' + (lastPreview.overwriteCount || 0) +
          ' 个、移走 ' + del + ' 个）');
        return;
      }
      restoreArmedUntil = 0;
      feLog('fe tm.restore begin target=' + selectedId + ' del=' + del);
      return invoke('cmd_tm_restore', {
        targetId: selectedId,
        confirmDeleteCount: del,
        agentContext: buildAgentContext()
      }).then(function (res) {
        lastRestoreOpId = res && res.restoreOpId;
        toast((res && res.message) || '文件已恢复');
        selectedId = NOW_ID;
        return loadAll({ force: true }).then(function () {
          var detail = detailEl();
          var post = detail && detail.querySelector('#softPadTmPost');
          if (post) post.hidden = false;
        });
      }).catch(function (e) {
        feLog('fe tm.restore fail ' + String((e && e.message) || e));
        toast(String((e && e.message) || e));
      });
    }
    if (act === 'undo-restore' && lastRestoreOpId) {
      return invoke('cmd_tm_undo_restore', { restoreOpId: lastRestoreOpId, agentContext: buildAgentContext() })
        .then(function () { toast('已回到恢复前'); lastRestoreOpId = null; return loadAll({ force: true }); })
        .catch(function (e) { toast(String((e && e.message) || e)); });
    }
    if (act === 'remind-agent') remindAgent('reread');
    if (act === 'claude-rewind') remindAgent('rewind');
  }

  function bindDesk() {
    var desk = deskEl();
    var detail = detailEl();
    function onClick(ev) {
      var sel = ev.target.closest && ev.target.closest('[data-tm-select]');
      if (sel) {
        selectedId = sel.getAttribute('data-tm-select') || NOW_ID;
        lastPreview = null;
        loadAll({ force: true });
        return;
      }
      var btn = ev.target.closest && ev.target.closest('[data-tm-act]');
      if (btn) onAct(btn.getAttribute('data-tm-act'));
      var workspaceBtn = ev.target.closest && ev.target.closest('[data-tm-workspace]');
      if (workspaceBtn) {
        selectWorkspace(workspaceBtn.getAttribute('data-tm-workspace'));
      }
    }
    function onChange(ev) {
      var t = ev.target;
      if (!t) return;
      if (t.matches && t.matches('[data-tm-autosave-toggle], [data-tm-autosave-interval]')) {
        setAutosaveFromDesk(t);
      }
    }
    if (desk && desk.dataset.tmBound !== '1') {
      desk.dataset.tmBound = '1';
      desk.addEventListener('click', onClick);
      desk.addEventListener('change', onChange);
    }
    if (detail && detail.dataset.tmBound !== '1') {
      detail.dataset.tmBound = '1';
      detail.addEventListener('click', onClick);
    }
  }

  // Overdue lastAuto must NOT collapse to "due now" — that stampedes git add on
  // enable (last save hours ago) and holds TM_LOCK while Soft Pad looks 假死.
  function nextDueAt(lastAutoIso, intervalMs, priorDue) {
    var lastAuto = asDate(lastAutoIso);
    var natural = lastAuto ? lastAuto.getTime() + intervalMs : 0;
    if (natural > Date.now()) return natural;
    if (priorDue && priorDue > Date.now()) return priorDue;
    return Date.now() + AUTO_HEARTBEAT_MS;
  }

  function syncAutoSchedule(status) {
    var key = status
      ? [status.workspace, status.autoSaveEnabled, status.autoSaveIntervalMin].join('|')
      : '';
    if (key !== autoScheduleKey) {
      autoScheduleKey = key;
      var intervalMs = ((status && status.autoSaveIntervalMin) || 15) * 60000;
      autoNextAt = status && status.autoSaveEnabled
        ? nextDueAt(status.lastAutoSaveAt, intervalMs, autoNextAt)
        : 0;
    }
  }

  function syncWorkspaceSchedule(status) {
    if (!status || !status.workspace) return;
    var intervalMs = (status.autoSaveIntervalMin || 15) * 60000;
    autoNextByWorkspace[status.workspace] = nextDueAt(
      status.lastAutoSaveAt,
      intervalMs,
      autoNextByWorkspace[status.workspace]
    );
  }

  function selectWorkspace(path) {
    if (!path) return;
    return invoke('cmd_tm_set_workspace', { path: path }).then(function (status) {
      selectedId = NOW_ID;
      lastStatus = status;
      refreshStatusBar(status);
      syncAutoSchedule(status);
      toast('已切换到这个项目胶囊');
      return loadAll({ force: true });
    }).catch(function (e) { toast(String((e && e.message) || e)); });
  }

  function softPadUiOpen() {
    try {
      var ui = global.OneToneState && global.OneToneState.ui;
      if (ui && ui.drawerOpen && ui.settingsPanel === 'softPad') return true;
    } catch (_) {}
    return false;
  }

  function autoSaveHeartbeat() {
    // Soft Pad open (layout/runtime/TM) or TM desk — create holds TM_LOCK and the
    // settings window goes 未响应. Only snapshot when the drawer is closed.
    if (autoSaveInFlight || deskLoading || deskSession || softPadUiOpen()) return;
    autoSaveInFlight = true;
    invoke('cmd_tm_status', {}).then(function (status) {
      lastStatus = status;
      refreshStatusBar(status);
      syncAutoSchedule(status);
      if (!status || !status.autoSaveEnabled) return null;
      if (softPadUiOpen() || deskSession) return null;
      var candidates = workspaceChoices(status);
      if (!candidates.length) return null;
      return candidates.reduce(function (chain, workspace) {
        return chain.then(function () {
          if (deskLoading || deskSession || softPadUiOpen()) return null;
          return invoke('cmd_tm_status', { workspace: workspace }).then(function (workspaceStatus) {
            syncWorkspaceSchedule(workspaceStatus);
            if (!workspaceStatus || workspaceStatus.level === 'L0' || !workspaceStatus.workspace) return null;
            if (Date.now() < (autoNextByWorkspace[workspace] || autoNextAt)) return null;
            feLog('fe tm.autosave try ' + shortPath(workspace));
            return invoke('cmd_tm_create', {
              workspace: workspace,
              triggerSource: 'scheduled',
              agentContext: buildAgentContext()
            }).then(function (result) {
              var retrySoon = result && (result.skippedReason === 'busy' ||
                result.skippedReason === 'conflict' || result.skippedReason === 'mutating');
              var intervalMs = (workspaceStatus.autoSaveIntervalMin || 15) * 60000;
              autoNextByWorkspace[workspace] = Date.now() + (retrySoon ? AUTO_HEARTBEAT_MS : intervalMs);
              if (result && result.created) {
                feLog('fe tm.autosave created ' + shortPath(workspace));
                refreshHero();
              }
              return result;
            }).catch(function (err) {
              feLog('fe tm.autosave fail ' + String((err && err.message) || err));
              autoNextByWorkspace[workspace] = Date.now() + AUTO_HEARTBEAT_MS;
              return null;
            });
          });
        });
      }, Promise.resolve());
    }).catch(function () {
      autoNextAt = Date.now() + AUTO_HEARTBEAT_MS;
    }).then(function () { autoSaveInFlight = false; });
  }

  function takeSnapshot() { return onAct('snapshot'); }
  function refreshHero() {
    var bound = resolveBoundWorkspace();
    var args = bound ? { workspace: bound } : {};
    return invoke('cmd_tm_status', args).then(function (st) {
      lastStatus = st;
      refreshStatusBar(st);
      syncAutoSchedule(st);
      return st;
    }).catch(function () { return null; });
  }

  global.setInterval(autoSaveHeartbeat, AUTO_HEARTBEAT_MS);
  global.setTimeout(autoSaveHeartbeat, 5000);

  global.OneToneSoftPadTimeMachine = {
    openDesk: openDesk,
    ensureDeskVisible: ensureDeskVisible,
    closeDesk: closeDesk,
    closeAgentMount: closeAgentMount,
    bindDesk: bindDesk,
    takeSnapshot: takeSnapshot,
    refreshHero: refreshHero,
    buildAgentContext: buildAgentContext,
    resolveBoundWorkspace: resolveBoundWorkspace,
    heroLabel: function () { return cachedHeroLabel; }
  };
})(window);
