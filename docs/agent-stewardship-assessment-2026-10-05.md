# 首页 Agent 综合管理评估（第五轮）：按"信息 / 标题 / 操作 / 对话"重测

日期：2026-10-05 00:00 ｜ 触发：用户澄清口径
> "我更关注的是 agent 的综合管理，不一定是进度，包括信息，标题，操作，对话，方便 vibecoding 用户对整个 agent 圈的全面掌控"

## 为什么要换尺子

前四轮的 A1–A6 判据是从"实时态 / 注意力中心"长出来的，**偏向进度**：
它奖励"待办、续跑、活跃状态、实时感知"，不奖励"标题可读、对话可看、历史可查、信息可核验"。
按那把尺子现在得 8.0 / 12（67%）。**按你说的这把尺子，只有 6.5 / 12（54%）。**
差的那 1.5 分，几乎全在"标题"和"对话"上。

## 新判据（M1–M6，各 2 分）

| #   | 维度       | 合格标准                                          |
| --- | -------- | --------------------------------------------- |
| M1  | 名册与信息    | 全量 agent 可见；每个有形态/版本/数据路径/能力/健康/证据            |
| M2  | 标题与工作识别  | 每个会话有可读标题，一眼看出在干什么；不是 UUID，不是空                |
| M3  | 操作与控制    | 对 agent 和会话都能操作：聚焦/打开/续跑/中断/装 hook/配置/导出/禁用   |
| M4  | 对话与内容    | 能看到对话正文（提问 + 回答），能跨 agent 检索对话内容              |
| M5  | 聚合与跨圈视图  | 跨 agent 统一视图：统一时间线、成本/成功率对比、项目维度，不用来回切 app    |
| M6  | 诚实与可核验   | 每个数字可溯源到证据；读不到的明确说读不到，不假装有                    |

## 评分结果

| #   | 维度      | 得分    | 实勘证据                                                                                                                                                                                                    |
| --- | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | 名册与信息   | 1.5   | `AgentCenterAgent` 字段齐全（formFactor / version / dataPath / lastSyncAt / presenceState / resolvedCapabilities / evidence / limitations）；但**首页 UI 只露出状态灯+名称+同步时间，未渲染 version 与 dataPath**；16 个 kind 里只有 9 个有真探测（`agent_install_inventory.rs:166-167` 七个 CLI 是空实现 `{}`） |
| M2  | 标题与工作识别 | **0.5** | `agent_sessions.title` 可空，只有 Cursor header 能填（`cursor_adapter.rs:158`）；**`AgentLane.title` 在生产写入点全是 `None`**（`agent_lane/store.rs` 中带 title 的只有测试代码）；事件只有一行 `summary`。用户看到的是"Cursor · 刚刚"，看不出在干什么活                                |
| M3  | 操作与控制   | 1.5   | 8 个动作槽 / 首页 7 个按钮；但 `session.resume` 仅 Claude+Codex（Cursor 明确 `no_resume`），`export_history` / `disable_source` 恒 `not_wired`。**`agent_lane` 其实有更强的导航能力**（`can_focus_live` / `can_resume` / `can_open_exact_session`），但 Agent Center 只用了 `focus_session` 一处 |
| M4  | 对话与内容   | **0.5** | **没有任何 provider 的对话正文被读取。** `cursor_adapter.rs:1` 自述 "headers + user-turn observed (**no message body**)"，第 228 行 "never loads bubble message body"；`codex_work_meta.rs:1` 自述 "**no transcript FTS**"；`codex_session_scan.rs` 读 rollout jsonl 只解析状态事件、不保留正文；库里无 messages 表，全文索引只有 `memory_fts`（不覆盖会话）；前端 grep `lastMessage` 零命中 |
| M5  | 聚合与跨圈视图 | 1.0   | 有 per-agent 指标、recentWork、项目维度、四分组；但**没有跨 agent 统一时间线**（首页按 agent 分组，不是按时间），没有成本/成功率对比表，没有跨 agent 搜索                                                                                                      |
| M6  | 诚实与可核验  | 1.5   | 项目最强项：`MetricValue` 未知态、`limitationReason`、`evidence`、`freshness`（live/cached/stale）、`ResolvedAction::invariant_ok()` 有 debug_assert 守卫、生产 IPC 失败不回落 fixture。扣分点：`discovered:*` 的 `confidence=medium` 未向用户披露，标题为空时未明确显示"无标题"                          |

**合计 6.5 / 12 ≈ 54%**

## 根因：两套体系没打通

这是本次最重要的发现。项目里有**两套** agent 数据体系，各管一半，互不接线：

| 体系                                                   | 有什么                                                       | 缺什么             |
| ---------------------------------------------------- | --------------------------------------------------------- | --------------- |
| **A. `agent_memory` + Agent Center + Home Focus**（新，10-04） | 名册、指标、分组、动作、项目匹配、checkpoint、诚实降级                          | **不读对话正文**、标题近乎空 |
| **B. `pad_status` + `agent_lane` + adapters**（旧，Soft Pad） | 真实会话文件（Codex `rollout-*.jsonl`、`~/.codex/session_index.jsonl`）、Claude / Cursor hook、lane 状态机（Idle/Working/NeedsInput/DoneUnread/Error）、导航能力（focus live / resume / open exact session） | 只服务于状态灯，不做内容呈现   |

**接线实测**：`agent_center.rs` 全文只有 2 处引用 `agent_lane`，且仅是 `focus_session` 点击跳转 —— **lane 的标题、状态机、导航能力一个都没并进 Agent Center 快照**。
所以 A 在自己不熟悉会话的领域**重新造了一份更弱的 `agent_sessions`**（title 可空 + 一行 summary），而 B 手里那份更真的会话模型被闲置在状态灯里。

## 对 vibecoding 用户的实际体验（现在的真实答案）

| 用户想问                      | 现在能答吗                             |
| ------------------------- | --------------------------------- |
| 我装了哪些 agent，哪些能用？         | ✅ 能（四分组 + 未发现折叠）                  |
| 现在谁在跑、要不要我管？              | ✅ 能（needsAttention + 状态灯）         |
| **每个 agent 在干什么活？**       | ⚠️ 半能（只有状态 + 一行 summary，**没有标题**） |
| **上周让 Claude 改的那功能，当时怎么说的？** | ❌ **不能**（无对话正文、无检索）               |
| 哪个 agent 最烧钱 / 最靠谱？       | ⚠️ 半能（有数字，无跨 agent 对比与排序）         |
| 把这个会话挪到另一个 agent 接着干？     | ⚠️ 仅 Claude/Codex 可续跑，其余无          |

**一句话**：现在的产品是"**状态看板**"，还不是"**agent 圈的操作系统**"。它能告诉你谁活着、谁要你，但说不出"你们都在聊什么、聊过什么"。

## 建议路线（按性价比排序）

**P0 — 打通 A/B 两套体系（不写新解析器）**
把 `agent_lane` 作为会话级真源并入 Agent Center：lane 的 `title` / `state` / `navigation`（cwd + hwnd）直接给 Agent Center 用，删掉 `agent_sessions` 里重复且更弱的那份。这一步不动任何解析代码，收益最大。

**P1 — 补标题**
- 生产路径填充 `AgentLane.title`（现在全 None）：Codex 取 rollout 首条 user message，Claude 取 hook 上报的 prompt，Cursor 取 header name。
- 无标题时 UI 明确显示"未命名会话"，不要留空。

**P2 — 对话：先做"只读最近 N 条"，不要一次做全文检索**
- 优先 Codex（rollout jsonl 明文，已在扫）与 Claude（jsonl 明文）：只读 tail，渲染"提问 + 回答最后一段"。
- Trae 明确标注加密不可读（沿用既有 `trae.rs` 的诚实口径）。
- 跨 agent 全文检索放最后：需要新增 FTS 表 + 各 provider 解析器，成本高，先不做。

**P3 — 跨圈视图**
统一时间线（按时间而非按 agent 分组）+ 成本/成功率对比表 + 用上后端已算好的 `recommended_agent_id`。

## 状态提醒

- 本轮涉及代码（Agent Center 全套）**仍未提交**，仅过 node 静态断言 + `cargo test --test agent_memory_plan_b`（1 passed）。
- **未经 Tauri 真机验收**，尤其"真实 IPC 下名册首帧"与"Codex rollout 扫描在真机的表现"。
