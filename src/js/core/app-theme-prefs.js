(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var state=function(){ return global.OneToneState.state; };
  function hooks(){ return global.__vp_app_theme_prefs_hooks__ || {}; }
  var theme='light';
  var fontScale='md';
  var FONT_SCALE_VALUES={sm:0.88,md:1,lg:1.12,xl:1.24};
  var SOUND_CATALOG=[
    {id:'tiny-tick',labelKey:'soundNameTinyTick'},
    {id:'input-ready-soft',labelKey:'soundNameInputReady'},
    {id:'voice-open-signal',labelKey:'soundNameVoiceSignal'},
    {id:'voice-open-gate',labelKey:'soundNameVoiceGate'},
    {id:'voice-open-sip',labelKey:'soundNameVoiceSip'},
    {id:'send-confirm-click',labelKey:'soundNameSendConfirm'},
    {id:'error-subtle',labelKey:'soundNameErrorSubtle'}
  ];
  var SOUND_SLOT_KEYS=['record','voiceWake','keyWake','sendSuccess','sendFail'];
  var SOUND_SLOT_DEFAULTS={
    record:{enabled:true,id:'tiny-tick'},
    voiceWake:{enabled:true,id:'voice-open-signal'},
    keyWake:{enabled:false,id:'input-ready-soft'},
    sendSuccess:{enabled:true,id:'send-confirm-click'},
    sendFail:{enabled:true,id:'error-subtle'}
  };
  var SOUND_CUE_TO_SLOT={
    record:'record',
    voice_wake:'voiceWake',
    key_wake:'keyWake',
    send_success:'sendSuccess',
    send_fail:'sendFail'
  };
  var soundAudioCache={};

  function defaultSoundsConfig(){
    return {
      masterEnabled:true,
      record:Object.assign({},SOUND_SLOT_DEFAULTS.record),
      voiceWake:Object.assign({},SOUND_SLOT_DEFAULTS.voiceWake),
      keyWake:Object.assign({},SOUND_SLOT_DEFAULTS.keyWake),
      sendSuccess:Object.assign({},SOUND_SLOT_DEFAULTS.sendSuccess),
      sendFail:Object.assign({},SOUND_SLOT_DEFAULTS.sendFail),
      recordingMuteEnabled:false,
      recordingMuteStrength:'balanced'
    };
  }

  function normalizeRecordingMuteStrength(raw){
    var key=String(raw||'').trim().toLowerCase();
    if(key==='light'||key==='balanced'||key==='strong'||key==='mute') return key;
    return 'balanced';
  }

  function recordingMuteStrengthLabel(strength){
    var key=normalizeRecordingMuteStrength(strength);
    var dict={
      light:t('recordingMuteStrengthLight'),
      balanced:t('recordingMuteStrengthBalanced'),
      strong:t('recordingMuteStrengthStrong'),
      mute:t('recordingMuteStrengthMute')
    };
    return dict[key]||dict.balanced;
  }

  function recordingMuteStrengthOptions(){
    return [
      {id:'light',labelKey:'recordingMuteStrengthLight'},
      {id:'balanced',labelKey:'recordingMuteStrengthBalanced'},
      {id:'strong',labelKey:'recordingMuteStrengthStrong'},
      {id:'mute',labelKey:'recordingMuteStrengthMute'}
    ];
  }

  function ensureSoundsConfig(){
    var cfg=state().config;
    if(!cfg) state().config=hooks().defaultConfig();
    if(!state().config.sounds) state().config.sounds=defaultSoundsConfig();
    SOUND_SLOT_KEYS.forEach(function(key){
      if(!state().config.sounds[key]) state().config.sounds[key]=Object.assign({},SOUND_SLOT_DEFAULTS[key]);
      if(state().config.sounds[key].enabled===undefined) state().config.sounds[key].enabled=!!SOUND_SLOT_DEFAULTS[key].enabled;
      if(!state().config.sounds[key].id) state().config.sounds[key].id=SOUND_SLOT_DEFAULTS[key].id;
    });
    if(state().config.sounds.masterEnabled===undefined) state().config.sounds.masterEnabled=true;
    if(state().config.sounds.recordingMuteEnabled===undefined) state().config.sounds.recordingMuteEnabled=false;
    state().config.sounds.recordingMuteStrength=normalizeRecordingMuteStrength(state().config.sounds.recordingMuteStrength);
    if(state().config.keyWakeSoundEnabled&&!state().config.sounds.keyWake.enabled){
      state().config.sounds.keyWake.enabled=true;
    }
    return state().config.sounds;
  }

  function soundLabel(id){
    var item=SOUND_CATALOG.find(function(x){ return x.id===id; });
    return item?t(item.labelKey):id;
  }

  function playSoundFile(fileId,ignoreMaster){
    if(!fileId) return;
    var src='sounds/'+fileId+'.wav';
    var audio=soundAudioCache[src];
    if(!audio){
      audio=new Audio(src);
      audio.volume=0.65;
      soundAudioCache[src]=audio;
    }
    audio.currentTime=0;
    audio.play().catch(function(){});
  }

  function setTheme(next){
    theme=next==='dark'?'dark':'light';
    applyTheme();
  }

  function applyTheme(){
    document.documentElement.setAttribute('data-theme',theme);
    document.querySelectorAll('[data-theme-pick]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-theme-pick')===theme);
    });
    document.querySelectorAll('[data-style-pick]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-style-pick')===theme);
    });
    try{ localStorage.setItem('vp_theme',theme); }catch(_){}
    try{ window.chrome?.webview?.postMessage({type:'mvp_sync_theme_backdrop',theme:theme}); }catch(_){}
    if(global.OneToneBasicPanelUi&&global.OneToneBasicPanelUi.render) global.OneToneBasicPanelUi.render();
  }

  function applyFontScale(){
    var val=FONT_SCALE_VALUES[fontScale]||1;
    document.documentElement.style.setProperty('--ui-font-scale',String(val));
    document.documentElement.setAttribute('data-font-scale',fontScale);
    document.querySelectorAll('.pref-segmented-btn[data-scale]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-scale')===fontScale);
    });
    try{ localStorage.setItem('vp_font_scale',fontScale); }catch(_){}
    if(global.OneToneHomeGuide) global.OneToneHomeGuide.scheduleLayoutIfOpen();
    if(global.OneToneBasicPanelUi&&global.OneToneBasicPanelUi.render) global.OneToneBasicPanelUi.render();
  }

  function setFontScale(scale){
    if(!FONT_SCALE_VALUES[scale]) return;
    fontScale=scale;
    applyFontScale();
  }

  function playSoundCue(cue,forcePreview){
    var slotKey=SOUND_CUE_TO_SLOT[cue];
    if(!slotKey&&!forcePreview) return;
    var sounds=ensureSoundsConfig();
    if(!forcePreview){
      if(!sounds.masterEnabled) return;
      var slot=sounds[slotKey];
      if(!slot||!slot.enabled) return;
      playSoundFile(slot.id);
      return;
    }
    playSoundFile(forcePreview);
  }

  function previewSoundSlot(slotKey){
    var sounds=ensureSoundsConfig();
    var slot=sounds[slotKey];
    if(slot&&slot.id) playSoundFile(slot.id,true);
  }

  function syncKeyWakeSoundToggle(enabled){
    var slotBtn=document.querySelector('.sound-slot-toggle[data-slot="keyWake"]');
    if(slotBtn){
      slotBtn.classList.toggle('is-on',!!enabled);
      slotBtn.setAttribute('aria-checked',enabled?'true':'false');
    }
  }

  function syncRecordingAudioUi(){
    var sounds=ensureSoundsConfig();
    var toggle=$('btnRecordingAudioMute');
    if(toggle){
      toggle.classList.toggle('is-on',!!sounds.recordingMuteEnabled);
      toggle.setAttribute('aria-checked',sounds.recordingMuteEnabled?'true':'false');
    }
    document.querySelectorAll('.recording-audio-strength-btn').forEach(function(btn){
      btn.classList.toggle('is-active',String(btn.getAttribute('data-recording-mute-strength')||'')===sounds.recordingMuteStrength);
      btn.disabled=!sounds.recordingMuteEnabled;
    });
    var label=$('recordingAudioStrengthCurrent');
    if(label) label.textContent=recordingMuteStrengthLabel(sounds.recordingMuteStrength);
  }

  function syncSoundsSettingsUi(){
    var sounds=ensureSoundsConfig();
    var master=$('btnSoundsMaster');
    if(master){
      master.classList.toggle('is-on',!!sounds.masterEnabled);
      master.setAttribute('aria-checked',sounds.masterEnabled?'true':'false');
    }
    SOUND_SLOT_KEYS.forEach(function(key){
      var slot=sounds[key]||SOUND_SLOT_DEFAULTS[key];
      var toggle=document.querySelector('.sound-slot-toggle[data-slot="'+key+'"]');
      if(toggle){
        toggle.classList.toggle('is-on',!!slot.enabled);
        toggle.setAttribute('aria-checked',slot.enabled?'true':'false');
      }
      var select=$('soundSelect'+key.charAt(0).toUpperCase()+key.slice(1));
      if(select){
        if(!select.options.length){
          SOUND_CATALOG.forEach(function(item){
            var opt=document.createElement('option');
            opt.value=item.id;
            opt.textContent=soundLabel(item.id);
            select.appendChild(opt);
          });
        }
        select.value=slot.id||SOUND_SLOT_DEFAULTS[key].id;
        select.disabled=!sounds.masterEnabled;
      }
      var preview=document.querySelector('.sound-slot-preview[data-slot="'+key+'"]');
      if(preview) preview.disabled=!sounds.masterEnabled;
    });
    syncKeyWakeSoundToggle(!!sounds.keyWake.enabled);
    syncRecordingAudioUi();
    document.querySelectorAll('.sound-slot-toggle').forEach(function(btn){
      btn.disabled=!sounds.masterEnabled;
    });
  }

  function renderSoundSettingsPanel(){
    syncSoundsSettingsUi();
    var d=global.OneToneI18n.dict();
    var sp=$('settingsPanelSoundsDesc'); if(sp) sp.textContent=d.settingsPanelSoundsDesc;
    var nav=$('settingsNavSoundsLabel'); if(nav) nav.textContent=d.settingsNavSounds;
    [
      ['soundsMasterLabel',d.soundsMasterLabel],['soundsMasterHelp',d.soundsMasterHelp],
      ['soundSlotRecordTitle',d.soundSlotRecordTitle],['soundSlotRecordDesc',d.soundSlotRecordDesc],
      ['soundSlotVoiceWakeTitle',d.soundSlotVoiceWakeTitle],['soundSlotVoiceWakeDesc',d.soundSlotVoiceWakeDesc],
      ['soundSlotKeyWakeTitle',d.soundSlotKeyWakeTitle],['soundSlotKeyWakeDesc',d.soundSlotKeyWakeDesc],
      ['soundSlotSendSuccessTitle',d.soundSlotSendSuccessTitle],['soundSlotSendSuccessDesc',d.soundSlotSendSuccessDesc],
      ['soundSlotSendFailTitle',d.soundSlotSendFailTitle],['soundSlotSendFailDesc',d.soundSlotSendFailDesc],
      ['recordingAudioTitle',d.recordingAudioTitle],['recordingAudioDesc',d.recordingAudioDesc],
      ['recordingAudioStrengthLbl',d.recordingAudioStrengthLbl],['recordingAudioHint',d.recordingAudioHint],
      ['btnRecordingAudioStrengthLight',d.recordingMuteStrengthLight],['btnRecordingAudioStrengthBalanced',d.recordingMuteStrengthBalanced],
      ['btnRecordingAudioStrengthStrong',d.recordingMuteStrengthStrong],['btnRecordingAudioStrengthMute',d.recordingMuteStrengthMute],
      ['recordingAudioDiagHint',d.recordingAudioDiagHint],['recordingAudioDiagAction',d.recordingAudioDiagAction]
    ].forEach(function(pair){
      var el=$(pair[0]); if(el) el.textContent=pair[1];
    });
    document.querySelectorAll('.sound-slot-preview').forEach(function(btn){
      btn.textContent=d.soundPreview;
    });
    SOUND_CATALOG.forEach(function(item){
      document.querySelectorAll('.sound-slot-select option[value="'+item.id+'"]').forEach(function(opt){
        opt.textContent=soundLabel(item.id);
      });
    });
  }

  function setSoundSlotEnabled(slotKey,enabled){
    ensureSoundsConfig();
    state().config.sounds[slotKey].enabled=!!enabled;
    if(slotKey==='keyWake') state().config.keyWakeSoundEnabled=!!enabled;
    syncSoundsSettingsUi();
    hooks().save();
  }

  function setSoundSlotId(slotKey,id){
    ensureSoundsConfig();
    state().config.sounds[slotKey].id=id;
    hooks().save();
  }

  function setRecordingAudioMuteEnabled(enabled){
    ensureSoundsConfig();
    state().config.sounds.recordingMuteEnabled=!!enabled;
    syncRecordingAudioUi();
    hooks().save();
  }

  function setRecordingAudioStrength(strength){
    ensureSoundsConfig();
    state().config.sounds.recordingMuteStrength=normalizeRecordingMuteStrength(strength);
    syncRecordingAudioUi();
    hooks().save();
  }

  function toggleSoundsMaster(){
    ensureSoundsConfig();
    var btn=$('btnSoundsMaster');
    if(!btn) return;
    state().config.sounds.masterEnabled=!btn.classList.contains('is-on');
    syncSoundsSettingsUi();
    hooks().save();
  }

  function syncKeyWakeSettingsFromConfig(){
    ensureSoundsConfig();
    syncSoundsSettingsUi();
  }

  global.OneToneAppThemePrefs={
    setTheme:setTheme,
    applyTheme:applyTheme,
    setFontScale:setFontScale,
    applyFontScale:applyFontScale,
    fontScaleValues:function(){ return FONT_SCALE_VALUES; },
    defaultSoundsConfig:defaultSoundsConfig,
    soundSlotDefaults:function(){ return SOUND_SLOT_DEFAULTS; },
    playSoundCue:playSoundCue,
    previewSoundSlot:previewSoundSlot,
    renderSoundSettingsPanel:renderSoundSettingsPanel,
    setSoundSlotEnabled:setSoundSlotEnabled,
    setSoundSlotId:setSoundSlotId,
    setRecordingAudioMuteEnabled:setRecordingAudioMuteEnabled,
    setRecordingAudioStrength:setRecordingAudioStrength,
    syncRecordingAudioUi:syncRecordingAudioUi,
    normalizeRecordingMuteStrength:normalizeRecordingMuteStrength,
    recordingMuteStrengthLabel:recordingMuteStrengthLabel,
    recordingMuteStrengthOptions:recordingMuteStrengthOptions,
    toggleSoundsMaster:toggleSoundsMaster,
    ensureSoundsConfig:ensureSoundsConfig,
    syncSoundsSettingsUi:syncSoundsSettingsUi,
    syncKeyWakeSettingsFromConfig:syncKeyWakeSettingsFromConfig
  };
})((typeof window!=='undefined')?window:globalThis);
