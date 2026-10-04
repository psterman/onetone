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

  function providerLabelHome(p) {
    var s = String(p || '').toLowerCase();
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

  /** Single H1 template for return: provider + step, with CJK/Latin spacing. */
  function returnHeadline(provider, task) {
    var prov = providerLabelHome(provider);
    var step = String(task || '')
      .replace(/。$/, '')
      .trim();
    if (!step) return '你上次的工作可以继续。';
    // Avoid treating session titles like "codex session" as the agent name alone.
    var looksLikeSessionTitle = /session/i.test(step) && new RegExp(prov, 'i').test(step);
    if (looksLikeSessionTitle) {
      return '你上次停在 ' + prov + '。';
    }
    return '你上次停在 ' + prov + ' 的「' + step + '」。';
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

    // Priority: error → degraded; waiting → attention; resumable → return;
    // running → quiet+whisper; else quiet.
    // Project uncertainty is row-level (desk.projectGate), never page-level H1.
    if (ws === 'error' || (action && action.kind === 'retry') || provider.status === 'unavailable') {
      mode = 'degraded';
      headline = workTitle || '我暂时无法确认当前工作状态。';
      assistance =
        workDesc ||
        '读取依据不足。可以重试，或到「设置」检查数据源。';
      presence = {
        line: appName + ' · ' + (needsProject ? '项目未确认' : projectName) + ' · ' + when,
        note: '不会用猜测填充首页'
      };
      restoreLabel = (action && action.title) || '重试';
      primary = { id: 'retry', label: restoreLabel };
      secondary = { id: 'view_reason', label: '查看判断依据' };
    } else if (ws === 'waiting') {
      mode = 'attention';
      var attnTitle = workTitle || '需要你确认一件事';
      var agentLabel =
        provider.id === 'claude' || /claude/i.test(String(provider.id || ''))
          ? 'Claude'
          : appName;
      headline = agentLabel + ' 正等你确认' + (workTitle ? '：' + workTitle.replace(/。$/, '') : '') + '。';
      assistance = '我已压住其他提醒，只把这一件事留给你。';
      attention = {
        title: attnTitle,
        detail: workDesc || '打开后查看详情并决定。',
        primaryLabel: (action && action.title) || '查看并决定',
        moreCount: 0
      };
      primary = { id: 'view_progress', label: attention.primaryLabel };
      progress = {
        text: (workTitle || '进行中') + ' · 等待确认 · ' + when,
        source: String(source.reason || provider.id || ''),
        allowed: true
      };
    } else if (ws === 'resumable' && action && action.kind === 'resume') {
      mode = 'return';
      var resumeProv =
        provider.id === 'claude' || /claude/i.test(String(provider.id || ''))
          ? 'Claude'
          : provider.id === 'codex' || /codex/i.test(String(provider.id || ''))
            ? 'Codex'
            : providerLabelHome(provider.id || appName);
      headline = returnHeadline(resumeProv, workDesc || workTitle);
      assistance =
        '当前项目仍是 ' +
        projectName +
        '，可以从停下的地方继续。';
      continuation = {
        title: RESUME_LABEL,
        detail: workDesc || '已保存上次进度'
      };
      primary = { id: 'resume', label: RESUME_LABEL };
      progress = {
        text: (workTitle || '可恢复') + ' · ' + when,
        source: 'checkpoint',
        allowed: true
      };
    } else if (ws === 'running') {
      // Working without blocking the user → quiet companionship + whisper.
      mode = 'quiet';
      headline =
        '你正在 ' +
        appName +
        ' 中处理 ' +
        (confirmed || match === 'exact' ? projectName : '当前工作') +
        '。';
      assistance =
        '已识别 ' +
        appName +
        (confirmed || match === 'exact' ? ' 和 ' + projectName : '') +
        '。现在没有需要你处理的事；需要你时再提醒。';
      presence = {
        line:
          appName +
          ' · ' +
          (confirmed || match === 'exact' ? projectName : '进行中') +
          ' · ' +
          when,
        note: '没有需要你处理的事'
      };
      progress = {
        text: (workTitle || '进行中') + ' · ' + when,
        source: String(source.reason || provider.id || ''),
        allowed: !!workTitle
      };
      primary = null;
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
    if (needsProject) {
      var gateKind =
        action && action.kind === 'confirm_project' && project.root
          ? 'confirm_project'
          : 'pick_project';
      var gateLabel =
        (action &&
          (action.kind === 'confirm_project' || action.kind === 'pick_project') &&
          action.title) ||
        (gateKind === 'confirm_project' ? '确认当前项目' : '选择当前项目');
      desk.projectGate = {
        title: '项目未确认',
        detail:
          projectName && projectName !== '未知项目'
            ? '可能是 ' + projectName
            : appName,
        note: '',
        badge: '未确认',
        sourceBadge: { label: '不猜测', tone: 'inf' },
        actId: gateKind,
        actLabel: gateLabel
      };
    }
    if (ws === 'waiting') {
      desk.needsYou = {
        title: workTitle || '需要你确认',
        detail: agentLabel + (projectName && (confirmed || match === 'exact') ? ' · ' + projectName : '') + ' · ' + when,
        note: workDesc || '来自 Soft Pad / attention 明确等待'
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
    if (ws === 'resumable' && action && action.kind === 'resume') {
      desk.continueCard = {
        title: workDesc || workTitle || agentLabel + ' 上次进度',
        detail: agentLabel + (confirmed || match === 'exact' ? ' · ' + projectName : '') + ' · ' + when,
        note: '已保存上次进度',
        badge: agentLabel,
        sourceBadge: { label: 'checkpoint', tone: 'auth' }
      };
    }

    return {
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
    };
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
      var title = /permission/i.test(cause)
        ? '批准 ' + agent + ' 的操作？'
        : agent + ' 需要你确认';
      var when = relativeWhenRow(r);
      var conf = rowConfidence(r);
      var src = rowSource(r);
      var stale = isExpiredRow(r);
      return {
        title: title,
        detail: agent + ' · Soft Pad' + (when ? ' · ' + when : ' · ' + WHEN_UNKNOWN),
        note: stale ? '信号已过期 · 需重新确认' : '明确等待 · 非 mtime',
        provider: agent,
        badge: agent,
        confidence: conf,
        source: src,
        stale: stale,
        sourceBadge: sourceBadge(src),
        confBadge: confidenceBadge(conf),
        cause: cause || 'needsInput',
        actId: stale ? 'view_progress' : 'view_progress',
        actLabel: stale ? '查看' : '查看'
      };
    }

    function mapWork(r) {
      var agent = rowAgentLabel(r);
      var conf = rowConfidence(r);
      var src = rowSource(r);
      var when = relativeWhenRow(r);
      return {
        title: agent + ' 正在活动',
        detail: agent + (when ? ' · ' + when : ' · ' + WHEN_UNKNOWN),
        note: '可信活跃 · 非等待',
        provider: agent,
        badge: agent,
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
      if (vm.mode === 'quiet' || vm.mode === 'return') {
        vm.mode = 'attention';
        vm.headline =
          mapped.length === 1
            ? pick.provider + ' 正等你确认。'
            : mapped.length + ' 个会话需要你处理。';
        vm.assistance =
          mapped.length === 1
            ? '我已压住其他提醒，只把这一件事留给你。'
            : '按优先级列出可处理项；主按钮处理第一条。';
        vm.primary = { id: 'view_progress', label: '查看并决定' };
        vm.attention = {
          title: pick.title,
          detail: pick.detail,
          primaryLabel: '查看并决定',
          moreCount: more
        };
        vm.continuation = null;
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
    }

    return vm;
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
      var ckWhen = relativeWhen(
        ckpt.updatedAt || ckpt.updated_at || ckpt.createdAt || ckpt.created_at
      );
      var ckTask =
        ckpt.currentTask ||
        ckpt.current_task ||
        ckpt.nextAction ||
        ckpt.next_action ||
        '';
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
      var rawProv =
        (ckSession && ckSession.provider) ||
        (active && active.provider) ||
        ckpt.provider ||
        (home.provider && (home.provider.id || home.provider)) ||
        '';
      var ckProv = providerLabelHome(rawProv || 'Agent');
      // Never fall back to project displayName — that hijacks the agent badge.
      if (ckProv === '未知项目' || /未知/.test(ckProv)) {
        ckProv = providerLabelHome((active && active.provider) || 'Agent');
      }
      var projName =
        (home.project && (home.project.displayName || home.project.display_name)) ||
        vm.projectName ||
        '';
      var projUnconfirmed =
        !vm.confirmed && (vm.match === 'probable' || vm.match === 'unknown' || !vm.match);
      var activeSid = active ? String(active.sessionId || active.session_id || '') : '';
      // Same session still running: Living covers it; skip Continue duplicate.
      if (!(activeRunning && ckSid && ckSid === activeSid)) {
        var ckDetailParts = [ckProv];
        if (projUnconfirmed) ckDetailParts.push('项目未确认');
        else if (projName && projName !== '未知项目') ckDetailParts.push(projName);
        if (ckWhen) ckDetailParts.push(ckWhen);
        vm.desk.continueCard = {
          title: ckTask || ckProv + ' 上次进度',
          detail: ckDetailParts.join(' · '),
          note: '已保存上次进度',
          sessionId: ckSid || null,
          badge: ckProv,
          when: ckWhen || '',
          sourceBadge: { label: 'checkpoint', tone: 'auth' },
          matchBadge: projUnconfirmed ? { label: '未确认', tone: 'warn' } : null
        };
        // Quiet + checkpoint → return only when not already living/waiting.
        if (
          vm.mode === 'quiet' &&
          !vm.desk.needsYou &&
          !vm.desk.living &&
          !(vm.desk.livingRows && vm.desk.livingRows.length)
        ) {
          vm.mode = 'return';
          vm.headline = returnHeadline(ckProv, ckTask);
          vm.assistance = projUnconfirmed
            ? '可以从停下的地方继续。项目仍未确认——不会用猜测绑定。'
            : '可以从停下的地方继续。';
          vm.primary = { id: 'resume', label: RESUME_LABEL };
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

    return vm;
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

  global.OneToneHomeFocusAdapter = {
    toViewModel: toViewModel,
    enrichFromAttention: enrichFromAttention,
    enrichFromHomeSnapshot: enrichFromHomeSnapshot,
    enrichFromInventory: enrichFromInventory,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
