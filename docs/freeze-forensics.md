# Freeze / 假死 forensics runbook

Correlate these fields before deciding a larger refactor. Do not treat a single
symptom (e.g. Bluetooth mic) as root cause without the set below.

## Collect

| Signal | Where | Notes |
|--------|--------|--------|
| UI heartbeat lag + `activityTag` | `cmd_ui_heartbeat` / FE console `[onetone] UI-BLOCK` | 200ms ping from `app-boot.js`; local 1s lag log reuses the same tag |
| Render slow | FE log `render slow Nms reason=…` | From `OneToneRender.schedule` / `renderNow` |
| Acoustic match gen | `acoustic` log `match start gen=` / `match bus gen=` | Only the live generation may clear `match_running` |
| Dropped frames / buffered_ms | `acoustic` log `dropped_delta` / `buffered_ms≈` | Bounded bus (CAP=48); Full → drop-new |
| Mic owner | `voice` / `mic_monitor` log `mic_owner …` | `none \| wake_engine \| calibration(session) \| level_monitor(gen)` |
| Vosk DLL actual path | `native_dll` emergency line `vosk dll forensics` | Module-handle path after `Model::new`; compare `path_match_expected` |
| WorkingSet / CPU | Task Manager / Process Explorer | Spike after pause→resume often = queue chase (should be capped now) |
| Thread stacks | ProcExp / hang dump | See `docs/hang-governance-stability.md` |

## Interpretation shortcuts

- **Lag + tag=`render:…` / Soft Pad / camera** → paint path; check schedule dirty loop, not WASAPI first.
- **Lag + tag=`voiceOpen:…`** → settings 语音页打开路径（见下节）；tag 停在哪段 = 哪段 renderer.
- **Lag + `dropped_delta` rising while paused** → producer still publishing (expected); consumer must drain ≤ CAP (not unbounded chase).
- **Two match gens overlapping in logs** → ghost worker bug; live gen must invalidate old token.
- **`path_match_expected=false`** → wrong `libvosk.dll` loaded (PATH/System32); fix packaging / SetDllDirectory, do not only check resources folder exists.
- **`STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139) on `cargo test -p onetone --lib`** → known; use `cargo test -p onetone-logic` or focused `--test` binaries. Not a UI 假死.

## Voice page open (`voiceOpen:*` tags)

Open 设置 → 语音 (`voiceWake`). If UI freezes, read FE `[onetone] UI-BLOCK … tag=` or Rust `cmd_ui_heartbeat.activityTag`:

| Tag | Phase |
|-----|--------|
| `voiceOpen:enter` | Panel entered; before first deferred paint |
| `voiceOpen:chrome` | Status / engine / flow islands + subpage |
| `voiceOpen:heavy` | Acoustic islands before mode switch |
| `voiceOpen:modeSwitch` | `renderVoiceModeSwitch()` (heaviest suspect) |

`voiceOpenGen` invalidates in-flight RAF when leaving or re-entering the panel (same idea as Soft Pad `softPadOpenGen`). One reproduce pass usually locks the renderer.

## Tests that stay green without full native harness

```powershell
cargo test -p onetone-logic --manifest-path src-tauri/Cargo.toml
npm run typecheck
npm run test:islands
```
