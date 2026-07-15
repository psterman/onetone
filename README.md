# 一声 OneTone

官网：**https://www.onetone.app**

言出即行，万象成形 · *speak to create*

[English](README.en.md) | 中文

[![Release](https://img.shields.io/github/v/release/psterman/onetone)](https://github.com/psterman/onetone/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/psterman/onetone/release.yml)](https://github.com/psterman/onetone/actions)
[![Stars](https://img.shields.io/github/stars/psterman/onetone)](https://github.com/psterman/onetone/stargazers)

> v1.0.0 未做代码签名。Windows SmartScreen 可能在首次安装时拦截，请点击 **更多信息** -> **仍要运行**。

一声 OneTone 是一个 Windows 桌面工具：把鼠标侧键、音量键、手柄、蓝牙戒指、轨迹球、遥控器、麦克风口令等触发方式，连接到你正在使用的语音输入法或流式输入法。

它不是新的输入法，也不负责替代听写引擎。OneTone 是后台触发层：负责录入触发源、发送输入法激活键、管理语音起止和说完后的动作，让你在任意输入框里更快开始说话、上屏和发送。

**不依赖 AutoHotkey，不依赖牛马（niuma）主程序。**

## 它解决什么

很多语音输入工具都需要你先切换窗口、点按钮或按复杂快捷键。OneTone 把这条链路缩短成：

```
外设 / 口令触发 -> OneTone -> 流式输入法或语音输入法 -> 当前输入框
```

典型场景：

- 手在鼠标上：按鼠标侧键，直接开始语音输入。
- 离键盘较远：用手柄、遥控器或蓝牙戒指触发。
- 不想动手：用麦克风口令唤醒输入法，或用结束词 / 取消词完成或丢掉这一轮。
- 多场景切换：邮件、笔记、聊天、文档各自一套方案（习惯 / 情景）。

## 核心功能

### 首页 Workbench

- **Hero 工作台**：听写字幕、待命/听写状态、停止/恢复转写；语音与按键两种激活方式一键切换。
- **快速入门**：引导完成触发链路试跑。
- **按键 / 语音联动卡**：展示当前快捷键或唤醒词，点进对应设置。
- **麦克风与引擎**：设备、电平与识别引擎合在一张卡；唤醒词悬停可见。
- **情景底栏**：横向切换常用方案，末尾可新建习惯。

### 触发与方案

- **任意设备触发**：键盘、鼠标、音量键、组合键、手柄、轨迹球、蓝牙外设等 Windows 可识别输入。
- **输入法快捷键映射**：触发源 → 语音 / 流式输入法激活键。
- **输入法预设**：Typeless、智谱、千问、闪电说、搜狗、讯飞、微信输入法等；也可手动录制任意快捷键。
- **习惯 / 情景方案**：多套映射按场景保存、排序与切换；支持目标按键目录与应用定向。

### 语音链路（唤起 → 识别 → 发送）

- **语音唤醒**：Windows SAPI、离线 Vosk，以及关键词唤醒（KWS）。
- **声学命令**：为习惯配置声学口令与样本；取消词、结束词、说完/丢掉本轮。
- **说完动作**：静音等待、Enter / 发送等，按方案配置。
- **本地优先**：配置在本机；唤醒与 KWS 可走本地引擎，不上传到 OneTone 服务器。

### 常驻与反馈

- **Coach HUD**：底部轻提示（映射、监听/听写状态、触发反馈）。
- **系统托盘**：暂停/恢复、设置入口、开机自启。
- **应用内更新**：启动时检查新版本（不覆盖本地配置）。

## 快速上手

1. 从 [GitHub Releases](https://github.com/psterman/onetone/releases) 下载 Windows 安装包。
2. 首次安装若出现 SmartScreen，点击 **更多信息** -> **仍要运行**。
3. 打开 OneTone，完成首次引导（或首页 **快速入门**）。
4. 录入一个触发源（音量键、鼠标侧键、蓝牙外设等）。
5. 选择输入法预设，或手动录入语音输入法激活键。
6. 在任意输入框里触发一次；输入法进入听写或文字上屏，即表示链路跑通。

建议先用内置预设跑通按键链路，再按需开启语音唤醒、结束/取消词和自动发送。

## 系统要求

- Windows 10 / 11（x64）
- 一个可通过快捷键激活的语音输入法或流式输入法
- 可选：麦克风（语音唤醒、KWS、结束/取消词）

## 安装与更新

- 安装包：[GitHub Releases](https://github.com/psterman/onetone/releases)
- 启动后检查更新；只替换程序文件，不覆盖本地配置。

配置位置：

```
%APPDATA%\onetone\config\settings.json
```

首次启动时，若 `%APPDATA%\Voice Pilot\config\settings.json` 或 exe 同目录旧配置存在，会自动迁移。

## 开发

技术栈：

- 前端：`src/` 原生 HTML / CSS / JavaScript（首页 workbench + 设置页）
- 后端：Rust + Tauri 2（`src-tauri/`，含 `onetone-logic` 等 crate）
- 热键与设备：Windows 低级钩子 + Raw Input + RegisterHotKey
- 语音：SAPI / Vosk / KWS + 声学命令运行时

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
│   ├── src/             # 热键、语音运行时、IPC
│   └── tauri.conf.json
├── website/             # 官网
├── docs/                # 隐私、条款、发布说明
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
