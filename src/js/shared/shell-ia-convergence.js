/**
 * Phase2a：主 shell IA 收敛表（非 React 迁移）。
 * 导航归属：回首页 / 进设置 / 是否深水区·Pro。
 */
(function (global) {
  'use strict';

  var NAV = {
    home: { panel: null, home: true, deep: false, pro: false, note: 'now-cockpit' },
    schemes: { panel: 'habits', home: false, deep: false, pro: false, note: 'primary' },
    // Classic Keys nav redirects to action-chain desk (multi-dir page kept as DOM host only).
    triggers: { panel: 'keysSeq', home: false, deep: false, pro: false, note: 'redirect-keysSeq' },
    keysSeq: { panel: 'keysSeq', home: false, deep: false, pro: false, note: 'action-chain' },
    keys2: { panel: 'habits', home: false, deep: true, pro: false, note: 'redirect-habits-lanes' },
    // Soft Pad 入口并入键盘（共用 Soft Pad 正文 + keyboard surface）
    softPad: { panel: 'keyboard', home: false, deep: true, pro: false, note: 'alias-keyboard', focus: 'softPadDisplay' },
    keyboard: { panel: 'keyboard', home: false, deep: true, pro: false, note: 'vk-hub', focus: 'softPadLayout' },
    agent: { panel: 'agent', home: false, deep: true, pro: false, note: 'agent-dir' },
    composerHistory: { panel: 'composerHistory', home: false, deep: false, pro: false, note: 'send-journal' },
    agentData: { panel: 'agent', home: false, deep: true, pro: false, note: 'agent-data-leaf', agentSub: 'data' },
    // Product voice entry is voiceLab; classic voiceWake remains for legacy:true opens.
    voice: { panel: 'voiceLab', home: false, deep: false, pro: false, note: 'alias-voiceLab' },
    voiceLab: { panel: 'voiceLab', home: false, deep: false, pro: false, note: 'mac-voice-lab' },
    camera: { panel: 'camera', home: false, deep: true, pro: true, note: 'pro-no-home-cta' },
    camera2: { panel: 'camera2', home: false, deep: true, pro: false, note: 'goal-mgmt' },
    tray: { panel: 'tray', home: false, deep: true, pro: false, note: 'mid' },
    sounds: { panel: 'sounds', home: false, deep: false, pro: false, note: 'shallow' },
    general: { panel: 'basic', home: false, deep: false, pro: false, note: 'shallow' },
    runtime: { panel: 'debug', home: false, deep: true, pro: false, note: 'repair-entry', debugMode: 'overview' },
    maintenance: { panel: 'debug', home: false, deep: true, pro: false, note: 'repair-entry', debugMode: 'repair' },
  };

  function resolve(navKey) {
    return NAV[String(navKey || '')] || null;
  }

  /** 首页主 CTA 禁止指向的 nav（Camera Pro 等） */
  function isForbiddenHomeCta(navKey) {
    var row = resolve(navKey);
    return !!(row && row.pro);
  }

  global.OneToneShellIaConvergence = {
    NAV: NAV,
    resolve: resolve,
    isForbiddenHomeCta: isForbiddenHomeCta,
  };
})(typeof window !== 'undefined' ? window : globalThis);
