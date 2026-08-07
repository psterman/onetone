const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;

function t(s) {
  // keep ASCII as-is; Chinese already in source as \u when needed
  return s;
}

const cssCommon = `
.bg{fill:#eef3f7}.shell{fill:#f8fbfd;stroke:#d5e0eb}.top{fill:#fff;stroke:#dce5ef}
.ink{fill:#142033}.muted{fill:#6b7a8d}.faint{fill:#94a3b4}
.key{fill:#fff;stroke:#d5e1ec}.keyA{fill:#f0f9fc;stroke:#9ed6e8}
.chip{fill:#fff;stroke:#d5e1ec}.chipOn{fill:#e8f6fb;stroke:#3eb8dc}
.stage{fill:#fff;stroke:#d5e1ec}.stageOn{fill:#e8f6fb;stroke:#3eb8dc;stroke-width:1.6}
.panel{fill:#f4f8fb;stroke:#d5e0eb}.row{fill:#fff;stroke:#e2eaf2}
.small{font:11px 'Segoe UI','Microsoft YaHei',sans-serif}
.body{font:13px 'Segoe UI','Microsoft YaHei',sans-serif}
.title{font:700 15px 'Segoe UI','Microsoft YaHei',sans-serif}
.h1{font:700 20px 'Segoe UI','Microsoft YaHei',sans-serif}
.label{font:700 13px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 10px 'Segoe UI','Microsoft YaHei',sans-serif}
`;

function svgWrap(w, h, css, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><style type="text/css"><![CDATA[${css}]]></style></defs>
${body}
</svg>`;
}

function key(x, y, w, h, cls, main, sub) {
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="10"/>
    <text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" class="label ink">${main}</text>
    <text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" class="cap faint">${sub}</text>`;
}

function keyBig(x, y, w, h, cls, main, sub, mainCls = "h1") {
  return `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/>
    <text x="${x + w / 2}" y="${y + 30}" text-anchor="middle" class="${mainCls} ink">${main}</text>
    <text x="${x + w / 2}" y="${y + 52}" text-anchor="middle" class="cap faint">${sub}</text>`;
}

const C = {
  enabled: "\u5df2\u542f\u7528",
  bind: "\u7ed1\u5b9a",
  planV1: "\u65b9\u6848 V1 \u00b7 \u4eea\u5668\u53f0\u7a33\u59a5\u7248 \u2014 \u5355\u884c\u72b6\u6001 \u00b7 \u65e0\u7f16\u53f7 \u00b7 \u8be6\u60c5\u9ed8\u8ba4\u5c55\u5f00 \u00b7 \u529f\u80fd\u5168\u4fdd\u7559",
  editKeys: "\u6539\u952e\u4f4d",
  whenShow: "\u4f55\u65f6\u663e\u793a",
  statusLight: "\u72b6\u6001\u706f",
  busy: "\u770b AI \u5fd9\u4e0d\u5fd9",
  timeCap: "\u65f6\u95f4\u80f6\u56ca",
  autosave: "\u6062\u590d\u524d\u81ea\u52a8\u4fdd\u5b58",
  appearance: "\u5916\u89c2",
  changeKey: "\u6539\u6309\u952e",
  actSession: "\u52a8\u4f5c\u952e \u00b7 \u4f1a\u8bdd\u69fd",
  mode: "\u6a21\u5f0f",
  dir: "\u65b9\u5411",
  undo: "\u64a4\u9500",
  search: "\u641c\u7d22",
  send: "\u53d1\u9001",
  voice: "\u8bed\u97f3",
  plus: "\u6269\u5c55",
  floatHow: "\u6d6e\u7a97\u600e\u4e48\u51fa\u73b0\uff1b\u51b7\u95e8\u5f00\u5173\u6536\u5728\u9ad8\u7ea7\u91cc",
  followApp: "\u8ddf\u968f\u5e94\u7528",
  followHint: "\u524d\u53f0\u662f\u7ed1\u5b9a App \u65f6\u663e\u793a",
  alwaysTop: "\u4fdd\u6301\u5728\u6700\u524d",
  alwaysHint: "\u59cb\u7ec8\u7f6e\u9876\u6d6e\u7a97",
  miniBar: "\u8ff7\u4f60\u6761",
  miniHint: "\u53ea\u770b\u72b6\u6001\u706f \u00b7 156x44",
  hideFloat: "\u4e0d\u663e\u793a\u6d6e\u7a97",
  hideHint: "\u4ec5\u4fdd\u7559\u70ed\u952e\u80fd\u529b",
  advanced: "\u9ad8\u7ea7",
  advHint: "NumLock \u00b7 \u5bfc\u822a\u952e \u00b7 \u6d4b\u8bd5\u524d\u53f0 \u00b7 \u8d26\u53f7\u989d\u5ea6",
  v1Title: "V1 \u00b7 \u4eea\u5668\u53f0\u7a33\u59a5\u7248",
  v1Desc:
    "\u8fc1\u79fb\u6210\u672c\u6700\u4f4e\uff1a\u4fdd\u7559\u5de6\u952e\u76d8 + \u53f3\u8be6\u60c5\uff0c\u780d\u6389\u91cd\u590d cockpit \u4e0e\u7f16\u53f7\u88c5\u9970\uff1b\u9ed8\u8ba4\u6253\u5f00\u300c\u4f55\u65f6\u663e\u793a\u300d\u3002",
  virtKb: "\u865a\u62df\u952e\u76d8",
  planV2: "\u65b9\u6848 V2 \u00b7 \u6781\u7b80\u56fe\u5f62\u7248 \u2014 \u5206\u6bb5\u821e\u53f0 \u00b7 \u952e\u76d8\u5360\u4e3b\u89c6\u89c9 \u00b7 \u53f3\u4fa7\u53ea\u7559\u5f53\u524d\u4e00\u9879",
  set1215: "\u5df2\u8bbe 12 / 15",
  padNav: "\u952e\u9762\u5373\u5bfc\u822a\uff1a\u70b9\u952e\u8fdb\u5165\u6539\u6309\u952e\uff1b\u73af\u4e0a\u82af\u7247\u53ea\u4fdd\u7559 3 \u4e2a\u4e3b\u64cd\u4f5c",
  pickShow: "\u9009\u4e00\u79cd\u51fa\u73b0\u65b9\u5f0f",
  followOut: "\u524d\u53f0\u5339\u914d\u65f6\u6d6e\u51fa",
  alwaysTopShort: "\u59cb\u7ec8\u7f6e\u9876",
  statusBar: "\u72b6\u6001\u706f\u6761",
  hotkeyOnly: "\u4ec5\u70ed\u952e",
  noShow: "\u4e0d\u663e\u793a",
  adv2: "\u9ad8\u7ea7 \u00b7 NumLock / \u5bfc\u822a / \u989d\u5ea6",
  stageSeg: "\u72b6\u6001\u706f \u00b7 \u65f6\u95f4\u80f6\u56ca \u2192 \u9876\u90e8\u5206\u6bb5",
  v2Title: "V2 \u00b7 \u6781\u7b80\u56fe\u5f62\u7248",
  v2Desc:
    "\u6700\u5927\u80c6\uff1aflow \u6536\u6210\u5206\u6bb5\u63a7\u4ef6\uff0c\u952e\u76d8\u5360\u4e3b\u89c6\u89c9\uff1b\u8be6\u60c5\u53d8\u7a84\u680f\u3002\u9002\u5408\u56fe\u5f62\u4f18\u5148\u8bc9\u6c42\u6700\u5f3a\u7684\u4e00\u6863\u3002",
  planV3: "\u65b9\u6848 V3 \u00b7 \u5206\u533a\u56fe\u5f62\u7248 \u2014 \u540c V1 \u4fe1\u606f\u67b6\u6784 \u00b7 \u952e\u9762\u8f7b\u5206\u533a\u8272\u81ea\u89e3\u91ca \u00b7 \u65e0\u5e95\u90e8\u56fe\u4f8b",
  zoneHint: "\u5206\u533a\u8272\u53ea\u670d\u52a1\u626b\u8bfb\uff0c\u4e0d\u53e6\u5f00\u56fe\u4f8b\u9875",
  session: "\u4f1a\u8bdd",
  action: "\u52a8\u4f5c",
  exec: "\u6267\u884c",
  ctrl: "\u63a7\u5236",
  reject: "\u62d2\u7edd",
  onlyLight: "\u53ea\u770b\u72b6\u6001\u706f",
  onlyHot: "\u4ec5\u4fdd\u7559\u70ed\u952e",
  v3Title: "V3 \u00b7 \u5206\u533a\u56fe\u5f62\u7248",
  v3Desc:
    "\u5728 V1 \u9aa8\u67b6\u4e0a\u7ed9\u952e\u9762\u8f7b\u5206\u533a\u8272\uff08\u4f1a\u8bdd/\u52a8\u4f5c/\u6267\u884c/\u63a7\u5236\uff09\uff0c\u626b\u8bfb\u66f4\u5feb\u4e14\u4e0d\u4e22\u529f\u80fd\u3002",
  compareTitle: "Soft Pad \u6539\u7248\u9884\u89c8 \u00b7 \u4e09\u65b9\u6848\u5bf9\u6bd4",
  compareSub:
    "\u5171\u540c\u7ea6\u675f\uff1a\u4e0d\u4e22\u529f\u80fd \u00b7 \u5355\u884c\u72b6\u6001 \u00b7 \u65e0\u7f16\u53f7 \u00b7 \u65e0 cyan \u5149\u6655 \u00b7 \u8be6\u60c5\u9ed8\u8ba4\u5c55\u5f00 \u00b7 \u9ad8\u7ea7\u9879\u6298\u53e0",
  stable: "\u4eea\u5668\u53f0\u7a33\u59a5\u7248",
  graphic: "\u6781\u7b80\u56fe\u5f62\u7248",
  zones: "\u5206\u533a\u56fe\u5f62\u7248",
  migrateLow: "\u8fc1\u79fb\u6210\u672c\u6700\u4f4e \u00b7 \u63a8\u8350\u9ed8\u8ba4\u843d\u5730",
  graphicStrong: "\u56fe\u5f62\u4f18\u5148\u6700\u5f3a \u00b7 \u6539\u52a8\u6700\u5927",
  v1plusColor: "V1 \u9aa8\u67b6 + \u952e\u9762\u81ea\u89e3\u91ca\u8272",
  layout: "\u5e03\u5c40",
  stageSwitch: "\u821e\u53f0\u5207\u6362",
  keyface: "\u952e\u9762",
  fit: "\u9002\u5408",
  howPick: "\u600e\u4e48\u9009",
  howPickDesc:
    "\u4f18\u5148\u843d\u5730 \u2192 V1\uff1b\u56fe\u5f62\u611f\u8981\u6700\u5f3a \u2192 V2\uff1b\u8981\u4e00\u773c\u770b\u51fa\u952e\u533a\u4f46\u4e0d\u60f3\u5927\u6539\u5e03\u5c40 \u2192 V3\u3002\u4e5f\u53ef V1 \u9aa8\u67b6 + V3 \u5206\u533a\u8272\u4f5c\u4e3a\u6298\u4e2d\u843d\u5730\u3002",
};

function padKeys(scale = 1) {
  const kw = 72 * scale;
  const kh = 52 * scale;
  const g = 12 * scale;
  const rows = [
    [
      ["keyA", "ENC", C.mode],
      ["key", "7", "AGENT"],
      ["key", "8", "CLAUDE"],
      ["key", "9", "CODEX"],
      ["key", "NAV", C.dir],
    ],
    [
      ["key", "4", "PERMIT"],
      ["key", "5", "STATUS"],
      ["key", "6", "APPS"],
      ["keyA", "UNDO", C.undo],
      ["keyA", "SEARCH", C.search],
    ],
    [
      ["key", "1", "FAST"],
      ["key", "2", "CMD"],
      ["key", "3", "REJECT"],
      ["keyA", "SEND", C.send, 2],
    ],
    [
      ["key", "VOICE", C.voice, 2],
      ["key", "0", "DOT"],
      ["key", "PLUS", C.plus, 2],
    ],
  ];
  let out = "";
  let y = 0;
  for (const row of rows) {
    let x = 0;
    for (const cell of row) {
      const span = cell[3] || 1;
      const w = kw * span + g * (span - 1);
      out += key(x, y, w, kh, cell[0], cell[1], cell[2]);
      x += w + g;
    }
    y += kh + g;
  }
  return out;
}

function zonePad() {
  const cells = [
    ["zCtrl", 0, 0, 72, "ENC", C.mode],
    ["zAgent", 84, 0, 72, "7", "AGENT"],
    ["zAgent", 168, 0, 72, "8", "CLAUDE"],
    ["zAgent", 252, 0, 72, "9", "CODEX"],
    ["zCtrl", 336, 0, 72, "NAV", C.dir],
    ["zAct", 0, 64, 72, "4", "PERMIT"],
    ["zAct", 84, 64, 72, "5", "STATUS"],
    ["zAct", 168, 64, 72, "6", "APPS"],
    ["zCtrl", 252, 64, 72, "UNDO", C.undo],
    ["zCtrl", 336, 64, 72, "SEARCH", C.search],
    ["zAct", 0, 128, 72, "1", "FAST"],
    ["zAct", 84, 128, 72, "2", "CMD"],
    ["zDanger", 168, 128, 72, "3", "REJECT"],
    ["zOp", 252, 128, 156, "SEND", C.send],
    ["zOp", 0, 192, 156, "VOICE", C.voice],
    ["zAct", 168, 192, 72, "0", "DOT"],
    ["zAct", 252, 192, 156, "PLUS", C.plus],
  ];
  return cells
    .map(
      ([cls, x, y, w, main, sub]) =>
        `<rect class="${cls}" x="${x}" y="${y}" width="${w}" height="52" rx="10"/>
      <text x="${x + w / 2}" y="${y + 22}" text-anchor="middle" class="label ink">${main}</text>
      <text x="${x + w / 2}" y="${y + 40}" text-anchor="middle" class="cap faint">${sub}</text>`
    )
    .join("\n");
}

function detailPanel() {
  return `
    <text x="24" y="36" class="title ink">${C.whenShow}</text>
    <text x="24" y="56" class="small muted">${C.floatHow}</text>
    <rect class="row" x="24" y="78" width="496" height="52" rx="10"/>
    <circle cx="48" cy="104" r="7" fill="#3eb8dc"/>
    <text x="68" y="100" class="label ink">${C.followApp}</text>
    <text x="68" y="116" class="small muted">${C.followHint}</text>
    <rect class="row" x="24" y="140" width="496" height="52" rx="10"/>
    <circle cx="48" cy="166" r="7" fill="#fff" stroke="#c5d0dc"/>
    <text x="68" y="162" class="label ink">${C.alwaysTop}</text>
    <text x="68" y="178" class="small muted">${C.alwaysHint}</text>
    <rect class="row" x="24" y="202" width="496" height="52" rx="10"/>
    <circle cx="48" cy="228" r="7" fill="#fff" stroke="#c5d0dc"/>
    <text x="68" y="224" class="label ink">${C.miniBar}</text>
    <text x="68" y="240" class="small muted">${C.miniHint}</text>
    <rect class="row" x="24" y="264" width="496" height="52" rx="10"/>
    <circle cx="48" cy="290" r="7" fill="#fff" stroke="#c5d0dc"/>
    <text x="68" y="286" class="label ink">${C.hideFloat}</text>
    <text x="68" y="302" class="small muted">${C.hideHint}</text>
    <rect x="24" y="340" width="496" height="1" fill="#e2eaf2"/>
    <text x="24" y="370" class="label muted">${C.advanced}</text>
    <text x="24" y="392" class="small faint">${C.advHint}</text>`;
}

function stages() {
  return `
  <g transform="translate(72 132)">
    <rect class="stageOn" x="0" y="0" width="148" height="64" rx="12"/>
    <rect x="16" y="16" width="28" height="28" rx="7" fill="#dff3fa"/>
    <rect x="22" y="22" width="6" height="6" rx="1" fill="#3eb8dc"/>
    <rect x="30" y="22" width="6" height="6" rx="1" fill="#3eb8dc"/>
    <rect x="22" y="30" width="6" height="6" rx="1" fill="#3eb8dc"/>
    <rect x="30" y="30" width="6" height="6" rx="1" fill="#3eb8dc"/>
    <text x="54" y="30" class="label ink">Soft Pad</text>
    <text x="54" y="48" class="small muted">${C.editKeys} \u00b7 ${C.whenShow}</text>
    <rect class="stage" x="164" y="0" width="148" height="64" rx="12"/>
    <circle cx="194" cy="30" r="8" fill="#eef2f6" stroke="#c5d0dc"/>
    <circle cx="194" cy="28" r="2.2" fill="#94a3b4"/>
    <text x="218" y="30" class="label ink">${C.statusLight}</text>
    <text x="218" y="48" class="small muted">${C.busy}</text>
    <rect class="stage" x="328" y="0" width="168" height="64" rx="12"/>
    <rect x="344" y="22" width="28" height="16" rx="8" fill="#fff7e8" stroke="#f0c56d"/>
    <text x="382" y="30" class="label ink">${C.timeCap}</text>
    <text x="382" y="48" class="small muted">${C.autosave}</text>
  </g>`;
}

function ring() {
  return `
    <g transform="translate(24 18)">
      <rect class="chipOn" x="0" y="0" width="88" height="28" rx="14"/>
      <text x="44" y="18" text-anchor="middle" class="cap" fill="#1f7a92">${C.whenShow}</text>
      <rect class="chip" x="98" y="0" width="64" height="28" rx="14"/>
      <text x="130" y="18" text-anchor="middle" class="cap muted">${C.appearance}</text>
      <rect class="chip" x="172" y="0" width="64" height="28" rx="14"/>
      <text x="204" y="18" text-anchor="middle" class="cap muted">${C.changeKey}</text>
      <rect class="chip" x="246" y="0" width="108" height="28" rx="14"/>
      <text x="300" y="18" text-anchor="middle" class="cap muted">${C.actSession}</text>
    </g>`;
}

const v1 = svgWrap(
  1280,
  900,
  cssCommon,
  `
  <rect class="bg" width="1280" height="900"/>
  <rect x="48" y="36" width="1184" height="760" rx="18" class="shell"/>
  <rect x="48" y="36" width="1184" height="56" rx="18" class="top"/>
  <text x="72" y="70" class="h1 ink">Codex</text>
  <rect x="148" y="52" width="52" height="24" rx="12" fill="#e8f8ef" stroke="#9ed9b5"/>
  <text x="174" y="68" text-anchor="middle" class="small" fill="#1f7a4a">${C.enabled}</text>
  <rect x="212" y="52" width="120" height="24" rx="12" class="chip"/>
  <text x="272" y="68" text-anchor="middle" class="small ink">${C.bind} \u00b7 Codex</text>
  <rect x="1168" y="52" width="36" height="24" rx="12" class="chip"/>
  <text x="1186" y="68" text-anchor="middle" class="small muted">...</text>
  <text x="72" y="112" class="small faint">${C.planV1}</text>
  ${stages()}
  <g transform="translate(72 220)">
    <rect class="panel" width="560" height="430" rx="16"/>
    ${ring()}
    <rect x="48" y="64" width="464" height="330" rx="14" fill="#f7fafc" stroke="#dde6ef"/>
    <g transform="translate(72 92)">${padKeys(1)}</g>
  </g>
  <g transform="translate(656 220)">
    <rect class="panel" width="544" height="430" rx="16"/>
    ${detailPanel()}
  </g>
  <text x="72" y="840" class="title ink">${C.v1Title}</text>
  <text x="72" y="866" class="body muted">${C.v1Desc}</text>
`
);

const cssV2 = cssCommon + `
.bg{fill:#edf1f5}.keySoft{fill:#f3f8fb;stroke:#c5d6e4}
.seg{fill:#eef3f7}.segOn{fill:#fff;stroke:#3eb8dc;stroke-width:1.5}
.side{fill:#f5f8fb;stroke:#d5e0eb}.opt{fill:#fff;stroke:#e1e9f1}.optOn{fill:#eaf7fb;stroke:#3eb8dc}
.huge{font:700 12px 'Segoe UI','Microsoft YaHei',sans-serif}
`;

const v2 = svgWrap(
  1280,
  900,
  cssV2,
  `
  <rect class="bg" width="1280" height="900"/>
  <rect x="48" y="36" width="1184" height="760" rx="18" class="shell"/>
  <rect x="48" y="36" width="1184" height="52" rx="18" class="top"/>
  <text x="72" y="68" class="h1 ink">${C.virtKb}</text>
  <text x="178" y="68" class="body muted">Codex</text>
  <rect x="240" y="52" width="40" height="22" rx="11" fill="#2f9f66"/>
  <circle cx="270" cy="63" r="8" fill="#fff"/>
  <rect x="296" y="52" width="72" height="22" rx="11" class="chip"/>
  <text x="332" y="67" text-anchor="middle" class="small ink">${C.bind}</text>
  <rect x="1168" y="52" width="36" height="22" rx="11" class="chip"/>
  <text x="1186" y="67" text-anchor="middle" class="small muted">...</text>
  <text x="72" y="108" class="small faint">${C.planV2}</text>
  <g transform="translate(72 124)">
    <rect class="seg" width="360" height="40" rx="12"/>
    <rect class="segOn" x="4" y="4" width="116" height="32" rx="9"/>
    <text x="62" y="25" text-anchor="middle" class="huge" fill="#1f7a92">Soft Pad</text>
    <text x="180" y="25" text-anchor="middle" class="huge muted">${C.statusLight}</text>
    <text x="286" y="25" text-anchor="middle" class="huge muted">${C.timeCap}</text>
  </g>
  <g transform="translate(72 184)">
    <rect x="0" y="0" width="700" height="520" rx="18" fill="#f3f7fa" stroke="#d5e0eb"/>
    <g transform="translate(20 16)">
      <rect class="chipOn" x="0" y="0" width="80" height="26" rx="13"/>
      <text x="40" y="17" text-anchor="middle" class="cap" fill="#1f7a92">${C.whenShow}</text>
      <rect class="chip" x="90" y="0" width="56" height="26" rx="13"/>
      <text x="118" y="17" text-anchor="middle" class="cap muted">${C.appearance}</text>
      <rect class="chip" x="156" y="0" width="64" height="26" rx="13"/>
      <text x="188" y="17" text-anchor="middle" class="cap muted">${C.changeKey}</text>
      <text x="560" y="18" text-anchor="end" class="small faint">${C.set1215}</text>
    </g>
    <g transform="translate(58 70)">
      ${keyBig(0, 0, 100, 72, "keySoft", "ENC", C.mode, "title")}
      ${keyBig(116, 0, 100, 72, "key", "7", "AGENT")}
      ${keyBig(232, 0, 100, 72, "key", "8", "CLAUDE")}
      ${keyBig(348, 0, 100, 72, "key", "9", "CODEX")}
      ${keyBig(464, 0, 100, 72, "keySoft", "NAV", C.dir, "title")}
      ${keyBig(0, 90, 100, 72, "key", "4", "PERMIT")}
      ${keyBig(116, 90, 100, 72, "key", "5", "STATUS")}
      ${keyBig(232, 90, 100, 72, "key", "6", "APPS")}
      ${keyBig(348, 90, 100, 72, "keySoft", "UNDO", C.undo, "title")}
      ${keyBig(464, 90, 100, 72, "keySoft", "SEARCH", C.search, "title")}
      ${keyBig(0, 180, 100, 72, "key", "1", "FAST")}
      ${keyBig(116, 180, 100, 72, "key", "2", "CMD")}
      ${keyBig(232, 180, 100, 72, "key", "3", "REJECT")}
      ${keyBig(348, 180, 216, 72, "keySoft", "SEND", C.send, "title")}
      ${keyBig(0, 270, 216, 72, "key", "VOICE", C.voice, "title")}
      ${keyBig(232, 270, 100, 72, "key", "0", "DOT")}
      ${keyBig(348, 270, 216, 72, "key", "PLUS", C.plus, "title")}
      <text x="0" y="380" class="small faint">${C.padNav}</text>
    </g>
  </g>
  <g transform="translate(796 184)">
    <rect class="side" width="404" height="520" rx="18"/>
    <text x="24" y="40" class="title ink">${C.whenShow}</text>
    <text x="24" y="62" class="small muted">${C.pickShow}</text>
    <rect class="optOn" x="24" y="88" width="356" height="70" rx="12"/>
    <text x="44" y="118" class="label ink">${C.followApp}</text>
    <text x="44" y="138" class="small muted">${C.followOut}</text>
    <rect class="opt" x="24" y="170" width="356" height="70" rx="12"/>
    <text x="44" y="200" class="label ink">${C.alwaysTop}</text>
    <text x="44" y="220" class="small muted">${C.alwaysTopShort}</text>
    <rect class="opt" x="24" y="252" width="356" height="70" rx="12"/>
    <text x="44" y="282" class="label ink">${C.miniBar}</text>
    <text x="44" y="302" class="small muted">${C.statusBar}</text>
    <rect class="opt" x="24" y="334" width="356" height="70" rx="12"/>
    <text x="44" y="364" class="label ink">${C.noShow}</text>
    <text x="44" y="384" class="small muted">${C.hotkeyOnly}</text>
    <text x="24" y="450" class="small faint">${C.adv2}</text>
    <text x="24" y="474" class="small faint">${C.stageSeg}</text>
  </g>
  <text x="72" y="840" class="title ink">${C.v2Title}</text>
  <text x="72" y="866" class="body muted">${C.v2Desc}</text>
`
);

const cssV3 =
  cssCommon +
  `
.zCtrl{fill:#f0fafc;stroke:#8ecfdf}.zAgent{fill:#f5f1fb;stroke:#c4b0e4}
.zAct{fill:#eef5ff;stroke:#9bb8e8}.zOp{fill:#eef9f1;stroke:#95d0a8}
.zDanger{fill:#fdf2f0;stroke:#e8a99a}
`;

const v3 = svgWrap(
  1280,
  900,
  cssV3,
  `
  <rect class="bg" width="1280" height="900"/>
  <rect x="48" y="36" width="1184" height="760" rx="18" class="shell"/>
  <rect x="48" y="36" width="1184" height="56" rx="18" class="top"/>
  <text x="72" y="70" class="h1 ink">Codex</text>
  <rect x="148" y="52" width="52" height="24" rx="12" fill="#e8f8ef" stroke="#9ed9b5"/>
  <text x="174" y="68" text-anchor="middle" class="small" fill="#1f7a4a">${C.enabled}</text>
  <rect x="212" y="52" width="120" height="24" rx="12" class="chip"/>
  <text x="272" y="68" text-anchor="middle" class="small ink">${C.bind} \u00b7 Codex</text>
  <rect x="1168" y="52" width="36" height="24" rx="12" class="chip"/>
  <text x="1186" y="68" text-anchor="middle" class="small muted">...</text>
  <text x="72" y="112" class="small faint">${C.planV3}</text>
  ${stages()}
  <g transform="translate(72 220)">
    <rect class="panel" width="560" height="430" rx="16"/>
    ${ring()}
    <rect x="48" y="64" width="464" height="330" rx="14" fill="#f7fafc" stroke="#dde6ef"/>
    <g transform="translate(72 92)">${zonePad()}</g>
    <g transform="translate(72 390)">
      <rect width="8" height="8" rx="2" class="zAgent"/><text x="14" y="8" class="cap faint">${C.session}</text>
      <rect x="52" width="8" height="8" rx="2" class="zAct"/><text x="66" y="8" class="cap faint">${C.action}</text>
      <rect x="104" width="8" height="8" rx="2" class="zOp"/><text x="118" y="8" class="cap faint">${C.exec}</text>
      <rect x="156" width="8" height="8" rx="2" class="zCtrl"/><text x="170" y="8" class="cap faint">${C.ctrl}</text>
      <rect x="214" width="8" height="8" rx="2" class="zDanger"/><text x="228" y="8" class="cap faint">${C.reject}</text>
    </g>
  </g>
  <g transform="translate(656 220)">
    <rect class="panel" width="544" height="430" rx="16"/>
    <text x="24" y="36" class="title ink">${C.whenShow}</text>
    <text x="24" y="56" class="small muted">${C.zoneHint}</text>
    <rect class="row" x="24" y="78" width="496" height="52" rx="10"/>
    <circle cx="48" cy="104" r="7" fill="#3eb8dc"/>
    <text x="68" y="100" class="label ink">${C.followApp}</text>
    <text x="68" y="116" class="small muted">${C.followHint}</text>
    <rect class="row" x="24" y="140" width="496" height="52" rx="10"/>
    <circle cx="48" cy="166" r="7" fill="#fff" stroke="#c5d0dc"/>
    <text x="68" y="162" class="label ink">${C.alwaysTop}</text>
    <text x="68" y="178" class="small muted">${C.alwaysHint}</text>
    <rect class="row" x="24" y="202" width="496" height="52" rx="10"/>
    <circle cx="48" cy="228" r="7" fill="#fff" stroke="#c5d0dc"/>
    <text x="68" y="224" class="label ink">${C.miniBar}</text>
    <text x="68" y="240" class="small muted">${C.onlyLight}</text>
    <rect class="row" x="24" y="264" width="496" height="52" rx="10"/>
    <circle cx="48" cy="290" r="7" fill="#fff" stroke="#c5d0dc"/>
    <text x="68" y="286" class="label ink">${C.hideFloat}</text>
    <text x="68" y="302" class="small muted">${C.onlyHot}</text>
    <rect x="24" y="340" width="496" height="1" fill="#e2eaf2"/>
    <text x="24" y="370" class="label muted">${C.advanced}</text>
    <text x="24" y="392" class="small faint">${C.advHint}</text>
  </g>
  <text x="72" y="840" class="title ink">${C.v3Title}</text>
  <text x="72" y="866" class="body muted">${C.v3Desc}</text>
`
);

const cssCmp = `
.bg{fill:#e8eef3}.card{fill:#fafcfe;stroke:#d3dee9}
.ink{fill:#142033}.muted{fill:#6b7a8d}.faint{fill:#94a3b4}
.tag{fill:#e8f6fb;stroke:#3eb8dc}
.h1{font:700 28px 'Segoe UI','Microsoft YaHei',sans-serif}
.title{font:700 16px 'Segoe UI','Microsoft YaHei',sans-serif}
.body{font:13px 'Segoe UI','Microsoft YaHei',sans-serif}
.small{font:11px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 11px 'Segoe UI','Microsoft YaHei',sans-serif}
.mini{fill:#f3f7fa;stroke:#d5e0eb}.key{fill:#fff;stroke:#d2deea}
.kA{fill:#f5f1fb;stroke:#c4b0e4}.kB{fill:#eef5ff;stroke:#9bb8e8}
.kC{fill:#eef9f1;stroke:#95d0a8}.kD{fill:#f0fafc;stroke:#8ecfdf}
`;

function cmpCard(x, tag, title, sub, bodyExtra) {
  return `
  <g transform="translate(${x} 108)">
    <rect class="card" width="440" height="680" rx="16"/>
    <rect class="tag" x="20" y="18" width="72" height="24" rx="12"/>
    <text x="56" y="34" text-anchor="middle" class="cap" fill="#1f7a92">${tag}</text>
    <text x="104" y="36" class="title ink">${title}</text>
    <text x="20" y="68" class="small muted">${sub}</text>
    ${bodyExtra}
  </g>`;
}

const compare = svgWrap(
  1440,
  920,
  cssCmp,
  `
  <rect class="bg" width="1440" height="920"/>
  <text x="48" y="52" class="h1 ink">${C.compareTitle}</text>
  <text x="48" y="78" class="body muted">${C.compareSub}</text>
  ${cmpCard(
    40,
    "V1",
    C.stable,
    C.migrateLow,
    `
    <rect class="mini" x="20" y="88" width="400" height="300" rx="12"/>
    <rect x="36" y="104" width="60" height="18" rx="6" fill="#dff3fa" stroke="#3eb8dc"/>
    <rect x="104" y="104" width="48" height="18" rx="6" class="key"/>
    <rect x="160" y="104" width="48" height="18" rx="6" class="key"/>
    <g transform="translate(48 140)">
      <rect class="key" x="0" y="0" width="44" height="32" rx="6"/>
      <rect class="key" x="52" y="0" width="44" height="32" rx="6"/>
      <rect class="key" x="104" y="0" width="44" height="32" rx="6"/>
      <rect class="key" x="156" y="0" width="44" height="32" rx="6"/>
      <rect class="key" x="0" y="40" width="44" height="32" rx="6"/>
      <rect class="key" x="52" y="40" width="44" height="32" rx="6"/>
      <rect class="key" x="104" y="40" width="96" height="32" rx="6"/>
      <rect class="key" x="0" y="80" width="96" height="32" rx="6"/>
      <rect class="key" x="104" y="80" width="96" height="32" rx="6"/>
    </g>
    <rect x="250" y="120" width="150" height="200" rx="8" fill="#fff" stroke="#e2eaf2"/>
    <rect x="262" y="136" width="126" height="28" rx="6" fill="#eaf7fb" stroke="#3eb8dc"/>
    <rect x="262" y="174" width="126" height="28" rx="6" class="key"/>
    <rect x="262" y="212" width="126" height="28" rx="6" class="key"/>
    <rect x="262" y="250" width="126" height="28" rx="6" class="key"/>
    <text x="20" y="420" class="title ink">${C.layout}</text>
    <text x="20" y="444" class="body muted">50% pad + 50% detail</text>
    <text x="20" y="472" class="title ink">${C.stageSwitch}</text>
    <text x="20" y="496" class="body muted">3 quiet cards</text>
    <text x="20" y="524" class="title ink">${C.keyface}</text>
    <text x="20" y="548" class="body muted">white + light cyan</text>
    <text x="20" y="576" class="title ink">${C.fit}</text>
    <text x="20" y="600" class="body muted">lowest risk default</text>
    <text x="20" y="640" class="small faint">soft-pad-redesign-v1-instrument.png</text>`
  )}
  ${cmpCard(
    500,
    "V2",
    C.graphic,
    C.graphicStrong,
    `
    <rect class="mini" x="20" y="88" width="400" height="300" rx="12"/>
    <rect x="36" y="104" width="160" height="22" rx="8" fill="#eef3f7"/>
    <rect x="40" y="108" width="52" height="14" rx="5" fill="#fff" stroke="#3eb8dc"/>
    <g transform="translate(40 144)">
      <rect class="key" x="0" y="0" width="52" height="40" rx="8"/>
      <rect class="key" x="60" y="0" width="52" height="40" rx="8"/>
      <rect class="key" x="120" y="0" width="52" height="40" rx="8"/>
      <rect class="key" x="180" y="0" width="52" height="40" rx="8"/>
      <rect class="key" x="0" y="48" width="52" height="40" rx="8"/>
      <rect class="key" x="60" y="48" width="52" height="40" rx="8"/>
      <rect class="key" x="120" y="48" width="112" height="40" rx="8"/>
      <rect class="key" x="0" y="96" width="112" height="40" rx="8"/>
      <rect class="key" x="120" y="96" width="112" height="40" rx="8"/>
    </g>
    <rect x="290" y="140" width="110" height="180" rx="8" fill="#fff" stroke="#e2eaf2"/>
    <rect x="300" y="156" width="90" height="28" rx="6" fill="#eaf7fb" stroke="#3eb8dc"/>
    <rect x="300" y="194" width="90" height="28" rx="6" class="key"/>
    <rect x="300" y="232" width="90" height="28" rx="6" class="key"/>
    <text x="20" y="420" class="title ink">${C.layout}</text>
    <text x="20" y="444" class="body muted">pad ~63% + narrow detail</text>
    <text x="20" y="472" class="title ink">${C.stageSwitch}</text>
    <text x="20" y="496" class="body muted">segmented control</text>
    <text x="20" y="524" class="title ink">${C.keyface}</text>
    <text x="20" y="548" class="body muted">large glyph-first keys</text>
    <text x="20" y="576" class="title ink">${C.fit}</text>
    <text x="20" y="600" class="body muted">strongest graphic feel</text>
    <text x="20" y="640" class="small faint">soft-pad-redesign-v2-graphic.png</text>`
  )}
  ${cmpCard(
    960,
    "V3",
    C.zones,
    C.v1plusColor,
    `
    <rect class="mini" x="20" y="88" width="400" height="300" rx="12"/>
    <rect x="36" y="104" width="60" height="18" rx="6" fill="#dff3fa" stroke="#3eb8dc"/>
    <rect x="104" y="104" width="48" height="18" rx="6" class="key"/>
    <g transform="translate(48 140)">
      <rect class="kD" x="0" y="0" width="44" height="32" rx="6"/>
      <rect class="kA" x="52" y="0" width="44" height="32" rx="6"/>
      <rect class="kA" x="104" y="0" width="44" height="32" rx="6"/>
      <rect class="kB" x="156" y="0" width="44" height="32" rx="6"/>
      <rect class="kB" x="0" y="40" width="44" height="32" rx="6"/>
      <rect class="kB" x="52" y="40" width="44" height="32" rx="6"/>
      <rect class="kC" x="104" y="40" width="96" height="32" rx="6"/>
      <rect class="kC" x="0" y="80" width="96" height="32" rx="6"/>
      <rect class="kB" x="104" y="80" width="96" height="32" rx="6"/>
    </g>
    <rect x="250" y="120" width="150" height="200" rx="8" fill="#fff" stroke="#e2eaf2"/>
    <rect x="262" y="136" width="126" height="28" rx="6" fill="#eaf7fb" stroke="#3eb8dc"/>
    <rect x="262" y="174" width="126" height="28" rx="6" class="key"/>
    <rect x="262" y="212" width="126" height="28" rx="6" class="key"/>
    <text x="20" y="420" class="title ink">${C.layout}</text>
    <text x="20" y="444" class="body muted">same as V1</text>
    <text x="20" y="472" class="title ink">${C.stageSwitch}</text>
    <text x="20" y="496" class="body muted">same as V1</text>
    <text x="20" y="524" class="title ink">${C.keyface}</text>
    <text x="20" y="548" class="body muted">zone tint colors</text>
    <text x="20" y="576" class="title ink">${C.fit}</text>
    <text x="20" y="600" class="body muted">graphic without layout churn</text>
    <text x="20" y="640" class="small faint">soft-pad-redesign-v3-zones.png</text>`
  )}
  <text x="48" y="840" class="title ink">${C.howPick}</text>
  <text x="48" y="866" class="body muted">${C.howPickDesc}</text>
`
);

const files = [
  ["soft-pad-redesign-v1-instrument", v1],
  ["soft-pad-redesign-v2-graphic", v2],
  ["soft-pad-redesign-v3-zones", v3],
  ["soft-pad-redesign-compare", compare],
];

for (const [name, svg] of files) {
  const svgPath = path.join(dir, name + ".svg");
  fs.writeFileSync(svgPath, svg, "utf8");
  const resvg = new Resvg(svg, {
    fitTo: { mode: "original" },
    font: {
      loadSystemFonts: true,
      fontFiles: [
        "C:/Windows/Fonts/msyh.ttc",
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
      ],
    },
  });
  const png = resvg.render().asPng();
  const pngPath = path.join(dir, name + ".png");
  fs.writeFileSync(pngPath, png);
  console.log(name + ".png", png.length, `${resvg.width}x${resvg.height}`);
}
