# 多 Agent 会话整合台 · 落地策略与首页方案

> 目标：让用户**不打开任何一个 agent**，就能看到「谁在跑、跑到哪、卡在哪、花了多少、上次做到哪、下一步干什么」  
> 调研基准日：2026-10-04 ｜ 本机实勘：`C:\Users\pstem`（12 个 agent 真实落盘）+ 3 份外部调研  
> 配套文档：`research-cli-agents.md`、`research-ide-desktop.md`、`research-github-solutions.md`  
> 配套工具：`scripts/probe-agent-dbs.py`（只读探测各 agent 落盘结构，可直接跑）

---

## 〇、一句话结论

**不要做"历史浏览器"，要做"作战指挥台"。**

现有 GitHub 生态（ccusage 18.9k★、cass 1.1k★）已经把「事后检索 + 成本统计」做完了，但全是 CLI/TUI。  
真正的空白是**实时态**：`正在跑的会话` + `需要你决策的阻塞` —— 而这恰好是「不用打开 agent 查看」这条需求的第一痛点。  
所以首页的第一屏必须是 **Living Now（运行中）+ Needs You（等你处理）**，历史检索退到第二屏。

---

## 一、现状盘点：你提到的 6 类信息源，其实是 3 个时态

你列举的「agents / hooks / 上次记录 / state.vscdb / 历史输入 / 操作记录」看似平铺，实则分属三个完全不同的**数据新鲜度层级**。  
**这个分层决定了首页的分区设计，也决定了采集成本** —— 是整个方案的地基。

| 时态                   | 新鲜度 | 包含你提到的                     | 数据源（已实勘）                                                                                                                                                                                                                                                                                                          | 采集方式                                  | 成本             |
| -------------------- | --- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------- |
| **实时态**<br />Live    | 秒级  | hooks、进程心跳、正在跑的任务          | Claude hooks（**33 事件**，payload 带 `transcript_path`）<br />Gemini hooks（8 事件）<br />WorkBuddy `sessions/*.json`（`pid`+`lastHeartbeat`，实测 7 个）<br />Codex `thread_realtime_items` 表（实测 0 行，预留）                                                                                                                        | hook HTTP handler<br />+ 进程/心跳轮询      | **中**（需装 hook） |
| **近时态**<br />Recent  | 天~月 | 上次记录、历史输入、state.vscdb、会话正文 | Claude `~/.claude/projects/**/*.jsonl`（**30 天滚动删除**）<br />Codex `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`（**zstd 压缩**）+ 6 个 sqlite<br />WorkBuddy `workbuddy.db.sessions`（实测 3 行，含 title/cwd/model/usage）<br />Cursor `state.vscdb`（**实测 7.6 GB / 296,849 行 KV**）<br />Qoder `main.sqlite`（73 表，**自带 FTS5**） | 文件 watcher + 增量 tail<br />SQLite 只读快照 | **低**（纯读文件）    |
| **恒久态**<br />Durable | 永久  | 操作记录、记忆、审计                 | WorkBuddy `audit-log/*.jsonl`（**哈希链** `prevHash`+`hash`，防篡改）<br />`.workbuddy/memory/*.md`、`.claude/projects/*/memory/`<br />Git commit / worktree / diff                                                                                                                                                         | 一次性导入 + 增量 append                     | **极低**         |

> 💡 **这是本方案最重要的认知**：把三者混在一张表里轮询，一定卡死（Cursor 7.6GB 全表扫一次就几秒）。  
> 正确做法是**三套采集器、三种刷新频率、一张统一的 Session IR 表**。

---

## 二、可得性矩阵（本机实测 + 外部调研合并）

评级说明：**A** = 明文可读、schema 稳定 ｜ **B** = 明文但表名/格式会变 ｜ **C** = 只能拿到用户提问 ｜ **D** = 加密，不可读

| Agent                                    | 形态  | 落盘位置（Windows 实测）                                                         | 格式                             | 能拿到什么                                                                                     | 评级          | 首页可用性             |
| ---------------------------------------- | --- | ------------------------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------------------- | ----------- | ----------------- |
| **WorkBuddy**                            | 桌面  | `~/.workbuddy/workbuddy.db` + `sessions/` + `audit-log/`                 | SQLite + JSON + JSONL          | **最全**：会话元数据、token 用量、进程心跳、**哈希链审计日志**                                                    | **A**       | ⭐⭐⭐ 自家源，P0        |
| **Claude Code**                          | CLI | `~/.claude/projects/<slug>/*.jsonl`                                      | JSONL                          | 完整对话 + `slug`/`cwd`/`gitBranch`/`cost-state.totalCostUSD`                                 | **A**       | ⭐⭐⭐ P0            |
| **Codex CLI**                            | CLI | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` + `state_5.sqlite`        | JSONL(zstd) + SQLite           | 27 线程 / 200 turns / 1183 items / `token_usage_record`                                     | **A**       | ⭐⭐⭐ P0            |
| **Antigravity**                          | IDE | `~/.gemini/antigravity/conversations/*.db` + `brain/**/transcript.jsonl` | SQLite + JSONL                 | 会话永不删除，含 `transcript.jsonl` 全量                                                            | **A**       | ⭐⭐ P1             |
| **Cursor**                               | IDE | `%APPDATA%\Cursor\...\state.vscdb`                                       | SQLite KV                      | **7.6GB / 177,288 bubbleId + 110,426 agentKv + 169 composerData**；`composerHeaders` 有项目路径 | **A**（体积危险） | ⭐⭐ P1，需限流         |
| **Qoder CN**                             | IDE | `%APPDATA%\com.qodercn.app.stable\main.sqlite`                           | node:sqlite（明文）                | 73 表，含 `chat_session_search_fts`（**官方就带全文索引**）                                            | **B**       | ⭐⭐ P1             |
| **Gemini CLI**                           | CLI | `~/.gemini/tmp/<hash>/chats/session-*.jsonl`                             | JSONL                          | 完整对话 + tokens；**项目 hash 不可逆**                                                             | **A-**      | ⭐⭐ P1             |
| **opencode**                             | CLI | `opencode.db`                                                            | SQLite（Drizzle）                | schema 最规整，有官方 `export` 命令                                                                | **A**       | ⭐ P2              |
| **Kimi Code**                            | CLI | `~/.kimi-code/sessions/`                                                 | JSON+JSONL                     | 有 `/export` 出 Markdown                                                                    | **A-**      | ⭐ P2              |
| **VS Code 系**<br />Continue/Cline/Roo    | 扩展  | `.continue/sessions/*.json` 等                                            | 纯 JSON                         | 最友好                                                                                       | **A**       | ⭐ P2              |
| **Trae CN / SOLO**                       | IDE | `.../ModularData/ai-agent/database.db`                                   | **SQLCipher 4**（实测文件头非 SQLite） | ❌ 正文不可读；旧版仅 `input-history` 拿得到 prompt                                                    | **C/D**     | ⚠️ 降级：只做 prompt 流 |
| **MiniMax / Hermes / Marvis / OpenClaw** | 桌面  | `~/.minimax`（仅 skills）、`~/.openclaw`（gateway/logs）                       | 未公开                            | 未发现会话落盘目录                                                                                 | **D**       | ❌ 标记为"未接入"        |

### 三个必须知道的坑（实勘得出）

1. **Cursor 的 `state.vscdb` 有 7.6 GB**。绝对不能全表扫。必须走 `composerHeaders` 表拿索引 → 按需点查 `cursorDiskKV`；且**只用 Backup API / `immutable=1` 只读打开**，绝不写源库。
2. **Claude Code 默认 30 天清理**（`cleanupPeriodDays`），`settings.json` 里设 `0` = **完全不写盘**（很多人误解为永久保留）。所以**必须自建归档**，否则历史会静默消失。
3. **Trae 两个版本都是 SQLCipher 加密**（实测文件头 ≠ `SQLite format 3\0`），官方也确认导出的 db 打不开。对 Trae 只能承诺"用户提问时间线"，**不要写进宣传物料**。

---

## 三、竞品空白（决定首页怎么差异化）

| 维度                    | ccusage<br />(18.9k★) | cass<br />(1.1k★) | Mantra<br />(闭源) | **我们要做的** |
| --------------------- | --------------------- | ----------------- | ---------------- | --------- |
| 会话全文检索                | ❌                     | ✅ TUI             | ✅                | ✅ **GUI** |
| 跨 agent 统一时间线         | ❌                     | ❌                 | ✅                | ✅         |
| **实时状态 / 阻塞提醒**       | ❌                     | ❌                 | ❌                | ✅ **空白**  |
| 成本统计                  | ✅                     | 部分                | ✅                | ✅         |
| Cursor / Trae / Qoder | ❌                     | 部分                | ❌ Trae           | ✅         |
| Git 因果对齐              | ❌                     | ❌                 | ✅ Time Travel    | ✅         |
| MCP server            | ❌                     | ✅                 | ✅                | ✅         |

> ⚠️ **许可证纪律**：ccusage（NOASSERTION）、cass（许可证存疑）、langfuse（NOASSERTION）  
> **只借鉴数据契约与设计，不复制源码**。优先复用 MIT/Apache-2.0 的 splitrail、sessiongrep、`raine/claude-history`。

**差异化三板斧**：① 实时态「Needs You」阻塞队列（无人做）② 桌面 GUI 统一时间线（cass 是 TUI）③ Git 因果对齐（对抗 Mantra）。

---

## 四、首页方案（第一屏定生死）

### 4.1 设计原则

> **首页回答的是"现在和接下来"，不是"过去"。**  
> 过去 = 检索框（一个入口足够）；现在 = 运行中 + 阻塞；接下来 = 续跑入口。

### 4.2 首页分区（自上而下，按注意力权重）

```
┌────────────────────────────────────────────────────────────────────┐
│ ① 顶栏   [汇 Converge]   🔍 跨 agent 搜索(⌘K)    数据源健康 ●●●○  设置 │
├────────────────────────────────────────────────────────────────────┤
│ ② KPI 条   运行中 2  ·  等你处理 3  ·  今日 ¥18.4  ·  本周会话 47       │
├───────────────────────────────────────┬────────────────────────────┤
│ ③ Living Now（左，主区 62%）            │ ⑤ 今日时间线（右 38%）        │
│   正在跑的会话卡片                      │   项目 × 时间 泳道热力图      │
│   ┌─────────────────────────────┐      │   ┌──────────────────┐   │
│   │ ● Claude   voice-pilot      │      │   │ 09 ▓▓            │   │
│   │   "重构首页布局"             │      │   │ 10 ▓▓▓▓▓▓▓░     │   │
│   │   第 7 轮 · 正在写文件        │      │   │ 11 ▓▓▓░░        │   │
│   │   [查看] [接管] [中断]        │      │   │ 12 ▓▓           │   │
│   └─────────────────────────────┘      │   └──────────────────┘   │
│                                        │                            │
│ ④ Needs You（阻塞队列，红色优先级）      │ ⑥ 成本 / 额度                │
│   🔴 Cursor 等待授权 rm -rf node_modules │   今日 ¥18.4  ▁▂▄▆▃       │
│   🟡 Codex 上下文 92%，建议 compact      │   本月 ¥412 / ¥600          │
│   🔵 Claude 会话 30 天后过期，归档？      │   按 agent 拆分条形图        │
├───────────────────────────────────────┴────────────────────────────┤
│ ⑦ 继续上次的工作（按项目聚合的卡片网格）                                │
│   ┌──────────────┬──────────────┬──────────────┬──────────────┐    │
│   │ voice-pilot  │ WorkBuddy    │ dsh-market   │ onetone      │    │
│   │ 3 个 agent   │ 1 个 agent   │ 1 个 agent   │ 2 个 agent   │    │
│   │ 2 小时前      │ 昨天          │ 3 天前        │ 上周          │    │
│   │ "重构首页…"   │ "C盘清理…"    │ "选品分析…"   │ "语音岛…"     │    │
│   │ [续跑 ▸]     │ [续跑 ▸]     │ [续跑 ▸]     │ [续跑 ▸]     │    │
│   └──────────────┴──────────────┴──────────────┴──────────────┘    │
├────────────────────────────────────────────────────────────────────┤
│ ⑧ 上下文包 / 记忆（可一键注入任意 agent）                              │
│   最近结论 · 项目约定 · [打包为 CLAUDE.md] [复制到剪贴板]              │
└────────────────────────────────────────────────────────────────────┘
```

### 4.3 每个区的数据来源（确保可落地，不是画饼）

| 区               | 数据      | 来源（已验证）                                                                                                                        |
| --------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------ |
| ① 搜索            | 全文 + 语义 | 自建 SQLite **FTS5**；语义用本地 MiniLM 嵌入，**模型缺失自动降级为词法**（cass 同款策略）                                                                  |
| ② KPI           | 计数 + 成本 | 索引库聚合；成本口径归一（各家 `cached` 是否含在 `input` 内不一致 → 加 `cached_is_subset_of_input` 标志）                                                 |
| ③ Living Now    | 活跃会话    | Claude hooks `SessionStart/PreToolUse/PostToolUse`；WorkBuddy `sessions/*.json` 的 `lastHeartbeat`；Codex `thread_realtime_items` |
| ④ **Needs You** | 阻塞      | Claude hooks `PermissionRequest` / `Notification` / `StopFailure` / `PostToolUseFailure`；Gemini 无等价事件 → 用文件大小+时长启发式兜底          |
| ⑤ 时间线           | 会话时间分布  | 索引库 `GROUP BY hour, project`                                                                                                   |
| ⑥ 成本            | token/钱 | Claude `cost-state.totalCostUSD`；Codex `token_usage_record.usage`；WorkBuddy `session_usage.used`                               |
| ⑦ 续跑            | 最近会话    | 索引库按 `project_key` 聚合，取 `updated_at` 最近；续跑 = 拼出 `claude --resume <sid>` / `codex resume` / 打开 IDE                              |
| ⑧ 上下文包          | 记忆      | `.workbuddy/memory/*.md`、`~/.claude/projects/*/memory/`、会话摘要 → 生成 `CLAUDE.md` / 剪贴板                                            |

### 4.4 首页三条硬规则

1. **只读，永不写源库**。SQLite 一律 `mode=ro&immutable=1`；Cursor 走 Backup API 快照；快照后 `PRAGMA quick_check` 必须返回 `ok`。
2. **任一数据源失败，其他照常渲染**。Card 上显示「该源暂不可用」，绝不白屏、绝不阻塞启动。
3. **未知字段只 warn 不崩**。Claude 实测有文档未载的 `atis-latch`/`queue-operation`/`cost-state`；Codex 有 `world_state`/`compacted`。渲染策略 = 已知 type 精细渲染 + 未知 type 保留原文。

---

## 五、P0 → P2 落地策略

### 🥇 P0：最小可用闭环（目标 2~3 周，先跑通「不用打开就知道」）

**范围：只做 3 个 A 级自家/CLI 源 + 近时态 + 恒久态，不碰实时态。**

| 项        | 内容                                                                                                                                        |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **数据源**  | ① WorkBuddy（`workbuddy.db` + `sessions/` + `audit-log/`）② Claude Code（`~/.claude/projects`）③ Codex（`sessions/*.jsonl` + `state_5.sqlite`） |
| **不做**   | ❌ Cursor 7.6GB ❌ hooks 安装 ❌ 语义检索 ❌ MCP ❌ Git 对齐                                                                                           |
| **核心交付** | Session IR 归一化 → SQLite 索引（FTS5）→ 只读探测 → 首屏「时间线 + 检索 + 项目卡 + 成本」                                                                          |

**技术骨架（4 层，层间解耦）**

```
① Adapter 层  每 agent 一个 adapter，统一输出 Session IR
              Session { id, agent, title, cwd, projectKey, createdAt, updatedAt,
                        model, status, usage{input,output,cached,costUSD},
                        messages[{role, ts, text, toolCalls[]}], rawRef }
② Index 层    本地 SQLite（WAL）+ FTS5 虚表 + 增量游标表
              file_cursor(path, byteOffset, mtime, rowid)  ← 决定"下次从哪读"
③ Safe-IO 层  SQLite 只读快照（backup API → immutable=1）
              JSONL 按 byteOffset tail；zstd 解压（Codex）
④ UI 层      首页 8 区（先做 ②⑤⑥⑦，③④留占位卡）
```

**P0 验收标准（可量化）**

- [ ] 首屏 < 1.5s 出数据（三源全量首次索引 < 30s）
- [ ] 搜一个关键词，跨 3 个 agent 结果按时间混排
- [ ] 关掉所有 agent 进程后仍能完整浏览历史（证明不依赖运行时）
- [ ] 全程只读：跑完校验源目录 mtime/hash 无变化
- [ ] 单源损坏时其余正常渲染

**P0 关键决策**

- **路径编码**：Windows 下 `E:\voice-pilot` → Claude 是 `E--voice-pilot`；Gemini 是**不可逆 hash** → 必须自建映射缓存表。
- **Codex 主键**：统一用 `thread.id`（= `session_meta.id` = 文件名末段 UUID），**不要用 `session_meta.session_id`**（历史上有混淆）。
- **自建归档**：Claude 30 天会删。首次扫描立即快照入库，这是产品的隐性价值 —— **你在替用户保住历史**。

---

### 🥈 P1：差异化（目标 +3~4 周，做竞品没有的）

| 优先级      | 功能                                  | 说明                                                                                                                  |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **P1-1** | **实时态 · Living Now + Needs You** ⭐  | 装 Claude hooks（33 事件，payload 自带 `transcript_path`）+ Gemini hooks（8 事件）；WorkBuddy 读进程心跳。**这是首页的灵魂，也是唯一无人做的区**        |
| **P1-2** | **Git 因果对齐**                        | 会话锚定到 commit / worktree / diff。回答「这个 commit 是哪次会话改的」。对抗 Mantra 的关键牌                                                 |
| **P1-3** | **Cursor / Qoder / Antigravity 接入** | Cursor 走 `composerHeaders` 索引 + 按需点查（**严禁全表扫 7.6GB**）；Qoder 按 `LIKE 'chat_sessions_v%'` 动态定位表名；均为 best-effort，失败即降级 |


| **P1-4** | **成本归一化 + 预算告警** | 对齐 ccusage 口径；各家 cached 是否重复计入 input 不一致 → 归一表加标志位 |
| **P1-5** | **MCP server** | 让任意 agent 能检索自己的历史。2026 年既定范式，不做就缺一半价值 |

**P1 关键风险与对策**
- Cursor `state.vscdb` 无官方 schema，社区逆向 → Cursor 一升级就碎。对策：adapter 加版本探测，失败时在 UI 明确标注「Cursor 版本不兼容」，**不作为核心卖点承诺**。
- hooks 需要用户主动安装（改 `settings.json`）→ 做成**一键安装向导 + 明确授权说明**，默认关闭。

---

### 🥉 P2：护城河（目标 +6~8 周，可选）

| 功能 | 说明 |
|---|---|
| **语义检索** | 本地 MiniLM 嵌入 + int8 reranker，**模型缺失自动降级为 FTS5**（不联网、不强制下载） |
| **多机 / 团队同步** | 目前仅 token-monitor 做了多设备；团队共享/评审/归档是真空 |
| **脱敏打包** | 密钥、home 路径、内网地址自动脱敏后导出证据包（cass `pack` 同款） |
| **OTel 导出** | 按 `gen_ai.conversation.id` 导出 OTLP。⚠️ semconv 仍是 **Development + 零 tagged release**，**只能做可选导出，不能当硬依赖** |
| **Trae 降级方案** | 只做「用户提问时间线」，明确标注「回答不可本地获取」。若 Trae 官方开放导出再升级 |
| **opencode / Kimi / VS Code 系** | adapter 扩展，成本低（纯 JSON 或规整 SQLite） |

---

## 六、落地排期与风险清单

| 阶段 | 周次 | 交付物 | 最大风险 |
|---|---|---|---|
| P0-a | W1 | Session IR + 3 个 adapter + 只读探测脚本 | Codex zstd 解压、双写不一致 |
| P0-b | W2 | SQLite 索引 + FTS5 + 增量同步 | 增量游标与文件轮转（rollout 归档变 `.jsonl.zst`） |
| P0-c | W3 | 首页（时间线/检索/项目卡/成本）+ 打包 | Cursor 暂不接，避免 7.6GB 拖垮首屏 |
| P1-a | W5 | hooks 采集 + Living Now + Needs You | 用户不愿装 hooks → 提供"仅近时态"降级模式 |
| P1-b | W7 | Git 对齐 + Cursor/Qoder adapter + MCP | Cursor schema 变更 |
| P2 | W12+ | 语义检索 + 脱敏 + 多机 | 模型体积/下载体验 |

**必须写在 README 的三条免责**：
1. 全程只读，不修改任何 agent 的数据；Cursor/Trae 相关源为社区逆向，可能随版本失效。
2. Claude Code 历史 30 天滚动删除 → 本产品归档，**但归档不等于官方备份**。
3. Trae 正文不可读（SQLCipher），仅提供提问时间线。

---

## 七、附：可立即复用的产物

| 文件 | 用途 |
|---|---|
| `scripts/probe-agent-dbs.py` | 只读探测本机 12 个 agent 的 SQLite 结构与体积；自动识别 SQLCipher 加密；已验证可直接运行 |
| `docs/research-cli-agents.md` | Claude(33 hooks 事件全表) / Codex / Gemini / opencode / Kimi / Droid / Crush 的落盘 schema |
| `docs/research-ide-desktop.md` | Cursor(含 3.0/3.16 版本演进与可用 SQL) / Trae / Qoder / Antigravity / VS Code 系 + WAL 安全读取 |
| `docs/research-github-solutions.md` | 30+ 竞品仓库 star/许可证/可借鉴点 + 空白分析 |

**立即可执行的下一步**：跑 `python scripts/probe-agent-dbs.py` 确认目标机器的源分布 → 按 P0-a 写第一个 adapter（建议从 WorkBuddy 开始，schema 最干净且有哈希链审计日志）。
