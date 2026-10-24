(function (global) {
  'use strict';

  /** Board ids (locator UI) → editor channel ids (ActionNav). */
  var BOARD_TO_EDITOR = { key: 'key', voice: 'voice', cam: 'camera', pad: 'softPad' };
  var EDITOR_TO_BOARD = { key: 'key', voice: 'voice', camera: 'cam', softPad: 'pad' };

  /** One row per CAMERA_ITEMS trigger/action pair (return shares away trigger). */
  var CAM_GESTURES = [
    { id: 'away', trigger: 'away', action: 'onAway', titleZh: '离开', titleEn: 'Away' },
    { id: 'return', trigger: 'away', action: 'onReturn', titleZh: '回来', titleEn: 'Return' },
    { id: 'shake', trigger: 'shake', action: 'shakeHead', titleZh: '摇头', titleEn: 'Shake' },
    { id: 'blink', trigger: 'blink', action: 'deliberateBlink', titleZh: '眨眼', titleEn: 'Blink' },
    { id: 'palm', trigger: 'openPalm', action: 'openPalm', titleZh: '举手', titleEn: 'Palm' },
    { id: 'ok', trigger: 'okHand', action: 'okHand', titleZh: 'OK', titleEn: 'OK' },
    { id: 'fist', trigger: 'fist', action: 'fist', titleZh: '握拳', titleEn: 'Fist' },
    { id: 'wave', trigger: 'wave', action: 'wave', titleZh: '挥手', titleEn: 'Wave' }
  ];

  var SCENES = [
    { id: 'key', titleZh: '按键', titleEn: 'Keys', blurbZh: '按键开口打字', blurbEn: 'Key to dictate', editZh: '改按键', editEn: 'Edit keys' },
    { id: 'voice', titleZh: '语音', titleEn: 'Voice', blurbZh: '嘴说启动听写', blurbEn: 'Speak to dictate', editZh: '改语音', editEn: 'Edit voice' },
    { id: 'cam', titleZh: '摄像头', titleEn: 'Camera', blurbZh: '姿势触发', blurbEn: 'Gesture triggers', editZh: '改摄像头', editEn: 'Edit camera' },
    { id: 'pad', titleZh: 'Soft Pad', titleEn: 'Soft Pad', blurbZh: '屏幕小遥控', blurbEn: 'On-screen pad', editZh: '改 Soft Pad', editEn: 'Edit Soft Pad' }
  ];

  function diff() {
    return global.OneToneHabitOverrideDiff || {};
  }

  function mappingCore() {
    return global.OneToneMappingCore || null;
  }

  function rulesApi() {
    return global.OneToneAppBehaviorRules || null;
  }

  function langIsEn(locale) {
    return String(locale || 'zh').toLowerCase().indexOf('en') === 0;
  }

  function editorChannelId(boardId) {
    return BOARD_TO_EDITOR[boardId] || boardId;
  }

  function boardIdFromEditor(channel) {
    return EDITOR_TO_BOARD[channel] || channel;
  }

  function focusIdForAction(boardId, actionId) {
    actionId = String(actionId || '');
    if (boardId === 'key') {
      if (actionId === 'keys.trigger') return 'trigger';
      if (actionId === 'keys.target') return 'target';
      if (actionId === 'keys.finish') return 'keyFinishFlow';
      return 'trigger';
    }
    if (boardId === 'voice') {
      if (actionId.indexOf('voice.wake') === 0) return 'wakePhrases';
      return 'wakePhrases';
    }
    if (boardId === 'cam') return 'cameraPresence';
    if (boardId === 'pad') return 'softPadLayout';
    return '';
  }

  function effectiveKeys(mapping, cfg) {
    var d = diff();
    var baseline = d.getGlobalKeyBaseline
      ? d.getGlobalKeyBaseline(cfg, mappingCore())
      : { triggerKey: '', targetKey: '', autoEnterEnabled: true, cancelEnabled: true, triggerMode: 'tap' };
    var isApp = d.isAppScenarioMapping ? d.isAppScenarioMapping(mapping) : !!(mapping && mapping.appTargetId);
    var isBaseline = d.isGlobalBaselineMapping
      ? d.isGlobalBaselineMapping(mapping, cfg, mappingCore())
      : !isApp;
    var rawTrig = String((mapping && mapping.triggerKey) || '').trim();
    var rawTgt = String((mapping && mapping.targetKey) || '').trim();
    var triggerKey = isBaseline ? rawTrig : (rawTrig || String(baseline.triggerKey || '').trim());
    var targetKey = isBaseline ? rawTgt : (rawTgt || String(baseline.targetKey || '').trim());
    var triggerInherited = !isBaseline && !rawTrig && !!triggerKey;
    var targetInherited = !isBaseline && !rawTgt && !!targetKey;
    var finishInherited = false;
    var autoEnter = mapping && mapping.autoEnterEnabled != null
      ? !!mapping.autoEnterEnabled
      : (isBaseline ? true : !!baseline.autoEnterEnabled);
    var cancel = mapping && mapping.cancelEnabled != null
      ? !!mapping.cancelEnabled
      : (isBaseline ? true : baseline.cancelEnabled !== false);
    if (!isBaseline) {
      finishInherited = mapping.autoEnterEnabled == null && mapping.cancelEnabled == null;
    }
    return {
      triggerKey: triggerKey,
      targetKey: targetKey,
      autoEnterEnabled: autoEnter,
      cancelEnabled: cancel,
      triggerInherited: triggerInherited,
      targetInherited: targetInherited,
      finishInherited: finishInherited,
      baseline: baseline
    };
  }

  function snapshotKey(mapping, cfg, locale) {
    var en = langIsEn(locale);
    var blurb = en ? 'Key to dictate' : '按键开口打字';
    if (!mapping || mapping.enabled === false) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    if (mapping.keyModeEnabled === false) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    var k = effectiveKeys(mapping, cfg);
    var actions = [];
    if (k.triggerKey) {
      actions.push({
        id: 'keys.trigger',
        title: en ? 'Start' : '启动',
        key: k.triggerKey,
        muted: !!k.triggerInherited,
        inherited: !!k.triggerInherited
      });
    }
    if (k.targetKey) {
      actions.push({
        id: 'keys.target',
        title: en ? 'Open voice' : '打开语音',
        key: k.targetKey,
        muted: !!k.targetInherited,
        inherited: !!k.targetInherited
      });
    }
    var finishLabel = k.autoEnterEnabled
      ? (en ? 'Auto send' : '自动发送')
      : (en ? 'Keep for review' : '保留确认');
    if (k.triggerKey || k.targetKey) {
      actions.push({
        id: 'keys.finish',
        title: en ? 'Finish' : '收尾',
        key: finishLabel,
        muted: !!k.finishInherited,
        inherited: !!k.finishInherited
      });
    }
    if (!k.triggerKey && !k.targetKey) {
      return { tone: 'attention', statusLabel: en ? 'Needs setup' : '待补', blurb: blurb, actions: [] };
    }
    var tone = (!k.triggerKey || !k.targetKey) ? 'attention' : 'ready';
    return {
      tone: tone,
      statusLabel: tone === 'attention' ? (en ? 'Needs setup' : '待补') : (en ? 'Ready' : '就绪'),
      blurb: blurb,
      actions: actions
    };
  }

  function localWakePhrases(mapping) {
    var ov = mapping && mapping.voiceOverride && typeof mapping.voiceOverride === 'object'
      ? mapping.voiceOverride
      : null;
    if (!ov || !Array.isArray(ov.wakePhrases)) return [];
    return ov.wakePhrases.map(function (s) {
      return String(s || '').trim();
    }).filter(Boolean);
  }

  function snapshotVoice(mapping, cfg, locale) {
    var en = langIsEn(locale);
    var blurb = en ? 'Speak to dictate' : '嘴说启动听写';
    if (!mapping || mapping.enabled === false) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    if (mapping.voiceModeEnabled === false) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    var cmds = localWakePhrases(mapping).slice(0, 4);
    if (!cmds.length) {
      return {
        tone: 'idle',
        statusLabel: en ? 'Inherit global' : '沿用全局',
        blurb: blurb,
        actions: [{
          id: 'voice.inherit',
          title: en ? 'Inherit global' : '沿用全局',
          key: '',
          muted: true,
          inherited: true
        }]
      };
    }
    return {
      tone: 'ready',
      statusLabel: en ? 'Ready' : '就绪',
      blurb: blurb,
      actions: cmds.map(function (c, i) {
        return {
          id: 'voice.wake.' + i,
          title: i === 0 ? (en ? 'Wake dictation' : '唤醒听写') : c,
          key: c,
          muted: false,
          inherited: false
        };
      })
    };
  }

  function snapshotCam(mapping, cfg, locale) {
    var en = langIsEn(locale);
    var blurb = en ? 'Gesture triggers' : '姿势触发';
    if (!mapping || mapping.enabled === false) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    var d = diff();
    var presence = d.getEffectiveCameraPresence
      ? d.getEffectiveCameraPresence(mapping, cfg)
      : { enabled: false, triggers: {}, inheritedTriggers: {}, hasAnyTrigger: false };
    if (!presence.enabled) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    var actions = [];
    CAM_GESTURES.forEach(function (g) {
      if (!presence.triggers[g.trigger]) return;
      var act = presence.actions && presence.actions[g.action];
      var actOn = act != null && String(act).trim() !== '' && String(act).trim() !== 'none';
      // Show gesture when trigger is on; for return require a real onReturn binding.
      if (g.id === 'return' && !actOn) return;
      if (g.id !== 'return' && g.id !== 'away' && !actOn && !presence.triggers[g.trigger]) return;
      var inherited = !!(presence.inheritedTriggers && presence.inheritedTriggers[g.trigger]);
      actions.push({
        id: 'cam.' + g.id,
        title: en ? g.titleEn : g.titleZh,
        key: g.id,
        muted: inherited,
        inherited: inherited
      });
    });
    if (!actions.length) {
      return { tone: 'attention', statusLabel: en ? 'Needs setup' : '待补', blurb: blurb, actions: [] };
    }
    return {
      tone: 'ready',
      statusLabel: en ? 'Ready' : '就绪',
      blurb: blurb,
      actions: actions
    };
  }

  function padBoundKeys(mapping) {
    var pad = mapping && mapping.codexMicroPad && typeof mapping.codexMicroPad === 'object'
      ? mapping.codexMicroPad
      : null;
    if (!pad || pad.enabled === false) return [];
    var keys = Array.isArray(pad.keys) ? pad.keys : [];
    return keys.filter(function (k) {
      if (!k || typeof k !== 'object') return false;
      if (k.enabled === false) return false;
      return !!String(k.slotId || '').trim();
    });
  }

  function padKeyTitle(k, locale) {
    var en = langIsEn(locale);
    if (k.title) return String(k.title);
    if (en && k.uiLabelEn) return String(k.uiLabelEn);
    if (!en && k.uiLabelZh) return String(k.uiLabelZh);
    if (k.slotId) return String(k.slotId).replace(/^semantic:[^:]+:/, '').slice(0, 24);
    return en ? 'Key' : '键';
  }

  function snapshotPad(mapping, cfg, locale) {
    var en = langIsEn(locale);
    var blurb = en ? 'On-screen pad' : '屏幕小遥控';
    if (!mapping || mapping.enabled === false) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    var bound = padBoundKeys(mapping);
    if (!bound.length) {
      return { tone: 'idle', statusLabel: en ? 'Off' : '未开', blurb: blurb, actions: [] };
    }
    return {
      tone: 'ready',
      statusLabel: (bound.length) + (en ? ' keys' : ' 键'),
      blurb: blurb,
      actions: bound.map(function (k, i) {
        return {
          id: k.id || ('pad.' + i),
          title: padKeyTitle(k, locale),
          key: String(k.microKeyId || k.chordHint || ''),
          muted: false,
          inherited: false
        };
      })
    };
  }

  function make(mapping, cfg, locale) {
    cfg = cfg || {};
    locale = locale || 'zh';
    var key = snapshotKey(mapping, cfg, locale);
    var voice = snapshotVoice(mapping, cfg, locale);
    var cam = snapshotCam(mapping, cfg, locale);
    var pad = snapshotPad(mapping, cfg, locale);
    var channels = { key: key, voice: voice, cam: cam, pad: pad };
    var configuredActionCount = SCENES.reduce(function (n, s) {
      return n + channels[s.id].actions.filter(function (a) { return !a.muted; }).length;
    }, 0);
    var hasAttention = SCENES.some(function (s) { return channels[s.id].tone === 'attention'; });
    return {
      channels: channels,
      configuredActionCount: configuredActionCount,
      hasAttention: hasAttention,
      schemeEnabled: !!(mapping && mapping.enabled !== false)
    };
  }

  function deriveScopeFromRules(m) {
    var rules = Array.isArray(m && m.appBehaviorRules) ? m.appBehaviorRules : [];
    for (var i = 0; i < rules.length; i++) {
      var r = rules[i];
      if (!r || !r.match || typeof r.match !== 'object') continue;
      var exes = Array.isArray(r.match.exeNames)
        ? r.match.exeNames.map(function (x) { return String(x || '').trim(); }).filter(Boolean)
        : [];
      if (exes.length) return 'exe:' + exes[0].toLowerCase();
      var path = String(r.match.fullPath || r.match.full_path || r.match.pathContains || '').trim();
      if (path) {
        var base = path.replace(/\\/g, '/').split('/').pop() || path;
        return 'path:' + base.toLowerCase();
      }
      var title = String(r.match.titleContains || '').trim();
      if (title) return 'title:' + title.toLowerCase();
      var appId = String(r.appId || '').trim();
      if (appId) return 'rule:' + appId;
    }
    return 'legacy-custom';
  }

  function scopeIdForMapping(m, cfg) {
    var d = diff();
    if (d.isGlobalBaselineMapping && d.isGlobalBaselineMapping(m, cfg, mappingCore())) {
      return 'global';
    }
    var appId = String(m && m.appTargetId || '').trim();
    if (appId) return appId;
    if (d.isAppScenarioMapping && d.isAppScenarioMapping(m)) {
      return deriveScopeFromRules(m);
    }
    return 'legacy:' + String(m && m.id || 'unknown');
  }

  function scopeDisplayName(scopeId, schemes, locale) {
    var en = langIsEn(locale);
    if (scopeId === 'global') return en ? 'All apps' : '全部应用';
    if (scopeId.indexOf('legacy:') === 0) return en ? 'Legacy' : '旧习惯';
    if (scopeId === 'legacy-custom') return en ? 'Custom app' : '自定义应用';
    if (scopeId.indexOf('exe:') === 0) return scopeId.slice(4);
    if (scopeId.indexOf('path:') === 0) return scopeId.slice(5);
    if (scopeId.indexOf('title:') === 0) return scopeId.slice(6);
    if (scopeId.indexOf('rule:') === 0) return scopeId.slice(5);
    var rules = rulesApi();
    if (rules && rules.appDisplayName) {
      var name = rules.appDisplayName(scopeId);
      if (name) return name;
    }
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.presetById) {
      var p = presets.presetById(scopeId);
      if (p && (p.name || p.label)) return p.name || p.label;
    }
    var first = schemes && schemes[0];
    if (first) {
      var shared = global.OneToneHabitShared;
      if (shared && shared.appName) return shared.appName(first);
      if (first.group) return String(first.group);
    }
    return scopeId;
  }

  function isIncompleteStub(m) {
    var rules = rulesApi();
    if (rules && rules.isIncompleteCustomStub) return !!rules.isIncompleteCustomStub(m);
    return false;
  }

  /**
   * Group mappings for locator sidebar.
   * Global baseline first; never dump process-bound app scenarios into global.
   */
  function habitLocatorGroups(mappings, cfg, locale) {
    cfg = cfg || {};
    locale = locale || 'zh';
    var list = Array.isArray(mappings) ? mappings.filter(Boolean) : [];
    var map = {};
    var order = [];
    list.forEach(function (m) {
      if (isIncompleteStub(m)) return;
      var scope = scopeIdForMapping(m, cfg);
      if (!map[scope]) {
        map[scope] = [];
        order.push(scope);
      }
      map[scope].push(m);
    });
    order.sort(function (a, b) {
      if (a === 'global') return -1;
      if (b === 'global') return 1;
      var na = scopeDisplayName(a, map[a], locale);
      var nb = scopeDisplayName(b, map[b], locale);
      return String(na).localeCompare(String(nb), langIsEn(locale) ? 'en' : 'zh');
    });
    return order.map(function (scope) {
      var schemes = map[scope].slice().sort(function (a, b) {
        return String(a.group || a.label || a.id || '').localeCompare(
          String(b.group || b.label || b.id || ''),
          langIsEn(locale) ? 'en' : 'zh'
        );
      });
      var snaps = schemes.map(function (s) { return make(s, cfg, locale); });
      var badge = snaps.reduce(function (n, sn) { return n + sn.configuredActionCount; }, 0);
      var attention = snaps.some(function (sn) { return sn.hasAttention; });
      return {
        scope: scope,
        name: scopeDisplayName(scope, schemes, locale),
        schemes: schemes,
        badge: badge,
        attention: attention
      };
    });
  }

  /** activeSceneId in group → selectedMappingId in group → first. */
  function pickSchemeInGroup(schemes, activeId, selectedId) {
    schemes = Array.isArray(schemes) ? schemes : [];
    if (!schemes.length) return null;
    var active = String(activeId || '');
    var selected = String(selectedId || '');
    var hit = schemes.find(function (s) { return s && s.id === active; });
    if (hit) return hit;
    hit = schemes.find(function (s) { return s && s.id === selected; });
    if (hit) return hit;
    return schemes[0];
  }

  function listSubtitle(mapping, snap, locale) {
    var en = langIsEn(locale);
    var d = diff();
    if (d.isGlobalBaselineMapping && d.isGlobalBaselineMapping(mapping, {}, mappingCore())) {
      // caller should pass cfg; subtitle for global is fixed "fallback"
    }
    if (!mapping || mapping.enabled === false) return en ? 'Off' : '已关闭';
    var keyCh = snap && snap.channels && snap.channels.key;
    if (!keyCh) return '';
    var trig = (keyCh.actions || []).find(function (a) { return a.id === 'keys.trigger'; });
    var tgt = (keyCh.actions || []).find(function (a) { return a.id === 'keys.target'; });
    if (trig && tgt) return trig.key + ' → ' + tgt.key;
    if (trig) return trig.key + ' → …';
    if (keyCh.tone === 'attention') return en ? 'Keys not set' : '未设置键位';
    return '';
  }

  global.OneToneHabitChannelSnapshot = {
    SCENES: SCENES,
    BOARD_TO_EDITOR: BOARD_TO_EDITOR,
    make: make,
    habitLocatorGroups: habitLocatorGroups,
    pickSchemeInGroup: pickSchemeInGroup,
    editorChannelId: editorChannelId,
    boardIdFromEditor: boardIdFromEditor,
    focusIdForAction: focusIdForAction,
    scopeIdForMapping: scopeIdForMapping,
    listSubtitle: listSubtitle,
    effectiveKeys: effectiveKeys,
    padBoundKeys: padBoundKeys
  };
})(typeof window !== 'undefined' ? window : globalThis);
