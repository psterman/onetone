(function (global) {
  'use strict';

  // Product voice entry is voiceLab; drawer still accepts legacy voiceWake aliases.
  global.HOME_VOICE_LINK_MAP = {
    editWake: { panel: 'voiceLab', focus: 'wake' },
    mic: { panel: 'voiceLab', focus: 'mic' },
    endPhrases: { panel: 'voiceLab', focus: 'finish' },
    engine: { panel: 'voiceLab', focus: 'engine' },
    softpad: { panel: 'voiceLab', focus: 'softpad' },
    keys: { panel: 'voiceLab', focus: 'keys' },
    camera: { panel: 'voiceLab', focus: 'camera' },
    helpDebug: { panel: 'debug', debugMode: 'repair' },
  };

  global.HOME_VOICE_LINK_LABEL_KEYS = {
    editWake: 'homeVoiceSimpleLinkWake',
    mic: 'homeVoiceSimpleLinkMic',
    endPhrases: 'homeVoiceSimpleLinkEnd',
    engine: 'homeVoiceSimpleLinkEngine',
    helpDebug: 'homeVoiceSimpleLinkHelp',
  };
})(typeof window !== 'undefined' ? window : globalThis);
