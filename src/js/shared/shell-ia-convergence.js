/**
 * Phase2a：主 shell IA 收敛表（非 React 迁移）。
 * 导航归属：回首页 / 进设置 / 是否深水区·Pro。
 */
(function (global) {
  'use strict';

  var NAV = {
    home: { panel: null, home: true, deep: false, pro: false, note: 'closeDrawer' },
    schemes: { panel: 'habits', home: false, deep: false, pro: false, note: 'primary' },
    triggers: { panel: 'keys', home: false, deep: true, pro: false, note: 'mid' },
    softPad: { panel: 'softPad', home: false, deep: true, pro: false, note: 'mid' },
    voice: { panel: 'voiceWake', home: false, deep: true, pro: false, note: 'mid' },
    camera: { panel: 'camera', home: false, deep: true, pro: true, note: 'pro-no-home-cta' },
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
