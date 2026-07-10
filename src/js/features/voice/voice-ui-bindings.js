(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    var t=hooks.t;
    function setRecognizeNavActive(targetId){
      var nav=$('voiceRecognizeNav');
      if(!nav) return;
      nav.querySelectorAll('.voice-recognize-nav-link').forEach(function(link){
        var href=link.getAttribute('href')||'';
        link.classList.toggle('is-active',href==='#'+targetId);
      });
    }
    var voiceEngineTabbar=$('voiceEngineTabbar');
    if(voiceEngineTabbar){
      voiceEngineTabbar.addEventListener('click',function(e){
        var tab=e.target.closest&&e.target.closest('[data-voice-engine-tab]');
        if(!tab) return;
        e.preventDefault();
        var mode=tab.dataset.voiceEngineTab;
        if(mode!=='sapi'&&mode!=='vosk') return;
        if(mode==='sapi'&&global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return;
        hooks.setVoiceWakeExpandedMode(mode);
        if(hooks.switchVoiceMode) hooks.switchVoiceMode(mode,{toastKind:'lite'});
      });
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
    if(btnVoskOpenResources) btnVoskOpenResources.onclick=function(e){ e.stopPropagation(); hooks.openVoskResourcesDir&&hooks.openVoskResourcesDir(); };
    var btnVoskDownloadGuide=$('btnVoskDownloadGuide');
    if(btnVoskDownloadGuide) btnVoskDownloadGuide.onclick=function(e){ e.stopPropagation(); hooks.downloadVoskModel&&hooks.downloadVoskModel(); };
    var btnVoskUseLite=$('btnVoskUseLite');
    if(btnVoskUseLite) btnVoskUseLite.onclick=function(e){
      e.stopPropagation();
      if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.offerLiteFallback){
        global.OneToneVoiceEngineReadiness.offerLiteFallback();
      }else if(hooks.switchVoiceMode){
        hooks.switchVoiceMode('sapi');
      }
    };
    var btnVoskRetry=$('btnVoskRetry');
    if(btnVoskRetry) btnVoskRetry.onclick=function(e){ e.stopPropagation(); hooks.retryVoskStart&&hooks.retryVoskStart(); };
    var voiceVoskWakeWrap=$('voiceSettingsVoskWakeWrap');
    if(voiceVoskWakeWrap) voiceVoskWakeWrap.onclick=hooks.addVoiceVoskPreset;
    var voiceVoskModelPreset=$('voiceVoskModelPreset');
    if(voiceVoskModelPreset){
      voiceVoskModelPreset.onclick=function(ev){
        var btn=ev.target.closest&&ev.target.closest('[data-preset]');
        if(!btn||btn.disabled) return;
        ev.preventDefault();
        ev.stopPropagation();
        var preset=btn.getAttribute('data-preset')||'cn-light';
        if(hooks.changeVoiceVoskModelPreset) hooks.changeVoiceVoskModelPreset(preset);
      };
    }
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
    var btnVoiceSideMicSelect=$('btnVoiceSideMicSelect');
    if(btnVoiceSideMicSelect){
      btnVoiceSideMicSelect.onclick=function(){
        var details=$('voiceMicPickerDetails');
        if(!details) return;
        details.open=!details.open;
        btnVoiceSideMicSelect.setAttribute('aria-expanded',details.open?'true':'false');
        if(details.open) details.scrollIntoView({behavior:'smooth',block:'nearest'});
      };
    }
    var btnVoiceSettingsMic=$('btnVoiceSettingsMic');
    if(btnVoiceSettingsMic){
      btnVoiceSettingsMic.onclick=function(){
        var details=$('voiceMicPickerDetails');
        if(details){
          details.open=true;
          var btn=$('btnVoiceSideMicSelect');
          if(btn) btn.setAttribute('aria-expanded','true');
        }
        hooks.focusSettingsField('mic');
      };
    }
    var btnVoiceModeMetaDetails=$('btnVoiceModeMetaDetails');
    if(btnVoiceModeMetaDetails){
      btnVoiceModeMetaDetails.onclick=function(){
        var det=$('voiceRecognizeEngineDetails');
        if(det){
          det.open=true;
          det.scrollIntoView({behavior:'smooth',block:'start'});
          setRecognizeNavActive('voiceAdvancedSection');
        }
      };
    }
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
      else{
        var micBtn=$('btnVoiceSettingsMic');
        if(micBtn) micBtn.click();
      }
    }
    var btnVoiceTestTop=$('btnVoiceTestTop');
    if(btnVoiceTestTop) btnVoiceTestTop.onclick=runVoiceTestOnce;
    var btnVoiceTestMic=$('btnVoiceTestMic');
    if(btnVoiceTestMic) btnVoiceTestMic.onclick=runVoiceTestOnce;
    var btnVoiceEnabled=$('btnVoiceEnabled');
    if(btnVoiceEnabled){
      btnVoiceEnabled.onclick=function(){
        if(hooks.homeToggleVoiceWake) hooks.homeToggleVoiceWake();
      };
    }
    var btnVoiceRecognizeChange=$('btnVoiceRecognizeChange');
    if(btnVoiceRecognizeChange){
      btnVoiceRecognizeChange.onclick=function(){
        var det=$('voiceRecognizeEngineDetails');
        if(det){
          det.open=true;
          det.scrollIntoView({behavior:'smooth',block:'start'});
          setRecognizeNavActive('voiceAdvancedSection');
        }
      };
    }
    var voiceRecognizeNav=$('voiceRecognizeNav');
    if(voiceRecognizeNav){
      voiceRecognizeNav.addEventListener('click',function(e){
        var link=e.target.closest&&e.target.closest('.voice-recognize-nav-link');
        if(!link) return;
        setRecognizeNavActive((link.getAttribute('href')||'').replace(/^#/,''));
      });
    }
    var voiceInputTriggerModes=$('voiceInputTriggerModes');
    if(voiceInputTriggerModes){
      voiceInputTriggerModes.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-trigger-mode]');
        if(!btn||btn.disabled) return;
        e.preventDefault();
        voiceInputTriggerModes.querySelectorAll('.keys-trigger-mode-seg').forEach(function(seg){
          seg.classList.toggle('is-active',seg===btn);
        });
      });
    }
    var voiceRecognizeSourceGrid=$('voiceRecognizeSourceGrid');
    if(voiceRecognizeSourceGrid){
      voiceRecognizeSourceGrid.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-engine-tab]');
        if(!btn||btn.disabled) return;
        e.preventDefault();
        var mode=btn.getAttribute('data-voice-engine-tab');
        if(mode!=='sapi'&&mode!=='vosk') return;
        if(mode==='sapi'&&global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return;
        if(hooks.setVoiceWakeExpandedMode) hooks.setVoiceWakeExpandedMode(mode);
        if(hooks.switchVoiceMode) hooks.switchVoiceMode(mode,{toastKind:'lite'});
      });
    }
    var voiceOutputModeSegments=$('voiceOutputModeSegments');
    if(voiceOutputModeSegments){
      voiceOutputModeSegments.addEventListener('click',function(e){
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
        var phrase=input?global.OneToneVoicePhraseCustom.readInput(inputId):'';
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
        if(listen&&listen.fillInputAsync){
          listen.fillInputAsync(inputId,btn);
        }else if(listen&&listen.fillInput){
          listen.fillInput(inputId);
        }
      };
    }
    bindPhraseListen('btnVoiceWakeCustomListen','voiceWakeCustomInput');
    bindPhraseListen('btnVoiceEndCustomListen','voiceEndCustomInput');
    var btnVoiceOpenKeysApps=$('btnVoiceOpenKeysApps');
    if(btnVoiceOpenKeysApps){
      btnVoiceOpenKeysApps.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('keys');
      };
    }
    var btnVoiceGoRuntime=$('btnVoiceGoRuntime');
    if(btnVoiceGoRuntime) btnVoiceGoRuntime.onclick=function(){ hooks.setSettingsPanel('debug'); };
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
    bindFlowLangToggle('voiceWakeLangToggle','__vp_voice_wake_lang__');
    bindFlowLangToggle('voiceEndLangToggle','__vp_voice_end_lang__');
    var btnVoiceEndAudioSettings=$('btnVoiceEndAudioSettings');
    if(btnVoiceEndAudioSettings) btnVoiceEndAudioSettings.onclick=function(){
      hooks.openSettings({panel:'sounds',focus:'recordingAudio'});
    };
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
    var voiceDiagTabs=$('voiceDiagTabs');
    if(voiceDiagTabs){
      voiceDiagTabs.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-diag-tab]');
        if(!btn) return;
        hooks.setVoiceDiagTab(btn.dataset.diagTab||'sapi');
      });
    }
  }
  global.OneToneVoiceUiBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
