/**
 * Replace inline strings in i18n.js with bundle merge (run after build-i18n-bundles).
 * Run: node website/scripts/strip-i18n-strings.js
 */
const fs = require("fs");
const path = require("path");

const I18N_PATH = path.join(__dirname, "..", "js", "i18n.js");
let src = fs.readFileSync(I18N_PATH, "utf8");

const start = src.indexOf("const strings = {");
const end = src.indexOf("\n  };", start) + 5;
if (start < 0 || end < start) {
  console.error("strings block not found");
  process.exit(1);
}

if (src.includes("mergeI18nBundles")) {
  console.log("i18n.js already uses bundles");
  process.exit(0);
}

const replacement = `const strings = { zh: {}, en: {} };

  function mergeI18nBundles() {
    const b = window.OneToneI18nBundles;
    if (!b) return;
    if (b.zh) Object.assign(strings.zh, b.zh);
    if (b.en) Object.assign(strings.en, b.en);
  }
  mergeI18nBundles();`;

if (!src.includes("mergeI18nBundles")) {
  src = src.slice(0, start) + replacement + src.slice(end);
  fs.writeFileSync(I18N_PATH, src, "utf8");
  console.log("stripped inline strings from i18n.js");
} else {
  console.log("i18n.js already uses bundles");
}
