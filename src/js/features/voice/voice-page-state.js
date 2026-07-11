(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var STEPS=['wake','recognize','send'];
  var activeStep='wake';
  var stepChangeHook=null;

  function panel(){
    return $('settingsPanelVoiceWake');
  }

  function applyStepToDom(){
    var p=panel();
    if(!p) return;
    p.classList.add('voice-page-v2','voice-page-parallel');
    STEPS.forEach(function(s){
      p.classList.toggle('is-step-'+s,s===activeStep);
    });
    p.querySelectorAll('[data-voice-step]').forEach(function(el){
      el.classList.toggle('is-active-step',el.getAttribute('data-voice-step')===activeStep);
    });
    p.querySelectorAll('[data-voice-subpage="wake"],[data-voice-subpage="recognize"],[data-voice-subpage="send"]').forEach(function(el){
      if(!el.classList.contains('voice-flow-step')) return;
      el.classList.toggle('is-active-step',el.getAttribute('data-voice-subpage')===activeStep);
    });
    if(global.OneToneVoicePageNav&&global.OneToneVoicePageNav.syncActive){
      global.OneToneVoicePageNav.syncActive(activeStep);
    }
  }

  function scrollActiveStepIntoView(opts){
    var p=panel();
    if(!p||!p.classList.contains('voice-page-parallel')) return;
    var card=p.querySelector('.voice-flow-step.is-active-step');
    if(!card||!card.scrollIntoView) return;
    var smooth=!(opts&&opts.smooth===false);
    card.scrollIntoView({behavior:smooth?'smooth':'auto',block:'nearest'});
  }

  function setStep(step,opts){
    step=String(step||'').trim();
    if(STEPS.indexOf(step)<0) step='wake';
    var changed=activeStep!==step;
    activeStep=step;
    applyStepToDom();
    if(changed&&!(opts&&opts.skipScroll)){
      scrollActiveStepIntoView(opts);
    }
    if(typeof stepChangeHook==='function'){
      try{ stepChangeHook(activeStep); }catch(err){ console.error('voice step hook',err); }
    }
  }

  function registerStepHook(fn){
    stepChangeHook=fn;
  }

  function init(){
    applyStepToDom();
  }

  global.OneToneVoicePageState={
    setStep:setStep,
    getStep:function(){ return activeStep; },
    registerStepHook:registerStepHook,
    init:init,
    STEPS:STEPS
  };
})((typeof window!=='undefined')?window:globalThis);
