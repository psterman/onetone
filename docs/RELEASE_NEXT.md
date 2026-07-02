# OneTone — Next Release Body (onboarding v2 + Coach HUD)

Copy into the GitHub Release description when tagging the next version (e.g. v1.1.0).

---

## English

### Learn the one-key flow faster

This release focuses on **first-run experience** and a lightweight **Coach HUD** so you build muscle memory for hardware-key voice input.

#### What's new

- **5-step onboarding**: pick volume keys / mouse side button / custom trigger → try it live → confirm IME shortcut → optional wake-phrase practice
- **Coach HUD**: a small bottom overlay shows key hints, listening/dictating state, and a brief success flash when your trigger fires
- **Phrase practice** (when voice wake is on): rehearse wake phrases from the home screen or inside onboarding
- **Settings → General**: enable/disable Coach HUD; replay the first-run guide anytime

#### First launch (new users)

1. Complete the onboarding wizard (or tap **Later** and finish later).
2. Press your trigger key in any text field — OneTone sends your IME shortcut (default **Right Alt** for Chinese IME).
3. Coach HUD appears at the bottom to reinforce the habit.

#### Upgrading from v1.0.0

- Your mappings and voice settings are preserved.
- You may see a **one-time prompt** to enable Coach HUD (optional).
- Coach HUD is **off by default** for existing installs until you enable it.

#### Requirements

- Windows 10 or 11 (x64)

#### Links

- [Cold start QA checklist](./COLD_START_TEST_v1.0.0.md) · [CHANGELOG](../CHANGELOG.md) · [Report a bug](https://github.com/psterman/voice-pilot/issues/new?template=bug_report.yml)

---

## 中文

### 更快上手「一键语音输入」

本版本重点改进 **首次引导** 与轻量 **Coach HUD（屏幕提示）**，帮助你形成按键唤起的肌肉记忆。

#### 新功能

- **5 步引导**：选择音量键 / 鼠标侧键 / 自定义 → 现场试按 → 确认输入法快捷键 → 可选语音唤醒词练习
- **Coach HUD**：屏幕底部小浮层，提示按键、监听/听写状态，唤起成功时短暂闪烁确认
- **唤醒词练习**（启用语音唤醒后）：可在首页或引导中跟读练习
- **设置 → 通用**：开关 Coach HUD；随时 **重新查看首次引导**

#### 首次安装

1. 完成引导（或点 **稍后** 稍后再看）。
2. 在任意输入框按唤起键 — 一声会替你按下输入法快捷键（中文 IME 默认 **右 Alt**）。
3. 底部 Coach HUD 辅助巩固操作习惯。

#### 从 v1.0.0 升级

- 原有方案与语音设置保留。
- 可能弹出 **一次性提示** 询问是否开启 Coach HUD（可选）。
- 老用户默认 **不自动开启** HUD，需在提示或设置中手动启用。

#### 系统要求

- Windows 10 / 11（64 位）

#### 链接

- [冷启动测试清单](./COLD_START_TEST_v1.0.0.md) · [更新日志](../CHANGELOG.md) · [反馈问题](https://github.com/psterman/voice-pilot/issues/new?template=bug_report.yml)
