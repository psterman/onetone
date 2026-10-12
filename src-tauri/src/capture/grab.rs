//! Screen grab via xcap (Windows/macOS). Returns RGBA bytes + monitor metadata.

use super::types::{MonitorInfo, RectPx};

#[derive(Debug, Clone)]
pub struct GrabbedFrame {
    pub width: u32,
    pub height: u32,
    /// Row-major RGBA8.
    pub rgba: Vec<u8>,
    pub monitor: MonitorInfo,
}

#[derive(Debug, Clone)]
pub struct GrabBundle {
    pub frame: GrabbedFrame,
    pub monitors: Vec<MonitorInfo>,
    pub active_index: u32,
    /// Foreground window client rect in virtual-desktop physical pixels (best-effort).
    pub fg_client: Option<RectPx>,
    /// Top-level windows intersecting the capture surface (excludes our PID).
    pub windows: Vec<RectPx>,
}

/// Peek FG client rect **before** hiding OneTone chrome (hide steals FG).
pub fn peek_fg_client_rect() -> Option<RectPx> {
    fg_window_client_rect()
}

/// Capture preferred monitor, or stitch all monitors when multi-display.
/// `fg_override`: FG rect snapped before chrome hide; if None, peek again after grab.
pub fn grab_for_session(
    prefer_index: Option<u32>,
    fg_override: Option<RectPx>,
) -> Result<GrabBundle, String> {
    #[cfg(any(target_os = "windows", target_os = "macos"))]
    {
        grab_xcap(prefer_index, fg_override)
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        let _ = (prefer_index, fg_override);
        Err("unsupported_platform".into())
    }
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn grab_xcap(
    prefer_index: Option<u32>,
    fg_override: Option<RectPx>,
) -> Result<GrabBundle, String> {
    use xcap::Monitor;

    let monitors = Monitor::all().map_err(|e| format!("monitor_list:{e}"))?;
    if monitors.is_empty() {
        return Err("no_monitors".into());
    }

    let mut infos: Vec<MonitorInfo> = Vec::new();
    for (i, m) in monitors.iter().enumerate() {
        let x = m.x().map_err(|e| e.to_string())? as i32;
        let y = m.y().map_err(|e| e.to_string())? as i32;
        let w = m.width().map_err(|e| e.to_string())?;
        let h = m.height().map_err(|e| e.to_string())?;
        let scale = m.scale_factor().unwrap_or(1.0) as f32;
        let is_primary = m.is_primary().unwrap_or(i == 0);
        infos.push(MonitorInfo {
            index: i as u32,
            rect_px: RectPx::new(x, y, w, h),
            scale,
            is_primary,
        });
    }

    let fg_client = fg_override.or_else(fg_window_client_rect);

    let active_index = prefer_index
        .filter(|&i| (i as usize) < monitors.len())
        .or_else(|| {
            fg_client.and_then(|fg| {
                let cx = fg.x + (fg.w as i32) / 2;
                let cy = fg.y + (fg.h as i32) / 2;
                infos
                    .iter()
                    .find(|m| {
                        cx >= m.rect_px.x
                            && cy >= m.rect_px.y
                            && cx < m.rect_px.x + m.rect_px.w as i32
                            && cy < m.rect_px.y + m.rect_px.h as i32
                    })
                    .map(|m| m.index)
            })
        })
        .or_else(|| infos.iter().find(|m| m.is_primary).map(|m| m.index))
        .unwrap_or(0);

    // Multi-monitor → stitch full virtual desktop (no screen1/screen2 split for the user).
    let (frame, surface) = if infos.len() > 1 {
        grab_virtual(&monitors, &infos)?
    } else {
        let mon = &monitors[active_index as usize];
        let img = mon
            .capture_image()
            .map_err(|e| format!("capture_image:{e}"))?;
        let width = img.width();
        let height = img.height();
        let rgba = img.into_raw();
        let info = infos[active_index as usize].clone();
        let surface = info.rect_px;
        (
            GrabbedFrame {
                width,
                height,
                rgba,
                monitor: info,
            },
            surface,
        )
    };

    let windows = top_level_windows_on(surface);

    Ok(GrabBundle {
        frame,
        monitors: infos,
        active_index,
        fg_client,
        windows,
    })
}

#[cfg(any(target_os = "windows", target_os = "macos"))]
fn grab_virtual(
    monitors: &[xcap::Monitor],
    infos: &[MonitorInfo],
) -> Result<(GrabbedFrame, RectPx), String> {
    let union = union_of(infos.iter().map(|m| m.rect_px));
    let w = union.w;
    let h = union.h;
    let mut rgba = vec![0u8; (w as usize) * (h as usize) * 4];

    for (i, mon) in monitors.iter().enumerate() {
        let info = &infos[i];
        let img = mon
            .capture_image()
            .map_err(|e| format!("capture_image:{e}"))?;
        let iw = img.width();
        let ih = img.height();
        let src = img.into_raw();
        let ox = info.rect_px.x - union.x;
        let oy = info.rect_px.y - union.y;
        blit_rgba(&mut rgba, w, h, &src, iw, ih, ox, oy);
    }

    let synthetic = MonitorInfo {
        index: 0,
        rect_px: union,
        scale: infos
            .iter()
            .find(|m| m.is_primary)
            .map(|m| m.scale)
            .unwrap_or(1.0),
        is_primary: true,
    };
    Ok((
        GrabbedFrame {
            width: w,
            height: h,
            rgba,
            monitor: synthetic,
        },
        union,
    ))
}

fn union_of(rects: impl Iterator<Item = RectPx>) -> RectPx {
    let mut min_x = i32::MAX;
    let mut min_y = i32::MAX;
    let mut max_x = i32::MIN;
    let mut max_y = i32::MIN;
    let mut any = false;
    for r in rects {
        any = true;
        min_x = min_x.min(r.x);
        min_y = min_y.min(r.y);
        max_x = max_x.max(r.x + r.w as i32);
        max_y = max_y.max(r.y + r.h as i32);
    }
    if !any {
        return RectPx::new(0, 0, 1, 1);
    }
    RectPx::new(
        min_x,
        min_y,
        (max_x - min_x).max(1) as u32,
        (max_y - min_y).max(1) as u32,
    )
}

fn blit_rgba(
    dst: &mut [u8],
    dw: u32,
    dh: u32,
    src: &[u8],
    sw: u32,
    sh: u32,
    ox: i32,
    oy: i32,
) {
    for row in 0..sh {
        let dy = oy + row as i32;
        if dy < 0 || dy >= dh as i32 {
            continue;
        }
        for col in 0..sw {
            let dx = ox + col as i32;
            if dx < 0 || dx >= dw as i32 {
                continue;
            }
            let si = ((row * sw + col) * 4) as usize;
            let di = ((dy as u32 * dw + dx as u32) * 4) as usize;
            if si + 3 < src.len() && di + 3 < dst.len() {
                dst[di..di + 4].copy_from_slice(&src[si..si + 4]);
            }
        }
    }
}

fn top_level_windows_on(surface: RectPx) -> Vec<RectPx> {
    #[cfg(windows)]
    {
        enum_top_level_windows(surface)
    }
    #[cfg(not(windows))]
    {
        let _ = surface;
        Vec::new()
    }
}

#[cfg(windows)]
fn client_rect_of(hwnd: winapi::shared::windef::HWND) -> Option<RectPx> {
    use winapi::shared::windef::{POINT, RECT};
    use winapi::um::winuser::{ClientToScreen, GetClientRect};
    unsafe {
        let mut rc = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetClientRect(hwnd, &mut rc) == 0 {
            return None;
        }
        let mut pt = POINT {
            x: rc.left,
            y: rc.top,
        };
        if ClientToScreen(hwnd, &mut pt) == 0 {
            return None;
        }
        let w = (rc.right - rc.left).max(0) as u32;
        let h = (rc.bottom - rc.top).max(0) as u32;
        if w < 80 || h < 80 {
            return None;
        }
        Some(RectPx::new(pt.x, pt.y, w, h))
    }
}

#[cfg(windows)]
fn fg_window_client_rect() -> Option<RectPx> {
    use winapi::shared::minwindef::{BOOL, DWORD, LPARAM, TRUE};
    use winapi::shared::windef::HWND;
    use winapi::um::processthreadsapi::GetCurrentProcessId;
    use winapi::um::winuser::{
        EnumWindows, GetForegroundWindow, GetWindowLongW, GetWindowThreadProcessId, IsIconic,
        IsWindowVisible, GWL_EXSTYLE, WS_EX_TOOLWINDOW,
    };

    unsafe {
        let our_pid = GetCurrentProcessId();
        let try_hwnd = |hwnd: HWND| -> Option<RectPx> {
            if hwnd.is_null() || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
                return None;
            }
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            if ex & WS_EX_TOOLWINDOW != 0 {
                return None;
            }
            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 || pid == our_pid {
                return None;
            }
            client_rect_of(hwnd)
        };

        if let Some(r) = try_hwnd(GetForegroundWindow()) {
            return Some(r);
        }

        // Home / Soft Pad / tray click → FG is OneTone; take next visible non-own top-level.
        struct Ctx {
            our_pid: DWORD,
            found: Option<RectPx>,
        }
        unsafe extern "system" fn enum_cb(hwnd: HWND, lp: LPARAM) -> BOOL {
            let ctx = &mut *(lp as *mut Ctx);
            if ctx.found.is_some() {
                return TRUE;
            }
            if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
                return TRUE;
            }
            let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
            if ex & WS_EX_TOOLWINDOW != 0 {
                return TRUE;
            }
            let mut pid: DWORD = 0;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 || pid == ctx.our_pid {
                return TRUE;
            }
            if let Some(r) = client_rect_of(hwnd) {
                ctx.found = Some(r);
            }
            TRUE
        }
        let mut ctx = Ctx {
            our_pid,
            found: None,
        };
        let _ = EnumWindows(Some(enum_cb), &mut ctx as *mut _ as LPARAM);
        ctx.found
    }
}

#[cfg(windows)]
fn window_rect_of(hwnd: winapi::shared::windef::HWND) -> Option<RectPx> {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::GetWindowRect;
    unsafe {
        let mut rc = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rc) == 0 {
            return None;
        }
        if rc.left < -10_000 || rc.top < -10_000 {
            return None;
        }
        let w = (rc.right - rc.left).max(0) as u32;
        let h = (rc.bottom - rc.top).max(0) as u32;
        if w < 80 || h < 60 {
            return None;
        }
        Some(RectPx::new(rc.left, rc.top, w, h))
    }
}

#[cfg(windows)]
fn enum_top_level_windows(surface: RectPx) -> Vec<RectPx> {
    use winapi::shared::minwindef::{BOOL, DWORD, LPARAM, TRUE};
    use winapi::shared::windef::HWND;
    use winapi::um::processthreadsapi::GetCurrentProcessId;
    use winapi::um::winuser::{
        EnumWindows, GetWindow, GetWindowLongW, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
        GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    };

    struct Ctx {
        our_pid: DWORD,
        surface: RectPx,
        out: Vec<RectPx>,
    }

    unsafe extern "system" fn enum_cb(hwnd: HWND, lp: LPARAM) -> BOOL {
        let ctx = &mut *(lp as *mut Ctx);
        if ctx.out.len() >= 24 {
            return TRUE;
        }
        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return TRUE;
        }
        // Owned popups / tool windows — skip (same as workspace_layout).
        if !GetWindow(hwnd, GW_OWNER).is_null() {
            return TRUE;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if ex & WS_EX_TOOLWINDOW != 0 {
            return TRUE;
        }
        let mut pid: DWORD = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || pid == ctx.our_pid {
            return TRUE;
        }
        // Outer frame (title bar included) — matches what users see / PixPin window snap.
        if let Some(r) = window_rect_of(hwnd).or_else(|| client_rect_of(hwnd)) {
            let s = ctx.surface;
            let overlaps = r.x < s.x + s.w as i32
                && r.x + r.w as i32 > s.x
                && r.y < s.y + s.h as i32
                && r.y + r.h as i32 > s.y;
            if overlaps {
                ctx.out.push(r);
            }
        }
        TRUE
    }

    unsafe {
        let mut ctx = Ctx {
            our_pid: GetCurrentProcessId(),
            surface,
            out: Vec::new(),
        };
        let _ = EnumWindows(Some(enum_cb), &mut ctx as *mut _ as LPARAM);
        ctx.out
    }
}

#[cfg(not(windows))]
fn fg_window_client_rect() -> Option<RectPx> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn union_two_monitors() {
        let u = union_of(
            [
                RectPx::new(0, 0, 1920, 1080),
                RectPx::new(1920, 0, 1280, 1024),
            ]
            .into_iter(),
        );
        assert_eq!(u, RectPx::new(0, 0, 3200, 1080));
    }

    #[test]
    fn blit_offset() {
        let mut dst = vec![0u8; 4 * 4 * 4];
        let src = vec![255u8, 0, 0, 255]; // 1x1 red
        blit_rgba(&mut dst, 4, 4, &src, 1, 1, 1, 1);
        assert_eq!(&dst[20..24], &[255, 0, 0, 255]);
    }
}
