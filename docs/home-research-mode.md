# 首页调研模式 — 设计备忘

## 目标

在 HA2「对话 | 工作」旁的 **调研** 模式：复用 WorkBuddy LLM + 搜索/抓取 IPC；支持 **fast（有来源短答）** 与 **faceted（2–3 真实调查面）**；强制出处与诚实降级；可复核基线。不引入 Docker、DSH 子 Agent 或新 LLM 供应商。

## 分流与路径

| 深度 | 默认路径 | 说明 |
|---|---|---|
| quick | fast（强制） | 仍搜索+抓取；可核查短答；无来源 → `completed_without_sources` |
| standard | 规则/短分类建议 | UI **可见**建议并可手动切换 fast ↔ faceted |
| deep | faceted（强制） | 可编辑调查面后确认 |

## 全局硬预算（同一账本）

分类/规划/简报/审查/补查/成稿的模型调用、全部 search/fetch 计入 `ledger`。并行面数 2 ≠ 预算。

| path | search | fetch | modelCalls | 并行面 | 补查轮 |
|---|---|---|---|---|---|
| fast | ≤3 | ≤4 | ≤2 | — | 0 |
| standard faceted | ≤8 | ≤10 | ≤6 | ≤2 | ≤1 |
| deep faceted | ≤12 | ≤14 | ≤9 | ≤2 | ≤1 |

## 审查与覆盖率

1. **成稿前**：审查各面 brief + 来源；会改变结论的缺口最多补查一轮。
2. **成稿后程序校验**：`[S#]` 存在；来源 `readState` 不误标（snippet ≠ fetched）。
3. **不能**程序证明「来源支持结论」→ 人工抽查。
4. `facetSourceCoverage` = 有有效来源的面数 / 总面数（fast：0/1 或 1/1）。
5. `keyClaimCiteRate` = 带 `[S#]` 的关键结论数 / 关键结论数。

## 状态机

`idle → configuring → awaiting_approval → searching|fetching|briefing|reviewing|synthesizing → completed_* | failed`  
任意运行态/`awaiting_approval` 可 `cancel → idle`。

## 编排

1. `preparePlan` → 展示路径与面 → 用户确认  
2. fast：plan → search → fetch → synthesize（短答）  
3. faceted：每面 search→fetch→brief（并行≤2）→ review → synthesize  
4. metrics 写入 result（无密钥）

## 基线

`scripts/research-fixtures.json` + `npm run test:research-baseline`  
无应用 IPC 时 `qualityCompare: "未完成"`，不得用 mock 冒充质量结论。

## 文件

| 层 | 路径 |
|---|---|
| 前端 | `src/js/features/now/home-research.js` |
| UI | `home-agent-v2.js` + `home-agent-v2.css` |
| Rust | `src-tauri/src/research/`（搜索/抓取/导出） |
| 测试 | `scripts/test-home-research.mjs` |
| 基线 | `scripts/research-fixtures.json`, `scripts/research-baseline.mjs` |
