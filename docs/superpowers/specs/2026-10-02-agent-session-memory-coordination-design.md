# Agent Session、项目记忆与 Provider 协同设计

## 1. 背景与问题

OneTone 首页改版后，Agent 数据页主要消费 overlay 的瞬时 usage snapshot，并将 `history` 固定为 `false`。项目虽然已经具备 Cursor `state.vscdb` 只读读取能力，但当前读取器只输出今日请求数、会话数和活跃时间，未建立可持久化的项目、session、事件和 checkpoint 关系。

因此问题不是 Cursor 没有数据，而是缺少：

```
Provider 数据 -> Provider Adapter -> 统一 Session/Event Store
              -> Snapshot Projector -> 首页当前状态、历史与恢复
```

## 2. 目标

1. 首页显示当前项目、当前 Agent 和当前 session。
2. 首页显示真实最近事件和历史 session，而不是固定的“无历史”。
3. Cursor session 根据 workspace/project 归属，优先关联当前项目。
4. Cursor、Claude、Codex 和其他 provider 通过统一事件模型协同。
5. 暂停、恢复、完成、失败状态可持久化并在重启后恢复。
6. 项目级 memory/context 可被不同 Agent 查询和复用。
7. 保持本地优先，SQLite 作为 canonical store。
8. 默认不保存 prompt/response 原文，不读取认证信息。

## 3. 外部方案借鉴

本设计借鉴结构思想，不复制完整代码或依赖。

| 项目 | 借鉴内容 | OneTone 落地 |
|---|---|---|
| [Memorix](https://github.com/AVIDS2/memorix) | Git project identity、SQLite canonical store、observation/session/Git/reasoning memory、跨 Agent 接入 | `ProjectIdentity`、本地 event/memory store、provider adapter、后续 MCP |
| [Kairo](https://github.com/sandeepbollavaram/Kairo) | checkpoint、continuation brief、任务恢复 | `Checkpoint`、`nextAction`、resume 入口 |
| [MCP Memory Service](https://github.com/doobidoo/mcp-memory-service) | 统一 memory API、检索和可扩展关系模型 | `MemoryProvider`、SQLite FTS5、后续 MCP/graph 扩展 |
| [Mem0](https://github.com/mem0ai/mem0) | memory 类型、事实更新、去重、长期记忆边界 | observation/decision/gotcha/task/context 分类和 source event |
| [LangGraph](https://github.com/langchain-ai/langgraph) | 显式状态机、事件驱动、可恢复状态 | session 状态流转和单一 `append_event` 入口 |
| [Continue](https://github.com/continuedev/continue) | IDE workspace context、上下文注入 | `ProjectContext` 和 provider-specific context adapter |

## 4. 核心数据模型

### 4.1 ProjectIdentity

```
project_id       稳定本地 ID
git_root         Git 根目录，可为空
workspace_path   当前 workspace 路径
display_name     项目显示名
detected_at      最近识别时间
```

解析优先级：当前前台 Agent/IDE 工作目录、workspace 文件或窗口路径、OneTone 当前工作目录；无法识别时使用 `unknown-project` 并标记 fallback。

### 4.2 AgentSession

```
session_id          OneTone 内部 ID
provider            cursor | claude | codex | copilot | ...
project_id          ProjectIdentity 引用
external_session_id provider 原生 ID，例如 Cursor composerId
title               脱敏标题或 provider 摘要
started_at / updated_at
status              created | running | waiting_approval | paused |
                    resumed | completed | failed
source              provider adapter 名称
metadata_json       受限、脱敏的 provider 元数据
```

唯一性建议：`provider + project_id + external_session_id` 建立唯一约束；无法取得外部 ID 时使用受控 fallback key，并标记低可信度。

### 4.3 AgentEvent

```
event_id
session_id
provider
event_type
timestamp
summary
detail_json
source_ref
```

第一批事件：`session_started`、`session_updated`、`task_started`、`task_paused`、`task_resumed`、`waiting_approval`、`checkpoint_created`、`task_completed`、`task_failed`、`observation_recorded`。

所有状态变化必须通过：

```
append_event(session_id, event_type, summary, metadata)
```

该入口在同一事务内插入事件、更新 session 状态、更新 latest event、必要时更新 checkpoint，并通知前端。禁止业务代码分别手写 `events.push` 和 `snapshot.latestEvent`。

### 4.4 Checkpoint

```
checkpoint_id
session_id / project_id
status
current_task
changed_files_json
pending_questions_json
next_action
last_event_id
created_at
```

checkpoint 只保存继续工作所需的结构化信息，不默认保存完整对话。

### 4.5 MemoryRecord

```
memory_id
project_id / session_id
memory_type      observation | decision | gotcha | task | reasoning |
                 summary | context
content
source_event_id
confidence
created_at / updated_at
supersedes_id
```

第一阶段使用 SQLite FTS5；向量索引、知识图谱和远程同步作为后续可选能力。

## 5. Provider Adapter

首页不直接读取 provider 私有结构，统一接口为：

```
identify_current_context() -> ProviderContext
discover_sessions(project) -> Vec<SessionCandidate>
read_session_events(session) -> Vec<ProviderEvent>
refresh_usage() -> UsageSnapshot
```

### 5.1 Cursor Adapter

继续使用 `%APPDATA%/Cursor/User/globalStorage/state.vscdb`，但需要：

1. 只读打开 SQLite，兼容 WAL 和 Cursor 锁。
2. 解析 composer headers、composer data 和 bubble metadata。
3. 使用 `composerId` 作为 `external_session_id`。
4. 使用当前 workspace/git root 做 session 归属。
5. 无法归属时保留 session，但标记 `project_match=unknown`。
6. 只保存时间、ID、类型和脱敏摘要。
7. 永远不读取或落盘 `cursorAuth/*`、access token、refresh token、cookie 和消息正文。
8. 数据库不可读时保留上一份 ready snapshot，并写入诊断事件，不清空历史。

### 5.2 其他 Provider

Claude、Codex、Copilot 和 shell Agent 先将现有 hook/statusLine/runtime 数据适配为统一事件。usage snapshot 继续作为 metrics 投影，但不再承担 session/history 职责。

## 6. 首页 IPC 与 DTO

新增：

```
cmd_agent_home_snapshot(project_hint?) -> AgentHomeSnapshot
```

返回：

```json
{
  "project": {},
  "activeSession": {},
  "agents": [],
  "recentSessions": [],
  "recentEvents": [],
  "checkpoint": null,
  "context": {},
  "asOf": "...",
  "diagnostics": []
}
```

`agent-data-bridge.js` 只负责调用 IPC、向 iframe 发送结果、处理刷新/授权/恢复；不得再设置 `history: false`。

没有数据时必须区分：未授权、数据库不存在、schema 不兼容、没有当前项目 session、项目确实没有历史。

## 7. 首页交互

首页 Agent 区域至少包含：当前项目、当前 Agent/session、最近事件、历史 session、checkpoint/继续任务、project context/memory。

空状态必须显示可操作原因，例如“Cursor 活动统计未启用”，而不是统一显示“没有内容”。

## 8. 隐私与安全

1. provider 数据默认本地处理。
2. Cursor 数据库只读访问。
3. 不读取认证表，不保存完整 prompt/response。
4. summary 必须脱敏并保留 source event。
5. memory 默认只在同一 project_id 内注入。
6. 未来 MCP/远程同步必须显式授权，并提供预览、删除和清理。
7. provider 读取失败不能覆盖已有历史。

## 9. 分阶段实施

### Phase 1：项目与 Cursor session 基础

交付 ProjectIdentity、Cursor session adapter、SQLite schema、`cmd_agent_home_snapshot` 和首页真实 session 展示。

验收：显示 `voice-pilot` 当前项目、Cursor composer/session、更新时间和明确的 fallback/consent 状态。

### Phase 2：统一事件与历史

交付 AgentEvent、`append_event`、session 状态机、事件时间线和真实 recent history。

验收：刷新/重启后历史保留；snapshot latest event 与 timeline 同源；pause/resume/completed/failed 均有事件。

### Phase 3：Checkpoint 与恢复

交付 checkpoint、continuation brief、继续任务入口。

验收：重启后能显示上次位置、变更文件、待处理问题和下一步动作。

### Phase 4：Memory/MCP/Context 协同

交付 MemoryProvider、SQLite FTS5、project context、MCP 查询入口和 provider context injection。

验收：不同 Agent 能查询同一项目 memory；memory 有来源事件；默认不跨项目泄露上下文。

## 10. 测试与诊断

必须覆盖：

- Cursor fixture 能发现 session 并生成稳定 external ID。
- workspace/git root 匹配和 unknown fallback。
- `append_event` 同时更新 event、session snapshot 和 latest event。
- pause/resume 状态转移。
- provider 读取失败不删除历史。
- secret key 和 message body 不进入持久化字段。
- `cmd_agent_home_snapshot` 返回 project、activeSession、recentSessions、recentEvents。
- 首页 iframe 渲染真实历史。
- consent 开关驱动读取和刷新。
- OneTone 重启后 SQLite 数据可恢复。

provider 边界日志只记录数量、ID hash、状态和耗时，不记录 token、prompt 或 response。

## 11. 明确不做

1. 不复制上述仓库的完整代码。
2. 不把所有 provider 的完整对话导入 OneTone。
3. 第一阶段不引入远程同步、向量数据库或复杂知识图谱。
4. 不以 usage quota 代替 session/history。
5. 不让首页直接查询 Cursor 私有 schema。
6. 不把 prototype 事件模型视为生产持久化实现。

## 12. 完成标准

1. 首页显示当前项目和真实 Agent session。
2. 首页显示持久化 recent events/history。
3. Cursor session 按当前 workspace/project 优先归属。
4. snapshot、timeline、checkpoint 由统一事件流投影。
5. provider 通过 project context/memory 协同。
6. 未授权、无数据和读取失败在 UI 中可区分。
7. 隐私边界和回归测试全部通过。
