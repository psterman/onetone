# 语义动作契约（A + B-final）

产品与代码共同契约。A：目录 / 路由 / Pending store；B：统一运行时入口、共享 Picker、「动作与入口」、首页五态条与确认卡。

关联：[HABIT_UNIFIED_CONTRACT.md](./HABIT_UNIFIED_CONTRACT.md)。

## 产品定位

OneTone = 面向 Vibe Coding 的多模态控制中枢。Camera / Key / Voice / Soft Pad 触发**同一组语义动作**，经 `route_semantic_action` 与风险门后执行。

## 别名

| 旧 id | 规范 id |
|-------|---------|
| `startDictation` | `input.start` |
| `cancel` | `input.cancel` |
| `openAgent` / `focusComposer` | `agent.focus` |
| `stopOrSendDictation` | 按 `send_mode` → `input.send` / `input.commit`；执行仍用 `CommitPolicy::AutoConfig` |

显式 `input.commit` / `input.send` 使用独立 `CommitPolicy`（Never / Force）。

## 权威字段（B-final）

| 概念 | 权威含义 |
|------|----------|
| `channels` | 该入口是否允许**配置/触发**该动作（含 Camera 可绑定 `input.send` / `agent.approve`） |
| `requiresSecondChannelFrom` | 当 `sourceChannel` 落在此列表 → **Pending**，不可直执 |
| `RouteDisposition` | Rust enum：`Execute` \| `PendingConfirmation`（serde → `execute` \| `pendingConfirmation`） |
| Options.`bindable` | 当前 mapping/provider 下是否可**保存绑定** |
| Options.`executableNow` | 当前 `needsInputKind` 下是否可**触发**；**不**阻止预先绑定 |
| Options.`routeDisposition` | 由 `route_disposition(meta, channel)` 派生（禁止自由 String） |

**三不等价：** `bindable` ≠ `executableNow` ≠ 直执（`routeDisposition === execute`）。

派生（Options / Route / Catalog DTO / 测试共用唯一实现）：

```rust
fn route_disposition(meta: &SemanticActionMeta, channel: ActionChannel) -> RouteDisposition {
    if meta.requires_second_channel_from.contains(&channel.as_str()) {
        RouteDisposition::PendingConfirmation
    } else {
        RouteDisposition::Execute
    }
}
```

- `camera_pending_eligible` = Camera 且 disposition = PendingConfirmation
- Catalog DTO `cameraDirectForbidden` = `requires_second_channel_from` 含 `"camera"`（投影，非第二真相）
- `camera_may_execute_directly` = `route_disposition(meta, Camera) == Execute` 薄包装

`input.send` / `agent.approve`：`channels` 含 `camera`；`requires_second_channel_from: ["camera"]`。

## 统一绑定投影 ActionBindingView

存储仍分散（`agentBindings` / `cameraOverride` / `codexMicroPad`）。只读投影：

```text
ActionBindingView { mappingId, actionId, channel, trigger, enabled, risk, availability, sourceStorage }
```

编辑认 **`selectedMappingId`**，不得误用 `activeSceneId`。前端绑定以 Options `bindable` 为准（Catalog 仅展示）；未 hydrate **fail closed**。

## 运行时统一入口（P0）

`dispatch_semantic_binding` → 一律 `route_semantic_action`：

| 入口 | sourceChannel |
|------|---------------|
| 实体按键 | `key` |
| 语音 | `voice` |
| Soft Pad | `softPad` |
| Camera | `camera` |

Legacy Send Guard 仅拦裸 `send` / `submit` / `stopOrSend*`；正式 catalogue ID 走 Options + Route。

## Binding 身份

- 每 `mappingId + actionId + channel` 最多一个主绑定
- 新 `slotId` = `semantic:<channel>:<actionId>`；`bindingRef` = `slotId`
- Soft Pad 多键可指向同一 semantic slot

## Catalogue

字段：`category`、`availableWhen[]`、`requiresSecondChannelFrom`、`providerScope`（`none` / `currentTarget` / `providerAdapter`）、`implemented`、`executor`、`channels`、`cameraDirectForbidden`（投影）。

`availableWhen` 含 `"none"` = 空闲可出现。`waitingChoice` **保留枚举、首版无生产者**。

## 路由结果

`executed` | `pendingConfirmation` | `unavailable` | `unsupported` | `failed` | `cancelled`

## Pending

- 匹配键：`actionId + mappingId + providerId`
- 同作用域替换；多候选 `confirmation_ambiguous`
- `confirmationId` 与 actionId 不一致 → `confirmation_action_mismatch`（行保留、TTL 不刷新）
- Camera 不可自确认（行保留）；Key / Voice / Soft Pad 可完成
- cancel 不注入 Esc
- approve/reject 需目标前台 = mapping app_target，否则 `target_not_foreground`
- Camera `input.send` 创建 Pending **仅** `dictating`；否则 `unavailable`、不插 Pending
- Camera `agent.approve` 创建 Pending **仅** `waitingApproval`（且 Provider 支持）

## needsInputKind

首版：`none` | `waitingText` | `waitingApproval` | `agentRunning` | `dictating`

## Feature gates（三阶段 → 正式）

| 阶段 | `FEATURE_ACTION_PICKER_UI` | `FEATURE_DYNAMIC_CONTEXT_ACTIONS` |
|------|----------------------------|-----------------------------------|
| B-final.4 自动测试 | true | false |
| B-final.5 候选截图 | true | true（临时） |
| B-final.7 正式交付 | **true** | **true** |

前端读 catalog DTO 标志，不硬编码常量名。

## 屏幕确认

首页确认按钮归属 Soft Pad：`sourceChannel=softPad`。

### 验收证据两类（勿混用）

| 类型 | 位置 | 可否宣布 B 完成 |
|------|------|----------------|
| **组件 harness 截图** | Chrome + `logs/b-acceptance/harness.html`（mock Catalogue/Options/Pending/route） | **否** — 仅 DOM/CSS 视觉回归 |
| **真实 Tauri E2E** | `onetone.exe` 窗口：Camera 手势 → Rust Pending Store → Key/Voice/Soft Pad 确认；PrintWindow + 真实 `confirmationId` meta | **是** — 与 `npm run build:unsigned`（exit 0）一并满足后才可宣布 |

说明见 [`logs/b-acceptance/README.md`](../logs/b-acceptance/README.md)、[`logs/b-acceptance/GATES.md`](../logs/b-acceptance/GATES.md)。

**当前闸门（2026-08-11）：** `npm run build:unsigned` PASS + 真实 Tauri E2E PASS（`confirmationId: confirm-1`，见 `logs/b-acceptance/pending-complete.meta.json`）。

> Phase B 完成。

## 测试

`npm run test:semantic-action` · `npm run test:semantic-action-ui` · `npm run typecheck` · camera unit · cargo semantic_action  
验收构建：`npm run build:unsigned`（不关提交中的 updater；CLI 覆盖 `createUpdaterArtifacts:false`）  
正式签名构建仍用 `npm run build` + CI `TAURI_SIGNING_PRIVATE_KEY`。
