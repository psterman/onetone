use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::AppHandle;

use crate::gaze_monitor::{
    self, CursorPosition, DragState, MonitorTopology, MoveCursorToMonitorArgs,
    MoveWindowToMonitorArgs, PointXy,
};

struct TopoCache {
    at: Instant,
    topo: MonitorTopology,
}

static TOPO_CACHE: Mutex<Option<TopoCache>> = Mutex::new(None);
const TOPO_TTL: Duration = Duration::from_millis(2500);

fn list_monitors_cached(app: &AppHandle) -> Result<MonitorTopology, String> {
    if let Ok(guard) = TOPO_CACHE.lock() {
        if let Some(c) = guard.as_ref() {
            if c.at.elapsed() < TOPO_TTL {
                return Ok(c.topo.clone());
            }
        }
    }
    let topo = gaze_monitor::list_monitors_from_tauri(app)?;
    if let Ok(mut guard) = TOPO_CACHE.lock() {
        *guard = Some(TopoCache {
            at: Instant::now(),
            topo: topo.clone(),
        });
    }
    Ok(topo)
}

#[tauri::command]
pub fn cmd_gaze_list_monitors(app: AppHandle) -> Result<MonitorTopology, String> {
    // Fresh list when UI explicitly asks (setup modal / refresh).
    let topo = gaze_monitor::list_monitors_from_tauri(&app)?;
    if let Ok(mut guard) = TOPO_CACHE.lock() {
        *guard = Some(TopoCache {
            at: Instant::now(),
            topo: topo.clone(),
        });
    }
    Ok(topo)
}

#[tauri::command]
pub fn cmd_gaze_get_cursor_position(app: AppHandle) -> Result<CursorPosition, String> {
    let topology = list_monitors_cached(&app)?;
    gaze_monitor::get_cursor_position(&topology)
}

#[tauri::command]
pub fn cmd_gaze_move_cursor_to_monitor(
    app: AppHandle,
    monitor_id: String,
    preferred: Option<PointXy>,
    fallback: Option<String>,
    flash: Option<bool>,
) -> Result<PointXy, String> {
    let topology = list_monitors_cached(&app)?;
    let args = MoveCursorToMonitorArgs {
        monitor_id,
        preferred,
        fallback,
        flash: flash.unwrap_or(false),
    };
    gaze_monitor::move_cursor_to_monitor(&topology, &args)
}

#[tauri::command]
pub fn cmd_gaze_is_ctrl_down() -> serde_json::Value {
    serde_json::json!({ "down": gaze_monitor::is_ctrl_down() })
}

#[tauri::command]
pub fn cmd_gaze_drag_state(app: AppHandle) -> Result<DragState, String> {
    let topology = list_monitors_cached(&app)?;
    gaze_monitor::get_drag_state(&topology)
}

#[tauri::command]
pub fn cmd_gaze_move_window_to_monitor(
    app: AppHandle,
    hwnd: String,
    monitor_id: String,
) -> Result<PointXy, String> {
    let topology = list_monitors_cached(&app)?;
    let args = MoveWindowToMonitorArgs { hwnd, monitor_id };
    gaze_monitor::move_window_to_monitor(&topology, &args)
}
