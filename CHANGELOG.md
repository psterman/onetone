# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

[1.0.0]: https://github.com/psterman/voice-pilot/releases/tag/v1.0.0
