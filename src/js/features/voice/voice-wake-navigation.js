(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var wakeEditLegacyWarned=false;

  function openDetails(id){
    var el=$(id);
    if(el&&el.tagName==='DETAILS') el.open=true;
    var adv=$('voiceCoreAdvanced');
    if(adv&&(id==='voiceRecognizeEngineDetails'||id==='voiceRecognizeResourcesDetails'||id==='voiceModePanel'||(el&&adv.contains(el)))){
      adv.open=true;
    }
    return el;
  }

  function scrollToEl(el,block){
    if(el&&el.scrollIntoView) el.scrollIntoView({behavior:'smooth',block:block||'start'});
  }

  function ensureWakeStep(){
    if(global.OneToneVoicePageState){
      var cur=global.OneToneVoicePageState.getStep();
      if(cur!=='wake') global.OneToneVoicePageState.setStep('wake');
    }
  }

  function legacyWakeEditDetails(){
    return $('voiceWakeEditDetails');
  }

  function presetsPanel(){
    return $('voiceWakePresetsPanel')||$('voiceSettingsWakeHost');
  }

  function openLegacyWakeEditDetails(){
    var legacy=legacyWakeEditDetails();
    if(legacy){
      legacy.open=true;
      return true;
    }
    if(!wakeEditLegacyWarned&&global.console&&console.warn){
      wakeEditLegacyWarned=true;
      console.warn('[voice-wake-navigation] voiceWakeEditDetails removed; presets are always visible');
    }
    return false;
  }

  function openPresetsEditor(opts){
    opts=opts||{};
    ensureWakeStep();
    if(!openLegacyWakeEditDetails()){
      if(!opts.skipScroll){
        var panel=presetsPanel();
        if(panel) scrollToEl(panel,opts.block||'start');
        else scrollToEl($('voiceSettingsWakeCard'),'start');
      }
    }else if(!opts.skipScroll){
      scrollToEl($('voiceSettingsWakeCard'),'start');
    }
  }

  function syncMicPickerUi(open){
    var panel=$('voiceLiveMicPicker');
    var rail=$('voiceFeedbackRail');
    var toggle=$('btnVoiceLiveMicToggle');
    if(panel) panel.hidden=!open;
    if(rail) rail.classList.toggle('is-mic-picker-open',open);
    if(toggle) toggle.setAttribute('aria-expanded',open?'true':'false');
  }

  function loadMicDevicesIfNeeded(){
    var mic=global.OneToneAppMic;
    if(mic&&mic.loadMicDevices){
      mic.loadMicDevices().catch(function(err){
        console.error('voice mic picker load',err);
      });
    }
  }

  function setMicPickerOpen(open,opts){
    opts=opts||{};
    open=!!open;
    var panel=$('voiceLiveMicPicker');
    if(!panel) return false;
    syncMicPickerUi(open);
    if(open){
      loadMicDevicesIfNeeded();
      if(!opts.skipScroll){
        var rail=$('voiceFeedbackRail');
        if(rail) scrollToEl(rail,opts.block||'nearest');
      }
    }
    return true;
  }

  function toggleMicPicker(){
    var panel=$('voiceLiveMicPicker');
    setMicPickerOpen(!!(panel&&panel.hidden));
  }

  function openMicPicker(opts){
    opts=opts||{};
    if(setMicPickerOpen(true,opts)) return;
    var micCard=$('voiceWakeMicCard')||$('voiceMicPickerDetails');
    if(micCard) scrollToEl(micCard,opts.block||'nearest');
  }

  function closeMicPicker(){
    setMicPickerOpen(false,{skipScroll:true});
  }

  function expandForEditMode(mode){
    mode=String(mode||'').trim();
    var map={
      input:['voiceRecognizeEngineDetails'],
      phrases:['voiceWakeCustomDetails'],
      finish:['voiceRecognizeEndDetails']
    };
    if(mode==='phrases'){
      openLegacyWakeEditDetails();
      openDetails('voiceWakeCustomDetails');
    }
    (map[mode]||[]).forEach(function(id){ openDetails(id); });
    if(mode==='input') openDetails('voiceRecognizeEngineDetails');
    if(mode==='finish') openDetails('voiceRecognizeEndDetails');
  }

  function resolveFocusTargets(focus){
    focus=String(focus||'').trim();
    if(focus==='wakePhrases'){
      var ids=['voiceSettingsWakeCard'];
      if($('voiceWakePresetsPanel')) ids.push('voiceWakePresetsPanel');
      if($('voiceWakeCustomDetails')) ids.push('voiceWakeCustomDetails');
      else if(legacyWakeEditDetails()) ids.push('voiceWakeEditDetails');
      return ids;
    }
    if(focus==='mic'){
      return ['voiceFeedbackRail','voiceLiveMicPicker','micDeviceList','micTitle'];
    }
    return [];
  }

  global.OneToneVoiceWakeNavigation={
    openPresetsEditor:openPresetsEditor,
    openMicPicker:openMicPicker,
    toggleMicPicker:toggleMicPicker,
    closeMicPicker:closeMicPicker,
    expandForEditMode:expandForEditMode,
    resolveFocusTargets:resolveFocusTargets
  };
})((typeof window!=='undefined')?window:globalThis);
