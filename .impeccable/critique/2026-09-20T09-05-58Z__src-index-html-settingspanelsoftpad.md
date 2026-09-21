---
target: 虚拟键盘 Soft Pad IA
total_score: 20
max_score: 40
na_heuristics: 
p0_count: 3
p1_count: 2
target_identity: "file:E:\\voice-pilot\\src\\index.html#settingsPanelSoftPad"
timestamp: 2026-09-20T09-05-58Z
slug: src-index-html-settingspanelsoftpad
---
# Critique: Soft Pad / 虚拟键盘 IA (`#settingsPanelSoftPad`)

**Mode:** Operate · **Target:** `src/index.html#settingsPanelSoftPad`
**Provenance:** dual sub-agents (A design · B detector)
**Browser:** skipped (no live URL)
**Note:** Prior critique run mistakenly targeted Camera; this run corrects to Soft Pad after three-col IA redo.

## Design-specificity verdict

Three-col shell (识别 rail | workbench | preview+hint+habits) is OneTone/Keys-shaped and tracks `softpad-rail-merge`. Specificity weakens where mid nests Agent/key editors instead of a flat Soft Pad bind loop, left rail is a full Keys channel twin that mostly deeplinks, and right hint re-packs status chrome without triage.

## Heuristic scores (0–4)

| # | Heuristic | Score |
|---|-----------|------:|
| 1 | Visibility of system status | 2 |
| 2 | Match system / real world | 2 |
| 3 | User control and freedom | 3 |
| 4 | Consistency and standards | 2 |
| 5 | Error prevention | 2 |
| 6 | Recognition rather than recall | 2 |
| 7 | Flexibility and efficiency | 2 |
| 8 | Aesthetic and minimalist design | 1 |
| 9 | Error recovery | 2 |
| 10 | Help and documentation | 2 |
| | **Total** | **20/40** |

## Cognitive load

High (~6–7/8 checklist fails). Rail 6 channels; hint packs bind + meta + 2 actions; mid Agent category nest; Soft Pad vs Keys ownership must be remembered. Progressive disclosure fails — all channels always listed, only mid swaps to bridge.

## Emotional journey

Calm slim brand bar → intended peak (preview↔mid bind) flattened by nested mid + hint clutter → valleys at `本场景动作 0`, non–屏幕按钮 bridge exile, Agent-gated habit dock → exit lacks completion ritual.

## Strengths

1. Three-col contract is real in HTML/CSS and matches prototype “右栏上下叠”.
2. Non-softPad channels use honest Keys deeplink bridge (no fake dual editor).
3. Scene-actions dock under preview keeps Soft Pad ↔ habits in one column.

## Priority issues

1. **P0 — Left `识别` vs Soft Pad ownership** — Six Keys-identical tabs; only `屏幕按钮` keeps pad workbench; others are deeplink hubs dressed as local editors.
2. **P0 — Mid nesting vs flat bind loop** — Agent categories + key editor bury “改这个屏幕键”; prototype mid was short bind list synced to preview.
3. **P0 — `#softPadPreviewHint` clutter** — Bind + 灯效/键位 meta + 测试/编辑 between preview and habits without triage.
4. **P1 — Empty `本场景动作`** — Hollow dock, no Soft-Pad-specific empty that teaches preview→mid→habit.
5. **P1 — Dual edit paths + Agent-gated dock** — Hint `编辑键位` vs mid `按键`; Agent mode can hide scene panel.

## Persona red flags

First-run assumes all six 识别 rows are Soft Pad; Keys power users see duplicate rail; empty habits feel broken; Agent mid feels tool-admin not pad-operate.

## Detector (Assessment B)

- `detect --json src/index.html` exit 0 · **216** findings · **0** soft-pad-scoped snippet hits (whole-file noise, line:0).
- Structure: three-col yes; preview/bind/summary/test under right hint; 6 rail channels; 3 pad tabs; no channel search; slim status bar; bridge present; 37 `hidden` in Soft Pad block; retired faces still in DOM.

## Minor

sr-only page subtitle; idle copy drift; Soft Pad rail lacks Keys-style `起点` job label explaining different job; narrow breakpoint stacks three cols.
