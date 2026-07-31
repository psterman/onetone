# Soft Pad sync_hook_cache → Arbiter migration

All former writers must only call `codex_numpad_layer::sync_hook_cache`, which bumps
`config_revision` and runs `soft_pad_runtime::request_soft_pad_recompute`.

When cutover is on (default), HookGate agent routes are installed solely from Applied.

| Call site | Notes |
|-----------|--------|
| `config::apply_config` | Primary config apply |
| `ipc/commands/mapping/save.rs` | Save path |
| `codex_micro_overlay.rs` | Heal / ensure paths |
| `ipc/runtime_dispatch.rs` | Heal-and-retry |
| `pad_status_diagnose_cmd.rs` | Diagnose — must not bypass Arbiter |
| `codex_micro_pad_flags_cmd.rs` | Flag toggles |
| `codex_status_lights_cmd.rs` | Lights |
| `codex_pad_binding_diagnose_cmd.rs` | Binding diagnose |
| `codex_micro_pad_status_cmd.rs` | Status |
| `codex_numpad_layer` tests | Unit tests |

Do **not** reintroduce direct `HookGate` route merges outside `install_hook_gate` / legacy 1A path.
