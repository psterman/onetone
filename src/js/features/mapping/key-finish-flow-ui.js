(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_key_finish_flow_ui_hooks__ || {}; }
  function finishApi(){ return global.OneToneKeyFinishFlowRender || null; }

  function finishClickHandler(){
    var h=hooks();
    var api=finishApi();
    return (h&&h.handleKeyFinishFlowClick)||(api&&api.handleKeyFinishFlowClick);
  }

  function finishInputHandler(){
    var h=hooks();
    var api=finishApi();
    return (h&&h.handleKeyFinishFlowInput)||(api&&api.handleKeyFinishFlowInput);
  }

  function isFinishControlTarget(el){
    return !!(el&&el.closest&&el.closest('[data-finish-mode],[data-timing-toggle],[data-trigger-mode],[data-keys-hold-switch]'));
  }

  function bindPanelFallback(panel){
    if(!panel||panel.dataset.keyFinishPanelBound==='1') return;
    panel.dataset.keyFinishPanelBound='1';
    panel.addEventListener('click',function(e){
      if(e.__vpKeysPanelHandled||!isFinishControlTarget(e.target)) return;
      var handler=finishClickHandler();
      if(handler&&handler(e)){
        e.__vpKeysPanelHandled=true;
        e.preventDefault();
        e.stopPropagation();
      }
    },true);
    function onInput(e){
      if(e.__vpKeysPanelHandled) return;
      var range=e.target&&e.target.closest&&e.target.closest('[data-timing-range]');
      if(!range) return;
      var handler=finishInputHandler();
      if(handler){
        e.__vpKeysPanelHandled=true;
        handler(e);
      }
    }
    panel.addEventListener('input',onInput,true);
    panel.addEventListener('change',onInput,true);
  }

  function bindEvents(){
    bindPanelFallback($('settingsPanelKeys'));
    bindPanelFallback($('keysCapturePopover'));
  }
  global.OneToneKeyFinishFlowUi={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
