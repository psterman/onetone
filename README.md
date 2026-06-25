# Voice Pilot

独立的 Windows 桌面应用：把硬件启动键（音量键、侧键、组合键等）映射到语音输入法的激活快捷键。

**不依赖 AutoHotkey，不依赖牛马（niuma）主程序。**

## 技术栈

- 前端：`src/index.html`（内嵌 WebView）
- 后端：Rust + Tauri 2
- 热键：Windows 低级钩子 + Raw Input + RegisterHotKey

## 环境要求

- Windows 10/11
- [Rust](https://rustup.rs/)（含 `cargo`）
- [Tauri CLI](https://v2.tauri.app/)：`cargo install tauri-cli`

## 开发

```powershell
cd src-tauri
cargo tauri dev
```

## 构建发布版

```powershell
# 方式一：npm script
npm run build

# 方式二：脚本（会先结束旧进程再编译）
.\run_voice_pilot.ps1

# 方式三：直接 cargo
cd src-tauri
cargo tauri build
```

产物：`src-tauri/target/release/voice-pilot.exe`

## 配置位置

用户配置保存在：

```
%APPDATA%\Voice Pilot\config\settings.json
```

首次启动时，若 exe 同目录存在旧的 `voice_input_settings.json`，会自动迁移到上述路径。

## 从牛马仓库迁出

本仓库自牛马（niuma）实验目录独立而来，GitHub：**https://github.com/psterman/voice-pilot**

旧 AHK 实现仅作历史参考，不在此仓库内（牛马仓库 `archive/voice-pilot-legacy-ahk-20260625/`）。

## 目录结构

```
voice-pilot/
├── src/                 # 设置界面
├── src-tauri/           # Rust 后端
│   ├── src/
│   │   ├── hotkey_win.rs   # 热键捕获与绑定
│   │   ├── config.rs       # 方案配置与迁移
│   │   ├── key_chord.rs    # 组合键解析
│   │   └── ipc.rs          # 前后端通信
│   └── tauri.conf.json
├── package.json
└── run_voice_pilot.ps1
```

## 许可证

与上游项目保持一致（若未单独声明，请在使用前自行确认）。
