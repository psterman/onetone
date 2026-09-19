# OneTone

Website: **https://www.onetone.app**

The natural-interaction layer between desktop apps · *bridge every trigger to every app*

[English](README.en.md) | [中文](README.md)

[![Release](https://img.shields.io/github/v/release/psterman/onetone)](https://github.com/psterman/onetone/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/psterman/onetone/release.yml)](https://github.com/psterman/onetone/actions)
[![Stars](https://img.shields.io/github/stars/psterman/onetone)](https://github.com/psterman/onetone/stargazers)

> v1.0.0 is unsigned. Windows SmartScreen may block the installer on first launch. Click **More info** -> **Run anyway**.

## What it is

OneTone is a **natural-interaction layer between desktop apps** on Windows. It does not replace your IME, your dictation engine, or any AI agent.

It unifies every trigger source on your desktop — **voice, keys, camera, peripherals, virtual panels, agent status lights** — into a single dispatch layer that drives **whatever desktop app you are working in**.

**No AutoHotkey. No external host app required.**

## What it solves

Desktop workflows are fragmented:

- Each AI coding agent has its own shortcuts and its own composer entry
- One habit = one keymap; switching apps means re-learning shortcuts and re-aiming at the input box
- When an agent is running in the background, there is no way to glance at your desk and see *where it is stuck*
- Microphone, camera, mouse side buttons, gamepads, and touch surfaces do not talk to each other

OneTone collapses this into one path:

```text
voice / keys / softPad / camera  ->  OneTone  ->  any desktop app
                                          |
                                          └─  PadStatus lights  ->  agent hook feedback
```

## Core architecture

| Dimension | What it covers |
|---|---|
| **Four input channels** | voice / keys / softPad / camera trigger the same capability cards (`slotId`) and feed one dispatcher |
| **App adapters** | 17+ `AppChatProfile`s: Cursor, Codex, Claude, Trae, Windsurf, Qoder, Roo, Aider, Cline, Copilot, … |
| **Status lights** | `PadStatus` × agent hooks: Codex single light, Claude self-built multi-light aggregation |
| **Custom workflows** | habit / scene / `agentBindings` / `semantic_action` / `app-behavior-rules` |
| **Local-first** | KWS, camera, and visual triggers all run on-device; nothing is uploaded to OneTone servers |

## Four channels

The four channels are not four parallel features. They are **four trigger paths for the same set of capability cards**. Hooks decide the current state; each state highlights which cards can be said or pressed.

### voice

- **Closed-set commands**: local KWS (Vosk) exact match; grammar is filtered by hook state
- **Long-form dictation**: routes to a third-party IME via push-to-talk, separated from the command layer so they never share a decoder
- **Acoustic commands**: cancel / end phrases, finish / discard the current turn
- **Local engines**: Windows SAPI, offline Vosk, KWS

### keys

- Keyboard, mouse side buttons, volume keys, chords, gamepads, trackballs, Bluetooth rings and other Windows-recognized inputs
- Windows low-level hooks + Raw Input + RegisterHotKey
- Shares the same `slotId` as voice / softPad so the same action can be triggered three ways

### softPad

- A virtual capability-card panel on screen: **visible, pressable, tappable**
- Same slot as voice and physical keys — pressing a pad key is identical to saying a command or hitting a hotkey
- The mini bar is a strip projection of the pad; chips share `slotId` with pad keys

### camera

- MediaPipe face landmarker running locally
- Trigger types: leave / return, head shake, long blink, OK gesture, open palm, fist, double blink, gaze dwell in 3-zone / 9-grid regions
- Typical actions: leave → pause voice + privacy screen; head shake → cancel; long blink → activate; OK → confirm
- The camera is **not** treated as a precise mouse; region dwell is off by default

## App adapters (AppChatProfile)

`src-tauri/src/app_chat_workflow.rs` maintains a profile per app: process names, path markers, activation keys, composer anchors, and UIA compatibility flags.

```text
Cursor · Codex · Claude · MiniMax · Workbuddy
Trae (Work / Code / Chat) · Windsurf · Qoder
Gemini CLI · Cline · Roo · OpenCode
Copilot (CLI / VSCode) · Aider · ……
```

Each app also gets hooks (Cursor / Codex / Claude / Copilot / Aider, …) and `semantic_action` mappings.

Adding a new app = adding a new `AppChatProfile`. The dispatcher stays untouched.

## Status lights (PadStatus)

OneTone renders status lights on the Soft Pad and ties them to your agents:

- **Codex hook** → primary `PadStatus` single light (`slotId=status`; falls back to AG00 when missing)
- **Claude hook** → **Claude Agent Activity Pad**: `claude_lights` self-built multi-light (agent activity + OneTone aggregation)
- Loopback listener on `127.0.0.1:8796`: `POST /api/codex-app/state`, etc.

When an agent is running, waiting, needs input, or has a diff — you do not need to switch back to the agent window. Just look at the pad.

## Custom workflows

Every capability card has four bindings:

| Binding | Content |
|---|---|
| Visual | Pad keycap label + chip on the mini bar |
| Key | A single tap on the Soft Pad |
| Voice | A closed-set command (e.g. "plan", "send") |
| App | Shortcut / focus / hook response in the target app |

Storage: an `agentBindings` entry with one `slotId` can carry `triggerType: softPad | voice | key` simultaneously.

Per-app / per-context setups are saved as **habits** and **scenes** and switched horizontally.

**Input aim:** `input_focus_aim` is a shared layer — every channel runs through it before injecting text. It probes the target app, activates it, focuses the right field, and writes safely. If aim fails, injection is refused (fail-closed).

## Quick start

1. Download the latest Windows installer from [GitHub Releases](https://github.com/psterman/onetone/releases)
2. If SmartScreen appears, choose **More info** -> **Run anyway**
3. Launch OneTone and complete onboarding (or use **Quick start** on the home page)
4. Pick an app (Cursor / Codex / Claude are good first targets) and record its activation key
5. Tap a card on the pad, say a command, or press a side button — the trigger fires
6. Turn on the camera channel, status lights, and custom workflows as you need them

## Requirements

- Windows 10 or 11 (x64)
- Optional: microphone (voice wake, KWS, acoustic commands)
- Optional: camera (MediaPipe, on-device)
- Optional: mouse / gamepad / Bluetooth ring and similar peripherals

## Install and updates

- Installer: [GitHub Releases](https://github.com/psterman/onetone/releases)
- The app checks for updates on startup; only application files are replaced

User settings:

```
%APPDATA%\onetone\config\settings.json
```

On first launch, legacy configs migrate from `%APPDATA%\Voice Pilot\config\settings.json` or an exe-adjacent `settings.json` if present.

## Development

Stack:

- Frontend: plain HTML / CSS / JavaScript under `src/` (home workbench + settings)
- Backend: Rust + Tauri 2 (`src-tauri/`, including shared crates such as `onetone-logic`)
- Trigger layer: Windows low-level hooks + Raw Input + RegisterHotKey
- Voice: SAPI / Vosk / KWS + acoustic-command runtime
- Vision: MediaPipe face landmarker (on-device)

Requirements:

- [Rust](https://rustup.rs/) with `cargo`
- [Tauri CLI](https://v2.tauri.app/): `cargo install tauri-cli`

```powershell
cd src-tauri
cargo tauri dev
```

Build a release:

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

## Project layout

```
onetone/
├── assets/              # Brand source assets
├── src/                 # Desktop frontend (home / settings / tray / HUD)
├── src-tauri/           # Rust backend and Tauri config
│   ├── crates/          # Shared logic crates
│   ├── src/             # Hotkeys, voice runtime, IPC, AppChatProfile, PadStatus
│   └── tauri.conf.json
├── website/             # Static website
├── docs/                # Privacy, terms, release notes, capability-card contracts
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