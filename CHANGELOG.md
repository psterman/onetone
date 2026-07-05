# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Onboarding v2**: 5-step first-run wizard (welcome → trigger choice → live key try → target review → optional voice phrase practice)
- Home **hero** mapping strip and **Replay first-run guide** in Settings → General
- **Phrase practice** overlay (karaoke highlight) when voice wake is enabled; optional in onboarding step 5
- **Coach HUD**: bottom-center screen overlay for key / listening / dictating / success states
- Coach HUD toggle in **Settings → General**; one-time migration prompt for existing users
- `window.OneToneApp` JS API for onboarding modules (`key-labels.js`, `onboarding.js`, `phrase-practice.js`)

### Fixed

- Coach HUD migration primary button contrast on light theme
- Physical trigger toggles dictation off when already dictating (second press ends session)
- Coach HUD simplified to key hints + success flash only (voice flow guidance on home help)

### Changed

- Physical trigger success in onboarding step 3 requires **successful target key send** (`mvp_onboarding_trigger_fired` with `ok: true`)
- New users get Coach HUD enabled on onboarding finish; default config `coachHudEnabled: false` for upgrades until opted in
- Home hero shows end-phrase hint (`结束输入`) while dictating

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
