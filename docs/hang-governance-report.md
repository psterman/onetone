# Hang governance implementation report (2026-08-02)

## Status

**Not claimed as 根治.** Automated checks below; long observation windows and ProcDump verify-hang must still be run on the machine.

## Root-cause tree (confidence)

| Path | Confidence | Fix landed |
|---|---|---|
| Face `detectForVideo` on UI thread | Highest suspect / high (no hang dump stack yet) | Worker + terminate/rebuild; no UI-thread detect |
| Hook/overlay main-thread flood | High | Single overlay scheduler + trailing flush + window gen |
| stderr `eprintln` pipe panic | Confirmed amplifier | Cleared production eprintln → sync_emergency_line |
| `log_line` lock + multi-dir disk | Confirmed | Unlock then dual-channel writer |
| Sync voice activate / thread-per-switch | High | Single voice_supervisor latest-desired |
| mvp_init remount | High (dirty + hardened) | Fingerprint no-op + focus runtime-only |
| TM_LOCK + Git | Functional stall confirmed; AppHang TBD | try_lock busy + early mutating skip |
| Hand `recognizeForVideo` | High (openPalm on + cameraDetect hang 2026-08-02 ~15:18) | Worker + terminate/rebuild; no UI-thread recognize |

## Event log 口径 (fixed)

- Reliability Application Hang: **157** (2026-07-03..2026-08-02)
- Application Id=1002 + onetone.exe: **187** (user query)
- Do not use the obsolete “207” figure

## Files touched (major)

- `src-tauri/src/ui_heartbeat.rs`, `app_log.rs`, `voice_supervisor.rs`, `codex_micro_overlay.rs`, `codex_micro_protocol_server.rs`, `voice_bootstrap.rs`, `time_machine/git_ops.rs`, IPC prefs/voice/mic
- `src/js/core/app-boot.js`, `config-persist.js`
- `src/js/features/camera/camera-gaze-landmarker.js` + `-worker.js`, `camera-hand-gesture.js`, `camera-presence-actions.js`
- `scripts/hang-dumps/hang-dumps.ps1`, `docs/hang-dump-analysis.md`, `docs/hang-governance-stability.md`
- Dirty hang-fix group retained (boot/config-persist/TM/overlay/protocol/settings-drawer)

## Dirty baseline

Exported under `%LOCALAPPDATA%\OneTone\hang-governance-baseline\` (hang-fix.patch / copy-ia.patch / hashes).

## Tests (this session)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run test:islands` | PASS (after removing parallel bindNav FALLBACK; shell-ia only) |
| `npm run test:voice-acoustic:all` | PASS (8/8) |
| `cargo test --manifest-path src-tauri/Cargo.toml` | PASS |
| `npm run build` | App + NSIS built; exit 1 only from missing `TAURI_SIGNING_PRIVATE_KEY` (pre-existing signing env) |
| `hang-dumps.ps1 setup` | LocalDumps configured; **ProcDump binary missing** — verify-hang blocked until Sysinternals install |

## Live hang 2026-08-02 ~13:14 (Responding=False)

- PID 26480, started 12:34:12, `target-release-live\release\onetone.exe`
- Dump: `%LOCALAPPDATA%\OneTone\HangDumps\onetone-hang-20260802-131453.dmp` (~1.3GB MiniDump)
- Log: `%APPDATA%\oneTone\app\config\logs\runtime-live.log`
- Evidence: `ui_hb` emergency after `applyMvpInit ok`, tag=`applyMvpInit`, **no recover** → permanent main-thread wedge in post-ok heavy path (islands refresh / camera reconcile), not boot itself
- Hotfix: defer islands+heavy off applyMvpInit turn; camera reconcile only via `deferCameraHeavyWork`



1. Install ProcDump → `.\scripts\hang-dumps\hang-dumps.ps1 verify-hang` produces a real `.dmp`
2. Observation windows (8h / Presence 30m / Hook 10m / …) with zero new 1002 from `$testStart`
3. Real hang dump stack to confirm Camera as AppHang root if recurrence
4. Observation: camera panel + openPalm (1080p) + Soft Pad key — previously wedged with tag=`cameraDetect` and no recover
