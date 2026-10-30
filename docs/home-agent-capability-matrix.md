# 首页 Agent 能力矩阵

> 依据 [home-agent-workbench-prompt.md](./home-agent-workbench-prompt.md)。  
> **已投影到 FE**：[`home-agent-capabilities.js`](../src/js/features/now/home-agent-capabilities.js) → `snapshot.session`。  
> 产品主线：任务材料准备 → 可选 `task_organize` → 投递给代码 Agent → 诚实投递回执。  
> 约束：不能把已有 UI 状态误认为真实权限；禁止模拟授权 / 模拟 Diff / 用本地文本冒充代码执行。

## 发布状态

```text
Phase1 status: accepted
Assist Runtime: implemented
Task organize: implemented, conditionally ready
  local/fake transport: verified
  real provider: unverified
Free-only remote path: ready when eligible (zero_price) model exists
Direct send path: ready

Phase2 status: RC（候选发布版）— 桌面 A/B 已人工通过；远程 C skipped
Phase2 implementation: passed
Phase2 automated verification: passed
Phase2.0 preflight gate: passed
Phase2 local desktop verification: passed
Phase2 remote organize verification: skipped
Phase2 release acceptance: passed
```

**Phase2 试验性指标（目标意向；样本不足=未测量，不判失败）：** 准备时间 −30% / 粘贴 −50% / 未确认过期发送 0 / 无模型直发 ≥ Phase1。当前：**未测量**。

发布前检查：

- 模拟路径：**已过** `npm run test:home-assist-ui-checklist`（≠ 真机点击；仍有 `device_check_remaining`）
- 桌面 A/B：操作员引导九步全绿（2026-10-28）— 见 [phase2-rc-acceptance.md](./phase2-rc-acceptance.md)
- 文案：失败禁止裸「整理失败」；`no_free_model` 提示下一步；dock 勾选「允许计量额度」+ 失败 CTA
- 分层状态：[phase2-gate-record.md](./phase2-gate-record.md)

仍未完成（须保持明确）：

- 真实远程整理尚未验证（remote skipped）
- Phase2.5 会诊 / 临时读权 / Concierge：见 [phase2.5-audit.md](./phase2.5-audit.md)
- Phase3 接续记忆与 Skill 导出未接入

## 统一条目形状

```js
session.capabilities.<id> = {
  status: 'available' | 'partial' | 'not_wired',
  available: boolean, // 仅 status === 'available' 时为 true
  implemented?: boolean, // task_organize：实现是否存在
  ready?: boolean,       // task_organize：当前是否可调用
  reason: string,
  ipcHints: string[]
}
```

## 验收边界（Phase）

```text
Phase1 core:
- material outbound snapshot (citeMode-aware)
- task_organize when ready
- editable organized body as send source of truth
- send snapshot + honest delivery receipt
- async cancel / deadline / no further rotation after cancel

Phase1 conditional (ready 依赖配置):
- free_only / allow_metered policy
- provider rotation within budget
- usage reporting (real or estimated-labeled)

Phase2 RC (flag default off → session not_wired until enabled;
  desktop A/B passed; remote skipped):
- project_passport / project_evidence / project_search
- project_diff_summary then project_diff_excerpt
- read_project: partial only when projectContextEnabled; never implies write/run


Phase2.5 (automated green 2026-10-28; desktop A′ pending human):
- flow skills + consult skeleton (local); model still task_organize only
- backend find-materials grant + open_confirmed (+ success/root-drift unit tests)
- concierge on-demand; suggested!=user_confirmed; verified!=user_reported
- NOT release-accepted until A′ click-through evidence (C skipped)

Phase3 not_wired:
- structured continuation memory
- workflow export
- SKILL.md generation
```

## 能力对照（首页视角）

| 能力 id | 模块 / IPC | status | reason / 首页展示 |
|---------|------------|--------|-------------------|
| `text_chat` | `cmd_workbuddy_local_chat` | available（仅 WorkBuddy 本机） | 讨论；桌面投递 ≠ 本机聊 |
| `agent_task` | `cmd_agent_center_*` + `cmd_agent_task_*` | partial | 外部 Agent 控制；flag `onetone.agentTaskRuntime=1` 时投影内置单 Agent Task Runtime |
| `task_organize` | `cmd_assist_run` / `cmd_assist_cancel` | partial→available | **仅任务整理**；与 `agent_task` Runtime 分离 |
| `read_project` | `cmd_project_context_*` | not_wired→partial | 受限选择性读取；默认 flag 关；桌面 A/B 已过；非全库分析 |
| `project_passport` | query(passport) | not_wired→partial | 根白名单名片 + 用户点选规则 |
| `project_evidence` | query(read_excerpt) | not_wired→partial | 选定文件片段 |
| `project_search` | query(search) | not_wired→partial | 字面搜索后选入 |
| `project_diff_summary` | query(git_changes) | not_wired→partial | staged/unstaged 列表；桌面 Git 闭环已过 |
| `project_diff_excerpt` | query(git_diff) | not_wired→partial | 单文件有限 patch；桌面 Git 闭环已过 |
| `write_project` | `cmd_agent_task_*` | not_wired→partial | 仅 Task Runtime grant 内；默认 `write_with_approval` |
| `run_command` | `cmd_agent_task_*` | not_wired→partial | 仅 `check_id` 白名单，非任意 shell |
| `approval_execute` | `cmd_agent_task_approve_patch` | not_wired→partial | patch 审批 token（task+patch+file hash+version） |
| `diff` | TM `cmd_tm_diff_summary` | **partial** | 仅打开项目时间线（非会话绑定 Diff） |
| `rollback` | TM `cmd_tm_restore` | **partial** | 同上；恢复在 Time Machine |

旁路：Claude Soft Pad `/api/claude-approval`；`cmd_home_confirm_project`（选项目 ≠ 读文件权限）。

## 权限模型（默认全部 not_wired）

| 权限 id | status | available |
|---------|--------|-----------|
| `read_project` | not_wired（flag 开且 scope 授予后可为 partial） | false（默认） |
| `write_project` | not_wired（ATR flag + task grant 后 partial） | false（默认） |
| `run_safe_command` | not_wired（ATR check_id 白名单） | false（默认） |
| `run_risky_command` | not_wired | false |
| `network_access` | not_wired | false |
| `external_path_access` | not_wired | false |

## 会话投影要点

- `role`: WorkBuddy **本机** → `think`；桌面投递或其他 Agent → `code`
- 交接：`handoffId` 可有；`sessionId` / `externalSessionId` 无真值时为 `null`
- 投递回执绑 `snapshotId` / `taskScopeId`；投递成功 ≠ 执行完成

## Assist Runtime

- ATR 编辑主路径：WorkBuddy OAuth（登录拿账号模型 / freemodel）；Soft Pad 密钥为次选
- Soft Pad 密钥后端读取；WorkBuddy 账号独立（OAuth / Key）
- 费用三维：`pricing` / 账户额度展示 / `callPolicy`
- 异步取消与 HTTP、deadline 竞争；取消不保证停计费
- 出站经 `buildAssistInputSnapshot`（citeMode）
- 真实提供商路径：**未验证**；勿把单元/模拟测试当作远程成功
- **不等于** Agent Task Runtime（不写盘、无 tool loop）

## Agent Task Runtime

- 模块：`src-tauri/src/agent_task_runtime/`；事件 append-only；任务投影 + Checkpoint 仅投影
- 默认 `write_with_approval`；模型只传 `check_id`；审批 token 绑定 task+patch+file hash+version
- Flag：`onetone.agentTaskRuntime=1`（`OneToneHomeAgentTask`）
- Phase E：start 绑定 `agent_memory` checkpoint（同 `checkpoint_id` 更新）；`reject_patch` 清 pending 回 running；首页审批卡 + 事件时间线；focus 优先投影 ATR checkpoint
- Phase F：DeepSeek 原生 `tools`/`tool_calls`（content-JSON 仅一次回退）；事件导出 `cmd_agent_task_events`
- Home edit 接缝：`workMode=edit` + flag → `startAndDriveAgentTask`（不经 WB/桌面投递）；approve/reject/input 后互斥 `driveDeepseek`；失败事件 `model_error`/`format_error`/`rate_limited`/`failed`
- Fake 闭环已测（含 check 失败→repair→done）；DeepSeek 驱动：`cmd_agent_task_drive_deepseek`（需 Soft Pad 密钥）

## 相关文件

- Prompt：[home-agent-workbench-prompt.md](./home-agent-workbench-prompt.md)
- Phase2 预检：[phase2-gate-record.md](./phase2-gate-record.md)
- Phase2 RC 验收：[phase2-rc-acceptance.md](./phase2-rc-acceptance.md)
- FE：`home-assist-ownership.js`、`home-assist-client.js`、`home-prompt-prep.js`、`home-agent-v2.js`、`home-agent-capabilities.js`、`home-agent-task.js`、`home-project-context.js`
- BE：`src-tauri/src/assist_runtime/`、`src-tauri/src/agent_task_runtime/`、`src-tauri/src/project_context/`、`src-tauri/src/agent_memory/`
- 测试：`scripts/test-home-assist-ownership.mjs`、`scripts/test-home-agent-task.mjs`、`scripts/test-atr-phase-e-flag.mjs`、`scripts/test-atr-phase-f-export.mjs`、`cargo test --lib agent_task_runtime`
