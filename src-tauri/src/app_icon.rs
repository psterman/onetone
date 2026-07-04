use tauri::image::Image;

/// 256px window / taskbar icon — explicit so the shell does not upscale a smaller ICO frame.
pub fn window_icon() -> tauri::Result<Image<'static>> {
    let bytes = include_bytes!("../icons/icon.png");
    let img = image::load_from_memory(bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    Ok(Image::new_owned(rgba.into_raw(), width, height))
}

pub fn apply_window_icon(
    window: &tauri::WebviewWindow,
) -> tauri::Result<()> {
    window.set_icon(window_icon()?)
}
