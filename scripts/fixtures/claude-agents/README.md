# Claude `agents --json --all` fixtures

Captured against **Claude Code 2.1.288**.

| File | Source | Notes |
|------|--------|-------|
| `empty-v2.1.288.json` | Real local output of `claude agents --json --all` when no background agents were running | Exact `[]` |
| `active-v2.1.288.json` | **Not published yet** | Required before production can parse non-empty schema and enable Claude Native interrupt |

## Desensitization rules (when active fixture is added)

- Strip prompts, usernames, absolute home paths, and other PII.
- Keep verified field names, types, and active/running semantics.
- Do not invent field names (`id`, `sessionId`, `status`, `active`, …) without a real capture.

Until the active fixture exists, the production parser treats any non-empty array as `ParseError` (fail closed).
