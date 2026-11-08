/**
 * Home Focus adapter — HomeFocusSnapshot DTO → four Now modes (v1 situational canvas).
 * Modes: quiet | attention | return | degraded
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

  function freshnessLabel(source) {
    var f = String((source && source.freshness) || '');
    if (f === 'live') return '刚刚更新';
    if (f === 'cached') return '稍后更新';
    if (f === 'stale') return '可能已过时';
    return f || '未知';
  }

  var RESUME_LABEL = '继续上次工作';
  /** Checkpoint older than this is desk-only — never force return Hero. */
  var RESUME_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  /** UI CTA / boilerplate — never treat as the step you "stopped at". */
  var RESUME_CTA_LABELS = {
    '再做一件相关的事': 1,
    '从上次进度继续': 1,
    '继续上次工作': 1,
    '让 Agent 帮我做一件事': 1,
    '让 Agent 帮我做': 1,
    '查看进度': 1,
    '查看并决定': 1,
    '开始新任务': 1,
    '整理方案': 1,
    '可以继续': 1,
    '我记得你上次停在这里。': 1,
    '我记得你上次停在这里': 1,
    '刚刚完成。': 1,
    '刚刚完成': 1,
    // Empty shells — quoting these as「停在」is nonsense.
    '当前工作': 1,
    '上次进度': 1,
    '当前 Agent 任务': 1,
    '当前任务': 1,
    '已保存上次进度': 1
  };

  function relativeWhen(ts) {
    var n = Number(ts);
    if (!n || !isFinite(n)) return '';
    var age = Date.now() - n;
    if (age < 0) age = 0;
    if (age < 60 * 1000) return '刚刚';
    var mins = Math.round(age / 60000);
    if (mins < 60) return mins + ' 分钟前';
    var hours = Math.round(age / 3600000);
    if (hours < 24) return hours + ' 小时前';
    var days = Math.round(age / 86400000);
    if (days < 7) return days + ' 天前';
    if (days < 30) return '更早';
    return '更早';
  }

  /** Honest empty-time label — never invent freshness. */
  var WHEN_UNKNOWN = '时间未知';

  function isResumeCtaLabel(s) {
    var t = String(s || '')
      .replace(/。$/, '')
      .trim();
    if (!t) return true;
    if (RESUME_CTA_LABELS[t]) return true;
    // Auto next_action boilerplate: 继续：「…」 with CTA / empty insides.
    var m = /^继续[：:「"]+([^」"]*)[」"]?$/.exec(t);
    if (m && isResumeCtaLabel(m[1])) return true;
    return false;
  }

  /** Real step text only — strip CTA / session-title noise / project-name masquerade. */
  function usableResumeStep(raw, provider, projectName) {
    var step = String(raw || '').trim();
    // Unwrap「继续：『…』」so next_action shell never becomes the step.
    var wrap = /^继续[：:]\s*[「"“']?([^」"”']+)[」"”']?\s*[。：:]?$/.exec(step);
    if (wrap) step = String(wrap[1] || '').trim();
    step = step.replace(/[。：:]+$/, '').trim();
    if (!step || isResumeCtaLabel(step)) return '';
    var prov = providerLabelHome(provider);
    if (/session/i.test(step) && new RegExp(prov, 'i').test(step)) return '';
    var proj = String(projectName || '').trim();
    if (proj && proj !== '未知项目' && step === proj) return '';
    return step;
  }

  function resumeAgeFresh(ts) {
    var n = Number(ts);
    if (!n || !isFinite(n)) return false;
    var age = Date.now() - n;
    return age >= 0 && age <= RESUME_MAX_AGE_MS;
  }

  function providerLabelHome(p) {
    var s = String(p || '').toLowerCase();
    if (s.indexOf('onetone_atr') >= 0 || s === 'atr') return '本机工作';
    if (s.indexOf('claude') >= 0) return 'Claude';
    if (s.indexOf('codex') >= 0) return 'Codex';
    if (s.indexOf('workbuddy') >= 0) return 'WorkBuddy';
    if (s.indexOf('cursor') >= 0) return 'Cursor';
    if (s.indexOf('mcode') >= 0 || s.indexOf('minimax') >= 0) return 'MiniMax';
    if (s.indexOf('trae') >= 0) return 'Trae';
    if (s.indexOf('windsurf') >= 0) return 'Windsurf';
    if (s.indexOf('qoder') >= 0) return 'Qoder';
    if (s.indexOf('gemini') >= 0) return 'Gemini';
    var raw = String(p || '').trim();
    return raw || 'Agent';
  }

  /** Prefer ATR / session provider over FG Soft Pad app name when source says so. */
  function resumeProviderOf(provider, appName, source) {
    var reason = String((source && source.reason) || '');
    if (/atr_checkpoint/i.test(reason)) return 'onetone_atr';
    var id = (provider && (provider.id || provider)) || '';
    if (/onetone_atr|^atr$/i.test(String(id))) return 'onetone_atr';
    return id || appName || 'Agent';
  }

  /** Single H1 template for return: provider + step, with CJK/Latin spacing. */
  function returnHeadline(provider, task) {
    var prov = providerLabelHome(provider);
    var step = usableResumeStep(task, prov);
    // Agent name lives on the card header — keep H1 short for beginners.
    if (!step) return '上次停在 ' + prov + '。';
    return '上次停在「' + step + '」。';
  }

  /** Human resume fact — age + continue; no probe / checkpoint jargon on the card. */
  function resumeAssistance(projectName, when, opts) {
    opts = opts || {};
    var age = when ? String(when) + '有进度' : '有可恢复进度';
    if (opts.projUnconfirmed) {
      return age + '，确认项目后可继续。';
    }
    return age + '，可以从停下的地方继续。';
  }

  /**
   * @returns {{
   *   mode: 'quiet'|'attention'|'return'|'degraded',
   *   headline: string,
   *   assistance: string,
   *   presence: { line: string, note: string }|null,
   *   attention: { title: string, detail: string, primaryLabel: string, moreCount: number }|null,
   *   continuation: { title: string, detail: string }|null,
   *   progress: { text: string, source: string, allowed: boolean }|null,
   *   evidence: Array<{ label: string, value: string }>,
   *   restoreLabel: string,
   *   primary: { id: string, label: string }|null,
   *   secondary: { id: string, label: string }|null,
   *   appName: string,
   *   projectName: string,
   *   projectRoot: string,
   *   projectId: string,
   *   confirmed: boolean,
   *   match: string,
   *   title: string,
   *   copy: string,
   *   dto: object
   * }}
   */
  function toViewModel(dto) {
    dto = dto || {};
    var fg = dto.foreground || {};
    var project = dto.project || {};
    var work = dto.work || {};
    var provider = dto.provider || {};
    var source = dto.source || {};
    var action = dto.nextAction && dto.nextAction.executable ? dto.nextAction : null;

    // No snapshot yet (boot / first paint): Quiet Composer shell — never invent
    //「未发现应用」Hero + pick CTA (that was the blank/irrelevant flash into home).
    var hasSnap =
      !!(fg && (fg.appName || fg.appId || fg.windowTitle)) ||
      !!(project && (project.id || project.name || project.root)) ||
      !!(work && (work.status || work.title)) ||
      !!(provider && provider.status);
    if (!hasSnap) {
      return {
        mode: 'quiet',
        headline: '',
        assistance: '',
        presence: null,
        attention: null,
        continuation: null,
        progress: null,
        desk: {
          needsYou: null,
          living: null,
          continueCard: null,
          projectGate: null
        },
        evidence: [],
        restoreLabel: '',
        primary: null,
        secondary: null,
        appName: '',
        projectName: '',
        projectRoot: '',
        projectId: '',
        confirmed: false,
        match: 'unknown',
        title: '',
        copy: '',
        label: 'quiet',
        readyLabel: 'quiet',
        candidates: [],
        dto: dto,
        _bootShell: true
      };
    }

    var appName = String(fg.appName || '').trim() || '未发现应用';
    var projectName = String(project.name || '').trim() || '未知项目';
    var match = String(project.match || 'unknown');
    var confirmed = !!project.confirmed;
    var ws = String(work.status || 'idle');
    var workTitle = String(work.title || '').trim();
    var workDesc = String(work.description || '').trim();
    var when = relativeWhen(work.updatedAt) || freshnessLabel(source);
    var needsProject =
      !confirmed && (match === 'probable' || match === 'unknown');

    var mode = 'quiet';
    var headline = '';
    var assistance = '';
    var presence = null;
    var attention = null;
    var continuation = null;
    var progress = null;
    var primary = null;
    var secondary = null;
    var restoreLabel = '确认当前项目';

    // Priority: error/retry → degraded; waiting → attention; running → running Hero;
    // resumable → return; else quiet. Attention enrichment may still lift running.
    // provider.status unavailable/disabled is a probe footnote — never Hero「失败」.
    // Unconfirmed project is resolved onto a single Hero primary (see applyProjectConfirmGate).
    var provSt = String(provider.status || '').toLowerCase();
    var providerProbeNote =
      provSt === 'unavailable'
        ? '探针暂时连不上 · 不据此标失败'
        : provSt === 'disabled'
          ? 'Cursor 本地活动未开启'
          : '';
    if (ws === 'error' || (action && action.kind === 'retry')) {
      mode = 'degraded';
      headline = workTitle || '我暂时无法确认当前工作状态。';
      assistance =
        workDesc ||
        '读取依据不足。可以重试，或到「设置」检查数据源。';
      presence = {
        line: appName + ' · ' + (needsProject ? '项目未确认' : projectName) + ' · ' + when,
        note: providerProbeNote || '不会用猜测填充首页'
      };
      restoreLabel = (action && action.title) || '重试';
      primary = { id: 'retry', label: restoreLabel };
      secondary = { id: 'view_reason', label: '查看判断依据' };
    } else if (ws === 'waiting') {
      mode = 'attention';
      var agentLabel = providerLabelHome(resumeProviderOf(provider, appName, source));
      headline =
        agentLabel === '本机工作'
          ? '工作任务等待你确认'
          : agentLabel + ' 等待你确认';
      assistance = '当前没有足够信息在首页展示具体问题。请到 Agent 查看并决定。';
      attention = {
        title: '等待你确认',
        detail: '打开 Agent 查看详情并决定。',
        primaryLabel: '查看并决定',
        moreCount: 0
      };
      primary = { id: 'view_progress', label: attention.primaryLabel };
      // Coarse fact only — no inferred progress fraction / ETA.
      progress = null;
    } else if (
      ws === 'resumable' &&
      action &&
      action.kind === 'resume' &&
      resumeAgeFresh(work.updatedAt)
    ) {
      var resumeProv = providerLabelHome(resumeProviderOf(provider, appName, source));
      // Title only — workDesc is assistance / consent copy, never the「停在」step.
      var resumeStep = usableResumeStep(workTitle, resumeProv, projectName);
      var consentOff =
        /consent=off/.test(String((source && source.reason) || '')) ||
        /consent_off/.test(String((source && source.reason) || ''));
      // Real step → return Hero. Empty step → never「停在 project」; offer consent or honesty.
      if (resumeStep) {
        mode = 'return';
        headline = returnHeadline(resumeProv, resumeStep);
        assistance = resumeAssistance(projectName, when, {
          projUnconfirmed: needsProject
        });
        continuation = {
          title: RESUME_LABEL,
          detail: resumeStep
        };
        primary = { id: 'resume', label: RESUME_LABEL };
        // Leaves return → Quiet Composer (homepage jump). Does not delete checkpoint.
        secondary = { id: 'start_new_task', label: '开始新任务' };
        progress = null;
      } else if (consentOff) {
        // Only actionable empty-step Hero: ask to enable Cursor activity.
        mode = 'attention';
        headline = '有可恢复进度，但还没读到具体步骤';
        assistance =
          (when ? when + '有进度。' : '检测到进度。') +
          '开启 Cursor 活动后，可用本机会话读出停在哪一步（你可随时关闭）。';
        presence = {
          line: resumeProv + ' · ' + projectName + (when ? ' · ' + when : ''),
          note: '需要授权'
        };
        primary = { id: 'enable_cursor_activity', label: '开启 Cursor 活动' };
        secondary = { id: 'resume', label: RESUME_LABEL };
        progress = null;
      } else {
        // Consent on / probe flaky / no step → Quiet Composer. No「等你决定」废话卡.
        mode = 'quiet';
        headline = '';
        assistance = '';
        presence = {
          line: resumeProv + ' · ' + projectName + (when ? ' · ' + when : ''),
          note: providerProbeNote || '步骤待读'
        };
        primary = null;
        secondary = null;
        progress = null;
      }
    } else if (ws === 'running') {
      mode = 'running';
      var runningAgent = providerLabelHome(resumeProviderOf(provider, appName, source));
      var runningStep = usableResumeStep(workTitle, runningAgent, projectName);
      var knownRunProj =
        projectName &&
        projectName !== '未知项目' &&
        (confirmed || match === 'exact');
      if (runningStep) {
        headline =
          runningAgent === '本机工作'
            ? '正在处理「' + runningStep + '」'
            : runningAgent + ' 正在处理「' + runningStep + '」';
      } else if (knownRunProj) {
        headline =
          runningAgent === '本机工作'
            ? '正在处理 ' + projectName
            : runningAgent + ' 正在处理 ' + projectName;
      } else {
        headline =
          runningAgent === '本机工作' ? '正在处理中' : runningAgent + ' 正在处理中';
      }
      assistance = Number(work.updatedAt) > 0 ? '最近活动：' + when : '';
      presence = {
        line: runningAgent + ' · ' + projectName + (Number(work.updatedAt) > 0 ? ' · ' + when : ''),
        note: '运行中'
      };
      // No step fraction / ETA — progress object unused for coarse running.
      progress = null;
      primary = { id: 'view_progress', label: '查看 Agent' };
    } else if (ws === 'completed') {
      // Soft Pad stop/Complete → brief honest card (Rust COMPLETED_DISPLAY_MS).
      // Was falling through to quiet — home looked empty right after real work.
      mode = 'completed';
      var doneAgent = providerLabelHome(resumeProviderOf(provider, appName, source));
      var doneStep = usableResumeStep(workTitle, doneAgent, projectName);
      headline = doneStep
        ? doneAgent + ' 刚完成「' + doneStep + '」'
        : doneAgent === '本机工作'
          ? '刚刚完成'
          : doneAgent + ' 刚刚完成';
      assistance = Number(work.updatedAt) > 0 ? '最近活动：' + when : '';
      presence = {
        line: doneAgent + ' · ' + projectName + (Number(work.updatedAt) > 0 ? ' · ' + when : ''),
        note: '刚刚完成'
      };
      progress = null;
      primary = { id: 'view_progress', label: '查看 Agent' };
      secondary = { id: 'start_new_task', label: '开始新任务' };
    } else {
      // Quiet: reliable context, nothing to do.
      mode = 'quiet';
      var knownProject = confirmed || match === 'exact';
      headline = knownProject
        ? '你正在 ' + appName + ' 中处理 ' + projectName + '。'
        : '你正在使用 ' + appName + '。';
      assistance = knownProject
        ? '已识别 ' +
          appName +
          ' 和 ' +
          projectName +
          '。现在没有需要你处理的事；我会把输入留给 ' +
          appName +
          '，需要你时再提醒。'
        : '现在没有需要你处理的事；需要你时再提醒。';
      presence = {
        line:
          appName +
          ' · ' +
          (knownProject ? projectName : '未确认项目') +
          ' · ' +
          when,
        note: '没有需要你处理的事'
      };
      primary = null;
    }

    // Probe soft-fail: presence footnote only — never append into Hero assistance (废话).
    if (providerProbeNote && mode !== 'degraded') {
      if (!presence) {
        presence = {
          line: appName + ' · ' + projectName + (when ? ' · ' + when : ''),
          note: providerProbeNote
        };
      } else if (!presence.note || presence.note === '运行中' || presence.note === '步骤待读') {
        presence.note = providerProbeNote;
      }
    }

    var evidence = [
      { label: '前台应用', value: appName },
      {
        label: '项目',
        value: confirmed || match === 'exact' ? projectName + '（已确认）' : projectName + '（未确认）'
      },
      {
        label: '来源',
        value: String(source.reason || '本地窗口 + 工作区').slice(0, 80)
      },
      { label: '新鲜度', value: when || freshnessLabel(source) }
    ];
    if (provider.status) {
      evidence.push({
        label: 'Agent',
        value: String(provider.id || 'Agent') + ' · ' + String(provider.status)
      });
    }

    // Honest thin-desk zones (collapse when empty). No invented Marvis / narrative.
    var agentLabel =
      provider.id === 'claude' || /claude/i.test(String(provider.id || ''))
        ? 'Claude'
        : provider.id === 'codex' || /codex/i.test(String(provider.id || ''))
          ? 'Codex'
          : provider.id === 'workbuddy' || /workbuddy/i.test(String(provider.id || ''))
            ? 'WorkBuddy'
            : appName;
    var desk = {
      needsYou: null,
      living: null,
      continueCard: null,
      projectGate: null
    };
    // projectGate only when Hero does not already own confirm/pick (filled after gate resolve).
    if (needsProject) {
      desk.projectGate = {
        title: '项目未确认',
        detail:
          projectName && projectName !== '未知项目'
            ? '可能是 ' + projectName
            : appName,
        note: '',
        badge: '未确认',
        sourceBadge: { label: '不猜测', tone: 'inf' },
        actId: null,
        actLabel: null
      };
    }
    if (ws === 'waiting') {
      desk.needsYou = {
        title: workTitle || '需要你确认',
        detail: agentLabel + (projectName && (confirmed || match === 'exact') ? ' · ' + projectName : '') + ' · ' + when,
        note: workDesc || '明确等待 · 需你确认'
      };
    } else if (ws === 'working' || ws === 'running') {
      desk.living = {
        title: agentLabel + ' 正在活动',
        detail:
          (confirmed || match === 'exact' ? projectName + ' · ' : '') +
          when,
        note: '可信活跃 · 非等待'
      };
    }
    if (
      ws === 'resumable' &&
      action &&
      action.kind === 'resume' &&
      resumeAgeFresh(work.updatedAt)
    ) {
      var deskStep =
        usableResumeStep(workTitle, agentLabel) ||
        usableResumeStep(workDesc, agentLabel);
      // No real step → no continue card (same honesty as return Hero).
      if (deskStep) {
        desk.continueCard = {
          title: deskStep,
          detail:
            agentLabel +
            (confirmed || match === 'exact' ? ' · ' + projectName : '') +
            (when ? ' · ' + when : ' · ' + WHEN_UNKNOWN),
          note: '已保存上次进度',
          badge: agentLabel,
          when: when || '',
          sourceBadge: { label: 'checkpoint', tone: 'auth' }
        };
      }
    }

    return applyProjectConfirmGate({
      mode: mode,
      headline: headline,
      assistance: assistance,
      presence: presence,
      attention: attention,
      continuation: continuation,
      progress: progress,
      desk: desk,
      evidence: evidence,
      restoreLabel: restoreLabel,
      primary: primary,
      secondary: secondary,
      appName: appName,
      projectName: projectName,
      projectRoot: project.root || '',
      projectId: project.id || '',
      confirmed: confirmed,
      match: match,
      // Compat for overlays / policy hooks that still read title/copy
      title: workTitle || headline,
      copy: workDesc || assistance,
      label: mode,
      readyLabel: mode,
      candidates: project.candidates || [],
      dto: dto
    });
  }

  /**
   * Single primary CTA: when project is unconfirmed, Hero owns confirm/pick.
   * Resumable + unconfirmed → "确认项目以继续" (never resume + gate competing).
   */
  function applyProjectConfirmGate(vm) {
    if (!vm) return vm;
    var needs =
      !vm.confirmed &&
      (vm.match === 'probable' || vm.match === 'unknown' || !vm.match);
    if (!needs) {
      if (vm.desk) vm.desk.projectGate = null;
      return vm;
    }

    var action = vm.dto && vm.dto.nextAction && vm.dto.nextAction.executable
      ? vm.dto.nextAction
      : null;
    var gateKind =
      action && (action.kind === 'confirm_project' || action.kind === 'pick_project')
        ? action.kind
        : vm.projectRoot && vm.match !== 'unknown'
          ? 'confirm_project'
          : 'pick_project';
    if (gateKind === 'confirm_project' && !vm.projectRoot) {
      gateKind = 'pick_project';
    }

    var resumableIntent =
      (vm.primary && vm.primary.id === 'resume') ||
      vm.mode === 'return' ||
      (vm.dto && vm.dto.work && String(vm.dto.work.status) === 'resumable');

    var label =
      resumableIntent
        ? gateKind === 'confirm_project'
          ? '确认项目以继续'
          : '选择项目以继续'
        : gateKind === 'confirm_project'
          ? '确认这是当前项目'
          : '选择当前项目';

    // attention / degraded keep their primary; still drop competing gate button.
    if (vm.mode === 'attention' || vm.mode === 'degraded') {
      if (vm.desk) vm.desk.projectGate = null;
      return vm;
    }

    if (resumableIntent) {
      vm.mode = 'return';
      vm.headline = '有可继续的工作，但项目尚未确认。';
      vm.assistance =
        vm.projectName && vm.projectName !== '未知项目'
          ? '推断当前是 ' +
            vm.projectName +
            '。确认后即可从保存的位置继续，不会用猜测替你决定。'
          : '确认当前项目后即可从保存的位置继续，不会用猜测替你决定。';
      vm.continuation = null;
      vm.presence = null;
    }

    vm.primary = { id: gateKind, label: label };
    if (gateKind === 'confirm_project') {
      vm.secondary = { id: 'pick_project', label: '选择其他项目' };
    } else if (!vm.secondary) {
      vm.secondary = { id: 'view_reason', label: '查看判断依据' };
    }
    // Hero owns the CTA — no parallel desk gate button.
    if (vm.desk) vm.desk.projectGate = null;
    return vm;
  }

  function rowState(r) {
    var st = r && (r.state || r.State);
    if (!st) return '';
    if (typeof st === 'string') return st;
    if (st.needsInput) return 'needsInput';
    if (st.working) return 'working';
    return String(st);
  }

  function rowCause(r) {
    var c = r && (r.cause || r.Cause);
    return c ? String(c) : '';
  }

  function rowAgentLabel(r) {
    var a = String((r && (r.agent || r.Agent)) || '').toLowerCase();
    if (a.indexOf('claude') >= 0) return 'Claude';
    if (a.indexOf('codex') >= 0) return 'Codex';
    if (a.indexOf('workbuddy') >= 0) return 'WorkBuddy';
    if (a.indexOf('cursor') >= 0) return 'Cursor';
    return String((r && (r.agent || r.Agent)) || 'Agent').trim() || 'Agent';
  }

  function rowWaitingEligible(r) {
    if (!r) return false;
    if (r.waitingEligible === false || r.waiting_eligible === false) return false;
    if (r.waitingEligible === true || r.waiting_eligible === true) return true;
    // Fallback: NeedsInput without inferred source
    var src = String((r.source && (r.source.inferred ? 'inferred' : r.source)) || r.Source || '');
    if (/inferred/i.test(src)) return false;
    return rowState(r) === 'needsInput';
  }

  function relativeWhenRow(r) {
    var ts = Number(
      (r && (r.observedAtMs != null ? r.observedAtMs : r.observed_at_ms)) || 0
    );
    return relativeWhen(ts);
  }

  function rowSource(r) {
    var s = r && (r.source || r.Source);
    if (!s) return '';
    if (typeof s === 'string') return s;
    if (s.officialHook || s.OfficialHook) return 'officialHook';
    if (s.appServer || s.AppServer) return 'appServer';
    if (s.inferred || s.Inferred) return 'inferred';
    if (s.native || s.Native) return 'native';
    if (s.oneToneAsk || s.OneToneAsk) return 'oneToneAsk';
    return String(s);
  }

  function rowConfidence(r) {
    var c = r && (r.confidence || r.Confidence);
    if (!c) return '';
    if (typeof c === 'string') return c.toLowerCase();
    if (c.high || c.High) return 'high';
    if (c.medium || c.Medium) return 'medium';
    if (c.low || c.Low) return 'low';
    return String(c).toLowerCase();
  }

  function sourceBadge(src) {
    var s = String(src || '').toLowerCase();
    if (s === 'officialhook' || s === 'official_hook') return { label: 'hook', tone: 'auth' };
    if (s === 'appserver' || s === 'app_server') return { label: 'API', tone: 'auth' };
    if (s === 'native') return { label: 'native', tone: 'auth' };
    if (s === 'onetoneask' || s === 'one_tone_ask') return { label: 'OneTone', tone: 'corr' };
    if (s === 'inferred') return { label: '推断', tone: 'inf' };
    return src ? { label: String(src), tone: 'corr' } : null;
  }

  function confidenceBadge(conf) {
    var c = String(conf || '').toLowerCase();
    if (c === 'high' || c === 'authoritative') return { label: '高置信', tone: 'auth' };
    if (c === 'medium' || c === 'corroborated') return { label: '中置信', tone: 'corr' };
    if (c === 'low' || c === 'inferred') return { label: '低置信', tone: 'inf' };
    return null;
  }

  function evidenceTierBadge(tier) {
    var t = String(tier || '').toLowerCase();
    if (t === 'high') return { label: 'High', tone: 'auth' };
    if (t === 'pathvalid' || t === 'path_valid') return { label: 'Path', tone: 'corr' };
    if (t === 'historic') return { label: 'Historic', tone: 'inf' };
    return null;
  }

  function matchConfidenceBadge(n) {
    var v = Number(n);
    if (!(v >= 0)) return null;
    var pct = Math.round(v * 100);
    if (v >= 0.85) return { label: '项目匹配 ' + pct + '%', tone: 'auth' };
    if (v >= 0.5) return { label: '项目匹配 ' + pct + '%', tone: 'corr' };
    return { label: '项目匹配 ' + pct + '%', tone: 'inf' };
  }

  function isExpiredRow(r) {
    var exp = Number(
      (r && (r.expiresAtMs != null ? r.expiresAtMs : r.expires_at_ms)) || 0
    );
    return exp > 0 && exp < Date.now();
  }

  function rowMetaChips(row) {
    // Kept for adapter callers / tests — view builds chips from row.*Badge fields.
    var chips = [];
    if (row && row.stale) chips.push({ label: '已过期', tone: 'stale' });
    if (row && row.sourceBadge) chips.push(row.sourceBadge);
    if (row && row.confBadge) chips.push(row.confBadge);
    if (row && row.tierBadge) chips.push(row.tierBadge);
    if (row && row.matchBadge) chips.push(row.matchBadge);
    return chips;
  }

  /**
   * Merge Soft Pad multi-agent attention into Home Focus VM.
   * Maps ALL waitingEligible / working rows — does not collapse N→1.
   * Primary CTA still picks the first (permission preferred).
   * Degraded (project/repair): keep headline/CTA, but still fill desk zones.
   */
  function enrichFromAttention(vm, attention) {
    if (!vm) return vm;
    attention = attention || {};

    var rows = Array.isArray(attention.rows) ? attention.rows : [];
    var waitRows = rows.filter(function (r) {
      return rowState(r) === 'needsInput' && rowWaitingEligible(r);
    });
    // Permission first for CTA pick, but keep full list order stable otherwise.
    waitRows.sort(function (a, b) {
      var ap = /permission/i.test(rowCause(a)) ? 0 : 1;
      var bp = /permission/i.test(rowCause(b)) ? 0 : 1;
      return ap - bp;
    });
    var workRows = rows.filter(function (r) {
      return rowState(r) === 'working';
    });

    vm.desk = vm.desk || {
      needsYou: null,
      needsYouRows: null,
      living: null,
      livingRows: null,
      continueCard: null,
      recent: null
    };

    function mapWait(r) {
      var agent = rowAgentLabel(r);
      var cause = rowCause(r).toLowerCase();
      var isPerm = /permission/i.test(cause);
      var title = isPerm
        ? '批准 ' + agent + ' 的操作？'
        : agent + ' 需要你确认';
      var when = relativeWhenRow(r);
      var conf = rowConfidence(r);
      var src = rowSource(r);
      var stale = isExpiredRow(r);
      var rawAgent = String((r && (r.agent || r.Agent)) || '')
        .trim()
        .toLowerCase();
      return {
        title: title,
        detail: agent + (when ? ' · ' + when : ' · ' + WHEN_UNKNOWN),
        note: stale ? '信号已过期 · 需重新确认' : '明确等待 · 需你确认',
        provider: agent,
        badge: agent,
        agentKind: rawAgent || null,
        agentId:
          String((r && (r.agentId || r.agent_id || r.sessionId || r.session_id)) || '').trim() ||
          null,
        confidence: conf,
        source: src,
        stale: stale,
        sourceBadge: sourceBadge(src),
        confBadge: confidenceBadge(conf),
        cause: cause || 'needsInput',
        actId: isPerm && !stale ? 'go_handle' : 'view_progress',
        actLabel: stale ? '查看' : isPerm ? '前往处理' : '查看'
      };
    }

    function mapWork(r) {
      var agent = rowAgentLabel(r);
      var conf = rowConfidence(r);
      var src = rowSource(r);
      var when = relativeWhenRow(r);
      var sid = String((r && (r.sessionId || r.session_id)) || '').trim() || null;
      // Title stays a shell here — home-agent-v2 deskSupplement enriches from Center session.
      return {
        title: agent + ' 正在活动',
        detail: agent + (when ? ' · ' + when : ' · ' + WHEN_UNKNOWN),
        note: '可信活跃 · 非等待',
        provider: agent,
        badge: agent,
        sessionId: sid,
        confidence: conf,
        source: src,
        sourceBadge: sourceBadge(src),
        confBadge: confidenceBadge(conf)
      };
    }

    // Stale waitingEligible → separate "需重新确认" bucket (H rule: not Needs You).
    var freshWait = [];
    var staleWait = [];
    for (var wi = 0; wi < waitRows.length; wi++) {
      if (isExpiredRow(waitRows[wi])) staleWait.push(waitRows[wi]);
      else freshWait.push(waitRows[wi]);
    }

    if (freshWait.length) {
      var mapped = freshWait.map(mapWait);
      vm.desk.needsYouRows = mapped;
      vm.desk.needsYou = mapped[0];
      var pick = mapped[0];
      var more = Math.max(0, mapped.length - 1);
      // attention > running/return/quiet (PRODUCT Hero arbitration)
      if (vm.mode === 'quiet' || vm.mode === 'return' || vm.mode === 'running') {
        vm.mode = 'attention';
        var pickPerm = /permission/i.test(pick.cause || '');
        if (pickPerm && mapped.length === 1) {
          vm.headline = '批准 ' + pick.provider + ' 的操作？';
          vm.assistance = '打开 Agent 完成批准或拒绝。';
          vm.primary = { id: 'go_handle', label: '前往处理' };
        } else {
          vm.headline =
            mapped.length === 1
              ? pick.provider + ' 等待你确认'
              : mapped.length + ' 个会话等待你确认';
          vm.assistance =
            mapped.length === 1
              ? '打开 Agent 查看并决定。'
              : '按优先级列出可处理项；主按钮处理第一条。';
          vm.primary = pickPerm
            ? { id: 'go_handle', label: '前往处理' }
            : { id: 'view_progress', label: '查看并决定' };
        }
        vm.attention = {
          title: pick.title,
          detail: pick.detail,
          primaryLabel: vm.primary.label,
          moreCount: more
        };
        vm.continuation = null;
        vm.presence = null;
      } else if (vm.mode === 'attention') {
        vm.attention = vm.attention || {};
        vm.attention.moreCount = Math.max(Number(vm.attention.moreCount) || 0, more);
        if (mapped.length > 1) {
          vm.headline = mapped.length + ' 个会话需要你处理。';
        }
      }
    }
    if (staleWait.length) {
      vm.desk.reconfirmRows = staleWait.map(function (r) {
        var m = mapWait(r);
        m.stale = true;
        m.actLabel = '了解';
        m.title = '需重新确认：' + m.title.replace(/^批准\s*/, '');
        return m;
      });
    }
    // Living: map all working rows even when Needs You is present (N agents, not 1).
    if (workRows.length) {
      var livingMapped = workRows.slice(0, 3).map(mapWork);
      vm.desk.livingRows = livingMapped;
      vm.desk.living = livingMapped[0];
      // Soft Pad Working → Hero running when nothing needs the user (aligns derive_work attn_running).
      // Do not invent running without a working row; do not override fresh needsInput.
      if (!freshWait.length) {
        var canLiftRunning =
          vm.mode === 'quiet' ||
          vm.mode === 'return' ||
          vm.mode === 'degraded' ||
          (vm.mode === 'attention' &&
            vm.primary &&
            (vm.primary.id === 'enable_cursor_activity' || vm.primary.id === 'resume'));
        if (canLiftRunning) {
          var live = livingMapped[0];
          var liveAgent = String((live && live.provider) || 'Agent');
          vm.mode = 'running';
          vm.headline =
            liveAgent === '本机工作' ? '正在处理中' : liveAgent + ' 正在处理中';
          var liveWhen = live && live.detail ? String(live.detail).split('·').slice(1).join('·').trim() : '';
          vm.assistance = liveWhen ? '最近活动：' + liveWhen : '';
          vm.presence = {
            line: (live && live.detail) || liveAgent,
            note: '运行中'
          };
          vm.attention = null;
          vm.continuation = null;
          vm.primary = { id: 'view_progress', label: '查看 Agent' };
          vm.secondary = null;
        }
      }
    }

    return applyProjectConfirmGate(vm);
  }

  /**
   * Merge cmd_agent_home_snapshot into desk: Living (active) + Continue + Recent.
   * Surfaces probeStatus / matchConfidence / EvidenceTier already on DTO.
   * Does not invent Marvis / cross-agent project cards. Collapse when empty.
   */
  function enrichFromHomeSnapshot(vm, home) {
    if (!vm || !home) return vm;
    vm.desk = vm.desk || {
      needsYou: null,
      needsYouRows: null,
      living: null,
      livingRows: null,
      continueCard: null,
      recent: null,
      reconfirmRows: null
    };

    var probe = String(home.probeStatus || home.probe_status || '');
    var sync = String(home.syncStatus || home.sync_status || '');
    var probeFoot = '';
    if (probe === 'consent_off' || sync === 'consent_off') {
      probeFoot = 'Cursor 本地活动未开启 · 只显示已记下的';
    } else if (probe === 'read_error' || probe === 'schema_unknown') {
      probeFoot = '探针暂时连不上 · ProbeStatus=' + probe;
    } else if (probe === 'stale' || sync === 'stale' || probe === 'read_locked') {
      probeFoot = '探针刚更新有点慢 · ' + (probe || sync);
    } else if (probe && probe !== 'ready') {
      probeFoot = '探针：' + probe;
    }
    if (probeFoot) vm.desk.probeFoot = probeFoot;

    var active = home.activeSession || home.active_session || null;
    var activeStatus = active ? String(active.status || '') : '';
    var activeRunning =
      !!active &&
      (active.isActive === true ||
        active.is_active === true ||
        activeStatus === 'running');
    if (
      activeRunning &&
      !vm.desk.needsYou &&
      !(vm.desk.needsYouRows && vm.desk.needsYouRows.length) &&
      !vm.desk.living &&
      !(vm.desk.livingRows && vm.desk.livingRows.length)
    ) {
      var aProv = providerLabelHome(active.provider);
      var aTitle = active.title || aProv + ' 正在活动';
      var aConf = Number(
        active.activeConfidence != null
          ? active.activeConfidence
          : active.active_confidence
      );
      var aMatch = Number(
        active.matchConfidence != null ? active.matchConfidence : active.match_confidence
      );
      var livingOne = {
        title: aTitle,
        detail:
          aProv +
          ' · ' +
          relativeWhen(active.updatedAt || active.updated_at),
        note: 'OneTone 会话记录 · 活跃',
        provider: aProv,
        badge: aProv,
        matchBadge: matchConfidenceBadge(aMatch),
        confBadge: aConf >= 0 ? matchConfidenceBadge(aConf) : null,
        tierBadge: evidenceTierBadge(
          active.projectMatch || active.project_match || active.evidenceTier
        )
      };
      vm.desk.living = livingOne;
      vm.desk.livingRows = [livingOne];
    }

    var ckpt = home.checkpoint || null;
    if (ckpt && !vm.desk.continueCard) {
      var ckTs = Number(
        ckpt.updatedAt || ckpt.updated_at || ckpt.createdAt || ckpt.created_at || 0
      );
      var ckFresh = resumeAgeFresh(ckTs);
      var ckWhen = relativeWhen(ckTs);
      var ckSid = String(ckpt.sessionId || ckpt.session_id || '');
      var sessionsForProv = Array.isArray(home.recentSessions)
        ? home.recentSessions
        : Array.isArray(home.recent_sessions)
          ? home.recent_sessions
          : [];
      var ckSession = null;
      for (var ci = 0; ci < sessionsForProv.length; ci++) {
        if (String(sessionsForProv[ci].sessionId || sessionsForProv[ci].session_id || '') === ckSid) {
          ckSession = sessionsForProv[ci];
          break;
        }
      }
      var activeSid = active ? String(active.sessionId || active.session_id || '') : '';
      var atrHint =
        /atr_checkpoint/i.test(String((home.source && home.source.reason) || '')) ||
        /onetone_atr|^atr$/i.test(String(ckpt.provider || '')) ||
        (ckSession && /onetone_atr|^atr$/i.test(String(ckSession.provider || '')));
      var rawProv =
        (ckSession && ckSession.provider) ||
        ckpt.provider ||
        '';
      // Same session still active may carry the real provider; never steal FG Soft Pad (Cursor).
      if (!rawProv && active && activeSid && ckSid && String(activeSid) === ckSid) {
        rawProv = active.provider || '';
      }
      if (!rawProv && atrHint) rawProv = 'onetone_atr';
      if (!rawProv) {
        rawProv = (home.provider && (home.provider.id || home.provider)) || '';
      }
      var ckProv = providerLabelHome(rawProv || 'Agent');
      // Never fall back to project displayName — that hijacks the agent badge.
      if (ckProv === '未知项目' || /未知/.test(ckProv)) {
        ckProv = atrHint
          ? providerLabelHome('onetone_atr')
          : providerLabelHome((active && active.provider) || 'Agent');
      }
      // Prefer real task title; never promote UI CTA / next_action boilerplate into H1.
      var projName =
        (home.project && (home.project.displayName || home.project.display_name)) ||
        vm.projectName ||
        '';
      var ckTask =
        usableResumeStep(ckpt.currentTask || ckpt.current_task, ckProv, projName) ||
        usableResumeStep(ckpt.nextAction || ckpt.next_action, ckProv, projName) ||
        '';
      var projUnconfirmed =
        !vm.confirmed && (vm.match === 'probable' || vm.match === 'unknown' || !vm.match);
      // Same session still running: Living covers it; skip Continue duplicate.
      // Stale checkpoint: skip Continue entirely (no precise age → no resume Hero).
      if (ckFresh && !(activeRunning && ckSid && ckSid === activeSid)) {
        var ckMatch = Number(
          (ckSession &&
            (ckSession.matchConfidence != null
              ? ckSession.matchConfidence
              : ckSession.match_confidence)) ||
            NaN
        );
        var ckDetailParts = [ckProv];
        if (projUnconfirmed) ckDetailParts.push('项目未确认');
        else if (projName && projName !== '未知项目') ckDetailParts.push(projName);
        if (ckWhen) ckDetailParts.push(ckWhen);
        else ckDetailParts.push(WHEN_UNKNOWN);
        if (ckMatch >= 0) ckDetailParts.push('匹配 ' + Math.round(ckMatch * 100) + '%');
        vm.desk.continueCard = {
          title: ckTask || ckProv + ' 上次进度',
          detail: ckDetailParts.join(' · '),
          note: '已保存上次进度',
          sessionId: ckSid || null,
          badge: ckProv,
          when: ckWhen || '',
          sourceBadge: { label: 'checkpoint', tone: 'auth' },
          matchBadge: projUnconfirmed
            ? { label: '未确认', tone: 'warn' }
            : matchConfidenceBadge(ckMatch)
        };
        // Quiet + fresh checkpoint with a real step → return.
        // CTA-only / empty step: keep desk card, stay quiet (no false「停在」Hero).
        if (
          ckTask &&
          vm.mode === 'quiet' &&
          !vm.desk.needsYou &&
          !vm.desk.living &&
          !(vm.desk.livingRows && vm.desk.livingRows.length)
        ) {
          vm.mode = 'return';
          vm.headline = returnHeadline(ckProv, ckTask);
          vm.assistance = resumeAssistance(projName, ckWhen, {
            projUnconfirmed: projUnconfirmed
          });
          vm.primary = { id: 'resume', label: RESUME_LABEL };
          // Same as base return path — leave return → Quiet Composer.
          vm.secondary = { id: 'start_new_task', label: '开始新任务' };
          vm.continuation = {
            title: RESUME_LABEL,
            detail: vm.desk.continueCard.detail
          };
          vm.presence = null;
        }
      }
    }

    var sessions = Array.isArray(home.recentSessions)
      ? home.recentSessions
      : Array.isArray(home.recent_sessions)
        ? home.recent_sessions
        : [];
    // Ledger sessions: skip the continue sid so Continue card + 台账 don't duplicate.
    var continueSid =
      vm.desk.continueCard && vm.desk.continueCard.sessionId
        ? String(vm.desk.continueCard.sessionId)
        : '';
    var recent = [];
    var seenProv = {};
    for (var i = 0; i < sessions.length && recent.length < 9; i++) {
      var s = sessions[i];
      var sid = String(s.sessionId || s.session_id || '');
      if (continueSid && sid === continueSid) continue;
      var prov = providerLabelHome(s.provider);
      var title = s.title || prov + ' 会话';
      var mc = Number(s.matchConfidence != null ? s.matchConfidence : s.match_confidence);
      var pm = s.projectMatch || s.project_match || '';
      recent.push({
        title: title,
        detail:
          prov +
          ' · ' +
          (relativeWhen(s.updatedAt || s.updated_at) || WHEN_UNKNOWN),
        sessionId: sid || null,
        badge: prov,
        matchBadge: matchConfidenceBadge(mc),
        tierBadge: evidenceTierBadge(pm),
        kind: 'recent'
      });
      seenProv[prov] = true;
    }
    // Soft Pad rows not already represented by a recent session provider.
    var extraRows = []
      .concat((vm.desk.needsYouRows || []).map(function (r) {
        return { provider: r.provider, title: r.title, detail: r.detail, badge: r.badge, kind: 'needsYou' };
      }))
      .concat((vm.desk.livingRows || []).map(function (r) {
        return { provider: r.provider, title: r.title, detail: r.detail, badge: r.badge, kind: 'living' };
      }));
    for (var ei = 0; ei < extraRows.length && recent.length < 9; ei++) {
      var er = extraRows[ei];
      var ep = er.provider || er.badge || '';
      if (ep && seenProv[ep]) continue;
      if (ep) seenProv[ep] = true;
      recent.push({
        title: er.title || ep,
        detail: er.detail || ep,
        badge: ep || 'Agent',
        kind: er.kind || 'recent'
      });
    }
    if (recent.length) vm.desk.recent = recent;
    if (recent.length) vm.desk.ledger = recent;

    return applyProjectConfirmGate(vm);
  }

  /**
   * Fourth ledger source: install inventory × Soft Pad attention.
   * Home Focus desk no longer renders these as the work authority —
   * Agent Center Snapshot → #homeAgentRoster does. Kept for degraded/legacy paths only.
   * Merges into desk.ledgerAgents + rebuilds desk.ledger for the view.
   */
  function enrichFromInventory(vm, inv, attn) {
    if (!vm) return vm;
    vm.desk = vm.desk || {};
    var agents = (inv && (inv.agents || inv.Agents)) || [];
    if (!agents.length) return vm;

    var attnRows = (attn && (attn.rows || attn.Rows)) || [];
    function attnForKind(kind) {
      var k = String(kind || '').toLowerCase();
      var best = null;
      for (var i = 0; i < attnRows.length; i++) {
        var a = String((attnRows[i] && attnRows[i].agent) || '').toLowerCase();
        if (!a) continue;
        if (a === k || a.indexOf(k) >= 0 || k.indexOf(a) >= 0) {
          if (!best) best = attnRows[i];
          else {
            var bs = rowState(best);
            var rs = rowState(attnRows[i]);
            var rank = { needsInput: 3, working: 2, error: 1, idle: 0 };
            if ((rank[rs] || 0) > (rank[bs] || 0)) best = attnRows[i];
          }
        }
      }
      return best;
    }

    var agentRows = [];
    for (var ai = 0; ai < agents.length; ai++) {
      var ag = agents[ai];
      var kind = String(ag.kind || ag.Kind || '');
      var presence = String(ag.presence || ag.Presence || 'none');
      var running = !!(ag.running || ag.Running);
      var conf = String(ag.confidence || ag.Confidence || '');
      // Skip agents with no local footprint.
      if (presence === 'none' && !running && conf !== 'high') continue;

      var label = providerLabelHome(kind);
      var row = attnForKind(kind);
      var st = row ? rowState(row) : '';
      var when = row ? relativeWhenRow(row) : '';
      var ledgerKind = 'idle';
      var statusLabel = '空闲';
      if (st === 'needsInput' && rowWaitingEligible(row)) {
        ledgerKind = 'needsYou';
        statusLabel = '需要你';
      } else if (st === 'working' || running) {
        ledgerKind = 'living';
        statusLabel = running && st !== 'working' ? '在跑' : '进行中';
      } else if (st === 'error') {
        ledgerKind = 'error';
        statusLabel = '异常';
      } else if (presence === 'none' || conf === 'low') {
        ledgerKind = 'untracked';
        statusLabel = '未记录';
      }

      var detailParts = [statusLabel];
      var ck = vm.desk.continueCard;
      var isContinueAgent =
        ck && providerLabelHome(ck.badge) === label;
      if (when) {
        detailParts.push(when);
      } else if (isContinueAgent && ck.when) {
        // Align with Continue card age — never invent "刚刚".
        detailParts.push(ck.when);
        if (ledgerKind === 'idle') detailParts[0] = '可继续';
      } else if (running) {
        detailParts.push('进程在跑');
      } else if (presence && presence !== 'none') {
        detailParts.push(presence);
      } else {
        detailParts.push(WHEN_UNKNOWN);
      }

      agentRows.push({
        kind: 'agent',
        agentKind: ledgerKind,
        title: label,
        detail: detailParts.join(' · '),
        badge: label,
        provider: label,
        confidence: conf,
        confBadge: confidenceBadge(conf === 'high' ? 'high' : conf === 'low' ? 'low' : ''),
        sourceBadge: row ? sourceBadge(rowSource(row)) : null,
        running: running,
        presence: presence,
        stale: row ? isExpiredRow(row) : false
      });
    }

    // Sort: needsYou → living → error → idle → untracked
    var order = { needsYou: 0, living: 1, error: 2, idle: 3, untracked: 4 };
    agentRows.sort(function (a, b) {
      return (order[a.agentKind] || 9) - (order[b.agentKind] || 9);
    });

    vm.desk.ledgerAgents = agentRows;

    // Rebuild flat ledger: agents first, then session recent (already deduped).
    var sessions = Array.isArray(vm.desk.recent) ? vm.desk.recent : [];
    var flat = agentRows.concat(sessions);
    if (flat.length) vm.desk.ledger = flat;

    return vm;
  }

  function usageVal(usage, camel, snake) {
    if (!usage) return null;
    if (usage[camel] != null && usage[camel] !== '') return usage[camel];
    if (usage[snake] != null && usage[snake] !== '') return usage[snake];
    return null;
  }

  function formatActiveDuration(ms) {
    var totalMin = Math.max(0, Math.round(Number(ms) / 60000));
    var h = Math.floor(totalMin / 60);
    var m = totalMin % 60;
    if (h > 0) return h + '小时' + m + '分';
    return m + '分';
  }

  /** True when the Focus task card is Cursor (not ATR / other agents). */
  function isCursorFocusVm(vm) {
    if (!vm) return false;
    var provider =
      (vm.dto && vm.dto.provider && (vm.dto.provider.id || vm.dto.provider.name)) ||
      vm.providerId ||
      '';
    if (/cursor/i.test(String(provider))) return true;
    if (/cursor/i.test(String(vm.appName || ''))) return true;
    var badge =
      (vm.desk && vm.desk.continueCard && (vm.desk.continueCard.badge || vm.desk.continueCard.provider)) ||
      '';
    return /cursor/i.test(String(badge));
  }

  /**
   * Compact strip for Cursor task card (Soft Pad keeps the full live card).
   * @returns {{ state: string, line: string, ready: boolean, enableCta: boolean, turns: number|null, sessions: number|null, activeLabel: string }|null}
   */
  function cursorLocalFromUsage(usage) {
    if (!usage || typeof usage !== 'object') return null;
    var status = String(usage.status || '').trim();
    var conf = String(usage.confidence || '').trim();
    var src = String(usage.source || '').trim();
    var msg = String(usage.message || '').trim();
    var turns = usageVal(usage, 'localTodayRequests', 'local_today_requests');
    var sess = usageVal(usage, 'localTodaySessions', 'local_today_sessions');
    var activeMs = usageVal(usage, 'localTodayActiveMs', 'local_today_active_ms');
    var yest = usageVal(usage, 'localYesterdayRequests', 'local_yesterday_requests');
    var ready =
      status === 'ready' &&
      turns != null &&
      (src === 'cursor_local_activity' || conf === 'local_only');
    if (ready) {
      var bits = ['今日 ' + Math.round(Number(turns)) + ' 次'];
      if (sess != null) bits.push(Math.round(Number(sess)) + ' 会话');
      var activeLabel = '';
      if (activeMs != null && Number(activeMs) > 0) {
        activeLabel = formatActiveDuration(Number(activeMs));
        bits.push('活跃 ' + activeLabel);
      }
      if (yest != null && Number(yest) > 0) {
        var delta = Math.round(((Number(turns) - Number(yest)) / Number(yest)) * 100);
        var arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '';
        bits.push('较昨 ' + arrow + Math.abs(delta) + '%');
      }
      return {
        state: 'ready',
        line: bits.join(' · '),
        ready: true,
        enableCta: false,
        turns: Math.round(Number(turns)),
        sessions: sess != null ? Math.round(Number(sess)) : null,
        activeLabel: activeLabel
      };
    }
    var consentOff =
      status === 'consent_off' ||
      /consent[_ ]?off|未启用|不会读取/i.test(msg) ||
      /consent=off/i.test(msg);
    // Only true opt-out shows 开启. busy/unavailable means already on (or no DB) —
    // 开启 would no-op and feel broken while Cursor holds the WAL.
    if (consentOff) {
      return {
        state: 'consent_off',
        line: msg || '未启用 Cursor 本机活动',
        ready: false,
        enableCta: true,
        turns: null,
        sessions: null,
        activeLabel: ''
      };
    }
    if (status === 'busy' || /库正忙|刷新暂缓/i.test(msg)) {
      // Prefer last ready totals over a pure busy sentence.
      if (turns != null) {
        var busyBits = ['今日 ' + Math.round(Number(turns)) + ' 次'];
        if (sess != null) busyBits.push(Math.round(Number(sess)) + ' 会话');
        busyBits.push('刷新暂缓');
        return {
          state: 'busy',
          line: busyBits.join(' · '),
          ready: false,
          enableCta: false,
          turns: Math.round(Number(turns)),
          sessions: sess != null ? Math.round(Number(sess)) : null,
          activeLabel: ''
        };
      }
      return {
        state: 'busy',
        line: msg || '本机 Cursor 本地统计暂时读不到（库正忙），稍后自动重试',
        ready: false,
        enableCta: false,
        turns: null,
        sessions: null,
        activeLabel: ''
      };
    }
    if (status === 'schema_unknown' || /结构暂时无法识别/i.test(msg)) {
      if (turns != null) {
        return {
          state: 'schema_unknown',
          line: '今日 ' + Math.round(Number(turns)) + ' 次 · 结构待确认',
          ready: false,
          enableCta: false,
          turns: Math.round(Number(turns)),
          sessions: sess != null ? Math.round(Number(sess)) : null,
          activeLabel: ''
        };
      }
      return {
        state: 'schema_unknown',
        line: msg || 'Cursor 本地库结构暂时无法识别，稍后重试',
        ready: false,
        enableCta: false,
        turns: null,
        sessions: null,
        activeLabel: ''
      };
    }
    return {
      state: status || 'pending',
      line: msg || '本机活动读取中…',
      ready: false,
      enableCta: false,
      turns: turns != null ? Math.round(Number(turns)) : null,
      sessions: sess != null ? Math.round(Number(sess)) : null,
      activeLabel: ''
    };
  }

  /** Attach cursorLocal only when the task card is Cursor. */
  function enrichWithCursorLocal(vm, usage) {
    if (!vm || !isCursorFocusVm(vm)) return vm;
    var local = cursorLocalFromUsage(usage);
    if (!local) return vm;
    vm.cursorLocal = local;
    return vm;
  }

  global.OneToneHomeFocusAdapter = {
    toViewModel: toViewModel,
    enrichFromAttention: enrichFromAttention,
    enrichFromHomeSnapshot: enrichFromHomeSnapshot,
    enrichFromInventory: enrichFromInventory,
    applyProjectConfirmGate: applyProjectConfirmGate,
    cursorLocalFromUsage: cursorLocalFromUsage,
    enrichWithCursorLocal: enrichWithCursorLocal,
    isCursorFocusVm: isCursorFocusVm,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
