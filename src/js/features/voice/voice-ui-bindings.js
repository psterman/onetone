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
    var voiceSapiPresets=$('voiceSapiPresets');
    if(voiceSapiPresets){
      voiceSapiPresets.onclick=function(e){
        e.stopPropagation();
        hooks.addVoiceSapiPreset(e);
      };
    }
    if(hooks.bindVoiceModeCard) hooks.bindVoiceModeCard('btnVoiceModeVosk','vosk');
    var btnVoiceVoskTest=$('btnVoiceVoskTest');
    if(btnVoiceVoskTest) btnVoiceVoskTest.onclick=hooks.testVoiceVoskSend;
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
        if(hooks.setVoiceVoskModelPreset) hooks.setVoiceVoskModelPreset(preset);
        else if(hooks.changeVoiceVoskModelPreset) hooks.changeVoiceVoskModelPreset(preset);
      };
    }
    var voiceVoskWakeWrap=$('voiceSettingsVoskWakeWrap');
    if(voiceVoskWakeWrap) voiceVoskWakeWrap.onclick=hooks.addVoiceVoskPreset;
    var btnVoiceEnd=$('btnVoiceEnd');
    if(btnVoiceEnd) btnVoiceEnd.onclick=hooks.toggleVoiceEnd;
    var btnVoiceEndAutoSend=$('btnVoiceEndAutoSend');
    if(btnVoiceEndAutoSend) btnVoiceEndAutoSend.onclick=hooks.toggleVoiceEndAutoSend;
    var voiceEndPresetsWrap=$('voiceEndPresetsWrap');
    if(voiceEndPresetsWrap) voiceEndPresetsWrap.onclick=hooks.addVoiceEndPreset;
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
      var map={
        input:['voiceRecognizeEngineDetails'],
        phrases:['voiceWakeEditDetails','voiceMicPickerDetails'],
        finish:['voiceOutputMore','voiceRecognizeEndDetails']
      };
      (map[mode]||[]).forEach(function(id){
        var el=$(id);
        if(el) el.open=true;
      });
      if(mode==='phrases'){
        var wakeEdit=$('voiceWakeEditDetails');
        if(wakeEdit) wakeEdit.open=true;
      }
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
      if(mode==='input'){
        var engineDetails=$('voiceRecognizeEngineDetails');
        if(engineDetails) engineDetails.open=true;
      }
      if(mode==='finish'){
        var endDetails=$('voiceRecognizeEndDetails');
        if(endDetails) endDetails.open=true;
      }
    }
    function closeVoiceEditMode(){
      /* v2: no overlay edit mode; step stays on OneToneVoicePageState */
    }
    function openVoicePhrasesEditor(){
      setVoiceEditMode('phrases');
      var target=$('voiceSettingsWakeCard');
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }
    function openVoiceMicPicker(){
      setVoiceEditMode('phrases');
      var wakeEdit=$('voiceWakeEditDetails');
      if(wakeEdit) wakeEdit.open=true;
      var details=$('voiceMicPickerDetails');
      if(details){
        details.open=true;
        details.scrollIntoView({behavior:'smooth',block:'nearest'});
      }
      if(hooks.focusSettingsField) hooks.focusSettingsField('mic');
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
        if(mode!=='sapi'&&mode!=='vosk') return;
        if(mode==='sapi'&&global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return;
        if(hooks.setVoiceWakeExpandedMode) hooks.setVoiceWakeExpandedMode(mode);
        if(hooks.switchVoiceMode) hooks.switchVoiceMode(mode,{toastKind:'lite'});
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
        var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
        if(eng==='sapi'||eng==='off'||mode==='manual') return;
        var autoBtn=$('btnVoiceEndAutoSend');
        var isAuto=autoBtn&&autoBtn.classList.contains('is-on');
        if(mode==='auto'&&!isAuto&&hooks.toggleVoiceEndAutoSend) hooks.toggleVoiceEndAutoSend();
        else if(mode==='confirm'&&isAuto&&hooks.toggleVoiceEndAutoSend) hooks.toggleVoiceEndAutoSend();
      });
    }
    var btnVoiceSettingsMic=$('btnVoiceSettingsMic');
    if(btnVoiceSettingsMic) btnVoiceSettingsMic.onclick=openVoiceMicPicker;
    var voiceMicStatusLine=$('voiceMicStatusLine');
    if(voiceMicStatusLine) voiceMicStatusLine.onclick=openVoiceMicPicker;
    var btnVoiceEndDetectSwitchVosk=$('btnVoiceEndDetectSwitchVosk');
    if(btnVoiceEndDetectSwitchVosk){
      btnVoiceEndDetectSwitchVosk.onclick=function(){
        if(hooks.switchVoiceMode) hooks.switchVoiceMode('vosk');
      };
    }
    var btnVoiceSwitchHabit=$('btnVoiceSwitchHabit');
    if(btnVoiceSwitchHabit){
      btnVoiceSwitchHabit.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('scenes');
      };
    }
    var btnVoiceSaveHabit=$('btnVoiceSaveHabit');
    if(btnVoiceSaveHabit){
      btnVoiceSaveHabit.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        if(global.OneToneHabitHub&&global.OneToneHabitHub.createFromVoice){
          global.OneToneHabitHub.createFromVoice();
        }
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
    if(btnFbSimulateWake) btnFbSimulateWake.onclick=runVoiceTestOnce;
    var btnVoiceEnabled=$('btnVoiceEnabled');
    if(btnVoiceEnabled){
      btnVoiceEnabled.onclick=function(){
        if(hooks.homeToggleVoiceWake) hooks.homeToggleVoiceWake();
      };
    }
    bindVoiceEngineSwitch($('voiceRecognizeSourceGrid'));
    var btnVoiceOutputSummonManage=$('btnVoiceOutputSummonManage');
    if(btnVoiceOutputSummonManage){
      btnVoiceOutputSummonManage.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('keys');
      };
    }
    var btnVoiceSendHabitLink=$('btnVoiceSendHabitLink');
    var sendBlock=$('voiceSettingsSendBlock');
    if(sendBlock&&!sendBlock.dataset.habitLinkBound){
      sendBlock.dataset.habitLinkBound='1';
      sendBlock.addEventListener('click',function(e){
        var link=e.target.closest&&e.target.closest('#btnVoiceSendHabitLink');
        if(!link) return;
        e.preventDefault();
        e.stopPropagation();
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('scenes');
      });
    }
    if(btnVoiceSendHabitLink){
      btnVoiceSendHabitLink.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('scenes');
      };
    }
    var voiceOutputModeSegments=$('voiceOutputModeSegments');
    if(voiceOutputModeSegments) bindVoiceOutputSwitch(voiceOutputModeSegments);
    var btnVoiceAppScopeAdd=$('btnVoiceAppScopeAdd');
    if(btnVoiceAppScopeAdd){
      btnVoiceAppScopeAdd.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('keys');
      };
    }
    var voiceAppScopeChips=$('voiceAppScopeChips');
    if(voiceAppScopeChips){
      voiceAppScopeChips.addEventListener('click',function(e){
        if(e.target.closest&&e.target.closest('[data-voice-scope-app],[data-voice-scope-none]')){
          if(hooks.setSettingsPanel) hooks.setSettingsPanel('keys');
        }
      });
    }
    function bindCustomPhraseAdd(inputId,btnId,addFn){
      var input=$(inputId);
      var btn=$(btnId);
      if(!btn||!addFn) return;
      function commit(){
        var phrase=input&&global.OneToneVoicePhraseCustom?global.OneToneVoicePhraseCustom.readInput(inputId):'';
        if(!phrase) return;
        addFn(phrase);
        if(global.OneToneVoicePhraseCustom) global.OneToneVoicePhraseCustom.clearInput(inputId);
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
    bindCustomPhraseAdd('voiceWakeCustomInput','btnVoiceWakeCustomAdd',function(phrase){
      var wake=global.OneToneVoiceWake;
      if(wake&&wake.addCustomWakePhrase) wake.addCustomWakePhrase(phrase);
    });
    bindCustomPhraseAdd('voiceEndCustomInput','btnVoiceEndCustomAdd',function(phrase){
      var end=global.OneToneVoiceEnd;
      if(end&&end.addCustomEndPhrase) end.addCustomEndPhrase(phrase);
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
    bindPhraseListen('btnVoiceWakeCustomListen','voiceWakeCustomInput');
    bindPhraseListen('btnVoiceEndCustomListen','voiceEndCustomInput');
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
        var eng=hooks.currentVoiceMode?hooks.currentVoiceMode():'off';
        var wakeApi=global.OneToneVoiceWake;
        if(eng==='vosk'&&wakeApi&&wakeApi.changeVoskModelPreset){
          wakeApi.changeVoskModelPreset(lang==='en'?'en-light':'cn-light');
          return;
        }
        global.__vp_voice_wake_lang__=lang;
        host.querySelectorAll('.flow-lang-btn').forEach(function(b){
          b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
        });
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
          global.OneToneVoiceSettingsFlow.render();
        }
      };
    }
    bindWakeLangToggle();
    bindFlowLangToggle('voiceEndLangToggle','__vp_voice_end_lang__');
    var btnMicRefresh=$('btnMicRefresh');
    if(btnMicRefresh) btnMicRefresh.onclick=function(){
      btnMicRefresh.disabled=true;
      if(hooks.micRecoveryTimer()) hooks.clearMicRecoveryTimer();
      hooks.clearMicBackoff();
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
