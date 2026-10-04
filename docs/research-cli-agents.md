# CLI Coding Agent 本地会话/历史存储机制调研

> 2026-10-04 ｜ 目标：为「聚合多 agent 历史与状态的一站式桌面板」做技术选型  
> 🧪 = 本机 `C:\Users\pstem\` 实测采样（Codex CLI 0.160.0 / Claude Code 2.1.288）

## 0. 结论速览

| Agent         | 主存储路径                                                                   | 格式                      | 压缩/加密                 | 官方导出                        | 难度    |
| ------------- | ----------------------------------------------------------------------- | ----------------------- | --------------------- | --------------------------- | ----- |
| Claude Code   | `~/.claude/projects/<path>/<uuid>.jsonl`                                | JSONL 事件流               | 明文                    | `/export`、ccusage、hooks     | ⭐     |
| **Codex CLI** | `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl` + 6 个 sqlite             | JSONL + SQLite          | **zstd** `.jsonl.zst` | `resume`/`migrate-rollouts` | ⭐⭐⭐   |
| Gemini CLI    | `~/.gemini/tmp/<hash>/chats/session-*.jsonl`                            | JSONL（首行 meta + 控制行）    | 明文                    | `--resume`，无导出              | ⭐⭐    |
| opencode      | `~/.local/share/opencode/opencode.db`                                   | **SQLite**(Drizzle/WAL) | 明文                    | `opencode export` / `db`    | ⭐⭐    |
| Factory Droid | `~/.factory/sessions/<path>/{<id>.jsonl,<id>.settings.json}`            | JSONL + JSON            | 明文                    | 无                           | ⭐     |
| Crush         | `<data_dir>/crush.db` + `~/.local/share/crush/projects.json`            | **SQLite**              | 明文                    | 无                           | ⭐⭐    |
| Kimi Code     | `~/.kimi-code/sessions/<wd>/<sess>/{state.json,agents/main/wire.jsonl}` | JSON+JSONL              | 明文                    | `/export`(MD)               | ⭐⭐    |
| Kilo/MiMoCode | `~/.local/share/kilo/`、`~/.local/share/mimocode/`                       | SQLite 或 JSON           | 明文                    | 无                           | ⭐⭐    |
| aider         | 每仓库 `.aider.chat.history.md`                                            | **Markdown**            | 明文                    | 无                           | ⭐（极贫） |
| amp           | `~/.local/share/amp/threads/`（历史；新版上云）                                  | JSON                    | —                     | 无                           | ✖     |
| MiniMax mcode | `~/.minimax/`                                                           | **未公开**                 | —                     | 无                           | ✖     |

**建议**：① 归一为 `Session{id,title,cwd,projectKey,createdAt,updatedAt,model,usage,messages[]}`；JSONL 类需 replay，SQLite 类直接 join。② 先做 **Claude + Codex + Gemini + opencode**。③ Codex 是唯一「双写+压缩+迁移」的，须备 zstd 解压与 sqlite 失效时的 rollout 回退。④ 除 opencode `export`/Kimi `/export`/Claude `/export` 外，**无官方导出 API，直接读文件是唯一稳定路径**。⑤ sqlite 一律 `mode=ro` 打开（Codex daemon 高频写，本机 `logs_2.sqlite` 35MB + WAL 2.3MB）。

---

## 1. Claude Code（~/.claude）

### 1.1 目录 🧪

```
~/.claude/
├── projects/E--voice-pilot/          # 绝对路径非字母数字→'-'（E:\voice-pilot→E--voice-pilot）
│   ├── 0b98dffc-d185-41ed-aada-1acdb51e98b6.jsonl   # 一会话=一文件，文件名=sessionId
│   ├── 1959f91b-.../subagents/agent-a41a139eed2d8975d.jsonl   # 🧪 子代理独立 jsonl
│   └── memory/                       # auto-memory（跨会话，独立于 transcript）
├── session-env/<sid>/  shell-snapshots/  sessions/  plans/  backups/  todos/
├── settings.json                     # hooks / env / cleanupPeriodDays
└── history.jsonl                     # 跨项目 prompt 扁平列表（仅用户输入）
```

保留默认 **30 天**（`cleanupPeriodDays`，v2.1.117+ 覆盖 `projects/`+`tasks/`+`shell-snapshots/`+`backups/`）。⚠️ 设 `0` = **完全不写盘**，非永久保留。([docs](https://ponymux.com/guides/claude-code-conversation-history), [deja-vu](https://vshulcz.github.io/deja-vu/guide/session-files-on-disk.html))

### 1.2 jsonl schema（🧪 实测 type 枚举）

本机 `projects/E--voice-pilot/*.jsonl` 统计：`user`(23) `assistant`(48) `attachment`(50) `queue-operation`(16) `last-prompt`(17) `atis-latch`(20) `cost-state`(2)

```jsonc
// user
{"parentUuid":null,"isSidechain":false,"promptId":"72bf0dfa-1007-4f90-9a05-193513dc30ab","type":"user",
 "uuid":"2045f409-b1e0-4feb-b6f5-aa1b043076cb","timestamp":"2026-10-03T17:54:28.946Z",
 "permissionMode":"plan","promptSource":"sdk","turnOrigin":"sdk","turnPosition":{"promptIndex":0,"turnIndex":1},
 "userType":"external","entrypoint":"sdk-cli","cwd":"E:\\voice-pilot",
 "sessionId":"0b98dffc-d185-41ed-aada-1acdb51e98b6","version":"2.1.288","gitBranch":"master",
 "slug":"ok-luminous-petal","message":{"role":"user","content":"只回复：ok"}}
// assistant：额外 apiBlockIndex, effort, perTurnEffort, thinkingDurationMs, serverClassifierRequest
// queue-operation {"operation":"enqueue"|"dequeue","content":"...","sessionId":"...","timestamp":"..."}
// attachment    {"attachment":{...},"rendered":"...","renderedRole":"user",...}
// last-prompt   {"lastPrompt":"...","leafUuid":"...","sessionId":"..."}
// cost-state    {"totalCostUSD":0.12,"totalLinesAdded":10,"totalLinesRemoved":3,"modelUsage":{...},
//                "totalAPIDuration":..,"totalToolDuration":..,"totalDuration":..,"hasUnknownModelCost":false}
```

核心字段：**`sessionId`(文件名) / `slug`(人类可读名) / `cwd` / `timestamp`(ISO8601 UTC) / `gitBranch` / `version` / `uuid`+`parentUuid`(因果链) / `isSidechain`**。  
⚠️ 旧博客常说的 `summary`、`ai-title` 在 2.1.288 样本中**未出现** → 不要硬编码 type 枚举。  
`~/.claude/history.jsonl`：`{text,timestamp,project,sessionId}`，供 ↑/Ctrl+R，**不受 30 天清理**（本机该文件不存在，需兜底）。

### 1.3 settings.json hooks（v2.1.288，共 **33 事件**）｜官方 <https://code.claude.com/docs/en/hooks>

节奏分组：每会话一次 `SessionStart`/`SessionEnd`；每 turn 一次 `UserPromptSubmit`/`Stop`/`StopFailure`；每次工具调用 `PreToolUse`/`PostToolUse`（`EndConversation` 两者都跳过）。

| 事件                                                                                                                                                  | matcher 匹配字段（示例值）                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SessionStart`                                                                                                                                      | `source`: startup/resume/clear/compact/fork                                                                                                                                                                                                                       |
| `SessionEnd`                                                                                                                                        | clear/resume/logout/prompt_input_exit/other                                                                                                                                                                                                                       |
| `UserPromptSubmit` / `UserPromptExpansion`                                                                                                          | 无 / 命令名                                                                                                                                                                                                                                                           |
| `PreToolUse`/`PostToolUse`/`PostToolUseFailure`/`PermissionRequest`/`PermissionDenied`                                                              | `tool_name`: `Bash`、`Edit\|Write`、`mcp__.*`                                                                                                                                                                                                                       |
| `PostToolBatch` / `MessageDisplay` / `TaskCreated` / `TaskCompleted` / `TeammateIdle` / `CwdChanged` / `WorktreeCreate` / `WorktreeRemove` / `Stop` | 不支持 matcher                                                                                                                                                                                                                                                       |
| `Notification`                                                                                                                                      | permission_prompt / idle_prompt / auth_success / elicitation_dialog / elicitation_url_dialog / elicitation_complete / elicitation_response / agent_needs_input / agent_completed / quota_auto_resume_fired / quota_auto_resume_stale / quota_auto_resume_disabled |
| `SubagentStart`/`SubagentStop`                                                                                                                      | agent 类型：general-purpose / Explore / Plan / 自定义 / `^my-plugin:reviewer$`                                                                                                                                                                                          |
| `StopFailure`                                                                                                                                       | rate_limit/overloaded/authentication_failed/oauth_org_not_allowed/account_on_hold/billing_error/invalid_request/model_not_found/server_error/max_output_tokens/cloud_credential_error/unknown                                                                     |
| `InstructionsLoaded`                                                                                                                                | `load_reason`: session_start/nested_traversal/path_glob_match/include/compact                                                                                                                                                                                     |
| `ConfigChange`                                                                                                                                      | user_settings/project_settings/local_settings/policy_settings/skills                                                                                                                                                                                              |
| `DirectoryAdded`                                                                                                                                    | slash_command / register_repo_root                                                                                                                                                                                                                                |
| `FileChanged`                                                                                                                                       | 字面文件名 `.envrc\|.env`                                                                                                                                                                                                                                              |
| `PreCompact`/`PostCompact`                                                                                                                          | manual / auto                                                                                                                                                                                                                                                     |
| `PreModelSwitch`/`PostModelSwitch`                                                                                                                  | `to_model` 派生规范名，如 `claude-opus-5`、`.*opus.*`                                                                                                                                                                                                                     |
| `Elicitation`/`ElicitationResult`                                                                                                                   | MCP server 名                                                                                                                                                                                                                                                      |
| `Setup`                                                                                                                                             | init / maintenance                                                                                                                                                                                                                                                |

**通用输入**：`session_id`、`transcript_path`、`cwd`、`hook_event_name`；条件 `prompt_id`(v2.1.196+)、`scratchpad_dir`(v2.1.257+)、`permission_mode`、`effort{level:low\|medium\|high\|xhigh\|max}`、`agent_id`、`agent_type`。  
⚠️ 纠偏：**`matcher` 不在 payload 里**；`model` 非通用字段（仅 SessionStart 可能带；ModelSwitch 用 `from_model`/`to_model`）；无 `$CLAUDE_MODEL`。

**matcher 语法**：`*`/`""`/省略 → 全部；仅含 `[A-Za-z0-9_ -]`+`,`+`|` → **精确串**（`|`/`,` 分隔，`Edit|Write` ≡ `Edit, Write`；逗号分隔需 v2.1.191+，连字符精确需 v2.1.195+，更早版本 `code-reviewer` 会被当未锚定正则而误匹配 `senior-code-reviewer`，须写 `^code-reviewer$`）；含其他字符 → **未锚定 JS 正则**（`Edit.*` 会命中 `NotebookEdit`，全串匹配写 `^Edit$`）。MCP 工具 `mcp__<server>__<tool>` **必须带 `.*`**：`mcp__memory__.*` ✅ / `mcp__memory` ❌；插件 `mcp__plugin_<p>_<s>__<tool>`。`FileChanged`/`StopFailure` 精确字符集更窄（仅 `[A-Za-z0-9_]`+`|`）。不支持 matcher 的事件写了 → **静默忽略**。

**`if` 字段**：仅 5 个工具事件生效（其余设了永不运行），单条 permission rule，无 `&&`/`||`：`Bash(rm *)`、`Edit(*.ts)`、`Edit(src/**)`(v2.1.214+ 限 cwd 下)。

**handler 5 种**：`command`（stdin JSON，timeout 600s；有 `args`=exec form 无 shell，无 `args`=shell form）、`http`（POST body，`allowedEnvVars` 白名单插值 header）、`mcp_tool`（`server`+`tool`，`input` 支持 `${tool_input.file_path}`）、`prompt`（LLM 判定 30s，`$ARGUMENTS`）、`agent`（实验 60s）。另有 `async`/`asyncRewake`/`timeout`/`once`。

**输出/决策**：通用 `continue`(+`stopReason`)、`systemMessage`、`terminalSequence`；顶层 `decision:"block"+reason`（UserPromptSubmit/PostToolUse/Stop/SubagentStop/PreCompact/ConfigChange/TaskCreated 等）；`hookSpecificOutput{hookEventName, permissionDecision:allow\|deny\|ask\|defer, permissionDecisionReason, updatedInput, updatedToolOutput, additionalContext(≤10000字符), decision{behavior,updatedInput}, retry, worktreePath, action/content, displayContent, initialUserMessage, sessionTitle, watchPaths, reloadSkills}`。退出码 2 = 阻塞。

> 💡 **集成价值最高**：hook payload 里的 **`transcript_path` 直接给出当前会话 jsonl 路径**，配合 `SessionStart`/`SessionEnd` 即可实时感知会话生命周期，无需猜目录。

---

## 2. Codex CLI（~/.codex，已重写为 Rust `codex-rs`）

### 2.1 目录 🧪（本机 0.160.0）

```
~/.codex/
├── sessions/2026/10/04/rollout-2026-10-04T00-22-20-01a10292-d6b6-7af2-bd19-0ada947d4657.jsonl
│            └── 按创建日期三级分区 YYYY/MM/DD/   命名 rollout-{YYYY-MM-DD}T{hh-mm-ss}-{threadId}.jsonl
├── archived_sessions/            # v0.136+ 归档
├── state_5.sqlite         # 线程元数据主库（threads 41 列）      🧪 27 行
├── thread_history_1.sqlite# 分页历史投影 items/turns             🧪 5.7MB
├── logs_2.sqlite          # logs(ts,level,target,module_path,file,line,thread_id)  🧪 32148 行 / 35MB
├── memories_1.sqlite  goals_1.sqlite  queue_1.sqlite
├── session_index.jsonl    # {"id","thread_name","updated_at"}   🧪
├── history.jsonl          # {"session_id","ts","text"}          🧪
├── .codex-global-state.json  # Electron/Desktop 全局态（非会话）
└── config.toml  auth.json  version.json  sqlite/codex-dev.db
```

压缩：归档/非活跃 → **`.jsonl.zst`(Zstandard)**；对压缩文件写入时先物化回 `.jsonl` 再追加。([1](https://codex.danielvaughan.com/2026/07/23/codex-cli-paginated-thread-history-sqlite-session-resume-search-memories) [2](https://deepwiki.org/openai/codex/3.5.2-rollout-persistence-and-replay))

### 2.2 rollout jsonl 🧪

每行 `{timestamp, ordinal, type, payload}`，`ordinal` 文件内单调递增。顶层 type：**`session_meta` / `event_msg` / `response_item` / `turn_context` / `token_usage_record` / `world_state` / `compacted`**

```jsonc
{"timestamp":"2026-10-03T16:22:21.006Z","ordinal":0,"type":"session_meta","payload":{
 "id":"01a10292-d6b6-7af2-bd19-0ada947d4657","session_id":"01a10292-...",
 "creator_user_id":"user-...","creator_account_id":"...","timestamp":"2026-10-03T16:22:20.090Z",
 "cwd":"C:\\Users\\pstem","runtime_workspace_roots":["C:\\Users\\pstem"],"originator":"codex-tui",
 "cli_version":"0.160.0","source":"cli","thread_source":"user","model_provider":"openai",
 "base_instructions":{"text":"You are Codex, an agent based on GPT-5..."}}}

// event_msg → payload.type ∈ {task_started, task_complete, token_count, item_completed,
//                             turn_aborted, thread_settings_applied, user_message, agent_message}
{"ordinal":1,"type":"event_msg","payload":{"type":"task_started","turn_id":"01a10292-...",
 "root_turn_id":"01a10292-...","started_at":1791044540,"model_context_window":258400,
 "collaboration_mode_kind":"default"}}

// response_item → payload.type ∈ {message, reasoning, function_call, function_call_output,
//                                 custom_tool_call, custom_tool_call_output}
{"ordinal":2,"type":"response_item","metadata":{...},"payload":{"type":"message",
 "id":"msg_01a10292-...","role":"developer","content":[{"type":"input_text","text":"..."}]}}

// turn_context（每 turn 快照，cwd 可变）
{"type":"turn_context","payload":{"turn_id":"01a0fed5-...","cwd":"E:\\voice-pilot",
 "workspace_roots":["E:\\voice-pilot"],"current_date":"2026-10-03","timezone":"Asia/Shanghai",
 "approval_policy":"never","sandbox_policy":{"type":"danger-full-access"},
 "permission_profile":{"type":"disabled"},"model":"gpt-5.6-luna","comp_hash":"3000",
 "personality":"friendly","collaboration_mode":{"mode":"default","settings":{"reasoning_effort":"low",...}}}}

// token_usage_record（计费核心）
{"type":"token_usage_record","payload":{"thread_id":"...","turn_id":"...","session_id":"...",
 "response_id":"resp_0d9ef30693fee8a1...","usage":{"input_tokens":21794,"cached_input_tokens":8960,
 "cache_write_input_tokens":0,"output_tokens":58,"reasoning_output_tokens":0,"total_tokens":21852},
 "turn_token_usage":{...}}}
```

持久化过滤 `EventPersistenceMode`：`Limited`(默认) 只落 UserMessage/AgentMessage/TokenCount/TurnComplete；`Extended` 追加诊断。`ExecCommandEnd` 大输出**截断 10000 字节**。


### 2.3 SQLite 🧪
`state_5.sqlite.threads`（41 列）：`id, rollout_path, created_at(_ms), updated_at(_ms), source, model_provider, cwd, title, sandbox_policy, approval_mode, tokens_used, has_user_event, archived, archived_at, git_sha, git_branch, git_origin_url, cli_version, first_user_message, agent_nickname, agent_role, memory_mode, model, reasoning_effort, agent_path, thread_source, preview, recency_at(_ms), history_mode, name, is_pinned, thread_section_id, section_position, project_id, originator, daybreak_enabled, creator_user_id, creator_account_id`；另 `projects, project_roots, thread_spawn_edges(parent→child fork 谱系), thread_attachments, thread_dynamic_tools, thread_sections, rollout_migration_state`。
`thread_history_1.sqlite`：`thread_items(thread_id, turn_id, item_id, rollout_ordinal, item_json, item_type, created_at_ms, started_at_ms, completed_at_ms)`、`thread_turns(status, error_json, duration_ms, rollout_byte_offset...)`、`thread_history_projection_state(thread_id, next_rollout_byte_offset, next_rollout_ordinal)`。

**v0.145.0（2026-07-21）关键变更**：SQLite 由「元数据索引」升级为**可查询主存储**（分页/计数/原子更新）；**JSONL 仍是 append-only 的完整回放真相源**。v0.148.0-alpha 新增 `codex migrate-rollouts`（默认 dry-run，`--apply` 才落库）。fork 用 **copy-on-write**（PR #34390），谱系存 `thread_spawn_edges`；倒序 JSONL 扫描（PR #32246）用于索引重建。

### 2.4 读取策略
1. 列表/搜索/成本 → 读 `state_5.sqlite.threads`；2. 全文回放 → 读 `rollout_path`（zstd 需解压）；3. 不一致时**以 JSONL 为准**（启动时 `reconcile_rollout` 对账）；4. ⚠️ 已知坑：sqlite 索引引用已移动/清理的 rollout 会致 resume 失败（issue #21196）；5. ⚠️ 主键统一用 **`thread.id` = `session_meta.id` = 文件名末段 UUID**（`session_meta.session_id` 有历史混淆）；6. 环境变量 `CODEX_HOME`、`CODEX_SQLITE_HOME`。

---

## 3. Gemini CLI（~/.gemini）

**路径** `~/.gemini/tmp/<projectHash>/chats/session-*.jsonl`（当前）；旧版/导出为 `session-*.json`。`<projectHash>` = cwd 哈希 **不可逆**（`projects.json` + `.project_root` 辅助映射项目名）。覆盖变量 `GEMINI_CLI_HOME`（追加 `.gemini`）、`GEMINI_DIR`。作用域按 cwd 哈希隔离，错目录报 "No previous sessions found for this project"。

**两代格式共存：**
```jsonc
// ① 旧：整体 JSON（pre-2026-02）
{"sessionId":"90a6c51d-...","projectHash":"project-hash","startTime":"2026-05-01T18:34:30.869Z",
 "lastUpdated":"...","kind":"...","directories":[...],
 "messages":[{"id":"u1","type":"user","content":"run tests"},
  {"id":"g1","type":"gemini","timestamp":"...","model":"gemini-2.5-pro",
   "tokens":{"input":120,"output":30,"cached":20,"thoughts":5,"tool":0,"total":150},
   "toolCalls":[{"id":"...","name":"run_command","args":{"command":"cargo test"},"result":{...},"status":"success"}],
   "thoughts":[{"subject":"...","description":"..."}]}]}
// ② 现：JSONL —— 首行 metadata，其后每行 MessageRecord 或控制行
{"sessionId":"...","projectHash":"...","startTime":"...","kind":"...","directories":[...]}
{"id":"m1","type":"user"|"gemini","timestamp":"...","content":[{"text":"..."}|{functionCall}|{functionResponse}|{thought}],
 "displayContent":...,"model":"gemini-2.5-pro","tokens":{...},"toolCalls":[...],"thoughts":[...]}
{"$set":{"summary":"...","lastUpdated":"..."}}     // 元数据补丁
{"$rewindTo":"<messageId>"}                        // 回退：删除该消息及之后记录再应用后续
```
同目录另有 **`checkpoint-*.json`**（用户命名快照，非会话）、`logs.json`（`{sessionId,messageId,timestamp,type,message}` 的 prompt 审计数组）、子代理嵌套 chat。保留策略 `general.sessionRetention{enabled,maxAge:"30d",maxCount:50,minRetention:"1d"}`、`model.maxSessionTurns`（-1 无限）。命令 `--resume/-r [index|uuid]`、`--list-sessions`、`--delete-session`、`/resume`；**无导出**。
([tape](https://pkg.go.dev/github.com/chenhg5/tape/internal/source/gemini) [agentgrep](https://agentgrep.org/backends/gemini) [deja-vu](https://vshulcz.github.io/deja-vu/registry/gemini.html))

### 3.2 hooks（**支持，2026 已成熟**）
官方 <https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md>
**8 个事件**：`SessionStart`、`SessionEnd`、`BeforeAgent`、`AfterAgent`、`BeforeTool`、`AfterTool`、`BeforeModel`、`PreCompress`（+`Notification`）
- matcher：`BeforeTool`/`AfterTool` = **正则**（`write_.*`）；生命周期事件 = **精确串**（`startup`）；`*`/`""` 全匹配。
- 与 Claude 的差异（**聚合层必须分别适配**）：阻止用 **`decision:"deny"`**（非 `permissionDecision`）；改入参用 `hookSpecificOutput.tool_input`（**合并语义**，非 `updatedInput`）；输出 `{hookSpecificOutput:{additionalContext:"..."}}`，**无 `hookEventName`**；`PreCompress` 仅 advisory **异步不可阻塞**；不支持 `decision:"ask"`；**hooks 不作用于 subagent**。
- 环境变量 `GEMINI_PROJECT_DIR`、`GEMINI_CWD`、`GEMINI_SESSION_ID`、`GEMINI_PLANS_DIR`、`CLAUDE_PROJECT_DIR`(别名)。
- 配置优先级：项目 `.gemini/settings.json` > 用户 > `/etc/gemini-cli/settings.json` > extensions。⚠️ **hooks 实际由 extensions 加载，需 `hooksConfig.enabled` 开启**（settings.json 里直接写不一定生效）。管理 `/hooks`、`/hooks enable-all`。
```jsonc
{"hooks":{"BeforeTool":[{"matcher":"write_file|replace","hooks":[{"name":"security-check","type":"command",
  "command":"$GEMINI_PROJECT_DIR/.gemini/hooks/security.sh","timeout":5000}]}]}}
```
([差异矩阵](https://github.com/q-qp-p/mksglu-context-mode/blob/main/docs/platform-support.md) [0.41.2 实测](https://github.com/ionelmir9623/agents-connector/blob/main/docs/integration-notes.md))

---

## 4. 其他 CLI

**opencode**（SQLite，第三方中 schema 最规整）
`${XDG_DATA_HOME:-~/.local/share}/opencode/opencode.db`（WAL；`$OPENCODE_DB` 覆盖；非 release 通道 `opencode-<channel>.db`）。**自 2026-01（≥1.1）SQLite 为唯一权威源**；旧 `storage/` JSON 树（`session/**/ses_*.json`、`message/`、`part/`）仅是一次性导入器输入，**该导入器已于 2026-06-02 删除**（新装没有，老机器留冻结副本）。
- `project(id, worktree, name)`；`session(id, project_id, parent_id, slug, title, directory, version, summary_additions/deletions/files, time_created, time_updated, time_archived)`
- `message(id, session_id, time_created, data JSON)` → `data={role, modelID, providerID, agent, mode, tokens{input,output}, cost, finish, time{created,completed}}`
- `part(id, message_id, session_id, data JSON)` → `data.type ∈ {text, reasoning, tool, file, agent, subtask, patch, snapshot, step-start, step-finish, retry, compaction}`；`tool.state{status: pending|running|completed|error, input, output, title, metadata, error, time}`
- `todo(session_id, content, status, priority, position)`；时间戳 **Unix 毫秒**
- **官方接口**：`opencode db "<SQL>" --format json|tsv`（锁安全，推荐）、`opencode export <sid>` → `{info, messages:[{info, parts}]}`
- 权限信号在 `json_extract(data,'$.state.error')`：`Tool execution aborted` / `The user rejected permission%` / `The user has specified a rule which prevents%`
([cv_core](https://docs.rs/clustervision-core/latest/cv_core/harness/opencode/index.html) [txcript](https://github.com/skillsynchq/txcript/blob/a8c8fc5c20112708ad07cf18a7bc60e02bdc989c/docs/formats/opencode.md))

**Factory Droid** — `~/.factory/sessions/<编码路径>/`（斜杠转 dash，如 `-Users-enoreyes-code-work-myapp`），每会话两个文件：`.jsonl`（4 类事件：`session_start` / `message`(contentPayload.type = text/reasoning/thinking/tool_use/tool_result，用 `toolIndex` 按 ID 关联) / `todo_state` / `compaction_state`）+ `.settings.json`（**用量主数据** `tokenUsage{inputTokens,outputTokens,thinkingTokens,cacheReadTokens,cacheCreationTokens}`、`model`、autonomy、时长；`totalTokens = input+output+cacheRead+cacheWrite`，reasoning 不计）。行上限 250MB，无导出。([1](https://deepwiki.com/specstoryai/getspecstory/5.3-getting-help) [2](https://deepwiki.com/ayagmar/llm-usage-metrics/5.5-droid-source-adapter))

**Crush（Charmbracelet）** — 注册表 `$CRUSH_GLOBAL_DATA`/`$XDG_DATA_HOME`/`~/.local/share/crush/projects.json`（Win `%LOCALAPPDATA%/crush`）；**每项目一个 SQLite** `<data_dir>/crush.db`（默认 `data_dir=.crush`，Goose 迁移、WAL、`secure_delete=ON`）：
```sql
sessions(id PK, parent_session_id, title, message_count, prompt_tokens, completion_tokens,
         cost REAL, updated_at, created_at, summary_message_id, todos)
messages(id PK, session_id, role, parts TEXT DEFAULT '[]', model, created_at, updated_at)
-- 另有 files(每版本文件快照，用于 undo)、read_files(去重跟踪)
```
⚠️ **时间戳是 Unix「秒」非毫秒**（schema 注释写错，实际 INSERT 用 `strftime('%s','now')`），需 `*1000`；`cost` 已是美元 REAL；子会话（`parent_session_id IS NOT NULL`）跳过；无 per-tool 日志。([schema](https://js0n.xyz/crush-sqlite-schema))

**Kimi Code CLI** — 数据根 `$KIMI_CODE_HOME`（默认 `~/.kimi-code`，旧 `~/.kimi`，`KIMI_SHARE_DIR` 可重定向）。`session_index.jsonl` 每行 `{sessionId, sessionDir, workDir}`；`sessions/<wd_xxx>/<sess>/state.json` = `{createdAt, updatedAt, title, isCustomTitle, lastPrompt, workDir, agents:{main:{homedir,type,parentAgentId}}, custom:{}}`；`sessions/<wd_xxx>/<sess>/agents/main/wire.jsonl` = append-only 主 transcript：
```jsonc
{"type":"metadata","protocol_version":"1.1","created_at":1767225600000}
{"type":"context.append_message","message":{"role":"user","content":[{"type":"text","text":"Say hello"}],"toolCalls":[]},"time":1767225600001}
{"type":"context.append_loop_event","event":{"type":"step.begin","uuid":"...","turnId":"...","step":0},"time":...}
{"type":"context.append_loop_event","event":{"type":"content.part","uuid":"...","turnId":"...","stepUuid":"...","part":{"type":"text","text":"Hello!"}},"time":...}
{"type":"context.append_loop_event","event":{"type":"step.end","uuid":"...","turnId":"...","finishReason":"end_turn"},"time":...}
```
命令 `kimi --continue/-c`、`--session/-S`、`-r <id>`、`/sessions`、**`/export [path]`（Markdown，含元数据+按 turn 组织）**、`/import`；恢复时同步恢复 YOLO/Plan/子代理/额外目录。([issue#248](https://github.com/vshulcz/deja-vu/issues/248) [官方](https://www.kimi.com/en-cn/help/kimi-code/cli-sessions))

**aider** — **无中央存储**。每仓库 `.aider.chat.history.md`（Markdown），多次运行以 `# aider chat started at ...` 分节累积；无 per-message 时间戳（起时取自节头，本地时间常被当 UTC）；默认不扫描，需 `AIDER_DIR` 显式开启（下探≤4 层、2 秒预算）。→ **聚合价值最低**。
**amp** — `~/.local/share/amp/threads/`（历史本地 JSON）；新版线程**存服务端，本地仅 stub** → 不建议纳入。
**Kilo / MiMoCode** — `~/.local/share/kilo/`（SQLite DB 或 `storage/` JSON，opencode 家族；配置 `kilo.json`）/ `~/.local/share/mimocode/`。
**MiniMax Code（官方 `mcode`）** — 数据根 `~/.minimax/`（🧪 本机实测仅有 `config.yaml`、`agents/`、`auth/`、`background-tasks/`、`memory/`、`plugins/`、`run/`、`v2/`，**未见 sessions/ 目录**），命令 `mcode --continue`/`--session`/`/sessions`，**未公开落盘 schema**。⚠️ 第三方非官方 CLI（`Hmbown/MiniMax-CI`）写 `~/.minimax/sessions` + `config.toml`，与官方 `config.yaml` **不同源，勿混淆**。([仓库](https://github.com/MiniMax-AI/minimax-code))
**第二梯队（同形状，易扩展）** — `~/.copilot/session-state/`、`~/.qwen/projects/`、`~/.cursor/projects/`(均 JSONL)、`~/.pi/agent/sessions/`、`~/.hermes/sessions/`、`~/.vibe/logs/session/{messages.jsonl,meta.json}`。完整目录总表见 [agentsview](https://agentsview.io/configuration)。

---

## 5. hooks 事件模型横切对比（实时状态感知用）

| | Claude Code | Gemini CLI | Codex CLI | opencode |
|---|---|---|---|---|
| 事件数 | **33** | 8 | 无原生 hooks | TS 插件 |
| 前/后工具 | `PreToolUse`/`PostToolUse`/`PostToolUseFailure` | `BeforeTool`/`AfterTool` | — | `tool.execute.before`/`.after` |
| 提示提交 | `UserPromptSubmit`/`UserPromptExpansion` | `BeforeAgent` | — | — |
| 会话起止 | `SessionStart`/`SessionEnd` | 同名 | — | `experimental.chat.system.transform` |
| 停止 / 压缩 | `Stop`/`StopFailure`/`SubagentStop` / `PreCompact`/`PostCompact` | `AfterAgent` / `PreCompress`(仅提示) | — | `experimental.session.compacting` |
| 阻止语义 | `permissionDecision:deny` | `decision:"deny"` | — | `throw Error` |
| **给会话文件路径** | ✅ `transcript_path` | ❌（仅 `GEMINI_SESSION_ID`） | ❌ | ✅ `input.sessionID` |
| subagent 生效 | ✅（带 `agent_id`/`agent_type`） | ❌ | — | — |

**结论**：仅 Claude Code 的 hook 能直接给出 `transcript_path` + 全生命周期事件，是「实时感知」的一等公民；其余 agent 只能靠 **文件 watcher + 增量 tail**（JSONL 天然追加友好；SQLite 需轮询 `updated_at_ms` 或监听 `-wal`）。

---

## 6. 实施要点

1. **路径编码**：Windows 下 `E:\voice-pilot` → Claude `E--voice-pilot`、Droid `-Users-...`；**Gemini 是不可逆 hash**，须自建 `projects.json`→目录名映射缓存。
2. **增量读取**：JSONL 记 `byteOffset`；SQLite 记 `updated_at_ms`/`rowid`；Codex 已有 `next_rollout_byte_offset`/`next_rollout_ordinal`（`thread_history_projection_state`）可复用。
3. **并发安全**：`sqlite3.connect('file:...?mode=ro', uri=True)` + `PRAGMA busy_timeout`，容忍 SQLITE_BUSY。
4. **压缩/迁移**：Codex `.jsonl.zst` 需 zstd 解压；v0.145+ 双写与 `migrate-rollouts` 迁移态，读取要容忍不一致。
5. **自建归档**：Claude 30 天自动删（`cleanupPeriodDays:0` = 不写盘）、Gemini `sessionRetention` 可开。首次扫描即快照入库。
6. **勿硬编码 type**：Claude 实测有文档未列的 `atis-latch`/`queue-operation`/`cost-state`；Codex 有 `world_state`/`compacted`。按「已知 type 精细渲染 + 未知 type 保留原文」设计。
7. **成本口径归一**：Claude `cost-state.totalCostUSD` / Codex `token_usage_record.usage` / Gemini `message.tokens`（**`cached` 含在 `input` 内需减去**）/ Droid `.settings.json.tokenUsage` / opencode `message.data.cost`。各家 cached 是否重复计入 input 不一致 → 归一化表加 `cached_is_subset_of_input` 标志。
