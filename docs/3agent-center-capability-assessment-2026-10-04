# 首页 Agent 能力评估（第四轮）：现在提升了多少

日期：2026-10-04 23:50 ｜ 评估人：复核者  
基线：`docs/agent-center-audit.md`（v1 原型，1.5 / 12 ≈ 12.5%）  
对象：**生产首页** `#homeWorkbench` → Now Home → `#homeAgentRoster`

## 结论

**从 1.5 / 12（12.5%）提升到 8.0 / 12（66.7%），+6.5 分，约 5.3 倍。**  
定性：v1 是 Attention Center；现在首页已具备 **Agent 名册（roster）**，agent 从"彩色小标签"升级为**可展开、带状态、带指标、带操作入口的一等行条目**。

## 逐条评分（同一把尺子）

| #  | 判据          | v1  | 现在  | Δ    | 现在的实现证据                                                                                                                                                                |
| -- | ----------- | --- | --- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 | Agent 是一等实体 | 0   | 1.5 | +1.5 | `home-focus-view.js:213 agentRosterHostHtml()` 在所有情境模板渲染 `<section class="hn-agent-roster-wrap">`；`agent-center.js paintHome()` 每 agent 一个 `<article class="har-row">` |
| A2 | Agent 级状态可见 | 0.5 | 1.5 | +1.0 | `AgentCenterAgent` 有 `presenceState / status / observedStatus / lastSyncAt / version / dataPath / formFactor / limitations`；首页露出状态灯+状态标签+同步时间+是否可续跑                    |
| A3 | Agent 级操作可达 | 0   | 1.5 | +1.5 | `resolve_actions()` 8 个动作槽，首页 7 个按钮（`homeActionButtons`）：resume / checkpoint.preview / focus / interrupt / open_config / open_data / export_history                    |
| A4 | Agent 级指标聚合 | 0.5 | 1.5 | +1.0 | `AgentCenterMetrics` 5 项（今日会话/成本/tokens/均时/成功率），首页展开显示 4 项；`MetricValue` 有"未知"态，不编造                                                                                    |
| A5 | Agent 级洞察   | 0   | 0.5 | +0.5 | 后端算了 `recommended_agent_id`，**前端首页未使用**（仅 `agent-center.js:595` 一个 getter + fixture 里的 `kind:codex`）；有 recentWork / evidence / limitations，无"擅长什么/该不该换"                |
| A6 | 未接入可见且可解释   | 0.5 | 1.5 | +1.0 | `AgentCenterGroups` 四分组（needsAttention / connected / discoveredLimited / supportedNotFound）+ 首页折叠「显示全部支持的 Agent (n)」+ `limitationReason` / `evidence`                  |

**合计 8.0 / 12 ≈ 67%**

## 结构性变化（本次最大跃迁）

v1 缺的那张表补上了：`agent_memory/registry.rs` + `store.rs` migration **v5 `agent_registry`**（含 `version / dataPath / lastSyncAtMs / presenceState / adapterState / limitationReason`），由 `agent_install_inventory` 探测结果 upsert。  
IPC `cmd_agent_center_snapshot` / `cmd_agent_center_action` 已注册（`lib.rs:1210/1212` + permissions toml），前端 `agent-center.js` 直连生产 IPC，**不回落 fixture**（文件头硬约束）。

## 验证记录（实跑）

| 项                      | 命令                                           | 结果                             |
| ---------------------- | -------------------------------------------- | ------------------------------ |
| 首页名册守门测试               | `node scripts/test-home-agent-roster.mjs`    | ok                             |
| Agent Center 测试        | `node scripts/test-agent-center.mjs`         | ok                             |
| 默认面守门测试                | `node scripts/test-home-default-surface.mjs` | ok（desk default on）            |
| Rust 编译 + agent_memory | `cargo test --test agent_memory_plan_b`      | 1 passed（`Finished test`，编译通过） |

## 仍然没拿到的 4 分（缺口清单）

1. **（-1.0 A5）推荐能力空转**：`recommended_agent_id` 后端算了、前端不用。缺"该用哪个 agent"的落点。
2. **（-0.5 A2）版本/数据路径不露面**：后端有 `version` / `dataPath`，但首页 detail 只渲染了指标+同步时间，**未渲染版本与路径**。而这两项是运维价值最高的字段。
3. **（-0.5 A3）真动作只覆盖 2 个 agent**：`session.resume` 需 `kind ∈ {Claude, Codex}` 且有 lane（Cursor 明确 `no_resume`）；`export_history` / `disable_source` 恒 `not_wired`（按钮带 reason 禁用，诚实但不可用）。
4. **（-0.5 A6）7 个 CLI agent 探测是空实现**：`agent_install_inventory.rs:166-167` 中 `CopilotCli / CopilotVscode / Gemini / Cline / Roo / OpenCode / Aider => {}` —— 这 7 个永远不会产生证据，首页恒为「支持但未发现」。实际有探测逻辑的只有 9 个 kind。
5. **（-0.5 A1）名册仍是首页的次级分区**，不是骨架：主 CTA 仍是「开始听写」，agent 名册排在 desk / progress 之后。这是 fusion-g 的既定设计（首页=编码启动页），不是缺陷，但意味着"Agent 中心"仍未成为首页本体。

## 状态与风险

- 本次 Agent Center **全部为未提交改动**（`?? src-tauri/src/agent_memory/{agent_center,registry,claude_background,codex_work_meta}.rs`、`?? src/js/features/agent/agent-center.js`、`?? src/css/home-agent-roster.css`）。
- 已通过 node 静态测试与 cargo 编译，**未经 Tauri 真机人工验收**（名册在真实 IPC 下的首帧、冷启动、Cursor 7.6GB 限流路径均未跑过）。
- 建议下一步优先级：P0 提交并真机验收 → P1 首页露出版本/数据路径 → P2 用上 `recommended_agent_id` → P3 补 7 个 CLI probe。
