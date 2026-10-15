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
  'NCLBUTTONDOWN latches paint de-load before modal move loop'
);
{
  const early = layout.match(
    /fn early_pause_camera_before_sizemove\([\s\S]*?\nfn /
  )?.[0] || '';
  assert(
    /MAIN_SIZEMOVE_ACTIVE\.store\(true/.test(early) &&
      /MAIN_EARLY_PAUSE_PENDING\.store\(true/.test(early),
    'NCL atomics-latches sizemove before ENTERSIZEMOVE'
  );
  assert(
    !/eval_ot_drag_active\s*\(/.test(early) && !/\bwin\.eval\s*\(/.test(early),
    'NCL has no sync win.eval / ot-drag-active (busy WebView teleports first move)'
  );
  assert(
    !/emit_camera_frame_pump/.test(early) && !/emit_drag_trace/.test(early),
    'NCL has no camera pause / drag_trace (Soft Pad: nothing before movement)'
  );
  assert(
    !/async_runtime::spawn/.test(early),
    'NCL has no spawn (drag_trace eval raced ahead of ENTER)'
  );
}
assert(
  /fn main_camera_pause_owned/.test(layout),
  'main_camera_pause_owned for Soft Pad finish (do not resume mid-settle)'
);
assert(
  /MAIN_OT_DRAG_CLASS_ON/.test(layout) &&
    /already on/.test(layout),
  'ot-drag-active eval skips when class already latched (rapid re-grab)'
);
{
  const enter = layout.match(
    /fn set_main_sizemove_active\([\s\S]*?\nfn schedule_main_drag_settle/
  )?.[0] || '';
  assert(
    /async_runtime::spawn/.test(enter) &&
      /ncl_down/.test(enter) &&
      /enter_sizemove/.test(enter) &&
      /emit_camera_frame_pump\(&app,\s*true\)/.test(enter),
    'ENTERSIZEMOVE async-spawns ncl_down+enter+camera (Soft Pad order)'
  );
  assert(
    /MAIN_SIZEMOVE_ACTIVE\.load[\s\S]{0,120}?emit_camera_frame_pump\(&app,\s*true\)/.test(
      enter
    ) ||
      /if !MAIN_SIZEMOVE_ACTIVE\.load[\s\S]{0,200}?emit_camera_frame_pump/.test(enter),
    'ENTER async skips camera pause if EXIT already cleared sizemove (short-flick)'
  );
  const enterSync = enter.replace(
    /tauri::async_runtime::spawn\(async move \{[\s\S]*?\}\);/g,
    ''
  );
  assert(
    !/emit_camera_frame_pump\(&app,\s*true\)/.test(enterSync),
    'ENTERSIZEMOVE sync path does not camera-pause (lets modal loop start)'
  );
}
assert(
  /had \|\| class_on|class_on[\s\S]{0,80}?schedule_main_drag_settle/.test(layout),
  'EXIT schedules settle when class on even if camera pause never landed'
);
assert(
  /fn eval_ot_drag_active/.test(layout) &&
    /classList\.remove\('ot-drag-active'\)/.test(layout),
  'paint restore eval removes ot-drag-active (does not rely on drag_trace FE listener)'
);
assert(
  /MAIN_RESUME_GEN/.test(layout) &&
    /fn schedule_main_drag_settle/.test(layout) &&
    /MAIN_CAMERA_RESUME_MS/.test(layout) &&
    /MAIN_PAINT_RESTORE_MS/.test(layout),
  'EXITSIZEMOVE splits camera resume from delayed paint restore'
);
{
  const settle = layout.match(
    /fn schedule_main_drag_settle\([\s\S]*?\nfn /
  )?.[0] || '';
  assert(
    /emit_camera_frame_pump\(&app_cam,\s*false\)/.test(settle) &&
      !/eval_ot_drag_active\(&app_cam,\s*false\)/.test(settle),
    'camera resume path does not strip ot-drag-active'
  );
  assert(
    /eval_ot_drag_active\(&app_paint,\s*false\)/.test(settle) &&
      /paint_restore/.test(settle),
    'paint_restore path strips ot-drag-active after MAIN_PAINT_RESTORE_MS'
  );
  assert(
    /eval_flush_to_js\(&app_flush\)/.test(settle) &&
      /to_js_flush/.test(settle) &&
      /MAIN_TO_JS_FLUSH_MS/.test(settle),
    'settle flushes to_js after paint restore (staggered)'
  );
  assert(
    /MAIN_CAMERA_RESUME_MS[\s\S]*?MAIN_PAINT_RESTORE_MS|from_millis\(MAIN_CAMERA_RESUME_MS\)[\s\S]*?from_millis\(MAIN_PAINT_RESTORE_MS\)/.test(
      settle
    ),
    'settle waits camera then paint restore delays'
  );
}
{
  const exitArm = layout.match(
    /exit_sizemove[\s\S]{0,400}?schedule_main_drag_settle/
  );
  assert(!!exitArm, 'exit_sizemove schedules drag settle (no sync emit_camera_frame_pump false)');
}
{
  const resumeEval = layout.match(
    /"try\{window\.OneToneCameraFramePump&&OneToneCameraFramePump\.resume\(\)\}catch\(e\)\{\}"/
  );
  assert(
    !!resumeEval,
    'camera resume eval does not remove ot-drag-active in the same script'
  );
}
const dragPerf = fs.readFileSync(
  path.join(root, 'src/js/core/window-drag-perf.js'),
  'utf8'
);
assert(
  /OFF_DEBOUNCE_MS\s*=\s*1000/.test(dragPerf) &&
    /exit_sizemove/.test(dragPerf) &&
    /paint_restore/.test(dragPerf),
  'FE keeps ot-drag-active across exit; clears on paint_restore (~1000ms)'
);
assert(
  /MAIN_PAINT_RESTORE_MS:\s*u64\s*=\s*1000/.test(layout) &&
    /MAIN_CAMERA_RESUME_MS:\s*u64\s*=\s*600/.test(layout) &&
    /MAIN_TO_JS_FLUSH_MS:\s*u64\s*=\s*1100/.test(layout),
  'settle: camera 600 → paint 1000 → flush 1100 (consecutive 二次保护)'
);
assert(
  /fn eval_flush_to_js/.test(layout) &&
    /to_js_flush/.test(layout),
  'to_js flush is separate from ot-drag-active clear'
);
{
  const off = layout.match(
    /fn eval_ot_drag_active[\s\S]*?\nfn eval_flush_to_js/
  )?.[0] || '';
  assert(
    /classList\.remove\('ot-drag-active'\)/.test(off) &&
      !/__vp_flush_to_js__/.test(off),
    'paint clear eval does not flush to_js in the same script'
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
  /emit_camera_frame_pump[\s\S]{0,500}?eval_ot_drag_active\(app,\s*true\)/.test(layout) ||
    /fn emit_camera_frame_pump[\s\S]*?eval_ot_drag_active\(app,\s*true\)/.test(layout),
  'camera pause latches ot-drag-active via eval_ot_drag_active (atomic-gated)'
);
assert(
  /main_camera_pause_owned|main_window_drag_active/.test(overlay) &&
    /OVERLAY_CAMERA_PAUSE_SENT[\s\S]{0,400}?main_owns|main_owns[\s\S]{0,200}?emit_camera_frame_pump/.test(
      overlay
    ),
  'Soft Pad finish skips camera resume while main owns pause/settle'
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

const appCss = fs.readFileSync(path.join(root, 'src/css/app.css'), 'utf8');
assert(
  !/html\.ot-drag-active \*,\s*\nhtml\.ot-drag-active \*::before/.test(appCss),
  'ot-drag-active no longer uses universal * (avoids 4k-node style recalc)'
);
assert(
  /html\.ot-drag-active \.settings-page/.test(appCss) &&
    /html\.ot-drag-active \.settings-shell/.test(appCss),
  'ot-drag-active de-load scoped to settings surfaces'
);
assert(
  /html\.ot-drag-active \.home-center/.test(appCss) &&
    /html\.ot-drag-active \.now-home/.test(appCss) &&
    !/html\.ot-drag-active \.home-center \*/.test(appCss),
  'ot-drag-active home/Now root-only (no * — avoids grab recalc)'
);
assert(
  !/html\.ot-drag-active[^\{]*\{[^\}]*content-visibility:\s*hidden/.test(appCss),
  'ot-drag-active must not content-visibility:hidden home (blanked desk mid-drag)'
);
{
  const wakeJs = fs.readFileSync(path.join(root, 'src/js/features/voice/voice-wake.js'), 'utf8');
  assert(
    /function mainWindowDragActive/.test(wakeJs) &&
      /ot-drag-active/.test(wakeJs) &&
      /if\(mainWindowDragActive\(\)\) return/.test(wakeJs),
    'voice status poll skips while main title-bar drag active'
  );
  const nowHomeJs = fs.readFileSync(path.join(root, 'src/js/features/now/now-home.js'), 'utf8');
  assert(
    /function paint\(\)\{[\s\S]{0,120}?mainWindowDragActive/.test(nowHomeJs) ||
      /function paint\(\) \{[\s\S]{0,160}?mainWindowDragActive/.test(nowHomeJs),
    'Now paint skips remount while main title-bar drag active'
  );
  const drawerJs = fs.readFileSync(
    path.join(root, 'src/js/features/settings/settings-drawer.js'),
    'utf8'
  );
  assert(
    /Flip panel visibility FIRST/.test(drawerJs) &&
      /syncSettingsChrome\(\);\s*\n\s*\n\s*\/\/ Pause MediaPipe/.test(drawerJs),
    'openDrawer shows chrome before panel body; setSettingsPanel flips visibility first'
  );
  assert(
    /Cold stopped: home is push-to-listen/.test(wakeJs) ||
      (/st==='stopped'\) return/.test(wakeJs) && /push-to-listen|开始听写/.test(wakeJs)),
    'maybeNudge must not cold-start Vosk from stopped on home'
  );
}
{
  const wb = fs.readFileSync(path.join(root, 'src/js/features/home/home-workbench.js'), 'utf8');
  assert(
    /ensureHomeVoiceEngineIfMismatch/.test(wb) &&
      !/ensureHomeVoiceListening\(\{force:force\}\)/.test(wb) &&
      !/ensureHomeVoiceListening\(\{force:!homeVoiceBootstrapped\}\)/.test(wb),
    'home render must not force-start listening on bootstrap'
  );
}
const homeV9 = fs.readFileSync(path.join(root, 'src/css/home-v9.css'), 'utf8');
assert(
  /\.vp-statusbar\{[\s\S]{0,400}?backdrop-filter:\s*none/.test(homeV9),
  'home-v9 statusbar has no glass blur'
);

if (fail) {
  console.error(`\n${fail} assertion(s) failed`);
  process.exit(1);
}
console.log('\nAll main-window drag semantics checks passed');
