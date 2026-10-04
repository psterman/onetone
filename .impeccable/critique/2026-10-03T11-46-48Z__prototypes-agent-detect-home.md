---
target: Agent home data merge prototype
total_score: 27
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:E:\\voice-pilot\\prototypes\\agent-detect-home"
timestamp: 2026-10-03T11-46-48Z
slug: prototypes-agent-detect-home
---
# Agent 首页合并数据板评估

## Design Health Score

| # | 启发式 | 分数 | 关键问题 |
|---|---|---:|---|
| 1 | 系统状态可见性 | 3/4 | 检测、来源、置信度清楚；所有选择入口必须同步 |
| 2 | 符合现实语言 | 3/4 | 今日、费用、配额自然；内部 lens 代号不应暴露 |
| 3 | 用户控制与自由 | 3/4 | 需要清除筛选和明显返回总览 |
| 4 | 一致性与标准 | 2/4 | Dock、源条、rank、preview 的选择语义可能冲突 |
| 5 | 错误预防 | 4/4 | 禁用假周期、缺值与估价规则可靠 |
| 6 | 识别优于记忆 | 3/4 | 同页减少跨页记忆，但控件较多 |
| 7 | 灵活性与效率 | 3/4 | 镜头、筛选、single、深链有效，缺快捷路径 |
| 8 | 美观与极简 | 1/4 | 全能力常驻会让首页过密 |
| 9 | 错误恢复 | 3/4 | 未接通 CTA 清楚；无结果和授权失败需补恢复 |
| 10 | 帮助与文档 | 2/4 | 日桶、官方价、来源等术语仍需解释 |
| **总分** | | **27/40** | **可接受，解决布局与选择模型后可达良好** |

## Design Specificity Verdict

产品专属性高：Dock 放大选择、Soft Pad、检测可信度、异构 Agent 数据源、诚实缺失值和官方价账本形成 OneTone 特有组合。风险在于左侧设备控制语言与右侧分析后台语言拼接，以及 Dock、源条、Focus rank、preview 同时承担 Agent 选择。必须建立唯一 focus 模型。

确定性扫描发现 14 项：低对比度 5、过小功能文字 4、过小正文 2、深色 glow 1、radial halo 1、重复条纹 1，均定位到 prototypes/agent-detect-home/index.html。浏览器证据确认当前 split 仍只有五张卡与文案镜头，缺 period、filters、ledger、single 和八字段 preview。

## Overall Impression

合并方向收益明显更大，但应做成同页分层控制台，不能把生产数据页三栏原样压进右栏。最大机会是让“观察 → 过滤 → 钻取 → 修复”保持同一 Agent 上下文；最大风险是 1080px 下的横向拥挤和多入口状态冲突。

## What's Working

1. Dock 与数据板共享 focusId，可消除跨页重新定位。
2. 缺字段为 —、只合计 booked 官方价、估价不入账、周月不造数，建立可信度。
3. activity/quota/unwired 过滤与去连接、开启本机活动动作共处同页，观察能转为行动。

## Priority Issues

### [P1] 右栏三列在目标宽度下不可用

1080px split 中右侧约 740px，若继续保留 148px lens 与 300px preview，mid 仅约 290px。窄宽时将 lens 改为顶部轨，preview 改抽屉或 single 下方，左栏提供紧凑态。

### [P1] Agent 选择入口过多

Dock 应是唯一全局 focus；source、rank、ledger 行统一进入 single，并提供清晰 breadcrumb 与返回总览。board 到 Dock 也必须双向同步且防反馈循环。

### [P1] 首屏控制数量过载

默认只保留镜头、当前 Agent 和主要筛选入口；period disabled 压成诚实说明；filters 收进带计数的入口；Export/副屏进入溢出菜单；ledger 仅在 Cost 镜头出现。

### [P2] 顶栏、App snap、KPI、preview 信息重复

顶栏只给当前 Agent 与 1–2 个核心状态，KPI 只服务当前 lens，preview 专注八字段来源与可信度。

### [P2] 诚实规则表达过于技术

将“需日桶”写成“采集每日历史后可用”；费用分组为“已计入总额 / 仅供参考 / 暂无价格”；统一解释 — 的含义。

## Persona Red Flags

Alex：合并显著提高效率，但若 source、rank、ledger 点击语义不同会频繁误入 single；需要保留 URL 深链并考虑键盘切 Agent/lens、Esc 返回总览。

Sam：动态重绘必须保持焦点与 aria-selected，同步 live region；live/tight/off 不能只靠颜色；抽屉、popover、wall 需要焦点管理；当前 10–11px 文本与部分 32px 控件偏小。

## Minor Observations

- Soft Pad 示意可折叠，为右侧分析让出空间。
- “完整数据目录”应改成“查看费用账本”或“跳到账本”。
- 长期为 — 的 heat/peak 不应占首屏主面积。
- empty 场景应退化为连接/启用引导。
- 当前测试只做静态字符串检查，无法证明交互；应加入浏览器 smoke。

## Questions to Consider

- 首页第一眼究竟要回答“谁可用”，还是“发生了什么”？
- preview 是否必须常驻，还是只在 single 时展开？
- 用户切换 source 时，是改变全局 Agent，还是只做局部钻取？
