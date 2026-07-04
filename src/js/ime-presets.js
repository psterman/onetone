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
      if(rec && rec.mode && rec.mode() === 'target') return true;
    }
    return false;
  }

  function updateHintVisibility(){
    var showOnboard = isFirstTimeUse();
    var onboardHint = $('imePresetHintOnboard');
    if(onboardHint) onboardHint.hidden = !showOnboard;
    var mappingHint = $('imePresetHintMapping');
    if(mappingHint) mappingHint.hidden = true;
    var voiceHint = $('imePresetHintVoice');
    if(voiceHint) voiceHint.hidden = true;
  }

  function renderCardBadge(ctx){
    var iconId = CARD_ICONS[ctx];
    var iconEl = iconId ? $(iconId) : null;
    if(!iconEl) return;
    var presetId = getSelectedId(ctx);
    var preset = presetById(presetId);
    var wrap = iconEl.closest ? iconEl.closest('.target-key-display') : null;
    if(preset){
      iconEl.src = preset.icon;
      iconEl.hidden = false;
      iconEl.alt = t(preset.nameKey);
      if(wrap) wrap.classList.add('has-ime-badge');
      return;
    }
    iconEl.hidden = true;
    iconEl.removeAttribute('src');
    if(wrap) wrap.classList.remove('has-ime-badge');
  }

  function applyMappingTarget(combo, presetId){
    var core = global.OneToneMappingCore;
    var ed = global.OneToneMappingEditorState;
    var hooks = global.__vp_mapping_list_hooks__ || {};
    if(!core || !core.selected) return;
    var m = core.selected();
    if(!m) return;
    combo = normalizeKey(combo);
    if(!combo) return;
    m.targetKey = combo;
    m.imePresetId = presetId || '';
    setSelectedId('mapping', presetId || '');
    var trig = core.editorTrigger ? core.editorTrigger(m) : (m.triggerKey || '');
    m.label = (trig || '?') + ' → ' + combo;
    if(ed && ed.setEditorTargetKey) ed.setEditorTargetKey(combo);
    if(hooks.save) hooks.save();
    if(hooks.render) hooks.render();
    else if(core.renderChrome) core.renderChrome();
    if(core.maybeEnableMappingAfterComplete) core.maybeEnableMappingAfterComplete(m);
    if(global.OneToneApp && global.OneToneApp.toast) global.OneToneApp.toast(t('imePresetApplied'));
    refresh('mapping');
  }

  function applyOnboardingTarget(combo, presetId){
    combo = normalizeKey(combo);
    if(!combo) return;
    presetId = presetId || '';
    setSelectedId('onboarding', presetId);
    var a = global.OneToneApp;
    if(a && a.saveConfigPatch){
      a.saveConfigPatch(function(m){
        m.targetKey = combo;
        m.enabled = true;
        m.imePresetId = presetId;
      });
    }
    if(global.OneToneOnboarding && global.OneToneOnboarding.onTargetCaptured){
      global.OneToneOnboarding.onTargetCaptured({ key: combo, imePresetId: presetId });
    }
    if(a && a.toast) a.toast(t('imePresetApplied'));
    refresh('onboarding');
  }

  function applyVoiceTarget(combo, presetId){
    combo = normalizeKey(combo);
    if(!combo) return;
    presetId = presetId || '';
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
    if(!preset || isContextDisabled(ctx)) return;
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
    host.innerHTML = PRESETS.map(function(p){
      var selected = selectedId === p.id;
      var label = t(p.nameKey);
      var keyLabel = global.OneToneKeyLabels
        ? global.OneToneKeyLabels.friendlyKeyName(p.targetKey, global.OneToneApp && global.OneToneApp.getLang ? global.OneToneApp.getLang() : 'zh')
        : p.targetKey;
      return '<button type="button" class="ime-preset-item'+(selected?' is-selected':'')+'" data-ime-context="'+esc(ctx)+'" data-ime-id="'+esc(p.id)+'"'+(disabled?' disabled':'')+' title="'+esc(label+' · '+keyLabel)+'" aria-label="'+esc(label)+'" aria-pressed="'+(selected?'true':'false')+'">'
        +'<img class="ime-preset-icon" src="'+esc(p.icon)+'" alt="" decoding="async" />'
        +'<span class="ime-preset-tip">'+esc(label)+'</span>'
        +'</button>';
    }).join('');
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
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-ime-id]') : null;
        if(!btn || btn.disabled) return;
        ev.stopPropagation();
        var id = btn.getAttribute('data-ime-id');
        var context = btn.getAttribute('data-ime-context') || ctx;
        var preset = presetById(id);
        applyPreset(context, preset);
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
    renderCardBadge: renderCardBadge
  };
})(typeof window !== 'undefined' ? window : globalThis);
