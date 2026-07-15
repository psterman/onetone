# OneTone

Website: **https://www.onetone.app**

言出即行，万象成形 · *speak to create*

[English](README.en.md) | [中文](README.md)

[![Release](https://img.shields.io/github/v/release/psterman/onetone)](https://github.com/psterman/onetone/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/psterman/onetone/release.yml)](https://github.com/psterman/onetone/actions)
[![Stars](https://img.shields.io/github/stars/psterman/onetone)](https://github.com/psterman/onetone/stargazers)

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
- You want hands-free control: wake with a microphone phrase, then finish or cancel with end/cancel phrases.
- You switch contexts often: keep separate habits/scenes for email, notes, chat, and documents.

## Features

### Home workbench

- **Hero dashboard**: live caption, standby/dictating state, pause/resume transcription; switch voice vs hotkey activation.
- **Quick start**: walk through a first successful trigger chain.
- **Hotkey / voice cards**: show the current shortcut or wake phrases; open the matching settings.
- **Mic + engine card**: device, level meters, and recognition engine in one place; wake phrases appear on hover.
- **Scene rail**: switch habits horizontally; add a new habit from the trailing card.

### Triggers and schemes

- **Many device triggers**: keyboard, mouse, volume keys, chords, gamepads, trackballs, Bluetooth devices, and other Windows-recognized inputs.
- **IME shortcut mapping**: map a trigger to the shortcut that activates your voice-input or streaming IME.
- **IME presets**: Typeless, Zhipu, Qianwen, Shandianshuo, Sogou, Xunfei, WeChat IME, plus manual shortcut capture.
- **Habits / scenes**: save, sort, and switch mappings per workflow; target-key catalog and app targeting.

### Voice pipeline (wake → recognize → send)

- **Voice wake**: Windows SAPI, offline Vosk, and keyword spotting (KWS).
- **Acoustic commands**: habit-level acoustic phrases and samples; cancel phrases, end phrases, finish/discard the current turn.
- **After-speaking actions**: silence wait, Enter/send, and scheme-specific finish behavior.
- **Local-first**: settings stay on disk; wake/KWS can run locally and are not uploaded to OneTone servers.

### Always-on UX

- **Coach HUD**: compact overlay for mapping, listening/dictation state, and feedback.
- **System tray**: pause/resume, settings, autostart.
- **In-app updates**: checks on launch without overwriting local config.

## Quick Start

1. Download the latest Windows installer from [GitHub Releases](https://github.com/psterman/onetone/releases).
2. If SmartScreen appears, choose **More info** -> **Run anyway**.
3. Launch OneTone and complete onboarding (or use **Quick start** on the home page).
4. Record a trigger source (volume key, mouse side button, Bluetooth button, etc.).
5. Pick an IME preset, or manually record your voice-input shortcut.
6. Focus any text field and trigger once. If the IME starts listening or text lands in the field, the chain is working.

Start with an IME preset and a hotkey path, then enable voice wake, end/cancel phrases, or auto-send as needed.

## Requirements

- Windows 10 or 11 (x64)
- A voice-input method or streaming IME that exposes a keyboard shortcut
- Optional: microphone for wake, KWS, and end/cancel phrases

## Install and Updates

- Installer: [GitHub Releases](https://github.com/psterman/onetone/releases)
- The app checks for updates on startup; only application files are replaced.

User settings:

```
%APPDATA%\onetone\config\settings.json
```

On first launch, legacy configs migrate from `%APPDATA%\Voice Pilot\config\settings.json` or an exe-adjacent `settings.json` if present.

## Development

Stack:

- Frontend: plain HTML / CSS / JavaScript under `src/` (home workbench + settings)
- Backend: Rust + Tauri 2 (`src-tauri/`, including shared crates such as `onetone-logic`)
- Hotkeys and devices: Windows low-level hooks + Raw Input + RegisterHotKey
- Voice: SAPI / Vosk / KWS + acoustic-command runtime

Requirements:

- [Rust](https://rustup.rs/) with `cargo`
- [Tauri CLI](https://v2.tauri.app/): `cargo install tauri-cli`

```powershell
cd src-tauri
cargo tauri dev
```

Build release:

```powershell
npm run build

# or
.\run_onetone.ps1
.\run_onetone.ps1 -Rebuild

# NSIS installer
cd src-tauri
cargo clean -p onetone
cargo tauri build --bundles nsis
```

Output:

- `src-tauri/target/release/onetone.exe`
- `src-tauri/target/release/bundle/nsis/*-setup.exe`

If `TAURI_SIGNING_PRIVATE_KEY` is missing locally, the installer can still build; updater signatures need CI secrets. Before publishing updater releases:

```
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

The private key must match the updater public key in `src-tauri/tauri.conf.json`.

## Project Layout

```
onetone/
├── assets/              # Brand source assets
├── src/                 # Desktop frontend (home / settings / tray / HUD)
├── src-tauri/           # Rust backend and Tauri config
│   ├── crates/          # Shared logic crates
│   ├── src/             # Hotkeys, voice runtime, IPC
│   └── tauri.conf.json
├── website/             # Static website
├── docs/                # Privacy, terms, release notes
├── package.json
├── run_onetone.ps1
└── Start-OneTone.vbs
```

## Repository

**https://github.com/psterman/onetone**

Split out from an experimental voice-pilot prototype. The legacy AutoHotkey implementation lives in a separate archive and is not part of this repo.

## Legal

- [Privacy Policy](docs/PRIVACY.md)
- [Terms of Service](docs/TERMS.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

## License

MIT License — see [LICENSE](LICENSE) for details.

Copyright (c) 2026 psterman
