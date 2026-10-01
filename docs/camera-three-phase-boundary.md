# 摄像头三阶段边界

> 目的：防止「摄像头」再次滑向一个独立功能页，或被误当作决策源。
> 依据：摄像头是 **Context Engine 的最高价值感知通道之一**，不是 Now 首页的内容。

---

## 一句话定位

```
摄像头 → Evidence → Context → Runtime Resolution → Now 展示「当前情景 + 正在帮助」
```

**不是**：

```
摄像头 → Now 首页显示摄像头状态   ← 会把 OneTone 拉向普通 AI 摄像头助手
```

---

## 三阶段划分

判断标准只有一条：**输出流向哪里。**

| 阶段 | 流向 | 归属 | 状态 |
|---|---|---|---|
| **Phase 1 · Presence** | Camera → **Context** | 证据源 | ✅ 已落地 |
| **Phase 2 · Attention** | Camera → **Context** | 证据源 | ⬜ 未开始 |
| **Phase 3 · Gesture / Interaction** | Camera → **Action** | 交互层 | 🟡 已有实现，归属正确 |

### Phase 1 · Presence

**回答**：人在不在。

```rust
Presence { Here, Away, Unknown }
+ confidence { low, mid, high }
+ timestamp（TTL 12s）
```

跨 IPC 只有三个标量。**不传图像、不做人脸识别、不上传。**

### Phase 2 · Attention

**回答**：人在不在**参与**当前任务。

```
人坐着，但眼睛在看手机
  → 开发情景应该降低优先级
```

这是 Phase 1 的正交维度，**不是替代**。注意：

- Phase 1 = 身体在不在
- Phase 2 = 注意力在不在

两者独立。人在但分心，是 Phase 2 独有信号。

### Phase 3 · Gesture / Interaction

**回答**：用户主动给指令。

```
摇头 / 挥手 / 注视拖动 → 直接执行动作
```

**这一阶段是 `Camera → Action`，不经过 Context。**

已有实现在 `camera-presence-actions.js`（8 个触发器），
它们走 `dispatchAction()` 而不是 Context 仲裁——**归属本来就是对的，不要动。**

---

## 硬规则

### 1. 摄像头是证据源，不是决策源

```rust
// 错误：摄像头说没人 → 直接切情景
if camera_empty { switch_to_leave() }

// 正确：摄像头只提供一条证据
Evidence { presence: Away, confidence: High }
// 交给 Context 与前台、输入、Agent 状态一起仲裁
```

**理由**：单帧「无人」可能因为低头写东西、角度不好、光线变化、第二块屏幕。
把它当决策源会频繁误判。

### 2. Unknown 绝不等于 Away

```rust
// may_treat_as_away() 只在 fresh Away 时为真
```

| 场景 | presence | 后果 |
|---|---|---|
| 摄像头开着，人走了 | `Away` (fresh) | ✅ 允许降级情景 + 隐私保护 |
| 摄像头关闭 | `Unknown` | ❌ **不降级**，退回前台+输入 |
| 前端崩溃 | `Unknown`（TTL 超时） | ❌ **不降级** |
| 校准中 | `Unknown` | ❌ **不降级** |

**把 Unknown 当 Away，等于用户一关摄像头就静默失去隐私保护。** 这是本设计最关键的一条。

### 3. TTL 失效必须降级，不能保持

```rust
pub const PRESENCE_TTL: Duration = Duration::from_secs(12);
```

12 秒没上报 → `read()` 返回 `Unknown` + `fresh: false`。
不这样做的话，前端崩溃会把用户**永久钉在「离开」情景**里。

### 4. 首页不显示摄像头

摄像头出现在两处，仅此两处：

1. **「依据」面板**（二级，默认收起）——「人在电脑前」是证据之一
2. **排障页** —— 摄像头没开/失效时的归因

**禁止**：在 Now 主界面出现「摄像头：已开启 / 检测：有人」这类展示。

---

## 已落地的代码

| 文件 | 内容 |
|---|---|
| `src-tauri/src/context/presence.rs` | 状态仓 + TTL + 降级规则 + 6 个单测 |
| `src-tauri/src/ipc/commands/shell/context_presence_cmd.rs` | `report` / `get` / `clear` |
| `src-tauri/src/context/resolver.rs` | presence 进仲裁（`presence == Away` → 压制打断） |
| `src/js/features/camera/camera-presence-actions.js` | `reportPresenceToContext()` + 关闭时清空 |

### 接线点

```js
// camera-presence-actions.js — transitionPresence() 内
syncDetectInterval();
emitRuntime();

// 必须在 enabled / calibrated 判断之前
reportPresenceToContext(next, p.enabled);
```

**顺序很重要**：摄像头关闭时不会触发 `transitionPresence`，
所以在开关同步处（`st.enabled` 赋值后）额外补了一次 `clear`，
否则 stale `away` 会一直挂着。

---

## 下一步（Phase 2）的前置

Attention 需要三样东西，目前都没有：

| 需要 | 现状 |
|---|---|
| 视线方向 → 屏幕区域的稳定估计 | `gazeCalibration` 有数据，但没进 Context |
| 「人是否在参与」的判定标准 | 需定义（眼睛在屏幕？头朝向？输入节奏？） |
| 与输入活动的交叉验证 | `InputObs` 有原始流，**没聚合成专注度** |

**建议**：Phase 2 不要单独做「注意力分数」。更可靠的做法是
**让 Attention 复用已有的、已被验证的信号**：

```
InputObs（击键节奏）
+ AttentionStore（Agent 是否在等你）
+ TmStatus（项目是否在改）
→ 合成 focus 置信度
```

摄像头只贡献其中一条，**权重低**。这样即使摄像头判断错了，结论也不会翻。

---

## Phase 1.5 · 观察期指标

presence 已进 Context，但**不驱动情景切换**。先跑一段时间，用数据决定是否升级。

### 必须盯的三个数

| 指标 | 健康范围 | 异常含义 |
|---|---|---|
| **TTL 误 Unknown 频率** | < 5% 的上报周期 | 追踪器卡顿或主线程被阻塞，需要放宽 TTL 或改心跳 |
| **关摄像头是否误 Away** | **必须 0** | 有就是回归——`cmd_context_presence_clear` 没走到 |
| **Away 时压制是否过激** | 无「本该叫我却一直不叫」投诉 | `suppress_visible_interrupts` 判据过宽 |

### 判定门槛

三项全绿 → 才允许讨论「presence 参与情景降级」。

**任一项不达标 → 停在 Phase 1.5，不许升 Phase 2。**

### 已知不可观测项

`presence` 是连续状态，但**证据面板的 4 种场景需要人工触发**（人走 / 关摄像头 / 等 TTL / 校准中），
无法从日志自动统计。所以第 3 项（压制是否过激）需要**人工抽检**，不是自动监控。

---

## Phase 2 预告（本批不做，方向已锁）

| 顺序 | 内容 | 阻塞在 |
|---|---|---|
| A | `InputObs` → Activity/专注节奏聚合 | 填 `ActivityEvidence::Unavailable` 空位 |
| B | `AttentionPublicSnapshot` + repo/git 补进 live 路径 | 目前 repo 走 `None` |
| C | 摄像头参与度作为**最低权**微调 | 需先有 A 的基线 |
| D | 「建议切换情景」 | 需先有 C 的置信度 |

**权重原则**：摄像头错判时，只要它权重最低，结论不会翻。
这比「更准就给更高权重」更符合本文件的硬规则。

---

## 反面清单（这些不要做）

- ❌ 在 Now 首页加「摄像头状态」卡片
- ❌ 摄像头无人 → 直接切换情景
- ❌ 摄像头关闭 → 认为用户离开
- ❌ 把图像/特征上传到 Rust 或云端
- ❌ 让 Phase 3 的手势逻辑去改 Context
- ❌ 因为摄像头更准就给它更高仲裁权重
