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

  var PROMPT_DELAY_MS=500;
  var draft=null;
  var promptTimer=null;
  var recordVisTimer=null;
  var recordStartedAt=0;
  var bound=false;
  var onChangeCb=null;
  var MIN_SPEECH_MS=450;
  var MAX_SPEECH_MS=2000;

  function buildMicBars(count){
    count=count||16;
    var html='';
    for(var i=0;i<count;i++) html+='<span></span>';
    return html;
  }

  function sampleStepIndex(){
    if(!draft) return 1;
    var n=Array.isArray(draft.samples)?draft.samples.length:0;
    if(draft.state==='recording') return Math.min(2,n+1);
    if(draft.state==='prompt') return Math.min(2,n+1);
    return Math.min(2,Math.max(1,n));
  }

  function renderSampleProgress(activeStep){
    activeStep=activeStep||sampleStepIndex();
    var html='<div class="habit-voice-cmd-steps" aria-label="'+esc(t('habitAcousticCmdRecordProgress'))+'">';
    for(var i=1;i<=2;i++){
      var cls='habit-voice-cmd-step';
      if(i<activeStep) cls+=' is-done';
      else if(i===activeStep) cls+=' is-active';
      html+='<span class="'+cls+'"><span class="habit-voice-cmd-step-dot"></span>'
        +'<span class="habit-voice-cmd-step-lbl">'+esc(t('habitAcousticCmdRecordStep',{n:i}))+'</span></span>';
      if(i<2) html+='<span class="habit-voice-cmd-step-line'+(i<activeStep?' is-done':'')+'"></span>';
    }
    html+='</div>';
    return html;
  }

  function renderDurationMeter(ms,opts){
    opts=opts||{};
    ms=Math.max(0,Number(ms)||0);
    var pct=Math.min(100,Math.round((ms/MAX_SPEECH_MS)*100));
    var zone='is-idle';
    if(ms>=MIN_SPEECH_MS&&ms<=MAX_SPEECH_MS) zone='is-good';
    else if(ms>MAX_SPEECH_MS) zone='is-warn';
    else if(ms>0) zone='is-low';
    var marker='';
    if(opts.showIdeal!==false){
      marker='<span class="habit-voice-cmd-meter-ideal" style="left:'+Math.round((MIN_SPEECH_MS/MAX_SPEECH_MS)*100)+'%"></span>'
        +'<span class="habit-voice-cmd-meter-max" style="left:100%"></span>';
    }
    return '<div class="habit-voice-cmd-meter '+zone+(opts.compact?' is-compact':'')+'">'
      +'<div class="habit-voice-cmd-meter-track">'+marker
      +'<span class="habit-voice-cmd-meter-fill" style="width:'+pct+'%"></span></div>'
      +'<div class="habit-voice-cmd-meter-labels">'
      +'<span>'+esc(t('habitAcousticCmdRecordZoneMin'))+'</span>'
      +'<span>'+esc(t('habitAcousticCmdRecordZone'))+'</span>'
      +'<span>'+esc(t('habitAcousticCmdRecordZoneMax'))+'</span>'
      +'</div>'
      +(ms>0?'<p class="habit-voice-cmd-meter-val">'+esc(t('habitAcousticCmdRecordDuration',{s:(ms/1000).toFixed(1)}))+'</p>':'')
      +'</div>';
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
  }

  function setSuspended(on){
    var api=acoustic();
    if(!api||!api.setSuspend) return Promise.resolve();
    return api.setSuspend(!!on).catch(function(){ return null; });
  }

  function discardDraft(){
    clearPromptTimer();
    stopRecordVis();
    setSuspended(false);
    draft=null;
  }

  function scenarioContextId(){
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
    if(persist&&persist.saveAsync) return persist.saveAsync();
    if(persist&&persist.save){ persist.save(); return Promise.resolve(true); }
    return Promise.resolve(false);
  }

  function ensureHost(){
    return $('habitScenarioVoiceCommandHost');
  }

  function chipLabel(cmd){
    if(!cmd) return '';
    if(cmd.enabled===false) return t('habitAcousticCmdPaused');
    var text=String(cmd.displayText||'').trim();
    if(text) return text;
    if(cmd.quality==='ok') return t('habitAcousticCmdSuggestRerecord');
    return t('habitAcousticCmdLearned');
  }

  function chipClass(cmd){
    if(!cmd) return '';
    if(cmd.enabled===false) return 'is-disabled';
    if(cmd.quality==='ok') return 'is-warn';
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
      html+='<div class="habit-voice-cmd-status">'
        +'<span class="habit-voice-cmd-chip '+chipClass(cmd)+'">'+esc(chipLabel(cmd))+'</span>'
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

  function renderRecording(){
    var step=sampleStepIndex();
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-listening" id="habitAcousticRecordPanel">'
      +renderSampleProgress(step)
      +'<div class="habit-voice-cmd-rec-card">'
      +'<div class="habit-voice-cmd-rec-visual">'
      +'<span class="habit-voice-cmd-rec-ring" aria-hidden="true"></span>'
      +'<span class="mic-level-bars habit-voice-cmd-rec-bars is-active" id="habitAcousticRecordBars" aria-hidden="true">'
      +buildMicBars(16)+'</span>'
      +'</div>'
      +'<p class="habit-voice-cmd-status" id="habitAcousticRecordStatus">'+esc(t('habitAcousticCmdRecording'))+'</p>'
      +'<p class="habit-voice-cmd-rec-hint" id="habitAcousticRecordHint">'+esc(t('habitAcousticCmdRecordWait'))+'</p>'
      +renderDurationMeter(0)
      +'</div>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted">'+esc(t('habitAcousticCmdRecordTip'))+'</p>'
      +'<div class="habit-voice-cmd-actions">'
      +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="cancel">'+esc(t('habitAcousticCmdCancel'))+'</button>'
      +'</div></div>';
  }

  function renderPrompt(sampleCount){
    var msg=sampleCount>=1?t('habitAcousticCmdNeedMore'):t('habitAcousticCmdRecordAgain');
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-confirm">'
      +renderSampleProgress(Math.min(2,sampleCount+1))
      +'<div class="habit-voice-cmd-rec-card is-confirm">'
      +'<p class="habit-voice-cmd-status">'+esc(msg)+'</p>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted">'+esc(t('habitAcousticCmdRecordConfirmHint'))+'</p>'
      +'</div>'
      +'<div class="habit-voice-cmd-actions">'
      +'<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="confirm-yes">'+esc(t('habitAcousticCmdConfirmYes'))+'</button>'
      +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="confirm-no">'+esc(t('habitAcousticCmdConfirmNo'))+'</button>'
      +'</div></div>';
  }

  function renderBuilding(){
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-listening is-building">'
      +renderSampleProgress(2)
      +'<div class="habit-voice-cmd-rec-card">'
      +'<span class="habit-voice-cmd-build-spinner" aria-hidden="true"></span>'
      +'<p class="habit-voice-cmd-status">'+esc(t('habitAcousticCmdBuilding'))+'</p>'
      +'</div></div>';
  }

  function renderError(messageKey,debug){
    var msg=t(messageKey||'habitAcousticCmdTimeout');
    var speechMs=debug&&debug.speechMs!=null?Number(debug.speechMs):0;
    var hint='';
    if(messageKey==='habitAcousticCmdTooShort') hint=t('habitAcousticCmdTooShortHint');
    else if(messageKey==='habitAcousticCmdTooLong') hint=t('habitAcousticCmdTooLongHint');
    else if(messageKey==='habitAcousticCmdTimeout') hint=t('habitAcousticCmdTimeoutHint');
    else if(messageKey==='habitAcousticCmdTryClearer'||messageKey==='habitAcousticCmdUnstable'){
      hint=t('habitAcousticCmdMatchFailHint');
    }
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-error">'
      +renderSampleProgress(sampleStepIndex())
      +'<div class="habit-voice-cmd-rec-card is-error">'
      +'<p class="habit-voice-cmd-status is-warn">'+esc(msg)+'</p>'
      +(hint?'<p class="habit-voice-cmd-rec-hint">'+esc(hint)+'</p>':'')
      +(speechMs>0?renderDurationMeter(speechMs,{compact:true}):renderDurationMeter(0,{compact:true}))
      +'</div>'
      +'<div class="habit-voice-cmd-actions">'
      +'<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="record">'+esc(t('habitAcousticCmdRecordAgain'))+'</button>'
      +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="cancel">'+esc(t('habitAcousticCmdCancel'))+'</button>'
      +'</div></div>';
  }

  function renderLabelEditor(prefill){
    prefill=String(prefill||'').trim();
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-label">'
      +'<div class="habit-voice-cmd-rec-card is-confirm">'
      +'<p class="habit-voice-cmd-status">'+esc(t('habitAcousticCmdLabelTitle'))+'</p>'
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
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-done">'
      +'<p class="habit-voice-cmd-status"><span class="habit-voice-cmd-chip is-good">'
      +esc(text||t('habitAcousticCmdLearned'))+'</span></p>'
      +'<p class="habit-voice-cmd-foot">'+esc(t('habitAcousticCmdReadyHint'))+'</p>'
      +'</div>';
  }

  function stopRecordVis(){
    if(recordVisTimer){
      global.clearInterval(recordVisTimer);
      recordVisTimer=null;
    }
    recordStartedAt=0;
  }

  function animateRecordBars(elapsed){
    var wrap=$('habitAcousticRecordBars');
    if(!wrap) return;
    var bars=wrap.querySelectorAll('span');
    if(!bars.length) return;
    var norm=Math.min(1,elapsed/1800);
    if(elapsed<250) norm=0.15+Math.sin(elapsed/80)*0.08;
    else if(elapsed<MAX_SPEECH_MS) norm=0.35+norm*0.55+Math.sin(elapsed/120)*0.12;
    else norm=0.55+Math.sin(elapsed/90)*0.2;
    var n=bars.length;
    var center=(n-1)/2;
    bars.forEach(function(bar,i){
      bar.className='';
      var dist=Math.abs(i-center)/Math.max(center,1);
      var scale=Math.max(0.12,Math.min(1,norm*(1-dist*0.42)));
      bar.style.transform='scaleY('+scale.toFixed(3)+')';
      if(scale>0.55) bar.classList.add('is-hot');
    });
  }

  function updateRecordVis(){
    if(!draft||draft.state!=='recording'||!recordStartedAt) return;
    var elapsed=Date.now()-recordStartedAt;
    var statusEl=$('habitAcousticRecordStatus');
    var hintEl=$('habitAcousticRecordHint');
    var meterFill=document.querySelector('#habitAcousticRecordPanel .habit-voice-cmd-meter-fill');
    var meterVal=document.querySelector('#habitAcousticRecordPanel .habit-voice-cmd-meter-val');
    var meter=document.querySelector('#habitAcousticRecordPanel .habit-voice-cmd-meter');
    if(statusEl){
      if(elapsed<MIN_SPEECH_MS) statusEl.textContent=t('habitAcousticCmdRecordWait');
      else if(elapsed<=MAX_SPEECH_MS) statusEl.textContent=t('habitAcousticCmdRecording');
      else statusEl.textContent=t('habitAcousticCmdRecordTooLongLive');
    }
    if(hintEl){
      if(elapsed<400) hintEl.textContent=t('habitAcousticCmdRecordWait');
      else if(elapsed<1500) hintEl.textContent=t('habitAcousticCmdRecordGo');
      else if(elapsed<=MAX_SPEECH_MS) hintEl.textContent=t('habitAcousticCmdRecordStop');
      else hintEl.textContent=t('habitAcousticCmdRecordTooLongHint');
    }
    if(meterFill) meterFill.style.width=Math.min(100,Math.round((elapsed/MAX_SPEECH_MS)*100))+'%';
    if(meter){
      meter.classList.remove('is-idle','is-good','is-low','is-warn');
      if(elapsed>=MIN_SPEECH_MS&&elapsed<=MAX_SPEECH_MS) meter.classList.add('is-good');
      else if(elapsed>MAX_SPEECH_MS) meter.classList.add('is-warn');
      else if(elapsed>0) meter.classList.add('is-low');
      else meter.classList.add('is-idle');
    }
    if(meterVal) meterVal.textContent=t('habitAcousticCmdRecordDuration',{s:(elapsed/1000).toFixed(1)});
    animateRecordBars(elapsed);
  }

  function startRecordVis(){
    stopRecordVis();
    recordStartedAt=Date.now();
    updateRecordVis();
    recordVisTimer=global.setInterval(updateRecordVis,100);
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
          wakeHint:t('habitAcousticCmdRecording'),
          wakeLabel:t('habitAcousticCmdTitle'),
          calibrating:true,
          live:true
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
      if(draft.state==='prompt'){
        return {
          statusKey:'habitAcousticCmdFbPrompt',
          transcriptKey:'habitAcousticCmdFbNoTranscript',
          wakeHint:t('habitAcousticCmdNeedMore'),
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
    return !!(draft&&(draft.state==='recording'||draft.state==='prompt'||draft.state==='building'||draft.state==='label'));
  }

  function isLabelEditorMounted(){
    var host=ensureHost();
    if(!host||host.hidden) return false;
    return !!host.querySelector('#habitAcousticCmdLabelInput');
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
        host.innerHTML=renderRecording();
        startRecordVis();
        syncFeedbackRail();
        return;
      }
      stopRecordVis();
      if(draft.state==='prompt'){ host.innerHTML=renderPrompt((draft.samples||[]).length); syncFeedbackRail(); return; }
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
        // Keep the live input — polling re-paints were wiping typed text / stealing focus.
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
    stopRecordVis();
    draft.state='error';
    draft.messageKey=messageKey||'habitAcousticCmdTimeout';
    draft.debugSummary=debug||null;
    setSuspended(false);
    paint();
  }

  function scheduleNextRecording(){
    clearPromptTimer();
    promptTimer=global.setTimeout(function(){
      if(!draft||draft.state!=='prompt') return;
      startRecording();
    },PROMPT_DELAY_MS);
  }

  function startRecording(){
    var m=currentMapping();
    if(!m) return;
    var api=acoustic();
    if(!api||!api.isAvailable||!api.isAvailable()){
      draft={
        mappingId:m.id,
        samples:(draft&&draft.mappingId===m.id&&Array.isArray(draft.samples))?draft.samples.slice():[],
        state:'error',
        messageKey:'habitAcousticCmdUnavailable',
        pendingScope:draft&&draft.pendingScope
      };
      paint();
      return;
    }
    clearPromptTimer();
    draft={
      mappingId:m.id,
      samples:(draft&&draft.mappingId===m.id&&Array.isArray(draft.samples))?draft.samples.slice():[],
      state:'recording',
      pendingScope:draft&&draft.pendingScope
    };
    paint();
    setSuspended(true);
    var probe=api.probeBackend?api.probeBackend():Promise.resolve(true);
    probe.then(function(ok){
      if(!ok){
        failRecording('habitAcousticCmdNeedRebuild');
        return null;
      }
      return setSuspended(true).then(function(){
        return api.recordOnce();
      });
    }).then(function(res){
      if(!res) return;
      if(api.logDebugSummary) api.logDebugSummary(res);
      if(!draft||draft.state!=='recording') return;
      if(!res.ok||!res.sample){
        failRecording(res.messageKey||'habitAcousticCmdTimeout',res.debugSummary);
        return;
      }
      stopRecordVis();
      draft.samples=draft.samples||[];
      draft.samples.push(res.sample);
      if(draft.samples.length>3) draft.samples=draft.samples.slice(-3);
      if(draft.samples.length<2){
        draft.state='prompt';
        paint();
        scheduleNextRecording();
        return;
      }
      tryBuildCommand();
    }).catch(function(err){
      if(typeof console!=='undefined'&&console.warn){
        console.warn('[acoustic] recordOnce failed',err);
      }
      var msg=err&&err.message?String(err.message):'';
      if(msg.indexOf('invoke timeout')>=0) failRecording('habitAcousticCmdTimeout');
      else if(msg.indexOf('not found')>=0||msg.indexOf('unknown command')>=0) failRecording('habitAcousticCmdNeedRebuild');
      else failRecording('habitAcousticCmdUnavailable');
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
    paint();
    var old=primaryCommand(m);
    var pendingScope=resolvePendingScope(m,old);
    api.buildFromSamples(draft.samples,{
      scenarioId:m.id,
      activationScope:pendingScope,
      appBoost:old?old.appBoost!==false:true,
      displayText:old?String(old.displayText||''):'',
      currentCommandId:old&&old.id
    }).then(function(built){
      if(!draft||draft.state!=='building') return;
      if(!built||!built.ok){
        if(built&&built.reason==='unstable'&&draft.samples.length<3){
          draft.state='prompt';
          paint();
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
        setSuspended(false);
        paint();
        return;
      }
      setSuspended(false);
      draft={
        mappingId:m.id,
        samples:[],
        state:'label',
        pendingScope:pendingScope,
        pendingCommand:built.command,
        pendingLabel:String((built.command&&built.command.displayText)||(old&&old.displayText)||'').trim()
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
    cmd.updatedAt=Date.now();
    m.acousticVoiceCommands=[cmd];
    draft={mappingId:m.id,samples:[],state:'done',pendingScope:draft.pendingScope,pendingLabel:label};
    paint();
    persistMapping(m).then(function(){
      global.setTimeout(function(){
        if(draft&&draft.state==='done') endSessionToIdle();
      },1600);
    });
  }

  function endSessionToIdle(){
    clearPromptTimer();
    stopRecordVis();
    setSuspended(false);
    draft=null;
    paint();
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
    if(act==='confirm-yes'){
      if(draft&&draft.state==='prompt') startRecording();
      return;
    }
    if(act==='confirm-no'){
      if(draft){
        if(Array.isArray(draft.samples)&&draft.samples.length) draft.samples.pop();
        if(!draft.samples.length){
          endSessionToIdle();
          return;
        }
      }
      startRecording();
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
    if(opts.onChange) onChangeCb=opts.onChange;
    if(bound) return;
    bound=true;
    document.addEventListener('click',onClick,true);
  }

  function setOnChange(fn){ onChangeCb=fn; }

  function render(){
    paint();
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
    discardDraft:discardDraft,
    hubChipHtml:hubChipHtml,
    isCalibrating:isCalibrating,
    isScenarioEdit:isScenarioEdit,
    feedbackInfo:feedbackInfo
  };
})((typeof window!=='undefined')?window:globalThis);
