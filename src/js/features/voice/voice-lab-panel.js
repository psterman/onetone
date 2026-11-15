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
    var m = activeMapping();
    return m && m.id ? String(m.id) : '';
  }

  function activeMapping() {
    var Scope = global.OneToneVoiceScope;
    if (Scope && typeof Scope.resolveEditMapping === 'function') {
      var scoped = Scope.resolveEditMapping();
      if (scoped) return scoped;
    }
    var st = global.OneToneState && global.OneToneState.state;
    var id = String((st && st.selectedMappingId) || '').trim();
    if (!id) id = String(cfg().activeSceneId || '').trim();
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

  function scopeMeta() {
    var Scope = global.OneToneVoiceScope;
    if (Scope && typeof Scope.describeScope === 'function') {
      return Scope.describeScope(activeMapping());
    }
    var m = activeMapping();
    var appId = mappingAppId(m);
    return {
      mapping: m,
      mappingId: m && m.id ? String(m.id) : '',
      habitName: habitName(m),
      appId: appId,
      isGlobal: !appId,
      isAppOverride: !!appId,
      overrideLabel: appId
        ? t('voiceLabScopeAppOverride', '当前习惯覆盖')
        : t('voiceSummaryScopeUniversal', '所有未单独覆盖的习惯'),
      saveImpactLabel: appId
        ? t(
            'habitScenarioContextEditing',
            '正在编辑：{name} 场景。修改只作用于当前应用场景，不影响通用设置。'
          ).replace('{name}', habitName(m))
        : t('habitHubContextGlobalHint', '此处修改会影响所有未单独覆盖的应用场景'),
    };
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
    var meta = scopeMeta();
    var m = meta.mapping;
    var name = meta.habitName || habitName(m);
    var appId = meta.appId || mappingAppId(m);
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

    var modeEl = $('voiceLabSceneMode');
    if (modeEl) {
      modeEl.textContent = meta.overrideLabel || (meta.isGlobal ? '全局配置' : '当前习惯覆盖');
      modeEl.title = meta.saveImpactLabel || '';
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
      hint.textContent = meta.saveImpactLabel || (appId
        ? t('habitScenarioContextEditing', '正在编辑：{name} 场景。修改只作用于当前应用场景，不影响通用设置。').replace(
            '{name}',
            name
          )
        : t('habitHubContextGlobalHint', '此处修改会影响所有未单独覆盖的应用场景'));
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

  function openPanel(panel, opts) {
    opts = opts || {};
    var payload = Object.assign({ panel: panel }, opts);
    if (panel === 'voiceWake') payload.legacy = true;
    try {
      if (global.OneToneSettingsDrawer && typeof global.OneToneSettingsDrawer.open === 'function') {
        global.OneToneSettingsDrawer.open(payload);
        return;
      }
    } catch (_) {}
    try {
      if (global.OneToneSettingsDrawer && typeof global.OneToneSettingsDrawer.setPanel === 'function') {
        global.OneToneSettingsDrawer.setPanel(panel, payload);
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

  function currentLabFinishMode() {
    var End = global.OneToneVoiceEnd;
    if (End && typeof End.resolveSendMode === 'function') {
      return End.normalizeSendMode
        ? End.normalizeSendMode(End.resolveSendMode())
        : String(End.resolveSendMode() || 'confirm');
    }
    var modeBtn = document.querySelector('#voiceLabOutputModeSegments [data-vl-output-mode].is-active');
    return modeBtn ? modeBtn.getAttribute('data-vl-output-mode') : 'confirm';
  }

  function phrasePreviewFromHost(hostId, fallback) {
    var host = $(hostId);
    if (!host) return fallback || '—';
    var tags = host.querySelectorAll('.voice-phrase-tag-btn, .voice-phrase-tag [data-phrase]');
    var out = [];
    for (var i = 0; i < tags.length && out.length < 3; i++) {
      var p = tags[i].getAttribute('data-phrase') || tags[i].textContent || '';
      p = String(p).trim();
      if (p && p !== '—' && out.indexOf(p) < 0) out.push(p);
    }
    if (!out.length) {
      var empty = host.querySelector('.voice-phrase-tags-empty');
      if (empty) return '—';
      var raw = String(host.textContent || '').replace(/\s+/g, ' ').trim();
      return raw && raw !== '—' ? raw.slice(0, 36) : fallback || '—';
    }
    return out.join(' · ');
  }

  function syncPhrasePreviews() {
    var primary = $('voiceLabPhrasePreviewPrimary');
    var cancel = $('voiceLabPhrasePreviewCancel');
    if (primary) primary.textContent = phrasePreviewFromHost('voiceLabEndPhraseTags', '—');
    if (cancel) cancel.textContent = phrasePreviewFromHost('voiceLabCancelPhraseTags', '—');
    var sheetKind = $('voiceLabPhraseBlockPrimaryKind');
    var sheetWhy = $('voiceLabPhraseBlockPrimaryWhy');
    var kind = $('voiceLabFinishHabitKind');
    var why = $('voiceLabFinishHabitWhyBadge');
    if (sheetKind && kind) sheetKind.textContent = kind.textContent || '口令';
    if (sheetWhy && why) {
      sheetWhy.textContent =
        t('voiceLabPhraseSheetPrimaryWhy', '说出下面任一词触发当前收尾动作。') +
        (why.textContent ? ' · ' + why.textContent : '');
    }
  }

  function openPhraseSheet(focus) {
    phraseSheetFocus = focus === 'cancel' ? 'cancel' : 'primary';
    var sheet = $('voiceLabPhraseSheet');
    if (!sheet) return;
    sheet.hidden = false;
    sheet.setAttribute('aria-hidden', 'false');
    sheet.classList.add('on');
    var title = $('voiceLabPhraseSheetTitle');
    if (title) {
      title.textContent = t('voiceLabPhraseSheetTitle', '管理结束 / 发送 / 取消词');
    }
    var primaryBlock = $('voiceLabPhraseBlockPrimary');
    var cancelBlock = $('voiceLabPhraseBlockCancel');
    if (primaryBlock) primaryBlock.hidden = false;
    if (cancelBlock) cancelBlock.hidden = false;
    syncLabPhraseTags();
    var focusEl =
      phraseSheetFocus === 'cancel' ? $('voiceLabFinishHabitAddCancel') : $('voiceLabFinishHabitAddKeep');
    if (focusEl && focusEl.focus) {
      setTimeout(function () {
        try {
          focusEl.focus();
          if (focusEl.scrollIntoView) focusEl.scrollIntoView({ block: 'nearest' });
        } catch (_) {}
      }, 40);
    }
  }

  function closePhraseSheet() {
    var sheet = $('voiceLabPhraseSheet');
    if (!sheet) return;
    sheet.classList.remove('on');
    sheet.hidden = true;
    sheet.setAttribute('aria-hidden', 'true');
    syncPhrasePreviews();
  }

  function syncLabPhraseTags() {
    var End = global.OneToneVoiceEnd;
    if (!End) return;
    var mode = currentLabFinishMode();
    if (mode === 'phrase' || mode === 'auto') {
      if (End.renderSendPhraseTags) End.renderSendPhraseTags();
      else if (End.renderSendCustomPhrases) End.renderSendCustomPhrases();
    } else if (End.renderEndPhraseTags) {
      End.renderEndPhraseTags();
    } else if (End.renderEndCustomPhrases) {
      End.renderEndCustomPhrases();
    }
    if (End.renderCancelPhraseTags) End.renderCancelPhraseTags();
    else if (End.renderCancelCustomPhrases) End.renderCancelCustomPhrases();
    syncPhrasePreviews();
  }

  function dictationWakePhrase() {
    try {
      var Wake = global.OneToneVoiceWake;
      if (Wake && typeof Wake.primaryWakePhraseDisplay === 'function') {
        var w = String(Wake.primaryWakePhraseDisplay() || '').trim();
        if (w) return w;
      }
    } catch (_) {}
    try {
      var V = global.OneToneVoiceSettingsViewModel;
      if (V && V.build && V.resolveDisplayWakePhrase) {
        var d = String(V.resolveDisplayWakePhrase(V.build(false)).display || '').trim();
        if (d) return d;
      }
    } catch (_) {}
    var end = cfg().voiceEnd || {};
    var sapi = cfg().voiceSapi || {};
    var vosk = cfg().voiceVosk || {};
    var list =
      (Array.isArray(vosk.wakePhrases) && vosk.wakePhrases) ||
      (Array.isArray(sapi.wakePhrases) && sapi.wakePhrases) ||
      (Array.isArray(end.wakePhrases) && end.wakePhrases) ||
      [];
    for (var i = 0; i < list.length; i++) {
      var p = String(list[i] || '').trim();
      if (p) return p;
    }
    return t('voiceLabDictWakeFallback', '开始听写');
  }

  function syncMatchChain() {
    var phraseEl = $('voiceLabMatchChainPhrase');
    var intentEl = $('voiceLabMatchChainIntent');
    if (phraseEl) phraseEl.textContent = dictationWakePhrase();
    if (intentEl) {
      var selected = document.querySelector(
        '#voiceLabImePresetStrip .ime-preset-item.is-selected:not([data-ime-custom])'
      );
      var name = selected
        ? selected.getAttribute('title') || selected.getAttribute('aria-label') || ''
        : '';
      intentEl.textContent = name || t('voiceLabMatchIme', '输入法');
    }
  }

  function syncDictationChrome() {
    var End = global.OneToneVoiceEnd;
    var mode = currentLabFinishMode();
    applyFinishMode(mode, { chromeOnly: true });

    var lite = !!(End && End.uiUsesLiteMode && End.uiUsesLiteMode());
    var notice = $('voiceLabSendLiteNotice');
    if (notice) notice.hidden = !lite;

    try {
      var Ime = global.OneToneImePresets;
      if (Ime) {
        if (typeof Ime.bind === 'function') Ime.bind();
        if (typeof Ime.refresh === 'function') Ime.refresh('voiceLab');
      }
    } catch (_) {}

    syncLabPhraseTags();
    syncMatchChain();
    syncRailDictSub();
    // Acoustic record UX moved to Sounds easter egg — do not mount on Lab.
  }

  function saveToHabit() {
    var Ctx = global.OneToneVoiceSchemeContext;
    try {
      if (Ctx && typeof Ctx.mirrorGlobalToOverride === 'function') {
        Ctx.mirrorGlobalToOverride(activeMapping() || undefined);
      }
    } catch (_) {}
    var Persist = global.OneToneVoiceSchemePersist;
    var finishOk = function () {
      markClean();
      syncGateChrome();
    };
    var finishFail = function (err) {
      console.error('voiceLab save', err);
      toast(t('voiceLabSaveFail', '保存失败'));
      markDirty();
    };
    if (Persist && typeof Persist.saveVoiceScheme === 'function') {
      return Promise.resolve(Persist.saveVoiceScheme({ source: 'voiceLab' }))
        .then(function (m) {
          if (m) return m;
          // 无语音方案目标时仍落盘全局配置（IME / 说完后 / aim 已写 config）
          var p = global.OneToneConfigPersist;
          if (p && p.saveAsync) return p.saveAsync({ source: 'voiceLab' });
          if (p && p.save) p.save({ source: 'voiceLab' });
          return null;
        })
        .then(finishOk)
        .catch(finishFail);
    }
    var p = global.OneToneConfigPersist;
    var q =
      p && p.saveAsync
        ? p.saveAsync({ source: 'voiceLab' })
        : Promise.resolve(p && p.save ? p.save({ source: 'voiceLab' }) : null);
    return Promise.resolve(q).then(finishOk).catch(finishFail);
  }

  var dictationRecordCtl = null;

  function rerecordDictationKey(opts) {
    opts = opts || {};
    if (dictationRecordCtl && typeof dictationRecordCtl.dismiss === 'function') {
      try {
        dictationRecordCtl.dismiss();
      } catch (_) {}
      dictationRecordCtl = null;
    }
    function applyChord(chord) {
      chord = String(chord || '').trim();
      dictationRecordCtl = null;
      if (!chord) {
        syncDictationChrome();
        return;
      }
      var Ime = global.OneToneImePresets;
      var label =
        (Ime && typeof Ime.friendlyChord === 'function' && Ime.friendlyChord(chord)) || chord;
      if (Ime && typeof Ime.setVoiceTarget === 'function') {
        // 录键 = 自定义听写键（清空预设 id）；点选预设仍走 strip
        Ime.setVoiceTarget(chord, '');
      } else {
        var c = cfg();
        if (!c.voiceSapi) c.voiceSapi = {};
        if (!c.voiceVosk) c.voiceVosk = {};
        if (!c.voiceEnd) c.voiceEnd = {};
        c.voiceSapi.targetKey = chord;
        c.voiceVosk.targetKey = chord;
        c.voiceEnd.targetKey = chord;
        c.imePresetId = '';
        try {
          var persist = global.OneToneConfigPersist;
          if (persist && persist.save) persist.save({ source: 'voiceLab-dict-key' });
        } catch (_) {}
      }
      syncDictationChrome();
      toast(t('voiceLabDictKeyDone', '听写键已更新：{key}').replace('{key}', label));
      markDirty();
    }
    if (typeof global.OneToneHomeRecordChord === 'function') {
      dictationRecordCtl = global.OneToneHomeRecordChord(applyChord, {
        title: t('voiceLabDictRecordTitle', '录制听写键'),
        hint: t(
          'voiceLabDictRecordHint',
          '按下输入法听写快捷键（可单键右 Alt）— 松手确认 · Esc 取消'
        ),
      });
      return;
    }
    toast(t('voiceLabDictRecordUnavailable', '当前无法录键，请先选输入法方案'));
  }

  function applyFinishMode(mode, opts) {
    opts = opts || {};
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

    if (!opts.chromeOnly) {
      var End = global.OneToneVoiceEnd;
      if (End && typeof End.setOutputMode === 'function') {
        End.setOutputMode(mode)
          .then(function () {
            syncLabPhraseTags();
            syncRailDictSub();
          })
          .catch(function () {
            syncLabPhraseTags();
            syncRailDictSub();
          });
        return;
      }
    }
    syncLabPhraseTags();
    syncRailDictSub();
  }

  /* When-to-use copy — scenario first, not mechanism. */
  var AIM_HINT = {
    smart: '推荐 · 不录制；自动识别输入框并激活，再写入（找不到才用其它兜底）',
    auto: '先圈住聊天输入框再点一下；之后说话会回放同一落点再填入（辅助）',
    none: '不激活输入框；文字直接写到当前光标处',
    probe: '只有已经点进聊天输入框才写入；否则这轮先跳过（演示会交替两种情况）',
  };
  var aimDemoExpanded = false;
  var aimMouseActionRecorded = false;
  /* probe 演示交替：先跳过，再已对准填入 */
  var aimProbeHitNext = false;
  var phraseSheetFocus = 'primary';

  function currentAimStrategy() {
    var end = cfg().voiceEnd || {};
    var raw = String(end.inputAimStrategy || end.input_aim_strategy || 'auto')
      .trim()
      .toLowerCase();
    if (raw === 'none' || raw === 'probe' || raw === 'auto' || raw === 'smart') return raw;
    if (raw === 'uia') return 'smart';
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

  /*
   * Lab 四种产品策略：
   * smart — 不录制；UIA/智能识别输入框 → 激活 → 写入（主能力）
   * auto  — scheme-B 粗圈录制 → 回放落点 → 填入（辅助）
   * none  — 不激活；写到当前光标
   * probe — 已对准才写；演示交替「跳过 / 填入」
   * （见 src-tauri/src/input_focus_aim.rs）
   */
  var AIM_VOICE_SAMPLE = '继续改这里';
  var AIM_DEMO_STORY = {
    smart: {
      beats: [
        { icon: '🎙', label: '开始语音输入' },
        { icon: '◎', label: '自动识别输入框' },
        { icon: '☝', label: '激活输入框' },
        { icon: '✅', label: '填入完成' },
      ],
      endCls: 'is-ok',
      mark: '✅',
    },
    auto: {
      beats: [
        { icon: '🎙', label: '开始语音输入' },
        { icon: '☝', label: '回放动作 · 点进输入框' },
        { icon: '〰', label: '语音输入中' },
        { icon: '✅', label: '填入完成' },
      ],
      setupLine: '⏺ 圈住输入框 · 再点一下（一次，之后复用）',
      endCls: 'is-ok',
      mark: '✅',
    },
    none: {
      beats: [
        { icon: '🎙', label: '开始语音输入' },
        { icon: '〰', label: '语音输入中' },
        { icon: '✅', label: '写到光标处' },
      ],
      endCls: 'is-ok',
      mark: '✅',
    },
    probeMiss: {
      beats: [
        { icon: '↖', label: '还没点进输入框' },
        { icon: '🎙', label: '开始语音输入' },
        { icon: '🔍', label: '检查还没对准' },
        { icon: '⏭', label: '这轮先跳过' },
      ],
      endCls: 'is-muted',
      mark: '⏭',
    },
    probeHit: {
      beats: [
        { icon: '✎', label: '已点进输入框' },
        { icon: '🎙', label: '开始语音输入' },
        { icon: '🔍', label: '检查已对准' },
        { icon: '✅', label: '填入完成' },
      ],
      endCls: 'is-ok',
      mark: '✅',
    },
  };
  AIM_DEMO_STORY.probe = AIM_DEMO_STORY.probeMiss;
  var aimDemoTimers = [];
  var aimDemoLoopId = 0;

  function aimStoryForMode(mode) {
    if (mode === 'probe') {
      return aimProbeHitNext ? AIM_DEMO_STORY.probeHit : AIM_DEMO_STORY.probeMiss;
    }
    return AIM_DEMO_STORY[mode] || AIM_DEMO_STORY.auto;
  }

  function aimDemoBeatsHtml(mode, storyOpt) {
    var story = storyOpt || aimStoryForMode(mode);
    var html = '<ol class="voice-lab-aim-beats" data-vl-aim-beats>';
    for (var i = 0; i < story.beats.length; i++) {
      var b = story.beats[i];
      html +=
        '<li class="voice-lab-aim-beat" data-vl-aim-beat="' +
        i +
        '">' +
        '<span class="voice-lab-aim-beat__ico" aria-hidden="true">' +
        escAttr(b.icon) +
        '</span>' +
        '<span class="voice-lab-aim-beat__lbl">' +
        escAttr(b.label) +
        '</span></li>';
    }
    return html + '</ol>';
  }

  function syncAimBeats(demo, story) {
    var host = aimDemoHost(demo);
    if (!host || !story) return;
    var old = host.querySelector('[data-vl-aim-beats]');
    if (!old) return;
    var mode = demo.getAttribute('data-mode') || 'auto';
    var wrap = document.createElement('div');
    wrap.innerHTML = aimDemoBeatsHtml(mode, story);
    var next = wrap.firstChild;
    if (next) old.parentNode.replaceChild(next, old);
  }

  function normalizeAimDemoMode(mode) {
    mode = String(mode || 'auto').trim().toLowerCase();
    if (mode === 'none' || mode === 'probe' || mode === 'smart' || mode === 'auto') return mode;
    return 'auto';
  }

  function aimDemoHtml(mode, boxLbl) {
    mode = normalizeAimDemoMode(mode);
    return (
      aimDemoBeatsHtml(mode) +
      (mode === 'auto'
        ? '<div class="voice-lab-aim-rec-badge" data-vl-aim-rec-badge hidden>已记住位置 · 可复用</div>'
        : '') +
      '<div class="voice-lab-aim-stage" data-vl-aim-demo data-mode="' +
      escAttr(mode) +
      '" aria-hidden="true">' +
      '<div class="voice-lab-aim-capsule" data-vl-aim-capsule aria-hidden="true">' +
      '<span class="voice-lab-aim-capsule__mic" aria-hidden="true">🎙</span>' +
      '<span class="voice-lab-aim-capsule__status" data-vl-aim-cap-status></span>' +
      '<span class="voice-lab-aim-capsule__waves" data-vl-aim-cap-waves aria-hidden="true">' +
      '<i></i><i></i><i></i><i></i><i></i></span>' +
      '<span class="voice-lab-aim-capsule__partial" data-vl-aim-cap-partial></span>' +
      '</div>' +
      '<div class="voice-lab-aim-stage__box" data-vl-aim-box>' +
      '<span class="voice-lab-aim-stage__spot" data-vl-aim-spot aria-hidden="true"></span>' +
      '<span class="voice-lab-aim-stage__caret" data-vl-aim-caret></span>' +
      '<span class="voice-lab-aim-stage__typed" data-vl-aim-typed></span>' +
      '<span class="voice-lab-aim-stage__ph" data-vl-aim-ph>' +
      escAttr(boxLbl) +
      '</span></div>' +
      '<span class="voice-lab-aim-stage__mq" data-vl-aim-mq aria-hidden="true"></span>' +
      '<span class="voice-lab-aim-stage__pin" data-vl-aim-pin aria-hidden="true"></span>' +
      '<span class="voice-lab-aim-stage__click" data-vl-aim-click aria-hidden="true">圈住</span>' +
      '<span class="voice-lab-aim-stage__pointer" data-vl-aim-pointer aria-hidden="true"></span>' +
      '<span class="voice-lab-aim-stage__ripple" data-vl-aim-ripple aria-hidden="true"></span>' +
      '<span class="voice-lab-aim-stage__mark" data-vl-aim-mark aria-hidden="true"></span>' +
      '</div>' +
      '<p class="voice-lab-aim-demo-say is-muted" data-vl-aim-say>' +
      escAttr(t('voiceLabAimDemoLive', '正在演示')) +
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
    var demoOpen = !!aimDemoExpanded;
    return (
      '<div class="voice-lab-aim-head">' +
      '<span class="voice-lab-aim-lbl">' +
      escAttr(t('voiceLabAimTitle', '输入框对准')) +
      ' · ' +
      escAttr(t('voiceLabAimShared', '本习惯共用')) +
      '</span>' +
      '<span class="voice-lab-aim-agent" data-vl-aim-agent>' +
      escAttr(app) +
      ' · ' +
      escAttr(boxLbl) +
      '</span></div>' +
      '<div class="voice-lab-aim-segs" role="radiogroup" aria-label="' +
      escAttr(t('voiceLabAimTitle', '输入框对准')) +
      '">' +
      seg('smart', t('voiceLabAimSmart', '智能填入')) +
      seg('auto', t('keysSeqImeAimFirst', '先对准，再填入')) +
      seg('none', t('voiceLabAimNone', '直接填入')) +
      seg('probe', t('voiceLabAimProbe', '只在已对准时填')) +
      '</div>' +
      '<p class="voice-lab-aim-hint" data-vl-aim-hint>' +
      escAttr(AIM_HINT[mode] || AIM_HINT.auto) +
      '</p>' +
      '<button type="button" class="voice-lab-aim-demo-toggle' +
      (demoOpen ? ' is-open' : '') +
      '" data-vl-aim-demo-toggle aria-expanded="' +
      (demoOpen ? 'true' : 'false') +
      '">' +
      escAttr(
        demoOpen
          ? t('voiceLabAimDemoCollapse', '收起对准演示')
          : t('voiceLabAimDemoExpand', '点开看对准演示')
      ) +
      '</button>' +
      (demoOpen
        ? '<div class="voice-lab-aim-demo-wrap is-open" data-vl-aim-demo-wrap>' +
      aimDemoHtml(mode, boxLbl) +
      '</div>'
        : '')
    );
  }

  function clearAimDemoTimers() {
    for (var i = 0; i < aimDemoTimers.length; i++) clearTimeout(aimDemoTimers[i]);
    aimDemoTimers = [];
  }

  function aimDemoLater(ms, fn) {
    var id = setTimeout(fn, ms);
    aimDemoTimers.push(id);
    return id;
  }

  function aimDemoReduceMotion() {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function aimDemoHost(demo) {
    return demo && demo.parentNode;
  }

  function setAimBeat(demo, i) {
    var host = aimDemoHost(demo);
    var beats = host && host.querySelector('[data-vl-aim-beats]');
    if (!beats) return;
    var items = beats.querySelectorAll('[data-vl-aim-beat]');
    for (var n = 0; n < items.length; n++) {
      items[n].classList.toggle('is-on', n === i);
      items[n].classList.toggle('is-done', n < i);
    }
  }

  function aimDemoSay(demo, i, cls, storyOpt) {
    var mode = demo.getAttribute('data-mode') || 'auto';
    var story = storyOpt || aimStoryForMode(mode);
    var beat = story.beats[i];
    var say = aimDemoHost(demo) && aimDemoHost(demo).querySelector('[data-vl-aim-say]');
    if (!say || !beat) return;
    var line = beat.icon + ' ' + beat.label;
    if (i === story.beats.length - 1) {
      if (mode === 'smart') line = t('voiceAimDemoBadgeSmart', '✅ 智能填入完成');
      else if (mode === 'auto') line = t('voiceAimDemoBadgeAuto', '✅ 填入完成');
      else if (mode === 'none') line = t('voiceAimDemoBadgeNone', '✅ 写到光标处');
      else if (story.endCls === 'is-ok') line = t('voiceAimDemoBadgeProbeOk', '✅ 已对准 · 填入');
      else line = t('voiceAimDemoBadgeProbe', '⏭ 还没对准 · 这轮先跳过');
    }
    say.textContent = line;
    say.className =
      'voice-lab-aim-demo-say ' +
      (cls || (i === story.beats.length - 1 ? story.endCls : ''));
    setAimBeat(demo, i);
  }

  function aimDemoSayText(demo, text, cls) {
    var say = aimDemoHost(demo) && aimDemoHost(demo).querySelector('[data-vl-aim-say]');
    if (!say) return;
    say.textContent = text;
    say.className = 'voice-lab-aim-demo-say ' + (cls || '');
  }

  function showAimRecBadge(demo, on) {
    var badge =
      aimDemoHost(demo) && aimDemoHost(demo).querySelector('[data-vl-aim-rec-badge]');
    if (!badge) return;
    if (on) badge.removeAttribute('hidden');
    else badge.setAttribute('hidden', '');
  }

  function showAimMark(demo, story) {
    var mark = demo.querySelector('[data-vl-aim-mark]');
    if (!mark || !story) return;
    mark.textContent = story.mark || '';
    mark.className =
      'voice-lab-aim-stage__mark is-on ' + (story.endCls || '');
  }

  function setAimCapsule(demo, state, statusText, partialText) {
    var cap = demo.querySelector('[data-vl-aim-capsule]');
    if (!cap) return;
    cap.className = 'voice-lab-aim-capsule' + (state ? ' is-on is-' + state : '');
    var status = cap.querySelector('[data-vl-aim-cap-status]');
    var partial = cap.querySelector('[data-vl-aim-cap-partial]');
    if (status) status.textContent = statusText || '';
    if (partial) partial.textContent = partialText || '';
  }

  function placeAimMq(mq, rect, on) {
    if (!mq) return;
    if (!on || !rect) {
      mq.classList.remove('is-on', 'is-draw');
      mq.style.left = '';
      mq.style.top = '';
      mq.style.width = '';
      mq.style.height = '';
      return;
    }
    mq.style.left = Math.round(rect.l) + 'px';
    mq.style.top = Math.round(rect.t) + 'px';
    mq.style.width = Math.max(0, Math.round(rect.r - rect.l)) + 'px';
    mq.style.height = Math.max(0, Math.round(rect.b - rect.t)) + 'px';
    mq.classList.add('is-on');
  }

  function placeAimPin(pin, pt, on) {
    if (!pin) return;
    if (!on || !pt) {
      pin.classList.remove('is-on');
      pin.style.left = '';
      pin.style.top = '';
      return;
    }
    pin.style.left = pt.x + 'px';
    pin.style.top = pt.y + 'px';
    pin.classList.add('is-on');
  }

  function aimMqAroundBox(demo, boxEl) {
    if (!demo || !boxEl) return { l: 24, t: 48, r: 200, b: 86 };
    var sr = demo.getBoundingClientRect();
    var br = boxEl.getBoundingClientRect();
    var pad = 7;
    return {
      l: br.left - sr.left - pad,
      t: br.top - sr.top - pad,
      r: br.right - sr.left + pad,
      b: br.bottom - sr.top + pad,
    };
  }

  function resetAimStage(demo) {
    if (!demo) return;
    var box = demo.querySelector('[data-vl-aim-box]');
    var caret = demo.querySelector('[data-vl-aim-caret]');
    var typed = demo.querySelector('[data-vl-aim-typed]');
    var ph = demo.querySelector('[data-vl-aim-ph]');
    var pointer = demo.querySelector('[data-vl-aim-pointer]');
    var ripple = demo.querySelector('[data-vl-aim-ripple]');
    var click = demo.querySelector('[data-vl-aim-click]');
    var mark = demo.querySelector('[data-vl-aim-mark]');
    var spot = demo.querySelector('[data-vl-aim-spot]');
    var mq = demo.querySelector('[data-vl-aim-mq]');
    var pin = demo.querySelector('[data-vl-aim-pin]');
    if (box) {
      box.classList.remove(
        'is-focus',
        'is-probe',
        'is-probe-ok',
        'is-miss',
        'is-press',
        'is-dim'
      );
    }
    if (caret) caret.classList.remove('is-on');
    if (typed) typed.textContent = '';
    if (ph) ph.classList.remove('is-hide');
    if (pointer) {
      pointer.classList.remove('is-show', 'is-press', 'is-rec', 'is-replay');
      pointer.style.left = '';
      pointer.style.top = '';
    }
    if (ripple) ripple.classList.remove('is-on');
    if (click) {
      click.classList.remove('is-on', 'is-rec', 'is-replay');
      click.textContent = '圈住';
    }
    if (spot) spot.classList.remove('is-on', 'is-rec');
    placeAimMq(mq, null, false);
    placeAimPin(pin, null, false);
    demo.classList.remove('is-rec', 'is-replay');
    setAimCapsule(demo, '', '', '');
    if (mark) {
      mark.textContent = '';
      mark.className = 'voice-lab-aim-stage__mark';
    }
    showAimRecBadge(demo, !!aimMouseActionRecorded);
    /* After first record, keep marquee+pin as the replay target. */
    if (aimMouseActionRecorded && demo.getAttribute('data-mode') === 'auto' && box) {
      var kept = aimMqAroundBox(demo, box);
      placeAimMq(mq, kept, true);
      placeAimPin(pin, aimBoxPoint(demo, box, 0.55), true);
    }
    setAimBeat(demo, -1);
    var say = aimDemoHost(demo) && aimDemoHost(demo).querySelector('[data-vl-aim-say]');
    if (say) {
      say.textContent = t('voiceLabAimDemoLive', '正在演示');
      say.className = 'voice-lab-aim-demo-say is-muted';
    }
  }

  function aimBoxPoint(demo, box, xRatio) {
    var sr = demo.getBoundingClientRect();
    var br = box.getBoundingClientRect();
    return {
      x: br.left - sr.left + br.width * (xRatio == null ? 0.7 : xRatio),
      y: br.top - sr.top + br.height * 0.5,
    };
  }

  function aimOffPoint(demo) {
    /* Keep inside padded stage so labels are not clipped. */
    return { x: 22, y: 48 };
  }

  function placeAimPointer(pointer, pt, show) {
    if (!pointer) return;
    pointer.style.left = pt.x + 'px';
    pointer.style.top = pt.y + 'px';
    pointer.classList.toggle('is-show', !!show);
  }

  function fireAimRipple(ripple, pt) {
    if (!ripple) return;
    ripple.classList.remove('is-on');
    ripple.style.left = pt.x + 'px';
    ripple.style.top = pt.y + 'px';
    void ripple.offsetWidth;
    ripple.classList.add('is-on');
  }

  function showAimClickLabel(click, pt, text, kind) {
    if (!click) return;
    /* Sit just above the pointer, still inside stage padding. */
    if (text) click.textContent = text;
    click.classList.remove('is-rec', 'is-replay');
    if (kind === 'rec') click.classList.add('is-rec');
    if (kind === 'replay') click.classList.add('is-replay');
    click.style.left = pt.x + 'px';
    click.style.top = Math.max(14, pt.y - 22) + 'px';
    click.classList.remove('is-on');
    void click.offsetWidth;
    click.classList.add('is-on');
  }

  function typeAimText(el, text, interval, done) {
    var i = 0;
    if (el) el.textContent = '';
    function tick() {
      if (!el) {
        if (done) done();
        return;
      }
      if (i >= text.length) {
        if (done) done();
        return;
      }
      el.textContent += text.charAt(i);
      i += 1;
      aimDemoLater(interval, tick);
    }
    tick();
  }

  function runAimDemoLoop(demo, loopId) {
    if (!demo || loopId !== aimDemoLoopId) return;
    var mode = normalizeAimDemoMode(demo.getAttribute('data-mode') || 'auto');
    var story = aimStoryForMode(mode);
    syncAimBeats(demo, story);
    var box = demo.querySelector('[data-vl-aim-box]');
    var caret = demo.querySelector('[data-vl-aim-caret]');
    var typed = demo.querySelector('[data-vl-aim-typed]');
    var ph = demo.querySelector('[data-vl-aim-ph]');
    var pointer = demo.querySelector('[data-vl-aim-pointer]');
    var ripple = demo.querySelector('[data-vl-aim-ripple]');
    var click = demo.querySelector('[data-vl-aim-click]');
    var mq = demo.querySelector('[data-vl-aim-mq]');
    var pin = demo.querySelector('[data-vl-aim-pin]');
    var sample = AIM_VOICE_SAMPLE;

    function alive() {
      return loopId === aimDemoLoopId && aimDemoExpanded && demo.isConnected;
    }

    function finishHold(after) {
      aimDemoLater(2400, function () {
        if (!alive()) return;
        if (after) after();
        clearAimDemoTimers();
        resetAimStage(demo);
        runAimDemoLoop(demo, loopId);
      });
    }

    function sayBeat(i, cls) {
      aimDemoSay(demo, i, cls, story);
    }

    /* 语音输入条弹出 = 开始 */
    function startVoiceCapsule(beatIdx, then) {
      sayBeat(beatIdx == null ? 0 : beatIdx);
      setAimCapsule(demo, 'start', '开始语音输入…', '');
      aimDemoLater(500, function () {
        if (!alive()) return;
        setAimCapsule(demo, 'listen', '语音输入中…', '');
      });
      aimDemoLater(1100, function () {
        if (!alive()) return;
        if (then) then();
      });
    }

    /*
     * Scheme-B mirror of input-aim-calibrate.html:
     * rec = 截屏粗圈拖选 → 框内点一下；replay = 出示已录蓝框 → 点同一落点。
     */
    function playAimMouseStroke(kind, start, end, then) {
      var isRec = kind === 'rec';
      var mqRect = box ? aimMqAroundBox(demo, box) : { l: 18, t: 44, r: 210, b: 88 };
      var dragFrom = { x: mqRect.l, y: mqRect.t };
      var dragTo = { x: mqRect.r, y: mqRect.b };
      var clickAt = end || {
        x: (mqRect.l + mqRect.r) / 2,
        y: (mqRect.t + mqRect.b) / 2,
      };
      if (pointer) pointer.classList.remove('is-rec', 'is-replay', 'is-press');
      demo.classList.toggle('is-rec', isRec);
      demo.classList.toggle('is-replay', !isRec);
      if (pointer) pointer.classList.add(isRec ? 'is-rec' : 'is-replay');

      if (isRec) {
        /* Step1: dim + drag marquee (截屏选框) */
        aimDemoSayText(demo, '第一步：按住拖动，圈住输入框');
        placeAimPin(pin, null, false);
        placeAimMq(mq, { l: dragFrom.x, t: dragFrom.y, r: dragFrom.x, b: dragFrom.y }, true);
        if (mq) mq.classList.add('is-draw');
        placeAimPointer(pointer, dragFrom, true);
        showAimClickLabel(click, dragFrom, '圈住', 'rec');
        aimDemoLater(280, function () {
          if (!alive()) return;
          placeAimMq(mq, mqRect, true);
          placeAimPointer(pointer, dragTo, true);
        });
        aimDemoLater(1100, function () {
          if (!alive()) return;
          if (mq) mq.classList.remove('is-draw');
          /* Step2: click inside blue box */
          aimDemoSayText(demo, '第二步：在蓝框内点一下精确落点');
          showAimClickLabel(click, clickAt, '点一下', 'rec');
          placeAimPointer(pointer, {
            x: Math.max(dragFrom.x + 8, clickAt.x - 28),
            y: Math.max(dragFrom.y + 8, clickAt.y - 10),
          }, true);
        });
        aimDemoLater(1500, function () {
          if (!alive()) return;
          placeAimPointer(pointer, clickAt, true);
        });
        aimDemoLater(1900, function () {
          if (!alive()) return;
          if (pointer) pointer.classList.add('is-press');
          placeAimPin(pin, clickAt, true);
          fireAimRipple(ripple, clickAt);
        });
        aimDemoLater(2600, function () {
          if (!alive()) return;
          if (pointer) {
            pointer.classList.remove('is-press', 'is-show', 'is-rec', 'is-replay');
          }
          if (click) click.classList.remove('is-on', 'is-rec', 'is-replay');
          demo.classList.remove('is-rec', 'is-replay');
          if (then) then();
        });
        return;
      }

      /* Replay: show recorded marquee, click the same pin (no re-drag). */
      placeAimMq(mq, mqRect, true);
      placeAimPin(pin, clickAt, true);
      var from = start || {
        x: Math.max(12, clickAt.x - 48),
        y: Math.max(36, clickAt.y - 16),
      };
      placeAimPointer(pointer, from, true);
      aimDemoLater(280, function () {
        if (!alive()) return;
        placeAimPointer(pointer, clickAt, true);
      });
      aimDemoLater(1000, function () {
        if (!alive()) return;
        if (pointer) pointer.classList.add('is-press');
        if (box) box.classList.add('is-press');
        showAimClickLabel(click, clickAt, '回放', 'replay');
        fireAimRipple(ripple, clickAt);
        placeAimPin(pin, clickAt, true);
      });
      aimDemoLater(1700, function () {
        if (!alive()) return;
        if (pointer) {
          pointer.classList.remove('is-press', 'is-show', 'is-rec', 'is-replay');
        }
        if (click) click.classList.remove('is-on', 'is-rec', 'is-replay');
        demo.classList.remove('is-rec', 'is-replay');
        if (box) {
          box.classList.remove('is-press');
          box.classList.add('is-focus');
        }
        if (caret) caret.classList.add('is-on');
        if (then) then();
      });
    }

    function activateBoxByReplay(end, start, then) {
      /* 回放 = 出示已录蓝框 + 点同一落点，点进输入框 */
      sayBeat(1);
      setAimCapsule(demo, 'listen', '语音输入中…', '');
      playAimMouseStroke('replay', start, end, then);
    }

    /* 语音输入中 → 写入输入框；skipSay 用于 probe 已对准（节拍已在「检查」） */
    function capsuleTranscribeAndCommit(beatIdx, then, skipSay) {
      if (!skipSay) sayBeat(beatIdx == null ? 2 : beatIdx);
      setAimCapsule(demo, 'transcribe', '语音输入中…', '');
      aimDemoLater(350, function () {
        if (!alive()) return;
        typeAimText(
          demo.querySelector('[data-vl-aim-cap-partial]'),
          sample,
          90,
          function () {
            if (!alive()) return;
            aimDemoLater(380, function () {
              if (!alive()) return;
              setAimCapsule(demo, 'commit', '填入中…', '');
              if (ph) ph.classList.add('is-hide');
              if (box) {
                box.classList.remove('is-dim', 'is-miss', 'is-probe');
                box.classList.add('is-focus');
              }
              if (caret) caret.classList.add('is-on');
              typeAimText(typed, sample, 70, function () {
                if (!alive()) return;
                aimDemoLater(320, function () {
                  if (!alive()) return;
                  setAimCapsule(demo, '', '', '');
                  if (then) then();
                });
              });
            });
          }
        );
      });
    }

    /* 智能填入：自动识别输入框并激活（无粗圈录制） */
    function autoFindAndActivateBox(then) {
      sayBeat(1);
      setAimCapsule(demo, 'listen', '正在识别输入框…', '');
      var end = box ? aimBoxPoint(demo, box, 0.55) : { x: 120, y: 48 };
      var from = aimOffPoint(demo);
      placeAimPointer(pointer, from, true);
      if (box) box.classList.add('is-probe-ok');
      aimDemoLater(280, function () {
        if (!alive()) return;
        placeAimPointer(pointer, end, true);
      });
      aimDemoLater(900, function () {
        if (!alive()) return;
        sayBeat(2);
        setAimCapsule(demo, 'listen', '正在激活…', '');
        if (pointer) pointer.classList.add('is-press');
        if (box) {
          box.classList.remove('is-probe-ok');
          box.classList.add('is-press');
        }
        fireAimRipple(ripple, end);
        showAimClickLabel(click, end, '激活', 'replay');
      });
      aimDemoLater(1400, function () {
        if (!alive()) return;
        if (pointer) {
          pointer.classList.remove('is-press', 'is-show', 'is-rec', 'is-replay');
        }
        if (click) click.classList.remove('is-on', 'is-rec', 'is-replay');
        if (box) {
          box.classList.remove('is-press');
          box.classList.add('is-focus');
        }
        if (caret) caret.classList.add('is-on');
        setAimCapsule(demo, 'listen', '已激活输入框…', '');
        if (then) then();
      });
    }

    if (aimDemoReduceMotion()) {
      resetAimStage(demo);
      if (mode === 'auto') {
        aimMouseActionRecorded = true;
        showAimRecBadge(demo, true);
      }
      if (mode === 'probe' && !aimProbeHitNext) {
        if (box) box.classList.add('is-miss');
      } else {
        if (box) box.classList.add('is-focus');
        if (caret) caret.classList.add('is-on');
        if (ph) ph.classList.add('is-hide');
        if (typed) typed.textContent = sample;
      }
      sayBeat(story.beats.length - 1, story.endCls);
      showAimMark(demo, story);
      return;
    }

    if (mode === 'auto') {
      var end = box ? aimBoxPoint(demo, box, 0.55) : { x: 120, y: 48 };
      var start = { x: Math.max(16, end.x - 56), y: Math.max(36, end.y - 18) };

      function runAutoRuntime() {
        startVoiceCapsule(0, function () {
          activateBoxByReplay(end, start, function () {
            capsuleTranscribeAndCommit(2, function () {
              if (!alive()) return;
              sayBeat(3, 'is-ok');
              showAimMark(demo, story);
              finishHold();
            });
          });
        });
      }

      if (!aimMouseActionRecorded) {
        /* 先对准专有：scheme-B 截屏粗圈 → 框内点（直接填入没有这一拍） */
        setAimBeat(demo, -1);
        aimDemoSayText(demo, story.setupLine || '⏺ 圈住输入框 · 再点一下（一次，之后复用）');
        playAimMouseStroke('rec', start, end, function () {
          if (!alive()) return;
          aimMouseActionRecorded = true;
          showAimRecBadge(demo, true);
          aimDemoSayText(demo, '已记住位置 · 之后会点回同一处', 'is-ok');
          aimDemoLater(1100, function () {
            if (!alive()) return;
            resetAimStage(demo);
            runAutoRuntime();
          });
        });
        return;
      }

      runAutoRuntime();
      return;
    }

    if (mode === 'smart') {
      /* 智能填入：无录制；识别 → 激活 → 写入（不丢语音） */
      placeAimMq(mq, null, false);
      placeAimPin(pin, null, false);
      startVoiceCapsule(0, function () {
        if (!alive()) return;
        autoFindAndActivateBox(function () {
          if (!alive()) return;
          capsuleTranscribeAndCommit(3, function () {
            if (!alive()) return;
            sayBeat(3, 'is-ok');
            showAimMark(demo, story);
            finishHold();
          }, true);
        });
      });
      return;
    }

    if (mode === 'none') {
      /* 直接填入：不激活；假定光标已在目标处，直接写入 */
      placeAimMq(mq, null, false);
      placeAimPin(pin, null, false);
      if (box) box.classList.add('is-focus');
      if (caret) caret.classList.add('is-on');
      startVoiceCapsule(0, function () {
        if (!alive()) return;
        capsuleTranscribeAndCommit(1, function () {
          if (!alive()) return;
          sayBeat(2, 'is-ok');
          showAimMark(demo, story);
          finishHold();
        });
      });
      return;
    }

    /* probe: 交替「还没对准跳过」与「已对准填入」；永不粗圈 */
    placeAimMq(mq, null, false);
    placeAimPin(pin, null, false);

    if (aimProbeHitNext) {
      /* 已点进聊天框：检查通过 → 填入 */
      if (box) box.classList.add('is-focus');
      if (caret) caret.classList.add('is-on');
      sayBeat(0);
      aimDemoLater(900, function () {
        if (!alive()) return;
        startVoiceCapsule(1, function () {
          if (!alive()) return;
          sayBeat(2);
          setAimCapsule(demo, 'listen', '检查已对准…', '');
          if (box) {
            box.classList.remove('is-probe', 'is-miss', 'is-dim');
            box.classList.add('is-focus', 'is-probe-ok');
          }
          aimDemoLater(900, function () {
            if (!alive()) return;
            if (box) box.classList.remove('is-probe-ok');
            capsuleTranscribeAndCommit(
              2,
              function () {
                if (!alive()) return;
                sayBeat(3, 'is-ok');
                showAimMark(demo, story);
                finishHold(function () {
                  aimProbeHitNext = false;
                });
              },
              true
            );
          });
        });
      });
      return;
    }

    /* 还没点进输入框：检查未过 → 这轮先跳过（不写入） */
    if (box) box.classList.add('is-dim');
    sayBeat(0);
    placeAimPointer(pointer, aimOffPoint(demo), true);
    aimDemoLater(1000, function () {
      if (!alive()) return;
      startVoiceCapsule(1, function () {
        if (!alive()) return;
        sayBeat(2);
        setAimCapsule(demo, 'listen', '检查还没对准…', '');
        if (pointer) pointer.classList.remove('is-show');
        if (box) {
          box.classList.remove('is-dim');
          box.classList.add('is-probe');
        }
        aimDemoLater(1200, function () {
          if (!alive()) return;
          if (box) {
            box.classList.remove('is-probe');
            box.classList.add('is-miss');
          }
          setAimCapsule(demo, 'skip', '还没对准 · 这轮先跳过', '');
          sayBeat(3, 'is-muted');
          showAimMark(demo, story);
          finishHold(function () {
            aimProbeHitNext = true;
          });
        });
      });
    });
  }

  function restartAimDemos() {
    clearAimDemoTimers();
    aimDemoLoopId += 1;
    if (!aimDemoExpanded) return;
    var panel = root();
    if (!panel) return;
    var demos = panel.querySelectorAll('[data-vl-aim-demo]');
    var loopId = aimDemoLoopId;
    var picked = null;
    for (var i = 0; i < demos.length; i++) {
      var demo = demos[i];
      resetAimStage(demo);
      var pane = demo.closest('.voice-lab-pane');
      var visible =
        (!pane || !pane.hasAttribute('hidden')) &&
        demo.offsetParent !== null;
      if (visible && !picked) picked = demo;
    }
    if (picked) runAimDemoLoop(picked, loopId);
  }

  function setAimDemoExpanded(open) {
    aimDemoExpanded = !!open;
    if (!open) {
      aimMouseActionRecorded = false;
      aimProbeHitNext = false;
    }
    syncAimBlocks();
  }

  function setAimStrategy(strategy) {
    strategy = normalizeAimDemoMode(strategy);
    var st = global.OneToneState && global.OneToneState.state;
    if (!st || !st.config) return;
    if (!st.config.voiceEnd || typeof st.config.voiceEnd !== 'object') st.config.voiceEnd = {};
    st.config.voiceEnd.inputAimStrategy = strategy;
    st.config.voiceEnd.input_aim_strategy = strategy;
    /* Switching mode re-shows auto record / probe miss first. */
    aimMouseActionRecorded = false;
    aimProbeHitNext = false;
    var sel = $('voiceInputAimStrategy');
    if (sel) sel.value = strategy;
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

  function currentEngineMode() {
    try {
      var R = global.OneToneVoiceEngineReadiness;
      if (R && typeof R.preferredEngine === 'function') {
        var pref = String(R.preferredEngine() || '').trim().toLowerCase();
        if (pref === 'sapi' || pref === 'vosk' || pref === 'kws') return pref;
      }
    } catch (_) {}
    try {
      var summary = global.OneToneVoiceHomeSummary && global.OneToneVoiceHomeSummary.compute
        ? global.OneToneVoiceHomeSummary.compute()
        : null;
      var eng = summary && summary.engine ? String(summary.engine).toLowerCase() : '';
      if (eng === 'sapi' || eng === 'vosk' || eng === 'kws') return eng;
    } catch (_) {}
    return 'vosk';
  }

  function resolveMicName() {
    try {
      var summary = global.OneToneVoiceHomeSummary && global.OneToneVoiceHomeSummary.compute
        ? global.OneToneVoiceHomeSummary.compute()
        : null;
      if (summary && summary.micLabel) return String(summary.micLabel);
    } catch (_) {}
    try {
      var mic = global.OneToneAppMic;
      var devices = mic && typeof mic.micDevices === 'function' ? mic.micDevices() : (mic && mic.devices) || [];
      var activeId = mic && typeof mic.activeMicId === 'function' ? mic.activeMicId() : '';
      var list = Array.isArray(devices) ? devices : [];
      var i;
      for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].id === activeId) return list[i].name || list[i].id || '';
      }
      for (i = 0; i < list.length; i++) {
        if (list[i] && list[i].isDefault) return list[i].name || list[i].id || '';
      }
      if (list[0]) return list[0].name || list[0].id || '';
    } catch (_) {}
    return t('homeVoiceMapMicEmpty', '默认麦克风');
  }

  /** Mic + engine chrome in Lab advanced fold (no intent rail). */
  function syncAdvancedChrome() {
    var micName = $('voiceLabMicName');
    if (micName) micName.textContent = resolveMicName() || t('homeVoiceMapMicEmpty', '默认麦克风');
    var mode = currentEngineMode();
    var grid = $('voiceLabEngineGrid');
    if (grid) {
      var btns = grid.querySelectorAll('[data-voice-engine-tab]');
      for (var i = 0; i < btns.length; i++) {
        var tab = btns[i].getAttribute('data-voice-engine-tab') || '';
        var on = tab === mode;
        btns[i].classList.toggle('is-on', on);
        btns[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }
    syncResourceStatus();
    paintLabMicPicker(false);
  }

  var labVoskAutoKickDone = false;

  function wakeVoskStatus() {
    try {
      var Ui = global.OneToneVoiceUiState;
      var raw = Ui && typeof Ui.snapshot === 'function' ? Ui.snapshot() : Ui && Ui.snapshot;
      var wake = raw && raw.wake ? raw.wake : null;
      return wake && wake.vosk ? wake.vosk : null;
    } catch (_) {
      return null;
    }
  }

  /** True when local-offline needs a model/DLL download (not a plain start retry). */
  function labVoskNeedsDownload(voskRes) {
    voskRes = voskRes || wakeVoskStatus();
    if (!voskRes) {
      // No status yet but preferred/engine is vosk and snapshot says not ready → treat as downloadable.
      return false;
    }
    if (voskRes.modelExists === false || voskRes.dllExists === false) return true;
    var issue = String(voskRes.resourceIssue || '');
    if (issue === 'model_missing' || issue === 'dll_missing') return true;
    if (voskRes.modelMissing === true) return true;
    var err = String(voskRes.lastError || '').toLowerCase();
    if (err.indexOf('model_missing') >= 0 || err.indexOf('model not found') >= 0 || err.indexOf('load model failed') >= 0) {
      return true;
    }
    if (err.indexOf('dll_missing') >= 0 || err.indexOf('failed to load') >= 0) return true;
    return false;
  }

  function labVoskDllOnly(voskRes) {
    voskRes = voskRes || wakeVoskStatus();
    if (!voskRes) return false;
    if (voskRes.dllExists === false) return true;
    return String(voskRes.resourceIssue || '') === 'dll_missing';
  }

  function openLabAdvanced() {
    var adv = $('voiceLabAdvanced');
    if (adv) adv.open = true;
  }

  function kickLabVoskDownload(reason) {
    openLabAdvanced();
    var Wake = global.OneToneVoiceWake;
    if (!Wake) return;
    if (typeof Wake.downloadVoskModelGuide === 'function') Wake.downloadVoskModelGuide();
    else if (typeof Wake.downloadVoskModel === 'function') Wake.downloadVoskModel();
    if (reason === 'auto') labVoskAutoKickDone = true;
    setTimeout(syncAdvancedChrome, 200);
  }

  function syncResourceStatus() {
    var host = $('voiceLabResourceStatus');
    if (!host) return;
    var snap = null;
    try {
      if (global.OneToneVoiceUiState && global.OneToneVoiceUiState.getVoiceStatusSnapshot) {
        snap = global.OneToneVoiceUiState.getVoiceStatusSnapshot();
      }
          } catch (_) {}
    var Ready = global.OneToneVoiceEngineReadiness;
    var bits = [];
    var eng = snap && snap.engine ? snap.engine : currentEngineMode();
    var voskRes = wakeVoskStatus();
    var needsDl = eng === 'vosk' && labVoskNeedsDownload(voskRes);
    var dllOnly = needsDl && labVoskDllOnly(voskRes);
    var notReady = !!(snap && (!snap.resourceReady || snap.error)) || needsDl;
    bits.push(eng === 'sapi' ? '系统自带' : eng === 'kws' ? '只听口令' : '本地离线');
    if (needsDl) {
      bits.push(dllOnly ? t('voiceLabResourceDllMissing', '识别组件缺失') : t('voiceLabResourceMissing', '模型或组件未就绪'));
    } else if (snap && snap.resourceReady) {
      bits.push(t('voiceLabResourceReady', '资源就绪'));
    } else {
      bits.push(t('voiceLabResourceMissing', '模型或组件未就绪'));
    }
    if (snap && snap.error) bits.push(String(snap.error));
    if (snap && snap.degraded && snap.degradedReason) bits.push(String(snap.degradedReason));
    host.textContent = bits.filter(Boolean).join(' · ');
    host.classList.toggle('is-warn', notReady);

    var dlBtn = $('voiceLabResourceDownload');
    if (dlBtn) {
      dlBtn.hidden = !needsDl || dllOnly;
      if (!dlBtn.hidden) {
        dlBtn.textContent = t('voiceVoskDownloadGuide', '一键下载模型');
      }
    }
    var retry = $('voiceLabResourceRetry');
    if (retry) {
      // Retry when not ready but model likely present; also keep visible during dll/missing as secondary.
      retry.hidden = !notReady;
      if (needsDl && !dllOnly) retry.textContent = t('voiceVoskRetry', '重试启动');
    }
    var guide = $('voiceLabResourceGuide');
    if (guide) {
      if (dllOnly) {
        guide.hidden = false;
        guide.textContent = t(
          'voiceLabDllGuide',
          '本地离线组件未装好。请重装 OneTone 或改用「系统自带」。'
        );
      } else if (eng === 'sapi') {
        guide.hidden = false;
        guide.textContent = t(
          'voiceLabSapiGuide',
          '若识别失败，请在 Windows 设置中启用语音识别组件，或改用本地离线。'
        );
      } else if (needsDl) {
        guide.hidden = false;
        guide.textContent = t(
          'voiceLabVoskGuide',
          '首次使用本地离线需下载语音模型，大约几十秒即可开始听写。'
        );
      } else {
        guide.hidden = true;
      }
      void Ready;
    }
    if (notReady && eng === 'vosk') openLabAdvanced();
    // First Lab open with preferred vosk missing → start download once (fast path).
    if (needsDl && !dllOnly && !labVoskAutoKickDone && eng === 'vosk') {
      kickLabVoskDownload('auto');
    }
  }

  function listMicDevices() {
    try {
      var mic = global.OneToneAppMic;
      var devices = mic && typeof mic.micDevices === 'function' ? mic.micDevices() : (mic && mic.devices) || [];
      return Array.isArray(devices) ? devices : [];
    } catch (_) {
      return [];
    }
  }

  function activeMicId() {
    try {
      var mic = global.OneToneAppMic;
      if (mic && typeof mic.activeMicId === 'function') return String(mic.activeMicId() || '');
      if (mic && mic.activeId) return String(mic.activeId || '');
    } catch (_) {}
    return '';
  }

  function paintLabMicPicker(open) {
    var picker = $('voiceLabMicPicker');
    if (!picker) return;
    if (open === false) {
      // keep list if already open
    }
    var devices = listMicDevices();
    var active = activeMicId();
    if (!devices.length) {
      picker.innerHTML =
        '<p class="voice-lab-mic-empty">' +
        escAttr(t('homeVoiceMapMicEmpty', '未检测到麦克风')) +
        '</p>';
        return;
    }
    var html = '';
    for (var i = 0; i < devices.length; i++) {
      var d = devices[i] || {};
      var id = String(d.id || '');
      var name = String(d.name || d.id || 'mic');
      var on = id && id === active;
      html +=
        '<button type="button" class="voice-lab-mic-opt' +
        (on ? ' is-on' : '') +
        '" data-vl-mic-id="' +
        escAttr(id) +
        '">' +
        escAttr(name) +
        (d.isDefault ? ' · 默认' : '') +
        '</button>';
    }
    picker.innerHTML = html;
  }

  function setLabMicPickerOpen(open) {
    var picker = $('voiceLabMicPicker');
    var adv = $('voiceLabAdvanced');
    if (adv && open) adv.open = true;
    if (!picker) return;
    picker.hidden = !open;
    if (open) paintLabMicPicker(true);
  }

  function openLabMicPicker() {
    var picker = $('voiceLabMicPicker');
    if (picker) {
      setLabMicPickerOpen(!!picker.hidden);
      return;
    }
    // Fallback: still prefer staying on Lab — open advanced fold.
    var adv = $('voiceLabAdvanced');
    if (adv) adv.open = true;
  }

  function pickLabMic(id) {
    id = String(id || '').trim();
    if (!id) return;
    try {
      var mic = global.OneToneAppMic;
      if (mic && typeof mic.setActiveMicId === 'function') mic.setActiveMicId(id);
      else if (mic && typeof mic.selectDevice === 'function') mic.selectDevice(id);
      else if (global.OneToneIpc && global.OneToneIpc.invoke) {
        global.OneToneIpc.invoke('cmd_set_mic_device', { deviceId: id, id: id }).catch(function () {});
      }
    } catch (err) {
      console.error('voiceLab mic', err);
    }
    setLabMicPickerOpen(false);
    syncAdvancedChrome();
    markDirty();
  }

  function syncLiveFromSnapshot() {
    var snap = null;
    try {
      if (global.OneToneVoiceUiState && global.OneToneVoiceUiState.getVoiceStatusSnapshot) {
        snap = global.OneToneVoiceUiState.getVoiceStatusSnapshot();
      }
    } catch (_) {}
    if (!snap) return;
    var pill = $('voiceLabLivePill');
    var pillText = $('voiceLabLivePillText');
    var line = snap.statusLine || '';
    if (!line) {
      if (snap.error) line = snap.error;
      else if (snap.listening) line = t('voiceFbStatusListening', '聆听中');
      else if (!snap.voiceOn || snap.engine === 'off') line = t('voiceFbStatusOff', '已关闭');
      else line = t('voiceFbStatusStandby', '待命');
    }
    if (pillText) pillText.textContent = line;
    if (pill) {
      pill.classList.toggle('is-idle', !snap.listening && !snap.error);
      pill.classList.toggle('is-live', !!snap.listening);
      pill.classList.toggle('is-warn', !!snap.error || !snap.resourceReady);
      pill.title = [snap.engine, snap.mic, snap.heardText || snap.lastTrigger].filter(Boolean).join(' · ');
    }
    var liveMeta = $('voiceLabLiveMeta');
    if (liveMeta && paneId === 'gate') {
      liveMeta.innerHTML =
        '<strong>' +
        escAttr(line) +
        '</strong><br/>' +
        escAttr(snap.engine || '—') +
        ' · ' +
        escAttr(snap.mic || '—') +
        (snap.heardText ? '<br/>' + escAttr(snap.heardText) : '');
    }
    syncAdvancedChrome();
  }

  function syncBridgeHosts() {
    // Gate no longer jumps Soft Pad / keys / camera as channels — Soft Pad oral
    // chrome + preview live on this page.
    syncOralChromeHost();
  }

  function syncOralChromeHost() {
    var host = $('voiceLabOralChromeHost');
    if (!host) return;
    var Oral = global.OneToneOralCommandUi;
    if (!Oral || typeof Oral.mountSoftPadOralChrome !== 'function') {
      host.innerHTML =
        '<p class="voice-lab-oral-chrome-miss">' +
        escAttr(t('voiceLabOralChromeMiss', '口令外观组件未加载')) +
        '</p>';
      return;
    }
    var m = activeMapping();
    var mid = m && m.id ? String(m.id) : '';
    var live = host.querySelector('[data-oral-chrome-root]');
    var liveMid = live ? String(live.getAttribute('data-oral-mapping') || '').trim() : '';
    // Remount when habit changes; keep live root if same mapping (preserve toggles).
    if (!live || liveMid !== mid) {
      try {
        Oral.mountSoftPadOralChrome(host, { mappingId: mid });
      } catch (err) {
        console.error('voiceLab oral chrome', err);
      }
    }
  }

  function paintBridgeSummary(kind) {
    var hostId =
      kind === 'keys' ? 'voiceLabBridgeKeys' : kind === 'camera' ? 'voiceLabBridgeCamera' : 'voiceLabBridgeSoftPad';
    var host = $(hostId);
    if (!host) return;
    var m = activeMapping();
    var empty = true;
    var label = '';
    if (kind === 'softpad') {
      var Sp = global.OneToneVoiceBridgeSoftPad;
      var keys = Sp && Sp.padKeys ? Sp.padKeys(m) : [];
      empty = !keys.length;
      label = empty
        ? t('voiceLabBridgeSpEmpty', '还没有 Soft Pad 键口令 · 去 Soft Pad 准备键盘后回写')
        : t('voiceLabBridgeSpLinked', '已关联 {n} 颗 Soft Pad 键').replace('{n}', String(keys.length));
    } else if (kind === 'keys') {
      var K = global.OneToneVoiceBridgeKeys;
      var rows = K && K.listRows ? K.listRows(false) : [];
      empty = !rows.length;
      label = empty
        ? t('voiceLabBridgeKeysEmpty', '还没有按键口令 · 点选按键页动作后写回')
        : t('voiceLabBridgeKeysLinked', '已关联 {n} 条按键动作').replace('{n}', String(rows.length));
    } else {
      var Cam = global.OneToneVoiceBridgeCamera;
      var cams =
        Cam && Cam.listCameraVoice
          ? Cam.listCameraVoice()
          : Cam && Cam.listCameraRows
            ? Cam.listCameraRows()
            : [];
      empty = !cams.length;
      label = empty
        ? t('voiceLabBridgeCamEmpty', '还没有摄像头口令 · 先在摄像头页打开动作')
        : t('voiceLabBridgeCamLinked', '已关联 {n} 个摄像头动作').replace('{n}', String(cams.length));
    }
    var status = host.querySelector('[data-vl-bridge-status]');
    if (status) status.textContent = label;
    host.classList.toggle('is-empty', empty);
    host.classList.toggle('is-linked', !empty);
  }

  function focusRegion(focus) {
    var Nav = global.OneToneVoiceNav;
    focus = Nav && Nav.normalizeFocus ? Nav.normalizeFocus(focus) : String(focus || '').trim();
    if (focus === 'wake') selectPane('gate');
    else if (focus === 'finish') selectPane('dictation');
    else if (focus === 'softpad' || focus === 'keys' || focus === 'camera') selectPane('gate');
    var adv = $('voiceLabAdvanced');
    if ((focus === 'mic' || focus === 'engine') && adv) adv.open = true;
    if (focus === 'mic') setLabMicPickerOpen(true);
    var map = {
      wake: 'voiceLabWakePhrase',
      finish: 'voiceLabFinishCard',
      mic: 'voiceLabMicBtn',
      engine: 'voiceLabEngineGrid',
      softpad: 'voiceLabOralChromeHost',
      keys: 'voiceLabOralChromeHost',
      camera: 'voiceLabOralChromeHost',
    };
    var id = map[focus];
    var el = id ? $(id) : null;
    if (el && el.scrollIntoView) {
      try {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (_) {}
    }
  }

  function switchLabEngine(mode) {
    mode = String(mode || '').trim().toLowerCase();
    if (mode !== 'sapi' && mode !== 'vosk' && mode !== 'kws') return;
    try {
      var Wake = global.OneToneVoiceWake;
      if (Wake && typeof Wake.isModeSwitchPending === 'function' && Wake.isModeSwitchPending()) return;
      var Ready = global.OneToneVoiceEngineReadiness;
      if (mode === 'sapi' && Ready && Ready.isVoskOnlyUi && Ready.isVoskOnlyUi()) return;
      if (Wake && typeof Wake.setExpandedMode === 'function') Wake.setExpandedMode(mode);
      if (Wake && typeof Wake.switchMode === 'function') {
        Wake.switchMode(mode, { toastKind: 'lite' });
      }
    } catch (err) {
      console.error('voiceLab engine', err);
    }
    setTimeout(function () {
      syncAdvancedChrome();
      if (mode === 'vosk' && labVoskNeedsDownload() && !labVoskDllOnly()) {
        kickLabVoskDownload('engine');
      }
    }, 160);
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
    syncAdvancedChrome();
    syncDictationChrome();
    syncOralChromeHost();

    var assist = voiceAssistOn();
    setSw($('voiceLabModeSw'), assist);
    var modeLab = $('voiceLabModeLab');
    if (modeLab) modeLab.textContent = assist ? '开' : '关';
    var modeCluster = document.querySelector('#settingsPanelVoiceLab .voice-lab-mode-cluster');
    if (modeCluster) modeCluster.classList.toggle('is-off', !assist);

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
      '<div class="voice-lab-row" style="justify-content:space-between;margin-top:0">' +
      '<h3 style="margin:0">' +
      escAttr(t('voiceLabOralNewHeading', '自定义口头命令')) +
      '</h3>' +
      '<button type="button" class="voice-lab-btn ghost" style="color:var(--vl-danger,#c41e1e)" data-del-mid>' +
      escAttr(t('delete', '删除')) +
      '</button></div>' +
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
    syncLiveFromSnapshot();
    if (paneId === 'gate') syncGateChrome();
    else {
      syncAimBlocks();
      if (paneId === 'dictation') syncDictationChrome();
    }
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

    var micBtn = $('voiceLabMicBtn');
    if (micBtn) {
      micBtn.addEventListener('click', function (e) {
        e.preventDefault();
        openLabMicPicker();
      });
    }

    var engineGrid = $('voiceLabEngineGrid');
    if (engineGrid && !engineGrid.dataset.voiceLabEngineBound) {
      engineGrid.dataset.voiceLabEngineBound = '1';
      engineGrid.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('[data-voice-engine-tab]');
        if (!btn || btn.disabled || btn.hidden) return;
        e.preventDefault();
        switchLabEngine(btn.getAttribute('data-voice-engine-tab'));
      });
    }

    var saveBtn = $('voiceLabBtnSave');
    if (saveBtn) {
      saveBtn.addEventListener('click', function () {
        if (!dirty) return;
        saveToHabit();
      });
    }

    panel.addEventListener('click', function (e) {
      var tEl = e.target;
      if (!tEl || !tEl.closest) return;

      if (tEl.closest('#voiceLabSettingsTargetKey') && panel.contains(tEl.closest('#voiceLabSettingsTargetKey'))) {
        e.preventDefault();
        rerecordDictationKey({ custom: true });
        return;
      }

      var aimDemoBtn = tEl.closest('[data-vl-aim-demo-toggle]');
      if (aimDemoBtn && panel.contains(aimDemoBtn)) {
        e.preventDefault();
        setAimDemoExpanded(!aimDemoExpanded);
        return;
      }

      var aimBtn = tEl.closest('[data-vl-aim]');
      if (aimBtn && panel.contains(aimBtn)) {
        e.preventDefault();
        setAimStrategy(aimBtn.getAttribute('data-vl-aim'));
        return;
      }

      var phraseOpen = tEl.closest('[data-vl-phrase-open]');
      if (phraseOpen && panel.contains(phraseOpen)) {
        e.preventDefault();
        openPhraseSheet(phraseOpen.getAttribute('data-vl-phrase-open') || 'primary');
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
        return;
      }

      // IME 条由 OneToneImePresets(voiceLab) 同源处理，不在此拦截。

      var langBtn = tEl.closest('#voiceLabFinishHabit .flow-lang-btn, #voiceLabPhraseSheet .flow-lang-btn');
      if (langBtn && panel.contains(langBtn)) {
        var group = langBtn.parentElement;
        var lang = langBtn.getAttribute('data-lang') || 'zh';
        if (group) {
          var langs = group.querySelectorAll('.flow-lang-btn');
          for (var li = 0; li < langs.length; li++) {
            langs[li].classList.toggle('is-on', langs[li] === langBtn);
          }
        }
        global.__vp_voice_end_lang__ = lang;
        global.__vp_voice_send_lang__ = lang;
        syncLabPhraseTags();
        return;
      }

      var micOpt = tEl.closest('[data-vl-mic-id]');
      if (micOpt && panel.contains(micOpt)) {
        e.preventDefault();
        pickLabMic(micOpt.getAttribute('data-vl-mic-id'));
        return;
      }

      var dlBtn = tEl.closest('#voiceLabResourceDownload');
      if (dlBtn && panel.contains(dlBtn)) {
        e.preventDefault();
        kickLabVoskDownload('click');
        return;
      }

      var retryBtn = tEl.closest('#voiceLabResourceRetry');
      if (retryBtn && panel.contains(retryBtn)) {
        e.preventDefault();
        try {
          var WakeRetry = global.OneToneVoiceWake;
          if (labVoskNeedsDownload() && !labVoskDllOnly()) {
            kickLabVoskDownload('retry');
          } else if (WakeRetry && typeof WakeRetry.retryPreferredStart === 'function') {
            WakeRetry.retryPreferredStart();
          } else if (WakeRetry && typeof WakeRetry.retryVoskStart === 'function' && currentEngineMode() === 'vosk') {
            WakeRetry.retryVoskStart();
          } else if (WakeRetry && typeof WakeRetry.switchMode === 'function') {
            WakeRetry.switchMode(currentEngineMode(), { toastKind: 'lite' });
          }
        } catch (_) {}
        setTimeout(syncAdvancedChrome, 200);
        return;
      }

      var addBtn = tEl.closest('[data-vl-habit-add]');
      if (addBtn && panel.contains(addBtn)) {
        var wrap = addBtn.closest('.voice-finish-habit-block');
        var input = wrap && wrap.querySelector('input');
        var val = input ? String(input.value || '').trim() : '';
        if (!val) return;
        var End = global.OneToneVoiceEnd;
        var kind = addBtn.getAttribute('data-vl-habit-add') || 'keep';
        var finishMode = currentLabFinishMode();
        var addP = null;
        if (End) {
          if (kind === 'cancel' && End.addCustomCancelPhrase) addP = End.addCustomCancelPhrase;
          else if (finishMode === 'phrase' || finishMode === 'auto') addP = End.addCustomSendPhrase;
          else addP = End.addCustomEndPhrase;
        }
        if (typeof addP === 'function') {
          Promise.resolve(addP.call(End, val)).then(function () {
            if (input) input.value = '';
            syncLabPhraseTags();
          });
        }
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

    try {
      var pc = global.OneToneVoicePhraseCustom;
      var End = global.OneToneVoiceEnd;
      if (pc && typeof pc.bindPhraseTags === 'function' && End) {
        pc.bindPhraseTags('voiceLabEndPhraseTags', {
          onRemove: function (phrase) {
            var mode = currentLabFinishMode();
            if (mode === 'phrase' || mode === 'auto') {
              if (End.removeCustomSendPhrase) End.removeCustomSendPhrase(phrase);
            } else if (End.removeCustomEndPhrase) {
              End.removeCustomEndPhrase(phrase);
            }
            syncLabPhraseTags();
          },
          onToggle: function (phrase, wasActive) {
            var mode = currentLabFinishMode();
            if (mode === 'phrase' || mode === 'auto') {
              if (End.toggleSendPhrase) End.toggleSendPhrase(phrase, wasActive);
            } else if (End.toggleEndPhrase) {
              End.toggleEndPhrase(phrase, wasActive);
            }
            syncLabPhraseTags();
          },
        });
        pc.bindPhraseTags('voiceLabCancelPhraseTags', {
          onRemove: function (phrase) {
            if (End.removeCustomCancelPhrase) End.removeCustomCancelPhrase(phrase);
            syncLabPhraseTags();
          },
          onToggle: function (phrase, wasActive) {
            if (End.toggleCancelPhrase) End.toggleCancelPhrase(phrase, wasActive);
            syncLabPhraseTags();
          },
        });
      }
    } catch (_) {}

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

    var phraseSheet = $('voiceLabPhraseSheet');
    if (phraseSheet && !phraseSheet.dataset.vlPhraseBound) {
      phraseSheet.dataset.vlPhraseBound = '1';
      var phraseClose = $('voiceLabPhraseSheetClose');
      if (phraseClose) phraseClose.addEventListener('click', closePhraseSheet);
      phraseSheet.addEventListener('click', function (e) {
        if (e.target === phraseSheet) closePhraseSheet();
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
    syncDictationChrome();
    syncGateChrome();
    syncBridgeHosts();
    syncLiveFromSnapshot();
    if (!dirty) markClean();
  }

  global.OneToneVoiceLabPanel = {
    render: render,
    rerecordDictationKey: rerecordDictationKey,
    saveToHabit: saveToHabit,
    bind: bind,
    syncGateChrome: syncGateChrome,
    syncAdvancedChrome: syncAdvancedChrome,
    syncLiveFromSnapshot: syncLiveFromSnapshot,
    syncBridgeHosts: syncBridgeHosts,
    focusRegion: focusRegion,
  };
})(typeof window !== 'undefined' ? window : globalThis);
