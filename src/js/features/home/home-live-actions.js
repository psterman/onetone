(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function homePreferredVoiceEngine(){
    var cfg=global.OneToneState.state.config||{};
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    var sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    if(vosk.enabled) return 'vosk';
    if(sapi.enabled) return 'sapi';
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.getExpandedMode()==='vosk') return 'vosk';
    return 'sapi';
  }

  function homeToggleVoiceWake(){
    var eng=global.OneToneHomeLive.voiceEngineOn();
    if(eng==='vosk') global.OneToneVoiceWake.toggleVosk(false);
    else if(eng==='sapi') global.OneToneVoiceWake.toggleSapi(false);
    else if(homePreferredVoiceEngine()==='vosk') global.OneToneVoiceWake.toggleVosk(true);
    else global.OneToneVoiceWake.toggleSapi(true);
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
    try{
      window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:next});
    }catch(_){}
  }

  function homeSwitchWakeEngine(){
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
