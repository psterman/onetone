(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_home_lang_hooks__ || {}; }

  function applyHomeLiveLang(){
    var d=global.OneToneI18n.dict();
    [
      ['homeLiveKeyTitle',d.homeLiveKeyTitle],['homeLiveVoiceTitle',d.homeLiveVoiceTitle],
      ['homeVoiceMapWakeLbl',d.homeVoiceMapWakeLbl],['homeVoiceWakeMicLbl',d.homeVoiceWakeMicLbl],
      ['homeVoiceEngineBarLbl',d.homeVoiceMapEngineLbl],
      ['homeVoiceMapEngineLbl',d.homeVoiceMapEngineLbl],
      ['homeVoiceMapEndPhraseLblText',d.homeVoiceMapEndPhraseLbl],
      ['voiceSettingsWakeLbl',d.homeVoiceMapWakeLbl],['voiceSettingsEngineLbl',d.homeVoiceMapEngineLbl],
      ['voiceSettingsEndPhraseLbl',d.homeVoiceMapEndPhraseLbl],['voiceSettingsAutoLbl',d.homeLiveEndAutoShort],
      ['voiceMicPickerSummary',d.voiceSettingsMicPickerSummary],
      ['btnVoiceSettingsModeSapi',d.homeVoiceMapEngineSapi],['btnVoiceSettingsModeVosk',d.homeVoiceMapEngineVosk],
      ['homeVoiceMapArrowSayText',d.homeVoiceMapArrowSay],['homeVoiceMapArrowListenText',d.homeVoiceMapArrowListen],
      ['homeVoiceMapArrowEndText',d.homeVoiceMapArrowEnd],
      ['homeKeyMapTitle',d.homeKeyMapTitle],['homeKeyMapSchemeLbl',d.homeKeyMapSchemeLbl],
      ['homeKeyMapTriggerLbl',d.homeLiveTrigger],['homeKeyMapTargetLbl',d.homeLiveTarget],
      ['homeKeyMapTriggerHint',d.homeKeyMapTriggerHint],['homeKeyMapTargetHint',d.homeKeyMapTargetHint],
      ['homeKeyMapArrowText',d.homeKeyMapArrowText],['homeKeyMapFinishLbl',d.homeKeyMapFinishLbl],
      ['homeKeyMapArrowFinishText',d.homeKeyMapArrowFinishText],
      ['homeVoiceWakeFloatHint',d.homeVoiceWakeFloatHint],
      ['homeLiveEndEnabledLbl',d.homeLiveEndEnabledLbl],['homeLiveEndAutoLbl',d.homeLiveEndAutoShort],
      ['btnHomeManageSchemes',d.homeSchemeManage]
    ].forEach(function(pair){
      var el=$(pair[0]); if(el) el.textContent=pair[1];
    });
    var gearEnd=$('btnHomeEndSettings');
    if(gearEnd) gearEnd.setAttribute('aria-label',d.homeVoiceGearSettingsEnd);
    var gearAuto=$('btnHomeAutoSettings');
    if(gearAuto) gearAuto.setAttribute('aria-label',d.homeVoiceGearSettingsAuto);
    hooks().renderHomeLiveVoicePanel(!global.OneToneConfigPersist.isLoaded());
    hooks().refreshHomeGuideIfOpen(true);
  }

  global.OneToneAppHomeLang={applyHomeLiveLang:applyHomeLiveLang};
})((typeof window!=='undefined')?window:globalThis);
