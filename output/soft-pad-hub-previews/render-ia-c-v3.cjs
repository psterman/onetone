const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;

const T = {
  bg: "#eef3f7",
  shell: "#f8fbfd",
  ink: "#142033",
  muted: "#6b7a8d",
  faint: "#94a3b4",
  hwInk: "#3a4454",
  hwMuted: "#8a95a5",
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
  keys: "\u952e\u4f4d",
  look: "\u5916\u89c2",
  purpose: "\u7528\u9014",
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
  switchApp: "\u5207\u6362\u5e94\u7528",
  thisApp: "\u5f53\u524d\u5e94\u7528\u706f\u4f4d",
  c1t: "C1v3 \u00b7 Soft Pad",
  c1d: "\u5de6\u7eaf\u952e\u76d8\u5c55\u793a\uff1b\u6a21\u5f0f tab \u5728\u53f3\u680f\u9876\u90e8\uff1b\u5de6\u53f3\u9ad8\u5ea6\u5bf9\u9f50",
  c2t: "C2v3 \u00b7 \u72b6\u6001\u706f",
  c2d: "\u4e00\u6b21\u53ea\u5c55\u793a\u5f53\u524d\u5e94\u7528\u7684\u706f\u4e0e\u80fd\u529b\uff1b\u5207\u6362 App \u6362\u706f",
  c3t: "C3v3 \u00b7 \u65f6\u95f4\u80f6\u56ca",
  c3d: "\u5de6 Soft Pad \u00b7 \u4e0b\u6a2a\u5411\u65f6\u95f4\u7ebf \u00b7 \u53f3\u65f6\u95f4\u8282\u70b9\u8be6\u60c5",
};

const css = `
.bg{fill:${T.bg}}.shell{fill:${T.shell};stroke:#d5e0eb}
.ink{fill:${T.ink}}.muted{fill:${T.muted}}.faint{fill:${T.faint}}
.small{font:11px 'Segoe UI','Microsoft YaHei',sans-serif}
.body{font:13px 'Segoe UI','Microsoft YaHei',sans-serif}
.title{font:700 15px 'Segoe UI','Microsoft YaHei',sans-serif}
.h1{font:700 18px 'Segoe UI','Microsoft YaHei',sans-serif}
.h2{font:700 16px 'Segoe UI','Microsoft YaHei',sans-serif}
.label{font:700 11px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 9px 'Segoe UI','Microsoft YaHei',sans-serif}
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
      <stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#eef2f6"/>
    </linearGradient>
    <linearGradient id="encOn" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4db6ff"/><stop offset="100%" stop-color="#00a3ff"/>
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

function hwKey(x, y, w, h, opts) {
  const { kind = "command", label = "", sub = "", digit = "", ag = -1, focused = false, pressed = false, statusDot = null } = opts;
  const fill = kind === "control" ? "url(#encOn)" : "#f7fafc";
  const ink = kind === "control" ? "#fff" : T.hwInk;
  const muted = kind === "control" ? "rgba(255,255,255,0.75)" : T.hwMuted;
  const glow = ag >= 0 ? T.ag[ag % T.ag.length] : null;
  const filter = pressed ? "url(#pressGlow)" : "url(#keyShadow)";
  const bg = kind === "control" ? fill : "url(#keyFace)";
  return `
  <g transform="translate(${x} ${y})" filter="${filter}">
    <rect width="${w}" height="${h}" rx="8" fill="${bg}" stroke="${focused ? T.primaryOn : "rgba(15,23,42,0.12)"}" stroke-width="${focused ? 2 : 1}"/>
    ${glow ? `<rect x="3" y="3" width="${w - 6}" height="3" rx="1.5" fill="${glow}"/>` : ""}
    ${digit ? `<text x="8" y="16" class="cap" fill="${muted}">${digit}</text>` : ""}
    <text x="${w / 2}" y="${h / 2 + (sub ? 0 : 4)}" text-anchor="middle" class="label" fill="${ink}">${label}</text>
    ${sub ? `<text x="${w / 2}" y="${h / 2 + 13}" text-anchor="middle" class="cap" fill="${muted}">${sub}</text>` : ""}
    ${statusDot ? `<circle cx="${w - 9}" cy="${h - 9}" r="3.5" fill="${statusDot}" stroke="#fff" stroke-width="1.2"/>` : ""}
  </g>`;
}

/** Returns {svg, width, height} for soft pad body */
function softPadBody(scale, highlight, agentDots) {
  const kw = 54 * scale;
  const kh = 42 * scale;
  const g = 5 * scale;
  const cells = [
    { r: 0, c: 1, id: "ENC", kind: "control", label: "ENC", sub: "POWER" },
    { r: 0, c: 2, id: "ACT06", kind: "command", label: "FAST", sub: "\u5feb\u901f", digit: "/" },
    { r: 0, c: 3, id: "ACT07", kind: "command", label: "CMD", sub: "\u83dc\u5355", digit: "*" },
    { r: 0, c: 4, id: "ACT08", kind: "command", label: "NO", sub: "\u62d2\u7edd", digit: "-" },
    { r: 1, c: 0, id: "NAV_UP", kind: "nav", label: "\u25b2", sub: "UP" },
    { r: 1, c: 1, id: "AG00", kind: "agent", label: "AG0", sub: "CMD", digit: "7", ag: 0 },
    { r: 1, c: 2, id: "AG01", kind: "agent", label: "AG1", sub: "NEW", digit: "8", ag: 1 },
    { r: 1, c: 3, id: "AG02", kind: "agent", label: "AG2", sub: "FAST", digit: "9", ag: 2 },
    { r: 1, c: 4, id: "PLUS", kind: "command", label: "+", sub: "PLUS", h: 2 },
    { r: 2, c: 0, id: "NAV_LEFT", kind: "nav", label: "\u25c0", sub: "LEFT" },
    { r: 2, c: 1, id: "AG03", kind: "agent", label: "AG3", sub: "FIND", digit: "4", ag: 3 },
    { r: 2, c: 2, id: "AG04", kind: "agent", label: "AG4", sub: "SEND", digit: "5", ag: 4 },
    { r: 2, c: 3, id: "AG05", kind: "agent", label: "AG5", sub: "NO", digit: "6", ag: 5 },
    { r: 3, c: 0, id: "NAV_DOWN", kind: "nav", label: "\u25bc", sub: "DOWN" },
    { r: 3, c: 1, id: "ACT09", kind: "command", label: "NEW", sub: "\u65b0\u5efa", digit: "1" },
    { r: 3, c: 2, id: "UNDO", kind: "command", label: "UNDO", sub: "\u64a4\u9500", digit: "2" },
    { r: 3, c: 3, id: "SEARCH", kind: "command", label: "FIND", sub: "\u641c\u7d22", digit: "3" },
    { r: 3, c: 4, id: "ACT12", kind: "command", label: "SEND", sub: "\u53d1\u9001", h: 2 },
    { r: 4, c: 0, id: "NAV_RIGHT", kind: "nav", label: "\u25b6", sub: "RIGHT" },
    { r: 4, c: 1, id: "ACT10", kind: "command", label: "MIC", sub: "\u8bed\u97f3", digit: "0", w: 2 },
    { r: 4, c: 3, id: "DOT", kind: "command", label: ".", sub: "DOT" },
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
    let statusDot = null;
    if (agentDots && cell.id && cell.id.startsWith("AG") && agentDots[cell.id]) statusDot = agentDots[cell.id];
    keys += hwKey(x, y, w, h, {
      kind: cell.kind,
      label: cell.label,
      sub: cell.sub,
      digit: cell.digit || "",
      ag: cell.ag ?? -1,
      focused,
      pressed: focused,
      statusDot,
    });
  }
  const svg = `
    <rect width="${bodyW}" height="${bodyH}" rx="22" fill="#dce6f0" stroke="rgba(15,23,42,0.12)" filter="url(#keyShadow)"/>
    <rect x="6" y="6" width="${bodyW - 12}" height="${bodyH - 12}" rx="16" fill="#eef3f8"/>
    ${keys}`;
  return { svg, bodyW, bodyH };
}

function softPadAt(ox, oy, scale, highlight, agentDots) {
  const p = softPadBody(scale, highlight, agentDots);
  return { markup: `<g transform="translate(${ox} ${oy})">${p.svg}</g>`, ...p };
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

// Shared workspace band after flow nodes: y=320, height=540, left/right aligned
const BAND_Y = 320;
const BAND_H = 540;
const LEFT_W = 560;
const RIGHT_W = 560;
const GAP = 24;

// ---------- C1v3 ----------
const pad1 = softPadBody(1.35, "ACT06", null);
const leftPadX = 56 + (LEFT_W - pad1.bodyW) / 2;
const leftPadY = BAND_Y + (BAND_H - pad1.bodyH) / 2;

const c1 = wrap(
  1280,
  980,
  `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="28" width="1200" height="880" rx="16" class="shell"/>
  ${topChrome("pad")}

  <!-- LEFT: pure keyboard stage, vertically centered to match right panel height -->
  <g transform="translate(56 ${BAND_Y})">
    <rect width="${LEFT_W}" height="${BAND_H}" rx="16" fill="#e8f1f7" stroke="rgba(62,184,220,0.28)"/>
    <text x="20" y="28" class="cap" fill="${T.primary}">KEYBOARD STAGE</text>
    <g transform="translate(${(LEFT_W - pad1.bodyW) / 2} ${(BAND_H - pad1.bodyH) / 2})">${pad1.svg}</g>
  </g>

  <!-- RIGHT: mode tabs ON TOP of panel, then content -->
  <g transform="translate(${56 + LEFT_W + GAP} ${BAND_Y})">
    <rect width="${RIGHT_W}" height="${BAND_H}" rx="16" fill="#f3f7fa" stroke="${T.outline}"/>
    <!-- subtabs above list -->
    <g transform="translate(16 16)">
      <rect width="120" height="34" rx="10" fill="${T.primaryBright}"/>
      <text x="60" y="22" text-anchor="middle" class="cap" fill="#06202a">${U.appear}</text>
      <rect x="128" width="100" height="34" rx="10" fill="#fff" stroke="${T.outline}"/>
      <text x="178" y="22" text-anchor="middle" class="cap muted">${U.keys}</text>
      <rect x="236" width="100" height="34" rx="10" fill="#fff" stroke="${T.outline}"/>
      <text x="286" y="22" text-anchor="middle" class="cap muted">${U.look}</text>
      <rect x="344" width="100" height="34" rx="10" fill="#fff" stroke="${T.outline}"/>
      <text x="394" y="22" text-anchor="middle" class="cap muted">${U.purpose}</text>
    </g>
    <text x="20" y="72" class="title ink">${U.appear} \u00b7 ${U.demo}</text>
    <text x="20" y="92" class="small muted">\u53f3\u680f\u5c55\u793a\u5f53\u524d tab \u5bf9\u5e94\u5185\u5bb9</text>

    <!-- 2x2 demos filling rest of equal-height panel -->
    <g transform="translate(16 110)">
      <g>
        <rect width="254" height="190" rx="12" fill="#fff" stroke="${T.primaryBright}" stroke-width="2"/>
        <text x="12" y="22" class="cap" fill="${T.primary}">${U.follow}</text>
        <rect x="20" y="40" width="120" height="90" rx="8" fill="#e8eef5" stroke="${T.outline}"/>
        <text x="80" y="88" text-anchor="middle" class="cap muted">App</text>
        <rect x="130" y="60" width="90" height="70" rx="10" fill="#dce6f0" stroke="${T.primaryBright}"/>
        <text x="175" y="98" text-anchor="middle" class="cap" fill="${T.primary}">PAD</text>
        <polygon points="118,95 130,90 130,100" fill="${T.primaryOn}"/>
        <text x="12" y="160" class="small muted">FG \u2192 pad slides in</text>
        <text x="12" y="178" class="cap" fill="${T.primary}">\u25b6 playing</text>
      </g>
      <g transform="translate(274 0)">
        <rect width="254" height="190" rx="12" fill="#fff" stroke="${T.outline}"/>
        <text x="12" y="22" class="cap muted">${U.top}</text>
        <rect x="30" y="50" width="100" height="70" rx="8" fill="#e8eef5" opacity="0.5"/>
        <rect x="60" y="70" width="110" height="80" rx="8" fill="#e8eef5" opacity="0.7"/>
        <rect x="100" y="85" width="100" height="70" rx="10" fill="#dce6f0" stroke="${T.primaryBright}"/>
        <text x="150" y="125" text-anchor="middle" class="cap" fill="${T.primary}">z-top</text>
        <text x="12" y="175" class="small muted">always above</text>
      </g>
      <g transform="translate(0 208)">
        <rect width="254" height="190" rx="12" fill="#fff" stroke="${T.outline}"/>
        <text x="12" y="22" class="cap muted">${U.mini}</text>
        ${miniBar(40, 55)}
        <circle cx="210" cy="80" r="4" fill="${T.running}"/>
        <circle cx="210" cy="80" r="12" fill="none" stroke="${T.running}" stroke-opacity="0.3"/>
        <text x="12" y="150" class="small muted">156\u00d744 strip</text>
        <text x="12" y="170" class="small muted">expand \u2192 full</text>
      </g>
      <g transform="translate(274 208)">
        <rect width="254" height="190" rx="12" fill="#fff" stroke="${T.outline}"/>
        <text x="12" y="22" class="cap muted">${U.hide}</text>
        <rect x="40" y="55" width="160" height="90" rx="10" fill="#eef2f6" stroke="${T.outline}" stroke-dasharray="4 3"/>
        <text x="120" y="105" text-anchor="middle" class="cap faint">no overlay</text>
        <text x="12" y="170" class="small muted">hotkeys only</text>
      </g>
    </g>
  </g>

  <text x="56" y="900" class="title ink">${U.c1t}</text>
  <text x="56" y="924" class="body muted">${U.c1d}</text>
`
);

// ---------- C2v3: single app agent light ----------
const pad2 = softPadBody(1.15, "AG00", { AG00: T.running });
const c2 = wrap(
  1280,
  980,
  `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="28" width="1200" height="880" rx="16" class="shell"/>
  ${topChrome("agent")}

  <g transform="translate(56 ${BAND_Y})">
    <rect width="1152" height="${BAND_H}" rx="16" fill="#ecf8f3" stroke="rgba(52,211,153,0.28)"/>

    <!-- App switcher (one active) -->
    <g transform="translate(20 16)">
      <text x="0" y="14" class="cap faint">${U.switchApp}</text>
      <rect y="28" width="88" height="32" rx="10" fill="${T.primaryBright}"/>
      <text x="44" y="48" text-anchor="middle" class="cap" fill="#06202a">Codex</text>
      <rect x="96" y="28" width="88" height="32" rx="10" fill="#fff" stroke="${T.outline}"/>
      <text x="140" y="48" text-anchor="middle" class="cap muted">Claude</text>
      <rect x="192" y="28" width="88" height="32" rx="10" fill="#fff" stroke="${T.outline}"/>
      <text x="236" y="48" text-anchor="middle" class="cap muted">Cursor</text>
      <rect x="288" y="28" width="100" height="32" rx="10" fill="#fff" stroke="${T.outline}"/>
      <text x="338" y="48" text-anchor="middle" class="cap muted">WorkBuddy</text>
    </g>

    <!-- LEFT: soft pad preview for current app only -->
    <g transform="translate(20 80)">
      <text x="0" y="0" class="small muted">Soft Pad \u00b7 Codex only</text>
      <g transform="translate(0 16)">${pad2.svg}</g>
    </g>

    <!-- RIGHT: ONE agent lightboard for current app -->
    <g transform="translate(520 80)">
      <text x="0" y="0" class="title ink">${U.thisApp} \u00b7 Codex</text>
      <text x="0" y="22" class="small muted">\u4e0d\u540c\u65f6\u5c55\u793a\u591a\u4e2a Agent\uff1b\u5207\u6362 App \u624d\u6362\u706f</text>

      <!-- single big light card -->
      <rect y="44" width="600" height="380" rx="16" fill="#fff" stroke="${T.primaryBright}" stroke-width="2"/>
      <rect x="24" y="68" width="72" height="72" rx="16" fill="#f1f5f9" stroke="${T.outline}"/>
      <circle cx="84" cy="128" r="10" fill="${T.running}" stroke="#fff" stroke-width="2"/>
      <circle cx="84" cy="128" r="18" fill="none" stroke="${T.running}" stroke-opacity="0.3" stroke-width="3"/>
      <text x="116" y="96" class="h1 ink">Codex</text>
      <text x="116" y="122" class="label" fill="${T.running}">${U.running}</text>
      <text x="116" y="144" class="small muted">model gpt-5.6-sol</text>

      <!-- capability rows for THIS app -->
      <g transform="translate(24 170)">
        <rect width="552" height="52" rx="10" fill="#f3faf7" stroke="rgba(52,211,153,0.25)"/>
        <text x="16" y="22" class="cap faint">AG00 \u6620\u5c04</text>
        <text x="16" y="40" class="label ink">\u547d\u4ee4\u83dc\u5355 \u00b7 Soft Pad AG0</text>
        <rect x="460" y="12" width="72" height="28" rx="14" fill="${T.green}"/>
        <circle cx="514" cy="26" r="10" fill="#fff"/>

        <rect y="64" width="552" height="52" rx="10" fill="#f8fafc" stroke="${T.outline}"/>
        <text x="16" y="86" class="cap faint">Hook</text>
        <text x="16" y="104" class="label ink">shell hook \u5df2\u8fde\u63a5</text>
        <text x="480" y="96" class="cap" fill="${T.green}">OK</text>

        <rect y="128" width="552" height="52" rx="10" fill="#f8fafc" stroke="${T.outline}"/>
        <text x="16" y="150" class="cap faint">\u72b6\u6001\u8272</text>
        <text x="16" y="168" class="label ink">idle / running / needs_input / done / failed</text>

        <g transform="translate(0 200)">
          <circle cx="10" cy="10" r="5" fill="${T.idle}"/><text x="22" y="14" class="cap muted">idle</text>
          <circle cx="90" cy="10" r="5" fill="${T.running}"/><text x="102" y="14" class="cap muted">running</text>
          <circle cx="190" cy="10" r="5" fill="${T.needs}"/><text x="202" y="14" class="cap muted">needs</text>
          <circle cx="290" cy="10" r="5" fill="${T.done}"/><text x="302" y="14" class="cap muted">done</text>
          <circle cx="380" cy="10" r="5" fill="${T.failed}"/><text x="392" y="14" class="cap muted">failed</text>
        </g>
      </g>
    </g>
  </g>

  <text x="56" y="900" class="title ink">${U.c2t}</text>
  <text x="56" y="924" class="body muted">${U.c2d}</text>
`
);

// ---------- C3v3: left pad, bottom timeline, right node detail ----------
const pad3 = softPadBody(1.05, "AG00", { AG00: T.amberBright });
const c3 = wrap(
  1280,
  980,
  `
  <rect class="bg" width="1280" height="980"/>
  <rect x="40" y="28" width="1200" height="880" rx="16" class="shell"/>
  ${topChrome("tm")}

  <g transform="translate(56 ${BAND_Y})">
    <rect width="1152" height="${BAND_H}" rx="16" fill="#fbf6ec" stroke="${T.amberBd}"/>

    <!-- LEFT Soft Pad -->
    <g transform="translate(20 20)">
      <text x="0" y="0" class="cap" fill="${T.amber}">SOFT PAD \u00b7 JUMP REMOTE</text>
      <g transform="translate(0 16)">${pad3.svg}</g>
      <text x="0" y="${pad3.bodyH + 36}" class="small muted">AG0 \u2192 12:40 \u00b7 ENC \u2192 \u73b0\u5728</text>
    </g>

    <!-- RIGHT time node detail -->
    <g transform="translate(420 20)">
      <text x="0" y="0" class="cap" fill="${T.amber}">NODE DETAIL</text>
      <rect y="16" width="700" height="${pad3.bodyH}" rx="14" fill="#fffaf2" stroke="${T.amberBd}"/>
      <text x="24" y="56" class="h1 ink">12:40 autosave</text>
      <text x="24" y="82" class="small muted">2026-08-07 \u00b7 Codex \u00b7 via Soft Pad AG0</text>
      <rect x="24" y="110" width="140" height="64" rx="12" fill="${T.amberBg}" stroke="${T.amberBd}"/>
      <text x="44" y="142" class="h1" fill="${T.amber}">4</text>
      <text x="44" y="162" class="cap muted">\u6587\u4ef6</text>
      <rect x="180" y="110" width="140" height="64" rx="12" fill="rgba(220,38,38,0.06)" stroke="rgba(220,38,38,0.2)"/>
      <text x="200" y="142" class="h1" fill="#c2413a">1</text>
      <text x="200" y="162" class="cap muted">delete</text>
      <rect x="24" y="200" width="160" height="36" rx="10" fill="${T.amberBright}"/>
      <text x="104" y="222" text-anchor="middle" class="label" fill="#fff">\u6062\u590d\u5230\u6b64\u70b9</text>
      <text x="24" y="270" class="small muted">\u952e\u76d8\u9884\u89c8\u4e0e\u8282\u70b9\u8be6\u60c5\u5de6\u53f3\u5e73\u884c</text>
      <text x="24" y="300" class="cap" fill="${T.amber}">selected from horizontal spine below</text>
    </g>

    <!-- BOTTOM horizontal timeline spanning under both -->
    <g transform="translate(20 ${pad3.bodyH + 70})">
      <text x="0" y="0" class="cap" fill="${T.amber}">TIMELINE \u00b7 2026-08-07</text>
      <line x1="20" y1="40" x2="1080" y2="40" stroke="${T.amberBright}" stroke-width="3" stroke-linecap="round"/>
      ${[
        { x: 80, t: "09:20", label: "autosave", key: "AG1", active: false },
        { x: 280, t: "11:05", label: "commit", key: "AG2", active: false },
        { x: 500, t: "12:40", label: "autosave", key: "AG0", active: true },
        { x: 720, t: "14:18", label: "restore?", key: "AG3", active: false },
        { x: 940, t: "\u73b0\u5728", label: "live", key: "ENC", active: false },
      ]
        .map(
          (p) => `
        <g transform="translate(${p.x} 40)">
          <circle r="${p.active ? 11 : 7}" fill="${p.active ? T.amberBright : "#fff"}" stroke="${T.amberBright}" stroke-width="2.5"/>
          ${p.active ? `<circle r="18" fill="none" stroke="${T.amberBright}" stroke-opacity="0.28" stroke-width="4"/>` : ""}
          <text y="-20" text-anchor="middle" class="label ink">${p.t}</text>
          <text y="28" text-anchor="middle" class="cap muted">${p.label}</text>
          <rect x="-26" y="38" width="52" height="18" rx="9" fill="${p.active ? T.amberBg : "#fff"}" stroke="${T.amberBd}"/>
          <text y="51" text-anchor="middle" class="cap" fill="${T.amber}">${p.key}</text>
        </g>`
        )
        .join("")}
      <g transform="translate(20 90)">
        <rect width="64" height="22" rx="11" fill="${T.amberBg}" stroke="${T.amberBd}"/>
        <text x="32" y="15" text-anchor="middle" class="cap" fill="${T.amber}">08-07</text>
        <rect x="72" width="64" height="22" rx="11" fill="#fff" stroke="${T.outline}"/>
        <text x="104" y="15" text-anchor="middle" class="cap muted">08-06</text>
        <rect x="144" width="64" height="22" rx="11" fill="#fff" stroke="${T.outline}"/>
        <text x="176" y="15" text-anchor="middle" class="cap muted">08-05</text>
      </g>
    </g>
  </g>

  <text x="56" y="900" class="title ink">${U.c3t}</text>
  <text x="56" y="924" class="body muted">${U.c3d}</text>
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
