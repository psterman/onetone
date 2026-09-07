(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var STEPS=['wake','finish'];
  var activeStep='wake';
  var stepChangeHook=null;

  function panel(){
    return $('settingsPanelVoiceWake');
  }

  function normalizeStep(step){
    step=String(step||'').trim();
    if(step==='recognize'||step==='send') return 'finish';
    if(STEPS.indexOf(step)<0) return 'wake';
    return step;
  }

  function expandStepDetails(step){
    var map={
      wake:[],
      finish:[]
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
    ['wake','finish','recognize','send'].forEach(function(s){
      p.classList.toggle('is-step-'+s,s===activeStep||(activeStep==='finish'&&(s==='recognize'||s==='send')));
    });
    p.querySelectorAll('[data-voice-step]').forEach(function(el){
      el.classList.toggle('is-active-step',el.getAttribute('data-voice-step')===activeStep);
    });
    p.querySelectorAll('[data-voice-subpage="wake"],[data-voice-subpage="finish"],[data-voice-subpage="recognize"],[data-voice-subpage="send"]').forEach(function(el){
      if(!el.classList.contains('voice-flow-step')) return;
      var sub=el.getAttribute('data-voice-subpage');
      var on=sub===activeStep||(activeStep==='finish'&&(sub==='recognize'||sub==='send'||sub==='finish'));
      el.classList.toggle('is-active-step',on);
    });
    expandStepDetails(activeStep);
    var adv=$('voiceCoreAdvanced');
    /* Q42 finish = outcomes only; keep engine advanced closed (wake already CSS-hides it). */
    if(adv) adv.open=false;
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
    step=normalizeStep(step);
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

  function getStep(){ return activeStep; }

  function registerStepHook(fn){ stepChangeHook=typeof fn==='function'?fn:null; }

  function init(){ applyStepToDom(); }

  global.OneToneVoicePageState={
    STEPS:STEPS,
    setStep:setStep,
    getStep:getStep,
    applyStepToDom:applyStepToDom,
    registerStepHook:registerStepHook,
    init:init,
    normalizeStep:normalizeStep
  };
})((typeof window!=='undefined')?window:globalThis);
