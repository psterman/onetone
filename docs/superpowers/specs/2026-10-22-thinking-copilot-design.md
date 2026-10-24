# 思路副驾（Thinking Copilot）设计规格

> 状态：**已锁定产品方向**；工程实现待开工（目标窗口：下月）。
> 相关约束：[简报系统四项锁定](./2026-10-06-brief-system-constraints.md)、[Agent 记忆与协同](./2026-10-02-agent-session-memory-coordination-design.md)
> 现有触点：整理方案 [`home-prompt-prep.js`](../../../src/js/features/now/home-prompt-prep.js)（确定性装订、不用 LLM 改写）、动作历史分析 [`analyze.rs`](../../../src-tauri/src/action_history/analyze.rs)（最小 DeepSeek 调用证明）

---

## 1. 结论（一句话）

做 OneTone 的**思路副驾 / 第二视角**：主 Agent 负责开发执行；副驾负责质疑、查漏、补方案、组织证据与寻找反例。用户采纳后，建议才进入简报或交给主 Agent。

**不做** QZ 整套浏览器 Agent 克隆；**不做**又一个通用聊天框；**不做**副驾自动操作桌面。

| 方向 | 战略匹配度 |
|---|---|
| 跨 Agent 第二视角 + Skills + 结构化采纳 | ~8/10 |
| 再做一个通用聊天框 / 自动点点点 | ~3/10 |

---

## 2. 为什么值得做（与竞品边界）

计划模式、Skills、子 Agent 正在成为编码工具标配（Copilot Plan / Custom Agent、Cursor Ask/Plan）。「再提供一个会制定开发计划的模型」本身没有壁垒。

OneTone 的差异化应是：

- 跨 Codex、Claude、Cursor 等 Agent，而不是依附其中一个。
- 可刻意使用不同模型提供独立意见，减少同源偏差。
- 同时看见简报、项目记忆、Checkpoint、当前 Agent 状态和用户选中的材料。
- 把建议转换为可投递给任意 Agent 的结构化简报。
- 保留建议的来源、采纳情况和最终结果，形成项目级决策记忆。

这接近 Codex Side Chat「主会话拥有工作，侧会话帮助理解工作」，但扩展成**跨 Agent 的外部副驾**。

### 2.1 从 QZ 借鉴什么 / 不借鉴什么

参考：[QZ README](https://github.com/alibaba/qz-browser-agent)、[架构](https://github.com/alibaba/qz-browser-agent/blob/main/docs/architecture.md)、[Capabilities/Skills](https://github.com/alibaba/qz-browser-agent/blob/main/src/capabilities/README.md)

| QZ 能力 | OneTone 应借鉴的形态 |
|---|---|
| 持久 Goal、验收标准、Checkpoint | 简报中的目标、约束、完成条件和决策记录 |
| 子任务与并行研究 | 竞品、技术路线、风险等独立调研分支（后期） |
| Skills | 软件工程审查、反方评审等**思维模板** |
| 来源、数据表、文件产物 | 有出处的证据卡、决策表 |
| 运行中追问与 Steering | 用户随时改变分析重点 |
| 成功流程保存为 Skill | 有效思考方式沉淀为团队方法（后期） |

**不复制**：浏览器 DOM/CDP 执行内核。QZ 是 Chrome MV3 + TypeScript；OneTone 是 Windows Tauri/Rust。QZ 更适合作为可选「联网研究执行器」，经 CLI/MCP 接入，而不是内嵌。

---

## 3. 产品边界（锁定）

### 3.1 是 / 不是

| 是 | 不是 |
|---|---|
| 质疑、查漏、补方案、标证据 | QZ / CDP / 浏览器执行内核 |
| 出厂内置 Skills + 可一点就跑的提示卡 | 无限滚动的普通聊天窗口 |
| 结构化建议卡 + 用户显式采纳 | 用 LLM 替换确定性装订 |
| 只读上下文（有限眼睛） | 静态「万能答案库」 |
| 建议标「副驾建议 / Agent 生成」 | 静默写入用户正文 |
| 用户确认后走现有 handoff | 副驾自动操作 UI / 文件 / shell / 静默投递 |

### 3.2 眼睛 vs 手脚

| 能力 | 副驾是否拥有 | 说明 |
|---|---|---|
| **有限眼睛（只读）** | MVP 有 | 经用户勾选：当前简报、已选素材、项目记忆/checkpoint。后续可加 Diff / 会话摘要，仍只读。 |
| **手脚（自动操作）** | **永不作为副驾核心** | 不点击 UI、不改文件、不跑 shell、不投递主 Agent、不控制浏览器/桌面。执行留给主 Agent。 |
| **委派眼睛（可选研究）** | 后期 | QZ 等作为联网研究插件，仅在「竞品参考」开启时委派，回收来源表。 |

理由：

1. **分工**：副驾一旦有手脚，就变成第二个执行 Agent，差异化塌缩。
2. **信任**：只读建议 + 用户采纳，符合简报「素材只读 / 派生标来源 / 用户文字为主体」。
3. **事故面**：桌面自动操作难回滚；投递链路已在主路径上。
4. **「交给主 Agent」≠ 副驾动手**：结果卡可生成追问文案，**用户点确认**后再 handoff。

### 3.3 与简报系统的关系

锁定规则继续有效（见 `2026-10-06-brief-system-constraints.md`）：

- 原始素材只读；副驾输出是**派生内容**，必须标来源类型 `Agent 生成` / 文案「副驾建议」。
- `assembleMarkdown` 保持机械装订；副驾不改写装订器。
- 未经用户确认，建议不得进入简报正文主体。

---

## 4. 交互形态

### 4.1 入口

挂在现有**整理方案**工作台（`home-prompt-prep` 的 sheet / action bar），按钮文案：**让副驾看看**。不新开一级导航。

复用现有 hpp scrim + drawer 模式（仿 channel / handoff drawer）。

### 4.2 两层卡片（必须区分）

1. **Skill 提示卡（入口层，始终可见）**  
   短标题 + 一句「何时用」+ 预计读什么上下文。一点即跑。空简报也可先点「问题框定」。
2. **结果建议卡（产出层，跑完才出现）**  
   针对本次材料生成的结构化条目；可采纳 / 作约束 / 暂不采纳。  
   **不是**仓库里预置的死答案。

### 4.3 抽屉线框

```text
[让副驾看看]  → 侧栏抽屉

┌─ 思路模板（Skill 提示卡网格）─────────────────
│  [问题框定]  [查漏补缺]  [备选方案]
│  [反方评审]  [计划审查]
│  （竞品参考：需联网 · 稍后 — disabled）
└──────────────────────────────────────────────

分析方式：由所选 Skill 决定（单选）

本次允许读取：
✓ 当前简报
✓ 已选素材
✓ 项目记忆和 checkpoint
□ 当前 Diff        （MVP 灰掉）
□ 历史对话          （MVP 灰掉）
□ 联网研究          （MVP 灰掉）

[开始分析] → 结果区：结构化建议卡 + 动作
```

### 4.4 结果固定 8 段

1. 我理解的目标  
2. 隐含假设  
3. 缺失信息  
4. 至少两个替代方案  
5. 工程风险与遗漏  
6. 验收、测试、回滚清单  
7. 需要用户决定的问题  
8. 证据、来源与不确定性  

### 4.5 每条建议的动作

| 动作 | MVP | 说明 |
|---|---|---|
| 采纳到简报 | 做 | 写入 `derived[]`，带来源标签 |
| 作为约束 | 做 | 追加约束区，不覆盖用户正文 |
| 暂不采纳 | 做 | 仅记录或忽略 |
| 交给主 Agent 追问 | 占位 | 生成文案，用户确认后 handoff |
| 保存为 Skill | 占位 | 后期闭环沉淀 |

---

## 5. 内置 Skills（MVP 全量自带）

Skill 是**思考方式**（角色 + 强制产出结构），不是预制解决方案正文。

| id | 提示卡标题 | 何时用 |
|---|---|---|
| `problem-framing` | 问题框定 | 目标还糊、边界不清时先用 |
| `engineering-completeness` | 查漏补缺 | 怕漏测 / 漏迁 / 漏回滚 / 漏安全 |
| `alternative-paths` | 备选方案 | 强制给出 2–3 条不同技术路线 |
| `red-team-review` | 反方评审 | 找反例、失败条件、错误假设 |
| `plan-review` | 计划审查 | 步骤依赖、验证闭环、遗漏文件 |
| `competitor-research` | 竞品参考 | **MVP disabled**（需联网委派） |

每个 skill 的 system prompt **强制**：

- 不同角色视角  
- ≥2 替代方案（适用时）  
- 反证与失败条件  
- 置信度与未知项  
- 禁止编造无出处事实  

避免信息茧房靠的不是「多问一次模型」，而是强制加入：不同角色、（后期）不同模型、反证、官方/竞品证据、置信度、用户采纳记录。

---

## 6. 工程落地（MVP）

### 6.1 架构

```text
home-prompt-prep UI
  → context pack（只读、勾选）
  → cmd_copilot_review IPC
  → skill 模板 + llm_provider（sync chat）
  → 结构化 JSON schema
  → 结果建议卡 UI
  → 用户采纳 → draft.derived[] / constraints
  → assembleMarkdown（仍确定性，含「副驾建议」段）
```

### 6.2 前端

- 新模块建议：`src/js/features/now/home-copilot-drawer.js`
- Skills 目录建议：`src/js/features/now/copilot-skills.json`（`id / title / whenToUse / systemPrompt / outputSchema`），前后端共用，避免文案分叉
- 样式：`src/css/home-copilot.css`，跟 hpp drawer，不另起设计体系
- 采纳 API：`appendDerivedBlock({ source: 'copilot', skillId, text, at })`；**禁止**直接覆盖 `draft.body`

### 6.3 后端

- 从 `action_history/analyze.rs` 抽出可复用 `llm_provider`（`ChatRequest { model, system, user, json_mode }` → sync HTTP）
- Auth：MVP 复用 Claude settings 中的 DeepSeek 解析；接口留 `provider` 字段
- IPC：`cmd_copilot_review`，入参 `{ skillId, contextPack, locale }`；失败返回 `ok: false` + reason
- MVP **不同步做**：流式、通用 tool-calling loop、凭据 vault

### 6.4 上下文打包（只读）

默认允许：当前简报（title/body + assembled 摘要）、已选素材短摘录、项目记忆/checkpoint（无则 UI 标「暂无」）。

默认禁止且灰掉：Diff、历史对话全文、联网。

### 6.5 采纳语义

```text
用户正文 (draft)      ← 只手改
派生块 derived[]      ← 副驾采纳；provenance: copilot；类型: Agent 生成
装订 assembleMarkdown ← 仍确定性；含 derived 时加「副驾建议」标题段
```

### 6.6 测试

- `scripts/test-home-copilot.mjs`：入口、Skill 卡可发现、默认权限、禁用联网/Diff、采纳不覆盖 body、schema 字段
- Rust：skill 拼装 + JSON schema fixture（无真 API key）

---

## 7. 分阶段路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| **1. MVP：第二意见抽屉** | 通用模型 Provider、5 个只读 Skills + 提示卡、结构化输出、采纳进简报；默认不执行、不联网 | **下月优先** |
| **2. 研究增强** | QZ（或同类）作可选本地连接器；仅「竞品参考/资料核验」委派；回收来源与表格 | 未开工 |
| **3. 闭环沉淀** | 记录「建议 → 是否采纳 → 发给哪个 Agent → 是否有效」；有效流程可保存为 Skill | 未开工 |
| **4. 跨模型审议** | 高风险/高复杂度任务允许主 Agent 与副驾用不同模型；控制成本与噪音 | 未开工 |

全程**不**把「副驾自主操作桌面」列入路线图核心。

---

## 8. 现有代码缺口（开工前已知）

| 已有 | 缺口 |
|---|---|
| 确定性装订、简报约束文档 | 副驾 UI / Skills 目录 |
| DeepSeek 动作历史分析（硬编码、同步、借 Claude 设置） | 通用 `llm_provider`、流式（后期）、凭据管理 |
| 项目记忆 / checkpoint 设计文档 | 副驾可读的稳定 API（无则 MVP 跳过并标「暂无」） |
| Agent handoff / 投递链路 | 「交给主 Agent」确认后的追问文案桥接（可占位） |

---

## 9. 开工检查清单（下月用）

- [ ] 确认 DeepSeek（或选定 Provider）凭据路径仍可用，或先补最小 provider 配置 UI  
- [ ] 落地 `copilot-skills.json` + 5 个 prompt（含强制结构）  
- [ ] `cmd_copilot_review` + schema 校验  
- [ ] prep 入口「让副驾看看」+ 抽屉（提示卡网格 + 权限 + 结果卡）  
- [ ] `derived[]` 采纳路径，装订段带「副驾建议」  
- [ ] `test-home-copilot.mjs` 绿灯  
- [ ] 手工：无项目/空简报点「问题框定」；有材料点「反方评审」；采纳后正文未被覆盖  

---

## 10. 最终建议（给决策者）

**做「思路副驾」，不做「QZ 克隆」；把 QZ 定位为未来可插拔的联网研究工具。**

保留 OneTone「用户掌方向、Agent 负责执行」的原则，同时形成比单个编码 Agent 更有价值的跨应用第二视角。
