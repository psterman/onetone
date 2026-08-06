# Soft Pad State Core vs Output Adapters

OneTone 虚拟小键盘的状态以 **State Core**（`pad_status`）为唯一真相；Overlay / 状态灯 / 软 RGB 只做 **Output Adapters**，不得各自再判灯色。

## 边界

| 层 | 职责 | 不做什么 |
|----|------|----------|
| **State Core** | 归一化 `PadStatus`、仲裁、TTL、转移约束、jsonl 日志 | 不画 UI、不伪造 HID |
| **Input Adapters** | Codex Hook/App、**Claude Hook**、本地按键推断、可选 Native 槽 | 不直接改 Overlay DOM |
| **Output Adapters** | Overlay 灯环、**status 宿主键** CSS、meta/任务卡、**Soft RGB**、可选 HID（plan-only） | **只读** `pad_status` 快照；**不**伪造 HID / thstatus |

软件控制面止于「状态对象 + 展示」。**不**假装官方 Micro `READ_OUTPUT` / thstatus，也不把 Hook 标成 Native Micro。

## 状态灯分层（Codex 单灯 / Claude 多灯 / Native 多 AG）

Cell 展示优先级（硬约束）：

1. **fresh native** `v.oai.thstatus`（AG00–AG05）— 官方多 AG，最高可信  
2. **Claude agent light**（`claude_lights` store，source=`claude_hook`）— OneTone **自建**多灯，非官方硬件协议  
3. **Codex status host**（主 `PadStatus`，`slotId=status`，无则 fallback **AG00**）— Codex Hook 单灯整体会话  
4. local inferred / fallback  

### Codex 单灯

- 唯一主 `PadStatus`；宿主 = enabled `slotId=status`（无则 fallback AG00）。
- **Stock Soft Pad 默认无 `status` route** → 灯落在 AG00；AG00 按下仍是 `commandPalette`（**灯 ≠ 点击语义**）。
- Subagent* **不**生成多灯（只作 meta/lastEvent 参考）。
- Soft RGB / `app_*` meta 仍跟主 `PadStatus`。

### Claude Agent Activity Pad（自建多灯）

定位：**Claude Code / Claude Desktop 的多 agent 活动控制层**，不是 Codex Micro 1:1，也不是官方硬件多灯协议。

- 独立 `claude_lights`（Claude agent 活动灯 / OneTone 自建聚合）：`SubagentStart/Stop` **只写该 store，绝不写主 PadStatus**。
- Key：`agent_id` → else `agent_type` → else `claude/main`。
- Main 宿主 = `claudeModel`（有则跟该键）；否则 fallback **AG01**。
- **过渡态**：共享 stock 后 AG01 默认是 Codex `newThread`，Claude 主灯会落在「Codex 语义」键上；Claude 专用默认后续再做。
- Subagent sticky 首次占位、Stop/`done`/`failed` TTL 经 `settle_at` **remove entry + host**；同 id 复用；排除 Codex status 宿主。
- `failed`（`StopFailure` / `PostToolUseFailure`）稍长 TTL（约 1200ms），与 `done` **同一 settle 释放路径**。
- Claude-lit AG 的 meta label 优先压缩后的 `agent_type` 短名（如 `code-reviewer`→`reviewer`），否则 `Claude`。
- Claude `needs_input`：**仅当主 ACT context 为 idle** 时局部强调 ACT12（确认/继续）/ ACT08（拒绝/取消）；并给出文案-only `claudeWaitingHint`（如 `reviewer 等待确认`），**不**设灯色 / Soft RGB。
- AG 池不足 → `agentLightsOverflow` 短串 + `agentLightsOverflowItems`；**不**占 ACT/NAV；overlay 首屏不画复杂 overflow UI。
- 状态诊断（`cmd_pad_status_diagnose`）展示 Claude 活动灯行（含 resolver 同源 `hostKey`）与 overflow 列表；Pad 管理「Claude Activity Pad」区块展示 phase chips / top issues / Soft Pad 预览（overlay `cells` 上色）/ 测试注入。
- **Claude Soft Pad 先可见**：Codex 前台逻辑保留；另当 Claude FG（`claude-code` app identity）或 Claude Hook/App 近窗活跃（`claude_lights.last_activity_at`，默认 5 分钟，或仍有 active lights）时 Soft Pad 浮层也可显示。**不**把 Terminal/PowerShell 当 Claude；**不**承诺全部 CLI 快捷键。`SessionStart` 只 bump 近窗（不写 running 灯）。**Claude Activity 接入面板**可检测/预览/确认安装/撤回 `~/.claude/settings.json` 中带 `--onetone-hook-id claude-activity-v1` 的 hooks（serde 合并，坏 JSON 拒绝；撤回不整文件还原）。CLI 键注入另有偏好开关（默认关），开启后仍须高置信 latch；偏好关时 Soft Pad 不键注入（Hook 审批 decide 除外）。PermissionRequest 可挂 pending 供 ACT12/08。overlay snapshot `visibleReason` 为 **host reason**。
- Route 可选 serde 字段 `agentLightId`（无设置 UI）。
- **禁止** Claude 多灯写 `v.oai.thstatus` / `vendor.agent_slots`，也**不**驱动 Soft RGB。

### Micro native

- `v.oai.thstatus` → `vendor.agent_slots`；source=`native`。
- **禁止** Hook→thstatus 或 thstatus 回灌 Hook Core。
- 同键冲突时 native **压过** Codex/Claude Hook 灯。

Snapshot：`statusLightMicroKeyId`、`appAgent`、`agentLights`、`agentLightsOverflow`、`agentLightsOverflowItems`、`claudeWaitingHint`。

## 诚实边界 / 非目标

- Soft RGB / meta 跟主 `PadStatus`，不跟 Claude 多灯。
- Hook 通过 ≠ Micro native thstatus；不把 Hook 标成 Native Micro；**Claude 不使用 `v.oai.thstatus`**。
- 不做 Codex Hook 多灯；不做 `agentLightId` 设置页 UI（本刀）。
- **多 Agent 身份**：`AgentCatalog` + `PadFace` + Capabilities；`mapping.app_target_id` 仅为兼容 fallback。
- **Soft Pad 等待抢主控**：只信 `AgentAttentionStore` 投影的 `waiting_kinds`；**禁止**把 PadStatus 24h sticky / Inferred 直喂 Arbiter。
- **Cursor**：可 focus + chord + Hook 生命周期（Working/Idle/Complete）；默认 `can_observe_needs_input=false`；OneTone ask 可进 waiting；不宣称内部 Agent API / Micro 对等。
- **日志测试隔离**：单测临时 jsonl，不污染 `logs/pad-status.jsonl`。

### 五级诚实能力（契约）

1. Official App Server  
2. Official Lifecycle Hooks  
3. Desktop Automation  
4. Inferred Status（只点灯）  
5. Official Native Hardware（Codex Micro）

顶栏灯条 / Overlay 等待语义应投影 AttentionStore（+ PadStatus 只读点灯），不另起第二套状态机。

## `PadStatus` 字段

- `state`: `idle` \| `running` \| `needs_input` \| `done` \| `error` \| `offline`
- `phase`: 可选（如听写 `hold` → UI 映射为 `listening`）
- `source`: `native` > `hook` > `app` > `inferred` > `fallback`
- `confidence`: `high` \| `medium` \| `low`
- `updatedAt` / `stickyUntil` / `lastEvent` / `agent` / `taskId` / `sessionId` / `message`

遗留 UI 文案：`error` → `failed`；`phase=hold` → `listening`。Legacy / UI source 标签：`hook`+`agent=codex` → `codex_hook`，`hook`+`agent=claude` → `claude_hook`；app 同理。

## 仲裁要点

1. 源优先级：native > hook > app > inferred > fallback  
2. 同级比时间戳；高优先级 sticky 挡住低优先级  
3. **低置信 inferred idle 不能清掉 sticky `needs_input` / `running`**  
4. `done` 约 600ms 后 settle → `idle`  
5. 事件日志：`logs/pad-status.jsonl`（raw → normalized → accept/reject）  
6. **状态灯开启时**：status 宿主键 / 灯环只读 `pad_status`（Hook 路径），不把每次 snapshot 的 native thstatus 回灌进 Core（关灯时 AG 仍走 native-first）
7. **Soft RGB**：`pad_status` → 语义色写入 snapshot.`rgb`；状态灯开时忽略 vendor `rgbcfg`（防 sticky mint）；FE 只消费 `rgb`，不再本地色表 / 事件推灯  
8. **任务卡**：状态灯开且非 idle 时，meta 第二行展示 `message` · 短 `taskId` · 短 `sessionId`（同源 Core，不另判状态）  
9. **ENC 召回**：`summonCodex` / `openAgent` 走 Global `focus_composer` 工作流，**不**注入 `Ctrl+Shift+P`；模式开关仍是 ENC 上的独立 switch  
10. **主盘方向键**：左侧常驻 `NAV_UP/LEFT/DOWN/RIGHT`（`showNavigationPad` 控制显示；默认注入箭头仅来自**屏幕点按 / 摇杆 HID**）。实体主键盘倒 T **默认不捕获**（`capturePhysicalArrows` 默认 false；仅当对应 `NAV_*` 绑了非空 slot 且显式开启时才捕获执行绑定，不回注箭头）。小键盘 2/4/6/8 与主方向键独立（`LLKHF_EXTENDED`）。  
11. **状态诊断**：Pad 管理「状态诊断」只读 `pad_status` + `logs/pad-status.jsonl` 尾部（accept/reject），不另判灯  
12. **ACT 上下文化**：状态灯开时 Overlay ACT 键按 **主 PadStatus** UI 状态 `emphasize` / `dim`；Claude Activity Pad 仅在主 context idle 时用 Claude `needs_input` 补局部提示（如确认/继续、拒绝/取消）；**仅视觉提示，不硬拦 fire**  
13. **jsonl 回放**：诊断区结构化时间线（时间 · UI 状态 · 来源 · raw · 拒因），可筛 全部/已接受/已拒绝；**只读，不回写 Core、不改灯**  
14. **可选 HID Output Adapter**：`plan_hid_output` 只产出意图（sink=`soft_rgb`/`none`，`emit_enabled=false`）；`try_emit` **恒拒绝**；不写 `v.oai.rgbcfg` / thstatus；诊断快照展示「HID 关闭」  
15. **绑定配置校验**：Pad 管理「绑定校验」检查缺路由、空 slot、空热键、scan/slot/chord 冲突、ENC 屏幕键；`summonCodex` 空弦合法；**一键修复**补缺/空弦/ENC/scan 冲突（不改已有非空热键）  
16. **Claude Input Adapter / Activity Pad**：Claude Code Hook → 主 `PadStatus`（`agent=claude`）+ 并行 `claude_lights`；探针 POST `/api/codex-app/state`；面板 `cmd_claude_hook_setup_status` / `install_confirm` / `uninstall_onetone` 合并写入 `~/.claude/settings.json`（`--onetone-hook-id claude-activity-v1`，PermissionRequest `timeout=60`）；`PermissionRequest` 可轮询 `/api/claude-approval`；CLI 键注入受 `claude_cli_inject_pref_enabled` + 高置信 latch 双闸；**不**伪造 HID / thstatus   
17. **第一区 7/8/9（AG00/01/02）**：默认 `commandPalette` / `newThread` / `quickChat`（一键生效）；**状态灯**无 `status` route 时 fallback AG00（灯是 overlay；按下仍执行该键当前 slot，默认为命令菜单）  
18. **第二区 4/5/6（AG03/04/05）**：默认 `quickSearch` / `stopOrSend` / `cancel`；Codex Soft Pad `openEditKeycap` 仅白名单一键能力（不含 insertOnly / `claudeModel` / `undo`）  
19. **第三区 1/2/3**：Numpad1→ACT09 `newThread`；Numpad2→`UNDO` **空绑定**（heal 不写回 `undo`）；Numpad3→`SEARCH`/`quickSearch`；**发送**仍在 Numpad Enter（ACT12）与 AG04  
20. **日志测试隔离**：单测通过 `set_log_path_override` 写临时 jsonl；`cfg(test)` 默认关 append，不污染产品 `logs/pad-status.jsonl`

## Soft Pad 能力边界（诚实）

OneTone Soft Pad 使用桌面快捷键、聚焦和语音工作流近似部分 Codex 操作（含审查/终端/浏览器等**打开入口**）；状态灯来自 Hook/本地状态，不等同于官方 Codex Micro 原生硬件协议。`openEditKeycap` 只暴露按一下就有可见结果的白名单能力；图标仅为外观，状态灯宿主与点击动作是两回事。

## 诚实边界 / 非目标

- Soft RGB / meta 跟主 `PadStatus`；Claude 多灯只点 AG cells。
- **native thstatus 止损**：留在 vendor / protocol；**不**回灌 Core；同键 native 优先于 Hook。
- Claude Agent Activity Pad = Hook + OneTone **自建聚合**，**不是**官方 Micro 多灯协议，**不**使用 `v.oai.thstatus`。
- **多应用数字键盘 / padFace**：仍靠 `mapping.app_target_id`；未实现产品级切换。

## 硬验收

- Codex Hook 只亮 status 宿主；Subagent* 不多灯。
- Claude 两 agent 同时 running → 两 AG `claude_hook`；不占 status 宿主。
- SubagentStop 只清对应灯；不改主 `PadStatus`。
- `done`/`failed` TTL 后 `settle_at` 同时清 store entry 与 sticky host。
- thstatus 多 slot → native；同键 Hook 不压过 native。
- 关灯后 Overlay 不吃 hook 上灯。
- 诊断回放不得把 Claude 标成 Codex Hook。

## 相关

- Hook 配置：[codex-hook-onetone-setup.md](./codex-hook-onetone-setup.md)
- 止损边界：[codex-micro-bridge-stoploss-report.md](./codex-micro-bridge-stoploss-report.md)
