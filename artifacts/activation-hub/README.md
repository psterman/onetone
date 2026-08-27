# Activation Hub — 激活态信号台

> OneTone 的"激活输入法"作为天然信号源，向所有模块广播激活/退出事件，
> 让 camera / visual-agent / softpad / 迷你栏 同步进入和退出工作态。

## 文档结构

| 文件 | 用途 |
|---|---|
| **[contract.md](./contract.md)** | 事件契约：事件名、payload schema、Rust 端 emit 位置 |
| **[bridge-snippets.md](./bridge-snippets.md)** | JS 端 `activation-hub.js` 骨架 + 各订阅者接入示例 |
| **[phases.md](./phases.md)** | 视觉态分阶段规则：idle → listen → watch → think → done |
| **[overlay-mockup.html](./overlay-mockup.html)** | 迷你栏扩展后的视觉设计稿（单文件 demo） |

## 一句话设计

> **"用户激活语音输入法" = OneTone 进入激活态；语音输入结束（commit / cancel / 超时）= OneTone 退出激活态。**

所有需要"在 OneTone 工作期间被唤醒"的模块（camera / visual-agent / softpad / 迷你栏）订阅这个信号台，按 phase 渲染对应视觉。

## 不动现有代码

本目录所有内容都是**设计文档 + 模拟稿**，落地时按以下顺序最小侵入接入：

1. 新建 `src/js/features/activation/activation-hub.js`（~80 行）
2. 在 `voice-wake.js` 的 `triggered` 分支调用 `ActivationHub.activate(...)`
3. 在 `voice-end.js` 的 `commit / cancel / timeout` 分支调用 `ActivationHub.deactivate(...)`
4. 各订阅者（camera-presence / hand-gesture / visual-agent / codex-micro-overlay）注册 listener
5. 在 `codex-micro-overlay.html` 新增 3 个图标位

预计 1 个 PR，1 天内可完成。

## 验证方式

打开 `overlay-mockup.html` 在浏览器里看视觉态切换。
打开 `phases.md` 看每个态的触发条件和持续时间。
