(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_mapping_test_send_hooks__ || {}; }
  var sendState='idle';
  var sendTimer=0;
  var sendWatchdog=0;
  var sendFromFooter=false;
  var sendMappingId=null;
  var modalMappingId=null;
  var viewMode='send';
  var wizardState=null;
  var wizardPollTimer=0;
  var wizardModes=['hold','tap','double'];
  var activationTestCallback=null;
  var activationTestSilent=false;
  var triggerVerifyCallback=null;
  var triggerVerifyListener=null;
  var triggerVerifyTimeout=0;

  function resetState(){
    clearTimeout(sendTimer);
    clearTimeout(sendWatchdog);
    sendTimer=0;
    sendWatchdog=0;
    sendState='idle';
    sendMappingId=null;
    sendFromFooter=false;
  }

  function showFooterSentBriefly(){
    clearTimeout(sendTimer);
    sendState='sent';
    sendFromFooter=true;
    renderSendButton();
    sendTimer=setTimeout(function(){
      resetState();
      renderSendButton();
    },900);
  }

  function clearWizardTimers(){
    clearTimeout(wizardPollTimer);
    wizardPollTimer=0;
    if(wizardState&&wizardState.timeoutId){
      clearTimeout(wizardState.timeoutId);
      wizardState.timeoutId=0;
    }
  }

  function clearWizardListener(){
    if(!wizardState||!wizardState.listener||!global.OneToneApp||!global.OneToneApp.off) return;
    global.OneToneApp.off('trigger_test_fired',wizardState.listener);
    wizardState.listener=null;
  }

  function resetWizardState(){
    clearWizardTimers();
    clearWizardListener();
    wizardState=null;
  }

  function setViewMode(mode){
    viewMode=mode==='wizard'?'wizard':'send';
    var sendView=$('testModalSendView');
    var wizardView=$('testModalWizardView');
    if(sendView) sendView.hidden=viewMode!=='send';
    if(wizardView) wizardView.hidden=viewMode!=='wizard';
  }

  function openOverlay(){
    var overlay=$('testOverlay');
    if(overlay){
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
    }
  }

  function esc(s){
    return h().escHtml?h().escHtml(String(s||'')):String(s||'');
  }

  function closeModal(){
    var overlay=$('testOverlay');
    try{
      if(global.OneToneMappingRecording&&global.OneToneMappingRecording.mode
        &&global.OneToneMappingRecording.mode()!=='none'&&global.OneToneMappingRecording.cancelDraftOrRecording){
        global.OneToneMappingRecording.cancelDraftOrRecording();
      }
    }catch(_){}
    resetState();
    resetWizardState();
    clearTriggerVerify();
    if(activationTestCallback){
      activationTestCallback=null;
    }
    if(triggerVerifyCallback){
      triggerVerifyCallback=null;
    }
    setViewMode('send');
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    renderSendButton();
    modalMappingId=null;
  }

  function resolveTarget(forMappingId){
    var hooks=h();
    var state=global.OneToneState.state;
    hooks.ensureConfig();
    hooks.flushAllEditorToMappings();
    function pick(m){
      if(!m) return null;
      var key=hooks.editorTargetForMapping(m);
      if(!key) return null;
      return {mappingId:m.id,targetKey:key};
    }
    if(forMappingId){
      return pick(hooks.mappingById(forMappingId));
    }
    if(state.selectedMappingId){
      var picked=pick(hooks.mappingById(state.selectedMappingId));
      if(picked) return picked;
    }
    var enabled=hooks.sortedMappings().find(function(m){ return m.enabled&&hooks.editorTargetForMapping(m); });
    if(enabled) return pick(enabled);
    var any=hooks.sortedMappings().find(function(m){ return hooks.editorTargetForMapping(m); });
    if(any) return pick(any);
    return pick(hooks.selectedMapping());
  }

  function effectiveTargetKey(mappingId, key){
    var hooks=h();
    var k=String(key||'').trim();
    if(k) return k;
    return hooks.editorTargetForMapping(hooks.mappingById(mappingId));
  }

  function mappingLabelForTest(mappingId){
    var hooks=h();
    var m=hooks.mappingById(mappingId);
    if(!m) return '';
    var trig=hooks.editorTriggerForMapping(m);
    var tgt=hooks.editorTargetForMapping(m);
    if(trig&&tgt) return m.label||hooks.friendlyPair(trig,tgt,m);
    if(m.label) return m.label;
    return hooks.friendlyPair(trig,tgt,m);
  }

  function buildChecks(mappingId, targetKey, checkSendState){
    var hooks=h();
    var state=global.OneToneState.state;
    var runtime=global.OneToneState.runtime;
    var t=hooks.t;
    var checks=[];
    var resolvedKey=effectiveTargetKey(mappingId,targetKey);
    var m=mappingId?state.config.mappings.find(function(x){ return x.id===mappingId; }):null;
    if(runtime.paused){
      checks.push({state:'fail',title:t('testCheckListen'),detail:t('testCheckListenFail')});
    }else if(global.OneToneMappingRecording.mode()!=='none'){
      checks.push({state:'fail',title:t('testCheckListen'),detail:t('testReasonRecording')});
    }else{
      checks.push({state:'ok',title:t('testCheckListen'),detail:t('testCheckListenOk')});
    }
    if(!resolvedKey){
      checks.push({state:'fail',title:t('testCheckTarget'),detail:t('testCheckTargetFail')});
    }else{
      checks.push({state:'ok',title:t('testCheckTarget'),detail:t('testCheckTargetOk').replace('{key}',hooks.friendlyKeyName(resolvedKey))});
    }
    if(m){
      var name=mappingLabelForTest(mappingId);
      if(m.enabled){
        checks.push({state:'ok',title:t('testCheckMapping'),detail:t('testCheckMappingOk').replace('{name}',name)});
      }else{
        checks.push({state:'warn',title:t('testCheckMapping'),detail:t('testCheckMappingDisabled')});
      }
      var conflicts=hooks.conflictsForMapping(mappingId);
      if(conflicts.length){
        var c=conflicts[0];
        checks.push({state:'warn',title:t('testCheckConflict'),detail:t('testCheckConflictWarn').replace('{key}',hooks.mappingTargetKey(hooks.otherIdInConflict(c,mappingId)))});
      }else{
        checks.push({state:'ok',title:t('testCheckConflict'),detail:t('testCheckConflictOk')});
      }
    }
    if(checkSendState==='pending'){
      checks.push({state:'pending',title:t('testCheckSend'),detail:t('testCheckSendPending')});
    }else if(checkSendState==='ok'){
      checks.push({state:'ok',title:t('testCheckSend'),detail:t('testCheckSendOk')});
    }else if(checkSendState==='fail'){
      checks.push({state:'fail',title:t('testCheckSend'),detail:t('testCheckSendFail')});
    }else if(checkSendState==='timeout'){
      checks.push({state:'fail',title:t('testCheckSend'),detail:t('testCheckSendTimeout')});
    }
    return checks;
  }

  function renderChecks(checks){
    var list=$('testCheckList');
    if(!list) return;
    list.innerHTML=checks.map(function(c){
      var mark=c.state==='ok'?'✓':c.state==='warn'?'!':c.state==='pending'?'…':'×';
      return '<li class="test-check-item is-'+c.state+'"><span class="test-check-mark">'+mark+'</span><div class="test-check-body"><b>'+c.title+'</b><span>'+c.detail+'</span></div></li>';
    }).join('');
  }

  function setModalView(mode, data){
    var hooks=h();
    var t=hooks.t;
    var overlay=$('testOverlay');
    var icon=$('testStatusIcon');
    var title=$('testModalTitle');
    var summary=$('testModalSummary');
    var hint=$('testModalHint');
    if(!overlay||!icon||!title||!summary||!hint) return;
    setViewMode('send');
    openOverlay();
    (function syncWizardEntry(){
      var btn=$('btnTestWizardOpen');
      if(!btn) return;
      btn.textContent=t('testWizardOpenBtn');
      var state=global.OneToneState.state;
      var m=state&&state.selectedMappingId?hooks.mappingById(state.selectedMappingId):hooks.selectedMapping&&hooks.selectedMapping();
      var trig=m?hooks.editorTriggerForMapping(m):'';
      var tgt=m?hooks.editorTargetForMapping(m):'';
      var ready=!!(String(trig||'').trim()&&String(tgt||'').trim());
      btn.disabled=!ready;
      btn.title=ready?'':t('testWizardOpenDisabled');
    })();
    icon.className='test-status-icon';
    hint.hidden=true;
    hint.innerHTML='';
    if(mode==='sending'){
      icon.classList.add('is-sending');
      icon.textContent='…';
      title.textContent=t('testModalSendingTitle');
      summary.textContent=t('testModalSendingSummary');
      renderChecks(buildChecks(data.mappingId,data.targetKey,'pending'));
      return;
    }
    if(mode==='ok'){
      icon.classList.add('is-ok');
      icon.textContent='✓';
      title.textContent=t('testModalOkTitle');
      summary.innerHTML=t('testModalOkSummary').replace('{key}',hooks.friendlyKeyName(data.key||''));
      hint.hidden=false;
      hint.innerHTML=t('testModalOkHint');
      renderChecks(buildChecks(data.mappingId,data.key||data.targetKey,'ok'));
      return;
    }
    icon.classList.add('is-fail');
    icon.textContent='×';
    if(mode==='timeout'){
      title.textContent=t('testModalTimeoutTitle');
      summary.textContent=t('testModalTimeoutSummary');
      renderChecks(buildChecks(data.mappingId,data.targetKey,'timeout'));
      return;
    }
    title.textContent=t('testModalFailTitle');
    summary.textContent=data.summary||t('testFailed');
    if(data.hint){
      hint.hidden=false;
      hint.innerHTML=data.hint;
    }
    renderChecks(data.checks||buildChecks(data.mappingId,data.targetKey,'fail'));
  }

  function failSummary(reason){
    var t=h().t;
    if(reason==='paused') return t('testCheckListenFail');
    if(reason==='recording') return t('testReasonRecording');
    if(reason==='no_target') return t('testCheckTargetFail');
    if(reason==='invalid_key') return t('testCheckTargetInvalid');
    if(reason==='send_failed') return t('testCheckSendFail');
    return t('testFailed');
  }

  function buildFailChecks(mappingId, targetKey, reason){
    var t=h().t;
    var checks=buildChecks(mappingId, targetKey, 'fail');
    if(reason==='invalid_key'){
      return checks.map(function(c){
        if(c.title===t('testCheckTarget')) return {state:'fail',title:c.title,detail:t('testCheckTargetInvalid')};
        return c;
      });
    }
    if(reason==='no_target'){
      return checks.map(function(c){
        if(c.title===t('testCheckTarget')) return {state:'fail',title:c.title,detail:t('testCheckTargetFail')};
        return c;
      });
    }
    return checks;
  }

  function handleResult(msg){
    var hooks=h();
    var t=hooks.t;
    clearTimeout(sendWatchdog);
    var mappingId=modalMappingId||sendMappingId;
    var targetKey=effectiveTargetKey(mappingId,msg.key||'');
    var wasSilent=activationTestSilent;
    var cb=activationTestCallback;
    var wasFooter=sendFromFooter;
    resetState();
    if(wasFooter&&msg&&msg.ok) showFooterSentBriefly();
    else renderSendButton();
    hooks.renderMappingList();
    hooks.renderHomeLiveKeyPanel(false);
    if(cb){
      activationTestCallback=null;
      activationTestSilent=false;
      cb({ok:!!msg.ok,reason:msg.reason||'',key:targetKey});
    }
    if(wasSilent) return;
    if(msg.ok){
      hooks.playSoundCue('send_success');
      setModalView('ok',{mappingId:mappingId,key:targetKey,targetKey:targetKey});
    }else{
      hooks.playSoundCue('send_fail');
      var reason=msg.reason||'send_failed';
      setModalView('fail',{
        mappingId:mappingId,
        targetKey:targetKey,
        summary:failSummary(reason),
        hint:reason==='invalid_key'||reason==='no_target'?t('testModalOkHint'):'',
        checks:buildFailChecks(mappingId,targetKey,reason)
      });
    }
  }

  function runInvoke(target, context){
    var invoke=window.__vp_invoke__;
    if(!invoke) return Promise.reject(new Error('invoke unavailable'));
    var agentWorkflow=context==='habit-agent-workflow-test';
    return invoke('cmd_test_send',window.__vp_tauri_args__({
      mapping_id:target.mappingId||null,
      target_key:target.targetKey||null,
      agent_workflow:agentWorkflow
    }));
  }

  function renderSendButton(){
    var hooks=h();
    var t=hooks.t;
    var btn=$('btnTestSend');
    var panelUi=global.OneToneKeysPanelUi;
    if(panelUi&&panelUi.renderTestProgress){
      if(sendState==='sending'&&sendFromFooter) panelUi.renderTestProgress('sending');
      else if(sendState==='sent'&&sendFromFooter) panelUi.renderTestProgress('');
      else if(sendState==='idle') panelUi.renderTestProgress('');
    }
    if(!btn) return;
    var rowSending=sendState==='sending'&&!sendFromFooter;
    btn.classList.toggle('sending',sendState==='sending'&&sendFromFooter);
    if(sendState==='sending'&&sendFromFooter){
      btn.disabled=true;
      btn.textContent=t('testSending');
      return;
    }
    if(sendState==='sent'&&sendFromFooter){
      btn.disabled=false;
      btn.textContent=t('testSent');
      return;
    }
    if(rowSending){
      btn.disabled=false;
    }
    var target=resolveTarget(null);
    if(!target){
      btn.disabled=true;
      btn.textContent=t('testSendDisabled');
      return;
    }
    btn.disabled=false;
    btn.textContent=t('testSendTarget');
  }

  function mappingById(mappingId){
    return mappingId?h().mappingById(mappingId):null;
  }

  function wizardMapping(){
    return wizardState?mappingById(wizardState.mappingId):null;
  }

  function wizardModeLabel(styleId){
    var t=h().t;
    if(styleId==='hold') return t('homeTestPickHoldTitle');
    if(styleId==='double') return t('homeTestPickDoubleTitle');
    return t('homeTestPickTapTitle');
  }

  function applyWizardMode(styleId){
    var hooks=h();
    var m=wizardMapping();
    if(!m) return false;
    var mode=styleId==='hold'?'longpress':(styleId==='double'?'double':'tap');
    m.triggerMode=mode;
    m.cancelEnabled=styleId==='hold'?false:true;
    m.autoEnterEnabled=styleId==='hold'?false:true;
    if(hooks.save) hooks.save();
    if(hooks.render) hooks.render();
    return true;
  }

  function updateWizardSteps(){
    var host=$('testWizardSteps');
    if(!host||!wizardState) return;
    host.querySelectorAll('.test-wizard-step').forEach(function(el){
      var step=Number(el.getAttribute('data-step')||'0');
      el.classList.toggle('is-active',step===wizardState.step);
    });
  }

  function renderWizardStep1(){
    var t=h().t;
    var m=wizardMapping();
    var trig=(m&&h().friendlyKeyName(h().editorTriggerForMapping(m)||m.triggerKey||''))||t('triggerPlaceholder');
    var tgt=(m&&h().friendlyKeyName(h().editorTargetForMapping(m)||m.targetKey||''))||t('targetPlaceholder');
    var triggerKey=$('testWizardTriggerKey');
    var targetKey=$('testWizardTargetKey');
    var status=$('testWizardRecordStatus');
    var btnNext=$('btnTestWizardToStep2');
    if(triggerKey) triggerKey.textContent=trig||t('triggerPlaceholder');
    if(targetKey) targetKey.textContent=tgt||t('targetPlaceholder');
    var done=!!(m&&h().editorTriggerForMapping(m)&&h().editorTargetForMapping(m));
    if(status){
      if(global.OneToneMappingRecording&&global.OneToneMappingRecording.mode&&global.OneToneMappingRecording.mode()==='trigger'){
        status.textContent=t('logStartTrigger');
      }else if(global.OneToneMappingRecording&&global.OneToneMappingRecording.mode&&global.OneToneMappingRecording.mode()==='target'){
        status.textContent=t('logStartTarget');
      }else{
        status.textContent=t(done?'testWizardRecordDone':'testWizardRecordIdle');
      }
    }
    if(btnNext) btnNext.disabled=!done;
  }

  function renderWizardStep2(){
    var t=h().t;
    var grid=$('testWizardModeGrid');
    var status=$('testWizardModeStatus');
    var btnNext=$('btnTestWizardToStep3');
    if(!grid||!wizardState) return;
    var selected=wizardState.triggerMode||'tap';
    grid.innerHTML=wizardModes.map(function(id){
      var sel=id===selected;
      var modeClass=id==='hold'?'hold':(id==='double'?'double':'tap');
      return '<button type="button" class="template-pick-card'+(sel?' is-selected':'')+'" data-test-wizard-mode="'+esc(id)+'" aria-pressed="'+(sel?'true':'false')+'">'
        +'<div class="template-pick-card-anim template-pick-card-anim--'+esc(modeClass)+'" aria-hidden="true"><div class="tp-demo"><div class="tp-key">Alt</div>'+(id==='hold'?'<div class="tp-wave-hold"><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div></div><div class="tp-hold-bar"><div class="tp-hold-bar-fill"></div></div>':id==='double'?'<div class="tp-double-count">×2</div>':'<div class="tp-tap-wave"><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div></div>')+'</div></div>'
        +'<b>'+esc(wizardModeLabel(id))+'</b>'
        +'<span class="template-pick-desc">'+esc(id==='hold'?t('homeTestPickHoldDesc'):id==='double'?t('homeTestPickDoubleDesc'):t('homeTestPickTapDesc'))+'</span>'
        +'</button>';
    }).join('');
    if(status) status.textContent=t('testWizardModeIdle');
    if(btnNext) btnNext.disabled=!selected;
  }

  function renderWizardStep3(){
    var t=h().t;
    var m=wizardMapping();
    var verifyKey=$('testWizardVerifyKey');
    var note=$('testWizardVerifyNote');
    var status=$('testWizardVerifyStatus');
    if(verifyKey) verifyKey.textContent=(m&&h().friendlyKeyName(h().editorTriggerForMapping(m)||m.triggerKey||''))||'—';
    if(note) note.textContent=t('testWizardVerifyIdle');
    if(status) status.textContent=wizardState&&wizardState.verifyMessage?wizardState.verifyMessage:t('testWizardVerifyIdle');
  }

  function renderWizard(){
    var t=h().t;
    if(!wizardState) return;
    setViewMode('wizard');
    openOverlay();
    if($('testWizardTitle')) $('testWizardTitle').textContent=t('testWizardTitle');
    if($('testWizardDesc')) $('testWizardDesc').textContent=t('testWizardDesc');
    if($('testWizardStep1Title')) $('testWizardStep1Title').textContent=t('testWizardStep1Title');
    if($('testWizardStep2Title')) $('testWizardStep2Title').textContent=t('testWizardStep2Title');
    if($('testWizardStep3Title')) $('testWizardStep3Title').textContent=t('testWizardStep3Title');
    if($('testWizardTriggerTitle')) $('testWizardTriggerTitle').textContent=t('testWizardTriggerTitle');
    if($('testWizardTriggerHint')) $('testWizardTriggerHint').textContent=t('testWizardTriggerHint');
    if($('testWizardTargetTitle')) $('testWizardTargetTitle').textContent=t('testWizardTargetTitle');
    if($('testWizardTargetHint')) $('testWizardTargetHint').textContent=t('testWizardTargetHint');
    if($('btnTestWizardToStep2')) $('btnTestWizardToStep2').textContent=t('testWizardBtnNext');
    if($('btnTestWizardBackTo1')) $('btnTestWizardBackTo1').textContent=t('testWizardBtnBack');
    if($('btnTestWizardToStep3')) $('btnTestWizardToStep3').textContent=t('testWizardBtnVerify');
    if($('btnTestWizardBackTo2')) $('btnTestWizardBackTo2').textContent=t('testWizardBtnBack');
    if($('btnTestWizardRetry')) $('btnTestWizardRetry').textContent=t('testWizardBtnRetry');
    if($('testWizardStep1')) $('testWizardStep1').hidden=wizardState.step!==1;
    if($('testWizardStep2')) $('testWizardStep2').hidden=wizardState.step!==2;
    if($('testWizardStep3')) $('testWizardStep3').hidden=wizardState.step!==3;
    updateWizardSteps();
    renderWizardStep1();
    renderWizardStep2();
    renderWizardStep3();
  }

  function startWizardPolling(){
    clearTimeout(wizardPollTimer);
    if(!wizardState) return;
    wizardPollTimer=setTimeout(function tick(){
      if(!wizardState) return;
      renderWizard();
      wizardPollTimer=setTimeout(tick,300);
    },300);
  }

  function openWizard(mappingId, context){
    var hooks=h();
    var m=mappingById(mappingId);
    if(!m) return false;
    resetWizardState();
    wizardState={
      mappingId:mappingId,
      context:String(context||'manual-wizard'),
      step:1,
      triggerMode:(String(m.triggerMode||'tap').toLowerCase()==='double'?'double':(String(m.triggerMode||'tap').toLowerCase()==='longpress'?'hold':'tap')),
      listener:null,
      timeoutId:0,
      verifyMessage:''
    };
    if(hooks.toast) hooks.toast(hooks.t('testWizardTitle'));
    renderWizard();
    startWizardPolling();
    return true;
  }

  function setWizardVerifyMessage(key){
    if(!wizardState) return;
    wizardState.verifyMessage=h().t(key);
    renderWizardStep3();
  }

  function setWizardVerifyText(text){
    if(!wizardState) return;
    wizardState.verifyMessage=String(text||'');
    renderWizardStep3();
  }

  function wizardFailText(reason){
    var t=h().t;
    reason=String(reason||'').trim();
    if(reason==='paused') return t('testCheckListenFail');
    if(reason==='recording') return t('testReasonRecording');
    if(reason==='no_target') return t('testCheckTargetFail');
    if(reason==='invalid_key') return t('testCheckTargetInvalid');
    if(reason==='send_failed') return t('testCheckSendFail');
    return t('testWizardVerifyFail');
  }

  function waitMappingEnableAck(mappingId, done){
    var edit=global.OneToneMappingEditActions;
    var hooks=h();
    var startAt=Date.now();
    function tick(){
      if(!wizardState||wizardState.mappingId!==mappingId) return;
      var pending=!!(edit&&edit.hasPendingEnable&&edit.hasPendingEnable(mappingId));
      var m=hooks.mappingById?hooks.mappingById(mappingId):null;
      if(!pending && m && m.enabled){
        done(true);
        return;
      }
      if(Date.now()-startAt>4500){
        done(false);
        return;
      }
      setTimeout(tick,120);
    }
    tick();
  }

  function startWizardVerify(){
    var m=wizardMapping();
    if(!wizardState||!m) return;
    clearWizardListener();
    clearWizardTimers();
    wizardState.step=3;
    setViewMode('wizard');
    openOverlay();
    setWizardVerifyMessage('testWizardVerifyListening');
    wizardState.listener=function(msg){
      if(!wizardState||String(msg&&msg.mappingId||'')!==String(wizardState.mappingId||'')) return;
      clearWizardTimers();
      clearWizardListener();
      if(msg&&msg.ok){
        setWizardVerifyText(h().t('testWizardVerifySuccess')+'（正在启用…）');
        waitMappingEnableAck(wizardState.mappingId,function(ok){
          if(!wizardState) return;
          if(ok){
            setWizardVerifyMessage('testWizardVerifySuccess');
            if(h().toast) h().toast(h().t('testWizardVerifySuccess'));
            setTimeout(function(){ closeModal(); },900);
          }else{
            setWizardVerifyText(h().t('testWizardVerifySuccess')+'（启用确认超时，但已写入配置）');
            setTimeout(function(){ closeModal(); },1200);
          }
        });
      }else{
        setWizardVerifyText(wizardFailText(msg&&msg.reason));
      }
    };
    if(global.OneToneApp&&global.OneToneApp.on){
      global.OneToneApp.on('trigger_test_fired',wizardState.listener);
    }
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(wizardState.mappingId,true);
    }else{
      m.enabled=true;
      if(h().save) h().save();
    }
    wizardState.timeoutId=setTimeout(function(){
      if(!wizardState) return;
      clearWizardListener();
      setWizardVerifyMessage('testWizardVerifyFail');
    },10000);
    renderWizard();
  }

  function handleWizardAction(action, value){
    if(!wizardState) return;
    if(action==='record-trigger'){
      if(global.OneToneMappingRecording){
        global.OneToneMappingRecording.setSuppressAutoEnableOnce&&global.OneToneMappingRecording.setSuppressAutoEnableOnce(true);
        global.OneToneMappingRecording.startTrigger&&global.OneToneMappingRecording.startTrigger(wizardState.mappingId);
      }
      return;
    }
    if(action==='record-target'){
      if(global.OneToneMappingRecording){
        global.OneToneMappingRecording.setSuppressAutoEnableOnce&&global.OneToneMappingRecording.setSuppressAutoEnableOnce(true);
        global.OneToneMappingRecording.startTarget&&global.OneToneMappingRecording.startTarget(wizardState.mappingId);
      }
      return;
    }
    if(action==='to-step-2'){
      var m=wizardMapping();
      if(m&&h().editorTriggerForMapping(m)&&h().editorTargetForMapping(m)){
        wizardState.step=2;
        renderWizard();
      }
      return;
    }
    if(action==='back-1'){
      wizardState.step=1;
      renderWizard();
      return;
    }
    if(action==='back-2'){
      clearWizardListener();
      clearWizardTimers();
      wizardState.step=2;
      renderWizard();
      return;
    }
    if(action==='select-mode'){
      wizardState.triggerMode=String(value||'tap');
      renderWizardStep2();
      return;
    }
    if(action==='to-step-3'){
      if(applyWizardMode(wizardState.triggerMode)){
        wizardState.step=3;
        wizardState.verifyMessage=h().t('testWizardVerifyIdle');
        renderWizard();
      }
      return;
    }
    if(action==='retry-verify'){
      startWizardVerify();
    }
  }

  function clearTriggerVerify(){
    clearTimeout(triggerVerifyTimeout);
    triggerVerifyTimeout=0;
    if(triggerVerifyListener&&global.OneToneApp&&global.OneToneApp.off){
      global.OneToneApp.off('trigger_test_fired',triggerVerifyListener);
    }
    triggerVerifyListener=null;
  }

  function finishTriggerVerify(msg){
    var hooks=h();
    var t=hooks.t;
    var mappingId=modalMappingId;
    clearTriggerVerify();
    var ok=!!(msg&&msg.ok);
    if(ok){
      hooks.playSoundCue('send_success');
      setModalView('ok',{
        mappingId:mappingId,
        key:hooks.editorTriggerForMapping(hooks.mappingById(mappingId)),
        targetKey:''
      });
    }else{
      hooks.playSoundCue('send_fail');
      setModalView('fail',{
        mappingId:mappingId,
        targetKey:'',
        summary:wizardFailText(msg&&msg.reason),
        checks:buildChecks(mappingId,'','fail')
      });
    }
    if(triggerVerifyCallback){
      var cb=triggerVerifyCallback;
      triggerVerifyCallback=null;
      cb({ok:ok,reason:msg&&msg.reason||''});
    }
  }

  function startHabitTriggerVerify(forMappingId, onResult){
    var hooks=h();
    var t=hooks.t;
    var m=hooks.mappingById(forMappingId);
    if(!m){
      if(typeof onResult==='function') onResult({ok:false,reason:'no_mapping'});
      return;
    }
    clearTriggerVerify();
    triggerVerifyCallback=typeof onResult==='function'?onResult:null;
    modalMappingId=forMappingId;
    setViewMode('send');
    openOverlay();
    var overlay=$('testOverlay');
    var icon=$('testStatusIcon');
    var title=$('testModalTitle');
    var summary=$('testModalSummary');
    if(icon&&title&&summary){
      icon.className='test-status-icon is-sending';
      icon.textContent='…';
      title.textContent=t('habitSetupTriggerTestTitle');
      summary.textContent=t('habitSetupTriggerTestSummary');
    }
    renderChecks(buildChecks(forMappingId,'','pending'));
    triggerVerifyListener=function(msg){
      if(String(msg&&msg.mappingId||'')!==String(forMappingId||'')) return;
      finishTriggerVerify(msg||{ok:false,reason:'timeout'});
    };
    if(global.OneToneApp&&global.OneToneApp.on){
      global.OneToneApp.on('trigger_test_fired',triggerVerifyListener);
    }
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(forMappingId,true);
    }else{
      m.enabled=true;
      if(hooks.save) hooks.save();
    }
    triggerVerifyTimeout=setTimeout(function(){
      if(!triggerVerifyListener) return;
      finishTriggerVerify({ok:false,reason:'timeout'});
    },10000);
  }

  function failActivationTest(reason, mappingId, targetKey){
    if(!activationTestCallback) return false;
    var cb=activationTestCallback;
    var wasSilent=activationTestSilent;
    activationTestCallback=null;
    activationTestSilent=false;
    if(!wasSilent){
      var hooks=h();
      var t=hooks.t;
      openOverlay();
      setModalView('fail',{
        mappingId:mappingId||'',
        targetKey:targetKey||'',
        summary:failSummary(reason||'send_failed'),
        hint:reason==='invalid_key'||reason==='no_target'?t('testModalOkHint'):'',
        checks:buildFailChecks(mappingId||'',targetKey||'',reason||'send_failed')
      });
    }
    cb({ok:false,reason:reason||'send_failed',key:targetKey||''});
    return true;
  }

  function fire(forMappingId, opts){
    var hooks=h();
    var state=global.OneToneState.state;
    var runtime=global.OneToneState.runtime;
    var t=hooks.t;
    var context=opts&&opts.context?String(opts.context):'send';
    if(context==='habit-trigger-test'){
      startHabitTriggerVerify(forMappingId||state.selectedMappingId||'',opts&&opts.onResult);
      return;
    }
    if(sendState==='sent'){
      resetState();
      renderSendButton();
    }
    if(context==='habit-activation-test'||context==='habit-agent-workflow-test'){
      activationTestCallback=opts&&typeof opts.onResult==='function'?opts.onResult:null;
      activationTestSilent=!!(opts&&opts.silent);
    }else{
      activationTestCallback=null;
      activationTestSilent=false;
      if(context!=='send'){
        var wizardId=forMappingId||state.selectedMappingId||'';
        if(openWizard(wizardId,context)) return;
      }
    }
    var target=resolveTarget(forMappingId||null);
    if(sendState==='sending'){
      if(activationTestCallback) failActivationTest('busy',forMappingId||'','');
      return;
    }
    if(!target){
      modalMappingId=forMappingId||state.selectedMappingId||'';
      if(activationTestCallback){
        failActivationTest('no_target',modalMappingId,'');
        return;
      }
      setModalView('fail',{
        mappingId:modalMappingId,
        targetKey:'',
        summary:t('testCheckTargetFail'),
        hint:t('testModalOkHint'),
        checks:buildFailChecks(modalMappingId,'','no_target')
      });
      return;
    }
    if(runtime.paused){
      modalMappingId=target.mappingId;
      if(activationTestCallback){
        failActivationTest('paused',target.mappingId,target.targetKey);
        return;
      }
      setModalView('fail',{
        mappingId:target.mappingId,
        targetKey:target.targetKey,
        summary:t('testCheckListenFail'),
        checks:buildFailChecks(target.mappingId,target.targetKey,'paused')
      });
      return;
    }
    if(global.OneToneMappingRecording.mode()!=='none'){
      if(activationTestCallback) return;
      modalMappingId=target.mappingId;
      setModalView('fail',{
        mappingId:target.mappingId,
        targetKey:target.targetKey,
        summary:t('testReasonRecording'),
        checks:buildFailChecks(target.mappingId,target.targetKey,'recording')
      });
      return;
    }
    sendState='sending';
    sendMappingId=target.mappingId;
    modalMappingId=target.mappingId;
    sendFromFooter=!forMappingId;
    if(!activationTestSilent){
      setModalView('sending',{mappingId:target.mappingId,targetKey:target.targetKey});
    }
    clearTimeout(sendWatchdog);
    sendWatchdog=setTimeout(function(){
      if(sendState==='sending'){
        resetState();
        renderSendButton();
        hooks.renderMappingList();
        if(activationTestCallback){
          failActivationTest('timeout',modalMappingId,target.targetKey);
          return;
        }
        setModalView('timeout',{mappingId:modalMappingId,targetKey:target.targetKey});
      }
    },8000);
    renderSendButton();
    hooks.renderMappingList();
    hooks.renderHomeLiveKeyPanel(false);
    if(!window.__vp_invoke__){
      resetState();
      renderSendButton();
      hooks.renderMappingList();
      if(activationTestCallback){
        failActivationTest('send_failed',target.mappingId,target.targetKey);
        return;
      }
      setModalView('fail',{
        mappingId:target.mappingId,
        targetKey:target.targetKey,
        summary:t('testCheckSendFail'),
        checks:buildFailChecks(target.mappingId,target.targetKey,'send_failed')
      });
      return;
    }
    runInvoke(target,context)
      .then(function(msg){
        if(sendState!=='sending') return;
        handleResult(msg&&typeof msg==='object'?msg:{ok:false,reason:'send_failed'});
      })
      .catch(function(err){
        if(sendState!=='sending') return;
        resetState();
        renderSendButton();
        hooks.renderMappingList();
        var detail=err&&(err.message||String(err))||'';
        setModalView('fail',{
          mappingId:target.mappingId,
          targetKey:target.targetKey,
          summary:t('testCheckSendFail'),
          hint:detail?(''+detail):'',
          checks:buildFailChecks(target.mappingId,target.targetKey,'send_failed')
        });
      });
  }

  global.OneToneMappingTestSend={
    fire:fire,
    openWizard:openWizard,
    handleWizardAction:handleWizardAction,
    closeModal:closeModal,
    handleResult:handleResult,
    renderSendButton:renderSendButton,
    sendState:function(){ return sendState; },
    sendMappingId:function(){ return sendMappingId; }
  };
})((typeof window!=='undefined')?window:globalThis);
