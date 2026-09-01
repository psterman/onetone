/**
 * Tray session data — single bootstrap IPC + in-memory cache for layout/runtime/display/osContext.
 */
(function (global) {
  'use strict';

  var invoke = global.OneToneIpc && global.OneToneIpc.invoke;
  var display = null;
  var layout = null;
  var runtime = null;
  var osContext = null;
  var bootstrapInflight = null;

  function parse(raw) {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }

  function applyOsContext(bundle) {
    var TCC = global.OneToneTrayChannelControls;
    if (!TCC || !bundle) return;
    var ctx = bundle.osContext || bundle.os_context || {};
    var cfg = ctx.configSlice || ctx.config_slice || ctx.config;
    if (!cfg) return;
    var globalState = bundle.display && bundle.display.global;
    if (TCC.ingestOsContext) {
      TCC.ingestOsContext({ config: cfg, voiceEnd: ctx.voiceEnd || ctx.voice_end }, globalState);
    }
  }

  function applyLayout(customization) {
    var V2 = global.OneToneTrayLayoutV2;
    var TCC = global.OneToneTrayChannelControls;
    if (!V2 || !customization) return null;
    var merged = V2.mergeLayoutWithCatalog(
      customization.version === V2.VERSION ? customization : V2.migrateV1(customization)
    );
    layout = merged.layout;
    if (TCC && TCC.setTrayLayoutV2) TCC.setTrayLayoutV2(layout);
    return merged;
  }

  function bootstrap(surface) {
    if (!invoke) return Promise.resolve(null);
    if (display && layout && runtime && osContext) {
      applyOsContext({ display: display, osContext: osContext });
      var TCC = global.OneToneTrayChannelControls;
      if (TCC && TCC.setTrayLayoutV2) TCC.setTrayLayoutV2(layout);
      return Promise.resolve({
        display: display,
        customization: layout,
        runtime: runtime,
        osContext: osContext
      });
    }
    if (bootstrapInflight) return bootstrapInflight;
    bootstrapInflight = invoke('cmd_tray_bootstrap', { surface: surface || 'os' }).then(function (raw) {
      var bundle = parse(raw) || {};
      display = bundle.display || null;
      runtime = bundle.runtime || null;
      osContext = bundle.osContext || bundle.os_context || null;
      applyOsContext(bundle);
      if (bundle.customization) applyLayout(bundle.customization);
      return bundle;
    }).finally(function () {
      bootstrapInflight = null;
    });
    return bootstrapInflight;
  }

  function patchDisplay(seg, payload) {
    if (!display) display = { global: {}, mic: {}, channels: [], deepLinks: [], schemes: [] };
    if (seg === 'global') display.global = payload;
    else if (seg === 'mic') display.mic = payload;
    else if (seg === 'channels') display.channels = payload;
    else if (seg === 'schemes') display.schemes = payload;
  }

  function setLayout(lay) {
    layout = lay;
    var TCC = global.OneToneTrayChannelControls;
    if (TCC && TCC.setTrayLayoutV2) TCC.setTrayLayoutV2(lay);
  }

  global.OneToneTrayDataStore = {
    bootstrap: bootstrap,
    patchDisplay: patchDisplay,
    setLayout: setLayout,
    get display() { return display; },
    get layout() { return layout; },
    get runtime() { return runtime; },
    get osContext() { return osContext; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
