/**
 * Voice Lab — Mac WorkbenchVoiceLab shell under settingsPanelVoiceLab.
 * Prefixed ids only; does not touch classic voiceWake.
 * Gate pane arms Soft Pad oral listen via oralCommandScheme + cmd_voice_command_session_toggle.
 */
(function (global) {
  'use strict';

  var paneId = 'gate';
  var dirty = false;
  var bound = false;
  var oralRecordPoll = 0;

  var PANE_LABELS = {
    gate: '口令进门 常驻唤醒',
    dictation: '听写 口令 输入法 收尾',
    'oral-cont': '口头命令 注入',
    'oral-fix': '口头命令 注入',
    'oral-send': '口头命令 注入',
  };

  var LIVE_COPY = {
    gate: '<strong>空闲 · 待口令</strong><br/>命令键 —<br/>常驻唤醒 · 关',
    dictation: '<strong>听写会话</strong><br/>口令「小助手」<br/>IME · 讯飞',
    'oral-cont': '<strong>命令窗</strong><br/>可说：继续',
    'oral-fix': '<strong>命令窗</strong><br/>可说：修这个',
    'oral-send': '<strong>命令窗</strong><br/>可说：发送',
  };

  var PILL_TEXT = {
    gate: '空闲 · 待口令',
    dictation: '可开听写',
    'oral-cont': '可说 · 继续',
    'oral-fix': '可说 · 修这个',
    'oral-send': '可说 · 发送',
  };

  var FINISH_META = {
    confirm: {
      mid: '字留下',
      tail: '你按回车',
      kind: '结束词',
      why: '配合「留下自查」',
      hint: '当前默认不靠嘴发送；切换到「说了才发」后可用发送词。',
      rail: '留下',
    },
    phrase: {
      mid: '等发送词',
      tail: '说出才发',
      kind: '发送词',
      why: '配合「说了才发」',
      hint: '只有说出发送词才会发出去；结束词只会停下。',
      rail: '说了才发',
    },
    auto: {
      mid: '短暂停顿',
      tail: '自动发送',
      kind: '发送词',
      why: '配合「停顿就发」',
      hint: '自然停顿后自动发送。',
      rail: '停顿就发',
    },
  };

  function t(key, fallback) {
    if (global.OneToneI18n && typeof global.OneToneI18n.t === 'function') {
      var v = global.OneToneI18n.t(key);
      if (v && v !== key) return v;
    }
    return fallback != null ? fallback : key;
  }

  function $(id) {
    return global.OneToneDom && global.OneToneDom.$
      ? global.OneToneDom.$(id)
      : document.getElementById(id);
  }

  function root() {
    return $('settingsPanelVoiceLab');
  }

  function invoke(cmd, args) {
    if (global.OneToneIpc && typeof global.OneToneIpc.invoke === 'function') {
      return global.OneToneIpc.invoke(cmd, args || {});
    }
    if (typeof global.__vp_invoke__ === 'function') {
      return global.__vp_invoke__(cmd, args || {});
    }
    return Promise.reject(new Error('invoke unavailable'));
  }

  function toast(msg) {
    try {
      if (global.OneToneAppToast && typeof global.OneToneAppToast.show === 'function') {
        global.OneToneAppToast.show(msg, 'scheme');
        return;
      }
    } catch (_) {}
    try {
      if (global.OneToneApp && typeof global.OneToneApp.toast === 'function') {
        global.OneToneApp.toast(msg);
      }
    } catch (_) {}
  }

  function cfg() {
    var st = global.OneToneState && global.OneToneState.state;
    return (st && st.config) || {};
  }

  function selectedMappingId() {
    var st = global.OneToneState && global.OneToneState.state;
    var id = String((st && st.selectedMappingId) || '').trim();
    if (id) return id;
    return String(cfg().activeSceneId || '').trim();
  }

  function activeMapping() {
    var id = selectedMappingId();
    var core = global.OneToneMappingCore;
    if (core && typeof core.byId === 'function' && id) {
      var hit = core.byId(id);
      if (hit) return hit;
    }
    var maps = cfg().mappings || [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && maps[i].id === id) return maps[i];
    }
    return maps[0] || null;
  }

  function habitName(m) {
    if (!m) return t('homeWbChipUniversal', '通用');
    try {
      if (global.OneToneHabitProfile && typeof global.OneToneHabitProfile.habitDisplayName === 'function') {
        var n = global.OneToneHabitProfile.habitDisplayName(m);
        if (n) return n;
      }
    } catch (_) {}
    return String(m.group || m.label || m.id || '—').trim() || '—';
  }

  function escAttr(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function mappingAppId(m) {
    return String((m && (m.appTargetId || m.app_target_id)) || '').trim();
  }

  function appIconSrc(appId) {
    if (!appId) return '';
    try {
      var rules = global.OneToneAppBehaviorRules;
      if (rules && typeof rules.iconForApp === 'function') {
        var fromRules = String(rules.iconForApp(appId) || '').trim();
        if (fromRules) return fromRules;
      }
    } catch (_) {}
    try {
      var presets = global.OneToneAppTargetPresets;
      var p = presets && presets.presetById ? presets.presetById(appId) : null;
      if (p && p.icon) return String(p.icon);
    } catch (_) {}
    return '';
  }

  function foregroundLabel() {
    try {
      var nav = global.OneToneHabitLayerNav;
      var fg = null;
      if (nav && typeof nav.getForegroundIdentity === 'function') fg = nav.getForegroundIdentity();
      var uiState = global.OneToneState && global.OneToneState.ui;
      if (!fg && uiState && uiState.habitHubFgIdentity) fg = uiState.habitHubFgIdentity;
      if (!fg) {
        var rt = global.OneToneRuntimeHabitControl;
        if (rt && typeof rt.foregroundIdentity === 'function') fg = rt.foregroundIdentity();
      }
      if (!fg) return '';
      var appId = String(
        fg.matchedPresetAppId || fg.matched_preset_app_id || fg.appId || fg.appTargetId || ''
      ).trim();
      var rules = global.OneToneAppBehaviorRules;
      if (appId && rules && typeof rules.appDisplayName === 'function') {
        var named = String(rules.appDisplayName(appId) || '').trim();
        if (named) return named;
      }
      if (appId) return appId;
      return String(fg.windowTitle || fg.window_title || fg.exeName || fg.exe_name || '').trim();
    } catch (_) {
      return '';
    }
  }

  function editAligned(m) {
    try {
      var Banner = global.OneToneHabitChannelEditBanner;
      if (Banner && typeof Banner.resolveEditVsRuntime === 'function') {
        var vs = Banner.resolveEditVsRuntime();
        if (vs && typeof vs.aligned === 'boolean') return !!vs.aligned;
      }
    } catch (_) {}
    var editId = String((m && m.id) || '').trim();
    var runtimeId = String(cfg().activeSceneId || '').trim();
    return !!(editId && runtimeId && editId === runtimeId);
  }

  function syncSceneChrome() {
    var m = activeMapping();
    var name = habitName(m);
    var appId = mappingAppId(m);
    var appHost = $('voiceLabSceneApp');
    if (appHost) {
      var src = appIconSrc(appId);
      if (src) {
        appHost.innerHTML = '<img src="' + escAttr(src) + '" alt="" decoding="async" />';
        appHost.title = name;
      } else {
        var letter = (name || '通').charAt(0);
        appHost.innerHTML =
          '<span class="voice-lab-scene-app-fallback" aria-hidden="true">' + escAttr(letter) + '</span>';
        appHost.title = name;
      }
    }

    var editing = $('voiceLabSceneEditing');
    if (editing) {
      var tpl = t('settingsContextEditing', '{channel} / 正在编辑：{name}');
      editing.textContent = tpl
        .replace('{channel}', t('settingsNavVoiceLab', '语音'))
        .replace('{name}', name);
    }

    var fg = foregroundLabel();
    var fgEl = $('voiceLabSceneFg');
    if (fgEl) {
      if (fg) {
        fgEl.hidden = false;
        fgEl.textContent = t('habitEditBannerFg', '前台：{name}').replace('{name}', fg);
      } else {
        fgEl.hidden = true;
        fgEl.textContent = '';
      }
    }

    var aligned = editAligned(m);
    var alignedEl = $('voiceLabSceneAligned');
    if (alignedEl) {
      alignedEl.hidden = !aligned;
      if (aligned) alignedEl.textContent = t('habitEditBannerAligned', '已与前台一致');
    }

    var hint = $('voiceLabSceneHint');
    if (hint) {
      hint.textContent = appId
        ? t('habitScenarioContextEditing', '正在编辑：{name} 场景。修改只作用于当前应用场景，不影响通用设置。').replace(
            '{name}',
            name
          )
        : t('habitHubContextGlobalHint', '此处修改会影响所有未单独覆盖的应用场景');
    }
  }

  function oralKeyRaw(m) {
    var Oral = global.OneToneOralCommandUi;
    if (Oral && typeof Oral.oralTriggerKeyRaw === 'function') {
      return String(Oral.oralTriggerKeyRaw(m) || '').trim();
    }
    return String((m && m.oralCommandScheme && m.oralCommandScheme.triggerKey) || '').trim();
  }

  function oralKeyLabel(m) {
    var Oral = global.OneToneOralCommandUi;
    if (Oral && typeof Oral.oralTriggerKeyLabel === 'function') {
      return String(Oral.oralTriggerKeyLabel(m) || '').trim();
    }
    return oralKeyRaw(m);
  }

  function voiceAssistOn() {
    return cfg().voiceAssistEnabled !== false;
  }

  function keylessOn() {
    var K = global.OneToneVoiceKeyless;
    if (K && typeof K.isOn === 'function') return !!K.isOn();
    var c = cfg();
    return String(c.voiceActivation || '') === 'wakeOrPushToTalk' || !!c.voiceWakeListeningOptIn;
  }

  function setSw(el, on) {
    if (!el) return;
    el.classList.toggle('off', !on);
  }

  function openPanel(panel) {
    try {
      if (global.OneToneSettingsDrawer && typeof global.OneToneSettingsDrawer.open === 'function') {
        global.OneToneSettingsDrawer.open({ panel: panel });
        return;
      }
    } catch (_) {}
    try {
      if (global.OneToneSettingsDrawer && typeof global.OneToneSettingsDrawer.setPanel === 'function') {
        global.OneToneSettingsDrawer.setPanel(panel);
      }
    } catch (_) {}
  }

  function markDirty() {
    dirty = true;
    var btn = $('voiceLabBtnSave');
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('voiceLabSaveDirty', '保存到习惯');
    }
  }

  function markClean() {
    dirty = false;
    var btn = $('voiceLabBtnSave');
    if (btn) {
      btn.disabled = true;
      btn.textContent = t('voiceLabSaved', '已保存');
    }
  }

  function syncRailDictSub() {
    var railSub = document.querySelector('#voiceLabRailDict .s');
    if (!railSub) return;
    var modeBtn = document.querySelector('#voiceLabOutputModeSegments [data-vl-output-mode].is-active');
    var mode = modeBtn ? modeBtn.getAttribute('data-vl-output-mode') : 'confirm';
    var meta = FINISH_META[mode] || FINISH_META.confirm;
    var chord = $('voiceLabSettingsTargetKeyChord');
    var selected = document.querySelector('#voiceLabImePresetStrip .ime-preset-item.is-selected');
    var name = selected
      ? selected.getAttribute('title') || selected.getAttribute('data-ime-id') || '讯飞'
      : '讯飞';
    var key = chord ? String(chord.textContent || '').trim() : 'F2';
    railSub.textContent = key + ' · ' + name + ' · ' + meta.rail;
  }

  function applyFinishMode(mode) {
    mode = String(mode || 'confirm');
    if (!FINISH_META[mode]) mode = 'confirm';
    var segs = document.querySelectorAll('#voiceLabOutputModeSegments [data-vl-output-mode]');
    for (var i = 0; i < segs.length; i++) {
      var on = segs[i].getAttribute('data-vl-output-mode') === mode;
      segs[i].classList.toggle('is-active', on);
      segs[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    var meta = FINISH_META[mode];
    var mid = $('voiceLabFinishCausalMid');
    var tail = $('voiceLabFinishCausalTail');
    var kind = $('voiceLabFinishHabitKind');
    var why = $('voiceLabFinishHabitWhyBadge');
    var hint = $('voiceLabFinishHabitHint');
    if (mid) mid.textContent = meta.mid;
    if (tail) tail.textContent = meta.tail;
    if (kind) kind.textContent = meta.kind;
    if (why) why.textContent = meta.why;
    if (hint) hint.textContent = meta.hint;
    syncRailDictSub();
  }

  var AIM_HINT = {
    auto: '自动点进聊天框再写；失败则取消',
    none: '假定焦点已在输入框，立刻写入',
    probe: '光标已在框里才填；未对准则跳过',
  };

  function currentAimStrategy() {
    var end = cfg().voiceEnd || {};
    var raw = String(end.inputAimStrategy || end.input_aim_strategy || 'auto')
      .trim()
      .toLowerCase();
    if (raw === 'none' || raw === 'probe' || raw === 'auto') return raw;
    return 'auto';
  }

  function agentBoxLabel(m) {
    var appId = mappingAppId(m).toLowerCase();
    var app = habitName(m);
    if (/cursor/.test(appId) || /cursor/i.test(app)) return 'Composer 输入框';
    if (/codex|chatgpt/.test(appId)) return 'Chat 输入框';
    if (/claude/.test(appId)) return 'Claude 输入框';
    if (/windsurf|trae|qoder|copilot|gemini|workbuddy|minimax/.test(appId)) {
      return '聊天输入框';
    }
    return appId ? '聊天输入框' : '目标输入框';
  }

  function aimDemoHtml(mode, boxLbl) {
    mode = mode === 'none' || mode === 'probe' ? mode : 'auto';
    var badge =
      mode === 'auto'
        ? t('voiceAimDemoBadgeAuto', '已写入 prompt')
        : mode === 'none'
          ? t('voiceAimDemoBadgeNone', '打进了代码区')
          : t('voiceAimDemoBadgeProbe', '未对准 · 已跳过');
    var badgeCls = mode === 'auto' ? 'is-ok' : 'is-warn';
    return (
      '<div class="voice-lab-aim-demo-head">' +
      '<span class="voice-lab-aim-demo-live">' +
      escAttr(t('voiceLabAimDemoLive', '正在演示')) +
      '</span></div>' +
      '<div class="voice-aim-demo voice-lab-aim-demo" data-vl-aim-demo data-mode="' +
      escAttr(mode) +
      '" style="--spot-x:78%;--spot-y:84%" aria-hidden="true">' +
      '<div class="voice-aim-demo__win">' +
      '<span class="voice-aim-demo__title">' +
      escAttr(t('voiceLabAimDemoWin', '目标窗口')) +
      '</span>' +
      '<div class="voice-aim-demo__code">fn main() {<br>&nbsp;&nbsp;// 编辑器<br>}</div>' +
      '<div class="voice-aim-demo__chat">' +
      '<span class="voice-aim-demo__caret"></span>' +
      '<span class="voice-aim-demo__type">继续</span>' +
      '<span class="voice-aim-demo__ph">' +
      escAttr(boxLbl) +
      '</span></div>' +
      '<span class="voice-aim-demo__type-wrong">继续</span></div>' +
      '<span class="voice-aim-demo__cursor"></span>' +
      '<span class="voice-aim-demo__badge ' +
      badgeCls +
      '" data-vl-aim-badge>' +
      escAttr(badge) +
      '</span></div>' +
      '<p class="voice-lab-aim-demo-foot">' +
      escAttr(
        mode === 'auto'
          ? t('voiceLabAimDemoFootAuto', '自动对准再写入。光点 = 落点；对不上就取消。')
          : mode === 'none'
            ? t('voiceLabAimDemoFootNone', '焦点在哪就打到哪。最快，但容易误写入编辑器。')
            : t('voiceLabAimDemoFootProbe', '只在已对准时填；未对准则跳过本轮。')
      ) +
      '</p>'
    );
  }

  function aimBlockHtml(m) {
    var mode = currentAimStrategy();
    var boxLbl = agentBoxLabel(m);
    var app = habitName(m);
    function seg(v, label) {
      return (
        '<button type="button" class="voice-lab-aim-seg' +
        (mode === v ? ' is-on' : '') +
        '" data-vl-aim="' +
        v +
        '" role="radio" aria-checked="' +
        (mode === v ? 'true' : 'false') +
        '">' +
        escAttr(label) +
        '</button>'
      );
    }
    return (
      '<div class="voice-lab-aim-head">' +
      '<span class="voice-lab-aim-lbl">' +
      escAttr(t('voicePromptColAim', '写入方式')) +
      ' · ' +
      escAttr(t('voiceLabAimShared', '本习惯共用')) +
      '</span>' +
      '<span class="voice-lab-aim-agent" data-vl-aim-agent>' +
      escAttr(app) +
      ' · ' +
      escAttr(boxLbl) +
      '</span></div>' +
      '<div class="voice-lab-aim-segs" role="radiogroup" aria-label="' +
      escAttr(t('voicePromptColAim', '写入方式')) +
      '">' +
      seg('auto', t('keysSeqImeAimFirst', '先对准，再填入')) +
      seg('none', t('voiceLabAimNone', '直接填入')) +
      seg('probe', t('voiceLabAimProbe', '只在已对准时填')) +
      '</div>' +
      '<p class="voice-lab-aim-hint" data-vl-aim-hint>' +
      escAttr(AIM_HINT[mode] || AIM_HINT.auto) +
      '</p>' +
      '<div class="voice-lab-aim-demo-wrap" data-vl-aim-demo-wrap>' +
      aimDemoHtml(mode, boxLbl) +
      '</div>'
    );
  }

  function restartAimDemos() {
    var panel = root();
    if (!panel) return;
    var demos = panel.querySelectorAll('[data-vl-aim-demo]');
    for (var i = 0; i < demos.length; i++) {
      var demo = demos[i];
      var mode = demo.getAttribute('data-mode') || 'auto';
      demo.removeAttribute('data-mode');
      void demo.offsetWidth;
      demo.setAttribute('data-mode', mode);
    }
  }

  function setAimStrategy(strategy) {
    strategy = String(strategy || 'auto').trim().toLowerCase();
    if (strategy !== 'auto' && strategy !== 'none' && strategy !== 'probe') strategy = 'auto';
    var st = global.OneToneState && global.OneToneState.state;
    if (!st || !st.config) return;
    if (!st.config.voiceEnd || typeof st.config.voiceEnd !== 'object') st.config.voiceEnd = {};
    st.config.voiceEnd.inputAimStrategy = strategy;
    st.config.voiceEnd.input_aim_strategy = strategy;
    var sel = $('voiceInputAimStrategy');
    if (sel) sel.value = strategy === 'probe' ? 'probe' : strategy;
    var radio = document.querySelector(
      'input[name="voiceInputAimStrategy"][value="' + strategy + '"]'
    );
    if (radio) radio.checked = true;
    var p = global.OneToneConfigPersist;
    if (p && p.saveAsync) p.saveAsync({ source: 'voice-lab-aim' });
    else if (p && p.save) p.save({ source: 'voice-lab-aim' });
    syncAimBlocks();
    markDirty();
  }

  function syncAimBlocks() {
    var panel = root();
    if (!panel) return;
    var m = activeMapping();
    var mode = currentAimStrategy();
    var hosts = panel.querySelectorAll('[data-vl-aim-host]');
    for (var i = 0; i < hosts.length; i++) {
      var host = hosts[i];
      host.innerHTML = aimBlockHtml(m);
      host.setAttribute('data-aim', mode);
    }
    // Restart demos on the visible pane only (cheap + avoids flicker).
    if (paneId === 'dictation' || String(paneId || '').indexOf('oral-') === 0) {
      requestAnimationFrame(restartAimDemos);
    }
  }

  function syncGateChrome() {
    var m = activeMapping();
    var raw = oralKeyRaw(m);
    var label = oralKeyLabel(m);
    var keycap = $('voiceLabOralKeycap');
    if (keycap) {
      keycap.textContent = label || t('voiceLabOralKeyEmpty', '未绑定');
      keycap.classList.toggle('is-empty', !raw);
    }
    var habitEl = $('voiceLabHabitName');
    if (habitEl) habitEl.textContent = habitName(m);
    syncSceneChrome();
    syncAimBlocks();

    var assist = voiceAssistOn();
    setSw($('voiceLabModeSw'), assist);
    var modeLab = $('voiceLabModeLab');
    if (modeLab) modeLab.textContent = assist ? '开' : '关';

    var wake = keylessOn();
    setSw($('voiceLabWakeSw'), wake);
    var bit = $('voiceLabStatusWakeBit');
    if (bit) bit.hidden = !wake;

    var railSub = document.querySelector('#voiceLabRailGate .s');
    if (railSub) {
      railSub.textContent = (label || '—') + ' · ' + (wake ? '醒开' : '醒关');
    }

    LIVE_COPY.gate =
      '<strong>空闲 · 待口令</strong><br/>命令键 ' +
      (label || t('voiceLabOralKeyEmpty', '未绑定')) +
      '<br/>常驻唤醒 · ' +
      (wake ? '开' : '关');
    if (paneId === 'gate') {
      var liveMeta = $('voiceLabLiveMeta');
      if (liveMeta) liveMeta.innerHTML = LIVE_COPY.gate;
    }
  }

  function parseSayLines(raw) {
    return String(raw || '')
      .split(/[\n、,，;；]+/)
      .map(function (s) {
        return String(s || '').trim();
      })
      .filter(Boolean);
  }

  function normalizeOralAfter(after) {
    after = String(after || 'confirm').trim();
    if (after === 'send') return 'auto';
    if (after === 'none') return 'confirm';
    if (after === 'confirm' || after === 'phrase' || after === 'auto') return after;
    return 'confirm';
  }

  function promptActionsForAfter(text, after) {
    var body = String(text || '');
    var mode = normalizeOralAfter(after);
    var acts = [{ type: 'text', value: body }];
    // 停顿就发：注入后立刻 Enter。留下 / 说了才发：只写入，发送走回车或口头「发送」。
    if (mode === 'auto') {
      var settle = Math.min(420, Math.max(80, body.length * 2 + 60));
      acts.push({ type: 'delay', ms: settle });
      acts.push({ type: 'key', value: 'Enter' });
    }
    return acts;
  }

  // Gate (口令) excluded — dictation already has finish card; oral session cards share this block.
  var SESSION_AFTER_PANES = ['oral-cont', 'oral-fix', 'oral-send'];
  var SESSION_AFTER_SOFT = {
    'oral-cont': 'soft:continue',
    'oral-send': 'soft:stopOrSend',
  };

  function oralAfterCausalHtml(after) {
    var mode = normalizeOralAfter(after);
    var meta = FINISH_META[mode] || FINISH_META.confirm;
    return (
      '<div class="voice-causal-finish" data-vl-oral-causal aria-live="polite">' +
      '<strong>' +
      escAttr(t('voiceLabOralCausalHead', '注入停下')) +
      '</strong><span class="arr" aria-hidden="true">→</span>' +
      '<span data-vl-oral-causal-mid>' +
      escAttr(meta.mid) +
      '</span><span class="arr" aria-hidden="true">→</span>' +
      '<span data-vl-oral-causal-tail>' +
      escAttr(meta.tail) +
      '</span></div>' +
      '<p class="voice-finish-habit-hint" data-vl-oral-after-hint>' +
      escAttr(meta.hint) +
      '</p>'
    );
  }

  function sessionAfterBlockHtml(after) {
    after = normalizeOralAfter(after);
    return (
      '<div class="voice-lab-field voice-lab-oral-after" data-vl-session-after="1">' +
      '<p class="voice-ime-step"><span class="n">2</span>' +
      escAttr(t('voiceLabOralAfterStep', '注入正文后')) +
      '</p>' +
      '<p class="voice-finish-sec-lbl">' +
      escAttr(t('voiceLabOralAfterLbl', '写后默认')) +
      '</p>' +
      '<div class="voice-finish-default-seg voice-output-modes" role="radiogroup" aria-label="' +
      escAttr(t('voiceLabOralAfterLbl', '写后默认')) +
      '">' +
      '<button type="button" class="voice-finish-seg' +
      (after === 'confirm' ? ' is-active is-recommended' : '') +
      '" data-vl-oral-after="confirm" role="radio" aria-checked="' +
      (after === 'confirm' ? 'true' : 'false') +
      '">' +
      '<span class="voice-finish-seg-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></span>' +
      '<span class="voice-finish-seg-t">' +
      escAttr(t('voiceOutputModeConfirm', '留下')) +
      '</span>' +
      '<span class="voice-finish-seg-s">' +
      escAttr(t('voiceOutputModeConfirmTag', '自查 · 按回车')) +
      '</span></button>' +
      '<button type="button" class="voice-finish-seg' +
      (after === 'phrase' ? ' is-active' : '') +
      '" data-vl-oral-after="phrase" role="radio" aria-checked="' +
      (after === 'phrase' ? 'true' : 'false') +
      '">' +
      '<span class="voice-finish-seg-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg></span>' +
      '<span class="voice-finish-seg-t">' +
      escAttr(t('voiceOutputModePhrase', '说了才发')) +
      '</span>' +
      '<span class="voice-finish-seg-s">' +
      escAttr(t('voiceOutputModePhraseTag', '要喊发送词')) +
      '</span></button>' +
      '<button type="button" class="voice-finish-seg' +
      (after === 'auto' ? ' is-active' : '') +
      '" data-vl-oral-after="auto" role="radio" aria-checked="' +
      (after === 'auto' ? 'true' : 'false') +
      '">' +
      '<span class="voice-finish-seg-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></span>' +
      '<span class="voice-finish-seg-t">' +
      escAttr(t('voiceOutputModeAuto', '停顿就发')) +
      '</span>' +
      '<span class="voice-finish-seg-s">' +
      escAttr(t('voiceOutputModeAutoTag', '全自动')) +
      '</span></button></div>' +
      oralAfterCausalHtml(after) +
      '</div>'
    );
  }

  function readSessionAfter(paneId) {
    var m = activeMapping();
    if (!m) return 'confirm';
    var softId = SESSION_AFTER_SOFT[paneId];
    if (softId && m.oralCommandScheme && m.oralCommandScheme.items) {
      var it = m.oralCommandScheme.items[softId];
      if (it && it.after) return normalizeOralAfter(it.after);
    }
    var lab = m.voiceLab && m.voiceLab.sessionAfter;
    if (lab && lab[paneId]) return normalizeOralAfter(lab[paneId]);
    return 'confirm';
  }

  function persistSessionAfter(paneId, after) {
    var m = activeMapping();
    if (!m || !paneId) return;
    after = normalizeOralAfter(after);
    var softId = SESSION_AFTER_SOFT[paneId];
    if (softId) {
      var Oral = global.OneToneOralCommandUi;
      if (Oral && typeof Oral.ensureOralScheme === 'function') {
        try {
          Oral.ensureOralScheme(m);
        } catch (_) {}
      }
      if (!m.oralCommandScheme || typeof m.oralCommandScheme !== 'object') {
        m.oralCommandScheme = { items: {}, triggerKey: '', activationMode: 'hold' };
      }
      if (!m.oralCommandScheme.items || typeof m.oralCommandScheme.items !== 'object') {
        m.oralCommandScheme.items = {};
      }
      var prev = m.oralCommandScheme.items[softId] || {};
      m.oralCommandScheme.items[softId] = Object.assign({}, prev, {
        enabled: prev.enabled !== false,
        after: after,
      });
      try {
        if (Oral && typeof Oral.persistOralScheme === 'function') {
          Oral.persistOralScheme(m, m.oralCommandScheme.items);
          return;
        }
      } catch (_) {}
    } else {
      if (!m.voiceLab || typeof m.voiceLab !== 'object') m.voiceLab = {};
      if (!m.voiceLab.sessionAfter || typeof m.voiceLab.sessionAfter !== 'object') {
        m.voiceLab.sessionAfter = {};
      }
      m.voiceLab.sessionAfter[paneId] = after;
    }
    try {
      var p = global.OneToneConfigPersist;
      if (p && typeof p.save === 'function') p.save({ source: 'voice-lab-session-after' });
    } catch (_) {}
  }

  function ensureSessionAfterBlocks() {
    var panel = root();
    if (!panel) return;
    for (var i = 0; i < SESSION_AFTER_PANES.length; i++) {
      var paneId = SESSION_AFTER_PANES[i];
      var pane = panel.querySelector('.voice-lab-pane[data-pane="' + paneId + '"]');
      if (!pane) continue;
      var card = pane.querySelector('.voice-lab-card') || pane;
      var existing = card.querySelector('[data-vl-session-after]');
      var after = readSessionAfter(paneId);
      if (existing) {
        syncOralAfterChrome(existing, after);
        continue;
      }
      // Drop the old static「写后」hit row — three cards own that story now.
      var hits = card.querySelectorAll('.voice-lab-hit');
      for (var h = 0; h < hits.length; h++) {
        var lab = hits[h].querySelector('b, span b');
        if (lab && /写后/.test(String(lab.textContent || ''))) {
          hits[h].parentNode && hits[h].parentNode.removeChild(hits[h]);
        }
      }
      var wrap = document.createElement('div');
      wrap.innerHTML = sessionAfterBlockHtml(after);
      var block = wrap.firstChild;
      var aim = card.querySelector('[data-vl-aim-host]');
      if (aim) card.insertBefore(block, aim);
      else card.appendChild(block);
    }
  }

  function syncOralAfterChrome(pane, after) {
    if (!pane) return;
    var mode = normalizeOralAfter(after);
    var segs = pane.querySelectorAll('[data-vl-oral-after]');
    for (var i = 0; i < segs.length; i++) {
      var on = segs[i].getAttribute('data-vl-oral-after') === mode;
      segs[i].classList.toggle('is-active', on);
      segs[i].classList.toggle('is-on', on);
      segs[i].setAttribute('aria-checked', on ? 'true' : 'false');
    }
    var meta = FINISH_META[mode] || FINISH_META.confirm;
    var mid = pane.querySelector('[data-vl-oral-causal-mid]');
    var tail = pane.querySelector('[data-vl-oral-causal-tail]');
    var hint = pane.querySelector('[data-vl-oral-after-hint]');
    if (mid) mid.textContent = meta.mid;
    if (tail) tail.textContent = meta.tail;
    if (hint) hint.textContent = meta.hint;
  }

  function enableOralPromptPeer(m, peerId, after) {
    if (!m || !peerId) return;
    var Oral = global.OneToneOralCommandUi;
    if (Oral && typeof Oral.ensureOralScheme === 'function') {
      try {
        Oral.ensureOralScheme(m);
      } catch (_) {}
    }
    if (!m.oralCommandScheme || typeof m.oralCommandScheme !== 'object') {
      m.oralCommandScheme = { items: {}, triggerKey: '', activationMode: 'hold' };
    }
    if (!m.oralCommandScheme.items || typeof m.oralCommandScheme.items !== 'object') {
      m.oralCommandScheme.items = {};
    }
    var key = 'prompt:' + peerId;
    var prev = m.oralCommandScheme.items[key] || {};
    var patch = { enabled: true };
    if (after != null && after !== '') patch.after = normalizeOralAfter(after);
    m.oralCommandScheme.items[key] = Object.assign({}, prev, patch);
    try {
      if (Oral && typeof Oral.persistOralScheme === 'function') {
        Oral.persistOralScheme(m, m.oralCommandScheme.items);
        return;
      }
    } catch (_) {}
    var p = global.OneToneConfigPersist;
    if (p && p.save) p.save({ source: 'voice-lab-oral-enable' });
  }

  function removeOralPromptPeer(peerId) {
    peerId = String(peerId || '').trim();
    if (!peerId) return;
    var m = activeMapping();
    if (m && m.oralCommandScheme && m.oralCommandScheme.items) {
      delete m.oralCommandScheme.items['prompt:' + peerId];
    }
    var maps = (cfg().mappings || []).slice();
    var next = [];
    for (var i = 0; i < maps.length; i++) {
      if (maps[i] && String(maps[i].id) === peerId) continue;
      next.push(maps[i]);
    }
    if (global.OneToneState && global.OneToneState.state && global.OneToneState.state.config) {
      global.OneToneState.state.config.mappings = next;
    }
    var p = global.OneToneConfigPersist;
    if (p && p.save) p.save({ source: 'voice-lab-oral-remove' });
  }

  function customOralEditorHtml(draft) {
    draft = draft || {};
    var title = String(draft.title || '').trim() || t('voiceLabOralNewTitle', '新命令');
    var say = String(draft.say || '').trim() || '';
    var body = String(draft.body || '').trim() || '';
    var after = normalizeOralAfter(draft.after);
    return (
      '<div class="voice-lab-card tint-cmd">' +
      '<div class="voice-lab-banner">' +
      escAttr(
        t(
          'voiceLabOralNewBanner',
          '命令窗内说出下方说法 → 对准输入框 → 写入正文；写后走「留下 / 说了才发 / 停顿就发」。VOSK 匹配后走口头注入。'
        )
      ) +
      '</div>' +
      '<div class="voice-lab-row" style="justify-content:space-between;margin-top:0">' +
      '<h3 style="margin:0">' +
      escAttr(t('voiceLabOralNewHeading', '自定义口头命令')) +
      '</h3>' +
      '<button type="button" class="voice-lab-btn ghost" style="color:var(--vl-danger,#c41e1e)" data-del-mid>' +
      escAttr(t('delete', '删除')) +
      '</button></div>' +
      '<p class="voice-lab-blurb">' +
      escAttr(
        t(
          'voiceLabOralNewBlurb',
          '写法与 Soft Pad「一词注入」同源：说法供 VOSK 匹配，正文写入 Agent 输入框。'
        )
      ) +
      '</p>' +
      '<div class="voice-lab-field">' +
      '<label for="voiceLabOralTitle">' +
      escAttr(t('voiceLabOralTitleLbl', '名称')) +
      '</label>' +
      '<input id="voiceLabOralTitle" data-vl-oral-title data-vl-dirty maxlength="32" value="' +
      escAttr(title) +
      '" placeholder="' +
      escAttr(t('voiceLabOralTitlePh', '列表短名，如：保存草稿')) +
      '" autocomplete="off" />' +
      '</div>' +
      '<div class="voice-lab-field">' +
      '<label for="voiceLabOralSay">' +
      escAttr(t('voiceLabOralSayLbl', '说法（主 + 别名，VOSK 匹配）')) +
      '</label>' +
      '<textarea id="voiceLabOralSay" data-vl-oral-say data-vl-dirty rows="3" placeholder="' +
      escAttr(t('voiceLabOralSayPh', '保存\n存一下\n写好了')) +
      '">' +
      escAttr(say) +
      '</textarea>' +
      '<p class="help">' +
      escAttr(t('voiceLabOralSayHelp', '一行一个；命令窗开启后说出任一即可触发。')) +
      '</p></div>' +
      '<div class="voice-lab-field">' +
      '<label for="voiceLabOralBody">' +
      escAttr(t('voiceLabOralBodyLbl', '注入正文')) +
      '</label>' +
      '<textarea id="voiceLabOralBody" data-vl-oral-body data-vl-dirty rows="5" placeholder="' +
      escAttr(t('voiceLabOralBodyPh', '匹配后写入输入框的内容（可与说法不同）')) +
      '">' +
      escAttr(body) +
      '</textarea></div>' +
      sessionAfterBlockHtml(after) +
      '<div class="voice-lab-aim" data-vl-aim-host data-vl-aim-for="custom"></div>' +
      '<div class="voice-lab-row">' +
      '<button type="button" class="voice-lab-btn" data-vl-oral-trial>' +
      escAttr(t('voiceLabOralTrialInject', '试一下 · 注入当前口令')) +
      '</button>' +
      '<button type="button" class="voice-lab-btn pri" data-vl-oral-save>' +
      escAttr(t('voiceLabOralSave', '保存口头命令')) +
      '</button></div>' +
      '<p class="voice-lab-warn" data-vl-oral-status hidden aria-live="polite"></p>' +
      '</div>'
    );
  }

  function ensureCustomOralPane(paneKey, draft) {
    var panel = root();
    if (!panel) return null;
    var mid = panel.querySelector('.voice-lab-mid');
    if (!mid) return null;
    var pane = mid.querySelector('.voice-lab-pane[data-pane="' + paneKey + '"]');
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'voice-lab-pane';
      pane.setAttribute('data-pane', paneKey);
      pane.setAttribute('data-vl-custom-oral', '1');
      mid.appendChild(pane);
    }
    if (draft && draft.peerId) pane.setAttribute('data-vl-peer', draft.peerId);
    pane.innerHTML = customOralEditorHtml(draft || {});
    return pane;
  }

  function readCustomOralDraft(pane) {
    if (!pane) return null;
    var afterBtn =
      pane.querySelector('[data-vl-oral-after].is-active') ||
      pane.querySelector('[data-vl-oral-after].is-on') ||
      pane.querySelector('[data-vl-oral-after][aria-checked="true"]');
    return {
      peerId: String(pane.getAttribute('data-vl-peer') || '').trim(),
      title: String((pane.querySelector('[data-vl-oral-title]') || {}).value || '').trim(),
      say: String((pane.querySelector('[data-vl-oral-say]') || {}).value || ''),
      body: String((pane.querySelector('[data-vl-oral-body]') || {}).value || ''),
      after: normalizeOralAfter(afterBtn && afterBtn.getAttribute('data-vl-oral-after')),
    };
  }

  function setCustomOralStatus(pane, msg, kind) {
    if (!pane) return;
    var el = pane.querySelector('[data-vl-oral-status]');
    if (!el) return;
    var text = String(msg || '').trim();
    el.hidden = !text;
    el.textContent = text;
    el.classList.toggle('is-ok', kind === 'ok');
    el.classList.toggle('is-err', kind === 'err');
  }

  function updateRailCustomOral(paneKey, draft) {
    var panel = root();
    if (!panel) return;
    var rail = panel.querySelector('.voice-lab-rail .item[data-pane="' + paneKey + '"]');
    if (!rail) return;
    var title = String((draft && draft.title) || '').trim() || t('voiceLabOralNewTitle', '新命令');
    var says = parseSayLines(draft && draft.say);
    var sub = says.length
      ? t('voiceLabOralRailReady', '口头 · {say}').replace('{say}', says[0])
      : t('voiceLabOralRailEmpty', '口头 · 未配置');
    var tEl = rail.querySelector('.t');
    var sEl = rail.querySelector('.s');
    if (tEl) tEl.textContent = title;
    if (sEl) sEl.textContent = sub;
    PANE_LABELS[paneKey] = t('voiceLabOralMidCustom', '口头命令 注入');
    LIVE_COPY[paneKey] =
      '<strong>' +
      escAttr(title) +
      '</strong><br/>' +
      (says[0] ? '可说：' + escAttr(says[0]) : '待配说法');
    PILL_TEXT[paneKey] = says[0]
      ? t('voiceLabPillSay', '可说 · {say}').replace('{say}', says[0])
      : t('voiceLabPillNew', '可说 · 新命令');
  }

  function saveCustomOral(pane) {
    var draft = readCustomOralDraft(pane);
    if (!draft) return;
    var says = parseSayLines(draft.say);
    var body = String(draft.body || '').trim();
    if (!says.length) {
      setCustomOralStatus(pane, t('voiceLabOralNeedSay', '先写至少一句说法（VOSK 匹配词）'), 'err');
      toast(t('voiceLabOralNeedSay', '先写至少一句说法（VOSK 匹配词）'));
      return;
    }
    if (!body) {
      setCustomOralStatus(pane, t('voiceLabOralNeedBody', '先写要注入的正文'), 'err');
      toast(t('voiceLabOralNeedBody', '先写要注入的正文'));
      return;
    }
    var picker = global.OneToneKeysChannelCommandPicker;
    if (!picker || typeof picker.savePromptInjectMapping !== 'function') {
      setCustomOralStatus(pane, t('voiceLabOralSaveUnavailable', '暂无法保存口头命令'), 'err');
      return;
    }
    var label = draft.title || says[0];
    var saved = null;
    try {
      saved = picker.savePromptInjectMapping({
        text: body,
        label: label,
        editId: draft.peerId || '',
        forceCreate: !draft.peerId,
        wakePhrases: says,
        quiet: true,
      });
    } catch (err) {
      console.error('voiceLab save oral', err);
    }
    if (!saved || !saved.id) {
      var m = activeMapping();
      var noApp = !m || !mappingAppId(m);
      setCustomOralStatus(
        pane,
        noApp
          ? t('voicePromptNeedAppScene', '请先切换到某个应用场景（不要停在通用设置）')
          : t('voiceLabOralSaveUnavailable', '暂无法保存口头命令'),
        'err'
      );
      return;
    }
    var after = normalizeOralAfter(draft.after);
    // savePromptInjectMapping always stamps text+Enter; rewrite for 留下/说了才发 then persist.
    saved.targetActions = promptActionsForAfter(body, after);
    saved.label = label;
    enableOralPromptPeer(activeMapping(), saved.id, after);
    try {
      var persist = global.OneToneConfigPersist;
      if (persist && typeof persist.save === 'function') {
        persist.save({ source: 'voice-lab-oral-after' });
      }
    } catch (_) {}
    pane.setAttribute('data-vl-peer', saved.id);
    var paneKey = pane.getAttribute('data-pane');
    updateRailCustomOral(paneKey, {
      title: label,
      say: says.join('\n'),
      body: body,
      after: after,
    });
    var midLabel = $('voiceLabMidLabel');
    if (midLabel) midLabel.textContent = PANE_LABELS[paneKey] || midLabel.textContent;
    var afterRail = (FINISH_META[after] && FINISH_META[after].rail) || FINISH_META.confirm.rail;
    setCustomOralStatus(
      pane,
      t('voiceLabOralSaved', '已保存：说出「{say}」→ 对准写入 · {after}')
        .replace('{say}', says[0])
        .replace('{after}', afterRail),
      'ok'
    );
    toast(t('voiceLabOralSavedToast', '口头命令已保存 · VOSK 可匹配'));
    markClean();
    syncAimBlocks();
  }

  function trialCustomOral(pane) {
    var draft = readCustomOralDraft(pane);
    if (!draft) return;
    var body = String(draft.body || '').trim();
    if (!body) {
      setCustomOralStatus(pane, t('voiceLabOralNeedBody', '先写要注入的正文'), 'err');
      return;
    }
    // Ensure saved peer exists so test_send can run targetActions.
    if (!draft.peerId) {
      saveCustomOral(pane);
      draft = readCustomOralDraft(pane);
    }
    var peerId = draft && draft.peerId;
    if (!peerId) return;
    var peer = null;
    try {
      var core = global.OneToneMappingCore;
      peer = core && core.byId ? core.byId(peerId) : null;
    } catch (_) {}
    if (peer) peer.targetActions = promptActionsForAfter(body, draft.after);
    setCustomOralStatus(pane, t('voiceLabOralTrialRunning', '正在试注入…'), '');
    invoke('cmd_test_send', { mappingId: peerId, mapping_id: peerId })
      .then(function (res) {
        var ok = !!(res && (res.ok === true || res.success === true || res.status === 'ok'));
        if (ok || (res && !res.error && res.ok !== false)) {
          setCustomOralStatus(pane, t('voiceLabOralTrialOk', '已试注入到前台输入框'), 'ok');
          toast(t('voiceLabOralTrialOk', '已试注入到前台输入框'));
        } else {
          setCustomOralStatus(
            pane,
            t('voiceLabOralTrialFail', '试注入未成功') +
              (res && res.error ? ' · ' + res.error : ''),
            'err'
          );
        }
      })
      .catch(function (err) {
        setCustomOralStatus(
          pane,
          t('voiceLabOralTrialFail', '试注入未成功') +
            (err && err.message ? ' · ' + err.message : ''),
          'err'
        );
      });
  }

  function selectPane(id) {
    paneId = String(id || 'gate');
    var panel = root();
    if (!panel) return;
    if (String(paneId).indexOf('oral-new-') === 0) {
      var existing = panel.querySelector('.voice-lab-pane[data-pane="' + paneId + '"]');
      if (!existing) ensureCustomOralPane(paneId, { title: t('voiceLabOralNewTitle', '新命令') });
    }
    var items = panel.querySelectorAll('.voice-lab-rail .item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle('on', items[i].getAttribute('data-pane') === paneId);
    }
    var panes = panel.querySelectorAll('.voice-lab-pane');
    for (var j = 0; j < panes.length; j++) {
      panes[j].classList.toggle('on', panes[j].getAttribute('data-pane') === paneId);
    }
    var midLabel = $('voiceLabMidLabel');
    if (midLabel) midLabel.textContent = PANE_LABELS[paneId] || PANE_LABELS.gate;
    var liveMeta = $('voiceLabLiveMeta');
    if (liveMeta) liveMeta.innerHTML = LIVE_COPY[paneId] || LIVE_COPY.gate;
    var pillText = $('voiceLabLivePillText');
    if (pillText) pillText.textContent = PILL_TEXT[paneId] || PILL_TEXT.gate;
    var pill = $('voiceLabLivePill');
    if (pill) pill.classList.toggle('is-idle', paneId === 'gate');
    if (paneId === 'gate') syncGateChrome();
    else syncAimBlocks();
  }

  function openLive() {
    var drawer = $('voiceLabLiveDrawer');
    if (drawer) drawer.classList.add('on');
  }

  function closeLive() {
    var drawer = $('voiceLabLiveDrawer');
    if (drawer) drawer.classList.remove('on');
  }

  function bindTagDel(btn) {
    btn.addEventListener('click', function () {
      var tag = btn.closest('.voice-phrase-tag');
      if (tag) tag.remove();
      markDirty();
    });
  }

  function setVoiceAssist(on) {
    var c = cfg();
    c.voiceAssistEnabled = !!on;
    var mode = !on ? 'disabled' : keylessOn() ? 'wakeOrPushToTalk' : 'pushToTalk';
    c.voiceActivation = mode;
    return invoke('cmd_voice_set_activation', { mode: mode })
      .then(function () {
        try {
          if (global.OneToneConfigPersist && global.OneToneConfigPersist.save) {
            global.OneToneConfigPersist.save({ source: 'voiceLab-assist' });
          }
        } catch (_) {}
        syncGateChrome();
      })
      .catch(function (err) {
        console.error('voiceLab assist', err);
        syncGateChrome();
      });
  }

  function setKeyless(on) {
    var K = global.OneToneVoiceKeyless;
    if (K && typeof K.setOn === 'function') {
      return K.setOn(!!on, { reason: 'voiceLab-wake' }).then(function () {
        syncGateChrome();
        return { ok: true };
      });
    }
    syncGateChrome();
    return Promise.resolve({ ok: false });
  }

  function applyOralKeyChord(m, chord) {
    chord = String(chord || '').trim();
    if (!m || !chord) return false;
    var Picker = global.OneToneKeysChannelCommandPicker;
    if (Picker && typeof Picker.setOralTriggerKey === 'function') {
      return !!Picker.setOralTriggerKey(m, chord);
    }
    var Oral = global.OneToneOralCommandUi;
    if (Oral && typeof Oral.ensureOralScheme === 'function') {
      Oral.ensureOralScheme(m);
    }
    if (!m.oralCommandScheme || typeof m.oralCommandScheme !== 'object') {
      m.oralCommandScheme = { items: {}, triggerKey: '', activationMode: 'hold' };
    }
    m.oralCommandScheme.triggerKey = chord;
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.save) {
        global.OneToneConfigPersist.save({ source: 'voiceLab-oral-key' });
      }
    } catch (_) {}
    return true;
  }

  function cancelHardwareRecord() {
    try {
      var Rec = global.OneToneMappingRecording;
      if (Rec && typeof Rec.mode === 'function' && Rec.mode() !== 'none' && typeof Rec.cancel === 'function') {
        Rec.cancel();
      }
    } catch (_) {}
  }

  function rerecordOralKey() {
    var m = activeMapping();
    if (!m || !m.id) {
      toast(t('voiceLabNeedHabit', '请先选择习惯'));
      return;
    }
    if (oralRecordPoll) {
      clearInterval(oralRecordPoll);
      oralRecordPoll = 0;
    }
    var finished = false;
    var overlayCtl = null;
    var before = oralKeyRaw(m);
    var mid = String(m.id);

    function finishRecord(chordFromKb) {
      if (finished) return;
      finished = true;
      if (oralRecordPoll) {
        clearInterval(oralRecordPoll);
        oralRecordPoll = 0;
      }
      if (overlayCtl && typeof overlayCtl.dismiss === 'function') {
        try {
          overlayCtl.dismiss();
        } catch (_) {}
      }
      overlayCtl = null;
      chordFromKb = String(chordFromKb || '').trim();
      if (chordFromKb) {
        cancelHardwareRecord();
        applyOralKeyChord(activeMapping() || m, chordFromKb);
        syncGateChrome();
        toast(
          t('voiceLabOralRecordDone', '命令键已更新：{key}').replace(
            '{key}',
            oralKeyLabel(activeMapping() || m) || chordFromKb
          )
        );
        return;
      }
      // Esc / cancel — drop hardware arm if still open.
      cancelHardwareRecord();
      syncGateChrome();
    }

    // Centered modal (same home-record-overlay as 动作链 / 习惯录键).
    if (typeof global.OneToneHomeRecordChord === 'function') {
      overlayCtl = global.OneToneHomeRecordChord(
        function (chord) {
          finishRecord(chord || '');
        },
        {
          title: t('voiceLabOralRecordTitle', '录制命令键'),
          hint: t(
            'voiceLabOralRecordHintFull',
            '按下键盘组合或鼠标侧键 — Esc 取消'
          ),
        }
      );
    } else {
      toast(t('voiceLabOralRecordHint', '请按下要绑定的命令键…'));
    }

    // Hardware path: side / volume keys (keyboard modal alone cannot see them).
    var Oral = global.OneToneOralCommandUi;
    var p =
      Oral && typeof Oral.startOralTriggerRecord === 'function'
        ? Oral.startOralTriggerRecord(mid)
        : Promise.resolve(false);
    Promise.resolve(p)
      .then(function (ok) {
        if (ok === false && !overlayCtl) {
          toast(t('voiceLabOralRecordFail', '未能开始录键'));
          return;
        }
        var n = 0;
        oralRecordPoll = setInterval(function () {
          if (finished) {
            clearInterval(oralRecordPoll);
            oralRecordPoll = 0;
            return;
          }
          n++;
          syncGateChrome();
          var now = oralKeyRaw(activeMapping());
          if (now && now !== before) {
            // Hardware write landed — close modal without re-applying.
            finished = true;
            clearInterval(oralRecordPoll);
            oralRecordPoll = 0;
            if (overlayCtl && typeof overlayCtl.dismiss === 'function') {
              try {
                overlayCtl.dismiss();
              } catch (_) {}
            }
            overlayCtl = null;
            toast(
              t('voiceLabOralRecordDone', '命令键已更新：{key}').replace(
                '{key}',
                oralKeyLabel(activeMapping()) || now
              )
            );
            return;
          }
          if (n >= 45) {
            clearInterval(oralRecordPoll);
            oralRecordPoll = 0;
            if (!finished) finishRecord('');
          }
        }, 400);
      })
      .catch(function (err) {
        console.error('voiceLab oral record', err);
        if (!overlayCtl) toast(t('voiceLabOralRecordFail', '未能开始录键'));
      });
  }

  function setTrialStatus(msg, kind) {
    var el = $('voiceLabOralTrialStatus');
    if (!el) return;
    var text = String(msg || '').trim();
    el.hidden = !text;
    el.textContent = text;
    el.classList.toggle('is-ok', kind === 'ok');
    el.classList.toggle('is-err', kind === 'err');
  }

  function trialOpenAssist() {
    var m = activeMapping();
    var mid = (m && m.id) || selectedMappingId() || null;
    var trialBtn = $('voiceLabOralTrial');
    var label = t('voiceLabOralTrial', '试开助手窗');
    if (trialBtn) {
      trialBtn.disabled = true;
      trialBtn.textContent = t('voiceLabOralTrialPending', '打开中…');
    }
    // Soft Pad chrome first (same as begin_session). Do not block on Vosk probe —
    // unbound command key is OK: this IPC arms oral listen without a physical chord.
    setTrialStatus(t('voiceLabOralTrialPending', '正在打开 Soft Pad 口头命令…'));
    invoke('cmd_voice_command_session_toggle', { mappingId: mid || null })
      .then(function (res) {
        var on = !!(res && res.armed);
        if (res && res.ok === false) {
          var reason = String((res && (res.reason || res.message)) || '').trim();
          var fail =
            t('voiceLabOralTrialFail', '未能打开命令窗') + (reason ? ' · ' + reason : '');
          setTrialStatus(fail, 'err');
          toast(fail);
          return;
        }
        if (!on) {
          // Toggle ended a prior session, or wrong-FG / recording refused arm.
          setTrialStatus(t('voiceLabOralTrialOff', '命令窗已关闭'), 'err');
          toast(t('voiceLabOralTrialOff', '命令窗已关闭'));
          var pillOff = $('voiceLabLivePill');
          if (pillOff) pillOff.classList.add('is-idle');
          var pillTextOff = $('voiceLabLivePillText');
          if (pillTextOff) pillTextOff.textContent = PILL_TEXT.gate;
          return;
        }
        setTrialStatus(t('voiceLabOralTrialOn', '命令窗已打开 · 可说口头指令'), 'ok');
        toast(t('voiceLabOralTrialOn', '命令窗已打开 · 可说口头指令'));
        var pill = $('voiceLabLivePill');
        if (pill) pill.classList.remove('is-idle');
        var pillText = $('voiceLabLivePillText');
        if (pillText) pillText.textContent = t('voiceLabPillListening', '聆听中 · 口头');
        // Warm STT after pad is visible.
        var vw = global.OneToneVoiceWake;
        try {
          if (vw && typeof vw.unparkHomeAsrQuiet === 'function') vw.unparkHomeAsrQuiet();
        } catch (_) {}
        if (vw && typeof vw.ensureOralWithCapability === 'function') {
          Promise.resolve(vw.ensureOralWithCapability()).catch(function () {});
        }
      })
      .catch(function (err) {
        console.error('voiceLab trial oral', err);
        var fail = t('voiceLabOralTrialFail', '未能打开命令窗');
        setTrialStatus(fail, 'err');
        toast(fail);
      })
      .then(
        function () {
          if (trialBtn) {
            trialBtn.disabled = false;
            trialBtn.textContent = label;
          }
        },
        function () {
          if (trialBtn) {
            trialBtn.disabled = false;
            trialBtn.textContent = label;
          }
        }
      );
  }

  function bind() {
    var panel = root();
    if (!panel || bound) return;
    bound = true;
    panel.dataset.voiceLabBound = '1';

    var legacy = $('voiceLabOpenLegacy');
    if (legacy) {
      legacy.addEventListener('click', function (e) {
        e.preventDefault();
        openPanel('voiceWake');
      });
    }

    var saveBtn = $('voiceLabBtnSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        if (!dirty) return;
        markClean();
      });
    }

    panel.addEventListener('click', function (e) {
      var tEl = e.target;
      if (!tEl || !tEl.closest) return;

      var aimBtn = tEl.closest('[data-vl-aim]');
      if (aimBtn && panel.contains(aimBtn)) {
        e.preventDefault();
        setAimStrategy(aimBtn.getAttribute('data-vl-aim'));
        return;
      }

      var afterBtn = tEl.closest('[data-vl-oral-after]');
      if (afterBtn && panel.contains(afterBtn)) {
        e.preventDefault();
        var oralPane = afterBtn.closest('.voice-lab-pane');
        var afterMode = afterBtn.getAttribute('data-vl-oral-after');
        var afterHost = afterBtn.closest('[data-vl-session-after]') || oralPane;
        syncOralAfterChrome(afterHost, afterMode);
        var paneKey = oralPane && oralPane.getAttribute('data-pane');
        if (
          paneKey &&
          SESSION_AFTER_PANES.indexOf(paneKey) >= 0 &&
          !(oralPane && oralPane.getAttribute('data-vl-custom-oral'))
        ) {
          persistSessionAfter(paneKey, afterMode);
        }
        markDirty();
        return;
      }

      var oralSave = tEl.closest('[data-vl-oral-save]');
      if (oralSave && panel.contains(oralSave)) {
        e.preventDefault();
        saveCustomOral(oralSave.closest('.voice-lab-pane'));
        return;
      }
      var oralTrial = tEl.closest('[data-vl-oral-trial]');
      if (oralTrial && panel.contains(oralTrial)) {
        e.preventDefault();
        trialCustomOral(oralTrial.closest('.voice-lab-pane'));
        return;
      }

      var openBtn = tEl.closest('[data-vl-open-panel]');
      if (openBtn) {
        e.preventDefault();
        openPanel(openBtn.getAttribute('data-vl-open-panel') || 'habits');
        return;
      }

      if (tEl.closest('#voiceLabOralRerecord') || tEl.closest('#voiceLabOralKeycap')) {
        e.preventDefault();
        rerecordOralKey();
        return;
      }
      if (tEl.closest('#voiceLabOralTrial')) {
        e.preventDefault();
        trialOpenAssist();
        return;
      }

      if (tEl.closest('#voiceLabModeSw')) {
        e.preventDefault();
        setVoiceAssist(!voiceAssistOn());
        return;
      }
      if (tEl.closest('#voiceLabWakeSw')) {
        e.preventDefault();
        setKeyless(!keylessOn());
        return;
      }

      var dirtyBtn = tEl.closest('[data-vl-dirty]');
      if (dirtyBtn && dirtyBtn.tagName === 'BUTTON' && panel.contains(dirtyBtn)) {
        markDirty();
      }

      var railItem = tEl.closest('.voice-lab-rail .item');
      if (railItem && panel.contains(railItem)) {
        if (tEl.closest('[data-del]')) {
          e.preventDefault();
          e.stopPropagation();
          var delPaneId = railItem.getAttribute('data-pane');
          var delPane =
            delPaneId && panel.querySelector('.voice-lab-pane[data-pane="' + delPaneId + '"]');
          var delPeer = delPane && delPane.getAttribute('data-vl-peer');
          if (delPeer) removeOralPromptPeer(delPeer);
          if (delPane && delPane.getAttribute('data-vl-custom-oral') === '1') delPane.remove();
          railItem.remove();
          selectPane('gate');
          markDirty();
          return;
        }
        selectPane(railItem.getAttribute('data-pane'));
        return;
      }

      var delMid = tEl.closest('[data-del-mid]');
      if (delMid) {
        var pane = delMid.closest('.voice-lab-pane');
        var id = pane && pane.getAttribute('data-pane');
        var peerId = pane && pane.getAttribute('data-vl-peer');
        if (peerId) removeOralPromptPeer(peerId);
        var rail = id && panel.querySelector('.voice-lab-rail .item[data-pane="' + id + '"]');
        if (rail) rail.remove();
        if (pane && pane.getAttribute('data-vl-custom-oral') === '1') pane.remove();
        selectPane('gate');
        markDirty();
        return;
      }

      var finishBtn = tEl.closest('[data-vl-output-mode]');
      if (finishBtn && panel.contains(finishBtn)) {
        applyFinishMode(finishBtn.getAttribute('data-vl-output-mode'));
        markDirty();
        return;
      }

      var imeBtn = tEl.closest('#voiceLabImePresetStrip .ime-preset-item');
      if (imeBtn && panel.contains(imeBtn)) {
        if (imeBtn.getAttribute('data-ime-custom') === '1') {
          toast(t('voiceLabCustomImeStub', '自定义听写键稍后接入'));
          return;
        }
        var strip = $('voiceLabImePresetStrip');
        if (strip) {
          var items = strip.querySelectorAll('.ime-preset-item');
          for (var i = 0; i < items.length; i++) {
            var on = items[i] === imeBtn;
            items[i].classList.toggle('is-selected', on);
            items[i].setAttribute('aria-pressed', on ? 'true' : 'false');
          }
        }
        var chord = $('voiceLabSettingsTargetKeyChord');
        var ico = $('voiceLabSettingsTargetKeyIco');
        var key = imeBtn.getAttribute('data-target-key') || 'F2';
        if (chord) chord.textContent = key;
        var img = imeBtn.querySelector('img');
        if (ico && img) ico.src = img.getAttribute('src') || ico.src;
        var active = document.querySelector('#voiceLabOutputModeSegments [data-vl-output-mode].is-active');
        applyFinishMode(active ? active.getAttribute('data-vl-output-mode') : 'confirm');
        markDirty();
        return;
      }

      var langBtn = tEl.closest('.flow-lang-btn');
      if (langBtn && panel.contains(langBtn)) {
        var group = langBtn.parentElement;
        if (group) {
          var langs = group.querySelectorAll('.flow-lang-btn');
          for (var li = 0; li < langs.length; li++) {
            langs[li].classList.toggle('is-on', langs[li] === langBtn);
          }
        }
        markDirty();
        return;
      }

      var addBtn = tEl.closest('[data-vl-habit-add]');
      if (addBtn && panel.contains(addBtn)) {
        var wrap = addBtn.closest('.voice-finish-habit-block');
        var input = wrap && wrap.querySelector('input');
        var tags = wrap && wrap.querySelector('.voice-phrase-tags');
        var val = input ? String(input.value || '').trim() : '';
        if (!val || !tags) return;
        var tag = document.createElement('span');
        tag.className = 'voice-phrase-tag is-active';
        tag.innerHTML =
          '<button type="button" class="voice-phrase-tag-btn"></button>' +
          '<button type="button" class="voice-phrase-tag-del" aria-label="移除">×</button>';
        tag.querySelector('.voice-phrase-tag-btn').textContent = val;
        bindTagDel(tag.querySelector('.voice-phrase-tag-del'));
        tags.appendChild(tag);
        input.value = '';
        markDirty();
        return;
      }

      if (tEl.closest('#voiceLabLivePill') || tEl.closest('#voiceLabStatusLive')) {
        openLive();
        return;
      }
    });

    panel.addEventListener('input', function (e) {
      if (e.target && e.target.matches && e.target.matches('[data-vl-dirty]')) markDirty();
    });

    var dels = panel.querySelectorAll('.voice-phrase-tag-del');
    for (var d = 0; d < dels.length; d++) bindTagDel(dels[d]);

    var newOral = $('voiceLabBtnNewOral');
    if (newOral) {
      newOral.addEventListener('click', function () {
        var rail = panel.querySelector('.voice-lab-rail');
        var acts = panel.querySelector('.voice-lab-rail-acts');
        if (!rail || !acts) return;
        var id = 'oral-new-' + Date.now();
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'item';
        btn.setAttribute('data-pane', id);
        btn.innerHTML =
          '<span class="t">' +
          escAttr(t('voiceLabOralNewTitle', '新命令')) +
          '</span><span class="s">' +
          escAttr(t('voiceLabOralRailEmpty', '口头 · 未配置')) +
          '</span><span class="del" title="删除" data-del>×</span>';
        rail.insertBefore(btn, acts);
        PANE_LABELS[id] = t('voiceLabOralMidCustom', '口头命令 注入');
        LIVE_COPY[id] = '<strong>新命令</strong><br/>待配说法与正文';
        PILL_TEXT[id] = t('voiceLabPillNew', '可说 · 新命令');
        ensureCustomOralPane(id, { title: t('voiceLabOralNewTitle', '新命令'), after: 'confirm' });
        selectPane(id);
        markDirty();
      });
    }

    var tpl = $('voiceLabBtnTpl');
    if (tpl) {
      tpl.addEventListener('click', function () {
        toast(t('voiceLabTplStub', '模板库稍后接入'));
      });
    }

    var drawer = $('voiceLabLiveDrawer');
    if (drawer) {
      var closeBtn = $('voiceLabLiveClose');
      if (closeBtn) closeBtn.addEventListener('click', closeLive);
      drawer.addEventListener('click', function (e) {
        if (e.target === drawer) closeLive();
      });
    }

    try {
      var K = global.OneToneVoiceKeyless;
      if (K && typeof K.onChange === 'function') {
        K.onChange(function () {
          syncGateChrome();
        });
      }
    } catch (_) {}
  }

  function render() {
    bind();
    ensureSessionAfterBlocks();
    selectPane(paneId || 'gate');
    applyFinishMode(
      (document.querySelector('#voiceLabOutputModeSegments [data-vl-output-mode].is-active') || {})
        .getAttribute
        ? document
            .querySelector('#voiceLabOutputModeSegments [data-vl-output-mode].is-active')
            .getAttribute('data-vl-output-mode')
        : 'confirm'
    );
    syncGateChrome();
    if (!dirty) markClean();
  }

  global.OneToneVoiceLabPanel = {
    render: render,
    bind: bind,
    syncGateChrome: syncGateChrome,
  };
})(typeof window !== 'undefined' ? window : globalThis);
