/**
 * Cursor work progress view — plain-language progress (no Session jargon).
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

  function render(opts) {
    opts = opts || {};
    var title = opts.title || '当前进展';
    var copy = opts.copy || '正在处理中。';
    var events = Array.isArray(opts.events) ? opts.events : [];
    var rows = events
      .slice(0, 8)
      .map(function (e) {
        return (
          '<div class="hf-list-row"><div><b>' +
          esc(e.summary || e.title || '有了新进展') +
          '</b><s>' +
          esc(e.when || '') +
          '</s></div></div>'
        );
      })
      .join('');
    return (
      '<div class="hf-progress" role="dialog" aria-label="查看进展">' +
      '<h3>' +
      esc(title) +
      '</h3>' +
      '<p class="hf-muted">' +
      esc(copy) +
      '</p>' +
      (rows || '<p class="hf-muted">暂时没有更多细节。</p>') +
      '<button type="button" class="hf-secondary" data-hf-act="close_progress">返回</button>' +
      '</div>'
    );
  }

  global.OneToneCursorWorkView = { render: render };
})(typeof window !== 'undefined' ? window : globalThis);
