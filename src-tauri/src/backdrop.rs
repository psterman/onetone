//! 原生窗口背景（Mica / Acrylic / Blur / Vibrancy）降级链。
//! 失败时前端 WebGlass + 实色 M3 兜底。

/// V3 稳定版：使用 Windows 原生标题栏，不应用 Mica / Acrylic。
pub const CUSTOM_TITLEBAR: bool = false;

/// 返回模式标识；V3 不调用 window-vibrancy。
pub fn apply_native_backdrop(_window: &tauri::WebviewWindow, _dark: Option<bool>) -> String {
    "solid".into()
}

pub fn sync_backdrop_theme(_window: &tauri::WebviewWindow, _theme: &str) {}
