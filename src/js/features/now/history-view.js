/**
 * Home secondary views — habits / settings (+ on-demand history/memory helpers).
 * Top nav matches v1: 现在 · 我的习惯 · 设置
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function shell(active, body) {
    var items = [
      { id: 'focus', label: '现在' },
      { id: 'habits', label: '我的习惯' },
      { id: 'settings', label: '设置' }
    ];
    return (
      '<div class="hn-page hn-page--sub" data-hf-mode="sub">' +
      '<p class="hn-brand">OneTone</p>' +
      '<nav class="hn-nav" aria-label="主导航">' +
      items
        .map(function (item) {
          var on = item.id === active;
          return (
            '<button type="button" class="hn-nav-item' +
            (on ? ' is-on' : '') +
            '" data-hf-view="' +
            esc(item.id) +
            '"' +
            (on ? ' aria-current="page"' : '') +
            '>' +
            esc(item.label) +
            '</button>'
          );
        })
        .join('') +
      '</nav>' +
      body +
      '</div>'
    );
  }

  function renderHistory(opts) {
    opts = opts || {};
    var sessions = Array.isArray(opts.sessions) ? opts.sessions : [];
    var rows = sessions
      .map(function (s) {
        return (
          '<div class="hn-ev-row"><span>' +
          esc(s.when || '') +
          '</span><b>' +
          esc(s.title || '未命名工作') +
          '</b></div>'
        );
      })
      .join('');
    return shell(
      'focus',
      '<h1>最近工作</h1>' +
        '<p class="hn-assist">从当前情境打开，不是完整历史墙。</p>' +
        (rows || '<p class="hn-muted">暂时没有历史。</p>') +
        '<button type="button" class="hn-text-btn" data-hf-view="focus">← 返回现在</button>'
    );
  }

  function renderMemory(opts) {
    opts = opts || {};
    var memories = Array.isArray(opts.memories) ? opts.memories : [];
    var rows = memories
      .map(function (m) {
        return (
          '<div class="hn-ev-row"><span>' +
          esc(m.when || '项目记忆') +
          '</span><b>' +
          esc(m.content || '') +
          '</b></div>'
        );
      })
      .join('');
    return shell(
      'focus',
      '<h1>项目要点</h1>' +
        '<p class="hn-assist">仅当前项目要点。</p>' +
        (rows || '<p class="hn-muted">还没有项目记忆。</p>') +
        '<button type="button" class="hn-text-btn" data-hf-view="focus">← 返回现在</button>'
    );
  }

  function renderConnections(opts) {
    opts = opts || {};
    var reason = (opts.source && opts.source.reason) || '';
    var freshness = (opts.source && opts.source.freshness) || '';
    var provider = (opts.provider && opts.provider.status) || '';
    return shell(
      'settings',
      '<h1>连接与数据</h1>' +
        '<p class="hn-assist">本地读取状态（普通用户无需关心细节）。</p>' +
        '<div class="hn-ev-row"><span>准备状态</span><b>' +
        esc(provider || '未知') +
        '</b></div>' +
        '<div class="hn-ev-row"><span>数据新鲜度</span><b>' +
        esc(freshness || '未知') +
        '</b></div>' +
        (reason
          ? '<details class="hn-evidence"><summary>查看原因</summary><pre class="hf-pre">' +
            esc(reason) +
            '</pre></details>'
          : '') +
        '<p><button type="button" class="hn-cta" data-hf-act="retry">重新读取</button></p>' +
        '<button type="button" class="hn-text-btn" data-hf-view="settings">← 返回设置</button>'
    );
  }

  function renderSettings(opts) {
    opts = opts || {};
    return shell(
      'settings',
      '<h1>设置</h1>' +
        '<p class="hn-assist">设备、隐私、数据源与 Agent 接入。链接与数据归入此处。</p>' +
        '<p><button type="button" class="hn-cta" data-hf-view="connections">连接与数据</button></p>' +
        '<p><button type="button" class="hn-text-btn" data-hf-act="open_scenes">管理情景（我的习惯）</button></p>' +
        (opts.legacyNote
          ? '<p class="hn-muted">' + esc(opts.legacyNote) + '</p>'
          : '')
    );
  }

  function renderHabits() {
    return shell(
      'habits',
      '<h1>我的习惯</h1>' +
        '<p class="hn-assist">情景、语义动作与四通道绑定在这里配置，不占用首页。</p>' +
        '<p><button type="button" class="hn-cta" data-hf-act="open_scenes">打开情景管理</button></p>'
    );
  }

  global.OneToneHomeSecondaryViews = {
    renderHistory: renderHistory,
    renderMemory: renderMemory,
    renderConnections: renderConnections,
    renderSettings: renderSettings,
    renderHabits: renderHabits
  };
})(typeof window !== 'undefined' ? window : globalThis);
