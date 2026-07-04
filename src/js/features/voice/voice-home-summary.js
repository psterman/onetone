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
    if(hooks().homePreferredVoiceEngine) return hooks().homePreferredVoiceEngine();
    var cfg=state().config||{};
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    if(vosk.enabled) return 'vosk';
    return 'sapi';
  }

  function voskModelPreset(w, voskCfg){
    var vosk=w.vosk||{};
    return String(vosk.modelPreset||voskCfg.modelPreset||'cn-light').trim()||'cn-light';
  }

  function engineOn(w, voskCfg, sapiCfg){
    if(w.engine==='vosk'||voskCfg.enabled) return 'vosk';
    if(w.engine==='sapi'||sapiCfg.enabled) return 'sapi';
    return 'off';
  }

  function wakePhrases(eng, w, voskCfg, sapiCfg){
    if(eng==='vosk'){
      var enOnly=global.OneToneVoiceWake&&global.OneToneVoiceWake.isEnglishVoskPreset(voskModelPreset(w,voskCfg));
      var cn=Array.isArray(w.vosk&&w.vosk.phrasesCn)?cloneList(w.vosk.phrasesCn):[];
      var en=Array.isArray(w.vosk&&w.vosk.phrasesEn)?cloneList(w.vosk.phrasesEn):[];
      var fromSnap=enOnly?en:cn;
      if(fromSnap.length) return fromSnap;
      return cloneList(voskCfg.phrases||[]);
    }
    if(eng==='sapi'){
      var sapiSnap=Array.isArray(w.sapi&&w.sapi.phrases)?cloneList(w.sapi.phrases):[];
      if(sapiSnap.length) return sapiSnap;
      return cloneList(sapiCfg.phrases||[]);
    }
    var pref=preferredEngine();
    if(pref==='vosk'){
      var enOnly2=global.OneToneVoiceWake&&global.OneToneVoiceWake.isEnglishVoskPreset(voskModelPreset(w,voskCfg));
      var cn2=Array.isArray(w.vosk&&w.vosk.phrasesCn)?cloneList(w.vosk.phrasesCn):[];
      var en2=Array.isArray(w.vosk&&w.vosk.phrasesEn)?cloneList(w.vosk.phrasesEn):[];
      var fromSnap2=enOnly2?en2:cn2;
      if(fromSnap2.length) return fromSnap2;
      return cloneList(voskCfg.phrases||[]);
    }
    var sapiList=Array.isArray(w.sapi&&w.sapi.phrases)?cloneList(w.sapi.phrases):[];
    if(sapiList.length) return sapiList;
    return cloneList(sapiCfg.phrases||[]);
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

  function wakeHeardAndStatus(eng, voiceOn, w){
    var heardLine=null;
    var statusLine='';
    var statusMode='idle';
    if(!voiceOn){
      return { heardLine:null, statusLine:t('homeVoiceSimpleStatusOff'), statusMode:'off' };
    }
    var res=eng==='vosk'?w.vosk:w.sapi;
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
    if(raw==='listening'||raw==='starting'){
      statusMode='listening';
      statusLine=t('homeVoiceSimpleStatusListening');
      if(eng==='sapi'){
        var heard=(res&&res.lastHeard)||'';
        if(heard) heardLine=t('voiceSapiHeard')+'：'+heard;
      }else{
        var partial=(res&&res.lastPartial)||'';
        if(partial) heardLine=t('voiceVoskPartial')+'：'+partial;
      }
      return { heardLine:heardLine, statusLine:statusLine, statusMode:statusMode };
    }
    statusLine=t('homeVoiceSimpleStatusReady');
    statusMode='ready';
    return { heardLine:null, statusLine:statusLine, statusMode:statusMode };
  }

  function buildLinkIds(ctx){
    var ids=[];
    if(ctx.statusMode==='error') ids.push('helpDebug');
    else if(ctx.dictating) ids.push('endPhrases');
    else if(!ctx.voiceOn||!ctx.wakePhrase) ids.push('editWake');
    else{
      ids.push('editWake');
      ids.push('mic');
      if(ctx.engine!=='off') ids.push('engine');
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
    var endCfg=cfg.voiceEnd||cfg.voice_end||{};
    var w=snap().wake||{};
    var endSnap=snap().end||{};
    var eng=engineOn(w,voskCfg,sapiCfg);
    var voiceOn=eng!=='off';
    var paused=!!runtime().paused;
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
      statusLine=endSnap.statusLabel||(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.stateLabel
        ?global.OneToneVoiceEnd.stateLabel(stateRaw):stateRaw);
      statusKind='pending';
      var endList=endPhrases(endSnap,endCfg);
      var endHint=endList[0]||t('homeEndPhraseDefault');
      endLine=t('homeVoiceSimpleEndLine').replace('{phrase}',endHint);
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
      statusLine=t('homeVoiceSimpleStatusOff');
      statusKind='';
    }else{
      var wakeStatus=wakeHeardAndStatus(eng,true,w);
      statusMode=wakeStatus.statusMode;
      statusLine=wakeStatus.statusLine;
      heardLine=wakeStatus.heardLine;
      if(statusMode==='triggered') statusKind='ok';
      else if(statusMode==='listening') statusKind='pending';
      else statusKind='';
    }

    var canUse=voiceOn&&!paused&&statusMode!=='error';

    var ctx={
      voiceOn:voiceOn,
      wakePhrase:wakePhrase,
      statusMode:statusMode,
      dictating:dictating,
      engine:eng
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
