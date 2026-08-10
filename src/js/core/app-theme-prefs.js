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
    var cats={};
    if(global.OneToneSoundBus&&global.OneToneSoundBus.CATEGORY_DEFAULTS){
      var defs=global.OneToneSoundBus.CATEGORY_DEFAULTS;
      Object.keys(defs).forEach(function(k){
        cats[k]={policy:defs[k].policy,id:defs[k].id};
      });
    }else{
      cats={
        needAttention:{policy:'when_unseen',id:'input-ready-soft'},
        taskFailed:{policy:'when_unseen',id:'error-subtle'},
        taskDone:{policy:'when_unseen',id:'send-confirm-click'},
        confirm:{policy:'always',id:'tiny-tick'},
        deviceAlert:{policy:'when_unseen',id:'error-subtle'}
      };
    }
    return {
      masterEnabled:true,
      masterVolume:0.65,
      record:Object.assign({},SOUND_SLOT_DEFAULTS.record),
      voiceWake:Object.assign({},SOUND_SLOT_DEFAULTS.voiceWake),
      keyWake:Object.assign({},SOUND_SLOT_DEFAULTS.keyWake),
      sendSuccess:Object.assign({},SOUND_SLOT_DEFAULTS.sendSuccess),
      sendFail:Object.assign({},SOUND_SLOT_DEFAULTS.sendFail),
      cameraAction:Object.assign({},SOUND_SLOT_DEFAULTS.cameraAction),
      categories:cats,
      recordingMuteEnabled:false,
      recordingMuteStrength:'balanced'
    };
  }

  function normalizeMasterVolume(raw){
    var n=Number(raw);
    if(!isFinite(n)) return 0.65;
    if(n<0) return 0;
    if(n>1) return 1;
    return Math.round(n*100)/100;
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
    // Do NOT force masterEnabled=true — user total mute must stick.
    if(state().config.sounds.masterVolume===undefined) state().config.sounds.masterVolume=0.65;
    state().config.sounds.masterVolume=normalizeMasterVolume(state().config.sounds.masterVolume);
    if(state().config.sounds.recordingMuteEnabled===undefined) state().config.sounds.recordingMuteEnabled=false;
    state().config.sounds.recordingMuteStrength=normalizeRecordingMuteStrength(state().config.sounds.recordingMuteStrength);
    if(global.OneToneSoundBus&&global.OneToneSoundBus.ensureCategoriesConfig){
      global.OneToneSoundBus.ensureCategoriesConfig(state().config.sounds);
    }
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
    var soundsCfg=ensureSoundsConfig();
    if(!ignoreMaster&&!soundsCfg.masterEnabled) return;
    var vol=normalizeMasterVolume(soundsCfg.masterVolume);
    var src='sounds/'+fileId+'.wav';
    var audio=soundAudioCache[src];
    if(!audio){
      audio=new Audio(src);
      soundAudioCache[src]=audio;
    }
    audio.volume=vol;
    try{ audio.pause(); }catch(_){}
    try{ audio.currentTime=0; }catch(_){}
    audio.play().catch(function(){});
  }

  function setTheme(next){
    theme=next==='dark'?'dark':'light';
    applyTheme();
  }

  function syncBrandLogos(){
    var fav=document.querySelector('link[rel="icon"]');
    if(fav) fav.setAttribute('href',theme==='dark'?'icon-dark.png':'icon-light.png');
  }

  function applyTheme(){
    document.documentElement.setAttribute('data-theme',theme);
    document.querySelectorAll('[data-theme-pick]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-theme-pick')===theme);
    });
    document.querySelectorAll('[data-style-pick]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-style-pick')===theme);
    });
    syncBrandLogos();
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

  var soundPickerDocBound=false;
  function positionSoundPickerMenu(picker){
    var btn=picker.querySelector('.sound-slot-picker-btn');
    var menu=picker.querySelector('.sound-slot-picker-menu');
    if(!btn||!menu) return;
    var rect=btn.getBoundingClientRect();
    var width=Math.max(rect.width,140);
    var left=rect.left;
    var top=rect.bottom+6;
    var maxH=Math.min(260,Math.max(120,window.innerHeight-top-12));
    if(left+width>window.innerWidth-8) left=Math.max(8,window.innerWidth-width-8);
    if(top+120>window.innerHeight-8){
      top=Math.max(8,rect.top-6-Math.min(maxH,220));
    }
    menu.style.position='fixed';
    menu.style.left=Math.round(left)+'px';
    menu.style.top=Math.round(top)+'px';
    menu.style.width=Math.round(width)+'px';
    menu.style.right='auto';
    menu.style.maxHeight=Math.round(maxH)+'px';
    menu.style.zIndex='80';
  }

  function clearSoundPickerMenuPosition(menu){
    if(!menu) return;
    menu.style.position='';
    menu.style.left='';
    menu.style.top='';
    menu.style.width='';
    menu.style.right='';
    menu.style.maxHeight='';
    menu.style.zIndex='';
  }

  function closeSoundPickers(except){
    document.querySelectorAll('.sound-slot-picker.is-open').forEach(function(picker){
      if(except&&picker===except) return;
      picker.classList.remove('is-open');
      var btn=picker.querySelector('.sound-slot-picker-btn');
      var menu=picker.querySelector('.sound-slot-picker-menu');
      if(btn) btn.setAttribute('aria-expanded','false');
      if(menu){
        menu.hidden=true;
        clearSoundPickerMenuPosition(menu);
      }
    });
  }

  function bindSoundPickerDoc(){
    if(soundPickerDocBound) return;
    soundPickerDocBound=true;
    document.addEventListener('click',function(){ closeSoundPickers(); });
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape') closeSoundPickers();
    });
  }

  function rebuildSoundPickerMenu(picker,select){
    var menu=picker.querySelector('.sound-slot-picker-menu');
    if(!menu) return;
    menu.textContent='';
    SOUND_CATALOG.forEach(function(item){
      var selected=select.value===item.id;
      var opt=document.createElement('button');
      opt.type='button';
      opt.className='sound-slot-picker-option'+(selected?' is-selected':'');
      opt.setAttribute('role','option');
      opt.setAttribute('aria-selected',selected?'true':'false');
      opt.setAttribute('data-sound-id',item.id);
      var dot=document.createElement('span');
      dot.className='sound-slot-picker-option-dot';
      dot.setAttribute('aria-hidden','true');
      dot.textContent=selected?'●':'○';
      var name=document.createElement('span');
      name.className='sound-slot-picker-option-name';
      name.textContent=soundLabel(item.id);
      opt.appendChild(dot);
      opt.appendChild(name);
      menu.appendChild(opt);
    });
  }

  function syncSoundPickerLabel(picker,select){
    var label=picker.querySelector('.sound-slot-picker-label');
    var btn=picker.querySelector('.sound-slot-picker-btn');
    if(label) label.textContent=soundLabel(select.value)||select.value||'—';
    if(btn){
      btn.disabled=!!select.disabled;
      var labelledBy=select.getAttribute('aria-labelledby');
      if(labelledBy) btn.setAttribute('aria-labelledby',labelledBy);
      var ariaLabel=select.getAttribute('aria-label');
      if(ariaLabel) btn.setAttribute('aria-label',ariaLabel);
    }
    picker.classList.toggle('is-disabled',!!select.disabled);
  }

  function ensureSoundPicker(select){
    if(!select) return null;
    bindSoundPickerDoc();
    var existing=select.closest('.sound-slot-picker');
    if(existing){
      select.classList.add('is-native-hidden');
      select.classList.add('sr-only');
      syncSoundPickerLabel(existing,select);
      if(existing.classList.contains('is-open')) rebuildSoundPickerMenu(existing,select);
      return existing;
    }
    var wrap=document.createElement('div');
    wrap.className='sound-slot-picker';
    select.parentNode.insertBefore(wrap,select);
    wrap.appendChild(select);
    select.classList.add('is-native-hidden');
    select.classList.add('sr-only');
    select.setAttribute('tabindex','-1');
    select.setAttribute('aria-hidden','true');

    var btn=document.createElement('button');
    btn.type='button';
    btn.className='sound-slot-picker-btn';
    btn.setAttribute('aria-haspopup','listbox');
    btn.setAttribute('aria-expanded','false');
    var label=document.createElement('span');
    label.className='sound-slot-picker-label';
    var chev=document.createElement('span');
    chev.className='sound-slot-picker-chevron';
    chev.setAttribute('aria-hidden','true');
    chev.textContent='▼';
    btn.appendChild(label);
    btn.appendChild(chev);

    var menu=document.createElement('div');
    menu.className='sound-slot-picker-menu';
    menu.setAttribute('role','listbox');
    menu.hidden=true;

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    syncSoundPickerLabel(wrap,select);

    btn.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      if(select.disabled) return;
      var open=wrap.classList.contains('is-open');
      closeSoundPickers();
      if(open) return;
      rebuildSoundPickerMenu(wrap,select);
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded','true');
      menu.hidden=false;
      positionSoundPickerMenu(wrap);
    });

    menu.addEventListener('click',function(e){
      var item=e.target&&e.target.closest?e.target.closest('[data-sound-id]'):null;
      if(!item) return;
      e.preventDefault();
      e.stopPropagation();
      var id=item.getAttribute('data-sound-id');
      if(!id||select.value===id){
        closeSoundPickers();
        return;
      }
      select.value=id;
      try{
        select.dispatchEvent(new Event('change',{bubbles:true}));
      }catch(_){
        var ev=document.createEvent('HTMLEvents');
        ev.initEvent('change',true,false);
        select.dispatchEvent(ev);
      }
      closeSoundPickers();
    });

    return wrap;
  }

  function syncSoundPicker(select){
    ensureSoundPicker(select);
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

  function soundPickerPanelActive(){
    try{
      var ui=global.OneToneState&&global.OneToneState.ui;
      if(!ui||!ui.drawerOpen) return false;
      var p=String(ui.settingsPanel||'');
      return p==='sounds'||p==='keys'||p==='camera';
    }catch(_){
      return false;
    }
  }

  function syncSoundsSettingsUi(opts){
    opts=opts||{};
    var buildPickers=opts.buildPickers===true||(opts.buildPickers!==false&&soundPickerPanelActive());
    var sounds=ensureSoundsConfig();
    var masterBtn=$('btnSoundsMaster');
    if(masterBtn){
      masterBtn.classList.toggle('is-on',!!sounds.masterEnabled);
      masterBtn.setAttribute('aria-checked',sounds.masterEnabled?'true':'false');
    }
    var vol=$('soundsMasterVolume');
    if(vol){
      var pct=Math.round(normalizeMasterVolume(sounds.masterVolume)*100);
      // Don't fight the user while dragging the slider.
      if(document.activeElement!==vol) vol.value=String(pct);
      var volLbl=$('soundsMasterVolumeValue');
      if(volLbl) volLbl.textContent=pct+'%';
    }
    SOUND_SLOT_KEYS.forEach(function(key){
      var slot=sounds[key]||SOUND_SLOT_DEFAULTS[key];
      var on=!!slot.enabled;
      var id=slot.id||SOUND_SLOT_DEFAULTS[key].id;
      document.querySelectorAll('.sound-slot-toggle[data-slot="'+key+'"]').forEach(function(toggle){
        toggle.classList.toggle('is-on',on);
        toggle.setAttribute('aria-checked',on?'true':'false');
        toggle.disabled=false;
      });
      if(buildPickers){
        document.querySelectorAll('.sound-slot-select[data-slot="'+key+'"]').forEach(function(select){
          fillSoundSelectOptions(select);
          select.value=id;
          select.disabled=false;
          syncSoundPicker(select);
        });
        // Legacy id-based selects on sounds page (keep in sync if present).
        var legacy=$('soundSelect'+key.charAt(0).toUpperCase()+key.slice(1));
        if(legacy){
          fillSoundSelectOptions(legacy);
          if(!legacy.getAttribute('data-slot')) legacy.setAttribute('data-slot',key);
          legacy.value=id;
          legacy.disabled=false;
          syncSoundPicker(legacy);
        }
      }
      document.querySelectorAll('.sound-slot-preview[data-slot="'+key+'"]').forEach(function(preview){
        preview.disabled=false;
      });
    });
    var catKeys=(global.OneToneSoundBus&&global.OneToneSoundBus.USER_CATEGORY_KEYS)||[];
    catKeys.forEach(function(key){
      var cat=(sounds.categories&&sounds.categories[key])||{};
      var policy=String(cat.policy||'when_unseen');
      var id=cat.id||'tiny-tick';
      document.querySelectorAll('.sound-cat-policy-seg[data-cat="'+key+'"]').forEach(function(seg){
        seg.querySelectorAll('.pref-segmented-btn[data-policy]').forEach(function(btn){
          var on=btn.getAttribute('data-policy')===policy;
          btn.classList.toggle('is-active',on);
          btn.setAttribute('aria-checked',on?'true':'false');
        });
      });
      if(buildPickers){
        document.querySelectorAll('.sound-cat-select[data-cat="'+key+'"]').forEach(function(select){
          fillSoundSelectOptions(select);
          if(select.value!==id) select.value=id;
          var picker=select.closest('.sound-slot-picker');
          if(picker) syncSoundPickerLabel(picker,select);
          else syncSoundPicker(select);
        });
      }
      var toneName=soundLabel(id)||id||'—';
      var tonePrefix=(global.OneToneI18n&&global.OneToneI18n.dict&&global.OneToneI18n.dict().soundChangeTone)||'换音色';
      var toneText=tonePrefix+' · '+toneName;
      document.querySelectorAll('.sound-cat-tone-summary[data-cat="'+key+'"]').forEach(function(sum){
        if(sum.textContent!==toneText) sum.textContent=toneText;
      });
    });
    syncKeyWakeSoundToggle(!!sounds.keyWake.enabled);
    syncRecordingAudioUi();
    syncSoftPadSoundEmbedSummary(sounds);
  }

  function policyLabel(policy,d){
    var p=String(policy||'when_unseen');
    if(p==='never') return d.soundPolicyNever||'从不';
    if(p==='always') return d.soundPolicyAlways||'始终';
    return d.soundPolicyWhenUnseen||'看不见时';
  }

  function syncSoftPadSoundEmbedSummary(soundsOpt){
    var el=$('softPadSoundEmbedSummary');
    if(!el) return;
    var sounds=soundsOpt||ensureSoundsConfig();
    var d=(global.OneToneI18n&&global.OneToneI18n.dict)?global.OneToneI18n.dict():{};
    var cats=(sounds&&sounds.categories)||{};
    var parts=[
      [d.softPadSoundEmbedShortNeed||'处理',(cats.needAttention&&cats.needAttention.policy)||'when_unseen'],
      [d.softPadSoundEmbedShortFail||'失败',(cats.taskFailed&&cats.taskFailed.policy)||'when_unseen'],
      [d.softPadSoundEmbedShortDone||'完成',(cats.taskDone&&cats.taskDone.policy)||'when_unseen']
    ].map(function(pair){
      return pair[0]+'·'+policyLabel(pair[1],d);
    });
    var text=parts.join(' / ');
    if(el.textContent!==text) el.textContent=text;
  }

  function renderSoundSettingsPanel(){
    syncSoundsSettingsUi({buildPickers:true});
    var d=global.OneToneI18n.dict();
    var sp=$('settingsPanelSoundsDesc'); if(sp) sp.textContent=d.settingsPanelSoundsDesc;
    var nav=$('settingsNavSoundsLabel'); if(nav) nav.textContent=d.settingsNavSounds;
    [
      ['soundsMasterLabel',d.soundsMasterLabel||d.soundMasterLabel||'启用音效'],
      ['soundsMasterHelp',d.soundsMasterHelp||'关闭后全部静音。开启后仍可按类别决定「何时」提醒。'],
      ['soundsMasterVolumeLabel',d.soundsMasterVolumeLabel||'音量'],
      ['soundCategoryGroupTitle',d.soundCategoryGroupTitle||'何时提醒'],
      ['soundLegacyFoldTitle',d.soundLegacyFoldTitle||'传统提示（兼容）'],
      ['soundLegacyFoldHint',d.soundLegacyFoldHint||'录制、唤醒、发送等旧槽；一般不必改，需要时再展开。'],
      ['soundCatNeedAttentionTitle',d.soundCatNeedAttentionTitle||'需要处理'],
      ['soundCatNeedAttentionDesc',d.soundCatNeedAttentionDesc||'Agent 等你确认或输入时：默认仅在你看不到相关界面时提醒。'],
      ['soundCatTaskFailedTitle',d.soundCatTaskFailedTitle||'失败'],
      ['soundCatTaskFailedDesc',d.soundCatTaskFailedDesc||'Agent 失败，以及无屏操作失败。'],
      ['soundCatTaskDoneTitle',d.soundCatTaskDoneTitle||'任务完成'],
      ['soundCatTaskDoneDesc',d.soundCatTaskDoneDesc||'Agent 回合完成：默认仅在看不见相关界面时提醒；过短任务不响。'],
      ['soundCatConfirmTitle',d.soundCatConfirmTitle||'交互确认'],
      ['soundCatConfirmDesc',d.soundCatConfirmDesc||'取消语等无屏确认：默认始终提醒。'],
      ['soundCatDeviceAlertTitle',d.soundCatDeviceAlertTitle||'设备异常'],
      ['soundCatDeviceAlertDesc',d.soundCatDeviceAlertDesc||'麦克风丢失、引擎不可用等：默认仅在窗口后台时提醒。'],
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
    document.querySelectorAll('.sound-slot-preview,.sound-cat-preview').forEach(function(btn){
      btn.textContent=d.soundPreview;
    });
    document.querySelectorAll('.sound-cat-policy-seg .pref-segmented-btn[data-policy]').forEach(function(btn){
      var v=String(btn.getAttribute('data-policy')||'');
      if(v==='never') btn.textContent=d.soundPolicyNever||'从不';
      else if(v==='when_unseen') btn.textContent=d.soundPolicyWhenUnseen||'看不见时';
      else if(v==='always') btn.textContent=d.soundPolicyAlways||'始终';
    });
    // Tone summaries refreshed in syncSoundsSettingsUi (换音色 · name).
    SOUND_CATALOG.forEach(function(item){
      document.querySelectorAll('.sound-slot-select option[value="'+item.id+'"],.sound-cat-select option[value="'+item.id+'"]').forEach(function(opt){
        opt.textContent=soundLabel(item.id);
      });
    });
    document.querySelectorAll('.sound-slot-select,.sound-cat-select').forEach(function(select){
      syncSoundPicker(select);
    });
    // Re-apply tone summary after i18n + picker label sync.
    var sounds=ensureSoundsConfig();
    var catKeys=(global.OneToneSoundBus&&global.OneToneSoundBus.USER_CATEGORY_KEYS)||[];
    var tonePrefix=d.soundChangeTone||'换音色';
    catKeys.forEach(function(key){
      var cat=(sounds.categories&&sounds.categories[key])||{};
      var toneName=soundLabel(cat.id||'tiny-tick')||'—';
      document.querySelectorAll('.sound-cat-tone-summary[data-cat="'+key+'"]').forEach(function(sum){
        sum.textContent=tonePrefix+' · '+toneName;
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

  var masterVolumeSaveTimer=0;
  function setMasterVolume(vol){
    ensureSoundsConfig();
    state().config.sounds.masterVolume=normalizeMasterVolume(vol);
    var pct=Math.round(state().config.sounds.masterVolume*100);
    var volLbl=$('soundsMasterVolumeValue');
    if(volLbl) volLbl.textContent=pct+'%';
    if(masterVolumeSaveTimer) clearTimeout(masterVolumeSaveTimer);
    masterVolumeSaveTimer=setTimeout(function(){
      masterVolumeSaveTimer=0;
      hooks().save();
    },180);
  }

  function setSoundCategoryPolicy(catKey,policy){
    ensureSoundsConfig();
    if(global.OneToneSoundBus) global.OneToneSoundBus.ensureCategoriesConfig(state().config.sounds);
    if(!state().config.sounds.categories[catKey]) return;
    var p=String(policy||'').trim().toLowerCase();
    if(p!=='never'&&p!=='when_unseen'&&p!=='always') return;
    state().config.sounds.categories[catKey].policy=p;
    syncSoundsSettingsUi();
    hooks().save();
  }

  function setSoundCategoryId(catKey,id){
    ensureSoundsConfig();
    if(global.OneToneSoundBus) global.OneToneSoundBus.ensureCategoriesConfig(state().config.sounds);
    if(!state().config.sounds.categories[catKey]) return;
    state().config.sounds.categories[catKey].id=String(id||'');
    syncSoundsSettingsUi();
    hooks().save();
  }

  function previewSoundCategory(catKey){
    ensureSoundsConfig();
    if(global.OneToneSoundBus) global.OneToneSoundBus.ensureCategoriesConfig(state().config.sounds);
    var cat=state().config.sounds.categories[catKey];
    if(cat&&cat.id) playSoundFile(cat.id,true);
  }

  function syncKeyWakeSettingsFromConfig(){
    ensureSoundsConfig();
    // Only flip the keyWake toggle — full syncSoundsSettingsUi builds every sound
    // picker on first drawer open and used to 假死 alongside voiceWake paint.
    var sounds=state().config&&state().config.sounds;
    syncKeyWakeSoundToggle(!!(sounds&&sounds.keyWake&&sounds.keyWake.enabled));
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
    playSoundFile:playSoundFile,
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
    setMasterVolume:setMasterVolume,
    setSoundCategoryPolicy:setSoundCategoryPolicy,
    setSoundCategoryId:setSoundCategoryId,
    previewSoundCategory:previewSoundCategory,
    ensureSoundsConfig:ensureSoundsConfig,
    syncSoundsSettingsUi:syncSoundsSettingsUi,
    syncSoftPadSoundEmbedSummary:syncSoftPadSoundEmbedSummary,
    syncKeyWakeSettingsFromConfig:syncKeyWakeSettingsFromConfig
  };
})((typeof window!=='undefined')?window:globalThis);
