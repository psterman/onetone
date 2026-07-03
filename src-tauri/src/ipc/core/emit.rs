use tauri::Emitter;

/// Emit to the webview on the main thread (safe from hotkey/voice/watcher threads).
pub fn emit_to_js_main(window: &tauri::WebviewWindow, payload: serde_json::Value) {
    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = win.emit("to_js", &payload);
    });
}

pub fn emit_to_js_main_t<T: serde::Serialize + Send + 'static>(
    window: &tauri::WebviewWindow,
    payload: T,
) {
    let win = window.clone();
    let _ = window.run_on_main_thread(move || {
        let _ = win.emit("to_js", &payload);
    });
}
