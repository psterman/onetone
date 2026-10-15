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
assert(/cmd_codex_micro_overlay_prepare_drag/.test(cmd), 'IPC prepare_drag kept as optional early pause');
assert(/allow-cmd-codex-micro-overlay-note-drag-begin/.test(ipcToml), 'permission allowlist');
assert(/allow-cmd-codex-micro-overlay-prepare-drag/.test(ipcToml), 'prepare_drag permission allowlist');
assert(/pub async fn prepare_overlay_drag/.test(rs), 'prepare_overlay_drag still available');
assert(/OVERLAY_CAMERA_PAUSE_SENT/.test(rs), 'overlay camera pause latch avoids depth+2');
assert(/OVERLAY_DRAG_GEN/.test(rs), 'overlay drag generation guards stale finish');
assert(/overlay_drag_end_stale/.test(rs), 'stale finish does not resume camera mid next drag');
assert(
  /cmd_codex_micro_overlay_start_drag/.test(overlay) &&
    !/prepare_drag[\s\S]{0,120}?start_drag|prepare_drag['\"][\s\S]{0,80}?then\(/.test(overlay),
  'FE fire-and-forget start_drag immediately (no await prepare head-lag)'
);
assert(
  /Duration::from_millis\(1\)/.test(rs) && /fn start_overlay_drag_win32/.test(rs),
  'follow loop samples at ~1ms for short flicks'
);
{
  const startFn = rs.match(
    /pub fn start_overlay_drag[\s\S]*?fn overlay_lmb_down/
  )?.[0] || '';
  const spawnAt = startFn.indexOf('overlay-drag');
  const asyncAt = startFn.indexOf('async_runtime::spawn');
  // Begin-drag eval lives inside async_runtime::spawn (not the finish/error path).
  const asyncBlock = startFn.slice(asyncAt);
  assert(
    /CRITICAL ORDER: spawn follow/.test(rs) &&
      spawnAt >= 0 &&
      asyncAt > spawnAt &&
      /eval_pad_drag_class\(&win_eval,\s*true\)/.test(asyncBlock) &&
      /emit_camera_frame_pump\(win_eval\.app_handle\(\),\s*true\)/.test(asyncBlock),
    'Soft Pad spawns follow then async-posts ot-pad-drag/camera eval (no sync win.eval)'
  );
  assert(
    !/overlay-drag[\s\S]{0,400}?eval_pad_drag_class\(win,\s*true\)/.test(startFn),
    'Soft Pad does not sync-eval ot-pad-drag on the start_drag call stack'
  );
}
assert(
  /fn apply_overlay_no_activate[\s\S]{0,500}?overlay_is_dragging\(\)[\s\S]{0,200}?WS_EX_LAYERED/.test(
    rs
  ),
  'apply_overlay_no_activate skips re-applying LAYERED while Soft Pad dragging'
);
assert(
  /fn set_overlay_click_through_impl[\s\S]{0,400}?if overlay_is_dragging\(\)/.test(rs),
  'click-through impl no-ops while Soft Pad dragging (avoids re-LAYERED)'
);
assert(/cmd_codex_micro_overlay_start_drag/.test(cmd), 'IPC start_drag command');

// --- FE drag + intent ---
assert(/cmd_codex_micro_overlay_start_drag/.test(overlay), 'FE start_drag for Win32 caption');
assert(
  /cmd_codex_micro_overlay_note_drag_begin/.test(overlay) &&
    /note_drag_begin[\s\S]{0,200}?start_drag/.test(overlay) &&
    !/note_drag_begin['\"][\s\S]{0,80}?\.then\(/.test(overlay),
  'FE fire-and-forget note_drag_begin then start_drag (no await latch hop)'
);
assert(/beginOverlayDrag/.test(overlay), 'FE beginOverlayDrag guard');
assert(/MUST NOT await/.test(overlay), 'FE documents fire-and-forget drag IPC');
assert(
  !/addEventListener\('mousedown',\s*beginOverlayDrag/.test(overlay),
  'FE drag binds pointerdown only (no mousedown double-fire)'
);
assert(
  /SetWindowPos/.test(rs) && /GetCursorPos/.test(rs) && /GetWindowRect/.test(rs),
  'Rust Soft Pad drag follows cursor via SetWindowPos (not SC_MOVE modal loop)'
);
assert(
  /overlay-drag/.test(rs) && /overlay_drag_follow_return/.test(rs),
  'Win32 drag runs on dedicated thread with follow-return trace'
);
assert(/overlay_lmb_down/.test(rs), 'aborts drag if LMB already up');
assert(
  !/overlay-drag-wake/.test(rs) &&
    !/SendMessageW\([\s\S]{0,120}?SC_MOVE/.test(rs) &&
    /fn start_overlay_drag_win32[\s\S]{0,800}?SetWindowPos/.test(rs),
  'start_overlay_drag_win32 uses SetWindowPos follow (not SC_MOVE SendMessage)'
);
assert(
  !/\bmouse_event\b/.test(rs) && !/MOUSEEVENTF_MOVE/.test(rs) && !/overlay-drag-nudge/.test(rs),
  'no synthetic mouse_event nudge on Soft Pad drag'
);
assert(
  /run_on_main_thread[\s\S]{0,200}?is_err\(\)/.test(rs) &&
    /clear_overlay_dragging/.test(rs),
  'drag end clears latch even if main-thread queue fails'
);
assert(/fn finish_overlay_drag/.test(rs), 'Rust owns drag end after follow loop');
assert(
  /fn apply_overlay_payload[\s\S]{0,500}?overlay_is_dragging/.test(rs),
  'apply_overlay_payload defers while Soft Pad dragging'
);
assert(
  /pub fn maybe_tick[\s\S]{0,300}?overlay_is_dragging/.test(rs),
  'maybe_tick early-returns while Soft Pad dragging'
);
assert(
  /codex_micro_overlay_drag/.test(rs) && /phase.: .end/.test(rs),
  'Rust emits overlay drag ended for FE UI flag'
);
assert(
  /struct DesiredOverlayGeometry/.test(rs) && /fn commit_overlay_geometry/.test(rs),
  'DesiredOverlayGeometry + single commit entry'
);
assert(
  /SetWindowPos/.test(rs) && /fn set_overlay_hwnd_pos_size/.test(rs),
  'geometry commit uses one SetWindowPos'
);
assert(
  /OVERLAY_PENDING_GEO/.test(rs),
  'geometry queued while dragging'
);
{
  const padCss = fs.readFileSync(path.join(root, 'src/css/codex-micro-overlay.css'), 'utf8');
  assert(!/app-region:\s*drag/.test(padCss), 'transparent overlay does not rely on CSS app-region:drag');
  assert(
    /html\.ot-pad-drag[\s\S]{0,280}?backdrop-filter:\s*none/.test(padCss) &&
      /html\.ot-pad-drag[\s\S]{0,280}?filter:\s*none/.test(padCss),
    'ot-pad-drag kills backdrop-filter/filter during Soft Pad drag (keep colors/shadows)'
  );
}
const conf = fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8');
assert(/"alwaysOnTop":\s*false/.test(conf), 'main window alwaysOnTop false');
assert(/setMinimizedIntent/.test(overlay), 'FE setMinimizedIntent');
assert(/pendingMinimized/.test(overlay), 'FE pendingMinimized');
assert(/minimizedIntentGeneration/.test(overlay), 'FE minimizedIntentGeneration');
assert(
  /if\(pendingMinimized!=null\)/.test(overlay),
  'render skips stale minimized while pending'
);
assert(
  !/addEventListener\('pointercancel',\s*endOverlayDrag/.test(overlay) &&
    !/addEventListener\('blur',\s*endOverlayDrag/.test(overlay),
  'FE does not snap/clear latch on pointercancel/blur'
);
assert(
  /codex_micro_overlay_drag/.test(overlay) && /phase==='end'/.test(overlay),
  'FE clears local dragging from Rust drag-ended event'
);
assert(
  /__onetoneOverlayDragEnd/.test(overlay) && /endOverlayDragFromRust/.test(overlay),
  'FE exposes __onetoneOverlayDragEnd for Rust eval (emit end is unreliable)'
);
{
  const begin = overlay.match(/function beginOverlayDrag\([\s\S]*?\n    \}/)?.[0] || '';
  assert(
    /if\(dragging\)\s*endOverlayDragFromRust\(\)/.test(begin) &&
      !/if\(dragging\)\s*return/.test(begin),
    'stale FE dragging latch clears and continues (no intermittent 失灵 return)'
  );
}
assert(
  /setTimeout\([\s\S]{0,80}?2500\)/.test(overlay),
  'FE drag-end safety watch is 2.5s (not 8s)'
);
assert(
  /__onetoneOverlayDragEnd/.test(rs) &&
    /eval_pad_drag_class[\s\S]{0,400}?__onetoneOverlayDragEnd/.test(rs),
  'Rust finish eval clears FE dragging latch via __onetoneOverlayDragEnd'
);
assert(
  /OVERLAY_DRAG_GEN\.load[\s\S]{0,80}?!= gen[\s\S]{0,200}?eval_pad_drag_class/.test(rs) ||
    /if OVERLAY_DRAG_GEN\.load\(Ordering::SeqCst\) != gen[\s\S]{0,500}?eval_pad_drag_class\(win, false\)/.test(
      rs
    ),
  'stale finish does not eval-clear FE latch / ot-pad-drag of a newer gesture'
);
assert(
  !/cmd_codex_micro_overlay_snap_position/.test(overlay),
  'FE no longer invokes snap_position (Rust owns end)'
);
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
