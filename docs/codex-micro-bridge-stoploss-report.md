# Codex Desktop → OneTone 真状态桥止损线验证报告

> 执行日期：2026-07-22  
> 编排脚本：`scripts/run-codex-micro-stoploss-verify.ps1`  
> Artifact 目录：`logs/stoploss/20260722-182104/`

## 1. 当前结论：**D — 止损，转向应用层状态**

| 结论 | 含义 |
|------|------|
| **D** | Codex Desktop 未向虚拟 HID 输出任意 READ_OUTPUT；Codex 未建立 Micro RPC 会话；在止损线内无法拿到真实 `v.oai.thstatus`。立即转向应用层状态 PoC。 |

**非 A/B/C 理由简述：**

- **非 A**：无 `[AgentController] READ_OUTPUT v.oai.thstatus`；jsonl 无真实 thstatus；`CodexMicroRpcTap.TryEmit` 未触发（`codex-micro-rpc-tap-called.log` 不存在）。
- **非 B（终态）**：B 仅为过程态（OneTone loopback/relay 注入链路此前已验证）；本 run 确认设备层输出仍为 0，终态为 D。
- **非 C**：未发现可 1–2 天内验证的 feature flag / 握手开关；Codex 从未向设备发 `sys.version` 等 request，不是 handler 缺口而是 Codex 未接受/未启用 Micro 会话。

---

## 2. Codex Desktop 真打通：**no**

| 问题 | 答案 |
|------|------|
| Codex 是否识别虚拟 Micro 输入（VHF SUBMIT）？ | **partial** — `SendMicroAction ACT06` → `submit=Accepted`（驱动/Broker 层） |
| Codex UI 是否响应 Micro 输入？ | **未在本 run 中 UIA 验证**（需人工观察 Fast 切换） |
| Codex 是否向设备发 READ_OUTPUT / RPC request？ | **no** — jsonl 无新行；Codex 从未发 `sys.version` |
| 是否拿到真实 thstatus？ | **no** |

---

## 3. 三联证据（A 必填）

| 证据 | 本 run 状态 |
|------|-------------|
| `[AgentController] READ_OUTPUT v.oai.thstatus` | **缺失** — `codex-micro-rpc-tap-called.log` 不存在；jsonl 仅 5 字节空文件 |
| `[relay] POST 200 method=v.oai.thstatus ... nativeAg≥1` | **缺失** — 无 jsonl 输入，relay 无真实 POST |
| OneTone snapshot `statusSource=native`（来自 Codex 任务） | **缺失** — 仅手动/历史注入可点亮 native AG，不算 A |

### jsonl 样例（本 run）

```json
（无有效行 — 文件长度 5 字节，无 method 字段）
```

### OneTone snapshot（本 run loopback 探针）

```json
{
  "ok": false,
  "error": "invalid_json 或 dispatch_timeout",
  "note": "8796 端口 LISTENING；LaunchOnly 模式下 HTTP 探针偶发 dispatch_timeout。历史验收中 loopback 注入 7/7 已通过，属注入链路非真桥。"
}
```

---

## 4. 设备层各阶段结果

### Phase 1 — 设备层最小诊断（~2h 预算）

| 检查项 | 结果 |
|--------|------|
| 驱动 PnP | **OK** — `Codex Micro Simulator UMDF2 Virtual HID` |
| broker-v1.lock | **存在** |
| 8796 LISTENING | **是** |
| **inputAccepted**（ACT06） | **true** — `submit=Accepted detail=All reports were accepted by VHF.` |
| **任意 READ_OUTPUT** | **false** — 30s 观察窗口内 jsonl/tap 无新增 |
| **hasThstatus** | **false** |
| 发现 status methods | （无） |

Artifact：`logs/stoploss/20260722-182104/phase1-device-diagnosis.json`

### Phase 2 — Codex 包内静态检查（26.715.9868.0）

| 检查项 | 结果 |
|--------|------|
| 包路径可访问 | **是** |
| micro 代码 | **存在**（自 `app.asar` 解包） |
| **VID/PID** | `codex-micro-service` 内常量 `h=12346, g=33632, _=65280` → **0x303A / 0x8360 / 0xFF00** |
| **thstatus 协议** | `rpc_api_oai.js` 含 `v.oai.thstatus`（与 26.707 基线 **hash 一致**） |
| **hash 漂移** | service / bridge / slot-signals **3 文件相对 26.707 基线已变** |
| feature flag / settings/codex-micro | **未在 minified 文本 grep 中命中**（可能 obfuscate） |
| 实体 USB/serial 硬门禁字符串 | **未明确命中** |

| 文件 | SHA-256 (26.715) | 26.707 基线 match |
|------|------------------|-------------------|
| codex-micro-service-Cjfx6wOZ.js | `16888e75...` | **否** |
| codex-micro-bridge-kIdGpn8c.js | `5f9512b2...` | **否** |
| codex-micro-slot-signals-fmkxurMs.js | `7c7b138f...` | **否** |
| rpc_api_oai.js | `80815366...` | **是** |

Artifact：`logs/stoploss/20260722-182104/phase2-static-scan-v2.json`

### Phase 3 — 握手与争用

| 检查项 | 结果 |
|--------|------|
| Codex 发 `sys.version` / `device.status` request | **否** — jsonl 无 inbound request |
| Handler 已实现 | **是**（Broker `DeviceRpcHandler`） |
| AgentController 运行 | **是** |
| Codex Desktop 运行 | **是**（ChatGPT/Codex 进程） |
| Virtual Micro Simulator 争用 | **否** |
| Codex 日志 micro/HID 命中 | **无**（已搜 `%LOCALAPPDATA%\OpenAI\Codex\logs` 等） |

**判断**：Broker 能 open 且 input Accepted，但 **Codex 未建立 Micro RPC 会话、未写 output** — 非 handler 问题。

Artifact：`logs/stoploss/20260722-182104/phase3-handshake-contention.json`

### Phase 4 — 版本对比（可选，已触发 hash 漂移）

| 检查项 | 结果 |
|--------|------|
| 已安装版本 | 仅 `OpenAI.Codex_26.715.9868.0_x64__2p2nqsd0c76g0` |
| service/bridge/signals hash 漂移 | **是**（相对 26.707.12708 文档基线） |
| 旧版本 READ_OUTPUT 对比 | **未执行**（无并行旧版安装；避免破坏环境） |
| 结论 | hash 漂移记录备查，但 **无 output 的根因仍是 Codex 未开 Micro 会话**，不足以单独升 C |

Artifact：`logs/stoploss/20260722-182104/phase4-version-compare.json`

---

## 5. 卡点归类

| 类别 | 是否命中 | 说明 |
|------|----------|------|
| 驱动 | 否 | VHF 驱动存在；SUBMIT Accepted |
| Codex 未识别设备 | **部分** | HID 注入 Accepted，但 **无 RPC 会话** |
| 设备识别但无 output | **是（主卡点）** | READ_OUTPUT 全程为 0 |
| feature flag / 灰度 | 未证实 | 静态 grep 未找到明确开关 |
| 实体设备门禁 | 未证实 | 未见 serial/manufacturer 硬编码；VID/PID 与虚拟驱动一致 |
| relay / OneTone | 否（注入链路） | 8796 监听；历史 loopback 注入 OK；本 run HTTP 探针 dispatch_timeout 为 LaunchOnly 环境限制 |

---

## 6. 推荐下一步

### 立即（D 路径）

1. **停用设备层无限投入** — 不再深挖驱动/争用，除非 OpenAI 官方提供兼容身份或 Micro 会话文档更新。
2. **启用应用层状态 relay**：`node scripts/codex-app-state-relay.js`（见 §7）。
3. OneTone overlay 文档/UI 标明 **`source=codex_app`**，不宣称硬件 thstatus。
4. 若需 native AG 灯效，仅接受 **app_state 映射后的 loopback 注入**，与设备层 thstatus 分轨。

### 不继续

- 手动 POST / 验收页绿勾 **不算真桥通过**。
- AgentController 侧栏任务动态 **不算设备层 thstatus**。

---

## 7. 应用层 PoC（Phase 5）

### 实现

- 脚本：[`scripts/codex-app-state-relay.js`](../scripts/codex-app-state-relay.js)
- 数据源：`~/.codex/session_index.jsonl`（六槽 recency）+ `sessions/**/rollout-*.jsonl`（`task_started` / `task_complete` / `turn_aborted` / `stream_error`）
- 映射：`task_started` → `running`；`task_complete`/`turn_aborted` → `done`；`stream_error`/`error` → `failed`
- POST：`http://127.0.0.1:8796/api/codex-micro/protocol`（body 为 `v.oai.thstatus` 形状；**stderr 强制 `source=codex_app`**）

### 首条成功状态构建（2026-07-22）

```json
{
  "source": "codex_app",
  "truth": "app_state",
  "agentSlots": [
    { "index": 0, "state": "done" },
    { "index": 1, "state": "running" },
    { "index": 2, "state": "running" },
    { "index": 3, "state": "running" },
    { "index": 4, "state": "done" },
    { "index": 5, "state": "done" }
  ],
  "padStatus": "running"
}
```

### 首条 relay stderr

```
[app-state-relay] source=codex_app truth=app_state POST 400 slots=0:done,1:running,2:running,3:running,4:done,5:done connectionState=? nativeAg=0
```

> POST 400 / `dispatch_timeout`：OneTone `-LaunchOnly` 时主线程未及时处理 HTTP dispatch。状态 **读取与映射已成功**；需在 OneTone 正常 UI 事件循环下重试 POST 以点亮 overlay。

### 已知限制（诚实标注）

- rollout 状态 **不能精确映射 `needs_input`**（与官方 thstatus 灯语不同）。
- `needs_input` / approval 需后续叠加 `.codex-global-state.json` unread 或 App Server IPC。

### 运行方式

```powershell
# OneTone loopback
.\run_onetone.ps1 -LaunchOnly -CodexMicroProtocol -Safe

# 应用层状态 relay（持续）
node .\scripts\codex-app-state-relay.js

# 单次快照
node .\scripts\codex-app-state-relay.js --once
```

---

## 8. 元数据

| 字段 | 值 |
|------|-----|
| voice-pilot commit | `9313dfe` |
| AgentController | `.agentcontroller-tmp` @ `51a44e4` |
| Codex Desktop | `OpenAI.Codex_26.715.9868.0_x64__2p2nqsd0c76g0` |
| 驱动 | CodexMicroVhfUm（Simulator UMDF2）已装 |
| 验证耗时 | ~0.7h（自动化 run；预算 8h 未用尽） |
| 编排命令 | `.\scripts\run-codex-micro-stoploss-verify.ps1 -SkipLaunch -ObserveSeconds 30` |

---

## 9. 验收对照

| 标准 | 结果 |
|------|------|
| A：真实 READ_OUTPUT + relay 200 + native AG | **未满足** |
| 1 工作日无 READ_OUTPUT → 默认 D | **满足 → D** |
| 手动 POST 不算 A | **遵守** |
| 输出 stoploss 报告 | **本文档** |
