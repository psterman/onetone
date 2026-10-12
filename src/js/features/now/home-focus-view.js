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
    var line =
      '已加入 ' +
      count +
      ' 项' +
      (bits.length ? ' · ' + bits.join(' · ') : '');
    var chips = (summary.refs || [])
      .map(function (r) {
        if (!r || !r.id) return '';
        var kindLabel = labels[r.kind] || '附件';
        var thumb =
          r.kind === 'image' && r.previewDataUrl
            ? '<img class="hn-mat-chip__thumb" src="' +
              esc(r.previewDataUrl) +
              '" alt="" />'
            : '<span class="hn-mat-chip__kind">' + esc(kindLabel) + '</span>';
        return (
          '<span class="hn-mat-chip" data-hf-mat-id="' +
          esc(r.id) +
          '" title="' +
          esc(kindLabel + ' · ' + (r.name || '')) +
          '">' +
          thumb +
          '<span class="hn-mat-chip__name">' +
          esc(r.name || '素材') +
          '</span>' +
          '<button type="button" class="hn-mat-chip__x" data-hf-act="quiet_remove" data-hf-mat-id="' +
          esc(r.id) +
          '" aria-label="移除 ' +
          esc(r.name || '素材') +
          '">×</button></span>'
        );
      })
      .join('');
    var hint =
      Number(summary.manualUploadCount) > 0
        ? '<p class="hn-quiet-mat-hint">部分材料需在 Agent 中手动上传</p>'
        : '';
    return (
      '<div class="hn-quiet-mat-summary" data-hn-mat-summary>' +
      '<div class="hn-quiet-mat-head">' +
      '<span class="hn-quiet-mat-count">' +
      esc(line) +
      '</span>' +
      '<button type="button" class="hn-text-btn" data-hf-act="open_prep">整理</button>' +
      '</div>' +
      (chips ? '<div class="hn-quiet-mat-chips" aria-label="已加入的附件">' + chips + '</div>' : '') +
      hint +
      '</div>'
    );
  }

  /** Secondary probe jump buttons (MiniMax / WorkBuddy / Cursor / Trae / …). */
  function quietProbeJumpHtml(targets, disabled) {
    targets = Array.isArray(targets) ? targets : [];
    if (!targets.length) return '';
    var bits = targets.map(function (t) {
      if (!t || !t.kind) return '';
      var label = t.label || t.kind;
      return (
        '<button type="button" class="hn-text-btn hn-probe-jump" data-hf-act="quick_handoff" data-hf-handoff-kind="' +
        esc(t.kind) +
        '"' +
        (disabled ? ' disabled' : '') +
        '>' +
        esc('跳转 ' + label) +
        '</button>'
      );
    });
    return (
      '<div class="hn-quiet-probe-jumps" aria-label="跳转到 Agent">' + bits.join('') + '</div>'
    );
  }

  /**
   * Quiet opening composer. opts:
   *   draftText, draftPreview, handoffAct, handoffLabel, handoffDisabled, materialSummary, probeTargets
   */
  function quietComposerHtml(vm, opts) {
    opts = opts || {};
    var draft = String(opts.draftText || '');
    var disabled = !draft.trim() || opts.handoffDisabled === true;
    var act = opts.handoffAct || 'quick_handoff';
    var label = opts.handoffLabel || '复制并打开 Agent';
    return (
      '<section class="hn-quiet-composer" data-hn-quiet-composer aria-label="今天想推进什么">' +
      '<header class="hn-quiet-head">' +
      '<h1 class="hn-headline">今天想推进什么？</h1>' +
      '<p class="hn-assist">直接描述你想完成的工作，也可以加入现有材料。</p>' +
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
      '<div class="hn-actions hn-quiet-actions">' +
      '<button type="button" class="hn-cta" data-hf-act="' +
      esc(act) +
      '"' +
      (disabled ? ' disabled' : '') +
      '>' +
      esc(label) +
      '</button>' +
      quietProbeJumpHtml(opts.probeTargets, disabled) +
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
    var showComposer = mode === 'quiet' && !vm.primary;
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
