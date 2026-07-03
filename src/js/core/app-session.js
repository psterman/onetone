(function(global){
  'use strict';
  function hooks(){ return global.__vp_app_session_hooks__ || {}; }

  var langBootstrapPending=false;
  var langBootstrapTimer=0;
  var fullLangApplied=false;
  var processUsagePollDeferred=false;
  var voiceEngineBootTimer=0;
  var voiceEngineBootDone=false;
  var bootMicReady=false;
  var bootMicTimer=0;
  var uiBootstrapping=true;

  function ensureFullLangApplied(){
    if(fullLangApplied) return;
    fullLangApplied=true;
    langBootstrapPending=false;
    clearTimeout(langBootstrapTimer);
    langBootstrapTimer=0;
    var run=function(){
      hooks().applyLang(true);
      hooks().syncKeyWakeSettingsFromConfig();
    };
    if(typeof requestIdleCallback==='function'){
      requestIdleCallback(run,{timeout:2500});
    }else{
      setTimeout(run,50);
    }
  }

  function markVoiceEngineBootHandled(){
    voiceEngineBootDone=true;
    clearTimeout(voiceEngineBootTimer);
    voiceEngineBootTimer=0;
  }

  function scheduleDeferredVoiceEngineBoot(){
    if(voiceEngineBootDone||voiceEngineBootTimer||hooks().welcomeOpen()||hooks().onboardIsOpen()) return;
    voiceEngineBootTimer=setTimeout(function(){
      voiceEngineBootTimer=0;
      if(voiceEngineBootDone||hooks().welcomeOpen()||hooks().onboardIsOpen()||!global.OneToneConfigPersist.isLoaded()) return;
      var cfg=hooks().state().config||{};
      var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
      var sapi=cfg.voiceSapi||cfg.voice_sapi||{};
      if(!vosk.enabled&&!sapi.enabled) return;
      voiceEngineBootDone=true;
      if(vosk.enabled){
        hooks().vpInvoke('cmd_voice_vosk_set_enabled',{enabled:true}).then(function(res){
          hooks().renderVoiceVoskStatus(res);
          hooks().syncHomeFromVoiceSettings(res,{enabled:false,state:'stopped'},null,{homeOnly:true,lightOnly:true});
          hooks().renderHomeLiveZone();
        }).catch(function(){
          voiceEngineBootDone=false;
        });
      }else{
        hooks().vpInvoke('cmd_voice_sapi_set_enabled',{enabled:true}).then(function(res){
          hooks().renderVoiceSapiStatus(res);
          if(!hooks().handleVoiceSapiEnableResult(res,true)) voiceEngineBootDone=false;
          hooks().syncHomeFromVoiceSettings({enabled:false,state:'stopped'},res,null,{homeOnly:true,lightOnly:true});
          hooks().renderHomeLiveZone();
        }).catch(function(){
          voiceEngineBootDone=false;
        });
      }
    },10000);
  }

  function scheduleBootMicReady(){
    clearTimeout(bootMicTimer);
    bootMicTimer=setTimeout(function(){
      bootMicReady=true;
      if(!hooks().ui().drawerOpen&&hooks().micLevelUiVisible()&&!hooks().voiceCaptureActive()){
        hooks().syncHomeMicMonitor().catch(function(){});
      }
    },3500);
  }

  function scheduleLangBootstrap(){
    langBootstrapPending=true;
    clearTimeout(langBootstrapTimer);
    langBootstrapTimer=setTimeout(function(){
      langBootstrapTimer=0;
      if(!fullLangApplied&&!hooks().ui().drawerOpen) ensureFullLangApplied();
    },12000);
  }

  function maybeStartProcessUsagePoll(){
    if(hooks().processUsagePollTimer()||!processUsagePollDeferred) return;
    if(hooks().welcomeOpen()||hooks().onboardIsOpen()) return;
    processUsagePollDeferred=false;
    hooks().startProcessUsagePoll();
  }

  function deferProcessUsagePoll(){
    processUsagePollDeferred=true;
    hooks().clearProcessUsagePollTimer();
  }

  global.OneToneAppSession={
    ensureFullLangApplied:ensureFullLangApplied,
    markVoiceEngineBootHandled:markVoiceEngineBootHandled,
    scheduleDeferredVoiceEngineBoot:scheduleDeferredVoiceEngineBoot,
    scheduleBootMicReady:scheduleBootMicReady,
    scheduleLangBootstrap:scheduleLangBootstrap,
    maybeStartProcessUsagePoll:maybeStartProcessUsagePoll,
    deferProcessUsagePoll:deferProcessUsagePoll,
    voiceEngineBootDone:function(){ return voiceEngineBootDone; },
    setVoiceEngineBootDone:function(v){ voiceEngineBootDone=!!v; },
    clearVoiceEngineBootTimer:function(){ clearTimeout(voiceEngineBootTimer); voiceEngineBootTimer=0; },
    bootMicReady:function(){ return bootMicReady; },
    uiBootstrapping:function(){ return uiBootstrapping; },
    setUiBootstrapping:function(v){ uiBootstrapping=!!v; },
    setLangBootstrapPending:function(v){ langBootstrapPending=!!v; },
    langBootstrapPending:function(){ return langBootstrapPending; }
  };
})((typeof window!=='undefined')?window:globalThis);
