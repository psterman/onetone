# 可构造场景准备清单 — 2026-10-05

先准备再验收。每场景结束后执行「恢复」，避免污染下一场景。

**门控：** 真实 Provider 验收仅在显式设置 `ONETONE_AGENT_REAL_INTERRUPT_E2E=1` 后执行。  
**证据目录：** `docs/acceptance-artifacts/20261005/real-provider/{C1,U1,X1,...}/`

---

## 如何创建真实活动测试会话

通用流程（C1 / U1 / X1–X4 均适用）：

1. **启动真实 Provider**
   - Claude Code / Codex CLI / Cursor IDE 之一，使用本机已安装版本。
2. **打开工作区**
   - 在 Provider 中打开 `E:\voice-pilot`（或已确认的 git 根）。
3. **创建等待型任务（不改文件）**
   - 示例 prompt：「请只回答：等待确认。不要修改任何文件，不要运行命令。」
   - 保持会话处于 **active / working / waiting**（依 Provider 语义）。
4. **保持会话活跃**
   - 不要关闭窗口；不要发送会结束会话的指令；必要时每 2–3 分钟 ping 一次。
5. **记录会话元数据**（写入 `real-provider/_session-log.txt`）

   ```text
   provider: claude | codex | cursor
   sessionId / externalSessionId:
   projectRoot: E:\voice-pilot
   projectId: (from snapshot)
   pid:
   hwnd:
   startedAt:
   ```

6. **用 Agent Center snapshot 确认状态**
   - OneTone 首页 → Agent 名册 → 刷新
   - 或 IPC：`cmd_agent_center_snapshot` / `cmd_agent_registry_refresh`
   - 确认目标 agent 行：`presenceState`、`observedStatus`、`agent.interrupt` 的 `enabled`/`reason`/`support`
7. **执行中断**
   - 名册行「停止」或 Agent Center 详情中断
   - IPC：`cmd_agent_center_action` `{ agentId, actionId: "agent.interrupt", attemptId }`
8. **记录 action result**

   ```text
   outcome:
   ok:
   verified:
   attemptId:
   error: (如有)
   toast: (截图或原文)
   ```

9. **再次刷新 snapshot**
   - 对比中断前后 `observedStatus`、`work.status`、interrupt action 的 `enabled`/`reason`
   - 保存刷新后 snapshot JSON 到对应场景目录

---

## Claude（C1）

| 步骤 | 操作 |
|------|------|
| 准备 | Claude Code 在 `E:\voice-pilot` 运行等待型任务；`observedStatus.value=working` 且 fresh |
| 验收 | 中断 → **仅当后验 probe 确认 stopped** 时 outcome=**verified**；toast「已确认 Agent 已停止」 |
| 禁止 | 无 probe 确认不得 Verified |
| 恢复 | 关闭测试会话或允许 idle；清理 `_session-log` 标记 |
| 证据 | `real-provider/C1/action-result.json`、`snapshot-before.json`、`snapshot-after.json`、截图 |

---

## Cursor（U1）

| 步骤 | 操作 |
|------|------|
| 准备 | Cursor 前台打开 `E:\voice-pilot`；Agent 运行中或可热键中断 |
| 验收 | 中断 → outcome=**attemptedUnverified**；toast「已发送停止，尚未确认」类；**UI 不得出现 Verified** |
| 禁止 | Cursor **永远**不得显示 Verified |
| 恢复 | 手动确认 Cursor 窗口状态 |
| 证据 | 同上，目录 `real-provider/U1/` |

---

## Codex（X1–X4）

| ID | 准备 | 验收要点 | 恢复 |
|----|------|----------|------|
| X1 | Codex **inactive** exact external session（可归因、window 证据齐全） | ForceFresh 后 inactive → **Verified**；记录 outcome/ok/verified/attemptId | 清理测试标记 |
| X2 | Codex **active** session 保持运行 | ForceFresh 后仍 active → **AttemptedUnverified**；不得 Verified | 允许正常结束 |
| X3 | **不同 session id** 或切到无关窗口后再中断 | session mismatch → **AttemptedUnverified** | 回到原窗口 |
| X4 | 断开 Codex probe 或 ForceFresh 超时/失败 | probe fail → **AttemptedUnverified**；不得 Verified | 恢复 probe/CLI |

每项证据目录：`real-provider/X1/` … `real-provider/X4/`

---

## 错误文案（E1–E5）— fixture UI 投影

| ID | 准备 | 预期文案 | 恢复 |
|----|------|----------|------|
| E1 | 关闭目标 Agent 窗口（no_window_target） | 窗口不可定位 | 重开目标窗口 |
| E2 | 清除 Cursor mapping（no_mapping_target） | 没有可定位的 Cursor 控制目标 | 恢复 mapping |
| E3 | 使用过期 evidence（等 TTL 过期或不刷新） | **控制证据已过期** | 刷新 snapshot |
| E4 | 选择尚未接入 probe 的 provider（ProbeNotImplemented） | 本机检测尚未接入（≠ 不支持） | 无持久破坏则跳过 |
| E5 | 选择明确 unsupported provider | **不支持**（与 E4 不同） | 同上 |

证据：`roster-webview/roster-e1-e5.json`（fixture WebView；**非**真实 Provider 来源）

---

## UI / Toast（V*）— 无需特殊后端污染

| ID | 准备 | 日志 |
|----|------|------|
| V1 | 窗口缩至 ≤680 宽 | 截图 + DOM 状态 |
| V2 | 依次切换全部筛选 | 同上 |
| V3 | 等 working freshUntil 过期 | `roster-v3.json` |
| V4a–c | 合成或真实 outcome | `roster-v4-ui.json`；真实动作记 attemptId |

---

## 统一证据模板（每项）

```text
ID:
操作:
实际:
截图:
日志:
outcome:
ok:
verified:
attemptId:
结果:   # 通过 | 阻塞：原因 | 失败：现象 | 未执行：原因
```

截图与该项要求的日志缺一 → 不得「通过」。  
fixture WebView 通过 **不得** 写成真实 Provider 通过。
