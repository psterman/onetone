# 迷你栏 vibecoding 配置 · 方案对照原型

## 布局升级（当前要选）

| 文件 | 内容 |
|------|------|
| **[five-chrome-layout.html](./five-chrome-layout.html)** | 布局对照：A 五卡 · B 解剖条 · **C 好懂版（白话侧栏）** · D 手风琴 |

打开后顶栏切换 A/B/C/D；左预览 | 右配置不变。推荐默认停在 **B**。

## 五块 IA（能力真源）

| 文件 | 内容 |
|------|------|
| [five-chrome-ia.html](./five-chrome-ia.html) | 语音 · Agent 灯 · 文本预览 · 工具栏 · 显示选项（可并存） |

产品已接五块数据：`MiniChromeConfig` + `renderAgentMiniPanel`；下一步只改排版，不改字段。

## 历史对照

| 文件 | 决策 |
|------|------|
| [q1-timing-home.html](./q1-timing-home.html) | 显示时机放哪 |
| [q2-scope-depth.html](./q2-scope-depth.html) | IA only vs +runtime |
