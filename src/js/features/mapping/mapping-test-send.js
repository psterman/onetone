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

  function resetState(){
    clearTimeout(sendTimer);
    clearTimeout(sendWatchdog);
    sendState='idle';
    sendMappingId=null;
    sendFromFooter=false;
  }

  function closeModal(){
    var overlay=$('testOverlay');
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
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
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
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
    resetState();
    renderSendButton();
    hooks.renderMappingList();
    hooks.renderHomeLiveKeyPanel(false);
    if(msg.ok){
      hooks.playSoundCue('send_success');
      setModalView('ok',{mappingId:mappingId,key:targetKey,targetKey:targetKey});
      return;
    }
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

  function runInvoke(target){
    var invoke=window.__vp_invoke__;
    if(!invoke) return Promise.reject(new Error('invoke unavailable'));
    return invoke('cmd_test_send',window.__vp_tauri_args__({
      mapping_id:target.mappingId||null,
      target_key:target.targetKey||null
    }));
  }

  function renderSendButton(){
    var hooks=h();
    var t=hooks.t;
    var btn=$('btnTestSend');
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

  function fire(forMappingId){
    var hooks=h();
    var state=global.OneToneState.state;
    var runtime=global.OneToneState.runtime;
    var t=hooks.t;
    var target=resolveTarget(forMappingId||null);
    if(sendState==='sending') return;
    if(!target){
      modalMappingId=forMappingId||state.selectedMappingId||'';
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
      setModalView('fail',{
        mappingId:target.mappingId,
        targetKey:target.targetKey,
        summary:t('testCheckListenFail'),
        checks:buildFailChecks(target.mappingId,target.targetKey,'paused')
      });
      return;
    }
    if(global.OneToneMappingRecording.mode()!=='none'){
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
    setModalView('sending',{mappingId:target.mappingId,targetKey:target.targetKey});
    clearTimeout(sendWatchdog);
    sendWatchdog=setTimeout(function(){
      if(sendState==='sending'){
        resetState();
        renderSendButton();
        hooks.renderMappingList();
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
      setModalView('fail',{
        mappingId:target.mappingId,
        targetKey:target.targetKey,
        summary:t('testCheckSendFail'),
        checks:buildFailChecks(target.mappingId,target.targetKey,'send_failed')
      });
      return;
    }
    runInvoke(target)
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
    closeModal:closeModal,
    handleResult:handleResult,
    renderSendButton:renderSendButton,
    sendState:function(){ return sendState; },
    sendMappingId:function(){ return sendMappingId; }
  };
})((typeof window!=='undefined')?window:globalThis);
