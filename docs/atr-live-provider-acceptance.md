# ATR 同题真实验收记录（WorkBuddy / Soft Pad）

> Updated: 2026-10-31  
> Spec: accept_spec_version = 1（后端权威）

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
| WorkBuddy | Rust ATR PASS | **真实 provider 未验证** | 需登录后点「隔离验证」 |
| Soft Pad DeepSeek | PASS | **真实 provider 未验证**（blocked_no_key） | 见 atr-deepseek-e2e-acceptance.md |

**默认引擎结论：待定。**交互分层文案不为「已稳定」。

## 自动化

- `node scripts/test-atr-send-conflict.mjs`
- `node scripts/test-atr-provider-switch.mjs` — FE 不再用 localStorage→editCapable；无硬编码沙箱路径
- `node scripts/test-atr-home-edit-loop.mjs` — 无后端 grant 时 `provider_not_edit_capable`
- `cargo test --lib agent_task_runtime` — 含 admit gate / 双绑拒 / 伪造预期无效 / config_drift / fake 免检
