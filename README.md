# 一声 OneTone

官网：**https://www.onetone.app**

[English](README.en.md) | 中文

[![Release](https://img.shields.io/github/v/release/psterman/voice-pilot)](https://github.com/psterman/voice-pilot/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/psterman/voice-pilot/release.yml)](https://github.com/psterman/voice-pilot/actions)
[![Stars](https://img.shields.io/github/stars/psterman/voice-pilot)](https://github.com/psterman/voice-pilot/stargazers)

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
- 不想动手：用麦克风口令唤醒输入法，或用结束词完成上屏/发送。
- 频繁输入：为邮件、笔记、聊天、文档配置不同方案。

## 核心功能

- **任意设备触发**：支持 Windows 可识别的键盘、鼠标、音量键、组合键、手柄、轨迹球、蓝牙外设等输入。
- **输入法快捷键映射**：把触发源映射到语音输入法/流式输入法的激活键。
- **输入法预设**：内置 Typeless、智谱、千问、闪电说、搜狗、讯飞、微信输入法等预设入口，也支持手动录制任意快捷键。
- **语音唤醒**：可选 Windows SAPI 或离线 Vosk，用口令触发输入法。
- **语音结束与说完动作**：可设置结束词、延迟、Enter/发送等说完后的动作。
- **多方案管理**：为不同触发源、输入法或使用场景保存多套方案并快速切换。
- **Coach HUD**：底部轻提示显示当前映射、监听/听写状态和触发成功反馈。
- **系统托盘常驻**：支持托盘控制、暂停、设置入口和开机自启。
- **本地优先**：配置保存在本机；语音唤醒可使用本地 SAPI/Vosk，不上传到 OneTone 服务器。

## 快速上手

1. 从 [GitHub Releases](https://github.com/psterman/voice-pilot/releases) 下载 Windows 安装包。
2. 首次安装若出现 SmartScreen，点击 **更多信息** -> **仍要运行**。
3. 打开 OneTone，完成首次引导。
4. 录入一个触发源，例如音量键、鼠标侧键或蓝牙外设按键。
5. 选择输入法预设，或手动录入你的语音输入法激活键。
6. 在任意输入框里触发一次；看到输入法进入听写或文字上屏，即表示链路跑通。

建议先用内置输入法预设跑通，再按需开启语音唤醒、结束词和自动发送。

## 系统要求

- Windows 10 / 11（x64）
- 一个可通过快捷键激活的语音输入法或流式输入法
- 可选：麦克风，用于语音唤醒和结束词

## 安装与更新

- 安装包：见 [GitHub Releases](https://github.com/psterman/voice-pilot/releases)
- 应用启动后会检查新版本，并在界面顶部提示更新。
- 更新只替换程序文件，不会覆盖本地配置。

配置位置：

```
%APPDATA%\onetone\config\settings.json
```

首次启动时，若 `%APPDATA%\Voice Pilot\config\settings.json` 或 exe 同目录下的旧配置文件存在，会自动迁移到新路径。

## 开发

技术栈：

- 前端：`src/index.html` + 原生 JavaScript
- 后端：Rust + Tauri 2
- 热键与设备输入：Windows 低级钩子 + Raw Input + RegisterHotKey
- 语音唤醒：Windows SAPI + 可选离线 Vosk

环境要求：

- [Rust](https://rustup.rs/)（含 `cargo`）
- [Tauri CLI](https://v2.tauri.app/)：`cargo install tauri-cli`

启动开发环境：

```powershell
cd src-tauri
cargo tauri dev
```

构建发布版：

```powershell
# 方式一：npm script
npm run build

# 方式二：脚本（默认直接启动已构建的 exe；需要重编译时加 -Rebuild）
.\run_onetone.ps1
.\run_onetone.ps1 -Rebuild

# 方式三：直接 cargo（推荐 NSIS 安装包）
cd src-tauri
cargo clean -p onetone
cargo tauri build --bundles nsis
```

产物：

- 可执行文件：`src-tauri/target/release/onetone.exe`
- 安装包：`src-tauri/target/release/bundle/nsis/*-setup.exe`

本地构建若提示 `TAURI_SIGNING_PRIVATE_KEY` 未设置，安装包仍会生成，但 updater 签名文件需在有 Secrets 的 CI 环境中产出。

发布前需要在 GitHub 仓库 Secrets 中配置：

```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

其中 `TAURI_SIGNING_PRIVATE_KEY` 必须与 `src-tauri/tauri.conf.json` 中的 updater 公钥匹配，否则已安装用户无法校验并安装新版本。

## 目录结构

```
voice-pilot/
├── assets/              # 品牌图标源文件
├── src/                 # 桌面应用前端、图标、声音、IME 预设
├── src-tauri/           # Rust 后端与 Tauri 配置
│   ├── icons/
│   ├── src/
│   │   ├── hotkey_win.rs
│   │   ├── config.rs
│   │   ├── key_chord.rs
│   │   └── ipc/
│   └── tauri.conf.json
├── website/             # 官网静态页面
├── docs/                # 隐私政策、服务条款、发布说明
├── package.json
├── run_onetone.ps1
└── Start-OneTone.vbs
```

## 从牛马仓库迁出

本仓库自牛马（niuma）实验目录独立而来，GitHub：**https://github.com/psterman/voice-pilot**

旧 AHK 实现仅作历史参考，不在此仓库内（牛马仓库 `archive/voice-pilot-legacy-ahk-20260625/`）。

## 法律信息

- [隐私政策](docs/PRIVACY.md)
- [服务条款](docs/TERMS.md)
- [更新日志](CHANGELOG.md)
- [参与贡献](CONTRIBUTING.md)

## 许可证

MIT License — 详见 [LICENSE](LICENSE)。

Copyright (c) 2026 psterman
