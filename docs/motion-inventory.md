# Motion inventory

Scoped list of infinite / status animations for the Motion System work.
Out-of-scope loops found while editing are recorded here — do not expand the PR.

| Selector / surface | Page | Trigger | Loop allowed? | PR / status |
|---|---|---|---|---|
| `.overlay-mini__agent[data-status=running] .overlay-mini__agent-dot` | Mini | `running` | yes (pulse only) | PR2 done |
| Soft Pad agent bar running dot | Soft Pad overlay | `running` | yes (pulse only) | PR2 done |
| Keys recording ring | Keys | Recording | yes (while recording) | PR2 done |
| `.wb-hero.is-live` waves / ripple | Home | business live | level-driven, no loop | PR3 done |
| QS mode matrix demos | Quick Start | hover or selected card | yes (gated) | Apple audit |
| `.flow-desk` dash path | Keys/Voice desk | always | no (static) | PR3 done |
| Soft Pad hub show-scenes | Soft Pad settings | scene visible | no | PR3 done |
| template-pick idle key/wave | Keys template | unselected | no; selected plays once | PR3 done |
| Camera presence breathe | Camera | presence | deferred | inventory |
| Habit voice cmd bars/spin | Habit | various | deferred | inventory |
| Onboard demo loops | Onboarding | visible | deferred (P1 polish) | inventory |
| Soft Pad numpad/face demos (non show-scene) | Soft Pad hub | visible | deferred | inventory |
| Voice accordion open/close | Voice | step change | instant hidden + 160–200ms opacity/clip reveal | Block fix done |
| QS `.mode-card *` wipe | Quick Start | — | forbidden | Block: explicit consumers only |
| Voice listen mic | Voice | listening | scale/opacity wave | PR3 done |

## disconnected (deferred)

Not wired in PR2. Normalization draft lives in the Motion System plan:
unconfigured → hidden; enabled + stale → disconnected; missing row under stale → keep last.

## Manual acceptance checklist (attach to PR2 / PR3 descriptions)

| Page / state | Viewport | Theme | reduced-motion | animationName / iterationCount | Notes / screenshot |
|---|---|---|---|---|---|
| Mini idle | desktop | light | off | `none` | |
| Mini running | desktop | light | off | `ot-status-pulse` / infinite | single continuous anim |
| Mini needs_input | desktop | light | off | `none` (static amber) | optional one-shot on edge |
| Mini done edge | desktop | light | off | `ot-sparkle-once` / 1 | then static |
| Mini failed edge | desktop | dark | off | `ot-shake` / 1 | |
| Mini running | narrow | dark | on | `none` | |
| Soft Pad agent running | desktop | light | off | `ot-status-pulse` / infinite | |
| Keys recording | desktop | light | off | `keys-record-dot` / infinite | ::after opacity/scale only; static ring |
| Keys conflict | desktop | light | off | `ot-shake` / 1 | 260ms; repeatable on new msg |
| Keys success | desktop | light | off | `ot-sparkle-once` / 1 | after capture |
| Voice wake open → recognize | desktop | light | off | opacity/clip reveal | focus → head on close; layout instant reclaim; collapsed inert |
| Voice reduced-motion | desktop | light | on | instant open/close | no rAF mid-state |
| Home hero live | desktop | light | off | no harmonic/ripple loops | level-driven opacity |
| QS matrix idle | desktop | light | off | `none` | |

Repeat `running → done → running → done` and two consecutive conflicts before merge.


