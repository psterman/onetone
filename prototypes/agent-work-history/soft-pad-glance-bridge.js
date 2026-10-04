/**
 * Prototype Soft Pad glance bridge — same wire as agent-page preview.
 * Protocol: parent ↔ ot-agent-preview / ot-agent-preview-cmd
 * Paint target: [data-awh-pad-paint] / [data-soft-pad-preview-paint]
 *
 * Modes:
 * - parent: receive real padHtml from OneToneAgentPagePreviewBridge
 * - local:  OneToneCodexMicroPadUi.renderHardwarePad (+ demo mapping)
 * - empty:  Soft Pad not configured
 * - stub:   renderer missing (open with ?livePad=1 inside repo, or inside app)
 */
(function (global) {
  'use strict';

  var MSG_TYPE = 'ot-agent-preview';
  var CMD_TYPE = 'ot-agent-preview-cmd';
  var bound = false;
  var lastStatus = 'stub';
  var lastTitle = '';
  var pollTimer = 0;

  function demoMapping() {
    return {
      id: 'awh-demo-cursor',
      name: 'Cursor',
      displayLabel: 'Cursor',
      appTargetId: 'cursor-chat',
      enabled: true,
      codexMicroPad: {
        enabled: true,
        overlayEnabled: true,
        skin: 'default',
        presentation: 'full',
        layoutProfile: 'custom',
        purpose: 'shortcuts',
        navKeysEnabled: true,
        showNavigationPad: true,
        ambientEnabled: true,
        ambientMode: 'status',
        ambientOpacity: 100,
        cursorStatusLightsEnabled: true,
        claudeStatusLightsEnabled: true,
        codexStatusLightsEnabled: true,
        keyLightPreset: 'default',
        keys: []
      }
    };
  }

  function paintEl() {
    if (typeof document === 'undefined') return null;
    return (
      document.querySelector('[data-awh-pad-paint]') ||
      document.querySelector('[data-soft-pad-preview-paint]')
    );
  }

  function statusEl() {
    if (typeof document === 'undefined') return null;
    return document.querySelector('[data-awh-pad-status]');
  }

  function setStatus(kind, detail) {
    lastStatus = kind;
    var el = statusEl();
    if (!el) return;
    var labels = {
      live: '实况 · 本地 Soft Pad 渲染器',
      parent: '实况 · 来自 OneTone 预览桥',
      empty: '未配置 Soft Pad',
      stub: '桥已就绪 · 等待渲染器',
      loading: '正在加载 Soft Pad…'
    };
    el.textContent = labels[kind] || kind;
    el.setAttribute('data-kind', kind);
    if (detail) el.setAttribute('title', detail);
  }

  function applyPayload(payload) {
    payload = payload || {};
    var host = paintEl();
    if (!host) return false;
    if (payload.empty) {
      host.innerHTML =
        '<div class="agent-preview-empty">' +
        (payload.message || '先在 Soft Pad 创建/打开应用场景') +
        '</div>';
      setStatus('empty', payload.reason || '');
      return true;
    }
    if (payload.padHtml) {
      host.innerHTML = payload.padHtml;
      lastTitle = payload.title || '';
      if (lastTitle) {
        host.querySelectorAll('.micro-hw__face-title').forEach(function (t) {
          t.textContent = lastTitle;
        });
      }
      var source = payload._source || 'parent';
      setStatus(source === 'local' ? 'live' : 'parent', lastTitle);
      return true;
    }
    return false;
  }

  function buildLocalPayload() {
    var Pad = global.OneToneCodexMicroPadUi;
    var Bridge = global.OneToneAgentPagePreviewBridge;
    if (Bridge && typeof Bridge.buildPayload === 'function') {
      try {
        var fromBridge = Bridge.buildPayload({ leftKind: 'pad' });
        if (fromBridge && !fromBridge.empty && fromBridge.padHtml) {
          fromBridge._source = 'local';
          return fromBridge;
        }
        if (fromBridge && fromBridge.empty) {
          fromBridge._source = 'local';
          return fromBridge;
        }
      } catch (_) {}
    }
    if (!Pad || typeof Pad.renderHardwarePad !== 'function') {
      return null;
    }
    var m = null;
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && Hub.resolveSoftPadEntry) {
        var entry = Hub.resolveSoftPadEntry();
        if (entry && entry.mapping) m = entry.mapping;
      }
    } catch (_) {}
    if (!m) {
      try {
        var Cap = global.OneToneAgentCapabilityUi;
        if (Cap && Cap.activeCodexMapping) m = Cap.activeCodexMapping();
      } catch (_) {}
    }
    if (!m) m = demoMapping();
    try {
      if (Pad.ensurePad) Pad.ensurePad(m, { persist: false });
    } catch (_) {}
    var pad = (m && m.codexMicroPad) || demoMapping().codexMicroPad;
    pad.enabled = true;
    var skin = String(pad.skin || 'default');
    var padHtml =
      '<div class="codex-micro-pad soft-pad-preview" data-pad-skin="' +
      skin.replace(/"/g, '') +
      '">' +
      Pad.renderHardwarePad(m, pad, {
        mode: 'softPad',
        omitFaceTopbar: false,
        stripMode: 'full'
      }) +
      '</div>';
    return {
      empty: false,
      title: String((m && (m.displayLabel || m.name)) || 'Soft Pad'),
      skin: skin,
      padHtml: padHtml,
      _source: 'local'
    };
  }

  function refresh() {
    var local = buildLocalPayload();
    if (local) {
      applyPayload(local);
      return lastStatus;
    }
    requestParent();
    var host = paintEl();
    if (host && (!host.innerHTML || host.getAttribute('data-waiting') === '1')) {
      host.setAttribute('data-waiting', '1');
      host.innerHTML =
        '<div class="agent-preview-empty">桥已接通协议。<br>在 OneTone 内打开本页，或加 <code>?livePad=1</code> 加载真实 Soft Pad 渲染器。</div>';
      setStatus('stub');
    }
    return lastStatus;
  }

  function requestParent() {
    try {
      if (global.parent && global.parent !== global) {
        global.parent.postMessage({ type: CMD_TYPE, cmd: 'refresh' }, '*');
      }
    } catch (_) {}
    try {
      global.postMessage({ type: CMD_TYPE, cmd: 'refresh' }, '*');
    } catch (_) {}
  }

  function onMessage(ev) {
    var data = ev && ev.data;
    if (!data || data.type !== MSG_TYPE) return;
    applyPayload(data.payload);
  }

  function ensureI18nStub() {
    if (typeof global.t !== 'function') {
      global.t = function (_k, fallback) {
        return fallback != null ? fallback : _k;
      };
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = function () {
        resolve(src);
      };
      s.onerror = function () {
        reject(new Error('fail ' + src));
      };
      document.head.appendChild(s);
    });
  }

  /** Load production Soft Pad renderer into the prototype page. */
  function loadLiveRenderer() {
    if (global.OneToneCodexMicroPadUi) {
      return Promise.resolve('present');
    }
    ensureI18nStub();
    setStatus('loading');
    var base = '../../src/js/features/agent/';
    // Pad UI is self-contained enough for preview; hub/capability optional.
    return loadScript(base + 'codex-micro-pad-ui.js').then(function () {
      return 'loaded';
    });
  }

  function mount() {
    if (!bound && typeof window !== 'undefined') {
      bound = true;
      window.addEventListener('message', onMessage);
    }
    refresh();
  }

  function start(opts) {
    opts = opts || {};
    mount();
    var wantLive =
      opts.livePad === true ||
      (typeof location !== 'undefined' &&
        /(?:\?|&)livePad=1(?:&|$)/.test(location.search));
    var chain = Promise.resolve();
    if (wantLive) {
      chain = loadLiveRenderer()
        .then(function () {
          refresh();
        })
        .catch(function () {
          setStatus('stub', 'livePad 脚本加载失败');
          refresh();
        });
    }
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      if (lastStatus === 'stub' || lastStatus === 'loading') return;
      refresh();
    }, 8000);
    return chain.then(function () {
      return lastStatus;
    });
  }

  function stop() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = 0;
    }
  }

  global.OneToneAwhSoftPadGlanceBridge = {
    MSG_TYPE: MSG_TYPE,
    CMD_TYPE: CMD_TYPE,
    applyPayload: applyPayload,
    buildLocalPayload: buildLocalPayload,
    refresh: refresh,
    mount: mount,
    start: start,
    stop: stop,
    demoMapping: demoMapping,
    getStatus: function () {
      return lastStatus;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
