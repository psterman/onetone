//! Multi-monitor topology + cursor helpers for Smart Pointer.
//!
//! Coordinate contract (Windows):
//! - `GetCursorPos` / `SetCursorPos` use virtual-desktop **physical** pixels
//!   (origin may be negative when a monitor sits left/above the primary).
//! - Tauri `Monitor::position()` / `size()` are also **physical** pixels.
//! - Do not mix CSS logical / browser `window.screenX` into this path.
//!
//! Monitor ids are MVP-stable as `monitor-{i}` after sorting by `(x, y)`.
//! Callers should persist `fingerprint` with assessments and treat mismatch as stale.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub id: String,
    pub label: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VirtualBounds {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MonitorTopology {
    pub monitors: Vec<MonitorInfo>,
    pub virtual_bounds: VirtualBounds,
    /// Stable string of sorted `x|y|width|height|scaleFactor` tuples.
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CursorPosition {
    pub x: i32,
    pub y: i32,
    pub monitor_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PointXy {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCursorToMonitorArgs {
    pub monitor_id: String,
    pub preferred: Option<PointXy>,
    #[serde(default)]
    pub fallback: Option<String>,
    /// When true (default), flash a brief ring at the land point.
    #[serde(default = "default_false")]
    pub flash: bool,
}

fn default_false() -> bool {
    false
}

/// Sort key for MVP monitor ids: left-to-right, then top-to-bottom.
pub fn sort_monitors_by_origin(mut monitors: Vec<MonitorInfo>) -> Vec<MonitorInfo> {
    monitors.sort_by(|a, b| a.x.cmp(&b.x).then(a.y.cmp(&b.y)));
    for (i, m) in monitors.iter_mut().enumerate() {
        m.id = format!("monitor-{i}");
        if m.label.trim().is_empty() {
            m.label = format!("Display {}", i + 1);
        }
    }
    monitors
}

pub fn topology_fingerprint(monitors: &[MonitorInfo]) -> String {
    monitors
        .iter()
        .map(|m| {
            format!(
                "{}|{}|{}|{}|{:.4}",
                m.x, m.y, m.width, m.height, m.scale_factor
            )
        })
        .collect::<Vec<_>>()
        .join(";")
}

pub fn virtual_bounds_from(monitors: &[MonitorInfo]) -> VirtualBounds {
    if monitors.is_empty() {
        return VirtualBounds {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        };
    }
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    for m in monitors {
        min_x = min_x.min(m.x);
        min_y = min_y.min(m.y);
        max_x = max_x.max(m.x.saturating_add(m.width as i32));
        max_y = max_y.max(m.y.saturating_add(m.height as i32));
    }
    VirtualBounds {
        x: min_x,
        y: min_y,
        width: (max_x - min_x).max(0) as u32,
        height: (max_y - min_y).max(0) as u32,
    }
}

pub fn build_topology(monitors: Vec<MonitorInfo>) -> Result<MonitorTopology, String> {
    if monitors.is_empty() {
        return Err("no_monitors".into());
    }
    let monitors = sort_monitors_by_origin(monitors);
    let fingerprint = topology_fingerprint(&monitors);
    let virtual_bounds = virtual_bounds_from(&monitors);
    Ok(MonitorTopology {
        monitors,
        virtual_bounds,
        fingerprint,
    })
}

pub fn point_in_monitor(x: i32, y: i32, m: &MonitorInfo) -> bool {
    let right = m.x.saturating_add(m.width as i32);
    let bottom = m.y.saturating_add(m.height as i32);
    x >= m.x && y >= m.y && x < right && y < bottom
}

pub fn find_monitor_for_point<'a>(
    monitors: &'a [MonitorInfo],
    x: i32,
    y: i32,
) -> Option<&'a MonitorInfo> {
    monitors.iter().find(|m| point_in_monitor(x, y, m))
}

pub fn find_monitor_by_id<'a>(
    monitors: &'a [MonitorInfo],
    id: &str,
) -> Option<&'a MonitorInfo> {
    monitors.iter().find(|m| m.id == id)
}

pub fn clamp_point_to_monitor(x: i32, y: i32, m: &MonitorInfo) -> PointXy {
    if m.width == 0 || m.height == 0 {
        return PointXy { x: m.x, y: m.y };
    }
    let max_x = m.x.saturating_add(m.width as i32).saturating_sub(1);
    let max_y = m.y.saturating_add(m.height as i32).saturating_sub(1);
    PointXy {
        x: x.clamp(m.x, max_x),
        y: y.clamp(m.y, max_y),
    }
}

pub fn monitor_center(m: &MonitorInfo) -> PointXy {
    PointXy {
        x: m.x.saturating_add((m.width / 2) as i32),
        y: m.y.saturating_add((m.height / 2) as i32),
    }
}

/// Resolve move target: preferred if inside bounds, else center. Always clamp.
pub fn resolve_move_target(m: &MonitorInfo, preferred: Option<&PointXy>) -> PointXy {
    let raw = match preferred {
        Some(p) if point_in_monitor(p.x, p.y, m) => PointXy { x: p.x, y: p.y },
        _ => monitor_center(m),
    };
    clamp_point_to_monitor(raw.x, raw.y, m)
}

pub fn list_monitors_from_tauri(
    app: &tauri::AppHandle,
) -> Result<MonitorTopology, String> {
    let raw = app
        .available_monitors()
        .map_err(|_| "no_monitors".to_string())?;
    if raw.is_empty() {
        return Err("no_monitors".into());
    }

    let primary_name = app
        .primary_monitor()
        .ok()
        .flatten()
        .and_then(|m| m.name().map(|s| s.to_string()));

    let mut monitors = Vec::with_capacity(raw.len());
    for (i, m) in raw.into_iter().enumerate() {
        let pos = m.position();
        let size = m.size();
        let name = m.name().map(|s| s.to_string()).unwrap_or_default();
        let primary = match primary_name.as_ref() {
            Some(pn) => name == *pn,
            None => i == 0,
        };
        monitors.push(MonitorInfo {
            id: String::new(), // assigned in sort_monitors_by_origin
            label: if name.is_empty() {
                format!("Display {}", i + 1)
            } else {
                name
            },
            x: pos.x,
            y: pos.y,
            width: size.width,
            height: size.height,
            scale_factor: m.scale_factor(),
            primary,
        });
    }

    // If primary flag never matched by name, mark leftmost-top as primary fallback
    // only when exactly one claimed primary is missing.
    if !monitors.iter().any(|m| m.primary) {
        if let Some(first) = monitors.first_mut() {
            first.primary = true;
        }
    }

    build_topology(monitors)
}

#[cfg(windows)]
pub fn get_cursor_position(topology: &MonitorTopology) -> Result<CursorPosition, String> {
    use winapi::shared::windef::POINT;
    use winapi::um::winuser::GetCursorPos;

    let mut pt = POINT { x: 0, y: 0 };
    let ok = unsafe { GetCursorPos(&mut pt) };
    if ok == 0 {
        return Err("cursor_failed".into());
    }
    let monitor_id = find_monitor_for_point(&topology.monitors, pt.x, pt.y)
        .map(|m| m.id.clone())
        .unwrap_or_else(|| {
            topology
                .monitors
                .iter()
                .find(|m| m.primary)
                .map(|m| m.id.clone())
                .unwrap_or_else(|| "monitor-0".into())
        });
    Ok(CursorPosition {
        x: pt.x,
        y: pt.y,
        monitor_id,
    })
}

#[cfg(not(windows))]
pub fn get_cursor_position(_topology: &MonitorTopology) -> Result<CursorPosition, String> {
    Err("unsupported_platform".into())
}

#[cfg(windows)]
pub fn set_cursor_pos(x: i32, y: i32) -> Result<(), String> {
    use winapi::um::winuser::SetCursorPos;
    let ok = unsafe { SetCursorPos(x, y) };
    if ok == 0 {
        return Err("move_failed".into());
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn set_cursor_pos(_x: i32, _y: i32) -> Result<(), String> {
    Err("unsupported_platform".into())
}

/// Force the system cursor display count positive (undo hide-from-touch / tablet).
#[cfg(windows)]
pub fn ensure_cursor_visible() {
    use winapi::um::winuser::ShowCursor;
    unsafe {
        // ShowCursor returns the display count; keep calling until >= 0.
        for _ in 0..16 {
            if ShowCursor(1) >= 0 {
                break;
            }
        }
    }
}

#[cfg(not(windows))]
pub fn ensure_cursor_visible() {}

/// Brief XOR ring at virtual-desktop physical (x,y). Runs on a worker thread.
#[cfg(windows)]
pub fn flash_cursor_hint(x: i32, y: i32) {
    std::thread::spawn(move || unsafe {
        use std::ptr;
        use winapi::um::wingdi::{
            CreatePen, DeleteObject, Ellipse, GetStockObject, SelectObject, SetROP2, PS_SOLID,
            NULL_BRUSH, R2_NOTXORPEN,
        };
        use winapi::um::winuser::{GetDC, ReleaseDC};

        ensure_cursor_visible();
        let hdc = GetDC(ptr::null_mut());
        if hdc.is_null() {
            return;
        }
        // BGR cyan-ish accent — visible on both light/dark wallpapers via XOR.
        let pen = CreatePen(PS_SOLID as i32, 3, 0x00D4A018);
        if pen.is_null() {
            ReleaseDC(ptr::null_mut(), hdc);
            return;
        }
        let old_pen = SelectObject(hdc, pen as _);
        let old_brush = SelectObject(hdc, GetStockObject(NULL_BRUSH as i32));
        SetROP2(hdc, R2_NOTXORPEN);
        for step in 0..5i32 {
            let r = 16 + step * 12;
            Ellipse(hdc, x - r, y - r, x + r, y + r);
            winapi::um::synchapi::Sleep(38);
            Ellipse(hdc, x - r, y - r, x + r, y + r);
        }
        SelectObject(hdc, old_brush);
        SelectObject(hdc, old_pen);
        DeleteObject(pen as _);
        ReleaseDC(ptr::null_mut(), hdc);
    });
}

#[cfg(not(windows))]
pub fn flash_cursor_hint(_x: i32, _y: i32) {}

fn resolve_preferred_for_fallback(
    m: &MonitorInfo,
    preferred: Option<&PointXy>,
    fallback: Option<&str>,
) -> PointXy {
    let use_center = matches!(fallback, Some("center") | Some("centre"));
    if use_center && preferred.is_none() {
        return clamp_point_to_monitor(monitor_center(m).x, monitor_center(m).y, m);
    }
    resolve_move_target(m, preferred)
}

pub fn move_cursor_to_monitor(
    topology: &MonitorTopology,
    args: &MoveCursorToMonitorArgs,
) -> Result<PointXy, String> {
    let m = find_monitor_by_id(&topology.monitors, &args.monitor_id)
        .ok_or_else(|| "monitor_not_found".to_string())?;
    // fallback "center" with no preferred → center; preferred present → prefer last.
    let preferred = if args.fallback.as_deref() == Some("center") && args.preferred.is_none() {
        None
    } else {
        args.preferred.as_ref()
    };
    let target = resolve_preferred_for_fallback(m, preferred, args.fallback.as_deref());
    set_cursor_pos(target.x, target.y)?;
    ensure_cursor_visible();

    // Verify land; retry once if OS rejected / remapped the point.
    #[cfg(windows)]
    {
        use winapi::shared::windef::POINT;
        use winapi::um::winuser::GetCursorPos;
        let mut pt = POINT { x: 0, y: 0 };
        let ok = unsafe { GetCursorPos(&mut pt) };
        if ok != 0 && ((pt.x - target.x).abs() > 4 || (pt.y - target.y).abs() > 4) {
            let _ = set_cursor_pos(target.x, target.y);
            ensure_cursor_visible();
        }
    }

    if args.flash {
        flash_cursor_hint(target.x, target.y);
    }
    Ok(target)
}

#[cfg(windows)]
pub fn is_ctrl_down() -> bool {
    use winapi::um::winuser::{GetAsyncKeyState, VK_CONTROL};
    // High bit set => key currently down.
    unsafe { GetAsyncKeyState(VK_CONTROL) as u16 & 0x8000 != 0 }
}

#[cfg(not(windows))]
pub fn is_ctrl_down() -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mon(id: &str, x: i32, y: i32, w: u32, h: u32, scale: f64, primary: bool) -> MonitorInfo {
        MonitorInfo {
            id: id.into(),
            label: id.into(),
            x,
            y,
            width: w,
            height: h,
            scale_factor: scale,
            primary,
        }
    }

    #[test]
    fn sort_assigns_ids_left_to_right_with_negative_origin() {
        let topo = build_topology(vec![
            mon("", 0, 0, 1920, 1080, 1.0, true),
            mon("", -1920, 0, 1920, 1080, 1.0, false),
            mon("", 1920, 0, 1920, 1080, 1.25, false),
        ])
        .expect("topo");
        assert_eq!(topo.monitors[0].id, "monitor-0");
        assert_eq!(topo.monitors[0].x, -1920);
        assert_eq!(topo.monitors[1].id, "monitor-1");
        assert_eq!(topo.monitors[1].x, 0);
        assert_eq!(topo.monitors[2].id, "monitor-2");
        assert_eq!(topo.monitors[2].x, 1920);
        assert_eq!(topo.virtual_bounds.x, -1920);
        assert_eq!(topo.virtual_bounds.width, 5760);
        assert!(topo.fingerprint.contains("-1920|0|1920|1080|1.0000"));
    }

    #[test]
    fn fingerprint_changes_when_dpi_or_layout_changes() {
        let a = build_topology(vec![
            mon("", -1920, 0, 1920, 1080, 1.0, false),
            mon("", 0, 0, 1920, 1080, 1.0, true),
        ])
        .unwrap();
        let b = build_topology(vec![
            mon("", -1920, 0, 1920, 1080, 1.25, false),
            mon("", 0, 0, 1920, 1080, 1.0, true),
        ])
        .unwrap();
        assert_ne!(a.fingerprint, b.fingerprint);
    }

    #[test]
    fn point_in_monitor_supports_negative_x() {
        let m = mon("monitor-0", -1920, 0, 1920, 1080, 1.0, false);
        assert!(point_in_monitor(-100, 500, &m));
        assert!(point_in_monitor(-1, 0, &m)); // right edge exclusive → still on left
        assert!(!point_in_monitor(0, 500, &m)); // primary starts at x=0
        assert!(point_in_monitor(-1920, 0, &m));
    }

    #[test]
    fn resolve_preferred_when_inside_else_center() {
        let m = mon("monitor-2", 1920, 0, 1920, 1080, 1.0, false);
        let inside = resolve_move_target(
            &m,
            Some(&PointXy {
                x: 2400,
                y: 520,
            }),
        );
        assert_eq!(inside, PointXy { x: 2400, y: 520 });

        let outside = resolve_move_target(
            &m,
            Some(&PointXy {
                x: 100,
                y: 100,
            }),
        );
        assert_eq!(outside, monitor_center(&m));
        assert_eq!(outside.x, 1920 + 960);
        assert_eq!(outside.y, 540);
    }

    #[test]
    fn clamp_keeps_point_inside_negative_monitor() {
        let m = mon("monitor-0", -1920, 0, 1920, 1080, 1.0, false);
        let c = clamp_point_to_monitor(-5000, -50, &m);
        assert_eq!(c.x, -1920);
        assert_eq!(c.y, 0);
        let c2 = clamp_point_to_monitor(0, 2000, &m);
        assert_eq!(c2.x, -1);
        assert_eq!(c2.y, 1079);
    }

    #[test]
    fn empty_monitors_error() {
        assert_eq!(build_topology(vec![]).unwrap_err(), "no_monitors");
    }

    #[test]
    fn find_monitor_for_point_three_wide() {
        let topo = build_topology(vec![
            mon("", -1920, 0, 1920, 1080, 1.0, false),
            mon("", 0, 0, 1920, 1080, 1.0, true),
            mon("", 1920, 0, 1920, 1080, 1.0, false),
        ])
        .unwrap();
        assert_eq!(
            find_monitor_for_point(&topo.monitors, -100, 10)
                .unwrap()
                .id,
            "monitor-0"
        );
        assert_eq!(
            find_monitor_for_point(&topo.monitors, 100, 10)
                .unwrap()
                .id,
            "monitor-1"
        );
        assert_eq!(
            find_monitor_for_point(&topo.monitors, 2000, 10)
                .unwrap()
                .id,
            "monitor-2"
        );
    }
}
