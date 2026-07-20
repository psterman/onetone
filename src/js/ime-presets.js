(function(global){
  'use strict';

  var PRESETS = [
    { id:'typeless', nameKey:'imePresetTypeless', icon:'icons/ime/typeless.png', targetKey:'RAlt' },
    { id:'zhipu', nameKey:'imePresetZhipu', icon:'icons/ime/zhipu.png', targetKey:'RAlt' },
    { id:'qianwen', nameKey:'imePresetQianwen', icon:'icons/ime/qianwen.png', targetKey:'RAlt' },
    { id:'shandianshuo', nameKey:'imePresetShandianshuo', icon:'icons/ime/shandianshuo.jpg', targetKey:'RAlt' },
    { id:'sogou', nameKey:'imePresetSogou', icon:'icons/ime/sougou.png', targetKey:'Ctrl+Space' },
    { id:'wechat', nameKey:'imePresetWechat', icon:'icons/ime/weixin.png', targetKey:'Ctrl+Shift+Win' },
    { id:'xunfei', nameKey:'imePresetXunfei', icon:'icons/ime/xunfei.png', targetKey:'F2' }
  ];

  var MOUNTS = {
    mapping: 'imePresetStripMapping',
    onboarding: 'imePresetStripOnboard',
    voice: 'imePresetStripVoice'
  };

  var CARD_ICONS = {
    mapping: 'targetImeIconMapping',
    onboarding: 'onboardTargetImeIcon',
    voice: 'voiceSettingsTargetImeIcon'
  };

  var selectedByContext = { mapping:'', onboarding:'', voice:'' };
  var bound = false;

  function $(id){ return document.getElementById(id); }

  function t(key){
    var app = global.OneToneApp;
    return app && app.t ? app.t(key) : key;
  }

  function esc(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/"/g,'&quot;');
  }

  function normalizeKey(key){
    return String(key || '').trim();
  }

  function presetById(id){
    id = String(id || '').trim();
    if(!id) return null;
    for(var i = 0; i < PRESETS.length; i++){
      if(PRESETS[i].id === id) return PRESETS[i];
    }
    return null;
  }

  function isFirstTimeUse(){
    if(global.OneToneOnboarding && global.OneToneOnboarding.isV2Done){
      return !global.OneToneOnboarding.isV2Done();
    }
    try{ return localStorage.getItem('vp_onboarding_v2_done') !== '1'; }catch(_){ return true; }
  }

  function syncSelectedFromStorage(ctx){
    if(ctx === 'mapping'){
      var core = global.OneToneMappingCore;
      if(core && core.selected){
        var m = core.selected();
        selectedByContext.mapping = (m && m.imePresetId) ? String(m.imePresetId) : '';
      }
      return;
    }
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
      selectedByContext.onboarding = (m && m.imePresetId) ? String(m.imePresetId) : '';
      return;
    }
    if(ctx === 'voice'){
      var st = global.OneToneState && global.OneToneState.state;
      var cfg = st && st.config;
      selectedByContext.voice = cfg && cfg.imePresetId ? String(cfg.imePresetId) : '';
    }
  }

  function getSelectedId(ctx){
    syncSelectedFromStorage(ctx);
    return selectedByContext[ctx] || '';
  }

  function setSelectedId(ctx, id){
    selectedByContext[ctx] = String(id || '');
  }

  function currentKeyForContext(ctx){
    if(ctx === 'mapping'){
      var core = global.OneToneMappingCore;
      var hooks = global.__vp_mapping_list_hooks__ || {};
      if(core && core.selected){
        var m = core.selected();
        var tgt = hooks.selectedDisplayTargetKey ? hooks.selectedDisplayTargetKey() : '';
        if(tgt) return tgt;
        if(m && m.targetKey) return m.targetKey;
      }
      return '';
    }
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
      return m && m.targetKey ? m.targetKey : '';
    }
    if(ctx === 'voice'){
      var st = global.OneToneState && global.OneToneState.state;
      var cfg = st && st.config;
      if(!cfg) return '';
      var sapi = cfg.voiceSapi || cfg.voice_sapi || {};
      var vosk = cfg.voiceVosk || cfg.voice_vosk || {};
      return normalizeKey(sapi.targetKey || vosk.targetKey || '');
    }
    return '';
  }

  function isContextDisabled(ctx){
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      if(a && a.isRecording && a.isRecording()) return true;
      var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
      var trig = m && String(m.triggerKey || '').trim();
      return !trig;
    }
    if(ctx === 'mapping'){
      var rec = global.OneToneMappingRecording;
      if(rec && rec.isPending && rec.isPending()) return true;
    }
    return false;
  }

  function prepareMappingImeApply(){
    if(global.OneToneTargetKeyPicker && global.OneToneTargetKeyPicker.close){
      global.OneToneTargetKeyPicker.close();
    }
    var rec = global.OneToneMappingRecording;
    if(rec && rec.mode && rec.mode() !== 'none' && rec.cancel) rec.cancel();
  }

  function updateHintVisibility(){
    var showOnboard = isFirstTimeUse();
    var onboardHint = $('imePresetHintOnboard');
    if(onboardHint) onboardHint.hidden = !showOnboard;
    var mappingHint = $('imePresetHintMapping');
    if(mappingHint) mappingHint.hidden = false;
    var voiceHint = $('imePresetHintVoice');
    if(voiceHint) voiceHint.hidden = true;
  }

  var PICKER_ICON_SVG = '<svg class="ime-preset-picker-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 17h10"/></svg>';
  var CUSTOM_ICON_SVG = '<svg class="ime-preset-custom-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  function openPickerForContext(ctx){
    if(ctx !== 'mapping' && ctx !== 'onboarding') return;
    if(ctx === 'mapping' && global.OneToneTargetKeyPicker && global.OneToneTargetKeyPicker.open){
      global.OneToneTargetKeyPicker.open();
      return;
    }
    if(ctx === 'onboarding' && global.OneToneTargetKeyPicker && global.OneToneTargetKeyPicker.open){
      global.OneToneTargetKeyPicker.open();
    }
  }

  function startCustomRecordForContext(ctx){
    if(ctx === 'mapping'){
      if(global.OneToneTargetKeyPicker && global.OneToneTargetKeyPicker.close){
        global.OneToneTargetKeyPicker.close();
      }
      var rec = global.OneToneMappingRecording;
      if(rec && rec.isPending && rec.isPending()) return;
      var hooks = global.__vp_bootstrap_hooks__ || {};
      if(hooks.startTargetRecord) hooks.startTargetRecord();
      return;
    }
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      if(a && a.startTargetRecord) a.startTargetRecord();
    }
  }

  function renderMappingTargetImeBadge(iconEl){
    var presetId=getSelectedId('mapping');
    var preset=presetById(presetId);
    var wrap=iconEl.closest?iconEl.closest('.target-key-display, .display'):null;
    if(global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.clearMappingAppTargetBadge){
      global.OneToneAppTargetPresets.clearMappingAppTargetBadge();
    }
    if(wrap){
      wrap.classList.remove('has-ime-badge','has-custom-badge');
    }
    if(preset){
      iconEl.src=preset.icon;
      iconEl.hidden=false;
      iconEl.alt=t(preset.nameKey);
      if(wrap) wrap.classList.add('has-ime-badge');
      return;
    }
    iconEl.hidden=true;
    iconEl.removeAttribute('src');
    iconEl.alt='';
  }

  function renderCardBadge(ctx){
    var iconId = CARD_ICONS[ctx];
    var iconEl = iconId ? $(iconId) : null;
    if(!iconEl) return;
    if(ctx === 'mapping'){
      renderMappingTargetImeBadge(iconEl);
      return;
    }
    var presetId = getSelectedId(ctx);
    var preset = presetById(presetId);
    var wrap = iconEl.closest ? iconEl.closest('.target-key-display') : null;
    if(preset){
      iconEl.src = preset.icon;
      iconEl.hidden = false;
      iconEl.classList.remove('is-placeholder');
      iconEl.alt = t(preset.nameKey);
      if(wrap) wrap.classList.add('has-ime-badge');
      if(global.OneToneAppTargetPresets && global.OneToneAppTargetPresets.renderCardBadge){
        global.OneToneAppTargetPresets.renderCardBadge(ctx);
      }
      return;
    }
    iconEl.hidden = true;
    iconEl.classList.remove('is-placeholder');
    iconEl.removeAttribute('src');
    if(wrap) wrap.classList.remove('has-ime-badge');
  }

  function applyMappingTarget(combo, presetId){
    if(global.OneToneAgentCapabilityUi&&global.OneToneAgentCapabilityUi.clearSelection){
      global.OneToneAgentCapabilityUi.clearSelection();
    }
    if(global.OneToneTargetKeyApply&&global.OneToneTargetKeyApply.applyCustomMappingTarget){
      global.OneToneTargetKeyApply.applyCustomMappingTarget(combo,{source:'ime',presetId:presetId||''});
      setSelectedId('mapping', presetId || '');
      if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
      refresh('mapping');
      return;
    }
    var core = global.OneToneMappingCore;
    var ed = global.OneToneMappingEditorState;
    var hooks = global.__vp_mapping_list_hooks__ || {};
    if(!core || !core.selected) return;
    var m = core.selected();
    if(!m) return;
    combo = normalizeKey(combo);
    if(!combo) return;
    var appTargetId = String(m.appTargetId || '').trim();
    m.imePresetId = presetId || '';
    if(appTargetId){
      if(global.OneToneAppTargetPresets){
        global.OneToneAppTargetPresets.applyVoiceShortcutKeys(combo);
        var workflowKey = global.OneToneAppTargetPresets.presetById(appTargetId);
        if(workflowKey && workflowKey.targetKey) m.targetKey = workflowKey.targetKey;
      }
    }else{
      m.targetKey = combo;
      m.appTargetId = '';
    }
    setSelectedId('mapping', presetId || '');
    var st = global.OneToneState && global.OneToneState.state;
    if(st && st.config) st.config.imePresetId = presetId || '';
    var trig = core.editorTrigger ? core.editorTrigger(m) : (m.triggerKey || '');
    m.label = (trig || '?') + ' → ' + combo;
    if(ed && ed.setEditorTargetKey) ed.setEditorTargetKey(appTargetId ? (m.targetKey || combo) : combo);
    if(hooks.save) hooks.save();
    if(hooks.render) hooks.render();
    else if(core.renderChrome) core.renderChrome();
    if(core.maybeEnableMappingAfterComplete) core.maybeEnableMappingAfterComplete(m);
    if(global.OneToneApp && global.OneToneApp.toast) global.OneToneApp.toast(t('imePresetApplied'));
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
    refresh('mapping');
  }

  function applyOnboardingTarget(combo, presetId){
    combo = normalizeKey(combo);
    if(!combo) return;
    presetId = presetId || '';
    setSelectedId('onboarding', presetId);
    var a = global.OneToneApp;
    if(a && a.saveConfigPatch){
      a.saveConfigPatch(function(m, cfg){
        m.targetKey = combo;
        m.enabled = true;
        m.imePresetId = presetId;
        m.appTargetId = '';
        if(cfg) cfg.imePresetId = presetId;
      });
    }
    if(global.OneToneOnboarding && global.OneToneOnboarding.onTargetCaptured){
      global.OneToneOnboarding.onTargetCaptured({ key: combo, imePresetId: presetId });
    }
    if(a && a.toast) a.toast(t('imePresetApplied'));
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('onboarding');
    refresh('onboarding');
  }

  function applyVoiceTarget(combo, presetId){
    combo = normalizeKey(combo);
    if(!combo) return;
    presetId = presetId || '';
    function write(){
      setSelectedId('voice', presetId);
      var st = global.OneToneState && global.OneToneState.state;
      if(!st || !st.config) return;
      var cfg = st.config;
      if(!cfg.voiceSapi) cfg.voiceSapi = {};
      if(!cfg.voiceVosk) cfg.voiceVosk = {};
      if(!cfg.voiceEnd) cfg.voiceEnd = {};
      cfg.voiceSapi.targetKey = combo;
      cfg.voiceVosk.targetKey = combo;
      cfg.voiceEnd.targetKey = combo;
      cfg.imePresetId = presetId;
      var persist = global.OneToneConfigPersist;
      if(persist && persist.save) persist.save();
      var display = $('voiceSettingsTargetKey');
      if(display && global.OneToneKeyLabels){
        display.textContent = global.OneToneKeyLabels.friendlyKeyName(combo, global.OneToneApp && global.OneToneApp.getLang ? global.OneToneApp.getLang() : 'zh') || combo;
      }
      if(global.OneToneApp && global.OneToneApp.toast) global.OneToneApp.toast(t('imePresetApplied'));
      refresh('voice');
    }
    if(global.OneToneSceneSyncConfirm){
      global.OneToneSceneSyncConfirm.guardGlobalTargetWrite(write, {});
      return;
    }
    write();
  }

  function clearSelectedForManualRecord(ctx){
    setSelectedId(ctx, '');
    if(ctx === 'mapping'){
      var core = global.OneToneMappingCore;
      if(core && core.selected){
        var m = core.selected();
        if(m) m.imePresetId = '';
      }
    }
    if(ctx === 'onboarding'){
      var a = global.OneToneApp;
      if(a && a.saveConfigPatch){
        a.saveConfigPatch(function(m){ m.imePresetId = ''; });
      }
    }
    if(ctx === 'voice'){
      var st = global.OneToneState && global.OneToneState.state;
      if(st && st.config) st.config.imePresetId = '';
    }
    refresh(ctx);
  }

  function applyPreset(ctx, preset){
    if(!preset) return;
    if(ctx === 'mapping') prepareMappingImeApply();
    if(isContextDisabled(ctx)) return;
    if(ctx === 'mapping') applyMappingTarget(preset.targetKey, preset.id);
    else if(ctx === 'onboarding') applyOnboardingTarget(preset.targetKey, preset.id);
    else if(ctx === 'voice') applyVoiceTarget(preset.targetKey, preset.id);
  }

  function renderStrip(ctx){
    var hostId = MOUNTS[ctx];
    var host = hostId ? $(hostId) : null;
    if(!host) return;
    var selectedId = getSelectedId(ctx);
    var disabled = isContextDisabled(ctx);
    host.classList.toggle('is-disabled', disabled);
    var key = currentKeyForContext(ctx);
    var customSelected = !selectedId && !!key;
    var html = '';
    if(ctx === 'mapping' || ctx === 'onboarding'){
      html += '<button type="button" class="ime-preset-item ime-preset-item--picker"'+(disabled?' disabled':'')+' data-ime-context="'+esc(ctx)+'" data-ime-picker="1" title="'+esc(t('keysTargetKeycapPickLink'))+'" aria-label="'+esc(t('keysTargetKeycapPickLink'))+'">'
        +PICKER_ICON_SVG
        +'</button>';
      html += '<button type="button" class="ime-preset-item ime-preset-item--custom'+(customSelected?' is-selected':'')+'" data-ime-context="'+esc(ctx)+'" data-ime-custom="1"'+(disabled?' disabled':'')+' title="'+esc(t('imePresetCustomHint'))+'" aria-label="'+esc(t('imePresetCustom'))+'" aria-pressed="'+(customSelected?'true':'false')+'">'
        +CUSTOM_ICON_SVG
        +'</button>';
    } else {
      html += '<button type="button" class="ime-preset-item ime-preset-item--custom'+(customSelected?' is-selected':'')+'" data-ime-context="'+esc(ctx)+'" data-ime-custom="1"'+(disabled?' disabled':'')+' title="'+esc(t('imePresetCustomHint'))+'" aria-label="'+esc(t('imePresetCustom'))+'" aria-pressed="'+(customSelected?'true':'false')+'">'
        +CUSTOM_ICON_SVG
        +'</button>';
    }
    html += PRESETS.map(function(p){
      var selected = selectedId === p.id;
      var label = t(p.nameKey);
      var keyLabel = global.OneToneKeyLabels
        ? global.OneToneKeyLabels.friendlyKeyName(p.targetKey, global.OneToneApp && global.OneToneApp.getLang ? global.OneToneApp.getLang() : 'zh')
        : p.targetKey;
      return '<button type="button" class="ime-preset-item'+(selected?' is-selected':'')+'" data-ime-context="'+esc(ctx)+'" data-ime-id="'+esc(p.id)+'"'+(disabled?' disabled':'')+' title="'+esc(label+' · '+keyLabel)+'" aria-label="'+esc(label)+'" aria-pressed="'+(selected?'true':'false')+'">'
        +'<img class="ime-preset-icon" src="'+esc(p.icon)+'" alt="" decoding="async" />'
        +'</button>';
    }).join('');
    host.innerHTML = html;
    renderCardBadge(ctx);
  }

  function refresh(ctx){
    updateHintVisibility();
    if(ctx) renderStrip(ctx);
    else Object.keys(MOUNTS).forEach(renderStrip);
  }

  function bind(){
    if(bound) return;
    bound = true;
    Object.keys(MOUNTS).forEach(function(ctx){
      var host = $(MOUNTS[ctx]);
      if(!host) return;
      host.addEventListener('click', function(ev){
        var pickerBtn = ev.target && ev.target.closest ? ev.target.closest('[data-ime-picker]') : null;
        if(pickerBtn && !pickerBtn.disabled){
          ev.stopPropagation();
          var pickerCtx = pickerBtn.getAttribute('data-ime-context') || ctx;
          openPickerForContext(pickerCtx);
          pickerBtn.blur();
          return;
        }
        var customBtn = ev.target && ev.target.closest ? ev.target.closest('[data-ime-custom]') : null;
        if(customBtn && !customBtn.disabled){
          ev.stopPropagation();
          var customCtx = customBtn.getAttribute('data-ime-context') || ctx;
          if(customCtx === 'mapping') prepareMappingImeApply();
          clearSelectedForManualRecord(customCtx);
          if(customCtx === 'mapping' || customCtx === 'onboarding'){
            startCustomRecordForContext(customCtx);
          }
          customBtn.blur();
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-ime-id]') : null;
        if(!btn || btn.disabled) return;
        ev.stopPropagation();
        var id = btn.getAttribute('data-ime-id');
        var context = btn.getAttribute('data-ime-context') || ctx;
        var preset = presetById(id);
        applyPreset(context, preset);
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

  global.OneToneImePresets = {
    init: init,
    refresh: refresh,
    applyLang: applyLang,
    presets: PRESETS,
    presetById: presetById,
    clearSelectedForManualRecord: clearSelectedForManualRecord,
    renderCardBadge: renderCardBadge,
    renderMappingTargetImeBadge: renderMappingTargetImeBadge
  };
})(typeof window !== 'undefined' ? window : globalThis);
