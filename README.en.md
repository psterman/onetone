# OneTone

Website: **https://www.onetone.app**

[English](README.en.md) | [中文](README.md)

[![Release](https://img.shields.io/github/v/release/psterman/voice-pilot)](https://github.com/psterman/voice-pilot/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/psterman/voice-pilot/release.yml)](https://github.com/psterman/voice-pilot/actions)
[![Stars](https://img.shields.io/github/stars/psterman/voice-pilot)](https://github.com/psterman/voice-pilot/stargazers)

> ⚠️ v1.0.0 is **unsigned**. Windows SmartScreen may block the installer on first launch — click **More info** → **Run anyway**.

OneTone maps hardware trigger keys (volume keys, mouse side buttons, combos, and more) to the keyboard shortcut that activates your voice-input method.

**No AutoHotkey. No external host app required.**

## Quick start (5 minutes)

1. **Download** the latest Windows installer from [GitHub Releases](https://github.com/psterman/voice-pilot/releases).
2. If SmartScreen appears, choose **More info** → **Run anyway**.
3. **Launch OneTone** and complete the welcome guide on first run.
4. Open **Settings → Key mapping**, pick a hardware key, and record the shortcut your IME uses for voice input (e.g. `Win+H`, `Ctrl+Shift+Space`).
5. Press your hardware key in any app — voice input should open. Use the tray icon to pause listening or open settings.

## Features

- Hardware key → voice-input shortcut mapping (side buttons, volume keys, macro keyboards)
- Optional voice wake and end-of-dictation phrases (Windows SAPI + offline Vosk)
- Multiple schemes with quick switching
- Bilingual UI (English / Chinese), light and dark themes
- System tray, autostart, and in-app updates via GitHub Releases

## Requirements

- Windows 10 or 11 (x64)
- A voice-input method that exposes a keyboard shortcut (built-in Windows voice typing, IME, third-party tools, etc.)

### Build from source (developers)

- [Rust](https://rustup.rs/) with `cargo`
- [Tauri CLI](https://v2.tauri.app/): `cargo install tauri-cli`

## Development

```powershell
cd src-tauri
cargo tauri dev
```

## Build release

```powershell
# Option 1: npm script
npm run build

# Option 2: helper script (stops old process, then builds)
.\run_onetone.ps1

# Option 3: cargo directly
cd src-tauri
cargo tauri build
```

Output: `src-tauri/target/release/onetone.exe` (installer under `src-tauri/target/release/bundle/`)

## Configuration

User settings are stored at:

```
%APPDATA%\onetone\config\settings.json
```

On first launch, OneTone migrates legacy configs from `%APPDATA%\Voice Pilot\config\settings.json` or an exe-adjacent `settings.json` if present.

Updates replace application files only — your local configuration is preserved.

## Auto-update

The app checks for new versions on startup and shows an in-app banner when an update is available.

Releases are published via GitHub Actions when you push a version tag (e.g. `v1.0.1`). The workflow uploads the installer, signature files, and `latest.json` for the Tauri updater.

Required GitHub repository secrets for maintainers:

```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

`TAURI_SIGNING_PRIVATE_KEY` must match the updater public key in `src-tauri/tauri.conf.json`.

## Repository

**https://github.com/psterman/voice-pilot**

Forked from an experimental voice-pilot prototype; the legacy AutoHotkey implementation lives in a separate archive and is not part of this repo.

## Project layout

```
voice-pilot/
├── assets/              # Brand icons and sounds
├── src/                 # Settings UI (index.html, icon.png)
├── src-tauri/           # Rust backend + Tauri config
│   ├── icons/
│   ├── src/
│   │   ├── hotkey_win.rs
│   │   ├── config.rs
│   │   ├── key_chord.rs
│   │   └── ipc.rs
│   └── tauri.conf.json
├── docs/                # Privacy policy, terms
├── package.json
└── run_onetone.ps1
```

## Legal

- [Privacy Policy](docs/PRIVACY.md)
- [Terms of Service](docs/TERMS.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2026 psterman
