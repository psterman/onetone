# Roo file hooks ? OneTone Soft Pad

Roo uses **one script file per event** (not a `settings.json` hooks tree). OneTone writes:

- `%USERPROFILE%\.roo\hooks\*.cmd`
- `%USERPROFILE%\Documents\Roo\Hooks\*.cmd` (if present)

Probe: [`scripts/roo-hook-probe.js`](../scripts/roo-hook-probe.js) ? POST `source: roo_hook`.

Marker: `--onetone-hook-id roo-activity-v1`.

## Enable

1. OneTone running, listening on `127.0.0.1:8796`.
2. Soft Pad top bar ? **status lights (client / CLI)** ? enable **Roo** ? **Connect** (or Hub Shell Hook CTA).
3. Start a Roo task and submit a prompt ? chip `running` ? `TaskComplete` ? `done`.

## Event mapping (probe normalize)

| Roo event | Soft Pad event | Soft Pad state |
|---|---|---|
| `UserPromptSubmit` / `PreToolUse` / `PostToolUse` | same | `running` |
| `Notification` (permission) | `PermissionRequest` | `needs_input` |
| `TaskComplete` | `Stop` | `done` |
| `TaskCancel` / `TaskError` | `StopFailure` | `error` |

## Soft Pad Shortcuts

Hub includes **Roo** Soft Pad: Shortcuts focus VS Code/Cursor host and send chords (`can_focus` / `can_send_chord`). Ceiling: no Sessions / Resume / multi-lights.

## Self-check

```powershell
node scripts/roo-hook-probe.test.js
node scripts/agent-shell-hook-probe.test.js
```

Logs: `logs/roo-hook-probe.jsonl`. Fail-open, exit 0; never write prompt/body.
