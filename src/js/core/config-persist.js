(function(global){
  'use strict';
  function hooks(){ return global.__vp_config_persist_hooks__ || {}; }
  function state(){ return global.OneToneState.state; }
  var configLoadedFromBackend=false;
  var configBootstrapWatchdog=0;
  var mvpInitRenderSerial=0;
  var lastMvpInitKey='';
  var lastMvpInitAt=0;
  var pendingMvpInitMsg=null;
  /** Serialize cmd_save so a stale in-flight payload cannot wipe newer app scenarios. */
  var saveInFlight=null;
  var saveNeedsRerun=false;
  var pendingSaveSource='unknown';
  var saveWaiters=[];
  /** Survives partial FE state: re-inject app scenarios omitted from mappings[] unless trashed. */
  var lastKnownAppScenarios={};
  /** Survives incomplete FE cameraPrefs during quiet save (prevents wiping calib / bindings). */
  var lastKnownCameraPrefs=null;
  var APP_SCENARIO_BACKUP_KEY='onetone.appScenarios.v1';
  var deferredMvpInitSideEffects=false;
  var lastSaveCompletedAt=0;
  var suppressUnknownSaveUntil=0;

  function bootSettling(){
    var s=global.OneToneAppSession;
    return !!(s&&s.isBootSettling&&s.isBootSettling());
  }

  function scheduleDeferredMvpInitSideEffects(){
    deferredMvpInitSideEffects=true;
    // First flush after boot should cold-start camera later (getUserMedia 假死).
    try{ global.__otBootCameraCold=true; }catch(_){}
  }

  /** Full remount during Soft Pad / keys / camera open 假死's the drawer (MediaPipe + pad remount). */
  function mvpInitHeavyRemountBlocked(){
    try{
      var Pad=global.OneToneCodexMicroPadUi;
      if(Pad&&typeof Pad.isPadManagerOpen==='function'&&Pad.isPadManagerOpen()) return true;
      var modal=document.getElementById('codexMicroEditModal');
      if(modal&&!modal.hidden) return true;
      var ui=global.OneToneState&&global.OneToneState.ui;
      if(!ui||!ui.drawerOpen) return false;
      var p=ui.settingsPanel;
      if(p==='habits'&&(ui.habitView||'hub')==='hub') return true;
      return p==='softPad'||p==='keys'||p==='camera'||p==='voiceWake';
    }catch(_){ return false; }
  }

  function cancelBootCameraSchedule(opts){
    opts=opts||{};
    try{
      if(global.__otBootCamScheduleTimer){
        clearTimeout(global.__otBootCamScheduleTimer);
        global.__otBootCamScheduleTimer=0;
      }
    }catch(_){}
    // Keep cold flag so a later flush / drawer-close can still start camera once.
    if(opts.keepCold!==false){
      try{ global.__otBootCameraCold=true; }catch(_){}
    }
  }

  function runMvpInitHeavySideEffects(){
    if(mvpInitHeavyRemountBlocked()){
      deferredMvpInitSideEffects=true;
      earlyPersistLog('mvp_init heavy run re-deferred (drawer panel)');
      return;
    }
    const st=state();
    const toggleBusy=voiceToggleBusy();
    const syncEditor=hookFn('syncEditorFromSelection');
    // Off this turn — sync syncEditor on boot-settled flush used to stack with camera → 假死.
    if(syncEditor){
      setTimeout(function(){
        try{ syncEditor(); }catch(_){}
      },0);
    }
    // Camera MediaPipe / getUserMedia must NEVER run inline with applyMvpInit —
    // sync reconcile previously wedged the UI after "applyMvpInit ok" (Responding=False).
    try{
      var deferCam=function(){
        var clearCamTag=function(){
          try{
            if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag) global.OneToneUiHeartbeat.clearTag('bootCameraReconcile');
            else if(global.__otActivityTag==='bootCameraReconcile') global.__otActivityTag='';
          }catch(_){}
        };
        try{
          // Boot settled +8s camDelay lined up with voiceWake open → UI_HB_STALL_5S (seq~91).
          try{
            var uiCam=global.OneToneState&&global.OneToneState.ui;
            var paCam=global.OneToneCameraPresenceActions;
            if((uiCam&&uiCam.drawerOpen&&uiCam.settingsPanel!=='camera')||(paCam&&paCam.getState&&paCam.getState().drawerUiPaused)){
              deferredMvpInitSideEffects=true;
              try{ global.__otBootCameraCold=true; }catch(_){}
              try{
                if(global.OneToneIpc&&global.OneToneIpc.invoke){
                  global.OneToneIpc.invoke('cmd_app_log',{line:'fe bootCam defer skipped drawer'}).catch(function(){});
                }
              }catch(_){}
              return;
            }
          }catch(_){}
          try{
            if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag) global.OneToneUiHeartbeat.setTag('bootCameraReconcile');
            else global.__otActivityTag='bootCameraReconcile';
          }catch(_){}
          if(!global.OneToneCameraPresenceActions){ clearCamTag(); return; }
          if(typeof global.OneToneCameraPresenceActions.syncUiFromPrefs==='function'){
            global.OneToneCameraPresenceActions.syncUiFromPrefs();
          }
          // reconcileRuntime(config_applied) only schedules a deferred start — do not
          // keep bootCameraReconcile tagged across getUserMedia (that path 假死'd).
          if(typeof global.OneToneCameraPresenceActions.reconcileRuntime==='function'){
            try{ global.OneToneCameraPresenceActions.reconcileRuntime({reason:'config_applied'}); }catch(_){}
          }
          if(global.OneToneCameraGazeCalibration&&typeof global.OneToneCameraGazeCalibration.loadFromPrefs==='function'){
            global.OneToneCameraGazeCalibration.loadFromPrefs();
          }
          clearCamTag();
        }catch(_){
          clearCamTag();
        }
      };
      var camDelay=0;
      try{
        if(global.__otBootCameraCold){
          // Never fire mid voiceWake open — settle+8s raced openDrawer → 假死.
          camDelay=4000;
          global.__otBootCameraCold=false;
        }
      }catch(_){}
      var scheduleCam=function(){
        if(typeof global.OneToneCameraPresenceActions==='object'&&
           typeof global.OneToneCameraPresenceActions.deferCameraHeavyWork==='function'){
          global.OneToneCameraPresenceActions.deferCameraHeavyWork(deferCam);
        }else{
          setTimeout(deferCam,0);
        }
      };
      cancelBootCameraSchedule({keepCold:false});
      if(camDelay>0){
        global.__otBootCamScheduleTimer=setTimeout(function(){
          global.__otBootCamScheduleTimer=0;
          scheduleCam();
        },camDelay);
      }else{
        scheduleCam();
      }
    }catch(_){}
    if(global.OneToneAppStartMinimized) global.OneToneAppStartMinimized.loadState();
    const scheduleBootMic=hookFn('scheduleBootMicReady');
    const scheduleVoiceBoot=hookFn('scheduleDeferredVoiceEngineBoot');
    if(scheduleBootMic) scheduleBootMic();
    if(scheduleVoiceBoot) scheduleVoiceBoot();
    const vw=voiceWakeApi();
    if(vw&&typeof vw.initSapiPresetsFromConfig==='function') vw.initSapiPresetsFromConfig();
    const syncVoice=hookFn('syncVoiceSettingsFromConfig');
    if(!toggleBusy&&syncVoice){
      setTimeout(function(){
        if(voiceToggleBusy()) return;
        syncVoice();
      },800);
    }
    const syncKeyWake=hookFn('syncKeyWakeSettingsFromConfig');
    if(syncKeyWake) setTimeout(syncKeyWake,1200);
    const ensureNotify=hookFn('ensureNotificationPermission');
    if(ensureNotify) setTimeout(ensureNotify,3000);
    mvpInitRenderSerial++;
    const serial=mvpInitRenderSerial;
    const ui=global.OneToneState.ui;
    const renderHome=hookFn('renderHome');
    const renderHomeLive=hookFn('renderHomeLiveZone');
    const renderUpdate=hookFn('renderUpdateUi');
    const welcomeOpen=hookFn('welcomeOpen');
    const habitSetupOpen=global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.isOpen
      &&global.OneToneHabitTriggerSetup.isOpen();
    requestAnimationFrame(function(){
      if(serial!==mvpInitRenderSerial) return;
      if(renderHome&&!habitSetupOpen) renderHome();
      if(renderHomeLive&&!habitSetupOpen) renderHomeLive();
      if(renderUpdate&&!habitSetupOpen) renderUpdate();
      if(welcomeOpen&&welcomeOpen()) return;
      if(habitSetupOpen) return;
      if(ui.drawerOpen){
        const renderEditor=hookFn('renderEditor');
        const renderListen=hookFn('renderListenRuntime');
        const mappingListUiActive=hookFn('mappingListUiActive');
        const renderMappingChrome=hookFn('renderMappingChrome');
        const renderTrash=hookFn('renderTrashList');
        const renderSapi=hookFn('renderVoiceSapiStatus');
        const renderVosk=hookFn('renderVoiceVoskStatus');
        if(renderEditor) renderEditor();
        if(renderListen) renderListen();
        if(mappingListUiActive&&mappingListUiActive()&&renderMappingChrome) renderMappingChrome();
        if(ui.settingsPanel==='general'&&renderTrash) renderTrash();
        if(ui.settingsPanel==='voiceWake'&&!toggleBusy){
          const sapiCfg=st.config.voiceSapi||st.config.voice_sapi||{};
          const voskCfg=st.config.voiceVosk||st.config.voice_vosk||{};
          if(renderSapi) renderSapi({
            enabled:!!sapiCfg.enabled,
            state:'stopped',
            phrases:Array.isArray(sapiCfg.phrases)?sapiCfg.phrases:[]
          });
          if(renderVosk) renderVosk({
            enabled:!!voskCfg.enabled,
            state:'stopped',
            phrases:Array.isArray(voskCfg.phrases)?voskCfg.phrases:[]
          });
        }
      }
    });
    const startPoll=hookFn('startVoiceStatusPoll');
    if(vw&&typeof vw.isPollStarted==='function'&&!vw.isPollStarted()&&startPoll){
      var runPoll=function(){
        if(vw.isPollStarted()) return;
        if(welcomeOpen&&welcomeOpen()) return;
        startPoll();
      };
      if(bootSettling()&&global.OneToneAppSession&&global.OneToneAppSession.whenBootSettled){
        global.OneToneAppSession.whenBootSettled(runPoll);
      }else{
        setTimeout(runPoll,welcomeOpen&&welcomeOpen()?4000:1500);
      }
    }
  }

  function flushDeferredMvpInitSideEffects(){
    if(!deferredMvpInitSideEffects) return;
    // voiceWake/keys/camera/softPad open: running heavy here stacks remount + camera
    // reconcile with the open panel and 假死'd (UI_HB_STALL empty tag, ipc="").
    // Keep the flag; closeDrawer / leaving the blocked panel will flush.
    if(mvpInitHeavyRemountBlocked()){
      earlyPersistLog('mvp_init heavy flush held (drawer panel)');
      // #region agent log
      try{
        var p=(global.OneToneState&&global.OneToneState.ui&&global.OneToneState.ui.settingsPanel)||'';
        if(global.__dbgB5) global.__dbgB5('M','config-persist.js:flush','flush held drawer open',{panel:p});
      }catch(_){}
      // #endregion
      return;
    }
    deferredMvpInitSideEffects=false;
    // #region agent log
    try{ if(global.__dbgB5) global.__dbgB5('M','config-persist.js:flush','flush running heavy',{}); }catch(_){}
    // #endregion
    runMvpInitHeavySideEffects();
  }

  function hookFn(name){
    const h=hooks();
    const fn=h&&h[name];
    return typeof fn==='function'?fn:null;
  }

  function hooksReady(){
    return !!(hookFn('newMappingId')&&hookFn('renderHome')&&hookFn('syncEditorFromSelection'));
  }

  function newRuleId(){
    return 'rule-'+Date.now()+'-'+Math.floor(Math.random()*100000);
  }

  function earlyPersistLog(line){
    try{
      if(global.OneToneEarlyLog) global.OneToneEarlyLog(String(line||''));
      else if(global.console&&console.log) console.log('[config-persist]',line);
    }catch(_){}
  }

  function normalizeMatchSpec(raw){
    if(!raw||typeof raw!=='object') return null;
    var exeNames=Array.isArray(raw.exeNames)?raw.exeNames.map(function(x){ return String(x||'').trim(); }).filter(Boolean):[];
    var pathContains=raw.pathContains!=null?String(raw.pathContains).trim():'';
    var titleContains=raw.titleContains!=null?String(raw.titleContains).trim():'';
    var fullPath=raw.fullPath!=null?String(raw.fullPath).trim():(raw.full_path!=null?String(raw.full_path).trim():'');
    if(!exeNames.length&&!pathContains&&!titleContains&&!fullPath) return null;
    var out={exeNames:exeNames};
    if(pathContains) out.pathContains=pathContains;
    if(titleContains) out.titleContains=titleContains;
    if(fullPath) out.fullPath=fullPath;
    return out;
  }

  function normalizeAppBehaviorRules(rules){
    if(!Array.isArray(rules)) return [];
    return rules.map(function(r){
      if(!r||typeof r!=='object') return null;
      var appId=String(r.appId||r.app_id||'').trim();
      if(!appId) return null;
      var ruleId=String(r.ruleId||r.rule_id||'').trim();
      if(!ruleId) ruleId=newRuleId();
      var out={
        ruleId:ruleId,
        appId:appId,
        finishMode:String(r.finishMode||r.finish_mode||'confirm').trim()||'confirm',
        note:r.note!=null?String(r.note):''
      };
      var summon=r.summonPhrase!=null?r.summonPhrase:r.summon_phrase;
      if(summon!=null&&String(summon).trim()) out.summonPhrase=String(summon).trim();
      var display=r.displayName!=null?r.displayName:r.display_name;
      if(display!=null&&String(display).trim()) out.displayName=String(display).trim();
      var matchSpec=normalizeMatchSpec(r.match);
      if(matchSpec) out.match=matchSpec;
      var icon=r.iconDataUrl!=null?r.iconDataUrl:r.icon_data_url;
      if(icon!=null&&String(icon).trim()) out.iconDataUrl=String(icon).trim();
      return out;
    }).filter(Boolean);
  }

  function serializeAppBehaviorRules(rules){
    return normalizeAppBehaviorRules(rules).map(function(r){
      var out={ruleId:r.ruleId,appId:r.appId,finishMode:r.finishMode,note:r.note||''};
      if(r.summonPhrase) out.summonPhrase=r.summonPhrase;
      if(r.displayName) out.displayName=r.displayName;
      if(r.match) out.match=r.match;
      if(r.iconDataUrl) out.iconDataUrl=r.iconDataUrl;
      return out;
    });
  }

  function newVoiceCommandId(){
    return 'cmd_'+Date.now()+'_'+Math.floor(Math.random()*100000);
  }

  var ACOUSTIC_FEATURE_DIMS=13;
  var ACOUSTIC_MAX_FEATURE_FRAMES=200;
  var ACOUSTIC_MAX_SAMPLES_PER_COMMAND=3;
  var ACOUSTIC_MAX_COMMANDS_PER_MAPPING=1;
  /** Match Rust ACOUSTIC_PREVIEW_MAX_BYTES: 16k mono int16 LE, max 1.2s. */
  var ACOUSTIC_PREVIEW_MAX_BYTES=38400;

  /** Same strategy as Rust normalize_preview_pcm_b64. */
  function normalizePreviewPcmB64(raw){
    var b64=String(raw==null?'':raw).trim();
    if(!b64) return null;
    if(!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
    var bytes;
    try{
      if(typeof Buffer!=='undefined'){
        bytes=Uint8Array.from(Buffer.from(b64,'base64'));
      }else{
        var binary=atob(b64);
        bytes=new Uint8Array(binary.length);
        for(var i=0;i<binary.length;i++) bytes[i]=binary.charCodeAt(i);
      }
    }catch(_e){
      return null;
    }
    if(bytes.length<2) return null;
    var end=bytes.length;
    if(end%2===1) end-=1;
    if(end>ACOUSTIC_PREVIEW_MAX_BYTES) end=ACOUSTIC_PREVIEW_MAX_BYTES;
    if(end!==bytes.length) bytes=bytes.subarray(0,end);
    if(typeof Buffer!=='undefined'){
      return Buffer.from(bytes).toString('base64');
    }
    var s='';
    for(var j=0;j<bytes.length;j++) s+=String.fromCharCode(bytes[j]);
    return btoa(s);
  }

  function newAcousticVoiceCommandId(){
    return 'acmd_'+Date.now()+'_'+Math.floor(Math.random()*100000);
  }

  function newAcousticVoiceSampleId(){
    return 'sample_'+Date.now()+'_'+Math.floor(Math.random()*100000);
  }

  function acousticFeatureValuesValid(feature){
    if(!Array.isArray(feature)||!feature.length) return false;
    for(var i=0;i<feature.length;i++){
      var v=Number(feature[i]);
      if(!isFinite(v)) return false;
    }
    return true;
  }

  function normalizeAcousticQualitySignals(raw){
    if(!raw||typeof raw!=='object') return null;
    var agreement=Number(raw.sampleAgreement);
    if(!isFinite(agreement)) agreement=0;
    return {
      hasSpeech:!!raw.hasSpeech,
      tooShort:!!raw.tooShort,
      tooLong:!!raw.tooLong,
      sampleAgreement:agreement
    };
  }

  function normalizeAcousticVoiceCommandSample(raw){
    if(!raw||typeof raw!=='object') return null;
    var kind=String(raw.featureKind||'mfcc-v1').trim()||'mfcc-v1';
    if(kind!=='mfcc-v1') return null;
    var dims=Number(raw.featureDims);
    if(!isFinite(dims)||dims<=0) dims=ACOUSTIC_FEATURE_DIMS;
    if(dims!==ACOUSTIC_FEATURE_DIMS) return null;
    var frames=Number(raw.featureFrames);
    if(!isFinite(frames)||frames<=0||frames>ACOUSTIC_MAX_FEATURE_FRAMES) return null;
    var feature=Array.isArray(raw.feature)?raw.feature.map(function(v){ return Number(v); }):[];
    if(feature.length!==frames*dims||!acousticFeatureValuesValid(feature)) return null;
    var durationMs=Number(raw.durationMs);
    if(!isFinite(durationMs)||durationMs<0) durationMs=0;
    var sampleRate=Number(raw.sampleRate);
    if(!isFinite(sampleRate)||sampleRate<=0) sampleRate=16000;
    var createdAt=Number(raw.createdAt);
    if(!isFinite(createdAt)) createdAt=Date.now();
    var sample={
      id:String(raw.id||'').trim()||newAcousticVoiceSampleId(),
      durationMs:Math.round(durationMs),
      feature:feature,
      featureKind:kind,
      featureFrames:Math.round(frames),
      featureDims:ACOUSTIC_FEATURE_DIMS,
      sampleRate:Math.round(sampleRate),
      createdAt:createdAt
    };
    var previewRaw=raw.previewPcmB64!=null?raw.previewPcmB64:raw.preview_pcm_b64;
    var preview=normalizePreviewPcmB64(previewRaw);
    if(preview) sample.previewPcmB64=preview;
    var qs=normalizeAcousticQualitySignals(raw.qualitySignals);
    if(qs) sample.qualitySignals=qs;
    return sample;
  }

  function normalizeAcousticVoiceCommand(raw,scenarioId){
    if(!raw||typeof raw!=='object') return null;
    var quality=String(raw.quality||'').trim();
    if(quality!=='good'&&quality!=='ok') return null;
    var samples=Array.isArray(raw.samples)
      ?raw.samples.map(normalizeAcousticVoiceCommandSample).filter(Boolean).slice(0,ACOUSTIC_MAX_SAMPLES_PER_COMMAND)
      :[];
    if(!samples.length) return null;
    var activationScope=String(raw.activationScope||'global').trim();
    if(activationScope!=='global'&&activationScope!=='foreground-app') activationScope='global';
    var threshold=Number(raw.threshold);
    if(!isFinite(threshold)) threshold=quality==='ok'?0.80:0.78;
    var margin=Number(raw.margin);
    if(!isFinite(margin)) margin=0.08;
    var createdAt=Number(raw.createdAt);
    if(!isFinite(createdAt)) createdAt=Date.now();
    var updatedAt=Number(raw.updatedAt);
    if(!isFinite(updatedAt)) updatedAt=createdAt;
    var version=Number(raw.version);
    if(!isFinite(version)||version<1) version=1;
    return {
      id:String(raw.id||'').trim()||newAcousticVoiceCommandId(),
      version:version,
      kind:String(raw.kind||'scenario-acoustic-activate').trim()||'scenario-acoustic-activate',
      scenarioId:String(raw.scenarioId||scenarioId||'').trim(),
      label:String(raw.label||'我的语音命令').trim()||'我的语音命令',
      displayText:String(raw.displayText||'').trim(),
      samples:samples,
      threshold:threshold,
      margin:margin,
      quality:quality,
      activationScope:activationScope,
      appBoost:raw.appBoost!==false,
      enabled:raw.enabled!==false,
      createdAt:createdAt,
      updatedAt:updatedAt
    };
  }

  function normalizeAcousticVoiceCommands(list,scenarioId){
    if(!Array.isArray(list)) return [];
    var out=[];
    for(var i=0;i<list.length;i++){
      var c=normalizeAcousticVoiceCommand(list[i],scenarioId);
      if(c) out.push(c);
      if(out.length>=ACOUSTIC_MAX_COMMANDS_PER_MAPPING) break;
    }
    return out;
  }

  /** Wake/end/cancel samples share one list — keep at most one valid command per scenarioId. */
  function normalizeGlobalAcousticVoiceCommands(list){
    if(!Array.isArray(list)) return [];
    var byScenario={};
    var order=[];
    for(var i=0;i<list.length;i++){
      var raw=list[i];
      var sid=String((raw&&(raw.scenarioId||raw.scenario_id))||'').trim()||'__voice_wake__';
      if(byScenario[sid]) continue;
      var c=normalizeAcousticVoiceCommand(raw,sid);
      if(!c) continue;
      byScenario[sid]=c;
      order.push(sid);
    }
    return order.map(function(sid){ return byScenario[sid]; });
  }

  function serializeAcousticVoiceCommands(list,scenarioId){
    return normalizeAcousticVoiceCommands(list,scenarioId);
  }

  function rekeyAcousticVoiceCommandsForMapping(commands,scenarioId){
    return normalizeAcousticVoiceCommands(commands,scenarioId).map(function(c){
      var next=Object.assign({},c,{
        id:newAcousticVoiceCommandId(),
        scenarioId:String(scenarioId||'').trim(),
        updatedAt:Date.now(),
        samples:(Array.isArray(c.samples)?c.samples:[]).map(function(s){
          return Object.assign({},s,{id:newAcousticVoiceSampleId()});
        })
      });
      return next;
    });
  }

  function normalizeQualitySignals(raw){
    if(!raw||typeof raw!=='object') return null;
    var out={
      hasFinalText:!!raw.hasFinalText,
      micTooLow:!!raw.micTooLow,
      textLengthOk:raw.textLengthOk!==false,
      sampleAgreement:Number(raw.sampleAgreement)
    };
    if(!isFinite(out.sampleAgreement)) out.sampleAgreement=0;
    return out;
  }

  function normalizeVoiceCommandSample(raw){
    if(!raw||typeof raw!=='object') return null;
    var transcript=String(raw.transcript||'').trim();
    if(!transcript) return null;
    var conf=raw.confidence;
    if(conf!=null){
      conf=Number(conf);
      if(!isFinite(conf)) conf=null;
    }else conf=null;
    var source=String(raw.source||'').trim().toLowerCase();
    if(source!=='vosk'&&source!=='sapi') source='vosk';
    var createdAt=Number(raw.createdAt);
    if(!isFinite(createdAt)) createdAt=Date.now();
    var sample={transcript:transcript,confidence:conf,source:source,createdAt:createdAt};
    var qs=normalizeQualitySignals(raw.qualitySignals);
    if(qs) sample.qualitySignals=qs;
    return sample;
  }

  function normalizeVoiceCommand(raw,scenarioId){
    if(!raw||typeof raw!=='object') return null;
    var canonical=String(raw.canonicalPhrase||'').trim();
    if(!canonical) return null;
    var id=String(raw.id||'').trim()||newVoiceCommandId();
    var quality=String(raw.quality||'good').trim();
    if(quality!=='good'&&quality!=='ok') quality='good';
    var activationScope=String(raw.activationScope||'global').trim();
    if(activationScope!=='global'&&activationScope!=='foreground-app') activationScope='global';
    var aliases=Array.isArray(raw.aliases)
      ?raw.aliases.map(function(a){ return String(a||'').trim(); }).filter(Boolean).slice(0,3)
      :[];
    var samples=Array.isArray(raw.samples)
      ?raw.samples.map(normalizeVoiceCommandSample).filter(Boolean).slice(0,3)
      :[];
    var threshold=Number(raw.threshold);
    if(!isFinite(threshold)) threshold=quality==='ok'?0.86:0.80;
    var margin=Number(raw.margin);
    if(!isFinite(margin)) margin=quality==='ok'?0.10:0.06;
    var createdAt=Number(raw.createdAt);
    if(!isFinite(createdAt)) createdAt=Date.now();
    var updatedAt=Number(raw.updatedAt);
    if(!isFinite(updatedAt)) updatedAt=createdAt;
    var sid=String(raw.scenarioId||scenarioId||'').trim();
    var locale=String(raw.locale||'zh-CN').trim()||'zh-CN';
    var kind=String(raw.kind||'scenario-activate').trim()||'scenario-activate';
    var engineHint=String(raw.engineHint||'asr-text').trim()||'asr-text';
    var version=Number(raw.version);
    if(!isFinite(version)||version<1) version=1;
    return {
      id:id,
      version:version,
      kind:kind,
      engineHint:engineHint,
      locale:locale,
      scenarioId:sid,
      canonicalPhrase:canonical,
      aliases:aliases,
      samples:samples,
      phoneticKey:String(raw.phoneticKey||'').trim(),
      threshold:threshold,
      margin:margin,
      quality:quality,
      activationScope:activationScope,
      appBoost:raw.appBoost!==false,
      enabled:raw.enabled!==false,
      createdAt:createdAt,
      updatedAt:updatedAt
    };
  }

  function normalizeVoiceCommands(list,scenarioId){
    if(!Array.isArray(list)) return [];
    return list.map(function(c){ return normalizeVoiceCommand(c,scenarioId); }).filter(Boolean);
  }

  function serializeVoiceCommands(list,scenarioId){
    return normalizeVoiceCommands(list,scenarioId);
  }

  /** Assign fresh ids when duplicating a mapping so matcher cooldown cannot collide. */
  function rekeyVoiceCommandsForMapping(commands,scenarioId){
    return normalizeVoiceCommands(commands,scenarioId).map(function(c){
      var next=Object.assign({},c);
      next.id=newVoiceCommandId();
      next.scenarioId=String(scenarioId||'').trim();
      next.updatedAt=Date.now();
      return next;
    });
  }

  function normalizeInboundMapping(m){
    if(!m||typeof m!=='object') return m;
    const out=Object.assign({},m);
    if(out.triggerKey==null&&out.trigger_key!=null) out.triggerKey=out.trigger_key;
    if(out.targetKey==null&&out.target_key!=null) out.targetKey=out.target_key;
    if(out.sourceKey==null&&out.source_key!=null) out.sourceKey=out.source_key;
    if(out.activeSceneId==null&&out.active_scene_id!=null) out.activeSceneId=out.active_scene_id;
    if(out.appTargetId==null&&out.app_target_id!=null) out.appTargetId=out.app_target_id;
    if(!Array.isArray(out.appBehaviorRules)&&Array.isArray(out.app_behavior_rules)){
      out.appBehaviorRules=out.app_behavior_rules;
    }
    out.appBehaviorRules=normalizeAppBehaviorRules(out.appBehaviorRules);
    if(!Array.isArray(out.voiceCommands)&&Array.isArray(out.voice_commands)){
      out.voiceCommands=out.voice_commands;
    }
    out.voiceCommands=normalizeVoiceCommands(out.voiceCommands,out.id);
    if(!Array.isArray(out.acousticVoiceCommands)&&Array.isArray(out.acoustic_voice_commands)){
      out.acousticVoiceCommands=out.acoustic_voice_commands;
    }
    out.acousticVoiceCommands=normalizeAcousticVoiceCommands(out.acousticVoiceCommands,out.id);
    if(out.agentTemplateId==null&&out.agent_template_id!=null) out.agentTemplateId=out.agent_template_id;
    if(out.agentProviderId==null&&out.agent_provider_id!=null) out.agentProviderId=out.agent_provider_id;
    if(!Array.isArray(out.agentBindings)&&Array.isArray(out.agent_bindings)){
      out.agentBindings=out.agent_bindings;
    }
    out.agentTemplateId=String(out.agentTemplateId||'');
    out.agentProviderId=String(out.agentProviderId||'');
    out.agentBindings=normalizeAgentBindings(out.agentBindings);
    return out;
  }

  function normalizeAgentBindings(list){
    if(!Array.isArray(list)) return [];
    return list.map(function(b){
      if(!b||typeof b!=='object') return null;
      var row={
        slotId:String(b.slotId!=null?b.slotId:(b.slot_id||'')),
        actionId:String(b.actionId!=null?b.actionId:(b.action_id||'')),
        triggerType:String(b.triggerType!=null?b.triggerType:(b.trigger_type||'')),
        triggerBinding:String(b.triggerBinding!=null?b.triggerBinding:(b.trigger_binding||'')),
        enabled:b.enabled!==false,
        executionMode:b.executionMode!=null?String(b.executionMode):(b.execution_mode!=null?String(b.execution_mode):null),
        activationScope:String(b.activationScope!=null?b.activationScope:(b.activation_scope||'foregroundApp'))
      };
      var inst=b.actionInstanceId!=null?b.actionInstanceId:b.action_instance_id;
      if(inst!=null&&String(inst).trim()) row.actionInstanceId=String(inst).trim();
      var args=b.actionArgs!=null?b.actionArgs:b.action_args;
      if(args!=null&&typeof args==='object') row.actionArgs=args;
      return row;
    }).filter(Boolean);
  }

  function serializeAgentBindings(list){
    return normalizeAgentBindings(list);
  }

  function normalizeInboundConfig(raw){
    if(!raw||typeof raw!=='object') return raw;
    const cfg=Object.assign({},raw);
    if(!cfg.activeSceneId&&cfg.active_scene_id) cfg.activeSceneId=String(cfg.active_scene_id);
    if(!cfg.voiceVosk&&cfg.voice_vosk) cfg.voiceVosk=cfg.voice_vosk;
    if(!cfg.voiceSapi&&cfg.voice_sapi) cfg.voiceSapi=cfg.voice_sapi;
    if(!cfg.voiceKws&&cfg.voice_kws) cfg.voiceKws=cfg.voice_kws;
    if(!cfg.voiceEnd&&cfg.voice_end) cfg.voiceEnd=cfg.voice_end;
    if(!cfg.desiredEngine&&cfg.desired_engine) cfg.desiredEngine=String(cfg.desired_engine);
    if(!cfg.voiceListeningStrategy&&cfg.voice_listening_strategy){
      cfg.voiceListeningStrategy=String(cfg.voice_listening_strategy);
    }
    if(cfg.desiredEngine==null){
      var voskOn=!!((cfg.voiceVosk||{}).enabled);
      var sapiOn=!!((cfg.voiceSapi||{}).enabled);
      var kwsOn=!!((cfg.voiceKws||{}).enabled);
      cfg.desiredEngine=voskOn?'vosk':(sapiOn?'sapi':(kwsOn?'kws':'none'));
    }
    if(cfg.voiceListeningStrategy==null){
      cfg.voiceListeningStrategy=cfg.desiredEngine==='none'?'off':(cfg.desiredEngine==='vosk'?'enhanced':'advanced');
    }
    if(Array.isArray(cfg.mappings)){
      cfg.mappings=cfg.mappings.map(normalizeInboundMapping);
    }
    if(Array.isArray(cfg.trash)){
      cfg.trash=cfg.trash.map(normalizeInboundMapping);
    }
    var wakeAcoustic=cfg.voiceWakeAcousticCommands||cfg.voice_wake_acoustic_commands;
    cfg.voiceWakeAcousticCommands=normalizeGlobalAcousticVoiceCommands(wakeAcoustic);
    if(!cfg.cameraPrefs&&cfg.camera_prefs) cfg.cameraPrefs=cfg.camera_prefs;
    if(cfg.cameraPrefs&&typeof cfg.cameraPrefs==='object'){
      var cp=Object.assign({},cfg.cameraPrefs);
      if(!cp.presenceActions&&cp.presence_actions) cp.presenceActions=cp.presence_actions;
      if(cp.presenceActions&&typeof cp.presenceActions==='object'){
        var pa=cp.presenceActions;
        cp.presenceActions={
          enabled:pa.enabled!==undefined?!!pa.enabled:false,
          triggers:pa.triggers&&typeof pa.triggers==='object'?{
            away:!!pa.triggers.away,
            shake:!!pa.triggers.shake,
            blink:!!pa.triggers.blink,
            openPalm:!!(pa.triggers.openPalm||pa.triggers.open_palm),
            okHand:!!(pa.triggers.okHand||pa.triggers.ok_hand),
            fist:!!pa.triggers.fist,
            wave:!!pa.triggers.wave
          }:(pa.triggers||undefined),
          onAway:pa.onAway!=null?pa.onAway:(pa.on_away!=null?pa.on_away:'none'),
          onReturn:pa.onReturn!=null?pa.onReturn:(pa.on_return!=null?pa.on_return:'none'),
          shakeHead:pa.shakeHead!=null?pa.shakeHead:(pa.shake_head!=null?pa.shake_head:'none'),
          deliberateBlink:pa.deliberateBlink!=null?pa.deliberateBlink:(pa.deliberate_blink!=null?pa.deliberate_blink:'none'),
          openPalm:pa.openPalm!=null?pa.openPalm:(pa.open_palm!=null?pa.open_palm:'none'),
          okHand:pa.okHand!=null?pa.okHand:(pa.ok_hand!=null?pa.ok_hand:'none'),
          fist:pa.fist!=null?pa.fist:'none',
          wave:pa.wave!=null?pa.wave:'none',
          awayMs:Math.max(1000,Math.min(30000,Number(pa.awayMs!=null?pa.awayMs:pa.away_ms)||3000))|0,
          presentMs:Math.max(500,Math.min(10000,Number(pa.presentMs!=null?pa.presentMs:pa.present_ms)||1000))|0,
          shakeHow:(function(){
            var h=String(pa.shakeHow!=null?pa.shakeHow:pa.shake_how||'normal').trim().toLowerCase();
            return (h==='easy'||h==='strong')?h:'normal';
          })(),
          shakeConfirmCue:(function(){
            var v=pa.shakeConfirmCue!=null?pa.shakeConfirmCue:pa.shake_confirm_cue;
            if(v===undefined||v===null) return true;
            return !!v;
          })(),
          blinkCloseSec:(function(){
            var raw=pa.blinkCloseSec!=null?pa.blinkCloseSec:(pa.blink_close_sec!=null?pa.blink_close_sec:(pa.blinkCloseHow!=null?pa.blinkCloseHow:pa.blink_close_how));
            var s=String(raw==null?'':raw).trim().toLowerCase();
            if(s==='easy'||s==='short'||s==='light'||s==='quick'||s==='normal') return 0.6;
            if(s==='long'||s==='strong'||s==='hard'||s==='firm') return 1;
            var n=Number(raw);
            if(n===0.6||n===1||n===2) return n;
            if(n===600) return 0.6;
            if(n===1000) return 1;
            if(n===2000) return 2;
            return 0.6;
          })(),
          blinkConfirmCue:(function(){
            var v=pa.blinkConfirmCue!=null?pa.blinkConfirmCue:pa.blink_confirm_cue;
            if(v===undefined||v===null) return true;
            return !!v;
          })()
        };
      }
      if(cp.selectedDeviceId==null&&cp.selected_device_id!=null) cp.selectedDeviceId=cp.selected_device_id;
      if(cp.gazeCalibration===undefined&&cp.gaze_calibration!==undefined) cp.gazeCalibration=cp.gaze_calibration;
      if(cp.blinkBaseline===undefined&&cp.blink_baseline!==undefined) cp.blinkBaseline=cp.blink_baseline;
      if(cp.smartPointer===undefined&&cp.smart_pointer!==undefined) cp.smartPointer=cp.smart_pointer;
      cfg.cameraPrefs=cp;
    }
    return cfg;
  }

  function voiceWakeApi(){
    return global.OneToneVoiceWake||null;
  }

  function voiceToggleBusy(){
    const vw=voiceWakeApi();
    if(!vw) return false;
    return !!(typeof vw.isVoskTogglePending==='function'&&vw.isVoskTogglePending())
      ||!!(typeof vw.isSapiTogglePending==='function'&&vw.isSapiTogglePending());
  }

  function mvpInitFingerprint(msg){
    const c=msg&&msg.config;
    if(!c) return '';
    const maps=Array.isArray(c.mappings)?c.mappings:[];
    const vosk=!!((c.voiceVosk||c.voice_vosk||{}).enabled);
    const sapi=!!((c.voiceSapi||c.voice_sapi||{}).enabled);
    const kws=!!((c.voiceKws||c.voice_kws||{}).enabled);
    return maps.length+'|'+String(c.activeSceneId||c.active_scene_id||'')+'|'+maps.map(function(m){
      var rules=serializeAppBehaviorRules(m.appBehaviorRules||m.app_behavior_rules||[]);
      var rulesSig=rules.map(function(r){ return r.appId+':'+r.finishMode+':'+(r.summonPhrase||''); }).join(',');
      return String(m.id||'')+':'+(m.enabled?1:0)+':'+String(m.triggerKey||m.trigger_key||'')+':'+String(m.targetKey||m.target_key||'')+':'+String(m.appTargetId||m.app_target_id||'')+':'+rulesSig;
    }).join(';')+'|v'+(vosk?1:0)+'|s'+(sapi?1:0)+'|k'+(kws?1:0);
  }

  function defaultConfig(){
    const pack=global.OneToneLocaleDefaults
      ?global.OneToneLocaleDefaults.contentPack(global.OneToneLocaleDefaults.contentLocale())
      :null;
    const targetKey=pack?pack.mappingTargetKey:'RAlt';
    const labelSuffix=pack?pack.mappingLabelSuffix:'RAlt';
    const id=hooks().newMappingId();
    return {
      version:7,
      activeSceneId:id,
      desiredEngine:'none',
      voiceListeningStrategy:'auto',
      mappings:[{id:id,label:'AutoTrigger → '+labelSuffix,group:'通用设置',triggerKey:'AutoTrigger',targetKey:targetKey,enabled:true,order:0,triggerMode:'tap',intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,switchKeys:[],nativeKeyRestore:false,appTargetId:'',imePresetId:'',voiceOverride:null}],
      trash:[],
      intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,
      debounceMs:80,keyPressDurationMs:250,schemeSwitchKey:'',keyWakeSoundEnabled:false,coachHudEnabled:false,followForegroundAppScenario:false,softPadForceOpen:false,startMinimizedToTray:false,
      cameraPrefs:{enabled:false,selectedDeviceId:'',previewEnabled:false,selectedWidth:0,selectedHeight:0,selectedFrameRate:0,gazeCalibration:null,blinkBaseline:null,smartPointer:null,snapWindow:null,autoMute:null,presenceActions:{enabled:false,triggers:{away:false,shake:false,blink:false,openPalm:false,okHand:false,fist:false,wave:false},onAway:'none',onReturn:'none',shakeHead:'none',deliberateBlink:'none',openPalm:'none',okHand:'none',fist:'none',wave:'none',awayMs:3000,presentMs:1000},videoEnhancement:{enabled:false,look:'off',faceMask:'off',preset:'natural',beautyEnabled:false,whiten:0,smooth:0,rosy:0,slim:0,beauty:18,brightness:0,contrast:8,saturation:6,sharpen:8,denoise:8,lowLight:0,antiFlicker:'auto',displayFrameRate:0}},
      sounds:hooks().defaultSoundsConfig(),
      voiceSapi:{enabled:false,phrases:pack?pack.voiceSapiPhrases.slice():['开始输入','开始听写','开启输入','开始说话'],targetKey:pack?pack.voiceTargetKey:'RAlt',cooldownMs:2000,minConfidence:0.35},
      voiceVosk:{enabled:false,phrases:pack?pack.voiceVoskPhrases.slice():['开始输入','开始听写','打开听写','语音输入','开启输入'],targetKey:pack?pack.voiceTargetKey:'RAlt',cooldownMs:2000,modelPath:pack?pack.voskModelPath:'resources/vosk/vosk-model-small-cn-0.22',modelPreset:pack?pack.voskModelPreset:'cn-light'},
      voiceKws:{enabled:false,phrases:pack?pack.voiceVoskPhrases.slice():['开始输入','开始听写','打开听写','语音输入','开启输入'],targetKey:pack?pack.voiceTargetKey:'RAlt',cooldownMs:2000,modelPath:'resources/kws/sherpa-kws-zh-small',modelPreset:'cn-light'},
      voiceEnd:{enabled:false,phrasesZh:pack?pack.voiceEndPhrasesZh.slice():['结束输入','就这样','停止听写'],phrasesEn:pack?pack.voiceEndPhrasesEn.slice():['end dictation',"that's it",'stop dictation'],cancelPhrasesZh:pack?pack.voiceCancelPhrasesZh.slice():['取消输入','不要了','撤掉'],cancelPhrasesEn:pack?pack.voiceCancelPhrasesEn.slice():['cancel input','never mind','forget it'],sendPhrasesZh:['发送','发出去','提交'],sendPhrasesEn:['send it','send','submit'],sendMode:'confirm',commitDelayMs:4000,commitKey:'Enter',dictationTimeoutMs:120000,autoSendEnabled:false,targetKey:pack?pack.voiceTargetKey:'RAlt'},
      voiceWakeAcousticCommands:[]
    };
  }

  function ensureConfig(){
    const st=state();
    if(!st.config||!Array.isArray(st.config.mappings)) st.config=defaultConfig();
    if(!Array.isArray(st.config.trash)) st.config.trash=[];
    if(!st.config.mappings.length){
      const newMappingId=hookFn('newMappingId');
      const id=newMappingId?newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
      st.config.mappings.push({id:id,label:'',group:'通用设置',triggerKey:'',targetKey:'',enabled:false,order:0,triggerMode:'tap'});
    }
    if(!st.config.activeSceneId){
      var enabled=st.config.mappings.find(function(m){return m.enabled;});
      st.config.activeSceneId=(enabled&&enabled.id)||st.config.mappings[0].id;
    }
    // Editing selection is independent of in-use. After first ready:
    // - null is legal (global voice/camera base edit)
    // - only heal when id was deleted from mappings
    var editReady=!!st.__vp_editSelectionReady;
    var selRaw=st.selectedMappingId;
    var selId=selRaw==null||selRaw===''?null:String(selRaw).trim();
    var selExists=!!(selId&&st.config.mappings.some(function(m){ return m.id===selId; }));
    if(!editReady){
      var active=String(st.config.activeSceneId||'').trim();
      if(active&&st.config.mappings.some(function(m){ return m.id===active; })){
        st.selectedMappingId=active;
      }else if(st.config.mappings[0]){
        st.selectedMappingId=st.config.mappings[0].id;
      }
      st.__vp_editSelectionReady=true;
    }else if(selId&&!selExists){
      var activeHeal=String(st.config.activeSceneId||'').trim();
      if(activeHeal&&st.config.mappings.some(function(m){ return m.id===activeHeal; })){
        st.selectedMappingId=activeHeal;
      }else if(st.config.mappings[0]){
        st.selectedMappingId=st.config.mappings[0].id;
      }else{
        st.selectedMappingId=null;
      }
    }else if(selId){
      st.selectedMappingId=selId;
    }else{
      st.selectedMappingId=null;
    }
    if(st.config.schemeSwitchKey===undefined||st.config.schemeSwitchKey===null) st.config.schemeSwitchKey='';
    st.config.schemeSwitchKey='';
    if(st.config.keyWakeSoundEnabled===undefined) st.config.keyWakeSoundEnabled=false;
    if(st.config.coachHudEnabled===undefined) st.config.coachHudEnabled=false;
    if(st.config.followForegroundAppScenario===undefined) st.config.followForegroundAppScenario=false;
    if(st.config.softPadForceOpen===undefined) st.config.softPadForceOpen=false;
    if(st.config.startMinimizedToTray===undefined) st.config.startMinimizedToTray=false;
    if(!st.config.cameraPrefs||typeof st.config.cameraPrefs!=='object'){
      // Before backend hydrate, do not invent defaults onto config — a later
      // quiet save would wipe real disk prefs. After hydrate, fill schema gaps.
      if(configLoadedFromBackend){
        st.config.cameraPrefs={enabled:false,selectedDeviceId:'',previewEnabled:false,selectedWidth:0,selectedHeight:0,selectedFrameRate:0,gazeCalibration:null,blinkBaseline:null,smartPointer:null,snapWindow:null,autoMute:null,presenceActions:{enabled:false,triggers:{away:false,shake:false,blink:false,openPalm:false,okHand:false,fist:false,wave:false},onAway:'none',onReturn:'none',shakeHead:'none',deliberateBlink:'none',openPalm:'none',okHand:'none',fist:'none',wave:'none'},videoEnhancement:defaultVideoEnhancementPrefs()};
      }
    }else{
      if(st.config.cameraPrefs.selectedDeviceId==null) st.config.cameraPrefs.selectedDeviceId='';
      if(st.config.cameraPrefs.previewEnabled===undefined) st.config.cameraPrefs.previewEnabled=false;
      if(st.config.cameraPrefs.selectedWidth==null) st.config.cameraPrefs.selectedWidth=0;
      if(st.config.cameraPrefs.selectedHeight==null) st.config.cameraPrefs.selectedHeight=0;
      if(st.config.cameraPrefs.selectedFrameRate==null) st.config.cameraPrefs.selectedFrameRate=0;
      if(st.config.cameraPrefs.gazeCalibration===undefined) st.config.cameraPrefs.gazeCalibration=null;
      if(st.config.cameraPrefs.blinkBaseline===undefined) st.config.cameraPrefs.blinkBaseline=null;
      if(st.config.cameraPrefs.smartPointer===undefined) st.config.cameraPrefs.smartPointer=null;
      if(st.config.cameraPrefs.snapWindow===undefined) st.config.cameraPrefs.snapWindow=null;
      if(st.config.cameraPrefs.autoMute===undefined) st.config.cameraPrefs.autoMute=null;
      st.config.cameraPrefs.videoEnhancement=normalizeVideoEnhancementPrefs(st.config.cameraPrefs.videoEnhancement);
      if(!st.config.cameraPrefs.presenceActions||typeof st.config.cameraPrefs.presenceActions!=='object'){
        st.config.cameraPrefs.presenceActions={enabled:false,triggers:{away:false,shake:false,blink:false,openPalm:false,okHand:false,fist:false,wave:false},onAway:'none',onReturn:'none',shakeHead:'none',deliberateBlink:'none',openPalm:'none',okHand:'none',fist:'none',wave:'none',awayMs:3000,presentMs:1000};
      }else{
        var pa=st.config.cameraPrefs.presenceActions;
        if(pa.enabled===undefined) pa.enabled=false;
        // Legacy: top-level cameraPrefs.enabled was a second source of truth — migrate once.
        if(st.config.cameraPrefs.enabled&&!pa.enabled) pa.enabled=true;
        if(!pa.onAway) pa.onAway='none';
        if(!pa.onReturn) pa.onReturn='none';
        if(!pa.shakeHead) pa.shakeHead='none';
        if(!pa.deliberateBlink) pa.deliberateBlink='none';
        if(!pa.openPalm) pa.openPalm='none';
        if(!pa.okHand) pa.okHand='none';
        if(!pa.fist) pa.fist='none';
        if(!pa.wave) pa.wave='none';
        if(!pa.triggers||typeof pa.triggers!=='object'){
          // Derive trigger flags from existing action bindings so upgrades keep behavior.
          pa.triggers={
            away:pa.onAway!=='none'||pa.onReturn!=='none',
            shake:pa.shakeHead!=='none',
            blink:pa.deliberateBlink!=='none',
            openPalm:pa.openPalm!=='none',
            okHand:pa.okHand!=='none',
            fist:pa.fist!=='none',
            wave:pa.wave!=='none'
          };
        }else{
          if(pa.triggers.away===undefined) pa.triggers.away=pa.onAway!=='none'||pa.onReturn!=='none';
          if(pa.triggers.shake===undefined) pa.triggers.shake=pa.shakeHead!=='none';
          if(pa.triggers.blink===undefined) pa.triggers.blink=pa.deliberateBlink!=='none';
          if(pa.triggers.openPalm===undefined) pa.triggers.openPalm=pa.openPalm!=='none';
          if(pa.triggers.okHand===undefined) pa.triggers.okHand=pa.okHand!=='none';
          if(pa.triggers.fist===undefined) pa.triggers.fist=pa.fist!=='none';
          if(pa.triggers.wave===undefined) pa.triggers.wave=pa.wave!=='none';
          pa.triggers.away=!!pa.triggers.away;
          pa.triggers.shake=!!pa.triggers.shake;
          pa.triggers.blink=!!pa.triggers.blink;
          pa.triggers.openPalm=!!pa.triggers.openPalm;
          pa.triggers.okHand=!!pa.triggers.okHand;
          pa.triggers.fist=!!pa.triggers.fist;
          pa.triggers.wave=!!pa.triggers.wave;
        }
      }
      // Deprecated mirror: top-level enabled always equals presenceActions.enabled.
      st.config.cameraPrefs.enabled=!!(st.config.cameraPrefs.presenceActions&&st.config.cameraPrefs.presenceActions.enabled);
    }
    const ensureSounds=hookFn('ensureSoundsConfig');
    if(ensureSounds) ensureSounds();
    const ensureExtras=hookFn('ensureMappingExtras');
    if(ensureExtras){
      st.config.mappings.forEach(ensureExtras);
      (st.config.trash||[]).forEach(ensureExtras);
    }
    migrateSoftPadGlobalIntoBaseline(st.config);
  }

  /** Merge legacy soft-pad-global row into universal baseline; overlay runtime reads baseline. */
  function migrateSoftPadGlobalIntoBaseline(cfg){
    if(!cfg||!Array.isArray(cfg.mappings)) return;
    var legacy=null;
    var i;
    for(i=0;i<cfg.mappings.length;i++){
      if(cfg.mappings[i]&&String(cfg.mappings[i].id||'')==='soft-pad-global'){
        legacy=cfg.mappings[i];
        break;
      }
    }
    if(!legacy) return;
    var diff=global.OneToneHabitOverrideDiff;
    var baseline=diff&&diff.findGlobalBaselineMapping
      ?diff.findGlobalBaselineMapping(cfg,global.OneToneMappingCore)
      :cfg.mappings[0];
    if(!baseline) return;
    if(legacy.codexMicroPad){
      if(!baseline.codexMicroPad){
        baseline.codexMicroPad=legacy.codexMicroPad;
      }else{
        var gp=legacy.codexMicroPad;
        var bp=baseline.codexMicroPad;
        if(gp.overlayEnabled) bp.overlayEnabled=true;
        if(gp.presentation&&!bp.presentation) bp.presentation=gp.presentation;
        if(gp.ambientMode&&!bp.ambientMode) bp.ambientMode=gp.ambientMode;
        if(gp.ambientEnabled!=null&&bp.ambientEnabled==null) bp.ambientEnabled=gp.ambientEnabled;
        if(gp.enabled===false) bp.enabled=false;
      }
    }
    cfg.mappings=cfg.mappings.filter(function(m){
      return String(m&&m.id||'')!=='soft-pad-global';
    });
    if(String(cfg.activeSceneId||'')==='soft-pad-global'){
      cfg.activeSceneId=String(baseline.id||'');
    }
  }

  function normalizeSaveSource(source){
    source=String(source||'').trim();
    return source||'unknown';
  }

  function buildSavePayload(source){
    ensureConfig();
    hooks().flushAllEditorToMappings();
    const st=state();
    rememberAppScenariosFromConfig(st.config);
    reinjectRememberedAppScenarios(st.config);
    const slots=hooks().soundSlotDefaults();
    const diffApi=global.OneToneHabitOverrideDiff;
    const baseline=diffApi&&diffApi.getGlobalKeyBaseline
      ?diffApi.getGlobalKeyBaseline(st.config,global.OneToneMappingCore)
      :null;
    const payload={
      saveSource:normalizeSaveSource(source),
      version:6,
      activeSceneId:String(st.config.activeSceneId||''),
      mappings:st.config.mappings.map(function(m,i){
        hooks().ensureMappingExtras(m);
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.ensureRulesBeforeSave){
          global.OneToneAppBehaviorRules.ensureRulesBeforeSave(m);
        }
        var isApp=diffApi&&diffApi.isAppScenarioMapping&&diffApi.isAppScenarioMapping(m);
        if(isApp&&diffApi.normalizeKeyFieldsForSave&&baseline){
          diffApi.normalizeKeyFieldsForSave(m,baseline,true);
        }
        // App scenarios inherit keys from universal settings. Do not synthesize
        // editor/voice fallbacks into the payload — that used to look "recorded"
        // and later wipe/normalize paths could drop appTargetId.
        var trig=isApp?String(m.triggerKey||'').trim():hooks().editorTriggerForMapping(m);
        var tgt=isApp?String(m.targetKey||'').trim():hooks().editorTargetForMapping(m);
        var order=Number(m.order);
        if(!isFinite(order)) order=i;
        return {id:m.id,label:m.label||((trig&&tgt)?((trig||'?')+' → '+(tgt||'?')):''),group:m.group||'通用设置',triggerKey:trig,targetKey:tgt,enabled:!!m.enabled,order:order,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore,imePresetId:String(m.imePresetId||''),appTargetId:String(m.appTargetId||''),appBehaviorRules:serializeAppBehaviorRules(m.appBehaviorRules),voiceOverride:m.voiceOverride==null?null:m.voiceOverride,cameraOverride:m.cameraOverride==null?null:m.cameraOverride,voiceCommands:serializeVoiceCommands(m.voiceCommands,m.id),acousticVoiceCommands:serializeAcousticVoiceCommands(m.acousticVoiceCommands,m.id),agentTemplateId:String(m.agentTemplateId||''),agentProviderId:String(m.agentProviderId||''),agentBindings:serializeAgentBindings(m.agentBindings),codexMicroPad:m.codexMicroPad==null?null:m.codexMicroPad,timeMachineWorkspace:String(m.timeMachineWorkspace||'')};
      }),
      trash:(st.config.trash||[]).map(function(m){
        hooks().ensureMappingExtras(m);
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.ensureRulesBeforeSave){
          global.OneToneAppBehaviorRules.ensureRulesBeforeSave(m);
        }
        return {id:m.id,label:m.label||'',group:m.group||'通用设置',triggerKey:m.triggerKey||'',targetKey:m.targetKey||'',enabled:false,order:m.order||0,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore,imePresetId:String(m.imePresetId||''),appTargetId:String(m.appTargetId||''),appBehaviorRules:serializeAppBehaviorRules(m.appBehaviorRules),voiceOverride:m.voiceOverride==null?null:m.voiceOverride,cameraOverride:m.cameraOverride==null?null:m.cameraOverride,voiceCommands:serializeVoiceCommands(m.voiceCommands,m.id),acousticVoiceCommands:serializeAcousticVoiceCommands(m.acousticVoiceCommands,m.id),agentTemplateId:String(m.agentTemplateId||''),agentProviderId:String(m.agentProviderId||''),agentBindings:serializeAgentBindings(m.agentBindings),codexMicroPad:m.codexMicroPad==null?null:m.codexMicroPad,timeMachineWorkspace:String(m.timeMachineWorkspace||'')};
      }),
      intervalMs:st.config.intervalMs||1200,
      enterDelayMs:st.config.enterDelayMs||5000,
      cancelEnabled:st.config.cancelEnabled!==false,
      autoEnterEnabled:st.config.autoEnterEnabled!==false,
      debounceMs:st.config.debounceMs||80,
      keyPressDurationMs:st.config.keyPressDurationMs||250,
      schemeSwitchKey:'',
      keyWakeSoundEnabled:!!(st.config.sounds&&st.config.sounds.keyWake&&st.config.sounds.keyWake.enabled),
      coachHudEnabled:!!st.config.coachHudEnabled,
      followForegroundAppScenario:!!st.config.followForegroundAppScenario,
      softPadForceOpen:!!st.config.softPadForceOpen,
      startMinimizedToTray:!!st.config.startMinimizedToTray,
      cameraPrefs:(function(){
        var p=st.config.cameraPrefs||{};
        var pa=p.presenceActions&&typeof p.presenceActions==='object'?p.presenceActions:{};
        var tr=pa.triggers&&typeof pa.triggers==='object'?pa.triggers:{};
        var presenceEnabled=!!pa.enabled;
        return {
          // Deprecated mirror of presenceActions.enabled — do not read as intent.
          enabled:presenceEnabled,
          selectedDeviceId:String(p.selectedDeviceId||'').trim(),
          // Schema only — FE never auto-starts from this flag.
          previewEnabled:false,
          selectedWidth:Math.max(0,Number(p.selectedWidth)||0)|0,
          selectedHeight:Math.max(0,Number(p.selectedHeight)||0)|0,
          selectedFrameRate:Math.max(0,Number(p.selectedFrameRate)||0)|0,
          gazeCalibration:p.gazeCalibration!=null?p.gazeCalibration:null,
          blinkBaseline:p.blinkBaseline!=null?p.blinkBaseline:null,
          smartPointer:p.smartPointer!=null?p.smartPointer:null,
          snapWindow:p.snapWindow!=null?p.snapWindow:null,
          autoMute:p.autoMute!=null?p.autoMute:null,
          presenceActions:{
            enabled:presenceEnabled,
            triggers:{
              away:tr.away!==undefined?!!tr.away:(String(pa.onAway||'none')!=='none'||String(pa.onReturn||'none')!=='none'),
              shake:tr.shake!==undefined?!!tr.shake:String(pa.shakeHead||'none')!=='none',
              blink:tr.blink!==undefined?!!tr.blink:String(pa.deliberateBlink||'none')!=='none',
              openPalm:tr.openPalm!==undefined?!!tr.openPalm:String(pa.openPalm||'none')!=='none',
              okHand:tr.okHand!==undefined?!!tr.okHand:String(pa.okHand||'none')!=='none',
              fist:tr.fist!==undefined?!!tr.fist:String(pa.fist||'none')!=='none',
              wave:tr.wave!==undefined?!!tr.wave:String(pa.wave||'none')!=='none'
            },
            onAway:String(pa.onAway||'none').trim()||'none',
            onReturn:String(pa.onReturn||'none').trim()||'none',
            shakeHead:String(pa.shakeHead||'none').trim()||'none',
            deliberateBlink:String(pa.deliberateBlink||'none').trim()||'none',
            openPalm:String(pa.openPalm||'none').trim()||'none',
            okHand:String(pa.okHand||'none').trim()||'none',
            fist:String(pa.fist||'none').trim()||'none',
            wave:String(pa.wave||'none').trim()||'none',
            awayMs:Math.max(1000,Math.min(30000,Number(pa.awayMs!=null?pa.awayMs:pa.away_ms)||3000))|0,
            presentMs:Math.max(500,Math.min(10000,Number(pa.presentMs!=null?pa.presentMs:pa.present_ms)||1000))|0,
            shakeHow:(function(){
              var h=String(pa.shakeHow!=null?pa.shakeHow:pa.shake_how||'normal').trim().toLowerCase();
              return (h==='easy'||h==='strong')?h:'normal';
            })(),
            shakeConfirmCue:(function(){
              var v=pa.shakeConfirmCue!=null?pa.shakeConfirmCue:pa.shake_confirm_cue;
              if(v===undefined||v===null) return true;
              return !!v;
            })(),
            blinkCloseSec:(function(){
              var raw=pa.blinkCloseSec!=null?pa.blinkCloseSec:(pa.blink_close_sec!=null?pa.blink_close_sec:(pa.blinkCloseHow!=null?pa.blinkCloseHow:pa.blink_close_how));
              var s=String(raw==null?'':raw).trim().toLowerCase();
              if(s==='easy'||s==='short'||s==='light'||s==='quick'||s==='normal') return 0.6;
              if(s==='long'||s==='strong'||s==='hard'||s==='firm') return 1;
              var n=Number(raw);
              if(n===0.6||n===1||n===2) return n;
              if(n===600) return 0.6;
              if(n===1000) return 1;
              if(n===2000) return 2;
              return 0.6;
            })(),
            blinkConfirmCue:(function(){
              var v=pa.blinkConfirmCue!=null?pa.blinkConfirmCue:pa.blink_confirm_cue;
              if(v===undefined||v===null) return true;
              return !!v;
            })()
          }
        };
      })(),
      sounds:(function(){
        const s=hooks().ensureSoundsConfig();
        var categories={};
        try{
          if(global.OneToneSoundBus&&global.OneToneSoundBus.ensureCategoriesConfig){
            global.OneToneSoundBus.ensureCategoriesConfig(s);
          }
          var src=s.categories||{};
          Object.keys(src).forEach(function(k){
            categories[k]={
              policy:String(src[k].policy||'when_unseen'),
              id:String(src[k].id||'')
            };
          });
        }catch(_){}
        return {
          masterEnabled:!!s.masterEnabled,
          masterVolume:Number(s.masterVolume!=null?s.masterVolume:0.65),
          record:{enabled:!!s.record.enabled,id:String(s.record.id||slots.record.id)},
          voiceWake:{enabled:!!s.voiceWake.enabled,id:String(s.voiceWake.id||slots.voiceWake.id)},
          keyWake:{enabled:!!s.keyWake.enabled,id:String(s.keyWake.id||slots.keyWake.id)},
          sendSuccess:{enabled:!!s.sendSuccess.enabled,id:String(s.sendSuccess.id||slots.sendSuccess.id)},
          sendFail:{enabled:!!s.sendFail.enabled,id:String(s.sendFail.id||slots.sendFail.id)},
          cameraAction:{enabled:!!(s.cameraAction&&s.cameraAction.enabled),id:String((s.cameraAction&&s.cameraAction.id)||slots.cameraAction.id)},
          categories:categories,
          recordingMuteEnabled:!!s.recordingMuteEnabled,
          recordingMuteStrength:String(s.recordingMuteStrength||'balanced').trim()||'balanced'
        };
      })(),
      voiceSapi:(function(){
        const cfg=st.config.voiceSapi||st.config.voice_sapi||{};
        return {
          enabled:!!cfg.enabled,
          phrases:hooks().cloneStringList(cfg.phrases),
          targetKey:String(cfg.targetKey||'RAlt').trim()||'RAlt',
          cooldownMs:Number(cfg.cooldownMs)||2000,
          minConfidence:Number(cfg.minConfidence==null?0.35:cfg.minConfidence)||0.35
        };
      })(),
      voiceVosk:(function(){
        const cfg=st.config.voiceVosk||st.config.voice_vosk||{};
        return {
          enabled:!!cfg.enabled,
          phrases:hooks().cloneStringList(cfg.phrases),
          targetKey:String(cfg.targetKey||'RAlt').trim()||'RAlt',
          cooldownMs:Number(cfg.cooldownMs)||2000,
          modelPath:String(cfg.modelPath||'resources/vosk/vosk-model-small-cn-0.22').trim(),
          modelPreset:String(cfg.modelPreset||'cn-light').trim()||'cn-light'
        };
      })(),
      voiceKws:(function(){
        const cfg=st.config.voiceKws||st.config.voice_kws||{};
        return {
          enabled:!!cfg.enabled,
          phrases:hooks().cloneStringList(cfg.phrases),
          targetKey:String(cfg.targetKey||'RAlt').trim()||'RAlt',
          cooldownMs:Number(cfg.cooldownMs)||2000,
          modelPath:String(cfg.modelPath||'resources/kws/sherpa-kws-zh-small').trim(),
          modelPreset:String(cfg.modelPreset||'cn-light').trim()||'cn-light'
        };
      })(),
      voiceEnd:(function(){
        const cfg=st.config.voiceEnd||st.config.voice_end||{};
        return {
          enabled:!!cfg.enabled,
          phrasesZh:hooks().cloneStringList(cfg.phrasesZh||cfg.phrases_zh),
          phrasesEn:hooks().cloneStringList(cfg.phrasesEn||cfg.phrases_en),
          cancelPhrasesZh:hooks().cloneStringList(cfg.cancelPhrasesZh||cfg.cancel_phrases_zh),
          cancelPhrasesEn:hooks().cloneStringList(cfg.cancelPhrasesEn||cfg.cancel_phrases_en),
          sendPhrasesZh:hooks().cloneStringList(cfg.sendPhrasesZh||cfg.send_phrases_zh),
          sendPhrasesEn:hooks().cloneStringList(cfg.sendPhrasesEn||cfg.send_phrases_en),
          sendMode:String(cfg.sendMode||cfg.send_mode||(cfg.autoSendEnabled||cfg.auto_send_enabled?'auto':'confirm')).trim()||'confirm',
          commitDelayMs:Number(cfg.commitDelayMs||cfg.commit_delay_ms)||4000,
          commitKey:String(cfg.commitKey||cfg.commit_key||'Enter').trim()||'Enter',
          dictationTimeoutMs:Number(cfg.dictationTimeoutMs||cfg.dictation_timeout_ms)||60000,
          autoSendEnabled:!!cfg.autoSendEnabled||!!cfg.auto_send_enabled||String(cfg.sendMode||'').toLowerCase()==='auto',
          targetKey:String(cfg.targetKey||cfg.target_key||'RAlt').trim()||'RAlt'
        };
      })(),
      voiceListeningStrategy:String(st.config.voiceListeningStrategy||st.config.voice_listening_strategy||'auto'),
      imePresetId:String(st.config.imePresetId||''),
      voiceWakeAcousticCommands:(function(){
        const cfg=st.config||{};
        const list=cfg.voiceWakeAcousticCommands||cfg.voice_wake_acoustic_commands||[];
        return normalizeGlobalAcousticVoiceCommands(list);
      })()
    };
    return JSON.stringify(payload);
  }

  function invokeSaveOnce(source){
    var payload;
    try{
      earlyPersistLog('cmd_save buildPayload begin source='+source);
      var t0=Date.now();
      payload=buildSavePayload(source);
      earlyPersistLog('cmd_save buildPayload done '+(Date.now()-t0)+'ms');
    }catch(err){
      if(typeof console!=='undefined'&&console.error){
        console.error('cmd_save build failed',err);
      }
      return Promise.resolve(false);
    }
    var invoke=global.__vp_invoke__;
    if(!invoke){
      try{
        if(global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage){
          global.chrome.webview.postMessage({type:'mvp_save',json:payload});
        }
      }catch(_){ }
      return Promise.resolve(false);
    }
    // Tauri invoke only — postMessage mvp_save also calls cmd_save (events.js) → duplicate save 假死.
    earlyPersistLog('cmd_save invoke begin');
    return invoke('cmd_save',{json:payload}).then(function(){
      earlyPersistLog('cmd_save invoke ok');
      return true;
    }).catch(function(err){
      earlyPersistLog('cmd_save invoke fail '+err);
      if(typeof console!=='undefined'&&console.error){
        console.error('cmd_save',err);
      }
      return false;
    });
  }

  function flushSaveQueue(){
    if(saveInFlight) return saveInFlight;
    var source=pendingSaveSource;
    saveInFlight=invokeSaveOnce(source).then(function(ok){
      lastSaveCompletedAt=Date.now();
      if(saveNeedsRerun){
        saveNeedsRerun=false;
        saveInFlight=null;
        return flushSaveQueue();
      }
      var waiters=saveWaiters.splice(0);
      saveInFlight=null;
      waiters.forEach(function(resolve){ resolve(ok); });
      return ok;
    });
    return saveInFlight;
  }

  function voicePanelOpen(){
    try{
      var ui=global.OneToneState&&global.OneToneState.ui;
      return !!(ui&&ui.drawerOpen&&ui.settingsPanel==='voiceWake');
    }catch(_){ return false; }
  }

  function save(opts){
    var source=normalizeSaveSource(opts&&opts.source);
    if(source==='unknown'&&(Date.now()<suppressUnknownSaveUntil||voicePanelOpen())){
      earlyPersistLog('cmd_save suppressed source=unknown (drawer/boot/voice guard)');
      return;
    }
    if(source==='unknown'){
      try{
        var stack=(new Error('save-trace')).stack||'';
        earlyPersistLog('cmd_save unknown caller '+String(stack).split('\n').slice(0,4).join(' | '));
      }catch(_){}
    }
    pendingSaveSource=source;
    if(saveInFlight){
      saveNeedsRerun=true;
      return;
    }
    flushSaveQueue();
  }

  function saveAsync(opts){
    return new Promise(function(resolve){
      var source=normalizeSaveSource(opts&&opts.source);
      if(source==='unknown'&&(Date.now()<suppressUnknownSaveUntil||voicePanelOpen())){
        earlyPersistLog('cmd_saveAsync suppressed source=unknown (drawer/boot/voice guard)');
        resolve(true);
        return;
      }
      if(source==='unknown'){
        try{
          var stack=(new Error('saveAsync-trace')).stack||'';
          earlyPersistLog('cmd_saveAsync unknown caller '+String(stack).split('\n').slice(0,4).join(' | '));
        }catch(_){}
      }
      pendingSaveSource=source;
      saveWaiters.push(resolve);
      if(saveInFlight){
        saveNeedsRerun=true;
        return;
      }
      flushSaveQueue();
    });
  }

  function presenceActionsHaveBinding(pa){
    if(!pa||typeof pa!=='object') return false;
    return ['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'].some(function(k){
      return String(pa[k]||'none').trim()!=='none';
    });
  }

  function presenceActionsHaveTrigger(pa){
    if(!pa||typeof pa!=='object') return false;
    var tr=pa.triggers;
    if(!tr||typeof tr!=='object') return false;
    return !!(tr.away||tr.shake||tr.blink||tr.openPalm||tr.okHand||tr.fist||tr.wave);
  }

  /** Master off + no bindings + no triggers — typical bootstrap / wipe payload. */
  function presenceActionsAreBlank(pa){
    if(!pa||typeof pa!=='object') return true;
    if(pa.enabled) return false;
    if(presenceActionsHaveBinding(pa)) return false;
    if(presenceActionsHaveTrigger(pa)) return false;
    return true;
  }

  /** True when FE lost the presenceActions shape (not when user set all to none). */
  function presenceActionsLookStripped(pa){
    if(!pa||typeof pa!=='object') return true;
    return ['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'].some(function(k){
      return pa[k]===undefined;
    });
  }

  function cameraPrefsLookBlank(p){
    if(!p||typeof p!=='object') return true;
    if(String(p.selectedDeviceId||'').trim()) return false;
    if(p.gazeCalibration!=null) return false;
    if(p.blinkBaseline!=null) return false;
    if(p.smartPointer!=null) return false;
    if(p.snapWindow!=null) return false;
    if(p.autoMute!=null) return false;
    if(!presenceActionsAreBlank(p.presenceActions)) return false;
    var ve=p.videoEnhancement;
    if(ve&&typeof ve==='object'&&(ve.enabled||ve.beautyEnabled||(ve.look&&ve.look!=='off')||(ve.faceMask&&ve.faceMask!=='off'))){
      return false;
    }
    return true;
  }

  function defaultVideoEnhancementPrefs(){
    return {
      enabled:false,
      look:'off',
      faceMask:'off',
      preset:'natural',
      beautyEnabled:false,
      whiten:0,
      smooth:0,
      rosy:0,
      slim:0,
      beauty:18,
      brightness:0,
      contrast:8,
      saturation:6,
      sharpen:8,
      denoise:8,
      lowLight:0,
      antiFlicker:'auto',
      displayFrameRate:0
    };
  }

  function normalizeVideoEnhancementPrefs(src){
    var d=defaultVideoEnhancementPrefs();
    src=src&&typeof src==='object'?src:{};
    var enh=global.OneToneCameraVideoEnhancer;
    if(enh&&enh.normalizePrefs) return enh.normalizePrefs(src);
    function clampLevel(v){
      v=Math.round(Number(v)||0)|0;
      if(v<0) v=0;
      if(v>3) v=3;
      return v;
    }
    function mapPreset(preset){
      preset=String(preset||'');
      if(preset==='natural') return 'natural';
      if(preset==='soft') return 'cream';
      if(preset==='clear') return 'glow';
      if(preset==='lowLight') return 'fresh';
      return 'off';
    }
    var look=src.look!=null?String(src.look):'';
    if(look!=='off'&&look!=='natural'&&look!=='cream'&&look!=='glow'&&look!=='fresh'){
      look=mapPreset(src.preset);
    }
    if(!look) look='off';
    var faceMask=String(src.faceMask||'off').toLowerCase();
    if(faceMask!=='off'&&faceMask!=='solid'&&faceMask!=='emoji'&&faceMask!=='animal') faceMask='off';
    var anti=String(src.antiFlicker||d.antiFlicker).toLowerCase();
    if(anti!=='auto'&&anti!=='50hz'&&anti!=='60hz') anti=d.antiFlicker;
    var dfs=Math.round(Number(src.displayFrameRate)||0)|0;
    if(dfs!==0&&dfs!==25&&dfs!==30&&dfs!==50&&dfs!==60) dfs=0;
    function clamp(n,lo,hi,fallback){
      n=Number(n);
      if(!isFinite(n)) n=fallback;
      return Math.max(lo,Math.min(hi,n));
    }
    var beauty=look!=='off'&&!!(src.enabled||src.beautyEnabled||(src.look&&src.look!=='off'));
    if(look==='off') beauty=false;
    var enabled=beauty||faceMask!=='off';
    return {
      enabled:enabled,
      look:look,
      faceMask:faceMask,
      preset:String(src.preset||d.preset),
      beautyEnabled:beauty,
      whiten:clampLevel(src.whiten!=null?src.whiten:0),
      smooth:clampLevel(src.smooth!=null?src.smooth:0),
      rosy:clampLevel(src.rosy!=null?src.rosy:0),
      slim:clampLevel(src.slim!=null?src.slim:0),
      beauty:clamp(src.beauty!=null?src.beauty:d.beauty,0,100,d.beauty)|0,
      brightness:clamp(src.brightness!=null?src.brightness:d.brightness,-50,50,d.brightness)|0,
      contrast:clamp(src.contrast!=null?src.contrast:d.contrast,-50,50,d.contrast)|0,
      saturation:clamp(src.saturation!=null?src.saturation:d.saturation,-50,50,d.saturation)|0,
      sharpen:clamp(src.sharpen!=null?src.sharpen:d.sharpen,0,100,d.sharpen)|0,
      denoise:clamp(src.denoise!=null?src.denoise:d.denoise,0,100,d.denoise)|0,
      lowLight:clamp(src.lowLight!=null?src.lowLight:d.lowLight,0,100,d.lowLight)|0,
      antiFlicker:anti,
      displayFrameRate:dfs
    };
  }

  function rememberCameraPrefsFromConfig(cfg){
    var p=cfg&&cfg.cameraPrefs;
    if(!p||typeof p!=='object') return;
    try{
      var candidate={
        enabled:!!(p.presenceActions&&p.presenceActions.enabled),
        selectedDeviceId:String(p.selectedDeviceId||'').trim(),
        previewEnabled:false,
        selectedWidth:Math.max(0,Number(p.selectedWidth)||0)|0,
        selectedHeight:Math.max(0,Number(p.selectedHeight)||0)|0,
        selectedFrameRate:Math.max(0,Number(p.selectedFrameRate)||0)|0,
        gazeCalibration:p.gazeCalibration!=null?p.gazeCalibration:null,
        blinkBaseline:p.blinkBaseline!=null?p.blinkBaseline:null,
        smartPointer:p.smartPointer!=null?p.smartPointer:null,
        snapWindow:p.snapWindow!=null?p.snapWindow:null,
        autoMute:p.autoMute!=null?p.autoMute:null,
        presenceActions:p.presenceActions&&typeof p.presenceActions==='object'?p.presenceActions:{
          enabled:false,triggers:{away:false,shake:false,blink:false,openPalm:false,okHand:false,fist:false,wave:false},
          onAway:'none',onReturn:'none',shakeHead:'none',deliberateBlink:'none',
          openPalm:'none',okHand:'none',fist:'none',wave:'none'
        },
        videoEnhancement:normalizeVideoEnhancementPrefs(p.videoEnhancement)
      };
      // Never let a blank snapshot erase richer in-memory lastKnown (bootstrap wipe).
      if(lastKnownCameraPrefs&&cameraPrefsLookBlank(candidate)&&!cameraPrefsLookBlank(lastKnownCameraPrefs)){
        if(presenceActionsAreBlank(candidate.presenceActions)&&!presenceActionsAreBlank(lastKnownCameraPrefs.presenceActions)){
          candidate.presenceActions=lastKnownCameraPrefs.presenceActions;
          candidate.enabled=!!lastKnownCameraPrefs.enabled;
        }
        if(!candidate.selectedDeviceId&&lastKnownCameraPrefs.selectedDeviceId){
          candidate.selectedDeviceId=lastKnownCameraPrefs.selectedDeviceId;
        }
        if(candidate.gazeCalibration==null&&lastKnownCameraPrefs.gazeCalibration!=null){
          candidate.gazeCalibration=lastKnownCameraPrefs.gazeCalibration;
        }
        if(candidate.blinkBaseline==null&&lastKnownCameraPrefs.blinkBaseline!=null){
          candidate.blinkBaseline=lastKnownCameraPrefs.blinkBaseline;
        }
        if(candidate.smartPointer==null&&lastKnownCameraPrefs.smartPointer!=null){
          candidate.smartPointer=lastKnownCameraPrefs.smartPointer;
        }
        if(candidate.snapWindow==null&&lastKnownCameraPrefs.snapWindow!=null){
          candidate.snapWindow=lastKnownCameraPrefs.snapWindow;
        }
        if(candidate.autoMute==null&&lastKnownCameraPrefs.autoMute!=null){
          candidate.autoMute=lastKnownCameraPrefs.autoMute;
        }
      }
      lastKnownCameraPrefs=JSON.parse(JSON.stringify(candidate));
    }catch(_){
      lastKnownCameraPrefs=null;
    }
  }

  function buildCameraPrefsPayload(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    ensureConfig();
    var st=state();
    var p=st.config.cameraPrefs||{};
    var known=lastKnownCameraPrefs||{};
    // If FE lost calibration / bindings, prefer last known good snapshot.
    var gaze=p.gazeCalibration!=null?p.gazeCalibration:(known.gazeCalibration!=null?known.gazeCalibration:null);
    if(opts.clearGazeCalibration) gaze=null;
    var blinkBase=p.blinkBaseline!=null?p.blinkBaseline:(known.blinkBaseline!=null?known.blinkBaseline:null);
    var smartPtr=p.smartPointer!=null?p.smartPointer:(known.smartPointer!=null?known.smartPointer:null);
    if(opts.clearSmartPointer) smartPtr=null;
    var snapWin=p.snapWindow!=null?p.snapWindow:(known.snapWindow!=null?known.snapWindow:null);
    var autoMute=p.autoMute!=null?p.autoMute:(known.autoMute!=null?known.autoMute:null);
    var pa=p.presenceActions&&typeof p.presenceActions==='object'?p.presenceActions:{};
    var knownPa=known.presenceActions&&typeof known.presenceActions==='object'?known.presenceActions:{};
    var shouldRestorePresence=(presenceActionsLookStripped(pa)||presenceActionsAreBlank(pa))
      &&!presenceActionsAreBlank(knownPa)
      &&!opts.forceBlankPresence;
    if(shouldRestorePresence){
      pa=Object.assign({},knownPa);
      // Keep FE in sync so UI / next save stay consistent.
      if(st.config.cameraPrefs) st.config.cameraPrefs.presenceActions=pa;
    }
    if(p.gazeCalibration==null&&gaze!=null&&st.config.cameraPrefs){
      st.config.cameraPrefs.gazeCalibration=gaze;
    }
    if(p.blinkBaseline==null&&blinkBase!=null&&st.config.cameraPrefs){
      st.config.cameraPrefs.blinkBaseline=blinkBase;
    }
    if(p.smartPointer==null&&smartPtr!=null&&st.config.cameraPrefs){
      st.config.cameraPrefs.smartPointer=smartPtr;
    }
    if(p.snapWindow==null&&snapWin!=null&&st.config.cameraPrefs){
      st.config.cameraPrefs.snapWindow=snapWin;
    }
    if(p.autoMute==null&&autoMute!=null&&st.config.cameraPrefs){
      st.config.cameraPrefs.autoMute=autoMute;
    }
    var tr=pa.triggers&&typeof pa.triggers==='object'?pa.triggers:{};
    var presenceEnabled=!!pa.enabled;
    var deviceId=String(p.selectedDeviceId||known.selectedDeviceId||'').trim();
    var ve=p.videoEnhancement&&typeof p.videoEnhancement==='object'
      ?p.videoEnhancement
      :(known.videoEnhancement&&typeof known.videoEnhancement==='object'?known.videoEnhancement:null);
    if((!p.videoEnhancement||typeof p.videoEnhancement!=='object')&&ve&&st.config.cameraPrefs){
      st.config.cameraPrefs.videoEnhancement=normalizeVideoEnhancementPrefs(ve);
    }
    return {
      enabled:presenceEnabled,
      selectedDeviceId:deviceId,
      previewEnabled:false,
      selectedWidth:Math.max(0,Number(p.selectedWidth!=null?p.selectedWidth:known.selectedWidth)||0)|0,
      selectedHeight:Math.max(0,Number(p.selectedHeight!=null?p.selectedHeight:known.selectedHeight)||0)|0,
      selectedFrameRate:Math.max(0,Number(p.selectedFrameRate!=null?p.selectedFrameRate:known.selectedFrameRate)||0)|0,
      gazeCalibration:gaze,
      clearGazeCalibration:!!opts.clearGazeCalibration,
      blinkBaseline:blinkBase,
      smartPointer:smartPtr,
      snapWindow:snapWin,
      autoMute:autoMute,
      clearSmartPointer:!!opts.clearSmartPointer,
      presenceActions:{
        enabled:presenceEnabled,
        triggers:{
          away:tr.away!==undefined?!!tr.away:(String(pa.onAway||'none')!=='none'||String(pa.onReturn||'none')!=='none'),
          shake:tr.shake!==undefined?!!tr.shake:String(pa.shakeHead||'none')!=='none',
          blink:tr.blink!==undefined?!!tr.blink:String(pa.deliberateBlink||'none')!=='none',
          openPalm:tr.openPalm!==undefined?!!tr.openPalm:String(pa.openPalm||'none')!=='none',
          okHand:tr.okHand!==undefined?!!tr.okHand:String(pa.okHand||'none')!=='none',
          fist:tr.fist!==undefined?!!tr.fist:String(pa.fist||'none')!=='none',
          wave:tr.wave!==undefined?!!tr.wave:String(pa.wave||'none')!=='none'
        },
        onAway:String(pa.onAway||'none').trim()||'none',
        onReturn:String(pa.onReturn||'none').trim()||'none',
        shakeHead:String(pa.shakeHead||'none').trim()||'none',
        deliberateBlink:String(pa.deliberateBlink||'none').trim()||'none',
        openPalm:String(pa.openPalm||'none').trim()||'none',
        okHand:String(pa.okHand||'none').trim()||'none',
        fist:String(pa.fist||'none').trim()||'none',
        wave:String(pa.wave||'none').trim()||'none',
        awayMs:Math.max(1000,Math.min(30000,Number(pa.awayMs!=null?pa.awayMs:pa.away_ms)||3000))|0,
        presentMs:Math.max(500,Math.min(10000,Number(pa.presentMs!=null?pa.presentMs:pa.present_ms)||1000))|0,
        shakeHow:(function(){
          var h=String(pa.shakeHow!=null?pa.shakeHow:pa.shake_how||'normal').trim().toLowerCase();
          return (h==='easy'||h==='strong')?h:'normal';
        })(),
        shakeConfirmCue:(function(){
          var v=pa.shakeConfirmCue!=null?pa.shakeConfirmCue:pa.shake_confirm_cue;
          if(v===undefined||v===null) return true;
          return !!v;
        })(),
        blinkCloseSec:(function(){
          var raw=pa.blinkCloseSec!=null?pa.blinkCloseSec:(pa.blink_close_sec!=null?pa.blink_close_sec:(pa.blinkCloseHow!=null?pa.blinkCloseHow:pa.blink_close_how));
          var s=String(raw==null?'':raw).trim().toLowerCase();
          if(s==='easy'||s==='short'||s==='light'||s==='quick'||s==='normal') return 0.6;
          if(s==='long'||s==='strong'||s==='hard'||s==='firm') return 1;
          var n=Number(raw);
          if(n===0.6||n===1||n===2) return n;
          if(n===600) return 0.6;
          if(n===1000) return 1;
          if(n===2000) return 2;
          return 0.6;
        })(),
        blinkConfirmCue:(function(){
          var v=pa.blinkConfirmCue!=null?pa.blinkConfirmCue:pa.blink_confirm_cue;
          if(v===undefined||v===null) return true;
          return !!v;
        })()
      },
      videoEnhancement:normalizeVideoEnhancementPrefs(ve)
    };
  }

  /** Camera prefs only — no mapping merge / voice restart / mvp_init pull. */
  var pendingCameraPrefsQuiet=null;

  function saveCameraPrefsQuiet(opts){
    if(!configLoadedFromBackend){
      pendingCameraPrefsQuiet=opts&&typeof opts==='object'?opts:{};
      earlyPersistLog('saveCameraPrefsQuiet deferred (config not loaded)');
      return Promise.resolve(false);
    }
    pendingCameraPrefsQuiet=null;
    var invoke=global.__vp_invoke__;
    if(!invoke) return Promise.resolve(false);
    var payload;
    try{
      // Skip no-op blank writes that would only risk wiping richer disk state.
      // (Rust also guards; this avoids needless quiet saves during bootstrap.)
      var built=buildCameraPrefsPayload(opts);
      if(cameraPrefsLookBlank(built)&&lastKnownCameraPrefs&&!cameraPrefsLookBlank(lastKnownCameraPrefs)
        &&!(opts&&opts.forceBlankPresence)){
        earlyPersistLog('saveCameraPrefsQuiet skipped blank payload vs lastKnown');
        return Promise.resolve(false);
      }
      payload=JSON.stringify(built);
    }catch(err){
      if(typeof console!=='undefined'&&console.error){
        console.error('cmd_save_camera_prefs build failed',err);
      }
      return Promise.resolve(false);
    }
    return invoke('cmd_save_camera_prefs',{json:payload}).then(function(){
      try{
        var parsed=JSON.parse(payload);
        delete parsed.clearGazeCalibration;
        delete parsed.clearSmartPointer;
        lastKnownCameraPrefs=parsed;
      }catch(_){}
      return true;
    }).catch(function(err){
      if(typeof console!=='undefined'&&console.error){
        console.error('cmd_save_camera_prefs',err);
      }
      return false;
    });
  }

  function flushPendingCameraPrefsQuiet(){
    if(pendingCameraPrefsQuiet==null) return;
    var opts=pendingCameraPrefsQuiet;
    pendingCameraPrefsQuiet=null;
    var st=state();
    var cur=st&&st.config&&st.config.cameraPrefs;
    // Deferred pre-hydrate quiet saves often carried invented defaults. After
    // mvp_init, only flush when current FE prefs look intentional (or force).
    if(!(opts&&opts.forceBlankPresence)&&cameraPrefsLookBlank(cur)&&lastKnownCameraPrefs&&!cameraPrefsLookBlank(lastKnownCameraPrefs)){
      earlyPersistLog('flushPendingCameraPrefsQuiet skipped blank vs lastKnown');
      return;
    }
    if(!(opts&&opts.forceBlankPresence)&&cameraPrefsLookBlank(cur)&&(!lastKnownCameraPrefs||cameraPrefsLookBlank(lastKnownCameraPrefs))){
      earlyPersistLog('flushPendingCameraPrefsQuiet skipped blank bootstrap');
      return;
    }
    saveCameraPrefsQuiet(opts);
  }

  function isAppScopedMapping(m){
    if(!m||typeof m!=='object') return false;
    if(String(m.appTargetId||m.app_target_id||'').trim()) return true;
    // Align with habit-override-diff: preset chips on universal ≠ app scenario.
    // Only concrete process binds (or custom) count as recoverable app rows.
    var rules=m.appBehaviorRules||m.app_behavior_rules;
    if(!Array.isArray(rules)) return false;
    for(var i=0;i<rules.length;i++){
      var r=rules[i];
      if(!r) continue;
      var appId=String(r.appId||'').trim();
      var match=r.match;
      if(match&&typeof match==='object'){
        var hasExe=Array.isArray(match.exeNames)&&match.exeNames.some(function(x){ return String(x||'').trim(); });
        var hasPath=!!String(match.fullPath||match.full_path||match.pathContains||'').trim();
        var hasTitle=!!String(match.titleContains||'').trim();
        if(hasExe||hasPath||hasTitle) return true;
      }
      if(appId==='custom') return true;
    }
    return false;
  }

  function persistAppScenarioBackup(){
    try{
      if(!global.localStorage) return;
      var list=[];
      Object.keys(lastKnownAppScenarios).forEach(function(id){
        var m=lastKnownAppScenarios[id];
        if(m&&isAppScopedMapping(m)) list.push(m);
      });
      global.localStorage.setItem(APP_SCENARIO_BACKUP_KEY,JSON.stringify(list));
    }catch(_){}
  }

  function loadAppScenarioBackup(){
    try{
      if(!global.localStorage) return;
      var raw=global.localStorage.getItem(APP_SCENARIO_BACKUP_KEY);
      if(!raw) return;
      var list=JSON.parse(raw);
      if(!Array.isArray(list)) return;
      var n=0;
      list.forEach(function(m){
        if(!m||!m.id||!isAppScopedMapping(m)) return;
        lastKnownAppScenarios[String(m.id)]=m;
        n++;
      });
      if(n) earlyPersistLog('app-scenario backup loaded n='+n);
    }catch(_){}
  }

  function forgetAppScenarioIds(ids){
    if(!ids||!ids.length) return;
    var changed=false;
    ids.forEach(function(id){
      id=String(id||'').trim();
      if(!id||!lastKnownAppScenarios[id]) return;
      delete lastKnownAppScenarios[id];
      changed=true;
    });
    if(changed) persistAppScenarioBackup();
  }

  function rememberAppScenariosFromConfig(cfg){
    if(!cfg||typeof cfg!=='object') return;
    var maps=Array.isArray(cfg.mappings)?cfg.mappings:[];
    var rules=global.OneToneAppBehaviorRules;
    maps.forEach(function(m){
      if(!m||!m.id||!isAppScopedMapping(m)) return;
      // Bare custom stubs are not habits yet — never backup/reinject them.
      if(rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(m)){
        delete lastKnownAppScenarios[String(m.id)];
        return;
      }
      try{
        lastKnownAppScenarios[String(m.id)]=JSON.parse(JSON.stringify(m));
      }catch(_){
        lastKnownAppScenarios[String(m.id)]=m;
      }
    });
    (cfg.trash||[]).forEach(function(m){
      if(m&&m.id) delete lastKnownAppScenarios[String(m.id)];
    });
    persistAppScenarioBackup();
  }

  function reinjectRememberedAppScenarios(cfg){
    if(!cfg||typeof cfg!=='object') return 0;
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    var ids={};
    cfg.mappings.forEach(function(m){ if(m&&m.id) ids[String(m.id)]=true; });
    var trashIds={};
    (cfg.trash||[]).forEach(function(m){ if(m&&m.id) trashIds[String(m.id)]=true; });
    var rules=global.OneToneAppBehaviorRules;
    var added=0;
    Object.keys(lastKnownAppScenarios).forEach(function(id){
      if(ids[id]||trashIds[id]) return;
      var snap=lastKnownAppScenarios[id];
      if(!snap||!isAppScopedMapping(snap)) return;
      if(rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(snap)){
        delete lastKnownAppScenarios[id];
        return;
      }
      try{
        cfg.mappings.push(JSON.parse(JSON.stringify(snap)));
      }catch(_){
        cfg.mappings.push(snap);
      }
      ids[id]=true;
      added++;
    });
    return added;
  }

  /** Keep in-memory app scenarios when a stale mvp_init omits them (before next save). */
  function mergeLocalVoiceDrafts(localCfg,inboundCfg){
    if(!inboundCfg||typeof inboundCfg!=='object') return inboundCfg;
    var localMaps=localCfg&&Array.isArray(localCfg.mappings)?localCfg.mappings:[];
    if(!localMaps.length) return inboundCfg;
    var inboundMaps=Array.isArray(inboundCfg.mappings)?inboundCfg.mappings.slice():[];
    var inboundIds={};
    inboundMaps.forEach(function(m){ if(m&&m.id) inboundIds[String(m.id)]=true; });
    var trashIds={};
    (inboundCfg.trash||[]).forEach(function(m){ if(m&&m.id) trashIds[String(m.id)]=true; });
    var added=false;
    localMaps.forEach(function(m){
      if(!m||!m.id||inboundIds[String(m.id)]||trashIds[String(m.id)]) return;
      var vs=global.OneToneVoiceSchemePersist;
      if(!vs||!vs.isVoiceOnly||!vs.isVoiceOnly(m)) return;
      inboundMaps.push(m);
      inboundIds[String(m.id)]=true;
      added=true;
    });
    if(added) inboundCfg.mappings=inboundMaps;
    return inboundCfg;
  }

  function mergeLocalAppScenarios(localCfg,inboundCfg){
    if(!inboundCfg||typeof inboundCfg!=='object') return inboundCfg;
    rememberAppScenariosFromConfig(localCfg);
    rememberAppScenariosFromConfig(inboundCfg);
    var localMaps=localCfg&&Array.isArray(localCfg.mappings)?localCfg.mappings:[];
    if(!localMaps.length){
      reinjectRememberedAppScenarios(inboundCfg);
      return inboundCfg;
    }
    var inboundMaps=Array.isArray(inboundCfg.mappings)?inboundCfg.mappings.slice():[];
    var inboundIds={};
    inboundMaps.forEach(function(m){ if(m&&m.id) inboundIds[String(m.id)]=true; });
    var trashIds={};
    (inboundCfg.trash||[]).forEach(function(m){ if(m&&m.id) trashIds[String(m.id)]=true; });
    var added=false;
    localMaps.forEach(function(m){
      if(!m||!m.id||inboundIds[String(m.id)]||trashIds[String(m.id)]) return;
      if(!isAppScopedMapping(m)) return;
      inboundMaps.push(m);
      inboundIds[String(m.id)]=true;
      added=true;
    });
    // Same id present but appTargetId cleared by a partial FE state — restore.
    inboundMaps.forEach(function(m){
      if(!m||!m.id) return;
      if(String(m.appTargetId||m.app_target_id||'').trim()) return;
      var local=null;
      for(var i=0;i<localMaps.length;i++){
        if(localMaps[i]&&String(localMaps[i].id)===String(m.id)){ local=localMaps[i]; break; }
      }
      if(!local||!isAppScopedMapping(local)) return;
      m.appTargetId=String(local.appTargetId||local.app_target_id||'');
      if((!m.appBehaviorRules||!m.appBehaviorRules.length)&&local.appBehaviorRules&&local.appBehaviorRules.length){
        m.appBehaviorRules=local.appBehaviorRules;
      }
      added=true;
    });
    if(added) inboundCfg.mappings=inboundMaps;
    reinjectRememberedAppScenarios(inboundCfg);
    return inboundCfg;
  }

  function applySchemeSwitchedRuntime(msg){
    msg=msg||{};
    var st=state();
    // Cold start / no FE config yet — must take full init once.
    if(!st.config||!Array.isArray(st.config.mappings)||!st.config.mappings.length){
      if(msg.config){
        applyMvpInit({type:'mvp_init',config:msg.config,conflicts:msg.conflicts});
      }
      return;
    }
    ensureConfig();
    var toId=String(msg.toId||'').trim();
    if(!toId&&msg.config){
      toId=String(msg.config.activeSceneId||msg.config.active_scene_id||'').trim();
    }
    if(toId) st.config.activeSceneId=toId;

    // Merge only runtime switch fields. Keep FE editing drafts / selectedMappingId intact.
    // Full applyMvpInit here used to remount editors and 假死 the home switch path.
    var inbound=msg.config&&Array.isArray(msg.config.mappings)?msg.config.mappings:null;
    if(inbound&&inbound.length){
      var byId={};
      for(var i=0;i<inbound.length;i++){
        var src=inbound[i];
        if(src&&src.id) byId[String(src.id)]=src;
      }
      (st.config.mappings||[]).forEach(function(local){
        if(!local||!local.id) return;
        var remote=byId[String(local.id)];
        if(!remote) return;
        if(remote.enabled!=null) local.enabled=!!remote.enabled;
        if(remote.lastUsedAt!=null) local.lastUsedAt=remote.lastUsedAt;
        else if(remote.last_used_at!=null) local.lastUsedAt=remote.last_used_at;
        if(remote.useCount!=null) local.useCount=remote.useCount;
        else if(remote.use_count!=null) local.useCount=remote.use_count;
      });
    }
    // No inbound mappings: only activeSceneId. Do not exclusive-enable — Rust
    // select_scheme does not flip mapping.enabled, and that rewrite fought the rail.
    earlyPersistLog('applySchemeSwitchedRuntime to='+toId+
      ' maps='+(st.config.mappings?st.config.mappings.length:0)+
      ' edit='+String(st.selectedMappingId==null?'null':st.selectedMappingId));
    if(global.OneToneHomeWorkbench){
      try{
        if(global.OneToneHomeWorkbench.forceHomeRender) global.OneToneHomeWorkbench.forceHomeRender();
        var wb=global.OneToneHomeWorkbench;
        requestAnimationFrame(function(){
          try{ if(wb&&wb.render) wb.render(); }catch(_){}
        });
      }catch(_){}
    }
  }

  function applyMvpInit(msg){
    if(!msg||typeof msg!=='object') return;
    try{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag) global.OneToneUiHeartbeat.setTag('applyMvpInit');
      else global.__otActivityTag='applyMvpInit';
    }catch(_){}
    if(!hooksReady()){
      pendingMvpInitMsg=msg;
      if(msg.config){
        var earlyLocal=state().config;
        var earlyInbound=normalizeInboundConfig(msg.config);
        if(configLoadedFromBackend) mergeLocalAppScenarios(earlyLocal,earlyInbound);
        state().config=earlyInbound;
        try{
          var earlyHold=global.OneToneVoiceWake&&global.OneToneVoiceWake.getStrategyHold&&global.OneToneVoiceWake.getStrategyHold();
          if(earlyHold&&state().config) state().config.voiceListeningStrategy=earlyHold;
        }catch(_){}
        if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.applyPendingEnable){
          global.OneToneMappingEditActions.applyPendingEnable(state().config);
        }
      }
      return;
    }
    try{
      const fp=mvpInitFingerprint(msg);
      const now=Date.now();
      // Same payload always no-ops once loaded — focus/echo used a 600ms window and
      // remounted MediaPipe + home after that (首页点击假死).
      if(fp&&fp===lastMvpInitKey&&configLoadedFromBackend&&configHasSceneData()){
        lastMvpInitAt=now;
        return;
      }
      if(fp){ lastMvpInitKey=fp; lastMvpInitAt=now; }
      const st=state();
      var heldStrategy=null;
      try{
        if(global.OneToneVoiceWake&&typeof global.OneToneVoiceWake.getStrategyHold==='function'){
          heldStrategy=global.OneToneVoiceWake.getStrategyHold();
        }
        if(!heldStrategy&&global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending()){
          heldStrategy=String((st.config&&(st.config.voiceListeningStrategy||st.config.voice_listening_strategy))||'').trim()||null;
        }
      }catch(_){ heldStrategy=null; }
      if(msg.config){
        var inbound=normalizeInboundConfig(msg.config);
        var rustMapN=Array.isArray(msg.config.mappings)?msg.config.mappings.length:0;
        if(configLoadedFromBackend){
          mergeLocalAppScenarios(st.config,inbound);
          mergeLocalVoiceDrafts(st.config,inbound);
        }
        // Always reinject localStorage / in-memory app scenarios omitted by a partial payload.
        reinjectRememberedAppScenarios(inbound);
        st.config=inbound;
        st.__vp_rustMapN=rustMapN;
      }
      if(heldStrategy&&st.config){
        st.config.voiceListeningStrategy=heldStrategy;
      }
      if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.applyPendingEnable){
        global.OneToneMappingEditActions.applyPendingEnable(st.config);
      }
      const setConflictRows=hookFn('setConflictRows');
      if(Array.isArray(msg.conflicts)&&setConflictRows) setConflictRows(msg.conflicts);
      const normalizeUpdate=hookFn('normalizeUpdateState');
      const defaultUpdate=hookFn('defaultUpdateState');
      if(msg.update&&normalizeUpdate) st.update=normalizeUpdate(msg.update);
      else if(!st.update&&defaultUpdate) st.update=defaultUpdate();
      ensureConfig();
      // Do NOT force selectedMappingId = activeSceneId here.
      // Runtime switch / full config sync must preserve editing selection
      // (including null = global voice/camera base). Heal-only lives in ensureConfig.
      // mvp_scheme_switched uses applySchemeSwitchedRuntime (light merge) — not this path.
      const toggleBusy=voiceToggleBusy();
      const selectedMapping=hookFn('selectedMapping');
      const m=selectedMapping?selectedMapping():null;
      const getEditorTriggerKey=hookFn('getEditorTriggerKey');
      const getEditorTargetKey=hookFn('getEditorTargetKey');
      const localCaptureGuardUntil=hookFn('localCaptureGuardUntil');
      const keepTrigger=getEditorTriggerKey?getEditorTriggerKey():'';
      const keepTarget=getEditorTargetKey?getEditorTargetKey():'';
      const guardLocal=localCaptureGuardUntil?Date.now()<localCaptureGuardUntil():false;
      if(guardLocal&&m){
        if(keepTrigger) m.triggerKey=keepTrigger;
        if(keepTarget) m.targetKey=keepTarget;
        if(keepTrigger||keepTarget){
          m.label=(keepTrigger||'?')+' → '+(keepTarget||'?');
        }
      }else if(m){
        if(keepTrigger&&!(m.triggerKey||'').trim()) m.triggerKey=keepTrigger;
        if(keepTarget&&!(m.targetKey||'').trim()){
          m.targetKey=keepTarget;
          m.label=(m.triggerKey||'?')+' → '+keepTarget;
        }
      }
      const syncEditor=hookFn('syncEditorFromSelection');
      if(syncEditor&&!bootSettling()&&!mvpInitHeavyRemountBlocked()) syncEditor();
      configLoadedFromBackend=true;
      pendingMvpInitMsg=null;
      clearTimeout(configBootstrapWatchdog);
      rememberAppScenariosFromConfig(st.config);
      reinjectRememberedAppScenarios(st.config);
      rememberCameraPrefsFromConfig(st.config);
      // If disk/inbound came back blank but this session still holds richer
      // lastKnown (quiet-save wipe race), reinject and heal disk.
      if(lastKnownCameraPrefs&&cameraPrefsLookBlank(st.config.cameraPrefs)&&!cameraPrefsLookBlank(lastKnownCameraPrefs)){
        try{
          st.config.cameraPrefs=JSON.parse(JSON.stringify(lastKnownCameraPrefs));
          earlyPersistLog('applyMvpInit reinjected cameraPrefs from lastKnown');
          saveCameraPrefsQuiet();
        }catch(_){}
      }
      // FE may hold Codex/Cursor rows that disk omitted — write them back.
      var rustMapN=Number(st.__vp_rustMapN)||0;
      var finalMapN=st.config.mappings?st.config.mappings.length:0;
      if(finalMapN>rustMapN){
        var uiHeal=global.OneToneState&&global.OneToneState.ui;
        // In-memory voice drafts (persist:false) are not on disk yet — do not auto cmd_save.
        if(uiHeal&&uiHeal.drawerOpen&&uiHeal.settingsPanel==='voiceWake'){
          earlyPersistLog('applyMvpInit skip disk heal on voiceWake (local voice drafts)');
        }else{
          earlyPersistLog('applyMvpInit heal disk maps '+rustMapN+' -> '+finalMapN);
          save({source:'mapping'});
        }
      }
      try{ delete st.__vp_rustMapN; }catch(_){}
      flushPendingCameraPrefsQuiet();
      earlyPersistLog('applyMvpInit ok maps='+(st.config.mappings?st.config.mappings.length:0)+
        ' appRemembered='+Object.keys(lastKnownAppScenarios).length);
      if(bootSettling()||mvpInitHeavyRemountBlocked()){
        scheduleDeferredMvpInitSideEffects();
        try{
          var session=global.OneToneAppSession;
          if(session&&typeof session.noteBackendConfigReady==='function') session.noteBackendConfigReady();
        }catch(_){}
        var paintHome=hookFn('renderHome');
        if(paintHome){
          requestAnimationFrame(function(){
            try{ paintHome(); }catch(_){}
          });
        }
        try{
          if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag) global.OneToneUiHeartbeat.clearTag('applyMvpInit');
          else if(global.__otActivityTag==='applyMvpInit') global.__otActivityTag='';
        }catch(_){}
        return;
      }
      // Defer islands + heavy remount off this turn — sync IslandsRefresh + camera
      // reconcile after ok previously left Responding=False (ui_hb tag=applyMvpInit).
      setTimeout(function(){
        try{
          var wake=global.OneToneVoiceWake;
          if(wake&&typeof wake.isModeSwitchPending==='function'&&wake.isModeSwitchPending()){
            global.__otPendingIslandsRefresh=true;
          }else if(typeof global.OneToneIslandsRefresh==='function'){
            global.OneToneIslandsRefresh();
          }
        }catch(_){}
        if(lastSaveCompletedAt&&Date.now()-lastSaveCompletedAt<3000){
          earlyPersistLog('applyMvpInit skip heavy side effects (post-save echo)');
          return;
        }
        try{
          var habitHub=global.OneToneHabitHub;
          if(habitHub&&habitHub.reconcileDuplicatePresetScenarios){
            habitHub.reconcileDuplicatePresetScenarios();
          }
        }catch(_){}
        runMvpInitHeavySideEffects();
      },0);
      try{
        if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag) global.OneToneUiHeartbeat.clearTag('applyMvpInit');
        else if(global.__otActivityTag==='applyMvpInit') global.__otActivityTag='';
      }catch(_){}
    }catch(err){
      console.error('applyMvpInit',err);
      pendingMvpInitMsg=msg;
      try{
        if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag) global.OneToneUiHeartbeat.clearTag('applyMvpInit');
        else if(global.__otActivityTag==='applyMvpInit') global.__otActivityTag='';
      }catch(_){}
    }
  }

  function flushPendingMvpInit(){
    if(!pendingMvpInitMsg||!hooksReady()) return false;
    const msg=pendingMvpInitMsg;
    pendingMvpInitMsg=null;
    applyMvpInit(msg);
    return true;
  }

  function unwrapMvpInitMsg(raw){
    if(!raw||typeof raw!=='object') return null;
    if(raw.type==='mvp_init'||raw.config) return raw;
    if(raw.payload&&typeof raw.payload==='object') return unwrapMvpInitMsg(raw.payload);
    if(raw.data&&typeof raw.data==='object') return unwrapMvpInitMsg(raw.data);
    if(raw.message&&typeof raw.message==='object') return unwrapMvpInitMsg(raw.message);
    return null;
  }

  function applyRawMvpInit(raw){
    const msg=unwrapMvpInitMsg(raw);
    if(!msg) return false;
    applyMvpInit(msg);
    return true;
  }

  function configHasSceneData(){
    const cfg=state().config;
    if(!cfg||!Array.isArray(cfg.mappings)||!cfg.mappings.length) return false;
    const activeId=String(cfg.activeSceneId||cfg.active_scene_id||'').trim();
    const m=activeId?cfg.mappings.find(function(x){ return x.id===activeId; }):cfg.mappings[0];
    if(!m) return false;
    const trig=String(m.triggerKey||m.trigger_key||'').trim();
    const tgt=String(m.targetKey||m.target_key||'').trim();
    return !!(trig&&tgt);
  }

  var pullBackendConfigTimer=0;
  var pullBackendConfigInFlight=false;
  function pullBackendConfig(){
    if(!tauriBridgeReady()) return Promise.resolve(false);
    // Pad / keys / camera open: cmd_ready → applyMvpInit remount storm 假死's the UI (esp. MediaPipe).
    if(mvpInitHeavyRemountBlocked()) return Promise.resolve(false);
    try{
      var ui=global.OneToneState&&global.OneToneState.ui;
      if(ui&&ui.drawerOpen&&ui.settingsPanel==='voiceWake') return Promise.resolve(false);
    }catch(_){}
    if(bootSettling()&&configLoadedFromBackend&&configHasSceneData()) return Promise.resolve(false);
    clearTimeout(pullBackendConfigTimer);
    return new Promise(function(resolve){
      pullBackendConfigTimer=setTimeout(function(){
        if(pullBackendConfigInFlight){
          resolve(false);
          return;
        }
        pullBackendConfigInFlight=true;
        global.OneToneIpc.invokeTimeout('cmd_ready',{},4000).then(function(raw){
          pullBackendConfigInFlight=false;
          const msg=unwrapMvpInitMsg(raw);
          if(msg){
            applyMvpInit(msg);
            resolve(true);
            return;
          }
          resolve(false);
        }).catch(function(err){
          pullBackendConfigInFlight=false;
          console.error('pullBackendConfig',err);
          resolve(false);
        });
      },150);
    });
  }

  var configSyncPollTimer=0;
  function startConfigSyncPoll(ms,maxAttempts){
    if(bootSettling()){
      var session=global.OneToneAppSession;
      if(session&&session.whenBootSettled){
        session.whenBootSettled(function(){ startConfigSyncPoll(ms,maxAttempts); });
      }
      return;
    }
    maxAttempts=maxAttempts||15;
    clearInterval(configSyncPollTimer);
    var left=maxAttempts;
    configSyncPollTimer=setInterval(function(){
      left--;
      if(configLoadedFromBackend&&configHasSceneData()){
        clearInterval(configSyncPollTimer);
        return;
      }
      pullBackendConfig();
      if(left<=0) clearInterval(configSyncPollTimer);
    },ms||1500);
  }

  function tauriBridgeReady(){
    const ipc=global.OneToneIpc;
    return !!(ipc&&typeof ipc.bridgeReady==='function'&&ipc.bridgeReady());
  }

  function unlockConfigUi(){
    if(configLoadedFromBackend) return;
    if(flushPendingMvpInit()) return;
    if(tauriBridgeReady()){
      global.OneToneIpc.invokeTimeout('cmd_ready',{},4000).then(function(raw){
        const msg=unwrapMvpInitMsg(raw);
        if(msg) applyMvpInit(msg);
        if(!configLoadedFromBackend) requestBackendConfig(4);
      }).catch(function(err){
        console.error('unlockConfigUi cmd_ready',err);
        if(!configLoadedFromBackend) requestBackendConfig(4);
      });
      return;
    }
    requestBackendConfig(4);
  }

  function scheduleConfigBootstrapWatchdog(ms){
    clearTimeout(configBootstrapWatchdog);
    configBootstrapWatchdog=setTimeout(function(){
      unlockConfigUi();
    },ms||5000);
  }

  function requestBackendConfig(retry){
    scheduleConfigBootstrapWatchdog(5000);
    if(global.__vp_ensure_to_js__) global.__vp_ensure_to_js__();
    if(!tauriBridgeReady()){
      if(retry>0) setTimeout(function(){ requestBackendConfig(retry-1); },120);
      else setTimeout(unlockConfigUi,1500);
      return;
    }
    global.OneToneIpc.invokeTimeout('cmd_ready',{},4000).then(function(raw){
      const msg=unwrapMvpInitMsg(raw);
      if(msg){
        applyMvpInit(msg);
        return;
      }
      if(!configLoadedFromBackend&&retry>0){
        setTimeout(function(){ requestBackendConfig(retry-1); },400);
      }
    }).catch(function(err){
      console.error('cmd_ready',err);
      if(!configLoadedFromBackend&&retry>0){
        setTimeout(function(){ requestBackendConfig(retry-1); },400);
      }
    });
  }

  function fallbackConfigLoaded(){
    if(configLoadedFromBackend) return;
    if(global.__vp_ensure_to_js__) global.__vp_ensure_to_js__();
    if(tauriBridgeReady()){
      global.OneToneIpc.invokeTimeout('cmd_ready',{},3000).then(function(raw){
        if(configLoadedFromBackend) return;
        const msg=unwrapMvpInitMsg(raw);
        if(msg) applyMvpInit(msg);
      }).catch(function(err){
        console.error('fallback cmd_ready',err);
      });
    }
    setTimeout(unlockConfigUi,2000);
  }

  function installToJsReady(){
    global.__vp_on_to_js_ready__=function(){
      if(configLoadedFromBackend&&configHasSceneData()) return;
      flushPendingMvpInit();
      if(configLoadedFromBackend&&configHasSceneData()) return;
      if(!tauriBridgeReady()) return;
      global.OneToneIpc.invokeTimeout('cmd_ready',{},3000).then(function(raw){
        if(configLoadedFromBackend&&configHasSceneData()) return;
        const msg=unwrapMvpInitMsg(raw);
        if(msg) applyMvpInit(msg);
      }).catch(function(err){
        console.error('to_js ready cmd_ready',err);
      });
    };
  }

  global.OneToneConfigPersist={
    defaultConfig:defaultConfig,
    ensureConfig:ensureConfig,
    buildSavePayload:buildSavePayload,
    save:save,
    saveAsync:saveAsync,
    suppressUnknownSave:function(ms){
      var until=Date.now()+Math.max(0,Number(ms)||0);
      if(until>suppressUnknownSaveUntil) suppressUnknownSaveUntil=until;
      earlyPersistLog('cmd_save suppress unknown until +'+Math.max(0,Number(ms)||0)+'ms');
    },
    saveCameraPrefsQuiet:saveCameraPrefsQuiet,
    rememberCameraPrefs:function(){ rememberCameraPrefsFromConfig(state().config); },
    applyMvpInit:applyMvpInit,
    mvpInitHeavyRemountBlocked:mvpInitHeavyRemountBlocked,
    applySchemeSwitchedRuntime:applySchemeSwitchedRuntime,
    applyRawMvpInit:applyRawMvpInit,
    flushPendingMvpInit:flushPendingMvpInit,
    flushDeferredMvpInitSideEffects:flushDeferredMvpInitSideEffects,
    cancelBootCameraSchedule:cancelBootCameraSchedule,
    pullBackendConfig:pullBackendConfig,
    startConfigSyncPoll:startConfigSyncPoll,
    requestBackendConfig:requestBackendConfig,
    fallbackConfigLoaded:fallbackConfigLoaded,
    isLoaded:function(){ return configLoadedFromBackend; },
    rememberAppScenariosNow:rememberAppScenariosFromConfig,
    forgetAppScenarioIds:forgetAppScenarioIds,
    installToJsReady:installToJsReady,
    normalizeVoiceCommands:normalizeVoiceCommands,
    serializeVoiceCommands:serializeVoiceCommands,
    rekeyVoiceCommandsForMapping:rekeyVoiceCommandsForMapping,
    newVoiceCommandId:newVoiceCommandId,
    normalizeAcousticVoiceCommands:normalizeAcousticVoiceCommands,
    normalizeGlobalAcousticVoiceCommands:normalizeGlobalAcousticVoiceCommands,
    serializeAcousticVoiceCommands:serializeAcousticVoiceCommands,
    rekeyAcousticVoiceCommandsForMapping:rekeyAcousticVoiceCommandsForMapping,
    newAcousticVoiceCommandId:newAcousticVoiceCommandId,
    newAcousticVoiceSampleId:newAcousticVoiceSampleId,
    ACOUSTIC_FEATURE_DIMS:ACOUSTIC_FEATURE_DIMS,
    ACOUSTIC_MAX_FEATURE_FRAMES:ACOUSTIC_MAX_FEATURE_FRAMES,
    ACOUSTIC_PREVIEW_MAX_BYTES:ACOUSTIC_PREVIEW_MAX_BYTES,
    normalizePreviewPcmB64:normalizePreviewPcmB64
  };
  installToJsReady();
  loadAppScenarioBackup();
})((typeof window!=='undefined')?window:globalThis);
