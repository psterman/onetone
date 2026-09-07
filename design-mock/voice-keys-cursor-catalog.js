/**
 * Voice Keys face · Cursor command catalogue.
 * Mirrors src/js/features/mapping/keys-channel-command-picker.js
 * CURSOR_COMMAND_GROUPS + CURSOR_COMMON_SLOTS + beginner pick copy.
 * Voice side only edits sayable phrases; chords live on Keys page.
 */
(function (global) {
  'use strict';

  var ITEMS = {
    stopOrSend: {
      title: '发出去',
      phrase: '发送',
      phrases: ['发送', '发出去'],
      chord: 'Enter',
      when: '输入框里写好了，要交给 AI。',
      effect: '在输入框里发送（一般是回车）。',
      sayable: true
    },
    newThread: {
      title: '新开一局对话',
      phrase: '新会话',
      phrases: ['新会话', '新建'],
      chord: 'Ctrl+N',
      when: '当前对话太乱，想重新开一局。',
      effect: '新开一条对话。',
      sayable: true
    },
    quickSearch: {
      title: '搜文件',
      phrase: '搜索',
      phrases: ['搜索', '找文件'],
      chord: 'Ctrl+P',
      when: '想快速打开某个文件。',
      effect: '打开快速打开（Quick Open）。',
      sayable: true
    },
    commandPalette: {
      title: '打开命令菜单',
      phrase: '命令',
      phrases: ['命令', '命令菜单'],
      chord: 'Ctrl+Shift+P',
      when: '想搜 Cursor / VS Code 里的任意命令。',
      effect: '打开命令面板，可搜索执行。',
      sayable: true
    },
    quickChat: {
      title: '打开侧边聊天',
      phrase: '开 Chat',
      phrases: ['开 Chat', '打开聊天'],
      chord: 'Ctrl+I',
      when: '想拉开 Cursor 侧边 Chat / Agent。',
      effect: '打开侧边聊天。',
      sayable: true
    },
    inlineEdit: {
      title: '行内编辑',
      phrase: '行内编辑',
      phrases: ['行内编辑', '就地改'],
      chord: 'Ctrl+K',
      when: '选中代码后想就地改。',
      effect: '打开行内编辑。',
      sayable: true
    },
    acceptTab: {
      title: '接受补全',
      phrase: '接受补全',
      phrases: ['接受补全', '收下建议'],
      chord: 'Tab',
      when: 'Cursor 给出灰色补全，你想收下。',
      effect: '接受当前 Tab 建议。',
      sayable: false
    },
    modeMenu: {
      title: '切模式',
      phrase: '切模式',
      phrases: ['切模式', '模式菜单'],
      chord: 'Ctrl+.',
      when: '想换 Agent / Ask / Edit 等工作方式。',
      effect: '打开 Mode Menu。',
      sayable: true
    },
    plan: {
      title: '定计划',
      phrase: '定计划',
      phrases: ['定计划', '计划模式'],
      chord: 'Ctrl+Alt+Shift+P',
      when: '想先想清楚再动手。',
      effect: '切到计划模式（若快捷键可用）。',
      sayable: true
    },
    switchAgent: {
      title: '开工',
      phrase: '开工',
      phrases: ['开工', 'Agent 模式'],
      chord: 'Ctrl+Alt+.',
      when: '计划好了，要 Agent 动手改。',
      effect: '切到 Agent 模式。',
      sayable: true
    },
    cancel: {
      title: '取消',
      phrase: '取消',
      phrases: ['取消', '停'],
      chord: 'Ctrl+Shift+Backspace',
      when: '生成跑偏了，想停住。',
      effect: '停住当前生成。',
      sayable: true
    },
    pushToTalk: {
      title: '开始语音打字',
      phrase: '说话',
      phrases: ['说话', '开始说话', '开始输入'],
      chord: '',
      keyHow: '语音键',
      when: '要对着 Cursor 输入框说一大段需求时。',
      effect: '打开语音输入，字进当前输入框（你的输入法，不是 Cursor 自带麦）。',
      sayable: true
    },
    continue: {
      title: '让 AI 继续',
      phrase: '继续',
      phrases: ['继续', '接着做'],
      chord: '',
      keyHow: '模板句',
      when: 'AI 停住等你，或你要它接着干下一步。',
      effect: '往对话里送一句「继续」。',
      sayable: true
    },
    summarizeDiff: {
      title: '总结改动',
      phrase: '总结改动',
      phrases: ['总结改动', '总结一下'],
      chord: '',
      keyHow: '模板句',
      when: '改了一堆，想让 AI 用一句话概括。',
      effect: '塞入总结用的提示句。',
      sayable: true
    },
    runChecks: {
      title: '跑测试',
      phrase: '跑测试',
      phrases: ['跑测试', '检查一下'],
      chord: '',
      keyHow: '模板句',
      when: '想让 AI 帮你想检查 / 测试步骤。',
      effect: '塞入检查提示（不直接跑终端）。',
      sayable: true
    },
    focusComposer: {
      title: '回到 Cursor 输入框',
      phrase: '回 Cursor',
      phrases: ['回 Cursor', '回到 Cursor'],
      chord: '',
      keyHow: '切窗口',
      when: '人在别的软件里，要回到 Cursor 继续写。',
      effect: '切回 Cursor，并尽量点到输入框。',
      sayable: true
    },
    paste: {
      title: '粘贴进来',
      phrase: '粘贴',
      phrases: ['粘贴', '贴进来'],
      chord: 'Ctrl+V',
      when: '剪贴板或截图要贴进 Cursor。',
      effect: '聚焦后粘贴。',
      sayable: true
    },
    nextChange: {
      title: '下一处改动',
      phrase: '下一处',
      phrases: ['下一处'],
      chord: 'F7',
      when: '在看 diff，想跳到下一处。',
      effect: '跳到下一处（在 Cursor 上不一定每次都稳）。',
      sayable: false
    },
    prevChange: {
      title: '上一处改动',
      phrase: '上一处',
      phrases: ['上一处'],
      chord: 'Shift+F7',
      when: '在看 diff，想跳回上一处。',
      effect: '跳到上一处（不一定每次都稳）。',
      sayable: false
    },
    acceptChanges: {
      title: '接受改动',
      phrase: '接受',
      phrases: ['接受'],
      chord: 'Ctrl+Enter',
      when: '确认当前这一处建议。',
      effect: '接受当前改动（默认需先开开关）。',
      sayable: false,
      gated: true
    },
    acceptAllChanges: {
      title: '全部接受',
      phrase: '全部接受',
      phrases: ['全部接受'],
      chord: 'Ctrl+Shift+Enter',
      when: '整批建议都想收下。',
      effect: '接受全部建议改动（默认需先开开关）。',
      sayable: false,
      gated: true
    }
  };

  /** Same order as keys-channel-command-picker CURSOR_COMMON_SLOTS */
  var COMMON = [
    'pushToTalk',
    'continue',
    'stopOrSend',
    'focusComposer',
    'newThread',
    'paste',
    'quickChat',
    'commandPalette',
    'summarizeDiff',
    'runChecks'
  ];

  /** Beginner titles ← product groups (native/editor/seeded/inject/wrapup) */
  var GROUPS = [
    { id: 'common', title: '常用', slots: COMMON },
    { id: 'native', title: '快捷键能做', slots: ['stopOrSend', 'newThread', 'quickSearch', 'commandPalette'] },
    { id: 'editor', title: '边写边用', slots: ['quickChat', 'inlineEdit', 'acceptTab', 'modeMenu'] },
    { id: 'seeded', title: '切工作方式', slots: ['plan', 'switchAgent', 'cancel'] },
    { id: 'inject', title: '说话与塞话', slots: ['pushToTalk', 'continue', 'summarizeDiff', 'runChecks'] },
    { id: 'wrapup', title: '收尾', slots: ['focusComposer', 'paste', 'nextChange', 'prevChange', 'acceptChanges', 'acceptAllChanges'] }
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
    return g.slots
      .map(get)
      .filter(Boolean);
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

  function chordLabel(row) {
    if (!row) return '';
    if (row.chord) return row.chord;
    return row.keyHow || '未绑键';
  }

  global.VoiceKeysCursorCatalog = {
    ITEMS: ITEMS,
    GROUPS: GROUPS,
    COMMON: COMMON,
    get: get,
    listGroup: listGroup,
    matchHeard: matchHeard,
    normalize: normalize,
    chordLabel: chordLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
