// Dynamic command palette registration — all settings panels and sub-cards.
// Called once after settings drawer DOM is ready.
// Each entry provides: id, title (searchable), keywords, group, and a jump action.

(function registerPaletteCommands() {
  'use strict';

  var ui = window.OneToneUi;
  if (!ui || typeof ui.registerCommands !== 'function') return;

  var jumpAndHighlight = window.__otJumpAndHighlight;
  if (typeof jumpAndHighlight !== 'function') {
    // Fallback: open panel only, no scroll/highlight
    jumpAndHighlight = function (panel) {
      var drawer = window.OneToneSettingsDrawer;
      if (drawer && drawer.open) drawer.open({ panel: panel });
    };
  }

  function t(key) {
    var i18n = window.OneToneI18n;
    return i18n && typeof i18n.t === 'function' ? i18n.t(key) : key;
  }

  var group = t('homeWbCmdkHintSettings');

  var items = [
    // --- voiceWake panel ---
    {
      id: 'voice',
      title: t('homeWbNavVoice'),
      keywords: ['语音', 'voice', 'vosk', 'whisper', '语音设置'],
      group: group,
      run: function () { jumpAndHighlight('voiceWake'); },
    },
    {
      id: 'model',
      title: t('homeWbQuickSwitchModel'),
      keywords: ['语音模型', 'vosk', 'whisper', 'model', '切换'],
      group: group,
      run: function () { jumpAndHighlight('voiceWake', 'voiceSettingsWakeCard'); },
    },
    {
      id: 'wakeWord',
      title: '唤醒词',
      keywords: ['wake', 'wakeword', '唤醒', '热词'],
      group: group,
      run: function () { jumpAndHighlight('voiceWake', 'voiceWakeCustomDetails'); },
    },
    {
      id: 'listenStrategy',
      title: '监听策略',
      keywords: ['listen', 'strategy', '监听', '识别模式'],
      group: group,
      run: function () { jumpAndHighlight('voiceWake', 'voiceSettingsWakeBody'); },
    },

    // --- keys panel ---
    {
      id: 'triggers',
      title: t('homeWbNavTriggers'),
      keywords: ['按键', 'keys', 'hotkey', 'trigger', '快捷键', '触发键', '热键'],
      group: group,
      run: function () { jumpAndHighlight('keys'); },
    },

    // --- softPad panel ---
    {
      id: 'softPad',
      title: t('homeWbNavSoftPad'),
      keywords: ['虚拟键盘', 'soft pad', 'softpad', '悬浮', '面板'],
      group: group,
      run: function () { jumpAndHighlight('softPad'); },
    },

    // --- habits panel ---
    {
      id: 'schemes',
      title: t('homeWbNavSchemes'),
      keywords: ['习惯', 'scheme', 'habit', '场景', '情景模式'],
      group: group,
      run: function () { jumpAndHighlight('habits'); },
    },

    // --- sounds panel ---
    {
      id: 'sounds',
      title: t('homeWbNavSounds'),
      keywords: ['声音', 'sound', 'audio', '反馈', '提示音', '音效'],
      group: group,
      run: function () { jumpAndHighlight('sounds'); },
    },

    // --- camera panel ---
    {
      id: 'camera',
      title: t('homeWbNavCamera'),
      keywords: ['摄像头', 'camera', '视觉', '人脸'],
      group: group,
      run: function () { jumpAndHighlight('camera'); },
    },
    {
      id: 'cameraAway',
      title: '离席检测',
      keywords: ['离席', 'away', 'presence', '离开'],
      group: group,
      run: function () { jumpAndHighlight('camera', 'cameraPresenceConfig'); },
    },
    {
      id: 'cameraReturn',
      title: '回席检测',
      keywords: ['回席', 'return', '回来'],
      group: group,
      run: function () { jumpAndHighlight('camera', 'cameraPresenceConfig'); },
    },
    {
      id: 'cameraShake',
      title: '摇头手势',
      keywords: ['摇头', 'shake', 'headshake', '手势'],
      group: group,
      run: function () { jumpAndHighlight('camera', 'cameraRulesBasic'); },
    },
    {
      id: 'cameraBlink',
      title: '眨眼确认',
      keywords: ['眨眼', 'blink', '故意眨眼'],
      group: group,
      run: function () { jumpAndHighlight('camera', 'cameraRulesBasic'); },
    },

    // --- general / basic panel ---
    {
      id: 'general',
      title: t('homeWbNavGeneral'),
      keywords: ['通用', 'general', '语言', 'language', '开机启动', 'startup', '外观', '主题'],
      group: group,
      run: function () { jumpAndHighlight('basic'); },
    },

    // --- debug panel ---
    {
      id: 'runtime',
      title: t('homeWbNavRuntime'),
      keywords: ['运行状态', 'runtime', 'debug', '日志', 'log', '维护', '诊断'],
      group: group,
      run: function () { jumpAndHighlight('debug', null, { debugMode: 'overview' }); },
    },
  ];

  ui.registerCommands(items);
})();
