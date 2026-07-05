(function(global){
  'use strict';
  var OneToneMappingCore=global.OneToneMappingCore;
  var OneToneI18n=global.OneToneI18n;
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_mapping_recording_hooks__ || {}; }
  var rec={ mode:'none',startPending:false,timer:0,mappingId:'', snapshot:null,mappingWasEnabled:null,nativeRestoreSnapshot:null, schemeSwitchSnapshot:'',captureGen:0 };
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
    m.enabled=false;
    try{ window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:false}); }catch(_){}
  }

  function disableMappingForRecordingAsync(m){
    return new Promise(function(resolve){
      if(!m||!m.id){ resolve(); return; }
      rec.mappingWasEnabled={id:m.id,enabled:!!m.enabled};
      if(!m.enabled){ resolve(); return; }
      m.enabled=false;
      const invoke=window.__vp_invoke__;
      if(invoke){
        invoke('cmd_mapping_toggle',{id:m.id,enabled:false}).then(function(){ resolve(); }).catch(function(){
          try{ window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:false}); }catch(_){}
          resolve();
        });
        return;
      }
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
      m.enabled=true;
      try{ window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:true}); }catch(_){}
    }
    clearRecordMappingGuard();
  }

  function cancelRecording(){
    if(rec.mode==='none') return;
    const draftId=state.selectedMappingId;
    clearRecTimer();
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
    const label=normalized?hooks().friendlyKeyName(normalized):(mode==='trigger'?d.triggerPlaceholder:d.targetPlaceholder);
    if(mode==='trigger'){
      const el=$('triggerView');
      const disp=$('triggerDisplay');
      if(el) el.textContent=label;
      if(disp) disp.classList.toggle('empty',!normalized);
    }else if(mode==='target'){
      const el=$('targetView');
      const disp=$('targetDisplay');
      if(el) el.textContent=label;
      if(disp) disp.classList.toggle('empty',!normalized);
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
    hooks().pushLog((hooks().getAppLang()==='zh'?'方案轮换键: ':'scheme switch: ')+hooks().friendlyKeyName(combo));
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
    hooks().pushLog((hooks().getAppLang()==='zh'?'方案直达键: ':'switch key: ')+hooks().friendlyKeyName(k));
  }
  function applyKeyWakeRecordingUi(){
    const keySettings=$('keyWakeSettings');
    const triggerBtn=$('btnRecordTrigger');
    const targetBtn=$('btnRecordTarget');
    const homeCard=$('homeKeyMapCard');
    const recording=rec.mode==='trigger'||rec.mode==='target';
    if(keySettings) keySettings.classList.toggle('is-recording',recording);
    if(homeCard) homeCard.classList.toggle('is-recording',recording);
    if(triggerBtn){
      triggerBtn.classList.toggle('is-recording',rec.mode==='trigger');
    }
    if(targetBtn){
      targetBtn.classList.toggle('is-recording',rec.mode==='target');
    }
    const onboardTriggerBtn=$('btnOnboardStartTriggerRecord');
    const onboardTargetBtn=$('btnOnboardStartTargetRecord');
    const onboardTriggerCard=$('onboardTriggerCard');
    const onboardTargetCard=$('onboardTargetCard');
    if(onboardTriggerBtn) onboardTriggerBtn.classList.toggle('is-recording',rec.mode==='trigger');
    if(onboardTargetBtn) onboardTargetBtn.classList.toggle('is-recording',rec.mode==='target');
    if(onboardTriggerCard) onboardTriggerCard.classList.toggle('is-recording',rec.mode==='trigger');
    if(onboardTargetCard) onboardTargetCard.classList.toggle('is-recording',rec.mode==='target');
    if(window.OneToneOnboarding&&window.OneToneOnboarding.syncRecordingUi) window.OneToneOnboarding.syncRecordingUi();
    if(hooks().ui().drawerOpen&&hooks().ui().settingsPanel==='keyWake') hooks().syncKeySchemeTimeline(hooks().schemeStepFocus());
  }

  function renderRecordCancelBar(){
    const bar=$('recordCancelBar');
    const btn=$('btnCancelRecord');
    if(!bar) return;
    const m=OneToneMappingCore.selected();
    const showDraft=m&&OneToneMappingCore.isDraft(m);
    const show=rec.mode!=='none'||showDraft;
    bar.classList.toggle('show',show);
    if(btn) btn.textContent=rec.mode!=='none'?t('cancelRecord'):t('cancelDraft');
  }

  function setRecording(mode,opts){
    opts=opts||{};
    rec.mode=mode;
    clearRecTimer();
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
    if(opts.silent||hooks().uiBootstrapping()) return;
    hooks().updatePrimaryCTA();
    hooks().renderHeroBadges();
    hooks().renderHome();
    hooks().renderMicDevices();
    renderRecordCancelBar();
    hooks().renderAddButton();
  }

  function invokeRecordingCommand(cmd,args){
    const invoke=window.__vp_invoke__;
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

  function startTriggerRecord(){
    if(rec.mode!=='none'||rec.startPending) return Promise.resolve(false);
    hooks().ensureConfig();
    beginRecordSnapshot();
    hooks().resetTargetCapture();
    hooks().armTriggerLeftClickIgnore(900);
    rec.captureGen++;
    const captureGen=rec.captureGen;
    const fallback=(OneToneMappingCore.selected()&&OneToneMappingCore.selected().id)
      ||(state.config&&state.config.mappings&&state.config.mappings[0]&&state.config.mappings[0].id)
      ||'';
    if(!state.selectedMappingId&&fallback) state.selectedMappingId=fallback;
    rec.mappingId=state.selectedMappingId||fallback||'';
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

  function startTargetRecord(){
    if(rec.mode!=='none'||rec.startPending) return Promise.resolve(false);
    hooks().ensureConfig();
    beginRecordSnapshot();
    hooks().resetTargetCapture();
    rec.captureGen++;
    const captureGen=rec.captureGen;
    const fallback=(OneToneMappingCore.selected()&&OneToneMappingCore.selected().id)
      ||(state.config&&state.config.mappings&&state.config.mappings[0]&&state.config.mappings[0].id)
      ||'';
    if(!state.selectedMappingId&&fallback) state.selectedMappingId=fallback;
    rec.mappingId=state.selectedMappingId||fallback||'';
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
      if(global.OneToneAppTargetPresets && global.OneToneAppTargetPresets.applyRecordedVoiceShortcut){
        global.OneToneAppTargetPresets.applyRecordedVoiceShortcut(m, combo);
      }else{
        m.targetKey=combo;
      }
      if(OneToneMappingCore.isSelected(m.id)) hooks().setEditorTargetKey(m.targetKey);
    }else{
      const trig=hooks().normalizeTriggerKey(key);
      if(!hooks().isAllowedTriggerKey(trig)) return false;
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
    if(mode==='trigger') return hooks().normalizeTriggerKey(raw);
    const media=hooks().normalizeMediaTargetKey(raw,raw);
    if(media) return media;
    return hooks().sanitizeTargetCombo(raw)||raw;
  }

  function isHardwareDelegatedTriggerKey(key,code){
    const k=String(key||'');
    const c=String(code||'');
    const blob=(k+' '+c).toLowerCase();
    return blob.indexOf('volume')>=0||blob.indexOf('audiovolume')>=0
      ||blob.indexOf('media_')>=0||blob.indexOf('browser_')>=0
      ||blob.indexOf('launch_')>=0||/^f1[3-9]$|^f2[0-4]$/.test(blob.replace(/\s/g,''));
  }

  function finishTriggerCapture(key, source, sourceKey, sourceTime){
    if(rec.mode!=='trigger') return false;
    const k=hooks().normalizeTriggerKey(key);
    if(!hooks().isAllowedTriggerKey(k)){ hooks().toast(t('triggerRejected')); return false; }
    const m=OneToneMappingCore.recording();
    if(!m) return false;
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
    hooks().save();
    hooks().render();
    notifyOnboardingCapture('trigger',{
      mode:'trigger',
      mappingId:m.id,
      key:k,
      source:source||null,
      sourceKey:m.sourceKey,
      sourceTime:m.sourceTime
    });
    hooks().maybeEnableMappingAfterComplete(m);
    try{window.chrome?.webview?.postMessage({type:'mvp_stop_recording'});}catch(_){ }
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
    return k==='Volume_Up' || k==='Volume_Down' || k==='Volume_Mute'
      || k==='AudioVolumeUp' || k==='AudioVolumeDown' || k==='AudioVolumeMute'
      || k==='VolumeUp' || k==='VolumeDown' || k==='VolumeMute'
      || physical==='Volume_Up' || physical==='Volume_Down' || physical==='Volume_Mute'
      || k==='Media_Next' || k==='Media_Prev' || k==='Media_Play_Pause' || k==='Media_Stop'
      || k==='Browser_Back' || k==='Browser_Forward' || k==='Browser_Refresh'
      || k==='Launch_Mail' || k==='Launch_App1' || k==='Launch_App2';
  }

  function finishDetectedHardwareTriggerCapture(key, device){
    const raw=String(key||'').trim();
    const physical=hooks().normalizeMediaTargetKey(raw,raw)||raw;
    if(!physical) return;
    if(hooks().shouldIgnoreTriggerLeftClickCapture(physical, physical, null)){
      hooks().pushLog('[record] ignore trigger-start left click');
      return;
    }
    hooks().armTriggerPeripheralGuard(450);
    const source=hooks().buildPeripheralTriggerSource(physical, device);
    const display=(physical==='Volume_Up'||physical==='Volume_Down'||physical==='Volume_Mute')?'AutoTrigger':physical;
    finishTriggerCapture(display, source, physical, String(Date.now()));
  }

  function finishTargetCapture(combo, mappingId){
    if(rec.mode!=='target') return false;
    combo=hooks().sanitizeTargetCombo(combo);
    if(!combo) return false;
    const m=OneToneMappingCore.byId(mappingId)||OneToneMappingCore.recording();
    if(!m) return false;
    if(global.OneToneAppTargetPresets && global.OneToneAppTargetPresets.applyRecordedVoiceShortcut){
      global.OneToneAppTargetPresets.applyRecordedVoiceShortcut(m, combo);
    }else{
      m.targetKey=combo;
      m.imePresetId='';
      m.appTargetId='';
    }
    if(OneToneMappingCore.isSelected(m.id)) hooks().setEditorTargetKey(m.targetKey);
    var labelTarget=(global.OneToneMappingCore.editorTarget&&global.OneToneMappingCore.editorTarget(m))||combo;
    m.label=(OneToneMappingCore.editorTrigger(m)||'?')+' → '+labelTarget;
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
    notifyOnboardingCapture('target',{
      mode:'target',
      mappingId:m.id,
      key:combo
    });
    hooks().maybeEnableMappingAfterComplete(m);
    if(wasNewDraft&&OneToneMappingCore.isSaved(m)&&global.OneToneSceneActivate){
      global.OneToneSceneActivate.activateScene(m.id);
    }
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
    try{window.chrome?.webview?.postMessage({type:'mvp_stop_recording'});}catch(_){ }
    return true;
  }

  global.OneToneMappingRecording={
    mode:function(){ return rec.mode; }, setMode:function(v){ rec.mode=v; },
    mappingId:function(){ return rec.mappingId; }, setMappingId:function(v){ rec.mappingId=v; },
    isPending:function(){ return rec.startPending; }, setPending:function(v){ rec.startPending=v; },
    clearTimer:clearRecTimer, setTimer:function(fn,ms){ clearRecTimer(); rec.timer=setTimeout(fn,ms); },
    cancel:cancelRecording, cancelDraftOrRecording:cancelDraftOrRecording,
    disableForRecordingAsync:disableMappingForRecordingAsync, setRecording:setRecording,
    startTrigger:startTriggerRecord, startTarget:startTargetRecord,
    startNativeRestore:startNativeRestoreRecord, finishNativeRestore:finishNativeRestoreCapture,
    startSchemeSwitch:startSchemeSwitchRecord, finishSchemeSwitch:finishSchemeSwitchCapture,
    startMappingSwitch:startMappingSwitchRecord, finishMappingSwitch:finishMappingSwitchCapture,
    applyRecordingUi:applyKeyWakeRecordingUi, renderCancelBar:renderRecordCancelBar,
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
    finishTrigger:finishTriggerCapture,
    finishFrontendTrigger:finishFrontendTriggerCapture,
    finishDetectedHardwareTrigger:finishDetectedHardwareTriggerCapture,
    finishTarget:finishTargetCapture
  };
})((typeof window!=='undefined')?window:globalThis);
