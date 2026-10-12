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
      (act ? '<span class="hn-desk-act">' + esc(act) + '</span>' : '');
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

  function quietMaterialSummaryHtml(summary) {
    summary = summary || {};
    var count = Number(summary.count) || 0;
    if (count <= 0) return '';
    var labels = {
      text: '文字',
      image: '图片',
      file: '文件',
      folder: '目录',
      url: '网址',
      voice: '口述'
    };
    var byKind = summary.byKind || {};
    var bits = [];
    Object.keys(byKind).forEach(function (k) {
      if (!byKind[k]) return;
      bits.push((labels[k] || k) + ' ' + byKind[k]);
    });
    // List lives on Soft Pad tray; home only shows a shallow count line.
    var line =
      '已加入 ' +
      count +
      ' 项' +
      (bits.length ? ' · ' + bits.join(' · ') : '') +
      ' · 详情在悬浮栏';
    var hint =
      Number(summary.manualUploadCount) > 0
        ? '<p class="hn-quiet-mat-hint">本地图片不上传图床；交给网页 Agent 时请自行附上</p>'
        : '';
    return (
      '<div class="hn-quiet-mat-summary" data-hn-mat-summary>' +
      '<div class="hn-quiet-mat-head">' +
      '<span class="hn-quiet-mat-count">' +
      esc(line) +
      '</span>' +
      '<button type="button" class="hn-text-btn" data-hf-act="open_prep">整理</button>' +
      '</div>' +
      hint +
      '</div>'
    );
  }

  function agentTileIconHtml(t) {
    var label = (t && t.label) || (t && t.kind) || 'Agent';
    if (t && t.icon) {
      return (
        '<img class="hn-agent-tile__img" src="' +
        esc(t.icon) +
        '" alt="" decoding="async" width="28" height="28" />'
      );
    }
    var badge = String(label).slice(0, 2);
    return '<span class="hn-agent-tile__badge" aria-hidden="true">' + esc(badge) + '</span>';
  }

  /**
   * Agent icon grid — open app + Soft Pad carries assembled Markdown for paste.
   * opts.probeTargets: { kind, label, icon, installed, channel, running }
   */
  function quietAgentIconGridHtml(targets, disabled) {
    targets = Array.isArray(targets) ? targets : [];
    if (!targets.length) return '';
    var bits = targets.map(function (t) {
      if (!t || !t.kind) return '';
      var label = t.label || t.kind;
      var channel = String(t.channel || 'app');
      var isCli = channel === 'cli' || channel === 'both';
      var cls =
        'hn-agent-tile' +
        (t.installed || t.running ? '' : ' is-dim') +
        (t.running ? ' is-live' : '') +
        (isCli ? ' is-cli' : '');
      var title =
        label +
        (isCli ? (channel === 'both' ? ' · 应用/CLI' : ' · CLI') : '') +
        (t.installed || t.running ? '' : ' · 未检测到安装');
      return (
        '<button type="button" class="' +
        cls +
        '" data-hf-act="quick_handoff" data-hf-handoff-kind="' +
        esc(t.kind) +
        '"' +
        (disabled ? ' disabled' : '') +
        ' title="' +
        esc(title) +
        '">' +
        agentTileIconHtml(t) +
        '<span class="hn-agent-tile__name">' +
        esc(label) +
        '</span>' +
        (isCli
          ? '<span class="hn-agent-tile__tag">' +
            esc(channel === 'both' ? 'CLI+' : 'CLI') +
            '</span>'
          : '') +
        '</button>'
      );
    });
    return (
      '<div class="hn-agent-grid" data-hn-agent-grid aria-label="打开 Agent">' +
      '<p class="hn-agent-grid__hint">点图标打开应用 · 悬浮栏列表可预览，再点「粘贴」进输入框</p>' +
      '<div class="hn-agent-grid__tiles">' +
      bits.join('') +
      '</div></div>'
    );
  }

  /**
   * Quiet opening composer. opts:
   *   draftText, draftPreview, handoffDisabled, materialSummary, probeTargets
   * Handoff = agent icon grid (not a single「复制并打开」CTA).
   * Return mode keeps resume CTA; collect/draft work immediately.
   */
  function quietComposerHtml(vm, opts) {
    opts = opts || {};
    vm = vm || {};
    var isReturn = (vm.mode || '') === 'return';
    var draft = String(opts.draftText || '');
    var disabled = opts.handoffDisabled === true;
    if (!disabled && !draft.trim() && !(opts.materialSummary && opts.materialSummary.count > 0)) {
      disabled = true;
    }
    var headline = isReturn && vm.headline ? vm.headline : '今天想推进什么？';
    var assist = isReturn
      ? String(vm.assistance || '').trim() ||
        '可以从停下的地方继续，也可以直接描述新工作或加入材料。'
      : '直接描述你想完成的工作，也可以加入现有材料。';
    var resumeCta =
      isReturn && vm.primary && vm.primary.id && vm.primary.label
        ? '<button type="button" class="hn-cta" data-hf-act="' +
          esc(vm.primary.id) +
          '">' +
          esc(vm.primary.label) +
          '</button>'
        : '';
    var startNew =
      isReturn && vm.secondary && vm.secondary.id && vm.secondary.label
        ? '<button type="button" class="hn-text-btn" data-hf-act="' +
          esc(vm.secondary.id) +
          '">' +
          esc(vm.secondary.label) +
          '</button>'
        : '';
    return (
      '<section class="hn-quiet-composer" data-hn-quiet-composer aria-label="' +
      esc(headline) +
      '">' +
      '<header class="hn-quiet-head">' +
      '<h1 class="hn-headline">' +
      esc(headline) +
      '</h1>' +
      '<p class="hn-assist">' +
      esc(assist) +
      '</p>' +
      '</header>' +
      '<div class="hn-composer">' +
      '<textarea id="hnQuietDraft" class="hn-composer-input" rows="5" ' +
      'aria-label="描述你想推进的工作" ' +
      'placeholder="例如：把首页改得更直接，新用户打开就知道怎么开始……">' +
      esc(draft) +
      '</textarea>' +
      '<div class="hn-composer-tools" aria-label="加入内容">' +
      '<span class="hn-composer-tools-label">加入内容</span>' +
      '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="capture">截图</button>' +
      '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="paste">粘贴</button>' +
      '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="attach">附件</button>' +
      '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="url">网址</button>' +
      '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="folder">目录</button>' +
      '</div>' +
      quietMaterialSummaryHtml(opts.materialSummary) +
      '</div>' +
      quietContextLine(vm) +
      quietAgentIconGridHtml(opts.probeTargets, disabled) +
      '<div class="hn-actions hn-quiet-actions">' +
      resumeCta +
      startNew +
      (opts.resumeAvailable
        ? '<button type="button" class="hn-text-btn" data-hf-act="restore_return">继续上次工作</button>'
        : '') +
      '<button type="button" class="hn-text-btn" data-hf-act="open_prep">任务复杂？先整理方案</button>' +
      '</div>' +
      '</section>'
    );
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
      '<p class="hn-brand">OneTone</p>' +
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
    navHtml: navHtml,
    evidenceHtml: evidenceHtml,
    heroHtml: heroHtml,
    quietComposerHtml: quietComposerHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
