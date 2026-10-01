# OneTone Now — 当前情景驾驶舱

## 形态

**PC 横屏桌面面板**（约 1080px）。

## 定位

> Now 不告诉用户 OneTone 看到了什么，而告诉用户 **现在把你当成什么情景，以及正在如何帮助你**。

闭环三动作：

```
看 → 当前情景 + helping（结果能力）
调 → 驾驶舱内展开结果开关（用户语言，非规则编辑）
切 → 我的情景 / 可能切换（弱建议）
```

## 三条产品硬约束

1. **Now 只消费 Runtime Scene，不拥有 Scene 数据。** 真相源是 `OneToneHabitRuntime`（Phase 1+），不是 fixtures/`live`。
2. **「调整」是帮助方式 ON/OFF**，不暴露 Action/Mapping/Delay 等工程结构。页内与情景管理是**同一份 actions 的两个视图**（页内=当前情景开关；管理页=全部情景 + when/does）。
3. **Context 只产生「可能切换」建议**，永不直接成为首页当前态。

不是传感器墙、设备中心、自动化规则编辑器。

```
Context Engine 建议情景
  → 用户确认 / 一键切换
  → OneToneHabitRuntime.switch
  → 执行低风险动作；高风险进「需要决定」
```

## 首页结构（稳定）

1. **当前情景**（驾驶舱：副标题 + helping；「调整」页内展开）
2. **可能切换**（弱；勿抢主视觉）
3. **我的情景** | **需要决定**
4. **Dock**（语音入口）

「情景管理」= 高级弱入口。来源弱提示仅「自动 / 手动」（来自 Facade `source`/`mode`），不上传感器。

### 副标题 fallback（MappingEntry 暂无 description）

```
promise/description（若后加字段）→ group 派生 → current.badge → 省略
```

若要人话副标题，须显式决定是否新增 `promise` 字段；禁止无说明的空白。

### 展开调整时

折叠 helping 列表，避免面板内滚（毁「一屏看清」）。

### helping vs actions.label

- `helping`：结果语（减少消息打扰）
- `actions.label`：开关意图名（不被消息打断）
- 不跨侧统一成同一句

## Phase 边界

| Phase | 内容 |
|-------|------|
| 1 | Facade + chip 写路径接 `switch` |
| 2 | Now 消费 Facade；Confirm/Choice；空态；`MappingEntry.assists` 存稳定 ID（`focus`/`quiet`/`protect`），label 仅投影 |
| 3+ | badge/pin 组件迁 Now、`promise` 字段、Context 建议、assists→执行层（须先有稳定 ID） |

`runtimeHabitControl`（pin/softOverride）进 `VoiceConfig` schema，跨保存存活。

## 明确不做

- 首页展示摄像头 / 键鼠等来源
- 把 Now 做成情景配置中心 / 自动化规则编辑器
- Context 快照直接驱动当前情景
