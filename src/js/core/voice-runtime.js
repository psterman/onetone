(function(global){
  'use strict';
  function hooks(){ return global.__vp_voice_runtime_hooks__ || {}; }

  var lastVoiceListKey='';
  var lastVoiceCaptureActive=false;
  var homeLightRenderCounter=0;
  var voiceUiRenderTimer=0;

  function maybeRenderMappingListFromVoice(){
    if(!hooks().mappingListUiActive()) return;
    var snap=hooks().voiceUiSnapshot().end||{};
    var key=(snap.state||'idle')+'|'+(snap.mappingId||'');
    if(key===lastVoiceListKey) return;
    lastVoiceListKey=key;
    if(hooks().voiceListRenderTimer()) clearTimeout(hooks().voiceListRenderTimer());
    hooks().setVoiceListRenderTimer(setTimeout(function(){
      hooks().setVoiceListRenderTimer(0);
      hooks().renderMappingList();
      hooks().renderSettingsSchemeSubnav();
    },150));
  }

  function maybeSyncMicLevelMonitor(){
    var active=hooks().voiceCaptureActive();
    var ui=hooks().ui();
    if(ui.drawerOpen&&ui.settingsPanel==='voiceWake'){
      // Vosk already emits mic_level to FE — polling + event paint dual-path idle 假死.
      hooks().stopMicMonitor();
      if(hooks().stopMicLevelPoll) hooks().stopMicLevelPoll();
      else if(global.OneToneAppMic&&global.OneToneAppMic.stopMicLevelPoll){
        try{ global.OneToneAppMic.stopMicLevelPoll(); }catch(_){}
      }
      lastVoiceCaptureActive=active;
      return;
    }
    if(active){
      hooks().stopMicMonitor();
      if(!global.OneToneAppMic.hasMicPollTimer()) hooks().startMicLevelPoll();
    }else if(!global.OneToneAppMic.hasMicPollTimer()){
      hooks().startMicLevelPoll();
    }
    lastVoiceCaptureActive=active;
  }

  function scheduleVoiceUiRender(drawerPayload){
    clearTimeout(voiceUiRenderTimer);
    voiceUiRenderTimer=setTimeout(function(){
      try{
        var snap=hooks().voiceUiSnapshot;
        if(typeof snap==='function') snap=snap();
        if(snap) snap.listen={paused:!!hooks().runtime().paused};
        var ui=hooks().ui();
        if(ui.drawerOpen){
          var panel=ui.settingsPanel;
          // voiceWake open settle: skip status remount that stacked with chrome/heavy (stall @+0.5s).
          var settling=panel==='voiceWake'&&global.OneToneVoiceWake&&typeof global.OneToneVoiceWake.isOpenFlowSettling==='function'&&global.OneToneVoiceWake.isOpenFlowSettling();
          // #region agent log
          try{ if(settling&&global.__dbgB5) global.__dbgB5('F','voice-runtime.js:scheduleVoiceUiRender','skip status during open settle',{panel:panel}); }catch(_){}
          // #endregion
          if(drawerPayload&&!settling){
            if((panel==='voiceWake'||panel==='debug')&&drawerPayload.sapi) hooks().renderVoiceSapiStatus(drawerPayload.sapi,{liveOnly:panel==='voiceWake'});
            if((panel==='voiceWake'||panel==='debug')&&drawerPayload.vosk) hooks().renderVoiceVoskStatus(drawerPayload.vosk,{liveOnly:panel==='voiceWake'});
            if((panel==='voiceWake'||panel==='debug')&&drawerPayload.kws&&hooks().renderVoiceKwsStatus) hooks().renderVoiceKwsStatus(drawerPayload.kws,{liveOnly:panel==='voiceWake'});
            if((panel==='voiceWake'||panel==='debug')&&drawerPayload.end){
              // voiceWake: liveOnly — full modeSwitch+flow every 1.5s poll was the 假死 storm.
              hooks().renderVoiceEndStatus(drawerPayload.end, panel==='voiceWake'?{liveOnly:true}:undefined);
            }
          }
          if(panel==='voiceWake') maybeSyncMicLevelMonitor();
          if(panel==='voiceWake'&&!settling) maybeRenderMappingListFromVoice();
          if(panel==='voiceWake'&&!settling&&global.OneToneVoiceFeedbackRail&&global.OneToneVoiceFeedbackRail.syncLiveText){
            global.OneToneVoiceFeedbackRail.syncLiveText();
          }
          if(global.OneToneSettingsDrawer&&(global.OneToneSettingsDrawer.isKeysPanel(panel)||global.OneToneSettingsDrawer.isHabitsPanel(panel))) hooks().renderKeyFinishFlowPanel();
          if(panel==='debug') hooks().scheduleDebugChromeRefresh();
        }else{
          homeLightRenderCounter++;
          if(drawerPayload&&drawerPayload.vosk&&global.OneToneHomeV9&&global.OneToneHomeV9.paintHomeLiveTextImmediate){
            try{ global.OneToneHomeV9.paintHomeLiveTextImmediate(); }catch(_){}
          }
          if(drawerPayload&&drawerPayload.vosk&&global.OneToneHomeV9&&global.OneToneHomeV9.syncVoiceHeardSurfaces){
            try{ global.OneToneHomeV9.syncVoiceHeardSurfaces(); }catch(_){}
          }
          if(hooks().scheduleRenderHomeLiveZone) hooks().scheduleRenderHomeLiveZone();
          else hooks().renderHomeLiveZone();
          if(homeLightRenderCounter%5===0) hooks().renderHome();
        }
      }catch(err){
        console.error('scheduleVoiceUiRender',err);
      }
    },150);
  }

  function syncVoiceSettingsFromConfig(){
    var cfg=hooks().state().config||{};
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    var sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    var kws=cfg.voiceKws||cfg.voice_kws||{};
    var end=cfg.voiceEnd||cfg.voice_end||{};
    hooks().syncVoiceVoskToggle(!!vosk.enabled);
    hooks().syncVoiceSapiToggle(!!sapi.enabled);
    hooks().syncVoiceEndToggle(!!end.enabled);
    hooks().syncVoiceEndAutoSendToggle(!!end.autoSendEnabled);
    hooks().syncVoiceEndPresets(end.phrasesZh||end.phrases_zh||[],end.phrasesEn||end.phrases_en||[]);
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.syncCancelPresets){
      global.OneToneVoiceEnd.syncCancelPresets(
        end.cancelPhrasesZh||end.cancel_phrases_zh||[],
        end.cancelPhrasesEn||end.cancel_phrases_en||[]
      );
    }
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.syncSendPresets){
      global.OneToneVoiceEnd.syncSendPresets(
        end.sendPhrasesZh||end.send_phrases_zh||[],
        end.sendPhrasesEn||end.send_phrases_en||[]
      );
    }
    global.OneToneVoiceWake.initSapiPresetsFromConfig();
    hooks().syncHomeFromVoiceSettings(
      {enabled:!!vosk.enabled,phrases:vosk.phrases||[],state:'stopped'},
      {enabled:!!sapi.enabled,phrases:sapi.phrases||[],state:'stopped'},
      {enabled:!!end.enabled,autoSendEnabled:!!end.autoSendEnabled,phrasesZh:end.phrasesZh||end.phrases_zh||[],phrasesEn:end.phrasesEn||end.phrases_en||[],state:'idle'},
      {homeOnly:true,lightOnly:true},
      kws.enabled?{enabled:true,phrases:kws.phrases||[],state:'stopped'}:null
    );
  }

  global.OneToneVoiceRuntime={
    scheduleVoiceUiRender:scheduleVoiceUiRender,
    syncVoiceSettingsFromConfig:syncVoiceSettingsFromConfig
  };
})((typeof window!=='undefined')?window:globalThis);
