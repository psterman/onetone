---
target: 摄像头 IA 页面
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 2
target_identity: "file:E:\\voice-pilot\\src\\index.html#settingsPanelCamera"
timestamp: 2026-09-20T08-50-01Z
slug: src-index-html-settingspanelcamera
---
# Critique: Camera settings IA (`#settingsPanelCamera`)

**Mode:** Operate · **Target:** `src/index.html#settingsPanelCamera` (+ fork `#settingsPanelCamera2`)
**Provenance:** dual sub-agents (Assessment A design · Assessment B detector)
**Browser:** skipped (no live URL)
**ui-ux-pro-max:** search tool unavailable in this shell (WindowsApps python stub); heuristics from Impeccable Operate critique + structural counts

## Design-specificity verdict

`#settingsPanelCamera` reads as a generic “advanced vision suite” (preview + flat Pro feature tabs), not as OneTone’s emerging Operate shell (Keys/Soft Pad: 识别 rail | workbench | preview+habits). Product DNA exists in if-then rule rows and privacy copy, but shell taxonomy is category-interchangeable; `#settingsPanelCamera2` already points at the authored replacement direction.

## Heuristic scores (0–4)

| # | Heuristic | Score |
|---|-----------|------:|
| 1 | Visibility of system status | 2 |
| 2 | Match system / real world | 2 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 1 |
| 5 | Error prevention | 2 |
| 6 | Recognition rather than recall | 2 |
| 7 | Flexibility and efficiency | 3 |
| 8 | Aesthetic and minimalist design | 1 |
| 9 | Error recovery | 2 |
| 10 | Help and documentation | 2 |
| | **Total** | **20/40** |

## Cognitive load

- `#cameraProSubtabs`: **10** peer choices — far above ≤4 Operate budget.
- Vision rules: toggle + action + duration wall on primary job.
- Beauty nested control walls; calib 4 peer actions.
- Master enable only on Vision tab; privacy vs beauty「隐私面具」split.
- Dual Camera 1 / Camera 2 mental model.
- Hollow `#cameraWorkflowTabsBar` (title only); trust status mostly `sr-only`.

## Emotional journey

Opt-in preview + 「不会自动开启」reassure, then diluted: 隐私 is peer-equal to 美颜/久坐/移窗. Peak-end is feature hunt, not “camera off / rules safe.”

## Strengths

1. Opt-in camera posture and local/privacy framing in copy.
2. If-then rule vocabulary + recommend card — product-native matching language.
3. Runtime quality strip when preview runs.

## Priority issues

1. **P0 — 10 flat Pro subtabs** collapse unrelated jobs into one peer menu.
2. **P0 — Status bar does no Operate work** (no master/trust/job context).
3. **P0 — Dual Camera pages** (`camera` vs `camera2`) fracture “the camera settings.”
4. **P1 — Privacy hierarchy** buried among cosmetics/wellness.
5. **P1 — Composition lag** vs Keys/Soft Pad three-col match workbench.

## Persona red flags

Privacy-anxious users; casual matchers; Soft Pad/Keys three-col power users hit shell inconsistency; EN tab labels (Snap/Auto Mute) vs ZH peers.

## Detector (Assessment B)

- `detect --json src/index.html` exit 0 · **216** findings (mostly whole-file noise).
- Camera-snippet hits: **5** (cramped-padding teach UI ×3, pulsing-dot ×1, marquee snap ×1).
- Structure: 10 subtabs; preview nested left inside Pro; ~20 toggles / ~19 selects; Camera2 fork confirmed.

## Minor

Duplicate title chrome; dual tablists (sr-only flow + Pro subtabs); hidden interactive calib controls; bridge links acknowledge fragmentation.
