(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var micLevel=0;
  var cachedStep='wake';
  var dictationLive={ finals:[], lastFinalKey:'', sessionKey:'' };

  function resetDictationLive(){
    dictationLive={ finals:[], lastFinalKey:'', sessionKey:'' };
  }

  function endSnapshot(){
    var snap=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot():{};
    return snap.end||{};
  }

  function dictationSessionKey(end){
    end=end||{};
    return String(end.mappingId||'')+'|'+String(end.state||'');
  }

  function syncDictationFinals(end,res,mode){
    end=end||{};
    var key=dictationSessionKey(end);
    if(end.state!=='dictating'){
      if(dictationLive.sessionKey) resetDictationLive();
      return;
    }
    if(key!==dictationLive.sessionKey){
      dictationLive={ finals:[], lastFinalKey:'', sessionKey:key };
    }
    if(!res) return;
    var finalText='';
    if(mode==='vosk') finalText=String(res.lastFinal||'').trim();
    else if(mode==='sapi') finalText=String(res.lastHeard||'').trim();
    if(finalText&&finalText!==dictationLive.lastFinalKey){
      dictationLive.lastFinalKey=finalText;
      dictationLive.finals.push(finalText);
    }
  }

  function dictationDisplayText(res,mode){
    syncDictationFinals(endSnapshot(),res,mode);
    var finalized=dictationLive.finals.join('');
    var partial='';
    if(mode==='vosk'){
      partial=String(res.lastPartial||'').trim();
      if(partial&&dictationLive.finals.length&&dictationLive.finals[dictationLive.finals.length-1]===partial){
        partial='';
      }
    }else if(mode==='sapi'){
      partial=String(res.lastHeard||'').trim();
      if(partial&&dictationLive.finals.length&&dictationLive.finals[dictationLive.finals.length-1]===partial){
        partial='';
      }
    }
    if(finalized||partial){
      return {
        text:finalized+(partial||''),
        partial:!!partial,
        placeholder:'',
        matched:false
      };
    }
    return null;
  }

  function isLiveCapture(res,end){
    end=end||{};
    var stateRaw=String(res&&res.state||'').trim();
    return end.state==='dictating'||stateRaw==='listening'||stateRaw==='starting';
  }

  function hooks(){
    return global.__vp_voice_settings_flow_hooks__||{};
  }

  function isScenarioVoiceEdit(){
    var wake=global.OneToneVoiceStepWake;
    if(wake&&wake.isScenarioVoiceEdit) return wake.isScenarioVoiceEdit();
    var cmd=global.OneToneHabitScenarioVoiceCommand;
    return !!(cmd&&cmd.isScenarioEdit&&cmd.isScenarioEdit());
  }

  function scenarioFeedbackInfo(){
    var cmd=global.OneToneHabitScenarioVoiceCommand;
    return cmd&&cmd.feedbackInfo?cmd.feedbackInfo():null;
  }

  function sanitizePhrase(s){
    var V=global.OneToneVoiceSettingsViewModel;
    if(V&&V.sanitizePhrase) return V.sanitizePhrase(s);
    return String(s||'').trim();
  }

  function currentStep(step){
    if(step) return step;
    return global.OneToneVoicePageState?global.OneToneVoicePageState.getStep():cachedStep;
  }

  function wakeSnapshot(){
    var snap=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot():{};
    return snap.wake||{};
  }

  function wakeEngineRes(vm){
    var w=wakeSnapshot();
    return engineRes(vm.mode,w);
  }

  function engineRes(mode,w){
    w=w||wakeSnapshot();
    if(mode==='vosk') return w.vosk||null;
    if(mode==='sapi') return w.sapi||null;
    if(mode==='kws') return w.kws||null;
    return null;
  }

  function slotNode(slot){
    var root=$('voiceFbMetrics');
    if(!root) return null;
    return root.querySelector('[data-fb-slot="'+slot+'"]');
  }

  function setSlotLabel(slot,key){
    var node=slotNode(slot);
    if(!node) return;
    var lbl=node.querySelector('.voice-fb-metric-lbl');
    if(lbl) lbl.textContent=t(key);
  }

  function setSlotValue(slot,value){
    var node=slotNode(slot);
    if(!node) return;
    var val=node.querySelector('.voice-fb-metric-val');
    if(val) val.textContent=value==null||value===''?'—':String(value);
  }

  function resolveUsage(vm){
    if(vm.loading) return '—';
    var usage=global.OneToneAppProcessUsage;
    if(!usage||!usage.processUsageSummaryLine) return '—';
    var snap=usage.snapshot&&usage.snapshot();
    if(!snap||!snap.loaded) return '—';
    var line=usage.processUsageSummaryLine();
    if(!line||/loading|读取|…|\.\.\./i.test(line)) return '—';
    return line;
  }

  function resolveConfidence(vm){
    if(vm.loading) return '—';
    var res=wakeEngineRes(vm);
    if(!res) return '—';
    if(vm.mode==='kws'){
      var kind=String(res.lastDetectedKind||'').trim();
      if(kind) return kind;
      return '—';
    }
    if(res.lastConfidence!=null&&res.lastConfidence!=='') return String(res.lastConfidence);
    if(vm.mode==='sapi'){
      var cfg=(global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config)||{};
      var sapi=cfg.voiceSapi||cfg.voice_sapi||{};
      if(sapi.minConfidence!=null) return String(Math.round(Number(sapi.minConfidence)*100)/100);
    }
    return '—';
  }

  function resolveEngineLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    return vm.modeLabel||'—';
  }

  function resolveModelLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='kws'){
      var kws=(wakeSnapshot().kws)||{};
      if(kws.modelExists) return t('voiceKwsModelReady');
      if(kws.stubMode) return t('voiceKwsStubMode');
      return t('voiceKwsModelMissing');
    }
    if(vm.mode!=='vosk') return '—';
    var preset='cn-light';
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.currentVoskPreset){
      preset=global.OneToneVoiceWake.currentVoskPreset();
    }else{
      var w=wakeSnapshot();
      var cfg=(global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config)||{};
      var voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
      preset=(w.vosk&&w.vosk.modelPreset)||voskCfg.modelPreset||'cn-light';
    }
    return global.OneToneVoiceModelLabels&&global.OneToneVoiceModelLabels.presetLabel
      ?global.OneToneVoiceModelLabels.presetLabel(preset)
      :'—';
  }

  function resolveSendLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceSummaryOutputSilence');
    if(vm.autoSendEnabled) return t('voiceSummaryOutputAuto').replace('{key}',vm.autoSendKey);
    return t('voiceSummaryOutputConfirm');
  }

  function resolveTargetPhrase(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(isScenarioVoiceEdit()){
      var info=scenarioFeedbackInfo();
      if(info&&info.wakeLabel) return info.wakeLabel;
      return t('habitAcousticCmdTitle');
    }
    var V=global.OneToneVoiceSettingsViewModel;
    if(!V||!V.resolveDisplayWakePhrase) return '—';
    return V.resolveDisplayWakePhrase(vm).display||'—';
  }

  function resolveMicLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    return vm.wakeSourceLabel||t('homeVoiceMapMicEmpty');
  }

  function resolveWakeMatch(vm){
    if(vm.loading) return '—';
    var res=wakeEngineRes(vm);
    if(!res) return '—';
    var trigger=String(res.lastTrigger||'').trim();
    if(trigger) return trigger;
    var skip=String(res.lastSkip||'').trim();
    if(skip) return skip;
    return '—';
  }

  function resolveDelayLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    var ms=Number(vm.autoSendDelayMs);
    if(!(ms>=0)) ms=4000;
    return t('voiceEndDelaySec').replace('{n}',(ms/1000).toFixed(1));
  }

  function resolveCommitKeyLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    var key=String(vm.autoSendKey||'Enter').trim()||'Enter';
    if(global.OneToneKeyLabels) return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang());
    return key;
  }

  function resolveSendStatus(vm){
    return resolveSendLabel(vm);
  }

  function isLiveStripLayout(){
    return !!$('voiceLiveMicRow');
  }

  var LIVE_STRIP_PROFILE={
    labels:{
      primary:'voiceFbLblSend',
      secondary:'voiceFbLblDelay',
      tertiary:'voiceFbLblCommitKey',
      quaternary:'voiceFbLblEngine'
    },
    values:function(vm){
      return {
        primary:resolveSendLabel(vm),
        secondary:resolveDelayLabel(vm),
        tertiary:resolveCommitKeyLabel(vm),
        quaternary:resolveEngineLabel(vm)
      };
    },
    transcriptKey:'voiceFbTranscriptSend',
    idleKey:'voiceFbTranscriptSendIdle'
  };

  var STEP_PROFILES={
    wake:{
      labels:{primary:'voiceFbLblTargetPhrase',secondary:'voiceFbLblMic',tertiary:'voiceFbLblWakeMatch',quaternary:'voiceFbLblEngine'},
      values:function(vm){ return {
        primary:resolveTargetPhrase(vm),
        secondary:resolveMicLabel(vm),
        tertiary:resolveWakeMatch(vm),
        quaternary:resolveEngineLabel(vm)
      }; },
      transcriptKey:'voiceFbTranscriptWake',
      idleKey:'voiceFbTranscriptIdle'
    },
    recognize:{
      labels:{primary:'voiceFbLblEngine',secondary:'voiceFbLblModel',tertiary:'voiceFbLblConfidence',quaternary:'voiceFbLblUsage'},
      values:function(vm){ return {
        primary:resolveEngineLabel(vm),
        secondary:resolveModelLabel(vm),
        tertiary:resolveConfidence(vm),
        quaternary:resolveUsage(vm)
      }; },
      transcriptKey:'voiceFbTranscriptRecognize',
      idleKey:'voiceFbTranscriptRecognizeIdle'
    },
    send:{
      labels:{primary:'voiceFbLblSend',secondary:'voiceFbLblDelay',tertiary:'voiceFbLblCommitKey',quaternary:'voiceFbLblSendStatus'},
      values:function(vm){ return {
        primary:resolveSendLabel(vm),
        secondary:resolveDelayLabel(vm),
        tertiary:resolveCommitKeyLabel(vm),
        quaternary:resolveSendStatus(vm)
      }; },
      transcriptKey:'voiceFbTranscriptSend',
      idleKey:'voiceFbTranscriptSendIdle'
    }
  };

  function profileForStep(step){
    if(isLiveStripLayout()) return LIVE_STRIP_PROFILE;
    return STEP_PROFILES[currentStep(step)]||STEP_PROFILES.wake;
  }

  function applyStepProfile(vm,step){
    step=currentStep(step);
    cachedStep=step;
    var profile=profileForStep(step);
    var slots=['primary','secondary','tertiary','quaternary'];
    slots.forEach(function(slot){
      setSlotLabel(slot,profile.labels[slot]);
    });
    var vals=profile.values(vm);
    slots.forEach(function(slot){
      setSlotValue(slot,vals[slot]);
    });
    var transcriptLbl=$('voiceFbTranscriptLbl');
    if(transcriptLbl) transcriptLbl.textContent=t(profile.transcriptKey);
  }

  function resolveStatus(vm,step){
    if(vm.loading){
      return {text:t('homeLiveLoading'),cls:'is-loading'};
    }
    if(isScenarioVoiceEdit()){
      var info=scenarioFeedbackInfo();
      if(info&&info.statusKey){
        return {
          text:t(info.statusKey),
          cls:info.live?'is-live':(info.calibrating?'is-loading':'is-standby')
        };
      }
    }
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending()){
      return {text:t('voiceModeSwitching'),cls:'is-loading'};
    }
    var w=wakeSnapshot();
    var runtime=global.OneToneVoiceWake&&global.OneToneVoiceWake.resolveRuntimeEngine
      ?global.OneToneVoiceWake.resolveRuntimeEngine(w):vm.mode;
    var res=engineRes(runtime,w);
    var end=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().end||{}:{};
    if(end&&end.state==='dictating'){
      return {text:t('voiceFbStatusDictating'),cls:'is-live'};
    }
    var supervisor=w.supervisor||{};
    if(supervisor.degraded&&!supervisor.activeEngine){
      return {text:t('voiceDegradedStatus').replace('{reason}',supervisor.degradedReason||''),cls:'is-standby'};
    }
    if(runtime==='kws'&&res){
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.isKwsNativeListening&&global.OneToneVoiceWake.isKwsNativeListening(res,w)){
        if(supervisor.degraded){
          return {text:t('voiceDegradedListening').replace('{reason}',supervisor.degradedReason||''),cls:'is-live'};
        }
        return {text:t('voiceFbStatusListening'),cls:'is-live'};
      }
      if(res.stubMode||res.resourceIssue){
        return {text:t('voiceKwsStatusStubOnly'),cls:'is-standby'};
      }
    }else if(res&&(res.enabled||(supervisor.activeEngine===runtime))&&(res.state==='listening'||res.state==='starting')){
      if(supervisor.degraded){
        return {text:t('voiceDegradedListening').replace('{reason}',supervisor.degradedReason||''),cls:'is-live'};
      }
      return {text:t('voiceFbStatusListening'),cls:'is-live'};
    }
    if(supervisor.degraded){
      return {text:t('voiceDegradedStatus').replace('{reason}',supervisor.degradedReason||''),cls:'is-standby'};
    }
    if(!vm.voiceOn||vm.mode==='off'){
      return {text:t('voiceFbStatusOff'),cls:'is-idle'};
    }
    return {text:t('voiceFbStatusStandby'),cls:'is-standby'};
  }

  function isTranscriptMatched(res,text){
    if(!res) return false;
    if(String(res.lastTrigger||'').trim()) return true;
    if(String(res.lastDetectedPhrase||'').trim()) return true;
    if(!text) return false;
    var phrases=Array.isArray(res.phrases)?res.phrases:[];
    if(!phrases.length) return false;
    var matcher=global.OneTonePhrasePractice&&global.OneTonePhrasePractice.matchWakePhrase;
    return !!(matcher&&matcher(text,phrases));
  }

  function resolveKwsTranscript(res,end){
    end=end||{};
    if(end.state==='dictating'){
      var action=String(end.lastAction||'').trim();
      if(action){
        return {text:action,partial:false,placeholder:'',matched:true};
      }
      return {text:'',partial:false,placeholder:t('voiceFbTranscriptKwsDictating'),matched:false};
    }
    var trigger=sanitizePhrase(res.lastTrigger||'');
    if(trigger){
      return {text:trigger,partial:false,placeholder:'',matched:true};
    }
    var phrase=sanitizePhrase(res.lastDetectedPhrase||'');
    if(phrase){
      return {text:phrase,partial:false,placeholder:'',matched:isTranscriptMatched(res,phrase)};
    }
    var skip=sanitizePhrase(res.lastSkip||'');
    if(skip){
      return {text:skip,partial:false,placeholder:'',matched:false};
    }
    var partial=global.OneToneVoiceWake&&global.OneToneVoiceWake.kwsHeardDisplayText
      ?global.OneToneVoiceWake.kwsHeardDisplayText(res)
      :'';
    if(partial){
      return {text:partial,partial:false,placeholder:'',matched:isTranscriptMatched(res,partial)};
    }
    if(res.stubMode||res.resourceIssue){
      return {text:'',partial:false,placeholder:String(res.resourceIssue||t('voiceKwsStubNativeMissing')),matched:false};
    }
    var wake=wakeSnapshot();
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.isKwsNativeListening&&global.OneToneVoiceWake.isKwsNativeListening(res,wake)){
      var phrases=Array.isArray(res.phrases)?res.phrases.map(sanitizePhrase).filter(Boolean):[];
      var hint=phrases.length?phrases.slice(0,3).join(' / '):'';
      var placeholder=t('voiceFbTranscriptKwsListening');
      if(hint) placeholder+=' · '+hint;
      if(micLevel>8) placeholder+=' · '+t('voiceFbTranscriptKwsMicHot');
      else if(micLevel<=1) placeholder+=' · '+t('voiceFbTranscriptKwsMicQuiet');
      return {text:'',partial:false,placeholder:placeholder,matched:false};
    }
    return null;
  }

  function resolveFeedbackMode(){
    var wakeApi=global.OneToneVoiceWake;
    if(wakeApi&&wakeApi.resolveRuntimeEngine) return wakeApi.resolveRuntimeEngine();
    if(wakeApi&&wakeApi.currentMode) return wakeApi.currentMode();
    return 'off';
  }

  function resolveTranscriptText(step){
    step=currentStep(step);
    if(isScenarioVoiceEdit()){
      var scenarioInfo=scenarioFeedbackInfo();
      var transcriptKey=scenarioInfo&&scenarioInfo.transcriptKey
        ?scenarioInfo.transcriptKey
        :'habitAcousticCmdFbNoTranscript';
      return {text:'',partial:false,placeholder:t(transcriptKey),matched:false};
    }
    var w=wakeSnapshot();
    var end=endSnapshot();
    var mode=resolveFeedbackMode();
    var res=engineRes(mode,w);
    var profile=profileForStep(step);
    var idleKey=profile.idleKey||'voiceFbTranscriptIdle';
    if(!res){
      return {text:'',partial:false,placeholder:t(idleKey),matched:false};
    }

    if(mode==='kws'){
      var kwsInfo=resolveKwsTranscript(res,end);
      if(kwsInfo) return kwsInfo;
      return {text:'',partial:false,placeholder:t('voiceFbTranscriptRecognizeIdle'),matched:false};
    }

    if(end.state==='dictating'){
      var dictation=dictationDisplayText(res,mode);
      if(dictation) return dictation;
      return {text:'',partial:false,placeholder:t('voiceFbTranscriptSendIdle'),matched:false};
    }

    var finalText=String(res.lastFinal||'').trim();
    var partial=String(res.lastPartial||'').trim();
    var heard=String(res.lastHeard||'').trim();
    var live=isLiveCapture(res,end);

    if(live){
      if(mode==='vosk'&&partial){
        return {text:partial,partial:true,placeholder:'',matched:isTranscriptMatched(res,partial)};
      }
      if(mode==='sapi'&&heard){
        return {text:heard,partial:true,placeholder:'',matched:isTranscriptMatched(res,heard)};
      }
      if(finalText){
        return {text:finalText,partial:false,placeholder:'',matched:isTranscriptMatched(res,finalText)};
      }
      return {text:'',partial:false,placeholder:t(idleKey),matched:false};
    }

    if(finalText){
      return {text:finalText,partial:false,placeholder:'',matched:isTranscriptMatched(res,finalText)};
    }
    if(partial){
      return {text:partial,partial:true,placeholder:'',matched:isTranscriptMatched(res,partial)};
    }
    if(heard){
      return {text:heard,partial:true,placeholder:'',matched:isTranscriptMatched(res,heard)};
    }
    return {text:'',partial:false,placeholder:t(idleKey),matched:false};
  }

  function applyMicOrbLevel(level){
    var orb=$('voiceFbMicOrb');
    if(!orb) return;
    var ring=orb.querySelector('.voice-fb-mic-ring');
    if(!ring) return;
    var pct=Math.max(0,Math.min(100,Math.round(Number(level)||0)));
    ring.style.setProperty('--fb-mic-level',String(pct));
    orb.classList.toggle('is-hot',pct>8);
  }

  function updateTranscript(step){
    var box=$('voiceFbTranscript');
    if(!box) return;
    var info=resolveTranscriptText(step);
    box.classList.toggle('is-partial',!!info.partial);
    box.classList.toggle('is-matched',!!info.matched);
    if(info.text){
      box.textContent=info.matched?(info.text+' ✓'):info.text;
      box.classList.remove('is-placeholder');
    }else{
      box.textContent=info.placeholder||'';
      box.classList.remove('is-matched');
      box.classList.add('is-placeholder');
    }
  }

  function updateLiveSlotValues(vm,step){
    if(isLiveStripLayout()){
      var vals=LIVE_STRIP_PROFILE.values(vm);
      setSlotValue('primary',vals.primary);
      setSlotValue('secondary',vals.secondary);
      return;
    }
    step=currentStep(step);
    if(step==='wake'){
      setSlotValue('tertiary',resolveWakeMatch(vm));
    }else if(step==='recognize'){
      setSlotValue('tertiary',resolveConfidence(vm));
      setSlotValue('quaternary',resolveUsage(vm));
    }
  }

  function render(vm,step){
    var rail=$('voiceFeedbackRail');
    if(!rail) return;
    rail.hidden=false;
    step=currentStep(step);

    var titleEl=$('voiceFbTitle');
    if(titleEl) titleEl.textContent=t('voiceFbTitle');

    var status=resolveStatus(vm,step);
    var pill=$('voiceFbStatusPill');
    if(pill){
      pill.textContent=status.text;
      pill.className='voice-fb-status-pill '+status.cls;
    }

    var metricsEl=$('voiceFbMetrics');
    if(metricsEl) metricsEl.hidden=false;

    applyStepProfile(vm,step);
    updateTranscript(step);
    applyMicOrbLevel(micLevel);

    var btnWake=$('voiceFbBtnSimulateWake');
    var btnSpeak=$('voiceFbBtnSimulateSpeak');
    if(btnWake) btnWake.textContent=t('voiceFbBtnSimulateWake');
    if(btnSpeak) btnSpeak.textContent=t('voiceFbBtnSimulateSpeak');
  }

  function syncLiveState(vm,step){
    if(!vm) return;
    step=currentStep(step);
    var status=resolveStatus(vm,step);
    var pill=$('voiceFbStatusPill');
    if(pill){
      pill.textContent=status.text;
      pill.className='voice-fb-status-pill '+status.cls;
    }
    updateTranscript(step);
    updateLiveSlotValues(vm,step);
    applyMicOrbLevel(micLevel);
  }

  function syncLiveText(){
    updateTranscript(currentStep());
  }

  function setMicLevel(level){
    micLevel=level;
    applyMicOrbLevel(level);
  }

  global.OneToneVoiceFeedbackRail={
    render:render,
    syncLiveState:syncLiveState,
    syncLiveText:syncLiveText,
    setMicLevel:setMicLevel
  };
})((typeof window!=='undefined')?window:globalThis);
