const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;
const W = 1280;
const H = 900;

const T = {
  bg: "#eef3f7",
  shell: "#f8fbfd",
  shellStroke: "#d5e0eb",
  surface: "#ffffff",
  surfaceSoft: "#f1f5f9",
  ink: "#142033",
  muted: "#6b7a8d",
  faint: "#94a3b4",
  primary: "#2a9cc4",
  primaryBright: "#3eb8dc",
  outline: "rgba(26,45,74,0.14)",
  green: "#2e7d4f",
  greenBg: "rgba(46,125,79,0.1)",
  greenBd: "rgba(46,125,79,0.28)",
  amber: "#d97706",
  amberBg: "rgba(245,158,11,0.1)",
  amberBd: "rgba(245,158,11,0.28)",
  agent: "#34d399",
  running: "#3b82f6",
  wait: "#f59e0b",
  done: "#22c55e",
  claude: "#d97706",
  purple: "#7c3aed",
};

const css = `
.bg{fill:${T.bg}}.shell{fill:${T.shell};stroke:${T.shellStroke}}
.ink{fill:${T.ink}}.muted{fill:${T.muted}}.faint{fill:${T.faint}}
.surface{fill:${T.surface};stroke:${T.outline}}
.soft{fill:${T.surfaceSoft};stroke:${T.outline}}
.small{font:11px 'Segoe UI','Microsoft YaHei',sans-serif}
.body{font:13px 'Segoe UI','Microsoft YaHei',sans-serif}
.title{font:700 15px 'Segoe UI','Microsoft YaHei',sans-serif}
.h1{font:700 18px 'Segoe UI','Microsoft YaHei',sans-serif}
.label{font:700 12px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 10px 'Segoe UI','Microsoft YaHei',sans-serif}
`;

function wrap(body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><style type="text/css"><![CDATA[${css}]]></style></defs>
${body}
</svg>`;
}

function toggle(x, y, on) {
  const cx = on ? x + 28 : x + 12;
  return `<rect x="${x}" y="${y}" width="40" height="22" rx="11" fill="${on ? T.green : T.surfaceSoft}" stroke="${on ? T.green : T.outline}"/>
    <circle cx="${cx}" cy="${y + 11}" r="8" fill="#fff"/>`;
}

function flowHeader() {
  return `
  <rect x="40" y="16" width="1200" height="56" rx="12" class="surface"/>
  <text x="60" y="42" class="h1 ink">\u72b6\u6001\u706f</text>
  <text x="160" y="42" class="small muted">\u770b AI \u5fd9\u4e0d\u5fd9</text>
  <g transform="translate(520 24)">
    <circle cx="80" cy="20" r="16" fill="#fff" stroke="${T.outline}"/>
    <circle cx="200" cy="20" r="16" fill="#fff" stroke="${T.agent}" stroke-width="2"/>
    <circle cx="320" cy="20" r="16" fill="#fff" stroke="${T.outline}"/>
    <text x="80" y="48" text-anchor="middle" class="cap muted">Soft Pad</text>
    <text x="200" y="48" text-anchor="middle" class="cap" fill="${T.agent}">\u72b6\u6001\u706f</text>
    <text x="320" y="48" text-anchor="middle" class="cap muted">\u65f6\u95f4\u80f6\u56ca</text>
  </g>`;
}

function threeColFrame(leftW, midW, rightW, leftContent, midContent, rightContent, footer) {
  const ox = 40;
  const y = 88;
  const h = H - 120;
  const gap = 12;
  const lx = ox;
  const mx = lx + leftW + gap;
  const rx = mx + midW + gap;
  return `
  ${flowHeader()}
  <rect x="${lx}" y="${y}" width="${leftW}" height="${h}" rx="14" fill="#ecf8f3" stroke="rgba(52,211,153,0.35)"/>
  <text x="${lx + 14}" y="${y + 22}" class="cap" fill="${T.agent}">\u952e\u76d8\u9884\u89c8</text>
  ${leftContent}
  <rect x="${mx}" y="${y}" width="${midW}" height="${h}" rx="14" class="surface"/>
  <text x="${mx + 14}" y="${y + 22}" class="cap muted">\u914d\u7f6e</text>
  ${midContent}
  <rect x="${rx}" y="${y}" width="${rightW}" height="${h}" rx="14" class="surface"/>
  <text x="${rx + 14}" y="${y + 22}" class="cap muted">\u8bc6\u522b\u5e94\u7528</text>
  ${rightContent}
  <text x="60" y="${H - 24}" class="title ink">${footer}</text>`;
}

function topbarPreviewStrip(cx, cy, agents) {
  let s = `<g transform="translate(${cx} ${cy})">`;
  s += `<text x="0" y="0" class="cap muted">\u9876\u680f\u9884\u89c8</text>`;
  s += `<rect x="0" y="8" width="200" height="36" rx="10" fill="rgba(148,163,184,0.12)" stroke="${T.outline}"/>`;
  agents.forEach((a, i) => {
    const x = 12 + i * 44;
    s += `<rect x="${x}" y="16" width="36" height="28" rx="8" fill="#fff" stroke="${T.outline}"/>`;
    s += `<circle cx="${x + 30}" cy="22" r="3" fill="${a[1]}"/>`;
  });
  s += `</g>`;
  return s;
}

function topbarMonitorCard(x, y, active, available) {
  let s = `<g transform="translate(${x} ${y})">`;
  s += `<rect width="440" height="${80 + active.length * 36}" rx="12" fill="${T.surfaceSoft}" stroke="${T.outline}"/>`;
  s += `<text x="14" y="24" class="label ink">\u9876\u680f\u76d1\u89c6</text>`;
  s += `<text x="14" y="42" class="small muted">\u8de8\u5e94\u7528\u663e\u793a\u5fd9\u95f2</text>`;
  active.forEach((name, i) => {
    const ay = 52 + i * 32;
    s += `<rect x="12" y="${ay}" width="416" height="28" rx="8" fill="#fff" stroke="${T.outline}"/>`;
    s += `<text x="24" y="${ay + 18}" class="small ink">${name}</text>`;
    s += `<text x="390" y="${ay + 18}" text-anchor="end" class="cap" fill="#dc2626">\u00d7</text>`;
  });
  if (available.length) {
    s += `<text x="14" y="${52 + active.length * 32 + 18}" class="small" fill="${T.primary}">+ \u6dfb\u52a0</text>`;
  }
  s += `</g>`;
  return s;
}

function miniPad(cx, cy, mode) {
  const keys = mode === "claude"
    ? [[T.running, "\u5fd9"], [T.done, "\u5b8c\u6210"], [T.wait, "\u7b49\u4f60"], [T.running, "\u5fd9"], ["#fff", ""], ["#fff", ""]]
    : mode === "codex"
      ? [["#fff", ""], [T.running, "\u5fd9"], ["#fff", ""], ["#fff", ""], ["#fff", ""], ["#fff", ""]]
      : mode === "bezel"
        ? [["#fff", ""], ["#fff", ""], ["#fff", ""], ["#fff", ""], ["#fff", ""], ["#fff", ""]]
        : [["#fff", ""], ["#fff", ""], ["#fff", ""], ["#fff", ""], ["#fff", ""], ["#fff", ""]];
  const bezel = mode === "bezel" ? T.purple : T.primaryBright;
  let s = `<g transform="translate(${cx} ${cy})">`;
  s += `<rect x="0" y="0" width="200" height="200" rx="16" fill="#d9eef6" stroke="${bezel}" stroke-width="${mode === "bezel" ? 4 : 2}"/>`;
  s += `<rect x="16" y="16" width="168" height="140" rx="12" fill="#f7fbfd" stroke="#b7dcea"/>`;
  keys.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 28 + col * 52;
    const y = 28 + row * 44;
    s += `<rect x="${x}" y="${y}" width="44" height="36" rx="8" fill="${k[0]}" stroke="#d5e1ec"/>`;
    if (k[1]) s += `<text x="${x + 22}" y="${y + 22}" text-anchor="middle" class="cap" fill="#fff">${k[1]}</text>`;
  });
  s += `<rect x="16" y="162" width="168" height="22" rx="6" fill="#1e3a48"/>`;
  s += `<circle cx="36" cy="173" r="4" fill="${T.claude}"/>`;
  s += `<text x="170" y="176" text-anchor="end" class="cap" fill="#9ec9d8">\u9876\u680f</text>`;
  s += `</g>`;
  return s;
}

function lightsSubtabBar(x, y, active) {
  const tabs = [["topbar", "\u9876\u680f"], ["ambient", "\u6c1b\u56f4\u706f"], ["keys", "\u6309\u952e\u706f"]];
  let s = `<g transform="translate(${x} ${y})">`;
  tabs.forEach(([id, label], i) => {
    const w = 140;
    const tx = i * (w + 6);
    const on = id === active;
    s += `<rect x="${tx}" y="0" width="${w}" height="32" rx="8" fill="${on ? "rgba(62,184,220,0.12)" : T.surfaceSoft}" stroke="${on ? T.primary : T.outline}"/>`;
    s += `<text x="${tx + w / 2}" y="21" text-anchor="middle" class="cap" fill="${on ? T.primary : T.muted}">${label}</text>`;
  });
  s += `</g>`;
  return s;
}

function appRail(rx, y, h, fg, fgBtn, activeKind, apps) {
  let s = `<g transform="translate(${rx + 12} ${y + 36})">`;
  s += `<rect width="256" height="72" rx="10" fill="${T.surfaceSoft}" stroke="${T.outline}"/>`;
  s += `<text x="12" y="22" class="label ink">\u8bc6\u522b\u5e94\u7528</text>`;
  s += `<text x="12" y="42" class="small muted">\u524d\u53f0\uff1a${fg}</text>`;
  if (fgBtn) {
    s += `<rect x="12" y="50" width="88" height="22" rx="6" fill="${T.primaryBright}"/>`;
    s += `<text x="56" y="65" text-anchor="middle" class="cap" fill="#fff">${fgBtn}</text>`;
  }
  let ay = 84;
  apps.forEach(([kind, label, on]) => {
    s += `<rect x="0" y="${ay}" width="256" height="40" rx="8" fill="${on ? "#ecf8f3" : "#fff"}" stroke="${on ? T.agent : T.outline}"/>`;
    s += `<circle cx="18" cy="${ay + 20}" r="5" fill="${on ? T.agent : T.faint}"/>`;
    s += `<text x="32" y="${ay + 24}" class="small ink">${label}</text>`;
    ay += 46;
  });
  s += `</g>`;
  return s;
}

const lw = 380;
const mw = 480;
const rw = 280;
const colY = 110;
const colH = 720;

const planA = wrap(threeColFrame(
  lw, mw, rw,
  topbarPreviewStrip(100, colY + 20, [["codex", T.faint], ["claude", T.running], ["cursor", T.faint]]) +
    miniPad(100, colY + 72, "claude") +
    `<text x="60" y="${colY + 300}" class="small muted">\u7070=\u7a7a\u95f2 \u00b7 \u84dd=\u5fd9 \u00b7 \u6a59=\u7b49\u4f60</text>`,
  `<g transform="translate(448 ${colY + 40})">
    ${lightsSubtabBar(0, 0, "topbar")}
    <text x="0" y="52" class="body ink">\u5f53\u524d\u5e94\u7528\uff1aClaude \u00b7 \u591a\u4e2a\u4efb\u52a1\u65f6\uff0c\u4e0d\u540c\u952e\u4f1a\u4eae\u4e0d\u540c\u989c\u8272\uff08\u81ea\u52a8\uff09</text>
    ${topbarMonitorCard(0, 68, ["Claude", "Codex"], ["Cursor", "WorkBuddy"])}
    <text x="0" y="320" class="small faint">\u25b8 \u6309\u952e\u706f \u00b7 \u9ad8\u7ea7\u8bbe\u7f6e\uff08\u6298\u53e0\uff09</text>
  </g>`,
  appRail(40 + lw + mw + 24, 88, colH, "Claude Code", "", "claude", [
    ["claude", "Claude", true],
    ["codex", "Codex", false],
    ["cursor", "Cursor", false],
    ["soft", "VS Code", false],
  ]),
  "\u56fe A \u00b7 Claude \u00b7 \u5de6\u9884\u89c8 \u00b7 \u4e2d\u914d\u7f6e \u00b7 \u53f3\u8bc6\u5e94\u7528"
));

const planB = wrap(threeColFrame(
  lw, mw, rw,
  miniPad(100, colY + 40, "bezel") +
    `<text x="60" y="${colY + 280}" class="small" fill="${T.purple}">\u76d8\u8fb9\u989c\u8272</text>`,
  `<g transform="translate(448 ${colY + 40})">
    <text x="0" y="0" class="label ink">\u9009\u4e00\u79cd\u6548\u679c</text>
    ${[["bezel", "\u76d8\u8fb9\u53d8\u8272", true], ["single", "\u4e00\u76cf\u952e\u706f", false], ["multi", "\u591a\u952e\u63d0\u793a", false]]
      .map(([id, t, sel], i) => `
      <rect x="0" y="${24 + i * 56}" width="440" height="48" rx="10" fill="${sel ? "#faf5ff" : T.surfaceSoft}" stroke="${sel ? T.purple : T.outline}"/>
      <text x="16" y="${52 + i * 56}" class="label ink">${t}</text>
      ${sel ? `<text x="120" y="${52 + i * 56}" class="cap" fill="${T.green}">\u63a8\u8350</text>` : ""}`).join("")}
    ${toggle(0, 200, true)}<text x="52" y="215" class="label ink">\u663e\u793a VS Code \u72b6\u6001\u706f</text>
  </g>`,
  appRail(40 + lw + mw + 24, 88, colH, "Code.exe", "\u5207\u6362\u5230 VS Code", "soft", [
    ["claude", "Claude", false],
    ["codex", "Codex", false],
    ["cursor", "Cursor", false],
    ["soft", "VS Code", true],
  ]),
  "\u56fe B \u00b7 \u6211\u7684\u5e94\u7528 \u00b7 \u4e09\u6a21\u677f + \u53f3\u680f\u5207\u6362"
));

const planC = wrap(threeColFrame(
  lw, mw, rw,
  miniPad(100, colY + 40, "codex") +
    `<text x="60" y="${colY + 280}" class="small muted">\u4e00\u6574\u6bb5\u4efb\u52a1\u4eae\u5728\u4e00\u76cf\u952e\u4e0a</text>`,
  `<g transform="translate(448 ${colY + 40})">
    <text x="0" y="0" class="body ink">\u6574\u6bb5\u4efb\u52a1\u4eae\u5728\u4e00\u76cf\u952e\u4e0a\uff08\u81ea\u52a8\uff09</text>
    ${toggle(0, 36, true)}<text x="52" y="51" class="label ink">\u663e\u793a Codex \u72b6\u6001\u706f</text>
    <rect x="0" y="72" width="120" height="32" rx="8" fill="${T.primaryBright}"/>
    <text x="60" y="93" text-anchor="middle" class="cap" fill="#fff">\u8fde\u63a5 Codex</text>
    <text x="0" y="130" class="small faint">\u25b8 \u9ad8\u7ea7\u8bbe\u7f6e\uff08\u6298\u53e0\uff09</text>
  </g>`,
  appRail(40 + lw + mw + 24, 88, colH, "Codex", "", "codex", [
    ["claude", "Claude", false],
    ["codex", "Codex", true],
    ["cursor", "Cursor", false],
    ["soft", "VS Code", false],
  ]),
  "\u56fe C \u00b7 Codex \u00b7 \u5f85\u8fde\u63a5 \u00b7 \u4e09\u680f\u5e03\u5c40"
));

const files = [
  ["lights-plan-v10-a-claude", planA],
  ["lights-plan-v10-b-custom", planB],
  ["lights-plan-v10-c-codex-connect", planC],
];

const fontFiles = [
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/segoeui.ttf",
  "C:/Windows/Fonts/arial.ttf",
];

for (const [name, svg] of files) {
  fs.writeFileSync(path.join(dir, name + ".svg"), svg, "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: { loadSystemFonts: true, fontFiles },
  });
  fs.writeFileSync(path.join(dir, name + ".png"), resvg.render().asPng());
  console.log(name + ".png ok");
}
