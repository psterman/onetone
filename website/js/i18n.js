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
      heroTagline: "把音量键、鼠标侧键或任何你不常用的按键，变成系统语音输入的超级启动键。",
      ctaDownload: "立即免费下载",
      ctaSeeHow: "先看看怎么用",
      stepsTitle: "3 步就能用起来",
      stepsSubtitle: "无需复杂配置，开箱即用，极简体验。",
      step1Title: "选一个你常按的键",
      step1Desc: "比如键盘上的音量+键、鼠标侧键，或你不常用的按键。",
      step2Title: "录入语音启动快捷键",
      step2Desc: "让软件知道按键后该做什么。建议绑定系统自带的 Win+H。",
      step3Title: "随时随地试一下",
      step3Desc: "打开记事本或聊天框，按下你的键，语音输入面板瞬间唤醒。",
      shotsTitle: "用起来就是这样",
      shotsSubtitle: "优雅的界面，极致的轻量级体验。",
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
      stepsSubtitle: "No complex setup — get started in minutes.",
      shotsSubtitle: "A clean UI and a lightweight experience.",
      step2Title: "Record the voice-input shortcut",
      step2Desc: "Tell the app what to fire. We recommend Win+H built into Windows.",
      step3Title: "Try it anywhere",
      step3Desc: "Open Notepad or chat, press your key — voice input appears instantly.",
      step1Desc: "Volume+, a mouse side button, or any key you rarely use.",
      ctaDownload: "Download free",
      heroTagline: "Turn volume keys, side buttons, or spare keys into a super-fast voice-input trigger.",
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
      stepsTitle: "Up and running in 3 steps",
      step1Title: "Pick a key you use often",
      step1Desc: "e.g. Volume+, mouse side button",
      step2Title: "Record the voice-input key",
      step2Desc: "Try Win+H first (built-in Windows voice typing)",
      step3Title: "Try it",
      step3Desc: "Open Notepad, press your key — voice input should appear",
      shotsTitle: "What it looks like",
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
