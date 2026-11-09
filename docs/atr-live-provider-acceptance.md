# ATR 同题真实验收记录（WorkBuddy / Soft Pad）

> Updated: 2026-11-09  
> Spec: accept_spec_version = 1（后端权威）

## 产品回归总览（本轮）

| Layer | Status |
|-------|--------|
| Offline ownership regression (`test-run-contracts`, `test-controller-ownership`, `test-atr-chat-projection`, `test-atr-session-modules`, `test-runtime-gates`) | **PASS** |
| Offline chat lifecycle behavioral (`scripts/test-atr-chat-lifecycle.mjs` — DTO→reducer→snapshot) | **PASS**（本轮新增/升级） |
| Live WorkBuddy product acceptance (Gate7) | **OPEN**（rows `not_run`；无 desktop IPC / credentials） |
| **Overall ATR Product Regression** | **NOT PASSED** |

Call **ATR Product Regression PASSED** only when Gate7 WorkBuddy rows below are `pass` (not `not_run`) and no `plan_json` / ownership-fork reopen during that live pass.

## 状态口径

**前端错误准入已关闭；后端验收记录与任务归属已落地。后端执行准入与验收输入权威性已收口：** `api_drive` 强制 `assert_drive_admitted`；验收期望只信 `atr_verify_sandboxes`（FE 只传 `sandboxId`）；evaluate 校验配置指纹未漂移。

## 产品定义（勿混称）

| 路径 | 含义 |
|------|------|
| WorkBuddy | OAuth freemodel（账号模型） |
| DeepSeek 等 | Soft Pad API（密钥） |

`editCapable` **仅**由后端 `atr_edit_acceptances` 与当前配置指纹匹配授予。FE `localStorage` 不得开门。普通真 drive 无匹配 acceptance → `edit_not_admitted`（假驱动免检）。

## 能力分层

| 层 | 字段 | 证明 |
|----|------|------|
| 可聊天 | `chatReady` | 登录 / Soft Pad key |
| 可尝试编辑 | `tryEdit` | 前置条件；仅隔离验收路径 |
| 本机已验证 | `locallyVerified` | 后端 acceptance 命中当前指纹 |
| 普通可编辑 | `editCapable` | 同上（后端） |

隔离验证：`ensure_verify_sandbox` 登记 → `api_start(sandboxId)` 单任务绑定 → 真 drive → `evaluate_verify`（登记预期 + 指纹未漂移）。

FE 主路径：工作模式发送**不再经「生成执行计划」确认门**；若当前引擎尚无 `editCapable`，先静默跑隔离验证（`write_autonomous`），通过后再自动执行用户目标。手动「隔离验证」按钮仍可用。

## 本轮结果

| Provider | 假驱动 / 单元 | 真跑闭环 | 备注 |
|----------|---------------|----------|------|
| WorkBuddy | Rust ATR PASS；FE ownership + chat lifecycle PASS | **真实 provider 未验证** | Gate7 `not_run`；需登录桌面 + `ONETONE_GATE7_LIVE=1` |
| Soft Pad DeepSeek | PASS | **真实 provider 未验证**（blocked_no_key） | 见 atr-deepseek-e2e-acceptance.md |

**默认引擎结论：待定。**交互分层文案不为「已稳定」。

### Offline chat lifecycle（本轮升级）

Pure reducers in `atr-session-projection.js` (`reduceChatAtrEvent`, `settleChatAnswer`, `shouldIgnoreAtrEvent`, `noteChatRecovery`); HA2 keeps DOM/paint.

`node scripts/test-atr-chat-lifecycle.mjs` asserts five transitions via DTO/event → reducer → snapshot:

1. `running → done` — thinking + `answer|…` + `done` → one `fin_*` answer
2. `running → cancelled` — late `running` poll does not restore busy
3. `A → B → late A` — late A `done` does not mutate B binding/transcript
4. `waiting + user_input → resume` — no invented local `status:'running'`; busy from DTO
5. stall recovery — same `taskId` emits at most one recovery turn
6. `request_user_input` → waiting settles thinking chip + `needs_input`

Continue / step-0 ownership (projection pure helpers + HA2 paint; lifecycle case 7):

- `looksLikeWorkspaceMetaReply` / `resolveChatContinueGoal` / `chatContinueMaterialsSummary` live in `atr-session-projection.js`
- 「继续」remaps to last real user ask when bound goal is Gate7/repo meta; lean materials (no polluted prior_chat)
- Gate7/验收 assistant rows stripped from `chatHistoryMaterialsSummary`
- Continue with remapped goal abandons occupying chat task before redrive
- `startAndDrive` null / unbound `chat_loop_live` spinner clears after stall; turn-0 empty quiet hang force-redrives
- Chat prompt bans `inspect_workspace` for public facts; 「继续」stays on original goal

### Gate7 live checklist

Record: `scripts/gate7-work-atr-results.json` via `node scripts/test-work-atr-gate7.mjs`.  
Harness refuses mock-pass when desktop IPC is absent.

| ID | Pass criteria | Current |
|----|---------------|---------|
| `workbuddy_stream_complete` | thinking chip then **one** answer; task `done`; no duplicate `fin_*` | `not_run` |
| `workbuddy_cancel` | cancel mid-thinking; poll does not resurrect busy; ATR `cancelled` | `not_run` |
| `late_done_after_new_send` | A late `done` must not overwrite B | `not_run` |
| `waiting_user_input_resume` | clarify reply continues same task; busy from DTO | `not_run` |
| `interrupted_heal` | resume from DTO; no invented local `running` | `not_run` |

## 自动化

- `node scripts/test-atr-chat-lifecycle.mjs` — **本轮新增** behavioral offline lifecycle
- `node scripts/test-run-contracts.mjs` / `test-controller-ownership.mjs` / `test-atr-chat-projection.mjs` / `test-atr-session-modules.mjs` / `test-runtime-gates.mjs`
- `node scripts/test-work-atr-gate7.mjs` — Gate7 recorder（无 live IPC → honest `not_run`）
- `node scripts/test-atr-send-conflict.mjs`
- `node scripts/test-atr-provider-switch.mjs` — FE 不再用 localStorage→editCapable；无硬编码沙箱路径
- `node scripts/test-atr-home-edit-loop.mjs` — 无后端 grant 时 `provider_not_edit_capable`
- `cargo test --lib agent_task_runtime` — 含 admit gate / 双绑拒 / 伪造预期无效 / config_drift / fake 免检
