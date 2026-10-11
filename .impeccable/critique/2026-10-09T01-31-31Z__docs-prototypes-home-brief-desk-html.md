---
target: docs/prototypes/home-brief-desk.html
total_score: 23
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:E:\\voice-pilot\\docs\\prototypes\\home-brief-desk.html"
target_fingerprint: "sha256:096eff9cf1ab9ad6d3595d6151fb9b411101638f6e2458d671e22522e286273e"
target_path: "E:\\voice-pilot\\docs\\prototypes\\home-brief-desk.html"
timestamp: 2026-10-09T01-31-31Z
slug: docs-prototypes-home-brief-desk-html
---
# Home Brief Desk Prototype Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Autosave / cite count / budget clear; situation narrative demoted to sit-bar |
| 2 | Match System / Real World | 2 | Binding/handoff metaphor works; cite modes + six ingest chips feel file-cabinet |
| 3 | User Control and Freedom | 3 | Drawer Esc/focus; material reorder/delete; archive/switch lack confirmation |
| 4 | Consistency and Standards | 2 | Nav says「现在」but surface is full Prep; send vs handoff wording splits |
| 5 | Error Prevention | 2 | Attention/error hide send CTA (good); skip vs uncheck duplicates; archive unconfirmed |
| 6 | Recognition Rather Than Recall | 2 | Cite modes dense; narrow shelf covers binding paper |
| 7 | Flexibility and Efficiency | 3 | Preview/raw MD, context chips; weak batch/keyboard mode shortcuts |
| 8 | Aesthetic and Minimalist Design | 1 | Header actions + six chips + per-item four modes + dual footers overload first viewport |
| 9 | Error Recovery | 3 | Degraded demo + honest receipt; weak recovery path back to cockpit |
| 10 | Help and Documentation | 2 | Prototype disclaimer present; no cite-mode or cockpit-relationship onboarding |
| **Total** | | **23/40** | **Acceptable** |

## Design Specificity Verdict

LLM: Binding-desk and sit-bar language feel OneTone-adjacent, but the composition is a category-default AI context workbench (ingest rail / prompt paper / send footer). Swapping the brand would still read as generic Prep. Structural conflict with PRODUCT.md: situation cockpit is demoted; Prep owns「现在」.

Deterministic scan: 1 warning (`clipped-overflow-container` on `.app`), 1 advisory (`gpt-thin-border-wide-shadow`). No blockers. Overlay injection not run this pass; evidence from CLI + Playwright viewport probes + committed review screenshots.

## Overall Impression

Strong exploration of materials → bound brief → honest handoff. Wrong home for that exploration if「现在」must stay a situation cockpit. Biggest opportunity: demote this desk to a secondary surface entered from Focus, and distill material controls so first-run is not a cite-mode spreadsheet.

## What's Working

- Handoff drawer as a high-stakes gate: agent diff, attachment todos, budget estimate, form handoff / cancel, honest receipt.
- Citations sync from materials without wiping「你的话」.
- Situation demos attempt single-CTA discipline (hide send when attention/error CTA appears).

## Priority Issues

- **[P0] Prep owns the「现在」stage.** Situation is a bottom line; PRODUCT wants cockpit primary. Fix: enter desk from a collapsed launch card / secondary path. Suggested: `$impeccable distill` or `$impeccable shape`.
- **[P0] Material rack cognitive explosion.** Six ingest chips + four cite modes per item + tools. Collapse ingest; default mode by kind; advanced cite on demand. Suggested: `$impeccable distill`.
- **[P1] CTA verb chain splits.** Send bar vs「准备交接」vs「形成交接稿」. One verb sequence. Suggested: `$impeccable clarify`.
- **[P1] Narrow shelf covers binding paper.** Cannot write while comparing materials. Suggested: `$impeccable adapt`.
- **[P2] Header secondary actions compete.** Copy / archive / recent at same weight as task. Suggested: `$impeccable quieter`.

## Persona Red Flags

- **Alex (power):** No batch cite-mode or keyboard mode editing; raw MD readonly frustrates advanced edit.
- **Jordan (first-timer):** Six ingest + four modes unexplained;「现在」does not answer where am I.
- **Sam (keyboard/SR):** Drawer modal OK; shelf lacks dialog/inert; narrow nav icons lack accessible names.

## Minor Observations

- Paste zone visible above fold on desktop (~1360×920).
- Send-bar + sit-bar are flush stacked (~103px combined) — dual footer competition.
- Warm paper / teal stays coherent with shell prototypes; system font stack remains default.
- Demo bar must not be mistaken for product chrome.

## Questions to Consider

- If this desk left「现在」, would you still need dual-pane materials+paper, or「你的话」+ one attachment pass?
- Are cite modes user decisions, or system defaults until budget breaks?
- After handoff, should the emotional end be the receipt, or return to cockpit next action?
