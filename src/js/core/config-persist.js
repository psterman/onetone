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

  function newRuleId(){
    return 'rule-'+Date.now()+'-'+Math.floor(Math.random()*100000);
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
    return out;
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
    if(cfg.desiredEngine==null){
      var voskOn=!!((cfg.voiceVosk||{}).enabled);
      var sapiOn=!!((cfg.voiceSapi||{}).enabled);
      var kwsOn=!!((cfg.voiceKws||{}).enabled);
      cfg.desiredEngine=voskOn?'vosk':(sapiOn?'sapi':(kwsOn?'kws':'none'));
    }
    if(Array.isArray(cfg.mappings)){
      cfg.mappings=cfg.mappings.map(normalizeInboundMapping);
    }
    if(Array.isArray(cfg.trash)){
      cfg.trash=cfg.trash.map(normalizeInboundMapping);
    }
    var wakeAcoustic=cfg.voiceWakeAcousticCommands||cfg.voice_wake_acoustic_commands;
    cfg.voiceWakeAcousticCommands=normalizeGlobalAcousticVoiceCommands(wakeAcoustic);
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
      mappings:[{id:id,label:'AutoTrigger → '+labelSuffix,group:'通用设置',triggerKey:'AutoTrigger',targetKey:targetKey,enabled:true,order:0,triggerMode:'tap',intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,switchKeys:[],nativeKeyRestore:false,appTargetId:'',imePresetId:'',voiceOverride:null}],
      trash:[],
      intervalMs:1200,enterDelayMs:5000,cancelEnabled:true,autoEnterEnabled:true,
      debounceMs:80,keyPressDurationMs:250,schemeSwitchKey:'',keyWakeSoundEnabled:false,coachHudEnabled:false,startMinimizedToTray:false,
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
        var order=Number(m.order);
        if(!isFinite(order)) order=i;
        return {id:m.id,label:m.label||((trig&&tgt)?((trig||'?')+' → '+(tgt||'?')):''),group:m.group||'通用设置',triggerKey:trig,targetKey:tgt,enabled:!!m.enabled,order:order,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore,imePresetId:String(m.imePresetId||''),appTargetId:String(m.appTargetId||''),appBehaviorRules:serializeAppBehaviorRules(m.appBehaviorRules),voiceOverride:m.voiceOverride==null?null:m.voiceOverride,voiceCommands:serializeVoiceCommands(m.voiceCommands,m.id),acousticVoiceCommands:serializeAcousticVoiceCommands(m.acousticVoiceCommands,m.id)};
      }),
      trash:(st.config.trash||[]).map(function(m){
        hooks().ensureMappingExtras(m);
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.ensureRulesBeforeSave){
          global.OneToneAppBehaviorRules.ensureRulesBeforeSave(m);
        }
        return {id:m.id,label:m.label||'',group:m.group||'通用设置',triggerKey:m.triggerKey||'',targetKey:m.targetKey||'',enabled:false,order:m.order||0,triggerMode:m.triggerMode||'tap',triggerSource:m.triggerSource||null,sourceKey:m.sourceKey||'',sourceTime:m.sourceTime||'',intervalMs:m.intervalMs||1200,enterDelayMs:m.enterDelayMs||5000,cancelEnabled:m.cancelEnabled!==false,autoEnterEnabled:m.autoEnterEnabled!==false,switchKeys:m.switchKeys||[],nativeKeyRestore:!!m.nativeKeyRestore,imePresetId:String(m.imePresetId||''),appTargetId:String(m.appTargetId||''),appBehaviorRules:serializeAppBehaviorRules(m.appBehaviorRules),voiceOverride:m.voiceOverride==null?null:m.voiceOverride,voiceCommands:serializeVoiceCommands(m.voiceCommands,m.id),acousticVoiceCommands:serializeAcousticVoiceCommands(m.acousticVoiceCommands,m.id)};
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
      imePresetId:String(st.config.imePresetId||''),
      voiceWakeAcousticCommands:(function(){
        const cfg=st.config||{};
        const list=cfg.voiceWakeAcousticCommands||cfg.voice_wake_acoustic_commands||[];
        return normalizeGlobalAcousticVoiceCommands(list);
      })()
    };
    return JSON.stringify(payload);
  }

  function save(){
    var payload=buildSavePayload();
    try{
      if(global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage){
        global.chrome.webview.postMessage({type:'mvp_save',json:payload});
      }
    }catch(_){ }
    var invoke=global.__vp_invoke__;
    if(invoke){
      invoke('cmd_save',{json:payload}).catch(function(err){
        console.error('cmd_save',err);
      });
    }
  }

  function saveAsync(){
    const invoke=global.__vp_invoke__;
    if(!invoke) return Promise.resolve(false);
    try{
      var payload=buildSavePayload();
      return invoke('cmd_save',{json:payload}).then(function(){ return true; }).catch(function(err){
        if(typeof console!=='undefined'&&console.error){
          console.error('cmd_save',err);
        }
        return false;
      });
    }catch(err){
      if(typeof console!=='undefined'&&console.error){
        console.error('cmd_save build failed',err);
      }
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

  var pullBackendConfigTimer=0;
  function pullBackendConfig(){
    if(!tauriBridgeReady()) return Promise.resolve(false);
    clearTimeout(pullBackendConfigTimer);
    return new Promise(function(resolve){
      pullBackendConfigTimer=setTimeout(function(){
        global.OneToneIpc.invokeTimeout('cmd_ready',{},4000).then(function(raw){
          const msg=unwrapMvpInitMsg(raw);
          if(msg){
            applyMvpInit(msg);
            resolve(true);
            return;
          }
          resolve(false);
        }).catch(function(err){
          console.error('pullBackendConfig',err);
          resolve(false);
        });
      },150);
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
    ACOUSTIC_MAX_FEATURE_FRAMES:ACOUSTIC_MAX_FEATURE_FRAMES
  };
  installToJsReady();
})((typeof window!=='undefined')?window:globalThis);
