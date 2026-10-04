/**
 * Shared HomeSnapshot fixtures — 2026-10-03 Now architecture.
 * Modes: quiet | attention | return | degraded
 * Product baseline: v1 情境陈述 (+ v3 progress whisper, v4 evidence recall as techniques)
 */
(function (global) {
  'use strict';

  var runtime = (global.OneToneNowProto = global.OneToneNowProto || {});

  var MODES = ['quiet', 'attention', 'return', 'degraded'];

  var snapshots = {
    quiet: {
      mode: 'quiet',
      updatedAt: '刚刚',
      context: {
        app: 'Cursor',
        project: 'voice-pilot',
        provider: 'Cursor',
        session: '可靠',
        source: '前台窗口 + 已确认工作区',
        freshness: 'live'
      },
      headline: '你正在 Cursor 中处理 voice-pilot。',
      assistance:
        '已识别 Cursor 和 voice-pilot。现在没有需要你处理的事；我会把输入留给 Cursor，需要你时再提醒。',
      presence: {
        line: 'Cursor · voice-pilot · 刚刚更新',
        note: '没有需要你处理的事'
      },
      attention: null,
      continuation: null,
      progress: null,
      evidence: [
        { label: '前台应用', value: 'Cursor' },
        { label: '项目', value: 'voice-pilot（已确认）' },
        { label: '来源', value: '本地窗口 + 工作区路径' },
        { label: '新鲜度', value: '刚刚更新' }
      ],
      channels: { voice: true, keys: true, softPad: true, camera: true }
    },
    attention: {
      mode: 'attention',
      updatedAt: '1 分钟前',
      context: {
        app: 'Cursor',
        project: 'voice-pilot',
        provider: 'Claude',
        session: '等待确认',
        source: 'Claude Hook',
        freshness: 'live'
      },
      headline: 'Claude 正等你确认文件修改。',
      assistance: '我已压住其他提醒，只把这一件事留给你。',
      presence: null,
      attention: {
        title: '确认修改 home-focus-view.js',
        detail: '将调整首页导航与状态文案，不会自动写入。',
        primaryLabel: '查看并决定',
        moreCount: 1
      },
      continuation: null,
      progress: {
        text: '首页架构 · 等待文件确认 · 1 分钟前',
        source: 'Claude Hook',
        allowed: true
      },
      evidence: [
        { label: 'Agent', value: 'Claude' },
        { label: '事件', value: '等待批准（官方 Hook）' },
        { label: '项目', value: 'voice-pilot' },
        { label: '更新', value: '1 分钟前' }
      ],
      channels: { voice: true, keys: true, softPad: true, camera: true }
    },
    return: {
      mode: 'return',
      updatedAt: '今天 14:32',
      context: {
        app: 'Cursor',
        project: 'voice-pilot',
        provider: 'Cursor',
        session: '可恢复',
        source: 'checkpoint',
        freshness: 'cached'
      },
      headline: '你上次停在首页架构设计。',
      assistance: '当前项目仍是 voice-pilot，可以从停下的地方继续。',
      presence: null,
      attention: null,
      continuation: {
        title: '继续上次工作',
        detail: '已保存：信息层级确认 · 四模式状态模型'
      },
      progress: {
        text: '首页架构 · 已确认信息层级 · 今天 14:32',
        source: 'checkpoint',
        allowed: true
      },
      evidence: [
        { label: '恢复点', value: 'checkpoint · 今天 14:32' },
        { label: '项目', value: 'voice-pilot（已确认）' },
        { label: '来源', value: '本地会话摘要（非推测）' }
      ],
      channels: { voice: true, keys: true, softPad: true, camera: true }
    },
    degraded: {
      mode: 'degraded',
      updatedAt: '18 分钟前',
      context: {
        app: 'Cursor',
        project: null,
        provider: 'Cursor',
        session: null,
        source: '前台可识别，项目未确认',
        freshness: 'stale'
      },
      headline: '我暂时无法确认你正在处理的项目。',
      assistance:
        '已检测到 Cursor，但工作区路径还不够可靠。确认项目后，我才能接上上次的进度。',
      presence: {
        line: 'Cursor · 项目未确认 · 18 分钟前',
        note: '不会用猜测填充首页'
      },
      attention: null,
      continuation: null,
      progress: null,
      evidence: [
        { label: '前台', value: 'Cursor' },
        { label: '项目', value: '未能精确匹配' },
        { label: '原因', value: '缺少已确认的工作区路径' },
        { label: '恢复', value: '确认项目，或打开「设置 → 数据源」' }
      ],
      restoreLabel: '确认当前项目',
      channels: { voice: true, keys: true, softPad: true, camera: false }
    }
  };

  runtime.modes = MODES;

  runtime.snapshotFor = function (mode) {
    var key = MODES.indexOf(mode) >= 0 ? mode : 'quiet';
    return JSON.parse(JSON.stringify(snapshots[key]));
  };

  runtime.esc = function (value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  runtime.navHtml = function (active) {
    var esc = runtime.esc;
    var items = [
      { id: 'now', label: '现在' },
      { id: 'habits', label: '我的习惯' },
      { id: 'settings', label: '设置' }
    ];
    return (
      '<nav class="hn-nav" aria-label="主导航">' +
      items
        .map(function (item) {
          var on = item.id === active;
          return (
            '<button type="button" class="hn-nav-item' +
            (on ? ' is-on' : '') +
            '" data-nav="' +
            esc(item.id) +
            '"' +
            (on ? ' aria-current="page"' : '') +
            '>' +
            esc(item.label) +
            '</button>'
          );
        })
        .join('') +
      '</nav>'
    );
  };

  runtime.evidenceHtml = function (snap) {
    var esc = runtime.esc;
    var rows = (snap.evidence || [])
      .map(function (row) {
        return (
          '<div class="hn-ev-row"><span>' +
          esc(row.label) +
          '</span><b>' +
          esc(row.value) +
          '</b></div>'
        );
      })
      .join('');
    return (
      '<details class="hn-evidence">' +
      '<summary>查看判断依据</summary>' +
      '<div class="hn-ev-body">' +
      rows +
      '<div class="hn-ev-extra">' +
      '<button type="button" class="hn-text-btn" data-recall="history">最近工作</button>' +
      '<button type="button" class="hn-text-btn" data-recall="memory">项目要点</button>' +
      '</div></div></details>'
    );
  };

  runtime.drawerHtml = function (id, snap) {
    var esc = runtime.esc;
    if (id === 'history') {
      return (
        '<p class="hn-drawer-lead">从当前情境打开，不是完整历史墙。</p>' +
        '<p><b>首页架构设计</b><br><span class="hn-muted">今天 14:32 · voice-pilot</span></p>'
      );
    }
    if (id === 'memory') {
      return (
        '<p class="hn-drawer-lead">仅当前项目要点。</p>' +
        '<p>首页应优先展示当前情境与正在提供的帮助。</p>'
      );
    }
    return (snap.evidence || [])
      .map(function (row) {
        return (
          '<div class="hn-ev-row"><span>' +
          esc(row.label) +
          '</span><b>' +
          esc(row.value) +
          '</b></div>'
        );
      })
      .join('');
  };

  runtime.toast = function (msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(runtime._toastTimer);
    runtime._toastTimer = setTimeout(function () {
      el.classList.remove('is-on');
    }, 2200);
  };

  /** Product homepage renderer (v1 baseline + folded techniques). */
  runtime.renderHome = function (mode) {
    var snap = runtime.snapshotFor(mode);
    var esc = runtime.esc;

    var cta = '';
    if (snap.mode === 'attention' && snap.attention) {
      cta =
        '<button type="button" class="hn-cta" data-act="decide">' +
        esc(snap.attention.primaryLabel) +
        '</button>';
    } else if (snap.mode === 'return' && snap.continuation) {
      cta =
        '<button type="button" class="hn-cta" data-act="continue">' +
        esc(snap.continuation.title) +
        '</button>';
    } else if (snap.mode === 'degraded') {
      cta =
        '<button type="button" class="hn-cta" data-act="restore">' +
        esc(snap.restoreLabel || '确认当前项目') +
        '</button>';
    }

    var progress =
      snap.progress && snap.progress.allowed
        ? '<div class="hn-whisper" role="status">' +
          '<span class="hn-whisper-dot" aria-hidden="true"></span>' +
          '<span>' +
          esc(snap.progress.text) +
          '</span></div>'
        : '';

    var presence =
      snap.presence
        ? '<div class="hn-presence">' +
          '<p class="hn-presence-line">' +
          esc(snap.presence.line) +
          '</p>' +
          '<p class="hn-presence-note">' +
          esc(snap.presence.note) +
          '</p></div>'
        : '';

    var attnDetail =
      snap.attention && snap.mode === 'attention'
        ? '<p class="hn-sub">' + esc(snap.attention.detail) + '</p>'
        : '';
    var contDetail =
      snap.continuation && snap.mode === 'return'
        ? '<p class="hn-sub">' + esc(snap.continuation.detail) + '</p>'
        : '';
    var more =
      snap.attention && snap.attention.moreCount
        ? '<p class="hn-more">另有 ' +
          esc(String(snap.attention.moreCount)) +
          ' 件可稍后处理</p>'
        : '';

    return (
      '<main class="hn-canvas" data-mode="' +
      esc(snap.mode) +
      '">' +
      '<p class="hn-brand">OneTone</p>' +
      runtime.navHtml('now') +
      '<h1 class="hn-headline">' +
      esc(snap.headline) +
      '</h1>' +
      '<p class="hn-assist">' +
      esc(snap.assistance) +
      '</p>' +
      presence +
      attnDetail +
      contDetail +
      progress +
      more +
      cta +
      runtime.evidenceHtml(snap) +
      '<aside class="hn-drawer" id="recallDrawer" hidden>' +
      '<header><h2 id="recallTitle">详情</h2>' +
      '<button type="button" class="hn-icon" data-act="close-drawer" aria-label="关闭">×</button></header>' +
      '<div class="hn-drawer-body" id="recallBody"></div></aside>' +
      '</main>'
    );
  };
})(typeof window !== 'undefined' ? window : globalThis);
