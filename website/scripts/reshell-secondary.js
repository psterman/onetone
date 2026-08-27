/**
 * Re-shell secondary pages onto dark HUD chrome.
 * Run: node website/scripts/reshell-secondary.js
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

function shellParts(active) {
  const navKey =
    active === "vision" ? "camera" : active === "agent" ? "softpad" : active;
  const nav = (key, href, icon, i18n, label) =>
    `<a href="${href}" data-nav="${key}"${navKey === key ? ' class="is-active"' : ""}><i class="ph ${icon} site-nav-icon" aria-hidden="true"></i><span data-i18n="${i18n}">${label}</span></a>`;
  return {
    headStart(title, desc, extraCss) {
      return `<!DOCTYPE html>
<html lang="zh-CN" class="dark scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="js/theme-init.js"></script>
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="https://www.onetone.app/${active}.html">
  <link rel="icon" href="assets/logo.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@phosphor-icons/web"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="js/tailwind-config.js"></script>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/shell.css?v=20260826h">
${extraCss}
</head>
<body class="antialiased" data-page="${active}">
`;
    },
    header: `<header class="site-header">
  <div class="site-header-inner">
    <a class="site-brand" href="index.html">
      <img class="brand-mark" src="assets/logo.png" alt="" width="24" height="24">
      <span data-i18n="siteName">一声 OneTone</span>
    </a>
    <nav class="site-nav" aria-label="Main">
      ${nav("home", "index.html", "ph-house", "navHome", "首页")}
      ${nav("voice", "quickstart.html#voice", "ph-microphone", "navVoice", "语音")}
      ${nav("keys", "keys.html", "ph-keyboard", "navKeys", "按键")}
      ${nav("camera", "vision.html", "ph-camera", "navCamera", "摄像头")}
      ${nav("softpad", "agent.html", "ph-squares-four", "navSoftPad", "SoftPad")}
      ${nav("faq", "faq.html", "ph-question", "navFaq", "帮助")}
    </nav>
    <div class="site-header-actions">
      <button type="button" class="lang-toggle" id="langToggle" data-i18n="langToggle">EN</button>
      <a class="nav-cta${active === "download" ? " is-active" : ""}" href="download.html" data-i18n="navDownload">下载</a>
      <button type="button" class="mobile-nav-toggle" id="mobileNavToggle" aria-label="菜单" aria-expanded="false">
        <i class="ph ph-list text-xl"></i>
      </button>
    </div>
  </div>
</header>
<div class="mobile-nav-panel" id="mobileNavPanel">
  ${nav("home", "index.html", "ph-house", "navHome", "首页")}
  ${nav("voice", "quickstart.html#voice", "ph-microphone", "navVoice", "语音")}
  ${nav("keys", "keys.html", "ph-keyboard", "navKeys", "按键")}
  ${nav("camera", "vision.html", "ph-camera", "navCamera", "摄像头")}
  ${nav("softpad", "agent.html", "ph-squares-four", "navSoftPad", "SoftPad")}
  ${nav("faq", "faq.html", "ph-question", "navFaq", "帮助")}
  <a href="download.html" data-nav="download" data-i18n="navDownload">下载</a>
</div>
`,
    footer: `<section id="site-download-cta" class="site-download-cta" aria-label="Download" data-section="5">
  <div class="site-download-cta-inner">
    <h2 class="site-download-cta-title" data-i18n="ctaBannerTitle">立即试用一声。</h2>
    <a class="site-download-cta-btn" href="download.html">
      <span data-i18n="ctaBannerBtn">下载 Windows 版本</span>
      <i class="ph ph-download-simple" aria-hidden="true"></i>
    </a>
  </div>
</section>
<footer class="site-footer">
  <div class="site-footer-inner">
    <span data-i18n="footerCopy">© 2026 一声 OneTone</span>
    <nav>
      <a href="changelog.html" data-i18n="footerChangelog">更新日志</a>
      <a href="privacy.html" data-i18n="footerPrivacy">隐私政策</a>
      <a href="terms.html" data-i18n="footerTerms">服务条款</a>
      <a href="https://github.com/psterman/onetone" target="_blank" rel="noopener noreferrer" data-i18n="footerGithub">GitHub</a>
      <a href="https://github.com/psterman/onetone/issues/new?template=bug_report.yml" data-i18n="footerReport">反馈问题</a>
      <a href="support.html" data-i18n="footerSupport">支持项目</a>
    </nav>
  </div>
</footer>
<script src="js/shell.js"></script>
<script src="js/i18n.js"></script>
`,
  };
}

function extractMain(html) {
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  return m ? m[0] : "";
}

function extractExtraScripts(html) {
  // scripts at end that aren't theme/tailwind/i18n/site
  const scripts = [];
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1] || "";
    const src = (attrs.match(/src="([^"]+)"/) || [])[1];
    if (!src) continue;
    if (/theme-init|tailwind|i18n|shell\.js/.test(src)) continue;
    if (/site\.js/.test(src)) continue; // drop old site.js
    scripts.push(`<script src="${src}"></script>`);
  }
  return scripts.join("\n");
}

function reshell(file, active, title, desc, extraCssLinks) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const parts = shellParts(active);
  const main = extractMain(src);
  if (!main) {
    console.error("no main in", file);
    return;
  }
  const css = (extraCssLinks || [])
    .map((h) => `  <link rel="stylesheet" href="${h}">`)
    .join("\n");
  const extraScripts = extractExtraScripts(src);
  const out =
    parts.headStart(title, desc, css) +
    parts.header +
    main +
    "\n" +
    parts.footer +
    (extraScripts ? extraScripts + "\n" : "") +
    "</body>\n</html>\n";
  fs.writeFileSync(path.join(ROOT, file), out);
  console.log("reshelled", file);
}

// Download — keep main from current file then rewrite header via reshell after we patch body classes
reshell(
  "download.html",
  "download",
  "下载 — 一声 OneTone",
  "下载一声 Windows 安装包。适用于 Windows 10/11。",
  ["css/download.css"]
);

reshell(
  "faq.html",
  "faq",
  "帮助与排错 — 一声 OneTone",
  "一声 OneTone 常见问题：按键没反应、录键失败、麦克风、输入法快捷键与恢复设置。",
  ["css/faq.css"]
);

reshell(
  "support.html",
  "support",
  "支持项目 — 一声 OneTone",
  "通过爱发电自愿支持一声 OneTone 的持续维护与改进。",
  ["css/support.css"]
);

// Legal / utility — rewrite fully if main missing pieces
function writeSimple(file, active, title, mainHtml) {
  const parts = shellParts(active);
  const out =
    parts.headStart(title, title, "") +
    parts.header +
    mainHtml +
    "\n" +
    parts.footer +
    "</body>\n</html>\n";
  // fix canonical for non-standard
  fs.writeFileSync(path.join(ROOT, file), out.replace(`/${active}.html`, `/${file}`));
  console.log("wrote", file);
}

const privacyMain = extractMain(fs.readFileSync(path.join(ROOT, "privacy.html"), "utf8"));
writeSimple(
  "privacy.html",
  "privacy",
  "隐私政策 — 一声 OneTone",
  privacyMain
    ? privacyMain
        .replace(/text-slate-\d+/g, "text-mac-textMuted")
        .replace(/dark:text-\S+/g, "")
        .replace(/class="max-w-2xl mx-auto px-6 pb-12[^"]*"/, 'class="page-main max-w-2xl mx-auto px-6 pb-16 prose-dark"')
    : `<main class="page-main max-w-2xl mx-auto px-6 pb-16 prose-dark"><h1>隐私政策</h1></main>`
);

const termsSrc = fs.readFileSync(path.join(ROOT, "terms.html"), "utf8");
const termsMain = extractMain(termsSrc);
writeSimple(
  "terms.html",
  "terms",
  "服务条款 — 一声 OneTone",
  termsMain
    ? termsMain
        .replace(/text-slate-\d+/g, "text-mac-textMuted")
        .replace(/dark:text-\S+/g, "")
        .replace(/class="max-w-2xl mx-auto px-6 pb-12[^"]*"/, 'class="page-main max-w-2xl mx-auto px-6 pb-16 prose-dark"')
    : `<main class="page-main max-w-2xl mx-auto px-6 pb-16 prose-dark"><h1>服务条款</h1></main>`
);

const changelogMain = extractMain(fs.readFileSync(path.join(ROOT, "changelog.html"), "utf8"));
writeSimple(
  "changelog.html",
  "changelog",
  "更新日志 — 一声 OneTone",
  changelogMain
    ? changelogMain
        .replace(/text-slate-\d+/g, "text-mac-textMuted")
        .replace(/dark:text-\S+/g, "")
        .replace(/class="max-w-2xl mx-auto px-6 pb-12"/, 'class="page-main max-w-2xl mx-auto px-6 pb-16 prose-dark"')
        .replace(/text-brand-600/g, "text-mac-accent")
        .replace(/class="text-3xl font-bold mb-4"/, 'class="text-3xl font-bold mb-4 text-white"')
        .replace(/class="text-xl font-bold mb-2"/g, 'class="text-xl font-bold mb-2 text-white"')
    : `<main class="page-main max-w-2xl mx-auto px-6 pb-16 prose-dark"><h1>更新日志</h1></main>`
);

writeSimple(
  "404.html",
  "404",
  "404 — 一声 OneTone",
  `<main class="page-main flex-1 flex items-center justify-center min-h-[70vh]">
  <div class="text-center px-6">
    <p class="text-8xl font-black text-mac-accent mb-4">404</p>
    <p class="text-mac-textMuted mb-8">页面不存在 · Page not found</p>
    <a href="index.html" class="nav-cta inline-flex">返回首页</a>
  </div>
</main>`
);

console.log("secondary done");
