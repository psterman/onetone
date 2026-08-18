(function(global){
  'use strict';
  var OneToneMappingCore=global.OneToneMappingCore;
  var OneToneI18n=global.OneToneI18n;
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_mapping_recording_hooks__ || {}; }
  function recordingInput(){ return global.OneToneMappingRecordingInput; }
var rec={ mode:'none',startPending:false,timer:0,mappingId:'', snapshot:null,mappingWasEnabled:null,nativeRestoreSnapshot:null, schemeSwitchSnapshot:'',captureGen:0,suppressAutoEnableOnce:false,beforeFinishTargetHook:null,agentBindingCapture:null,previewKey:'',peripheralFinishing:false };
  function acousticCalibrating(){
    var wake=global.OneToneVoiceWakeAcoustic;
    var control=global.OneToneVoiceControlAcoustic;
    return !!(
      (wake&&wake.isCalibrating&&wake.isCalibrating()) ||
      (control&&control.isCalibrating&&control.isCalibrating())
    );
  }

  function blockIfAcousticCalibrating(){
    if(!acousticCalibrating()) return false;
    hooks().toast(t('keysRecordBlockedByAcoustic'));
    return true;
  }

  function clearRecTimer(){ clearTimeout(rec.timer); rec.timer=0; }
  function beginRecordSnapshot(){
    const m=OneToneMappingCore.selected();
    rec.snapshot={
      editorTrigger:hooks().getEditorTriggerKey()||'',
      editorTarget:hooks().getEditorTargetKey()||'',
      mappingTrigger:m.triggerKey||'',
      mappingTarget:m.targetKey||'',
    };
  }

  function disableMappingForRecording(m){
    if(!m||!m.id) return;
    rec.mappingWasEnabled={id:m.id,enabled:!!m.enabled};
    if(!m.enabled) return;
    var edit=global.OneToneMappingEditActions;
    if(edit&&edit.setMappingEnabled) edit.setMappingEnabled(m.id,false);
    else{
      m.enabled=false;
      try{ window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:false}); }catch(_){}
    }
  }

  function disableMappingForRecordingAsync(m){
    return new Promise(function(resolve){
      if(!m||!m.id){ resolve(); return; }
      rec.mappingWasEnabled={id:m.id,enabled:!!m.enabled};
      if(!m.enabled){ resolve(); return; }
      var edit=global.OneToneMappingEditActions;
      if(edit&&edit.setMappingEnabled){
        edit.setMappingEnabled(m.id,false);
        resolve();
        return;
      }
      m.enabled=false;
      try{ window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:false}); }catch(_){}
      resolve();
    });
  }

  function notifyOnboardingCapture(mode,msg){
    if(!window.OneToneOnboarding||!window.OneToneOnboarding.isOpen()) return;
    const m=OneToneMappingCore.recording()||OneToneMappingCore.selected();
    const payload=msg||{
      mode:mode,
      mappingId:m&&m.id||'',
      key:mode==='target'?(m&&m.targetKey||''):(m&&m.triggerKey||''),
      sourceKey:m&&m.sourceKey||'',
      sourceTime:m&&m.sourceTime||'',
      source:m&&m.triggerSource||null
    };
    if(mode==='target'){
      if(window.OneToneOnboarding.onTargetCaptured) window.OneToneOnboarding.onTargetCaptured(payload);
    }else if(window.OneToneOnboarding.onKeyCaptured){
      window.OneToneOnboarding.onKeyCaptured(payload);
    }
  }

  function notifyOnboardingRecordingPreview(mode,key){
    if(!window.OneToneOnboarding||!window.OneToneOnboarding.onRecordingPreview) return;
    window.OneToneOnboarding.onRecordingPreview(mode,key);
  }

  function clearRecordMappingGuard(){
    rec.mappingWasEnabled=null;
  }

  function restoreMappingEnabledAfterRecordCancel(m){
    if(!rec.mappingWasEnabled||!m||m.id!==rec.mappingWasEnabled.id) return;
    if(rec.mappingWasEnabled.enabled&&!m.enabled){
      var edit=global.OneToneMappingEditActions;
      if(edit&&edit.setMappingEnabled) edit.setMappingEnabled(m.id,true);
      else{
        m.enabled=true;
        try{ window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:true}); }catch(_){}
      }
    }
    clearRecordMappingGuard();
  }

  function cancelRecording(){
    if(rec.mode==='none') return;
    var agentCap=rec.agentBindingCapture;
    if(agentCap) rec.agentBindingCapture=null;
    rec.suppressAutoEnableOnce=false;
    rec.previewKey='';
    const draftId=state.selectedMappingId;
    clearRecTimer();
    if(recordingInput()&&recordingInput().clearReconcileWatchdog){
      recordingInput().clearReconcileWatchdog();
    }
    if(rec.mode==='schemeSwitch'){
      rec.mode='none';
      hooks().ensureConfig();
      state.config.schemeSwitchKey=rec.schemeSwitchSnapshot;
      rec.schemeSwitchSnapshot='';
      hooks().resetTargetCapture();
      hooks().renderSchemeSwitch();
      renderRecordCancelBar();
      return;
    }
    if(rec.mode==='nativeRestore'){
      rec.mode='none';
      const m=state.config&&state.config.mappings.find(function(x){return x.id===rec.mappingId;});
      if(m&&rec.nativeRestoreSnapshot){
        m.triggerSource=rec.nativeRestoreSnapshot.triggerSource;
        m.sourceKey=rec.nativeRestoreSnapshot.sourceKey;
        m.sourceTime=rec.nativeRestoreSnapshot.sourceTime;
      }
      rec.nativeRestoreSnapshot=null;
      rec.mappingId='';
      hooks().resetTargetCapture();
      try{window.chrome?.webview?.postMessage({type:'mvp_stop_recording'});}catch(_){}
      hooks().renderMappingList();
      renderRecordCancelBar();
      return;
    }
    if(rec.mode==='mappingSwitch'){
      rec.mode='none';
      rec.mappingId='';
      hooks().resetTargetCapture();
      try{window.chrome?.webview?.postMessage({type:'mvp_stop_recording'});}catch(_){}
      hooks().renderMappingList();
      renderRecordCancelBar();
      return;
    }
    rec.mode='none';
    if(rec.snapshot){
      hooks().setEditorTriggerKey(rec.snapshot.editorTrigger);
      hooks().setEditorTargetKey(rec.snapshot.editorTarget);
      const m=OneToneMappingCore.recording();
      if(m){
        m.triggerKey=rec.snapshot.mappingTrigger;
        m.targetKey=rec.snapshot.mappingTarget;
        m.label=(rec.snapshot.mappingTrigger||'?')+' → '+(rec.snapshot.mappingTarget||'?');
      }
    }
    rec.snapshot=null;
    rec.mappingId='';
    hooks().resetTargetCapture();
    try{window.chrome?.webview?.postMessage({type:'mvp_stop_recording'});}catch(_){}
    restoreMappingEnabledAfterRecordCancel(OneToneMappingCore.recording()||OneToneMappingCore.selected());
    setRecording('none');
    if(agentCap&&agentCap.onCancel) agentCap.onCancel();
    if(hooks().abandonDraftIfPristine(draftId)) return;
    hooks().render();
  }

  function cancelDraftOrRecording(){
    if(rec.mode!=='none'){
      cancelRecording();
      return;
    }
    const m=OneToneMappingCore.selected();
    if(m&&OneToneMappingCore.isDraft(m)) OneToneMappingCore.removeDraft(m.id);
  }
  function updateRecordingPreview(mode,key){
    if(rec.mode!==mode) return;
    const d=OneToneI18n.dict();
    const normalized=previewCaptureKey(mode,key);
    rec.previewKey=normalized;
    const label=normalized?hooks().friendlyKeyName(normalized):(mode==='trigger'?d.triggerPlaceholder:d.targetPlaceholder);
    const islandOn=!!global.__otMappingEditorDisplayMounted;
    if(mode==='trigger'){
      const el=$('triggerView');
      if(!islandOn&&el) el.textContent=label;
    }else if(mode==='target'||mode==='agentBinding'){
      const el=$('targetView');
      if(!islandOn&&el) el.textContent=label;
    }
    if(islandOn&&typeof global.__otMappingEditorDisplaySync==='function'){
      global.__otMappingEditorDisplaySync();
    }
    if(global.OneToneMappingList&&global.OneToneMappingList.buildKeysDisplayChromeModel){
      // P12c-6：empty/icon chrome 走 display chrome 岛 / legacy apply
      var chromeApi=global.OneToneMappingList;
      if(global.__otKeysDisplayChromeMounted&&typeof global.__otKeysDisplayChromeSync==='function'){
        global.__otKeysDisplayChromeSync();
      }else{
        const triggerDisp=$('triggerDisplay');
        const targetDisp=$('targetDisplay');
        if(mode==='trigger'){
          if(triggerDisp) triggerDisp.classList.toggle('empty',!normalized);
          if(triggerDisp&&global.OneToneKeyIcons&&global.OneToneKeyIcons.syncDisplayIcon){
            global.OneToneKeyIcons.syncDisplayIcon(triggerDisp,normalized);
          }
        }else if(mode==='target'||mode==='agentBinding'){
          if(targetDisp) targetDisp.classList.toggle('empty',!normalized);
        }
      }
    }else{
      if(mode==='trigger'){
        const disp=$('triggerDisplay');
        if(disp) disp.classList.toggle('empty',!normalized);
        if(disp&&global.OneToneKeyIcons&&global.OneToneKeyIcons.syncDisplayIcon){
          global.OneToneKeyIcons.syncDisplayIcon(disp,normalized);
        }
      }else if(mode==='target'||mode==='agentBinding'){
        const disp=$('targetDisplay');
        if(disp) disp.classList.toggle('empty',!normalized);
      }
    }
    if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.renderRecordingFeedback) global.OneToneKeysPanelUi.renderRecordingFeedback();
    if(mode==='target'&&global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.isOpen&&global.OneToneHabitTriggerSetup.isOpen()){
      global.OneToneHabitTriggerSetup.refreshRecordStatus(normalized);
    }
  }

  function armLocalCaptureGuard(){
    global.OneToneMappingEditorState.armLocalCaptureGuard();
  }
  function startNativeRestoreRecord(mappingId){
    if(rec.mode!=='none') return;
    const m=state.config&&state.config.mappings.find(function(x){return x.id===mappingId;});
    if(!m||!hooks().isAutoTriggerMapping(m)) return;
    rec.nativeRestoreSnapshot={
      triggerSource:m.triggerSource?JSON.parse(JSON.stringify(m.triggerSource)):null,
      sourceKey:m.sourceKey||'',
      sourceTime:m.sourceTime||''
    };
    rec.mappingId=mappingId;
    hooks().resetTargetCapture();
    rec.mode='nativeRestore';
    try{window.chrome?.webview?.postMessage({type:'mvp_start_recording',mappingId:mappingId,mode:'trigger'});}catch(_){}
    hooks().renderMappingList();
    renderRecordCancelBar();
    hooks().pushLog(t('nativeRestoreRecord'));
    rec.timer=setTimeout(function(){
      if(rec.mode==='nativeRestore'){
        cancelRecording();
        hooks().pushLog(t('logTimeout'));
      }
    },30000);
  }

  function finishNativeRestoreCapture(physical,source){
    if(rec.mode!=='nativeRestore'||!rec.mappingId) return;
    const m=state.config&&state.config.mappings.find(function(x){return x.id===rec.mappingId;});
    if(!m) return;
    m.triggerSource=source||hooks().buildPeripheralTriggerSource(physical);
    m.sourceKey=physical||'';
    m.sourceTime=String(Date.now());
    rec.mode='none';
    rec.nativeRestoreSnapshot=null;
    rec.mappingId='';
    clearRecTimer();
    hooks().resetTargetCapture();
    try{window.chrome?.webview?.postMessage({type:'mvp_stop_recording'});}catch(_){}
    hooks().save();
    hooks().renderMappingList();
    renderRecordCancelBar();
    hooks().pushLog(t('triggerRecordDetected')+OneToneMappingCore.formatTriggerTrace(m));
  }

  function startSchemeSwitchRecord(){
    if(rec.mode!=='none') return;
    hooks().ensureConfig();
    rec.schemeSwitchSnapshot=state.config.schemeSwitchKey||'';
    hooks().resetTargetCapture();
    rec.mode='schemeSwitch';
    hooks().renderSchemeSwitch();
    renderRecordCancelBar();
    hooks().pushLog(t('schemeSwitchRecord'));
    rec.timer=setTimeout(function(){
      if(rec.mode==='schemeSwitch'){
        cancelRecording();
        hooks().pushLog(t('logTimeout'));
      }
    },30000);
  }

  function finishSchemeSwitchCapture(combo){
    if(!combo) return;
    hooks().ensureConfig();
    state.config.schemeSwitchKey=combo;
    rec.mode='none';
    rec.schemeSwitchSnapshot='';
    clearRecTimer();
    hooks().resetTargetCapture();
    hooks().save();
    hooks().renderSchemeSwitch();
    renderRecordCancelBar();
    hooks().pushLog((hooks().getAppLang()==='zh'?'习惯轮换键: ':'profile switch: ')+hooks().friendlyKeyName(combo));
  }

  function clearSchemeSwitchKey(){
    hooks().ensureConfig();
    state.config.schemeSwitchKey='';
    hooks().save();
    hooks().renderSchemeSwitch();
    hooks().toast(t('schemeSwitchCleared'));
  }

  function startMappingSwitchRecord(mappingId){
    if(rec.mode!=='none') return;
    hooks().ensureConfig();
    rec.mappingId=mappingId;
    hooks().resetTargetCapture();
    rec.mode='mappingSwitch';
    hooks().renderMappingList();
    renderRecordCancelBar();
    hooks().pushLog(t('switchKeysAdd'));
    rec.timer=setTimeout(function(){
      if(rec.mode==='mappingSwitch'){
        rec.mode='none';
        rec.mappingId='';
        hooks().renderMappingList();
        hooks().pushLog(t('logTimeout'));
      }
    },30000);
  }

  function finishMappingSwitchCapture(combo){
    if(!combo||!rec.mappingId) return;
    const m=state.config.mappings.find(function(x){return x.id===rec.mappingId;});
    if(!m) return;
    hooks().ensureMappingExtras(m);
    const k=combo.trim();
    if(k&&m.switchKeys.indexOf(k)<0) m.switchKeys.push(k);
    rec.mode='none';
    rec.mappingId='';
    clearRecTimer();
    hooks().resetTargetCapture();
    hooks().save();
    hooks().renderMappingList();
    renderRecordCancelBar();
    hooks().pushLog((hooks().getAppLang()==='zh'?'习惯直达键: ':'profile switch: ')+hooks().friendlyKeyName(k));
  }
  function applyKeyWakeRecordingUi(){
    const keySettings=$('keyWakeSettings');
    const triggerBtn=$('btnRecordTrigger');
    const targetBtn=$('btnRecordTarget');
    const recording=rec.mode==='trigger'||rec.mode==='target'||rec.mode==='agentBinding';
    if(keySettings) keySettings.classList.toggle('is-recording',recording);
    if(triggerBtn){
      triggerBtn.classList.toggle('is-recording',rec.mode==='trigger');
    }
    if(targetBtn){
      targetBtn.classList.toggle('is-recording',rec.mode==='target');
    }
    var triggerDisp=$('triggerDisplay');
    var targetDisp=$('targetDisplay');
    if(triggerDisp) triggerDisp.classList.toggle('is-recording',rec.mode==='trigger');
    if(targetDisp) targetDisp.classList.toggle('is-recording',rec.mode==='target'||rec.mode==='agentBinding');
    const onboardTriggerBtn=$('btnOnboardStartTriggerRecord');
    const onboardTargetBtn=$('btnOnboardStartTargetRecord');
    const onboardTriggerCard=$('onboardTriggerCard');
    const onboardTargetCard=$('onboardTargetCard');
    if(onboardTriggerBtn) onboardTriggerBtn.classList.toggle('is-recording',rec.mode==='trigger');
    if(onboardTargetBtn) onboardTargetBtn.classList.toggle('is-recording',rec.mode==='target');
    if(onboardTriggerCard) onboardTriggerCard.classList.toggle('is-recording',rec.mode==='trigger');
    if(onboardTargetCard) onboardTargetCard.classList.toggle('is-recording',rec.mode==='target');
    if(window.OneToneOnboarding&&window.OneToneOnboarding.syncRecordingUi) window.OneToneOnboarding.syncRecordingUi();
    if(hooks().ui().drawerOpen&&global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.isKeysPanel()) hooks().syncKeySchemeTimeline(hooks().schemeStepFocus());
    if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.renderRecordingFeedback) global.OneToneKeysPanelUi.renderRecordingFeedback();
  }

  function buildRecordCancelBarModel(){
    const m=OneToneMappingCore.selected();
    const showDraft=!!(m&&OneToneMappingCore.isDraft(m));
    const mode=rec.mode||'none';
    const ipcPhase=rec.ipcPhase||(global.__otRecordIpcPhase||'idle');
    const life=global.OneToneRecordIpcLifecycle;
    const recording=life&&life.isRecordingUi
      ?life.isRecordingUi(mode,ipcPhase)
      :(mode!=='none');
    const show=recording||showDraft;
    const label=recording?t('cancelRecord'):t('cancelDraft');
    const mappingId=m&&m.id?String(m.id):'';
    return {
      show:show,
      label:label,
      mode:mode,
      ipcPhase:ipcPhase,
      mappingId:mappingId,
      sig:[mode,ipcPhase,show?'1':'0',label,mappingId].join('\0')
    };
  }

  function renderRecordCancelBar(){
    const bar=$('recordCancelBar');
    if(!bar) return;
    const islandOn=!!global.__otRecordCancelBarMounted;
    if(islandOn){
      if(typeof global.__otRecordCancelBarSync==='function') global.__otRecordCancelBarSync();
      return;
    }
    const btn=$('btnCancelRecord');
    const model=buildRecordCancelBarModel();
    if(btn) btn.textContent=model.label;
    if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.syncCancelButtonHost){
      global.OneToneKeysPanelUi.syncCancelButtonHost();
    }
    bar.classList.toggle('show',model.show&&btn&&btn.parentNode===bar);
  }

  function setRecording(mode,opts){
    opts=opts||{};
    rec.mode=mode;
    if(mode==='none') rec.previewKey='';
    clearRecTimer();
    if(global.OneToneRecordIpcLifecycle){
      var phase=global.OneToneRecordIpcLifecycle.applyLegacyMode
        ?global.OneToneRecordIpcLifecycle.applyLegacyMode(rec.mode,opts)
        :global.OneToneRecordIpcLifecycle.fromLegacyRecordingMode(rec.mode);
      rec.ipcPhase=phase;
    }
    if(!global.__otRecordIpcUiBound){
      global.__otRecordIpcUiBound=true;
      try{
        global.addEventListener('ot:record-ipc',function(){
          try{
            if(typeof rec.ipcPhase==='string'||global.__otRecordIpcPhase){
              rec.ipcPhase=global.__otRecordIpcPhase||rec.ipcPhase;
            }
            renderRecordCancelBar();
            if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.renderRecordingFeedback){
              global.OneToneKeysPanelUi.renderRecordingFeedback();
            }
            if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.renderStepHints){
              global.OneToneKeysPageNav.renderStepHints();
            }else if(global.__otKeysFlowChromeMounted&&typeof global.__otKeysFlowChromeSync==='function'){
              global.__otKeysFlowChromeSync();
            }
          }catch(err){
            try{ console.error('[record-ipc] ui sync',err); }catch(_){}
          }
        });
      }catch(_){}
    }
    const d=OneToneI18n.dict();
    const triggerState=$('triggerState');
    const targetState=$('targetState');
    if(mode==='trigger'){
      if(triggerState) triggerState.textContent=d.triggerRecordHint;
    }else if(mode==='target'){
      if(targetState) targetState.textContent=d.targetRecordHint;
    }else{
      if(triggerState) triggerState.textContent='';
      if(targetState) targetState.textContent='';
    }
    if(!opts.silent){
      var probe=global.OneToneRecordProbe;
      if(probe){
        if(mode!=='none'){
          probe.clear();
          probe.setRecording(true, mode);
          probe.push('ui','start',mode, rec.mappingId||'');
        }else{
          probe.setRecording(false);
        }
      }
    }
    if(opts.silent||hooks().uiBootstrapping()) return;
    hooks().updatePrimaryCTA();
    hooks().renderHeroBadges();
    hooks().renderHome();
    hooks().renderMicDevices();
    renderRecordCancelBar();
    hooks().renderAddButton();
  }

  function invokeRecordingCommand(cmd,args){
    const ipc=global.OneToneIpc;
    const invoke=ipc&&typeof ipc.invoke==='function'?ipc.invoke.bind(ipc):window.__vp_invoke__;
    const payload=window.__vp_tauri_args__?window.__vp_tauri_args__(args||{}):(args||{});
    if(invoke){
      try{
        return invoke(cmd,payload).then(function(){ return true; }).catch(function(err){
          hooks().pushLog('[record] '+cmd+' failed: '+String(err&&err.message||err||'unknown'));
          return false;
        });
      }catch(err){
        hooks().pushLog('[record] '+cmd+' failed: '+String(err&&err.message||err||'unknown'));
        return Promise.resolve(false);
      }
    }
    try{
      if(cmd==='cmd_start_recording'){
        window.chrome?.webview?.postMessage({type:'mvp_start_recording',mappingId:args.mappingId||'',mode:args.mode||'trigger'});
      }else if(cmd==='cmd_stop_recording'){
        window.chrome?.webview?.postMessage({type:'mvp_stop_recording'});
      }
      return Promise.resolve(true);
    }catch(err){
      hooks().pushLog('[record] '+cmd+' failed: '+String(err&&err.message||err||'unknown'));
      return Promise.resolve(false);
    }
  }

  function invokeStartRecording(mappingId,mode){
    return invokeRecordingCommand('cmd_start_recording',{mappingId:mappingId||'',mode:mode||'trigger'});
  }

  function invokeStopRecording(){
    return invokeRecordingCommand('cmd_stop_recording',{});
  }

  function startTriggerRecord(pinnedMappingId){
    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close) global.OneToneTargetKeyPicker.close();
    if(rec.mode!=='none'||rec.startPending) return Promise.resolve(false);
    if(blockIfAcousticCalibrating()) return Promise.resolve(false);
    hooks().ensureConfig();
    const pin=String(pinnedMappingId||'').trim();
    hooks().resetTargetCapture();
    const fallback=(OneToneMappingCore.selected()&&OneToneMappingCore.selected().id)
      ||(state.config&&state.config.mappings&&state.config.mappings[0]&&state.config.mappings[0].id)
      ||'';
    if(pin){
      state.selectedMappingId=pin;
    }else if(!state.selectedMappingId&&fallback){
      state.selectedMappingId=fallback;
    }
    rec.mappingId=pin||state.selectedMappingId||fallback||'';
    beginRecordSnapshot();
    hooks().armTriggerLeftClickIgnore(900);
    rec.captureGen++;
    const captureGen=rec.captureGen;
    const m=OneToneMappingCore.recording();
    if(m){
      m.triggerSource=null; m.sourceKey=''; m.sourceTime='';
    }
    rec.startPending=true;
    hooks().pushLog('[record] start trigger mapping='+String(rec.mappingId||''));
    hooks().pushLog(t('logStartTrigger'));
    return disableMappingForRecordingAsync(m).then(function(){
      return invokeStartRecording(rec.mappingId,'trigger');
    }).then(function(ok){
      rec.startPending=false;
      if(!ok||captureGen!==rec.captureGen){
        if(captureGen===rec.captureGen){
          restoreMappingEnabledAfterRecordCancel(m);
          rec.snapshot=null;
          rec.mappingId='';
          renderRecordCancelBar();
        }
        return false;
      }
      setRecording('trigger');
      updateRecordingPreview('trigger','');
      notifyOnboardingRecordingPreview('trigger','');
      var triggerState=$('triggerState');
      if(triggerState) triggerState.textContent=t('triggerRecordHint');
      rec.timer=setTimeout(function(){
        if(rec.mode==='trigger'){ cancelRecording(); hooks().pushLog(t('logTimeout')); }
      },30000);
      return true;
    });
  }

  function agentBindingCaptureChord(chord, sourceKey, source){
    var raw = String(chord || '').trim();
    var src = String(sourceKey || '').trim();
    if ((!raw || raw === 'AutoTrigger') && src) return src;
    if (raw) return raw;
    var evt = source && Array.isArray(source.rawEvents) && source.rawEvents[0];
    return String((evt && (evt.hotkey || evt.key || evt.code)) || '').trim();
  }

  function commitAgentBindingCapture(chord, sourceKey, source){
    var cap=rec.agentBindingCapture;
    var k=agentBindingCaptureChord(chord, sourceKey, source);
    if(!cap||!k) return false;
    rec.agentBindingCapture=null;
    var m=OneToneMappingCore.recording()||OneToneMappingCore.byId(cap.mappingId)||OneToneMappingCore.selected();
    armLocalCaptureGuard();
    clearRecTimer();
    rec.snapshot=null;
    rec.mappingId='';
    clearRecordMappingGuard();
    setRecording('none');
    restoreMappingEnabledAfterRecordCancel(m);
    renderRecordCancelBar();
    if(recordingInput()&&recordingInput().clearReconcileWatchdog){
      recordingInput().clearReconcileWatchdog();
    }
    hooks().pushLog(t('logTriggerDone')+hooks().friendlyKeyName(k));
    if(cap.onDone) cap.onDone(k);
    void invokeStopRecording();
    return true;
  }

  function startAgentBindingRecord(mappingId,opts){
    opts=opts||{};
    if(rec.mode!=='none'||rec.startPending) return Promise.resolve(false);
    if(blockIfAcousticCalibrating()) return Promise.resolve(false);
    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close) global.OneToneTargetKeyPicker.close();
    hooks().ensureConfig();
    var pin=String(mappingId||'').trim();
    hooks().resetTargetCapture();
    rec.mappingId=pin||state.selectedMappingId||'';
    rec.agentBindingCapture={
      mappingId:rec.mappingId,
      onDone:typeof opts.onDone==='function'?opts.onDone:null,
      onCancel:typeof opts.onCancel==='function'?opts.onCancel:null
    };
    hooks().armTriggerLeftClickIgnore(900);
    rec.captureGen++;
    var captureGen=rec.captureGen;
    var m=OneToneMappingCore.byId(rec.mappingId)||OneToneMappingCore.selected();
    rec.startPending=true;
    hooks().pushLog('[record] start agent binding mapping='+String(rec.mappingId||''));
    hooks().pushLog(t('logStartTrigger'));
    return disableMappingForRecordingAsync(m).then(function(){
      return invokeStartRecording(rec.mappingId,'agentBinding');
    }).then(function(ok){
      rec.startPending=false;
      if(!ok){
        var onCancel=rec.agentBindingCapture&&rec.agentBindingCapture.onCancel;
        rec.agentBindingCapture=null;
        restoreMappingEnabledAfterRecordCancel(m);
        rec.mappingId='';
        renderRecordCancelBar();
        if(onCancel) onCancel();
        return false;
      }
      if(captureGen!==rec.captureGen){
        restoreMappingEnabledAfterRecordCancel(m);
        rec.agentBindingCapture=null;
        rec.mappingId='';
        renderRecordCancelBar();
        return false;
      }
      setRecording('agentBinding');
      updateRecordingPreview('agentBinding','');
      var triggerState=$('triggerState');
      var targetState=$('targetState');
      var hint=t('agentCapRecording','按下快捷键…');
      if(triggerState) triggerState.textContent=hint;
      if(targetState) targetState.textContent=hint;
      rec.timer=setTimeout(function(){
        if(rec.mode==='agentBinding'&&rec.agentBindingCapture){ cancelRecording(); hooks().pushLog(t('logTimeout')); }
      },30000);
      return ok;
    });
  }

  function startTargetRecord(pinnedMappingId){
    var picker=global.OneToneKeysChannelCommandPicker;
    if(picker&&picker.hasSelection&&picker.hasSelection()&&picker.recordSelected){
      return Promise.resolve(picker.recordSelected()).then(function(){ return true; });
    }
    var capUi=global.OneToneAgentCapabilityUi;
    if(capUi&&capUi.activeCodexMapping&&capUi.activeCodexMapping()){
      if(capUi.recordSelectedSlot) capUi.recordSelectedSlot();
      return Promise.resolve(true);
    }
    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close) global.OneToneTargetKeyPicker.close();
    if(rec.mode!=='none'||rec.startPending) return Promise.resolve(false);
    if(blockIfAcousticCalibrating()) return Promise.resolve(false);
    hooks().ensureConfig();
    const pin=String(pinnedMappingId||'').trim();
    hooks().resetTargetCapture();
    const fallback=(OneToneMappingCore.selected()&&OneToneMappingCore.selected().id)
      ||(state.config&&state.config.mappings&&state.config.mappings[0]&&state.config.mappings[0].id)
      ||'';
    if(pin){
      state.selectedMappingId=pin;
    }else if(!state.selectedMappingId&&fallback){
      state.selectedMappingId=fallback;
    }
    rec.mappingId=pin||state.selectedMappingId||fallback||'';
    beginRecordSnapshot();
    hooks().armTargetLeftClickIgnore(900);
    rec.captureGen++;
    const captureGen=rec.captureGen;
    const m=OneToneMappingCore.recording();
    rec.startPending=true;
    hooks().pushLog('[record] start target mapping='+String(rec.mappingId||''));
    hooks().pushLog(t('logStartTarget'));
    return disableMappingForRecordingAsync(m).then(function(){
      return invokeStartRecording(rec.mappingId,'target');
    }).then(function(ok){
      rec.startPending=false;
      if(!ok||captureGen!==rec.captureGen){
        if(captureGen===rec.captureGen){
          restoreMappingEnabledAfterRecordCancel(m);
          rec.snapshot=null;
          rec.mappingId='';
          renderRecordCancelBar();
        }
        return false;
      }
      setRecording('target');
      hooks().armTargetLeftClickIgnore(360);
      updateRecordingPreview('target','');
      notifyOnboardingRecordingPreview('target','');
      rec.timer=setTimeout(function(){
        if(rec.mode==='target'){ cancelRecording(); hooks().pushLog(t('logTimeout')); }
      },30000);
      return true;
    });
  }

  function applyBackendKeyCapture(msg){
    const mappingId=msg.mappingId||'';
    const m=OneToneMappingCore.byId(mappingId)||OneToneMappingCore.recording()||OneToneMappingCore.selected();
    if(!m) return false;
    const mode=msg.mode||'trigger';
    const key=msg.key||'';
    if(mode==='target'){
      const combo=hooks().sanitizeTargetCombo(key);
      if(!combo) return false;
      if(!hooks().isAllowedTargetKey(combo)){ return false; }
      if(global.OneToneAppTargetPresets && global.OneToneAppTargetPresets.applyRecordedVoiceShortcut){
        global.OneToneAppTargetPresets.applyRecordedVoiceShortcut(m, combo);
      }else{
        m.targetKey=combo;
      }
      if(OneToneMappingCore.isSelected(m.id)) hooks().setEditorTargetKey(m.targetKey);
    }else{
      const trig=hooks().normalizeTriggerKey(key);
      const rawSourceKey=String(msg.sourceKey||'').trim();
      if(!hooks().isAllowedTriggerKey(key||trig)) return false;
      if(rawSourceKey&&!hooks().isAllowedTriggerKey(rawSourceKey)) return false;
      if(!hooks().isAllowedTriggerKey(trig)) return false;
      if(hooks().shouldIgnoreTriggerLeftClickCapture(key||trig,rawSourceKey||trig,msg.source||null)) return false;
      if(rec.agentBindingCapture) return commitAgentBindingCapture(trig, rawSourceKey, msg.source||null);
      m.triggerKey=trig;
      if(msg.source) m.triggerSource=msg.source;
      else if(trig!=='AutoTrigger') m.triggerSource=null;
      m.sourceKey=msg.sourceKey||(msg.source&&msg.source.rawEvents&&msg.source.rawEvents[0]&&msg.source.rawEvents[0].hotkey)||trig;
      m.sourceTime=msg.sourceTime||'';
      if(OneToneMappingCore.isSelected(m.id)) hooks().setEditorTriggerKey(trig);
    }
    m.label=(OneToneMappingCore.editorTrigger(m)||'?')+' → '+(OneToneMappingCore.editorTarget(m)||'?');
    return true;
  }

  function previewCaptureKey(mode,key){
    const raw=String(key||'').trim();
    if(!raw) return '';
    if(mode==='trigger'||mode==='agentBinding') return hooks().normalizeTriggerKey(raw);
    const media=hooks().normalizeMediaTargetKey(raw,raw);
    if(media) return media;
    return hooks().sanitizeTargetCombo(raw)||raw;
  }

  function isHardwareDelegatedTriggerKey(key,code){
    const k=String(key||'');
    const c=String(code||'');
    const blob=(k+' '+c).toLowerCase().replace(/_/g,'');
    return blob.indexOf('volume')>=0||blob.indexOf('audiovolume')>=0
      ||blob.indexOf('media')>=0||blob.indexOf('browser')>=0
      ||blob.indexOf('launch')>=0||/^f1[3-9]$|^f2[0-4]$/.test(blob.replace(/\s/g,''));
  }

  function shortcutRejectedToast(key){
    const util=global.OneToneAppKeyUtils;
    if(util&&util.containsLeftMouseToken&&util.containsLeftMouseToken(key)){
      hooks().toast(t('leftMouseRejected'));
    }else{
      hooks().toast(t('triggerRejected'));
    }
  }

  function isBackendOwnedHardwareTrigger(key){
    const k=String(key||'').trim();
    if(!k) return false;
    const physical=hooks().normalizeMediaTargetKey(k,k)||k;
    if(k==='AutoTrigger'||physical==='AutoTrigger') return true;
    if(k==='XButton1'||k==='XButton2'||physical==='XButton1'||physical==='XButton2') return true;
    if(k==='Browser_Back'||k==='Browser_Forward'||physical==='Browser_Back'||physical==='Browser_Forward') return true;
    const vol=/^Volume_(Up|Down|Mute)$|^AudioVolume(Up|Down|Mute)?$/i;
    return vol.test(k)||vol.test(physical);
  }

  function finishTriggerCapture(key, source, sourceKey, sourceTime, opts){
    if(rec.mode!=='trigger') return false;
    const backendCommitted=!!(opts&&opts.backendCommitted);
    if(recordingInput()&&recordingInput().clearReconcileWatchdog){
      recordingInput().clearReconcileWatchdog();
    }
    const rawKey=String(key||'').trim();
    const rawSourceKey=String(sourceKey||'').trim();
    var k=hooks().normalizeTriggerKey(key);
    // BT volume often arrives as RAlt while 02 识别 is also RAlt. Recording
    // trigger must not silently echo-reject — fold to AutoTrigger instead.
    if(k==='RAlt'){
      k='AutoTrigger';
    }
    if(hooks().shouldIgnoreTriggerLeftClickCapture(rawKey||k,rawSourceKey||rawKey||k,source)) return false;
    const m=OneToneMappingCore.recording()||OneToneMappingCore.byId(rec.mappingId)||OneToneMappingCore.selected();
    if(m){
      const tgt=hooks().normalizeTriggerKey(OneToneMappingCore.editorTarget(m)||m.targetKey||'');
      if(tgt&&k&&tgt===k){
        hooks().toast(t('recordTriggerMatchesTarget','这是「语音快捷键」，不能用作触发键。请按鼠标侧键或蓝牙音量键，或先在右侧修改识别键。'));
        return false;
      }
    }
    if(!hooks().isAllowedTriggerKey(rawKey||k)){ shortcutRejectedToast(rawKey||k); return false; }
    if(rawSourceKey&&!hooks().isAllowedTriggerKey(rawSourceKey)){ shortcutRejectedToast(rawSourceKey); return false; }
    if(!hooks().isAllowedTriggerKey(k)){ shortcutRejectedToast(k); return false; }
    if(!m) return false;
    var capUi=global.OneToneAgentCapabilityUi;
    if(capUi&&capUi.isCodexKeysEditing&&capUi.isCodexKeysEditing()&&capUi.findChordConflict){
      var capConflict=capUi.findChordConflict(m,k,'');
      if(capConflict&&capConflict.kind==='capability'){
        hooks().toast(t('codexTriggerNotAgentKey','这是 Codex 能力快捷键，请在「02 识别」步骤的能力卡片中设置'));
        return false;
      }
    }
    if(rec.agentBindingCapture) return commitAgentBindingCapture(k, rawSourceKey, source);
    m.triggerKey=k;
    if(source){
      m.triggerSource=source;
    }else if(k!=='AutoTrigger'){
      m.triggerSource=null;
    }
    m.sourceKey=sourceKey||(source&&source.rawEvents&&source.rawEvents[0]&&source.rawEvents[0].hotkey)||k;
    m.sourceTime=sourceTime||'';
    if(OneToneMappingCore.isSelected(m.id)) hooks().setEditorTriggerKey(k);
    m.label=k+' → '+(OneToneMappingCore.editorTarget(m)||'?');
    armLocalCaptureGuard();
    updateRecordingPreview('trigger',k);
    hooks().pushLog(t('logTriggerDone')+hooks().friendlyKeyName(k));
    rec.snapshot=null;
    rec.mappingId='';
    clearRecordMappingGuard();
    clearRecTimer();
    setRecording('none');
    if(!backendCommitted) hooks().save();
    hooks().render();
    if(global.OneToneVoiceTab2Mvp&&global.OneToneVoiceTab2Mvp.renderHero){
      global.OneToneVoiceTab2Mvp.renderHero();
    }
    try{
      var Motion=global.OneToneMotion;
      var trigBtn=$('btnRecordTrigger');
      if(Motion&&Motion.playOnce&&trigBtn) Motion.playOnce(trigBtn,'ot-sparkle-once');
    }catch(_){}
  notifyOnboardingCapture('trigger',{
      mode:'trigger',
      mappingId:m.id,
      key:k,
      source:source||null,
      sourceKey:m.sourceKey,
      sourceTime:m.sourceTime
  });
  if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.onTriggerCaptured){
    global.OneToneHabitTriggerSetup.onTriggerCaptured({mappingId:m.id,key:k});
  }
  if(rec.suppressAutoEnableOnce){
    rec.suppressAutoEnableOnce=false;
  }else{
    hooks().maybeEnableMappingAfterComplete(m);
  }
    if(!backendCommitted) void invokeStopRecording();
    return true;
  }

  function finishFrontendTriggerCapture(combo){
    const normalized=hooks().normalizeTriggerKey(combo);
    finishTriggerCapture(normalized, null, normalized, String(Date.now()));
  }

  function isHardwareCaptureToken(key){
    const k=String(key||'');
    const physical=hooks().normalizeMediaTargetKey(k,k)||k;
    if(k.startsWith('Gamepad_')||k.startsWith('HID_')) return true;
    if(physical.startsWith('Gamepad_')||physical.startsWith('HID_')) return true;
    if(/^VK_[0-9A-Fa-f]{2}$/.test(k)||/^VK_[0-9A-Fa-f]{2}$/.test(physical)) return true;
    return k==='Volume_Up' || k==='Volume_Down' || k==='Volume_Mute'
      || k==='AudioVolumeUp' || k==='AudioVolumeDown' || k==='AudioVolumeMute'
      || k==='AudioVolume_Up' || k==='AudioVolume_Down' || k==='AudioVolume_Mute'
      || k==='VolumeUp' || k==='VolumeDown' || k==='VolumeMute'
      || physical==='Volume_Up' || physical==='Volume_Down' || physical==='Volume_Mute'
      || k==='XButton1' || k==='XButton2'
      || k==='BrowserBack' || k==='BrowserForward' || k==='BrowserRefresh'
      || k==='Media_Next' || k==='Media_Prev' || k==='Media_Play_Pause' || k==='Media_Stop'
      || k==='Browser_Back' || k==='Browser_Forward' || k==='Browser_Refresh'
      || k==='Launch_Mail' || k==='Launch_App1' || k==='Launch_App2';
  }

  function resolveHardwareTriggerFromSeen(seen){
    const raw=String(seen||'').trim();
    if(!raw) return '';
    if(isHardwareCaptureToken(raw)) return hooks().normalizeMediaTargetKey(raw,raw)||raw;
    if(raw.indexOf('+')<0) return '';
    const parts=raw.split('+').map(function(p){ return p.trim(); }).filter(Boolean);
    for(let i=parts.length-1;i>=0;i--){
      const p=parts[i];
      if(isHardwareCaptureToken(p)) return hooks().normalizeMediaTargetKey(p,p)||p;
    }
    return '';
  }

  function finishDetectedHardwareTriggerCapture(key, device){
    if(rec.peripheralFinishing) return;
    const raw=String(key||'').trim();
    const physical=hooks().normalizeMediaTargetKey(raw,raw)||raw;
    if(!physical) return;
    if(hooks().shouldIgnoreTriggerLeftClickCapture(physical, physical, null)){
      hooks().pushLog('[record] ignore trigger-start left click');
      return;
    }
    if(!hooks().isAllowedTriggerKey(physical)){
      shortcutRejectedToast(physical);
      return;
    }
    rec.peripheralFinishing=true;
    try{
      if(global.OneToneRecordProbe) global.OneToneRecordProbe.push('fe','finish',physical, device||'');
      hooks().armTriggerPeripheralGuard(450);
      const source=hooks().buildPeripheralTriggerSource(physical, device);
      const display=(physical==='Volume_Up'||physical==='Volume_Down'||physical==='Volume_Mute')?'AutoTrigger':physical;
      finishTriggerCapture(display, source, physical, String(Date.now()));
    }finally{
      rec.peripheralFinishing=false;
    }
  }

  function rejectTargetCapture(){
    if(rec.mode!=='target') return;
    updateRecordingPreview('target','');
    notifyOnboardingRecordingPreview('target','');
  }

  function commitTargetCapture(combo, mappingId){
    if(rec.mode!=='target') return false;
    combo=hooks().sanitizeTargetCombo(combo);
    if(!combo) return false;
    if(!hooks().isAllowedTargetKey(combo)){
      hooks().toast(t('leftMouseRejected'));
      return false;
    }
    const m=OneToneMappingCore.byId(mappingId)||OneToneMappingCore.recording();
    if(!m) return false;
    if(global.OneToneTargetKeyApply&&global.OneToneTargetKeyApply.applyCustomMappingTarget){
      global.OneToneTargetKeyApply.applyCustomMappingTarget(combo,{source:'record',mapping:m,skipPersist:true});
    }else if(global.OneToneAppTargetPresets && global.OneToneAppTargetPresets.applyRecordedVoiceShortcut){
      global.OneToneAppTargetPresets.applyRecordedVoiceShortcut(m, combo);
    }else{
      m.targetKey=combo;
      m.imePresetId='';
      m.appTargetId='';
    }
    if(OneToneMappingCore.isSelected(m.id)) hooks().setEditorTargetKey(m.targetKey);
    armLocalCaptureGuard();
    updateRecordingPreview('target',combo);
    var wasNewDraft=hooks().getPendingNewDraftId()===m.id;
    if(wasNewDraft) hooks().setPendingNewDraftId(null);
    hooks().pushLog(t('logTargetDone')+hooks().friendlyKeyName(combo));
    rec.snapshot=null;
    rec.mappingId='';
    clearRecordMappingGuard();
    clearRecTimer();
    setRecording('none');
    hooks().resetTargetCapture();
    hooks().save();
    hooks().render();
    try{
      var Motion=global.OneToneMotion;
      var tgtBtn=$('btnRecordTarget');
      if(Motion&&Motion.playOnce&&tgtBtn) Motion.playOnce(tgtBtn,'ot-sparkle-once');
    }catch(_){}
    notifyOnboardingCapture('target',{
      mode:'target',
      mappingId:m.id,
      key:combo
    });
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.onTargetCaptured){
      global.OneToneHabitTriggerSetup.onTargetCaptured({mappingId:m.id,key:combo});
    }
    if(rec.suppressAutoEnableOnce){
      rec.suppressAutoEnableOnce=false;
    }else{
      hooks().maybeEnableMappingAfterComplete(m);
    }
    if(wasNewDraft&&OneToneMappingCore.isSaved(m)&&global.OneToneSceneActivate){
      global.OneToneSceneActivate.activateScene(m.id);
    }
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
    void invokeStopRecording();
    return true;
  }

  function finishTargetCapture(combo, mappingId){
    if(rec.mode!=='target') return false;
    combo=hooks().sanitizeTargetCombo(combo);
    if(!combo) return false;
    if(!hooks().isAllowedTargetKey(combo)){
      hooks().toast(t('leftMouseRejected'));
      return false;
    }
    var ignoreTarget=hooks().shouldIgnoreTargetLeftClickCapture;
    if(!ignoreTarget&&global.OneToneAppKeyUtils){
      ignoreTarget=global.OneToneAppKeyUtils.shouldIgnoreTargetLeftClickCapture;
    }
    if(ignoreTarget&&ignoreTarget(combo,combo,null)) return false;
    const m=OneToneMappingCore.byId(mappingId)||OneToneMappingCore.recording();
    if(!m) return false;
    var hook=rec.beforeFinishTargetHook;
    if(hook){
      void Promise.resolve(hook(combo, mappingId, m)).then(function(ok){
        if(rec.mode!=='target') return;
        if(!ok){
          rejectTargetCapture();
          return;
        }
        commitTargetCapture(combo, mappingId);
      });
      return true;
    }
    return commitTargetCapture(combo, mappingId);
  }

  function setBeforeFinishTargetHook(fn){
    rec.beforeFinishTargetHook=typeof fn==='function'?fn:null;
  }

  global.OneToneMappingRecording={
    mode:function(){ return rec.mode; }, setMode:function(v){ rec.mode=v; },
    previewKey:function(){ return rec.previewKey||''; },
    mappingId:function(){ return rec.mappingId; }, setMappingId:function(v){ rec.mappingId=v; },
    setSuppressAutoEnableOnce:function(v){ rec.suppressAutoEnableOnce=!!v; },
    wasEnabledBeforeRecording:function(){ return !!(rec.mappingWasEnabled&&rec.mappingWasEnabled.enabled); },
    isPending:function(){ return rec.startPending; }, setPending:function(v){ rec.startPending=v; },
    clearTimer:clearRecTimer, setTimer:function(fn,ms){ clearRecTimer(); rec.timer=setTimeout(fn,ms); },
    cancel:cancelRecording, cancelDraftOrRecording:cancelDraftOrRecording,
    disableForRecordingAsync:disableMappingForRecordingAsync,     setRecording:setRecording,
    ipcPhase:function(){ return rec.ipcPhase||(global.__otRecordIpcPhase||'idle'); },
    isRecordingUi:function(){
      var life=global.OneToneRecordIpcLifecycle;
      var phase=rec.ipcPhase||(global.__otRecordIpcPhase||'idle');
      if(life&&life.isRecordingUi) return !!life.isRecordingUi(rec.mode,phase);
      return rec.mode&&rec.mode!=='none';
    },
    startTrigger:startTriggerRecord, startTarget:startTargetRecord,
    startAgentBinding:startAgentBindingRecord,
    startNativeRestore:startNativeRestoreRecord, finishNativeRestore:finishNativeRestoreCapture,
    startSchemeSwitch:startSchemeSwitchRecord, finishSchemeSwitch:finishSchemeSwitchCapture,
    startMappingSwitch:startMappingSwitchRecord, finishMappingSwitch:finishMappingSwitchCapture,
    applyRecordingUi:applyKeyWakeRecordingUi, renderCancelBar:renderRecordCancelBar,
    buildRecordCancelBarModel:buildRecordCancelBarModel,
    updatePreview:updateRecordingPreview, armLocalCaptureGuard:armLocalCaptureGuard,
    notifyOnboardingCapture:notifyOnboardingCapture, notifyOnboardingPreview:notifyOnboardingRecordingPreview,
    clearMappingGuard:clearRecordMappingGuard, beginSnapshot:beginRecordSnapshot,
    clearSnapshot:function(){ rec.snapshot=null; }, bumpCaptureGen:function(){ rec.captureGen++; return rec.captureGen; },
    captureGen:function(){ return rec.captureGen; }, invokeStart:invokeStartRecording, invokeStop:invokeStopRecording,
    clearSchemeSwitch:clearSchemeSwitchKey,
    applyBackendKeyCapture:applyBackendKeyCapture,
    previewCaptureKey:previewCaptureKey,
    isHardwareDelegatedTriggerKey:isHardwareDelegatedTriggerKey,
    isHardwareCaptureToken:isHardwareCaptureToken,
    isBackendOwnedHardwareTrigger:isBackendOwnedHardwareTrigger,
    resolveHardwareTriggerFromSeen:resolveHardwareTriggerFromSeen,
    finishTrigger:finishTriggerCapture,
    finishAgentBinding:commitAgentBindingCapture,
    finishFrontendTrigger:finishFrontendTriggerCapture,
    finishDetectedHardwareTrigger:finishDetectedHardwareTriggerCapture,
    finishTarget:finishTargetCapture,
    rejectTargetCapture:rejectTargetCapture,
    setBeforeFinishTargetHook:setBeforeFinishTargetHook
  };
})((typeof window!=='undefined')?window:globalThis);
