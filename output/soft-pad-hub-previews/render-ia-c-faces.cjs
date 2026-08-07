const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;

/* Product tokens from src/css/app.css + soft-pad-hub.css */
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
  primarySoft: "#5ec8e8",
  primaryGlow: "rgba(62,184,220,0.18)",
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
  fail: "#dc2626",
};

const U = {
  enabled: "\u5df2\u542f\u7528",
  bind: "\u7ed1\u5b9a \u00b7 Codex",
  lights: "\u72b6\u6001\u706f",
  keysMeta: "\u952e\u4f4d",
  restore: "\u6062\u590d\u70b9",
  account: "\u8d26\u53f7",
  quota: "\u989d\u5ea6",
  reset: "\u91cd\u7f6e",
  testFg: "\u6d4b\u8bd5\u524d\u53f0",
  editKeys: "\u7f16\u8f91\u952e\u4f4d",
  openTm: "\u6253\u5f00\u65f6\u95f4\u7ebf",
  softPad: "Soft Pad",
  softHint: "\u6539\u952e\u4f4d \u00b7 \u4f55\u65f6\u663e\u793a",
  lightTitle: "\u72b6\u6001\u706f",
  lightHint: "\u770b AI \u5fd9\u4e0d\u5fd9",
  capTitle: "\u9879\u76ee\u65f6\u95f4\u80f6\u56ca",
  capHint: "\u6062\u590d\u524d\u81ea\u52a8\u4fdd\u5b58",
  appear: "\u51fa\u73b0",
  keys: "\u952e\u4f4d",
  look: "\u5916\u89c2",
  purpose: "\u7528\u9014",
  follow: "\u8ddf\u968f\u5e94\u7528",
  followH: "\u524d\u53f0\u662f\u7ed1\u5b9a App \u65f6\u663e\u793a",
  top: "\u4fdd\u6301\u5728\u6700\u524d",
  mini: "\u8ff7\u4f60\u6761",
  hide: "\u4e0d\u663e\u793a\u6d6e\u7a97",
  mode: "\u6a21\u5f0f",
  dir: "\u65b9\u5411",
  undo: "\u64a4\u9500",
  search: "\u641c\u7d22",
  send: "\u53d1\u9001",
  voice: "\u8bed\u97f3",
  idle: "\u7a7a\u95f2",
  running: "\u6267\u884c\u4e2d",
  wait: "\u7b49\u5f85\u8f93\u5165",
  connect: "\u8fde\u63a5",
  hooks: "\u5b89\u88c5 Hook",
  explain: "\u8bf4\u660e",
  autosave: "\u81ea\u52a8\u4fdd\u5b58",
  bindWs: "\u7ed1\u5b9a\u5de5\u4f5c\u533a",
  now: "\u73b0\u5728",
  impact: "\u6062\u590d\u5f71\u54cd",
  files: "\u6587\u4ef6\u53d8\u66f4",
  c1t: "C1 \u00b7 Soft Pad \u9762",
  c1d: "\u9876\u90e8\u4fdd\u7559 status-bar + flow-nodes\uff1b\u4e0b\u65b9 Hero =\u952e\u9762\u4eea\u5668\uff08cyan bezel\uff09\uff0c\u4e0d\u518d\u5171\u7528 ring/detail \u58f3",
  c2t: "C2 \u00b7 \u72b6\u6001\u706f\u9762",
  c2d: "\u540c\u4e00\u9876\u90e8\uff1b\u4e0b\u65b9 Hero =\u706f\u677f\uff08\u65e0\u952e\u76d8\uff09\uff0c\u70b9 Agent \u8d34\u8fb9\u68c0\u89c6",
  c3t: "C3 \u00b7 \u65f6\u95f4\u80f6\u56ca\u9762",
  c3d: "\u540c\u4e00\u9876\u90e8\uff1b\u4e0b\u65b9 Hero =\u65f6\u95f4\u810a\u7ebf\u5168\u5bbd\u684c\uff08amber\uff09\uff0c\u65e0 Soft Pad chrome",
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
.key{fill:#fff;stroke:#d5e1ec}.keyA{fill:#eef8fb;stroke:#9ed6e8}
.row{fill:#fff;stroke:#e2eaf2}
.nodeBtn{fill:#fff;stroke:${T.outline}}
.nodeOn{fill:#fff;stroke:${T.primaryBright};stroke-width:2}
`;

function wrap(w, h, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><style type="text/css"><![CDATA[${css}]]></style></defs>
${body}
</svg>`;
}

/** Shared top: page-status-bar + flow-nodes (current hero layout), face = pad|agent|tm */
function topChrome(activeFace) {
  const faces = [
    { id: "pad", title: U.softPad, hint: U.softHint, accent: T.primaryBright, tagBg: "rgba(94,200,232,0.1)", tagBd: "rgba(94,200,232,0.28)" },
    { id: "agent", title: U.lightTitle, hint: U.lightHint, accent: T.agent, tagBg: "rgba(52,211,153,0.1)", tagBd: "rgba(52,211,153,0.28)" },
    { id: "tm", title: U.capTitle, hint: U.capHint, accent: T.amberBright, tagBg: T.amberBg, tagBd: T.amberBd },
  ];

  let nodes = "";
  faces.forEach((f, i) => {
    const x = 64 + i * 380;
    const on = f.id === activeFace;
    const stroke = on ? f.accent : T.outline;
    const glow = on ? `stroke-width="2.5"` : `stroke-width="1"`;
    nodes += `
    <g transform="translate(${x} 0)">
      <rect x="110" y="0" width="88" height="18" rx="9" fill="${f.tagBg}" stroke="${f.tagBd}"/>
      <text x="154" y="13" text-anchor="middle" class="cap" fill="${f.accent}">${f.id === "pad" ? "PAD" : f.id === "agent" ? "LIGHT" : "TIME"}</text>
      <circle cx="154" cy="64" r="40" fill="#fff" stroke="${stroke}" ${glow}/>
      ${
        on
          ? `<circle cx="154" cy="64" r="46" fill="none" stroke="${f.accent}" stroke-opacity="0.22" stroke-width="6"/>`
          : ""
      }
      ${faceIcon(f.id, 154, 64, f.accent)}
      <text x="154" y="128" text-anchor="middle" class="h2 ink">${f.title}</text>
      <text x="154" y="148" text-anchor="middle" class="small muted">${f.hint}</text>
    </g>`;
  });

  // wavy track hint between nodes (like current flow track, quieter)
  return `
  <!-- status bar -->
  <rect x="40" y="28" width="1200" height="92" rx="14" class="surface"/>
  <text x="60" y="56" class="h1 ink">Codex</text>
  <rect x="128" y="40" width="52" height="22" rx="11" fill="${T.greenBg}" stroke="${T.greenBd}"/>
  <text x="154" y="55" text-anchor="middle" class="cap" fill="${T.green}">${U.enabled}</text>
  <rect x="190" y="40" width="108" height="22" rx="11" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
  <text x="244" y="55" text-anchor="middle" class="cap ink">${U.bind}</text>

  <text x="60" y="82" class="metaL muted">${U.lights}</text>
  <text x="110" y="82" class="metaV ink">Codex</text>
  <rect x="158" y="72" width="1" height="12" fill="${T.outline}"/>
  <text x="170" y="82" class="metaL muted">${U.keysMeta}</text>
  <text x="208" y="82" class="metaV ink">12/15</text>
  <rect x="252" y="72" width="1" height="12" fill="${T.outline}"/>
  <text x="264" y="82" class="metaL muted">${U.restore}</text>
  <text x="314" y="82" class="metaV ink">3</text>

  <text x="400" y="82" class="metaL muted">${U.account}</text>
  <text x="440" y="82" class="metaV ink">ok</text>
  <rect x="468" y="72" width="1" height="12" fill="${T.outline}"/>
  <text x="480" y="82" class="metaL muted">${U.quota}</text>
  <text x="516" y="82" class="metaV ink">72%</text>

  <rect x="900" y="44" width="78" height="26" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
  <text x="939" y="61" text-anchor="middle" class="cap muted">${U.testFg}</text>
  <rect x="988" y="44" width="78" height="26" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
  <text x="1027" y="61" text-anchor="middle" class="cap muted">${U.editKeys}</text>
  <rect x="1076" y="44" width="90" height="26" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
  <text x="1121" y="61" text-anchor="middle" class="cap muted">${U.openTm}</text>
  <!-- enable toggle -->
  <rect x="1180" y="46" width="40" height="22" rx="11" fill="${T.green}"/>
  <circle cx="1208" cy="57" r="8" fill="#fff"/>

  <!-- flow nodes hero -->
  <g transform="translate(0 140)">
    <path d="M220 64 Q640 48 1060 64" fill="none" stroke="rgba(42,156,196,0.2)" stroke-width="3" stroke-linecap="round"/>
    <path d="M220 64 Q640 48 1060 64" fill="none" stroke="url(#flowGrad)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="8 5"/>
    ${nodes}
  </g>`;
}

function faceIcon(id, cx, cy, color) {
  if (id === "pad") {
    return `<g transform="translate(${cx - 12} ${cy - 12})" fill="none" stroke="${color}" stroke-width="1.6">
      <rect x="1" y="1" width="22" height="22" rx="4"/>
      <rect x="5" y="5" width="4" height="4" rx="0.8"/><rect x="10" y="5" width="4" height="4" rx="0.8"/><rect x="15" y="5" width="4" height="4" rx="0.8"/>
      <rect x="5" y="10" width="4" height="4" rx="0.8"/><rect x="10" y="10" width="4" height="4" rx="0.8"/><rect x="15" y="10" width="4" height="4" rx="0.8"/>
      <rect x="5" y="15" width="9" height="4" rx="0.8"/><rect x="15" y="15" width="4" height="4" rx="0.8"/>
    </g>`;
  }
  if (id === "agent") {
    return `<g transform="translate(${cx - 12} ${cy - 12})" fill="none" stroke="${color}" stroke-width="1.6">
      <rect x="7" y="1" width="10" height="16" rx="4"/>
      <circle cx="12" cy="6" r="1.6" fill="${color}" stroke="none"/>
      <circle cx="12" cy="10" r="1.6" fill="${color}" stroke="none" opacity=".7"/>
      <circle cx="12" cy="14" r="1.6" fill="${color}" stroke="none" opacity=".4"/>
      <path d="M9 20h6M10 23h4"/>
    </g>`;
  }
  return `<g transform="translate(${cx - 12} ${cy - 12})" fill="none" stroke="${color}" stroke-width="1.6">
    <rect x="1" y="7" width="22" height="10" rx="5"/>
    <path d="M12 7v10"/>
    <circle cx="7" cy="12" r="1.6" fill="${color}" stroke="none"/>
    <path d="M16 9.5a3 3 0 11-1.2 3.8"/>
  </g>`;
}

function padKeys(ox, oy) {
  const kw = 70,
    kh = 50,
    g = 10;
  const rows = [
    [
      ["keyA", "ENC", U.mode],
      ["key", "7", "AGENT"],
      ["key", "8", "CLAUDE"],
      ["key", "9", "CODEX"],
      ["key", "NAV", U.dir],
    ],
    [
      ["key", "4", "PERMIT"],
      ["key", "5", "STATUS"],
      ["key", "6", "APPS"],
      ["keyA", "UNDO", U.undo],
      ["keyA", "SEARCH", U.search],
    ],
    [
      ["key", "1", "FAST"],
      ["key", "2", "CMD"],
      ["key", "3", "REJECT"],
      ["keyA", "SEND", U.send, 2],
    ],
    [
      ["key", "VOICE", U.voice, 2],
      ["key", "0", "DOT"],
      ["key", "PLUS", "+", 2],
    ],
  ];
  let out = `<g transform="translate(${ox} ${oy})">`;
  let y = 0;
  for (const row of rows) {
    let x = 0;
    for (const c of row) {
      const span = c[3] || 1;
      const w = kw * span + g * (span - 1);
      out += `<rect class="${c[0]}" x="${x}" y="${y}" width="${w}" height="${kh}" rx="10"/>
        <text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" class="label ink">${c[1]}</text>
        <text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" class="cap faint">${c[2]}</text>`;
      x += w + g;
    }
    y += kh + g;
  }
  return out + "</g>";
}

const defs = `
  <defs>
    <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(79,172,254,0.85)"/>
      <stop offset="50%" stop-color="rgba(42,156,196,0.95)"/>
      <stop offset="100%" stop-color="rgba(245,158,11,0.85)"/>
    </linearGradient>
  </defs>`;

// C1 Soft Pad face
const c1 = wrap(
  1280,
  960,
  `
  ${defs}
  <rect class="bg" width="1280" height="960"/>
  <rect x="40" y="28" width="1200" height="860" rx="16" class="shell"/>
  ${topChrome("pad")}

  <!-- L2 Soft Pad instrument hero -->
  <g transform="translate(64 330)">
    <rect width="760" height="500" rx="18" fill="#e8f4f9" stroke="rgba(62,184,220,0.35)"/>
    <text x="24" y="28" class="cap" fill="${T.primary}">INSTRUMENT \u00b7 PAD FACE</text>
    <!-- cyan-tinted bezel, product language not alien dark -->
    <rect x="24" y="44" width="712" height="380" rx="20" fill="#d9eef6" stroke="${T.primaryBright}"/>
    <rect x="44" y="64" width="672" height="300" rx="14" fill="#f7fbfd" stroke="#b7dcea"/>
    ${padKeys(64, 84)}
    <!-- bezel dial fused -->
    <g transform="translate(44 380)">
      <rect width="672" height="36" rx="10" fill="#1e3a48"/>
      <rect x="8" y="5" width="140" height="26" rx="7" fill="${T.primaryBright}"/>
      <text x="78" y="22" text-anchor="middle" class="cap" fill="#06202a">${U.appear}</text>
      <text x="220" y="22" text-anchor="middle" class="cap" fill="#9ec9d8">${U.keys}</text>
      <text x="340" y="22" text-anchor="middle" class="cap" fill="#9ec9d8">${U.look}</text>
      <text x="480" y="22" text-anchor="middle" class="cap" fill="#9ec9d8">${U.purpose}</text>
    </g>
    <text x="24" y="480" class="small faint">bezel dial = padMode only \u00b7 no shared ring chips</text>
  </g>

  <!-- docked inspector -->
  <g transform="translate(860 330)">
    <rect width="340" height="500" rx="14" class="soft"/>
    <text x="20" y="32" class="title ink">${U.appear}</text>
    <text x="20" y="52" class="small muted">${U.followH}</text>
    <rect class="row" x="16" y="72" width="308" height="52" rx="10"/>
    <circle cx="36" cy="98" r="6" fill="${T.primaryBright}"/>
    <text x="52" y="94" class="label ink">${U.follow}</text>
    <text x="52" y="110" class="small muted">${U.followH}</text>
    <rect class="row" x="16" y="134" width="308" height="52" rx="10"/>
    <circle cx="36" cy="160" r="6" fill="#fff" stroke="#c5d0dc"/>
    <text x="52" y="156" class="label ink">${U.top}</text>
    <rect class="row" x="16" y="196" width="308" height="52" rx="10"/>
    <circle cx="36" cy="222" r="6" fill="#fff" stroke="#c5d0dc"/>
    <text x="52" y="218" class="label ink">${U.mini}</text>
    <rect class="row" x="16" y="258" width="308" height="52" rx="10"/>
    <circle cx="36" cy="284" r="6" fill="#fff" stroke="#c5d0dc"/>
    <text x="52" y="280" class="label ink">${U.hide}</text>
  </g>

  <text x="64" y="870" class="title ink">${U.c1t}</text>
  <text x="64" y="894" class="body muted">${U.c1d}</text>
`
);

// C2 Status lights face
const c2 = wrap(
  1280,
  960,
  `
  ${defs}
  <rect class="bg" width="1280" height="960"/>
  <rect x="40" y="28" width="1200" height="860" rx="16" class="shell"/>
  ${topChrome("agent")}

  <g transform="translate(64 330)">
    <rect width="1152" height="500" rx="18" fill="#ecf8f3" stroke="rgba(52,211,153,0.35)"/>
    <text x="24" y="28" class="cap" fill="${T.green}">LIGHTBOARD \u00b7 AGENT FACE</text>

    <!-- lightboard hero - no pad -->
    <g transform="translate(24 52)">
      ${[
        ["Codex", T.running, U.running, "gpt-5.6"],
        ["Claude", T.agent, U.idle, "sonnet"],
        ["Cursor", T.wait, U.wait, "Auto"],
        ["WorkBuddy", T.faint, U.idle, "--"],
        ["Trae", T.faint, U.idle, "--"],
        ["Qoder", T.fail, "failed", "--"],
      ]
        .map((a, i) => {
          const x = (i % 3) * 240;
          const y = Math.floor(i / 3) * 150;
          const selected = i === 0;
          return `
        <g transform="translate(${x} ${y})">
          <rect width="220" height="130" rx="16" fill="#fff" stroke="${selected ? T.primaryBright : T.outline}" stroke-width="${selected ? 2 : 1}"/>
          <rect x="16" y="18" width="44" height="44" rx="12" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
          <circle cx="50" cy="52" r="6" fill="${a[1]}" stroke="#fff" stroke-width="2"/>
          <text x="74" y="36" class="title ink">${a[0]}</text>
          <text x="74" y="56" class="small muted">${a[2]}</text>
          <text x="16" y="96" class="cap faint">model</text>
          <text x="16" y="114" class="label ink">${a[3]}</text>
          <rect x="140" y="88" width="64" height="24" rx="12" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
          <text x="172" y="104" text-anchor="middle" class="cap muted">ON</text>
        </g>`;
        })
        .join("")}
    </g>

    <!-- docked agent inspector -->
    <g transform="translate(760 52)">
      <rect width="360" height="400" rx="14" fill="#fff" stroke="${T.outline}"/>
      <text x="20" y="32" class="title ink">Codex</text>
      <text x="20" y="52" class="small muted">${U.running} \u00b7 gpt-5.6</text>
      <rect x="16" y="72" width="328" height="44" rx="10" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
      <text x="32" y="98" class="label ink">${U.connect}</text>
      <rect x="16" y="128" width="328" height="44" rx="10" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
      <text x="32" y="154" class="label ink">${U.hooks}</text>
      <rect x="16" y="184" width="328" height="44" rx="10" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
      <text x="32" y="210" class="label ink">${U.explain}</text>
      <text x="20" y="270" class="small faint">no Soft Pad chassis / no ring chips</text>
      <text x="20" y="292" class="small faint">status colors reuse mini guidelines</text>
    </g>
  </g>

  <text x="64" y="870" class="title ink">${U.c2t}</text>
  <text x="64" y="894" class="body muted">${U.c2d}</text>
`
);

// C3 Timeline face
const c3 = wrap(
  1280,
  960,
  `
  ${defs}
  <rect class="bg" width="1280" height="960"/>
  <rect x="40" y="28" width="1200" height="860" rx="16" class="shell"/>
  ${topChrome("tm")}

  <g transform="translate(64 330)">
    <rect width="1152" height="500" rx="18" fill="#fbf6ec" stroke="${T.amberBd}"/>
    <text x="24" y="28" class="cap" fill="${T.amber}">SPINE DESK \u00b7 TIMELINE FACE</text>

    <!-- TM chrome -->
    <g transform="translate(24 48)">
      <rect width="1104" height="420" rx="14" fill="#fffaf2" stroke="${T.amberBd}"/>
      <rect x="0" y="0" width="1104" height="48" rx="14" fill="#fff7e8" stroke="${T.amberBd}"/>
      <text x="20" y="30" class="title ink">${U.capTitle}</text>
      <text x="220" y="30" class="small muted">voice-pilot /</text>
      <rect x="900" y="12" width="180" height="26" rx="13" fill="${T.amberBg}" stroke="${T.amberBd}"/>
      <text x="990" y="29" text-anchor="middle" class="cap" fill="${T.amber}">${U.autosave} ON</text>

      <!-- spine -->
      <g transform="translate(20 70)">
        <line x1="12" y1="0" x2="12" y2="300" stroke="${T.amberBright}" stroke-width="2"/>
        ${[
          [U.now, "12:48", true],
          ["autosave", "12:40", false],
          ["commit", "11:52", false],
          ["autosave", "11:20", false],
        ]
          .map((row, i) => {
            const y = i * 70;
            return `
          <circle cx="12" cy="${y + 8}" r="${row[2] ? 7 : 5}" fill="${row[2] ? T.amberBright : "#fff"}" stroke="${T.amberBright}" stroke-width="2"/>
          <rect x="36" y="${y - 8}" width="280" height="52" rx="10" fill="${row[2] ? T.amberBg : "#fff"}" stroke="${T.amberBd}"/>
          <text x="52" y="${y + 12}" class="label ink">${row[0]}</text>
          <text x="52" y="${y + 30}" class="small muted">${row[1]}</text>`;
          })
          .join("")}
      </g>

      <!-- impact panel -->
      <g transform="translate(380 70)">
        <text x="0" y="0" class="cap" fill="${T.amber}">${U.impact}</text>
        <text x="0" y="36" class="h1 ink">${U.now}</text>
        <text x="0" y="58" class="small muted">restore to this point</text>
        <rect x="0" y="80" width="140" height="72" rx="12" fill="${T.amberBg}" stroke="${T.amberBd}"/>
        <text x="20" y="112" class="h1" fill="${T.amber}">4</text>
        <text x="20" y="134" class="cap muted">${U.files}</text>
        <rect x="156" y="80" width="140" height="72" rx="12" fill="rgba(220,38,38,0.06)" stroke="rgba(220,38,38,0.2)"/>
        <text x="176" y="112" class="h1" fill="#c2413a">1</text>
        <text x="176" y="134" class="cap muted">delete</text>
        <rect x="0" y="172" width="300" height="40" rx="10" fill="${T.amberBright}"/>
        <text x="150" y="196" text-anchor="middle" class="label" fill="#fff">${"\u6062\u590d\u5230\u6b64\u70b9"}</text>
        <text x="0" y="240" class="small muted">${U.bindWs} \u00b7 voice-pilot</text>
        <text x="0" y="280" class="small faint">full-bleed desk \u00b7 Soft Pad chassis unmounted</text>
      </g>
    </g>
  </g>

  <text x="64" y="870" class="title ink">${U.c3t}</text>
  <text x="64" y="894" class="body muted">${U.c3d}</text>
`
);

const files = [
  ["ia-c1-softpad-face", c1],
  ["ia-c2-lights-face", c2],
  ["ia-c3-timeline-face", c3],
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
