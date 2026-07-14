(function(global){
  'use strict';
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindListeners(){
    var hooks=h();
    var state=global.OneToneState.state;
    var runtime=global.OneToneState.runtime;
    var t=hooks.t;
    window.chrome?.webview?.addEventListener?.('message',function(e){
      var msg=e&&e.data;
      if(!msg||typeof msg!=='object') return;
      if(msg.type==='mic_level'){
        if(!hooks.micLevelUiVisible()) return;
        var id=msg.deviceId!=null?String(msg.deviceId):(msg.device_id!=null?String(msg.device_id):'');
        if(typeof msg.level==='number'){
          hooks.updateMicLevelBars(id,msg.level);
          if(global.OneToneVoiceFeedbackRail&&global.OneToneVoiceFeedbackRail.setMicLevel){
            global.OneToneVoiceFeedbackRail.setMicLevel(msg.level);
          }
          if(msg.level>0||id) hooks.clearMicBackoff();
        }
        return;
      }
      if(msg.type==='mic_monitor_error'){
        hooks.handleMicMonitorError(msg);
        return;
      }
      if(msg.type==='mvp_init'){
        hooks.applyMvpInit(msg);
        if(global.OneToneState&&global.OneToneState.runtime){
          global.OneToneState.runtime.appStartedAt=Date.now();
        }
      }
      if(msg.type==='mvp_saved'&&msg.ok){
        if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.pullBackendConfig==='function'){
          global.OneToneConfigPersist.pullBackendConfig();
        }
      }
      if(msg.type==='mvp_mapping_toggled'&&msg.ok){
        var edit=global.OneToneMappingEditActions;
        var nextEnabled=!!msg.enabled;
        if(edit&&edit.acceptMappingToggledAck&&!edit.acceptMappingToggledAck(msg.id,nextEnabled)) return;
        var m=state.config&&state.config.mappings.find(function(x){ return x.id===msg.id; });
        if(m){
          if(m.enabled===nextEnabled){
            if(edit&&edit.clearPendingEnable) edit.clearPendingEnable(msg.id,nextEnabled);
            return;
          }
          m.enabled=nextEnabled;
        }
        if(edit&&edit.clearPendingEnable) edit.clearPendingEnable(msg.id,nextEnabled);
        if(msg.autoDisabled&&msg.autoDisabled.length) hooks.toast(t('conflictDisabled'));
        hooks.render();
      }
      if(msg.type==='mvp_mapping_duplicated'&&msg.ok){ /* backend persisted; wait mvp_init */ }
      if(global.OneToneMappingRecordingInput.handleWebViewMessage(msg)) return;
      if(msg.type==='mvp_onboarding_trigger_fired'){
        if(msg.ok) hooks.markFirstSuccessDone();
        hooks.onboardEmit('onboarding_trigger_fired',msg);
        if(msg.ok) hooks.renderHome();
      }
      if(msg.type==='mvp_trigger_test_fired'){
        hooks.onboardEmit('trigger_test_fired',msg);
      }
      if(msg.type==='mvp_trigger_compat_result'){
        if(global.OneToneHomeWorkbenchCompat){
          global.OneToneHomeWorkbenchCompat.store(msg.mappingId,msg);
        }
        if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.onCompatResult){
          global.OneToneHomeWorkbench.onCompatResult(msg);
        }
        if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.onModeCompatResult){
          global.OneToneHabitTriggerSetup.onModeCompatResult(msg);
        }
      }
      if(msg.type==='mvp_trigger_compat_seen'){
        if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.onModeCompatSeen){
          global.OneToneHabitTriggerSetup.onModeCompatSeen(msg);
        }
      }
      if(msg.type==='mvp_paused'&&msg.ok){ runtime.paused=true; hooks.render(); }
      if(msg.type==='mvp_resumed'&&msg.ok){ runtime.paused=false; hooks.render(); }
      function applyRuntimeFields(msg){
        runtime.lastAction=msg.lastAction||'-';
        runtime.timerActive=!!msg.timerActive;
        runtime.paused=!!msg.paused;
      }
      function appendRuntimeEvent(event){
        if(!event||typeof event!=='object') return;
        if(!Array.isArray(runtime.events)) runtime.events=[];
        runtime.events.push(event);
        while(runtime.events.length>300) runtime.events.shift();
      }
      function afterRuntimeFields(msg){
        if(msg.soundCue) hooks.playSoundCue(msg.soundCue);
        else if(runtime.lastAction==='send_failed'||String(runtime.lastAction||'').indexOf('_send_failed')>=0) hooks.playSoundCue('send_fail');
        if(hooks.isVoiceWakeRuntimeAction(runtime.lastAction)){
          return;
        }
        if(global.OneToneMappingRecording.mode()==='trigger' && runtime.lastAction==='recorded'){
          /* handled by mvp_key_captured */
        } else if(runtime.lastAction!=='scheme_select'&&runtime.lastAction!=='scheme_cycle'){
          hooks.scheduleRuntimeRender();
        }
      }
      if(msg.type==='mvp_runtime'){
        applyRuntimeFields(msg);
        afterRuntimeFields(msg);
      }
      if(msg.type==='mvp_runtime_event'){
        appendRuntimeEvent(msg.event);
        if(global.OneToneVoiceAcousticMatcher&&global.OneToneVoiceAcousticMatcher.onRuntimeEvent){
          try{ global.OneToneVoiceAcousticMatcher.onRuntimeEvent(msg.event); }catch(_){}
        }
        if(global.OneToneDebugPanel&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode()==='developer'){
          global.OneToneDebugPanel.renderDeveloper();
        }
      }
      if(msg.type==='mvp_runtime_snapshot'){
        applyRuntimeFields(msg);
        if(msg.update) state.update=msg.update;
        if(Array.isArray(msg.logs)&&global.OneToneState.runtime){
          global.OneToneState.runtime.snapshotLogs=msg.logs;
        }
        if(Array.isArray(msg.recentEvents)){
          runtime.events=msg.recentEvents.slice(-300);
        }
        afterRuntimeFields(msg);
      }
      if(msg.type==='mvp_update_state'){
        global.OneToneUpdate.applyRuntimeMessage(msg);
      }
      if(msg.type==='mvp_vosk_download'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.handleVoskDownloadMessage){
        global.OneToneVoiceWake.handleVoskDownloadMessage(msg);
      }
      if(msg.type==='mvp_kws_download'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.handleKwsDownloadMessage){
        global.OneToneVoiceWake.handleKwsDownloadMessage(msg);
      }
      if(msg.type==='mvp_scheme_switched'){
        if(hooks().applyMvpInit){
          hooks().applyMvpInit({type:'mvp_init',config:msg.config,conflicts:msg.conflicts});
        }else if(msg.config){
          state.config=msg.config;
        }else if(msg.toId){
          hooks().ensureConfig();
          state.config.mappings.forEach(function(mapping){ mapping.enabled=(mapping.id===msg.toId); });
          if(state.config) state.config.activeSceneId=msg.toId;
          state.selectedMappingId=msg.toId;
        }
        hooks().showSchemeSwitchFeedback(msg.toId, msg.label||'');
      }
      if(msg.type==='mvp_test_sent'){
        hooks.handleTestSendResult(msg);
      }
    });
  }
  global.OneToneWebViewBus={bindListeners:bindListeners};
})((typeof window!=='undefined')?window:globalThis);
