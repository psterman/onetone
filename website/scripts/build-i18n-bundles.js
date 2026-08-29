/**
 * Split i18n strings into core + per-page bundles.
 * Orphan keys (not in HTML) are assigned by prefix heuristics.
 * Run: node website/scripts/build-i18n-bundles.js
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const I18N_PATH = path.join(ROOT, "js", "i18n.js");
const OUT_DIR = path.join(ROOT, "js", "i18n-bundles");

const PAGE_FILES = {
  home: ["index.html"],
  quickstart: ["quickstart.html"],
  keys: ["keys.html"],
  vision: ["vision.html"],
  agent: ["agent.html"],
  download: ["download.html"],
  faq: ["faq.html"],
  misc: ["changelog.html", "privacy.html", "terms.html", "support.html", "404.html"],
};

const PREFIX_PAGE = [
  [/^(home|hero|pos|user|persona|jump|chapter|outcome|pad|command|flow|brand|quote|homeCh|homeBridge|homeStory|homeQuote|secPosition|scrollRail)/, "home"],
  [/^(qs|trigger|ime|qsZ|qsZone|qsStep|qsSuccess|qsGuide|qsHero|qsSide|qsVoice|qsOnboard|qsIme|qsRecord|qsInstall|qsMore|qsNext|flowBanner)/, "quickstart"],
  [/^(keysToc)/, "keys"],
  [/^(vision|vf|vs|gesture)/i, "vision"],
  [/^(agent|padTeaser|padCopy|softpad)/i, "agent"],
  [/^(dl|download|roadmap|update|smartscreen|release)/i, "download"],
  [/^(faq)/i, "faq"],
];

const CORE_ALWAYS = new Set([
  "siteName", "navDownload", "navHome", "navVoice", "navKeys", "navCamera", "navSoftPad",
  "navQuickstart", "navFaq", "navScenes", "langToggle", "footerColProduct", "footerColStart",
  "footerColOpen", "footerColLegal", "footerGithub", "footerReport", "footerSupport",
  "footerPrivacy", "footerTerms", "footerChangelog", "footerFeatures", "otFinalCtaTitle",
  "otFinalCtaDownload", "otFinalCtaDocs", "otFinalCtaCommunity", "otFinalCtaFeedback",
  "ctaBannerTitle", "ctaBannerBtn", "nextStepHome", "nextStepHomeLink",
]);

function extractStrings() {
  const src = fs.readFileSync(I18N_PATH, "utf8");
  if (src.includes("mergeI18nBundles") && fs.existsSync(OUT_DIR)) {
    const merged = { zh: {}, en: {} };
    fs.readdirSync(OUT_DIR)
      .filter((f) => f.endsWith(".js"))
      .forEach((f) => {
        const sandbox = { window: { OneToneI18nBundles: { zh: {}, en: {} } } };
        vm.runInNewContext(fs.readFileSync(path.join(OUT_DIR, f), "utf8"), sandbox);
        Object.assign(merged.zh, sandbox.window.OneToneI18nBundles.zh);
        Object.assign(merged.en, sandbox.window.OneToneI18nBundles.en);
      });
    if (Object.keys(merged.zh).length) return merged;
  }
  const start = src.indexOf("const strings = {");
  if (start < 0) throw new Error("no strings in i18n.js and no bundles");
  const end = src.indexOf("\n  };", start) + 5;
  const block = src.slice(start, end);
  const sandbox = {};
  vm.runInNewContext(block.replace("const strings", "strings"), sandbox);
  return sandbox.strings;
}

function keysForHtml(file) {
  const html = fs.readFileSync(path.join(ROOT, file), "utf8");
  const keys = new Set();
  for (const m of html.matchAll(/data-i18n(?:-html|-placeholder)?="([^"]+)"/g)) {
    keys.add(m[1]);
  }
  return keys;
}

function guessPage(key) {
  for (const [re, page] of PREFIX_PAGE) {
    if (re.test(key)) return page;
  }
  return "misc";
}

function writeBundle(name, zh, en) {
  const out = `/* generated: ${name} */\n(function () {\n  window.OneToneI18nBundles = window.OneToneI18nBundles || { zh: {}, en: {} };\n  Object.assign(window.OneToneI18nBundles.zh, ${JSON.stringify(zh)});\n  Object.assign(window.OneToneI18nBundles.en, ${JSON.stringify(en)});\n})();\n`;
  fs.writeFileSync(path.join(OUT_DIR, `${name}.js`), out, "utf8");
}

const allStrings = extractStrings();
const htmlKeys = new Set();
Object.values(PAGE_FILES).flat().forEach((f) => keysForHtml(f).forEach((k) => htmlKeys.add(k)));

const pageKeys = {};
Object.keys(PAGE_FILES).forEach((p) => (pageKeys[p] = new Set()));
htmlKeys.forEach((k) => {
  if (CORE_ALWAYS.has(k)) return;
  const owners = new Set();
  Object.entries(PAGE_FILES).forEach(([page, files]) => {
    files.forEach((f) => {
      if (keysForHtml(f).has(k)) owners.add(page);
    });
  });
  if (owners.size === 1) {
    pageKeys[[...owners][0]].add(k);
  } else if (owners.size > 1) {
    CORE_ALWAYS.add(k);
  } else {
    pageKeys[guessPage(k)].add(k);
  }
});

// Prefix-assign all remaining keys
Object.keys(allStrings.zh).forEach((k) => {
  if (CORE_ALWAYS.has(k)) return;
  let placed = false;
  for (const page of Object.keys(pageKeys)) {
    if (pageKeys[page].has(k)) {
      placed = true;
      break;
    }
  }
  if (!placed) pageKeys[guessPage(k)].add(k);
});

const bundles = { core: { zh: {}, en: {} } };
CORE_ALWAYS.forEach((k) => {
  if (allStrings.zh[k] !== undefined) bundles.core.zh[k] = allStrings.zh[k];
  if (allStrings.en[k] !== undefined) bundles.core.en[k] = allStrings.en[k];
});

Object.keys(PAGE_FILES).forEach((page) => {
  bundles[page] = { zh: {}, en: {} };
  pageKeys[page].forEach((k) => {
    if (CORE_ALWAYS.has(k)) return;
    if (allStrings.zh[k] !== undefined) bundles[page].zh[k] = allStrings.zh[k];
    if (allStrings.en[k] !== undefined) bundles[page].en[k] = allStrings.en[k];
  });
});

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
Object.entries(bundles).forEach(([name, data]) => writeBundle(name, data.zh, data.en));

const PAGE_BUNDLES = {
  home: ["core", "home"],
  quickstart: ["core", "quickstart"],
  keys: ["core", "quickstart", "keys"],
  vision: ["core", "vision"],
  agent: ["core", "agent"],
  download: ["core", "download"],
  faq: ["core", "faq"],
  misc: ["core", "misc"],
};
fs.writeFileSync(path.join(OUT_DIR, "manifest.json"), JSON.stringify(PAGE_BUNDLES, null, 2));

console.log(
  Object.entries(bundles)
    .map(([n, d]) => `${n}=${Object.keys(d.zh).length}`)
    .join(", ")
);
