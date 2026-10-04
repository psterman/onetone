/**
 * Home Focus view — v1 situational canvas (quiet / attention / return / degraded).
 */
(function (global) {
  'use strict';

  function esc(s) {
    return (global.OneToneHomeFocusAdapter && global.OneToneHomeFocusAdapter.esc
      ? global.OneToneHomeFocusAdapter.esc
      : function (x) {
          return String(x == null ? '' : x);
        })(s);
  }

  function navHtml(active) {
    var items = [
      { id: 'focus', label: '现在' },
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
      '</nav>'
    );
  }

  function evidenceHtml(vm) {
    var rows = (vm.evidence || [])
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
      '<button type="button" class="hn-text-btn" data-hn-recall="history">最近工作</button>' +
      '<button type="button" class="hn-text-btn" data-hn-recall="memory">项目要点</button>' +
      '</div></div></details>'
    );
  }

  function deskRowChipsHtml(row) {
    var chips = [];
    if (row.stale) chips.push({ label: '已过期', tone: 'stale' });
    if (row.sourceBadge) chips.push(row.sourceBadge);
    if (row.confBadge) chips.push(row.confBadge);
    if (row.tierBadge) chips.push(row.tierBadge);
    if (row.matchBadge) chips.push(row.matchBadge);
    if (!chips.length) return '';
    return (
      '<span class="hn-desk-chips">' +
      chips
        .map(function (c) {
          return (
            '<span class="hn-desk-chip hn-desk-chip--' +
            esc(c.tone || 'corr') +
            '">' +
            esc(c.label) +
            '</span>'
          );
        })
        .join('') +
      '</span>'
    );
  }

  function deskRowHtml(row, opts) {
    opts = opts || {};
    var act = opts.act;
    var inner =
      (row.badge
        ? '<span class="hn-desk-badge">' + esc(row.badge) + '</span>'
        : '') +
      '<div><div class="hn-desk-title">' +
      esc(row.title) +
      '</div><div class="hn-desk-sub">' +
      esc(row.detail) +
      (row.note && opts.showNote ? ' · ' + esc(row.note) : '') +
      '</div>' +
      deskRowChipsHtml(row) +
      '</div>' +
      (act
        ? '<span class="hn-desk-act">' + esc(act) + '</span>'
        : '');
    if (opts.button) {
      return (
        '<button type="button" class="hn-desk-row' +
        (row.stale ? ' hn-desk-row--stale' : '') +
        '" data-hf-act="' +
        esc(opts.actId || 'view_progress') +
        '">' +
        inner +
        '</button>'
      );
    }
    return (
      '<div class="hn-desk-row hn-desk-row--static' +
      (row.stale ? ' hn-desk-row--stale' : '') +
      '">' +
      inner +
      '</div>'
    );
  }

  /** Agent living/continue/ledger moved to #homeAgentRoster (Agent Center snapshot). Keep project gate + non-agent attention only. */
  function deskZonesHtml(vm, mode) {
    var desk = (vm && vm.desk) || {};
    var parts = [];
    if (desk.projectGate) {
      var gate = desk.projectGate;
      parts.push(
        '<section class="hn-desk-zone hn-desk-zone--gate" aria-label="项目未确认">' +
          '<header><span class="hn-desk-h">项目</span><span class="hn-desk-meta">未确认</span></header>' +
          deskRowHtml(gate, {
            button: true,
            actId: gate.actId || 'pick_project',
            act: gate.actLabel || '确认项目',
            showNote: false
          }) +
          '</section>'
      );
    }
    // Non-agent attention only (no Soft Pad / registry agent rows).
    var needsRows =
      desk.needsYouRows && desk.needsYouRows.length
        ? desk.needsYouRows
        : desk.needsYou
          ? [desk.needsYou]
          : [];
    var nonAgentNeeds = needsRows.filter(function (row) {
      if (!row) return false;
      if (row.agentKind || row.runtimeKind || row.provider) return false;
      var id = String(row.actId || row.id || '');
      if (/agent|resume|soft.?pad|codex|claude|cursor/i.test(id)) return false;
      return true;
    });
    if (nonAgentNeeds.length) {
      parts.push(
        '<section class="hn-desk-zone hn-desk-zone--needs hn-desk-zone--compact" aria-label="需要处理">' +
          '<header><span class="hn-desk-h">需要处理</span><span class="hn-desk-meta">' +
          nonAgentNeeds.length +
          '</span></header>' +
          nonAgentNeeds
            .slice(0, 2)
            .map(function (row) {
              return deskRowHtml(row, {
                button: true,
                actId: row.actId || (vm.primary && vm.primary.id) || 'view_progress',
                act: row.actLabel || '查看',
                showNote: true
              });
            })
            .join('') +
          '</section>'
      );
    }
    if (desk.reconfirmRows && desk.reconfirmRows.length) {
      parts.push(
        '<section class="hn-desk-zone hn-desk-zone--reconfirm" aria-label="需重新确认">' +
          '<header><span class="hn-desk-h">需重新确认</span><span class="hn-desk-meta">不可操作</span></header>' +
          desk.reconfirmRows
            .map(function (row) {
              return deskRowHtml(row, {
                button: true,
                actId: 'view_progress',
                act: row.actLabel || '了解',
                showNote: true
              });
            })
            .join('') +
          '</section>'
      );
    }
    return parts.length ? '<div class="hn-desk">' + parts.join('') + '</div>' : '';
  }

  function dictateCtaHtml(opts) {
    var listening = !!(opts && opts.listening);
    return (
      '<button type="button" class="hn-cta hn-cta--dictate" data-now-voice' +
      (listening ? ' aria-pressed="true"' : '') +
      '>' +
      (listening ? '倾听中…' : '开始听写') +
      '</button>'
    );
  }

  function agentRosterHostHtml() {
    return (
      '<section class="hn-agent-roster-wrap" aria-label="Agent 名册">' +
      '<div id="homeAgentRoster" class="home-agent-roster" data-home-agent-roster></div>' +
      '</section>'
    );
  }

  function renderFocus(vm, opts) {
    opts = opts || {};
    vm = vm || {};
    var mode = vm.mode || 'quiet';

    // Secondary situational CTA only when not quiet — never replaces 开始听写.
    var secondaryCta = '';
    if (vm.primary && mode !== 'quiet' && vm.primary.id !== 'dictate' && vm.primary.id !== 'listen') {
      secondaryCta =
        '<button type="button" class="hn-text-btn hn-secondary-act" data-hf-act="' +
        esc(vm.primary.id) +
        '">' +
        esc(vm.primary.label) +
        '</button>';
    }
    var secondary = '';
    if (vm.secondary && mode !== 'attention') {
      secondary =
        '<button type="button" class="hn-text-btn hn-secondary-act" data-hf-act="' +
        esc(vm.secondary.id) +
        '">' +
        esc(vm.secondary.label) +
        '</button>';
    }

    var progress =
      vm.progress && vm.progress.allowed && mode !== 'quiet'
        ? '<div class="hn-whisper" role="status">' +
          '<span class="hn-whisper-dot" aria-hidden="true"></span>' +
          '<span>' +
          esc(vm.progress.text) +
          '</span></div>'
        : '';

    var presence =
      vm.presence && mode === 'degraded'
        ? '<div class="hn-presence">' +
          '<p class="hn-presence-line">' +
          esc(vm.presence.line) +
          '</p>' +
          '<p class="hn-presence-note">' +
          esc(vm.presence.note) +
          '</p></div>'
        : '';

    var desk = deskZonesHtml(vm, mode);
    var voice = opts.voiceHtml || '';

    return (
      '<main class="hn-canvas" data-mode="' +
      esc(mode) +
      '" data-hf-mode="' +
      esc(mode) +
      '">' +
      '<p class="hn-brand">OneTone</p>' +
      navHtml('focus') +
      '<h1 class="hn-headline">' +
      esc(vm.headline || '') +
      '</h1>' +
      '<p class="hn-assist">' +
      esc(vm.assistance || '') +
      '</p>' +
      dictateCtaHtml(opts) +
      secondaryCta +
      secondary +
      presence +
      desk +
      progress +
      agentRosterHostHtml() +
      evidenceHtml(vm) +
      '<aside class="hn-drawer" id="hnRecallDrawer" hidden>' +
      '<header><h2 id="hnRecallTitle">详情</h2>' +
      '<button type="button" class="hn-icon" data-hf-act="close_drawer" aria-label="关闭">×</button></header>' +
      '<div class="hn-drawer-body" id="hnRecallBody"></div></aside>' +
      voice +
      '</main>'
    );
  }

  function renderPickPanel(projects) {
    projects = Array.isArray(projects) ? projects : [];
    var rows = projects
      .map(function (p) {
        return (
          '<button type="button" class="hf-pick-row" data-hf-pick-id="' +
          esc(p.id) +
          '" data-hf-pick-root="' +
          esc(p.root || '') +
          '"><b>' +
          esc(p.name || p.id) +
          '</b><s>' +
          esc(String(p.root || '').slice(0, 48)) +
          '</s></button>'
        );
      })
      .join('');
    return (
      '<div class="hf-pick" role="dialog" aria-label="选择项目">' +
      '<h3>选择当前项目</h3>' +
      (rows || '<p class="hf-muted">还没有已知项目</p>') +
      '<button type="button" class="hf-secondary" data-hf-act="close_pick">关闭</button></div>'
    );
  }

  function drawerHtml(id, vm) {
    if (id === 'history') {
      return (
        '<p class="hn-drawer-lead">从当前情境打开，不是完整历史墙。</p>' +
        '<p><b>' +
        esc((vm && vm.title) || '最近工作') +
        '</b><br><span class="hn-muted">' +
        esc((vm && vm.appName) || '') +
        ' · ' +
        esc((vm && vm.projectName) || '') +
        '</span></p>'
      );
    }
    if (id === 'memory') {
      return (
        '<p class="hn-drawer-lead">仅当前项目要点。</p>' +
        '<p>首页应优先展示当前情境与正在提供的帮助。</p>'
      );
    }
    return (vm.evidence || [])
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
  }

  global.OneToneHomeFocusView = {
    renderFocus: renderFocus,
    renderPickPanel: renderPickPanel,
    drawerHtml: drawerHtml,
    navHtml: navHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
