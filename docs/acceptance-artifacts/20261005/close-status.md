# Evidence fill / close status — 2026-10-05

**交付名称：** Capability Resolver Convergence + Honest Capability Projection

## 分层状态（强制区分）

| 段 | 状态 | 证据 |
|----|------|------|
| V1–V4 | **通过（fixture WebView）** | `roster-webview/` 截图 + JSON |
| E1–E5 | **通过（fixture UI 投影）**；真实来源尚未验收 | `roster-e1-e5.json` |
| UI/范围收敛 | **完成** | `projectAgentControl` + 四卡总览 + `agent-control-acceptance.js` |
| A4–A7 | **验收工具阻塞**（非产品缺陷；非本轮关闭阻塞） | CUA / winapp / agent-browser 等工具链未具备；人工截图布局；不写成通过、不伪装成产品不支持 |
| C1 / U1 / X1–X4 | **harness 已落地；U1 实跑 blocked**（尚无通过） | `real_provider_e2e` + `U1/BLOCKED.json`（`not_running`）；`NOT_EXECUTED.executed=false` |
| export / disable | **暂未接入**（`not_wired`） | UI 禁用或隐藏；无成功 toast；非本轮产品能力 |

**不得**把 fixture WebView 通过写成真实 Provider 通过。  
**不得**写「全部真实场景通过」或「全面 Agent 管理已完成」。

## 正式交付口径（当前）

```text
Capability Resolver Convergence + Honest Capability Projection 已完成；
真实 Provider 中断闭环仍待 C1/U1/X1–X4 证据；
A4–A7 为验收工具阻塞；
export_history 和 disable_source 暂未接入。
```

## 后续分层（按价值与可控性）

| 项目 | 建议 | 原因 |
|------|------|------|
| C1 / U1 / X1–X4 | **近期专项**：真实会话 + 门控 + `action-result` / attemptId / 前后 snapshot / 截图日志 → 写入 `real-provider/` | 直接补 Claude/Codex 中断可信度缺口 |
| A4–A7 | 暂不投入产品开发；工具链具备后单独验收 | 验收工具缺失，非 OneTone 功能缺陷 |
| `export_history` | 暂不实现（无明确用户场景则保持 `not_wired`） | 新增产品能力，不影响 Capability Resolver 主线 |
| `disable_source` | 暂不实现（完整生命周期管理前保持 `not_wired`） | 权限/状态/持久化/恢复语义范围扩大 |

仅当产品目标明确升级为「完整 Agent 管理中心」时，才同时投入 A4–A7、导出历史与禁用 Agent。

## 本轮明确边界

- 不追求 Cursor Verified
- 不追求全部 Agent 能力一致
- 不在本轮补齐 7 个 ProbeNotImplemented 探针
- 不引入完整第三方 orchestrator
- `disable_source` / `export_history` 保持 `not_wired`（隐藏/禁用主操作；无成功 toast）
- A4–A7 标为验收工具阻塞，**不**写成通过

## Close conditions

| 条件 | 满足？ |
|------|--------|
| V/E fixture 有截图或 JSON | 是 |
| 四卡总览 + 统一投影函数 | 是 |
| 六张 home-* 新版截图 | **是** — `AgentRoster` E2E PASS（2026-10-06）；`.hn-canvas` scroll+`ROSTER_HOME_SHOT` 断言；五张见名册四卡/筛选，confirmable 见展开详情+尚未接入 |
| Cursor 无条件 bestEffort 已修 | 是 |
| 验收清单单一来源（JS） | 是 |
| `npm run build` | 见下方构建记录 |
| C1/U1/X1–X4 真实 action-result | 否（近期专项） |
| A4–A7 | 否（验收工具阻塞） |
| export / disable | 否（`not_wired`） |

## 构建记录

`npm run build`（2026-10-05，约 9.5 分钟）：

- `release` 编译：**通过**（`src-tauri/target/release/onetone.exe`）
- NSIS 安装包：**已产出**（`OneTone_1.0.0_x64-setup.exe`）
- 进程退出码：**1** — updater 签名步骤缺 `TAURI_SIGNING_PRIVATE_KEY`（公钥在、无私钥）；**非本轮首页投影代码失败**

签名环境未配置时，不得宣称「完整 `npm run build` 绿」；可宣称 release 产物已编出。

## AgentRoster home 截图复测（2026-10-06）

```text
scripts/rebuild-and-run-tauri-e2e.ps1 -AgentRoster -TimeoutMinutes 30
→ done=pass / shots=19 / e2e-run.meta.json status=pass
```

- 证据：`docs/acceptance-artifacts/20261005/roster-webview/home-*.png` + `home-shot-*.json`（副本在 `20261006/roster-webview/`）
- 断言：`ROSTER_HOME_SHOT` 要求 `inView` + `canvasScrollTop>80`；overview `statCount>=4`
- 分层边界不变：近期仅建议补 C1/U1/X1–X4；A4–A7 验收工具阻塞；export/disable 保持 `not_wired`
