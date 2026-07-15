(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var STEPS=['wake','recognize','send'];
  var activeStep='wake';
  var stepChangeHook=null;

  function panel(){
    return $('settingsPanelVoiceWake');
  }

  function expandStepDetails(step){
    var map={
      wake:[],
      recognize:[],
      send:[]
    };
    (map[step]||[]).forEach(function(id){
      var el=$(id);
      if(el&&el.tagName==='DETAILS') el.open=true;
    });
  }

  function applyStepToDom(){
    var p=panel();
    if(!p) return;
    p.classList.add('voice-page-v2','voice-page-desk');
    p.classList.remove('voice-page-parallel');
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
    expandStepDetails(activeStep);
    if(global.OneToneVoicePageNav&&global.OneToneVoicePageNav.syncActive){
      global.OneToneVoicePageNav.syncActive(activeStep);
    }
  }

  function scrollActiveStepIntoView(opts){
    var p=panel();
    if(!p) return;
    var smooth=!(opts&&opts.smooth===false);
    var behavior=smooth?'smooth':'auto';
    var nodes=$('voiceFlowNodes');
    if(nodes&&nodes.scrollIntoView){
      nodes.scrollIntoView({behavior:behavior,block:'nearest'});
    }
    var desk=$('voiceDeskPanel');
    if(desk&&desk.scrollIntoView){
      desk.scrollIntoView({behavior:behavior,block:'nearest'});
      return;
    }
    var card=p.querySelector('.voice-flow-step.is-active-step');
    if(!card||!card.scrollIntoView) return;
    card.scrollIntoView({behavior:behavior,block:'nearest'});
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
