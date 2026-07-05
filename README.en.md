# OneTone

Website: **https://www.onetone.app**

[English](README.en.md) | [中文](README.md)

[![Release](https://img.shields.io/github/v/release/psterman/voice-pilot)](https://github.com/psterman/voice-pilot/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/psterman/voice-pilot/release.yml)](https://github.com/psterman/voice-pilot/actions)
[![Stars](https://img.shields.io/github/stars/psterman/voice-pilot)](https://github.com/psterman/voice-pilot/stargazers)

> v1.0.0 is unsigned. Windows SmartScreen may block the installer on first launch. Click **More info** -> **Run anyway**.

OneTone is a Windows desktop utility that connects hardware triggers and voice commands to the voice-input or streaming IME you already use.

It is not a new IME and it does not replace your dictation engine. OneTone is the trigger layer in the background: it records your trigger source, sends the IME activation shortcut, manages voice wake/end phrases, and runs after-speaking actions so you can start dictating in any text field faster.

**No AutoHotkey. No external host app required.**

## What It Solves

Many voice-input tools still require you to switch windows, click a button, or press an awkward shortcut. OneTone shortens the path to:

```
device / voice trigger -> OneTone -> voice-input or streaming IME -> focused text field
```

Typical scenarios:

- Your hand is on the mouse: press a side button and start dictating.
- You are away from the keyboard: trigger with a gamepad, remote, Bluetooth ring, or trackball.
- You want hands-free control: use a microphone phrase to wake voice input, then an end phrase to commit or send.
- You type often: keep different schemes for email, notes, chat, and documents.

## Features

- **Trigger from many devices**: keyboard keys, mouse buttons, volume keys, key chords, gamepads, trackballs, Bluetooth devices, and other Windows-recognized inputs.
- **IME shortcut mapping**: map your trigger source to the shortcut that activates your voice-input or streaming IME.
- **IME presets**: built-in entries for Typeless, Zhipu, Qianwen, Shandianshuo, Sogou, Xunfei, WeChat IME, and manual shortcuts.
- **Voice wake**: optional Windows SAPI or offline Vosk wake phrases.
- **Voice end and after-speaking actions**: end phrases, delay, Enter/send behavior, and commit actions.
- **Multiple schemes**: save and switch mappings for different devices, IMEs, or workflows.
- **Coach HUD**: a small bottom overlay for current mapping, listening/dictation state, and success feedback.
- **System tray workflow**: tray control, pause, settings, and autostart.
- **Local-first behavior**: settings stay on your machine; voice wake can run through local SAPI/Vosk and is not uploaded to OneTone servers.

## Quick Start

1. Download the latest Windows installer from [GitHub Releases](https://github.com/psterman/voice-pilot/releases).
2. If SmartScreen appears, choose **More info** -> **Run anyway**.
3. Launch OneTone and complete the first-run guide.
4. Record a trigger source, such as a volume key, mouse side button, or Bluetooth device button.
5. Pick an IME preset, or manually record the shortcut your voice-input method uses.
6. Focus any text field and trigger once. If the IME starts listening or text lands in the field, the chain is working.

Start with an IME preset, then enable voice wake, end phrases, or auto-send if you need them.

## Requirements

- Windows 10 or 11 (x64)
- A voice-input method or streaming IME that exposes a keyboard shortcut
- Optional: microphone for voice wake and end phrases

## Install and Updates

- Installer: [GitHub Releases](https://github.com/psterman/voice-pilot/releases)
- The app checks for new versions on startup and shows an in-app update banner.
- Updates replace application files only. Your local configuration is preserved.

User settings are stored at:

```
%APPDATA%\onetone\config\settings.json
```

On first launch, OneTone migrates legacy configs from `%APPDATA%\Voice Pilot\config\settings.json` or an exe-adjacent `settings.json` if present.

## Development

Stack:

- Frontend: `src/index.html` + plain JavaScript
- Backend: Rust + Tauri 2
- Hotkeys and device input: Windows low-level hooks + Raw Input + RegisterHotKey
- Voice wake: Windows SAPI + optional offline Vosk

Requirements:

- [Rust](https://rustup.rs/) with `cargo`
- [Tauri CLI](https://v2.tauri.app/): `cargo install tauri-cli`

Run locally:

```powershell
cd src-tauri
cargo tauri dev
```

Build release:

```powershell
# Option 1: npm script
npm run build

# Option 2: helper script
.\run_onetone.ps1
.\run_onetone.ps1 -Rebuild

# Option 3: cargo directly, NSIS installer recommended
cd src-tauri
cargo clean -p onetone
cargo tauri build --bundles nsis
```

Output:

- Executable: `src-tauri/target/release/onetone.exe`
- Installer: `src-tauri/target/release/bundle/nsis/*-setup.exe`

If local builds warn that `TAURI_SIGNING_PRIVATE_KEY` is not set, the installer can still be generated. Updater signature files require CI with repository secrets.

Maintainers need these GitHub repository secrets before publishing updater releases:

```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

`TAURI_SIGNING_PRIVATE_KEY` must match the updater public key in `src-tauri/tauri.conf.json`.

## Project Layout

```
voice-pilot/
├── assets/              # Brand source assets
├── src/                 # Desktop frontend, icons, sounds, IME presets
├── src-tauri/           # Rust backend and Tauri config
│   ├── icons/
│   ├── src/
│   │   ├── hotkey_win.rs
│   │   ├── config.rs
│   │   ├── key_chord.rs
│   │   └── ipc/
│   └── tauri.conf.json
├── website/             # Static website
├── docs/                # Privacy policy, terms, release notes
├── package.json
├── run_onetone.ps1
└── Start-OneTone.vbs
```

## Repository

**https://github.com/psterman/voice-pilot**

This repository was split out from an experimental voice-pilot prototype. The legacy AutoHotkey implementation lives in a separate archive and is not part of this repo.

## Legal

- [Privacy Policy](docs/PRIVACY.md)
- [Terms of Service](docs/TERMS.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2026 psterman
