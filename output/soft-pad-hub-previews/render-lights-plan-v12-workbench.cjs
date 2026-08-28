const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const dir = __dirname;
const W = 1320;
const H = 900;

const T = {
  bg: "#0f1419",
  shell: "#161b22",
  surface: "#1c2330",
  surfaceSoft: "#252d3a",
  ink: "#e8eef5",
  muted: "#8b97a8",
  faint: "#5c6b7a",
  cyan: "#3eb8dc",
  cyanSoft: "rgba(62,184,220,0.14)",
  green: "#34d399",
  greenSoft: "rgba(52,211,153,0.12)",
  amber: "#f59e0b",
  red: "#f87171",
  purple: "#a78bfa",
  line: "rgba(255,255,255,0.08)",
};

const css = `
.bg{fill:${T.bg}}.shell{fill:${T.shell};stroke:${T.line}}
.surface{fill:${T.surface};stroke:${T.line}}
.soft{fill:${T.surfaceSoft};stroke:${T.line}}
.ink{fill:${T.ink}}.muted{fill:${T.muted}}.faint{fill:${T.faint}}
.small{font:11px 'Segoe UI','Microsoft YaHei',sans-serif}
.body{font:13px 'Segoe UI','Microsoft YaHei',sans-serif}
.title{font:700 14px 'Segoe UI','Microsoft YaHei',sans-serif}
.h1{font:700 20px 'Segoe UI','Microsoft YaHei',sans-serif}
.label{font:700 12px 'Segoe UI','Microsoft YaHei',sans-serif}
.cap{font:700 10px 'Segoe UI','Microsoft YaHei',sans-serif}
`;

function wrap(body, w = W, h = H) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><style type="text/css"><![CDATA[${css}]]></style></defs>
  <rect class="bg" width="${w}" height="${h}"/>
${body}
</svg>`;
}

function pill(x, y, text, color, w) {
  w = w || text.length * 11 + 16;
  return `<rect x="${x}" y="${y}" width="${w}" height="20" rx="10" fill="${color}22" stroke="${color}"/>
    <text x="${x + w / 2}" y="${y + 14}" text-anchor="middle" class="cap" fill="${color}">${text}</text>`;
}

function toggle(x, y, on) {
  return `<rect x="${x}" y="${y}" width="36" height="20" rx="10" fill="${on ? T.green : T.surfaceSoft}" stroke="${on ? T.green : T.line}"/>
    <circle cx="${on ? x + 26 : x + 10}" cy="${y + 10}" r="7" fill="#fff"/>`;
}

function miniPad(cx, cy, mode) {
  const keys = mode === "claude"
    ? [[T.cyan, "忙"], [T.green, "完"], [T.amber, "等"]]
    : mode === "codex"
      ? [["#fff", ""], [T.cyan, "忙"], ["#fff", ""]]
      : [["#fff", ""], ["#fff", ""], [T.cyan, "●"]];
  let s = `<g transform="translate(${cx} ${cy})">`;
  s += `<rect width="200" height="200" rx="18" fill="#1a2a35" stroke="${T.cyan}" stroke-width="2"/>`;
  s += `<rect x="16" y="16" width="168" height="130" rx="12" fill="#0f1a22" stroke="${T.line}"/>`;
  keys.forEach((k, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    s += `<rect x="${28 + col * 52}" y="${28 + row * 44}" width="44" height="36" rx="8" fill="${k[0]}" stroke="${T.line}"/>`;
    if (k[1]) s += `<text x="${50 + col * 52}" y="${50 + row * 44}" text-anchor="middle" class="cap" fill="#fff">${k[1]}</text>`;
  });
  s += `<rect x="16" y="154" width="168" height="28" rx="8" fill="#0a1018"/>`;
  s += `<circle cx="36" cy="168" r="5" fill="${T.cyan}"/><circle cx="56" cy="168" r="5" fill="${T.amber}"/>`;
  s += `<text x="170" y="172" text-anchor="end" class="cap" fill="${T.faint}">顶栏</text></g>`;
  return s;
}

function agentRow(x, y, name, pills, selected) {
  const h = 52;
  return `<g transform="translate(${x} ${y})">
    <rect width="248" height="${h}" rx="10" fill="${selected ? T.cyanSoft : T.surface}" stroke="${selected ? T.cyan : T.line}" stroke-width="${selected ? 2 : 1}"/>
    <text x="14" y="22" class="label ink">${name}</text>
    ${pills.map((p, i) => pill(14 + i * 72, 30, p[0], p[1], p[2] || 64)).join("")}
  </g>`;
}

function sectionCard(x, y, w, title, body) {
  return `<g transform="translate(${x} ${y})">
    <rect width="${w}" height="${body.h}" rx="12" class="surface"/>
    <text x="16" y="24" class="label ink">${title}</text>
    ${body.inner}
  </g>`;
}

// ── v12-A: Agent Workbench overview ──
const agents = [
  ["Codex", [["Pad·开", T.green], ["灯·开", T.green], ["接·等", T.amber]], false],
  ["Claude", [["Pad·开", T.green], ["灯·关", T.faint], ["接·未", T.red]], false],
  ["Cursor", [["Pad·开", T.green], ["灯·开", T.green], ["接·未", T.red]], true],
  ["WorkBuddy", [["可准备", T.amber], ["灯·关", T.faint], ["Hook", T.muted]], false],
  ["Trae Work", [["Pad·开", T.green], ["灯·开", T.green], ["本地", T.cyan]], false],
  ["MiniMax", [["Pad·开", T.green], ["额度", T.purple], ["API", T.amber]], false],
];

let agentList = "";
agents.forEach((a, i) => {
  agentList += agentRow(24, 120 + i * 58, a[0], a[1], a[2]);
});

const planA = wrap(`
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="16" class="shell"/>
  ${pill(32, 28, "v12 · Agent 工作台", T.cyan, 140)}
  <text x="184" y="44" class="h1 ink">融合能力 · 一 Agent 一工作台</text>
  <text x="184" y="64" class="small muted">取代「状态灯独立舞台 + 三份 Agent 列表」</text>

  <rect x="32" y="80" width="280" height="${H - 120}" rx="14" class="surface"/>
  <text x="48" y="104" class="label ink">Agent 目录</text>
  <text x="48" y="120" class="small muted">Pad · 灯 · 接 — 三态一眼看清</text>
  ${agentList}
  <text x="48" y="${H - 56}" class="small faint">+ 添加自定义习惯</text>

  <rect x="328" y="80" width="${W - 360}" height="${H - 120}" rx="14" fill="${T.surfaceSoft}" stroke="${T.line}"/>
  <text x="344" y="104" class="title ink">Cursor · 工作台</text>
  ${pill(460, 90, "当前前台", T.cyan, 72)}
  ${miniPad(360, 120, "cursor")}

  ${sectionCard(600, 120, 680, "① 准备度（一次看清三件事）", {
    h: 88,
    inner: `
      <text x="16" y="48" class="small muted">Soft Pad</text>${toggle(80, 36, true)}<text x="128" y="50" class="body ink">已启用 · 14/15 键</text>
      <text x="320" y="48" class="small muted">顶栏灯</text>${toggle(380, 36, true)}<text x="428" y="50" class="body ink">显示圆点</text>
      <text x="520" y="48" class="small muted">接入</text>${pill(560, 36, "未接入", T.red, 56)}<rect x="630" y="36" width="100" height="28" rx="8" fill="${T.cyan}"/><text x="680" y="55" text-anchor="middle" class="cap" fill="#fff">连接</text>`
  })}

  ${sectionCard(600, 220, 680, "② 灯效（按能力显示，不画三个 Tab）", {
    h: 100,
    inner: `
      <text x="16" y="44" class="body ink">顶栏圆点</text><text x="100" y="44" class="small muted">— Cursor 仅支持顶栏，无多键灯</text>
      <rect x="16" y="56" width="200" height="32" rx="8" fill="#0a1018" stroke="${T.line}"/><circle cx="190" cy="72" r="5" fill="${T.cyan}"/>
      <text x="240" y="76" class="small faint">氛围灯 / 按键灯：此 Agent 不适用（诚实灰掉）</text>`
  })}

  ${sectionCard(600, 336, 680, "③ 跨应用顶栏（次要，默认折叠）", {
    h: 72,
    inner: `<text x="16" y="44" class="small muted">▸ 还监视 Codex · Claude · Trae Work（chip 管理 + 添加）</text>`
  })}

  <text x="32" y="${H - 24}" class="small" fill="${T.green}">图 A · 左：唯一 Agent 列表 · 右：选中 Agent 的 Pad+灯+接入 融合工作台</text>
`);

// ── v12-B: Codex full capabilities ──
const planB = wrap(`
  <rect x="16" y="16" width="${W - 32}" height="${H - 32}" rx="16" class="shell"/>
  ${pill(32, 28, "Codex", T.cyan, 64)}
  <text x="108" y="44" class="h1 ink">高能力 Agent · 全区块展示</text>

  <rect x="32" y="72" width="300" height="56" rx="10" class="surface"/>
  <text x="48" y="96" class="small muted">准备度</text>
  ${pill(110, 84, "Pad·开", T.green, 52)}${pill(170, 84, "灯·开", T.green, 52)}${pill(230, 84, "接·已接入", T.green, 72)}
  <rect x="350" y="72" width="200" height="56" rx="10" class="surface"/>
  <text x="366" y="96" class="small muted">精度</text><text x="420" y="96" class="body ink">Hook 单灯 · 线程槽</text>
  ${miniPad(580, 60, "codex")}

  ${sectionCard(32, 150, 400, "Soft Pad", { h: 120, inner: `
    ${toggle(16, 40, true)}<text x="60" y="54" class="body ink">启用虚拟键盘</text>
    <text x="16" y="78" class="small muted">21 键 · 标准布局</text>
    <rect x="16" y="88" width="88" height="24" rx="6" fill="${T.surfaceSoft}" stroke="${T.line}"/><text x="60" y="104" text-anchor="middle" class="cap muted">改按键</text>
    <rect x="112" y="88" width="88" height="24" rx="6" fill="${T.surfaceSoft}" stroke="${T.line}"/><text x="156" y="104" text-anchor="middle" class="cap muted">何时显示</text>`})}

  ${sectionCard(448, 150, 400, "状态灯", { h: 120, inner: `
    ${toggle(16, 40, true)}<text x="60" y="54" class="body ink">顶栏 + 键灯</text>
    <text x="16" y="78" class="small muted">一整段任务亮在 AG00（自动）</text>
    <circle cx="24" cy="100" r="4" fill="${T.faint}"/><text x="34" y="104" class="small muted">灰空闲</text>
    <circle cx="84" cy="100" r="4" fill="${T.cyan}"/><text x="94" y="104" class="small muted">蓝忙</text>
    <circle cx="134" cy="100" r="4" fill="${T.amber}"/><text x="144" y="104" class="small muted">琥珀等你</text>`})}

  ${sectionCard(864, 150, 424, "接入", { h: 120, inner: `
    ${pill(16, 40, "已接入", T.green, 56)}
    <text x="80" y="54" class="body ink">Codex Hook · 等待事件</text>
    <text x="16" y="78" class="small muted">在 Codex 发一条消息点亮状态</text>
    <rect x="16" y="88" width="72" height="24" rx="6" fill="${T.surfaceSoft}" stroke="${T.line}"/><text x="52" y="104" text-anchor="middle" class="cap muted">详情</text>`})}

  ${sectionCard(32, 290, 1256, "会话导航（仅 Codex / Claude）", { h: 80, inner: `
    ${toggle(16, 40, false)}<text x="60" y="54" class="body ink">启用线程槽（实验）</text>
    <text x="16" y="72" class="small muted">AG00–01 混排 · 不影响 ACT/NAV</text>`})}

  ${sectionCard(32, 386, 1256, "跨应用顶栏监视", { h: 200, inner: `
    <text x="16" y="44" class="small muted">此习惯顶栏还显示：</text>
    ${["Codex", "Claude", "Cursor"].map((n, i) => `<rect x="${16 + i * 120}" y="52" width="108" height="28" rx="8" fill="#fff" stroke="${T.line}"/><text x="${70 + i * 120}" y="70" text-anchor="middle" class="small ink">${n}</text><text x="${108 + i * 120}" y="70" class="cap" fill="${T.red}">×</text>`).join("")}
    <text x="16" y="100" class="small" fill="${T.cyan}">+ 添加</text>
    <text x="16" y="130" class="small faint">其他 Agent 接入：Claude · 未接入 · 详情  |  Cursor · 已接入</text>`})}

  <text x="32" y="${H - 24}" class="small" fill="${T.cyan}">图 B · 能力驱动：有会话槽才显示会话区；有 Hook 才显示接入区；无能力则灰掉</text>
`);

// ── v12-C: Architecture compare old vs new ──
const planC = wrap(`
  <text x="40" y="36" class="h1 ink">架构对比：碎片化 → Agent 工作台</text>

  <text x="40" y="72" class="title" fill="${T.red}">现状（6 个入口管 1 个 Agent）</text>
  <rect x="40" y="84" width="600" height="320" rx="12" fill="rgba(248,113,113,0.06)" stroke="${T.red}"/>
  <text x="56" y="112" class="small ink">顶栏 ribbon → scope</text>
  <text x="56" y="132" class="small ink">右栏选应用 → Pad 开/关</text>
  <text x="56" y="152" class="small ink">顶栏 tab → 跨应用 chip 列表</text>
  <text x="56" y="172" class="small ink">状态连接 → N 张接入卡</text>
  <text x="56" y="192" class="small ink">按键灯 tab → 又一次开关+连接</text>
  <text x="56" y="212" class="small ink">Quick Start → 又一套批量接入</text>
  <text x="56" y="260" class="small muted">数据源：BUILTIN_SOFT_PAD_APPS + TOPBAR_LIGHT_CANDIDATES + CATALOG 三份表手工同步</text>

  <text x="680" y="72" class="title" fill="${T.green}">目标（1 入口 · 能力矩阵驱动）</text>
  <rect x="680" y="84" width="600" height="320" rx="12" fill="rgba(52,211,153,0.06)" stroke="${T.green}"/>
  <text x="696" y="112" class="small ink">Agent 目录（左）→ 唯一列表 + Pad/灯/接 三 pill</text>
  <text x="696" y="132" class="small ink">工作台（右）→ 准备度一行 + 能力区块</text>
  <text x="696" y="152" class="small ink">agent_catalog（Rust SSOT）→ FE 镜像能力，控制显示</text>
  <text x="696" y="172" class="small ink">connectKind → 接入 UI 形态（hook/solo/quota）</text>
  <text x="696" y="192" class="small ink">跨应用顶栏 → 折叠次要区</text>
  <text x="696" y="212" class="small ink">状态灯舞台 → 并入工作台，不独立三栏</text>
  <text x="696" y="260" class="small muted">数据源：SOFT_PAD_AGENT_REGISTRY 单表（hub + lights + overlay + connect）</text>

  <text x="40" y="440" class="title ink">实施分期</text>
  ${[
    ["P0", "SOFT_PAD_AGENT_REGISTRY + Agent 目录组件", T.cyan],
    ["P1", "Agent 工作台替换 agent face（准备度+灯效+接入）", T.green],
    ["P2", "按 agent_catalog 隐藏/灰掉不适用的区块", T.amber],
    ["P3", "Quick Start / 顶栏监视 / Shell 面板汇入同一 connect 状态机", T.purple],
  ].map((r, i) => `<g transform="translate(40 ${460 + i * 48})">${pill(0, 0, r[0], r[2], 36)}<text x="48" y="14" class="body ink">${r[1]}</text></g>`).join("")}

  <text x="40" y="${H - 24}" class="small" fill="${T.muted}">图 C · 不是藏右栏，是重做信息架构 + 统一 Agent 能力模型</text>
`);

const files = [
  ["lights-plan-v12-a-workbench", planA],
  ["lights-plan-v12-b-codex", planB],
  ["lights-plan-v12-c-architecture", planC],
];

const fontFiles = [
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/segoeui.ttf",
];

for (const [name, svg] of files) {
  fs.writeFileSync(path.join(dir, name + ".svg"), svg, "utf8");
  const resvg = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: true, fontFiles } });
  fs.writeFileSync(path.join(dir, name + ".png"), resvg.render().asPng());
  console.log(name + ".png ok");
}
