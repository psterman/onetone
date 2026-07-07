(function(global){
  'use strict';

  function t(key){ return global.OneToneI18n.t(key); }
  function hooks(){ return global.__vp_bootstrap_hooks__ || {}; }

  function cfg(){
    return (global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config)||{};
  }

  /** Legacy users who explicitly enabled SAPI without Vosk still see lite UI. */
  function isLegacySapiOnlyUser(){
    var c=cfg();
    var vosk=c.voiceVosk||c.voice_vosk||{};
    var sapi=c.voiceSapi||c.voice_sapi||{};
    return !!sapi.enabled&&!vosk.enabled;
  }

  function isVoskOnlyUi(){
    return !isLegacySapiOnlyUser();
  }

  function entryWantsVoice(){
    try{
      var mode=localStorage.getItem('vp_entry_mode')||'';
      return mode==='voice'||mode==='both';
    }catch(_){ return false; }
  }

  function probe(){
    return Promise.all([
      global.OneToneIpc.invoke('cmd_voice_vosk_status',{}).catch(function(){ return null; }),
      global.OneToneIpc.invoke('cmd_voice_sapi_status',{}).catch(function(){ return null; })
    ]).then(function(res){
      return { vosk:res[0], sapi:res[1] };
    });
  }

  function sapiNeedsSetup(sapi){
    if(!sapi) return true;
    if(sapi.state==='error'){
      var err=String(sapi.lastError||'').toLowerCase();
      return err.indexOf('spinprocrecognizer')>=0||err.indexOf('class not registered')>=0||err.indexOf('spmmaudioin')>=0;
    }
    return false;
  }

  function voskNeedsModel(vosk){
    if(!vosk) return true;
    if(vosk.modelExists===false) return true;
    return String(vosk.resourceIssue||'')==='model_missing';
  }

  function showHintOnce(id,msg,kind){
    try{
      if(sessionStorage.getItem(id)) return;
      sessionStorage.setItem(id,'1');
    }catch(_){}
    hooks().toast&&hooks().toast(msg,kind||'');
  }

  function checkAfterBoot(){
    if(isVoskOnlyUi()&&global.OneToneVoiceWake&&global.OneToneVoiceWake.setExpandedMode){
      global.OneToneVoiceWake.setExpandedMode('vosk');
    }
    if(!entryWantsVoice()) return Promise.resolve();
    return probe().then(function(st){
      var vosk=st.vosk;
      if(voskNeedsModel(vosk)){
        showHintOnce('vp_engine_vosk_missing',t('voiceEngineHintVoskMissing'),'warn');
      }
    });
  }

  function offerLiteFallback(){
    if(isVoskOnlyUi()) return;
    if(!global.OneToneVoiceWake||!global.OneToneVoiceWake.switchMode) return;
    global.OneToneVoiceWake.switchMode('sapi');
    hooks().toast&&hooks().toast(t('voiceEngineSwitchedLite'),'');
  }

  function preferredEngine(){
    if(isVoskOnlyUi()) return 'vosk';
    var c=cfg();
    var vosk=c.voiceVosk||c.voice_vosk||{};
    var sapi=c.voiceSapi||c.voice_sapi||{};
    if(vosk.enabled) return 'vosk';
    if(sapi.enabled) return 'sapi';
    return 'vosk';
  }

  global.OneToneVoiceEngineReadiness={
    probe:probe,
    checkAfterBoot:checkAfterBoot,
    voskNeedsModel:voskNeedsModel,
    sapiNeedsSetup:sapiNeedsSetup,
    offerLiteFallback:offerLiteFallback,
    isVoskOnlyUi:isVoskOnlyUi,
    isLegacySapiOnlyUser:isLegacySapiOnlyUser,
    preferredEngine:preferredEngine
  };
})((typeof window!=='undefined')?window:globalThis);
