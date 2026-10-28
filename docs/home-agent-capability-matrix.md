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

Phase2 status: RC（候选发布版）— 等待桌面真机验收
Phase2 implementation: passed
Phase2 automated verification: passed
Phase2.0 preflight gate: passed
Phase2 local desktop verification: pending
Phase2 remote organize verification: pending
Phase2 release acceptance: pending
```

**Phase2 试验性指标（目标意向；样本不足=未测量，不判失败）：** 准备时间 −30% / 粘贴 −50% / 未确认过期发送 0 / 无模型直发 ≥ Phase1。当前：**未测量**。

发布前检查：

- 模拟路径：**已过** `npm run test:home-assist-ui-checklist`（≠ 真机点击；仍有 `device_check_remaining`）
- 真机：本机需**重建** `onetone.exe` 后按 [phase2-rc-acceptance.md](./phase2-rc-acceptance.md) 验收；首页整理区截图仍待补
- 文案：失败禁止裸「整理失败」；`no_free_model` 提示下一步；dock 勾选「允许计量额度」+ 失败 CTA
- 分层状态：[phase2-gate-record.md](./phase2-gate-record.md)

仍未完成（须保持明确）：

- 真实远程整理尚未验证
- 真机首页整理区截图 / 八步点击尚未验证
- Phase2 桌面本地闭环 A、Git 闭环 B、发布验收尚未通过
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
  desktop / remote / release still pending):
- project_passport / project_evidence / project_search
- project_diff_summary then project_diff_excerpt
- read_project: partial only when projectContextEnabled; never implies write/run

Phase3 not_wired:
- structured continuation memory
- workflow export
- SKILL.md generation
```

## 能力对照（首页视角）

| 能力 id | 模块 / IPC | status | reason / 首页展示 |
|---------|------------|--------|-------------------|
| `text_chat` | `cmd_workbuddy_local_chat` | available（仅 WorkBuddy 本机） | 讨论；桌面投递 ≠ 本机聊 |
| `agent_task` | `cmd_agent_center_*` | partial | 聚焦 / 续跑 / 中断；非沙箱 |
| `task_organize` | `cmd_assist_run` / `cmd_assist_cancel` | partial→available | `implemented: true`；本地假传输已验证；**真实提供商未验证**；`ready` 依赖 Soft Pad 密钥与 callPolicy |
| `read_project` | `cmd_project_context_*` | not_wired→partial | 受限选择性读取；默认 flag 关；桌面真机 pending；非全库分析 |
| `project_passport` | query(passport) | not_wired→partial | 根白名单名片 + 用户点选规则 |
| `project_evidence` | query(read_excerpt) | not_wired→partial | 选定文件片段 |
| `project_search` | query(search) | not_wired→partial | 字面搜索后选入 |
| `project_diff_summary` | query(git_changes) | not_wired→partial | staged/unstaged 列表；桌面 Git 闭环 pending |
| `project_diff_excerpt` | query(git_diff) | not_wired→partial | 单文件有限 patch；桌面 Git 闭环 pending |
| `write_project` | — | not_wired | 修改代码：暂未接入 |
| `run_command` | — | not_wired | 无沙箱命令 |
| `approval_execute` | — | not_wired | 仅「前往处理」；禁止「已允许」 |
| `diff` | TM `cmd_tm_diff_summary` | **partial** | 仅打开项目时间线（非会话绑定 Diff） |
| `rollback` | TM `cmd_tm_restore` | **partial** | 同上；恢复在 Time Machine |

旁路：Claude Soft Pad `/api/claude-approval`；`cmd_home_confirm_project`（选项目 ≠ 读文件权限）。

## 权限模型（默认全部 not_wired）

| 权限 id | status | available |
|---------|--------|-----------|
| `read_project` | not_wired（flag 开且 scope 授予后可为 partial） | false（默认） |
| `write_project` | not_wired | false |
| `run_safe_command` | not_wired | false |
| `run_risky_command` | not_wired | false |
| `network_access` | not_wired | false |
| `external_path_access` | not_wired | false |

## 会话投影要点

- `role`: WorkBuddy **本机** → `think`；桌面投递或其他 Agent → `code`
- 交接：`handoffId` 可有；`sessionId` / `externalSessionId` 无真值时为 `null`
- 投递回执绑 `snapshotId` / `taskScopeId`；投递成功 ≠ 执行完成

## Assist Runtime

- Soft Pad 密钥后端读取；WorkBuddy 账号独立
- 费用三维：`pricing` / 账户额度展示 / `callPolicy`
- 异步取消与 HTTP、deadline 竞争；取消不保证停计费
- 出站经 `buildAssistInputSnapshot`（citeMode）
- 真实提供商路径：**未验证**；勿把单元/模拟测试当作远程成功

## 相关文件

- Prompt：[home-agent-workbench-prompt.md](./home-agent-workbench-prompt.md)
- Phase2 预检：[phase2-gate-record.md](./phase2-gate-record.md)
- Phase2 RC 验收：[phase2-rc-acceptance.md](./phase2-rc-acceptance.md)
- FE：`home-assist-ownership.js`、`home-assist-client.js`、`home-prompt-prep.js`、`home-agent-v2.js`、`home-agent-capabilities.js`、`home-project-context.js`
- BE：`src-tauri/src/assist_runtime/`、`src-tauri/src/project_context/`
- 测试：`scripts/test-home-assist-ownership.mjs`、`scripts/test-home-project-context.mjs`、`cargo test --lib project_context`、`cargo test --lib assist_runtime`
