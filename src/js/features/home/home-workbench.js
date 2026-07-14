(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;

  function openSettings(opts){
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.open(opts||{panel:'basic'});
  }

  function triggerModeLabel(m){
    var raw=m&&m.triggerMode!=null?String(m.triggerMode||'').toLowerCase():'tap';
    if(raw==='double') return t('homeWbModeDouble');
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return t('homeWbModeHold');
    return t('homeWbModeTap');
  }

  function buildVoiceModeLabel(vm){
    var summary=vm.summary||{};
    if(summary.engine==='off') return t('homeWbVoiceOff');
    if(summary.statusMode==='error'||vm.engineStatus===t('homeV9EngineOffline')){
      return t('homeWbVoiceOffline');
    }
    if(summary.engine==='sapi'){
      var sapiSuffix=summary.statusMode==='listening'?t('homeWbVoiceWaitingWake'):t('homeWbVoiceReady');
      return t('homeWbVoiceSystem')+' · '+sapiSuffix;
    }
    var base=vm.engineLine||'';
    var split=base.indexOf(' · ');
    if(split>=0) base=base.slice(0,split);
    var suffix=summary.statusMode==='listening'?t('homeWbVoiceWaitingWake'):t('homeWbVoiceReady');
    return base+' · '+suffix;
  }

  function isMicUnavailable(vm){
    if(!vm.summary||vm.summary.loading||vm.summary.engine==='off') return false;
    var micApi=global.OneToneAppMic;
    if(micApi&&typeof micApi.listLoaded==='function'&&!micApi.listLoaded()) return false;
    var devices=micApi&&micApi.devices?micApi.devices():[];
    if(!devices||!devices.length) return true;
    var label=vm.micLabel||'';
    return label===t('homeLiveMicUnknown')||label===t('homeLiveMicUnset');
  }

  function buildAlertInput(vm){
    var summary=Object.assign({},vm.summary||{});
    summary.micUnavailable=isMicUnavailable(vm);
    summary.engineOffline=summary.statusMode==='error'&&summary.engine!=='off';
    return {
      paused:!!(vm.runtime&&vm.runtime.paused),
      summary:summary,
      compatSnapshot:vm.compatSnapshot||{},
      triggerMode:vm.m&&vm.m.triggerMode?vm.m.triggerMode:'tap',
      recentEvents:(vm.runtime&&vm.runtime.events)||[],
      homeStatusMode:vm.hs&&vm.hs.statusMode?vm.hs.statusMode:'idle',
      nowMs:Date.now()
    };
  }

  function alertActionLabel(action){
    if(!action) return '';
    if(action.type==='resumeListening') return t('homeWbAlertActionResume');
    if(action.type==='openSettings'){
      if(action.panel==='voiceWake') return t('homeWbAlertActionVoice');
      if(action.panel==='keys') return t('homeWbAlertActionKeys');
      if(action.panel==='debug') return t('homeWbAlertActionRuntime');
    }
    return '';
  }

  function handleAlertAction(action){
    if(!action) return;
    if(action.type==='resumeListening'){
      if(global.OneToneIpc) global.OneToneIpc.invoke('cmd_resume',{}).catch(function(){});
      return;
    }
    if(action.type==='openSettings'){
      var opts={panel:action.panel||'basic'};
      if(action.focus) opts.focus=action.focus;
      if(action.debugMode) opts.debugMode=action.debugMode;
      openSettings(opts);
    }
  }

  function alertSeverity(kind){
    if(kind==='recognition_error'||kind==='send_failed'||kind==='mic_unavailable') return 'is-error';
    return 'is-warn';
  }

  function renderAlerts(vm){
    var host=$('wbHomeAlerts');
    if(!host) return;
    var alertsApi=global.OneToneHomeWorkbenchAlerts;
    var alert=alertsApi&&alertsApi.pickPrimaryAlert?alertsApi.pickPrimaryAlert(buildAlertInput(vm)):null;
    if(!alert){
      host.hidden=true;
      host.innerHTML='';
      host._lastAlertAction=null;
      return;
    }
    host.hidden=false;
    host.className='wb-home-alert '+alertSeverity(alert.kind);
    host._lastAlertAction=alert.action||null;
    host.innerHTML=
      '<span class="wb-home-alert-text">'+esc(t(alert.textKey))+'</span>'
      +'<button type="button" class="wb-home-alert-action" data-wb-alert-action="1">'
      +esc(alertActionLabel(alert.action))+'</button>';
  }

  function renderFinishSummary(vm){
    var host=$('wbFinishSummary');
    if(!host) return;
    var parts=[t('homeWbFinishTitle'),vm.finishText||t('homeLiveUnset')];
    if(vm.cancelDelaySec){
      parts.push(t('homeV9TraySilence').replace('{sec}',vm.cancelDelaySec));
    }
    if(vm.endPhraseLine&&vm.endPhraseLine!=='—'){
      parts.push(t('homeWbFinishEndPhrase').replace('{phrases}',vm.endPhraseLine));
    }
    host.textContent=parts.join(' · ');
  }

  function compatStatusLabel(status){
    var map={
      unknown:'homeWbDiagCompatUnknown',
      testing:'homeWbDiagCompatTesting',
      ready:'homeWbDiagCompatReady',
      partial:'homeWbDiagCompatPartial',
      unsupported:'homeWbDiagCompatUnsupported'
    };
    return t(map[String(status||'unknown')]||map.unknown);
  }

  function diagBoolLabel(on){
    return on?'✓':'—';
  }

  function renderTriggerDiagBlocks(vm){
    vm=vm||enrichViewModel(global.OneToneHomeV9.buildViewModel());
    var compat=vm.compatSnapshot||{};
    var perf=vm.perf||{};
    setText($('debugDiagCompatStatus'),compatStatusLabel(compat.status));
    setText($('debugDiagDevice'),compat.deviceLabel||compat.deviceId||'—');
    setText($('debugDiagKeydown'),diagBoolLabel(compat.sawKeydown));
    setText($('debugDiagKeyup'),diagBoolLabel(compat.sawKeyup));
    setText($('debugDiagHold'),diagBoolLabel(compat.supportsHold));
    setText($('debugDiagRelease'),diagBoolLabel(compat.supportsReleaseSend));
    setText($('debugDiagRecommended'),triggerModeLabel({triggerMode:compat.recommendedMode||'tap'}));
    var probeBtn=$('debugDiagProbeBtn');
    if(probeBtn) probeBtn.disabled=compat.status==='testing';
    setText($('debugDiagKeyLatency'),perf.keyLatency||'—');
    setText($('debugDiagRecogStatus'),perf.recogStatus||'—');
    setText($('debugDiagWakeLatency'),perf.wakeLatency||'—');
    setText($('debugDiagSendLatency'),perf.sendLatency||'—');
  }

  function renderNavSidebar(vm){
    var main=$('wbSidebarMain');
    var sub=$('wbSidebarSub');
    var dot=$('wbSidebarDot');
    if(main) main.textContent=vm.runtime.paused?t('homeWbServicePaused'):t('homeWbServiceRunning');
    if(sub){
      var listening=vm.runtime.paused?t('homeWbServicePaused'):t('homeWbSidebarListening');
      sub.textContent=listening;
    }
    if(dot) dot.classList.toggle('is-warn',!!vm.runtime.paused);
  }

  function renderOverview(vm){
    var host=$('wbStatusOverview');
    if(!host) return;
    var flow=global.OneToneInputFlowSummary?global.OneToneInputFlowSummary.compute():null;
    if(flow){
      host.innerHTML=
        '<span class="wb-status-item wb-status-item--primary"><span class="wb-status-dot '+(flow.ready?'is-ok':'is-warn')+'"></span><span>'+esc(t('homeWbStatusWork'))+'</span> <strong>'+esc(flow.naturalLine)+'</strong></span>'
        +'<span class="wb-status-item"><span class="wb-status-dot '+(flow.mic&&flow.mic.ok?'is-ok':'is-warn')+'"></span><span>'+t('homeWbStatusMic')+'</span> <strong>'+esc((flow.mic&&flow.mic.state)||'—')+'</strong></span>'
        +'<span class="wb-status-item"><span class="wb-status-dot '+(flow.conflictCount?'is-warn':'is-ok')+'"></span><span>'+t('homeWbStatusIntercept')+'</span> <strong>'+esc(flow.conflictCount?flow.conflictCount+' '+t('homeWbStatusConflict'):t('homeWbStatusInterceptOk'))+'</strong></span>';
      return;
    }
    host.innerHTML=
      '<span class="wb-status-item"><span class="wb-status-dot is-ok"></span><span>'+t('homeWbStatusEngine')+'</span> <strong>'+esc(buildVoiceModeLabel(vm))+'</strong></span>'
      +'<span class="wb-status-item"><span class="wb-status-dot is-ok"></span><span>'+t('homeWbStatusMic')+'</span> <strong>'+esc(vm.micLabel||'—')+'</strong></span>';
  }

  function triggerStatusLine(vm){
    if(vm.runtime&&vm.runtime.paused) return t('homeWbTriggerPaused');
    if(vm.vpState==='DICTATING'||vm.summary.dictating) return t('homeWbTriggerLive');
    if(vm.hs&&vm.hs.statusMode==='error') return t('homeWbTriggerError');
    return t('homeWbTriggerReady');
  }

  function triggerCardTitle(vm){
    return vm.triggerKey||t('homeLiveUnset');
  }

  function triggerMetaLine(vm){
    if(global.OneToneInputFlowSummary){
      return global.OneToneInputFlowSummary.compute().naturalLine;
    }
    var mode=triggerModeLabel(vm.m);
    var target=vm.targetLabel||'—';
    return mode+' · '+t('homeWbStepSendTo').replace('{app}',target);
  }

  function renderTriggerHero(vm){
    var hero=$('wbTriggerHero');
    var label=$('wbTriggerHeroLabel');
    var hint=$('wbTriggerHeroHint');
    if(!hero) return;
    var trig=vm.triggerKey||'';
    var unset=trig===t('homeLiveUnset')||!trig;
    if(label){
      if(unset) label.textContent='—';
      else label.textContent=trig.length>8?trig.slice(0,7)+'…':trig;
    }
    if(hint) hint.textContent=dictatingHint(vm);
    hero.setAttribute('aria-label',unset?t('homeWbTriggerHeroUnset'):trig);
  }

  function dictatingHint(vm){
    var live=vm.vpState==='DICTATING'||!!vm.summary.dictating;
    return live?t('homeWbTriggerHeroLive'):t('homeWbTriggerHeroHint');
  }

  function renderCommandCard(vm){
    var card=$('wbTriggerCard');
    if(card){
      var live=vm.vpState==='DICTATING'||!!vm.summary.dictating;
      card.classList.toggle('is-live',live);
      card.classList.toggle('is-paused',!!(vm.runtime&&vm.runtime.paused));
      card.classList.toggle('is-error',!!(vm.hs&&vm.hs.statusMode==='error'));
    }
    setText($('wbTriggerStatus'),t('homeWbTriggerLabel')+' · '+triggerStatusLine(vm));
    setText($('wbTriggerTitle'),triggerCardTitle(vm));
    setText($('wbTriggerMetaText'),triggerMetaLine(vm));
    renderTriggerHero(vm);
    renderLiveText(vm);
    var dictating=vm.vpState==='DICTATING'||!!vm.summary.dictating;
    var actions=$('wbTriggerActions');
    if(actions) actions.classList.toggle('is-dictating',dictating);
    var endBtn=$('wbBtnEnd');
    var cancelBtn=$('wbBtnCancel');
    var testBtn=$('wbBtnTestSend');
    if(endBtn){
      endBtn.disabled=!dictating;
      endBtn.textContent=dictating?t('homeWbBtnEndSend'):t('homeV9BtnEnd');
      endBtn.classList.toggle('wb-trigger-btn-filled',dictating);
      endBtn.classList.toggle('wb-trigger-btn-tonal',!dictating);
    }
    if(cancelBtn){
      cancelBtn.hidden=!dictating;
      cancelBtn.disabled=!dictating;
      if(dictating) cancelBtn.textContent=t('homeWbBtnCancel');
    }
    if(testBtn) testBtn.hidden=dictating;
    renderTriggerHero(vm);
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function setText(el,text){
    if(el) el.textContent=text||'';
  }

  function renderLiveText(vm){
    var liveEl=$('wbLiveText');
    if(!liveEl) return;
    if(vm.loading){
      liveEl.innerHTML='<div class="vp-empty">'+esc(t('homeLiveLoading'))+'</div>';
      return;
    }
    if(vm.live.placeholder){
      var hintKey=vm.live.hintKey||'homeWbLiveIdleHint';
      liveEl.innerHTML='<div class="vp-empty">'+esc(t(hintKey))+'</div>';
      return;
    }
    if(global.vp9&&global.vp9.setText){
      global.vp9.setText('#wbLiveText',vm.live.finalized,vm.live.pending);
    }else{
      liveEl.textContent=(vm.live.finalized||'')+(vm.live.pending||'');
    }
  }

  function renderQuickActions(){
    var shell=$('homeWorkbench');
    if(shell){
      shell.querySelectorAll('[data-i18n]').forEach(function(el){
        var key=el.getAttribute('data-i18n');
        if(key) el.textContent=t(key);
      });
    }
    var habitNew=$('wbHabitNew');
    if(habitNew) habitNew.textContent=t('homeWbQuickNewHabit');
  }

  function selectWorkbenchMapping(id){
    if(!id||!global.OneToneHomeScheme) return;
    global.OneToneHomeScheme.selectMapping(id);
    render();
  }

  function bindPanelActions(){
    var center=$('wbCenter');
    if(!center||center._wbPanelsBound) return;
    center._wbPanelsBound=true;
    center.addEventListener('click',function(e){
      var habit=e.target.closest&&e.target.closest('[data-wb-habit-id]');
      if(habit){
        selectWorkbenchMapping(habit.getAttribute('data-wb-habit-id')||'');
        return;
      }
      var scenario=e.target.closest&&e.target.closest('[data-wb-scenario-id]');
      if(scenario){
        selectWorkbenchMapping(scenario.getAttribute('data-wb-scenario-id')||'');
        return;
      }
      var micBtn=e.target.closest&&e.target.closest('#wbVoiceChangeMic');
      if(micBtn){
        openSettings({panel:'voiceWake',focus:'mic'});
      }
    });
  }

  var NAV_PANEL_MAP={
    habits:'schemes',
    keys:'triggers',
    voiceWake:'voice',
    models:'voice',
    sounds:'sounds',
    basic:'general',
    scenes:'schemes'
  };

  function syncNavActiveState(panel,opts){
    var nav=$('wbLeftNav');
    if(!nav) return;
    opts=opts||{};
    var ui=global.OneToneState&&global.OneToneState.ui;
    var open=!!(ui&&ui.drawerOpen);
    var activeNav='home';
    if(open){
      if(panel==='debug'){
        activeNav='runtime';
      }else if(panel==='general'){
        activeNav='maintenance';
      }else{
        activeNav=NAV_PANEL_MAP[panel||'']||'general';
      }
    }
    nav.querySelectorAll('[data-wb-nav]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-wb-nav')===activeNav);
    });
  }

  function eventTs(evt){
    return Number(evt&&(evt.tsMs||evt.ts_ms))||0;
  }

  function formatMs(ms){
    if(!(ms>0)) return '—';
    if(ms<1000) return Math.round(ms)+' ms';
    return (ms/1000).toFixed(1)+' s';
  }

  function buildPerf(vm){
    var events=(global.OneToneState.runtime.events||[]).slice();
    var keyLatency='—';
    var sendLatency='—';
    var recogStatus=t('homeWbDiagRecogUnknown');
    var lastSessionStart=0;
    var lastSessionEnd=0;
    var lastWake=0;
    var lastBindingCapture=0;

    for(var i=events.length-1;i>=0;i--){
      var evt=events[i];
      if(!evt) continue;
      var kind=String(evt.kind||'');
      var ts=eventTs(evt);
      var payload=evt.payload&&typeof evt.payload==='object'?evt.payload:null;
      var source=String(payload&&payload.source||'').toLowerCase();

      if(!lastSessionEnd&&kind==='session_ended') lastSessionEnd=ts;
      if(!lastSessionStart&&kind==='session_started') lastSessionStart=ts;
      if(!lastWake&&kind==='voice_wake_triggered') lastWake=ts;
      if(!lastBindingCapture&&kind==='input_captured'&&source==='binding') lastBindingCapture=ts;

      if(lastSessionStart&&lastSessionEnd&&lastWake&&lastBindingCapture) break;
    }

    if(lastBindingCapture&&lastSessionStart&&lastSessionStart>=lastBindingCapture){
      keyLatency=formatMs(lastSessionStart-lastBindingCapture);
    } else if(lastWake&&lastSessionStart&&lastSessionStart>=lastWake){
      keyLatency=formatMs(lastSessionStart-lastWake);
    }

    if(lastSessionEnd){
      for(var j=events.length-1;j>=0;j--){
        var after=events[j];
        if(!after) continue;
        var afterTs=eventTs(after);
        if(afterTs<=lastSessionEnd) continue;
        var afterKind=String(after.kind||'');
        if(afterKind==='input_captured'||afterKind==='voice_send_failed'){
          sendLatency=formatMs(afterTs-lastSessionEnd);
          break;
        }
      }
    }

    if(vm.summary.engine!=='off'){
      if(vm.summary.loading) recogStatus=t('homeWbDiagRecogUnknown');
      else if(vm.summary.statusMode==='error'||vm.engineStatus===t('homeV9EngineOffline')) recogStatus=t('homeWbDiagRecogError');
      else recogStatus=t('homeWbDiagRecogOk');
    }

    return {
      keyLatency:keyLatency,
      recogStatus:recogStatus,
      wakeLatency:vm.latency||'—',
      sendLatency:sendLatency
    };
  }

  function enrichViewModel(vm){
    var runtime=global.OneToneState.runtime;
    vm.runtime=runtime;
    vm.compatSnapshot=global.OneToneHomeWorkbenchCompat
      ?global.OneToneHomeWorkbenchCompat.get(vm.m&&vm.m.id?vm.m.id:'')
      :{status:'unknown'};
    vm.perf=buildPerf(vm);
    return vm;
  }

  function render(){
    if(!global.OneToneHomeV9||!global.OneToneHomeV9.buildViewModel) return;
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.isOpen&&global.OneToneHabitTriggerSetup.isOpen()) return;
    var micApi=global.OneToneAppMic;
    if(micApi&&typeof micApi.listLoaded==='function'&&!micApi.listLoaded()&&typeof micApi.loadMicDevices==='function'){
      var bootHooks=global.__vp_bootstrap_hooks__||{};
      if(!bootHooks.uiBootstrapping||!bootHooks.uiBootstrapping()){
        micApi.loadMicDevices().catch(function(){});
      }
    }
    var vm=enrichViewModel(global.OneToneHomeV9.buildViewModel());
    if(global.vp9&&global.vp9.updateState) global.vp9.updateState(vm.vpState);
    renderNavSidebar(vm);
    renderOverview(vm);
    renderAlerts(vm);
    renderCommandCard(vm);
    renderFinishSummary(vm);
    renderQuickActions();
    if(global.OneToneHomeWorkbenchPanels){
      global.OneToneHomeWorkbenchPanels.renderAll(vm);
    }
    if(global.OneToneState&&global.OneToneState.ui){
      var ui=global.OneToneState.ui;
      if(ui.drawerOpen&&ui.settingsPanel==='debug'&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode()==='diagnostics'){
        renderTriggerDiagBlocks(vm);
      }
    }
  }

  function startCompatProbe(){
    var vm=global.OneToneHomeV9.buildViewModel();
    var mappingId=vm.m&&vm.m.id?String(vm.m.id):'';
    if(!mappingId||!global.OneToneIpc) return;
    if(global.OneToneHomeWorkbenchCompat) global.OneToneHomeWorkbenchCompat.markTesting(mappingId);
    render();
    global.OneToneIpc.invoke('cmd_start_trigger_compat_probe',{mappingId:mappingId}).catch(function(){
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('homeWbDiagProbeFailed'));
      render();
    });
  }

  function bindNav(){
    var nav=$('wbLeftNav');
    if(!nav) return;
    nav.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-wb-nav]');
      if(!btn) return;
      var action=btn.getAttribute('data-wb-nav');
      if(action==='home'){
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.close) global.OneToneSettingsDrawer.close();
        syncNavActiveState('home');
        return;
      }
      if(action==='schemes'){ openSettings({panel:'habits'}); return; }
      if(action==='triggers'){ openSettings({panel:'keys'}); return; }
      if(action==='voice'){ openSettings({panel:'voiceWake'}); return; }
      if(action==='sounds'){ openSettings({panel:'sounds'}); return; }
      if(action==='general'){ openSettings({panel:'basic'}); return; }
      if(action==='maintenance'){ openSettings({panel:'general'}); return; }
      if(action==='runtime'){ openSettings({panel:'debug', debugMode:'overview'}); return; }
    });
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    bindNav();
    bindPanelActions();
    if(global.OneToneHomeWorkbenchPanels) global.OneToneHomeWorkbenchPanels.bindOnce();
    if(global.OneToneHomeWorkbenchCmdk) global.OneToneHomeWorkbenchCmdk.bindOnce();
    var searchInput=$('wbCommandSearchInput');
    if(searchInput){
      searchInput.addEventListener('keydown',function(e){
        if(e.key==='Enter'&&(!global.OneToneHomeWorkbenchCmdk||!global.OneToneHomeWorkbenchCmdk.isOpen())) searchInput.blur();
      });
    }
    document.addEventListener('keydown',function(e){
      if((e.ctrlKey||e.metaKey)&&String(e.key||'').toLowerCase()==='k'){
        if(!$('homeWorkbench')) return;
        e.preventDefault();
        if(global.OneToneHomeWorkbenchCmdk) global.OneToneHomeWorkbenchCmdk.openPalette();
        else if(searchInput) searchInput.focus();
      }
    });
    var endBtn=$('wbBtnEnd');
    if(endBtn){
      endBtn.onclick=function(){
        var summary=global.OneToneVoiceHomeSummary.compute();
        if(summary.dictating&&global.OneToneIpc){
          global.OneToneIpc.invoke('cmd_voice_end_ui_end',{}).catch(function(){});
        }
      };
    }
    var cancelBtn=$('wbBtnCancel');
    if(cancelBtn){
      cancelBtn.onclick=function(){
        var summary=global.OneToneVoiceHomeSummary.compute();
        if(summary.dictating&&global.OneToneIpc){
          global.OneToneIpc.invoke('cmd_voice_end_ui_cancel',{}).catch(function(){});
        }
      };
    }
    var testBtn=$('wbBtnTestSend');
    if(testBtn){
      testBtn.onclick=function(){
        if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.open){
          global.OneToneHabitTriggerSetup.open();
        }
      };
    }
    var editBtn=$('wbTriggerEdit');
    if(editBtn){
      editBtn.onclick=function(){
        var vm=global.OneToneHomeV9.buildViewModel();
        var id=vm.m&&vm.m.id?vm.m.id:null;
        openSettings({panel:'keys',focus:id});
      };
    }
    var heroBtn=$('wbTriggerHero');
    if(heroBtn){
      heroBtn.onclick=function(){
        var testBtn=$('wbBtnTestSend');
        if(testBtn&&!testBtn.hidden) testBtn.click();
      };
    }
    var qNew=$('wbHabitNew');
    if(qNew) qNew.onclick=function(){ openSettings({panel:'habits',habitWizard:true}); };
    var alertsHost=$('wbHomeAlerts');
    if(alertsHost){
      alertsHost.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-wb-alert-action]');
        if(!btn) return;
        handleAlertAction(alertsHost._lastAlertAction);
      });
    }
    var probeBtn=$('debugDiagProbeBtn');
    if(probeBtn){
      probeBtn.onclick=function(){
        startCompatProbe();
        renderTriggerDiagBlocks();
      };
    }
    if(global.OneToneHomeV9.startForegroundPoll) global.OneToneHomeV9.startForegroundPoll();
  }

  function applyLang(){
    var shell=$('appWorkbenchShell')||$('homeWorkbench');
    if(shell){
      shell.querySelectorAll('[data-i18n]').forEach(function(el){
        var key=el.getAttribute('data-i18n');
        if(key) el.textContent=t(key);
      });
    }
    var brandSub=$('wbNavBrandSub');
    if(brandSub) brandSub.textContent=t('homeWbNavSubtitle');
    setText($('wbBtnEnd'),t('homeV9BtnEnd'));
    setText($('wbBtnCancel'),t('homeWbBtnCancel'));
    setText($('wbBtnTestSend'),t('homeLiveTestEndSend'));
    var heroHint=$('wbTriggerHeroHint');
    if(heroHint) heroHint.textContent=t('homeWbTriggerHeroHint');
    var triggerEdit=$('wbTriggerEdit');
    if(triggerEdit){
      triggerEdit.title=t('homeWbPipelineEdit');
      triggerEdit.setAttribute('aria-label',t('homeWbPipelineEdit'));
    }
    var searchInput=$('wbCommandSearchInput');
    if(searchInput) searchInput.placeholder=t('homeWbCmdSearchPlaceholder');
    renderQuickActions();
    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.render) global.OneToneHomeWorkbench.render();
  }

  global.OneToneHomeWorkbench={
    render:render,
    bindOnce:bindOnce,
    applyLang:applyLang,
    syncNavActiveState:syncNavActiveState,
    buildPerf:buildPerf,
    enrichViewModel:enrichViewModel,
    renderTriggerDiagBlocks:renderTriggerDiagBlocks,
    startCompatProbe:startCompatProbe,
    onCompatResult:function(msg){
      if(global.OneToneHomeWorkbenchCompat&&msg){
        global.OneToneHomeWorkbenchCompat.store(msg.mappingId,msg);
      }
      render();
      renderTriggerDiagBlocks();
    }
  };
})((typeof window!=='undefined')?window:globalThis);
