/** Minimal i18n for OS tray webview — avoids loading full i18n.js */
(function (global) {
  'use strict';
  var ZH = {
    trayChVoiceMaster: '语音听写',
    trayChVoiceMasterHint: '关闭后不再监听语音',
    trayChVoiceEnd: '说结束词就停',
    trayChVoiceEndHint: '例如：就这样、结束输入',
    trayChKeysUseScenario: '使用这个场景',
    trayChKeysUseScenarioHint: '关了就按了也没反应',
    trayChKeysCancel: '再按一次能取消',
    trayChKeysCancelHint: '听写中途可退出',
    trayChKeysAutoSend: '输完自动发送',
    trayChKeysAutoSendHint: '输入完成后自动回车',
    trayChPadEnabled: '启用小键盘',
    trayChPadEnabledHint: '打开后可使用屏幕小键盘',
    trayChPadShowKeyboard: '显示屏幕键盘',
    trayChPadShowKeyboardHint: '在屏幕上弹出可点的键',
    trayChCamPresence: '认人脸走/回',
    trayChCamPresenceHint: '走开、回到座位会有反应',
    trayChCamAutoMute: '走远自动关麦',
    trayChCamAutoMuteHint: '人离开画面时静音麦克风',
    channelConfigTrayShow: '托盘里显示',
    channelConfigBasic: '基础配置',
    trayChGoSettings: '完整设置 ▸',
    trayChGoHabits: '去习惯页 ▸',
    trayChGoDebug: '查看运行详情 ▸',
    trayChEventEmpty: '暂无动静',
    trayChEventFriendly: '刚刚有活动',
    trayHabitWeekActive: '本周有使用',
    trayLayoutHero: '顶部状态卡',
    trayLayoutEvent: '最近发生的事',
    trayLayoutShowVoice: '显示语音',
    trayLayoutShowKeys: '显示按键',
    trayLayoutShowSoftPad: '显示小键盘',
    trayLayoutShowCamera: '显示摄像头',
    trayInspectorReadonly: '只读预览',
    trayInspectorTitle: '通道预览',
    trayQuickMore: '更多 ▸'
  };
  global.OneToneI18n = {
    t: function (key, fb) {
      if (ZH[key]) return ZH[key];
      return fb || key;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
