(function(global){
  'use strict';
  function hooks(){ return global.__vp_config_persist_hooks__ || {}; }
  function state(){ return global.OneToneState.state; }
  var configLoadedFromBackend=false;
  var configBootstrapWatchdog=0;
  var mvpInitRenderSerial=0;
  var lastMvpInitKey='';
  var lastMvpInitAt=0;

  function mvpInitFingerprint(msg){
    const c=msg&&msg.config;
    if(!c) return '';
    const maps=Array.isArray(c.mappings)?c.mappings:[];
    const vosk=!!((c.voiceVosk||c.voice_vosk||{}).enabled);
    const sapi=!!((c.voiceSapi||c.voice_sapi||{}).enabled);
    return maps.length+'|'+maps.map(function(m){
      return String(m.id||'')+':'+(m.enabled?1:0)+':'+String(m.triggerKey||'')+':'+String(m.targetKey||'');
    }).join(';')+'|v'+(vosk?1:0)+'|s'+(sapi?1:0);
  }

  function defaultConfig(){
    const id=hooks().newMappingId();
    return {
      version:5,
      mappings:[{id:id,label:'AutoTrigger → RAlt',group:'默认',triggerKey:'AutoTrigger',targetKey:'RAlt',enabled:true,order:0,triggerMode:'tap',intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,switchKeys:[],nativeKeyRestore:false}],
      trash:[],
      intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,
      debounceMs:80,keyPressDurationMs:250,schemeSwitchKey:'',keyWakeSoundEnabled:false,coachHudEnabled:false,
      sounds:hooks().defaultSoundsConfig(),
      voiceSapi:{enabled:false,phrases:['开始输入','开始听写','开启输入','开始说话'],targetKey:'RAlt',cooldownMs:2000,minConfidence:0.35},
      voiceVosk:{enabled:false,phrases:['开始输入','开始听写','打开听写','语音输入','开启输入'],targetKey:'RAlt',cooldownMs:2000,modelPath:'resources/vosk/vosk-model-small-cn-0.22',modelPreset:'cn-light'},
      voiceEnd:{enabled:false,phrasesZh:['结束输入','发出去'],phrasesEn:['end dictation','send it'],commitDelayMs:4000,commitKey:'Enter',dictationTimeoutMs:120000,autoSendEnabled:false,targetKey:'RAlt'}
    };
  }

  function ensureConfig(){
    const st=state();
    if(!st.config||!Array.isArray(st.config.mappings)) st.config=defaultConfig();
    if(!Array.isArray(st.config.trash)) st.config.trash=[];
    if(!st.config.mappings.length){
      const id=hooks().newMappingId();
      st.config.mappings.push({id:id,label:'',group:'默认',triggerKey:'',targetKey:'',enabled:false,order:0,triggerMode:'tap'});
    }
    if(!st.selectedMappingId) st.selectedMappingId=st.config.mappings[0].id;
    if(st.config.schemeSwitchKey===undefined||st.config.schemeSwitchKey===null) st.config.schemeSwitchKey='';
    st.config.schemeSwitchKey='';
    if(st.config.keyWakeSoundEnabled===undefined) st.config.keyWakeSoundEnabled=false;
    if(st.config.coachHudEnabled===undefined) st.config.coachHudEnabled=false;
    hooks().ensureSoundsConfig();
    st.config.mappings.forEach(hooks().ensureMappingExtras);
    (st.config.trash||[]).forEach(hooks().ensureMappingExtras);
  }

  function buildSavePayload(){
    ensureConfig();
    hooks().flushAllEditorToMappings();
    const st=state();
    const slots=hooks().soundSlotDefaults();
    const payload={
      version:5,
      mappings:st.config.mappings.map(function(m,i){
        hooks().ensureMappingExtras(m);
        const trig=hooks().editorTriggerForMapping(m);
        const tgt=hooks().editorTargetForMapping(m);
        return {id:m.id,label:m.label||((trig&&tgt)?((trig||'?')+' → '+(tgt||'?')):''),group:m.group||'默认',triggerKey:trig,targetKey:tgt,enabled:!!m.enabled,order:i,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore};
      }),
      trash:(st.config.trash||[]).map(function(m){
        hooks().ensureMappingExtras(m);
        return {id:m.id,label:m.label||'',group:m.group||'默认',triggerKey:m.triggerKey||'',targetKey:m.targetKey||'',enabled:false,order:m.order||0,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore};
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
      sounds:(function(){
        const s=hooks().ensureSoundsConfig();
        return {
          masterEnabled:!!s.masterEnabled,
          record:{enabled:!!s.record.enabled,id:String(s.record.id||slots.record.id)},
          voiceWake:{enabled:!!s.voiceWake.enabled,id:String(s.voiceWake.id||slots.voiceWake.id)},
          keyWake:{enabled:!!s.keyWake.enabled,id:String(s.keyWake.id||slots.keyWake.id)},
          sendSuccess:{enabled:!!s.sendSuccess.enabled,id:String(s.sendSuccess.id||slots.sendSuccess.id)},
          sendFail:{enabled:!!s.sendFail.enabled,id:String(s.sendFail.id||slots.sendFail.id)}
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
      })()
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
    try{
      const fp=mvpInitFingerprint(msg);
      const now=Date.now();
      if(fp&&fp===lastMvpInitKey&&now-lastMvpInitAt<600){
        if(configLoadedFromBackend) return;
      }else if(fp){ lastMvpInitKey=fp; lastMvpInitAt=now; }
      const st=state();
      if(msg.config) st.config=msg.config;
      if(Array.isArray(msg.conflicts)) hooks().setConflictRows(msg.conflicts);
      if(msg.update) st.update=hooks().normalizeUpdateState(msg.update);
      else if(!st.update) st.update=hooks().defaultUpdateState();
      ensureConfig();
      const voiceToggleBusy=global.OneToneVoiceWake.isVoskTogglePending()||global.OneToneVoiceWake.isSapiTogglePending();
      const m=hooks().selectedMapping();
      const keepTrigger=hooks().getEditorTriggerKey();
      const keepTarget=hooks().getEditorTargetKey();
      const guardLocal=Date.now()<hooks().localCaptureGuardUntil();
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
      hooks().syncEditorFromSelection();
      configLoadedFromBackend=true;
      clearTimeout(configBootstrapWatchdog);
      hooks().scheduleBootMicReady();
      hooks().scheduleDeferredVoiceEngineBoot();
      if(global.OneToneVoiceWake.initSapiPresetsFromConfig) global.OneToneVoiceWake.initSapiPresetsFromConfig();
      if(!voiceToggleBusy){
        setTimeout(function(){
          if(global.OneToneVoiceWake.isVoskTogglePending()||global.OneToneVoiceWake.isSapiTogglePending()) return;
          hooks().syncVoiceSettingsFromConfig();
        },800);
      }
      setTimeout(function(){ hooks().syncKeyWakeSettingsFromConfig(); },1200);
      setTimeout(function(){ hooks().ensureNotificationPermission(); },3000);
      mvpInitRenderSerial++;
      const serial=mvpInitRenderSerial;
      const ui=global.OneToneState.ui;
      requestAnimationFrame(function(){
        if(serial!==mvpInitRenderSerial) return;
        hooks().renderHome();
        hooks().renderHomeLiveZone();
        hooks().renderUpdateUi();
        if(hooks().welcomeOpen()) return;
        if(ui.drawerOpen){
          hooks().renderEditor();
          hooks().renderListenRuntime();
          if(hooks().mappingListUiActive()) hooks().renderMappingChrome();
          if(ui.settingsPanel==='general') hooks().renderTrashList();
          if(ui.settingsPanel==='voiceWake'&&!voiceToggleBusy){
            const sapiCfg=st.config.voiceSapi||st.config.voice_sapi||{};
            const voskCfg=st.config.voiceVosk||st.config.voice_vosk||{};
            hooks().renderVoiceSapiStatus({
              enabled:!!sapiCfg.enabled,
              state:'stopped',
              phrases:Array.isArray(sapiCfg.phrases)?sapiCfg.phrases:[]
            });
            hooks().renderVoiceVoskStatus({
              enabled:!!voskCfg.enabled,
              state:'stopped',
              phrases:Array.isArray(voskCfg.phrases)?voskCfg.phrases:[]
            });
          }
        }
      });
      if(!global.OneToneVoiceWake.isPollStarted()){
        setTimeout(function(){
          if(!global.OneToneVoiceWake.isPollStarted()&&!hooks().welcomeOpen()) hooks().startVoiceStatusPoll();
        },hooks().welcomeOpen()?4000:3000);
      }
    }catch(err){
      console.error('applyMvpInit',err);
      if(!configLoadedFromBackend){
        configLoadedFromBackend=true;
        clearTimeout(configBootstrapWatchdog);
        hooks().renderHome();
      }
    }
  }

  function tauriBridgeReady(){
    const core=global.__TAURI__&&global.__TAURI__.core;
    if(core&&typeof core.invoke==='function') return true;
    const internals=global.__TAURI_INTERNALS__;
    return !!(internals&&typeof internals.invoke==='function');
  }

  function unlockConfigUi(){
    if(configLoadedFromBackend) return;
    configLoadedFromBackend=true;
    clearTimeout(configBootstrapWatchdog);
    hooks().renderHome();
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
    global.OneToneIpc.invokeTimeout('cmd_ready',{},4000).then(function(msg){
      if(msg&&(msg.type==='mvp_init'||msg.config)){
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
      global.OneToneIpc.invokeTimeout('cmd_ready',{},3000).then(function(msg){
        if(configLoadedFromBackend) return;
        if(msg&&(msg.type==='mvp_init'||msg.config)) applyMvpInit(msg);
      }).catch(function(err){
        console.error('fallback cmd_ready',err);
      });
    }
    setTimeout(unlockConfigUi,2000);
  }

  function installToJsReady(){
    global.__vp_on_to_js_ready__=function(){
      if(configLoadedFromBackend) return;
      if(!tauriBridgeReady()) return;
      global.OneToneIpc.invokeTimeout('cmd_ready',{},3000).then(function(msg){
        if(configLoadedFromBackend) return;
        if(msg&&(msg.type==='mvp_init'||msg.config)) applyMvpInit(msg);
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
    requestBackendConfig:requestBackendConfig,
    fallbackConfigLoaded:fallbackConfigLoaded,
    isLoaded:function(){ return configLoadedFromBackend; },
    installToJsReady:installToJsReady
  };
  installToJsReady();
})((typeof window!=='undefined')?window:globalThis);
