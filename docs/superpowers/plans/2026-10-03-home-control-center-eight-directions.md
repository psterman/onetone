# OneTone Eight-Direction Home Control Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an isolated static HTML prototype that compares eight distinct OneTone desktop-control-center home directions against identical data, states, tasks, and evaluation criteria.

**Architecture:** A static comparison shell owns navigation, scenario state, feedback, and evaluation persistence. Eight renderer functions consume one normalized `PrototypeSnapshot` contract and return independent, interactive full-size views without importing production code.

**Tech Stack:** HTML5, CSS, vanilla JavaScript, Node.js smoke tests, browser visual verification.

**Spec:** `docs/superpowers/specs/2026-10-03-home-control-center-eight-directions-design.md`

## Global Constraints

- Create files only under `prototypes/home-control-center/` plus one focused smoke test under `scripts/`.
- Do not modify production `src/`, `src-islands/`, `src-tauri/`, configuration, or IPC.
- Provide eight distinct tabs and five shared states at `1280 × 800` and `960 × 640` without horizontal overflow.
- Never display invented completion percentages, quotas, historical results, or resume points.
- All primary actions must produce visible prototype feedback and all important controls must be keyboard reachable.
- Respect `prefers-reduced-motion`; switching directions is instantaneous.
- Persist evaluation scores and notes in `localStorage`, with in-memory fallback.

## Review Focus

- Corrupt or unavailable `localStorage` must not prevent rendering or scoring; Task 3 tests the fallback.
- Missing target or microphone must disable the unsafe action and expose the correct repair action; Task 2 tests both states.
- Rapid tab/state switching must retain the selected scenario and evaluation draft; Task 3 tests state ownership.
- Narrow desktop height/width must keep navigation and primary controls reachable without horizontal overflow; Task 4 verifies both target sizes.
- Keyboard-only use must reach tabs, state selectors, commands, scores, and notes with visible focus; Task 4 verifies the full route.

---

### Task 1: Static Shell and Shared Snapshot Contract

**Files:**
- Create: `prototypes/home-control-center/index.html`
- Create: `prototypes/home-control-center/styles/shell.css`
- Create: `prototypes/home-control-center/scripts/fixtures.js`
- Create: `prototypes/home-control-center/README.md`
- Test: `scripts/test-home-control-center-prototype.mjs`

**Interfaces:**
- Produces: `window.HomePrototypeFixtures.getSnapshot(stateId)` returning a cloned `PrototypeSnapshot`.
- Produces: DOM mounts `[data-prototype-app]`, `[data-variant-nav]`, `[data-state-nav]`, `[data-variant-stage]`, and `[data-evaluation-panel]`.

- [ ] **Step 1: Write the failing structural smoke test**

Assert the HTML exposes all required mounts and fixtures define exactly `idle`, `listening`, `running`, `waiting`, and `missing-config`, with scene, target, four channels, agents, attention, issues, and actions.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node scripts/test-home-control-center-prototype.mjs`  
Expected: FAIL because the prototype files do not exist.

- [ ] **Step 3: Implement the shell, tokens, fixtures, and usage README**

Use a fixed top comparison bar and a full-size stage. Keep reviewer chrome visually neutral and separate from candidate surfaces.

- [ ] **Step 4: Run the structural smoke test**

Run: `node scripts/test-home-control-center-prototype.mjs`  
Expected: PASS for shell and fixture assertions reached so far.

- [ ] **Step 5: Commit**

```bash
git add prototypes/home-control-center scripts/test-home-control-center-prototype.mjs
git commit -m "test: scaffold home control center prototype"
```

### Task 2: Eight Independent Interactive Directions

**Files:**
- Create: `prototypes/home-control-center/styles/variants.css`
- Create: `prototypes/home-control-center/scripts/variants.js`
- Modify: `prototypes/home-control-center/index.html`
- Modify: `scripts/test-home-control-center-prototype.mjs`

**Interfaces:**
- Consumes: `getSnapshot(stateId)` from Task 1.
- Produces: `window.HomePrototypeVariants`, a registry of eight entries `{ id, label, axis, render(snapshot) }`.
- Produces: action elements with `data-action`, optional `data-target`, and safe disabled states.

- [ ] **Step 1: Extend the smoke test for eight divergent renderers**

Assert exact IDs `vibe`, `beginner`, `vision`, `quest`, `search`, `agents`, `notion`, and `raycast`; unique axis descriptions; and required action hooks in every rendered direction.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node scripts/test-home-control-center-prototype.mjs`  
Expected: FAIL because the registry and renderers are missing.

- [ ] **Step 3: Implement the eight renderers and their visual systems**

Give each direction a distinct composition, density, navigation model, and primary-action placement while retaining OneTone identity and the shared snapshot facts.

- [ ] **Step 4: Implement safe state-specific behavior**

Missing microphone routes voice actions to microphone setup; missing target requires target selection; unavailable Hook never claims a live Agent status.

- [ ] **Step 5: Run the smoke test**

Run: `node scripts/test-home-control-center-prototype.mjs`  
Expected: PASS for renderer registry, prohibited-copy, and safety assertions.

- [ ] **Step 6: Commit**

```bash
git add prototypes/home-control-center scripts/test-home-control-center-prototype.mjs
git commit -m "feat: add eight home prototype directions"
```

### Task 3: Comparison Runtime and Evaluation Persistence

**Files:**
- Create: `prototypes/home-control-center/scripts/app.js`
- Create: `prototypes/home-control-center/scripts/evaluation.js`
- Modify: `prototypes/home-control-center/index.html`
- Modify: `prototypes/home-control-center/styles/shell.css`
- Modify: `scripts/test-home-control-center-prototype.mjs`

**Interfaces:**
- Consumes: `HomePrototypeFixtures` and `HomePrototypeVariants`.
- Produces: `window.HomePrototypeEvaluation.createStore(storage)` with `load()`, `saveVariant(id, value)`, and `summary()`.
- Produces: URL hash state `#<variant>/<scenario>` and keyboard-accessible tab/state selection.

- [ ] **Step 1: Extend tests for runtime and persistence**

Assert hash parsing defaults safely, switching retains scenario state, all six score keys persist, notes persist, corrupt storage falls back to memory, and action feedback is announced through an ARIA live region.

- [ ] **Step 2: Run the test and verify it fails**

Run: `node scripts/test-home-control-center-prototype.mjs`  
Expected: FAIL because runtime and evaluation modules are missing.

- [ ] **Step 3: Implement comparison navigation and action dispatch**

Keep one active full-size renderer, update the URL hash, support click/arrow-key selection, and translate prototype actions into visible fixture-state or feedback changes.

- [ ] **Step 4: Implement scores, notes, explanation panel, and summary view**

Persist six 1–5 scores plus notes per direction. Summaries show totals and candidate fusion elements without automatically naming a winner.

- [ ] **Step 5: Run the smoke test**

Run: `node scripts/test-home-control-center-prototype.mjs`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add prototypes/home-control-center scripts/test-home-control-center-prototype.mjs
git commit -m "feat: add home prototype comparison runtime"
```

### Task 4: Browser Verification and Delivery

**Files:**
- Modify: `prototypes/home-control-center/README.md`
- Modify: `scripts/test-home-control-center-prototype.mjs` only if verification reveals a missing invariant.
- Create: `test-output/home-control-center/*.png` as disposable verification artifacts; do not commit unless requested.

**Interfaces:**
- Consumes: completed static prototype.
- Produces: verified local URL and eight screenshots.

- [ ] **Step 1: Run the automated smoke test**

Run: `node scripts/test-home-control-center-prototype.mjs`  
Expected: PASS with counts for eight directions and five states.

- [ ] **Step 2: Serve the prototype**

Run: `npx serve prototypes/home-control-center -l 4178 --no-port-switching`  
Expected: prototype available at `http://localhost:4178`.

- [ ] **Step 3: Verify all directions at both desktop sizes**

At `1280 × 800` and `960 × 640`, switch every direction through every state, execute its primary action, and confirm no horizontal overflow or console errors.

- [ ] **Step 4: Verify keyboard and reduced-motion behavior**

Reach direction tabs, state selectors, commands, scores, and notes without a pointer; verify focus visibility and no decorative motion with reduced motion enabled.

- [ ] **Step 5: Save one screenshot per direction and update README**

Document the launch command, keyboard controls, scenario meanings, scoring criteria, and known prototype-only limitations.

- [ ] **Step 6: Commit**

```bash
git add prototypes/home-control-center scripts/test-home-control-center-prototype.mjs
git commit -m "docs: finish home prototype comparison harness"
```
