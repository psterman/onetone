const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;
const W = 1280;
const H = 920;

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
  red: "#dc2626",
  redBg: "rgba(220,38,38,0.08)",
  agent: "#34d399",
  running: "#3b82f6",
  wait: "#f59e0b",
  done: "#22c55e",
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

function miniPad(cx, cy) {
  return `<g transform="translate(${cx} ${cy})">
    <rect x="0" y="0" width="180" height="180" rx="16" fill="#d9eef6" stroke="${T.primaryBright}" stroke-width="2"/>
    <rect x="14" y="14" width="152" height="120" rx="12" fill="#f7fbfd" stroke="#b7dcea"/>
    <rect x="24" y="24" width="44" height="36" rx="8" fill="#fff" stroke="#d5e1ec"/>
    <rect x="76" y="24" width="44" height="36" rx="8" fill="${T.running}" stroke="${T.running}"/>
    <rect x="128" y="24" width="28" height="36" rx="8" fill="#fff" stroke="#d5e1ec"/>
    <rect x="14" y="142" width="152" height="22" rx="6" fill="#1e3a48"/>
    <circle cx="34" cy="153" r="4" fill="${T.running}"/>
    <text x="150" y="156" text-anchor="end" class="cap" fill="#9ec9d8">顶栏</text>
  </g>`;
}

function agentChipRow(x, y, names, highlight) {
  let s = `<g transform="translate(${x} ${y})">`;
  names.forEach((name, i) => {
    const on = name === highlight;
    s += `<rect x="${i * 86}" y="0" width="78" height="28" rx="8" fill="${on ? "#fff" : T.surfaceSoft}" stroke="${on ? T.primary : T.outline}" stroke-width="${on ? 2 : 1}"/>`;
    s += `<text x="${i * 86 + 39}" y="18" text-anchor="middle" class="cap" fill="${on ? T.primary : T.muted}">${name}</text>`;
  });
  s += `</g>`;
  return s;
}

function monitorList(x, y, names) {
  let s = `<g transform="translate(${x} ${y})">`;
  s += `<text x="0" y="0" class="label ink">顶栏监视</text>`;
  s += `<text x="0" y="16" class="small muted">跨应用显示忙闲 · 14 项</text>`;
  names.forEach((name, i) => {
    const ay = 28 + i * 26;
    s += `<rect x="0" y="${ay}" width="300" height="22" rx="6" fill="#fff" stroke="${T.outline}"/>`;
    s += `<text x="10" y="${ay + 15}" class="small ink">${name}</text>`;
    s += `<text x="288" y="${ay + 15}" text-anchor="end" class="cap" fill="${T.red}">×</text>`;
  });
  s += `</g>`;
  return s;
}

function connectCard(x, y, name, expanded) {
  if (!expanded) {
    return `<g transform="translate(${x} ${y})">
      <rect width="300" height="28" rx="6" fill="#fff" stroke="${T.outline}"/>
      <text x="10" y="18" class="small ink">${name}</text>
      <rect x="200" y="6" width="48" height="16" rx="8" fill="${T.greenBg}" stroke="${T.green}"/>
      <text x="224" y="17" text-anchor="middle" class="cap" fill="${T.green}">已接入</text>
      <text x="288" y="18" text-anchor="end" class="cap muted">详情</text>
    </g>`;
  }
  return `<g transform="translate(${x} ${y})">
    <rect width="300" height="88" rx="10" fill="#fff" stroke="${T.outline}"/>
    <text x="12" y="22" class="label ink">${name} · 未接入</text>
    <text x="12" y="40" class="small muted">确认后写入配置（会先备份）…</text>
    <rect x="12" y="52" width="140" height="26" rx="8" fill="${T.primaryBright}"/>
    <text x="82" y="69" text-anchor="middle" class="cap" fill="#fff">确认接入并监视</text>
    <rect x="160" y="52" width="72" height="26" rx="8" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
    <text x="196" y="69" text-anchor="middle" class="cap muted">刷新</text>
  </g>`;
}

function rightRail(x, y, apps) {
  let s = `<g transform="translate(${x} ${y})">`;
  s += `<text x="0" y="0" class="label ink">选应用</text>`;
  s += `<text x="0" y="16" class="small muted">16 项 · Pad 开/关</text>`;
  let ay = 26;
  apps.forEach(([name, on]) => {
    s += `<rect x="0" y="${ay}" width="220" height="34" rx="8" fill="${on ? "#ecf8f3" : "#fff"}" stroke="${on ? T.agent : T.outline}"/>`;
    s += `<text x="10" y="${ay + 21}" class="small ink">${name}</text>`;
    s += toggle(170, ay + 6, on);
    ay += 40;
  });
  s += `</g>`;
  return s;
}

function badge(x, y, text, color) {
  return `<rect x="${x}" y="${y}" width="${text.length * 11 + 16}" height="22" rx="11" fill="${color}20" stroke="${color}"/>
    <text x="${x + 8}" y="${y + 15}" class="cap" fill="${color}">${text}</text>`;
}

// ── BEFORE: cluttered (matches user screenshots) ──
const before = wrap(`
  <rect class="bg" width="${W}" height="${H}"/>
  ${badge(40, 16, "现状 · 问题", T.red)}
  <text x="160" y="32" class="h1 ink">状态灯页 · 三层 Agent 列表重叠</text>

  ${agentChipRow(40, 52, ["Codex", "Claude", "Cursor", "Trae", "Qoder", "…"], "Cursor")}

  <rect x="40" y="96" width="760" height="${H - 140}" rx="14" class="surface"/>
  <text x="56" y="120" class="cap muted">左预览</text>
  ${miniPad(56, 132)}
  <rect x="280" y="132" width="500" height="${H - 180}" rx="12" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
  <text x="296" y="156" class="cap" fill="${T.primary}">顶栏</text>
  <text x="360" y="156" class="cap muted">氛围灯</text>
  <text x="424" y="156" class="cap muted">按键灯</text>
  <text x="296" y="180" class="small muted">当前应用: Cursor · 只看顶栏圆点</text>
  ${monitorList(296, 192, ["Codex", "Claude", "Cursor", "Copilot", "Gemini", "MiniMax", "WorkBuddy", "Trae Work"])}
  <text x="296" y="440" class="label ink">状态连接</text>
  ${connectCard(296, 452, "Cursor", true)}
  ${connectCard(296, 548, "Codex", true)}
  ${connectCard(296, 644, "WorkBuddy", true)}

  <rect x="820" y="96" width="420" height="${H - 140}" rx="14" class="surface"/>
  <text x="836" y="120" class="cap muted">右栏 · 选应用</text>
  ${rightRail(836, 132, [["Cursor", true], ["Trae Work", true], ["Trae Code", true], ["Codex", false], ["Claude", false], ["Windsurf", false]])}

  <rect x="40" y="${H - 32}" width="1200" height="24" rx="6" fill="${T.redBg}"/>
  <text x="56" y="${H - 14}" class="small" fill="${T.red}">× 同一 Agent 出现 3 次 · 语义不同（Pad开/顶栏灯/Hook）· 开 N 盏灯 = N 张接入大卡</text>
`);

// ── AFTER: scope-centric dedup ──
const after = wrap(`
  <rect class="bg" width="${W}" height="${H}"/>
  ${badge(40, 16, "去重后 · v11", T.green)}
  <text x="160" y="32" class="h1 ink">状态灯页 · Scope 中心化</text>

  <rect x="40" y="52" width="360" height="36" rx="10" class="soft"/>
  <text x="56" y="74" class="label ink">正在编辑 · Cursor</text>
  <rect x="300" y="60" width="84" height="24" rx="8" fill="#fff" stroke="${T.outline}"/>
  <text x="342" y="76" text-anchor="middle" class="cap muted">换应用 ▾</text>

  <rect x="40" y="96" width="380" height="${H - 140}" rx="14" fill="#ecf8f3" stroke="rgba(52,211,153,0.35)"/>
  <text x="56" y="120" class="cap" fill="${T.agent}">键盘预览（只读）</text>
  ${miniPad(120, 140)}
  <text x="56" y="340" class="small muted">顶栏预览</text>
  <rect x="56" y="348" width="200" height="32" rx="8" fill="rgba(148,163,184,0.12)" stroke="${T.outline}"/>
  <circle cx="180" cy="364" r="4" fill="${T.running}"/>
  <text x="56" y="400" class="small muted">灰=空闲 · 蓝=忙 · 橙=等你 · 绿=完成 · 红=失败</text>

  <rect x="440" y="96" width="800" height="${H - 140}" rx="14" class="surface"/>
  <text x="456" y="120" class="cap" fill="${T.primary}">顶栏</text>
  <text x="520" y="120" class="cap muted">氛围灯</text>
  <text x="584" y="120" class="cap muted">按键灯</text>
  <text x="456" y="148" class="small muted">Cursor · 只看顶栏圆点（不支持多键灯）</text>

  ${toggle(456, 168, true)}
  <text x="508" y="183" class="label ink">显示 Cursor 顶栏状态灯</text>

  <rect x="456" y="208" width="320" height="100" rx="12" fill="${T.surfaceSoft}" stroke="${T.outline}"/>
  <text x="472" y="232" class="label ink">Cursor · 未接入</text>
  <text x="472" y="252" class="small muted">复制 Hook 配置到 hooks.json，装完发一条消息点亮</text>
  <rect x="472" y="268" width="120" height="28" rx="8" fill="${T.primaryBright}"/>
  <text x="532" y="286" text-anchor="middle" class="cap" fill="#fff">连接 Cursor</text>

  <text x="456" y="340" class="small faint">▸ 管理其他 Agent 顶栏灯（chip 列表 + 添加）</text>
  <text x="456" y="360" class="small faint">▸ 其他 Agent 接入状态（Codex · 已接入 · 详情）</text>
  <text x="456" y="380" class="small faint">▸ 高级设置（精度说明、API、诊断）</text>

  <rect x="40" y="${H - 32}" width="1200" height="24" rx="6" fill="${T.greenBg}"/>
  <text x="56" y="${H - 14}" class="small" fill="${T.green}">✓ 无右栏 · 首屏 1 处 scope · 1 开关 · 1 连接卡 · 跨应用管理折叠</text>
`);

// ── COMPARE side-by-side (scaled) ──
const compareW = 2560;
const compareH = 940;
const compare = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${compareW}" height="${compareH}" viewBox="0 0 ${compareW} ${compareH}">
  <defs><style type="text/css"><![CDATA[${css}]]></style></defs>
  <rect class="bg" width="${compareW}" height="${compareH}"/>
  <text x="40" y="36" class="h1 ink">状态灯页去重 · 现状 vs 方案对比</text>
  <foreignObject x="20" y="52" width="1260" height="880">
    <div xmlns="http://www.w3.org/1999/xhtml" style="width:1260px;height:880px;overflow:hidden">${before.replace(/<\?xml[^>]*>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}</div>
  </foreignObject>
  <text x="1300" y="36" class="title" fill="${T.green}">→</text>
  <g transform="translate(1280 52) scale(1)">
    ${after.replace(/<\?xml[^>]*>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}
  </g>
</svg>`;

// Simpler compare: two panels in one SVG manually
const compareSimple = wrap(`
  <rect class="bg" width="${W}" height="${H}"/>
  <text x="40" y="28" class="h1 ink">对比一览</text>
  <line x1="640" y1="48" x2="640" y2="${H - 20}" stroke="${T.outline}" stroke-width="2" stroke-dasharray="6 4"/>
  <text x="320" y="52" text-anchor="middle" class="title" fill="${T.red}">现状</text>
  <text x="960" y="52" text-anchor="middle" class="title" fill="${T.green}">去重后</text>

  <g transform="translate(0 60) scale(0.48)">
    <g transform="translate(0 0)">${before.replace(/<\?xml[^>]*>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}</g>
    <g transform="translate(1320 0)">${after.replace(/<\?xml[^>]*>/, "").replace(/<svg[^>]*>/, "").replace(/<\/svg>/, "")}</g>
  </g>
`);

const files = [
  ["lights-plan-v11-before-clutter", before],
  ["lights-plan-v11-after-scope", after],
  ["lights-plan-v11-compare", compareSimple],
];

const fontFiles = [
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/segoeui.ttf",
  "C:/Windows/Fonts/arial.ttf",
];

for (const [name, svg] of files) {
  fs.writeFileSync(path.join(dir, name + ".svg"), svg, "utf8");
  try {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "original" },
      font: { loadSystemFonts: true, fontFiles },
    });
    fs.writeFileSync(path.join(dir, name + ".png"), resvg.render().asPng());
    console.log(name + ".png ok");
  } catch (e) {
    console.log(name + ".svg ok (png skip: " + e.message + ")");
  }
}
