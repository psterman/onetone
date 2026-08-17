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
  var bootSettleUntil=0;
  var bootSettleTimer=0;
  var bootSettledCallbacks=[];

  var BUSY_VOICE_STATES={
    starting:1,
    listening:1,
    cooldown:1,
    triggered:1,
    error:1,
    stopping:1
  };

  function voiceStateBusy(st){
    if(st==null||st==='') return false;
    return !!BUSY_VOICE_STATES[String(st).toLowerCase()];
  }

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

  function currentListeningStrategy(cfg){
    cfg=cfg||hooks().state().config||{};
    return String(cfg.voiceListeningStrategy||cfg.voice_listening_strategy||'auto').trim()||'auto';
  }

  function runtimeEngineBootHealthy(snapshot, engine){
    if(!snapshot||!engine) return false;
    var key=engine==='vosk'?'voiceVosk':(engine==='kws'?'voiceKws':(engine==='sapi'?'voiceSapi':''));
    if(!key) return false;
    var res=snapshot[key]||{};
    var st=String(res.state||'').trim().toLowerCase();
    return st==='starting'||st==='listening'||st==='cooldown'||st==='triggered';
  }

  function runtimeAlreadyMatchesStrategy(snapshot, strategy){
    if(!snapshot) return false;
    var sup=snapshot.voiceSupervisor||snapshot.supervisor||{};
    var desired=String(sup.desiredEngine||snapshot.engine||'').trim().toLowerCase();
    if(strategy==='off') return desired==='none';
    if(strategy==='enhanced') return desired==='vosk'&&runtimeEngineBootHealthy(snapshot,'vosk');
    if(strategy==='resourceSaver'){
      if(desired==='none') return true;
      if(desired==='kws'&&runtimeEngineBootHealthy(snapshot,'kws')) return true;
      // Rust falls back to Vosk when KWS is not ready — treat as matched.
      return desired==='vosk'&&runtimeEngineBootHealthy(snapshot,'vosk');
    }
    if(strategy==='auto'){
      if(desired==='kws'&&runtimeEngineBootHealthy(snapshot,'kws')) return true;
      if(desired==='vosk'&&runtimeEngineBootHealthy(snapshot,'vosk')) return true;
    }
    return false;
  }

  /** Prefer FE wake snapshot over sync cmd_request_runtime (that path 假死'd idle enhanced). */
  function feWakeAlreadyMatchesStrategy(strategy){
    try{
      var snap=hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake;
      if(!snap) return false;
      var fake={
        voiceVosk:snap.vosk||null,
        voiceKws:snap.kws||null,
        voiceSapi:snap.sapi||null,
        voiceSupervisor:{desiredEngine:''}
      };
      var eng='';
      if(snap.vosk&&runtimeEngineBootHealthy({voiceVosk:snap.vosk},'vosk')) eng='vosk';
      else if(snap.kws&&runtimeEngineBootHealthy({voiceKws:snap.kws},'kws')) eng='kws';
      else if(snap.sapi&&runtimeEngineBootHealthy({voiceSapi:snap.sapi},'sapi')) eng='sapi';
      if(!eng) return false;
      fake.voiceSupervisor.desiredEngine=eng;
      fake.engine=eng;
      return runtimeAlreadyMatchesStrategy(fake,strategy);
    }catch(_){ return false; }
  }

  function activateVoiceBoot(cfg,which){
    var strategy=currentListeningStrategy(cfg);
    if(strategy==='off') return Promise.resolve(null);
    if(strategy!=='advanced'){
      return hooks().vpInvoke('cmd_voice_set_listening_strategy',{strategy:strategy});
    }
    if(which!=='kws'&&which!=='vosk'&&which!=='sapi') return Promise.resolve(null);
    return hooks().vpInvoke('cmd_voice_set_desired_engine',{engine:which});
  }

  function pickFallbackEngine(cfg,snapshot){
    var voskOnly=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    var sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    var kws=cfg.voiceKws||cfg.voice_kws||{};
    if(kws.enabled){
      var kSnap=snapshot&&(snapshot.voiceKws||snapshot.voice_kws);
      var kst=kSnap&&kSnap.state;
      if(voiceStateBusy(kst)) return null;
      if(kst==='stopped'||kst==null||kst==='') return 'kws';
      return null;
    }
    if(!vosk.enabled&&!sapi.enabled) return null;
    var vSnap=snapshot&&(snapshot.voiceVosk||snapshot.voice_vosk);
    var sSnap=snapshot&&(snapshot.voiceSapi||snapshot.voice_sapi);
    if(vosk.enabled){
      var vst=vSnap&&vSnap.state;
      if(voiceStateBusy(vst)) return null;
      if(vst==='stopped'||vst==null||vst==='') return 'vosk';
      return null;
    }
    if(voskOnly) return null;
    if(sapi.enabled){
      var sst=sSnap&&sSnap.state;
      if(voiceStateBusy(sst)) return null;
      if(sst==='stopped'||sst==null||sst==='') return 'sapi';
      return null;
    }
    return null;
  }

  function runVoiceFallback(which){
    voiceEngineBootDone=true;
    if(which!=='kws'&&which!=='vosk'&&which!=='sapi') return;
    var cfg=hooks().state().config||{};
    activateVoiceBoot(cfg,which).then(function(bundle){
      if(!bundle) return;
      var engine=(bundle&&bundle.engine)||which;
      var voskRes=(bundle&&bundle.voiceVosk)||{enabled:false,state:'stopped'};
      var sapiRes=(bundle&&bundle.voiceSapi)||{enabled:false,state:'stopped'};
      var kwsRes=(bundle&&bundle.voiceKws)||{enabled:false,state:'stopped'};
      if(hooks().renderVoiceVoskStatus) hooks().renderVoiceVoskStatus(voskRes);
      if(hooks().renderVoiceSapiStatus) hooks().renderVoiceSapiStatus(sapiRes);
      if(hooks().renderVoiceKwsStatus) hooks().renderVoiceKwsStatus(kwsRes);
      if(engine==='sapi'&&hooks().handleVoiceSapiEnableResult&&!hooks().handleVoiceSapiEnableResult(sapiRes,true)){
        voiceEngineBootDone=false;
      }
      hooks().syncHomeFromVoiceSettings(voskRes,sapiRes,null,{homeOnly:true,lightOnly:true},kwsRes);
      hooks().renderHomeLiveZone();
    }).catch(function(){
      voiceEngineBootDone=false;
    });
  }

  function resourceSaverStaysIdle(cfg){
    cfg=cfg||{};
    var kws=cfg.voiceKws||cfg.voice_kws||{};
    var phrases=kws.phrases||kws.keywords||[];
    return !Array.isArray(phrases)||!phrases.length;
  }

  function scheduleDeferredVoiceEngineBoot(){
    if(voiceEngineBootDone||voiceEngineBootTimer) return;
    // Welcome/onboard: keep retrying — Rust no longer preloads models on cold start.
    if(hooks().welcomeOpen()||hooks().onboardIsOpen()){
      voiceEngineBootTimer=setTimeout(function(){
        voiceEngineBootTimer=0;
        scheduleDeferredVoiceEngineBoot();
      },2000);
      return;
    }
    var cfgEarly=hooks().state().config||{};
    var strategyEarly=currentListeningStrategy(cfgEarly);
    // off / empty-KWS resourceSaver: stay idle (no model load).
    if(strategyEarly==='off'||(strategyEarly==='resourceSaver'&&resourceSaverStaysIdle(cfgEarly))){
      markVoiceEngineBootHandled();
      return;
    }
    voiceEngineBootTimer=setTimeout(function(){
      voiceEngineBootTimer=0;
      if(voiceEngineBootDone) return;
      if(hooks().welcomeOpen()||hooks().onboardIsOpen()||!global.OneToneConfigPersist.isLoaded()){
        scheduleDeferredVoiceEngineBoot();
        return;
      }
      var cfg=hooks().state().config||{};
      var strategy=currentListeningStrategy(cfg);
      // #region agent log
      try{ if(global.__dbgB5) global.__dbgB5('A','app-session.js:deferredVoiceBoot','deferred voice engine boot fire',{strategy:strategy,drawerOpen:!!(hooks().ui()&&hooks().ui().drawerOpen)}); }catch(_){}
      // #endregion
      if(strategy==='off'||(strategy==='resourceSaver'&&resourceSaverStaysIdle(cfg))){
        markVoiceEngineBootHandled();
        return;
      }

      if(!global.OneToneIpc||!global.OneToneIpc.invoke){
        scheduleDeferredVoiceEngineBoot();
        return;
      }

      if(strategy!=='advanced'){
        // Only skip IPC when an engine is already healthy for this strategy.
        // After deferred Rust bootstrap, FE must call activate — do not assume cold start loaded models.
        if(feWakeAlreadyMatchesStrategy(strategy)){
          markVoiceEngineBootHandled();
          return;
        }
        try{
          if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag) global.OneToneUiHeartbeat.setTag('voiceBootStrategy');
          else global.__otActivityTag='voiceBootStrategy';
        }catch(_){}
        // Prefer strategy set (activates) over request_runtime-only when idle after deferred bootstrap.
        global.OneToneIpc.invoke('cmd_voice_set_listening_strategy',{strategy:strategy}).then(function(bundle){
          if(bundle){
            var voskRes=(bundle&&bundle.voiceVosk)||{enabled:false,state:'stopped'};
            var sapiRes=(bundle&&bundle.voiceSapi)||{enabled:false,state:'stopped'};
            var kwsRes=(bundle&&bundle.voiceKws)||{enabled:false,state:'stopped'};
            if(hooks().renderVoiceVoskStatus) hooks().renderVoiceVoskStatus(voskRes);
            if(hooks().renderVoiceSapiStatus) hooks().renderVoiceSapiStatus(sapiRes);
            if(hooks().renderVoiceKwsStatus) hooks().renderVoiceKwsStatus(kwsRes);
            hooks().syncHomeFromVoiceSettings(voskRes,sapiRes,null,{homeOnly:true,lightOnly:true},kwsRes);
          }
          markVoiceEngineBootHandled();
          setTimeout(function(){
            try{ hooks().renderHomeLiveZone&&hooks().renderHomeLiveZone(); }catch(_){}
          },0);
          return null;
        }).catch(function(err){
          console.error('voice boot strategy',err);
          markVoiceEngineBootHandled();
        }).then(function(){
          try{
            if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag) global.OneToneUiHeartbeat.clearTag('voiceBootStrategy');
            else if(global.__otActivityTag==='voiceBootStrategy') global.__otActivityTag='';
          }catch(_){}
        });
        return;
      }

      var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
      var sapi=cfg.voiceSapi||cfg.voice_sapi||{};
      var kws=cfg.voiceKws||cfg.voice_kws||{};
      if(!vosk.enabled&&!sapi.enabled&&!kws.enabled) return;

      global.OneToneIpc.invoke('cmd_request_runtime',{}).then(function(snapshot){
        var which=pickFallbackEngine(cfg,snapshot);
        if(!which){
          markVoiceEngineBootHandled();
          return;
        }
        activateVoiceBoot(cfg,which).then(function(bundle){
          if(bundle){
            var voskRes=(bundle&&bundle.voiceVosk)||{enabled:false,state:'stopped'};
            var sapiRes=(bundle&&bundle.voiceSapi)||{enabled:false,state:'stopped'};
            var kwsRes=(bundle&&bundle.voiceKws)||{enabled:false,state:'stopped'};
            if(hooks().renderVoiceVoskStatus) hooks().renderVoiceVoskStatus(voskRes);
            if(hooks().renderVoiceSapiStatus) hooks().renderVoiceSapiStatus(sapiRes);
            if(hooks().renderVoiceKwsStatus) hooks().renderVoiceKwsStatus(kwsRes);
            hooks().syncHomeFromVoiceSettings(voskRes,sapiRes,null,{homeOnly:true,lightOnly:true},kwsRes);
          }
          markVoiceEngineBootHandled();
          hooks().renderHomeLiveZone&&hooks().renderHomeLiveZone();
        }).catch(function(){
          runVoiceFallback(which);
        });
      }).catch(function(err){
        console.error('voice boot status check',err);
        markVoiceEngineBootHandled();
      });
    },2500);
  }

  function scheduleBootMicReady(){
    clearTimeout(bootMicTimer);
    bootMicTimer=setTimeout(function(){
      bootMicReady=true;
      // #region agent log
      try{ if(global.__dbgB5) global.__dbgB5('B','app-session.js:bootMicReady','boot mic ready → maybe syncHomeMicMonitor',{drawerOpen:!!(hooks().ui()&&hooks().ui().drawerOpen),micVisible:!!(hooks().micLevelUiVisible&&hooks().micLevelUiVisible()),capture:!!(hooks().voiceCaptureActive&&hooks().voiceCaptureActive())}); }catch(_){}
      // #endregion
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

  function isBootSettling(){
    return uiBootstrapping||(bootSettleUntil>0&&Date.now()<bootSettleUntil);
  }

  function markBootStarted(ms){
    uiBootstrapping=true;
    var delay=ms||8000;
    bootSettleUntil=Date.now()+delay;
    clearTimeout(bootSettleTimer);
    bootSettleTimer=setTimeout(markBootSettled,delay);
  }

  /** cmd_ready already has config — do not sit on the 8s watchdog. */
  function noteBackendConfigReady(){
    if(!uiBootstrapping&&!(bootSettleUntil>0&&Date.now()<bootSettleUntil)) return;
    bootSettleUntil=Date.now()+400;
    clearTimeout(bootSettleTimer);
    bootSettleTimer=setTimeout(markBootSettled,400);
  }

  function runBootSettledCallbacks(){
    var list=bootSettledCallbacks.slice();
    bootSettledCallbacks=[];
    // Yield between settle jobs — HabitHub + SoftPad + voice poll + mvp flush
    // used to run in one sync turn and 假死 ~5s right after "boot settled".
    function next(){
      if(!list.length) return;
      var fn=list.shift();
      try{ fn(); }catch(err){ console.error('bootSettled',err); }
      if(list.length) setTimeout(next,0);
    }
    next();
  }

  function markBootSettled(){
    clearTimeout(bootSettleTimer);
    bootSettleTimer=0;
    bootSettleUntil=0;
    uiBootstrapping=false;
    runBootSettledCallbacks();
  }

  function whenBootSettled(fn){
    if(typeof fn!=='function') return;
    if(!isBootSettling()){
      try{ fn(); }catch(err){ console.error('whenBootSettled',err); }
      return;
    }
    bootSettledCallbacks.push(fn);
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
    isBootSettling:isBootSettling,
    markBootStarted:markBootStarted,
    markBootSettled:markBootSettled,
    noteBackendConfigReady:noteBackendConfigReady,
    whenBootSettled:whenBootSettled,
    setLangBootstrapPending:function(v){ langBootstrapPending=!!v; },
    langBootstrapPending:function(){ return langBootstrapPending; }
  };
})((typeof window!=='undefined')?window:globalThis);
