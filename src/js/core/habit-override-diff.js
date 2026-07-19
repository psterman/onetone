(function(global){
  'use strict';

  function sceneCfg(){
    return global.OneToneSceneConfig;
  }

  function cloneList(arr){
    return Array.isArray(arr)?arr.map(function(s){ return String(s); }):[];
  }

  function globalCancelPhrases(cfg){
    var end=cfg.voiceEnd||cfg.voice_end||{};
    return {
      zh:cloneList(end.cancelPhrasesZh||end.cancel_phrases_zh),
      en:cloneList(end.cancelPhrasesEn||end.cancel_phrases_en)
    };
  }

  function globalSendPhrases(cfg){
    var end=cfg.voiceEnd||cfg.voice_end||{};
    return {
      zh:cloneList(end.sendPhrasesZh||end.send_phrases_zh),
      en:cloneList(end.sendPhrasesEn||end.send_phrases_en)
    };
  }

  function getGlobalVoiceBaseline(cfg){
    cfg=cfg||{};
    var sc=sceneCfg();
    var end=sc&&sc.globalEndPhrases?sc.globalEndPhrases(cfg):{zh:[],en:[]};
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    var baseline={
      targetKey:sc&&sc.globalVoiceTargetKey?sc.globalVoiceTargetKey(cfg):'RAlt',
      wakePhrases:sc&&sc.globalWakePhrases?cloneList(sc.globalWakePhrases(cfg)):[],
      endPhrases:{
        zh:cloneList(end.zh),
        en:cloneList(end.en)
      },
      cancelPhrases:globalCancelPhrases(cfg),
      sendPhrases:globalSendPhrases(cfg)
    };
    if(mode==='vosk'||mode==='sapi'||mode==='kws') baseline.engine=mode;
    if(mode==='vosk'){
      baseline.modelPreset=String(vosk.modelPreset||vosk.model_preset||'cn-light').trim()||'cn-light';
    }
    return baseline;
  }

  function listEqual(a,b){
    return JSON.stringify(a||[])===JSON.stringify(b||[]);
  }

  function bundleEqual(a,b){
    a=a&&typeof a==='object'?a:{zh:[],en:[]};
    b=b&&typeof b==='object'?b:{zh:[],en:[]};
    return listEqual(a.zh,b.zh)&&listEqual(a.en,b.en);
  }

  function diffVoiceOverride(edited,baseline){
    edited=edited||{};
    baseline=baseline||{};
    var out={};
    var tk=String(edited.targetKey||'').trim();
    var btk=String(baseline.targetKey||'').trim();
    if(tk&&tk!==btk) out.targetKey=tk;
    if(Array.isArray(edited.wakePhrases)&&edited.wakePhrases.length&&!listEqual(edited.wakePhrases,baseline.wakePhrases)){
      out.wakePhrases=cloneList(edited.wakePhrases);
    }
    if(edited.endPhrases&&!bundleEqual(edited.endPhrases,baseline.endPhrases)){
      var zh=cloneList(edited.endPhrases.zh);
      var en=cloneList(edited.endPhrases.en);
      if(zh.length||en.length) out.endPhrases={zh:zh,en:en};
    }
    if(edited.cancelPhrases&&!bundleEqual(edited.cancelPhrases,baseline.cancelPhrases)){
      var czh=cloneList(edited.cancelPhrases.zh);
      var cen=cloneList(edited.cancelPhrases.en);
      if(czh.length||cen.length) out.cancelPhrases={zh:czh,en:cen};
    }
    if(edited.sendPhrases&&!bundleEqual(edited.sendPhrases,baseline.sendPhrases)){
      var szh=cloneList(edited.sendPhrases.zh);
      var sen=cloneList(edited.sendPhrases.en);
      if(szh.length||sen.length) out.sendPhrases={zh:szh,en:sen};
    }
    if(edited.engine){
      var eng=String(edited.engine).trim();
      if(eng&&(eng!==String(baseline.engine||''))) out.engine=eng;
    }
    if(edited.modelPreset){
      var mp=String(edited.modelPreset).trim();
      if(mp&&(mp!==String(baseline.modelPreset||''))) out.modelPreset=mp;
    }
    return out;
  }

  function normalizeVoiceOverrideForSave(edited,cfg){
    return diffVoiceOverride(edited,getGlobalVoiceBaseline(cfg));
  }

  function fieldVoiceStatus(field,edited,baseline){
    edited=edited||{};
    baseline=baseline||{};
    if(field==='targetKey'){
      var tk=String(edited.targetKey||'').trim();
      if(!tk||tk===String(baseline.targetKey||'').trim()) return 'inherited';
      return 'overridden';
    }
    if(field==='wakePhrases'){
      if(!Array.isArray(edited.wakePhrases)||!edited.wakePhrases.length) return 'inherited';
      return listEqual(edited.wakePhrases,baseline.wakePhrases)?'inherited':'overridden';
    }
    if(field==='endPhrases'){
      if(!edited.endPhrases||bundleEqual(edited.endPhrases,baseline.endPhrases)) return 'inherited';
      return 'overridden';
    }
    if(field==='cancelPhrases'){
      if(!edited.cancelPhrases||bundleEqual(edited.cancelPhrases,baseline.cancelPhrases)) return 'inherited';
      return 'overridden';
    }
    if(field==='sendPhrases'){
      if(!edited.sendPhrases||bundleEqual(edited.sendPhrases,baseline.sendPhrases)) return 'inherited';
      return 'overridden';
    }
    if(field==='engine'){
      if(!edited.engine||String(edited.engine)===String(baseline.engine||'')) return 'inherited';
      return 'overridden';
    }
    if(field==='modelPreset'){
      if(!edited.modelPreset||String(edited.modelPreset)===String(baseline.modelPreset||'')) return 'inherited';
      return 'overridden';
    }
    return 'inherited';
  }

  function isAppScenarioMapping(m){
    if(!m) return false;
    if(String(m.appTargetId||'').trim()) return true;
    // Survive appTargetId wipe: a concrete process bind still means "app scenario".
    // (Do not treat seeded preset chips without match as app scenarios.)
    var rules=Array.isArray(m.appBehaviorRules)?m.appBehaviorRules:[];
    for(var i=0;i<rules.length;i++){
      var r=rules[i];
      if(!r) continue;
      var appId=String(r.appId||'').trim();
      var match=r.match;
      if(!match||typeof match!=='object') continue;
      var hasExe=Array.isArray(match.exeNames)&&match.exeNames.some(function(x){ return String(x||'').trim(); });
      var hasPath=!!String(match.fullPath||match.full_path||match.pathContains||'').trim();
      var hasTitle=!!String(match.titleContains||'').trim();
      if(hasExe||hasPath||hasTitle) return true;
      if(appId==='custom') return true;
    }
    return false;
  }

  function isGlobalBaselineMapping(m,cfg,mappingCore){
    if(!m) return false;
    var baseline=findGlobalBaselineMapping(cfg,mappingCore);
    return !!(baseline&&baseline.id===m.id);
  }

  function findGlobalBaselineMapping(cfg,mappingCore){
    cfg=cfg||{};
    var mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    function isBaseline(m){
      return !!m&&!isAppScenarioMapping(m);
    }
    var activeId=String(cfg.activeSceneId||'').trim();
    if(activeId&&mappingCore&&mappingCore.byId){
      var active=mappingCore.byId(activeId);
      if(isBaseline(active)) return active;
    }
    for(var i=0;i<mappings.length;i++){
      if(isBaseline(mappings[i])) return mappings[i];
    }
    return mappings[0]||null;
  }

  function getGlobalKeyBaseline(cfg, mappingCore){
    cfg=cfg||{};
    var m=findGlobalBaselineMapping(cfg,mappingCore);
    if(!m) return {triggerKey:'',targetKey:'',autoEnterEnabled:true,cancelEnabled:true,triggerMode:'tap'};
    return {
      triggerKey:String(m.triggerKey||'').trim(),
      targetKey:String(m.targetKey||'').trim(),
      autoEnterEnabled:!!m.autoEnterEnabled,
      cancelEnabled:!!m.cancelEnabled,
      triggerMode:String(m.triggerMode||'tap')
    };
  }

  function getKeysAccessState(m,cfg,mappingCore){
    m=m||{};
    cfg=cfg||{};
    var baseline=getGlobalKeyBaseline(cfg,mappingCore);
    if(m.keyModeEnabled===false){
      return {status:'disabled',overrideCount:0,baseline:baseline};
    }
    var count=countKeyOverrides(m,baseline);
    return {
      status:count>0?'overridden':'inherited',
      overrideCount:count,
      baseline:baseline
    };
  }

  function getVoiceAccessState(m,cfg){
    m=m||{};
    cfg=cfg||{};
    var baseline=getGlobalVoiceBaseline(cfg);
    var ov=m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    if(m.voiceModeEnabled===false){
      return {status:'disabled',overrideCount:0,baseline:baseline,override:ov};
    }
    var count=countVoiceOverrides(ov,baseline);
    return {
      status:count>0?'overridden':'inherited',
      overrideCount:count,
      baseline:baseline,
      override:ov
    };
  }

  function fieldKeyStatus(field,m,baseline){
    m=m||{};
    baseline=baseline||{};
    if(field==='triggerKey'){
      var trig=String(m.triggerKey||'').trim();
      if(!trig||trig===String(baseline.triggerKey||'').trim()) return 'inherited';
      return 'overridden';
    }
    if(field==='targetKey'){
      var tgt=String(m.targetKey||'').trim();
      if(!tgt||tgt===String(baseline.targetKey||'').trim()) return 'inherited';
      return 'overridden';
    }
    if(field==='finish'){
      if(!!m.autoEnterEnabled===!!baseline.autoEnterEnabled
        &&!!m.cancelEnabled===!!baseline.cancelEnabled
        &&String(m.triggerMode||'tap')===String(baseline.triggerMode||'tap')) return 'inherited';
      return 'overridden';
    }
    return 'inherited';
  }

  function normalizeKeyFieldsForSave(mapping,baseline,isAppScenario){
    if(!mapping||!isAppScenario||!baseline) return mapping;
    if(String(mapping.triggerKey||'').trim()===String(baseline.triggerKey||'').trim()) mapping.triggerKey='';
    if(String(mapping.targetKey||'').trim()===String(baseline.targetKey||'').trim()) mapping.targetKey='';
    return mapping;
  }

  function restoreKeyFieldsToGlobal(mapping,baseline){
    if(!mapping||!baseline) return mapping;
    mapping.triggerKey='';
    mapping.targetKey='';
    mapping.autoEnterEnabled=baseline.autoEnterEnabled;
    mapping.cancelEnabled=baseline.cancelEnabled;
    mapping.triggerMode=baseline.triggerMode||'tap';
    return mapping;
  }

  function isEmptyOverride(ov){
    if(!ov||typeof ov!=='object') return true;
    return !Object.keys(ov).length;
  }

  function countKeyOverrides(m,baseline){
    m=m||{};
    baseline=baseline||{};
    var n=0;
    if(fieldKeyStatus('triggerKey',m,baseline)==='overridden') n++;
    if(fieldKeyStatus('targetKey',m,baseline)==='overridden') n++;
    if(fieldKeyStatus('finish',m,baseline)==='overridden') n++;
    return n;
  }

  function countVoiceOverrides(ov,baseline){
    ov=ov||{};
    baseline=baseline||{};
    var n=0;
    ['targetKey','wakePhrases','endPhrases','cancelPhrases','sendPhrases','engine','modelPreset'].forEach(function(field){
      if(fieldVoiceStatus(field,ov,baseline)==='overridden') n++;
    });
    return n;
  }

  function countCameraOverrides(m){
    var ov=m&&m.cameraOverride&&typeof m.cameraOverride==='object'?m.cameraOverride:null;
    if(!ov) return 0;
    var n=0;
    ['onAway','onReturn','shakeHead','deliberateBlink'].forEach(function(k){
      if(ov[k]!=null&&String(ov[k]).trim()!=='') n++;
    });
    if(ov.triggers&&typeof ov.triggers==='object'){
      ['away','shake','blink'].forEach(function(k){
        if(ov.triggers[k]!==undefined) n++;
      });
    }
    return n;
  }

  function buildCameraOverrideItems(m,labels){
    labels=labels||{};
    var ov=m&&m.cameraOverride&&typeof m.cameraOverride==='object'?m.cameraOverride:null;
    if(!ov) return [];
    var items=[];
    [['onAway','onAway'],['onReturn','onReturn'],['shakeHead','shakeHead'],['deliberateBlink','deliberateBlink']].forEach(function(pair){
      var k=pair[0];
      if(ov[k]==null||String(ov[k]).trim()==='') return;
      items.push({field:k,label:labels[pair[1]]||k,value:String(ov[k])});
    });
    if(ov.triggers&&typeof ov.triggers==='object'){
      ['away','shake','blink'].forEach(function(k){
        if(ov.triggers[k]===undefined) return;
        items.push({field:'trigger.'+k,label:(labels.triggers||'trigger')+'.'+k,value:String(!!ov.triggers[k])});
      });
    }
    return items;
  }

  function buildKeyOverrideItems(m,baseline,labels){
    labels=labels||{};
    m=m||{};
    baseline=baseline||{};
    var items=[];
    function push(field,lblKey,val){
      if(fieldKeyStatus(field,m,baseline)!=='overridden') return;
      items.push({field:field,label:labels[lblKey]||lblKey,value:String(val||'')});
    }
    push('triggerKey','triggerKey',m.triggerKey);
    push('targetKey','targetKey',m.targetKey);
    if(fieldKeyStatus('finish',m,baseline)==='overridden'){
      items.push({field:'finish',label:labels.finish||'finish',value:labels.finishValue||''});
    }
    return items;
  }

  function buildVoiceOverrideItems(ov,baseline,labels){
    labels=labels||{};
    ov=ov||{};
    baseline=baseline||{};
    var items=[];
    function push(field,lblKey,fmt){
      if(fieldVoiceStatus(field,ov,baseline)!=='overridden') return;
      var val=fmt?fmt(ov,baseline):'';
      items.push({field:field,label:labels[lblKey]||lblKey,value:val});
    }
    push('targetKey','targetKey',function(o){ return o.targetKey||''; });
    push('engine','engine',function(o){ return o.engine||''; });
    push('wakePhrases','wakePhrases',function(o){
      return Array.isArray(o.wakePhrases)?o.wakePhrases.join(' / '):'';
    });
    push('endPhrases','endPhrases',function(o){
      var zh=Array.isArray(o.endPhrases&&o.endPhrases.zh)?o.endPhrases.zh:[];
      var en=Array.isArray(o.endPhrases&&o.endPhrases.en)?o.endPhrases.en:[];
      return zh.concat(en).join(' / ');
    });
    push('modelPreset','modelPreset',function(o){ return o.modelPreset||''; });
    return items;
  }

  function buildStateOverrideItems(m,labels){
    labels=labels||{};
    m=m||{};
    var items=[];
    if(m.enabled===false){
      items.push({field:'scenarioEnabled',label:labels.enableScenario||'scenario',value:labels.enableOff||'off'});
    }
    if(m.keyModeEnabled===false){
      items.push({field:'keysModeEnabled',label:labels.enableKeys||'keys',value:labels.enableOff||'off'});
    }
    if(m.voiceModeEnabled===false){
      items.push({field:'voiceModeEnabled',label:labels.enableVoice||'voice',value:labels.enableOff||'off'});
    }
    return items;
  }

  function countAcousticCommands(m){
    if(!m||!Array.isArray(m.acousticVoiceCommands)) return 0;
    var n=0;
    for(var i=0;i<m.acousticVoiceCommands.length;i++){
      var c=m.acousticVoiceCommands[i];
      if(!c) continue;
      var q=String(c.quality||'').trim();
      if(q!=='good'&&q!=='ok') continue;
      if(!Array.isArray(c.samples)||!c.samples.length) continue;
      n+=1;
    }
    return n;
  }

  function buildScenarioSavePreview(mapping,cfg,opts){
    opts=opts||{};
    cfg=cfg||{};
    var m=mapping||null;
    var appId=String(m&&m.appTargetId||opts.pickedAppId||'').trim();
    var name=String(opts.name!=null?opts.name:(m&&(m.group||m.label)||'')).trim();
    var appName=String(opts.appName||appId||'').trim();
    var labels=opts.labels||{};
    var keyBaseline=getGlobalKeyBaseline(cfg,opts.mappingCore);
    var voiceBaseline=getGlobalVoiceBaseline(cfg);
    var ov=m&&m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    var keysOverrideCount=m?countKeyOverrides(m,keyBaseline):0;
    var voiceOverrideCount=m?countVoiceOverrides(ov,voiceBaseline):0;
    var cameraOverrideCount=m?countCameraOverrides(m):0;
    var acousticCommandCount=m?countAcousticCommands(m):0;
    var keysOverrides=m?buildKeyOverrideItems(m,keyBaseline,labels):[];
    var voiceOverrides=m?buildVoiceOverrideItems(ov,voiceBaseline,labels):[];
    var cameraOverrides=m?buildCameraOverrideItems(m,labels):[];
    var stateOverrides=m?buildStateOverrideItems(m,labels):[];
    var savedChangeCount=keysOverrideCount+voiceOverrideCount+cameraOverrideCount+stateOverrides.length+acousticCommandCount;
    var saveKind='blocked';
    var canSave=false;
    var saveBlockReason='no_app';
    if(appId){
      saveKind=savedChangeCount===0?'empty':'overrides';
      canSave=true;
      saveBlockReason='';
    }
    var scenarioEnabled=!!(m&&m.enabled);
    var keysModeEnabled=!!(m&&m.keyModeEnabled!==false);
    var voiceModeEnabled=!!(m&&m.voiceModeEnabled!==false);
    var statusChips=[];
    statusChips.push({
      id:'app',
      label:appId?(labels.chipAppSelected||'app_selected').replace('{app}',appName||appId):(labels.chipAppMissing||'app_missing'),
      ok:!!appId,
      tone:appId?'ok':'warn'
    });
    statusChips.push({
      id:'name',
      label:name?(labels.chipNameOk||'name_ok'):(labels.chipNameMissing||'name_missing'),
      ok:!!name,
      tone:name?'ok':'muted'
    });
    statusChips.push({
      id:'keys',
      label:keysOverrideCount>0
        ?(labels.chipKeysOverride||'keys_override').replace('{n}',String(keysOverrideCount))
        :(labels.chipKeysInherit||'keys_inherit'),
      ok:true,
      tone:keysOverrideCount>0?'accent':'muted'
    });
    var voiceChipLabel;
    if(acousticCommandCount>0){
      voiceChipLabel=(labels.chipVoiceAcoustic||'voice_acoustic').replace('{n}',String(acousticCommandCount));
    }else if(voiceOverrideCount>0){
      voiceChipLabel=(labels.chipVoiceOverride||'voice_override').replace('{n}',String(voiceOverrideCount));
    }else{
      voiceChipLabel=labels.chipVoiceInherit||'voice_inherit';
    }
    statusChips.push({
      id:'voice',
      label:voiceChipLabel,
      ok:true,
      tone:(acousticCommandCount>0||voiceOverrideCount>0)?'accent':'muted'
    });
    statusChips.push({
      id:'camera',
      label:cameraOverrideCount>0
        ?(labels.chipCameraOverride||'camera_override').replace('{n}',String(cameraOverrideCount))
        :(labels.chipCameraInherit||'camera_inherit'),
      ok:true,
      tone:cameraOverrideCount>0?'accent':'muted'
    });
    var saveLabel;
    if(!canSave) saveLabel=labels.chipSaveBlocked||'save_blocked';
    else if(saveKind==='empty') saveLabel=labels.chipSaveEmpty||'save_empty';
    else saveLabel=labels.chipSaveReady||'save_ready';
    statusChips.push({id:'save',label:saveLabel,ok:canSave,tone:canSave?'ok':'warn'});
    return {
      appId:appId,
      appName:appName||appId,
      scope:opts.scope||appName||appId,
      name:name,
      scenarioEnabled:scenarioEnabled,
      keysModeEnabled:keysModeEnabled,
      voiceModeEnabled:voiceModeEnabled,
      keysOverrides:keysOverrides,
      voiceOverrides:voiceOverrides,
      cameraOverrides:cameraOverrides,
      stateOverrides:stateOverrides,
      keysOverrideCount:keysOverrideCount,
      voiceOverrideCount:voiceOverrideCount,
      cameraOverrideCount:cameraOverrideCount,
      acousticCommandCount:acousticCommandCount,
      saveKind:saveKind,
      canSave:canSave,
      saveBlockReason:saveBlockReason,
      statusChips:statusChips,
      allInherited:savedChangeCount===0
    };
  }

  global.OneToneHabitOverrideDiff={
    getGlobalVoiceBaseline:getGlobalVoiceBaseline,
    getGlobalKeyBaseline:getGlobalKeyBaseline,
    findGlobalBaselineMapping:findGlobalBaselineMapping,
    isAppScenarioMapping:isAppScenarioMapping,
    isGlobalBaselineMapping:isGlobalBaselineMapping,
    getKeysAccessState:getKeysAccessState,
    getVoiceAccessState:getVoiceAccessState,
    globalCancelPhrases:globalCancelPhrases,
    globalSendPhrases:globalSendPhrases,
    diffVoiceOverride:diffVoiceOverride,
    normalizeVoiceOverrideForSave:normalizeVoiceOverrideForSave,
    normalizeKeyFieldsForSave:normalizeKeyFieldsForSave,
    restoreKeyFieldsToGlobal:restoreKeyFieldsToGlobal,
    isEmptyOverride:isEmptyOverride,
    fieldVoiceStatus:fieldVoiceStatus,
    fieldKeyStatus:fieldKeyStatus,
    listEqual:listEqual,
    bundleEqual:bundleEqual,
    countKeyOverrides:countKeyOverrides,
    countVoiceOverrides:countVoiceOverrides,
    buildScenarioSavePreview:buildScenarioSavePreview
  };
})((typeof window!=='undefined')?window:globalThis);
