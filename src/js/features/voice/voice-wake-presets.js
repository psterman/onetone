(function(global){
  'use strict';

  var SAPI_ROOT='#voiceSapiPresets';
  var VOSK_CN='#voiceVoskPresetsCn';
  var VOSK_EN='#voiceVoskPresetsEn';

  function phraseCustom(){
    return global.OneToneVoicePhraseCustom;
  }

  function presetPhrasesIn(sel){
    var pc=phraseCustom();
    return pc&&pc.presetPhrasesIn?pc.presetPhrasesIn(sel):[];
  }

  function selectedPhrasesIn(sel){
    var pc=phraseCustom();
    return pc&&pc.selectedPhrasesIn?pc.selectedPhrasesIn(sel):[];
  }

  function wakeLang(){
    return global.__vp_voice_wake_lang__||'zh';
  }

  function getExpandedMode(){
    var wake=global.OneToneVoiceWake;
    if(wake&&wake.getExpandedMode){
      var expanded=wake.getExpandedMode();
      if(expanded==='vosk'||expanded==='sapi') return expanded;
    }
    var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
    if(eng==='vosk') return 'vosk';
    if(eng==='sapi') return 'sapi';
    return (global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi())?'vosk':'sapi';
  }

  function getActiveVoskPresetRoots(lang){
    lang=lang||wakeLang();
    var wake=global.OneToneVoiceWake;
    if(wake&&wake.currentVoskPreset&&wake.isEnglishVoskPreset){
      var preset=wake.currentVoskPreset();
      if(wake.isEnglishVoskPreset(preset)) return [VOSK_EN];
      if(lang==='en') return [VOSK_EN];
      return [VOSK_CN];
    }
    return lang==='en'?[VOSK_EN]:[VOSK_CN];
  }

  function getPresetRoots(mode,lang){
    mode=mode||getExpandedMode();
    if(mode==='vosk') return getActiveVoskPresetRoots(lang);
    return [SAPI_ROOT];
  }

  function queryPresetButtons(mode,lang){
    var out=[];
    getPresetRoots(mode,lang).forEach(function(sel){
      document.querySelectorAll(sel+' [data-phrase]').forEach(function(btn){ out.push(btn); });
    });
    return out;
  }

  function getSelectedPhrases(mode,lang){
    mode=mode||getExpandedMode();
    if(mode==='vosk'){
      return selectedPhrasesIn(VOSK_CN).concat(selectedPhrasesIn(VOSK_EN));
    }
    return selectedPhrasesIn(SAPI_ROOT);
  }

  function firstSelectedPhrase(mode,lang){
    mode=mode||getExpandedMode();
    lang=lang||wakeLang();
    if(mode==='vosk'){
      var root=lang==='en'?VOSK_EN:VOSK_CN;
      var selected=selectedPhrasesIn(root);
      if(selected.length) return selected[0];
      var fallback=presetPhrasesIn(root);
      return fallback.length?fallback[0]:'';
    }
    var sapiSelected=selectedPhrasesIn(SAPI_ROOT);
    if(sapiSelected.length) return sapiSelected[0];
    var sapiFallback=presetPhrasesIn(SAPI_ROOT);
    return sapiFallback.length?sapiFallback[0]:'';
  }

  function syncSelected(phrases,mode){
    var selected=(Array.isArray(phrases)?phrases:[]).map(function(x){ return String(x||'').trim(); });
    queryPresetButtons(mode).forEach(function(btn){
      var phrase=btn.getAttribute('data-phrase')||'';
      btn.classList.toggle('is-selected',selected.indexOf(phrase)>=0);
    });
  }

  function bindPresetClicks(handler){
    if(typeof handler!=='function') return;
    var host=global.OneToneDom.$('voiceSettingsWakeHost');
    if(!host||host.dataset.wakePresetsBound==='1') return;
    host.dataset.wakePresetsBound='1';
    host.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('.voice-sapi-preset[data-phrase]');
      if(!btn) return;
      e.stopPropagation();
      handler(e,btn);
    });
  }

  global.OneToneVoiceWakePresets={
    SAPI_ROOT:SAPI_ROOT,
    VOSK_CN:VOSK_CN,
    VOSK_EN:VOSK_EN,
    getExpandedMode:getExpandedMode,
    getPresetRoots:getPresetRoots,
    getActiveVoskPresetRoots:getActiveVoskPresetRoots,
    queryPresetButtons:queryPresetButtons,
    getSelectedPhrases:getSelectedPhrases,
    firstSelectedPhrase:firstSelectedPhrase,
    syncSelected:syncSelected,
    presetPhrasesIn:presetPhrasesIn,
    selectedPhrasesIn:selectedPhrasesIn,
    bindPresetClicks:bindPresetClicks
  };
})((typeof window!=='undefined')?window:globalThis);
