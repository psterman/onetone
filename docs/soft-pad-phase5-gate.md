# Soft Pad Phase 5 gate — Gemini IDE / Continue / 通义 Agent

Per Soft Pad roadmap Phase 5: **do not ship fake support**.

Each client requires local proof before wiring:

1. Install candidate hook / plugin.
2. Run a mid-session agent turn.
3. Confirm `logs/*-hook-probe.jsonl` (or equivalent) contains a POST to OneTone.

| Client | Status (2026-08-26) | Action |
|--------|---------------------|--------|
| Gemini / Antigravity IDE | No mid-session POST verified in this pass | Keep **Gemini CLI only** ([gemini-hook-onetone-setup.md](gemini-hook-onetone-setup.md)) |
| Continue.dev | Hook path not verified | **Skipped** |
| 通义灵码 Agent mode | Agent-turn hook not verified; completion plugin stays excluded | **Skipped** |

Re-open this phase only after a measured POST log exists for that client.
