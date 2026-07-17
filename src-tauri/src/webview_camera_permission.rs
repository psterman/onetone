//! Allow WebView2 camera capture for Glance local preview (Windows).
//!
//! Tauri/wry only auto-allows clipboard via PermissionRequested; camera
//! requests otherwise stay denied / dialog-blocked for custom asset origins,
//! so getUserMedia never yields a real MediaStream.

#[cfg(windows)]
pub fn install_camera_permission_allow(window: &tauri::WebviewWindow) {
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2Controller, COREWEBVIEW2_PERMISSION_KIND,
            COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
            COREWEBVIEW2_PERMISSION_STATE_ALLOW,
        },
        PermissionRequestedEventHandler,
    };

    let result = window.with_webview(|platform| {
        unsafe {
            let controller: ICoreWebView2Controller = platform.controller();
            let Ok(core) = controller.CoreWebView2() else {
                return;
            };
            let mut token = 0i64;
            let handler = PermissionRequestedEventHandler::create(Box::new(move |_sender, args| {
                let Some(args) = args else {
                    return Ok(());
                };
                let mut kind = COREWEBVIEW2_PERMISSION_KIND::default();
                args.PermissionKind(&mut kind)?;
                if kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                    || kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                {
                    // Local Glance preview only — grant capture so getUserMedia can proceed.
                    args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                }
                Ok(())
            }));
            let _ = core.add_PermissionRequested(&handler, &mut token);
        }
    });

    if let Err(err) = result {
        eprintln!("webview camera permission hook failed: {err}");
    }
}

#[cfg(not(windows))]
pub fn install_camera_permission_allow(_window: &tauri::WebviewWindow) {}
