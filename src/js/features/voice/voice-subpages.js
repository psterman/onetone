(function(global){
  'use strict';

  var LEGACY_TO_STEP={
    input:'recognize',
    phrases:'wake',
    finish:'send',
    mic:'wake',
    wake:'wake',
    end:'send',
    output:'send',
    recognize:'recognize',
    send:'send'
  };

  function normalize(page){
    page=String(page||'').trim();
    if(page==='models') return 'resources';
    if(page==='overview') return 'wake';
    if(page==='test') return 'wake';
    if(LEGACY_TO_STEP[page]) return LEGACY_TO_STEP[page];
    if(page==='resources') return 'resources';
    return 'wake';
  }

  function scrollTarget(step){
    var ids={wake:'voiceSettingsWakeCard',recognize:'voiceSettingsEndPhraseCard',send:'voiceSettingsAutoCard'};
    var el=global.OneToneDom.$(ids[step]);
    if(el) el.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function setPage(page,opts){
    opts=opts||{};
    page=normalize(page);
    if(page==='resources'){
      if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.setPanel){
        global.OneToneSettingsDrawer.setPanel('models');
      }
      return;
    }
    if(global.OneToneState&&global.OneToneState.ui&&global.OneToneState.ui.settingsPanel!=='voiceWake'){
      if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.setPanel){
        global.OneToneSettingsDrawer.setPanel('voiceWake');
      }
    }
    if(global.OneToneVoicePageState){
      global.OneToneVoicePageState.setStep(page);
    }
    if(opts.scrollIntoView) scrollTarget(page);
  }

  function syncFromEditMode(mode){
    var page=LEGACY_TO_STEP[mode]||'wake';
    if(global.OneToneVoicePageState){
      global.OneToneVoicePageState.setStep(page);
    }
  }

  function getPage(){
    return global.OneToneVoicePageState?global.OneToneVoicePageState.getStep():'wake';
  }

  function bindEvents(){
    if(global.OneToneVoicePageNav&&global.OneToneVoicePageNav.bind){
      global.OneToneVoicePageNav.bind();
    }
    if(global.OneToneVoicePageState&&global.OneToneVoicePageState.init){
      global.OneToneVoicePageState.init();
    }
  }

  global.OneToneVoiceSubpages={
    bindEvents:bindEvents,
    setPage:setPage,
    syncFromEditMode:syncFromEditMode,
    getPage:getPage
  };
  global.__vp_setVoiceSubpage__=setPage;
})((typeof window!=='undefined')?window:globalThis);
