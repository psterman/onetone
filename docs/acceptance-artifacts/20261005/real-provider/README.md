# 真实 Provider 中断验收证据 — C1 / U1 / X1–X4

**状态：harness 已落地；U1 首次实跑 = 诚实阻塞（非通过）**

**优先级：** 近期**唯一建议专项**。证据齐备前，正式口径仍为「真实 Provider 中断闭环仍待 C1/U1/X1–X4」。

## 门控与 runner

1. 按 [`scenario-prep.md`](../scenario-prep.md) 准备**可中断**的真实活动会话（Cursor 需 `observedStatus=working` 且 mapping 可用）
2. `$env:ONETONE_AGENT_REAL_INTERRUPT_E2E = "1"`
3. **禁止** `ONETONE_E2E_DATA_ROOT`
4. 跑单场景：

```powershell
# 先 cargo build（debug 即可）
powershell -NoProfile -File scripts/run-real-provider-scenario.ps1 -Scenario U1
```

或只初始化清单：`scripts/run-real-provider-interrupt-e2e.ps1`

Rust harness：`src-tauri/src/real_provider_e2e.rs`（env 门控；生产 AppData）

## 2026-10-06 U1 实跑

| 项 | 结果 |
|----|------|
| 门控 | 已设 |
| Cursor 行 | `kind:cursor` 在 snapshot 中 |
| interrupt.supported | true（hotkey） |
| interrupt.enabled | **false** |
| reason | `not_running` |
| observedStatus | `unknown` |
| e2e-done | `fail:interrupt_not_enabled` |
| 结论 | **blocked** — 见 `U1/BLOCKED.json`；**不得**写成通过 |

同次 snapshot 附带诊断：Codex `observedStatus=working` 但 interrupt `provider_unsupported`（无可用 control plane）→ X* 同样尚未可跑。

## 目录

```text
real-provider/
  readiness.json
  NOT_EXECUTED.json          # executed=false 直到有真实通过的 action-result
  U1/
    snapshot-before.json
    action-result.json       # blocked payload
    BLOCKED.json
    e2e-done.txt
  C1/ X1/ …                  # checklist + templates
```

## 验收规则（通过时）

- Cursor（U1）：**不得** Verified → harness 断言 `acceptance.json`
- Codex X3/X4：**不得** Verified
- Claude/Codex 仅后验确认成功才 Verified

## 禁止

- 不得用 fixture WebView 冒充本目录
- 不得把 `blocked` / `interrupt_not_enabled` 写成通过
- 不得把进程在跑写成场景已验收
