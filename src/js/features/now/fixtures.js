/**
 * Now home fixtures — 当前情景驾驶舱（数据字段 habits）。
 * UI 用「情景」；传感器不上首页。
 */
(function (global) {
  'use strict';

  var HABIT_CATALOG = [
    {
      id: 'create',
      name: '创作中',
      short: '创作',
      description: '正在电脑前工作',
      helping: ['保持专注', '减少消息打扰', '保存工作状态'],
      actions: [
        { id: 'focus', label: '保持专注', enabled: true, effect: '创作时压住非紧急通知' },
        { id: 'agent_defer', label: '减少消息打扰', enabled: true, effect: '批准请求等你停下再问' },
        { id: 'protect_win', label: '保存工作状态', enabled: true, effect: '离开时暂挡敏感画面并保留现场' }
      ],
      when: ['Cursor 在前台', '最近在敲键盘', '人在电脑前'],
      does: ['开启专注处理', '压住打扰', '需要时保护窗口']
    },
    {
      id: 'meet',
      name: '会议中',
      short: '会议',
      description: '正在开会或通话',
      helping: ['减少打断', '留意麦克风', '旁人靠近时提醒'],
      actions: [
        { id: 'mute_noise', label: '减少打断', enabled: true, effect: '会议期间静音非紧急通知' },
        { id: 'mic_guard', label: '留意麦克风', enabled: true, effect: '离开画面时提醒静音' },
        { id: 'bystander', label: '旁人靠近时提醒', enabled: false, effect: '画面里出现他人时轻提示' }
      ],
      when: ['会议软件在前台', '或检测到多人对话'],
      does: ['压通知', '麦克风守护']
    },
    {
      id: 'away',
      name: '离开电脑',
      short: '离开',
      description: '你不在座位上',
      helping: ['挡住屏幕', '停掉麦克风', '回来后还原'],
      actions: [
        { id: 'mask', label: '挡住屏幕', enabled: true, effect: '离开后遮住敏感窗口' },
        { id: 'mic_off', label: '停掉麦克风', enabled: true, effect: '离开期间关闭拾音' },
        { id: 'restore', label: '回来后还原', enabled: true, effect: '返回时恢复窗口布局' }
      ],
      when: ['座位空着一段时间', '键盘也静了'],
      does: ['遮屏', '停麦', '回来还原']
    },
    {
      id: 'rest',
      name: '休息一下',
      short: '休息',
      description: '用久了，轻轻问一句',
      helping: ['提醒歇一歇', '提醒抬头'],
      actions: [
        { id: 'break', label: '提醒歇一歇', enabled: true, effect: '连续使用较久时询问' },
        { id: 'posture', label: '提醒抬头', enabled: false, effect: '姿态偏移时轻提示' }
      ],
      when: ['你主动切换，或坐了很久'],
      does: ['温和提醒，不强切']
    }
  ];

  function cloneActions(actions) {
    return (actions || []).map(function (a) {
      return Object.assign({}, a);
    });
  }

  function habitsFor(activeId, suggestedIds) {
    var suggested = suggestedIds || [];
    return HABIT_CATALOG.map(function (h) {
      return Object.assign({}, h, {
        actions: cloneActions(h.actions),
        state: {
          active: h.id === activeId,
          suggested: suggested.indexOf(h.id) >= 0
        }
      });
    });
  }

  var FIXTURES = {
    s1: {
      id: 's1',
      label: '创作中',
      state: {
        time: '22:32',
        system: { ok: true, label: '正常' },
        status: { line: 'Cursor 在前台 · 你在敲键盘' },
        habits: habitsFor('create', ['meet']),
        needsYou: [
          {
            id: 'approve_rm',
            title: '批准 Codex 删除命令？',
            detail: '运行 rm，不可逆',
            primary: true
          }
        ],
        input: { voice: true, softpad: true, hotkey: 'Ctrl+Space' }
      }
    },
    s0: {
      id: 's0',
      label: '刚打开',
      state: {
        time: '22:10',
        system: { ok: true, label: '正常' },
        status: { line: '刚打开 Cursor · 还在摸清状态' },
        habits: habitsFor(null, ['create']),
        needsYou: [],
        input: { voice: true, softpad: true, hotkey: 'Ctrl+Space' }
      }
    },
    sWait: {
      id: 'sWait',
      label: '等你决定',
      state: {
        time: '22:40',
        system: { ok: true, label: '正常' },
        status: { line: '创作中 · Agent 有事在等你' },
        habits: habitsFor('create', []),
        needsYou: [
          {
            id: 'view_reply',
            title: '查看 Agent 请求',
            detail: '有一条确认在等你',
            primary: true
          },
          {
            id: 'keep_quiet',
            title: '继续别打扰我',
            detail: '保持当前情景'
          },
          {
            id: 'extra_demo',
            title: '确认提交改动？',
            detail: '演示：第 3 条会收进「查看全部」'
          }
        ],
        input: { voice: true, softpad: true, hotkey: 'Ctrl+Space' }
      }
    },
    sWork: {
      id: 'sWork',
      label: 'AI 忙碌',
      state: {
        time: '22:42',
        system: { ok: true, label: '正常' },
        status: { line: '创作中 · AI 正在处理' },
        habits: habitsFor('create', []),
        needsYou: [
          {
            id: 'view_progress',
            title: '查看进度',
            detail: '可选，不紧急'
          }
        ],
        input: { voice: true, softpad: true, hotkey: 'Ctrl+Space' }
      }
    },
    sAway: {
      id: 'sAway',
      label: '离开中',
      state: {
        time: '22:50',
        system: { ok: true, label: '保护中' },
        status: { line: '座位空着 · 屏幕已保护' },
        habits: habitsFor('away', ['create']),
        needsYou: [],
        input: { voice: false, softpad: true, hotkey: 'Ctrl+Space' }
      }
    }
  };

  var DEMO_ORDER = ['s1', 'sWait', 'sWork', 'sAway', 's0'];

  function cloneState(tierId) {
    var row = FIXTURES[tierId] || FIXTURES.s1;
    return JSON.parse(JSON.stringify(row.state));
  }

  global.OneToneNowFixtures = {
    FIXTURES: FIXTURES,
    DEMO_ORDER: DEMO_ORDER,
    HABIT_CATALOG: HABIT_CATALOG,
    cloneActions: cloneActions,
    cloneState: cloneState
  };
})(typeof window !== 'undefined' ? window : globalThis);
