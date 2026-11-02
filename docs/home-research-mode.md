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
| fast | ≤3 | ≤4 | ≤3 | — | 0 |
| standard faceted | ≤10 | ≤12 | ≤7 | ≤2 | ≤2 |
| deep faceted | ≤12 | ≤14 | ≤9 | ≤2 | ≤2 |

fast 的 3 次模型调用预留给：**规划 1 + 成稿 1**（余量可给可选补写）；faceted 规划在确认页用 `skipLedger`，运行账本从搜索/简报起算。`repairRounds` 由 **coverage gate + 最多一轮 authority dig** 共享；有 aspects 时优先 coverage。

## 诚实且大胆（合同）

- **大胆抓取**：相关性匹配对拉丁产品名大小写不敏感；strict 零命中且 raw>0 时 fail-open（非全噪点）；薄覆盖 / `picked=0&&raw>0` / 来源<3 时 authority dig 扩面（国内外轴、评测/文档），抓取≤5，过滤词典页。
- **诚实成稿**：结论只来自已抓材料；禁止编造无来源的国内落地/数字/合规断言；禁止「无法直接回答 + 仍待核实 + 调研限制」三板斧。
- **缺口不进正文套话**：coverage softGaps 只进 `metrics.coverageGaps` / trace，**不**再注入 `limitations` 的「未确认：…」。
- **模型接管规划/下探**：WorkBuddy 判断搜什么、挖哪类源；本地只做实体解析、缺侧补面、播放页降权、引用闸门。禁止用本地「百度百科/横评」模板整面替换已有 wb 规划。
- **对比题合同**：解析多侧实体 → 模型规划分侧+对照检索；缺侧/浅源触发模型补搜（本地仅薄兜底实体名）；成稿须非空 comparison + 可执行补抓。

## 审查与覆盖率

1. **成稿前**：审查各面 brief + 来源；会改变结论的缺口最多补查一轮（coverage）。
2. **权威源下探（authority dig）**：官网偏重、无第三方、`coverageBlocked`、零事实、或 `pickedMiss&&rawHits>0` / 来源<3 时，成稿前一轮 repair：2–4 条互补检索并抓取≤5；trace `repair_search` reason=`authority_dig`。
3. **成稿后程序校验**：`[S#]` 存在；来源 `readState` 不误标（snippet ≠ fetched）。
4. **不能**程序证明「来源支持结论」→ 人工抽查。
5. `facetSourceCoverage` = 有有效来源的面数 / 总面数（fast：0/1 或 1/1）。
6. `keyClaimCiteRate` = 带 `[S#]` 的关键结论数 / 关键结论数。

## 状态机

`idle → configuring → awaiting_approval → searching|fetching|briefing|reviewing|synthesizing → completed_* | failed`  
任意运行态/`awaiting_approval` 可 `cancel → idle`。

过宽主题澄清（对齐 ATR `request_user_input`）：**仅模型**在 `resolveSemanticIntent` 里设 `needsClarify` + `clarifyOptions`（可带 priorTopics 上下文）；本地不猜词表、不发明芯片。确认页出选项或自由文本 → `applyClarifyOption` → 再 `preparePlan`；`confirmAndRun` 在澄清前不进入搜索。模型不可用时诚实 `planSource=local` + `degradeReason`，确认页提示「重新规划」；不假装主动澄清。  
无网页来源时仍先 `chatOnce` 问模型（澄清或下一步建议），禁止直接模板空报告且 `model=0`。

## 编排

1. `preparePlan` → **同一** Captain Plan → 用户确认  
2. fast：plan → search → fetch → synthesize（短答）  
3. faceted：沿用确认的 facets → 每面 search→fetch→brief（并行≤2）→ review → coverage gate → **authority dig（条件触发）** → synthesize  
4. metrics 写入 result（无密钥）；`metrics.authorityDig` / `metrics.depth` / `metrics.sourceBoundNote` 供页脚，不灌进正文套话

### Captain Plan Contract（prepare = run）

`preparePlan` **模型优先**：先本地 seed 进确认页（`plan.planning=true`），再用 WorkBuddy `resolveSemanticIntent(..., { skipLedger: true })` 写回 facets；失败回退本地。
确认后 `runFacetedPipeline` / `runFastPipeline` **复用** `state.plan.researchIntent`，不得悄悄换成另一套 facets。
路径切换 fast→faceted 时，确认页必须从已保存的 captain `researchIntent` 恢复 facets，**禁止**再调用 `buildFacetPlanHeuristic`（避免「1是 / 多方说法」硬编码模板）。

`ResearchIntent` 含：`originalQuestion`、`entities`、`aspects[]`（用户方面词）、
`facets[]`（优先一面一事）、`phenomenon`、`searchConcepts`。
`metrics.planSource`=`wb`|`local+wb`|`local`；`intentConfidence`；`coverageBlocked`。

- 默认 `planSource=wb`；本地主实体护栏合并时为 `local+wb`；模型失败/无额度才是 `local`。
- **本地不做题型解读**：不灌「科学与哲学 / UP主 / 业务与沿革 / 功能与评价」等模板；本地回退仅保留主语 + 去问句壳的最小检索面，调查面由 WorkBuddy 规划。
- `extractUserAspects`：有主实体时，把「早期视频和生平经历」拆成 aspects；**禁止**把普通 `和` 当成 A/B 对比；**禁止**把「什么是」标成 aspect。
- 有 aspects 时 facets 仅用 `主实体 + 方面`（用户原词），不追加 bilibili/UP主。
- 首轮漏斗过稀（`relevantHits=0` / `pickedHits` 空）且仍有 repair+search+model 额度时，一次 `model_rewrite` 补搜；失败再落启发式补查。
- 覆盖门闩：review 后若面失败（`relevant=0` / `0 facts` / shallow），用共享 `repairRounds` 做**方面绑定**补搜；仍不足则 `coverageBlocked=true`（缺口进 metrics，不成稿套话）。有 aspects 时不把 repair 预算提前耗在 relevance_miss。
- 漏斗：`rawHits → relevantHits → pickedHits → fetchAttempt`；`fail_open_relevance` 记入 dropReasons/trace。

## 基线

`scripts/research-fixtures.json` + `npm run test:research-baseline`  
无应用 IPC 时 `qualityCompare: "未完成"`，不得用 mock 冒充质量结论。

## ResearchDocument（成稿中间层）

模型成稿输出 **JSON**（`ResearchDocument`），程序校验后作为唯一内容真相；`report.md` / `report.html` / 预览同源自 `documentToMarkdown` / `documentToHtml`。

**分析先行 + 诚实大胆**：合成提示要求大胆组织已抓材料写清理解框架与行动思路；禁止编造；禁止「无法直接回答 + 仍待核实 + 调研限制」三板斧与「结论仅基于所列来源」类套话。报告主路径：`title → 直接回答 → blocks`；来源与生成时间收进 **附录 / 页脚**。

| 字段 | 说明 |
|---|---|
| `title` | 报告标题 |
| `executiveAnswer` | `{ text, sourceIds }` 直接回答 |
| `blocks[]` | 自由组合块（见下） |
| `claims[]` | 关键结论；`confirmed` **仅程序**根据有效 `sourceId` 设定 |
| `uncertainties[]` / `limitations[]` | 仅具体、可核验的缺口；程序默认 bound note 进 `metrics.sourceBoundNote`，不进可见 limitations |
| `sources` | **程序附加**（id/title/url/readState）；忽略模型自带列表 |

允许的 `blocks[].type`：`paragraph` | `bullets` | `comparison` | `steps` | `timeline` | `risk` | `evidence` | `quote` | `faq` | `decision` | `limitations`。

解析：`extractJsonObject` 扫描最外层 `{}`（忽略字符串内括号）；失败则 `markdownToLegacyDocument` 回退，并记：

- `metrics.documentMode`: `structured` | `legacy_fallback`
- `metrics.parseFailureReason`: `no_json` | `validate_error` | …
- `metrics.insufficientEvidence`: 有来源但无有效引用证据
- `metrics.depth` / `metrics.sourceBoundNote` / `metrics.authorityDig`：页脚元数据

### HTML 安全边界

- 文本先 `escapeHtml`；`mdFragmentToHtml` **只生成**程序允许的标签（`p/ul/li/strong/code/table/tr/th/td/a[href^=https?]/h3/span.cite` 等）
- 模型输入中的 `<script>` / `onclick` / `<style>` / `<iframe>` / 原始 HTML **不得**重新成为标签
- 禁止模型输出完整 HTML 页面或脚本；导出 HTML 内联样式仅服务独立打开的 `report.html`

### 预览

工作区 `report.md` / `report.html` 分别调用 `renderMarkdown` / `renderHtml`（优先 `result.document`）；嵌入预览剥掉外层 chrome，块样式由 `.ha2-research-html-frame` 提供。

## 文件

| 层 | 路径 |
|---|---|
| 前端 | `src/js/features/now/home-research.js` |
| UI | `home-agent-v2.js` + `home-agent-v2.css` |
| Rust | `src-tauri/src/research/`（搜索/抓取/导出） |
| 测试 | `scripts/test-home-research.mjs` |
| 基线 | `scripts/research-fixtures.json`, `scripts/research-baseline.mjs` |
## ModelGateway routing

Research model calls go through OneToneModelGateway rather than calling a
provider-specific IPC from the research pipeline. The default route is
softpad_our_freemodel, which uses cmd_assist_model_chat and the existing
Soft Pad provider rotation. If the managed route is unavailable, the gateway
falls back to WorkBuddy. User-configured OpenAI-compatible providers use the
Rust-side cmd_model_provider_chat command; API keys are stored outside the
webview and are never included in snapshots, traces, or reports.

Each call carries a purpose (intent, planning, review, repair, or synthesis)
so routing can later be configured per workload without changing the research
state machine.

