(function(global){
  'use strict';

  var t=function(key){ return global.OneToneI18n.t(key); };

  function state(){ return global.OneToneState.state; }
  function runtime(){ return global.OneToneState.runtime; }
  function hooks(){ return global.__vp_home_live_hooks__ || {}; }
  function snap(){ return global.OneToneVoiceUiState.snapshot(); }

  function configLoaded(){
    return !!hooks().configLoadedFromBackend && hooks().configLoadedFromBackend();
  }

  function cloneList(list){
    if(hooks().cloneStringList) return hooks().cloneStringList(list);
    return (list||[]).slice();
  }

  function preferredEngine(){
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.preferredEngine){
      return global.OneToneVoiceEngineReadiness.preferredEngine();
    }
    var cfg=state().config||{};
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    if(vosk.enabled) return 'vosk';
    return 'vosk';
  }

  function voskModelPreset(w, voskCfg){
    var vosk=w.vosk||{};
    return String(vosk.modelPreset||voskCfg.modelPreset||'cn-light').trim()||'cn-light';
  }

  function engineOn(w, voskCfg, sapiCfg, kwsCfg){
    kwsCfg=kwsCfg||{};
    voskCfg=voskCfg||{};
    sapiCfg=sapiCfg||{};
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.resolveRuntimeEngine){
      var runtime=global.OneToneVoiceWake.resolveRuntimeEngine(w);
      if(runtime!=='off') return runtime;
    }
    if(w.engine==='vosk') return 'vosk';
    if(w.engine==='sapi') return 'sapi';
    if(w.engine==='kws') return 'kws';
    if(voskCfg.enabled&&!kwsCfg.enabled&&!sapiCfg.enabled) return 'vosk';
    if(sapiCfg.enabled&&!voskCfg.enabled&&!kwsCfg.enabled) return 'sapi';
    if(kwsCfg.enabled&&!voskCfg.enabled&&!sapiCfg.enabled) return 'kws';
    return 'off';
  }

  function activeHabitProfile(cfg){
    var hp=global.OneToneHabitProfile;
    if(!hp||!hp.projectActive) return null;
    return hp.projectActive(cfg||{})||null;
  }

  function sanitizePhraseList(arr){
    var V=global.OneToneVoiceSettingsViewModel;
    if(V&&V.sanitizePhraseList) return V.sanitizePhraseList(arr);
    return Array.isArray(arr)?arr.map(function(s){ return String(s||'').trim(); }).filter(Boolean):[];
  }

  function wakePhrases(eng, w, voskCfg, sapiCfg){
    var cfg=state().config||{};
    var active=activeHabitProfile(cfg);
    if(active&&Array.isArray(active.baseWakePhrases)&&active.baseWakePhrases.length){
      return sanitizePhraseList(active.baseWakePhrases);
    }
    if(eng==='vosk'){
      var enOnly=global.OneToneVoiceWake&&global.OneToneVoiceWake.isEnglishVoskPreset(voskModelPreset(w,voskCfg));
      var cn=Array.isArray(w.vosk&&w.vosk.phrasesCn)?cloneList(w.vosk.phrasesCn):[];
      var en=Array.isArray(w.vosk&&w.vosk.phrasesEn)?cloneList(w.vosk.phrasesEn):[];
      var fromSnap=enOnly?en:cn;
      if(fromSnap.length) return sanitizePhraseList(fromSnap);
      return sanitizePhraseList(voskCfg.phrases||[]);
    }
    if(eng==='sapi'){
      var sapiSnap=Array.isArray(w.sapi&&w.sapi.phrases)?cloneList(w.sapi.phrases):[];
      if(sapiSnap.length) return sanitizePhraseList(sapiSnap);
      return sanitizePhraseList(sapiCfg.phrases||[]);
    }
    if(eng==='kws'){
      var kwsCfg=cfg.voiceKws||cfg.voice_kws||{};
      var kwsSnap=Array.isArray(w.kws&&w.kws.phrases)?cloneList(w.kws.phrases):[];
      if(kwsSnap.length) return sanitizePhraseList(kwsSnap);
      return sanitizePhraseList(kwsCfg.phrases||[]);
    }
    var pref=preferredEngine();
    if(pref==='vosk'){
      var enOnly2=global.OneToneVoiceWake&&global.OneToneVoiceWake.isEnglishVoskPreset(voskModelPreset(w,voskCfg));
      var cn2=Array.isArray(w.vosk&&w.vosk.phrasesCn)?cloneList(w.vosk.phrasesCn):[];
      var en2=Array.isArray(w.vosk&&w.vosk.phrasesEn)?cloneList(w.vosk.phrasesEn):[];
      var fromSnap2=enOnly2?en2:cn2;
      if(fromSnap2.length) return sanitizePhraseList(fromSnap2);
      return sanitizePhraseList(voskCfg.phrases||[]);
    }
    var sapiList=Array.isArray(w.sapi&&w.sapi.phrases)?cloneList(w.sapi.phrases):[];
    if(sapiList.length) return sanitizePhraseList(sapiList);
    return sanitizePhraseList(sapiCfg.phrases||[]);
  }

  function endPhrases(endSnap, endCfg){
    var zhSnap=Array.isArray(endSnap.phrasesZh)?endSnap.phrasesZh:[];
    var enSnap=Array.isArray(endSnap.phrasesEn)?endSnap.phrasesEn:[];
    var zhCfg=endCfg.phrasesZh||endCfg.phrases_zh||[];
    var enCfg=endCfg.phrasesEn||endCfg.phrases_en||[];
    var zhList=cloneList(zhSnap.length?zhSnap:zhCfg);
    var enList=cloneList(enSnap.length?enSnap:enCfg);
    if(global.OneToneI18n.getLang()==='en') return enList.length?enList:zhList;
    return zhList.length?zhList:enList;
  }

  function micLabel(loading){
    if(loading) return t('homeLiveLoading');
    var micDevices=hooks().micDevices;
    if(!micDevices||!micDevices.length) return t('homeLiveMicUnknown');
    var activeId=hooks().activeMicId&&hooks().activeMicId();
    var dev=micDevices.find(function(d){ return d.id===activeId; })
      ||micDevices.find(function(d){ return d.isDefault; })
      ||micDevices[0];
    if(dev&&(dev.name||dev.label)) return dev.name||dev.label;
    if(activeId) return activeId;
    return t('homeLiveMicUnset');
  }

  function wakeEngineRes(eng,w){
    if(eng==='kws') return w.kws||null;
    if(eng==='vosk') return w.vosk||null;
    if(eng==='sapi') return w.sapi||null;
    return null;
  }

  function degradeReasonLabel(reason){
    var key={
      vosk_model_missing:'voiceDegradedReasonVoskModelMissing',
      vosk_start_failed:'voiceDegradedReasonVoskStartFailed',
      vosk_unavailable_acoustic_requires_pcm:'voiceDegradedReasonVoskAcousticPcm',
      vosk_unavailable_acoustic_fallback_kws:'voiceDegradedReasonVoskAcousticKws',
      kws_start_failed_acoustic_fallback_sapi:'voiceDegradedReasonKwsAcousticSapi',
      kws_start_failed_acoustic_fallback_vosk:'voiceDegradedReasonKwsAcousticVosk',
      kws_start_failed:'voiceDegradedReasonKwsStartFailed',
      sapi_start_failed:'voiceDegradedReasonSapiStartFailed'
    }[String(reason||'').trim()];
    return key?t(key):(reason||'');
  }

  function wakeHeardAndStatus(eng, voiceOn, w){
    var heardLine=null;
    var statusLine='';
    var statusMode='idle';
    var supervisor=(w&&w.supervisor)||{};
    if(!voiceOn){
      return {
        heardLine:null,
        statusLine:global.OneToneVoiceSurfaceCopy
          ?global.OneToneVoiceSurfaceCopy.resolve({paused:!!runtime().paused}).line1
          :t('homeVoiceSimpleStatusOff'),
        statusMode:'off'
      };
    }
    if(supervisor.degraded&&!supervisor.activeEngine){
      return {
        heardLine:null,
        statusLine:t('voiceDegradedStatus').replace('{reason}',degradeReasonLabel(supervisor.degradedReason)),
        statusMode:'error',
        statusKind:'warn'
      };
    }
    var res=wakeEngineRes(eng,w);
    var raw=(res&&res.state)||'stopped';
    var trigger=(res&&res.lastTrigger)||'';
    var isTriggered=raw==='triggered'||!!trigger;
    if(isTriggered&&trigger){
      return {
        heardLine:null,
        statusLine:t('homeVoiceWakeHintResultOk').replace('{text}',trigger),
        statusMode:'triggered'
      };
    }
    if(eng==='kws'&&res&&(res.stubMode||res.resourceIssue)){
      statusMode='ready';
      statusLine=t('voiceKwsStatusStubOnly');
      return { heardLine:heardLine, statusLine:statusLine, statusMode:statusMode };
    }
    var kwsListening=eng==='kws'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.isKwsNativeListening
      &&global.OneToneVoiceWake.isKwsNativeListening(res,w);
    if(kwsListening||(eng!=='kws'&&(raw==='listening'||raw==='starting'||raw==='running'||raw==='cooldown'||raw==='triggered'))){
      statusMode='listening';
      statusLine=eng==='kws'?t('voiceFbTranscriptKwsListening'):t('homeVoiceSimpleStatusListening');
      if(supervisor.degraded){
        statusLine=t('voiceDegradedListening').replace('{reason}',degradeReasonLabel(supervisor.degradedReason));
      }
      if(eng==='kws'){
        var kwsText=global.OneToneVoiceWake&&global.OneToneVoiceWake.kwsHeardDisplayText
          ?global.OneToneVoiceWake.kwsHeardDisplayText(res)
          :String((res&&res.lastDetectedPhrase)||'').trim();
        if(kwsText) heardLine=kwsText;
      }else if(eng==='sapi'){
        var heard=(res&&res.lastHeard)||'';
        if(heard) heardLine=t('voiceSapiHeard')+'：'+heard;
      }else{
        var partial=(res&&res.lastPartial)||'';
        var lastFinal=(res&&res.lastFinal)||'';
        if(partial) heardLine=t('voiceVoskPartial')+'：'+partial;
        else if(lastFinal) heardLine=t('voiceVoskFinal')+'：'+lastFinal;
      }
      return {
        heardLine:heardLine,
        statusLine:statusLine,
        statusMode:statusMode,
        statusKind:supervisor.degraded?'warn':'pending'
      };
    }
    if(eng==='vosk'&&res){
      var partialText=String(res.lastPartial||'').trim();
      var finalText=String(res.lastFinal||'').trim();
      if(partialText) heardLine=t('voiceVoskPartial')+'：'+partialText;
      else if(finalText) heardLine=t('voiceVoskFinal')+'：'+finalText;
    }else if(eng==='kws'&&res){
      var kwsHit=global.OneToneVoiceWake&&global.OneToneVoiceWake.kwsHeardDisplayText
        ?global.OneToneVoiceWake.kwsHeardDisplayText(res)
        :String(res.lastDetectedPhrase||res.lastTrigger||'').trim();
      if(kwsHit) heardLine=kwsHit;
    }
    if(supervisor.degraded){
      return {
        heardLine:heardLine,
        statusLine:t('voiceDegradedStatus').replace('{reason}',degradeReasonLabel(supervisor.degradedReason)),
        statusMode:'ready',
        statusKind:'warn'
      };
    }
    statusLine=t('homeVoiceSimpleStatusReady');
    statusMode='ready';
    return { heardLine:heardLine, statusLine:statusLine, statusMode:statusMode };
  }

  function buildLinkIds(ctx){
    var ids=[];
    var hideEngine=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    if(ctx.statusMode==='error') ids.push('helpDebug');
    else if(ctx.dictating) ids.push('endPhrases');
    else if(!ctx.voiceOn||!ctx.wakePhrase) ids.push('editWake');
    else{
      ids.push('editWake');
      ids.push('mic');
      if(ctx.engine!=='off'&&!hideEngine&&(ctx.statusKind==='warn'||ctx.statusMode==='error')) ids.push('engine');
    }
    return ids.slice(0,4);
  }

  function compute(){
    var loading=!configLoaded();
    if(loading){
      return {
        loading:true,
        voiceOn:false,
        canUse:false,
        wakePhrase:'',
        wakePhrases:[],
        statusMode:'idle',
        statusLine:t('homeLiveLoading'),
        heardLine:null,
        endLine:null,
        dictating:false,
        engine:'off',
        micLabel:micLabel(true),
        linkIds:[],
        statusKind:''
      };
    }

    var cfg=state().config||{};
    var voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    var sapiCfg=cfg.voiceSapi||cfg.voice_sapi||{};
    var kwsCfg=cfg.voiceKws||cfg.voice_kws||{};
    var endCfg=cfg.voiceEnd||cfg.voice_end||{};
    var w=snap().wake||{};
    var endSnap=snap().end||{};
    var eng=engineOn(w,voskCfg,sapiCfg,kwsCfg);
    var paused=!!runtime().paused;
    var voiceOn=global.OneToneVoiceSurfaceCopy
      ?global.OneToneVoiceSurfaceCopy.assistEnabled(cfg)&&!paused
      :(eng!=='off');
    var phrases=wakePhrases(eng,w,voskCfg,sapiCfg);
    var wakePhrase=phrases[0]||'';
    var stateRaw=endSnap.state||'idle';
    var dictating=hooks().sessionActiveState&&hooks().sessionActiveState(stateRaw);
    var endEnabled=!!endSnap.enabled||!!(endCfg&&endCfg.enabled);

    var statusMode='idle';
    var statusLine='';
    var heardLine=null;
    var endLine=null;
    var statusKind='';

    if(dictating){
      statusMode='dictating';
      if(global.OneToneVoiceSurfaceCopy){
        statusLine=global.OneToneVoiceSurfaceCopy.resolve({dictating:true,paused:paused}).line1;
      }else{
        statusLine=endSnap.statusLabel||(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.stateLabel
          ?global.OneToneVoiceEnd.stateLabel(stateRaw):stateRaw);
      }
      statusKind='pending';
      var endList=endPhrases(endSnap,endCfg);
      var endHint=endList[0]||t('homeEndPhraseDefault');
      endLine=t('homeVoiceSimpleEndLine').replace('{phrase}',endHint);
      var wSnap=snap().wake||{};
      var res=wakeEngineRes(eng,wSnap);
      if(res){
        if(eng==='vosk'){
          var partial=String(res.lastPartial||'').trim();
          var finalChunk=String(res.lastFinal||'').trim();
          if(partial) heardLine=t('voiceVoskPartial')+'：'+partial;
          else if(finalChunk) heardLine=t('voiceVoskFinal')+'：'+finalChunk;
        }else if(eng==='sapi'){
          var heard=String(res.lastHeard||'').trim();
          if(heard) heardLine=t('voiceSapiHeard')+'：'+heard;
        }else if(eng==='kws'){
          var kwsPartialDict=global.OneToneVoiceWake&&global.OneToneVoiceWake.kwsHeardDisplayText
            ?global.OneToneVoiceWake.kwsHeardDisplayText(res)
            :String(res.lastDetectedPhrase||'').trim();
          if(kwsPartialDict) heardLine=kwsPartialDict;
        }
      }
    }else if(stateRaw==='error'){
      statusMode='error';
      statusLine=endSnap.statusLabel||(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.stateLabel
        ?global.OneToneVoiceEnd.stateLabel(stateRaw):t('homeCtaError'));
      statusKind='warn';
    }else if(paused){
      statusMode='idle';
      statusLine=t('homeStatusPaused');
      statusKind='warn';
    }else if(!voiceOn){
      statusMode='off';
      if(global.OneToneVoiceSurfaceCopy){
        var surfaceOff=global.OneToneVoiceSurfaceCopy.resolve({paused:paused});
        statusLine=surfaceOff.line1;
      }else{
        statusLine=t('homeVoiceSimpleStatusOff');
      }
      statusKind='';
    }else{
      var wakeStatus=wakeHeardAndStatus(eng,true,w);
      statusMode=wakeStatus.statusMode;
      statusLine=wakeStatus.statusLine;
      heardLine=wakeStatus.heardLine;
      if(wakeStatus.statusKind) statusKind=wakeStatus.statusKind;
      else if(statusMode==='triggered') statusKind='ok';
      else if(statusMode==='listening') statusKind='pending';
      else statusKind='';
    }

    var canUse=voiceOn&&!paused&&statusMode!=='error';

    var ctx={
      voiceOn:voiceOn,
      wakePhrase:wakePhrase,
      statusMode:statusMode,
      dictating:dictating,
      engine:eng,
      statusKind:statusKind
    };

    return {
      loading:false,
      voiceOn:voiceOn,
      canUse:canUse,
      wakePhrase:wakePhrase||'',
      wakePhrases:phrases,
      statusMode:statusMode,
      statusLine:statusLine,
      heardLine:heardLine,
      endLine:endLine,
      dictating:dictating,
      endEnabled:endEnabled,
      engine:eng,
      micLabel:micLabel(false),
      linkIds:buildLinkIds(ctx),
      statusKind:statusKind
    };
  }

  global.OneToneVoiceHomeSummary={ compute:compute };
})((typeof window!=='undefined')?window:globalThis);
