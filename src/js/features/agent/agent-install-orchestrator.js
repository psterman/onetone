/**
 * Shared Soft Pad install orchestrator — Quick Start + Soft Pad Hub.
 * Prepare Soft Pad mappings, status lights, mini overlay; Hook connect is separate.
 */
(function (global) {
  'use strict';

  var KINDS = ['codex', 'claude', 'cursor', 'minimax', 'workbuddy', 'trae', 'traeCode', 'qoder'];

  var KIND_META = {
    codex: { appId: 'codex-chat', label: 'Codex', icon: 'icons/app-target/codex.png' },
    claude: { appId: 'claude-code', label: 'Claude', icon: 'icons/app-target/claude.png' },
    cursor: { appId: 'cursor-chat', label: 'Cursor', icon: 'icons/app-target/cursor.png' },
    minimax: { appId: 'minimax-chat', label: 'MiniMax', icon: 'icons/app-target/minimaxcode.png' },
    workbuddy: { appId: 'workbuddy-chat', label: 'WorkBuddy', icon: 'icons/app-target/workbuddy.png' },
    trae: { appId: 'trae-work', label: 'Trae Work', icon: 'icons/app-target/trae.png' },
    traecode: { appId: 'trae-code', label: 'Trae Code', icon: 'icons/app-target/trae-code.png' },
    traeCode: { appId: 'trae-code', label: 'Trae Code', icon: 'icons/app-target/trae-code.png' },
    qoder: { appId: 'qoder-chat', label: 'Qoder', icon: 'icons/app-target/qoder.png' }
  };

  function t(key, fallback) {
    var i18n = global.OneToneI18n;
    if (i18n && i18n.t) {
      var v = i18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback || key;
  }

  function invoke(cmd, args) {
    var fn = global.__vp_invoke__ || (global.OneToneIpc && global.OneToneIpc.invoke);
    if (!fn) return Promise.reject(new Error('no_invoke'));
    return fn(cmd, args || {});
  }

  function meta(kind) {
    return KIND_META[kind] || { appId: '', label: kind, icon: '' };
  }

  function emptyInventory() {
    return {
      agents: KINDS.map(function (kind) {
        return {
          kind: kind,
          appTargetId: meta(kind).appId,
          presence: 'none',
          confidence: 'low',
          running: false,
          prepared: false,
          lightEnabled: false,
          evidence: []
        };
      }),
      highConfidenceCount: 0
    };
  }

  function fetchInventory() {
    return invoke('cmd_agent_install_inventory').then(function (res) {
      var agents = (res && res.agents) || [];
      if (!agents.length) return emptyInventory();
      return {
        agents: agents,
        highConfidenceCount: Number(res && (res.highConfidenceCount != null ? res.highConfidenceCount : res.high_confidence_count)) || 0
      };
    }).catch(function () {
      // Capability / offline: still show builtin tools for manual pick.
      return emptyInventory();
    });
  }

  function defaultSelectedKinds(inventory) {
    var agents = (inventory && inventory.agents) || [];
    return agents
      .filter(function (a) { return a.confidence === 'high'; })
      .map(function (a) { return String(a.kind || ''); })
      .filter(Boolean);
  }

  function evidenceLabel(row) {
    var list = (row && row.evidence) || [];
    var kinds = {};
    list.forEach(function (e) { kinds[String(e.kind || '')] = true; });
    if (row && row.running) return t('qsAiEvRunning', '正在运行');
    if (kinds.desktop || kinds.package) return t('qsAiEvDesktop', '桌面端');
    if (kinds.cli) return t('qsAiEvCli', 'CLI');
    if (kinds.embedded) return t('qsAiEvEmbedded', '内嵌');
    if (kinds.config || row.presence === 'configOnly') return t('qsAiEvMaybe', '可能安装');
    return t('qsAiEvNone', '未检测到');
  }

  function sortAgentsForUi(agents) {
    var order = { high: 0, low: 1 };
    return (agents || []).slice().sort(function (a, b) {
      var ca = a.confidence === 'high' ? 0 : 1;
      var cb = b.confidence === 'high' ? 0 : 1;
      if (ca !== cb) return ca - cb;
      if (!!b.running - !!a.running) return (b.running ? 1 : 0) - (a.running ? 1 : 0);
      return KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind);
    });
  }

  function findMappingForKind(kind) {
    var appId = meta(kind).appId;
    var H = global.OneToneHabitHub;
    if (H && H.findAppScenarioByAppId) {
      var m = H.findAppScenarioByAppId(appId);
      if (m) return m;
    }
    var st = global.OneToneState && global.OneToneState.state;
    var maps = (st && st.config && st.config.mappings) || [];
    for (var i = 0; i < maps.length; i++) {
      if (String(maps[i].appTargetId || '') === appId) return maps[i];
    }
    return null;
  }

  /**
   * Prepare Soft Pad for kinds without changing activeSceneId / selectedMappingId.
   * @param {string[]} kinds
   * @param {{ enableNumpad?: boolean }} opts
   */
  function prepareKinds(kinds, opts) {
    opts = opts || {};
    var enableNumpad = !!opts.enableNumpad;
    kinds = (kinds || []).map(function (k) {
      k = String(k || '').trim();
      if (!k) return '';
      if (KIND_META[k]) return k;
      var low = k.toLowerCase();
      if (low === 'traecode') return 'traeCode';
      return low;
    }).filter(function (k) {
      return !!KIND_META[k];
    });
    if (!kinds.length) return Promise.reject(new Error('no_kinds'));

    var st = global.OneToneState && global.OneToneState.state;
    var prevSelected = st && st.selectedMappingId;
    var prevActiveScene = st && st.config && st.config.activeSceneId;

    var Hub = global.OneToneSoftPadHub;
    if (!Hub || !Hub.ensureAppSoftPad) {
      return Promise.reject(new Error('hub_unavailable'));
    }

    var results = [];
    kinds.forEach(function (kind) {
      var appId = meta(kind).appId;
      var existing = findMappingForKind(kind);
      var wasEnabled = !!(existing && existing.codexMicroPad && existing.codexMicroPad.enabled);

      // Never silently turn Soft Pad numpad on for existing off pads; new pads stay off unless enableNumpad.
      var m = Hub.ensureAppSoftPad(appId, kind, { enable: false });
      if (!m) {
        results.push({ kind: kind, ok: false, error: 'ensure_failed' });
        return;
      }
      var pad = m.codexMicroPad;
      if (!pad) {
        results.push({ kind: kind, ok: false, error: 'no_pad', mappingId: m.id });
        return;
      }

      pad.overlayEnabled = true;
      pad.presentation = 'mini';
      pad.requireForeground = pad.requireForeground !== false;

      if (enableNumpad) {
        pad.enabled = true;
      } else if (!wasEnabled) {
        pad.enabled = false;
      }
      // If wasEnabled, leave enabled as-is (do not force off either).

      results.push({
        kind: kind,
        ok: true,
        mappingId: m.id,
        prepared: true,
        lightPending: true,
        wasEnabled: wasEnabled
      });
    });

    var persist = global.OneToneConfigPersist;
    var saveP = persist && persist.saveAsync
      ? persist.saveAsync()
      : Promise.resolve();

    return saveP.then(function () {
      // Restore selection / scene — do not steal user's active habit.
      if (st) {
        if (prevSelected) st.selectedMappingId = prevSelected;
        if (st.config && prevActiveScene != null) st.config.activeSceneId = prevActiveScene;
      }

      var chain = Promise.resolve();
      results.forEach(function (row) {
        if (!row.ok || !row.mappingId) return;
        chain = chain.then(function () {
          var flags = {
            mappingId: row.mappingId,
            enabled: !!(findMappingForKind(row.kind) && findMappingForKind(row.kind).codexMicroPad && findMappingForKind(row.kind).codexMicroPad.enabled),
            overlayEnabled: true
          };
          var m2 = findMappingForKind(row.kind);
          if (m2 && m2.codexMicroPad) {
            flags.enabled = !!m2.codexMicroPad.enabled;
            flags.requireNumLockOff = !!m2.codexMicroPad.requireNumLockOff;
            flags.navKeysEnabled = m2.codexMicroPad.showNavigationPad !== false && m2.codexMicroPad.navKeysEnabled !== false;
          }
          return invoke('cmd_codex_micro_pad_set_flags', flags).catch(function () {});
        }).then(function () {
          return invoke('cmd_codex_micro_pad_set_presentation', {
            mappingId: row.mappingId,
            presentation: 'mini'
          }).catch(function () {});
        }).then(function () {
          return invoke('cmd_soft_pad_agent_lights_batch_set', {
            mappingId: row.mappingId,
            agents: [{ agent: row.kind, enabled: true }]
          }).then(function () {
            row.lightEnabled = true;
            row.lightPending = false;
          }).catch(function (err) {
            row.lightError = String(err && err.message || err || 'lights_failed');
          });
        });
      });
      return chain.then(function () {
        return { ok: true, results: results };
      });
    });
  }

  function connectKind(kind) {
    kind = String(kind || '').toLowerCase();
    // Trae Work (trae) is SOLO / local activity — Hook install only for Trae Code.
    if (kind === 'qoder' || kind === 'traecode' || kind === 'workbuddy' ||
        kind === 'gemini' || kind === 'copilotcli' || kind === 'cline' ||
        kind === 'roo' || kind === 'opencode' || kind === 'aider') {
      var shellKind = kind === 'traecode' ? 'traeCode'
        : (kind === 'copilotcli' ? 'copilotCli' : kind);
      return invoke('cmd_shell_agent_hook_install_confirm', { kind: shellKind });
    }
    if (kind === 'claude') {
      return invoke('cmd_claude_hook_install_confirm');
    }
    if (kind === 'codex') {
      return invoke('cmd_codex_hook_install_confirm');
    }
    // Cursor: copy-only — return phase for UI.
    if (kind === 'cursor') {
      return Promise.resolve({ ok: false, manual: true, kind: kind });
    }
    return Promise.resolve({ ok: false, manual: true, kind: kind });
  }

  /**
   * After Soft Pad prepare: confirm once, then one-click connect selected hook agents.
   * Skips solo/quota/cursor-manual (cursor stays manual).
   */
  function connectSelectedKinds(kinds, opts) {
    opts = opts || {};
    kinds = (kinds || []).map(function (k) {
      k = String(k || '').trim();
      if (k.toLowerCase() === 'traecode') return 'traeCode';
      if (k.toLowerCase() === 'copilotcli') return 'copilotCli';
      return k;
    }).filter(Boolean);
    var Conn = global.OneToneSoftPadConnect;
    var installable = kinds.filter(function (k) {
      var low = String(k).toLowerCase();
      if (low === 'cursor' || low === 'minimax' || low === 'trae' || low === 'windsurf') return false;
      if (Conn && Conn.supportsHookInstall) return Conn.supportsHookInstall(k);
      return low === 'claude' || low === 'codex' || low === 'workbuddy' || low === 'traecode' ||
        low === 'qoder';
    });
    if (!installable.length) {
      return Promise.resolve({ ok: true, results: [], skipped: kinds.slice() });
    }
    if (!opts.skipConfirm) {
      var ok = true;
      try {
        ok = global.confirm(
          t('qsAiConnectConfirm', '为已选工具写入 OneTone 状态 hooks（会先备份，可稍后撤回）。继续？')
        );
      } catch (_) {}
      if (!ok) return Promise.resolve({ ok: false, cancelled: true, results: [] });
    }
    var results = [];
    var chain = Promise.resolve();
    installable.forEach(function (kind) {
      chain = chain.then(function () {
        return connectKind(kind).then(function (res) {
          results.push({ kind: kind, ok: !(res && res.ok === false), res: res });
        }).catch(function (err) {
          results.push({ kind: kind, ok: false, error: String(err && err.message || err || '') });
        });
      });
    });
    return chain.then(function () {
      return { ok: true, results: results };
    });
  }

  function connectStatus(kind) {
    kind = String(kind || '').toLowerCase();
    if (kind === 'qoder' || kind === 'traecode' || kind === 'workbuddy') {
      return invoke('cmd_shell_agent_hook_setup_status', {
        kind: kind === 'traecode' ? 'traeCode' : kind
      });
    }
    if (kind === 'claude') {
      return invoke('cmd_claude_hook_setup_status');
    }
    if (kind === 'cursor') {
      return invoke('cmd_cursor_hook_setup_status');
    }
    if (kind === 'codex') {
      return invoke('cmd_codex_hook_setup_status');
    }
    return Promise.resolve({ phase: 'unknown' });
  }

  function phaseConnected(st) {
    var phase = String((st && (st.phase || st.installPhase || st.install_phase)) || '').toLowerCase();
    return phase === 'connected' || phase === 'ok' || phase === 'ready';
  }

  function logSeed(line) {
    try { console.warn(line); } catch (_) {}
    try {
      invoke('cmd_app_log', { line: String(line || '') }).catch(function () {});
    } catch (_) {}
  }

  /** High-confidence / running / desktop MiniMax — same bar as prepareHigh selection. */
  function isMinimaxDetected(row) {
    if (!row || String(row.kind || '').toLowerCase() !== 'minimax') return false;
    if (row.running) return true;
    if (String(row.confidence || '') === 'high') return true;
    var presence = String(row.presence || '');
    return presence === 'desktop' || presence === 'cli' || presence === 'package';
  }

  /**
   * Seed minimax-chat mapping when MiniMax Code is detected.
   * Pad stays off (enabled:false); skip if mapping already exists. Failures are silent + log.
   */
  function seedMinimaxMappingIfDetected(inventory) {
    try {
      var agents = (inventory && inventory.agents) || [];
      var row = null;
      for (var i = 0; i < agents.length; i++) {
        if (isMinimaxDetected(agents[i])) {
          row = agents[i];
          break;
        }
      }
      if (!row) {
        return Promise.resolve({ ok: true, seeded: false, reason: 'not_detected' });
      }
      if (findMappingForKind('minimax')) {
        return Promise.resolve({ ok: true, seeded: false, reason: 'exists' });
      }

      var Hub = global.OneToneSoftPadHub;
      if (!Hub || !Hub.ensureAppSoftPad) {
        logSeed('[agent-install] minimax seed skipped: hub_unavailable');
        return Promise.resolve({ ok: false, seeded: false, reason: 'hub_unavailable' });
      }

      var st = global.OneToneState && global.OneToneState.state;
      var prevSelected = st && st.selectedMappingId;
      var prevActiveScene = st && st.config && st.config.activeSceneId;

      var m = Hub.ensureAppSoftPad('minimax-chat', 'minimax', { enable: false });
      if (!m) {
        logSeed('[agent-install] minimax seed failed: ensure_failed');
        return Promise.resolve({ ok: false, seeded: false, reason: 'ensure_failed' });
      }
      if (!m.codexMicroPad) {
        var Pad = global.OneToneCodexMicroPadUi;
        if (Pad && Pad.ensurePad) Pad.ensurePad(m, { persist: false });
      }
      if (m.codexMicroPad) {
        m.codexMicroPad.enabled = false;
        if (m.codexMicroPad.overlayEnabled == null) m.codexMicroPad.overlayEnabled = true;
        if (!m.codexMicroPad.presentation) m.codexMicroPad.presentation = 'mini';
      }

      var persist = global.OneToneConfigPersist;
      var saveP = persist && persist.saveAsync
        ? persist.saveAsync()
        : Promise.resolve();

      return saveP.then(function () {
        if (st) {
          if (prevSelected) st.selectedMappingId = prevSelected;
          if (st.config && prevActiveScene != null) st.config.activeSceneId = prevActiveScene;
        }
        return { ok: true, seeded: true, mappingId: m.id, reason: 'seeded' };
      }).catch(function (err) {
        logSeed('[agent-install] minimax seed persist failed: ' + String(err && err.message || err || ''));
        return { ok: false, seeded: false, reason: 'persist_failed' };
      });
    } catch (err) {
      logSeed('[agent-install] minimax seed error: ' + String(err && err.message || err || ''));
      return Promise.resolve({ ok: false, seeded: false, reason: 'exception' });
    }
  }

  /** Boot / Hub: fetch inventory then seed MiniMax when detected. Never throws. */
  function autoSeedDetectedAgents() {
    return fetchInventory().then(function (inv) {
      return seedMinimaxMappingIfDetected(inv).then(function (res) {
        return { inventory: inv, minimax: res };
      });
    }).catch(function (err) {
      logSeed('[agent-install] autoSeedDetectedAgents failed: ' + String(err && err.message || err || ''));
      return { inventory: null, minimax: { ok: false, seeded: false, reason: 'fetch_failed' } };
    });
  }

  /** Lazy seed — never on boot-settled (sync inventory EnumWindows 假死's UI). */
  function scheduleBootAutoSeed() {
    if (scheduleBootAutoSeed._scheduled) return;
    scheduleBootAutoSeed._scheduled = true;
    // Intentionally no-op at script load. Call autoSeedDetectedAgents from Soft Pad
    // first open / scan (see soft-pad-hub refreshHubInventory prepareHigh).
  }

  /** Soft Pad Hub / scan: seed MiniMax if detected. Idle-deferred; no sync Hub.render. */
  function maybeAutoSeedAfterInventory(inv) {
    try {
      return seedMinimaxMappingIfDetected(inv || null).then(function (res) {
        return res;
      });
    } catch (err) {
      logSeed('[agent-install] maybeAutoSeedAfterInventory: ' + String(err && err.message || err || ''));
      return Promise.resolve({ ok: false, seeded: false, reason: 'exception' });
    }
  }

  global.OneToneAgentInstall = {
    KINDS: KINDS,
    KIND_META: KIND_META,
    meta: meta,
    fetchInventory: fetchInventory,
    emptyInventory: emptyInventory,
    defaultSelectedKinds: defaultSelectedKinds,
    evidenceLabel: evidenceLabel,
    sortAgentsForUi: sortAgentsForUi,
    prepareKinds: prepareKinds,
    seedMinimaxMappingIfDetected: seedMinimaxMappingIfDetected,
    autoSeedDetectedAgents: autoSeedDetectedAgents,
    maybeAutoSeedAfterInventory: maybeAutoSeedAfterInventory,
    isMinimaxDetected: isMinimaxDetected,
    connectKind: connectKind,
    connectSelectedKinds: connectSelectedKinds,
    connectStatus: connectStatus,
    phaseConnected: phaseConnected,
    findMappingForKind: findMappingForKind
  };
})(typeof window !== 'undefined' ? window : globalThis);
