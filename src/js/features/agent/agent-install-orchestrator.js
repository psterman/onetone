/**
 * Shared Soft Pad install orchestrator — Quick Start + Soft Pad Hub.
 * Prepare Soft Pad mappings, status lights, mini overlay; Hook connect is separate.
 */
(function (global) {
  'use strict';

  var KINDS = ['codex', 'claude', 'cursor', 'workbuddy', 'trae', 'qoder'];

  var KIND_META = {
    codex: { appId: 'codex-chat', label: 'Codex', icon: 'icons/app-target/codex.png' },
    claude: { appId: 'claude-code', label: 'Claude', icon: 'icons/app-target/claude.png' },
    cursor: { appId: 'cursor-chat', label: 'Cursor', icon: 'icons/app-target/cursor.png' },
    workbuddy: { appId: 'workbuddy-chat', label: 'WorkBuddy', icon: 'icons/app-target/workbuddy.png' },
    trae: { appId: 'trae-chat', label: 'Trae', icon: 'icons/app-target/trae.png' },
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
      // Capability / offline: still show six tools for manual pick.
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
    kinds = (kinds || []).map(function (k) { return String(k || '').toLowerCase(); }).filter(function (k) {
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
    if (kind === 'qoder' || kind === 'trae' || kind === 'workbuddy') {
      return invoke('cmd_shell_agent_hook_install_confirm', { kind: kind });
    }
    if (kind === 'claude') {
      return invoke('cmd_claude_hook_install_confirm');
    }
    // Codex / Cursor: copy-only — return phase for UI.
    return Promise.resolve({ ok: false, manual: true, kind: kind });
  }

  function connectStatus(kind) {
    kind = String(kind || '').toLowerCase();
    if (kind === 'qoder' || kind === 'trae' || kind === 'workbuddy') {
      return invoke('cmd_shell_agent_hook_setup_status', { kind: kind });
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
    connectKind: connectKind,
    connectStatus: connectStatus,
    phaseConnected: phaseConnected,
    findMappingForKind: findMappingForKind
  };
})(typeof window !== 'undefined' ? window : globalThis);
