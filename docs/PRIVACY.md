# Privacy Policy — OneTone

**Last updated:** 2026-07-01

OneTone ("一声") is a Windows desktop app that maps hardware keys to voice-input shortcuts. This policy describes what data the app handles and what leaves your computer.

## Summary

- **Voice and audio are processed locally.** OneTone does not upload microphone audio to our servers.
- **Configuration stays on your PC.** Settings are stored under `%APPDATA%\onetone\`.
- **No analytics or telemetry by default.** The app does not ship with usage tracking turned on.
- **Updates check GitHub Releases only.** The built-in updater downloads signed release artifacts from GitHub to install new versions.

## Data We Process Locally

| Data | Purpose | Stored where |
|------|---------|--------------|
| Key mappings & app settings | Run the app | `%APPDATA%\onetone\config\settings.json` |
| Theme, language, UI preferences | Personalization | Same config file / browser localStorage in the embedded WebView |
| Voice recognition (optional) | End-of-dictation phrases | Processed on-device via Windows SAPI and/or Vosk offline models |
| Diagnostic logs (optional export) | Troubleshooting | In-memory ring buffer; exported only when you choose to export |

## What Leaves Your Computer

1. **Software updates** — When you use "Check for updates", OneTone contacts GitHub Releases (`github.com/psterman/onetone`) to read `latest.json` and download installer files. No personal data is sent in this request beyond standard HTTPS metadata (IP address, user-agent) handled by GitHub.

2. **Nothing else by default** — The app does not send keystrokes, audio, or configuration to third-party analytics services.

## Third-Party Components

OneTone bundles open-source libraries (Tauri, Rust crates, Vosk, Windows SAPI). Their licenses are listed in the repository. Vosk models, if enabled, run entirely offline on your machine.

## Your Choices

- You can disable voice wake features and use key-only mapping.
- You can pause listening at any time from the app or system tray.
- You can export diagnostic logs manually (when available) to share for support — review the export before posting publicly.

## Data Removal

Uninstalling OneTone leaves your config at `%APPDATA%\onetone\`.

To completely remove all data:

1. Uninstall via **Windows Settings → Apps**
2. Delete `%APPDATA%\onetone\` manually
3. (Optional) Remove any leftover autostart entry if Windows still lists OneTone at login

## Children

OneTone is a general-purpose productivity tool and is not directed at children under 13.

## Changes

We may update this policy for new releases. The "Last updated" date at the top will change. Material changes will be noted in the release notes.

## Contact

Questions or privacy requests: open an issue at [github.com/psterman/onetone/issues](https://github.com/psterman/onetone/issues).
