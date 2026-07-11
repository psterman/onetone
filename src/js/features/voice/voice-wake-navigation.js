(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var wakeEditLegacyWarned=false;

  function openDetails(id){
    var el=$(id);
    if(el&&el.tagName==='DETAILS') el.open=true;
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

  function openMicPicker(opts){
    opts=opts||{};
    ensureWakeStep();
    var micCard=$('voiceWakeMicCard')||$('voiceMicPickerDetails');
    if(micCard) scrollToEl(micCard,opts.block||'nearest');
  }

  function expandForEditMode(mode){
    mode=String(mode||'').trim();
    var map={
      input:['voiceRecognizeEngineDetails'],
      phrases:['voiceWakeMicCard','voiceMicPickerDetails'],
      finish:['voiceRecognizeEndDetails']
    };
    if(mode==='phrases'){
      openLegacyWakeEditDetails();
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
      else if(legacyWakeEditDetails()) ids.push('voiceWakeEditDetails');
      return ids;
    }
    if(focus==='mic'){
      return ['voiceWakeMicCard','micDeviceList','micTitle'];
    }
    return [];
  }

  global.OneToneVoiceWakeNavigation={
    openPresetsEditor:openPresetsEditor,
    openMicPicker:openMicPicker,
    expandForEditMode:expandForEditMode,
    resolveFocusTargets:resolveFocusTargets
  };
})((typeof window!=='undefined')?window:globalThis);
