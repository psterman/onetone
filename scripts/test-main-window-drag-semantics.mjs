/**
 * Main-window drag lag contracts: coalesce layout save; Snap skips self HWND;
 * defer Soft Pad / persist while main title-bar drag is active.
 * Run: node scripts/test-main-window-drag-semantics.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const layout = fs.readFileSync(path.join(root, 'src-tauri/src/window_layout.rs'), 'utf8');
const lib = fs.readFileSync(path.join(root, 'src-tauri/src/lib.rs'), 'utf8');
const gaze = fs.readFileSync(path.join(root, 'src-tauri/src/gaze_monitor.rs'), 'utf8');
const overlay = fs.readFileSync(path.join(root, 'src-tauri/src/codex_micro_overlay.rs'), 'utf8');

let fail = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL', msg);
    fail++;
  } else {
    console.log('PASS', msg);
  }
}

assert(/static SAVE_PENDING:\s*AtomicBool/.test(layout), 'SAVE_PENDING single-worker latch');
assert(
  /if SAVE_PENDING\.swap\(true/.test(layout),
  'schedule_save returns early when worker already armed'
);
assert(
  /pub fn schedule_save\(state: &Arc<AppState>, window: &WebviewWindow\)/.test(layout),
  'schedule_save takes refs (no forced clone on call)'
);
assert(
  /schedule_save\(&state_for_close,\s*&window_clone\)/.test(lib),
  'Moved/Resized passes refs into schedule_save'
);
assert(
  !/schedule_save\(state_for_close\.clone\(\),\s*window_clone\.clone\(\)\)/.test(lib),
  'Moved no longer clones Arc per pixel'
);
assert(
  /schedule_save_coalesces_to_one_spawn/.test(layout),
  'unit test for coalesce gate'
);
assert(
  /Settings open: resize storms/.test(layout),
  'settings-open skip still documented (worker path)'
);

assert(/fn hwnd_belongs_to_self_process/.test(gaze), 'self-process hwnd helper');
assert(
  /hwnd_belongs_to_self_process\(hwnd\)/.test(gaze) &&
    /is_title_bar:\s*false/.test(gaze) &&
    /hwnd:\s*None/.test(gaze),
  'get_drag_state skips Snap for self hwnd without NCHITTEST target'
);
assert(/self_hwnd/.test(gaze), 'move_window_to_monitor rejects self hwnd');

assert(/pub fn note_main_window_moving/.test(layout), 'note_main_window_moving public');
assert(/pub fn main_window_drag_active/.test(layout), 'main_window_drag_active public');
assert(/note_main_window_moving\(\)/.test(layout), 'schedule_save notes moving on hot path');
assert(
  /while main_window_drag_active\(\)/.test(layout),
  'persist worker waits while main drag active'
);
assert(
  /main_window_drag_active\(\)/.test(overlay) &&
    /fn apply_overlay_payload[\s\S]{0,400}?main_window_drag_active/.test(overlay),
  'apply_overlay_payload defers during main drag'
);
assert(
  /pub fn maybe_tick[\s\S]{0,250}?main_window_drag_active/.test(overlay),
  'maybe_tick early-returns during main drag'
);
assert(
  !/list_monitors[\s\S]{0,80}main_window_drag_active|main_window_drag_active[\s\S]{0,80}WM_NCHITTEST/.test(
    layout
  ),
  'main drag latch does not use list_monitors/NCHITTEST'
);

if (fail) {
  console.error(`\n${fail} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll main-window drag semantics checks passed');
