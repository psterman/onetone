//! Lazy-create overlay webviews (tray / coach HUD / Soft Pad).
//! Kept out of `tauri.conf.json` so cold start only pays for `main`.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Copy)]
pub struct OverlayWindowOpts {
    pub label: &'static str,
    pub url: &'static str,
    pub width: f64,
    pub height: f64,
    /// Soft Pad needs HTML5 text DnD; Tauri's native handler blocks it (prohibited cursor).
    pub html5_drag_drop: bool,
    pub skip_taskbar: bool,
    pub always_on_top: bool,
    pub resizable: bool,
    pub transparent: bool,
}

pub const TRAY_MENU: OverlayWindowOpts = OverlayWindowOpts {
    label: "tray_menu",
    url: "tray-menu.html",
    width: 316.0,
    height: 520.0,
    html5_drag_drop: false,
    skip_taskbar: true,
    always_on_top: true,
    resizable: false,
    transparent: true,
};

pub const COACH_HUD: OverlayWindowOpts = OverlayWindowOpts {
    label: "coach_hud",
    url: "coach-hud.html",
    width: 360.0,
    height: 88.0,
    html5_drag_drop: false,
    skip_taskbar: true,
    always_on_top: true,
    resizable: false,
    transparent: true,
};

pub const CODEX_MICRO_OVERLAY: OverlayWindowOpts = OverlayWindowOpts {
    label: "codex_micro_overlay",
    url: "codex-micro-overlay.html",
    width: 432.0,
    // Keep in sync with OVERLAY_HEIGHT_FULL in codex_micro_overlay.rs
    height: 680.0,
    html5_drag_drop: true,
    skip_taskbar: true,
    always_on_top: true,
    resizable: false,
    transparent: true,
};

/// OneTone-owned WorkBuddy local chat (streaming). Not WorkBuddy.exe.
pub const WORKBUDDY_LOCAL_CHAT: OverlayWindowOpts = OverlayWindowOpts {
    label: "workbuddy_local_chat",
    url: "workbuddy-local-chat.html",
    width: 440.0,
    height: 640.0,
    html5_drag_drop: false,
    skip_taskbar: false,
    always_on_top: true,
    resizable: true,
    transparent: false,
};

/// Return existing overlay window or create one matching former tauri.conf entries.
/// `Ok((win, created))` — `created` is true when this call built a new webview.
pub fn ensure_overlay_window(
    app: &AppHandle,
    opts: OverlayWindowOpts,
) -> tauri::Result<(WebviewWindow, bool)> {
    if let Some(win) = app.get_webview_window(opts.label) {
        return Ok((win, false));
    }
    let title = if opts.label == WORKBUDDY_LOCAL_CHAT.label {
        "WorkBuddy 本机对话"
    } else {
        ""
    };
    let mut builder = WebviewWindowBuilder::new(app, opts.label, WebviewUrl::App(opts.url.into()))
        .title(title)
        .inner_size(opts.width, opts.height)
        .resizable(opts.resizable)
        .decorations(false)
        .transparent(opts.transparent)
        .shadow(!opts.transparent)
        .always_on_top(opts.always_on_top)
        .skip_taskbar(opts.skip_taskbar)
        .visible(false);
    // Mutually exclusive with Tauri file-drop events — required for text/plain HTML5 drop.
    if opts.html5_drag_drop {
        builder = builder.disable_drag_drop_handler();
    }
    let win = builder.build()?;
    Ok((win, true))
}

pub fn configure_transparent_overlay(win: &WebviewWindow) -> tauri::Result<()> {
    win.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)))?;
    let _ = win.set_shadow(false);
    let _ = win.set_skip_taskbar(true);
    Ok(())
}
