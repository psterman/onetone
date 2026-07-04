(function () {
  "use strict";

  const STORAGE_KEY = "vp_site_lang";
  const REPO = "psterman/voice-pilot";

  const strings = {
    zh: {
      siteName: "一声 OneTone",
      navDownload: "下载",
      navQuickstart: "上手",
      navFaq: "常见问题",
      langToggle: "EN",
      flowBanner: "从下载页继续 · 第 1 步",
      heroTrust: "适用于 Windows 10 / 11",
      heroActionPrefix: "按一下键，打开",
      heroActionLine1: "用",
      heroActionLine2: "打开语音输入",
      heroWords: ["鼠标侧键", "手柄", "蓝牙戒指", "轨迹球", "麦克风", "遥控器"],
      heroTagline: "把鼠标、手柄、轨迹球、蓝牙戒指、麦克风或任何 Windows 能识别的输入，变成语音输入的启动方式。",
      heroDemoListening: "正在聆听...",
      heroDemoTypedText: "现在就能随处语音输入。",
      heroProofKeyboard: "外设兼容",
      heroProofGlobal: "随处输入",
      heroProofLocal: "麦克风可触发",
      heroDeviceMouse: "鼠标侧键",
      heroDeviceGamepad: "手柄",
      heroDeviceRing: "蓝牙戒指",
      heroDeviceTrackball: "轨迹球",
      heroDeviceMic: "语音麦克风",
      heroDeviceKey: "音量键",
      heroDemoTriggerAll: "Windows 可识别的输入",
      ctaDownload: "立即免费下载",
      ctaSeeHow: "先看看怎么用",
      quickstartKicker: "3 分钟上手",
      stepsTitle: "把任意外设，变成语音输入开关",
      stepsSubtitle: "鼠标侧键、手柄、蓝牙戒指、轨迹球、遥控器、麦克风口令等 Windows 可识别输入，都可以用来唤醒语音输入。",
      step1Title: "选一个你常按的键",
      step1Desc: "比如键盘上的音量+键、鼠标侧键，或你不常用的按键。",
      step2Title: "录入语音启动快捷键",
      step2Desc: "让软件知道按键后该做什么。建议绑定系统自带的 Win+H。",
      step3Title: "随时随地试一下",
      step3Desc: "打开记事本或聊天框，按下你的键，语音输入面板瞬间唤醒。",
      flowStep1Title: "选择触发源",
      flowStep1Desc: "在 OneTone 里按一下你想用的外设动作。",
      flowStep2Title: "绑定语音输入",
      flowStep2Desc: "推荐先绑定 Windows 自带的 Win + H，最快确认流程跑通。",
      flowStep3Title: "在任意输入框测试",
      flowStep3Desc: "打开聊天、邮件或文档，触发一下，说的话会进入当前光标位置。",
      flowStatusTitle: "状态",
      flowStatusReady: "触发源已记录",
      flowStatusListening: "语音输入已唤醒",
      flowStatusTyped: "文字进入当前应用",
      flowResultText: "现在开始说，文字会出现在这里。",
      quickstartSuccessTitle: "成功标志",
      quickstartSuccessDesc: "看到语音输入条或麦克风图标出现，就说明触发已经生效。",
      quickstartHelp: "按了没反应？看 3 个排查点",
      quickstartWindowMode: "触发设置",
      quickstartSearch: "搜索或按下一个触发源...",
      quickstartMappingLabel: "当前映射",
      quickstartMappingDesc: "触发后打开系统语音输入，不改变当前应用。",
      quickstartTestLabel: "测试输入框",
      triggerMouse: "鼠标侧键",
      triggerMouseDesc: "拇指按一下，立即开始说",
      triggerGamepad: "手柄按键",
      triggerGamepadDesc: "客厅、沙发或远距离输入",
      triggerRing: "蓝牙戒指",
      triggerRingDesc: "轻点一下，不离开当前动作",
      triggerMic: "麦克风口令",
      triggerMicDesc: "也可以用声音激活语音输入",
      triggerReady: "已识别",
      flowStatusLabels: ["鼠标侧键已记录", "手柄按键已记录", "蓝牙戒指已记录", "麦克风口令已记录"],
      flowResultTexts: [
        "按下鼠标侧键后，说的话会进入当前输入框。",
        "按下手柄按钮后，可以远距离口述文字。",
        "轻点蓝牙戒指后，不离开当前动作也能输入。",
        "说出口令后，麦克风也可以激活语音输入。",
      ],
      quickstartScenarioKicker: "场景说明",
      quickstartScenarioTitle: "一次设置，所有输入场景都能用",
      quickstartScenarioDesc: "OneTone 不接管你的写作软件，只负责把“触发一下”变成“当前光标开始听写”。所以邮件、笔记、聊天、文档里都是同一套动作。",
      quickstartSceneMail: "回复长邮件时，按一下外设，直接把想法说进正文。",
      quickstartSceneNotes: "想法刚出现时，用声音先记下来，再慢慢整理。",
      quickstartSceneChat: "双手忙着操作时，也能快速回复当前聊天框。",
      quickstartSceneDocs: "写段落、列提纲、补说明时，用口述先铺开内容。",
      quickstartVoiceChip: "触发后，文字进入当前光标",
      sceneMailApp: "邮件回复",
      sceneMailTo: "收件人：团队",
      sceneMailText: "我先把今天的进展说一下，稍后补上截图和链接。",
      sceneNotesApp: "灵感笔记",
      sceneNotesTitle: "会议后的想法",
      sceneNotesText: "先记录三个方向：入口更轻、反馈更快、失败时有明确提示。",
      sceneChatApp: "聊天窗口",
      sceneChatIncoming: "这个方案今天能先给一版吗？",
      sceneChatText: "可以，我先发一个可运行版本，细节晚上再补。",
      sceneDocsApp: "文档编辑",
      sceneDocsTitle: "产品说明",
      sceneDocsText: "这个功能适合需要频繁输入，但不想离开当前软件的人。",
      contextKicker: "随处输入",
      shotsTitle: "少打字，少打断",
      shotsSubtitle: "邮件、笔记、聊天、文档里都一样：触发一下，直接说。",
      contextMail: "邮件",
      contextNotes: "笔记",
      contextChat: "聊天",
      contextDocs: "文档",
      contextMetric: "从想到说，少一步",
      contextMetricDesc: "不打断思路，不切换工作流。",
      contextEditorLabel: "正文",
      contextTypedText: "我先把想法说出来，文字就会跟上。",
      contextVoiceTitle: "语音输入中...",
      shot1Cap: "打开软件，跟着欢迎提示走",
      shot2Cap: "先录你的键，再录 Win+H",
      shot3Cap: "按一下键，语音输入出现 = 成功",
      faqTeaserTitle: "遇到问题？",
      faq1: "为什么我按了没反应？",
      faq2: "为什么检测不到麦克风？",
      faq3: "为什么会录到电脑声音？",
      faqViewAll: "查看全部常见问题",
      ctaBannerTitle: "准备好提升效率了吗？",
      ctaBannerDesc: "只需不到一分钟的设置，即可体验最快捷的语音输入方式。",
      ctaBannerBtn: "下载安装包",
      ctaBannerMeta: "v1.0.0 | Windows 10/11",
      footerFeatures: "功能介绍",
      footerChangelog: "更新日志",
      footerPrivacy: "隐私政策",
      footerTerms: "服务条款",
      footerGithub: "GitHub",
      footerReport: "反馈问题",
      footerCopy: "© 2026 一声 OneTone. All rights reserved.",
      dlTitle: "下载一声",
      dlSubtitle: "Windows 安装包，免费使用",
      dlBtn: "下载 Windows 安装包",
      dlAllReleases: "在 GitHub 查看所有版本",
      dlVersion: "版本",
      dlDate: "发布日期",
      dlSize: "大小",
      dlSigned: "代码签名",
      dlSignedNo: "未签名（v1.0.0）",
      dlLoading: "正在获取版本信息…",
      dlBeforeTitle: "安装前你知道的 3 件事",
      dlBefore1: "适用于 Windows 10 / 11",
      dlBefore2: "设置保存在本机，更新不会覆盖你的配置",
      dlBefore3: "不需要安装其他软件",
      smartscreenTitle: "首次安装可能提示 SmartScreen",
      smartscreen1: "点击「更多信息」",
      smartscreen2: "再点「仍要运行」",
      smartscreen3: "安装包未做代码签名，这是 Windows 的正常提示",
      continueTitle: "装好了，下一步这样做",
      continue1: "打开一声，跟着欢迎提示",
      continue2: "录「你的键」和 Win+H",
      continue3: "在输入框里按一下试一次",
      continueBtn: "现在开始第 1 步",
      continueFaq: "按键不灵？查看常见问题",
      qsTitle: "你已经装好了，接下来 3 步",
      qsSubtitle: "跟着做，大约 3 分钟",
      qsSuccessTitle: "你做对了，会看到这样",
      qsSuccessVerdict: "看到语音输入条或麦克风图标出现，就是成功",
      qsStep1Title: "录第一个键",
      qsStep1Desc: "在软件里选一个你常按的键，比如音量+或鼠标侧键，按提示录进去。",
      qsStep2Title: "录 Win+H",
      qsStep2Desc: "再录「打开语音输入」的按键。建议先试 Win+H——Windows 自带，不用额外设置。",
      qsStep3Title: "试一次",
      qsStep3Desc: "打开记事本，按你录的键。对照上面的成功画面，出现语音条或麦克风图标就对了。",
      qsInstallNote: "安装问题见",
      qsInstallLink: "下载页 SmartScreen 说明",
      qsMoreExamples: "更多输入法示例（百度 / 微信 / 搜狗）",
      qsMoreExamplesBody: "主流程建议先用 Win+H 跑通。用百度等输入法时，快捷键各不一样，见",
      qsMoreExamplesLink: "常见问题里的输入法说明",
      qsNextOk: "看到成功画面了？打开软件，日常用起来就行。",
      qsNextFail: "没有出现？",
      qsNextFailLink: "查看常见问题",
      faqPageTitle: "常见问题",
      faqPageIntro: "按你遇到的问题往下找，先排第一层再读详细说明。",
      faqNext: "下一步：按上面在软件里试一次",
      faqNextLink: "仍不行？提交问题",
      faqQ1: "为什么我按了没反应？",
      faqTriage1: "软件有没有开",
      faqTriage1Hint: "看系统托盘，一声图标要在运行",
      faqTriage2: "按键有没有录对",
      faqTriage2Hint: "设置里「你的键」和测试时按的是同一个吗？",
      faqTriage3: "输入法快捷键对不对",
      faqTriage3Hint: "主流程先试 Win+H；用百度等见下方第 4 题",
      faqQ2: "为什么检测不到麦克风？",
      faqQ3: "为什么会录到电脑声音？",
      faqQ4: "百度输入法怎么设置快捷键？",
      faqQ5: "微信 / 搜狗输入法可以用吗？",
      faqQ6: "怎么恢复默认设置？",
      faqQ7: "还是不行，怎么反馈问题？",
    },
    en: {
      siteName: "OneTone",
      stepsSubtitle: "Map one device action to voice input, then speak in any text field.",
      shotsSubtitle: "Email, notes, chat, and docs all work the same: trigger once, then speak.",
      step2Title: "Record the voice-input shortcut",
      step2Desc: "Tell the app what to fire. We recommend Win+H built into Windows.",
      step3Title: "Try it anywhere",
      step3Desc: "Open Notepad or chat, press your key — voice input appears instantly.",
      step1Desc: "Volume+, a mouse side button, or any key you rarely use.",
      ctaDownload: "Download free",
      heroActionPrefix: "Press one key to open",
      heroActionLine1: "Use a",
      heroActionLine2: "to open voice input",
      heroWords: ["mouse button", "gamepad", "Bluetooth ring", "trackball", "microphone", "remote"],
      heroTagline: "Turn a mouse, gamepad, trackball, Bluetooth ring, microphone, or any Windows-recognized input into your voice-input trigger.",
      heroDemoListening: "Listening...",
      heroDemoTypedText: "Voice input works anywhere.",
      heroProofKeyboard: "Device friendly",
      heroProofGlobal: "Type anywhere",
      heroProofLocal: "Voice-trigger ready",
      heroDeviceMouse: "Mouse button",
      heroDeviceGamepad: "Gamepad",
      heroDeviceRing: "Bluetooth ring",
      heroDeviceTrackball: "Trackball",
      heroDeviceMic: "Voice mic",
      heroDeviceKey: "Volume key",
      heroDemoTriggerAll: "Windows-recognized input",
      flowStep1Title: "Choose a trigger",
      flowStep1Desc: "Press a mouse button, gamepad, ring, trackball, or voice command.",
      flowStep2Title: "Map to voice input",
      flowStep2Desc: "Bind the system voice-input shortcut. Start with Win + H.",
      flowStep3Title: "Wake it anywhere",
      flowStep3Desc: "Focus any text field, trigger OneTone, and speak into the active app.",
      flowStatusTitle: "Status",
      flowStatusReady: "Trigger recorded",
      flowStatusListening: "Voice input is awake",
      flowStatusTyped: "Text entered in the app",
      flowResultText: "Start speaking, and text lands here.",
      contextKicker: "Type anywhere",
      contextMail: "Email",
      contextNotes: "Notes",
      contextChat: "Chat",
      contextDocs: "Docs",
      contextMetric: "One less step from thought to words",
      contextMetricDesc: "Keep your flow. Do not switch tools.",
      contextEditorLabel: "Body",
      contextTypedText: "I can say the thought first, and the text follows.",
      contextVoiceTitle: "Voice input...",
      ctaBannerTitle: "Ready to type faster?",
      ctaBannerDesc: "Less than a minute of setup for the quickest path to voice input.",
      ctaBannerBtn: "Get the installer",
      ctaBannerMeta: "v1.0.0 | Windows 10/11",
      footerCopy: "© 2026 OneTone. All rights reserved.",
      navDownload: "Download",
      navQuickstart: "Get started",
      navFaq: "FAQ",
      langToggle: "中文",
      flowBanner: "Continuing from download · Step 1",
      heroTitle: "Press one key to open voice input",
      heroTagline: "Turn volume keys or side buttons into your voice-input starter key",
      ctaDownload: "Download now",
      ctaSeeHow: "See how it works",
      heroTrust: "For Windows 10 / 11",
      heroActionPrefix: "Press one key to open",
      heroActionLine1: "Use a",
      heroActionLine2: "to open voice input",
      heroWords: ["mouse button", "gamepad", "Bluetooth ring", "trackball", "microphone", "remote"],
      heroTagline: "Turn a mouse, gamepad, trackball, Bluetooth ring, microphone, or any Windows-recognized input into your voice-input trigger.",
      heroDemoListening: "Listening...",
      heroDemoTypedText: "Voice input works anywhere.",
      heroProofKeyboard: "Device friendly",
      heroProofGlobal: "Type anywhere",
      heroProofLocal: "Voice-trigger ready",
      heroDeviceMouse: "Mouse button",
      heroDeviceGamepad: "Gamepad",
      heroDeviceRing: "Bluetooth ring",
      heroDeviceTrackball: "Trackball",
      heroDeviceMic: "Voice mic",
      heroDeviceKey: "Volume key",
      heroDemoTriggerAll: "Windows-recognized input",
      quickstartKicker: "3-minute setup",
      stepsTitle: "Turn any device into a voice-input switch",
      stepsSubtitle: "Mouse buttons, gamepads, Bluetooth rings, trackballs, remotes, voice commands, and other Windows-recognized inputs can all wake voice input.",
      step1Title: "Pick a key you use often",
      step1Desc: "e.g. Volume+, mouse side button",
      step2Title: "Record the voice-input key",
      step2Desc: "Try Win+H first (built-in Windows voice typing)",
      step3Title: "Try it",
      step3Desc: "Open Notepad, press your key — voice input should appear",
      flowStep1Title: "Choose a trigger",
      flowStep1Desc: "Press the device action you want to use inside OneTone.",
      flowStep2Title: "Bind voice input",
      flowStep2Desc: "Start with Windows Win + H so you can confirm the flow quickly.",
      flowStep3Title: "Test in any field",
      flowStep3Desc: "Open chat, email, or a document. Trigger once and speech lands at the cursor.",
      flowStatusTitle: "Status",
      flowStatusReady: "Trigger recorded",
      flowStatusListening: "Voice input is awake",
      flowStatusTyped: "Text entered in the app",
      flowResultText: "Start speaking, and text lands here.",
      quickstartSuccessTitle: "Success signal",
      quickstartSuccessDesc: "If the voice bar or microphone icon appears, your trigger is working.",
      quickstartHelp: "Nothing happens? Check 3 things",
      quickstartWindowMode: "Trigger setup",
      quickstartSearch: "Search or press a trigger source...",
      quickstartMappingLabel: "Current mapping",
      quickstartMappingDesc: "Trigger opens system voice input without changing the active app.",
      quickstartTestLabel: "Test field",
      triggerMouse: "Mouse button",
      triggerMouseDesc: "Press with your thumb and start speaking",
      triggerGamepad: "Gamepad button",
      triggerGamepadDesc: "Dictate from the couch or across the room",
      triggerRing: "Bluetooth ring",
      triggerRingDesc: "Tap once without leaving the current action",
      triggerMic: "Voice command",
      triggerMicDesc: "Your microphone can wake voice input too",
      triggerReady: "Detected",
      flowStatusLabels: ["Mouse button recorded", "Gamepad button recorded", "Bluetooth ring recorded", "Voice command recorded"],
      flowResultTexts: [
        "Press the mouse button and your speech lands in the focused field.",
        "Press the gamepad button to dictate from farther away.",
        "Tap the Bluetooth ring to type without leaving the current action.",
        "Say the command and the microphone can wake voice input too.",
      ],
      quickstartScenarioKicker: "Scenarios",
      quickstartScenarioTitle: "Set it once, use it in every writing context",
      quickstartScenarioDesc: "OneTone does not replace your writing app. It turns one trigger into voice typing at the current cursor, so email, notes, chat, and docs all work the same way.",
      quickstartSceneMail: "Reply to long emails by pressing one device and speaking into the body.",
      quickstartSceneNotes: "Capture ideas with your voice first, then organize them later.",
      quickstartSceneChat: "Reply in the active chat while your hands stay busy.",
      quickstartSceneDocs: "Dictate paragraphs, outlines, and explanations before editing.",
      quickstartVoiceChip: "After the trigger, text lands at the cursor",
      sceneMailApp: "Email reply",
      sceneMailTo: "To: Team",
      sceneMailText: "Let me quickly share today's progress, then I will add screenshots and links.",
      sceneNotesApp: "Idea note",
      sceneNotesTitle: "After-meeting thoughts",
      sceneNotesText: "Capture three directions: lighter entry, faster feedback, clearer failure states.",
      sceneChatApp: "Chat window",
      sceneChatIncoming: "Can you send a first version today?",
      sceneChatText: "Yes, I will send a working version first and polish the details tonight.",
      sceneDocsApp: "Document editor",
      sceneDocsTitle: "Product note",
      sceneDocsText: "This is useful for people who type often but do not want to leave the current app.",
      contextKicker: "Type anywhere",
      shotsTitle: "Less typing, fewer interruptions",
      shotsSubtitle: "Email, notes, chat, and docs all work the same: trigger once, then speak.",
      contextMail: "Email",
      contextNotes: "Notes",
      contextChat: "Chat",
      contextDocs: "Docs",
      contextMetric: "One less step from thought to words",
      contextMetricDesc: "Keep your flow. Do not switch tools.",
      contextEditorLabel: "Body",
      contextTypedText: "I can say the thought first, and the text follows.",
      contextVoiceTitle: "Voice input...",
      shot1Cap: "Open the app and follow the welcome guide",
      shot2Cap: "Record your key, then Win+H",
      shot3Cap: "Press your key — voice UI appears = success",
      faqTeaserTitle: "Having trouble?",
      faq1: "Why doesn't my key do anything?",
      faq2: "Why can't it detect my microphone?",
      faq3: "Why does it pick up system audio?",
      faqViewAll: "View all FAQ",
      nextStepHome: "Next:",
      nextStepHomeLink: "Download the installer",
      footerFeatures: "Features",
      footerChangelog: "Changelog",
      footerPrivacy: "Privacy",
      footerTerms: "Terms",
      footerGithub: "GitHub",
      footerReport: "Report an issue",
      footerCopy: "© 2026 OneTone",
      dlTitle: "Download OneTone",
      dlSubtitle: "Windows installer, free to use",
      dlBtn: "Download Windows installer",
      dlAllReleases: "All releases on GitHub",
      dlVersion: "Version",
      dlDate: "Released",
      dlSize: "Size",
      dlSigned: "Code signing",
      dlSignedNo: "Unsigned (v1.0.0)",
      dlLoading: "Loading release info…",
      dlBeforeTitle: "Before you install",
      dlBefore1: "Works on Windows 10 / 11",
      dlBefore2: "Settings stay on your PC — updates won't overwrite them",
      dlBefore3: "No extra software required",
      smartscreenTitle: "SmartScreen may appear on first install",
      smartscreen1: "Click More info",
      smartscreen2: "Then Run anyway",
      smartscreen3: "The installer is unsigned — this is normal on Windows",
      continueTitle: "Installed? Do this next",
      continue1: "Open OneTone and follow the welcome guide",
      continue2: "Record your key and Win+H",
      continue3: "Press your key in any text field to test",
      continueBtn: "Start step 1 now",
      continueFaq: "Key not working? See FAQ",
      qsTitle: "You're set up — 3 steps left",
      qsSubtitle: "About 3 minutes",
      qsSuccessTitle: "This is what success looks like",
      qsSuccessVerdict: "Voice bar or mic icon showing = success",
      qsStep1Title: "Record your trigger key",
      qsStep1Desc: "Pick a key you use often, like Volume+ or a mouse side button.",
      qsStep2Title: "Record Win+H",
      qsStep2Desc: "Record the key that opens voice input. Win+H is built into Windows — no extra setup.",
      qsStep3Title: "Try it",
      qsStep3Desc: "Open Notepad and press your key. Match the success image above.",
      qsInstallNote: "Install issues?",
      qsInstallLink: "SmartScreen help on download page",
      qsMoreExamples: "More IME examples (Baidu / WeChat / Sogou)",
      qsMoreExamplesBody: "Get Win+H working first. Other IMEs use different shortcuts — see",
      qsMoreExamplesLink: "FAQ输入法 section",
      qsNextOk: "Got the success screen? You're ready to use it daily.",
      qsNextFail: "Didn't work?",
      qsNextFailLink: "See FAQ",
      faqPageTitle: "FAQ",
      faqPageIntro: "Find your issue below. Try the quick checks first.",
      faqNext: "Next: try the steps in the app",
      faqNextLink: "Still stuck? Report an issue",
      faqQ1: "Why doesn't my key do anything?",
      faqTriage1: "Is the app running?",
      faqTriage1Hint: "Check the system tray for the OneTone icon",
      faqTriage2: "Is the key recorded correctly?",
      faqTriage2Hint: "Same key in Settings and when you test?",
      faqTriage3: "Is the voice shortcut correct?",
      faqTriage3Hint: "Try Win+H first; for Baidu etc. see question 4",
      faqQ2: "Why can't it detect my microphone?",
      faqQ3: "Why does it pick up system audio?",
      faqQ4: "How do I set up Baidu IME shortcuts?",
      faqQ5: "Can I use WeChat or Sogou IME?",
      faqQ6: "How do I reset to defaults?",
      faqQ7: "Still stuck — how do I report an issue?",
    },
  };

  function getLang() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "zh") return stored;
    return "zh";
  }

  function applyLangContent(lang) {
    const htmlLang = lang === "zh" ? "zh-CN" : "en";
    document.documentElement.lang = htmlLang;
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLangContent(lang);
    applyStrings(lang);
    loadReleaseInfo();
    document.dispatchEvent(new CustomEvent("onetone:langchange", { detail: { lang } }));
  }

  function t(lang, key) {
    return strings[lang][key] || strings.zh[key] || key;
  }

  function applyStrings(lang) {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = t(lang, key);
      if (val) el.textContent = val;
    });
    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      const val = t(lang, key);
      if (val) el.innerHTML = val;
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = t(lang, key);
      if (val) el.setAttribute("placeholder", val);
    });
  }

  function initLangToggle() {
    const btn = document.getElementById("langToggle");
    if (!btn) return;
    const lang = getLang();
    setLang(lang);
    btn.addEventListener("click", () => {
      const next = getLang() === "zh" ? "en" : "zh";
      setLang(next);
    });
  }

  function initNavActive() {
    const page = document.body.dataset.page;
    if (!page) return;
    document.querySelectorAll(`.site-nav a[data-nav="${page}"]`).forEach((a) => {
      a.classList.add("is-active");
    });
  }

  function initFromDownload() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("from") !== "download") return;
    const banner = document.getElementById("flowBanner");
    if (banner) banner.classList.remove("hidden");
  }

  function formatBytes(bytes) {
    if (!bytes || bytes < 0) return "—";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  }

  function formatDate(iso) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleDateString(getLang() === "zh" ? "zh-CN" : "en-US");
    } catch {
      return iso.slice(0, 10);
    }
  }

  async function loadReleaseInfo() {
    const card = document.getElementById("downloadMeta");
    const btn = document.getElementById("downloadBtn");
    if (!card && !btn) return;

    const lang = getLang();
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
      if (!res.ok) throw new Error("release fetch failed");
      const data = await res.json();
      const asset =
        data.assets?.find((a) => a.name.endsWith("-setup.exe")) ||
        data.assets?.find((a) => a.name.endsWith(".exe"));

      if (btn && asset) btn.href = asset.browser_download_url;
      if (btn && !asset) btn.href = data.html_url;

      if (card) {
        const ver = document.getElementById("metaVersion");
        const date = document.getElementById("metaDate");
        const size = document.getElementById("metaSize");
        if (ver) ver.textContent = data.tag_name || "—";
        if (date) date.textContent = formatDate(data.published_at);
        if (size) size.textContent = asset ? formatBytes(asset.size) : "—";
      }
      const loading = document.getElementById("metaLoading");
      if (loading) loading.hidden = true;
    } catch {
      if (btn) btn.href = `https://github.com/${REPO}/releases/latest`;
      const loading = document.getElementById("metaLoading");
      if (loading) loading.textContent = lang === "zh" ? "见 GitHub Releases" : "See GitHub Releases";
    }
  }

  function scrollToHash() {
    const hash = window.location.hash;
    if (!hash) return;
    const el = document.querySelector(hash);
    if (!el) return;
    if (el.tagName === "DETAILS") el.open = true;
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openFaqHash() {
    scrollToHash();
  }

  window.OneToneSite = { getLang, setLang, t, strings };

  document.addEventListener("DOMContentLoaded", () => {
    initLangToggle();
    initFromDownload();
    loadReleaseInfo();
    openFaqHash();
  });
})();
