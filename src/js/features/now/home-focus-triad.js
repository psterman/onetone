/**
 * OneToneHomeFocusTriad — shared Mid composer / agent icon grid / aim memory.
 * Pure HTML helpers for Home Focus + home-agent-v2. No second state model.
 */
(function (global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function materialSummaryHtml(summary) {
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
        '" alt="" decoding="async" width="22" height="22" />'
      );
    }
    var badge = String(label).slice(0, 2);
    return '<span class="hn-agent-tile__badge" aria-hidden="true">' + esc(badge) + '</span>';
  }

  /**
   * Aim memory row (also embedded in agentGridHtml when aimMemory provided).
   * opts: { kind, label, hasActive, actPrefix }
   * actPrefix: 'hf' (default Focus data-hf-act) | 'ha2' (data-ha2-aim*)
   */
  function aimMemoryHtml(opts) {
    opts = opts || {};
    var aimKind = opts.kind || 'cursor';
    var aimName = opts.label || 'Agent';
    var aimSet = !!opts.hasActive;
    var ha2 = opts.actPrefix === 'ha2';
    if (ha2) {
      return (
        '<div class="hn-aim-mem" data-hn-aim-mem data-hf-aim-kind="' +
        esc(aimKind) +
        '">' +
        '<span class="hn-aim-mem__txt">' +
        (aimSet
          ? '已记住 ' + esc(aimName) + ' 输入位置'
          : '首次打开会记下输入框位置（与语音/按键共用）') +
        '</span>' +
        '<span class="hn-aim-mem__acts">' +
        '<button type="button" class="hn-text-btn" data-ha2-aim>' +
        (aimSet ? '更改' : '现在定位') +
        '</button>' +
        (aimSet
          ? '<button type="button" class="hn-text-btn" data-ha2-aim-clear>清除</button>'
          : '') +
        '</span></div>'
      );
    }
    return (
      '<div class="hn-aim-mem" data-hn-aim-mem data-hf-aim-kind="' +
      esc(aimKind) +
      '">' +
      '<span class="hn-aim-mem__txt">' +
      (aimSet
        ? '已记住 ' + esc(aimName) + ' 输入位置'
        : '首次打开会记下输入框位置（与语音/按键共用）') +
      '</span>' +
      '<span class="hn-aim-mem__acts">' +
      '<button type="button" class="hn-text-btn" data-hf-act="aim_change" data-hf-aim-kind="' +
      esc(aimKind) +
      '">' +
      (aimSet ? '更改' : '现在定位') +
      '</button>' +
      (aimSet
        ? '<button type="button" class="hn-text-btn" data-hf-act="aim_clear" data-hf-aim-kind="' +
          esc(aimKind) +
          '">清除</button>'
        : '') +
      '</span></div>'
    );
  }

  /**
   * Agent icon grid.
   * targets: [{ kind, label, icon, channel, discovered, running, canSelect, canSend }]
   * discovered (preferred) or legacy installed — presence evidence only.
   * opts: { disabled, aimMemory, probePending, selectAttr, handoffAttr }
   */
  function agentGridHtml(targets, opts) {
    opts = opts || {};
    targets = Array.isArray(targets) ? targets : [];
    var disabled = opts.disabled === true;
    var probePending = !!opts.probePending;
    var aimMemory = opts.aimMemory || null;
    var selectAttr = opts.selectAttr || 'data-hf-act="quick_handoff" data-hf-handoff-kind';
    var ha2Select = opts.actPrefix === 'ha2';

    if (!targets.length) {
      // Focus classic: blank after inventory settles (no fake roster).
      // V2 may show empty hint; Focus passes probePending=false → ''.
      if (!probePending) {
        if (ha2Select) {
          return (
            '<div class="hn-agent-grid is-empty" data-hn-agent-grid data-ha2-agent-grid aria-label="打开 Agent">' +
            '<p class="hn-agent-grid__hint">尚未探测到本机 Agent · 打开目标应用后点重新检测</p>' +
            '</div>'
          );
        }
        return '';
      }
      return (
        '<div class="hn-agent-grid is-pending" data-hn-agent-grid data-ha2-agent-grid aria-busy="true" aria-label="打开 Agent">' +
        '<p class="hn-agent-grid__hint">正在检测本机 Agent…</p>' +
        '</div>'
      );
    }

    var bits = targets.map(function (t) {
      if (!t || !t.kind) return '';
      var label = t.label || t.kind;
      var channel = String(t.channel || 'app');
      var isCli = channel === 'cli' || channel === 'both';
      var discovered = !!(t.discovered || t.installed || t.running);
      var running = !!t.running;
      var canSend = t.canSend === true;
      var canSelect = t.canSelect !== false && discovered;
      var cls =
        'hn-agent-tile' +
        (discovered ? '' : ' is-dim') +
        (running ? ' is-live' : '') +
        (canSend ? ' is-sendable' : '') +
        (isCli ? ' is-cli' : '');
      var title =
        label +
        (isCli ? (channel === 'both' ? ' · 应用/CLI' : ' · CLI') : '') +
        (running ? ' · 运行中' : discovered ? ' · 已探测' : ' · 未探测到') +
        (canSend ? ' · 可发送' : discovered ? ' · 未确认可发送' : '');
      var attrs;
      if (ha2Select) {
        attrs =
          ' data-ha2-pick="' +
          esc(t.kind) +
          '"' +
          (canSelect ? '' : ' disabled') +
          (disabled ? ' disabled' : '');
      } else {
        attrs =
          ' data-hf-act="quick_handoff" data-hf-handoff-kind="' +
          esc(t.kind) +
          '"' +
          (disabled ? ' disabled' : '');
      }
      return (
        '<button type="button" class="' +
        cls +
        '"' +
        attrs +
        ' title="' +
        esc(title) +
        '" data-voice-phrases="' +
        esc([label, t.kind, isCli ? 'CLI' : ''].filter(Boolean).join('|')) +
        '">' +
        agentTileIconHtml(t) +
        '<span class="hn-agent-tile__name">' +
        esc(label) +
        '</span>' +
        '</button>'
      );
    });

    // Always show aim row when tiles exist (Focus single-point memory).
    var aim = aimMemory || {};
    var aimRow = aimMemoryHtml({
      kind: aim.kind || 'cursor',
      label: aim.label || 'Agent',
      hasActive: !!aim.hasActive,
      actPrefix: ha2Select ? 'ha2' : 'hf'
    });

    var hint = ha2Select
      ? '已探测到的 Agent 会显示图标 · 可发送需 Agent Center 确认 · 点图标选择目标'
      : '已检测到的 Agent 会自动出现 · 点图标复制并定位输入框 · Ctrl+V（或悬浮栏「粘贴」）';
    return (
      '<div class="hn-agent-grid" data-hn-agent-grid data-ha2-agent-grid aria-label="打开 Agent">' +
      '<p class="hn-agent-grid__hint">' +
      hint +
      '</p>' +
      aimRow +
      '<div class="hn-agent-grid__tiles">' +
      bits.join('') +
      '</div></div>'
    );
  }

  /**
   * Mid composer (Focus quiet / V2 Mid).
   * opts: draftText, draftId, draftAttr, materialSummary, handoffDisabled,
   *       probeTargets, aimMemory, probePending, resumeCtaHtml, actionsHtml,
   *       contextHtml, actPrefix ('hf'|'ha2'), headline, assist, placeholder
   */
  function composerHtml(vm, opts) {
    opts = opts || {};
    vm = vm || {};
    var isReturn = (vm.mode || '') === 'return';
    var draft = String(opts.draftText || '');
    var disabled = opts.handoffDisabled === true;
    if (!disabled && !draft.trim() && !(opts.materialSummary && opts.materialSummary.count > 0)) {
      disabled = true;
    }
    var headline =
      opts.headline ||
      (isReturn && vm.headline ? vm.headline : '今天想推进什么？');
    var assist =
      opts.assist ||
      (isReturn
        ? String(vm.assistance || '').trim() ||
          '可以从停下的地方继续，也可以直接描述新工作或加入材料。'
        : '直接描述你想完成的工作，也可以加入现有材料。');
    var draftId = opts.draftId || 'hnQuietDraft';
    var draftAttr = opts.draftAttr || '';
    var ha2 = opts.actPrefix === 'ha2';
    var collectAttr = ha2 ? 'data-ha2-mat' : 'data-hf-act="quiet_collect" data-hf-collect';
    var tools = ha2
      ? '<button type="button" class="hn-attach" data-ha2-mat="screenshot">截图</button>' +
        '<button type="button" class="hn-attach" data-ha2-mat="paste">粘贴</button>' +
        '<button type="button" class="hn-attach" data-ha2-mat="file">附件</button>' +
        '<button type="button" class="hn-attach" data-ha2-mat="image">图片</button>'
      : '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="capture">截图</button>' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="paste">粘贴</button>' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="attach">附件</button>' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="url">网址</button>' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="folder">目录</button>';

    var actions =
      opts.actionsHtml != null
        ? opts.actionsHtml
        : (function () {
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
            var restoreLink =
              !resumeCta && opts.resumeAvailable
                ? '<button type="button" class="hn-text-btn" data-hf-act="restore_return">继续上次工作</button>'
                : '';
            var matCount = Number((opts.materialSummary && opts.materialSummary.count) || 0);
            var prepLink =
              matCount < 1
                ? '<button type="button" class="hn-text-btn" data-hf-act="open_prep">整理方案</button>'
                : '';
            return (
              '<div class="hn-actions hn-quiet-actions">' +
              resumeCta +
              startNew +
              restoreLink +
              prepLink +
              '</div>'
            );
          })();

    var contextHtml = opts.contextHtml != null ? opts.contextHtml : '';
    var grid = agentGridHtml(opts.probeTargets || [], {
      disabled: disabled,
      aimMemory: opts.aimMemory,
      probePending: opts.probePending,
      actPrefix: ha2 ? 'ha2' : 'hf'
    });

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
      '<textarea id="' +
      esc(draftId) +
      '" class="hn-composer-input" rows="5" ' +
      draftAttr +
      ' aria-label="描述你想推进的工作" ' +
      'placeholder="' +
      esc(
        opts.placeholder ||
          '例如：把首页改得更直接，新用户打开就知道怎么开始……'
      ) +
      '">' +
      esc(draft) +
      '</textarea>' +
      '<div class="hn-composer-tools" aria-label="加入内容">' +
      '<span class="hn-composer-tools-label">加入内容</span>' +
      tools +
      '</div>' +
      materialSummaryHtml(opts.materialSummary) +
      '</div>' +
      contextHtml +
      grid +
      actions +
      '</section>'
    );
  }

  global.OneToneHomeFocusTriad = {
    esc: esc,
    composerHtml: composerHtml,
    agentGridHtml: agentGridHtml,
    aimMemoryHtml: aimMemoryHtml,
    materialSummaryHtml: materialSummaryHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
