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
    var needsRows =
      desk.needsYouRows && desk.needsYouRows.length
        ? desk.needsYouRows
        : desk.needsYou
          ? [desk.needsYou]
          : [];
    if (needsRows.length) {
      parts.push(
        '<section class="hn-desk-zone hn-desk-zone--needs" aria-label="Needs You">' +
          '<header><span class="hn-desk-h">Needs You</span><span class="hn-desk-meta">' +
          needsRows.length +
          ' 个可处理</span></header>' +
          needsRows
            .map(function (row, idx) {
              return deskRowHtml(row, {
                button: true,
                actId: row.actId || (vm.primary && vm.primary.id) || 'view_progress',
                act:
                  row.actLabel ||
                  (idx === 0 && vm.attention && vm.attention.primaryLabel) ||
                  '查看',
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
          '<header><span class="hn-desk-h">需重新确认</span><span class="hn-desk-meta">不可操作 · 不进 Needs You</span></header>' +
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
    var livingRows =
      desk.livingRows && desk.livingRows.length
        ? desk.livingRows
        : desk.living
          ? [desk.living]
          : [];
    if (livingRows.length) {
      var livingShow = needsRows.length ? livingRows.slice(0, 2) : livingRows;
      parts.push(
        '<section class="hn-desk-zone" aria-label="Living Now">' +
          '<header><span class="hn-desk-h">Living Now</span><span class="hn-desk-meta">' +
          (needsRows.length ? livingShow.length : '可信活跃 · 非等待') +
          '</span></header>' +
          livingShow
            .map(function (row) {
              return deskRowHtml(row, { showNote: !needsRows.length });
            })
            .join('') +
          '</section>'
      );
    }
    if (desk.continueCard) {
      var hasResumeCta = vm.primary && vm.primary.id === 'resume';
      parts.push(
        '<section class="hn-desk-zone" aria-label="Continue">' +
          '<header><span class="hn-desk-h">Continue</span>' +
          (hasResumeCta
            ? ''
            : '<span class="hn-desk-meta">可继续</span>') +
          '</header>' +
          deskRowHtml(
            desk.continueCard,
            hasResumeCta
              ? { showNote: true }
              : { button: true, actId: 'resume', act: '继续', showNote: true }
          ) +
          '</section>'
      );
    }
    var ledgerAgents =
      desk.ledgerAgents && desk.ledgerAgents.length ? desk.ledgerAgents : [];
    var sessionRows = (desk.recent || []).filter(function (r) {
      return r && r.kind !== 'continue';
    });
    // Prefer structured agent queue; fall back to flat ledger.
    if (ledgerAgents.length || sessionRows.length) {
      function groupHtml(label, rows, mark) {
        if (!rows.length) return '';
        // Same-group confidence badge: keep on header if all rows share one label.
        var sharedConf = null;
        var confLabels = {};
        for (var ci = 0; ci < rows.length; ci++) {
          var cb = rows[ci].confBadge && rows[ci].confBadge.label;
          if (cb) confLabels[cb] = (confLabels[cb] || 0) + 1;
        }
        var confKeys = Object.keys(confLabels);
        if (confKeys.length === 1 && confLabels[confKeys[0]] === rows.length) {
          sharedConf = confKeys[0];
        }
        return (
          '<div class="hn-ledger-group">' +
          '<p class="hn-ledger-group-h">' +
          esc(label) +
          ' · ' +
          rows.length +
          (sharedConf
            ? '<span class="hn-ledger-group-badge">' + esc(sharedConf) + '</span>'
            : '') +
          '</p>' +
          rows
            .map(function (r) {
              var row = Object.assign({}, r, {
                title: (mark ? mark + ' ' : '') + (r.title || r.badge || '')
              });
              if (sharedConf) row.confBadge = null;
              return deskRowHtml(row);
            })
            .join('') +
          '</div>'
        );
      }
      var needs = ledgerAgents.filter(function (r) {
        return r.agentKind === 'needsYou';
      });
      var living = ledgerAgents.filter(function (r) {
        return r.agentKind === 'living';
      });
      var idle = ledgerAgents.filter(function (r) {
        return r.agentKind === 'idle';
      });
      var untracked = ledgerAgents.filter(function (r) {
        return r.agentKind === 'untracked' || r.agentKind === 'error';
      });
      var body =
        groupHtml('需要你', needs, '●') +
        groupHtml('在跑', living, '●') +
        groupHtml('空闲', idle, '○') +
        groupHtml('未记录', untracked, '○') +
        groupHtml('最近会话', sessionRows, '');
      var total = ledgerAgents.length + sessionRows.length;
      if (body) {
        parts.push(
          '<section class="hn-desk-zone hn-desk-zone--ledger" aria-label="Agent 台账">' +
            '<header><span class="hn-desk-h">Agent 台账</span><span class="hn-desk-meta">' +
            total +
            '</span></header>' +
            body +
            '</section>'
        );
      }
    } else {
      var ledgerRows =
        desk.ledger && desk.ledger.length
          ? desk.ledger.filter(function (r) {
              return r && r.kind !== 'continue';
            })
          : [];
      if (ledgerRows.length) {
        parts.push(
          '<section class="hn-desk-zone hn-desk-zone--ledger" aria-label="Agent 台账">' +
            '<header><span class="hn-desk-h">Agent 台账</span><span class="hn-desk-meta">' +
            ledgerRows.length +
            '</span></header>' +
            ledgerRows
              .slice(0, 12)
              .map(function (r) {
                return deskRowHtml(r);
              })
              .join('') +
            '</section>'
        );
      }
    }
    if (desk.probeFoot) {
      parts.push(
        '<p class="hn-desk-probe" role="status">' + esc(desk.probeFoot) + '</p>'
      );
    }
    // Quiet: one-line live summary when nothing blocking (no invented rows).
    if (!parts.length && mode === 'quiet' && vm.presence) {
      parts.push(
        '<section class="hn-desk-zone hn-desk-zone--summary" aria-label="现在">' +
          deskRowHtml({
            title: vm.presence.note || '现在没有需要你处理的事',
            detail: vm.presence.line || ''
          }) +
          '</section>'
      );
    }
    return parts.length ? '<div class="hn-desk">' + parts.join('') + '</div>' : '';
  }

  function renderFocus(vm, opts) {
    opts = opts || {};
    vm = vm || {};
    var mode = vm.mode || 'quiet';

    var cta = '';
    if (vm.primary && mode !== 'quiet') {
      cta =
        '<button type="button" class="hn-cta" data-hf-act="' +
        esc(vm.primary.id) +
        '">' +
        esc(vm.primary.label) +
        '</button>';
    }
    // Optional secondary (e.g. pick other project) as text action under CTA
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
      vm.progress && vm.progress.allowed && mode !== 'quiet' && !(vm.desk && (vm.desk.needsYou || vm.desk.living || vm.desk.continueCard))
        ? '<div class="hn-whisper" role="status">' +
          '<span class="hn-whisper-dot" aria-hidden="true"></span>' +
          '<span>' +
          esc(vm.progress.text) +
          '</span></div>'
        : '';

    // Presence is folded into desk summary on quiet; keep for degraded.
    // When desk already has zones, skip redundant presence to avoid double empty feel.
    var hasDesk =
      vm.desk &&
      (vm.desk.projectGate ||
        vm.desk.needsYou ||
        (vm.desk.needsYouRows && vm.desk.needsYouRows.length) ||
        (vm.desk.reconfirmRows && vm.desk.reconfirmRows.length) ||
        vm.desk.living ||
        (vm.desk.livingRows && vm.desk.livingRows.length) ||
        vm.desk.continueCard ||
        (vm.desk.recent && vm.desk.recent.length) ||
        (vm.desk.ledger && vm.desk.ledger.length) ||
        vm.desk.probeFoot);
    var presence =
      vm.presence && mode === 'degraded' && !hasDesk
        ? '<div class="hn-presence">' +
          '<p class="hn-presence-line">' +
          esc(vm.presence.line) +
          '</p>' +
          '<p class="hn-presence-note">' +
          esc(vm.presence.note) +
          '</p></div>'
        : '';

    var desk = deskZonesHtml(vm, mode);
    // Degraded with no Soft Pad rows: still show one honest empty desk line.
    if (!desk && mode === 'degraded' && vm.presence) {
      desk =
        '<div class="hn-desk">' +
        '<section class="hn-desk-zone hn-desk-zone--summary" aria-label="台面">' +
        '<div class="hn-desk-row hn-desk-row--static">' +
        '<div><div class="hn-desk-title">' +
        esc(vm.presence.note || '台面暂无 Agent 等待') +
        '</div><div class="hn-desk-sub">' +
        esc(vm.presence.line || '') +
        '</div></div></div></section></div>';
    }

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
      presence +
      desk +
      progress +
      cta +
      secondary +
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
