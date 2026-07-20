/**
 * Codex capability cards for Keys / Voice — Codex scenario ONLY.
 * Keys: mount inside 识别 / 收尾 columns (not trigger).
 * Target slots: summon / talk / palette / status / plan
 * Finish slots: cancel / stopOrSend
 * Auto-seed writes Codex official key chords — click loads/selects (no recording).
 * Long-press / right-click / Alt+click keeps the original physical-key recording path.
 */
(function (global) {
  'use strict';

  var TARGET_SLOT_IDS = ['summonCodex', 'pushToTalk', 'commandPalette', 'status', 'plan'];
  var FINISH_SLOT_IDS = ['cancel', 'stopOrSend'];
  /** Currently selected capability shown on the recognition keycap. */
  var selectedSlotId = '';
  var multiKeyTipShown = false;

  var SLOT_ICONS = {
    summonCodex: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/><path d="M5 19h14"/></svg>',
    pushToTalk: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    cancel: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    commandPalette: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5"/></svg>',
    status: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>',
    plan: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/></svg>',
    review: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    stopOrSend: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
    newThread: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
    quickChat: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    permissions: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    switchAgent: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7"/></svg>',
    appsOrPlugins: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>'
  };

  function t(key, fallback) {
    try {
      if (global.OneToneI18n && global.OneToneI18n.t) {
        var v = global.OneToneI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback != null ? fallback : key;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cfg() {
    return global.OneToneState && global.OneToneState.state && global.OneToneState.state.config;
  }

  function ui() {
    return global.OneToneState && global.OneToneState.ui;
  }

  function scenarioMapping() {
    try {
      var id = String((ui() && ui().habitScenarioReturnId) || '').trim();
      if (!id) return null;
      var c = cfg();
      var maps = c && c.mappings;
      if (!Array.isArray(maps)) return null;
      for (var i = 0; i < maps.length; i++) {
        if (maps[i] && maps[i].id === id) return maps[i];
      }
    } catch (_) {}
    return null;
  }

  function codexScenarioMapping() {
    var m = scenarioMapping();
    var T = global.OneToneAgentScenarioTemplate;
    if (!m || !T || !T.isCodexScenario || !T.isCodexScenario(m)) return null;
    return m;
  }

  /** Codex mapping for keys hub (selected scheme) or scenario return id. */
  function activeCodexMapping() {
    // Codex capability UI is only valid for app-scenario context.
    // If we fall back to "currently selected mapping" here, global pages
    // may accidentally show Codex app-scenario overrides and edits would
    // be saved into the wrong mapping.
    return codexScenarioMapping();
  }

  /**
   * Codex capability chord for flow hints / summaries — always the agent binding,
   * never IME targetKey (RAlt etc.).
   * @returns {string} raw chord or ''
   */
  function ensureDefaultSelection(m) {
    if (!m || selectedSlotId) return;
    selectedSlotId = 'pushToTalk';
  }

  /** Hide IME / global voice chrome; show Codex-specific labels per step. */
  function applyCodexStepChrome(step, m) {
    var imeBlock = document.getElementById('habitFlowImeBlock');
    var voiceSummary = document.getElementById('keysCaptureVoiceSummary');
    var trigLbl = document.getElementById('habitFlowStepTriggerLbl');
    var tgtLbl = document.getElementById('habitFlowStepTargetLbl');
    var keycapHint = document.getElementById('keysKeycapHint');
    var targetKeycapHint = document.getElementById('keysTargetKeycapHint');
    var onCodex = !!(m && global.OneToneAgentScenarioTemplate
      && global.OneToneAgentScenarioTemplate.isCodexScenario
      && global.OneToneAgentScenarioTemplate.isCodexScenario(m));
    if (!onCodex) {
      if (imeBlock) imeBlock.hidden = false;
      if (voiceSummary) voiceSummary.classList.remove('sr-only');
      return;
    }
    if (imeBlock) imeBlock.hidden = step === 'target' || step === 'finish';
    if (voiceSummary) voiceSummary.classList.add('sr-only');
    if (trigLbl) trigLbl.textContent = t('keysFlowNodeTriggerTitle', '触发');
    if (tgtLbl) tgtLbl.textContent = t('codexCapTargetTitle', '能力快捷键');
    if (step === 'trigger') {
      if (keycapHint) keycapHint.textContent = t('codexStepTriggerKeycapHint', '点击录制物理触发键');
      if (targetKeycapHint) targetKeycapHint.textContent = t('keysTargetKeycapHint', '点击录制语音快捷键');
    } else if (step === 'target') {
      ensureDefaultSelection(m);
      if (keycapHint) keycapHint.textContent = t('keysKeycapHint', '点击修改快捷键');
      if (targetKeycapHint) targetKeycapHint.textContent = t('codexStepRecognitionKeycapHint', '点按下方能力卡片 · 长按录制自定义快捷键');
    }
  }

  function pushToTalkDisplay(m) {
    m = m || activeCodexMapping();
    if (!m) return '';
    return friendlyChord(chordForSlot(m, 'pushToTalk'));
  }

  function flowTargetDisplayKey(m) {
    var cm = m;
    var T = global.OneToneAgentScenarioTemplate;
    if (!cm || !T || !T.isCodexScenario || !T.isCodexScenario(cm)) {
      cm = activeCodexMapping();
    }
    if (!cm) return '';
    if (selectedSlotId) return chordForSlot(cm, selectedSlotId);
    var pt = chordForSlot(cm, 'pushToTalk');
    if (pt) return pt;
    for (var i = 0; i < TARGET_SLOT_IDS.length; i++) {
      var chord = chordForSlot(cm, TARGET_SLOT_IDS[i]);
      if (chord) return chord;
    }
    return '';
  }

  /**
   * Key shown on step-02 hero keycap when editing 识别 (not IME targetKey).
   * @returns {string} raw chord or ''
   */
  function stepTargetDisplayKey(m) {
    if (activeKeysStep() !== 'target') return '';
    return flowTargetDisplayKey(m);
  }

  function syncStepTargetDisplays(m) {
    var chord = stepTargetDisplayKey(m);
    if (!chord) return false;
    var label = friendlyChord(chord);
    var targetEl = document.getElementById('targetView');
    var targetDisp = document.getElementById('targetDisplay');
    if (targetEl) targetEl.textContent = label;
    if (targetDisp) targetDisp.classList.toggle('empty', !chord);
    var cm = m || activeCodexMapping();
    if (global.OneToneKeysPageNav && global.OneToneKeysPageNav.renderStepHints) {
      global.OneToneKeysPageNav.renderStepHints(cm);
    }
    return true;
  }

  function activeKeysStep() {
    try {
      if (global.OneToneKeysPageState && global.OneToneKeysPageState.getStep) {
        return String(global.OneToneKeysPageState.getStep() || 'trigger');
      }
    } catch (_) {}
    var p = document.getElementById('settingsPanelKeys');
    if (p) {
      if (p.classList.contains('is-step-target')) return 'target';
      if (p.classList.contains('is-step-finish')) return 'finish';
    }
    return 'trigger';
  }

  function bindingFor(m, slotId, triggerType) {
    var list = (m && m.agentBindings) || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b && b.slotId === slotId && b.triggerType === triggerType) return b;
    }
    return null;
  }

  function persist() {
    var p = global.OneToneConfigPersist;
    if (p && p.saveAsync) p.saveAsync();
    else if (p && p.save) p.save();
  }

  function toast(msg) {
    try {
      if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
        global.OneToneUiFeedback.toast(msg);
      }
    } catch (_) {}
  }

  function friendlyChord(chord) {
    var raw = String(chord || '').trim();
    if (!raw) return '';
    try {
      var hooks = global.__vp_mapping_recording_hooks__;
      if (hooks && hooks.friendlyKeyName) return hooks.friendlyKeyName(raw);
    } catch (_) {}
    return raw;
  }

  function recommendedKey(slotId) {
    var A = global.OneToneAgentActions;
    if (A && A.defaultKeyForSlot) return String(A.defaultKeyForSlot(slotId) || '').trim();
    return '';
  }

  function normalizeChord(chord) {
    return String(chord || '')
      .trim()
      .toLowerCase()
      .replace(/\s*\+\s*/g, '+')
      .replace(/\s+/g, '');
  }

  /** Find who already owns this chord (other capability / trigger / IME target). */
  function findChordConflict(m, chord, excludeSlotId) {
    var norm = normalizeChord(chord);
    if (!norm || !m) return null;
    var A = global.OneToneAgentActions;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.triggerType !== 'key' || !b.enabled) continue;
      if (excludeSlotId && b.slotId === excludeSlotId) continue;
      if (normalizeChord(b.triggerBinding) !== norm) continue;
      var slot = A && A.slotById ? A.slotById(b.slotId) : null;
      return {
        kind: 'capability',
        slotId: b.slotId,
        label: slot ? A.labelForSlot(slot) : b.slotId
      };
    }
    if (normalizeChord(m.triggerKey) === norm) {
      return { kind: 'trigger', label: t('codexCapConflictTrigger', '触发键') };
    }
    if (normalizeChord(m.targetKey) === norm) {
      return { kind: 'ime', label: t('codexCapConflictIme', '语音识别键') };
    }
    return null;
  }

  function conflictToast(conflict, chord) {
    if (!conflict) return;
    var key = friendlyChord(chord) || chord;
    if (conflict.kind === 'capability') {
      toast(t('codexCapConflictCap', '快捷键已被占用，请为每个能力使用不同按键')
        + ' · ' + key + ' → ' + conflict.label);
    } else {
      toast(t('codexCapConflictOther', '快捷键与现有按键冲突，请换一个')
        + ' · ' + key + ' / ' + conflict.label);
    }
  }

  function slotLabel(slotId) {
    var A = global.OneToneAgentActions;
    var slot = A && A.slotById ? A.slotById(slotId) : null;
    return slot ? A.labelForSlot(slot) : slotId;
  }

  function chordForSlot(m, slotId) {
    var b = bindingFor(m, slotId, 'key');
    var had = b ? String(b.triggerBinding || '').trim() : '';
    return had || recommendedKey(slotId);
  }

  /**
   * Show selected capability shortcut on step-02 keycap + flow hint (not IME targetKey).
   * @returns {boolean} true if capability overlay active
   */
  function applyRecognitionOverlay() {
    var m = activeCodexMapping();
    var targetDisp = document.getElementById('targetDisplay');
    var hint = document.getElementById('keysTargetKeycapHint');
    var host = document.getElementById('habitKeyMapCellTarget');
    var onCodexTarget = !!(m && activeKeysStep() === 'target');
    if (!onCodexTarget) {
      if (targetDisp) targetDisp.classList.remove('is-codex-cap-edit');
      if (host) host.classList.remove('is-codex-cap-edit');
      return false;
    }
    var chord = stepTargetDisplayKey(m);
    var name = selectedSlotId ? slotLabel(selectedSlotId) : '';
    syncStepTargetDisplays(m);
    if (targetDisp) targetDisp.classList.add('is-codex-cap-edit');
    if (host) host.classList.add('is-codex-cap-edit');
    if (hint) {
      if (name) {
        hint.textContent = t('codexStepRecognitionKeycapHint', '点按下方能力卡片 · 长按录制自定义快捷键');
      } else {
        hint.textContent = t('codexStepRecognitionKeycapHint', '点按下方能力卡片 · 长按录制自定义快捷键');
      }
    }
    return true;
  }

  /** Summary line for Codex scheme list: show configured capability shortcuts. */
  function schemePairLine(m) {
    if (!m) return '';
    var T = global.OneToneAgentScenarioTemplate;
    if (!T || !T.isCodexScenario || !T.isCodexScenario(m)) return '';
    var list = (m.agentBindings || []).filter(function (b) {
      return b && b.enabled !== false && b.triggerType === 'key' && String(b.triggerBinding || '').trim();
    });
    if (!list.length) return '';
    var chords = [];
    for (var i = 0; i < list.length && chords.length < 3; i++) {
      var label = friendlyChord(list[i].triggerBinding);
      if (label && chords.indexOf(label) < 0) chords.push(label);
    }
    var more = list.length - chords.length;
    var line = chords.join(' · ');
    if (more > 0) line += ' · …';
    return line;
  }

  function clearSelection() {
    selectedSlotId = '';
    var targetDisp = document.getElementById('targetDisplay');
    var host = document.getElementById('habitKeyMapCellTarget');
    if (targetDisp) targetDisp.classList.remove('is-codex-cap-edit');
    if (host) host.classList.remove('is-codex-cap-edit');
  }

  function hasSelectedSlot() {
    return !!selectedSlotId && !!codexScenarioMapping();
  }

  function getSelectedSlotId() {
    return selectedSlotId || '';
  }

  function recordSelectedSlot() {
    var m = codexScenarioMapping();
    if (!m) return false;
    var slotId = selectedSlotId;
    if (!slotId) {
      slotId = TARGET_SLOT_IDS.indexOf('pushToTalk') >= 0 ? 'pushToTalk' : TARGET_SLOT_IDS[0];
    }
    if (!slotId) return false;
    selectedSlotId = slotId;
    applyRecognitionOverlay();
    var chip = document.querySelector('[data-codex-chip-key="' + slotId + '"]');
    startRecord(m, slotId, chip);
    return true;
  }

  function ensureBinding(m, slotId, triggerType) {
    if (!Array.isArray(m.agentBindings)) m.agentBindings = [];
    var b = bindingFor(m, slotId, triggerType);
    if (b) return b;
    var A = global.OneToneAgentActions;
    var slot = A.slotById(slotId);
    var action = slot && A.actionById(slot.actionId);
    b = {
      slotId: slotId,
      actionId: slot ? slot.actionId : '',
      triggerType: triggerType,
      triggerBinding: triggerType === 'voice'
        ? A.phraseForAction(slot && slot.actionId)
        : recommendedKey(slotId),
      enabled: true,
      executionMode: action ? action.mode : 'execute',
      activationScope: action ? action.scope : 'foregroundApp'
    };
    m.agentBindings.push(b);
    return b;
  }

  function slotsByIds(ids) {
    var A = global.OneToneAgentActions;
    var out = [];
    for (var i = 0; i < ids.length; i++) {
      var s = A.slotById(ids[i]);
      if (s) out.push(s);
    }
    return out;
  }

  function hideHost(host) {
    if (!host) return;
    host.hidden = true;
    host.innerHTML = '';
  }

  function removeCameraHost() {
    var host = document.getElementById('codexPackHostCamera');
    if (host) {
      try { host.remove(); } catch (_) {
        host.hidden = true;
        host.innerHTML = '';
      }
    }
  }

  function clearLegacyHosts() {
    removeCameraHost();
    var old = document.getElementById('codexPackHostKeys');
    if (old) {
      try { old.remove(); } catch (_) { old.hidden = true; old.innerHTML = ''; }
    }
    ['agentCapabilityKeysHost', 'agentCapabilityVoiceHost'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      try { el.remove(); } catch (_) { el.hidden = true; el.innerHTML = ''; }
    });
  }

  function renderCapCards(m, slots, mode) {
    var A = global.OneToneAgentActions;
    var triggerType = mode === 'voice' ? 'voice' : 'key';
    var html = '<div class="codex-cap-strip" role="list">';
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      var b = bindingFor(m, s.slotId, triggerType);
      var value = b ? String(b.triggerBinding || '') : '';
      if (!value && triggerType === 'key') value = recommendedKey(s.slotId);
      var bound = !!(b && String(b.triggerBinding || '').trim());
      var enabled = !b || b.enabled !== false;
      var icon = SLOT_ICONS[s.slotId] || SLOT_ICONS.appsOrPlugins;
      var name = A.labelForSlot(s);
      var sub = mode === 'voice'
        ? (value || t('codexCapTapPhrase', '点按改口令'))
        : friendlyChord(value) || t('codexCapTapLoad', '点击加载推荐键');
      var attr = mode === 'voice' ? 'data-codex-chip-voice' : 'data-codex-chip-key';
      html += '<button type="button" class="codex-cap-item'
        + (bound ? ' is-bound' : '')
        + (bound && enabled ? ' is-active' : '')
        + (triggerType === 'key' && selectedSlotId === s.slotId ? ' is-selected' : '')
        + '" role="listitem" '
        + attr + '="' + esc(s.slotId) + '" title="' + esc(name + (value ? ' · ' + value : '')) + '">'
        + '<span class="codex-cap-icon">' + icon + '</span>'
        + '<span class="codex-cap-name">' + esc(name) + '</span>'
        + '<span class="codex-cap-sub">' + esc(sub) + '</span>'
        + '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderKeysPanel(host, m, phase) {
    var A = global.OneToneAgentActions;
    var T = global.OneToneAgentScenarioTemplate;
    var title = phase === 'finish'
      ? t('codexCapFinishTitle', '收尾能力')
      : t('codexCapTargetTitle', '能力快捷键');
    var hint = T.hasCodexPack(m)
      ? t('codexCapReadyHint', '常用能力已准备好 · 已加载推荐快捷键')
      : t('codexCapNeedSeed', '正在准备常用能力…');
    var primaryIds = phase === 'finish' ? FINISH_SLOT_IDS : TARGET_SLOT_IDS;
    var html = '';
    html += '<div class="codex-cap-block" role="region" aria-label="' + esc(title) + '">';
    html += '<div class="codex-cap-head">';
    html += '<span class="codex-cap-label">' + esc(title) + '</span>';
    html += '<span class="codex-cap-hint">' + esc(hint) + '</span>';
    html += '</div>';
    html += renderCapCards(m, slotsByIds(primaryIds), 'keys');
    if (phase === 'target') {
      html += '<details class="codex-cap-all">';
      html += '<summary>' + esc(t('agentCapAll', '全部')) + '</summary>';
      html += renderCapCards(m, A.allSlots().filter(function (s) {
        return TARGET_SLOT_IDS.indexOf(s.slotId) < 0;
      }), 'keys');
      html += '</details>';
    }
    html += '<p class="codex-cap-edit-hint">' + esc(t('codexCapEditHint', '点按加载推荐键 · 长按录制自定义 · 每个能力需不同按键')) + '</p>';
    html += '</div>';
    host.innerHTML = html;
    host.hidden = false;
    bindHost(host, m, 'keys');
    applyRecognitionOverlay();
  }

  function renderVoiceStrip(host, m) {
    var A = global.OneToneAgentActions;
    var T = global.OneToneAgentScenarioTemplate;
    var html = '';
    html += '<div class="codex-cap-block" role="region" aria-label="' + esc(t('codexStripVoice', '能力口令')) + '">';
    html += '<div class="codex-cap-head">';
    html += '<span class="codex-cap-label">' + esc(t('codexStripVoice', '能力口令')) + '</span>';
    html += '<span class="codex-cap-hint">' + esc(T.hasCodexPack(m)
      ? t('codexCapVoiceReady', '常用能力已准备好 · 可改口令')
      : t('codexCapNeedSeed', '正在准备常用能力…')) + '</span>';
    html += '</div>';
    html += renderCapCards(m, slotsByIds(TARGET_SLOT_IDS.concat(FINISH_SLOT_IDS)), 'voice');
    html += '<details class="codex-cap-all">';
    html += '<summary>' + esc(t('agentCapAll', '全部')) + '</summary>';
    html += renderCapCards(m, A.allSlots().filter(function (s) {
      return TARGET_SLOT_IDS.indexOf(s.slotId) < 0 && FINISH_SLOT_IDS.indexOf(s.slotId) < 0;
    }), 'voice');
    html += '</details></div>';
    host.innerHTML = html;
    host.hidden = false;
    bindHost(host, m, 'voice');
  }

  function bindHost(host, m, mode) {
    var longPressTimer = 0;
    var longPressFired = false;

    host.onclick = function (e) {
      if (longPressFired) {
        longPressFired = false;
        e.preventDefault();
        return;
      }
      var keyChip = e.target.closest && e.target.closest('[data-codex-chip-key]');
      if (keyChip) {
        e.preventDefault();
        selectCapabilityForKeycap(m, keyChip.getAttribute('data-codex-chip-key'), e.altKey || e.shiftKey);
        return;
      }
      var voiceChip = e.target.closest && e.target.closest('[data-codex-chip-voice]');
      if (voiceChip) {
        e.preventDefault();
        editPhrase(m, voiceChip.getAttribute('data-codex-chip-voice'), host, mode);
      }
    };

    host.oncontextmenu = function (e) {
      var keyChip = e.target.closest && e.target.closest('[data-codex-chip-key]');
      if (!keyChip) return;
      e.preventDefault();
      startRecord(m, keyChip.getAttribute('data-codex-chip-key'), keyChip);
    };

    host.onpointerdown = function (e) {
      var keyChip = e.target.closest && e.target.closest('[data-codex-chip-key]');
      if (!keyChip || e.button !== 0) return;
      longPressFired = false;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(function () {
        longPressFired = true;
        startRecord(m, keyChip.getAttribute('data-codex-chip-key'), keyChip);
      }, 650);
    };
    host.onpointerup = function () { clearTimeout(longPressTimer); };
    host.onpointerleave = function () { clearTimeout(longPressTimer); };
    host.onpointercancel = function () { clearTimeout(longPressTimer); };
  }

  function editPhrase(m, slotId, host, mode) {
    var b = ensureBinding(m, slotId, 'voice');
    var cur = String(b.triggerBinding || '');
    var next = window.prompt(t('codexChipEditPhrase', '编辑语音口令'), cur);
    if (next == null) return;
    b.triggerBinding = String(next || '').trim();
    if (b.triggerBinding) b.enabled = true;
    persist();
    if (mode === 'voice') renderVoiceStrip(host, m);
    else remountKeysHosts(m);
  }

  /**
   * Click: load this capability's key onto the recognition keycap.
   * Does not overwrite IME targetKey. Alt/Shift+click → record custom key.
   */
  function selectCapabilityForKeycap(m, slotId, forceRecord) {
    if (forceRecord) {
      selectedSlotId = slotId;
      var chip0 = document.querySelector('[data-codex-chip-key="' + slotId + '"]');
      startRecord(m, slotId, chip0);
      return;
    }
    if (selectedSlotId === slotId) {
      clearSelection();
      remountKeysHosts(m);
      if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        global.OneToneMappingList.renderEditor();
      } else if (global.OneToneKeysPanelUi && global.OneToneKeysPanelUi.render) {
        global.OneToneKeysPanelUi.render();
      }
      toast(t('codexCapDeselected', '已恢复语音识别键显示'));
      return;
    }

    var def = recommendedKey(slotId);
    var b = ensureBinding(m, slotId, 'key');
    var had = String(b.triggerBinding || '').trim();
    if (!had) {
      var conflictNew = findChordConflict(m, def, slotId);
      if (conflictNew) {
        conflictToast(conflictNew, def);
        return;
      }
      b.triggerBinding = def;
    }
    b.enabled = true;
    selectedSlotId = slotId;
    persist();
    remountKeysHosts(m);
    applyRecognitionOverlay();
    if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
      global.OneToneMappingList.renderEditor();
    } else if (global.OneToneKeysPanelUi && global.OneToneKeysPanelUi.render) {
      global.OneToneKeysPanelUi.render();
    }

    var chord = String(b.triggerBinding || '').trim();
    toast(t('codexCapLoadedToKeycap', '已加载到识别键')
      + ' · ' + slotLabel(slotId)
      + (chord ? ' · ' + friendlyChord(chord) : ''));
    if (!multiKeyTipShown) {
      multiKeyTipShown = true;
      setTimeout(function () {
        toast(t('codexCapMultiKeyTip', '多个 Codex 能力请用不同按键触发，不能共用同一个键'));
      }, 700);
    }
  }

  /** Original physical-key recording path — for customizing beyond the template default. */
  function startRecord(m, slotId, btn) {
    var rec = global.OneToneMappingRecording;
    var sub = btn && btn.querySelector && btn.querySelector('.codex-cap-sub');
    function setSub(text) { if (sub) sub.textContent = text; }
    selectedSlotId = slotId;
    applyRecognitionOverlay();
    if (!rec || !rec.startAgentBinding) {
      customizeKeyPrompt(m, slotId);
      return;
    }
    if (rec.mode && rec.mode() !== 'none') return;
    setSub(t('agentCapRecording', '按下快捷键…'));
    if (btn) btn.classList.add('is-recording');
    var host = document.getElementById('habitKeyMapCellTarget');
    if (host) host.classList.add('is-recording');
    rec.startAgentBinding(m.id, {
      onDone: function (chord) {
        if (btn) btn.classList.remove('is-recording');
        if (host) host.classList.remove('is-recording');
        var next = String(chord || '').trim();
        var conflict = findChordConflict(m, next, slotId);
        if (conflict) {
          conflictToast(conflict, next);
          applyRecognitionOverlay();
          remountKeysHosts(m);
          return;
        }
        var b2 = ensureBinding(m, slotId, 'key');
        b2.triggerBinding = next;
        b2.enabled = !!b2.triggerBinding;
        persist();
        toast(t('codexCapCustomSaved', '已更新快捷键')
          + (b2.triggerBinding ? ' · ' + friendlyChord(b2.triggerBinding) : ''));
        remountKeysHosts(m);
        applyRecognitionOverlay();
      },
      onCancel: function () {
        if (btn) btn.classList.remove('is-recording');
        if (host) host.classList.remove('is-recording');
        var b3 = bindingFor(m, slotId, 'key');
        var label = (b3 && b3.triggerBinding) ? friendlyChord(b3.triggerBinding) : '';
        setSub(label || t('codexCapTapLoad', '点击加载到识别键'));
        applyRecognitionOverlay();
      }
    });
  }

  /** Fallback text edit when recording API is unavailable. */
  function customizeKeyPrompt(m, slotId) {
    var name = slotLabel(slotId);
    var def = recommendedKey(slotId);
    var b = ensureBinding(m, slotId, 'key');
    var cur = String(b.triggerBinding || def || '');
    var next = window.prompt(
      t('codexCapCustomizePrompt', '修改「') + name + t('codexCapCustomizePrompt2', '」快捷键（留空恢复推荐）')
        + '\n' + t('codexCapMultiKeyTip', '多个 Codex 能力请用不同按键触发，不能共用同一个键')
        + (def ? '\n' + t('codexCapRecommendLabel', '推荐') + ': ' + def : ''),
      cur
    );
    if (next == null) return;
    var trimmed = String(next || '').trim() || def;
    var conflict = findChordConflict(m, trimmed, slotId);
    if (conflict) {
      conflictToast(conflict, trimmed);
      return;
    }
    b.triggerBinding = trimmed;
    b.enabled = !!b.triggerBinding;
    selectedSlotId = slotId;
    persist();
    toast(t('codexCapCustomSaved', '已更新快捷键')
      + (b.triggerBinding ? ' · ' + friendlyChord(b.triggerBinding) : ''));
    remountKeysHosts(m);
    applyRecognitionOverlay();
  }

  function ensureIn(parent, id, className) {
    if (!parent) return null;
    var host = document.getElementById(id);
    if (!host) {
      host = document.createElement('div');
      host.id = id;
      host.className = className || 'codex-pack-host';
      parent.appendChild(host);
    } else if (host.parentNode !== parent) {
      parent.appendChild(host);
    }
    return host;
  }

  function remountKeysHosts(m) {
    var step = activeKeysStep();
    var targetRow = document.getElementById('habitKeyMapRowTarget');
    var finishRow = document.getElementById('habitKeyMapRowFinish');
    var imeBlock = targetRow && (targetRow.querySelector('.keys-capture-ime-block') || targetRow.querySelector('#habitFlowImeBlock'));
    var finishBody = finishRow && finishRow.querySelector('.keys-step-body');

    var targetHost = ensureIn(
      imeBlock && imeBlock.parentNode ? imeBlock.parentNode : (targetRow && targetRow.querySelector('.keys-step-body')),
      'codexCapHostTarget',
      'codex-pack-host codex-cap-host--target'
    );
    if (targetHost && imeBlock && imeBlock.nextSibling !== targetHost) {
      if (imeBlock.nextSibling) imeBlock.parentNode.insertBefore(targetHost, imeBlock.nextSibling);
      else imeBlock.parentNode.appendChild(targetHost);
    }

    var finishHost = ensureIn(finishBody || finishRow, 'codexCapHostFinish', 'codex-pack-host codex-cap-host--finish');

    if (!m) {
      clearSelection();
      hideHost(targetHost);
      hideHost(finishHost);
      return;
    }
    var T = global.OneToneAgentScenarioTemplate;
    if (T && T.fillEmptyKeyDefaults) T.fillEmptyKeyDefaults(m);
    if (step === 'target') {
      ensureDefaultSelection(m);
      renderKeysPanel(targetHost, m, 'target');
      hideHost(finishHost);
      applyRecognitionOverlay();
    } else if (step === 'finish') {
      hideHost(targetHost);
      renderKeysPanel(finishHost, m, 'finish');
      applyRecognitionOverlay();
    } else {
      clearSelection();
      hideHost(targetHost);
      hideHost(finishHost);
    }
    applyCodexStepChrome(step, m);
  }

  function mountKeys() {
    clearLegacyHosts();
    removeCameraHost();
    var m = activeCodexMapping();
    remountKeysHosts(m);
  }

  function mountVoice() {
    clearLegacyHosts();
    removeCameraHost();
    var flow = document.getElementById('voiceSettingsFlow')
      || document.getElementById('voiceWorkflowPipeline');
    var scenarioBody = document.getElementById('habitScenarioVoiceBody');
    var anchor = flow;
    if (scenarioBody && !scenarioBody.hidden && scenarioBody.parentNode) {
      anchor = scenarioBody;
    }
    if (!anchor || !anchor.parentNode) return;
    var host = document.getElementById('codexPackHostVoice');
    if (!host) {
      host = document.createElement('div');
      host.id = 'codexPackHostVoice';
      host.className = 'codex-pack-host';
      if (anchor.nextSibling) anchor.parentNode.insertBefore(host, anchor.nextSibling);
      else anchor.parentNode.appendChild(host);
    }
    var m = codexScenarioMapping();
    if (!m) {
      hideHost(host);
      return;
    }
    renderVoiceStrip(host, m);
  }

  function mountCamera() {
    removeCameraHost();
  }

  function refresh() {
    mountKeys();
    mountVoice();
    mountCamera();
  }

  global.OneToneAgentCapabilityUi = {
    refresh: refresh,
    mountKeys: mountKeys,
    mountVoice: mountVoice,
    mountCamera: mountCamera,
    targetMapping: scenarioMapping,
    codexScenarioMapping: codexScenarioMapping,
    activeCodexMapping: activeCodexMapping,
    flowTargetDisplayKey: flowTargetDisplayKey,
    stepTargetDisplayKey: stepTargetDisplayKey,
    schemePairLine: schemePairLine,
    applyRecognitionOverlay: applyRecognitionOverlay,
    hasSelectedSlot: hasSelectedSlot,
    getSelectedSlotId: getSelectedSlotId,
    recordSelectedSlot: recordSelectedSlot,
    clearSelection: clearSelection,
    pushToTalkDisplay: pushToTalkDisplay,
    applyCodexStepChrome: applyCodexStepChrome,
    isCodexKeysEditing: function () { return !!activeCodexMapping(); },
    TARGET_SLOT_IDS: TARGET_SLOT_IDS,
    FINISH_SLOT_IDS: FINISH_SLOT_IDS
  };

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(refresh, 800);
    });
  }
})(typeof window !== 'undefined' ? window : globalThis);
