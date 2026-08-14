# Soft Pad 新客户端后台联动 — 实现计划

调研结论见 Cursor plan「Soft Pad 后台数据联动：六客户端调研」。本文把结论落成可执行实现顺序。

**默认优先：WorkBuddy / Trae / Qoder 一批（shell hooks）。**  
详见 [`soft-pad-shell-agents-hook-setup.md`](soft-pad-shell-agents-hook-setup.md)。MiniMax 官方客户端不作为 Soft Pad 数据源（见 Phase 0）。

共享管道（与现有 Claude / Codex / Cursor 相同）：

```text
Agent Hook / Plugin → probe → POST 127.0.0.1:8796/api/codex-app/state
  → pad_status + agent_attention → soft_pad_runtime / overlay
```

**Shell 三端一批（已实现骨架）：** 共享 [`scripts/agent-shell-hook-probe.js`](../scripts/agent-shell-hook-probe.js)；`AgentKind::{WorkBuddy,Trae,Qoder}`；ingest `*_hook`；三分 example + `shell_agent_hook_setup`。

复用现成文件模式：

| 角色 | Claude 参考 | Cursor 参考 |
|------|-------------|-------------|
| Probe | `scripts/claude-hook-probe.js` | `scripts/cursor-hook-probe.js` |
| Installer | `src-tauri/src/claude_hook_setup.rs` | `src-tauri/src/cursor_hook_setup.rs` |
| Adapter | `pad_status/adapters/claude.rs` | attention-only via `pad_status/mod.rs` |
| Setup doc | — | `docs/cursor-hook-onetone-setup.md` |
| AgentKind | `soft_pad_runtime/model.rs` | 同上 |

Probe 约束：fail-open、退出码 0、不写 prompt/回复正文、只保留安全字段（event / session / cwd / model / ts）。

---

## Phase 0 — MiniMax（明确不做）

| 项 | 决定 |
|----|------|
| 官方 `mmx-cli` | 多模态 skill，挂在其他 Agent 上；**不**发 Soft Pad 生命周期 |
| `minimax-chat` app target | 保持语音/映射 preset；**不**加 `AgentKind` |
| 社区 MiniMax-CLI | 仅当产品明确点名时再开任务 |

用 MiniMax 模型时，Soft Pad 状态来自承载客户端（Claude / OpenCode / …），不单独接 MiniMax。

---

## Phase 1 — WorkBuddy / CodeBuddy（先做）

**为何优先：** hooks 事件集与 Claude 几乎同构（含 `PermissionRequest` / `Notification`），插件支持 `type: command` 与 `type: http`；可最大程度复用 Claude 事件映射。

### 1.1 AgentKind + catalog

- 在 [`soft_pad_runtime/model.rs`](../src-tauri/src/soft_pad_runtime/model.rs) 增加 `WorkBuddy`（wire: `workbuddy`；app target: `workbuddy-chat` 或 `codebuddy-chat`，二选一并写死）。
- [`agent_catalog/mod.rs`](../src-tauri/src/agent_catalog/mod.rs)：capabilities 对齐 Claude 的 session / needs_input；`can_multi_agent_lights` 视 Subagent 事件实测再开。
- `from_kind_str` / `from_app_target` / `connector_health` / FG 识别（exe / 窗口标题）一并补齐。

### 1.2 Probe

- 新文件：`scripts/workbuddy-hook-probe.js`（可从 `claude-hook-probe.js` fork）。
- `source`: `workbuddy_hook`。
- 日志：`logs/workbuddy-hook-probe.jsonl`。
- 事件名优先原样转发；若 WorkBuddy 用 camelCase，在 probe 内归一成 Claude 同名（`PermissionRequest` 等）。
- `PermissionRequest`：是否复用 `/api/claude-approval` 轮询由 Soft Pad 按键产品决定；Phase 1 可先只推 `needs_input`，decide 回写放 Phase 1.1。

### 1.3 Ingest / adapter

- [`pad_status/mod.rs`](../src-tauri/src/pad_status/mod.rs)：`workbuddy_hook` → 新建 `adapters/workbuddy.rs` **或** 在 Claude adapter 上挂 `source` 别名并设 `agent=WorkBuddy`（更短：别名 + agent 字段覆盖）。
- 状态映射与 Claude 相同：

| Event | Soft Pad |
|-------|----------|
| UserPromptSubmit / PreToolUse / PostToolUse | running |
| PermissionRequest / Notification(`permission_prompt`) | needs_input |
| Stop / TaskCompleted | done |
| StopFailure / PostToolUseFailure | error |
| SessionStart | near-window only（无 primary light） |
| SubagentStart/Stop | lights only（若开启 multi-lights） |

- `agent_attention`：Permission* 抬 waiting；Stop* 清 waiting。

### 1.4 Installer

- `src-tauri/src/workbuddy_hook_setup.rs`：合并 `~/.codebuddy/settings.json`（或文档确认的 WorkBuddy 路径）的 `hooks` 树。
- Marker：`--onetone-hook-id workbuddy-activity-v1`（与 Claude 同样只卸自己的 command）。
- 安装事件最小集：`SessionStart`、`UserPromptSubmit`、`PermissionRequest`、`Stop`、`StopFailure`。
- IPC + permissions 镜像 `cmd_claude_hook_setup_*`。
- 示例配置：`scripts/workbuddy-hooks.example.json`。
- 用户文档：`docs/workbuddy-hook-onetone-setup.md`（格式抄 `docs/cursor-hook-onetone-setup.md`）。

### 1.5 自检

- `scripts/workbuddy-hook-probe.test.js`：stdin 样例 → POST body `source=workbuddy_hook` + 事件映射断言。
- Rust：`map_*_event_to_state` + ingest 设 agent=WorkBuddy 的单测（仿 `claude.rs` tests）。

### 1.6 验收

1. OneTone 运行，8796 监听。
2. 安装 hooks，WorkBuddy 提交一次 prompt → Soft Pad chip running → Stop 后 done。
3. PermissionRequest → waiting / needs_input。
4. OneTone 退出时 probe 不阻断 WorkBuddy。

---

## Phase 2 — Trae / Qoder（shell hooks，字段适配）

两者都可走「command hook + probe」，但 **不要盲拷 Claude probe 字段**。

### Trae

- Config：`~/.trae/hooks.json` 或项目 `.trae/hooks.json`。
- 事件：SessionStart、UserPromptSubmit、PreToolUse、PostToolUse、Stop、Notification。
- `AgentKind::Trae` / `trae_hook` / `trae-hook-probe.js` / `trae_hook_setup.rs`。
- 导入 Claude hooks 后按 [Trae Hook 配置详解](https://docs.trae.cn/ide_hook-configuration-reference) 核对 stdin 字段名。
- 无独立 PermissionRequest 时：用 `Notification` 推 needs_input；否则 waiting 仅靠 FG + Stop 近似。

### Qoder

- Config：`~/.qoder/settings.json` hooks；**Qoder CN / 通义 Agent IDE** 同构路径 `~/.qoder-cn/settings.json`（installer 双写；uninstall 同步清理）。
- IDE 五事件：UserPromptSubmit、PreToolUse、PostToolUse、PostToolUseFailure、Stop。
- **通义灵码 VS Code 补全插件**（行内补全）不是 Agent 回合 → **不进顶栏状态灯**。
- `AgentKind::Qoder` / `qoder_hook` / probe + installer。
- CLI `/statusline`：**不做** Soft Pad 主灯；用量旁路可另开（仿 `claude-statusline-probe.js`），非本阶段必需。

每个客户端各自：example json、setup md、probe test。

---

## Phase 3 — Gemini CLI（原 Antigravity）

**状态：已落地（CLI）。** Wire：`AgentKind::Gemini` / `gemini` / `gemini-cli` / `gemini_hook`。

- Config：`~/.gemini/settings.json` 的 `hooks`（官方）；工作区 `.gemini/settings.json` 亦可。
- Probe：[`scripts/gemini-hook-probe.js`](../scripts/gemini-hook-probe.js) + shared shell probe；事件名 `BeforeTool`/`AfterTool`/`AfterAgent` 归一化为 Claude 映射。
- Installer：`shell_agent_hook_setup::GEMINI`（marker `gemini-activity-v1`）；薄封装 `gemini_hook_setup.rs`。
- Doc：[`gemini-hook-onetone-setup.md`](gemini-hook-onetone-setup.md) — **仅承诺 CLI**；IDE mid-session 须实测，若不触发则文档写明「实测不触发，等 Google 修」。

---

## Phase 4 — OpenCode（TypeScript 插件，非 settings.json）

**状态：已落地。** 见 [`opencode-hook-onetone-setup.md`](opencode-hook-onetone-setup.md)。

- **不**做 shell `*-hook-probe.js` 安装进 settings。
- 模块：[`scripts/opencode-onetone-plugin/`](../scripts/opencode-onetone-plugin/)（`tool.execute.*` / `permission.ask` / `session.idle` → POST `opencode_hook`）。
- `AgentKind::OpenCode`；installer 合并 `opencode.json` 的 `plugin` 数组。
- TUI statusline **不是** Soft Pad 数据通道，勿接错。

---

## Cline / Aider（补充）

| Agent | 通道 | 文档 |
|-------|------|------|
| Cline | 文件 hooks `.cline/hooks/*.cmd` | [`cline-hook-onetone-setup.md`](cline-hook-onetone-setup.md) |
| Aider | `notifications-command` done-only | [`aider-hook-onetone-setup.md`](aider-hook-onetone-setup.md) |


## 公共改动清单（每加一个 AgentKind）

1. `AgentKind` + serde + `as_str` / `from_*` / `app_target_id`
2. `agent_catalog` descriptor + face（可先复用 chord/sessions face）
3. `pad_status` ingest 路由 + attention bridge
4. Soft Pad FG / app_identity（Windows exe 名）
5. UI 文案 / hub 列表（若有硬编码白名单，同步）
6. Hook setup IPC + permissions toml
7. Probe + example + setup doc + 最小 test

禁止：为「将来可能」抽象通用 HookFramework；每客户端最短路径接入，共享只抽已重复两次的 POST/safe-fields 辅助。

---

## 建议工期切分

| 切片 | 交付 |
|------|------|
| P1a | WorkBuddy AgentKind + probe + ingest（手动 hooks.json） |
| P1b | WorkBuddy installer IPC + setup UI/doc + test |
| P2a | Trae probe + ingest + manual config |
| P2b | Qoder 同上 |
| P3 | Antigravity CLI |
| P4 | OpenCode 插件 |

每切片合并前：对应 `*.test.js` 或 Rust unit 绿灯；真人客户端冒烟按该 Phase 验收表。

---

## 开始实现时的第一刀（P1a）

1. `AgentKind::WorkBuddy`
2. Fork `scripts/claude-hook-probe.js` → `workbuddy-hook-probe.js`（改 source / 日志路径）
3. `pad_status/mod.rs` 把 `workbuddy_hook` 走到 Claude 映射逻辑但 `agent=WorkBuddy`
4. `scripts/workbuddy-hooks.example.json` + 本文件 Phase 1 验收

确认产品 wire 名（`workbuddy` vs `codebuddy`）后再合 P1b installer。
