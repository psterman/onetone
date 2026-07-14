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

  var SAMPLE_TIMEOUT_MS=8000;
  var draft=null;
  var listenTimer=null;
  var listenDeadline=0;
  var bound=false;
  var onChangeCb=null;

  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function calib(){ return global.OneToneVoiceCommandCalibration; }
  function matcher(){ return global.OneToneVoiceCommandMatcher; }

  function clearListenTimer(){
    if(listenTimer){
      global.clearTimeout(listenTimer);
      listenTimer=null;
    }
  }

  function discardDraft(){
    clearListenTimer();
    if(matcher()&&matcher().isSuspended&&matcher().isSuspended()){
      matcher().suspend(false);
    }
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
    if(!m||!Array.isArray(m.voiceCommands)) return null;
    for(var i=0;i<m.voiceCommands.length;i++){
      if(m.voiceCommands[i]) return m.voiceCommands[i];
    }
    return null;
  }

  function engineMode(){
    var wake=global.OneToneVoiceWake;
    return wake&&wake.currentMode?wake.currentMode():'off';
  }

  function wakeSnapshot(){
    var h=global.__vp_bootstrap_hooks__||{};
    var raw=typeof h.voiceUiSnapshot==='function'?h.voiceUiSnapshot():h.voiceUiSnapshot;
    if(raw&&raw.wake) return raw;
    return raw||{};
  }

  function currentEngineRes(){
    var wake=wakeSnapshot().wake||{};
    var mode=engineMode();
    if(mode==='vosk') return wake.vosk||null;
    if(mode==='sapi') return wake.sapi||null;
    return wake.vosk||wake.sapi||null;
  }

  function pickHeardText(res){
    if(!res) return '';
    var text=String(res.lastFinal||'').trim();
    if(!text&&engineMode()==='sapi') text=String(res.lastHeard||'').trim();
    if(!text) text=String(res.lastHeard||res.lastPartial||'').trim();
    return text.replace(/（还在听…）\s*$/,'').replace(/\s*\(listening…\)\s*$/i,'').trim();
  }

  function heardFingerprint(res){
    if(!res) return '';
    return [res.lastFinal||'',res.lastHeard||'',res.lastPartial||''].join('\x1e');
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
    var phrase=String(cmd.canonicalPhrase||'').trim();
    if(!phrase) return '';
    if(cmd.enabled===false) return t('habitVoiceCmdPaused',{text:phrase});
    if(cmd.quality==='ok') return t('habitVoiceCmdSuggestRerecord',{text:phrase});
    return t('habitVoiceCmdLearned',{text:phrase});
  }

  function chipClass(cmd){
    if(!cmd) return '';
    if(cmd.enabled===false) return 'is-disabled';
    if(cmd.quality==='ok') return 'is-warn';
    return 'is-good';
  }

  function resolvePendingScope(m,cmd){
    if(cmd&&cmd.activationScope==='foreground-app') return 'foreground-app';
    if(draft&&draft.mappingId===(m&&m.id)&&draft.pendingScope==='foreground-app') return 'foreground-app';
    return 'global';
  }

  function renderScopeSeg(scope){
    scope=scope==='foreground-app'?'foreground-app':'global';
    return '<div class="habit-voice-cmd-scope pref-segmented" role="group" aria-label="'+esc(t('habitVoiceCmdScopeLbl'))+'">'
      +'<button type="button" class="pref-segmented-btn keys-trigger-mode-seg'+(scope==='global'?' is-active':'')+'" data-voice-cmd-scope="global">'
      +esc(t('habitVoiceCmdScopeGlobal'))+'</button>'
      +'<button type="button" class="pref-segmented-btn keys-trigger-mode-seg'+(scope==='foreground-app'?' is-active':'')+'" data-voice-cmd-scope="foreground-app">'
      +esc(t('habitVoiceCmdScopeApp'))+'</button>'
      +'</div>';
  }

  function renderIdle(m,cmd){
    var scope=resolvePendingScope(m,cmd);
    var html='<div class="habit-scenario-voice-field habit-scenario-voice-command">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('habitVoiceCmdTitle'))+'</span>'
      +renderScopeSeg(scope)
      +'</div>'
      +'<p class="habit-voice-cmd-desc">'+esc(t('habitVoiceCmdDesc'))+'</p>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted">'+esc(t('habitVoiceCmdNoTouchWake'))+'</p>'
      +(scope==='foreground-app'?'<p class="habit-voice-cmd-scope-hint">'+esc(t('habitVoiceCmdScopeFgHint'))+'</p>':'');
    if(cmd){
      html+='<div class="habit-voice-cmd-status">'
        +'<span class="habit-voice-cmd-chip '+chipClass(cmd)+'">'+esc(chipLabel(cmd))+'</span>'
        +'<div class="habit-voice-cmd-actions">'
        +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="rerecord">'+esc(t('habitVoiceCmdRerecord'))+'</button>'
        +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="toggle">'
        +esc(cmd.enabled===false?t('habitVoiceCmdResume'):t('habitVoiceCmdPause'))+'</button>'
        +'<button type="button" class="habit-hub-act is-cta is-danger" data-voice-cmd-act="delete">'+esc(t('habitVoiceCmdDelete'))+'</button>'
        +'</div></div>';
      if(cmd.enabled!==false){
        html+='<p class="habit-voice-cmd-foot">'+esc(t('habitVoiceCmdReadyHint'))+'</p>';
      }
    }else{
      html+='<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="record">'
        +esc(t('habitVoiceCmdRecordBtn'))+'</button>';
    }
    html+='</div>';
    return html;
  }

  function renderListening(){
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-listening">'
      +'<div class="habit-voice-cmd-listen-row">'
      +'<span class="habit-voice-cmd-pulse" aria-hidden="true"></span>'
      +'<span class="habit-voice-cmd-status">'+esc(t('habitVoiceCmdListening'))+'</span>'
      +'</div>'
      +'<p class="habit-voice-cmd-desc habit-voice-cmd-desc--muted">'+esc(t('habitVoiceCmdNotMuteGlobal'))+'</p>'
      +'<div class="habit-voice-cmd-actions">'
      +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="cancel">'+esc(t('habitVoiceCmdCancel'))+'</button>'
      +'</div></div>';
  }

  function renderConfirm(transcript){
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-confirm">'
      +'<p class="habit-voice-cmd-status">'+esc(t('habitVoiceCmdHeard',{text:transcript}))+'</p>'
      +'<div class="habit-voice-cmd-actions">'
      +'<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="confirm-yes">'+esc(t('habitVoiceCmdConfirmYes'))+'</button>'
      +'<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="confirm-no">'+esc(t('habitVoiceCmdConfirmNo'))+'</button>'
      +'</div></div>';
  }

  function renderError(messageKey,meta,withOpenEngine){
    var msg=t(messageKey,meta||{});
    var html='<div class="habit-scenario-voice-field habit-scenario-voice-command is-error">'
      +'<p class="habit-voice-cmd-status is-warn">'+esc(msg)+'</p>'
      +'<div class="habit-voice-cmd-actions">';
    if(withOpenEngine){
      html+='<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="open-engine">'+esc(t('habitVoiceCmdGoEnable'))+'</button>';
    }else{
      html+='<button type="button" class="habit-hub-new-btn is-primary" data-voice-cmd-act="record">'+esc(t('habitVoiceCmdRecordAgain'))+'</button>';
    }
    html+='<button type="button" class="habit-hub-act is-cta" data-voice-cmd-act="cancel">'+esc(t('habitVoiceCmdCancel'))+'</button>'
      +'</div></div>';
    return html;
  }

  function renderDone(phrase){
    return '<div class="habit-scenario-voice-field habit-scenario-voice-command is-done">'
      +'<p class="habit-voice-cmd-status"><span class="habit-voice-cmd-chip is-good">'+esc(t('habitVoiceCmdLearned',{text:phrase}))+'</span></p>'
      +'<p class="habit-voice-cmd-foot">'+esc(t('habitVoiceCmdReadyHint'))+'</p>'
      +'</div>';
  }

  function paint(){
    var host=ensureHost();
    if(!host) return;
    var m=currentMapping();
    if(!m){
      discardDraft();
      host.hidden=true;
      host.innerHTML='';
      return;
    }
    host.hidden=false;
    var cmd=primaryCommand(m);
    if(draft&&draft.mappingId===m.id){
      if(draft.state==='listening'){ host.innerHTML=renderListening(); return; }
      if(draft.state==='confirm'){ host.innerHTML=renderConfirm(draft.lastTranscript||''); return; }
      if(draft.state==='error'){
        host.innerHTML=renderError(draft.messageKey||'habitVoiceCmdTimeout',draft.meta,!!draft.openEngine);
        return;
      }
      if(draft.state==='done'){
        host.innerHTML=renderDone(draft.lastTranscript||(cmd&&cmd.canonicalPhrase)||'');
        return;
      }
    }
    host.innerHTML=renderIdle(m,cmd);
  }

  function startListening(){
    var m=currentMapping();
    if(!m) return;
    if(engineMode()==='off'){
      draft={
        mappingId:m.id,
        samples:(draft&&draft.samples)||[],
        lastTranscript:'',
        state:'error',
        messageKey:'habitVoiceCmdNeedEngine',
        openEngine:true,
        pendingScope:draft&&draft.pendingScope
      };
      paint();
      return;
    }
    clearListenTimer();
    if(matcher()) matcher().suspend(true);
    var baseline=heardFingerprint(currentEngineRes());
    draft={
      mappingId:m.id,
      samples:(draft&&draft.mappingId===m.id&&Array.isArray(draft.samples))?draft.samples.slice():[],
      lastTranscript:'',
      state:'listening',
      baseline:baseline,
      pendingScope:draft&&draft.pendingScope
    };
    listenDeadline=Date.now()+SAMPLE_TIMEOUT_MS;
    paint();
    function tick(){
      if(!draft||draft.state!=='listening') return;
      var res=currentEngineRes();
      var fp=heardFingerprint(res);
      var text=pickHeardText(res);
      if(text&&fp!==draft.baseline){
        draft.lastTranscript=text;
        draft.state='confirm';
        draft.lastSource=engineMode()==='sapi'?'sapi':'vosk';
        draft.lastConfidence=null;
        if(engineMode()==='sapi'&&res&&res.minConfidence!=null){
          /* SAPI status has no per-utterance confidence; keep null */
        }
        clearListenTimer();
        paint();
        return;
      }
      if(Date.now()>=listenDeadline){
        draft.state='error';
        draft.messageKey='habitVoiceCmdTimeout';
        clearListenTimer();
        paint();
        return;
      }
      listenTimer=global.setTimeout(tick,180);
    }
    listenTimer=global.setTimeout(tick,180);
  }

  function endSessionToIdle(){
    clearListenTimer();
    if(matcher()) matcher().suspend(false);
    draft=null;
    paint();
  }

  function collectExistingCommands(exceptScenarioId){
    var cfg=state().config||{};
    var list=[];
    (cfg.mappings||[]).forEach(function(x){
      if(!x||!Array.isArray(x.voiceCommands)) return;
      x.voiceCommands.forEach(function(c){
        if(!c) return;
        var copy=Object.assign({},c);
        if(!copy.scenarioId) copy.scenarioId=x.id;
        list.push(copy);
      });
    });
    return list;
  }

  function confirmYes(){
    var m=currentMapping();
    if(!m||!draft||draft.state!=='confirm') return;
    var c=calib();
    if(!c) return;
    var transcript=String(draft.lastTranscript||'').trim();
    var n=c.normalizeTranscript(transcript);
    if(n.length<2){
      draft.state='error';
      draft.messageKey='habitVoiceCmdTooShort';
      paint();
      return;
    }
    var sample={
      transcript:transcript,
      confidence:null,
      source:draft.lastSource||'vosk',
      qualitySignals:{
        hasFinalText:true,
        micTooLow:false,
        textLengthOk:n.length>=2&&n.length<=24,
        sampleAgreement:1
      },
      createdAt:Date.now()
    };
    draft.samples.push(sample);
    if(draft.samples.length>3) draft.samples=draft.samples.slice(-3);

    if(draft.samples.length<2){
      draft.state='listening';
      draft.baseline=heardFingerprint(currentEngineRes());
      listenDeadline=Date.now()+SAMPLE_TIMEOUT_MS;
      paint();
      clearListenTimer();
      listenTimer=global.setTimeout(function tick(){
        if(!draft||draft.state!=='listening') return;
        var res=currentEngineRes();
        var fp=heardFingerprint(res);
        var text=pickHeardText(res);
        if(text&&fp!==draft.baseline){
          draft.lastTranscript=text;
          draft.state='confirm';
          draft.lastSource=engineMode()==='sapi'?'sapi':'vosk';
          clearListenTimer();
          paint();
          return;
        }
        if(Date.now()>=listenDeadline){
          draft.state='error';
          draft.messageKey='habitVoiceCmdTimeout';
          clearListenTimer();
          paint();
          return;
        }
        listenTimer=global.setTimeout(tick,180);
      },180);
      return;
    }

    var old=primaryCommand(m);
    var pendingScope=resolvePendingScope(m,old);
    var lang=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh';
    var built=c.buildCommandFromSamples(draft.samples,collectExistingCommands(m.id),{
      scenarioId:m.id,
      currentScenarioId:m.id,
      currentCommandId:old&&old.id,
      config:state().config,
      activationScope:pendingScope,
      appBoost:old?old.appBoost!==false:true,
      createdAt:old&&old.createdAt,
      locale:lang==='en'?'en-US':'zh-CN',
      newId:function(){
        return global.OneToneConfigPersist&&global.OneToneConfigPersist.newVoiceCommandId
          ?global.OneToneConfigPersist.newVoiceCommandId()
          :('cmd_'+Date.now());
      }
    });

    if(!built.ok){
      if(built.reason==='unstable'&&draft.samples.length<3){
        draft.state='error';
        draft.messageKey=built.messageKey||'habitVoiceCmdUnstable';
        paint();
        return;
      }
      draft.state='error';
      draft.messageKey=built.messageKey||'habitVoiceCmdTryClearer';
      draft.meta=built.meta||{};
      if(matcher()) matcher().suspend(false);
      paint();
      return;
    }

    m.voiceCommands=[built.command];
    draft={mappingId:m.id,samples:[],lastTranscript:built.command.canonicalPhrase,state:'done',pendingScope:pendingScope};
    if(matcher()) matcher().suspend(false);
    paint();
    if(built.warnings&&built.warnings.length&&global.OneToneAppToast){
      global.OneToneAppToast.show(t(built.warnings[0]),'scheme');
    }
    persistMapping(m).then(function(){
      global.setTimeout(function(){
        if(draft&&draft.state==='done') endSessionToIdle();
      },1600);
    });
  }

  function applyScope(scope){
    var m=currentMapping();
    if(!m) return;
    var cmd=primaryCommand(m);
    if(!cmd){
      // Stash preference on draft-less mapping via empty placeholder? Only when command exists.
      // If no command yet, keep scope choice in a transient prefs on draft when recording starts.
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
    if(act==='open-engine'){
      // Stay in scenario voice context — do not clear returnId via openGlobalVoice.
      endSessionToIdle();
      if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
      var engine=$('voiceRecognizeSourceGrid')||$('voiceSummaryEngineSwitch')||$('voiceSettingsRecognizeBody');
      if(engine&&engine.scrollIntoView){
        try{ engine.scrollIntoView({behavior:'smooth',block:'center'}); }catch(_){}
      }
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitVoiceCmdNeedEngine'),'scheme');
      return;
    }
    if(act==='record'||act==='rerecord'){
      var keepScope=draft&&draft.pendingScope;
      if(act==='rerecord'){
        draft={mappingId:m.id,samples:[],lastTranscript:'',state:'idle',pendingScope:keepScope};
      }else if(!draft){
        draft={mappingId:m.id,samples:[],lastTranscript:'',state:'idle',pendingScope:keepScope};
      }
      startListening();
      return;
    }
    if(act==='confirm-yes'){
      confirmYes();
      return;
    }
    if(act==='confirm-no'){
      if(draft) draft.samples=draft.samples||[];
      startListening();
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
      m.voiceCommands=[];
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
    if(!cmd||!cmd.canonicalPhrase) return '';
    return '<span class="habit-hub-voice-cmd-chip '+chipClass(cmd)+'" data-habit-voice-cmd="'+esc(m.id)+'" title="'+esc(t('habitVoiceCmdTitle'))+'">'
      +esc(chipLabel(cmd))+'</span>';
  }

  global.OneToneHabitScenarioVoiceCommand={
    render:render,
    bindEvents:bindEvents,
    setOnChange:setOnChange,
    discardDraft:discardDraft,
    hubChipHtml:hubChipHtml,
    isCalibrating:function(){
      return !!(draft&&(draft.state==='listening'||draft.state==='confirm'));
    }
  };
})((typeof window!=='undefined')?window:globalThis);
