//! Lazy-create overlay webviews (tray / coach HUD / Soft Pad).
//! Kept out of `tauri.conf.json` so cold start only pays for `main`.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Copy)]
pub struct OverlayWindowOpts {
    pub label: &'static str,
    pub url: &'static str,
    pub width: f64,
    pub height: f64,
}

pub const TRAY_MENU: OverlayWindowOpts = OverlayWindowOpts {
    label: "tray_menu",
    url: "tray-menu.html",
    width: 316.0,
    height: 520.0,
};

pub const COACH_HUD: OverlayWindowOpts = OverlayWindowOpts {
    label: "coach_hud",
    url: "coach-hud.html",
    width: 360.0,
    height: 88.0,
};

pub const CODEX_MICRO_OVERLAY: OverlayWindowOpts = OverlayWindowOpts {
    label: "codex_micro_overlay",
    url: "codex-micro-overlay.html",
    width: 432.0,
    height: 680.0,
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
    let win = WebviewWindowBuilder::new(app, opts.label, WebviewUrl::App(opts.url.into()))
        .title("")
        .inner_size(opts.width, opts.height)
        .resizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible(false)
        .build()?;
    Ok((win, true))
}

pub fn configure_transparent_overlay(win: &WebviewWindow) -> tauri::Result<()> {
    win.set_background_color(Some(tauri::webview::Color(0, 0, 0, 0)))?;
    let _ = win.set_shadow(false);
    let _ = win.set_skip_taskbar(true);
    Ok(())
}
