/**
 * Parent ↔ Agent iframe: Soft Pad 管理（顶栏 / 灯效 / 接入）↔ Soft Pad IPC.
 * Preview stays on ot-agent-preview; this bridge owns settings reads/writes.
 */
(function (root) {
  'use strict';

  var FRAME_ID = 'agentProtoFrame';
  var MSG_TYPE = 'ot-agent-settings';
  var CMD_TYPE = 'ot-agent-settings-cmd';
  var POLL_MS = 20000;

  var APP_TO_KIND = {
    Cursor: 'cursor',
    Claude: 'claude',
    Codex: 'codex',
    MiniMax: 'minimax'
  };

  /** Soft Pad topbar / 接入 roster — keep in sync with TOPBAR_LIGHT_CANDIDATES. */
  var TOPBAR_CORE = [
    { agent: 'codex', label: 'Codex' },
    { agent: 'claude', label: 'Claude' },
    { agent: 'cursor', label: 'Cursor' },
    { agent: 'copilotCli', label: 'Copilot' },
    { agent: 'copilotVscode', label: 'Copilot VS Code' },
    { agent: 'gemini', label: 'Gemini' },
    { agent: 'minimax', label: 'MiniMax' },
    { agent: 'workbuddy', label: 'WorkBuddy' },
    { agent: 'trae', label: 'Trae Work' },
    { agent: 'traeCode', label: 'Trae Code' },
    { agent: 'windsurf', label: 'Windsurf' },
    { agent: 'qoder', label: 'Qoder' },
    { agent: 'cline', label: 'Cline' },
    { agent: 'roo', label: 'Roo' },
    { agent: 'opencode', label: 'OpenCode' },
    { agent: 'aider', label: 'Aider' }
  ];

  var pollTimer = 0;
  var inFlight = false;
  var frameBound = false;
  var lastPayload = null;
  var selectedKind = 'cursor';
  var selectedApp = 'Cursor';

  function frameEl() {
    if (typeof document === 'undefined') return null;
    return document.getElementById(FRAME_ID);
  }

  function invoke(cmd, args) {
    var ipc = root.OneToneIpc;
    var fn =
      (root.__vp_invoke__ && typeof root.__vp_invoke__ === 'function'
        ? root.__vp_invoke__
        : null) ||
      (ipc && typeof ipc.invoke === 'function' ? ipc.invoke.bind(ipc) : null);
    if (!fn) return Promise.reject(new Error('no_ipc'));
    return Promise.resolve(fn(cmd, args || {}));
  }

  function resolveMapping() {
    try {
      var Hub = root.OneToneSoftPadHub;
      if (Hub && Hub.resolveSoftPadEntry) {
        var entry = Hub.resolveSoftPadEntry();
        if (entry && entry.mapping) return entry.mapping;
      }
    } catch (_) {}
    try {
      var Cap = root.OneToneAgentCapabilityUi;
      if (Cap && Cap.activeCodexMapping) return Cap.activeCodexMapping();
    } catch (_) {}
    return null;
  }

  function kindFromApp(app) {
    var name = String(app || '').trim();
    if (APP_TO_KIND[name]) return APP_TO_KIND[name];
    var low = name.toLowerCase();
    if (low === 'cursor' || low === 'claude' || low === 'codex' || low === 'minimax') {
      return low;
    }
    return 'cursor';
  }

  function appFromKind(kind) {
    var k = String(kind || '').toLowerCase();
    if (k === 'claude') return 'Claude';
    if (k === 'codex') return 'Codex';
    if (k === 'minimax') return 'MiniMax';
    return 'Cursor';
  }

  function agentLightEnabled(pad, agent) {
    pad = pad || {};
    agent = String(agent || '');
    var low = agent.toLowerCase();
    if (low === 'claude') return !!pad.claudeStatusLightsEnabled;
    if (low === 'cursor') return !!pad.cursorStatusLightsEnabled;
    if (low === 'copilotcli') return !!pad.copilotStatusLightsEnabled;
    if (low === 'copilotvscode') return !!pad.copilotVscodeStatusLightsEnabled;
    if (low === 'gemini') return !!pad.geminiStatusLightsEnabled;
    if (low === 'minimax') return !!pad.minimaxStatusLightsEnabled;
    if (low === 'workbuddy') return !!pad.workbuddyStatusLightsEnabled;
    if (low === 'trae') return !!pad.traeStatusLightsEnabled;
    if (low === 'traecode') return !!pad.traeCodeStatusLightsEnabled;
    if (low === 'windsurf') return !!pad.windsurfStatusLightsEnabled;
    if (low === 'qoder') return !!pad.qoderStatusLightsEnabled;
    if (low === 'cline') return !!pad.clineStatusLightsEnabled;
    if (low === 'roo') return !!pad.rooStatusLightsEnabled;
    if (low === 'opencode') return !!pad.opencodeStatusLightsEnabled;
    if (low === 'aider') return !!pad.aiderStatusLightsEnabled;
    return !!pad.codexStatusLightsEnabled;
  }

  function setAgentLightLocal(pad, agent, enabled) {
    if (!pad) return;
    agent = String(agent || '');
    var low = agent.toLowerCase();
    var on = !!enabled;
    if (low === 'claude') pad.claudeStatusLightsEnabled = on;
    else if (low === 'cursor') pad.cursorStatusLightsEnabled = on;
    else if (low === 'copilotcli') pad.copilotStatusLightsEnabled = on;
    else if (low === 'copilotvscode') pad.copilotVscodeStatusLightsEnabled = on;
    else if (low === 'gemini') pad.geminiStatusLightsEnabled = on;
    else if (low === 'minimax') pad.minimaxStatusLightsEnabled = on;
    else if (low === 'workbuddy') pad.workbuddyStatusLightsEnabled = on;
    else if (low === 'trae') pad.traeStatusLightsEnabled = on;
    else if (low === 'traecode') pad.traeCodeStatusLightsEnabled = on;
    else if (low === 'windsurf') pad.windsurfStatusLightsEnabled = on;
    else if (low === 'qoder') pad.qoderStatusLightsEnabled = on;
    else if (low === 'cline') pad.clineStatusLightsEnabled = on;
    else if (low === 'roo') pad.rooStatusLightsEnabled = on;
    else if (low === 'opencode') pad.opencodeStatusLightsEnabled = on;
    else if (low === 'aider') pad.aiderStatusLightsEnabled = on;
    else pad.codexStatusLightsEnabled = on;
  }

  function persistPad() {
    var p = root.OneToneConfigPersist;
    if (p && p.saveAsync) return p.saveAsync();
    if (p && p.save) p.save();
    return Promise.resolve();
  }

  /** Pure: job banner line from connect phase. */
  function connectJobLead(phase, agentName) {
    var a = String(agentName || 'Agent');
    if (phase === 'connected') {
      return '已接通：灯和迷你栏可跟忙闲；今日摘要在顶栏，完整盘去「数据」。';
    }
    if (phase === 'waiting') {
      return '已写入配置，等待第一条事件。回 ' + a + ' 发一条消息即可点亮。';
    }
    if (phase === 'error') {
      return '配置异常：请刷新或重新接入。灯和迷你栏暂无忙闲/额度。';
    }
    if (phase === 'solo') {
      return '本地监视，无需 Hook。灯效跟本机活动走。';
    }
    if (phase === 'quota') {
      return '额度灯：在读数来源填 Key 后才有用量。';
    }
    return '没接上，灯和迷你栏没有忙闲/额度。今日摘要在顶栏；完整盘去「数据」。';
  }

  function badgeClassForPhase(phase) {
    if (phase === 'connected' || phase === 'solo') return 'ok';
    if (phase === 'waiting') return 'warn';
    if (phase === 'error') return 'warn';
    return 'warn';
  }

  /**
   * Build snapshot for iframe (no secrets).
   * @param {{ kind?: string, app?: string, pad?: object, status?: object|null, attn?: object, cursorActivity?: boolean, keySet?: boolean }} opts
   */
  function projectSettingsSnapshot(opts) {
    opts = opts || {};
    var Conn = root.OneToneSoftPadConnect;
    var kind = String(opts.kind || selectedKind || 'cursor');
    if (Conn && Conn.normKind) kind = Conn.normKind(kind);
    var app = opts.app || appFromKind(kind);
    var pad = opts.pad || {};
    var status = opts.status || null;
    var attn = opts.attn || {};
    var phase = 'not_configured';
    var phaseLabel = '未接入';
    var path = '';
    var primary = null;
    if (Conn && Conn.phaseOf) {
      phase = Conn.phaseOf(kind, status, attn) || 'not_configured';
      phaseLabel = Conn.phaseLabel ? Conn.phaseLabel(phase) : phase;
      path = Conn.pathFromStatus ? Conn.pathFromStatus(status) : '';
      primary = Conn.primaryAction ? Conn.primaryAction(kind, phase) : null;
    } else if (status && (status.panelPhase === 'connected' || status.panel_phase === 'connected')) {
      phase = 'connected';
      phaseLabel = '已接入';
    }
    var ambientMode = String(pad.ambientMode || 'status') === 'solid' ? 'solid' : 'status';
    var opacity = Number(pad.ambientOpacity);
    if (!isFinite(opacity)) opacity = 100;
    opacity = Math.max(0, Math.min(100, Math.round(opacity)));
    var statusByKind = opts.statusByKind || {};
    return {
      agentKind: kind,
      agentName: app,
      padEnabled: pad.enabled !== false,
      ambient: {
        enabled: pad.ambientEnabled !== false,
        mode: ambientMode,
        solidRgb: String(pad.ambientSolidRgb || '#7c3aed'),
        opacity: opacity
      },
      screenOpacity: (function () {
        var so = Number(pad.screenOpacity);
        if (so > 0 && so <= 1) so = Math.round(so * 100);
        if (!(so >= 40) || so > 100) so = 82;
        return Math.max(40, Math.min(100, Math.round(so)));
      })(),
      keyLights: {
        enabled: agentLightEnabled(pad, kind),
        scheme: (function () {
          var tpl = String(pad.lightTemplate || '');
          if (tpl === 'multi') return 'multi';
          if (tpl === 'single') return 'single';
          return undefined;
        })(),
        preset: (function () {
          var p = String(pad.keyLightPreset || 'default');
          if (p === 'high_contrast') p = 'highContrast';
          if (p === 'cool' || p === 'warm' || p === 'highContrast') return p;
          return 'default';
        })()
      },
      topbar: {
        agents: TOPBAR_CORE.map(function (c) {
          var st = statusByKind[c.agent] || null;
          var p = 'not_configured';
          var pl = '未接入';
          var prim = null;
          var pth = '';
          if (Conn && Conn.phaseOf) {
            p = Conn.phaseOf(c.agent, st, {}) || 'not_configured';
            pl = Conn.phaseLabel ? Conn.phaseLabel(p) : p;
            prim = Conn.primaryAction ? Conn.primaryAction(c.agent, p) : null;
            pth = Conn.pathFromStatus ? Conn.pathFromStatus(st) : '';
          }
          return {
            agent: c.agent,
            label: c.label,
            enabled: agentLightEnabled(pad, c.agent),
            phase: p,
            phaseLabel: pl,
            badgeClass: badgeClassForPhase(p),
            primaryAction: prim,
            path: pth || '',
            jobLead: connectJobLead(p, c.label)
          };
        })
      },
      connect: {
        phase: phase,
        phaseLabel: phaseLabel,
        badgeClass: badgeClassForPhase(phase),
        jobLead: connectJobLead(phase, app),
        path: path || '',
        primaryAction: primary,
        isFg: !!opts.isFg
      },
      read: {
        cursorActivityEnabled: !!opts.cursorActivity,
        cursorActivityApplicable: String(kind).toLowerCase() === 'cursor',
        keySet: !!opts.keySet,
        keyApplicable: String(kind).toLowerCase() === 'minimax'
      }
    };
  }

  function postPayload(payload) {
    lastPayload = payload;
    var frame = frameEl();
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage({ type: MSG_TYPE, payload: payload }, '*');
    } catch (_) {}
  }

  function fetchCursorActivity() {
    return invoke('cmd_cursor_activity_pref_get', {})
      .then(function (res) {
        return !!(res && (res.enabled === true || res.enabled === 1));
      })
      .catch(function () {
        return false;
      });
  }

  function fetchKeyConfigured(kind) {
    if (String(kind).toLowerCase() !== 'minimax') return Promise.resolve(false);
    return invoke('cmd_soft_pad_provider_key_get', { provider: 'minimax' })
      .then(function (res) {
        return !!(res && res.configured);
      })
      .catch(function () {
        return false;
      });
  }

  function refresh(opts) {
    opts = opts || {};
    if (opts.app) {
      selectedApp = String(opts.app);
      selectedKind = kindFromApp(opts.app);
    } else if (opts.kind) {
      selectedKind = String(opts.kind);
      selectedApp = appFromKind(selectedKind);
    }
    if (inFlight) return Promise.resolve(lastPayload);
    inFlight = true;
    var m = resolveMapping();
    var pad = (m && m.codexMicroPad) || {};
    var Conn = root.OneToneSoftPadConnect;
    var kind = selectedKind;
    var statusByKind = {};
    var rosterP = Promise.all(
      TOPBAR_CORE.map(function (c) {
        if (!(Conn && Conn.fetchStatus)) {
          return Promise.resolve({ agent: c.agent, status: null });
        }
        return Conn.fetchStatus(c.agent)
          .then(function (st) {
            return { agent: c.agent, status: st };
          })
          .catch(function () {
            return { agent: c.agent, status: null };
          });
      })
    ).then(function (rows) {
      rows.forEach(function (row) {
        statusByKind[row.agent] = row.status;
      });
      return statusByKind;
    });
    return Promise.all([rosterP, fetchCursorActivity(), fetchKeyConfigured(kind)])
      .then(function (parts) {
        var byKind = parts[0] || {};
        var payload = projectSettingsSnapshot({
          kind: kind,
          app: selectedApp,
          pad: pad,
          status: byKind[kind] || null,
          statusByKind: byKind,
          cursorActivity: parts[1],
          keySet: parts[2]
        });
        postPayload(payload);
        try {
          var Preview = root.OneToneAgentPagePreviewBridge;
          if (Preview && Preview.refresh) Preview.refresh();
        } catch (_) {}
        return payload;
      })
      .catch(function () {
        return lastPayload;
      })
      .then(function (payload) {
        inFlight = false;
        return payload;
      });
  }

  function setPadEnabled(enabled) {
    var m = resolveMapping();
    var pad = m && m.codexMicroPad;
    if (!m || !m.id || !pad) return Promise.resolve(null);
    pad.enabled = !!enabled;
    return invoke('cmd_codex_micro_pad_set_flags', {
      mappingId: String(m.id),
      enabled: !!enabled,
      requireNumLockOff: !!pad.requireNumLockOff,
      overlayEnabled: !!pad.overlayEnabled,
      requireForeground: pad.requireForeground !== false,
      navKeysEnabled: pad.showNavigationPad !== false && pad.navKeysEnabled !== false
    })
      .then(function () {
        return refresh();
      })
      .catch(function () {
        return persistPad().then(function () {
          return refresh();
        });
      });
  }

  function setAmbient(patch) {
    var m = resolveMapping();
    var pad = m && m.codexMicroPad;
    if (!pad) return Promise.resolve(null);
    patch = patch || {};
    if (patch.enabled != null) {
      pad.ambientEnabled = !!patch.enabled;
      if (patch.enabled) pad.lightTemplate = 'bezel';
    }
    if (patch.mode != null) {
      pad.ambientMode = String(patch.mode) === 'solid' ? 'solid' : 'status';
      pad.lightTemplate = 'bezel';
    }
    if (patch.solidRgb != null) {
      pad.ambientSolidRgb = String(patch.solidRgb || '#7c3aed');
      pad.ambientMode = 'solid';
      pad.lightTemplate = 'bezel';
    }
    if (patch.opacity != null) {
      var v = Math.round(Number(patch.opacity));
      if (!isFinite(v)) v = 100;
      pad.ambientOpacity = Math.max(0, Math.min(100, v));
    }
    try {
      var Preview = root.OneToneAgentPagePreviewBridge;
      if (Preview && Preview.refresh) Preview.refresh();
    } catch (_) {}
    return Promise.resolve(persistPad()).then(function () {
      return refresh();
    });
  }

  function setScreenOpacity(pct) {
    var m = resolveMapping();
    var pad = m && m.codexMicroPad;
    if (!pad) return Promise.resolve(null);
    var v = Number(pct);
    if (v > 0 && v <= 1) v = Math.round(v * 100);
    if (!(v >= 40) || v > 100) v = 82;
    v = Math.max(40, Math.min(100, Math.round(v)));
    pad.screenOpacity = v;
    try {
      var host = typeof document !== 'undefined'
        ? document.getElementById('softPadPreviewHost')
        : null;
      if (host && host.style) {
        host.style.setProperty('--micro-hw-screen-opacity', String(v / 100));
      }
    } catch (_) {}
    try {
      var Preview = root.OneToneAgentPagePreviewBridge;
      if (Preview && Preview.refresh) Preview.refresh();
    } catch (_) {}
    return Promise.resolve(persistPad()).then(function () {
      return refresh();
    });
  }

  function setKeyLightScheme(patch) {
    var m = resolveMapping();
    var pad = m && m.codexMicroPad;
    if (!pad) return Promise.resolve(null);
    patch = patch || {};
    var scheme = String(patch.scheme || '');
    if (scheme === 'multi') pad.lightTemplate = 'multi';
    else if (scheme === 'single') pad.lightTemplate = 'single';
    else if (scheme === 'off') pad.lightTemplate = 'bezel';
    if (patch.preset != null) {
      var p = String(patch.preset || 'default');
      if (p === 'high_contrast') p = 'highContrast';
      if (p !== 'cool' && p !== 'warm' && p !== 'highContrast') p = 'default';
      pad.keyLightPreset = p;
      pad.statusColors = {};
    }
    try {
      var Preview = root.OneToneAgentPagePreviewBridge;
      if (Preview && Preview.refresh) Preview.refresh();
    } catch (_) {}
    return Promise.resolve(persistPad()).then(function () {
      return refresh();
    });
  }

  function setAgentLights(enabled, agentOpt) {
    var m = resolveMapping();
    var pad = m && m.codexMicroPad;
    if (!m || !m.id || !pad) return Promise.resolve(null);
    var agent = String(agentOpt || selectedKind || 'codex').trim() || 'codex';
    setAgentLightLocal(pad, agent, enabled);
    return invoke('cmd_soft_pad_agent_lights_set', {
      mappingId: String(m.id),
      agent: String(agent),
      enabled: !!enabled
    })
      .then(function () {
        return refresh();
      })
      .catch(function () {
        return refresh();
      });
  }

  function refreshConnect() {
    return refresh();
  }

  function copyText(text) {
    text = String(text || '');
    if (!text) return Promise.reject(new Error('empty'));
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve();
    } catch (e) {
      return Promise.reject(e);
    }
  }

  function copyHookConfig(kindOpt) {
    var Conn = root.OneToneSoftPadConnect;
    var kind = String(kindOpt || selectedKind || 'cursor').trim() || selectedKind;
    var p =
      Conn && Conn.fetchStatus
        ? Conn.fetchStatus(kind)
        : Promise.resolve(null);
    return p
      .then(function (st) {
        var text =
          (st && (st.hooksDraftJson || st.hooks_draft_json || st.draftJson)) || '';
        if (!text && st && st.hooksSnippet) text = String(st.hooksSnippet);
        if (!text) throw new Error('no_draft');
        return copyText(text);
      })
      .then(function () {
        return refresh();
      })
      .catch(function () {
        return null;
      });
  }

  function installConnect(kindOpt) {
    var Conn = root.OneToneSoftPadConnect;
    var kind = String(kindOpt || selectedKind || 'cursor').trim() || selectedKind;
    if (!Conn || !Conn.installKind) return refresh();
    return Conn.installKind(kind)
      .then(function () {
        return refresh();
      })
      .catch(function () {
        return refresh();
      });
  }

  function enableCursorActivity(enabled) {
    var on = enabled !== false;
    return invoke('cmd_cursor_activity_pref_set', { enabled: on })
      .then(function () {
        return refresh();
      })
      .catch(function () {
        return null;
      });
  }

  function setProviderKey(key) {
    var provider = 'minimax';
    return invoke('cmd_soft_pad_provider_key_set', {
      provider: provider,
      key: String(key || '')
    })
      .then(function () {
        return refresh();
      })
      .catch(function () {
        return null;
      });
  }

  function selectAgent(appOrKind) {
    var raw = String(appOrKind || '').trim();
    if (APP_TO_KIND[raw]) {
      selectedApp = raw;
      selectedKind = APP_TO_KIND[raw];
    } else {
      selectedKind = kindFromApp(raw);
      selectedApp = appFromKind(selectedKind);
    }
    return refresh({ app: selectedApp, kind: selectedKind });
  }

  function onFrameCommand(ev) {
    var data = ev && ev.data;
    if (!data || data.type !== CMD_TYPE) return;
    var frame = frameEl();
    if (frame && ev.source && frame.contentWindow && ev.source !== frame.contentWindow) {
      return;
    }
    var cmd = data.cmd;
    if (cmd === 'selectAgent') {
      selectAgent(data.app || data.kind);
      return;
    }
    if (cmd === 'setPadEnabled') {
      setPadEnabled(!!data.enabled);
      return;
    }
    if (cmd === 'setAmbient') {
      setAmbient(data.patch || data);
      return;
    }
    if (cmd === 'setScreenOpacity') {
      setScreenOpacity(data.opacity != null ? data.opacity : data.pct);
      return;
    }
    if (cmd === 'setAgentLights' || cmd === 'setKeyLights') {
      setAgentLights(!!data.enabled, data.agent || data.kind);
      return;
    }
    if (cmd === 'setKeyLightScheme') {
      setKeyLightScheme(data.patch || data);
      return;
    }
    if (cmd === 'refreshConnect' || cmd === 'refresh') {
      refreshConnect();
      return;
    }
    if (cmd === 'copyHookConfig') {
      copyHookConfig(data.agent || data.kind);
      return;
    }
    if (cmd === 'installConnect') {
      installConnect(data.agent || data.kind);
      return;
    }
    if (cmd === 'enableCursorActivity') {
      enableCursorActivity(data.enabled !== false);
      return;
    }
    if (cmd === 'setProviderKey') {
      setProviderKey(data.key);
      return;
    }
  }

  function bindFrameLoad() {
    if (frameBound) return;
    var frame = frameEl();
    if (!frame) return;
    frameBound = true;
    frame.addEventListener('load', function () {
      if (lastPayload) postPayload(lastPayload);
      else refresh();
    });
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  function start() {
    bindFrameLoad();
    if (typeof window !== 'undefined' && !window.__otAgentSettingsCmdBound) {
      window.__otAgentSettingsCmdBound = true;
      window.addEventListener('message', onFrameCommand);
    }
    stop();
    refresh();
    pollTimer = setInterval(function () {
      refresh();
    }, POLL_MS);
  }

  var api = {
    MSG_TYPE: MSG_TYPE,
    CMD_TYPE: CMD_TYPE,
    connectJobLead: connectJobLead,
    projectSettingsSnapshot: projectSettingsSnapshot,
    kindFromApp: kindFromApp,
    appFromKind: appFromKind,
    refresh: refresh,
    start: start,
    stop: stop,
    selectAgent: selectAgent,
    getSelectedKind: function () { return selectedKind; },
    setPadEnabled: setPadEnabled,
    setAmbient: setAmbient,
    setScreenOpacity: setScreenOpacity,
    setAgentLights: setAgentLights,
    setKeyLightScheme: setKeyLightScheme,
    copyHookConfig: copyHookConfig,
    enableCursorActivity: enableCursorActivity
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  root.OneToneAgentPageSettingsBridge = api;
})(
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : this
);
