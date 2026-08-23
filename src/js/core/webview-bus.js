(function(global){
  'use strict';
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  var softPadHomeDirty=false;
  var softPadHomeFlushArmed=false;

  function flushSoftPadHomeDirty(){
    if(!softPadHomeDirty) return;
    softPadHomeDirty=false;
    softPadHomeFlushArmed=false;
    try{
      var softHero=global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.getHeroMode
        &&global.OneToneHomeWorkbench.getHeroMode()==='softPad';
      if(!softHero) return;
      if(global.OneToneHomeWorkbench.forceHomeRender) global.OneToneHomeWorkbench.forceHomeRender();
      if(global.OneToneHomeWorkbench.render) global.OneToneHomeWorkbench.render();
    }catch(_){}
  }

  function markSoftPadHomeDirty(){
    softPadHomeDirty=true;
    if(softPadHomeFlushArmed) return;
    softPadHomeFlushArmed=true;
    if(global.OneToneAppSession&&global.OneToneAppSession.whenBootSettled){
      global.OneToneAppSession.whenBootSettled(flushSoftPadHomeDirty);
    }else{
      softPadHomeFlushArmed=false;
      flushSoftPadHomeDirty();
    }
  }

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
      if(msg.type==='vosk_text'){
        if(global.OneToneVoiceUiState&&global.OneToneVoiceUiState.patchVoskLive){
          global.OneToneVoiceUiState.patchVoskLive(msg.kind==='final'?'final':'partial',msg.text||'');
        }else{
          var snap=global.OneToneVoiceUiState&&global.OneToneVoiceUiState.snapshot
            ?global.OneToneVoiceUiState.snapshot():null;
          if(snap){
            if(!snap.wake) snap.wake={};
            if(!snap.wake.vosk) snap.wake.vosk={};
            var vosk=snap.wake.vosk;
            if(typeof msg.text==='string'){
              if(msg.kind==='final'){
                vosk.lastFinal=msg.text;
                vosk.lastPartial='';
              }else{
                vosk.lastPartial=msg.text;
              }
            }
          }
        }
        if(global.OneToneHomeV9&&global.OneToneHomeV9.paintHomeLiveTextImmediate){
          global.OneToneHomeV9.paintHomeLiveTextImmediate();
        }
        if(msg.kind==='final'&&global.OneToneHomeWorkbench){
          if(global.OneToneHomeWorkbench.forceHomeRender){
            global.OneToneHomeWorkbench.forceHomeRender();
          }
          if(global.OneToneHomeWorkbench.render){
            global.OneToneHomeWorkbench.render();
          }
        }
        if(global.OneToneVoiceFeedbackRail&&global.OneToneVoiceFeedbackRail.syncLiveText){
          global.OneToneVoiceFeedbackRail.syncLiveText();
        }
        if(global.OneToneHomeV9&&global.OneToneHomeV9.syncVoiceHeardSurfaces){
          global.OneToneHomeV9.syncVoiceHeardSurfaces();
        }
        if(global.OneToneVoiceDiag&&global.OneToneVoiceDiag.updateMetric&&typeof msg.text==='string'&&msg.text.trim()){
          var diagT=hooks().t||function(k){ return k; };
          if(msg.kind==='final'){
            global.OneToneVoiceDiag.updateMetric('vosk','final',msg.text.trim(),diagT('voiceDiagLogFinal'));
          }else{
            global.OneToneVoiceDiag.updateMetric('vosk','partial',msg.text.trim(),diagT('voiceDiagLogHeard'));
          }
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
        return;
      }
      if(msg.type==='mvp_saved'&&msg.ok){
        // Quiet camera/layout saves already have FE state; pulling cmd_ready → applyMvpInit
        // while MediaPipe runs used to 假死 the UI (weak refit storm).
        if(msg.quiet) return;
        if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling&&global.OneToneAppSession.isBootSettling()) return;
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
      if(msg.type==='soft_pad_overlay_visibility'){
        if(global.OneToneSoundSurfaces&&global.OneToneSoundSurfaces.setOverlayVisible){
          global.OneToneSoundSurfaces.setOverlayVisible(!!msg.visible);
        }
        return;
      }
      if(msg.type==='soft_pad_open_shell_hook'){
        try{
          if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.setPanel){
            global.OneToneSettingsDrawer.setPanel('softPad');
          }
          if(global.OneToneSoftPadHub&&global.OneToneSoftPadHub.openShellHookConnect){
            global.OneToneSoftPadHub.openShellHookConnect(msg.kind);
          }
        }catch(_){}
        return;
      }
      if(msg.type==='soft_pad_decision_changed'||msg.type==='soft_pad_runtime'){
        if(global.OneToneSoftPadHub&&global.OneToneSoftPadHub.ingestSoftPadRuntimeSnapshot){
          var body=msg.softPad||msg.snapshot||msg;
          if(global.OneToneSoftPadHub.ingestSoftPadRuntimeSnapshot(body)){
            // Boot settle: ingest cache now; flush Soft Pad hero once after settle (do not drop).
            if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling&&global.OneToneAppSession.isBootSettling()){
              markSoftPadHomeDirty();
              return;
            }
            var softHero=global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.getHeroMode
              &&global.OneToneHomeWorkbench.getHeroMode()==='softPad';
            if(softHero&&global.OneToneHomeWorkbench.forceHomeRender){
              global.OneToneHomeWorkbench.forceHomeRender();
            }
            if(softHero&&global.OneToneHomeWorkbench.render){
              try{ global.OneToneHomeWorkbench.render(); }catch(_){}
            }
          }
        }
        return;
      }
      if(msg.type==='codex_micro_pad_key'){
        if(global.OneToneCodexMicroPadUi&&global.OneToneCodexMicroPadUi.onPadKeyEvent){
          global.OneToneCodexMicroPadUi.onPadKeyEvent(msg);
        }
        return;
      }
      if(msg.type==='codex_micro_pad_ready'){
        if(global.OneToneCodexMicroPadUi&&global.OneToneCodexMicroPadUi.onPadReady){
          global.OneToneCodexMicroPadUi.onPadReady(msg);
        }
        return;
      }
      if(msg.type==='codex_micro_overlay_dismissed'){
        if(global.OneToneCodexMicroPadUi&&global.OneToneCodexMicroPadUi.onOverlayDismissed){
          global.OneToneCodexMicroPadUi.onOverlayDismissed();
        }
        return;
      }
      if(msg.type==='mvp_paused'&&msg.ok){
        runtime.paused=true;
        if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.forceHomeRender){
          global.OneToneHomeWorkbench.forceHomeRender();
        }
        hooks.render();
      }
      if(msg.type==='mvp_resumed'&&msg.ok){
        runtime.paused=false;
        if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.forceHomeRender){
          global.OneToneHomeWorkbench.forceHomeRender();
        }
        hooks.render();
      }
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
        if(msg.soundCue){
          if(global.OneToneSoundBus&&global.OneToneSoundBus.handleRuntimeCue){
            global.OneToneSoundBus.handleRuntimeCue(msg.soundCue);
          }else{
            hooks.playSoundCue(msg.soundCue);
          }
        }else if(runtime.lastAction==='send_failed'||String(runtime.lastAction||'').indexOf('_send_failed')>=0){
          // Legacy fallback — prefer typed voice.send_failed via bus when present.
          if(global.OneToneSoundBus&&global.OneToneSoundBus.notify){
            global.OneToneSoundBus.notify('voice.send_failed',{dedupeKey:'voice.send_failed'});
          }else{
            hooks.playSoundCue('send_fail');
          }
        }
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
      if(msg.type==='mvp_scheme_select_blocked'){
        var reason=String(msg.reason||'').trim();
        var toastFn=global.OneToneAppToast&&global.OneToneAppToast.show;
        if(toastFn){
          if(reason==='recording'){
            toastFn(t('schemeSelectBlockedRecording')||'正在录制快捷键，请先取消录制再切换习惯','warn');
          }else{
            toastFn(t('schemeSelectBlocked')||'暂时无法切换习惯','warn');
          }
        }
      }
      if(msg.type==='mvp_scheme_switched'){
        // Light runtime merge only — full applyMvpInit remounts editors and 假死's home switch.
        if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.applySchemeSwitchedRuntime==='function'){
          global.OneToneConfigPersist.applySchemeSwitchedRuntime(msg);
        }else if(hooks.applyMvpInit&&msg.config){
          hooks.applyMvpInit({type:'mvp_init',config:msg.config,conflicts:msg.conflicts});
        }else if(msg.config){
          state.config=msg.config;
        }else if(msg.toId){
          hooks.ensureConfig();
          state.config.mappings.forEach(function(mapping){ mapping.enabled=(mapping.id===msg.toId); });
          if(state.config) state.config.activeSceneId=msg.toId;
          // Do not touch selectedMappingId — in-use ≠ editing.
        }
        hooks.showSchemeSwitchFeedback(msg.toId, msg.label||'');
      }
      if(msg.type==='mvp_test_sent'){
        hooks.handleTestSendResult(msg);
      }
    });
  }
  global.OneToneWebViewBus={bindListeners:bindListeners};
})((typeof window!=='undefined')?window:globalThis);
