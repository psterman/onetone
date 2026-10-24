/**
 * Home Focus view — situational cockpit (quiet / attention / return / degraded).
 * Prep is a secondary launch card; full prep mounts on expand.
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
    // Settings lives in the workbench sidebar — not duplicated here.
    // 「我的习惯」opens the real habit hub (drawer), not a hard-coded stub page.
    var items = [
      { id: 'focus', label: '现在' },
      { id: 'habits', label: '我的习惯' }
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

  /** PRODUCT: 顶栏「历史」+ Agent 总览 — acts, not hn-nav data-hf-view. */
  function chromeHtml(vm) {
    vm = vm || {};
    // Nav already says「现在」— do not prefix it here (was ellipsed to「现在 · v…」).
    var project = String(vm.projectName || '').trim();
    var where = project || '';
    return (
      '<header class="hn-chrome">' +
      '<div class="hn-chrome-left">' +
      '<p class="hn-brand">OneTone</p>' +
      (where
        ? '<span class="hn-where" title="' + esc(where) + '">' + esc(where) + '</span>'
        : '') +
      '</div>' +
      '<div class="hn-chrome-actions">' +
      '<button type="button" class="hn-top-btn" data-hf-act="open_history" data-voice-phrases="历史|近期对话|打开历史" title="近期对话，用于恢复工作">' +
      '历史<small>近期对话</small></button>' +
      '</div></header>'
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
      (act ? '<span class="hn-desk-act">' + esc(act) + '</span>' : '');
    if (opts.button) {
      var voiceBits = [row.title, row.badge, opts.act, opts.actId || 'view_progress']
        .filter(Boolean)
        .join('|');
      return (
        '<button type="button" class="hn-desk-row' +
        (row.stale ? ' hn-desk-row--stale' : '') +
        '" data-hf-act="' +
        esc(opts.actId || 'view_progress') +
        '" data-voice-phrases="' +
        esc(voiceBits) +
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

  /** Non-agent attention rows only (project gate lives on Hero primary). */
  function deskZonesHtml(vm) {
    var desk = (vm && vm.desk) || {};
    var parts = [];
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

  function ctaToneClass(mode, primaryId) {
    if (mode === 'attention') return ' hn-cta--attention';
    if (mode === 'degraded' || primaryId === 'retry') return ' hn-cta--degraded';
    return '';
  }

  function metaChip(vm) {
    if (vm.mode === 'degraded') {
      return { text: '依据不足', kind: 'err' };
    }
    if (!vm.confirmed && (vm.match === 'probable' || vm.match === 'unknown')) {
      return { text: '未确认 · 不猜测', kind: 'warn' };
    }
    if (vm.mode === 'attention') {
      return { text: '等待确认', kind: 'warn' };
    }
    if (vm.mode === 'running') {
      return { text: '运行中', kind: '' };
    }
    if (vm.mode === 'quiet' && !vm.primary) {
      return { text: '无需处理', kind: '' };
    }
    if (vm.confirmed || vm.match === 'exact') {
      return { text: '已确认', kind: '' };
    }
    return { text: '当前', kind: '' };
  }

  function metaHtml(vm) {
    var chip = metaChip(vm);
    var when =
      (vm.presence && vm.presence.line && '') ||
      '';
    // Prefer freshness from presence line tail or evidence
    var whenLabel = '';
    if (vm.presence && vm.presence.line) {
      var parts = String(vm.presence.line).split('·');
      if (parts.length) whenLabel = parts[parts.length - 1].trim();
    }
    if (!whenLabel && vm.evidence) {
      for (var i = 0; i < vm.evidence.length; i++) {
        if (vm.evidence[i].label === '新鲜度') {
          whenLabel = vm.evidence[i].value;
          break;
        }
      }
    }
    var chipClass =
      'hn-chip' +
      (chip.kind === 'warn' ? ' hn-chip--warn' : chip.kind === 'err' ? ' hn-chip--err' : '');
    return (
      '<p class="hn-meta">' +
      '项目：<b>' +
      esc(vm.projectName || '未知项目') +
      '</b>' +
      '<span class="' +
      chipClass +
      '"><span class="hn-chip-dot" aria-hidden="true"></span>' +
      esc(chip.text) +
      '</span>' +
      (whenLabel ? '<span>' + esc(whenLabel) + '</span>' : '') +
      '</p>'
    );
  }

  function heroHtml(vm) {
    vm = vm || {};
    var mode = vm.mode || 'quiet';
    var primary = vm.primary;
    var secondary = vm.secondary;
    var actions = '';
    if (primary && primary.id && primary.label) {
      actions +=
        '<button type="button" class="hn-cta' +
        ctaToneClass(mode, primary.id) +
        '" data-hf-act="' +
        esc(primary.id) +
        '">' +
        esc(primary.label) +
        '</button>';
    }
    if (secondary && secondary.id && secondary.label) {
      actions +=
        '<button type="button" class="hn-text-btn" data-hf-act="' +
        esc(secondary.id) +
        '">' +
        esc(secondary.label) +
        '</button>';
    }
    return (
      '<section class="hn-hero" aria-live="polite">' +
      '<h1 class="hn-headline">' +
      esc(vm.headline || '') +
      '</h1>' +
      '<p class="hn-assist">' +
      esc(vm.assistance || '') +
      '</p>' +
      '<div class="hn-actions">' +
      actions +
      '</div>' +
      metaHtml(vm) +
      '</section>'
    );
  }

  function triad() {
    return global.OneToneHomeFocusTriad;
  }

  function quietContextLine(vm) {
    var project = String(vm.projectName || '').trim();
    var provider =
      (vm.dto && vm.dto.provider && (vm.dto.provider.id || vm.dto.provider.name)) ||
      '';
    var agent =
      String(provider).toLowerCase().indexOf('codex') >= 0
        ? 'Codex'
        : String(provider).toLowerCase().indexOf('claude') >= 0
          ? 'Claude'
          : String(provider).toLowerCase().indexOf('cursor') >= 0
            ? 'Cursor'
            : String(provider || '').trim();
    if (!project && !agent) return '';
    return (
      '<p class="hn-quiet-context">' +
      (project ? '当前项目：<b>' + esc(project) + '</b>' : '') +
      (project && agent ? ' · ' : '') +
      (agent ? esc(agent) : '') +
      '</p>'
    );
  }

  /**
   * Quiet opening composer — shared Triad Mid (Focus + V2).
   * Handoff = agent icon grid (not a single「复制并打开」CTA).
   */
  function quietComposerHtml(vm, opts) {
    opts = opts || {};
    var T = triad();
    if (!T || !T.composerHtml) {
      return '<section class="hn-quiet-composer" data-hn-quiet-composer><p>Triad unavailable</p></section>';
    }
    return T.composerHtml(vm, {
      draftText: opts.draftText,
      materialSummary: opts.materialSummary,
      handoffDisabled: opts.handoffDisabled,
      probeTargets: opts.probeTargets,
      aimMemory: opts.aimMemory,
      probePending: opts.probePending,
      resumeAvailable: opts.resumeAvailable,
      contextHtml: quietContextLine(vm || {}),
      actPrefix: 'hf'
    });
  }

  function quietGateKeepHtml(opts) {
    opts = opts || {};
    var preview = String(opts.draftPreview || '').trim();
    if (!preview) return '';
    var short = preview.length > 80 ? preview.slice(0, 80) + '…' : preview;
    return (
      '<p class="hn-quiet-keep" data-hn-quiet-keep>' +
      '已保留你的输入，确认项目后继续。' +
      '<span class="hn-quiet-keep-preview">' +
      esc(short) +
      '</span></p>'
    );
  }

  function agentStatusHostHtml() {
    return '<div id="homeAgentStatusHost" class="home-agent-status-host" data-home-agent-status-host hidden></div>';
  }

  function promptPrepHostHtml() {
    return (
      '<div id="homePromptPrepHost" class="home-prompt-prep-host" data-home-prompt-prep data-hpp-expanded="0" hidden></div>'
    );
  }

  function renderFocus(vm, opts) {
    opts = opts || {};
    vm = vm || {};
    var mode = vm.mode || 'quiet';
    var desk = deskZonesHtml(vm);
    var voice = opts.voiceHtml || '';
    // Return keeps resume CTA but mounts Quiet Composer so collect/draft can start immediately.
    var showComposer = (mode === 'quiet' && !vm.primary) || mode === 'return';
    var showGateKeep = mode === 'quiet' && !!vm.primary;
    var mainStage = showComposer
      ? quietComposerHtml(vm, opts)
      : heroHtml(vm) + (showGateKeep ? quietGateKeepHtml(opts) : '');

    return (
      '<main class="hn-canvas" data-mode="' +
      esc(mode) +
      '" data-hf-mode="' +
      esc(mode) +
      '" data-hf-primary="' +
      esc((vm.primary && vm.primary.id) || '') +
      '"' +
      (showComposer ? ' data-hn-quiet-composer="1"' : '') +
      '>' +
      chromeHtml(vm) +
      navHtml('focus') +
      mainStage +
      agentStatusHostHtml() +
      desk +
      '<hr class="hn-divider" />' +
      promptPrepHostHtml() +
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
      return historyDrawerBodyHtml(vm && vm.historyEntries);
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

  /** History drawer body — sessions + home/Soft Pad material journal. */
  function historyDrawerBodyHtml(entries) {
    entries = Array.isArray(entries) ? entries : [];
    var rows = entries
      .map(function (e) {
        var sub = [e.when, e.badge, e.detail].filter(Boolean).join(' · ');
        return (
          '<div class="hn-hist-row" data-hn-hist-kind="' +
          esc(e.kind || 'session') +
          '">' +
          '<b>' +
          esc(e.title || '') +
          '</b>' +
          (sub ? '<span>' + esc(sub) + '</span>' : '') +
          '</div>'
        );
      })
      .join('');
    return (
      '<p class="hn-drawer-lead">近期对话与素材记录 · 用于恢复工作（不是方案台「历史方案」）</p>' +
      (rows || '<p class="hn-muted">暂时没有近期记录。</p>')
    );
  }

  global.OneToneHomeFocusView = {
    renderFocus: renderFocus,
    renderPickPanel: renderPickPanel,
    drawerHtml: drawerHtml,
    historyDrawerBodyHtml: historyDrawerBodyHtml,
    navHtml: navHtml,
    chromeHtml: chromeHtml,
    evidenceHtml: evidenceHtml,
    heroHtml: heroHtml,
    quietComposerHtml: quietComposerHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
