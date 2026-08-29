/**
 * Patch production HTML: async fonts, built Tailwind, static nav chrome.
 * Run: node website/scripts/sync-site-chrome.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const I18N_MANIFEST = JSON.parse(
  fs.readFileSync(path.join(ROOT, "js", "i18n-bundles", "manifest.json"), "utf8")
);
const PAGES = [
  "index.html",
  "quickstart.html",
  "keys.html",
  "vision.html",
  "agent.html",
  "download.html",
  "faq.html",
  "changelog.html",
  "privacy.html",
  "terms.html",
  "support.html",
  "404.html",
];

/** Pages with #story-world scroll narrative (gsap + scroll-reveal + site-scroll). */
const CONTENT_SCROLL_PAGES = new Set([
  "quickstart.html",
  "keys.html",
  "vision.html",
  "agent.html",
  "faq.html",
]);

const GSAP_CDN = "https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js";
const CONTENT_SCROLL_HEAD =
  '  <link rel="stylesheet" href="css/site-scroll.css">';
const CONTENT_SCROLL_SCRIPTS = [
  `<script src="${GSAP_CDN}"></script>`,
  '<script src="js/scroll-reveal.js"></script>',
  '<script src="js/site-scroll.js"></script>',
].join("\n");

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";

const OLD_HEAD_BLOCK =
  /<link href="https:\/\/fonts\.googleapis\.com\/css2\?family=Inter[^"]+" rel="stylesheet">\s*<script src="https:\/\/unpkg\.com\/@phosphor-icons\/web"><\/script>\s*<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*<script src="js\/tailwind-config\.js"><\/script>/;

const NEW_HEAD_BLOCK = `<link rel="stylesheet" href="${FONT_URL}" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="${FONT_URL}"></noscript>
  <link rel="stylesheet" href="css/tailwind.built.css">
  <script defer src="https://unpkg.com/@phosphor-icons/web"></script>`;

function activeNavKey(file) {
  if (file === "index.html") return "home";
  if (file === "quickstart.html") return "quickstart";
  if (file === "download.html") return "download";
  if (file === "faq.html") return "faq";
  if (["keys.html", "vision.html", "agent.html"].includes(file)) return "scenes";
  return null;
}

function navLink(key, href, icon, i18n, label, active) {
  const on = active === key;
  const cls = on ? ' class="is-active"' : "";
  const ic = on ? icon.replace(/^ph /, "ph-fill ") : icon;
  return `<a href="${href}" data-nav="${key}"${cls}><i class="${ic} site-nav-icon" aria-hidden="true"></i><span data-i18n="${i18n}">${label}</span></a>`;
}

function desktopNav(active) {
  const scenesOn = active === "scenes";
  const scenesIcon = scenesOn ? "ph-fill ph-squares-four" : "ph ph-squares-four";
  return `<nav class="site-nav" aria-label="Main">
      ${navLink("home", "index.html", "ph ph-house", "navHome", "首页", active)}
      ${navLink("quickstart", "quickstart.html", "ph ph-rocket-launch", "navQuickstart", "上手", active)}
      <div class="site-nav-scenes${scenesOn ? " is-active" : ""}">
        <button type="button" aria-expanded="false" aria-haspopup="true" data-nav="scenes">
          <i class="${scenesIcon} site-nav-icon" aria-hidden="true"></i>
          <span data-i18n="navScenes">场景</span>
          <i class="ph ph-caret-down" aria-hidden="true"></i>
        </button>
        <div class="site-nav-scenes-menu" role="menu">
          <a href="quickstart.html#voice" role="menuitem"><i class="ph ph-microphone"></i><span data-i18n="navVoice">语音</span></a>
          <a href="keys.html" role="menuitem"><i class="ph ph-keyboard"></i><span data-i18n="navKeys">按键</span></a>
          <a href="vision.html" role="menuitem"><i class="ph ph-camera"></i><span data-i18n="navCamera">摄像头</span></a>
          <a href="agent.html" role="menuitem"><i class="ph ph-squares-four"></i><span data-i18n="navSoftPad">SoftPad</span></a>
        </div>
      </div>
      ${navLink("faq", "faq.html", "ph ph-question", "navFaq", "帮助", active)}
      ${navLink("download", "download.html", "ph ph-download-simple", "navDownload", "下载", active)}
    </nav>`;
}

function mobilePanel(active) {
  const scenesLinks = [
    ["quickstart.html#voice", "navVoice", "ph-microphone", "语音"],
    ["keys.html", "navKeys", "ph-keyboard", "按键"],
    ["vision.html", "navCamera", "ph-camera", "摄像头"],
    ["agent.html", "navSoftPad", "ph-squares-four", "SoftPad"],
  ]
    .map(
      ([href, i18n, icon, label]) =>
        `<a href="${href}"><i class="ph ${icon} site-nav-icon"></i><span data-i18n="${i18n}">${label}</span></a>`
    )
    .join("\n  ");

  return `<div class="mobile-nav-panel" id="mobileNavPanel">
  ${navLink("home", "index.html", "ph ph-house", "navHome", "首页", active)}
  ${navLink("quickstart", "quickstart.html", "ph ph-rocket-launch", "navQuickstart", "上手", active)}
  <span class="mobile-scenes-label" data-i18n="navScenes">场景</span>
  ${scenesLinks}
  ${navLink("faq", "faq.html", "ph ph-question", "navFaq", "帮助", active)}
  ${navLink("download", "download.html", "ph ph-download-simple", "navDownload", "下载", active)}
</div>`;
}

function pageBundleKey(file) {
  if (file === "index.html") return "home";
  const base = file.replace(/\.html$/, "");
  return I18N_MANIFEST[base] ? base : "misc";
}

function i18nScriptTags(file) {
  const bundles = I18N_MANIFEST[pageBundleKey(file)] || I18N_MANIFEST.misc;
  return bundles
    .map((b) => `  <script src="js/i18n-bundles/${b}.js"></script>`)
    .concat('  <script src="js/i18n.js"></script>')
    .join("\n");
}

function ensureContentScrollPackage(html, file) {
  if (!CONTENT_SCROLL_PAGES.has(file)) return html;

  if (!html.includes("css/site-scroll.css")) {
    const otLink = '<link rel="stylesheet" href="css/ot-components.css">';
    if (html.includes(otLink)) {
      html = html.replace(otLink, `${CONTENT_SCROLL_HEAD}\n  ${otLink}`);
    } else {
      html = html.replace("</head>", `${CONTENT_SCROLL_HEAD}\n</head>`);
    }
  }

  if (!html.includes("js/site-scroll.js")) {
    html = html.replace(
      /<script src="js\/shell\.js"><\/script>/,
      `${CONTENT_SCROLL_SCRIPTS}\n<script src="js/shell.js"></script>`
    );
    return html;
  }

  if (!html.includes("js/scroll-reveal.js")) {
    html = html.replace(
      /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"]+"><\/script>\n/,
      `$&<script src="js/scroll-reveal.js"></script>\n`
    );
  }

  return html;
}

function patchFile(file) {
  const filePath = path.join(ROOT, file);
  if (!fs.existsSync(filePath)) return false;
  let html = fs.readFileSync(filePath, "utf8");
  const active = activeNavKey(file);

  if (!OLD_HEAD_BLOCK.test(html) && !html.includes("tailwind.built.css")) {
    console.warn("skip head (already patched or unknown):", file);
  } else {
    html = html.replace(OLD_HEAD_BLOCK, NEW_HEAD_BLOCK);
  }

  const navRe = /<nav class="site-nav" aria-label="Main">[\s\S]*?<\/nav>/;
  if (navRe.test(html)) {
    html = html.replace(navRe, desktopNav(active));
  }

  const mobileRe = /<div class="mobile-nav-panel" id="mobileNavPanel">[\s\S]*?<\/div>/;
  if (mobileRe.test(html)) {
    html = html.replace(mobileRe, mobilePanel(active));
  }

  html = html.replace(
    /<div class="site-header-actions">[\s\S]*?<\/div>\s*<\/div>\s*<\/header>/,
    (block) => block.replace(/\s*<a class="nav-cta"[^>]*>[\s\S]*?<\/a>/, "")
  );

  const i18nBlock = i18nScriptTags(file);
  html = html.replace(
    /(?:\s*<script src="js\/i18n-bundles\/[^"]+\.js"><\/script>)*\s*<script src="js\/i18n\.js"><\/script>/,
    "\n" + i18nBlock
  );

  html = ensureContentScrollPackage(html, file);

  fs.writeFileSync(filePath, html, "utf8");
  console.log("patched:", file);
  return true;
}

let n = 0;
PAGES.forEach((f) => {
  if (patchFile(f)) n++;
});
console.log("done:", n, "files");
