# Soft Pad State Core vs Output Adapters

OneTone 虚拟小键盘的状态以 **State Core**（`pad_status`）为唯一真相；Overlay / AG 灯 / 软 RGB 只做 **Output Adapters**，不得各自再判灯色。

## 边界

| 层 | 职责 | 不做什么 |
|----|------|----------|
| **State Core** | 归一化 `PadStatus`、仲裁、TTL、转移约束、jsonl 日志 | 不画 UI、不伪造 HID |
| **Input Adapters** | Codex Hook/App、**Claude Hook**、本地按键推断、可选 Native 槽 | 不直接改 Overlay DOM |
| **Output Adapters** | Overlay 灯环、AG00 CSS、meta/任务卡、**Soft RGB**、可选 HID（plan-only） | **只读** `pad_status` 快照；**不**伪造 HID / thstatus |

软件控制面止于「状态对象 + 展示」。**不**假装官方 Micro `READ_OUTPUT` / thstatus，也不把 Hook 标成 Native Micro。

## 诚实边界 / 非目标

- **AG00 / Soft RGB 读 Core** 不等于「全键只读 Core」：开启状态灯时，AG00 与 Overlay 灯环以 `pad_status` 为准；其它 AG / 非 AG 键仍可能在 `resolve_cell_run_status` 内走 native-first / inferred 的局部展示逻辑。
- **native thstatus 止损**：`v.oai.thstatus` 保留在 vendor/protocol 展示与关灯路径；不回灌 State Core 作为 Hook 真相，也不作为产品主路径依赖。
- **Claude adapter 现状**：当前是函数式 ingest 模块（Claude Hook → `agent=claude`），还不是通用 `AgentStatusAdapter` trait 体系。
- **多应用数字键盘现状**：仍靠 `mapping.app_target_id` 与现有路由；产品级 `activeApp` / `padFace` / `appProfile` 切换尚未实现，下一刀独立规划。
- **日志测试隔离**：单元测试使用临时 jsonl 与 path override，不应写入或弄脏产品运行日志 `logs/pad-status.jsonl`。

## `PadStatus` 字段

- `state`: `idle` \| `running` \| `needs_input` \| `done` \| `error` \| `offline`
- `phase`: 可选（如听写 `hold` → UI 映射为 `listening`）
- `source`: `native` > `hook` > `app` > `inferred` > `fallback`
- `confidence`: `high` \| `medium` \| `low`
- `updatedAt` / `stickyUntil` / `lastEvent` / `agent` / `taskId` / `sessionId` / `message`

遗留 UI 文案：`error` → `failed`；`phase=hold` → `listening`。Legacy source 标签：`hook` → `codex_hook`，`app` → `codex_app`。

## 仲裁要点

1. 源优先级：native > hook > app > inferred > fallback  
2. 同级比时间戳；高优先级 sticky 挡住低优先级  
3. **低置信 inferred idle 不能清掉 sticky `needs_input` / `running`**  
4. `done` 约 600ms 后 settle → `idle`  
5. 事件日志：`logs/pad-status.jsonl`（raw → normalized → accept/reject）  
6. **状态灯开启时**：AG00 / 灯环只读 `pad_status`（Hook 路径），不把每次 snapshot 的 native thstatus 回灌进 Core（关灯时 AG 仍走 native-first）
7. **Soft RGB**：`pad_status` → 语义色写入 snapshot.`rgb`；状态灯开时忽略 vendor `rgbcfg`（防 sticky mint）；FE 只消费 `rgb`，不再本地色表 / 事件推灯  
8. **任务卡**：状态灯开且非 idle 时，meta 第二行展示 `message` · 短 `taskId` · 短 `sessionId`（同源 Core，不另判状态）  
9. **ENC 召回**：`summonCodex` / `openAgent` 走 Global `focus_composer` 工作流，**不**注入 `Ctrl+Shift+P`；模式开关仍是 ENC 上的独立 switch  
10. **JOY 方向轨**：打开后注入 NAV_*（overlay 键 + 物理方向键仅在 Codex 前台时 live）；`needs_input` 点击穿透时自动收起；hint 说明是否已劫持物理方向键  
11. **状态诊断**：Pad 管理「状态诊断」只读 `pad_status` + `logs/pad-status.jsonl` 尾部（accept/reject），不另判灯  
12. **ACT 上下文化**：状态灯开时 Overlay ACT 键按 Core UI 状态 `emphasize` / `dim`（如 `needs_input` 强调确认/拒绝）；**仅视觉提示，不硬拦 fire**  
13. **jsonl 回放**：诊断区结构化时间线（时间 · UI 状态 · 来源 · raw · 拒因），可筛 全部/已接受/已拒绝；**只读，不回写 Core、不改灯**  
14. **可选 HID Output Adapter**：`plan_hid_output` 只产出意图（sink=`soft_rgb`/`none`，`emit_enabled=false`）；`try_emit` **恒拒绝**；不写 `v.oai.rgbcfg` / thstatus；诊断快照展示「HID 关闭」  
15. **绑定配置校验**：Pad 管理「绑定校验」检查缺路由、空 slot、空热键、scan/slot/chord 冲突、ENC 屏幕键；`summonCodex` 空弦合法；**一键修复**补缺/空弦/ENC/scan 冲突（不改已有非空热键）  
16. **Claude Input Adapter**：Claude Code Hook → `agent=claude` + `source=hook`（UI 标签 `claude_hook`）；核心事件 `UserPromptSubmit`/`PermissionRequest`/`Stop`/`StopFailure`；探针 `scripts/claude-hook-probe.js` POST 同一 `/api/codex-app/state`（`source=claude_hook`）；**不**伪造 HID  
17. **第一区 7/8/9（AG00/01/02）**：默认 `switchAgent` / `claudeModel` / `switchModel`；**AG00 仍是状态灯宿主**（按 micro_key_id 上色，与 slot 解耦）；`status` 默认迁到 AG04；`claudeModel` Global 聚焦 Claude（已前台则插 `/model`）  
18. **第二区 4/5/6（AG03/04/05）**：默认 `permissions` / `status` / `appsOrPlugins`（权限 · 常用`/status` · 应用）；命令菜单仍在 `/`→ACT07，不占 5 键  
19. **第三区 1/2/3**：Numpad1→ACT09 `newThread`（上下文）；Numpad2→软键 `UNDO`/`undo`（Ctrl+Z）；Numpad3→软键 `SEARCH`/`quickSearch`（Ctrl+F）；**发送迁到 Numpad Enter**（ACT12 scan `0x1C:ext`），Overlay 发送键仍为 ACT12
20. **日志测试隔离**：单测通过 `set_log_path_override` 写临时 jsonl；`cfg(test)` 默认关 append，不污染产品 `logs/pad-status.jsonl`

## 诚实边界 / 非目标

- **开灯时只读 Core ≠ 全键只读 Core**：AG00 与 Soft RGB 在状态灯开启时**只读** State Core；`resolve_cell_run_status` 对 AG00 已走 Core，**其它 AG / 非 AG 键**仍可 native-first / inferred（overlay 内局部判断），未强制全键迁入 Core。
- **native thstatus 止损**：留在 vendor / protocol 展示与关灯路径；**不**回灌 Core 作 Hook 真相（见 stoploss 报告）。
- **Claude adapter**：当前为函数式 ingest（`ingest_claude_*`），**不是**通用 `AgentStatusAdapter` trait 体系。
- **多应用数字键盘 / padFace**：仍靠 `mapping.app_target_id`；产品级 `activeApp` / `padFace` / `appProfile` **未实现**（下一刀）。

## 硬验收

开启 **Codex 状态灯** 时：

- AG00 与 Overlay 灯环 **只**跟 `pad_status`  
- meta：状态 · 来源 · 相对时间 · 低置信时标「推断」  
- 关灯开关后 Overlay **不吃** hook 上灯（写入仍可进 loopback）

## 相关

- Hook 配置：[codex-hook-onetone-setup.md](./codex-hook-onetone-setup.md)
- 止损边界：[codex-micro-bridge-stoploss-report.md](./codex-micro-bridge-stoploss-report.md)
