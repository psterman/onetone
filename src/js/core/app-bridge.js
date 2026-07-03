(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_bridge_hooks__ || {}; }

  var welcomeOpen=false;
  var onboardEventBus={};

  function onboardEmit(event,payload){
    (onboardEventBus[event]||[]).forEach(function(fn){
      try{ fn(payload); }catch(_){}
    });
  }

  function onboardIsOpen(){
    return !!(global.OneToneOnboarding&&global.OneToneOnboarding.isOpen());
  }

  function openWelcome(){
    welcomeOpen=true;
    if(global.OneToneOnboarding){
      global.OneToneOnboarding.open(true);
      return;
    }
    var overlay=$('welcomeOverlay');
    if(!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
  }

  function closeWelcome(markSeen){
    welcomeOpen=false;
    if(global.OneToneOnboarding&&global.OneToneOnboarding.isOpen()){
      global.OneToneOnboarding.setOpen(false);
      return;
    }
    var overlay=$('welcomeOverlay');
    if(!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
    if(markSeen){
      try{ localStorage.setItem('vp_welcome_seen','1'); }catch(_){}
    }
    hooks().scheduleLangBootstrap();
    hooks().maybeStartProcessUsagePoll();
    if(global.OneToneConfigPersist.isLoaded()) hooks().scheduleDeferredVoiceEngineBoot();
  }

  function homeOneClickStart(){
    hooks().markVoiceEngineBootHandled();
    var m=hooks().selectedMapping();
    var trig=m?hooks().editorTriggerForMapping(m):'';
    var tgt=m?hooks().editorTargetForMapping(m):'';
    var keyReady=!!(trig&&tgt);
    var keyEnabled=!!(m&&m.enabled);
    if(keyReady&&!keyEnabled) hooks().toggleHomeKeyEnable();
    if(hooks().homeVoiceEngineOn()==='off') hooks().toggleVoiceSapi(true);
    hooks().toast(hooks().t('homeStartedToast'));
  }

  function handleHomeCtaClick(){
    hooks().openHomeSetupFlow();
  }

  function installApp(){
    global.OneToneApp={
      getActiveMapping:function(){ return hooks().selectedMapping(); },
      getLang:function(){ return hooks().getAppLang(); },
      saveConfigPatch:function(patchFn){
        hooks().ensureConfig();
        var m=hooks().selectedMapping();
        if(m&&patchFn) patchFn(m,hooks().state().config);
        hooks().save();
        hooks().renderHome();
      },
      saveAsync:function(){ return hooks().saveAsync(); },
      prepareMappingForRecording:function(){
        hooks().ensureConfig();
        var m=hooks().recordingMapping()||hooks().selectedMapping();
        return hooks().disableMappingForRecordingAsync(m);
      },
      startTriggerRecording:function(){ return hooks().startTriggerRecord(); },
      startTargetRecording:function(){ return hooks().startTargetRecord(); },
      cancelRecording:function(){ hooks().cancelRecording(); },
      openTestSendModal:function(){ hooks().fireTestSend(null); },
      openHomeGuideCard:function(card){
        try{
          var c=(card==='voice')?'voice':'key';
          hooks().openHomeGuide(c, $('btnHome'+(c==='voice'?'Voice':'Key')+'Help')||null);
        }catch(_){}
      },
      openHomeSetupFlow:function(){ hooks().openHomeSetupFlow(); },
      getHomeEntryMode:hooks().getHomeEntryMode,
      renderHome:function(){ hooks().renderHome(); },
      t:function(key){ return hooks().t(key); },
      on:function(event,handler){
        if(!onboardEventBus[event]) onboardEventBus[event]=[];
        onboardEventBus[event].push(handler);
      },
      off:function(event,handler){
        var list=onboardEventBus[event];
        if(!list) return;
        var i=list.indexOf(handler);
        if(i>=0) list.splice(i,1);
      },
      playSoundCue:function(id){ hooks().playSoundCue(id); },
      toast:function(msg){ hooks().toast(msg); },
      isRecording:function(){ return global.OneToneMappingRecording.mode()!=='none'; },
      isRecordingPending:function(){ return global.OneToneMappingRecording.isPending(); },
      homeOneClickStart:function(){ homeOneClickStart(); },
      isVoiceWakeEnabled:function(){ return hooks().homeVoiceEngineOn()!=='off'; },
      getWakePhrases:function(){
        var cfg=hooks().state().config||{};
        var eng=hooks().homeVoiceEngineOn();
        var voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
        var sapiCfg=cfg.voiceSapi||cfg.voice_sapi||{};
        var list=[];
        if(eng==='vosk'&&Array.isArray(voskCfg.phrases)) list=voskCfg.phrases.slice();
        else if(eng==='sapi'&&Array.isArray(sapiCfg.phrases)) list=sapiCfg.phrases.slice();
        else if(Array.isArray(voskCfg.phrases)&&voskCfg.phrases.length) list=voskCfg.phrases.slice();
        else if(Array.isArray(sapiCfg.phrases)&&sapiCfg.phrases.length) list=sapiCfg.phrases.slice();
        return list.filter(function(x){ return String(x||'').trim(); });
      },
      getEndPhrases:function(){
        var cfg=hooks().state().config||{};
        var end=cfg.voiceEnd||cfg.voice_end||{};
        var zh=Array.isArray(end.phrasesZh||end.phrases_zh)?(end.phrasesZh||end.phrases_zh):[];
        var en=Array.isArray(end.phrasesEn||end.phrases_en)?(end.phrasesEn||end.phrases_en):[];
        return {
          zh: zh.filter(function(x){ return String(x||'').trim(); }),
          en: en.filter(function(x){ return String(x||'').trim(); })
        };
      },
      getWakeHeardRaw:function(){
        var w=hooks().voiceUiSnapshot().wake||{};
        if(w.engine==='vosk'){
          var vosk=w.vosk||{};
          return vosk.lastDetectedPhrase||vosk.lastFinal||vosk.lastPartial||'';
        }
        var sapi=w.sapi||{};
        return sapi.lastHeard||'';
      },
      enableVoiceWakeForPractice:function(){
        if(hooks().homeVoiceEngineOn()!=='off') return Promise.resolve(true);
        hooks().markVoiceEngineBootHandled();
        hooks().setVoiceEngineBootDone(true);
        hooks().clearVoiceEngineBootTimer();
        return hooks().vpInvoke('cmd_voice_sapi_set_enabled',{enabled:true}).then(function(res){
          hooks().renderVoiceSapiStatus(res);
          if(!hooks().handleVoiceSapiEnableResult(res,true)) return false;
          if(res&&res.enabled) hooks().syncVoiceVoskToggle(false);
          hooks().syncHomeFromVoiceSettings({enabled:false,state:'stopped'},res);
          hooks().renderHomeLiveZone();
          hooks().renderHome();
          return !!(res&&res.enabled);
        });
      },
      openPhrasePractice:function(opts){
        if(!global.OneTonePhrasePractice) return;
        var phrases=opts&&opts.phrases?opts.phrases:this.getWakePhrases();
        global.OneTonePhrasePractice.open(Object.assign({},opts||{},{phrases:phrases}));
      },
      onWelcomeClosed:function(){
        welcomeOpen=false;
        hooks().scheduleLangBootstrap();
        hooks().maybeStartProcessUsagePoll();
        if(global.OneToneConfigPersist.isLoaded()) hooks().scheduleDeferredVoiceEngineBoot();
      }
    };
  }

  global.OneToneAppBridge={
    onboardEmit:onboardEmit,
    onboardIsOpen:onboardIsOpen,
    openWelcome:openWelcome,
    closeWelcome:closeWelcome,
    homeOneClickStart:homeOneClickStart,
    handleHomeCtaClick:handleHomeCtaClick,
    installApp:installApp,
    welcomeOpen:function(){ return welcomeOpen; },
    setWelcomeOpen:function(v){ welcomeOpen=!!v; }
  };
})((typeof window!=='undefined')?window:globalThis);
