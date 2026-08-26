/**
 * Normalize SoftPad nav label (avoid Agent / 快捷台 drift).
 * Run: node website/scripts/soften-nav.js
 */
const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, "utf8");
  const n = s
    .replace(/>Agent</g, ">SoftPad<")
    .replace(/>快捷台</g, ">SoftPad<");
  if (n !== s) {
    fs.writeFileSync(p, n);
    console.log("nav", f);
  }
}
