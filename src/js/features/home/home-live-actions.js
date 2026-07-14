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

  function homeToggleVoiceWake(){
    var eng=global.OneToneHomeLive.voiceEngineOn();
    var vw=global.OneToneVoiceWake;
    if(!vw) return;
    if(eng==='vosk'||eng==='sapi'||eng==='kws'){
      global.OneToneIpc.invoke('cmd_voice_set_desired_engine',{engine:'none'}).then(function(bundle){
        var engine=(bundle&&bundle.engine)||'none';
        if(vw.syncDesiredEngineConfig) vw.syncDesiredEngineConfig(engine);
        var voskRes=(bundle&&bundle.voiceVosk)||{enabled:false,state:'stopped'};
        var sapiRes=(bundle&&bundle.voiceSapi)||{enabled:false,state:'stopped'};
        var kwsRes=(bundle&&bundle.voiceKws)||{enabled:false,state:'stopped'};
        if(vw.syncVoskConfigFromStatus) vw.syncVoskConfigFromStatus(voskRes);
        if(vw.syncSapiConfigFromStatus) vw.syncSapiConfigFromStatus(sapiRes);
        if(vw.syncKwsConfigFromStatus) vw.syncKwsConfigFromStatus(kwsRes);
        if(vw.renderVoskStatus) vw.renderVoskStatus(voskRes,{liveOnly:true});
        if(vw.renderSapiStatus) vw.renderSapiStatus(sapiRes,{liveOnly:true});
        if(vw.renderKwsStatus) vw.renderKwsStatus(kwsRes,{liveOnly:true});
        if(global.OneToneVoiceHomeSync&&global.OneToneVoiceHomeSync.sync){
          global.OneToneVoiceHomeSync.sync(voskRes,sapiRes,null,{lightOnly:true,homeOnly:true},kwsRes);
        }else if(global.OneToneHomeLive&&global.OneToneHomeLive.scheduleRenderZone){
          global.OneToneHomeLive.scheduleRenderZone();
        }else if(global.OneToneHomeLive&&global.OneToneHomeLive.renderZone){
          global.OneToneHomeLive.renderZone();
        }
      }).catch(function(err){
        console.error('home_voice_off',err);
        toast(t('voiceVoskFail'));
      });
      return;
    }
    var pref=homePreferredVoiceEngine();
    if(vw.switchMode){
      vw.switchMode(pref==='sapi'&&!voskOnlyUi()?'sapi':'vosk');
      return;
    }
    global.OneToneIpc.invoke('cmd_voice_set_desired_engine',{engine:pref==='sapi'&&!voskOnlyUi()?'sapi':'vosk'}).catch(function(err){
      console.error('home_voice_on',err);
    });
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
