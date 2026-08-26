# VS Code Copilot Agent → OneTone Soft Pad

**Not** Copilot CLI (`copilot-cli` / `copilot_cli_hook`).  
**Not** Copilot Cloud Agent (HABIT: does not compete for desktop Soft Pad).

Wire: `AgentKind::CopilotVscode` / `copilotVscode` / `copilot-vscode`.

## Soft Pad Shortcuts

Hub includes **Copilot VS Code** Soft Pad (WorkBuddy-tier Shortcuts): focus `Code.exe` and send chords.

## Status lights

- Flag: `copilotVscodeStatusLightsEnabled` / `copilot_vscode_status_lights_enabled`
- **Default off (opt-in)**
- Honest ceiling today: no stable mid-session hook installer ships with this release. Enable the light only after you have a local probe posting `source: copilot_vscode_hook` to `127.0.0.1:8796/api/codex-app/state`, or leave lights off and use Shortcuts only.

## Self-check

Hub can prepare a Soft Pad mapping for `copilot-vscode`. Soft Pad keys dispatch while VS Code is foreground.
