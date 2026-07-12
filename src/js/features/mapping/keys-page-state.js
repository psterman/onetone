(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var STEPS=['trigger','target','finish'];
  var activeStep='trigger';

  function panel(){
    return $('settingsPanelKeys');
  }

  function normalizeStep(step){
    step=String(step||'').trim();
    if(step==='cancel') return {step:'finish',expandFinishMore:true,highlightCancel:true};
    if(STEPS.indexOf(step)>=0) return {step:step};
    return {step:'trigger'};
  }

  function applyCancelSideEffects(meta){
    if(!meta) return;
    if(meta.expandFinishMore){
      var more=$('habitFlowFinishMore');
      if(more) more.open=true;
    }
    if(meta.highlightCancel&&global.OneToneHabitKeyMappingTable&&global.OneToneHabitKeyMappingTable.highlightRow){
      global.OneToneHabitKeyMappingTable.highlightRow('cancel');
    }
  }

  function applyStepToDom(step){
    var p=panel();
    if(!p) return;
    p.classList.add('keys-page-desk');
    STEPS.forEach(function(s){
      p.classList.toggle('is-step-'+s,s===step);
    });
    p.querySelectorAll('[data-edit-step="trigger"],[data-edit-step="target"],[data-edit-step="finish"]').forEach(function(el){
      if(!el.classList.contains('habit-flow-step')) return;
      el.classList.toggle('is-active-step',el.getAttribute('data-edit-step')===step);
    });
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.syncActive){
      global.OneToneKeysPageNav.syncActive(step);
    }
  }

  function scrollActiveStepIntoView(opts){
    var smooth=!(opts&&opts.smooth===false);
    var behavior=smooth?'smooth':'auto';
    var nodes=$('keysFlowNodes');
    if(nodes&&nodes.scrollIntoView){
      nodes.scrollIntoView({behavior:behavior,block:'nearest'});
    }
    var desk=$('keysDeskPanel');
    if(desk&&desk.scrollIntoView){
      desk.scrollIntoView({behavior:behavior,block:'nearest'});
      return;
    }
    var p=panel();
    if(!p) return;
    var card=p.querySelector('.habit-flow-step.is-active-step');
    if(!card||!card.scrollIntoView) return;
    card.scrollIntoView({behavior:behavior,block:'nearest'});
  }

  function setStep(step,opts){
    var meta=normalizeStep(step);
    step=meta.step;
    var changed=activeStep!==step;
    activeStep=step;
    applyStepToDom(step);
    if(meta.expandFinishMore||meta.highlightCancel){
      applyCancelSideEffects(meta);
    }else if(step==='finish'&&opts&&opts.expandFinishMore){
      applyCancelSideEffects({expandFinishMore:true});
    }
    if(changed&&!(opts&&opts.skipScroll)){
      scrollActiveStepIntoView(opts);
    }
  }

  function init(){
    applyStepToDom(activeStep);
  }

  global.OneToneKeysPageState={
    setStep:setStep,
    getStep:function(){ return activeStep; },
    init:init,
    STEPS:STEPS,
    normalizeStep:normalizeStep
  };
})((typeof window!=='undefined')?window:globalThis);
