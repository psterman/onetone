# 事件契约（Event Contract）

> 单一数据源：Rust 端 `runtime_event` 已经在 emit `mvp_runtime_event`，
> Activation Hub 订阅它，向 FE 广播**纯净的** `activation:*` 事件。
> 这样 FE 各模块只关心 `activation:*`，不需要知道 voice 引擎的细节。

## 事件类型

| 事件名 | 触发时机 | 触发方 | 方向 |
|---|---|---|---|
| `activation:on` | 用户激活语音输入的瞬间 | voice-wake.triggered | Rust → JS |
| `activation:off` | 语音输入结束（commit / cancel / 超时） | voice-end.* | Rust → JS |
| `activation:phase` | 阶段切换（listen → watch → think → done） | 阶段判定 | JS 内部 |
| `activation:tick` | 倒计时推进（每 1s） | 计时器 | JS 内部 |
| `activation:error` | 任一传感器开启失败 | 订阅者 | JS 内部 |

> Rust 端**只发 on/off**；phase/tick/error 在 JS 端 ActivationHub 内部派生，
> 避免 Rust 端事件总线被高频 tick 污染（runtime_event 注释明确写了"不用于高频采样"）。

## Payload Schema

### `activation:on`

```ts
{
  type: 'activation:on',
  source: 'voice-wake' | 'hotkey' | 'gesture',   // 触发源（未来扩展用，V1 固定 voice-wake）
  trigger: {
    engine: 'sapi' | 'vosk' | 'kws',              // 哪个唤醒引擎
    phrase: string,                                // 命中的唤醒词
    confidence: number,                            // 0-1
  },
  windows: {
    timeoutMs: number,                             // 整体激活窗口上限（默认 15000）
    softCloseMs: number,                           // 软关闭阈值（默认 10000，超时后进入"软关闭"提示）
  },
  startedAt: number,                               // Date.now()
}
```

### `activation:off`

```ts
{
  type: 'activation:off',
  reason: 'commit' | 'cancel' | 'timeout' | 'error' | 'manual',
  durationMs: number,                              // 激活到关闭的时长
  endedAt: number,
}
```

### `activation:phase`

```ts
{
  type: 'activation:phase',
  phase: 'listen' | 'watch' | 'think' | 'done',
  enteredAt: number,
  payload?: {
    // listen phase：用户说出的内容（来自 voice-end 的 partial/final）
    partial?: string,
    // watch phase：camera 捕捉到的关键事件
    cameraEvent?: 'face-detected' | 'gaze-screen' | 'gesture-ok' | 'gesture-wave',
    // think phase：visual-agent 触发的动作
    agentAction?: string,
  }
}
```

### `activation:tick`

```ts
{
  type: 'activation:tick',
  remainingMs: number,                             // 距离 timeout 还剩多少 ms
  inSoftClose: boolean,                            // 是否已进入"软关闭"提示阶段
}
```

### `activation:error`

```ts
{
  type: 'activation:error',
  source: 'camera' | 'visual-agent' | 'mic' | 'softpad',
  code: string,
  message: string,
  fatal: boolean,                                  // true = 立即关闭激活态
}
```

## Rust 端 emit 位置

> OneTone 现有代码已经有 `runtime_event.rs` 统一 emit。
> V1 **不动 Rust 端**——只让 JS 端的 Activation Hub 订阅 `mvp_runtime_event`，
> 从 `event.kind` / `event.message` 推断激活态。

`runtime_event.rs` 已有 emit 入口：
- `voice-wake.triggered` → 现有：`publish_runtime_event(... "voice", "wake_triggered", ...)`
- `voice-end.commit` → 现有：`publish_runtime_event(... "voice_end", "committed", ...)`
- `voice-end.cancel` → 现有：`publish_runtime_event(... "voice_end", "cancelled", ...)`
- `voice-end.timeout` → 现有：`publish_runtime_event(... "voice_end", "timeout", ...)`

Activation Hub 在 JS 端通过 `kind` 字段过滤匹配，**完全不需要改 Rust**。

## 订阅者清单（V1）

| 订阅者 | 监听 | 收到后做什么 |
|---|---|---|
| `codex-micro-overlay` | `activation:on/off/phase/tick` | 渲染图标位（mic/camera/think）和倒计时 |
| `camera-presence-actions` | `activation:on` | 启动 presence 检测；`off` 关闭 |
| `camera-hand-gesture` | `activation:on` | 启动手势识别；`off` 关闭 |
| `camera-gaze-*` | `activation:on` | 启动注视检测；`off` 关闭 |
| `visual-agent` | `activation:on` | 启动 context-pipe；`off` 收 |
| `soft-pad-agent-bar` | `activation:on` | 高亮当前 agent；`off` 复原 |

> V1 优先接入：codex-micro-overlay（必做，给用户看）+ visual-agent（核心联动）。
> camera-* 可以分批接入，不影响 V1 验收。

## 不变量（Invariants）

1. **同一时刻只有一个 `activation:on` 处于活动状态**——重复触发合并
2. **Rust 端不知道 activation 这个概念**——纯 JS 派生
3. **高频事件不冒泡**——`activation:tick` 不 emit 到 Rust
4. **错误隔离**——任一订阅者 throw 不影响其他订阅者
5. **退出一定成功**——即使 timeout 没触发，commit/cancel/manual 必走 `activation:off`
