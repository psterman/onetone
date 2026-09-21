(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var STEPS=['trigger','target'];
  var activeStep='target';

  function panel(){
    return $('settingsPanelKeys');
  }

  function normalizeStep(step){
    step=String(step||'').trim();
    if(step==='cancel'){
      return {step:'target',openCapture:'key',expandFinishMore:true,highlightCancel:true};
    }
    if(step==='finish'){
      return {step:'target',openCapture:'key'};
    }
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
    // Ensure three-col body class survives any remount/class sync.
    var body=p.querySelector('.keys-page-body');
    if(body) body.classList.add('keys-page-body--three-col');
    STEPS.forEach(function(s){
      p.classList.toggle('is-step-'+s,s===step);
    });
    p.classList.remove('is-step-finish');
    // Three-col desk: trigger rail + target detail stay visible together.
    p.querySelectorAll('[data-edit-step="trigger"],[data-edit-step="target"]').forEach(function(el){
      if(!el.classList.contains('habit-flow-step')) return;
      el.classList.add('is-active-step');
    });
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.syncActive){
      global.OneToneKeysPageNav.syncActive(step);
    }
  }

  function scrollActiveStepIntoView(opts){
    var smooth=!(opts&&opts.smooth===false);
    var behavior=smooth?'smooth':'auto';
    // Flow nodes are hidden in three-col desk — scroll the detail desk instead.
    var desk=$('keysDeskPanel');
    if(desk&&desk.scrollIntoView){
      desk.scrollIntoView({behavior:behavior,block:'nearest'});
      return;
    }
    var rail=$('keysPageRail');
    if(rail&&rail.scrollIntoView){
      rail.scrollIntoView({behavior:behavior,block:'nearest'});
    }
  }

  function setStep(step,opts){
    opts=opts||{};
    var meta=normalizeStep(step);
    step=meta.step;
    var changed=activeStep!==step;
    activeStep=step;
    applyStepToDom(step);
    if(meta.expandFinishMore||meta.highlightCancel||(opts&&opts.expandFinishMore)){
      applyCancelSideEffects({
        expandFinishMore:!!(meta.expandFinishMore||(opts&&opts.expandFinishMore)),
        highlightCancel:!!meta.highlightCancel
      });
    }
    if(changed&&!(opts&&opts.skipScroll)){
      scrollActiveStepIntoView(opts);
    }
    if(changed&&global.OneToneAgentCapabilityUi&&global.OneToneAgentCapabilityUi.mountKeys){
      try{ global.OneToneAgentCapabilityUi.mountKeys(); }catch(_){}
    }
    if(changed&&global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.onStepChange){
      try{ global.OneToneKeysChannelCommandPicker.onStepChange(step); }catch(_){}
    }
    var capUi=global.OneToneAgentCapabilityUi;
    if(capUi&&capUi.applyCodexStepChrome&&capUi.isCodexKeysEditing&&capUi.isCodexKeysEditing()){
      var core=global.OneToneMappingCore;
      var m=core&&core.selected?core.selected():null;
      try{ capUi.applyCodexStepChrome(step,m); }catch(_){}
    }
    if(!(opts&&opts.skipSheet)&&meta.openCapture){
      var picker=global.OneToneKeysChannelCommandPicker;
      if(picker&&(picker.openCapturePopover||picker.openCaptureSheet)){
        try{
          var openFn=picker.openCapturePopover||picker.openCaptureSheet;
          openFn.call(picker,{
            tab:meta.openCapture,
            expandFinishMore:!!meta.expandFinishMore,
            skipStep:true,
            returnPanel:opts.returnPanel
          });
        }catch(_){}
      }
    }
  }

  function init(){
    applyStepToDom(activeStep);
    if(global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.onStepChange){
      try{ global.OneToneKeysChannelCommandPicker.onStepChange(activeStep); }catch(_){}
    }
  }

  global.OneToneKeysPageState={
    setStep:setStep,
    getStep:function(){ return activeStep; },
    init:init,
    STEPS:STEPS,
    normalizeStep:normalizeStep
  };
})((typeof window!=='undefined')?window:globalThis);
