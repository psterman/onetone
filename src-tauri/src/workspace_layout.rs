use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::app_identity::{self, AppIdentity};
use crate::config::{WorkspaceAnchorMatch, WorkspaceLayoutConfig, WorkspaceLayoutSlot};
use crate::gaze_monitor::{self, find_monitor_by_id, find_monitor_for_point, MonitorInfo};
use crate::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceWindowView {
    pub hwnd: String,
    pub display_name: String,
    pub process_name: String,
    pub full_path: String,
    pub title: String,
    pub class_name: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub monitor_id: String,
    pub z_order: u32,
    pub icon_data_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceApplyResult {
    pub ok: bool,
    pub layout_id: String,
    pub layout_name: String,
    pub restored_count: u32,
    pub failed: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSnapshotArgs {
    pub name: Option<String>,
    pub id: Option<String>,
    pub anchor_app: Option<String>,
    pub auto_apply: Option<bool>,
    pub include_hwnds: Option<Vec<String>>,
}

#[derive(Debug, Clone)]
struct AutoApplyState {
    pending_layout_id: String,
    pending_anchor: String,
    pending_since: Instant,
    last_layout_id: String,
    last_apply_at: Option<Instant>,
    last_manual_move_at: Option<Instant>,
}

fn auto_state() -> &'static Mutex<AutoApplyState> {
    static CELL: OnceLock<Mutex<AutoApplyState>> = OnceLock::new();
    CELL.get_or_init(|| {
        Mutex::new(AutoApplyState {
            pending_layout_id: String::new(),
            pending_anchor: String::new(),
            pending_since: Instant::now(),
            last_layout_id: String::new(),
            last_apply_at: None,
            last_manual_move_at: None,
        })
    })
}

fn now_unix_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn clamp_pct(v: f64, fallback: f64) -> f64 {
    if v.is_finite() {
        v.clamp(0.0, 1.0)
    } else {
        fallback
    }
}

fn match_anchor(anchor: &WorkspaceAnchorMatch, fg: &AppIdentity) -> bool {
    let want = exe_basename(&anchor.process_name);
    if want.is_empty() {
        return false;
    }
    if exe_basename(&fg.exe_name) != want {
        return false;
    }
    let title_need = anchor.title_contains.trim().to_ascii_lowercase();
    title_need.is_empty() || fg.window_title.to_ascii_lowercase().contains(&title_need)
}

fn monitor_rect_for_slot(slot: &WorkspaceLayoutSlot, monitor: &MonitorInfo) -> (i32, i32, i32, i32) {
    let width = ((monitor.width as f64) * clamp_pct(slot.w_pct, 0.5)).round() as i32;
    let height = ((monitor.height as f64) * clamp_pct(slot.h_pct, 0.5)).round() as i32;
    let width = width.max(80);
    let height = height.max(80);
    let x = monitor.x + ((monitor.width as f64) * clamp_pct(slot.x_pct, 0.0)).round() as i32;
    let y = monitor.y + ((monitor.height as f64) * clamp_pct(slot.y_pct, 0.0)).round() as i32;
    let max_x = monitor.x + monitor.width as i32 - width;
    let max_y = monitor.y + monitor.height as i32 - height;
    (x.clamp(monitor.x, max_x.max(monitor.x)), y.clamp(monitor.y, max_y.max(monitor.y)), width, height)
}

fn exe_basename(name: &str) -> String {
    name.rsplit(['\\', '/'])
        .next()
        .unwrap_or(name)
        .to_ascii_lowercase()
}

fn is_noise_workspace_process(exe: &str) -> bool {
    matches!(
        exe_basename(exe).as_str(),
        "applicationframehost.exe"
            | "systemsettings.exe"
            | "textinputhost.exe"
            | "shellexperiencehost.exe"
            | "searchhost.exe"
            | "startmenuexperiencehost.exe"
            | "searchapp.exe"
            | "runtimebroker.exe"
            | "dwm.exe"
            | "explorer.exe"
            | "onetone.exe"
            | "securityhealthsystray.exe"
            | "lockapp.exe"
            | "taskmgr.exe"
            | "logioptionsui.exe"
            | "logioptions.exe"
            | "widgets.exe"
            | "widgetservice.exe"
    )
}

/// Tiny tray / badge windows (e.g. 160×28) are not layout slots.
fn is_tiny_workspace_window(width: u32, height: u32, iconic: bool) -> bool {
    if iconic {
        return false;
    }
    width < 120 || height < 80 || (width as u64) * (height as u64) < 40_000
}

fn exe_stem(name: &str) -> String {
    let base = exe_basename(name);
    base.strip_suffix(".exe").unwrap_or(&base).to_string()
}

fn process_names_equal(a: &str, b: &str) -> bool {
    let sa = exe_stem(a);
    let sb = exe_stem(b);
    !sa.is_empty() && sa == sb
}

fn slot_skip_label(slot: &WorkspaceLayoutSlot) -> String {
    let p = slot.process_name.trim();
    if !p.is_empty() {
        p.to_string()
    } else if !slot.display_name.trim().is_empty() {
        slot.display_name.trim().to_string()
    } else {
        "window".into()
    }
}

#[cfg(windows)]
fn hwnd_to_string(hwnd: winapi::shared::windef::HWND) -> String {
    format!("{}", hwnd as isize)
}

#[cfg(windows)]
fn parse_hwnd(raw: &str) -> Option<winapi::shared::windef::HWND> {
    raw.trim()
        .parse::<isize>()
        .ok()
        .map(|v| v as winapi::shared::windef::HWND)
}

#[cfg(windows)]
fn top_level_windows() -> Vec<WorkspaceWindowView> {
    use winapi::shared::minwindef::{BOOL, LPARAM, TRUE};
    use winapi::shared::windef::{HWND, RECT};
    use winapi::um::processthreadsapi::GetCurrentProcessId;
    use winapi::um::winuser::{
        EnumWindows, GetWindow, GetWindowLongW, GetWindowPlacement, GetWindowRect,
        GetWindowThreadProcessId, IsIconic, IsWindow, IsWindowVisible, GWL_EXSTYLE, GW_OWNER,
        WINDOWPLACEMENT, WS_EX_TOOLWINDOW,
    };

    #[derive(Clone)]
    struct RawWin {
        hwnd: HWND,
        rect: RECT,
        z_order: u32,
    }

    unsafe extern "system" fn enum_cb(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let list = &mut *(lparam as *mut Vec<RawWin>);
        if IsWindow(hwnd) == 0 {
            return TRUE;
        }
        let iconic = IsIconic(hwnd) != 0;
        // Minimized windows still count for restore matching (apply does SW_RESTORE).
        if !iconic && IsWindowVisible(hwnd) == 0 {
            return TRUE;
        }
        if !GetWindow(hwnd, GW_OWNER).is_null() {
            return TRUE;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if (ex & WS_EX_TOOLWINDOW) != 0 {
            return TRUE;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || pid == GetCurrentProcessId() {
            return TRUE;
        }
        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return TRUE;
        }
        // Minimized windows report ~(-32000,-32000); use restored placement rect instead.
        if iconic {
            let mut place: WINDOWPLACEMENT = std::mem::zeroed();
            place.length = std::mem::size_of::<WINDOWPLACEMENT>() as u32;
            if GetWindowPlacement(hwnd, &mut place) != 0 {
                rect = place.rcNormalPosition;
            }
        } else if rect.left < -10_000 || rect.top < -10_000 {
            // Non-minimized extreme off-screen ghosts (tray helpers).
            return TRUE;
        }
        let width = rect.right.saturating_sub(rect.left);
        let height = rect.bottom.saturating_sub(rect.top);
        if !iconic && (width < 80 || height < 60) {
            return TRUE;
        }
        // Do not SendMessage/GetWindowText inside EnumWindows — Chromium (Cursor)
        // titles are filled later via identity_for_window.
        list.push(RawWin {
            hwnd,
            rect,
            z_order: list.len() as u32,
        });
        TRUE
    }

    let mut raw = Vec::<RawWin>::new();
    unsafe {
        EnumWindows(Some(enum_cb), &mut raw as *mut _ as LPARAM);
    }
    raw.sort_by_key(|w| w.z_order);
    raw.into_iter()
        .filter_map(|w| {
            let ident = app_identity::identity_for_window(w.hwnd)?;
            if is_noise_workspace_process(&ident.exe_name) {
                return None;
            }
            let iconic = unsafe { IsIconic(w.hwnd) != 0 };
            let width = (w.rect.right - w.rect.left).max(1) as u32;
            let height = (w.rect.bottom - w.rect.top).max(1) as u32;
            if is_tiny_workspace_window(width, height, iconic) {
                return None;
            }
            // Minimized Cursor may have empty title briefly; keep by process alone.
            if !iconic && ident.window_title.trim().is_empty() && width < 200 {
                return None;
            }
            let full_path = ident.full_path.clone().unwrap_or_default();
            let icon = app_identity::icon_data_url_for_path(ident.full_path.as_deref());
            Some(WorkspaceWindowView {
                hwnd: hwnd_to_string(w.hwnd),
                display_name: app_identity::identity_display_name(&ident),
                process_name: ident.exe_name.clone(),
                full_path,
                title: ident.window_title.clone(),
                class_name: ident.window_class.unwrap_or_default(),
                x: w.rect.left,
                y: w.rect.top,
                width,
                height,
                monitor_id: String::new(),
                z_order: w.z_order,
                icon_data_url: icon,
            })
        })
        .collect()
}

#[cfg(not(windows))]
fn top_level_windows() -> Vec<WorkspaceWindowView> {
    vec![]
}

pub fn list_windows() -> Vec<WorkspaceWindowView> {
    top_level_windows()
}

fn is_self_identity(id: &AppIdentity) -> bool {
    if exe_basename(&id.exe_name) == "onetone.exe" {
        return true;
    }
    #[cfg(windows)]
    unsafe {
        if id.pid != 0 && id.pid == winapi::um::processthreadsapi::GetCurrentProcessId() {
            return true;
        }
    }
    false
}

fn anchor_preference_score(process_name: &str) -> i32 {
    let n = exe_basename(process_name);
    if n == "cursor.exe" {
        100
    } else if n == "code.exe" || n == "devenv.exe" || n == "windsurf.exe" {
        80
    } else if n.contains("chrome") || n.contains("msedge") || n.contains("firefox") {
        15
    } else if n.contains("typeless") || n.contains("notepad") {
        1
    } else {
        10
    }
}

fn identity_from_view(w: &WorkspaceWindowView) -> Option<AppIdentity> {
    #[cfg(windows)]
    {
        return parse_hwnd(&w.hwnd).and_then(app_identity::identity_for_window);
    }
    #[cfg(not(windows))]
    {
        let _ = w;
        None
    }
}

fn preferred_anchor_among(windows: &[WorkspaceWindowView]) -> Option<AppIdentity> {
    if let Some(id) = app_identity::foreground_app_identity() {
        if !is_self_identity(&id) {
            return Some(id);
        }
    }
    #[cfg(windows)]
    {
        let hwnd = crate::keyboard::last_external_hwnd();
        if hwnd != 0 {
            if let Some(ext) =
                app_identity::identity_for_window(hwnd as winapi::shared::windef::HWND)
            {
                if !is_self_identity(&ext) && anchor_preference_score(&ext.exe_name) >= 80 {
                    return Some(ext);
                }
            }
        }
    }
    let mut best: Option<&WorkspaceWindowView> = None;
    let mut best_score = i32::MIN;
    for w in windows {
        if is_noise_workspace_process(&w.process_name) {
            continue;
        }
        if exe_basename(&w.process_name) == "onetone.exe" {
            continue;
        }
        let score = anchor_preference_score(&w.process_name) * 1000 - (w.z_order as i32);
        if score > best_score {
            best_score = score;
            best = Some(w);
        }
    }
    let Some(w) = best else {
        return None;
    };
    #[cfg(windows)]
    if let Some(hwnd) = parse_hwnd(&w.hwnd) {
        crate::keyboard::note_last_external_hwnd(hwnd as isize);
    }
    identity_from_view(w)
}

fn preferred_anchor_identity() -> Option<AppIdentity> {
    preferred_anchor_among(&top_level_windows())
}

pub fn snapshot_current_layout(
    app: &AppHandle,
    args: WorkspaceSnapshotArgs,
) -> Result<WorkspaceLayoutConfig, String> {
    let topology = gaze_monitor::list_monitors_from_tauri(app)?;
    let mut windows = top_level_windows();
    for w in windows.iter_mut() {
        if w.monitor_id.is_empty() {
            if let Some(m) = find_monitor_for_point(
                &topology.monitors,
                w.x + (w.width / 2) as i32,
                w.y + (w.height / 2) as i32,
            ) {
                w.monitor_id = m.id.clone();
            }
        }
    }
    if windows.is_empty() {
        return Err("no_windows".into());
    }
    let wanted = args
        .anchor_app
        .as_ref()
        .map(|s| s.trim())
        .filter(|s| !s.is_empty());
    let fg = if let Some(want) = wanted {
        windows
            .iter()
            .find(|w| process_names_equal(&w.process_name, want))
            .and_then(identity_from_view)
            .or_else(|| preferred_anchor_among(&windows))
    } else {
        preferred_anchor_among(&windows)
    }
    .ok_or_else(|| "no_foreground_app".to_string())?;
    let include = args.include_hwnds.unwrap_or_default();
    let include_all = include.is_empty();
    let mut slots = Vec::new();
    let mut companions = Vec::new();
    for w in windows {
        if is_noise_workspace_process(&w.process_name) {
            continue;
        }
        if !include_all && !include.iter().any(|x| x == &w.hwnd) {
            continue;
        }
        let monitor = find_monitor_by_id(&topology.monitors, &w.monitor_id)
            .or_else(|| {
                find_monitor_for_point(
                    &topology.monitors,
                    w.x + (w.width / 2) as i32,
                    w.y + (w.height / 2) as i32,
                )
            })
            .or_else(|| topology.monitors.iter().find(|m| m.primary))
            .or_else(|| topology.monitors.first());
        let Some(monitor) = monitor else { continue };
        let rel_x = (w.x - monitor.x).max(0) as f64 / (monitor.width.max(1) as f64);
        let rel_y = (w.y - monitor.y).max(0) as f64 / (monitor.height.max(1) as f64);
        let rel_w = (w.width as f64) / (monitor.width.max(1) as f64);
        let rel_h = (w.height as f64) / (monitor.height.max(1) as f64);
        if !process_names_equal(&w.process_name, &fg.exe_name) {
            companions.push(w.process_name.clone());
        }
        slots.push(WorkspaceLayoutSlot {
            hwnd: w.hwnd,
            display_name: w.display_name,
            process_name: w.process_name,
            title_contains: w.title,
            class_name: w.class_name,
            full_path: w.full_path,
            monitor_id: monitor.id.clone(),
            x: w.x,
            y: w.y,
            width: w.width,
            height: w.height,
            x_pct: clamp_pct(rel_x, 0.0),
            y_pct: clamp_pct(rel_y, 0.0),
            w_pct: clamp_pct(rel_w, 0.5),
            h_pct: clamp_pct(rel_h, 0.5),
            show_state: "normal".into(),
            z_order: w.z_order,
            required: false,
        });
    }
    if slots.is_empty() {
        return Err("no_windows_selected".into());
    }
    companions.sort();
    companions.dedup();
    let anchor_app = args
        .anchor_app
        .unwrap_or_else(|| fg.exe_name.clone())
        .trim()
        .to_string();
    let mut name = args.name.unwrap_or_default().trim().to_string();
    if name.is_empty() {
        name = format!("{} 工作区", app_identity::identity_display_name(&fg));
    }
    Ok(WorkspaceLayoutConfig {
        id: args
            .id
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("wl-{}", now_unix_ms())),
        name,
        saved_at: now_unix_ms(),
        monitor_fingerprint: topology.fingerprint,
        auto_apply: if args.auto_apply.unwrap_or(false) {
            "onEnterAnchorApp".into()
        } else {
            String::new()
        },
        anchor_app: anchor_app.clone(),
        companion_apps: companions,
        anchor_match: WorkspaceAnchorMatch {
            process_name: anchor_app,
            title_contains: String::new(),
        },
        debounce_ms: 1000,
        cooldown_ms: 30000,
        skip_if_user_dragging: true,
        slots,
    })
}

#[cfg(windows)]
fn move_resize_window(hwnd: winapi::shared::windef::HWND, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    use winapi::um::winuser::{
        IsIconic, IsWindow, IsZoomed, SetWindowPos, ShowWindow, SWP_NOACTIVATE, SWP_NOZORDER,
        SW_RESTORE,
    };
    if hwnd.is_null() || unsafe { IsWindow(hwnd) } == 0 {
        return Err("invalid_hwnd".into());
    }
    unsafe {
        if IsZoomed(hwnd) != 0 || IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        let ok = SetWindowPos(
            hwnd,
            std::ptr::null_mut(),
            x,
            y,
            width,
            height,
            SWP_NOZORDER | SWP_NOACTIVATE,
        );
        if ok == 0 {
            return Err("move_failed".into());
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn move_resize_window(_hwnd: isize, _x: i32, _y: i32, _width: i32, _height: i32) -> Result<(), String> {
    Err("unsupported_platform".into())
}

#[cfg(windows)]
fn shell_open_path(path: &str) -> bool {
    use std::os::windows::ffi::OsStrExt;
    use std::ptr::null_mut;
    let wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let rc = unsafe {
        winapi::um::shellapi::ShellExecuteW(
            null_mut(),
            null_mut(),
            wide.as_ptr(),
            null_mut(),
            null_mut(),
            winapi::um::winuser::SW_SHOWNORMAL,
        ) as isize
    };
    rc > 32
}

#[cfg(not(windows))]
fn shell_open_path(_path: &str) -> bool {
    false
}

fn launch_slot(slot: &WorkspaceLayoutSlot) -> bool {
    if is_noise_workspace_process(&slot.process_name) {
        return false;
    }
    let path = slot.full_path.trim();
    if path.is_empty() || !std::path::Path::new(path).exists() {
        return false;
    }
    let name = slot.process_name.as_str();
    if app_identity::process_running_by_exe(&[name]) {
        return false;
    }
    shell_open_path(path)
}

fn wait_for_launched(slots: &[&WorkspaceLayoutSlot], timeout: Duration) {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        let any_up = slots.iter().any(|slot| {
            let name = slot.process_name.as_str();
            !name.is_empty() && app_identity::process_running_by_exe(&[name])
        });
        if any_up {
            std::thread::sleep(Duration::from_millis(250));
            return;
        }
        std::thread::sleep(Duration::from_millis(100));
    }
}

/// Manual restore may launch missing apps; auto-enter path should pass `false`.
pub fn apply_layout_config(
    app: &AppHandle,
    state: &Arc<AppState>,
    layout: &WorkspaceLayoutConfig,
    launch_missing: bool,
) -> Result<WorkspaceApplyResult, String> {
    apply_layout_config_inner(app, state, layout, launch_missing)
}

fn apply_layout_config_inner(
    app: &AppHandle,
    state: &Arc<AppState>,
    layout: &WorkspaceLayoutConfig,
    launch_missing: bool,
) -> Result<WorkspaceApplyResult, String> {
    let topology = gaze_monitor::list_monitors_from_tauri(app)?;
    let available = top_level_windows();
    let mut restored = 0u32;
    let mut failed = Vec::new();
    let mut skipped = Vec::new();
    let mut unmatched: Vec<&WorkspaceLayoutSlot> = Vec::new();
    let mut anchor_hwnd = String::new();
    let mut used = std::collections::HashSet::new();
    for slot in &layout.slots {
        if is_noise_workspace_process(&slot.process_name) {
            continue;
        }
        let title_need = slot.title_contains.trim().to_ascii_lowercase();
        let mut best_idx: Option<usize> = None;
        let mut best_score: i32 = -1;
        if !slot.hwnd.trim().is_empty() {
            if let Some((i, w)) = available.iter().enumerate().find(|(_, w)| w.hwnd == slot.hwnd) {
                if !used.contains(&w.hwnd)
                    && process_names_equal(&w.process_name, &slot.process_name)
                {
                    best_idx = Some(i);
                    best_score = 1000;
                }
            }
        }
        for (i, w) in available.iter().enumerate() {
            if used.contains(&w.hwnd) {
                continue;
            }
            if !process_names_equal(&w.process_name, &slot.process_name) {
                continue;
            }
            let title = w.title.to_ascii_lowercase();
            let score = if title_need.is_empty() {
                10
            } else if title == title_need {
                100
            } else if title.contains(&title_need) || title_need.contains(&title) {
                50
            } else {
                // Same exe still matches even if title drifted (Cursor tab rename, etc.).
                5
            };
            if score > best_score {
                best_score = score;
                best_idx = Some(i);
            }
        }
        let Some(idx) = best_idx else {
            skipped.push(slot_skip_label(slot));
            unmatched.push(slot);
            continue;
        };
        let target = available[idx].clone();
        used.insert(target.hwnd.clone());
        let Some(monitor) = find_monitor_by_id(&topology.monitors, &slot.monitor_id)
            .or_else(|| {
                find_monitor_for_point(
                    &topology.monitors,
                    target.x + (target.width / 2) as i32,
                    target.y + (target.height / 2) as i32,
                )
            })
            .or_else(|| topology.monitors.first())
        else {
            failed.push(format!("{}: monitor_missing", slot_skip_label(slot)));
            continue;
        };
        let (x, y, width, height) = monitor_rect_for_slot(slot, monitor);
        #[cfg(windows)]
        {
            let Some(hwnd) = parse_hwnd(&target.hwnd) else {
                failed.push(format!("{}: invalid_hwnd", slot_skip_label(slot)));
                continue;
            };
            if move_resize_window(hwnd, x, y, width, height).is_err() {
                failed.push(format!("{}: move_failed", slot_skip_label(slot)));
                continue;
            }
            if process_names_equal(&target.process_name, &layout.anchor_match.process_name) {
                anchor_hwnd = target.hwnd.clone();
            }
        }
        #[cfg(not(windows))]
        {
            let _ = (x, y, width, height, state);
            failed.push(format!("{}: unsupported_platform", slot_skip_label(slot)));
            continue;
        }
        restored += 1;
    }
    if launch_missing && !unmatched.is_empty() {
        let launchable: Vec<&WorkspaceLayoutSlot> = unmatched
            .iter()
            .copied()
            .filter(|s| !is_noise_workspace_process(&s.process_name) && !s.full_path.trim().is_empty())
            .collect();
        let mut launched_any = false;
        for slot in &launchable {
            if launch_slot(slot) {
                launched_any = true;
            }
        }
        if launched_any {
            wait_for_launched(&launchable, Duration::from_millis(2000));
            return apply_layout_config_inner(app, state, layout, false);
        }
    }
    #[cfg(windows)]
    if !anchor_hwnd.is_empty() {
        if let Some(hwnd) = parse_hwnd(&anchor_hwnd) {
            let _ = crate::keyboard::focus_window(hwnd);
        } else {
            let _ = crate::keyboard::restore_external_foreground();
        }
    }
    crate::coach_hud::push_state(app, state.as_ref());
    Ok(WorkspaceApplyResult {
        ok: restored > 0 && failed.is_empty(),
        layout_id: layout.id.clone(),
        layout_name: layout.name.clone(),
        restored_count: restored,
        failed,
        skipped,
    })
}

pub fn apply_layout_id(
    app: &AppHandle,
    state: &Arc<AppState>,
    layout_id: &str,
) -> Result<WorkspaceApplyResult, String> {
    let layout = {
        let cfg = state.cfg.lock();
        cfg.workspace_layouts
            .iter()
            .find(|x| x.id == layout_id)
            .cloned()
            .ok_or_else(|| "layout_not_found".to_string())?
    };
    apply_layout_config(app, state, &layout, true)
}

pub fn apply_for_foreground_anchor(
    app: &AppHandle,
    state: &Arc<AppState>,
) -> Result<WorkspaceApplyResult, String> {
    let fg = preferred_anchor_identity().ok_or_else(|| "no_foreground_app".to_string())?;
    let layout = {
        let cfg = state.cfg.lock();
        cfg.workspace_layouts
            .iter()
            .find(|x| match_anchor(&x.anchor_match, &fg))
            .cloned()
            .ok_or_else(|| "layout_not_found".to_string())?
    };
    apply_layout_config(app, state, &layout, true)
}

pub fn upsert_layout(state: &Arc<AppState>, mut layout: WorkspaceLayoutConfig) -> WorkspaceLayoutConfig {
    {
        let mut cfg = state.cfg.lock();
        if layout.id.trim().is_empty() {
            layout.id = format!("wl-{}", now_unix_ms());
        }
        if layout.auto_apply == "onEnterAnchorApp" {
            let key = layout.anchor_match.process_name.to_ascii_lowercase();
            for other in cfg.workspace_layouts.iter_mut() {
                if other.id != layout.id
                    && other.auto_apply == "onEnterAnchorApp"
                    && other.anchor_match.process_name.to_ascii_lowercase() == key
                {
                    other.auto_apply.clear();
                }
            }
        }
        if let Some(existing) = cfg
            .workspace_layouts
            .iter_mut()
            .find(|x| x.id == layout.id)
        {
            *existing = layout.clone();
        } else {
            cfg.workspace_layouts.push(layout.clone());
        }
        crate::config::normalize_workspace_layouts_pub(&mut cfg.workspace_layouts);
        layout = cfg
            .workspace_layouts
            .iter()
            .find(|x| x.id == layout.id)
            .cloned()
            .unwrap_or(layout);
        crate::config::save_config(&cfg);
    }
    layout
}

pub fn delete_layout(state: &Arc<AppState>, layout_id: &str) -> bool {
    let mut cfg = state.cfg.lock();
    let before = cfg.workspace_layouts.len();
    cfg.workspace_layouts.retain(|x| x.id != layout_id);
    let changed = cfg.workspace_layouts.len() != before;
    if changed {
        crate::config::save_config(&cfg);
    }
    changed
}

pub fn set_auto_apply(state: &Arc<AppState>, layout_id: &str, enabled: bool) -> Result<WorkspaceLayoutConfig, String> {
    let mut cfg = state.cfg.lock();
    let Some(idx) = cfg.workspace_layouts.iter().position(|x| x.id == layout_id) else {
        return Err("layout_not_found".into());
    };
    if enabled {
        let key = cfg.workspace_layouts[idx]
            .anchor_match
            .process_name
            .to_ascii_lowercase();
        for (i, other) in cfg.workspace_layouts.iter_mut().enumerate() {
            if i != idx
                && other.auto_apply == "onEnterAnchorApp"
                && other.anchor_match.process_name.to_ascii_lowercase() == key
            {
                other.auto_apply.clear();
            }
        }
        cfg.workspace_layouts[idx].auto_apply = "onEnterAnchorApp".into();
    } else {
        cfg.workspace_layouts[idx].auto_apply.clear();
    }
    let out = cfg.workspace_layouts[idx].clone();
    crate::config::save_config(&cfg);
    Ok(out)
}

pub fn note_manual_window_move() {
    if let Ok(mut rt) = auto_state().lock() {
        rt.last_manual_move_at = Some(Instant::now());
    }
}

pub fn maybe_auto_apply_for_foreground(app: &AppHandle, state: &Arc<AppState>) {
    let Some(fg) = app_identity::foreground_app_identity() else {
        return;
    };
    let Some(layout) = ({
        let cfg = state.cfg.lock();
        cfg.workspace_layouts
            .iter()
            .find(|x| x.auto_apply == "onEnterAnchorApp" && match_anchor(&x.anchor_match, &fg))
            .cloned()
    }) else {
        if let Ok(mut rt) = auto_state().lock() {
            rt.pending_layout_id.clear();
            rt.pending_anchor.clear();
        }
        return;
    };
    let dragging = if layout.skip_if_user_dragging {
        gaze_monitor::list_monitors_from_tauri(app)
            .ok()
            .and_then(|t| gaze_monitor::get_drag_state(&t).ok())
            .map(|s| s.lmb_down && s.is_title_bar)
            .unwrap_or(false)
    } else {
        false
    };
    if let Ok(mut rt) = auto_state().lock() {
        if let Some(at) = rt.last_manual_move_at {
            if at.elapsed() < Duration::from_secs(5) {
                return;
            }
        }
        let anchor_key = layout.anchor_match.process_name.to_ascii_lowercase();
        if rt.pending_layout_id != layout.id || rt.pending_anchor != anchor_key {
            rt.pending_layout_id = layout.id.clone();
            rt.pending_anchor = anchor_key;
            rt.pending_since = Instant::now();
            return;
        }
        if rt.pending_since.elapsed() < Duration::from_millis(layout.debounce_ms as u64) {
            return;
        }
        if rt
            .last_apply_at
            .is_some_and(|at| rt.last_layout_id == layout.id && at.elapsed() < Duration::from_millis(layout.cooldown_ms as u64))
        {
            return;
        }
        if dragging {
            return;
        }
        // Gate retries even if apply fails (e.g. monitor fingerprint mismatch).
        rt.last_layout_id = layout.id.clone();
        rt.last_apply_at = Some(Instant::now());
    }
    let _ = apply_layout_config(app, state, &layout, false);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WorkspaceLayoutSlot;
    use crate::gaze_monitor::MonitorInfo;

    #[test]
    fn tiny_windows_filtered() {
        assert!(is_tiny_workspace_window(160, 28, false));
        assert!(!is_tiny_workspace_window(750, 500, false));
        assert!(!is_tiny_workspace_window(160, 28, true));
    }

    #[test]
    fn noise_shell_processes_filtered() {
        assert!(is_noise_workspace_process("TextInputHost.exe"));
        assert!(is_noise_workspace_process("C:\\Windows\\SystemSettings.exe"));
        assert!(is_noise_workspace_process("ApplicationFrameHost.exe"));
        assert!(is_noise_workspace_process("Taskmgr.exe"));
        assert!(!is_noise_workspace_process("Cursor.exe"));
        assert!(!is_noise_workspace_process("chrome.exe"));
        assert!(!is_noise_workspace_process("Typeless.exe"));
    }

    #[test]
    fn process_names_equal_basename() {
        assert!(process_names_equal("Cursor.exe", "cursor.exe"));
        assert!(process_names_equal(r"C:\Apps\Cursor.exe", "Cursor.exe"));
        assert!(process_names_equal("Cursor", "Cursor.exe"));
        assert!(!process_names_equal("Cursor.exe", "Code.exe"));
    }

    #[test]
    fn clamp_pct_bounds() {
        assert_eq!(clamp_pct(0.25, 0.0), 0.25);
        assert_eq!(clamp_pct(-1.0, 0.5), 0.0);
        assert_eq!(clamp_pct(2.0, 0.5), 1.0);
        assert_eq!(clamp_pct(f64::NAN, 0.4), 0.4);
    }

    #[test]
    fn monitor_rect_uses_percentages() {
        let monitor = MonitorInfo {
            id: "monitor-0".into(),
            label: "A".into(),
            x: 100,
            y: 50,
            width: 1000,
            height: 800,
            scale_factor: 1.0,
            primary: true,
        };
        let slot = WorkspaceLayoutSlot {
            x_pct: 0.1,
            y_pct: 0.2,
            w_pct: 0.5,
            h_pct: 0.25,
            ..Default::default()
        };
        let (x, y, w, h) = monitor_rect_for_slot(&slot, &monitor);
        assert_eq!((x, y, w, h), (200, 210, 500, 200));
    }

    #[test]
    fn match_anchor_by_process() {
        let anchor = WorkspaceAnchorMatch {
            process_name: "Cursor.exe".into(),
            title_contains: String::new(),
        };
        let fg = AppIdentity {
            pid: 1,
            exe_name: "Cursor.exe".into(),
            full_path: None,
            window_title: "voice-pilot".into(),
            window_class: None,
            matched_preset_app_id: None,
        };
        assert!(match_anchor(&anchor, &fg));
        let miss = AppIdentity {
            exe_name: "chrome.exe".into(),
            ..fg.clone()
        };
        assert!(!match_anchor(&anchor, &miss));
    }
}
