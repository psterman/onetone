# Capability Resolver Convergence + Honest Capability Projection — 报告

**日期：** 2026-10-05

## 正式交付口径

```text
Capability Resolver Convergence + Honest Capability Projection 已完成；
真实 Provider 中断闭环仍待 C1/U1/X1–X4 证据；
A4–A7 为验收工具阻塞；
export_history 和 disable_source 暂未接入。
```

禁止解读为「全面 Agent 管理已完成」或「所有真实场景已通过」。

### 后续分层

| 项目 | 建议 |
|------|------|
| C1 / U1 / X1–X4 | 近期唯一专项：真实会话 + 门控 + 写入 `real-provider/` |
| A4–A7 | 验收工具阻塞；不投入产品开发；不写成通过 |
| export / disable | 保持 `not_wired`；无明确场景/完整生命周期前不实现 |

---

## 1. Fixture / UI 已通过

| 项 | 状态 |
|----|------|
| V1–V4 fixture WebView | 通过 |
| E1–E5 文案分离 | 通过 |
| `projectAgentControl` 双维投影 | 通过 |
| 四卡总览（已发现/正在工作/可确认/尽力）+ 摘要行 | 通过 |
| 六张 home-* 视觉证据 | 通过（`roster-webview/`；2026-10-06 重跑：scroll pin + `ROSTER_HOME_SHOT`，非 hero-only） |
| Cursor 仅 usable interrupt → bestEffort | 通过 |
| 验收清单 `src/js/features/agent/agent-control-acceptance.js` | 已落地（claude/codex=pending；JSON 双源已删除） |
| Cursor 永非 Verified | 通过（投影 + toast） |

## 2. 真实 Provider

**无已通过场景。** C1/U1/X1–X4 为 `scaffolded / pending_manual`（清单+模板+`readiness.json` 已写；`NOT_EXECUTED.json` 仍 `executed=false`）。运行时**不**读取 `real-provider/`。

## 3. A4–A7

**验收工具阻塞**（CUA / winapp / agent-browser 等）。非 OneTone 功能缺陷；**不影响**本轮交付；**未**写成通过；**不**伪装成产品不支持。工具链具备后再单独验收。

## 4. 暂未接入 / 后续

- `export_history` / `disable_source`：Rust `not_wired`；UI 禁用或隐藏；无成功 toast
- 7 个 ProbeNotImplemented 探针（本轮不补）
- C1/U1/X1–X4：近期真实 Provider 专项（见正式交付口径）

## 5. 不能宣称的范围

- 全面 Agent 管理已完成
- 所有 Agent 支持可靠中断 / 能力已统一
- C1/U1/X1–X4 已通过（无真实证据时）
- A4–A7 通过
- export_history / disable_source 已可用
