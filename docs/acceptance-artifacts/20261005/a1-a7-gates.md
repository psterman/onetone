# A1–A7 gate log — 2026-10-05

统一字段：时间、PID、窗口句柄、exe 路径、CUA 返回值、失败原因

## 本地门禁（脚本）

| ID | 检查 | 结果 | 时间 | PID | hwnd | exe | CUA/脚本返回 | 失败原因 |
|----|------|------|------|-----|------|-----|--------------|----------|
| A1 | OneTone 进程存在 | PASS | 2026-10-05 16:29:30 | 22140 | 13436546 | target\debug\onetone.exe | Get-Process onetone | — |
| A2 | MainWindowHandle != 0 | PASS | 同上 | 22140 | 13436546 | 同上 | MainWindowHandle=13436546 | — |
| A3 | 窗口标题可读 | PASS | 见 diagnose-desktop.txt | 22140 | 13436546 | 同上 | diagnose EnumWindows | — |

## CUA / winapp 探测（收尾轮 2026-10-05）

| 工具 | 结果 | 说明 |
|------|------|------|
| `winapp` CLI | **MISSING** | `Get-Command winapp` 未找到 |
| `cua` CLI | **MISSING** | `Get-Command cua` 未找到 |
| `agent-browser` CLI | **MISSING** | `Get-Command agent-browser` 未找到 |
| Cursor Agent 会话 native surface API | **无** | 无 listWindows / getApp / AX invoke |

## CUA 一次恢复尝试（历史）

| 步骤 | 时间 | 结果 | 返回值 / 说明 |
|------|------|------|----------------|
| 探测本机 cua_node / node_repl | 2026-10-05 16:29:30 | 进程存在 | cua_node + node_repl 在跑（OpenAI Codex runtime） |
| 本 Cursor Agent 会话暴露 listWindows / getApp / getState | 同上 | **无** | 工具面无 Windows native surface API |
| 重启 Codex/桌面插件后复验 A4 | 同上 | **FAIL（计一次）** | 会话仍无可用 CUA 绑定面；按计划**不再重试** |

| ID | 检查 | 结果 | 时间 | PID | hwnd | exe | CUA 返回值 | 失败原因 |
|----|------|------|------|-----|------|-----|------------|----------|
| A4 | 列出 Windows app surface | FAIL | 2026-10-05 16:29:30 | 22140 | 13436546 | debug\debug\onetone.exe | 无 listWindows/getApp；无法列出 surface | 本 Agent 会话无 Windows native surface（非 OneTone 未启动） |
| A5 | 绑定 OneTone hwnd | FAIL | 同上 | — | — | — | 未执行（A4 失败） | 依赖 A4 |
| A6 | 截图 | FAIL | 同上 | — | — | — | 未执行 | 依赖 A5 |
| A7 | 点击 + AX/UI | FAIL | 同上 | — | — | — | 未执行 | 依赖 A5 |

## 通道结论

```text
CUA A4–A7：阻塞（一次恢复失败，立即停 CUA）
模式：人工验收
桌面启动门禁 A1–A3：通过
```

**不再循环重启 CUA。** 真实矩阵改由人工按 V→E→C→U→X + 统一证据模板填写。
