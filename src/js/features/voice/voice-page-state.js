(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var STEPS=['wake','recognize','send'];
  var activeStep='wake';

  function panel(){
    return $('settingsPanelVoiceWake');
  }

  function applyStepToDom(){
    var p=panel();
    if(!p) return;
    p.classList.add('voice-page-v2');
    STEPS.forEach(function(s){
      p.classList.toggle('is-step-'+s,s===activeStep);
    });
    p.querySelectorAll('[data-voice-step]').forEach(function(el){
      el.classList.toggle('is-active-step',el.getAttribute('data-voice-step')===activeStep);
    });
    p.querySelectorAll('[data-voice-subpage="wake"],[data-voice-subpage="recognize"],[data-voice-subpage="send"]').forEach(function(el){
      if(el.closest('#voiceSubtabBar')) return;
      el.classList.toggle('is-active-step',el.getAttribute('data-voice-subpage')===activeStep);
    });
    if(global.OneToneVoicePageNav&&global.OneToneVoicePageNav.syncActive){
      global.OneToneVoicePageNav.syncActive(activeStep);
    }
  }

  function setStep(step){
    step=String(step||'').trim();
    if(STEPS.indexOf(step)<0) step='wake';
    activeStep=step;
    applyStepToDom();
  }

  function init(){
    applyStepToDom();
  }

  global.OneToneVoicePageState={
    setStep:setStep,
    getStep:function(){ return activeStep; },
    init:init,
    STEPS:STEPS
  };
})((typeof window!=='undefined')?window:globalThis);
