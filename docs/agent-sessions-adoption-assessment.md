# agent-sessions adoption assessment (OneTone)

**Verification date:** 2026-10-07 (UTC)  
**PoC package:** [`scripts/agent-sessions-poc/`](../scripts/agent-sessions-poc/)  
**Machine summary:** `test-output/agent-sessions-poc-summary.json` (gitignored)  
**Leak scan:** `test-output/agent-sessions-poc-leak-scan.json` (gitignored)

---

## 1. Upstream version, license, MSRV

| Field | Value | Source |
| --- | --- | --- |
| Crate | `agent-sessions` **0.2.2** | [crates.io/crates/agent-sessions](https://crates.io/crates/agent-sessions) |
| License | MIT | crates.io `versions[0].license` |
| MSRV | **1.88** (`rust-version` on crate) | crates.io + upstream `Cargo.toml` |
| Host rustc | `rustc 1.98.1 (48a229cea 2026-09-01)` | PoC `msrvOk: true` |
| Registry checksum | `664a6e8412440713e77bf4c811fa88cf9b41b0fa29edad14532e958b53bd1aaf` | [`scripts/agent-sessions-poc/Cargo.lock`](../scripts/agent-sessions-poc/Cargo.lock) + crates.io |
| Direct pin | `agent-sessions = "=0.2.2"` | PoC + production [`src-tauri/Cargo.toml`](../src-tauri/Cargo.toml) (adapter-only; see [`session-parser-adapter-design.md`](session-parser-adapter-design.md)) |
| Editions | crate uses edition 2024; PoC binary uses edition 2021 | upstream / PoC manifests |

**Dependency tree (PoC):** `agent-sessions → chrono, memchr, serde, serde_json` (+ transitive). No network/DB deps. Recorded via `cargo tree --manifest-path scripts/agent-sessions-poc/Cargo.toml`.

**Maturity observations (time-sensitive, 2026-10-07):**

| Signal | Observation | Source |
| --- | --- | --- |
| crates.io created | 2026-09-25 | crates.io API |
| crates.io updated | 2026-09-27 (0.2.2) | crates.io API |
| Downloads | total/recent reported by crates.io API at verification time | crates.io API (do not treat as stable product fact) |
| Releases | 0.2.0 → 0.2.1 → 0.2.2 within ~2 days | crates.io versions |
| Publisher | single crates.io owner `majiayu000` / “lif” | crates.io `published_by` |
| GitHub API | live REST rate-limited during this run | note: re-query before production decision |
| Local tag checkout | `v0.2.2` → `133eafa` “prepare agent-sessions 0.2.2 patch release (#4)” | TEMP clone outside repo |
| CI | `.github/workflows/ci.yml`: MSRV 1.88.0 + stable on Ubuntu/macOS/Windows; fmt/clippy `-D warnings`; fuzz job 60s | upstream clone |
| Tests | `format_contract`, `reader_contract`, `usage_contract`, `golden`, fuzz corpus from fixtures | upstream `tests/` |
| Downstream (README claim) | ccstats, Keepline, refine, ccp, chat-archive-rs; QuotaBar via ccstats | upstream README (verify links before merge) |

Treat stars/forks/download counts as **observations**, not product requirements. Project is still **0.2.x** with a small surface and single-maintainer concentration risk.

---

## 2. Gap vs OneTone current parsing

| OneTone module | Today | agent-sessions 0.2.2 |
| --- | --- | --- |
| [`codex_session_scan.rs`](../src-tauri/src/pad_status/adapters/codex_session_scan.rs) | Offset cursor + substring prefilter + `event_msg` → pad status; `SCAN_HEALTH` corrupt latch | Full typed stream: Meta/Message/Tool/Usage + `Located` provenance + finish statuses |
| [`codex_work_meta.rs`](../src-tauri/src/agent_memory/codex_work_meta.rs) | `session_index.jsonl` id/title/updated only | Session file discovery + title index APIs (`load_session_titles`) available but unused by OneTone today |
| [`prompt_journal.rs`](../src-tauri/src/agent_memory/prompt_journal.rs) | Hook/dispatch prompt rows in SQLite | Not a substitute; journal remains product ingestion |
| [`agent_center.rs`](../src-tauri/src/agent_memory/agent_center.rs) | Control plane / probes / actions | No overlap; must not consume third-party types over IPC |

**Conclusion of gap:** OneTone today has **status/index/hook** slices, not a provenance-preserving JSONL session layer. agent-sessions fills that layer **if** isolated behind OneTone DTOs (`ParseCompleteness`, etc.).

---

## 3. Test matrix (fixture + real)

**Portable:** `npm run test:agent-sessions-poc` — fixtures + leak scan (must pass without local sessions).  
**Local adoption evidence:** `npm run test:agent-sessions-poc:real` — also requires `realProviderCompatibilityGatePassed`.

| Case | Result | Notes |
| --- | --- | --- |
| complete_valid | PASS | Claude fixture; commit allowed |
| malformed_final_with_newline | PASS | `CompleteWithErrors`, `truncated_tail=false` (LF malformed final) |
| incomplete_unterminated_tail | PASS | `IncompleteTail`, `truncated_tail=true`, `line_errors=0` |
| malformed_mid | PASS | `InvalidJson` mid-file; `CompleteWithErrors` |
| unknown_record_type | PASS | Unknown in summary; not typed Event; commit denied |
| missing_usage | PASS | No zero-coercion |
| illegal_usage_negative | PASS | Line/diagnostic under Strict |
| illegal_usage_fractional | PASS | Line/diagnostic under Strict |
| illegal_usage_overflow | PASS | >`u64::MAX`; no saturated Usage; commit denied |
| codex_model_switch | PASS | `model-first` → `model-second` |
| large_jsonl_perf | PASS | 2000 lines; peak WS **not measured** |
| oversized_line_8mib | PASS | Default 8 MiB → `TooLong` |
| reparse_deterministic | PASS | Indexes/summary identical |
| typed_prefix_stop_at_byte | PASS | Byte 0 + `stop_at_byte` |
| raw_continuation | PASS | raw `start_offset` only |

**Real-provider minimum compatibility** (aggregate only; re-verified 2026-10-07):

| Field | Codex | Claude |
| --- | --- | --- |
| discovered | 35 | 12 |
| sampled / opened | 12 / 12 | 12 / 12 |
| openErrors | 0 | 0 |
| complete | 12 | 12 |
| completeWithErrors / incompleteTail / failed | 0 | 0 |
| lineErrors / unknownRecords | 0 / 0 | 0 / 0 |
| ignoredRecords (observable, not auto-blocking) | 1583 | 281 |
| cleanFullyRead | 12 | 12 |
| clean ratio | 12/12 | 12/12 |

- `realProviderCompatibilityGatePassed`: **true**
- `gatePolicy`: at least one clean Complete per provider (**minimum compatibility**, not all-sample success rate)
- Clean = `Complete` ∧ `line_errors==0` ∧ `unknown==0` (ignored does not block)

Leak scan: **no** profile paths / secret patterns / long prompt payloads in summary or PoC sources.

---

## 4. Error and finish-status contract

Mapped OneTone `SessionParseStatus` ← upstream `ReadStatus` (`src/reader/options.rs`):

| Status | Meaning (upstream) | OneTone product gate |
| --- | --- | --- |
| Complete | Clean end, selected events delivered | Commit only if unknowns/line_errors = 0 |
| CompleteWithErrors | End reached after line errors | Never whole-snapshot commit |
| IncompleteTail | Tolerated incomplete final JSON (`TailMode::AllowIncomplete`) | Never whole-snapshot commit |
| StoppedEarly | Caller stopped early | Not a snapshot |
| Failed | Fatal IO/limit/snapshot | Abort |

`ParseCompleteness.whole_snapshot_commit_allowed` is **product inference** over parser status + **unknown** + line errors. **`ignoredRecords` is observed but does not automatically block** the PoC clean gate; before production, ignored type keys must be allowlisted and re-audited on change. Upstream: only `Complete` authorizes a whole-snapshot commit; unknown types are a separate completeness gate (README / `ReadSummary.unknown_types`).

Recoverable: `StreamError::Line`. Fatal: IO / TooLarge / SnapshotTruncated — stop iterator.

---

## 5. Provenance

Upstream `Located` / `Location` (`src/event.rs`):

- physical `record_index`, `line_no`
- byte range `byte_start` / `byte_end`
- `event_index` within record projection
- optional timestamp / session / message / record_type

PoC maps these into OneTone `LocatedEvent` **without** re-exporting crate types. Path-based subagent classification is **path evidence only** (upstream README); Meta `source` / `originator` / `thread_source` take precedence for Codex origin — never treat path alone as “human vs subagent”.

---

## 6. Token / usage semantics

| Topic | Behavior | Cite |
| --- | --- | --- |
| Counters | `Option<u64>`; absent ≠ 0 | README / `TokenCounts` |
| Illegal | negative / fractional / malformed → errors (Strict) | PoC illegal_* cases; `AccountingPolicy::Strict` |
| Claude | exclusive input vs cache categories | `TokenSemantics::ClaudeExclusive` |
| Codex | inclusive input (cache r/w); output includes reasoning | `TokenSemantics::CodexInclusive` |
| Cross-provider | **Do not sum** Codex + Claude tokens | product rule |
| Codex ledgers | `ReadOptions.codex_usage`: TokenCount vs Response — never both | README |

PoC `UsageObservation` preserves `None` and provider semantics separately.

---

## 7. Performance

| Metric | Result |
| --- | --- |
| Build | release PoC |
| Large synthetic | 2000 lines, ~233 KiB, status Complete |
| Line limit | 9 MiB line → `TooLong` (default 8 MiB) |
| File limit | default 200 MiB (not hit in PoC) |
| Peak WorkingSet | **not measured** (external sample not used) |

Upstream noted real lines ~10.9 MiB above default — production must surface limit errors, not drop them.

---

## 8. Windows file-read risks

- Typed/raw readers open with std `File` / `BufReader` (shared-read typically OK while another process appends).
- Length alone does **not** detect concurrent rewrites; immutable snapshot verification is a **caller** responsibility (`stop_at_byte` / prefix equality).
- `last_complete_byte` marks contiguous error-free delivered prefix — **not** a license to advance an app cursor after failure.
- Append during read may yield `IncompleteTail` / line errors; treat as non-authoritative until re-verified.

---

## 9. Adoption risks

| Risk | Assessment |
| --- | --- |
| 0.2.x API churn | High — three releases in two days; pin `=0.2.2` + own lockfile |
| Maintainer concentration | Single publisher; bus factor 1 |
| Format coverage | Strong fixture + format_contract + fuzz CI, but provider formats evolve |
| Supply chain | Small MIT dep tree; still requires cargo-audit / periodic re-verify |
| Upgrade cost | Adapter isolation keeps IPC/DB free of crate types; re-run PoC matrix on bump |
| Incremental typed resume | **Not provided**; needs app-owned baseline/dedup + immutable prefix |

---

## 10. Recommendation

### **直接依赖，但通过 OneTone adapter 隔离**  
*(adapter-isolated dependency — supported by this PoC)*

Because `realProviderCompatibilityGatePassed=true` on this host (Codex clean 12/12, Claude clean 12/12 in the sample). If that gate is false or unavailable on another machine, the verdict stays **deferred** — it must **not** auto-imply partial reuse or contract-only in-house.

| Gate | Status |
| --- | --- |
| Minimum real compatibility (≥1 clean Complete per provider) | PASS (`realProviderCompatibilityGatePassed`) |
| Fixture matrix (15 cases incl. IncompleteTail + overflow) | PASS |
| Covered diagnostics/unknown counts observable (tested projections) | PASS — not a claim of lossless transcript |
| MSRV + pin/checksum | PASS (`1.98.1` ≥ 1.88) |
| OneTone DTOs have no third-party public types | PASS |

This is **not** production merge. SessionStore still needs adapter isolation + blockers below. Golden projection parity remains open.

---

## 11. Production blockers (must finish before merge into `src-tauri`)

1. Adapter crate/module with OneTone DTOs only on IPC/DB boundary (`ParseCompleteness` mandatory).
2. Explicit commit policy: `Complete` ∧ unknown=0 ∧ line_errors=0; **ignored type allowlist** with per-key histogram re-audit.
3. Immutable-prefix verification + app-owned usage baseline/dedup — **do not** seek typed reader to `last_complete_byte`.
4. Pin `=0.2.2` (or later audited version) in production lockfile; re-run PoC + `cargo audit`.
5. Windows concurrent-append / rewrite policy and tests.
6. Oversized-line UX/metrics when 8 MiB default trips.
7. Golden projection parity for real formats (PoC only proves covered diagnostics observability).
8. Re-query GitHub maturity when API available; confirm downstream integrations.
9. Do not replace `codex_session_scan` pad-status path blindly.

---

## 12. Stable boundary

```text
Provider JSONL
  → Parser Adapter (agent-sessions isolated; map to OneTone DTOs)
    → OneTone SessionEvent / LocatedEvent / ParseCompleteness
      → SessionStore
        → Agent Center / timeline / search / export
```

**Layers:**

- **Provider fact:** native counters, record bytes, model strings as observed  
- **Parser-derived:** `Located`, finish status, unknown/ignored counts, line errors  
- **Product inference:** `whole_snapshot_commit_allowed`, Agent Center UX, cross-file dedup, cost

---

## A11y work (same delivery)

Narrow Agent Center drawer (`src/js/features/agent/agent-center.js`):

- Search: `aria-label`, `name="ac-drawer-search"`, `autocomplete="off"`
- Dialog: `role="dialog"` + sticky `aria-modal="true"`; closed with `aria-hidden` + `inert` from birth
- Focus: save connected trigger → focus search → Tab trap → Escape → restore / picker fallback
- Tests: `npm run test:agent-center-drawer-a11y` + markup asserts in `test-agent-center`

---

## Commands

```text
npm run test:agent-sessions-poc
npm run test:agent-sessions-poc:real
npm run test:agent-center
npm run test:agent-center-drawer-a11y
npm run test:home-agent-roster
npm run typecheck
```

Production adapter pin + design: see [`session-parser-adapter-design.md`](session-parser-adapter-design.md).
