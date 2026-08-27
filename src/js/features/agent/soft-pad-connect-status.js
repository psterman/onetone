/**
 * Soft Pad Agent connect status — MiniMax-quota-style phases + expand card.
 * Data from existing *_hook_setup_status; does not auto-write hooks.
 */
(function (global) {
  'use strict';

  /** @typedef {'solo'|'quota'|'not_configured'|'waiting'|'connected'|'error'|'unknown'} ConnectPhase */

  var HOOK_KINDS = {
    codex: true,
    claude: true,
    cursor: true,
    workbuddy: true,
    traecode: true,
    traeCode: true,
    qoder: true,
    copilotcli: true,
    copilotCli: true,
    gemini: true,
    cline: true,
    roo: true,
    opencode: true,
    aider: true
  };

  function t(key, fallback) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function normKind(kind) {
    kind = String(kind || '').trim();
    if (kind === 'traecode') return 'traeCode';
    if (kind === 'copilotcli') return 'copilotCli';
    return kind;
  }

  function supportsHookInstall(kind) {
    kind = normKind(kind);
    return !!HOOK_KINDS[kind] || !!HOOK_KINDS[String(kind).toLowerCase()];
  }

  function isSoloKind(kind) {
    kind = String(kind || '').toLowerCase();
    return kind === 'trae' || kind === 'windsurf' || kind === 'copilotvscode';
  }

  function isQuotaKind(kind) {
    return String(kind || '').toLowerCase() === 'minimax';
  }

  function shortPath(p) {
    p = String(p || '');
    if (!p) return '';
    try {
      var m = p.match(/^[A-Za-z]:\\Users\\[^\\]+\\(.*)$/);
      if (m) return '~\\' + m[1].replace(/\\/g, '/');
    } catch (_) {}
    return p.replace(/\\/g, '/');
  }

  /**
   * Unify Codex / Claude / Cursor / Shell status into one phase enum.
   * @param {string} kind
   * @param {object|null} st setup_status payload
   * @param {{ lightStatus?: string, hasRecentEvent?: boolean }} [attn]
   * @returns {ConnectPhase}
   */
  function phaseOf(kind, st, attn) {
    kind = normKind(kind);
    var low = String(kind).toLowerCase();
    if (isSoloKind(low)) return 'solo';
    if (isQuotaKind(low)) return 'quota';
    if (!supportsHookInstall(kind)) return 'unknown';
    st = st || {};
    attn = attn || {};

    if (low === 'codex') {
      var cp = String(st.panelPhase || st.panel_phase || '').toLowerCase();
      if (cp === 'connected') return 'connected';
      if (cp === 'configured_waiting' || cp === 'waiting') return 'waiting';
      if (st.hooksFileExists === false && st.probeConfigured) return 'error';
      return 'not_configured';
    }

    if (low === 'claude') {
      var ip = String(
        st.installPhase || st.install_phase || st.panelPhase || st.panel_phase || ''
      ).toLowerCase();
      if (ip === 'error') return 'error';
      if (ip === 'connected') return 'connected';
      if (ip === 'waiting' || ip === 'stale') return 'waiting';
      if (st.settingsParseOk === false && st.settingsExists) return 'error';
      if (st.onetoneConfigured || st.onetone_configured) {
        return attn.hasRecentEvent ? 'connected' : 'waiting';
      }
      return 'not_configured';
    }

    if (low === 'cursor') {
      if (st.settingsParseOk === false) return 'error';
      var ready = !!(st.tokenOk || st.token_ok || st.probeOk || st.probe_ok || st.onetoneConfigured);
      if (ready) {
        var light = String(attn.lightStatus || st.lightStatus || '').toLowerCase();
        if (light && light !== 'idle') return 'connected';
        return 'waiting';
      }
      return 'not_configured';
    }

    // Shell agents
    if (st.probeExists === false) return 'error';
    if (st.settingsParseOk === false && st.settingsExists) return 'error';
    if (st.onetoneConfigured || st.onetone_configured) {
      var ls = String(attn.lightStatus || '').toLowerCase();
      if (ls && ls !== 'idle') return 'connected';
      return 'waiting';
    }
    return 'not_configured';
  }

  function phaseLabel(phase) {
    if (phase === 'connected') return t('softPadConnectPhaseConnected', '已接入');
    if (phase === 'waiting') return t('softPadConnectPhaseWaiting', '等待事件');
    if (phase === 'not_configured') return t('softPadConnectPhaseNeed', '未接入');
    if (phase === 'error') return t('softPadConnectPhaseError', '配置异常');
    if (phase === 'solo') return t('softPadConnectPhaseSolo', '本地监视');
    if (phase === 'quota') return t('softPadConnectPhaseQuota', '额度灯');
    return t('softPadConnectPhaseUnknown', '—');
  }

  /** Whether row should show primary install/copy CTA. */
  function needsAction(phase) {
    return phase === 'not_configured' || phase === 'error';
  }

  function primaryAction(kind, phase) {
    kind = normKind(kind);
    if (!needsAction(phase)) return null;
    if (String(kind).toLowerCase() === 'cursor') return 'copy';
    return 'install';
  }

  function pathFromStatus(st) {
    if (!st) return '';
    return shortPath(
      st.settingsPath || st.settings_path ||
      st.hooksFilePath || st.hooks_file_path ||
      st.settingsFilePath || st.settings_file_path ||
      ''
    );
  }

  function trustHintFromStatus(kind, st) {
    kind = String(normKind(kind) || '').toLowerCase();
    if (kind !== 'codex') return '';
    var hint = String((st && (st.trustHint || st.trust_hint)) || '').trim();
    if (hint) return hint;
    return t(
      'softPadConnectCodexTrust',
      '若已写入仍无事件：在 Codex CLI 运行 /hooks 并 Trust OneTone 探针。'
    );
  }

  /**
   * MiniMax-key-card style expand card for one agent.
   * @param {{ kind: string, label: string, phase: ConnectPhase, status?: object, isFg?: boolean }} opts
   */
  function renderExpandCardHtml(opts) {
    opts = opts || {};
    var kind = normKind(opts.kind);
    var label = opts.label || kind;
    var phase = opts.phase || 'unknown';
    var st = opts.status || {};
    var path = pathFromStatus(st);
    var action = primaryAction(kind, phase);
    var phaseCls = 'is-' + String(phase || 'unknown').replace(/_/g, '-');
    var head =
      '<p class="codex-pad-mgr__label soft-pad-connect-card__title">' +
      esc(label) + ' · ' + esc(phaseLabel(phase)) +
      (opts.isFg
        ? (' <span class="soft-pad-connect-card__fg">' +
          esc(t('softPadConnectFgBadge', '当前前台')) + '</span>')
        : '') +
      '</p>';

    var hint = '';
    if (phase === 'not_configured') {
      hint = action === 'copy'
        ? t('softPadConnectHintCopy', '复制合并预览后，粘贴到 Cursor 的 hooks.json（不会自动写入）。')
        : t('softPadConnectHintInstall', '确认后写入该 Agent 配置（会先备份）。装完回 Agent 发一条消息点亮状态。');
    } else if (phase === 'waiting') {
      hint = t('softPadConnectHintWaiting', '已写入，等待第一条生命周期事件。回对应 Agent 发一条消息即可。');
    } else if (phase === 'connected') {
      hint = t('softPadConnectHintConnected', '已收到事件，顶栏/迷你栏可持续监视。');
    } else if (phase === 'error') {
      hint = t('softPadConnectHintError', '配置异常或探针缺失。可重新检测，或撤回后一键再接入。');
    } else if (phase === 'solo') {
      hint = t('softPadConnectHintSolo', '此 Agent 用本地活动灯，无需 Hook 安装。');
    } else if (phase === 'quota') {
      hint = t('softPadConnectHintQuota', 'MiniMax 用额度灯；API Key 在「API 额度候补」里填写。');
    }

    var meta = path
      ? ('<p class="codex-pad-mgr__hint soft-pad-connect-card__path">' + esc(path) + '</p>')
      : '';

    var trust = '';
    if (phase === 'waiting' || phase === 'connected') {
      var th = trustHintFromStatus(kind, st);
      if (th) {
        trust = '<p class="codex-pad-mgr__hint soft-pad-connect-card__trust" data-connect-trust="1">' +
          esc(th) + '</p>';
      }
    }

    var actions = '<div class="codex-pad-mgr__claude-act-actions soft-pad-connect-card__actions">';
    if (action === 'install') {
      actions +=
        '<button type="button" class="codex-micro-pad__btn is-primary" data-act="connect-install" data-agent="' +
        esc(kind) + '">' +
        esc(t('softPadConnectInstallWatch', '确认接入并监视状态')) + '</button>';
    } else if (action === 'copy') {
      actions +=
        '<button type="button" class="codex-micro-pad__btn is-primary" data-act="connect-copy" data-agent="' +
        esc(kind) + '">' +
        esc(t('softPadConnectCopyCursor', '复制 Cursor Hook 配置')) + '</button>';
    }
    actions +=
      '<button type="button" class="codex-micro-pad__btn" data-act="connect-refresh" data-agent="' +
      esc(kind) + '">' +
      esc(t('softPadConnectRefresh', '刷新状态')) + '</button>';
    if (phase === 'connected' || phase === 'waiting') {
      if (String(kind).toLowerCase() !== 'cursor') {
        actions +=
          '<button type="button" class="codex-micro-pad__btn" data-act="connect-uninstall" data-agent="' +
          esc(kind) + '">' +
          esc(t('softPadConnectUninstall', '撤回')) + '</button>';
      }
    }
    actions += '</div>';

    var err = '';
    if (phase === 'error') {
      err = '<p class="codex-pad-mgr__hint is-error" data-connect-error="1">' +
        esc(t('softPadConnectErrorLine', '请检查配置文件 JSON，或点一键接入重试。')) +
        '</p>';
    }

    return (
      '<div class="codex-pad-mgr__claude-act soft-pad-minimax-key soft-pad-connect-card ' +
      phaseCls + '" data-connect-card="' + esc(kind) + '" data-connect-phase="' + esc(phase) + '">' +
      head +
      '<p class="codex-pad-mgr__hint">' + esc(hint) + '</p>' +
      meta + trust + actions + err +
      '</div>'
    );
  }

  /**
   * Compact phase pill for a light row.
   */
  function renderPhasePillHtml(phase) {
    var cls = 'soft-pad-connect-pill is-' + String(phase || 'unknown').replace(/_/g, '-');
    return (
      '<span class="' + cls + '" data-connect-phase-pill="' + esc(phase) + '">' +
      esc(phaseLabel(phase)) + '</span>'
    );
  }

  function invoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (typeof fn !== 'function') return Promise.reject(new Error('no_invoke'));
    return Promise.resolve(fn(cmd, args || {}));
  }

  function fetchStatus(kind) {
    kind = normKind(kind);
    var low = String(kind).toLowerCase();
    if (low === 'claude') return invoke('cmd_claude_hook_setup_status', {});
    if (low === 'cursor') return invoke('cmd_cursor_hook_setup_status', {});
    if (low === 'codex') return invoke('cmd_codex_hook_setup_status', {});
    if (supportsHookInstall(kind)) {
      return invoke('cmd_shell_agent_hook_setup_status', { kind: kind });
    }
    return Promise.resolve(null);
  }

  function installKind(kind) {
    kind = normKind(kind);
    var low = String(kind).toLowerCase();
    if (low === 'claude') return invoke('cmd_claude_hook_install_confirm', {});
    if (low === 'codex') return invoke('cmd_codex_hook_install_confirm', {});
    if (low === 'cursor') {
      return Promise.resolve({ ok: false, manual: true, kind: 'cursor' });
    }
    if (supportsHookInstall(kind)) {
      return invoke('cmd_shell_agent_hook_install_confirm', { kind: kind });
    }
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  function uninstallKind(kind) {
    kind = normKind(kind);
    var low = String(kind).toLowerCase();
    if (low === 'claude') return invoke('cmd_claude_hook_uninstall_onetone', {});
    if (low === 'codex') {
      // Codex has no dedicated uninstall IPC in all builds — refresh-only fallback.
      return Promise.resolve({ ok: false, reason: 'codex_manual' });
    }
    if (supportsHookInstall(kind)) {
      return invoke('cmd_shell_agent_hook_uninstall', { kind: kind });
    }
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  global.OneToneSoftPadConnect = {
    supportsHookInstall: supportsHookInstall,
    isSoloKind: isSoloKind,
    isQuotaKind: isQuotaKind,
    normKind: normKind,
    phaseOf: phaseOf,
    phaseLabel: phaseLabel,
    needsAction: needsAction,
    primaryAction: primaryAction,
    pathFromStatus: pathFromStatus,
    renderExpandCardHtml: renderExpandCardHtml,
    renderPhasePillHtml: renderPhasePillHtml,
    fetchStatus: fetchStatus,
    installKind: installKind,
    uninstallKind: uninstallKind,
    shortPath: shortPath
  };
})(typeof window !== 'undefined' ? window : globalThis);
