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
      }
      if(msg.type==='mvp_saved'&&msg.ok){ /* persisted */ }
      if(msg.type==='mvp_mapping_toggled'&&msg.ok){
        var m=state.config&&state.config.mappings.find(function(x){ return x.id===msg.id; });
        if(m) m.enabled=!!msg.enabled;
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
      if(msg.type==='mvp_scheme_switched'){
        if(msg.config) state.config=msg.config;
        else if(msg.toId){
          hooks.ensureConfig();
          state.config.mappings.forEach(function(mapping){ mapping.enabled=(mapping.id===msg.toId); });
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
