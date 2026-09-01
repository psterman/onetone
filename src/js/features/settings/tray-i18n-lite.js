/** Minimal i18n for OS tray webview — avoids loading full i18n.js */
(function (global) {
  'use strict';
  var ZH = {
    trayChVoiceMaster: '语音输入',
    trayChVoiceMasterHint: '对着麦说话，自动变文字',
    trayChVoiceEnd: '说完就停',
    trayChVoiceEndHint: '可说结束词结束输入',
    trayChKeysUseScenario: '快捷键',
    trayChKeysUseScenarioHint: '按快捷键能触发功能',
    trayChKeysCancel: '再按可取消',
    trayChKeysCancelHint: '听写中途再按一次可退出',
    trayChKeysAutoSend: '自动发送',
    trayChKeysAutoSendHint: '输完自动按回车',
    trayChPadEnabled: '启用小键盘',
    trayChPadEnabledHint: '打开后可使用屏幕小键盘',
    trayChPadShowKeyboard: '显示小键盘',
    trayChPadShowKeyboardHint: '为助手弹出控制键',
    trayChPadRequireFg: '跟着前台助手',
    trayChPadRequireFgHint: '只在当前助手软件在前台时显示',
    trayChCamPresence: '镜头动作识别',
    trayChCamPresenceHint: '离席、手势等用摄像头触发',
    trayChCamTriggerAway: '检测离席',
    trayChCamTriggerAwayHint: '人离开画面时触发',
    trayChCamAutoMute: '走远自动静音',
    trayChCamAutoMuteHint: '离开镜头自动关麦',
    trayChCamNoFaceMute: '没人也静音',
    trayChCamNoFaceMuteHint: '画面里没人时关麦',
    channelConfigBasic: '基础配置',
    trayGoTrayMainSwitch: '去托盘调主开关',
    trayChGoSettings: '完整设置 ▸',
    trayChGoHabits: '去习惯页 ▸',
    trayChGoDebug: '查看运行详情 ▸',
    trayChEventEmpty: '暂无动静',
    trayChEventFriendly: '刚刚有活动',
    trayHabitWeekActive: '本周有使用',
    trayLayoutScene: '场景预设',
    trayLayoutChannelStatus: '通道状态',
    trayLayoutHero: '顶部状态卡',
    trayLayoutEvent: '最近发生的事',
    trayLayoutShowVoice: '显示语音',
    trayLayoutShowKeys: '显示按键',
    trayLayoutShowSoftPad: '显示小键盘',
    trayLayoutShowCamera: '显示摄像头',
    trayHeroNoHabit: '未配置习惯'
  };
  global.OneToneI18n = {
    t: function (key, fb) {
      if (ZH[key]) return ZH[key];
      return fb || key;
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
