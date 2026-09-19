# 一声 OneTone

官网：**https://www.onetone.app**

桌面应用之间的自然交互中间层 · *bridge every trigger to every app*

[English](README.en.md) | 中文

[![Release](https://img.shields.io/github/v/release/psterman/onetone)](https://github.com/psterman/onetone/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/psterman/onetone/release.yml)](https://github.com/psterman/onetone/actions)
[![Stars](https://img.shields.io/github/stars/psterman/onetone)](https://github.com/psterman/onetone/stargazers)

> v1.0.0 未做代码签名。Windows SmartScreen 可能在首次安装时拦截，请点击 **更多信息** -> **仍要运行**。

## 它是什么

OneTone 是 Windows 桌面上的**应用自然交互中间层**。它不替换输入法、不替代听写引擎，也不替代任何 Agent。

它做的事是把桌面上的所有触发来源——**声音、按键、摄像头、外设、虚拟面板、Agent 状态灯**——统一成一个执行层，接到**你正在操作的任意桌面应用**里。

**不依赖 AutoHotkey，不依赖任何宿主应用。**

## 它解决什么问题

桌面工作流已经被切碎：

- 一个 AI 编程 Agent 一套快捷键、一套 Composer 入口
- 一套习惯对应一套按键，切换应用 = 重新记一遍快捷键 + 重新对准输入框
- Agent 在后台跑的时候，没法在桌面上"看一眼它卡在哪了"
- 摄像头、麦克风、鼠标侧键、手柄这些触发介质互不打通

OneTone 把这条链路统一成：

```text
voice / keys / softPad / camera  ->  OneTone  ->  任何桌面应用
                                          |
                                          └─  PadStatus 状态灯  ->  Agent Hook 反馈
```

## 核心架构

| 维度 | 内容 |
|---|---|
| **四通道输入** | voice / keys / softPad / camera，触发同一组能力卡（`slotId`），统一 dispatch |
| **应用适配** | 17+ 个 `AppChatProfile`：Cursor、Codex、Claude、Trae、Windsurf、Qoder、Roo、Aider、Cline、Copilot …… |
| **状态灯** | `PadStatus` × Agent Hook：Codex 单灯、Claude 自建多灯聚合 |
| **定制工作流** | habit / scene / `agentBindings` / `semantic_action` / `app-behavior-rules` |
| **本地优先** | KWS、摄像头、视觉触发都在本机；不上传 OneTone 服务器 |

## 四通道

四通道不是四个并列功能，而是**同一组能力卡的四种触发方式**。Hook 决定"现在什么态"，每一态高亮哪些能力卡可说 / 可按。

### voice（语音）

- **闭集口令**：本地 KWS（Vosk）exact match；grammar 按 Hook 态过滤
- **长内容听写**：走第三方输入法（PTT），与口令分层，不抢同一 decoder
- **声学命令**：取消词、结束词、说完、丢本轮
- **本地引擎**：Windows SAPI、离线 Vosk、KWS

### keys（按键）

- 键盘、鼠标侧键、音量键、组合键、手柄、轨迹球、蓝牙戒指 / 外设等 Windows 可识别输入
- Windows 低级钩子 + Raw Input + RegisterHotKey
- 与 voice / softPad 同一 `slotId`，可复用同一动作

### softPad（虚拟面板）

- 屏幕上的能力卡面板——**看得见、按得着、点得到**
- 与口令、实体键**同一槽位**——按 Pad = 喊口令 = 按实体键
- 迷你栏 = Pad 的条形投影，chip 与 Pad 键共享 `slotId`

### camera（摄像头）

- MediaPipe face landmarker，本地推理
- 触发类型：离席 / 回席、摇头、长眨、OK 手势、五指摊开、握拳、双眨、视线三区 / 9 宫格停留
- 典型动作：离席 → 暂停语音 + 隐私屏；摇头 → 取消；长眨 → 激活；OK → 确认
- 不把摄像头当精确鼠标；区域停留运行时本轮不接

## 应用适配（AppChatProfile）

`src-tauri/src/app_chat_workflow.rs` 维护了一组应用 profile，每个都有：进程名、路径标记、激活键、Composer 锚点、UIA 兼容性。

```text
Cursor · Codex · Claude · MiniMax · Workbuddy
Trae (Work / Code / Chat) · Windsurf · Qoder
Gemini CLI · Cline · Roo · OpenCode
Copilot (CLI / VSCode) · Aider · ……
```

每个应用还配 Hook（Cursor / Codex / Claude / Copilot / Aider 等）和 `semantic_action`。

新增应用 = 新增一个 `AppChatProfile`，不改 dispatch 主体。

## 状态灯（PadStatus）

OneTone 在 Soft Pad 上提供状态灯，与 Agent 联动：

- **Codex Hook** → 主 `PadStatus` 单灯（`slotId=status`；无则 fallback AG00）
- **Claude Hook** → **Claude Agent Activity Pad**：`claude_lights` 自建多灯（agent 活动灯 + OneTone 自建聚合）
- Loopback 监听 `127.0.0.1:8796`：`POST /api/codex-app/state` 等

Agent 在跑、停、等输入、有 diff——不用切回 Agent 窗口，看一眼 Pad 上的灯就行。

## 定制工作流

每一张能力卡都有四重绑定：

| 绑定 | 内容 |
|---|---|
| 视觉 | Pad 键帽 + 迷你栏 chip |
| 按键 | Soft Pad 一键 |
| 口令 | 固定口令（如「定计划」「发送」） |
| 应用 | 快捷键 / 聚焦 / Hook 反馈 |

存储：`agentBindings` 中同一 `slotId` 可同时有 `triggerType: softPad | voice | key`。

按应用 / 场景分别保存为 **habit（习惯）** 和 **scene（情景）**，横向切换。

**输入瞄准：** `input_focus_aim` 共享层——任何通道在注入文本前，都先对准目标应用的输入框（探测 → 激活 → 聚焦 → 安全写入），失败时主动拒绝（fail-closed）。

## 快速上手

1. 从 [GitHub Releases](https://github.com/psterman/onetone/releases) 下载 Windows 安装包
2. 首次安装若出现 SmartScreen，点击 **更多信息** -> **仍要运行**
3. 打开 OneTone，完成首次引导（或首页 **快速入门**）
4. 选一个应用（推荐先从 Cursor / Codex / Claude 开始），录入激活键
5. 在 Pad 上点一张能力卡，或喊口令，或按侧键——触发完成
6. 按需开启摄像头通道、状态灯、定制工作流

## 系统要求

- Windows 10 / 11（x64）
- 可选：麦克风（语音唤醒、KWS、声学命令）
- 可选：摄像头（MediaPipe，本地推理）
- 可选：鼠标 / 手柄 / 蓝牙戒指等外设

## 安装与更新

- 安装包：[GitHub Releases](https://github.com/psterman/onetone/releases)
- 启动后检查更新；只替换程序文件，不覆盖本地配置

配置位置：

```
%APPDATA%\onetone\config\settings.json
```

首次启动时，若 `%APPDATA%\Voice Pilot\config\settings.json` 或 exe 同目录旧配置存在，会自动迁移。

## 开发

技术栈：

- 前端：`src/` 原生 HTML / CSS / JavaScript（首页 workbench + 设置页）
- 后端：Rust + Tauri 2（`src-tauri/`，含 `onetone-logic` 等 crate）
- 触发层：Windows 低级钩子 + Raw Input + RegisterHotKey
- 语音：SAPI / Vosk / KWS + 声学命令运行时
- 视觉：MediaPipe face landmarker（本地）

环境：

- [Rust](https://rustup.rs/)（含 `cargo`）
- [Tauri CLI](https://v2.tauri.app/)：`cargo install tauri-cli`

```powershell
cd src-tauri
cargo tauri dev
```

构建发布版：

```powershell
npm run build

# 或
.\run_onetone.ps1
.\run_onetone.ps1 -Rebuild

# NSIS 安装包
cd src-tauri
cargo clean -p onetone
cargo tauri build --bundles nsis
```

产物：

- `src-tauri/target/release/onetone.exe`
- `src-tauri/target/release/bundle/nsis/*-setup.exe`

本地构建若缺少 `TAURI_SIGNING_PRIVATE_KEY`，安装包仍可生成；updater 签名需在配置 Secrets 的 CI 中产出。发布前请在仓库 Secrets 配置：

```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

私钥须与 `src-tauri/tauri.conf.json` 中的 updater 公钥匹配。

## 目录结构

```
onetone/
├── assets/              # 品牌图标源文件
├── src/                 # 桌面前端（首页 / 设置 / 托盘 / HUD）
├── src-tauri/           # Rust 后端与 Tauri 配置
│   ├── crates/          # 逻辑与共享 crate
│   ├── src/             # 热键、语音运行时、IPC、AppChatProfile、PadStatus
│   └── tauri.conf.json
├── website/             # 官网
├── docs/                # 隐私、条款、发布说明、能力卡契约
├── package.json
├── run_onetone.ps1
└── Start-OneTone.vbs
```

## 从牛马仓库迁出

本仓库自牛马（niuma）实验目录独立而来，GitHub：**https://github.com/psterman/onetone**

旧 AHK 实现仅作历史参考，不在此仓库内。

## 法律信息

- [隐私政策](docs/PRIVACY.md)
- [服务条款](docs/TERMS.md)
- [更新日志](CHANGELOG.md)
- [参与贡献](CONTRIBUTING.md)

## 许可证

MIT License — 详见 [LICENSE](LICENSE)。

Copyright (c) 2026 psterman