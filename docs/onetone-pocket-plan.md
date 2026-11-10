# OneTone Pocket — 同款 dsh-pocket 方案

> 状态：实施方案（未开工）  
> 对标：`dsh-pocket`（DeepSeek Harness 手机端）  
> 通道偏好：Tailscale 优先；可选局域网；**不做 Cloudflare 临时隧道作默认**（地址飘、配对易失效）

---

## 1. 对标物是什么

生态里有两条「口袋」路线，本方案对齐 **原生 APK 遥控**，不是整页镜像 Web：

| 参考 | 形态 | 要点 |
|------|------|------|
| [shaobeichen/dsh-pocket](https://github.com/shaobeichen/dsh-pocket) | DSH **Web 插件** | 反向代理 + 扫码开 LAN/公网；手机打开的是 **同一套 dsh web UI** |
| [xiazhuo / dsh-pocket APK](https://shelfry.app/p/xiazhuo123456789/dsh-pocket) | **Android APK** | 扫桌面「远程控制」二维码配对；手机发任务 / 看流式 / 批审批 / 停任务；**模型仍在电脑跑** |
| OneTone Pocket（本方案） | 桌面 API + APK | 电脑跑 OneTone；手机是遥控器与状态镜；权威源在桌面 |

产品一句话（抄 dsh-pocket 诚实边界）：

> 手机负责控制与查看；电脑负责执行。不把 Vosk / ATR / Soft Pad 搬到手机上。

---

## 2. 目标与非目标

### 目标（P0 → P2）

| 阶段 | 能力 | 验收 |
|------|------|------|
| **P0** | 桌面 Companion Gateway：配对码/二维码、Tailscale/LAN 监听、鉴权 token | 手机浏览器或 APK 能 `GET /v1/status` |
| **P0** | 写操作：免按键 arm/disarm；首页发一句（走现有 ATR/HA2 send 路径） | 与桌面开关/对话一致 |
| **P1** | 流式/事件：WS 推送任务状态、继续/停止、等待确认时通知 | 对标 dsh-pocket「盯进度 + 批审批」的缩小版 |
| **P1** | Android APK：扫码配对、会话列表、输入发送、状态页 | 安装包可装；断线可改地址保留设备授权（学 dsh-pocket 0.8.0） |
| **P2** | Soft Pad 关键操作、继续上次工作、只读配置摘要 | 不引入双向配置同步 |

### 非目标

- 手机本地跑 DeepSeek / Vosk / 全量配置双向同步  
- 默认公网 Cloudflare 临时隧道（可用作高级选项，不作主路径）  
- 复用/依赖 `@deepseek-ai/dsh` 进程（OneTone 自有 Gateway，不嵌 DSH）  
- 把 Labs 的 `codex_micro_protocol`（仅 `127.0.0.1`）直接暴露给手机

---

## 3. 架构

```text
┌─────────────┐     Tailscale / LAN      ┌──────────────────────────┐
│ Android APK │  HTTPS or HTTP+token  →  │ OneTone Companion Gateway│
│ (Kotlin)    │  WS /v1/events        ←  │ (Rust, in src-tauri)     │
└─────────────┘                          │  auth: device token      │
                                         │  bind: TS/LAN iface      │
                                         └────────────┬─────────────┘
                                                      │ 调现有 IPC/内部 API
                                         ┌────────────▼─────────────┐
                                         │ voice_set_activation     │
                                         │ ATR / HA2 send & resume  │
                                         │ home focus snapshot      │
                                         └──────────────────────────┘
```

### 为何不整页镜像 dsh-web

OneTone 首页是 Focus + HA2 嵌入，不是单一可代理的 Web App。镜像成本高、焦点/重绘问题多。  
**遥控 API + 原生壳**更贴 xiazhuo APK，也更贴你先前「状态 + 快速开工 / 发一句」诉求。

### 可复用本仓库资产

- 免按键 SSOT：`OneToneVoiceKeyless` / `cmd_voice_set_activation`（armed = Vosk auto）  
- 对话发送：HA2 / ATR `startAndDrive` / chat loop（发送后才开全页的既有规则保持）  
- HTTP 骨架参考：`codex_micro_protocol_server.rs`（**仅作实现参考**；产品 Gateway 必须独立模块、默认可关、非 Labs-only 文案）  
- 设置 UI：新增「手机口袋 / Companion」面板（配对二维码、开关、绑定网卡提示）

---

## 4. 协议草案（P0）

Base：`http://<tailscale-ip>:<port>`（或 LAN IP）  
Header：`Authorization: Bearer <device_token>`  
所有写接口 CSRF：同 token；可选 `X-OT-Device-Id`

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/v1/health` | 无鉴权或弱鉴权；返回版本、是否需配对 |
| `POST` | `/v1/pair` | body: `{ pairingCode }` → `{ deviceToken, deviceId }` |
| `GET` | `/v1/status` | 免按键 on/off、当前项目摘要、ATR/chat 忙闲、一句话状态 |
| `POST` | `/v1/voice/keyless` | `{ on: bool }` → 调 `voice_set_activation` |
| `POST` | `/v1/chat/send` | `{ text }` → 桌面发一句（P0 可同步 ack，流式放 P1） |
| `POST` | `/v1/chat/stop` | 停止当前 chat/ATR（若有） |
| `GET` | `/v1/events` | P1：SSE 或 WebSocket |

配对物料（桌面 UI 展示）：

```json
{
  "v": 1,
  "name": "OneTone",
  "urls": ["http://100.x.y.z:8741"],
  "pairingCode": "AB12-CD34",
  "exp": 1700000000
}
```

二维码内容 = 上述 JSON 或短链 `onetone://pair?...`（APK 深链 + 扫码双路径）。

---

## 5. 安全

| 项 | 约定 |
|----|------|
| 默认 | **关闭**；设置里显式开启 Companion |
| 绑定 | 优先 Tailscale IP；LAN 需二次确认 |
| 鉴权 | 配对码短 TTL；设备 token 可吊销；写操作全鉴权 |
| 范围 | 白名单路由；禁止任意 shell / 任意 IPC 反射 |
| 日志 | 不落 token/正文全文到普通 log |

---

## 6. 工程落点（文件级）

### 桌面（P0）

| 落点 | 职责 |
|------|------|
| `src-tauri/src/companion/` | Gateway：listen、pair、routes、token store |
| `src-tauri/src/ipc/commands/companion_*.rs` | 开/关、状态、吊销设备 |
| `src/js/features/settings/` + `index.html` | 「手机口袋」设置：开关、二维码、设备列表 |
| `scripts/test-companion-gateway.mjs` | 协议/鉴权/ keyless 映射所有权测试 |

### Android（P1）

| 落点 | 职责 |
|------|------|
| `android-pocket/`（新目录）或独立仓库 | Kotlin + Compose；扫码；status / send / keyless |
| `docs/companion-android-build.md` | 签名、minSdk、配对排障 |

建议：**协议与桌面先合入 voice-pilot**；APK 可同仓 `android-pocket/` 或单独 repo，避免拖慢桌面发版。

---

## 7. 里程碑与估时（单人熟悉本仓）

| 里程碑 | 内容 | 粗估 |
|--------|------|------|
| M1 | 方案冻结 + 协议 stub + 设置页空壳 | 0.5–1d |
| M2 | Gateway health/pair/status + keyless | 2–3d |
| M3 | chat/send 接到 HA2/ATR；网页壳验证 | 2–3d |
| M4 | APK 扫码配对 + status + send + keyless | 4–6d |
| M5 | WS/事件 + 停止/继续 + 通知 | 3–5d |

**总：约 2–3 周**到可用 APK；对标 dsh-pocket 全家桶（桌宠等）不纳入。

难度对照：

- 比「从零做手机 LLM」**易得多**（执行仍在桌面）  
- 比「只装 dsh-pocket 插件」**难**（要自建 Gateway，没有现成 dsh remote UI）  
- 与 xiazhuo APK **同级产品形状**，工作量主要在协议与 APK，不在模型

---

## 8. 与现有产品的衔接

- **免按键**：手机开关 = 桌面 `wakeOrPushToTalk` ↔ `pushToTalk`，策略 auto/off（已统一）  
- **首页发送**：手机发送 = 桌面 send；**不在输入过程跳全页**（已修规则保持）  
- **继续上次工作**：P2；P0 不做项目闸门手机版  
- **Tailscale**：文档写清「电脑与手机同一 tailnet」；Gateway 展示探测到的 TS 地址

---

## 9. 决策清单（开工前请确认）

1. **仓库**：APK 放本仓 `android-pocket/`，还是独立 repo？  
2. **TLS**：P0 仅 HTTP+token（TS 内网），还是强制 HTTPS？  
3. **默认端口**：建议 `8741`（避开 Labs `8796`）。  
4. **P0 发送后端**：只走「提问/ATR chat」，还是也要「投递 Agent」？  
5. **公网**：是否完全不做 cloudflared（推荐 P0/P1 不做）？

---

## 10. 建议的下一步

你回复「按方案开工」并勾选 §9 决策后，从 **M2 Gateway + 设置页配对二维码** 起写代码；手机端先用最小 HTML/APK 壳打通 `status` + `keyless` + `send`。
