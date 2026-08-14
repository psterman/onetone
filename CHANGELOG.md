# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Soft Pad multi-provider quota**: Soft-Pad-saved keys for OpenRouter / DeepSeek / Kimi / SiliconFlow (`soft_pad_quota`); TTL 60s cache + 429 cooldown + parallel refresh; async verify on key set; mini pill multi-provider dropdown + freshness dot
- **Copilot CLI Soft Pad hooks**: `copilot_cli_hook` via shared shell probe/installer; chip + lights toggle; setup doc
- **Gemini CLI Soft Pad hooks** (Phase 3): `AgentKind::Gemini` / `gemini_hook`; BeforeTool/AfterTool/AfterAgent normalized; CLI-only (IDE mid-session must be measured — see setup doc)
- **Mini bar**: VISIBLE_PAD=6 with `+N` fold; catalog includes Copilot/Gemini (grey placeholders until lights on)
- **Usage scenes (config v6)**: `activeSceneId` as runtime truth; sparse per-scene `voiceOverride` for voice shortcut, wake phrases, and end phrases
- **Settings → Usage scenes**: four tabs (Keys / Voice / Target / Advanced), effective preview, **Set as current scene** vs browse-only selection
- **Settings → Global voice**: global engine/mic/phrases unchanged; scene bottom bar links here for device troubleshooting
- **Coach HUD**: bottom-center overlay for trigger → target hints and brief success flash; toggle in **Settings → Basic → Scene coach overlay**
- **Rule C sync confirm**: when changing global voice shortcut while the active scene has a `targetKey` override, a three-choice dialog (global only / global + clear override / cancel)
- **Config backup note** in Settings → General (`settings.json` path hint)
- **Onboarding**: first scene gets `voiceOverride: null` and `activeSceneId`; Coach HUD enabled on wizard completion

### Changed

- Coach HUD, tray mode, and trigger-mode edits follow **active scene** keys (not first enabled mapping)
- Coach HUD target display: scene `voiceOverride.targetKey` when set, otherwise mapping physical `targetKey`
- Browsing a scene in the list no longer changes runtime voice until explicitly activated
- Dictation stop/commit uses **session snapshot** frozen at start (switching scenes mid-dictation does not change end rules)
- Physical trigger success in onboarding step 3 requires **successful target key send** (`mvp_onboarding_trigger_fired` with `ok: true`)
- New users get Coach HUD enabled on onboarding finish; upgrades default `coachHudEnabled: false` until opted in
- Home hero shows end-phrase hint (`结束输入`) while dictating

### Fixed

- Physical trigger toggles dictation off when already dictating (second press ends session)

### Soft Pad limitations (this pass)

- Provider API keys stay plaintext under `{data_root}/<provider>-api-key.txt` until post-P2 keyring migration
- Gemini Soft Pad lights are **CLI-only**; IDE mid-session must be measured (see `docs/gemini-hook-onetone-setup.md`)
- P1/P2 (Aider, OpenCode, Tongyi capture, admin-key Anthropic/OpenAI, ambient aggregate, session persist) not in this pass

## [1.0.0] - 2026-07-01

### Added

- Hardware key → voice-input shortcut mapping (side buttons, volume keys, macro keyboards)
- Dual voice engines: Windows SAPI (lightweight) + Vosk offline recognition (privacy)
- End-of-dictation phrases and auto-send
- Multi-scheme (profile) switching with optional cycle shortcut
- Bilingual UI (Chinese / English), light and dark themes
- System tray, autostart, and in-app auto-update via GitHub Releases
- Welcome onboarding on first launch
- Diagnostic log export (zip with redacted settings)

### Known Limitations

- Windows 10/11 x64 only
- No code signing — SmartScreen requires **More info → Run anyway** on first launch
- No macOS or Linux builds

[1.0.0]: https://github.com/psterman/onetone/releases/tag/v1.0.0
