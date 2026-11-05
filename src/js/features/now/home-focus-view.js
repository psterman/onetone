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
    // Kept for secondary pages / tests; Focus canvas uses chromeHtml intent row.
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

  /** Prefer on-disk SVG under icons/app-target (presets may still say .png). */
  function chromeAppIconHtml(vm) {
    var fg = (vm && vm.dto && vm.dto.foreground) || {};
    var appId = String(fg.appId || fg.appTargetId || '').trim();
    var appName = String(
      (vm && vm.appName) || fg.appName || ''
    ).trim();
    var src = '';
    var P = global.OneToneAppTargetPresets;
    if (P && P.presetById && appId) {
      var preset = P.presetById(appId);
      if (preset && preset.icon) src = String(preset.icon);
    }
    if (!src && P && Array.isArray(P.presets) && appName) {
      var list = P.presets;
      var low = appName.toLowerCase();
      for (var i = 0; i < list.length; i++) {
        var row = list[i];
        if (!row || !row.icon) continue;
        var nm = String(row.id || '').toLowerCase();
        var leaf = nm.split('-')[0];
        if (leaf && low.indexOf(leaf) >= 0) {
          src = String(row.icon);
          break;
        }
      }
    }
    if (src) {
      src = src.replace(/\.png$/i, '.svg');
      return (
        '<img class="hn-ctx-app-ico" src="' +
        esc(src) +
        '" alt="" width="16" height="16" decoding="async" />'
      );
    }
    return '<span class="hn-ctx-dot" aria-hidden="true"></span>';
  }

  /**
   * Top: app + project (left) | 对话/工作 intent | habits + history.
   * Project lives here — not in the compose Agent chip.
   */
  function chromeHtml(vm, opts) {
    vm = vm || {};
    opts = opts || {};
    var intent = opts.intent === 'work' ? 'work' : 'chat';
    var project = String(vm.projectName || '').trim();
    var app =
      String((vm.appName || (vm.dto && vm.dto.foreground && vm.dto.foreground.appName) || '').trim()) ||
      '';
    var projectConfirmed = !!vm.confirmed;
    var projAct = projectConfirmed ? 'pick_project' : 'confirm_project';
    var appBit = app
      ? '<span class="hn-ctx-app">' + esc(app) + '</span>'
      : '<span class="hn-ctx-app is-empty">前台应用</span>';
    var projBit =
      '<button type="button" class="hn-ctx-proj' +
      (project && projectConfirmed ? '' : ' is-empty') +
      '" data-hf-act="' +
      esc(projAct) +
      '" title="项目" data-voice-phrases="项目|选择项目">' +
      esc(project || '未选项目') +
      '</button>';
    return (
      '<header class="hn-chrome hn-chrome--proto">' +
      '<div class="hn-chrome-start">' +
      '<div class="hn-ctx-pair" aria-label="当前应用与项目">' +
      chromeAppIconHtml(vm) +
      appBit +
      '<span class="hn-ctx-sep" aria-hidden="true">·</span>' +
      projBit +
      '</div></div>' +
      '<div class="hn-intent" role="group" aria-label="下一步意图">' +
      '<button type="button" class="hn-intent-btn" data-hf-act="set_intent" data-hf-intent="chat" aria-pressed="' +
      (intent === 'chat' ? 'true' : 'false') +
      '">对话<small>讨论 · 不改文件</small></button>' +
      '<button type="button" class="hn-intent-btn" data-hf-act="set_intent" data-hf-intent="work" aria-pressed="' +
      (intent === 'work' ? 'true' : 'false') +
      '">工作<small>可改项目文件</small></button>' +
      '</div>' +
      '<div class="hn-chrome-actions">' +
      '<button type="button" class="hn-hist-btn" data-hf-act="open_history" data-voice-phrases="历史|近期对话|打开历史" title="历史 · 查找与恢复" aria-label="历史">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
      '<path d="M12 7v5l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M4.5 12a7.5 7.5 0 1 0 1.7-4.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
      '<path d="M4 5.5V9h3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg></button>' +
      '</div></header>'
    );
  }

  function agentDisplayName(vm) {
    var provider =
      (vm && vm.dto && vm.dto.provider && (vm.dto.provider.id || vm.dto.provider.name)) ||
      (vm && vm.desk && vm.desk.continueCard && (vm.desk.continueCard.badge || vm.desk.continueCard.provider)) ||
      '';
    var p = String(provider).toLowerCase();
    if (p.indexOf('codex') >= 0) return 'Codex';
    if (p.indexOf('claude') >= 0) return 'Claude';
    if (p.indexOf('cursor') >= 0) return 'Cursor';
    if (p.indexOf('workbuddy') >= 0 || p.indexOf('wb') >= 0) return 'WorkBuddy';
    return String(provider || '').trim() || 'Agent';
  }

  function agentIcoLetters(name) {
    var n = String(name || 'Ag');
    if (n === 'WorkBuddy') return 'WB';
    if (n === 'Cursor') return 'Cu';
    if (n === 'Claude') return 'Cl';
    if (n === 'Codex') return 'Cx';
    return n.slice(0, 2);
  }

  function agentIcoTone(name) {
    if (name === 'Cursor') return ' is-cursor';
    if (name === 'WorkBuddy') return ' is-wb';
    return '';
  }

  /** Prefer catalog brand icon over letter tile (Cursor 「Cu」 looked wrong). */
  function agentIcoInnerHtml(name) {
    var S = global.OneToneHomeAgentV2Store;
    var list = S && S.catalogList ? S.catalogList() : [];
    var n = String(name || '').trim();
    var i;
    for (i = 0; i < list.length; i++) {
      var cat = list[i];
      if (!cat || !cat.icon) continue;
      if (String(cat.name || '') === n || String(cat.id || '').toLowerCase() === n.toLowerCase()) {
        return (
          '<img class="hn-task-card__ico-img" src="' +
          esc(cat.icon) +
          '" alt="" decoding="async" />'
        );
      }
    }
    return esc(agentIcoLetters(name));
  }

  function statusPillForMode(mode) {
    if (mode === 'attention') return { label: '等你决定', tone: 'wait' };
    if (mode === 'return') return { label: '可恢复', tone: 'resume' };
    if (mode === 'running') return { label: '执行中', tone: 'run' };
    if (mode === 'degraded') return { label: '失败', tone: 'fail' };
    return { label: '当前', tone: 'idle' };
  }

  /**
   * Task card: no technical evidence pills (probe= / 来源码).
   * Full evidence stays in drawer「判断依据」via evidenceHtml.
   */
  function evidencePillsHtml(_vm) {
    return '';
  }

  /** Idle invite — one headline, one fact; compose owns the action surface. */
  function idleInviteHtml(opts) {
    opts = opts || {};
    var intent = opts.intent === 'work' ? 'work' : 'chat';
    var hasTask = !!opts.hasTask;
    var title = intent === 'work' ? '写一句，开始改' : '写一句，开始';
    var fact = hasTask
      ? '先写新的，或继续下面的任务。'
      : intent === 'work'
        ? '没有正在推进的任务。描述要改的文件或功能，再送到桌面 Agent。'
        : '没有正在推进的任务。问模型或送到桌面都可以。';
    return (
      '<section class="hn-invite" aria-labelledby="hnInviteTitle">' +
      '<p class="hn-kicker"><button type="button" data-hf-act="open_prep">整理并交接</button></p>' +
      '<h1 id="hnInviteTitle">' +
      esc(title) +
      '</h1>' +
      '<p class="hn-invite-fact">' +
      esc(fact) +
      '</p></section>'
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

  /**
   * Task status card — one current state + one next action.
   * Used when mode is attention / return / running / degraded (not idle quiet).
   */
  function taskCardHtml(vm) {
    vm = vm || {};
    var mode = vm.mode || 'quiet';
    var primary = vm.primary;
    var secondary = vm.secondary;
    var agent = agentDisplayName(vm);
    var pill = statusPillForMode(mode);
    var project = String(vm.projectName || '').trim();
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
    var sub =
      (project ? project + ' · ' : '') +
      (mode === 'attention'
        ? '等你决定'
        : mode === 'return'
          ? '可恢复'
          : mode === 'running'
            ? '执行中'
            : mode === 'degraded'
              ? '执行失败'
              : '当前');
    return (
      '<section class="hn-task-card" data-hn-task-card data-mode="' +
      esc(mode) +
      '" aria-live="polite">' +
      '<div class="hn-task-card__hd">' +
      '<span class="hn-task-card__ico' +
      agentIcoTone(agent) +
      '" aria-hidden="true">' +
      agentIcoInnerHtml(agent) +
      '</span>' +
      '<div class="hn-task-card__who">' +
      '<b>' +
      esc(agent) +
      '</b>' +
      '<span>' +
      esc(sub) +
      '</span></div>' +
      '<span class="hn-status-pill hn-status-pill--' +
      esc(pill.tone || 'idle') +
      '">' +
      esc(pill.label) +
      '</span></div>' +
      '<h1 class="hn-task-card__title">' +
      esc(vm.headline || '') +
      '</h1>' +
      '<p class="hn-task-card__fact">' +
      esc(vm.assistance || '') +
      '</p>' +
      evidencePillsHtml(vm) +
      (actions ? '<div class="hn-actions hn-task-card__acts">' + actions + '</div>' : '') +
      '</section>'
    );
  }

  /** @deprecated thin wrapper — prefer taskCardHtml for non-quiet */
  function heroHtml(vm) {
    vm = vm || {};
    if ((vm.mode || 'quiet') !== 'quiet' || (vm.primary && vm.primary.id)) {
      return taskCardHtml(vm);
    }
    var primary = vm.primary;
    var secondary = vm.secondary;
    var actions = '';
    if (primary && primary.id && primary.label) {
      actions +=
        '<button type="button" class="hn-cta' +
        ctaToneClass(vm.mode, primary.id) +
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
    var secondary = !!opts.secondaryCompose;
    var matSummary =
      global.OneToneHomeFocusTriad && global.OneToneHomeFocusTriad.materialSummaryHtml
        ? global.OneToneHomeFocusTriad.materialSummaryHtml(opts.materialSummary)
        : '';
    // After dismiss-return: one link to bring the task card back.
    var restore =
      !secondary && opts.resumeAvailable
        ? '<div class="hn-actions hn-quiet-actions"><button type="button" class="hn-text-btn" data-hf-act="restore_return">继续上次工作</button></div>'
        : '';
    // ha2 compose dock embeds here — real model rail / + materials / ↑ send.
    return (
      '<section class="hn-quiet-composer hn-quiet-composer--ha2' +
      (secondary ? ' is-secondary' : '') +
      '" data-hn-quiet-composer aria-label="' +
      esc(secondary ? '发起另一项任务' : '写一句开始') +
      '">' +
      (secondary ? '<p class="hn-other-task-label">发起另一项任务</p>' : '') +
      '<div class="hn-ha2-compose-host is-home-agent-v2" data-hf-ha2-compose-host data-ha2-dock-host></div>' +
      '<div data-ha2-picker-host></div>' +
      restore +
      matSummary +
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
    var intent = opts.intent === 'work' ? 'work' : 'chat';
    // Proto step1: invite → compose → task card (card below input, not above).
    var idleQuiet = mode === 'quiet' && !vm.primary;
    var showGateKeep = mode === 'quiet' && !!vm.primary;
    var showTaskCard = !idleQuiet;
    var composeOpts = Object.assign({}, opts, {
      secondaryCompose: false,
      intent: intent
    });
    var mainStage =
      idleInviteHtml({ intent: intent, hasTask: showTaskCard }) +
      quietComposerHtml(vm, composeOpts) +
      (showGateKeep ? quietGateKeepHtml(opts) : '') +
      (showTaskCard ? taskCardHtml(vm) : '');

    return (
      '<main class="hn-canvas hn-canvas--proto" data-mode="' +
      esc(mode) +
      '" data-hf-mode="' +
      esc(mode) +
      '" data-hf-intent="' +
      esc(intent) +
      '" data-hf-primary="' +
      esc((vm.primary && vm.primary.id) || '') +
      '"' +
      (showTaskCard ? ' data-hn-task-card="1" data-hn-has-task="1"' : '') +
      ' data-hn-quiet-composer="1"' +
      '>' +
      chromeHtml(vm, { intent: intent }) +
      '<div class="hn-stage' +
      (showTaskCard ? ' has-task' : '') +
      '">' +
      mainStage +
      agentStatusHostHtml() +
      desk +
      '</div>' +
      '<hr class="hn-divider" />' +
      promptPrepHostHtml() +
      '<div class="ha2-wb-page-host" data-ha2-wb-page-host hidden></div>' +
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

  function histBucket(e) {
    var k = String((e && e.kind) || '');
    if (k === 'draft' || k === 'materials') return 'open';
    if (k === 'session') return 'resume';
    if (k === 'handoff') return 'open';
    return 'recent';
  }

  function histRowsHtml(entries) {
    return entries
      .map(function (e) {
        var sub = [e.when, e.badge, e.detail].filter(Boolean).join(' · ');
        return (
          '<div class="hn-hist-row" data-hn-hist-kind="' +
          esc(e.kind || 'session') +
          '" data-hn-hist-bucket="' +
          esc(histBucket(e)) +
          '">' +
          '<b>' +
          esc(e.title || '') +
          '</b>' +
          (sub ? '<span>' + esc(sub) + '</span>' : '') +
          '</div>'
        );
      })
      .join('');
  }

  /** History drawer — tabs: 最近 / 未完成 / 可恢复. */
  function historyDrawerBodyHtml(entries, activeTab) {
    entries = Array.isArray(entries) ? entries : [];
    var tab = activeTab === 'open' || activeTab === 'resume' ? activeTab : 'recent';
    var filtered =
      tab === 'recent'
        ? entries
        : entries.filter(function (e) {
            return histBucket(e) === tab;
          });
    var rows = histRowsHtml(filtered);
    var empty =
      tab === 'open'
        ? '没有未完成的草稿或素材。'
        : tab === 'resume'
          ? '没有可恢复的对话。'
          : '暂时没有近期记录。';
    return (
      '<div class="hn-hist-tabs" role="tablist" aria-label="历史分类">' +
      '<button type="button" role="tab" class="hn-hist-tab' +
      (tab === 'recent' ? ' is-on' : '') +
      '" data-hf-hist-tab="recent" aria-selected="' +
      (tab === 'recent' ? 'true' : 'false') +
      '">最近</button>' +
      '<button type="button" role="tab" class="hn-hist-tab' +
      (tab === 'open' ? ' is-on' : '') +
      '" data-hf-hist-tab="open" aria-selected="' +
      (tab === 'open' ? 'true' : 'false') +
      '">未完成</button>' +
      '<button type="button" role="tab" class="hn-hist-tab' +
      (tab === 'resume' ? ' is-on' : '') +
      '" data-hf-hist-tab="resume" aria-selected="' +
      (tab === 'resume' ? 'true' : 'false') +
      '">可恢复</button></div>' +
      '<p class="hn-drawer-lead">查找与恢复 · 不是方案台「历史方案」</p>' +
      (rows || '<p class="hn-muted">' + empty + '</p>')
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
    taskCardHtml: taskCardHtml,
    quietComposerHtml: quietComposerHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
