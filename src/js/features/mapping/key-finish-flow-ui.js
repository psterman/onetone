(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_key_finish_flow_ui_hooks__ || {}; }
  function bindEvents(){
    var h=hooks();
    var settingsPanelKeyWake=$('settingsPanelKeyWake');
    if(settingsPanelKeyWake){
      settingsPanelKeyWake.addEventListener('input',h.handleKeyFinishFlowInput);
      settingsPanelKeyWake.addEventListener('click',function(e){
        var el=e.target;
        var stepEl=el.closest&&el.closest('.key-scheme-step[data-step]');
        if(stepEl&&!el.closest('[data-trigger-mode]')&&!el.closest('[data-timing-toggle]')&&!el.closest('.toggle-switch')&&!el.closest('.record-btn')){
          h.focusSchemeEditStep(stepEl.dataset.step);
          return;
        }
        if(h.handleKeyFinishFlowClick(e)) e.stopPropagation();
      });
    }
    var keySchemeEnabledToggle=$('keySchemeEnabledToggle');
    if(keySchemeEnabledToggle){
      keySchemeEnabledToggle.onclick=function(e){
        e.stopPropagation();
        var m=h.selectedMapping();
        if(!m||!h.isSavedMapping(m)) return;
        h.setMappingEnabled(m.id,!m.enabled);
      };
    }
  }
  global.OneToneKeyFinishFlowUi={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
