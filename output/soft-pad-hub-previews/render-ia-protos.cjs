const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;

const U = {
  // common
  virtKb: "\u865a\u62df\u952e\u76d8",
  bind: "\u7ed1\u5b9a",
  enabled: "\u5df2\u542f\u7528",
  softPad: "Soft Pad",
  lights: "\u72b6\u6001\u706f",
  capsule: "\u65f6\u95f4\u80f6\u56ca",
  appear: "\u51fa\u73b0",
  keys: "\u952e\u4f4d",
  look: "\u5916\u89c2",
  purpose: "\u7528\u9014",
  follow: "\u8ddf\u968f\u5e94\u7528",
  followHint: "\u524d\u53f0\u5339\u914d\u65f6\u663e\u793a",
  top: "\u7f6e\u9876",
  mini: "\u8ff7\u4f60\u6761",
  hide: "\u4e0d\u663e\u793a",
  mode: "\u6a21\u5f0f",
  dir: "\u65b9\u5411",
  undo: "\u64a4\u9500",
  search: "\u641c\u7d22",
  send: "\u53d1\u9001",
  voice: "\u8bed\u97f3",
  more: "\u66f4\u591a",
  account: "\u8d26\u53f7",
  quota: "\u989d\u5ea6",
  testFg: "\u6d4b\u8bd5\u524d\u53f0",
  // A
  aTitle: "\u601d\u8def A \u00b7 Bezel \u4eea\u5668\u53f0",
  aSub: "L0 \u7ec6\u6761\u5e94\u7528 \u2192 L1 \u9762\u5206\u6bb5 \u2192 L2 \u952e\u9762+bezel\u62e8\u6746+\u8d34\u8fb9\u68c0\u89c6\uff1b\u4e09\u9762\u4e0d\u5171\u7528 ring",
  aFoot: "Soft Pad \u9762\uff1a\u62e8\u6746\u878d\u5728\u952e\u76d8\u5e95\u6258\u4e0a\u3002\u72b6\u6001\u706f/\u80f6\u56ca\u5207\u6362\u540e\u6574\u9762\u6362 Hero\uff0c\u4e0d\u7559\u952e\u76d8\u6b8b\u7247\u3002",
  // B
  bTitle: "\u601d\u8def B \u00b7 \u5e94\u7528\u8f68\u5de5\u4f5c\u53f0",
  bSub: "L0 \u5de6\u4fa7 App \u8f68\u5e38\u9a7b \u2192 L1 \u9762\u540d\u5355\u5217 \u2192 L2 \u53f3\u4fa7\u5168\u5bbd\u5de5\u4f5c\u533a\u4e92\u65a5\u66ff\u6362",
  bFoot: "\u5e94\u7528\u4e0e\u9762\u8bbe\u7f6e\u7269\u7406\u5206\u79bb\uff1a\u7ed1\u5b9a/\u5f00\u5173\u6c38\u8fdc\u5728\u5de6\u8f68\uff1b\u53f3\u4fa7\u53ea\u6709\u5f53\u524d\u9762\u7684 Hero\u3002",
  apps: "\u5e94\u7528",
  workspace: "\u5de5\u4f5c\u533a",
  // C
  cTitle: "\u601d\u8def C \u00b7 \u5f02\u5f62\u821e\u53f0",
  cSub: "\u4e09\u9762\u5404\u81ea\u4e00\u5957\u89c6\u89c9\u8bed\u8a00\uff1a\u952e\u9762\u4eea\u5668 / \u706f\u677f\u96f7\u8fbe / \u65f6\u95f4\u810a\u7ebf\u2014\u4e0d\u5171\u7528\u4efb\u4f55 chrome \u76ae",
  cFoot: "\u9762\u5207\u6362\u53ea\u662f\u6362\u201c\u9053\u5177\u201d\uff0c\u4e0d\u662f\u540c\u4e00\u58f3\u91cc\u6362 tab\u3002\u4e0b\u56fe\u5c55\u793a Soft Pad \u9762\uff1b\u53f3\u4fa7\u5c0f\u9884\u89c8\u4e3a\u53e6\u4e24\u9762\u5f62\u6001\u3002",
  lightBoard: "\u706f\u677f",
  spine: "\u65f6\u95f4\u810a",
  connect: "\u8fde\u63a5",
  restore: "\u6062\u590d\u70b9",
  // compare
  cmpTitle: "\u4e09\u5c42 IA \u00b7 \u4e09\u79cd\u601d\u8def\u5bf9\u6bd4",
  cmpSub: "\u5171\u540c\u7ea6\u675f\uff1a\u62c6\u5f00 App / Face / Hero\uff1b\u4e0d\u5171\u7528 Soft Pad chassis\uff1b\u4e0d\u7528\u5361\u7247+subtab \u5305\u88c5",
  pick: "\u600e\u4e48\u770b",
  pickDesc:
    "A \u6700\u50cf\u786c\u4ef6\u4eea\u5668\uff1bB \u6700\u6e05\u5c42\u7ea7\uff08App\u8f68\u72ec\u7acb\uff09\uff1bC \u4e09\u9762\u5f02\u5f62\u611f\u6700\u5f3a\u3002\u843d\u5730\u53ef\u4ee5 A \u7684 Soft Pad bezel + B \u7684 App \u8f68 + C \u7684\u5f02\u5f62 Hero\u3002",
};

function wrap(w, h, css, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><style type="text/css"><![CDATA[${css}]]></style></defs>
${body}
</svg>`;
}

const cssBase = `
.bg{fill:#e9eef3}.shell{fill:#f7fafc;stroke:#d2dde8}
.ink{fill:#132033}.muted{fill:#6b7a8d}.faint{fill:#93a0b0}
.cyan{fill:#3eb8dc}
.small{font:11px 'Segoe UI','Microsoft YaHei',sans-serif}
.body{font:13px 'Segoe UI','Microsoft YaHei',sans-serif}
.title{font:700 15px 'Segoe UI','Microsoft YaHei',sans-serif}
.h1{font:700 20px 'Segoe UI','Microsoft YaHei',sans-serif}
.h0{font:700 26px 'Segoe UI','Microsoft YaHei',sans-serif}
.label{font:700 12px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 10px 'Segoe UI','Microsoft YaHei',sans-serif}
.key{fill:#fff;stroke:#d2deea}.keyA{fill:#eef8fb;stroke:#8ecfe0}
.chip{fill:#fff;stroke:#d2deea}.chipOn{fill:#e5f5fb;stroke:#3eb8dc}
.seg{fill:#e8eef4}.segOn{fill:#fff;stroke:#3eb8dc;stroke-width:1.5}
.panel{fill:#f3f7fa;stroke:#d2dde8}.row{fill:#fff;stroke:#e1e9f1}
.rail{fill:#121820}.railInk{fill:#e8f0f8}.railMuted{fill:#8b9aab}
.railOn{fill:#1c2836;stroke:#3eb8dc}
.bezel{fill:#dfe8f0}.bezelDial{fill:#1a2430}
.lb{fill:#0f141c}.dot{fill:#34d399}
.spine{fill:#f7f1e6;stroke:#e5d2a8}
`;

function padKeys(ox, oy, scale = 1) {
  const kw = 68 * scale,
    kh = 48 * scale,
    g = 10 * scale;
  const rows = [
    [
      ["keyA", "ENC", U.mode],
      ["key", "7", "AG"],
      ["key", "8", "CL"],
      ["key", "9", "CX"],
      ["key", "NAV", U.dir],
    ],
    [
      ["key", "4", "PERM"],
      ["key", "5", "STAT"],
      ["key", "6", "APPS"],
      ["keyA", "UNDO", U.undo],
      ["keyA", "FIND", U.search],
    ],
    [
      ["key", "1", "FAST"],
      ["key", "2", "CMD"],
      ["key", "3", "NO"],
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
      out += `<rect class="${c[0]}" x="${x}" y="${y}" width="${w}" height="${kh}" rx="9"/>
        <text x="${x + w / 2}" y="${y + 20}" text-anchor="middle" class="label ink">${c[1]}</text>
        <text x="${x + w / 2}" y="${y + 36}" text-anchor="middle" class="cap faint">${c[2]}</text>`;
      x += w + g;
    }
    y += kh + g;
  }
  return out + "</g>";
}

function inspector(ox, oy, w = 320, h = 380) {
  return `
  <g transform="translate(${ox} ${oy})">
    <rect class="panel" width="${w}" height="${h}" rx="14"/>
    <text x="18" y="28" class="title ink">${U.appear}</text>
    <text x="18" y="48" class="small muted">${U.followHint}</text>
    <rect class="row" x="16" y="66" width="${w - 32}" height="48" rx="10"/>
    <circle cx="36" cy="90" r="6" fill="#3eb8dc"/>
    <text x="52" y="86" class="label ink">${U.follow}</text>
    <text x="52" y="102" class="small muted">${U.followHint}</text>
    <rect class="row" x="16" y="124" width="${w - 32}" height="48" rx="10"/>
    <circle cx="36" cy="148" r="6" fill="#fff" stroke="#c5d0dc"/>
    <text x="52" y="144" class="label ink">${U.top}</text>
    <rect class="row" x="16" y="182" width="${w - 32}" height="48" rx="10"/>
    <circle cx="36" cy="206" r="6" fill="#fff" stroke="#c5d0dc"/>
    <text x="52" y="202" class="label ink">${U.mini}</text>
    <rect class="row" x="16" y="240" width="${w - 32}" height="48" rx="10"/>
    <circle cx="36" cy="264" r="6" fill="#fff" stroke="#c5d0dc"/>
    <text x="52" y="260" class="label ink">${U.hide}</text>
  </g>`;
}

// ---------- Approach A: Bezel Instrument ----------
const protoA = wrap(
  1280,
  900,
  cssBase,
  `
  <rect class="bg" width="1280" height="900"/>
  <rect x="40" y="28" width="1200" height="780" rx="16" class="shell"/>

  <!-- L0 app bar -->
  <rect x="40" y="28" width="1200" height="48" rx="16" fill="#fff" stroke="#dce5ef"/>
  <text x="64" y="58" class="h1 ink">Codex</text>
  <rect x="140" y="42" width="52" height="22" rx="11" fill="#e7f7ee" stroke="#9ed9b5"/>
  <text x="166" y="57" text-anchor="middle" class="cap" fill="#1f7a4a">${U.enabled}</text>
  <rect x="204" y="42" width="88" height="22" rx="11" class="chip"/>
  <text x="248" y="57" text-anchor="middle" class="cap ink">${U.bind}</text>
  <rect x="1168" y="42" width="48" height="22" rx="11" class="chip"/>
  <text x="1192" y="57" text-anchor="middle" class="cap muted">${U.more}</text>
  <text x="64" y="98" class="small faint">${U.aSub}</text>

  <!-- L1 face segment -->
  <g transform="translate(64 112)">
    <rect class="seg" width="420" height="36" rx="10"/>
    <rect class="segOn" x="3" y="3" width="130" height="30" rx="8"/>
    <text x="68" y="23" text-anchor="middle" class="label" fill="#1f7a92">${U.softPad}</text>
    <text x="206" y="23" text-anchor="middle" class="label muted">${U.lights}</text>
    <text x="330" y="23" text-anchor="middle" class="label muted">${U.capsule}</text>
  </g>

  <!-- L2 Soft Pad: chassis with bezel dial fused -->
  <g transform="translate(64 168)">
    <rect width="740" height="520" rx="18" fill="#edf3f8" stroke="#cfdbe6"/>
    <!-- hardware bezel frame -->
    <rect x="28" y="24" width="684" height="430" rx="22" class="bezel"/>
    <rect x="48" y="44" width="644" height="340" rx="16" fill="#f7fafc" stroke="#c5d3e0"/>
    ${padKeys(72, 64, 1.05)}
    <!-- bezel mode dial fused at bottom of pad -->
    <g transform="translate(48 400)">
      <rect width="644" height="40" rx="12" class="bezelDial"/>
      <rect x="8" y="6" width="150" height="28" rx="8" fill="#3eb8dc"/>
      <text x="83" y="24" text-anchor="middle" class="cap" fill="#06202a">${U.appear}</text>
      <text x="240" y="24" text-anchor="middle" class="cap" fill="#c5d4e2">${U.keys}</text>
      <text x="370" y="24" text-anchor="middle" class="cap" fill="#c5d4e2">${U.look}</text>
      <text x="520" y="24" text-anchor="middle" class="cap" fill="#c5d4e2">${U.purpose}</text>
    </g>
    <text x="28" y="500" class="small faint">bezel dial = Soft Pad padMode only \u00b7 not shared ring</text>
  </g>
  ${inspector(840, 168, 360, 520)}

  <text x="64" y="850" class="title ink">${U.aTitle}</text>
  <text x="64" y="874" class="body muted">${U.aFoot}</text>
`
);

// ---------- Approach B: App Rail Workbench ----------
const protoB = wrap(
  1280,
  900,
  cssBase,
  `
  <rect class="bg" width="1280" height="900"/>
  <rect x="40" y="28" width="1200" height="780" rx="16" class="shell"/>

  <!-- L0 left app rail -->
  <rect x="40" y="28" width="200" height="780" rx="16" class="rail"/>
  <text x="60" y="64" class="title railInk">${U.apps}</text>
  <text x="60" y="88" class="small railMuted">${U.virtKb}</text>

  <rect x="56" y="116" width="168" height="64" rx="12" class="railOn"/>
  <text x="72" y="142" class="label railInk">Codex</text>
  <text x="72" y="162" class="cap" fill="#5ec8e8">${U.enabled}</text>

  <rect x="56" y="192" width="168" height="52" rx="12" fill="#161e2a"/>
  <text x="72" y="222" class="label railMuted">Claude</text>
  <rect x="56" y="256" width="168" height="52" rx="12" fill="#161e2a"/>
  <text x="72" y="286" class="label railMuted">Cursor</text>

  <rect x="56" y="340" width="168" height="1" fill="#2a3544"/>
  <text x="60" y="370" class="cap railMuted">${U.more}</text>
  <text x="60" y="396" class="small railMuted">${U.account}</text>
  <text x="60" y="416" class="small railMuted">${U.quota}</text>
  <text x="60" y="436" class="small railMuted">${U.testFg}</text>

  <!-- L1 face list under workspace header -->
  <g transform="translate(268 48)">
    <text x="0" y="0" class="small faint">${U.bSub}</text>
    <text x="0" y="36" class="h1 ink">${U.workspace}</text>
    <!-- face as vertical text tabs, not cards -->
    <g transform="translate(0 56)">
      <rect x="0" y="0" width="4" height="56" fill="#3eb8dc"/>
      <text x="16" y="18" class="title ink">${U.softPad}</text>
      <text x="16" y="38" class="small muted">${U.appear} / ${U.keys} / ${U.look}</text>
      <text x="16" y="78" class="label muted">${U.lights}</text>
      <text x="16" y="108" class="label muted">${U.capsule}</text>
    </g>
  </g>

  <!-- L2 workspace only Soft Pad -->
  <g transform="translate(420 120)">
    <rect width="780" height="640" rx="14" fill="#eef3f7" stroke="#d0dbe6"/>
    <rect x="24" y="20" width="460" height="420" rx="16" fill="#f7fafc" stroke="#c9d6e3"/>
    ${padKeys(48, 44, 0.95)}
    <!-- mode as side stack fused to workspace, not subtab bar -->
    <g transform="translate(24 460)">
      <text x="0" y="0" class="cap faint">padMode</text>
      <rect x="0" y="12" width="72" height="28" rx="8" fill="#3eb8dc"/>
      <text x="36" y="30" text-anchor="middle" class="cap" fill="#06202a">${U.appear}</text>
      <rect x="80" y="12" width="64" height="28" rx="8" class="chip"/>
      <text x="112" y="30" text-anchor="middle" class="cap muted">${U.keys}</text>
      <rect x="152" y="12" width="64" height="28" rx="8" class="chip"/>
      <text x="184" y="30" text-anchor="middle" class="cap muted">${U.look}</text>
      <rect x="224" y="12" width="64" height="28" rx="8" class="chip"/>
      <text x="256" y="30" text-anchor="middle" class="cap muted">${U.purpose}</text>
    </g>
    ${inspector(510, 20, 246, 520)}
  </g>

  <text x="268" y="850" class="title ink">${U.bTitle}</text>
  <text x="268" y="874" class="body muted">${U.bFoot}</text>
`
);

// ---------- Approach C: Heterogeneous Stage ----------
const protoC = wrap(
  1280,
  900,
  cssBase,
  `
  <rect class="bg" width="1280" height="900"/>
  <rect x="40" y="28" width="1200" height="780" rx="16" class="shell"/>

  <!-- minimal L0 -->
  <text x="64" y="60" class="h1 ink">Codex</text>
  <circle cx="148" cy="54" r="6" fill="#2f9f66"/>
  <text x="164" y="58" class="small muted">${U.bind}</text>
  <text x="64" y="88" class="small faint">${U.cSub}</text>

  <!-- face ports: three different shapes, not same card chrome -->
  <g transform="translate(64 108)">
    <!-- Soft Pad port = hardware plate -->
    <rect x="0" y="0" width="120" height="44" rx="8" fill="#1a2430"/>
    <text x="60" y="27" text-anchor="middle" class="cap" fill="#8fd6ea">${U.softPad}</text>
    <!-- lights port = glowing pill -->
    <rect x="140" y="6" width="120" height="32" rx="16" fill="#0f141c" stroke="#34d399"/>
    <circle cx="162" cy="22" r="5" class="dot"/>
    <text x="210" y="26" text-anchor="middle" class="cap" fill="#a7f3d0">${U.lights}</text>
    <!-- capsule port = amber capsule -->
    <rect x="280" y="6" width="130" height="32" rx="16" class="spine"/>
    <text x="345" y="26" text-anchor="middle" class="cap" fill="#9a620f">${U.capsule}</text>
  </g>

  <!-- MAIN: Soft Pad face as hardware instrument (different language) -->
  <g transform="translate(64 172)">
    <rect width="720" height="520" rx="20" fill="#1a2430"/>
    <text x="24" y="36" class="cap" fill="#5ec8e8">INSTRUMENT</text>
    <rect x="24" y="52" width="672" height="380" rx="18" fill="#0f141c" stroke="#2a3a4c"/>
    ${padKeys(48, 72, 1.05).replace(/class="key"/g, 'fill="#1c2836" stroke="#3a4d63"').replace(/class="keyA"/g, 'fill="#163040" stroke="#3eb8dc"').replace(/class="label ink"/g, 'class="label" fill="#e8f0f8"').replace(/class="cap faint"/g, 'class="cap" fill="#7a8b9c"').replace(/class="h1 ink"/g, 'class="h1" fill="#e8f0f8"')}
    <!-- purpose as physical rocker under pad -->
    <g transform="translate(24 450)">
      <rect width="672" height="44" rx="10" fill="#121a24"/>
      <rect x="12" y="8" width="156" height="28" rx="6" fill="#3eb8dc"/>
      <text x="90" y="26" text-anchor="middle" class="cap" fill="#06202a">${U.appear}</text>
      <text x="250" y="26" text-anchor="middle" class="cap" fill="#6b7c8e">${U.keys}</text>
      <text x="380" y="26" text-anchor="middle" class="cap" fill="#6b7c8e">${U.look}</text>
      <text x="530" y="26" text-anchor="middle" class="cap" fill="#6b7c8e">${U.purpose}</text>
    </g>
  </g>

  <!-- right: ghost previews of OTHER faces' languages -->
  <g transform="translate(820 172)">
    <text x="0" y="0" class="cap faint">${U.lights} face \u2192</text>
    <rect y="12" width="380" height="200" rx="14" class="lb"/>
    <text x="20" y="44" class="label" fill="#e8f0f8">${U.lightBoard}</text>
    <g transform="translate(24 70)">
      <rect width="56" height="56" rx="12" fill="#1c2836"/><circle cx="44" cy="44" r="5" fill="#60a5fa"/>
      <text x="28" y="78" text-anchor="middle" class="cap" fill="#94a3b8">Codex</text>
      <rect x="72" width="56" height="56" rx="12" fill="#1c2836"/><circle cx="116" cy="44" r="5" fill="#34d399"/>
      <text x="100" y="78" text-anchor="middle" class="cap" fill="#94a3b8">Claude</text>
      <rect x="144" width="56" height="56" rx="12" fill="#1c2836"/><circle cx="188" cy="44" r="5" fill="#f59e0b"/>
      <text x="172" y="78" text-anchor="middle" class="cap" fill="#94a3b8">Cursor</text>
    </g>
    <text x="20" y="180" class="small" fill="#64748b">${U.connect} / hooks \u00b7 no pad chassis</text>

    <text x="0" y="240" class="cap faint">${U.capsule} face \u2192</text>
    <rect y="252" width="380" height="240" rx="14" class="spine"/>
    <text x="20" y="284" class="label" fill="#9a620f">${U.spine}</text>
    <!-- mini spine -->
    <line x1="40" y1="310" x2="40" y2="460" stroke="#d99a22" stroke-width="2"/>
    <circle cx="40" cy="330" r="5" fill="#f59e0b"/>
    <text x="56" y="334" class="small" fill="#9a620f">${U.restore} 12:40</text>
    <circle cx="40" cy="380" r="4" fill="#fff" stroke="#d99a22"/>
    <text x="56" y="384" class="small" fill="#9a620f">commit</text>
    <circle cx="40" cy="430" r="4" fill="#fff" stroke="#d99a22"/>
    <text x="56" y="434" class="small" fill="#9a620f">autosave</text>
    <text x="20" y="478" class="small" fill="#b66f08">full-bleed desk \u00b7 no Soft Pad chrome</text>
  </g>

  <text x="64" y="850" class="title ink">${U.cTitle}</text>
  <text x="64" y="874" class="body muted">${U.cFoot}</text>
`
);

// ---------- Compare board ----------
const compare = wrap(
  1440,
  920,
  cssBase +
    `.card{fill:#fafcfe;stroke:#d3dee9}.tag{fill:#e8f6fb;stroke:#3eb8dc}
     .mini{fill:#f0f4f8;stroke:#d3dee9}.dark{fill:#1a2430}`,
  `
  <rect class="bg" width="1440" height="920"/>
  <text x="48" y="48" class="h0 ink">${U.cmpTitle}</text>
  <text x="48" y="74" class="body muted">${U.cmpSub}</text>

  <!-- A -->
  <g transform="translate(40 100)">
    <rect class="card" width="440" height="660" rx="16"/>
    <rect class="tag" x="20" y="18" width="56" height="24" rx="12"/>
    <text x="48" y="34" text-anchor="middle" class="cap" fill="#1f7a92">A</text>
    <text x="88" y="36" class="title ink">Bezel ${"\u4eea\u5668\u53f0"}</text>
    <rect class="mini" x="20" y="60" width="400" height="260" rx="12"/>
    <rect x="40" y="80" width="200" height="22" rx="8" class="seg"/>
    <rect x="44" y="84" width="60" height="14" rx="5" fill="#fff" stroke="#3eb8dc"/>
    <rect x="40" y="118" width="240" height="160" rx="12" fill="#dfe8f0"/>
    <rect x="52" y="130" width="216" height="110" rx="8" fill="#fff"/>
    <rect x="52" y="248" width="216" height="22" rx="6" class="bezelDial"/>
    <rect x="300" y="118" width="100" height="160" rx="8" class="panel"/>
    <text x="20" y="360" class="title ink">L0</text>
    <text x="20" y="384" class="body muted">thin top app bar</text>
    <text x="20" y="416" class="title ink">L1</text>
    <text x="20" y="440" class="body muted">face segment control</text>
    <text x="20" y="472" class="title ink">L2 Soft Pad</text>
    <text x="20" y="496" class="body muted">pad + fused bezel dial + dock</text>
    <text x="20" y="528" class="title ink">other faces</text>
    <text x="20" y="552" class="body muted">full replace hero (no pad residue)</text>
    <text x="20" y="600" class="small faint">ia-proto-a-bezel.png</text>
  </g>

  <!-- B -->
  <g transform="translate(500 100)">
    <rect class="card" width="440" height="660" rx="16"/>
    <rect class="tag" x="20" y="18" width="56" height="24" rx="12"/>
    <text x="48" y="34" text-anchor="middle" class="cap" fill="#1f7a92">B</text>
    <text x="88" y="36" class="title ink">${"\u5e94\u7528\u8f68\u5de5\u4f5c\u53f0"}</text>
    <rect class="mini" x="20" y="60" width="400" height="260" rx="12"/>
    <rect x="36" y="76" width="70" height="228" rx="8" class="rail"/>
    <rect x="120" y="76" width="280" height="228" rx="8" fill="#eef3f7" stroke="#d0dbe6"/>
    <rect x="136" y="100" width="140" height="120" rx="8" fill="#fff"/>
    <rect x="290" y="100" width="90" height="160" rx="8" class="panel"/>
    <text x="20" y="360" class="title ink">L0</text>
    <text x="20" y="384" class="body muted">left persistent app rail</text>
    <text x="20" y="416" class="title ink">L1</text>
    <text x="20" y="440" class="body muted">face name stack (not cards)</text>
    <text x="20" y="472" class="title ink">L2 Soft Pad</text>
    <text x="20" y="496" class="body muted">full workspace swap right</text>
    <text x="20" y="528" class="title ink">strength</text>
    <text x="20" y="552" class="body muted">clearest App vs Face separation</text>
    <text x="20" y="600" class="small faint">ia-proto-b-rail.png</text>
  </g>

  <!-- C -->
  <g transform="translate(960 100)">
    <rect class="card" width="440" height="660" rx="16"/>
    <rect class="tag" x="20" y="18" width="56" height="24" rx="12"/>
    <text x="48" y="34" text-anchor="middle" class="cap" fill="#1f7a92">C</text>
    <text x="88" y="36" class="title ink">${"\u5f02\u5f62\u821e\u53f0"}</text>
    <rect class="mini" x="20" y="60" width="400" height="260" rx="12"/>
    <rect x="36" y="88" width="220" height="160" rx="12" class="dark"/>
    <rect x="270" y="88" width="130" height="70" rx="10" class="lb"/>
    <rect x="270" y="168" width="130" height="80" rx="10" class="spine"/>
    <text x="20" y="360" class="title ink">L0</text>
    <text x="20" y="384" class="body muted">minimal stamp only</text>
    <text x="20" y="416" class="title ink">L1</text>
    <text x="20" y="440" class="body muted">heterogeneous face ports</text>
    <text x="20" y="472" class="title ink">L2 Soft Pad</text>
    <text x="20" y="496" class="body muted">dark instrument language</text>
    <text x="20" y="528" class="title ink">strength</text>
    <text x="20" y="552" class="body muted">faces cannot be confused</text>
    <text x="20" y="600" class="small faint">ia-proto-c-hetero.png</text>
  </g>

  <text x="48" y="820" class="title ink">${U.pick}</text>
  <text x="48" y="848" class="body muted">${U.pickDesc}</text>
`
);

const files = [
  ["ia-proto-a-bezel", protoA],
  ["ia-proto-b-rail", protoB],
  ["ia-proto-c-hetero", protoC],
  ["ia-proto-compare", compare],
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
