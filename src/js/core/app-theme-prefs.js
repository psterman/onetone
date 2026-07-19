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
  var SOUND_SLOT_KEYS=['record','voiceWake','keyWake','sendSuccess','sendFail','cameraAction'];
  var SOUND_SLOT_DEFAULTS={
    record:{enabled:true,id:'tiny-tick'},
    voiceWake:{enabled:true,id:'voice-open-signal'},
    keyWake:{enabled:false,id:'input-ready-soft'},
    sendSuccess:{enabled:true,id:'send-confirm-click'},
    sendFail:{enabled:true,id:'error-subtle'},
    cameraAction:{enabled:false,id:'input-ready-soft'}
  };
  var SOUND_CUE_TO_SLOT={
    record:'record',
    voice_wake:'voiceWake',
    key_wake:'keyWake',
    send_success:'sendSuccess',
    send_fail:'sendFail',
    camera_action:'cameraAction'
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
      cameraAction:Object.assign({},SOUND_SLOT_DEFAULTS.cameraAction),
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
    if(!cfg){
      var make=hooks().defaultConfig;
      if(typeof make==='function') state().config=make();
      else state().config={};
    }
    if(!state().config.sounds) state().config.sounds=defaultSoundsConfig();
    SOUND_SLOT_KEYS.forEach(function(key){
      if(!state().config.sounds[key]) state().config.sounds[key]=Object.assign({},SOUND_SLOT_DEFAULTS[key]);
      if(state().config.sounds[key].enabled===undefined) state().config.sounds[key].enabled=!!SOUND_SLOT_DEFAULTS[key].enabled;
      if(!state().config.sounds[key].id) state().config.sounds[key].id=SOUND_SLOT_DEFAULTS[key].id;
    });
    if(state().config.sounds.masterEnabled===undefined) state().config.sounds.masterEnabled=true;
    state().config.sounds.masterEnabled=true;
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
    document.querySelectorAll('.sound-slot-toggle[data-slot="keyWake"]').forEach(function(slotBtn){
      slotBtn.classList.toggle('is-on',!!enabled);
      slotBtn.setAttribute('aria-checked',enabled?'true':'false');
    });
  }

  function fillSoundSelectOptions(select){
    if(!select||select.options.length) return;
    SOUND_CATALOG.forEach(function(item){
      var opt=document.createElement('option');
      opt.value=item.id;
      opt.textContent=soundLabel(item.id);
      select.appendChild(opt);
    });
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
    var intensity=$('recordingAudioIntensityPanel');
    if(intensity){
      intensity.classList.toggle('is-muted-off',!sounds.recordingMuteEnabled);
      intensity.setAttribute('aria-disabled',sounds.recordingMuteEnabled?'false':'true');
    }
  }

  function syncSoundsSettingsUi(){
    var sounds=ensureSoundsConfig();
    SOUND_SLOT_KEYS.forEach(function(key){
      var slot=sounds[key]||SOUND_SLOT_DEFAULTS[key];
      var on=!!slot.enabled;
      var id=slot.id||SOUND_SLOT_DEFAULTS[key].id;
      document.querySelectorAll('.sound-slot-toggle[data-slot="'+key+'"]').forEach(function(toggle){
        toggle.classList.toggle('is-on',on);
        toggle.setAttribute('aria-checked',on?'true':'false');
        toggle.disabled=false;
      });
      document.querySelectorAll('.sound-slot-select[data-slot="'+key+'"]').forEach(function(select){
        fillSoundSelectOptions(select);
        select.value=id;
        select.disabled=false;
      });
      // Legacy id-based selects on sounds page (keep in sync if present).
      var legacy=$('soundSelect'+key.charAt(0).toUpperCase()+key.slice(1));
      if(legacy){
        fillSoundSelectOptions(legacy);
        if(!legacy.getAttribute('data-slot')) legacy.setAttribute('data-slot',key);
        legacy.value=id;
        legacy.disabled=false;
      }
      document.querySelectorAll('.sound-slot-preview[data-slot="'+key+'"]').forEach(function(preview){
        preview.disabled=false;
      });
    });
    syncKeyWakeSoundToggle(!!sounds.keyWake.enabled);
    syncRecordingAudioUi();
  }

  function renderSoundSettingsPanel(){
    syncSoundsSettingsUi();
    var d=global.OneToneI18n.dict();
    var sp=$('settingsPanelSoundsDesc'); if(sp) sp.textContent=d.settingsPanelSoundsDesc;
    var nav=$('settingsNavSoundsLabel'); if(nav) nav.textContent=d.settingsNavSounds;
    [
      ['soundSlotRecordTitle',d.soundSlotRecordTitle],['soundSlotRecordDesc',d.soundSlotRecordDesc],
      ['soundSlotVoiceWakeTitle',d.soundSlotVoiceWakeTitle],['soundSlotVoiceWakeDesc',d.soundSlotVoiceWakeDesc],
      ['soundSlotKeyWakeTitle',d.soundSlotKeyWakeTitle],['soundSlotKeyWakeDesc',d.soundSlotKeyWakeDesc],
      ['soundSlotSendSuccessTitle',d.soundSlotSendSuccessTitle],['soundSlotSendSuccessDesc',d.soundSlotSendSuccessDesc],
      ['soundSlotSendFailTitle',d.soundSlotSendFailTitle],['soundSlotSendFailDesc',d.soundSlotSendFailDesc],
      ['soundSlotCameraActionTitle',d.soundSlotCameraActionTitle],['soundSlotCameraActionDesc',d.soundSlotCameraActionDesc],
      ['keysSoundEmbedTitle',d.soundEmbedStripTitle],['cameraSoundEmbedTitle',d.soundEmbedStripTitle],
      ['keysSoundRecordLbl',d.soundSlotRecordTitle],['keysSoundKeyWakeLbl',d.soundSlotKeyWakeTitle],
      ['cameraSoundActionLbl',d.soundSlotCameraActionTitle],
      ['btnKeysOpenSoundsMore',d.soundEmbedMoreSounds],['btnCameraOpenSoundsMore',d.soundEmbedMoreSounds],
      ['recordingAudioTitle',d.recordingAudioTitle],['recordingAudioDesc',d.recordingAudioDesc],
      ['recordingAudioStrengthLbl',d.recordingAudioStrengthLbl],['recordingAudioHint',d.recordingAudioHint],
      ['btnRecordingAudioStrengthLight',d.recordingMuteStrengthLight],['btnRecordingAudioStrengthBalanced',d.recordingMuteStrengthBalanced],
      ['btnRecordingAudioStrengthStrong',d.recordingMuteStrengthStrong],['btnRecordingAudioStrengthMute',d.recordingMuteStrengthMute],
      ['recordingAudioDiagHint',d.recordingAudioDiagHint],['recordingAudioDiagAction',d.recordingAudioDiagAction],
      ['recordingAudioSoundsLinkTitle',d.recordingAudioTitle],
      ['recordingAudioSoundsLinkDesc',d.recordingAudioSoundsLinkDesc],
      ['btnRecordingAudioOpenRecognize',d.recordingAudioOpenRecognize]
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
    syncSoundsSettingsUi();
    hooks().save();
  }

  function setRecordingAudioMuteEnabled(enabled){
    ensureSoundsConfig();
    state().config.sounds.recordingMuteEnabled=!!enabled;
    syncRecordingAudioUi();
    try{
      var save=hooks().save;
      if(typeof save==='function') save();
      else if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.save==='function'){
        global.OneToneConfigPersist.save();
      }
    }catch(err){
      if(typeof console!=='undefined'&&console.error) console.error('setRecordingAudioMuteEnabled save',err);
    }
    try{
      var ipc=global.OneToneIpc;
      if(ipc&&typeof ipc.invoke==='function'){
        ipc.invoke('cmd_app_log',{line:'ui recordingMuteEnabled='+(enabled?'1':'0')}).catch(function(){});
      }
    }catch(_e){}
  }

  function setRecordingAudioStrength(strength){
    ensureSoundsConfig();
    state().config.sounds.recordingMuteStrength=normalizeRecordingMuteStrength(strength);
    syncRecordingAudioUi();
    try{
      var save=hooks().save;
      if(typeof save==='function') save();
      else if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.save==='function'){
        global.OneToneConfigPersist.save();
      }
    }catch(err){
      if(typeof console!=='undefined'&&console.error) console.error('setRecordingAudioStrength save',err);
    }
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
