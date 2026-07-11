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
    setText('modelsCurrentEngine',s.engineLabel);
    setText('modelsCurrentDetail',s.naturalLine);
    setPill('modelsVoskStatus',s.engineMode==='vosk'?'当前使用':'可选',s.engineMode==='vosk');
    setPill('modelsSapiStatus',s.engineMode==='sapi'?'当前使用':'可选',s.engineMode==='sapi');
    setText('modelsSapiUsage',s.engineMode==='sapi'?'当前用于语音输入':'可作为轻量识别备用');
  }

  function clickExisting(id){
    var el=$(id);
    if(el) el.click();
  }

  function bindEvents(){
    var openVoice=$('btnModelsOpenVoice');
    if(openVoice) openVoice.onclick=function(){
      if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.open({panel:'voiceWake',voiceSubpage:'wake'});
    };
    var dl=$('btnModelsVoskDownload');
    if(dl) dl.onclick=function(){ clickExisting('btnVoskDownloadGuide'); };
    var retry=$('btnModelsVoskRetry');
    if(retry) retry.onclick=function(){ clickExisting('btnVoskRetry'); };
    var dir=$('btnModelsVoskOpenDir');
    if(dir) dir.onclick=function(){ clickExisting('btnVoskOpenResources'); };
    var sapi=$('btnModelsSapiSetup');
    if(sapi) sapi.onclick=function(){ clickExisting('btnVoiceSapiSetup'); };
    var useSapi=$('btnModelsUseSapi');
    if(useSapi) useSapi.onclick=function(){
      if(global.__vp_bootstrap_hooks__&&global.__vp_bootstrap_hooks__.switchVoiceMode){
        global.__vp_bootstrap_hooks__.switchVoiceMode('sapi',{toastKind:'lite'});
      }
    };
  }

  global.OneToneVoiceModelsPanel={render:render,bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
