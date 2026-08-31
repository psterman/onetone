/**
 * Tray inventory — switches-only preview (no status pills / event / hero state)
 */
(function (global) {
  'use strict';

  var CH = { voice: '语音', keys: '按键', softPad: '小键盘', camera: '摄像头', mic: '麦克风' };
  var ICONS = { voice: '🎤', keys: '⌨', softPad: '▦', camera: '📷', mic: '🎙' };

  /** Camera catalog: settings page → tray eligibility (decoupled from block:channel:camera) */
  var CAMERA_CATALOG = [
    { id: 'presenceMaster', setting: '视觉识别总开关', stateKey: 'presenceActions.enabled', tray: 'L1', beg: 'no', vibe: 'yes', freq: '中' },
    { id: 'triggerAway', setting: '离席识别', stateKey: 'presenceActions.triggers.away', tray: 'L2', beg: 'no', vibe: 'yes', freq: '中', needs: 'presenceMaster' },
    { id: 'triggerShake', setting: '摇头识别', stateKey: 'presenceActions.triggers.shake', tray: 'P1', beg: 'no', vibe: 'maybe', freq: '低', needs: 'presenceMaster' },
    { id: 'triggerBlink', setting: '故意眨眼识别', stateKey: 'presenceActions.triggers.blink', tray: 'P1', beg: 'no', vibe: 'maybe', freq: '低', needs: 'presenceMaster' },
    { id: 'autoMuteEnable', setting: '启用 Auto Mute', stateKey: 'autoMute.enabled', tray: 'L1', beg: 'no', vibe: 'yes', freq: '高', needs: null },
    { id: 'autoMuteNoFace', setting: '离开视野也静音', stateKey: 'autoMute.noFaceMute', tray: 'L2', beg: 'no', vibe: 'yes', freq: '中', needs: 'autoMuteEnable' },
    { id: 'autoMuteShowStatus', setting: '显示麦克风状态', stateKey: 'autoMute.showStatus', tray: 'L3', beg: 'no', vibe: 'maybe', freq: '低', needs: 'autoMuteEnable' },
    { id: 'onAwayAction', setting: '离席时执行什么', stateKey: 'presenceActions.onAway', tray: '专页', beg: 'no', vibe: 'no', freq: '低' },
    { id: 'onReturnAction', setting: '回席时执行什么', stateKey: 'presenceActions.onReturn', tray: '专页', beg: 'no', vibe: 'no', freq: '低' },
    { id: 'devicePreview', setting: '预览 / 选设备 / 校准', stateKey: '—', tray: '专页', beg: 'no', vibe: 'no', freq: '低' },
    { id: 'gazeCalibration', setting: '看屏幕哪里确认', stateKey: 'gazeCalibration', tray: '专页', beg: 'no', vibe: 'no', freq: '低' },
    { id: 'layoutManage', setting: '布局管理', stateKey: '—', tray: '专页', beg: 'no', vibe: 'no', freq: '低' },
    { id: 'healthReminder', setting: '健康提醒', stateKey: '—', tray: '专页', beg: 'no', vibe: 'no', freq: '低' },
    { id: 'proGestures', setting: 'Pro 手势绑定', stateKey: '—', tray: '专页', beg: 'no', vibe: 'no', freq: '低' },
    { id: 'actionHistory', setting: '动作提示历史', stateKey: 'action_history.camera', tray: 'L1', beg: 'no', vibe: 'yes', freq: '高' }
  ];

  /** 摄像头通道能力范围（托盘内用胶囊展示，不逐项枚举开关） */
  var CAMERA_SCOPE = ['视线追踪', '布局管理', '健康提醒', '手势', '动作提示历史'];

  /** ponytail: 原型 mock，生产接 action_history.byChannel.camera */
  var CAMERA_ACTION_HISTORY_MOCK = [
    { ic: '🚶', action: '检测离席', result: '已暂停语音输入', ago: '2 分钟前' },
    { ic: '👋', action: '挥手手势', result: '听写已取消', ago: '18 分钟前' },
    { ic: '👀', action: '视线看向副屏', result: '已切换布局焦点', ago: '1 小时前' }
  ];

  /** Habits: Hub-only inventory (nothing in tray) */
  var HABITS_CATALOG = [
    { label: '当前场景名称与摘要', hub: 'Hub 顶栏', tray: '不进', why: '托盘不做状态展示' },
    { label: '切换上一套 / 下一套', hub: 'Hub 卡片', tray: '不进', why: '内容管理，非运行时开关' },
    { label: '启用当前场景', hub: '场景卡 / P1', tray: '不进', why: '与按键「使用这个场景」重复，放 Hub' },
    { label: '新建 / 复制 / 删除习惯', hub: 'Hub 列表', tray: '不进', why: 'CRUD' },
    { label: '规则表 / 应用范围', hub: 'Programmer 表', tray: '不进', why: '编辑型' },
    { label: '新手场景卡（默认/微信/Cursor）', hub: 'Novice 模式', tray: '不进', why: '首启 Quick Start 已覆盖' }
  ];

  var CHANNEL_SWITCHES = {
    voice: {
      icon: 'voice',
      items: [
        { id: 'voiceListen', label: '语音输入', sub: '对着麦说话，自动变文字', hint: '适合边打字边口述', lvl: 'L1', beg: true, vibe: true },
        { id: 'voiceEnd', label: '说完就停', sub: '可说「就这样」结束输入', hint: '不用手动点停止', lvl: 'L1', beg: false, vibe: true }
      ],
      setup: '去设置语音'
    },
    keys: {
      icon: 'keys',
      items: [
        { id: 'mappingEnabled', label: '快捷键', sub: '按快捷键能触发功能', hint: '例如右 Alt 开始听写', lvl: 'L1', beg: false, vibe: true },
        { id: 'cancelEnabled', label: '再按可取消', sub: '听写中途再按一次可退出', hint: '避免误触后不好收场', lvl: 'L2', beg: false, vibe: true },
        { id: 'autoEnter', label: '自动发送', sub: '输完自动按回车', hint: '适合聊天窗口', lvl: 'L2', beg: false, vibe: true }
      ],
      setup: '去设置按键'
    },
    softPad: {
      icon: 'softPad',
      items: [
        { id: 'overlay', label: '显示小键盘', sub: '为 Codex / Claude 等助手弹出控制键', hint: '键位按 Agent 应用场景绑定，不是普通输入法', lvl: 'L1', beg: false, vibe: true },
        { id: 'requireFg', label: '跟着前台助手', sub: '只在当前助手软件在前台时显示', hint: '例如 Codex 窗口在前台才弹出', lvl: 'L2', beg: false, vibe: true },
        { id: 'navKeys', label: '键位翻页', sub: '一个 Agent 有多页键位时可切换', hint: '高级布局；多数用户可保持关闭', lvl: 'P1', beg: false, vibe: 'maybe' }
      ],
      setup: '去设置小键盘'
    },
    camera: {
      icon: 'camera',
      items: [
        { id: 'presenceMaster', label: '镜头动作识别', sub: '离席、手势等用摄像头触发', hint: '视线追踪、布局与健康提醒在设置页配置', lvl: 'L1', beg: false, vibe: true },
        { id: 'triggerAway', label: '检测离席', sub: '人离开画面时触发', hint: '需先开「镜头动作识别」', lvl: 'L2', beg: false, vibe: true, needs: 'presenceMaster' },
        { id: 'autoMuteEnable', label: '走远自动静音', sub: '离开镜头自动关麦', hint: '保护隐私', lvl: 'L1', beg: false, vibe: true },
        { id: 'autoMuteNoFace', label: '没人也静音', sub: '画面里没人时关麦', hint: '需先开「走远自动静音」', lvl: 'L2', beg: false, vibe: true, needs: 'autoMuteEnable' }
      ],
      setup: '去设置摄像头'
    },
    mic: {
      icon: 'mic',
      items: [
        { id: 'micMute', label: '麦克风静音', sub: '开着=别人听不到你', hint: '和系统静音不同，只管本应用', lvl: 'L1', beg: true, vibe: true }
      ],
      setup: null
    }
  };

  var DEFAULT_ON = {
    voiceListen: true, voiceEnd: true,
    mappingEnabled: true, cancelEnabled: true, autoEnter: true,
    overlay: true, requireFg: true, navKeys: false,
    presenceMaster: false, triggerAway: false, autoMuteEnable: false, autoMuteNoFace: false,
    micMute: false
  };

  var SCENE_GATES = {
    normal: { mic: true, cam: true, configured: { voice: true, keys: true, softPad: true, camera: true } },
    noMic: { mic: false, cam: true, configured: { voice: true, keys: true, softPad: true, camera: true } },
    noCam: { mic: true, cam: false, configured: { voice: true, keys: true, softPad: false, camera: false } },
    unconfigured: { mic: true, cam: true, configured: { voice: false, keys: false, softPad: false, camera: false } }
  };

  var PERSONA_CHANNELS = {
    beg: ['mic', 'voice'],
    vibe: ['voice', 'keys', 'softPad', 'camera', 'mic']
  };

  /** 场景预设（仅 2 个可点；自定义 = 状态行） */
  var SCENE_PRESETS = [
    { id: 'allOn', icon: '🔊', label: '正常使用', sub: '都能用', hint: '语音、快捷键、小键盘都开着' },
    { id: 'mute', icon: '🌙', label: '勿扰', sub: '静一静', hint: '关语音输入，麦克风静音' }
  ];

  var SCENE_MODE_LABEL = { allOn: '正常使用', mute: '勿扰', custom: '自定义' };
  var SCENE_MODE_ICON = { allOn: '🔊', mute: '🌙', custom: '✎' };
  var SW_INVERT_VISUAL = { micMute: true };
  /** 状态行摘要：用开关真值拼大白话，避免「按你的设置」看不懂 */
  var SCENE_DIGEST = {
    beg: [
      { id: 'voiceListen', on: '语音开着', off: '语音关着', ic: '🎤' },
      { id: 'micMute', on: '已静音', off: '麦开着', ic: '🎙' }
    ],
    vibe: [
      { id: 'voiceListen', on: '语音开着', off: '语音关着', ic: '🎤' },
      { id: 'micMute', on: '已静音', off: '麦开着', ic: '🎙' },
      { id: 'mappingEnabled', on: '快捷键开着', off: '快捷键关着', ic: '⌨' }
    ]
  };

  function sceneStatusDigest(personaId, sw) {
    var keys = SCENE_DIGEST[personaId] || SCENE_DIGEST.beg;
    return keys.map(function (k) {
      return sw[k.id] ? k.on : k.off;
    }).join(' · ');
  }

  function sceneStatusDigestHtml(personaId, sw) {
    var keys = SCENE_DIGEST[personaId] || SCENE_DIGEST.beg;
    return keys.map(function (k) {
      var on = !!sw[k.id];
      var cls = 'tray-digest-chip' + (on ? ' is-on' : ' is-off');
      var lbl = (k.ic ? k.ic + ' ' : '') + (on ? k.on : k.off);
      return '<span class="' + cls + '">' + lbl + '</span>';
    }).join('');
  }

  /** 相对当前，恢复时会改动的开关列表（按通道顺序整理） */
  function restoreDeltaLines(current, snap) {
    if (!snap || !Object.keys(snap).length) return null;
    var lines = [];
    Object.keys(CHANNEL_SWITCHES).forEach(function (ch) {
      CHANNEL_SWITCHES[ch].items.forEach(function (it) {
        if (snap[it.id] === undefined) return;
        if (!!snap[it.id] === !!current[it.id]) return;
        lines.push({
          id: it.id,
          label: it.label,
          from: current[it.id] ? '开' : '关',
          to: snap[it.id] ? '开' : '关'
        });
      });
    });
    return lines.length ? lines : null;
  }

  function renderRestorePanel(current, snap, sceneMode, changeLog) {
    if (sceneMode === 'custom') {
      if (!changeLog || !changeLog.length) return '';
      var latest = changeLog[0];
      var more = changeLog.length - 1;
      var moreHtml = more > 0
        ? '<div class="tray-change-more">另有 ' + more + ' 项 · ' +
          '<button type="button" class="tray-change-link" data-undo-all>全部恢复</button></div>'
        : '';
      return '<div class="tray-restore-panel tray-restore-panel--recent">' +
        '<div class="tray-change-bar">' +
        '<span class="tray-change-bar__text">' + escAttr(latest.label) + ' ' + latest.from + '→' + latest.to + '</span>' +
        '<button type="button" class="tray-change-btn" data-undo-last>撤销</button>' +
        '</div>' + moreHtml + '</div>';
    }
    var lines = restoreDeltaLines(current, snap);
    if (!lines || !lines.length) return '';
    var labels = lines.map(function (l) { return l.label; }).join('、');
    if (labels.length > 24) labels = labels.slice(0, 22) + '…';
    return '<div class="tray-restore-panel">' +
      '<div class="tray-restore-panel__head">' +
      '<span class="tray-restore-panel__title">将恢复 ' + lines.length + ' 项：' + escAttr(labels) + '</span>' +
      '<button type="button" class="tray-scene-status__restore" data-restore-custom>恢复上次</button>' +
      '</div></div>';
  }

  var SCENE_SWITCHES = {
    allOn: {
      voiceListen: true, voiceEnd: true, micMute: false,
      mappingEnabled: true, cancelEnabled: true, autoEnter: true,
      overlay: true, requireFg: true,
      presenceMaster: true, triggerAway: true, autoMuteEnable: true, autoMuteNoFace: true
    },
    mute: {
      voiceListen: false, voiceEnd: false, micMute: true,
      mappingEnabled: true, cancelEnabled: true, autoEnter: false,
      overlay: false, requireFg: false,
      presenceMaster: false, triggerAway: false, autoMuteEnable: false, autoMuteNoFace: false
    }
  };

  /** 小白向分组：按通道 subtab 切换，一次只显示一组 */
  var TRAY_TAB_META = {
    voice: { label: '语音', icon: '🎤' },
    keys: { label: '按键', icon: '⌨' },
    softPad: { label: '小键盘', icon: '▦' },
    camera: { label: '摄像头', icon: '📷' }
  };

  var TRAY_TAB_STATUS = {
    voice: [
      { id: 'voiceListen', icon: '🎤', ariaOn: '语音开', ariaOff: '语音关' },
      { id: 'micMute', icon: '🎙', invert: true, ariaOn: '麦开', ariaOff: '已静音' }
    ],
    keys: [{ id: 'mappingEnabled', icon: '⌨', ariaOn: '快捷键开', ariaOff: '快捷键关' }],
    softPad: [{ id: 'overlay', icon: '▦', ariaOn: '小键盘开', ariaOff: '小键盘关' }],
    camera: [{ id: 'presenceMaster', icon: '📷', ariaOn: '识别开', ariaOff: '识别关' }]
  };

  var TRAY_TAB_EXTRA = {
    voice: ['voiceEnd'],
    keys: ['cancelEnabled', 'autoEnter'],
    softPad: ['requireFg'],
    camera: ['triggerAway', 'autoMuteNoFace']
  };

  var TRAY_GROUPS = {
    beg: [
      { id: 'speak', tab: 'voice', label: '语音和麦克风', sub: '听你说 + 能不能听到', icon: '🎤', items: ['voiceListen', 'micMute'] }
    ],
    vibe: [
      { id: 'speak', tab: 'voice', label: '语音和麦克风', sub: '听你说 + 能不能听到', icon: '🎤', items: ['voiceListen', 'micMute'] },
      { id: 'keys', tab: 'keys', label: '快捷键', sub: '按键触发听写等功能', icon: '⌨', items: ['mappingEnabled'] },
      { id: 'agentPad', tab: 'softPad', label: '小键盘', sub: '管编程助手的屏幕键位方案', icon: '▦', items: ['overlay'] },
      { id: 'camera', tab: 'camera', label: '摄像头', sub: '镜头动作 + 智能提醒', icon: '📷', scope: CAMERA_SCOPE, items: ['presenceMaster', 'autoMuteEnable'] }
    ]
  };

  /** 托盘行图标（状态只看开关，不再另起一套说法） */
  var SW_ICON = {
    voiceListen: '🎤', voiceEnd: '💬', micMute: '🎙',
    mappingEnabled: '⌨', cancelEnabled: '↩', autoEnter: '↵',
    overlay: '▦', requireFg: '📱',
    presenceMaster: '📷', triggerAway: '🚶', autoMuteEnable: '🔇', autoMuteNoFace: '👤'
  };

  function swStateWord(on) { return on ? '开着' : '关着'; }

  function switchVisualOn(item, on) {
    return SW_INVERT_VISUAL[item.id] ? !on : on;
  }

  function tabChannelVisual(tab, sw) {
    if (tab === 'voice') {
      if (!sw.voiceListen) return 'off';
      if (sw.micMute) return 'warn';
      return 'on';
    }
    var items = TRAY_TAB_STATUS[tab];
    if (!items || !items.length) return 'off';
    return tabStatusActive(sw, items[0]) ? 'on' : 'off';
  }

  var STORAGE_KEY = 'trayProtoState';

  function loadPersistedState(state) {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function savePersistedState(state, sceneMode) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        switches: state.switches,
        sceneMode: sceneMode || '',
        customSnapshot: state.customSnapshot || null,
        manualChangeLog: state.manualChangeLog || [],
        fromPresetTweak: !!state._fromPresetTweak
      }));
    } catch (e) { /* ponytail: localStorage optional in prototype */ }
  }

  function snapshotCustom(state) {
    state.customSnapshot = Object.assign({}, state.switches);
  }

  function restoreCustom(state) {
    if (state.customSnapshot) {
      Object.keys(state.customSnapshot).forEach(function (k) {
        state.switches[k] = state.customSnapshot[k];
      });
    }
  }

  function findSwitchItem(swId) {
    var found = { ch: null, item: null };
    Object.keys(CHANNEL_SWITCHES).forEach(function (ch) {
      CHANNEL_SWITCHES[ch].items.forEach(function (it) {
        if (it.id === swId) { found.ch = ch; found.item = it; }
      });
    });
    return found;
  }

  function sceneMatches(id, sw) {
    var spec = SCENE_SWITCHES[id];
    if (!spec) return false;
    return Object.keys(spec).every(function (k) { return !!sw[k] === !!spec[k]; });
  }

  function normSceneMode(m) {
    if (m === 'dnd') return 'mute';
    return m || '';
  }

  function activeSceneQuick(personaId, sw, sceneMode) {
    sceneMode = normSceneMode(sceneMode);
    if (sceneMode === 'custom') return 'custom';
    if (sceneMode === 'allOn' || sceneMode === 'mute') {
      return sceneMatches(sceneMode, sw) ? sceneMode : 'custom';
    }
    if (sceneMatches('allOn', sw)) return 'allOn';
    if (sceneMatches('mute', sw)) return 'mute';
    return 'custom';
  }

  function recordManualChange(state, swId, fromOn, toOn) {
    if (!state.manualChangeLog) state.manualChangeLog = [];
    var hit = findSwitchItem(swId);
    state.manualChangeLog = state.manualChangeLog.filter(function (e) { return e.id !== swId; });
    state.manualChangeLog.unshift({
      id: swId,
      label: hit.item ? hit.item.label : swId,
      from: fromOn ? '开' : '关',
      to: toOn ? '开' : '关',
      prevOn: !!fromOn,
      ts: Date.now()
    });
    if (state.manualChangeLog.length > 12) state.manualChangeLog.length = 12;
  }

  function undoOneSwitch(state, swId) {
    if (!state.manualChangeLog || !state.manualChangeLog.length) return false;
    var entry = null;
    for (var i = 0; i < state.manualChangeLog.length; i++) {
      if (state.manualChangeLog[i].id === swId) { entry = state.manualChangeLog[i]; break; }
    }
    if (!entry) return false;
    state.switches[swId] = entry.prevOn != null ? !!entry.prevOn : (entry.from === '开');
    state.manualChangeLog = state.manualChangeLog.filter(function (e) { return e.id !== swId; });
    return true;
  }

  function undoLastSwitch(state) {
    if (!state.manualChangeLog || !state.manualChangeLog.length) return false;
    return undoOneSwitch(state, state.manualChangeLog[0].id);
  }

  function undoAllSwitches(state) {
    if (!state.manualChangeLog || !state.manualChangeLog.length) return false;
    state.manualChangeLog.forEach(function (e) {
      state.switches[e.id] = e.prevOn != null ? !!e.prevOn : (e.from === '开');
    });
    state.manualChangeLog = [];
    return true;
  }

  function captureCustomBaseline(state, prevMode) {
    prevMode = normSceneMode(prevMode);
    if (prevMode !== 'custom' || state._fromPresetTweak) return;
    snapshotCustom(state);
  }

  function applySceneQuick(id, sw) {
    id = normSceneMode(id);
    if (id === 'custom') return;
    var spec = SCENE_SWITCHES[id];
    if (!spec) return;
    Object.keys(spec).forEach(function (k) { sw[k] = spec[k]; });
  }

  function escAttr(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }

  function renderScopeChips(tags, highlightLast) {
    if (!tags || !tags.length) return '';
    return tags.map(function (t, i) {
      var cls = 'tray-scope-chip';
      if (highlightLast && i === tags.length - 1) cls += ' tray-scope-chip--hist';
      return '<span class="' + cls + '">' + escAttr(t) + '</span>';
    }).join('');
  }

  function renderActionHistoryBlock(open) {
    var chev = open ? '▾' : '▸';
    var btnCls = 'sw-group__history' + (open ? ' is-open' : '');
    var html = '<button type="button" class="' + btnCls + '" data-toggle-hist aria-expanded="' + (open ? 'true' : 'false') + '">' +
      '<span class="sw-group__history-ic">📜</span>' +
      '<span class="sw-group__history-text">' +
      '<span class="sw-group__history-lbl">动作提示历史</span>' +
      '<span class="sw-group__history-sub">离席、手势等最近触发了什么</span>' +
      '</span>' +
      '<span class="sw-group__history-go">' + chev + '</span></button>';
    if (!open) return html;
    var rows = CAMERA_ACTION_HISTORY_MOCK.map(function (e) {
      return '<li class="action-hist-item">' +
        '<span class="action-hist-item__ic" aria-hidden="true">' + e.ic + '</span>' +
        '<div class="action-hist-item__body">' +
        '<span class="action-hist-item__lbl">' + escAttr(e.action) + '</span>' +
        '<span class="action-hist-item__sub">' + escAttr(e.result) + '</span>' +
        '</div>' +
        '<span class="action-hist-item__ago">' + escAttr(e.ago) + '</span></li>';
    }).join('');
    return html +
      '<div class="action-hist-panel">' +
      '<ul class="action-hist-list">' + rows + '</ul>' +
      '<button type="button" class="action-hist-all" data-go="camera:actionHistory">查看全部记录 ▸</button>' +
      '</div>';
  }

  function tipAttrMerge(cls, s) {
    if (!s) return ' class="' + cls + '"';
    var t = escAttr(s);
    return ' class="' + cls + ' has-tip" data-tip="' + t + '" title="' + t + '"';
  }

  function renderSceneBlock(personaId, sw, sceneMode, opts) {
    sceneMode = activeSceneQuick(personaId, sw, normSceneMode(sceneMode));
    var gate = SCENE_GATES[opts.scene] || SCENE_GATES.normal;
    var blockCls = 'tray-scene-block';
    if (sceneMode === 'custom') blockCls += ' tray-scene-block--custom';
    if (sceneMode === 'mute') blockCls += ' tray-scene-block--mute';

    var presets = SCENE_PRESETS.map(function (p) {
      var cls = 'tray-scene-preset' + (sceneMode === p.id ? ' is-on' : '');
      return '<button type="button"' + tipAttrMerge(cls, p.hint) +
        ' data-preset-mode="' + p.id + '">' +
        '<span class="tray-scene-preset__ic">' + p.icon + '</span>' +
        '<span class="tray-scene-preset__lbl">' + p.label + '</span>' +
        '<span class="tray-scene-preset__sub">' + p.sub + '</span></button>';
    }).join('');

    var snap = opts.customSnapshot || null;
    var restorePanel = renderRestorePanel(sw, snap, sceneMode, opts.manualChangeLog);

    var warn = '';
    if (!gate.mic) {
      warn = '<div class="tray-scene-warn">没检测到麦克风 · <button type="button" class="linkish" data-action="diagnose">去检查</button></div>';
    }

    return '<div class="' + blockCls + '">' +
      '<div class="tray-scene-block__label"><span>快捷模式</span></div>' +
      '<p class="tray-scene-block__guide"><span class="tray-scene-block__guide-ic">💡</span>想省事点大按钮；想细调改下面开关</p>' +
      warn +
      '<div class="tray-scene-presets">' + presets + '</div>' +
      restorePanel +
      '</div>';
  }

  function needLockHint(item, opts) {
    if (!item.needs || opts.switches[item.needs]) return '';
    var hit = findSwitchItem(item.needs);
    return hit.item ? '需先打开「' + hit.item.label + '」' : '';
  }

  function renderSwitchLine(item, chId, personaId, opts) {
    if (!item || !itemVisible(item, personaId, opts)) return '';
    var gate = SCENE_GATES[opts.scene] || SCENE_GATES.normal;
    if (chId === 'camera' && channelSkip('camera', opts)) return '';
    var configured = chId === 'camera' ? gate.cam : gate.configured[chId];
    if (!configured) {
      var def = CHANNEL_SWITCHES[chId];
      var setupTip = '点这里去设置';
      return '<button type="button"' + tipAttrMerge('sw-line sw-line--setup', setupTip) +
        ' data-setup="' + chId + '" data-ch-section="' + chId + '">' +
        '<span class="sw-line__ic">' + (ICONS[def.icon] || '⚙') + '</span>' +
        '<span class="sw-line__text"><span class="sw-line__lbl">' + CH[chId] + ' 还没配好</span></span>' +
        '<span class="sw-line__go">去设置 ▸</span></button>';
    }
    var voiceBlocked = chId === 'voice' && !gate.mic;
    var dis = voiceBlocked || (item.needs && !opts.switches[item.needs]);
    var on = !!opts.switches[item.id];
    var focus = opts.focusChannel === chId ? ' is-focus' : '';
    var icon = SW_ICON[item.id] || ICONS[chId] || '•';
    var lock = needLockHint(item, opts);
    var lineCls = 'sw-line' + focus + (dis ? ' is-disabled' : '') + (on ? ' is-on' : ' is-off');
    if (SW_INVERT_VISUAL[item.id] && on) lineCls += ' is-warn';
    var tip = lock || item.hint || '';
    var lockHtml = lock ? '<span class="sw-line__hint sw-line__hint--lock">🔒 ' + lock + '</span>' : '';
    var subHtml = item.sub ? '<span class="sw-line__sub">' + item.sub + '</span>' : '';
    return '<div' + tipAttrMerge(lineCls, tip) + ' data-ch-section="' + chId + '">' +
      '<span class="sw-line__ic" aria-hidden="true">' + icon + '</span>' +
      '<div class="sw-line__text">' +
      '<span class="sw-line__lbl">' + item.label + '</span>' +
      subHtml +
      lockHtml +
      '</div>' +
      '<button type="button" class="toggle' + (on ? '' : ' off') + '"' +
      (dis ? ' disabled' : '') + ' data-sw="' + item.id + '"' +
      ' aria-label="' + escAttr(item.label + '，' + swStateWord(on)) + '"></button></div>';
  }

  function traySubtabs(personaId, opts) {
    var groups = TRAY_GROUPS[personaId] || TRAY_GROUPS.beg;
    return groups.filter(function (g) {
      var tab = g.tab || g.id;
      if (tab === 'camera' && channelSkip('camera', opts)) return false;
      return true;
    }).map(function (g) { return g.tab || g.id; });
  }

  function tabStatusActive(sw, item) {
    var raw = !!sw[item.id];
    return item.invert ? !raw : raw;
  }

  function renderTraySubtabs(tabs, active, sw, sceneMode) {
    sceneMode = normSceneMode(sceneMode) || 'custom';
    var modeIcon = SCENE_MODE_ICON[sceneMode] || '•';
    var modeLbl = SCENE_MODE_LABEL[sceneMode] || sceneMode;
    return '<div class="tray-subtabs-wrap">' +
      '<span class="tray-subtabs-mode is-' + sceneMode + '" title="' + escAttr(modeLbl) + '" aria-label="' + escAttr(modeLbl) + '">' +
      modeIcon + '</span>' +
      '<div class="tray-subtabs" role="tablist">' + tabs.map(function (t) {
        var meta = TRAY_TAB_META[t] || { label: t, icon: '•' };
        var vis = tabChannelVisual(t, sw);
        var visCls = vis === 'off' ? ' is-channel-off' : (vis === 'warn' ? ' is-channel-warn' : '');
        return '<button type="button" class="tray-subtab' + (t === active ? ' is-active' : '') + visCls + '"' +
          ' data-tray-tab="' + t + '" role="tab" aria-selected="' + (t === active ? 'true' : 'false') + '">' +
          '<span class="tray-subtab__ic" aria-hidden="true">' + meta.icon + '</span>' +
          '<span class="tray-subtab__lbl">' + meta.label + '</span>' +
          '</button>';
      }).join('') + '</div></div>';
  }

  function renderSwitchRow(swId, personaId, opts) {
    var hit = findSwitchItem(swId);
    if (!hit.item || !itemVisible(hit.item, personaId, opts)) return '';
    if (hit.ch === 'camera' && channelSkip('camera', opts)) return '';
    return renderSwitchLine(hit.item, hit.ch, personaId, opts);
  }

  function renderSwitchGroups(personaId, opts) {
    var tabs = traySubtabs(personaId, opts);
    if (!tabs.length) return '';
    var active = opts.trayTab && tabs.indexOf(opts.trayTab) >= 0 ? opts.trayTab : tabs[0];
    var groups = TRAY_GROUPS[personaId] || TRAY_GROUPS.beg;
    var g = groups.find(function (x) { return (x.tab || x.id) === active; });
    if (!g) return '';

    var rows = g.items.map(function (id) { return renderSwitchRow(id, personaId, opts); }).filter(Boolean).join('');
    if (!rows) return '';
    var extras = (TRAY_TAB_EXTRA[active] || []).map(function (id) {
      return renderSwitchRow(id, personaId, opts);
    }).filter(Boolean).join('');
    var extraHtml = extras
      ? '<div class="sw-group__list sw-group__list--extra">' + extras + '</div>'
      : '';
    var scopeHtml = g.scope
      ? '<div class="sw-group__scope">' + renderScopeChips(g.scope, true) + '</div>'
      : '';
    var histHtml = active === 'camera' ? renderActionHistoryBlock(!!opts.actionHistOpen) : '';
    var hubLbl = { voice: '语音设置', keys: '按键设置', softPad: '小键盘设置', camera: '摄像头设置' };
    var hubHtml = '<button type="button" class="sw-group__hub" data-go="' + active + '">' +
      (hubLbl[active] || '完整设置') + ' ▸</button>';

    var subtabHtml = tabs.length > 1
      ? renderTraySubtabs(tabs, active, opts.switches, opts.sceneMode)
      : '';
    var headHtml = tabs.length > 1
      ? ''
      : '<div class="sw-group__head">' +
        '<span class="sw-group__ic">' + g.icon + '</span>' +
        '<div class="sw-group__titles">' +
        '<span class="sw-group__lbl">' + g.label + '</span>' +
        (g.sub ? '<span class="sw-group__sub">' + g.sub + '</span>' : '') +
        '</div></div>';
    var groupHtml = '<section class="sw-group sw-group--tab">' +
      headHtml +
      '<div class="sw-group__list">' + rows + '</div>' +
      extraHtml + scopeHtml + histHtml + hubHtml +
      '</section>';

    return '<div class="switch-stack">' + subtabHtml + groupHtml + '</div>';
  }

  function renderPrimaryList(personaId, opts) {
    return renderSwitchGroups(personaId, opts);
  }

  function renderMoreFold() { return ''; }

  function renderMorePanel() { return ''; }

  function footerBtn(cls, go, ic, lbl, tip) {
    return '<button type="button" class="tray-ft__act' + (cls ? ' ' + cls : '') + ' has-tip" data-go="' + go + '"' +
      ' data-tip="' + escAttr(tip) + '" title="' + escAttr(tip) + '">' +
      '<span class="tray-ft__ic" aria-hidden="true">' + ic + '</span>' +
      '<span class="tray-ft__lbl">' + lbl + '</span></button>';
  }

  function renderTrayFooter(personaId, opts) {
    var gate = SCENE_GATES[opts.scene] || SCENE_GATES.normal;
    var warn = '';
    if (!gate.mic) {
      warn = '<div class="tray-ft__warn-row">' +
        footerBtn('tray-ft__warn', 'diagnose:mic', '🎙', '检查麦克风', '没检测到麦克风，点此排查') +
        '</div>';
    }
    var secondary = personaId === 'beg'
      ? [footerBtn('', 'settings', '⚙', '设置', '完整设置页')]
      : [
        footerBtn('', 'habits', '📋', '习惯', '管理习惯和场景'),
        footerBtn('', 'settings', '⚙', '设置', '完整设置页'),
        footerBtn('is-quiet', 'quit', '⏻', '退出', '退出应用')
      ];
    return '<footer class="tray-ft tray-ft--nav">' + warn +
      '<div class="tray-ft__row tray-ft__row--main">' +
      footerBtn('is-primary', 'home', '⌂', '主窗口', '打开主窗口') +
      '</div>' +
      '<div class="tray-ft__row tray-ft__row--sub">' + secondary.join('') + '</div></footer>';
  }

  function verdict(v) {
    if (v === 'yes' || v === true) return '<span class="verdict yes">进托盘</span>';
    if (v === 'maybe') return '<span class="verdict maybe">P1</span>';
    if (v === 'no' || v === false) return '<span class="verdict no">不进</span>';
    return '<span class="verdict setup">' + v + '</span>';
  }

  function channelSkip(chId, opts) {
    var gate = SCENE_GATES[opts.scene] || SCENE_GATES.normal;
    if (chId === 'camera' && (!opts.showCamera || !gate.cam)) return true;
    return false;
  }

  function itemVisible(item, personaId, opts) {
    if (personaId === 'beg' && !item.beg) return false;
    if (personaId === 'vibe' && item.beg === false && item.vibe === false) return false;
    if (personaId === 'vibe' && item.vibe === 'maybe') return false;
    if (item.id === 'overlay' && opts.scene === 'noCam') return false;
    return true;
  }

  function renderSection(chId, personaId, opts) {
    return renderPrimaryList(personaId, opts);
  }

  function renderTray(personaId, sceneId, mountEl, state, opts) {
    state = state || { switches: Object.assign({}, DEFAULT_ON) };
    if (!state.switches) state.switches = Object.assign({}, DEFAULT_ON);
    if (!opts || !opts._hydrated) {
      var saved = loadPersistedState(state);
      if (saved && saved.switches) {
        state.switches = Object.assign({}, DEFAULT_ON, saved.switches);
        state.customSnapshot = saved.customSnapshot || null;
        state.manualChangeLog = saved.manualChangeLog || [];
        state._fromPresetTweak = !!saved.fromPresetTweak;
        if (saved.sceneMode) mountEl.dataset.sceneMode = saved.sceneMode;
      }
    }
    opts = opts || {};
    opts._hydrated = true;
    opts.scene = sceneId || 'normal';
    opts.showCamera = !!opts.showCamera;
    opts.focusChannel = opts.focusChannel || null;
    opts.switches = state.switches;
    opts.customSnapshot = state.customSnapshot || null;
    opts.manualChangeLog = state.manualChangeLog || [];
    if (state._fromPresetTweak == null) state._fromPresetTweak = false;
    opts.sceneMode = mountEl.dataset.sceneMode || '';
    if (opts.openChannel == null) opts.openChannel = mountEl.dataset.openCh || null;
    if (opts.trayTab && traySubtabs(personaId, opts).indexOf(opts.trayTab) >= 0) {
      mountEl.dataset.trayTab = opts.trayTab;
    } else if (!mountEl.dataset.trayTab) {
      opts.trayTab = traySubtabs(personaId, opts)[0] || 'voice';
      mountEl.dataset.trayTab = opts.trayTab;
    }
    opts.trayTab = mountEl.dataset.trayTab || traySubtabs(personaId, opts)[0] || 'voice';
    opts.actionHistOpen = mountEl.dataset.actionHistOpen === '1';

    mountEl.dataset.persona = personaId;
    mountEl.dataset.scene = opts.scene;
    mountEl.dataset.camera = opts.showCamera ? '1' : '0';
    mountEl.dataset.openCh = opts.openChannel || '';
    mountEl.dataset.trayTab = opts.trayTab;

    var html = '';
    html += renderSceneBlock(personaId, state.switches, opts.sceneMode, opts);
    html += '<div class="tray-switch-only tray-easy" data-persona="' + personaId + '">';
    html += renderPrimaryList(personaId, opts);
    html += renderMoreFold(personaId, opts);
    html += renderMorePanel(personaId, opts);
    html += renderTrayFooter(personaId, opts);
    html += '</div>';
    mountEl.innerHTML = html;
    savePersistedState(state, opts.sceneMode);
    bindEvents(mountEl, state, personaId, opts);
  }

  function bindEvents(mountEl, state, personaId, opts) {
    function rerender(openCh) {
      renderTray(personaId, mountEl.dataset.scene, mountEl, state, Object.assign({}, opts, {
        showCamera: mountEl.dataset.camera === '1',
        openChannel: openCh != null ? openCh : (mountEl.dataset.openCh || null),
        trayTab: mountEl.dataset.trayTab,
        _hydrated: true
      }));
    }

    mountEl.querySelectorAll('.toggle[data-sw]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        if (btn.disabled) return;
        var id = btn.dataset.sw;
        var prevMode = normSceneMode(mountEl.dataset.sceneMode || '');
        var oldOn = !!state.switches[id];
        btn.classList.toggle('off');
        state.switches[id] = !btn.classList.contains('off');
        if (prevMode === 'allOn' || prevMode === 'mute') state._fromPresetTweak = true;
        recordManualChange(state, id, oldOn, state.switches[id]);
        mountEl.dataset.sceneMode = 'custom';
        rerender(mountEl.dataset.openCh || null);
        if (opts.onSwitch) opts.onSwitch(id, state.switches[id]);
      };
    });

    function applyPresetMode(id) {
      id = normSceneMode(id);
      var prev = normSceneMode(mountEl.dataset.sceneMode || '');
      if (id === 'custom') {
        mountEl.dataset.sceneMode = 'custom';
        restoreCustom(state);
        state._fromPresetTweak = false;
        state.manualChangeLog = [];
      } else {
        captureCustomBaseline(state, prev);
        state._fromPresetTweak = false;
        mountEl.dataset.sceneMode = id;
        applySceneQuick(id, state.switches);
      }
      rerender(mountEl.dataset.openCh || null);
      if (opts.onSceneModeChange) opts.onSceneModeChange(mountEl.dataset.sceneMode);
    }

    mountEl.querySelectorAll('[data-preset-mode]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        applyPresetMode(btn.dataset.presetMode);
      };
    });

    mountEl.querySelectorAll('[data-restore-custom]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        applyPresetMode('custom');
      };
    });

    function afterUndo(swId) {
      mountEl.dataset.sceneMode = 'custom';
      rerender(mountEl.dataset.openCh || null);
      if (opts.onUndo) opts.onUndo(swId);
    }

    mountEl.querySelectorAll('[data-undo-last]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var last = state.manualChangeLog && state.manualChangeLog[0];
        if (last && undoLastSwitch(state)) afterUndo(last.id);
      };
    });

    mountEl.querySelectorAll('[data-undo-all]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        if (undoAllSwitches(state)) afterUndo(null);
      };
    });

    mountEl.querySelectorAll('[data-tray-tab]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        mountEl.dataset.trayTab = btn.dataset.trayTab;
        mountEl.dataset.actionHistOpen = '';
        rerender(mountEl.dataset.openCh || null);
      };
    });

    mountEl.querySelectorAll('[data-expand]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var id = btn.dataset.expand;
        var next = mountEl.dataset.openCh === id ? '' : id;
        mountEl.dataset.openCh = next;
        rerender(next || null);
      };
    });

    mountEl.querySelectorAll('[data-toggle-hist]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        mountEl.dataset.actionHistOpen = mountEl.dataset.actionHistOpen === '1' ? '' : '1';
        rerender(mountEl.dataset.openCh || null);
      };
    });

    mountEl.querySelectorAll('[data-go]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        if (opts.onFooterGo) opts.onFooterGo(btn.dataset.go);
      };
    });
  }

  function allFilterRows(personaId, opts) {
    var rows = [];
    Object.keys(CHANNEL_SWITCHES).forEach(function (ch) {
      CHANNEL_SWITCHES[ch].items.forEach(function (it) {
        if (!itemVisible(it, personaId, { scene: 'normal', showCamera: true, switches: DEFAULT_ON })) return;
        rows.push({ label: it.label, lvl: it.lvl, ch: CH[ch] });
      });
    });
    if (personaId === 'vibe' && opts && opts.showCamera) {
      CAMERA_CATALOG.forEach(function (c) {
        if (c.tray === '专页' || c.tray === 'L3' || c.tray === 'P1') return;
        if (c.vibe === 'yes') rows.push({ label: c.setting, lvl: c.tray, ch: '摄像头' });
      });
    }
    return rows;
  }

  function renderFilterTable(personaId, opts) {
    return allFilterRows(personaId, opts).map(function (r) {
      return '<tr><td class="lbl"><strong>' + r.label + '</strong></td>' +
        '<td><span class="lvl-tag">' + r.lvl + '</span></td>' +
        '<td>' + r.ch + '</td></tr>';
    }).join('');
  }

  function needLabel(needs) {
    if (!needs) return '—';
    var hit = CHANNEL_SWITCHES.camera.items.find(function (x) { return x.id === needs; });
    return '依赖「' + ((hit && hit.label) || needs) + '」';
  }

  function renderCameraCatalogTable() {
    return CAMERA_CATALOG.map(function (c) {
      var cls = c.tray === '专页' || c.tray === 'L3' || c.tray === 'P1' ? 'row-cut' : '';
      return '<tr class="' + cls + '">' +
        '<td><strong>' + c.setting + '</strong></td>' +
        '<td>' + c.tray + '</td>' +
        '<td>' + verdict(c.beg) + '</td>' +
        '<td>' + verdict(c.vibe) + '</td>' +
        '<td class="why">' + needLabel(c.needs) + '</td>' +
        '</tr>';
    }).join('');
  }

  function renderHabitsCatalogTable() {
    return HABITS_CATALOG.map(function (h) {
      return '<tr><td><strong>' + h.label + '</strong></td>' +
        '<td>' + h.hub + '</td>' +
        '<td><span class="verdict no">' + h.tray + '</span></td>' +
        '<td class="why">' + h.why + '</td></tr>';
    }).join('');
  }

  function mountChannelPage(cfg) {
    cfg = cfg || {};
    var persona = cfg.persona || 'vibe';
    var scene = cfg.scene || 'normal';
    var showCamera = cfg.showCamera != null ? cfg.showCamera : (cfg.focusChannel === 'camera' || persona === 'vibe');
    var state = cfg.state || { switches: Object.assign({}, DEFAULT_ON) };
    var trayEl = document.getElementById(cfg.previewId || 'trayPreview');
    var filterEl = cfg.filterId ? document.getElementById(cfg.filterId) : null;

    function camVisible() {
      if (!cfg.camSegId) return !!showCamera;
      var on = document.querySelector('#' + cfg.camSegId + ' button.on[data-cam]');
      return !!(on && on.dataset.cam === '1');
    }

    function refresh() {
      var cam = cfg.camSegId ? camVisible() : showCamera;
      if (scene === 'noCam') cam = false;
      if (trayEl) {
        renderTray(persona, scene, trayEl, state, {
          showCamera: cam,
          focusChannel: cfg.focusChannel || null,
          trayTab: cfg.focusChannel || null
        });
      }
      if (filterEl) {
        filterEl.innerHTML = renderFilterTable(persona, { showCamera: cam });
      }
    }

    var personaSeg = document.getElementById(cfg.personaSegId || 'personaSeg');
    if (personaSeg) {
      personaSeg.onclick = function (e) {
        var b = e.target.closest('[data-persona]');
        if (!b) return;
        persona = b.dataset.persona;
        personaSeg.querySelectorAll('button').forEach(function (btn) {
          btn.classList.toggle('on', btn.dataset.persona === persona);
        });
        refresh();
      };
    }
    var sceneSeg = document.getElementById(cfg.sceneSegId || 'sceneSeg');
    if (sceneSeg) {
      sceneSeg.onclick = function (e) {
        var b = e.target.closest('[data-scene]');
        if (!b) return;
        scene = b.dataset.scene;
        sceneSeg.querySelectorAll('button').forEach(function (btn) {
          btn.classList.toggle('on', btn.dataset.scene === scene);
        });
        refresh();
      };
    }
    var camSeg = cfg.camSegId ? document.getElementById(cfg.camSegId) : null;
    if (camSeg) {
      camSeg.onclick = function (e) {
        var b = e.target.closest('[data-cam]');
        if (!b) return;
        camSeg.querySelectorAll('button').forEach(function (btn) {
          btn.classList.toggle('on', btn.dataset.cam === b.dataset.cam);
        });
        refresh();
      };
    }
    refresh();
    return { refresh: refresh, getState: function () { return state; } };
  }

  global.TrayInventoryUser = {
    CAMERA_CATALOG: CAMERA_CATALOG,
    HABITS_CATALOG: HABITS_CATALOG,
    CHANNEL_SWITCHES: CHANNEL_SWITCHES,
    DEFAULT_ON: DEFAULT_ON,
    PERSONA_CHANNELS: PERSONA_CHANNELS,
    renderTray: renderTray,
    renderFilterTable: renderFilterTable,
    renderCameraCatalogTable: renderCameraCatalogTable,
    renderHabitsCatalogTable: renderHabitsCatalogTable,
    mountChannelPage: mountChannelPage,
    recordManualChange: recordManualChange,
    undoOneSwitch: undoOneSwitch,
    undoAllSwitches: undoAllSwitches
  };
})(typeof window !== 'undefined' ? window : this);
