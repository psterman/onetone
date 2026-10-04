# OneTone「Agent 台面」聚合层：现状盘点、P0–P2 策略与新首页方案

日期：2026-10-04
状态：策略草案，待审阅
证据基础：本机实测（E:\voice-pilot 工作区 + `%USERPROFILE%` 全部 agent 目录）+ 官方文档 + 公开项目核实
约束：本文件只做决策与规划，**不**改生产 `#homeWorkbench`

---

## 0. 结论先行

1. **采集层你已经建了七成。** `agent_install_inventory.rs` 已在探测 15 个 agent；`agent_attention/` 已有 `AttentionState / AttentionCause / SignalSource / Confidence` 与 `raise / clear / public_snapshot`；`agent_memory/` 已有统一 SQLite（`%LOCALAPPDATA%\OneTone\data\agent-memory.sqlite3`）+ checkpoint + home_focus + cursor_adapter；`cmd_agent_home_snapshot` 已存在。**缺的不是"怎么读"，是"读不准时怎么诚实表达"和"桌面端 agent 家族"。**

2. **真正的空白不是 Windows，而是"不接管进程的被动只读采集 + 桌面端 agent 家族"。** 市面上所有成熟方案（Orca / MonoCode / Termexo / YCode / CoDock / Acedia）都**自己用 PTY 拉起 agent**，所以只能看见自己启动的进程。你机器上 WorkBuddy、Marvis、OpenClaw、Qoder、Trae、Cursor 都是**独立桌面应用**，它们一个都看不见。而最接近你思路的开源项目 Wake（只读索引 17+ agent）**明确放弃了 Cursor / Windsurf / Trae**（加密或格式不稳）。

3. **Cursor 不能做地基。** 本机 `~\AppData\Roaming\Cursor\User\globalStorage\state.vscdb` 实测 **7.66 GB**，旁边还有 6.26 GB 的 `.backup`，合计约 **13.9 GB** 单文件。热读取会长时间占 I/O，且 Cursor 运行中该库被锁。只能做"可选的历史导出插件"。

4. **Marvis 是本机唯一有 `approvals` 表和完整 AG-UI 事件流的 agent**（`agui_events` 7376 行，含 `TOOL_CALL_START` / `TOOL_CALL_RESULT` / `RUN_FINISHED`）。这是全机最准的"在等你批准"信号，**应当 P0 优先接入**。

5. **首页不需要推翻 G 方案。** G 的五情境裁决、`≤1 主 CTA`、单一提问框、默认只露语音+按键全部保留；新首页只是在中段**插入一层「Agent 台账」**——这层就是"不用打开 agent 就能看"的本体。

---

## 1. 本机实测：每个 agent 到底能读到什么

> 下表左半部分为本机 `2026-10-04` 实测体积与文件，右半部分为可提取的字段。**"信号强度"是本方案的核心分级。**

| Agent | 实测数据源（体积 / 最新） | 可提取字段 | 官方扩展点 | 信号强度 |
|---|---|---|---|---|
| **Codex CLI** | `.codex/sessions/**/*.jsonl` 27 文件 **41.6 MB**，单文件最大 8.26 MB | `task_started` / `task_complete` / `token_count` / `custom_tool_call(_output)` / `patch_apply_end` / `web_search_end` / `thread_settings_applied` | `notify`；`hooks.<Event>`（含 `PermissionRequest`）；`approval_policy`；`sqlite_home`（**官方 SQLite 状态库**） | **A 级（官方）** |
| **Claude Code** | `.claude/projects/**/*.jsonl` 21 文件 4.5 MB | `assistant` / `user` / `attachment` / `cost-state` / `queue-operation`；逐条 usage | `sessions/`（**运行中会话 = 目录里有文件，退出即删**）；`Notification` hook（`permission_prompt`/`idle`）；`stats-cache.json`（`/usage` 同源聚合）；`claude purge --dry-run` 可当只读探针 | **A 级（官方）** |
| **Marvis** | `.marvis/database/data.db` **13.3 MB** / 16 表；`memory.db`；`memory_vector.db`；`tool_index_vector.db` | `conversations(status,metadata.reminder_status)`、**`approvals(tool_name,status,reason)`**、`agent_activities(status,outcome_status,content)`、`agent_checkpoints(iteration_count,phase)`、`llm_token_usage`(117 行，按模型)、`user_acks`、`agui_events`(7376 行 AG-UI) | AG-UI 原生事件流 + `approvals` 表 = **本机最准的"在等你"** | **A 级（官方 DB）** |
| **WorkBuddy**（腾讯） | `.workbuddy/workbuddy.db` 10 表；`app/polling-lease-*.json`（**每分钟刷新**）；`logs/` 157 文件 70.8 MB | `sessions(id,cwd,title,status,last_activity_at,permission_mode,model,visibility,unread)`、`session_usage(used,size,credit_json)`、`automations` / `automation_runtime_state` | `polling-lease` 的 mtime 心跳 = 免费存活信号；项目已有 `shell_agent_usage/official/workbuddy.rs` 走官方额度 | **A− 级（官方 DB + 心跳）** |
| **OpenClaw** | `.openclaw/state/openclaw.sqlite` 2.1 MB / **108 表**；`agents/main/agent/openclaw-agent.sqlite` 3.6 MB | `acp_sessions`、`audit_events`(227)、`cron_jobs`/`cron_run_receipts`(79)、`agent_database_leases`(20)、`config_health_entries` | `openclaw gateway status`、`openclaw pairing approve` | **A− 级（官方 DB）** |
| **MiniMax Code (MCode)** | `~/.minimax/v2/` 711 文件 **79.9 MB** runtime 日志；`background-tasks/` 675 文件；`memory/`、`agents/`、`plugins/`、`integrations/` | runtime 日志、后台任务输出流、会话目录 | CLI 文档称有 machine-readable output；项目已有 `MINIMAX_APP_TARGET_ID` 探测 | **B 级（落盘推断）** |
| **Qoder CN** | `.qoder-cn/.qoder-app-status.json`(292 B)、`settings.json`、`logs/`、`plugins/`、`.auth/` | app 状态 JSON、日志尾部 mtime | `shell_agent_usage/official/qoder.rs` 已实现 | **B 级（官方状态文件 + 推断）** |
| **Trae CN / SOLO** | `~\AppData\Roaming\Trae CN\User\globalStorage\state.vscdb` 0.3 MB；`TRAE SOLO CN` 0.6 MB；`.trae-cn/` 2929 文件 **115 MB** | 插件表、工作树、事件缓存 | `shell_agent_usage/official/trae.rs` 已实现；`.trae/hooks.json` | **B 级（推断）** |
| **DeepSeek Harness (DSH)** | `.dsh/sessions/session.v4.jsonl.zstd`（**zstd 压缩**）、`storages/*.json`、`profiles/`、`.credentials.yaml` | 会话快照、profile 切换 | 有 `dsh-hook-protocol`（BSD-3）跨 agent hook 协议可参考 | **B 级（需解压）** |
| **Cursor** | `globalStorage/state.vscdb` **7.66 GB** + `.backup` 6.26 GB；`workspaceStorage/<hash>/state.vscdb` 0.6 MB | VSCode 派生 key，**无公开 schema**；混有凭据 | 项目已有 `cursor_local_activity.rs` + `cursor_memory/cursor_adapter.rs` | **C 级（别当地基）** |
| **Gemini / Antigravity** | `.gemini/antigravity/conversation_summaries.db` | 仅摘要 | ⚠️ 免费层已迁至 Antigravity CLI，**硬编码读 `~/.gemini` 会读到另一个产品** | **C 级** |
| **Reasonix / Wxian / CC-Switch** | `.reasonix/sessions/*.jsonl`(3)；`.wuxian-assistant/auto_switch_audit.jsonl` **921 KB**；`.cc-switch/cc-switch.db` 868 KB | 模型切换审计、定价 | — | **旁路（供给/成本侧）** |

### 1.1 信号强度分级（本方案的核心约定）

| 级别 | 定义 | 本机成员 | UI 表达 |
|---|---|---|---|
| **A · 官方信号** | 厂商自己写的状态/审批/运行中标记 | Codex `task_*`+`sqlite_home`、Claude `sessions/`+`Notification`、Marvis `approvals`+`agui_events`、WorkBuddy `sessions.status`+心跳、OpenClaw `openclaw gateway status` | 实心点 ● + 可展开的 evidence 路径 |
| **B · 落盘推断** | 靠 mtime + 尾事件类型 + 日志尾部猜 | MCode、Qoder、Trae、DSH | 半实点 ◐ + 必须显示推断依据与观测时间 |
| **C · 不做地基** | 格式不稳 / 体积失控 / 含凭据 / 属另一产品 | Cursor `state.vscdb`、Gemini | 空心点 ○ + 标"实验性"，仅作可选插件 |

### 1.2 三个必须写进设计的硬约束

1. **过期必须降级。** 一个 agent 30 分钟无任何写入 → 状态从"运行中"降为"疑似停了（17 分钟前）"。**禁止永不变绿的假活。**
2. **只读，且不读凭据。** 所有 SQLite 一律 `file:...?mode=ro` + 忽略 `-wal` 竞争；`auth.json` / `.credentials.yaml` / `.auth/` 一律不碰。Claude 官方明说 transcript **明文不加密**，且用户 `.env`/密钥会进 `projects/<project>/<session>.jsonl`——读它等于读用户密钥，**必须默认关闭或逐文件授权**。
3. **Cursor 走独立通道。** 需要读历史时先做**只读快照副本**再离线解析，绝不在 Cursor 运行中直接开 7.66 GB 的库。

---

## 2. 外部现状：GitHub 上已经有什么

### 2.1 两条完全不同的技术路线

| 路线 | 代表 | 做法 | 盲区 |
|---|---|---|---|
| **A. 统一外壳（我拉起它）** | [Orca](https://github.com/stablyai/orca) 5.9k★ MIT（Win/macOS/Linux，25+ agent，worktree 编排）、[Termexo](https://github.com/) Windows-only、Tauri2+Rust、[MonoCode](https://github.com/hardbeat920/monocode) 408★ MIT（**无 Windows**）、[CoDock](https://v2ex.com) （Win 安装包，直读各 agent 原生日志+SQLite）、[Acedia](https://apps.microsoft.com/detail/9nvbsgnrtplr) MS Store、[YCode](https://v2ex.com) | 用 PTY 接管进程，拿终端输出流判断状态 | **只能看见自己启动的 agent**；你独立开的 WorkBuddy/Marvis/Cursor 全部失明 |
| **B. 只读采集（我不碰它）** | [**Wake**](https://github.com/iAmCorey/Wake) 766★ MIT Rust、**17+ agent 只读索引**、SQLite FTS5 trigram 全文搜（1 ms）、一键 resume、Insights 热力图、`wake-mcp`、SSH 镜像、Windows v0.2.7 实验支持 | 只读扫描各 agent 目录建索引 | **明确不支持 Cursor / Windsurf / Trae**（加密或格式不稳）、Antigravity 仅元数据 |
| **C. 只做额度/成本** | [CodexBar](https://github.com/steipete/CodexBar) 22.1k★ MIT（89 provider，`serve`/`--json`）、[ccusage](https://github.com/ccusage/ccusage) 18.9k★ MIT（17 agent 本地 JSONL 算 token/成本） | 解析本地会话日志算钱 | **不回答"谁在跑、谁在等我、上次干了啥"** |

**关键情报：Termexo 的做法值得直接抄。** 它明说"状态不是靠轮询终端输出猜的"——Claude 侧生成 per-terminal hook 配置，Codex 侧用 `-c notify` 和 hooks TOML 覆盖，两边把事件写进 **JSONL 队列**，应用按**字节游标增量读 + `event_key` 去重**后入库。五个状态：等待输入 / 等待授权 / 思考中 / 完成 / 失败。技术栈（Windows-only、Tauri 2 + Rust、本地 SQLite、只读原会话文件、API Key 交 Windows 凭据管理器）与 onetone 几乎同构。

### 2.2 协议现状：没有任何标准携带"在等你"

| 协议 | 有没有"需要人工介入"信号 | 备注 |
|---|---|---|
| **AG-UI** | ✅ 最接近——原生 state delta + human-in-the-loop + tool call streaming | 本机 Marvis 已在写（`agui_events`）。**建议直接用作内部事件模型的参照** |
| **ACP**（Zed） | ✅ permission 请求类方法；Kimi/Zed/JetBrains 可直连 | 但假设"用户在编辑器里"，方向与中心控制台相反 |
| **A2A** | 有 Task 状态机 | 面向远程 agent 对接，不解决本地进程监控 |
| **OTel GenAI** | ❌ token 标准化了，**没有"等待用户输入"的 attribute** | semconv 已迁到独立仓 `open-telemetry/semantic-conventions-genai` |
| **MCP** | ❌ 不定义 agent 生命周期 | 只连工具/数据源 |

### 2.3 三个真正的空白（onetone 该占的位置）

1. **被动只读 + 桌面端 agent 家族。** 路线 A 看不见你不通过它启动的桌面应用；路线 B（Wake）主动放弃了 Cursor/Trae。你本机有 WorkBuddy / Marvis / OpenClaw / Qoder / Trae / Cursor 六个独立桌面端，**没有任何一个项目覆盖它们的状态与审批**。
2. **中文市场 agent 的本地状态格式。** Qoder / Trae / WorkBuddy / MCode / Kimi 的落盘路径与 schema 无公开文档，逆向本身就是壁垒（也是风险）。
3. **语音作为控制入口。** 没有任何一个方案让"谁在等我"成为一句话就能问的事——而这正是 onetone 的本职。

### 2.4 许可证红线

`claude-squad` 是 **AGPL-3.0**，不能进闭源桌面产品。MIT 可放心复用：CodexBar、ccusage、agent-deck、ccmanager、claude-devtools、hannah-agent-runtime、**Wake**。`@deepseek-ai/dsh-hook-protocol` 是 BSD-3，是现成的"跨 agent hook 归一层"参考实现。Vibe Kanban（Apache-2.0，28.3k★）已宣布 sunset——**品类有真实需求但商业化困难，你面对的不是被巨头锁定的市场。**

---

## 3. P0–P2 落地策略

> 原则：**复用 > 新建**。每一步都挂在已有模块上，不造平行数据源。

### P0 · 归一事件模型 + 只读采集器（目标 2–3 周）

| # | 任务 | 落点 | 验收 |
|---|---|---|---|
| P0-1 | 扩 `AgentAttentionSignal`：加 `evidence_path` / `evidence_tail` / `observed_at` / `stale_after_ms` | `agent_attention/model.rs` | 任一状态都能回答"凭什么这么说" |
| P0-2 | 新建 `agent_collect/` 采集层：`mode=ro` 只读、显式文件白名单、凭据文件硬黑名单 | 新模块 + `agent_memory/store.rs` 落同一 SQLite | 全程零写入用户目录（有测试断言） |
| P0-3 | **A 级适配器**：Codex（`task_*` + `sqlite_home`）、Claude（`sessions/` + `stats-cache.json` + `Notification` hook）、Marvis（`approvals` + `agui_events`）、WorkBuddy（`sessions.status` + `polling-lease` 心跳） | 按 A 级清单逐个 | 4 个 agent 的"在等你"零误报 |
| P0-4 | **B 级适配器**：Qoder 状态 JSON、MCode runtime 日志、Trae、DSH（zstd 解压） | 同上 | 全部带 ◐ 标记 + 推断依据可见 |
| P0-5 | 过期降级 + 置信度衰减 | `agent_attention/store.rs` | 静默 30 min 自动降级，UI 变灰 |
| P0-6 | Cursor 只做**只读快照导出插件**，明确实验性 | `agent_memory/cursor_adapter.rs` 扩展 | 不阻塞、不进主路径 |

**P0 明确不做**：Cursor `state.vscdb` 主路径、Gemini/Antigravity 深度接入、任何写操作、任何凭据读取。

### P1 · 统一首页信息架构（目标 3–4 周）

| # | 任务 | 落点 | 验收 |
|---|---|---|---|
| P1-1 | 扩 `HomeFusionSnapshot`（G 规格）加 `agents[]` 台账段 | `agent_memory/home_focus.rs` + snapshot 投影 | 五情境下台账行为一致 |
| P1-2 | 落地上篇 §4 的三段式首页 | `src/index.html` / islands | 5 情境在 640×680 可操作；`≤1` 主 CTA |
| P1-3 | 状态来源徽标 + evidence 展开 | 新 island | 每条状态可溯源到文件路径与事件类型 |
| P1-4 | 零配置冷启动骨架 | 首页 | 无数据时显示"正在读取 N 个 agent 的本地记录"，不空白、不假装 |
| P1-5 | 把 `cmd_agent_home_snapshot` + `agent_attention::public_snapshot` 接进台账，不新增查询面 | `lib.rs` | 无平行数据源 |

### P2 · 动作闭环 + 语音入口（目标 4–8 周）

| # | 任务 | 说明 |
|---|---|---|
| P2-1 | 深链恢复：`claude --resume` / `codex resume` / `mcode` | 每个"等你"必须能在 onetone 内结束，否则首页只是好看 |
| P2-2 | 审批就地处理：A 级审批点（Codex `PermissionRequest`、Marvis `approvals`） | 摄像头/语音可作证据但**不得单独完成高风险批准**（沿用 G 规格） |
| P2-3 | Hook 安装器扩面：Claude / Codex 已有 → 加 DeepSeek DSH 协议 | 抄 Termexo 的 JSONL 队列 + 字节游标 + `event_key` 去重 |
| P2-4 | 语音控制入口：「谁在等我」→ 直达台账 | 复用既有 dictation + agent ask，不新建识别链路 |
| P2-5 | 可选：Wake 式只读全文索引（SQLite FTS5 trigram） | 中英混搜 + 代码子串；索引可随时重建 |
| P2-6 | 成本/额度聚合：CodexBar + ccusage 二选一做数据源 | **不自研**额度抓取 |

---

## 4. 新软件首页方案：「台面 Bench」

### 4.1 与 G 方案的关系

G 规格的裁决顺序、单 CTA、单一提问、通道披露规则**全部保留**。新首页只做一件事：在「情境头条」和「单一提问」之间，插入一层**台账**——它就是"不用打开 agent 就能看"的本体。

```
┌────────────────────────────────────────────┐
│ ① 情境头条（沿用 G）                        │  attention / repair / cold / resume / quiet
│    "2 个 Agent 在等你"     [ 处理第一个 ]  │  至多 1 个主 CTA
├────────────────────────────────────────────┤
│ ② Agent 台账  ← 新增，也是本次主体         │
│    ● Codex      等待你批准 · 3 分钟前      │  A 级
│      └ evidence: rollout-….jsonl ·         │
│        task_complete 无后续 user_message   │
│    ◐ Marvis     思考中 · 刚刚              │  B 级
│    ● WorkBuddy  完成 · 22 分钟前           │  A−
│    ◐ Qoder      空闲 · 1 小时前            │  B
│    ○ Cursor     实验性 · 历史需导出        │  C
│                                             │
│    读到了 9 个 agent · 3 个官方信号         │  诚实汇总条
│    · 6 个推断 · 1 个已降为"疑似停了"       │
├────────────────────────────────────────────┤
│ ③ 单一提问（沿用 G）                       │  1 个输入框
│    [ 问一句…              ]  ▾ 当前前台   │  target 单选，禁止双框
├────────────────────────────────────────────┤
│ ④ 帮过我（折叠 · 复用 home_focus）         │  最近 3 条
└────────────────────────────────────────────┘
```

### 4.2 六条硬规则

1. **状态必带来源徽标。** ● 实心 = 官方信号；◐ 半实 = 官方 DB + 启发式；○ 空心 = 纯推断。hover 展开 evidence 路径、最后事件类型、观测时间。**这是 Wake / CodexBar / Orca 都没做的诚实度，也是唯一能防用户误判的东西。**
2. **过期显式降级。** 静默超阈值 → 整行降为"…前停止"，禁止永不变绿。假活比假死更有害。
3. **看得见必须点得动。** 每个"等你"行右侧给一个**就地可完成**的最小动作；做不了的（只能跳转的）必须明说"需在 X 内处理"，不假装能一键解决。
4. **零配置冷启动。** 首屏无数据时显示"正在读取 N 个 agent 的本地记录"+ 骨架，不空白、不假装完成。
5. **不新增主 CTA。** 台账里的动作按钮算"行内操作"，不与头条主 CTA 竞争；attention 情境下头条 CTA = 台账首行的动作，二者必须一致（避免两个"处理"）。
6. **台账可折叠但不可隐藏。** 安静态允许折叠到 1 行汇总（"9 个 agent · 都在跑"），但不得完全消失——这是"不用打开就能看"的产品承诺。

### 4.3 与左侧 Agent 入口的边界（沿用 G 规格）

| 面 | 负责 |
|---|---|
| 软件默认首页（本方案） | 情境、单一主 CTA、**台账一览**、单一提问、修复 |
| 左侧 Agent 入口 | 五信号、帮过你时间线、checkpoint 详情、单 agent 深挖 |

---

## 5. 风险与不做清单

| 风险 | 处置 |
|---|---|
| Cursor `state.vscdb` 13.9 GB | 主路径禁用；只读快照离线解析；实验性标注 |
| Claude transcript 明文含用户密钥 | 默认关闭 Claude 全文读取；逐文件授权；凭据文件硬黑名单 |
| Gemini CLI → Antigravity CLI 迁移 | 双探测，UI 明示当前读到的是哪个产品 |
| Gemini / Qoder / Hermes 公开文档缺失 | 以本机实测为准；Qoder 有本机证据可用，**Hermes 本机无任何 agent 目录，不预留 slot** |
| 推断误报（并发/崩溃/休眠） | B 级一律半实点 + 观测时间 + 允许用户手动纠正 |
| 被"统一外壳"（Orca 等）收编 | 定位差异：外壳管"我启动的"，台面管"你已经在用的"；含桌面端与中文 agent 家族 |
| 采集层拖慢启动 | 采集异步 daemon + 增量；首页先出骨架 |

**明确不做**：不接管任何 agent 进程；不写用户 agent 目录；不读任何凭据文件；不自研额度抓取；不做 IDE 内嵌 agent 的实时状态（C 级只做历史导出）。

---

## 6. 参考来源

**项目已有**：`src-tauri/src/agent_install_inventory.rs`、`agent_attention/`、`agent_memory/`、`shell_agent_usage/official/{qoder,trae,workbuddy}.rs`、`cursor_local_activity.rs`、`docs/superpowers/specs/2026-10-04-home-fusion-g-design.md`

**外部项目**：https://github.com/iAmCorey/Wake · https://github.com/stablyai/orca · https://github.com/hardbeat920/monocode · https://github.com/steipete/CodexBar · https://github.com/ccusage/ccusage · https://github.com/asheshgoplani/agent-deck · https://github.com/kbwo/ccmanager · https://github.com/hanxiaosss/agent-runtime · https://github.com/smtg-ai/claude-squad（AGPL，规避）· https://github.com/BloopAI/vibe-kanban（sunsetting）

**协议**：https://docs.ag-ui.com/introduction · https://agentclientprotocol.com/get-started/introduction · https://a2a-protocol.org/latest/specification/ · https://github.com/open-telemetry/semantic-conventions-genai

**官方文档**：https://code.claude.com/docs/en/claude-directory · https://code.claude.com/docs/en/hooks · https://developers.openai.com/codex/config-reference · https://github.com/MoonshotAI/kimi-code · https://github.com/openclaw/openclaw · https://github.com/bytedance/trae-agent
