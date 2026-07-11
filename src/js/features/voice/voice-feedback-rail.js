(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var micLevel=0;

  function hooks(){
    return global.__vp_voice_settings_flow_hooks__||{};
  }

  function escHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');
  }

  function resolveLatency(vm){
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
    var w=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().wake||{}:{};
    var res=vm.mode==='vosk'?w.vosk:(vm.mode==='sapi'?w.sapi:null);
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
    var label=vm.modeLabel||'—';
    if(vm.mode==='vosk'){
      var preset='cn-light';
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.currentVoskPreset){
        preset=global.OneToneVoiceWake.currentVoskPreset();
      }else{
        var w=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().wake||{}:{};
        var cfg=(global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config)||{};
        var voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
        preset=(w.vosk&&w.vosk.modelPreset)||voskCfg.modelPreset||'cn-light';
      }
      label+=' · '+(String(preset)==='en-light'?'small-en-us':'small-cn');
    }
    return label;
  }

  function resolveSendLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceSummaryOutputSilence');
    if(vm.autoSendEnabled) return t('voiceSummaryOutputAuto').replace('{key}',vm.autoSendKey);
    return t('voiceSummaryOutputConfirm');
  }

  function resolveStatus(vm){
    if(vm.loading){
      return {text:t('homeLiveLoading'),cls:'is-loading'};
    }
    var w=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().wake||{}:{};
    var res=vm.mode==='vosk'?w.vosk:(vm.mode==='sapi'?w.sapi:null);
    var end=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().end||{}:{};
    if(end&&end.state==='dictating') return {text:t('voiceFbStatusDictating'),cls:'is-live'};
    if(res&&res.enabled&&(res.state==='listening'||res.state==='starting')){
      return {text:t('voiceFbStatusListening'),cls:'is-live'};
    }
    if(!vm.voiceOn||vm.mode==='off'){
      return {text:t('voiceFbStatusOff'),cls:'is-idle'};
    }
    return {text:t('voiceFbStatusStandby'),cls:'is-standby'};
  }

  function resolveTranscriptText(){
    var w=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().wake||{}:{};
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    var res=mode==='vosk'?w.vosk:(mode==='sapi'?w.sapi:null);
    if(!res) return {text:'',partial:false,placeholder:t('voiceFbTranscriptIdle')};
    var finalText=String(res.lastFinal||'').trim();
    var partial=String(res.lastPartial||'').trim();
    var heard=String(res.lastHeard||'').trim();
    if(finalText) return {text:finalText,partial:false,placeholder:''};
    if(partial) return {text:partial,partial:true,placeholder:''};
    if(heard) return {text:heard,partial:true,placeholder:''};
    return {text:'',partial:false,placeholder:t('voiceFbTranscriptIdle')};
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

  function render(vm){
    var rail=$('voiceFeedbackRail');
    if(!rail) return;
    rail.hidden=false;

    var titleEl=$('voiceFbTitle');
    if(titleEl) titleEl.textContent=t('voiceFbTitle');

    var status=resolveStatus(vm);
    var pill=$('voiceFbStatusPill');
    if(pill){
      pill.textContent=status.text;
      pill.className='voice-fb-status-pill '+status.cls;
    }

    var metricsEl=$('voiceFbMetrics');
    var showMetrics=status.cls==='is-live'||status.cls==='is-loading';
    if(metricsEl) metricsEl.hidden=!showMetrics;

    var latencyEl=$('voiceFbMetricLatency');
    var confEl=$('voiceFbMetricConfidence');
    var engineEl=$('voiceFbMetricEngine');
    var sendEl=$('voiceFbMetricSend');
    if(latencyEl) latencyEl.textContent=resolveLatency(vm);
    if(confEl) confEl.textContent=resolveConfidence(vm);
    if(engineEl) engineEl.textContent=resolveEngineLabel(vm);
    if(sendEl) sendEl.textContent=resolveSendLabel(vm);

    var lblLatency=$('voiceFbLblLatency');
    var lblConf=$('voiceFbLblConfidence');
    var lblEngine=$('voiceFbLblEngine');
    var lblSend=$('voiceFbLblSend');
    if(lblLatency) lblLatency.textContent=t('voiceFbLblLatency');
    if(lblConf) lblConf.textContent=t('voiceFbLblConfidence');
    if(lblEngine) lblEngine.textContent=t('voiceFbLblEngine');
    if(lblSend) lblSend.textContent=t('voiceFbLblSend');

    var transcriptLbl=$('voiceFbTranscriptLbl');
    if(transcriptLbl) transcriptLbl.textContent=t('voiceFbTranscriptLbl');

    syncLiveText();
    applyMicOrbLevel(micLevel);

    var btnWake=$('voiceFbBtnSimulateWake');
    var btnSpeak=$('voiceFbBtnSimulateSpeak');
    if(btnWake) btnWake.textContent=t('voiceFbBtnSimulateWake');
    if(btnSpeak) btnSpeak.textContent=t('voiceFbBtnSimulateSpeak');
  }

  function syncLiveText(){
    var box=$('voiceFbTranscript');
    if(!box) return;
    var info=resolveTranscriptText();
    box.classList.toggle('is-partial',!!info.partial);
    if(info.text){
      box.textContent=info.text;
    }else{
      box.textContent=info.placeholder||'';
      box.classList.add('is-placeholder');
    }
    if(info.text) box.classList.remove('is-placeholder');
  }

  function setMicLevel(level){
    micLevel=level;
    applyMicOrbLevel(level);
  }

  global.OneToneVoiceFeedbackRail={
    render:render,
    syncLiveText:syncLiveText,
    setMicLevel:setMicLevel
  };
})((typeof window!=='undefined')?window:globalThis);
