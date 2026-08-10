(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key,vars){
    var s=global.OneToneI18n.t(key);
    if(!vars) return s;
    return String(s).replace(/\{(\w+)\}/g,function(_,k){
      return vars[k]!=null?String(vars[k]):'';
    });
  }
  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  var draft=null;
  var promptTimer=null;
  var recordVisTimer=null;
  var hardCapTimer=null;
  var recordStartedAt=0;
  var liveLevel=null;
  var hasLiveLevel=false;
  var bound=false;
  var onChangeCb=null;
  var finishInFlight=false;
  var inlineCtx=null; // { mappingId, hostId } — open-app card host; do not touch ui voiceEditSchemeId

  var DEFAULT_THRESHOLDS={
    minSpeechMs:450,
    preferSpeechMs:700,
    maxSpeechMs:2000,
    manualMaxMs:3500,
    recordTimeoutMs:8000
  };

  function thresholdsFrom(src){
    var base=src&&src.thresholds?src.thresholds:src;
    return {
      minSpeechMs:Math.max(100,Number(base&&base.minSpeechMs)||DEFAULT_THRESHOLDS.minSpeechMs),
      preferSpeechMs:Math.max(100,Number(base&&base.preferSpeechMs)||DEFAULT_THRESHOLDS.preferSpeechMs),
      maxSpeechMs:Math.max(200,Number(base&&base.maxSpeechMs)||DEFAULT_THRESHOLDS.maxSpeechMs),
      manualMaxMs:Math.max(1000,Number(base&&base.manualMaxMs)||DEFAULT_THRESHOLDS.manualMaxMs),
      recordTimeoutMs:Math.max(1000,Number(base&&base.recordTimeoutMs)||DEFAULT_THRESHOLDS.recordTimeoutMs)
    };
  }

  function currentThresholds(){
    return thresholdsFrom(draft||DEFAULT_THRESHOLDS);
  }

  function buildMicBars(count){
    count=count||25;
    var html='';
    for(var i=0;i<count;i++) html+='<span></span>';
    return html;
  }

  function newSessionId(){
    return 'acr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  }

  function sampleStepIndex(){
    if(!draft) return 1;
    var n=Array.isArray(draft.samples)?draft.samples.length:0;
    if(draft.state==='recording') return Math.min(2,n+1);
    return Math.min(2,Math.max(1,n));
  }

  function levelToBarScales(level,count){
    count=count||25;
    var norm=Math.max(0,Math.min(1,Number(level)||0));
    // Steeper gain so near/far mic changes are obvious on center bars.
    if(norm>0.015) norm=Math.min(1,Math.pow(norm*2.35,0.72));
    else norm=0.1;
    var out=[];
    var center=(count-1)/2;
    for(var i=0;i<count;i++){
      var dist=Math.abs(i-center)/Math.max(center,1);
      out.push(Math.max(0.1,Math.min(1,norm*(1-dist*0.55)*(0.82+0.18*Math.sin(i*0.9)))));
    }
    return out;
  }

  function durationMeterState(elapsedMs,speechMs,thresholds){
    thresholds=thresholdsFrom(thresholds);
    var elapsed=Math.max(0,Number(elapsedMs)||0);
    var speech=Math.max(0,Number(speechMs)||0);
    // Fill must advance on wall clock even when VAD speechMs is still 0.
    var ms=Math.max(speech,elapsed);
    var maxMs=thresholds.maxSpeechMs;
    var minMs=thresholds.minSpeechMs;
    var preferMs=thresholds.preferSpeechMs;
    // Track spans to 3s like M3 prototype so recommend band stays mid-segment.
    var trackMaxMs=3000;
    var pct=Math.min(100,Math.round((ms/trackMaxMs)*100));
    // Zone follows detected speech when present; else low while clock runs.
    var zoneMs=speech>0?speech:0;
    var zone='idle';
    if(zoneMs>=minMs&&zoneMs<=maxMs) zone='good';
    else if(zoneMs>maxMs) zone='warn';
    else if(zoneMs>0||elapsed>0) zone='low';
    var zoneStart=Math.min(100,Math.round((minMs/trackMaxMs)*100));
    var zoneEnd=Math.min(100,Math.round((maxMs/trackMaxMs)*100));
    return {
      ms:ms,
      pct:pct,
      zone:zone,
      preferPct:Math.min(100,Math.round((preferMs/trackMaxMs)*100)),
      minPct:zoneStart,
      maxPct:zoneEnd,
      zoneWidth:Math.max(0,zoneEnd-zoneStart),
      trackMaxMs:trackMaxMs
    };
  }

  function voiceHintFromMetrics(metrics,thresholds){
    metrics=metrics||{};
    thresholds=thresholdsFrom(thresholds);
    var level=Number(metrics.level)||0;
    var speechMs=Number(metrics.speechMs)||0;
    var peak=Number(metrics.peak)||0;
    if(speechMs>thresholds.maxSpeechMs) return 'tooLong';
    if(level>0.02||speechMs>80){
      if(level<0.12&&peak<0.2) return 'tooQuiet';
      if(speechMs>=thresholds.minSpeechMs) return 'good';
      return 'speaking';
    }
    return 'waiting';
  }

  function recordPhaseText(phase,metrics,thresholds){
    thresholds=thresholdsFrom(thresholds);
    phase=String(phase||'');
    if(phase==='preparing') return t('habitAcousticCmdPhasePreparing');
    if(phase==='armed') return t('habitAcousticCmdPhaseArmed');
    if(phase==='startingMic') return t('habitAcousticCmdPhaseStartingMic');
    if(phase==='processing') return t('habitAcousticCmdPhaseProcessing');
    if(phase==='recording'||phase==='listening'){
      var hint=voiceHintFromMetrics(metrics,thresholds);
      if(hint==='tooQuiet') return t('habitAcousticCmdPhaseTooQuiet');
      if(hint==='good') return t('habitAcousticCmdPhaseGood');
      if(hint==='tooLong') return t('habitAcousticCmdPhaseTooLongSoft');
      if(hint==='speaking') return t('habitAcousticCmdPhaseSpeaking');
      return t('habitAcousticCmdPhaseSpeakNow');
    }
    return t('habitAcousticCmdRecording');
  }

  function recordErrorHint(messageKey,reason,debugSummary){
    var key=String(messageKey||'');
    if(key==='habitAcousticCmdNoMic'||key==='habitAcousticCmdStreamFailed'){
      return t('habitAcousticCmdErrHintMic');
    }
    if(key==='habitAcousticCmdMicBusy') return t('habitAcousticCmdErrHintBusy');
    if(key==='habitAcousticCmdNoAudio') return t('habitAcousticCmdErrHintNoAudio');
    if(key==='habitAcousticCmdTooShort') return t('habitAcousticCmdTooShortHint');
    if(key==='habitAcousticCmdTooLong') return t('habitAcousticCmdTooLongHint');
    if(key==='habitAcousticCmdTimeout') return t('habitAcousticCmdTimeoutHint');
    if(key==='habitAcousticCmdTryClearer'||key==='habitAcousticCmdUnstable'){
      return t('habitAcousticCmdMatchFailHint');
    }
    if(key==='habitAcousticCmdNeedRebuild') return t('habitAcousticCmdNeedRebuild');
    var speechMs=debugSummary&&debugSummary.speechMs!=null?Number(debugSummary.speechMs):0;
    var rms=debugSummary&&debugSummary.rms!=null?Number(debugSummary.rms):0;
    if(speechMs>0&&speechMs<DEFAULT_THRESHOLDS.minSpeechMs) return t('habitAcousticCmdTooShortHint');
    if(rms>0&&rms<0.01) return t('habitAcousticCmdErrHintNoAudio');
    if(reason) return t('habitAcousticCmdErrHintGeneric');
    return t('habitAcousticCmdTimeoutHint');
  }

  function recordQualityLabel(quality,agreement){
    var q=String(quality||'');
    if(q==='good') return t('habitAcousticCmdLearned');
    if(q==='ok'){
      if(Number(agreement)>0&&Number(agreement)<0.75) return t('habitAcousticCmdSuggestMoreSpecific');
      return t('habitAcousticCmdSuggestRerecord');
    }
    if(q==='weak') return t('habitAcousticCmdSuggestRerecord');
    return t('habitAcousticCmdLearned');
  }

  function debugSummaryLine(debug){
    if(!debug) return '';
    var speechMs=debug.speechMs!=null?Number(debug.speechMs):0;
    var rms=debug.rms!=null?Number(debug.rms):0;
    var parts=[];
    if(speechMs>0) parts.push(t('habitAcousticCmdDebugSpeech',{s:(speechMs/1000).toFixed(1)}));
    if(rms>0){
      parts.push(rms<0.01?t('habitAcousticCmdDebugQuiet'):t('habitAcousticCmdDebugLevelOk'));
    }
    return parts.join(t('habitAcousticCmdDebugJoin'));
  }

  function renderDurationMeter(ms,opts){
    opts=opts||{};
    var th=opts.thresholds||currentThresholds();
    var speechMs=opts.speechMs!=null?opts.speechMs:ms;
    var st=durationMeterState(ms,speechMs,th);
    var zoneBand='<span class="habit-voice-cmd-meter-zone" style="left:'+st.minPct+'%;width:'+st.zoneWidth+'%"></span>';
    var trackEndLbl=(st.trackMaxMs/1000).toFixed(st.trackMaxMs%1000?1:0)+'s';
    // Prototype labels: 0.5s · • 推荐区域 (0.5s-2s) · 2s · 3s — zone copy stays primary, not semantic.
    return '<div class="habit-voice-cmd-meter is-'+st.zone+(opts.compact?' is-compact':'')+(st.zone==='good'?' is-settled':'')+'">'
      +'<div class="habit-voice-cmd-meter-track">'+zoneBand
      +'<span class="habit-voice-cmd-meter-fill" style="width:'+st.pct+'%"></span></div>'
      +'<div class="habit-voice-cmd-meter-labels">'
      +'<span>'+esc(t('habitAcousticCmdRecordZoneMin'))+'</span>'
      +'<span class="habit-voice-cmd-meter-zone-lbl"><span class="habit-voice-cmd-meter-dot" aria-hidden="true"></span>'
      +esc(t('habitAcousticCmdRecordZoneRange'))+'</span>'
      +'<span>'+esc(t('habitAcousticCmdRecordZoneMax'))+'</span>'
      +'<span>'+esc(trackEndLbl)+'</span>'
      +'</div></div>';
  }

  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function acoustic(){ return global.OneToneVoiceAcousticIpc; }

  function voiceModeEnabled(m){
    var ed=global.OneToneHabitScenarioVoiceEditor;
    if(ed&&ed.voiceModeEnabled) return ed.voiceModeEnabled(m);
    return m?m.voiceModeEnabled!==false:true;
  }

  function clearPromptTimer(){
    if(promptTimer){
      global.clearTimeout(promptTimer);
      promptTimer=null;
    }
    if(hardCapTimer){
      global.clearTimeout(hardCapTimer);
      hardCapTimer=null;
    }
  }

  function setSuspended(on){
    var api=acoustic();
    if(!api||!api.setSuspend) return Promise.resolve();
    return api.setSuspend(!!on).catch(function(){ return null; });
  }

  function stopRecordVis(){
    if(recordVisTimer){
      global.clearInterval(recordVisTimer);
      recordVisTimer=null;
    }
    recordStartedAt=0;
  }

  function cleanupRecordingSession(opts){
    opts=opts||{};
    var api=acoustic();
    var sid=draft&&draft.recordSessionId?String(draft.recordSessionId):'';
    var phase=draft&&draft.uiPhase?String(draft.uiPhase):'';
    // Mid-take abort must be explicit. Accidental unsuspend during recording
    // restarts Vosk on the wrong thread and freezes the webview.
    var midTake=phase==='startingMic'||phase==='recording'||phase==='processing';
    if(midTake&&!opts.force){
      if(api&&api.unlistenLevel) api.unlistenLevel();
      stopRecordVis();
      clearPromptTimer();
      liveLevel=null;
      hasLiveLevel=false;
      if(api&&api.recordCancel){
        return api.recordCancel({sessionId:sid}).catch(function(){ return null; });
      }
      return Promise.resolve();
    }
    finishInFlight=false;
    if(api&&api.unlistenLevel) api.unlistenLevel();
    stopRecordVis();
    clearPromptTimer();
    liveLevel=null;
    hasLiveLevel=false;
    // Always cancel — releases parked multi-take mic lease even if sessionId cleared.
    var cancelP=api&&api.recordCancel
      ?api.recordCancel({sessionId:sid})
      :Promise.resolve();
    if(draft){
      draft.recordSessionId='';
      draft.uiPhase='';
      draft.nextTakeCountdownMs=0;
    }
    return cancelP.then(function(){
      if(opts.unsuspend!==false) return setSuspended(false);
      return null;
    }).catch(function(){
      if(opts.unsuspend!==false) return setSuspended(false);
      return null;
    });
  }

  function discardDraft(){
    cleanupRecordingSession({unsuspend:true,force:true});
    draft=null;
  }

  function setInlineContext(opts){
    opts=opts||{};
    var mappingId=String(opts.mappingId||'').trim();
    var hostId=String(opts.hostId||'').trim();
    if(!mappingId){
      inlineCtx=null;
      return;
    }
    inlineCtx={ mappingId:mappingId, hostId:hostId };
    // Migrate legacy open-app samples to open-app-acoustic (no wake-key fallback).
    var m=core()&&core().byId?core().byId(mappingId):null;
    if(m&&Array.isArray(m.acousticVoiceCommands)&&m.acousticVoiceCommands[0]){
      var cmd=m.acousticVoiceCommands[0];
      if(cmd&&String(cmd.kind||'')!=='open-app-acoustic'){
        cmd.kind='open-app-acoustic';
        persistMapping(m);
      }
    }
  }

  function clearInlineContext(){
    if(inlineCtx&&draft&&draft.mappingId===inlineCtx.mappingId){
      discardDraft();
    }
    inlineCtx=null;
  }

  function scenarioContextId(){
    if(inlineCtx&&inlineCtx.mappingId){
      var inlineId=inlineCtx.mappingId;
      var inlineM=core()&&core().byId?core().byId(inlineId):null;
      if(inlineM&&String(inlineM.appTargetId||'').trim()) return inlineId;
      return '';
    }
    var id=String(ui().habitScenarioReturnId||ui().voiceEditSchemeId||'').trim();
    if(!id) return '';
    var m=core()&&core().byId?core().byId(id):null;
    if(!m) return '';
    var diff=global.OneToneHabitOverrideDiff;
    if(diff&&diff.isAppScenarioMapping&&!diff.isAppScenarioMapping(m)) return '';
    if(!String(m.appTargetId||'').trim()) return '';
    return id;
  }

  function currentMapping(){
    var id=scenarioContextId();
    return id&&core()&&core().byId?core().byId(id):null;
  }

  function primaryCommand(m){
    if(!m||!Array.isArray(m.acousticVoiceCommands)) return null;
    for(var i=0;i<m.acousticVoiceCommands.length;i++){
      if(m.acousticVoiceCommands[i]) return m.acousticVoiceCommands[i];
    }
    return null;
  }

  function notifyChange(){
    if(typeof onChangeCb==='function') onChangeCb();
  }

  function persistMapping(m){
    notifyChange();
    var persist=global.OneToneConfigPersist;
    if(persist&&persist.saveAsync) return persist.saveAsync({source:'voice'});
    if(persist&&persist.save){ persist.save({source:'voice'}); return Promise.resolve(true); }
    return Promise.resolve(false);
  }

  function ensureHost(){
    if(inlineCtx&&inlineCtx.hostId){
      var inlineHost=$(inlineCtx.hostId);
      if(inlineHost) return inlineHost;
      if(typeof document!=='undefined'&&document.getElementById){
        return document.getElementById(inlineCtx.hostId);
      }
      return null;
    }
    return $('habitScenarioVoiceCommandHost');
  }

  function chipLabel(cmd){
    if(!cmd) return '';
    if(cmd.enabled===false) return t('habitAcousticCmdPaused');
    var text=String(cmd.displayText||'').trim();
    if(text) return text;
    return recordQualityLabel(cmd.quality,cmd.agreement);
  }

  function chipClass(cmd){
    if(!cmd) return '';
    if(cmd.enabled===false) return 'is-disabled';
    if(cmd.quality==='ok'||cmd.quality==='weak') return 'is-warn';
    return 'is-good';
  }

  function displayHint(cmd){
    if(!cmd) return '';
    var text=String(cmd.displayText||'').trim();
    if(!text) return t('habitAcousticCmdNoLabelHint');
    return '';
  }

  function resolvePendingScope(m,cmd){
    if(cmd&&cmd.activationScope==='foreground-app') return 'foreground-app';
    if(draft&&draft.mappingId===(m&&m.id)&&draft.pendingScope==='foreground-app') return 'foreground-app';
    return 'global';
  }

  function renderScopeSeg(scope){
    scope=scope==='foreground-app'?'foreground-app':'global';
    return '<div class="habit-voice-cmd-scope pref-segmented" role="group" aria-label="'+esc(t('habitAcousticCmdScopeLbl'))+'">'
      +'<button type="button" class="pref-segmented-btn keys-trigger-mode-seg'+(scope==='global'?' is-active':'')+'" data-voice-cmd-scope="global">'
      +esc(t('habitAcousticCmdScopeGlobal'))+'</button>'
      +'<button type="button" class="pref-segmented-btn keys-trigger-mode-seg'+(scope==='foreground-app'?' is-active':'')+'" data-voice-cmd-scope="foreground-app">'
      +esc(t('habitAcousticCmdScopeApp'))+'</button>'
      +'</div>';
  }

  function renderIdle(m,cmd){
    var scope=resolvePendingScope(m,cmd);
    var hint=displayHint(cmd);
    var disabled=!voiceModeEnabled(m);
    var html='<div class="habit-scenario-voice-field habit-scenario-voice-command'+(disabled?' is-disabled':'')+'">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('habitAcousticCmdTitle'))+'</span>'
      +renderScopeSeg(scope)
      +'</div>'
      +'<p class="habit-voice-cmd-desc">'+esc(t('habitAcousticCmdDesc'))+'</p>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted">'+esc(t('habitAcousticCmdNoTouchWake'))+'</p>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted habit-voice-cmd-disclaimer">'+esc(t('habitAcousticCmdDisclaimer'))+'</p>'
      +(scope==='foreground-app'?'<p class="habit-voice-cmd-scope-hint">'+esc(t('habitAcousticCmdScopeFgHint'))+'</p>':'');
    if(cmd){
      var qualityText=recordQualityLabel(cmd.quality,cmd.agreement);
      html+='<div class="habit-voice-cmd-status">'
        +'<span class="habit-voice-cmd-chip '+chipClass(cmd)+'">'+esc(chipLabel(cmd))+'</span>'
        +(String(cmd.displayText||'').trim()?'<span class="habit-voice-cmd-quality">'+esc(qualityText)+'</span>':'')
        +(hint?'<span class="habit-voice-cmd-display-hint">'+esc(hint)+'</span>':'')
        +'<div class="habit-voice-cmd-actions">'
        +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="edit-label">'+esc(t('habitAcousticCmdEditLabel'))+'</button>'
        +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="rerecord">'+esc(t('habitAcousticCmdRerecord'))+'</button>'
        +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="toggle">'
        +esc(cmd.enabled===false?t('habitAcousticCmdResume'):t('habitAcousticCmdPause'))+'</button>'
        +'<button type="button" class="habit-hub-act is-cta is-danger" data-voice-cmd-act="delete">'+esc(t('habitAcousticCmdDelete'))+'</button>'
        +'</div></div>';
      if(cmd.enabled!==false){
        html+='<p class="habit-voice-cmd-foot">'+esc(t('habitAcousticCmdReadyHint'))+'</p>';
      }
    }else{
      html+='<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="record">'
        +esc(t('habitAcousticCmdRecordBtn'))+'</button>';
    }
    html+='</div>';
    return html;
  }

  function phaseChipClass(phase,metrics){
    if(phase==='preparing'||phase==='processing'||phase==='startingMic'||phase==='armed') return 'is-idle';
    var hint=voiceHintFromMetrics(metrics,currentThresholds());
    if(hint==='good') return 'is-good';
    if(hint==='tooQuiet'||hint==='tooLong') return 'is-warn';
    return 'is-idle';
  }

  function phaseTitleClass(phase,metrics){
    if(phase==='processing'||phase==='armed'||phase==='startingMic') return '';
    var hint=voiceHintFromMetrics(metrics,currentThresholds());
    if(hint==='tooLong'||hint==='tooQuiet') return ' is-warn';
    if(hint==='good') return ' is-success';
    return '';
  }

  function recordCardModClass(phase,metrics){
    if(phase==='processing') return ' is-processing';
    if(phase!=='recording') return '';
    var hint=voiceHintFromMetrics(metrics,currentThresholds());
    if(hint==='tooLong') return ' is-warn-edge';
    return ' is-recording';
  }

  function recordSubText(phase,metrics,thresholds){
    thresholds=thresholdsFrom(thresholds);
    if(phase==='armed') return t('habitAcousticCmdArmedSub');
    if(phase==='startingMic') return t('habitAcousticCmdPhaseStartingMic');
    if(phase==='processing') return t('habitAcousticCmdProcessingSub');
    if(phase==='recording'){
      var hint=voiceHintFromMetrics(metrics,thresholds);
      if(hint==='tooQuiet') return t('habitAcousticCmdPhaseTooQuiet');
      // Tip stays under title for both in-zone and too-long (M3 interactive).
      return t('habitAcousticCmdRecordTipLive');
    }
    return '';
  }

  function recordChipText(phase,step,metrics){
    step=step||sampleStepIndex();
    if(phase==='processing') return t('habitAcousticCmdChipProcessing');
    if(phase==='recording'){
      var hint=voiceHintFromMetrics(metrics,currentThresholds());
      if(hint==='tooLong') return t('habitAcousticCmdChipTooLong');
      return t('habitAcousticCmdChipRecording');
    }
    if(phase==='startingMic') return t('habitAcousticCmdPhaseStartingMic');
    return t('habitAcousticCmdPhaseChip',{n:step});
  }

  function renderRecordPanel(opts){
    opts=opts||{};
    var phase=opts.phase||'listening';
    var th=opts.thresholds||currentThresholds();
    var metrics=opts.metrics||{};
    var step=opts.step||sampleStepIndex();
    var speechMs=Number(metrics.speechMs)||0;
    var elapsedMs=Number(metrics.elapsedMs)||speechMs;
    var actionText=opts.actionText||recordPhaseText(phase,metrics,th);
    var chipText=opts.chipText||recordChipText(phase,step,metrics);
    var subText=opts.subText!=null?String(opts.subText):recordSubText(phase,metrics,th);
    var barsTone=voiceHintFromMetrics(metrics,th);
    // No mic-level-bars: later global .mic-level-bars span rules crush habit bar size.
    var barsCls='habit-voice-cmd-rec-bars is-active';
    if(phase==='armed') barsCls+=' is-armed-idle';
    if(phase==='startingMic') barsCls+=' is-starting';
    if(phase==='processing') barsCls+=' is-processing-dim';
    if(phase==='recording'){
      if(barsTone==='tooQuiet') barsCls+=' is-too-quiet';
      else if(barsTone==='tooLong') barsCls+=' is-too-long';
      else if(barsTone==='good') barsCls+=' is-good';
      else barsCls+=' is-live';
    }
    var primary=opts.primaryAction||'';
    var showSpinner=phase==='processing';
    var visualInner=showSpinner
      ?('<div class="habit-voice-cmd-rec-processing" id="habitAcousticRecordProcessing">'
        +'<span class="habit-voice-cmd-m3-spinner" aria-hidden="true"></span>'
        +'<span class="habit-voice-cmd-rec-processing-lbl">'+esc(t('habitAcousticCmdProcessingAi'))+'</span>'
        +'</div>')
      :('<span class="'+barsCls+'" id="habitAcousticRecordBars" aria-hidden="true">'
        +buildMicBars(25)+'</span>');
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-listening is-m3" id="habitAcousticRecordPanel" data-ui-phase="'+esc(phase)+'">'
      +'<div class="habit-voice-cmd-rec-card habit-voice-cmd-rec-panel'+recordCardModClass(phase,metrics)+'">'
      +'<div class="habit-voice-cmd-rec-header">'
      +renderAppBadge()
      +'<span class="habit-voice-cmd-chip '+phaseChipClass(phase,metrics)+'" id="habitAcousticRecordChip">'+esc(chipText)+'</span>'
      +'</div>'
      +'<div class="habit-voice-cmd-rec-status">'
      +'<p class="habit-voice-cmd-phase'+phaseTitleClass(phase,metrics)+'" id="habitAcousticRecordPhase">'+esc(actionText)+'</p>'
      +'<p class="habit-voice-cmd-rec-sub" id="habitAcousticRecordSub"'+(subText?'':' hidden')+'>'+esc(subText)+'</p>'
      +'</div>'
      +'<div class="habit-voice-cmd-rec-visual'+(showSpinner?' is-processing':'')+'">'
      +visualInner
      +'</div>'
      +(showSpinner?'':'<div class="habit-voice-cmd-rec-meter" id="habitAcousticRecordMeterHost">'
        +renderDurationMeter(elapsedMs,{thresholds:th,speechMs:speechMs})
        +'</div>')
      +'</div>'
      +'<div class="habit-voice-cmd-footer">'
      +primary
      +'<button type="button" class="habit-voice-cmd-cancel" data-voice-cmd-act="cancel"'+(phase==='processing'?' disabled':'')+'>'
      +esc(t('habitAcousticCmdCancel'))+'</button>'
      +'</div></div>';
  }

  function renderRecording(){
    var phase=(draft&&draft.uiPhase)||'armed';
    var metrics=liveLevel||{};
    var th=currentThresholds();
    var tone=voiceHintFromMetrics(metrics,th);
    var actionText=recordPhaseText(phase,metrics,th);
    if(phase==='armed'&&draft&&draft.inlineHint){
      actionText=t(draft.inlineHint);
    }
    var primary='';
    if(phase==='armed'){
      primary='<button type="button" class="habit-voice-cmd-m3-btn is-primary" data-voice-cmd-act="begin-speak">'
        +esc(t('habitAcousticCmdBeginSpeak'))+'</button>';
    }else if(phase==='startingMic'){
      primary='<button type="button" class="habit-voice-cmd-m3-btn is-primary" disabled>'
        +esc(t('habitAcousticCmdPhaseStartingMic'))+'</button>';
    }else if(phase==='recording'){
      var btnCls='habit-voice-cmd-m3-btn is-primary';
      if(tone==='tooLong') btnCls+=' is-warn';
      primary='<button type="button" class="'+btnCls+'" data-voice-cmd-act="finish-speak">'
        +esc(t('habitAcousticCmdFinishSpeak'))+'</button>';
    }
    return renderRecordPanel({
      phase:phase,
      metrics:metrics,
      thresholds:th,
      step:sampleStepIndex(),
      chipText:recordChipText(phase,sampleStepIndex(),metrics),
      actionText:actionText,
      subText:recordSubText(phase,metrics,th),
      primaryAction:primary
    });
  }

  function renderBuilding(){
    return renderRecordPanel({
      phase:'processing',
      metrics:{},
      step:2,
      chipText:t('habitAcousticCmdChipProcessing'),
      actionText:t('habitAcousticCmdPhaseProcessing'),
      subText:t('habitAcousticCmdProcessingSub'),
      primaryAction:'<button type="button" class="habit-voice-cmd-m3-btn is-disabled" disabled>'
        +esc(t('habitAcousticCmdChipProcessing'))+'</button>'
    });
  }

  function renderError(messageKey,debug){
    var msg=t(messageKey||'habitAcousticCmdTimeout');
    var hint=recordErrorHint(messageKey,null,debug);
    var debugLine=debugSummaryLine(debug);
    var speechMs=debug&&debug.speechMs!=null?Number(debug.speechMs):0;
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-error is-m3">'
      +'<div class="habit-voice-cmd-rec-card habit-voice-cmd-rec-panel is-error">'
      +'<div class="habit-voice-cmd-rec-header">'
      +renderAppBadge()
      +'<span class="habit-voice-cmd-chip is-warn">'+esc(t('habitAcousticCmdErrChip'))+'</span>'
      +'</div>'
      +'<div class="habit-voice-cmd-rec-status">'
      +'<p class="habit-voice-cmd-phase is-warn">'+esc(msg)+'</p>'
      +'<p class="habit-voice-cmd-rec-sub">'+esc(hint)+'</p>'
      +(debugLine?'<p class="habit-voice-cmd-debug">'+esc(debugLine)+'</p>':'')
      +'</div>'
      +renderDurationMeter(speechMs,{compact:true})
      +'</div>'
      +'<div class="habit-voice-cmd-footer">'
      +'<button type="button" class="habit-voice-cmd-m3-btn is-primary" data-voice-cmd-act="record">'+esc(t('habitAcousticCmdRecordAgain'))+'</button>'
      +'<button type="button" class="habit-voice-cmd-cancel" data-voice-cmd-act="change-mic">'+esc(t('habitAcousticCmdChangeMic'))+'</button>'
      +'<button type="button" class="habit-voice-cmd-cancel" data-voice-cmd-act="cancel">'+esc(t('habitAcousticCmdCancel'))+'</button>'
      +'</div></div>';
  }

  function renderLabelEditor(prefill){
    prefill=String(prefill||'').trim();
    var quality=draft&&draft.pendingQuality?recordQualityLabel(draft.pendingQuality,draft.pendingAgreement):'';
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-label">'
      +'<div class="habit-voice-cmd-rec-card is-confirm">'
      +'<p class="habit-voice-cmd-status">'+esc(t('habitAcousticCmdLabelTitle'))+'</p>'
      +(quality?'<p class="habit-voice-cmd-quality">'+esc(quality)+'</p>':'')
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted">'+esc(t('habitAcousticCmdLabelHint'))+'</p>'
      +'<input type="text" class="habit-voice-cmd-label-input" id="habitAcousticCmdLabelInput" maxlength="32"'
      +' value="'+esc(prefill)+'" placeholder="'+esc(t('habitAcousticCmdLabelPlaceholder'))+'" autocomplete="off" />'
      +'</div>'
      +'<div class="habit-voice-cmd-actions">'
      +'<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="save-label">'+esc(t('habitAcousticCmdLabelSave'))+'</button>'
      +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="skip-label">'+esc(t('habitAcousticCmdLabelSkip'))+'</button>'
      +'</div></div>';
  }

  function renderDone(){
    var text=draft&&draft.pendingLabel?String(draft.pendingLabel).trim():'';
    var quality=draft&&draft.pendingQuality?recordQualityLabel(draft.pendingQuality,draft.pendingAgreement):t('habitAcousticCmdLearned');
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-done">'
      +renderAppBadge()
      +'<p class="habit-voice-cmd-status"><span class="habit-voice-cmd-chip is-good">'
      +esc(text||quality)+'</span></p>'
      +'<p class="habit-voice-cmd-foot">'+esc(t('habitAcousticCmdReadyHint'))+'</p>'
      +'</div>';
  }

  function applyBarScales(scales){
    var host=ensureHost();
    if(!host) return;
    var wrap=host.querySelector('#habitAcousticRecordBars');
    if(!wrap) return;
    var bars=wrap.querySelectorAll('span');
    if(!bars.length) return;
    scales=scales||levelToBarScales(0.08,bars.length);
    bars.forEach(function(bar,i){
      var scale=scales[i]!=null?scales[i]:0.12;
      bar.className=scale>0.55?'is-hot':'';
      bar.style.transform='scaleY('+Number(scale).toFixed(3)+')';
    });
  }

  function updateRecordVis(){
    if(!draft) return;
    if(draft.state!=='recording') return;
    var host=ensureHost();
    if(!host) return;
    var th=currentThresholds();
    var metrics=liveLevel||{
      level:0,
      speechMs:0,
      elapsedMs:recordStartedAt?Date.now()-recordStartedAt:0,
      peak:0
    };
    // No fake sine when levels lag: keep quiet bars until live PCM arrives.
    var phase=draft.uiPhase||'armed';
    var phaseEl=host.querySelector('#habitAcousticRecordPhase');
    var subEl=host.querySelector('#habitAcousticRecordSub');
    var chipEl=host.querySelector('#habitAcousticRecordChip');
    var cardEl=host.querySelector('.habit-voice-cmd-rec-card');
    var meterRoot=host.querySelector('#habitAcousticRecordMeterHost .habit-voice-cmd-meter');
    var meterFill=meterRoot?meterRoot.querySelector('.habit-voice-cmd-meter-fill'):null;
    var meterZone=meterRoot?meterRoot.querySelector('.habit-voice-cmd-meter-zone'):null;
    var meter=meterRoot;
    var bars=host.querySelector('#habitAcousticRecordBars');
    // Prefer wall clock so fill keeps moving if ticks omit/lag elapsedMs.
    if(recordStartedAt&&(phase==='recording'||phase==='startingMic')){
      var wall=Date.now()-recordStartedAt;
      if((Number(metrics.elapsedMs)||0)<wall){
        metrics=Object.assign({},metrics,{elapsedMs:wall});
      }
    }
    var tone=voiceHintFromMetrics(metrics,th);
    var action=recordPhaseText(phase,metrics,th);
    if(phase==='armed'&&draft.inlineHint) action=t(draft.inlineHint);
    if(phaseEl){
      phaseEl.textContent=action;
      phaseEl.className='habit-voice-cmd-phase'+phaseTitleClass(phase,metrics);
    }
    if(subEl){
      var sub=recordSubText(phase,metrics,th);
      subEl.textContent=sub;
      subEl.hidden=!sub;
    }
    if(chipEl&&draft.state==='recording'){
      chipEl.textContent=recordChipText(phase,sampleStepIndex(),metrics);
      chipEl.className='habit-voice-cmd-chip '+phaseChipClass(phase,metrics);
    }
    if(cardEl){
      cardEl.classList.remove('is-recording','is-warn-edge','is-processing');
      var mod=recordCardModClass(phase,metrics).trim();
      if(mod) cardEl.classList.add(mod);
    }
    var st=durationMeterState(metrics.elapsedMs,metrics.speechMs,th);
    if(meterFill) meterFill.style.width=st.pct+'%';
    if(meterZone){
      meterZone.style.left=st.minPct+'%';
      meterZone.style.width=st.zoneWidth+'%';
    }
    if(meter){
      meter.classList.remove('is-idle','is-good','is-low','is-warn','is-settled');
      meter.classList.add('is-'+st.zone);
      if(st.zone==='good') meter.classList.add('is-settled');
    }
    if(bars){
      bars.classList.toggle('is-too-quiet',tone==='tooQuiet');
      bars.classList.toggle('is-too-long',tone==='tooLong');
      bars.classList.toggle('is-good',tone==='good');
      bars.classList.toggle('is-live',tone==='speaking'||tone==='waiting');
      bars.classList.toggle('is-armed-idle',phase==='armed');
    }
    var barCount=bars?bars.querySelectorAll('span').length:25;
    var levelForBars;
    if(hasLiveLevel){
      levelForBars=Math.max(Number(metrics.level)||0,Number(metrics.peak)||0);
    }else if(phase==='armed'){
      levelForBars=0.08;
    }else{
      // ponytail: ceiling=no PCM yet; light breath only so the card isn't a dead line. Real ticks replace this.
      var tSec=(Number(metrics.elapsedMs)||0)/1000;
      levelForBars=0.16+0.1*Math.sin(tSec*3.1);
    }
    applyBarScales(levelToBarScales(levelForBars,barCount));
  }

  function startRecordVis(){
    stopRecordVis();
    recordStartedAt=Date.now();
    updateRecordVis();
    recordVisTimer=global.setInterval(updateRecordVis,100);
  }

  function onLevelEvent(payload){
    if(!draft||!draft.recordSessionId) return;
    if(!payload||String(payload.sessionId||'')!==String(draft.recordSessionId)) return;
    hasLiveLevel=true;
    liveLevel={
      level:Number(payload.level)||0,
      rms:Number(payload.rms)||0,
      peak:Number(payload.peak)||0,
      elapsedMs:Number(payload.elapsedMs)||0,
      speechMs:Number(payload.speechMs)||0
    };
    updateRecordVis();
  }

  function feedbackInfo(){
    var m=currentMapping();
    if(!m) return null;
    var cmd=primaryCommand(m);
    var cal=isCalibrating();
    if(cal&&draft){
      if(draft.state==='recording'){
        return {
          statusKey:'habitAcousticCmdFbRecording',
          transcriptKey:'habitAcousticCmdFbNoTranscript',
          wakeHint:recordPhaseText(draft.uiPhase||'armed',liveLevel,currentThresholds()),
          wakeLabel:t('habitAcousticCmdTitle'),
          calibrating:true,
          live:draft.uiPhase==='recording'
        };
      }
      if(draft.state==='building'){
        return {
          statusKey:'habitAcousticCmdFbBuilding',
          transcriptKey:'habitAcousticCmdFbNoTranscript',
          wakeHint:t('habitAcousticCmdBuilding'),
          wakeLabel:t('habitAcousticCmdTitle'),
          calibrating:true,
          live:false
        };
      }
      if(draft.state==='label'){
        return {
          statusKey:'habitAcousticCmdFbLabel',
          transcriptKey:'habitAcousticCmdFbLabelHint',
          wakeHint:t('habitAcousticCmdLabelTitle'),
          wakeLabel:t('habitAcousticCmdTitle'),
          calibrating:true,
          live:false
        };
      }
    }
    if(cmd){
      var label=chipLabel(cmd);
      var hint=displayHint(cmd);
      return {
        statusKey:cmd.enabled===false?'habitAcousticCmdFbPaused':'habitAcousticCmdFbLearned',
        transcriptKey:'habitAcousticCmdFbNoTranscript',
        wakeHint:hint?label+' · '+hint:label,
        wakeLabel:label,
        calibrating:false,
        live:false
      };
    }
    return {
      statusKey:'habitAcousticCmdFbIdle',
      transcriptKey:'habitAcousticCmdFbNoTranscript',
      wakeHint:t('habitAcousticCmdRecordBtn'),
      wakeLabel:t('habitAcousticCmdTitle'),
      calibrating:false,
      live:false
    };
  }

  function isScenarioEdit(){
    return !!scenarioContextId();
  }

  function isCalibrating(){
    return !!(draft&&(draft.state==='recording'||draft.state==='building'||draft.state==='label'));
  }

  function isBusy(){
    return !!(draft&&(
      draft.state==='recording'
      ||draft.state==='building'
      ||draft.state==='label'
      ||draft.state==='done'
      ||draft.state==='error'
    ));
  }

  function isLabelEditorMounted(){
    var host=ensureHost();
    if(!host||host.hidden) return false;
    return !!host.querySelector('#habitAcousticCmdLabelInput');
  }

  function renderAppBadge(){
    var m=currentMapping();
    var appId=m&&String(m.appTargetId||'').trim();
    if(!appId) return '';
    var atp=global.OneToneAppTargetPresets;
    var ab=global.OneToneAppBehaviorRules;
    var name=ab&&ab.appDisplayName?ab.appDisplayName(appId,null):appId;
    var icon='';
    if(atp&&atp.presetById){
      var p=atp.presetById(appId);
      if(p){
        icon=p.icon||'';
        if(p.nameKey) name=t(p.nameKey)||name;
      }
    }
    if(m.group||m.label) name=m.group||m.label||name;
    var initial=(name||appId).charAt(0)||'?';
    var iconHtml=icon
      ?'<img class="habit-voice-cmd-app-icon" src="'+esc(icon)+'" alt="" decoding="async" />'
      :'<span class="habit-voice-cmd-app-icon habit-voice-cmd-app-icon--fallback" aria-hidden="true">'+esc(initial)+'</span>';
    return '<div class="habit-voice-cmd-app-badge" data-acoustic-app-badge="1">'
      +iconHtml
      +'<span class="habit-voice-cmd-app-name">'+esc(name)+'</span></div>';
  }

  function paint(){
    var host=ensureHost();
    var body=$('habitScenarioVoiceBody');
    if(body){
      var editor=body.querySelector('.habit-scenario-voice-editor');
      if(editor) editor.classList.toggle('is-calibrating',isCalibrating());
    }
    if(!host) return;
    var m=currentMapping();
    if(!m){
      discardDraft();
      host.hidden=true;
      host.innerHTML='';
      syncFeedbackRail();
      return;
    }
    host.hidden=false;
    var cmd=primaryCommand(m);
    if(draft&&draft.mappingId===m.id){
      if(draft.state==='recording'){
        var phase=String(draft.uiPhase||'armed');
        var panel=host.querySelector('#habitAcousticRecordPanel');
        if(panel&&panel.getAttribute('data-ui-phase')===phase){
          if(phase==='recording'){
            if(!recordVisTimer) startRecordVis();
            else updateRecordVis();
          }else stopRecordVis();
          syncFeedbackRail();
          return;
        }
        host.innerHTML=renderRecording();
        if(phase==='recording') startRecordVis();
        else stopRecordVis();
        syncFeedbackRail();
        return;
      }
      stopRecordVis();
      if(draft.state==='building'){ host.innerHTML=renderBuilding(); syncFeedbackRail(); return; }
      if(draft.state==='error'){
        host.innerHTML=renderError(draft.messageKey||'habitAcousticCmdTimeout',draft.debugSummary);
        syncFeedbackRail();
        return;
      }
      if(draft.state==='done'){
        host.innerHTML=renderDone();
        syncFeedbackRail();
        return;
      }
      if(draft.state==='label'){
        if(isLabelEditorMounted()){
          syncFeedbackRail();
          return;
        }
        host.innerHTML=renderLabelEditor(draft.pendingLabel||(draft.pendingCommand&&draft.pendingCommand.displayText)||'');
        syncFeedbackRail();
        var input=$('habitAcousticCmdLabelInput');
        if(input&&!draft._labelFocused){
          draft._labelFocused=true;
          global.setTimeout(function(){ try{ input.focus(); input.select(); }catch(_e){} },30);
        }
        return;
      }
    }
    host.innerHTML=renderIdle(m,cmd);
    syncFeedbackRail();
  }

  function syncFeedbackRail(){
    var flow=global.OneToneVoiceSettingsFlow;
    if(flow&&flow.syncAsideLiveStatus) flow.syncAsideLiveStatus();
    var V=global.OneToneVoiceSettingsViewModel;
    if(global.OneToneVoicePageNav&&global.OneToneVoicePageNav.render&&V&&V.build){
      global.OneToneVoicePageNav.render(V.build(false));
    }
  }

  function failRecording(messageKey,debug){
    if(!draft) return;
    cleanupRecordingSession({unsuspend:true,force:true});
    draft.state='error';
    draft.uiPhase='error';
    draft.messageKey=messageKey||'habitAcousticCmdTimeout';
    draft.debugSummary=debug||null;
    paint();
  }

  function scheduleNextRecording(){
    clearPromptTimer();
    if(!draft) return;
    // Skip readyNext confirm — go straight to「开始说」for take 2+.
    armForNextTake({inlineHint:'habitAcousticCmdNeedMore'});
  }

  function armForNextTake(opts){
    // Between takes: stay armed without suspend false/true churn (would restart Vosk).
    opts=opts||{};
    if(!draft) return;
    clearPromptTimer();
    draft.recordSessionId='';
    draft.state='recording';
    draft.uiPhase='armed';
    draft.inlineHint=opts.inlineHint||'';
    liveLevel=null;
    hasLiveLevel=false;
    setSuspended(true);
    paint();
  }

  function enterArmedSession(opts){
    opts=opts||{};
    var m=currentMapping();
    if(!m) return;
    var api=acoustic();
    if(!api||!api.isAvailable||!api.isAvailable()){
      draft={
        mappingId:m.id,
        samples:(draft&&draft.mappingId===m.id&&Array.isArray(draft.samples))?draft.samples.slice():[],
        state:'error',
        messageKey:'habitAcousticCmdUnavailable',
        pendingScope:draft&&draft.pendingScope,
        thresholds:currentThresholds()
      };
      paint();
      return;
    }
    clearPromptTimer();
    var keepSamples=opts.resetSamples?[]:
      ((draft&&draft.mappingId===m.id&&Array.isArray(draft.samples))?draft.samples.slice():[]);
    var keepScope=draft&&draft.pendingScope;
    var keepTh=draft&&draft.thresholds?draft.thresholds:null;
    draft={
      mappingId:m.id,
      samples:keepSamples,
      state:'recording',
      uiPhase:'preparing',
      pendingScope:keepScope,
      thresholds:keepTh||DEFAULT_THRESHOLDS,
      recordSessionId:'',
      inlineHint:opts.inlineHint||''
    };
    liveLevel=null;
    hasLiveLevel=false;
    paint();

    var probe=api.probeBackend?api.probeBackend():Promise.resolve(true);
    probe.then(function(ok){
      if(!ok){
        failRecording('habitAcousticCmdNeedRebuild');
        return null;
      }
      return api.preflight?api.preflight():Promise.resolve({ok:true});
    }).then(function(pf){
      if(!draft||draft.state!=='recording') return;
      if(pf&&pf.ok===false){
        failRecording(pf.messageKey||'habitAcousticCmdNoMic',pf.debugSummary||null);
        return;
      }
      draft.thresholds=thresholdsFrom(pf||DEFAULT_THRESHOLDS);
      // Stay suspended for the whole calibration; never flip false→true (that
      // races MicLease and can leave wake engines stuck on「已停止」).
      return setSuspended(true).then(function(){
        if(!draft||draft.state!=='recording') return;
        draft.uiPhase='armed';
        paint();
      });
    }).catch(function(err){
      if(typeof console!=='undefined'&&console.warn){
        console.warn('[acoustic] armed preflight failed',err);
      }
      failRecording('habitAcousticCmdUnavailable');
    });
  }

  function startRecording(){
    enterArmedSession({resetSamples:true});
  }

  function beginSpeak(){
    var m=currentMapping();
    var api=acoustic();
    if(!m||!draft||!api||!api.recordStart) return;
    if(draft.uiPhase!=='armed') return;
    if(finishInFlight) return;
    var sessionId=newSessionId();
    draft.recordSessionId=sessionId;
    draft.uiPhase='startingMic';
    draft.inlineHint='';
    liveLevel=null;
    hasLiveLevel=false;
    paint();

    var listenP=api.listenLevel?api.listenLevel(onLevelEvent):Promise.resolve();
    listenP.then(function(){
      if(!draft||draft.recordSessionId!==sessionId) return null;
      return api.recordStart({sessionId:sessionId});
    }).then(function(res){
      if(!draft||draft.recordSessionId!==sessionId) return;
      if(!res||!res.ok){
        failRecording((res&&res.messageKey)||'habitAcousticCmdStreamFailed',res&&res.debugSummary);
        return;
      }
      if(res.minSpeechMs||res.manualMaxMs){
        draft.thresholds=thresholdsFrom(Object.assign({},draft.thresholds||{},res));
      }
      draft.uiPhase='recording';
      draft.state='recording';
      paint();
      clearPromptTimer();
      var maxMs=currentThresholds().manualMaxMs;
      hardCapTimer=global.setTimeout(function(){
        if(draft&&draft.recordSessionId===sessionId&&draft.uiPhase==='recording'){
          finishSpeak({fromHardCap:true});
        }
      },maxMs);
    }).catch(function(err){
      if(typeof console!=='undefined'&&console.warn){
        console.warn('[acoustic] recordStart failed',err);
      }
      var msg=err&&err.message?String(err.message):'';
      if(msg.indexOf('not found')>=0||msg.indexOf('unknown command')>=0){
        failRecording('habitAcousticCmdNeedRebuild');
      }else if(msg.indexOf('timeout')>=0||msg.indexOf('busy')>=0){
        failRecording('habitAcousticCmdMicBusy');
      }else failRecording('habitAcousticCmdStreamFailed');
    });
  }

  function finishSpeak(opts){
    opts=opts||{};
    var api=acoustic();
    if(!draft||!api||!api.recordStop||finishInFlight) return;
    if(draft.uiPhase!=='recording') return;
    var sessionId=String(draft.recordSessionId||'');
    if(!sessionId) return;
    finishInFlight=true;
    clearPromptTimer();
    // Stop level events before join — avoids capture↔main thread deadlock under load.
    if(api.unlistenLevel) api.unlistenLevel();
    stopRecordVis();
    draft.uiPhase='processing';
    paint();
    api.recordStop({
      sessionId:sessionId,
      manualMaxMs:currentThresholds().manualMaxMs
    }).then(function(res){
      finishInFlight=false;
      if(api.logDebugSummary) api.logDebugSummary(res);
      if(!draft) return;
      if(res&&(res.reason==='stale'||res.reason==='mismatch')){
        draft.recordSessionId='';
        draft.uiPhase='armed';
        draft.state='recording';
        setSuspended(true);
        paint();
        return;
      }
      if(!res||!res.ok||!res.sample){
        var key=(res&&res.messageKey)||'habitAcousticCmdTimeout';
        if(key==='habitAcousticCmdTooShort'){
          draft.recordSessionId='';
          draft.uiPhase='armed';
          draft.state='recording';
          draft.inlineHint='habitAcousticCmdTooShort';
          setSuspended(true);
          paint();
          return;
        }
        failRecording(key,res&&res.debugSummary);
        return;
      }
      draft.recordSessionId='';
      draft.samples=draft.samples||[];
      draft.samples.push(res.sample);
      if(draft.samples.length>3) draft.samples=draft.samples.slice(-3);
      if(res.warnings&&res.warnings.length&&global.OneToneAppToast){
        global.OneToneAppToast.show(t(res.warnings[0]),'scheme');
      }
      if(draft.samples.length<2){
        scheduleNextRecording();
        return;
      }
      tryBuildCommand();
    }).catch(function(err){
      finishInFlight=false;
      if(typeof console!=='undefined'&&console.warn){
        console.warn('[acoustic] recordStop failed',err);
      }
      failRecording('habitAcousticCmdUnavailable');
    });
  }

  function tryBuildCommand(){
    var m=currentMapping();
    if(!m||!draft) return;
    var api=acoustic();
    if(!api||!api.buildFromSamples){
      failRecording('habitAcousticCmdUnavailable');
      return;
    }
    draft.state='building';
    draft.uiPhase='processing';
    paint();
    var old=primaryCommand(m);
    var pendingScope=resolvePendingScope(m,old);
    api.buildFromSamples(draft.samples,{
      scenarioId:m.id,
      activationScope:pendingScope,
      appBoost:old?old.appBoost!==false:true,
      displayText:old?String(old.displayText||''):'',
      currentCommandId:old&&old.id,
      kind:inlineCtx?'open-app-acoustic':(old&&old.kind)||null
    }).then(function(built){
      if(!draft||draft.state!=='building') return;
      if(!built||!built.ok){
        if(built&&built.reason==='unstable'&&draft.samples.length<3){
          scheduleNextRecording();
          return;
        }
        draft.state='error';
        draft.messageKey=(built&&built.messageKey)||'habitAcousticCmdTryClearer';
        if(draft.samples&&draft.samples.length){
          var last=draft.samples[draft.samples.length-1];
          if(last&&last.durationMs!=null){
            draft.debugSummary={speechMs:Number(last.durationMs)||0};
          }
        }
        cleanupRecordingSession({unsuspend:true,force:true});
        paint();
        return;
      }
      cleanupRecordingSession({unsuspend:true,force:true});
      draft={
        mappingId:m.id,
        samples:[],
        state:'label',
        pendingScope:pendingScope,
        pendingCommand:built.command,
        pendingQuality:built.quality||(built.command&&built.command.quality),
        pendingAgreement:built.agreement!=null
          ?built.agreement
          :(built.command&&built.command.qualitySignals&&built.command.qualitySignals.sampleAgreement),
        pendingLabel:String((built.command&&built.command.displayText)||(old&&old.displayText)||'').trim(),
        thresholds:draft.thresholds
      };
      paint();
      if(built.warnings&&built.warnings.length&&global.OneToneAppToast){
        global.OneToneAppToast.show(t(built.warnings[0]),'scheme');
      }
    }).catch(function(){
      failRecording('habitAcousticCmdUnavailable');
    });
  }

  function commitPendingCommand(label){
    var m=currentMapping();
    if(!m||!draft||!draft.pendingCommand){
      endSessionToIdle();
      return;
    }
    var cmd=draft.pendingCommand;
    label=String(label||'').trim();
    if(label){
      cmd.displayText=label;
      if(!cmd.label||cmd.label==='我的语音命令') cmd.label=label;
    }
    if(inlineCtx) cmd.kind='open-app-acoustic';
    cmd.updatedAt=Date.now();
    m.acousticVoiceCommands=[cmd];
    draft={
      mappingId:m.id,
      samples:[],
      state:'done',
      pendingScope:draft.pendingScope,
      pendingLabel:label,
      pendingQuality:cmd.quality,
      pendingAgreement:cmd.agreement
    };
    paint();
    persistMapping(m).then(function(){
      global.setTimeout(function(){
        if(draft&&draft.state==='done') endSessionToIdle();
      },1600);
    });
  }

  function endSessionToIdle(){
    cleanupRecordingSession({unsuspend:true,force:true});
    draft=null;
    paint();
    notifyChange();
  }

  function openChangeMic(){
    endSessionToIdle();
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open({panel:'voiceWake',focus:'mic'});
      return;
    }
    if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openMicPicker){
      global.OneToneVoiceWakeNavigation.openMicPicker();
    }
  }

  function applyScope(scope){
    var m=currentMapping();
    if(!m) return;
    var cmd=primaryCommand(m);
    if(!cmd){
      if(!draft) draft={mappingId:m.id,samples:[],state:'idle',pendingScope:scope};
      else draft.pendingScope=scope;
      paint();
      return;
    }
    cmd.activationScope=scope==='foreground-app'?'foreground-app':'global';
    cmd.updatedAt=Date.now();
    persistMapping(m);
    paint();
  }

  function handleAct(act){
    var m=currentMapping();
    if(!m) return;
    if(act==='cancel'){
      endSessionToIdle();
      return;
    }
    if(act==='change-mic'){
      openChangeMic();
      return;
    }
    if(act==='save-label'){
      var input=$('habitAcousticCmdLabelInput');
      commitPendingCommand(input?input.value:'');
      return;
    }
    if(act==='skip-label'){
      commitPendingCommand('');
      return;
    }
    if(act==='edit-label'){
      var editCmd=primaryCommand(m);
      if(!editCmd) return;
      draft={
        mappingId:m.id,
        samples:[],
        state:'label',
        pendingScope:resolvePendingScope(m,editCmd),
        pendingCommand:Object.assign({},editCmd),
        pendingQuality:editCmd.quality,
        pendingAgreement:editCmd.agreement,
        pendingLabel:String(editCmd.displayText||'').trim()
      };
      paint();
      return;
    }
    if(act==='record'||act==='rerecord'){
      var keepScope=draft&&draft.pendingScope;
      draft={mappingId:m.id,samples:[],lastTranscript:'',state:'idle',pendingScope:keepScope};
      startRecording();
      return;
    }
    if(act==='begin-speak'){
      beginSpeak();
      return;
    }
    if(act==='finish-speak'){
      finishSpeak();
      return;
    }
    if(act==='toggle'){
      var cmd=primaryCommand(m);
      if(!cmd) return;
      cmd.enabled=!(cmd.enabled!==false);
      cmd.updatedAt=Date.now();
      persistMapping(m);
      paint();
      return;
    }
    if(act==='delete'){
      m.acousticVoiceCommands=[];
      persistMapping(m);
      endSessionToIdle();
    }
  }

  function onClick(e){
    var host=ensureHost();
    if(!host||host.hidden||!host.contains(e.target)) return;
    var scopeBtn=e.target.closest&&e.target.closest('[data-voice-cmd-scope]');
    if(scopeBtn){
      e.preventDefault();
      applyScope(scopeBtn.getAttribute('data-voice-cmd-scope')||'global');
      return;
    }
    var btn=e.target.closest&&e.target.closest('[data-voice-cmd-act]');
    if(!btn) return;
    e.preventDefault();
    handleAct(btn.getAttribute('data-voice-cmd-act')||'');
  }

  function bindEvents(opts){
    opts=opts||{};
    if(opts.mappingId||opts.hostId){
      setInlineContext({ mappingId:opts.mappingId, hostId:opts.hostId });
    }
    if(opts.onChange) onChangeCb=opts.onChange;
    if(bound) return;
    bound=true;
    document.addEventListener('click',onClick,true);
  }

  function setOnChange(fn){ onChangeCb=fn; }

  function render(opts){
    opts=opts||{};
    if(opts.mappingId||opts.hostId){
      setInlineContext({ mappingId:opts.mappingId||(inlineCtx&&inlineCtx.mappingId), hostId:opts.hostId||(inlineCtx&&inlineCtx.hostId) });
    }
    if(opts.onChange) onChangeCb=opts.onChange;
    paint();
  }

  function runAct(act){
    handleAct(String(act||''));
  }

  function hubChipHtml(m){
    var cmd=primaryCommand(m);
    if(!cmd) return '';
    var label=chipLabel(cmd);
    var title=t('habitAcousticCmdTitle')+(label?(' — '+label):'');
    return '<span class="habit-hub-voice-cmd-chip '+chipClass(cmd)+'" data-habit-voice-cmd="'+esc(m.id)+'" title="'+esc(title)+'">'
      +esc(label)+'</span>';
  }

  global.OneToneHabitScenarioVoiceCommand={
    render:render,
    bindEvents:bindEvents,
    setOnChange:setOnChange,
    setInlineContext:setInlineContext,
    clearInlineContext:clearInlineContext,
    runAct:runAct,
    discardDraft:discardDraft,
    cleanupRecordingSession:cleanupRecordingSession,
    hubChipHtml:hubChipHtml,
    isCalibrating:isCalibrating,
    isBusy:isBusy,
    isScenarioEdit:isScenarioEdit,
    feedbackInfo:feedbackInfo,
    recordPhaseText:recordPhaseText,
    recordErrorHint:recordErrorHint,
    recordQualityLabel:recordQualityLabel,
    levelToBarScales:levelToBarScales,
    durationMeterState:durationMeterState
  };
})((typeof window!=='undefined')?window:globalThis);
