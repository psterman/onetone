# GitHub Vibe Coding 方案归纳

## 参考项目

- **OAgent**：多会话聊天、项目上下文、Git/文件/终端/MCP 集成，强调本地工作区与会话持久化。[GitHub](https://github.com/samhu1/openagent)
- **Archon**：项目聊天、工作流运行、实时工具调用、运行历史与步骤详情，强调可重复流程。[GitHub](https://github.com/tsubouchi/archon)
- **Maestro**：项目 → 会话 → Agent → 预览/终端/PR 的监督式工作台，强调并行工作和人工控制。[GitHub](https://github.com/tinhtran24/maestro)
- **Overture**：Agent 执行前先把计划可视化为流程图，强调可解释性和信任。[GitHub](https://github.com/SixHq/Overture)
- **OpenAgentd**：聊天、工具调用、文件 diff、命令面板、记忆和 worktree 集成，强调“不是聊天框，而是工作台”。[GitHub](https://github.com/CodewithMubasher/OpenAgent)

## 四种可借鉴模式

| 方案 | 起点 | 核心反馈 | 适合 OneTone 的部分 | 风险 |
| --- | --- | --- | --- | --- |
| A 项目会话 | 选择项目后开始聊天 | 对话与上下文 | 最容易承接现有 Agent 和记忆 | 仍可能像普通 AI 客户端 |
| B 任务流程 | 选择一个目标/任务 | 阶段和下一步 | 适合帮助用户理清思路 | 流程太硬会限制探索 |
| C 运行监督 | 选择正在运行的 Agent | 工具、文件、测试实时状态 | 适合执行中和失败恢复 | 首页容易变成监控面板 |
| D 计划画布 | 先看计划再执行 | 可编辑节点和依赖 | 适合复杂任务和信任建立 | 新手启动成本最高 |

## 推荐方向

不是四选一，而是分层组合：

1. 默认采用 **A 项目会话**，让用户自然开始。
2. 对话中按需出现 **B 任务流程**，帮助用户把想法变成下一步。
3. Agent 工作时切换到 **C 运行监督**，展示真实动作而非抽象状态。
4. 只有复杂任务才展开 **D 计划画布**。

这会让首页保持简约，同时真实连接 OneTone 的项目、Agent、语音、按键、历史和验证能力。
