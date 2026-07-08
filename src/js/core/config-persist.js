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

  function hookFn(name){
    const h=hooks();
    const fn=h&&h[name];
    return typeof fn==='function'?fn:null;
  }

  function hooksReady(){
    return !!(hookFn('newMappingId')&&hookFn('renderHome')&&hookFn('syncEditorFromSelection'));
  }

  function normalizeAppBehaviorRules(rules){
    if(!Array.isArray(rules)) return [];
    return rules.map(function(r){
      if(!r||typeof r!=='object') return null;
      var appId=String(r.appId||r.app_id||'').trim();
      if(!appId) return null;
      var out={
        appId:appId,
        finishMode:String(r.finishMode||r.finish_mode||'confirm').trim()||'confirm',
        note:r.note!=null?String(r.note):''
      };
      var summon=r.summonPhrase!=null?r.summonPhrase:r.summon_phrase;
      if(summon!=null&&String(summon).trim()) out.summonPhrase=String(summon).trim();
      return out;
    }).filter(Boolean);
  }

  function serializeAppBehaviorRules(rules){
    return normalizeAppBehaviorRules(rules).map(function(r){
      var out={appId:r.appId,finishMode:r.finishMode,note:r.note||''};
      if(r.summonPhrase) out.summonPhrase=r.summonPhrase;
      return out;
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
    return out;
  }

  function normalizeInboundConfig(raw){
    if(!raw||typeof raw!=='object') return raw;
    const cfg=Object.assign({},raw);
    if(!cfg.activeSceneId&&cfg.active_scene_id) cfg.activeSceneId=String(cfg.active_scene_id);
    if(!cfg.voiceVosk&&cfg.voice_vosk) cfg.voiceVosk=cfg.voice_vosk;
    if(!cfg.voiceSapi&&cfg.voice_sapi) cfg.voiceSapi=cfg.voice_sapi;
    if(!cfg.voiceEnd&&cfg.voice_end) cfg.voiceEnd=cfg.voice_end;
    if(Array.isArray(cfg.mappings)){
      cfg.mappings=cfg.mappings.map(normalizeInboundMapping);
    }
    if(Array.isArray(cfg.trash)){
      cfg.trash=cfg.trash.map(normalizeInboundMapping);
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
    return maps.length+'|'+String(c.activeSceneId||c.active_scene_id||'')+'|'+maps.map(function(m){
      var rules=serializeAppBehaviorRules(m.appBehaviorRules||m.app_behavior_rules||[]);
      var rulesSig=rules.map(function(r){ return r.appId+':'+r.finishMode; }).join(',');
      return String(m.id||'')+':'+(m.enabled?1:0)+':'+String(m.triggerKey||m.trigger_key||'')+':'+String(m.targetKey||m.target_key||'')+':'+String(m.appTargetId||m.app_target_id||'')+':'+rulesSig;
    }).join(';')+'|v'+(vosk?1:0)+'|s'+(sapi?1:0);
  }

  function defaultConfig(){
    const pack=global.OneToneLocaleDefaults
      ?global.OneToneLocaleDefaults.contentPack(global.OneToneLocaleDefaults.contentLocale())
      :null;
    const targetKey=pack?pack.mappingTargetKey:'RAlt';
    const labelSuffix=pack?pack.mappingLabelSuffix:'RAlt';
    const id=hooks().newMappingId();
    return {
      version:6,
      activeSceneId:id,
      mappings:[{id:id,label:'AutoTrigger → '+labelSuffix,group:'默认',triggerKey:'AutoTrigger',targetKey:targetKey,enabled:true,order:0,triggerMode:'tap',intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,switchKeys:[],nativeKeyRestore:false,appTargetId:'',imePresetId:'',voiceOverride:null}],
      trash:[],
      intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,
      debounceMs:80,keyPressDurationMs:250,schemeSwitchKey:'',keyWakeSoundEnabled:false,coachHudEnabled:false,startMinimizedToTray:false,
      sounds:hooks().defaultSoundsConfig(),
      voiceSapi:{enabled:false,phrases:pack?pack.voiceSapiPhrases.slice():['开始输入','开始听写','开启输入','开始说话'],targetKey:pack?pack.voiceTargetKey:'RAlt',cooldownMs:2000,minConfidence:0.35},
      voiceVosk:{enabled:false,phrases:pack?pack.voiceVoskPhrases.slice():['开始输入','开始听写','打开听写','语音输入','开启输入'],targetKey:pack?pack.voiceTargetKey:'RAlt',cooldownMs:2000,modelPath:pack?pack.voskModelPath:'resources/vosk/vosk-model-small-cn-0.22',modelPreset:pack?pack.voskModelPreset:'cn-light'},
      voiceEnd:{enabled:false,phrasesZh:pack?pack.voiceEndPhrasesZh.slice():['结束输入','发出去'],phrasesEn:pack?pack.voiceEndPhrasesEn.slice():['end dictation','send it'],commitDelayMs:4000,commitKey:'Enter',dictationTimeoutMs:120000,autoSendEnabled:false,targetKey:pack?pack.voiceTargetKey:'RAlt'}
    };
  }

  function ensureConfig(){
    const st=state();
    if(!st.config||!Array.isArray(st.config.mappings)) st.config=defaultConfig();
    if(!Array.isArray(st.config.trash)) st.config.trash=[];
    if(!st.config.mappings.length){
      const newMappingId=hookFn('newMappingId');
      const id=newMappingId?newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
      st.config.mappings.push({id:id,label:'',group:'默认',triggerKey:'',targetKey:'',enabled:false,order:0,triggerMode:'tap'});
    }
    if(!st.config.activeSceneId){
      var enabled=st.config.mappings.find(function(m){return m.enabled;});
      st.config.activeSceneId=(enabled&&enabled.id)||st.config.mappings[0].id;
    }
    if(!st.selectedMappingId||!st.config.mappings.some(function(m){ return m.id===st.selectedMappingId; })){
      var active=String(st.config.activeSceneId||'').trim();
      st.selectedMappingId=(active&&st.config.mappings.some(function(m){ return m.id===active; })?active:st.config.mappings[0].id);
    }
    if(st.config.schemeSwitchKey===undefined||st.config.schemeSwitchKey===null) st.config.schemeSwitchKey='';
    st.config.schemeSwitchKey='';
    if(st.config.keyWakeSoundEnabled===undefined) st.config.keyWakeSoundEnabled=false;
    if(st.config.coachHudEnabled===undefined) st.config.coachHudEnabled=false;
    if(st.config.startMinimizedToTray===undefined) st.config.startMinimizedToTray=false;
    const ensureSounds=hookFn('ensureSoundsConfig');
    if(ensureSounds) ensureSounds();
    const ensureExtras=hookFn('ensureMappingExtras');
    if(ensureExtras){
      st.config.mappings.forEach(ensureExtras);
      (st.config.trash||[]).forEach(ensureExtras);
    }
  }

  function buildSavePayload(){
    ensureConfig();
    hooks().flushAllEditorToMappings();
    const st=state();
    const slots=hooks().soundSlotDefaults();
    const payload={
      version:6,
      activeSceneId:String(st.config.activeSceneId||st.selectedMappingId||''),
      mappings:st.config.mappings.map(function(m,i){
        hooks().ensureMappingExtras(m);
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.ensureRulesBeforeSave){
          global.OneToneAppBehaviorRules.ensureRulesBeforeSave(m);
        }
        const trig=hooks().editorTriggerForMapping(m);
        const tgt=hooks().editorTargetForMapping(m);
        return {id:m.id,label:m.label||((trig&&tgt)?((trig||'?')+' → '+(tgt||'?')):''),group:m.group||'默认',triggerKey:trig,targetKey:tgt,enabled:!!m.enabled,order:i,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore,imePresetId:String(m.imePresetId||''),appTargetId:String(m.appTargetId||''),appBehaviorRules:serializeAppBehaviorRules(m.appBehaviorRules),voiceOverride:m.voiceOverride==null?null:m.voiceOverride};
      }),
      trash:(st.config.trash||[]).map(function(m){
        hooks().ensureMappingExtras(m);
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.ensureRulesBeforeSave){
          global.OneToneAppBehaviorRules.ensureRulesBeforeSave(m);
        }
        return {id:m.id,label:m.label||'',group:m.group||'默认',triggerKey:m.triggerKey||'',targetKey:m.targetKey||'',enabled:false,order:m.order||0,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore,imePresetId:String(m.imePresetId||''),appTargetId:String(m.appTargetId||''),appBehaviorRules:serializeAppBehaviorRules(m.appBehaviorRules),voiceOverride:m.voiceOverride==null?null:m.voiceOverride};
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
      startMinimizedToTray:!!st.config.startMinimizedToTray,
      sounds:(function(){
        const s=hooks().ensureSoundsConfig();
        return {
          masterEnabled:!!s.masterEnabled,
          record:{enabled:!!s.record.enabled,id:String(s.record.id||slots.record.id)},
          voiceWake:{enabled:!!s.voiceWake.enabled,id:String(s.voiceWake.id||slots.voiceWake.id)},
          keyWake:{enabled:!!s.keyWake.enabled,id:String(s.keyWake.id||slots.keyWake.id)},
          sendSuccess:{enabled:!!s.sendSuccess.enabled,id:String(s.sendSuccess.id||slots.sendSuccess.id)},
          sendFail:{enabled:!!s.sendFail.enabled,id:String(s.sendFail.id||slots.sendFail.id)},
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
      voiceEnd:(function(){
        const cfg=st.config.voiceEnd||st.config.voice_end||{};
        return {
          enabled:!!cfg.enabled,
          phrasesZh:hooks().cloneStringList(cfg.phrasesZh||cfg.phrases_zh),
          phrasesEn:hooks().cloneStringList(cfg.phrasesEn||cfg.phrases_en),
          commitDelayMs:Number(cfg.commitDelayMs||cfg.commit_delay_ms)||4000,
          commitKey:String(cfg.commitKey||cfg.commit_key||'Enter').trim()||'Enter',
          dictationTimeoutMs:Number(cfg.dictationTimeoutMs||cfg.dictation_timeout_ms)||60000,
          autoSendEnabled:!!cfg.autoSendEnabled||!!cfg.auto_send_enabled,
          targetKey:String(cfg.targetKey||cfg.target_key||'RAlt').trim()||'RAlt'
        };
      })(),
      imePresetId:String(st.config.imePresetId||'')
    };
    return JSON.stringify(payload);
  }

  function save(){
    try{ global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage({type:'mvp_save',json:buildSavePayload()}); }catch(_){ }
  }

  function saveAsync(){
    const invoke=global.__vp_invoke__;
    if(!invoke) return Promise.resolve(false);
    try{
      return invoke('cmd_save',{json:buildSavePayload()}).then(function(){ return true; }).catch(function(){ return false; });
    }catch(_){
      return Promise.resolve(false);
    }
  }

  function applyMvpInit(msg){
    if(!msg||typeof msg!=='object') return;
    if(!hooksReady()){
      pendingMvpInitMsg=msg;
      if(msg.config){
        state().config=normalizeInboundConfig(msg.config);
        if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.applyPendingEnable){
          global.OneToneMappingEditActions.applyPendingEnable(state().config);
        }
      }
      return;
    }
    try{
      const fp=mvpInitFingerprint(msg);
      const now=Date.now();
      if(fp&&fp===lastMvpInitKey&&now-lastMvpInitAt<600&&configLoadedFromBackend&&configHasSceneData()) return;
      if(fp){ lastMvpInitKey=fp; lastMvpInitAt=now; }
      const st=state();
      if(msg.config) st.config=normalizeInboundConfig(msg.config);
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
      const activeId=String(st.config.activeSceneId||'').trim();
      if(activeId&&st.config.mappings.some(function(m){ return m.id===activeId; })){
        st.selectedMappingId=activeId;
      }else if(!st.selectedMappingId&&st.config.mappings[0]){
        st.selectedMappingId=st.config.mappings[0].id;
      }
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
      if(syncEditor) syncEditor();
      configLoadedFromBackend=true;
      pendingMvpInitMsg=null;
      clearTimeout(configBootstrapWatchdog);
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
      requestAnimationFrame(function(){
        if(serial!==mvpInitRenderSerial) return;
        if(renderHome) renderHome();
        if(renderHomeLive) renderHomeLive();
        if(renderUpdate) renderUpdate();
        if(welcomeOpen&&welcomeOpen()) return;
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
        setTimeout(function(){
          if(vw.isPollStarted()) return;
          if(welcomeOpen&&welcomeOpen()) return;
          startPoll();
        },welcomeOpen&&welcomeOpen()?4000:3000);
      }
    }catch(err){
      console.error('applyMvpInit',err);
      pendingMvpInitMsg=msg;
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

  function pullBackendConfig(){
    if(!tauriBridgeReady()) return Promise.resolve(false);
    return global.OneToneIpc.invokeTimeout('cmd_ready',{},4000).then(function(raw){
      const msg=unwrapMvpInitMsg(raw);
      if(msg){
        applyMvpInit(msg);
        return true;
      }
      return false;
    }).catch(function(err){
      console.error('pullBackendConfig',err);
      return false;
    });
  }

  var configSyncPollTimer=0;
  function startConfigSyncPoll(ms,maxAttempts){
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
    const core=global.__TAURI__&&global.__TAURI__.core;
    if(core&&typeof core.invoke==='function') return true;
    const internals=global.__TAURI_INTERNALS__;
    return !!(internals&&typeof internals.invoke==='function');
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
    startConfigSyncPoll(1500,12);
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
    applyMvpInit:applyMvpInit,
    applyRawMvpInit:applyRawMvpInit,
    flushPendingMvpInit:flushPendingMvpInit,
    pullBackendConfig:pullBackendConfig,
    startConfigSyncPoll:startConfigSyncPoll,
    requestBackendConfig:requestBackendConfig,
    fallbackConfigLoaded:fallbackConfigLoaded,
    isLoaded:function(){ return configLoadedFromBackend; },
    installToJsReady:installToJsReady
  };
  installToJsReady();
})((typeof window!=='undefined')?window:globalThis);
