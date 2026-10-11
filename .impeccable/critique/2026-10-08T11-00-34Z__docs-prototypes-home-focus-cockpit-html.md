---
target: "file:///e%3A/voice-pilot/docs/prototypes/home-focus-cockpit.html"
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:E:\\voice-pilot\\docs\\prototypes\\home-focus-cockpit.html"
target_fingerprint: "sha256:3dabfc4b40abe1f513bbb850fe3e785fb44d502ab9190d2ea5848f6bd072850e"
target_path: "E:\\voice-pilot\\docs\\prototypes\\home-focus-cockpit.html"
timestamp: 2026-10-08T11-00-34Z
slug: docs-prototypes-home-focus-cockpit-html
---
# Home Focus Cockpit Prototype Critique

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 3 | Five modes are legible, but prototype CTAs provide no action feedback. |
| 2 | Match System / Real World | 4 | Context, project trust, and next action use direct product language. |
| 3 | User Control and Freedom | 2 | Secondary exits are visible, but prototype actions and navigation are inert. |
| 4 | Consistency and Standards | 3 | One coherent visual language; tab behavior is incomplete. |
| 5 | Error Prevention | 4 | Unconfirmed-project gate correctly blocks resume without introducing a second emphasized CTA. |
| 6 | Recognition Rather Than Recall | 4 | The previous task, project state, freshness, and next action are all visible. |
| 7 | Flexibility and Efficiency | 2 | Primary actions are direct, but no shortcuts or complete keyboard tab pattern are demonstrated. |
| 8 | Aesthetic and Minimalist Design | 3 | Hierarchy is calm and focused; quiet-state strip placement and excess lower whitespace weaken composition. |
| 9 | Error Recovery | 3 | Degraded mode offers retry and evidence, but neither is interactive in the prototype. |
| 10 | Help and Documentation | 2 | Trust wording helps locally, but no first-run explanation of the cockpit or project confirmation exists. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

The prototype feels authored for OneTone rather than like a generic AI dashboard. Its strongest product-specific move is the pairing of situational narration with epistemic honesty: a resumable task becomes “confirm project to continue” instead of silently binding an inferred workspace. The structure is also materially better than the current Prep-led canvas.

The deterministic scan produced seven warnings: five low-contrast instances, one cream-palette warning, and one dark-glow warning. The contrast warnings are actionable. The cream warning is contextual rather than automatically wrong, and the dark-glow warning is a false positive because the shadow is a restrained neutral elevation on a light surface.

## Overall Impression

This is the right first-round target. The cockpit story is restored, the single-primary-action rule is visible in all five states, and Prompt Prep reads as a secondary start-new-work path. The biggest remaining weakness is that the prototype proves layout but not the stateful interaction contract.

## What's Working

- The fixed sequence—context Hero, one primary action, metadata, Prep launch card, Dock—makes the page understandable in seconds.
- Return and unconfirmed states preserve continuity without sacrificing the project trust gate.
- Attention and degraded modes use color as reinforcement rather than the only carrier of meaning.

## Priority Issues

- **[P1] Prototype actions are inert.** Continue, retry, evidence, project selection, navigation, Prep expansion, and dictation give no feedback. Wire lightweight prototype transitions or annotate them explicitly as noninteractive before treating this as implementation truth. Suggested command: `$impeccable harden`.
- **[P1] Quiet-state strip precedes the Hero.** Supplemental Agent status becomes the first content announced and scanned, undermining the cockpit hierarchy. Move the strip below Hero metadata and suppress duplicate stories by semantic status, not only visibility. Suggested command: `$impeccable layout`.
- **[P2] Muted text narrowly fails WCAG AA.** `#6b7888` measures 4.4:1 on paper and 3.8:1 on the dock key background. Darken the muted token and independently tune the key label. Suggested command: `$impeccable audit`.
- **[P2] Tab semantics are incomplete.** The mode switcher uses `role=tab` but lacks roving tabindex, arrow-key navigation, and associated tabpanels. Either implement the full tab pattern or use ordinary pressed buttons for a prototype control. Suggested command: `$impeccable harden`.
- **[P2] The fixed 720px stage creates a weak quiet lower half.** On sparse states the composition reads slightly unfinished. Let the prototype use the intended Tauri viewport height or redistribute the Prep/status region without filling space with decoration. Suggested command: `$impeccable layout`.

## Persona Red Flags

- **Alex (power user):** The main action is easy to spot, but the prototype exposes no keyboard accelerator and the tab switcher does not support arrow-key navigation.
- **Jordan (first-timer):** The page clearly answers what happened and what to do. However, “查看判断依据” and project confirmation do nothing here, so the trust promise cannot be verified.
- **Sam (keyboard/screen reader):** Focus styles are present and landmarks are reasonable. The incomplete ARIA tab pattern and low-contrast metadata remain barriers; status changes also lack meaningful action outcomes.

## Minor Observations

- The Chinese return headline wraps awkwardly after “的” at 440px; tune measure or font size against realistic long task names.
- The centered “● OneTone” in the Dock repeats the brand without adding state.
- The Prep card remains acceptably subordinate even in attention mode, but production should ensure it never gains primary-button styling.
- Warm paper is coherent with the incumbent direction; do not remove it solely because the detector labels cream palettes as common.

## Questions to Consider

- Should the supplemental strip ever appear above the core answer to “where am I and what next?”
- What is the longest realistic checkpoint title that must remain readable without pushing the CTA below the first viewport?
- Should “选择其他项目” stay a secondary Hero action, or open only from the confirmation flow to keep return even quieter?
