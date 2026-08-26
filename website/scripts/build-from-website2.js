/**
 * One-shot: convert website2 prototypes → website pages (cyan + shared shell).
 * Run: node website/scripts/build-from-website2.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const W2 = path.join(ROOT, "..", "website2");

function cyanify(s) {
  return s
    .replace(/#f59e0b/gi, "#2a9cc4")
    .replace(/rgba\(\s*245\s*,\s*158\s*,\s*11/g, "rgba(42, 156, 196")
    .replace(/text-amber-400/g, "text-mac-accent")
    .replace(/hover:text-amber-400/g, "hover:text-mac-accent")
    .replace(/to-orange-400/g, "to-mac-glow")
    .replace(/\/\* Amber \*\//g, "/* Brand cyan */");
}

function extractStyle(html) {
  const m = html.match(/<style>([\s\S]*?)<\/style>/i);
  return m ? cyanify(m[1]) : "";
}

function extractBodyInner(html) {
  const m = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!m) return "";
  let body = m[1];
  // drop old header / proto tag / scroll rail (we'll re-add)
  body = body.replace(/<!--[\s\S]*?Header[\s\S]*?<\/header>/i, "");
  body = body.replace(/<header[\s\S]*?<\/header>/i, "");
  body = body.replace(/<div class="proto-tag"[\s\S]*?<\/div>/i, "");
  return cyanify(body);
}

function extractScripts(html) {
  const scripts = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const code = m[1].trim();
    if (code && !code.includes("tailwind.config")) scripts.push(cyanify(code));
  }
  return scripts.join("\n\n");
}

function pageShell({ title, desc, active, cssHrefs, bodyHtml, pageScripts, bodyClass, extraHead }) {
  const cssLinks = (cssHrefs || [])
    .map((h) => `  <link rel="stylesheet" href="${h}">`)
    .join("\n");
  const scriptTags = (pageScripts || [])
    .map((s) => `  <script src="${s}"></script>`)
    .join("\n");

  const navActive =
    active === "vision" ? "camera" : active === "agent" ? "softpad" : active;
  const nav = (key, href, icon, i18n, label) =>
    `<a href="${href}" data-nav="${key}"${navActive === key ? ' class="is-active"' : ""}><i class="ph ${icon} site-nav-icon" aria-hidden="true"></i><span data-i18n="${i18n}">${label}</span></a>`;

  return `<!DOCTYPE html>
<html lang="zh-CN" class="dark scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="js/theme-init.js"></script>
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <link rel="canonical" href="https://www.onetone.app/${active === "home" ? "" : active + ".html"}">
  <link rel="icon" href="assets/logo.png" type="image/png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/@phosphor-icons/web"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="js/tailwind-config.js"></script>
  <link rel="stylesheet" href="css/tokens.css">
  <link rel="stylesheet" href="css/shell.css">
${cssLinks}
${extraHead || ""}
</head>
<body class="${bodyClass || "antialiased"}" data-page="${active}">
<header class="site-header">
  <div class="site-header-inner">
    <a class="site-brand" href="index.html">
      <span class="brand-mark" aria-hidden="true"></span>
      <span data-i18n="siteName">一声 OneTone</span>
    </a>
    <nav class="site-nav" aria-label="Main">
      ${nav("home", "index.html", "ph-house", "navHome", "首页")}
      ${nav("voice", "quickstart.html#voice", "ph-microphone", "navVoice", "语音")}
      ${nav("keys", "quickstart.html#keys", "ph-keyboard", "navKeys", "按键")}
      ${nav("camera", "vision.html", "ph-camera", "navCamera", "摄像头")}
      ${nav("softpad", "agent.html", "ph-squares-four", "navSoftPad", "SoftPad")}
      ${nav("faq", "faq.html", "ph-question", "navFaq", "帮助")}
    </nav>
    <div class="site-header-actions">
      <button type="button" class="lang-toggle" id="langToggle" data-i18n="langToggle">EN</button>
      <a class="nav-cta" href="download.html" data-i18n="navDownload">下载</a>
      <button type="button" class="mobile-nav-toggle" id="mobileNavToggle" aria-label="菜单" aria-expanded="false">
        <i class="ph ph-list text-xl"></i>
      </button>
    </div>
  </div>
</header>
<div class="mobile-nav-panel" id="mobileNavPanel">
  ${nav("home", "index.html", "ph-house", "navHome", "首页")}
  ${nav("voice", "quickstart.html#voice", "ph-microphone", "navVoice", "语音")}
  ${nav("keys", "quickstart.html#keys", "ph-keyboard", "navKeys", "按键")}
  ${nav("camera", "vision.html", "ph-camera", "navCamera", "摄像头")}
  ${nav("softpad", "agent.html", "ph-squares-four", "navSoftPad", "SoftPad")}
  ${nav("faq", "faq.html", "ph-question", "navFaq", "帮助")}
  <a href="download.html" data-nav="download" data-i18n="navDownload">下载</a>
</div>
${bodyHtml}
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
${scriptTags}
</body>
</html>
`;
}

function stripPageLocalChrome(body) {
  // Remove prototype header leftovers and old fixed nav if any slipped through
  return body
    .replace(/<nav class="scroll-rail"[\s\S]*?<\/nav>/i, (m) => m) // keep rail on home
    .replace(/href="01-overview-ac\.html"/g, 'href="index.html"')
    .replace(/href="04-usage\.html"/g, 'href="quickstart.html"')
    .replace(/href="05-camera\.html"/g, 'href="vision.html"')
    .replace(/href="02-install\.html"/g, 'href="download.html"')
    .replace(/href="03-capabilities\.html"/g, 'href="agent.html"')
    .replace(/href="#"/g, (match, offset, str) => {
      // leave internal # anchors alone — only bare href="#"
      return 'href="index.html"';
    });
}

function fixHomeBody(body) {
  // Replace bare # brand/cta with real links; keep section anchors
  body = body.replace(
    /<nav class="scroll-rail"[\s\S]*?<\/nav>\s*/i,
    ""
  );
  // Re-inject scroll rail at top of body content
  const rail = `<nav class="scroll-rail" aria-label="Scroll sections">
    <button type="button" class="rail-dot is-active" data-target="#sec-hero" aria-label="首屏"></button>
    <button type="button" class="rail-dot" data-target="#sec-chain" aria-label="链路"></button>
    <button type="button" class="rail-dot" data-target="#sec-caps" aria-label="心流"></button>
  </nav>
`;
  // Fix download CTAs that became index.html incorrectly — look for 下载体验
  body = body.replace(
    /<a href="index\.html" class="text-sm font-semibold bg-white[^"]*"[^>]*>\s*下载体验\s*<\/a>/,
    '<a href="download.html" class="text-sm font-semibold bg-white text-black px-4 py-2 rounded-full hover:bg-gray-200 transition-colors">下载体验</a>'
  );
  // Remove duplicate old nav block if present inside body
  body = body.replace(
    /<header class="fixed top-0[\s\S]*?<\/header>\s*/i,
    ""
  );
  // Extract main only if present
  const mainMatch = body.match(/<main[\s\S]*<\/main>/i);
  const scriptsInBody = body.match(/<script[\s\S]*?<\/script>/gi) || [];
  let main = mainMatch ? mainMatch[0] : body.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Don't include inline scripts in body — they go to js file
  main = main.replace(/<script[\s\S]*?<\/script>/gi, "");
  return rail + main;
}

function processHome() {
  const src = fs.readFileSync(path.join(W2, "code_artifact (2).html"), "utf8");
  let css = extractStyle(src);
  // Drop body/font resets already in tokens; keep page-specific
  css = css
    .replace(/\/\* 基础重置 \*\/[\s\S]*?overflow-x: hidden; \}/, "")
    .replace(/body\s*\{[^}]+\}/, "")
    .replace(/\.mac-glass\s*\{[\s\S]*?\}/, "/* mac-glass in tokens.css */")
    .replace(/\.scroll-rail\s*\{[\s\S]*?\}/, "/* scroll-rail in shell.css */")
    .replace(/\.rail-dot[^{]*\{[^}]+\}/g, "")
    .replace(/\.rail-dot\.is-active\s*\{[^}]+\}/, "")
    .replace(/\.spatial-grid-wrap\s*\{[^}]+\}/, "/* spatial-grid in tokens */")
    .replace(/\.spatial-grid\s*\{[\s\S]*?\}/, "")
    .replace(/@keyframes grid-move\s*\{[\s\S]*?\}/, "");

  // Replace hardcoded amber rgba leftovers that cyanify might miss in comments
  css = cyanify(css);
  // Fix command-item active using brand rgb
  css = css.replace(
    /\.command-item\.is-active\s*\{[^}]+\}/,
    `.command-item.is-active { background: rgba(42,156,196,0.1); border-color: rgba(42,156,196,0.3); }`
  );
  css = css.replace(
    /\.status-pill\s*\{[^}]+\}/,
    `.status-pill { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 99px; background: rgba(42,156,196,0.15); color: var(--mac-accent); font-size: 13px; font-weight: 500; width: fit-content; }`
  );
  css = css.replace(
    /\.home-ime-voice-bar\.is-active\s*\{[^}]+\}/,
    `.home-ime-voice-bar.is-active { background: rgba(42,156,196,0.1); color: var(--mac-accent); border: 1px solid rgba(42,156,196,0.2); }`
  );

  // Responsive for command/flow grids
  css += `
@media (max-width: 900px) {
  .command-window { grid-template-columns: 1fr; }
  .flow-card { grid-template-columns: 1fr; }
  .demo-status-panel { display: none !important; }
  #sec-hero { padding-top: 96px; padding-bottom: 64px; min-height: auto; }
}
.op-demo-stage { position: relative; }
`;

  fs.writeFileSync(path.join(ROOT, "css", "home.css"), css);

  const js = extractScripts(src);
  fs.writeFileSync(
    path.join(ROOT, "js", "home-demo.js"),
    js.includes("DOMContentLoaded")
      ? js
      : `document.addEventListener("DOMContentLoaded", () => {\n${js}\n});`
  );

  let body = extractBodyInner(src);
  body = fixHomeBody(body);
  // Fix any remaining wrong download links in hero area - the header was removed
  // Hero rotate section is fine

  const html = pageShell({
    title: "一声 OneTone — 外设一键开语音输入",
    desc: "OneTone 把鼠标侧键、音量键等外设变成语音输入开关。继续用现有语音输入法，按一下就能说。适用于 Windows 10/11。",
    active: "home",
    cssHrefs: ["css/home.css"],
    bodyHtml: body,
    pageScripts: ["js/home-demo.js"],
    bodyClass: "antialiased",
  });
  // Fix canonical for home
  const out = html.replace(
    'href="https://www.onetone.app/home.html"',
    'href="https://www.onetone.app/"'
  );
  fs.writeFileSync(path.join(ROOT, "index.html"), out);
  console.log("wrote index.html, css/home.css, js/home-demo.js");
}

function processGeneric({ srcName, outHtml, outCss, outJs, active, title, desc, linkRewrite }) {
  const src = fs.readFileSync(path.join(W2, srcName), "utf8");
  let css = cyanify(extractStyle(src));
  // Strip shared pieces
  css = css
    .replace(/:root\s*\{[\s\S]*?\}/, "/* tokens in tokens.css */")
    .replace(/body\s*\{[\s\S]*?\}/, "")
    .replace(/body::before\s*\{[\s\S]*?\}/, "")
    .replace(/@keyframes grid-move\s*\{[\s\S]*?\}/, "")
    .replace(/\.mac-glass\s*\{[\s\S]*?\}/, "/* mac-glass in tokens.css */")
    .replace(/\.site-header[\s\S]*?\.proto-tag[^{]*\{[^}]+\}/, "/* shell */")
    .replace(/\.site-header[\s\S]*?\.nav-cta[^{]*\{[^}]+\}/, "");

  fs.writeFileSync(path.join(ROOT, "css", outCss), css);

  let js = extractScripts(src);
  if (js) {
    if (!/DOMContentLoaded/.test(js) && !/^\s*\(function/.test(js)) {
      js = `document.addEventListener("DOMContentLoaded", () => {\n${js}\n});`;
    }
    fs.writeFileSync(path.join(ROOT, "js", outJs), js);
  }

  let body = extractBodyInner(src);
  // Remove old header/nav/proto
  body = body.replace(/<div class="proto-tag"[\s\S]*?<\/div>\s*/i, "");
  body = body.replace(/<header[\s\S]*?<\/header>\s*/i, "");
  body = body.replace(/href="01-overview-ac\.html"/g, 'href="index.html"');
  body = body.replace(/href="04-usage\.html"/g, 'href="quickstart.html"');
  body = body.replace(/href="05-camera\.html"/g, 'href="vision.html"');
  body = body.replace(/href="02-install\.html"/g, 'href="download.html"');
  body = body.replace(/href="03-capabilities\.html"/g, 'href="agent.html"');
  if (linkRewrite) body = linkRewrite(body);

  // Keep main + maybe other content; strip inline scripts
  body = body.replace(/<script[\s\S]*?<\/script>/gi, "");

  // Wrap usage-main if needed
  if (!body.includes("<main") && body.includes("usage-main")) {
    body = `<main>${body}</main>`;
  } else if (!body.includes("<main")) {
    body = `<main class="page-main">${body}</main>`;
  }

  const scripts = outJs ? [`js/${outJs}`] : [];
  const html = pageShell({
    title,
    desc,
    active,
    cssHrefs: [`css/${outCss}`],
    bodyHtml: body,
    pageScripts: scripts,
  });
  fs.writeFileSync(path.join(ROOT, outHtml), html);
  console.log("wrote", outHtml, outCss, outJs || "(no js)");
}

processHome();

processGeneric({
  srcName: "code_artifact (3).html",
  outHtml: "quickstart.html",
  outCss: "quickstart.css",
  outJs: "quickstart-demo.js",
  active: "quickstart",
  title: "语音与按键 — 一声 OneTone",
  desc: "三步定制语音触发：选外设、绑定输入法、说完自动上屏。",
});

processGeneric({
  srcName: "code_artifact (1).html",
  outHtml: "vision.html",
  outCss: "vision.css",
  outJs: "vision-demo.js",
  active: "vision",
  title: "摄像头 — 一声 OneTone",
  desc: "摄像头本地触发：眨眼、摇头、举手与离席遮罩。不上传云端。",
});

processGeneric({
  srcName: "onetone_codex_micro_virtual_hud (1).html",
  outHtml: "agent.html",
  outCss: "agent.css",
  outJs: "agent-demo.js",
  active: "agent",
  title: "SoftPad — 一声 OneTone",
  desc: "屏幕上的虚拟小键盘：说口令、看 Agent 忙不忙、数字键也能跟。",
});

console.log("done");
