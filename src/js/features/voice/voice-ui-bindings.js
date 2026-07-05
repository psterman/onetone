(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    var t=hooks.t;
    var btnVoiceSapi=$('btnVoiceSapi');
    if(btnVoiceSapi) btnVoiceSapi.onclick=function(e){ e.stopPropagation(); hooks.toggleVoiceSapi(); };
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
    var btnVoiceVosk=$('btnVoiceVosk');
    if(btnVoiceVosk) btnVoiceVosk.onclick=function(e){ e.stopPropagation(); hooks.toggleVoiceVosk(); };
    if(hooks.bindVoiceModeCard) hooks.bindVoiceModeCard('btnVoiceModeVosk','vosk');
    var btnVoiceVoskTest=$('btnVoiceVoskTest');
    if(btnVoiceVoskTest) btnVoiceVoskTest.onclick=hooks.testVoiceVoskSend;
    var btnVoskOpenResources=$('btnVoskOpenResources');
    if(btnVoskOpenResources) btnVoskOpenResources.onclick=function(e){ e.stopPropagation(); hooks.openVoskResourcesDir&&hooks.openVoskResourcesDir(); };
    var btnVoskDownloadGuide=$('btnVoskDownloadGuide');
    if(btnVoskDownloadGuide) btnVoskDownloadGuide.onclick=function(e){ e.stopPropagation(); hooks.downloadVoskModelGuide&&hooks.downloadVoskModelGuide(); };
    var btnVoskRetry=$('btnVoskRetry');
    if(btnVoskRetry) btnVoskRetry.onclick=function(e){ e.stopPropagation(); hooks.retryVoskStart&&hooks.retryVoskStart(); };
    var voiceVoskPresetsWrap=$('voiceVoskPresetsWrap');
    if(voiceVoskPresetsWrap) voiceVoskPresetsWrap.onclick=hooks.addVoiceVoskPreset;
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
    var btnVoiceSettingsModeSapi=$('btnVoiceSettingsModeSapi');
    if(btnVoiceSettingsModeSapi) btnVoiceSettingsModeSapi.onclick=function(){ hooks.switchVoiceMode('sapi'); };
    var btnVoiceSettingsModeVosk=$('btnVoiceSettingsModeVosk');
    if(btnVoiceSettingsModeVosk) btnVoiceSettingsModeVosk.onclick=function(){ hooks.switchVoiceMode('vosk'); };
    var btnVoiceSettingsMic=$('btnVoiceSettingsMic');
    if(btnVoiceSettingsMic){
      btnVoiceSettingsMic.onclick=function(){
        var details=$('voiceMicPickerDetails');
        if(details) details.open=true;
        hooks.focusSettingsField('mic');
      };
    }
    var btnVoiceGoRuntime=$('btnVoiceGoRuntime');
    if(btnVoiceGoRuntime) btnVoiceGoRuntime.onclick=function(){ hooks.setSettingsPanel('debug'); };
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
