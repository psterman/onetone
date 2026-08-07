const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;

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
  amberBright: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBd: "rgba(245,158,11,0.28)",
  agent: "#34d399",
  running: "#3b82f6",
  wait: "#f59e0b",
  done: "#22c55e",
  fail: "#dc2626",
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
.h2{font:700 16px 'Segoe UI','Microsoft YaHei',sans-serif}
.label{font:700 12px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 10px 'Segoe UI','Microsoft YaHei',sans-serif}
.metaL{font:600 11px 'Segoe UI','Microsoft YaHei',sans-serif}
.metaV{font:700 12px 'Segoe UI','Microsoft YaHei',sans-serif}
`;

function wrap(w, h, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><style type="text/css"><![CDATA[${css}]]></style></defs>
${body}
</svg>`;
}

function toggle(x, y, on) {
  const fill = on ? T.green : T.surfaceSoft;
  const cx = on ? x + 28 : x + 12;
  return `
    <rect x="${x}" y="${y}" width="40" height="22" rx="11" fill="${fill}" stroke="${on ? T.green : T.outline}"/>
    <circle cx="${cx}" cy="${y + 11}" r="8" fill="#fff"/>`;
}

function appSubtabs(active) {
  const tabs = [
    ["codex", "Codex"],
    ["claude", "Claude"],
    ["cursor", "Cursor"],
    ["custom", "\u6211\u7684\u5e94\u7528"],
  ];
  let out = `<g transform="translate(64 118)">`;
  let x = 0;
  tabs.forEach(([id, label]) => {
    const on = id === active;
    const w = id === "custom" ? 96 : 78;
    out += `
      <rect x="${x}" y="0" width="${w}" height="30" rx="8" fill="${on ? "#fff" : T.surfaceSoft}" stroke="${on ? T.primaryBright : T.outline}" stroke-width="${on ? 2 : 1}"/>
      <text x="${x + w / 2}" y="20" text-anchor="middle" class="cap" fill="${on ? T.primary : T.muted}">${label}</text>`;
    if (on) out += `<rect x="${x + 8}" y="28" width="${w - 16}" height="3" rx="1.5" fill="${T.primaryBright}"/>`;
    x += w + 8;
  });
  return out + "</g>";
}

function flowNodes() {
  const faces = [
    { title: "Soft Pad", hint: "\u6539\u952e\u4f4d", accent: T.primaryBright, on: false },
    { title: "\u72b6\u6001\u706f", hint: "\u770b AI \u5fd9\u4e0d\u5fd9", accent: T.agent, on: true },
    { title: "\u65f6\u95f4\u80f6\u56ca", hint: "\u6062\u590d\u70b9", accent: T.amberBright, on: false },
  ];
  let out = `<g transform="translate(0 158)">`;
  faces.forEach((f, i) => {
    const x = 64 + i * 380;
    out += `
    <g transform="translate(${x} 0)">
      <circle cx="154" cy="40" r="28" fill="#fff" stroke="${f.on ? f.accent : T.outline}" stroke-width="${f.on ? 2.5 : 1}"/>
      ${f.on ? `<circle cx="154" cy="40" r="34" fill="none" stroke="${f.accent}" stroke-opacity="0.22" stroke-width="5"/>` : ""}
      <text x="154" y="88" text-anchor="middle" class="h2 ink">${f.title}</text>
      <text x="154" y="106" text-anchor="middle" class="small muted">${f.hint}</text>
    </g>`;
  });
  return out + "</g>";
}

function heroPad(ox, oy, w, h, mode) {
  const keys = mode === "claude"
    ? [
        [{ c: T.running, tag: "\u5fd9" }, { c: T.done, tag: "\u5b8c\u6210" }, { c: T.wait, tag: "\u7b49\u4f60" }],
        [{ c: T.running, tag: "\u5fd9" }, { c: "#fff", tag: "" }, { c: "#fff", tag: "" }],
      ]
    : mode === "bezel"
      ? [
          [{ c: "#fff", tag: "" }, { c: "#fff", tag: "" }, { c: "#fff", tag: "" }],
          [{ c: "#fff", tag: "" }, { c: "#fff", tag: "" }, { c: "#fff", tag: "" }],
        ]
      : mode === "single"
        ? [
            [{ c: "#fff", tag: "" }, { c: T.running, tag: "\u5fd9" }, { c: "#fff", tag: "" }],
            [{ c: "#fff", tag: "" }, { c: "#fff", tag: "" }, { c: "#fff", tag: "" }],
          ]
        : [
            [{ c: T.purple, tag: "\u5fd9" }, { c: T.done, tag: "" }, { c: T.wait, tag: "\u7b49\u4f60" }],
            [{ c: "#fff", tag: "" }, { c: T.running, tag: "\u5fd9" }, { c: "#fff", tag: "" }],
          ];

  const bezelStroke = mode === "bezel" ? T.purple : mode === "single" ? T.primaryBright : T.primaryBright;
  const kw = 72;
  const kh = 52;
  const g = 12;
  let out = `<g transform="translate(${ox} ${oy})">`;
  out += `<rect width="${w}" height="${h}" rx="18" fill="#ecf8f3" stroke="rgba(52,211,153,0.35)"/>`;
  out += `<text x="20" y="26" class="cap" fill="${T.agent}">HERO \u00b7 \u9884\u89c8\u5373\u8bf4\u660e</text>`;

  const px = (w - (kw * 3 + g * 2)) / 2;
  const py = 56;
  out += `<rect x="${px - 16}" y="${py - 16}" width="${kw * 3 + g * 2 + 32}" height="${kh * 2 + g + 48}" rx="20" fill="#d9eef6" stroke="${bezelStroke}" stroke-width="${mode === "bezel" ? 4 : 2}"/>`;
  out += `<rect x="${px - 4}" y="${py - 4}" width="${kw * 3 + g * 2 + 8}" height="${kh * 2 + g + 16}" rx="14" fill="#f7fbfd" stroke="#b7dcea"/>`;

  keys.forEach((row, ri) => {
    row.forEach((k, ci) => {
      const x = px + ci * (kw + g);
      const y = py + ri * (kh + g);
      const stroke = k.c !== "#fff" ? k.c : "#d5e1ec";
      out += `<rect x="${x}" y="${y}" width="${kw}" height="${kh}" rx="10" fill="${k.c}" stroke="${stroke}"/>`;
      if (k.tag) {
        out += `<rect x="${x + 8}" y="${y + 6}" width="36" height="18" rx="9" fill="rgba(255,255,255,0.92)" stroke="${T.outline}"/>`;
        out += `<text x="${x + 26}" y="${y + 19}" text-anchor="middle" class="cap ink">${k.tag}</text>`;
      }
    });
  });

  out += `<rect x="${px - 4}" y="${py + kh * 2 + g + 8}" width="${kw * 3 + g * 2 + 8}" height="24" rx="8" fill="#1e3a48"/>`;
  out += `<circle cx="${px + 16}" cy="${py + kh * 2 + g + 20}" r="5" fill="${T.claude}"/>`;
  out += `<circle cx="${px + 32}" cy="${py + kh * 2 + g + 20}" r="5" fill="${T.running}"/>`;
  out += `<circle cx="${px + 48}" cy="${py + kh * 2 + g + 20}" r="5" fill="${T.wait}"/>`;
  out += `<text x="${px + kw * 3 + g * 2 - 20}" y="${py + kh * 2 + g + 24}" text-anchor="end" class="cap" fill="#9ec9d8">\u9876\u680f\u5706\u70b9</text>`;

  if (mode === "bezel") {
    out += `<path d="M ${px - 28} ${py + 40} L ${px - 8} ${py + 40}" stroke="${T.purple}" stroke-width="1.5"/>`;
    out += `<text x="${px - 32}" y="${py + 44}" text-anchor="end" class="small" fill="${T.purple}">\u76d8\u8fb9\u989c\u8272</text>`;
  }

  const legendY = h - 28;
  const legend = [
    [T.faint, "\u7a7a\u95f2"],
    [T.running, "\u5fd9"],
    [T.wait, "\u7b49\u4f60"],
    [T.done, "\u5b8c\u6210"],
    [T.fail, "\u5931\u8d25"],
  ];
  let lx = 20;
  legend.forEach(([col, lab]) => {
    out += `<circle cx="${lx}" cy="${legendY}" r="5" fill="${col}"/>`;
    out += `<text x="${lx + 10}" y="${legendY + 4}" class="small muted">${lab}</text>`;
    lx += 56;
  });

  return out + "</g>";
}

function controlStrip(y, appName, connected, showTopbar) {
  let out = `<g transform="translate(64 ${y})">`;
  out += `<rect width="1152" height="${showTopbar ? 118 : 88}" rx="14" class="surface"/>`;
  out += toggle(24, 20, true);
  out += `<text x="76" y="35" class="label ink">\u663e\u793a ${appName} \u72b6\u6001\u706f</text>`;
  if (showTopbar) {
    out += toggle(24, 56, true);
    out += `<text x="76" y="71" class="label ink">\u9876\u680f\u540c\u6b65\u663e\u793a</text>`;
  }
  if (connected) {
    out += `<circle cx="920" cy="32" r="6" fill="${T.green}"/>`;
    out += `<text x="936" y="36" class="small ink">\u5df2\u8fde\u63a5 ${appName} Activity</text>`;
  } else {
    out += `<rect x="820" y="18" width="120" height="32" rx="8" fill="${T.primaryBright}"/>`;
    out += `<text x="880" y="39" text-anchor="middle" class="cap" fill="#fff">\u8fde\u63a5 ${appName}</text>`;
  }
  return out + "</g>";
}

// 图 A · Claude 小白 preset
const planA = wrap(1280, 900, `
  <rect class="bg" width="1280" height="900"/>
  <rect x="40" y="20" width="1200" height="860" rx="16" class="shell"/>

  <rect x="40" y="20" width="1200" height="72" rx="14" class="surface"/>
  <text x="60" y="48" class="h1 ink">Claude</text>
  <text x="60" y="68" class="small muted">\u591a\u4e2a\u4efb\u52a1\u65f6\uff0c\u4e0d\u540c\u952e\u4f1a\u4eae\u4e0d\u540c\u989c\u8272\uff08\u81ea\u52a8\uff09</text>
  <rect x="900" y="34" width="72" height="22" rx="11" fill="${T.greenBg}" stroke="${T.greenBd}"/>
  <text x="936" y="49" text-anchor="middle" class="cap" fill="${T.green}">v9 \u00b7 \u5c0f\u767d\u5411</text>

  ${appSubtabs("claude")}
  ${flowNodes()}

  ${heroPad(64, 248, 1152, 340, "claude")}
  ${controlStrip(608, "Claude", true, true)}

  <g transform="translate(64 738)">
    <text x="0" y="0" class="small faint">\u25b8 \u9ad8\u7ea7\u8bbe\u7f6e\uff08\u9010\u952e\u3001API\u3001\u80fd\u529b\u5bf9\u7167\u3001\u8bca\u65ad\uff09</text>
    <text x="0" y="18" class="small faint">\u2190 \u9ed8\u8ba4\u6298\u53e0\uff0c\u9996\u5c4f\u6700\u591a\u70b9\u4e24\u4e0b</text>
  </g>

  <text x="64" y="860" class="title ink">\u56fe A \u00b7 Claude \u81ea\u52a8\u5339\u914d \u00b7 Hero + \u4e24\u884c\u5f00\u5173 + \u5df2\u8fde\u63a5</text>
`);

// 图 B · 我的应用 · 三模板
const planB = wrap(1280, 980, `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="20" width="1200" height="940" rx="16" class="shell"/>

  <rect x="40" y="20" width="1200" height="72" rx="14" class="surface"/>
  <text x="60" y="48" class="h1 ink">VS Code</text>
  <text x="60" y="68" class="small muted">\u9009\u4e0b\u9762\u4e00\u79cd\u6548\u679c\u5373\u53ef \u00b7 \u65e0\u9700\u9010\u952e\u914d\u7f6e</text>
  <rect x="880" y="34" width="108" height="22" rx="11" fill="${T.amberBg}" stroke="${T.amberBd}"/>
  <text x="934" y="49" text-anchor="middle" class="cap" fill="${T.amber}">\u6211\u7684\u5e94\u7528</text>

  ${appSubtabs("custom")}
  ${flowNodes()}

  ${heroPad(64, 248, 1152, 320, "bezel")}

  <g transform="translate(64 584)">
    <text x="0" y="0" class="label ink">\u9009\u4e00\u79cd\u6548\u679c</text>
    ${[
      ["bezel", "\u76d8\u8fb9\u53d8\u8272", "\u524d\u53f0\u65f6\u76d8\u8fb9\u4e00\u79cd\u989c", true, T.purple],
      ["single", "\u4e00\u76cf\u952e\u706f", "\u50cf Codex\uff0c\u4e00\u9897\u952e\u8868\u793a\u5fd9\u95f2", false, T.primaryBright],
      ["multi", "\u591a\u952e\u63d0\u793a", "\u770b\u8d77\u6765\u50cf Claude\uff08\u6a21\u62df\uff09", false, T.amber],
    ]
      .map(([id, title, hint, sel, col], i) => {
        const x = i * 384;
        return `
      <g transform="translate(${x} 16)">
        <rect width="360" height="120" rx="14" fill="${sel ? "#faf5ff" : "#fff"}" stroke="${sel ? col : T.outline}" stroke-width="${sel ? 2 : 1}"/>
        ${sel ? `<rect x="12" y="12" width="52" height="20" rx="10" fill="${T.greenBg}" stroke="${T.greenBd}"/><text x="38" y="26" text-anchor="middle" class="cap" fill="${T.green}">\u63a8\u8350</text>` : ""}
        <circle cx="32" cy="58" r="14" fill="${col}" opacity="0.25"/>
        <circle cx="32" cy="58" r="8" fill="${col}"/>
        <text x="56" y="52" class="title ink">${title}</text>
        <text x="56" y="72" class="small muted">${hint}</text>
        ${id === "multi" ? `<text x="56" y="94" class="small" fill="${T.amber}">\u6a21\u62df\u6548\u679c \u00b7 \u975e\u5b98\u65b9 Hook</text>` : ""}
      </g>`;
      })
      .join("")}
  </g>

  <g transform="translate(64 738)">
    ${toggle(0, 0, true)}
    <text x="52" y="15" class="label ink">\u663e\u793a VS Code \u72b6\u6001\u706f</text>
    <rect x="820" y="-2" width="280" height="28" rx="8" class="soft"/>
    <text x="836" y="16" class="small faint">\u25b8 \u9ad8\u7ea7\u8bbe\u7f6e\uff08\u9010\u952e / API / \u5bf9\u7167\u8868\uff09</text>
  </g>

  <text x="64" y="940" class="title ink">\u56fe B \u00b7 \u6211\u7684\u5e94\u7528 \u00b7 \u4e09\u6a21\u677f\u5361\u7247 + \u9ad8\u7ea7\u6298\u53e0</text>
`);

// 图 C · 高级展开（power user）
const planC = wrap(1280, 980, `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="20" width="1200" height="940" rx="16" class="shell"/>

  <rect x="40" y="20" width="1200" height="56" rx="14" class="surface"/>
  <text x="60" y="48" class="h1 ink">\u9ad8\u7ea7\u8bbe\u7f6e</text>
  <text x="200" y="48" class="small muted">\u5c0f\u767d\u65e0\u9700\u6253\u5f00 \u00b7 \u5f00\u53d1\u8005 / \u8fdb\u9636\u7528\u6237\u53ef\u9009</text>

  ${appSubtabs("custom")}

  <g transform="translate(64 100)">
    <rect width="1152" height="36" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
    <text x="16" y="23" class="cap ink">\u25be \u9ad8\u7ea7\u8bbe\u7f6e\uff08\u5df2\u5c55\u5f00\uff09</text>
  </g>

  <g transform="translate(64 152)">
    <text x="0" y="0" class="label ink">\u9010\u952e\u914d\u8272\uff08\u539f v8 grid \u4e0b\u6c89\uff09</text>
    ${["AG01", "AG03", "AG04", "AG05"].map((k, i) => {
      const cols = [T.purple, T.running, T.done, T.wait];
      return `
      <g transform="translate(${i * 140} 12)">
        <rect width="120" height="72" rx="8" class="soft"/>
        <text x="12" y="22" class="cap ink">${k}</text>
        <circle cx="24" cy="48" r="10" fill="${cols[i]}"/>
        <rect x="44" y="40" width="36" height="16" rx="8" fill="${T.green}"/><circle cx="68" cy="48" r="6" fill="#fff"/>
      </g>`;
    }).join("")}
  </g>

  <g transform="translate(64 260)">
    <text x="0" y="0" class="label ink">API \u96c6\u6210</text>
    <rect x="0" y="12" width="520" height="80" rx="10" fill="#1e293b"/>
    <text x="16" y="36" class="small" fill="#94a3b8">POST http://127.0.0.1:8796/api/codex-app/state</text>
    <text x="16" y="56" class="small" fill="#64748b">{ "state": "running", "lightRules": { ... } }</text>
  </g>

  <g transform="translate(64 368)">
    <text x="0" y="0" class="label ink">Claude / Codex / Cursor \u80fd\u529b\u5bf9\u7167\uff08\u539f\u56fe B \u4e0b\u6c89\uff09</text>
    <rect x="0" y="12" width="1152" height="36" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
    <text x="16" y="34" class="small ink">\u5fae\u89c2\u706f</text>
    <text x="200" y="34" class="small" fill="${T.claude}">\u591a AG \u6c60</text>
    <text x="400" y="34" class="small" fill="${T.green}">\u5355\u5bbf\u4e3b AG00</text>
    <text x="620" y="34" class="small" fill="${T.purple}">\u65e0 AG \u5bbf\u4e3b</text>
    <rect x="0" y="56" width="1152" height="36" rx="8" class="surface"/>
    <text x="16" y="78" class="small ink">\u5b8f\u89c2\u706f</text>
    <text x="200" y="78" class="small muted">\u9876\u680f chip</text>
    <text x="400" y="78" class="small muted">\u9876\u680f + Soft RGB</text>
    <text x="620" y="78" class="small muted">\u4ec5 Attention</text>
  </g>

  <g transform="translate(64 480)">
    <text x="0" y="0" class="label ink">\u9ad8\u7ea7\u8bca\u65ad\uff08\u73b0\u6709 lab \u5e76\u5165\uff09</text>
    <rect x="0" y="12" width="1152" height="120" rx="12" class="soft"/>
    <text x="20" y="44" class="small muted">pad_status jsonl \u00b7 \u6d4b\u8bd5\u6ce8\u5165 \u00b7 Claude Activity \u9762\u677f</text>
    <rect x="20" y="60" width="100" height="28" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
    <text x="70" y="79" text-anchor="middle" class="cap muted">\u56de\u653e</text>
    <rect x="132" y="60" width="100" height="28" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
    <text x="182" y="79" text-anchor="middle" class="cap muted">\u6ce8\u5165\u6d4b\u8bd5</text>
  </g>

  <g transform="translate(64 640)">
    ${heroPad(0, 0, 560, 240, "multi")}
    <g transform="translate(600 0)">
      <rect width="552" height="240" rx="14" fill="#fff7ed" stroke="${T.amberBd}"/>
      <text x="20" y="32" class="title ink">\u9996\u5c4f vs \u9ad8\u7ea7</text>
      <text x="20" y="56" class="small muted">\u9996\u5c4f\uff1aHero + 1\u5f00\u5173 + \u6700\u591a 1 CTA / 3 \u6a21\u677f</text>
      <text x="20" y="76" class="small muted">\u9ad8\u7ea7\uff1a\u9010\u952e grid + API + \u5bf9\u7167\u8868 + \u8bca\u65ad</text>
      <text x="20" y="110" class="small" fill="${T.green}">\u2713 \u5c0f\u767d 3 \u79d2\u61c2\u5fd9\u95f2</text>
      <text x="20" y="130" class="small" fill="${T.green}">\u2713 \u6700\u591a\u70b9\u4e24\u4e0b</text>
      <text x="20" y="150" class="small" fill="${T.green}">\u2713 \u4e0d\u66b4\u9732 catalog / JSON</text>
    </g>
  </g>

  <text x="64" y="940" class="title ink">\u56fe C \u00b7 \u9ad8\u7ea7\u8bbe\u7f6e\u5c55\u5f00 \u00b7 v8 \u80fd\u529b\u5168\u90e8\u4e0b\u6c89</text>
`);

const files = [
  ["lights-plan-v9-a-claude-simple", planA],
  ["lights-plan-v9-b-templates", planB],
  ["lights-plan-v9-c-advanced", planC],
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
  const png = resvg.render().asPng();
  fs.writeFileSync(path.join(dir, name + ".png"), png);
  console.log(name + ".png", png.length, `${resvg.width}x${resvg.height}`);
}
