/**
 * Keys page B —「本场景动作」dir dock.
 * Lists recognition + sibling custom-key actions for the app scenario.
 * 「新建动作」creates a new match mapping (does not overwrite habit trigger).
 */
(function (global) {
  'use strict';

  var state = {
    mappingId: '',
    bound: false,
    dragKey: ''
  };

  // Keys + Voice share the same dock; only the visible settings page paints.
  var HOSTS = [
    {
      panel: 'keysSceneActionsPanel',
      page: 'settingsPanelKeys',
      bodySel: '.keys-page-body',
      app: 'keysSceneActionsApp',
      appIcon: 'keysSceneActionsAppIcon',
      appName: 'keysSceneActionsAppName',
      meta: 'keysSceneActionsMeta',
      back: 'keysSceneActionsBack',
      dir: 'keysSceneActionsDir',
      detail: 'keysSceneActionsDetail',
      add: 'keysSceneActionsAdd'
    },
    {
      panel: 'voiceSceneActionsPanel',
      page: 'settingsPanelVoiceWake',
      bodySel: '.voice-page-body',
      app: 'voiceSceneActionsApp',
      appIcon: 'voiceSceneActionsAppIcon',
      appName: 'voiceSceneActionsAppName',
      meta: 'voiceSceneActionsMeta',
      back: 'voiceSceneActionsBack',
      dir: 'voiceSceneActionsDir',
      detail: 'voiceSceneActionsDetail',
      add: 'voiceSceneActionsAdd'
    }
  ];

  function t(key, fallback) {
    try {
      if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback || key;
  }

  function esc(s) {
    if (global.OneToneDom && global.OneToneDom.esc) return global.OneToneDom.esc(s);
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(id) {
    return global.document && global.document.getElementById
      ? global.document.getElementById(id)
      : null;
  }

  function mappingCore() {
    return global.OneToneMappingCore || null;
  }

  function mappingById(id) {
    var mid = String(id || '').trim();
    if (!mid) return null;
    var core = mappingCore();
    if (core && typeof core.byId === 'function') return core.byId(mid);
    try {
      var maps =
        (global.OneToneState &&
          global.OneToneState.state &&
          global.OneToneState.state.config &&
          global.OneToneState.state.config.mappings) ||
        [];
      for (var i = 0; i < maps.length; i++) {
        if (maps[i] && maps[i].id === mid) return maps[i];
      }
    } catch (_) {}
    return null;
  }

  function selectedMapping() {
    if (onVoicePage()) {
      try {
        var hdr = global.OneToneVoicePageHeaderRender;
        if (hdr && typeof hdr.resolveScopeMapping === 'function') {
          var scoped = hdr.resolveScopeMapping(null);
          if (scoped) return scoped;
        }
      } catch (_) {}
    }
    var core = mappingCore();
    if (core && typeof core.selected === 'function') return core.selected();
    try {
      var sid =
        global.OneToneState &&
        global.OneToneState.state &&
        global.OneToneState.state.selectedMappingId;
      return mappingById(sid);
    } catch (_) {}
    return null;
  }

  function isAppScenario(m) {
    var diff = global.OneToneHabitOverrideDiff;
    if (diff && typeof diff.isAppScenarioMapping === 'function') {
      return !!diff.isAppScenarioMapping(m);
    }
    return !!(m && String(m.appTargetId || '').trim());
  }

  function pageIsOpen(pageId) {
    var page = $(pageId);
    return !!(page && !page.hidden);
  }

  function activeHost() {
    var i;
    for (i = 0; i < HOSTS.length; i++) {
      if (pageIsOpen(HOSTS[i].page)) return HOSTS[i];
    }
    return HOSTS[0];
  }

  function hostBody(host) {
    if (!host) return null;
    try {
      var root = $(host.page);
      if (root && root.querySelector) {
        var body = root.querySelector(host.bodySel);
        if (body) return body;
      }
    } catch (_) {}
    var panel = $(host.panel);
    return (panel && panel.parentElement) || null;
  }

  function setVisible(show) {
    var active = activeHost();
    var i;
    for (i = 0; i < HOSTS.length; i++) {
      var host = HOSTS[i];
      var panel = $(host.panel);
      var body = hostBody(host);
      var showThis = !!(show && active && host.panel === active.panel && pageIsOpen(host.page));
      if (panel) panel.hidden = !showThis;
      if (body && body.classList) {
        if (showThis) body.classList.add('has-scene-panel');
        else body.classList.remove('has-scene-panel');
      }
    }
  }

  function openKeysPanelIfNeeded() {
    var ui = global.OneToneState && global.OneToneState.ui;
    if (!ui || ui.settingsPanel === 'keys') return;
    try {
      if (global.OneToneSettingsDrawer && typeof global.OneToneSettingsDrawer.open === 'function') {
        global.OneToneSettingsDrawer.open({ panel: 'keys' });
        return;
      }
    } catch (_) {}
    try {
      var hooks = global.__vp_bootstrap_hooks__ || {};
      if (typeof hooks.setSettingsPanel === 'function') hooks.setSettingsPanel('keys');
    } catch (_) {}
  }

  function onVoicePage() {
    var ui = global.OneToneState && global.OneToneState.ui;
    return !!(ui && ui.settingsPanel === 'voiceWake');
  }

  function appInfo(m) {
    var id = String((m && m.appTargetId) || '').trim();
    var presets = global.OneToneAppTargetPresets;
    var preset = presets && typeof presets.presetById === 'function' ? presets.presetById(id) : null;
    var name = id;
    if (preset) {
      name = t(preset.nameKey || '', preset.name || id);
      if (!name || name === preset.nameKey) name = preset.name || id;
    }
    return {
      id: id,
      name: name || t('keysSceneActionsAppFallback', '应用'),
      icon: preset && preset.icon ? String(preset.icon) : ''
    };
  }

  function labelForRow(m, slotId, actionId) {
    var A = global.OneToneAgentActions;
    var sid = String(slotId || '').trim();
    var aid = String(actionId || '').trim();
    function fromAgent(id) {
      if (!A || !id) return '';
      if (typeof A.labelForSlotForMapping === 'function') {
        var mapped = String(A.labelForSlotForMapping(m, id) || '').trim();
        if (mapped) return mapped;
      }
      if (typeof A.slotById === 'function' && typeof A.labelForSlot === 'function') {
        var slot = A.slotById(id);
        var L = String(A.labelForSlot(slot) || '').trim();
        if (L) return L;
      }
      if (typeof A.actionById === 'function') {
        var act = A.actionById(id);
        if (act) {
          var en = global.OneToneI18n && global.OneToneI18n.getLang && global.OneToneI18n.getLang() === 'en';
          return String((en ? act.labelEn : act.labelZh) || act.labelZh || act.labelEn || '').trim();
        }
      }
      return '';
    }
    var hit = fromAgent(sid) || fromAgent(aid);
    if (hit) return hit;
    // cursor.paste / semantic.foo.bar → try bare tail (paste)
    var bareSid = sid.indexOf('.') >= 0 ? sid.split('.').pop() : '';
    var bareAid = aid.indexOf('.') >= 0 ? aid.split('.').pop() : '';
    hit = fromAgent(bareSid) || fromAgent(bareAid);
    if (hit) return hit;
    // Semantic / picker catalogue labels
    try {
      var store = global.OneToneSemanticActionStore;
      if (store && typeof store.entryMeta === 'function') {
        var meta = store.entryMeta(aid) || store.entryMeta(sid);
        if (meta) {
          var lang = (global.OneToneI18n && global.OneToneI18n.getLang && global.OneToneI18n.getLang()) || 'zh';
          var sm =
            lang === 'en'
              ? meta.labelEn || meta.labelZh || meta.label_zh
              : meta.labelZh || meta.label_zh || meta.labelEn;
          if (sm) return String(sm).trim();
        }
      }
    } catch (_) {}
    // Last resort: never paint raw dotted ids for beginners
    var raw = aid || sid || '';
    if (raw && raw.indexOf('.') >= 0) {
      var tail = raw.split('.').pop();
      var known = {
        paste: '粘贴',
        pasteAndSend: '粘贴发送',
        continue: '继续',
        cancel: '取消',
        newThread: '新建对话',
        status: '查看状态',
        commandPalette: '命令菜单',
        openAgent: '打开助手',
        pushToTalk: '语音输入',
        stopOrSend: '结束或发送'
      };
      if (known[tail]) return known[tail];
    }
    return raw || '?';
  }

  function describeBinding(channel, b) {
    if (!b) return '';
    var adapters = global.OneToneActionBindingAdapters;
    if (adapters && adapters[channel] && typeof adapters[channel].describeTrigger === 'function') {
      return String(adapters[channel].describeTrigger(b) || '').trim();
    }
    return String(b.triggerBinding || b.trigger || '').trim();
  }

  function recognitionTargetChord(m) {
    if (!m) return '';
    // Only concrete saved recognition — never inherited editorTarget defaults
    // (those painted empty stubs as "Right Alt" in 本场景动作).
    var tk = String(m.targetKey || '').trim();
    if (tk) return tk;
    var acts = Array.isArray(m.targetActions) ? m.targetActions : [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (a && a.type === 'key' && String(a.value || '').trim()) {
        return String(a.value).trim();
      }
    }
    return '';
  }

  function friendlyTrigger(trig) {
    var raw = String(trig || '').trim();
    if (!raw) return t('badgeNotRecorded', '未设置');
    try {
      var kl = global.OneToneKeyLabels;
      if (kl && typeof kl.friendlyKeyName === 'function') return kl.friendlyKeyName(raw) || raw;
    } catch (_) {}
    return raw;
  }

  function targetActionsSummary(m) {
    var acts = Array.isArray(m && m.targetActions) ? m.targetActions : [];
    if (!acts.length) return t('keysCustomKeyMatchNoActions', '尚无动作');
    return String(acts.length) + t('keysCustomKeyMatchSteps', '步');
  }

  function imeInfo(m) {
    var id = String((m && m.imePresetId) || '').trim();
    var Ime = global.OneToneImePresets;
    var preset = Ime && typeof Ime.presetById === 'function' ? Ime.presetById(id) : null;
    if (preset) {
      return {
        id: preset.id,
        name: t(preset.nameKey || preset.shortKey || '', preset.id),
        icon: String(preset.icon || '').trim()
      };
    }
    return {
      id: '',
      name: t('imePresetCustom', '自定义'),
      icon: ''
    };
  }

  function hasConcreteConfig(m) {
    if (!m) return false;
    if (String(m.triggerKey || '').trim()) return true;
    if (String(m.imePresetId || '').trim()) return true;
    if (String(m.targetKey || '').trim()) return true;
    if (Array.isArray(m.targetActions) && m.targetActions.length) return true;
    return false;
  }

  function isCustomKeyMatchMapping(m) {
    if (!m) return false;
    try {
      var picker = global.OneToneKeysChannelCommandPicker;
      if (picker && typeof picker.isCustomKeyMatchMapping === 'function') {
        return !!picker.isCustomKeyMatchMapping(m);
      }
    } catch (_) {}
    var ref = m.captureHeroRef;
    var kindCustom =
      ref &&
      typeof ref === 'object' &&
      String(ref.kind || '')
        .trim()
        .toLowerCase() === 'customkey';
    if (kindCustom) {
      var bref = String(ref.bindingRef || '').trim();
      var mid = String(m.id || '').trim();
      // Habit 02 apply shadow must not list as「我录的键」.
      if (bref && mid && bref !== mid) return false;
      return true;
    }
    // Legacy library peers: disabled sequence row without kind yet.
    if (
      m.enabled === false &&
      Array.isArray(m.targetActions) &&
      m.targetActions.length > 0 &&
      !String(m.imePresetId || '').trim() &&
      !String(m.targetKey || '').trim()
    ) {
      return true;
    }
    return false;
  }

  function listAppMappings(anchor) {
    var appId = String((anchor && anchor.appTargetId) || '').trim();
    if (!appId) return [];
    // Full app peers (voice + custom) — do not reuse filtered 我录的键 list.
    var maps =
      (global.OneToneState &&
        global.OneToneState.state &&
        global.OneToneState.state.config &&
        global.OneToneState.state.config.mappings) ||
      [];
    var keepId = '';
    try {
      keepId = String(state.mappingId || '').trim();
      if (!keepId) {
        var sel = selectedMapping();
        if (sel) keepId = String(sel.id || '').trim();
      }
    } catch (_) {}
    var out = [];
    for (var j = 0; j < maps.length; j++) {
      var m = maps[j];
      if (!m || String(m.appTargetId || '').trim() !== appId) continue;
      // Hide empty 新建动作 voice stubs — but always keep「我录的键」rows (1/2…).
      if (
        !hasConcreteConfig(m) &&
        !isCustomKeyMatchMapping(m) &&
        String(m.id || '') !== keepId
      ) {
        continue;
      }
      out.push(m);
    }
    out.sort(function (a, b) {
      var ao = a && a.order != null ? Number(a.order) : 0;
      var bo = b && b.order != null ? Number(b.order) : 0;
      if (ao !== bo) return ao - bo;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });
    return out;
  }

  function recognitionDisplay(m) {
    var live = recognitionTargetChord(m);
    if (live) return live;
    var acts = Array.isArray(m && m.targetActions) ? m.targetActions : [];
    if (acts.length) return targetActionsSummary(m);
    return '';
  }

  function isVoiceInputMapping(m) {
    if (!m) return false;
    // 「我录的键」peers keep custom names in 本场景动作 — never fold into 语音输入.
    if (isCustomKeyMatchMapping(m)) return false;
    if (String(m.imePresetId || '').trim()) return true;
    var acts = Array.isArray(m.targetActions) ? m.targetActions : [];
    if (acts.length) return false;
    if (String(m.targetKey || '').trim()) return true;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || String(b.triggerType || '') !== 'key') continue;
      var sid = String(b.slotId || '').trim();
      var aid = String(b.actionId || '').trim();
      if (sid === 'pushToTalk' || aid === 'startDictation' || aid === 'input.start') return true;
    }
    return false;
  }

  function channelTabLabel(ch) {
    var fb = {
      key: '我录的键',
      voice: '口头指令',
      cursor: '软件自带',
      softPad: '屏幕按钮',
      camera: '手势',
      ime: '听写方式',
      recognition: '听写方式',
      customKey: '我录的键'
    };
    var keys = {
      key: 'keysChannelTabKey',
      voice: 'keysChannelTabVoice',
      cursor: 'keysChannelTabCursor',
      softPad: 'keysChannelTabSoftPad',
      camera: 'keysChannelTabCamera',
      ime: 'keysChannelTabIme'
    };
    var c = String(ch || '');
    return t(keys[c] || c, fb[c] || c);
  }

  function heroRefFor(sm) {
    var core = mappingCore();
    if (core && typeof core.captureHeroRefForMapping === 'function') {
      try {
        return core.captureHeroRefForMapping(sm);
      } catch (_) {}
    }
    return (sm && sm.captureHeroRef) || null;
  }

  function isDefaultImeHero(ref) {
    var core = mappingCore();
    if (core && typeof core.isDefaultCaptureHeroRef === 'function') {
      try {
        return !!core.isDefaultCaptureHeroRef(ref);
      } catch (_) {}
    }
    if (!ref) return true;
    var kind = String(ref.kind || '')
      .trim()
      .toLowerCase();
    return kind === 'ime' && !String(ref.actionId || '').trim();
  }

  function customKeyRow(sm, trigLine) {
    var matchName = '';
    try {
      var pickerName = global.OneToneKeysChannelCommandPicker;
      if (pickerName && typeof pickerName.customKeyMatchDisplayName === 'function') {
        matchName = String(pickerName.customKeyMatchDisplayName(sm) || '').trim();
      }
    } catch (_) {}
    if (!matchName) matchName = String(sm.label || '').trim();
    if (!matchName || /→|->/.test(matchName) || /^AutoTrigger\b/i.test(matchName)) {
      matchName = t('keysCustomKeyMatchTitle', '按键匹配');
    }
    var trig = String((sm && sm.triggerKey) || '').trim();
    return {
      key: 'match:' + String(sm.id),
      mappingId: String(sm.id),
      slotId: '',
      actionId: '',
      kind: 'customKey',
      label: matchName,
      binds: { key: trigLine },
      ime: null,
      summary: '',
      unset: !trig
    };
  }

  function recognitionRow(sm, trigLine) {
    var trig = String((sm && sm.triggerKey) || '').trim();
    return {
      key: 'voice:' + String(sm.id),
      mappingId: String(sm.id),
      slotId: 'pushToTalk',
      actionId: 'startDictation',
      kind: 'recognition',
      label: t('keysSceneActionsVoiceLabel', '语音输入'),
      binds: { key: trigLine },
      ime: imeInfo(sm),
      summary: '',
      unset: !trig
    };
  }

  /**
   * One peer mapping → one dock row = last-selected 02 scheme (captureHeroRef).
   * Never enumerate every agentBinding / catalogue option for the same trigger.
   * Voice page: prefer 语音输入 for IME peers (ignore last non-IME 02 diversion).
   */
  function rowForLastScheme(sm, trigLine) {
    if (!sm || !sm.id) return null;

    // Voice dock: IME / 语音输入 peers always list here, even if keys last-scheme
    // was softPad / customKey / cursor (those stay on the Keys dock only).
    if (onVoicePage() && isVoiceInputMapping(sm)) {
      if (!hasRecognitionScheme(sm)) return null;
      return recognitionRow(sm, trigLine);
    }

    if (isCustomKeyMatchMapping(sm)) return customKeyRow(sm, trigLine);

    var ref = heroRefFor(sm);
    var kindLower = ref
      ? String(ref.kind || '')
          .trim()
          .toLowerCase()
      : '';
    var ch = ref ? String(ref.channel || '').trim() : '';
    var heroAid = ref ? String(ref.actionId || '').trim() : '';
    var heroBref = ref ? String(ref.bindingRef || '').trim() : '';

    // Habit last applied a「我录的键」match as 02 — still one scheme for this trigger.
    if (kindLower === 'customkey' && heroBref && heroBref !== String(sm.id)) {
      var match = mappingById(heroBref);
      var named = match ? customKeyRow(match, trigLine) : null;
      return {
        key: 'match-applied:' + String(sm.id),
        mappingId: String(sm.id),
        slotId: heroBref,
        actionId: '',
        kind: 'customKey',
        label: (named && named.label) || t('keysCustomKeyMatchTitle', '按键匹配'),
        binds: { key: trigLine },
        ime: null,
        summary: '',
        unset: !String(sm.triggerKey || '').trim()
      };
    }

    if (!isDefaultImeHero(ref) && (ch === 'softPad' || ch === 'cursor' || ch === 'camera' || ch === 'voice')) {
      if (heroAid || (heroBref && heroBref !== 'ime')) {
        return {
          key: 'hero:' + String(sm.id) + ':' + ch,
          mappingId: String(sm.id),
          slotId: heroBref,
          actionId: heroAid,
          kind: ch,
          label: labelForRow(sm, heroBref, heroAid) || channelTabLabel(ch),
          binds: { key: trigLine },
          ime: null,
          summary: '',
          unset: !String(sm.triggerKey || '').trim()
        };
      }
    }

    if (isVoiceInputMapping(sm) || isDefaultImeHero(ref)) {
      if (!hasRecognitionScheme(sm)) return null;
      return recognitionRow(sm, trigLine);
    }
    return null;
  }

  /**
   * Soft Pad / Cursor layout seeds many triggerType:voice agentBindings.
   * Kept for keys/tests; voice dock no longer dumps these rows.
   */
  function isSoftPadOrSystemVoiceBinding(sm, b) {
    if (!b) return true;
    var sid = String(b.slotId || '').trim();
    var aid = String(b.actionId || '').trim();
    if (/^cursorBeginner/i.test(sid) || /^cursorBeginner/i.test(aid)) return true;
    if (aid === 'agent.continue' || sid === 'agent.continue') return true;
    if (aid === 'app.open' || sid.indexOf('open-app-acoustic:') === 0) return true;
    var pad = sm && sm.codexMicroPad;
    var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
    var i;
    for (i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!k) continue;
      if (String(k.slotId || '').trim() === sid) return true;
      if (String(k.slotId || '').trim() === aid) return true;
    }
    var customs = pad && Array.isArray(pad.customShortcuts) ? pad.customShortcuts : [];
    for (i = 0; i < customs.length; i++) {
      var c = customs[i];
      if (c && String(c.id || '').trim() === sid) return true;
    }
    // Dual key+voice on same slot = Soft Pad / 软件自带 seed, not voice-dock managed.
    var binds = Array.isArray(sm.agentBindings) ? sm.agentBindings : [];
    for (i = 0; i < binds.length; i++) {
      var kb = binds[i];
      if (!kb || String(kb.triggerType || '') !== 'key') continue;
      if (sid && String(kb.slotId || '').trim() === sid) return true;
      if (aid && String(kb.actionId || '').trim() === aid && String(kb.actionInstanceId || '') === String(b.actionInstanceId || '')) {
        return true;
      }
    }
    return false;
  }

  /** Non-SoftPad voice phrases on a peer (available to callers/tests; voice dock skips dump). */
  function voicePhraseRows(sm) {
    if (!sm || !sm.id) return [];
    var list = Array.isArray(sm.agentBindings) ? sm.agentBindings : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || String(b.triggerType || '') !== 'voice') continue;
      if (b.enabled === false) continue;
      if (isSoftPadOrSystemVoiceBinding(sm, b)) continue;
      var phrase = String(b.triggerBinding || '').trim();
      if (!phrase) continue;
      var sid = String(b.slotId || '').trim();
      var aid = String(b.actionId || '').trim();
      if (sid === 'pushToTalk' || aid === 'startDictation' || aid === 'input.start') continue;
      if (!sid && !aid) continue;
      var inst = String(b.actionInstanceId || '').trim();
      out.push({
        key: 'vphrase:' + String(sm.id) + ':' + (inst || sid || aid || String(i)),
        mappingId: String(sm.id),
        slotId: sid,
        actionId: aid,
        kind: 'voicePhrase',
        label: labelForRow(sm, sid, aid) || phrase,
        binds: { key: '「' + phrase + '」' },
        ime: null,
        summary: '',
        unset: false
      });
    }
    return out;
  }

  /** Peer rows for every mapping under this app — each is its own 01/02. */
  function buildRows(m) {
    if (!m) return [];
    var maps = listAppMappings(m);
    var lang =
      global.OneToneI18n && global.OneToneI18n.getLang ? global.OneToneI18n.getLang() : 'zh';
    var rows = [];
    var voicePage = onVoicePage();
    for (var i = 0; i < maps.length; i++) {
      var sm = maps[i];
      if (!sm || !sm.id) continue;
      var trig = String(sm.triggerKey || '').trim();
      // Prototype parity: list shows trigger × gesture, not 01→02 chord.
      var trigLine = '';
      if (global.OneToneKeyLabels && global.OneToneKeyLabels.triggerDisplayLabel) {
        trigLine = global.OneToneKeyLabels.triggerDisplayLabel(sm, lang) || '';
      }
      if (!trigLine && trig) trigLine = friendlyTrigger(trig);
      if (!trigLine) trigLine = t('badgeNotRecorded', '未设置');
      if (voicePage) {
        // Voice dock: 语音输入 peers + non-SoftPad voice phrases.
        // Wake-first habits often have IME / recognition without a hardware triggerKey —
        // requiring trig here emptied the list after 新建/改口令 (kept mapping, 0 rows).
        var keep =
          String(sm.id || '') === String(state.mappingId || '').trim();
        if (
          isVoiceInputMapping(sm) &&
          hasRecognitionScheme(sm) &&
          (hasConcreteConfig(sm) || keep)
        ) {
          var rec = recognitionRow(sm, trigLine);
          // Subtitle stays trigger/status; IME icon+name only in bottom trail (no duplicate).
          rec.binds = { key: trigLine || t('badgeNotRecorded', '未设置') };
          rows.push(rec);
        } else if (keep && !isCustomKeyMatchMapping(sm)) {
          // 「新建动作」draft: stay visible while user records 01 / picks 02.
          var draft = recognitionRow(sm, trigLine);
          draft.binds = { key: t('badgeNotRecorded', '未设置') };
          draft.unset = true;
          rows.push(draft);
        }
        var phrases = voicePhraseRows(sm);
        for (var p = 0; p < phrases.length; p++) rows.push(phrases[p]);
        continue;
      }
      var row = rowForLastScheme(sm, trigLine);
      if (row) rows.push(row);
    }
    return rows;
  }

  function findRow(rows, key) {
    var k = String(key || '').trim();
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].key === k) return rows[i];
    }
    return null;
  }

  function imeBadgeHtml(ime) {
    if (!ime) return '';
    var icon = ime.icon
      ? '<img class="keys-scene-actions__ime-ico" src="' +
        esc(ime.icon) +
        '" alt="" width="16" height="16" />'
      : '';
    return (
      '<span class="keys-scene-actions__ime">' +
      icon +
      '<span class="keys-scene-actions__ime-name">' +
      esc(ime.name || '') +
      '</span></span>'
    );
  }

  function jumpToEdit(row) {
    var page = global.OneToneKeysPageState;
    var picker = global.OneToneKeysChannelCommandPicker;
    var core = mappingCore();
    var mid = row && row.mappingId ? String(row.mappingId) : '';
    // Focus the row's mapping so 01/02 are that pair — peers don't steal each other.
    if (mid && core && typeof core.focus === 'function') {
      try {
        core.focus(mid);
      } catch (_) {}
    } else if (mid && global.OneToneState && global.OneToneState.state) {
      global.OneToneState.state.selectedMappingId = mid;
    }
    if (mid) state.mappingId = mid;
    // Voice page: voice-input rows stay here; custom-key peers jump to Keys.
    if (onVoicePage()) {
      if (row && row.kind === 'customKey') {
        openKeysPanelIfNeeded();
      } else {
        paint();
        try {
          if (global.OneToneVoiceSettingsFlow && global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender) {
            global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
          }
        } catch (_) {}
        return;
      }
    }
    if (row && row.kind === 'customKey') {
      if (page && typeof page.setStep === 'function') {
        try {
          page.setStep('target', { skipSheet: true });
        } catch (_) {}
      }
      if (picker && typeof picker.setActiveTab === 'function') {
        try {
          picker.setActiveTab('key', { skipHeroClear: true });
        } catch (_) {}
      }
      if (picker && typeof picker.applyHero === 'function') {
        try {
          picker.applyHero();
        } catch (_) {}
      }
    } else {
      if (page && typeof page.setStep === 'function') {
        try {
          page.setStep('target', { skipSheet: true });
        } catch (_) {}
      }
      if (picker) {
        try {
          var tab = 'ime';
          if (row && row.kind === 'softPad') tab = 'softPad';
          else if (row && row.kind === 'cursor') tab = 'cursor';
          else if (row && row.kind === 'camera') tab = 'camera';
          else if (row && row.kind === 'voice') tab = 'voice';
          else if (row && row.kind === 'recognition') tab = 'ime';
          if (typeof picker.clearSelection === 'function' && tab === 'ime') {
            picker.clearSelection({ skipRender: true, skipHero: true, skipPersist: true });
          }
          if (typeof picker.setActiveTab === 'function') {
            picker.setActiveTab(tab, { skipHeroClear: true });
          }
          if (typeof picker.applyHero === 'function') picker.applyHero();
          if (typeof picker.syncRecognitionEditorPreview === 'function') {
            picker.syncRecognitionEditorPreview();
          }
          if (typeof picker.refresh === 'function') picker.refresh();
        } catch (_) {}
      }
    }
    var target =
      row && row.kind === 'customKey'
        ? $('habitKeyMapRowTarget') || $('keysDeskPanel')
        : $('habitKeyMapRowTarget') || $('keysDeskPanel');
    if (target && target.scrollIntoView) {
      try {
        target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
    }
  }

  function startNewAction() {
    var voice = onVoicePage();
    var picker = global.OneToneKeysChannelCommandPicker;
    var created = null;
    var createFn = null;
    if (voice) {
      createFn =
        picker && typeof picker.createVoiceInputMapping === 'function'
          ? picker.createVoiceInputMapping
          : null;
    } else {
      // Keys「新建」still seeds a「我录的键」peer; other channels are picked in 02.
      createFn =
        picker && typeof picker.createCustomKeyMatchMapping === 'function'
          ? picker.createCustomKeyMatchMapping
          : null;
    }
    if (createFn) {
      try {
        created = createFn.call(picker);
      } catch (_) {
        created = null;
      }
    }
    if (!created || !created.id) {
      try {
        if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
          global.OneToneApp.toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
        }
      } catch (_) {}
      return;
    }
    var newId = String(created.id);
    state.mappingId = newId;
    if (!voice) {
      var page = global.OneToneKeysPageState;
      if (page && typeof page.setStep === 'function') {
        try {
          page.setStep('trigger', { skipSheet: true });
        } catch (_) {}
      }
      if (picker && typeof picker.setActiveTab === 'function') {
        try {
          picker.setActiveTab('key', { skipHeroClear: true });
        } catch (_) {}
      }
    } else {
      try {
        if (
          global.OneToneVoiceSettingsFlow &&
          global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender
        ) {
          global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
        }
      } catch (_) {}
    }
    setTimeout(function () {
      var Rec = global.OneToneMappingRecording;
      if (Rec && typeof Rec.startTrigger === 'function') {
        try {
          Rec.startTrigger(newId);
        } catch (_) {}
      } else {
        var boot = global.__vp_bootstrap_hooks__ || {};
        if (typeof boot.startTriggerRecord === 'function') {
          try {
            boot.startTriggerRecord();
          } catch (_) {}
        }
      }
      if (!voice) {
        var table = global.OneToneHabitKeyMappingTable;
        if (table && typeof table.highlightRow === 'function') {
          try {
            table.highlightRow('trigger');
          } catch (_) {}
        }
      }
      paint();
    }, 0);
    try {
      if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
        global.OneToneApp.toast(
          voice
            ? t(
                'keysSceneActionsAddTriggerHint',
                '已新建动作 · 请录 01 触发；02 请选择输入法或识别键'
              )
            : t(
                'keysCustomKeyMatchCreated',
                '已新建。直接加步骤即可（启动键同 01）。'
              )
        );
      }
    } catch (_) {}
    if (!voice) {
      var target = $('habitKeyMapCellTrigger') || $('habitKeyMapRowTrigger') || $('keysDeskPanel');
      if (target && target.scrollIntoView) {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {}
      }
    }
  }

  function paintApp(m, host) {
    host = host || activeHost();
    var wrap = $(host.app);
    var ico = $(host.appIcon);
    var nameEl = $(host.appName);
    if (!wrap) return;
    var info = appInfo(m);
    if (!info.id) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    if (nameEl) nameEl.textContent = info.name;
    if (ico) {
      if (info.icon) {
        ico.src = info.icon;
        ico.hidden = false;
      } else {
        ico.removeAttribute('src');
        ico.hidden = true;
      }
    }
  }

  function paintMeta(m, host) {
    host = host || activeHost();
    var meta = $(host.meta);
    if (!meta) return;
    var n = filterRowsForChannel(buildRows(m)).length;
    meta.textContent = t('keysSceneActionsMetaCount', '{n} 个动作').replace('{n}', String(n));
  }

  function paintChrome(m, host) {
    host = host || activeHost();
    var panel = $(host.panel);
    if (!panel) return;
    panel.setAttribute('data-panel', 'dir');
    var back = $(host.back);
    var dir = $(host.dir);
    var detail = $(host.detail);
    if (back) back.hidden = true;
    if (dir) dir.hidden = false;
    if (detail) detail.hidden = true;
    paintApp(m, host);
    paintMeta(m, host);
  }

  function channelKind() {
    if (onVoicePage()) return 'voice';
    if (pageIsOpen('settingsPanelKeys')) return 'key';
    return 'all';
  }

  function filterRowsForChannel(rows) {
    var ch = channelKind();
    if (ch === 'voice') {
      return (rows || []).filter(function (r) {
        return r && (r.kind === 'recognition' || r.kind === 'voicePhrase');
      });
    }
    if (ch === 'key') {
      // Keys dock: key 02 schemes only — voice phrase bindings stay on Voice page.
      return (rows || []).filter(function (r) {
        return r && r.kind !== 'voicePhrase';
      });
    }
    return rows || [];
  }

  function hasRecognitionScheme(sm) {
    if (!sm) return false;
    if (String(sm.imePresetId || '').trim()) return true;
    // Live recognition chord only counts with an IME choice / dictation bind.
    var list = Array.isArray(sm.agentBindings) ? sm.agentBindings : [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.enabled === false) continue;
      var sid = String(b.slotId || '').trim();
      var aid = String(b.actionId || '').trim();
      if (sid === 'pushToTalk' || aid === 'startDictation' || aid === 'input.start') {
        if (String(b.triggerBinding || '').trim()) return true;
      }
    }
    return false;
  }

  function persistSceneDock(source) {
    try {
      var persist = global.OneToneConfigPersist;
      if (persist && typeof persist.saveAsync === 'function') {
        persist.saveAsync({ source: source || 'scene-dock' });
      } else if (persist && typeof persist.save === 'function') {
        persist.save({ source: source || 'scene-dock' });
      }
    } catch (_) {}
  }

  function clearHabitScheme(row, m) {
    if (!m || !row) return;
    var kind = String(row.kind || '');
    if (kind === 'recognition') {
      m.imePresetId = '';
      if (Array.isArray(m.agentBindings)) {
        m.agentBindings = m.agentBindings.filter(function (b) {
          if (!b) return false;
          var sid = String(b.slotId || '').trim();
          var aid = String(b.actionId || '').trim();
          return !(sid === 'pushToTalk' || aid === 'startDictation' || aid === 'input.start');
        });
      }
      if (isDefaultImeHero(m.captureHeroRef) || !m.captureHeroRef) m.captureHeroRef = null;
      else if (String((m.captureHeroRef && m.captureHeroRef.channel) || '') === 'ime') m.captureHeroRef = null;
      return;
    }
    if (kind === 'softPad' || kind === 'cursor' || kind === 'camera' || kind === 'voice') {
      m.captureHeroRef = null;
      return;
    }
    if (kind === 'customKey') {
      m.captureHeroRef = null;
      m.targetActions = [];
    }
  }

  function sortRowsByDockOrder(rows, anchor) {
    if (!rows || !rows.length || !anchor) return rows || [];
    var order = Array.isArray(anchor.sceneDockOrder) ? anchor.sceneDockOrder : [];
    if (!order.length) return rows;
    var rank = {};
    var i;
    for (i = 0; i < order.length; i++) rank[String(order[i])] = i;
    return rows.slice().sort(function (a, b) {
      var ar = rank[String(a.key)];
      var br = rank[String(b.key)];
      if (ar == null && br == null) return 0;
      if (ar == null) return 1;
      if (br == null) return -1;
      return ar - br;
    });
  }

  function saveDockOrder(anchor, rows) {
    if (!anchor || !rows) return;
    anchor.sceneDockOrder = rows.map(function (r) {
      return String(r.key || '');
    });
    persistSceneDock('scene-dock-reorder');
  }

  function deleteVoicePhraseRow(row) {
    var mid = String((row && row.mappingId) || '').trim();
    var m = mappingById(mid);
    if (!m || !Array.isArray(m.agentBindings)) return;
    var sid = String((row && row.slotId) || '').trim();
    var aid = String((row && row.actionId) || '').trim();
    var phrase = String((row && row.binds && row.binds.key) || '')
      .replace(/^「/, '')
      .replace(/」$/, '')
      .trim();
    var inst = '';
    var key = String((row && row.key) || '');
    var parts = key.split(':');
    if (parts.length >= 3) inst = parts.slice(2).join(':');
    m.agentBindings = m.agentBindings.filter(function (b) {
      if (!b || String(b.triggerType || '') !== 'voice') return true;
      if (inst && String(b.actionInstanceId || '').trim() === inst) return false;
      if (sid && String(b.slotId || '').trim() === sid) {
        if (!phrase || String(b.triggerBinding || '').trim() === phrase) return false;
      }
      if (!sid && aid && String(b.actionId || '').trim() === aid) {
        if (!phrase || String(b.triggerBinding || '').trim() === phrase) return false;
      }
      return true;
    });
    persistSceneDock('scene-dock-del-phrase');
    paint();
  }

  function canDeleteRow(row) {
    return !!(row && String(row.mappingId || '').trim());
  }

  function deleteSceneRow(row) {
    var mid = String((row && row.mappingId) || '').trim();
    if (!mid) return;
    if (row && row.kind === 'voicePhrase') {
      deleteVoicePhraseRow(row);
      return;
    }
    var anchor = mappingById(state.mappingId);
    var m = mappingById(mid);
    // Habit itself: clear this scheme (don't trash the whole Cursor scenario).
    if (anchor && mid === String(anchor.id || '')) {
      clearHabitScheme(row, m || anchor);
      persistSceneDock('scene-dock-clear');
      paint();
      return;
    }
    var picker = global.OneToneKeysChannelCommandPicker;
    if (row && row.kind === 'customKey' && picker && typeof picker.deleteCustomKeyMatch === 'function') {
      try {
        picker.deleteCustomKeyMatch(mid);
      } catch (_) {}
      return;
    }
    var shared = global.OneToneHabitShared;
    if (shared && typeof shared.deleteMapping === 'function') {
      try {
        shared.deleteMapping(mid);
      } catch (_) {}
    } else {
      try {
        var cfg =
          global.OneToneState && global.OneToneState.state && global.OneToneState.state.config
            ? global.OneToneState.state.config
            : null;
        if (cfg && Array.isArray(cfg.mappings)) {
          cfg.mappings = cfg.mappings.filter(function (x) {
            return x && String(x.id) !== mid;
          });
        }
        persistSceneDock('scene-dock-del');
      } catch (_) {}
    }
    if (String(state.mappingId || '') === mid) {
      var sel = selectedMapping();
      state.mappingId = sel && isAppScenario(sel) ? String(sel.id || '') : '';
    }
    paint();
  }

  function reorderAppRows(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    var anchor = mappingById(state.mappingId);
    if (!anchor) return;
    var rows = sortRowsByDockOrder(filterRowsForChannel(buildRows(anchor)), anchor);
    var from = -1;
    var to = -1;
    var i;
    for (i = 0; i < rows.length; i++) {
      if (rows[i].key === fromKey) from = i;
      if (rows[i].key === toKey) to = i;
    }
    if (from < 0 || to < 0 || from === to) return;
    var moved = rows.splice(from, 1)[0];
    rows.splice(to, 0, moved);
    saveDockOrder(anchor, rows);
    // Also keep mapping.order aligned for peer mappings (keys + voice).
    var rank = {};
    var seen = {};
    var orderIdx = 0;
    for (i = 0; i < rows.length; i++) {
      var mid = String(rows[i].mappingId || '');
      if (!mid || seen[mid]) continue;
      seen[mid] = 1;
      rank[mid] = orderIdx++;
    }
    var cfg =
      global.OneToneState && global.OneToneState.state && global.OneToneState.state.config
        ? global.OneToneState.state.config
        : null;
    if (cfg && Array.isArray(cfg.mappings)) {
      var appId = String(anchor.appTargetId || '').trim();
      for (i = 0; i < cfg.mappings.length; i++) {
        var mm = cfg.mappings[i];
        if (!mm || String(mm.appTargetId || '').trim() !== appId) continue;
        if (rank[String(mm.id)] != null) mm.order = rank[String(mm.id)];
      }
    }
    paint();
  }

  function globalWakeOptInOn() {
    try {
      var cfg =
        global.OneToneState && global.OneToneState.state && global.OneToneState.state.config
          ? global.OneToneState.state.config
          : {};
      return !!cfg.voiceWakeListeningOptIn;
    } catch (_) {
      return false;
    }
  }

  function wakePhrasesForRow(a) {
    if (!a) return [];
    if (a.kind === 'recognition') {
      try {
        var Wake = global.OneToneVoiceWake;
        if (Wake && typeof Wake.currentWakePhraseList === 'function') {
          return (Wake.currentWakePhraseList() || []).filter(Boolean);
        }
      } catch (_) {}
      var sm = mappingById(a.mappingId);
      var ov = sm && sm.voiceOverride && Array.isArray(sm.voiceOverride.wakePhrases)
        ? sm.voiceOverride.wakePhrases
        : [];
      return ov.map(function (p) {
        return String(p || '').trim();
      }).filter(Boolean);
    }
    if (a.kind === 'voicePhrase') {
      var line = String((a.binds && a.binds.key) || '').trim();
      var m = line.match(/^「(.+)」$/);
      if (m) return [m[1]];
      if (line) return [line];
      var peer = mappingById(a.mappingId);
      var list = peer && Array.isArray(peer.agentBindings) ? peer.agentBindings : [];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var b = list[i];
        if (!b || String(b.triggerType || '') !== 'voice') continue;
        if (String(b.slotId || '') !== String(a.slotId || '') && String(b.actionId || '') !== String(a.actionId || '')) {
          continue;
        }
        var ph = String(b.triggerBinding || '').trim();
        if (ph) out.push(ph);
      }
      return out;
    }
    return [];
  }

  function firstPhraseFromLists(lists, fallback) {
    var lang =
      global.OneToneI18n && global.OneToneI18n.getLang ? global.OneToneI18n.getLang() : 'zh';
    var arr = lists ? (lang === 'en' ? lists.en : lists.zh) : null;
    if (Array.isArray(arr)) {
      for (var i = 0; i < arr.length; i++) {
        var p = String(arr[i] || '').trim();
        if (p) return p;
      }
    }
    return fallback;
  }

  function finishPhraseBundle() {
    var End = global.OneToneVoiceEnd;
    return {
      send: firstPhraseFromLists(
        End && typeof End.currentSendPhraseLists === 'function' ? End.currentSendPhraseLists() : null,
        '发送'
      ),
      keep: firstPhraseFromLists(
        End && typeof End.currentEndPhraseLists === 'function' ? End.currentEndPhraseLists() : null,
        '结束输入'
      ),
      discard: firstPhraseFromLists(
        End && typeof End.currentCancelPhraseLists === 'function'
          ? End.currentCancelPhraseLists()
          : null,
        '取消输入'
      )
    };
  }

  function openVoiceActivationScheme() {
    try {
      if (global.OneToneVoicePageState && typeof global.OneToneVoicePageState.setStep === 'function') {
        global.OneToneVoicePageState.setStep('finish');
      }
    } catch (_) {}
    setTimeout(function () {
      var target =
        $('voiceImeStripWrap') ||
        $('imePresetStripVoice') ||
        $('voiceFinishCard') ||
        $('voiceSettingsRecognizeBody');
      if (target && target.scrollIntoView) {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } catch (_) {}
      }
    }, 0);
  }

  function openFinishPhraseEdit(outcome) {
    outcome = outcome === 'send' || outcome === 'discard' ? outcome : 'keep';
    try {
      if (global.OneToneVoicePageState && typeof global.OneToneVoicePageState.setStep === 'function') {
        global.OneToneVoicePageState.setStep('finish');
      }
    } catch (_) {}
    setTimeout(function () {
      var edit =
        document.querySelector &&
        document.querySelector('.voice-finish-outcome-edit[data-finish-edit="' + outcome + '"]');
      if (edit && typeof edit.click === 'function') edit.click();
    }, 0);
  }

  function voiceWakeExtrasHtml(a) {
    if (channelKind() !== 'voice' || !a) return '';
    if (a.kind !== 'recognition' && a.kind !== 'voicePhrase') return '';
    var phrases = wakePhrasesForRow(a);
    var on = globalWakeOptInOn();
    var primary = phrases.length ? String(phrases[0]) : '';
    var extra = Math.max(0, phrases.length - 1);
    var finish = a.kind === 'recognition' ? finishPhraseBundle() : null;
    var chips = phrases
      .map(function (p, idx) {
        return (
          '<button type="button" class="keys-scene-actions__wake-chip' +
          (idx === 0 ? ' is-primary' : '') +
          '" data-wake-phrase="' +
          esc(p) +
          '" title="' +
          esc(t('voiceWakePhraseEditLink', '不对就改')) +
          '">' +
          esc(p) +
          '</button>'
        );
      })
      .join('');
    var finishChips = finish
      ? '<div class="keys-scene-actions__wake-sec">' +
        '<span class="keys-scene-actions__wake-sec-lbl">' +
        esc(t('voiceDockFinishSec', '说完')) +
        '</span>' +
        '<div class="keys-scene-actions__wake-chips">' +
        '<button type="button" class="keys-scene-actions__wake-chip keys-scene-actions__wake-chip--finish" data-finish-edit="send" title="' +
        esc(t('voiceFinishEditLink', '编辑')) +
        '">「' +
        esc(finish.send) +
        '」</button>' +
        '<button type="button" class="keys-scene-actions__wake-chip keys-scene-actions__wake-chip--finish" data-finish-edit="keep" title="' +
        esc(t('voiceFinishEditLink', '编辑')) +
        '">「' +
        esc(finish.keep) +
        '」</button>' +
        '<button type="button" class="keys-scene-actions__wake-chip keys-scene-actions__wake-chip--finish is-danger" data-finish-edit="discard" title="' +
        esc(t('voiceFinishEditLink', '编辑')) +
        '">「' +
        esc(finish.discard) +
        '」</button>' +
        '</div></div>'
      : '';
    var activationLink =
      a.kind === 'recognition'
        ? '<button type="button" class="keys-scene-actions__wake-link" data-wake-activation="1">' +
          esc(t('voiceDockWakeActivation', '改听写方式 →')) +
          '</button>'
        : '';
    var sumLbl = primary
      ? esc(primary) + (extra ? ' · +' + extra : '') + (finish ? ' · 说完' : '')
      : esc(t('voiceDockWakeAdd', '＋ 口令'));
    return (
      '<div class="keys-scene-actions__wake" data-wake-card="' +
      esc(a.key) +
      '">' +
      '<div class="keys-scene-actions__wake-row">' +
      '<details class="keys-scene-actions__wake-fold">' +
      '<summary class="keys-scene-actions__wake-sum">' +
      '<span class="keys-scene-actions__wake-sum-lbl">' +
      sumLbl +
      '</span>' +
      '</summary>' +
      '<div class="keys-scene-actions__wake-body">' +
      '<div class="keys-scene-actions__wake-sec">' +
      '<span class="keys-scene-actions__wake-sec-lbl">' +
      esc(t('voiceDockWakeSec', '激活')) +
      '</span>' +
      '<div class="keys-scene-actions__wake-chips">' +
      chips +
      '<button type="button" class="keys-scene-actions__wake-add" data-wake-add="1">' +
      esc(t('voiceDockWakeAdd', '＋ 口令')) +
      '</button>' +
      '</div></div>' +
      finishChips +
      '</div>' +
      '</details>' +
      '<button type="button" class="toggle-switch keys-scene-actions__wake-toggle' +
      (on ? ' is-on' : '') +
      '" role="switch" aria-checked="' +
      (on ? 'true' : 'false') +
      '" data-wake-optin="1" title="' +
      esc(t('voiceDockWakeOptIn', '口令唤醒')) +
      '" aria-label="' +
      esc(t('voiceDockWakeOptIn', '口令唤醒')) +
      '"></button>' +
      '</div>' +
      activationLink +
      '</div>'
    );
  }

  function clickHidden(id) {
    var el = $(id);
    if (el && typeof el.click === 'function') el.click();
  }

  function ensureGlobalWakeOptInFromCard() {
    var cfg =
      global.OneToneState && global.OneToneState.state && global.OneToneState.state.config
        ? global.OneToneState.state.config
        : null;
    if (!cfg) return;
    if (cfg.voiceWakeListeningOptIn) {
      // Toggle off via the shared control.
      clickHidden('voiceWakeListeningOptInToggle');
      paint();
      return;
    }
    clickHidden('voiceWakeListeningOptInToggle');
    paint();
  }

  function paintDir(rows, host) {
    host = host || activeHost();
    var dirHost = $(host.dir);
    if (!dirHost) return;
    var emptyHint =
      channelKind() === 'voice'
        ? t(
            'keysSceneActionsEmptyVoice',
            '还没有语音动作 · 点下方新建，或到「我的习惯」统管各通道'
          )
        : t('keysSceneActionsEmptyKeys', '还没有动作 · 点下方新建');
    var canDrag = rows.length > 1;
    var voice = channelKind() === 'voice';
    var list =
      !rows.length
        ? '<p class="keys-scene-actions__empty">' +
          esc(emptyHint) +
          '</p>' +
          '<button type="button" class="keys-scene-actions__habit-link" data-habit-hub="1">' +
          esc(t('keysSceneActionsHabitLink', '在「我的习惯」查看全部通道 →')) +
          '</button>'
        : '<div class="keys-scene-actions__grp" data-group="input">' +
          '<div class="keys-scene-actions__grp-h">' +
          esc(
            voice
              ? t('keysSceneActionsGroupVoice', '语音')
              : t('keysSceneActionsTitle', '本场景动作')
          ) +
          '</div>' +
          rows
            .map(function (a) {
              var v = (a.binds && a.binds.key) || '';
              // Recognition: IME chip only in trail (bottom). Don't also paint ime name as subtitle.
              if (a.kind === 'recognition' && a.ime && a.ime.name && v === String(a.ime.name)) {
                v = '';
              }
              var trail = a.ime ? imeBadgeHtml(a.ime) : '';
              var on = String(a.mappingId || '') === String(state.mappingId || '');
              var delLbl = t('keysSceneActionsDelete', '删除');
              var dragLbl = t('keysSceneActionsDrag', '拖动排序');
              var wake = voice ? voiceWakeExtrasHtml(a) : '';
              var mainInner =
                '<button type="button" class="keys-scene-actions__dir-main" data-jump="' +
                esc(a.key) +
                '" title="' +
                esc(t('keysSceneActionsEditHint', '点击编辑')) +
                '">' +
                '<span class="keys-scene-actions__body">' +
                '<span class="keys-scene-actions__n">' +
                esc(a.label) +
                '</span>' +
                (v
                  ? '<span class="keys-scene-actions__s' +
                    (a.unset ? '' : ' is-ok') +
                    '">' +
                    esc(v) +
                    '</span>'
                  : '') +
                (trail
                  ? '<span class="keys-scene-actions__trail keys-scene-actions__trail--foot">' +
                    trail +
                    '</span>'
                  : '') +
                '</span>' +
                '<span class="keys-scene-actions__dot' +
                (a.unset ? ' is-off' : '') +
                '" aria-hidden="true"></span>' +
                '</button>';
              var mid = wake
                ? '<div class="keys-scene-actions__dir-stack">' + mainInner + wake + '</div>'
                : mainInner;
              return (
                '<div class="keys-scene-actions__dir-item' +
                (a.unset ? ' is-unset' : '') +
                (on ? ' is-active' : '') +
                (wake ? ' has-wake' : '') +
                '" role="listitem" draggable="' +
                (canDrag ? 'true' : 'false') +
                '" data-row-key="' +
                esc(a.key) +
                '">' +
                '<span class="keys-scene-actions__drag' +
                (canDrag ? '' : ' is-disabled') +
                '" title="' +
                esc(dragLbl) +
                '" aria-hidden="true">⋮⋮</span>' +
                mid +
                '<button type="button" class="keys-scene-actions__dir-del" data-del="' +
                esc(a.mappingId) +
                '" data-del-key="' +
                esc(a.key) +
                '" title="' +
                esc(delLbl) +
                '" aria-label="' +
                esc(delLbl) +
                '">×</button>' +
                '</div>'
              );
            })
            .join('') +
          '</div>' +
          '<button type="button" class="keys-scene-actions__habit-link" data-habit-hub="1">' +
          esc(t('keysSceneActionsHabitLink', '在「我的习惯」查看全部通道 →')) +
          '</button>';
    dirHost.innerHTML = list;
    var addBtn = $(host.add);
    if (addBtn) {
      addBtn.textContent = '＋ ' + t('keysSceneActionsAdd', '新建动作');
    }
  }

  function paint() {
    var m = mappingById(state.mappingId);
    if (!m || !isAppScenario(m)) {
      setVisible(false);
      return;
    }
    setVisible(true);
    var host = activeHost();
    var rows = sortRowsByDockOrder(filterRowsForChannel(buildRows(m)), m);
    paintChrome(m, host);
    paintDir(rows, host);
  }

  function openHabitHub() {
    try {
      if (global.OneToneSettingsDrawer && typeof global.OneToneSettingsDrawer.open === 'function') {
        global.OneToneSettingsDrawer.open({ panel: 'habits' });
        return;
      }
    } catch (_) {}
    try {
      var hooks = global.__vp_bootstrap_hooks__ || {};
      if (typeof hooks.setSettingsPanel === 'function') hooks.setSettingsPanel('habits');
    } catch (_) {}
  }

  function onPanelClick(e) {
    var tEl = e.target;
    if (!tEl) return;
    if (tEl.closest && tEl.closest('[data-habit-hub]')) {
      e.preventDefault();
      openHabitHub();
      return;
    }
    if (tEl.closest && tEl.closest('[data-add]')) {
      e.preventDefault();
      startNewAction();
      return;
    }
    var wakeOpt = tEl.closest && tEl.closest('[data-wake-optin]');
    if (wakeOpt) {
      e.preventDefault();
      e.stopPropagation();
      ensureGlobalWakeOptInFromCard();
      return;
    }
    var wakeAdd = tEl.closest && tEl.closest('[data-wake-add]');
    if (wakeAdd) {
      e.preventDefault();
      e.stopPropagation();
      clickHidden('btnVoiceWakePoolAdd');
      return;
    }
    var finishEdit = tEl.closest && tEl.closest('[data-finish-edit]');
    if (finishEdit) {
      e.preventDefault();
      e.stopPropagation();
      openFinishPhraseEdit(finishEdit.getAttribute('data-finish-edit') || 'keep');
      return;
    }
    var wakePhrase = tEl.closest && tEl.closest('[data-wake-phrase]');
    if (wakePhrase) {
      e.preventDefault();
      e.stopPropagation();
      var phrase = String(wakePhrase.getAttribute('data-wake-phrase') || '').trim();
      var Wake = global.OneToneVoiceWake;
      if (phrase && Wake && typeof Wake.replacePrimaryWakePhrase === 'function') {
        try {
          Promise.resolve(Wake.replacePrimaryWakePhrase(phrase)).then(function () {
            paint();
          });
        } catch (_) {
          clickHidden('btnVoiceWakePhraseEditLink');
        }
      } else {
        clickHidden('btnVoiceWakePhraseEditLink');
      }
      return;
    }
    var wakeAct = tEl.closest && tEl.closest('[data-wake-activation]');
    if (wakeAct) {
      e.preventDefault();
      e.stopPropagation();
      openVoiceActivationScheme();
      return;
    }
    var wakeKeys = tEl.closest && tEl.closest('[data-wake-keys-target]');
    if (wakeKeys) {
      e.preventDefault();
      e.stopPropagation();
      openVoiceActivationScheme();
      return;
    }
    var delBtn = tEl.closest && tEl.closest('[data-del]');
    if (delBtn) {
      e.preventDefault();
      e.stopPropagation();
      var m = mappingById(state.mappingId);
      var rows = m ? filterRowsForChannel(buildRows(m)) : [];
      var delKey = delBtn.getAttribute('data-del-key') || '';
      var row = delKey ? findRow(rows, delKey) : null;
      if (!row) {
        var delId = String(delBtn.getAttribute('data-del') || '').trim();
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i].mappingId || '') === delId) {
            row = rows[i];
            break;
          }
        }
      }
      if (row && canDeleteRow(row)) deleteSceneRow(row);
      return;
    }
    var jumpBtn = tEl.closest && tEl.closest('[data-jump]');
    if (jumpBtn) {
      e.preventDefault();
      var mJump = mappingById(state.mappingId);
      var jumpRows = mJump ? filterRowsForChannel(buildRows(mJump)) : [];
      var jumpRow = findRow(jumpRows, jumpBtn.getAttribute('data-jump'));
      jumpToEdit(jumpRow || { kind: 'recognition', key: 'pushToTalk' });
    }
  }

  function bindOnce() {
    if (state.bound) return;
    state.bound = true;
    var i;
    for (i = 0; i < HOSTS.length; i++) {
      var panel = $(HOSTS[i].panel);
      if (panel && panel.addEventListener) panel.addEventListener('click', onPanelClick);
      var dir = $(HOSTS[i].dir);
      if (dir && dir.addEventListener) {
        dir.addEventListener('dragstart', function (e) {
          var item = e.target && e.target.closest && e.target.closest('[data-row-key]');
          if (!item || item.getAttribute('draggable') !== 'true') return;
          var key = item.getAttribute('data-row-key') || '';
          state.dragKey = key;
          try {
            e.dataTransfer.setData('text/plain', key);
            e.dataTransfer.effectAllowed = 'move';
          } catch (_) {}
          item.classList.add('is-dragging');
        });
        dir.addEventListener('dragend', function (e) {
          state.dragKey = '';
          var item = e.target && e.target.closest && e.target.closest('[data-row-key]');
          if (item) item.classList.remove('is-dragging');
          dir.querySelectorAll('.is-drag-over').forEach(function (el) {
            el.classList.remove('is-drag-over');
          });
        });
        dir.addEventListener('dragover', function (e) {
          var item = e.target && e.target.closest && e.target.closest('[data-row-key]');
          if (!item || !state.dragKey) return;
          e.preventDefault();
          try {
            e.dataTransfer.dropEffect = 'move';
          } catch (_) {}
          dir.querySelectorAll('.is-drag-over').forEach(function (el) {
            if (el !== item) el.classList.remove('is-drag-over');
          });
          item.classList.add('is-drag-over');
        });
        dir.addEventListener('drop', function (e) {
          var item = e.target && e.target.closest && e.target.closest('[data-row-key]');
          if (!item) return;
          e.preventDefault();
          var toKey = item.getAttribute('data-row-key') || '';
          var fromKey = state.dragKey || '';
          try {
            fromKey = e.dataTransfer.getData('text/plain') || fromKey;
          } catch (_) {}
          item.classList.remove('is-drag-over');
          reorderAppRows(fromKey, toKey);
        });
      }
    }
  }

  function render(mapping) {
    bindOnce();
    var m = mapping || selectedMapping();
    if (!m || !isAppScenario(m)) {
      state.mappingId = '';
      setVisible(false);
      return;
    }
    state.mappingId = String(m.id || '').trim();
    paint();
  }

  function refresh() {
    if (!state.mappingId) {
      render(selectedMapping());
      return;
    }
    paint();
  }

  global.OneToneKeysSceneActionsPanel = {
    render: render,
    refresh: refresh,
    jumpToEdit: jumpToEdit,
    startNewAction: startNewAction,
    buildRows: buildRows,
    isVisibleFor: isAppScenario
  };
})(typeof window !== 'undefined' ? window : globalThis);
