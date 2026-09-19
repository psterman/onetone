/**
 * Parent → Agent iframe: paint Soft Pad / mini bar with the same renderer as 虚拟键盘.
 */
(function (root) {
  'use strict';

  var FRAME_ID = 'agentProtoFrame';
  var MSG_TYPE = 'ot-agent-preview';
  var CMD_TYPE = 'ot-agent-preview-cmd';
  var pollTimer = 0;
  var frameBound = false;
  var lastSkin = '';
  var lastMiniRail = 'agents';
  var lastMiniChrome = null;
  var lastLeft = {
    kind: 'pad',
    showMode: 'follow',
    purposeTab: 'occupy',
    purposeOccupy: true,
    purposeNav: false,
    purposeMapping: true
  };

  var MINI_LEAF_TO_RAIL = {
    busy: 'agents',
    agents: 'agents',
    speech: 'speech',
    voice: 'speech',
    text: 'speech',
    tools: 'tools',
    form: 'display',
    display: 'display'
  };

  function frameEl() {
    if (typeof document === 'undefined') return null;
    return document.getElementById(FRAME_ID);
  }

  function post(payload) {
    var frame = frameEl();
    if (!frame || !frame.contentWindow) return;
    try {
      frame.contentWindow.postMessage(
        { type: MSG_TYPE, payload: payload },
        '*'
      );
    } catch (_) {}
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

  function normalizeMiniRail(raw) {
    var key = String(raw || '').trim();
    var mapped = MINI_LEAF_TO_RAIL[key] || key;
    if (['agents', 'speech', 'tools', 'display'].indexOf(mapped) < 0) return 'agents';
    return mapped;
  }

  function applyLeftOpts(opts) {
    if (opts.leftKind != null) lastLeft.kind = String(opts.leftKind);
    if (opts.showMode != null) lastLeft.showMode = String(opts.showMode);
    if (opts.purposeTab != null) lastLeft.purposeTab = String(opts.purposeTab);
    if (opts.purposeOccupy != null) lastLeft.purposeOccupy = !!opts.purposeOccupy;
    if (opts.purposeNav != null) lastLeft.purposeNav = !!opts.purposeNav;
    if (opts.purposeMapping != null) lastLeft.purposeMapping = !!opts.purposeMapping;
  }

  function buildPayload(opts) {
    opts = opts || {};
    var Pad = root.OneToneCodexMicroPadUi;
    var m = resolveMapping();
    if (!Pad || !m) {
      return {
        empty: true,
        reason: 'no_soft_pad',
        message: '先在 Soft Pad 创建/打开应用场景，左侧才会显示真实键盘与迷你栏。'
      };
    }
    try {
      if (Pad.ensurePad) Pad.ensurePad(m, { persist: false });
    } catch (_) {}
    var pad = m.codexMicroPad || {};
    var prevSkin = pad.skin;
    if (opts.skin) lastSkin = String(opts.skin);
    if (lastSkin) {
      pad.skin = Pad.canonicalizePadSkin
        ? Pad.canonicalizePadSkin(lastSkin)
        : lastSkin;
    }
    if (opts.miniRail != null) lastMiniRail = normalizeMiniRail(opts.miniRail);
    if (opts.miniChrome && typeof opts.miniChrome === 'object') {
      lastMiniChrome = Object.assign({}, lastMiniChrome || {}, opts.miniChrome);
    }
    if (opts.clearMiniChrome) lastMiniChrome = null;
    applyLeftOpts(opts);
    var skin = String(pad.skin || 'default');
    var padHtml = '';
    var miniHtml = '';
    var leftKind = lastLeft.kind || 'pad';
    try {
      if (
        Pad.renderAgentSettingsLeftPreview &&
        (leftKind === 'show' || leftKind === 'skin' || leftKind === 'purpose')
      ) {
        padHtml = Pad.renderAgentSettingsLeftPreview(m, pad, {
          kind: leftKind,
          showMode: lastLeft.showMode,
          purposeTab: lastLeft.purposeTab,
          purposeOccupy: lastLeft.purposeOccupy,
          purposeNav: lastLeft.purposeNav,
          purposeMapping: lastLeft.purposeMapping
        });
      } else {
        padHtml =
          '<div class="codex-micro-pad soft-pad-preview" data-pad-skin="' +
          skin.replace(/"/g, '') +
          '">' +
          Pad.renderHardwarePad(m, pad, { mode: 'softPad' }) +
          '</div>';
      }
    } catch (err) {
      try {
        console.error('agent preview pad', err);
      } catch (_) {}
    } finally {
      pad.skin = prevSkin;
    }
    try {
      if (Pad.renderAgentMiniBarPreview) {
        miniHtml = Pad.renderAgentMiniBarPreview(pad, {
          focusAgent: '',
          stripMode: 'focus',
          rail: lastMiniRail,
          chrome: lastMiniChrome || undefined
        });
      }
    } catch (err2) {
      try {
        console.error('agent preview mini', err2);
      } catch (_) {}
    }
    var title = '';
    try {
      title = String(
        (m.displayLabel || m.name || m.appTargetId || 'Soft Pad')
      ).trim();
    } catch (_) {}
    return {
      empty: false,
      title: title || 'Soft Pad',
      skin: skin,
      ambient: pad.ambientEnabled !== false,
      miniRail: lastMiniRail,
      leftKind: leftKind,
      showMode: lastLeft.showMode,
      padHtml: padHtml,
      miniHtml: miniHtml
    };
  }

  function refresh(opts) {
    post(buildPayload(opts || {}));
  }

  function bindFrameLoad() {
    if (frameBound) return;
    var frame = frameEl();
    if (!frame) return;
    frameBound = true;
    frame.addEventListener('load', function () {
      refresh();
    });
  }

  function onFrameCommand(ev) {
    var data = ev && ev.data;
    if (!data || data.type !== CMD_TYPE) return;
    var frame = frameEl();
    if (frame && ev.source && frame.contentWindow && ev.source !== frame.contentWindow) {
      return;
    }
    if (data.cmd === 'setSkin') {
      refresh({ skin: data.skin, leftKind: data.leftKind || 'skin' });
      return;
    }
    if (data.cmd === 'setMiniPreview') {
      refresh({
        miniRail: data.miniRail != null ? data.miniRail : data.rail,
        miniChrome: data.miniChrome || data.chrome
      });
      return;
    }
    if (data.cmd === 'setLeftPreview') {
      refresh({
        leftKind: data.leftKind,
        showMode: data.showMode,
        purposeTab: data.purposeTab,
        purposeOccupy: data.purposeOccupy,
        purposeNav: data.purposeNav,
        purposeMapping: data.purposeMapping,
        skin: data.skin
      });
      return;
    }
    if (data.cmd === 'refresh') {
      refresh();
    }
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  function start() {
    bindFrameLoad();
    if (typeof window !== 'undefined' && !window.__otAgentPreviewCmdBound) {
      window.__otAgentPreviewCmdBound = true;
      window.addEventListener('message', onFrameCommand);
    }
    stop();
    refresh();
    pollTimer = setInterval(function () {
      refresh();
    }, 8000);
  }

  root.OneToneAgentPagePreviewBridge = {
    MSG_TYPE: MSG_TYPE,
    refresh: refresh,
    start: start,
    stop: stop,
    buildPayload: buildPayload,
    normalizeMiniRail: normalizeMiniRail
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
