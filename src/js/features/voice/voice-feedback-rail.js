(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var micLevel=0;
  var cachedStep='wake';

  function hooks(){
    return global.__vp_voice_settings_flow_hooks__||{};
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
    return vm.mode==='vosk'?w.vosk:(vm.mode==='sapi'?w.sapi:null);
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
    var res=wakeEngineRes(vm);
    var end=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().end||{}:{};
    if(end&&end.state==='dictating'){
      return {text:t('voiceFbStatusDictating'),cls:'is-live'};
    }
    if(res&&res.enabled&&(res.state==='listening'||res.state==='starting')){
      return {text:t('voiceFbStatusListening'),cls:'is-live'};
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

  function resolveTranscriptText(step){
    step=currentStep(step);
    var w=wakeSnapshot();
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    var res=mode==='vosk'?w.vosk:(mode==='sapi'?w.sapi:null);
    var profile=profileForStep(step);
    var idleKey=profile.idleKey||'voiceFbTranscriptIdle';
    if(!res) return {text:'',partial:false,placeholder:t(idleKey),matched:false};
    var finalText=String(res.lastFinal||'').trim();
    var partial=String(res.lastPartial||'').trim();
    var heard=String(res.lastHeard||'').trim();
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
