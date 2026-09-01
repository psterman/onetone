/**
 * TrayCustomization v2 — catalog, defaults, merge, block/control helpers.
 */
(function (global) {
  'use strict';

  var VERSION = 2;
  var CHANNELS = ['voice', 'keys', 'softPad', 'camera'];
  var CHANNEL_BLOCK = {
    voice: 'block:channel:voice',
    keys: 'block:channel:keys',
    softPad: 'block:channel:softPad',
    camera: 'block:channel:camera'
  };

  var BLOCK_CATALOG = [
    { id: 'block:scene', labelKey: 'trayLayoutScene', labelFb: '场景预设', defaultVisible: true, locked: true },
    { id: 'block:hero', labelKey: 'trayLayoutHero', labelFb: '顶部状态卡', defaultVisible: false, locked: true },
    { id: 'block:event', labelKey: 'trayLayoutEvent', labelFb: '最近发生的事', defaultVisible: false },
    { id: 'block:habit', labelKey: 'trayLayoutHabit', labelFb: '切换习惯', defaultVisible: false },
    { id: 'block:quick', labelKey: 'trayLayoutQuick', labelFb: '快捷动作', defaultVisible: false },
    { id: 'block:channel:voice', labelKey: 'trayLayoutShowVoice', labelFb: '语音通道', defaultVisible: true, channel: 'voice' },
    { id: 'block:channel:keys', labelKey: 'trayLayoutShowKeys', labelFb: '按键通道', defaultVisible: true, channel: 'keys' },
    { id: 'block:channel:softPad', labelKey: 'trayLayoutShowSoftPad', labelFb: '小键盘通道', defaultVisible: true, channel: 'softPad' },
    { id: 'block:channel:camera', labelKey: 'trayLayoutShowCamera', labelFb: '摄像头通道', defaultVisible: false, channel: 'camera' },
    { id: 'block:mic', labelKey: 'trayLayoutMic', labelFb: '麦克风', defaultVisible: true },
    { id: 'block:footer', labelKey: 'trayLayoutFooter', labelFb: '底部链接', defaultVisible: true, locked: true }
  ];

  var CONTROL_DEFS = [
    { id: 'voiceMaster', channel: 'voice', tier: 'l1', stateKey: 'config.voiceAssistEnabled', ipc: 'config', labelKey: 'trayChVoiceMaster', hintKey: 'trayChVoiceMasterHint', needs: null },
    { id: 'voiceEnd', channel: 'voice', tier: 'l2', stateKey: 'config.voiceEnd.enabled', ipc: 'config', labelKey: 'trayChVoiceEnd', hintKey: 'trayChVoiceEndHint', needs: 'voiceMaster' },
    { id: 'keysEnabled', channel: 'keys', tier: 'l1', stateKey: 'mappings[].enabled', ipc: 'config', labelKey: 'trayChKeysUseScenario', hintKey: 'trayChKeysUseScenarioHint', needs: null },
    { id: 'keysCancel', channel: 'keys', tier: 'l2', stateKey: 'mappings[].cancelEnabled', ipc: 'config', labelKey: 'trayChKeysCancel', hintKey: 'trayChKeysCancelHint', needs: 'keysEnabled' },
    { id: 'keysAutoSend', channel: 'keys', tier: 'l2', stateKey: 'mappings[].autoEnterEnabled', ipc: 'config', labelKey: 'trayChKeysAutoSend', hintKey: 'trayChKeysAutoSendHint', needs: 'keysEnabled' },
    { id: 'padEnabled', channel: 'softPad', tier: 'l1', stateKey: 'mappings[].codexMicroPad.enabled', ipc: 'config', labelKey: 'trayChPadEnabled', hintKey: 'trayChPadEnabledHint', needs: null },
    { id: 'padOverlay', channel: 'softPad', tier: 'l2', stateKey: 'mappings[].codexMicroPad.overlayEnabled', ipc: 'config', labelKey: 'trayChPadShowKeyboard', hintKey: 'trayChPadShowKeyboardHint', needs: 'padEnabled' },
    { id: 'padRequireFg', channel: 'softPad', tier: 'l2', stateKey: 'mappings[].codexMicroPad.requireForeground', ipc: 'config', labelKey: 'trayChPadRequireFg', hintKey: 'trayChPadRequireFgHint', needs: 'padOverlay' },
    { id: 'camPresence', channel: 'camera', tier: 'l1', stateKey: 'config.cameraPrefs.presenceActions.enabled', ipc: 'config', labelKey: 'trayChCamPresence', hintKey: 'trayChCamPresenceHint', needs: null },
    { id: 'camTriggerAway', channel: 'camera', tier: 'l2', stateKey: 'config.cameraPrefs.presenceActions.triggers.away', ipc: 'config', labelKey: 'trayChCamTriggerAway', hintKey: 'trayChCamTriggerAwayHint', needs: 'camPresence' },
    { id: 'camAutoMute', channel: 'camera', tier: 'l1', stateKey: 'config.cameraPrefs.autoMute.enabled', ipc: 'config', labelKey: 'trayChCamAutoMute', hintKey: 'trayChCamAutoMuteHint', needs: null },
    { id: 'camNoFaceMute', channel: 'camera', tier: 'l2', stateKey: 'config.cameraPrefs.autoMute.noFaceMute', ipc: 'config', labelKey: 'trayChCamNoFaceMute', hintKey: 'trayChCamNoFaceMuteHint', needs: 'camAutoMute' }
  ];

  function controlsForChannel(channel) {
    if (channel === 'habits') return [];
    return CONTROL_DEFS.filter(function (d) { return d.channel === channel; });
  }

  var LABEL_FB = {
    trayChVoiceMaster: '语音输入', trayChVoiceEnd: '说完就停',
    trayChKeysUseScenario: '快捷键', trayChKeysCancel: '再按可取消', trayChKeysAutoSend: '自动发送',
    trayChPadEnabled: '启用小键盘', trayChPadShowKeyboard: '显示小键盘', trayChPadRequireFg: '跟着前台助手',
    trayChCamPresence: '镜头动作识别', trayChCamTriggerAway: '检测离席',
    trayChCamAutoMute: '走远自动静音', trayChCamNoFaceMute: '没人也静音'
  };

  var PERSONA_PRESETS = {
    compact: { voice: true, keys: true, softPad: true, camera: false },
    full: { voice: true, keys: true, softPad: true, camera: true },
    beg: { voice: true, keys: false, softPad: false, camera: false },
    vibe: { voice: true, keys: true, softPad: true, camera: false }
  };

  function normalizePersona(persona) {
    if (persona === 'full') return 'full';
    if (persona === 'beg' || persona === 'vibe' || persona === 'compact') return 'compact';
    return 'compact';
  }

  function inferPersonaFromLayout(layout) {
    layout = normalizeLayout(layout || defaultLayout());
    var all = CHANNELS.every(function (ch) {
      return blockVisible(layout, channelBlockId(ch));
    });
    return all ? 'full' : 'compact';
  }

  function t(key, fb) {
    var v = global.OneToneI18n && global.OneToneI18n.t ? global.OneToneI18n.t(key, fb) : (fb || key);
    return (!v || v === key) ? (fb || LABEL_FB[key] || key) : v;
  }

  function ctrlCatalogId(channel, ctrlId) {
    return 'ctrl:' + channel + ':' + ctrlId;
  }

  function getTrayCatalog() {
    var controls = [];
    var titleL1Seen = {};
    CONTROL_DEFS.forEach(function (def, i) {
      var renderTier = def.tier;
      var demoted = false;
      if (def.tier === 'l1') {
        if (titleL1Seen[def.channel]) {
          renderTier = 'l2';
          demoted = true;
        } else {
          titleL1Seen[def.channel] = true;
          renderTier = 'title';
        }
      }
      controls.push({
        id: ctrlCatalogId(def.channel, def.id),
        channel: def.channel,
        ctrlId: def.id,
        tier: def.tier,
        renderTier: renderTier,
        demoted: demoted,
        label: t(def.labelKey, LABEL_FB[def.labelKey] || def.id),
        defaultVisible: def.tier === 'l1' || (def.channel === 'voice' && def.id === 'voiceEnd') || (def.channel === 'keys' && def.id === 'keysCancel') || (def.channel === 'softPad' && def.id === 'padOverlay') || (def.channel === 'camera' && def.id === 'camTriggerAway')
      });
    });
    return { version: VERSION, blocks: BLOCK_CATALOG.slice(), controls: controls };
  }

  function defaultLayout() {
    var cat = getTrayCatalog();
    return {
      version: VERSION,
      blocks: cat.blocks.map(function (b, i) {
        return { id: b.id, visible: b.defaultVisible !== false, order: i };
      }),
      controls: cat.controls.map(function (c, i) {
        return { id: c.id, visible: !!c.defaultVisible, order: i, channel: c.channel };
      })
    };
  }

  function migrateV1(cfg) {
    if (!cfg || cfg.version === VERSION) return normalizeLayout(cfg);
    var out = defaultLayout();
    if (cfg.showEvent === false) setBlockVisible(out, 'block:event', false);
    var s = cfg.showInTray || cfg.show_in_tray || {};
    if (s.voice === false) setBlockVisible(out, CHANNEL_BLOCK.voice, false);
    if (s.keys === false) setBlockVisible(out, CHANNEL_BLOCK.keys, false);
    if (s.softPad === false || s.soft_pad === false) setBlockVisible(out, CHANNEL_BLOCK.softPad, false);
    if (s.camera === true) setBlockVisible(out, CHANNEL_BLOCK.camera, true);
    return out;
  }

  function normalizeLayout(cfg) {
    if (!cfg || !cfg.blocks || !cfg.blocks.length) return migrateV1(cfg);
    return {
      version: VERSION,
      blocks: cfg.blocks.map(function (b) {
        return { id: b.id, visible: b.visible !== false, order: Number(b.order) || 0 };
      }),
      controls: (cfg.controls || []).map(function (c) {
        return { id: c.id, visible: c.visible !== false, order: Number(c.order) || 0, channel: c.channel || '' };
      })
    };
  }

  function ensureSchemeALayout(layout) {
    var repaired = false;
    layout = normalizeLayout(layout || defaultLayout());
    setBlockVisible(layout, 'block:scene', true);
    setBlockVisible(layout, 'block:hero', false);
    setBlockVisible(layout, 'block:event', false);
    setBlockVisible(layout, 'block:habit', false);
    setBlockVisible(layout, 'block:quick', false);
    var anyCh = CHANNELS.some(function (ch) {
      return blockVisible(layout, channelBlockId(ch));
    });
    if (!anyCh) {
      layout = applyPersonaPreset(layout, 'vibe');
      repaired = true;
    }
    CHANNELS.forEach(function (ch) {
      if (!blockVisible(layout, channelBlockId(ch))) return;
      var cat = getTrayCatalog();
      var hasVisible = (layout.controls || []).some(function (c) {
        return c.channel === ch && c.visible !== false;
      });
      if (hasVisible) return;
      repaired = true;
      cat.controls.forEach(function (c, i) {
        if (c.channel !== ch) return;
        var hit = (layout.controls || []).find(function (x) { return x.id === c.id; });
        if (hit) hit.visible = !!c.defaultVisible;
        else layout.controls.push({ id: c.id, visible: !!c.defaultVisible, order: i, channel: ch });
      });
    });
    return { layout: layout, repaired: repaired };
  }

  function mergeLayoutWithCatalog(current) {
    var cat = getTrayCatalog();
    current = normalizeLayout(current);
    var merged = { version: VERSION, blocks: [], controls: [] };
    var newBlocks = 0;
    var newControls = 0;
    var blockById = {};
    (current.blocks || []).forEach(function (b) { blockById[b.id] = b; });
    cat.blocks.forEach(function (b, i) {
      var hit = blockById[b.id];
      if (hit) merged.blocks.push({ id: b.id, visible: hit.visible !== false, order: hit.order });
      else { merged.blocks.push({ id: b.id, visible: !!b.defaultVisible, order: i }); newBlocks++; }
    });
    var ctrlById = {};
    (current.controls || []).forEach(function (c) { ctrlById[c.id] = c; });
    cat.controls.forEach(function (c, i) {
      var hit = ctrlById[c.id];
      if (hit) merged.controls.push({ id: c.id, visible: hit.visible !== false, order: hit.order, channel: c.channel });
      else { merged.controls.push({ id: c.id, visible: false, order: i + 100, channel: c.channel }); newControls++; }
    });
    merged.blocks.sort(function (a, b) { return a.order - b.order; });
    merged.controls.sort(function (a, b) { return a.order - b.order; });
    var ensured = ensureSchemeALayout(merged);
    merged = ensured.layout;
    return { layout: merged, newBlocks: newBlocks, newControls: newControls, repaired: ensured.repaired };
  }

  function setBlockVisible(layout, blockId, on) {
    var b = (layout.blocks || []).find(function (x) { return x.id === blockId; });
    if (b) b.visible = !!on;
  }

  function blockVisible(layout, blockId) {
    var b = (layout.blocks || []).find(function (x) { return x.id === blockId; });
    return b ? b.visible !== false : true;
  }

  function visibleControlsForChannel(layout, channel) {
    return (layout.controls || [])
      .filter(function (c) { return c.channel === channel && c.visible !== false; })
      .sort(function (a, b) { return a.order - b.order; });
  }

  function sortedVisibleBlocks(layout) {
    return (layout.blocks || [])
      .filter(function (b) { return b.visible !== false; })
      .sort(function (a, b) { return a.order - b.order; });
  }

  function channelBlockId(channel) {
    return CHANNEL_BLOCK[channel] || ('block:channel:' + channel);
  }

  function legacyShowInTray(layout) {
    var out = { voice: true, keys: true, softPad: true, camera: false };
    CHANNELS.forEach(function (ch) {
      out[ch] = blockVisible(layout, channelBlockId(ch));
    });
    return out;
  }

  function applyPersonaPreset(layout, persona) {
    layout = normalizeLayout(layout || defaultLayout());
    persona = normalizePersona(persona);
    var spec = PERSONA_PRESETS[persona] || PERSONA_PRESETS.compact;
    CHANNELS.forEach(function (ch) {
      setBlockVisible(layout, channelBlockId(ch), !!spec[ch]);
    });
    return layout;
  }

  global.OneToneTrayLayoutV2 = {
    VERSION: VERSION,
    CHANNELS: CHANNELS,
    CHANNEL_BLOCK: CHANNEL_BLOCK,
    getTrayCatalog: getTrayCatalog,
    defaultLayout: defaultLayout,
    migrateV1: migrateV1,
    normalizeLayout: normalizeLayout,
    mergeLayoutWithCatalog: mergeLayoutWithCatalog,
    blockVisible: blockVisible,
    setBlockVisible: setBlockVisible,
    visibleControlsForChannel: visibleControlsForChannel,
    sortedVisibleBlocks: sortedVisibleBlocks,
    channelBlockId: channelBlockId,
    legacyShowInTray: legacyShowInTray,
    applyPersonaPreset: applyPersonaPreset,
    normalizePersona: normalizePersona,
    inferPersonaFromLayout: inferPersonaFromLayout,
    ensureSchemeALayout: ensureSchemeALayout,
    PERSONA_PRESETS: PERSONA_PRESETS,
    CONTROL_DEFS: CONTROL_DEFS,
    controlsForChannel: controlsForChannel,
    ctrlCatalogId: ctrlCatalogId
  };
})(typeof window !== 'undefined' ? window : globalThis);
