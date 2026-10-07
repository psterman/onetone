# Session JSONL Parser Adapter — Production Design

**Status:** adapter mapping + transcript persistence core accepted (Slices 1.2/2A); **production ingestion wiring remains deferred** (no watcher/IPC/FTS/UI)  
**Related:** [`agent-sessions-adoption-assessment.md`](agent-sessions-adoption-assessment.md)  
**Upstream pin:** `agent-sessions = "=0.2.2"`  
**Module:** `src-tauri/src/agent_memory/session_parse/`

PoC answered whether the crate is usable. This document fixes **how OneTone attaches safely**. Do not promote PoC binaries or fixture paths into the production contract without the boundaries below.

---

## 0. Architecture

```text
Provider JSONL
  → agent_memory::session_parse  (only importer of agent_sessions::*)
    → OneTone DTOs (SessionParseOutput)
      → future SessionStore / timeline / search
```

```text
codex_session_scan  →  pad_status arbiter  →  Soft Pad lights
```

These two pipelines stay **permanently isolated**. Pad lights must not call the transcript adapter; the adapter must not replace pad scan.

---

## 1. Module dependency boundary

| Rule | Detail |
| --- | --- |
| Cargo pin | Exact pin in [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml): `agent-sessions = "=0.2.2"`. Cargo dependencies are **crate-level**; there is no true “module-only” Cargo dependency. |
| Import scope | Only `agent_memory::session_parse` (and its private submodules) may `use agent_sessions` or `agent_sessions::`. |
| Enforcement | Source-contract test: scan `src-tauri/src/**/*.rs` excluding `agent_memory/session_parse/`; fail on `use agent_sessions` or `agent_sessions::`. |
| Consumers | IPC, SQLite, Agent Center, pad_status consume **OneTone DTOs only**. Never re-export crate types across the IPC boundary. |
| Workspace | No thin private crate in Slice 1. Revisit only if multi-consumer version/feature isolation is required. |

---

## 2. DTO and error model

### API

```rust
pub(crate) fn parse_session_file(
    source: &SessionSource,
    options: &SessionParseOptions,
) -> Result<SessionParseOutput, SessionAdapterError>;
```

`Vec` in `SessionParseOutput.events` is a **bounded slice API** (`max_events`, file/line budgets, text budgets, optional `event_kinds`). It is **not** the final SessionStore full-load API. A ~200 MiB session must not be required to fully materialize in memory.

### Transcript DTO (Slice 1.1)

Production projection **retains body text** (not length-only):

- `SessionEvent::{Meta, Message, ToolCall, ToolResult, Usage, Unsupported}`
- `MessageEvent { role, text, text_segments, truncation? }`
- `ToolCallEvent { name, arguments: Json|Raw|Missing, truncation? }`
- `ToolResultEvent { text, is_error, truncation? }`
- Truncation is explicit via `ContentTruncation` — never silent clip without recording.

Privacy boundary (local-only until later IPC):

```text
local file → private Rust adapter (content) → SessionStore (future)
  → IPC projects by use-case → UI on demand
```

Adapter sources must not `println!` / `eprintln!` / `log::` event bodies or tool args. IPC defaults, search snippets, and export UX are Slice 2+.

### Output

| Field | Role |
| --- | --- |
| `events` | Projected, bounded `LocatedEvent` list (with text) |
| `diagnostics` | Line/stream diagnostics (ParserDerived) |
| `mapping_diagnostics` | Adapter mapping / content-limit diagnostics |
| `completeness` | Parser status + counts + product commit gate |
| `source_snapshot` | Provenance + prefix evidence fields |
| `ignored_type_histogram` | Per type-key counts |
| `unknown_type_histogram` | Per type-key counts |

### Options

| Field | Role |
| --- | --- |
| `max_file_bytes` | Hard **captured file** budget (default 200 MiB). Immutable snapshot always allocates `[0, captured_len)`, so `captured_len > max_file_bytes` → `TooLarge` even when `stop_at_byte` / PrefixVerification is smaller |
| `max_line_bytes` | Hard line budget (default 8 MiB) |
| `stop_at_byte` | Typed prefix bound from byte 0 (not a mid-file typed seek) |
| `event_kinds` | Projection filter |
| `max_events` | Cap materialised events; stop projection when hit |
| `max_total_text_bytes` | Aggregate retained UTF-8 text budget (default 8 MiB) |
| `max_event_text_bytes` | Per-event text/args budget (default 1 MiB) |
| `include_tool_arguments` / `include_tool_results` | When false, omit payloads (Missing / empty) without length-only era |

### Errors (`SessionAdapterError`)

| Variant | When |
| --- | --- |
| `Io` | Open/read failure |
| `TooLarge` | `captured_len > max_file_bytes` before snapshot alloc, or `usize` conversion of read length fails, or upstream reader TooLarge |
| `InvalidOptions` | Conflicting options (e.g. `stop_at_byte > max_file_bytes`) |
| `FatalStream` | Upstream fatal stream error that aborts the reader |
| `Path` | Source path missing / not a file |

Recoverable line errors stay in `diagnostics` + `completeness.line_error_count`, not as top-level `Err`, unless the whole reader fails.

### Fact layers (retained)

- **ProviderFact** — native counters, observed model presence, record bytes as on disk  
- **ParserDerived** — `Located*`, finish status, unknown/ignored histograms, line errors  
- **ProductInference** — `whole_snapshot_commit_allowed`, UX aggregation, cross-file dedup, cost

---

## 3. Source identity and provenance

### `SessionProvider`

`Codex` | `ClaudeCode` (maps to upstream `Agent`; never leak the crate enum over IPC).

### `EventIdentity`

```text
source_id + record_index + event_index + byte_start + byte_end
```

Used for idempotent writes, dedup, rewrite detection, and pointing back to raw evidence. **Do not** use absolute filesystem paths as DB or IPC primary keys.

### `SourceId` (`ss1_…`)

Versioned opaque id. Hash domain:

```text
onetone-session-source-id ‖ version:1 ‖ provider_tag ‖ platform_encoding_tag ‖ canonical_path_native_bytes
```

- Windows: `windows-utf16le` + `OsStr::encode_wide` LE units  
- Unix: `unix-bytes` + `OsStr::as_bytes`  
- Prefer `fs::canonicalize` when possible; **no** `to_string_lossy()`, **no** Unicode `to_lowercase()` in Slice 1.1  
- Display: `ss1_` + 16-byte hex; never absolute path / username / drive letter  

IPC and SQLite store only this id (plus optional display labels resolved separately).

### `SourceSnapshot`

| Field | Meaning |
| --- | --- |
| `provider` | Session provider |
| `canonical_source_id` | `SourceId` (above) |
| `captured_len` | Length from the **opened file handle** metadata |
| `last_complete_byte` | Contiguous error-free delivered prefix end |
| `prefix_digest` | `Option<[u8; 32]>` — SHA-256 of snapshot `[0, last_complete_byte)` (empty prefix = SHA-256(`[]`)); digest and events share one immutable byte vector |
| `source_modified_at_ms` | mtime from the same open handle (fast invalidation / reindex hint only — **never** event `observed_at`) |

Open order: `File::open` → `file.metadata()` / `meta.is_file()` → **`captured_len > max_file_bytes` → `TooLarge`** → `read_exact_prefix(0, captured_len)` into `Vec<u8>` (`usize::try_from` fail → `TooLarge`) → `Cursor` parse + SHA-256 from that same vec. Early EOF / short read → `SourceChangedDuringRead` (no digest/commit). `canonicalize` for SourceId is **fail-closed**. PrefixVerification / `stop_at_byte` only limit event projection — they never shrink the snapshot allocation.

---

## 4. Commit-policy state machine

```text
intent == FullSnapshot
AND ParseCoverage fully complete (all six flags)
AND parser_status == Complete
AND line_error_count == 0
AND unknown_type_histogram empty (sum == 0)
AND every ignored type key ∈ IgnoredTypePolicy.allowed for (provider, parser_version)
AND adapter_mapping_error_count == 0
  → whole_snapshot_commit_allowed = true
else
  → false
```

`ParseCoverage` (Slice 1.1b):

| Flag | True when |
| --- | --- |
| `all_event_kinds` | `event_kinds == ALL` |
| `tool_arguments_included` | `include_tool_arguments` |
| `tool_results_included` | `include_tool_results` |
| `reached_captured_end` | `stop_at_byte` absent or `>= captured_len` |
| `event_limit_absent` | `max_events` absent and not stopped by max |
| `content_complete` | no `ContentLimit` truncations |

`ParseIntent` is explicit on options (`FullSnapshot` default). Preview / UsageOnly / PrefixVerification never commit even if coverage looks full.

Partial projections must not look like full snapshots: omitting tool args/results uses `ToolArguments::Omitted` / `ToolResultContent::Omitted` (distinct from provider `Missing`).

`adapter_mapping_error_count` includes: unsupported `Event` / `TokenSemantics` / `Role` / `ToolArgs`, and any `ContentLimit` truncation. Diagnostics use fixed tags (e.g. `unsupported_tool_args_variant`) — never `{other:?}` Debug dumps of tool payloads.

| Parser status | Commit |
| --- | --- |
| `Complete` | Only if intent + coverage + gates above pass |
| `CompleteWithErrors` | Never |
| `IncompleteTail` | Never |
| `StoppedEarly` | Never (partial projection / max_events / stop) |
| `Failed` | Never |

**Adapter computes the gate.** Slice 2A persists only when `whole_snapshot_commit_allowed` via `transcript_store` (generation swap). PoC compatibility is not a production integrity certificate.

### Event time (`EventTime`)

| Field | Rule |
| --- | --- |
| `observed_at_ms` | From `Located.at` only (provider record timestamp). Missing → `None` + `Missing` provenance |
| `provenance` | `ProviderRecord` / `SessionMetadata` / `Missing` |
| Forbidden | File mtime, ingest wall clock, or any store-derived time as event `observed_at` |

Session-level “last observed” is **query-time** `MAX(observed_at_ms)` over active generations — not a column on `transcript_sessions`.

### Session owner identity

| Item | Rule |
| --- | --- |
| `session_key` | Opaque `sk1_` + 16-byte hex; derived from provider session id or source-fallback |
| `provider_session_id` | Adapter/store internal only — **never** IPC / UI |
| Codex owner | First authoritative `Meta.session_id` |
| Claude owner | First authoritative `Meta.session_id` **or** non-sidechain `Message` with `Located.session_id` |
| Conflict | Second distinct authoritative id → `owner_conflict` + mapping diagnostic → commit denied |
| Upgrade | SourceFallback → ProviderId may rebind `transcript_sources.session_key` on fingerprint match |

Recommended UX when mapping fails closed: keep the original file; do not write an incomplete snapshot; prompt to upgrade OneTone.

---

## 5. Ignored allowlist mechanism

```rust
struct IgnoredTypePolicy {
    provider: SessionProvider,
    parser_version: &'static str,  // agent-sessions VERSION
    allowed: &'static [&'static str],
}
```

Rules:

- Versioned in source; reviewed with tests — **not** a normal user setting.  
- Per-provider tables.  
- Histograms always recorded for every ignored/unknown key.  
- Keys outside `allowed` → fail closed for commit.  
- Bumping `agent-sessions` requires fixture re-run, real-sample audit, and allowlist re-review.  
- Future diagnostic toggles must not mark a snapshot “trusted” if the formal gate would fail.

Slice 1 may ship empty or minimal fixture-audited allowlists; real-session keys are added only after explicit audit.

---

## 6. Resource limits

| Limit | Default | Behaviour |
| --- | --- | --- |
| `max_file_bytes` | 200 MiB | Reject `TooLarge` on `captured_len` before snapshot alloc (not on `stop_at_byte` alone) |
| `max_line_bytes` | 8 MiB | Line diagnostic `TooLong`; blocks commit |
| `stop_at_byte` | optional | Typed read still starts at record 0 |
| `max_events` | optional | Stop projecting; status may be `StoppedEarly` |
| `event_kinds` | all | Narrow projection for stats/timeline previews |
| `allow_incomplete_tail` | false (Strict) | When true, unterminated final JSON → `IncompleteTail` |
| `max_total_text_bytes` | 8 MiB | Aggregate retained text; truncate + ContentLimit |
| `max_event_text_bytes` | 1 MiB | Per-field retain; truncate + ContentLimit |

Oversized real lines above 8 MiB must surface as diagnostics/metrics (not silent drop) before UX claims completeness.

---

## 7. Windows concurrency and immutable-prefix strategy

### Facts

- Shared-read while another process **appends** is usually OK; append may yield `IncompleteTail` until re-read.  
- Length + mtime are **fast invalidation only** — not proof the prefix is unchanged.  
- Typed incremental reads always start at byte 0 with `stop_at_byte`; raw `start_offset` is framing-only.  
- Never treat `last_complete_byte` alone as a typed resume cursor.

### Slice 1.2 / 2A (locked)

Same open handle for parse + digest. FullSnapshot binds `stop_at_byte = captured_len`.

**Immutable captured-range snapshot (same-source proof — not dual-hash, not tee):**

1. Gate: `captured_len > max_file_bytes` → `TooLarge` (PrefixVerification / small `stop_at_byte` cannot bypass; snapshot always covers the full captured file)
2. `read_exact_prefix(0, captured_len)` → owned `Vec<u8>` via `usize::try_from` (overflow → `TooLarge`; short read / early EOF → `SourceChangedDuringRead`, retryable)
3. Optional test hook between snapshot and parse (simulates concurrent rewrite of the live file)
4. Parse via `Cursor<&[u8]>` over that vec; `stop_at_byte` only bounds event projection, not allocation
5. `prefix_digest = SHA-256(snapshot[0..last_complete_byte])` from the **same** bytes
6. Post-snapshot meta freshness gate:
   - `len_after < captured_len` → `SourceChangedDuringRead`
   - `len_after == captured_len` and mtime changed → `SourceChangedDuringRead`
   - `len_after > captured_len` → accept frozen `[0, captured_len)`; ingest the appended suffix on the next pass
   These checks remain a **fast reject only**, never content-equality proof.

Equal-length in-place rewrite after the snapshot cannot change events or digest: both bind to the frozen vec. A changed mtime still rejects that case as a freshness policy; a test that restores the original mtime demonstrates the immutable same-source guarantee. Active append after the snapshot is accepted without changing the captured events or digest. Shrink during `read_exact_prefix` still fails closed on short read; incremental ingest is Slice 2B+.

`ingest_fingerprint` = length-prefixed(provider, digest, captured_len, last_complete_byte, agent-sessions VERSION, adapter projection, store schema, profile).  
Store: `transcript_sessions` / `transcript_sources` / `transcript_generations` / `transcript_events`; generation keyed by `source_id`; first insert uses `active_generation = NULL` + deferred FK then swap; fingerprint match → `NoChange`.

### `transcript_generations.session_key` (deferred semantic lock)

Before any formal query API:

- Clarify whether the column is **historical ingest identity** (snapshot at generation create) or **current session identity**.
- If current: identity upgrade (`SourceFallback` → `ProviderId`) must update generation rows in the same txn.
- If unused for queries: remove via later migration.

**Temporary constraint:** formal queries must **not** depend on `transcript_generations.session_key`; current identity is via `transcript_sources.session_key` → `transcript_sessions`.

### Later test matrix

Windows file identity, rename, replace, concurrent append/rewrite — tracked after Slice 1.

---

## 8. Usage / dedup responsibility boundary

| Concern | Owner |
| --- | --- |
| Per-event token counters + provider semantics (`ClaudeExclusive` / `CodexInclusive` / `Unsupported`) | Adapter maps ProviderFact; unknown semantics fail closed; never cross-sum providers |
| Absent vs zero | Preserve `Option`; no zero-coercion |
| Illegal usage (negative / fractional / overflow) | Parser diagnostics; commit denied |
| Cross-file / resume usage baseline | **App / SessionStore** (future), not the crate |
| Idempotent event identity | `EventIdentity` + `canonical_source_id` |
| Codex ledger mode (TokenCount vs Response) | Adapter options; never both |

---

## 9. Test asset locations

| Asset | Path | Role |
| --- | --- | --- |
| **Canonical production fixtures** | [`src-tauri/src/agent_memory/session_parse/testdata/`](../src-tauri/src/agent_memory/session_parse/testdata/) | Adapter unit/integration tests |
| PoC fixtures | [`scripts/agent-sessions-poc/fixtures/`](../scripts/agent-sessions-poc/fixtures/) | Experiment / adoption regression only |

Production tests **must not** depend on the PoC directory remaining forever. Optional future sync-check script may compare the two trees; production copy is canonical for `cargo test`.

---

## 10. Permanent isolation from `codex_session_scan`

| Surface | Module | Product job |
| --- | --- | --- |
| Soft Pad lights | [`codex_session_scan.rs`](../src-tauri/src/pad_status/adapters/codex_session_scan.rs) | Fast status substrings / pad arbiter |
| Transcript / timeline | `agent_memory::session_parse` | Provenance-preserving JSONL → DTOs |

Constraints:

- Do not rewrite pad scan to call `agent-sessions`.  
- Do not feed pad arbiter `SessionParseOutput`.  
- Do not expose `agent_sessions::*` over Tauri IPC.  
- Discovery/watch daemons and SQLite SessionStore are **out of Slice 1**.

---

## Slice checklist

**Slice 1 / 1.1 / 1.1b / 1.2 / 2A done:** private module; pin; content DTOs; fail-closed mapping; `ss1_` SourceId; same-handle digest; `EventTime` + `sk1_` owner identity; `transcript_*` generation-swap ingest (no FTS/IPC/watcher).

**Do not yet:** FTS; IPC; Agent Center timeline UI; discovery daemon; incremental prefix resume; touch `codex_session_scan`.

---

## Verification log

| Item | Result |
| --- | --- |
| Module | [`src-tauri/src/agent_memory/session_parse/`](../src-tauri/src/agent_memory/session_parse/) |
| Pin | `agent-sessions = "=0.2.2"` in [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) |
| Lock checksum | `664a6e8412440713e77bf4c811fa88cf9b41b0fa29edad14532e958b53bd1aaf` (matches PoC) |
| License | MIT (upstream crates.io) |
| Tree | `agent-sessions → chrono, memchr, serde, serde_json` (+ transitive); only consumed by `onetone` |
| Slice 1.2+2A tests | `session_parse` / `transcript_store` — immutable snapshot + same-source digest, append after snapshot accepts the captured prefix, PrefixVerification cannot bypass `max_file_bytes`, equal-length rewrite after snapshot keeps original digest, early EOF, empty SHA-256, owner-conflict deny, fault inject, concurrent ingest, NoChange/reopen, version bump; persist RAII store_path override + schedule_persist path capture after guard drop |
| Fixtures | Canonical under `session_parse/testdata/` (not PoC path) |
| Persistence | Slice 2A `transcript_*` generation swap landed; FTS/IPC/UI deferred |
| `cargo audit` (2026-10-07) | No advisory names `agent-sessions`. Re-audit on every bump. |

### Deferred

- Formal ignored allowlist population, golden parity, Windows append/replace matrix, sensitive-tool redaction  
- FTS, IPC pagination, Agent Center timeline, discovery/watcher (Slice 2B+) |
