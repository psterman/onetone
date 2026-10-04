# AI Coding Agent 会话聚合 / 可视化 / 用量统计 / 历史搜索 —— 开源生态调研

> 调研日期：**2026-10-04**（所有 star 数、更新时间均于当日通过 GitHub Search API / 仓库页面获取）  
> 目的：判断"多 agent 历史聚合桌面板"是否需要从零做，以及可复用/借鉴什么。

---

## 0. 一页结论

| 问题       | 结论                                                                                |
| -------- | --------------------------------------------------------------------------------- |
| 需要从零做吗？  | **不需要从零做解析层**，但**桌面 GUI 层确有空白**                                                   |
| 最强竞品     | `Dicklesworthstone/coding_agent_session_search`（cass，1.1k★）——TUI/CLI，11+ provider |
| 最大生态     | `ccusage/ccusage`（18.9k★）——18 个 agent 的成本/用量，纯 CLI                                |
| 最接近的闭源产品 | Mantra（会话管理层，Claude Code/Cursor/Gemini/Codex + Git 时间旅行）                          |
| 空白       | **桌面 GUI 时间线 + 跨 agent 关联 + Git 对齐 + Cursor/Trae/Qoder 覆盖**                       |

---

## 1. Claude Code 历史分析类

| 仓库                                                                                                        | ★          | 语言           | 最近更新            | 许可证                               | 定位                                                   | 可视化形态                                                   |
| --------------------------------------------------------------------------------------------------------- | ---------- | ------------ | --------------- | --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| [ccusage/ccusage](https://github.com/ccusage/ccusage)（原 `ryoppippi/ccusage`，已迁 org）                       | **18,858** | Rust（npm 分发） | 2026-10-04      | ⚠️ **NOASSERTION**（无 LICENSE，高风险） | 从本地数据算 token/成本                                      | CLI 表格 + JSON + `--json` + statusline + `blocks --live` |
| [Maciek-roboblog/Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) | 8,730      | Python       | 2026-07-05      | MIT                               | 实时限额监控 + 预测 + 告警                                     | 终端 dashboard（类 htop）                                    |
| [nilbuild/claude-run](https://github.com/nilbuild/claude-run)                                             | 672        | TypeScript   | 2026-02-23      | MIT                               | 漂亮 Web UI 浏览会话                                       | **Web UI**                                              |
| [ColeMurray/claude-code-otel](https://github.com/ColeMurray/claude-code-otel)                             | 509        | Makefile     | 2025-06-17      | MIT                               | 把 Claude Code 打成 OTel 指标                             | Prometheus/Grafana                                      |
| [raine/claude-history](https://github.com/raine/claude-history)                                           | 498        | Rust         | 2026-09-20      | MIT                               | 模糊搜索 + **resume/fork** 会话                            | **TUI**（vim 键位）+ 语义搜索（实验）                               |
| [CodeZeno/Claude-Code-Usage-Monitor](https://github.com/CodeZeno/Claude-Code-Usage-Monitor)               | 562        | Rust         | 2026-10-02      | MIT                               | **Windows 任务栏** widget，Claude Code/Codex/Cursor      | 桌面 widget                                               |
| [Piebald-AI/splitrail](https://github.com/Piebald-AI/splitrail)                                           | 222        | Rust         | 2026-10-03      | MIT                               | Gemini CLI/Qwen/Claude Code/Codex CLI/Cline/Roo 实时用量 | CLI / TUI                                               |
| [kunwar-shah/claudex](https://github.com/kunwar-shah/claudex)                                             | 95         | JavaScript   | 2026-06-20      | MIT                               | MCP server + FTS5 索引历史                               | MCP + CLI                                               |
| `mariozechner/claude-trace`                                                                               | —          | —            | **仓库已 404（下线）** | —                                 | 曾：代理拦截 + 自包含 HTML 报告 + `--index` AI 摘要               | HTML                                                    |

- **解析方式**：主流为**被动读文件** —— `~/.claude/projects/**/*.jsonl`，按行解析 `usage.input_tokens/output_tokens/cache_*` + `model` + `sessionId`，用 LiteLLM / models.dev 价格快照算钱（`--offline` 兜底）。另一类是**主动代理拦截**（claude-trace 系：注入 `fetch()` / mitmproxy，抓 `/v1/messages`），能拿到系统提示词与思考块，但要改 `ANTHROPIC_BASE_URL`，侵入性高。
- **活跃替代**：`matkirit/claude-trace`（npm）、`hanqunfeng/claude-trace` 仍在维护。
- ✅ **可复用**：ccusage 的 **18 源适配器 + 价格模型 + 聚合口径**是事实标准（几乎整个 macOS 菜单栏生态都在 shell 它）。
- ⚠️ **许可证风险**：ccusage 无 LICENSE（NOASSERTION）→ **不要抄代码，只抄 CLI 契约/数据模型**。

---

## 2. Codex / Gemini 历史 viewer 类

| 仓库                                                                                      | ★  | 语言         | 最近更新       | 许可证 | 定位                                                    |
| --------------------------------------------------------------------------------------- | -- | ---------- | ---------- | --- | ----------------------------------------------------- |
| [wesm/agent-session-viewer](https://github.com/wesm/agent-session-viewer)（Wes McKinney） | 88 | Python/TS  | —          | 未标  | 本地 web app 浏览 Claude Code + Codex；**被十余个项目致敬**        |
| [HizTam/codex-history-viewer](https://github.com/HizTam/codex-history-viewer)           | 41 | TypeScript | 2026-10-02 | MIT | VS Code 扩展：浏览/搜索/**打标签**/导入导出 Codex CLI + Claude Code |
| [twidi/twicc](https://github.com/twidi/twicc)                                           | 30 | Python     | 2026-10-03 | MIT | "The Web Interface for Claude & Codex"                |
| [asfsdsf/codex-run](https://github.com/asfsdsf/codex-run)                               | 6  | TypeScript | 2026-03-12 | MIT | codex 版 claude-run（Web UI）                            |
| [someonegg/codex\_viewer](https://github.com/someonegg/codex_viewer)                    | 1  | TypeScript | 2026-09-30 | MIT | 只读本地 Web reader                                       |
| [iskrantxusa/codex-history-viewer](https://github.com/iskrantxusa/codex-history-viewer) | 1  | JavaScript | 2026-06-02 | MIT | 终端 viewer                                             |

- **解析方式**：`~/.codex/sessions/**/*.jsonl`（rollout 文件，含 `event`/`response_item` 结构）。
- **Gemini**：**几乎没有独立的 Gemini 历史分析项目**——Gemini CLI 的用量统计被 ccusage(`ccusage gemini`)、splitrail、sessionview 顺带覆盖。→ 说明 Gemini 侧生态薄弱，但也意味着**不卷**。
- ✅ **可借鉴**：`HizTam/codex-history-viewer` 的**标签/批注**、`wesm/agent-session-viewer` 的**归一化 Session 模型**。

---

## 3. Cursor 历史读取类

| 仓库                                                                                            | ★       | 语言         | 最近更新       | 许可证              | 定位                            |
| --------------------------------------------------------------------------------------------- | ------- | ---------- | ---------- | ---------------- | ----------------------------- |
| [thomas-pedersen/cursor-chat-browser](https://github.com/thomas-pedersen/cursor-chat-browser) | **517** | TypeScript | 2026-08-23 | ⚠️ **无 LICENSE** | Web app 浏览/搜索/管理 Cursor AI 聊天 |
| [S2thend/cursor-history](https://github.com/S2thend/cursor-history)                           | 185     | TypeScript | 2026-09-09 | MIT              | 浏览/搜索/导出/备份                   |
| [saharmor/cursor-view](https://github.com/saharmor/cursor-view)                               | 133     | Python     | 2025-09-12 | Apache-2.0       | 浏览/搜索/导出/分享                   |
| [lucifer1004/cursor-helper](https://github.com/lucifer1004/cursor-helper)                     | 27      | Rust       | 2026-05-22 | MIT              | 迁移项目不丢聊天；导出含 thinking         |
| [S2thend/cursor-history-mcp](https://github.com/S2thend/cursor-history-mcp)                   | 32      | TypeScript | 2026-09-08 | MIT              | **MCP server** 暴露 Cursor 历史   |
| [Cedriccmh/cursor-trace-exporter](https://github.com/Cedriccmh/cursor-trace-exporter)         | 7       | Python     | 2026-04-13 | MIT              | 导出 JSON（比官方更详细）               |
| [MushroomSquad/cursor-export](https://github.com/MushroomSquad/cursor-export)                 | 0       | Python     | 2026-07-06 | 无                | **state.vscdb → Markdown**    |

- **解析方式**：双源 —— ① `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`（SQLite，`ItemTable` 表，`cursorDiskKV` 键存 composer 数据）；② `~/.cursor/projects/**/*.jsonl`（新版）。**无官方 schema，全靠社区逆向**，Cursor 一升级就碎。
- ⚠️ **维护风险最高的一环**。建议做成**可插拔 adapter + 版本探测 + 失败降级**，且不要把它当核心卖点。
- **Trae / Qoder**：GitHub 上**几乎查不到**对应的历史导出项目（Trae 基于 VS Code 分支，数据同样在 vscdb；Qoder 无公开格式）。→ 生态真空，也是**无人验证过需求**的信号。

---

## 4. 多 agent 统一聚合类（最关键）

### 4.1 头部项目

| 仓库                                                                                                                           | ★         | 语言         | 最近更新       | 许可证                                                              | 覆盖 agent                                              | 形态                                  |
| ---------------------------------------------------------------------------------------------------------------------------- | --------- | ---------- | ---------- | ---------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------- |
| [Dicklesworthstone/coding\_agent\_session\_search](https://github.com/Dicklesworthstone/coding_agent_session_search)（`cass`） | **1,159** | Rust       | 2026-10-03 | ⚠️ API 判 NOASSERTION，仓库 LICENSE 文件写 MIT (c) 2026 Jeffrey Emanuel | **11+**（Codex / Claude / Gemini / Cursor / Aider / …） | **TUI + CLI + MCP**                 |
| [Javis603/token-monitor](https://github.com/Javis603/token-monitor)                                                          | 2,581     | JavaScript | 2026-10-04 | MIT                                                              | **43+ 工具**                                            | **桌面 widget** + 多设备同步               |
| [hoangsonww/Claude-Code-Agent-Monitor](https://github.com/hoangsonww/Claude-Code-Agent-Monitor)                              | 1,039     | JavaScript | 2026-10-04 | MIT                                                              | Claude Code + Codex                                   | Web dashboard（SQLite+Express+React） |
| [Nwflower/dsh-chat-import](https://github.com/Nwflower/dsh-chat-import)                                                      | 209       | JavaScript | 2026-10-03 | MIT                                                              | **25+ agent** 导入 DeepSeek Harness                     | 插件                                  |
| [dliedke/ClaudeCodeExtension](https://github.com/dliedke/ClaudeCodeExtension)                                                | 74        | C#         | 2026-10-03 | MIT                                                              | Claude Code/Codex/Cursor Agent/OpenCode               | VS.NET 扩展                           |
| [braincompany/sessiongrep](https://github.com/braincompany/sessiongrep)                                                      | 36        | Rust       | 2026-08-27 | Apache-2.0                                                       | Claude Code / Codex CLI / Cursor / Antigravity / Pi   | SQLite + **FTS5** + MCP             |
| [nicknisi/sessions](https://github.com/nicknisi/sessions)                                                                    | 37        | TypeScript | 2026-09-15 | MIT                                                              | Claude Code / Codex / Pi                              | 索引 + 模糊查找 + resume                  |
| [tyql688/sessionview](https://github.com/tyql688/sessionview)                                                                | 19        | Rust       | 2026-10-02 | MIT                                                              | Claude Code/Codex/Gemini/OpenCode/Cursor/kimi         | **桌面 app**（浏览/搜索/**resume**）        |
| [seastart/aicoder-session-viewer](https://github.com/seastart/aicoder-session-viewer)                                        | 11        | Rust       | 2026-08-18 | ⚠️ 无                                                             | 统一桌面应用                                                | 桌面                                  |
| [softaworks/agent-trail](https://github.com/softaworks/agent-trail)                                                          | 5         | TypeScript | 2026-01-28 | MIT                                                              | Claude Code + Codex（多 profile）                        | 本地 Web viewer                       |
| [langfuse/langfuse](https://github.com/langfuse/langfuse)                                                                    | 35,351    | TypeScript | 2026-10-03 | ⚠️ NOASSERTION（MIT + EE 混合）                                      | 任意（需主动打点）                                             | 服务端 LLMOps                          |

### 4.2 cass 深度拆解（最值得借鉴）

- **架构**：Rust；SQLite fork `frankensqlite`（schema v22，WAL）；**FTS5 词法 + ANN 语义**（MiniLM 嵌入 + int8 reranker，模型缺失自动降级 lexical）；TUI 用 `frankentui`；`cargo zigbuild` 交叉编译。
- **命令面**：`index` / `search`（`--mode hybrid|lexical`、`--workspace`）/`serve`（**MCP 持久化搜索服务**）/`archive`（逻辑导出校验导入，跨 schema 版本迁移）/`pack`（证据包，**输出脱敏**）/`pages`（加密 bundle）/`bookmarks` / `forget` / `doctor`。
- **亮点**：**SSH 探测远程主机**并自动生成 `sources.toml`；robot/JSON 输出；输出脱敏（密钥、home 路径）。
- **已知短板**（= 你的机会）：① `pack` 只做词法证据选择，语义未实现；② **纯 TUI/CLI，无 GUI**；③ 11+ provider 未完整枚举，Cursor 等靠逆向；④ 部分测试/静态扫描常红；⑤ Linux 需 glibc ≥ 2.28。

### 4.3 闭源 / 半闭源竞品（必须正视）

- **Mantra**（`mantra.gonewx.com`）——定位就是"AI 编程的**会话管理层**"，支持 Claude Code / Cursor / Gemini CLI / Codex。卖点：跨工具统一搜索、**Time Travel（会话时间线与 Git commit 对齐回放）**、100% 本地 + Local Sanitizer 实时脱敏、统一 MCP 网关。核心本地功能永久免费。→ **这是本产品最直接的对手，且它已经把"差异化"占位了一半。**
- **SuperBuilder**（`superbuilder.sh`）——开源 Electron，用 node-pty 包 Claude Code，做多会话编排 + 逐条成本 + debug 面板。**是"启动/编排"方向，不是"历史聚合"方向。**

---

## 5. 可视化 / 测量通用 infra：OpenTelemetry GenAI

来源：`open-telemetry/semantic-conventions-genai`（独立仓库）、[OTel 官方状态说明](https://opentelemetry.io/docs/specs/semconv/)、[aurorasre 2026 综述](https://www.aurorasre.ai/blog/opentelemetry-ai-agent-observability)

| 项               | 状态（2026-10）                                                                                                                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 是否已覆盖 agent 会话？ | **部分覆盖**。已定义 `gen_ai.operation.name ∈ {chat, text_completion, embeddings, execute_tool, invoke_agent, create_agent, invoke_workflow, plan}`；**`gen_ai.conversation.id` 就是会话关联键**；`gen_ai.tool.name` / `gen_ai.tool.call.id`；`gen_ai.usage.input/output_tokens` |
| MCP 覆盖？         | 有独立子规范：`mcp.client` / `mcp.server` span + 4 个 metric，W3C Trace Context 传播                                                                                                                                                                                      |
| 成熟度             | ⚠️ **Status: Development**（非 Stable）。v1.42.0（2026-06-12）从主仓迁出；**零 tagged release → 无法 pin 语义版本**，只能 pin commit                                                                                                                                                 |
| 内容捕获            | `gen_ai.input.messages` / `output.messages` 为 **Opt-In**，默认关闭（隐私）                                                                                                                                                                                              |
| 生态实现            | `ColeMurray/claude-code-otel`(509★,MIT)、`NikiforovAll/pi-otel`(14★)、`alibaba/loongsuite-java`(87★,Apache-2.0)、`kylehounslow/genainormalizer`(5★,Go，归一化 OpenInference/OpenLLMetry)                                                                              |

**判断**：

- ✅ semconv 已足够表达"一次 agent 会话的工具调用树 + token 成本"，且 `gen_ai.conversation.id` 天然可作为跨 agent 的统一主键 → **值得作为本产品的导出/交换格式**。
- ❌ 但它是**运行时打点**规范，**没有任何项目把它接到"本地 CLI 会话文件"上**（没有 file → OTLP 的采集器）。而且 Development + 无 release，**不能当硬依赖**，只能做"可选导出目标"。

---

## 6. 记忆 / 上下文复用类

### 6.1 知识图谱型（agent 运行时写入）

| 仓库                                                                                         | ★      | 语言         | 最近更新       | 许可证        |
| ------------------------------------------------------------------------------------------ | ------ | ---------- | ---------- | ---------- |
| [DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)            | 45,759 | C          | 2026-10-03 | MIT        |
| [shaneholloman/mcp-knowledge-graph](https://github.com/shaneholloman/mcp-knowledge-graph)  | 890    | JavaScript | 2026-05-29 | MIT        |
| [GreatScottyMac/context-portal](https://github.com/GreatScottyMac/context-portal)（ConPort） | 767    | Python     | 2026-01-27 | Apache-2.0 |
| [0xK3vin/MegaMemory](https://github.com/0xK3vin/MegaMemory)                                | 709    | TypeScript | 2026-05-03 | MIT        |
| [CheMiguel23/MemoryMesh](https://github.com/CheMiguel23/MemoryMesh)                        | 353    | TypeScript | 2026-03-01 | MIT        |


### 6.2 跨 agent 记忆同步型（更贴题）

| 仓库                                                                | ★  | 语言         | 最近更新       | 许可证         | 定位                                           |
| ----------------------------------------------------------------- | -- | ---------- | ---------- | ----------- | -------------------------------------------- |
| [prakrititz/relayBrain](https://github.com/prakrititz/relayBrain) | 31 | JavaScript | 2026-08-30 | MIT         | 协调层：共享文件锁 + live patch sync                  |
| [volkgg/openfused](https://github.com/volkgg/openfused)           | 18 | Rust       | 2026-06-20 | MIT         | 基于纯文件的共享记忆 + 消息层                             |
| [songth1ef/nestwork](https://github.com/songth1ef/nestwork)       | 13 | Python     | 2026-09-30 | 无           | 用 **git** 在 Claude/Codex/Gemini/Hermes 间同步记忆 |
| [MembridgeAi/membridge](https://github.com/MembridgeAi/membridge) | 6  | JavaScript | 2026-08-27 | NOASSERTION | Claude Code/Codex/Gemini 团队上下文同步             |
| [desikai-lab/Marrow](https://github.com/desikai-lab/Marrow)       | 7  | Python     | 2026-10-02 | MIT         | MCP 持久任务记忆                                   |
| [tomaurow/bolter](https://github.com/tomaurow/bolter)             | 0  | JavaScript | 2026-08-25 | MIT         | Claude Code/Codex/Antigravity 上下文同步          |
| [cgraf78/hive-memory](https://github.com/cgraf78/hive-memory)     | 0  | Rust       | 2026-10-03 | MIT         | 纯文本、跨会话/跨 agent/跨机器                          |

**判断**：这一层**玩家众多但全部在 1k★ 以下、且方向是"运行时写知识图谱"，不是"历史会话检索"**。反倒是 cass 与 sessiongrep 已经把 **MCP 检索接口**接进 agent 了 → 说明"让 agent 检索自己的历史"已是**既定范式**，新产品必须提供 MCP server，否则缺一半价值。

---

## 7. 总结：空白在哪里

### 现有方案的四类不足

1. **形态断层 —— 最强的没有 GUI，有 GUI 的不强。**  
   cass（1.1k★）功能最深但是 TUI/CLI；ccusage（18.9k★）只有 CLI 表格；桌面方案里 `token-monitor`（2.5k★）只做**实时用量 widget 不做会话内容检索**，`sessionview`(19★)/`aicoder-session-viewer`(11★) 刚起步。**没有一个成熟产品同时具备：会话全文/语义检索 + 跨 agent 统一时间线 + 成本/用量分析 + 桌面 GUI。**
2. **解析层碎片化，无中立 IR。**  
   每个项目各写一套 JSONL / vscdb 适配器（cass 的 connector、ccusage 的 source、sessiongrep 的 adapter），**agent 一改格式全体崩**。缺一个独立、可复用、带版本探测的 "Session IR + adapter registry"。
3. **Cursor / Trae / Qoder 是盲区。**  
   ccusage 的 18 源里**没有 Cursor**；Cursor 依赖 `state.vscdb` 逆向（无官方 schema）；Trae/Qoder 在 GitHub 上几乎零生态。→ 既是机会也是**最大的维护成本来源**。
4. **缺少"会话 ↔ 代码 ↔ Git"的因果关联。**  
   现有工具只能"搜到一段对话"，无法回答"这个 commit 是哪次会话改的 / 那次会话当时代码长什么样"。这个能力目前**只有闭源 Mantra（Time Travel）在做**。
5. **团队与多机维度缺失。**  
   只有 `token-monitor` 做了多设备同步；没有开源方案支持"团队内共享 / 评审 / 归档 AI 会话"。
6. **隐私脱敏不成体系。**  
   只有 cass（`redact_pack_output_json`）和 Mantra（Local Sanitizer）做了脱敏，其余工具直接把含密钥/内网路径的原文落库。

### 新产品应该差异化在哪（建议 5 点）

1. **别从零做解析层**，直接复用 ccusage 的 18 源成本/用量口径 + cass 的 connector 归一化思路 + sessiongrep 的 SQLite/FTS5 索引模式；把它们抽成内部 `Session IR`，adapter 可插拔、可降级。  
   ⚠️ **许可证纪律**：ccusage（NOASSERTION）、cass（NOASSERTION/MIT 争议）、langfuse（NOASSERTION）**只借鉴设计与数据契约，不复制源码**；优先复用 MIT / Apache-2.0 项目（splitrail、sessiongrep、`raine/claude-history`、sessionview）。
2. **差异化核心 ①：桌面 GUI 统一时间线** —— 会话 × 时间 × 项目 × agent × 成本的热力图/时间轴，混合检索（FTS5 + 本地嵌入，模型缺失自动降级为词法）。这是 cass 的空白。
3. **差异化核心 ②：Git 因果对齐** —— 把会话锚定到 commit / worktree / diff，支持"回放某次会话当时的代码状态"。这是对抗闭源 Mantra 的关键。
4. **差异化核心 ③：补齐 Cursor / Trae / Qoder**，用"版本探测 + 只读打开 + 失败即跳过"的健壮 adapter 策略，把这三者做成**可选的 best-effort 数据源**，而不是硬承诺。
5. **MCP 双向 + 隐私默认** —— 提供 MCP server（让任意 agent 检索自己的历史，这是 2026 年的既定范式），并把结果**回灌**成 `CLAUDE.md` / 上下文包；全程本地、默认脱敏；可选导出 OTLP（按 `gen_ai.conversation.id`），但**不把 OTel semconv 当硬依赖**（仍是 Development、无 release）。

---

## 附：数据来源

- GitHub Search API（`https://api.github.com/search/repositories`），star/更新时间获取于 **2026-10-04**
- 仓库页面直读（`ccusage/ccusage` 18,858★、`Dicklesworthstone/coding_agent_session_search` 1,159★、`wesm/agent-session-viewer` 88★、`thomas-pedersen/cursor-chat-browser` 517★）
- `mariozechner/claude-trace` 于 2026-10-04 访问返回 **404（仓库已下线）**
- OTel 状态：[open-telemetry/semantic-conventions-genai](https://github.com/open-telemetry/semantic-conventions-genai)、[aurorasre.ai](https://www.aurorasre.ai/blog/opentelemetry-ai-agent-observability)、[agentsurface.dev](https://agentsurface.dev/docs/testing/observability)
- 闭源竞品：[Mantra](https://blog.mantra.gonewx.com/zh/tech/ai-coding-tools-comparison-2026)、[SuperBuilder](https://superbuilder.sh/blog/ai-coding-agents-desktop-apps)
