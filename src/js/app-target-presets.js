(function(global){
  'use strict';

  var PRESETS = [
    {
      id: 'cursor-chat',
      nameKey: 'appTargetCursor',
      descKey: 'appTargetCursorDesc',
      targetKey: 'Ctrl+L',
      icon: 'icons/app-target/cursor.svg',
      badge: 'Cr',
      badgeEn: 'Cr'
    },
    {
      id: 'codex-chat',
      nameKey: 'appTargetCodex',
      descKey: 'appTargetCodexDesc',
      targetKey: '',
      icon: 'icons/app-target/codex.svg',
      badge: 'Cx',
      badgeEn: 'Cx'
    },
    {
      id: 'claude-code',
      nameKey: 'appTargetClaudeCode',
      descKey: 'appTargetClaudeCodeDesc',
      targetKey: 'Ctrl+Shift+Enter',
      icon: 'icons/app-target/claude.svg',
      badge: 'Cc',
      badgeEn: 'Cc'
    },
    {
      id: 'copilot-chat',
      nameKey: 'appTargetCopilot',
      descKey: 'appTargetCopilotDesc',
      targetKey: 'Ctrl+Shift+I',
      icon: 'icons/app-target/copilot.svg',
      badge: 'Cp',
      badgeEn: 'Cp'
    },
    {
      id: 'win-dictation',
      nameKey: 'appTargetWinDictation',
      descKey: 'appTargetWinDictationDesc',
      targetKey: 'Win+H',
      icon: 'icons/app-target/windows.svg',
      badge: 'Win',
      badgeEn: 'Win'
    }
  ];

  var MOUNTS = {
    mapping: 'appTargetStripMapping',
    onboarding: 'appTargetStripOnboard'
  };

  var CARD_BADGES = {
    mapping: 'targetAppBadgeMapping',
    onboarding: 'onboardTargetAppBadge'
  };

  var selectedByContext = { mapping: '', onboarding: '' };
  var bound = false;

  function $(id){ return document.getElementById(id); }

  function t(key){
    var app = global.OneToneApp;
    return app && app.t ? app.t(key) : key;
  }

  function lang(){
    return global.OneToneI18n && global.OneToneI18n.getLang
      ? global.OneToneI18n.getLang()
      : 'zh';
  }

  function esc(s){
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function presetById(id){
    id = String(id || '').trim();
    if(!id) return null;
    for(var i = 0; i < PRESETS.length; i++){
      if(PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  function applyVoiceShortcutKeys(combo){
    var st = global.OneToneState && global.OneToneState.state;
    if(!st || !st.config) return;
    var cfg = st.config;
    if(!cfg.voiceVosk) cfg.voiceVosk = {};
    if(!cfg.voiceSapi) cfg.voiceSapi = {};
    if(!cfg.voiceEnd) cfg.voiceEnd = {};
    cfg.voiceVosk.targetKey = combo;
    cfg.voiceSapi.targetKey = combo;
    cfg.voiceEnd.targetKey = combo;
  }


  function mappingTargetKeyForAppTarget(appTargetId){
    var preset = presetById(appTargetId);
    if(preset && preset.targetKey) return preset.targetKey;
    if(appTargetId === 'cursor-chat') return 'Ctrl+L';
    return '';
  }

  function applyRecordedVoiceShortcut(m, combo){
    if(!m) return;
    combo = String(combo || '').trim();
    if(!combo) return;
    var appTargetId = String(m.appTargetId || '').trim();
    if(appTargetId){
      applyVoiceShortcutKeys(combo);
      var workflowKey = mappingTargetKeyForAppTarget(appTargetId);
      if(workflowKey) m.targetKey = workflowKey;
      return;
    }
    m.targetKey = combo;
    m.imePresetId = '';
    m.appTargetId = '';
  }

  function syncSelectedFromStorage(ctx){
    if(ctx === 'mapping'){
      var core = global.OneToneMappingCore;
      if(core && core.selected){
        var m = core.selected();
        selectedByContext.mapping = (m && m.appTargetId) ? String(m.appTargetId) : '';
      }
      return;
    }
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
      selectedByContext.onboarding = (m && m.appTargetId) ? String(m.appTargetId) : '';
    }
  }

  function getSelectedId(ctx){
    syncSelectedFromStorage(ctx);
    return selectedByContext[ctx] || '';
  }

  function setSelectedId(ctx, id){
    selectedByContext[ctx] = String(id || '');
  }

  function isContextDisabled(ctx){
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      if(a && a.isRecording && a.isRecording()) return true;
      var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
      return !String(m && m.triggerKey || '').trim();
    }
    if(ctx === 'mapping'){
      var rec = global.OneToneMappingRecording;
      if(rec && rec.mode && rec.mode() === 'target') return true;
    }
    return false;
  }

  function clearImeSelection(ctx){
    if(global.OneToneImePresets && global.OneToneImePresets.clearSelectedForManualRecord){
      global.OneToneImePresets.clearSelectedForManualRecord(ctx);
    }
  }

  function isFirstTimeUse(){
    if(global.OneToneOnboarding && global.OneToneOnboarding.isV2Done){
      return !global.OneToneOnboarding.isV2Done();
    }
    try{ return localStorage.getItem('vp_onboarding_v2_done') !== '1'; }catch(_){ return true; }
  }

  function isRecommended(preset, ctx){
    if(!preset || preset.id !== 'cursor-chat' || ctx !== 'onboarding') return false;
    if(isContextDisabled(ctx)) return false;
    if(getSelectedId(ctx)) return false;
    var a = global.OneToneApp;
    var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
    if(m && String(m.imePresetId || '').trim()) return false;
    return true;
  }

  function updateOnboardHintText(ctx){
    if(ctx !== 'onboarding') return;
    var hint = $('appTargetHintOnboard');
    if(!hint) return;
    var step = $('onboardAppTargetStep');
    if(step && step.hidden) return;
    var selected = getSelectedId('onboarding');
    var a = global.OneToneApp;
    var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
    if(!selected && !(m && m.imePresetId) && !isContextDisabled('onboarding')){
      hint.textContent = t('appTargetHintCursor');
    }else{
      hint.textContent = t('appTargetHint');
    }
  }

  function updateHintVisibility(){
    updateOnboardHintText('onboarding');
    var mappingHint = $('appTargetHintMapping');
    if(mappingHint) mappingHint.textContent = t('appTargetHint');
  }

  function renderCardBadge(ctx){
    var badgeId = CARD_BADGES[ctx];
    var badgeEl = badgeId ? $(badgeId) : null;
    if(!badgeEl) return;
    var presetId = getSelectedId(ctx);
    var preset = presetById(presetId);
    var wrap = badgeEl.closest ? badgeEl.closest('.target-key-display, .display') : null;
    if(preset){
      badgeEl.innerHTML = preset.icon
        ? '<img class="app-target-card-icon" src="' + esc(preset.icon) + '" alt="" decoding="async" />'
        : esc(lang() === 'en' ? (preset.badgeEn || preset.badge) : preset.badge);
      badgeEl.hidden = false;
      badgeEl.classList.toggle('has-icon', !!preset.icon);
      badgeEl.setAttribute('title', t(preset.nameKey));
      if(wrap) wrap.classList.add('has-app-target-badge');
      if(ctx === 'mapping' || ctx === 'onboarding'){
        var imeIcon = $(ctx === 'mapping' ? 'targetImeIconMapping' : 'onboardTargetImeIcon');
        if(imeIcon){ imeIcon.hidden = true; imeIcon.removeAttribute('src'); }
      }
      return;
    }
    badgeEl.hidden = true;
    badgeEl.textContent = '';
    badgeEl.innerHTML = '';
    badgeEl.classList.remove('has-icon');
    badgeEl.removeAttribute('title');
    if(wrap) wrap.classList.remove('has-app-target-badge');
  }

  function persistMapping(){
    if(global.OneToneConfigPersist && global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save();
      return;
    }
    var coreHooks = global.__vp_mapping_core_hooks__ || {};
    if(coreHooks.save) coreHooks.save();
  }

  function renderMappingChrome(){
    var coreHooks = global.__vp_mapping_core_hooks__ || {};
    if(coreHooks.render) coreHooks.render();
    else if(global.OneToneMappingCore && global.OneToneMappingCore.renderChrome){
      global.OneToneMappingCore.renderChrome();
    }
  }

  function applyMappingTarget(combo, presetId){
    var core = global.OneToneMappingCore;
    var ed = global.OneToneMappingEditorState;
    if(!core || !core.selected) return;
    var m = core.selected();
    if(!m) return;
    combo = String(combo || '').trim();
    presetId = String(presetId || '').trim();
    if(!presetId && !combo) return;
    var prevVoice = String(m.targetKey || '').trim();
    m.targetKey = combo;
    m.appTargetId = presetId;
    m.imePresetId = '';
    setSelectedId('mapping', presetId);
    var st = global.OneToneState && global.OneToneState.state;
    if(st && st.config) st.config.imePresetId = '';
    var workflowKey = mappingTargetKeyForAppTarget(presetId);
    if(presetId && prevVoice && prevVoice !== combo && prevVoice !== workflowKey){
      var cfg = st && st.config;
      var vosk = cfg && (cfg.voiceVosk || cfg.voice_vosk || {});
      var sapi = cfg && (cfg.voiceSapi || cfg.voice_sapi || {});
      if(!String(vosk.targetKey || '').trim() && !String(sapi.targetKey || '').trim()){
        applyVoiceShortcutKeys(prevVoice);
      }
    }
    var displayTarget = core.editorTarget ? core.editorTarget(m) : combo;
    var trig = core.editorTrigger ? core.editorTrigger(m) : (m.triggerKey || '');
    m.label = (trig || '?') + ' → ' + (displayTarget || combo);
    if(ed && ed.setEditorTargetKey) ed.setEditorTargetKey(displayTarget || combo);
    persistMapping();
    renderMappingChrome();
    if(core.maybeEnableAfterComplete) core.maybeEnableAfterComplete(m);
    if(global.OneToneApp && global.OneToneApp.toast){
      global.OneToneApp.toast(t('appTargetApplied'));
    }
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');
    refresh('mapping');
  }

  function applyOnboardingTarget(combo, presetId){
    combo = String(combo || '').trim();
    presetId = String(presetId || '').trim();
    if(!presetId && !combo) return;
    setSelectedId('onboarding', presetId);
    clearImeSelection('onboarding');
    var a = global.OneToneApp;
    if(a && a.saveConfigPatch){
      a.saveConfigPatch(function(m){
        m.targetKey = combo;
        m.enabled = true;
        m.appTargetId = presetId;
        m.imePresetId = '';
      });
    }
    if(global.OneToneOnboarding && global.OneToneOnboarding.onTargetCaptured){
      global.OneToneOnboarding.onTargetCaptured({ key: combo, appTargetId: presetId });
    }
    if(a && a.toast) a.toast(t('appTargetApplied'));
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('onboarding');
    refresh('onboarding');
  }

  function applyPreset(ctx, preset){
    if(!preset || isContextDisabled(ctx)) return;
    if(ctx === 'mapping') applyMappingTarget(preset.targetKey, preset.id);
    else if(ctx === 'onboarding') applyOnboardingTarget(preset.targetKey, preset.id);
  }

  function renderStrip(ctx){
    var hostId = MOUNTS[ctx];
    var host = hostId ? $(hostId) : null;
    if(!host) return;
    var selectedId = getSelectedId(ctx);
    var disabled = isContextDisabled(ctx);
    host.classList.toggle('is-disabled', disabled);
    host.innerHTML = PRESETS.map(function(p){
      var selected = selectedId === p.id;
      var recommended = !disabled && isRecommended(p, ctx);
      var label = t(p.nameKey);
      var desc = t(p.descKey);
      return '<button type="button" class="app-target-item'
        + (selected ? ' is-selected' : '')
        + (recommended ? ' is-recommended' : '')
        + '"'
        + ' data-app-target-context="' + esc(ctx) + '" data-app-target-id="' + esc(p.id) + '"'
        + (disabled ? ' disabled' : '')
        + ' title="' + esc(desc) + '" aria-label="' + esc(label) + '" aria-pressed="' + (selected ? 'true' : 'false') + '">'
        + '<img class="app-target-icon" src="' + esc(p.icon) + '" alt="" decoding="async" />'
        + '<span class="app-target-name">' + esc(label) + '</span>'
        + '</button>';
    }).join('');
    updateOnboardHintText(ctx);
    renderCardBadge(ctx);
  }

  function refresh(ctx){
    updateHintVisibility();
    if(ctx) renderStrip(ctx);
    else Object.keys(MOUNTS).forEach(renderStrip);
  }

  function clearSelectedForManualRecord(ctx){
    setSelectedId(ctx, '');
    if(ctx === 'mapping'){
      var core = global.OneToneMappingCore;
      if(core && core.selected){
        var m = core.selected();
        if(m) m.appTargetId = '';
      }
    }
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      if(a && a.saveConfigPatch){
        a.saveConfigPatch(function(m){ m.appTargetId = ''; });
      }
    }
    refresh(ctx);
  }

  function bind(){
    if(bound) return;
    bound = true;
    Object.keys(MOUNTS).forEach(function(ctx){
      var host = $(MOUNTS[ctx]);
      if(!host) return;
      host.addEventListener('click', function(ev){
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-app-target-id]') : null;
        if(!btn || btn.disabled) return;
        ev.stopPropagation();
        var id = btn.getAttribute('data-app-target-id');
        var context = btn.getAttribute('data-app-target-context') || ctx;
        applyPreset(context, presetById(id));
        btn.blur();
      });
    });
  }

  function init(){
    bind();
    refresh();
  }

  function applyLang(){
    refresh();
  }

  global.OneToneAppTargetPresets = {
    init: init,
    refresh: refresh,
    applyLang: applyLang,
    presets: PRESETS,
    presetById: presetById,
    applyRecordedVoiceShortcut: applyRecordedVoiceShortcut,
    applyVoiceShortcutKeys: applyVoiceShortcutKeys,
    clearSelectedForManualRecord: clearSelectedForManualRecord,
    renderCardBadge: renderCardBadge
  };
})(typeof window !== 'undefined' ? window : globalThis);
