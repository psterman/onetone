(function(global){
  'use strict';

  var SAPI_ROOT='#voiceSapiPresets';
  var VOSK_CN='#voiceVoskPresetsCn';
  var VOSK_EN='#voiceVoskPresetsEn';

  function presetPhrasesIn(sel){
    var pc=global.OneToneVoicePhraseCustom;
    return pc&&pc.presetPhrasesIn?pc.presetPhrasesIn(sel):[];
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
    return 'sapi';
  }

  function getActiveVoskPresetRoots(){
    var wake=global.OneToneVoiceWake;
    if(wake&&wake.currentVoskPreset&&wake.isEnglishVoskPreset){
      var preset=wake.currentVoskPreset();
      return [wake.isEnglishVoskPreset(preset)?VOSK_EN:VOSK_CN];
    }
    return [VOSK_CN];
  }

  function getPresetRoots(mode){
    mode=mode||getExpandedMode();
    if(mode==='vosk') return getActiveVoskPresetRoots();
    return [SAPI_ROOT];
  }

  function queryPresetButtons(mode){
    var out=[];
    getPresetRoots(mode).forEach(function(sel){
      document.querySelectorAll(sel+' [data-phrase]').forEach(function(btn){ out.push(btn); });
    });
    return out;
  }

  function getSelectedPhrases(mode){
    mode=mode||getExpandedMode();
    if(mode==='vosk'){
      return presetPhrasesIn(VOSK_CN).concat(presetPhrasesIn(VOSK_EN));
    }
    return presetPhrasesIn(SAPI_ROOT);
  }

  function firstSelectedPhrase(mode){
    var phrases=getSelectedPhrases(mode);
    return phrases.length?phrases[0]:'';
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
    bindPresetClicks:bindPresetClicks
  };
})((typeof window!=='undefined')?window:globalThis);
