# OneTone → OpenMausBot 对齐路线（P0–P2）

目标不是复制 Electron，而是在 OneTone 的 Tauri/Rust、语音和现有 Agent Runtime 上逐步补齐“多 Agent + 工具 + 人类审批”的闭环。

## P0：安全控制面与可观测任务（当前阶段）

目标：任何后续 Agent 协作都不能绕过权限、工作区和事件记录。

- TeamRun / TeamNode / Artifact / TeamEvent 持久化。
- Lead、只读分析节点、唯一 Implementer 的角色约束。
- 节点依赖门禁：依赖未完成时不能运行后续节点。
- 计划确认门禁：未确认计划时 Implementer 不能启动。
- 工件白名单与结构化证据链。
- IPC：启动团队、确认计划、读取快照、更新节点、写入工件。
- Agent Center 先消费快照，不要求复杂矩阵 UI。

验收：重启后团队快照可恢复；非法角色、非法工件、双写入者和绕过依赖全部被拒绝。

## P1：真实 FreeModel 协作闭环

目标：把 P0 控制面接到现有 Provider Driver，形成一次真实 Bug Fix Team。

- Lead 从可用 Provider 中选择并输出受限角色计划。
- Triage / Explorer / Test Analyst 只读并行运行。
- 工件汇总回 Lead，不共享完整长上下文。
- 用户确认计划后，单一 Implementer 使用现有审批式写入工具。
- Reviewer 只读审查 Diff；Verifier 运行白名单测试。
- 测试失败时最多自动修复两轮，超出后进入 needs-user。
- Provider 限流、超时、不可用时按现有 FreeModel 轮换策略降级。

验收：编译错误、逻辑错误、竞态错误各有一个 fixture；能完成分析→批准→修改→审查→验证，失败原因可见。

## P2：靠拢 OpenMausBot 的工具和产品体验

目标：让 Agent 不只会改文件，还能可靠使用受控工具。

- 本地项目浏览器验证：localhost 隔离浏览器、截图、DOM/AX 快照、点击、输入。
- Browser MCP / Playwright Provider 接入 TeamNode。
- 下载、上传、登录、验证码、外部网站默认需要用户接管或确认。
- 连接器/外部应用以 MCP Server 注入，不把凭据放进模型上下文。
- Agent Center 团队卡片：Lead 判断、节点状态、工件、审批、验证结果。
- 后续再评估真实 Chrome 扩展桥和本机 CUA；不与 P1 耦合。

## 明确不做

- 多个 Agent 同时写同一工作区。
- 无限递归子 Agent。
- 无审批的删除、上传、支付、Git 提交。
- 第一版直接复制 OpenMausBot 的 Electron 云电脑架构。

## 当前实现状态（P1 MVP）

- P0 已落地：TeamRun/TeamNode/Artifact/Event 持久化、角色白名单、单写入者与审批闸门、团队 IPC、恢复快照。
- P1 第一条闭环已落地：Home Agent 可启动 Bug Fix Team；只读节点并行复用现有 Agent Task Runtime；结果回填为 evidence/blocked artifact；父任务继续走现有计划确认、Implementer 写入与审批链路。
- P1 后续增强：Reviewer/Verifier 专用自动节点编排和真实 Provider fixture；当前 Provider 失败会明确落为 blocked/failed，不会伪报成功。
- P2 保持未实现：浏览器 MCP/Playwright、用户接管、连接器和真实 Chrome 扩展。
- 当前 P1 进展补充：已增加 `cmd_agent_team_advance`，父任务完成后自动顺序运行 Reviewer 与 Verifier；Verifier 仅能通过既有白名单 `run_check` 执行测试，失败进入 `needs_user`。新增 fake fixture 已验证分析 → review → verify 闭环。
