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
    if(hooks().homeVoiceEngineOn()==='off'){
      if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()){
        hooks().toggleVoiceVosk(true);
      }else{
        hooks().toggleVoiceSapi(true);
      }
    }
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
      getImeTargetKeyLabel:function(){
        var cfg=hooks().state().config||{};
        var maps=Array.isArray(cfg.mappings)?cfg.mappings:[];
        var activeId=cfg.activeSceneId?String(cfg.activeSceneId):'';
        var m=(activeId&&maps.find(function(x){ return x&&x.id===activeId; }))
          ||maps.find(function(x){ return x&&x.enabled; })
          ||maps[0]
          ||null;
        var key=(m&&m.targetKey)?String(m.targetKey).trim():'RAlt';
        if(m&&m.imePresetId&&global.OneToneImePresets&&global.OneToneImePresets.presetById){
          var preset=global.OneToneImePresets.presetById(m.imePresetId);
          if(preset&&preset.targetKey) key=preset.targetKey;
        }
        if(m&&m.appTargetId&&global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presetById){
          var appPreset=global.OneToneAppTargetPresets.presetById(m.appTargetId);
          if(appPreset&&appPreset.targetKey) key=appPreset.targetKey;
        }
        var lang=this.getLang?this.getLang():'zh';
        if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
          return global.OneToneKeyLabels.friendlyKeyName(key,lang)||key;
        }
        return key;
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
      getPracticeHeardRaw:function(mode){
        var w=hooks().voiceUiSnapshot().wake||{};
        var transcriptMode=mode==='end'||mode==='cancel';
        if(w.engine==='vosk'){
          var vosk=w.vosk||{};
          if(transcriptMode){
            return String(vosk.lastPartial||vosk.lastFinal||'').trim();
          }
          return String(vosk.lastDetectedPhrase||vosk.lastFinal||vosk.lastPartial||'').trim();
        }
        var sapi=w.sapi||{};
        return String(sapi.lastHeard||'').trim();
      },
      enableVoiceWakeForPractice:function(){
        if(hooks().homeVoiceEngineOn()!=='off') return Promise.resolve(true);
        hooks().markVoiceEngineBootHandled();
        hooks().setVoiceEngineBootDone(true);
        hooks().clearVoiceEngineBootTimer();
        return hooks().vpInvoke('cmd_voice_set_listening_strategy',{strategy:'auto'}).then(function(bundle){
          if(!bundle||bundle.ok===false) return false;
          var voskRes=(bundle&&bundle.voiceVosk)||{enabled:false,state:'stopped'};
          var sapiRes=(bundle&&bundle.voiceSapi)||{enabled:false,state:'stopped'};
          var kwsRes=(bundle&&bundle.voiceKws)||{enabled:false,state:'stopped'};
          if(hooks().renderVoiceVoskStatus) hooks().renderVoiceVoskStatus(voskRes);
          if(hooks().renderVoiceSapiStatus) hooks().renderVoiceSapiStatus(sapiRes);
          if(hooks().renderVoiceKwsStatus) hooks().renderVoiceKwsStatus(kwsRes);
          hooks().syncHomeFromVoiceSettings(voskRes,sapiRes,null,{lightOnly:true},kwsRes);
          hooks().renderHomeLiveZone();
          hooks().renderHome();
          return hooks().homeVoiceEngineOn()!=='off';
        });
      },
      enableVoicePractice:function(opts){
        opts=opts||{};
        var self=this;
        var tasks=[];
        if(opts.mode==='end'||opts.mode==='cancel'){
          tasks.push(hooks().vpInvoke('cmd_voice_end_set_enabled',{enabled:true}).catch(function(){ return null; }));
        }
        return Promise.all(tasks).then(function(){
          if(hooks().homeVoiceEngineOn()==='off'){
            return self.enableVoiceWakeForPractice();
          }
          return true;
        });
      },
      openPhrasePractice:function(opts){
        if(!global.OneTonePhrasePractice) return;
        opts=opts||{};
        var phrases=opts.phrases;
        if(!phrases||!phrases.length){
          if(opts.mode==='end'){
            var end=this.getEndPhrases();
            var lang=this.getLang?this.getLang():'zh';
            var zh=end.zh||[];
            var en=end.en||[];
            phrases=(lang==='en'?en.concat(zh):zh.concat(en)).filter(function(x){return String(x||'').trim();});
            if(!phrases.length) phrases=[this.t('homeEndPhraseDefault')];
          }else{
            phrases=this.getWakePhrases();
          }
        }
        global.OneTonePhrasePractice.open(Object.assign({},opts,{phrases:phrases}));
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
