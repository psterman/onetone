---
target: homepage / now home
total_score: 19
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:E:\\voice-pilot\\src\\js\\features\\now\\now-home.js"
target_fingerprint: "sha256:b43e4ab9959143c767f749212236cea7c05b874009684ffcbae97d9104817061"
target_path: "E:\\voice-pilot\\src\\js\\features\\now\\now-home.js"
timestamp: 2026-10-08T10-09-25Z
slug: src-js-features-now-now-home-js
---
# Critique — OneTone Now Home / Home Focus

**Target:** src/js/features/now/now-home.js (+ home-focus-view, adapter, store, now-home.css)
**Mode:** Operate
**Total:** 19/40

## Heuristics

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Adapter modes not painted; quiet home looks empty |
| 2 | Match System / Real World | 2 | Strong ZH copy unused; Soft Pad / ProbeStatus leaks |
| 3 | User Control and Freedom | 3 | Pick/drawer OK; resume path thin on home |
| 4 | Consistency and Standards | 1 | now-* / hn-* / hpp-* dialects; dead helpers |
| 5 | Error Prevention | 2 | Project gate good; primary retry not visible |
| 6 | Recognition Rather Than Recall | 2 | Resume/headline not co-located |
| 7 | Flexibility and Efficiency | 2 | Dock hotkey only; click-heavy prep |
| 8 | Aesthetic and Minimalist Design | 2 | Quiet over-collapses into blank |
| 9 | Error Recovery | 2 | Retry exists off-canvas; degraded copy weak |
| 10 | Help and Documentation | 1 | No first-run why-home |

## Design Specificity

Authored for OneTone in adapter/backend; interchangeable/orphaned in painted UI. Live renderFocus ignores headline/assistance/primary.

## Priority Issues

1. P0 Situational canvas not rendered
2. P1 Focus vs Prompt Prep identity split
3. P1 Add-material 6-option wall
4. P2 Jargon / bilingual chips
5. P2 Visual dialect collision
