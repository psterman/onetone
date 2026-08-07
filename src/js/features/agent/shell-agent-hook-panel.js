/**
 * Soft Pad Shell Hook panel — WorkBuddy / Trae / Qoder.
 * Main path: detect → install → refresh. Copy draft is under More…
 * Does not clone Claude Activity.
 */
(function (global) {
  'use strict';

  var SHELL_KINDS = { workbuddy: true, trae: true, qoder: true };
  var lastStatusByKind = {};

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

  function invoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (typeof fn !== 'function') return Promise.reject(new Error('no_invoke'));
    return Promise.resolve(fn(cmd, args || {}));
  }

  function shortPath(p) {
    p = String(p || '');
    if (!p) return '';
    var home = '';
    try {
      // Display-only: collapse user profile prefix if present in path.
      var m = p.match(/^[A-Za-z]:\\Users\\[^\\]+\\(.*)$/);
      if (m) return '~\\' + m[1].replace(/\\/g, '/');
    } catch (_) {}
    return p.replace(/\\/g, '/');
  }

  function phaseOf(status) {
    if (!status) return 'unknown';
    if (status.probeExists === false) return 'probe_missing';
    if (status.onetoneConfigured) return 'connected';
    if (status.settingsParseOk === false && status.settingsExists) return 'error';
    return 'not_configured';
  }

  function renderShellAgentHookPanel(opts) {
    opts = opts || {};
    var kind = String(opts.kind || '').toLowerCase();
    if (!SHELL_KINDS[kind]) return '';
    var status = opts.status || lastStatusByKind[kind] || null;
    var phase = phaseOf(status);
    var path = status && status.settingsPath ? shortPath(status.settingsPath) : '';
    var title = t('softPadShellHookTitle', 'Shell Hook');
    var cap = t('softPadShellHookCapHint', 'Shortcuts · 主灯 · 无 Sessions/Resume');
    var line = '';
    var actions = '';

    if (phase === 'probe_missing') {
      // Advanced-only: muted one-liner, no red error card (center column never mounts this).
      if (opts.hideProbeMissing) return '';
      line =
        '<span class="shell-hook-panel__hint">' +
        esc(t('softPadShellHookProbeMissingMuted', '探针未找到时仍可用氛围灯/顶栏；键灯自动同步不可用。')) +
        '</span>';
      actions =
        '<button type="button" class="codex-micro-pad__btn" data-shell-hook-act="detect">' +
        esc(t('softPadShellHookDetect', '重新检测')) +
        '</button>';
    } else if (phase === 'connected') {
      line =
        '<strong class="shell-hook-panel__phase is-ok">' +
        esc(t('softPadShellHookConnected', '已接入')) +
        '</strong>' +
        (path ? '<span class="shell-hook-panel__path"> · ' + esc(path) + '</span>' : '');
      actions =
        '<button type="button" class="codex-micro-pad__btn" data-shell-hook-act="detect">' +
        esc(t('softPadShellHookDetect', '重新检测')) +
        '</button>' +
        '<button type="button" class="codex-micro-pad__btn" data-shell-hook-act="uninstall">' +
        esc(t('softPadShellHookUninstall', '撤回')) +
        '</button>';
    } else if (phase === 'error') {
      line =
        '<strong class="shell-hook-panel__phase is-error">' +
        esc(t('softPadShellHookProbeMissing', '配置异常')) +
        '</strong>' +
        (path ? '<span class="shell-hook-panel__path"> · ' + esc(path) + '</span>' : '');
      actions =
        '<button type="button" class="codex-micro-pad__btn" data-shell-hook-act="detect">' +
        esc(t('softPadShellHookDetect', '重新检测')) +
        '</button>';
    } else {
      line =
        '<strong class="shell-hook-panel__phase">' +
        esc(t('softPadShellHookNotConfigured', '尚未接入')) +
        '</strong>';
      actions =
        '<button type="button" class="codex-micro-pad__btn codex-micro-pad__btn--primary" data-shell-hook-act="install"' +
        (status && status.canInstall === false ? ' disabled' : '') +
        '>' +
        esc(t('softPadShellHookInstall', '接入')) +
        '</button>' +
        '<details class="shell-hook-panel__more">' +
        '<summary>' +
        esc(t('softPadShellHookMore', '更多…')) +
        '</summary>' +
        '<button type="button" class="codex-micro-pad__btn" data-shell-hook-act="copy">' +
        esc(t('softPadShellHookCopyDraft', '复制配置草案')) +
        '</button>' +
        '</details>';
    }

    return (
      '<section class="shell-hook-panel" data-shell-hook-kind="' +
      esc(kind) +
      '">' +
      '<header class="shell-hook-panel__head">' +
      '<span class="shell-hook-panel__title">' +
      esc(title) +
      '</span>' +
      '<span class="shell-hook-panel__cap">' +
      esc(cap) +
      '</span>' +
      '</header>' +
      '<div class="shell-hook-panel__status">' +
      line +
      '</div>' +
      '<div class="shell-hook-panel__actions">' +
      actions +
      '</div>' +
      '</section>'
    );
  }

  function mountShellAgentHookPanel(host, kind, opts) {
    if (!host) return null;
    opts = opts || {};
    kind = String(kind || '').toLowerCase();
    if (!SHELL_KINDS[kind]) return null;
    var existing = host.querySelector('[data-shell-hook-kind="' + kind + '"]');
    var wrap = existing && existing.closest ? existing.closest('.shell-hook-panel-host') : null;
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'shell-hook-panel-host';
      host.appendChild(wrap);
    }
    var renderOpts = {
      kind: kind,
      status: lastStatusByKind[kind],
      hideProbeMissing: !!opts.hideProbeMissing
    };
    wrap.innerHTML = renderShellAgentHookPanel(renderOpts);
    if (!wrap.innerHTML) {
      wrap.innerHTML =
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadShellHookProbeMissingMuted',
          '探针未找到时仍可用氛围灯/顶栏；键灯自动同步不可用。')) +
        '</p>';
      return wrap;
    }
    bindShellHookPanel(wrap, kind);
    refreshShellAgentHookStatus(kind).then(function () {
      if (!wrap.isConnected) return;
      renderOpts.status = lastStatusByKind[kind];
      var html = renderShellAgentHookPanel(renderOpts);
      wrap.innerHTML = html || (
        '<p class="codex-pad-mgr__hint">' +
        esc(t('softPadShellHookProbeMissingMuted',
          '探针未找到时仍可用氛围灯/顶栏；键灯自动同步不可用。')) +
        '</p>'
      );
      if (html) {
        wrap.__shellHookBound = false;
        bindShellHookPanel(wrap, kind);
      }
    });
    return wrap;
  }

  function bindShellHookPanel(root, kind) {
    if (!root || root.__shellHookBound) return;
    root.__shellHookBound = true;
    root.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest && ev.target.closest('[data-shell-hook-act]');
      if (!btn || !root.contains(btn)) return;
      var act = btn.getAttribute('data-shell-hook-act');
      var k = (root.querySelector('[data-shell-hook-kind]') || {}).getAttribute
        ? root.querySelector('[data-shell-hook-kind]').getAttribute('data-shell-hook-kind')
        : kind;
      if (act === 'detect') refreshShellAgentHookStatus(k).then(function () { remount(root, k); });
      else if (act === 'install') installShellAgentHook(k).then(function () { remount(root, k); });
      else if (act === 'uninstall') uninstallShellAgentHook(k).then(function () { remount(root, k); });
      else if (act === 'copy') copyDraft(k);
    });
  }

  function remount(root, kind) {
    if (!root || !root.isConnected) return;
    root.innerHTML = renderShellAgentHookPanel({ kind: kind, status: lastStatusByKind[kind] });
    root.__shellHookBound = false;
    bindShellHookPanel(root, kind);
  }

  function refreshShellAgentHookStatus(kind) {
    kind = String(kind || '').toLowerCase();
    return invoke('cmd_shell_agent_hook_setup_status', { kind: kind })
      .then(function (st) {
        lastStatusByKind[kind] = st || null;
        return st;
      })
      .catch(function () {
        lastStatusByKind[kind] = lastStatusByKind[kind] || { probeExists: false, onetoneConfigured: false };
        return lastStatusByKind[kind];
      });
  }

  function installShellAgentHook(kind) {
    kind = String(kind || '').toLowerCase();
    return invoke('cmd_shell_agent_hook_install_confirm', { kind: kind }).then(function (res) {
      return refreshShellAgentHookStatus(kind).then(function () { return res; });
    });
  }

  function uninstallShellAgentHook(kind) {
    kind = String(kind || '').toLowerCase();
    return invoke('cmd_shell_agent_hook_uninstall', { kind: kind }).then(function (res) {
      return refreshShellAgentHookStatus(kind).then(function () { return res; });
    });
  }

  function copyDraft(kind) {
    kind = String(kind || '').toLowerCase();
    var st = lastStatusByKind[kind];
    var text = (st && st.draftJson) || '';
    if (!text) {
      return refreshShellAgentHookStatus(kind).then(function (s) {
        text = (s && s.draftJson) || '';
        return writeClipboard(text);
      });
    }
    return writeClipboard(text);
  }

  function writeClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(String(text || ''));
      }
    } catch (_) {}
    try {
      var ta = document.createElement('textarea');
      ta.value = String(text || '');
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {}
    return Promise.resolve();
  }

  global.OneToneShellAgentHookPanel = {
    renderShellAgentHookPanel: renderShellAgentHookPanel,
    mountShellAgentHookPanel: mountShellAgentHookPanel,
    refreshShellAgentHookStatus: refreshShellAgentHookStatus,
    installShellAgentHook: installShellAgentHook,
    uninstallShellAgentHook: uninstallShellAgentHook,
    isShellHookKind: function (k) { return !!SHELL_KINDS[String(k || '').toLowerCase()]; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
