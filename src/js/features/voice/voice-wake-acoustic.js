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

  var ROLES={
    wake:{
      hostId:'voiceWakeAcousticHost',
      scenarioId:'__voice_wake__',
      kind:'voice-wake-acoustic',
      titleKey:'voiceWakeAcousticTitle',
      descKey:'voiceWakeAcousticDesc',
      recordBtnKey:'voiceWakeAcousticRecordBtn',
      readyHintKey:'voiceWakeAcousticReadyHint',
      learnedKey:'voiceWakeAcousticFbLearned',
      labelInputId:'voiceWakeAcousticLabelInput',
      actAttr:'data-wake-acoustic-act'
    },
    end:{
      hostId:'voiceEndAcousticHost',
      scenarioId:'__voice_end__',
      kind:'voice-end-acoustic',
      titleKey:'voiceEndAcousticTitle',
      descKey:'voiceEndAcousticDesc',
      recordBtnKey:'voiceWakeAcousticRecordBtn',
      readyHintKey:'voiceEndAcousticReadyHint',
      learnedKey:'voiceWakeAcousticFbLearned',
      labelInputId:'voiceEndAcousticLabelInput',
      actAttr:'data-control-acoustic-act'
    },
    cancel:{
      hostId:'voiceCancelAcousticHost',
      scenarioId:'__voice_cancel__',
      kind:'voice-cancel-acoustic',
      titleKey:'voiceCancelAcousticTitle',
      descKey:'voiceCancelAcousticDesc',
      recordBtnKey:'voiceWakeAcousticRecordBtn',
      readyHintKey:'voiceCancelAcousticReadyHint',
      learnedKey:'voiceWakeAcousticFbLearned',
      labelInputId:'voiceCancelAcousticLabelInput',
      actAttr:'data-control-acoustic-act'
    }
  };
  var activeRole='wake';
  var boundRoles={};

  function roleCfg(){
    return ROLES[activeRole]||ROLES.wake;
  }

  function setActiveRole(role){
    if(ROLES[role]) activeRole=role;
    return roleCfg();
  }

  var draft=null;
  var promptTimer=null;
  var hardCapTimer=null;
  var liveLevel=null;
  var hasLiveLevel=false;
  var bound=false;
  var finishInFlight=false;

  var DEFAULT_THRESHOLDS={
    minSpeechMs:450,
    preferSpeechMs:700,
    maxSpeechMs:2000,
    manualMaxMs:3500,
    recordTimeoutMs:8000
  };

  function helpers(){
    return global.OneToneHabitScenarioVoiceCommand||{};
  }

  function acoustic(){
    return global.OneToneVoiceAcousticIpc;
  }

  function state(){
    return global.OneToneState.state;
  }

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

  function newSessionId(){
    return 'wacr_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8);
  }

  function ensureAllCommands(){
    var cfg=state().config||{};
    var persist=global.OneToneConfigPersist;
    var list=cfg.voiceWakeAcousticCommands||cfg.voice_wake_acoustic_commands||[];
    if(persist&&persist.normalizeGlobalAcousticVoiceCommands){
      list=persist.normalizeGlobalAcousticVoiceCommands(list);
    }else if(persist&&persist.normalizeAcousticVoiceCommands){
      // Fallback: normalize each entry in place without collapsing all roles to one.
      list=(Array.isArray(list)?list:[]).map(function(c){
        var sid=String((c&&c.scenarioId)||'').trim()||roleCfg().scenarioId;
        var one=persist.normalizeAcousticVoiceCommands([c],sid);
        return one&&one[0]?one[0]:null;
      }).filter(Boolean);
    }
    cfg.voiceWakeAcousticCommands=list;
    return list;
  }

  function roleCommands(){
    var sid=roleCfg().scenarioId;
    return ensureAllCommands().filter(function(c){
      return c&&String(c.scenarioId||'')===sid;
    });
  }

  function primaryCommand(){
    var list=roleCommands();
    return list.length?list[0]:null;
  }

  function setCommands(list){
    var cfg=state().config||{};
    var persist=global.OneToneConfigPersist;
    var role=roleCfg();
    var others=ensureAllCommands().filter(function(c){
      return !(c&&String(c.scenarioId||'')===role.scenarioId);
    });
    if(persist&&persist.normalizeAcousticVoiceCommands){
      list=persist.normalizeAcousticVoiceCommands(list,role.scenarioId);
    }
    list=(list||[]).map(function(c){
      var next=Object.assign({},c);
      next.scenarioId=role.scenarioId;
      next.kind=role.kind;
      next.activationScope='global';
      return next;
    });
    cfg.voiceWakeAcousticCommands=others.concat(list);
  }

  function persistCommands(){
    var persist=global.OneToneConfigPersist;
    if(persist&&persist.saveAsync) return persist.saveAsync({source:'voice'});
    if(persist&&persist.save){ persist.save(); return Promise.resolve(true); }
    return Promise.resolve(false);
  }

  function ensureHost(){
    return $(roleCfg().hostId);
  }

  function sampleStepIndex(){
    if(!draft) return 1;
    var n=Array.isArray(draft.samples)?draft.samples.length:0;
    if(draft.state==='recording') return Math.min(2,n+1);
    return Math.min(2,Math.max(1,n));
  }

  function buildMicBars(count){
    count=count||16;
    var html='';
    for(var i=0;i<count;i++) html+='<span></span>';
    return html;
  }

  function clearPromptTimer(){
    if(promptTimer){ global.clearTimeout(promptTimer); promptTimer=null; }
    if(hardCapTimer){ global.clearTimeout(hardCapTimer); hardCapTimer=null; }
  }

  function setSuspended(on){
    var api=acoustic();
    if(!api||!api.setSuspend) return Promise.resolve();
    return api.setSuspend(!!on).catch(function(){ return null; });
  }

  function cleanupRecordingSession(opts){
    opts=opts||{};
    var api=acoustic();
    var sid=draft&&draft.recordSessionId?String(draft.recordSessionId):'';
    var phase=draft&&draft.uiPhase?String(draft.uiPhase):'';
    var midTake=phase==='startingMic'||phase==='recording'||phase==='processing';
    finishInFlight=false;
    if(api&&api.unlistenLevel) api.unlistenLevel();
    clearPromptTimer();
    liveLevel=null;
    hasLiveLevel=false;
    if(midTake&&!opts.force){
      if(api&&api.recordCancel){
        return api.recordCancel({sessionId:sid}).catch(function(){ return null; });
      }
      return Promise.resolve();
    }
    var cancelP=api&&api.recordCancel?api.recordCancel({sessionId:sid}):Promise.resolve();
    if(draft){
      draft.recordSessionId='';
      draft.uiPhase='';
    }
    return cancelP.then(function(){
      if(opts.unsuspend!==false) return setSuspended(false);
      return null;
    }).catch(function(){
      if(opts.unsuspend!==false) return setSuspended(false);
      return null;
    });
  }

  function chipLabel(cmd){
    if(!cmd) return '';
    if(cmd.enabled===false) return t('habitAcousticCmdPaused');
    var text=String(cmd.displayText||'').trim();
    if(text) return text;
    var h=helpers();
    if(h.recordQualityLabel) return h.recordQualityLabel(cmd.quality,cmd.agreement);
    return t('voiceWakeAcousticFbLearned');
  }

  function chipClass(cmd){
    if(!cmd) return '';
    if(cmd.enabled===false) return 'is-disabled';
    if(cmd.quality==='ok'||cmd.quality==='weak') return 'is-warn';
    return 'is-good';
  }

  function actAttr(){
    return roleCfg().actAttr||'data-wake-acoustic-act';
  }

  function actBtn(act,cls,label){
    return '<button type="button" class="'+cls+'" '+actAttr()+'="'+act+'">'+esc(label)+'</button>';
  }

  function renderIdle(cmd){
    var role=roleCfg();
    var html='<div class="habit-scenario-voice-field habit-scenario-voice-command">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t(role.titleKey))+'</span>'
      +'</div>'
      +'<p class="habit-voice-cmd-desc">'+esc(t(role.descKey))+'</p>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted habit-voice-cmd-disclaimer">'+esc(t('habitAcousticCmdDisclaimer'))+'</p>';
    if(cmd){
      html+='<div class="habit-voice-cmd-status">'
        +'<span class="habit-voice-cmd-chip '+chipClass(cmd)+'">'+esc(chipLabel(cmd))+'</span>'
        +'<div class="habit-voice-cmd-actions">'
        +actBtn('edit-label','habit-hub-act is-cta',t('habitAcousticCmdEditLabel'))
        +actBtn('rerecord','habit-hub-act is-cta',t('habitAcousticCmdRerecord'))
        +actBtn('toggle','habit-hub-act is-cta',cmd.enabled===false?t('habitAcousticCmdResume'):t('habitAcousticCmdPause'))
        +actBtn('delete','habit-hub-act is-cta is-danger',t('habitAcousticCmdDelete'))
        +'</div></div>';
      if(cmd.enabled!==false){
        html+='<p class="habit-voice-cmd-foot">'+esc(t(role.readyHintKey))+'</p>';
      }
    }else{
      html+=actBtn('record','habit-hub-new-btn is-primary',t(role.recordBtnKey));
    }
    html+='</div>';
    return html;
  }

  function renderLabelEditor(value){
    var role=roleCfg();
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-label">'
      +'<p class="habit-voice-cmd-desc">'+esc(t('habitAcousticCmdLabelTitle'))+'</p>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted">'+esc(t('habitAcousticCmdLabelHint'))+'</p>'
      +'<input type="text" class="voice-phrase-custom-input" id="'+esc(role.labelInputId)+'" maxlength="48" value="'+esc(value||'')+'" placeholder="'+esc(t('habitAcousticCmdLabelPlaceholder'))+'">'
      +'<div class="habit-voice-cmd-actions" style="margin-top:10px">'
      +actBtn('save-label','habit-hub-act is-cta',t('habitAcousticCmdLabelSave'))
      +actBtn('skip-label','habit-hub-act is-cta',t('habitAcousticCmdLabelSkip'))
      +'</div></div>';
  }

  function renderDone(){
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-done">'
      +'<p class="habit-voice-cmd-foot">'+esc(t(roleCfg().readyHintKey))+'</p>'
      +'</div>';
  }

  function renderError(){
    var key=(draft&&draft.messageKey)||'habitAcousticCmdUnavailable';
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-error">'
      +'<p class="habit-voice-cmd-desc">'+esc(t(key))+'</p>'
      +'<div class="habit-voice-cmd-actions">'
      +actBtn('record','habit-hub-act is-cta',t('habitAcousticCmdRerecord'))
      +actBtn('cancel','habit-hub-act is-cta',t('habitAcousticCmdCancel'))
      +'</div></div>';
  }

  function renderRecordPanel(opts){
    opts=opts||{};
    var h=helpers();
    var phase=opts.phase||'listening';
    var th=opts.thresholds||currentThresholds();
    var metrics=opts.metrics||{};
    var step=opts.step||sampleStepIndex();
    var speechMs=Number(metrics.speechMs)||0;
    var actionText=opts.actionText||(h.recordPhaseText?h.recordPhaseText(phase,metrics,th):'');
    var barsTone=h.voiceHintFromMetrics?h.voiceHintFromMetrics(metrics,th):'waiting';
    if(!h.voiceHintFromMetrics&&h.recordPhaseText){
      barsTone='waiting';
    }
    var barsCls='mic-level-bars habit-voice-cmd-rec-bars is-active';
    if(barsTone==='tooQuiet') barsCls+=' is-too-quiet';
    else if(barsTone==='good') barsCls+=' is-good';
    else if(barsTone==='tooLong') barsCls+=' is-too-long';
    var meterHtml='';
    if(h.durationMeterState){
      var st=h.durationMeterState(speechMs,speechMs,th);
      meterHtml='<div class="habit-voice-cmd-meter is-'+st.zone+'">'
        +'<div class="habit-voice-cmd-meter-track">'
        +'<span class="habit-voice-cmd-meter-ideal" style="left:'+st.minPct+'%"></span>'
        +'<span class="habit-voice-cmd-meter-prefer" style="left:'+st.preferPct+'%"></span>'
        +'<span class="habit-voice-cmd-meter-fill" style="width:'+st.pct+'%"></span></div></div>';
    }
    var hintText=opts.hint?String(opts.hint):'';
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-listening">'
      +'<div class="habit-voice-cmd-rec-card habit-voice-cmd-rec-panel">'
      +'<div class="habit-voice-cmd-rec-top">'
      +'<span class="habit-voice-cmd-chip" data-acoustic-chip="1">'+esc(t('habitAcousticCmdPhaseChip',{n:step}))+'</span>'
      +'<span class="habit-voice-cmd-phase" data-acoustic-phase="1">'+esc(actionText)+'</span>'
      +'</div>'
      +'<div class="habit-voice-cmd-rec-visual">'
      +'<span class="'+barsCls+'" data-acoustic-bars="1" aria-hidden="true">'+buildMicBars(16)+'</span>'
      +'</div>'
      +'<div class="habit-voice-cmd-rec-meter">'+meterHtml+'</div>'
      +'<p class="habit-voice-cmd-rec-hint"'+(hintText?'':' hidden')+'>'+esc(hintText)+'</p>'
      +'</div>'
      +'<div class="habit-voice-cmd-footer">'
      +(opts.primaryAction||'')
      +actBtn('cancel','habit-voice-cmd-cancel',t('habitAcousticCmdCancel'))
      +'</div></div>';
  }

  function renderRecording(){
    var h=helpers();
    var phase=(draft&&draft.uiPhase)||'armed';
    var metrics=liveLevel||{};
    var th=currentThresholds();
    var actionText=h.recordPhaseText?h.recordPhaseText(phase,metrics,th):t('habitAcousticCmdPhaseArmed');
    if(phase==='armed'&&draft&&draft.inlineHint) actionText=t(draft.inlineHint);
    var primary='';
    if(phase==='armed'){
      primary=actBtn('begin-speak','habit-hub-new-btn is-primary is-block',t('habitAcousticCmdBeginSpeak'));
    }else if(phase==='startingMic'){
      primary='<button type="button" class="habit-hub-new-btn is-primary is-block" disabled>'
        +esc(t('habitAcousticCmdPhaseStartingMic'))+'</button>';
    }else if(phase==='recording'){
      primary=actBtn('finish-speak','habit-hub-new-btn is-primary is-block',t('habitAcousticCmdFinishSpeak'));
    }
    return renderRecordPanel({
      phase:phase,
      metrics:metrics,
      thresholds:th,
      step:sampleStepIndex(),
      actionText:actionText,
      primaryAction:primary
    });
  }

  function paint(){
    if(draft&&draft.role) setActiveRole(draft.role);
    var host=ensureHost();
    if(!host) return;
    if(draft&&draft.state==='recording'){
      host.innerHTML=renderRecording();
      applyLiveBars();
      return;
    }
    if(draft&&draft.state==='building'){
      host.innerHTML=renderRecordPanel({
        phase:'processing',
        actionText:t('habitAcousticCmdBuilding'),
        step:sampleStepIndex(),
        primaryAction:''
      });
      return;
    }
    if(draft&&draft.state==='label'){
      var hostReady=ensureHost();
      var existingInput=$(roleCfg().labelInputId);
      // External refreshes must not rebuild the name field mid-typing.
      if(hostReady&&existingInput&&hostReady.contains(existingInput)) return;
      host.innerHTML=renderLabelEditor(draft.pendingLabel||'');
      var input=$(roleCfg().labelInputId);
      if(input){
        if(!input.dataset.acousticLabelBound){
          input.dataset.acousticLabelBound='1';
          input.addEventListener('input',function(){
            if(draft&&draft.state==='label') draft.pendingLabel=String(input.value||'');
          });
        }
        if(!draft.labelBootstrapped){
          draft.labelBootstrapped=true;
          global.setTimeout(function(){ try{ input.focus(); input.select(); }catch(_e){} },30);
        }
      }
      return;
    }
    if(draft&&draft.state==='done'){
      host.innerHTML=renderDone();
      return;
    }
    if(draft&&draft.state==='error'){
      host.innerHTML=renderError();
      return;
    }
    host.innerHTML=renderIdle(primaryCommand());
  }

  function applyLiveBars(){
    var h=helpers();
    var host=ensureHost();
    var bars=host?host.querySelector('[data-acoustic-bars="1"]'):null;
    if(!bars||!h.levelToBarScales) return;
    var scales=h.levelToBarScales(hasLiveLevel&&liveLevel?liveLevel.level:0.08,16);
    var spans=bars.querySelectorAll('span');
    for(var i=0;i<spans.length;i++){
      spans[i].style.transform='scaleY('+(scales[i]!=null?scales[i]:0.15)+')';
    }
  }

  function onLevelEvent(ev){
    if(!draft||draft.state!=='recording') return;
    if(!ev||(draft.recordSessionId&&ev.sessionId&&ev.sessionId!==draft.recordSessionId)) return;
    liveLevel={
      level:Number(ev.level)||0,
      peak:Number(ev.peak)||0,
      speechMs:Number(ev.speechMs)||0
    };
    hasLiveLevel=true;
    var host=ensureHost();
    var phaseEl=host?host.querySelector('[data-acoustic-phase="1"]'):null;
    var h=helpers();
    if(phaseEl&&h.recordPhaseText&&draft.uiPhase==='recording'){
      phaseEl.textContent=h.recordPhaseText('recording',liveLevel,currentThresholds());
    }
    applyLiveBars();
  }

  function failRecording(messageKey){
    cleanupRecordingSession({unsuspend:true,force:true});
    draft={ role:activeRole, state:'error', messageKey:messageKey||'habitAcousticCmdUnavailable', samples:[] };
    paint();
  }

  function armForNextTake(opts){
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

  function scheduleNextRecording(){
    if(!draft) return;
    armForNextTake({inlineHint:'habitAcousticCmdNeedMore'});
  }

  function enterArmedSession(opts){
    opts=opts||{};
    var api=acoustic();
    if(!api||!api.isAvailable||!api.isAvailable()){
      draft={ role:activeRole, state:'error', messageKey:'habitAcousticCmdUnavailable', samples:[] };
      paint();
      return;
    }
    clearPromptTimer();
    var keepSamples=opts.resetSamples?[]:((draft&&Array.isArray(draft.samples))?draft.samples.slice():[]);
    draft={
      role:activeRole,
      samples:keepSamples,
      state:'recording',
      uiPhase:'preparing',
      thresholds:currentThresholds(),
      recordSessionId:''
    };
    paint();
    var probe=api.probeBackend?api.probeBackend():Promise.resolve(true);
    probe.then(function(ok){
      if(!ok){ failRecording('habitAcousticCmdNeedRebuild'); return null; }
      return api.preflight?api.preflight():Promise.resolve({ok:true});
    }).then(function(pf){
      if(!draft||draft.state!=='recording') return;
      if(pf&&pf.ok===false){
        failRecording(pf.messageKey||'habitAcousticCmdNoMic');
        return;
      }
      draft.thresholds=thresholdsFrom(pf||DEFAULT_THRESHOLDS);
      return setSuspended(true).then(function(){
        if(!draft||draft.state!=='recording') return;
        draft.uiPhase='armed';
        paint();
      });
    }).catch(function(){
      failRecording('habitAcousticCmdUnavailable');
    });
  }

  function beginSpeak(){
    var api=acoustic();
    if(!draft||!api||!api.recordStart) return;
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
        failRecording((res&&res.messageKey)||'habitAcousticCmdStreamFailed');
        return;
      }
      if(res.minSpeechMs||res.manualMaxMs){
        draft.thresholds=thresholdsFrom(Object.assign({},draft.thresholds||{},res));
      }
      draft.uiPhase='recording';
      draft.state='recording';
      paint();
      var maxMs=currentThresholds().manualMaxMs;
      hardCapTimer=global.setTimeout(function(){
        if(draft&&draft.recordSessionId===sessionId&&draft.uiPhase==='recording'){
          finishSpeak();
        }
      },maxMs);
    }).catch(function(err){
      var msg=err&&err.message?String(err.message):'';
      if(msg.indexOf('not found')>=0||msg.indexOf('unknown command')>=0){
        failRecording('habitAcousticCmdNeedRebuild');
      }else{
        failRecording('habitAcousticCmdMicBusy');
      }
    });
  }

  function finishSpeak(){
    var api=acoustic();
    if(!draft||!api||!api.recordStop||finishInFlight) return;
    if(draft.uiPhase!=='recording') return;
    finishInFlight=true;
    clearPromptTimer();
    var sessionId=draft.recordSessionId;
    draft.uiPhase='processing';
    paint();
    api.recordStop({sessionId:sessionId}).then(function(res){
      finishInFlight=false;
      if(!draft) return;
      if(api.logDebugSummary) api.logDebugSummary(res);
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
        failRecording(key);
        return;
      }
      draft.recordSessionId='';
      draft.samples=draft.samples||[];
      draft.samples.push(res.sample);
      if(draft.samples.length>3) draft.samples=draft.samples.slice(-3);
      if(draft.samples.length<2){
        scheduleNextRecording();
        return;
      }
      tryBuildCommand();
    }).catch(function(){
      finishInFlight=false;
      failRecording('habitAcousticCmdUnavailable');
    });
  }

  function tryBuildCommand(){
    var api=acoustic();
    if(!draft||!api||!api.buildFromSamples){
      failRecording('habitAcousticCmdUnavailable');
      return;
    }
    draft.state='building';
    draft.uiPhase='processing';
    paint();
    var old=primaryCommand();
    var role=roleCfg();
    api.buildFromSamples(draft.samples,{
      scenarioId:role.scenarioId,
      activationScope:'global',
      appBoost:false,
      displayText:old?String(old.displayText||''):'',
      currentCommandId:old&&old.id
    }).then(function(built){
      if(!draft||draft.state!=='building') return;
      if(!built||!built.ok){
        if(built&&built.reason==='unstable'&&draft.samples.length<3){
          scheduleNextRecording();
          return;
        }
        draft.state='error';
        draft.messageKey=(built&&built.messageKey)||'habitAcousticCmdTryClearer';
        cleanupRecordingSession({unsuspend:true,force:true});
        paint();
        return;
      }
      cleanupRecordingSession({unsuspend:true,force:true});
      var cmd=built.command||{};
      cmd.kind=role.kind;
      cmd.scenarioId=role.scenarioId;
      cmd.activationScope='global';
      draft={
        role:activeRole,
        samples:[],
        state:'label',
        pendingCommand:cmd,
        pendingLabel:String(cmd.displayText||(old&&old.displayText)||'').trim(),
        thresholds:draft.thresholds
      };
      paint();
    }).catch(function(){
      failRecording('habitAcousticCmdUnavailable');
    });
  }

  function commitPendingCommand(label){
    if(!draft||!draft.pendingCommand){
      endSessionToIdle();
      return;
    }
    if(draft.role) setActiveRole(draft.role);
    var role=roleCfg();
    var cmd=draft.pendingCommand;
    label=String(label||'').trim();
    if(label){
      cmd.displayText=label;
      if(!cmd.label||cmd.label==='我的语音命令') cmd.label=label;
    }
    cmd.kind=role.kind;
    cmd.scenarioId=role.scenarioId;
    cmd.activationScope='global';
    cmd.updatedAt=Date.now();
    setCommands([cmd]);
    draft={ role:activeRole, state:'done', samples:[] };
    paint();
    persistCommands().then(function(){
      global.setTimeout(function(){
        if(draft&&draft.state==='done') endSessionToIdle();
      },1400);
    });
  }

  function endSessionToIdle(){
    cleanupRecordingSession({unsuspend:true,force:true});
    draft=null;
    paint();
  }

  function handleAct(act){
    if(act==='cancel'){ endSessionToIdle(); return; }
    if(act==='record'||act==='rerecord'){
      enterArmedSession({resetSamples:true});
      return;
    }
    if(act==='begin-speak'){ beginSpeak(); return; }
    if(act==='finish-speak'){ finishSpeak(); return; }
    if(act==='save-label'){
      var input=$(roleCfg().labelInputId);
      commitPendingCommand(input?input.value:'');
      return;
    }
    if(act==='skip-label'){ commitPendingCommand(''); return; }
    if(act==='edit-label'){
      var editCmd=primaryCommand();
      if(!editCmd) return;
      draft={
        role:activeRole,
        samples:[],
        state:'label',
        pendingCommand:Object.assign({},editCmd),
        pendingLabel:String(editCmd.displayText||'').trim()
      };
      paint();
      return;
    }
    if(act==='toggle'){
      var cmd=primaryCommand();
      if(!cmd) return;
      cmd.enabled=cmd.enabled===false;
      cmd.updatedAt=Date.now();
      setCommands([cmd]);
      persistCommands();
      paint();
      return;
    }
    if(act==='delete'){
      setCommands([]);
      persistCommands();
      draft=null;
      paint();
    }
  }

  function paintForRole(role){
    setActiveRole(role||'wake');
    if(draft&&draft.role&&draft.role!==activeRole&&(draft.state==='recording'||draft.state==='building'||draft.state==='label')){
      return;
    }
    if(draft&&draft.role&&draft.role!==activeRole){
      draft=null;
    }
    paintFromOutside();
  }

  function paintFromOutside(){
    if(draft&&draft.state==='label'){
      // Keep the live name input; status polls must not wipe typing.
      if(draft.role) setActiveRole(draft.role);
      var host=ensureHost();
      var input=$(roleCfg().labelInputId);
      if(host&&input&&host.contains(input)) return;
      paint();
      return;
    }
    if(draft&&(draft.state==='recording'||draft.state==='building')){
      paint();
      return;
    }
    draft=null;
    paint();
  }

  function bindEvents(role){
    if(role) setActiveRole(role);
    if(bound) return;
    bound=true;
    var root=document.body||document.documentElement;
    root.addEventListener('click',function(e){
      var btn=e.target&&e.target.closest&&e.target.closest('[data-wake-acoustic-act],[data-control-acoustic-act]');
      if(!btn) return;
      var hostEl=null;
      var foundRole='';
      Object.keys(ROLES).forEach(function(key){
        if(foundRole) return;
        var host=$(ROLES[key].hostId);
        if(host&&host.contains(btn)){
          hostEl=host;
          foundRole=key;
        }
      });
      if(!hostEl||!foundRole) return;
      e.preventDefault();
      setActiveRole(foundRole);
      handleAct(btn.getAttribute('data-wake-acoustic-act')||btn.getAttribute('data-control-acoustic-act')||'');
    });
  }

  global.OneToneVoiceWakeAcoustic={
    render:function(){ paintForRole('wake'); },
    bindEvents:function(){ bindEvents('wake'); },
    discardDraft:function(){
      cleanupRecordingSession({unsuspend:true,force:true});
      draft=null;
    },
    isCalibrating:function(){
      return !!(draft&&(draft.state==='recording'||draft.state==='building'||draft.state==='label'));
    },
    WAKE_SCENARIO_ID:ROLES.wake.scenarioId,
    WAKE_KIND:ROLES.wake.kind
  };

  global.OneToneVoiceControlAcoustic={
    render:function(role){ paintForRole(role==='cancel'?'cancel':'end'); },
    bindEvents:function(role){ bindEvents(role==='cancel'?'cancel':'end'); },
    discardDraft:function(){
      cleanupRecordingSession({unsuspend:true,force:true});
      draft=null;
    },
    isCalibrating:function(){
      return !!(draft&&(draft.state==='recording'||draft.state==='building'||draft.state==='label'));
    }
  };
})((typeof window!=='undefined')?window:globalThis);
