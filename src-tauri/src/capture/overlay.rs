//! Full-screen capture overlay window (freeze + picker UI).

use std::sync::Mutex;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use super::types::RectPx;

pub const LABEL: &str = "smart_capture_overlay";

#[derive(Debug, Clone, Copy)]
struct ShellChromeSnap {
    main_visible: bool,
    pad_visible: bool,
}

static SHELL_SNAP: Mutex<Option<ShellChromeSnap>> = Mutex::new(None);

pub fn close_overlay(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(LABEL) {
        let _ = win.hide();
        let _ = win.close();
    }
}

fn take_shell_snap(app: &AppHandle) -> ShellChromeSnap {
    let main_visible = app
        .get_webview_window("main")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    let pad_visible = app
        .get_webview_window("codex_micro_overlay")
        .and_then(|w| w.is_visible().ok())
        .unwrap_or(false);
    ShellChromeSnap {
        main_visible,
        pad_visible,
    }
}

/// Hide main / Soft Pad before screen grab. First call snapshots chrome.
pub fn hide_shell_chrome(app: &AppHandle) {
    {
        let mut g = SHELL_SNAP.lock().unwrap_or_else(|e| e.into_inner());
        if g.is_none() {
            *g = Some(take_shell_snap(app));
        }
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    if let Some(pad) = app.get_webview_window("codex_micro_overlay") {
        let _ = pad.set_ignore_cursor_events(true);
        let _ = pad.hide();
    }
}

/// Open overlay covering `cover`. Optionally inject freeze data-URL before show (avoids black flash).
pub fn open_overlay(
    app: &AppHandle,
    cover: Option<RectPx>,
    freeze_data_url: Option<&str>,
) -> Result<WebviewWindow, String> {
    close_overlay(app);
    hide_shell_chrome(app);

    let win = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::App("smart-capture-overlay.html".into()))
        .title("")
        .inner_size(1280.0, 800.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()
        .map_err(|e| format!("overlay_build:{e}"))?;

    let _ = crate::overlay_window::configure_transparent_overlay(&win);
    cover_rect(&win, cover);

    // Seed freeze before first paint so the dark body never flashes.
    if let Some(url) = freeze_data_url.filter(|s| !s.is_empty()) {
        let payload = serde_json::to_string(url).unwrap_or_else(|_| "\"\"".into());
        let js = format!(
            "try{{window.__OT_FREEZE__={payload};document.documentElement.style.background='transparent';document.body&&(document.body.style.background='transparent');}}catch(e){{}}",
            payload = payload
        );
        let _ = win.eval(&js);
    }

    let _ = win.set_ignore_cursor_events(false);
    let _ = win.show();
    let _ = win.set_always_on_top(true);
    let _ = win.set_focus();

    let win2 = win.clone();
    let _ = std::thread::Builder::new()
        .name("smart-cap-ontop".into())
        .spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let _ = win2.set_ignore_cursor_events(false);
            let _ = win2.set_always_on_top(true);
            let _ = win2.set_focus();
        });
    Ok(win)
}

pub fn restore_shell(app: &AppHandle) {
    let snap = {
        let mut g = SHELL_SNAP.lock().unwrap_or_else(|e| e.into_inner());
        g.take()
    };
    let Some(snap) = snap else {
        return;
    };
    if let Some(main) = app.get_webview_window("main") {
        if snap.main_visible {
            let _ = main.show();
        } else {
            let _ = main.hide();
        }
    }
    if let Some(pad) = app.get_webview_window("codex_micro_overlay") {
        let _ = pad.set_ignore_cursor_events(crate::codex_micro_overlay::soft_pad_click_through());
        if snap.pad_visible {
            let _ = pad.show();
        } else {
            let _ = pad.hide();
        }
    }
}

fn cover_rect(win: &WebviewWindow, cover: Option<RectPx>) {
    use tauri::{LogicalPosition, LogicalSize, Position, Size};
    if let Some(r) = cover.filter(|r| r.w >= 64 && r.h >= 64) {
        let _ = win.set_size(Size::Physical(tauri::PhysicalSize::new(r.w, r.h)));
        let _ = win.set_position(Position::Physical(tauri::PhysicalPosition::new(r.x, r.y)));
        return;
    }
    let mon = win
        .primary_monitor()
        .ok()
        .flatten()
        .or_else(|| win.current_monitor().ok().flatten());
    if let Some(mon) = mon {
        let size = mon.size();
        let pos = mon.position();
        let _ = win.set_size(Size::Physical(tauri::PhysicalSize::new(size.width, size.height)));
        let _ = win.set_position(Position::Physical(tauri::PhysicalPosition::new(pos.x, pos.y)));
        return;
    }
    let _ = win.set_size(Size::Logical(LogicalSize::new(1280.0, 800.0)));
    let _ = win.set_position(Position::Logical(LogicalPosition::new(0.0, 0.0)));
}
