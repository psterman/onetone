(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function homePreferredVoiceEngine(){
    var voskTab=$('btnHomeVoiceModeVosk');
    if(voskTab&&voskTab.classList.contains('is-active')) return 'vosk';
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
    var m=global.OneToneMappingCore.selected();
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

  function openHomeKeySettings(){
    global.OneToneHomeScheme.closeMenu();
    if(global.OneToneHomeGuide.isOpen()) global.OneToneHomeGuide.close(true);
    var m=global.OneToneMappingCore.selected();
    var trig=global.OneToneMappingCore.editorTrigger(m);
    var tgt=global.OneToneMappingCore.editorTarget(m);
    var focus='trigger';
    if(trig&&!tgt) focus='target';
    global.OneToneSettingsDrawer.open({panel:'keyWake',focus:focus});
  }

  function openHomeKeyFinishSettings(){
    global.OneToneHomeScheme.closeMenu();
    if(global.OneToneHomeGuide.isOpen()) global.OneToneHomeGuide.close(true);
    global.OneToneSettingsDrawer.open({panel:'keyWake',focus:'keyFinishFlow'});
  }

  global.OneToneHomeLiveActions={
    homePreferredVoiceEngine:homePreferredVoiceEngine,
    homeToggleVoiceWake:homeToggleVoiceWake,
    toggleHomeKeyEnable:toggleHomeKeyEnable,
    homeSwitchWakeEngine:homeSwitchWakeEngine,
    voiceAdvancedDetailsOpen:voiceAdvancedDetailsOpen,
    openHomeKeySettings:openHomeKeySettings,
    openHomeKeyFinishSettings:openHomeKeyFinishSettings
  };
})((typeof window!=='undefined')?window:globalThis);
