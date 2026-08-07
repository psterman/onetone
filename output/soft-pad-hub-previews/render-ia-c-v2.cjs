const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;

const T = {
  bg: "#eef3f7",
  shell: "#f8fbfd",
  shellStroke: "#d5e0eb",
  ink: "#3a4454",
  muted: "#8a95a5",
  faint: "#94a3b4",
  primary: "#2a9cc4",
  primaryBright: "#3eb8dc",
  primaryOn: "#00a3ff",
  outline: "rgba(26,45,74,0.14)",
  green: "#2e7d4f",
  greenBg: "rgba(46,125,79,0.1)",
  greenBd: "rgba(46,125,79,0.28)",
  amber: "#d97706",
  amberBright: "#f59e0b",
  amberBg: "rgba(245,158,11,0.1)",
  amberBd: "rgba(245,158,11,0.28)",
  idle: "rgba(138,149,165,0.35)",
  running: "rgba(42,156,196,0.75)",
  needs: "rgba(245,166,35,0.88)",
  done: "rgba(64,180,120,0.85)",
  failed: "rgba(220,80,90,0.9)",
  ag: [
    "rgba(64,220,180,0.55)",
    "rgba(255,170,60,0.55)",
    "rgba(80,140,255,0.55)",
    "rgba(180,190,210,0.5)",
    "rgba(255,90,140,0.5)",
    "rgba(120,230,255,0.5)",
  ],
};

const U = {
  enabled: "\u5df2\u542f\u7528",
  bind: "\u7ed1\u5b9a \u00b7 Codex",
  lights: "\u72b6\u6001\u706f",
  keysMeta: "\u952e\u4f4d",
  restore: "\u6062\u590d\u70b9",
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
  follow: "\u8ddf\u968f\u5e94\u7528",
  top: "\u7f6e\u9876",
  mini: "\u8ff7\u4f60\u6761",
  hide: "\u9690\u85cf",
  demo: "\u52a8\u753b\u6f14\u793a",
  idle: "\u7a7a\u95f2",
  running: "\u6267\u884c\u4e2d",
  wait: "\u7b49\u5f85\u8f93\u5165",
  done: "\u5b8c\u6210",
  failed: "\u5931\u8d25",
  mapKey: "\u6620\u5c04\u952e",
  jump: "\u8df3\u8f6c",
  c1t: "C1v2 \u00b7 Soft Pad \u9762",
  c1d: "\u952e\u5e3d\u590d\u7528 micro-hw \u6750\u8d28\uff1b\u53f3\u4fa7\u4e3a\u300c\u51fa\u73b0\u300d\u6a21\u5f0f\u7684\u52a8\u753b\u6f14\u793a\uff0c\u4e0d\u662f\u7a7a\u5217\u8868",
  c2t: "C2v2 \u00b7 \u72b6\u6001\u706f\u9762",
  c2d: "\u4fdd\u7559 Soft Pad \u9884\u89c8\uff1b\u706f\u4f4d=\u529f\u80fd\u5339\u914d\u5c55\u793a\uff1b\u8bbe\u7f6e\u5199\u8fdb\u706f\u677f\uff0c\u4e0d\u5360\u53f3\u680f",
  c3t: "C3v2 \u00b7 \u65f6\u95f4\u80f6\u56ca\u9762",
  c3d: "\u6a2a\u5411\u65f6\u95f4\u8f74+\u5177\u4f53\u65e5\u671f\uff1bSoft Pad \u9884\u89c8\u53ef\u8df3\u8f6c\u5230\u5bf9\u5e94\u65f6\u95f4\u70b9",
};

const css = `
.bg{fill:${T.bg}}.shell{fill:${T.shell};stroke:${T.shellStroke}}
.ink{fill:#142033}.muted{fill:#6b7a8d}.faint{fill:${T.faint}}
.hwInk{fill:${T.ink}}.hwMuted{fill:${T.muted}}
.small{font:11px 'Segoe UI','Microsoft YaHei',sans-serif}
.body{font:13px 'Segoe UI','Microsoft YaHei',sans-serif}
.title{font:700 15px 'Segoe UI','Microsoft YaHei',sans-serif}
.h1{font:700 18px 'Segoe UI','Microsoft YaHei',sans-serif}
.h2{font:700 16px 'Segoe UI','Microsoft YaHei',sans-serif}
.label{font:700 11px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 9px 'Segoe UI','Microsoft YaHei',sans-serif}
.digit{font:700 14px 'Segoe UI',Arial,sans-serif}
.metaL{font:600 11px 'Segoe UI','Microsoft YaHei',sans-serif}
.metaV{font:700 12px 'Segoe UI','Microsoft YaHei',sans-serif}
`;

function wrap(w, h, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <style type="text/css"><![CDATA[${css}]]></style>
    <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="rgba(79,172,254,0.85)"/>
      <stop offset="50%" stop-color="rgba(42,156,196,0.95)"/>
      <stop offset="100%" stop-color="rgba(245,158,11,0.85)"/>
    </linearGradient>
    <linearGradient id="keyFace" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#eef2f6"/>
    </linearGradient>
    <linearGradient id="keyCmd" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f4f8fb"/>
      <stop offset="100%" stop-color="#e2ebf3"/>
    </linearGradient>
    <linearGradient id="encOn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4db6ff"/>
      <stop offset="100%" stop-color="#00a3ff"/>
    </linearGradient>
    <linearGradient id="encOff" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#cbd5e1"/>
    </linearGradient>
    <filter id="keyShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="1.4" flood-color="#0f172a" flood-opacity="0.16"/>
    </filter>
    <filter id="pressGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="#00a3ff" flood-opacity="0.45"/>
    </filter>
  </defs>
${body}
</svg>`;
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
    </g>`;
  }
  return `<g transform="translate(${cx - 12} ${cy - 12})" fill="none" stroke="${color}" stroke-width="1.6">
    <rect x="1" y="7" width="22" height="10" rx="5"/><path d="M12 7v10"/>
    <circle cx="7" cy="12" r="1.6" fill="${color}" stroke="none"/>
  </g>`;
}

function topChrome(activeFace) {
  const faces = [
    { id: "pad", title: U.softPad, hint: U.softHint, accent: T.primaryBright, tagBg: "rgba(94,200,232,0.1)", tagBd: "rgba(94,200,232,0.28)" },
    { id: "agent", title: U.lightTitle, hint: U.lightHint, accent: "#34d399", tagBg: "rgba(52,211,153,0.1)", tagBd: "rgba(52,211,153,0.28)" },
    { id: "tm", title: U.capTitle, hint: U.capHint, accent: T.amberBright, tagBg: T.amberBg, tagBd: T.amberBd },
  ];
  let nodes = "";
  faces.forEach((f, i) => {
    const x = 64 + i * 380;
    const on = f.id === activeFace;
    nodes += `
    <g transform="translate(${x} 0)">
      <rect x="110" y="0" width="88" height="18" rx="9" fill="${f.tagBg}" stroke="${f.tagBd}"/>
      <text x="154" y="13" text-anchor="middle" class="cap" fill="${f.accent}">${f.id === "pad" ? "PAD" : f.id === "agent" ? "LIGHT" : "TIME"}</text>
      <circle cx="154" cy="64" r="40" fill="#fff" stroke="${on ? f.accent : T.outline}" stroke-width="${on ? 2.5 : 1}"/>
      ${on ? `<circle cx="154" cy="64" r="46" fill="none" stroke="${f.accent}" stroke-opacity="0.22" stroke-width="6"/>` : ""}
      ${faceIcon(f.id, 154, 64, f.accent)}
      <text x="154" y="128" text-anchor="middle" class="h2 ink">${f.title}</text>
      <text x="154" y="148" text-anchor="middle" class="small muted">${f.hint}</text>
    </g>`;
  });
  return `
  <rect x="40" y="28" width="1200" height="92" rx="14" fill="#fff" stroke="${T.outline}"/>
  <text x="60" y="56" class="h1 ink">Codex</text>
  <rect x="128" y="40" width="52" height="22" rx="11" fill="${T.greenBg}" stroke="${T.greenBd}"/>
  <text x="154" y="55" text-anchor="middle" class="cap" fill="${T.green}">${U.enabled}</text>
  <rect x="190" y="40" width="108" height="22" rx="11" fill="#f1f5f9" stroke="${T.outline}"/>
  <text x="244" y="55" text-anchor="middle" class="cap ink">${U.bind}</text>
  <text x="60" y="82" class="metaL muted">${U.lights}</text>
  <text x="110" y="82" class="metaV ink">Codex</text>
  <rect x="158" y="72" width="1" height="12" fill="${T.outline}"/>
  <text x="170" y="82" class="metaL muted">${U.keysMeta}</text>
  <text x="208" y="82" class="metaV ink">12/15</text>
  <rect x="252" y="72" width="1" height="12" fill="${T.outline}"/>
  <text x="264" y="82" class="metaL muted">${U.restore}</text>
  <text x="314" y="82" class="metaV ink">3</text>
  <rect x="900" y="44" width="78" height="26" rx="8" fill="#f1f5f9" stroke="${T.outline}"/>
  <text x="939" y="61" text-anchor="middle" class="cap muted">${U.testFg}</text>
  <rect x="988" y="44" width="78" height="26" rx="8" fill="#f1f5f9" stroke="${T.outline}"/>
  <text x="1027" y="61" text-anchor="middle" class="cap muted">${U.editKeys}</text>
  <rect x="1076" y="44" width="90" height="26" rx="8" fill="#f1f5f9" stroke="${T.outline}"/>
  <text x="1121" y="61" text-anchor="middle" class="cap muted">${U.openTm}</text>
  <rect x="1180" y="46" width="40" height="22" rx="11" fill="${T.green}"/>
  <circle cx="1208" cy="57" r="8" fill="#fff"/>
  <g transform="translate(0 140)">
    <path d="M220 64 Q640 48 1060 64" fill="none" stroke="rgba(42,156,196,0.2)" stroke-width="3" stroke-linecap="round"/>
    <path d="M220 64 Q640 48 1060 64" fill="none" stroke="url(#flowGrad)" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="8 5"/>
    ${nodes}
  </g>`;
}

/** Realistic micro-hw keycap */
function hwKey(x, y, w, h, opts) {
  const {
    kind = "command", // control|agent|command|nav
    label = "",
    sub = "",
    digit = "",
    ag = -1,
    focused = false,
    pressed = false,
    statusDot = null,
  } = opts;
  const fill = kind === "control" ? "url(#encOn)" : kind === "agent" ? "#f7fafc" : "url(#keyFace)";
  const ink = kind === "control" ? "#fff" : T.ink;
  const muted = kind === "control" ? "rgba(255,255,255,0.75)" : T.muted;
  const glow = ag >= 0 ? T.ag[ag % T.ag.length] : null;
  const filter = pressed ? "url(#pressGlow)" : "url(#keyShadow)";
  return `
  <g transform="translate(${x} ${y})" filter="${filter}">
    <rect width="${w}" height="${h}" rx="8" fill="${fill}" stroke="${focused ? T.primaryOn : "rgba(15,23,42,0.12)"}" stroke-width="${focused ? 2 : 1}"/>
    ${glow ? `<rect x="3" y="3" width="${w - 6}" height="3" rx="1.5" fill="${glow}"/>` : ""}
    ${digit ? `<text x="10" y="18" class="cap" fill="${muted}">${digit}</text>` : ""}
    <text x="${w / 2}" y="${h / 2 + (sub ? 0 : 4)}" text-anchor="middle" class="label" fill="${ink}">${label}</text>
    ${sub ? `<text x="${w / 2}" y="${h / 2 + 14}" text-anchor="middle" class="cap" fill="${muted}">${sub}</text>` : ""}
    ${statusDot ? `<circle cx="${w - 10}" cy="${h - 10}" r="4" fill="${statusDot}" stroke="#fff" stroke-width="1.2"/>` : ""}
  </g>`;
}

/** Full Soft Pad preview matching layout.json spirit */
function softPadPreview(ox, oy, scale = 1, highlight = null) {
  const kw = 56 * scale;
  const kh = 44 * scale;
  const g = 5 * scale;
  // simplified 5-col grid like micro pad
  const cells = [
    // row1: ENC ACT06 ACT07 ACT08 + spacer/plus top
    { r: 0, c: 1, id: "ENC", kind: "control", label: "ENC", sub: "POWER", digit: "" },
    { r: 0, c: 2, id: "ACT06", kind: "command", label: "FAST", sub: "\u5feb\u901f", digit: "/" },
    { r: 0, c: 3, id: "ACT07", kind: "command", label: "CMD", sub: "\u83dc\u5355", digit: "*" },
    { r: 0, c: 4, id: "ACT08", kind: "command", label: "NO", sub: "\u62d2\u7edd", digit: "-" },
    // row2: NAV_UP AG00-02 PLUS
    { r: 1, c: 0, id: "NAV_UP", kind: "nav", label: "\u25b2", sub: "UP", digit: "" },
    { r: 1, c: 1, id: "AG00", kind: "agent", label: "AG0", sub: "CMD", digit: "7", ag: 0 },
    { r: 1, c: 2, id: "AG01", kind: "agent", label: "AG1", sub: "NEW", digit: "8", ag: 1 },
    { r: 1, c: 3, id: "AG02", kind: "agent", label: "AG2", sub: "FAST", digit: "9", ag: 2 },
    { r: 1, c: 4, id: "PLUS", kind: "command", label: "+", sub: "PLUS", digit: "", h: 2 },
    // row3
    { r: 2, c: 0, id: "NAV_LEFT", kind: "nav", label: "\u25c0", sub: "LEFT", digit: "" },
    { r: 2, c: 1, id: "AG03", kind: "agent", label: "AG3", sub: "FIND", digit: "4", ag: 3 },
    { r: 2, c: 2, id: "AG04", kind: "agent", label: "AG4", sub: "SEND", digit: "5", ag: 4 },
    { r: 2, c: 3, id: "AG05", kind: "agent", label: "AG5", sub: "CANCEL", digit: "6", ag: 5 },
    // row4
    { r: 3, c: 0, id: "NAV_DOWN", kind: "nav", label: "\u25bc", sub: "DOWN", digit: "" },
    { r: 3, c: 1, id: "ACT09", kind: "command", label: "NEW", sub: "\u65b0\u5efa", digit: "1" },
    { r: 3, c: 2, id: "UNDO", kind: "command", label: "UNDO", sub: "\u64a4\u9500", digit: "2" },
    { r: 3, c: 3, id: "SEARCH", kind: "command", label: "FIND", sub: "\u641c\u7d22", digit: "3" },
    { r: 3, c: 4, id: "ACT12", kind: "command", label: "SEND", sub: "\u53d1\u9001", digit: "", h: 2 },
    // row5
    { r: 4, c: 0, id: "NAV_RIGHT", kind: "nav", label: "\u25b6", sub: "RIGHT", digit: "" },
    { r: 4, c: 1, id: "ACT10", kind: "command", label: "MIC", sub: "\u8bed\u97f3", digit: "0", w: 2 },
    { r: 4, c: 3, id: "DOT", kind: "command", label: ".", sub: "DOT", digit: "" },
  ];

  const bodyW = 5 * kw + 4 * g + 20;
  const bodyH = 5 * kh + 4 * g + 20;
  let keys = "";
  for (const cell of cells) {
    const x = 10 + cell.c * (kw + g);
    const y = 10 + cell.r * (kh + g);
    const w = (cell.w || 1) * kw + ((cell.w || 1) - 1) * g;
    const h = (cell.h || 1) * kh + ((cell.h || 1) - 1) * g;
    const focused = highlight === cell.id;
    const pressed = highlight === cell.id;
    keys += hwKey(x, y, w, h, {
      kind: cell.kind,
      label: cell.label,
      sub: cell.sub,
      digit: cell.digit,
      ag: cell.ag ?? -1,
      focused,
      pressed,
      statusDot: cell.id === "AG00" ? T.running : cell.id === "AG01" ? T.done : cell.id === "AG02" ? T.needs : null,
    });
  }

  return `
  <g transform="translate(${ox} ${oy})">
    <rect width="${bodyW}" height="${bodyH}" rx="24" fill="#dce6f0" stroke="rgba(15,23,42,0.12)" filter="url(#keyShadow)"/>
    <rect x="6" y="6" width="${bodyW - 12}" height="${bodyH - 12}" rx="18" fill="#eef3f8"/>
    ${keys}
  </g>`;
}

function miniBar(ox, oy) {
  return `
  <g transform="translate(${ox} ${oy})">
    <rect width="156" height="44" rx="10" fill="#e8eef5" stroke="rgba(42,156,196,0.25)" filter="url(#keyShadow)"/>
    <rect x="6" y="6" width="22" height="22" rx="7" fill="#f8fafc" stroke="${T.outline}"/>
    <circle cx="24" cy="24" r="3.5" fill="${T.running}" stroke="#fff" stroke-width="1.2"/>
    <rect x="30" y="6" width="22" height="22" rx="7" fill="#f8fafc" stroke="${T.outline}"/>
    <circle cx="48" cy="24" r="3.5" fill="${T.done}" stroke="#fff" stroke-width="1.2"/>
    <rect x="54" y="6" width="22" height="22" rx="7" fill="#f8fafc" stroke="${T.outline}"/>
    <circle cx="72" cy="24" r="3.5" fill="${T.needs}" stroke="#fff" stroke-width="1.2"/>
    <rect x="96" y="8" width="30" height="28" rx="8" fill="#fff" stroke="${T.outline}"/>
    <text x="111" y="26" text-anchor="middle" class="cap muted">\u5c55\u5f00</text>
    <rect x="128" y="10" width="24" height="24" rx="8" fill="#fff" stroke="${T.outline}"/>
    <text x="140" y="26" text-anchor="middle" class="cap muted">\u00d7</text>
  </g>`;
}

// ---------- C1v2 Soft Pad with hw keys + appear animation demos ----------
const c1 = wrap(
  1280,
  980,
  `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="28" width="1200" height="880" rx="16" class="shell"/>
  ${topChrome("pad")}

  <g transform="translate(56 320)">
    <rect width="560" height="520" rx="16" fill="#e8f1f7" stroke="rgba(62,184,220,0.3)"/>
    <text x="20" y="28" class="cap" fill="${T.primary}">MICRO-HW PREVIEW</text>
    ${softPadPreview(40, 48, 1.15, "ACT06")}
    <g transform="translate(40 430)">
      <rect width="480" height="36" rx="10" fill="#1e3a48"/>
      <rect x="8" y="5" width="110" height="26" rx="7" fill="${T.primaryBright}"/>
      <text x="63" y="22" text-anchor="middle" class="cap" fill="#06202a">${U.appear}</text>
      <text x="180" y="22" text-anchor="middle" class="cap" fill="#9ec9d8">\u952e\u4f4d</text>
      <text x="280" y="22" text-anchor="middle" class="cap" fill="#9ec9d8">\u5916\u89c2</text>
      <text x="390" y="22" text-anchor="middle" class="cap" fill="#9ec9d8">\u7528\u9014</text>
    </g>
    <text x="20" y="500" class="small faint">keycap = micro-hw sculpt \u00b7 FAST pressed demo</text>
  </g>

  <!-- Right: appear mode animation demos (not empty list) -->
  <g transform="translate(640 320)">
    <rect width="560" height="520" rx="16" fill="#f3f7fa" stroke="${T.outline}"/>
    <text x="20" y="28" class="title ink">${U.appear} \u00b7 ${U.demo}</text>
    <text x="20" y="48" class="small muted">\u9009\u4e2d\u6a21\u5f0f\u65f6\u53f3\u4fa7\u64ad\u653e\u5bf9\u5e94\u51fa\u73b0\u52a8\u753b</text>

    <!-- demo card: follow -->
    <g transform="translate(20 68)">
      <rect width="250" height="200" rx="12" fill="#fff" stroke="${T.primaryBright}" stroke-width="2"/>
      <rect x="0" y="0" width="250" height="28" rx="12" fill="rgba(62,184,220,0.12)"/>
      <text x="12" y="18" class="cap" fill="${T.primary}">${U.follow} \u00b7 SELECTED</text>
      <!-- fake app window -->
      <rect x="24" y="48" width="140" height="100" rx="8" fill="#e8eef5" stroke="${T.outline}"/>
      <text x="94" y="100" text-anchor="middle" class="cap muted">Codex App</text>
      <!-- pad sliding in from right with motion arrows -->
      <rect x="150" y="70" width="70" height="70" rx="10" fill="#dce6f0" stroke="${T.primaryBright}" opacity="0.95"/>
      <text x="185" y="108" text-anchor="middle" class="cap" fill="${T.primary}">PAD</text>
      <path d="M130 105 H148" stroke="${T.primaryOn}" stroke-width="2" marker-end="url(#arrow)"/>
      <polygon points="148,100 156,105 148,110" fill="${T.primaryOn}"/>
      <text x="12" y="175" class="small muted">FG match \u2192 pad floats in</text>
      <text x="12" y="192" class="cap" fill="${T.primary}">\u25b6 playing</text>
    </g>

    <!-- demo: always top -->
    <g transform="translate(290 68)">
      <rect width="250" height="200" rx="12" fill="#fff" stroke="${T.outline}"/>
      <text x="12" y="22" class="cap muted">${U.top}</text>
      <rect x="30" y="48" width="120" height="80" rx="8" fill="#e8eef5" stroke="${T.outline}" opacity="0.5"/>
      <rect x="70" y="70" width="120" height="90" rx="8" fill="#e8eef5" stroke="${T.outline}" opacity="0.7"/>
      <rect x="110" y="88" width="100" height="70" rx="10" fill="#dce6f0" stroke="${T.primaryBright}"/>
      <text x="160" y="128" text-anchor="middle" class="cap" fill="${T.primary}">PAD z-top</text>
      <text x="12" y="185" class="small muted">always above windows</text>
    </g>

    <!-- demo: mini -->
    <g transform="translate(20 288)">
      <rect width="250" height="200" rx="12" fill="#fff" stroke="${T.outline}"/>
      <text x="12" y="22" class="cap muted">${U.mini}</text>
      ${miniBar(40, 70)}
      <text x="12" y="150" class="small muted">156\u00d744 status strip</text>
      <text x="12" y="170" class="small muted">expand \u2192 full pad</text>
      <!-- pulse rings -->
      <circle cx="200" cy="90" r="10" fill="none" stroke="${T.running}" stroke-opacity="0.35"/>
      <circle cx="200" cy="90" r="16" fill="none" stroke="${T.running}" stroke-opacity="0.2"/>
      <circle cx="200" cy="90" r="4" fill="${T.running}"/>
    </g>

    <!-- demo: hide -->
    <g transform="translate(290 288)">
      <rect width="250" height="200" rx="12" fill="#fff" stroke="${T.outline}"/>
      <text x="12" y="22" class="cap muted">${U.hide}</text>
      <rect x="40" y="60" width="160" height="90" rx="10" fill="#eef2f6" stroke="${T.outline}" stroke-dasharray="4 3"/>
      <text x="120" y="108" text-anchor="middle" class="cap faint">no overlay</text>
      <text x="12" y="175" class="small muted">hotkeys only \u00b7 pad ghosted</text>
    </g>
  </g>

  <text x="56" y="890" class="title ink">${U.c1t}</text>
  <text x="56" y="914" class="body muted">${U.c1d}</text>
`
);

// ---------- C2v2 Lights with Soft Pad preview, inline function mapping ----------
const agents = [
  { name: "Codex", status: T.running, statusLabel: U.running, model: "gpt-5.6-sol", key: "AG00", fn: "\u547d\u4ee4\u83dc\u5355", on: true },
  { name: "Claude", status: T.done, statusLabel: U.done, model: "sonnet", key: "AG01", fn: "\u65b0\u5efa\u4f1a\u8bdd", on: true },
  { name: "Cursor", status: T.needs, statusLabel: U.wait, model: "Auto", key: "AG02", fn: "\u5feb\u901f\u804a\u5929", on: true },
  { name: "WorkBuddy", status: T.idle, statusLabel: U.idle, model: "--", key: "AG03", fn: "\u641c\u7d22", on: false },
  { name: "Trae", status: T.idle, statusLabel: U.idle, model: "--", key: "AG04", fn: "\u53d1\u9001", on: false },
  { name: "Qoder", status: T.failed, statusLabel: U.failed, model: "--", key: "AG05", fn: "\u53d6\u6d88", on: true },
];

const c2 = wrap(
  1280,
  980,
  `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="28" width="1200" height="880" rx="16" class="shell"/>
  ${topChrome("agent")}

  <g transform="translate(56 320)">
    <rect width="1152" height="520" rx="16" fill="#ecf8f3" stroke="rgba(52,211,153,0.3)"/>
    <text x="20" y="28" class="cap" fill="${T.green}">LIGHTBOARD + SOFT PAD PREVIEW</text>

    <!-- left: soft pad with agent keys lit -->
    <g transform="translate(20 48)">
      <text x="0" y="0" class="small muted">Soft Pad \u9884\u89c8 \u00b7 AG \u952e\u72b6\u6001\u70b9\u540c\u6b65</text>
      ${softPadPreview(0, 16, 1.05, "AG00")}
      <text x="0" y="360" class="small faint">AG0..AG5 dots mirror lightboard</text>
    </g>

    <!-- right: function-matched light tiles filling space (no empty list) -->
    <g transform="translate(420 48)">
      ${agents
        .map((a, i) => {
          const x = (i % 3) * 230;
          const y = Math.floor(i / 3) * 220;
          return `
        <g transform="translate(${x} ${y})">
          <rect width="216" height="200" rx="14" fill="#fff" stroke="${i === 0 ? T.primaryBright : T.outline}" stroke-width="${i === 0 ? 2 : 1}"/>
          <!-- mini icon + status -->
          <rect x="14" y="14" width="36" height="36" rx="9" fill="#f1f5f9" stroke="${T.outline}"/>
          <circle cx="42" cy="42" r="5" fill="${a.status}" stroke="#fff" stroke-width="1.5"/>
          <text x="62" y="30" class="label ink">${a.name}</text>
          <text x="62" y="48" class="cap" fill="${a.status}">${a.statusLabel}</text>

          <!-- function match -->
          <rect x="14" y="64" width="188" height="52" rx="8" fill="#f3faf7" stroke="rgba(52,211,153,0.25)"/>
          <text x="24" y="84" class="cap faint">${U.mapKey}</text>
          <text x="24" y="104" class="label ink">${a.key} \u2192 ${a.fn}</text>

          <!-- model + toggle inline -->
          <text x="14" y="140" class="cap faint">model</text>
          <text x="14" y="158" class="small ink">${a.model}</text>
          <rect x="130" y="132" width="56" height="28" rx="14" fill="${a.on ? T.green : "#cbd5e1"}"/>
          <circle cx="${a.on ? 168 : 146}" cy="146" r="10" fill="#fff"/>
          <text x="14" y="186" class="cap muted">${a.on ? "light ON \u00b7 hook ok" : "light OFF"}</text>
        </g>`;
        })
        .join("")}
    </g>
  </g>

  <text x="56" y="890" class="title ink">${U.c2t}</text>
  <text x="56" y="914" class="body muted">${U.c2d}</text>
`
);

// ---------- C3v2 Horizontal timeline + Soft Pad jump preview ----------
const c3 = wrap(
  1280,
  980,
  `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="28" width="1200" height="880" rx="16" class="shell"/>
  ${topChrome("tm")}

  <g transform="translate(56 320)">
    <rect width="1152" height="520" rx="16" fill="#fbf6ec" stroke="${T.amberBd}"/>
    <text x="20" y="28" class="cap" fill="${T.amber}">HORIZONTAL SPINE + SOFT PAD JUMP</text>

    <!-- horizontal timeline -->
    <g transform="translate(40 60)">
      <text x="0" y="0" class="small muted">2026-08-07</text>
      <!-- rail -->
      <line x1="0" y1="50" x2="700" y2="50" stroke="${T.amberBright}" stroke-width="3" stroke-linecap="round"/>
      ${[
        { x: 40, t: "09:20", label: "autosave", active: false, key: "AG1" },
        { x: 180, t: "11:05", label: "commit", active: false, key: "AG2" },
        { x: 340, t: "12:40", label: "autosave", active: true, key: "AG0" },
        { x: 500, t: "14:18", label: "restore?", active: false, key: "AG3" },
        { x: 640, t: "\u73b0\u5728", label: "live", active: false, key: "ENC" },
      ]
        .map(
          (p) => `
        <g transform="translate(${p.x} 50)">
          <circle cy="0" r="${p.active ? 10 : 7}" fill="${p.active ? T.amberBright : "#fff"}" stroke="${T.amberBright}" stroke-width="2.5"/>
          ${p.active ? `<circle cy="0" r="16" fill="none" stroke="${T.amberBright}" stroke-opacity="0.25" stroke-width="4"/>` : ""}
          <text y="-22" text-anchor="middle" class="label ink">${p.t}</text>
          <text y="28" text-anchor="middle" class="cap muted">${p.label}</text>
          <rect x="-28" y="40" width="56" height="20" rx="10" fill="${p.active ? T.amberBg : "#fff"}" stroke="${T.amberBd}"/>
          <text y="54" text-anchor="middle" class="cap" fill="${T.amber}">${p.key}</text>
        </g>`
        )
        .join("")}

      <!-- date chips under rail -->
      <g transform="translate(0 120)">
        <rect width="70" height="26" rx="13" fill="${T.amberBg}" stroke="${T.amberBd}"/>
        <text x="35" y="17" text-anchor="middle" class="cap" fill="${T.amber}">08-07</text>
        <rect x="80" width="70" height="26" rx="13" fill="#fff" stroke="${T.outline}"/>
        <text x="115" y="17" text-anchor="middle" class="cap muted">08-06</text>
        <rect x="160" width="70" height="26" rx="13" fill="#fff" stroke="${T.outline}"/>
        <text x="195" y="17" text-anchor="middle" class="cap muted">08-05</text>
      </g>

      <!-- selected point detail - not a table, a card under spine -->
      <g transform="translate(0 170)">
        <rect width="700" height="120" rx="14" fill="#fffaf2" stroke="${T.amberBd}"/>
        <text x="20" y="32" class="title ink">12:40 autosave</text>
        <text x="20" y="56" class="small muted">2026-08-07 \u00b7 Codex \u00b7 4 files changed</text>
        <rect x="20" y="74" width="120" height="28" rx="8" fill="${T.amberBright}"/>
        <text x="80" y="92" text-anchor="middle" class="cap" fill="#fff">\u6062\u590d\u5230\u6b64\u70b9</text>
        <text x="160" y="92" class="small muted">${U.jump}: Soft Pad AG0</text>
      </g>
    </g>

    <!-- Soft Pad preview as timeline remote -->
    <g transform="translate(780 48)">
      <text x="0" y="0" class="small muted">Soft Pad \u4ecb\u5165 \u00b7 \u6309\u952e\u8df3\u8f6c\u65f6\u95f4\u70b9</text>
      ${softPadPreview(0, 16, 0.95, "AG00")}
      <g transform="translate(0 360)">
        <rect width="320" height="100" rx="12" fill="#fff" stroke="${T.amberBd}"/>
        <text x="14" y="24" class="label ink">AG0 \u2192 12:40</text>
        <text x="14" y="46" class="small muted">AG1 \u2192 09:20 \u00b7 AG2 \u2192 11:05</text>
        <text x="14" y="68" class="small muted">ENC \u2192 \u8df3\u5230\u73b0\u5728</text>
        <text x="14" y="88" class="cap" fill="${T.amber}">pad acts as timeline scrubber</text>
      </g>
    </g>
  </g>

  <text x="56" y="890" class="title ink">${U.c3t}</text>
  <text x="56" y="914" class="body muted">${U.c3d}</text>
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
