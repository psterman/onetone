(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };

  function setText(id,text){
    var el=$(id);
    if(el) el.textContent=text||'';
  }

  function setPill(id,text,on){
    var el=$(id);
    if(!el) return;
    el.textContent=text||'—';
    el.classList.add('voice-status-badge');
    el.classList.toggle('is-on',!!on);
  }

  function compute(){
    return global.OneToneInputFlowSummary?global.OneToneInputFlowSummary.compute():{
      engineMode:'off',
      engineLabel:'未启用',
      naturalLine:'语音识别未启用'
    };
  }

  function render(){
    var s=compute();
    setPill('modelsVoskStatus',s.engineMode==='vosk'?'当前使用':'可选',s.engineMode==='vosk');
    setPill('modelsSapiStatus',s.engineMode==='sapi'?'当前使用':'可选',s.engineMode==='sapi');
    setPill('modelsKwsStatus',s.engineMode==='kws'?'当前使用':'可选',s.engineMode==='kws');
    setText('modelsSapiDesc',s.engineMode==='sapi'?'当前用于语音输入':'可作为轻量识别备用');
    if(global.OneToneVoiceModelLabels&&global.OneToneVoiceModelLabels.syncPresetButtons){
      global.OneToneVoiceModelLabels.syncPresetButtons();
    }
  }

  function bindEvents(){
    var wake=global.OneToneVoiceWake;
    var dl=$('btnModelsVoskDownload');
    if(dl) dl.onclick=function(){
      if(wake&&wake.downloadVoskModelGuide) wake.downloadVoskModelGuide();
    };
    var retry=$('btnModelsVoskRetry');
    if(retry) retry.onclick=function(e){
      e.stopPropagation();
      if(wake&&wake.retryVoskStart) wake.retryVoskStart();
    };
    var dir=$('btnModelsVoskOpenDir');
    if(dir) dir.onclick=function(){
      if(wake&&wake.openVoskResourcesDir) wake.openVoskResourcesDir();
    };
    var sapi=$('btnModelsSapiSetup');
    if(sapi) sapi.onclick=function(){
      if(wake&&wake.openSapiSetup) wake.openSapiSetup();
    };
    var kwsDl=$('btnModelsKwsDownload');
    if(kwsDl) kwsDl.onclick=function(){
      if(wake&&wake.downloadKwsModel) wake.downloadKwsModel();
    };
    var kwsRetry=$('btnModelsKwsRetry');
    if(kwsRetry) kwsRetry.onclick=function(e){
      e.stopPropagation();
      if(wake&&wake.retryKwsStart) wake.retryKwsStart();
    };
  }

  global.OneToneVoiceModelsPanel={render:render,bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
