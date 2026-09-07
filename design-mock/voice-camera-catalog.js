/**
 * Voice Camera face · mirrors camera page presence/gesture triggers.
 * Categories = what the camera sees; each row has optional sayable twin.
 * Calibration stays on Camera page; this face only binds phrases.
 */
(function (global) {
  'use strict';

  var ITEMS = {
    onAway: {
      title: '离席',
      when: '人离开座位，不想继续听。',
      effect: '常绑：暂停语音 / 隐私屏。',
      gestIcon: '🚶',
      gestName: '人脸消失',
      phrase: '暂停',
      phrases: ['暂停', '先别听'],
      sayable: true,
      defaultOn: true
    },
    onReturn: {
      title: '回席',
      when: '人回到画面，想继续。',
      effect: '常绑：恢复语音（只恢复摄像头暂停的）。',
      gestIcon: '🙂',
      gestName: '人脸回来',
      phrase: '继续听',
      phrases: ['继续听', '恢复'],
      sayable: true,
      defaultOn: true
    },
    shakeHead: {
      title: '摇头取消',
      when: '听写或确认时想否定。',
      effect: '常绑：Esc / 语音取消 · 跟听写「不要了」同结果。',
      gestIcon: '🙅',
      gestName: '摇头',
      phrase: '不要了',
      phrases: ['不要了', '取消'],
      sayable: true,
      defaultOn: true
    },
    deliberateBlink: {
      title: '故意眨眼',
      when: '想确认一步，或开/停听写。',
      effect: '刻意闭眼再睁 · 可绑激活听写；再眨一次结束。普通眨眼不算。',
      gestIcon: '👁',
      gestName: '长眨',
      phrase: '完了',
      phrases: ['完了', '结束输入', '确认'],
      sayable: true,
      defaultOn: true
    },
    openPalm: {
      title: '五指张开',
      when: '想暂停一下、等一等。',
      effect: '正对摄像头张开五指 · 实验手势，默认关。',
      gestIcon: '🖐',
      gestName: '五指',
      phrase: '等一下',
      phrases: ['等一下', '暂停'],
      sayable: true,
      defaultOn: false,
      experimental: true
    },
    okHand: {
      title: 'OK 确认',
      when: '要肯定当前这一步。',
      effect: '拇指食指成圈 · 常进「待确认」；不能单独发出去。',
      gestIcon: '👌',
      gestName: 'OK',
      phrase: '确认',
      phrases: ['确认', '好的'],
      sayable: true,
      defaultOn: false,
      experimental: true,
      noSoloSend: true
    },
    fist: {
      title: '握拳取消',
      when: '用手势否定。',
      effect: '握紧拳头 · 常绑取消；实验手势。',
      gestIcon: '✊',
      gestName: '握拳',
      phrase: '取消',
      phrases: ['取消', '不要了'],
      sayable: true,
      defaultOn: false,
      experimental: true
    },
    wave: {
      title: '挥手',
      when: '招呼一下唤起或切换。',
      effect: '张开手掌左右摆 · 实验手势。',
      gestIcon: '👋',
      gestName: '挥手',
      phrase: '开始说话',
      phrases: ['开始说话', '嗨'],
      sayable: true,
      defaultOn: false,
      experimental: true
    },
    multiPerson: {
      title: '多人出现',
      when: '旁边有人靠近，想隐私。',
      effect: '多人人脸 → 暂停或遮罩 · 当前占位，尚不能识别。',
      gestIcon: '👥',
      gestName: '多人',
      phrase: '隐私',
      phrases: ['隐私', '先别听'],
      sayable: false,
      defaultOn: false,
      placeholder: true
    },
    gazeSendConfirm: {
      title: '看右下再确认发',
      when: '想发，但怕误触。',
      effect: '视线进发送区 → 待确认 → OK/长眨才发 · 手势不能单独发。',
      gestIcon: '👀',
      gestName: '看区 + 确认',
      phrase: '发送',
      phrases: ['发送', '发出去'],
      sayable: true,
      defaultOn: false,
      noSoloSend: true,
      advanced: true
    }
  };

  var COMMON = [
    'shakeHead',
    'deliberateBlink',
    'onAway',
    'onReturn',
    'okHand',
    'openPalm'
  ];

  /** Align with camera page cards + hero templates, beginner titles. */
  var GROUPS = [
    { id: 'common', title: '常用', slots: COMMON },
    { id: 'presence', title: '人在不在', slots: ['onAway', 'onReturn'] },
    { id: 'head', title: '头与脸', slots: ['shakeHead', 'deliberateBlink'] },
    { id: 'hand', title: '手势', slots: ['openPalm', 'okHand', 'fist', 'wave'] },
    { id: 'privacy', title: '隐私与防误触', slots: ['multiPerson', 'gazeSendConfirm', 'onAway'] }
  ];

  function normalize(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');
  }

  function get(id) {
    var row = ITEMS[id];
    if (!row) return null;
    return Object.assign({ id: id }, row);
  }

  function listGroup(groupId) {
    var g = GROUPS.find(function (x) {
      return x.id === groupId;
    });
    if (!g) return [];
    return g.slots.map(get).filter(Boolean);
  }

  function matchHeard(heard) {
    var n = normalize(heard);
    if (!n) return null;
    var ids = Object.keys(ITEMS);
    for (var i = 0; i < ids.length; i++) {
      var row = get(ids[i]);
      if (!row.sayable) continue;
      var phrases = row.phrases || [row.phrase];
      for (var j = 0; j < phrases.length; j++) {
        if (normalize(phrases[j]) === n) return row;
      }
    }
    return null;
  }

  function badge(row) {
    if (!row) return '';
    if (row.placeholder) return '占位';
    if (row.experimental) return '实验';
    if (row.advanced) return '进阶';
    if (row.defaultOn) return '推荐';
    return '';
  }

  global.VoiceCameraCatalog = {
    ITEMS: ITEMS,
    GROUPS: GROUPS,
    COMMON: COMMON,
    get: get,
    listGroup: listGroup,
    matchHeard: matchHeard,
    normalize: normalize,
    badge: badge
  };
})(typeof window !== 'undefined' ? window : globalThis);
