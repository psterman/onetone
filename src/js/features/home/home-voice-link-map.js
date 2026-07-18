(function(global){
  'use strict';

  global.HOME_VOICE_LINK_MAP={
    editWake:{ panel:'voiceWake', focus:'wakePhrases' },
    mic:{ panel:'voiceWake', focus:'mic' },
    endPhrases:{ panel:'voiceWake', focus:'endPhrases' },
    engine:{ panel:'voiceWake', focus:'engine' },
    helpDebug:{ panel:'debug', debugMode:'repair' }
  };

  global.HOME_VOICE_LINK_LABEL_KEYS={
    editWake:'homeVoiceSimpleLinkWake',
    mic:'homeVoiceSimpleLinkMic',
    endPhrases:'homeVoiceSimpleLinkEnd',
    engine:'homeVoiceSimpleLinkEngine',
    helpDebug:'homeVoiceSimpleLinkHelp'
  };
})((typeof window!=='undefined')?window:globalThis);
