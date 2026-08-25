const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "..");
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".html"))) {
  const p = path.join(dir, f);
  let s = fs.readFileSync(p, "utf8");
  const n = s.replace(/>Agent</g, ">快捷台<");
  if (n !== s) {
    fs.writeFileSync(p, n);
    console.log("nav", f);
  }
}
