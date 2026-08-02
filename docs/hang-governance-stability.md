# OneTone hang-governance stability checklist

Do **not** claim根治 until every item below passes with evidence.

## Capture chain (required before Camera dump-calibrated claims)

```powershell
cd scripts\hang-dumps
.\hang-dumps.ps1 setup
.\hang-dumps.ps1 verify-hang   # MUST produce a .dmp
.\hang-dumps.ps1 start         # watch onetone.exe
```

## Automated (repo)

```powershell
npm run typecheck
npm run test:islands
npm run test:voice-acoustic:all
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
```

## Observation window (AppHang 1002)

Record `$testStart = Get-Date` then:

| Scenario | Minimum |
|---|---|
| Continuous run | 8h |
| Presence | 30m |
| Camera toggle | 100× |
| focus/blur (+ tray) | 200× |
| Hook flood | 10m |
| Soft Pad × TM autosave | in 8h or dedicated |
| stderr pipe closed | dedicated |
| Large dirty TM | functional busy only unless dump proves AppHang |

Query:

```powershell
Get-WinEvent -FilterHashtable @{LogName='Application'; Id=1002; StartTime=$testStart} |
  Where-Object { $_.Message -match 'onetone\.exe' }
```

口径: Application Id=1002 + onetone.exe (not Reliability 157 unless stated).

## Acceptance probes

- UI `cmd_ui_heartbeat` Atomic only; Rust watchdog logs >500ms / 2s / 5s
- Face landmarker: no UI-thread `detectForVideo`; Worker timeout → terminate+rebuild; queue depth ≤1
- Overlay: single scheduler; pending ≤1; trailing flush; window generation
- No stderr `eprintln!` production panics
- Log writer dual-channel; high priority not dropped under normal flood
- Voice: single supervisor worker; latest-desired capacity 1
- TM autosave try-lock busy/mutating; does not block desk list (functional)
- Identical mvp_init fingerprint → no second remount

## Residual risks

- Hand `recognizeForVideo` still on UI thread (budget/skip only) — needs Worker follow-up
- MediaPipe Worker init failure → Presence continuous requires experimental flag
- WebView2/GPU driver hangs need dump differentiation
