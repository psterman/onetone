(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function voskOnlyUi(){
    return !!(global.OneToneVoiceEngineReadiness && global.OneToneVoiceEngineReadiness.isVoskOnlyUi());
  }

  function homePreferredVoiceEngine(){
    if(global.OneToneVoiceEngineReadiness && global.OneToneVoiceEngineReadiness.preferredEngine){
      return global.OneToneVoiceEngineReadiness.preferredEngine();
    }
    var cfg=global.OneToneState.state.config||{};
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    if(vosk.enabled) return 'vosk';
    return 'vosk';
  }

  function persistVoiceAssistToggle(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.invokeSaveOnce){
      global.OneToneConfigPersist.invokeSaveOnce('voiceAssistToggle');
    }
    if(global.OneToneHomeLive&&global.OneToneHomeLive.render) global.OneToneHomeLive.render();
    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.render) global.OneToneHomeWorkbench.render();
  }

  function homeToggleVoiceWake(){
    var vw=global.OneToneVoiceWake;
    if(!vw||!vw.switchListeningStrategy) return;
    var cfg=global.OneToneState.state.config||{};
    var on=global.OneToneVoiceSurfaceCopy
      ?global.OneToneVoiceSurfaceCopy.assistEnabled(cfg)
      :(global.OneToneHomeLive.voiceEngineOn()!=='off');
    if(on){
      cfg.voiceAssistEnabled=false;
      Promise.resolve(vw.switchListeningStrategy('off',{force:true})).then(persistVoiceAssistToggle).catch(persistVoiceAssistToggle);
      return;
    }
    cfg.voiceAssistEnabled=true;
    if(cfg.voiceWakeListeningOptIn){
      Promise.resolve(vw.switchListeningStrategy('resourceSaver',{force:true})).then(persistVoiceAssistToggle).catch(persistVoiceAssistToggle);
      return;
    }
    persistVoiceAssistToggle();
  }

  function toggleHomeKeyEnable(){
    if(global.OneToneMappingRecording.mode()!=='none') return;
    var m=global.OneToneMappingCore.activeScene();
    if(!m){
      toast(t('homeLiveUnset'));
      return;
    }
    if(global.OneToneMappingCore.isDraft(m)){
      toast(t('addNeedComplete'));
      return;
    }
    var next=!m.enabled;
    global.OneToneHomeLive.syncEntryToggleBtn($('btnHomeKeyToggle'),next,'homeLiveToggleKeyOff','homeLiveToggleKeyOn');
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(m.id,next);
      return;
    }
    try{
      window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:next});
    }catch(_){}
  }

  function homeSwitchWakeEngine(){
    if(voskOnlyUi()) return;
    if(global.OneToneVoiceWake.isSapiTogglePending()||global.OneToneVoiceWake.isVoskTogglePending()||global.OneToneVoiceWake.isModeSwitchPending()) return;
    var eng=global.OneToneHomeLive.voiceEngineOn();
    var next=eng==='vosk'?'sapi':'vosk';
    global.OneToneVoiceWake.switchMode(next);
  }

  function voiceAdvancedDetailsOpen(){
    var d=$('voiceAdvancedState');
    return !!(d&&d.open);
  }

  function syncHomeEditToActive(){
    var m=global.OneToneMappingCore.activeScene();
    if(!m) return;
    var st=global.OneToneState.state;
    if(st.selectedMappingId===m.id) return;
    st.selectedMappingId=m.id;
    global.OneToneMappingEditorState.syncFromMapping(m);
  }

  function openHomeKeyStep(focus){
    global.OneToneHomeScheme.closeMenu();
    if(global.OneToneHomeGuide.isOpen()) global.OneToneHomeGuide.close(true);
    syncHomeEditToActive();
    global.OneToneSettingsDrawer.open({panel:'keys',focus:focus||'trigger'});
  }

  function openHomeKeySettings(){
    openHomeKeyStep('trigger');
  }

  function openHomeKeyFinishSettings(){
    openHomeKeyStep('keyFinishFlow');
  }

  global.OneToneHomeLiveActions={
    homePreferredVoiceEngine:homePreferredVoiceEngine,
    homeToggleVoiceWake:homeToggleVoiceWake,
    toggleHomeKeyEnable:toggleHomeKeyEnable,
    homeSwitchWakeEngine:homeSwitchWakeEngine,
    voiceAdvancedDetailsOpen:voiceAdvancedDetailsOpen,
    openHomeKeySettings:openHomeKeySettings,
    openHomeKeyFinishSettings:openHomeKeyFinishSettings,
    openHomeKeyStep:openHomeKeyStep,
    syncHomeEditToActive:syncHomeEditToActive
  };
})((typeof window!=='undefined')?window:globalThis);
