# 一声 · onetone

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
.\run_onetone.ps1

# 方式三：直接 cargo
cd src-tauri
cargo tauri build
```

产物：`src-tauri/target/release/onetone.exe`

## 配置位置

用户配置保存在：

```
%APPDATA%\onetone\config\settings.json
```

首次启动时，若 `%APPDATA%\Voice Pilot\config\settings.json` 或 exe 同目录下的旧配置文件存在，会自动迁移到新路径。

应用会在启动后自动检查在线新版本，并在界面顶部提示可更新；更新只替换程序文件，不会覆盖本地配置数据。

正式发布时需要为 Tauri updater 配置签名私钥和密码环境变量；本仓库已内置公钥和更新源地址，适合配合 GitHub Releases 发布。

若界面提示“线上更新文件还没有发布”，说明 GitHub Release 中缺少 updater 需要的 `latest.json`。推送 `v1.0.1` 这类 tag 后，`.github/workflows/release.yml` 会自动构建 Windows 安装包，并上传安装包、`.sig` 签名文件和 `latest.json`。

发布前需要在 GitHub 仓库 Secrets 中配置：

```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

其中 `TAURI_SIGNING_PRIVATE_KEY` 必须与 `src-tauri/tauri.conf.json` 中的 updater 公钥匹配，否则已安装用户无法校验并安装新版本。

## 从牛马仓库迁出

本仓库自牛马（niuma）实验目录独立而来，GitHub：**https://github.com/psterman/voice-pilot**

旧 AHK 实现仅作历史参考，不在此仓库内（牛马仓库 `archive/voice-pilot-legacy-ahk-20260625/`）。

## 目录结构

```
voice-pilot/
├── assets/
│   └── icons/onetone-logo-source.png  # 品牌图标源文件
├── src/                 # 设置界面（含 icon.png）
├── src-tauri/           # Rust 后端
│   ├── icons/           # 应用图标（ico / png / icns）
│   ├── src/
│   │   ├── hotkey_win.rs   # 热键捕获与绑定
│   │   ├── config.rs       # 方案配置与迁移
│   │   ├── key_chord.rs    # 组合键解析
│   │   └── ipc.rs          # 前后端通信
│   └── tauri.conf.json
├── package.json
├── run_onetone.ps1
└── Start-OneTone.vbs
```

## 许可证

与上游项目保持一致（若未单独声明，请在使用前自行确认）。
