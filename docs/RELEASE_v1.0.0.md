# OneTone v1.0.0 — GitHub Release Body

Copy the section below into the GitHub Release description when publishing (or let CI use `release.yml` and paste this as a supplement).

---

## English

## OneTone v1.0.0 — First public release

Map hardware keys (mouse side buttons, volume keys, combos) to your voice-input shortcut on Windows.

### Requirements

- **Windows 10 or 11 (x64)**

### Download

- Install the **`.exe` NSIS installer** from the assets below.
- Portable users: run the installer once, then launch from Start menu or system tray.

### First launch

1. If **SmartScreen** blocks the installer: click **More info** → **Run anyway** (unsigned binary).
2. Complete the **welcome guide**.
3. Map your hardware key to your IME voice shortcut (e.g. `Win+H`).
4. Press the key in any app — voice input should activate.

### Config & updates

- Settings: `%APPDATA%\onetone\config\settings.json`
- Updates replace the app only — your mappings are preserved.
- In-app update: header chip → **Check for updates**

### Known limitations

- Windows x64 only (no macOS/Linux in v1.0.0)
- No code signing — SmartScreen on first install
- See [CHANGELOG.md](../CHANGELOG.md) for full notes

### Links

- [README (English)](../README.en.md) · [Privacy](../docs/PRIVACY.md) · [Report a bug](https://github.com/psterman/onetone/issues/new?template=bug_report.yml)

---

## 中文

## 一声 OneTone v1.0.0 — 首次公开发布

把硬件启动键（鼠标侧键、音量键、组合键等）映射到语音输入法的激活快捷键。

### 系统要求

- **Windows 10 / 11（64 位）**

### 下载安装

- 下载下方 **NSIS 安装包（.exe）**。
- 安装后从开始菜单或系统托盘启动。

### 首次启动

1. 若 **SmartScreen** 拦截：点击 **更多信息** → **仍要运行**（安装包未签名）。
2. 完成 **首次引导**。
3. 将硬件键映射到输入法语音快捷键（如 `Win+H`）。
4. 在任意应用中按下硬件键，应能唤起语音输入。

### 配置与更新

- 配置路径：`%APPDATA%\onetone\config\settings.json`
- 更新只替换程序，不覆盖本地配置。
- 应用内检查更新：顶部 **检查更新**

### 已知限制

- 仅 Windows x64（v1.0.0 暂无 macOS/Linux）
- 无代码签名，首次安装可能触发 SmartScreen
- 完整说明见 [CHANGELOG.md](../CHANGELOG.md)

### 链接

- [README（中文）](../README.md) · [隐私政策](../docs/PRIVACY.md) · [反馈问题](https://github.com/psterman/onetone/issues/new?template=bug_report.yml)
