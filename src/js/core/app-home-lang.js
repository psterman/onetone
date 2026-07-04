(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_home_lang_hooks__ || {}; }

  function applyHomeLiveLang(){
    var d=global.OneToneI18n.dict();
    [
      ['homeLiveKeyTitle',d.homeLiveKeyTitle],['homeLiveVoiceTitle',d.homeLiveVoiceTitle],
      ['voiceSettingsWakeLbl',d.homeVoiceMapWakeLbl],['voiceSettingsEngineLbl',d.homeVoiceMapEngineLbl],
      ['voiceSettingsEndPhraseLbl',d.homeVoiceMapEndPhraseLbl],['voiceSettingsAutoLbl',d.homeLiveEndAutoShort],
      ['voiceMicPickerSummary',d.voiceSettingsMicPickerSummary],
      ['voiceSettingsSapiSensTitle',d.voiceSapiSensMatchTitle],['voiceSettingsSapiSensDesc',d.voiceSapiSensMatchNote],
      ['voiceSettingsSapiSensLbl',d.voiceSapiSensCurrentLbl],['voiceSapiSensLbl',d.voiceSapiSensCurrentLbl],
      ['voiceSapiSensSectionTitle',d.voiceSapiSensMatchTitle],['voiceSapiSensSectionNote',d.voiceSapiSensMatchNote],
      ['btnVoiceSettingsModeSapi',d.homeVoiceMapEngineSapi],['btnVoiceSettingsModeVosk',d.homeVoiceMapEngineVosk],
      ['homeKeyMapTitle',d.homeKeyMapTitle],['homeKeyMapSchemeLbl',d.homeKeyMapSchemeLbl],
      ['homeKeyMapTriggerLbl',d.homeLiveTrigger],['homeKeyMapTargetLbl',d.homeLiveTarget],
      ['homeKeyMapTriggerHint',d.homeKeyMapTriggerHint],['homeKeyMapTargetHint',d.homeKeyMapTargetHint],
      ['homeKeyMapArrowText',d.homeKeyMapArrowText],['homeKeyMapFinishLbl',d.homeKeyMapFinishLbl],
      ['homeKeyMapArrowFinishText',d.homeKeyMapArrowFinishText],
      ['btnHomeManageSchemes',d.homeSchemeManage]
    ].forEach(function(pair){
      var el=$(pair[0]); if(el) el.textContent=pair[1];
    });
    for(var si=0;si<6;si++){
      var lbl=d['voiceSapiSens'+si];
      var btn=$('btnVoiceSapiSens'+si);
      if(btn) btn.textContent=lbl;
      var btn2=$('btnVoiceSettingsSapiSens'+si);
      if(btn2) btn2.textContent=lbl;
    }
    hooks().renderHomeLiveVoicePanel(!global.OneToneConfigPersist.isLoaded());
    hooks().refreshHomeGuideIfOpen(true);
  }

  global.OneToneAppHomeLang={applyHomeLiveLang:applyHomeLiveLang};
})((typeof window!=='undefined')?window:globalThis);
