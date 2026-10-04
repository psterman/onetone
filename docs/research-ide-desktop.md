# IDE / 桌面端 AI 编辑器「对话历史 & Agent 会话」存储调研

> 调研日期：2026-10-04 · 目标：为「聚合多 AI coding agent 历史与状态的一站式桌面板」做可解析性选型  
> 结论导向：**只有 Cursor / Antigravity / VS Code 系扩展可被第三方稳定读取；Trae 已加密，Qoder 需按版本分流。**

---

## 0. 总览评级表

| 工具                     | 主存储路径（Windows）                                                                                     | 格式                                          | 可解析性           | 备注                               |
| ---------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------- | -------------------------------- |
| **Cursor**             | `%APPDATA%\Cursor\User\globalStorage\state.vscdb`                                                  | SQLite `cursorDiskKV` + `composerHeaders` 表 | **A 直接可读**     | 全量本地，无任何加密                       |
| Cursor 辅助              | `%USERPROFILE%\.cursor\projects\*\agent-transcripts\*.txt/.jsonl`                                  | 纯文本/JSONL                                   | **A**          | 只写导出，回改无效                        |
| **Trae（旧 ≤2025）**      | `%APPDATA%\Trae*\User\workspaceStorage\<hash>\state.vscdb`                                         | SQLite `ItemTable`                          | **C 仅 prompt** | 只有用户提问，无回答                       |
| **Trae（新 2026）**       | `%APPDATA%\Trae CN\ModularData\ai-agent\database.db`                                               | **SQLCipher 4**                             | **D 不可读**      | 420MB/39 表，密钥在进程内存               |
| **Qoder（老 IDE）**       | `%APPDATA%\Qoder\User\globalStorage\state.vscdb`                                                   | SQLite                                      | **A-**         | 结构未公开，需探测                        |
| **Qoder CN（新）**        | `%APPDATA%\com.qodercn.app.stable\main.sqlite`                                                     | node:sqlite                                 | **B**          | 未加密但 `chat_sessions_v*` 分版本      |
| **Antigravity**        | `%USERPROFILE%\.gemini\antigravity-ide\conversations\<cascadeId>.db` + `brain\**\transcript.jsonl` | SQLite + JSONL                              | **A**          | 会话列表需本地 RPC 唤醒                   |
| **Continue**           | `%USERPROFILE%\.continue\sessions\*.json`                                                          | JSON                                        | **A**          | 最友好，有 `sessions.json` 索引         |
| **Cline / Roo / Kilo** | `%APPDATA%\Code\User\globalStorage\<ext-id>\tasks\*\api_conversation_history.json`                 | JSON                                        | **A**          | 每任务一目录                           |
| **Windsurf**           | `%APPDATA%\Windsurf\User\workspaceStorage\<hash>\state.vscdb`                                      | SQLite `ItemTable`                          | **B+**         | Cascade trajectory `.pb` 加密，不在范围 |

---

## 1. Cursor（重点）

### 1.1 目录结构

```
%APPDATA%\Cursor\User\globalStorage\state.vscdb        # ★ 全局库，所有会话正文（1-2GB）
%APPDATA%\Cursor\User\globalStorage\storage.json       # 遥测 ID / 窗口状态 / 最近打开
%APPDATA%\Cursor\User\globalStorage\conversation-search.db  # 自建 FTS5 索引（衍生缓存）
%APPDATA%\Cursor\User\workspaceStorage\<32hex>\state.vscdb  # 每项目小库（64-264KB）
%APPDATA%\Cursor\User\workspaceStorage\<32hex>\workspace.json  # {"folder":"file:///c%3A/..."}
%APPDATA%\Cursor\machineid                             # 稳定机器标识（遥测）
%USERPROFILE%\.cursor\projects\<slug>\agent-transcripts\  # 明文 transcript（写-only）
%USERPROFILE%\.cursor\ai-tracking\ai-code-tracking.db  # AI 代码归因，非会话数据
```

**关键澄清（提问点）**：composer 会话数据**始终在 `globalStorage/state.vscdb`**，不在 `.cursor` 目录。  
`.cursor` 下**没有** `composerData` 的独立 sqlite——`ai-code-tracking.db` 只做代码归因，`agent-transcripts/` 是纯文本镜像。  
来源：<https://dfirhub.com/artifact/cursor> · <https://github.com/skillsynchq/txcript/blob/main/docs/formats/cursor-desktop.md>

### 1.2 表结构

`state.vscdb` 有 3 张表（3.x+）：

```sql
CREATE TABLE ItemTable    (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);
CREATE TABLE cursorDiskKV (key TEXT UNIQUE ON CONFLICT REPLACE, value BLOB);  -- 注意 camelCase
CREATE TABLE composerHeaders(composerId, workspaceId, createdAt, lastUpdatedAt,
  isArchived, isSubagent, recency, checkpointAt, value, subagentTypeName);
```

来源（3.17.8 实测）：<http://agentgrep.org/backends/cursor-ide>

**`cursorDiskKV` 的 key 模式**（按 composerId 聚合）：

| key 模式                                                    | 内容                                                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `composerData:{composerId}`                               | 状态文档 `_v:13~17`：`modelConfig`、`fullConversationHeadersOnly:[{bubbleId,type}]`、`context`、`todos`、`gitWorktree` |
| `bubbleId:{composerId}:{bubbleId}`                        | 单条消息 `_v:3`，`type:1=用户 / 2=助手`；`text`/`richText`/`allThinkingBlocks`/`toolResults`/`createdAt`(RFC3339)       |
| `checkpointId::{cpId}` / `messageRequestContext::{msgId}` | 文件快照（Restore 用）／发给模型的完整请求上下文                                                                                  |
| `codeBlockDiff:` / `agentKv:blob:`                        | diff 接受拒绝状态／模型侧缓存（占比最大，可跳过）                                                                                   |

### 1.3 ★ 2025-2026 版本演进（老 key 是否废弃）

| 版本                     | 会话索引位置                                                                                                                                                                                            | 状态  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| Cursor ≤ 2.6（2025）     | **workspace DB** `ItemTable['composer.composerData']` → `{allComposers:[{composerId,name,createdAt,lastUpdatedAt,unifiedMode}], selectedComposerIds}`                                             | 已弱化 |
| Cursor 3.0（2026-04-02） | **global DB** `ItemTable['composer.composerHeaders']` → `{allComposers:[{...,workspaceIdentifier:{id,uri:{fsPath}}}]}`；一次性迁移，workspace DB 变 `{selectedComposerIds, hasMigratedComposerData:true}` | 过渡态 |
| Cursor 3.16+（2026）     | **独立 `composerHeaders` 表**（含 `workspaceId`/`recency`/`isSubagent`）；迁移记录写在 `composer.composerHeaders.migratedToTable`                                                                              | 当前  |

**不变的**：`cursorDiskKV` 的 `composerData:` / `bubbleId:` 内容格式 3 年来稳定（`_v` 从 13 涨到 17，向后兼容）。  
**废弃的**：`workbench.panel.aichat.view.aichat.chatdata`（极老）、workspace 侧 `allComposers`（3.0 后被清空）。  
**仍可用**：`aiService.prompts`（各 workspace 的 prompt 历史，纯用户提问）、`aiService.generations`。  
来源：<https://github.com/Callum-Ward/cursaves/blob/main/docs/how-cursor-stores-chats.md> · <https://www.pkgstats.com/pkg:cursor-migrate>

> ⚠️ 已知坑：3.0.16 曾出现 `composer.composerHeaders` 单 key 无限膨胀导致 Agent 面板崩溃（可安全 `DELETE FROM ItemTable WHERE key='composer.composerHeaders'`，正文在 `cursorDiskKV` 不受影响）。<https://dredyson.com/?p=56488>

### 1.4 可用 SQL 示例

```sql
-- (1) 会话清单（Cursor 3.16+，推荐）— 标题+时间+项目路径一次出
SELECT h.composerId, json_extract(h.value,'$.name') AS title,
       h.createdAt, h.lastUpdatedAt,
       json_extract(h.value,'$.workspaceIdentifier.id') AS wsId,
       json_extract(h.value,'$.workspaceIdentifier.uri.fsPath') AS projectPath,
       json_extract(h.value,'$.unifiedMode') AS mode
FROM composerHeaders h WHERE h.isArchived=0 ORDER BY h.lastUpdatedAt DESC;

-- (2) 老版本兜底：3.0~3.15 中央索引 / ≥2.x 的 workspace 侧 allComposers
SELECT value FROM ItemTable WHERE key='composer.composerHeaders';   -- global DB
SELECT value FROM ItemTable WHERE key='composer.composerData';      -- 每个 workspace DB

-- (3) 某会话消息列表（按 fullConversationHeadersOnly 顺序，唯一可靠排序）
WITH ord AS (SELECT json_extract(j.value,'$.bubbleId') bid, j.key seq
  FROM cursorDiskKV c, json_each(c.value,'$.fullConversationHeadersOnly') j
  WHERE c.key='composerData:a1b2c3d4-....')
SELECT o.seq, json_extract(b.value,'$.type') AS role,  -- 1=user 2=assistant
       json_extract(b.value,'$.text') content, json_extract(b.value,'$.createdAt') ts
FROM ord o LEFT JOIN cursorDiskKV b
  ON b.key='bubbleId:a1b2c3d4-....:'||o.bid ORDER BY o.seq;

-- (4) 全库会话枚举（不依赖 composerHeaders，最稳兜底）
SELECT DISTINCT substr(key,14,instr(substr(key,14),':')-1) composerId
FROM cursorDiskKV WHERE key LIKE 'composerData:%';

-- (5) 过滤空草稿会话 / 用户 prompt 历史 / FTS5 全文检索
SELECT count(*) FROM cursorDiskKV WHERE key LIKE 'bubbleId:a1b2c3d4-....:%';
SELECT value FROM ItemTable WHERE key='aiService.prompts';   -- workspace DB
SELECT id,title,updated_at FROM conversations WHERE id IN
  (SELECT id FROM conversation_fts WHERE conversation_fts MATCH '"关键词"');  -- conversation-search.db
```

**项目路径 join 链**：`composerHeaders.workspaceId`(32hex) → 读 `%APPDATA%\Cursor\User\workspaceStorage\<wsId>\workspace.json` 的 `folder` → `decodeURIComponent(folder.replace(/^file:\/\/\//,''))`（`%3A`/`%20` 必须解码）。

### 1.5 storage.json / machine-id

- `%APPDATA%\Cursor\User\globalStorage\storage.json`：`telemetry.machineId` / `telemetry.macMachineId` / `telemetry.devDeviceId` / `telemetry.sqmId` + 窗口状态 + 最近打开的工作区/文件。Cursor 用这四个 ID 做**反试用滥用设备指纹**。
- `%APPDATA%\Cursor\machineid`：另一个稳定机器标识，随遥测上报。
- 对桌面板的意义：**只用于「同一台机器上的多账号/多 profile 归并」**，不含会话内容；不要写入（会导致 Cursor 判定为新设备）。

---

## 2. Trae / Trae SOLO CN / TRAE CN

**目录**（VS Code fork，也是 vscdb）：`%APPDATA%\Trae\User\`、`%APPDATA%\Trae CN\User\`、`%APPDATA%\TRAE SOLO CN\User\`，配套 `%USERPROFILE%\.trae-cn\`（记忆/技能）。  
来源：<https://agentsview.io/configuration> · <https://bbs.voldp.com/archiver/tid-29946.html>

**两代存储并存**：

| 代           | 位置                                                   | key / 表                                                                                                                                                                               | 可拿到的内容                                                                                    |
| ----------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 旧（≤2025）    | `workspaceStorage\<hash>\state.vscdb` → `ItemTable`  | `icube-ai-agent-storage-input-history`                                                                                                                                                | 数组，每项 `{inputText, parsedQuery, multiMedia, timestamp}` — **只有用户提问**，response 不在本地（或只存云端） |
| 旧           | 同上                                                   | `memento/icube-ai-agent-storage`                                                                                                                                                      | `{list:[{sessionId,createdAt,updatedAt,messages}], currentSessionId}` — messages 常为空      |
| **新（2026）** | `%APPDATA%\Trae CN\ModularData\ai-agent\database.db` | **SQLCipher 4**：AES-256-CBC / PBKDF2-HMAC-SHA512 / 256000 iter / page 4096；39 表：`chat_session`(242) `chat_turn`(1561) `chat_message`(3116) `chat_message_general` `chat_message_task` | 完整问答，但**密钥首次启动随机生成并驻留进程内存**，离线不可解                                                         |

来源（含完整逆向解剖）：<https://forum.trae.cn/t/topic/18351>  
官方确认「导出的 database.db 是加密的，暂不支持查看」：<https://forum.trae.cn/t/topic/52906>  
AgentsView 亦声明「modern encrypted transcript layouts are detected and reported as unsupported」：<https://agentsview.io/configuration>

> **选型结论**：Trae 只能拿到 **用户 prompt**（旧版 vscdb），回答内容拿不到。除非走内存注入/官方 API，否则桌面板对 Trae 只能做「prompt 时间线」级聚合，不能做完整会话渲染。

---

## 3. Qoder / Qoder CN

| 形态                                            | 数据目录（Windows）                                                                                                            | 会话存储                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Qoder IDE（国际，老）                               | `%APPDATA%\Qoder\User\globalStorage\state.vscdb` + `workspaceStorage\<id>\state.vscdb`；机器 ID `%APPDATA%\Qoder\machineid` | vscdb（同 VS Code 约定）。第三方工具 `QoderSessionManager` 直接读写 `composer`/会话 key 做备份还原：<https://github.com/luckySpro/QoderSessionManager>                                                                                                                                                                      |
| JetBrains 插件                                  | `%APPDATA%\Code\User\globalStorage\coder.qoder\`                                                                         | 插件 globalStorage                                                                                                                                                                                                                                                                                     |
| **Qoder CN IDE（当前，`com.qodercn.app.stable`）** | `%APPDATA%\com.qodercn.app.stable\`                                                                                      | **无 state.vscdb**。用 Node 内置 `node:sqlite`：`main.sqlite` / `local.db` / `agents.db`，表 `chat_sessions_v*`、`chat_generated_image_assets`、`chat_session_sidebar_placements`，`schemaVersion: 64`，配 `sessionMigration`/`memoryMigration` 模块。凭据在 `auth.v1.dat`（Chromium OSCrypt v10 + AES-256-GCM，DPAPI 保护） |
| Qoder CLI (CN)                                | `%APPDATA%\Qoder\SharedClientCache\cli\projects\` / `~/.qoder-cn\projects\`                                              | JSONL                                                                                                                                                                                                                                                                                                |

来源：<https://www.cnblogs.com/imust2008/p/22852136（新架构解剖）·> <https://forum.qoder.com/t/qoder/12133/1（确认数据路径为> `com.qodercn.app.stable`）· <https://agentsview.io/configuration>

> **注意**：`chat_sessions_v*` 是**带版本后缀的表名**，v64 之后可能变成 v65。解析器必须按 `SELECT name FROM sqlite_master WHERE name LIKE 'chat_sessions_v%'` 动态定位，不能硬编码。

---

## 4. Antigravity（Google）

**三层架构**（最关键的是：UI 里的列表只是**缓存**，真身在 `.gemini`）：

```
① UI 缓存  %APPDATA%\Antigravity IDE\User\globalStorage\state.vscdb  ← 仅前端索引，重建即空白
② LS 守护进程  language_server_*.exe（127.0.0.1:<随机端口>，Connect RPC）
   header: Connect-Protocol-Version: 1 / X-Codeium-Csrf-Token: <从进程取>
   POST /exa.language_server_pb.LanguageServerService/GetCascadeTrajectorySteps
   body: {"cascadeId":"<id>","startIndex":0,"endIndex":N}
③ 持久层  %USERPROFILE%\.gemini\antigravity-ide\conversations\<cascadeId>.db   ← 每会话一个 SQLite
          %USERPROFILE%\.gemini\antigravity-ide\brain\<cascadeId>\.system_generated\logs\
              transcript.jsonl / transcript_full.jsonl + 各 artifact（内置 cascadeId）
（旧版）  %USERPROFILE%\.gemini\antigravity\conversations\*.pb  ← Protobuf 遗留格式
```

会话**永不删除**，只是「休眠」在磁盘；LS 读完 `.db` 广播 `antigravityUnifiedStateSync.trajectorySummaries`，UI 立刻回显。旧扩展失效原因：只认 `.pb`，不认新 `.db` + RPC。  
来源：<https://dev.to/ndondadaniel2020/how-to-restore-lost-chat-history-in-google-antigravity-ide-reverse-engineering-the-plan-mystery-15og> · <https://discuss.ai.google.dev/t/antigravity-2-0-converstion-full-empty/171365/5>


> **选型结论**：**直接可读**。桌面板可直接扫描 `conversations\*.db` + `brain\**\transcript.jsonl`。若想让会话出现在官方侧边栏，再多一步本地 RPC。注意 `.gemini` 目录在 `%USERPROFILE%` 而非 `%APPDATA%`。

---

## 5. VS Code 系（Continue / Cline / Roo / Kilo / Windsurf）

| 扩展 | 路径 | 结构 |
|---|---|---|
| **Continue** | `${CONTINUE_GLOBAL_DIR:-%USERPROFILE%\.continue}\sessions\` | `sessions.json` = 索引 `[{sessionId,title,dateCreated,workspaceDirectory}]`；`<uuid>.json` = `{sessionId,title,workspaceDirectory,history:[{message:{role,content,toolCalls},contextItems:[...]}]}`。`content` 可能是 string 或 parts 数组；`dateCreated` 可能是 ms-epoch 字符串或 ISO |
| **Cline**（老） | `%APPDATA%\Code\User\globalStorage\saoudrizwan.claude-dev\tasks\<ts>-<id>\` | `api_conversation_history.json`（含完整 tool 调用）、`ui_messages.json`、`context_history.json`、`metadata.json`、`checkpoints\`；MCP 配置在同目录 `settings\cline_mcp_settings.json` |
| **Cline**（新） | `${CLINE_SESSION_DATA_DIR:-%USERPROFILE%\.cline\data\sessions}\<id>\.messages.json` | 新版统一到 `~/.cline` |
| **Roo Code** | `%APPDATA%\Code\User\globalStorage\rooveterinaryinc.roo-cline\tasks\*\api_conversation_history.json` + `%USERPROFILE%\.roo\` | 同 Cline 老版结构 |
| **Kilo Code** | `%APPDATA%\Code\User\globalStorage\kilocode.kilo-code\tasks\*\api_conversation_history.json` | 同上 |
| **Windsurf** | `%APPDATA%\Windsurf\User\workspaceStorage\<hash>\state.vscdb`（`ItemTable`）+ `%USERPROFILE%\.codeium\windsurf\`（MCP/workflows/cascade history）+ `%USERPROFILE%\.windsurf\`（扩展/rules） | workspace chat 走 `ItemTable`；**Cascade trajectory 走加密 `.pb` protobuf，第三方不可读** |
| VS Code Copilot Chat | `%APPDATA%\Code\User\workspaceStorage\<hash>\chatSessions\*.json` | JSON/JSONL |

来源：https://vshulcz.github.io/deja-vu/guide/where-sessions-are-stored.html（35 个 agent 全表）· https://docs.rs/clustervision-core/latest/src/cv_core/harness/continuedev.rs.html · https://www.fast.io/resources/cline-settings-json-config-guide · https://gitmemories.com/kenn-io/agentsview/issues/998（Windsurf parser 明确声明 `.pb` 不在范围）

---

## 6. ★ 被占用的 state.vscdb 安全读取（WAL / Windows locked file）

Cursor / VS Code / Trae / Windsurf 的 `state.vscdb` 在进程运行期间**常驻打开**且为 **WAL 模式**，目录里同时存在：
```
state.vscdb      # 主库
state.vscdb-wal  # 预写日志，已提交但未 checkpoint 的事务在这里
state.vscdb-shm  # 共享内存索引（可重建，非必需）
```
**只 copy 主库 = 丢数据**（可能丢失最近提交，甚至得到不存在的一致性快照）。https://oneuptime.com/blog/post/2026-09-08-back-up-wal-mode-sqlite-safely/view

### 推荐方案（按优先级）

**① SQLite Backup API / VACUUM INTO（首选，官方一致性保证）**
```python
import sqlite3
src = sqlite3.connect("file:///C:/.../globalStorage/state.vscdb?mode=ro", uri=True)
dst = sqlite3.connect(r"C:\tmp\snap\cursor.vscdb")
src.backup(dst, pages=256, sleep=0.050)        # 增量拷贝，源库无需 quiesce
```
```bash
sqlite3 src.vscdb "VACUUM INTO 'C:/tmp/snap/cursor.vscdb';"   # 目标必须不存在/空
```

**② 三文件整体快照 + 只读打开（兜底）**
把 `state.vscdb` + `-wal` + `-shm` 一起复制到临时目录，再只读打开：
```python
con = sqlite3.connect("file:///C:/tmp/snap/state.vscdb?mode=ro&immutable=1", uri=True)
```
`mode=ro` 阻止写入；`immutable=1` 声明文件不变 → **无需 `-shm` 写权限**，绕过 `SQLITE_READONLY_RECOVERY`。需 SQLite ≥ 3.22。https://www.sqlite.org/wal.html

**③ Windows 锁定文件**：Electron 持 `FILE_SHARE_READ` 句柄，通常可读但内容会漂移 → 用 `robocopy /R:0 /W:0` 或 **VSS 卷快照**。独占锁时只能让用户退出 IDE，或退化为读 `agent-transcripts` / `brain/*.jsonl` 明文镜像。

**④ 通用防线**：`PRAGMA busy_timeout=5000`；快照后校验 `PRAGMA quick_check` 必须返回 `ok`；`value` 按 BLOB 读，`json_extract` 前先 `CAST(value AS TEXT)`。**全程只读，绝不写源库**（会破坏 IDE 状态）。

---

## 7. 对桌面板的落地建议

1. **优先做 Cursor**：`composerHeaders` + `cursorDiskKV` 一把梭，可拿全「标题+消息+时间戳+项目路径+模型+git 分支」。
2. **其次 Antigravity + VS Code 系**：前者 `.db`+JSONL，后者纯 JSON，成本极低。
3. **Trae 降级为「prompt 流」**：只展示用户提问时间线，标注「回答不可本地获取」。
4. **Qoder 做版本探测**：扫 `%APPDATA%` 下 `Qoder` / `com.qodercn.app.stable` / `QoderCN`，判 `state.vscdb` vs `main.sqlite`，再按 `sqlite_master LIKE 'chat_sessions_v%'` 动态定位表名。
5. **统一走「备份 API → 临时快照 → immutable 只读」**，绝不直接打开活库。
6. **`_v` 必须容错**：`composerData._v` 已到 17、`bubbleId._v` 到 3；未知版本只 warn 不崩。
