/**
 * Overlay stability contracts (drag latch, expand intent, click-through reconcile).
 * Source-level — does not prove Win32 drag. Manual Windows checklist at bottom.
 * Run: node scripts/test-overlay-stability-semantics.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const overlay = fs.readFileSync(path.join(root, 'src/codex-micro-overlay.html'), 'utf8');
const carry = fs.readFileSync(path.join(root, 'src/js/features/agent/soft-pad-carry.js'), 'utf8');
const rs = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');
const cmd = fs.readFileSync(
  path.join(root, 'src-tauri/src/ipc/commands/shell/codex_micro_overlay_cmd.rs'),
  'utf8'
);
const ipcToml = fs.readFileSync(
  path.join(root, 'src-tauri/permissions/codex-micro-overlay-ipc.toml'),
  'utf8'
);

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    fail++;
  } else {
    console.log('PASS', msg);
  }
}

// --- Rust drag latch ---
assert(/static OVERLAY_DRAGGING:\s*AtomicBool/.test(rs), 'OVERLAY_DRAGGING static');
assert(/pub fn note_overlay_drag_begin/.test(rs), 'note_overlay_drag_begin public');
assert(/fn clear_overlay_dragging/.test(rs), 'clear_overlay_dragging');
assert(/OVERLAY_DRAGGING\.store\(true/.test(rs), 'start_overlay_drag sets latch');
assert(/if overlay_is_dragging\(\)/.test(rs), 'geometry checks overlay_is_dragging');
assert(/fn writeback_user_position_from_window/.test(rs), 'live user_pos writeback');
assert(/fn reconcile_overlay_input_mode/.test(rs), 'reconcile_overlay_input_mode');
assert(/fn classify_overlay_hide/.test(rs), 'hide_class taxonomy for vanish triage');
assert(/OVERLAY_PENDING_MATS/.test(rs), 'pending mats while dragging');
assert(
  /set_overlay_click_through_impl\(pass,\s*true\)/.test(rs),
  'reconcile force-applies click-through'
);

// --- IPC ---
assert(/cmd_codex_micro_overlay_note_drag_begin/.test(cmd), 'IPC note_drag_begin kept for latch API');
assert(/allow-cmd-codex-micro-overlay-note-drag-begin/.test(ipcToml), 'permission allowlist');
assert(/cmd_codex_micro_overlay_start_drag/.test(cmd), 'IPC start_drag command');

// --- FE drag + intent ---
assert(/cmd_codex_micro_overlay_start_drag/.test(overlay), 'FE start_drag for Win32 caption');
assert(
  !/cmd_codex_micro_overlay_note_drag_begin/.test(overlay),
  'FE uses single start_drag IPC (no note_drag_begin hop)'
);
assert(/beginOverlayDrag/.test(overlay), 'FE beginOverlayDrag guard');
assert(/MUST NOT await/.test(overlay), 'FE documents fire-and-forget drag IPC');
assert(
  !/addEventListener\('mousedown',\s*beginOverlayDrag/.test(overlay),
  'FE drag binds pointerdown only (no mousedown double-fire)'
);
assert(
  /AttachThreadInput/.test(rs) && /HTCAPTION/.test(rs) && /SC_MOVE/.test(rs),
  'Rust drag attaches to UI thread then SC_MOVE|HTCAPTION'
);
assert(
  /overlay-drag/.test(rs) && /SendMessageW/.test(rs),
  'Win32 drag runs on dedicated thread via SendMessage (no main-thread queue hop)'
);
assert(/overlay_lmb_down/.test(rs), 'aborts drag if LMB already up');
assert(
  !/PostMessageW[\s\S]{0,120}SC_MOVE/.test(rs),
  'does not PostMessage SC_MOVE (laggy / misses button-down)'
);
assert(
  !/app-region:\s*drag/.test(
    fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8')
  ),
  'transparent overlay does not rely on CSS app-region:drag'
);
const conf = fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8');
assert(/"alwaysOnTop":\s*false/.test(conf), 'main window alwaysOnTop false');
assert(/setMinimizedIntent/.test(overlay), 'FE setMinimizedIntent');
assert(/pendingMinimized/.test(overlay), 'FE pendingMinimized');
assert(/minimizedIntentGeneration/.test(overlay), 'FE minimizedIntentGeneration');
assert(
  /if\(pendingMinimized!=null\)/.test(overlay),
  'render skips stale minimized while pending'
);
assert(/endOverlayDrag/.test(overlay), 'endOverlayDrag on up/cancel/blur');
assert(/toggleMiniMatsFold/.test(carry), 'head title toggles materials fold');
assert(
  !/document\.addEventListener\(\s*'pointerdown'[\s\S]{0,200}setMiniMatsOpen\(false\)/.test(carry),
  'mini mats no longer auto-closes on bar pointerdown'
);

// --- Carry mats serialize ---
assert(/matsRailSeq/.test(carry) && /matsRailQueued/.test(carry), 'carry mats sequence + queue');
assert(/flushQueuedMatsRail/.test(carry), 'carry flushes mats after drag');

/** Mirrors FE intent lock for unit-style proof without a DOM. */
function applyMinimizedFromSnap(state, s) {
  if (state.pendingMinimized != null) {
    if (!!s.minimized === !!state.pendingMinimized) {
      state.pendingMinimized = null;
      state.localMinimized = !!s.minimized;
    }
  } else {
    state.localMinimized = !!s.minimized;
  }
  return state.localMinimized;
}
function setIntent(state, target) {
  state.minimizedIntentGeneration++;
  const gen = state.minimizedIntentGeneration;
  const prev = !!state.localMinimized;
  state.pendingMinimized = !!target;
  state.localMinimized = !!target;
  return { gen, prev };
}
function rollbackIntent(state, gen, prev) {
  if (gen !== state.minimizedIntentGeneration) return;
  state.pendingMinimized = null;
  state.localMinimized = prev;
}

{
  const st = { localMinimized: true, pendingMinimized: null, minimizedIntentGeneration: 0 };
  const { gen, prev } = setIntent(st, false);
  assert(st.localMinimized === false && st.pendingMinimized === false, 'intent expands locally');
  assert(applyMinimizedFromSnap(st, { minimized: true }) === false, 'stale mini snap ignored');
  assert(st.pendingMinimized === false, 'pending remains until confirm');
  assert(applyMinimizedFromSnap(st, { minimized: false }) === false, 'confirm clears pending');
  assert(st.pendingMinimized == null, 'pending cleared on confirm');
  rollbackIntent(st, gen, prev); // no-op gen match already cleared — re-test fail path
}
{
  const st = { localMinimized: true, pendingMinimized: null, minimizedIntentGeneration: 0 };
  const { gen, prev } = setIntent(st, false);
  rollbackIntent(st, gen, prev);
  assert(st.localMinimized === true && st.pendingMinimized == null, 'invoke fail rolls back');
}

if (fail) {
  console.error(`\n${fail} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll overlay stability semantics checks passed');
console.log(`
Windows manual checklist (not covered by this script):
1. Drag mini bar while status ticks — no snap-back; release keeps position.
2. Expand continuously under dense snapshots — stays full; invoke fail restores mini.
3. Open/close materials during/after drag — no origin jump; final state matches last click.
4. needs_input FG → leave → return — pad clickable/draggable (no HWND pass-through stuck).
5. Soft dismiss (X) vs settings gate vs host FG — check codex_overlay hide_class in logs.
`);
