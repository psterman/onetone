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
  /static MAIN_SIZEMOVE_ACTIVE:\s*AtomicBool/.test(layout),
  'MAIN_SIZEMOVE_ACTIVE native latch'
);
assert(
  /WM_ENTERSIZEMOVE/.test(layout) && /WM_EXITSIZEMOVE/.test(layout),
  'ENTER/EXITSIZEMOVE subclass handlers'
);
assert(
  /WM_NCLBUTTONDOWN/.test(layout) && /early_pause_camera_before_sizemove/.test(layout),
  'NCLBUTTONDOWN pauses camera before modal move loop'
);
{
  const early = layout.match(
    /fn early_pause_camera_before_sizemove\([\s\S]*?\nfn /
  )?.[0] || '';
  assert(
    /async_runtime::spawn/.test(early) &&
      /emit_camera_frame_pump/.test(early) &&
      !/emit_camera_frame_pump\(&app,\s*true\);\s*\n\s*\}/.test(
        early.replace(/tauri::async_runtime::spawn\(async move \{[\s\S]*?\}\);/g, '')
      ),
    'NCL early pause async-spawns camera eval (does not sync-block ncl→enter)'
  );
}
assert(
  /\.eval\(script\)/.test(layout) || /win\.eval\(script\)/.test(layout),
  'camera pause uses win.eval (not to_js-only during modal loop)'
);
assert(
  /install_main_sizemove_subclass/.test(layout) &&
    /install_main_sizemove_subclass/.test(lib),
  'startup installs main sizemove subclass'
);
assert(
  !/fn self_capture_drag_active|GetCapture\(\)/.test(layout),
  'no cross-thread GetCapture fallback in window_layout'
);
assert(
  /emit_camera_frame_pump/.test(layout),
  'emit_camera_frame_pump for createImageBitmap pause'
);
assert(
  /sizemove_latch_is_drag_truth/.test(layout),
  'unit test for ENTERSIZEMOVE latch'
);
assert(
  /main_window_drag_active\(\)/.test(overlay) &&
    /fn apply_overlay_payload[\s\S]{0,800}?main_window_drag_active/.test(overlay),
  'apply_overlay_payload defers during main drag'
);
assert(
  /pub fn maybe_tick[\s\S]{0,400}?main_window_drag_active/.test(overlay),
  'maybe_tick early-returns during main drag'
);
assert(
  !/list_monitors[\s\S]{0,80}main_window_drag_active|main_window_drag_active[\s\S]{0,80}WM_NCHITTEST/.test(
    layout
  ),
  'main drag latch does not use list_monitors/NCHITTEST'
);

const framePump = fs.readFileSync(
  path.join(root, 'src/js/features/camera/camera-frame-pump.js'),
  'utf8'
);
const indexHtml = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
assert(/OneToneCameraFramePump/.test(framePump), 'camera frame pump bridge');
assert(/camera_frame_pump/.test(framePump), 'listens for camera_frame_pump to_js');
assert(/muteVideoTracks|getVideoTracks/.test(framePump), 'drag pause mutes webcam tracks');
assert(/pauseForDrag/.test(framePump), 'drag pause stops beauty enhancer loops');
assert(
  /queueMicrotask|scheduleHeavy/.test(framePump) &&
    /paused=true[\s\S]{0,120}?scheduleHeavy|scheduleHeavy[\s\S]{0,200}?applyPause/.test(framePump),
  'camera pause latches then defers heavy mute (NCL must not block ncl→enter)'
);
assert(
  /ot-drag-active/.test(layout) &&
    /classList\.add\('ot-drag-active'\)/.test(layout),
  'camera pause eval also latches ot-drag-active (paint de-load before async drag_trace)'
);
assert(
  /camera-frame-pump\.js/.test(indexHtml),
  'index loads camera-frame-pump after gaze/hand'
);

const dragLag = fs.readFileSync(
  path.join(root, 'src/js/features/debug/drag-lag-panel.js'),
  'utf8'
);
assert(/OneToneDragLagPanel/.test(dragLag), 'drag lag panel export');
assert(/drag_trace/.test(dragLag), 'panel listens for drag_trace');
assert(/raf_jank/.test(dragLag), 'panel records rAF jank during drag');
assert(/drag-lag-panel\.js/.test(indexHtml), 'index loads drag-lag-panel');
assert(/pub fn emit_drag_trace/.test(layout), 'Rust emit_drag_trace');
assert(/ncl_down|enter_sizemove|exit_sizemove/.test(layout), 'main drag phases traced');
assert(
  /overlay_drag_begin/.test(overlay) && /overlay_drag_follow_return/.test(overlay),
  'Soft Pad drag phases traced'
);
assert(
  /emit_camera_frame_pump_before_modal/.test(layout),
  'Soft Pad prepare yields so camera eval lands before drag follow loop'
);
assert(
  /Never both eval and to_js|dual delivery/.test(layout) ||
    (/get_main_window[\s\S]*?win\.eval[\s\S]*?else[\s\S]*?emit_to_main_if_available/.test(layout)),
  'camera pause uses eval XOR to_js (not both — avoids late resume waking camera)'
);
assert(
  /var paused=false|paused\?1:0/.test(framePump),
  'camera frame pump pause is idempotent latch (not nested depth)'
);

if (fail) {
  console.error(`\n${fail} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll main-window drag semantics checks passed');
