(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  var VOICE_EDIT_MODES=['input','phrases','finish'];
  function setVoiceSubpage(page,opts){
    if(global.OneToneVoiceSubpages&&typeof global.OneToneVoiceSubpages.setPage==='function'){
      global.OneToneVoiceSubpages.setPage(page,opts);
      return true;
    }
    return false;
  }
  function bindEvents(){
    var hooks=h();
    var t=hooks.t;
    function setRecognizeNavActive(targetId){
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.setRecognizeNavState){
        global.OneToneVoiceSettingsFlow.setRecognizeNavState(targetId);
      }else{
        var nav=$('voiceRecognizeNav');
        if(!nav) return;
        nav.querySelectorAll('.voice-recognize-nav-link').forEach(function(link){
          var href=link.getAttribute('href')||'';
          link.classList.toggle('is-active',href==='#'+targetId);
        });
      }
      var sec=$(targetId);
      if(sec) sec.scrollIntoView({behavior:'smooth',block:'start'});
    }
    if(hooks.bindVoiceModeCard) hooks.bindVoiceModeCard('btnVoiceModeSapi','sapi');
    var btnVoiceSapiTest=$('btnVoiceSapiTest');
    if(btnVoiceSapiTest) btnVoiceSapiTest.onclick=hooks.testVoiceSapiSend;
    var btnVoiceSapiSetup=$('btnVoiceSapiSetup');
    if(btnVoiceSapiSetup) btnVoiceSapiSetup.onclick=hooks.openVoiceSapiSetup;
    if(global.OneToneVoiceWakePresets){
      global.OneToneVoiceWakePresets.bindPresetClicks(function(e,btn){
        var mode=btn.closest('#voiceSettingsVoskWakeWrap')?'vosk':'sapi';
        if(mode==='vosk') hooks.addVoiceVoskPreset(e);
        else hooks.addVoiceSapiPreset(e);
      });
    }else{
      var voiceSapiPresets=$('voiceSapiPresets');
      if(voiceSapiPresets){
        voiceSapiPresets.onclick=function(e){
          e.stopPropagation();
          hooks.addVoiceSapiPreset(e);
        };
      }
      var voiceVoskWakeWrap=$('voiceSettingsVoskWakeWrap');
      if(voiceVoskWakeWrap) voiceVoskWakeWrap.onclick=hooks.addVoiceVoskPreset;
    }
    if(hooks.bindVoiceModeCard) hooks.bindVoiceModeCard('btnVoiceModeVosk','vosk');
    var btnVoiceVoskTest=$('btnVoiceVoskTest');
    if(btnVoiceVoskTest) btnVoiceVoskTest.onclick=hooks.testVoiceVoskSend;
    var btnVoiceKwsEnable=$('btnVoiceKwsEnable');
    if(btnVoiceKwsEnable) btnVoiceKwsEnable.onclick=function(){ if(hooks.setVoiceKwsEnabled) hooks.setVoiceKwsEnabled(true); };
    var btnVoiceKwsDisable=$('btnVoiceKwsDisable');
    if(btnVoiceKwsDisable) btnVoiceKwsDisable.onclick=function(){ if(hooks.setVoiceKwsEnabled) hooks.setVoiceKwsEnabled(false); };
    var btnVoiceKwsTestSend=$('btnVoiceKwsTestSend');
    if(btnVoiceKwsTestSend) btnVoiceKwsTestSend.onclick=hooks.testVoiceKwsSend;
    var btnVoiceKwsDownload=$('btnVoiceKwsDownload');
    if(btnVoiceKwsDownload) btnVoiceKwsDownload.onclick=function(){ if(hooks.downloadKwsModel) hooks.downloadKwsModel(); };
    var btnVoiceKwsRetry=$('btnVoiceKwsRetry');
    if(btnVoiceKwsRetry) btnVoiceKwsRetry.onclick=function(){ if(hooks.retryKwsStart) hooks.retryKwsStart(); };
    document.querySelectorAll('[data-kws-phrase]').forEach(function(btn){
      btn.onclick=function(){
        var phrase=btn.getAttribute('data-kws-phrase')||'';
        if(hooks.testVoiceKwsDetect) hooks.testVoiceKwsDetect(phrase);
      };
    });
    var btnVoskOpenResources=$('btnVoskOpenResources');
    if(btnVoskOpenResources) btnVoskOpenResources.onclick=hooks.openVoskResourcesDir;
    var btnVoskRetry=$('btnVoskRetry');
    if(btnVoskRetry) btnVoskRetry.onclick=function(e){ e.stopPropagation(); if(hooks.retryVoskStart) hooks.retryVoskStart(); else if(hooks.retryVoiceVosk) hooks.retryVoiceVosk(); };
    var btnVoiceEngineRecoveryHelp=$('btnVoiceEngineRecoveryHelp');
    if(btnVoiceEngineRecoveryHelp){
      btnVoiceEngineRecoveryHelp.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('debug');
        else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.open({panel:'debug'});
      };
    }
    var voiceVoskModelPreset=$('voiceVoskModelPreset');
    if(voiceVoskModelPreset){
      voiceVoskModelPreset.onclick=function(ev){
        var btn=ev.target.closest&&ev.target.closest('[data-preset]');
        if(!btn||btn.disabled) return;
        ev.preventDefault();
        ev.stopPropagation();
        var preset=btn.getAttribute('data-preset');
        var endLang=(preset||'').indexOf('en')===0?'en':'zh';
        global.__vp_voice_end_lang__=endLang;
        var endToggle=$('voiceEndLangToggle');
        if(endToggle){
          endToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
            b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===endLang);
          });
        }
        if(hooks.setVoiceVoskModelPreset) hooks.setVoiceVoskModelPreset(preset);
        else if(hooks.changeVoiceVoskModelPreset) hooks.changeVoiceVoskModelPreset(preset);
        else if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
          global.OneToneVoiceSettingsFlow.render();
        }
      };
    }
    var btnVoiceEnd=$('btnVoiceEnd');
    if(btnVoiceEnd) btnVoiceEnd.onclick=hooks.toggleVoiceEnd;
    var voiceEndDelayRange=$('voiceEndDelayRange');
    if(voiceEndDelayRange){
      voiceEndDelayRange.oninput=hooks.onVoiceEndDelayInput;
      voiceEndDelayRange.onchange=hooks.onVoiceEndDelayChange;
    }
    var voiceSettingsDelayRange=$('voiceSettingsDelayRange');
    if(voiceSettingsDelayRange){
      voiceSettingsDelayRange.oninput=hooks.onVoiceEndDelayInput;
      voiceSettingsDelayRange.onchange=hooks.onVoiceEndDelayChange;
    }
    var btnVoiceSettingsCommitEnter=$('btnVoiceSettingsCommitEnter');
    if(btnVoiceSettingsCommitEnter){
      btnVoiceSettingsCommitEnter.onclick=function(e){
        e.stopPropagation();
        hooks.setVoiceEndCommitKey('Enter');
      };
    }
    var btnVoiceSettingsCommitShiftEnter=$('btnVoiceSettingsCommitShiftEnter');
    if(btnVoiceSettingsCommitShiftEnter){
      btnVoiceSettingsCommitShiftEnter.onclick=function(e){
        e.stopPropagation();
        hooks.setVoiceEndCommitKey('Shift+Enter');
      };
    }
    var btnVoiceSettingsCommitCtrlEnter=$('btnVoiceSettingsCommitCtrlEnter');
    if(btnVoiceSettingsCommitCtrlEnter){
      btnVoiceSettingsCommitCtrlEnter.onclick=function(e){
        e.stopPropagation();
        hooks.setVoiceEndCommitKey('Ctrl+Enter');
      };
    }
    var btnVoiceEndTestStop=$('btnVoiceEndTestStop');
    if(btnVoiceEndTestStop) btnVoiceEndTestStop.onclick=hooks.testVoiceEndStop;
    var btnVoiceEndTestCommit=$('btnVoiceEndTestCommit');
    if(btnVoiceEndTestCommit) btnVoiceEndTestCommit.onclick=hooks.testVoiceEndCommit;
    var voiceSapiConfidence=$('voiceSapiConfidence');
    if(voiceSapiConfidence){
      voiceSapiConfidence.oninput=function(){ hooks.updateVoiceSapiConfidence(false); };
      voiceSapiConfidence.onchange=function(){ hooks.updateVoiceSapiConfidence(true); };
    }
    document.querySelectorAll('.voice-sapi-sens-btn').forEach(function(btn){
      btn.onclick=function(e){
        e.stopPropagation();
        var idx=btn.getAttribute('data-sapi-sens');
        if(hooks.applyVoiceSapiSensLevel) hooks.applyVoiceSapiSensLevel(idx);
      };
    });
    function expandVoiceEditPanels(mode){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.expandForEditMode){
        global.OneToneVoiceWakeNavigation.expandForEditMode(mode);
        return;
      }
      var map={
        input:['voiceRecognizeEngineDetails'],
        phrases:['voiceWakeCustomDetails'],
        finish:['voiceRecognizeEndDetails']
      };
      (map[mode]||[]).forEach(function(id){
        var el=$(id);
        if(el) el.open=true;
      });
    }
    function setVoiceEditMode(mode){
      if(VOICE_EDIT_MODES.indexOf(mode)<0) mode='input';
      var stepMap={input:'recognize',phrases:'wake',finish:'send'};
      if(global.OneToneVoicePageState){
        global.OneToneVoicePageState.setStep(stepMap[mode]||'wake');
      }
      var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
      var panel=$('settingsPanelVoiceWake');
      if(panel) panel.setAttribute('data-voice-engine',eng||'off');
      expandVoiceEditPanels(mode);
    }
    function closeVoiceEditMode(){
      /* v2: no overlay edit mode; step stays on OneToneVoicePageState */
    }
    function openVoicePhrasesEditor(){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openPresetsEditor){
        global.OneToneVoiceWakeNavigation.openPresetsEditor();
        return;
      }
      setVoiceEditMode('phrases');
      var target=$('voiceSettingsWakeCard');
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }
    function openVoiceMicPicker(){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openMicPicker){
        global.OneToneVoiceWakeNavigation.openMicPicker();
        return;
      }
      setVoiceEditMode('phrases');
      if(hooks.focusSettingsField) hooks.focusSettingsField('mic');
    }
    function toggleVoiceMicPicker(){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.toggleMicPicker){
        global.OneToneVoiceWakeNavigation.toggleMicPicker();
        return;
      }
      openVoiceMicPicker();
    }
    global.__vp_setVoiceEditMode__=setVoiceEditMode;
    global.__vp_closeVoiceEditMode__=closeVoiceEditMode;
    function bindVoiceEngineSwitch(root){
      if(!root||root.dataset.voiceEngineBound) return;
      root.dataset.voiceEngineBound='1';
      root.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-engine-tab]');
        if(!btn||btn.disabled||btn.hidden) return;
        e.preventDefault();
        var mode=btn.getAttribute('data-voice-engine-tab');
        if(mode!=='sapi'&&mode!=='vosk'&&mode!=='kws') return;
        if(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending()) return;
        if(mode==='sapi'&&global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return;
        if(hooks.setVoiceWakeExpandedMode) hooks.setVoiceWakeExpandedMode(mode);
        if(hooks.switchVoiceMode) hooks.switchVoiceMode(mode,{toastKind:'lite'});
      });
    }
    function bindVoiceStrategySwitch(root){
      if(!root||root.dataset.voiceStrategyBound) return;
      root.dataset.voiceStrategyBound='1';
      var downBtn=null;
      var downAt=0;
      root.addEventListener('pointerdown',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-strategy-tab]');
        downBtn=btn||null;
        downAt=Date.now();
      },true);
      root.addEventListener('click',function(e){
        if(e&&e.isTrusted===false) return;
        var btn=e.target.closest&&e.target.closest('[data-voice-strategy-tab]');
        if(!btn||btn.hidden) return;
        // Layout-under-cursor ghosts often fire click without a real press on that tab.
        if(!downBtn||downBtn!==btn||(Date.now()-downAt)<45||(Date.now()-downAt)>2500){
          // #region agent log
          try{ if(global.__dbgB5) global.__dbgB5('C','voice-ui-bindings.js:strategyClick','lite strategy click rejected (no dwell)',{strategy:btn.getAttribute('data-voice-strategy-tab')||'',hasDown:!!downBtn,same:!!(downBtn===btn),dwellMs:downAt?Date.now()-downAt:-1}); }catch(_){}
          // #endregion
          downBtn=null;
          return;
        }
        downBtn=null;
        e.preventDefault();
        e.stopPropagation();
        var strategy=btn.getAttribute('data-voice-strategy-tab');
        if(strategy!=='auto'&&strategy!=='resourceSaver'&&strategy!=='enhanced') return;
        if(global.OneToneVoiceWake&&global.OneToneVoiceWake.switchListeningStrategy){
          global.OneToneVoiceWake.switchListeningStrategy(strategy,{toastKind:'lite'});
        }
      });
    }
    function bindVoiceOutputSwitch(root){
      if(!root||root.dataset.voiceOutputBound) return;
      root.dataset.voiceOutputBound='1';
      root.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-output-mode]');
        if(!btn||btn.disabled) return;
        e.preventDefault();
        var mode=btn.getAttribute('data-voice-output-mode')||'';
        if(mode!=='confirm'&&mode!=='phrase'&&mode!=='auto') return;
        var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
        if(eng==='sapi'||eng==='off'){
          if(mode==='confirm') return;
          global.__vp_voice_pending_send_mode__=mode;
          if(hooks.switchVoiceMode) hooks.switchVoiceMode('vosk');
          if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceSendSwitchEngineToast'),'lite');
          return;
        }
        if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.setOutputMode){
          global.OneToneVoiceEnd.setOutputMode(mode);
        }
      });
    }
    var btnVoiceLiveMicChange=$('btnVoiceLiveMicChange');
    if(btnVoiceLiveMicChange) btnVoiceLiveMicChange.onclick=openVoiceMicPicker;
    var btnVoiceLiveMicToggle=$('btnVoiceLiveMicToggle');
    if(btnVoiceLiveMicToggle) btnVoiceLiveMicToggle.onclick=toggleVoiceMicPicker;
    var btnVoiceEndDetectSwitchVosk=$('btnVoiceEndDetectSwitchVosk');
    if(btnVoiceEndDetectSwitchVosk){
      btnVoiceEndDetectSwitchVosk.onclick=function(){
        if(hooks.switchVoiceMode) hooks.switchVoiceMode('vosk');
      };
    }
    var btnVoiceSendSwitchVosk=$('btnVoiceSendSwitchVosk');
    if(btnVoiceSendSwitchVosk){
      btnVoiceSendSwitchVosk.onclick=function(e){
        e.preventDefault();
        if(hooks.switchVoiceMode) hooks.switchVoiceMode('vosk');
      };
    }
    var btnVoiceSwitchHabit=$('btnVoiceSwitchHabit');
    if(btnVoiceSwitchHabit){
      btnVoiceSwitchHabit.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('habits');
      };
    }
    var btnVoiceSaveHabit=$('btnVoiceSaveHabit');
    if(btnVoiceSaveHabit){
      btnVoiceSaveHabit.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        var saveFn=global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.saveVoiceScheme;
        var legacyFn=global.OneToneHabitHub&&global.OneToneHabitHub.createFromVoice;
        var run=saveFn||legacyFn;
        if(!run) return;
        Promise.resolve(run()).then(function(saved){
          if(saved===null&&global.OneToneAppToast){
            global.OneToneAppToast.show(t('voiceSchemeSaveCancelled'),'warn');
          }
        }).catch(function(err){
          console.error('saveVoiceScheme',err);
          if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceSchemeSaveCancelled'),'warn');
        });
      };
    }
    function runVoiceTestOnce(){
      var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
      if(eng==='vosk'&&hooks.testVoiceVoskSend) hooks.testVoiceVoskSend();
      else if(eng==='sapi'&&hooks.testVoiceSapiSend) hooks.testVoiceSapiSend();
      else openVoiceMicPicker();
    }
    var btnFbSimulateSpeak=$('voiceFbBtnSimulateSpeak');
    if(btnFbSimulateSpeak) btnFbSimulateSpeak.onclick=runVoiceTestOnce;
    var btnFbSimulateWake=$('voiceFbBtnSimulateWake');
    if(btnFbSimulateWake){
      btnFbSimulateWake.onclick=function(){
        if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openPresetsEditor){
          global.OneToneVoiceWakeNavigation.openPresetsEditor();
        }else{
          openVoicePhrasesEditor();
        }
      };
    }
    var btnVoiceEnabled=$('btnVoiceEnabled');
    if(btnVoiceEnabled){
      btnVoiceEnabled.onclick=function(){
        if(hooks.homeToggleVoiceWake) hooks.homeToggleVoiceWake();
      };
    }
    bindVoiceEngineSwitch($('voiceRecognizeSourceGrid'));
    bindVoiceStrategySwitch($('voiceSummaryEngineSwitch'));
    var btnVoiceOutputSummonManage=$('btnVoiceOutputSummonManage');
    function refreshOpenAppCards(){
      var wakeStep=global.OneToneVoiceStepWake;
      var vmApi=global.OneToneVoiceSettingsViewModel;
      if(wakeStep&&wakeStep.renderOutputSummon&&vmApi&&vmApi.build){
        wakeStep.renderOutputSummon(vmApi.build());
      }else if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
        global.OneToneVoiceSettingsFlow.render();
      }
    }
    function mappingById(id){
      id=String(id||'').trim();
      if(!id) return null;
      var core=global.OneToneMappingCore;
      if(core&&core.byId) return core.byId(id);
      return null;
    }
    function ensureOpenAppMapping(appId,mappingId){
      var byId=mappingById(mappingId);
      if(byId) return byId;
      appId=String(appId||'').trim();
      if(!appId||appId==='custom') return null;
      var hub=global.OneToneHabitHub;
      if(!hub) return null;
      var existing=hub.findAppScenarioByAppId?hub.findAppScenarioByAppId(appId):null;
      if(existing) return existing;
      if(!hub.createAppScenario) return null;
      return hub.createAppScenario(appId,{ deferPersist:true });
    }
    function mountOpenAppAcoustic(appId,act,mappingId){
      appId=String(appId||'').trim();
      var mapping=ensureOpenAppMapping(appId,mappingId);
      if(!mapping||!mapping.id){
        if(global.OneToneAppToast) global.OneToneAppToast.show((t&&t('voiceOpenAppCreateFailed'))||'无法创建应用场景','error');
        return;
      }
      var wakeStep=global.OneToneVoiceStepWake;
      var hostId=wakeStep&&wakeStep.openAppHostId?wakeStep.openAppHostId(appId,mapping.id):('openAppAcousticHost_'+mapping.id);
      if(wakeStep&&wakeStep.setOpenAppExpanded) wakeStep.setOpenAppExpanded(mapping.id);
      refreshOpenAppCards();
      var host=$(hostId);
      if(host){ host.hidden=false; host.removeAttribute('hidden'); }
      var cmd=global.OneToneHabitScenarioVoiceCommand;
      if(!cmd) return;
      function remountIdle(){
        if(wakeStep&&wakeStep.getOpenAppExpanded&&wakeStep.getOpenAppExpanded()!==mapping.id) return;
        var h=$(hostId);
        if(h){ h.hidden=false; h.removeAttribute('hidden'); }
        cmd.render({ mappingId:mapping.id, hostId:hostId });
      }
      if(cmd.clearInlineContext) cmd.clearInlineContext();
      cmd.bindEvents({
        mappingId:mapping.id,
        hostId:hostId,
        onChange:function(){
          var busy=cmd.isBusy?cmd.isBusy():(cmd.isCalibrating&&cmd.isCalibrating());
          if(busy) return;
          refreshOpenAppCards();
          remountIdle();
        }
      });
      cmd.render({ mappingId:mapping.id, hostId:hostId });
      if(act==='record'||act==='rerecord'){
        if(cmd.runAct) cmd.runAct(act);
      }
    }
    function startOpenAppAcousticTest(mappingId){
      mappingId=String(mappingId||'').trim();
      if(!mappingId){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestNeedRecord'),'scheme');
        return;
      }
      var api=global.OneToneVoiceAcousticIpc;
      if(!api||!api.testOnce){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestNeedRecord'),'scheme');
        return;
      }
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestPrompt'),'scheme');
      openAppTestListening=true;
      refreshOpenAppCards();
      api.testOnce(mappingId).then(function(res){
        openAppTestListening=false;
        refreshOpenAppCards();
        res=res||{};
        if(res.ok){
          if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestOk'),'scheme');
          return;
        }
        var reason=String(res.reason||'');
        if(reason==='app_launch_failed'||reason==='app_not_launchable'||reason==='app_target_missing'){
          if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestLaunchFailed'),'warn');
          return;
        }
        if(reason==='conflicts_with_other_command'||reason==='below_threshold'||reason==='no_speech'){
          if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestTimeout'),'scheme');
          return;
        }
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestTimeout'),'scheme');
      }).catch(function(){
        openAppTestListening=false;
        refreshOpenAppCards();
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestTimeout'),'scheme');
      });
    }
    var openAppTestListening=false;
    global.OneToneVoiceOpenAppUi={
      isTesting:function(){ return !!openAppTestListening; }
    };
    var openAppReplayAudio=null;
    function stopOpenAppReplay(){
      if(openAppReplayAudio&&openAppReplayAudio.source){
        try{ openAppReplayAudio.source.stop(); }catch(_e){}
      }
      openAppReplayAudio=null;
    }
    function resumeAcousticAfterReplay(){
      var api=global.OneToneVoiceAcousticIpc;
      if(api&&api.setSuspend){
        return api.setSuspend(false).catch(function(){ return null; });
      }
      return Promise.resolve();
    }
    function playOpenAppAcousticPreview(mappingId){
      mappingId=String(mappingId||'').trim();
      if(!mappingId){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppReplayNeedRerecord'),'scheme');
        return;
      }
      if(openAppTestListening){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppTestPrompt'),'scheme');
        return;
      }
      var core=global.OneToneMappingCore;
      var m=core&&core.byId?core.byId(mappingId):null;
      var cmd=m&&Array.isArray(m.acousticVoiceCommands)?m.acousticVoiceCommands[0]:null;
      var sample=cmd&&Array.isArray(cmd.samples)?cmd.samples[0]:null;
      var b64=sample&&(sample.previewPcmB64||sample.preview_pcm_b64);
      b64=String(b64||'').trim();
      if(!b64){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppReplayNeedRerecord'),'scheme');
        return;
      }
      var binary;
      try{
        binary=atob(b64);
      }catch(_e){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppReplayNeedRerecord'),'scheme');
        return;
      }
      var len=binary.length;
      if(len<2){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppReplayNeedRerecord'),'scheme');
        return;
      }
      var samples=new Float32Array(Math.floor(len/2));
      for(var i=0;i<samples.length;i++){
        var lo=binary.charCodeAt(i*2);
        var hi=binary.charCodeAt(i*2+1);
        var v=(hi<<8)|lo;
        if(v>=0x8000) v-=0x10000;
        samples[i]=v/32768;
      }
      var api=global.OneToneVoiceAcousticIpc;
      var matcher=global.OneToneVoiceAcousticMatcher;
      if(matcher&&matcher.clearMatchWatch) matcher.clearMatchWatch();
      stopOpenAppReplay();
      var suspendP=api&&api.setSuspend?api.setSuspend(true):Promise.resolve();
      suspendP.then(function(){
        var Ctx=global.AudioContext||global.webkitAudioContext;
        if(!Ctx){
          resumeAcousticAfterReplay();
          return;
        }
        var ctx=new Ctx();
        var buf=ctx.createBuffer(1,samples.length,16000);
        buf.getChannelData(0).set(samples);
        var src=ctx.createBufferSource();
        src.buffer=buf;
        src.connect(ctx.destination);
        openAppReplayAudio={ ctx:ctx, source:src };
        var done=false;
        function finish(){
          if(done) return;
          done=true;
          openAppReplayAudio=null;
          try{ ctx.close(); }catch(_e2){}
          resumeAcousticAfterReplay();
        }
        src.onended=finish;
        global.setTimeout(finish, Math.ceil((samples.length/16000)*1000)+800);
        try{ src.start(0); }catch(_e3){ finish(); }
      }).catch(function(){
        resumeAcousticAfterReplay();
      });
    }
    if(btnVoiceOutputSummonManage){
      btnVoiceOutputSummonManage.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('keys');
      };
    }
    var btnVoiceWakeInputTargetEdit=$('btnVoiceWakeInputTargetEdit');
    if(btnVoiceWakeInputTargetEdit){
      btnVoiceWakeInputTargetEdit.onclick=function(e){
        e.preventDefault();
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('keys');
      };
    }
    function persistOpenAppQuiet(){
      var p=global.OneToneConfigPersist;
      if(p&&p.saveAsync) return p.saveAsync({source:'mapping'});
      if(p&&p.save) p.save();
      return Promise.resolve();
    }
    function restorePrevSelection(prevId){
      var st=global.OneToneState&&global.OneToneState.state;
      if(st) st.selectedMappingId=prevId||null;
    }
    function claimVoiceOpenApp(payload){
      payload=payload||{};
      var hub=global.OneToneHabitHub;
      var rules=global.OneToneAppBehaviorRules;
      var st=global.OneToneState&&global.OneToneState.state;
      var prevId=st?String(st.selectedMappingId||''):'';
      var identity=payload.identity||null;
      var presetId=String(payload.presetId||payload.appId||'').trim();
      if(identity){
        var existingI=hub&&hub.findAppScenarioForIdentity?hub.findAppScenarioForIdentity(identity):null;
        if(existingI) return Promise.resolve(existingI);
        var matched=String(identity.matchedPresetAppId||identity.matched_preset_app_id||'').trim();
        if(matched&&rules&&rules.isPresetAppId&&rules.isPresetAppId(matched)){
          presetId=matched;
          identity=null;
        }else{
          if(!hub||!hub.createAppScenario) return Promise.resolve(null);
          var custom=hub.createAppScenario('custom',{deferPersist:true});
          if(!custom) return Promise.resolve(null);
          if(rules&&rules.setPickerCreateTarget) rules.setPickerCreateTarget(custom.id);
          if(rules&&rules.pickRunningIdentity) rules.pickRunningIdentity(custom,identity);
          if(rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(custom)){
            if(rules.discardIncompleteCustomCreate) rules.discardIncompleteCustomCreate(custom.id);
            restorePrevSelection(prevId);
            return Promise.resolve(null);
          }
          restorePrevSelection(prevId);
          return persistOpenAppQuiet().then(function(){ return custom; });
        }
      }
      if(!presetId||!hub) return Promise.resolve(null);
      var existing=hub.findAppScenarioByAppId?hub.findAppScenarioByAppId(presetId):null;
      if(existing) return Promise.resolve(existing);
      if(!hub.createAppScenario) return Promise.resolve(null);
      var created=hub.createAppScenario(presetId,{deferPersist:true});
      restorePrevSelection(prevId);
      if(!created) return Promise.resolve(null);
      return persistOpenAppQuiet().then(function(){ return created; });
    }
    var btnVoiceOpenAppAdd=$('btnVoiceOpenAppAdd');
    if(btnVoiceOpenAppAdd){
      btnVoiceOpenAppAdd.onclick=function(e){
        e.preventDefault();
        var rules=global.OneToneAppBehaviorRules;
        if(!rules||!rules.openAppPicker) return;
        rules.openAppPicker({
          mode:'voiceOpenApp',
          onPick:function(payload){
            claimVoiceOpenApp(payload).then(function(mapping){
              refreshOpenAppCards();
              if(!mapping){
                if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceOpenAppCreateFailed'),'warn');
                return;
              }
              mountOpenAppAcoustic(mapping.appTargetId,'record',mapping.id);
            });
          }
        });
      };
    }
    var summonChips=$('voiceOutputSummonChips');
    if(summonChips&&summonChips.dataset.openAppAcousticBound!=='1'){
      summonChips.dataset.openAppAcousticBound='1';
      summonChips.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-open-app-acoustic-act]');
        if(!btn) return;
        e.preventDefault();
        var act=btn.getAttribute('data-open-app-acoustic-act')||'';
        var appId=btn.getAttribute('data-app-id')||'';
        var mappingId=btn.getAttribute('data-mapping-id')||'';
        if(act==='test'){
          if(!mappingId){
            var hub=global.OneToneHabitHub;
            var m=hub&&hub.findAppScenarioByAppId?hub.findAppScenarioByAppId(appId):null;
            mappingId=m&&m.id||'';
          }
          startOpenAppAcousticTest(mappingId);
          return;
        }
        if(act==='play'){
          if(!mappingId){
            var hubPlay=global.OneToneHabitHub;
            var mPlay=hubPlay&&hubPlay.findAppScenarioByAppId?hubPlay.findAppScenarioByAppId(appId):null;
            mappingId=mPlay&&mPlay.id||'';
          }
          playOpenAppAcousticPreview(mappingId);
          return;
        }
        if(act==='record'||act==='rerecord'){
          mountOpenAppAcoustic(appId,act,mappingId);
        }
      });
    }
    if(global.OneToneVoiceTab2Mvp&&global.OneToneVoiceTab2Mvp.bindOnce){
      global.OneToneVoiceTab2Mvp.bindOnce();
    }
    var habitNote=$('voiceSendHabitNote');
    if(habitNote&&!habitNote.dataset.habitLinkBound){
      habitNote.dataset.habitLinkBound='1';
      habitNote.addEventListener('click',function(e){
        var link=e.target.closest&&e.target.closest('#btnVoiceSendHabitLink');
        if(!link) return;
        e.preventDefault();
        e.stopPropagation();
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('habits');
      });
    }
    var voiceOutputModeSegments=$('voiceOutputModeSegments');
    if(voiceOutputModeSegments) bindVoiceOutputSwitch(voiceOutputModeSegments);
    var btnVoiceAppScopeAdd=$('btnVoiceAppScopeAdd');
    if(btnVoiceAppScopeAdd){
      btnVoiceAppScopeAdd.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        var rules=global.OneToneAppBehaviorRules;
        if(rules&&rules.openAppPicker) rules.openAppPicker();
      };
    }
    var voiceAppScopeChips=$('voiceAppScopeChips');
    if(voiceAppScopeChips){
      voiceAppScopeChips.addEventListener('click',function(e){
        var delBtn=e.target.closest&&e.target.closest('[data-rule-delete]');
        if(delBtn){
          e.preventDefault();
          e.stopPropagation();
          var rules=global.OneToneAppBehaviorRules;
          var vmApi=global.OneToneVoiceSettingsViewModel;
          var vm=vmApi&&vmApi.build?vmApi.build():null;
          var m=null;
          if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.resolveScopeMapping){
            m=global.OneToneVoicePageHeaderRender.resolveScopeMapping(vm||{});
          }
          if(m&&rules&&rules.removeRuleById){
            rules.removeRuleById(m,delBtn.getAttribute('data-rule-delete')||'');
          }
          if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.renderAppScope&&vm){
            global.OneToneVoicePageHeaderRender.renderAppScope(vm);
          }else if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
            global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
          }
          return;
        }
        var noneBtn=e.target.closest&&e.target.closest('[data-voice-scope-none]');
        var appBtn=e.target.closest&&e.target.closest('[data-voice-scope-app]');
        var ruleBtn=e.target.closest&&e.target.closest('[data-rule-context]');
        if(!noneBtn&&!appBtn&&!ruleBtn) return;
        e.preventDefault();
        e.stopPropagation();
        var persist=global.OneToneVoiceSchemePersist;
        var applied=false;
        if(noneBtn){
          if(persist&&persist.applyVoiceAppScope) applied=!!persist.applyVoiceAppScope({appId:''});
        }else if(appBtn){
          if(persist&&persist.applyVoiceAppScope) applied=!!persist.applyVoiceAppScope({appId:appBtn.getAttribute('data-voice-scope-app')||''});
        }else if(ruleBtn){
          if(persist&&persist.applyVoiceAppScope) applied=!!persist.applyVoiceAppScope({ruleId:ruleBtn.getAttribute('data-rule-context')||''});
        }
        if(!applied&&global.OneToneAppToast) global.OneToneAppToast.show(t('voiceAppScopeApplyFailed'),'warn');
        var vmApi=global.OneToneVoiceSettingsViewModel;
        var vm=vmApi&&vmApi.build?vmApi.build():null;
        if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.renderAppScope&&vm){
          global.OneToneVoicePageHeaderRender.renderAppScope(vm);
        }else if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
          global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
        }
      });
    }
    function readPhraseInput(inputId){
      var pc=global.OneToneVoicePhraseCustom;
      if(pc&&pc.readInput) return pc.readInput(inputId);
      var input=$(inputId);
      return input?String(input.value||'').trim():'';
    }
    function bindCustomPhraseAdd(inputId,btnId,addFn){
      var input=$(inputId);
      var btn=$(btnId);
      if(!btn||!addFn) return;
      function commit(){
        var phrase=readPhraseInput(inputId);
        if(!phrase){
          var toast=hooks.toast||function(msg){ console.warn(msg); };
          toast(t('voicePhraseAddEmpty'));
          return;
        }
        addFn(phrase);
        var pc=global.OneToneVoicePhraseCustom;
        if(pc&&pc.clearInput) pc.clearInput(inputId);
        else if(input) input.value='';
        if(inputId==='voiceWakePhraseInput'&&global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncWakeInputCount){
          global.OneToneVoiceStepWake.syncWakeInputCount();
        }
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncEndPhraseInputCounts){
          global.OneToneVoiceStepRecognize.syncEndPhraseInputCounts();
        }
      }
      btn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        commit();
      };
      if(input){
        input.addEventListener('keydown',function(e){
          if(e.key==='Enter'){
            e.preventDefault();
            commit();
          }
        });
      }
    }
    function openWakePhrasePopover(){
      var overlay=$('voiceWakePhraseOverlay');
      if(!overlay) return;
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncWakeInputCount){
        global.OneToneVoiceStepWake.syncWakeInputCount();
      }
      var input=$('voiceWakePhraseInput');
      if(input){
        setTimeout(function(){
          input.focus();
        },0);
      }
    }
    function closeWakePhrasePopover(){
      var overlay=$('voiceWakePhraseOverlay');
      if(!overlay) return;
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
      var pc=global.OneToneVoicePhraseCustom;
      if(pc&&pc.clearInput) pc.clearInput('voiceWakePhraseInput');
      else{
        var input=$('voiceWakePhraseInput');
        if(input) input.value='';
      }
      if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncWakeInputCount){
        global.OneToneVoiceStepWake.syncWakeInputCount();
      }
    }
    function addWakePhraseFromPopover(phrase){
      var wake=global.OneToneVoiceWake;
      if(wake&&wake.addCustomWakePhrase){
        wake.addCustomWakePhrase(phrase).then(function(){
          closeWakePhrasePopover();
        });
      }
    }
    var btnVoiceWakePoolAdd=$('btnVoiceWakePoolAdd');
    if(btnVoiceWakePoolAdd){
      btnVoiceWakePoolAdd.onclick=function(e){
        e.preventDefault();
        openWakePhrasePopover();
      };
    }
    var wakePhraseOverlay=$('voiceWakePhraseOverlay');
    if(wakePhraseOverlay&&!wakePhraseOverlay.dataset.bound){
      wakePhraseOverlay.dataset.bound='1';
      wakePhraseOverlay.addEventListener('click',function(e){
        if(e.target===wakePhraseOverlay) closeWakePhrasePopover();
      });
    }
    var btnVoiceWakePopoverClose=$('btnVoiceWakePopoverClose');
    if(btnVoiceWakePopoverClose){
      btnVoiceWakePopoverClose.onclick=function(e){
        e.preventDefault();
        closeWakePhrasePopover();
      };
    }
    var btnVoiceWakePopoverCancel=$('btnVoiceWakePopoverCancel');
    if(btnVoiceWakePopoverCancel){
      btnVoiceWakePopoverCancel.onclick=function(e){
        e.preventDefault();
        closeWakePhrasePopover();
      };
    }
    bindCustomPhraseAdd('voiceWakePhraseInput','btnVoiceWakePhraseAdd',addWakePhraseFromPopover);
    var wakePhraseInput=$('voiceWakePhraseInput');
    if(wakePhraseInput&&!wakePhraseInput.dataset.countBound){
      wakePhraseInput.dataset.countBound='1';
      wakePhraseInput.addEventListener('input',function(){
        if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncWakeInputCount){
          global.OneToneVoiceStepWake.syncWakeInputCount();
        }
      });
      wakePhraseInput.addEventListener('keydown',function(e){
        if(e.key==='Escape'){
          e.preventDefault();
          closeWakePhrasePopover();
        }
      });
    }
    var wakePopoverPresets=$('voiceWakePopoverPresets');
    if(wakePopoverPresets&&!wakePopoverPresets.dataset.bound){
      wakePopoverPresets.dataset.bound='1';
      wakePopoverPresets.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-phrase]');
        if(!btn) return;
        e.preventDefault();
        var phrase=String(btn.getAttribute('data-phrase')||'').trim();
        if(phrase) addWakePhraseFromPopover(phrase);
      });
    }
    bindCustomPhraseAdd('voiceEndCustomInput','btnVoiceEndCustomAdd',function(phrase){
      var end=global.OneToneVoiceEnd;
      if(end&&end.addCustomEndPhrase) end.addCustomEndPhrase(phrase);
    });
    bindCustomPhraseAdd('voiceCancelCustomInput','btnVoiceCancelCustomAdd',function(phrase){
      var end=global.OneToneVoiceEnd;
      if(end&&end.addCustomCancelPhrase) end.addCustomCancelPhrase(phrase);
    });
    ['voiceEndCustomInput','voiceCancelCustomInput'].forEach(function(inputId){
      var input=$(inputId);
      if(!input||input.dataset.countBound==='1') return;
      input.dataset.countBound='1';
      input.addEventListener('input',function(){
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncEndPhraseInputCounts){
          global.OneToneVoiceStepRecognize.syncEndPhraseInputCounts();
        }
      });
    });
    bindCustomPhraseAdd('voiceSendCustomInput','btnVoiceSendCustomAdd',function(phrase){
      var end=global.OneToneVoiceEnd;
      if(end&&end.addCustomSendPhrase) end.addCustomSendPhrase(phrase);
    });
    function bindPhraseListen(btnId,inputId){
      var btn=$(btnId);
      if(!btn) return;
      btn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        var listen=global.OneToneVoicePhraseListen;
        if(listen&&listen.fillInputAsync) listen.fillInputAsync(inputId,btn);
        else if(listen&&listen.fillInput) listen.fillInput(inputId);
      };
    }
    bindPhraseListen('btnVoiceEndCustomListen','voiceEndCustomInput');
    bindPhraseListen('btnVoiceCancelCustomListen','voiceCancelCustomInput');
    bindPhraseListen('btnVoiceSendCustomListen','voiceSendCustomInput');
    function bindPhraseKindTabs(hostId,storageKey){
      var host=$(hostId);
      if(!host||host.dataset.kindBound==='1') return;
      host.dataset.kindBound='1';
      host.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-phrase-kind]');
        if(!btn) return;
        e.preventDefault();
        var kind=btn.getAttribute('data-phrase-kind')||'text';
        global[storageKey]=kind;
        if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.syncPhraseKindTabs){
          global.OneToneVoiceStepSend.syncPhraseKindTabs(hostId,kind);
        }
        if(hostId==='voiceEndKindTabs'||hostId==='voiceCancelKindTabs'){
          if(global.OneToneVoiceStepRecognize){
            if(global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility){
              global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility();
            }
            if(global.OneToneVoiceStepRecognize.syncCancelLangVisibility){
              global.OneToneVoiceStepRecognize.syncCancelLangVisibility();
            }
            if(kind==='sound'&&global.OneToneVoiceStepRecognize.syncControlAcousticKinds){
              global.OneToneVoiceStepRecognize.syncControlAcousticKinds();
            }
          }
        }
      });
    }
    bindPhraseKindTabs('voiceWakeKindTabs','__vp_voice_wake_kind__');
    bindPhraseKindTabs('voiceEndKindTabs','__vp_voice_end_kind__');
    bindPhraseKindTabs('voiceCancelKindTabs','__vp_voice_cancel_kind__');
    global.__vp_voice_send_kind__='text';
    if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.forceTextPhraseKinds){
      global.OneToneVoiceStepSend.forceTextPhraseKinds();
    }
    function bindControlAcousticTabs(hostId,storageKey,role){
      var host=$(hostId);
      if(!host||host.dataset.controlAcousticBound==='1') return;
      host.dataset.controlAcousticBound='1';
      host.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-phrase-kind]');
        if(!btn) return;
        if((btn.getAttribute('data-phrase-kind')||'')!=='sound') return;
        if(global.OneToneVoiceControlAcoustic){
          if(global.OneToneVoiceControlAcoustic.bindEvents) global.OneToneVoiceControlAcoustic.bindEvents(role);
          if(global.OneToneVoiceControlAcoustic.render) global.OneToneVoiceControlAcoustic.render(role);
        }
      });
    }
    bindControlAcousticTabs('voiceEndKindTabs','__vp_voice_end_kind__','end');
    bindControlAcousticTabs('voiceCancelKindTabs','__vp_voice_cancel_kind__','cancel');
    function bindFlowLangToggle(hostId,storageKey){
      var host=$(hostId);
      if(!host) return;
      host.onclick=function(e){
        var btn=e.target.closest&&e.target.closest('[data-lang]');
        if(!btn) return;
        e.preventDefault();
        var lang=btn.getAttribute('data-lang')||'zh';
        global[storageKey]=lang;
        host.querySelectorAll('.flow-lang-btn').forEach(function(b){
          b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
        });
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
          global.OneToneVoiceSettingsFlow.render();
        }
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility){
          global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility();
        }
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncCancelLangVisibility){
          global.OneToneVoiceStepRecognize.syncCancelLangVisibility();
        }
      };
    }
    function bindWakeLangToggle(){
      var host=$('voiceWakeLangToggle');
      if(!host) return;
      host.onclick=function(e){
        var btn=e.target.closest&&e.target.closest('[data-lang]');
        if(!btn) return;
        e.preventDefault();
        var lang=btn.getAttribute('data-lang')||'zh';
        global.__vp_voice_wake_lang__=lang;
        global.__vp_voice_end_lang__=lang;
        global.__vp_voice_wake_lang_manual__=true;
        host.querySelectorAll('.flow-lang-btn').forEach(function(b){
          b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
        });
        var endToggle=$('voiceEndLangToggle');
        if(endToggle){
          endToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
            b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
          });
        }
        if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncPresetLang){
          global.OneToneVoiceStepWake.syncPresetLang({lang:lang});
        }
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility){
          global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility();
        }
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
          global.OneToneVoiceSettingsFlow.render();
        }
        var eng=hooks.currentVoiceMode?hooks.currentVoiceMode():'off';
        var wakeApi=global.OneToneVoiceWake;
        if(eng==='vosk'&&wakeApi&&wakeApi.changeVoskModelPreset){
          var target=lang==='en'?'en-light':'cn-light';
          var current=wakeApi.currentVoskPreset?wakeApi.currentVoskPreset():'cn-light';
          if(target!==current){
            wakeApi.changeVoskModelPreset(target);
          }else{
            global.__vp_voice_wake_lang_manual__=false;
          }
          return;
        }
        global.__vp_voice_wake_lang_manual__=false;
      };
    }
    bindWakeLangToggle();
    bindFlowLangToggle('voiceEndLangToggle','__vp_voice_end_lang__');
    bindFlowLangToggle('voiceCancelLangToggle','__vp_voice_cancel_lang__');
    bindFlowLangToggle('voiceSendLangToggle','__vp_voice_send_lang__');
    var recognizeIntentTabs=$('voiceRecognizeIntentTabs');
    if(recognizeIntentTabs&&recognizeIntentTabs.dataset.intentBound!=='1'){
      recognizeIntentTabs.dataset.intentBound='1';
      recognizeIntentTabs.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-recognize-intent]');
        if(!btn) return;
        e.preventDefault();
        var intent=btn.getAttribute('data-recognize-intent')||'cancel';
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncRecognizeIntentTabs){
          global.OneToneVoiceStepRecognize.syncRecognizeIntentTabs(intent);
        }
      });
    }
    var openRecognizeAudio=$('btnRecordingAudioOpenRecognize');
    if(openRecognizeAudio){
      openRecognizeAudio.onclick=function(e){
        e.preventDefault();
        if(typeof hooks.setSettingsPanel==='function') hooks.setSettingsPanel('voiceWake');
        else if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.setSettingsPanel){
          global.OneToneSettingsDrawer.setSettingsPanel('voiceWake');
        }
        if(global.OneToneVoicePageState&&global.OneToneVoicePageState.setStep){
          global.OneToneVoicePageState.setStep('recognize');
        }else if(global.OneToneVoiceStepNav&&global.OneToneVoiceStepNav.goToStep){
          global.OneToneVoiceStepNav.goToStep('recognize');
        }
        setTimeout(function(){
          var card=$('recordingAudioCard');
          if(card&&card.scrollIntoView) card.scrollIntoView({behavior:'smooth',block:'nearest'});
        },60);
      };
    }
    var btnVoiceEndAudioSettings=$('btnVoiceEndAudioSettings');
    if(btnVoiceEndAudioSettings){
      btnVoiceEndAudioSettings.onclick=function(e){
        e.preventDefault();
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.focusField){
          global.OneToneSettingsDrawer.focusField('recordingAudio');
          return;
        }
        if(openRecognizeAudio) openRecognizeAudio.click();
      };
    }
    var pc=global.OneToneVoicePhraseCustom;
    var wakeApi=global.OneToneVoiceWake;
    var endApi=global.OneToneVoiceEnd;
    if(pc&&pc.bindPhraseTags){
      pc.bindPhraseTags('voiceWakePhraseTags',{
        onToggle:function(phrase,active){
          if(wakeApi&&wakeApi.toggleWakePhrase) wakeApi.toggleWakePhrase(phrase,active);
        },
        onRemove:function(phrase){
          if(wakeApi&&wakeApi.toggleWakePhrase) wakeApi.toggleWakePhrase(phrase,true);
        }
      });
      pc.bindPhraseTags('voiceEndPhraseTags',{
        onToggle:function(phrase,active){
          if(endApi&&endApi.toggleEndPhrase) endApi.toggleEndPhrase(phrase,active);
        },
        onRemove:function(phrase){
          if(endApi&&endApi.removeCustomEndPhrase) endApi.removeCustomEndPhrase(phrase);
        }
      });
      pc.bindPhraseTags('voiceCancelPhraseTags',{
        onToggle:function(phrase,active){
          if(endApi&&endApi.toggleCancelPhrase) endApi.toggleCancelPhrase(phrase,active);
        },
        onRemove:function(phrase){
          if(endApi&&endApi.removeCustomCancelPhrase) endApi.removeCustomCancelPhrase(phrase);
        }
      });
      pc.bindPhraseTags('voiceSendPhraseTags',{
        onToggle:function(phrase,active){
          if(endApi&&endApi.toggleSendPhrase) endApi.toggleSendPhrase(phrase,active);
        },
        onRemove:function(phrase){
          if(endApi&&endApi.removeCustomSendPhrase) endApi.removeCustomSendPhrase(phrase);
        }
      });
    }
    var btnMicRefresh=$('btnMicRefresh');
    if(btnMicRefresh) btnMicRefresh.onclick=function(){
      btnMicRefresh.disabled=true;
      if(typeof hooks.micRecoveryTimer==='function'&&hooks.micRecoveryTimer()) hooks.clearMicRecoveryTimer();
      if(typeof hooks.clearMicBackoff==='function') hooks.clearMicBackoff();
      hooks.loadMicDevices({manual:true}).catch(function(err){
        var detail=err&&(err.message||String(err))||'';
        hooks.toast(detail?(t('micRefreshFail')+'：'+detail):t('micRefreshFail'));
      }).finally(function(){
        btnMicRefresh.disabled=false;
      });
    };
  }
  global.OneToneVoiceUiBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
