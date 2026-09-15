/**
 * Recognition footer: browse other-channel configured actions → add a Key entry.
 * Read source channel BindingViews; write only via Key Adapter. No silent defaults.
 */
(function (global) {
  'use strict';

  var TABS = ['key', 'voice', 'cursor', 'softPad', 'camera', 'ime'];
  var CHANNEL_TABS = ['voice', 'softPad', 'camera'];
  /** Voice lifecycle intents shown on 识别 — not full BindingView expansion. */
  var VOICE_LIFECYCLE_IDS = {
    start: 'input.start',
    cancel: 'input.cancel',
    // end/send: open capture sheet key/voice — never a separate finish step
    endCommit: 'input.commit',
    endSend: 'input.send'
  };
  /** Layout-only Cursor catalogue, grouped by how the action is triggered. */
  var CURSOR_COMMAND_GROUPS = [
    {
      id: 'native',
      titleKey: 'keysChannelCursorGroupNative',
      titleFb: '原生快捷键（Cursor / VS Code）',
      items: [
        {
          slotId: 'stopOrSend',
          labelZh: '发送',
          labelEn: 'Send',
          phrase: '发送',
          chordHint: 'Enter',
          noteZh: 'Composer 内回车发送',
          noteEn: 'Enter in Composer'
        },
        {
          slotId: 'newThread',
          labelZh: '新会话',
          labelEn: 'New chat',
          phrase: '新会话',
          chordHint: 'Ctrl+N',
          noteZh: '新建；是否等于新 Composer 看绑定',
          noteEn: 'New; may differ from new Composer'
        },
        {
          slotId: 'quickSearch',
          labelZh: '搜索',
          labelEn: 'Search',
          phrase: '搜索',
          chordHint: 'Ctrl+P',
          noteZh: '快速打开文件',
          noteEn: 'Quick Open'
        },
        {
          slotId: 'commandPalette',
          labelZh: '命令',
          labelEn: 'Command',
          phrase: '命令',
          chordHint: 'Ctrl+Shift+P',
          noteZh: '命令面板',
          noteEn: 'Command Palette'
        }
      ]
    },
    {
      id: 'editor',
      titleKey: 'keysChannelCursorGroupEditor',
      titleFb: '编辑器习惯键',
      items: [
        {
          slotId: 'quickChat',
          labelZh: '开 Chat',
          labelEn: 'Open Chat',
          phrase: '开 Chat',
          chordHint: 'Ctrl+L',
          noteZh: '侧栏 Chat / Agent（亦常见 Ctrl+I）',
          noteEn: 'Sidepanel Chat / Agent (also Ctrl+I)'
        },
        {
          slotId: 'inlineEdit',
          labelZh: '行内编辑',
          labelEn: 'Inline Edit',
          phrase: '行内编辑',
          chordHint: 'Ctrl+K',
          noteZh: '选中代码后就地改',
          noteEn: 'Inline edit on selection'
        },
        {
          slotId: 'acceptTab',
          labelZh: '接受补全',
          labelEn: 'Accept Tab',
          phrase: '接受补全',
          chordHint: 'Tab',
          noteZh: '接受 Cursor Tab 建议',
          noteEn: 'Accept Cursor Tab suggestion'
        },
        {
          slotId: 'modeMenu',
          labelZh: '切模式',
          labelEn: 'Mode menu',
          phrase: '切模式',
          chordHint: 'Ctrl+.',
          noteZh: 'Mode Menu；输入框内亦可用 Shift+Tab 轮换',
          noteEn: 'Mode Menu; Shift+Tab cycles in chat input'
        }
      ]
    },
    {
      id: 'seeded',
      titleKey: 'keysChannelCursorGroupSeeded',
      titleFb: 'OneTone 写入 Cursor',
      items: [
        {
          slotId: 'plan',
          labelZh: '定计划',
          labelEn: 'Plan',
          phrase: '定计划',
          chordHint: 'Ctrl+Alt+Shift+P',
          noteZh: 'seed composerMode.plan',
          noteEn: 'seed composerMode.plan'
        },
        {
          slotId: 'switchAgent',
          labelZh: '开工',
          labelEn: 'Agent',
          phrase: '开工',
          chordHint: 'Ctrl+Alt+.',
          noteZh: 'seed composerMode.agent',
          noteEn: 'seed composerMode.agent'
        },
        {
          slotId: 'cancel',
          labelZh: '取消',
          labelEn: 'Cancel',
          phrase: '取消',
          chordHint: 'Ctrl+Shift+Backspace',
          noteZh: 'OneTone 默认停生成映射',
          noteEn: 'OneTone stop-generation default'
        }
      ]
    },
    {
      id: 'inject',
      titleKey: 'keysChannelCursorGroupInject',
      titleFb: '无固定快捷键 / 注入',
      items: [
        {
          slotId: 'pushToTalk',
          labelZh: '说话',
          labelEn: 'Talk',
          phrase: '说话',
          chordHint: '',
          rightLabelZh: '语音键',
          rightLabelEn: 'Voice key',
          noteZh: 'PTT → 第三方输入法，非 Cursor 自带麦',
          noteEn: 'PTT → IME, not Cursor mic'
        },
        {
          slotId: 'continue',
          labelZh: '继续',
          labelEn: 'Continue',
          phrase: '继续',
          chordHint: '',
          rightLabelZh: '模板句',
          rightLabelEn: 'Template',
          noteZh: '注入固定文案，无 Cursor 原生键',
          noteEn: 'Injected template, no native key'
        },
        {
          slotId: 'summarizeDiff',
          labelZh: '总结改动',
          labelEn: 'Summarize',
          phrase: '总结改动',
          chordHint: '',
          rightLabelZh: '模板句',
          rightLabelEn: 'Template',
          noteZh: '注入固定总结提示',
          noteEn: 'Injected summarize prompt'
        },
        {
          slotId: 'runChecks',
          labelZh: '跑测试',
          labelEn: 'Run checks',
          phrase: '跑测试',
          chordHint: '',
          rightLabelZh: '模板句',
          rightLabelEn: 'Template',
          noteZh: '注入 lint/test 提示，不直跑终端',
          noteEn: 'Injected lint/test prompt, not direct terminal'
        }
      ]
    },
    {
      id: 'wrapup',
      titleKey: 'keysChannelCursorGroupWrapup',
      titleFb: '回合收尾',
      items: [
        {
          slotId: 'focusComposer',
          labelZh: '回 Cursor',
          labelEn: 'Focus Cursor',
          phrase: '回 Cursor',
          chordHint: '',
          rightLabelZh: '焦点',
          rightLabelEn: 'Focus',
          noteZh: '从其他 App 切回并聚焦 Composer',
          noteEn: 'Focus Composer from another app'
        },
        {
          slotId: 'paste',
          labelZh: '粘贴',
          labelEn: 'Paste',
          phrase: '粘贴',
          chordHint: 'Ctrl+V',
          noteZh: '聚焦后粘贴（截图/剪贴板）',
          noteEn: 'Focus then paste clipboard'
        },
        {
          slotId: 'nextChange',
          labelZh: '下一处',
          labelEn: 'Next change',
          phrase: '下一处',
          chordHint: 'F7',
          noteZh: 'diff 下一处；Cursor 上不一定稳定',
          noteEn: 'Next diff hunk; may be unreliable in Cursor'
        },
        {
          slotId: 'prevChange',
          labelZh: '上一处',
          labelEn: 'Prev change',
          phrase: '上一处',
          chordHint: 'Shift+F7',
          noteZh: 'diff 上一处；Cursor 上不一定稳定',
          noteEn: 'Prev diff hunk; may be unreliable in Cursor'
        },
        {
          slotId: 'acceptChanges',
          labelZh: '接受',
          labelEn: 'Accept',
          phrase: '接受',
          chordHint: 'Ctrl+Enter',
          gated: true,
          noteZh: 'gate 默认关；needs_input 时才高亮',
          noteEn: 'Gate off by default; only when needs_input'
        },
        {
          slotId: 'acceptAllChanges',
          labelZh: '全部接受',
          labelEn: 'Accept all',
          phrase: '全部接受',
          chordHint: 'Ctrl+Shift+Enter',
          gated: true,
          noteZh: 'gate 默认关；接受当前建议全部改动',
          noteEn: 'Gate off by default; accept all suggested changes'
        }
      ]
    }
  ];
  var activeTab = 'ime';
  var openPanels = { ime: true, key: false, voice: false, cursor: false, softPad: false, camera: false };
  var imeTabHidden = false;
  var searchQuery = '';
  /**
   * Cursor「软件自带」按使用场景分类（常用应用快捷键）。
   * Order within each group = display order.
   */
  var CURSOR_PICK_GROUPS = [
    {
      id: 'talk',
      titleKey: 'keysCursorPickGroupTalk',
      titleFb: '听写',
      slots: ['pushToTalk', 'stopOrSend', 'paste', 'cancel']
    },
    {
      id: 'chat',
      titleKey: 'keysCursorPickGroupChat',
      titleFb: '对话',
      slots: ['newThread', 'quickChat', 'focusComposer']
    },
    {
      id: 'mode',
      titleKey: 'keysCursorPickGroupMode',
      titleFb: '模式',
      slots: ['modeMenu', 'plan', 'switchAgent']
    },
    {
      id: 'find',
      titleKey: 'keysCursorPickGroupFind',
      titleFb: '查找',
      slots: ['quickSearch', 'commandPalette', 'inlineEdit']
    },
    {
      id: 'diff',
      titleKey: 'keysCursorPickGroupDiff',
      titleFb: '补全',
      slots: [
        'acceptTab',
        'nextChange',
        'prevChange',
        'acceptChanges',
        'acceptAllChanges'
      ]
    },
    {
      id: 'extra',
      titleKey: 'keysCursorPickGroupExtra',
      titleFb: '其它',
      slots: ['continue', 'summarizeDiff', 'runChecks']
    }
  ];
  /** Plain-language card copy for Cursor pick UI (何时 / 会怎样 / 干什么). */
  var CURSOR_PICK_COPY = {
    pushToTalk: {
      titleZh: '开始用嘴打字',
      titleEn: 'Start speaking to type',
      whenZh: '要对着 Cursor 输入框说一大段需求时。',
      whenEn: 'When you need to speak a long request into Cursor.',
      effectZh: '打开语音输入，字进当前输入框（用你的输入法，不是 Cursor 自带麦）。',
      effectEn: 'Starts voice typing into the input (your IME, not Cursor mic).',
      funcZh: '开始说话打字。也可以点小工具条麦克风。',
      funcEn: 'Speak to type. Mini-bar mic works too.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '适合配一个键。',
      howTextEn: 'Good candidate for a key.'
    },
    continue: {
      titleZh: '让 AI 继续',
      titleEn: 'Tell AI to continue',
      whenZh: 'AI 停住等你，或你要它接着干下一步。',
      whenEn: 'When AI is waiting, or you want the next step.',
      effectZh: '往对话里送一句「继续」（没有固定系统键时用句子）。',
      effectEn: 'Sends a “continue” line when there is no stable native key.',
      funcZh: '催 AI 往下做。',
      funcEn: 'Nudge the AI forward.',
      howZh: '说话 / 句子',
      howEn: 'Speak / phrase',
      howKind: 'phrase',
      howTextZh: '常靠说话或固定句子；按键可选。',
      howTextEn: 'Usually speak or inject a phrase; key optional.'
    },
    stopOrSend: {
      titleZh: '发出去',
      titleEn: 'Send',
      whenZh: '输入框里写好了，要交给 AI。',
      whenEn: 'When the message is ready to send to AI.',
      effectZh: '在输入框里发送（一般是回车）。',
      effectEn: 'Sends in the composer (usually Enter).',
      funcZh: '把当前内容发出去。',
      funcEn: 'Submit the current message.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '常用回车；也可绑到识别键。',
      howTextEn: 'Often Enter; can bind to a recognition key.'
    },
    focusComposer: {
      titleZh: '回到 Cursor 输入框',
      titleEn: 'Back to Cursor input',
      whenZh: '人在别的软件里，要回到 Cursor 继续写。',
      whenEn: 'When you are in another app and need Cursor again.',
      effectZh: '切回 Cursor，并尽量点到输入框。',
      effectEn: 'Focuses Cursor and the input when possible.',
      funcZh: '先回到战场，再说话或打字。',
      funcEn: 'Return to Cursor first, then type or speak.',
      howZh: '切窗口',
      howEn: 'Focus app',
      howKind: 'focus',
      howTextZh: '主要是切过去，不一定是某个字母键。',
      howTextEn: 'Mostly focuses the app, not a letter key.'
    },
    newThread: {
      titleZh: '新开一局对话',
      titleEn: 'New chat',
      whenZh: '当前对话太乱，想重新开一局。',
      whenEn: 'When the chat is messy and you want a clean start.',
      effectZh: '新开一条对话。',
      effectEn: 'Starts a new chat.',
      funcZh: '干净上下文再开工。',
      funcEn: 'Fresh context to start again.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '常有系统新建快捷键。',
      howTextEn: 'Often has a native new-chat shortcut.'
    },
    paste: {
      titleZh: '粘贴进来',
      titleEn: 'Paste',
      whenZh: '剪贴板或截图要贴进 Cursor。',
      whenEn: 'When clipboard or a screenshot should go into Cursor.',
      effectZh: '聚焦后粘贴。',
      effectEn: 'Focuses then pastes.',
      funcZh: '把外面的内容贴进来。',
      funcEn: 'Paste outside content in.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '一般对应粘贴键。',
      howTextEn: 'Usually the paste shortcut.'
    },
    quickChat: {
      titleZh: '打开侧边聊天',
      titleEn: 'Open side chat',
      whenZh: '想拉开 Cursor 侧边 Chat / Agent。',
      whenEn: 'When you want the Cursor side Chat / Agent.',
      effectZh: '打开侧边聊天面板。',
      effectEn: 'Opens the side chat panel.',
      funcZh: '快速进聊天，不用鼠标翻菜单。',
      funcEn: 'Jump into chat without hunting menus.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '常见有编辑器快捷键。',
      howTextEn: 'Usually a native editor shortcut.'
    },
    commandPalette: {
      titleZh: '打开命令菜单',
      titleEn: 'Command palette',
      whenZh: '想搜 Cursor / VS Code 里的任意命令。',
      whenEn: 'When you need any Cursor / VS Code command.',
      effectZh: '打开命令面板，可搜索执行。',
      effectEn: 'Opens the command palette to search and run.',
      funcZh: '万能入口：记不住键时用它。',
      funcEn: 'Catch-all when you forget a shortcut.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '常见 Ctrl+Shift+P。',
      howTextEn: 'Often Ctrl+Shift+P.'
    },
    summarizeDiff: {
      titleZh: '总结这次改了什么',
      titleEn: 'Summarize changes',
      whenZh: '改了一堆文件，想让 AI 帮你概括。',
      whenEn: 'When many files changed and you want a summary.',
      effectZh: '塞入总结用的提示句（不自动替你跑命令）。',
      effectEn: 'Injects a summarize prompt (does not run commands for you).',
      funcZh: '要一句「总结改动」的提示。',
      funcEn: 'Ask for a change summary prompt.',
      howZh: '说话 / 句子',
      howEn: 'Speak / phrase',
      howKind: 'phrase',
      howTextZh: '靠固定提示句，不是系统快捷键。',
      howTextEn: 'Phrase inject, not a system shortcut.'
    },
    runChecks: {
      titleZh: '提醒去跑测试',
      titleEn: 'Remind to run checks',
      whenZh: '改完代码，想让 AI 提醒 lint / 测试。',
      whenEn: 'When you want AI to remind lint / tests.',
      effectZh: '塞入跑测试相关提示（不会自己开终端猛跑）。',
      effectEn: 'Injects a checks prompt (does not run the terminal itself).',
      funcZh: '要一句「去跑测试」的提示。',
      funcEn: 'Ask for a run-checks prompt.',
      howZh: '说话 / 句子',
      howEn: 'Speak / phrase',
      howKind: 'phrase',
      howTextZh: '提示句，不是一键跑终端。',
      howTextEn: 'A prompt, not a one-key terminal run.'
    },
    plan: {
      titleZh: '切到「先定计划」',
      titleEn: 'Switch to Plan mode',
      whenZh: '想先让 AI 写计划，再动手改。',
      whenEn: 'When you want a plan before edits.',
      effectZh: '切到计划模式（若 Cursor 支持该快捷键）。',
      effectEn: 'Switches to plan mode when supported.',
      funcZh: '先想清楚再改代码。',
      funcEn: 'Plan first, then code.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '有专用快捷键时可绑定。',
      howTextEn: 'Bind when the seeded shortcut exists.'
    },
    switchAgent: {
      titleZh: '切到「直接干活」',
      titleEn: 'Switch to Agent mode',
      whenZh: '计划够了，要 AI 直接改。',
      whenEn: 'When you are ready for AI to edit.',
      effectZh: '切到 Agent 模式。',
      effectEn: 'Switches to Agent mode.',
      funcZh: '进入动手改代码的模式。',
      funcEn: 'Enter hands-on edit mode.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '有专用快捷键时可绑定。',
      howTextEn: 'Bind when the seeded shortcut exists.'
    },
    cancel: {
      titleZh: '叫停生成',
      titleEn: 'Stop generation',
      whenZh: 'AI 跑偏了，或你想中断。',
      whenEn: 'When AI went wrong or you want to stop.',
      effectZh: '尽量停掉当前生成。',
      effectEn: 'Tries to stop the current generation.',
      funcZh: '紧急刹车。',
      funcEn: 'Emergency stop.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '适合配一个好按的键。',
      howTextEn: 'Worth a easy-to-hit key.'
    },
    quickSearch: {
      titleZh: '快速打开文件',
      titleEn: 'Quick open file',
      whenZh: '知道文件名，想马上跳过去。',
      whenEn: 'When you know the file name and want to jump.',
      effectZh: '打开快速打开/搜索文件。',
      effectEn: 'Opens Quick Open.',
      funcZh: '少翻侧栏。',
      funcEn: 'Skip sidebar hunting.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '常见 Ctrl+P。',
      howTextEn: 'Often Ctrl+P.'
    },
    inlineEdit: {
      titleZh: '就地改选中代码',
      titleEn: 'Inline edit selection',
      whenZh: '选中一段代码，想让 AI 就地改。',
      whenEn: 'When a selection should be edited in place.',
      effectZh: '打开行内编辑。',
      effectEn: 'Opens inline edit.',
      funcZh: '对着选区改，不整文件重来。',
      funcEn: 'Edit the selection, not the whole file.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '常见 Ctrl+K。',
      howTextEn: 'Often Ctrl+K.'
    },
    acceptTab: {
      titleZh: '接受灰色补全',
      titleEn: 'Accept Tab suggestion',
      whenZh: 'Cursor 给出灰色补全，你想收下。',
      whenEn: 'When a ghost Tab suggestion looks good.',
      effectZh: '接受当前补全建议。',
      effectEn: 'Accepts the current Tab suggestion.',
      funcZh: 'Tab 一下确认。',
      funcEn: 'Confirm with Tab.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '一般是 Tab。',
      howTextEn: 'Usually Tab.'
    },
    modeMenu: {
      titleZh: '切换聊天模式',
      titleEn: 'Cycle chat mode',
      whenZh: '要在 Ask / Agent 等模式间切换。',
      whenEn: 'When switching Ask / Agent modes.',
      effectZh: '打开或轮换模式菜单。',
      effectEn: 'Opens or cycles the mode menu.',
      funcZh: '换工作方式。',
      funcEn: 'Change how chat works.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '输入框里有时也能 Shift+Tab 轮换。',
      howTextEn: 'Shift+Tab may cycle in the input.'
    },
    nextChange: {
      titleZh: '看下一处改动',
      titleEn: 'Next change',
      whenZh: '在看建议/对比，想跳到下一处。',
      whenEn: 'When browsing diffs / suggestions.',
      effectZh: '跳到下一处（在 Cursor 上不一定每次都稳）。',
      effectEn: 'Jumps to the next hunk (may be flaky in Cursor).',
      funcZh: '浏览改动。',
      funcEn: 'Browse changes.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '有键可绑；不稳时别强依赖。',
      howTextEn: 'Bind if useful; do not rely if flaky.'
    },
    prevChange: {
      titleZh: '看上一处改动',
      titleEn: 'Previous change',
      whenZh: '想回到上一处建议/对比。',
      whenEn: 'When you want the previous hunk.',
      effectZh: '跳到上一处。',
      effectEn: 'Jumps to the previous hunk.',
      funcZh: '浏览改动。',
      funcEn: 'Browse changes.',
      howZh: '可加按键',
      howEn: 'Can add a key',
      howKind: 'key',
      howTextZh: '同上。',
      howTextEn: 'Same as next change.',
    },
    acceptChanges: {
      titleZh: '接受当前建议',
      titleEn: 'Accept current suggestion',
      whenZh: 'AI 给出一条可接受的修改。',
      whenEn: 'When one suggestion looks good.',
      effectZh: '接受当前这一处。',
      effectEn: 'Accepts the current suggestion.',
      funcZh: '确认单条建议。',
      funcEn: 'Confirm one suggestion.',
      howZh: '需先打开开关',
      howEn: 'Turn on first',
      howKind: 'warn',
      howTextZh: '默认关着，避免误触。',
      howTextEn: 'Off by default to avoid accidents.'
    },
    acceptAllChanges: {
      titleZh: '接受全部建议',
      titleEn: 'Accept all suggestions',
      whenZh: '多处建议都 OK，想一次收下。',
      whenEn: 'When you want to accept the whole batch.',
      effectZh: '接受当前这一批。',
      effectEn: 'Accepts the current batch.',
      funcZh: '批量确认。',
      funcEn: 'Confirm many at once.',
      howZh: '需先打开开关',
      howEn: 'Turn on first',
      howKind: 'warn',
      howTextZh: '默认关着。打开后再用。',
      howTextEn: 'Off by default; enable before use.'
    }
  };
  /** @type {{mappingId:string,sourceChannel:string,sourceBindingRef:string,actionId:string,keyBindingRef:string,actionInstanceId?:string,actionArgs?:*,iconHtml?:string}|null} */
  var selection = null;
  var viewsCache = [];
  /** SoftPad BindingViews for the scoped app mapping (may differ from selected/global). */
  var softPadViewsCache = [];
  var softPadViewsMappingId = '';
  var bindableByAction = {};
  var bindableMappingId = '';
  var bound = false;
  var renderToken = 0;
  /** When editing global baseline: appTargetId chosen for SoftPad proxy (e.g. codex-chat). */
  var softPadScopeAppId = '';
  /** Explicit mapping pick when multiple scenarios share appTargetId. */
  var softPadScopeMappingIdOverride = '';
  /** Voice pick UI: remember selected option across re-render. */
  var voicePickSelectedId = '';
  var voicePickSubtabId = '';
  /** Cursor pick UI: remember selected slot across re-render. */
  var cursorPickSelectedId = '';
  var cursorPickSubtabId = '';
  /** Camera pick UI: remember selected gesture across re-render. */
  var cameraPickSelectedId = '';
  /** Soft Pad pick UI: remember selected microKeyId across re-render. */
  var softPadPickSelectedId = '';
  var softPadPickSubtabId = '';
  /**
   * Custom-key match being edited in the sequence card / 02 preview.
   * Must NOT replace selectedMappingId — that anchors 01 trigger for the habit.
   */
  var customKeyMatchEditId = '';
  /** 'none' | 'manual' | 'record' — session lock for SoftPad app scope. */
  var scopeLock = 'none';
  var autoPreselectDone = false;
  var autoPreselectHint = false;
  var scopeSessionMappingId = '';
  /** Frozen selection for in-flight key recording / wizard. */
  var recordSnap = null;
  var capturePopoverOpen = false;
  var captureReturnPanel = '';
  var capturePopoverEscapeBound = false;
  /** Debounce ConfigPersist.save after captureHeroRef writes. */
  var persistHeroSaveTimer = null;

  var SOFTPAD_SCOPE_PRIMARY = [
    { appTargetId: 'codex-chat', kind: 'codex', titleKey: 'softPadHubKindCodex', titleFb: 'Codex' },
    { appTargetId: 'claude-code', kind: 'claude', titleKey: 'softPadHubKindClaude', titleFb: 'Claude' },
    { appTargetId: 'cursor-chat', kind: 'cursor', titleKey: 'softPadHubKindCursor', titleFb: 'Cursor' }
  ];

  function t(k, fb) {
    if (global.OneToneI18n && global.OneToneI18n.t) {
      var v = global.OneToneI18n.t(k);
      if (v && v !== k) return v;
    }
    return fb || k;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Horizontal scenario tabs for long pick lists (voice / cursor / softPad). */
  function renderPickSubtabsHtml(tabs, activeId, channel) {
    if (!tabs || tabs.length < 2) return '';
    var html =
      '<div class="keys-pick-subtabs" role="tablist" aria-label="' +
      esc(t('keysPickSubtabsLabel', '分类')) +
      '">';
    var i;
    for (i = 0; i < tabs.length; i++) {
      var tab = tabs[i];
      var on = String(tab.id) === String(activeId);
      html +=
        '<button type="button" role="tab" class="keys-pick-subtab' +
        (on ? ' is-active' : '') +
        '" data-pick-subtab="' +
        esc(tab.id) +
        '" data-pick-channel="' +
        esc(channel) +
        '" aria-selected="' +
        (on ? 'true' : 'false') +
        '">' +
        esc(tab.title) +
        '</button>';
    }
    return html + '</div>';
  }

  function pickSubtabResolve(tabs, currentId, preferredGroupId) {
    var ids = {};
    var i;
    for (i = 0; i < (tabs || []).length; i++) ids[String(tabs[i].id)] = true;
    if (currentId && ids[String(currentId)]) return String(currentId);
    if (preferredGroupId && ids[String(preferredGroupId)]) return String(preferredGroupId);
    return tabs && tabs[0] ? String(tabs[0].id) : '';
  }

  function voicePickGroupMeta(row) {
    var aid = canonicalActionId((row && row.actionId) || '');
    var blob = (
      aid +
      ' ' +
      String((row && row.name) || '') +
      ' ' +
      String((row && row.say) || '') +
      ' ' +
      String((row && row.pickId) || '')
    ).toLowerCase();
    if (
      String((row && row.pickId) || '').indexOf('voice-acoustic:') === 0 ||
      aid === 'app.open' ||
      aid.indexOf('app.open') === 0
    ) {
      return { id: 'open', title: t('keysVoicePickGroupOpen', '打开应用') };
    }
    if (/input\.start|startdictation|pushtotalk|听写|麦克风/.test(blob)) {
      return { id: 'dictation', title: t('keysVoicePickGroupDictation', '听写') };
    }
    if (/input\.(send|commit)|stoporsend|发送|完成/.test(blob)) {
      return { id: 'send', title: t('keysVoicePickGroupSend', '发送') };
    }
    if (/input\.cancel|cancel|取消|disarm/.test(blob)) {
      return { id: 'cancel', title: t('keysVoicePickGroupCancel', '取消') };
    }
    if (/continue|agent|arm|status|plan|codex|继续|助手/.test(blob)) {
      return { id: 'agent', title: t('keysVoicePickGroupAgent', 'Agent') };
    }
    return { id: 'more', title: t('keysVoicePickGroupMore', '其它') };
  }

  function softPadPickGroupMeta(row) {
    var aid = canonicalActionId((row && row.actionId) || '');
    var blob = (aid + ' ' + String((row && row.name) || '')).toLowerCase();
    if (/input\.start|startdictation|pushtotalk|听写|麦克风/.test(blob)) {
      return { id: 'dictation', title: t('keysSoftPadPickGroupDictation', '听写') };
    }
    if (/input\.(send|commit)|stoporsend|发送|完成/.test(blob)) {
      return { id: 'send', title: t('keysSoftPadPickGroupSend', '发送') };
    }
    if (/input\.cancel|cancel|取消/.test(blob)) {
      return { id: 'cancel', title: t('keysSoftPadPickGroupCancel', '取消') };
    }
    if (
      aid === 'app.shortcut' ||
      /^cursor\./.test(aid) ||
      /newthread|quickchat|commandpalette|inlineedit|accept|plan|switchagent/.test(blob)
    ) {
      return { id: 'app', title: t('keysSoftPadPickGroupApp', '应用快捷键') };
    }
    return { id: 'more', title: t('keysSoftPadPickGroupMore', '其它') };
  }

  function toast(msg) {
    try {
      if (global.OneToneUiFeedback && global.OneToneUiFeedback.toast) {
        global.OneToneUiFeedback.toast(msg);
      }
    } catch (_) {}
  }

  function state() {
    return (global.OneToneState && global.OneToneState.state) || {};
  }

  function config() {
    return state().config || state().cfg || {};
  }

  function selectedMappingId() {
    return String(state().selectedMappingId || '').trim();
  }

  function mappingById(id) {
    var mappings = Array.isArray(config().mappings) ? config().mappings : [];
    for (var i = 0; i < mappings.length; i++) {
      if (mappings[i].id === id) return mappings[i];
    }
    return null;
  }

  function activeMapping() {
    var id = selectedMappingId();
    return id ? mappingById(id) : null;
  }

  function isAppScenarioMapping(m) {
    if (!m) return false;
    var diff = global.OneToneHabitOverrideDiff;
    if (diff && typeof diff.isAppScenarioMapping === 'function') {
      return !!diff.isAppScenarioMapping(m);
    }
    return !!String(m.appTargetId || '').trim();
  }

  function isGlobalKeysEditContext() {
    var m = activeMapping();
    if (!m) return true;
    return !isAppScenarioMapping(m);
  }

  function softPadScopePrimaryDef(appId) {
    var id = String(appId || '').trim();
    for (var i = 0; i < SOFTPAD_SCOPE_PRIMARY.length; i++) {
      if (SOFTPAD_SCOPE_PRIMARY[i].appTargetId === id) return SOFTPAD_SCOPE_PRIMARY[i];
    }
    return null;
  }

  function softPadAppTitle(appId) {
    var id = String(appId || '').trim();
    var def = softPadScopePrimaryDef(id);
    if (def) return t(def.titleKey, def.titleFb);
    var hub = global.OneToneSoftPadHub;
    if (hub && typeof hub.kindForAppId === 'function' && typeof hub.listSoftPadSchemes === 'function') {
      var kind = hub.kindForAppId(id);
      if (kind === 'workbuddy') return t('softPadHubKindWorkBuddy', 'WorkBuddy');
      if (kind === 'trae') return t('softPadHubKindTrae', 'Trae');
      if (kind === 'qoder') return t('softPadHubKindQoder', 'Qoder');
      if (kind === 'minimax') return t('softPadHubKindMinimax', 'MiniMax');
    }
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.presetById) {
      var p = presets.presetById(id);
      if (p && p.nameKey) {
        var n = t(p.nameKey);
        if (n && n !== p.nameKey) return n;
      }
      if (p && p.name) return String(p.name);
    }
    return id || t('keysSoftPadScopeApp', '应用');
  }

  function softPadAppIconSrc(appId) {
    var id = String(appId || '').trim();
    if (!id) return '';
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.presetById) {
      var p = presets.presetById(id);
      if (p && p.icon) return String(p.icon);
    }
    return '';
  }

  function softPadAppIconHtml(appId) {
    var src = softPadAppIconSrc(appId);
    if (!src) return '';
    return (
      '<img class="soft-pad-app-chip-icon" src="' +
      esc(src) +
      '" alt="" decoding="async" width="18" height="18" />'
    );
  }

  function softPadScopeChipHtml(appTargetId, title, opts) {
    opts = opts || {};
    var on = !!opts.active;
    var recordLocked = !!opts.recordLocked;
    return (
      '<button type="button" class="soft-pad-app-chip' +
      (on ? ' is-active' : '') +
      '" role="tab" data-softpad-scope-app="' +
      esc(appTargetId) +
      '" aria-selected="' +
      (on ? 'true' : 'false') +
      '"' +
      (recordLocked ? ' disabled' : '') +
      ' title="' +
      esc(title) +
      '">' +
      softPadAppIconHtml(appTargetId) +
      '<span>' +
      esc(title) +
      '</span></button>'
    );
  }

  function listScenariosForAppTargetId(appId) {
    var id = String(appId || '').trim();
    if (!id) return [];
    var list = Array.isArray(config().mappings) ? config().mappings : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || !isAppScenarioMapping(m)) continue;
      if (String(m.appTargetId || '') === id) out.push(m);
    }
    return out;
  }

  function scenarioIsEnabled(m) {
    return !!(m && m.enabled !== false);
  }

  function scenarioHasPad(m) {
    return !!(m && m.codexMicroPad);
  }

  function scenarioPadSwitchOn(m) {
    return !!(m && m.codexMicroPad && m.codexMicroPad.enabled);
  }

  /**
   * Build SoftPad scope from a concrete mapping.
   * Pad object present (even if pad.enabled=false) → ready to show/bind.
   * No pad → missingScenario (prepare only; no Options/upsert).
   */
  function scopeFromMapping(mapping, base) {
    base = base || {};
    var appId = String(
      (mapping && mapping.appTargetId) || base.appTargetId || softPadScopeAppId || ''
    ).trim();
    var def = softPadScopePrimaryDef(appId);
    var ready = scenarioHasPad(mapping);
    var mid = mapping && mapping.id ? String(mapping.id) : '';
    return {
      scopeKind: base.scopeKind || (def ? def.kind : appId || 'app'),
      sourceMappingId: mid,
      targetMappingId: ready ? mid : '',
      title:
        base.title ||
        softPadAppTitle(appId) ||
        String((mapping && mapping.name) || ''),
      globalProxy: !!base.globalProxy,
      appTargetId: appId,
      missingScenario: !ready,
      ambiguous: false,
      scenarios: Array.isArray(base.scenarios) ? base.scenarios : []
    };
  }

  function resetSoftPadScopeSession() {
    softPadScopeAppId = '';
    softPadScopeMappingIdOverride = '';
    scopeLock = 'none';
    autoPreselectDone = false;
    autoPreselectHint = false;
    recordSnap = null;
  }

  function ensureSoftPadScopeSession() {
    var mid = selectedMappingId();
    if (scopeSessionMappingId && mid && scopeSessionMappingId !== mid) {
      resetSoftPadScopeSession();
    }
    if (keysStep() !== 'target') {
      resetSoftPadScopeSession();
      scopeSessionMappingId = mid;
      return;
    }
    scopeSessionMappingId = mid;
  }

  /**
   * SoftPad read/write context. Global edit requires an explicit app scope;
   * scenario edit uses the selected mapping directly (no chip UI).
   * Hub never decides which mapping to write — only app auto-preselect.
   */
  function resolveSoftPadScope() {
    var selected = activeMapping();
    if (selected && isAppScenarioMapping(selected)) {
      var appIdSel = String(selected.appTargetId || '').trim();
      return scopeFromMapping(selected, {
        globalProxy: false,
        appTargetId: appIdSel,
        title: softPadAppTitle(appIdSel) || String(selected.name || ''),
        scenarios: []
      });
    }
    var scopeApp = String(softPadScopeAppId || '').trim();
    if (!scopeApp) return null;
    var def = softPadScopePrimaryDef(scopeApp);
    var title = softPadAppTitle(scopeApp);
    var scenarios = listScenariosForAppTargetId(scopeApp);
    var base = {
      globalProxy: true,
      appTargetId: scopeApp,
      scopeKind: def ? def.kind : scopeApp,
      title: title,
      scenarios: scenarios
    };
    var override = String(softPadScopeMappingIdOverride || '').trim();

    if (override) {
      var overrideMap = mappingById(override);
      if (overrideMap && String(overrideMap.appTargetId || '') === scopeApp) {
        return scopeFromMapping(overrideMap, base);
      }
    }

    if (!scenarios.length) {
      return {
        scopeKind: def ? def.kind : scopeApp,
        sourceMappingId: '',
        targetMappingId: '',
        title: title,
        globalProxy: true,
        appTargetId: scopeApp,
        missingScenario: true,
        ambiguous: false,
        scenarios: []
      };
    }

    if (scenarios.length === 1) {
      return scopeFromMapping(scenarios[0], base);
    }

    // ponytail: canonical pick — preset apps should have at most one enabled scenario after reconcile
    var hubCanon = global.OneToneHabitHub;
    var canonical =
      hubCanon && hubCanon.pickCanonicalAppScenario
        ? hubCanon.pickCanonicalAppScenario(scenarios)
        : null;
    if (canonical) {
      return scopeFromMapping(canonical, base);
    }

    var enabled = [];
    var i;
    for (i = 0; i < scenarios.length; i++) {
      if (scenarioIsEnabled(scenarios[i])) enabled.push(scenarios[i]);
    }
    if (enabled.length === 1) {
      return scopeFromMapping(enabled[0], base);
    }
    // Legacy fallback only — normal data should not reach ambiguous after reconcile.
    return {
      scopeKind: def ? def.kind : scopeApp,
      sourceMappingId: '',
      targetMappingId: '',
      title: title,
      globalProxy: true,
      appTargetId: scopeApp,
      missingScenario: false,
      ambiguous: true,
      scenarios: scenarios
    };
  }

  function softPadWorkMapping() {
    var ctx = resolveSoftPadScope();
    if (!ctx || !ctx.targetMappingId) return null;
    return mappingById(ctx.targetMappingId);
  }

  function softPadWorkMappingId() {
    var ctx = resolveSoftPadScope();
    return ctx && ctx.targetMappingId ? String(ctx.targetMappingId) : '';
  }

  function softPadAuthorityReady(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return false;
    return softPadViewsMappingId === mid && bindableMappingId === mid;
  }

  function softPadAuthorityPending(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return false;
    return !softPadAuthorityReady(mid);
  }

  function canRecordSoftPadSelection(ctx) {
    var mid = String((ctx && ctx.targetMappingId) || '');
    return !!(
      selection &&
      selection.sourceChannel === 'softPad' &&
      selection.mappingId === mid &&
      softPadAuthorityReady(mid) &&
      bindableMappingId === mid &&
      bindableByAction[selection.actionId] === true
    );
  }

  function setSoftPadScopeAppId(appId, opts) {
    opts = opts || {};
    if (scopeLock === 'record' && !opts.force) {
      toast(t('keysSoftPadScopeRecordLocked', '录制中不可切换应用作用域'));
      return;
    }
    softPadScopeAppId = String(appId || '').trim();
    softPadScopeMappingIdOverride = '';
    if (opts.fromAuto) {
      autoPreselectHint = true;
    } else {
      scopeLock = 'manual';
      autoPreselectHint = false;
      autoPreselectDone = true;
    }
    if (!(opts && opts.skipClear)) {
      clearSelection({ skipRender: true, skipHero: true, skipPersist: true });
    }
    if (!(opts && opts.skipRender)) {
      if (opts && opts.refresh) refresh();
      else renderPanelOnly();
    }
    if (!(opts && opts.skipHero)) applyHero();
  }

  function setSoftPadScopeMappingOverride(mappingId, opts) {
    opts = opts || {};
    if (scopeLock === 'record' && !opts.force) {
      toast(t('keysSoftPadScopeRecordLocked', '录制中不可切换应用作用域'));
      return;
    }
    softPadScopeMappingIdOverride = String(mappingId || '').trim();
    scopeLock = 'manual';
    autoPreselectHint = false;
    autoPreselectDone = true;
    if (!(opts && opts.skipClear)) {
      clearSelection({ skipRender: true, skipHero: true, skipPersist: true });
    }
    if (!(opts && opts.skipRender)) {
      if (opts && opts.refresh) refresh();
      else renderPanelOnly();
    }
    if (!(opts && opts.skipHero)) applyHero();
  }

  function isKnownSoftPadAppTargetId(appId) {
    var id = String(appId || '').trim();
    if (!id || id === 'custom') return false;
    var presets = global.OneToneAppTargetPresets;
    if (presets && presets.isWorkflowAppTarget && presets.isWorkflowAppTarget(id)) return true;
    if (presets && presets.presetById && presets.presetById(id)) return true;
    return !!softPadScopePrimaryDef(id);
  }

  function maybeAutoPreselectSoftPadScope() {
    if (!isGlobalKeysEditContext()) return false;
    if (!openPanels.softPad) return false;
    if (String(softPadScopeAppId || '').trim()) return false;
    if (scopeLock !== 'none') return false;
    if (autoPreselectDone) return false;
    autoPreselectDone = true;
    var hub = global.OneToneSoftPadHub;
    var fg = '';
    if (hub && typeof hub.getFreshForegroundAppId === 'function') {
      fg = String(hub.getFreshForegroundAppId() || '').trim();
    }
    if (fg && isKnownSoftPadAppTargetId(fg)) {
      softPadScopeAppId = fg;
      softPadScopeMappingIdOverride = '';
      autoPreselectHint = true;
      return true;
    }
    // Fallback: first primary app with an enabled mapping that has a pad, else Codex.
    var i;
    for (i = 0; i < SOFTPAD_SCOPE_PRIMARY.length; i++) {
      var appId = SOFTPAD_SCOPE_PRIMARY[i].appTargetId;
      var sc = listScenariosForAppTargetId(appId);
      var hasReady = false;
      var j;
      for (j = 0; j < sc.length; j++) {
        if (scenarioIsEnabled(sc[j]) && scenarioHasPad(sc[j])) {
          hasReady = true;
          break;
        }
      }
      if (hasReady) {
        softPadScopeAppId = appId;
        softPadScopeMappingIdOverride = '';
        autoPreselectHint = false;
        return true;
      }
    }
    softPadScopeAppId = 'codex-chat';
    softPadScopeMappingIdOverride = '';
    autoPreselectHint = false;
    return true;
  }

  /** Ensure SoftPad tab always has an app scope so the pad stage can render. */
  function ensureSoftPadDefaultScope() {
    if (!isGlobalKeysEditContext()) return false;
    if (!openPanels.softPad) return false;
    if (String(softPadScopeAppId || '').trim()) return false;
    if (scopeLock === 'manual' || scopeLock === 'record') return false;
    if (!autoPreselectDone) return maybeAutoPreselectSoftPadScope();
    // auto already ran and left empty (should not happen) — force Codex
    softPadScopeAppId = 'codex-chat';
    softPadScopeMappingIdOverride = '';
    return true;
  }

  function keysStep() {
    try {
      if (global.OneToneKeysPageState && global.OneToneKeysPageState.getStep) {
        return String(global.OneToneKeysPageState.getStep() || 'trigger');
      }
    } catch (_) {}
    return 'trigger';
  }

  function finishSendMode() {
    var cfg = config();
    var end = cfg.voiceEnd || cfg.voice_end || {};
    return String(end.sendMode || end.send_mode || 'manual').toLowerCase();
  }

  function canonicalActionId(raw) {
    if (global.OneToneAgentActions && global.OneToneAgentActions.resolveCanonicalActionId) {
      return global.OneToneAgentActions.resolveCanonicalActionId(raw, finishSendMode());
    }
    return String(raw || '').trim();
  }

  function isSemanticKeyAction(actionId) {
    var id = String(actionId || '').trim();
    if (!id) return false;
    if (id.indexOf('.') >= 0) return true;
    return id === 'app.shortcut' || id === 'app.open';
  }

  function defaultChordForSlot(slotId) {
    var A = global.OneToneAgentActions;
    var id = String(slotId || '').trim();
    if (!id) return '';
    if (A && typeof A.defaultKeyForSlot === 'function') {
      return String(A.defaultKeyForSlot(id) || '').trim();
    }
    if (A && A.DEFAULT_KEY_BY_SLOT) {
      return String(A.DEFAULT_KEY_BY_SLOT[id] || '').trim();
    }
    return '';
  }

  function actionIdFromSlot(slotId) {
    var sid = String(slotId || '').trim();
    if (!sid) return '';
    if (sid === 'stopOrSend') return canonicalActionId('stopOrSendDictation');
    var A = global.OneToneAgentActions;
    var slot = A && A.slotById ? A.slotById(sid) : null;
    var raw = slot ? String(slot.actionId || sid) : sid;
    if (raw === 'stopOrSendDictation' || raw === 'stopOrSend') {
      return canonicalActionId('stopOrSendDictation');
    }
    return canonicalActionId(raw);
  }

  function keyBindingOnSlot(m, slotId) {
    if (!m || !slotId) return null;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (b && b.slotId === slotId && b.triggerType === 'key') return b;
    }
    return null;
  }

  function friendlyChord(chord) {
    var raw = String(chord || '').trim();
    if (!raw) return '';
    try {
      var hooks = global.__vp_mapping_recording_hooks__;
      if (hooks && hooks.friendlyKeyName) return hooks.friendlyKeyName(raw);
    } catch (_) {}
    return raw;
  }

  /** Recognition-key chord for an action, if any. */
  function recognitionChord(actionId, actionInstanceId, bindMapping) {
    var m = bindMapping || mappingById(selectedMappingId());
    var keyB = findKeyBinding(m, actionId, actionInstanceId || '');
    return keyB ? String(keyB.triggerBinding || '').trim() : '';
  }

  /**
   * Native <option> label when a chord exists. Empty string ⇒ hide row (未设键不展示).
   */
  function pickOptionLabel(name, actionId, actionInstanceId, bindMapping, chordHint) {
    var title = String(name || '').trim() || String(actionId || '').trim() || '?';
    var chord =
      recognitionChord(actionId, actionInstanceId || '', bindMapping) ||
      String(chordHint || '').trim();
    if (!chord) return '';
    return '● ' + title + ' · ' + (friendlyChord(chord) || chord);
  }

  function softPadPickChord(workM, resolved) {
    if (!resolved) return '';
    var chord = recognitionChord(
      resolved.actionId,
      resolved.actionInstanceId || '',
      workM
    );
    if (chord) return chord;
    if (resolved.actionArgs && resolved.actionArgs.chord) {
      return String(resolved.actionArgs.chord || '').trim();
    }
    return '';
  }

  function normalizeChord(chord) {
    return String(chord || '')
      .trim()
      .toLowerCase()
      .replace(/\s*\+\s*/g, '+')
      .replace(/\s+/g, '');
  }

  function actionLabel(actionId) {
    var store = global.OneToneSemanticActionStore;
    if (store && store.entryMeta) {
      var meta = store.entryMeta(actionId);
      if (meta) {
        var lang = (global.OneToneI18n && global.OneToneI18n.lang) || 'zh';
        if (lang === 'en' && meta.labelEn) return meta.labelEn;
        if (meta.labelZh) return meta.labelZh;
        if (meta.label_zh) return meta.label_zh;
        if (meta.labelEn) return meta.labelEn;
      }
    }
    var A = global.OneToneAgentActions;
    if (A && A.resolveCanonicalActionId && A.actionById) {
      var legacy = A.actionById(String(actionId || '').split('.').pop());
      if (legacy) {
        var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
        return en ? legacy.labelEn || legacy.labelZh : legacy.labelZh || legacy.labelEn;
      }
    }
    return String(actionId || '').trim() || '—';
  }

  function gestureLabel(ref) {
    var map = {
      onAway: 'keysChannelGestureOnAway',
      onReturn: 'keysChannelGestureOnReturn',
      shakeHead: 'keysChannelGestureShakeHead',
      deliberateBlink: 'keysChannelGestureDeliberateBlink',
      openPalm: 'keysChannelGestureOpenPalm',
      okHand: 'keysChannelGestureOkHand',
      fist: 'keysChannelGestureFist',
      wave: 'keysChannelGestureWave'
    };
    var key = map[ref];
    return key ? t(key, ref) : String(ref || '');
  }

  function channelOnlyLabel(channel) {
    var name =
      channel === 'voice'
        ? t('keysChannelTabVoice', '口头指令')
        : channel === 'softPad'
          ? t('keysChannelTabSoftPad', '屏幕按钮')
          : t('keysChannelTabCamera', '手势');
    return t('keysChannelKeyOnly', '仅{channel}可用').replace('{channel}', name);
  }

  function viewRef(v) {
    return String((v && (v.bindingRef || v.binding_ref)) || '').trim();
  }

  function viewChannel(v) {
    return String((v && v.channel) || '').trim();
  }

  function viewActionId(v) {
    return canonicalActionId((v && (v.actionId || v.action_id)) || '');
  }

  function viewTrigger(v) {
    return String((v && v.trigger) || '').trim();
  }

  function findKeyBinding(m, actionId, actionInstanceId) {
    if (!m) return null;
    var want = canonicalActionId(actionId);
    var wantInst = String(actionInstanceId || '').trim();
    var multi =
      global.OneToneActionBindingAdapters &&
      global.OneToneActionBindingAdapters.isMultiInstance &&
      global.OneToneActionBindingAdapters.isMultiInstance(want);
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.triggerType !== 'key') continue;
      if (canonicalActionId(b.actionId) !== want) continue;
      if (multi) {
        if (wantInst && String(b.actionInstanceId || '') === wantInst) return b;
        continue;
      }
      return b;
    }
    return null;
  }

  function softPadViewsForResolve(mappingId) {
    var mid = String(mappingId || softPadWorkMappingId() || '').trim();
    var rows = [];
    if (mid && softPadViewsMappingId === mid) rows = softPadViewsCache;
    else if (mid && selectedMappingId() === mid) rows = viewsCache;
    return (rows || []).filter(function (v) {
      return viewChannel(v) === 'softPad' && v.enabled !== false;
    });
  }

  function routeOnPad(pad, microKeyId) {
    if (!pad || !Array.isArray(pad.keys) || !microKeyId) return null;
    for (var i = 0; i < pad.keys.length; i++) {
      if (pad.keys[i] && pad.keys[i].microKeyId === microKeyId) return pad.keys[i];
    }
    return null;
  }

  function findAgentBindingPreferSoftPad(m, slotId) {
    if (!m || !slotId) return null;
    var list = m.agentBindings || [];
    var soft = null;
    var key = null;
    var any = null;
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.slotId !== slotId) continue;
      if (b.triggerType === 'softPad' && !soft) soft = b;
      else if (b.triggerType === 'key' && !key) key = b;
      else if (!any) any = b;
    }
    return soft || key || any;
  }

  /**
   * Resolve a Soft Pad microKey to a key-channel-migratable action.
   * sourceBindingRef must stay microKeyId; keyBindingRef only from findKeyBinding.
   * opts.skipBindable: peek actionId before Options map is loaded.
   */
  function resolveMigratableAction(m, microKeyId, opts) {
    var mid = String(microKeyId || '').trim();
    if (!mid || mid === 'ENC' || mid === 'JOY' || /^NAV_/.test(mid)) return null;
    if (/^NPAD_/.test(mid) || /^NUM_/.test(mid)) return null;

    var workMid = String((m && m.id) || '').trim();
    if (!(opts && opts.skipBindable) && softPadAuthorityPending(workMid)) return null;
    var views = softPadViewsForResolve(workMid);
    var v = null;
    var i;
    for (i = 0; i < views.length; i++) {
      if (viewRef(views[i]) === mid) {
        v = views[i];
        break;
      }
    }
    if (!v) {
      for (i = 0; i < views.length; i++) {
        if (viewTrigger(views[i]) === mid) {
          v = views[i];
          break;
        }
      }
    }

    var pad = m && m.codexMicroPad;
    var route = routeOnPad(pad, mid);
    var slotId =
      route && route.enabled !== false ? String(route.slotId || '').trim() : '';

    if (!v && slotId) {
      for (i = 0; i < views.length; i++) {
        if (viewRef(views[i]) === slotId) {
          v = views[i];
          break;
        }
      }
    }

    var actionId = '';
    var sourceBinding = null;
    if (v) {
      actionId = viewActionId(v);
      var vRef = viewRef(v);
      sourceBinding = findAgentBindingPreferSoftPad(m, vRef);
      if (!sourceBinding && slotId && slotId !== vRef) {
        sourceBinding = findAgentBindingPreferSoftPad(m, slotId);
      }
      // Projection views use microKeyId as bindingRef; args live on key binding at route.slotId.
      if ((!sourceBinding || sourceBinding.triggerType === 'key') && slotId) {
        var bySlot = findAgentBindingPreferSoftPad(m, slotId);
        if (bySlot) sourceBinding = bySlot;
      }
    }

    if (!actionId && slotId) {
      sourceBinding = findAgentBindingPreferSoftPad(m, slotId);
      if (sourceBinding) actionId = canonicalActionId(sourceBinding.actionId);
    }

    if (!actionId && slotId) {
      actionId = actionIdFromSlot(slotId);
    }

    actionId = canonicalActionId(actionId);
    if (!actionId && !slotId) return null;

    var actionInstanceId = '';
    var actionArgs = null;

    if (sourceBinding) {
      var srcAid = canonicalActionId(sourceBinding.actionId);
      if (isSemanticKeyAction(srcAid)) {
        actionId = srcAid;
        actionInstanceId = String(sourceBinding.actionInstanceId || '').trim();
        actionArgs = sourceBinding.actionArgs != null ? sourceBinding.actionArgs : null;
      }
    }

    // Legacy Soft Pad hotkey slots → app.shortcut + default/output chord.
    if (!isSemanticKeyAction(actionId)) {
      if (!slotId) return null;
      var chord = '';
      var keyOnSlot = keyBindingOnSlot(m, slotId);
      if (keyOnSlot) {
        chord = String(keyOnSlot.triggerBinding || '').trim();
      }
      if (!chord) chord = defaultChordForSlot(slotId);
      if (!chord) {
        var slotted = actionIdFromSlot(slotId);
        if (isSemanticKeyAction(slotted)) {
          actionId = slotted;
        } else {
          return null;
        }
      } else {
        actionId = 'app.shortcut';
        actionInstanceId = 'softpad-mig:' + mid;
        actionArgs = { chord: chord };
      }
    }

    if (!(opts && opts.skipBindable) && bindableByAction[actionId] === false) {
      return null;
    }

    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    return {
      microKeyId: mid,
      actionId: actionId,
      actionInstanceId: actionInstanceId,
      actionArgs: actionArgs,
      keyBindingRef: keyB ? String(keyB.slotId || '') : '',
      uiIconId: route ? String(route.uiIconId || '').trim() : '',
      sourceTriggerType: sourceBinding ? String(sourceBinding.triggerType || '') : ''
    };
  }

  /** Non-mutating Soft Pad preview (never call ensurePad). */
  function previewPadClone(m) {
    var src = m && m.codexMicroPad;
    if (src && typeof src === 'object') {
      return Object.assign({}, src, {
        enabled: true,
        keys: Array.isArray(src.keys) ? src.keys.slice() : []
      });
    }
    return { enabled: true, keys: [], skin: '' };
  }

  function findMicroKeyForSlotLocal(m, slotId) {
    var pad = m && m.codexMicroPad;
    if (!pad || !Array.isArray(pad.keys) || !slotId) return '';
    for (var i = 0; i < pad.keys.length; i++) {
      var k = pad.keys[i];
      if (k && k.enabled !== false && k.slotId === slotId) return String(k.microKeyId || '');
    }
    return '';
  }

  function findChordConflict(m, chord, excludeSlotId) {
    var cap = global.OneToneAgentCapabilityUi;
    if (cap && cap.findChordConflict) {
      return cap.findChordConflict(m, chord, excludeSlotId || '');
    }
    var norm = normalizeChord(chord);
    if (!norm || !m) return null;
    var list = m.agentBindings || [];
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (!b || b.triggerType !== 'key' || b.enabled === false) continue;
      if (excludeSlotId && b.slotId === excludeSlotId) continue;
      if (normalizeChord(b.triggerBinding) === norm) {
        return { kind: 'capability', slotId: b.slotId, label: b.slotId };
      }
    }
    if (normalizeChord(m.triggerKey) === norm) {
      return { kind: 'trigger', label: t('codexCapConflictTrigger', '触发键') };
    }
    if (normalizeChord(m.targetKey) === norm) {
      return { kind: 'ime', label: t('codexCapConflictIme', '语音识别键') };
    }
    return null;
  }

  function getSelection() {
    return selection;
  }

  function hasSelection() {
    return !!(selection && selection.mappingId && selection.actionId);
  }

  function clearSelection(opts) {
    var had = !!selection;
    selection = null;
    // skipHero ⇒ temporary UI clear (e.g. Soft Pad scope) — do not wipe persisted 02 hero to IME.
    if (had && !(opts && opts.skipPersist) && !(opts && opts.skipHero)) {
      persistHeroCapture(defaultCaptureHeroRef());
    }
    if (had && !(opts && opts.skipHero)) applyHero();
    if (had && !(opts && opts.skipRender)) renderPanelOnly();
    if (had && !(opts && opts.skipHero)) syncRecognitionEditorPreview();
    if (had && global.OneToneCodexMicroPadUi && global.OneToneCodexMicroPadUi.notifySelection) {
      try {
        global.OneToneCodexMicroPadUi.notifySelection('');
      } catch (_) {}
    }
  }

  function setSelection(next, opts) {
    selection = next
      ? {
          mappingId: String(next.mappingId || ''),
          sourceChannel: String(next.sourceChannel || ''),
          sourceBindingRef: String(next.sourceBindingRef || ''),
          actionId: String(next.actionId || ''),
          keyBindingRef: String(next.keyBindingRef || ''),
          actionInstanceId: String(next.actionInstanceId || ''),
          actionArgs: next.actionArgs != null ? next.actionArgs : null,
          iconHtml: next.iconHtml != null ? String(next.iconHtml) : ''
        }
      : null;
    if (next && !(opts && opts.skipPersist)) {
      persistHeroCapture(selectionToHeroRef(selection));
    }
    if (!(opts && opts.skipHero)) applyHero();
    if (!(opts && opts.skipRender)) renderPanelOnly();
    if (!(opts && opts.skipHero)) syncRecognitionEditorPreview();
  }

  /** Codex chip bridge: sourceBindingRef is microKeyId only; keyBindingRef from key binding. */
  function selectFromSlotId(mappingId, slotId) {
    var mid = String(mappingId || selectedMappingId() || '').trim();
    var sid = String(slotId || '').trim();
    if (!mid || !sid) {
      clearSelection();
      return;
    }
    var m = mappingById(mid);
    var microId = findMicroKeyForSlotLocal(m, sid);
    if (microId) {
      var resolved = resolveMigratableAction(m, microId);
      if (resolved) {
        setSelection({
          mappingId: mid,
          sourceChannel: 'softPad',
          sourceBindingRef: microId,
          actionId: resolved.actionId,
          keyBindingRef: resolved.keyBindingRef || '',
          actionInstanceId: resolved.actionInstanceId || '',
          actionArgs: resolved.actionArgs
        });
        return;
      }
    }
    var keyB = null;
    var list = (m && m.agentBindings) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] && list[i].slotId === sid && list[i].triggerType === 'key') {
        keyB = list[i];
        break;
      }
    }
    var actionId = keyB
      ? canonicalActionId(keyB.actionId)
      : (function () {
          var A = global.OneToneAgentActions;
          var slot = A && A.slotById ? A.slotById(sid) : null;
          return slot ? canonicalActionId(slot.actionId) : '';
        })();
    if (!actionId || !keyB) {
      clearSelection();
      return;
    }
    setSelection({
      mappingId: mid,
      sourceChannel: 'softPad',
      sourceBindingRef: '',
      actionId: actionId,
      keyBindingRef: String(keyB.slotId || ''),
      actionInstanceId: String(keyB.actionInstanceId || ''),
      actionArgs: keyB.actionArgs != null ? keyB.actionArgs : null
    });
  }

  function selectedSlotId() {
    if (!selection) return '';
    return selection.keyBindingRef || '';
  }

  function syncSelectionToMapping(mid) {
    mid = String(mid || selectedMappingId() || '').trim();
    if (!selection) {
      // Restart / cleared UI — restore last saved recognition capability.
      loadHeroCaptureFromMapping(mappingById(mid));
      return;
    }
    if (selection.mappingId === mid) return;
    var ctx = resolveSoftPadScope();
    if (ctx && ctx.targetMappingId && selection.mappingId === ctx.targetMappingId) {
      return;
    }
    loadHeroCaptureFromMapping(mappingById(mid));
  }

  function defaultCaptureHeroRef() {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.defaultCaptureHeroRef) return coreApi.defaultCaptureHeroRef();
    return { channel: 'key', bindingRef: 'ime', actionId: '', actionInstanceId: '', kind: 'ime' };
  }

  function normalizeCaptureHeroRef(ref) {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.normalizeCaptureHeroRef) return coreApi.normalizeCaptureHeroRef(ref);
    return defaultCaptureHeroRef();
  }

  function captureHeroRefForMapping(m) {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.captureHeroRefForMapping) return coreApi.captureHeroRefForMapping(m);
    return defaultCaptureHeroRef();
  }

  function isDefaultCaptureHeroRef(ref) {
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.isDefaultCaptureHeroRef) return coreApi.isDefaultCaptureHeroRef(ref);
    ref = normalizeCaptureHeroRef(ref);
    return ref.kind === 'ime' && !ref.actionId;
  }

  function isCommandChannel(ch) {
    return ch === 'voice' || ch === 'cursor' || ch === 'softPad' || ch === 'camera';
  }

  function isChannelOpen(ch) {
    return !!openPanels[ch];
  }

  function hasAnyOpenPanel() {
    var i;
    for (i = 0; i < TABS.length; i++) {
      if (openPanels[TABS[i]]) return true;
    }
    return false;
  }

  function firstOpenChannel() {
    var i;
    for (i = 0; i < TABS.length; i++) {
      if (openPanels[TABS[i]]) return TABS[i];
    }
    return 'ime';
  }

  function syncOpenChrome() {
    var i;
    for (i = 0; i < TABS.length; i++) {
      openPanels[TABS[i]] = TABS[i] === activeTab;
    }
    if (imeTabHidden) openPanels.ime = false;
    var tabs = document.getElementById('keysChannelSubtabs');
    if (tabs) {
      tabs.querySelectorAll('[data-channel]').forEach(function (btn) {
        var on = btn.getAttribute('data-channel') === activeTab;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }
    var imeTab = document.getElementById('keysChannelTabIme');
    if (imeTab) imeTab.classList.toggle('is-codex-hidden', imeTabHidden);
    var imeStrip = document.getElementById('keysImeStripWrap');
    if (imeStrip) imeStrip.hidden = activeTab !== 'ime' || imeTabHidden;
    var onIme = activeTab === 'ime';
    var onKey = activeTab === 'key';
    var onImeOrKey = onIme || onKey;
    if (global.OneToneKeysPanelUi) {
      try {
        if (global.OneToneKeysPanelUi.syncImeStepCopy) global.OneToneKeysPanelUi.syncImeStepCopy();
      } catch (_) {}
    }
    var keyPanel = document.getElementById('keysCaptureKeyPanel');
    if (keyPanel) {
      keyPanel.hidden = !onImeOrKey;
      keyPanel.classList.toggle('is-custom-key-seq', onKey);
    }
    // 自定义键：隐藏键帽（用序列主卡）；仅输入法显示大识别键帽。
    // voice/cursor/camera/softPad 只靠顶部 02 短文案实时预览，降低压力。
    var showHero = onIme;
    var heroCard = document.getElementById('keysCaptureHeroCard');
    if (heroCard) heroCard.hidden = !showHero;
    var zone = document.getElementById('keysCaptureKeycapZone');
    if (zone) zone.hidden = !showHero;
    // 序列主卡：自定义键显示；输入法隐藏（避免和听写混）
    var actionsHost = document.getElementById('keysCaptureTargetActionsHost');
    if (actionsHost) {
      actionsHost.hidden = !onKey;
      actionsHost.classList.toggle('is-primary', onKey);
    }
    // 说完后整步：仅输入法；自定义键整块藏起
    var finishStep = document.getElementById('keysImeFinishStep');
    if (finishStep) finishStep.hidden = !onIme;
    var finishLbl = document.getElementById('keysCaptureKeyFinishLbl');
    if (finishLbl) finishLbl.hidden = !onIme;
    var finishMode = document.getElementById('keysFinishModeHost');
    if (finishMode) finishMode.hidden = !onIme;
    var finishHint = document.getElementById('keysFinishModeHint');
    if (finishHint && onKey) finishHint.hidden = true;
    var finishMore = document.getElementById('habitFlowFinishMore');
    // 自定义键强制藏收尾；输入法由 KeyFinishFlowRender 决定 moreHidden
    if (finishMore && onKey) finishMore.hidden = true;
    var panel = document.getElementById('keysChannelPanel');
    if (panel) panel.hidden = false;
  }

  function customKeyMatchTrigger(match) {
    return match ? String(match.triggerKey || '').trim() : '';
  }

  function refreshKeysCustomKeyMatchLaunch(match) {
    var detail = document.querySelector('.keys-custom-key-detail');
    if (!detail) return;
    var host = document.getElementById('keysCustomKeyMatchLaunch');
    var actions = document.getElementById('keysCaptureTargetActions');
    if (!host) {
      host = document.createElement('div');
      host.id = 'keysCustomKeyMatchLaunch';
      host.className = 'keys-custom-key-launch';
      if (actions && actions.parentNode === detail) detail.insertBefore(host, actions);
      else detail.appendChild(host);
    } else if (actions && host.nextSibling !== actions && actions.parentNode === detail) {
      detail.insertBefore(host, actions);
    }
    if (!match || !match.id) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    var trig = customKeyMatchTrigger(match);
    var empty = !trig;
    host.innerHTML =
      '<span class="keys-custom-key-launch-lab">' +
      esc(t('keysCustomKeyMatchLaunch', '启动键')) +
      '</span>' +
      '<button type="button" class="keys-custom-key-launch-val' +
      (empty ? ' is-empty' : '') +
      '" data-match-launch-record="1" title="' +
      esc(t('keysCustomKeyMatchLaunchRecord', '点击录制触发键')) +
      '">' +
      esc(
        empty
          ? t('keysCustomKeyMatchLaunchNeed', '点击录制触发键')
          : friendlyTriggerLabel(trig)
      ) +
      '</button>' +
      '<span class="keys-custom-key-launch-note">' +
      esc(t('keysCustomKeyMatchLaunchUnique', '不可与本场景其他动作相同')) +
      '</span>';
    if (!host.__wiredLaunchRecord) {
      host.__wiredLaunchRecord = true;
      host.addEventListener('click', function (ev) {
        var btn =
          ev.target && ev.target.closest ? ev.target.closest('[data-match-launch-record]') : null;
        if (!btn || !host.contains(btn)) return;
        ev.preventDefault();
        recordCustomKeyMatchLaunch();
      });
    }
  }

  function recordCustomKeyMatchLaunch() {
    var mid = String(customKeyMatchEditId || '').trim();
    if (!mid) {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return;
    }
    var Rec = global.OneToneMappingRecording;
    if (Rec && typeof Rec.startTrigger === 'function') {
      try {
        Rec.startTrigger(mid);
      } catch (_) {}
    }
  }

  function refreshKeysTargetActionsEditor() {
    var container = document.getElementById('keysCaptureTargetActions');
    if (!container || !global.OneToneHomeTargetActions || !global.OneToneHomeTargetActions.render) {
      refreshKeysCustomKeyMatchList();
      return;
    }
    // Edit the selected match row; when that match is applied as habit 02, edit the habit
    // (runtime fires habit.targetActions).
    var rows = activeTab === 'key' ? listCustomKeyMappingsForCurrentApp() : [];
    var editId = String(customKeyMatchEditId || '').trim();
    if (activeTab === 'key' && rows.length && (!editId || !mappingById(editId))) {
      customKeyMatchEditId = String(rows[0].id || '');
      editId = customKeyMatchEditId;
    }
    if (activeTab === 'key' && !rows.length) {
      customKeyMatchEditId = '';
      editId = '';
    }
    var habit = mappingById(selectedMappingId());
    var href = habit ? captureHeroRefForMapping(habit) : null;
    var appliedAsRec =
      !!(
        habit &&
        editId &&
        href &&
        href.kind === 'customKey' &&
        String(href.bindingRef) === editId &&
        String(habit.id) !== editId
      );
    // Library mode: never fall back to habit — that paints IME 右 Alt beside an empty match list.
    var m = appliedAsRec ? habit : editId ? mappingById(editId) : null;
    if (!m && activeTab !== 'key') {
      m = habit;
      if (!m && global.OneToneMappingCore && global.OneToneMappingCore.selected) {
        try {
          m = global.OneToneMappingCore.selected();
        } catch (_) {
          m = null;
        }
      }
    }
    var split = document.querySelector('#keysCaptureTargetActionsHost .keys-custom-key-split');
    var detail = document.querySelector('.keys-custom-key-detail');
    if (split) split.classList.toggle('is-empty', activeTab === 'key' && !rows.length);
    if (detail) {
      if (activeTab === 'key') detail.hidden = !rows.length || !m;
      else detail.hidden = false;
    }
    var title = document.getElementById('keysCaptureTargetActionsLbl');
    if (title) {
      title.textContent = t('keysCaptureSeqTitle', '动作序列');
    }
    var editMatch = editId ? mappingById(editId) : null;
    var actsLen =
      m && Array.isArray(m.targetActions) ? m.targetActions.length : 0;
    var hint = document.getElementById('keysCaptureTargetActionsHint');
    if (hint) {
      if (actsLen === 0) {
        hint.textContent = t(
          'keysCaptureSeqHintEmpty',
          '用下方按钮加步骤；上方可录制本条专属触发键。'
        );
      } else if (appliedAsRec) {
        hint.textContent = t(
          'keysCaptureSeqHintAsRecognition',
          '已用作听写识别。触发后按顺序执行。'
        );
      } else {
        hint.textContent = t(
          'keysCaptureSeqHint',
          '按本条触发键后依次执行。▲▼ 排序，点步骤可改。'
        );
      }
    }
    // Always show the library row's launch key — even when applied as habit 02.
    refreshKeysCustomKeyMatchLaunch(editMatch);
    if (activeTab === 'key' && (!rows.length || !m)) {
      container.innerHTML = '';
      refreshKeysCustomKeyMatchList();
      return;
    }
    if (m) {
      global.OneToneHomeTargetActions.render(container, m, {
        mode: 'picker',
        variant: 'keys'
      });
    } else {
      container.hidden = false;
      container.className = 'home-key-map-actions is-keys-variant';
      container.innerHTML =
        '<div class="home-key-map-action-empty is-keys">' +
        '<b>' +
        esc(t('keysCaptureSeqEmptyTitle', '还没有动作')) +
        '</b>' +
        '<span>' +
        esc(
          t(
            'keysCaptureSeqEmptyBody',
            '添加录制快捷键、文本或延迟；按本条触发键会依次执行。'
          )
        ) +
        '</span></div>';
    }
    refreshKeysCustomKeyMatchList();
  }

  function friendlyTriggerLabel(key) {
    var raw = String(key || '').trim();
    if (!raw) return t('keysCustomKeyMatchNoTrigger', '尚未录制触发键');
    try {
      if (global.OneToneKeyLabels && global.OneToneKeyLabels.friendlyKeyName) {
        return global.OneToneKeyLabels.friendlyKeyName(raw) || raw;
      }
    } catch (_) {}
    return raw;
  }

  function looksLikeAutoChordLabel(lab) {
    var s = String(lab || '').trim();
    if (!s) return true;
    if (/→|->/.test(s)) return true;
    if (/^AutoTrigger\b/i.test(s)) return true;
    return false;
  }

  function customKeyMatchDisplayName(m) {
    var lab = String((m && m.label) || '').trim();
    if (lab && !looksLikeAutoChordLabel(lab)) return lab;
    return t('keysCustomKeyMatchDefaultName', '自定义键');
  }

  function promptCustomKeyMatchName(current) {
    var fallback = t('keysCustomKeyMatchDefaultName', '自定义键');
    var seed = String(current || '').trim();
    if (!seed || looksLikeAutoChordLabel(seed)) seed = fallback;
    // Prefer in-app name sheet; never rely on native prompt (tauri.localhost chrome).
    var sheet = global.OneToneKeysActionInputSheet;
    if (sheet && typeof sheet.openText === 'function') {
      // Sync callers still exist — return seed; async rename goes through openNameSheet.
      return seed;
    }
    return seed;
  }

  function nextCustomKeyMatchLabel() {
    var n = listCustomKeyMappingsForCurrentApp().length + 1;
    return t('keysCustomKeyMatchDefaultName', '自定义键') + ' ' + n;
  }

  function openCustomKeyMatchNameSheet(seed) {
    var sheet = global.OneToneKeysActionInputSheet;
    var fallback = t('keysCustomKeyMatchDefaultName', '自定义键');
    var start = String(seed || '').trim() || fallback;
    if (!sheet || typeof sheet.openText !== 'function') {
      return Promise.resolve(start);
    }
    return sheet
      .openText(start, {
        edit: true,
        title: t('keysCustomKeyMatchNamePrompt', '给这条「我录的键」起个名字'),
        sub: t('keysCustomKeyMatchNameSub', '双击列表也可随时改名。'),
        okLabel: t('keysActionSheetSave', '保存')
      })
      .then(function (v) {
        if (v == null) return null;
        var next = String(v).trim();
        return next || start;
      });
  }

  function renameCustomKeyMatch(matchId, nextName) {
    var mid = String(matchId || '').trim();
    var m = mid ? mappingById(mid) : null;
    if (!m) return false;
    if (nextName == null) {
      openCustomKeyMatchNameSheet(customKeyMatchDisplayName(m)).then(function (named) {
        if (named == null) return;
        renameCustomKeyMatch(mid, named);
      });
      return true;
    }
    var next = String(nextName || '').trim();
    if (!next) next = t('keysCustomKeyMatchDefaultName', '自定义键');
    m.label = next;
    var persist = global.OneToneConfigPersist;
    if (persist && typeof persist.save === 'function') {
      try {
        persist.save({ source: 'mapping' });
      } catch (_) {}
    }
    refreshKeysCustomKeyMatchList();
    applyHero();
    syncRecognitionEditorPreview();
    try {
      var scene = global.OneToneKeysSceneActionsPanel;
      if (scene && typeof scene.refresh === 'function') scene.refresh();
    } catch (_) {}
    return true;
  }

  function beginInlineRenameCustomKeyMatch(rowEl, matchId) {
    var mid = String(matchId || '').trim();
    var m = mid ? mappingById(mid) : null;
    if (!m || !rowEl) return;
    var trig = rowEl.querySelector('.keys-custom-key-match-trig');
    if (!trig || trig.querySelector('input')) return;
    var input = document.createElement('input');
    input.type = 'text';
    input.className = 'keys-custom-key-match-rename';
    input.value = customKeyMatchDisplayName(m);
    input.setAttribute(
      'aria-label',
      t('keysCustomKeyMatchNamePrompt', '给这条「我录的键」起个名字')
    );
    input.maxLength = 48;
    trig.textContent = '';
    trig.appendChild(input);
    var done = false;
    var commit = function (save) {
      if (done) return;
      done = true;
      if (save) renameCustomKeyMatch(mid, input.value);
      else refreshKeysCustomKeyMatchList();
    };
    input.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
    });
    input.addEventListener('mousedown', function (ev) {
      ev.stopPropagation();
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        ev.stopPropagation();
        commit(true);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        commit(false);
      }
    });
    input.addEventListener('blur', function () {
      commit(true);
    });
    setTimeout(function () {
      try {
        input.focus();
        input.select();
      } catch (_) {}
    }, 0);
  }

  function deleteCustomKeyMatch(matchId) {
    var mid = String(matchId || '').trim();
    if (!mid) return false;
    var habit = mappingById(selectedMappingId());
    // Never delete the habit row itself from this list affordance.
    if (habit && String(habit.id) === mid) {
      toast(t('keysCustomKeyMatchDeleteHabitBlocked', '请在习惯列表中删除该习惯'));
      return false;
    }
    if (
      habit &&
      habit.captureHeroRef &&
      String(habit.captureHeroRef.kind || '')
        .trim()
        .toLowerCase() === 'customkey' &&
      String(habit.captureHeroRef.bindingRef || '') === mid
    ) {
      habit.captureHeroRef = null;
      habit.targetActions = [];
      habit.targetKey = habit.targetKey || '';
    }
    if (String(customKeyMatchEditId || '') === mid) customKeyMatchEditId = '';
    var shared = global.OneToneHabitShared;
    if (shared && typeof shared.deleteMapping === 'function') {
      shared.deleteMapping(mid);
    } else {
      var cfg = config();
      var maps = Array.isArray(cfg.mappings) ? cfg.mappings : [];
      cfg.mappings = maps.filter(function (x) {
        return x && String(x.id) !== mid;
      });
      var persist = global.OneToneConfigPersist;
      if (persist && typeof persist.save === 'function') {
        try {
          persist.save({ source: 'mapping' });
        } catch (_) {}
      }
    }
    refreshKeysCustomKeyMatchList();
    refreshKeysTargetActionsEditor();
    applyHero();
    syncRecognitionEditorPreview();
    try {
      var scene = global.OneToneKeysSceneActionsPanel;
      if (scene && typeof scene.refresh === 'function') scene.refresh();
    } catch (_) {}
    return true;
  }

  function effectiveTargetActions(m) {
    var acts = null;
    if (global.OneToneHomeTargetActions && typeof global.OneToneHomeTargetActions.effective === 'function') {
      try {
        acts = global.OneToneHomeTargetActions.effective(m);
      } catch (_) {
        acts = null;
      }
    }
    if (!Array.isArray(acts) || !acts.length) {
      if (Array.isArray(m && m.targetActions) && m.targetActions.length) return m.targetActions;
      return [];
    }
    return acts;
  }

  /** List row: trigger status + step count only (never dump URL/text payloads). */
  function customKeyMatchListSecondary(m) {
    var n = effectiveTargetActions(m).length;
    var steps = n
      ? String(n) + t('keysCustomKeyMatchSteps', ' 步')
      : t('keysCustomKeyMatchNoActions', '尚无动作');
    var trig = customKeyMatchTrigger(m);
    if (trig) return friendlyTriggerLabel(trig) + ' · ' + steps;
    return t('keysCustomKeyMatchEmptyTrigger', '待录触发键') + ' · ' + steps;
  }

  function targetActionsSummary(m) {
    var acts = effectiveTargetActions(m);
    if (!acts.length) return t('keysCustomKeyMatchNoActions', '尚无动作');
    var parts = [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a) continue;
      if (a.type === 'key') {
        parts.push(t('homeKeyMapActionTypeKey', '按键') + ' ' + friendlyTriggerLabel(a.value || ''));
      } else if (a.type === 'text') {
        parts.push(t('homeKeyMapActionTypeText', '输入文本') + ' ' + String(a.value || ''));
      } else if (a.type === 'delay') {
        parts.push(t('homeKeyMapActionTypeDelay', '等待') + ' ' + String(a.ms || 0) + 'ms');
      } else if (a.type === 'open') {
        var ok =
          a.kind === 'folder'
            ? t('keysCaptureSeqAddOpenFolder', '文件夹')
            : a.kind === 'url'
              ? t('keysCaptureSeqAddOpenUrl', '网址')
              : t('keysCaptureSeqAddOpenFile', '文件');
        parts.push(ok + ' ' + String(a.value || ''));
      }
    }
    return parts.length ? parts.join(' · ') : t('keysCustomKeyMatchNoActions', '尚无动作');
  }

  function captureHeroKind(m) {
    var ref = m && m.captureHeroRef;
    return ref && typeof ref === 'object'
      ? String(ref.kind || '')
          .trim()
          .toLowerCase()
      : '';
  }

  /** 语音「一词注入」peer — Text+Enter，触发词仍用习惯 01。 */
  function isPromptInjectMapping(m) {
    if (!m || !m.id || captureHeroKind(m) !== 'prompt') return false;
    var bref = String((m.captureHeroRef && m.captureHeroRef.bindingRef) || '').trim();
    // Real peers own themselves (bindingRef === id). Habits must not inherit a deleted peer's kind.
    return bref === String(m.id);
  }

  /** Clear habit.captureHeroRef / inject payload left behind when a prompt peer was deleted. */
  function scrubStalePromptHero(m) {
    if (!m || !m.id || captureHeroKind(m) !== 'prompt') return false;
    var bref = String((m.captureHeroRef && m.captureHeroRef.bindingRef) || '').trim();
    if (bref === String(m.id)) return false;
    m.captureHeroRef = null;
    var acts = Array.isArray(m.targetActions) ? m.targetActions : [];
    if (acts.length === 2) {
      var a0 = acts[0];
      var a1 = acts[1];
      var t0 = a0
        ? String(a0.type || a0.kind || '')
            .trim()
            .toLowerCase()
        : '';
      var t1 = a1
        ? String(a1.type || a1.kind || '')
            .trim()
            .toLowerCase()
        : '';
      if (t0 === 'text' && t1 === 'key' && /^enter$/i.test(String((a1 && a1.value) || '').trim())) {
        m.targetActions = [];
      }
    }
    return true;
  }

  function promptTextFromMapping(m) {
    var acts = Array.isArray(m && m.targetActions) ? m.targetActions : [];
    for (var i = 0; i < acts.length; i++) {
      var a = acts[i];
      if (!a) continue;
      var ty = String(a.type || a.kind || '')
        .trim()
        .toLowerCase();
      if (ty === 'text' || ty === 'type' || ty === 'string') {
        return String(a.value != null ? a.value : a.text || '');
      }
    }
    return '';
  }

  function promptInjectActions(text) {
    return [
      { type: 'text', value: String(text || '') },
      { type: 'key', value: 'Enter' }
    ];
  }

  /**
   * MVP: stamp the current primary wake phrase onto the prompt peer so Rust can
   * route phrase → this inject without relying on global voiceEnd.intent.
   * Only the first phrase — avoid stealing the whole dictation wake pool.
   */
  function stampPromptPeerWakePhrases(peer) {
    if (!peer) return;
    var list = [];
    try {
      var Wake = global.OneToneVoiceWake;
      if (Wake && typeof Wake.currentWakePhraseList === 'function') {
        list = (Wake.currentWakePhraseList() || [])
          .map(function (p) {
            return String(p || '').trim();
          })
          .filter(Boolean);
      }
    } catch (_) {}
    if (!list.length) {
      try {
        var sm =
          mappingById(selectedMappingId()) ||
          (global.OneToneMappingCore && global.OneToneMappingCore.selected
            ? global.OneToneMappingCore.selected()
            : null);
        var ov = sm && (sm.voiceOverride || sm.voice_override);
        var wp = ov && (ov.wakePhrases || ov.wake_phrases);
        if (Array.isArray(wp)) {
          list = wp
            .map(function (p) {
              return String(p || '').trim();
            })
            .filter(Boolean);
        }
      } catch (_) {}
    }
    if (!list.length) return;
    peer.voiceOverride =
      peer.voiceOverride && typeof peer.voiceOverride === 'object' ? peer.voiceOverride : {};
    peer.voiceOverride.wakePhrases = [list[0]];
  }

  function findPromptPeerByText(appId, text) {
    appId = String(appId || '').trim();
    text = String(text || '').trim();
    if (!appId || !text) return null;
    var maps = Array.isArray(config().mappings) ? config().mappings : [];
    for (var i = 0; i < maps.length; i++) {
      var m = maps[i];
      if (!m || !isPromptInjectMapping(m)) continue;
      if (String(m.appTargetId || '').trim() !== appId) continue;
      if (String(promptTextFromMapping(m) || '').trim() === text) return m;
    }
    return null;
  }

  /** Drop same-app prompt peers with identical inject text (keep earliest). */
  function pruneDuplicatePromptPeers(appId, keepId) {
    appId = String(appId || '').trim();
    keepId = String(keepId || '').trim();
    if (!appId) return 0;
    var cfg = config();
    var maps = Array.isArray(cfg.mappings) ? cfg.mappings : [];
    var seen = {};
    if (keepId) {
      var keep = mappingById(keepId);
      if (keep && isPromptInjectMapping(keep)) {
        seen[String(promptTextFromMapping(keep) || '').trim()] = keepId;
      }
    }
    var next = [];
    var dropped = 0;
    for (var i = 0; i < maps.length; i++) {
      var m = maps[i];
      if (!m) continue;
      if (!isPromptInjectMapping(m) || String(m.appTargetId || '').trim() !== appId) {
        next.push(m);
        continue;
      }
      var body = String(promptTextFromMapping(m) || '').trim();
      var mid = String(m.id || '');
      if (keepId && mid === keepId) {
        next.push(m);
        continue;
      }
      if (body && seen[body] && seen[body] !== mid) {
        dropped++;
        continue;
      }
      if (body) seen[body] = mid;
      next.push(m);
    }
    if (!dropped) return 0;
    cfg.mappings = next;
    var persist = global.OneToneConfigPersist;
    if (persist && typeof persist.save === 'function') {
      try {
        persist.save({ source: 'voice-prompt-dedupe' });
      } catch (_) {}
    }
    return dropped;
  }

  /**
   * Upsert a prompt-inject scene peer. editId updates an existing prompt row;
   * otherwise creates a new one under the current habit's app.
   */
  function savePromptInjectMapping(opts) {
    opts = opts || {};
    var text = String(opts.text != null ? opts.text : '').trim();
    if (!text) {
      toast(t('voicePromptSaveNeedText', '先填写要注入的 prompt'));
      return null;
    }
    var label = String(opts.label || '').trim();
    if (!label) {
      label = text.length > 16 ? text.slice(0, 16) + '…' : text;
    }
    var core = global.OneToneMappingCore;
    // Same text under one app = one row (forceCreate only seeds a blank custom).
    var forceCreate = !!opts.forceCreate;
    var editId = forceCreate ? '' : String(opts.editId || '').trim();
    function updatePromptPeer(existing) {
      existing.label = label;
      existing.targetActions = promptInjectActions(text);
      existing.enabled = true;
      existing.updatedAt = Date.now();
      stampPromptPeerWakePhrases(existing);
      var persistUp = global.OneToneConfigPersist;
      if (persistUp && typeof persistUp.save === 'function') {
        try {
          persistUp.save({ source: 'voice-prompt-save' });
        } catch (_) {}
      }
      pruneDuplicatePromptPeers(existing.appTargetId, existing.id);
      return existing;
    }
    if (editId) {
      var existing = mappingById(editId);
      if (existing && isPromptInjectMapping(existing)) {
        return updatePromptPeer(existing);
      }
    }
    var source = null;
    try {
      var hdr = global.OneToneVoicePageHeaderRender;
      if (hdr && typeof hdr.resolveScopeMapping === 'function') {
        source = hdr.resolveScopeMapping(null);
      }
    } catch (_) {}
    if (!source) {
      source = mappingById(selectedMappingId()) || (core && core.selected ? core.selected() : null);
    }
    // If a prompt peer is focused, clone from another same-app peer (habit) instead.
    if (source && isPromptInjectMapping(source)) {
      var appId = String(source.appTargetId || '').trim();
      var mapsSrc = Array.isArray(config().mappings) ? config().mappings : [];
      var fallback = null;
      for (var si = 0; si < mapsSrc.length; si++) {
        var sm = mapsSrc[si];
        if (!sm || String(sm.appTargetId || '').trim() !== appId) continue;
        if (isPromptInjectMapping(sm)) continue;
        fallback = sm;
        break;
      }
      if (fallback) source = fallback;
    }
    if (!source || !String(source.appTargetId || '').trim()) {
      toast(t('voicePromptNeedAppScene', '请先切换到某个应用场景（不要停在通用设置）'));
      return null;
    }
    var twin = findPromptPeerByText(source.appTargetId, text);
    if (twin) return updatePromptPeer(twin);
    if (!core || typeof core.newMappingId !== 'function') {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return null;
    }
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.ensureConfig) {
        global.OneToneConfigPersist.ensureConfig();
      }
    } catch (_) {}
    var copy = clonePeerMappingShell(source, core);
    if (!copy) return null;
    var newId = copy.id;
    copy.captureHeroRef = {
      channel: 'voice',
      bindingRef: newId,
      actionId: '',
      actionInstanceId: '',
      kind: 'prompt'
    };
    copy.label = label;
    copy.targetActions = promptInjectActions(text);
    // Keep enabled so scene dock / completeness checks treat it as a real action.
    copy.enabled = true;
    // Don't inherit habit's full wake pool — own one phrase for phrase→inject routing.
    stampPromptPeerWakePhrases(copy);
    if (core.ensureMappingExtras) {
      try {
        core.ensureMappingExtras(copy);
      } catch (_) {}
    }
    persistNewPeerMapping(copy);
    pruneDuplicatePromptPeers(copy.appTargetId, copy.id);
    return copy;
  }

  /** 我录的键 library row — not IME, and not the habit that only *applies* a match. */
  function isCustomKeyMatchMapping(m, opts) {
    if (!m || !m.id) return false;
    if (isPromptInjectMapping(m)) return false;
    var editId = opts && opts.editId != null ? String(opts.editId) : String(customKeyMatchEditId || '');
    if (editId && String(m.id) === editId) return true;
    var mid = String(m.id);
    var ref = m.captureHeroRef;
    var kindCustom =
      ref &&
      typeof ref === 'object' &&
      String(ref.kind || '')
        .trim()
        .toLowerCase() === 'customkey';
    if (kindCustom) {
      var bref = String(ref.bindingRef || '').trim();
      // Habit 02 apply points at another mapping — that shadow must not list as a match.
      if (bref && bref !== mid) return false;
      return true;
    }
    // Legacy: disabled+targetActions without kind pulled Soft Pad/voice orphans into「自定义键」.
    return false;
  }

  function listCustomKeyMappingsForCurrentApp() {
    // Always key off the habit under edit (01 trigger), never a focused match row.
    var anchor = mappingById(selectedMappingId());
    // Soft Pad / Voice: always prefer the page scope mapping (dock click may focus a match peer).
    try {
      var ui = global.OneToneState && global.OneToneState.ui;
      var panel = ui && String(ui.settingsPanel || '');
      if (panel === 'voiceWake') {
        var hdr = global.OneToneVoicePageHeaderRender;
        if (hdr && typeof hdr.resolveScopeMapping === 'function') {
          var scoped = hdr.resolveScopeMapping(null);
          if (scoped) anchor = scoped;
        }
      } else if (panel === 'softPad') {
        var Hub = global.OneToneSoftPadHub;
        if (Hub && typeof Hub.resolveSoftPadEntry === 'function') {
          var entry = Hub.resolveSoftPadEntry();
          if (entry && entry.mapping) anchor = entry.mapping;
        }
      }
    } catch (_) {}
    var appId = resolveCatalogAppTargetId(anchor);
    var editId = String(customKeyMatchEditId || '').trim();
    var mappings = Array.isArray(config().mappings) ? config().mappings : [];
    var out = [];
    for (var i = 0; i < mappings.length; i++) {
      var m = mappings[i];
      if (!m || !m.id) continue;
      if (String(m.appTargetId || '').trim() !== appId) continue;
      // 听写 / IME peers stay out — only sequence matches (+ in-progress edit).
      if (!isCustomKeyMatchMapping(m, { editId: editId })) continue;
      out.push(m);
    }
    out.sort(function (a, b) {
      var oa = Number(a.order);
      var ob = Number(b.order);
      if (!isFinite(oa)) oa = 0;
      if (!isFinite(ob)) ob = 0;
      if (oa !== ob) return oa - ob;
      return String(a.triggerKey || '').localeCompare(String(b.triggerKey || ''));
    });
    return out;
  }

  function refreshKeysCustomKeyMatchList() {
    var listEl = document.getElementById('keysCustomKeyMatchList');
    var title = document.getElementById('keysCustomKeyMatchLbl');
    var addBtn = document.getElementById('btnKeysCustomKeyMatchAdd');
    var pane = document.getElementById('keysCustomKeyMatchPane');
    var sectionTitle = t('keysCustomKeyMatchTitle', '自定义键');
    if (title) title.textContent = sectionTitle;
    if (pane) pane.setAttribute('aria-label', sectionTitle);
    if (addBtn) {
      var addLbl = t('keysCustomKeyMatchAdd', '新建自定义键');
      addBtn.setAttribute('title', addLbl);
      addBtn.setAttribute('aria-label', addLbl);
    }
    if (!listEl) return;
    if (activeTab !== 'key') {
      listEl.innerHTML = '';
      return;
    }
    var rows = listCustomKeyMappingsForCurrentApp();
    var editId = String(customKeyMatchEditId || '').trim();
    var split = document.querySelector('#keysCaptureTargetActionsHost .keys-custom-key-split');
    if (split) split.classList.toggle('is-empty', !rows.length);
    if (!rows.length) {
      listEl.innerHTML =
        '<div class="keys-custom-key-match-empty">' +
        '<span>' +
        esc(t('keysCustomKeyMatchEmpty', '还没有自定义键。点右上角 + 新建一条，再加步骤。')) +
        '</span>' +
        '<button type="button" class="keys-custom-key-match-empty-cta" data-match-empty-add="1">' +
        esc(t('keysCustomKeyMatchEmptyCta', '＋ 新建一条')) +
        '</button>' +
        '</div>';
      return;
    }
    listEl.innerHTML = rows
      .map(function (m) {
        var id = String(m.id || '');
        var active = editId && id === editId ? ' is-active' : '';
        var primary = customKeyMatchDisplayName(m);
        var secondary = customKeyMatchListSecondary(m);
        var delLbl = t('keysCustomKeyMatchDelete', '删除');
        return (
          '<div class="keys-custom-key-match-item' +
          active +
          '" role="listitem" data-match-id="' +
          esc(id) +
          '" title="' +
          esc(primary + ' · ' + secondary + ' · ' + t('keysCustomKeyMatchRenameHint', '双击改名')) +
          '">' +
          '<button type="button" class="keys-custom-key-match-main" data-match-select="' +
          esc(id) +
          '">' +
          '<span class="keys-custom-key-match-trig">' +
          esc(primary) +
          '</span>' +
          '<span class="keys-custom-key-match-sum">' +
          esc(secondary) +
          '</span>' +
          '</button>' +
          '<button type="button" class="keys-custom-key-match-del" data-match-del="' +
          esc(id) +
          '" title="' +
          esc(delLbl) +
          '" aria-label="' +
          esc(delLbl) +
          '">×</button>' +
          '</div>'
        );
      })
      .join('');
  }

  function clonePeerMappingShell(source, core) {
    var copy;
    try {
      copy = JSON.parse(JSON.stringify(source));
    } catch (_) {
      return null;
    }
    var newId = core.newMappingId();
    copy.id = newId;
    // Each scene action owns a unique trigger — never inherit the habit's.
    copy.triggerKey = '';
    copy.triggerSource = null;
    copy.sourceKey = '';
    copy.sourceTime = '';
    copy.targetKey = '';
    copy.targetActions = [];
    copy.agentBindings = [];
    copy.imePresetId = '';
    copy.voiceCommands = [];
    copy.acousticVoiceCommands = [];
    copy.enabled = false;
    copy.order = Array.isArray(config().mappings) ? config().mappings.length : 0;
    copy.updatedAt = Date.now();
    copy.lastUsedAt = 0;
    copy.useCount = 0;
    return copy;
  }

  function persistNewPeerMapping(copy) {
    var cfg = config();
    cfg.mappings = Array.isArray(cfg.mappings) ? cfg.mappings : [];
    cfg.mappings.push(copy);
    var persist = global.OneToneConfigPersist;
    if (persist && typeof persist.save === 'function') {
      try {
        persist.save({ source: 'mapping' });
      } catch (_) {}
    }
  }

  /** 侧栏/中心「新建动作」：保存当前，再开一条空 01/02（不进「我录的键」、不自动开录）。 */
  function createBlankSceneActionMapping() {
    var core = global.OneToneMappingCore;
    var source = mappingById(selectedMappingId()) || (core && core.selected ? core.selected() : null);
    if (!source || !core || typeof core.newMappingId !== 'function') {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return null;
    }
    try {
      if (core.flushAllEditor) core.flushAllEditor();
      else if (core.flushEditor) core.flushEditor(source);
    } catch (_) {}
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.ensureConfig) {
        global.OneToneConfigPersist.ensureConfig();
      }
      if (global.OneToneConfigPersist && typeof global.OneToneConfigPersist.save === 'function') {
        global.OneToneConfigPersist.save({ source: 'mapping' });
      }
    } catch (_) {}
    var copy = clonePeerMappingShell(source, core);
    if (!copy) return null;
    copy.captureHeroRef = null;
    copy.label = t('keysSceneActionsNewBlankLabel', '新动作');
    if (core.ensureMappingExtras) {
      try {
        core.ensureMappingExtras(copy);
      } catch (_) {}
    }
    persistNewPeerMapping(copy);
    if (core.focus) {
      try {
        core.focus(copy.id);
      } catch (_) {}
    } else if (global.OneToneState && global.OneToneState.state) {
      global.OneToneState.state.selectedMappingId = copy.id;
    }
    try {
      var hooks = global.__vp_mapping_core_hooks__ || {};
      if (hooks.setEditorTriggerKey) hooks.setEditorTriggerKey('');
      if (hooks.setEditorTargetKey) hooks.setEditorTargetKey('');
      if (hooks.syncEditorFromSelection) hooks.syncEditorFromSelection();
    } catch (_) {}
    try {
      var page = global.OneToneKeysPageState;
      if (page && typeof page.setStep === 'function') page.setStep('trigger', { skipSheet: true });
    } catch (_) {}
    try {
      setActiveTab('ime', { skipHeroClear: true });
    } catch (_) {}
    applyHero();
    toast(t('keysSceneActionsBlankCreated', '已保存当前动作。请为新动作录 01 触发，再选 02 识别'));
    return copy;
  }

  /** 我录的键：自定义序列匹配（与听写方式平行）。 */
  function createCustomKeyMatchMapping() {
    var core = global.OneToneMappingCore;
    var source = mappingById(selectedMappingId()) || (core && core.selected ? core.selected() : null);
    if (!source || !core || typeof core.newMappingId !== 'function') {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return null;
    }
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.ensureConfig) {
        global.OneToneConfigPersist.ensureConfig();
      }
    } catch (_) {}
    var copy = clonePeerMappingShell(source, core);
    if (!copy) return null;
    var newId = copy.id;
    copy.captureHeroRef = {
      channel: 'key',
      bindingRef: newId,
      actionId: '',
      actionInstanceId: '',
      kind: 'customKey'
    };
    var named = nextCustomKeyMatchLabel();
    copy.label = named;
    if (core.ensureMappingExtras) {
      try {
        core.ensureMappingExtras(copy);
      } catch (_) {}
    }
    persistNewPeerMapping(copy);
    // Edit in library only — do not replace IME / blank「说完后」until steps exist.
    customKeyMatchEditId = newId;
    setActiveTab('key', { skipHeroClear: true });
    refreshKeysTargetActionsEditor();
    applyHero();
    refreshKeysCustomKeyMatchList();
    toast(t('keysCustomKeyMatchCreated', '已新建。请录制触发键（不可与本场景其他动作相同），再加步骤。'));
    return copy;
  }

  /** 侧栏新建动作：听写方式 peer（IME），不进「我录的键」。 */
  function createVoiceInputMapping() {
    var core = global.OneToneMappingCore;
    var source = mappingById(selectedMappingId()) || (core && core.selected ? core.selected() : null);
    if (!source || !core || typeof core.newMappingId !== 'function') {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return null;
    }
    try {
      if (global.OneToneConfigPersist && global.OneToneConfigPersist.ensureConfig) {
        global.OneToneConfigPersist.ensureConfig();
      }
    } catch (_) {}
    var copy = clonePeerMappingShell(source, core);
    if (!copy) return null;
    var newId = copy.id;
    copy.captureHeroRef = null;
    copy.label = t('keysSceneActionsNewVoiceLabel', '语音输入');
    if (core.ensureMappingExtras) {
      try {
        core.ensureMappingExtras(copy);
      } catch (_) {}
    }
    // In-memory only until trigger/recognition is set — empty stubs must not
    // stick in 本场景动作 / config after the user walks away.
    var cfg = config();
    var appId = String(copy.appTargetId || '').trim();
    cfg.mappings = Array.isArray(cfg.mappings) ? cfg.mappings : [];
    cfg.mappings = cfg.mappings.filter(function (m) {
      if (!m || !m.id) return false;
      if (String(m.id) === newId) return false;
      if (String(m.appTargetId || '').trim() !== appId) return true;
      if (String(m.triggerKey || '').trim()) return true;
      if (String(m.imePresetId || '').trim()) return true;
      if (String(m.targetKey || '').trim()) return true;
      if (Array.isArray(m.targetActions) && m.targetActions.length) return true;
      // Keep peers that already have voice/key bindings (wake phrases, Soft Pad, etc.).
      if (Array.isArray(m.agentBindings) && m.agentBindings.length) return true;
      var ref = m.captureHeroRef;
      if (ref && typeof ref === 'object') {
        var kind = String(ref.kind || '')
          .trim()
          .toLowerCase();
        if (kind === 'customkey' || kind === 'ime') return true;
        if (String(ref.channel || '').trim() || String(ref.actionId || '').trim()) return true;
      }
      // Drop prior empty voice drafts for this app.
      return false;
    });
    cfg.mappings.push(copy);
    customKeyMatchEditId = '';
    if (typeof core.focus === 'function') {
      try {
        core.focus(newId);
      } catch (_) {}
    } else if (global.OneToneState && global.OneToneState.state) {
      global.OneToneState.state.selectedMappingId = newId;
    }
    toast(
      t(
        'keysVoiceInputMappingCreated',
        '已新建语音输入。请录制 01 触发，再在 02 选择识别键或输入法'
      )
    );
    return copy;
  }

  function wireKeysCustomKeyMatchList() {
    var listEl = document.getElementById('keysCustomKeyMatchList');
    var addBtn = document.getElementById('btnKeysCustomKeyMatchAdd');
    if (listEl && !listEl.__wiredMatchList) {
      listEl.__wiredMatchList = true;
      // Defer select so dblclick can rename without the first click wiping the row DOM.
      var selectTimer = null;
      listEl.addEventListener('click', function (ev) {
        var emptyAdd =
          ev.target && ev.target.closest ? ev.target.closest('[data-match-empty-add]') : null;
        if (emptyAdd && listEl.contains(emptyAdd)) {
          ev.preventDefault();
          createCustomKeyMatchMapping();
          return;
        }
        var delBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-match-del]') : null;
        if (delBtn && listEl.contains(delBtn)) {
          ev.preventDefault();
          ev.stopPropagation();
          if (selectTimer) {
            clearTimeout(selectTimer);
            selectTimer = null;
          }
          deleteCustomKeyMatch(delBtn.getAttribute('data-match-del'));
          return;
        }
        if (ev.target && ev.target.closest && ev.target.closest('.keys-custom-key-match-rename')) {
          return;
        }
        var btn =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-match-select],[data-match-id]')
            : null;
        if (!btn || !listEl.contains(btn)) return;
        var id = String(
          btn.getAttribute('data-match-select') || btn.getAttribute('data-match-id') || ''
        ).trim();
        if (!id) return;
        ev.preventDefault();
        if (selectTimer) clearTimeout(selectTimer);
        selectTimer = setTimeout(function () {
          selectTimer = null;
          applyCustomKeyMatchAsRecognition(id);
        }, 280);
      });
      listEl.addEventListener('dblclick', function (ev) {
        if (ev.target && ev.target.closest && ev.target.closest('[data-match-del]')) return;
        var row =
          ev.target && ev.target.closest ? ev.target.closest('[data-match-id]') : null;
        if (!row || !listEl.contains(row)) return;
        var id = String(row.getAttribute('data-match-id') || '').trim();
        if (!id) return;
        ev.preventDefault();
        if (selectTimer) {
          clearTimeout(selectTimer);
          selectTimer = null;
        }
        beginInlineRenameCustomKeyMatch(row, id);
      });
    }
    if (addBtn && !addBtn.__wiredMatchAdd) {
      addBtn.__wiredMatchAdd = true;
      addBtn.addEventListener('click', function (ev) {
        ev.preventDefault();
        createCustomKeyMatchMapping();
      });
    }
  }

  function channelTabLabel(ch) {
    var map = {
      key: 'keysChannelTabKey',
      voice: 'keysChannelTabVoice',
      cursor: 'keysChannelTabCursor',
      softPad: 'keysChannelTabSoftPad',
      camera: 'keysChannelTabCamera',
      ime: 'keysChannelTabIme'
    };
    var fb = {
      key: '我录的键',
      voice: '口头指令',
      cursor: '软件自带',
      softPad: '屏幕按钮',
      camera: '手势',
      ime: '听写方式'
    };
    return t(map[ch] || ch, fb[ch] || ch);
  }

  function selectionToHeroRef(sel) {
    if (!sel) return defaultCaptureHeroRef();
    var kind = 'action';
    var ch = String(sel.sourceChannel || '');
    var ref = String(sel.sourceBindingRef || '');
    if (ch === 'camera') kind = 'gesture';
    else if (ch === 'ime') kind = 'imePreset';
    else if (ch === 'key' && !sel.actionId) {
      // Mapping-id binding → custom key match; bare ime → default dictation hero.
      kind = ref && ref !== 'ime' ? 'customKey' : 'ime';
    }
    return {
      channel: ch || 'voice',
      bindingRef: ref,
      actionId: String(sel.actionId || ''),
      actionInstanceId: String(sel.actionInstanceId || ''),
      kind: kind
    };
  }

  function heroRefMatches(ref, opts) {
    ref = normalizeCaptureHeroRef(ref);
    opts = opts || {};
    if (opts.kind === 'ime' || (opts.channel === 'key' && !opts.actionId && opts.kind !== 'customKey')) {
      return isDefaultCaptureHeroRef(ref);
    }
    return (
      ref.channel === opts.channel &&
      ref.bindingRef === opts.bindingRef &&
      ref.actionId === opts.actionId &&
      String(ref.actionInstanceId || '') === String(opts.actionInstanceId || '')
    );
  }

  function schedulePersistHeroSave() {
    if (persistHeroSaveTimer) {
      try {
        clearTimeout(persistHeroSaveTimer);
      } catch (_) {}
    }
    persistHeroSaveTimer = setTimeout(function () {
      persistHeroSaveTimer = null;
      try {
        if (global.OneToneConfigPersist && global.OneToneConfigPersist.save) {
          global.OneToneConfigPersist.save({ source: 'captureHero' });
        }
      } catch (_) {}
    }, 250);
  }

  function persistHeroCapture(ref, mid) {
    mid = String(mid || selectedMappingId() || '').trim();
    var m = mappingById(mid);
    if (!m) return;
    var norm = normalizeCaptureHeroRef(ref);
    var coreApi = global.OneToneMappingCore;
    if (coreApi && coreApi.setCaptureHeroRef) coreApi.setCaptureHeroRef(m, norm);
    else if (isDefaultCaptureHeroRef(norm)) m.captureHeroRef = null;
    else m.captureHeroRef = norm;
    schedulePersistHeroSave();
    try {
      var hub = global.OneToneHabitHub;
      if (hub && hub.scheduleHubPaint) hub.scheduleHubPaint();
    } catch (_) {}
    // Dock row = last captureHeroRef — refresh as soon as 02 pick lands.
    try {
      var scene = global.OneToneKeysSceneActionsPanel;
      if (scene && typeof scene.refresh === 'function') scene.refresh();
    } catch (_) {}
  }

  function syncRecognitionEditorPreview() {
    try {
      if (global.__otMappingEditorDisplayMounted && typeof global.__otMappingEditorDisplaySync === 'function') {
        global.__otMappingEditorDisplaySync();
      }
    } catch (_) {}
    // Top 01/02 flow-node hints — same source as keycap (resolveHeroCapture).
    try {
      if (global.OneToneKeysPageNav && global.OneToneKeysPageNav.renderStepHints) {
        global.OneToneKeysPageNav.renderStepHints();
      }
    } catch (_) {}
    // Avoid MappingList.renderEditor → picker.refresh recursion; targetView already updated in applyHero.
  }

  /**
   * Apply a 我录的键 sequence as this habit's 02 recognition — replaces IME shortcut.
   * Keeps habit focused (01 unchanged); copies targetActions onto the habit for runtime.
   */
  function applyCustomKeyMatchAsRecognition(matchId) {
    var matchIdNorm = String(matchId || '').trim();
    var match = matchIdNorm ? mappingById(matchIdNorm) : null;
    var habit = mappingById(selectedMappingId());
    if (!match || !habit) return false;
    // Selecting the match row itself for editing its own peer — not a replace.
    if (String(habit.id) === matchIdNorm) {
      customKeyMatchEditId = matchIdNorm;
      setSelection(
        {
          mappingId: habit.id,
          sourceChannel: 'key',
          sourceBindingRef: matchIdNorm,
          actionId: '',
          keyBindingRef: '',
          actionInstanceId: '',
          actionArgs: null
        },
        { skipRender: true }
      );
      refreshKeysTargetActionsEditor();
      applyHero();
      refreshKeysCustomKeyMatchList();
      return true;
    }
    var acts = [];
    try {
      acts = Array.isArray(match.targetActions)
        ? JSON.parse(JSON.stringify(match.targetActions))
        : [];
    } catch (_) {
      acts = Array.isArray(match.targetActions) ? match.targetActions.slice() : [];
    }
    // Empty sequence: library edit only — keep habit IME /「说完后」intact.
    if (!acts.length) {
      customKeyMatchEditId = matchIdNorm;
      refreshKeysTargetActionsEditor();
      applyHero();
      syncRecognitionEditorPreview();
      refreshKeysCustomKeyMatchList();
      try {
        var sceneEmpty = global.OneToneKeysSceneActionsPanel;
        if (sceneEmpty && typeof sceneEmpty.refresh === 'function') sceneEmpty.refresh();
      } catch (_) {}
      return true;
    }
    habit.targetActions = acts;
    habit.targetKey = '';
    habit.imePresetId = '';
    try {
      if (global.OneToneImePresets && global.OneToneImePresets.clearSelectedForManualRecord) {
        global.OneToneImePresets.clearSelectedForManualRecord('mapping');
      }
    } catch (_) {}
    customKeyMatchEditId = matchIdNorm;
    setSelection(
      {
        mappingId: String(habit.id),
        sourceChannel: 'key',
        sourceBindingRef: matchIdNorm,
        actionId: '',
        keyBindingRef: '',
        actionInstanceId: '',
        actionArgs: null
      },
      { skipRender: true }
    );
    var persist = global.OneToneConfigPersist;
    if (persist && typeof persist.save === 'function') {
      try {
        persist.save({ source: 'mapping' });
      } catch (_) {}
    }
    refreshKeysTargetActionsEditor();
    applyHero();
    syncRecognitionEditorPreview();
    refreshKeysCustomKeyMatchList();
    try {
      var scene = global.OneToneKeysSceneActionsPanel;
      if (scene && typeof scene.refresh === 'function') scene.refresh();
    } catch (_) {}
    toast(
      t(
        'keysCustomKeyMatchAppliedAsRecognition',
        '已用「我录的键」替换听写快捷键 · 触发后执行该系列动作'
      )
    );
    return true;
  }

  /**
   * Custom-key match row → 02 recognition preview + sequence editor.
   * Leaves selectedMappingId alone so 01 trigger stays on the habit.
   */
  function previewCustomKeyMatch(mappingId) {
    return applyCustomKeyMatchAsRecognition(mappingId);
  }

  function resolveCustomKeyHeroCap(m, friendly, nameSource) {
    // 02 keycap: named title first; trigger · N steps as secondary (no URL dump).
    friendly =
      friendly ||
      (global.__vp_mapping_core_hooks__ || {}).friendlyKeyName ||
      function (k) {
        return k;
      };
    var nameM = nameSource || m;
    var name = customKeyMatchDisplayName(nameM);
    var tgt = String((m && m.targetKey) || '').trim();
    var secondary = customKeyMatchListSecondary(m);
    var n = effectiveTargetActions(m).length;
    return {
      kind: 'customKey',
      active: true,
      primaryLabel: name,
      secondaryLabel: secondary,
      badge: t('keysChannelTabKey', '我录的键'),
      chord: tgt,
      empty: !tgt && !n,
      channel: 'key',
      channelLabel: t('keysChannelTabKey', '我录的键'),
      targetLabel: name,
      targetEmpty: !tgt && !n,
      actionId: '',
      sourceChannel: 'key',
      iconHtml: ''
    };
  }

  function captureRefToSelection(ref, mid) {
    ref = normalizeCaptureHeroRef(ref);
    mid = String(mid || selectedMappingId() || '').trim();
    if (!mid || isDefaultCaptureHeroRef(ref)) return null;
    return {
      mappingId: mid,
      sourceChannel: ref.channel,
      sourceBindingRef: ref.bindingRef,
      actionId: ref.actionId,
      actionInstanceId: ref.actionInstanceId || '',
      keyBindingRef: '',
      actionArgs: null,
      iconHtml: ''
    };
  }

  function heroBindMappingForRef(ref, habitM) {
    ref = normalizeCaptureHeroRef(ref);
    if (ref.channel === 'softPad') {
      var work = softPadWorkMapping();
      if (work) return work;
      if (selection && selection.sourceChannel === 'softPad' && selection.mappingId) {
        var bySel = mappingById(selection.mappingId);
        if (bySel) return bySel;
      }
    }
    return habitM;
  }

  function loadHeroCaptureFromMapping(m) {
    m = m || mappingById(selectedMappingId());
    if (!m) {
      selection = null;
      customKeyMatchEditId = '';
      return;
    }
    selection = captureRefToSelection(captureHeroRefForMapping(m), m.id);
    if (selection) {
      if (selection.sourceChannel === 'softPad') {
        var work = softPadWorkMapping();
        if (work && work.id) selection.mappingId = String(work.id);
      }
      var bindM = heroBindMappingForRef(selectionToHeroRef(selection), m);
      var keyB = findKeyBinding(bindM, selection.actionId, selection.actionInstanceId);
      if (keyB) selection.keyBindingRef = String(keyB.slotId || '');
      // Restore match-edit cursor from persisted customKey hero.
      if (
        selection.sourceChannel === 'key' &&
        !selection.actionId &&
        selection.sourceBindingRef &&
        selection.sourceBindingRef !== 'ime'
      ) {
        customKeyMatchEditId = selection.sourceBindingRef;
      }
    }
  }

  function resolveHeroCapture(m) {
    m = m || mappingById(selectedMappingId());
    if (!m) {
      return {
        kind: 'ime',
        active: false,
        primaryLabel: '',
        secondaryLabel: '',
        badge: t('keysHeroModeIme', '输入法识别键'),
        chord: '',
        empty: true,
        channel: 'key',
        channelLabel: channelTabLabel('key'),
        targetLabel: '',
        targetEmpty: true,
        actionId: '',
        sourceChannel: 'key',
        iconHtml: ''
      };
    }
    var bootHooks = global.__vp_mapping_core_hooks__ || {};
    var friendly = bootHooks.friendlyKeyName || function (k) {
      return k;
    };
    // Persisted / live recognition capability — never force IME by activeTab
    // (that made restart always show 右 Alt and wiped Cursor/voice hero from 02 + habits).
    var ref;
    var liveForHabit = false;
    if (
      selection &&
      (selection.actionId ||
        (selection.sourceChannel === 'key' &&
          selection.sourceBindingRef &&
          selection.sourceBindingRef !== 'ime'))
    ) {
      var selMid = String(selection.mappingId || '');
      var habitId = String(m.id || '');
      if (selMid && selMid === habitId) liveForHabit = true;
      else if (selection.sourceChannel === 'softPad' && selMid) {
        var workLive = softPadWorkMapping();
        if (
          workLive &&
          String(workLive.id) === selMid &&
          String(selectedMappingId() || '') === habitId
        ) {
          liveForHabit = true;
        }
      }
    }
    if (liveForHabit) ref = selectionToHeroRef(selection);
    else ref = captureHeroRefForMapping(m);
    if (ref.kind === 'customKey') {
      var cm = mappingById(ref.bindingRef) || mappingById(customKeyMatchEditId);
      // Habit holds applied sequence (runtime); name comes from the match library row.
      if (
        m &&
        cm &&
        String(m.id) !== String(cm.id) &&
        Array.isArray(m.targetActions) &&
        m.targetActions.length
      ) {
        return resolveCustomKeyHeroCap(m, friendly, cm);
      }
      if (cm) return resolveCustomKeyHeroCap(cm, friendly, cm);
      if (m && Array.isArray(m.targetActions) && m.targetActions.length) {
        return resolveCustomKeyHeroCap(m, friendly, m);
      }
    }
    // 我录的键：未选中匹配行时识别键帽保持「未设置」，不拿列表第一条/听写键冒充。
    if (isDefaultCaptureHeroRef(ref) && activeTab === 'key') {
      return {
        kind: 'customKey',
        active: false,
        primaryLabel: t('badgeNotRecorded', '未设置'),
        secondaryLabel: '',
        badge: t('keysChannelTabKey', '我录的键'),
        chord: '',
        empty: true,
        channel: 'key',
        channelLabel: t('keysChannelTabKey', '我录的键'),
        targetLabel: t('badgeNotRecorded', '未设置'),
        targetEmpty: true,
        actionId: '',
        sourceChannel: 'key',
        iconHtml: ''
      };
    }
    if (isDefaultCaptureHeroRef(ref)) {
      var coreApi = global.OneToneMappingCore;
      var tgt =
        coreApi && coreApi.editorTarget
          ? String(coreApi.editorTarget(m) || '').trim()
          : String(m.targetKey || '').trim();
      var fl = tgt ? friendly(tgt) || tgt : t('badgeNotRecorded', '未设置');
      return {
        kind: 'ime',
        active: false,
        primaryLabel: fl,
        secondaryLabel: '',
        badge: t('keysHeroModeIme', '输入法识别键'),
        chord: tgt,
        empty: !tgt,
        channel: 'key',
        channelLabel: channelTabLabel('key'),
        targetLabel: fl,
        targetEmpty: !tgt,
        actionId: '',
        sourceChannel: 'key',
        iconHtml: ''
      };
    }
    var label = actionLabel(ref.actionId) || ref.bindingRef;
    if (ref.kind === 'imePreset') {
      var preset =
        global.OneToneImePresets && global.OneToneImePresets.presetById
          ? global.OneToneImePresets.presetById(ref.bindingRef)
          : null;
      label =
        preset && preset.nameKey
          ? t(preset.nameKey)
          : ref.bindingRef || t('keysHeroModeIme', '输入法识别键');
    }
    var ctx = resolveSoftPadScope();
    var scopeTitle =
      ref.channel === 'softPad' && ctx && ctx.title ? String(ctx.title) : '';
    var bindM = heroBindMappingForRef(ref, m);
    var keyB = findKeyBinding(bindM, ref.actionId, ref.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    // 语音输入 / pushToTalk：02 与「本场景动作」同用听写键，不展示过期 agentBinding（如 LAlt+R）。
    var aid = canonicalActionId(ref.actionId);
    var dictationHero =
      aid === 'input.start' ||
      aid === 'startDictation' ||
      String(ref.bindingRef || '').trim() === 'pushToTalk';
    if (dictationHero) {
      var liveTgt =
        (global.OneToneMappingCore && global.OneToneMappingCore.editorTarget
          ? String(global.OneToneMappingCore.editorTarget(m) || '').trim()
          : '') || String((m && m.targetKey) || '').trim();
      if (liveTgt) chord = liveTgt;
    }
    // Compact 02: chord alone, or "待设置 · 短名" — no long "chord · full label".
    var shortName = String(label || '').trim();
    if (shortName.length > 14) shortName = shortName.slice(0, 14) + '…';
    var primary = chord
      ? friendly(chord) || chord
      : t('keysHeroActionNeedsKey', '待设置') + (shortName ? ' · ' + shortName : '');
    if (scopeTitle && !chord) primary = scopeTitle + (shortName ? ' · ' + shortName : '');
    var badge = channelTabLabel(ref.channel);
    if ((chord || ref.kind === 'action') && !dictationHero) {
      badge = badge + ' · ' + t('keysHeroModeAction', '动作快捷键');
    }
    return {
      kind: ref.kind,
      active: true,
      primaryLabel: primary,
      secondaryLabel: label,
      badge: badge,
      chord: chord,
      empty: !label && !chord,
      channel: ref.channel,
      channelLabel: channelTabLabel(ref.channel),
      targetLabel: primary,
      targetEmpty: !chord && !label,
      actionId: ref.actionId,
      sourceChannel: ref.channel,
      iconHtml: '',
      scopeTitle: scopeTitle
    };
  }

  function syncCaptureHeroDisplay() {
    var m = mappingById(selectedMappingId());
    var cap = resolveHeroCapture(m);
    var popBadge = document.getElementById('keysCaptureKeycapBadge');
    var zone = document.getElementById('keysCaptureKeycapZone');
    if (popBadge) popBadge.textContent = cap.badge || t('keysHeroModeIme', '输入法识别键');
    if (zone) {
      zone.classList.toggle(
        'is-hero-mapped',
        isDefaultCaptureHeroRef(captureHeroRefForMapping(m))
      );
    }
  }

  function syncCaptureRecordChrome() {
    var table = global.OneToneHabitKeyMappingTable;
    // Live capture keycap host is IME-only; other catalogs use top-02 short hint.
    var showHeroOnTarget = keysStep() === 'target' && activeTab === 'ime';
    if (showHeroOnTarget) {
      if (table && table.mountTargetRecordToCapture) table.mountTargetRecordToCapture();
    } else if (table && table.restoreTargetRecordFromStash) {
      table.restoreTargetRecordFromStash();
    }
    if (table && table.syncCaptureRecordingChrome) {
      try {
        table.syncCaptureRecordingChrome();
      } catch (_) {}
    }
    syncCaptureHeroDisplay();
    if (global.OneToneKeysPanelUi && global.OneToneKeysPanelUi.syncRecordButtons) {
      try {
        global.OneToneKeysPanelUi.syncRecordButtons();
      } catch (_) {}
    }
    if (global.OneToneMappingEditorChrome && global.OneToneMappingEditorChrome.updatePrimaryCTA) {
      try {
        global.OneToneMappingEditorChrome.updatePrimaryCTA();
      } catch (_) {}
    }
  }

  function onStepChange(step) {
    ensureSoftPadScopeSession();
    if (String(step || '') !== 'target') {
      closeCapturePopover({ keepPanel: true, skipStep: true });
    } else {
      bindOnce();
      capturePopoverOpen = true;
      loadHeroCaptureFromMapping();
      syncCaptureRecordChrome();
      refresh();
      renderKeyFinishHosts();
    }
  }

  function isCapturePopoverOpen() {
    return keysStep() === 'target' || !!capturePopoverOpen;
  }

  function isCaptureSheetOpen() {
    return isCapturePopoverOpen();
  }

  function bindCapturePopoverEscape() {
    if (capturePopoverEscapeBound) return;
    capturePopoverEscapeBound = true;
    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape' || !capturePopoverOpen) return;
      ev.preventDefault();
      closeCapturePopover({});
    });
  }

  function renderKeyFinishHosts() {
    try {
      if (
        global.OneToneKeyFinishFlowRender &&
        global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel
      ) {
        global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel();
      }
    } catch (_) {}
  }

  function openCapturePopover(opts) {
    opts = opts || {};
    bindOnce();
    var drawer = global.OneToneSettingsDrawer;
    var ui = global.OneToneState && global.OneToneState.ui;
    var curPanel =
      ui && ui.settingsPanel
        ? String(global.OneToneSettingsDrawer && global.OneToneSettingsDrawer.normalizePanel
            ? global.OneToneSettingsDrawer.normalizePanel(ui.settingsPanel)
            : ui.settingsPanel)
        : '';
    if (opts.returnPanel) {
      captureReturnPanel = String(opts.returnPanel);
    } else if (curPanel && curPanel !== 'keys' && !captureReturnPanel) {
      captureReturnPanel = curPanel;
    }
    if (drawer && drawer.setPanel) {
      try {
        drawer.setPanel('keys', opts.drawerOpts || {});
      } catch (_) {}
    }
    if (!opts.skipStep && global.OneToneKeysPageState && global.OneToneKeysPageState.setStep) {
      try {
        global.OneToneKeysPageState.setStep('target', {
          skipSheet: true,
          skipOpenSheet: true,
          skipScroll: !!opts.skipScroll
        });
      } catch (_) {}
    }
    capturePopoverOpen = true;
    loadHeroCaptureFromMapping();
    bindCapturePopoverEscape();
    if (opts.tab && TABS.indexOf(opts.tab) >= 0) {
      setActiveTab(opts.tab, { skipRender: false });
    } else {
      renderPanelOnly();
    }
    refresh();
    if (opts.expandFinishMore) {
      var more = document.getElementById('habitFlowFinishMore');
      if (more) more.open = true;
    }
    renderKeyFinishHosts();
    syncCaptureRecordChrome();
  }

  function closeCapturePopover(opts) {
    opts = opts || {};
    var pop = document.getElementById('keysCapturePopover');
    var backdrop = document.getElementById('keysCapturePopoverBackdrop');
    if (pop) pop.hidden = true;
    if (backdrop) backdrop.hidden = true;
    capturePopoverOpen = false;
    loadHeroCaptureFromMapping();
    if (!opts.skipStep && global.OneToneKeysPageState && global.OneToneKeysPageState.setStep) {
      try {
        global.OneToneKeysPageState.setStep('target', {
          skipSheet: true,
          skipOpenSheet: true,
          skipScroll: true
        });
      } catch (_) {}
    }
    var ret = captureReturnPanel;
    captureReturnPanel = '';
    syncCaptureRecordChrome();
    if (!opts.keepPanel && ret && ret !== 'keys') {
      var drawer = global.OneToneSettingsDrawer;
      if (drawer && drawer.setPanel) {
        try {
          drawer.setPanel(ret);
        } catch (_) {}
      }
    }
    applyHero();
  }

  function openCaptureSheet(opts) {
    openCapturePopover(opts);
  }

  function closeCaptureSheet(opts) {
    closeCapturePopover(opts);
  }

  function syncCaptureEntrySummary() {}

  function syncImeTabChrome() {
    syncOpenChrome();
    if (openPanels.ime) syncImeHeroMarkers();
  }

  function heroModel() {
    var cap = resolveHeroCapture();
    return {
      active: !!cap.active,
      actionId: cap.actionId || '',
      chord: cap.chord || '',
      targetLabel: cap.targetLabel || cap.primaryLabel || '',
      targetEmpty: !!cap.targetEmpty,
      iconHtml: cap.iconHtml || '',
      sourceChannel: cap.sourceChannel || cap.channel || '',
      scopeTitle: cap.scopeTitle || '',
      badge: cap.badge || '',
      channelLabel: cap.channelLabel || ''
    };
  }

  function syncActionIconHost(iconHtml) {
    var iconHost = document.getElementById('keysTargetActionIconHost');
    if (!iconHost) return;
    var html = String(iconHtml || '').trim();
    if (html) {
      iconHost.innerHTML = html;
      iconHost.hidden = false;
      iconHost.setAttribute('aria-hidden', 'false');
    } else {
      iconHost.innerHTML = '';
      iconHost.hidden = true;
      iconHost.setAttribute('aria-hidden', 'true');
    }
  }

  function syncImeStay() {
    var el = document.getElementById('keysImeStay');
    if (!el) return;
    var hm = heroModel();
    var show = !!(selection && hm.active);
    if (!show) {
      el.hidden = true;
      el.textContent = '';
      return;
    }
    var mid = selectedMappingId();
    var m = mappingById(mid) || activeMapping();
    var chord = m ? String(m.targetKey || '').trim() : '';
    el.hidden = false;
    el.textContent = chord
      ? t('keysImeStayWithChord', '识别键仍为 {chord}（未改动）').replace(
          '{chord}',
          friendlyChord(chord)
        )
      : t('keysImeStayEmpty', '识别键未设置 · 录动作快捷键不会改动它');
  }

  function selectionToast(displayName, hasChord) {
    var tip = hasChord
      ? t('keysActionKeyUpdateToast', '已选中 · 再录将更新该命令快捷键（不改动识别键）')
      : t('keysActionKeyAppendToast', '已选中 · 录制后将追加动作快捷键（不改动识别键）');
    toast(tip + ' · ' + displayName);
  }

  function resolveImeDictationCap(m, friendly) {
    m = m || mappingById(selectedMappingId());
    friendly =
      friendly ||
      (global.__vp_mapping_core_hooks__ || {}).friendlyKeyName ||
      function (k) {
        return k;
      };
    var coreApi = global.OneToneMappingCore;
    var tgt =
      coreApi && coreApi.editorTarget
        ? String(coreApi.editorTarget(m) || '').trim()
        : String((m && m.targetKey) || '').trim();
    var fl = tgt ? friendly(tgt) || tgt : t('badgeNotRecorded', '未设置');
    return {
      kind: 'ime',
      active: false,
      primaryLabel: fl,
      secondaryLabel: '',
      badge: t('keysHeroModeIme', '输入法识别键'),
      chord: tgt,
      empty: !tgt,
      channel: 'key',
      channelLabel: channelTabLabel('key'),
      targetLabel: fl,
      targetEmpty: !tgt,
      actionId: '',
      sourceChannel: 'key',
      iconHtml: ''
    };
  }

  function applyHero() {
    var badge = document.getElementById('keysTargetModeBadge');
    var targetEl = document.getElementById('targetView');
    var targetDisp = document.getElementById('targetDisplay');
    var host = document.getElementById('habitKeyMapCellTarget');
    var imeIcon = document.getElementById('targetImeIconMapping');
    var appBadge = document.getElementById('targetAppBadgeMapping');
    var m = mappingById(selectedMappingId());
    // Top-02 / habit / restart: always the saved recognition capability.
    var cap = resolveHeroCapture(m);
    var hm = heroModel();
    // IME strip "听写键" keycap alone: show dictation key while browsing IME (no action pick).
    var paintCap = cap;
    if (
      activeTab === 'ime' &&
      !(selection && (selection.actionId || (selection.sourceChannel === 'key' && selection.sourceBindingRef && selection.sourceBindingRef !== 'ime')))
    ) {
      paintCap = resolveImeDictationCap(m);
    }

    if (cap.active) {
      if (selection && m) {
        var keyB = findKeyBinding(
          heroBindMappingForRef(selectionToHeroRef(selection), m),
          selection.actionId,
          selection.actionInstanceId
        );
        if (selection) {
          selection.keyBindingRef = keyB ? String(keyB.slotId || '') : '';
          if (keyB && keyB.actionInstanceId && !selection.actionInstanceId) {
            selection.actionInstanceId = String(keyB.actionInstanceId);
          }
          if (keyB && keyB.actionArgs != null && selection.actionArgs == null) {
            selection.actionArgs = keyB.actionArgs;
          }
        }
      }
      if (badge) {
        badge.textContent = (paintCap === cap ? cap.badge : paintCap.badge) || t('keysHeroModeAction', '动作快捷键');
        if (paintCap === cap) badge.classList.add('is-action');
        else badge.classList.remove('is-action');
      }
      if (imeIcon) imeIcon.hidden = paintCap !== cap ? false : true;
      if (appBadge) {
        appBadge.hidden = true;
        appBadge.setAttribute('aria-hidden', 'true');
      }
      syncActionIconHost(paintCap === cap ? hm.iconHtml : '');
      var paintLabel = paintCap.primaryLabel || paintCap.targetLabel || '';
      if (global.__otMappingEditorDisplayMounted && typeof global.__otMappingEditorDisplaySync === 'function') {
        global.__otMappingEditorDisplaySync();
        // Island paints captureHero; re-assert IME dictation on the 听写键 keycap when browsing IME.
        if (paintCap !== cap && targetEl) targetEl.textContent = paintLabel;
      } else if (targetEl) {
        targetEl.textContent = paintLabel;
      }
      if (targetDisp) {
        targetDisp.classList.toggle('empty', !!paintCap.empty);
        if (paintCap === cap) targetDisp.classList.add('is-codex-cap-edit');
        else targetDisp.classList.remove('is-codex-cap-edit');
      }
      if (host) {
        if (paintCap === cap) host.classList.add('is-codex-cap-edit');
        else host.classList.remove('is-codex-cap-edit');
      }
      syncImeStay();
      syncCaptureRecordChrome();
      return paintCap === cap;
    }

    if (badge) {
      badge.textContent = paintCap.badge || t('keysHeroModeIme', '输入法识别键');
      badge.classList.remove('is-action');
    }
    syncActionIconHost('');
    var imeLabel = paintCap.primaryLabel || '';
    if (global.__otMappingEditorDisplayMounted && typeof global.__otMappingEditorDisplaySync === 'function') {
      global.__otMappingEditorDisplaySync();
      if (activeTab === 'ime' && targetEl && paintCap.kind === 'ime') targetEl.textContent = imeLabel;
    } else if (targetEl) {
      targetEl.textContent = imeLabel;
    }
    if (targetDisp) {
      targetDisp.classList.toggle('empty', !!paintCap.empty);
      targetDisp.classList.remove('is-codex-cap-edit');
    }
    if (host) host.classList.remove('is-codex-cap-edit');
    syncImeStay();
    syncCaptureRecordChrome();
    return false;
  }

  function filteredViews(channel) {
    var rows = (viewsCache || []).filter(function (v) {
      if (viewChannel(v) !== channel) return false;
      if (v.enabled === false) return false;
      var aid = viewActionId(v);
      var ref = viewRef(v);
      if (!aid || !ref) return false;
      // Lifecycle covered by FE bridges — avoid duplicate rows.
      if (
        channel === 'voice' &&
        (aid === VOICE_LIFECYCLE_IDS.start ||
          aid === VOICE_LIFECYCLE_IDS.cancel ||
          aid === VOICE_LIFECYCLE_IDS.endCommit ||
          aid === VOICE_LIFECYCLE_IDS.endSend)
      ) {
        return false;
      }
      return true;
    });
    var F = global.OneToneActionCatalogFilter;
    if (!F || !F.buildCrossHintMap || !F.tokenBoundOnChannel) return rows;
    if (channel === 'camera' || channel === 'softPad') return rows;
    var mid = selectedMappingId();
    var hint = F.buildCrossHintMap(viewsCache, mid);
    return rows.filter(function (v) {
      return F.tokenBoundOnChannel(viewActionId(v), hint, channel);
    });
  }

  function primaryWakePhrase() {
    var cfg = config();
    var lists = [];
    var sapi = cfg.voiceSapi || cfg.voice_sapi || {};
    var vosk = cfg.voiceVosk || cfg.voice_vosk || {};
    if (Array.isArray(sapi.phrases)) lists = lists.concat(sapi.phrases);
    if (Array.isArray(vosk.phrases)) lists = lists.concat(vosk.phrases);
    for (var i = 0; i < lists.length; i++) {
      var p = String(lists[i] || '').trim();
      if (p) return p;
    }
    return t('keysVoiceBridgeStartPhraseFallback', '开始听写');
  }

  function voicePickPhraseList(list) {
    var out = [];
    var i;
    for (i = 0; i < (list || []).length; i++) {
      var p = String(list[i] || '').trim();
      if (p && out.indexOf(p) < 0) out.push(p);
    }
    return out;
  }

  function voicePickLocalePhrases(pair) {
    pair = pair || {};
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    var list = voicePickPhraseList(en ? pair.en : pair.zh);
    if (list.length) return list;
    return voicePickPhraseList(pair.zh && pair.zh.length ? pair.zh : pair.en);
  }

  /** User-facing spoken activation text for a voice-pick row. */
  function voicePickSayForKind(kind) {
    var cfg = config();
    var m = mappingById(selectedMappingId());
    var ov = (m && (m.voiceOverride || m.voice_override)) || {};
    if (kind === 'start') {
      var wake = voicePickPhraseList(ov.wakePhrases || ov.wake_phrases);
      if (!wake.length) {
        var sc = global.OneToneSceneConfig;
        wake = sc && sc.globalWakePhrases
          ? voicePickPhraseList(sc.globalWakePhrases(cfg))
          : [];
      }
      if (!wake.length) wake = [primaryWakePhrase()];
      return wake.join(' · ');
    }
    if (kind === 'cancel') {
      var cov = ov.cancelPhrases || ov.cancel_phrases || {};
      var clist = voicePickLocalePhrases(cov);
      if (!clist.length) {
        var Diff = global.OneToneHabitOverrideDiff;
        clist = Diff && Diff.globalCancelPhrases
          ? voicePickLocalePhrases(Diff.globalCancelPhrases(cfg))
          : [];
      }
      return clist.join(' · ');
    }
    if (kind === 'end') {
      var end = cfg.voiceEnd || cfg.voice_end || {};
      var auto = String(end.sendMode || end.send_mode || 'manual').toLowerCase() === 'auto';
      var eov = auto
        ? ov.sendPhrases || ov.send_phrases || {}
        : ov.endPhrases || ov.end_phrases || {};
      var elist = voicePickLocalePhrases(eov);
      if (!elist.length) {
        var Diff2 = global.OneToneHabitOverrideDiff;
        var sc2 = global.OneToneSceneConfig;
        if (auto && Diff2 && Diff2.globalSendPhrases) {
          elist = voicePickLocalePhrases(Diff2.globalSendPhrases(cfg));
        } else if (sc2 && sc2.globalEndPhrases) {
          elist = voicePickLocalePhrases(sc2.globalEndPhrases(cfg));
        }
      }
      return elist.join(' · ');
    }
    return '';
  }

  function finishSendModeLabel() {
    var cfg = config();
    var end = cfg.voiceEnd || cfg.voice_end || {};
    var mode = String(end.sendMode || end.send_mode || 'manual').toLowerCase();
    if (mode === 'auto') return t('keysVoiceBridgeEndSend', '结束并发送');
    return t('keysVoiceBridgeEndCommit', '结束听写');
  }

  /**
   * Translate voice-page lifecycle into reusable intents for recognition.
   * Does not expand BindingView; end/send only guides to step 03.
   */
  function appDisplayName(appId) {
    var id = String(appId || '').trim();
    if (!id) return '';
    var ab = global.OneToneAppBehaviorRules;
    if (ab && ab.appDisplayName) {
      try {
        return String(ab.appDisplayName(id, null) || id);
      } catch (_) {}
    }
    var atp = global.OneToneAppTargetPresets;
    if (atp && atp.presetById) {
      var p = atp.presetById(id);
      if (p && p.nameKey) {
        var n = t(p.nameKey);
        if (n && n !== p.nameKey) return n;
      }
      if (p && p.name) return String(p.name);
    }
    return id;
  }

  function openAppAcousticProjection() {
    var m = activeMapping();
    if (!m) return null;
    var appId = String(m.appTargetId || '').trim();
    if (!appId || appId === 'custom') return null;
    var cmds = Array.isArray(m.acousticVoiceCommands) ? m.acousticVoiceCommands : [];
    var cmd = null;
    for (var i = 0; i < cmds.length; i++) {
      if (cmds[i]) {
        cmd = cmds[i];
        break;
      }
    }
    var name = appDisplayName(appId);
    var note = '';
    if (cmd) {
      note = String(cmd.displayText || cmd.display_text || '').trim();
    }
    var sourceRef = cmd
      ? String(cmd.id || cmd.commandId || cmd.command_id || 'acmd-' + (m.id || '')).trim()
      : 'open-app:' + (m.id || appId);
    return {
      kind: 'bind',
      actionId: 'app.open',
      bindingRef: 'open-app-acoustic:' + sourceRef,
      actionInstanceId: 'app-open:' + String(m.id || ''),
      name: t('keysVoiceBridgeOpenApp', '打开应用') + ' · ' + name,
      sub:
        t('keysVoiceBridgeOpenAppSub', '口令') +
        (note ? ' · ' + note : '') +
        ' · ' +
        t('keysVoiceBridgeOpenAppMigratable', '可迁移为按键，不改语音配置'),
      offerIme: false,
      sourceKind: 'open-app-acoustic',
      transferable: true
    };
  }

  function voiceLifecycleBridges() {
    // Plain-language pick cards; open-app lives in voicePickCatalog, not here.
    return [
      {
        kind: 'bind',
        actionId: VOICE_LIFECYCLE_IDS.start,
        bindingRef: 'voice-lifecycle:start',
        pickId: 'voice-start',
        name: t('keysVoicePickStart', '开始用嘴打字'),
        scene: t(
          'keysVoicePickStartScene',
          '要对着输入框说一大段需求、改说明时。'
        ),
        effect: t(
          'keysVoicePickStartEffect',
          '打开语音输入，字直接出现在当前输入框里。'
        ),
        func: t(
          'keysVoicePickStartFunc',
          '开始说话打字。也可以点小工具条上的麦克风，或说一句开始的话。'
        ),
        offerIme: false
      },
      {
        kind: 'bind',
        actionId: VOICE_LIFECYCLE_IDS.cancel,
        bindingRef: 'voice-lifecycle:cancel',
        pickId: 'voice-cancel',
        name: t('keysVoicePickCancel', '说错了，取消'),
        scene: t('keysVoicePickCancelScene', '说到一半说错了，或这轮不想要了。'),
        effect: t('keysVoicePickCancelEffect', '马上停掉，这轮内容不当真发出去。'),
        func: t('keysVoicePickCancelFunc', '停掉正在说的这一轮。'),
        offerIme: false
      },
      {
        kind: 'guide-finish',
        actionId: VOICE_LIFECYCLE_IDS.endCommit,
        bindingRef: 'voice-lifecycle:end',
        pickId: 'voice-end',
        name: t('keysVoicePickEnd', '说完了，发出去'),
        scene: t('keysVoicePickEndScene', '长需求说完了，要交给 AI 去干。'),
        effect: t('keysVoicePickEndEffect', '结束说话，并把内容发出去。'),
        func: t(
          'keysVoicePickEndFunc',
          '收尾。更适合用按键，少在嘴里说「发送」免得误触。'
        ),
        offerIme: false
      }
    ];
  }

  function voicePickCopyForAction(actionId, name) {
    var id = canonicalActionId(actionId);
    var nm = String(name || '');
    if (id === 'app.open' || id.indexOf('app.open') === 0) {
      return {
        scene: t('keysVoicePickOpenScene', '人在其他软件里，要回到正用的应用继续干。'),
        effect: t('keysVoicePickOpenEffect', '打开或切到该应用。'),
        func: t('keysVoicePickOpenFunc', '快速回去。可以说，也可以再配一个按键。')
      };
    }
    if (/continue/i.test(id) || /继续/.test(nm)) {
      return {
        scene: t('keysVoicePickContinueScene', 'AI 停住等你，或你要它接着干下一步。'),
        effect: t('keysVoicePickContinueEffect', '告诉当前 AI：继续。'),
        func: t(
          'keysVoicePickContinueFunc',
          '和屏幕按钮上的「继续」是同一件事。在应用里时常直接说也行。'
        )
      };
    }
    if (/newThread|new.?chat|新会话|新建/i.test(id + ' ' + nm)) {
      return {
        scene: t('keysVoicePickNewScene', '当前对话太乱，想重新开一局干净的。'),
        effect: t('keysVoicePickNewEffect', '新开一条对话。'),
        func: t('keysVoicePickNewFunc', '用说话就能做。一般不用再配按键。')
      };
    }
    return {
      scene: t('keysVoicePickGenericScene', '想用说话触发这件事，并可再配一个按键时。'),
      effect: t('keysVoicePickGenericEffect', '执行「{name}」。').replace(
        '{name}',
        nm || t('keysVoicePickGenericName', '该动作')
      ),
      func: t(
        'keysVoicePickGenericFunc',
        '来自当前用法里已开语音的动作。改说法请去屏幕按钮。'
      )
    };
  }

  function voicePickCatalog(forMapping) {
    var m = forMapping || mappingById(selectedMappingId());
    var mid = m ? String(m.id || '') : selectedMappingId();
    var out = [];
    if (!m) return out;
    var seen = {};
    var appName = appDisplayName(String(m.appTargetId || '').trim());

    // 1) Per-mapping acoustic recordings (真实录制口令)
    var cmds = Array.isArray(m.acousticVoiceCommands)
      ? m.acousticVoiceCommands
      : [];
    var ci;
    for (ci = 0; ci < cmds.length; ci++) {
      var cmd = cmds[ci];
      if (!cmd || cmd.enabled === false) continue;
      var label = String(cmd.label || '').trim();
      var say = String(cmd.displayText || cmd.display_text || '').trim() || label;
      if (!say) continue;
      var cid = String(cmd.id || cmd.commandId || cmd.command_id || 'acmd-' + ci).trim();
      var bref = 'open-app-acoustic:' + cid;
      seen[bref] = 1;
      seen[cid] = 1;
      out.push({
        pickId: 'voice-acoustic:' + cid,
        kind: 'bind',
        actionId: 'app.open',
        bindingRef: bref,
        actionInstanceId: 'app-open:' + String(m.id || mid || ''),
        name: label || say,
        scene: '',
        effect: '',
        func: appName
          ? t('keysVoicePickOpen', '回到应用') + ' · ' + appName
          : '',
        say: say,
        bindable: true
      });
    }

    // 2) User voice agentBindings (真实文本口令)
    var binds = m.agentBindings || [];
    var bi;
    for (bi = 0; bi < binds.length; bi++) {
      var b = binds[bi];
      if (!b || b.enabled === false) continue;
      if (String(b.triggerType || b.trigger_type || '').trim() !== 'voice') continue;
      var bSay = String(b.triggerBinding || b.trigger_binding || '').trim();
      if (!bSay) continue;
      var ref = String(b.slotId || b.slot_id || b.bindingRef || b.binding_ref || '').trim();
      if (!ref || seen[ref]) continue;
      var aid = canonicalActionId(b.actionId || b.action_id || '');
      if (!aid) continue;
      var rowName = actionLabel(aid) || bSay;
      if (!matchesSearch(rowName + ' ' + aid + ' ' + ref + ' ' + bSay)) continue;
      var canBind = bindableByAction[aid];
      if (canBind === undefined) canBind = true;
      seen[ref] = 1;
      out.push({
        pickId: 'voice-bind:' + ref,
        kind: 'bind',
        actionId: aid,
        bindingRef: ref,
        actionInstanceId: String(b.actionInstanceId || b.action_instance_id || ''),
        name: rowName,
        scene: '',
        effect: '',
        func: '',
        say: bSay,
        bindable: !!canBind
      });
    }

    // 3) BindingViews voice rows not already covered (projection catch-all)
    var views = filteredViews('voice');
    var vi;
    for (vi = 0; vi < views.length; vi++) {
      var v = views[vi];
      var vRef = viewRef(v);
      var vSay = viewTrigger(v);
      var vAid = viewActionId(v);
      if (!vRef || !vSay || !vAid || seen[vRef]) continue;
      if (String(vRef).indexOf('open-app-acoustic:') === 0) continue;
      var vName = actionLabel(vAid) || vSay;
      if (!matchesSearch(vName + ' ' + vAid + ' ' + vRef + ' ' + vSay)) continue;
      var vBind = bindableByAction[vAid];
      if (vBind === undefined) vBind = true;
      seen[vRef] = 1;
      out.push({
        pickId: 'voice-view:' + vRef,
        kind: 'bind',
        actionId: vAid,
        bindingRef: vRef,
        actionInstanceId: '',
        name: vName,
        scene: '',
        effect: '',
        func: '',
        say: vSay,
        bindable: !!vBind
      });
    }
    return out;
  }

  function voicePickHabitPill() {
    var m = activeMapping() || mappingById(selectedMappingId());
    var appId = m && String(m.appTargetId || '').trim();
    if (appId && appId !== 'custom') {
      return t('keysVoicePickPillUsing', '正在用') + ' · ' + appDisplayName(appId);
    }
    return t('keysVoicePickPillGeneral', '正在用 · 通用');
  }

  function findVoicePick(pickId) {
    var catalog = voicePickCatalog();
    var id = String(pickId || '').trim();
    var i;
    for (i = 0; i < catalog.length; i++) {
      if (catalog[i].pickId === id) return catalog[i];
    }
    return catalog[0] || null;
  }

  function renderVoicePickHtml() {
    var raw = voicePickCatalog();
    var catalog = [];
    var ri;
    for (ri = 0; ri < raw.length; ri++) {
      var row = raw[ri];
      var say = String(row.say || '').trim();
      if (!say) continue;
      var g = voicePickGroupMeta(row);
      row.groupId = g.id;
      row.groupTitle = g.title;
      catalog.push(row);
    }
    if (!catalog.length) {
      return (
        '<div class="keys-voice-pick">' +
        '<div class="keys-voice-pick-head">' +
        '<span class="keys-voice-pick-title">' +
        esc(t('keysVoicePickTitle', '口头指令')) +
        '</span>' +
        '<span class="keys-voice-pick-pill">' +
        esc(voicePickHabitPill()) +
        '</span></div>' +
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysPickOnlySetEmptyVoice',
            '当前应用还没有录制语音口令。先去录好口令，再回来加快捷键。'
          )
        ) +
        '</p>' +
        '<p class="keys-voice-pick-escape">' +
        esc(t('keysVoicePickDesignHint', '想加新动作？')) +
        ' <button type="button" class="keys-channel-item-link" data-go-softpad="1">' +
        esc(t('keysVoicePickGoSoftPad', '去屏幕按钮里设置')) +
        '</button></p></div>'
      );
    }
    syncVoicePickIdFromSelection();
    if (!voicePickSelectedId || !findVoicePick(voicePickSelectedId)) {
      voicePickSelectedId = catalog[0].pickId;
    } else {
      var still = false;
      for (ri = 0; ri < catalog.length; ri++) {
        if (catalog[ri].pickId === voicePickSelectedId) {
          still = true;
          break;
        }
      }
      if (!still) voicePickSelectedId = catalog[0].pickId;
    }
    var sel = findVoicePick(voicePickSelectedId) || catalog[0];
    var tabs = [];
    var tabSeen = {};
    var order = ['dictation', 'send', 'cancel', 'agent', 'open', 'more'];
    var oi;
    for (oi = 0; oi < order.length; oi++) {
      for (ri = 0; ri < catalog.length; ri++) {
        if (catalog[ri].groupId === order[oi] && !tabSeen[order[oi]]) {
          tabSeen[order[oi]] = true;
          tabs.push({ id: order[oi], title: catalog[ri].groupTitle });
        }
      }
    }
    for (ri = 0; ri < catalog.length; ri++) {
      if (!tabSeen[catalog[ri].groupId]) {
        tabSeen[catalog[ri].groupId] = true;
        tabs.push({ id: catalog[ri].groupId, title: catalog[ri].groupTitle });
      }
    }
    voicePickSubtabId = pickSubtabResolve(
      tabs,
      voicePickSubtabId,
      sel && sel.groupId
    );
    var rowsHtml = '';
    for (oi = 0; oi < catalog.length; oi++) {
      var c = catalog[oi];
      if (c.groupId !== voicePickSubtabId) continue;
      var on = c.pickId === sel.pickId;
      var sayText = String(c.say || '').trim();
      rowsHtml +=
        '<button type="button" role="option" class="keys-voice-pick-row' +
        (on ? ' is-selected' : '') +
        '" data-voice-pick-row="' +
        esc(c.pickId) +
        '" aria-selected="' +
        (on ? 'true' : 'false') +
        '">' +
        '<span class="keys-voice-pick-row-name">' +
        esc(c.name) +
        '</span>' +
        (sayText
          ? '<span class="keys-voice-pick-row-say">' +
            '<span class="keys-voice-pick-row-lab">' +
            esc(t('keysVoicePickLabSay', '激活')) +
            '</span>「' +
            esc(sayText) +
            '」</span>'
          : '') +
        '</button>';
    }
    return (
      '<div class="keys-voice-pick is-list" data-voice-pick="1">' +
      '<div class="keys-voice-pick-head">' +
      '<span class="keys-voice-pick-title">' +
      esc(t('keysVoicePickTitle', '口头指令')) +
      '</span>' +
      '<span class="keys-voice-pick-pill">' +
      esc(voicePickHabitPill()) +
      '</span></div>' +
      '<p class="keys-voice-pick-lead">' +
      esc(t('keysVoicePickLead', '本应用已录制的口令，点一条开始录快捷键。')) +
      '</p>' +
      renderPickSubtabsHtml(tabs, voicePickSubtabId, 'voice') +
      '<div class="keys-voice-pick-list" role="listbox" aria-label="' +
      esc(t('keysVoicePickTitle', '口头指令')) +
      '">' +
      rowsHtml +
      '</div></div>'
    );
  }

  function selectionMatchesPick(channel, bindingRef) {
    return !!(
      selection &&
      selection.sourceChannel === channel &&
      String(selection.sourceBindingRef || '') === String(bindingRef || '')
    );
  }

  /**
   * Unique recognition pick → selection + keycap preview.
   * No recording, no toast. Returns true if selection was written.
   */
  /**
   * Keep 02 keycap / top recognition hint in sync with the channel catalog pick.
   * Persist only when the pick differs from current selection (browse must not clobber).
   */
  function syncCatalogHeroToPick(channel) {
    if (channel === 'voice') {
      var vRow = findVoicePick(voicePickSelectedId);
      if (!vRow || !vRow.actionId || vRow.kind === 'guide-finish') return false;
      var vAlready =
        selectionMatchesPick('voice', vRow.bindingRef) &&
        selection &&
        selection.actionId === vRow.actionId;
      return previewPickSelection('voice', { skipPersist: !!vAlready });
    }
    if (channel === 'cursor') {
      var cRow = findCursorPick(cursorPickSelectedId);
      if (!cRow || !cRow.actionId) return false;
      var cAlready =
        selectionMatchesPick('cursor', cRow.slotId || cRow.bindingRef) &&
        selection &&
        selection.actionId === cRow.actionId;
      return previewPickSelection('cursor', { skipPersist: !!cAlready });
    }
    if (channel === 'camera') {
      var aRow = findCameraPick(cameraPickSelectedId);
      if (!aRow || !aRow.actionId) return false;
      var aAlready =
        selectionMatchesPick('camera', aRow.gesture || aRow.bindingRef) &&
        selection &&
        selection.actionId === aRow.actionId;
      return previewPickSelection('camera', { skipPersist: !!aAlready });
    }
    return false;
  }

  function previewPickSelection(channel, opts) {
    opts = opts || {};
    var mid = selectedMappingId();
    if (!mid) return false;
    var m = mappingById(mid);
    if (channel === 'voice') {
      var vRow = findVoicePick(voicePickSelectedId);
      // Preview any concrete pick (incl. voice-only); guide-finish has no action.
      if (!vRow || vRow.kind === 'guide-finish' || !vRow.actionId) {
        return false;
      }
      var vKey = findKeyBinding(m, vRow.actionId, vRow.actionInstanceId || '');
      setSelection(
        {
          mappingId: mid,
          sourceChannel: 'voice',
          sourceBindingRef: vRow.bindingRef,
          actionId: vRow.actionId,
          keyBindingRef: vKey ? String(vKey.slotId || '') : '',
          actionInstanceId: vRow.actionInstanceId || (vKey && vKey.actionInstanceId) || '',
          actionArgs: vKey && vKey.actionArgs ? vKey.actionArgs : null
        },
        {
          skipRender: true,
          skipPersist: !!(opts && opts.skipPersist)
        }
      );
      return true;
    }
    if (channel === 'cursor') {
      var cRow = findCursorPick(cursorPickSelectedId);
      // Preview gated rows too — bind button still blocks record.
      if (!cRow || !cRow.item || !cRow.actionId) return false;
      var cKey = findKeyBinding(m, cRow.actionId, '');
      setSelection(
        {
          mappingId: mid,
          sourceChannel: 'cursor',
          sourceBindingRef: cRow.slotId,
          actionId: cRow.actionId,
          keyBindingRef: cKey ? String(cKey.slotId || '') : '',
          actionInstanceId: (cKey && cKey.actionInstanceId) || '',
          actionArgs: cKey && cKey.actionArgs ? cKey.actionArgs : null
        },
        {
          skipRender: true,
          skipPersist: !!(opts && opts.skipPersist)
        }
      );
      return true;
    }
    if (channel === 'camera') {
      var aRow = findCameraPick(cameraPickSelectedId);
      if (!aRow || !aRow.view || !aRow.actionId) return false;
      var aKey = findKeyBinding(m, aRow.actionId, '');
      setSelection(
        {
          mappingId: mid,
          sourceChannel: 'camera',
          sourceBindingRef: aRow.gesture,
          actionId: aRow.actionId,
          keyBindingRef: aKey ? String(aKey.slotId || '') : '',
          actionInstanceId: (aKey && aKey.actionInstanceId) || '',
          actionArgs: aKey && aKey.actionArgs ? aKey.actionArgs : null
        },
        {
          skipRender: true,
          skipPersist: !!(opts && opts.skipPersist)
        }
      );
      return true;
    }
    if (channel === 'softPad') {
      var sRow = findSoftPadPick(softPadPickSelectedId);
      if (!sRow || !sRow.actionId) return false;
      var ctxSp = resolveSoftPadScope();
      var workMid = ctxSp && ctxSp.targetMappingId ? String(ctxSp.targetMappingId) : '';
      if (!workMid) return false;
      setSelection(
        {
          mappingId: workMid,
          sourceChannel: 'softPad',
          sourceBindingRef: sRow.microKeyId,
          actionId: sRow.actionId,
          keyBindingRef: sRow.keyBindingRef || '',
          actionInstanceId: sRow.actionInstanceId || '',
          actionArgs: sRow.actionArgs
        },
        {
          skipRender: true,
          skipPersist: !!(opts && opts.skipPersist)
        }
      );
      return true;
    }
    return false;
  }

  function syncVoicePickIdFromSelection() {
    if (!selection || selection.sourceChannel !== 'voice') return;
    var catalog = voicePickCatalog();
    var i;
    for (i = 0; i < catalog.length; i++) {
      var c = catalog[i];
      if (
        c.pickId === selection.sourceBindingRef ||
        c.bindingRef === selection.sourceBindingRef
      ) {
        voicePickSelectedId = c.pickId;
        return;
      }
    }
  }

  function syncCursorPickIdFromSelection() {
    if (!selection || selection.sourceChannel !== 'cursor') return;
    if (findCursorPick(selection.sourceBindingRef)) {
      cursorPickSelectedId = selection.sourceBindingRef;
    }
  }

  function syncCameraPickIdFromSelection() {
    if (!selection || selection.sourceChannel !== 'camera') return;
    if (findCameraPick(selection.sourceBindingRef)) {
      cameraPickSelectedId = selection.sourceBindingRef;
    }
  }

  function applyVoicePickBind() {
    var row = findVoicePick(voicePickSelectedId);
    if (!row) return;
    if (row.kind === 'guide-finish') {
      guideToFinish();
      return;
    }
    if (!row.bindable) {
      toast(t('keysVoicePickBtnVoiceOnly', '用说话就行，不必加按键'));
      return;
    }
    var mid = selectedMappingId();
    if (!mid) {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return;
    }
    var already = selectionMatchesPick('voice', row.bindingRef);
    if (!already) {
      voicePickSelectedId = row.pickId;
      previewPickSelection('voice');
      renderPanelOnly();
    }
    var m = mappingById(mid);
    var keyB = findKeyBinding(m, row.actionId, row.actionInstanceId || '');
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    selectionToast(row.name, !!chord);
    // Select only — 录制快捷键 via keycap / explicit record control.
  }

  function applyCursorPickBind() {
    var row = findCursorPick(cursorPickSelectedId);
    if (!row || !row.item) return;
    if (row.gated) {
      toast(t('keysChannelCursorGatedToast', '接受类需先打开开关后才能加按键'));
      return;
    }
    var mid = selectedMappingId();
    if (!mid) {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return;
    }
    var already = selectionMatchesPick('cursor', row.slotId);
    if (!already) {
      cursorPickSelectedId = row.slotId;
      previewPickSelection('cursor');
      renderPanelOnly();
    }
    var mapCur = mappingById(mid);
    var keyBCur = findKeyBinding(mapCur, row.actionId, '');
    selectionToast(row.title, !!(keyBCur && keyBCur.triggerBinding));
    // Select only — 录制快捷键 via keycap / explicit record control.
  }

  function applyCameraPickBind() {
    var row = findCameraPick(cameraPickSelectedId);
    if (!row) return;
    if (!row.bindable || !row.view) {
      guideToCameraSettings();
      return;
    }
    var mid = selectedMappingId();
    if (!mid) {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return;
    }
    var already = selectionMatchesPick('camera', row.gesture);
    if (!already) {
      cameraPickSelectedId = row.pickId;
      previewPickSelection('camera');
      renderPanelOnly();
    }
    var m = mappingById(mid);
    var keyB = findKeyBinding(m, row.actionId, '');
    selectionToast(row.title, !!(keyB && keyB.triggerBinding));
    // Select only — 录制快捷键 via keycap / explicit record control.
  }

  function existingAppShortcutRows(m) {
    if (!m || !Array.isArray(m.agentBindings)) return [];
    var out = [];
    for (var i = 0; i < m.agentBindings.length; i++) {
      var b = m.agentBindings[i];
      if (!b || b.triggerType !== 'key') continue;
      if (canonicalActionId(b.actionId) !== 'app.shortcut') continue;
      var chordOut =
        b.actionArgs && b.actionArgs.chord
          ? String(b.actionArgs.chord)
          : '';
      out.push({
        kind: 'bind',
        actionId: 'app.shortcut',
        bindingRef: String(b.slotId || ''),
        actionInstanceId: String(b.actionInstanceId || ''),
        actionArgs: b.actionArgs || null,
        name:
          t('keysAppShortcutRow', '应用快捷键') +
          (chordOut ? ' · ' + friendlyChord(chordOut) : ''),
        sub:
          t('keysAppShortcutTrigger', '触发') +
          ' · ' +
          (friendlyChord(b.triggerBinding) || t('keysHeroActionNeedsKey', '待设置快捷键')),
        offerIme: false
      });
    }
    return out;
  }

  function rowsForTab(ch) {
    if (ch === 'voice') {
      return { bridges: voiceLifecycleBridges(), views: filteredViews('voice'), footer: null };
    }
    if (ch === 'softPad') {
      return {
        kind: 'softPadKeyboard',
        bridges: existingAppShortcutRows(activeMapping()),
        views: [],
        footer: {
          kind: 'add-app-shortcut',
          label: t('keysAddAppShortcut', '＋ 添加应用快捷键')
        }
      };
    }
    return { bridges: [], views: filteredViews(ch), footer: null };
  }

  function sourceSubline(channel, v) {
    var trig = viewTrigger(v);
    if (channel === 'voice') {
      return t('keysChannelTriggerPhrase', '口令') + (trig ? ' · ' + trig : '');
    }
    if (channel === 'camera') {
      return t('keysChannelGesture', '手势') + ' · ' + gestureLabel(viewRef(v));
    }
    return t('keysChannelPadKey', '键位') + (trig ? ' · ' + trig : '');
  }

  function emptyCopy(channel) {
    if (channel === 'voice') {
      return t('keysChannelEmptyVoice', '当前用法里还没有可加按键的口头指令');
    }
    if (channel === 'cursor') {
      return t('keysChannelEmptyCursor', '暂无 Cursor 里的事');
    }
    if (channel === 'softPad') {
      return t('keysChannelEmptySoftPad', '当前习惯暂无可适配为快捷键的屏幕按钮');
    }
    if (channel === 'camera') {
      return t('keysChannelEmptyCamera', '当前习惯暂无可适配为快捷键的手势');
    }
    return t('keysChannelEmpty', '当前习惯暂无可适配为快捷键的命令');
  }

  function cursorItemLabel(item) {
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    return en ? item.labelEn || item.labelZh : item.labelZh || item.labelEn;
  }

  function cursorItemNote(item) {
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    return en ? item.noteEn || item.noteZh || '' : item.noteZh || item.noteEn || '';
  }

  function cursorItemChord(item) {
    var hint = String((item && item.chordHint) || '').trim();
    if (hint) return hint;
    var A = global.OneToneAgentActions;
    return A && A.defaultCursorKeyForSlot
      ? String(A.defaultCursorKeyForSlot(item.slotId) || '').trim()
      : '';
  }

  function cursorItemRightLabel(item) {
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    var custom = en ? item.rightLabelEn || item.rightLabelZh : item.rightLabelZh || item.rightLabelEn;
    if (custom) return custom;
    var chord = cursorItemChord(item);
    if (chord) return friendlyChord(chord);
    return t('keysHeroActionNeedsKey', '待设置快捷键');
  }

  function cursorItemSub(item) {
    var note = cursorItemNote(item);
    var phrase = String((item && item.phrase) || '').trim();
    var parts = [];
    if (phrase) parts.push(t('keysChannelTriggerPhrase', '口令') + ' · ' + phrase);
    if (note) parts.push(note);
    return parts.join(' · ') || note || '';
  }

  function cursorItemActionId(item) {
    var sid = String((item && item.slotId) || '').trim();
    if (!sid) return '';
    var fromSlot = actionIdFromSlot(sid);
    if (fromSlot && fromSlot !== sid) return fromSlot;
    var A = global.OneToneAgentActions;
    var slot = A && A.slotById ? A.slotById(sid) : null;
    if (slot && slot.actionId) return canonicalActionId(slot.actionId);
    return 'cursor.' + sid;
  }

  function cursorPickLangEn() {
    return ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
  }

  function cursorPickField(copy, zhKey, enKey) {
    if (!copy) return '';
    return cursorPickLangEn() ? copy[enKey] || copy[zhKey] || '' : copy[zhKey] || copy[enKey] || '';
  }

  function cursorFlatItems() {
    var out = [];
    var gi;
    for (gi = 0; gi < CURSOR_COMMAND_GROUPS.length; gi++) {
      var items = CURSOR_COMMAND_GROUPS[gi].items || [];
      var ii;
      for (ii = 0; ii < items.length; ii++) {
        if (items[ii] && items[ii].slotId) out.push(items[ii]);
      }
    }
    return out;
  }

  function cursorPickCatalog(queryOverride) {
    var bySlot = {};
    cursorFlatItems().forEach(function (item) {
      bySlot[String(item.slotId)] = item;
    });
    var groupOf = {};
    var gi;
    for (gi = 0; gi < CURSOR_PICK_GROUPS.length; gi++) {
      var g = CURSOR_PICK_GROUPS[gi];
      var slots = g.slots || [];
      var si;
      for (si = 0; si < slots.length; si++) {
        groupOf[String(slots[si])] = g;
      }
    }
    var ordered = [];
    var seen = {};
    function pushSlot(slotId, group) {
      var id = String(slotId || '').trim();
      if (!id || seen[id] || !bySlot[id]) return;
      seen[id] = true;
      var item = bySlot[id];
      var copy = CURSOR_PICK_COPY[id] || {};
      var title =
        cursorPickField(copy, 'titleZh', 'titleEn') || cursorItemLabel(item);
      var when = cursorPickField(copy, 'whenZh', 'whenEn');
      var effect = cursorPickField(copy, 'effectZh', 'effectEn');
      var func = cursorPickField(copy, 'funcZh', 'funcEn');
      var how = cursorPickField(copy, 'howZh', 'howEn');
      var howText = cursorPickField(copy, 'howTextZh', 'howTextEn');
      var howKind = copy.howKind || (item.gated ? 'warn' : item.chordHint ? 'key' : 'phrase');
      var hay =
        title + ' ' + when + ' ' + effect + ' ' + func + ' ' + id + ' ' + cursorItemLabel(item);
      if (queryOverride != null) {
        if (!catalogQueryMatch(hay, queryOverride)) return;
      } else if (!matchesSearch(hay)) {
        return;
      }
      var grp = group || groupOf[id] || null;
      var chord =
        String((item && item.chordHint) || '').trim() ||
        recognitionChord(cursorItemActionId(item), '') ||
        '';
      ordered.push({
        slotId: id,
        item: item,
        actionId: cursorItemActionId(item),
        title: title,
        when: when || cursorItemNote(item),
        effect: effect || '',
        func: func || '',
        how: how || (item.gated ? t('keysCursorPickHowWarn', '需先打开开关') : t('keysCursorPickHowKey', '可加按键')),
        howKind: howKind,
        howText: howText || '',
        gated: !!item.gated,
        chord: chord,
        groupId: grp ? grp.id : 'extra',
        groupTitle: grp
          ? t(grp.titleKey, grp.titleFb)
          : t('keysCursorPickGroupExtra', '其它')
      });
    }
    for (gi = 0; gi < CURSOR_PICK_GROUPS.length; gi++) {
      var group = CURSOR_PICK_GROUPS[gi];
      var gSlots = group.slots || [];
      var gj;
      for (gj = 0; gj < gSlots.length; gj++) pushSlot(gSlots[gj], group);
    }
    cursorFlatItems().forEach(function (item) {
      pushSlot(item.slotId, groupOf[String(item.slotId)] || null);
    });
    return ordered;
  }

  /** SoftPad「软件自带」：横向场景标签 + Cursor 快捷键卡片。 */
  function catalogCursorPickRows(query) {
    return cursorPickCatalog(query == null ? '' : query);
  }

  function catalogCursorPickGroups() {
    return CURSOR_PICK_GROUPS.map(function (g) {
      return { id: g.id, title: t(g.titleKey, g.titleFb) };
    });
  }

  function findCursorPick(slotId) {
    var catalog = cursorPickCatalog();
    var id = String(slotId || '').trim();
    var i;
    for (i = 0; i < catalog.length; i++) {
      if (catalog[i].slotId === id) return catalog[i];
    }
    return catalog[0] || null;
  }

  function renderCursorPickHtml() {
    var raw = cursorPickCatalog();
    var catalog = [];
    var ri;
    for (ri = 0; ri < raw.length; ri++) {
      var row = raw[ri];
      var hint = row.item ? String(row.item.chordHint || '').trim() : '';
      if (pickOptionLabel(row.title, row.actionId, '', null, hint) || hint) {
        catalog.push(row);
      }
    }
    if (!catalog.length) {
      return (
        '<div class="keys-voice-pick">' +
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysPickOnlySetEmptyCursor',
            '没有可加按键的软件自带功能（需自带快捷键）。'
          )
        ) +
        '</p></div>'
      );
    }
    syncCursorPickIdFromSelection();
    if (!cursorPickSelectedId || !findCursorPick(cursorPickSelectedId)) {
      cursorPickSelectedId = catalog[0].slotId;
    } else {
      var stillC = false;
      for (ri = 0; ri < catalog.length; ri++) {
        if (catalog[ri].slotId === cursorPickSelectedId) {
          stillC = true;
          break;
        }
      }
      if (!stillC) cursorPickSelectedId = catalog[0].slotId;
    }
    var sel = findCursorPick(cursorPickSelectedId) || catalog[0];
    var tabs = [];
    var tabSeen = {};
    var gi;
    for (gi = 0; gi < CURSOR_PICK_GROUPS.length; gi++) {
      var gdef = CURSOR_PICK_GROUPS[gi];
      for (ri = 0; ri < catalog.length; ri++) {
        if (catalog[ri].groupId === gdef.id && !tabSeen[gdef.id]) {
          tabSeen[gdef.id] = true;
          tabs.push({
            id: gdef.id,
            title: t(gdef.titleKey, gdef.titleFb)
          });
        }
      }
    }
    for (ri = 0; ri < catalog.length; ri++) {
      if (!tabSeen[catalog[ri].groupId]) {
        tabSeen[catalog[ri].groupId] = true;
        tabs.push({
          id: catalog[ri].groupId,
          title: catalog[ri].groupTitle || t('keysCursorPickGroupExtra', '其它')
        });
      }
    }
    cursorPickSubtabId = pickSubtabResolve(
      tabs,
      cursorPickSubtabId,
      sel && sel.groupId
    );
    var listHtml = '';
    for (ri = 0; ri < catalog.length; ri++) {
      var r = catalog[ri];
      if (r.groupId !== cursorPickSubtabId) continue;
      var on = r.slotId === cursorPickSelectedId;
      var chord =
        recognitionChord(r.actionId, '') ||
        String((r.item && r.item.chordHint) || '').trim();
      var sub = String(r.effect || r.when || '').trim();
      listHtml +=
        '<button type="button" class="keys-voice-pick-row' +
        (on ? ' is-selected' : '') +
        (r.gated ? ' is-gated' : '') +
        '" data-cursor-pick-row="' +
        esc(r.slotId) +
        '"' +
        (r.gated ? ' aria-disabled="true"' : '') +
        '>' +
        '<span class="keys-voice-pick-row-name">' +
        esc(r.title) +
        '</span>' +
        (chord
          ? '<span class="keys-cursor-pick-chord">' +
            esc(friendlyChord(chord) || chord) +
            '</span>'
          : '') +
        (sub
          ? '<span class="keys-voice-pick-row-meta">' + esc(sub) + '</span>'
          : '') +
        '</button>';
    }
    return (
      '<div class="keys-voice-pick is-list" data-cursor-pick="1">' +
      '<div class="keys-voice-pick-head">' +
      '<span class="keys-voice-pick-title">' +
      esc(t('keysCursorPickTitle', '软件自带')) +
      '</span>' +
      '<span class="keys-voice-pick-pill">' +
      esc(t('keysCursorPickPill', '正在用 · Cursor')) +
      '</span></div>' +
      '<p class="keys-voice-pick-lead">' +
      esc(
        t(
          'keysCursorPickLead',
          'Cursor 常用快捷键，按场景点一条开始录键。'
        )
      ) +
      '</p>' +
      renderPickSubtabsHtml(tabs, cursorPickSubtabId, 'cursor') +
      '<div class="keys-cursor-pick-list">' +
      listHtml +
      '</div></div>'
    );
  }

  function renderCursorCommandsPanel(panel) {
    if (panel.classList) panel.classList.remove('is-softpad-pick');
    syncSoftPadTargetChrome(false);
    panel.innerHTML = renderCursorPickHtml();
  }

  /** Common camera gestures first (binding_ref / gesture id). */
  var CAMERA_COMMON_REFS = [
    'deliberateBlink',
    'shakeHead',
    'openPalm',
    'wave',
    'onAway',
    'onReturn',
    'okHand',
    'fist'
  ];
  var CAMERA_PICK_COPY = {
    deliberateBlink: {
      titleZh: '故意眨眼确认',
      titleEn: 'Deliberate blink',
      whenZh: '要无声确认一件事（开始听写、点头同意之类）。',
      whenEn: 'When you want a silent confirm (start dictation, approve).',
      effectZh: '认出故意闭眼后再睁开，执行你给这个手势绑的动作。',
      effectEn: 'Recognizes a deliberate blink, then runs the bound action.',
      funcZh: '常见：眨眼开始听写，再眨一次结束。',
      funcEn: 'Often: blink to start dictation, blink again to end.',
      howZh: '手势',
      howEn: 'Gesture',
      howKind: 'phrase'
    },
    shakeHead: {
      titleZh: '摇头取消',
      titleEn: 'Shake head to cancel',
      whenZh: '说错了或不想要了，想无声叫停。',
      whenEn: 'When you misspoke or want to stop silently.',
      effectZh: '认出摇头后，执行取消类动作。',
      effectEn: 'Recognizes a head shake, then runs cancel-like action.',
      funcZh: '常绑取消 / Esc。',
      funcEn: 'Often bound to cancel / Esc.',
      howZh: '手势',
      howEn: 'Gesture',
      howKind: 'phrase'
    },
    openPalm: {
      titleZh: '五指张开',
      titleEn: 'Open palm',
      whenZh: '想用手势开一轮或确认开始。',
      whenEn: 'When a palm gesture should start or confirm.',
      effectZh: '认出张开五指后执行绑定动作。',
      effectEn: 'Runs the bound action after an open palm.',
      funcZh: '刻意手势，避免误触。',
      funcEn: 'Deliberate gesture to avoid accidents.',
      howZh: '手势',
      howEn: 'Gesture',
      howKind: 'phrase'
    },
    wave: {
      titleZh: '挥手打招呼',
      titleEn: 'Wave',
      whenZh: '想用挥手触发一件事。',
      whenEn: 'When a wave should trigger something.',
      effectZh: '认出挥手后执行绑定动作。',
      effectEn: 'Runs the bound action after a wave.',
      funcZh: '幅度要大一点才稳。',
      funcEn: 'Needs a clear wave to stay reliable.',
      howZh: '手势',
      howEn: 'Gesture',
      howKind: 'phrase'
    },
    onAway: {
      titleZh: '人离开座位',
      titleEn: 'Away from seat',
      whenZh: '人脸离开画面一段时间。',
      whenEn: 'When your face leaves the frame for a while.',
      effectZh: '判定离席，执行你设的离席动作（如暂停、遮罩）。',
      effectEn: 'Treats you as away and runs the away action.',
      funcZh: '人走了自动收一下。',
      funcEn: 'Auto wrap-up when you leave.',
      howZh: '在场检测',
      howEn: 'Presence',
      howKind: 'phrase'
    },
    onReturn: {
      titleZh: '人回到座位',
      titleEn: 'Back to seat',
      whenZh: '人脸重新出现一段时间。',
      whenEn: 'When your face returns for a while.',
      effectZh: '判定回席，执行回席动作。',
      effectEn: 'Treats you as back and runs the return action.',
      funcZh: '回来后自动接上。',
      funcEn: 'Resume when you return.',
      howZh: '在场检测',
      howEn: 'Presence',
      howKind: 'phrase'
    },
    okHand: {
      titleZh: 'OK 手势',
      titleEn: 'OK hand',
      whenZh: '想用手势表示「可以 / 确认」。',
      whenEn: 'When an OK hand means confirm.',
      effectZh: '认出 OK 手势后执行绑定动作。',
      effectEn: 'Runs the bound action after OK hand.',
      funcZh: '确认类。',
      funcEn: 'Confirm-style.',
      howZh: '手势',
      howEn: 'Gesture',
      howKind: 'phrase'
    },
    fist: {
      titleZh: '握拳',
      titleEn: 'Fist',
      whenZh: '想用握拳触发一件事。',
      whenEn: 'When a fist should trigger something.',
      effectZh: '认出握拳后执行绑定动作。',
      effectEn: 'Runs the bound action after a fist.',
      funcZh: '刻意动作。',
      funcEn: 'Deliberate gesture.',
      howZh: '手势',
      howEn: 'Gesture',
      howKind: 'phrase'
    }
  };

  function cameraPickField(copy, zhKey, enKey) {
    if (!copy) return '';
    var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
    return en ? copy[enKey] || copy[zhKey] || '' : copy[zhKey] || copy[enKey] || '';
  }

  function buildCameraPickRows() {
    var byRef = {};
    filteredViews('camera').forEach(function (v) {
      var ref = viewRef(v);
      if (ref) byRef[ref] = v;
    });
    var ordered = [];
    var seen = {};
    function pushRef(ref) {
      var id = String(ref || '').trim();
      if (!id || seen[id]) return;
      var copy = CAMERA_PICK_COPY[id] || {};
      var view = byRef[id];
      // Always list common gestures; other refs only if a view exists.
      if (!view && CAMERA_COMMON_REFS.indexOf(id) < 0) return;
      var title =
        cameraPickField(copy, 'titleZh', 'titleEn') || gestureLabel(id) || id;
      var when = cameraPickField(copy, 'whenZh', 'whenEn');
      var effect = cameraPickField(copy, 'effectZh', 'effectEn');
      var func = cameraPickField(copy, 'funcZh', 'funcEn');
      var how = cameraPickField(copy, 'howZh', 'howEn') || t('keysChannelGesture', '手势');
      var howKind = copy.howKind || 'phrase';
      seen[id] = true;
      var actionId = view ? viewActionId(view) : '';
      var bindable = !!(view && actionId && bindableByAction[actionId] !== false);
      ordered.push({
        pickId: id,
        gesture: id,
        view: view || null,
        actionId: actionId,
        title: title,
        when: when || t('keysCameraPickGenericWhen', '摄像头认出这个动作时。'),
        effect: effect || (actionId ? t('keysCameraPickGenericEffect', '执行已绑动作。') : t('keysCameraPickNeedSetupEffect', '还没在摄像头里设好动作。')),
        func: func || (actionId ? actionLabel(actionId) : t('keysCameraPickNeedSetupFunc', '先去摄像头页选好这个手势要干什么。')),
        how: how,
        howKind: howKind,
        bindable: bindable,
        common: CAMERA_COMMON_REFS.indexOf(id) >= 0
      });
    }
    var ci;
    for (ci = 0; ci < CAMERA_COMMON_REFS.length; ci++) pushRef(CAMERA_COMMON_REFS[ci]);
    Object.keys(byRef).forEach(function (ref) {
      pushRef(ref);
    });
    return ordered;
  }

  function cameraPickCatalog() {
    return buildCameraPickRows().filter(function (row) {
      return matchesSearch(
        (row.title || '') +
          ' ' +
          (row.when || '') +
          ' ' +
          (row.effect || '') +
          ' ' +
          (row.func || '') +
          ' ' +
          (row.pickId || '') +
          ' ' +
          (row.actionId || '')
      );
    });
  }

  /** Soft Pad / external catalogs — only gestures with a user-selected action (no empty commons). */
  function catalogCameraGestures(query, workM) {
    var byRef = {};
    var views = filteredViews('camera');
    if (workM && workM.id) {
      var mid = String(workM.id);
      if (mid && softPadViewsMappingId === mid && Array.isArray(softPadViewsCache)) {
        views = softPadViewsCache.filter(function (v) {
          return viewChannel(v) === 'camera';
        });
      } else if (mid && String(selectedMappingId()) === mid) {
        views = (viewsCache || []).filter(function (v) {
          return viewChannel(v) === 'camera';
        });
      }
    }
    views.forEach(function (v) {
      if (!v || v.enabled === false) return;
      var ref = viewRef(v);
      var aid = viewActionId(v);
      if (!ref || !aid) return;
      byRef[ref] = v;
    });
    var ordered = [];
    Object.keys(byRef).forEach(function (id) {
      var view = byRef[id];
      var copy = CAMERA_PICK_COPY[id] || {};
      var actionId = viewActionId(view);
      var gestureTitle =
        cameraPickField(copy, 'titleZh', 'titleEn') || gestureLabel(id) || id;
      var actLab = actionLabel(actionId);
      ordered.push({
        pickId: id,
        gesture: id,
        view: view,
        actionId: actionId,
        // Primary: the action the user already chose for this app gesture.
        title: actLab || gestureTitle,
        when: gestureTitle,
        effect: cameraPickField(copy, 'effectZh', 'effectEn') || t('keysCameraPickGenericEffect', '执行已绑动作。'),
        func: actLab || gestureTitle,
        how: cameraPickField(copy, 'howZh', 'howEn') || t('keysChannelGesture', '手势'),
        howKind: copy.howKind || 'phrase',
        bindable: bindableByAction[actionId] !== false,
        common: CAMERA_COMMON_REFS.indexOf(id) >= 0
      });
    });
    return ordered.filter(function (row) {
      return catalogQueryMatch(
        (row.title || '') +
          ' ' +
          (row.when || '') +
          ' ' +
          (row.effect || '') +
          ' ' +
          (row.func || '') +
          ' ' +
          (row.pickId || '') +
          ' ' +
          (row.actionId || ''),
        query
      );
    });
  }

  function findCameraPick(pickId) {
    var catalog = buildCameraPickRows();
    var id = String(pickId || '').trim();
    var i;
    for (i = 0; i < catalog.length; i++) {
      if (catalog[i].pickId === id) return catalog[i];
    }
    return catalog[0] || null;
  }

  function renderCameraPickHtml() {
    var raw = cameraPickCatalog();
    var catalog = [];
    var ri;
    for (ri = 0; ri < raw.length; ri++) {
      var row = raw[ri];
      if (pickOptionLabel(row.title, row.actionId, '')) catalog.push(row);
    }
    if (!catalog.length) {
      return (
        '<div class="keys-voice-pick">' +
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysPickOnlySetEmptyCamera',
            '还没有已设按键的手势。先在摄像头里设好并加过按键的，才会出现在这里。'
          )
        ) +
        '</p>' +
        '<p class="keys-voice-pick-escape">' +
        esc(t('keysCameraPickDesignHint', '想先把手势设好？')) +
        ' <button type="button" class="keys-channel-item-link" data-go-camera="1">' +
        esc(t('keysCameraPickGoCamera', '去摄像头设置')) +
        '</button></p></div>'
      );
    }
    syncCameraPickIdFromSelection();
    if (!cameraPickSelectedId || !findCameraPick(cameraPickSelectedId)) {
      cameraPickSelectedId = catalog[0].pickId;
    } else {
      var stillA = false;
      for (ri = 0; ri < catalog.length; ri++) {
        if (catalog[ri].pickId === cameraPickSelectedId) {
          stillA = true;
          break;
        }
      }
      if (!stillA) cameraPickSelectedId = catalog[0].pickId;
    }
    var sel = findCameraPick(cameraPickSelectedId) || catalog[0];
    var commonOpts = '';
    var moreOpts = '';
    var oi;
    for (oi = 0; oi < catalog.length; oi++) {
      var c = catalog[oi];
      var label = pickOptionLabel(c.title, c.actionId, '');
      if (!label) continue;
      var opt =
        '<option value="' +
        esc(c.pickId) +
        '"' +
        (c.pickId === sel.pickId ? ' selected' : '') +
        '>' +
        esc(label) +
        '</option>';
      if (c.common) commonOpts += opt;
      else moreOpts += opt;
    }
    var optsHtml =
      '<optgroup label="' +
      esc(t('keysCameraPickGroupCommon', '常用')) +
      '">' +
      commonOpts +
      '</optgroup>';
    if (moreOpts) {
      optsHtml +=
        '<optgroup label="' +
        esc(t('keysCameraPickGroupMore', '更多')) +
        '">' +
        moreOpts +
        '</optgroup>';
    }
    var primaryLabel = sel.bindable
      ? t('keysCameraPickBtnBind', '给这件事加按键')
      : t('keysCameraPickBtnSetup', '先去摄像头里设好');
    var oneLine = String(sel.effect || sel.func || sel.when || '').trim();
    return (
      '<div class="keys-voice-pick is-select-first" data-camera-pick="1">' +
      '<div class="keys-voice-pick-head">' +
      '<span class="keys-voice-pick-title">' +
      esc(t('keysCameraPickTitle', '手势')) +
      '</span>' +
      '<span class="keys-voice-pick-pill">' +
      esc(t('keysCameraPickPill', '摄像头')) +
      '</span></div>' +
      '<label class="keys-voice-pick-label" for="keysCameraPickSelect">' +
      esc(t('keysCameraPickLabel', '选一件事')) +
      '</label>' +
      '<select id="keysCameraPickSelect" class="keys-voice-pick-select" data-camera-pick-select="1">' +
      optsHtml +
      '</select>' +
      (oneLine
        ? '<p class="keys-voice-pick-card keys-voice-pick-card--one" aria-live="polite">' +
          esc(oneLine) +
          '</p>'
        : '') +
      '<div class="keys-voice-pick-actions">' +
      '<button type="button" class="keys-voice-pick-primary" data-camera-pick-bind="1">' +
      esc(primaryLabel) +
      '</button>' +
      '<button type="button" class="keys-channel-item-link" data-go-camera="1">' +
      esc(t('keysCameraPickGoCamera', '去摄像头设置')) +
      '</button></div></div>'
    );
  }

  function guideToCameraSettings() {
    var mid = selectedMappingId();
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.setPanel) {
      try {
        if (mid) drawer.setPanel('camera', { mappingId: mid });
        else drawer.setPanel('camera');
        return;
      } catch (_) {}
    }
    toast(t('keysCameraPickGoCameraToast', '请打开摄像头设置'));
  }

  function guideToSoftPadSettings() {
    var ctx = resolveSoftPadScope();
    var workMid =
      (ctx && ctx.targetMappingId) ||
      (ctx && ctx.sourceMappingId) ||
      '';
    var drawer = global.OneToneSettingsDrawer;
    if (drawer && drawer.setPanel) {
      try {
        if (workMid) drawer.setPanel('softPad', { mappingId: workMid });
        else drawer.setPanel('softPad');
        return;
      } catch (_) {}
    }
    toast(t('keysChannelGoSoftPad', '去屏幕按钮配置'));
  }

  function persistSoftPadMapping(m) {
    if (!m) return;
    try {
      if (global.OneToneCodexMicroPadUi && global.OneToneCodexMicroPadUi.persist) {
        global.OneToneCodexMicroPadUi.persist();
        return;
      }
    } catch (_) {}
    try {
      if (global.OneToneConfigApi && global.OneToneConfigApi.save) {
        global.OneToneConfigApi.save();
      }
    } catch (_) {}
  }

  function prepareSoftPadScopeScenario(opts) {
    opts = opts || {};
    var silent = !!opts.silent;
    var appId = String(softPadScopeAppId || '').trim();
    if (!appId && isGlobalKeysEditContext()) return;
    var ctx = resolveSoftPadScope();
    var sourceId = ctx && ctx.sourceMappingId ? String(ctx.sourceMappingId) : '';
    var PadUi = global.OneToneCodexMicroPadUi;
    var hub = global.OneToneHabitHub;
    var target = null;

    if (sourceId) {
      target = mappingById(sourceId);
      if (!target) {
        toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
        return;
      }
      if (!target.codexMicroPad) {
        if (!PadUi || typeof PadUi.ensurePad !== 'function') {
          toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
          return;
        }
        PadUi.ensurePad(target, { persist: true });
        persistSoftPadMapping(target);
      }
      softPadScopeMappingIdOverride = String(target.id || '');
      softPadScopeAppId = String(target.appTargetId || appId || softPadScopeAppId);
      if (!silent) {
        toast(
          t('keysSoftPadScopePrepared', '已准备 {app} 虚拟键盘').replace(
            '{app}',
            softPadAppTitle(softPadScopeAppId)
          )
        );
      }
      refresh();
      return;
    }

    // No resolved scenario — create only when none exist for this app.
    var existing = listScenariosForAppTargetId(appId);
    if (existing.length) {
      toast(t('keysSoftPadScopeAmbiguous', '该应用有多个场景，请选择'));
      return;
    }

    if (
      appId === 'codex-chat' &&
      global.OneToneAgentScenarioTemplate &&
      global.OneToneAgentScenarioTemplate.findOrCreateCodexScenario
    ) {
      var res = global.OneToneAgentScenarioTemplate.findOrCreateCodexScenario();
      target = res && res.mapping ? res.mapping : null;
    } else if (hub && hub.createAppScenario) {
      target = hub.createAppScenario(appId);
    }
    if (!target) {
      toast(t('keysSoftPadScopePrepareFail', '无法准备虚拟键盘场景'));
      return;
    }
    if (!target.codexMicroPad && PadUi && typeof PadUi.ensurePad === 'function') {
      PadUi.ensurePad(target, { persist: true });
      persistSoftPadMapping(target);
    }
    softPadScopeMappingIdOverride = String(target.id || '');
    softPadScopeAppId = String(target.appTargetId || appId);
    if (!silent) {
      toast(
        t('keysSoftPadScopePrepared', '已准备 {app} 虚拟键盘').replace(
          '{app}',
          softPadAppTitle(softPadScopeAppId)
        )
      );
    }
    refresh();
  }

  function moreSoftPadScopeApps() {
    var presets = global.OneToneAppTargetPresets;
    var list = (presets && presets.presets) || [];
    var primary = {};
    SOFTPAD_SCOPE_PRIMARY.forEach(function (d) {
      primary[d.appTargetId] = true;
    });
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var id = p && p.id;
      if (!id || primary[id] || id === 'custom') continue;
      out.push({ appTargetId: id, title: softPadAppTitle(id) });
    }
    return out;
  }

  function renderSoftPadScopeChipsHtml(ctx) {
    if (!isGlobalKeysEditContext()) return '';
    var recordLocked = scopeLock === 'record';
    var html =
      '<div class="keys-softpad-scope' +
      (recordLocked ? ' is-record-locked' : '') +
      '" data-softpad-scope="1">' +
      '<p class="keys-softpad-scope-label">' +
      esc(t('keysSoftPadScopeLabel', '虚拟键盘按应用分别配置')) +
      '</p>';
    if (autoPreselectHint && softPadScopeAppId) {
      html +=
        '<p class="keys-softpad-scope-autohint">' +
        esc(
          t(
            'keysSoftPadScopeAutoHint',
            '已根据刚才使用的应用选择 {app}'
          ).replace('{app}', softPadAppTitle(softPadScopeAppId))
        ) +
        ' · ' +
        '<button type="button" class="keys-channel-item-link" data-softpad-scope-change="1">' +
        esc(t('keysSoftPadScopeChange', '更改')) +
        '</button></p>';
    }
    html += '<div class="keys-softpad-scope-chips" role="tablist">';
    SOFTPAD_SCOPE_PRIMARY.forEach(function (d) {
      html += softPadScopeChipHtml(d.appTargetId, t(d.titleKey, d.titleFb), {
        active: softPadScopeAppId === d.appTargetId,
        recordLocked: recordLocked
      });
    });
    moreSoftPadScopeApps().forEach(function (d) {
      html += softPadScopeChipHtml(d.appTargetId, d.title, {
        active: softPadScopeAppId === d.appTargetId,
        recordLocked: recordLocked
      });
    });
    html += '</div></div>';
    return html;
  }


  function softPadKeycapName(microId) {
    var id = String(microId || '').trim();
    if (!id) return '';
    var PadUi = global.OneToneCodexMicroPadUi;
    if (PadUi && typeof PadUi.cellByMicroId === 'function') {
      var cell = PadUi.cellByMicroId(id);
      if (cell) {
        var en = ((global.OneToneI18n && global.OneToneI18n.lang) || 'zh') === 'en';
        var lab = en
          ? cell.uiLabelEn || cell.uiLabelZh
          : cell.uiLabelZh || cell.uiLabelEn;
        if (lab) return String(lab);
      }
    }
    if (PadUi && typeof PadUi.humanMicroKeyLabel === 'function') {
      var hl = String(PadUi.humanMicroKeyLabel(id) || '').trim();
      if (hl) return hl;
    }
    return id;
  }

  function softPadCursorSlotTitle(slotId) {
    var id = String(slotId || '').trim();
    if (!id) return '';
    var copy = CURSOR_PICK_COPY[id];
    if (copy) {
      var title = cursorPickField(copy, 'titleZh', 'titleEn');
      if (title) return title;
    }
    var items = cursorFlatItems();
    var i;
    for (i = 0; i < items.length; i++) {
      if (String(items[i].slotId || '') === id) {
        return cursorItemLabel(items[i]) || '';
      }
    }
    return '';
  }

  function softPadPickCatalog(workM, queryOverride) {
    workM = workM || softPadWorkMapping();
    var out = [];
    var seen = {};
    function pushMicro(microId) {
      var id = String(microId || '').trim();
      if (!id || seen[id]) return;
      var resolved = resolveMigratableAction(workM, id);
      if (!resolved || !resolved.actionId) return;
      var chord = softPadPickChord(workM, resolved);
      if (!chord) return;
      seen[id] = true;
      var keyName = softPadKeycapName(id);
      var route = routeOnPad(workM && workM.codexMicroPad, id);
      var slotId = route && route.enabled !== false ? String(route.slotId || '').trim() : '';
      var PadUi = global.OneToneCodexMicroPadUi;
      var copy =
        PadUi && typeof PadUi.capabilityCardCopy === 'function' && slotId
          ? PadUi.capabilityCardCopy(slotId, workM)
          : null;
      var aid = canonicalActionId(resolved.actionId);
      // app.shortcut meta label is always「应用快捷键」— use slot / keycap title instead.
      var name =
        (copy && String(copy.title || '').trim()) ||
        softPadCursorSlotTitle(slotId) ||
        (aid && aid !== 'app.shortcut' ? actionLabel(aid) : '') ||
        (keyName && keyName !== id ? keyName : '') ||
        (chord ? friendlyChord(chord) || chord : '') ||
        id;
      var effect =
        (copy && String(copy.result || '').trim()) ||
        (PadUi && typeof PadUi.slotEffectTip === 'function' && slotId
          ? String(PadUi.slotEffectTip(slotId, name, workM) || '').trim()
          : '') ||
        t('keysSoftPadPickBenefit', '不用点屏幕也能触发已配置的「{name}」').replace(
          '{name}',
          name
        );
      var tip = t(
        'keysSoftPadPickTip',
        '点「给这件事加按键」录制识别键；之后按该键 = Soft Pad「{key}」'
      ).replace('{key}', keyName || name);
      var hay = name + ' ' + keyName + ' ' + effect + ' ' + tip + ' ' + id + ' ' + resolved.actionId;
      if (queryOverride != null) {
        if (!catalogQueryMatch(hay, queryOverride)) return;
      } else if (!matchesSearch(hay)) {
        return;
      }
      out.push({
        pickId: id,
        microKeyId: id,
        actionId: resolved.actionId,
        actionInstanceId: resolved.actionInstanceId || '',
        actionArgs: resolved.actionArgs,
        keyBindingRef: resolved.keyBindingRef || '',
        chord: chord,
        name: name,
        keyName: keyName,
        tip: tip,
        effect: effect
      });
    }
    var pad = workM && workM.codexMicroPad;
    var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
    var i;
    for (i = 0; i < keys.length; i++) {
      if (keys[i] && keys[i].enabled !== false) pushMicro(keys[i].microKeyId);
    }
    softPadViewsForResolve(workM && workM.id).forEach(function (v) {
      pushMicro(viewRef(v));
      pushMicro(viewTrigger(v));
    });
    return out;
  }

  function findSoftPadPick(pickId) {
    var workM = softPadWorkMapping();
    var catalog = softPadPickCatalog(workM);
    var id = String(pickId || '').trim();
    var i;
    for (i = 0; i < catalog.length; i++) {
      if (catalog[i].pickId === id) return catalog[i];
    }
    return catalog[0] || null;
  }

  function syncSoftPadPickIdFromSelection() {
    if (!selection || selection.sourceChannel !== 'softPad') return;
    if (findSoftPadPick(selection.sourceBindingRef)) {
      softPadPickSelectedId = selection.sourceBindingRef;
    }
  }

  function applySoftPadPickBind() {
    var row = findSoftPadPick(softPadPickSelectedId);
    if (!row) return;
    var ctx = resolveSoftPadScope();
    if (!ctx || !ctx.targetMappingId) {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return;
    }
    var already = selectionMatchesPick('softPad', row.microKeyId);
    if (!already) {
      softPadPickSelectedId = row.pickId;
      previewPickSelection('softPad');
      renderPanelOnly();
    }
    if (!canRecordSoftPadSelection(ctx)) {
      toast(t('keysSoftPadCapLoading', '正在加载此场景的可绑定键位…'));
      return;
    }
    var m = softPadWorkMapping();
    var keyB = findKeyBinding(m, row.actionId, row.actionInstanceId || '');
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    selectionToast(row.name, !!chord);
    // Select only — 录制快捷键 via keycap / [data-softpad-record] / Alt·Shift click.
  }

  function softPadPreviewFrameHtml(workM, opts) {
    opts = opts || {};
    var PadUi = global.OneToneCodexMicroPadUi;
    if (!PadUi || typeof PadUi.renderHardwarePad !== 'function') return '';
    var pad = opts.stub
      ? softPadDefaultPreviewPad()
      : previewPadClone(workM);
    var map = opts.stub
      ? softPadPreviewStubMapping((workM && workM.appTargetId) || softPadScopeAppId)
      : workM;
    return (
      '<div id="keysSoftPadPickHost" class="keys-softpad-pick-host keys-softpad-pick-host--mini' +
      (opts.stub ? ' is-preview-only' : '') +
      '"' +
      (opts.stub ? ' aria-hidden="true"' : '') +
      '>' +
      PadUi.renderHardwarePad(map, pad, {
        mode: 'softPad',
        compact: true,
        omitFaceTopbar: true
      }) +
      '</div>'
    );
  }

  function renderSoftPadNeedPrepareHtml(ctx) {
    var appTitle = (ctx && ctx.title) || softPadAppTitle(softPadScopeAppId) || '';
    var stubMap = softPadPreviewStubMapping(ctx && ctx.appTargetId);
    return (
      '<div class="keys-voice-pick is-select-first keys-softpad-pick" data-softpad-pick="1">' +
      '<div class="keys-voice-pick-head">' +
      '<span class="keys-voice-pick-title">' +
      esc(t('keysSoftPadPickTitle', '屏幕按钮')) +
      '</span>' +
      (appTitle
        ? '<span class="keys-voice-pick-pill">' +
          esc(t('keysSoftPadPickPill', '正在用 · {app}').replace('{app}', appTitle)) +
          '</span>'
        : '') +
      '</div>' +
      softPadPreviewFrameHtml(stubMap, { stub: true }) +
      '<p class="keys-channel-empty">' +
      esc(
        t(
          'keysSoftPadCapNeedPrepareBody',
          '先准备 {app} 虚拟键盘，再选择已配置键绑定识别键。'
        ).replace('{app}', appTitle)
      ) +
      '</p>' +
      '<div class="keys-voice-pick-actions">' +
      '<button type="button" class="keys-voice-pick-primary" data-softpad-prepare="1">' +
      esc(
        t('keysSoftPadScopePrepare', '准备 {app} 虚拟键盘').replace('{app}', appTitle)
      ) +
      '</button></div></div>'
    );
  }

  function renderSoftPadPickHtml(ctx, workM) {
    var workMid = workM ? String(workM.id || '') : '';
    var appTitle = (ctx && ctx.title) || softPadAppTitle(workM && workM.appTargetId) || '';
    if (softPadAuthorityPending(workMid)) {
      return (
        '<div class="keys-voice-pick is-list keys-softpad-pick" data-softpad-pick="1">' +
        softPadPreviewFrameHtml(workM, {}) +
        '<p class="keys-channel-empty">' +
        esc(t('keysSoftPadCapLoading', '正在加载此场景的可绑定键位…')) +
        '</p></div>'
      );
    }
    var catalog = softPadPickCatalog(workM);
    var ci;
    for (ci = 0; ci < catalog.length; ci++) {
      var gm = softPadPickGroupMeta(catalog[ci]);
      catalog[ci].groupId = gm.id;
      catalog[ci].groupTitle = gm.title;
    }
    if (!catalog.length) {
      return (
        '<div class="keys-voice-pick is-list keys-softpad-pick" data-softpad-pick="1">' +
        '<div class="keys-voice-pick-head">' +
        '<span class="keys-voice-pick-title">' +
        esc(t('keysSoftPadPickTitle', '屏幕按钮')) +
        '</span>' +
        (appTitle
          ? '<span class="keys-voice-pick-pill">' +
            esc(t('keysSoftPadPickPill', '正在用 · {app}').replace('{app}', appTitle)) +
            '</span>'
          : '') +
        '</div>' +
        softPadPreviewFrameHtml(workM, {}) +
        '<p class="keys-channel-empty">' +
        esc(emptyCopy('softPad')) +
        '</p>' +
        '<p class="keys-voice-pick-escape">' +
        '<button type="button" class="keys-channel-item-link" data-go-softpad="1">' +
        esc(t('keysSoftPadPickGoPad', '去屏幕按钮看布局')) +
        '</button></p></div>'
      );
    }
    syncSoftPadPickIdFromSelection();
    if (!softPadPickSelectedId || !findSoftPadPick(softPadPickSelectedId)) {
      softPadPickSelectedId = catalog[0].pickId;
    }
    var sel = findSoftPadPick(softPadPickSelectedId) || catalog[0];
    var tabs = [];
    var tabSeen = {};
    var order = ['dictation', 'send', 'cancel', 'app', 'more'];
    var oi;
    var ri;
    for (oi = 0; oi < order.length; oi++) {
      for (ri = 0; ri < catalog.length; ri++) {
        if (catalog[ri].groupId === order[oi] && !tabSeen[order[oi]]) {
          tabSeen[order[oi]] = true;
          tabs.push({ id: order[oi], title: catalog[ri].groupTitle });
        }
      }
    }
    for (ri = 0; ri < catalog.length; ri++) {
      if (!tabSeen[catalog[ri].groupId]) {
        tabSeen[catalog[ri].groupId] = true;
        tabs.push({ id: catalog[ri].groupId, title: catalog[ri].groupTitle });
      }
    }
    softPadPickSubtabId = pickSubtabResolve(
      tabs,
      softPadPickSubtabId,
      sel && sel.groupId
    );
    var rowsHtml = '';
    for (ri = 0; ri < catalog.length; ri++) {
      var c = catalog[ri];
      if (c.groupId !== softPadPickSubtabId) continue;
      var on = c.pickId === sel.pickId;
      var chord = String(c.chord || '').trim();
      rowsHtml +=
        '<button type="button" class="keys-voice-pick-row' +
        (on ? ' is-selected' : '') +
        '" data-softpad-pick-row="' +
        esc(c.pickId) +
        '">' +
        '<span class="keys-voice-pick-row-name">' +
        esc(c.name) +
        '</span>' +
        (chord
          ? '<span class="keys-cursor-pick-chord">' +
            esc(friendlyChord(chord) || chord) +
            '</span>'
          : '') +
        '</button>';
    }
    var canRecord =
      softPadAuthorityReady(workMid) && bindableByAction[sel.actionId] === true;
    return (
      '<div class="keys-voice-pick is-list keys-softpad-pick" data-softpad-pick="1">' +
      '<div class="keys-voice-pick-head">' +
      '<span class="keys-voice-pick-title">' +
      esc(t('keysSoftPadPickTitle', '屏幕按钮')) +
      '</span>' +
      (appTitle
        ? '<span class="keys-voice-pick-pill">' +
          esc(t('keysSoftPadPickPill', '正在用 · {app}').replace('{app}', appTitle)) +
          '</span>'
        : '') +
      '</div>' +
      softPadPreviewFrameHtml(workM, {}) +
      '<p class="keys-voice-pick-lead">' +
      esc(t('keysSoftPadPickLead', '选一个垫上已有的按钮，点一条开始录键。')) +
      '</p>' +
      renderPickSubtabsHtml(tabs, softPadPickSubtabId, 'softPad') +
      '<div class="keys-cursor-pick-list keys-softpad-pick-list">' +
      rowsHtml +
      '</div>' +
      (!canRecord
        ? '<p class="keys-voice-pick-escape">' +
          esc(t('keysSoftPadPickNeedAuth', '此键暂不可录识别键')) +
          '</p>'
        : '') +
      '</div>'
    );
  }

  function renderSoftPadCapHtml(ctx, opts) {
    opts = opts || {};
    var missing = !!(opts.missing || (ctx && ctx.missingScenario));
    var html = '<aside class="keys-softpad-cap" id="keysSoftPadCap">';
    if (missing) {
      html +=
        '<p class="keys-softpad-cap-title">' +
        esc(t('keysSoftPadCapNeedPrepareTitle', '尚未准备')) +
        '</p>' +
        '<p class="keys-softpad-cap-body">' +
        esc(
          t(
            'keysSoftPadCapNeedPrepareBody',
            '先准备 {app} 虚拟键盘，再点选键帽绑定识别键。'
          ).replace('{app}', (ctx && ctx.title) || '')
        ) +
        '</p>' +
        '<button type="button" class="keys-channel-go-softpad" data-softpad-prepare="1">' +
        esc(
          t('keysSoftPadScopePrepare', '准备 {app} 虚拟键盘').replace(
            '{app}',
            (ctx && ctx.title) || ''
          )
        ) +
        '</button>';
      if (ctx && ctx.sourceMappingId) {
        html +=
          '<button type="button" class="keys-channel-item-link" data-go-softpad="1">' +
          esc(
            t('keysSoftPadScopeManage', '管理 {app} 虚拟键盘').replace(
              '{app}',
              (ctx && ctx.title) || ''
            )
          ) +
          '</button>';
      }
      html += '</aside>';
      return html;
    }

    var selOk =
      selection &&
      selection.sourceChannel === 'softPad' &&
      selection.actionId &&
      ctx &&
      ctx.targetMappingId &&
      selection.mappingId === ctx.targetMappingId;

    if (!selOk) {
      html +=
        '<p class="keys-softpad-cap-title">' +
        esc(t('keysSoftPadCapEmptyTitle', '键帽能力')) +
        '</p>' +
        '<p class="keys-softpad-cap-body keys-softpad-cap-body--emphasis">' +
        esc(t('keysSoftPadCapEmpty', '点击左侧键帽查看能力')) +
        '</p>';
      html += '</aside>';
      return html;
    }

    var m = softPadWorkMapping();
    var keyB = findKeyBinding(m, selection.actionId, selection.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var chordText = chord
      ? friendlyChord(chord)
      : t('keysHeroActionNeedsKey', '待设置快捷键');
    var label = actionLabel(selection.actionId);
    html +=
      '<p class="keys-softpad-cap-kicker">' +
      esc((ctx && ctx.title) || softPadAppTitle(softPadScopeAppId)) +
      '</p>';
    if (selection.iconHtml) {
      html +=
        '<div class="keys-softpad-cap-icon" aria-hidden="true">' +
        selection.iconHtml +
        '</div>';
    }
    html +=
      '<p class="keys-softpad-cap-title">' +
      esc(label) +
      '</p>' +
      '<p class="keys-softpad-cap-chord' +
      (chord ? '' : ' is-pending') +
      '">' +
      esc(chordText) +
      '</p>' +
      '<p class="keys-softpad-cap-body">' +
      esc(
        t(
          'keysSoftPadCapBindHint',
          '将此能力绑定到实体识别键后即可触发'
        )
      ) +
      '</p>' +
      (canRecordSoftPadSelection(ctx)
        ? '<button type="button" class="keys-channel-go-softpad" data-softpad-record="1">' +
          esc(t('keysSoftPadCapRecord', '录制识别键')) +
          '</button>'
        : '');
    html += '</aside>';
    return html;
  }

  function softPadDefaultPreviewPad() {
    return {
      enabled: true,
      skin: 'default',
      keys: [],
      showNavigationPad: true,
      presentation: 'full'
    };
  }

  function softPadPreviewStubMapping(appId) {
    return {
      id: '',
      appTargetId: String(appId || ''),
      agentBindings: [],
      codexMicroPad: softPadDefaultPreviewPad()
    };
  }

  function renderSoftPadPreviewOnlyHtml(ctx) {
    var appId = (ctx && ctx.appTargetId) || softPadScopeAppId;
    var stub = softPadPreviewStubMapping(appId);
    var PadUi = global.OneToneCodexMicroPadUi;
    var html =
      '<div class="keys-softpad-stage">' +
      '<div id="keysSoftPadPickHost" class="keys-softpad-pick-host is-preview-only" aria-hidden="true">';
    if (PadUi && typeof PadUi.renderHardwarePad === 'function') {
      html += PadUi.renderHardwarePad(stub, softPadDefaultPreviewPad(), {
        mode: 'softPad',
        compact: false
      });
    }
    html += '</div>' + renderSoftPadCapHtml(ctx, { missing: true }) + '</div>';
    return html;
  }

  function disableAllSoftPadPickKeys(host) {
    if (!host || !host.querySelectorAll) return;
    host.querySelectorAll('[data-micro-key]').forEach(function (el) {
      el.classList.remove('is-bound', 'is-focused', 'is-pressed', 'is-active');
      el.classList.add('is-disabled');
      el.setAttribute('aria-disabled', 'true');
      el.tabIndex = -1;
      if (el.getAttribute('role') === 'switch') {
        el.removeAttribute('role');
        el.removeAttribute('aria-checked');
      }
    });
  }

  function countMigratableSoftPadKeys(m) {
    var pad = m && m.codexMicroPad;
    var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
    var n = 0;
    var seen = {};
    for (var i = 0; i < keys.length; i++) {
      var id = keys[i] && keys[i].microKeyId;
      if (!id || seen[id]) continue;
      seen[id] = true;
      if (resolveMigratableAction(m, id)) n++;
    }
    softPadViewsForResolve().forEach(function (v) {
      var ref = viewRef(v);
      var trig = viewTrigger(v);
      [ref, trig].forEach(function (cand) {
        if (!cand || seen[cand]) return;
        if (resolveMigratableAction(m, cand)) {
          seen[cand] = true;
          n++;
        }
      });
    });
    return n;
  }

  function retargetSoftPadPickKeys(host, m) {
    if (!host || !host.querySelectorAll) return;
    var workMid = m && m.id ? String(m.id) : '';
    host.querySelectorAll('[data-micro-key]').forEach(function (el) {
      var id = el.getAttribute('data-micro-key') || '';
      var resolved = resolveMigratableAction(m, id);
      var keyName =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        id ||
        t('keysChannelPadKey', '键位');
      el.classList.remove('is-bound', 'is-focused', 'is-pressed', 'is-active');
      if (id === 'ENC') {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        el.setAttribute(
          'title',
          t('keysSoftPadKeyEncDisabled', '电源旋钮不可用于识别绑定')
        );
        el.setAttribute(
          'aria-label',
          keyName + ' · ' + t('keysSoftPadKeyEncDisabled', '电源旋钮不可用于识别绑定')
        );
        return;
      }
      if (id === 'JOY' || /^NAV_/.test(id)) {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        el.setAttribute(
          'title',
          t('keysSoftPadKeyNavDisabled', '导航键不可用于识别绑定')
        );
        el.setAttribute(
          'aria-label',
          keyName +
            ' · ' +
            t('keysSoftPadKeyNavDisabled', '导航键不可用于识别绑定')
        );
        return;
      }
      if (resolved) {
        el.classList.add('is-bound');
        el.classList.remove('is-disabled');
        el.removeAttribute('aria-disabled');
        el.removeAttribute('disabled');
        if (el.tagName === 'BUTTON') el.tabIndex = 0;
        el.removeAttribute('title');
        if (
          selection &&
          selection.mappingId === workMid &&
          selection.sourceChannel === 'softPad' &&
          selection.sourceBindingRef === id
        ) {
          el.classList.add('is-focused');
        }
      } else {
        el.classList.add('is-disabled');
        el.setAttribute('aria-disabled', 'true');
        el.tabIndex = -1;
        var uncfg = t('keysSoftPadKeyUnconfigured', '未配置，不可选择');
        el.setAttribute('title', keyName + ' · ' + uncfg);
        el.setAttribute('aria-label', keyName + ' · ' + uncfg);
        if (el.getAttribute('role') === 'switch') {
          el.removeAttribute('role');
          el.removeAttribute('aria-checked');
        }
      }
    });
  }

  function scenarioStatusLabel(m) {
    var en = scenarioIsEnabled(m)
      ? t('keysSoftPadScenarioEnabled', '已启用')
      : t('keysSoftPadScenarioDisabled', '已停用');
    var pad = scenarioPadSwitchOn(m)
      ? t('keysSoftPadScenarioPadOn', '虚拟键盘开启')
      : scenarioHasPad(m)
        ? t('keysSoftPadScenarioPadOff', '虚拟键盘关闭')
        : t('keysSoftPadScenarioPadMissing', '虚拟键盘未准备');
    return en + ' · ' + pad;
  }

  function scenarioDisplayName(m) {
    if (!m) return '';
    if (global.OneToneHabitProfile && global.OneToneHabitProfile.habitDisplayName) {
      try {
        var title = String(global.OneToneHabitProfile.habitDisplayName(m) || '').trim();
        if (title && title !== '—') return title;
      } catch (_) {}
    }
    return String(m.group || m.label || m.name || m.id || '').trim();
  }

  function renderSoftPadSecondaryHtml(workMid, workM, bridges, footer, ctx) {
    var html = '<div class="keys-softpad-secondary">';
    if (softPadAuthorityPending(workMid)) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(t('keysSoftPadCapLoading', '正在加载此场景的可绑定键位…')) +
        '</p>';
    }
    var migratable = countMigratableSoftPadKeys(workM);
    if (!softPadAuthorityPending(workMid) && !migratable) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(emptyCopy('softPad')) +
        '</p>';
    } else if (!softPadAuthorityPending(workMid) && ctx && ctx.globalProxy && ctx.title) {
      html +=
        '<p class="keys-softpad-scope-hint">' +
        esc(
          t(
            'keysSoftPadScopePickHint',
            '选择键帽后，将为 {app} 配置实体快捷键'
          ).replace('{app}', ctx.title)
        ) +
        '</p>';
    }
    if (ctx && (ctx.targetMappingId || ctx.sourceMappingId)) {
      html +=
        '<button type="button" class="keys-channel-go-softpad" data-go-softpad="1">' +
        esc(
          t('keysSoftPadScopeManage', '管理 {app} 虚拟键盘').replace(
            '{app}',
            (ctx && ctx.title) || softPadAppTitle(workM && workM.appTargetId)
          )
        ) +
        '</button>';
    }
    var canAddShortcut = !!(workM && String(workM.appTargetId || '').trim());
    var bi;
    for (bi = 0; bi < bridges.length; bi++) {
      var br = bridges[bi];
      html += renderBindRowHtml({
        mid: workMid,
        m: workM,
        actionId: br.actionId,
        bindingRef: br.bindingRef,
        name: br.name,
        sub: br.sub,
        offerIme: br.offerIme,
        actionInstanceId: br.actionInstanceId || '',
        channel: 'softPad',
        actionArgsChord:
          br.actionArgs && br.actionArgs.chord ? String(br.actionArgs.chord) : ''
      });
    }
    if (canAddShortcut && footer && footer.kind === 'add-app-shortcut') {
      html +=
        '<button type="button" class="keys-channel-add-shortcut keys-channel-add-shortcut--compact" data-add-app-shortcut="1">' +
        esc(footer.label) +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderSoftPadKeyboardPanel(panel) {
    if (panel.classList) panel.classList.add('is-softpad-pick');
    ensureSoftPadDefaultScope();
    var ctx = resolveSoftPadScope();
    var html = '';
    if (isGlobalKeysEditContext()) {
      html += renderSoftPadScopeChipsHtml(ctx);
    }

    if (isGlobalKeysEditContext() && !softPadScopeAppId) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysSoftPadScopeNeedPick',
            '虚拟键盘按应用生效，请先选择要配置的应用。'
          )
        ) +
        '</p>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(false);
      return;
    }

    if (ctx && ctx.missingScenario) {
      if (isKnownSoftPadAppTargetId(ctx.appTargetId || softPadScopeAppId)) {
        prepareSoftPadScopeScenario({ silent: true });
        var afterCtx = resolveSoftPadScope();
        if (afterCtx && !afterCtx.missingScenario) {
          return;
        }
        ctx = afterCtx || ctx;
      }
      html += renderSoftPadNeedPrepareHtml(ctx);
      panel.innerHTML = html;
      syncSoftPadTargetChrome(true);
      return;
    }

    if (ctx && ctx.ambiguous) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(
          t(
            'keysSoftPadScopeAmbiguous',
            '此应用有多个 SoftPad 场景，请选择要加载的场景'
          )
        ) +
        '</p>' +
        '<div class="keys-softpad-scope-scenarios">';
      (ctx.scenarios || []).forEach(function (sc) {
        if (!sc || !sc.id) return;
        html +=
          '<button type="button" class="keys-softpad-scenario-option" data-softpad-scope-mapping="' +
          esc(String(sc.id)) +
          '">' +
          '<span class="keys-softpad-scenario-option__name">' +
          esc(scenarioDisplayName(sc)) +
          '</span>' +
          '<span class="keys-softpad-scenario-option__status">' +
          esc(scenarioStatusLabel(sc)) +
          '</span>' +
          '</button>';
      });
      html += '</div>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(true);
      return;
    }

    var workM = softPadWorkMapping();
    var workMid = workM ? String(workM.id || '') : '';
    if (!workM || !workMid) {
      html +=
        '<p class="keys-channel-empty">' +
        esc(emptyCopy('softPad')) +
        '</p>';
      panel.innerHTML = html;
      syncSoftPadTargetChrome(true);
      return;
    }

    html += renderSoftPadPickHtml(ctx, workM);
    panel.innerHTML = html;
    retargetSoftPadPickKeys(panel, workM);
    // Sync 02 preview only — browsing Soft Pad must not overwrite another channel's hero.
    if (softPadPickCatalog(workM).length) {
      previewPickSelection('softPad', { skipPersist: true });
    }
    syncSoftPadTargetChrome(true);
  }

  function syncSoftPadTargetChrome(active) {
    var row = document.getElementById('habitKeyMapRowTarget');
    if (row && row.classList) {
      row.classList.toggle('is-softpad-channel', !!active && openPanels.softPad);
    }
  }

  function renderBindRowHtml(opts) {
    var mid = opts.mid;
    var m = opts.m;
    var actionId = opts.actionId;
    var ref = opts.bindingRef;
    var name = opts.name;
    var sub = opts.sub;
    var offerIme = !!opts.offerIme;
    var channel = opts.channel || 'voice';
    var actionInstanceId = String(opts.actionInstanceId || '');
    var bindable = bindableByAction[actionId];
    if (bindable === undefined) bindable = true;
    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var selected =
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === channel &&
      selection.sourceBindingRef === ref;
    var disabled = !bindable;
    var heroRef = captureHeroRefForMapping(m);
    var heroMapped = heroRefMatches(heroRef, {
      channel: channel,
      bindingRef: ref,
      actionId: actionId,
      actionInstanceId: actionInstanceId
    });
    var html =
      '<div class="keys-channel-item-wrap' +
      (selected ? ' is-selected' : '') +
      (heroMapped ? ' is-hero-mapped' : '') +
      (disabled ? ' is-disabled' : '') +
      '">' +
      '<button type="button" class="keys-channel-item' +
      (selected ? ' is-selected' : '') +
      (disabled ? ' is-disabled' : '') +
      '" data-channel-item="1" data-channel="' +
      esc(channel) +
      '" data-binding-ref="' +
      esc(ref) +
      '" data-action-id="' +
      esc(actionId) +
      '"' +
      (actionInstanceId
        ? ' data-action-instance-id="' + esc(actionInstanceId) + '"'
        : '') +
      (opts.actionArgsChord
        ? ' data-action-args-chord="' + esc(opts.actionArgsChord) + '"'
        : '') +
      (disabled ? ' disabled aria-disabled="true"' : '') +
      '>' +
      '<span class="keys-channel-item-name">' +
      esc(name) +
      '</span>' +
      '<span class="keys-channel-item-key">' +
      esc(
        disabled
          ? channelOnlyLabel(channel)
          : chord
            ? friendlyChord(chord)
            : t('keysHeroActionNeedsKey', '待设置快捷键')
      ) +
      '</span>' +
      '<span class="keys-channel-item-sub">' +
      esc(sub) +
      '</span>' +
      (heroMapped
        ? '<span class="keys-channel-item-hero-tag">' +
          esc(t('keysCaptureHeroMapped', '已映射到识别按钮')) +
          '</span>'
        : '') +
      '</button>';
    if (offerIme) {
      html +=
        '<button type="button" class="keys-channel-item-link" data-bridge-ime="1">' +
        esc(t('keysVoiceBridgeGoIme', '改用输入法识别键')) +
        '</button>';
    }
    html += '</div>';
    return html;
  }

  function renderGuideFinishHtml(bridge) {
    return (
      '<button type="button" class="keys-channel-item keys-channel-item--guide" data-guide-finish="1" data-binding-ref="' +
      esc(bridge.bindingRef) +
      '">' +
      '<span class="keys-channel-item-name">' +
      esc(bridge.name) +
      '</span>' +
      '<span class="keys-channel-item-key">' +
      esc(t('keysVoiceBridgeGoFinish', '去快捷键收尾')) +
      '</span>' +
      '<span class="keys-channel-item-sub">' +
      esc(bridge.sub) +
      '</span>' +
      '</button>'
    );
  }

  function renderListChannelHtml(ch, opts) {
    opts = opts || {};
    if (ch === 'voice') {
      return renderVoicePickHtml();
    }
    var mid = selectedMappingId();
    var m = mappingById(mid);
    var pack = rowsForTab(ch);
    var bridges = pack.bridges || [];
    var rows = pack.views || [];
    var footer = pack.footer;
    if (!bridges.length && !rows.length && !footer) {
      return '<p class="keys-channel-empty">' + esc(emptyCopy(ch)) + '</p>';
    }
    var html = '<p class="keys-channel-group-label">' + esc(channelTabLabel(ch)) + '</p>';
    var bi;
    for (bi = 0; bi < bridges.length; bi++) {
      var br = bridges[bi];
      if (!matchesSearch(br.name + ' ' + (br.sub || '') + ' ' + (br.actionId || ''))) continue;
      if (br.kind === 'guide-finish') {
        html += renderGuideFinishHtml(br);
      } else {
        html += renderBindRowHtml({
          mid: mid,
          m: m,
          actionId: br.actionId,
          bindingRef: br.bindingRef,
          name: br.name,
          sub: br.sub,
          offerIme: br.offerIme,
          actionInstanceId: br.actionInstanceId || '',
          channel: ch,
          actionArgsChord:
            br.actionArgs && br.actionArgs.chord ? String(br.actionArgs.chord) : ''
        });
      }
    }
    var i;
    for (i = 0; i < rows.length; i++) {
      var v = rows[i];
      var actionId = viewActionId(v);
      var ref = viewRef(v);
      var rowName = actionLabel(actionId);
      var rowSub = sourceSubline(ch, v);
      if (!matchesSearch(rowName + ' ' + rowSub + ' ' + actionId)) continue;
      var bindable = bindableByAction[actionId];
      if (bindable === undefined) bindable = true;
      var keyB = findKeyBinding(m, actionId);
      var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
      var selected =
        selection &&
        selection.mappingId === mid &&
        selection.sourceChannel === ch &&
        selection.sourceBindingRef === ref;
      var disabled = !bindable;
      var heroRef = captureHeroRefForMapping(m);
      var heroMapped = heroRefMatches(heroRef, {
        channel: ch,
        bindingRef: ref,
        actionId: actionId,
        actionInstanceId: ''
      });
      html +=
        '<button type="button" class="keys-channel-item' +
        (selected ? ' is-selected' : '') +
        (heroMapped ? ' is-hero-mapped' : '') +
        (disabled ? ' is-disabled' : '') +
        '" data-channel-item="1" data-channel="' +
        esc(ch) +
        '" data-binding-ref="' +
        esc(ref) +
        '" data-action-id="' +
        esc(actionId) +
        '"' +
        (disabled ? ' disabled aria-disabled="true"' : '') +
        '>' +
        '<span class="keys-channel-item-name">' +
        esc(rowName) +
        '</span>' +
        '<span class="keys-channel-item-key">' +
        esc(
          disabled
            ? channelOnlyLabel(ch)
            : chord
              ? friendlyChord(chord)
              : t('keysHeroActionNeedsKey', '待设置快捷键')
        ) +
        '</span>' +
        '<span class="keys-channel-item-sub">' +
        esc(rowSub) +
        '</span>' +
        (heroMapped
          ? '<span class="keys-channel-item-hero-tag">' +
            esc(t('keysCaptureHeroMapped', '已映射到识别按钮')) +
            '</span>'
          : '') +
        '</button>';
    }
    if (footer && footer.kind === 'add-app-shortcut') {
      html +=
        '<button type="button" class="keys-channel-add-shortcut" data-add-app-shortcut="1">' +
        esc(footer.label) +
        '</button>';
    }
    return html || '<p class="keys-channel-empty">' + esc(emptyCopy(ch)) + '</p>';
  }

  function catalogQueryMatch(hay, query) {
    query = String(query || '').trim().toLowerCase();
    if (!query) return true;
    return String(hay || '').toLowerCase().indexOf(query) >= 0;
  }

  /** Soft Pad / Keys share app peers — resolve cursor-chat even when mapping.appTargetId is empty. */
  function resolveCatalogAppTargetId(appTargetIdOrMapping) {
    var appId = '';
    if (appTargetIdOrMapping && typeof appTargetIdOrMapping === 'object') {
      appId = String(appTargetIdOrMapping.appTargetId || '').trim();
    } else {
      appId = String(appTargetIdOrMapping || '').trim();
    }
    if (appId) return appId;
    try {
      var Hub = global.OneToneSoftPadHub;
      if (Hub && typeof Hub.getSelectedScopeId === 'function') {
        var kind = String(Hub.getSelectedScopeId() || '').trim();
        if (kind && kind !== 'universal' && kind !== 'global' && typeof Hub.appIdForKind === 'function') {
          appId = String(Hub.appIdForKind(kind) || '').trim();
        }
      }
    } catch (_) {}
    return appId;
  }

  /** Soft Pad layout slots — voice seeds that should not appear as「口头指令」. */
  function isSoftPadLayoutVoiceSlot(workM, slotId) {
    slotId = String(slotId || '').trim();
    if (!slotId || !workM) return false;
    if (/^cursorBeginner/i.test(slotId)) return true;
    if (slotId === 'agent.continue' || slotId === 'app.open') return true;
    var pad = workM.codexMicroPad;
    var keys = pad && Array.isArray(pad.keys) ? pad.keys : [];
    var i;
    for (i = 0; i < keys.length; i++) {
      if (keys[i] && String(keys[i].slotId || '').trim() === slotId) return true;
    }
    var customs = pad && Array.isArray(pad.customShortcuts) ? pad.customShortcuts : [];
    for (i = 0; i < customs.length; i++) {
      if (customs[i] && String(customs[i].id || '').trim() === slotId) return true;
    }
    return false;
  }

  function catalogCustomKeysForApp(appTargetIdOrMapping, query) {
    var out = [];
    var appId = resolveCatalogAppTargetId(appTargetIdOrMapping);
    var mappings = Array.isArray(config().mappings) ? config().mappings : [];
    var i;
    for (i = 0; i < mappings.length; i++) {
      var cm = mappings[i];
      if (!cm || !cm.id) continue;
      if (String(cm.appTargetId || '').trim() !== appId) continue;
      if (!isCustomKeyMatchMapping(cm, { editId: '' })) continue;
      var name = customKeyMatchDisplayName(cm);
      var chord = String(cm.triggerKey || '').trim();
      var acts = Array.isArray(cm.targetActions) ? cm.targetActions.length : 0;
      if (!catalogQueryMatch(name + ' ' + chord + ' ' + acts, query)) continue;
      out.push({
        mappingId: String(cm.id),
        name: name,
        chord: chord,
        note: chord
          ? friendlyChord(chord) || chord
          : t('keysCustomKeyMatchEmptyTrigger', '待录触发键'),
        stepCount: acts
      });
    }
    return out;
  }

  /**
   * SoftPad「口头指令」：对齐语音设置「口头指令」方案（一词注入），去重同文案。
   * SoftPad 自定义快捷键上用户填过的口令也收录。不扫 Soft Pad / 软件自带种子绑定。
   */
  function catalogVoicePromptsForMapping(workM, query) {
    if (!workM) return [];
    var out = [];
    var seenPick = {};
    var seenSay = {};
    var appId = resolveCatalogAppTargetId(workM);
    var pad = workM.codexMicroPad;

    function push(row) {
      if (!row) return;
      var key = String(row.pickId || '');
      if (!key || seenPick[key]) return;
      var sayKey = String(row.say || '')
        .trim()
        .toLowerCase();
      // Deduplicate identical prompt bodies (orphan peers).
      if (sayKey && seenSay[sayKey]) return;
      if (
        !catalogQueryMatch(
          (row.name || '') + ' ' + (row.say || '') + ' ' + (row.func || ''),
          query
        )
      ) {
        return;
      }
      seenPick[key] = 1;
      if (sayKey) seenSay[sayKey] = 1;
      out.push(row);
    }

    // 1) 语音设置 · 口头指令（一词注入 peers）
    var maps = Array.isArray(config().mappings) ? config().mappings : [];
    var mi;
    for (mi = 0; mi < maps.length; mi++) {
      var cm = maps[mi];
      if (!cm || !cm.id) continue;
      if (String(cm.appTargetId || '').trim() !== appId) continue;
      if (!isPromptInjectMapping(cm)) continue;
      var text = String(promptTextFromMapping(cm) || '').trim();
      if (!text) continue;
      var label = String(cm.label || '').trim();
      if (!label || label === text || label.length > 18) {
        label = text.length > 18 ? text.slice(0, 18) + '…' : text;
      }
      push({
        pickId: 'prompt:' + String(cm.id),
        kind: 'prompt',
        mappingId: String(cm.id),
        actionId: '',
        bindingRef: '',
        name: label,
        say: text,
        func: t('voiceIntentPrompt', '口头指令'),
        bindable: true
      });
    }

    // 2) SoftPad 自定义快捷键上用户填的口令
    var customs =
      pad && Array.isArray(pad.customShortcuts) ? pad.customShortcuts : [];
    var xi;
    for (xi = 0; xi < customs.length; xi++) {
      var cs = customs[xi];
      if (!cs) continue;
      var phrases = String(cs.phrases || '').trim();
      if (!phrases) continue;
      var sid = String(cs.id || '').trim();
      if (!sid) continue;
      push({
        pickId: 'voice-custom:' + sid,
        kind: 'custom',
        actionId: 'app.shortcut',
        bindingRef: sid,
        name: String(cs.name || sid).trim() || sid,
        say: phrases,
        func: '',
        bindable: true
      });
    }

    return out;
  }

  function catalogSoftPadBindRowsForMapping(workM, query) {
    if (!workM || !workM.codexMicroPad) return [];
    var catalog = softPadPickCatalog(workM, query);
    var out = [];
    var i;
    for (i = 0; i < catalog.length; i++) {
      var c = catalog[i];
      var microId = String(c.microKeyId || c.pickId || '').trim();
      if (!microId) continue;
      var route = routeOnPad(workM.codexMicroPad, microId);
      var slotId =
        route && route.enabled !== false ? String(route.slotId || '').trim() : '';
      if (!slotId) continue;
      var gm = softPadPickGroupMeta(c);
      out.push({
        slotId: slotId,
        microKeyId: microId,
        name: c.name || microId,
        note: c.chord ? friendlyChord(c.chord) || c.chord : c.keyName || '',
        groupId: gm.id,
        groupTitle: gm.title
      });
    }
    return out;
  }

  function matchesSearch(text) {
    var q = String(searchQuery || '')
      .trim()
      .toLowerCase();
    if (!q) return true;
    return String(text || '')
      .toLowerCase()
      .indexOf(q) >= 0;
  }

  function autoCreateBarHtml() {
    // voice / cursor / softPad: single-pick UI owns CTAs — no top "自动准备" bar
    return '';
  }

  function suggestedSchemeId() {
    var m = mappingById(selectedMappingId());
    var app = m && String(m.appTargetId || '').trim();
    if (app === 'cursor-chat') return 'cursor-dev';
    if (app === 'codex-chat' || app === 'claude-code') return 'cursor-dev';
    return 'writing';
  }

  function autoCreateForTab(ch) {
    if (ch === 'voice') {
      var mid = selectedMappingId();
      var m = mappingById(mid);
      var Ad = global.OneToneActionBindingAdapters;
      if (!Ad || !Ad.key || !Ad.key.upsert || !mid || !m) {
        toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
        return Promise.resolve();
      }
      var jobs = [];
      var defaults = [
        { actionId: VOICE_LIFECYCLE_IDS.start, chord: 'Ctrl+Shift+Space' },
        { actionId: VOICE_LIFECYCLE_IDS.cancel, chord: 'Ctrl+Shift+Backspace' }
      ];
      var di;
      for (di = 0; di < defaults.length; di++) {
        var d = defaults[di];
        if (findKeyBinding(m, d.actionId, '')) continue;
        jobs.push(Ad.key.upsert(mid, d.actionId, d.chord, null));
      }
      return Promise.all(jobs).then(function () {
        toast(
          jobs.length
            ? t('keysVoicePickAutoDone', '已给听写加上常用按键')
            : t('keysVoicePickAutoNone', '听写按键已就绪')
        );
        refresh();
      });
    }
    if (ch === 'softPad') {
      prepareSoftPadScopeScenario();
      return Promise.resolve();
    }
    if (ch !== 'cursor') return Promise.resolve();
    var Ad = global.OneToneActionBindingAdapters;
    var mid = selectedMappingId();
    var m = mappingById(mid);
    if (!Ad || !Ad.key || !Ad.key.upsert || !mid || !m) {
      toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
      return Promise.resolve();
    }
    var jobs = [];
    var gi;
    for (gi = 0; gi < CURSOR_COMMAND_GROUPS.length; gi++) {
      var items = CURSOR_COMMAND_GROUPS[gi].items || [];
      var ii;
      for (ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        if (!item || item.gated) continue;
        var actionId = cursorItemActionId(item);
        var hint = String(item.chordHint || '').trim();
        if (!actionId || !hint) continue;
        if (findKeyBinding(m, actionId, '')) continue;
        jobs.push(Ad.key.upsert(mid, actionId, hint, null));
      }
    }
    return Promise.all(jobs).then(function () {
      toast(
        jobs.length
          ? t('keysAutoCreateCursorDone', '已按方案补全 Cursor 快捷键')
          : t('keysAutoCreateCursorNone', '没有可补全的 Cursor 快捷键')
      );
      refresh();
    });
  }

  function renderPanelOnly() {
    var panel = document.getElementById('keysChannelPanel');
    if (!panel) return;
    syncOpenChrome();
    if (activeTab === 'ime') {
      renderKeyFinishHosts();
      syncCaptureRecordChrome();
    }
    if (activeTab === 'key') {
      // 自定义键不挂听写录制键帽；只刷新序列主卡
      refreshKeysTargetActionsEditor();
    }
    if (activeTab === 'ime' && global.OneToneImePresets && global.OneToneImePresets.refresh) {
      try {
        global.OneToneImePresets.refresh('mapping');
      } catch (_) {}
    }
    if (activeTab === 'ime') {
      panel.innerHTML = '';
      if (panel.classList) panel.classList.remove('is-softpad-pick');
      syncSoftPadTargetChrome(false);
      return;
    }
    if (activeTab === 'key') {
      panel.innerHTML = '';
      if (panel.classList) panel.classList.remove('is-softpad-pick');
      syncSoftPadTargetChrome(false);
      return;
    }
    panel.innerHTML = autoCreateBarHtml();
    if (activeTab === 'cursor') {
      var wrap = document.createElement('div');
      wrap.className = 'keys-channel-section';
      panel.appendChild(wrap);
      renderCursorCommandsPanel(wrap);
      syncCatalogHeroToPick('cursor');
      return;
    }
    if (activeTab === 'camera') {
      if (panel.classList) panel.classList.remove('is-softpad-pick');
      syncSoftPadTargetChrome(false);
      var camWrap = document.createElement('div');
      camWrap.className = 'keys-channel-section';
      camWrap.innerHTML = renderCameraPickHtml();
      panel.appendChild(camWrap);
      syncCatalogHeroToPick('camera');
      return;
    }
    if (activeTab === 'softPad') {
      var padWrap = document.createElement('div');
      padWrap.className = 'keys-channel-section';
      panel.appendChild(padWrap);
      renderSoftPadKeyboardPanel(padWrap);
      return;
    }
    if (panel.classList) panel.classList.remove('is-softpad-pick');
    syncSoftPadTargetChrome(false);
    var listWrap = document.createElement('div');
    listWrap.className = 'keys-channel-section';
    listWrap.innerHTML = renderListChannelHtml('voice');
    panel.appendChild(listWrap);
    syncCatalogHeroToPick('voice');
  }

  function guideToFinish() {
    setActiveTab('ime');
    toast(
      t('keysVoiceBridgeEndToast', '结束/发送请在「快捷键」标签配置按键收尾，不在识别区重复建键')
    );
  }

  function guideToIme() {
    // Tab browse only — do not persist default IME over Soft Pad / voice / cursor hero.
    clearSelection({ skipRender: true, skipHero: true, skipPersist: true });
    setActiveTab('ime', { skipHeroClear: true });
    if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
      try {
        global.OneToneMappingList.renderEditor();
      } catch (_) {}
    }
    toast(t('keysVoiceBridgeImeToast', '已切换到输入方式 · 点选输入法设置识别键'));
  }

  function setActiveTab(ch, opts) {
    if (TABS.indexOf(ch) < 0) return;
    opts = opts || {};
    var prev = activeTab;
    activeTab = ch;
    openPanels[ch] = true;
    if (ch === 'key') {
      // Rehydrate match-edit cursor only from a persisted customKey hero (explicit prior selection).
      // Do not seed the first list row — recognition keycap stays unset until the user picks.
      var habit = mappingById(selectedMappingId());
      var href = habit ? captureHeroRefForMapping(habit) : null;
      if (href && href.kind === 'customKey' && href.bindingRef) {
        customKeyMatchEditId = String(href.bindingRef);
      }
    }
    if (ch === 'ime' && selection) {
      // Leaving Soft Pad / voice / cursor for IME must not wipe captureHeroRef to default
      // (that used to save 右 Alt and survive restart).
      var keepHero = !!(opts && opts.skipHeroClear);
      // Empty「我录的键」must not keep owning 02 — restores「说完后」+ IME keycap path.
      try {
        var habitIme = mappingById(selectedMappingId());
        var hrefIme = habitIme ? captureHeroRefForMapping(habitIme) : null;
        if (hrefIme && hrefIme.kind === 'customKey' && hrefIme.bindingRef) {
          var matchIme = mappingById(hrefIme.bindingRef);
          var actsIme =
            matchIme && Array.isArray(matchIme.targetActions) ? matchIme.targetActions : [];
          if (!actsIme.length) {
            persistHeroCapture(null, habitIme.id);
            keepHero = true;
          }
        }
      } catch (_) {}
      clearSelection({
        skipRender: true,
        skipHero: keepHero,
        skipPersist: true
      });
      if (!keepHero && global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        try {
          global.OneToneMappingList.renderEditor();
        } catch (_) {}
      }
    }
    var scopeBefore = softPadScopeAppId;
    if (ch === 'softPad' && isGlobalKeysEditContext()) {
      ensureSoftPadScopeSession();
      maybeAutoPreselectSoftPadScope();
      ensureSoftPadDefaultScope();
    } else if (!openPanels.softPad) {
      syncSoftPadTargetChrome(false);
    }
    if (!(opts && opts.skipRender) || prev !== ch) {
      if (
        ch === 'softPad' &&
        isGlobalKeysEditContext() &&
        (prev !== 'softPad' || scopeBefore !== softPadScopeAppId)
      ) {
        return refresh();
      }
      renderPanelOnly();
    }
    // Always refresh keycap/hints on tab change — skipHeroClear only means "don't wipe captureHeroRef".
    if (prev !== ch) {
      applyHero();
      syncRecognitionEditorPreview();
      try {
        var scene = global.OneToneKeysSceneActionsPanel;
        if (scene && typeof scene.refresh === 'function') scene.refresh();
      } catch (_) {}
    }
    syncCaptureRecordChrome();
  }

  function onSoftPadKeyClick(keyEl, ev) {
    if (!keyEl) return;
    if (
      keyEl.classList &&
      keyEl.classList.contains('is-disabled')
    ) {
      return;
    }
    if (keyEl.getAttribute('aria-disabled') === 'true') return;
    var ctx = resolveSoftPadScope();
    if (!ctx || !ctx.targetMappingId) return;
    var mid = String(ctx.targetMappingId);
    var m = mappingById(mid);
    if (!m) return;
    var microId = String(keyEl.getAttribute('data-micro-key') || '').trim();
    var resolved = resolveMigratableAction(m, microId);
    if (!resolved) return;

    if (
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === 'softPad' &&
      selection.sourceBindingRef === microId
    ) {
      clearSelection();
      toast(t('codexCapDeselected', '已恢复语音识别键显示'));
      if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        global.OneToneMappingList.renderEditor();
      }
      return;
    }

    var iconEl = keyEl.querySelector && keyEl.querySelector('.micro-hw__icon');
    var iconHtml = iconEl ? String(iconEl.outerHTML || '') : '';
    var forceRecord = !!(ev && (ev.altKey || ev.shiftKey));
    softPadPickSelectedId = microId;
    setSelection({
      mappingId: mid,
      sourceChannel: 'softPad',
      sourceBindingRef: microId,
      actionId: resolved.actionId,
      keyBindingRef: resolved.keyBindingRef || '',
      actionInstanceId: resolved.actionInstanceId || '',
      actionArgs: resolved.actionArgs,
      iconHtml: iconHtml
    });

    var keyB = findKeyBinding(m, resolved.actionId, resolved.actionInstanceId);
    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var label = actionLabel(resolved.actionId);
    var scopeBit = ctx.title ? ctx.title + ' · ' : '';
    toast(
      t('codexCapLoadedToKeycap', '已加载到识别键') +
        ' · ' +
        scopeBit +
        label +
        (chord ? ' · ' + friendlyChord(chord) : ' · ' + t('keysHeroActionNeedsKey', '待设置快捷键'))
    );
    // Pick UI: pad click only selects; record via primary button (Alt/Shift still forces).
    if (forceRecord) {
      recordSelected();
    }
  }

  function onItemClick(btn, ev) {
    if (!btn || btn.disabled) return;
    var channel = btn.getAttribute('data-channel') || activeTab;
    var mid = selectedMappingId();
    if (channel === 'cursor') {
      if (btn.getAttribute('data-gated') === '1') {
        toast(t('keysChannelCursorGatedToast', '接受类需开启 gate 后才可绑定'));
        return;
      }
      var slotId = btn.getAttribute('data-cursor-slot') || btn.getAttribute('data-binding-ref') || '';
      var cursorActionId = canonicalActionId(btn.getAttribute('data-action-id') || '') || slotId;
      if (!slotId || !cursorActionId) return;
      if (!mid) {
        toast(t('keysActionKeyNeedHabit', '请先选择一个习惯'));
        return;
      }
      if (
        selection &&
        selection.mappingId === mid &&
        selection.sourceChannel === 'cursor' &&
        selection.sourceBindingRef === slotId
      ) {
        clearSelection();
        toast(t('codexCapDeselected', '已恢复语音识别键显示'));
        if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
          global.OneToneMappingList.renderEditor();
        }
        return;
      }
      var mapCur = mappingById(mid);
      var keyBCur = findKeyBinding(mapCur, cursorActionId, '');
      var forceRecordCur = !!(ev && (ev.altKey || ev.shiftKey));
      setSelection({
        mappingId: mid,
        sourceChannel: 'cursor',
        sourceBindingRef: slotId,
        actionId: cursorActionId,
        keyBindingRef: keyBCur ? String(keyBCur.slotId || '') : '',
        actionInstanceId: (keyBCur && keyBCur.actionInstanceId) || '',
        actionArgs: keyBCur && keyBCur.actionArgs ? keyBCur.actionArgs : null
      });
      var nameEl = btn.querySelector('.keys-channel-item-name');
      selectionToast(
        nameEl ? nameEl.textContent : cursorItemLabel({ labelZh: slotId, labelEn: slotId }),
        !!(keyBCur && keyBCur.triggerBinding)
      );
      if (forceRecordCur) recordSelected();
      return;
    }
    if (channel === 'key') {
      if (!mid) return;
      var keyRef = btn.getAttribute('data-binding-ref') || '';
      var keyActionId = canonicalActionId(btn.getAttribute('data-action-id') || '');
      var keyInst = btn.getAttribute('data-action-instance-id') || '';
      if (!keyRef || !keyActionId) return;
      if (
        selection &&
        selection.mappingId === mid &&
        selection.keyBindingRef === keyRef &&
        selection.actionId === keyActionId
      ) {
        clearSelection();
        toast(t('codexCapDeselected', '已恢复语音识别键显示'));
        if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
          global.OneToneMappingList.renderEditor();
        }
        return;
      }
      var mapKey = mappingById(mid);
      var keyRow = findKeyBinding(mapKey, keyActionId, keyInst);
      setSelection({
        mappingId: mid,
        sourceChannel: 'key',
        sourceBindingRef: keyRef,
        actionId: keyActionId,
        keyBindingRef: keyRef,
        actionInstanceId: keyInst || (keyRow && keyRow.actionInstanceId) || '',
        actionArgs: keyRow && keyRow.actionArgs ? keyRow.actionArgs : null
      });
      selectionToast(actionLabel(keyActionId), !!(keyRow && keyRow.triggerBinding));
      return;
    }
    if (channel === 'softPad') {
      var ctx = resolveSoftPadScope();
      if (!ctx || !ctx.targetMappingId) return;
      mid = ctx.targetMappingId;
    }
    if (!mid) return;
    var ref = btn.getAttribute('data-binding-ref') || '';
    var actionId = canonicalActionId(btn.getAttribute('data-action-id') || '');
    var actionInstanceId = btn.getAttribute('data-action-instance-id') || '';
    var argsChord = btn.getAttribute('data-action-args-chord') || '';
    if (!actionId || !ref) return;
    if (bindableByAction[actionId] === false) return;

    if (
      selection &&
      selection.mappingId === mid &&
      selection.sourceChannel === channel &&
      selection.sourceBindingRef === ref
    ) {
      clearSelection();
      toast(t('codexCapDeselected', '已恢复语音识别键显示'));
      if (global.OneToneMappingList && global.OneToneMappingList.renderEditor) {
        global.OneToneMappingList.renderEditor();
      }
      return;
    }

    var m = mappingById(mid);
    var keyB = findKeyBinding(m, actionId, actionInstanceId);
    var forceRecord = !!(ev && (ev.altKey || ev.shiftKey));
    var sourceRef = ref;
    setSelection({
      mappingId: mid,
      sourceChannel: channel,
      sourceBindingRef: sourceRef,
      actionId: actionId,
      keyBindingRef: keyB ? String(keyB.slotId || '') : '',
      actionInstanceId: actionInstanceId || (keyB && keyB.actionInstanceId) || '',
      actionArgs:
        argsChord
          ? { chord: argsChord }
          : keyB && keyB.actionArgs
            ? keyB.actionArgs
            : null
    });

    var chord = keyB ? String(keyB.triggerBinding || '').trim() : '';
    var displayName =
      ref.indexOf('voice-lifecycle:') === 0 || ref.indexOf('open-app-acoustic:') === 0
        ? btn.querySelector('.keys-channel-item-name')
          ? btn.querySelector('.keys-channel-item-name').textContent
          : actionLabel(actionId)
        : actionLabel(actionId);
    selectionToast(displayName, !!chord);

    if (forceRecord) {
      recordSelected();
    }
  }

  function recordSelected() {
    if (!hasSelection()) return Promise.resolve(false);
    var snap = {
      mappingId: String(selection.mappingId || ''),
      actionId: String(selection.actionId || ''),
      actionInstanceId: selection.actionInstanceId
        ? String(selection.actionInstanceId)
        : '',
      actionArgs: selection.actionArgs || null,
      keyBindingRef: selection.keyBindingRef ? String(selection.keyBindingRef) : '',
      sourceBindingRef: selection.sourceBindingRef
        ? String(selection.sourceBindingRef)
        : '',
      sourceChannel: selection.sourceChannel
        ? String(selection.sourceChannel)
        : '',
      scopeTitle: ''
    };
    var mid = snap.mappingId;
    var m = mappingById(mid);
    if (!m || !snap.actionId) return Promise.resolve(false);
    if (snap.sourceChannel === 'softPad' && !canRecordSoftPadSelection({ targetMappingId: mid })) {
      return Promise.resolve(false);
    }
    if (bindableByAction[snap.actionId] === false) {
      toast(channelOnlyLabel(snap.sourceChannel));
      return Promise.resolve(false);
    }
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) return Promise.resolve(false);
    if (rec.mode && rec.mode() !== 'none') return Promise.resolve(false);

    var scopeAtStart = resolveSoftPadScope();
    if (scopeAtStart && scopeAtStart.globalProxy && scopeAtStart.title) {
      snap.scopeTitle = String(scopeAtStart.title);
    }

    recordSnap = snap;
    var prevLock = scopeLock;
    scopeLock = 'record';

    var table = global.OneToneHabitKeyMappingTable;
    var host =
      (table && table.recordingChromeHostEl && table.recordingChromeHostEl()) ||
      document.getElementById('habitKeyMapCellTarget');
    if (host) host.classList.add('is-recording');
    if (table && table.syncCaptureRecordingChrome) {
      try {
        table.syncCaptureRecordingChrome();
      } catch (_) {}
    }
    var excludeRef = snap.keyBindingRef || '';
    var upsertOpts = {
      bindingRef: snap.keyBindingRef ? snap.keyBindingRef : null,
      actionInstanceId: snap.actionInstanceId || '',
      actionArgs: snap.actionArgs || null
    };

    function endRecordLock() {
      recordSnap = null;
      if (scopeLock === 'record') scopeLock = prevLock === 'record' ? 'manual' : prevLock;
    }

    return Promise.resolve(
      rec.startAgentBinding(mid, {
        onDone: function (chord) {
          if (host) host.classList.remove('is-recording');
          endRecordLock();
          if (table && table.syncCaptureRecordingChrome) {
            try {
              table.syncCaptureRecordingChrome();
            } catch (_) {}
          }
          var next = String(chord || '').trim();
          if (!next) return;
          var mapNow = mappingById(mid);
          var conflict = findChordConflict(mapNow, next, excludeRef);
          if (conflict) {
            if (global.OneToneAgentCapabilityUi && global.OneToneAgentCapabilityUi.conflictToast) {
              global.OneToneAgentCapabilityUi.conflictToast(conflict, next);
            } else {
              toast(
                t('codexCapConflictOther', '快捷键与现有按键冲突，请换一个') +
                  ' · ' +
                  (friendlyChord(next) || next) +
                  ' / ' +
                  (conflict.label || '')
              );
            }
            applyHero();
            return;
          }
          var adapters = global.OneToneActionBindingAdapters;
          if (!adapters || !adapters.key || !adapters.key.upsert) {
            toast('key adapter unavailable');
            return;
          }
          adapters.key
            .upsert(mid, snap.actionId, next, upsertOpts)
            .then(function () {
              var keyB = findKeyBinding(
                mappingById(mid),
                snap.actionId,
                snap.actionInstanceId
              );
              if (
                selection &&
                selection.mappingId === mid &&
                selection.actionId === snap.actionId &&
                String(selection.actionInstanceId || '') === String(snap.actionInstanceId || '')
              ) {
                selection.keyBindingRef = keyB ? String(keyB.slotId || '') : '';
                if (keyB && keyB.actionInstanceId) {
                  selection.actionInstanceId = String(keyB.actionInstanceId);
                }
              }
              applyHero();
              renderPanelOnly();
              var savedLabel = actionLabel(snap.actionId);
              var savedToast = snap.scopeTitle
                ? t('keysSoftPadScopeSaved', '已为 {app} 设置 {key} → {action}')
                    .replace('{app}', snap.scopeTitle)
                    .replace('{key}', friendlyChord(next))
                    .replace('{action}', savedLabel)
                : t('codexCapLoadedToKeycap', '已加载到识别键') +
                  ' · ' +
                  savedLabel +
                  ' · ' +
                  friendlyChord(next);
              toast(savedToast);
            })
            .catch(function (err) {
              toast(String((err && err.message) || err || 'bind failed'));
            });
        },
        onCancel: function () {
          if (host) host.classList.remove('is-recording');
          endRecordLock();
          applyHero();
        }
      })
    );
  }

  function startAddAppShortcutWizard() {
    var ctx = resolveSoftPadScope();
    var mid =
      ctx && ctx.targetMappingId ? String(ctx.targetMappingId) : selectedMappingId();
    var m = mappingById(mid);
    if (!mid || !m) {
      toast(t('keysAddAppShortcutNeedMapping', '请先选择习惯'));
      return;
    }
    if (!String(m.appTargetId || '').trim()) {
      toast(t('keysAddAppShortcutNeedApp', '请先为习惯指定目标应用'));
      return;
    }
    if (bindableByAction['app.shortcut'] === false) {
      toast(t('keysAddAppShortcutNotBindable', '当前习惯不可绑定应用快捷键'));
      return;
    }
    var rec = global.OneToneMappingRecording;
    if (!rec || !rec.startAgentBinding) {
      toast('recording unavailable');
      return;
    }
    if (rec.mode && rec.mode() !== 'none') return;
    toast(t('keysAddAppShortcutRecordOut', '先录制要发送到应用的快捷键（如 Ctrl+K）'));
    var table = global.OneToneHabitKeyMappingTable;
    var host =
      (table && table.recordingChromeHostEl && table.recordingChromeHostEl()) ||
      document.getElementById('habitKeyMapCellTarget');
    if (host) host.classList.add('is-recording');
    if (table && table.syncCaptureRecordingChrome) {
      try {
        table.syncCaptureRecordingChrome();
      } catch (_) {}
    }
    var wizSnap = {
      mappingId: mid,
      appTargetId: String(m.appTargetId || '')
    };
    recordSnap = wizSnap;
    var prevLock = scopeLock;
    scopeLock = 'record';
    function endWizardLock() {
      recordSnap = null;
      if (scopeLock === 'record') scopeLock = prevLock === 'record' ? 'manual' : prevLock;
      if (table && table.syncCaptureRecordingChrome) {
        try {
          table.syncCaptureRecordingChrome();
        } catch (_) {}
      }
    }
    Promise.resolve(
      rec.startAgentBinding(mid, {
        onDone: function (outChord) {
          if (host) host.classList.remove('is-recording');
          var output = String(outChord || '').trim();
          if (!output) {
            endWizardLock();
            return;
          }
          toast(
            t('keysAddAppShortcutRecordTrigger', '再录制触发键（如 F9）') +
              ' · ' +
              friendlyChord(output)
          );
          if (host) host.classList.add('is-recording');
          Promise.resolve(
            rec.startAgentBinding(mid, {
              onDone: function (trigChord) {
                if (host) host.classList.remove('is-recording');
                endWizardLock();
                var trigger = String(trigChord || '').trim();
                if (!trigger) return;
                var mapNow = mappingById(mid);
                var conflict = findChordConflict(mapNow, trigger, '');
                if (conflict) {
                  toast(
                    t('codexCapConflictOther', '快捷键与现有按键冲突，请换一个') +
                      ' · ' +
                      friendlyChord(trigger)
                  );
                  return;
                }
                var adapters = global.OneToneActionBindingAdapters;
                if (!adapters || !adapters.key || !adapters.key.upsert) {
                  toast('key adapter unavailable');
                  return;
                }
                var instanceId = 'app-shortcut:' + Date.now().toString(36);
                adapters.key
                  .upsert(mid, 'app.shortcut', trigger, {
                    actionInstanceId: instanceId,
                    actionArgs: { chord: output }
                  })
                  .then(function () {
                    setSelection({
                      mappingId: mid,
                      sourceChannel: 'softPad',
                      sourceBindingRef: '',
                      actionId: 'app.shortcut',
                      keyBindingRef: '',
                      actionInstanceId: instanceId,
                      actionArgs: { chord: output }
                    });
                    var keyB = findKeyBinding(mappingById(mid), 'app.shortcut', instanceId);
                    if (selection && keyB) {
                      selection.keyBindingRef = String(keyB.slotId || '');
                      // List identity for secondary row — not a softPad microKey / upsert target.
                      selection.sourceBindingRef = String(keyB.slotId || '');
                    }
                    renderPanelOnly();
                    toast(
                      t('keysAddAppShortcutSaved', '已添加应用快捷键') +
                        ' · ' +
                        friendlyChord(trigger) +
                        ' → ' +
                        friendlyChord(output)
                    );
                  })
                  .catch(function (err) {
                    toast(String((err && err.message) || err || 'bind failed'));
                  });
              },
              onCancel: function () {
                if (host) host.classList.remove('is-recording');
                endWizardLock();
                toast(t('keysAddAppShortcutCancelled', '已取消添加应用快捷键'));
              }
            })
          );
        },
        onCancel: function () {
          if (host) host.classList.remove('is-recording');
          endWizardLock();
          toast(t('keysAddAppShortcutCancelled', '已取消添加应用快捷键'));
        }
      })
    );
  }

  /** ponytail: IPC/options failure — unblock pick UI; upsert may still fail closed later */
  function failOpenSoftPadAuthority(mappingId) {
    var mid = String(mappingId || '').trim();
    if (!mid) return;
    softPadViewsMappingId = mid;
    bindableMappingId = mid;
  }

  function loadBindableMap(mappingId, actionIds) {
    var store = global.OneToneSemanticActionStore;
    if (!store || !store.fetchOptions) {
      bindableByAction = {};
      bindableMappingId = String(mappingId || '').trim();
      actionIds.forEach(function (id) {
        bindableByAction[id] = true;
      });
      return Promise.resolve(bindableByAction);
    }
    return store.ensureCatalog().then(function () {
      return store.fetchOptions(mappingId, 'key', false).then(function (entries) {
        var map = {};
        actionIds.forEach(function (id) {
          map[id] = false;
        });
        (entries || []).forEach(function (e) {
          if (!e || !e.actionId) return;
          if (actionIds.indexOf(e.actionId) >= 0) map[e.actionId] = !!e.bindable;
        });
        // Also accept catalog-only bindable check for ids missing from options rows.
        actionIds.forEach(function (id) {
          if (map[id]) return;
          if (store.isSemanticBindableOnChannel && store.isSemanticBindableOnChannel(id, 'key')) {
            // Options is authoritative when loaded — keep false if option row missing.
            var opt = store.optionFor ? store.optionFor(mappingId, 'key', id) : null;
            map[id] = !!(opt && opt.bindable);
          }
        });
        bindableByAction = map;
        bindableMappingId = String(mappingId || '').trim();
        return map;
      });
    });
  }

  function refresh() {
    var picker = document.getElementById('keysChannelPicker');
    if (!picker) {
      return Promise.resolve();
    }
    ensureSoftPadScopeSession();
    var mid = selectedMappingId();
    syncSelectionToMapping(mid);
    if (!mid || (keysStep() !== 'target' && !capturePopoverOpen)) {
      picker.hidden = keysStep() !== 'target' && !capturePopoverOpen;
      applyHero();
      renderPanelOnly();
      try {
        var sceneEarly = global.OneToneKeysSceneActionsPanel;
        if (sceneEarly && typeof sceneEarly.refresh === 'function') sceneEarly.refresh();
      } catch (_) {}
      return Promise.resolve();
    }
    picker.hidden = false;
    if (activeTab === 'softPad' && isGlobalKeysEditContext()) {
      maybeAutoPreselectSoftPadScope();
      ensureSoftPadDefaultScope();
    }
    var store = global.OneToneSemanticActionStore;
    var token = ++renderToken;
    var softCtx = resolveSoftPadScope();
    var softMid = softCtx && softCtx.targetMappingId ? String(softCtx.targetMappingId) : '';
    var optionsMid = softMid || mid;
    if (activeTab === 'softPad') {
      softPadViewsCache = [];
      softPadViewsMappingId = '';
      bindableByAction = {};
      bindableMappingId = '';
      renderPanelOnly();
      applyHero();
    }
    if (!store || !store.bindingViews) {
      viewsCache = [];
      softPadViewsCache = [];
      softPadViewsMappingId = '';
      bindableByAction = {};
      bindableMappingId = '';
      renderPanelOnly();
      applyHero();
      try {
        var sceneNoStore = global.OneToneKeysSceneActionsPanel;
        if (sceneNoStore && typeof sceneNoStore.refresh === 'function') sceneNoStore.refresh();
      } catch (_) {}
      return Promise.resolve();
    }

    function finishRefreshRender() {
      if (token !== renderToken) return;
      renderPanelOnly();
      applyHero();
      try {
        var scenePanel = global.OneToneKeysSceneActionsPanel;
        if (scenePanel && typeof scenePanel.refresh === 'function') scenePanel.refresh();
      } catch (_) {}
    }

    function handleRefreshFailure(err) {
      if (token !== renderToken) return;
      try {
        console.warn('[keys-channel] refresh failed:', err);
      } catch (_) {}
      failOpenSoftPadAuthority(optionsMid);
      finishRefreshRender();
    }

    return (store.bindingViewsForMappingCached
      ? store.bindingViewsForMappingCached(mid, true)
      : store.bindingViews(mid)
    )
      .then(function (rows) {
        if (token !== renderToken) return;
        viewsCache = Array.isArray(rows) ? rows : [];
        var softViewsP =
          softMid && softMid !== mid
            ? store.bindingViewsForMappingCached
              ? store.bindingViewsForMappingCached(softMid, true)
              : store.bindingViews(softMid)
            : Promise.resolve(softMid ? viewsCache : []);
        return softViewsP.then(function (softRows) {
          if (token !== renderToken) return;
          softPadViewsCache = Array.isArray(softRows) ? softRows : [];
          softPadViewsMappingId = softMid;
          var ids = [];
          CHANNEL_TABS.forEach(function (ch) {
            filteredViews(ch).forEach(function (v) {
              var id = viewActionId(v);
              if (id && ids.indexOf(id) < 0) ids.push(id);
            });
          });
          softPadViewsForResolve().forEach(function (v) {
            var id = viewActionId(v);
            if (id && ids.indexOf(id) < 0) ids.push(id);
          });
          var mapM = softPadWorkMapping() || mappingById(mid);
          if (mapM && mapM.codexMicroPad && Array.isArray(mapM.codexMicroPad.keys)) {
            mapM.codexMicroPad.keys.forEach(function (k) {
              if (!k || !k.microKeyId) return;
              var peeked = resolveMigratableAction(mapM, k.microKeyId, { skipBindable: true });
              if (peeked && peeked.actionId && ids.indexOf(peeked.actionId) < 0) {
                ids.push(peeked.actionId);
              }
            });
          }
          [VOICE_LIFECYCLE_IDS.start, VOICE_LIFECYCLE_IDS.cancel, 'app.open', 'app.shortcut'].forEach(
            function (id) {
              if (ids.indexOf(id) < 0) ids.push(id);
            }
          );
          return loadBindableMap(optionsMid, ids).then(finishRefreshRender);
        });
      })
      .catch(handleRefreshFailure);
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    wireKeysCustomKeyMatchList();
    var panel = document.getElementById('keysChannelPanel');
    var closeBtn = document.getElementById('btnKeysCaptureClose');
    var backdrop = document.getElementById('keysCapturePopoverBackdrop');
    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeCapturePopover({});
      });
    }
    if (backdrop) {
      backdrop.addEventListener('click', function () {
        closeCapturePopover({});
      });
    }
    var keyZone = document.getElementById('keysCaptureKeycapZone');
    if (keyZone) {
      keyZone.addEventListener('click', function (ev) {
        if (!isCapturePopoverOpen() || (activeTab !== 'key' && activeTab !== 'ime')) return;
        if (ev.target && ev.target.closest && ev.target.closest('button,a,input,label')) return;
        var rec = global.OneToneMappingRecording;
        if (rec && rec.mode && rec.mode() !== 'none') return;
        if (hasSelection() && selection.sourceChannel && selection.sourceChannel !== 'key') {
          recordSelected();
          return;
        }
        var table = global.OneToneHabitKeyMappingTable;
        if (table && table.startTargetRecordForKeysPanel) {
          table.startTargetRecordForKeysPanel();
        }
      });
    }
    var tabs = document.getElementById('keysChannelSubtabs');
    if (tabs) {
      tabs.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-channel]') : null;
        if (!btn || !tabs.contains(btn)) return;
        if (btn.classList.contains('is-codex-hidden') || btn.disabled) return;
        var ch = btn.getAttribute('data-channel');
        if (TABS.indexOf(ch) < 0 || ch === activeTab) return;
        setActiveTab(ch);
      });
    }
    var searchInput = document.getElementById('keysChannelSearch');
    if (searchInput) {
      searchInput.addEventListener('input', function () {
        searchQuery = String(searchInput.value || '');
        renderPanelOnly();
      });
    }
    var imeStrip = document.getElementById('keysImeStripWrap');
    if (imeStrip) {
      imeStrip.addEventListener('click', function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-ime-id]') : null;
        if (!btn || !imeStrip.contains(btn) || btn.getAttribute('data-ime-context') !== 'mapping') {
          return;
        }
        if (!isCapturePopoverOpen() || activeTab !== 'ime') return;
        var id = btn.getAttribute('data-ime-id') || '';
        if (!id) return;
        setSelection(
          {
            mappingId: selectedMappingId(),
            sourceChannel: 'ime',
            sourceBindingRef: id,
            actionId: id,
            keyBindingRef: '',
            actionInstanceId: '',
            actionArgs: null,
            iconHtml: ''
          },
          { skipRender: false }
        );
        toast(t('keysCaptureHeroMapped', '已映射到识别按钮'));
      });
    }
    if (panel) {
      panel.addEventListener('click', function (ev) {
        var autoBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-auto-create]') : null;
        if (autoBtn && panel.contains(autoBtn)) {
          ev.preventDefault();
          autoCreateForTab(autoBtn.getAttribute('data-auto-create') || activeTab);
          return;
        }
        var pickSub =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-pick-subtab]')
            : null;
        if (pickSub && panel.contains(pickSub)) {
          ev.preventDefault();
          var subId = String(pickSub.getAttribute('data-pick-subtab') || '');
          var subCh = String(pickSub.getAttribute('data-pick-channel') || '');
          if (subCh === 'voice') voicePickSubtabId = subId;
          else if (subCh === 'cursor') cursorPickSubtabId = subId;
          else if (subCh === 'softPad') softPadPickSubtabId = subId;
          renderPanelOnly();
          return;
        }
        var softPadRow =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-softpad-pick-row]')
            : null;
        if (softPadRow && panel.contains(softPadRow)) {
          ev.preventDefault();
          softPadPickSelectedId = String(
            softPadRow.getAttribute('data-softpad-pick-row') || ''
          );
          applySoftPadPickBind();
          return;
        }
        var voiceRow =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-voice-pick-row]')
            : null;
        if (voiceRow && panel.contains(voiceRow)) {
          ev.preventDefault();
          voicePickSelectedId = String(
            voiceRow.getAttribute('data-voice-pick-row') || ''
          );
          applyVoicePickBind();
          return;
        }
        var cursorRow =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-cursor-pick-row]')
            : null;
        if (cursorRow && panel.contains(cursorRow)) {
          ev.preventDefault();
          cursorPickSelectedId = String(
            cursorRow.getAttribute('data-cursor-pick-row') || ''
          );
          applyCursorPickBind();
          return;
        }
        var cursorBind =
          ev.target && ev.target.closest ? ev.target.closest('[data-cursor-pick-bind]') : null;
        if (cursorBind && panel.contains(cursorBind)) {
          ev.preventDefault();
          applyCursorPickBind();
          return;
        }
        var cameraBind =
          ev.target && ev.target.closest ? ev.target.closest('[data-camera-pick-bind]') : null;
        if (cameraBind && panel.contains(cameraBind)) {
          ev.preventDefault();
          applyCameraPickBind();
          return;
        }
        var softPadBind =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-pick-bind]') : null;
        if (softPadBind && panel.contains(softPadBind)) {
          ev.preventDefault();
          applySoftPadPickBind();
          return;
        }
        var goCamera =
          ev.target && ev.target.closest ? ev.target.closest('[data-go-camera]') : null;
        if (goCamera && panel.contains(goCamera)) {
          ev.preventDefault();
          guideToCameraSettings();
          return;
        }
        var imeBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-bridge-ime]') : null;
        if (imeBtn && panel.contains(imeBtn)) {
          ev.preventDefault();
          guideToIme();
          return;
        }
        var guideBtn =
          ev.target && ev.target.closest ? ev.target.closest('[data-guide-finish]') : null;
        if (guideBtn && panel.contains(guideBtn)) {
          ev.preventDefault();
          guideToFinish();
          return;
        }
        var goSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-go-softpad]') : null;
        if (goSoft && panel.contains(goSoft)) {
          ev.preventDefault();
          guideToSoftPadSettings();
          return;
        }
        var prepareSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-prepare]') : null;
        if (prepareSoft && panel.contains(prepareSoft)) {
          ev.preventDefault();
          prepareSoftPadScopeScenario();
          return;
        }
        var recordSoft =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-record]') : null;
        if (recordSoft && panel.contains(recordSoft)) {
          ev.preventDefault();
          recordSelected();
          return;
        }
        var scopeChange =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-scope-change]') : null;
        if (scopeChange && panel.contains(scopeChange)) {
          ev.preventDefault();
          autoPreselectHint = false;
          scopeLock = 'manual';
          autoPreselectDone = true;
          renderPanelOnly();
          var chip = panel.querySelector('[data-softpad-scope-app]');
          if (chip && chip.focus) chip.focus();
          return;
        }
        var scopeMapping =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-softpad-scope-mapping]')
            : null;
        if (scopeMapping && panel.contains(scopeMapping)) {
          ev.preventDefault();
          var midPick = scopeMapping.getAttribute('data-softpad-scope-mapping') || '';
          setSoftPadScopeMappingOverride(midPick, { refresh: true });
          return;
        }
        var scopeChip =
          ev.target && ev.target.closest ? ev.target.closest('[data-softpad-scope-app]') : null;
        if (scopeChip && panel.contains(scopeChip)) {
          ev.preventDefault();
          if (scopeLock === 'record' || scopeChip.disabled) return;
          var appId = scopeChip.getAttribute('data-softpad-scope-app') || '';
          setSoftPadScopeAppId(appId, { refresh: true });
          return;
        }
        var addShortcut =
          ev.target && ev.target.closest ? ev.target.closest('[data-add-app-shortcut]') : null;
        if (addShortcut && panel.contains(addShortcut)) {
          ev.preventDefault();
          startAddAppShortcutWizard();
          return;
        }
        var padKey =
          ev.target && ev.target.closest
            ? ev.target.closest('.micro-hw__key[data-micro-key]')
            : null;
        if (padKey && panel.contains(padKey)) {
          ev.preventDefault();
          onSoftPadKeyClick(padKey, ev);
          return;
        }
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-channel-item]') : null;
        if (!btn || !panel.contains(btn)) return;
        onItemClick(btn, ev);
      });
      panel.addEventListener('change', function (ev) {
        var voiceSel =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-voice-pick-select]')
            : null;
        if (voiceSel && panel.contains(voiceSel)) {
          voicePickSelectedId = String(voiceSel.value || '');
          previewPickSelection('voice');
          renderPanelOnly();
          return;
        }
        var cursorSel =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-cursor-pick-select]')
            : null;
        if (cursorSel && panel.contains(cursorSel)) {
          cursorPickSelectedId = String(cursorSel.value || '');
          previewPickSelection('cursor');
          renderPanelOnly();
          return;
        }
        var cameraSel =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-camera-pick-select]')
            : null;
        if (cameraSel && panel.contains(cameraSel)) {
          cameraPickSelectedId = String(cameraSel.value || '');
          previewPickSelection('camera');
          renderPanelOnly();
          return;
        }
        var softPadSel =
          ev.target && ev.target.closest
            ? ev.target.closest('[data-softpad-pick-select]')
            : null;
        if (softPadSel && panel.contains(softPadSel)) {
          softPadPickSelectedId = String(softPadSel.value || '');
          previewPickSelection('softPad');
          renderPanelOnly();
        }
      });
    }
  }

  function syncImeHeroMarkers() {
    var strip = document.getElementById('imePresetStripMapping');
    if (!strip) return;
    var m = mappingById(selectedMappingId());
    var ref = captureHeroRefForMapping(m);
    strip.querySelectorAll('[data-ime-id]').forEach(function (btn) {
      var id = btn.getAttribute('data-ime-id') || '';
      var on =
        ref.kind === 'imePreset' &&
        ref.channel === 'ime' &&
        ref.bindingRef === id;
      btn.classList.toggle('is-hero-mapped', on);
    });
  }

  function init() {
    bindOnce();
    loadHeroCaptureFromMapping();
    refresh();
  }

  function setCodexImeTabHidden(_hidden) {
    // Scheme D: 输入法 stays in the left catalog for every habit (incl. Codex).
    // Callers may still invoke this; ignore hide requests so the tab cannot vanish.
    imeTabHidden = false;
    syncImeTabChrome();
  }

  global.OneToneKeysChannelCommandPicker = {
    init: init,
    refresh: refresh,
    refreshKeysTargetActions: refreshKeysTargetActionsEditor,
    refreshKeysCustomKeyMatchList: refreshKeysCustomKeyMatchList,
    getSelection: getSelection,
    hasSelection: hasSelection,
    clearSelection: clearSelection,
    setSelection: setSelection,
    selectFromSlotId: selectFromSlotId,
    selectedSlotId: selectedSlotId,
    applyCustomKeyMatchAsRecognition: applyCustomKeyMatchAsRecognition,
    previewCustomKeyMatch: previewCustomKeyMatch,
    createCustomKeyMatchMapping: createCustomKeyMatchMapping,
    createBlankSceneActionMapping: createBlankSceneActionMapping,
    createVoiceInputMapping: createVoiceInputMapping,
    isCustomKeyMatchMapping: isCustomKeyMatchMapping,
    isPromptInjectMapping: isPromptInjectMapping,
    scrubStalePromptHero: scrubStalePromptHero,
    promptTextFromMapping: promptTextFromMapping,
    promptInjectActions: promptInjectActions,
    stampPromptPeerWakePhrases: stampPromptPeerWakePhrases,
    savePromptInjectMapping: savePromptInjectMapping,
    pruneDuplicatePromptPeers: pruneDuplicatePromptPeers,
    customKeyMatchDisplayName: customKeyMatchDisplayName,
    renameCustomKeyMatch: renameCustomKeyMatch,
    deleteCustomKeyMatch: deleteCustomKeyMatch,
    listCustomKeyMappingsForCurrentApp: listCustomKeyMappingsForCurrentApp,
    clearCustomKeyRecognition: function (m) {
      m = m || mappingById(selectedMappingId());
      if (!m) return;
      customKeyMatchEditId = '';
      var ref = captureHeroRefForMapping(m);
      if (ref && ref.kind === 'customKey') {
        persistHeroCapture(defaultCaptureHeroRef(), m.id);
      }
      clearSelection({ skipRender: true, skipHero: true, skipPersist: true });
      applyHero();
      syncRecognitionEditorPreview();
      refreshKeysCustomKeyMatchList();
      refreshKeysTargetActionsEditor();
    },
    applyHero: applyHero,
    syncRecognitionEditorPreview: syncRecognitionEditorPreview,
    heroModel: heroModel,
    resolveHeroCapture: resolveHeroCapture,
    loadHeroCaptureFromMapping: loadHeroCaptureFromMapping,
    resolveMigratableAction: resolveMigratableAction,
    resolveSoftPadScope: resolveSoftPadScope,
    setSoftPadScopeAppId: setSoftPadScopeAppId,
    setSoftPadScopeMappingOverride: setSoftPadScopeMappingOverride,
    prepareSoftPadScopeScenario: prepareSoftPadScopeScenario,
    maybeAutoPreselectSoftPadScope: maybeAutoPreselectSoftPadScope,
    ensureSoftPadDefaultScope: ensureSoftPadDefaultScope,
    resetSoftPadScopeSession: resetSoftPadScopeSession,
    getSoftPadScopeLock: function () {
      return scopeLock;
    },
    getSoftPadScopeAppId: function () {
      return softPadScopeAppId;
    },
    previewPadClone: previewPadClone,
    recordSelected: recordSelected,
    onStepChange: onStepChange,
    setCodexImeTabHidden: setCodexImeTabHidden,
    getActiveTab: function () {
      return activeTab;
    },
    isChannelOpen: isChannelOpen,
    setActiveTab: setActiveTab,
    openCapturePopover: openCapturePopover,
    closeCapturePopover: closeCapturePopover,
    isCapturePopoverOpen: isCapturePopoverOpen,
    openCaptureSheet: openCaptureSheet,
    closeCaptureSheet: closeCaptureSheet,
    isCaptureSheetOpen: isCaptureSheetOpen,
    catalogCustomKeysForApp: catalogCustomKeysForApp,
    catalogVoicePromptsForMapping: catalogVoicePromptsForMapping,
    catalogCameraGestures: catalogCameraGestures,
    catalogSoftPadBindRowsForMapping: catalogSoftPadBindRowsForMapping,
    catalogCursorPickRows: catalogCursorPickRows,
    catalogCursorPickGroups: catalogCursorPickGroups,
    softPadPickCatalogForMapping: softPadPickCatalog,
    gestureLabel: gestureLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
