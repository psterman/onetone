const fs = require("fs");
const files = [
  "website/css/home.css",
  "website/css/vision.css",
  "website/css/agent.css",
  "website/css/quickstart.css",
];
const map = [
  [/theme\('colors\.mac\.border'\)/g, "var(--mac-border)"],
  [/theme\('colors\.mac\.accent'\)/g, "var(--mac-accent)"],
  [/theme\('colors\.mac\.textMuted'\)/g, "var(--mac-text-muted)"],
  [/theme\('colors\.mac\.text'\)/g, "var(--mac-text)"],
  [/theme\('colors\.mac\.bg'\)/g, "var(--mac-bg)"],
  [/theme\('colors\.mac\.panel'\)/g, "var(--mac-panel)"],
  [/theme\('fontFamily\.mono'\)/g, "'JetBrains Mono', Menlo, monospace"],
  [/theme\('fontFamily\.sans'\)/g, "Inter, sans-serif"],
];
for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  for (const [re, rep] of map) s = s.replace(re, rep);
  fs.writeFileSync(f, s);
  console.log("fixed", f);
}
