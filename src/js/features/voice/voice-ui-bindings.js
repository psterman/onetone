(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    var t=hooks.t;
    var voiceEngineTabbar=$('voiceEngineTabbar');
    if(voiceEngineTabbar){
      voiceEngineTabbar.addEventListener('click',function(e){
        var tab=e.target.closest&&e.target.closest('[data-voice-engine-tab]');
        if(!tab) return;
        e.preventDefault();
        var mode=tab.dataset.voiceEngineTab;
        if(mode!=='sapi'&&mode!=='vosk') return;
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
    if(btnVoskDownloadGuide) btnVoskDownloadGuide.onclick=function(e){ e.stopPropagation(); hooks.downloadVoskModelGuide&&hooks.downloadVoskModelGuide(); };
    var btnVoskRetry=$('btnVoskRetry');
    if(btnVoskRetry) btnVoskRetry.onclick=function(e){ e.stopPropagation(); hooks.retryVoskStart&&hooks.retryVoskStart(); };
    var voiceVoskWakeWrap=$('voiceSettingsVoskWakeWrap');
    if(voiceVoskWakeWrap) voiceVoskWakeWrap.onclick=hooks.addVoiceVoskPreset;
    var voiceVoskModelPreset=$('voiceVoskModelPreset');
    if(voiceVoskModelPreset){
      voiceVoskModelPreset.onclick=function(ev){
        var btn=ev.target.closest&&ev.target.closest('[data-preset]');
        if(!btn||btn.disabled) return;
        if(hooks.syncVoiceVoskPresetButtons) hooks.syncVoiceVoskPresetButtons(btn.getAttribute('data-preset')||'cn-light',false);
        hooks.changeVoiceVoskModelPreset();
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
        var card=$('voiceModePanelDetails');
        if(card) card.scrollIntoView({behavior:'smooth',block:'start'});
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
