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
      if(active){
        hooks().stopMicLevelPoll();
        hooks().stopMicMonitor();
      }else if(!active&&!global.OneToneAppMic.hasMicPollTimer()){
        hooks().startMicLevelPoll();
      }
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
          if(drawerPayload){
            if((panel==='voiceWake'||panel==='models'||panel==='debug')&&drawerPayload.sapi) hooks().renderVoiceSapiStatus(drawerPayload.sapi,{liveOnly:panel==='voiceWake'});
            if((panel==='voiceWake'||panel==='models'||panel==='debug')&&drawerPayload.vosk) hooks().renderVoiceVoskStatus(drawerPayload.vosk,{liveOnly:panel==='voiceWake'});
            if((panel==='voiceWake'||panel==='models'||panel==='debug')&&drawerPayload.end) hooks().renderVoiceEndStatus(drawerPayload.end);
          }
          if(panel==='models'&&global.OneToneVoiceModelsPanel) global.OneToneVoiceModelsPanel.render();
          if(panel==='voiceWake') maybeSyncMicLevelMonitor();
          if(panel==='voiceWake') maybeRenderMappingListFromVoice();
          if(global.OneToneSettingsDrawer&&(global.OneToneSettingsDrawer.isKeysPanel(panel)||global.OneToneSettingsDrawer.isHabitsPanel(panel))) hooks().renderKeyFinishFlowPanel();
          if(panel==='debug') hooks().scheduleDebugChromeRefresh();
        }else{
          homeLightRenderCounter++;
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
    var end=cfg.voiceEnd||cfg.voice_end||{};
    hooks().syncVoiceVoskToggle(!!vosk.enabled);
    hooks().syncVoiceSapiToggle(!!sapi.enabled);
    hooks().syncVoiceEndToggle(!!end.enabled);
    hooks().syncVoiceEndAutoSendToggle(!!end.autoSendEnabled);
    hooks().syncVoiceEndPresets(end.phrasesZh||end.phrases_zh||[],end.phrasesEn||end.phrases_en||[]);
    global.OneToneVoiceWake.initSapiPresetsFromConfig();
    hooks().syncHomeFromVoiceSettings(
      {enabled:!!vosk.enabled,phrases:vosk.phrases||[],state:'stopped'},
      {enabled:!!sapi.enabled,phrases:sapi.phrases||[],state:'stopped'},
      {enabled:!!end.enabled,autoSendEnabled:!!end.autoSendEnabled,phrasesZh:end.phrasesZh||end.phrases_zh||[],phrasesEn:end.phrasesEn||end.phrases_en||[],state:'idle'},
      {homeOnly:true,lightOnly:true}
    );
  }

  global.OneToneVoiceRuntime={
    scheduleVoiceUiRender:scheduleVoiceUiRender,
    syncVoiceSettingsFromConfig:syncVoiceSettingsFromConfig
  };
})((typeof window!=='undefined')?window:globalThis);
