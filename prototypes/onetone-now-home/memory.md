# OneTone Now — 当前情景驾驶舱

## 形态

**PC 横屏桌面面板**（约 1080px）。

## 定位

> Now 不告诉用户 OneTone 看到了什么，而告诉用户 **现在把你当成什么情景，以及正在如何帮助你**。

```
看 → 当前情景 + helping（结果能力）
调 → 驾驶舱内展开 actions（结果开关）
切 → 我的情景 / 可能正在
```

不是传感器墙、设备中心、自动化规则编辑器。

```
Context Engine 建议情景
  → 用户确认 / 一键切换
  → 情景执行低风险动作
  → 高风险进「需要决定」
```

首页只负责最后三层；传感器 / Debug 不上首页。

## 首页结构（稳定）

1. **当前情景**（驾驶舱：description + helping；「调整」页内展开）
2. **可能正在**（`state.suggested`，软确认）
3. **我的情景** | **需要决定**（后者最多 2 条 + 查看全部）
4. **Dock**（语音入口）

「情景管理」= 高级弱入口（清单 / when / does），首页「调整」不跳过去。

## NowSnapshot

```ts
{
  status: { line: string };
  habits: Array<{
    id, name, short, description,
    state: { active, suggested },
    helping: string[],           // 结果能力
    actions: Array<{ id, label, enabled, effect? }>, // 页内微调
    when?, does?                 // 仅管理页
  }>;
  needsYou: Array<{ id, title, detail, primary? }>;
}
```

## 明确不做

- 首页展示摄像头 / 键鼠等来源
- 把 Now 做成情景配置中心
