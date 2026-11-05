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
  function protoCapsHtml() {
    return (
      '<div class="hn-compose-caps" aria-label="通道与整理">' +
      '<button type="button" class="hn-cap-btn" data-hf-act="open_soft_pad" title="软键盘" data-voice-phrases="软键盘|打开软键盘">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M7 10h2M11 10h2M15 10h2M7 14h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '软键盘</button>' +
      '<button type="button" class="hn-cap-btn" data-hf-act="open_voice" title="语音" data-voice-phrases="语音|开始听">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" stroke-width="1.8"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
      '语音</button>' +
      '<button type="button" class="hn-cap-btn" data-hf-act="open_camera" title="摄像头" data-voice-phrases="摄像头|打开摄像头">' +
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="7" width="13" height="10" rx="2" stroke="currentColor" stroke-width="1.8"/><path d="M16 10l5-2v8l-5-2V10z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>' +
      '摄像头</button>' +
      '<button type="button" class="hn-prov-link" data-hf-act="open_providers" title="模型提供方" data-voice-phrases="提供方|开通">' +
      '提供方</button>' +
      '<button type="button" class="hn-org-btn" data-hf-act="open_prep" title="整理方案" data-voice-phrases="整理方案|整理任务">整理任务</button>' +
      '</div>'
    );
  }

  function dockIcoClass(kind) {
    var k = String(kind || '').toLowerCase();
    if (k.indexOf('cursor') >= 0) return 'c';
    if (k.indexOf('claude') >= 0) return 'cl';
    if (k.indexOf('codex') >= 0 || k.indexOf('chatgpt') >= 0) return 'cx';
    if (k.indexOf('workbuddy') >= 0 || k === 'wb') return 'wb';
    return 'cx';
  }

  function dockIcoLetters(kind, label) {
    var k = String(kind || '').toLowerCase();
    if (k.indexOf('cursor') >= 0) return 'Cu';
    if (k.indexOf('claude') >= 0) return 'Cl';
    if (k.indexOf('codex') >= 0) return 'Cx';
    if (k.indexOf('chatgpt') >= 0) return 'GPT';
    if (k.indexOf('workbuddy') >= 0 || k === 'wb') return 'WB';
    return String(label || kind || 'Ag').slice(0, 2);
  }

  function agentDisplayFromVm(vm) {
    var provider =
      (vm && vm.dto && vm.dto.provider && (vm.dto.provider.id || vm.dto.provider.name)) || '';
    var p = String(provider).toLowerCase();
    if (p.indexOf('codex') >= 0) return { name: 'Codex', ico: 'Cx', tone: '' };
    if (p.indexOf('claude') >= 0) return { name: 'Claude', ico: 'Cl', tone: '' };
    if (p.indexOf('cursor') >= 0) return { name: 'Cursor', ico: 'Cu', tone: ' is-cursor' };
    if (p.indexOf('workbuddy') >= 0 || p.indexOf('wb') >= 0)
      return { name: 'WorkBuddy', ico: 'WB', tone: ' is-wb' };
    return { name: String(provider || 'Agent').trim() || 'Agent', ico: 'Ag', tone: '' };
  }

  /**
   * Focus compose dock — Agent / 账号 / 项目 / 送到 / aim / 问模型|送到.
   * Reuses Focus acts (quick_handoff, aim_*, confirm_project) + open_providers.
   */
  function protoDockBarHtml(vm, opts) {
    opts = opts || {};
    vm = vm || {};
    var disabled = opts.handoffDisabled === true;
    var deliverKind = String(opts.deliverKind || '').trim();
    var aim = opts.aimMemory || {};
    var aimed = !!aim.hasActive && (!deliverKind || String(aim.kind || '') === deliverKind);
    var project = String(vm.projectName || '').trim();
    var projectConfirmed = !!vm.confirmed;
    var agent = agentDisplayFromVm(vm);
    if (deliverKind) {
      agent = {
        name: aim.label || deliverKind,
        ico: dockIcoLetters(deliverKind, aim.label),
        tone: dockIcoClass(deliverKind) === 'c' ? ' is-cursor' : dockIcoClass(deliverKind) === 'wb' ? ' is-wb' : ''
      };
    }
    var accountGated = opts.accountGated !== false; // default honest: nudge until proven ready
    if (opts.accountReady === true) accountGated = false;

    var prefer = ['cursor', 'claude', 'chatgpt', 'codex', 'workbuddy'];
    var targets = Array.isArray(opts.probeTargets) ? opts.probeTargets.slice() : [];
    targets.sort(function (a, b) {
      var ia = prefer.indexOf(String((a && a.kind) || '').toLowerCase());
      var ib = prefer.indexOf(String((b && b.kind) || '').toLowerCase());
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var seen = {};
    var icoBtns = '';
    var icoCount = 0;
    for (var i = 0; i < targets.length && icoCount < 4; i++) {
      var t = targets[i];
      if (!t || !t.kind || seen[t.kind]) continue;
      seen[t.kind] = true;
      icoCount += 1;
      var on = deliverKind === t.kind;
      icoBtns +=
        '<button type="button" class="hn-app-ico hn-app-ico--' +
        dockIcoClass(t.kind) +
        (on ? ' is-on' : '') +
        '" data-hf-act="pick_deliver" data-hf-deliver-kind="' +
        esc(t.kind) +
        '" title="' +
        esc(t.label || t.kind) +
        '" data-voice-phrases="' +
        esc((t.label || '') + '|送到' + (t.label || t.kind)) +
        '"><span>' +
        esc(dockIcoLetters(t.kind, t.label)) +
        '</span></button>';
    }
    if (!icoBtns) {
      if (opts.probePending) {
        icoBtns =
          '<span class="hn-app-icons__pending" aria-live="polite">正在检测本机 Agent</span>';
      } else {
        icoBtns =
          '<button type="button" class="hn-app-ico hn-app-ico--c" data-hf-act="pick_deliver" data-hf-deliver-kind="cursor" title="Cursor"><span>Cu</span></button>' +
          '<button type="button" class="hn-app-ico hn-app-ico--cl" data-hf-act="pick_deliver" data-hf-deliver-kind="claude" title="Claude"><span>Cl</span></button>' +
          '<button type="button" class="hn-app-ico hn-app-ico--cx" data-hf-act="pick_deliver" data-hf-deliver-kind="chatgpt" title="Codex / ChatGPT"><span>Cx</span></button>' +
          '<button type="button" class="hn-app-ico hn-app-ico--wb" data-hf-act="pick_deliver" data-hf-deliver-kind="workbuddy" title="WorkBuddy"><span>WB</span></button>';
      }
    }

    var primaryAct;
    var primaryLabel;
    var primaryAttrs = '';
    if (deliverKind) {
      if (aimed) {
        primaryAct = 'quick_handoff';
        primaryLabel = '送到 ' + (aim.label || deliverKind);
        primaryAttrs = ' data-hf-handoff-kind="' + esc(deliverKind) + '"';
      } else {
        primaryAct = 'aim_change';
        primaryLabel = '先框选';
        primaryAttrs = ' data-hf-aim-kind="' + esc(deliverKind) + '"';
      }
    } else {
      primaryAct = 'ask_model';
      primaryLabel = '问模型';
    }

    var destHint = '';
    if (deliverKind) {
      destHint =
        '<div class="hn-dest-hint is-on" data-hn-dest-hint>' +
        '<span>将送到 <strong>' +
        esc(aim.label || deliverKind) +
        '</strong></span>' +
        '<span>·</span>' +
        '<span>' +
        (aimed ? '窗口已锁定，点右侧送到应用' : '框选目标窗口后发出') +
        '</span>' +
        '<span class="hn-aim-state ' +
        (aimed ? 'is-ok' : 'is-need') +
        '">' +
        (aimed ? '已框选' : '未框选') +
        '</span>' +
        '<button type="button" class="hn-dest-clear" data-hf-act="clear_deliver">取消</button></div>';
    }

    return (
      destHint +
      '<div class="hn-compose-bar hn-compose-dock" aria-label="发送与目标">' +
      '<button type="button" class="hn-agent-chip" data-hf-act="choose_agent" title="选择 Agent" data-voice-phrases="选择Agent|Agent">' +
      '<span class="hn-agent-chip__ai' +
      agent.tone +
      '" aria-hidden="true">' +
      esc(agent.ico) +
      '</span>' +
      '<span class="hn-agent-chip__name">' +
      esc(agent.name) +
      '</span>' +
      '<span class="hn-agent-chip__proj">' +
      esc(project || '未选项目') +
      '</span></button>' +
      '<button type="button" class="hn-acct-chip' +
      (accountGated ? ' is-off' : '') +
      '" data-hf-act="open_providers" title="账号 / 开通" data-voice-phrases="账号|开通|未开通">' +
      '<span class="hn-acct-dot" aria-hidden="true"></span>' +
      '<span>' +
      (accountGated ? '未开通' : '账号') +
      '</span></button>' +
      '<button type="button" class="hn-proj-chip' +
      (project && projectConfirmed ? '' : ' is-empty') +
      '" data-hf-act="' +
      (projectConfirmed ? 'pick_project' : 'confirm_project') +
      '" data-voice-phrases="项目|选择项目">' +
      esc(project && projectConfirmed ? project : '项目') +
      '</button>' +
      '<div class="hn-app-icons" aria-label="送到桌面">' +
      '<span class="hn-app-icons__lab">送</span>' +
      icoBtns +
      '</div>' +
      (deliverKind
        ? '<button type="button" class="hn-aim-chip' +
          (aimed ? ' is-ok' : '') +
          '" data-hf-act="aim_change" data-hf-aim-kind="' +
          esc(deliverKind) +
          '" data-voice-phrases="框选|瞄准">' +
          (aimed ? '已框选' : '框选窗口') +
          '</button>'
        : '') +
      '<button type="button" class="hn-attach hn-attach--ghost" data-hf-act="quiet_collect" data-hf-collect="attach" title="加入材料">附件</button>' +
      '<span class="hn-compose-spacer"></span>' +
      '<button type="button" class="hn-ask-model' +
      (deliverKind ? ' is-deliver' : '') +
      '" data-hf-act="' +
      esc(primaryAct) +
      '"' +
      primaryAttrs +
      (disabled && primaryAct !== 'aim_change' ? ' disabled' : '') +
      ' data-voice-phrases="' +
      esc(primaryLabel) +
      '">' +
      esc(primaryLabel) +
      '</button></div>'
    );
  }

  function composerHtml(vm, opts) {
    opts = opts || {};
    vm = vm || {};
    var isReturn = (vm.mode || '') === 'return';
    var draft = String(opts.draftText || '');
    var disabled = opts.handoffDisabled === true;
    if (!disabled && !draft.trim() && !(opts.materialSummary && opts.materialSummary.count > 0)) {
      disabled = true;
    }
    var proto = !!opts.protoLayout && opts.actPrefix !== 'ha2';
    var headline =
      opts.headline != null
        ? opts.headline
        : isReturn && vm.headline
          ? vm.headline
          : '今天想推进什么？';
    var assist =
      opts.assist != null
        ? opts.assist
        : isReturn
          ? String(vm.assistance || '').trim() ||
            '可以从停下的地方继续，也可以直接描述新工作或加入材料。'
          : '直接描述你想完成的工作，也可以加入现有材料。';
    var draftId = opts.draftId || 'hnQuietDraft';
    var draftAttr = opts.draftAttr || '';
    var ha2 = opts.actPrefix === 'ha2';
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

    var secondaryCompose = !!opts.secondaryCompose;
    var actions =
      opts.actionsHtml != null
        ? opts.actionsHtml
        : (function () {
            // When Focus shows a task card above, card owns resume CTA — don't duplicate.
            var resumeCta =
              !secondaryCompose &&
              isReturn &&
              vm.primary &&
              vm.primary.id &&
              vm.primary.label
                ? '<button type="button" class="hn-cta" data-hf-act="' +
                  esc(vm.primary.id) +
                  '">' +
                  esc(vm.primary.label) +
                  '</button>'
                : '';
            var startNew =
              !secondaryCompose &&
              isReturn &&
              vm.secondary &&
              vm.secondary.id &&
              vm.secondary.label
                ? '<button type="button" class="hn-text-btn" data-hf-act="' +
                  esc(vm.secondary.id) +
                  '">' +
                  esc(vm.secondary.label) +
                  '</button>'
                : '';
            var restoreLink =
              !secondaryCompose && !resumeCta && opts.resumeAvailable
                ? '<button type="button" class="hn-text-btn" data-hf-act="restore_return">继续上次工作</button>'
                : '';
            // Proto layout: 整理任务 lives in compose-caps; keep open_prep for legacy path only.
            var matCount = Number((opts.materialSummary && opts.materialSummary.count) || 0);
            var prepLink =
              !proto && matCount < 1
                ? '<button type="button" class="hn-text-btn" data-hf-act="open_prep">整理方案</button>'
                : '';
            if (!resumeCta && !startNew && !restoreLink && !prepLink) return '';
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
    var placeholder =
      opts.placeholder ||
      '例如：把首页改得更直接，新用户打开就知道怎么开始……';

    if (proto) {
      var aria = secondaryCompose ? '发起另一项任务' : '写一句开始';
      var composeCls =
        'hn-compose' +
        (opts.deliverKind ? ' is-deliver' : '') +
        (opts.accountGated !== false && opts.accountReady !== true ? ' is-gated' : '');
      // Dock owns send targets — keep paste/url/folder as compact attach row under caps.
      var matRow =
        '<div class="hn-compose-mats" aria-label="加入内容">' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="paste">粘贴</button>' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="url">网址</button>' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="folder">目录</button>' +
        '<button type="button" class="hn-attach" data-hf-act="quiet_collect" data-hf-collect="capture">截图</button>' +
        '</div>';
      return (
        '<section class="hn-quiet-composer hn-quiet-composer--proto" data-hn-quiet-composer aria-label="' +
        esc(aria) +
        '">' +
        (secondaryCompose
          ? '<p class="hn-other-task-label">发起另一项任务</p>'
          : '') +
        '<div class="' +
        composeCls +
        '">' +
        '<textarea id="' +
        esc(draftId) +
        '" class="hn-composer-input" rows="3" ' +
        draftAttr +
        ' aria-label="草稿" placeholder="' +
        esc(placeholder) +
        '">' +
        esc(draft) +
        '</textarea>' +
        protoDockBarHtml(vm, {
          handoffDisabled: disabled,
          probeTargets: opts.probeTargets,
          probePending: opts.probePending,
          aimMemory: opts.aimMemory,
          deliverKind: opts.deliverKind,
          accountGated: opts.accountGated,
          accountReady: opts.accountReady
        }) +
        protoCapsHtml() +
        matRow +
        materialSummaryHtml(opts.materialSummary) +
        '</div>' +
        contextHtml +
        actions +
        '</section>'
      );
    }

    return (
      '<section class="hn-quiet-composer" data-hn-quiet-composer aria-label="' +
      esc(headline || '今天想推进什么？') +
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
      esc(placeholder) +
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
      agentGridHtml(opts.probeTargets || [], {
        disabled: disabled,
        aimMemory: opts.aimMemory,
        probePending: opts.probePending,
        actPrefix: ha2 ? 'ha2' : 'hf'
      }) +
      actions +
      '</section>'
    );
  }

  global.OneToneHomeFocusTriad = {
    esc: esc,
    composerHtml: composerHtml,
    agentGridHtml: agentGridHtml,
    aimMemoryHtml: aimMemoryHtml,
    materialSummaryHtml: materialSummaryHtml,
    protoDockBarHtml: protoDockBarHtml
  };
})(typeof window !== 'undefined' ? window : globalThis);
